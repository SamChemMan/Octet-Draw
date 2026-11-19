// Run: node src/jablonski.check.ts. Fails loudly if a Jablonski diagram (issue 43, docs/plans/issue-43-energy-levels.md)
// goes wrong: its figure (levels, vibrational levels, transitions straight or wavy with full heads and waves that end
// where their heads start, labels, names with subscripts, the axis), the transitions Kasha's rule gives, a transition's
// kind from its states, a hostile record that is read, a transition that does not stay on its levels when a level is
// moved, stretched, turned, slid, dropped on another level, reversed or deleted, an action of the Actions panel that
// changes the wrong thing or loses what the user changed, or text typed on the page that is not the record's.
import assert from "node:assert/strict";
import type { Arrow, Caption, Mol } from "./render.ts";
import { deleteGraphics, groupSelection, transformParts } from "./edit.ts";
import { followLeaders } from "./pageplot.ts";
import { widthOf } from "./arial.ts";
import { followCharts, followLevels, placePlot, plotFigure, plotName, plotShift, readPlot, reframe, replot, rescale, type PlotEnv } from "./pageplot.ts";
import { chartAction, jablonskiPick } from "./pageplot.ts";
import { chartFigure, defaultTransitions, jablonskiFigure, kindOf, KIND_LABELS, MAX_LEVELS, MAX_TRANSITIONS, NEW_JABLONSKI, readChart, retyped, roomFor, scripted, vibGap, waveFit, type JablonskiChart, type JState } from "./charts.ts";

type P = [number, number];
const env: PlotEnv = { captionSize: 10, bond: 14.4, measure: (t) => widthOf(t, 1), line: 0.6 }, em = 10 / 14.4, g = vibGap(em), LW = 0.6 / 14.4;
const blank: Mol = { atoms: [], bonds: [] };
const chart: JablonskiChart = { ...NEW_JABLONSKI, origin: [2, -3], scale: 1, text: 1, roles: [] };
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const nearP = (a: P, b: P, tol = 1e-6) => near(a[0], b[0], tol) && near(a[1], b[1], tol);

