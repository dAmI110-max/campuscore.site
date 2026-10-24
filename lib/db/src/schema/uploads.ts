import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { profilesTable } from "./profiles";

export const uploadsTable = pgTable("uploads", {
  objectPath: text("object_path").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => profilesTable.id),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  complete: boolean("complete").notNull().default(false),
  finalizedPath: text("finalized_path"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
export const insertUploadSchema = createInsertSchema(uploadsTable).omit({ createdAt: true });
