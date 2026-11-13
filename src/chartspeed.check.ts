// Run: node src/chartspeed.check.ts. Fails loudly if the work behind a pointer move or an edit gets slow: a page
// spectrum's resize or scale slower than Octet 1.1.2's with headroom, onTop over its budget on a drawing of 2,000
// objects, or a chart's resize, scale or Edit Data over its budget (docs/plans/charts.md). A default chart stays far
// inside a frame (16 ms), and the largest chart a file can hold stays inside 100 ms.
//
// The budgets are in milliseconds. Each is about five times what the work took on an M1 Pro on 11 November 2026, so a
// slower or busy machine passes. The checks that compare two pieces of work time both in the same run, in turn, so they
// hold on any machine and are the sharper ones.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { hydrogens, type Mol } from "./render.ts";
import { predict, readTables } from "./nmr.ts";
import type { Graph } from "./naming.ts";
import { fullRange } from "./spectrumplot.ts";
import { analyse, fromJcamp } from "./measured.ts";
import { fragments } from "./edit.ts";
import { widthOf } from "./arial.ts";
import { onTop, reorder } from "./order.ts";
import { placePlot, plotFigure, plotShift, readPlot, reframe, replot, rescale, signalKeys, traceOf, type Plot, type PlotEnv, type SpectrumPlot } from "./pageplot.ts";
import { energyOfTable, energyRoles, figureBox, MAX_AXES, MAX_PATHS, MAX_RINGS, MAX_STATES, NEW_ENERGY, NEW_RADAR, radarOfRows, radarRoles, rowsOfRadar, type EnergyChart, type EnergyTable, type RadarChart } from "./charts.ts";

type P = [number, number];
type Box = [number, number, number, number];
const env: PlotEnv = { captionSize: 10, bond: 14.4, measure: (t) => widthOf(t, 1) }, em = 10 / 14.4;
const blank: Mol = { atoms: [], bonds: [] };
const place = { origin: [0, 0] as P, scale: 1, text: 1, roles: [] as string[] };

// --- Timing -------------------------------------------------------------------------------------------------------
// One run's time: the best of five batches of 10 ms or more, after a warm-up of 30 ms and three runs or more, so the
// first slow runs do not count (as access.check.ts). A batch counts the time it took or the processor time it used,
// whichever is less, so the time a busy machine gives to other work does not count either. batches: fewer for slow work.
function time(f: () => unknown, batches = 5): number {
  for (let n = 0, t0 = performance.now(); n < Math.min(3, batches) || (batches > 3 && performance.now() - t0 < 30); n++) f();
  let best = Infinity;
  for (let k = 0; k < batches; k++) {
    let n = 0;
    const used = process.cpuUsage(), t0 = performance.now();
    do { f(); n++; } while (performance.now() - t0 < 10);
    const took = performance.now() - t0, cpu = process.cpuUsage(used);
    best = Math.min(best, Math.min(took, (cpu.user + cpu.system) / 1000) / n);
  }
  return best;
}
// Two pieces of work timed in the same run, in turn, so a busy machine slows both alike (as experiment.check.ts): the
// best time of each, which a pause in the middle of a sample does not change. runs: how many runs make one sample.
function turns(a: () => unknown, b: () => unknown, runs = 4, rounds = 15): [number, number] {
  for (let k = 0; k < 4; k++) { a(); b(); }
  const ta: number[] = [], tb: number[] = [];
  for (let r = 0; r < rounds; r++) for (const [f, out] of r % 2 ? [[a, ta] as const, [b, tb] as const] : [[b, tb] as const, [a, ta] as const]) {
    const t0 = performance.now();
    for (let k = 0; k < runs; k++) f();
    out.push((performance.now() - t0) / runs);
  }
  return [Math.min(...ta), Math.min(...tb)];
}
// Fails when a takes `most` times as long as b, or longer. A machine busy enough to stretch every sample of one of them
// gets two more goes: work that is slower is slower each time.
function under(most: number, a: () => unknown, b: () => unknown, say: (ta: number, tb: number) => string, runs = 4, rounds = 15) {
  let ta = Infinity, tb = 0;
  for (let go = 0; go < 3 && !(ta < most * tb); go++) [ta, tb] = turns(a, b, runs, rounds);
  assert.ok(ta < most * tb, say(ta, tb));
}
const ms = (t: number) => t.toFixed(t < 1 ? 3 : 1);
const within = (rows: [string, () => unknown, number][], batches?: number) => rows.map(([what, run, budget]) => {
  const t = time(run, batches);
  assert.ok(t < budget, `${what}: ${ms(t)} ms, over the budget of ${budget} ms`);
  return t;
});

