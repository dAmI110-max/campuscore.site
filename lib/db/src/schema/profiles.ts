import { pgTable, pgPolicy, text, integer, boolean, timestamp, check, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { directoryTable } from "./directory";
import { socialRole } from "./roles";

export const profilesTable = pgTable("profiles", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  username: text("username").unique(),
  countryId: integer("country_id").references(() => directoryTable.id),
  universityId: integer("university_id").references(() => directoryTable.id),
  facultyId: integer("faculty_id").references(() => directoryTable.id),
  departmentId: integer("department_id").references(() => directoryTable.id),
  bio: text("bio").notNull().default(""),
  avatarPath: text("avatar_path"),
  showAcademics: boolean("show_academics").notNull().default(true),
  role: text("role").notNull().default("student"),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("username_normalized", sql`${t.username} is null or (${t.username} = lower(${t.username}) and ${t.username} ~ '^[a-z][a-z0-9_]{2,23}$')`),
  check("profile_role", sql`${t.role} in ('student','admin','owner')`),
  uniqueIndex("one_platform_owner").on(t.role).where(sql`${t.role} = 'owner'`),
  pgPolicy("social_profile_lookup", { for: "select", to: socialRole,
    using: sql`${t.id} = nullif(current_setting('app.user_id', true), '') or ${t.username} is not null` }),
]).enableRLS();
export const insertProfileSchema = createInsertSchema(profilesTable).omit({ createdAt: true, updatedAt: true });
export type Profile = typeof profilesTable.$inferSelect;
