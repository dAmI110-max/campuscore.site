/**
 * Explicit, development-only reference import. Never runs on application startup.
 * Names are extracted from NUC's official HTML tables, not generated.
 */
import { pool } from "@workspace/db";

const sources = [
  "https://www.nuc.edu.ng/nigerian-univerisities/federal-univeristies/",
  "https://www.nuc.edu.ng/nigerian-univerisities/state-univerisity/",
  "https://www.nuc.edu.ng/nigerian-univerisities/private-univeristies/",
];
function text(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&nbsp;|&#160;/g, " ").replace(/&#8217;/g, "’").replace(/\s+/g, " ").trim();
}
async function main() {
  const records: { name: string; source: string }[] = [];
  for (const source of sources) {
    const response = await fetch(source, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`NUC fetch failed (${response.status}); nothing imported.`);
    const html = await response.text();
    const tables = [...html.matchAll(/<table[^>]*class="[^"]*tablepress[^"]*"[^>]*>([\s\S]*?)<\/table>/g)];
    const names = tables.flatMap(table => [...table[1].matchAll(/<td[^>]*class="column-2"[^>]*>([\s\S]*?)<\/td>/g)].map(m => text(m[1])));
    if (names.length < 10 || names.some(name => name.length < 3 || name.length > 200 || /<|>/.test(name))) throw new Error("NUC page format changed. Review the import; no fabricated fallback is permitted.");
    records.push(...names.map(name => ({ name, source })));
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let { rows: [country] } = await client.query("select id from academic_directory where kind='country' and name='Nigeria'");
    if (!country) {
      ({ rows: [country] } = await client.query("insert into academic_directory(kind,name,source_url) values ('country','Nigeria',$1) returning id", [sources[0]]));
    }
    for (const record of records) await client.query(
      "insert into academic_directory(kind,name,parent_id,source_url) values ('university',$1,$2,$3) on conflict do nothing",
      [record.name, country.id, record.source],
    );
    // This is a sourced, deliberately partial academic tree, not a universal faculty list.
    const facultySource = "https://uniosun.edu.ng/academics/colleges/college-of-science-engineering-technology/faculty-of-computing-and-information-technology";
    const { rows: [university] } = await client.query("select id from academic_directory where kind='university' and parent_id=$1 and name ilike '%Osun State University%' limit 1", [country.id]);
    if (university) {
      await client.query("insert into academic_directory(kind,name,parent_id,source_url) values ('faculty','Faculty of Computing and Information Technology',$1,$2) on conflict do nothing", [university.id, facultySource]);
      const { rows: [faculty] } = await client.query("select id from academic_directory where kind='faculty' and parent_id=$1 and name='Faculty of Computing and Information Technology'", [university.id]);
      for (const name of ["Computer Science", "Cyber Security", "Data Science", "Information Systems", "Information Technology", "Library and Information Science", "Software Engineering"]) {
        await client.query("insert into academic_directory(kind,name,parent_id,source_url) values ('department',$1,$2,$3) on conflict do nothing", [name, faculty.id, facultySource]);
      }
    }
    await client.query("COMMIT");
    process.stdout.write(`Imported ${records.length} NUC university reference rows; no user content was created. Faculty/department coverage remains partial.\n`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
