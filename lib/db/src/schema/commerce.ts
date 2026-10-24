import { pgTable, integer, text, timestamp, bigint, check, index, uniqueIndex, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { profilesTable } from "./profiles";
import { listingsTable } from "./listings";

export const platformCommerceTable = pgTable("platform_commerce", {
  id: integer("id").primaryKey().default(1),
  publicLaunchAt: timestamp("public_launch_at", { withTimezone: true }),
  updatedBy: text("updated_by").references(() => profilesTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [check("singleton_commerce_settings", sql`${t.id} = 1`)]).enableRLS();

// This ledger is a preparation boundary, not a working payment integration.
// No public endpoint can mark an order paid, activate Premium or release funds.
export const commerceOrdersTable = pgTable("commerce_orders", {
  id: text("id").primaryKey(),
  buyerId: text("buyer_id").notNull().references(() => profilesTable.id),
  sellerId: text("seller_id").references(() => profilesTable.id),
  listingId: integer("listing_id").references(() => listingsTable.id),
  kind: text("kind").notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("NGN"),
  status: text("status").notNull().default("pending"),
  provider: text("provider"),
  providerReference: text("provider_reference"),
  processingFeeMinor: bigint("processing_fee_minor", { mode: "number" }),
  platformFeeMinor: bigint("platform_fee_minor", { mode: "number" }),
  refundedMinor: bigint("refunded_minor", { mode: "number" }).notNull().default(0),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("commerce_provider_reference").on(t.provider, t.providerReference),
  index("commerce_buyer_orders").on(t.buyerId, t.createdAt),
  index("commerce_seller_orders").on(t.sellerId, t.createdAt),
  check("commerce_order_kind", sql`${t.kind} in ('marketplace','premium')`),
  check("commerce_order_status", sql`${t.status} in ('pending','paid','failed','cancelled','refunded','partially_refunded','disputed')`),
  check("commerce_order_currency", sql`${t.currency} = 'NGN'`),
  check("commerce_order_amount", sql`${t.amountMinor} > 0 and ${t.amountMinor} <= 9007199254740991 and ${t.refundedMinor} >= 0 and ${t.refundedMinor} <= ${t.amountMinor}`),
  check("commerce_known_fees", sql`(${t.platformFeeMinor} is null or ${t.platformFeeMinor} between 0 and ${t.amountMinor}) and (${t.processingFeeMinor} is null or ${t.processingFeeMinor} between 0 and ${t.amountMinor})`),
  check("commerce_verified_status", sql`${t.status} not in ('paid','refunded','partially_refunded','disputed') or (${t.verifiedAt} is not null and ${t.providerReference} is not null and ${t.provider} is not null)`),
  check("commerce_premium_price", sql`${t.kind} <> 'premium' or ${t.amountMinor} = 200000`),
  check("commerce_marketplace_parties", sql`${t.kind} <> 'marketplace' or (${t.sellerId} is not null and ${t.listingId} is not null and ${t.sellerId} <> ${t.buyerId})`),
]).enableRLS();

export const commerceEventsTable = pgTable("commerce_events", {
  id: serial("id").primaryKey(),
  orderId: text("order_id").notNull().references(() => commerceOrdersTable.id),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  digest: text("digest").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("commerce_event_idempotency").on(t.provider, t.eventId)]).enableRLS();
export const insertCommerceOrderSchema = createInsertSchema(commerceOrdersTable).omit({ createdAt: true });
export const insertCommerceEventSchema = createInsertSchema(commerceEventsTable).omit({ id: true, createdAt: true });
export const insertPlatformCommerceSchema = createInsertSchema(platformCommerceTable).omit({ updatedAt: true });
