// Run: node src/edit.check.ts. Fails loudly if an editing rule breaks.
import assert from "node:assert/strict";
import { EMPTY, addCaption, addChair, addGroup, nextNumber, addRing, alignFragments, atomsInPolygon, flipAtoms, atomAt, atomsIn, bondTo, chainTo, complete, flipBond, rotateAtoms, setBondSpec, cycleBond, deleteAtom, deleteAtoms, deleteBond, erase, fragments, joinOverlaps, merge, moveAtoms, nextDirection, onSelection, pos, setElement, sprout, subset } from "./edit.ts";

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
