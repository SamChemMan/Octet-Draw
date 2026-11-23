// Run: node src/arrowlink-seq.check.ts. A curved arrow tied to an atom of a chain that is drawn again (helm.ts
// redrawn: Atoms and Residue labels switched, Expand and Contract of residues, the Bond tool's link between two residue
// labels, the Sequence field's text drawn in place of its chain): the end stays tied when an atom of the same element
// is drawn where its atom was (or to its residue label, which the link draws again), and lets go where it was when not.
// Benzene beside it is not redrawn. And what else goes with the chain through each of them: its data fields, its
// compound number, its group and its place on a catalytic cycle.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Mol } from "./render.ts";

const gl = globalThis as Record<string, unknown>;
gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
gl.window = globalThis;
gl.self = { location: { origin: "file://" } };
gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
await chem.ready;
const { parseHelm, withSequences, linkResidues, inPlaceOf } = await import("./helm.ts");
const { buildAtoms } = await import("./seqbuild.ts");
const { addArrow, addCaption, fragments, insertMol, pos } = await import("./edit.ts");
const { followArrows, withTies } = await import("./arrowlink.ts");
const { rowsOf, setRows } = await import("./datafields.ts");
const atomsOf = (h: string) => (buildAtoms((parseHelm(h) as { seq: Parameters<typeof buildAtoms>[0] }).seq) as { mol: Mol }).mol;
const on = (m: Mol, end: [number, number], i: number) => Math.hypot(end[0] - pos(m, i)[0], end[1] - pos(m, i)[1]) < 1e-9;

const chain = (buildAtoms((parseHelm("PEPTIDE1{A.G.S}$$$$V2.0") as { seq: Parameters<typeof buildAtoms>[0] }).seq) as { mol: Mol }).mol;
let page = insertMol(chain, chem.parseStructure("c1ccccc1"), [30, 0]).mol;
const ring = chain.atoms.length, o = chain.atoms.findIndex((a) => a.label === "O");
let id: number;
[page, id] = addArrow(page, withTies({ kind: "curved", from: pos(page, o), to: pos(page, ring), bend: 0.3 }, { atom: o }, { atom: ring }));
const arrowOf = (m: Mol) => m.arrows!.find((a) => a.id === id)!;

// To residue labels: the oxygen is gone into a label, so that end lets go where it was; the benzene end stays tied.
const labels = followArrows(page, withSequences(page, "labels"));
assert.equal(labels.arrows!.length, 1, "the arrow stays");
assert.ok(!arrowOf(labels).fromOn, "its atom drawn into a label: the end lets go");
assert.deepEqual(arrowOf(labels).from, arrowOf(page).from, "and stays where it was");
const c = arrowOf(labels).toOn as { atom: number };
assert.equal(labels.atoms[c.atom].label, "C", "the benzene end is still tied to a carbon of benzene");
assert.ok(Math.hypot(...[0, 1].map((k) => arrowOf(labels).to[k] - pos(labels, c.atom)[k]) as [number, number]) < 1e-9, "and on it");
// And back to atoms: drawn in the same place, the benzene end holds.
const back = followArrows(labels, withSequences(labels, "atoms"));
assert.ok(arrowOf(back).toOn, "back to atoms: the benzene end still tied");

// The Bond tool's link between two residue labels draws the chain's labels again, and the row moves (its H end goes
// into the row): an end tied to a residue label goes with that label.
const oxy = withSequences(atomsOf("PEPTIDE1{C.Y.I.Q.N.C.P.L.G.[am]}$$$$V2.0"), "labels");
let ox = insertMol(oxy, chem.parseStructure("c1ccccc1"), [0, 12]).mol, oxId: number;
const oxRing = oxy.atoms.length, tyr = oxy.atoms.findIndex((a) => a.text === "Tyr"), cys = oxy.atoms.flatMap((a, i) => (a.text === "Cys" ? [i] : []));
[ox, oxId] = addArrow(ox, withTies({ kind: "curved", from: pos(ox, tyr), to: pos(ox, oxRing), bend: 0.3 }, { atom: tyr }, { atom: oxRing }));
const linked = followArrows(ox, linkResidues(ox, cys[0], cys[1]) as Mol), la = linked.arrows!.find((a) => a.id === oxId)!;
assert.ok(la.fromOn && "atom" in la.fromOn && linked.atoms[la.fromOn.atom].text === "Tyr", "linked: the end on Tyr stays on Tyr");
assert.ok(!on(ox, la.from, tyr), "which the link moved");
assert.ok(on(linked, la.from, (la.fromOn as { atom: number }).atom), "and goes with it");
assert.ok(la.toOn && "atom" in la.toOn && on(linked, la.to, la.toOn.atom), "the benzene end stays tied");

