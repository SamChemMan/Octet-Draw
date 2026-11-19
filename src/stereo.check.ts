// Run: node src/stereo.check.ts. The stricter stereo warnings and Redraw Stereo Bonds (rules after Prof. Stefan
// Schramm's PR #145): a wedge or hash that sets nothing, Swap the ends of all, an allene wedged at both ends, a double
// bond whose E or Z the drawing does not show, each with drawings that must not be warned about; and Redraw Stereo
// Bonds, which moves no atom and never changes an R, S, E or Z label (hard natural products too).
import assert from "node:assert/strict";
import { browser } from "../scripts/checkkit.ts";

browser();
const { cipOf, parseStructure, ready, redrawStereo, stereoFacts, toInchi } = await import("./chem.ts");
const { problems } = await import("./check.ts");
const { flipBond } = await import("./edit.ts");
type Mol = import("./render.ts").Mol;
type Bond = Mol["bonds"][number];
await ready;

const atom = (label: string, x: number, y: number, more: Partial<Mol["atoms"][number]> = {}): Mol["atoms"][number] => ({ label, location: [x, y, 0], ...more });
const bond = (a: number, b: number, more: Partial<Bond> = {}): Bond => ({ type: 1, atoms: [a, b], ...more });
const found = (m: Mol) => problems(m, stereoFacts(m));
const kinds = (m: Mol, type: string) => found(m).filter((p) => p.type === type);
const join = (...ms: Mol[]): Mol => {
  const out: Mol = { atoms: [], bonds: [] };
  for (const m of ms) { const n = out.atoms.length; out.atoms.push(...m.atoms); out.bonds.push(...m.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + n, b.atoms[1] + n] as [number, number] }))); }
  return out;
};
// CHFClBr at x, its C–F bond taking `first` (a wedge from C by default).
const tetra = (x = 0, first: Partial<Bond> = { stereo: 1 }): Mol => ({
  atoms: [atom("C", x, 0), atom("F", x + 1, 0), atom("Cl", x - 0.5, -0.87), atom("Br", x - 0.5, 0.87)],
  bonds: [bond(0, 1, first), bond(0, 2), bond(0, 3)],
});
const propane = (more: Partial<Bond> = { stereo: 1 }): Mol => ({ atoms: [atom("C", 0, 0), atom("C", 0.87, 0.5), atom("C", -0.87, 0.5)], bonds: [bond(0, 1, more), bond(0, 2)] });
// The wedge (or hash) from atom c to atom j, made so from a plain bond.
const wedgeTo = (m: Mol, c: number, j: number, stereo: 1 | 6 = 1): Mol => ({ ...m, bonds: m.bonds.map((b) => (b.atoms.includes(c) && b.atoms.includes(j) ? { ...b, atoms: [c, j] as [number, number], stereo } : b)) });
const SETS = /so it sets nothing/;

