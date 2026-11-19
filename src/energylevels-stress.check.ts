// Run: node src/energylevels-stress.check.ts. A stress test of the Jablonski diagram (issue 43,
// docs/plans/issue-43-energy-levels.md): every case of the plan's stress list (P1 to P42) and more of our own (N1 on),
// each one driving the real code: the record and its figure, followLevels and the chart actions as the editor's set()
// runs them, the files (.oct, CDXML, CDX, Octet's clipboard copy), Octet 1.1.2's readers on what this branch writes,
// and the MCP tools on Octet with no window. Each case runs alone, so one failure does not hide the next. The check
// lists every case that fails, with what it expected and what it got, and fails if any does.
//
// Cases that need what a plain run does not have are skipped with a reason:
//   OCTET_STRESS_CHEMDRAW=1   ChemDraw 22.2 opens our CDXML and saves it (by AppleScript, one session at a time).
//   OCTET_STRESS_URL=<url>    the dev server (npx vite --port 1465): the app in WebKit (scripts/look/webkit.swift), U1 to U8.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Arrow, Caption, Group, Mol } from "./render.ts";
import { DEFAULT_STYLE, PRESETS, type DocStyle } from "./docstyle.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { parse, serialize } from "./file.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import { widthOf } from "./arial.ts";
import { deleteGraphics, duplicateSelection, EMPTY, extractSelection, fitSizes, groupSelection, insertMol, transformParts, ungroupSelection, withCaptionAtoms } from "./edit.ts";
import { formulaCaption } from "./labels.ts";
import { chartAction, followCharts, followLeaders, followLevels, placePlot, plotShift, reframe, rescale, type PlotEnv } from "./pageplot.ts";
import { chartFigure, MAX_LEVELS, MAX_TRANSITIONS, NEW_JABLONSKI, readChart, vibGap, type JablonskiChart, type JState } from "./charts.ts";
import { chartRecord, chartsOf } from "./mcpchart.ts";

type P = [number, number];
const style: DocStyle = DEFAULT_STYLE, envOf = (s: Pick<DocStyle, "captionSize" | "bond" | "line">): PlotEnv => ({ captionSize: s.captionSize, bond: s.bond, line: s.line, measure: (t) => widthOf(t, 1) });
const env = envOf(style), em = style.captionSize / style.bond, gap = vibGap(em);
const base = { scale: 1, text: 1, roles: [] as string[] };
const chart: JablonskiChart = { ...NEW_JABLONSKI, ...base, origin: [2, -3] };
const [page] = placePlot(EMPTY, chart, env);
const gid = page.groups![0].id;

// --- Helpers: the editor's set() and what a check reads -----------------------------------------------------------
// The follow chain of the editor's set() (Editor.tsx), with the document's style.
const edit = (was: Mol, now: Mol, e = env) => followCharts(was, followLevels(was, followLeaders(was, now), e), e);
const groupOf = (m: Mol, id = gid) => m.groups?.find((x) => x.id === id);
const recordOf = (m: Mol, id = gid) => groupOf(m, id)?.plot as JablonskiChart | undefined;
const part = (m: Mol, role: string, id = gid): Arrow | undefined => { const g = groupOf(m, id); return m.arrows?.find((a) => !!g?.items.includes(a.id) && a.role?.role === role); };
const label = (m: Mol, role: string, id = gid): Caption | undefined => { const g = groupOf(m, id); return m.captions?.find((c) => !!g?.items.includes(c.id) && c.role?.role === role); };
const must = <T,>(x: T | undefined, what: string): T => { assert.ok(x !== undefined, `${what} is missing`); return x!; };
const add = (q: P, d: P): P => [q[0] + d[0], q[1] + d[1]];
const moveIds = (m: Mol, ids: number[], d: P, ends: "both" | "from" | "to" = "both"): Mol => ({ ...m,
  arrows: m.arrows?.map((a) => (ids.includes(a.id) ? { ...a, from: ends === "to" ? a.from : add(a.from, d), to: ends === "from" ? a.to : add(a.to, d) } : a)),
  captions: m.captions?.map((c) => (ids.includes(c.id) ? { ...c, x: c.x + d[0], y: c.y + d[1] } : c)) });
const idOf = (m: Mol, role: string, id = gid) => must(part(m, role, id) ?? label(m, role, id), role).id;
const act = (m: Mol, command: string, picked: number[], id = gid): Mol => { const r = chartAction(m, id, command, picked, env); assert.ok(r && "mol" in r, `${command}: ${r && "notice" in r ? r.notice : "not an action"}`); return r.mol; };
const sound = (c: JablonskiChart | undefined, what: string) => { assert.ok(c, `${what}: the record is there`); assert.ok(readChart(JSON.parse(JSON.stringify(c))), `${what}: a file can hold the record (readChart takes it)`); };
// Every transition drawn on its levels as the page shows them: its head on the line it ends on, its tail too (a wavy
// one's within a quarter of a wave along it), and each end within its level's ends.
function attached(m: Mol, what: string, id = gid) {
  const c = must(recordOf(m, id), `${what}: the record`), g = vibGap((style.captionSize * c.text) / style.bond);
  assert.ok(plotShift(m, groupOf(m, id)!), `${what}: the chart is in use`);
  c.transitions.forEach((t, i) => {
    const a = part(m, `trans:${i}`, id);
    if (!a) return;
    for (const [q, k, v, wave] of [[a.from, t.from, t.vib[0], !!a.style], [a.to, t.to, t.vib[1], false]] as const) {
      const l = must(part(m, `level:${k}`, id), `${what}: level ${k}`), y = l.from[1] + Math.min(v, c.states[k].vib) * g;
      assert.ok(Math.abs(q[1] - y) <= (wave ? 0.051 * c.text : 2e-3), `${what}: transition ${i} ends on level ${k} (${q[1].toFixed(3)} against ${y.toFixed(3)})`);
      assert.ok(q[0] >= Math.min(l.from[0], l.to[0]) - 0.06 && q[0] <= Math.max(l.from[0], l.to[0]) + 0.06, `${what}: transition ${i} lies inside level ${k}`);
    }
  });
  assert.ok(!JSON.stringify(m).includes("null"), `${what}: no NaN on the page`);
  sound(c, what);
}
// Where a transition's head is drawn (render.ts headsOf: a line's own heads are none).
const headAt = (a: Arrow): P | undefined => (a.end === "full" ? a.to : a.start === "full" ? a.from : undefined);
const plainGroup = (m: Mol) => (m.groups ?? []).length === 1 && !m.groups![0].plot;

// --- The runner ---------------------------------------------------------------------------------------------------
type Result = { id: string; title: string; state: "ok" | "failed" | "skipped"; note?: string };
const results: Result[] = [];
async function check(id: string, title: string, run: () => void | string | Promise<void | string>) {
  try {
    const skipped = await run();
    results.push(typeof skipped === "string" ? { id, title, state: "skipped", note: skipped } : { id, title, state: "ok" });
  } catch (e) {
    results.push({ id, title, state: "failed", note: e instanceof Error ? e.message.split("\n")[0] : String(e) });
  }
}
function time(f: () => unknown, n = 20): number {
  for (let k = 0; k < 3; k++) f();
  const t: number[] = [];
  for (let k = 0; k < n; k++) { const t0 = performance.now(); f(); t.push(performance.now() - t0); }
  return t.sort((a, b) => a - b)[t.length >> 1];
}

// ==================================================================================================================
// The plan's stress list
// ==================================================================================================================
await check("P1", "Empty drawing, Add: one group, one step (picked, in view and undo in the app: U1)", () => {
  // The editor's applyChart: the standard record at its own frame, placed on an empty page in one set().
  const [m, items] = placePlot(EMPTY, { ...NEW_JABLONSKI, ...base, origin: [0, 0] } as JablonskiChart, env);
  assert.equal(groupOf(m, m.groups![0].id)!.items.length, items.length, "one group holds every part");
  assert.equal(edit(EMPTY, m), m, "adding is one step: the follow changes nothing");
  attached(m, "added", m.groups![0].id);
});

const mcpReady = existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url));
const headless = mcpReady ? await import("../scripts/headless/host.ts") : undefined;
const mcp = mcpReady ? await import("./mcp.ts") : undefined;
if (headless) await headless.load();
let rpcId = 0;
const ai = (d: { host: unknown }, who = "Stress") => async (name: string, args: unknown) => JSON.parse(await mcp!.handle(JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }), () => d.host as never, "1", headless!.session(who, "stress"))) as { result?: { content: { text?: string }[]; isError?: boolean; structuredContent?: any }; error?: { message: string } };
const said = (r: Awaited<ReturnType<ReturnType<typeof ai>>>) => r.result?.content[0]?.text ?? r.error?.message ?? "";
const refused = (r: Awaited<ReturnType<ReturnType<typeof ai>>>) => !!(r.error || r.result?.isError);
const NO_MCP = "no OPSIN build (src/vendor/opsin), so Octet with no window does not load";

await check("P2", "MCP chart with no states: refused, naming states", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "P2"), call = ai(d), r = await call("draw", { kind: "chart", chart: "jablonski" });
  assert.ok(refused(r) && /states: give one state at least/.test(said(r)), said(r));
  assert.equal(d.host.doc().groups?.length ?? 0, 0, "nothing drawn");
});

await check("P3", "One state: one level, its vibrational levels and the axis; only vibrational relaxation can be added", () => {
  const one: JablonskiChart = { ...chart, states: [chart.states[0]], transitions: [] }, [m] = placePlot(EMPTY, one, env), id = m.groups![0].id;
  const fig = chartFigure(one, em);
  assert.deepEqual([fig.lines.filter((l) => l.role?.startsWith("level:")).length, fig.lines.filter((l) => l.role?.startsWith("vib:")).length, fig.lines.filter((l) => l.role === "axis").length, fig.lines.filter((l) => l.role?.startsWith("trans:")).length], [1, 3, 1, 0]);
  const lv = idOf(m, "level:0", id);
  assert.ok("mol" in chartAction(m, id, "chart.link.self", [lv], env)!, "vibrational relaxation is offered");
  assert.ok("notice" in chartAction(m, id, "chart.link.1", [lv], env)!, "no other level to link to");
});

// The largest diagram a file can hold: 24 states with 8 vibrational levels each and 64 transitions.
const bigStates: JState[] = Array.from({ length: MAX_LEVELS }, (_, k) => ({ name: k % 2 ? `T${k}` : `S${k}`, x: k === 0 ? [0, 1] : k % 2 ? [0.55, 1] : [0, 0.45], y: k / (MAX_LEVELS - 1), vib: 8 }));
const big: JablonskiChart = { ...chart, origin: [0, 0], frame: [40, 60], states: bigStates,
  transitions: Array.from({ length: MAX_TRANSITIONS }, (_, i) => { const from = (i % 23) + 1; return { from, to: 0, kind: "fluorescence" as const, label: "hν_F", x: [from % 2 ? 0.6 + 0.006 * i : 0.01 + 0.006 * i, from % 2 ? 0.6 + 0.006 * i : 0.01 + 0.006 * i] as P, vib: [0, 0] as P }; }) };
