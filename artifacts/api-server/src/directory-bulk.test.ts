import test from "node:test";
import assert from "node:assert/strict";
import { parseBulkCsv, parseCsvCells, planDirectoryBulk, nameKey, MAX_BULK_ROWS, type ExistingEntry } from "./lib/directory-bulk-core";

const unis = [
  { id: 10, name: "University of Lagos" },
  { id: 11, name: "Obafemi Awolowo University" },
  { id: 12, name: "Federal University of Technology, Akure" },
  { id: 13, name: "Federal University of Technology, Minna" },
];
const url = "https://example.edu.ng/faculties";
const hdr = "university,faculty,department,source_url\n";

test("CSV parser handles BOM, CRLF, quotes, commas and doubled quotes", () => {
  const cells = parseCsvCells('\uFEFFa,"b, c","say ""hi"""\r\nx,y,z');
  assert.deepEqual(cells, [["a", "b, c", 'say "hi"'], ["x", "y", "z"]]);
  assert.throws(() => parseCsvCells('a,"unclosed'), /never closed/);
});
test("Header must include university, faculty and source_url; department is optional", () => {
  assert.equal(parseBulkCsv("university,faculty\nX,Y").errors.length, 1);
  const ok = parseBulkCsv(`university,faculty,source_url\nUniversity of Lagos,Faculty of Law,${url}`);
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.rows[0].department, null);
  const alias = parseBulkCsv(`Institution,College,Dept,Link\nUniversity of Lagos,Faculty of Law,Public Law,${url}`);
  assert.equal(alias.errors.length, 0);
  assert.equal(alias.rows[0].department, "Public Law");
});
test("Rows without a real source link, or without a faculty, are rejected with line numbers", () => {
  const r = parseBulkCsv(`${hdr}University of Lagos,Faculty of Law,,not a url\nUniversity of Lagos,,,${url}\nUniversity of Lagos,Faculty of Arts,,javascript:alert(1)`);
  assert.equal(r.rows.length, 0);
  assert.deepEqual(r.errors.map(e => e.line), [2, 3, 4]);
});
test("Blank lines are ignored and an empty upload is an error", () => {
  assert.equal(parseBulkCsv("").errors.length, 1);
  assert.equal(parseBulkCsv(`${hdr}\n\nUniversity of Lagos,Faculty of Law,,${url}\n\n`).rows.length, 1);
});
test("More than the row limit is refused", () => {
  const rows = Array.from({ length: MAX_BULK_ROWS + 1 }, (_, i) => `University of Lagos,Faculty ${i},,${url}`).join("\n");
  assert.match(parseBulkCsv(hdr + rows).errors[0].message, /at most/);
});
test("Name matching ignores case, punctuation and ampersands", () => {
  assert.equal(nameKey("Faculty of Arts & Humanities."), nameKey("faculty of arts and humanities"));
  assert.equal(nameKey("Federal University of Technology, Akure"), nameKey("Federal University of Technology Akure"));
});
test("Plan: exact and punctuation-insensitive university matches; unknown universities error", () => {
  const rows = parseBulkCsv(`${hdr}university of lagos,Faculty of Law,,${url}\nFederal University of Technology Akure,School of Engineering,,${url}\nUniversity of Nowhere,Faculty of Law,,${url}`).rows;
  const plan = planDirectoryBulk(rows, unis, []);
  assert.equal(plan.newFaculties.length, 2);
  assert.equal(plan.errors.length, 1);
  assert.equal(plan.errors[0].line, 4);
  assert.match(plan.errors[0].message, /not found/);
});
test("Plan: a unique partial name is matched and reported; an ambiguous one is an error", () => {
  const rows = parseBulkCsv(`${hdr}Obafemi Awolowo University Ile-Ife,Faculty of Law,,${url}\nFederal University of Technology,School of Engineering,,${url}`).rows;
  const plan = planDirectoryBulk(rows, unis, []);
  assert.deepEqual(plan.partialMatches, [{ input: "Obafemi Awolowo University Ile-Ife", matched: "Obafemi Awolowo University" }]);
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0].message, /ambiguous/);
});
test("Plan: repeated faculty rows create one faculty; departments attach to it", () => {
  const rows = parseBulkCsv(`${hdr}University of Lagos,Faculty of Law,Private Law,${url}\nUniversity of Lagos,Faculty of Law,Public Law,${url}\nUniversity of Lagos,Faculty of Law,Public Law,${url}`).rows;
  const plan = planDirectoryBulk(rows, unis, []);
  assert.equal(plan.newFaculties.length, 1);
  assert.equal(plan.newDepartments.length, 2);
  assert.ok(plan.newDepartments.every(dep => dep.facultyKey === plan.newFaculties[0].key));
});
test("Plan: existing entries are reused, counted once, and inactive ones are never reactivated", () => {
  const existing: ExistingEntry[] = [
    { id: 100, kind: "faculty", name: "Faculty of Law", parentId: 10, active: true },
    { id: 101, kind: "department", name: "Public Law", parentId: 100, active: true },
    { id: 102, kind: "department", name: "Private Law", parentId: 100, active: false },
  ];
  const rows = parseBulkCsv(`${hdr}University of Lagos,Faculty of Law,Public Law,${url}\nUniversity of Lagos,Faculty of Law,Public Law,${url}\nUniversity of Lagos,Faculty of Law,Private Law,${url}\nUniversity of Lagos,Faculty of Law,Jurisprudence,${url}`).rows;
  const plan = planDirectoryBulk(rows, unis, existing);
  assert.equal(plan.newFaculties.length, 0);
  assert.equal(plan.newDepartments.length, 1);
  assert.equal(plan.newDepartments[0].facultyId, 100);
  assert.equal(plan.alreadyExist, 2); // the faculty and "Public Law", each counted once
  assert.equal(plan.skippedInactive, 1);
});
