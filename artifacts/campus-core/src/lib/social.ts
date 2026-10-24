import type { QueryClient } from "@tanstack/react-query";
import {
  getGetSocialSummaryQueryKey, getListConversationsQueryKey, getListNotificationsQueryKey,
  getListBlocksQueryKey, getListMyUserReportsQueryKey, getListUserReportsQueryKey, type ChatMessage,
} from "@workspace/api-client-react";

/** Refresh every private social query that a messaging or safety mutation can affect. */
export function invalidateSocial(qc: QueryClient, opts: { conversations?: boolean; safety?: boolean; staff?: boolean } = {}) {
  qc.invalidateQueries({ queryKey: getGetSocialSummaryQueryKey() });
  qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  if (opts.conversations !== false) {
    qc.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/api/conversations/") });
  }
  if (opts.safety) {
    qc.invalidateQueries({ queryKey: getListBlocksQueryKey() });
    qc.invalidateQueries({ queryKey: getListMyUserReportsQueryKey() });
  }
  if (opts.staff) qc.invalidateQueries({ queryKey: getListUserReportsQueryKey() });
}

/** Merge message lists by id, ascending. Later entries win. */
export function mergeMessages(...lists: ChatMessage[][]): ChatMessage[] {
  const map = new Map<number, ChatMessage>();
  for (const l of lists) for (const m of l) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function shortStamp(iso: string) {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? clock(iso) : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function newClientId() {
  const source: Pick<Crypto, "getRandomValues"> & { randomUUID?: () => string } = globalThis.crypto;
  if (source.randomUUID) return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