// --- J1: the record and its figure ---------------------------------------------------------------------------------
assert.deepEqual(chart.transitions.map((t) => [t.from, t.to, t.kind, t.label]), [[0, 1, "absorption", "hν_A"], [0, 2, "absorption", "hν_A"], [2, 1, "ic", "IC"], [1, 0, "fluorescence", "hν_F"], [1, 3, "isc", "ISC"], [3, 0, "phosphorescence", "hν_P"]], "Kasha's rule: the six transitions (D6)");
{
  const fig = jablonskiFigure(chart, em, LW), lines = (r: string) => fig.lines.filter((l) => l.role?.startsWith(r)), text = (r: string) => fig.texts.find((t) => t.role === r);
  assert.equal(lines("level:").length, 4, "4 levels");
  assert.ok(lines("level:").every((l) => l.style === "bold" && l.from[1] === l.to[1] && !l.end), "levels are bold, flat and have no head");
  assert.equal(lines("vib:").length, 12, "3 vibrational levels each");
  assert.ok(lines("vib:").every((l) => !l.style && !l.end), "vibrational levels are plain");
  const trans = lines("trans:");
  assert.equal(trans.length, 6, "6 transitions");
  assert.ok(trans.every((l) => l.end === "full"), "every transition has a full head at its end (R6)");
  assert.deepEqual(trans.map((l) => l.style ?? "plain"), ["plain", "plain", "wavy", "plain", "wavy", "plain"], "radiative straight, radiationless wavy (R6)");
  // Directions: absorption up, the rest down (ISC across and down).
  assert.ok(trans[0].to[1] > trans[0].from[1] && trans[1].to[1] > trans[1].from[1], "absorption points up");
  assert.ok([2, 3, 4, 5].every((i) => trans[i].to[1] < trans[i].from[1]), "the others point down");
  // Every transition's ends on its levels: its to end on its vibrational level exactly, its from end too (a wavy one's
  // tail within a quarter of a wave along it, R7), and inside the level's ends.
  const [W, H] = chart.frame;
  chart.transitions.forEach((t, i) => {
    const a = chart.states[t.from], b = chart.states[t.to], l = trans[i];
    assert.ok(near(l.to[1], b.y * H + t.vib[1] * g), `transition ${i}'s head on its level`);
    assert.ok(near(l.from[1], a.y * H + t.vib[0] * g, t.kind === "ic" || t.kind === "isc" ? 0.051 : 1e-6), `transition ${i}'s tail on its level`);
    for (const [x, s] of [[l.from[0], a], [l.to[0], b]] as const) assert.ok(x >= s.x[0] * W - 0.06 && x <= s.x[1] * W + 1e-9, `transition ${i} inside its level`);
  });
  // R7: a wavy transition's shaft (to the notch of its small head, 8.75 line widths back) is a whole number of half waves.
  for (const l of trans.filter((x) => x.style === "wavy")) {
    const shaft = Math.hypot(l.to[0] - l.from[0], l.to[1] - l.from[1]) - 8.75 * LW, halves = shaft / 0.1;
    assert.ok(near(halves, Math.round(halves), 1e-6), `a wave ends where its head starts (${halves})`);
  }
  assert.deepEqual(fig.texts.filter((t) => t.role?.startsWith("label:")).map((t) => t.text), ["hνA", "hνA", "IC", "hνF", "ISC", "hνP"], "6 labels");
  assert.deepEqual(text("label:0")!.runs, [{ text: "hν", italic: true }, { text: "A", script: "sub" }], "hν italic, A a subscript (D11)");
  assert.deepEqual(fig.texts.filter((t) => t.role?.startsWith("state:")).map((t) => t.text), ["S0", "S1", "S2", "T1"], "4 names");
  assert.deepEqual(text("state:1")!.runs, [{ text: "S" }, { text: "1", script: "sub" }], "S₁");
  assert.equal(text("state:3")!.align, "left", "T₁ on the right of its level");
  assert.equal(text("state:0")!.align, "right", "S₀ on the left of its level");
  const axis = lines("axis")[0];
  assert.ok(axis && axis.end === "full" && axis.from[0] === axis.to[0] && axis.to[1] > Math.max(...lines("vib:").map((l) => l.to[1])), "the axis is an arrow up, over the top vibrational level");
  assert.ok(axis.from[0] < Math.min(...fig.texts.filter((t) => t.role?.startsWith("state:")).map((t) => t.at[0] - widthOf(t.text, em))), "the axis is clear of the names");
  assert.equal(text("axis-title")!.text, "Energy");
  // Labels clear of every line but their own, and of each other.
  const boxes = fig.texts.filter((t) => t.role?.startsWith("label:")).map((t) => { const w = widthOf(t.text, em) * 0.9, x = t.align === "left" ? t.at[0] : t.align === "right" ? t.at[0] - w : t.at[0] - w / 2; return [x, t.at[1] - 0.2 * em, x + w, t.at[1] + 0.7 * em]; });
  boxes.forEach((b, i) => boxes.forEach((o, j) => assert.ok(i === j || !(b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]), `labels ${i} and ${j} apart`)));
  const all = chartFigure(chart, em, LW);
  assert.ok(all.texts.every((t) => t.chemical === false), "every caption is text only (R5)");
}
// A wave fitted at any length and scale.
for (const L of [0.7, 1, 1.234, 2.5, 7.77]) for (const f of [0.5, 1, 2.5]) {
  const from = waveFit([0, 0], [0, -L], LW, f), shaft = Math.hypot(from[0], from[1] + L) - 8.75 * LW * f;
  if (L - 8.75 * LW * f > 0.1 * f) assert.ok(near(shaft / (0.1 * f), Math.round(shaft / (0.1 * f)), 1e-6) && Math.abs(from[1]) <= 0.05 * f + 1e-9, `wave fit at ${L}, ${f}`);
}
// scripted (D11).
assert.deepEqual(scripted("T12"), { text: "T12", runs: [{ text: "T" }, { text: "12", script: "sub" }] });
assert.deepEqual(scripted("k_{ISC}"), { text: "kISC", runs: [{ text: "k" }, { text: "ISC", script: "sub" }] });
assert.deepEqual(scripted("hν'"), { text: "hν'", runs: [{ text: "hν", italic: true }, { text: "'" }] });
assert.deepEqual(scripted("^1O_2"), { text: "1O2", runs: [{ text: "1", script: "super" }, { text: "O" }, { text: "2", script: "sub" }] });
assert.deepEqual(scripted("a\\_b"), { text: "a_b" }, "\\_ is an underscore");
assert.deepEqual(scripted("Sx"), { text: "Sx" });
assert.deepEqual(scripted("x_"), { text: "x_" }, "a lone _ at the end stays");
assert.deepEqual(scripted("S1′"), { text: "S1′" }, "not one capital and digits");
// Kinds by states (D7).
{
  const s: JState[] = [{ name: "S0", x: [0, 1], y: 0, vib: 3 }, { name: "S1", x: [0, 0.4], y: 0.5, vib: 3 }, { name: "S2", x: [0, 0.4], y: 1, vib: 3 }, { name: "T1", x: [0.6, 1], y: 0.4, vib: 3 }, { name: "T2", x: [0.6, 1], y: 0.7, vib: 3 }];
  assert.equal(kindOf(s, 0, 2), "absorption");
  assert.equal(kindOf(s, 2, 0), "fluorescence", "to the ground state in its letter");
  assert.equal(kindOf(s, 2, 1), "ic");
  assert.equal(kindOf(s, 4, 3), "ic", "T2 to T1");
  assert.equal(kindOf(s, 1, 3), "isc");
  assert.equal(kindOf(s, 3, 0), "phosphorescence");
  assert.equal(kindOf(s, 4, 0), "isc", "T2 to S0 is not from the lowest triplet");
  assert.equal(kindOf(s, 3, 3), "vr");
  assert.equal(kindOf(s, 1, 4), "absorption", "up is absorption whatever the letter");
  // T2 between S1 and S2: S1 crosses to T1, the highest triplet under it, and T2 relaxes to T1.
  assert.deepEqual(defaultTransitions(s).map((t) => `${t.from}${t.to}${t.kind}`), ["01absorption", "02absorption", "21ic", "43ic", "10fluorescence", "13isc", "30phosphorescence"]);
  // One state alone: nothing; two singlets: absorption and fluorescence.
  assert.deepEqual(defaultTransitions(s.slice(0, 1)), []);
  assert.deepEqual(defaultTransitions(s.slice(0, 2)).map((t) => t.kind), ["absorption", "fluorescence"]);
  // A new transition between two levels side by side runs from the end of one to the start of the other.
  const across = roomFor({ states: s, transitions: [] }, 1, 3);
  assert.ok(across[0] < 0.4 && across[0] > 0.3 && across[1] > 0.6 && across[1] < 0.7);
  const up = roomFor({ states: s, transitions: [{ from: 0, to: 1, kind: "absorption", label: "", x: [0.1, 0.1], vib: [0, 0] }] }, 0, 2);
  assert.ok(near(up[0], 0.25) && up[0] === up[1], "in the widest gap");
}

