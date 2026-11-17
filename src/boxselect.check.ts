// Run: node src/boxselect.check.ts. A selection box or lasso selects only the atoms inside it, as ChemDraw's Marquee
// and Lasso (issue #162), and the selection's frame holds only what is selected.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMPTY, atomsInArea, inkOfAtoms, inPolygon, pos, setLabel, sprout, type P } from "./edit.ts";
import { render, type Ink } from "./render.ts";

// Butane as a zig-zag: atoms 0, 1, 2, 3 left to right.
const butane = sprout(sprout(sprout(EMPTY, [0, 0]), 1), 2);
const xs = butane.atoms.map((_, i) => pos(butane, i)[0]);
assert.ok(xs[0] < xs[1] && xs[1] < xs[2] && xs[2] < xs[3]);
const box = (lo: P, hi: P) => ([x, y]: P) => x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1];
const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);

// A box round three carbons selects those three: the terminal carbon outside it stays out.
assert.deepEqual(sorted(atomsInArea(butane, new Set(), box([-1, -1], [xs[2] + 0.1, 2]))), [0, 1, 2]);
// The lasso the same.
const loop: P[] = [[-1, -1], [xs[2] + 0.1, -1], [xs[2] + 0.1, 2], [-1, 2]];
assert.deepEqual(sorted(atomsInArea(butane, new Set(), (q) => inPolygon(q, loop))), [0, 1, 2]);
// A label outside the box (R on the middle carbon) stays out too.
const withR = setLabel(sprout(butane, 1), 4, "R"), above = pos(withR, 4)[1];
assert.ok(above > pos(withR, 1)[1]);
assert.deepEqual(sorted(atomsInArea(withR, new Set(), box([-1, -1], [xs[2] + 0.1, above - 0.1]))), [0, 1, 2]);
// What is already selected (Shift) stays selected.
assert.deepEqual(sorted(atomsInArea(butane, new Set([3]), box([-1, -1], [xs[0] + 0.1, 2]))), [0, 3]);
console.log("boxselect.check: only atoms inside the box or lasso ok");

// The frame round part of a structure holds its atoms and the bonds between them, not a bond to an atom outside.
const pt = 4 / 3, S = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
const glyph: P[] = [[0, 0], [9.6, 0], [9.6, -9.5], [0, -9.5]];
const ink = (text: string): Ink => ({ width: 9.6 * text.length, ascent: 9.5, outline: glyph });
const d = render(butane, S, ink, S.bond), k = S.bond;
const part = inkOfAtoms(butane, d.ink, d.label, [0, 1, 2], k)!;
assert.ok(part[2] < xs[2] * k + S.bold, "the frame stops at the last selected atom");
assert.ok(part[0] <= xs[0] * k && part[2] >= xs[2] * k, "and holds every selected atom");
// A whole structure: the same box as its ink.
const whole = inkOfAtoms(butane, d.ink, d.label, [0, 1, 2, 3], k)!, all = d.ink.reduce((b, c) => [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[2]), Math.max(b[3], c[3])]);
assert.deepEqual(whole, all);
// Two atoms joined only to each other and to atoms outside: the bond between them.
const pair = inkOfAtoms(butane, d.ink, d.label, [1, 2], k)!;
assert.ok(pair[0] <= xs[1] * k && pair[2] >= xs[2] * k && pair[2] < xs[3] * k && pair[0] > xs[0] * k);
console.log("boxselect.check: frame round part of a structure ok");

// The editor's box and lasso use this rule.
const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
assert.match(editor, /case "box": \{[^]*?chooseArea\(atomsInArea\(doc, drag\.base, within\)/);
assert.match(editor, /case "lasso": \{[^]*?chooseArea\(atomsInArea\(doc, drag\.base, \(q\) => inPolygon\(q, points\)\)/);
assert.match(editor, /const withCaptions = [^]*?inkOfAtoms\(shown, drawing\.ink, drawing\.label, set, L\)/);
console.log("boxselect.check: editor ok");
