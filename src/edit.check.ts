// Run: node src/edit.check.ts. Fails loudly if an editing rule breaks.
import assert from "node:assert/strict";
import { EMPTY, LARGE, bondOrders, freePairs, addCaption, addTemplate, normalise, addChair, addGroup, nextNumber, addRing, alignFragments, atomsInPolygon, flipAtoms, atomAt, atomsIn, bondTo, chainTo, complete, flipBond, rotateAtoms, setBondSpec, cycleBond, deleteAtom, deleteAtoms, deleteBond, erase, fragments, joinOverlaps, merge, moveAtoms, nextDirection, onSelection, pos, setElement, sprout, subset, levelTurn, newTable, resizeTable, setTableCell, expandLabel, contractLabel, spliceTable, sizeTable, fitTable, clearTable, pairMap, clearMap, tiltAtoms, turnAboutBond, flattenAtoms, hingeOf, duplicateSelection, extractSelection, insertMol, inRing, ringBonds, markDirections, neighbours, wholeGroups, wholeIntegral, groupSelection, addArrow, addShape, addCycle, ungroupSelection, groupParents, groupTargets, groupsOf, outermost, selectedGroups, tidyGroups, deleteGraphics, addGroupAt, type Group, walkHot, jumpHot, farBond, keepHot } from "./edit.ts";
import { tableLayout, type Mol } from "./render.ts";
const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1]], cross = (a: number[], b: number[]) => a[0] * b[1] - a[1] * b[0];

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
// The same selection on the drawing after a move: its outline moves with it.
const ringIds = new Set([0, 1, 2, 3, 4, 5]), movedRing = moveAtoms(ring, ringIds, [3, 3]);
assert.ok(onSelection(ring, ringIds, [0, 0]) && !onSelection(ring, ringIds, [3, 3]));
assert.ok(onSelection(movedRing, ringIds, [3, 3]) && !onSelection(movedRing, ringIds, [0, 0]), "the moved selection's outline");
// Dropping a fragment's atom exactly on another atom joins them into one.
const two = merge(sprout(EMPTY, [0, 0]), sprout(EMPTY, [0, 0]), [5, 0]);
const placed = moveAtoms(two, new Set([2, 3]), [pos(two, 1)[0] - pos(two, 2)[0], pos(two, 1)[1] - pos(two, 2)[1]]);
const { mol: joinedMol, joined: didJoin } = joinOverlaps(placed, new Set([2, 3]));
assert.ok(didJoin);
assert.equal(joinedMol.atoms.length, 3);
assert.equal(joinedMol.bonds.length, 2);
assert.equal(fragments(joinedMol).length, 1);
console.log("edit.check: smart selection and join ok");