// --- A figure on the page, and what the editor does to it ---------------------------------------------------------
type OnPage = { m: Mol; gid: number; p: Plot; parts: number };
function onPage(p: Plot, m: Mol = blank): OnPage {
  const [made, items] = placePlot(m, p, env), g = made.groups!.find((x) => x.plot && x.items.includes(items[0]))!;
  assert.deepEqual(readPlot(JSON.parse(JSON.stringify(g.plot))), g.plot, "a file can hold this record");
  return { m: made, gid: g.id, p: g.plot!, parts: items.length };
}
const plotOf = (m: Mol, gid: number) => m.groups!.find((g) => g.id === gid)!.plot!;
// A resize by a handle (Editor.tsx): each pointer move builds the figure again from the drawing as it was, at a new
// frame. Forty frames in turn, each wider and taller than the last.
const BOX: Box = [-1, -3, 15, 6];
const grown = (k: number): P => [0.25 * (k + 1), 0.05 * k];
const dragged = (x: OnPage) => { let k = 0; return () => { k = (k + 1) % 40; const [w, h] = grown(k); return reframe(x.m, x.gid, BOX, [BOX[0], BOX[1], BOX[2] + w, BOX[3] + h], env); }; };
// The figure alone at the same frames: what a resize must do whatever else it does.
const figured = (x: OnPage) => { let k = 0; return () => { k = (k + 1) % 40; const [w, h] = grown(k); return plotFigure({ ...x.p, frame: [x.p.frame[0] + w, x.p.frame[1] + h] }, env); }; };
// A scale by the handles of a wider selection, or Scale…: forty sizes in turn.
const scaled = (x: OnPage) => { let k = 0; return () => { k = (k + 1) % 40; const s = 1 + 0.02 * (k + 1); return rescale(x.m, x.gid, (q) => [q[0] * s, q[1] * s], [s, s], s, env); }; };
// Each of them does its work: a timing of work not done would pass and say nothing.
function works(x: OnPage, what: string) {
  const wide = dragged(x)(), big = scaled(x)(), radar = x.p.kind === "radar";
  assert.ok(wide !== x.m && Math.abs(plotOf(wide, x.gid).frame[0] - (x.p.frame[0] + 0.5)) < 1e-9, `${what}: the resize gave a new frame`);
  assert.ok(big !== x.m && Math.abs(plotOf(big, x.gid).text - 1.04) < 1e-9 && (radar || Math.abs(plotOf(big, x.gid).frame[0] - x.p.frame[0] * 1.04) < 1e-9), `${what}: the scale gave a new frame and text`);
  assert.equal([...(wide.captions ?? []), ...(wide.arrows ?? [])].filter((c) => c.role).length, x.parts, `${what}: every part is built again`);
}

