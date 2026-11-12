/**
 * Pure parsing and planning for the owner-only bulk directory upload.
 * No database or network access here so every rule can be unit tested.
 * Every faculty/department must carry a real source URL; nothing is inferred.
 */
export const MAX_BULK_ROWS = 500;

export type BulkRow = { line: number; university: string; faculty: string; department: string | null; sourceUrl: string };
export type LineError = { line: number; message: string };
export type UniversityRef = { id: number; name: string };
export type ExistingEntry = { id: number; kind: "faculty" | "department"; name: string; parentId: number; active: boolean };

export function collapse(value: string): string {
  return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}
/** Case, punctuation and "&" insensitive key used for matching names. */
export function nameKey(value: string): string {
  return collapse(value).toLowerCase().replace(/&/g, " and ").replace(/[.,;:()'’"\-–—/]/g, " ").replace(/\s+/g, " ").trim();
}

/** Small RFC 4180 style parser: quoted fields, doubled quotes, CRLF, BOM. */
export function parseCsvCells(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error("A quoted field was never closed. Check for a missing closing quote.");
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const HEADER_ALIASES: Record<string, "university" | "faculty" | "department" | "sourceUrl"> = {
  university: "university", institution: "university",
  faculty: "faculty", college: "faculty",
  department: "department", dept: "department",
  source_url: "sourceUrl", sourceurl: "sourceUrl", source: "sourceUrl", url: "sourceUrl", link: "sourceUrl",
};

function validUrl(value: string): boolean {
  if (value.length > 500) return false;
  try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; }
}

export function parseBulkCsv(text: string): { rows: BulkRow[]; errors: LineError[] } {
  const errors: LineError[] = [];
  let cells: string[][];
  try { cells = parseCsvCells(text); } catch (error) {
    return { rows: [], errors: [{ line: 1, message: (error as Error).message }] };
  }
  const lines = cells.map((c, i) => ({ c, line: i + 1 })).filter(x => x.c.some(v => v.trim() !== ""));
  if (!lines.length) return { rows: [], errors: [{ line: 1, message: "The upload is empty." }] };
  const header = lines[0].c.map(h => HEADER_ALIASES[collapse(h).toLowerCase().replace(/[\s-]+/g, "_")]);
  for (const need of ["university", "faculty", "sourceUrl"] as const) {
    if (!header.includes(need)) errors.push({ line: lines[0].line, message: `The header row must include a "${need === "sourceUrl" ? "source_url" : need}" column. Expected: university,faculty,department,source_url` });
  }
  if (errors.length) return { rows: [], errors };
  const dataLines = lines.slice(1);
  if (dataLines.length > MAX_BULK_ROWS) return { rows: [], errors: [{ line: 1, message: `Upload at most ${MAX_BULK_ROWS} rows at a time (found ${dataLines.length}).` }] };
  const rows: BulkRow[] = [];
  for (const { c, line } of dataLines) {
    const get = (field: "university" | "faculty" | "department" | "sourceUrl") => collapse(c[header.indexOf(field)] ?? "");
    const university = get("university"), faculty = get("faculty"), department = get("department"), sourceUrl = (c[header.indexOf("sourceUrl")] ?? "").trim();
    const problems: string[] = [];
    if (university.length < 2 || university.length > 200) problems.push("university must be 2-200 characters");
    if (faculty.length < 2 || faculty.length > 200) problems.push("faculty is required (2-200 characters)");
    if (department && (department.length < 2 || department.length > 200)) problems.push("department must be 2-200 characters");
    if ([university, faculty, department].some(v => /[<>]/.test(v))) problems.push("names must not contain < or >");
    if (!validUrl(sourceUrl)) problems.push("source_url must be a full http(s) link to the official page");
    if (problems.length) errors.push({ line, message: problems.join("; ") });
    else rows.push({ line, university, faculty, department: department || null, sourceUrl });
  }
  return { rows, errors };
}

export type PlannedFaculty = { key: string; universityId: number; name: string; sourceUrl: string; line: number };
export type PlannedDepartment = { facultyKey: string | null; facultyId: number | null; name: string; sourceUrl: string; line: number };
export type Plan = {
  errors: LineError[];
  newFaculties: PlannedFaculty[];
  newDepartments: PlannedDepartment[];
  alreadyExist: number;
  skippedInactive: number;
  partialMatches: { input: string; matched: string }[];
};

function resolveUniversity(input: string, universities: UniversityRef[]): { ref?: UniversityRef; partial?: boolean; error?: string } {
  const key = nameKey(input);
  const exact = universities.filter(u => nameKey(u.name) === key);
  if (exact.length === 1) return { ref: exact[0] };
  if (exact.length > 1) return { error: `"${input}" matches more than one university in the directory. Use the exact directory name.` };
  const partial = universities.filter(u => {
    const k = nameKey(u.name);
    return Math.min(k.length, key.length) >= 8 && (k.includes(key) || key.includes(k));
  });
  if (partial.length === 1) return { ref: partial[0], partial: true };
  const hint = (partial.length ? partial : universities.filter(u => key.split(" ").some(w => w.length > 4 && nameKey(u.name).includes(w)))).slice(0, 3).map(u => u.name);
  return { error: partial.length > 1
    ? `"${input}" is ambiguous. Possible matches: ${hint.join(" | ")}`
    : `University not found: "${input}".${hint.length ? ` Closest: ${hint.join(" | ")}` : ""} Import the university first or use the exact directory name.` };
}

export function planDirectoryBulk(rows: BulkRow[], universities: UniversityRef[], existing: ExistingEntry[]): Plan {
  const plan: Plan = { errors: [], newFaculties: [], newDepartments: [], alreadyExist: 0, skippedInactive: 0, partialMatches: [] };
  const existingFaculty = new Map<string, ExistingEntry>();
  const existingDepartment = new Map<string, ExistingEntry>();
  for (const e of existing) (e.kind === "faculty" ? existingFaculty : existingDepartment).set(`${e.parentId}:${nameKey(e.name)}`, e);
  const seen = new Set<string>();
  const seenPartial = new Set<string>();
  const plannedFaculty = new Map<string, PlannedFaculty>();
  const count = (entry: ExistingEntry, token: string) => {
    if (seen.has(token)) return;
    seen.add(token);
    if (entry.active) plan.alreadyExist++; else plan.skippedInactive++;
  };
  for (const row of rows) {
    const match = resolveUniversity(row.university, universities);
    if (!match.ref) { plan.errors.push({ line: row.line, message: match.error! }); continue; }
    if (match.partial && !seenPartial.has(row.university)) {
      seenPartial.add(row.university);
      plan.partialMatches.push({ input: row.university, matched: match.ref.name });
    }
    const facultyKey = `${match.ref.id}:${nameKey(row.faculty)}`;
    const existingF = existingFaculty.get(facultyKey);
    let facultyId: number | null = null;
    let plannedKey: string | null = null;
    if (existingF) { facultyId = existingF.id; count(existingF, `f:${facultyKey}`); }
    else {
      plannedKey = facultyKey;
      if (!plannedFaculty.has(facultyKey)) {
        const planned = { key: facultyKey, universityId: match.ref.id, name: row.faculty, sourceUrl: row.sourceUrl, line: row.line };
        plannedFaculty.set(facultyKey, planned);
        plan.newFaculties.push(planned);
      }
    }
    if (!row.department) continue;
    const deptToken = `d:${facultyKey}:${nameKey(row.department)}`;
    if (facultyId !== null) {
      const existingD = existingDepartment.get(`${facultyId}:${nameKey(row.department)}`);
      if (existingD) { count(existingD, deptToken); continue; }
    }
    if (seen.has(deptToken)) continue;
    seen.add(deptToken);
    plan.newDepartments.push({ facultyKey: plannedKey, facultyId, name: row.department, sourceUrl: row.sourceUrl, line: row.line });
  }
  return plan;
}
