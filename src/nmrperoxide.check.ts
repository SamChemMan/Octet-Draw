// Run: node src/nmrperoxide.check.ts. NMR shifts next to peroxides (issue 83; plan docs/plans/issue-83-peroxide-shifts.md):
// measured literature shifts of 23 peroxides predicted by release 1.1.2 and now (J5), the stand-in's rules (J2), Quality
// and Details (J3), the stress list (J6) and speed (J7).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const gl = globalThis as Record<string, unknown>;
gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
gl.window = globalThis;
gl.self = { location: { origin: "file://" } };
gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
const { graphOf } = await import("./naming.ts");
const { hydrogens } = await import("./render.ts");
const { writeOct, readOct, writeCdx, readCdx } = await import("./oct.ts");
const { toCdxml, fromCdxml } = await import("./cdxml.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { detailsTable, environment, heavy, nearPeroxide, peroxides, predict, quality, readTables, PEROXIDE_INC } = await import("./nmr.ts");
type Graph = import("./naming.ts").Graph;
type Mol = import("./render.ts").Mol;
type Nucleus = import("./nmr.ts").Nucleus;
type Signal = import("./nmr.ts").Signal;
await chem.ready;
readTables(gunzipSync(readFileSync(new URL("../data/nmr/shifts.bin.gz", import.meta.url))));

// A structure from SMILES (no stereo), as pasting it draws it; atoms in SMILES order.
const smiles = (s: string): Graph => graphOf(chem.importStructure(s))!;
// A graph from elements and bonds ([a, b, order]), hydrogens filled in; charges and hydrogens by atom when given.
type B = [number, number, number];
function graph(els: string[], bonds: B[], charge: Record<number, number> = {}, h: Record<number, number> = {}): Graph {
  const used = els.map(() => 0);
  for (const [a, b, o] of bonds) { used[a] += o; used[b] += o; }
  return { atoms: els.map((el, i) => ({ el, charge: charge[i] ?? 0, h: h[i] ?? (el === "H" ? 0 : hydrogens(el, charge[i] ?? 0, used[i])) })), bonds: bonds.map(([a, b, order]) => ({ a, b, order: order as 1 | 2 | 3 })) };
}
const on = (g: Graph, n: Nucleus, atom: number, solvent?: string): Signal => predict(g, n, solvent)!.signals.find((s) => s.atoms.includes(atom))!;
// A prediction as text: each signal's shift, count, spheres, measured shifts, spread and stand-in mark, sorted.
const text = (g: Graph, n: Nucleus, solvent?: string) => (predict(g, n, solvent)?.signals ?? []).map((s) => `${s.shift.toFixed(2)}x${s.nuclei}L${s.level}n${s.based}sd${s.sd.toFixed(2)}${s.standIn ? "*" : ""}`).sort().join(" ");
const both = (g: Graph) => [text(g, "13C"), text(g, "1H")];
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const envOf = (g: Graph) => environment(heavy(g).g);
const near = (env: ReturnType<typeof environment>, atom: number) => nearPeroxide(env, peroxides(env)!, atom);

// --- J5: the literature check ---------------------------------------------------------------------------------------
// Measured shifts of peroxides (CDCl₃ unless said), each from the paper cited, with release 1.1.2's prediction of the
// same atom (its nmr.ts and table at tag v1.1.2, 6395bd5, run on these graphs on 17 November 2026). Only atoms the
// paper assigns, or that are unambiguous (an α carbon, its hydrogens, OOH, a CH₃ by its multiplicity). Atoms listed
// together are compared after sorting (papers assign them both ways, or they are alike).
const SOURCES: Record<string, string> = {
  K13: "Kyasa, Puffer, Dussault, Synthesis of alkyl hydroperoxides via alkylation of gem-dihydroperoxides, J. Org. Chem. 2013, 78, 3452-3456, doi:10.1021/jo4001564",
  K15: "Kyasa, Meier, Pardini, Truttmann et al., Synthesis of ethers via reaction of carbanions and monoperoxyacetals, J. Org. Chem. 2015, 80, 12100-12114, doi:10.1021/acs.joc.5b02043",
  O18: "Olson, Jameson, Kyasa, Evans et al., Reductive cleavage of organic peroxides by iron salts and thiols, ACS Omega 2018, 3, 14054-14063, doi:10.1021/acsomega.8b01977",
  O09: "Oh, Scott, Currie, Clardy, Mycangimycin, a polyene peroxide from a mutualist Streptomyces sp., Org. Lett. 2009, 11, 633-636, doi:10.1021/ol802709x (CD₃OD/CDCl₃ 5:2; a CH₂'s two hydrogens as their mean)",
  X09: "Xu, Schwartz, Raible, Dussault, Asymmetric synthesis of 1,2-dioxanes: approaches to the peroxyplakoric acids, Tetrahedron 2009, 65, 9680-9685, doi:10.1016/j.tet.2009.09.068 (compound 12)",
  N16: "Nowak, Drozd, Mendyk, Lemieszek et al., A new method for the isolation of ergosterol and peroxyergosterol, Molecules 2016, 21, 946, doi:10.3390/molecules21070946 (HMBC table; C5 and C8 sorted)",
  Z14: "Zhu, Yang, Zeng, Zhang et al., Inducing effect of dihydroartemisinic acid in the biosynthesis of artemisinins, ScientificWorldJournal 2014, 293190, doi:10.1155/2014/293190",
  A22: "Amado, Costa, Paixão, Mendes et al., Synthesis, structure and antileishmanial evaluation of endoperoxide-pyrazole hybrids, Molecules 2022, 27, 5401, doi:10.3390/molecules27175401 (2o, 2t; the two spiro carbons sorted)",
  S19: "Sitko, Szelwicka, Wojewódka, Skwarek et al., Perdecanoic acid as a safe and stable medium-chain peracid, RSC Adv. 2019, 9, 30012-30018, doi:10.1039/c9ra06087a",
};
// Each shift: nucleus, atoms (SMILES order), measured, 1.1.2's, and kind: α (a carbon bonded to the O–O, or its
// hydrogens), β (one bond further), OOH, or other. table: the compound is in nmrshiftdb2 (not independent).
type Lit = { cls: string; name: string; src: string; smiles: string; table?: true; shifts: [Nucleus, number[], number[], number[], "α" | "β" | "OOH" | "other"][] };
const SET: Lit[] = [
  { cls: "hydroperoxide", name: "hexyl hydroperoxide", src: "K13", smiles: "CCCCCCOO", shifts: [["13C", [5], [76.7], [65], "α"], ["13C", [0], [13.9], [14.01], "other"], ["1H", [5], [4.03], [4.03], "α"], ["1H", [7], [8.36], [8.71], "OOH"], ["1H", [0], [0.89], [0.89], "other"]] },
  { cls: "hydroperoxide", name: "benzyl hydroperoxide", src: "K13", smiles: "OOCc1ccccc1", shifts: [["13C", [2], [79.2], [67.2], "α"], ["13C", [3], [135.7], [136.73], "β"], ["1H", [2], [5.02], [4.75], "α"], ["1H", [0], [8.25], [8.71], "OOH"]] },
  { cls: "hydroperoxide", name: "4-phenylbutyl hydroperoxide", src: "K13", smiles: "OOCCCCc1ccccc1", shifts: [["13C", [2], [76.9], [65], "α"], ["1H", [2], [4.09], [4.03], "α"], ["1H", [0], [8.44], [8.71], "OOH"]] },
  { cls: "hydroperoxide", name: "2-dodecyl hydroperoxide", src: "K13", smiles: "CC(OO)CCCCCCCCCC", shifts: [["13C", [1], [81.7], [74.1], "α"], ["13C", [0], [18.1], [20.75], "β"], ["1H", [1], [4.08], [4.33], "α"], ["1H", [0], [1.24], [1.26], "β"], ["1H", [3], [7.81], [8.82], "OOH"]] },
  { cls: "hydroperoxide", name: "2-methyl-1-phenylpropan-2-yl hydroperoxide", src: "O18", smiles: "CC(C)(OO)Cc1ccccc1", shifts: [["13C", [1], [83.2], [79.9], "α"], ["13C", [0], [24], [22.15], "β"], ["13C", [5], [44.6], [41.52], "β"], ["1H", [0], [1.22], [1.55], "β"], ["1H", [5], [2.9], [3.29], "β"]] },
  { cls: "gem-bisperoxide", name: "4-tert-butyl-1,1-dihydroperoxycyclohexane", src: "K13", smiles: "OOC1(OO)CCC(CC1)C(C)(C)C", shifts: [["13C", [2], [111], [108.9], "α"], ["1H", [0], [8.95], [8.71], "OOH"], ["1H", [11], [0.88], [0.89], "other"]] },
  { cls: "gem-bisperoxide", name: "1,1-bis(hexylperoxy)cyclododecane", src: "K13", smiles: "CCCCCCOOC1(OOCCCCCC)CCCCCCCCCCC1", shifts: [["13C", [8], [113.1], [108.9], "α"], ["13C", [5], [75], [65], "α"], ["13C", [0], [13.99], [14.01], "other"], ["1H", [5], [4.05], [4.03], "α"], ["1H", [0], [0.88], [0.89], "other"]] },
  { cls: "dialkyl peroxide", name: "methyl 2-methyl-1-phenylpropan-2-yl peroxide", src: "O18", smiles: "COOC(C)(C)Cc1ccccc1", shifts: [["13C", [0], [63.1], [55.5], "α"], ["13C", [3], [82.6], [79.9], "α"], ["13C", [4], [24.3], [22.15], "β"], ["13C", [6], [45], [41.52], "β"], ["1H", [0], [3.85], [3.76], "α"], ["1H", [4], [1.19], [1.55], "β"], ["1H", [6], [2.87], [3.29], "β"]] },
  { cls: "dialkyl peroxide", name: "tert-butyl 3-phenylpropyl peroxide", src: "O18", smiles: "CC(C)(C)OOCCCc1ccccc1", shifts: [["13C", [6], [74.33], [65], "α"], ["13C", [1], [80.19], [79.9], "α"], ["13C", [0], [26.5], [27.9], "β"], ["1H", [6], [4], [4.03], "α"], ["1H", [0], [1.29], [1.1], "β"]] },
  { cls: "dialkyl peroxide", name: "bis(3-phenylpropyl) peroxide", src: "O18", smiles: "c1ccccc1CCCOOCCCc1ccccc1", shifts: [["13C", [8], [76.36], [65], "α"], ["1H", [8], [4.07], [4.03], "α"]] },
  { cls: "dialkyl peroxide", name: "tert-butyl octyl peroxide", src: "K15", smiles: "CC(C)(C)OOCCCCCCCC", shifts: [["13C", [6], [75.1], [65], "α"], ["13C", [1], [79.9], [79.9], "α"], ["13C", [13], [14], [14.1], "other"], ["1H", [6], [3.93], [4.03], "α"], ["1H", [0], [1.25], [1.1], "β"]] },
  { cls: "peroxyacetal", name: "2-(1-methylcyclohexylperoxy)tetrahydropyran", src: "K15", smiles: "CC1(OOC2CCCCO2)CCCCC1", shifts: [["13C", [1], [81.5], [81.4], "α"], ["13C", [4], [101], [101.7], "α"], ["1H", [4], [5.04], [5.08], "α"], ["1H", [0], [1.26], [1.36], "β"]] },
  { cls: "peroxyacetal", name: "8-(2-methoxypropan-2-ylperoxy)-2,6-dimethyloct-2-ene", src: "K15", smiles: "COC(C)(C)OOCCC(C)CCC=C(C)C", shifts: [["13C", [2], [104.5], [108.9], "α"], ["13C", [7], [73.4], [65], "α"], ["13C", [3], [22.75], [26.1], "β"], ["1H", [7], [4.06], [4.03], "α"], ["1H", [3], [1.4], [1.4], "β"], ["1H", [0], [3.33], [3.3], "other"]] },
  { cls: "1,2-dioxolane", name: "mycangimycin", src: "O09", smiles: "OC(=O)CC1CC(OO1)CC=CC=CC=CC=CC=CC=CC=C", shifts: [["13C", [4], [78.4], [74.1], "α"], ["13C", [6], [81.6], [74.1], "α"], ["13C", [5], [45.9], [28.8], "β"], ["13C", [3], [40.2], [39.5], "β"], ["13C", [9], [32], [34.7], "β"], ["1H", [4], [4.63], [4.33], "α"], ["1H", [6], [4.28], [4.33], "α"], ["1H", [5], [2.43], [2.99], "β"], ["1H", [3], [2.585], [2.65], "β"], ["1H", [9], [2.525], [2.28], "β"]] },
  { cls: "1,2-dioxane", name: "6-methoxy-1,2-dioxane 12", src: "X09", smiles: "CCC=CC=CCCCC1(OC)CCC(OO1)C(C)CO", shifts: [["13C", [9], [102.8], [108.9], "α"], ["13C", [14], [82.4], [81.9], "α"], ["13C", [11], [48.4], [49.6], "other"], ["1H", [14], [4.12], [4.33], "α"], ["1H", [11], [3.25], [3.3], "other"]] },
  { cls: "endoperoxide", name: "ergosterol peroxide", src: "N16", smiles: "OC1CCC2(C)C3CCC4(C)C(C(C)C=CC(C)C(C)C)CCC4C35C=CC2(C1)OO5", shifts: [["13C", [27, 24], [79.4, 82.2], [78.01, 78.01], "α"], ["13C", [26], [135.4], [135.1], "β"], ["13C", [25], [130.8], [135.1], "β"], ["13C", [6], [51.1], [54.45], "β"], ["13C", [23], [51.7], [50.4], "β"], ["13C", [28], [37], [38.55], "β"], ["13C", [4], [36.9], [45.15], "β"], ["13C", [1], [66.5], [67.38], "other"], ["1H", [26], [6.25], [5.62], "β"], ["1H", [25], [6.52], [5.62], "β"], ["1H", [1], [3.98], [4.88], "other"]] },
  { cls: "endoperoxide", name: "artemisinin", src: "Z14", smiles: "CC1CCC2C(C)C(=O)OC3OC4(C)CCC1C32OO4", table: true, shifts: [["13C", [12], [105.3], [105.15], "α"], ["13C", [17], [79.5], [79.35], "α"], ["13C", [10], [93.7], [93.3], "β"], ["13C", [13], [25.2], [25.2], "β"], ["1H", [10], [5.86], [5.86], "β"], ["1H", [13], [1.45], [1.44], "β"]] },
  { cls: "ozonide or tetraoxane", name: "dispiro ozonide 2o", src: "A22", smiles: "CCOC(=O)C1CCC2(CC1)OOC3(O2)C4CC5CC(C4)CC3C5", shifts: [["13C", [8, 13], [108.04, 111.6], [108.9, 108.9], "α"]] },
  { cls: "ozonide or tetraoxane", name: "dispiro tetraoxane 2t", src: "A22", smiles: "CCOC(=O)C1CCC2(CC1)OOC3(OO2)C4CC5CC(C4)CC3C5", shifts: [["13C", [8, 13], [107.28, 110.61], [108.9, 108.9], "α"]] },
  { cls: "ozonide or tetraoxane", name: "diacetone diperoxide", src: "O18", smiles: "CC1(C)OOC(C)(C)OO1", shifts: [["13C", [1], [107.67], [108.9], "α"], ["13C", [0], [21.6], [26.1], "β"], ["1H", [0], [1.6], [1.4], "β"]] },
  { cls: "ozonide or tetraoxane", name: "triacetone triperoxide", src: "O18", smiles: "CC1(C)OOC(C)(C)OOC(C)(C)OO1", shifts: [["13C", [1], [107.62], [108.9], "α"], ["13C", [0], [21.44], [26.1], "β"], ["1H", [0], [1.49], [1.4], "β"]] },
  { cls: "perester or peroxy acid", name: "tert-butyl peroxybenzoate", src: "O18", smiles: "CC(C)(C)OOC(=O)c1ccccc1", shifts: [["13C", [1], [84.1], [79.9], "α"], ["13C", [0], [26.37], [27.9], "β"], ["1H", [0], [1.44], [1.14], "β"]] },
  { cls: "perester or peroxy acid", name: "perdecanoic acid", src: "S19", smiles: "CCCCCCCCCC(=O)OO", shifts: [["13C", [9], [174.82], [171.8], "α"], ["13C", [8], [30.58], [33.74], "β"], ["13C", [0], [14.23], [14.1], "other"], ["1H", [8], [2.41], [2.32], "β"], ["1H", [12], [11.36], [11.6], "OOH"], ["1H", [0], [0.88], [0.88], "other"]] },
];
type Row = { lit: Lit; nucleus: Nucleus; kind: string; atom: number; measured: number; before: number; now: number; signal: Signal };
const rows: Row[] = [];
for (const lit of SET) {
  assert.ok(SOURCES[lit.src], `${lit.name}: source`);
  const g = smiles(lit.smiles);
  for (const [nucleus, atoms, measured, before, kind] of lit.shifts) {
    // The atoms are what the paper names: carbons for ¹³C, atoms with hydrogens for ¹H (O only for OOH).
    for (const a of atoms) assert.ok(nucleus === "13C" ? g.atoms[a].el === "C" : g.atoms[a].h > 0 && (kind === "OOH") === (g.atoms[a].el === "O"), `${lit.name}: atom ${a}`);
    const signals = atoms.map((a) => on(g, nucleus, a)), order = signals.map((s, k) => k).sort((p, q) => signals[p].shift - signals[q].shift);
    const m = [...measured].sort((a, b) => a - b), b = [...before].sort((x, y) => x - y);
    order.forEach((k, j) => rows.push({ lit, nucleus, kind, atom: atoms[k], measured: m[j], before: b[j], now: signals[k].shift, signal: signals[k] }));
  }
}
const mae = (v: Row[], key: "before" | "now") => mean(v.map((r) => Math.abs(r[key] - r.measured)));
const independent = rows.filter((r) => !r.lit.table);
console.log("nmrperoxide.check: literature shifts, measured / 1.1.2 / now (ppm)");
for (const r of rows) console.log(`  ${r.lit.name}, ${r.nucleus} ${r.kind} atom ${r.atom}: ${r.measured} / ${r.before.toFixed(2)} / ${r.now.toFixed(2)}${r.signal.standIn ? " (stand-in)" : ""}${r.lit.table ? " (in nmrshiftdb2)" : ""}`);
// By kind of atom, and by class of peroxide (its α, β and OOH shifts).
const by = (pick: (r: Row) => string, v0 = independent) => [...new Set(v0.map(pick))].map((k) => { const v = v0.filter((r) => pick(r) === k); return { k, n: v.length, before: mae(v, "before"), now: mae(v, "now") }; });
const kinds = by((r) => `${r.nucleus} ${r.kind}`), classes = by((r) => `${r.lit.cls}, ${r.nucleus}`, independent.filter((r) => r.kind !== "other"));
console.log("  MAE, 1.1.2 to now (independent of nmrshiftdb2):");
for (const x of [...kinds, ...classes]) console.log(`  ${x.k}: ${x.n} shifts, ${x.before.toFixed(2)} to ${x.now.toFixed(2)}`);
const kind = (k: string) => kinds.find((x) => x.k === k)!;
// The plan's lines (J2, J5): α ¹³C within 3 ppm; ¹H α no worse than 1.1.2 + 0.05 ppm; every class no worse than 1.1.2,
// but for three named in the plan (changes after the literature check): ergosterol peroxide's ¹³C (C5/C8 and C6/C7 take
// nmrshiftdb2's 1,4-endoperoxides at one or two spheres), and ¹H of hydroperoxides and dialkyl peroxides (β CH₃, +0.01
// ppm). The gem-bisperoxide and tetraoxane rows are not independent: the second-O–O rule was set with them in view.
assert.ok(kind("13C α").now <= 3.0, `α ¹³C ${kind("13C α").now}`);
assert.ok(kind("13C α").now < kind("13C α").before - 2.5, "α ¹³C much nearer than 1.1.2");
assert.ok(kind("13C β").now < kind("13C β").before, "β ¹³C");
assert.ok(kind("1H α").now <= kind("1H α").before + 0.05, `¹H α ${kind("1H α").now}`);
assert.ok(kind("1H β").now <= kind("1H β").before, "¹H β");
const ALLOWED: Record<string, number> = { "endoperoxide, 13C": 3.4, "hydroperoxide, 1H": 0.33, "dialkyl peroxide, 1H": 0.19 };
for (const x of classes) assert.ok(x.now <= (ALLOWED[x.k] ?? x.before + 1e-9), `${x.k}: ${x.before.toFixed(2)} to ${x.now.toFixed(2)}`);
assert.ok(new Set(independent.map((r) => r.lit.name)).size >= 10 && new Set(independent.map((r) => r.lit.cls)).size >= 6, "at least 10 peroxides in 6 classes");
// Artemisinin is in nmrshiftdb2: its shifts are the table's own (all six spheres).
for (const r of rows.filter((x) => x.lit.table)) { assert.equal(r.signal.level, 6); assert.ok(Math.abs(r.now - r.measured) < 0.5, `artemisinin ${r.atom}`); }

// --- J2: the stand-in -----------------------------------------------------------------------------------------------
const hexylOOH = smiles("CCCCCCOO");
{
  // Hexyl hydroperoxide: the table has no CH₂–OO, so its carbon is hexyl methyl ether's plus the α CH₂ increment.
  const env = envOf(hexylOOH);
  assert.deepEqual(near(env, 5), { near: 1, far: [[7]], inc: ["α CH2"] });
  assert.deepEqual(near(env, 4), { near: 2, far: [[7]], inc: ["β sp3"] });
  assert.equal(near(env, 3), undefined, "γ carbons have no stand-in");
  assert.ok(on(hexylOOH, "13C", 5).standIn && Math.abs(on(hexylOOH, "13C", 5).shift - 76.7) < 1.5);
  // ¹³C only: ¹H has no stand-in (nor ¹⁹F and ³¹P, which predict() never sends near one).
  assert.ok(predict(hexylOOH, "1H")!.signals.every((s) => !s.standIn));
}
{
  // Ties: C4 of a 1,2-dioxolane is as far from both O; a stand-in for each, averaged. C4 of a 1,2-dioxane is β to the
  // nearer O and γ to the other: one stand-in, its farther O made carbon.
  const dioxolane = smiles("C1CCOO1"), dioxane = smiles("C1CCOOC1");
  assert.deepEqual(near(envOf(dioxolane), 1)!.far, [[3], [4]]);
  assert.deepEqual(near(envOf(dioxane), 1), { near: 2, far: [[4]], inc: ["β sp3"] });
  // The same in every atom order (stress 11 and 12).
  const order = (g: Graph, p: number[]): Graph => ({ atoms: p.map((i) => g.atoms[i]), bonds: g.bonds.map((b) => ({ ...b, a: p.indexOf(b.a), b: p.indexOf(b.b) })) });
  for (const g of [dioxolane, dioxane, smiles("CC1(C)OOC(C)(C)OO1"), smiles("OC(=O)CC1CC(OO1)CC=CC")]) {
    const want = both(g), n = g.atoms.length;
    for (let k = 1; k <= 6; k++) {
      const p = Array.from({ length: n }, (_, i) => i).sort((a, b) => ((a * 7919 * k) % 101) - ((b * 7919 * k) % 101) || a - b);
      assert.deepEqual(both(order(g, p)), want, `atom order ${k}`);
    }
  }
}
{
  // Two O–O on one carbon (stress 5): both farther O replaced; the second O–O counts as acetal.
  const n = near(envOf(smiles("CC1(C)OOC(C)(C)OO1")), 1)!;
  assert.deepEqual(n.far, [[4, 8]]);
  assert.deepEqual([...n.inc].sort(), ["α C", "α acetal"]);
  assert.deepEqual([...near(envOf(smiles("CCCCCCOOC1(OOCCCCCC)CCCCCCCCCCC1")), 8)!.inc].sort(), ["α C", "α acetal"]);
}
// Exclusions: no stand-in, the direct lookup as before, every shift finite (stress 4, 6, 7, 9, 26).
for (const [what, g] of [
  ["dimethyldioxirane", smiles("CC1(C)OO1")],
  ["di-tert-butyl trioxide", smiles("CC(C)(C)OOOC(C)(C)C")],
  ["trimethylsilyl tert-butyl peroxide", smiles("C[Si](C)(C)OOC(C)(C)C")],
  ["a sulfonyl peroxide", smiles("CS(=O)(=O)OOC(C)(C)C")],
  ["an aminyl peroxide", smiles("CN(C)OOC(C)(C)C")],
  ["a tert-butylperoxy titanium", smiles("CC(C)(C)OO[Ti](Cl)(Cl)Cl")],
  ["a peroxyl radical", graph(["C", "C", "C", "C", "O", "O"], [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [4, 5, 1]], {}, { 5: 0 })],
  ["sodium tert-butylperoxide", smiles("CC(C)(C)O[O-].[Na+]")],
] as [string, Graph][]) {
  for (const n of ["1H", "13C"] as Nucleus[]) {
    const p = predict(g, n);
    assert.ok(!p || p.signals.every((s) => !s.standIn && Number.isFinite(s.shift)), `${what} ${n}`);
  }
}
{
  // An η²-peroxo complex: its O–O is an η bond (~), not a peroxide (stress 8).
  assert.equal(peroxides(envOf(graph(["Ti", "O", "O", "Cl", "Cl"], [[0, 1, 1], [0, 2, 1], [1, 2, 1], [0, 3, 1], [0, 4, 1]]))), undefined);
  // Only a single bond that is not aromatic is an O–O (stress 10): a 1,2-dioxin.
  const dioxin = graph(["C", "C", "C", "C", "O", "O"], [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 1], [5, 0, 1]]), env = envOf(dioxin);
  for (const [a, b] of peroxides(env)?.pairs ?? []) assert.equal(env.edges[a].find((e) => e.to === b)!.bond, "");
  assert.ok(predict(dioxin, "13C")!.signals.every((s) => Number.isFinite(s.shift)));
}

