import { Router, type IRouter } from "express";
import { db, directoryTable as d, institutionRequestsTable as r, reportsTable, profilesTable as p, listingsTable as l, auditTable } from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { GetAdminOverviewResponse, ManageDirectoryBody, ManageDirectoryResponse, ModerateBody, ModerateResponse } from "@workspace/api-zod";
import { administrator } from "../lib/auth";
import { HttpError } from "../lib/errors";
import { safeLink, academicEntry } from "../lib/validation";
import { importOfficialUniversities } from "../lib/official-directory";
import { setSocialActor, notify } from "../lib/social";

const router: IRouter = Router();
router.post("/admin/directory/import-nigeria", async (req, res): Promise<void> => {
  const actor = await administrator(req);
  if (actor.role !== "owner") throw new HttpError(403, "Only the owner can import official reference data.");
  res.json(await importOfficialUniversities(actor.id));
});
router.get("/admin/overview", async (req, res): Promise<void> => {
  await administrator(req);
  const [reports, requests, users, audit, directory] = await Promise.all([
    db.select().from(reportsTable).orderBy(sql`case when ${reportsTable.status} = 'pending' then 0 else 1 end`, desc(reportsTable.createdAt)).limit(100),
    db.select().from(r).orderBy(sql`case when ${r.status} = 'pending' then 0 else 1 end`, desc(r.createdAt)).limit(100),
    db.select().from(p).orderBy(desc(p.createdAt)).limit(100),
    db.select().from(auditTable).orderBy(desc(auditTable.createdAt)).limit(100),
    db.select().from(d).orderBy(d.name).limit(2000),
  ]);
  res.json(GetAdminOverviewResponse.parse({
    reports: reports.map(v => ({ id: String(v.id), title: `Listing #${v.listingId}`, detail: v.reason, status: v.status, targetId: String(v.listingId), createdAt: v.createdAt.toISOString() })),
    requests: requests.map(v => ({ id: String(v.id), title: v.name, detail: `${v.kind}; parent: ${v.parentId ?? "none"}; ${v.sourceUrl}; ${v.notes}`, status: v.status, targetId: String(v.id), createdAt: v.createdAt.toISOString() })),
    users: users.map(v => ({ id: v.id, title: v.displayName || "Profile not completed", detail: v.username ? `@${v.username}` : "No username yet", status: v.suspended ? "suspended" : v.role, targetId: v.id, createdAt: v.createdAt.toISOString() })),
    audit: audit.map(v => ({ id: String(v.id), title: v.action, detail: `${v.reason} (actor ${v.actorId})`, status: "recorded", targetId: v.targetId, createdAt: v.createdAt.toISOString() })),
    directory,
  }));
});
router.post("/admin/directory", async (req, res): Promise<void> => {
  const admin = await administrator(req);
  const body = ManageDirectoryBody.parse(req.body);
  if (!safeLink(body.sourceUrl) || !body.sourceUrl) throw new HttpError(400, "A legitimate source URL is required.");
  const parentKind = { country: null, university: "country", faculty: "university", department: "faculty" }[body.kind];
  if (parentKind) {
    if (!body.parentId) throw new HttpError(400, "Choose the parent institution.");
    await academicEntry(body.parentId, parentKind);
  } else if (body.parentId) throw new HttpError(400, "Countries cannot have a parent.");
  const saved = await db.transaction(async tx => {
    let entry;
    if (body.id) {
      const [old] = await tx.select().from(d).where(eq(d.id, body.id));
      if (!old) throw new HttpError(404, "Directory entry not found.");
      if (old.kind !== body.kind || old.parentId !== (body.parentId ?? null)) throw new HttpError(400, "Kind and parent cannot be changed. Deactivate the entry and create the correct record instead.");
      [entry] = await tx.update(d).set({ name: body.name.trim(), sourceUrl: body.sourceUrl, active: body.active }).where(eq(d.id, body.id)).returning();
    } else {
      [entry] = await tx.insert(d).values({ ...body, name: body.name.trim() }).returning();
    }
    await tx.insert(auditTable).values({ actorId: admin.id, action: body.id ? "update-directory" : "create-directory", targetId: String(entry.id), reason: `Source: ${body.sourceUrl}; active=${body.active}` });
    return entry;
  });
  res.json(ManageDirectoryResponse.parse(saved));
});
router.post("/admin/actions", async (req, res): Promise<void> => {
  const admin = await administrator(req);
  const body = ModerateBody.parse(req.body);
  await db.transaction(async tx => {
    await setSocialActor(tx, admin.id);
    const [fresh] = await tx.select().from(p).where(eq(p.id, admin.id)).for("share");
    if (!fresh || fresh.suspended || (fresh.role !== "admin" && fresh.role !== "owner")) throw new HttpError(403, "Administrator access required.");
    let changed: unknown[] = [];
    if (body.action === "suspend-user" || body.action === "restore-user") {
      if (body.targetId === admin.id) throw new HttpError(400, "You cannot suspend your own account.");
      const [target] = await tx.select().from(p).where(eq(p.id, body.targetId)).for("update");
      if (target?.role === "admin" || target?.role === "owner") throw new HttpError(403, "Staff accounts cannot be suspended. Only the owner can change administrator access.");
      changed = await tx.update(p).set({ suspended: body.action === "suspend-user", updatedAt: new Date() }).where(eq(p.id, body.targetId)).returning();
    } else {
      if (!/^[1-9]\d*$/.test(body.targetId)) throw new HttpError(400, "Invalid target identifier.");
      const id = Number(body.targetId);
      if (body.action === "resolve-report") changed = await tx.update(reportsTable).set({ status: "resolved" }).where(eq(reportsTable.id, id)).returning();
      if (body.action === "dismiss-request") changed = await tx.update(r).set({ status: "reviewed" }).where(eq(r.id, id)).returning();
      if (body.action === "hide-listing") changed = await tx.update(l).set({ hidden: true, updatedAt: new Date() }).where(and(eq(l.id, id), eq(l.hidden, false))).returning();
      if (body.action === "verify-listing") changed = await tx.update(l).set({ verified: true, updatedAt: new Date() }).where(and(eq(l.id, id), eq(l.verified, false))).returning();
    }
    if (!changed.length) throw new HttpError(404, "Moderation target not found.");
    if (body.action === "hide-listing" || body.action === "verify-listing") {
      const listing = changed[0] as typeof l.$inferSelect;
      await notify(tx, { userId: listing.ownerId, eventKey: `${body.action}:${listing.id}`, kind: "listing-moderated",
        title: body.action === "hide-listing" ? "A moderator hid your listing" : "A moderator verified your listing", href: `/listing/${listing.id}` });
    }
    await tx.insert(auditTable).values({ actorId: admin.id, ...body });
  });
  res.json(ModerateResponse.parse({ message: "Action completed and recorded in the audit log." }));
});
export default router;