await check("P4", "24 states and 64 transitions: drawn, a level drag inside one frame; 25 states refused", async () => {
  sound(big, "the largest");
  const [m] = placePlot(EMPTY, big, env), id = m.groups![0].id, lv = idOf(m, "level:5", id);
  attached(m, "largest placed", id);
  const t = time(() => followLevels(m, moveIds(m, [lv], [0.1, 0.4]), env), 15);
  attached(followLevels(m, moveIds(m, [lv], [0.1, 0.4]), env), "largest, a level moved", id);
  assert.ok(t < 16, `a level drag frame on the largest diagram took ${t.toFixed(1)} ms (one frame is 16 ms)`);
  const over = JSON.parse(JSON.stringify(big));
  over.states.push({ name: "S99", x: [0, 0.4], y: 1, vib: 0 });
  assert.equal(readChart(over), undefined, "25 states from a file are refused");
  const fileWith25 = readOct(writeOct({ ...m, groups: m.groups!.map((g) => ({ ...g, plot: over })) }, style), true).mol;
  assert.ok(plainGroup(fileWith25), "a file's group with 25 states stays a plain group");
  if (headless) {
    const d = headless.drawing("paper", "P4"), r = await ai(d)("draw", { kind: "chart", chart: "jablonski", states: Array.from({ length: 25 }, (_, k) => ({ name: `S${k}` })) });
    assert.ok(refused(r) && /states/.test(said(r)), `25 states from the MCP: ${said(r)}`);
  }
});

const retype = (m: Mol, role: string, text: string) => edit(m, { ...m, captions: m.captions!.map((c) => (c.role?.role === role ? { ...c, text, runs: undefined } : c)) });
const roundTrip = (m: Mol) => readOct(writeOct(m, style), true).mol;
await check("P5", "Odd names (200 characters, an emoji, Arabic, a tab, a newline, empty): the record keeps what the page shows and a file still holds it", () => {
  for (const odd of ["S".repeat(200), "S1 🙂", "حالة مثارة", "a\tb", "a\nb", ""]) {
    const m = retype(page, "state:1", odd), c = must(recordOf(m), odd);
    assert.ok(Array.from(c.states[1].name).length <= 80 && !/[\t\n]/.test(c.states[1].name), `${JSON.stringify(odd.slice(0, 12))}: a sound name`);
    attached(edit(m, moveIds(m, [idOf(m, "level:1")], [0, 0.2])), `odd name ${JSON.stringify(odd.slice(0, 6))}, then S1 moved`);
    const back = roundTrip(m);
    assert.ok(back.groups?.[0].plot, `odd name ${JSON.stringify(odd.slice(0, 6))}: the chart comes back from .oct`);
  }
});

await check("P6", "All energies equal, or negative, from the MCP: levels at the foot or in order, no NaN", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "P6"), call = ai(d);
  for (const states of [[{ name: "S0", energy: 2 }, { name: "S1", energy: 2 }, { name: "T1", energy: 2 }], [{ name: "S0", energy: -5 }, { name: "S1", energy: -1.5 }, { name: "T1", energy: -3 }]]) {
    const r = await call("draw", { kind: "chart", chart: "jablonski", states });
    assert.ok(!refused(r), said(r));
  }
  assert.ok(!JSON.stringify(d.host.doc()).includes("null"), "no NaN");
  const [eq, neg] = (d.host.doc().groups ?? []).filter((g: Group) => g.plot).map((g: Group) => g.plot as JablonskiChart);
  assert.ok(eq.states.every((s) => s.y === 0) && neg.states[1].y === 1 && neg.states[0].y === 0);
});

await check("P7", "A level dragged above the top or below the foot: the frame and axis grow, no other level moves", () => {
  for (const [r, d] of [["level:1", [0, 5]], ["level:3", [0, -4]]] as const) {
    const m = edit(page, moveIds(page, [idOf(page, r)], d as P));
    attached(m, `${r} dragged ${d[1]}`);
    for (const k of [0, 1, 2, 3].filter((k) => `level:${k}` !== r)) assert.ok(Math.abs(part(m, `level:${k}`)!.from[1] - part(page, `level:${k}`)!.from[1]) < 1e-6, `level ${k} stays when ${r} moves`);
  }
});

await check("P8", "A level dragged 2000 bond lengths away stops where the frame is 1000 long", () => {
  const m = edit(page, moveIds(page, [idOf(page, "level:1")], [2000, 2000]));
  attached(m, "S1 far away");
  assert.ok(recordOf(m)!.frame.every((v) => v <= 1000));
});

await check("P9", "A level's end dragged past its other end: at least 1 em long, transitions on it", () => {
  const s1 = part(page, "level:1")!, m = edit(page, moveIds(page, [s1.id], [-(s1.to[0] - s1.from[0]) - 3, 0], "to")), l = part(m, "level:1")!;
  attached(m, "S1's end past its other end");
  assert.ok(l.to[0] - l.from[0] >= em - 1e-6 && l.from[1] === l.to[1]);
});

await check("P10", "A level dragged past another (S1 under T1): transitions follow, point the other way, kinds stay", () => {
  const m = edit(page, moveIds(page, [idOf(page, "level:1")], [0, -2.5]));
  attached(m, "S1 under T1");
  assert.deepEqual(recordOf(m)!.transitions.map((t) => t.kind), recordOf(page)!.transitions.map((t) => t.kind));
  const isc = part(m, "trans:4")!;
  assert.ok(isc.to[1] > isc.from[1], "ISC from S1 to T1 now points up");
});

await check("P11", "A transition's end dropped on another level joins it; in empty space keeps its level; on its other end's state keeps its old one", () => {
  const f = part(page, "trans:3")!, t1 = part(page, "level:3")!, s1 = part(page, "level:1")!;
  const drop = (to: P) => edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === f.id ? { ...a, to } : a)) });
  const on = drop([t1.from[0] + 1, t1.from[1] + 0.1]);
  attached(on, "F onto T1");
  assert.equal(recordOf(on)!.transitions[3].to, 3);
  const empty = drop([f.to[0] - 1, f.to[1] + 2]);
  attached(empty, "F into empty space");
  assert.equal(recordOf(empty)!.transitions[3].to, 0);
  const self = drop([s1.from[0] + 2, s1.from[1] + gap]);
  attached(self, "F onto S1");
  assert.equal(recordOf(self)!.transitions[3].to, 0);
});

await check("P12", "A transition's end dropped on a level of a second chart: not joined", () => {
  const [two, items2] = placePlot(page, { ...chart, origin: [40, -3] }, env), gid2 = two.groups!.find((x) => x.items.includes(items2[0]))!.id, other = part(two, "level:3", gid2)!, f = part(two, "trans:3")!;
  const m = edit(two, { ...two, arrows: two.arrows!.map((a) => (a.id === f.id ? { ...a, to: [other.from[0] + 1, other.from[1]] } : a)) });
  assert.equal(recordOf(m)!.transitions[3].to, 0);
  assert.deepEqual(recordOf(m, gid2), recordOf(two, gid2));
  attached(m, "the first chart");
});

// The Actions panel's Reverse as the editor runs it (Editor.tsx, arrow.reverse): from and to swap, and so do the heads.
const reversed = (a: Arrow): Arrow => ({ ...a, from: a.to, to: a.from, ...(a.start || a.end ? { start: a.end, end: a.start } : {}) });
await check("P13", "Reverse on a transition (the Actions panel's Reverse): its from and to swap, it stays on both levels, and its head is on its new to level", () => {
  const abs = part(page, "trans:0")!, m = edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === abs.id ? reversed(a) : a)) });
  attached(m, "absorption reversed");
  const t = recordOf(m)!.transitions[0], a = part(m, "trans:0")!, head = must(headAt(a), "the head");
  assert.deepEqual([t.from, t.to], [1, 0], "the record swaps from and to");
  const toLevel = part(m, `level:${t.to}`)!, fromLevel = part(m, `level:${t.from}`)!;
  assert.ok(Math.abs(head[1] - toLevel.from[1]) < Math.abs(head[1] - fromLevel.from[1]),
    `the head is drawn at ${t.from === 1 ? "S1" : "S0"} (y ${head[1].toFixed(2)}), the level the record says it comes from, not at the level it goes to (y ${toLevel.from[1].toFixed(2)}): the picture still shows S0 → S1 while the record says S1 → S0`);
});

await check("P14", "Vibrational levels from 8 to 0 with a transition on level 3; vibrational relaxation with none is not drawn, and is drawn again at 1", () => {
  const s1 = [idOf(page, "level:1")];
  let m = act(page, "chart.vib.8", s1);
  const fx = recordOf(m)!.transitions.findIndex((t) => t.to === 1);
  // A transition ending on S1's third vibrational level, then S1 down to none.
  m = { ...m, groups: m.groups!.map((g) => (g.id === gid ? { ...g, plot: { ...recordOf(m)!, transitions: recordOf(m)!.transitions.map((t, i) => (i === fx ? { ...t, vib: [t.vib[0], 3] as P } : t)) } } : g)) };
  m = act(m, "chart.vib.0", s1);
  attached(m, "S1 with none");
  assert.ok(Math.abs(part(m, `trans:${fx}`)!.to[1] - part(m, "level:1")!.from[1]) < 1e-6, "its end is on S1's own level");
  const vr = act(act(page, "chart.link.self", s1), "chart.vib.0", s1);
  assert.equal(part(vr, "trans:6"), undefined, "vibrational relaxation with no vibrational levels is not drawn");
  const back = act(vr, "chart.vib.1", s1);
  assert.ok(part(back, "trans:6") && label(back, "label:6"), "drawn again at 1, with its label");
  attached(back, "vibrational relaxation drawn again");
});

await check("P15", "Delete S0: its level, vibrational levels, name and every transition to or from it go in one step; undo brings all back", () => {
  const m = edit(page, deleteGraphics(page, new Set([idOf(page, "level:0")])));
  attached(m, "S0 deleted");
  assert.deepEqual(recordOf(m)!.states.map((s) => s.name), ["S1", "S2", "T1"]);
  assert.equal(recordOf(m)!.transitions.length, 2);
  assert.ok(!m.captions!.some((c) => c.text === "S0"));
  assert.ok(recordOf(page)!.states.length === 4 && part(page, "level:0"), "the drawing before (undo) is as it was");
});

await check("P16", "Delete every level one by one: the last takes the record; the axis and the rest stay as a plain group", () => {
  let m = page;
  for (let k = 0; k < 4; k++) { m = edit(m, deleteGraphics(m, new Set([idOf(m, "level:0")]))); if (k < 3) attached(m, `${k + 1} deleted`); }
  assert.ok(m.groups?.length === 1 && !m.groups[0].plot && m.arrows!.some((a) => a.role?.role === "axis"));
  // A plain group left: an edit to its parts is no chart's.
  const after = edit(m, moveIds(m, [m.arrows![0].id], [1, 1]));
  assert.ok(after.groups?.every((g) => !g.plot));
});