// --- Page spectra: the work Octet 1.1.2 does too ------------------------------------------------------------------
// A predicted ¹H spectrum of octane-3,5-dione and a measured one of 40,000 points (8,192 on the page), as
// pageplot.check.ts builds them.
readTables(gunzipSync(readFileSync(new URL("../data/nmr/shifts.bin.gz", import.meta.url))));
function graph(els: string[], bonds: [number, number, number][]): Graph {
  const used = els.map(() => 0);
  for (const [a, b, o] of bonds) { used[a] += o; used[b] += o; }
  return { atoms: els.map((el, i) => ({ el, charge: 0, h: hydrogens(el, 0, used[i]) })), bonds: bonds.map(([a, b, order]) => ({ a, b, order: order as 1 | 2 | 3 })) };
}
const h1 = predict(graph(["C", "C", "C", "C", "O", "C", "C", "O", "C", "C"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 2], [3, 5, 1], [5, 6, 1], [6, 7, 2], [6, 8, 1], [8, 9, 1]]), "1H")!, keys = signalKeys(h1.signals);
const predicted: SpectrumPlot = {
  kind: "predicted", nucleus: "1H", mhz: 400, solvent: "CDCl₃", solventPeaks: true, range: fullRange(h1, "1H"), frame: [14, 3.5], ...place, labels: "auto", title: "¹H NMR (400 MHz, CDCl₃), predicted", notice: true,
  signals: h1.signals.map((s, k) => ({ key: keys[k], shift: s.shift, nuclei: s.nuclei, couplings: s.couplings.map((c) => ({ j: c.j, n: c.n })), ...(s.broad ? { broad: true as const } : {}) })),
};
const N = 40000, y = new Float64Array(N), MHZ = 400, w = 0.5 / MHZ;
const lines: P[] = [[4.12 - 10.5 / MHZ, 1], [4.12 - 3.5 / MHZ, 3], [4.12 + 3.5 / MHZ, 3], [4.12 + 10.5 / MHZ, 1], [1.26 - 7 / MHZ, 1], [1.26, 2], [1.26 + 7 / MHZ, 1]];
for (let i = 0; i < N; i++) { const x = 11 - (12 * i) / (N - 1); for (const [p, h] of lines) y[i] += (h * w * w) / ((x - p) ** 2 + w * w); }
const read = fromJcamp({ title: "Check", kind: "nmr", nucleus: "1H", mhz: MHZ, solvent: "CDCl₃", xUnit: "ppm", yUnit: "", first: 11, last: -1, y }, 1);
const measured: SpectrumPlot = { kind: "measured", nucleus: "1H", mhz: MHZ, solvent: "CDCl₃", solventPeaks: false, range: [0, 8], frame: [14, 3.5], ...place, labels: "auto", title: "¹H NMR (400 MHz, CDCl₃)", notice: false, trace: traceOf(read, analyse(read), [0, 8], () => "#2F6FED") };
assert.equal(measured.trace!.x.length, 8192, "a trace of thousands of points");
const sp = onPage(predicted), sm = onPage(measured);
works(sp, "predicted spectrum");
works(sm, "measured spectrum");

// Octet 1.1.2 (release-1.1.2) on the same machine, each tree in turn: a resize took 1.0 to 1.1 ms (predicted) and 3.3
// to 3.8 ms (measured), and a scale 1.0 to 1.1 ms and 3.2 to 3.9 ms. This tree took 0.9 to 1.1 ms and 3.3 to 3.6 ms,
// and 1.0 ms and 3.3 to 3.5 ms. The budgets are 1.1.2's times with headroom for a slower machine (about five times).
const [tp, tm] = within([
  ["a predicted ¹H spectrum's resize", dragged(sp), 6], ["a measured ¹H spectrum's resize (8,192 points)", dragged(sm), 20],
  ["a predicted ¹H spectrum's scale", scaled(sp), 6], ["a measured ¹H spectrum's scale (8,192 points)", scaled(sm), 20],
]);
// A resize is its figure and the parts' bookkeeping (roles, what the user changed, the draw order). In 1.1.2 a resize
// took 1.30 to 1.35 times its figure alone (predicted) and 1.02 to 1.07 times (measured); in this tree 1.24 to 1.25
// and 1.03 to 1.08, and up to 1.43 and 1.28 here on a very busy machine. Bookkeeping that grows shows on any machine.
for (const [what, x, most] of [["predicted", sp, 1.8], ["measured", sm, 1.5]] as const) {
  under(most, dragged(x), figured(x), (whole, figure) => `a ${what} spectrum's resize: ${ms(whole)} ms, ${(whole / figure).toFixed(2)} times its figure alone (${ms(figure)} ms), over ${most} times`, what === "measured" ? 2 : 4);
}

