// Run: node src/namer-charges.check.ts. Ions, zwitterions, salts, explicit hydrogen atoms and simple species: each
// name or SMILES becomes a structure, Octet names it, and OPSIN must read the name back as the same structure (same
// standard InChI). Every case must be named, and no name may be wrong.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { graphOf, type Graph } from "./naming.ts";
import { iupacName, iupacNameWhy } from "./namer.ts";
import type { Mol } from "./render.ts";

const dir = new URL("./vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("namer-charges.check: skipped (no OPSIN build)"); process.exit(0); }
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

// Each input (a name, or smiles:...) must be named, and the name must read back as the same structure.
function run(label: string, inputs: string[]) {
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
    out.push(r.name);
  }
  console.log(`namer-charges.check: ${label} ${out.length}/${inputs.length}: ${out.join("; ")}`);
}

// Anions (P-72): -oate, -sulfonate, -olate (oxido as a prefix), -aminide, and -ide for carbanions and ring N anions.
run("anions", [
  "acetate", "benzoate", "butanedioate", "smiles:OC(=O)CCC(=O)[O-]", "smiles:OC(=O)c1ccccc1C(=O)[O-]", "ethanolate", "phenolate",
  "2-methylpropan-2-olate", "smiles:[O-]c1ccc(C(=O)[O-])cc1", "methanesulfonate", "trifluoromethanesulfonate", "4-methylbenzene-1-sulfonate",
  "smiles:C1C=CC(=C1)[O-]", "cyclopenta-2,4-dien-1-ide", "benzenide", "phenylmethanide", "2-oxopropan-1-ide", "ethynediide",
  "1H-pyrrol-1-ide", "1H-imidazol-1-ide", "piperidin-1-ide", "9H-carbazol-9-ide", "1H-indol-1-ide", "methanaminide", "anilinide",
  "N-methylanilinide", "(2S)-2-hydroxypropanoate", "2-aminoethane-1-sulfinate", "acetylazanide", "smiles:[N-](C(=O)C)c1ccc(O)cc1",
  "bis(trifluoromethanesulfonyl)azanide", "smiles:[O-]C1=[C-]C=CC=C1", "methyl sulfate", "methyl phosphate", "methyl hydrogen phosphate",
  "dimethyl phosphate", "smiles:CCOP(=O)([O-])OC", "smiles:COC(=O)[O-]", "carbamate", "smiles:C[N+](C)(C)CCOP(=O)([O-])[O-]",
]);
// Cations (P-73): -ylium, -diazonium, -iminium, onium ions, pyrylium, and ring -ium.
run("cations", [
  "methylium", "2-methylpropan-2-ylium", "cyclohepta-2,4,6-trien-1-ylium", "benzenylium", "diphenylmethylium", "prop-2-en-1-ylium",
  "benzenediazonium", "4-nitrobenzene-1-diazonium", "methaniminium", "N,N-dimethylmethaniminium", "guanidinium",
  "trimethylsulfanium", "tetraphenylphosphanium", "triethyloxidanium", "methyl(triphenyl)phosphanium", "pyrylium",
  "2,4,6-triphenylpyrylium", "thiopyrylium", "1-methylpyridin-1-ium", "1-butyl-3-methylimidazolium", "3-carbamoyl-1-methylpyridin-1-ium",
  "smiles:C[n+]1ccccc1C=NO", "smiles:OC(=O)C[n+]1ccccc1", "smiles:C[N+](C)(C)CC(=O)O", "2-formylpyrylium",
  "3,7-bis(dimethylamino)phenothiazin-5-ium", "flavylium", "xanthylium", "phenoxazin-5-ium",
]);
// Zwitterions (P-74): the anion is the suffix, the cation a prefix; N-oxides as oxido.
run("zwitterions", [
  "(trimethylazaniumyl)acetate", "azaniumylacetate", "(2S)-2-azaniumylpropanoate", "(2S)-2-azaniumyl-3-phenylpropanoate",
  "4-azaniumylbenzoate", "1-methylpyridin-1-ium-3-carboxylate", "pyridine N-oxide", "4-phenylpyridine 1-oxide", "trimethylamine N-oxide",
  "(3R)-3-hydroxy-4-(trimethylazaniumyl)butanoate", "2-(dimethylsulfaniumyl)acetate", "(2S)-2,6-bis(azaniumyl)hexanoate",
  "(triphenylphosphaniumyl)methanide", "(pyridin-1-ium-1-yl)acetate", "smiles:C[n+]1ccn(CC(=O)[O-])c1", "N-methylpropan-2-imine N-oxide",
  "smiles:[CH2-][S+](C)(C)=O",
]);
// Salts (IR-5): metal and organic ions, Stock numbers, hydrogen halides and water of crystallisation.
run("salts", [
  "smiles:[Fe+3].[Cl-].[Cl-].[Cl-]", "smiles:[Cu+2].[Cl-].[Cl-]", "iron(II) sulfate", "copper(II) sulfate pentahydrate",
  "sodium carbonate decahydrate", "lithium nitride", "calcium nitride", "sodium amide", "beryllium amide", "lithium diisopropylamide",
  "potassium sodium tartrate", "aniline hydrochloride", "smiles:Cl.Cl.NCCN", "nitrosonium tetrafluoroborate",
  "2,4,6-triphenylpyrylium tetrafluoroborate", "sodium hydrogensulfate", "sodium sulfanide", "sodium hydroperoxide",
  "lithium aluminium hydride", "potassium chlorate", "sodium iodate", "sodium nitrite", "tetrasodium diphosphate",
  "pentasodium triphosphate", "potassium peroxydisulfate", "potassium dichromate", "benzenediazonium tetrafluoroborate", "trimethylsulfanium iodide",
  "tetraphenylphosphanium bromide", "sodium cyclopenta-2,4-dien-1-ide", "sodium 3-carboxypropanoate", "silver hexafluoroantimonate",
  "sodium dithionite", "sodium metabisulfite", "sodium disulfite", "1-butyl-3-methylimidazolium bis(trifluoromethanesulfonyl)azanide",
  "trimethylsulfoxonium iodide", "1-butyl-3-methylimidazolium dicyanamide", "potassium bifluoride", "pyridinium chlorochromate",
  "potassium hydrogen peroxymonosulfate", "smiles:[Sc+3].[O-]S(=O)(=O)C(F)(F)F.[O-]S(=O)(=O)C(F)(F)F.[O-]S(=O)(=O)C(F)(F)F",
  "smiles:[Li+].[CH2-]CCC", "smiles:[Mg+2].[Br-].[CH3-]", "tropylium tetrafluoroborate", "triethyloxonium tetrafluoroborate",
  "smiles:C=[N+](C)C.[I-]", "smiles:ClC=[N+](C)C.[Cl-]", "pyridinium p-toluenesulfonate", "smiles:[Pd+2].CC(=O)[O-].CC(=O)[O-]",
  "sodium dodecyl sulfate", "smiles:OCCOS(=O)(=O)[O-].[Na+]", "smiles:CC(C)OC(=O)[O-].[K+]", "sodium hydrogen butanedioate",
]);
// Simple species (IR-3, IR-6): parent hydrides, inorganic molecules and ions.
run("species", [
  "water", "ammonia", "phosphane", "hydrogen sulfide", "hydrogen chloride", "hydrogen bromide", "smiles:[H][H]",
  "smiles:N#N", "smiles:O=O", "smiles:ClCl", "ozone", "hydrogen peroxide", "nitrous oxide", "hydrogen azide", "hydrazine",
  "hydroxylamine", "carbon dioxide", "sulfur dioxide", "sulfuric acid", "nitric acid", "phosphoric acid", "carbonic acid",
  "ammonium", "oxidanium", "azanide", "chloride", "nitrate", "sulfate", "hydrogencarbonate", "perchlorate", "nitronium", "sulfamate",
  "smiles:[Na+]", "smiles:[Fe+3]", "argon", "sodium", "gold", "smiles:[CH3-]",
  "hypochlorous acid", "chloric acid", "periodic acid", "sulfamic acid", "phosphorus trichloride", "phosphoryl trichloride",
  "thionyl chloride", "sulfuryl chloride", "phosgene", "carbonyl sulfide", "smiles:[C-]#[O+]", "hydrogen cyanide", "cyanogen bromide",
]);
// Hydrogen drawn as atoms (Sam's files, 21 October 2026): each H on one atom joins that atom's hydrogen count.
run("explicit hydrogen", [
  "smiles:[H]O[H]", "smiles:[H]OO[H]", "smiles:C([H])(=O)C", "smiles:CC(O[H])=C", "smiles:C1([H])OC1(C)C1=CC=CC=C1",
  "smiles:[C@]1([H])(C2C=CC=CC=2)CCCC[C@@]1([H])O", "smiles:[C@]1([H])(C2C=CC=CC=2)CCCC[C@@]1([H])[O-]",
  "smiles:[C@@]12([H])O[C@]1([H])CCCC2", "smiles:[H]N([H])C(C)=O",
]);

