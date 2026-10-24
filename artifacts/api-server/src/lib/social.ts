import type { Request } from "express";
import { db, profilesTable as p, conversationsTable as c, messagesTable as m, blocksTable as b, notificationsTable as n } from "@workspace/db";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { account } from "./auth";
import { HttpError } from "./errors";

export type SocialTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const positiveId = z.coerce.number().int().min(1).max(2147483647);
export const pageNumber = z.coerce.number().int().min(1).max(10000).default(1);
export const usernameInput = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{2,23}$/);
export const escapedSearch = (text: string) => text.replace(/[\\%_]/g, "\\$&");

export async function setSocialActor(tx: SocialTx, id: string) {
  // Transaction-local only: pooled connections cannot retain another user's identity.
  await tx.execute(sql`select set_config('app.user_id', ${id}, true)`);
}

export async function socialRequest<T>(req: Request, work: (tx: SocialTx, actorId: string) => Promise<T>, complete = false, staff = false) {
  const actor = await account(req, complete);
  return db.transaction(async tx => {
    await setSocialActor(tx, actor.id);
    const [fresh] = await tx.select().from(p).where(eq(p.id, actor.id)).for("share");
    if (!fresh || fresh.suspended) throw new HttpError(403, "This account is unavailable.");
    if (staff && fresh.role !== "owner" && fresh.role !== "admin") throw new HttpError(403, "Administrator access required.");
    // The pooled service role may be a database owner/superuser. Downgrade before
    // any communication-table access, and restore automatically at transaction end.
    await tx.execute(sql`set local role campus_core_social`);
    return work(tx, actor.id);
  });
}

export async function lockPair(tx: SocialTx, first: string, second: string) {
  const [a, b] = [first, second].sort();
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"campus-core-dm:" + a + ":" + b}))`);
  return [a, b] as const;
}

export const isParticipant = (actorId: string) => or(eq(c.participantA, actorId), eq(c.participantB, actorId));
export const unreadAfter = (actorId: string) => sql`case when ${c.participantA}=${actorId} then ${c.readA} else ${c.readB} end`;
export function person(profile: { username: string | null; displayName: string; avatarPath: string | null }) {
  return { username: profile.username ?? "", displayName: profile.displayName, avatarPath: profile.avatarPath };
}
export function message(row: typeof m.$inferSelect, actorId: string) {
  return { id: row.id, body: row.body, isMine: row.senderId === actorId, createdAt: row.createdAt };
}

export async function findPeer(tx: SocialTx, username: string, actorId: string, requireActive = true) {
  const [peer] = await tx.select().from(p).where(eq(p.username, username));
  if (!peer || (requireActive && (peer.suspended || !peer.universityId))) throw new HttpError(404, "This account is unavailable.");
  if (peer.id === actorId) throw new HttpError(400, "Choose another account.");
  return peer;
}

export async function hasBlock(tx: SocialTx, first: string, second: string) {
  const [block] = await tx.select({ blockerId: b.blockerId }).from(b).where(or(
    and(eq(b.blockerId, first), eq(b.blockedId, second)),
    and(eq(b.blockerId, second), eq(b.blockedId, first)),
  )).limit(1);
  return !!block;
}

export async function requireConversation(tx: SocialTx, id: number, actorId: string) {
  const [conversation] = await tx.select().from(c).where(and(eq(c.id, id), isParticipant(actorId)));
  if (!conversation) throw new HttpError(404, "Conversation not found.");
  return conversation;
}

export function conversationQuery(tx: SocialTx, actorId: string) {
  return tx.select({
    id: c.id, updatedAt: c.updatedAt,
    peer: { username: p.username, displayName: p.displayName, avatarPath: p.avatarPath },
    peerSuspended: p.suspended, peerUniversityId: p.universityId,
    lastMessage: m,
    unreadCount: sql<number>`(select count(*)::int from direct_messages dm where dm.conversation_id=${c.id} and dm.sender_id<>${actorId} and dm.id>${unreadAfter(actorId)})`,
    blockedByMe: sql<boolean>`exists(select 1 from user_blocks bl where bl.blocker_id=${actorId} and bl.blocked_id=${p.id})`,
    blocked: sql<boolean>`exists(select 1 from user_blocks bl where (bl.blocker_id=${actorId} and bl.blocked_id=${p.id}) or (bl.blocker_id=${p.id} and bl.blocked_id=${actorId}))`,
  }).from(c)
    .innerJoin(p, eq(p.id, sql`case when ${c.participantA}=${actorId} then ${c.participantB} else ${c.participantA} end`))
    .leftJoin(m, eq(m.id, c.lastMessageId));
}
type ConversationRow = Awaited<ReturnType<typeof conversationQuery>>[number];
export function conversationWire(row: ConversationRow, actorId: string) {
  return {
    id: row.id, peer: person(row.peer), updatedAt: row.updatedAt,
    unreadCount: row.unreadCount, blockedByMe: row.blockedByMe,
    canMessage: !row.blocked && !row.peerSuspended && !!row.peerUniversityId && !!row.peer.username,
    lastMessage: row.lastMessage ? message(row.lastMessage, actorId) : null,
  };
}
export async function conversationById(tx: SocialTx, id: number, actorId: string) {
  const [row] = await conversationQuery(tx, actorId).where(and(eq(c.id, id), isParticipant(actorId)));
  if (!row) throw new HttpError(404, "Conversation not found.");
  return conversationWire(row, actorId);
}
export async function notify(tx: SocialTx, values: typeof n.$inferInsert) {
  // Producers serialize/idempotently check their source event first. Plain INSERT
  // keeps sender access write-only; ON CONFLICT would require recipient SELECT.
  // The unique (recipient,event) constraint is the final duplicate safeguard.
  await tx.insert(n).values(values);
}
export function notificationWire(row: typeof n.$inferSelect) {
  return { id: row.id, kind: row.kind, title: row.title, href: row.href, createdAt: row.createdAt, readAt: row.readAt };
}
export const unreadNotifications = (actorId: string) => and(eq(n.userId, actorId), isNull(n.readAt));
