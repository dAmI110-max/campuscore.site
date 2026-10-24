import { Router, type IRouter } from "express";
import { db, listingsTable as l, profilesTable as p, directoryTable as d, savedListingsTable as s, reportsTable } from "@workspace/db";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  ListListingsQueryParams, ListListingsResponse, CreateListingBody, CreateListingResponse,
  GetListingParams, GetListingResponse, UpdateListingParams, UpdateListingBody, UpdateListingResponse,
  DeleteListingParams, ToggleSavedListingParams, ToggleSavedListingResponse, CreateReportBody,
  CreateReportResponse, GetSummaryResponse,
} from "@workspace/api-zod";
import { account, identity } from "../lib/auth";
import { academicEntry, ownedImages, safeLink } from "../lib/validation";
import { HttpError } from "../lib/errors";
import { listingById, listingsQuery, published, wireListing } from "../lib/listing-service";

const router: IRouter = Router();
router.get("/summary", async (_req, res): Promise<void> => {
  const grouped = await db.select({ kind: l.kind, count: count() }).from(l).innerJoin(p, eq(l.ownerId, p.id)).where(published()).groupBy(l.kind);
  const counts = { marketplace: 0, accommodation: 0, services: 0, opportunities: 0, study: 0, communities: 0, events: 0 };
  for (const row of grouped) if (row.kind in counts) counts[row.kind as keyof typeof counts] = row.count;
  const [universities] = await db.select({ count: count() }).from(d).where(and(eq(d.kind, "university"), eq(d.active, true)));
  res.json(GetSummaryResponse.parse({ counts, universities: universities.count, paymentsEnabled: false, messagingEnabled: false, aiEnabled: false }));
});
router.get("/listings", async (req, res): Promise<void> => {
  // Parse boolean query strings explicitly: Boolean("false") is true in JS.
  const raw = { ...req.query };
  for (const field of ["mine", "saved"]) {
    if (raw[field] !== undefined && raw[field] !== "true" && raw[field] !== "false") throw new HttpError(400, "Invalid boolean filter.");
  }
  const params = ListListingsQueryParams.parse({
    ...raw, mine: raw.mine === undefined ? undefined : raw.mine === "true", saved: raw.saved === undefined ? undefined : raw.saved === "true",
  });
  let userId = identity(req);
  if (params.mine || params.saved) userId = (await account(req)).id;
  const page = Math.min(params.page ?? 1, 10000);
  const pageSize = 24;
  const filters = and(
    params.mine ? and(eq(l.ownerId, userId!), isNull(l.deletedAt)) : published(),
    params.kind ? eq(l.kind, params.kind) : undefined,
    params.q ? or(ilike(l.title, `%${params.q.slice(0, 200)}%`), ilike(l.description, `%${params.q.slice(0, 200)}%`)) : undefined,
    params.category ? eq(l.category, params.category) : undefined,
    params.location ? ilike(l.location, `%${params.location.slice(0, 200)}%`) : undefined,
    params.universityId ? eq(l.universityId, params.universityId) : undefined,
    params.minPrice !== undefined ? gte(l.price, params.minPrice) : undefined,
    params.maxPrice !== undefined ? lte(l.price, params.maxPrice) : undefined,
    params.saved ? sql`exists(select 1 from ${s} where ${s.userId} = ${userId} and ${s.listingId} = ${l.id})` : undefined,
  );
  const sort = params.sort === "price-low" ? asc(l.price) : params.sort === "price-high" ? desc(l.price) : desc(l.createdAt);
  const [items, [total]] = await Promise.all([
    listingsQuery(userId).where(filters).orderBy(sort, desc(l.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ count: count() }).from(l).innerJoin(p, eq(l.ownerId, p.id)).where(filters),
  ]);
  res.json(ListListingsResponse.parse({ items: items.map(wireListing), total: total.count, page, pageSize }));
});
async function validateListing(body: ReturnType<typeof CreateListingBody.parse>, userId: string) {
  if (body.title.trim().length < 3 || body.description.trim().length < 20) throw new HttpError(400, "Add a descriptive title and at least 20 characters of detail.");
  await academicEntry(body.universityId, "university");
  await ownedImages(body.images, userId);
  if (!safeLink(body.resourceUrl)) throw new HttpError(400, "Use a valid http or https link.");
  if (body.closesAt && (!/^\d{4}-\d{2}-\d{2}$/.test(body.closesAt) || Number.isNaN(Date.parse(body.closesAt)) || new Date(body.closesAt).toISOString().slice(0, 10) !== body.closesAt)) throw new HttpError(400, "Provide a valid closing date.");
  if (body.status === "published" && !body.contact.trim() && !body.resourceUrl) throw new HttpError(400, "Add a public contact method or official resource link before publishing.");
}
router.post("/listings", async (req, res): Promise<void> => {
  const user = await account(req, true);
  const body = CreateListingBody.parse(req.body);
  await validateListing(body, user.id);
  const [row] = await db.insert(l).values({ ...body, title: body.title.trim(), ownerId: user.id }).returning({ id: l.id });
  res.status(201).json(CreateListingResponse.parse(await listingById(row.id, user.id)));
});
router.get("/listings/:id", async (req, res): Promise<void> => {
  const { id } = GetListingParams.parse(req.params);
  const uid = identity(req);
  let admin = false;
  if (uid) {
    const [user] = await db.select().from(p).where(eq(p.id, uid));
    admin = !!user && !user.suspended && (user.role === "admin" || user.role === "owner");
  }
  res.json(GetListingResponse.parse(await listingById(id, uid, admin)));
});
router.put("/listings/:id", async (req, res): Promise<void> => {
  const user = await account(req, true);
  const { id } = UpdateListingParams.parse(req.params);
  const body = UpdateListingBody.parse(req.body);
  await validateListing(body, user.id);
  const [row] = await db.update(l).set({ ...body, title: body.title.trim(), verified: false, updatedAt: new Date() })
    .where(and(eq(l.id, id), eq(l.ownerId, user.id), isNull(l.deletedAt))).returning({ id: l.id });
  if (!row) throw new HttpError(404, "You can only edit your own existing listings.");
  res.json(UpdateListingResponse.parse(await listingById(id, user.id)));
});
router.delete("/listings/:id", async (req, res): Promise<void> => {
  const user = await account(req);
  const { id } = DeleteListingParams.parse(req.params);
  const [row] = await db.update(l).set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(l.id, id), eq(l.ownerId, user.id), isNull(l.deletedAt))).returning({ id: l.id });
  if (!row) throw new HttpError(404, "You can only delete your own existing listings.");
  res.sendStatus(204);
});
router.post("/listings/:id/save", async (req, res): Promise<void> => {
  const user = await account(req);
  const { id } = ToggleSavedListingParams.parse(req.params);
  await listingById(id, user.id);
  const saved = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id + ":" + id}))`);
    const [exists] = await tx.select().from(s).where(and(eq(s.userId, user.id), eq(s.listingId, id)));
    if (exists) { await tx.delete(s).where(and(eq(s.userId, user.id), eq(s.listingId, id))); return false; }
    await tx.insert(s).values({ userId: user.id, listingId: id });
    return true;
  });
  res.json(ToggleSavedListingResponse.parse({ saved }));
});
router.post("/reports", async (req, res): Promise<void> => {
  const user = await account(req);
  const body = CreateReportBody.parse(req.body);
  await listingById(body.listingId, user.id);
  await db.insert(reportsTable).values({ ...body, reporterId: user.id });
  res.status(201).json(CreateReportResponse.parse({ message: "Report received. It is queued for administrator review." }));
});
export default router;
