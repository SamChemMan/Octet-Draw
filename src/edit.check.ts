// Run: node src/edit.check.ts. Fails loudly if an editing rule breaks.
import assert from "node:assert/strict";
import { EMPTY, bondOrders, freePairs, addCaption, addTemplate, normalise, addChair, addGroup, nextNumber, addRing, alignFragments, atomsInPolygon, flipAtoms, atomAt, atomsIn, bondTo, chainTo, complete, flipBond, rotateAtoms, setBondSpec, cycleBond, deleteAtom, deleteAtoms, deleteBond, erase, fragments, joinOverlaps, merge, moveAtoms, nextDirection, onSelection, pos, setElement, sprout, subset, levelTurn, newTable, resizeTable, setTableCell, expandLabel, contractLabel, spliceTable, sizeTable, fitTable, clearTable, pairMap, clearMap, tiltAtoms, turnAboutBond, flattenAtoms, hingeOf, duplicateSelection, extractSelection, insertMol, inRing, ringBonds, markDirections, neighbours } from "./edit.ts";
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

// IDEA-SCALE-7: bonds, chains, rings, groups and templates drawn from a scaled atom take its scale, so they match.
{
  const len = (mol: typeof m, b: { atoms: [number, number] }) => Math.hypot(pos(mol, b.atoms[1])[0] - pos(mol, b.atoms[0])[0], pos(mol, b.atoms[1])[1] - pos(mol, b.atoms[0])[1]);
  const big = { atoms: [{ label: "C", location: [0, 0, 0] as [number, number, number], scale: 2 }, { label: "C", location: [2, 0, 0] as [number, number, number], scale: 2 }], bonds: [{ type: 1, atoms: [0, 1] as [number, number] }] };
  const one = sprout(big, 1);
  assert.ok(Math.abs(len(one, one.bonds[1]) - 2) < 1e-9 && one.atoms[2].scale === 2, "a sprouted bond is two bond lengths, and its atom is at 200%");
  const chain = chainTo(big, 1, [2 + 4 * Math.cos(Math.PI / 6) * 2, 0]);
  assert.equal(chain.bonds, 4, "a chain counts bonds at the atom's scale");
  assert.ok(chain.mol.bonds.slice(1).every((b) => Math.abs(len(chain.mol, b) - 2) < 1e-9) && chain.mol.atoms.slice(2).every((a) => a.scale === 2));
  const fused = addRing(big, 6, false, { bond: 0 });
  assert.equal(fused.atoms.length, 6, "a ring fused on a long bond joins both its atoms");
  assert.ok(fused.bonds.every((b) => Math.abs(len(fused, b) - 2) < 1e-9) && fused.atoms.every((a) => a.scale === 2), "its bonds are as long as the bond it is on");
  const spiro = addRing(big, 5, false, { atom: 1 });
  assert.ok(spiro.bonds.slice(1).every((b) => Math.abs(len(spiro, b) - 2) < 1e-9));
  const methyl = addGroup(big, 1, "tBu");
  assert.ok(methyl.bonds.slice(1).every((b) => Math.abs(len(methyl, b) - 2) < 1e-9) && methyl.atoms.slice(2).every((a) => a.scale === 2), "a group at the atom's scale");
  const benzene = normalise(addRing(EMPTY, 6, true, { point: [0, 0] }));
  const onAtom = addTemplate(big, benzene, { atom: 1 }), onBond = addTemplate(big, benzene, { bond: 0 });
  assert.ok(onAtom.bonds.slice(1).every((b) => Math.abs(len(onAtom, b) - 2) < 1e-6) && onAtom.atoms.slice(2).every((a) => a.scale === 2), "a template on a scaled atom");
  assert.ok(onBond.bonds.every((b) => Math.abs(len(onBond, b) - 2) < 1e-6) && onBond.atoms.every((a) => a.scale === 2), "a template on a scaled bond");
  const chair = addChair(big, 1, { bond: 0 });
  assert.ok(chair.atoms.every((a) => a.scale === 2));
  // On a plain atom nothing changes: unit bonds, no scale written.
  const plain = sprout(sprout(EMPTY, [0, 0]), 1);
  assert.ok(plain.atoms.every((a) => !("scale" in a)) && Math.abs(len(plain, plain.bonds[1]) - 1) < 1e-9);
  console.log("edit.check: drawing on a scaled structure ok");
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
