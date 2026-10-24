import { db, profilesTable as p, accessRequestsTable as r, auditTable, type Profile } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { HttpError } from "./errors";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** All role writes serialize, then re-read permissions inside the transaction. */
export async function staffTransaction<T>(actorId: string, ownerOnly: boolean, work: (tx: Transaction, actor: Profile) => Promise<T>) {
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('campus-core-access-control'))`);
    const [actor] = await tx.select().from(p).where(eq(p.id, actorId)).for("update");
    if (!actor || actor.suspended || !["owner", "admin"].includes(actor.role)) throw new HttpError(403, "Staff access is no longer available.");
    if (ownerOnly && actor.role !== "owner") throw new HttpError(403, "Only the owner can change administrator access. Submit a request instead.");
    return work(tx, actor);
  });
}

export async function validateStaffTarget(tx: Transaction, targetId: string, role: "admin" | "student") {
  const [target] = await tx.select().from(p).where(eq(p.id, targetId)).for("update");
  if (!target) throw new HttpError(404, "Account not found.");
  if (target.role === "owner") throw new HttpError(403, "The owner account is protected and cannot be demoted or reassigned.");
  if (target.role === role) throw new HttpError(409, `This account is already ${role === "admin" ? "an administrator" : "a student"}.`);
  if (role === "admin" && target.suspended) throw new HttpError(400, "Restore this suspended account before considering administrator access.");
  return target;
}

export async function applyStaffRole(tx: Transaction, actorId: string, targetId: string, role: "admin" | "student", reason: string) {
  await validateStaffTarget(tx, targetId, role);
  await tx.update(p).set({ role, updatedAt: new Date() }).where(eq(p.id, targetId));
  await tx.insert(auditTable).values({ actorId, action: role === "admin" ? "promote-admin" : "demote-admin", targetId, reason });
  await tx.update(r).set({
    status: "cancelled", decidedBy: actorId, decidedAt: new Date(),
    decisionReason: "The owner changed this account's role; the pending request is no longer applicable.",
  }).where(and(eq(r.targetId, targetId), eq(r.status, "pending")));
}
