// Run: node src/arrowlink.check.ts. Curved arrows tied to the atom, bond or lone pair they were drawn on
// (arrowlink.ts): the Editor's commit is followArrows(before, after). Ported from PR #143 by Prof. Dr. Stefan Schramm.
import assert from "node:assert/strict";
import { followArrows, holds, readTie, retie, tieAt, tied, withTies } from "./arrowlink.ts";
import { addArrow, atomAt, bondAt, contractLabel, deleteAtom, deleteBond, duplicateSelection, extractSelection, flipAtoms, insertMol, joinOverlaps, moveAtoms, pos, transformParts, updateArrow } from "./edit.ts";
import { history } from "./history.ts";
import { parse, serialize } from "./file.ts";
import { readOct, writeOct } from "./oct.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import type { Arrow, Mol } from "./render.ts";

type P = [number, number];
const near = (p: P, q: P, tol = 1e-9) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
const add = (p: P, q: P): P => [p[0] + q[0], p[1] + q[1]], sub = (p: P, q: P): P => [p[0] - q[0], p[1] - q[1]];
const arrow = (m: Mol, id: number) => m.arrows!.find((a) => a.id === id)!;
const commit = followArrows;

// Hydroxide (O0 with three lone pairs, H1) and formaldehyde (C2, O3 with two lone pairs, H4, H5), side by side.
const base: Mol = {
  atoms: [
    { label: "O", location: [0, 0, 0], charge: -1, pairs: 3 }, { label: "H", location: [-1, 0, 0] },
    { label: "C", location: [2, 0, 0] }, { label: "O", location: [2.87, 0.5, 0], pairs: 2 }, { label: "H", location: [2, -1, 0] }, { label: "H", location: [1.13, 0.5, 0] },
  ],
  bonds: [{ type: 1, atoms: [0, 1] }, { type: 2, atoms: [2, 3] }, { type: 1, atoms: [2, 4] }, { type: 1, atoms: [2, 5] }],
};
const pairAt: P = [0.25, 0.25], mid: P = [(2 + 2.87) / 2, 0.25], o3pair: P = [3.1, 0.75];
// 1: from O0's lone pair to C2. 2: from the C=O bond to O3. 3: from O3's lone pair to H5 (a fishhook).
let m = base, id1: number, id2: number, id3: number;
[m, id1] = addArrow(m, withTies({ kind: "curved", from: pairAt, to: pos(base, 2), bend: 0.3 }, { atom: 0, pair: "pair0" }, { atom: 2 }));
[m, id2] = addArrow(m, withTies({ kind: "curved", from: mid, to: pos(base, 3), bend: 0.4 }, { bond: [2, 3] }, { atom: 3 }));
[m, id3] = addArrow(m, withTies({ kind: "fishhook", from: o3pair, to: pos(base, 5), bend: 0.3 }, { atom: 3, pair: "pair1" }, { atom: 5 }));
const H = new Set([0, 1]), F = new Set([2, 3, 4, 5]), ALL = new Set([0, 1, 2, 3, 4, 5]);

// ——— Ties ———
assert.deepEqual(arrow(m, id1).fromOn, { atom: 0, pair: "pair0" });
assert.deepEqual(arrow(m, id2).fromOn, { bond: [2, 3] });
for (const kind of ["reaction", "line", "arc", "equilibrium"] as const) assert.ok(!tied(withTies({ kind, from: [0, 0], to: [1, 0] }, { atom: 0 })), `${kind}: not tied`);
assert.ok(tied(withTies({ kind: "double", from: [0, 0], to: [1, 0], bend: 0.3 }, { atom: 0 })), "a double-headed curved arrow ties");
assert.ok(!tied(withTies({ kind: "curved", from: [0, 0], to: [0, 0.2], bend: 0.3 }, { atom: 0 }, { atom: 0 })), "the same target at both ends: free");
assert.equal(commit(m, m), m, "nothing moved: the same drawing");
const free = addArrow(base, { kind: "curved", from: [0.3, 0.3], to: [1.8, 0.1], bend: 0.3 })[0];
assert.equal(commit(base, moveAtoms(free, F, [1, 1])).arrows, moveAtoms(free, F, [1, 1]).arrows, "a free arrow is never changed");
console.log("arrowlink.check: ties ok");

