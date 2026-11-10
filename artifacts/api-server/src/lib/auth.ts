import { clerkClient, getAuth } from "@clerk/express";
import { db, profilesTable, type Profile } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { Request } from "express";
import { HttpError } from "./errors";
import { bootstrapConfiguredOwner } from "./owner-bootstrap";
import { initialDisplayName } from "./profile-sync";
import { identityFromSupabase, getSupabaseUserById } from "./supabase-auth";
import { syncEligibilityFromEmail } from "./eligibility";

function authProvider(): "supabase" | "clerk" {
  const v = (process.env.AUTH_PROVIDER || "supabase").trim().toLowerCase();
  return v === "clerk" ? "clerk" : "supabase";
}

export async function identity(req: Request): Promise<string | null> {
  if (authProvider() === "supabase") {
    const user = await identityFromSupabase(req);
    return user?.id ?? null;
  }
  const auth = getAuth(req);
  return auth.userId ?? null;
}

export async function account(req: Request, requireComplete = false): Promise<Profile> {
  const id = await identity(req);
  if (!id) throw new HttpError(401, "Please sign in to continue.");
  await db.insert(profilesTable).values({ id }).onConflictDoNothing();
  let [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, id));
  if (!profile) throw new HttpError(500, "Your profile could not be loaded.");
  if (profile.suspended) throw new HttpError(403, "This account is suspended. Contact Campus Core administration.");

  if (authProvider() === "supabase") {
    const providerUser = await identityFromSupabase(req);
    if (providerUser) {
      if (!profile.displayName.trim() && providerUser.email) {
        const name = providerUser.email.split("@")[0] || "";
        if (name) {
          await db.update(profilesTable).set({ displayName: name, updatedAt: new Date() })
            .where(and(eq(profilesTable.id, id), eq(profilesTable.displayName, profile.displayName)));
          [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, id));
        }
      }
      profile = await syncEligibilityFromEmail(profile!, providerUser.email, providerUser.emailVerified);
    }
  } else if (!profile.displayName.trim()) {
    try {
      const providerUser = await clerkClient.users.getUser(id);
      const name = initialDisplayName(providerUser);
      if (name) {
        await db.update(profilesTable).set({ displayName: name, updatedAt: new Date() })
          .where(and(eq(profilesTable.id, id), eq(profilesTable.displayName, profile.displayName)));
        [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, id));
      }
    } catch {
      req.log?.warn("Identity metadata unavailable; retaining the existing application profile.");
    }
  }

  if (profile!.role !== "owner" && await bootstrapConfiguredOwner(id)) {
    [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, id));
  }
  if (requireComplete && (!profile!.username || !profile!.universityId)) {
    throw new HttpError(403, "Complete your university profile before publishing.");
  }
  return profile!;
}

export async function administrator(req: Request): Promise<Profile> {
  const user = await account(req);
  if (user.role !== "admin" && user.role !== "owner") throw new HttpError(403, "Administrator access required.");
  return user;
}

/** Optional: resolve provider email for the current session (Supabase path). */
export async function sessionEmail(req: Request): Promise<string | null> {
  if (authProvider() === "supabase") {
    const user = await identityFromSupabase(req);
    return user?.email ?? null;
  }
  const id = await identity(req);
  if (!id) return null;
  try {
    const u = await clerkClient.users.getUser(id);
    return u.emailAddresses.find(e => e.id === u.primaryEmailAddressId)?.emailAddress ?? null;
  } catch {
    return null;
  }
}
