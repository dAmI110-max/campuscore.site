import { pgTable, pgPolicy, serial, text, integer, timestamp, uuid, check, uniqueIndex, index, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profilesTable } from "./profiles";

const actor = sql`nullif(current_setting('app.user_id', true), '')`;
const staff = sql`exists (select 1 from profiles where id = ${actor} and role in ('admin','owner') and not suspended)`;
const participant = sql`participant_a = ${actor} or participant_b = ${actor}`;

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  participantA: text("participant_a").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  participantB: text("participant_b").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  readA: integer("read_a").notNull().default(0),
  readB: integer("read_b").notNull().default(0),
  lastMessageId: integer("last_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("conversation_sorted_pair", sql`${t.participantA} collate "C" < ${t.participantB} collate "C"`),
  uniqueIndex("one_direct_conversation").on(t.participantA, t.participantB),
  index("conversation_a_updated").on(t.participantA, t.updatedAt),
  index("conversation_b_updated").on(t.participantB, t.updatedAt),
  pgPolicy("conversation_participant_select", { for: "select", using: participant }),
  pgPolicy("conversation_participant_insert", { for: "insert", withCheck: participant }),
  pgPolicy("conversation_participant_update", { for: "update", using: participant, withCheck: participant }),
]).enableRLS();

export const blocksTable = pgTable("user_blocks", {
  blockerId: text("blocker_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  blockedId: text("blocked_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.blockerId, t.blockedId] }),
  check("cannot_block_self", sql`${t.blockerId} <> ${t.blockedId}`),
  index("block_incoming").on(t.blockedId, t.blockerId),
  pgPolicy("block_party_read", { for: "select", using: sql`${t.blockerId} = ${actor} or ${t.blockedId} = ${actor}` }),
  pgPolicy("block_owner_write", { for: "all", using: sql`${t.blockerId} = ${actor}`, withCheck: sql`${t.blockerId} = ${actor}` }),
]).enableRLS();

const messageParticipant = sql`exists (select 1 from conversations c where c.id = conversation_id and (c.participant_a = ${actor} or c.participant_b = ${actor}))`;
export const messagesTable = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderId: text("sender_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  clientMessageId: uuid("client_message_id").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("message_text_length", sql`length(btrim(${t.body})) between 1 and 4000`),
  uniqueIndex("message_retry_key").on(t.conversationId, t.senderId, t.clientMessageId),
  index("conversation_history").on(t.conversationId, t.id),
  pgPolicy("message_participant_read", { for: "select", using: messageParticipant }),
  pgPolicy("message_sender_insert", { for: "insert", withCheck: sql`${t.senderId} = ${actor} and ${messageParticipant}
    and not exists (select 1 from conversations c join user_blocks b on
      (b.blocker_id=c.participant_a and b.blocked_id=c.participant_b) or
      (b.blocker_id=c.participant_b and b.blocked_id=c.participant_a)
      where c.id=conversation_id)` }),
]).enableRLS();

export const userReportsTable = pgTable("user_reports", {
  id: serial("id").primaryKey(),
  reporterId: text("reporter_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  targetId: text("target_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  messageId: integer("message_id").references(() => messagesTable.id, { onDelete: "set null" }),
  snapshot: text("snapshot"),
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  decisionReason: text("decision_reason"),
  decidedBy: text("decided_by").references(() => profilesTable.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("report_other_user", sql`${t.reporterId} <> ${t.targetId}`),
  check("user_report_status", sql`${t.status} in ('pending','resolved','dismissed')`),
  check("user_report_reason_length", sql`length(btrim(${t.reason})) between 10 and 1000`),
  uniqueIndex("one_pending_user_report").on(t.reporterId, t.targetId).where(sql`${t.status} = 'pending'`),
  index("user_report_queue").on(t.status, t.createdAt),
  pgPolicy("user_report_author_or_staff_read", { for: "select", using: sql`${t.reporterId} = ${actor} or ${staff}` }),
  pgPolicy("user_report_author_insert", { for: "insert", withCheck: sql`${t.reporterId} = ${actor}` }),
  pgPolicy("user_report_staff_review", { for: "update", using: staff, withCheck: staff }),
]).enableRLS();

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  eventKey: text("event_key").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  href: text("href").notNull(),
  conversationId: integer("conversation_id").references(() => conversationsTable.id, { onDelete: "cascade" }),
  messageId: integer("message_id").references(() => messagesTable.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("notification_event_once").on(t.userId, t.eventKey),
  index("notification_user_history").on(t.userId, t.id),
  index("notification_unread").on(t.userId, t.id).where(sql`${t.readAt} is null`),
  pgPolicy("notification_recipient_read", { for: "select", using: sql`${t.userId} = ${actor}` }),
  pgPolicy("notification_recipient_update", { for: "update", using: sql`${t.userId} = ${actor}`, withCheck: sql`${t.userId} = ${actor}` }),
  pgPolicy("notification_event_insert", { for: "insert", withCheck: sql`${staff} or
    (${t.kind}='message' and exists (
      select 1 from direct_messages m join conversations c on c.id=m.conversation_id
      where m.id=${t.messageId} and c.id=${t.conversationId} and m.sender_id=${actor}
      and ${t.userId}<>${actor} and (${t.userId}=c.participant_a or ${t.userId}=c.participant_b)))` }),
]).enableRLS();