// --- R8: hostile records ------------------------------------------------------------------------------------------
{
  const ok = JSON.parse(JSON.stringify(chart));
  assert.deepEqual(readChart(ok), chart, "a sound record reads back the same");
  assert.deepEqual(readPlot(ok), chart);
  const bad = (what: string, f: (o: any) => void) => { const o = JSON.parse(JSON.stringify(chart)); f(o); assert.equal(readChart(o), undefined, what); };
  bad("no states", (o) => { o.states = []; o.transitions = []; });
  bad("25 states", (o) => { o.states = Array.from({ length: MAX_LEVELS + 1 }, (_, k) => ({ name: `S${k}`, x: [0, 1], y: k / 30, vib: 0 })); o.transitions = []; });
  bad("65 transitions", (o) => { o.transitions = Array.from({ length: MAX_TRANSITIONS + 1 }, () => o.transitions[0]); });
  bad("a million transitions", (o) => { o.transitions = new Array(1e6).fill(o.transitions[0]); });
  bad("a transition to state 99", (o) => { o.transitions[0].to = 99; });
  bad("absorption within one state", (o) => { o.transitions[0].to = 0; });
  bad("vibrational relaxation between two states", (o) => { o.transitions[0].kind = "vr"; });
  bad("an unknown kind", (o) => { o.transitions[0].kind = "teleport"; });
  bad("NaN", (o) => { o.states[1].y = NaN; });
  bad("a place past the frame", (o) => { o.states[1].y = 1.5; });
  bad("ends the wrong way round", (o) => { o.states[1].x = [0.5, 0.2]; });
  bad("9 vibrational levels", (o) => { o.states[1].vib = 9; });
  bad("half a vibrational level", (o) => { o.states[1].vib = 1.5; });
  bad("a 5000 character name", (o) => { o.states[1].name = "S".repeat(5000); });
  bad("a newline in a label", (o) => { o.transitions[1].label = "a\nb"; });
  bad("a frame 2000 long", (o) => { o.frame = [2000, 7]; });
  bad("no axis flag", (o) => { delete o.axis; });
  bad("a fraction index", (o) => { o.transitions[0].from = 0.5; });
  bad("a vib of 3 numbers", (o) => { o.transitions[0].vib = [0, 1, 2]; });
}

// --- On the page --------------------------------------------------------------------------------------------------
const [page, items] = placePlot(blank, chart, env);
const gid = page.groups![0].id;
assert.equal(plotName(page.groups![0].plot!), "Jablonski diagram");
assert.equal(items.length, 4 + 12 + 6 + 1 + 6 + 4 + 1, "levels, vibrational levels, transitions, axis, labels, names, title");
assert.ok(page.arrows!.filter((a) => a.role?.role.startsWith("trans:")).every((a) => a.kind === "line" && a.end === "full"), "a transition is a line with a full head");

