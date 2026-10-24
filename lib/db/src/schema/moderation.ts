import { pgTable, serial, text, integer, timestamp, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { profilesTable } from "./profiles";
import { listingsTable } from "./listings";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  reporterId: text("reporter_id").notNull().references(() => profilesTable.id),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
export const insertReportSchema = createInsertSchema(reportsTable).omit({ id: true, createdAt: true });
export const auditTable = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
export const insertAuditSchema = createInsertSchema(auditTable).omit({ id: true, createdAt: true });

export const accessRequestsTable = pgTable("access_requests", {
  id: serial("id").primaryKey(),
  requesterId: text("requester_id").notNull().references(() => profilesTable.id),
  targetId: text("target_id").notNull().references(() => profilesTable.id),
  action: text("action").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  decisionReason: text("decision_reason"),
  decidedBy: text("decided_by").references(() => profilesTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, t => [
  check("access_request_action", sql`${t.action} in ('promote','demote')`),
  check("access_request_status", sql`${t.status} in ('pending','approved','rejected','cancelled')`),
  uniqueIndex("one_pending_access_request").on(t.requesterId, t.targetId, t.action).where(sql`${t.status} = 'pending'`),
]).enableRLS();