// ——— Moving what an end is tied to ———
{
  const d: P = [1.5, -0.7], moved = commit(m, moveAtoms(m, F, d));
  assert.ok(near(arrow(moved, id1).to, add(arrow(m, id1).to, d)), "the end on C2 follows it");
  assert.ok(near(arrow(moved, id1).from, pairAt), "the start on the hydroxide stays");
  assert.ok(near(arrow(moved, id2).from, add(mid, d)) && near(arrow(moved, id2).to, add(pos(m, 3), d)), "both ends on the moved structure move with it");
  assert.ok(near(arrow(moved, id3).from, add(o3pair, d), 1e-9), "an end on a lone pair moves with it");
  assert.equal(arrow(moved, id1).bend, 0.3, "the arc keeps its bend");
  assert.deepEqual(arrow(moved, id1).toOn, { atom: 2 }, "and its ties");
  assert.equal(commit(moved, moved), moved, "no drift");
  // One atom dragged: the end on it follows, and the bond end goes to the bond's new middle.
  const one = commit(m, moveAtoms(m, new Set([2]), [0, 0.6]));
  assert.ok(near(arrow(one, id1).to, add(pos(m, 2), [0, 0.6])), "the end follows its one atom");
  assert.ok(near(arrow(one, id2).from, [(2 + 2.87) / 2, (0.6 + 0.5) / 2]), "a bond end stays at the bond's middle");
  // Turned about C2 by 90°: O3's end stays on O3; its lone pair end turns with it (O3's neighbour C2 turns about it).
  const r = (q: P): P => [2 - (q[1] - 0), 0 + (q[0] - 2)];
  const turned = commit(m, transformParts(m, F, new Set(), r));
  assert.ok(near(arrow(turned, id2).to, pos(turned, 3), 1e-9) && near(arrow(turned, id2).from, r(mid), 1e-9), "turned: on O3 and at the bond's middle");
  assert.ok(near(arrow(turned, id3).from, r(o3pair), 1e-9), "turned: the lone pair end turns with its atom");
  // Turned over (Flip Horizontal): the lone pair end turns over too.
  const across = (q: P): P => [4 - q[0], q[1]];
  const flipped = commit(m, transformParts(flipAtoms(m, F, "horizontal", true, 2), new Set(), new Set(), across));
  assert.ok(near(pos(flipped, 3), across(pos(m, 3)), 1e-9), "the flip moved O3");
  assert.ok(near(arrow(flipped, id3).from, across(o3pair), 1e-9), "flipped: the lone pair end turns over with its atom");
  // Scaled: a bond end stays at the middle; an atom end keeps its distance from the atom (a lone pair keeps its size).
  const half = (q: P): P => [2 + (q[0] - 2) * 0.5, q[1] * 0.5];
  const small = commit(m, transformParts(m, F, new Set(), half, [0.5, 0.5]));
  assert.ok(near(arrow(small, id2).from, half(mid), 1e-9), "scaled: a bond end at the bond's middle");
  assert.ok(Math.abs(Math.hypot(...sub(arrow(small, id3).from, pos(small, 3))) - Math.hypot(...sub(o3pair, pos(m, 3)))) < 1e-9, "scaled: a lone pair end as far from its atom");
}
console.log("arrowlink.check: follow ok");

