// Run: node src/mcpchart.check.ts. Fails loudly if an AI app cannot do with a chart what the user can (issue 43, plan
// J7): draw a Jablonski diagram, an energy diagram or a sensitivity screen (draw's kind chart), read each chart with
// its parts' ids, change it with run_command's chart. actions, and move, edit and delete its parts with a level's
// transitions following, each one undo step; or if a wrong argument is not refused in one line naming it, with the
// drawing as it was. It runs the tools on Octet with no window (scripts/headless), as mcprobust.check.ts does.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("mcpchart.check: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { readChart } = await import("./charts.ts");
await load();
type Mol = import("./render.ts").Mol;
type JablonskiChart = import("./charts.ts").JablonskiChart;

let d = drawing("paper", "Charts"), n = 0;
const rpc = async (body: string) => JSON.parse(await handle(body, () => d.host, "1", session("Check", "charts")));
const call = async (name: string, args: unknown) => (await rpc(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }))) as { result?: { content: { text?: string }[]; isError?: boolean; structuredContent?: any }; error?: { message: string } };
const text = (r: Awaited<ReturnType<typeof call>>) => r.result?.content[0]?.text ?? r.error?.message ?? "";
const failed = (r: Awaited<ReturnType<typeof call>>) => !!(r.error || r.result?.isError);
const doc = (): Mol => d.host.doc();
const draw = (args: Record<string, unknown>) => call("draw", { kind: "chart", ...args });
const change = (ops: Record<string, unknown>[]) => call("change", { operations: ops });
const run = (command: string, ids?: string[]) => call("advanced", { tool: "run_command", args: { command, ...(ids ? { ids } : {}) } });
const charts = () => (doc().groups ?? []).filter((g) => g.plot);
const record = (k = 0) => charts()[k].plot as JablonskiChart;
const readCharts = async () => (await call("read", {})).result!.structuredContent.charts as any[];
// Every transition's head on its level as drawn (its tail too, but a wavy one's within a quarter of a wave).
function attached(what: string, k = 0) {
  const g = charts()[k], c = g.plot as JablonskiChart, by = new Map(doc().arrows!.filter((a) => g.items.includes(a.id) && a.role).map((a) => [a.role!.role, a]));
  const gap = (d.host.style().captionSize * c.text) / d.host.style().bond / 2;
  c.transitions.forEach((t, i) => {
    const a = by.get(`trans:${i}`);
    if (!a) return;
    for (const [q, s, v, tol] of [[a.to, t.to, t.vib[1], 2e-3], [a.from, t.from, t.vib[0], a.style ? 0.06 : 2e-3]] as const) {
      const l = by.get(`level:${s}`)!, y = l.from[1] + Math.min(v, c.states[s].vib) * gap;
      assert.ok(Math.abs(q[1] - y) <= tol, `${what}: transition ${i} on level ${s}`);
    }
  });
  assert.ok(readChart(JSON.parse(JSON.stringify(c))), `${what}: a sound record`);
}

