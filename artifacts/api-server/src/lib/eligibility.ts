/**
 * University-email eligibility enforcement.
 * Students need a verified email on an admin-managed domain (or manual approval).
 * Hostel agents, staff/admins, and the protected owner are exempt.
 */
import { db, profilesTable, type Profile } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { HttpError } from "./errors";

export type EligibilityStatus = "pending" | "verified" | "manual_verified" | "exempt" | "rejected";

const EXEMPT_ROLES = new Set(["admin", "owner"]);

export function emailDomain(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  return email.split("@").pop()!.trim().toLowerCase() || null;
}

export async function domainIsApproved(domain: string | null): Promise<{ ok: boolean; institutionName?: string }> {
  if (!domain) return { ok: false };
  try {
    const rows = await db.execute<{ institution_name: string }>(sql`
      select institution_name from institution_domains
      where domain = ${domain} and active = true
      limit 1
    `);
    const name = (rows as unknown as { rows?: { institution_name: string }[] }).rows?.[0]?.institution_name
      ?? (Array.isArray(rows) ? (rows as { institution_name: string }[])[0]?.institution_name : undefined);
    if (name) return { ok: true, institutionName: name };
  } catch {
    // Table may not exist until migration 0007 is applied.
  }
  return { ok: false };
}

export function isRoleExempt(profile: Profile): boolean {
  return EXEMPT_ROLES.has(profile.role);
}

/** Apply eligibility after sign-in using the provider email. */
export async function syncEligibilityFromEmail(
  profile: Profile,
  email: string | null,
  emailVerified: boolean,
): Promise<Profile> {
  if (isRoleExempt(profile)) {
    if (profile.eligibility_status !== "exempt" && "eligibility_status" in (profile as object)) {
      await db.execute(sql`
        update profiles set eligibility_status = 'exempt', updated_at = now()
        where id = ${profile.id} and role in ('admin','owner')
      `);
    }
    return profile;
  }

  const domain = emailDomain(email);
  if (email && emailVerified && domain) {
    const approved = await domainIsApproved(domain);
    if (approved.ok) {
      await db.execute(sql`
        update profiles set
          eligibility_status = 'verified',
          eligibility_email = ${email},
          eligibility_domain = ${domain},
          eligibility_reviewed_at = now(),
          updated_at = now()
        where id = ${profile.id}
          and eligibility_status in ('pending','rejected')
      `);
      const [fresh] = await db.select().from(profilesTable).where(eq(profilesTable.id, profile.id));
      return fresh ?? profile;
    }
  }
  return profile;
}

/**
 * Block write actions for non-eligible students.
 * Read-only browsing remains allowed.
 */
export function assertEligibleToWrite(profile: Profile): void {
  if (isRoleExempt(profile)) return;
  const status = (profile as Profile & { eligibility_status?: string }).eligibility_status ?? "pending";
  if (status === "verified" || status === "manual_verified" || status === "exempt") return;
  if (status === "rejected") {
    throw new HttpError(403, "Your eligibility request was rejected. Contact support or submit a new verification request.");
  }
  throw new HttpError(
    403,
    "Complete university email verification before posting, messaging, or contacting others. Use your institutional email or request manual verification.",
  );
}

export async function submitManualVerification(
  userId: string,
  institutionName: string,
  evidenceNote?: string,
): Promise<void> {
  const name = institutionName.trim();
  if (name.length < 3) throw new HttpError(400, "Provide your institution name.");
  await db.execute(sql`
    insert into eligibility_requests (user_id, institution_name, evidence_note)
    values (${userId}, ${name}, ${evidenceNote?.trim() || null})
  `);
}

export async function reviewEligibilityRequest(
  requestId: number,
  reviewerId: string,
  approve: boolean,
  note?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      select id, user_id, status from eligibility_requests where id = ${requestId} for update
    `);
    const row = (result as unknown as { rows?: { id: number; user_id: string; status: string }[] }).rows?.[0]
      ?? (Array.isArray(result) ? (result as { id: number; user_id: string; status: string }[])[0] : undefined);
    if (!row) throw new HttpError(404, "Verification request not found.");
    if (row.status !== "open") throw new HttpError(409, "This request was already reviewed.");

    const newStatus = approve ? "approved" : "rejected";
    const eligibility = approve ? "manual_verified" : "rejected";
    await tx.execute(sql`
      update eligibility_requests
      set status = ${newStatus}, reviewed_by = ${reviewerId}, reviewed_at = now()
      where id = ${requestId}
    `);
    await tx.execute(sql`
      update profiles set
        eligibility_status = ${eligibility},
        eligibility_reviewed_at = now(),
        eligibility_reviewed_by = ${reviewerId},
        eligibility_note = ${note?.trim() || null},
        updated_at = now()
      where id = ${row.user_id}
    `);
  });
}