// ——— Moving the arrow ———
{
  // With its structures (select all, move, turn, flip): moved once, ties kept.
  const d: P = [0.4, 0.4], both = commit(m, transformParts(m, ALL, new Set([id1, id2, id3]), (q) => add(q, d)));
  for (const id of [id1, id2, id3]) assert.ok(near(arrow(both, id).from, add(arrow(m, id).from, d)) && near(arrow(both, id).to, add(arrow(m, id).to, d)) && tied(arrow(both, id)), "moved with its structures: once, still tied");
  // The arrow alone (an end moved by the edit): it stays where it was put; its ties are the Editor's to set on the drop.
  const alone = commit(m, transformParts(m, new Set(), new Set([id1]), (q) => add(q, d)));
  assert.ok(near(arrow(alone, id1).to, add(arrow(m, id1).to, d)), "an arrow moved alone stays where it was put");
  // An end handle dragged: the other end keeps its tie and its place.
  const handle = commit(m, updateArrow(m, id1, { to: [1, 2], toOn: undefined }));
  assert.ok(near(arrow(handle, id1).to, [1, 2]) && !arrow(handle, id1).toOn && arrow(handle, id1).fromOn, "a dragged end lets go");
  // Another kind: a straight arrow lets go.
  assert.ok(!tied(arrow(commit(m, updateArrow(m, id1, { kind: "reaction", bend: undefined })), id1)), "a straight arrow lets go");
  // What a dropped end ties to: a lone pair first, then an atom, then a bond, else nothing.
  const marks = [{ atom: 0, at: pairAt, key: "pair0" }, { atom: 0, at: pairAt, key: "charge" }];
  assert.deepEqual(tieAt(m, [0.3, 0.2], marks, atomAt, bondAt), { atom: 0, pair: "pair0" });
  assert.deepEqual(tieAt(m, [2.05, 0], marks, atomAt, bondAt), { atom: 2 });
  assert.deepEqual(tieAt(m, mid, marks, atomAt, bondAt), { bond: [2, 3] });
  assert.equal(tieAt(m, [5, 5], marks, atomAt, bondAt), undefined, "on empty canvas: free");
}
console.log("arrowlink.check: arrow moves ok");

// ——— Delete, Undo, renumbering and joins ———
{
  let h = history({ stack: [m], at: 0 }, { type: "set", mol: commit(m, deleteAtom(m, 2)) });
  const gone = h.stack[h.at];
  assert.equal(gone.arrows!.length, 3, "deleting an atom deletes no arrow");
  assert.ok(!arrow(gone, id1).toOn && near(arrow(gone, id1).to, arrow(m, id1).to), "the end on the deleted atom lets go and stays");
  assert.ok(!arrow(gone, id2).fromOn, "a bond whose atom went lets go");
  assert.deepEqual(arrow(gone, id2).toOn, { atom: 2 }, "O3 is atom 2 now, and so is its tie");
  h = history(h, { type: "undo" });
  assert.deepEqual(arrow(h.stack[h.at], id1), arrow(m, id1), "Undo brings the tie back");
  // An earlier atom deleted: every tie follows the new numbers.
  const less = commit(m, deleteAtom(m, 1));
  assert.deepEqual([arrow(less, id1).toOn, arrow(less, id2).fromOn, arrow(less, id3).fromOn], [{ atom: 1 }, { bond: [1, 2] }, { atom: 2, pair: "pair1" }]);
  assert.ok(near(arrow(less, id1).to, arrow(m, id1).to) && near(arrow(less, id2).from, mid), "the ends stay put");
  // The bond deleted (its atoms stay): the bond end lets go. Another bond deleted: the tie holds.
  assert.ok(!arrow(commit(m, deleteBond(m, 1)), id2).fromOn, "the tied bond deleted: it lets go");
  assert.deepEqual(arrow(commit(m, deleteBond(m, 2)), id2).fromOn, { bond: [2, 3] }, "another bond deleted: it holds");
  // A lone pair taken off: its end lets go.
  assert.ok(!arrow(commit(m, { ...m, atoms: m.atoms.map((a, i) => (i === 3 ? { ...a, pairs: 1 } : a)) }), id3).fromOn, "the lone pair gone: its end lets go");
  // An atom dropped on C2 joins it: the end on the dropped atom goes to C2.
  const extra = addArrow({ ...base, atoms: [...base.atoms, { label: "C", location: [5, 5, 0] }] }, withTies({ kind: "curved", from: [5, 5], to: [0, 0], bend: 0.3 }, { atom: 6 }, { atom: 0 }));
  const joined = joinOverlaps(moveAtoms(extra[0], new Set([6]), [-3, -5]), new Set([6])).mol;
  assert.deepEqual(arrow(joined, extra[1]).fromOn, { atom: 2 }, "an end on a joined atom goes to the atom it joined");
  // Contract Label: an end on an atom of the group goes to the label; one on a bond inside the group lets go.
  const label = commit(m, contractLabel(m, 2, F, "CHO"));
  assert.deepEqual(arrow(label, id1).toOn, { atom: 2 });
  assert.ok(!arrow(label, id2).fromOn, "a bond inside the label lets go");
  assert.deepEqual(retie([arrow(m, id2)], (i) => (i === 3 ? 2 : i))![0].fromOn, undefined, "a bond whose two atoms become one lets go");
}
console.log("arrowlink.check: delete ok");

