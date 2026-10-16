// Run: node src/edit.check.ts. Fails loudly if an editing rule breaks.
import assert from "node:assert/strict";
import { EMPTY, addCaption, addTemplate, normalise, addChair, addGroup, nextNumber, addRing, alignFragments, atomsInPolygon, flipAtoms, atomAt, atomsIn, bondTo, chainTo, complete, flipBond, rotateAtoms, setBondSpec, cycleBond, deleteAtom, deleteAtoms, deleteBond, erase, fragments, joinOverlaps, merge, moveAtoms, nextDirection, onSelection, pos, setElement, sprout, subset, levelTurn, newTable, resizeTable, setTableCell, pairMap, clearMap } from "./edit.ts";
import { tableLayout } from "./render.ts";

const near = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;

// Three clicks from one atom make a zig-zag chain of unit bonds.
let m = sprout(EMPTY, [0, 0]);
m = sprout(m, 1);
m = sprout(m, 2);
assert.equal(m.atoms.length, 4);
assert.equal(m.bonds.length, 3);
for (const b of m.bonds) assert.ok(Math.abs(Math.hypot(pos(m, b.atoms[1])[0] - pos(m, b.atoms[0])[0], pos(m, b.atoms[1])[1] - pos(m, b.atoms[0])[1]) - 1) < 1e-9);
// Zig-zag: atoms 0 and 2 lie on the same side, 1 and 3 on the other (y alternates).
assert.ok(pos(m, 1)[1] > pos(m, 0)[1] && pos(m, 2)[1] < pos(m, 1)[1] && pos(m, 3)[1] > pos(m, 2)[1], "chain zig-zags");
console.log("edit.check: chain ok");

// A bond dragged onto an existing atom joins it instead of adding a new atom.
const joined = bondTo(m, 3, pos(m, 0));
assert.equal(joined.atoms.length, 4);
assert.equal(joined.bonds.length, 4);
console.log("edit.check: join ok");

// Clicking a bond cycles 1 → 2 → 3 → 1.
let c = cycleBond(m, 0); assert.equal(c.bonds[0].type, 2);
c = cycleBond(c, 0); assert.equal(c.bonds[0].type, 3);
c = cycleBond(c, 0); assert.equal(c.bonds[0].type, 1);
console.log("edit.check: bond cycle ok");

// Benzene on empty canvas: six atoms, three double bonds, no atom with two.
const benzene = addRing(EMPTY, 6, true, { point: [0, 0] });
assert.equal(benzene.atoms.length, 6);
assert.equal(benzene.bonds.filter((b) => b.type === 2).length, 3);
for (let i = 0; i < 6; i++) assert.ok(benzene.bonds.filter((b) => b.type === 2 && b.atoms.includes(i)).length <= 1);
// Naphthalene: a second benzene fused on a bond shares two atoms and keeps alternation.
const shared = benzene.bonds.findIndex((b) => b.type === 1);
const naph = addRing(benzene, 6, true, { bond: shared });
assert.equal(naph.atoms.length, 10);
assert.equal(naph.bonds.length, 11);
for (let i = 0; i < 10; i++) assert.ok(naph.bonds.filter((b) => b.type === 2 && b.atoms.includes(i)).length <= 1, "no atom has two double bonds");
console.log("edit.check: rings ok");

// Deleting a bond removes carbons left with no bonds; deleting an atom removes its bonds.
const ethane = sprout(EMPTY, [0, 0]);
assert.equal(deleteBond(ethane, 0).atoms.length, 0);
assert.equal(deleteAtom(m, 3).bonds.length, 2);
assert.equal(atomAt(m, [100, 100]), undefined);
// The next bond from the middle of a chain points away from both neighbours.
const d = nextDirection(m, 1), a = pos(m, 0), b = pos(m, 2), here = pos(m, 1);
assert.ok((a[0] - here[0]) * d[0] + (a[1] - here[1]) * d[1] < 0 && (b[0] - here[0]) * d[0] + (b[1] - here[1]) * d[1] < 0);
assert.ok(near([0, 0], pos(m, 0)));
console.log("edit.check: delete ok");