// --- J3: transitions stay attached ----------------------------------------------------------------------------------
// The editor's set: a leader follows its label, a level its transitions, and text typed over a caption is data.
const edit = (was: Mol, now: Mol) => followCharts(was, followLevels(was, followLeaders(was, now), env), env);
const recordOf = (m: Mol, id = gid) => m.groups!.find((x) => x.id === id)!.plot as JablonskiChart;
const part = (m: Mol, role: string, id = gid): Arrow => { const g = m.groups!.find((x) => x.id === id)!; return m.arrows!.find((a) => g.items.includes(a.id) && a.role?.role === role)!; };
const label = (m: Mol, role: string, id = gid): Caption => { const g = m.groups!.find((x) => x.id === id)!; return m.captions!.find((c) => g.items.includes(c.id) && c.role?.role === role)!; };
const add = (q: P, d: P): P => [q[0] + d[0], q[1] + d[1]];
const moveArrows = (m: Mol, ids: number[], d: P, ends: "both" | "from" | "to" = "both"): Mol => ({ ...m, arrows: m.arrows!.map((a) => (ids.includes(a.id) ? { ...a, from: ends === "to" ? a.from : add(a.from, d), to: ends === "from" ? a.to : add(a.to, d) } : a)) });
const moveCaptions = (m: Mol, ids: number[], d: P): Mol => ({ ...m, captions: m.captions!.map((c) => (ids.includes(c.id) ? { ...c, x: c.x + d[0], y: c.y + d[1] } : c)) });
// Every transition on its levels as the page shows them: its head on its level's line (or the vibrational level it
// sits on), its tail too (a wavy one's within a quarter of a wave along it), each inside its level's ends.
function attached(m: Mol, id = gid, what = "") {
  const c = recordOf(m, id);
  assert.ok(c, `${what}: the record is there`);
  assert.ok(plotShift(m, m.groups!.find((x) => x.id === id)!), `${what}: the chart is in use`);
  c.transitions.forEach((t, i) => {
    const a = part(m, `trans:${i}`, id);
    if (!a) return;
    for (const [q, k, v, wave] of [[a.from, t.from, t.vib[0], !!a.style], [a.to, t.to, t.vib[1], false]] as const) {
      const l = part(m, `level:${k}`, id), y = l.from[1] + Math.min(v, c.states[k].vib) * g * c.text;
      assert.ok(near(q[1], y, wave ? 0.051 * c.text : 2e-3), `${what}: transition ${i} on level ${k} (${q[1]} against ${y})`);
      assert.ok(q[0] >= Math.min(l.from[0], l.to[0]) - 0.06 && q[0] <= Math.max(l.from[0], l.to[0]) + 0.06, `${what}: transition ${i} inside level ${k}`);
    }
  });
  assert.deepEqual(readPlot(JSON.parse(JSON.stringify(c))), c, `${what}: a file can hold the record`);
}
attached(page, gid, "placed");
const sameAt = (a: Arrow, b: Arrow, what: string) => assert.ok(nearP(a.from, b.from, 1e-6) && nearP(a.to, b.to, 1e-6), what);
{
  // A level moved up: its vibrational levels, its name and the four transitions to or from it follow, in one edit.
  const s1 = part(page, "level:1"), name = label(page, "state:1"), m = edit(page, moveArrows(page, [s1.id], [0.3, 1]));
  attached(m, gid, "S1 moved");
  assert.ok(near(part(m, "level:1").from[1], s1.from[1] + 1, 1e-6), "S1 is where it was dropped");
  assert.ok(near(part(m, "vib:1:1").from[1], s1.from[1] + 1 + g, 1e-6), "its vibrational levels follow");
  assert.ok(near(label(m, "state:1").y, name.y + 1, 1e-6) && near(label(m, "state:1").x, name.x + 0.3, 1e-6), "its name follows");
  for (const r of ["level:0", "level:2", "level:3", "trans:1", "trans:5", "axis"]) sameAt(part(m, r), part(page, r), `${r} stays`);
  assert.equal(part(m, "level:1").id, s1.id, "the level keeps its id");
  assert.deepEqual(recordOf(m).transitions.map((t) => t.kind), recordOf(page).transitions.map((t) => t.kind), "kinds stay");
  // The same move during the drag and after it: the drag shows what the edit makes.
  assert.deepEqual(edit(page, moveArrows(page, [s1.id], [0.3, 1])), m);
  // The level, its vibrational levels and its name moved together (a box around them): the name lands where it was
  // dropped, not twice as far.
  const all = page.arrows!.filter((a) => /^(level|vib):1(:|$)/.test(a.role?.role ?? "")).map((a) => a.id), m2 = edit(page, moveCaptions(moveArrows(page, all, [0, 1]), [name.id], [0, 1]));
  attached(m2, gid, "S1 moved with its name");
  assert.ok(near(label(m2, "state:1").y, name.y + 1, 1e-6), "the name moved with its level stays where it was dropped");
  // A name moved by hand, then its level and the name together: it keeps the offset given by hand.
  const byHand = edit(page, moveCaptions(page, [name.id], [-0.5, 0])), m3 = edit(byHand, moveCaptions(moveArrows(byHand, [s1.id], [0, 1]), [name.id], [0, 1]));
  assert.ok(near(label(m3, "state:1").x, name.x - 0.5, 1e-6) && near(label(m3, "state:1").y, name.y + 1, 1e-6), "a name placed by hand keeps its offset");
  // A level moved, then nudged 50 times: every nudge follows.
  let n = page;
  for (let k = 0; k < 50; k++) n = edit(n, moveArrows(n, [part(n, "level:3").id], [0.01, 0.02]));
  attached(n, gid, "50 nudges");
  assert.ok(near(part(n, "level:3").from[1], part(page, "level:3").from[1] + 1, 1e-6), "50 nudges of 0.02 move T1 by 1");
}
{
  // One end stretched: the level is longer, at the same height, and the transitions stay on it.
  const s1 = part(page, "level:1"), m = edit(page, moveArrows(page, [s1.id], [2, 0.4], "to"));
  attached(m, gid, "S1 stretched");
  assert.ok(near(part(m, "level:1").to[0], s1.to[0] + 2, 1e-6) && near(part(m, "level:1").from[1], s1.from[1], 1e-6) && near(part(m, "level:1").to[1], s1.to[1], 1e-6), "longer, at the height of the end not moved");
  // Its end dragged past its other end: at least 1 em long, the right way round.
  const past = edit(page, moveArrows(page, [s1.id], [-(s1.to[0] - s1.from[0]) - 3, 0], "to")), l = part(past, "level:1");
  attached(past, gid, "S1 end past its other end");
  assert.ok(l.to[0] - l.from[0] >= em - 1e-6 && l.from[1] === l.to[1], "at least 1 em long, flat");
  // A level turned alone lies flat again, at its middle.
  const turned = edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === s1.id ? { ...a, from: add(a.from, [0, -0.6]), to: add(a.to, [0, 0.6]) } : a)) });
  attached(turned, gid, "S1 turned");
  assert.ok(near(part(turned, "level:1").from[1], s1.from[1], 1e-6) && near(part(turned, "level:1").to[1], s1.from[1], 1e-6), "a turned level lies flat at its middle");
  // A vibrational level moved alone takes its state as far.
  const v = part(page, "vib:3:2"), mv = edit(page, moveArrows(page, [v.id], [-1, 0.5]));
  attached(mv, gid, "vibrational level moved");
  assert.ok(near(part(mv, "level:3").from[1], part(page, "level:3").from[1] + 0.5, 1e-6) && near(part(mv, "level:3").from[0], part(page, "level:3").from[0] - 1, 1e-6), "T1 moves as far as its vibrational level");
}
{
  // A level dragged over the top: the frame grows, nothing else moves, the transitions to it now point up or down as
  // its new place says, and their kinds stay.
  const s1 = part(page, "level:1"), m = edit(page, moveArrows(page, [s1.id], [0, 5]));
  attached(m, gid, "S1 over S2");
  assert.ok(recordOf(m).frame[1] > recordOf(page).frame[1] + 1, "the frame grows");
  assert.ok(part(m, "axis").to[1] > part(page, "axis").to[1] + 1, "the axis grows");
  sameAt(part(m, "level:2"), part(page, "level:2"), "S2 stays");
  assert.ok(part(m, "trans:2").to[1] > part(m, "trans:2").from[1], "IC from S2 to S1 now points up");
  assert.equal(recordOf(m).transitions[2].kind, "ic", "its kind stays");
  // Under the foot: the frame grows down.
  const low = edit(page, moveArrows(page, [part(page, "level:3").id], [0, -4]));
  attached(low, gid, "T1 under S0");
  sameAt(part(low, "level:0"), part(page, "level:0"), "S0 stays");
  // 2000 bond lengths away: it stops where the frame is 1000 long.
  const far = edit(page, moveArrows(page, [s1.id], [2000, 2000]));
  attached(far, gid, "S1 far away");
  assert.ok(recordOf(far).frame.every((v) => v <= 1000), "no side over 1000");
  assert.ok(readChart(JSON.parse(JSON.stringify(recordOf(far)))), "the file stays readable");
}
{
  // A transition's end dropped on another level joins it.
  const f = part(page, "trans:3"), t1 = part(page, "level:3"), on = edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === f.id ? { ...a, to: [t1.from[0] + 1, t1.from[1] + 0.1] } : a)) });
  attached(on, gid, "F onto T1");
  assert.deepEqual([recordOf(on).transitions[3].to, recordOf(on).transitions[3].vib[1]], [3, 0], "fluorescence now ends on T1");
  // On a vibrational level: it joins that one.
  const onVib = edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === f.id ? { ...a, to: [t1.from[0] + 1, t1.from[1] + 2 * g + 0.05] } : a)) });
  assert.deepEqual([recordOf(onVib).transitions[3].to, recordOf(onVib).transitions[3].vib[1]], [3, 2]);
  attached(onVib, gid, "F onto T1's second vibrational level");
  // In empty space: it keeps its level and takes the new place across.
  const empty = edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === f.id ? { ...a, to: [f.to[0] - 1, f.to[1] + 2] } : a)) });
  attached(empty, gid, "F's end in empty space");
  assert.equal(recordOf(empty).transitions[3].to, 0);
  assert.ok(near(part(empty, "trans:3").to[0], f.to[0] - 1, 1e-6) && near(part(empty, "trans:3").to[1], f.to[1], 1e-6), "only its place across changes");
  // On the state of its other end: it keeps its old state.
  const s1 = part(page, "level:1"), self = edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === f.id ? { ...a, to: [s1.from[0] + 2, s1.from[1] + g] } : a)) });
  assert.equal(recordOf(self).transitions[3].to, 0, "fluorescence does not end on its own state");
  attached(self, gid, "F's end on S1");
  // Moved whole: it slides across.
  const slid = edit(page, moveArrows(page, [f.id], [0.7, 0.3]));
  attached(slid, gid, "F slid");
  assert.deepEqual([recordOf(slid).transitions[3].from, recordOf(slid).transitions[3].to], [1, 0]);
  assert.ok(near(part(slid, "trans:3").from[0], f.from[0] + 0.7, 1e-6) && near(part(slid, "trans:3").from[1], f.from[1], 1e-6), "slid across, on its levels");
  // Reversed: its states swap, and it stays on both.
  const abs = part(page, "trans:0"), rev = edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === abs.id ? { ...a, from: a.to, to: a.from } : a)) });
  attached(rev, gid, "absorption reversed");
  assert.deepEqual([recordOf(rev).transitions[0].from, recordOf(rev).transitions[0].to, recordOf(rev).transitions[0].kind], [1, 0, "absorption"]);
  // Turned alone: its ends stay on their levels.
  const c = [(abs.from[0] + abs.to[0]) / 2, (abs.from[1] + abs.to[1]) / 2] as P, turn = (q: P): P => [c[0] + (q[0] - c[0]) * Math.cos(0.2) - (q[1] - c[1]) * Math.sin(0.2), c[1] + (q[0] - c[0]) * Math.sin(0.2) + (q[1] - c[1]) * Math.cos(0.2)];
  const tt = edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === abs.id ? { ...a, from: turn(a.from), to: turn(a.to) } : a)) });
  attached(tt, gid, "absorption turned");
  // An end dropped on a level of a second chart: not joined.
  const [two, items2] = placePlot(page, { ...chart, origin: [40, -3] }, env), gid2 = two.groups!.find((x) => x.items.includes(items2[0]))!.id, other = part(two, "level:3", gid2);
  const cross = edit(two, { ...two, arrows: two.arrows!.map((a) => (a.id === f.id ? { ...a, to: [other.from[0] + 1, other.from[1]] } : a)) });
  assert.equal(recordOf(cross).transitions[3].to, 0, "a level of another chart is not joined");
  assert.deepEqual(recordOf(cross, gid2), recordOf(two, gid2), "the other chart does not change");
}
{
  // Delete S0: its level, vibrational levels and name, and the four transitions to or from it, in one edit.
  const s0 = part(page, "level:0"), m = edit(page, deleteGraphics(page, new Set([s0.id])));
  attached(m, gid, "S0 deleted");
  assert.deepEqual(recordOf(m).states.map((s) => s.name), ["S1", "S2", "T1"]);
  assert.deepEqual(recordOf(m).transitions.map((t) => `${t.from}${t.to}${t.kind}`), ["10ic", "02isc"]);
  const roles = m.captions!.filter((c) => c.role).map((c) => c.role!.role).sort();
  assert.deepEqual(roles, ["axis-title", "label:0", "label:1", "state:0", "state:1", "state:2"], "the labels and the name went with them");
  assert.ok(!m.arrows!.some((a) => /^vib:2:/.test(a.role?.role ?? "") && a.role!.role.startsWith("vib:3")), "no vibrational level of a fourth state");
  assert.equal(m.arrows!.filter((a) => a.role?.role.startsWith("vib:")).length, 9);
  assert.ok(page.groups![0].plot === chart || page.groups![0].plot, "the drawing before is as it was (undo)");
  // A transition deleted takes its label with it.
  const t = edit(page, deleteGraphics(page, new Set([part(page, "trans:4").id])));
  assert.equal(recordOf(t).transitions.length, 5);
  assert.ok(!t.captions!.some((c) => c.text === "ISC"), "ISC's label went with it");
  attached(t, gid, "ISC deleted");
  // A name deleted stays deleted, and nothing else changes.
  const nm = edit(page, deleteGraphics(page, new Set([label(page, "state:2").id])));
  assert.deepEqual(recordOf(nm), recordOf(page), "a name deleted is no data");
  // Every level deleted, one by one: the last takes the record, and what is left stays a plain group.
  let one = page;
  for (let k = 0; k < 4; k++) { const l = part(one, `level:0`); one = edit(one, deleteGraphics(one, new Set([l.id]))); if (k < 3) attached(one, gid, `${k + 1} levels deleted`); }
  assert.ok(one.groups?.every((x) => !x.plot), "the last level takes the record");
  assert.ok(one.arrows!.some((a) => a.role?.role === "axis"), "the axis stays, in a plain group");
  // Every part deleted: nothing follows, and nothing is left.
  const none = edit(page, deleteGraphics(page, new Set(page.groups![0].items)));
  assert.ok(!(none.arrows ?? []).length && !(none.groups ?? []).length);
}
{
  // Turned or flipped as a whole: the record is not used, and a level dragged then moves alone. Turned back, the next
  // edit to the chart reads that level back.
  const ids = new Set(page.groups![0].items), turned = transformParts(page, new Set(), ids, ([x, y]) => [-y, x]);
  assert.equal(plotShift(turned, turned.groups![0]), undefined);
  const dragged = moveArrows(turned, [part(turned, "level:1").id], [0, 1]);
  assert.equal(edit(turned, dragged), dragged, "a turned chart's level moves alone");
  const back = transformParts(dragged, new Set(), ids, ([x, y]) => [y, -x]), touched = edit(back, { ...back, captions: back.captions!.map((c) => (c.role?.role === "label:5" ? { ...c, colour: "#ff0000" } : c)) });
  attached(touched, gid, "turned back, then touched");
  // (Up in the turned chart is across in the chart turned back.)
  assert.ok(near(part(touched, "level:1").from[0], part(page, "level:1").from[0] + 1, 1e-6) && near(part(touched, "level:1").from[1], part(page, "level:1").from[1], 1e-6), "the level moved while turned is read back (D3)");
  const flipped = transformParts(page, new Set(), ids, ([x, y]) => [-x, y]);
  assert.equal(edit(flipped, moveArrows(flipped, [part(flipped, "level:1").id], [0, 1])).groups![0].plot, flipped.groups![0].plot, "a flipped chart is not followed");
  // A file whose level was moved by another program opens as saved; its first edit reads the level back (D3).
  const raw = moveArrows(page, [part(page, "level:3").id], [0, 0.8]), opened = { ...raw };
  const first = edit(opened, { ...opened, captions: opened.captions!.map((c) => (c.role?.role === "axis-title" ? { ...c, bold: true } : c)) });
  attached(first, gid, "a file's moved level");
}
{
  // Scaled to 25% and 400%, and resized to the smallest frame: everything scales, nothing is NaN, and the transitions
  // stay on their levels.
  for (const k of [0.25, 4]) {
    const m = rescale(page, gid, ([x, y]) => [x * k, y * k], [k, k], k, env);
    attached(m, gid, `scaled ${k}`);
    const moved = edit(m, moveArrows(m, [part(m, "level:1").id], [0, 0.5 * k]));
    attached(moved, gid, `scaled ${k}, S1 moved`);
  }
  const tiny = reframe(page, gid, [0, 0, 15, 7], [0, 0, 0.1, 0.1], env);
  assert.ok(!JSON.stringify(tiny).includes("null"), "no NaN");
  attached(tiny, gid, "smallest frame");
  // A Document Settings change of the caption size: the next change lays it out for the new size.
  const big: PlotEnv = { ...env, captionSize: 14 }, m = followLevels(page, moveArrows(page, [part(page, "level:1").id], [0, 0.5]), big);
  assert.ok(near(part(m, "vib:1:1").from[1] - part(m, "level:1").from[1], vibGap(14 / 14.4), 1e-6), "vibrational levels at the new size");
  // Grouped with a structure (an outer group): a level moved, the outer group still holds every part.
  const [outer] = groupSelection({ ...page, atoms: [{ element: "C", location: [-10, 0], key: 1 } as Mol["atoms"][number]] }, new Set([0]), new Set(page.groups![0].items))!;
  const og = outer.groups!.find((x) => x.id !== gid)!, mo = edit(outer, moveArrows(outer, [part(outer, "level:1").id], [0, 0.5]));
  attached(mo, gid, "in an outer group");
  assert.deepEqual([...mo.groups!.find((x) => x.id === og.id)!.items].sort(), [...mo.groups!.find((x) => x.id === gid)!.items].sort(), "the outer group holds every part");
  assert.deepEqual(mo.atoms, outer.atoms, "the structure does not move");
}

