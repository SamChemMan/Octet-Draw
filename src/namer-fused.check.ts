// Run: node src/namer-fused.check.ts. Fused ring systems outside the namer's table (fusion.ts): each name becomes a
// structure (OPSIN), Octet names the structure, and OPSIN must read Octet's name back as the same structure (same
// standard InChI). Every name in these lists must be named, and none may be wrong. --names prints Octet's names.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { graphOf } from "./naming.ts";
import { iupacNameWhy } from "./namer.ts";
import type { Mol } from "./render.ts";

const dir = new URL("./vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("namer-fused.check: skipped (no OPSIN build)"); process.exit(0); }
const pack = readFileSync(new URL("opsin-data.bin", dir));
const files = new Map<string, Int8Array>();
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
const indigo = await (await import(new URL("../node_modules/indigo-ketcher/indigo-ketcher-norender.js", import.meta.url).href)).default();
const convert = (s: string, f: string) => {
  const o = new indigo.MapStringString();
  try { return indigo.convert(s, f, o).trim(); } finally { o.delete(); }
};
// The structure and its CIP labels, read from SMILES by Indigo (Kekulé bonds).
const parsed = (smiles: string) => {
  const o = new indigo.MapStringString();
  o.set("output-content-type", "application/json");
  o.set("dearomatize-on-load", "true");
  try {
    const ket = JSON.parse(JSON.parse(indigo.calculateCip(smiles, "ket", o)).struct);
    const atoms: { label: string; charge?: number; cip?: string }[] = [], bonds: { type: number; atoms: [number, number]; cip?: string }[] = [];
    for (const { $ref } of ket.root.nodes) {
      const f = ket[$ref], base = atoms.length;
      if (f?.type !== "molecule") continue;
      atoms.push(...f.atoms);
      bonds.push(...f.bonds.map((b: { type: number; atoms: [number, number]; cip?: string }) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] })));
    }
    return { atoms, bonds };
  } finally { o.delete(); }
};
const molOf = (smiles: string): Mol => {
  const m = parsed(smiles);
  return { atoms: m.atoms.map((a) => ({ label: a.label, charge: a.charge, location: [0, 0, 0] as [number, number, number] })), bonds: m.bonds.map((b) => ({ type: b.type, atoms: b.atoms })) };
};
const cipOf = (smiles: string) => { const m = parsed(smiles); return { atoms: m.atoms.map((a) => a.cip), bonds: m.bonds.map((b) => b.cip) }; };

// Names every structure in a list: none may be missed or wrong.
function run(label: string, names: string[]) {
  const missed: string[] = [], wrong: string[] = [], out: string[] = [];
  const t0 = performance.now();
  for (const input of names) {
    const smiles = input.startsWith("smiles:") ? input.slice(7) : opsin.parseToSmiles(input);
    assert.ok(smiles, `OPSIN reads ${input}`);
    const g = graphOf(molOf(smiles), cipOf(smiles));
    const r = g ? iupacNameWhy(g) : { why: "graph" };
    if (!r.name) { missed.push(`${input} (${r.why})`); continue; }
    const back = opsin.parseToSmiles(r.name);
    if (back && convert(back, "inchi") === convert(smiles, "inchi")) out.push(`${input} -> ${r.name}`);
    else wrong.push(`${input} -> ${r.name}`);
  }
  const ms = (performance.now() - t0) / names.length;
  if (process.argv.includes("--names")) console.log(out.join("\n"));
  if (missed.length) console.log(`${label} missed: ${missed.join("; ")}`);
  if (wrong.length) console.log(`${label} WRONG: ${wrong.join("; ")}`);
  console.log(`namer-fused.check: ${label} ${out.length}/${names.length} named, ${wrong.length} wrong (${ms.toFixed(1)} ms each)`);
  assert.equal(wrong.length, 0, `a ${label} name OPSIN reads as a different structure`);
  if (!process.argv.includes("--all")) assert.equal(missed.length, 0, `a ${label} structure has no name`);
}

