import test from "node:test";
import assert from "node:assert/strict";
import { initialDisplayName } from "./lib/profile-sync";
import { interestTransition, roommateReasons, validateRoommate, visibleRoommate } from "./lib/roommates";
import { SaveMyRoommateBody, ListRoommatesQueryParams, SendRoommateInterestBody } from "@workspace/api-zod";
import type { RoommateInput } from "@workspace/api-zod";
import { readFileSync } from "node:fs";

const input: RoommateInput = {
  universityId: 1, campus: "Main campus", accommodationType: "flat", budgetMin: 20000, budgetMax: 40000,
  moveInDate: "2027-01-01", sharing: "shared", smoking: "non-smoker", cleanliness: "tidy", sleep: "early",
  study: "quiet", about: "", visibleFields: ["campus", "budget", "preferences"], active: true,
};
test("Profile initialization uses provider name, falls back to username, never email", () => {
  assert.equal(initialDisplayName({ firstName: "Ada", lastName: "Ola", username: "ada" }), "Ada Ola");
  assert.equal(initialDisplayName({ firstName: null, lastName: null, username: "ada" }), "ada");
  assert.equal(initialDisplayName({ firstName: "", lastName: "", username: null }), "");
  assert.equal(initialDisplayName({ firstName: "a".repeat(200), lastName: null, username: null }).length, 80);
});
test("Roommate input validates real calendar dates and budget ranges", () => {
  assert.deepEqual(validateRoommate(SaveMyRoommateBody.parse(input)), input);
  assert.throws(() => validateRoommate({ ...input, moveInDate: "2027-02-30" }));
  assert.throws(() => validateRoommate({ ...input, budgetMax: input.budgetMin - 1 }));
  assert.throws(() => SaveMyRoommateBody.parse({ ...input, budgetMin: -1 }));
  assert.throws(() => SaveMyRoommateBody.parse({ ...input, universityId: 0 }));
  assert.throws(() => SaveMyRoommateBody.parse({ ...input, about: "x".repeat(801) }));
  assert.throws(() => SaveMyRoommateBody.parse({ ...input, budgetMax: 100000001 }));
  assert.throws(() => validateRoommate({ ...input, visibleFields: ["budget", "budget"] }));
});
test("Roommate visibility removes all private fields from wire output", () => {
  assert.deepEqual(visibleRoommate({ ...input, visibleFields: [] }), {});
  assert.deepEqual(visibleRoommate({ ...input, visibleFields: ["budget"] }), { budgetMin: 20000, budgetMax: 40000 });
  const wire = visibleRoommate(input);
  assert.equal("about" in wire, false);
  assert.equal("moveInDate" in wire, false);
  assert.equal("userId" in wire, false);
});
test("Matching explains only declared visible preferences and overlapping budget", () => {
  assert.equal(roommateReasons(null, input).length, 0);
  assert.equal(roommateReasons(input, { ...input, visibleFields: [] }).length, 0);
  assert.ok(roommateReasons(input, input).includes("Monthly budget ranges overlap"));
  assert.equal(roommateReasons(input, { ...input, visibleFields: ["budget"], budgetMin: 50000, budgetMax: 60000 }).length, 0);
});
test("Only recipient accepts/declines pending interests; sender can cancel", () => {
  const row = { senderId: "sender", recipientId: "recipient", status: "pending" };
  assert.equal(interestTransition(row, "recipient", "accept"), "accepted");
  assert.equal(interestTransition(row, "recipient", "decline"), "declined");
  assert.equal(interestTransition(row, "sender", "cancel"), "cancelled");
  for (const stranger of ["unrelated", "admin", "owner"]) {
    assert.throws(() => interestTransition(row, stranger, "accept"));
    assert.throws(() => interestTransition(row, stranger, "cancel"));
  }
  assert.throws(() => interestTransition(row, "sender", "accept"));
  assert.throws(() => interestTransition(row, "recipient", "cancel"));
  assert.throws(() => interestTransition({ ...row, status: "cancelled" }, "recipient", "accept"));
  assert.throws(() => interestTransition({ ...row, status: "accepted" }, "recipient", "decline"));
});
test("Search coercion is bounded; usernames cannot inject identifiers", () => {
  assert.equal(ListRoommatesQueryParams.parse({ minBudget: "20000", page: "2" }).minBudget, 20000);
  assert.throws(() => ListRoommatesQueryParams.parse({ page: "0" }));
  assert.throws(() => ListRoommatesQueryParams.parse({ q: "x".repeat(101) }));
  assert.throws(() => SendRoommateInterestBody.parse({ username: "../admin" }));
});
test("Roommate draft keeps RLS, restricted grants and moderation ownership", () => {
  const sql = readFileSync(new URL("../../../lib/db/drizzle/0006_roommate-finder.sql", import.meta.url), "utf8");
  assert.match(sql, /FORCE ROW LEVEL SECURITY/g);
  assert.match(sql, /TO campus_core_social/);
  assert.doesNotMatch(sql, /GRANT ALL|DROP TABLE|TRUNCATE/i);
  assert.match(sql, /REVOKE ALL.*FROM PUBLIC/);
  assert.match(sql, /GRANT UPDATE \(university_id/);
});