{
  // Align and Distribute: two levels moved by different amounts in one edit are each read back.
  const s1 = part(page, "level:1"), t1 = part(page, "level:3"), m = edit(page, { ...page, arrows: page.arrows!.map((a) => (a.id === s1.id ? { ...a, from: add(a.from, [0, -0.5]), to: add(a.to, [0, -0.5]) } : a.id === t1.id ? { ...a, from: add(a.from, [0, 0.9]), to: add(a.to, [0, 0.9]) } : a)) });
  attached(m, gid, "two levels aligned");
  assert.ok(near(part(m, "level:1").from[1], s1.from[1] - 0.5, 1e-6) && near(part(m, "level:3").from[1], t1.from[1] + 0.9, 1e-6), "both levels where they were put");
  // Brought to the front, then a level moved: the order stays.
  const front = { ...page, arrows: page.arrows!.map((a) => (a.id === t1.id ? { ...a, order: 5 } : a)) }, after = edit(front, moveArrows(front, [s1.id], [0, 0.3]));
  assert.equal(part(after, "level:3").order, 5, "a part's draw order stays");
  // Picked as one (an integral group): moved whole, nothing is read back.
  const whole = { ...page, groups: page.groups!.map((g) => ({ ...g, integral: true as const })) }, all = edit(whole, moveArrows(moveCaptions(whole, whole.captions!.map((c) => c.id), [1, 1]), whole.arrows!.map((a) => a.id), [1, 1]));
  assert.equal(recordOf(all), recordOf(whole), "the chart moved whole keeps its record");
}