await check("P17", "Cut a level, then paste: the cut is a delete; the paste is a plain line; undo twice restores", () => {
  const lv = idOf(page, "level:3"), clip = serialize({ ...extractSelection(page, new Set(), new Set([lv])), style }), cut = edit(page, deleteGraphics(page, new Set([lv])));
  attached(cut, "T1 cut");
  const pasted = insertMol(cut, parse(clip), [1, -1]), done = edit(cut, pasted.mol);
  const line = done.arrows!.find((a) => pasted.items.has(a.id))!;
  assert.ok(line && !line.role && !(done.groups ?? []).some((g) => g.items.includes(line.id)), "a plain line, in no group");
  assert.deepEqual(recordOf(done), recordOf(cut), "the paste changes no record");
});

await check("P18", "⌘A then Delete: the whole chart goes, nothing follows", () => {
  const all = new Set([...page.arrows!, ...page.captions!].map((x) => x.id)), m = edit(page, deleteGraphics(page, all));
  assert.ok(!(m.arrows ?? []).length && !(m.captions ?? []).length && !(m.groups ?? []).length);
});

await check("P19", "Undo and redo chain: add, move S1, ISC to IC, delete T1, add a triplet, type a label; each step one drawing, redo the same", () => {
  const steps: ((m: Mol) => Mol)[] = [
    (m) => edit(m, moveIds(m, [idOf(m, "level:1")], [0, 0.6])),
    (m) => act(m, "chart.kind.ic", [idOf(m, "trans:4")]),
    (m) => edit(m, deleteGraphics(m, new Set([idOf(m, "level:3")]))),
    (m) => act(m, "chart.add.triplet", groupOf(m)!.items),
    (m) => edit(m, { ...m, captions: m.captions!.map((c) => (c.role?.role === "label:0" ? { ...c, text: "hν_{exc}", runs: undefined } : c)) }),
  ];
  const history = [page];
  for (const s of steps) { history.push(s(history[history.length - 1])); attached(history[history.length - 1], `step ${history.length - 1}`); }
  // Redo: each step again from the drawing undo gave back makes the same drawing.
  steps.forEach((s, k) => assert.deepEqual(s(history[k]), history[k + 1], `redo of step ${k + 1}`));
  assert.equal(new Set(history.map((m) => JSON.stringify(m))).size, history.length);
});

await check("P20", "Escape during a level drag: nothing changes (the pointer in the app: U3c)", () => {
  // The drag shows followLevels(doc, working) and never calls set(); Escape drops working. The drawing is doc.
  const working = moveIds(page, [idOf(page, "level:1")], [0, 1]), shown = followLevels(page, working, env);
  assert.notDeepEqual(shown, page, "the drag shows the move");
  assert.deepEqual(recordOf(page), placePlot(EMPTY, chart, env)[0].groups![0].plot, "the drawing itself is unchanged");
});

await check("P21", "A held arrow key on a picked level (50 nudges): each follows and is under 2 ms", () => {
  let m = page;
  const lv = idOf(page, "level:3"), times: number[] = [];
  for (let k = 0; k < 50; k++) { const now = moveIds(m, [lv], [0.01, 0.02]), t0 = performance.now(); m = edit(m, now); times.push(performance.now() - t0); }
  attached(m, "50 nudges");
  const med = times.sort((a, b) => a - b)[25];
  assert.ok(med < 2, `a nudge took ${med.toFixed(2)} ms`);
});

await check("P22", "Copy the chart to a second drawing and change it there: the two charts are independent", () => {
  const clip = serialize({ ...extractSelection(page, new Set(), new Set(groupOf(page)!.items)), style }), other: Mol = { atoms: [], bonds: [], style };
  const pasted = insertMol(other, parse(clip), [3, 3]).mol, g2 = pasted.groups!.find((g) => g.plot)!.id;
  const changed = edit(pasted, moveIds(pasted, [idOf(pasted, "level:1", g2)], [0, 1]));
  attached(changed, "the copy, S1 moved", g2);
  assert.deepEqual(recordOf(page), placePlot(EMPTY, chart, env)[0].groups![0].plot, "the original is unchanged");
});

// Octet 1.1.2's own readers, from the tag (as inventory.check.ts reads an old version), in a folder of their own.
async function v112(): Promise<{ readOct: typeof readOct; readCdx: typeof readCdx; parse: typeof parse } | string> {
  const root = fileURLToPath(new URL("..", import.meta.url));
  try { execFileSync("git", ["rev-parse", "--verify", "v1.1.2^{commit}"], { cwd: root, stdio: "ignore" }); } catch { return "no tag v1.1.2 in this clone"; }
  const dir = mkdtempSync(join(tmpdir(), "octet-v112-"));
  execFileSync("sh", ["-c", `git archive v1.1.2 src package.json | tar -x -C "${dir}"`], { cwd: root });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const at = (f: string) => `file://${join(dir, "src", f)}`;
  const [o, f] = await Promise.all([import(at("oct.ts")), import(at("file.ts"))]);
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  return { readOct: o.readOct, readCdx: o.readCdx, parse: f.parse };
}
const old = await v112();
await check("P23", "Paste into Octet 1.1.2 and open our .oct, CDXML and CDX there: a plain group of the same parts", () => {
  if (typeof old === "string") return old;
  const m = edit(page, moveIds(page, [idOf(page, "level:1")], [0, 0.5])), heads = (x: Mol) => (x.arrows ?? []).filter((a) => a.end === "full" || a.start === "full" || a.kind === "reaction").length;
  for (const [how, back] of [[".oct", old.readOct(writeOct(m, style), true).mol], ["CDXML", old.readOct(toCdxml(m, style)).mol], ["CDX", old.readCdx(writeCdx(m, style)).mol], ["the clipboard", old.parse(serialize({ ...m, style }))]] as const) {
    assert.ok(plainGroup(back), `${how}: Octet 1.1.2 reads a plain group (${JSON.stringify((back.groups ?? []).map((g: Group) => !!g.plot))})`);
    assert.equal(back.arrows?.length, m.arrows!.length, `${how}: every line and arrow`);
    assert.equal(back.captions?.length, m.captions!.length, `${how}: every caption`);
    assert.equal(back.arrows!.filter((a: Arrow) => a.style === "wavy").length, m.arrows!.filter((a) => a.style === "wavy").length, `${how}: the waves`);
    assert.equal(heads(back), heads(m), `${how}: the heads`);
    assert.ok(back.captions!.every((c: Caption) => c.chemical === false || !/^[A-Z][a-z]?\d*$/.test(c.text)) && withCaptionAtoms(back, true).mol.atoms.length === 0, `${how}: S0, T1 or hν read as atoms in 1.1.2`);
  }
});

await check("P24", "ChemDraw 22.2 opens our CDXML and saves it; Octet opens that as the same picture in a plain group", () => chemdraw());

await check("P25", "Chart turned 90°: parts plain, a level dragged moves alone; turned back, the next edit reads it back", () => {
  const ids = new Set(groupOf(page)!.items), turned = transformParts(page, new Set(), ids, ([x, y]) => [-y, x]);
  const dragged = moveIds(turned, [idOf(turned, "level:1")], [0, 1]);
  assert.equal(edit(turned, dragged), dragged);
  const back = transformParts(dragged, new Set(), ids, ([x, y]) => [y, -x]), touched = edit(back, { ...back, captions: back.captions!.map((c) => (c.role?.role === "axis-title" ? { ...c, bold: true } : c)) });
  attached(touched, "turned back and touched");
});

await check("P26", "Chart flipped: as turned", () => {
  const ids = new Set(groupOf(page)!.items), flipped = transformParts(page, new Set(), ids, ([x, y]) => [-x, y]);
  const dragged = moveIds(flipped, [idOf(flipped, "level:1")], [0, 1]);
  assert.equal(edit(flipped, dragged).groups![0].plot, flipped.groups![0].plot);
  const back = transformParts(dragged, new Set(), ids, ([x, y]) => [-x, y]), touched = edit(back, { ...back, captions: back.captions!.map((c) => (c.role?.role === "axis-title" ? { ...c, italic: true } : c)) });
  attached(touched, "flipped back and touched");
});

await check("P27", "Chart grouped with a photocatalyst structure: a level moved, the outer group holds every part, the structure stays", () => {
  const withAtom = { ...page, atoms: [{ element: "C", label: "C", location: [-10, 0, 0], key: 1 } as unknown as Mol["atoms"][number]] };
  const [outer] = groupSelection(withAtom, new Set([0]), new Set(groupOf(page)!.items))!;
  const m = edit(outer, moveIds(outer, [idOf(outer, "level:1")], [0, 0.5])), og = m.groups!.find((g) => g.id !== gid)!;
  attached(m, "in an outer group");
  assert.ok(groupOf(m)!.items.every((id) => og.items.includes(id)));
  assert.deepEqual(m.atoms, outer.atoms);
});

await check("P28", "Pick as one: the chart moves whole, its record stays", () => {
  const whole = { ...page, groups: page.groups!.map((g) => ({ ...g, integral: true as const })) };
  const ids = [...whole.arrows!, ...whole.captions!].map((x) => x.id), m = edit(whole, moveIds(whole, ids, [1, 1]));
  assert.equal(recordOf(m), recordOf(whole));
});

await check("P29", "Scale to 25% and 400%: text, lines and vibrational spacing scale; transitions on their levels", () => {
  for (const k of [0.25, 4]) {
    const m = rescale(page, gid, ([x, y]) => [x * k, y * k], [k, k], k, env);
    attached(m, `scaled ${k}`);
    attached(edit(m, moveIds(m, [idOf(m, "level:1")], [0, 0.5 * k])), `scaled ${k}, then S1 moved`);
  }
});

await check("P30", "Resize by the handles to the smallest frame: levels crowd, nothing is NaN, transitions on their levels", () => {
  const tiny = reframe(page, gid, [0, 0, 15, 7], [0, 0, 0.1, 0.1], env);
  attached(tiny, "smallest frame");
  attached(edit(tiny, moveIds(tiny, [idOf(tiny, "level:1")], [0, 0.3])), "smallest frame, then S1 moved");
});

await check("P31", "Document Settings changes the caption size; the next change lays the chart out for it, and no level that was not moved moves", () => {
  // Document Settings sets the style alone (Editor.tsx onStyle): the chart is not drawn again until it is changed.
  const bigger = envOf({ ...style, captionSize: 14 }), m = followLevels(page, moveIds(page, [idOf(page, "level:1")], [0, 0.5]), bigger);
  assert.ok(Math.abs(part(m, "vib:1:1")!.from[1] - part(m, "level:1")!.from[1] - vibGap(14 / style.bond)) < 1e-6, "S1's vibrational levels at the new size");
  for (const k of [0, 2, 3]) assert.ok(Math.abs(part(m, `level:${k}`)!.from[1] - part(page, `level:${k}`)!.from[1]) < 1e-6, `level ${k} moved by ${(part(m, `level:${k}`)!.from[1] - part(page, `level:${k}`)!.from[1]).toFixed(3)} bond lengths though only S1 was dragged`);
});

