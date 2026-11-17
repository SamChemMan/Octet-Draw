// Checks the built OPSIN against names whose SMILES came from OPSIN 2.8.0 on the JDK.
// Usage: node tools/opsin/check.mjs   (a name with no structure has an empty SMILES column)
import { readFileSync } from "node:fs";
import { loadOpsin } from "../../scripts/checkkit.ts";
const opsin = await loadOpsin();
const rows = readFileSync(new URL("reference.tsv", import.meta.url), "utf8").trim().split("\n").map((l) => l.split("\t"));
const wrong = rows.filter(([name, smiles = ""]) => String(opsin.parseToSmiles(name) ?? "") !== smiles);
for (const [name, smiles] of wrong) console.log(`wrong: ${name}: got ${opsin.parseToSmiles(name)}, want ${smiles}`);
console.log(`opsin: ${rows.length - wrong.length}/${rows.length} names match`);
// Every common name and abbreviation maps to a name OPSIN reads (or to SMILES, or to another entry).
const { COMMON } = await import("../../src/common.ts");
const unread = Object.entries(COMMON).filter(([, name]) => (name.startsWith("=") ? !COMMON[name.slice(1)] : !name.startsWith("smiles:") && !opsin.parseToSmiles(name)));
for (const [key, name] of unread) console.log(`unread: ${key}: ${name}`);
console.log(`common: ${Object.keys(COMMON).length - unread.length}/${Object.keys(COMMON).length} names read`);
if (wrong.length || unread.length) process.exit(1);