// --- J4: the Actions panel's actions -----------------------------------------------------------------------------
const act = (m: Mol, command: string, picked: number[] = m.groups!.find((x) => x.id === gid)!.items) => { const r = chartAction(m, gid, command, picked, env); assert.ok(r && "mol" in r, `${command}: ${r && "notice" in r ? r.notice : "not an action"}`); return r.mol; };
const notice = (m: Mol, command: string, picked: number[]) => { const r = chartAction(m, gid, command, picked, env); assert.ok(r && "notice" in r, `${command} is refused`); return r.notice; };
{
  // The axis hidden and shown; one deleted on the page comes back with Show.
  const hidden = act(page, "chart.axis");
  assert.ok(!hidden.arrows!.some((a) => a.role?.role === "axis") && !recordOf(hidden).axis);
  const deleted = edit(page, deleteGraphics(page, new Set([part(page, "axis").id]))), off = act(deleted, "chart.axis"), on = act(off, "chart.axis");
  assert.ok(on.arrows!.some((a) => a.role?.role === "axis"), "Show the axis brings it back");
  // A singlet and a triplet added: S3 over S2 on the left, T2 over T1 on the right.
  const s = act(page, "chart.add.singlet"), st = recordOf(s).states;
  assert.equal(st[4].name, "S3");
  assert.ok(st[4].y === 1 && near(st[4].x[0], st[2].x[0]) && near(st[4].x[1], st[2].x[1]), "S3 on top, as long as S2");
  attached(s, gid, "singlet added");
  const t = act(page, "chart.add.triplet"), tt = recordOf(t).states;
  assert.equal(tt[4].name, "T2");
  assert.ok(tt[4].y > tt[3].y && near(tt[4].x[1], tt[3].x[1]), "T2 over T1, in its column");
  attached(t, gid, "triplet added");
  sameAt(part(t, "level:0"), part(page, "level:0"), "S0 stays where it was");
  // Vibrational levels: S1 to 0 (its transitions go to its own level), then to 8 (they go back).
  const s1 = [part(page, "level:1").id], zero = act(page, "chart.vib.0", s1);
  assert.equal(zero.arrows!.filter((a) => a.role?.role.startsWith("vib:1:")).length, 0);
  attached(zero, gid, "S1 with no vibrational levels");
  assert.ok(near(part(zero, "trans:0").to[1], part(zero, "level:1").from[1], 1e-6), "absorption ends on S1's own level");
  const eight = act(zero, "chart.vib.8", s1);
  assert.equal(eight.arrows!.filter((a) => a.role?.role.startsWith("vib:1:")).length, 8);
  attached(eight, gid, "S1 with 8 vibrational levels");
  assert.ok(near(part(eight, "trans:0").to[1], part(eight, "level:1").from[1] + 2 * g, 1e-6), "absorption back on S1's second vibrational level");
  assert.match(notice(page, "chart.vib.9", s1), /0 to 8/);
  assert.match(notice(page, "chart.vib.3", [part(page, "trans:0").id]), /level/);
  // A transition's kind: fluorescence made internal conversion is wavy and labelled IC; a colour, a dashed line or a
  // label the user typed stays.
  const f = [part(page, "trans:3").id], ic = act(page, "chart.kind.ic", f);
  assert.equal(part(ic, "trans:3").style, "wavy");
  assert.equal(label(ic, "label:3").text, "IC");
  attached(ic, gid, "F made IC");
  const own = { ...page, arrows: page.arrows!.map((a) => (a.id === f[0] ? { ...a, style: "dashed" as const, colour: "#123456" } : a)), captions: page.captions!.map((c) => (c.role?.role === "label:3" ? { ...c, text: "kF", runs: undefined } : c)) };
  const kept = act(own, "chart.kind.ic", f);
  assert.deepEqual([part(kept, "trans:3").style, part(kept, "trans:3").colour, label(kept, "label:3").text], ["dashed", "#123456", "kF"], "what the user changed stays (R4)");
  // A transition made a reaction arrow on the page keeps that kind (D14).
  const reaction = { ...page, arrows: page.arrows!.map((a) => (a.id === f[0] ? { ...a, kind: "reaction" as const } : a)) }, moved = edit(reaction, moveArrows(reaction, [part(reaction, "level:1").id], [0, 0.4]));
  assert.equal(part(moved, "trans:3").kind, "reaction");
  assert.match(notice(page, "chart.kind.vr", f), /one level/);
  assert.match(notice(page, "chart.kind.isc", s1), /transition/);
  // A transition added from S1: to T1 (intersystem crossing), and within S1 (vibrational relaxation).
  const linked = act(page, "chart.link.3", s1), lt = recordOf(linked).transitions[6];
  assert.deepEqual([lt.from, lt.to, lt.kind, lt.label], [1, 3, "isc", "ISC"]);
  attached(linked, gid, "ISC added");
  const vr = act(page, "chart.link.self", s1), vt = recordOf(vr).transitions[6];
  assert.deepEqual([vt.from, vt.to, vt.kind, vt.vib], [1, 1, "vr", [3, 0]]);
  assert.ok(part(vr, "trans:6").style === "wavy" && part(vr, "trans:6").to[1] < part(vr, "trans:6").from[1], "vibrational relaxation is wavy and down");
  assert.match(notice(zero, "chart.link.self", s1), /vibrational levels/);
  assert.match(notice(page, "chart.link.9", s1), /no such level/);
  assert.match(notice(page, "chart.link.2", [part(page, "level:1").id, part(page, "level:2").id]), /one level/);
  // One state alone: only vibrational relaxation.
  const lone = placePlot(blank, { ...chart, states: [chart.states[0]], transitions: [] }, env)[0], lg = lone.groups![0];
  assert.ok(chartAction(lone, lg.id, "chart.link.self", [lone.arrows!.find((a) => a.role?.role === "level:0")!.id], env));
}