await check("P32", "Dark mode: no part has a colour of its own, a chosen colour stays (drawn in the dark ink in the app: U6)", () => {
  // Every part is drawn in the document's ink (no colour of its own), so dark mode draws it in the dark ink; a colour
  // set by hand stays across a redraw.
  assert.ok([...page.arrows!, ...page.captions!].every((x) => !x.colour), "no part has a colour of its own");
  const red = { ...page, arrows: page.arrows!.map((a) => (a.role?.role === "trans:4" ? { ...a, colour: "#C42B2B" } : a)) }, m = edit(red, moveIds(red, [idOf(red, "level:1")], [0, 0.4]));
  assert.equal(part(m, "trans:4")!.colour, "#C42B2B");
});

if (!process.env.OCTET_STRESS_URL) await check("P33", "Smallest and largest zoom: end handles can be taken", () => "it runs in the app as U7: set OCTET_STRESS_URL");

await check("P34", "A hostile .oct: each record refused, each group plain, no hang", () => {
  const spoil: [string, (p: any) => void][] = [["a transition to state 99", (p) => { p.transitions[0].to = 99; }], ["absorption within one state", (p) => { p.transitions[0].to = p.transitions[0].from; }],
    ["10^6 transitions", (p) => { p.transitions = new Array(1e6).fill(p.transitions[0]); }], ["NaN", (p) => { p.states[1].y = "NaN"; }], ["a 5000 character name", (p) => { p.states[0].name = "S".repeat(5000); }],
    ["an unknown kind", (p) => { p.transitions[1].kind = "teleport"; }], ["a negative vibrational level", (p) => { p.transitions[1].vib = [-1, 0]; }], ["states not a list", (p) => { p.states = { 0: p.states[0] }; }],
    ["a transition with no x", (p) => { delete p.transitions[0].x; }], ["a level of no length", (p) => { p.states[2].x = [0.3, 0.3]; }], ["4001 roles", (p) => { p.roles = new Array(4001).fill("x"); }]];
  for (const [what, f] of spoil) {
    const plot = JSON.parse(JSON.stringify(recordOf(page)));
    f(plot);
    const bad = { ...page, groups: page.groups!.map((g) => ({ ...g, plot })) };
    let text: string;
    try { text = writeOct(bad, style); } catch { continue; } // a record too big to write is never on a page
    const t0 = performance.now(), back = readOct(text, true).mol;
    assert.ok(plainGroup(back), `${what}: the record is refused`);
    assert.ok(performance.now() - t0 < 2000, `${what}: read in ${(performance.now() - t0).toFixed(0)} ms (a hang)`);
  }
});

await check("P35", "A file whose parts disagree with the record (a level moved by another program): opens as saved, the first edit reads it back", () => {
  const moved = moveIds(page, [idOf(page, "level:3")], [0, 0.8]), opened = roundTrip(moved), og = opened.groups!.find((g) => g.plot)!;
  assert.ok(Math.abs(opened.arrows!.find((a) => a.role?.role === "level:3")!.from[1] - part(moved, "level:3")!.from[1]) < 1e-3, "opens as saved");
  const first = edit(opened, { ...opened, captions: opened.captions!.map((c) => (c.role?.role === "axis-title" ? { ...c, bold: true } : c)) });
  attached(first, "the first edit", og.id);
});

await check("P36", "MCP bad arguments: each refused naming its argument, the drawing unchanged", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "P36"), call = ai(d);
  await call("draw", { kind: "chart", chart: "jablonski", states: [{ name: "S0", energy: 0 }, { name: "S1", energy: 3 }, { name: "T1", energy: 2 }] });
  const c = (await call("read", {})).result!.structuredContent.charts[0], was = JSON.stringify(d.host.doc());
  const cases: [string, unknown, RegExp][] = [
    ["chart jablonksi", { kind: "chart", chart: "jablonksi", states: [{ name: "S0" }] }, /chart/], ["from S5", { kind: "chart", chart: "jablonski", states: [{ name: "S0" }, { name: "S1" }], transitions: [{ from: "S5", to: "S1" }] }, /from/],
    ["two S1", { kind: "chart", chart: "jablonski", states: [{ name: "S1" }, { name: "S1" }] }, /S1/], ["vib 99", { kind: "chart", chart: "jablonski", states: [{ name: "S0", vib: 99 }] }, /vib/],
    ["energy 3 eV", { kind: "chart", chart: "jablonski", states: [{ name: "S0", energy: "3 eV" }] }, /energy/]];
  for (const [what, args, words] of cases) { const r = await call("draw", args); assert.ok(refused(r) && words.test(said(r)), `${what}: ${said(r)}`); }
  for (const [what, command, ids, words] of [["kind on a level", "chart.kind.isc", [c.states[1].level], /transition/], ["vib on a transition", "chart.vib.3", [c.transitions[0].id], /level/], ["link.9", "chart.link.9", [c.states[1].level], /no such level/]] as const) {
    const r = await call("advanced", { tool: "run_command", args: { command, ids } });
    assert.ok(refused(r) && words.test(said(r)), `${what}: ${said(r)}`);
  }
  assert.equal(JSON.stringify(d.host.doc()), was, "the drawing is unchanged");
});

await check("P37", "Two AI sessions on one drawing: both changes made, one undo step each, transitions on their levels", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "P37"), a = ai(d, "A"), b = ai(d, "B");
  await a("draw", { kind: "chart", chart: "jablonski", states: [{ name: "S0", energy: 0 }, { name: "S1", energy: 3 }, { name: "T1", energy: 2 }] });
  const c = (await a("read", {})).result!.structuredContent.charts[0];
  const [ra, rb] = await Promise.all([a("change", { operations: [{ op: "move", ids: [c.states[1].level], dy: 0.8 }] }), b("advanced", { tool: "run_command", args: { command: "chart.vib.5", ids: [c.states[2].level] } })]);
  assert.ok(!refused(ra) && !refused(rb), `${said(ra)} ${said(rb)}`);
  const m = d.host.doc() as Mol, g = m.groups!.find((x) => x.plot)!;
  assert.equal((g.plot as JablonskiChart).states[2].vib, 5);
  attached(m, "two sessions", g.id);
});

await check("P38", "The user drags a level while an AI call moves another: the last change is kept, record and parts agree", () => {
  // The AI moves T1 (doc1); the user's drag began on doc0 and its working copy moves S1; the drop is set() on doc1.
  const doc1 = edit(page, moveIds(page, [idOf(page, "level:3")], [0, 0.7])), working = moveIds(page, [idOf(page, "level:1")], [0, 0.5]);
  const m = edit(doc1, working);
  attached(m, "the drag ending after the AI's move");
});

