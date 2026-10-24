import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, pool, profilesTable as p, listingsTable as l, commerceOrdersTable as o, auditTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { premiumEligibility, sellerPremium, PREMIUM_PRICE_MINOR, requirePremiumEligibility, setCommerceRole, requireMarketplaceSeller } from "./lib/commerce";
import { reconcilePayment, unavailableVerifier, type ExpectedPayment } from "./lib/payment-boundary";
import { ChooseCommerceAccountBody, ManageCommerceAccountBody, SetCommerceLaunchBody, StartCommerceCheckoutBody } from "@workspace/api-zod";

after(async () => { await pool.end(); });
test("Premium is exactly NGN 2000, not a dollar conversion", () => {
  assert.equal(PREMIUM_PRICE_MINOR, 200000);
});
test("Premium adds two Lagos calendar months, clamping month ends and preserving time", () => {
  for (const [start, result] of [
    ["2026-12-31T22:15:00.000Z", "2027-02-28T22:15:00.000Z"],
    ["2027-12-31T22:15:00.000Z", "2028-02-29T22:15:00.000Z"],
    ["2026-01-31T08:00:00.000Z", "2026-03-31T08:00:00.000Z"],
    ["2026-07-31T23:30:00.000Z", "2026-09-30T23:30:00.000Z"],
  ]) assert.equal(premiumEligibility(new Date(start))?.toISOString(), result);
  assert.equal(premiumEligibility(null), null);
});
test("Buyers get no Premium product or pricing; unconfigured launch remains disabled", () => {
  assert.equal(sellerPremium("buyer", null), null);
  const value = sellerPremium("seller", null);
  assert.equal(value?.status, "launch_unconfigured");
  assert.equal(value?.checkoutEnabled, false);
});
test("Launch gating checks exact instant, not account registration or elapsed sixty days", () => {
  const eligibleAt = "2026-12-24T00:00:00.000Z";
  assert.throws(() => requirePremiumEligibility("buyer", eligibleAt, new Date("2027-01-01")));
  assert.throws(() => requirePremiumEligibility("seller", null));
  assert.throws(() => requirePremiumEligibility("seller", eligibleAt, new Date("2026-12-23T23:59:59.999Z")));
  assert.doesNotThrow(() => requirePremiumEligibility("seller", eligibleAt, new Date(eligibleAt)));
  assert.equal(sellerPremium("seller", eligibleAt, new Date(eligibleAt))?.status, "payment_unavailable");
  assert.equal(sellerPremium("seller", eligibleAt, new Date(eligibleAt))?.checkoutEnabled, false);
});
test("Client input cannot inject staff roles, prices, paid flags or premium privileges", () => {
  assert.equal(ChooseCommerceAccountBody.strict().safeParse({ accountType: "seller", role: "owner" }).success, false);
  assert.equal(ChooseCommerceAccountBody.strict().safeParse({ accountType: "owner" }).success, false);
  assert.equal(ManageCommerceAccountBody.strict().safeParse({ accountType: "seller", reason: "a" }).success, false);
  assert.equal(SetCommerceLaunchBody.strict().safeParse({ publicLaunchAt: null, reason: "a meaningful correction", paymentsEnabled: true }).success, false);
  assert.equal(StartCommerceCheckoutBody.strict().safeParse({ kind: "premium", amountMinor: 1, paid: true }).success, false);
});
test("Reconciliation rejects every mismatch and cannot replace provider API verification", async () => {
  const expected: ExpectedPayment = { reference: "server-ref", orderId: "server-order", amountMinor: 200000, currency: "NGN", environment: "test" };
  assert.doesNotThrow(() => reconcilePayment(expected, { ...expected, status: "success" }));
  for (const changed of [
    { amountMinor: 1 }, { currency: "USD" }, { reference: "other" }, { orderId: "other" },
    { environment: "live" }, { status: "pending" }, { status: "failed" }, { amountMinor: NaN },
  ]) assert.throws(() => reconcilePayment(expected, { ...expected, status: "success", ...changed } as Parameters<typeof reconcilePayment>[1]));
  await assert.rejects(unavailableVerifier.verify("any"), /disabled/);
});
test("Commerce roles preserve staff authority and audit self-service changes", async () => {
  const id = `commerce-test-${randomUUID()}`;
  try {
    await db.transaction(async tx => {
      await tx.insert(p).values({ id, role: "admin" });
      await assert.rejects(requireMarketplaceSeller(tx, id, "marketplace"), /seller mode/);
      await requireMarketplaceSeller(tx, id, "study");
      const seller = await setCommerceRole(tx, id, id, "seller", "Explicit test choice");
      assert.equal(seller.role, "admin");
      await requireMarketplaceSeller(tx, id, "marketplace");
      const [saved] = await tx.select().from(p).where(eq(p.id, id));
      assert.equal(saved.role, "admin");
      assert.equal(saved.commerceRole, "seller");
      const audit = await tx.select().from(auditTable).where(eq(auditTable.actorId, id));
      assert.equal(audit.length, 1);
      throw new Error("ROLLBACK_TEST");
    });
  } catch (e) { if (!(e instanceof Error) || e.message !== "ROLLBACK_TEST") throw e; }
});
test("Active listings block switching to buyer; archived listings do not; suspension is rechecked", async () => {
  const id = `commerce-test-${randomUUID()}`;
  try {
    await db.transaction(async tx => {
      const university = await tx.execute<{id: number}>(sql`select id from academic_directory where kind='university' limit 1`);
      await tx.insert(p).values({ id, commerceRole: "seller" });
      const [listing] = await tx.insert(l).values({ ownerId: id, kind: "marketplace", title: "Rollback-only test", description: "Never committed", category: "test", universityId: university.rows[0].id }).returning();
      await assert.rejects(setCommerceRole(tx, id, id, "buyer", "Test"), /unavailable/);
      await tx.update(l).set({ status: "unavailable" }).where(eq(l.id, listing.id));
      assert.equal((await setCommerceRole(tx, id, id, "buyer", "Test")).commerceRole, "buyer");
      await tx.update(p).set({ suspended: true }).where(eq(p.id, id));
      await assert.rejects(setCommerceRole(tx, id, id, "seller", "Test"), /Restore/);
      throw new Error("ROLLBACK_TEST");
    });
  } catch (e) { if (!(e instanceof Error) || e.message !== "ROLLBACK_TEST") throw e; }
});
test("DB requires server-verified payment identity, exact Premium amount, valid currency and unique events", async () => {
  const connection = await pool.connect();
  const id = `commerce-test-${randomUUID()}`;
  try {
    await connection.query("BEGIN");
    await connection.query("insert into profiles(id) values ($1)", [id]);
    const base = "insert into commerce_orders(id,buyer_id,kind,amount_minor,currency,status) values ($1,$2,'premium',$3,$4,$5)";
    for (const [amount, currency, status] of [[1, "NGN", "pending"], [200000, "USD", "pending"], [200000, "NGN", "paid"], [-1, "NGN", "pending"]]) {
      await connection.query("SAVEPOINT invalid_order");
      await assert.rejects(connection.query(base, [randomUUID(), id, amount, currency, status]), (e: unknown) => (e as {code?: string}).code === "23514");
      await connection.query("ROLLBACK TO SAVEPOINT invalid_order");
    }
    const orderId = randomUUID();
    await connection.query(base, [orderId, id, 200000, "NGN", "pending"]);
    await connection.query("insert into commerce_events(order_id,provider,event_id,digest) values ($1,'test-only','event-1','digest')", [orderId]);
    await connection.query("SAVEPOINT duplicate_event");
    await assert.rejects(connection.query("insert into commerce_events(order_id,provider,event_id,digest) values ($1,'test-only','event-1','digest')", [orderId]), (e: unknown) => (e as {code?: string}).code === "23505");
  } finally { await connection.query("ROLLBACK"); connection.release(); }
});
test("Private commerce routes and admin analytics reject anonymous requests", async () => {
  for (const path of ["/commerce/account", "/admin/commerce"]) assert.equal((await fetch(`http://localhost:80/api${path}`)).status, 401);
});
test("Unimplemented webhook never acknowledges forged events or changes financial records", async () => {
  const [before] = await db.select({ count: sql<number>`count(*)::int` }).from(o);
  const response = await fetch("http://localhost:80/api/commerce/webhooks/payment", { method: "POST", headers: { "content-type": "application/json", "x-paystack-signature": "forged" }, body: JSON.stringify({ event: "charge.success", data: { amount: 200000, status: "success" } }) });
  assert.equal(response.status, 503);
  const [afterCount] = await db.select({ count: sql<number>`count(*)::int` }).from(o);
  assert.equal(before.count, afterCount.count);
});
