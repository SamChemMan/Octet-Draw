// Run: node src/namer-rings.check.ts. Monocycles (Hantzsch–Widman and retained names, indicated and added hydrogen,
// hydro prefixes), ring unsaturation, double-bonded substituents (ylidene) and long chains. Each name becomes a
// structure (OPSIN), Octet names the structure, and OPSIN must read Octet's name back as the same structure (same
// standard InChI). Every one must be named, and none may be wrong.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { graphOf } from "./naming.ts";
import { iupacNameWhy } from "./namer.ts";
import type { Mol } from "./render.ts";

const dir = new URL("./vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("namer-rings.check: skipped (no OPSIN build)"); process.exit(0); }
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

// Each input (a name, or smiles:...) must get a name that OPSIN reads back as the same structure. With "=", the name
// must also be exactly the one given.
function run(label: string, inputs: string[]) {
  const out: string[] = [];
  for (const input of inputs) {
    const [source, want] = input.split(" = ");
    const smiles = source.startsWith("smiles:") ? source.slice(7) : opsin.parseToSmiles(source);
    assert.ok(smiles, `OPSIN reads ${source}`);
    const g = graphOf(molOf(smiles), cipOf(smiles));
    assert.ok(g, `graph of ${source}`);
    const r = iupacNameWhy(g);
    assert.ok(r.name, `no name for ${source} (${smiles}): ${r.why}`);
    const back = opsin.parseToSmiles(r.name);
    assert.ok(back && convert(back, "inchi") === convert(smiles, "inchi"), `${source} -> ${r.name}, a different structure`);
    if (want) assert.equal(r.name, want, source);
    out.push(r.name);
  }
  console.log(`namer-rings.check: ${label} ${out.length}/${inputs.length}`);
}

// Monocycles (P-22.2): Hantzsch–Widman names, retained names, replacement names for large rings; mancude rings with
// indicated hydrogen, added hydrogen and hydro prefixes (P-31.1.4.2.4, P-31.1.4.3.4). Sam's corpus: N-phenylmaleimide,
// N-methylpyridinones and the oxazolidinone.
run("monocycles", [
  "1-phenyl-1H-pyrrole-2,5-dione = 1-phenyl-1H-pyrrole-2,5-dione", "smiles:C1C(=O)N(C)C=CC=1 = 1-methylpyridin-2(1H)-one",
  "smiles:C1C=CN(C)C(=O)C=1C(F)(F)F = 1-methyl-3-(trifluoromethyl)pyridin-2(1H)-one",
  "smiles:O1C[C@H](C2C=CC=CC=2)NC1=O = (4S)-4-phenyl-1,3-oxazolidin-2-one",
  "pyridin-2(1H)-one", "4H-pyran-4-one = 4H-pyran-4-one", "2H-pyran-2-one = 2H-pyran-2-one", "thymine = 5-methylpyrimidine-2,4(1H,3H)-dione",
  "cytosine = 4-aminopyrimidin-2(1H)-one", "isocytosine", "uracil", "barbituric acid", "cyanuric acid", "alloxan", "hydantoin = imidazolidine-2,4-dione",
  "1,3-oxazinane", "1,2,4-triazine", "1,2,3-triazine", "1H-1,2,4-triazole = 1H-1,2,4-triazole", "1H-1,2,3-triazole", "2H-1,2,3-triazole",
  "4H-1,2,4-triazole", "1H-tetrazole = 1H-tetrazole", "2H-tetrazole", "5-phenyl-1H-tetrazole", "1,2,4,5-tetrazine", "1,3,4-oxadiazole = 1,3,4-oxadiazole",
  "1,2,4-oxadiazole", "1,2,5-oxadiazole", "1,3,4-thiadiazole", "2H-1,3-dioxole", "1,3-dioxol-2-one = 2H-1,3-dioxol-2-one", "4H-1,3-dioxine",
  "2,2-dimethyl-4H-1,3-dioxin-4-one", "azepane = azepane", "1H-azepine", "1,4-diazepane", "azocane", "azonane", "azecane",
  "oxacyclododecane = 1-oxacyclododecane", "1-oxacyclohexadecan-2-one", "1,4,7,10,13,16-hexaoxacyclooctadecane",
  "2,3-dihydrofuran", "2,5-dihydrofuran", "3,4-dihydro-2H-pyran = 3,4-dihydro-2H-pyran", "1,2,3,6-tetrahydropyridine = 1,2,3,6-tetrahydropyridine",
  "4,5-dihydro-1H-imidazole", "4,5-dihydro-1,3-oxazole", "2,3-dihydro-1H-pyrrole", "furan-2(5H)-one = furan-2(5H)-one",
  "ascorbic acid = (5R)-5-[(1S)-1,2-dihydroxyethyl]-3,4-dihydroxyfuran-2(5H)-one", "glucal", "guvacine = 1,2,5,6-tetrahydropyridine-3-carboxylic acid",
  "imidazolidine", "pyrazolidine", "imidazolidin-2-one", "pyrazolidin-3-one", "1,3-thiazolidine", "thiomorpholine", "1,4-oxazepane", "oxepane",
  "thiirane", "2H-azirine", "azetidin-2-one", "oxetan-2-one", "1,3,5-trioxane", "1,2,4,5-tetroxane", "1,3-dithiolane", "1,2-dithiolane", "1,3-dithiane",
  "2H-thiopyran", "4H-1,4-oxazine", "2H-1,4-oxazine", "1,4-dihydropyridine", "pyridazin-3(2H)-one", "pyrazin-2(1H)-one", "pyrimidin-4(3H)-one",
  "4-hydroxy-6-methyl-2H-pyran-2-one", "5-fluoropyrimidine-2,4(1H,3H)-dione", "1H-pyrazol-5(4H)-one",
  "3-methyl-1-phenyl-1H-pyrazol-5(4H)-one = 5-methyl-2-phenyl-2,4-dihydro-3H-pyrazol-3-one", "1,2-dihydro-3H-pyrazol-3-one",
  "4,4-dimethyl-4,5-dihydro-1,3-oxazole", "uridine", "thymidine", "cytidine", "orotic acid", "2-(1H-tetrazol-5-yl)pyridine",
  "(1,2,4-triazin-3-yl)methanol", "1-(2H-pyran-2-yl)ethan-1-one", "3,4-dihydro-2H-pyran-2-ylmethanol",
]);

// Double-bonded substituents (P-29.2): methylidene, propan-2-ylidene, ring ylidenes, with E and Z at the parent atom.
run("ylidene", [
  "alpha-myrcene = 2-methyl-6-methylideneocta-1,7-diene", "beta-myrcene = 7-methyl-3-methylideneocta-1,6-diene", "beta-farnesene",
  "beta-pinene = 6,6-dimethyl-2-methylidenebicyclo[3.1.1]heptane", "camphene", "beta-terpinene", "terpinolene = 1-methyl-4-(propan-2-ylidene)cyclohex-1-ene",
  "fulvene = 5-methylidenecyclopenta-1,3-diene", "gamma-terpineol", "itaconic acid = 2-methylidenebutanedioic acid", "methylidenecyclohexane = methylidenecyclohexane",
  "(2E)-2-ethylidenecyclohexan-1-one = (2E)-2-ethylidenecyclohexan-1-one", "(2Z)-2-ethylidenecyclohexan-1-one", "2-methylidenebutanoic acid",
  "(2Z)-2-benzylidene-1-benzofuran-3(2H)-one", "4-methylidene-4H-pyran", "3-methylideneoxolan-2-one", "(propan-2-ylidene)propanedioic acid",
  "cyclohexylidenemethanol", "(cyclohexylidene)acetic acid", "5-benzylidene-1,3-thiazolidine-2,4-dione", "2-(oxolan-3-ylidene)acetic acid",
  "2,2-dimethyl-5-methylidene-1,3-dioxane-4,6-dione", "2-(diphenylmethylidene)propanedinitrile", "(2E)-2-[(2Z)-but-2-en-1-ylidene]cyclohexan-1-one",
]);

// Ring unsaturation: a ring's one multiple bond takes no locant on its own, and does with a suffix; ring triple bonds.
run("ring unsaturation", [
  "cyclohexene = cyclohexene", "cyclooctyne = cyclooctyne", "cyclohex-2-en-1-ol = cyclohex-2-en-1-ol", "cyclohex-2-ene-1-carboxylic acid = cyclohex-2-ene-1-carboxylic acid",
  "cyclopent-2-en-1-amine = cyclopent-2-en-1-amine", "p-menthyne", "benzyne", "(1Z,5Z)-cycloocta-1,5-diene",
  "cytidine = 4-amino-1-[(2R,3R,4S,5R)-3,4-dihydroxy-5-(hydroxymethyl)oxolan-2-yl]pyrimidin-2(1H)-one",
  "bicyclo[2.2.1]hept-2-yne = bicyclo[2.2.1]hept-2-yne", "bornyne = 1,7,7-trimethylbicyclo[2.2.1]hept-2-yne", "tropyne", "caryne", "spiro[4.5]dec-6-yne",
]);

// Rings with phosphorus (P-22.2.2.1): phosphinine, 1H-phosphole, 1,3,2-dioxaphospholane.
run("phosphorus rings", [
  "phosphinine = phosphinine", "phosphinane = phosphinane", "1H-phosphole = 1H-phosphole", "1-phenyl-1H-phosphole", "1,3,2-dioxaphospholane = 1,3,2-dioxaphospholane",
  "2-methyl-1,3,2-dioxaphospholane", "1-methylphospholane", "1,2-azaphosphinine",
]);

// Ketenes (P-64.1): the C=O carbon is a ketone at the end of a chain with a double bond.
run("ketenes", [
  "ethenone = ethenone", "2-phenylethen-1-one", "diphenylethenone", "dimethylketene = 2-methylprop-1-en-1-one", "fulvenone",
]);

// Chains of any length (P-14.2.1 numerical terms) and polyenes.
run("long chains", [
  "docosanoic acid = docosanoic acid", "henicosane = henicosane", "tricosane = tricosane", "dotriacontan-1-ol = dotriacontan-1-ol",
  "hentriacontane = hentriacontane", "tetratriacontanoic acid", "pentatriacontan-18-one", "(15Z)-tetracos-15-enoic acid", "squalane", "squalene",
  "lycopene", "all-trans-zeta-carotene", "gamma-carotene", "hectane = hectane",
]);