// A drawing of 40 paclitaxels (as chartspeed.check.ts), loaded once for P39 to P41.
const gl = globalThis as Record<string, unknown>;
gl.document ??= { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
gl.getComputedStyle ??= () => ({ getPropertyValue: () => "10" });
gl.window ??= globalThis;
gl.self ??= { location: { origin: "file://" } };
gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
await chem.ready;
const taxol = chem.indigoLayout("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C");
const taxols: Mol = { atoms: [], bonds: [] };
for (let k = 0; k < 40; k++) {
  const b = taxols.atoms.length;
  taxols.atoms.push(...taxol.atoms.map((a) => ({ ...a, location: [a.location[0] + 20 * (k % 8), a.location[1] + 20 * Math.floor(k / 8), 0] as [number, number, number] })));
  taxols.bonds.push(...taxol.bonds.map((x) => ({ ...x, atoms: [x.atoms[0] + b, x.atoms[1] + b] as [number, number] })));
}
const [taxolPage] = placePlot(taxols, { ...chart, origin: [0, -30] }, env), taxolGid = taxolPage.groups!.find((g) => g.plot)!.id;
await check("P39", "40 paclitaxels with one chart: a level drag frame and an edit to a structure within budget", () => {
  const lv = idOf(taxolPage, "level:1", taxolGid);
  const drag = time(() => followLevels(taxolPage, moveIds(taxolPage, [lv], [0, 0.3]), env));
  const atom = time(() => edit(taxolPage, { ...taxolPage, atoms: taxolPage.atoms.map((a, i) => (i === 7 ? { ...a, location: [a.location[0] + 0.1, a.location[1], 0] as [number, number, number] } : a)) }));
  assert.ok(drag < 1, `a level drag frame took ${drag.toFixed(2)} ms (budget 1 ms)`);
  assert.ok(atom < 0.5, `an atom moved took ${atom.toFixed(3)} ms in the follow chain`);
});

await check("P40", "A 500-residue peptide and no chart: an edit costs what it cost before", () => {
  const peptide = chem.indigoLayout("N[C@@H](C)C(=O)".repeat(500) + "O"), now = { ...peptide, atoms: peptide.atoms.map((a, i) => (i === 7 ? { ...a, location: [a.location[0] + 0.1, a.location[1], 0] as [number, number, number] } : a)) };
  const withL = time(() => followCharts(peptide, followLevels(peptide, followLeaders(peptide, now), env), env), 200), without = time(() => followCharts(peptide, followLeaders(peptide, now), env), 200);
  assert.ok(withL <= without * 1.5 + 0.002, `with followLevels ${withL.toFixed(4)} ms, without ${without.toFixed(4)} ms`);
});

await check("P41", "S0, S1, T1 and hν in the drawing: no atoms in the formula, mass, SDF or warnings", () => {
  const m = { ...taxolPage };
  assert.ok(m.captions!.every((c) => c.chemical === false && !formulaCaption(c)));
  assert.equal(withCaptionAtoms(m, true).mol.atoms.length, taxols.atoms.length, "no caption read as atoms");
  const one = chem.analyse({ ...taxol }), all = chem.analyse(withCaptionAtoms(m, true).mol);
  assert.ok(one && all && all.every((x) => x.formula === one[0].formula), "every compound is paclitaxel: no S, T or P counted");
  const sdf = chem.toSdf(withCaptionAtoms(m, true).mol);
  assert.ok(!/\bS\s+0\s+0/.test(sdf.split("$$$$").slice(-2)[0] ?? ""), "no sulfur atom from S0 in the SDF");
});

if (!process.env.OCTET_STRESS_URL) await check("P42", "Return with a Jablonski diagram picked; Edit Data… says it has no data sheet", () => "it runs in the app as U2: set OCTET_STRESS_URL");

// ==================================================================================================================
// Our own cases
// ==================================================================================================================
await check("N1", "A name of 50 emoji typed over S1 (each emoji two UTF-16 units): saved and opened again, the chart is still a chart", () => {
  const m = retype(page, "state:1", "😀".repeat(50));
  sound(recordOf(m), "50 emoji");
  assert.ok(roundTrip(m).groups?.[0].plot, "the .oct gives the chart back");
});

await check("N2", "The axis title typed as 41 math-italic letters (𝐸, astral): a file still holds the record", () => {
  const m = retype(page, "axis-title", "𝐸".repeat(41));
  sound(recordOf(m), "41 astral letters");
});

await check("N3", "Vibrational relaxation's end dragged onto another level: the record stays sound (vr stays in one state)", () => {
  const s1 = [idOf(page, "level:1")], m0 = act(page, "chart.link.self", s1), vr = part(m0, "trans:6")!, t1 = part(m0, "level:3")!;
  const m = edit(m0, { ...m0, arrows: m0.arrows!.map((a) => (a.id === vr.id ? { ...a, to: [t1.from[0] + 0.8, t1.from[1]] } : a)) }), t = recordOf(m)!.transitions[6];
  assert.ok((t.from === t.to) === (t.kind === "vr"), `the transition is ${t.kind} from state ${t.from} to state ${t.to}`);
  sound(recordOf(m), "VR dragged to T1");
  assert.ok(roundTrip(m).groups?.[0].plot, "the .oct gives the chart back");
});

await check("N4", "Document Settings caption size 10 → 14 pt, then an unrelated arrow nudged: no level moves", () => {
  const withArrow: Mol = { ...page, arrows: [...page.arrows!, { id: 999, kind: "reaction", from: [-20, 0], to: [-15, 0] } as Arrow] };
  const bigger = envOf({ ...style, captionSize: 14 }), m = edit(withArrow, moveIds(withArrow, [999], [0.1, 0]), bigger);
  for (const k of [0, 1, 2, 3]) {
    const d = part(m, `level:${k}`)!.from[1] - part(withArrow, `level:${k}`)!.from[1];
    assert.ok(Math.abs(d) < 1e-6, `level ${k} moved ${d.toFixed(3)} bond lengths when an arrow elsewhere was nudged`);
  }
});

await check("N5", "Every level with its vibrational levels and name picked and dragged up (more than half the parts): the labels and the axis go with the transitions", () => {
  const ids = [...page.arrows!.filter((a) => /^(level|vib):/.test(a.role!.role)).map((a) => a.id), ...page.captions!.filter((c) => /^state:/.test(c.role!.role)).map((c) => c.id)];
  const m = edit(page, moveIds(page, ids, [0, 1]));
  attached(m, "most parts moved");
  for (const r of ["label:0", "label:3", "label:5"]) {
    const t = Number(r.split(":")[1]), dl = label(m, r)!.y - label(page, r)!.y, dt = part(m, `trans:${t}`)!.to[1] - part(page, `trans:${t}`)!.to[1];
    assert.ok(Math.abs(dl - dt) < 1e-6, `${r} moved ${dl.toFixed(2)} while its transition moved ${dt.toFixed(2)}`);
  }
  const axis = part(m, "axis")!, top = Math.max(...m.arrows!.filter((a) => /^vib:/.test(a.role?.role ?? "")).map((a) => a.from[1]));
  assert.ok(axis.to[1] > top, `the axis (top ${axis.to[1].toFixed(2)}) reaches over the top vibrational level (${top.toFixed(2)})`);
});

await check("N6", "The four levels picked alone and scaled 20,000% (Scale…): no side of the frame over 1000, so a file still holds it", () => {
  const levels = new Set([0, 1, 2, 3].map((k) => idOf(page, `level:${k}`))), c: P = [9.5, 0.5];
  const scaled = transformParts(page, new Set(), levels, ([x, y]) => [c[0] + (x - c[0]) * 200, c[1] + (y - c[1]) * 200]);
  const m = edit(page, scaled), r = recordOf(m);
  assert.ok(r && r.frame.every((v) => v <= 1000), `the frame is ${r?.frame.map((v) => v.toFixed(0)).join(" by ")}`);
  sound(r, "scaled levels");
});

await check("N7", "30 Jablonski diagrams on a page: an edit that touches none of them costs less than one level move (1 ms)", () => {
  let m: Mol = { atoms: [], bonds: [], arrows: [{ id: 1, kind: "reaction", from: [-50, 0], to: [-45, 0] } as Arrow] };
  for (let k = 0; k < 30; k++) m = placePlot(m, { ...chart, origin: [(k % 6) * 30, Math.floor(k / 6) * 20] }, env)[0];
  const nudged = moveIds(m, [1], [0.1, 0]), t = time(() => followLevels(m, nudged, env), 30);
  assert.ok(t < 1, `an unrelated arrow nudged took ${t.toFixed(2)} ms in followLevels with 30 diagrams on the page`);
});

await check("N8", "MCP: states S0, S1, S2, T1 with no energies (the natural call): T1 lies under S1 and S1 → T1 is intersystem crossing", async () => {
  if (!headless) return NO_MCP;
  const c = chartRecord({ chart: "jablonski", states: [{ name: "S0" }, { name: "S1" }, { name: "S2" }, { name: "T1" }] }) as JablonskiChart;
  const ty = c.states[3].y, s1 = c.states[1].y, isc = c.transitions.find((t) => t.from === 1 && t.to === 3);
  assert.ok(ty < s1, `T1 is drawn at ${ty.toFixed(2)} of the frame, over S1 (${s1.toFixed(2)}) and S2 (${c.states[2].y.toFixed(2)})`);
  assert.equal(isc?.kind, "isc", `S1 → T1 is drawn as ${isc?.kind} (${isc?.label})`);
});

await check("N9", "MCP: a ground state named GS (as many papers name it): absorption up from it, fluorescence down to it", async () => {
  const c = chartRecord({ chart: "jablonski", states: [{ name: "GS", energy: 0 }, { name: "S1", energy: 3 }, { name: "T1", energy: 2 }] }) as JablonskiChart;
  const kinds = c.transitions.map((t) => `${c.states[t.from].name}→${c.states[t.to].name} ${t.kind}`);
  assert.ok(kinds.some((k) => k === "GS→S1 absorption"), `no absorption: ${kinds.join(", ")}`);
  assert.ok(kinds.some((k) => k === "S1→GS fluorescence"), `S1 → GS is not fluorescence: ${kinds.join(", ")}`);
});

await check("N10", "MCP: vibrational relaxation on a state with no vibrational levels is refused, as the Actions panel refuses it", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "N10"), r = await ai(d)("draw", { kind: "chart", chart: "jablonski", states: [{ name: "S0", vib: 0 }, { name: "S1" }], transitions: [{ from: "S0", to: "S0", kind: "vr" }] });
  assert.ok(refused(r), `drawn: ${said(r).split("\n")[0]}`);
});

await check("N11", "MCP draw with energies 0, 3, 4 and 2.4 eV: no label over a level or another line (the layout check is clean)", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "N11"), r = await ai(d)("draw", { kind: "chart", chart: "jablonski", states: [{ name: "S0", energy: 0 }, { name: "S1", energy: 3 }, { name: "S2", energy: 4 }, { name: "T1", energy: 2.4 }] });
  const lines = said(r).split("\n"), check = JSON.parse(lines[lines.length - 1]).check;
  const m = d.host.doc() as Mol, role = (id: string) => (id[0] === "t" ? m.captions!.find((c) => `t${c.id}` === id) : m.arrows!.find((a) => `a${a.id}` === id))?.role?.role ?? id;
  assert.ok(check === "clean", `overlaps: ${JSON.stringify(check.overlaps?.map((p: string[]) => p.map(role).join(" over ")))}`);
});

await check("N12", "Hand changes follow their transition when one before it is deleted (renumbering): colour, a moved label", () => {
  const t5 = idOf(page, "trans:5"), l5 = idOf(page, "label:5");
  let m = edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === t5 ? { ...a, colour: "#C42B2B" } : a)) });
  m = edit(m, moveIds(m, [l5], [1, 0]));
  const x = label(m, "label:5")!.x, after = edit(m, deleteGraphics(m, new Set([idOf(m, "trans:2")])));
  attached(after, "IC deleted");
  assert.equal(part(after, "trans:4")!.colour, "#C42B2B");
  assert.ok(Math.abs(label(after, "label:4")!.x - x) < 1e-6 && label(after, "label:4")!.id === l5);
});