// Selection: a box picks the atoms inside it; moving shifts only those; deleting removes them and their bonds.
const chain = sprout(sprout(sprout(EMPTY, [0, 0]), 1), 2);
const inBox = atomsIn(chain, [-0.1, -0.1], [0.9, 0.6]);
assert.deepEqual(inBox, [0, 1]);
const moved = moveAtoms(chain, new Set(inBox), [10, 0]);
assert.ok(near(pos(moved, 0), [10, 0]) && near(pos(moved, 2), pos(chain, 2)));
assert.equal(deleteAtoms(chain, new Set([0, 1])).bonds.length, 1);
assert.equal(subset(chain, new Set([0, 1])).bonds.length, 1);
console.log("edit.check: selection ok");

// One eraser stroke removes all its bonds at once, and the carbons it leaves bare.
const butane = sprout(sprout(sprout(EMPTY, [0, 0]), 1), 2);
const rubbed = erase(butane, new Set([0, 1]), new Set());
assert.equal(rubbed.bonds.length, 1);
assert.equal(rubbed.atoms.length, 2);
console.log("edit.check: erase ok");

// Smart selection: a box that misses the O of ethanol still picks it up; inside a selected ring counts as on it.
const ethanol = setElement(sprout(sprout(EMPTY, [0, 0]), 1), 2, "O");
assert.deepEqual([...complete(ethanol, new Set([0, 1]))].sort(), [0, 1, 2]);
const ring = addRing(EMPTY, 6, false, { point: [0, 0] });
assert.ok(onSelection(ring, new Set([0, 1, 2, 3, 4, 5]), [0, 0]), "the ring centre is on the selection");
assert.ok(!onSelection(ring, new Set([0, 1, 2, 3, 4, 5]), [3, 3]), "far away is not");
// Dropping a fragment's atom exactly on another atom joins them into one.
const two = merge(sprout(EMPTY, [0, 0]), sprout(EMPTY, [0, 0]), [5, 0]);
const placed = moveAtoms(two, new Set([2, 3]), [pos(two, 1)[0] - pos(two, 2)[0], pos(two, 1)[1] - pos(two, 2)[1]]);
const { mol: joinedMol, joined: didJoin } = joinOverlaps(placed, new Set([2, 3]));
assert.ok(didJoin);
assert.equal(joinedMol.atoms.length, 3);
assert.equal(joinedMol.bonds.length, 2);
assert.equal(fragments(joinedMol).length, 1);
console.log("edit.check: smart selection and join ok");

// Bond styles: a wedge drawn from atom 0 has its narrow end there; flipping swaps it. A chain counts its bonds.
const wedge = sprout(EMPTY, [0, 0], { type: 1, stereo: 1 });
assert.equal(wedge.bonds[0].stereo, 1);
assert.deepEqual(flipBond(wedge, 0).bonds[0].atoms, [1, 0]);
const styled = setBondSpec(wedge, 0, { type: 1, display: "wavy" });
assert.equal(styled.bonds[0].display, "wavy");
assert.equal(styled.bonds[0].stereo, undefined);
const { mol: hexane, bonds: n } = chainTo(EMPTY, [0, 0], [5 * Math.cos(Math.PI / 6), 0]);
assert.equal(n, 5);
assert.equal(hexane.atoms.length, 6);
for (const b of hexane.bonds) assert.ok(Math.abs(Math.hypot(pos(hexane, b.atoms[1])[0] - pos(hexane, b.atoms[0])[0], pos(hexane, b.atoms[1])[1] - pos(hexane, b.atoms[0])[1]) - 1) < 1e-9, "unit bonds");
console.log("edit.check: bond styles and chain ok");

// ChemDraw group keys: 3 on a chain end adds a phenyl; 2 on a CH2 in a chain makes it C=O; z then 1 runs straight.
const propane = sprout(sprout(EMPTY, [0, 0]), 1);
const phenyl = addGroup(propane, 2, "phenyl");
assert.equal(phenyl.atoms.length, 3 + 6);
assert.equal(phenyl.bonds.filter((b) => b.type === 2).length, 3);
const ketone = addGroup(propane, 1, "acetyl");
assert.equal(ketone.atoms.length, 4);
assert.equal(ketone.atoms[3].label, "O");
const yne = addGroup(addGroup(sprout(EMPTY, [0, 0]), 1, "alkyne"), 2, "chain");
const [a0, a1, a2] = [pos(yne, 1), pos(yne, 2), pos(yne, 3)];
assert.ok(Math.abs((a1[0] - a0[0]) * (a2[1] - a1[1]) - (a1[1] - a0[1]) * (a2[0] - a1[0])) < 1e-9, "alkyne carries straight on");
// Option+arrows turn a selection about its centre.
const turned = rotateAtoms(propane, new Set([0, 1, 2]), 180);
assert.ok(Math.abs(pos(turned, 0)[0] - pos(propane, 2)[0]) < 1e-9);
console.log("edit.check: group keys and rotation ok");

