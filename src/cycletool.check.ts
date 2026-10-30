// Run: node src/cycletool.check.ts. The Cycle tool: a drawn circle is one arc, a click breaks it into steps, a
// structure on the circle joins it (taking a break's place), a deleted intermediate leaves a break, reagents and
// products keep their steps, and all of it survives a save.
import assert from "node:assert/strict";
import { addStop, breakAt, joinCycles, layoutCycles, removeStop, stepAt } from "./cycle.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { addCaption, addCycle, addRing, deleteAtoms, EMPTY, fragments } from "./edit.ts";
import { readOct, writeOct } from "./oct.ts";
import type { Box, Mol } from "./render.ts";

// Ink: each atom's position as a box a third of a bond across (px, y down).
const L = 30, ink = (m: Mol) => (atoms: number[]): Box | undefined => {
  const ps = atoms.map((i) => m.atoms[i].location);
  return ps.length ? [Math.min(...ps.map((p) => p[0])) * L - 5, -Math.max(...ps.map((p) => p[1])) * L - 5, Math.max(...ps.map((p) => p[0])) * L + 5, -Math.min(...ps.map((p) => p[1])) * L + 5] : undefined;
};
const arcs = (m: Mol) => layoutCycles(m, L, 1, ink(m)).arrows.filter((a) => a.kind === "curved");
const right = 0, top = Math.PI / 2, left = Math.PI, bottom = -Math.PI / 2;

// A new circle with no nodes is one arc, nearly all the way round.
let [m, id] = addCycle(EMPTY, { centre: [0, 0], radius: 3, clockwise: true, nodes: [], at: [] });
assert.equal(arcs(m).length, 1);

// Clicks break it: two breaks are two steps, and a click on a break joins it up again.
m = addStop(m, id, right, []);
m = addStop(m, id, left, []);
assert.equal(m.cycles![0].nodes.length, 2);
assert.equal(arcs(m).length, 2);
const c = () => m.cycles![0];
assert.equal(breakAt(m, c(), left + 0.02, 0.1), 1);
assert.equal(breakAt(m, c(), top, 0.1), undefined);

// Clockwise from the right-hand break, the bottom is step 0 and the top is step 1.
assert.equal(stepAt(m, c(), bottom), 0);
assert.equal(stepAt(m, c(), top), 1);

// A reagent on the top step stays on it when a break goes in on the bottom step, and moves on one when it goes in
// before it.
[m] = addCaption(m, { text: "H2", x: 0, y: 0, cycle: { cycle: id, step: 1, side: "in" } });
m = addStop(m, id, bottom, []);
assert.equal(m.captions![0].cycle!.step, 2);
m = removeStop(m, id, 1);
assert.equal(m.captions![0].cycle!.step, 1);
assert.equal(c().nodes.length, 2);

// A ring drawn on the circle near a break takes its place; one drawn on the circle elsewhere is a new node; one well
// inside the circle stays out.
m = addRing(m, 6, true, { point: [-3, 0] });
m = addRing(m, 6, true, { point: [0, 3] });
m = addRing(m, 6, true, { point: [0.5, 0.5] });
m = joinCycles(m, fragments(m));
const [ringLeft, ringTop, ringIn] = fragments(m);
assert.equal(c().nodes.length, 3);
assert.ok(c().nodes.some((n) => n.length && n.every((i) => ringLeft.includes(i))));
assert.ok(c().nodes.some((n) => n.length && n.every((i) => ringTop.includes(i))));
assert.ok(!c().nodes.flat().some((i) => ringIn.includes(i)));
assert.equal(c().nodes.filter((n) => !n.length).length, 1);

// joinCycles with moved atoms only takes in what moved.
let n = addRing(m, 6, true, { point: [3, 0.2] });
assert.equal(joinCycles(n, fragments(n), () => false).cycles![0].nodes.length, 3);
n = joinCycles(n, fragments(n), (i) => i >= m.atoms.length);
assert.equal(n.cycles![0].nodes.length, 3); // it lands on the right-hand break

// Deleting an intermediate leaves a break where it was.
const before = c().nodes.length;
m = deleteAtoms(m, new Set(ringTop));
assert.equal(c().nodes.length, before);
assert.equal(c().nodes.filter((x) => !x.length).length, 2);
assert.ok(Math.abs(c().at![c().nodes.findIndex((x, k) => !x.length && Math.abs(c().at![k] - top) < 0.2)] - top) < 0.2);

// Saved and opened again: the breaks, their angles and the reagent's step.
const back = readOct(writeOct(m, DEFAULT_STYLE)).mol, y = back.cycles![0];
assert.equal(y.nodes.length, c().nodes.length);
assert.deepEqual(y.nodes.map((x) => x.length), c().nodes.map((x) => x.length));
y.at!.forEach((a, k) => assert.ok(Math.abs(a - c().at![k]) < 1e-3));
assert.equal(back.captions!.find((x) => x.cycle)?.cycle?.step, 1);

// An empty circle is saved and opened as one.
const empty = readOct(writeOct(addCycle(EMPTY, { centre: [1, 1], radius: 2, clockwise: false, nodes: [], at: [] })[0], DEFAULT_STYLE)).mol;
assert.equal(empty.cycles?.[0]?.nodes.length, 0);

console.log("cycle tool ok");