await check("N13", "Turned 90° four times, 120° three times, 15° 24 times: in use again, and a level move moves only its own parts", () => {
  const ids = new Set(groupOf(page)!.items);
  for (const [n, a] of [[4, Math.PI / 2], [3, (2 * Math.PI) / 3], [24, Math.PI / 12]] as const) {
    let m = page;
    for (let k = 0; k < n; k++) m = transformParts(m, new Set(), ids, ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
    const moved = edit(m, moveIds(m, [idOf(m, "level:3")], [0, 0.5]));
    attached(moved, `${n} turns`);
    const changed = page.arrows!.filter((x) => { const y = moved.arrows!.find((z) => z.id === x.id)!; return Math.hypot(y.from[0] - x.from[0], y.from[1] - x.from[1]) + Math.hypot(y.to[0] - x.to[0], y.to[1] - x.to[1]) > 0.01; }).map((x) => x.role!.role).sort();
    assert.deepEqual(changed, ["level:3", "trans:4", "trans:5", "vib:3:1", "vib:3:2", "vib:3:3"].sort(), `${n} turns: ${changed.join(" ")}`);
  }
});

await check("N14", "Pasted from an ACS drawing into an RSC drawing (7 pt text, 12.2 pt bonds): a level moved there, the others stay", () => {
  const rsc = { ...style, ...PRESETS.RSC }, clip = serialize({ ...extractSelection(page, new Set(), new Set(groupOf(page)!.items)), style });
  const add = parse(clip), dest: Mol = { atoms: [], bonds: [], style: rsc }, pasted = insertMol(dest, add.style ? fitSizes(add, add.style, rsc) : add, [0, 0]).mol, g2 = pasted.groups!.find((g) => g.plot)!.id;
  const m = edit(pasted, moveIds(pasted, [idOf(pasted, "level:1", g2)], [0, 0.4]), envOf(rsc));
  for (const k of [0, 2, 3]) assert.ok(Math.abs(part(m, `level:${k}`, g2)!.from[1] - part(pasted, `level:${k}`, g2)!.from[1]) < 1e-6, `level ${k} moved`);
  sound(recordOf(m, g2), "in the RSC drawing");
});

await check("N15", "A hostile file: a sound record whose parts have stray or doubled roles (level:7, two level:1): no crash, no NaN, attached after the first edit", () => {
  const doubled = { ...page, arrows: [...page.arrows!.map((a) => (a.role?.role === "vib:2:3" ? { ...a, role: { ...a.role, role: "level:7" } } : a)), { ...part(page, "level:1")!, id: 5000, from: add(part(page, "level:1")!.from, [0, 0.2]), to: add(part(page, "level:1")!.to, [0, 0.2]) }],
    groups: page.groups!.map((g) => ({ ...g, items: [...g.items, 5000] })) };
  const opened = roundTrip(doubled), og = opened.groups!.find((g) => g.plot)!, first = edit(opened, moveIds(opened, [opened.arrows!.find((a) => a.role?.role === "level:3")!.id], [0, 0.2]));
  attached(first, "after the first edit", og.id);
});

await check("N16", "A truncated .oct and CDX at 40 places: each read refuses or gives a sound chart, none hangs", () => {
  const m = edit(page, moveIds(page, [idOf(page, "level:1")], [0, 0.5])), oct = writeOct(m, style), cdx = writeCdx(m, style);
  for (let k = 1; k <= 20; k++) {
    for (const [how, read] of [[".oct", () => readOct(oct.slice(0, Math.floor((oct.length * k) / 21)), true).mol], ["CDX", () => readCdx(cdx.slice(0, Math.floor((cdx.length * k) / 21))).mol]] as const) {
      const t0 = performance.now();
      let back: Mol | undefined;
      try { back = read(); } catch { /* refused */ }
      assert.ok(performance.now() - t0 < 2000, `${how} cut at ${k}/21: no hang`);
      for (const g of back?.groups ?? []) if (g.plot?.kind === "jablonski") sound(g.plot as JablonskiChart, `${how} cut at ${k}/21`);
    }
  }
});

await check("N17", "ChemDraw habits: ⇧⌘G Ungroup drops the record (the parts stay); ⌘D Duplicate makes a second chart; Option-drag of a level alone is a plain line, the original unchanged", () => {
  const ids = new Set(groupOf(page)!.items), un = ungroupSelection(page, new Set(), ids);
  assert.ok(!(un.groups ?? []).some((g) => g.plot) && un.arrows!.length === page.arrows!.length, "ungrouped: plain, every part kept");
  assert.equal(edit(un, moveIds(un, [page.arrows![0].id], [0, 1])).arrows!.length, page.arrows!.length);
  const dup = duplicateSelection(page, new Set(), ids);
  assert.equal(dup.mol.groups!.filter((g) => g.plot).length, 2);
  const one = duplicateSelection(page, new Set(), new Set([idOf(page, "level:1")])), copy = one.mol.arrows!.find((a) => one.items.has(a.id))!;
  const dragged = edit(page, moveIds(one.mol, [copy.id], [0, 1]));
  assert.ok(!copy.role && !(dragged.groups ?? []).some((g) => g.items.includes(copy.id)), "the copy is plain");
  assert.deepEqual(recordOf(dragged), recordOf(page), "the original chart is unchanged");
});

await check("N18", "One edit (one set()) that types a new name over S2 and moves T1: both reach the record", () => {
  const now = moveIds({ ...page, captions: page.captions!.map((c) => (c.role?.role === "state:2" ? { ...c, text: "S9", runs: undefined } : c)) }, [idOf(page, "level:3")], [0, 0.4]);
  const m = edit(page, now);
  attached(m, "a name and a move");
  assert.equal(recordOf(m)!.states[2].name, "S9", `the record's name is ${recordOf(m)!.states[2].name}`);
});

await check("N19", "MCP: a name edited to 50 emoji with change's edit: read still lists the chart after a save", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "N19"), call = ai(d);
  await call("draw", { kind: "chart", chart: "jablonski", states: [{ name: "S0", energy: 0 }, { name: "S1", energy: 3 }] });
  const c = (await call("read", {})).result!.structuredContent.charts[0];
  await call("change", { operations: [{ op: "edit", ids: [c.states[1].text], text: "😀".repeat(50) }] });
  const m = d.host.doc() as Mol, back = readOct(writeOct(m, style), true).mol;
  assert.equal(chartsOf(back).length, 1, "the chart is gone after a save and open");
});

await check("N20", "Add a singlet 30 times, then a triplet: 24 levels at most, each name new, the frame readable", () => {
  let m = page;
  for (let k = 0; k < 30; k++) { const r = chartAction(m, gid, "chart.add.singlet", groupOf(m)!.items, env)!; if ("mol" in r) m = r.mol; }
  const r = chartAction(m, gid, "chart.add.triplet", groupOf(m)!.items, env)!;
  assert.ok("notice" in r, "the 25th level is refused");
  const names = recordOf(m)!.states.map((s) => s.name);
  assert.equal(names.length, 24);
  assert.equal(new Set(names).size, names.length, `names twice: ${names.join(" ")}`);
  attached(m, "24 levels");
});

await check("N21", "A level moved while the chart is drawn at 400% then copied into a 25% drawing: the record stays in step", () => {
  const big4 = rescale(page, gid, ([x, y]) => [x * 4, y * 4], [4, 4], 4, env), moved = edit(big4, moveIds(big4, [idOf(big4, "level:2")], [0, 1.5]));
  const clip = serialize({ ...extractSelection(moved, new Set(), new Set(groupOf(moved)!.items)), style }), add = parse(clip), small = { ...style, bond: style.bond * 4, captionSize: style.captionSize };
  const there = insertMol({ atoms: [], bonds: [], style: small }, fitSizes(add, add.style ?? style, small), [0, 0]).mol, g2 = there.groups!.find((g) => g.plot)!.id;
  const m = edit(there, moveIds(there, [idOf(there, "level:1", g2)], [0, 0.2]), envOf(small));
  for (const k of [0, 2, 3]) assert.ok(Math.abs(part(m, `level:${k}`, g2)!.from[1] - part(there, `level:${k}`, g2)!.from[1]) < 1e-6, `level ${k} moved`);
});

await check("N22", "A messy 200-structure page with the chart: ⌘A then a nudge, ⌘A then Flip horizontal, and undo", () => {
  const many: Mol = { atoms: [], bonds: [] };
  for (let k = 0; k < 5; k++) { const b = many.atoms.length; many.atoms.push(...taxol.atoms.map((a) => ({ ...a, location: [a.location[0] + 20 * k, a.location[1] + 40, 0] as [number, number, number] }))); many.bonds.push(...taxol.bonds.map((x) => ({ ...x, atoms: [x.atoms[0] + b, x.atoms[1] + b] as [number, number] }))); }
  for (let k = 0; k < 195; k++) { const b = many.atoms.length; many.atoms.push({ ...taxol.atoms[0], location: [k % 20, 60 + Math.floor(k / 20), 0] }, { ...taxol.atoms[1], location: [k % 20 + 0.5, 60.8 + Math.floor(k / 20), 0] }); many.bonds.push({ ...taxol.bonds[0], atoms: [b, b + 1] }); }
  const [m0] = placePlot(many, { ...chart, origin: [0, -30] }, env), id = m0.groups!.find((g) => g.plot)!.id, all = new Set([...m0.arrows!, ...m0.captions!].map((x) => x.id)), atoms = new Set(m0.atoms.map((_, i) => i));
  const nudged = edit(m0, transformParts(m0, atoms, all, ([x, y]) => [x + 0.1, y]));
  attached(nudged, "⌘A and a nudge", id);
  assert.equal(recordOf(nudged, id), recordOf(m0, id), "moved whole: the record is not read");
  const flipped = edit(m0, transformParts(m0, atoms, all, ([x, y]) => [-x, y]));
  assert.equal(plotShift(flipped, groupOf(flipped, id)!), undefined, "flipped: the record is not in use");
  attached(edit(flipped, transformParts(flipped, atoms, all, ([x, y]) => [-x, y])), "flipped back (as undo would not need)", id);
  attached(m0, "undo gives the drawing before", id);
});

await check("N23", "A level copied with its vibrational levels and name, then pasted: every part plain, the original unchanged", () => {
  const ids = new Set([...page.arrows!, ...page.captions!].filter((x) => /^(level|vib|state):1(:|$)/.test(x.role?.role ?? "")).map((x) => x.id));
  const clip = serialize({ ...extractSelection(page, new Set(), ids), style }), pasted = insertMol(page, parse(clip), [2, 2]), m = edit(page, pasted.mol);
  assert.equal(ids.size, 5);
  assert.ok([...pasted.items].every((i) => { const x = [...m.arrows!, ...m.captions!].find((y) => y.id === i)!; return !x.role && !(m.groups ?? []).some((g) => g.items.includes(i)); }), "every pasted part is plain");
  assert.deepEqual(recordOf(m), recordOf(page));
});

await check("N24", "The chart grouped with a structure, then Ungroup once: the chart is still a chart", () => {
  const withAtom = { ...page, atoms: [{ ...taxol.atoms[0], location: [-10, 0, 0] as [number, number, number] }] };
  const [outer, oid] = groupSelection(withAtom, new Set([0]), new Set(groupOf(page)!.items))!;
  const un = ungroupSelection(outer, new Set([0]), new Set(groupOf(page)!.items));
  assert.ok(!un.groups!.some((g) => g.id === oid), "the outer group goes");
  assert.ok(recordOf(un), "the chart keeps its record");
  attached(edit(un, moveIds(un, [idOf(un, "level:1")], [0, 0.3])), "after Ungroup, S1 moved");
});

await check("N25", "A hostile record with the smallest frame and text at 100 times: placed and a level moved, nothing is NaN", () => {
  const odd: JablonskiChart = { ...chart, frame: [0.01, 0.01], text: 100 };
  sound(odd, "the odd record");
  const [m] = placePlot(EMPTY, odd, env), id = m.groups![0].id;
  assert.ok(!JSON.stringify(m).includes("null"), "placed: no NaN");
  const moved = edit(m, moveIds(m, [idOf(m, "level:1", id)], [0, 5]));
  assert.ok(!JSON.stringify(moved).includes("null"), "moved: no NaN");
  sound(recordOf(moved, id), "after the move");
});