// --- Charts: the new work -----------------------------------------------------------------------------------------
// The charts a new dialog gives (Editor.tsx applyChart), and the largest a file can hold: 60 states by 12 paths, each
// cell with a second value and a name of its own; 24 conditions with second values, on 40 rings with zones.
const table = (states: number, more = 0): EnergyTable => ({
  paths: Array.from({ length: MAX_PATHS }, (_, p) => `Path ${p + 1}`),
  rows: Array.from({ length: states }, (_, k) => [`S${k + 1}`, ...Array.from({ length: MAX_PATHS }, (_, p) => `${(((k * 37 + p * 11) % 97) - 40 + (k === 7 && p === 5 ? more : 0)).toFixed(1)} (${(((k * 17 + p * 5) % 89) - 30).toFixed(1)}) N${k}′${p}`)]),
});
const frameOf = (states: number): P => [Math.max(10, 3.4 * states + 1), 12];
const energyOf = (t: EnergyTable): EnergyChart => ({ ...NEW_ENERGY, ...energyOfTable(t)!, ...place, frame: frameOf(t.rows.length) });
const newTable = (more = 0): EnergyTable => ({ paths: ["Path 1"], rows: [["R", "0.0"], ["TS", `${80 + more}.0`], ["P", "-40.0"]] });
const conditions = (more = 0) => Array.from({ length: MAX_AXES }, (_, i) => [`Condition *${i + 1}*`, `${((i * 13) % 150) - 95 + (i === 7 ? more : 0)} (${((i * 7) % 120) - 80})`]);
const newRadar: RadarChart = { ...NEW_RADAR, ...place, frame: [10, 10] };
const newRows = (more = 0) => rowsOfRadar(newRadar).map((r, i) => (i === 2 ? [r[0], String(-60 + more)] : r));
const e0 = onPage({ ...NEW_ENERGY, paths: [{ name: "Path 1", energies: [0, 80, -40] }], ...place, frame: frameOf(NEW_ENERGY.states.length) }), r0 = onPage(newRadar);
const eMost = onPage(energyOf(table(MAX_STATES))), eHalf = onPage(energyOf(table(MAX_STATES / 2)));
const rMost = onPage({ ...newRadar, min: -100, max: 100, step: 200 / MAX_RINGS, axes: radarOfRows(conditions())! });
// On 11 November 2026 they had 21, 35, 3,626 and 132 parts.
assert.ok(e0.parts < 60 && r0.parts < 60 && eMost.parts > 3000 && eMost.parts > 1.9 * eHalf.parts && rMost.parts > 80, `the charts' parts: ${[e0.parts, r0.parts, eMost.parts, eHalf.parts, rMost.parts]}`);
for (const [what, x] of [["default energy diagram", e0], ["default sensitivity screen", r0], ["largest energy diagram", eMost], ["largest sensitivity screen", rMost]] as const) works(x, what);
// Edit Data, as the dialog's Apply does it: the table read, each part's role before as its role after, and the chart
// built again (replot builds the old figure too, to tell what the user changed). One value is new each time.
const typed = (x: OnPage, t: (more: number) => EnergyTable) => { let k = 0; return () => { k = (k % 5) + 1; const now = t(k); return replot(x.m, x.gid, energyOfTable(now, x.p as EnergyChart)!, env, { rename: energyRoles(now) }); }; };
const typedRows = (x: OnPage, rows: (more: number) => string[][]) => { let k = 0; return () => { k = (k % 5) + 1; const now = rows(k); return replot(x.m, x.gid, { axes: radarOfRows(now)! }, env, { rename: radarRoles(now) }); }; };
const text = (m: Mol, role: string) => m.captions!.find((c) => c.role?.role === role)?.text;
assert.equal(text(typed(e0, newTable)(), "value:0:1"), "81.0", "Edit Data shows the new value");
assert.equal(text(eMost.m, "value:5:7"), "−17.0");
assert.equal(text(typed(eMost, (k) => table(MAX_STATES, k))(), "value:5:7"), "−16.0", "Edit Data shows the new value in the largest diagram");
for (const [x, rows] of [[r0, newRows], [rMost, conditions]] as const) assert.notDeepEqual(typedRows(x, rows)().arrows!.find((a) => a.role?.role === "data"), x.m.arrows!.find((a) => a.role?.role === "data"), "Edit Data moves the line of values");

