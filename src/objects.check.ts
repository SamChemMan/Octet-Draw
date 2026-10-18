// Run: node src/objects.check.ts. Fails loudly if an Object menu command breaks (CD-31): Join, as ChemDraw's.
import assert from "node:assert/strict";
import { EMPTY, addRing, fragments, joinSelection, merge, pos } from "./edit.ts";
import type { Mol } from "./render.ts";

const chain = (x: number, y: number, label = "C", dx = 1, dy = 0): Mol => ({ atoms: [{ label: "C", location: [x, y, 0] }, { label, location: [x + dx, y + dy, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] });

// Two atoms, one in each structure: the earlier structure moves onto the later atom, and the two become one.
{
  const m = merge(chain(0, 0), chain(3, 1, "O"), [0, 0]); // atoms 0-1 and 2-3
  const out = joinSelection(m, new Set([1, 2]))!;
  assert.equal(out.atoms.length, 3);
  assert.equal(fragments(out).length, 1);
  assert.deepEqual(pos(out, 1), [3, 1]); // the later structure stays put
  assert.equal(joinSelection(m, new Set([0, 1])), undefined, "two atoms of one structure do not join");
  // A plain carbon joined to a labelled atom takes its label.
  const labelled = joinSelection(merge(chain(0, 0, "N"), chain(3, 0), [0, 0]), new Set([1, 2]))!;
  assert.deepEqual(labelled.atoms.map((a) => a.label).sort(), ["C", "C", "N"]);
  console.log("objects.check: Join two atoms ok");
}

// Three or more atoms: each structure moves so its atom is at the centroid; they become one atom.
{
  const m = merge(merge(chain(0, 0, "C", -1, 0), chain(0, 4, "C", 0, 1), [0, 0]), chain(4, 2, "C", 1, 0), [0, 0]); // atoms 0, 2 and 4 joined
  const out = joinSelection(m, new Set([0, 2, 4]))!;
  assert.equal(out.atoms.length, 4);
  assert.equal(out.bonds.length, 3);
  const centre = out.atoms.findIndex((_, i) => out.bonds.filter((b) => b.atoms.includes(i)).length === 3);
  assert.ok(Math.hypot(pos(out, centre)[0] - 4 / 3, pos(out, centre)[1] - 2) < 1e-9);
  // The first atom picked keeps its label, as ChemDraw keeps the first selected atom.
  const named = { ...m, atoms: m.atoms.map((a, i) => (i === 2 ? { ...a, label: "N" } : i === 4 ? { ...a, label: "O" } : a)) };
  assert.equal(joinSelection(named, new Set([4, 0, 2]))!.atoms.filter((a) => a.label !== "C").map((a) => a.label).join(), "O");
  console.log("objects.check: Join three atoms ok");
}

// Two bonds, one in each structure: they become one shared bond (two benzenes make naphthalene).
{
  const a = addRing(EMPTY, 6, false, { point: [0, 0] }), b = addRing(EMPTY, 6, false, { point: [0, 0] });
  const m = merge(a, b, [5, 3]);
  const [p, q] = a.bonds[0].atoms, [r, s] = b.bonds[2].atoms.map((i) => i + 6);
  const out = joinSelection(m, new Set([p, q, r, s]))!;
  assert.equal(out.atoms.length, 10);
  assert.equal(out.bonds.length, 11);
  assert.equal(fragments(out).length, 1);
  // The later ring stays where it was; the earlier one moved onto it.
  for (let i = 6; i < 12; i++) assert.ok(out.atoms.some((_, k) => Math.hypot(pos(out, k)[0] - pos(m, i)[0], pos(out, k)[1] - pos(m, i)[1]) < 1e-9));
  console.log("objects.check: Join two bonds ok");
}