// ==================================================================================================================
// ChemDraw 22.2 (P24) and the app in WebKit (U1 to U7)
// ==================================================================================================================
async function chemdraw(): Promise<string | void> {
  if (!process.env.OCTET_STRESS_CHEMDRAW) return "set OCTET_STRESS_CHEMDRAW=1 to run ChemDraw 22.2 by AppleScript";
  // One session drives ChemDraw at a time: the lock is a folder (OCTET_STRESS_CHEMDRAW_LOCK, else beside this tree).
  const app = "/Applications/ChemDraw 22.2.0.app", lock = process.env.OCTET_STRESS_CHEMDRAW_LOCK ?? join(fileURLToPath(new URL("../..", import.meta.url)), "chemdraw.lock");
  if (!existsSync(app)) return "no ChemDraw 22.2";
  const dir = mkdtempSync(join(tmpdir(), "octet-cd-")), name = `stress43-${process.pid}.cdxml`, src = join(dir, name), out = join(dir, `saved-${process.pid}.cdxml`);
  const m = edit(page, moveIds(page, [idOf(page, "level:1")], [0, 0.5]));
  writeFileSync(src, toCdxml(m, style));
  for (let tries = 0; ; tries++) { try { mkdirSync(lock); break; } catch { if (tries > 45) return "ChemDraw is busy (its lock stayed taken for 15 minutes)"; await new Promise((r) => setTimeout(r, 20000)); } }
  const tell = (body: string) => spawnSync("osascript", ["-e", `tell application id "com.perkinelmer.ChemDraw.22"\n${body}\nend tell`], { encoding: "utf8", timeout: 60000 });
  let opened = false;
  try {
    execFileSync("open", ["-g", "-a", app, src]);
    for (let k = 0; k < 30 && !opened; k++) { opened = tell("get name of every document").stdout.split(", ").map((x) => x.trim()).includes(name); if (!opened) await new Promise((r) => setTimeout(r, 2000)); }
    if (opened) {
      const r = tell(`save document "${name}" in (POSIX file "${out}") as "ChemDraw XML"\nclose document "${name}" saving no`);
      assert.equal(r.status, 0, `AppleScript: ${r.stderr}`);
    }
  } finally { rmSync(lock, { recursive: true, force: true }); }
  if (!opened) return "ChemDraw 22.2 did not open the file within 60 s (a dialog of its own may be up; this check does not touch its windows)";
  const back = fromCdxml(readFileSync(out, "utf8")).mol;
  rmSync(dir, { recursive: true, force: true });
  assert.ok(plainGroup(back), `ChemDraw's save comes back as one plain group (${(back.groups ?? []).length} groups)`);
  assert.equal(back.arrows!.length, m.arrows!.length, "every line and arrow");
  assert.equal(back.captions!.length, m.captions!.length, "every caption");
  assert.equal(back.arrows!.filter((a) => a.style === "wavy").length, m.arrows!.filter((a) => a.style === "wavy").length, "every wave");
  assert.equal(back.arrows!.filter((a) => a.style === "bold").length, m.arrows!.filter((a) => a.style === "bold").length, "every bold level");
  assert.equal(back.arrows!.filter((a) => headAt(a) || a.kind === "reaction").length, m.arrows!.filter((a) => headAt(a)).length, "every head");
  const subs = (x: Mol) => x.captions!.filter((c) => c.runs?.some((r) => r.script === "sub")).length;
  assert.equal(subs(back), subs(m), "every subscript");
  for (const a of m.arrows!) assert.ok(back.arrows!.some((b) => Math.hypot(b.from[0] - a.from[0], b.from[1] - a.from[1]) + Math.hypot(b.to[0] - a.to[0], b.to[1] - a.to[1]) < 0.02), `${a.role?.role} where it was`);
  assert.ok(back.captions!.every((c) => c.chemical === false) && withCaptionAtoms(back, true).mol.atoms.length === 0, "text only after ChemDraw");
}

// The app in WebKit: uiStress runs in the page (scripts/look/webkit.swift runs the body it is given), so it uses nothing
// from this file. It reads the editor's state from React's own records (the undo history, the picked set, the drawing
// shown during a drag) and drives the canvas with pointer and key events, as scripts/look/sweep.js does.
const ui = process.env.OCTET_STRESS_URL;
await check("U", "The app in WebKit: U1 to U7", async () => {
  if (!ui) return "set OCTET_STRESS_URL to the dev server (npx vite --port 1465) to drive the app in WebKit";
  if (process.platform !== "darwin" || spawnSync("which", ["swift"]).status !== 0) return "needs a Mac with Xcode's swift";
  const dir = mkdtempSync(join(tmpdir(), "octet-ui-")), script = join(dir, "stress.js");
  writeFileSync(script, `return await (${uiStress.toString()})();`);
  const run = spawnSync("swift", [fileURLToPath(new URL("../scripts/look/webkit.swift", import.meta.url)), ui, script], { encoding: "utf8", timeout: 300_000 });
  rmSync(dir, { recursive: true, force: true });
  let out: { cases: { id: string; title: string; ok: boolean; note?: string }[]; errors: string[] };
  try { out = JSON.parse(run.stdout.trim().split("\n").pop()!); } catch { throw new Error(`the WebKit run did not finish: ${run.stdout.slice(-300)}${run.stderr.slice(-300)}`); }
  for (const c of out.cases) results.push({ id: c.id, title: c.title, state: c.ok ? "ok" : "failed", note: c.note });
  assert.deepEqual(out.errors, [], "errors on the page");
});

// U8 (P32): the look sweep (scripts/look/sweep.js) in the light and the dark appearance. It picks a Jablonski diagram,
// a level and a transition, and the app's own watch measures their Actions controls. The dark run is the same WebKit
// runner with the dark appearance set.
await check("U8", "(P32) The look sweep in light and dark: the Jablonski diagram's, a level's and a transition's controls match", async () => {
  if (!ui) return "set OCTET_STRESS_URL to the dev server to run the look sweep";
  if (process.platform !== "darwin" || spawnSync("which", ["swift"]).status !== 0) return "needs a Mac with Xcode's swift";
  const dir = mkdtempSync(join(tmpdir(), "octet-look-")), runner = fileURLToPath(new URL("../scripts/look/webkit.swift", import.meta.url)), dark = join(dir, "webkit-dark.swift");
  writeFileSync(dark, readFileSync(runner, "utf8").replace("app.setActivationPolicy(.accessory)", "app.setActivationPolicy(.accessory)\napp.appearance = NSAppearance(named: .darkAqua)"));
  const sweep = join(dir, "sweep.js");
  writeFileSync(sweep, readFileSync(new URL("../scripts/look/sweep.js", import.meta.url), "utf8").replace(/return JSON\.stringify\(out\);\s*$/, "out.dark = matchMedia('(prefers-color-scheme: dark)').matches; return JSON.stringify(out);"));
  for (const [how, swift] of [["light", runner], ["dark", dark]] as const) {
    const run = spawnSync("swift", [swift, ui, sweep], { encoding: "utf8", timeout: 300_000 });
    let r: { reached: string[]; missed: string[]; look: string[]; errors: string[]; dark: boolean };
    try { r = JSON.parse(run.stdout.trim().split("\n").pop()!); } catch { throw new Error(`${how}: the sweep did not finish`); }
    assert.equal(r.dark, how === "dark", `${how}: the page's appearance`);
    for (const place of ["a Jablonski diagram", "a Jablonski diagram's level", "a Jablonski diagram's transition"]) assert.ok(r.reached.includes(place), `${how}: the sweep did not reach ${place}`);
    assert.deepEqual([...r.look, ...r.errors], [], `${how}: controls that do not match, or errors`);
  }
  rmSync(dir, { recursive: true, force: true });
});

// --- Report -------------------------------------------------------------------------------------------------------
const failed = results.filter((r) => r.state === "failed"), skipped = results.filter((r) => r.state === "skipped");
for (const r of skipped) console.log(`  skipped ${r.id} ${r.title}: ${r.note}`);
for (const r of failed) console.error(`  FAILED ${r.id} ${r.title}\n         ${r.note}`);
console.log(`energylevels-stress.check: ${results.length} cases, ${results.length - failed.length - skipped.length} ok, ${skipped.length} skipped, ${failed.length} failed${failed.length ? `: ${failed.map((r) => r.id).join(", ")}` : ""}`);
if (failed.length) process.exit(1);