// ——— Copy, paste, Option-drag ———
{
  const part = extractSelection(m, F, new Set([id2, id3]));
  assert.deepEqual(part.arrows!.map((a) => [a.fromOn, a.toOn]), [[{ bond: [0, 1] }, { atom: 1 }], [{ atom: 1, pair: "pair1" }, { atom: 3 }]], "copied with their atoms, renumbered");
  const pasted = insertMol(m, part, [10, 0]).mol, copy = pasted.arrows!.at(-2)!;
  assert.deepEqual(copy.fromOn, { bond: [6, 7] }, "a pasted arrow ties to the pasted atoms");
  assert.ok(!tied(extractSelection(m, new Set(), new Set([id1])).arrows![0]), "an arrow copied without its atoms is free");
  assert.ok(!extractSelection(m, F, new Set([id1])).arrows![0].fromOn && extractSelection(m, F, new Set([id1])).arrows![0].toOn, "copied with one target: that tie only");
  // Option-drag of the formaldehyde alone: the copy comes without arrows, and the arrows stay tied to the original.
  const dup = duplicateSelection(m, F, new Set());
  assert.equal(dup.mol.arrows!.length, 3, "an Option-drag of a structure copies no arrow");
  const dragged = commit(m, moveAtoms(dup.mol, dup.atoms, [5, 0]));
  for (const id of [id1, id2, id3]) assert.deepEqual(arrow(dragged, id), arrow(m, id), "the arrows stay on the original");
  // With the arrows picked too: the copies tie to the copies.
  const both = duplicateSelection(m, F, new Set([id2]));
  assert.deepEqual(both.mol.arrows!.at(-1)!.fromOn, { bond: [6, 7] }, "an Option-drag of the structure and its arrow ties the copy to the copy");
}
console.log("arrowlink.check: copy ok");