// --- Drawing a Jablonski diagram ---
{
  const r = await draw({ chart: "jablonski", states: [{ name: "S0", energy: 0 }, { name: "S1", energy: 3.1 }, { name: "S2", energy: 4.4 }, { name: "T1", energy: 2.4 }] });
  assert.ok(!failed(r), text(r));
  assert.equal(JSON.parse(text(r).split("\n")[1]).check, "clean", "the layout check is clean");
  assert.match(text(r).split("\n")[0], /^Drew a Jablonski diagram: S0 a\d+ \(t\d+\), S1 a\d+ \(t\d+\), S2 .*; absorption S0→S1 a\d+ \(t\d+\), absorption S0→S2 .*internal conversion S2→S1 .*fluorescence S1→S0 .*intersystem crossing S1→T1 .*phosphorescence T1→S0 a\d+ \(t\d+\)\.$/);
  const c = record();
  assert.deepEqual(c.states.map((s) => [s.name, s.vib]), [["S0", 3], ["S1", 3], ["S2", 3], ["T1", 3]]);
  assert.ok(c.states[0].y === 0 && c.states[2].y === 1 && Math.abs(c.states[1].y - 3.1 / 4.4) < 1e-6 && Math.abs(c.states[3].y - 2.4 / 4.4) < 1e-6, "levels at their energies, the lowest at the foot");
  assert.ok(c.states[3].x[0] >= 0.5 && c.states[1].x[1] <= 0.5 && c.states[0].x[0] === 0 && c.states[0].x[1] === 1, "singlets left, the triplet right, the ground state across");
  assert.deepEqual(c.transitions.map((t) => t.kind), ["absorption", "absorption", "ic", "fluorescence", "isc", "phosphorescence"], "Kasha's rule");
  attached("drawn");
  // read: the chart with every part's id, its states and transitions; its text is not free text, its lines not arrows.
  const [read] = await readCharts();
  assert.equal(read.chart, "jablonski");
  assert.equal(read.ids.length, charts()[0].items.length, "every part's id");
  assert.deepEqual(read.states.map((s: any) => s.name), ["S0", "S1", "S2", "T1"]);
  assert.ok(read.states.every((s: any) => /^a\d+$/.test(s.level) && /^t\d+$/.test(s.text)), "each level's id and its name's");
  assert.deepEqual(read.transitions[4], { ...read.transitions[4], from: "S1", to: "T1", kind: "isc", label: "ISC" });
  const summary = (await call("read", {})).result!.structuredContent;
  assert.ok(!summary.text && !summary.arrows, "a chart's captions and lines are not free text and arrows");
  // Explicit transitions, kinds from the states, labels by kind, a level with no vibrational levels, a column given.
  const two = await draw({ chart: "jablonski", title: "Sensitiser", states: [{ name: "S0" }, { name: "T1", column: "left" }, { name: "S1", vib: 0 }], transitions: [{ from: "S0", to: "S1" }, { from: "S1", to: "T1" }, { from: "T1", to: "S0", label: "k_P" }], below: [read.ids[0]] });
  assert.ok(!failed(two), text(two));
  const c2 = record(1);
  assert.deepEqual(c2.transitions.map((t) => [t.kind, t.label]), [["absorption", "hν_A"], ["isc", "ISC"], ["phosphorescence", "k_P"]], "kinds from the states (with no energies they rise in the order given)");
  assert.ok(c2.states[1].x[1] <= 0.5 && c2.states[2].vib === 0, "T1 in the column given, S1 with no vibrational levels");
  attached("the second chart", 1);
}

// All energies equal, or negative: every level at the foot, or in order; no NaN.
{
  const equal = await draw({ chart: "jablonski", states: [{ name: "S0", energy: 2 }, { name: "S1", energy: 2 }, { name: "T1", energy: 2 }] });
  assert.ok(!failed(equal), text(equal));
  const c = record(charts().length - 1);
  assert.ok(c.states.every((s) => s.y === 0) && !JSON.stringify(doc()).includes("null"), "equal energies: every level at the foot");
  const negative = await draw({ chart: "jablonski", states: [{ name: "S0", energy: -5 }, { name: "S1", energy: -1.5 }, { name: "T1", energy: -3 }] });
  assert.ok(!failed(negative), text(negative));
  const c2 = record(charts().length - 1);
  assert.ok(c2.states[0].y === 0 && c2.states[1].y === 1 && c2.states[2].y > 0 && c2.states[2].y < 1, "negative energies in order");
  for (let k = 0; k < 2; k++) await run("undo");
  assert.equal(charts().length, 2, "undone");
}