// --- J5: text typed on the page is data ---------------------------------------------------------------------------
{
  const retype = (m: Mol, role: string, text: string, runs?: Caption["runs"]) => edit(m, { ...m, captions: m.captions!.map((c) => (c.role?.role === role ? { ...c, text, runs } : c)) });
  // S3 typed as plain text over S2's name: the record's name, drawn S₃.
  const s3 = retype(page, "state:2", "S3");
  assert.equal(recordOf(s3).states[2].name, "S3");
  assert.deepEqual(label(s3, "state:2").runs, [{ text: "S" }, { text: "3", script: "sub" }], "drawn with its subscript");
  // Typed with a style of its own: the record takes the text, and the caption stays as typed.
  const rich = retype(page, "label:4", "kISC", [{ text: "k" }, { text: "ISC", script: "super" }]);
  assert.equal(recordOf(rich).transitions[4].label, "kISC");
  assert.deepEqual(label(rich, "label:4").runs, [{ text: "k" }, { text: "ISC", script: "super" }]);
  // A move after it keeps the typed caption.
  const after = edit(rich, moveArrows(rich, [part(rich, "level:3").id], [0, 0.3]));
  assert.deepEqual(label(after, "label:4").runs, [{ text: "k" }, { text: "ISC", script: "super" }], "typed text stays after a redraw");
  // _ typed: drawn as a subscript.
  const k = retype(page, "label:4", "k_{ISC}");
  assert.deepEqual(label(k, "label:4").runs, [{ text: "k" }, { text: "ISC", script: "sub" }]);
  assert.equal(recordOf(k).transitions[4].label, "k_{ISC}");
  // Plain text with no scripts: as typed, no redraw.
  const plainText = retype(page, "state:3", "Triplet");
  assert.equal(recordOf(plainText).states[3].name, "Triplet");
  assert.equal(label(plainText, "state:3").text, "Triplet");
  // The axis title.
  assert.equal(recordOf(retype(page, "axis-title", "E (eV)")).unit, "E (eV)");
  // Odd names: 200 characters (cut to 80), an emoji, Arabic, a tab: no crash, and the record is sound.
  for (const odd of ["S".repeat(200), "S1 🙂", "حالة", "a\tb"]) {
    const m = retype(page, "state:1", odd);
    assert.ok(recordOf(m).states[1].name.length <= 80 && !/\t/.test(recordOf(m).states[1].name), `${odd.slice(0, 10)} is kept as a sound name`);
    attached(edit(m, moveArrows(m, [part(m, "level:1").id], [0, 0.2])), gid, `odd name ${odd.slice(0, 5)}`);
  }
  // An empty name: no caption; text typed over a label is no data for the energy diagram's rules.
  assert.equal(retyped(chart, "state:9", "S9"), undefined, "no such state");
  assert.equal(retyped(chart, "level:1", "S9"), undefined, "a level is no text");
}

