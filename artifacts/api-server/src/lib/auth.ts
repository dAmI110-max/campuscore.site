import { getAuth } from "@clerk/express";
import { db, profilesTable, type Profile } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { HttpError } from "./errors";

export function identity(req: Request): string | null {
  const auth = getAuth(req);
  return auth.userId ?? null;
}

export async function account(req: Request, requireComplete = false): Promise<Profile> {
  const id = identity(req);
  if (!id) throw new HttpError(401, "Please sign in to continue.");
  await db.insert(profilesTable).values({ id }).onConflictDoNothing();
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, id));
  if (!profile) throw new HttpError(500, "Your profile could not be loaded.");
  if (profile.suspended) throw new HttpError(403, "This account is suspended. Contact Campus Core administration.");
  if (requireComplete && (!profile.username || !profile.universityId)) {
    throw new HttpError(403, "Complete your university profile before publishing.");
  }
  return profile;
}

export async function administrator(req: Request): Promise<Profile> {
  const user = await account(req);
  if (user.role !== "admin") throw new HttpError(403, "Administrator access required.");
  return user;
}
