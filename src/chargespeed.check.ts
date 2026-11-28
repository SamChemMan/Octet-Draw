// Run: node src/chargespeed.check.ts. Issue 60 (R9, S18): circled charges and free charges add no slow work. An atom's
// circled charge is drawn by the same code as a free circled charge (render.ts chargeRing, chargeText), and a drawing
// with 500 numbered free charges (issue 164's free symbols with count) draws, saves and opens inside its budget,
// growing with its size, not its square.
// The budgets are in milliseconds, about ten times what the work took on an M1 Pro on 17 November 2026, so a slower or
// busy machine passes. Growth: four times the size takes under ten times as long (perf.check.ts). Render against
// Octet 1.1.2's renderer, interleaved, was measured for the report (40 paclitaxels and a 500-residue peptide, with and
// without charges): within noise.
import assert from "node:assert/strict";
import { DEFAULT_STYLE, frameStyle } from "./docstyle.ts";
import { EMPTY, addShape } from "./edit.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { parse, serialize } from "./file.ts";
import { chargeKind, freeSymbol, render, shapeInk, symbolNumber, type Mol, type P } from "./render.ts";

// One run's time: the best of five batches of 10 ms or more, after a warm-up, counting processor time when it is less
// (as chartspeed.check.ts), so the time a busy machine gives to other work does not count.
function time(f: () => unknown, batches = 5): number {
  for (let n = 0, t0 = performance.now(); n < 3 || performance.now() - t0 < 30; n++) f();
  let best = Infinity;
  for (let k = 0; k < batches; k++) {
    let n = 0;
    const used = process.cpuUsage(), t0 = performance.now();
    do { f(); n++; } while (performance.now() - t0 < 10);
    const took = performance.now() - t0, cpu = process.cpuUsage(used);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    best = Math.min(best, (cpuMs > 0 ? Math.min(took, cpuMs) : took) / n);
  }
  return best;
}
const within = (name: string, ms: number, budget: number) => assert.ok(ms < budget, `${name}: ${ms.toFixed(2)} ms, over its ${budget} ms budget`);
const grows = (name: string, small: number, big: number) => assert.ok(big < 10 * small, `${name}: 4 times the size took ${(big / small).toFixed(1)} times as long`);

// n rings in a grid, each with an N and an O labelled, charged, half of them circled, a charge of 2 on some.
function charged(n: number): Mol {
  const atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [], cols = Math.ceil(Math.sqrt(n));
  for (let r = 0; r < n; r++) {
    const cx = (r % cols) * 4, cy = Math.floor(r / cols) * 4, base = atoms.length;
    for (let i = 0; i < 6; i++) atoms.push({ label: i === 0 ? "N" : "C", location: [cx + Math.cos((Math.PI / 3) * i + Math.PI / 6), cy + Math.sin((Math.PI / 3) * i + Math.PI / 6), 0], ...(i === 0 ? { charge: r % 3 ? 1 : 2, ...(r % 2 ? { circled: true as const } : {}) } : {}) });
    for (let i = 0; i < 6; i++) bonds.push({ type: i % 2 ? 1 : 2, atoms: [base + i, base + ((i + 1) % 6)] });
    atoms.push({ label: "O", location: [cx + 2, cy + 0.6, 0], charge: -1, ...(r % 2 ? {} : { circled: true as const }) });
    bonds.push({ type: 1, atoms: [base + 1, atoms.length - 1] });
  }
  return { atoms, bonds };
}
// n free charges in rows, every look and size of charge.
function frees(n: number): Mol {
  let m: Mol = EMPTY;
  for (let k = 0; k < n; k++) {
    const q = chargeKind(((k % 16) - 8) || 8, k % 2 === 0);
    m = addShape(m, { ...freeSymbol(q.symbol, [(k % 25) * 1.2, -Math.floor(k / 25) * 1.2], (0.75 * DEFAULT_STYLE.labelSize) / DEFAULT_STYLE.bond, q.count), ...(k % 5 ? {} : { colour: "#C42B2B" }) })[0];
  }
  return m;
}

const s = frameStyle(DEFAULT_STYLE, (14.4 * 4) / 3), box: P[] = [];
for (let i = 0; i <= 40; i++) { const f = i / 40; box.push([9.6 * f, 0], [9.6 * f, -9.5], [0, -9.5 * f], [9.6, -9.5 * f]); }
const measure = () => ({ width: 9.6, ascent: 9.5, outline: box });

// Charged atoms, plain and circled: render.
{
  const a = charged(150), b = charged(600);
  const ta = time(() => render(a, s, measure, s.bond)), tb = time(() => render(b, s, measure, s.bond), 3);
  within("render, 150 charged rings (1,050 atoms)", ta, 300);
  grows("render of charged rings", ta, tb);
  console.log(`chargespeed.check: render of 1,050 atoms with charges ${ta.toFixed(1)} ms, 4,200 ${tb.toFixed(1)} ms ok`);
}

// 500 free charges: their ink and text as the canvas draws them, and the files.
{
  const a = frees(500), b = frees(2000);
  const draw = (m: Mol) => { for (const x of m.shapes ?? []) { shapeInk(x, s, s.bond); symbolNumber(x, s.bond, measure, s.size); } };
  const ta = time(() => draw(a)), tb = time(() => draw(b));
  within("ink and text of 500 free charges", ta, 40);
  grows("ink and text of free charges", ta, tb);
  for (const [name, f, budget] of [
    ["toCdxml", (m: Mol) => toCdxml(m, DEFAULT_STYLE), 400],
    ["serialize", (m: Mol) => serialize(m), 40],
  ] as const) {
    const x = time(() => f(a), 3), y = time(() => f(b), 3);
    within(`${name}, 500 free charges`, x, budget);
    grows(`${name} of free charges`, x, y);
  }
  const xa = toCdxml(a, DEFAULT_STYLE), xb = toCdxml(b, DEFAULT_STYLE), ja = serialize(a), jb = serialize(b);
  const ra = time(() => fromCdxml(xa), 3), rb = time(() => fromCdxml(xb), 3), pa = time(() => parse(ja), 3), pb = time(() => parse(jb), 3);
  within("fromCdxml, 500 free charges", ra, 400);
  grows("fromCdxml of free charges", ra, rb);
  within("parse, 500 free charges", pa, 40);
  grows("parse of free charges", pa, pb);
  console.log(`chargespeed.check: 500 free charges drawn ${ta.toFixed(2)} ms, read from CDXML ${ra.toFixed(1)} ms, from JSON ${pa.toFixed(2)} ms ok`);
}