// Chairs: six atoms, six bonds, drawn bonds about one bond long; fused onto a bond it shares two atoms.
const chair = addChair(EMPTY, 1, { point: [0, 0] });
assert.equal(chair.atoms.length, 6);
assert.equal(chair.bonds.length, 6);
const lengths = chair.bonds.map((b) => Math.hypot(pos(chair, b.atoms[1])[0] - pos(chair, b.atoms[0])[0], pos(chair, b.atoms[1])[1] - pos(chair, b.atoms[0])[1]));
assert.ok(Math.abs(lengths.reduce((s, x) => s + x, 0) / 6 - 1) < 1e-9, "average bond length is 1");
const fused = addChair(sprout(EMPTY, [0, 0]), 2, { bond: 0 });
assert.equal(fused.atoms.length, 6);
// Lasso: atoms inside the path are picked.
assert.deepEqual(atomsInPolygon(chair, [[-5, -5], [5, -5], [5, 5], [-5, 5]]).length, 6);
assert.deepEqual(atomsInPolygon(chair, [[10, 10], [11, 10], [11, 11]]), []);
console.log("edit.check: chairs and lasso ok");

// Flip: a wedge becomes a hashed wedge (same stereochemistry), positions mirror about the centre.
const chiral = bondTo(sprout(EMPTY, [0, 0]), 1, [2, 1], { type: 1, stereo: 1 });
const flipped = flipAtoms(chiral, new Set([0, 1, 2]), "horizontal");
assert.equal(flipped.bonds[1].stereo, 6);
assert.ok(Math.abs(pos(flipped, 0)[0] - pos(chiral, 2)[0]) < 1e-9);
console.log("edit.check: flip ok");

// Align: two structures at different heights end up with their centres on one line.
const pair = merge(sprout(EMPTY, [0, 0]), sprout(EMPTY, [0, 0]), [4, 2]);
const row = alignFragments(pair, new Set([0, 1, 2, 3]), "row");
const cy = (m: typeof row, a: number, b: number) => (pos(m, a)[1] + pos(m, b)[1]) / 2;
assert.ok(Math.abs(cy(row, 0, 1) - cy(row, 2, 3)) < 1e-9, "centres share one y");
console.log("edit.check: align ok");

// Captions follow their structure's atoms through deletes and merges, and go when the structure goes.
{
  const ring = addRing(EMPTY, 6, false, { point: [0, 0] });
  const [named] = addCaption(ring, { text: "1", x: 0, y: 0, bold: true, under: [0, 1, 2, 3, 4, 5] });
  assert.equal(nextNumber(named), "2");
  const two = merge(named, addRing(EMPTY, 5, false, { point: [0, 0] }), [4, 0]);
  assert.equal(two.captions?.length, 1, "merge keeps captions");
  const less = deleteAtoms(two, new Set([0]));
  assert.deepEqual(less.captions?.[0].under, [0, 1, 2, 3, 4], "under is renumbered");
  assert.equal(deleteAtoms(two, new Set([0, 1, 2, 3, 4, 5])).captions?.length, 0, "a caption goes with its structure");
  assert.ok(flipAtoms(named, new Set([0, 1]), "horizontal").captions, "flip keeps captions");
  console.log("edit.check: captions ok");
}

// Templates: fused along a bond they share its atoms; on a point they keep their own shape.
{
  const pyridine = normalise(setElement(addRing(EMPTY, 6, true, { point: [0, 0] }), 2, "N"));
  const placedAlone = addTemplate(EMPTY, pyridine, { point: [5, 5] });
  assert.equal(placedAlone.atoms.length, 6);
  assert.equal(placedAlone.atoms.filter((a) => a.label === "N").length, 1, "the template keeps its nitrogen");
  const ring = addRing(EMPTY, 6, false, { point: [0, 0] });
  const fused = addTemplate(ring, pyridine, { bond: 0 });
  assert.equal(fused.atoms.length, 10, "two atoms are shared");
  assert.equal(fused.bonds.length, 11, "the shared bond is not doubled");
  const spiro = addTemplate(ring, pyridine, { atom: 0 });
  assert.equal(spiro.atoms.length, 11, "one atom is shared");
  // A fused pair fused again goes beside the first, not over it.
  const indane = normalise(addRing(addRing(EMPTY, 6, false, { point: [0, 0] }), 5, false, { bond: 0 }));
  const twice = addTemplate(indane, indane, { bond: indane.bonds.findIndex((b) => b.atoms.includes(3) && b.atoms.includes(4)) });
  assert.equal(twice.atoms.length, 9 + 7, "only the shared bond's two atoms are shared");
  console.log("edit.check: templates ok");
}

