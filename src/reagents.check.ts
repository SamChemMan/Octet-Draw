// Run: node src/reagents.check.ts. Reagents written over an arrow (decision 0021, D8): the reagent table reads each
// as Name to Structure does, after reagentName takes off its amount and form ("conc.", "(cat.)"), so each gets its
// own formula, as a user and an AI app write them.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const dir = new URL("./vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("reagents.check: skipped (no OPSIN build)"); process.exit(0); }
const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const pack = readFileSync(new URL("opsin-data.bin", dir)), files = new Map<string, Int8Array>();
for (let p = 0; ; ) {
  const n = pack.readUInt16BE(p); p += 2;
  if (!n) break;
  const name = pack.toString("latin1", p, p + n); p += n;
  const size = pack.readInt32BE(p); p += 4;
  files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
}
(globalThis as { opsinResource?: unknown }).opsinResource = (name: string) => files.get(name) ?? null;
const opsin = await import(new URL("opsin.js", dir).href);
opsin.init();
const { attachOpsin, nameToSmiles } = await import("./names.ts");
const { DRUGS } = await import("./drugs.ts");
const { ready, smilesWeight } = await import("./chem.ts");
const { conditionItems, formulaWeight, inert, reagentFormula, reagentName } = await import("./stoich.ts");
const { labelSmiles } = await import("./labels.ts");
attachOpsin(opsin, readFileSync(new URL("names.txt", dir), "utf8"), JSON.parse(readFileSync(new URL("./nameindex.json", import.meta.url), "utf8")), DRUGS, JSON.parse(readFileSync(new URL("./abbreviations.json", import.meta.url), "utf8")));
await ready;

// reagentName: amounts and forms off, the reagent kept.
for (const [text, want] of [["conc. H2SO4", "H2SO4"], ["Pd(PPh3)4 (5 mol%)", "Pd(PPh3)4"], ["1.2 equiv NaBH4", "NaBH4"], ["2 M HCl", "HCl"], ["aq. NaOH", "NaOH"], ["TsOH (cat.)", "TsOH"], ["H2SO4", "H2SO4"], ["10 mol% CuI", "CuI"], ["dry THF", "THF"]]) assert.equal(reagentName(text), want, text);

// Each reagent's formula as the reagent table works it out (Editor.tsx gridViews): a formula as written, else Name to
// Structure's reading, else an atom label's.
const weightOf = (text: string) => reagentFormula(text, nameToSmiles, labelSmiles, smilesWeight)?.weight;
const REAGENTS: [string, string][] = [
  ["MeNO2", "CH3NO2"], ["NH4OAc", "C2H7NO2"], ["AcOH", "C2H4O2"], ["Et3N", "C6H15N"], ["Ac2O", "C4H6O3"], ["LiAlH4", "AlH4Li"], ["THF", "C4H8O"],
  ["DMF", "C3H7NO"], ["DMSO", "C2H6OS"], ["MeOH", "CH4O"], ["EtOH", "C2H6O"], ["Et2O", "C4H10O"], ["NaBH4", "BH4Na"], ["K2CO3", "CK2O3"], ["Cs2CO3", "CCs2O3"],
  ["TFA", "C2HF3O2"], ["DIPEA", "C8H19N"], ["DMAP", "C7H10N2"], ["NBS", "C4H4BrNO2"], ["mCPBA", "C7H5ClO3"], ["pyridine", "C5H5N"], ["TsOH", "C7H8O3S"],
  ["Boc2O", "C10H18O5"], ["n-BuLi", "C4H9Li"], ["DCM", "CH2Cl2"], ["CH2Cl2", "CH2Cl2"], ["conc. H2SO4", "H2SO4"], ["Pd(PPh3)4 (5 mol%)", "C72H60P4Pd"],
];
// Compared by molar mass: the table shows a formula as it was written (LiAlH4), and others in Hill order (AlH4Li).
const wrong = REAGENTS.flatMap(([text, want]) => { const got = weightOf(text), w = formulaWeight(want)!; return got !== undefined && Math.abs(got - w) < 0.01 ? [] : [`${text}: ${got?.toFixed(2) ?? "nothing"} (want ${want}, ${w.toFixed(2)})`]; });
assert.deepEqual(wrong, [], "reagents read wrongly");
// A mixture is not one compound; a line splits at commas outside brackets; the atmosphere's gas is not a reagent.
for (const mix of ["toluene/EtOH/H2O (4:1:1)", "toluene/EtOH/H2O", "THF/H2O"]) assert.equal(weightOf(mix), undefined, mix);
assert.deepEqual(conditionItems("toluene/EtOH/H2O (4:1:1, 30 mL), 80 °C; 12 h"), ["toluene/EtOH/H2O (4:1:1, 30 mL)", "80 °C", "12 h"]);
for (const gas of ["N2", "Ar", "argon", "air", "under N2"]) assert.ok(inert(gas), gas);
for (const reagent of ["H2", "O2", "CO", "NH3"]) assert.ok(!inert(reagent), reagent);
console.log(`reagents.check: ${REAGENTS.length} reagents read right`);