// ——— Files ———
{
  const same = (x: Mol) => { for (const id of [id1, id2, id3]) { const a = arrow(m, id), b = x.arrows!.find((y) => y.kind === a.kind && near(y.from, a.from, 1e-3))!; assert.deepEqual([b.fromOn, b.toOn], [a.fromOn, a.toOn], `kept: ${JSON.stringify(a.fromOn)} ${JSON.stringify(a.toOn)}`); } };
  same(parse(serialize(m)));
  same(readOct(writeOct(m, DEFAULT_STYLE), true).mol);
  // CDXML as ChemDraw ties them: ArrowSource and ArrowTarget name the node, bond or electron symbol.
  const text = toCdxml(m, DEFAULT_STYLE);
  assert.equal((text.match(/ArrowSource="\d+"/g) ?? []).length, 3, "every tied tail");
  assert.equal((text.match(/ArrowTarget="\d+"/g) ?? []).length, 3, "every tied head");
  const back = fromCdxml(text).mol, o = sub(pos(back, 0), pos(m, 0));
  for (const id of [id1, id2, id3]) {
    const a = arrow(m, id), b = back.arrows!.find((y) => y.kind === a.kind && near(y.from, add(a.from, o), 1e-2))!;
    assert.ok(b, "read back");
    assert.deepEqual(b.toOn, a.toOn, "CDXML: the head's tie");
    assert.equal("bond" in b.fromOn! ? "bond" : b.fromOn!.pair ? "pair" : "atom", "bond" in a.fromOn! ? "bond" : a.fromOn!.pair ? "pair" : "atom", "CDXML: the tail's tie, of its kind");
    assert.ok(holds(back, b.fromOn!), "on something in the drawing");
  }
  assert.ok(near(pos(back, 3), add(pos(m, 3), o), 1e-2));
  // A ChemDraw file's arrow tied to a bond and an atom (as ChemDraw 22.2 writes it).
  const cd = fromCdxml(`<?xml version="1.0"?><CDXML><page id="1"><fragment id="10"><n id="11" p="100 100"/><n id="12" p="114.4 100" Element="8"/><b id="14" B="11" E="12" Order="2"/></fragment>
    <arrow id="20" ArrowheadHead="Full" ArrowheadType="Solid" AngularSize="-120" Head3D="114.4 100 0" Tail3D="100 100 0" Center3D="107.2 104.16 0" MajorAxisEnd3D="115.51 104.16 0" MinorAxisEnd3D="107.2 112.47 0" ArrowSource="14" ArrowTarget="12"/></page></CDXML>`).mol;
  assert.deepEqual([cd.arrows![0].fromOn, cd.arrows![0].toOn], [{ bond: [0, 1] }, { atom: 1 }], "ChemDraw's ArrowSource and ArrowTarget");
  // Hostile ties are left off; the arrow is kept.
  const json = JSON.parse(serialize(m));
  json.arrows[0].fromOn = { atom: 99 }; json.arrows[0].toOn = { bond: [3, 3] }; json.arrows[1].fromOn = { atom: 0, pair: "charge" }; json.arrows[1].toOn = "x";
  const bad = parse(JSON.stringify(json));
  assert.equal(bad.arrows!.length, 3);
  assert.ok(!tied(bad.arrows![0]) && !tied(bad.arrows![1]), "bad ties are left off");
  assert.equal(readTie({ atom: 1.5 }, 5), undefined);
  assert.deepEqual(readTie({ atom: 1, pair: "radical1" }, 5), { atom: 1, pair: "radical1" });
}
console.log("arrowlink.check: files ok");

// ——— Speed: a pointer move pays one look at the arrows when none is tied ———
{
  const big: Mol = { atoms: Array.from({ length: 2000 }, (_, i) => ({ label: "C", location: [i % 50, Math.floor(i / 50), 0] as [number, number, number] })), bonds: Array.from({ length: 1999 }, (_, i) => ({ type: 1, atoms: [i, i + 1] as [number, number] })), arrows: Array.from({ length: 50 }, (_, k) => ({ id: k + 1, kind: "curved", from: [k, 0], to: [k, 1], bend: 0.3 }) as Arrow) };
  const moved = moveAtoms(big, new Set(Array.from({ length: 1000 }, (_, i) => i)), [0.1, 0]);
  let t = performance.now();
  for (let k = 0; k < 1000; k++) followArrows(big, moved);
  const untied = (performance.now() - t) / 1000;
  const withTie = { ...big, arrows: big.arrows!.map((a, k) => withTies(a, { atom: k }, { atom: k + 1 })) }, movedTie = moveAtoms(withTie, new Set(Array.from({ length: 1000 }, (_, i) => i)), [0.1, 0]);
  t = performance.now();
  for (let k = 0; k < 100; k++) followArrows(withTie, movedTie);
  const tiedMs = (performance.now() - t) / 100;
  console.log(`arrowlink.check: followArrows ${untied.toFixed(4)} ms with no ties, ${tiedMs.toFixed(3)} ms with 50 tied arrows (2000 atoms)`);
  assert.ok(untied < 0.05, "no ties: next to nothing");
  assert.ok(tiedMs < 4, "50 tied arrows on 2000 atoms: well inside a frame");
}
console.log("arrowlink.check: all ok");
