import { pgTable, serial, text, integer, doublePrecision, boolean, timestamp, date, index, check, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { profilesTable } from "./profiles";
import { directoryTable } from "./directory";

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => profilesTable.id),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  price: doublePrecision("price"),
  location: text("location").notNull().default(""),
  universityId: integer("university_id").notNull().references(() => directoryTable.id),
  condition: text("condition").notNull().default(""),
  status: text("status").notNull().default("draft"),
  images: text("images").array().notNull().default(sql`'{}'::text[]`),
  contact: text("contact").notNull().default(""),
  closesAt: date("closes_at", { mode: "string" }),
  resourceUrl: text("resource_url").notNull().default(""),
  verified: boolean("verified").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("listing_browse").on(t.kind, t.status, t.universityId, t.createdAt),
  index("listing_owner").on(t.ownerId),
  check("listing_kind", sql`${t.kind} in ('marketplace','accommodation','services','opportunities','study','communities','events')`),
  check("listing_status", sql`${t.status} in ('draft','published','unavailable')`),
  check("listing_nonnegative_price", sql`${t.price} is null or (${t.price} >= 0 and ${t.price} <= 1000000000)`),
]).enableRLS();
export const insertListingSchema = createInsertSchema(listingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Listing = typeof listingsTable.$inferSelect;

export const savedListingsTable = pgTable("saved_listings", {
  userId: text("user_id").notNull().references(() => profilesTable.id),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id),
}, t => [primaryKey({ columns: [t.userId, t.listingId] })]).enableRLS();
export const insertSavedListingSchema = createInsertSchema(savedListingsTable);