// --- U1 to U7: the app in WebKit (run by the case U above) ---------------------------------------------------------
async function uiStress() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (find, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = find(); if (v) return v; await wait(100); } return null; };
  const out = { cases: [], errors: [] };
  const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  const key = (init) => { for (const t of [document.activeElement, document.body, window]) t?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init })); };
  const editorFiber = () => { const root = document.getElementById("root"), k = Object.keys(root).find((x) => x.startsWith("__reactContainer")), stack = [root[k].stateNode.current]; while (stack.length) { const f = stack.pop(); if (!f) continue; if (f.type?.name === "Editor") return f; if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); } };
  const isMol = (v) => v && typeof v === "object" && Array.isArray(v.atoms) && Array.isArray(v.bonds);
  const hookList = () => { const r = []; let h = editorFiber()?.memoizedState; while (h) { r.push(h); h = h.next; } return r; };
  const hooks = () => hookList().map((h) => h.memoizedState);
  // The undo history (history.ts): the drawing is stack[at].
  const histHook = () => hookList().find((h) => h.memoizedState && Array.isArray(h.memoizedState.stack) && typeof h.memoizedState.at === "number");
  const hist = () => histHook().memoizedState;
  const doc = () => hist().stack[hist().at];
  const picked = () => hooks().filter((v) => v instanceof Set).sort((a, b) => b.size - a.size)[0];
  const chart = (m = doc()) => m.groups?.find((x) => x.plot?.kind === "jablonski");
  const byRole = (m, role) => { const g = chart(m); return [...(m.arrows ?? []), ...(m.captions ?? [])].find((x) => g?.items.includes(x.id) && x.role?.role === role); };
  const shown = () => hooks().filter((v) => Array.isArray(v) && v.length === 2 && isMol(v[0]) && v[0] !== doc()).map((v) => v[0]);
  const world = () => document.getElementById("world");
  let L = 0;
  const toScreen = ([x, y]) => new DOMPoint(x * L, -y * L).matrixTransform(world().getScreenCTM());
  const mid = (a) => { const p = toScreen([(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2]); return [p.x, p.y]; };
  const ev = (type, [x, y], extra = {}) => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, pointerType: "mouse", isPrimary: true, ...extra }));
  const pickAlone = async (p) => { ev("pointermove", p, { buttons: 0 }); for (let k = 0; k < 2; k++) { ev("pointerdown", p); ev("pointerup", p); await wait(80); } document.elementFromPoint(...p)?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: p[0], clientY: p[1], detail: 2 })); await wait(400); };
  const drag = async (p, d, done = true) => { ev("pointermove", p, { buttons: 0 }); ev("pointerdown", p); for (let k = 1; k <= 6; k++) { ev("pointermove", [p[0] + (d[0] * k) / 6, p[1] + (d[1] * k) / 6]); await wait(40); } await wait(150); if (done) { ev("pointerup", [p[0] + d[0], p[1] + d[1]]); await wait(500); } };
  const gapOf = (m) => { const s = m.style ?? {}, c = chart(m).plot; return ((s.captionSize ?? 10) * c.text) / (s.bond ?? 14.4) / 2; };
  function off(m) {
    const c = chart(m)?.plot;
    if (!c) return "no record";
    const gap = gapOf(m);
    for (const [i, t] of c.transitions.entries()) {
      const a = byRole(m, `trans:${i}`);
      if (!a) continue;
      for (const [q, k, v, tol] of [[a.to, t.to, t.vib[1], 2e-3], [a.from, t.from, t.vib[0], a.style ? 0.06 : 2e-3]]) {
        const l = byRole(m, `level:${k}`), y = l.from[1] + Math.min(v, c.states[k].vib) * gap;
        if (Math.abs(q[1] - y) > tol) return `transition ${i} is ${(q[1] - y).toFixed(3)} off level ${k}`;
      }
    }
    return "";
  }
  const result = (id, title, ok, note) => out.cases.push({ id, title, ok: !!ok, ...(note ? { note } : {}) });
  const step = async (id, title, f) => { try { await f(); } catch (e) { result(id, title, false, `the script stopped: ${e && e.message}`); } };
  const palette = async (text) => {
    key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true });
    const find = await until(() => document.querySelector(".command-palette input"), 3000);
    if (!find) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(find, text);
    find.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(500);
    find.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    await wait(900);
    return true;
  };
  const noticeText = () => [...document.querySelectorAll(".notice, [role=status], [role=alert]")].map((n) => n.textContent.trim()).filter(Boolean).join(" | ");

  await until(() => document.querySelector(".home, .editor"));
  await wait(1200);
  button("Skip")?.click();
  await wait(900);
  document.querySelector(".home-tile.new")?.click();
  await until(() => document.querySelector(".actions .action"));
  [...document.querySelectorAll(".coach button")].find((b) => /skip/i.test(b.textContent))?.click();
  await wait(600);
  [...document.querySelectorAll(".tool")].find((t) => /^select/i.test(t.getAttribute("aria-label") ?? ""))?.click();
  await wait(300);

  await step("U1", "Add from the palette", async () => {
    const at0 = hist().at;
    await palette("Jablonski diagram");
    const g = chart(), lv = byRole(doc(), "level:0"), m = document.querySelector(".selection-marks .arrow-mark");
    if (m && lv) { const pts = m.getAttribute("points").trim().split(/\s+/).map((q) => q.split(",").map(Number)); L = (pts[pts.length - 1][0] - pts[0][0]) / (lv.to[0] - lv.from[0]); }
    const inView = g && doc().arrows.filter((a) => g.items.includes(a.id)).every((a) => [toScreen(a.from), toScreen(a.to)].every((s) => s.x >= 0 && s.x <= innerWidth && s.y >= 0 && s.y <= innerHeight));
    const pk = picked(), steps = hist().at - at0;
    key({ key: "z", code: "KeyZ", metaKey: true });
    await wait(500);
    const undone = !chart();
    key({ key: "z", code: "KeyZ", metaKey: true, shiftKey: true });
    await wait(500);
    const redone = !!chart();
    result("U1", "(P1) Add from the palette (Jablonski diagram): added, picked whole, in view, one undo step", g && pk && g.items.every((id) => pk.has(id)) && inView && steps === 1 && undone && redone && !off(doc()),
      `chart ${!!g}, picked ${pk?.size}/${g?.items.length}, in view ${inView}, steps ${steps}, undo removes it ${undone}, redo brings it ${redone}`);
  });
  await step("U2", "Return and Edit chart data", async () => {
    // Pick the whole chart again (a click on a level picks its group).
    const p = mid(byRole(doc(), "level:0"));
    ev("pointermove", p, { buttons: 0 }); ev("pointerdown", p); ev("pointerup", p); await wait(400);
    const was = doc(), pk = picked();
    key({ key: "Enter", code: "Enter" });
    await wait(600);
    const dialog = document.querySelector(".dialog, [role=dialog]"), same = doc() === was;
    await palette("Edit chart data");
    const n = noticeText();
    result("U2", "(P42) Return with the chart picked opens nothing and changes nothing; Edit chart data… says it has no data sheet", pk?.size === chart().items.length && !dialog && same && /no data sheet/.test(n), `picked ${pk?.size}, dialog ${!!dialog}, unchanged ${same}, notice "${n}"`);
  });
  await step("U3", "A level dragged", async () => {
    const s1 = byRole(doc(), "level:1"), p = mid(s1);
    await pickAlone(p);
    const pk = picked(), alone = pk?.size === 1 && pk.has(s1.id);
    const was = doc();
    await drag(p, [12, -48], false);
    const during = shown().find((m) => byRole(m, "level:1") && Math.abs(byRole(m, "level:1").from[1] - s1.from[1]) > 0.1);
    result("U3b", "During a level drag the transitions follow on screen", !!during && !off(during), during ? off(during) : "no drawing shown with S1 moved");
    key({ key: "Escape", code: "Escape" });
    await wait(300);
    ev("pointerup", [p[0] + 12, p[1] - 48]);
    await wait(400);
    result("U3c", "(P20) Escape during a level drag leaves the drawing as it was", doc() === was, `S1 at ${byRole(doc(), "level:1").from[1].toFixed(3)} (was ${s1.from[1].toFixed(3)})`);
    await drag(mid(byRole(doc(), "level:1")), [12, -48]);
    const moved = Math.abs(byRole(doc(), "level:1").from[1] - s1.from[1]) > 0.1;
    result("U3d", "A level dragged and dropped: its transitions stay on their levels", moved && !off(doc()), `moved ${moved} ${off(doc())}`);
    result("U3a", "A double-click on a level picks it alone", alone, `picked ${pk?.size}`);
    // Its end handle dragged: longer, transitions on it (during the drag too).
    const l = byRole(doc(), "level:1"), e = toScreen(l.to);
    await drag([e.x, e.y], [60, 0], false);
    const dh = shown().find((m) => byRole(m, "level:1") && byRole(m, "level:1").to[0] > l.to[0] + 0.5);
    ev("pointerup", [e.x + 60, e.y]); await wait(500);
    result("U3e", "A level's end handle dragged: during and after, it is longer and its transitions stay on it", !!dh && !off(dh) && byRole(doc(), "level:1").to[0] > l.to[0] + 0.5 && !off(doc()), `shown ${!!dh} ${dh ? off(dh) : ""}; after ${byRole(doc(), "level:1").to[0].toFixed(2)} (was ${l.to[0].toFixed(2)}) ${off(doc())}`);
  });
  await step("U4", "Arrow keys", async () => {
    const s1 = byRole(doc(), "level:1"), y0 = s1.from[1], at0 = hist().at;
    for (let k = 0; k < 10; k++) { window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", code: "ArrowUp", bubbles: true, cancelable: true })); await wait(60); }
    await wait(400);
    const y1 = byRole(doc(), "level:1").from[1];
    result("U4", "(P21) Ten Up arrow keys on a picked level (keyboard only): it moves and its transitions follow", y1 > y0 + 1e-3 && !off(doc()), `S1 ${y0.toFixed(3)} → ${y1.toFixed(3)} ${off(doc())}, steps ${hist().at - at0}`);
  });
  await step("U5", "Reverse", async () => {
    const p = mid(byRole(doc(), "trans:0"));
    await pickAlone(p);
    const rev = [...document.querySelectorAll(".actions button, .actions .action")].find((b) => /^Reverse$/.test((b.getAttribute("aria-label") ?? b.textContent).trim()));
    rev?.click();
    await wait(600);
    const c = chart(doc())?.plot, a = byRole(doc(), "trans:0"), head = a.end === "full" ? a.to : a.start === "full" ? a.from : undefined;
    const to = byRole(doc(), `level:${c.transitions[0].to}`), from = byRole(doc(), `level:${c.transitions[0].from}`);
    result("U5", "(P13) Reverse in the Actions panel on a picked transition: the head is drawn at the level the record says it goes to", !!rev && head && Math.abs(head[1] - to.from[1]) < Math.abs(head[1] - from.from[1]),
      `button ${!!rev}, record ${c.states[c.transitions[0].from].name} → ${c.states[c.transitions[0].to].name}, head at y ${head?.[1].toFixed(2)}, ${c.states[c.transitions[0].from].name} at ${from.from[1].toFixed(2)}, ${c.states[c.transitions[0].to].name} at ${to.from[1].toFixed(2)}`);
    key({ key: "z", code: "KeyZ", metaKey: true });
    await wait(400);
  });
  await step("U6", "Dark paper", async () => {
    // Each drawn line and text of the page by how light its colour is: dark (under 30% light) or white.
    const ink = () => { const n = { dark: 0, white: 0, colours: {} }; for (const el of world().querySelectorAll("path, line, polyline, text, tspan")) { if (el.closest(".selection-marks, .handle")) continue; const s = getComputedStyle(el), c = s.stroke !== "none" ? s.stroke : s.fill, v = /rgba?\((\d+), (\d+), (\d+)/.exec(c); if (!v) continue; n.colours[c] = (n.colours[c] ?? 0) + 1; const l = (+v[1] + +v[2] + +v[3]) / 765; if (l < 0.3) n.dark++; if (l > 0.97) n.white++; } return n; };
    const light = ink();
    const h = histHook();
    h.queue.dispatch({ type: "amend", mol: { ...doc(), style: { ...(doc().style ?? {}), background: "dark" } } });
    await wait(800);
    const dark = ink(), theme = world().closest("[data-theme]")?.getAttribute("data-theme");
    h.queue.dispatch({ type: "amend", mol: { ...doc(), style: { ...(doc().style ?? {}), background: "white" } } });
    await wait(500);
    result("U6", "(P32) Dark paper: every part of the chart is drawn in the dark ink, none in the light ink", theme === "dark" && dark.dark === 0 && dark.white >= light.dark && light.dark > 0, `light: ${JSON.stringify(light)}; dark (${theme}): ${JSON.stringify(dark)}`);
  });
  await step("U7", "Zoom extremes", async () => {
    const notes = [];
    let ok = true;
    for (const [dy, label] of [[400, "smallest"], [-400, "largest"]]) {
      for (let k = 0; k < 40; k++) { const q = mid(byRole(doc(), "level:1")); (document.elementFromPoint(...q) ?? world()).dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: q[0], clientY: q[1], deltaY: dy, ctrlKey: true })); await wait(30); }
      await wait(500);
      const s1 = byRole(doc(), "level:1");
      // The level in view: Fit or centre is not needed when its middle is on screen; else skip the drag part.
      const p = mid(s1), onScreen = p[0] > 0 && p[0] < innerWidth && p[1] > 0 && p[1] < innerHeight;
      if (onScreen) await pickAlone(p);
      await until(() => document.querySelectorAll("circle.handle").length, 2000);
      const hs = [...document.querySelectorAll("circle.handle")].filter((c) => !c.classList.contains("add")).map((c) => c.getBoundingClientRect().width);
      const sizes = hs.map((w) => w.toFixed(1)).join(", ");
      const adds = document.querySelectorAll("circle.handle.add").length, good = onScreen ? hs.length === 2 && adds === 0 && hs.every((w) => w >= 7.5) : true;
      if (!good) ok = false;
      notes.push(`${label} zoom ${(L * world().getScreenCTM().a / L).toFixed(3)}: S1 on screen ${onScreen}, end handles ${sizes || "none"} px, add handles ${adds}`);
      const canvas = (q) => document.elementFromPoint(q.x, q.y)?.closest("#world");
      const end = [["to", toScreen(s1.to)], ["from", toScreen(s1.from)]].find(([, q]) => canvas(q));
      if (onScreen && hs.length === 2 && !end) notes.push(`${label}: neither end of S1 is on the canvas`);
      if (onScreen && hs.length === 2 && end) {
        const [which, e] = end, was = s1[which][0];
        await drag([e.x, e.y], [which === "to" ? 30 : -30, 0]);
        const now = byRole(doc(), "level:1")[which][0];
        if (!(Math.abs(now - was) > 1e-3) || off(doc())) { ok = false; notes.push(`${label}: the end handle drag gave ${was.toFixed(3)} → ${now.toFixed(3)} ${off(doc())}`); }
      }
    }
    result("U7", "(P33) Smallest and largest zoom: a picked level has its two end handles only (D13), 8 px, and they can be dragged", ok, notes.join("; "));
  });
  out.errors = window.__errors.slice(0, 10);
  return JSON.stringify(out);
}
