// Run: node src/namer-hetero.check.ts. Groups built on N, O, S, P and the halogens (namer-hetero.ts). Each name (or
// "smiles:" structure) becomes a structure, Octet names it, and OPSIN must read Octet's name back as the same structure
// (same standard InChI). Every one must be named, and none may be wrong.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { graphOf } from "./naming.ts";
import { iupacNameWhy } from "./namer.ts";
import type { Mol } from "./render.ts";

const dir = new URL("./vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("namer-hetero.check: skipped (no OPSIN build)"); process.exit(0); }
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
    // Several fragments (a salt): one molecule with all of them.
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

// Every input must be named, and read back as the same structure.
function must(label: string, inputs: string[]) {
  const out: string[] = [];
  for (const input of inputs) {
    const smiles = input.startsWith("smiles:") ? input.slice(7) : opsin.parseToSmiles(input);
    assert.ok(smiles, `OPSIN reads ${input}`);
    const g = graphOf(molOf(smiles), cipOf(smiles));
    assert.ok(g, `a graph for ${input}`);
    const r = iupacNameWhy(g);
    assert.ok(r.name, `no name for ${input} (${smiles}): ${r.why}`);
    const back = opsin.parseToSmiles(r.name);
    assert.ok(back && convert(back, "inchi") === convert(smiles, "inchi"), `${input} -> ${r.name}, a different structure`);
    out.push(`${input} -> ${r.name}`);
  }
  console.log(`namer-hetero.check: ${label} ${out.length}/${inputs.length}${process.argv.includes("-v") ? `: ${out.join("; ")}` : ""}`);
}

// Thio analogues of acids, esters, amides, aldehydes, ketones and acid halides (P-65.1.5, P-66.1.4.1, P-64.6). The
// thioamide is from Sam's ChemDraw files (4-methoxybenzenecarbothioamide).
must("thio", [
  "smiles:C(=S)(N)C1=CC=C(OC)C=C1", "4-methoxybenzene-1-carbothioamide", "ethanethioamide", "N-methylethanethioamide", "N-phenylbenzenecarbothioamide",
  "ethanedithioamide", "propane-2-thione", "cyclohexanethione", "1-phenylethane-1-thione", "pyrrolidine-2-thione", "quinoline-2(1H)-thione",
  "1,7-dihydro-6H-purine-6-thione", "ethanethioic S-acid", "ethanethioic O-acid", "ethanedithioic acid", "benzenecarbothioic S-acid",
  "S-methyl ethanethioate", "O-methyl ethanethioate", "methyl ethanedithioate", "S-phenyl benzenecarbothioate", "S-(2-aminoethyl) ethanethioate",
  "ethanethial", "methanethial", "benzenecarbothialdehyde", "ethanethioyl chloride", "benzenecarbothioyl chloride",
  "4-carbamothioylbenzoic acid", "4-(dimethylcarbamothioyl)benzoic acid", "4-(ethanethioylamino)benzoic acid", "3-(acetylsulfanyl)propanoic acid",
  "4-[(methylsulfanyl)carbonyl]benzoic acid", "4-(methoxycarbonothioyl)benzoic acid", "4-methanethioylbenzoic acid", "4-(sulfanylcarbonyl)benzoic acid",
  "4-(hydroxycarbonothioyl)benzoic acid", "4-(sulfanylcarbonothioyl)benzoic acid", "4-(ethanethioyl)benzoic acid", "4-(4-methylbenzenecarbothioyl)benzoic acid",
  "4-(cyclohexanecarbothioyl)benzoic acid", "4-(ethanethioyloxy)benzoic acid", "4-sulfanylidenecyclohexan-1-one", "3-amino-3-sulfanylidenepropanamide",
  "sulfanylideneacetic acid", "thiourea", "N-prop-2-en-1-ylthiourea", "N,N'-diphenylthiourea", "O-methyl carbamothioate",
  "2-{[(tert-butoxy)carbonothioyl]amino}acetic acid",
]);