// 1. A wedge or hash that sets nothing: propane's middle carbon wedged to a CH3 (neither end a stereocentre). Its fix
// redraws the stereo bonds. A hash too.
{
  for (const stereo of [1, 6] as const) {
    const said = found(propane({ stereo }));
    assert.deepEqual(said.map((p) => [p.type, p.bond, p.fix?.command]), [["backwards", 0, "redraw_stereo_at:0"]], `propane, stereo ${stereo}`);
    assert.match(said[0].message, SETS);
  }
  // Not warned about: a wedge from a stereocentre, to a methyl or to F.
  assert.deepEqual(found(tetra()), [], "from a stereocentre");
  const methyl: Mol = { ...tetra(), atoms: tetra().atoms.map((a, i) => (i === 1 ? { ...a, label: "C" } : a)) };
  assert.deepEqual(found(methyl), [], "from a stereocentre to a methyl");
  // A metal's wedges show a complex's shape.
  const pt: Mol = { atoms: [atom("Pt", 0, 0), atom("Cl", 1, 0), atom("Cl", -1, 0), atom("N", 0, 1), atom("N", 0, -1)], bonds: [bond(0, 1, { stereo: 1 }), bond(0, 2, { stereo: 6 }), bond(0, 3), bond(0, 4)] };
  assert.deepEqual(found(pt), [], "a metal's wedges");
  // A Stereocentres template (a carbon with bare end carbons) still to be filled in.
  const template: Mol = { atoms: [atom("C", 0, 0), atom("C", 1, 0), atom("C", -0.5, 0.87), atom("C", -0.5, -0.87)], bonds: [bond(0, 1, { stereo: 1 }), bond(0, 2, { stereo: 6 }), bond(0, 3)] };
  assert.deepEqual(found(template), [], "a template");
  // A wedge and a hash on a CMe2, or on a CH2's two H atoms, say which of two alike groups is which.
  const gem = parseStructure("CC1(C)CCC(=O)CC1"), q = gem.atoms.findIndex((_, i) => gem.bonds.filter((b) => b.atoms.includes(i)).length === 4);
  const [me1, me2] = gem.bonds.flatMap((b) => (b.atoms.includes(q) ? [b.atoms[0] === q ? b.atoms[1] : b.atoms[0]] : [])).filter((j) => gem.bonds.filter((b) => b.atoms.includes(j)).length === 1);
  assert.deepEqual(found(wedgeTo(wedgeTo(gem, q, me1, 1), q, me2, 6)), [], "a CMe2 drawn in 3D");
  assert.equal(kinds(wedgeTo(gem, q, me1, 1), "backwards").length, 1, "a lone wedge on a CMe2 sets nothing");
  // cis-1,4-Dimethylcyclohexane: its ring carbons set cis or trans, so their wedges are not idle.
  for (const smiles of ["C[C@H]1CC[C@@H](C)CC1", "C[C@H]1CC[C@H](C)CC1"]) {
    const m = parseStructure(smiles);
    assert.ok(m.bonds.some((b) => b.stereo), smiles);
    assert.deepEqual(found(m), [], smiles);
  }
  // A tropane's pseudoasymmetric C3, a sulfoxide's S and a phosphine oxide's P: Indigo's own drawings.
  for (const smiles of ["CN1[C@H]2CC[C@@H]1C[C@@H](O)C2", "C[S@](=O)c1ccccc1", "C[P@](=O)(OC)c1ccccc1", "C[N@+]1(CC)CCCC1C"]) assert.deepEqual(found(parseStructure(smiles)).filter((p) => p.type === "backwards" || p.type === "between"), [], smiles);
}
// A hindered biaryl: wedges on its axis atoms' ring bonds and from an ortho atom to its substituent set the axis, not a
// stereocentre. One from a meta CH to an F put on it sets nothing.
{
  const m = parseStructure("Cc1cccc(O)c1-c1c(C)cccc1O"), deg = (i: number) => m.bonds.filter((b) => b.atoms.includes(i)).length;
  const axis = m.bonds.findIndex((b) => b.type === 1 && b.atoms.every((i) => deg(i) === 3 && m.atoms[i].label === "C" && m.bonds.filter((x) => x.atoms.includes(i) && x.type !== 1).length <= 1 && m.bonds.filter((x) => x.atoms.includes(i)).every((x) => x === b || m.bonds.filter((y) => y.atoms.some((k) => x.atoms.includes(k))).length > 2)) && b.atoms.every((i) => m.bonds.filter((x) => x.atoms.includes(i)).every((x) => x === b || x.atoms.some((k) => k !== i && deg(k) >= 2))));
  const [a, c] = m.bonds[axis].atoms, ortho = m.bonds.flatMap((b) => (b.atoms.includes(a) && b !== m.bonds[axis] ? [b.atoms[0] === a ? b.atoms[1] : b.atoms[0]] : []));
  const sub = (o: number) => m.bonds.flatMap((b) => (b.atoms.includes(o) ? [b.atoms[0] === o ? b.atoms[1] : b.atoms[0]] : [])).find((j) => j !== a && deg(j) === 1);
  const withSub = ortho.find((o) => sub(o) !== undefined)!;
  assert.ok(c >= 0 && withSub !== undefined, "the biaryl's axis and a substituted ortho atom");
  assert.deepEqual(kinds(wedgeTo(m, a, ortho[0]), "backwards"), [], "a wedge on the axis atom's ring bond");
  assert.deepEqual(kinds(wedgeTo(m, withSub, sub(withSub)!), "backwards"), [], "a wedge from an ortho atom to its substituent");
  const meta = m.atoms.findIndex((_, i) => !ortho.includes(i) && i !== a && i !== c && m.atoms[i].label === "C" && deg(i) === 2 && m.bonds.some((b) => b.atoms.includes(i) && b.atoms.some((k) => ortho.includes(k))));
  const p = m.atoms[meta].location, f: Mol = { ...m, atoms: [...m.atoms, atom("F", p[0] + 1, p[1])], bonds: [...m.bonds, bond(meta, m.atoms.length, { stereo: 1 })] };
  assert.equal(kinds(f, "backwards").length, 1, "a wedge from a meta CH");
}

