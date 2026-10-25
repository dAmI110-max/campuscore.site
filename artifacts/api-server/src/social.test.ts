import test, { after } from "node:test";
import assert from "node:assert/strict";
import { apiBase } from "./test-helpers";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";

after(async () => { await pool.end(); });
const base = apiBase;
for (const [method, path, body] of [
  ["GET", "/people"], ["GET", "/social/summary"], ["GET", "/conversations"],
  ["POST", "/conversations", { username: "qa_unknown" }],
  ["GET", "/conversations/1"],
  ["POST", "/conversations/1/messages", { body: "Unauthorized test", clientMessageId: randomUUID() }],
  ["POST", "/conversations/1/read", { throughMessageId: 1 }],
  ["GET", "/notifications"], ["POST", "/notifications/1/read"],
  ["POST", "/notifications/read-all", { throughId: 1 }],
  ["GET", "/safety/blocks"], ["POST", "/safety/blocks/qa_unknown"],
  ["DELETE", "/safety/blocks/qa_unknown"], ["GET", "/safety/reports"],
  ["POST", "/safety/reports", { username: "qa_unknown", reason: "Unauthorized report fixture." }],
  ["GET", "/admin/user-reports"],
  ["POST", "/admin/user-reports/1/review", { status: "resolved", reason: "Unauthorized review" }],
] as const) {
  test(`Social anonymous ${method} ${path} is rejected`, async () => {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    assert.equal(response.status, 401);
  });
}
for (const query of ["minPrice=100&maxPrice=10", "condition=Unknown", "minPrice=-1", "maxPrice=1000000001"]) {
  test(`Invalid listing filter ${query} is rejected`, async () => {
    assert.equal((await fetch(`${base}/listings?${query}`)).status, 400);
  });
}
test("Valid combined listing filters use the API contract", async () => {
  const response = await fetch(`${base}/listings?kind=marketplace&condition=Good&q=Textbooks&minPrice=0&maxPrice=100000&sort=price-low&page=1`);
  assert.equal(response.status, 200);
  const page = await response.json() as { items: { condition: string; price: number }[] };
  assert.ok(Array.isArray(page.items));
  for (const item of page.items) {
    assert.equal(item.condition, "Good");
    assert.ok(item.price >= 0 && item.price <= 100000);
  }
});
test("New social tables enforce RLS under the restricted transaction role", async () => {
  const { rows } = await pool.query("select relname,relrowsecurity,relforcerowsecurity from pg_class where relname=any($1::text[])", [["conversations", "direct_messages", "user_blocks", "notifications", "user_reports"]]);
  assert.equal(rows.length, 5);
  for (const table of rows) { assert.equal(table.relrowsecurity, true, table.relname); assert.equal(table.relforcerowsecurity, true, table.relname); }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE campus_core_social");
    const { rows: [role] } = await client.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user");
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false);
  } finally { await client.query("ROLLBACK"); client.release(); }
});
test("Database policies isolate participants, block both directions, deduplicate notifications, protect evidence and clear pooled identity", async () => {
  const client = await pool.connect();
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const a = `fixture_a_${suffix}`, b = `fixture_b_${suffix}`, staff = `fixture_staff_${suffix}`;
  const actor = async (id: string) => { await client.query("select set_config('app.user_id',$1,true)", [id]); };
  const denied = async (statement: string, params: unknown[]) => {
    await client.query("SAVEPOINT denied");
    await assert.rejects(client.query(statement, params), (error: unknown) => (error as { code: string }).code === "42501");
    await client.query("ROLLBACK TO SAVEPOINT denied");
  };
  try {
    await client.query("BEGIN");
    await client.query("insert into profiles(id,role,username) values($1,'student',$4),($2,'student',$5),($3,'admin',$6)", [a, b, staff, `qa_a_${suffix}`, `qa_b_${suffix}`, `qa_staff_${suffix}`]);
    await actor(a);
    await client.query("SET LOCAL ROLE campus_core_social");
    const { rows: [conversation] } = await client.query("insert into conversations(participant_a,participant_b) values($1,$2) returning id", [a, b]);
    const retryId = randomUUID();
    const { rows: [message] } = await client.query("insert into direct_messages(conversation_id,sender_id,client_message_id,body) values($1,$2,$3,$4) returning id", [conversation.id, a, retryId, "Private fixture, always rolled back."]);
    assert.equal((await client.query("select id from direct_messages where conversation_id=$1", [conversation.id])).rowCount, 1);
    const notification = [b, `message:${message.id}`, conversation.id, message.id];
    const insertNotification = "insert into notifications(user_id,event_key,kind,title,href,conversation_id,message_id) values($1,$2,'message','You have a new message','/messages/test',$3,$4)";
    await client.query(insertNotification, notification);
    await client.query("SAVEPOINT duplicate_notification");
    await assert.rejects(client.query(insertNotification, notification), (error: unknown) => (error as {code:string}).code === "23505");
    await client.query("ROLLBACK TO SAVEPOINT duplicate_notification");
    assert.equal((await client.query("select id from notifications where message_id=$1", [message.id])).rowCount, 0, "Sender cannot read recipient notifications");
    await actor(b);
    assert.equal((await client.query("select id from notifications where message_id=$1", [message.id])).rowCount, 1, "One notification after an idempotent retry");
    await client.query("insert into user_reports(reporter_id,target_id,reason,message_id,snapshot) values($1,$2,$3,$4,$5)", [b, a, "Explicitly reported fixture evidence.", message.id, "Private fixture, always rolled back."]);
    await client.query("insert into user_blocks(blocker_id,blocked_id) values($1,$2)", [b, a]);
    await denied("insert into direct_messages(conversation_id,sender_id,client_message_id,body) values($1,$2,$3,'Blocked send')", [conversation.id, b, randomUUID()]);
    await actor(a);
    await denied("insert into direct_messages(conversation_id,sender_id,client_message_id,body) values($1,$2,$3,'Blocked send')", [conversation.id, a, randomUUID()]);
    assert.equal((await client.query("delete from user_blocks where blocker_id=$1", [b])).rowCount, 0, "Cannot remove someone else's block");
    assert.equal((await client.query("select id from user_reports where target_id=$1", [a])).rowCount, 0, "Reported user cannot see reporter evidence");
    await actor(staff);
    assert.equal((await client.query("select id from direct_messages where conversation_id=$1", [conversation.id])).rowCount, 0, "Staff has no global private-message access");
    assert.equal((await client.query("select id from conversations where id=$1", [conversation.id])).rowCount, 0);
    assert.equal((await client.query("select id from notifications where message_id=$1", [message.id])).rowCount, 0);
    assert.equal((await client.query("select snapshot from user_reports where target_id=$1", [a])).rowCount, 1, "Staff sees only deliberately submitted report evidence");
    await denied("insert into direct_messages(conversation_id,sender_id,client_message_id,body) values($1,$2,$3,'Forged third-party send')", [conversation.id, staff, randomUUID()]);
    await actor("");
    assert.equal((await client.query("select id from direct_messages where conversation_id=$1", [conversation.id])).rowCount, 0);
  } finally {
    await client.query("ROLLBACK");
    assert.equal((await client.query("select nullif(current_setting('app.user_id',true),'') is null as cleared")).rows[0].cleared, true);
    client.release();
  }
});
