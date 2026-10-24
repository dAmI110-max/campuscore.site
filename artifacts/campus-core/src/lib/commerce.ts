export const LAGOS_TZ = "Africa/Lagos";

/** Formats integer minor units (kobo) as Naira. */
export function minorMoney(minor: number | null | undefined, currency = "NGN") {
  if (minor === null || minor === undefined) return "Unknown";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minor / 100);
}

export function lagosDateTime(iso: string | null | undefined) {
  if (!iso) return "Not set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { timeZone: LAGOS_TZ, dateStyle: "medium", timeStyle: "short" }).format(d) + " (Lagos)";
}

/** Lagos is fixed UTC+01:00 with no daylight saving. */
export function isoToLagosInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 3600_000).toISOString().slice(0, 16);
}
export function lagosInputToIso(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+01:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** Preview only: two calendar months after the launch instant, in Lagos time. Server value is authoritative. */
export function previewEligible(iso: string | null) {
  if (!iso) return null;
  const local = new Date(new Date(iso).getTime() + 3600_000);
  const y = local.getUTCFullYear(), m = local.getUTCMonth() + 2, dd = local.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const out = new Date(Date.UTC(y, m, Math.min(dd, last), local.getUTCHours(), local.getUTCMinutes()));
  return new Date(out.getTime() - 3600_000).toISOString();
}

export function csvCell(v: unknown) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