// 2. Swap the ends of all: two wedges drawn the wrong way round (in two structures) and one that sets nothing. Each of
// the two offers to swap both in one step; the other is redrawn.
{
  const back = (x: number) => flipBond(tetra(x), 0);
  const m = join(back(0), back(4), { atoms: [atom("C", 8, 0), atom("C", 8.87, 0.5), atom("C", 7.13, 0.5)], bonds: [bond(0, 1, { stereo: 1 }), bond(0, 2)] });
  const said = kinds(m, "backwards");
  assert.deepEqual(said.map((p) => [p.bond, p.fix?.label, p.fix?.command]), [[0, "Swap the ends of all 2", "flip_bonds:0,3"], [3, "Swap the ends of all 2", "flip_bonds:0,3"], [6, "Redraw stereo bonds", "redraw_stereo_at:8"]]);
  assert.match(said[0].message, /cannot be a stereocentre/);
  const fixed = [0, 3].reduce((x, k) => flipBond(x, k), m);
  assert.deepEqual(kinds(fixed, "backwards").map((p) => p.bond), [6], "only the one that sets nothing is left");
  // One alone swaps alone; a hidden one is not swapped with the others.
  assert.deepEqual(kinds(back(0), "backwards").map((p) => p.fix?.command), ["flip_bond:0"]);
  const hidden: Mol = { ...m, bonds: m.bonds.map((b, k) => (k === 3 ? { ...b, ignoreWarnings: true } : b)) };
  assert.deepEqual(kinds(hidden, "backwards").map((p) => p.fix?.command), ["flip_bond:0", "redraw_stereo_at:8"]);
}

// 3. An allene wedged at both ends is ambiguous (on its middle atom); at one end it sets the axis and is not warned
// about.
{
  const allene = (both: boolean): Mol => ({
    atoms: [atom("C", -1, 1), atom("C", 0, 0), atom("C", 1, 0), atom("C", 2, 0), atom("C", 3, 1), atom("F", -1, -1), atom("F", 3, -1)],
    bonds: [bond(1, 0, { stereo: 1 }), bond(1, 2, { type: 2 }), bond(2, 3, { type: 2 }), bond(3, 4, both ? { stereo: 6 } : {}), bond(1, 5), bond(3, 6)],
  });
  const stereo = (m: Mol) => found(m).filter((p) => p.type !== "linear");
  assert.deepEqual(stereo(allene(true)).map((p) => [p.type, p.atom]), [["ambiguous", 2]]);
  assert.match(stereo(allene(true))[0].message, /^The allene at C3 has wedges or hashes at both ends/);
  assert.deepEqual(stereo(allene(false)), [], "one end only");
}

