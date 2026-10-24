import { clerkClient } from "@clerk/express";
import { db, profilesTable as p, auditTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

/** One-time verified identity binding, never "the first person to sign up". */
export async function bootstrapConfiguredOwner(userId: string): Promise<boolean> {
  const configuredEmail = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  if (!configuredEmail) return false;
  const [existing] = await db.select({ id: p.id }).from(p).where(eq(p.role, "owner"));
  if (existing) return existing.id === userId;
  const user = await clerkClient.users.getUser(userId);
  if (!user.emailAddresses.some(email => email.emailAddress.trim().toLowerCase() === configuredEmail && email.verification?.status === "verified")) return false;
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('campus-core-access-control'))`);
    const [owner] = await tx.select({ id: p.id }).from(p).where(eq(p.role, "owner"));
    if (owner) return owner.id === userId;
    const [grant] = await tx.select({ id: auditTable.id }).from(auditTable).where(and(eq(auditTable.action, "initial-owner-grant"), eq(auditTable.targetId, userId))).limit(1);
    // Never silently restore a grant that an operator deliberately removed.
    if (grant) return false;
    await tx.insert(p).values({ id: userId }).onConflictDoNothing();
    const [profile] = await tx.select().from(p).where(eq(p.id, userId)).for("update");
    if (profile.suspended) return false;
    await tx.update(p).set({ role: "owner", updatedAt: new Date() }).where(eq(p.id, userId));
    await tx.insert(auditTable).values({
      actorId: userId, action: "initial-owner-grant", targetId: userId,
      reason: "Server verified the configured owner email against this environment's identity provider.",
    });
    return true;
  });
}
