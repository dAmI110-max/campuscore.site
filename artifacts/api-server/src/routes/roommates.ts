import { Router, type ErrorRequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { and, count, desc, eq, ilike, lte, gte, ne, or, sql } from "drizzle-orm";
import { roommateProfilesTable as r, roommateInterestsTable as i, profilesTable as p, directoryTable as d, conversationsTable as c, auditTable } from "@workspace/db";
import {
  ListRoommatesQueryParams, ListRoommatesResponse, GetMyRoommateResponse, SaveMyRoommateBody, SaveMyRoommateResponse,
  GetRoommateInterestsQueryParams, GetRoommateInterestsResponse, SendRoommateInterestBody, SendRoommateInterestResponse,
  RespondRoommateInterestParams, RespondRoommateInterestBody, RespondRoommateInterestResponse,
  OpenRoommateConversationParams, OpenRoommateConversationResponse, ModerateRoommateParams, ModerateRoommateBody, ModerateRoommateResponse,
} from "@workspace/api-zod";
import { identity } from "../lib/auth";
import { academicEntry } from "../lib/validation";
import { escapedSearch, findPeer, hasBlock, lockPair, socialRequest, type SocialTx } from "../lib/social";
import { interestTransition, roommateReasons, validateRoommate, visibleRoommate } from "../lib/roommates";
import { HttpError } from "../lib/errors";

const router = Router();
export const ROOMMATE_SETUP_MESSAGE = "Roommate Finder is awaiting database setup and privacy verification. Existing Campus Core features are unaffected.";
// Never touch newly introduced tables until an operator approves/applies the
// reviewed migration and verifies grants. No DDL or auto-enable at startup.
router.use(["/roommates", "/admin/roommates"], (req, _res, next) => {
  if (!identity(req)) return next(new HttpError(401, "Please sign in to continue."));
  if (process.env.ROOMMATE_FINDER_ENABLED !== "true") return next(new HttpError(503, ROOMMATE_SETUP_MESSAGE));
  next();
});
const writes = rateLimit({
  windowMs: 60_000, limit: 20, keyGenerator: req => identity(req) ?? "anonymous",
  standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many roommate changes. Wait a minute and retry." },
});
async function own(tx: SocialTx, actor: string) {
  const [row] = await tx.select().from(r).where(eq(r.userId, actor));
  return row ?? null;
}
async function activePair(tx: SocialTx, actor: string, peerId: string) {
  if (await hasBlock(tx, actor, peerId)) throw new HttpError(403, "This connection is unavailable.");
  const rows = await tx.select().from(r).where(or(eq(r.userId, actor), eq(r.userId, peerId)));
  if (rows.length !== 2 || rows.some(row => !row.active || row.hidden)) throw new HttpError(403, "Both students need active, available roommate profiles.");
  const [peer] = await tx.select().from(p).where(eq(p.id, peerId));
  if (!peer || peer.suspended || !peer.username || !peer.universityId) throw new HttpError(404, "This account is unavailable.");
}
router.get("/roommates/mine", async (req, res) => {
  res.json(GetMyRoommateResponse.parse(await socialRequest(req, async (tx, actor) => {
    const row = await own(tx, actor);
    return { profile: row ? SaveMyRoommateBody.parse(row) : null };
  })));
});
router.put("/roommates/mine", writes, async (req, res) => {
  const input = validateRoommate(SaveMyRoommateBody.parse(req.body));
  await academicEntry(input.universityId, "university");
  if (input.campus.length < 2) throw new HttpError(400, "Enter a campus or broad area, not a precise address.");
  const saved = await socialRequest(req, async (tx, actor) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"roommate-profile:" + actor}))`);
    const previous = await own(tx, actor);
    if (previous) {
      const [row] = await tx.update(r).set({ ...input, updatedAt: new Date() }).where(eq(r.userId, actor)).returning();
      return row;
    }
    const [row] = await tx.insert(r).values({ ...input, userId: actor }).returning();
    return row;
  }, true);
  res.json(SaveMyRoommateResponse.parse(saved));
});
router.get("/roommates", async (req, res) => {
  const input = ListRoommatesQueryParams.parse(req.query);
  if (input.minBudget !== undefined && input.maxBudget !== undefined && input.minBudget > input.maxBudget) throw new HttpError(400, "Minimum budget cannot exceed maximum budget.");
  const page = input.page ?? 1;
  res.json(ListRoommatesResponse.parse(await socialRequest(req, async (tx, actor) => {
    const mine = await own(tx, actor);
    const visible = (field: string) => sql`${field} = any(${r.visibleFields})`;
    // Hidden values cannot be inferred by search/filter results or match reasons.
    const where = and(
      ne(r.userId, actor), eq(r.active, true), eq(r.hidden, false), eq(p.suspended, false),
      sql`not exists (select 1 from user_blocks b where
        (b.blocker_id = ${actor} and b.blocked_id = ${r.userId}) or
        (b.blocked_id = ${actor} and b.blocker_id = ${r.userId}))`,
      input.universityId ? eq(r.universityId, input.universityId) : undefined,
      input.campus ? and(visible("campus"), ilike(r.campus, `%${escapedSearch(input.campus)}%`)) : undefined,
      input.q ? or(ilike(p.displayName, `%${escapedSearch(input.q)}%`),
        and(visible("about"), ilike(r.about, `%${escapedSearch(input.q)}%`))) : undefined,
      input.minBudget !== undefined ? and(visible("budget"), gte(r.budgetMax, input.minBudget)) : undefined,
      input.maxBudget !== undefined ? and(visible("budget"), lte(r.budgetMin, input.maxBudget)) : undefined,
      input.accommodationType ? eq(r.accommodationType, input.accommodationType) : undefined,
      input.sharing ? and(visible("preferences"), eq(r.sharing, input.sharing)) : undefined,
      input.smoking ? and(visible("preferences"), eq(r.smoking, input.smoking)) : undefined,
    );
    const rows = await tx.select({ roommate: r, name: p.displayName, username: p.username, universityName: d.name })
      .from(r).innerJoin(p, eq(p.id, r.userId)).innerJoin(d, eq(d.id, r.universityId))
      .where(where).orderBy(desc(r.updatedAt), r.userId).limit(24).offset((page - 1) * 24);
    const [total] = await tx.select({ count: count() }).from(r).innerJoin(p, eq(p.id, r.userId)).innerJoin(d, eq(d.id, r.universityId)).where(where);
    return { page, total: total.count, items: rows.map(row => ({
      username: row.username!, displayName: row.name, universityId: row.roommate.universityId,
      universityName: row.universityName, accommodationType: row.roommate.accommodationType,
      ...visibleRoommate(row.roommate as Parameters<typeof visibleRoommate>[0]),
      reasons: roommateReasons(mine as Parameters<typeof roommateReasons>[0], row.roommate as Parameters<typeof roommateReasons>[1]),
    })) };
  })));
});
router.get("/roommates/interests", async (req, res) => {
  const { page = 1 } = GetRoommateInterestsQueryParams.parse(req.query);
  res.json(GetRoommateInterestsResponse.parse(await socialRequest(req, async (tx, actor) => {
    const where = or(eq(i.senderId, actor), eq(i.recipientId, actor));
    const rows = await tx.select({ request: i, username: p.username, displayName: p.displayName, suspended: p.suspended })
      .from(i).innerJoin(p, sql`${p.id} = case when ${i.senderId} = ${actor} then ${i.recipientId} else ${i.senderId} end`)
      .where(where).orderBy(desc(i.updatedAt), desc(i.id)).limit(25).offset((page - 1) * 25);
    const [total] = await tx.select({ count: count() }).from(i).where(where);
    const items = await Promise.all(rows.map(async row => {
      const peerId = row.request.senderId === actor ? row.request.recipientId : row.request.senderId;
      let canMessage = false;
      if (row.request.status === "accepted" && !row.suspended) {
        try { await activePair(tx, actor, peerId); canMessage = true; } catch (error) { if (!(error instanceof HttpError)) throw error; }
      }
      return {
        id: row.request.id, username: row.username ?? "", displayName: row.displayName,
        incoming: row.request.recipientId === actor, status: row.request.status, canMessage,
      };
    }));
    return { items, total: total.count, page };
  })));
});
router.post("/roommates/interests", writes, async (req, res) => {
  const input = SendRoommateInterestBody.parse(req.body);
  await socialRequest(req, async (tx, actor) => {
    const peer = await findPeer(tx, input.username, actor);
    await lockPair(tx, actor, peer.id);
    await activePair(tx, actor, peer.id);
    const [reverse] = await tx.select().from(i).where(and(eq(i.senderId, peer.id), eq(i.recipientId, actor)));
    if (reverse && ["pending", "accepted"].includes(reverse.status)) throw new HttpError(409, "This student has already expressed interest. Open your requests to respond.");
    const [previous] = await tx.select().from(i).where(and(eq(i.senderId, actor), eq(i.recipientId, peer.id)));
    if (previous) {
      if (["pending", "accepted"].includes(previous.status)) return;
      // Declining is not permission to repeatedly send unwanted requests.
      throw new HttpError(409, "A request already exists for this student.");
    }
    await tx.insert(i).values({ senderId: actor, recipientId: peer.id });
  }, true);
  res.json(SendRoommateInterestResponse.parse({ message: "Your interest was saved. Contact becomes available after acceptance." }));
});
router.patch("/roommates/interests/:id", writes, async (req, res) => {
  const { id } = RespondRoommateInterestParams.parse(req.params);
  const { action } = RespondRoommateInterestBody.parse(req.body);
  await socialRequest(req, async (tx, actor) => {
    const [row] = await tx.select().from(i).where(eq(i.id, id));
    if (!row) throw new HttpError(404, "Request not found.");
    await lockPair(tx, row.senderId, row.recipientId);
    const [fresh] = await tx.select().from(i).where(eq(i.id, id));
    const status = interestTransition(fresh, actor, action);
    if (status === "accepted") await activePair(tx, actor, fresh.senderId);
    await tx.update(i).set({ status, updatedAt: new Date() }).where(eq(i.id, id));
  }, true);
  res.json(RespondRoommateInterestResponse.parse({ message: "Request updated." }));
});
router.post("/roommates/interests/:id/conversation", writes, async (req, res) => {
  const { id } = OpenRoommateConversationParams.parse(req.params);
  res.json(OpenRoommateConversationResponse.parse(await socialRequest(req, async (tx, actor) => {
    const [row] = await tx.select().from(i).where(eq(i.id, id));
    if (!row) throw new HttpError(404, "Request not found.");
    const [a, b] = await lockPair(tx, row.senderId, row.recipientId);
    const [fresh] = await tx.select().from(i).where(eq(i.id, id));
    if (fresh.status !== "accepted") throw new HttpError(403, "Both students must express interest before connecting here.");
    const peer = fresh.senderId === actor ? fresh.recipientId : fresh.senderId;
    await activePair(tx, actor, peer);
    const [existing] = await tx.select({ id: c.id }).from(c).where(and(eq(c.participantA, a), eq(c.participantB, b)));
    if (existing) return existing;
    const [created] = await tx.insert(c).values({ participantA: a, participantB: b }).returning({ id: c.id });
    return created;
  }, true)));
});
router.patch("/admin/roommates/:username/visibility", writes, async (req, res) => {
  const { username } = ModerateRoommateParams.parse(req.params);
  const body = ModerateRoommateBody.parse(req.body);
  await socialRequest(req, async (tx, actor) => {
    const [target] = await tx.select().from(p).where(eq(p.username, username));
    if (!target) throw new HttpError(404, "Profile not found.");
    const [changed] = await tx.update(r).set({ hidden: body.hidden, updatedAt: new Date() }).where(eq(r.userId, target.id)).returning({ id: r.userId });
    if (!changed) throw new HttpError(404, "Roommate profile not found.");
    await tx.insert(auditTable).values({ actorId: actor, action: body.hidden ? "hide-roommate" : "restore-roommate", targetId: target.id, reason: body.reason });
  }, false, true);
  res.json(ModerateRoommateResponse.parse({ message: "Visibility updated and recorded in the staff audit log." }));
});
const setupErrors: ErrorRequestHandler = (err, req, _res, next) => {
  const code = err?.code ?? err?.cause?.code;
  if (["42P01", "42703", "42501"].includes(code)) {
    req.log?.error({ code }, "Roommate schema or restricted-role grants are not ready");
    next(new HttpError(503, ROOMMATE_SETUP_MESSAGE));
  } else next(err);
};
router.use(setupErrors);
export default router;