// No wrong names from shapes that share a formula with a known species, and none for radicals or isotopes.
// Boranuides wait for boron (element B), and must then read back right.
for (const s of ["C(=O)O[O-]", "[NH3+][O-]", "[NH+]([O-])=O", "[O-]ON", "S(=O)(=O)([O-])S(=O)[O-]", "[C-]#[N+][O-]", "OS(=O)(=O)O[O-]", "OOS(=O)(=O)O",
  "c1ccccc1[B-](c1ccccc1)(c1ccccc1)c1ccccc1.[Na+]", "CC[BH-](CC)CC.[Li+]"]) {
  const g = graphOf(molOf(s), cipOf(s)), name = g && iupacName(g), back = name && opsin.parseToSmiles(name);
  assert.ok(!name || (back && convert(back, "inchi") === convert(s, "inchi")), `${s} -> ${name}, a different structure`);
}
// Lone atoms with their hydrogen counts as drawn (Indigo's SMILES reader gives [N] the usual three hydrogens).
const atom = (el: string, h: number, charge = 0): Graph => ({ atoms: [{ el, h, charge }], bonds: [] });
assert.equal(iupacName(atom("N", 0)), "nitrogen");
assert.equal(iupacName(atom("N", 2, 1)), "aminylium");
assert.equal(iupacName(atom("C", 0)), "carbon");
assert.equal(iupacName(atom("P", 3)), "phosphane");
assert.equal(iupacName(atom("Ar", 0)), "argon");
assert.equal(iupacName(atom("Au", 0)), "gold");
assert.equal(iupacName(atom("Cu", 0, 2)), "copper(2+)");
// A CH2• radical on N,N-dimethylaniline's N, and an O• on phenol: no name.
const radical: Graph = { atoms: [{ el: "C", h: 2, charge: 0 }, { el: "N", h: 0, charge: 0 }, { el: "C", h: 3, charge: 0 }, ...[1, 1, 1, 1, 1, 0].map((h) => ({ el: "C", h, charge: 0 }))],
  bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 1, b: 8, order: 1 }, { a: 3, b: 4, order: 2 }, { a: 4, b: 5, order: 1 }, { a: 5, b: 6, order: 2 }, { a: 6, b: 7, order: 1 }, { a: 7, b: 8, order: 2 }, { a: 8, b: 3, order: 1 }] };
assert.equal(iupacNameWhy(radical).why, "radical");
console.log("namer-charges.check: no wrong names for look-alike shapes, radicals and lone atoms");