// --- run_command's chart. actions, and move, edit and delete through set ---
{
  const ids = async () => (await readCharts())[0];
  let c = await ids();
  const s1 = c.states[1].level, t1 = c.states[3].level, isc = c.transitions[4].id, fl = c.transitions[3].id;
  let r = await run("chart.kind.ic", [isc]);
  assert.ok(!failed(r), text(r));
  assert.equal(record().transitions[4].kind, "ic");
  assert.equal((await ids()).transitions[4].label, "IC", "the label of a kind left as made follows the kind");
  r = await run("chart.vib.1", [s1]);
  assert.ok(!failed(r) && record().states[1].vib === 1, text(r));
  attached("S1 with one vibrational level");
  r = await run("chart.link.3", [s1]);
  assert.ok(!failed(r) && record().transitions.length === 7 && record().transitions[6].kind === "isc", text(r));
  r = await run("chart.link.self", [t1]);
  assert.ok(!failed(r) && record().transitions[7].kind === "vr", text(r));
  r = await run("chart.add.triplet", [s1]);
  assert.ok(!failed(r) && record().states[4].name === "T2", text(r));
  r = await run("chart.axis", [s1]);
  assert.ok(!failed(r) && !record().axis, text(r));
  attached("after the actions");
  // A level moved by its id: its transitions follow, in one step.
  c = await ids();
  const before = record();
  r = await change([{ op: "move", ids: [c.states[1].level], dx: 0, dy: 1.2 }]);
  assert.ok(!failed(r), text(r));
  assert.ok(record().states[1].y * record().frame[1] - before.states[1].y * before.frame[1] > 1.1, "S1 moved up");
  attached("S1 moved by the MCP");
  // Text edited over a name is the state's name.
  r = await change([{ op: "edit", ids: [c.states[2].text], text: "S3" }]);
  assert.ok(!failed(r), text(r));
  assert.equal(record().states[2].name, "S3");
  // A level deleted takes its transitions.
  const kept = record().transitions.filter((t) => t.from !== 3 && t.to !== 3).length;
  r = await change([{ op: "delete", ids: [c.states[3].level] }]);
  assert.ok(!failed(r), text(r));
  assert.equal(record().transitions.length, kept, "T1's transitions went with it");
  attached("T1 deleted");
  // Undo puts it back, one step.
  r = await run("undo");
  assert.ok(!failed(r) && record().states.length === 5, text(r));
}