// A large drawing completes a selection from a list of neighbours made once: the same atoms as the plain loop.
{
  const big = addRing(ethanol, 6, false, { point: [5, 5] }), spare: Mol["atoms"] = Array.from({ length: LARGE + 1 }, (_, k) => ({ label: "C", location: [100 + k * 2, 0, 0] }));
  const large = { ...big, atoms: [...big.atoms, ...spare] };
  for (const ids of [new Set([0, 1]), new Set([1]), new Set([3, 5, 7]), new Set([3, 4, 5, 6, 7])]) assert.deepEqual([...complete(large, ids)].sort(), [...complete(big, ids)].sort());
  // Group: the whole structures the selection touches, as one group.
  const [grouped, id] = groupSelection(large, new Set([0, 3]), new Set())!;
  assert.deepEqual(grouped.groups?.find((g) => g.id === id)?.atoms, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(groupSelection(large, new Set([3, 4]), new Set()), undefined, "one structure alone is not a group");
  console.log("edit.check: large selection and group ok");
}

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
assert.equal(phenyl.atoms.length, 3 + 5, "the chain end becomes the ring's first atom");
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
// Fused on a bond (keys 9 and 0), every bond of either chair is one bond long, and the two chairs are mirror
// images on the same side of the bond.
{
  const base = sprout(sprout(EMPTY, [0, 0]), 1), bondLen = (m: typeof base) => m.bonds.map((b) => Math.hypot(pos(m, b.atoms[1])[0] - pos(m, b.atoms[0])[0], pos(m, b.atoms[1])[1] - pos(m, b.atoms[0])[1]));
  const [one, two] = [addChair(base, 1, { bond: 1 }), addChair(base, 2, { bond: 1 })];
  for (const c of [one, two, addChair(EMPTY, 2, { point: [0, 0] })]) for (const l of bondLen(c)) assert.ok(Math.abs(l - 1) < 1e-9, `chair bond ${l}`);
  const far = (m: typeof base) => m.atoms.slice(3).map((a) => a.location[1]).sort().join();
  assert.notEqual(far(one), far(two), "chairs 1 and 2 differ");
  const side = (m: typeof base) => Math.sign(m.atoms.slice(3).reduce((s, a) => s + a.location[1], 0) / 4 - (pos(base, 1)[1] + pos(base, 2)[1]) / 2);
  assert.equal(side(one), side(two), "both on the open side");
}
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
  // A row added above row 2 numbers the entries again; a column added after the first is blank in every row.
  const above = { ...sh, ...spliceTable(sh, "row", 2, 0, 1) };
  assert.deepEqual(above.table!.cells.map((r) => r[0]), ["Entry", "1", "2", "3"]);
  const after = { ...sh, ...spliceTable(sh, "col", 1, 0, 1) };
  assert.deepEqual(after.table!.cells[0], ["Entry", "", "", ""]);
  // Deleting a row numbers again too, and never deletes the last row.
  assert.deepEqual({ ...sh, ...spliceTable(sh, "row", 1, 1, 0) }.table!.cells.map((r) => r[0]), ["Entry", "1"]);
  assert.equal({ ...sh, ...spliceTable({ ...sh, table: newTable(1, 2) }, "row", 0, 1, 0) }.table!.cells.length, 1);
  // Dragging a border: the column keeps its width and the box follows; alignment follows its column.
  const sized = { ...sh, ...sizeTable(sh, { widths: [1, 4, 1] }) };
  const st = tableLayout(sized);
  assert.ok(Math.abs(st.widths[1] - 4) < 1e-9 && Math.abs(sized.to[0] - st.x1) < 1e-9 && Math.abs(st.x1 - 6) < 1e-9);
  const aligned = { ...sized, table: { ...sized.table!, align: ["left" as const, "right" as const, "centre" as const] } };
  const gone = { ...aligned, ...spliceTable(aligned, "col", 0, 1, 0) };
  assert.deepEqual(gone.table!.align, ["right", "centre"]);
  assert.deepEqual(tableLayout(gone).widths, [4, 1], "the other columns keep their widths");
  const tall = { ...sh, ...sizeTable(sh, { heights: [0.8, 2, 0.8] }) };
  assert.ok(Math.abs(tableLayout(tall).row(2) - (tableLayout(tall).y1 - 2.8)) < 1e-9);
  // Size to fit: natural widths and the least row height; Clear contents keeps the entry numbers.
  const fit = { ...tall, ...fitTable(tall, (x) => x.length * 0.3) };
  assert.ok(!fit.table!.heights && !fit.table!.widths && Math.abs(tableLayout(fit).h - 0.8) < 1e-9);
  const typed = { ...sh, ...setTableCell(sh, 1, 1, "THF") };
  assert.deepEqual({ ...typed, ...clearTable(typed) }.table!.cells, [["Entry", "", ""], ["1", "", ""], ["2", "", ""]]);
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

// Structure Perspective: a 90° yaw turns a bond along x into one along the view (depth); flattening keeps where
// atoms are drawn and drops their depth; a turn about a bond keeps bond lengths.
{
  let m = sprout(sprout(EMPTY, [0, 0]), 1);
  const all = new Set(m.atoms.map((_, i) => i)), c: [number, number, number] = [0, 0, 0];
  const t = tiltAtoms(m, all, c, 90, 0);
  assert.ok(Math.abs(t.atoms[0].location[0]) < 1e-9 && Math.abs((t.atoms[1].location[2] ?? 0) + t.atoms[1].location[0] * 0 - -m.atoms[1].location[0]) < 1e-9, "x becomes depth");
  const f = flattenAtoms(tiltAtoms(m, all, c, 30, 20), all);
  assert.ok(f.atoms.every((a) => a.location[2] === 0));
  m = sprout(m, 1);
  const turned = turnAboutBond(m, new Set([2]), 1, 0, 60), d = (q: number[], r: number[]) => Math.hypot(q[0] - r[0], q[1] - r[1], (q[2] ?? 0) - (r[2] ?? 0));
  assert.ok(Math.abs(d(turned.atoms[2].location, turned.atoms[1].location) - d(m.atoms[2].location, m.atoms[1].location)) < 1e-9, "bond length kept");
  assert.deepEqual(hingeOf(m, new Set([2])), [2, 1]);
  console.log("edit.check: perspective ok");
}

// Option-drag copies: atoms and the bonds between them, and picked objects with new ids, a caption kept to its copied arrow.
{
  const m = { ...sprout(sprout(EMPTY, [0, 0]), 1), arrows: [{ id: 10, kind: "reaction" as const, from: [0, 0] as [number, number], to: [3, 0] as [number, number] }],
    captions: [{ id: 11, text: "heat", x: 0, y: 0, on: { arrow: 10, side: "above" as const } }] };
  const d = duplicateSelection(m, new Set([0, 1]), new Set([10, 11]));
  assert.equal(d.mol.atoms.length, m.atoms.length + 2);
  assert.equal(d.mol.bonds.length, m.bonds.length + 1, "only the bond between the copied atoms is copied");
  assert.deepEqual([...d.atoms], [m.atoms.length, m.atoms.length + 1]);
  const copy = d.mol.captions!.find((c) => c.id === d.ids.get(11))!;
  assert.equal(copy.on!.arrow, d.ids.get(10));
  console.log("edit.check: duplicate ok");
}

// Copy and paste: a structure with its compound number and an arrow with its conditions come back whole, with new
// ids, the number still under the structure and the conditions still on the arrow.
{
  const m = { ...sprout(sprout(EMPTY, [0, 0]), 1), arrows: [{ id: 10, kind: "reaction" as const, from: [3, 0] as [number, number], to: [6, 0] as [number, number] }],
    captions: [{ id: 11, text: "heat", x: 0, y: 0, on: { arrow: 10, side: "above" as const } }, { id: 12, text: "1", x: 0, y: 0, under: [0, 1, 2], bold: true }] };
  const part = extractSelection(m, new Set([0, 1, 2]), new Set([10]));
  assert.equal(part.captions?.length, 2, "the number and the conditions come with what they belong to");
  const r = insertMol(m, part, [1, -1]);
  assert.equal(r.mol.atoms.length, 6);
  const heat = r.mol.captions!.filter((c) => c.text === "heat");
  assert.equal(heat.length, 2);
  assert.ok(r.mol.arrows!.some((a) => a.id === heat[1].on!.arrow && a.id !== 10), "the pasted conditions are on the pasted arrow");
  assert.deepEqual(r.mol.captions!.find((c) => c.text === "1" && c.id !== 12)!.under, [3, 4, 5]);
  console.log("edit.check: copy and paste ok");
}

// Expand Label joins the group where the label was, pointing away from the structure; Contract Label undoes it.
{
  let m = sprout(EMPTY, [0, 0]); // two atoms, 0 and 1, 1 to the right
  m = { ...m, atoms: m.atoms.map((a, i) => (i === 1 ? { ...a, text: "OMe" } : a)) };
  const frag = { atoms: [{ label: "O", location: [0, 0, 0] as [number, number, number] }, { label: "C", location: [-1, 0, 0] as [number, number, number] }], bonds: [{ type: 1, atoms: [0, 1] as [number, number] }] };
  const out = expandLabel(m, 1, frag);
  assert.equal(out.atoms.length, 3);
  assert.equal(out.atoms[1].label, "O");
  assert.equal(out.atoms[1].text, undefined);
  assert.ok(out.atoms[2].location[0] > out.atoms[1].location[0], "the methyl points away from the structure");
  const back = contractLabel(out, 1, new Set([1, 2]), "OMe");
  assert.equal(back.atoms.length, 2);
  assert.equal(back.atoms[1].text, "OMe");
  console.log("edit.check: labels ok");
}


// Ring bonds found in one walk agree with inRing for every bond, and map numbers and stereo flags still go in the
// widest gap (outside a ring when the atom has a bond out of it), as they did when each atom asked inRing per bond.
{
  const napht = addRing(addRing(EMPTY, 6, true, { point: [0, 0] }), 6, true, { bond: 1 });
  let m = sprout(sprout(napht, 0), napht.atoms.length); // a chain off the rings
  m = addRing(m, 5, false, { point: [8, 0] }); // a second structure
  m = { ...m, atoms: [...m.atoms, { label: "C", location: [12, 0, 0] }] }; // a lone atom
  for (const mol of [EMPTY, napht, m, sprout(EMPTY, [0, 0])]) assert.deepEqual(ringBonds(mol), mol.bonds.map((_, k) => inRing(mol, k)));
  const before = (mol: typeof m, i: number) => {
    const here = pos(mol, i), ns = neighbours(mol, i);
    if (!ns.length) return [0, -1];
    const ring = (j: number) => inRing(mol, mol.bonds.findIndex((b) => (b.atoms[0] === i && b.atoms[1] === j) || (b.atoms[0] === j && b.atoms[1] === i)));
    const bonds = ns.map((j) => ({ a: Math.atan2(pos(mol, j)[1] - here[1], pos(mol, j)[0] - here[0]), ring: ring(j) })).sort((p, q) => p.a - q.a);
    let best = [0, -1], score = -Infinity;
    bonds.forEach((b, k) => {
      const next = bonds[(k + 1) % bonds.length];
      let gap = bonds.length === 1 ? 2 * Math.PI : next.a - b.a;
      if (gap <= 0) gap += 2 * Math.PI;
      const mid = b.a + gap / 2, inside = bonds.length > 2 && b.ring && next.ring && bonds.some((x) => !x.ring), sc = gap - (inside ? 10 : 0) - 0.01 * Math.sin(mid);
      if (sc > score) { score = sc; best = [Math.cos(mid), Math.sin(mid)]; }
    });
    return best;
  };
  const all = m.atoms.map((_, i) => i), dirs = markDirections(m, all);
  for (const i of all) assert.deepEqual(dirs.get(i), before(m, i), `atom ${i}`);
  console.log("edit.check: ring bonds and mark directions ok");
}

// Atom hotkeys build what ChemDraw 26.1 builds, and move the keyboard hotspot to the atom it moves to.
{
  const angle = (m: ReturnType<typeof sprout>, i: number, j: number) => Math.round((Math.atan2(pos(m, j)[1] - pos(m, i)[1], pos(m, j)[0] - pos(m, i)[0]) * 180) / Math.PI);
  const valence = (m: ReturnType<typeof sprout>, i: number) => m.bonds.reduce((s, b) => s + (b.atoms.includes(i) ? (b.type === 4 ? 1.5 : b.type) : 0), 0);
  const bond = (m: ReturnType<typeof sprout>, i: number, j: number) => m.bonds.find((b) => b.atoms.includes(i) && b.atoms.includes(j));
  const ethane = sprout(EMPTY, [0, 0]); // atom 1 is a chain end, the bond at 30°
  const propane = sprout(ethane, 1); // atom 1 is a CH2, its open side straight up
  const isobutane = addGroup(propane, 1, "chain"); // atom 1 is branched
  const benzene = addRing(EMPTY, 6, true, { point: [0, 0] }); // atom 0 is aromatic
  const keys: Group[] = ["chain", "other", "acetyl", "phenyl", "wedgeMe", "hashMe", "cyclohexyl", "cyclopentyl", "methylidene", "dimethyl", "alkyne", "cyclopropyl", "cyclobutyl", "sulfonyl", "tBu"];
  // No key gives a carbon more than four bonds, on a chain end, a CH2, a branched carbon or an aromatic carbon.
  for (const [m, i] of [[ethane, 1], [propane, 1], [isobutane, 1], [benzene, 0]] as const) {
    for (const g of keys) {
      const [out, hot] = addGroupAt(m, i, g);
      out.atoms.forEach((a, k) => assert.ok(a.label !== "C" || valence(out, k) <= 4, `${g} on atom ${i} of ${m.atoms.length}: C${k} has ${valence(out, k)} bonds`));
      assert.ok(hot >= 0 && hot < out.atoms.length, `${g}: the hotspot is an atom`);
      // No new atom sits on another (a ring never takes a methyl in its way).
      out.atoms.forEach((_, a) => out.atoms.forEach((__, b) => assert.ok(a >= b || Math.hypot(pos(out, a)[0] - pos(out, b)[0], pos(out, a)[1] - pos(out, b)[1]) > 0.5, `${g}: atoms ${a} and ${b} overlap`)));
    }
  }
  // Chain end: 2 gives acetone (=O up, the hotspot on the new methyl), 3 makes the end a phenyl's first atom (the
  // hotspot across the ring), k makes it SO2Me, ⇧K its quaternary carbon, 4 a wedge up and a methyl.
  let [m, hot] = addGroupAt(ethane, 1, "acetyl");
  const o = m.atoms.findIndex((a) => a.label === "O");
  assert.deepEqual([m.atoms.length, bond(m, 1, o)?.type, angle(m, 1, o), angle(m, 1, hot)], [4, 2, 90, -30]);
  [m, hot] = addGroupAt(ethane, 1, "phenyl");
  assert.equal(m.atoms.length, 7);
  assert.ok(Math.abs(Math.hypot(pos(m, hot)[0] - pos(m, 1)[0], pos(m, hot)[1] - pos(m, 1)[1]) - 2) < 1e-9, "the hotspot goes to the para atom");
  [m, hot] = addGroupAt(ethane, 1, "sulfonyl");
  assert.deepEqual([m.atoms[1].label, m.atoms.filter((a) => a.label === "O").length, angle(m, 1, hot)], ["S", 2, -30]);
  [m, hot] = addGroupAt(ethane, 1, "tBu");
  assert.deepEqual([neighbours(m, 1).length, angle(m, 1, hot)], [4, 30], "t-Bu on the end carbon, the hotspot straight on");
  [m, hot] = addGroupAt(ethane, 1, "wedgeMe");
  const w = m.bonds.find((b) => b.stereo)!;
  assert.deepEqual([w.stereo, w.atoms[0], angle(m, 1, w.atoms[1]), angle(m, 1, hot)], [1, 1, 90, -30]);
  // A ring off a chain end: the bonds at the join meet at 120°, the ring's centre in line with the chain's bond.
  for (const g of ["cyclohexyl", "cyclopentyl", "cyclopropyl", "cyclobutyl"] as Group[]) {
    const out = addGroupAt(ethane, 1, g)[0], [a, b] = neighbours(out, 1).filter((k) => k !== 0);
    assert.equal(out.atoms[a] && neighbours(out, 1).length, 3, `${g}: the end atom is in the ring`);
    assert.ok(Math.abs(Math.abs(angle(out, 1, a) - 30) - Math.abs(angle(out, 1, b) - 30)) <= 1, `${g}: symmetric about the bond`);
  }
  // CH2 in a chain: 2 makes C=O and keeps the hotspot; 9 a pair 60° apart about the open side (the hotspot on the
  // right one); ⇧K a hashed and a wedged methyl; 0 a bond 1.75 long; 6 a spiro ring.
  [m, hot] = addGroupAt(propane, 1, "acetyl");
  assert.deepEqual([m.atoms.length, hot], [4, 1]);
  [m, hot] = addGroupAt(propane, 1, "dimethyl");
  assert.deepEqual([angle(m, 1, 3), angle(m, 1, 4), hot], [60, 120, 3]);
  [m, hot] = addGroupAt(propane, 1, "tBu");
  assert.deepEqual([bond(m, 1, 3)?.stereo, bond(m, 1, 4)?.stereo, hot], [6, 1, 3]);
  [m, hot] = addGroupAt(propane, 1, "other");
  assert.ok(Math.abs(Math.hypot(pos(m, hot)[0] - pos(m, 1)[0], pos(m, hot)[1] - pos(m, 1)[1]) - 1.75) < 1e-9 && angle(m, 1, hot) === 90);
  assert.equal(addGroup(propane, 1, "cyclohexyl").atoms.length, 3 + 5, "spiro");
  // Branched and aromatic carbons get a C–C bond first: 9 on a branched carbon is an isopropyl, 6 a cyclohexyl.
  assert.equal(addGroup(isobutane, 1, "dimethyl").atoms.length, 4 + 3);
  assert.equal(addGroup(benzene, 0, "cyclohexyl").atoms.length, 6 + 6);
  // A wedge on a branched carbon goes opposite the upright bond.
  [m, hot] = addGroupAt(isobutane, 1, "wedgeMe");
  assert.deepEqual([angle(m, 1, hot), bond(m, 1, hot)?.stereo], [-90, 1]);
  // z carries straight on; 1 1 1 types a chain; 8 then 1 gives the E alkene and 8 then 0 the Z.
  [m, hot] = addGroupAt(ethane, 1, "alkyne");
  assert.equal(angle(m, 1, hot), 30);
  [m, hot] = [ethane, 1];
  for (let k = 0; k < 3; k++) [m, hot] = addGroupAt(m, hot, "chain");
  assert.ok(m.atoms.every((_, k) => neighbours(m, k).length <= 2) && m.atoms.length === 5, "1 1 1 makes a chain");
  const side = (m: ReturnType<typeof sprout>, k: number) => Math.sign(cross(sub(pos(m, 2), pos(m, 1)), sub(pos(m, k), pos(m, 1))));
  const [ene, end] = addGroupAt(ethane, 1, "methylidene");
  assert.equal(end, 2);
  assert.notEqual(side(addGroup(ene, end, "chain"), 3), side(ene, 0), "8 then 1: E");
  assert.equal(side(addGroup(ene, end, "other"), 3), side(ene, 0), "8 then 0: Z");
  // The arrow keys walk the hotspot atom to bond to atom; where two bonds point as much that way, it stays.
  assert.deepEqual(walkHot(propane, { atom: 1 }, [-1, 0]), { bond: 0 });
  assert.deepEqual(walkHot(propane, { bond: 0 }, [-1, 0]), { atom: 0 });
  assert.deepEqual(walkHot(propane, { atom: 1 }, [0, -1]), { atom: 1 });
  // Shift+arrow jumps about three bonds along a chain, and past the end comes round from the other side.
  const { mol: hexane } = chainTo(EMPTY, [0, 0], [5 * Math.cos(Math.PI / 6), 0]);
  assert.deepEqual(jumpHot(hexane, { atom: 0 }, [1, 0]), { atom: 3 });
  assert.deepEqual(jumpHot(hexane, { atom: 0 }, [-1, 0]), { atom: 5 }, "round to the right end");
  // A ring fused by a bond key puts the hotspot on the ring's far bond.
  const fusedOn = addRing(propane, 6, false, { bond: 0 }), far = farBond(fusedOn, 0, propane.bonds.length)!;
  const mid = (m: typeof fusedOn, k: number) => [0, 1].map((d) => (pos(m, m.bonds[k].atoms[0])[d] + pos(m, m.bonds[k].atoms[1])[d]) / 2);
  assert.ok(Math.abs(Math.hypot(mid(fusedOn, far)[0] - mid(fusedOn, 0)[0], mid(fusedOn, far)[1] - mid(fusedOn, 0)[1]) - Math.sqrt(3)) < 1e-9, "the opposite bond");
  // After another edit the hotspot stays on its atom or bond: as it is if nothing was removed, found again where it
  // was if atoms were renumbered, and gone with its atom.
  assert.deepEqual(keepHot(hexane, setElement(hexane, 2, "O"), { atom: 2 }), { atom: 2 });
  assert.deepEqual(keepHot(hexane, deleteAtoms(hexane, new Set([0])), { atom: 3 }), { atom: 2 });
  assert.deepEqual(keepHot(hexane, deleteAtoms(hexane, new Set([0])), { bond: 3 }), { bond: 2 });
  assert.equal(keepHot(hexane, deleteAtoms(hexane, new Set([3])), { atom: 3 }), undefined);
  console.log("edit.check: atom hotkeys ok");
}

// Groups (ChemDraw's Object > Group): a group holds whole structures, so atoms drawn onto a grouped structure join it,
// and groups that come to share a structure become one. An integral group cannot be split: a selection that touches
// it takes all of it. Option-drag copies keep their group and the compound number under the structure.
{
  let m = addRing(addRing(EMPTY, 6, true, { point: [-4, 0] }), 5, false, { point: [4, 0] });
  let num: number, box: number;
  [m, num] = addCaption(m, { text: "1", x: 0, y: 0, bold: true, under: [0, 1, 2, 3, 4, 5] });
  [m, box] = addArrow(m, { kind: "reaction", from: [-1, -3], to: [1, -3] });
  const [grouped, gid] = groupSelection(m, new Set([0, 6]), new Set([box]))!;
  assert.deepEqual(grouped.groups![0].atoms, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "grouping takes whole structures");
  assert.equal(wholeGroups(grouped), grouped, "nothing to change gives the same drawing");
  // A bond drawn from a grouped atom: the new atom joins the group.
  const sprouted = wholeGroups(sprout(grouped, 8));
  assert.deepEqual(sprouted.groups![0].atoms, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  // A free ring joined onto a grouped one by a bond: the whole of it joins.
  const free = addRing(grouped, 6, false, { point: [12, 0] }), joined = wholeGroups(bondTo(free, 9, pos(free, 11)));
  assert.equal(joined.groups![0].atoms.length, 17);
  // Two groups that come to share a structure, neither holding the other, become one; integral if either was.
  const [withNote, note] = addCaption(free, { text: "x", x: 12, y: -3 });
  const two = { ...withNote, groups: [{ ...grouped.groups![0], integral: true as const }, { id: 99, atoms: [11], items: [note] }] };
  const one = wholeGroups(bondTo(two, 9, pos(two, 11)));
  assert.equal(one.groups!.length, 1);
  assert.equal(one.groups![0].id, gid);
  assert.equal(one.groups![0].integral, true);
  assert.deepEqual(one.groups![0].items.sort(), [box, num, note].sort());
  // A group that comes to hold all of another keeps it inside, as a group of its own.
  const nested = wholeGroups(bondTo({ ...free, groups: [grouped.groups![0], { id: 99, atoms: [11], items: [num] }] }, 9, pos(free, 11)));
  assert.equal(nested.groups!.length, 2);
  // A damaged file: part of a structure, an atom twice, an atom that is not there.
  const fixed = wholeGroups({ ...m, groups: [{ id: 50, atoms: [0, 0, 99], items: [box] }] });
  assert.deepEqual(fixed.groups![0].atoms, [0, 1, 2, 3, 4, 5]);
  // Integral: an atom, or the arrow, takes in the whole group, with the number under the benzene (text that belongs
  // to a grouped structure is in the group).
  const integral = { ...grouped, groups: [{ ...grouped.groups![0], integral: true as const }] };
  const [atoms, items] = wholeIntegral(integral, new Set([3]), new Set());
  assert.equal(atoms.size, 11);
  assert.deepEqual([...items].sort(), [box, num].sort());
  assert.equal(wholeIntegral(integral, new Set(), new Set([box]))[0].size, 11);
  assert.equal(wholeIntegral(grouped, new Set([3]), new Set())[0].size, 1, "a plain group can be picked in parts");
  // Option-drag of the whole group: the copy is grouped, and the number under the benzene comes too.
  const d = duplicateSelection(grouped, new Set(grouped.groups![0].atoms), new Set([box]));
  assert.equal(d.mol.groups!.length, 2);
  assert.deepEqual(d.mol.groups![1].atoms, [...d.atoms].sort((p, q) => p - q));
  assert.deepEqual(d.mol.groups![1].items.sort(), [d.ids.get(box), d.ids.get(num)].sort());
  assert.equal(d.mol.captions!.filter((c) => c.text === "1").length, 2);
  assert.ok(d.items.has(d.ids.get(num)!), "the copied number moves with the copy");
  // Picked text whose structure is not copied is copied as free text.
  const alone = duplicateSelection(grouped, new Set(), new Set([num]));
  assert.equal(alone.mol.captions!.find((c) => c.id === alone.ids.get(num))!.under, undefined);
  // Flip about a line that is not the middle of the atoms: each atom goes to the far side of that line.
  const flipped = flipAtoms(m, new Set([0]), "horizontal", false, 1);
  assert.ok(Math.abs(pos(flipped, 0)[0] - (2 - pos(m, 0)[0])) < 1e-9);
  console.log("edit.check: groups ok");
}

// Nested groups (ChemDraw's groups nest): Group adds one level and Ungroup takes one away; each level keeps its own
// Integral; a double-click picks the outermost group; Group inside a group makes a group in it.
{
  let m = addRing(addRing(EMPTY, 6, true, { point: [-4, 0] }), 5, false, { point: [4, 0] });
  let x: number, r: number, num: number;
  [m, x] = addCaption(m, { text: "x", x: 0, y: -3 });
  [m, r] = addArrow(m, { kind: "reaction", from: [-1, 3], to: [1, 3] });
  [m, num] = addCaption(m, { text: "1", x: 0, y: 0, bold: true, under: [0, 1, 2, 3, 4, 5] });
  const benzene = new Set([0, 1, 2, 3, 4, 5]), ring5 = new Set([6, 7, 8, 9, 10]), all = new Set([...benzene, ...ring5]);
  // Benzene and x as a group; then that group and the arrow as a group round it.
  const [one, inner] = groupSelection(m, benzene, new Set([x]))!;
  assert.deepEqual(one.groups![0].items.sort(), [x, num].sort(), "the number under the benzene is in its group");
  assert.equal(groupSelection(one, benzene, new Set([x, num])), undefined, "a whole group alone is one thing");
  assert.equal(groupSelection(one, new Set([0]), new Set([x])), undefined, "the number comes with the benzene, so this is the whole group too");
  const [two, outer] = groupSelection(one, new Set([0]), new Set([r]))!;
  assert.equal(two.groups!.length, 2);
  assert.deepEqual(groupParents(two.groups!).map((p) => (p === undefined ? undefined : two.groups![p].id)), [outer, undefined]);
  assert.equal(outermost(groupsOf(two, new Set([3]), new Set()))!.id, outer, "a double-click picks the outermost group");
  // Ungroup on the whole outer group takes one level away; the inner group stays.
  const sel = { atoms: new Set(two.groups![1].atoms), items: new Set(two.groups![1].items) };
  assert.deepEqual(selectedGroups(two, sel.atoms, sel.items).map((g) => g.id), [outer]);
  assert.deepEqual(ungroupSelection(two, sel.atoms, sel.items).groups!.map((g) => g.id), [inner]);
  // A click on one atom: Ungroup and Pick as One work on the outermost group it is in.
  assert.deepEqual(groupTargets(two, new Set([0]), new Set()).map((g) => g.id), [outer]);
  // The whole inner group picked: they work on it.
  assert.deepEqual(groupTargets(two, benzene, new Set([x, num])).map((g) => g.id), [inner]);
  // Integral on each level: an integral inner group takes in only itself; an integral outer group takes in all.
  const innerOn = { ...two, groups: two.groups!.map((g) => (g.id === inner ? { ...g, integral: true as const } : g)) };
  assert.equal(wholeIntegral(innerOn, new Set([2]), new Set())[0].size, 6);
  assert.equal(wholeIntegral(innerOn, new Set(), new Set([r]))[1].size, 1, "the arrow is in the plain outer group only");
  const outerOn = { ...two, groups: two.groups!.map((g) => (g.id === outer ? { ...g, integral: true as const } : g)) };
  assert.deepEqual([...wholeIntegral(outerOn, new Set([2]), new Set())[1]].sort(), [x, r, num].sort());
  // Group with two members of a plain group selected: a new group inside it.
  const [three, top] = groupSelection(m, all, new Set([x]))!;
  const [four, sub] = groupSelection(three, benzene, new Set([x]))!;
  const p = groupParents(four.groups!);
  assert.equal(four.groups![p[four.groups!.findIndex((g) => g.id === sub)]!].id, top);
  assert.deepEqual(four.groups!.find((g) => g.id === sub)!.items.sort(), [x, num].sort(), "the number goes in the new group with the benzene");
  // Align and Distribute: two members of a group, picked on their own, are two things (no group is all selected).
  assert.deepEqual(selectedGroups(three, all, new Set()), [], "x is not picked, so the group is not all selected");
  assert.deepEqual(selectedGroups(three, all, new Set([x])).map((g) => g.id), [top]);
  // An integral group that holds one group alone gives it Integral and goes.
  const lone = tidyGroups({ ...one, groups: [{ id: 90, atoms: one.groups![0].atoms, items: one.groups![0].items, integral: true }, one.groups![0]] });
  assert.deepEqual(lone.groups!.map((g) => [g.id, g.integral]), [[inner, true]]);
  // Copy and paste (and Option-drag) keep both levels.
  const d = duplicateSelection(two, sel.atoms, sel.items);
  assert.equal(d.mol.groups!.length, 4);
  assert.equal(groupParents(d.mol.groups!).filter((q) => q === undefined).length, 2);
  console.log("edit.check: nested groups ok");
}

// Groups lose what is deleted (GRP-11): an object id that is gone goes from the group, and a group left with fewer
// than two things (structures, objects or groups) goes. A damaged list (an atom twice) is put right.
{
  let m = addRing(addRing(EMPTY, 6, true, { point: [-4, 0] }), 6, false, { point: [4, 0] });
  let num: number, r: number, box: number;
  [m, num] = addCaption(m, { text: "1", x: 0, y: 0, bold: true, under: [0, 1, 2, 3, 4, 5] });
  [m, r] = addArrow(m, { kind: "reaction", from: [-1, 3], to: [1, 3] });
  [m, box] = addShape(m, { kind: "box", from: [-6, -2], to: [6, 2] });
  const [g] = groupSelection(m, new Set([0]), new Set([r, box]))!;
  const gone = deleteAtoms(g, new Set([0, 1, 2, 3, 4, 5]));
  assert.deepEqual(gone.groups![0].items.sort(), [r, box].sort(), "the number went with its structure");
  assert.ok(!gone.groups![0].items.includes(num));
  const [rings] = groupSelection(m, new Set([0, 6]), new Set())!;
  assert.equal(deleteAtoms(rings, new Set([0, 1, 2, 3, 4, 5])).groups!.length, 0, "a group of one structure is no longer a group");
  assert.equal(deleteGraphics(g, new Set([r, box])).groups!.length, 1, "the benzene and its number are still two things");
  const fixed = tidyGroups({ ...m, groups: [{ id: 50, atoms: [0], items: [] }, { id: 51, atoms: [0, 0, 6], items: [] }, { id: 52, atoms: [0, 6], items: [999] }] });
  assert.deepEqual(fixed.groups!.map((x) => [x.atoms, x.items]), [[[0, 6], []]]);
  console.log("edit.check: groups after a delete ok");
}

// Groups that cross (a damaged or hostile file) are put right in one pass: 3000 groups that each share atom 0 become
// one group in well under a second (before, it took minutes). Random groups always come out apart or nested, and each
// group's parent holds it.
{
  const atoms: Mol["atoms"] = Array.from({ length: 3001 }, (_, k) => ({ label: "C", location: [k * 2, 0, 0] }));
  const t = performance.now(), star = tidyGroups({ atoms, bonds: [], groups: Array.from({ length: 3000 }, (_, k) => ({ id: k + 1, atoms: [0, k + 1], items: [] })) });
  assert.equal(star.groups!.length, 1);
  assert.ok(performance.now() - t < 500, `crossing groups took ${performance.now() - t} ms`);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const shapes = [100, 101, 102].map((id) => ({ id, kind: "box" as const, from: [0, 0] as [number, number], to: [1, 1] as [number, number] }));
  for (let n = 0; n < 2000; n++) {
    const groups = Array.from({ length: 2 + Math.floor(rnd() * 4) }, (_, k) => ({ id: k + 1, atoms: [0, 1, 2, 3, 4, 5, 6, 7].filter(() => rnd() < 0.35), items: [100, 101, 102].filter(() => rnd() < 0.3) }));
    const gs = tidyGroups({ atoms: atoms.slice(0, 8), bonds: [], shapes, groups }).groups ?? [], sets = gs.map((g) => new Set([...g.atoms, ...g.items.map((id) => -1 - id)]));
    const within = (a: Set<number>, b: Set<number>) => [...a].every((x) => b.has(x));
    for (const a of sets) for (const b of sets) if (a !== b && [...a].some((x) => b.has(x))) assert.ok(within(a, b) || within(b, a), JSON.stringify(groups));
    groupParents(gs).forEach((p, k) => p !== undefined && assert.ok(within(sets[k], sets[p])));
  }
  console.log("edit.check: crossing groups ok");
}

// Group on a large selection runs fragments once (GRP-13): 300 rings group in well under 100 ms.
{
  let m = EMPTY;
  for (let k = 0; k < 300; k++) m = addRing(m, 6, true, { point: [(k % 20) * 3, Math.floor(k / 20) * 3] });
  const t = performance.now(), r = groupSelection(m, new Set(m.atoms.map((_, i) => i)), new Set());
  assert.equal(r![0].groups![0].atoms.length, 1800);
  assert.ok(performance.now() - t < 100, `Group took ${performance.now() - t} ms`);
  console.log("edit.check: large group ok");
}

// A cycle in a group stays in it when its intermediates go on being grouped.
{
  let m = addRing(addRing(EMPTY, 6, true, { point: [-4, 0] }), 6, false, { point: [4, 0] }), y: number, box: number;
  [m, y] = addCycle(m, { centre: [0, 0], radius: 4, clockwise: true, nodes: [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]] });
  [m, box] = addShape(m, { kind: "box", from: [-8, -5], to: [8, 5] });
  const [g] = groupSelection(m, new Set(), new Set([y, box]))!;
  assert.deepEqual(g.groups![0].items.sort(), [y, box].sort());
  assert.equal(outermost(groupsOf(g, new Set(), new Set([y])))!.items.length, 2, "a double-click on the cycle finds its group");
  console.log("edit.check: grouped cycle ok");
}

// Bond orders are added up for every atom in one pass (an aromatic bond counts 1.5), and freePairs gives the same
// lone pairs with them as it works out alone.
{
  const m = setElement(sprout(sprout(sprout(EMPTY, [0, 0]), 1), 1), 1, "N"), aromatic = { ...m, bonds: m.bonds.map((b, k) => (k === 0 ? { ...b, type: 4 } : k === 1 ? { ...b, type: 2 } : b)) };
  assert.deepEqual(bondOrders(aromatic), [1.5, 4.5, 2, 1]);
  assert.deepEqual(bondOrders(aromatic, (type) => (type === 4 ? 1 : type)), [1, 4, 2, 1]);
  const used = bondOrders(aromatic);
  for (const mol of [m, aromatic]) for (let i = 0; i < mol.atoms.length; i++) assert.equal(freePairs(mol, i, bondOrders(mol)[i]), freePairs(mol, i));
  assert.equal(freePairs(m, 1), 1); // an amine N: one lone pair
  assert.equal(freePairs(aromatic, 1, used[1]), freePairs(aromatic, 1));
  console.log("edit.check: bond orders ok");
}

// ChemDraw's c key, and C typed as a label, show the carbon's label; setting an element (or Delete's first press)
// takes it off again. Other element keys work as before.
{
  const { keyElement, setLabel } = await import("./edit.ts");
  const chain = sprout(sprout(EMPTY, [0, 0]), 1);
  assert.equal(keyElement(chain, 0, "C").atoms[0].shown, true);
  assert.equal(setLabel(chain, 0, "C").atoms[0].shown, true);
  assert.equal(setElement(keyElement(chain, 0, "C"), 0, "C").atoms[0].shown, undefined);
  assert.deepEqual([keyElement(chain, 0, "N").atoms[0].label, keyElement(chain, 0, "N").atoms[0].shown], ["N", undefined]);
  console.log("edit.check: shown carbons ok");
}

// Ring tools as ChemDraw's: a drag sets the first bond and the ring lies on its left; Shift makes the first bond
// single; Command draws it delocalised (alternating bonds, every atom marked for its circle); Option-click on an atom
// sprouts the ring on a new bond; a dragged chair turns to face the drag.
{
  const right = addRing(EMPTY, 6, true, { along: [[0, 0], [1, 0]] });
  assert.ok(near(pos(right, 0), [0, 0]) && near(pos(right, 1), [1, 0]), "the first bond is the drag");
  assert.ok(right.atoms.every((a) => a.location[1] >= -1e-9), "a drag to the right puts the ring above");
  assert.equal(right.bonds.find((b) => b.atoms.includes(0) && b.atoms.includes(1))!.type, 2, "benzene's first bond is double");
  const shifted = addRing(EMPTY, 6, true, { along: [[0, 0], [1, 0]] }, { firstSingle: true });
  assert.equal(shifted.bonds.find((b) => b.atoms.includes(0) && b.atoms.includes(1))!.type, 1, "Shift: the first bond single");
  assert.equal(shifted.bonds.filter((b) => b.type === 2).length, 3);
  const long = addRing(EMPTY, 5, false, { along: [[0, 0], [0, 2]] });
  for (const b of long.bonds) assert.ok(Math.abs(Math.hypot(pos(long, b.atoms[0])[0] - pos(long, b.atoms[1])[0], pos(long, b.atoms[0])[1] - pos(long, b.atoms[1])[1]) - 2) < 1e-9, "a free drag sizes the ring");
  assert.ok(long.atoms.every((a) => a.location[0] <= 1e-9), "a drag up puts the ring on the left");
  const deloc = addRing(EMPTY, 6, true, { point: [0, 0] }, { circle: true });
  assert.ok(deloc.atoms.every((a) => a.circle));
  // From an atom: the ring shares it, and a drag on to an existing atom takes that atom.
  const ethane = sprout(EMPTY, [0, 0]), from = addRing(ethane, 6, false, { atom: 1, along: [pos(ethane, 1), pos(ethane, 0)] });
  assert.equal(from.atoms.length, 6, "the ring takes both atoms of the bond it was dragged along");
  const chain = sprout(sprout(EMPTY, [0, 0]), 1), spiro = addRing(chain, 6, false, { atom: 1 }), sprouted = addRing(chain, 6, false, { atom: 1 }, { sprout: true });
  assert.equal(spiro.atoms.length, chain.atoms.length + 5);
  assert.equal(sprouted.atoms.length, chain.atoms.length + 6, "sprouted: on a new bond from the atom");
  assert.ok(sprouted.bonds.some((b) => b.atoms.includes(1) && !chain.bonds.some((c) => c.atoms[0] === b.atoms[0] && c.atoms[1] === b.atoms[1])));
  const flat = addChair(EMPTY, 1, { point: [0, 0] }), up = addChair(EMPTY, 1, { point: [0, 0], turn: Math.PI / 2 });
  const span = (m: typeof flat, k: 0 | 1) => Math.max(...m.atoms.map((a) => a.location[k])) - Math.min(...m.atoms.map((a) => a.location[k]));
  assert.ok(span(flat, 0) > span(flat, 1) && span(up, 1) > span(up, 0), "a chair dragged up stands up");
  console.log("edit.check: ring tool drags and keys ok");
}
