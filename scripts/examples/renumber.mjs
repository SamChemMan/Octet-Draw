// Renumbers the compounds across the schemes of a review in the order they first come: scheme by scheme, row by row
// from the top, left to right. A compound drawn again gets its first number. Each drawing is saved in OUT.
// Run: node renumber.mjs OUT scheme1.cdxml scheme2.oct ...
import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { octet } from "./octet.mjs";

const [out, ...files] = process.argv.slice(2), o = octet(), numbers = new Map();
mkdirSync(out, { recursive: true });
// Rows from the top (a structure whose middle is above the bottom of the row's highest one is in that row), each left
// to right. A box is [left, bottom, right, top].
const inOrder = (structures) => {
  const rows = [];
  for (const s of [...structures].sort((p, q) => q.box[3] - p.box[3])) { const row = rows.at(-1); if (row && (s.box[1] + s.box[3]) / 2 > row[0].box[1]) row.push(s); else rows.push([s]); }
  return rows.flatMap((row) => row.sort((p, q) => p.box[0] - q.box[0]));
};
for (const file of files) {
  await o.open(file);
  const numbered = inOrder((await o.call("read", { detail: "full" })).structures.filter((s) => s.number));
  const operations = numbered.map((s) => {
    const key = s.inchiKey ?? s.smiles ?? `${file} ${s.id}`;
    if (!numbers.has(key)) numbers.set(key, String(numbers.size + 1));
    return { op: "number", structure: s.id, number: numbers.get(key) };
  });
  if (operations.length) await o.call("change", { operations });
  await o.save(join(out, basename(file)));
  console.log(`${basename(file)}: ${numbered.map((s, k) => `${s.number} is ${operations[k].number}`).join(", ")}`);
}
await o.close();
