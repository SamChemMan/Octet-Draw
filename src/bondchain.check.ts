// Run: node src/bondchain.check.ts. Fails loudly if the bond and chain tools stop acting as ChemDraw's do.
import assert from "node:assert/strict";
import { EMPTY, addChain, chainPoints, chainTo, clickBond, dragBond, jumpHot, merge, nextSide, pos, snake, sprout, type BondSpec, type P } from "./edit.ts";
import { QUADRUPLE, type Mol } from "./render.ts";

const SOLID: BondSpec = { type: 1 }, BOLD: BondSpec = { type: 1, display: "bold" }, DASHED: BondSpec = { type: 1, display: "dashed" };
const WAVY: BondSpec = { type: 1, display: "wavy" }, WEDGE: BondSpec = { type: 1, stereo: 1 }, DOUBLE: BondSpec = { type: 2 };
const kind = (m: Mol, k = 0) => { const b = m.bonds[k]; return `${b.type}${b.stereo ? "s" + b.stereo : ""}${b.display ? " " + b.display : ""}${b.position ? " " + b.position : ""}`; };
const mid = (m: Mol, k = 0): P => { const [a, b] = m.bonds[k].atoms.map((i) => pos(m, i)); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
const angleAt = (m: Mol, i: number, j: number, k: number) => {
  const a = pos(m, j), u = [pos(m, i)[0] - a[0], pos(m, i)[1] - a[1]], v = [pos(m, k)[0] - a[0], pos(m, k)[1] - a[1]];
  return Math.round((Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(u[0], u[1]) / Math.hypot(v[0], v[1])) * 180) / Math.PI);
};

// CORE-10: the Solid tool makes a single bond double; later clicks move the second line round its three places;
// a triple bond goes back to single.
const ethane = sprout(EMPTY, [0, 0]);
let m = clickBond(ethane, 0, SOLID, mid(ethane));
assert.equal(kind(m), "2");
// A bond drawn up and to the right, its second line drawn on the right: then centre, then left, then right.
m = clickBond(m, 0, SOLID, mid(m), 1); assert.equal(kind(m), "2 centre");
m = clickBond(m, 0, SOLID, mid(m), 0); assert.equal(kind(m), "2 left");
m = clickBond(m, 0, SOLID, mid(m), -1); assert.equal(kind(m), "2 right");
// The same bond drawn the other way round goes round the other way, so it looks the same on screen.
const back: Mol = { ...ethane, bonds: [{ type: 2, atoms: [1, 0] }] };
assert.equal(nextSide(back, 0, -1), "centre");
assert.equal(nextSide(back, 0, 0), "right");
assert.equal(clickBond({ ...ethane, bonds: [{ type: 3, atoms: [0, 1] }] }, 0, SOLID, mid(ethane)).bonds[0].type, 1);
console.log("bondchain.check: single tool ok");

// CORE-12: style tools keep a double bond double.
const dbl = clickBond(ethane, 0, SOLID, mid(ethane));
assert.equal(kind(clickBond(dbl, 0, BOLD, mid(dbl))), "2 bold");
assert.equal(kind(clickBond(dbl, 0, DASHED, mid(dbl))), "2 dashed");
assert.equal(kind(clickBond(clickBond(dbl, 0, DASHED, mid(dbl)), 0, DASHED, mid(dbl))), "2 aromatic");
assert.equal(kind(clickBond(clickBond(dbl, 0, BOLD, mid(dbl)), 0, SOLID, mid(dbl))), "2");
// The style stays on the side it was, and a second click with the same style moves the line.
const leftBold = clickBond({ ...dbl, bonds: [{ ...dbl.bonds[0], position: "left" }] }, 0, BOLD, mid(dbl));
assert.equal(kind(leftBold), "2 bold left");
assert.equal(kind(clickBond(leftBold, 0, BOLD, mid(dbl), -1)), "2 bold right");
// Wavy: a wavy bond, then a double bond, then a double either.
m = clickBond(ethane, 0, WAVY, mid(ethane)); assert.equal(kind(m), "1 wavy");
m = clickBond(m, 0, WAVY, mid(m)); assert.equal(kind(m), "2");
m = clickBond(m, 0, WAVY, mid(m)); assert.equal(kind(m), "2 either");
// The Double tool moves the second line of a double bond; a wedge tool leaves it as it is.
assert.equal(kind(clickBond(dbl, 0, DOUBLE, mid(dbl), 0)), "2 left");
assert.equal(clickBond(dbl, 0, WEDGE, mid(dbl)), dbl);
// A bold single bond clicked with Bold becomes a bold double; a dashed one with Dashed a dashed double.
assert.equal(kind(clickBond(clickBond(ethane, 0, BOLD, mid(ethane)), 0, BOLD, mid(ethane))), "2 bold");
assert.equal(kind(clickBond(clickBond(ethane, 0, DASHED, mid(ethane)), 0, DASHED, mid(ethane))), "2 dashed");
console.log("bondchain.check: style tools ok");