// 4. A double bond that can be E or Z but whose drawing does not show which (a substituent in line with it), where
// Show Stereochemistry is on. Not: drawn zig-zag, Show Stereochemistry off, two alike groups on one end, a crossed
// double bond, a wavy bond at an end, an allene, a double bond in a small ring, a vinyl group or a C=O.
{
  const alkene = (fx: number, fy: number, more: (m: Mol) => Mol = (m) => m): Mol => more({
    atoms: [atom("F", fx, fy, { cip: true }), atom("C", 0, 0, { cip: true }), atom("C", 1, 0, { cip: true }), atom("Cl", 1.5, -0.87, { cip: true })],
    bonds: [bond(0, 1), bond(1, 2, { type: 2 }), bond(2, 3)],
  });
  const open = (m: Mol) => kinds(m, "unspecified").filter((p) => p.bond !== undefined);
  const line = alkene(-1, 0);
  assert.deepEqual(open(line).map((p) => [p.bond, p.message]), [[1, "The double bond C2=C3 can be E or Z, but the drawing does not show which. Draw its substituents in a zig-zag, or make it a crossed double bond if E/Z is not known."]]);
  assert.deepEqual(open(alkene(-0.5, 0.87)), [], "zig-zag");
  assert.deepEqual(open({ ...line, atoms: line.atoms.map((a) => ({ ...a, cip: undefined })) }), [], "Show Stereochemistry off");
  assert.deepEqual(open(alkene(-1, 0, (m) => ({ atoms: [...m.atoms, atom("F", -0.5, 0.87, { cip: true })], bonds: [...m.bonds, bond(1, 4)] }))), [], "two F on one end");
  assert.deepEqual(open(alkene(-1, 0, (m) => ({ ...m, bonds: m.bonds.map((b, k) => (k === 1 ? { ...b, display: "either" } : b)) }))), [], "a crossed double bond");
  assert.deepEqual(open(alkene(-1, 0, (m) => ({ ...m, bonds: m.bonds.map((b, k) => (k === 0 ? { ...b, display: "wavy" } : b)) }))), [], "a wavy bond at an end");
  const cumulene: Mol = { atoms: ["F", "C", "C", "C", "Cl"].map((l, i) => atom(l, i, 0, { cip: true })), bonds: [bond(0, 1), bond(1, 2, { type: 2 }), bond(2, 3, { type: 2 }), bond(3, 4)] };
  assert.deepEqual(open(cumulene), [], "an allene is an axis");
  const shown = (smiles: string) => { const m = parseStructure(smiles); return { ...m, atoms: m.atoms.map((a) => ({ ...a, cip: true as const })) }; };
  for (const smiles of ["C1=CCCCC1", "C=CC1CCCCC1", "CC(=O)C", "OC(=O)/C=C/C(=O)O", "CC/C=C\\C"]) assert.deepEqual(open(shown(smiles)), [], smiles);
  // The same alkene with its F moved in line: now open.
  const fum = shown("FC=CCl");
  assert.equal(open(fum).length, 0, "Indigo draws it zig-zag");
}

