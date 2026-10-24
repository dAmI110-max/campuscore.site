import { directoryTable as d, auditTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { staffTransaction } from "./staff-access";
import { HttpError } from "./errors";

const sources = [
  "https://www.nuc.edu.ng/nigerian-univerisities/federal-univeristies/",
  "https://www.nuc.edu.ng/nigerian-univerisities/state-univerisity/",
  "https://www.nuc.edu.ng/nigerian-univerisities/private-univeristies/",
];
function cleanText(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;|&#160;/g, " ").replace(/&#8217;/g, "’").replace(/\s+/g, " ").trim();
}
export async function importOfficialUniversities(actorId: string) {
  let records: { name: string; sourceUrl: string }[];
  try {
    const pages = await Promise.all(sources.map(async sourceUrl => {
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000), redirect: "error" });
      if (!response.ok) throw new Error("Official source unavailable");
      const html = await response.text();
      if (html.length > 2_000_000) throw new Error("Source larger than expected");
      const tables = [...html.matchAll(/<table[^>]*class="[^"]*tablepress[^"]*"[^>]*>([\s\S]*?)<\/table>/g)];
      const names = tables.flatMap(table => [...table[1].matchAll(/<td[^>]*class="column-2"[^>]*>([\s\S]*?)<\/td>/g)].map(m => cleanText(m[1])));
      if (names.length < 10 || names.length > 1000 || names.some(name => name.length < 3 || name.length > 200 || /<|>/.test(name))) throw new Error("Official source format changed");
      return names.map(name => ({ name, sourceUrl }));
    }));
    records = pages.flat();
  } catch {
    throw new HttpError(503, "The official NUC sources could not be verified. Nothing was imported. Retry later or review the sources manually.");
  }
  return staffTransaction(actorId, true, async tx => {
    let [country] = await tx.select().from(d).where(and(eq(d.kind, "country"), eq(d.name, "Nigeria"), isNull(d.parentId)));
    if (!country) [country] = await tx.insert(d).values({ kind: "country", name: "Nigeria", sourceUrl: sources[0] }).returning();
    if (!country.active) throw new HttpError(409, "Nigeria is deactivated. Review it before importing universities.");
    let added = 0;
    for (const record of records) {
      const inserted = await tx.insert(d).values({ kind: "university", parentId: country.id, ...record }).onConflictDoNothing().returning({ id: d.id });
      added += inserted.length;
    }
    await tx.insert(auditTable).values({ actorId, action: "import-official-directory", targetId: String(country.id), reason: `NUC federal/state/private tables: ${records.length} source records, ${added} added. Existing entries retained.` });
    return { message: `Added ${added} missing universities from ${records.length} official NUC records. Existing entries were not changed. Faculty and department coverage remains partial.` };
  });
}