// --- J3: Quality and Details ----------------------------------------------------------------------------------------
{
  const s = on(hexylOOH, "13C", 5), [, count, mad] = PEROXIDE_INC["α CH2"];
  assert.equal(quality(s, "13C"), "rough", "a stand-in shift is rough");
  assert.equal(s.based, count, "Measured shifts: the increment's");
  assert.ok(s.sd >= 1.4826 * mad - 1e-9, "Spread: the stand-in's and the increment's combined");
  assert.ok(s.level !== undefined && s.level <= 2, "Spheres matched: the carbon's own match");
  const row = detailsTable(predict(hexylOOH, "13C")!).split("\n").find((r) => r.startsWith(`CH2\t${s.shift.toFixed(1)}\t`))!.split("\t");
  assert.deepEqual(row.slice(-5), [String(s.level), String(count), "any solvent", s.sd.toFixed(1), "rough"]);
  // OOH: broad and rough; gone in D₂O and CD₃OD (stress 20), the other shifts as in any solvent.
  const ooh = on(hexylOOH, "1H", 7);
  assert.ok(ooh.broad && quality(ooh, "1H") === "rough");
  for (const solvent of ["D₂O", "CD₃OD"]) {
    assert.ok(!predict(hexylOOH, "1H", solvent)!.signals.some((x) => x.atoms.includes(7)), `OOH gone in ${solvent}`);
    assert.equal(on(hexylOOH, "1H", 5, solvent).shift, on(hexylOOH, "1H", 5).shift);
  }
  // The ¹³C solvent table applies to the stand-in (CDCl₃).
  const c = on(hexylOOH, "13C", 5, "CDCl₃");
  assert.ok(c.standIn && Number.isFinite(c.shift));
  // ¹H on a carbon bonded to the O–O keeps 1.1.2's shift (the unmarked codes): hexyl CH₂OO 4.03, as 1.1.2.
  assert.equal(on(hexylOOH, "1H", 5).shift, 4.03);
}

