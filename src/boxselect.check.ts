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
// An atom on the edge of the selection keeps its marks in the frame: a radical ion on the middle carbon of propane,
// with the first two carbons selected.
const propane = { ...sprout(sprout(EMPTY, [0, 0]), 1) };
propane.atoms = propane.atoms.map((a, i) => (i === 1 ? { ...a, charge: -1, radical: 1 } : a));
const dp = render(propane, S, ink, S.bond), marks = dp.electrons.filter((e) => e.atom === 1);
assert.ok(marks.length, "the radical ion has marks");
const edge = inkOfAtoms(propane, dp.ink, dp.label, [0, 1], k, dp.electrons)!;
for (const { at: [x, y] } of marks) assert.ok(x >= edge[0] && x <= edge[2] && y >= edge[1] && y <= edge[3], "the frame holds the edge atom's marks");
// The box for one structure looks only at its own bonds: on a page of 400 more rings it takes about as long.
{
  let page = { ...butane };
  const ring = sprout(sprout(sprout(sprout(sprout(EMPTY, [0, 0]), 1), 2), 3), 4);
  const n = butane.atoms.length, many = { ...butane, atoms: [...butane.atoms], bonds: [...butane.bonds] };
  for (let r = 0; r < 400; r++) {
    const o = many.atoms.length;
    many.atoms.push(...ring.atoms.map((a) => ({ ...a, location: [a.location[0] + 3 * (r % 20) + 10, a.location[1] + 3 * Math.floor(r / 20), 0] as [number, number, number] })));
    many.bonds.push(...ring.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + o, b.atoms[1] + o] as [number, number] })));
  }
  page = many;
  const dm = render(page, S, ink, S.bond), time = (m: typeof butane, dd: typeof d) => {
    const t = performance.now();
    for (let j = 0; j < 400; j++) inkOfAtoms(m, dd.ink, dd.label, [0, 1, 2], k, dd.electrons);
    return performance.now() - t;
  };
  for (let w = 0; w < 3; w++) { time(butane, d); time(page, dm); }
  const small = Math.min(...[0, 1, 2].map(() => time(butane, d))), big = Math.min(...[0, 1, 2].map(() => time(page, dm)));
  assert.ok(big < 5 * small + 5, `the box for part of one structure takes ${big.toFixed(1)} ms on a big page against ${small.toFixed(1)} ms alone`);
  assert.equal(page.atoms.length, n + 400 * ring.atoms.length);
}
console.log("boxselect.check: frame round part of a structure ok");

// The editor's box and lasso use this rule.
const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
assert.match(editor, /case "box": \{[^]*?chooseArea\(atomsInArea\(doc, drag\.base, within\)/);
assert.match(editor, /case "lasso": \{[^]*?chooseArea\(atomsInArea\(doc, drag\.base, \(q\) => inPolygon\(q, points\)\)/);
assert.match(editor, /const withCaptions = [^]*?inkOfAtoms\(shown, drawing\.ink, drawing\.label, set, L, drawing\.electrons\)/);
// Alt (Option) at the press swaps the box and the lasso, as ChemDraw's Alt; Structure perspective keeps the box. Every
// tool's hold that turns into an area goes through startArea. On Windows and Linux Alt is a copy key too: a press on
// the selection copies before pressSelect reaches startArea.
assert.match(editor, /function startArea[^]*?if \(selectKind === "lasso" \? !pressAlt\.current : selectKind === "box" && pressAlt\.current\) setDrag\(\{ kind: "lasso"/);
assert.match(editor, /pressAlt\.current = e\.altKey;[^]*?const copy = copyDrag\(e\)/);
assert.match(editor, /function pressSelect[^]*?onSelection\(doc, selection, p\)\) return startMove\(p, screen, t, picked, selection, copy\)[^]*?startArea\(p, t, base, picks\);\n  \}/);
assert.ok(editor.match(/startArea\(/g)!.length === 3, "startArea: the Select press and the hold of every other tool");
console.log("boxselect.check: editor ok");
