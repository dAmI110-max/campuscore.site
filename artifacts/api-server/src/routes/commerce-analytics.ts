import { Router, type IRouter } from "express";
import { db, profilesTable as p, directoryTable as d, commerceOrdersTable as o } from "@workspace/db";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { GetCommerceAdminQueryParams, GetCommerceAdminResponse } from "@workspace/api-zod";
import { administrator } from "../lib/auth";
import { commerceLaunch } from "../lib/commerce";
import { HttpError } from "../lib/errors";

const router: IRouter = Router();
router.get("/admin/commerce", async (req, res): Promise<void> => {
  await administrator(req);
  const q = GetCommerceAdminQueryParams.parse(req.query);
  const clauses: SQL[] = [];
  if (q.q?.trim()) {
    // Literal substring search, not SQL wildcards controlled by input.
    const needle = `%${q.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    clauses.push(sql`(${p.displayName} ilike ${needle} or ${p.username} ilike ${needle})`);
  }
  if (q.accountType) clauses.push(eq(p.commerceRole, q.accountType));
  if (q.universityId) clauses.push(eq(p.universityId, q.universityId));
  if (q.suspended) clauses.push(eq(p.suspended, q.suspended === "true"));
  for (const value of [q.from, q.to]) {
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value))
      throw new HttpError(400, "Provide a valid calendar date.");
  }
  if (q.from && q.to && q.from > q.to) throw new HttpError(400, "The start date must not be after the end date.");
  if (q.from) clauses.push(sql`${p.createdAt} >= (${q.from}::date::timestamp at time zone 'Africa/Lagos')`);
  if (q.to) clauses.push(sql`${p.createdAt} < ((${q.to}::date + interval '1 day') at time zone 'Africa/Lagos')`);
  const where = and(...clauses);
  const page = q.page ?? 1, pageSize = 25;
  if (page > 100_000) throw new HttpError(400, "Page is out of range.");
  // Repeatable read keeps totals, pages and university breakdown mutually consistent.
  const result = await db.transaction(async tx => {
    const [totals] = await tx.select({
      users: sql<number>`count(*)::int`,
      buyers: sql<number>`count(*) filter (where ${p.commerceRole} = 'buyer')::int`,
      sellers: sql<number>`count(*) filter (where ${p.commerceRole} = 'seller')::int`,
      suspended: sql<number>`count(*) filter (where ${p.suspended})::int`,
      today: sql<number>`count(*) filter (where ${p.createdAt} >= (date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'))::int`,
      week: sql<number>`count(*) filter (where ${p.createdAt} >= (date_trunc('week', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'))::int`,
      month: sql<number>`count(*) filter (where ${p.createdAt} >= (date_trunc('month', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'))::int`,
    }).from(p).where(where);
    const users = await tx.select({
      id: p.id, displayName: p.displayName, username: p.username, accountType: p.commerceRole,
      suspended: p.suspended, universityName: d.name, createdAt: p.createdAt,
    }).from(p).leftJoin(d, eq(p.universityId, d.id)).where(where)
      .orderBy(sql`${p.createdAt} desc, ${p.id} asc`).limit(pageSize).offset((page - 1) * pageSize);
    const trends = await tx.select({
      date: sql<string>`to_char(${p.createdAt} at time zone 'Africa/Lagos', 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    }).from(p).where(and(where, sql`${p.createdAt} >= (date_trunc('day', now() at time zone 'Africa/Lagos') - interval '29 days') at time zone 'Africa/Lagos'`))
      .groupBy(sql`to_char(${p.createdAt} at time zone 'Africa/Lagos', 'YYYY-MM-DD')`).orderBy(sql`to_char(${p.createdAt} at time zone 'Africa/Lagos', 'YYYY-MM-DD')`);
    const universities = await tx.select({
      name: sql<string>`coalesce(${d.name}, 'University not selected')`, count: sql<number>`count(*)::int`,
    }).from(p).leftJoin(d, eq(p.universityId, d.id)).where(where).groupBy(d.name).orderBy(sql`count(*) desc`).limit(100);
    // Finance uses order dates and parties, not arbitrary client-supplied totals.
    // Test transactions must never appear as collected revenue or processing fees.
    const financeClauses: SQL[] = [eq(o.provider, "paystack")];
    if (q.from) financeClauses.push(sql`${o.createdAt} >= (${q.from}::date::timestamp at time zone 'Africa/Lagos')`);
    if (q.to) financeClauses.push(sql`${o.createdAt} < ((${q.to}::date + interval '1 day') at time zone 'Africa/Lagos')`);
    if (q.q || q.accountType || q.universityId || q.suspended) financeClauses.push(sql`exists (select 1 from profiles where (${p.id} = ${o.buyerId} or ${p.id} = ${o.sellerId}) and ${where ?? sql`true`})`);
    const [finance] = await tx.select({
      verifiedMarketplaceMinor: sql<number>`coalesce(sum(${o.amountMinor}) filter (where ${o.kind} = 'marketplace' and ${o.verifiedAt} is not null and ${o.status} in ('paid','refunded','partially_refunded')), 0)::float8`,
      marketplaceRefundsMinor: sql<number>`coalesce(sum(${o.refundedMinor}) filter (where ${o.kind} = 'marketplace' and ${o.verifiedAt} is not null), 0)::float8`,
      premiumRevenueMinor: sql<number>`coalesce(sum(${o.amountMinor} - ${o.refundedMinor}) filter (where ${o.kind} = 'premium' and ${o.verifiedAt} is not null and ${o.status} in ('paid','refunded','partially_refunded')), 0)::float8`,
      processingFeesMinor: sql<number | null>`case when count(*) filter (where ${o.verifiedAt} is not null) > 0 and count(*) filter (where ${o.verifiedAt} is not null and ${o.processingFeeMinor} is null) = 0 then sum(${o.processingFeeMinor}) filter (where ${o.verifiedAt} is not null)::float8 else null end`,
      pending: sql<number>`count(*) filter (where ${o.status} = 'pending')::int`,
      failed: sql<number>`count(*) filter (where ${o.status} = 'failed')::int`,
      cancelled: sql<number>`count(*) filter (where ${o.status} = 'cancelled')::int`,
      disputed: sql<number>`count(*) filter (where ${o.status} = 'disputed')::int`,
      refunded: sql<number>`count(*) filter (where ${o.status} in ('refunded','partially_refunded'))::int`,
    }).from(o).where(and(...financeClauses));
    return { totals, users: users.map(user => ({ ...user, createdAt: user.createdAt.toISOString() })), total: totals.users, page, pageSize, trends, universities,
      finance: { ...finance, platformEarningsMinor: null, paymentsEnabled: false, escrowEnabled: false } };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  const launch = await commerceLaunch();
  res.json(GetCommerceAdminResponse.parse({
    ...result,
    launch,
    finance: { ...result.finance, paymentsEnabled: launch.paymentsEnabled, escrowEnabled: false },
  }));
});
export default router;
