import type { RoommateInput } from "@workspace/api-zod";
import { HttpError } from "./errors";

export function validateRoommate(input: RoommateInput): RoommateInput {
  if (input.budgetMin > input.budgetMax) throw new HttpError(400, "Minimum budget cannot exceed maximum budget.");
  const date = new Date(input.moveInDate);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.moveInDate) {
    throw new HttpError(400, "Choose a valid move-in date.");
  }
  if (new Set(input.visibleFields).size !== input.visibleFields.length) throw new HttpError(400, "Choose each visibility field only once.");
  // Structured profiles intentionally have no phone/email/address fields.
  // Do not promise automated removal of personal information from free text.
  return { ...input, campus: input.campus.trim(), about: input.about.trim() };
}

type Preferences = Pick<RoommateInput, "budgetMin" | "budgetMax" | "sharing" | "smoking" | "cleanliness" | "sleep" | "study" | "visibleFields">;
export function roommateReasons(mine: Preferences | null, peer: Preferences): string[] {
  if (!mine) return [];
  const reasons: string[] = [];
  if (peer.visibleFields.includes("budget") && mine.budgetMin <= peer.budgetMax && peer.budgetMin <= mine.budgetMax) {
    reasons.push("Monthly budget ranges overlap");
  }
  if (peer.visibleFields.includes("preferences")) {
    for (const [key, label] of [
      ["sharing", "Room-sharing preferences align"],
      ["smoking", "Smoking preferences align"],
      ["cleanliness", "Cleanliness preferences align"],
      ["sleep", "Sleep routines align"],
      ["study", "Study habits align"],
    ] as const) {
      if (mine[key] === peer[key] || ["either", "flexible"].includes(mine[key]) || ["either", "flexible"].includes(peer[key])) reasons.push(label);
    }
  }
  return reasons;
}

/** Enforce field visibility in server serialization, not just in the UI. */
export function visibleRoommate<T extends Preferences & { campus: string; moveInDate: string; about: string }>(peer: T) {
  return {
    ...(peer.visibleFields.includes("campus") ? { campus: peer.campus } : {}),
    ...(peer.visibleFields.includes("budget") ? { budgetMin: peer.budgetMin, budgetMax: peer.budgetMax } : {}),
    ...(peer.visibleFields.includes("moveInDate") ? { moveInDate: peer.moveInDate } : {}),
    ...(peer.visibleFields.includes("preferences") ? {
      sharing: peer.sharing, smoking: peer.smoking, cleanliness: peer.cleanliness, sleep: peer.sleep, study: peer.study,
    } : {}),
    ...(peer.visibleFields.includes("about") ? { about: peer.about } : {}),
  };
}

export function interestTransition(
  row: { senderId: string; recipientId: string; status: string },
  actor: string, action: "accept" | "decline" | "cancel",
) {
  const recipient = row.recipientId === actor;
  const sender = row.senderId === actor;
  if ((!recipient && !sender) || (action !== "cancel" && !recipient) || (action === "cancel" && !sender)) {
    throw new HttpError(403, "You cannot change this request.");
  }
  if (action !== "cancel" && row.status !== "pending") throw new HttpError(409, "This request has already been answered.");
  if (action === "cancel" && !["pending", "accepted"].includes(row.status)) throw new HttpError(409, "This request is no longer active.");
  return action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled";
}