// Two monocycles: fusion descriptors with the base's letters and the attached component's locants (P-25.3.1.3).
run("bicyclic", [
  "imidazo[1,2-a]pyridine", "1H-pyrrolo[2,3-b]pyridine", "1H-pyrrolo[3,2-c]pyridine", "thieno[2,3-b]pyridine", "thieno[3,2-c]pyridine",
  "furo[3,2-b]pyridine", "furo[2,3-c]pyridine", "pyrazolo[1,5-a]pyrimidine", "1H-pyrazolo[3,4-d]pyrimidine", "[1,2,4]triazolo[4,3-a]pyridine",
  "[1,2,4]triazolo[1,5-a]pyrimidine", "imidazo[2,1-b][1,3]thiazole", "pyrido[2,3-d]pyrimidine", "pyrazino[2,3-b]pyrazine", "7H-pyrrolo[2,3-d]pyrimidine",
  "indolizine", "4H-quinolizine", "1H-pyrrolizine", "thieno[3,2-b]thiophene", "1H-cyclopenta[b]pyridine", "5H-cyclopenta[b]pyridine",
  "imidazo[1,2-b]pyridazine", "imidazo[1,5-a]pyridine", "pyrrolo[1,2-a]pyrazine", "[1,2,4]triazolo[4,3-b]pyridazine", "furo[3,4-c]pyridine",
  "1H-imidazo[4,5-b]pyridine", "3H-imidazo[4,5-c]pyridine", "pyrrolo[2,1-b][1,3]oxazole", "2H-furo[3,2-b]pyran", "pyrimido[4,5-d]pyrimidine",
]);
// Benzo names (P-25.2.2.4): a benzene ring and a heteromonocycle.
run("benzo", [
  "2H-1,4-benzoxazine", "4H-3,1-benzoxazine", "2H-1,3-benzodioxole", "2,3-dihydro-1,4-benzodioxine", "2,1,3-benzothiadiazole",
  "2,1,3-benzoxadiazole", "1H-1,4-benzodiazepine", "1H-3-benzazepine", "1-benzoxepine", "1,2,3-benzotriazine", "1H-benzotriazole",
  "4H-1-benzothiopyran", "1H-2-benzopyran", "1,3-benzoxathiole", "5H-benzo[7]annulene",
]);
// Polycyclic components and several attached components.
run("polycyclic", [
  "pyrrolo[3,4-c]quinoline", "9H-pyrido[3,4-b]indole", "9H-pyrido[2,3-b]indole", "benzo[g]quinoline", "benzo[h]quinoline", "naphtho[2,3-b]furan",
  "naphtho[2,1-b]furan", "dibenzo[b,d]furan", "dibenzo[b,d]thiophene", "5H-dibenzo[b,f]azepine", "dibenzo[b,e][1,4]dioxine", "[1]benzofuro[3,2-b]pyridine",
  "pyrido[1,2-a]benzimidazole", "tetraphene", "dibenzo[a,h]anthracene", "benzo[c]phenanthrene", "5H-dibenzo[a,d][7]annulene", "dibenzo[b,e]oxepine",
  "11H-dibenzo[b,e][1,4]diazepine", "4H-[1,2,4]triazolo[4,3-a][1,4]benzodiazepine", "4H-thieno[2,3-b][1,5]benzodiazepine", "[1]benzothieno[3,2-d]pyrimidine",
  "1H-benzo[de]isoquinoline", "1H,3H-benzo[de]isochromene", "2H-naphtho[1,8-bc]furan", "1H-cyclopenta[a]naphthalene", "benzo[f]quinoxaline",
  "thieno[2,3-b]quinoline", "furo[3,2-g][1]benzopyran", "[1,3]dioxolo[4,5-g]quinoline", "difuro[3,2-b:2',3'-d]pyridine", "furo[3,2-b]thieno[2,3-e]pyridine",
]);
// Retained names outside the namer's own table (P-25.1.1, P-25.2.1).
run("retained", [
  "acenaphthylene", "azulene", "pyrene", "chrysene", "fluoranthene", "1H-phenalene", "triphenylene", "biphenylene", "s-indacene", "as-indacene",
  "tetracene", "picene", "perylene", "coronene", "pentalene", "heptalene", "1H-perimidine", "1,10-phenanthroline", "phenanthridine", "thianthrene",
  "phenoxathiine", "aceanthrylene", "acephenanthrylene", "rubicene", "ovalene", "pentacene", "9H-thioxanthene",
]);
// Substituted, partly saturated and with suffixes: indicated and added hydrogen on fused systems.
run("derivatives", [
  "5-methyl-2-phenyl-3a,4,5,9b-tetrahydro-1H-pyrrolo[3,4-c]quinoline-1,3(2H)-dione", "2-phenylimidazo[1,2-a]pyridine", "1-methyl-9H-pyrido[3,4-b]indole",
  "4,5,6,7-tetrahydrothieno[3,2-c]pyridine", "1,5-dihydro-4H-pyrazolo[3,4-d]pyrimidin-4-one", "1H-benzo[de]isoquinoline-1,3(2H)-dione",
  "1H,3H-benzo[de]isochromene-1,3-dione", "10,11-dihydro-5H-dibenzo[b,f]azepine", "5-methyl-5H-dibenzo[b,f]azepine", "3,4-dihydro-2H-1,4-benzoxazine",
  "2,3,4,5-tetrahydro-1H-3-benzazepine", "acenaphthylene-1,2-dione", "1,2-dihydroacenaphthylene", "pyrene-1-carboxylic acid", "dibenzo[b,d]furan-2-ol",
  "2-methyl-2H-1,3-benzodioxole", "1,3-benzodioxol-5-ol", "9H-pyrido[3,4-b]indol-1-amine", "imidazo[1,2-a]pyridin-3-ylmethanol",
  "7-chloro-1-methyl-5-phenyl-1,3-dihydro-2H-1,4-benzodiazepin-2-one",
]);