// Clean up levels a ring structure's bottom bond: a turned pentagon comes back with a level bottom edge.
{
  const ring = rotateAtoms(addRing(EMPTY, 5, false, { point: [0, 0] }), new Set([0, 1, 2, 3, 4]), 17);
  const all = [0, 1, 2, 3, 4], turned = rotateAtoms(ring, new Set(all), levelTurn(ring, all));
  const ys = turned.bonds.map((b) => [pos(turned, b.atoms[0])[1], pos(turned, b.atoms[1])[1]]);
  const bottom = ys.reduce((lo, y) => (y[0] + y[1] < lo[0] + lo[1] ? y : lo));
  assert.ok(Math.abs(bottom[0] - bottom[1]) < 1e-6, "the bottom bond is level");
  assert.equal(levelTurn(turned, all), 0, "and a level ring is left alone");
  console.log("edit.check: level ok");
}

// Tables: a new one numbers its entries; a row added carries the numbers on; a long cell widens its column only.
{
  const sh = { id: 1, kind: "table" as const, from: [0, 0] as [number, number], to: [6, -2.4] as [number, number], table: newTable(3, 3) };
  assert.deepEqual(sh.table.cells.map((r) => r[0]), ["Entry", "1", "2"]);
  const grown = { ...sh, ...resizeTable(sh, 4, 3) };
  assert.deepEqual(grown.table!.cells.map((r) => r[0]), ["Entry", "1", "2", "3"], "a new row carries on the entry numbers");
  assert.ok(Math.abs(tableLayout(grown).h - tableLayout(sh).h) < 1e-9, "rows keep their height");
  const wide = { ...sh, ...setTableCell(sh, 1, 1, "x".repeat(40), (t) => t.length * 0.3) };
  const t = tableLayout(wide, (x) => x.length * 0.3);
  assert.ok(t.widths[1] > 12 && Math.abs(wide.to[0] - t.x1) < 1e-9, "the box grows to fit the long cell");
  assert.ok(t.widths[0] < 3, "the other columns stay narrow");
  const fewer = { ...sh, ...resizeTable(sh, 0, 0) };
  assert.deepEqual(fewer.table!.cells, [["Entry"]], "never fewer than one row and one column");
  console.log("edit.check: tables ok");
}

// Atom maps: a pair takes the next free number, a mapped atom lends its number, and a number is never on two pairs.
{
  let m = sprout(sprout(sprout(EMPTY, [0, 0]), [5, 0]), [10, 0]); // three separate bonds: atoms 0 to 5
  m = pairMap(m, 0, 2);
  assert.deepEqual(m.atoms.map((a) => a.map), [1, undefined, 1, undefined, undefined, undefined]);
  m = pairMap(m, 1, 3);
  assert.equal(m.atoms[1].map, 2);
  m = pairMap(m, 0, 4);
  assert.deepEqual(m.atoms.map((a) => a.map), [1, 2, undefined, 2, 1, undefined], "atom 2 gives up number 1");
  assert.equal(clearMap(m, 4).atoms[4].map, undefined);
  console.log("edit.check: atom maps ok");
}

// ChemDraw's two turns: Rotate 180° (⇧⌘H) turns a wedge into a hash, keeping the configuration; Flip mirrors it.
{
  let m = sprout(sprout(EMPTY, [0, 0]), 1);
  m = setBondSpec(m, 0, { type: 1, stereo: 1 });
  const all = new Set(m.atoms.map((_, i) => i));
  assert.equal(flipAtoms(m, all, "horizontal").bonds[0].stereo, 6, "Rotate 180° swaps wedge for hash");
  assert.equal(flipAtoms(m, all, "horizontal", true).bonds[0].stereo, 1, "Flip keeps the wedge: a mirror image");
  console.log("edit.check: flips ok");
}
