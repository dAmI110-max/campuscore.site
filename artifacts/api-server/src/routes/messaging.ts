import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import { profilesTable as p, conversationsTable as c, messagesTable as m, notificationsTable as n } from "@workspace/db";
import { and, asc, count, desc, eq, gt, ilike, isNotNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { SendMessageBody } from "@workspace/api-zod";
import { identity } from "../lib/auth";
import { HttpError } from "../lib/errors";
import {
  socialRequest, positiveId, pageNumber, usernameInput, escapedSearch, findPeer, lockPair, hasBlock, person,
  isParticipant, unreadAfter, requireConversation, conversationQuery, conversationWire, conversationById, message, notify, unreadNotifications,
} from "../lib/social";

const router: IRouter = Router();
// Only authenticated identities reach the work; anonymous requests still hit the API-wide limiter.
const sendLimit = rateLimit({ windowMs: 60000, limit: 60, keyGenerator: req => identity(req) ?? "anonymous", standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many messages. Wait a minute and retry." } });
const startLimit = rateLimit({ windowMs: 3600000, limit: 30, keyGenerator: req => identity(req) ?? "anonymous", standardHeaders: "draft-8", legacyHeaders: false, message: { error: "Too many conversation attempts. Please try again later." } });

router.get("/people", async (req, res) => {
  const input = z.object({ q: z.string().trim().max(100).default(""), universityId: positiveId.optional(), page: pageNumber }).parse(req.query);
  res.json(await socialRequest(req, async (tx, actorId) => {
    const where = and(ne(p.id, actorId), isNotNull(p.username), isNotNull(p.universityId), eq(p.suspended, false),
      input.q ? or(ilike(p.username, `%${escapedSearch(input.q)}%`), ilike(p.displayName, `%${escapedSearch(input.q)}%`)) : undefined,
      input.universityId ? and(eq(p.universityId, input.universityId), eq(p.showAcademics, true)) : undefined);
    const rows = await tx.select({ username: p.username, displayName: p.displayName, avatarPath: p.avatarPath }).from(p).where(where).orderBy(asc(p.username)).limit(25).offset((input.page - 1) * 25);
    const [total] = await tx.select({ count: count() }).from(p).where(where);
    return { items: rows.map(person), total: total.count, page: input.page, pageSize: 25 };
  }));
});
router.get("/social/summary", async (req, res) => {
  res.json(await socialRequest(req, async (tx, actorId) => {
    const [messages] = await tx.select({ count: count() }).from(m).innerJoin(c, eq(c.id, m.conversationId))
      .where(and(isParticipant(actorId), ne(m.senderId, actorId), gt(m.id, unreadAfter(actorId))));
    const [notifications] = await tx.select({ count: count() }).from(n).where(unreadNotifications(actorId));
    return { unreadMessages: messages.count, unreadNotifications: notifications.count };
  }));
});
router.get("/conversations", async (req, res) => {
  const page = pageNumber.parse(req.query.page);
  res.json(await socialRequest(req, async (tx, actorId) => {
    const rows = await conversationQuery(tx, actorId).where(isParticipant(actorId)).orderBy(desc(c.updatedAt), desc(c.id)).limit(25).offset((page - 1) * 25);
    const [total] = await tx.select({ count: count() }).from(c).where(isParticipant(actorId));
    return { items: rows.map(row => conversationWire(row, actorId)), total: total.count, page, pageSize: 25 };
  }));
});
router.post("/conversations", startLimit, async (req, res) => {
  const { username } = z.object({ username: usernameInput }).parse(req.body);
  res.json(await socialRequest(req, async (tx, actorId) => {
    const peer = await findPeer(tx, username, actorId);
    const [participantA, participantB] = await lockPair(tx, actorId, peer.id);
    if (await hasBlock(tx, actorId, peer.id)) throw new HttpError(403, "Messaging is unavailable between these accounts.");
    await tx.insert(c).values({ participantA, participantB }).onConflictDoNothing({ target: [c.participantA, c.participantB] });
    const [row] = await tx.select({ id: c.id }).from(c).where(and(eq(c.participantA, participantA), eq(c.participantB, participantB)));
    return conversationById(tx, row.id, actorId);
  }, true));
});
router.get("/conversations/:id", async (req, res) => {
  const id = positiveId.parse(req.params.id);
  const before = positiveId.optional().parse(req.query.before);
  res.json(await socialRequest(req, async (tx, actorId) => {
    const conversation = await conversationById(tx, id, actorId);
    const rows = await tx.select().from(m).where(and(eq(m.conversationId, id), before ? lt(m.id, before) : undefined)).orderBy(desc(m.id)).limit(51);
    const slice = rows.slice(0, 50);
    return { conversation, messages: slice.reverse().map(row => message(row, actorId)), nextBefore: rows.length > 50 ? rows[49].id : null };
  }));
});
router.post("/conversations/:id/messages", sendLimit, async (req, res) => {
  const id = positiveId.parse(req.params.id);
  const input = SendMessageBody.parse(req.body);
  const body = input.body.trim();
  if (!body) throw new HttpError(400, "Write a message before sending.");
  res.json(await socialRequest(req, async (tx, actorId) => {
    const conversation = await requireConversation(tx, id, actorId);
    const peerId = conversation.participantA === actorId ? conversation.participantB : conversation.participantA;
    await lockPair(tx, actorId, peerId);
    const [retry] = await tx.select().from(m).where(and(eq(m.conversationId, id), eq(m.senderId, actorId), eq(m.clientMessageId, input.clientMessageId)));
    if (retry) {
      if (retry.body !== body) throw new HttpError(409, "That message retry key was already used. Start a new message.");
      return message(retry, actorId);
    }
    const [peer] = await tx.select().from(p).where(eq(p.id, peerId));
    if (!peer || peer.suspended || !peer.username || !peer.universityId || await hasBlock(tx, actorId, peerId)) {
      throw new HttpError(403, "Messaging is unavailable between these accounts.");
    }
    const [saved] = await tx.insert(m).values({ conversationId: id, senderId: actorId, body, clientMessageId: input.clientMessageId }).returning();
    await tx.update(c).set({ lastMessageId: saved.id, updatedAt: saved.createdAt }).where(eq(c.id, id));
    await notify(tx, { userId: peerId, eventKey: `message:${saved.id}`, kind: "message", title: "You have a new message", href: `/messages/${id}`, conversationId: id, messageId: saved.id });
    return message(saved, actorId);
  }, true));
});
router.post("/conversations/:id/read", async (req, res) => {
  const id = positiveId.parse(req.params.id);
  const { throughMessageId: through } = z.object({ throughMessageId: positiveId }).parse(req.body);
  await socialRequest(req, async (tx, actorId) => {
    const conversation = await requireConversation(tx, id, actorId);
    const [message] = await tx.select({ id: m.id }).from(m).where(and(eq(m.id, through), eq(m.conversationId, id)));
    if (!message) throw new HttpError(400, "Read marker does not belong to this conversation.");
    if (conversation.participantA === actorId) await tx.update(c).set({ readA: sql`greatest(${c.readA}, ${through})` }).where(eq(c.id, id));
    else await tx.update(c).set({ readB: sql`greatest(${c.readB}, ${through})` }).where(eq(c.id, id));
    await tx.update(n).set({ readAt: new Date() }).where(and(unreadNotifications(actorId), eq(n.conversationId, id), lte(n.messageId, through)));
  });
  res.json({ message: "Conversation read state saved." });
});
export default router;
