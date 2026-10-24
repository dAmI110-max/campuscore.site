import { pgTable, serial, text, integer, boolean, timestamp, uniqueIndex, check, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

export const directoryTable = pgTable("academic_directory", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  parentId: integer("parent_id").references((): AnyPgColumn => directoryTable.id),
  sourceUrl: text("source_url").notNull(),
  active: boolean("active").notNull().default(true),
}, t => [
  uniqueIndex("directory_parent_name").on(t.kind, t.parentId, t.name),
  check("directory_kind", sql`${t.kind} in ('country','university','faculty','department')`),
]).enableRLS();
export const insertDirectorySchema = createInsertSchema(directoryTable).omit({ id: true });
export type DirectoryEntry = typeof directoryTable.$inferSelect;

export const institutionRequestsTable = pgTable("institution_requests", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  parentId: integer("parent_id").references(() => directoryTable.id),
  sourceUrl: text("source_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
export const insertInstitutionRequestSchema = createInsertSchema(institutionRequestsTable).omit({ id: true, createdAt: true });
