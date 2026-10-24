import { db, listingsTable as l, profilesTable as p, directoryTable as d, savedListingsTable as s } from "@workspace/db";
import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { HttpError } from "./errors";

export const listingColumns = {
  id: l.id, ownerId: l.ownerId, kind: l.kind, title: l.title, description: l.description,
  category: l.category, price: l.price, location: l.location, universityId: l.universityId,
  condition: l.condition, status: l.status, images: l.images, contact: l.contact,
  closesAt: l.closesAt, resourceUrl: l.resourceUrl, verified: l.verified, createdAt: l.createdAt,
  sellerName: p.displayName, sellerUsername: p.username, universityName: d.name,
};
export function published() {
  return and(eq(l.status, "published"), eq(l.hidden, false), isNull(l.deletedAt), eq(p.suspended, false));
}
export function listingsQuery(userId: string | null) {
  return db.select({
    ...listingColumns,
    contact: userId ? l.contact : sql<string>`''`,
    saved: userId ? sql<boolean>`exists(select 1 from ${s} where ${s.userId} = ${userId} and ${s.listingId} = ${l.id})` : sql<boolean>`false`,
  }).from(l).innerJoin(p, eq(l.ownerId, p.id)).innerJoin(d, eq(l.universityId, d.id));
}
export async function listingById(id: number, userId: string | null, admin = false) {
  const [row] = await listingsQuery(userId).where(and(
    eq(l.id, id), isNull(l.deletedAt),
    admin ? undefined : or(published(), userId ? eq(l.ownerId, userId) : undefined),
  )).limit(1);
  if (!row) throw new HttpError(404, "Listing not found or no longer available.");
  return { ...row, createdAt: row.createdAt.toISOString() };
}
export function wireListing<T extends { createdAt: Date }>(row: T) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