// --- J6: the stress list --------------------------------------------------------------------------------------------
// 2: hydrogen peroxide alone: no ¹³C; one broad OOH signal of 2H, rough.
{
  const p = predict(smiles("OO"), "1H")!;
  assert.equal(predict(smiles("OO"), "13C"), undefined);
  assert.equal(p.signals.length, 1);
  assert.ok(p.signals[0].broad && p.signals[0].nuclei === 2 && quality(p.signals[0], "1H") === "rough");
}
// 3 and 16: structures with no O–O predict as 1.1.2 did (each signal's atoms, shift, spheres, count and spread; the
// snapshot made with v1.1.2's nmr.ts and table). Sodium tert-butylperoxide's carbons match codes on kinds that 1.1.2
// shared with tert-butyl peroxides (rule 1): the same shifts and spheres, counts 954 to 934 (CH₃ ¹H), 1978 to 1967
// (CH₃ ¹³C) and 1327 to 1316 (C), spreads 0.20 to 0.19 and 2.65 to 2.62.
const SNAP: Record<string, string> = { "ethyl acetate": "CCOC(C)=O", toluene: "Cc1ccccc1", ethanol: "CCO", phenol: "Oc1ccccc1", THF: "C1CCOC1", "diethyl ether": "CCOCC", "1,3-dioxolane": "C1COCO1", ferrocene: "[CH-]1C=CC=C1.[CH-]1C=CC=C1.[Fe+2]", ethanesulfonamide: "CCS(N)(=O)=O", paclitaxel: "CC1=C2C(C(=O)C3(C(CC4C(C3C(C(C2(C)C)(CC1OC(=O)C(C(C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C", oxygen: "O=O", ozone: "[O-][O+]=O", "sodium peroxide": "[Na+].[Na+].[O-][O-]", "hydroperoxide anion": "[O-]O", "sodium tert-butylperoxide": "CC(C)(C)O[O-].[Na+]", "hydrogen peroxide": "OO" };
const V112: Record<string, Record<string, [string, number, number, number, number][]>> = {"ethyl acetate":{"1H":[["1",4.1,6,1,0],["4",1.97,6,1,0],["0",1.2,6,1,0]],"13C":[["3",170.7,6,3,0.16],["1",60.4,6,3,0.12],["4",21,6,3,0.05],["0",14.4,6,3,0.12]]},"toluene":{"1H":[["3,5",7.14,6,2,0],["2,6",7.06,6,2,0],["4",7.04,6,1,0],["0",2.3,6,1,0]],"13C":[["1",137.8,6,3,0.02],["2,6",128.85,6,8,0.34],["3,5",128.82,6,8,0.39],["4",125.55,6,4,0.21],["0",21.53,6,4,0.27]]},"ethanol":{"1H":[["1",3.67,6,2,0.03],["2",3.66,2,330,1.28],["0",1.19,6,2,0.02]],"13C":[["1",58.4,6,3,1.13],["0",18.6,6,3,1.3]]},"phenol":{"1H":[["0",9.14,4,63,2.38],["3,5",7.32,6,2,0],["4",6.99,6,1,0],["2,6",6.92,6,2,0]],"13C":[["1",156.66,6,2,1.46],["3,5",131.2,6,4,1.5],["4",122.13,6,2,1.22],["2,6",116.75,6,4,1.34]]},"THF":{"1H":[["2,4",3.64,6,4,0.07],["0,1",1.58,6,6,0.17]],"13C":[["2,4",67.9,6,2,0],["0,1",25.7,6,4,0.18]]},"diethyl ether":{"1H":[["1,3",3.42,6,16,0.08],["0,4",1.13,6,16,0.04]],"13C":[["1,3",66.9,6,2,0],["0,4",16.4,6,2,0]]},"1,3-dioxolane":{"1H":[["3",4.92,6,1,0],["0,1",3.92,6,2,0]],"13C":[["3",95.2,6,1,0],["0,1",64.5,6,2,0]]},"ferrocene":{"1H":[["0,5",5.99,1,1,0],["1,4,6,9",4.31,1,3,0.16],["2,3,7,8",4.15,2,3,0.15]],"13C":[["2,3,7,8",67.91,2,2,0],["1,4,6,9",64.55,1,2,0],["0,5",47.2,0,5,20.53]]},"ethanesulfonamide":{"1H":[["3",6.8,2,1,0],["1",3.31,1,75,0.54],["0",1.43,2,5,0.39]],"13C":[["1",53.2,1,177,5.83],["0",6.95,2,18,0.98]]},"paclitaxel":{"1H":[["45,49",8.07,6,31,0.14],["34,38",7.68,6,1,0],["47",7.59,6,135,0.11],["36",7.52,6,31,0.11],["46,48",7.47,6,115,0.13],["35,37",7.44,6,7,0.08],["25,29",7.41,4,2,0.06],["26,28",7.3,6,1,0],["27",7.28,6,3,0.02],["30",7.03,6,4,0.1],["3",6.28,6,5,0.03],["18",6.18,6,6,0.07],["23",5.75,6,4,0.04],["12",5.65,6,5,0.03],["39",5.62,3,1,0],["9",4.95,6,13,0.13],["22",4.72,6,4,0.08],["56",4.64,3,29,1.54],["7",4.4,6,6,0.03],["50",4.29,6,13,0.04],["11",3.8,6,5,0.05],["40",3.28,2,146,1.49],["8",2.55,6,6,0.01],["55",2.3,6,34,0.11],["61",2.19,6,12,0.09],["17",2.1,6,3,0.1],["0",1.88,6,7,0.08],["57",1.66,6,6,0.02],["15,16",1.17,6,24,0.06]],"13C":[["4",206.1,2,3,1.72],["20",171.4,2,85,2.83],["53",171.15,5,6,1.43],["59",169.7,4,2,0.3],["42",167.75,5,1,0],["31",166.5,3,23,2.02],["24",140.85,2,128,4.1],["1",137.7,3,25,2.86],["33",134.27,4,14,1.11],["47",133.4,6,111,0.98],["2",133.3,2,3,4.68],["36",131.96,6,57,0.65],["44",130,6,1,0],["45,49",129.45,6,8,0.09],["26,28",128.6,4,215,0.52],["46,48",128.6,6,82,0.72],["35,37",128.55,6,16,0.1],["27",127.5,5,124,0.9],["25,29",127.1,3,227,1.07],["34,38",127.1,5,16,0.2],["9",85.02,4,2,0.19],["10",81.63,3,6,1.78],["13",79.74,4,3,1.52],["3",76.1,2,1,0],["50",74.8,4,6,0.21],["12",72.7,3,3,0.79],["22",72.68,2,8,1.7],["7",71.85,2,24,2.82],["18",71,3,9,0.57],["23",60.6,1,307,6.42],["11",49.55,2,2,5.45],["6",48.3,2,30,3.3],["14",43,3,9,0.58],["17",38.5,4,7,1.71],["8",38.03,3,2,0.63],["15,16",24,4,18,3.45],["55",22.3,6,6,1.02],["57",20.6,3,7,3.27],["61",20.5,5,2,0],["0",15.7,4,25,1.12]]},"oxygen":{"1H":[],"13C":[]},"ozone":{"1H":[],"13C":[]},"sodium peroxide":{"1H":[],"13C":[]},"hydroperoxide anion":{"1H":[["1",5.62,0,2896,3.86]],"13C":[]},"sodium tert-butylperoxide":{"1H":[["0,2,3",1.36,2,954,0.2]],"13C":[["1",79.9,1,1327,6.25],["0,2,3",27.9,2,1978,2.65]]},"hydrogen peroxide":{"1H":[["0,1",8.82,1,5,1.24]],"13C":[]}};
for (const [name, s] of Object.entries(SNAP)) for (const n of ["1H", "13C"] as Nucleus[]) {
  const got = (predict(smiles(s), n)?.signals ?? []).map((x): [string, number, number, number, number] => [[...x.atoms].sort((a, b) => a - b).join(","), x.shift, x.level!, x.based, x.sd]);
  if (name === "sodium tert-butylperoxide") assert.deepEqual(got.map((x) => x.slice(0, 3)), V112[name][n].map((x) => x.slice(0, 3)), `${name} ${n}`);
  else assert.deepEqual(got, V112[name][n], `${name} ${n} as 1.1.2`);
}
// 12 and 13: the same peroxide however it arrives (hydrogens drawn, both Kekulé forms, labels, MOL, CDXML, CDX, .oct)
// gives the graph the drawn structure gives, and so the same prediction.
{
  const benzyl = (k: number) => graph(["O", "O", "C", "C", "C", "C", "C", "C", "C"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 2 - k], [4, 5, 1 + k], [5, 6, 2 - k], [6, 7, 1 + k], [7, 8, 2 - k], [8, 3, 1 + k]]);
  assert.deepEqual(both(benzyl(0)), both(benzyl(1)), "Kekulé forms");
  const drawnH = graph(["C", "C", "C", "C", "C", "C", "O", "O", "H"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1], [6, 7, 1], [7, 8, 1]]);
  assert.deepEqual(both(drawnH), both(hexylOOH), "the OOH hydrogen drawn as an atom");
  const fromMol = (m: Mol) => graphOf(chem.expandWithOrigins(m, true).mol)!;
  const m = chem.importStructure("CCCCCCOO");
  for (const [what, g] of [["MOL", fromMol(chem.importStructure(chem.toMolfile(m)))], [".oct", fromMol(readOct(writeOct(m, DEFAULT_STYLE)).mol)], ["CDX", fromMol(readCdx(writeCdx(m, DEFAULT_STYLE)).mol)], ["CDXML", fromMol(fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol)]] as [string, Graph][])
    assert.deepEqual(both(g), both(hexylOOH), what);
  // Labels typed at a chain's end.
  const labelled = (n: number, label: string): Mol => ({ atoms: [...Array.from({ length: n }, (_, i) => ({ label: "C", location: [i * 1.2, (i % 2) * 0.7, 0] as [number, number, number] })), { label: "C", text: label, location: [n * 1.2, (n % 2) * 0.7, 0] as [number, number, number] }], bonds: Array.from({ length: n }, (_, i) => ({ type: 1, atoms: [i, i + 1] as [number, number] })) });
  for (const [label, n, s] of [["OOH", 6, "CCCCCCOO"], ["OOtBu", 6, "CCCCCCOOC(C)(C)C"], ["CO3H", 5, "CCCCCC(=O)OO"], ["OOBz", 6, "CCCCCCOOC(=O)c1ccccc1"]] as [string, number, string][])
    assert.deepEqual(both(fromMol(labelled(n, label))), both(smiles(s)), `label ${label}`);
}
// 13: by name (Name to Structure: TBHP, DTBP, dicumyl peroxide, mCPBA), when the names engine is built.
{
  const dir = new URL("./vendor/opsin/", import.meta.url);
  if (existsSync(new URL("opsin.js", dir))) {
    const pack = readFileSync(new URL("opsin-data.bin", dir)), files = new Map<string, Int8Array>();
    for (let p = 0; ; ) {
      const n = pack.readUInt16BE(p); p += 2;
      if (!n) break;
      const name = pack.toString("latin1", p, p + n); p += n;
      const size = pack.readInt32BE(p); p += 4;
      files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
    }
    gl.opsinResource = (name: string) => files.get(name) ?? null;
    const opsin = await import(new URL("opsin.js", dir).href);
    opsin.init();
    const { DRUGS } = await import("./drugs.ts");
    const { attachOpsin, nameToSmiles } = await import("./names.ts");
    const json = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
    attachOpsin(opsin, readFileSync(new URL("names.txt", dir), "utf8"), json("./nameindex.json"), DRUGS, json("./abbreviations.json"));
    for (const [name, s] of [["TBHP", "CC(C)(C)OO"], ["DTBP", "CC(C)(C)OOC(C)(C)C"], ["dicumyl peroxide", "CC(C)(OOC(C)(C)c1ccccc1)c1ccccc1"], ["mCPBA", "OOC(=O)c1cccc(Cl)c1"]]) {
      const from = nameToSmiles(name);
      assert.ok(from, `${name} read`);
      assert.deepEqual(both(graphOf(chem.parseStructure(from!))!), both(smiles(s)), `${name} by name`);
    }
  } else console.log("nmrperoxide.check: names skipped (no OPSIN build)");
}
// 21: isotopes do not change codes: a ¹³C-labelled α carbon predicts as the plain compound.
assert.equal(text({ atoms: hexylOOH.atoms.map((a, i) => (i === 5 ? { ...a, iso: 13 } : a)), bonds: hexylOOH.bonds }, "13C"), text(hexylOOH, "13C"));

