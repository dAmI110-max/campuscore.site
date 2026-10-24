import sharp from "sharp";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

const directory = path.resolve(import.meta.dirname, "../../artifacts/campus-core/src/assets/kinds");
for (const name of await readdir(directory)) {
  if (!name.endsWith(".png")) continue;
  const input = path.join(directory, name);
  const output = input.replace(/\.png$/, ".webp");
  await sharp(input).resize({ width: 900, withoutEnlargement: true }).webp({ quality: 80 }).toFile(output);
  const before = (await stat(input)).size;
  const after = (await stat(output)).size;
  if (after >= before) throw new Error(`Conversion did not reduce ${name}; original retained.`);
  await unlink(input);
  process.stdout.write(`${name}: ${before} -> ${after} bytes\n`);
}
