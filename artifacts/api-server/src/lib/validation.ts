import { db, directoryTable, uploadsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { HttpError } from "./errors";

const reserved = new Set(["admin", "administrator", "moderator", "support", "campuscore", "campus_core", "official", "system", "help", "security", "staff", "root", "api"]);
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}
export function usernameError(username: string): string | null {
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(username)) return "Use 3–24 characters: start with a letter, then letters, numbers or underscores.";
  if (reserved.has(username) || /^(admin|moderator|campus_?core|support|official|staff|security)(_|[0-9]|$)/.test(username)) return "This username is reserved.";
  return null;
}
export function safeLink(input: string): boolean {
  if (!input) return true;
  try { const u = new URL(input); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}
export async function academicEntry(id: number, kind: string, parentId?: number) {
  const [entry] = await db.select().from(directoryTable).where(and(
    eq(directoryTable.id, id), eq(directoryTable.kind, kind), eq(directoryTable.active, true),
    parentId === undefined ? undefined : eq(directoryTable.parentId, parentId),
  ));
  if (!entry) throw new HttpError(400, `Select a valid ${kind} belonging to the selected institution.`);
  return entry;
}
export async function ownedImages(paths: string[], userId: string) {
  if (!paths.length) return;
  if (paths.some(p => !/^\/objects\/uploads\/[a-f0-9-]+$/.test(p))) throw new HttpError(400, "Only finalized Campus Core image uploads are allowed.");
  const rows = await db.select().from(uploadsTable).where(and(
    inArray(uploadsTable.objectPath, paths), eq(uploadsTable.ownerId, userId), eq(uploadsTable.complete, true),
  ));
  if (new Set(paths).size !== rows.length) throw new HttpError(400, "An image is missing, unfinished, or belongs to another user.");
}