// --- J7: speed ------------------------------------------------------------------------------------------------------
// A 500-atom chain with 50 O–O bonds predicts each of ¹H and ¹³C in under 100 ms, every shift finite, and so does a
// chain of the same size with no O–O (stress 14). Best of three, as the machine may be busy.
for (const perox of [true, false]) {
  const els: string[] = [], bonds: B[] = [];
  for (let k = 0; k < 50; k++) {
    const o = els.length;
    els.push(...Array(8).fill("C"), perox ? "O" : "C", perox ? "O" : "C");
    for (let i = 0; i < 9; i++) bonds.push([o + i, o + i + 1, 1]);
    if (k) bonds.push([o - 1, o, 1]);
  }
  const g = graph(els, bonds);
  assert.equal(g.atoms.length, 500);
  if (perox) assert.equal(peroxides(envOf(g))!.pairs.length, 50);
  for (const n of ["1H", "13C"] as Nucleus[]) {
    // A time over the line is measured once more, best of 10, before it counts (the machine may be busy).
    let best = Infinity, p;
    for (let k = 0; k < 13 && (k < 3 || best >= 100); k++) { const t = performance.now(); p = predict(g, n); best = Math.min(best, performance.now() - t); }
    assert.ok(p!.signals.every((s) => Number.isFinite(s.shift) && Number.isFinite(s.sd)), `${n} finite`);
    assert.ok(best < 100, `${perox ? "50 O–O" : "no O–O"}: ${n} took ${best.toFixed(1)} ms at 500 atoms`);
  }
}
console.log("nmrperoxide.check: ok");
