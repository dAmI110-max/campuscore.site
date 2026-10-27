import { clerkClient, getAuth } from "@clerk/express";
import { db, profilesTable, type Profile } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { Request } from "express";
import { HttpError } from "./errors";
import { bootstrapConfiguredOwner } from "./owner-bootstrap";
import { initialDisplayName } from "./profile-sync";

export function identity(req: Request): string | null {
  const auth = getAuth(req);
  return auth.userId ?? null;
}

export async function account(req: Request, requireComplete = false): Promise<Profile> {
  const id = identity(req);
  if (!id) throw new HttpError(401, "Please sign in to continue.");
  await db.insert(profilesTable).values({ id }).onConflictDoNothing();
  let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, id));
  if (!profile) throw new HttpError(500, "Your profile could not be loaded.");
  if (profile.suspended) throw new HttpError(403, "This account is suspended. Contact Campus Core administration.");
  if (!profile.displayName.trim()) {
    // Resolve only the verified session's subject, never a browser-supplied ID
    // or an email match. Do not overwrite a concurrent student profile edit.
    try {
      const providerUser = await clerkClient.users.getUser(id);
      const name = initialDisplayName(providerUser);
      if (name) {
        await db.update(profilesTable).set({ displayName: name, updatedAt: new Date() })
          .where(and(eq(profilesTable.id, id), eq(profilesTable.displayName, profile.displayName)));
        [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, id));
      }
    } catch {
      // Identity-provider metadata is optional. The student can still complete
      // their app profile when Clerk's management API is temporarily unavailable.
      req.log?.warn("Identity metadata unavailable; retaining the existing application profile.");
    }
  }
  if (profile.role !== "owner" && await bootstrapConfiguredOwner(id)) {
    [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, id));
  }
  if (requireComplete && (!profile.username || !profile.universityId)) {
    throw new HttpError(403, "Complete your university profile before publishing.");
  }
  return profile;
}

export async function administrator(req: Request): Promise<Profile> {
  const user = await account(req);
  if (user.role !== "admin" && user.role !== "owner") throw new HttpError(403, "Administrator access required.");
  return user;
}
