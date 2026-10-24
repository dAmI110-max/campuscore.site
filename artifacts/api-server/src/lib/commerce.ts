import { db, profilesTable as p, listingsTable as l, platformCommerceTable, commerceOrdersTable as orders, auditTable, directoryTable as d, type Profile } from "@workspace/db";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { HttpError } from "./errors";

export const PREMIUM_PRICE_MINOR = 200_000;
export const PAYMENT_UNAVAILABLE = "Checkout is disabled. Merchant eligibility, verified payments and a compliant escrow funds-holding and delayed-release arrangement are not implemented.";

/** Calendar months in Africa/Lagos, not 60 days, registration age or deployment age. */
export function premiumEligibility(launch: Date | null): Date | null {
  if (!launch) return null;
  const local = new Date(launch.getTime() + 3_600_000);
  const day = local.getUTCDate();
  local.setUTCDate(1);
  local.setUTCMonth(local.getUTCMonth() + 2);
  const monthEnd = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate();
  local.setUTCDate(Math.min(day, monthEnd));
  return new Date(local.getTime() - 3_600_000);
}

export async function commerceLaunch() {
  const [settings] = await db.select().from(platformCommerceTable).where(eq(platformCommerceTable.id, 1));
  const launch = settings?.publicLaunchAt ?? null;
  return {
    publicLaunchAt: launch?.toISOString() ?? null,
    premiumEligibleAt: premiumEligibility(launch)?.toISOString() ?? null,
    timezone: "Africa/Lagos",
    // Intentionally not env toggles: credentials alone cannot approve genuine escrow.
    paymentsEnabled: false, escrowEnabled: false,
  };
}

export function sellerPremium(role: string, eligibleAt: string | null, now = new Date()) {
  if (role !== "seller") return null;
  return {
    status: !eligibleAt ? "launch_unconfigured" : now < new Date(eligibleAt) ? "waiting" : "payment_unavailable",
    eligibleAt, priceMinor: PREMIUM_PRICE_MINOR, currency: "NGN", checkoutEnabled: false,
    explanation: !eligibleAt
      ? "Premium is disabled until the official public launch date is explicitly configured. Ordinary selling remains free."
      : now < new Date(eligibleAt)
        ? "Premium becomes eligible two calendar months after the official public launch. Ordinary selling remains free."
        : "The launch waiting period has ended, but subscriptions remain disabled until payment and escrow readiness is confirmed. No Premium access has been activated.",
  };
}

export async function commerceAccount(user: Profile) {
  const launch = await commerceLaunch();
  const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(l)
    .where(and(eq(l.ownerId, user.id), eq(l.kind, "marketplace"), ne(l.status, "unavailable"), isNull(l.deletedAt)));
  const history = await db.select().from(orders)
    .where(user.commerceRole === "seller" ? sql`(${orders.buyerId} = ${user.id} or ${orders.sellerId} = ${user.id})` : eq(orders.buyerId, user.id))
    .orderBy(sql`${orders.createdAt} desc`).limit(100);
  return {
    accountType: user.commerceRole, sellerListingCount: count.count,
    orders: history.map(order => ({ id: order.id, kind: order.kind, amountMinor: order.amountMinor, currency: order.currency, status: order.status, createdAt: order.createdAt.toISOString() })),
    premium: sellerPremium(user.commerceRole, launch.premiumEligibleAt), launch,
  };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function setCommerceRole(tx: Transaction, actorId: string, targetId: string, accountType: "buyer" | "seller", reason: string) {
  // Staff role writes and seller-mode writes share a lock; no unchecked object spread.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('campus-core-access-control'))`);
  const [target] = await tx.select().from(p).where(eq(p.id, targetId)).for("update");
  if (!target) throw new HttpError(404, "Account not found.");
  if (target.suspended) throw new HttpError(403, "Restore this account before changing its marketplace access.");
  if (accountType === "buyer") {
    const [active] = await tx.select({ id: l.id }).from(l).where(and(eq(l.ownerId, targetId), eq(l.kind, "marketplace"), ne(l.status, "unavailable"), isNull(l.deletedAt))).limit(1);
    if (active) throw new HttpError(409, "Mark your marketplace listings unavailable or delete them before switching to buyer mode.");
  }
  if (target.commerceRole !== accountType) {
    await tx.update(p).set({ commerceRole: accountType, updatedAt: new Date() }).where(eq(p.id, targetId));
    await tx.insert(auditTable).values({ actorId, targetId, action: "commerce-account-change", reason: `${target.commerceRole} → ${accountType}: ${reason}` });
  }
  return { ...target, commerceRole: accountType };
}

export async function requireMarketplaceSeller(tx: Transaction, userId: string, kind: string) {
  if (kind !== "marketplace") return;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('campus-core-access-control'))`);
  const [current] = await tx.select().from(p).where(eq(p.id, userId)).for("update");
  if (!current || current.suspended || current.commerceRole !== "seller")
    throw new HttpError(403, "Choose seller mode in your account before creating or editing marketplace listings.");
}

export async function commerceUser(user: Profile) {
  const [university] = user.universityId ? await db.select({ name: d.name }).from(d).where(eq(d.id, user.universityId)) : [];
  return { id: user.id, displayName: user.displayName, username: user.username, accountType: user.commerceRole, suspended: user.suspended, universityName: university?.name ?? null, createdAt: user.createdAt.toISOString() };
}

export function requirePremiumEligibility(role: string, eligibleAt: string | null, now = new Date()) {
  if (role !== "seller") throw new HttpError(403, "Seller Premium is available only to seller accounts.");
  if (!eligibleAt || now < new Date(eligibleAt)) throw new HttpError(403, "Seller Premium is not yet eligible after the official public launch.");
}