// What each took (ms): the default energy diagram 0.055, 0.067 and 0.089 (resize, scale, Edit Data); the default
// screen 0.13, 0.13 and 0.19; the largest energy diagram 12.6 to 14.0, 14.3 to 14.7 and 18.8 to 21.7 timed alone, and
// 16 to 18, 15 to 18 and 19 to 22 in this check's run, where every kind of figure goes through the same code; the
// largest screen 0.59, 0.64 and 0.92.
const [te0, , td0, tr0, , , teMost, , tdMost] = within([
  ["the default energy diagram's resize", dragged(e0), 0.4], ["the default energy diagram's scale", scaled(e0), 0.4], ["the default energy diagram's Edit Data", typed(e0, newTable), 0.6],
  ["the default sensitivity screen's resize", dragged(r0), 1], ["the default sensitivity screen's scale", scaled(r0), 1], ["the default sensitivity screen's Edit Data", typedRows(r0, newRows), 1.5],
  ["the largest energy diagram's resize", dragged(eMost), 100], ["the largest energy diagram's scale", scaled(eMost), 100], ["the largest energy diagram's Edit Data", typed(eMost, (k) => table(MAX_STATES, k)), 100],
  ["the largest sensitivity screen's resize", dragged(rMost), 4], ["the largest sensitivity screen's scale", scaled(rMost), 4], ["the largest sensitivity screen's Edit Data", typedRows(rMost, conditions), 6],
]);
// The dialog reads its whole table at each keystroke (0.76 ms for the largest). The editor asks whether what is picked
// is a chart (Editor.tsx pickedChart), which finds how far each chart on the page was moved (2.7 ms for the largest).
// Add places the largest diagram on an empty page in 85 to 100 ms: placePlot adds its parts one at a time, so twice the
// parts take 3.5 times as long, and on a page of 2,000 objects it takes 115 ms or more. Its budget here only stops it
// growing further.
const big = energyOf(table(MAX_STATES));
within([["the largest table read", () => energyOfTable(table(MAX_STATES), eMost.p as EnergyChart), 5], ["how far the largest energy diagram was moved", () => plotShift(eMost.m, eMost.m.groups![0]), 20]]);
within([["the largest energy diagram added", () => { const fig = plotFigure(big, env); figureBox(fig, em, env.measure); return placePlot(blank, big, env, fig); }, 500]], 2);
// A default chart's resize is quicker than a predicted spectrum's (about a fifteenth and a sixth of its time).
for (const [what, x] of [["energy diagram", e0], ["sensitivity screen", r0]] as const) {
  under(1, dragged(x), dragged(sp), (chart, spectrum) => `the default ${what}'s resize: ${ms(chart)} ms, a predicted spectrum's ${ms(spectrum)} ms`);
}
// The largest energy diagram's resize against a measured spectrum's, which 1.1.2 has too: about 4 times as long.
under(12, dragged(eMost), dragged(sm), (chart, spectrum) => `the largest energy diagram's resize: ${ms(chart)} ms, ${(chart / spectrum).toFixed(1)} times a measured spectrum's (${ms(spectrum)} ms), over 12 times`, 1, 11);
// The work grows in step with the chart: 60 states take about twice as long as 30 (2.0 to 2.2 times), never four times.
for (const [what, run] of [["resize", dragged], ["Edit Data", (x: OnPage) => typed(x, (k) => table(x === eMost ? MAX_STATES : MAX_STATES / 2, k))]] as const) {
  under(3, run(eMost), run(eHalf), (whole, half) => `the largest energy diagram's ${what}: ${ms(whole)} ms, ${(whole / half).toFixed(1)} times as long as half of it (${ms(half)} ms)`, 1, 11);
}

