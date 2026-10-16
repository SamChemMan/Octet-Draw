// Checks the built OPSIN against names whose SMILES came from OPSIN 2.8.0 on the JDK.
// Usage: node tools/opsin/check.mjs   (a name with no structure has an empty SMILES column)
import { readFileSync } from "node:fs";
const dir = new URL("../../src/vendor/opsin/", import.meta.url);
const pack = readFileSync(new URL("opsin-data.bin", dir));
const files = new Map();
for (let p = 0; ; ) {
  const n = pack.readUInt16BE(p); p += 2;
  if (!n) break;
  const name = pack.toString("latin1", p, p + n); p += n;
  const size = pack.readInt32BE(p); p += 4;
  files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
}
globalThis.opsinResource = (name) => files.get(name) ?? null;
const opsin = await import(new URL("opsin.js", dir));
opsin.init();
const rows = readFileSync(new URL("reference.tsv", import.meta.url), "utf8").trim().split("\n").map((l) => l.split("\t"));
const wrong = rows.filter(([name, smiles = ""]) => String(opsin.parseToSmiles(name) ?? "") !== smiles);
for (const [name, smiles] of wrong) console.log(`wrong: ${name}: got ${opsin.parseToSmiles(name)}, want ${smiles}`);
console.log(`opsin: ${rows.length - wrong.length}/${rows.length} names match`);
if (wrong.length) process.exit(1);
