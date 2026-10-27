import { pgTable, pgPolicy, text, integer, boolean, date, timestamp, serial, check, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profilesTable } from "./profiles";
import { directoryTable } from "./directory";
import { socialRole } from "./roles";

const actor = sql`nullif(current_setting('app.user_id', true), '')`;
const staff = sql`exists(select 1 from profiles p where p.id = ${actor} and p.role in ('admin','owner') and not p.suspended)`;
const discoverable = sql`active and not hidden
  and exists(select 1 from profiles p where p.id = user_id and not p.suspended and p.username is not null)
  and not exists(select 1 from user_blocks b where
    (b.blocker_id = ${actor} and b.blocked_id = user_id) or
    (b.blocked_id = ${actor} and b.blocker_id = user_id))`;

export const roommateProfilesTable = pgTable("roommate_profiles", {
  userId: text("user_id").primaryKey().references(() => profilesTable.id, { onDelete: "cascade" }),
  universityId: integer("university_id").notNull().references(() => directoryTable.id),
  campus: text("campus").notNull(),
  accommodationType: text("accommodation_type").notNull(),
  budgetMin: integer("budget_min").notNull(),
  budgetMax: integer("budget_max").notNull(),
  moveInDate: date("move_in_date", { mode: "string" }).notNull(),
  sharing: text("sharing").notNull(),
  smoking: text("smoking").notNull(),
  cleanliness: text("cleanliness").notNull(),
  sleep: text("sleep").notNull(),
  study: text("study").notNull(),
  about: text("about").notNull().default(""),
  visibleFields: text("visible_fields").array().notNull(),
  active: boolean("active").notNull().default(true),
  hidden: boolean("hidden").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("roommate_budget", sql`${t.budgetMin} >= 0 and ${t.budgetMax} >= ${t.budgetMin} and ${t.budgetMax} <= 100000000`),
  check("roommate_accommodation", sql`${t.accommodationType} in ('hostel','flat','self-contained','any')`),
  check("roommate_sharing", sql`${t.sharing} in ('private','shared','either')`),
  check("roommate_smoking", sql`${t.smoking} in ('non-smoker','smoker','either')`),
  check("roommate_cleanliness", sql`${t.cleanliness} in ('tidy','flexible')`),
  check("roommate_sleep", sql`${t.sleep} in ('early','late','flexible')`),
  check("roommate_study", sql`${t.study} in ('quiet','social','flexible')`),
  check("roommate_visibility", sql`${t.visibleFields} <@ ARRAY['campus','budget','moveInDate','preferences','about']::text[]`),
  index("roommate_university_updated").on(t.universityId, t.updatedAt),
  index("roommate_budget_search").on(t.budgetMin, t.budgetMax),
  pgPolicy("roommate_read", { for: "select", to: socialRole, using: sql`${t.userId} = ${actor} or (${discoverable})` }),
  pgPolicy("roommate_staff_read", { for: "select", to: socialRole, using: staff }),
  pgPolicy("roommate_create", { for: "insert", to: socialRole, withCheck: sql`${t.userId} = ${actor} and not hidden` }),
  pgPolicy("roommate_edit", { for: "update", to: socialRole, using: sql`${t.userId} = ${actor}`, withCheck: sql`${t.userId} = ${actor}` }),
  pgPolicy("roommate_staff_edit", { for: "update", to: socialRole, using: staff, withCheck: staff }),
]).enableRLS();

export const roommateInterestsTable = pgTable("roommate_interests", {
  id: serial("id").primaryKey(),
  senderId: text("sender_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("roommate_not_self", sql`${t.senderId} <> ${t.recipientId}`),
  check("roommate_interest_status", sql`${t.status} in ('pending','accepted','declined','cancelled')`),
  uniqueIndex("roommate_interest_pair").on(t.senderId, t.recipientId),
  index("roommate_incoming").on(t.recipientId, t.updatedAt),
  pgPolicy("roommate_interest_read", { for: "select", to: socialRole, using: sql`${t.senderId} = ${actor} or ${t.recipientId} = ${actor}` }),
  pgPolicy("roommate_interest_create", { for: "insert", to: socialRole, withCheck: sql`${t.senderId} = ${actor} and ${t.status} = 'pending'` }),
  pgPolicy("roommate_interest_edit", { for: "update", to: socialRole, using: sql`${t.senderId} = ${actor} or ${t.recipientId} = ${actor}`, withCheck: sql`${t.senderId} = ${actor} or ${t.recipientId} = ${actor}` }),
]).enableRLS();
