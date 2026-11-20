// Run: node src/tablespeed.check.ts. Text styles in table cells (docs/plans/cell-styles.md) cost nothing in a table
// without them: a 20 by 20 Table is laid out as fast as before (Octet 1.1.3's parent commit e5af1273, whose
// tableLayout is copied below), and a .oct with one opens inside its budget. The times are medians of interleaved runs,
// so a busy machine slows both kinds of run alike; "as fast" allows measurement noise only (a quarter, and 2 µs).
import assert from "node:assert/strict";
import { cellRuns, scaleOf, tableLayout, tableRow, TABLE_PAD, type Shape } from "./render.ts";
import { formulaRuns } from "./labels.ts";
import { widthOf } from "./arial.ts";
import { parse, serialize } from "./file.ts";
import { addShape, EMPTY } from "./edit.ts";
import type { TextRun } from "./richtext.ts";

// The parent's tableLayout, as it was.
function parentLayout(sh: Shape, measure: (text: string) => number = () => 0, caption?: number) {
  const x0 = Math.min(sh.from[0], sh.to[0]), y1 = Math.max(sh.from[1], sh.to[1]);
  const cells = sh.table?.cells.length ? sh.table.cells : [[""]];
  const rows = cells.length, cols = Math.max(...cells.map((r) => r.length)), f = scaleOf(sh);
  const natural = Array.from({ length: cols }, (_, c) => Math.max(f, ...cells.map((r) => (r[c] ? (measure(r[c]) + 2 * TABLE_PAD) * f : 0))));
  const spare = Math.max(0, Math.abs(sh.to[0] - sh.from[0]) - natural.reduce((a, b) => a + b, 0)) / cols;
  const widths = natural.map((w, c) => Math.max(w, sh.table?.widths?.[c] ?? w + spare)), edges = [x0];
  for (const w of widths) edges.push(edges[edges.length - 1] + w);
  const h = Math.max(tableRow(sh, caption), Math.abs(sh.to[1] - sh.from[1]) / rows);
  const heights = Array.from({ length: rows }, (_, r) => sh.table?.heights?.[r] ?? h), tops = [y1];
  for (const v of heights) tops.push(tops[tops.length - 1] - v);
  return { x0, x1: edges[cols], y0: tops[rows], y1, rows, cols, h, widths, heights, natural, f, col: (c: number) => edges[c], row: (r: number) => tops[r] };
}
// The median time (ms) of each of two calls, run in turn many times, each run a batch of n calls.
function interleaved(a: () => unknown, b: () => unknown, runs = 101, n = 20): [number, number] {
  const ta: number[] = [], tb: number[] = [];
  for (let k = 0; k < 20; k++) { a(); b(); }
  for (let k = 0; k < runs; k++) {
    let t = performance.now(); for (let i = 0; i < n; i++) a(); ta.push((performance.now() - t) / n);
    t = performance.now(); for (let i = 0; i < n; i++) b(); tb.push((performance.now() - t) / n);
  }
  const med = (x: number[]) => x.sort((p, q) => p - q)[Math.floor(x.length / 2)];
  return [med(ta), med(tb)];
}

// A 20 by 20 Table of the text a results table has, measured as the editor measures it (each formula count at 75%).
const cells = Array.from({ length: 20 }, (_, r) => Array.from({ length: 20 }, (_, c) => (r === 0 ? `Column ${c}` : c === 0 ? String(r) : ["K2CO3", "THF", "72%", "Pd(PPh3)4", "rt, 12 h"][(r + c) % 5])));
const sh: Shape = { id: 1, kind: "table", from: [0, 0], to: [40, -16], table: { cells } };
const width = (text: string) => formulaRuns(text).reduce((w, r) => w + widthOf(r.text, r.sub ? 7.5 : 10), 0) / 14.4;
const styled = (text: string, runs?: TextRun[]) => (runs ? runs.reduce((w, r) => w + widthOf(r.text, r.script ? 7.5 : 10), 0) / 14.4 : width(text));
assert.deepEqual(tableLayout(sh, styled).widths, parentLayout(sh, width).widths, "the same layout");
{
  const [now, before] = interleaved(() => tableLayout(sh, styled, 10), () => parentLayout(sh, width, 10));
  assert.ok(now < before * 1.25 + 0.002, `a 20 by 20 Table lays out in ${now.toFixed(4)} ms, ${before.toFixed(4)} ms before`);
  console.log(`tablespeed.check: 20 by 20 Table layout ${now.toFixed(4)} ms, ${before.toFixed(4)} ms before`);
}
// Drawn: each cell looks for runs only when the table has some.
{
  const look = (x: Shape) => { let n = 0; for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) if (x.table!.runs && cellRuns(x.table, r, c)) n++; return n; };
  const [now, before] = interleaved(() => look(sh), () => { let n = 0; for (let r = 0; r < 20; r++) for (let c = 0; c < 20; c++) if (sh.table!.cells[r][c]) n++; return n; });
  assert.ok(now < before * 1.25 + 0.002, `looking for runs: ${now.toFixed(4)} ms, ${before.toFixed(4)} ms to read each cell`);
}
// With every cell styled, the layout and a save and open stay within a few milliseconds.
{
  const runs = cells.map((row) => row.map((t) => (t.length > 1 ? [{ text: t.slice(0, 1), bold: true as const }, { text: t.slice(1) }] : null)));
  const all: Shape = { ...sh, table: { cells, runs } }, file = serialize(addShape(EMPTY, all)[0]);
  const [lay, open] = interleaved(() => tableLayout(all, styled, 10), () => parse(file), 41, 2);
  assert.ok(lay < 1 && open < 10, `every cell styled: layout ${lay.toFixed(3)} ms, open ${open.toFixed(3)} ms`);
  assert.equal(parse(file).shapes![0].table!.runs!.flat().filter(Boolean).length, runs.flat().filter(Boolean).length);
  console.log(`tablespeed.check: every cell styled, layout ${lay.toFixed(3)} ms, open ${open.toFixed(3)} ms`);
}
console.log("tablespeed.check: ok");
