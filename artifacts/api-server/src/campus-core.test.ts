import test, { after } from "node:test";
import assert from "node:assert/strict";
import { apiBase } from "./test-helpers";
import { randomUUID } from "node:crypto";
import express from "express";
import { pool } from "@workspace/db";
import { normalizeUsername, usernameError, safeLink, academicEntry } from "./lib/validation";
import { sanitizeImage } from "./lib/image-safety";
import { validateStaffTarget, applyStaffRole, staffTransaction } from "./lib/staff-access";
import { db, profilesTable as profiles, accessRequestsTable, auditTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import healthRouter from "./routes/health";

const base = apiBase;
const healthApp = express();
healthApp.use(healthRouter);
after(async () => { await pool.end(); });

test("Railway health check confirms the database is reachable", async () => {
  const server = healthApp.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  }
});

test("Username normalization is case-insensitive", () => {
  assert.equal(normalizeUsername("  Student_Name  "), "student_name");
});
test("Usernames reject reserved names, leading digits, invalid characters and length", () => {
  for (const name of ["admin", "admin_1", "support", "campuscore", "a", "3student", "student name", "a".repeat(25)]) assert.ok(usernameError(name), name);
  for (const name of ["student_2026", "ade", "student_name"]) assert.equal(usernameError(name), null);
});
test("User-supplied links reject executable and invalid schemes", () => {
  for (const link of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "not-a-link"]) assert.equal(safeLink(link), false);
  assert.equal(safeLink("https://uniosun.edu.ng/"), true);
  assert.equal(safeLink(""), true);
});
test("Public counts are genuine zeroes in a new platform", async () => {
  const response = await fetch(`${base}/summary`);
  assert.equal(response.status, 200);
  const summary = await response.json() as { counts: Record<string, number>; paymentsEnabled: boolean; aiEnabled: boolean; messagingEnabled: boolean };
  const { rows } = await pool.query("select kind, count(*)::int as count from listings l join profiles p on p.id=l.owner_id where l.status='published' and not l.hidden and l.deleted_at is null and not p.suspended group by kind");
  for (const [kind, value] of Object.entries(summary.counts)) assert.equal(value, rows.find(row => row.kind === kind)?.count ?? 0);
  assert.equal(summary.paymentsEnabled, false);
  assert.equal(summary.aiEnabled, false);
  assert.equal(summary.messagingEnabled, true);
});
test("University search uses sourced database records", async () => {
  const response = await fetch(`${base}/directory?kind=university&q=Osun%20State%20University`);
  assert.equal(response.status, 200);
  const rows = await response.json() as { id: number; sourceUrl: string; name: string }[];
  assert.ok(rows.length > 0);
  assert.ok(rows.every(row => row.sourceUrl.startsWith("https://www.nuc.edu.ng/")));
});
test("Dependent directory queries do not leak departments from another university", async () => {
  const { rows: [faculty] } = await pool.query("select id,parent_id from academic_directory where kind='faculty' limit 1");
  assert.ok(faculty);
  const response = await fetch(`${base}/directory?kind=department&parentId=${faculty.id}`);
  const departments = await response.json() as { parentId: number }[];
  assert.ok(departments.length);
  assert.ok(departments.every(row => row.parentId === faculty.id));
  await assert.rejects(academicEntry(faculty.id, "faculty", -1));
});
test("Unknown directory records are not invented", async () => {
  const response = await fetch(`${base}/directory?kind=university&q=__nonexistent_university_${randomUUID()}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});
test("False mine filter stays public rather than requiring login", async () => {
  const response = await fetch(`${base}/listings?mine=false&saved=false`);
  assert.equal(response.status, 200);
  const body = await response.json() as { items: unknown[]; total: number };
  assert.ok(Array.isArray(body.items));
  assert.equal(typeof body.total, "number");
});
test("Malformed filter values fail explicitly", async () => {
  for (const query of ["kind=invalid", "minPrice=-1", "page=0", "mine=perhaps"]) {
    const response = await fetch(`${base}/listings?${query}`);
    assert.equal(response.status, 400, query);
  }
});
test("Missing listing returns 404 rather than fake content", async () => {
  assert.equal((await fetch(`${base}/listings/2147483647`)).status, 404);
});
test("Username availability rejects admin impersonation", async () => {
  const response = await fetch(`${base}/usernames/availability?username=ADMIN`);
  const data = await response.json() as { username: string; available: boolean };
  assert.equal(data.username, "admin");
  assert.equal(data.available, false);
});
for (const [method, path] of [
  ["GET", "/profile"], ["PUT", "/profile"], ["POST", "/directory/requests"],
  ["GET", "/listings?mine=true"], ["GET", "/listings?saved=true"], ["POST", "/listings"],
  ["PUT", "/listings/1"], ["DELETE", "/listings/1"], ["POST", "/listings/1/save"],
  ["POST", "/reports"], ["POST", "/storage/uploads/request-url"], ["POST", "/storage/uploads/complete"],
  ["GET", "/admin/overview"], ["POST", "/admin/actions"], ["POST", "/admin/directory"],
  ["GET", "/admin/access"], ["POST", "/admin/access/roles"], ["POST", "/admin/access/requests"],
  ["POST", "/admin/access/requests/1/decision"],
  ["POST", "/admin/directory/import-nigeria"],
]) {
  test(`Anonymous ${method} ${path} is rejected`, async () => {
    const response = await fetch(`${base}${path}`, { method, ...(method === "GET" ? {} : { headers: { "Content-Type": "application/json" }, body: "{}" }) });
    assert.equal(response.status, 401);
  });
}
test("Cross-origin writes are rejected before any state change", async () => {
  const response = await fetch(`${base}/listings`, { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(response.status, 403);
});
test("Nonexistent or unfinalized image cannot be served", async () => {
  assert.equal((await fetch(`${base}/storage/objects/uploads/${randomUUID()}`)).status, 404);
});
test("Database unique constraint protects usernames; fixtures always roll back", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const username = `test_${suffix}`;
    await client.query("insert into profiles(id,username) values ($1,$2)", [`fixture_${suffix}`, username]);
    await client.query("SAVEPOINT duplicate_check");
    await assert.rejects(client.query("insert into profiles(id,username) values ($1,$2)", [`fixture_other_${suffix}`, username]), (err: unknown) => (err as { code: string }).code === "23505");
    await client.query("ROLLBACK TO SAVEPOINT duplicate_check");
    await client.query("SAVEPOINT casing_check");
    await assert.rejects(client.query("insert into profiles(id,username) values ($1,$2)", [`fixture_case_${suffix}`, username.toUpperCase()]), (err: unknown) => (err as { code: string }).code === "23514");
    await client.query("ROLLBACK TO SAVEPOINT casing_check");
    const { rows: [row] } = await client.query("select role from profiles where id=$1", [`fixture_${suffix}`]);
    assert.equal(row.role, "student", "New profiles must never default to admin");
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
});
test("Row-level security is enabled for all application tables", async () => {
  const { rows } = await pool.query("select relname,relrowsecurity from pg_class where relname = any($1::text[])", [["academic_directory", "institution_requests", "profiles", "listings", "saved_listings", "reports", "audit_log", "uploads", "access_requests"]]);
  assert.equal(rows.length, 9);
  assert.ok(rows.every(row => row.relrowsecurity), "Only the server database owner bypasses RLS; there are no public policies");
});
test("Corrupt images cannot pass by supplying only a valid header", async () => {
  await assert.rejects(sanitizeImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
  await assert.rejects(sanitizeImage(Buffer.alloc(5 * 1024 * 1024 + 1)));
});
test("Valid image is decoded, resized, metadata-stripped and safely re-encoded", async () => {
  const png = await sharp({ create: { width: 1800, height: 900, channels: 3, background: "purple" } }).png().toBuffer();
  const output = await sanitizeImage(png);
  const meta = await sharp(output).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 1600);
  assert.equal(meta.height, 800);
  assert.equal(meta.exif, undefined);
});
test("The verified owner is bound privately and protected by a unique database constraint", async () => {
  const { rows } = await pool.query("select id,username,role from profiles where role='owner'");
  assert.equal(rows.length, 1);
  const owner = rows[0];
  if (owner.username) {
    const response = await fetch(`${base}/profiles/${owner.username}`);
    assert.equal(response.status, 200);
    const profile = await response.json() as Record<string, unknown>;
    for (const field of ["role", "email", "emailAddress", "id", "suspended"]) assert.equal(field in profile, false, field);
    assert.equal(JSON.stringify(profile).includes(process.env.PLATFORM_OWNER_EMAIL ?? "__missing__"), false);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assert.rejects(client.query("insert into profiles(id,role) values ($1,'owner')", [`fixture_${randomUUID()}`]), (err: unknown) => (err as {code: string}).code === "23505");
  } finally { await client.query("ROLLBACK"); client.release(); }
});
test("Unknown actors cannot run owner-only role operations", async () => {
  await assert.rejects(staffTransaction(`missing_${randomUUID()}`, true, async () => {}), (e: unknown) => (e as {status:number}).status === 403);
});
test("Owner target cannot be changed; role changes audit and cancel pending requests atomically", async () => {
  const rollback = new Error("rollback-fixtures");
  try {
    await db.transaction(async tx => {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
      const requesterId = `fixture_admin_${suffix}`;
      const targetId = `fixture_student_${suffix}`;
      await tx.insert(profiles).values([{ id: requesterId, role: "admin" }, { id: targetId, role: "student" }]);
      const [owner] = await tx.select().from(profiles).where(eq(profiles.role, "owner"));
      assert.ok(owner);
      await tx.execute("SAVEPOINT owner_target_check");
      await assert.rejects(validateStaffTarget(tx, owner.id, "student"), (e:unknown)=>(e as {status:number}).status === 403);
      await tx.execute("ROLLBACK TO SAVEPOINT owner_target_check");
      const [request] = await tx.insert(accessRequestsTable).values({ requesterId, targetId, action:"promote", reason:"Test approval request, never committed." }).returning();
      await applyStaffRole(tx, owner.id, targetId, "admin", "Test direct role change, never committed.");
      const [target] = await tx.select().from(profiles).where(eq(profiles.id, targetId));
      assert.equal(target.role, "admin");
      const [cancelled] = await tx.select().from(accessRequestsTable).where(eq(accessRequestsTable.id, request.id));
      assert.equal(cancelled.status, "cancelled");
      const logs = await tx.select().from(auditTable).where(eq(auditTable.targetId, targetId));
      assert.equal(logs.length, 1);
      assert.equal(logs[0].action, "promote-admin");
      await applyStaffRole(tx, owner.id, targetId, "student", "Test removal, never committed.");
      const [demoted] = await tx.select().from(profiles).where(eq(profiles.id, targetId));
      assert.equal(demoted.role, "student");
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});