// --- Refusals: each names its argument, and the drawing is as it was ---
{
  const was = JSON.stringify(doc()), c = (await readCharts())[0];
  const refused = async (what: string, r: Awaited<ReturnType<typeof call>>, words: RegExp) => {
    assert.ok(failed(r), `${what}: refused`);
    assert.match(text(r), words, `${what}: ${text(r)}`);
    assert.equal(JSON.stringify(doc()), was, `${what}: the drawing is as it was`);
  };
  await refused("an unknown chart", await draw({ chart: "jablonksi", states: [{ name: "S0" }] }), /chart/);
  await refused("no states", await draw({ chart: "jablonski" }), /states: give one state at least/);
  await refused("no states at all", await draw({ chart: "jablonski", states: [] }), /states/);
  await refused("25 states", await draw({ chart: "jablonski", states: Array.from({ length: 25 }, (_, k) => ({ name: `S${k}` })) }), /states/);
  await refused("65 transitions", await draw({ chart: "jablonski", states: [{ name: "S0" }, { name: "S1" }], transitions: Array.from({ length: 65 }, () => ({ from: "S0", to: "S1" })) }), /transitions/);
  await refused("a transition from no state", await draw({ chart: "jablonski", states: [{ name: "S0" }, { name: "S1" }], transitions: [{ from: "S5", to: "S1" }] }), /transitions\[0\]\.from: no state is named S5/);
  await refused("two states named S1", await draw({ chart: "jablonski", states: [{ name: "S1" }, { name: "S1" }] }), /two states are named S1/);
  await refused("vib 99", await draw({ chart: "jablonski", states: [{ name: "S0", vib: 99 }] }), /vib/);
  await refused("energy as text", await draw({ chart: "jablonski", states: [{ name: "S0", energy: "3 eV" }] }), /energy/);
  await refused("some energies", await draw({ chart: "jablonski", states: [{ name: "S0", energy: 0 }, { name: "S1" }] }), /every state an energy, or none/);
  await refused("vibrational relaxation between two states", await draw({ chart: "jablonski", states: [{ name: "S0" }, { name: "S1" }], transitions: [{ from: "S1", to: "S0", kind: "vr" }] }), /transitions\[0\]\.kind/);
  await refused("absorption within one state", await draw({ chart: "jablonski", states: [{ name: "S0" }], transitions: [{ from: "S0", to: "S0", kind: "absorption" }] }), /transitions\[0\]\.kind/);
  await refused("chart.kind on a level", await run("chart.kind.isc", [c.states[1].level]), /ids: give a transition's id/);
  await refused("chart.vib on a transition", await run("chart.vib.3", [c.transitions[0].id]), /ids: give a level's id/);
  await refused("chart.vib.9", await run("chart.vib.9", [c.states[1].level]), /command: Vibrational levels are 0 to 8/);
  await refused("chart.link.9", await run("chart.link.9", [c.states[1].level]), /command: There is no such level/);
  await refused("chart.link with two levels", await run("chart.link.2", [c.states[1].level, c.states[2].level]), /ids: give one level's id/);
  const other = (await readCharts())[1];
  await refused("ids from two charts", await run("chart.axis", [c.states[0].level, other.states[0].level]), /ids: these are parts of two charts/);
  await refused("no ids", await run("chart.axis", []), /ids/);
  await refused("an id that is not there", await run("chart.axis", ["a99999"]), /nothing with the id a99999/);
  await refused("an action of another chart kind", await run("chart.zones", [c.states[0].level]), /command: chart.zones is not an action of this Jablonski diagram/);
  await refused("an energy diagram with no energies", await draw({ chart: "energy", rows: [["", "A"], ["R", "soon"]] }), /rows/);
  await refused("a screen with two conditions", await draw({ chart: "radar", rows: [["Low T", "-5"], ["High T", "3"]] }), /rows/);
  await refused("a screen whose scale holds no value", await draw({ chart: "radar", rows: [["a", "-5"], ["b", "3"], ["c", "-90"]], min: -50, max: 50, step: 25 }), /min, max, step/);
}

// --- The other charts ---
{
  const r = await draw({ chart: "energy", rows: [["", "Path A", "Path B"], ["R", "0", "0"], ["TS1", "24.3 (22.0)", "18.6 TS1′"], ["P", "−12.5", "−12.5"]], join: "curve" });
  assert.ok(!failed(r), text(r));
  const e = charts().find((g) => g.plot!.kind === "energy")!, ep = e.plot as import("./charts.ts").EnergyChart;
  assert.deepEqual([ep.states, ep.paths.map((p) => p.name), ep.join], [["R", "TS1", "P"], ["Path A", "Path B"], "curve"]);
  const ids = (await readCharts()).find((x) => x.chart === "energy").ids;
  assert.ok(!failed(await run("chart.join.dashed", [ids[0]])) && (charts().find((g) => g.plot!.kind === "energy")!.plot as typeof ep).join === "dashed");
  const s = await draw({ chart: "radar", rows: [["High *c*", "-10"], ["Low *c*", "-35"], ["H₂O", "-60"], ["Low *T*", "5"]] });
  assert.ok(!failed(s), text(s));
  const rid = (await readCharts()).find((x) => x.chart === "radar").ids;
  assert.ok(!failed(await run("chart.scale.step.20", [rid[0]])), "the screen's step");
  assert.equal((charts().find((g) => g.plot!.kind === "radar")!.plot as import("./charts.ts").RadarChart).step, 20);
}

// --- Two AI sessions on one drawing: one moves S1 while the other sets T1's vibrational levels ---
{
  d = drawing("paper", "Two");
  await draw({ chart: "jablonski", states: [{ name: "S0", energy: 0 }, { name: "S1", energy: 3 }, { name: "T1", energy: 2 }] });
  const c = (await readCharts())[0];
  const a = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "change", arguments: { operations: [{ op: "move", ids: [c.states[1].level], dy: 0.8 }] } } }), () => d.host, "1", session("A", "one")));
  const b = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "advanced", arguments: { tool: "run_command", args: { command: "chart.vib.5", ids: [c.states[2].level] } } } }), () => d.host, "1", session("B", "two")));
  assert.ok(!a.result?.isError && !b.result?.isError, `${a.result?.content[0].text} ${b.result?.content[0].text}`);
  assert.ok(record().states[2].vib === 5 && record().states[1].y > 0.99, "both changes are made");
  attached("two sessions");
  assert.ok(!failed(await run("undo")) && record().states[2].vib === 3, "each is one undo step");
}
console.log("mcpchart.check: ok");
