// Run: node src/namer-classes.check.ts. Functional classes built on carbon (P-65, P-66, P-68): esters of polyacids and
// polyols, carbonic acid and its derivatives, amidines and guanidines, imides, hydrazides, hydroxamic acids, ketenes
// and cyanides. Each name becomes a structure (OPSIN), Octet names the structure, and OPSIN must read Octet's name
// back as the same structure (same standard InChI). Where the name itself matters, it must be the one given.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { graphOf } from "./naming.ts";
import { iupacNameWhy } from "./namer.ts";
import type { Mol } from "./render.ts";

const dir = new URL("./vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("namer-classes.check: skipped (no OPSIN build)"); process.exit(0); }
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

// Each entry: a name (or "smiles:…") OPSIN reads, and the name Octet must give, when it differs from the input.
// Octet's name must read back as the same structure.
function check(label: string, cases: (string | [string, string])[]) {
  const out: string[] = [];
  for (const c of cases) {
    const [input, want] = typeof c === "string" ? [c, c] : c;
    const smiles = input.startsWith("smiles:") ? input.slice(7) : opsin.parseToSmiles(input);
    assert.ok(smiles, `OPSIN reads ${input}`);
    const g = graphOf(molOf(smiles), cipOf(smiles));
    assert.ok(g, `graph for ${input}`);
    const r = iupacNameWhy(g);
    assert.ok(r.name, `no name for ${input} (${smiles}): ${r.why}`);
    const back = opsin.parseToSmiles(r.name);
    assert.ok(back && convert(back, "inchi") === convert(smiles, "inchi"), `${input} -> ${r.name}, a different structure`);
    if (!want.startsWith("smiles:")) assert.equal(r.name, want, `${input}`);
    out.push(r.name);
  }
  console.log(`namer-classes.check: ${label} ${out.length}/${cases.length}`);
}

// A carbonyl, ester, amide or nitrile carbon on a ring N names the ring as the parent (P-65.1.2.2, P-66.1.1.4.3), and
// a ketone on a ring N is a ketone (P-64.1.2): piperidine-1-carboxylic acid, 1-(piperidin-1-yl)ethan-1-one.
check("ring N", [
  "piperidine-1-carboxylic acid", "piperidine-1-carbaldehyde", "morpholine-4-carbaldehyde", "1H-indole-1-carbaldehyde",
  "tert-butyl 3-hydroxy-3-methylazetidine-1-carboxylate", "piperidine-1-carbonyl chloride", "N,N-dimethylpiperidine-1-carboxamide",
  "N-phenylpiperidine-1-carboxamide", "piperidine-1-carbonitrile", "1-acetylpiperidine-4-carboxylic acid", "1-carbamoylpiperidine-4-carboxylic acid",
  "4-(piperidine-1-carbonyl)benzoic acid", ["1-(piperidin-1-yl)ethan-1-one", "1-(piperidin-1-yl)ethanone"], "phenyl(pyrrolidin-1-yl)methanone",
  ["di(1H-imidazol-1-yl)methanone", "bis(1H-imidazol-1-yl)methanone"], "1-acetylpyrrolidin-2-one",
  ["2-[(piperidine-1-carbonyl)oxy]acetic acid", "[(piperidine-1-carbonyl)oxy]acetic acid"],
  // Sam's Boc-protected azetidine (corpus).
  ["smiles:C1(O)(C)CN(C(OC(C)(C)C)=O)C1", "tert-butyl 3-hydroxy-3-methylazetidine-1-carboxylate"],
]);

// Several esters (P-65.6.3.2): of a polyacid, alkyl groups in alphanumerical order with locants when they differ; of a
// polyol with one acid, the polyol's "diyl" name; other esters as acyloxy and alkoxy-oxo prefixes (P-65.6.3.3).
check("esters", [
  // Sam's dimethyl diazomalonate.
  ["dimethyl diazopropanedioate", "dimethyl 2-diazopropanedioate"], "diethyl propanedioate", "diethyl butanedioate", "dimethyl ethanedioate",
  ["ethyl methyl butanedioate", "1-ethyl 4-methyl butanedioate"], "1-ethyl 4-methyl 2-hydroxybutanedioate", "4-ethyl 1-methyl 2-hydroxybutanedioate",
  "dimethyl (2R,3R)-2,3-dihydroxybutanedioate", "dimethyl benzene-1,4-dicarboxylate", "di-tert-butyl butanedioate",
  "3-ethyl 5-methyl 2,6-dimethylpyridine-3,5-dicarboxylate", ["triacetin", "propane-1,2,3-triyl triacetate"], "ethane-1,2-diyl diacetate",
  "benzene-1,4-diyl diacetate", "(2R)-propane-1,2-diyl diacetate", ["tristearin", "propane-1,2,3-triyl trioctadecanoate"],
  ["triolein", "propane-1,2,3-triyl tris[(9Z)-octadec-9-enoate]"], "ethane-1,2-diyl bis(2-methylprop-2-enoate)",
  "methyl 4-(acetyloxy)benzoate", "4-methoxy-4-oxobutanoic acid", "2-(acetyloxy)ethyl propanoate", "methyl [(tert-butoxycarbonyl)amino]acetate",
  "methyl (1R,2R,3S,5S)-3-(benzoyloxy)-8-methyl-8-azabicyclo[3.2.1]octane-2-carboxylate", ["methyl 3,4-diacetoxybenzoate", "methyl 3,4-bis(acetyloxy)benzoate"],
]);
