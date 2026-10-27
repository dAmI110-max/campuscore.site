/** Only initialize a blank name; Campus Core edits remain authoritative. */
export function initialDisplayName(user: { firstName: string | null; lastName: string | null; username: string | null }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim().slice(0, 80)
    || user.username?.trim().slice(0, 80) || "";
}