// --- onTop: every edit --------------------------------------------------------------------------------------------
// A drawing of 2,000 objects: 200 rings with a side group (1,400 atoms), 250 captions, 250 arrows and 100 boxes, in 200
// groups. One caption was brought to the front, so onTop has work to do. Then a spectrum and both default charts.
function large(): Mol {
  const m: Mol = { atoms: [], bonds: [], captions: [], arrows: [], shapes: [], groups: [] };
  let id = 1;
  for (let r = 0; r < 200; r++) {
    const cx = (r % 15) * 4, cy = -Math.floor(r / 15) * 4, base = m.atoms.length;
    for (let i = 0; i < 6; i++) m.atoms.push({ label: "C", location: [cx + Math.cos((Math.PI / 3) * i), cy + Math.sin((Math.PI / 3) * i), 0] });
    for (let i = 0; i < 6; i++) m.bonds.push({ type: i % 2 ? 1 : 2, atoms: [base + i, base + ((i + 1) % 6)] });
    m.atoms.push({ label: r % 2 ? "O" : "N", location: [cx + 2, cy, 0] });
    m.bonds.push({ type: 1, atoms: [base, base + 6] });
  }
  for (let k = 0; k < 250; k++) m.captions!.push({ id: id++, text: String(k + 1), x: (k % 15) * 4, y: -Math.floor(k / 15) * 4 - 1.6 });
  for (let k = 0; k < 250; k++) m.arrows!.push({ id: id++, kind: "reaction", from: [(k % 15) * 4 + 2.4, -Math.floor(k / 15) * 4], to: [(k % 15) * 4 + 3.4, -Math.floor(k / 15) * 4] });
  for (let k = 0; k < 100; k++) m.shapes!.push({ id: id++, kind: "box", from: [k, 4], to: [k + 0.8, 5] });
  for (let k = 0; k < 200; k++) m.groups!.push({ id: id++, atoms: Array.from({ length: 7 }, (_, i) => k * 7 + i), items: [m.captions![k].id, m.arrows![k].id] });
  return m;
}
const count = (m: Mol) => m.atoms.length + (m.captions?.length ?? 0) + (m.arrows?.length ?? 0) + (m.shapes?.length ?? 0);
const plain = reorder(large(), [], new Set([4]), true);
assert.ok(count(plain) === 2000 && plain.captions![3].order === 1, `${count(plain)} objects, one at the front`);
const below = (p: Plot, k: number): Plot => ({ ...p, origin: [k * 20, -80] });
const spectrumIn = onPage(below(predicted, 0), plain), page = onPage(below(newRadar, 2), onPage(below(e0.p, 1), spectrumIn.m).m).m;
const nudge = (m: Mol): Mol => ({ ...m, captions: m.captions!.map((c) => (c.id === 7 ? { ...c, x: c.x + 0.1 } : c)) });
const more = (m: Mol): Mol => ({ ...m, captions: [...m.captions!, { id: 999999, text: "new", x: 0, y: 0 }] });
const moved = nudge(page), added = more(page), resized = reframe(page, spectrumIn.gid, BOX, [BOX[0], BOX[1], BOX[2] + 20, BOX[3]], env);
// An edit that adds nothing gives the drawing back as it is; a thing added goes over the caption at the front; a
// spectrum's parts built again by a resize (some with new ids, as its labels turn) are not things added.
assert.equal(onTop(page, moved, fragments), moved);
assert.equal(onTop(page, added, fragments).captions!.find((c) => c.id === 999999)!.order, 2);
assert.ok(resized.arrows!.some((a) => !page.arrows!.some((o) => o.id === a.id)) || resized.captions!.some((c) => !page.captions!.some((o) => o.id === c.id)), "the resize made new parts");
assert.equal(onTop(page, resized, fragments), resized);
// With the largest energy diagram on the page as well.
const full = onPage(below(big, 3), page).m, fullMoved = nudge(full);
assert.equal(onTop(full, fullMoved, fragments), fullMoved);
// 1.1.2 took 0.15 to 0.16 ms for the move and 0.16 to 0.17 ms for the caption added, on a drawing of 2,000 objects
// with two spectra; this tree 0.16 and 0.17 ms. With the largest energy diagram on the page 1.1.2 took 0.47 to 0.66 ms
// and this tree 0.62 to 0.84 ms: onTop lists every figure's parts at each edit.
const [tt] = within([
  ["onTop, a caption moved among 2,000 objects", () => onTop(page, moved, fragments), 1], ["onTop, a caption added among 2,000 objects", () => onTop(page, added, fragments), 1],
  ["onTop, a spectrum resized among 2,000 objects", () => onTop(page, resized, fragments), 1], ["onTop, a caption moved beside the largest energy diagram", () => onTop(full, fullMoved, fragments), 5],
]);

console.log(`chartspeed.check: ok (resize: predicted spectrum ${ms(tp)} ms, measured ${ms(tm)} ms, default energy diagram ${ms(te0)} ms, default screen ${ms(tr0)} ms, largest energy diagram ${ms(teMost)} ms; Edit Data: default ${ms(td0)} ms, largest ${ms(tdMost)} ms; onTop on 2,000 objects ${ms(tt)} ms)`);