// CORE-14: the wide end of a wedge goes on the half of the bond clicked (atoms with as many bonds), else the narrow
// end goes on the atom with more bonds. A second click turns it round.
const near = (m: Mol, k: number, t: number): P => { const [a, b] = m.bonds[k].atoms.map((i) => pos(m, i)); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
m = clickBond(ethane, 0, WEDGE, near(ethane, 0, 0.62));
assert.deepEqual(m.bonds[0].atoms, [0, 1], "wide end at atom 1, nearer the click");
m = clickBond(ethane, 0, WEDGE, near(ethane, 0, 0.38));
assert.deepEqual(m.bonds[0].atoms, [1, 0], "wide end at atom 0, nearer the click");
assert.deepEqual(clickBond(m, 0, WEDGE, near(m, 0, 0.5)).bonds[0].atoms, [0, 1]);
const propane = sprout(ethane, 1);
assert.deepEqual(clickBond(propane, 0, WEDGE, near(propane, 0, 0.9)).bonds[0].atoms, [1, 0], "narrow end on the atom with more bonds");
console.log("bondchain.check: wedge ok");

// CORE-15: a bond from an atom whose label runs to the right (CO2Me) is not hidden under that label.
for (const text of [1, -1]) {
  const m = sprout(ethane, 1, SOLID, text), d = [pos(m, 2)[0] - pos(m, 1)[0], pos(m, 2)[1] - pos(m, 1)[1]];
  assert.ok(d[0] * text <= 0.5 + 1e-9, `bond clear of a label running ${text > 0 ? "right" : "left"}`);
}
const lone: Mol = { atoms: [{ label: "O", text: "OH", location: [0, 0, 0] }], bonds: [] };
assert.ok(pos(sprout(lone, 0, SOLID, 1), 1)[0] < 0, "a lone label's first bond goes the other way");
console.log("bondchain.check: bonds clear of labels ok");

// CORE-11: a bond drawn over a bond raises its order, as ChemDraw's: up to quadruple, then back to single.
m = dragBond(ethane, 0, pos(ethane, 1)); assert.equal(kind(m), "2");
m = dragBond(m, 0, pos(m, 1)); assert.equal(kind(m), "3");
m = dragBond(m, 0, pos(m, 1)); assert.equal(kind(m), String(QUADRUPLE), "a drag along a triple bond makes it quadruple");
m = dragBond(m, 1, pos(m, 0)); assert.equal(kind(m), "1");
assert.equal(kind(dragBond(ethane, 0, pos(ethane, 1), BOLD)), "2 bold");
assert.equal(kind(dragBond(clickBond(ethane, 0, DASHED, mid(ethane)), 0, pos(ethane, 1), DASHED)), "2 aromatic");
assert.equal(dragBond(ethane, 0, [3, 3]).bonds.length, 2, "a drag elsewhere still adds a bond");
console.log("bondchain.check: bond over bond ok");

// CORE-17: a chain from an atom with bonds keeps 120° at that atom and all along, whichever way it is dragged.
for (const t of [0, -30, 30, 60, 90, -90, 180]) {
  const q: P = [pos(ethane, 1)[0] + 4 * Math.cos((t * Math.PI) / 180), pos(ethane, 1)[1] + 4 * Math.sin((t * Math.PI) / 180)];
  const { mol, bonds } = chainTo(ethane, 1, q);
  assert.ok(bonds >= 4);
  assert.equal(angleAt(mol, 0, 1, 2), 120, `angle at the start atom for a drag at ${t}°`);
  for (let i = 2; i < mol.atoms.length - 1; i++) assert.equal(angleAt(mol, i - 1, i, i + 1), 120);
}
// Straight on from a chain end, the chain carries on the same zig-zag.
const butane = chainTo(EMPTY, [0, 0], [3 * Math.cos(Math.PI / 6), 0]).mol, end = butane.atoms.length - 1;
const longer = chainTo(butane, end, [pos(butane, end)[0] + 3, pos(butane, end)[1]]).mol;
for (let i = 1; i < longer.atoms.length - 1; i++) assert.equal(angleAt(longer, i - 1, i, i + 1), 120);
assert.ok(longer.atoms.every((a, i) => i === 0 || Math.abs(a.location[1] - longer.atoms[i - 1].location[1]) > 0.4), "one zig-zag along the line");
console.log("bondchain.check: chain from an atom ok");

// CORE-18: on empty canvas the first bond goes to the pointer's side of the drag.
const up = chainPoints(EMPTY, [0, 0], [4, 0], 1), down = chainPoints(EMPTY, [0, 0], [4, 0], -1);
assert.ok(up[0][1] > 0 && down[0][1] < 0);
// Add Chain: n atoms from a point, n new atoms from an atom, zig-zag.
const five = addChain(EMPTY, [0, 0], 5);
assert.equal(five.mol.atoms.length, 5);
assert.equal(five.mol.bonds.length, 4);
assert.equal(five.last, 4);
for (let i = 1; i < 4; i++) assert.equal(angleAt(five.mol, i - 1, i, i + 1), 120);
const attached = addChain(ethane, 1, 3);
assert.equal(attached.mol.atoms.length, 5);
assert.equal(angleAt(attached.mol, 0, 1, 2), 120);
// The Snaking Chain follows the pointer: on, then back.
let path = snake([0, 0], [[Math.cos(Math.PI / 6), 0.5]], [4, 0]);
assert.ok(path.length >= 4);
const sm = (pts: P[]) => ({ atoms: [[0, 0] as P, ...pts].map((q) => ({ label: "C", location: [q[0], q[1], 0] as [number, number, number] })), bonds: pts.map((_, k) => ({ type: 1, atoms: [k, k + 1] as [number, number] })) });
for (let i = 1; i < path.length; i++) assert.equal(angleAt(sm(path), i - 1, i, i + 1), 120);
path = snake([0, 0], path, [4, 4]);
const turned = path.length;
path = snake([0, 0], path, [0.9, 0.5]);
assert.ok(path.length < turned && path.length >= 1, "going back takes atoms off");
console.log("bondchain.check: chain tool ok");

// CORE-16: Shift+Option+arrow moves the hotspot to the nearest atom of another structure that way, round past the edge.
const pair = merge(merge(ethane, ethane, [4, 0]), ethane, [-8, 0]);
assert.equal(jumpHot(pair, { atom: 1 }, [1, 0], true).atom, 2);
assert.equal(jumpHot(pair, { atom: 1 }, [-1, 0], true).atom! >= 4, true, "to the structure on the left");
assert.deepEqual(jumpHot(ethane, { atom: 1 }, [1, 0], true), { atom: 1 }, "no other structure: it stays");
console.log("bondchain.check: hotspot to the next structure ok");

// The document's chain angle (ChemDraw's Chain Angle): every angle of a dragged or snaking chain is that angle.
{
  const angleAt = (a: P, b: P, c: P) => Math.round((Math.acos(((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])) / (Math.hypot(a[0] - b[0], a[1] - b[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]))) * 180) / Math.PI);
  for (const angle of [120, 110, 135]) {
    const pts = [[0, 0] as P, ...chainPoints(EMPTY, [0, 0], [5, 0], 1, angle)];
    for (let k = 1; k + 1 < pts.length; k++) assert.equal(angleAt(pts[k - 1], pts[k], pts[k + 1]), angle, `chain angle ${angle}`);
    for (let k = 1; k < pts.length; k++) assert.ok(Math.abs(Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) - 1) < 1e-9, "unit bonds");
    const s = snake([0, 0], [[Math.cos(0.3), Math.sin(0.3)]], [6, 0], angle), all = [[0, 0] as P, ...s];
    for (let k = 1; k + 1 < all.length; k++) assert.equal(angleAt(all[k - 1], all[k], all[k + 1]), angle, `snake angle ${angle}`);
  }
  // From a chain end, the first bond is at the chain angle to the bond there.
  const end = sprout(EMPTY, [0, 0]), first = chainPoints(end, 1, [5, 3], 1, 110)[0];
  assert.equal(angleAt(pos(end, 0), pos(end, 1), first), 110);
  console.log("bondchain.check: chain angle ok");
}