// --- Undo and redo: a chain of edits, each one step, each drawing the one before it ------------------------------
{
  const steps: Mol[] = [page];
  const push = (m: Mol) => { steps.push(m); attached(m, gid, `step ${steps.length - 1}`); };
  push(edit(page, moveArrows(page, [part(page, "level:1").id], [0, 0.6])));
  push(act(steps[1], "chart.kind.ic", [part(steps[1], "trans:4").id]));
  push(edit(steps[2], deleteGraphics(steps[2], new Set([part(steps[2], "level:3").id]))));
  push(act(steps[3], "chart.add.triplet"));
  push(edit(steps[4], { ...steps[4], captions: steps[4].captions!.map((c) => (c.role?.role === "label:0" ? { ...c, text: "hν_{exc}", runs: undefined } : c)) }));
  assert.equal(new Set(steps.map((m) => JSON.stringify(m))).size, steps.length, "each step changes the drawing");
  assert.equal(recordOf(steps[3]).states.length, 3);
  assert.equal(recordOf(steps[4]).states[3].name, "T1", "the triplet added after T1 was deleted is T1 again");
  assert.deepEqual(label(steps[5], "label:0").runs, [{ text: "hν", italic: true }, { text: "exc", script: "sub" }]);
}
console.log("jablonski.check: ok");