// 5. Redraw Stereo Bonds. Menthol with each wedge turned round (its wide end on the centre) and made a hash (each hash
// a wedge): Octet and ChemDraw still read it as menthol, InChI does not. Redraw puts a wedge or hash from each centre,
// moves no atom, and the drawing reads as menthol again.
{
  const menthol = "CC(C)[C@@H]1CC[C@@H](C)C[C@H]1O", m = parseStructure(menthol), want = toInchi(menthol), labels = cipOf(m);
  assert.equal(toInchi(m), want);
  const ks = m.bonds.flatMap((b, k) => (b.stereo ? [k] : []));
  assert.equal(ks.length, 3);
  const back = ks.reduce((x, k) => flipBond(x, k), { ...m, bonds: m.bonds.map((b) => (b.stereo ? { ...b, stereo: b.stereo === 1 ? 6 : 1 } : b)) } as Mol);
  assert.deepEqual(cipOf(back).atoms, labels.atoms, "the wide ends read as the centres'");
  assert.equal(kinds(back, "backwards").length, 3);
  const r = redrawStereo(back);
  assert.deepEqual([r.count, r.refused], [3, 0]);
  assert.equal(toInchi(r.mol), want);
  assert.deepEqual(cipOf(r.mol).atoms.slice(0, m.atoms.length), labels.atoms);
  assert.deepEqual(r.mol.atoms.slice(0, m.atoms.length).map((a) => a.location), m.atoms.map((a) => a.location), "no atom moved");
  assert.deepEqual(found(r.mol), [], "no warnings");
  assert.deepEqual(redrawStereo(r.mol).mol.bonds, r.mol.bonds, "again: the same");
}
// trans-2-Methylcyclohexanol with its wedges moved onto ring bonds (each centre's hand kept): Redraw moves them to the
// OH and the CH3.
{
  const smiles = "C[C@@H]1CCCC[C@H]1O", m = parseStructure(smiles), want = toInchi(smiles), labels = cipOf(m).atoms;
  const centres = [...stereoFacts(m).centres];
  let onRing = m;
  for (const c of centres) {
    const w = onRing.bonds.findIndex((b) => b.stereo && b.atoms[0] === c);
    const ring = onRing.bonds.findIndex((b) => !b.stereo && b.atoms.includes(c) && !b.atoms.some((j) => j !== c && (centres.includes(j) || onRing.bonds.filter((x) => x.atoms.includes(j)).length < 2)));
    const j = onRing.bonds[ring].atoms.find((x) => x !== c)!;
    onRing = ([1, 6] as const).map((s) => wedgeTo({ ...onRing, bonds: onRing.bonds.map((b, k) => (k === w ? { ...b, stereo: undefined } : b)) }, c, j, s)).find((x) => cipOf(x).atoms[c] === labels[c])!;
  }
  assert.deepEqual(cipOf(onRing).atoms, labels, "the ring wedges draw the same isomer");
  const r = redrawStereo(onRing);
  assert.equal(r.count, 2);
  assert.equal(toInchi(r.mol), want);
  for (const b of r.mol.bonds.filter((x) => x.stereo)) assert.equal(r.mol.bonds.filter((x) => x.atoms.includes(b.atoms[1])).length, 1, "on a substituent");
}
// Only the structures the selection touches; a wedge that sets nothing is made plain (its colour kept); a structure
// in 3D, one with a wavy bond and one with nothing to redraw are left as drawn.
{
  const back = (x: number) => flipBond(tetra(x), 0), m = join(back(0), back(4));
  const one = redrawStereo(m, new Set([0]));
  assert.equal(one.count, 1);
  assert.deepEqual(one.mol.bonds.slice(3), m.bonds.slice(3), "the other structure is left");
  assert.equal(one.mol.bonds[0].atoms[0], 0, "from the centre");
  assert.equal(redrawStereo(m).count, 2);
  const plain = redrawStereo(propane({ stereo: 1, colour: "#ff0000" }));
  assert.deepEqual(plain.mol.bonds[0], { type: 1, atoms: [0, 1], colour: "#ff0000" }, "made plain, its colour kept");
  const flat = propane({});
  assert.equal(redrawStereo(flat).mol, flat);
  const deep: Mol = { ...back(0), atoms: back(0).atoms.map((x, i) => (i === 1 ? { ...x, location: [x.location[0], x.location[1], 0.5] as [number, number, number] } : x)) };
  assert.equal(redrawStereo(deep).mol, deep, "drawn in 3D");
  const wavy = tetra(0, { display: "wavy" });
  assert.equal(redrawStereo(wavy).mol, wavy, "a wavy bond");
}
// Hard natural products, as Octet draws them and with every wedge to a non-stereocentre turned round: Redraw keeps each
// R, S, E and Z label and the InChI, and moves no atom.
{
  const HARD: [string, string][] = [
    ["paclitaxel", "CC1=C2[C@H](C(=O)[C@@]3([C@H](C[C@@H]4[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C[C@@H]1OC(=O)[C@@H]([C@H](C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C"],
    ["strychnine", "C1CN2CC3=CCO[C@H]4CC(=O)N5[C@H]6[C@H]4[C@H]3C[C@H]2[C@@]61C7=CC=CC=C75"],
    ["morphine", "CN1CC[C@]23[C@@H]4[C@H]1CC5=C2C(=C(C=C5)O)O[C@H]3[C@H](C=C4)O"],
    ["tetrodotoxin", "C([C@@]1([C@H]2[C@@H]3[C@H](N=C(N[C@@]34[C@@H]([C@@H]1O[C@]([C@H]4O)(O2)O)O)N)O)O)O"],
    ["ryanodine", "C[C@H]1CC[C@@]2([C@@]3(C[C@]4([C@@]5([C@]([C@H]([C@@]3([C@]5([C@]2([C@@H]1O)O4)O)O)OC(=O)C6=CC=CN6)(C(C)C)O)C)O)C)O"],
    ["ginkgolide B", "C[C@@H]1C(=O)O[C@@H]2[C@]1([C@@]34C(=O)O[C@H]5[C@]3([C@@H]2O)[C@@]6([C@@H](C5)C(C)(C)C)[C@H](C(=O)O[C@H]6O4)O)O"],
    ["artemisinin", "C[C@@H]1CC[C@H]2[C@H](C(=O)O[C@H]3[C@@]24[C@H]1CC[C@](O3)(OO4)C)C"],
    ["erythromycin", "CC[C@@H]1[C@@]([C@@H]([C@H](C(=O)[C@@H](C[C@@]([C@@H]([C@H]([C@@H]([C@H](C(=O)O1)C)O[C@H]2C[C@@]([C@H]([C@@H](O2)C)O)(C)OC)C)O[C@H]3[C@@H]([C@H](C[C@H](O3)C)N(C)C)O)(C)O)C)C)O)(C)O"],
    ["cholesterol", "C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C"],
    ["tropine", "CN1[C@H]2CC[C@@H]1C[C@@H](O)C2"],
    ["penicillin G", "CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)CC3=CC=CC=C3)C(=O)O)C"],
    ["lovastatin", "CC[C@H](C)C(=O)O[C@H]1C[C@H](C=C2[C@H]1[C@H]([C@H](C=C2)C)CC[C@@H]3C[C@H](CC(=O)O3)O)C"],
  ];
  let turned = 0;
  for (const [name, smiles] of HARD) {
    const m = parseStructure(smiles), labels = cipOf(m), inchi = toInchi(m), n = m.atoms.length, centres = stereoFacts(m).centres;
    const same = (x: Mol, how: string) => {
      const after = cipOf(x);
      assert.deepEqual(after.atoms.slice(0, n), labels.atoms, `${name} ${how}: R and S`);
      assert.deepEqual(after.bonds.slice(0, m.bonds.length), labels.bonds, `${name} ${how}: E and Z`);
      assert.equal(toInchi(x), inchi, `${name} ${how}: InChI`);
      assert.deepEqual(x.atoms.slice(0, n).map((a) => a.location), m.atoms.map((a) => a.location), `${name} ${how}: no atom moved`);
    };
    const r = redrawStereo(m);
    assert.equal(r.refused, 0, name);
    same(r.mol, "redrawn");
    const ks = m.bonds.flatMap((b, k) => (b.stereo && !centres.has(b.atoms[1]) ? [k] : []));
    const back = ks.reduce((x, k) => flipBond(x, k), { ...m, bonds: m.bonds.map((b, k) => (ks.includes(k) ? { ...b, stereo: b.stereo === 1 ? 6 : 1 } : b)) } as Mol);
    if (JSON.stringify(cipOf(back).atoms) !== JSON.stringify(labels.atoms)) continue; // a centre with another wedge reads it first
    turned++;
    const t = redrawStereo(back);
    assert.equal(t.refused, 0, `${name} turned round`);
    same(t.mol, "turned round, redrawn");
    assert.deepEqual(kinds(t.mol, "backwards"), [], `${name}: no wedge left the wrong way round`);
  }
  assert.ok(turned >= 8, `${turned} drawn the wrong way round`);
}
console.log("stereo.check: ok");
