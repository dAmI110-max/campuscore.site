import { db, directoryTable as d, auditTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { staffTransaction } from "./staff-access";
import { HttpError } from "./errors";
import { parseBulkCsv, planDirectoryBulk, type ExistingEntry, type LineError, type UniversityRef } from "./directory-bulk-core";

type Reader = Pick<typeof db, "select">;
async function load(reader: Reader): Promise<{ universities: UniversityRef[]; existing: ExistingEntry[] }> {
  const universities = await reader.select({ id: d.id, name: d.name }).from(d).where(and(eq(d.kind, "university"), eq(d.active, true)));
  const existing = (await reader.select({ id: d.id, kind: d.kind, name: d.name, parentId: d.parentId, active: d.active })
    .from(d).where(inArray(d.kind, ["faculty", "department"]))).flatMap(e =>
    e.parentId === null ? [] : [{ id: e.id, kind: e.kind as "faculty" | "department", name: e.name, parentId: e.parentId, active: e.active }]);
  return { universities, existing };
}

export type BulkResult = {
  committed: boolean;
  rowsRead: number;
  newFaculties: number;
  newDepartments: number;
  alreadyExist: number;
  skippedInactive: number;
  partialMatches: { input: string; matched: string }[];
  errors: LineError[];
  message: string;
};

export async function bulkImportDirectory(actorId: string, csv: string, commit: boolean): Promise<BulkResult> {
  const parsed = parseBulkCsv(csv);
  const base = { rowsRead: parsed.rows.length, committed: false };
  if (parsed.errors.length) {
    return { ...base, newFaculties: 0, newDepartments: 0, alreadyExist: 0, skippedInactive: 0, partialMatches: [], errors: parsed.errors,
      message: `Nothing was saved. Fix ${parsed.errors.length} problem${parsed.errors.length === 1 ? "" : "s"} and check again.` };
  }
  const { universities, existing } = await load(db);
  const preview = planDirectoryBulk(parsed.rows, universities, existing);
  const summary = (plan: typeof preview, committed: boolean): BulkResult => ({
    committed, rowsRead: parsed.rows.length, newFaculties: plan.newFaculties.length, newDepartments: plan.newDepartments.length,
    alreadyExist: plan.alreadyExist, skippedInactive: plan.skippedInactive, partialMatches: plan.partialMatches, errors: plan.errors,
    message: "",
  });
  if (preview.errors.length) {
    return { ...summary(preview, false), message: `Nothing was saved. ${preview.errors.length} row${preview.errors.length === 1 ? " has" : "s have"} a problem.` };
  }
  if (!commit) {
    return { ...summary(preview, false), message: `Check passed. ${preview.newFaculties.length} faculties and ${preview.newDepartments.length} departments would be added. Nothing has been saved yet.` };
  }
  return staffTransaction(actorId, true, async tx => {
    // Re-read inside the serialized transaction so a concurrent edit cannot cause duplicates.
    const fresh = await load(tx);
    const plan = planDirectoryBulk(parsed.rows, fresh.universities, fresh.existing);
    if (plan.errors.length) throw new HttpError(409, "The directory changed while checking. Run the check again.");
    const facultyIds = new Map<string, number>();
    for (const f of plan.newFaculties) {
      const [inserted] = await tx.insert(d).values({ kind: "faculty", name: f.name, parentId: f.universityId, sourceUrl: f.sourceUrl }).onConflictDoNothing().returning({ id: d.id });
      if (!inserted) throw new HttpError(409, "The directory changed while importing. Nothing was saved; run the check again.");
      facultyIds.set(f.key, inserted.id);
    }
    for (const dep of plan.newDepartments) {
      const parentId = dep.facultyId ?? (dep.facultyKey ? facultyIds.get(dep.facultyKey) : undefined);
      if (!parentId) throw new HttpError(500, "Could not place a department under its faculty. Nothing was saved.");
      const [inserted] = await tx.insert(d).values({ kind: "department", name: dep.name, parentId, sourceUrl: dep.sourceUrl }).onConflictDoNothing().returning({ id: d.id });
      if (!inserted) throw new HttpError(409, "The directory changed while importing. Nothing was saved; run the check again.");
    }
    const hosts = [...new Set(parsed.rows.map(r => { try { return new URL(r.sourceUrl).hostname; } catch { return ""; } }).filter(Boolean))].slice(0, 5).join(", ");
    await tx.insert(auditTable).values({
      actorId, action: "bulk-import-directory", targetId: "directory",
      reason: `Bulk CSV import: ${plan.newFaculties.length} faculties and ${plan.newDepartments.length} departments added from ${parsed.rows.length} rows; ${plan.alreadyExist} already existed; sources: ${hosts}.`,
    });
    return { ...summary(plan, true), message: `Imported ${plan.newFaculties.length} faculties and ${plan.newDepartments.length} departments. Existing entries were not changed.` };
  });
}
