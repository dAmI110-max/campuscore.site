import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
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
