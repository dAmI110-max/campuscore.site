import { format, formatDistanceToNow, parseISO } from "date-fns";

export function naira(v: number | null | undefined, free = "Free") {
  if (v === null || v === undefined) return "No price";
  if (v === 0) return free;
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(v);
}
export function ago(iso: string) {
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true }); } catch { return ""; }
}
export function day(iso: string | null | undefined) {
  if (!iso) return "";
  try { return format(parseISO(iso), "d MMM yyyy"); } catch { return iso; }
}
export function storageUrl(path: string | null | undefined) {
  if (!path) return undefined;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/api/storage${path}`;
}
export function initials(name: string | null | undefined) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "CC";
}
export function errMessage(e: unknown, fallback = "Something went wrong. Please try again.") {
  const a = e as { data?: { error?: string; message?: string } | null; message?: string } | null;
  if (a && typeof a === "object" && a.data && typeof a.data === "object") {
    return a.data.error || a.data.message || a.message || fallback;
  }
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}
export function errStatus(e: unknown) {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}