// The Sequence field's text drawn in place of the chain it was opened from: the same text draws every atom where it
// was, so the end holds; a residue put in moves them, so the end lets go where it was.
const chainAtoms = chain.atoms.map((_, i) => i);
const same = followArrows(page, inPlaceOf(page, chainAtoms, atomsOf("PEPTIDE1{A.G.S}$$$$V2.0"))), sa = arrowOf(same);
assert.ok(sa.fromOn && "atom" in sa.fromOn && same.atoms[sa.fromOn.atom].label === "O" && on(same, sa.from, sa.fromOn.atom), "in place, the same text: the end holds on its oxygen");
const longer = followArrows(page, inPlaceOf(page, chainAtoms, atomsOf("PEPTIDE1{A.G.S.L}$$$$V2.0"))), ga = arrowOf(longer);
assert.ok(!ga.fromOn, "a residue put in: the end lets go");
assert.deepEqual(ga.from, arrowOf(page).from, "and stays where it was");
assert.ok(ga.toOn && "atom" in ga.toOn && on(longer, ga.to, ga.toOn.atom), "the benzene end stays tied");

// What goes with the chain through each: two data fields (one shown), its compound number, its group with the
// benzene, and its place on a catalytic cycle.
const dressed = (m: Mol, mine: number[], ring: number[]): Mol => {
  let x = setRows(m, mine, [{ name: "Batch", value: "B-1", show: true }, { name: "ID", value: "X-7", show: false }]);
  [x] = addCaption(x, { text: "1", x: 0, y: -8, bold: true, under: mine, auto: true });
  return { ...x, groups: [{ id: 900, atoms: [...mine, ...ring], items: [] }],
    cycles: [{ id: 901, centre: [0, 30], radius: 10, clockwise: true, nodes: [mine, ring], at: [0, 180] }] };
};
const benzeneOf = (m: Mol) => fragments(m).find((f) => f.length === 6 && f.every((i) => m.atoms[i].label === "C" && !m.atoms[i].text))!;
const kept = (how: string, before: Mol, after: Mol) => {
  const ring = benzeneOf(after), mine = fragments(after).filter((f) => f !== ring && !f.every((i) => ring.includes(i))).flat().sort((p, q) => p - q);
  const set = (l?: number[]) => [...new Set(l)].sort((p, q) => p - q);
  assert.deepEqual(rowsOf(after, mine).map((r) => [r.name, r.value, r.show]), [["Batch", "B-1", true], ["ID", "X-7", false]], `${how}: its data fields`);
  const shown = after.captions!.find((c) => c.id === after.data!.find((f) => f.name === "Batch")!.caption)!;
  assert.deepEqual(set(shown.under), mine, `${how}: the shown field under it`);
  const number = after.captions!.find((c) => c.text === "1")!;
  assert.deepEqual(set(number.under), mine, `${how}: its compound number under it`);
  assert.deepEqual(set(after.groups!.find((g) => g.id === 900)!.atoms), set([...mine, ...ring]), `${how}: its group, with the benzene`);
  assert.deepEqual(after.cycles!.find((c) => c.id === 901)!.nodes.map(set), [mine, set(ring)], `${how}: its place on the cycle`);
  assert.equal(after.captions!.length, before.captions!.length, `${how}: no caption more or less`);
};
const ring0 = benzeneOf(page), dressedPage = dressed(page, chainAtoms, ring0);
kept("as labels", dressedPage, withSequences(dressedPage, "labels"));
kept("as atoms again", dressedPage, withSequences(withSequences(dressedPage, "labels"), "atoms"));
kept("in place", dressedPage, inPlaceOf(dressedPage, chainAtoms, atomsOf("PEPTIDE1{A.G.S.L}$$$$V2.0")));
const oxDressed = dressed(ox, oxy.atoms.map((_, i) => i), benzeneOf(ox));
kept("linked", oxDressed, linkResidues(oxDressed, cys[0], cys[1]) as Mol);
console.log("arrowlink-seq.check: all ok");
