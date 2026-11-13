// Run: node src/charts.check.ts. Fails loudly if a chart on the page goes wrong (docs/plans/charts.md): an energy
// diagram's or a sensitivity screen's parts, a file that loses the record, Edit Data that loses what the user changed
// or keeps old text, a hostile record that is read, or the dialog's table read wrongly.
import assert from "node:assert/strict";
import type { Arrow, Caption, Mol } from "./render.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { readOct, writeOct } from "./oct.ts";
import { widthOf } from "./arial.ts";
import { followCharts, lonePlot, placePlot, plotFigure, plotName, readPlot, reframe, replot, rescale, type PlotEnv } from "./pageplot.ts";
import { describe } from "./access.ts";
import { onTop } from "./order.ts";
import { chartFigure, coverScale, energyFigure, energyOfTable, energyRoles, figureBox, MAX_PLACES, radarRoles, retyped, soundScale, spare, NEW_ENERGY, NEW_RADAR, parseCell, pastedRows, radarFigure, radarOfRows, readChart, rowsOfRadar, shown, tableOfEnergy, type EnergyChart, type RadarChart } from "./charts.ts";

const env: PlotEnv = { captionSize: 10, bond: 14.4, measure: (t) => widthOf(t, 1) }, em = 10 / 14.4;
const blank: Mol = { atoms: [], bonds: [] };
const place = { frame: [12, 8] as [number, number], origin: [0, 0] as [number, number], scale: 1, text: 1, roles: [] as string[] };

// --- The dialog's cells and tables ---
assert.deepEqual(parseCell("24.3"), { value: 24.3, places: 1 });
assert.deepEqual(parseCell(" 24,3 (22.0) "), { value: 24.3, second: 22, places: 1 });
assert.deepEqual(parseCell("18.6 TS1′"), { value: 18.6, name: "TS1′", places: 1 });
assert.deepEqual(parseCell("−3.4 (−4) INT1′"), { value: -3.4, second: -4, name: "INT1′", places: 1 });
assert.deepEqual(parseCell("-12"), { value: -12, places: 0 });
for (const bad of ["", "  ", "TS1", "99999999", "(3)"]) assert.equal(parseCell(bad), undefined, `"${bad}" is not an energy`);
assert.equal(shown(-0.04, 1), "0.0");
assert.equal(shown(-12.5, 1), "−12.5");
assert.equal(shown(25, 0, true), "+25");
assert.deepEqual(pastedRows("R\t0\t0\r\nTS1\t24.3\t18.6\r\n"), [["R", "0", "0"], ["TS1", "24.3", "18.6"]]);
assert.deepEqual(pastedRows("24.3"), [], "one value is typed text, not a table");

// Stefan's example: two paths, the second with names of its own, the first with second values.
const table = { paths: ["Path A", "Path B"], rows: [["R", "0.0 (0.0)", "0.0"], ["TS1", "24.3 (22.0)", "18.6 TS1′"], ["INT1", "5.2 (4.1)", "−3.4 INT1′"], ["TS2", "15.8 (14.9)", "12.1 TS2′"], ["P", "−12.5 (−13.0)", "−12.5"], ["", "", ""]] };
const data = energyOfTable(table)!;
assert.deepEqual(data.states, ["R", "TS1", "INT1", "TS2", "P"], "an empty row is left out");
assert.equal(data.places, 1);
assert.deepEqual(data.paths[0].energies, [0, 24.3, 5.2, 15.8, -12.5]);
assert.deepEqual(data.paths[0].second, [0, 22, 4.1, 14.9, -13]);
assert.deepEqual(data.paths[1].names, [null, "TS1′", "INT1′", "TS2′", null]);
assert.ok(data.paths[0].colour && data.paths[1].colour && data.paths[0].colour !== data.paths[1].colour, "two paths, two colours");
assert.equal(energyOfTable({ paths: ["Path 1"], rows: [["R", "0"], ["P", "-10"]] })!.paths[0].colour, undefined, "one path alone is in ink");
assert.deepEqual(tableOfEnergy(data), { paths: table.paths, rows: table.rows.slice(0, 5) }, "the table reads back as typed");
assert.equal(energyOfTable({ paths: ["Path 1"], rows: [["R", "soon"]] }), undefined);
// A path that skips a state.
const skips = energyOfTable({ paths: ["A", "B"], rows: [["R", "0", "0"], ["TS", "20", ""], ["P", "-5", "-5"]] })!;
assert.deepEqual(skips.paths[1].energies, [0, null, -5]);

// --- Energy diagram ---
const energy: EnergyChart = { ...NEW_ENERGY, ...data, ...place };
{
  const fig = energyFigure(energy, em), roles = (list: { role?: string }[], start: string) => list.filter((x) => x.role?.startsWith(start));
  assert.equal(roles(fig.lines, "level:").length, 10, "a level for each value");
  assert.ok(roles(fig.lines, "level:").every((l) => l.style === "bold" && l.from[1] === l.to[1]), "levels are bold and flat");
  assert.equal(roles(fig.lines, "join:").length, 8, "a join between each two levels of a path");
  assert.equal(roles(fig.lines, "axis").length, 1);
  assert.deepEqual(roles(fig.texts, "tick:").map((t) => t.text), ["−20", "−10", "0", "10", "20", "30"], "ticks at round steps that hold every value");
  assert.equal(fig.texts.find((t) => t.role === "axis-title")!.text, "ΔG (kJ/mol)");
  assert.deepEqual(fig.texts.find((t) => t.role === "axis-title")!.runs, [{ text: "Δ" }, { text: "G", italic: true }, { text: " (kJ/mol)" }], "the quantity's symbol is italic");
  const text = (role: string) => fig.texts.find((t) => t.role === role), levelY = (pi: number, k: number) => fig.lines.find((l) => l.role === `level:${pi}:${k}`)!.from[1];
  assert.equal(text("value:0:1")!.text, "24.3");
  assert.equal(text("second:0:1")!.text, "(22.0)");
  assert.equal(text("state:1")!.text, "TS1");
  assert.equal(text("name:1:1")!.text, "TS1′");
  assert.equal(text("value:0:4")!.text, "−12.5");
  // R and P: both paths at one energy share one text.
  assert.equal(text("value:1:0"), undefined);
  assert.equal(text("value:1:4"), undefined);
  // TS1: path B's level is close under path A's, so all of A's text is over A's level, name on top.
  assert.ok(text("second:0:1")!.at[1] > levelY(0, 1) && text("value:0:1")!.at[1] > text("second:0:1")!.at[1] && text("state:1")!.at[1] > text("value:0:1")!.at[1], "the top level's text is over it");
  assert.ok(text("value:1:1")!.at[1] > levelY(1, 1) && text("name:1:1")!.at[1] < levelY(1, 1), "a lower level's value is over it and its name under it");
  // R: one level, its value over it, its second value and its name under it.
  assert.ok(text("value:0:0")!.at[1] > levelY(0, 0) && text("second:0:0")!.at[1] < levelY(0, 0) && text("state:0")!.at[1] < text("second:0:0")!.at[1]);
  assert.ok(fig.texts.filter((t) => /^(value|second|name):0|^state:/.test(t.role!)).every((t) => t.colour === energy.paths[0].colour), "a path's text is in its colour");
  assert.deepEqual(roles(fig.texts, "keyname:").map((t) => t.text), ["Path A", "Path B"]);
  assert.equal(energyFigure({ ...energy, key: false }, em).texts.some((t) => t.role?.startsWith("keyname")), false);
  assert.equal(energyFigure({ ...energy, axis: false }, em).lines.some((l) => l.role === "axis"), false);
  assert.ok(energyFigure({ ...energy, join: "dashed" }, em).lines.filter((l) => l.role?.startsWith("join")).every((l) => l.style === "dashed"));
  const curved = energyFigure({ ...energy, join: "curve" }, em);
  assert.equal(curved.curves.length, 8);
  assert.ok(curved.curves.every((c) => c.points.length === 2 && c.points[0].c2![1] === c.points[0].at[1] && c.points[1].c1![1] === c.points[1].at[1]), "a curve leaves and meets its levels flat");
  // A path that skips a state is joined across it.
  const f2 = energyFigure({ ...energy, ...skips }, em);
  assert.equal(f2.lines.filter((l) => l.role?.startsWith("join:1")).length, 1);
  // One value: an axis that still has a span.
  assert.ok(energyFigure({ ...energy, states: ["R"], paths: [{ name: "A", energies: [3] }] }, em).texts.some((t) => t.role?.startsWith("tick:")));
  assert.deepEqual(energyFigure({ ...energy, paths: [{ name: "A", energies: [null, null, null, null, null] }] }, em), { lines: [], curves: [], texts: [] }, "nothing to draw");
}

// --- Sensitivity screen ---
const radar: RadarChart = { ...NEW_RADAR, ...place, frame: [10, 10], axes: NEW_RADAR.axes.map((x, i) => ({ ...x, value: [-10, -5, -60, -20, -35, 0, -90, 5, -15, -25][i], ...(i === 2 ? { second: -30 } : {}) })) };
{
  const fig = radarFigure(radar, em), zones = fig.curves.filter((c) => c.role?.startsWith("zone:"));
  assert.equal(zones.length, 6, "a zone for each step from −100 to +50");
  assert.ok(zones.every((z) => z.back && z.fill && z.points.length === 10));
  assert.ok(zones[0].fill !== zones[3].fill && zones[4].fill !== zones[0].fill, "a loss and a gain differ, and a big loss from a small one");
  // The paper's bands (Angew. Chem. Int. Ed. 2019, 58, 8572, Figure 2): two reds, two pale, green, teal.
  assert.ok(zones[0].fill !== zones[1].fill && zones[1].fill !== zones[2].fill && zones[2].fill === zones[3].fill && zones[3].fill !== zones[4].fill && zones[4].fill !== zones[5].fill);
  assert.deepEqual(NEW_RADAR.axes.map((x) => x.label), ["High *c*", "Low *c*", "H₂O", "Low O₂", "High O₂", "Low *T*", "High *T*", "Low *I*", "High *I*", "Big Scale"], "the paper's ten conditions, in its order");
  assert.deepEqual(fig.texts.filter((t) => t.role?.startsWith("tick:")).map((t) => t.text), ["−100%", "−75%", "−50%", "−25%", "0%", "+25%"]);
  assert.equal(fig.lines.filter((l) => l.role?.startsWith("spoke:")).length, 10);
  const data = fig.curves.find((c) => c.role === "data")!, r = (q: [number, number]) => Math.hypot(q[0] - 5, q[1] - 5);
  assert.ok(data.closed && data.style === "bold");
  assert.ok(Math.abs(r(data.points[6].at) - 5 * (140 / 150)) < 1e-9, "−90% is near the edge");
  assert.ok(Math.abs(r(data.points[7].at) - 5 * (45 / 150)) < 1e-9, "+5% is near the centre");
  assert.ok(Math.abs(data.points[0].at[0] - 5) < 1e-9 && data.points[0].at[1] > 5, "the first condition is at the top");
  assert.ok(data.points[1].at[0] > 5, "and the next is clockwise from it");
  assert.equal(fig.curves.find((c) => c.role === "second")!.style, "dashed");
  assert.equal(radarFigure({ ...radar, axes: radar.axes.map(({ second: _, ...x }) => x) }, em).curves.some((c) => c.role === "second"), false);
  // Italic in a condition's name.
  const high = fig.texts.find((t) => t.role === "axis:0")!;
  assert.equal(high.text, "High c");
  assert.deepEqual(high.runs, [{ text: "High " }, { text: "c", italic: true }]);
  assert.equal(radarFigure({ ...radar, zones: false }, em).curves.filter((c) => c.role?.startsWith("ring:")).length, 6, "without zones, a ring at each step");
  // A value past the scale stays on it.
  const out = radarFigure({ ...radar, axes: radar.axes.map((x) => ({ ...x, value: -500 })) }, em).curves.find((c) => c.role === "data")!;
  assert.ok(out.points.every((q) => Math.abs(r(q.at) - 5) < 1e-9));
  assert.deepEqual(radarOfRows(rowsOfRadar(radar)), radar.axes, "the rows read back as typed");
  assert.equal(radarOfRows([["a", "1"], ["b", "2"]]), undefined, "fewer than three conditions");
  // A condition with no value has no axis, as the paper leaves out one that was not run.
  assert.deepEqual(radarOfRows([["a", "1"], ["", ""], ["b", ""], ["c", "-3 (2)"], ["d", "0"]]), [{ label: "a", value: 1 }, { label: "c", value: -3, second: 2 }, { label: "d", value: 0 }]);
  assert.equal(radarOfRows(NEW_RADAR.axes.map((x) => [x.label, ""])), undefined, "a new screen has no chart until three values are typed");
}

// --- On the page: one group with its record, in files, and drawn again ---
for (const chart of [energy, radar]) {
  const [m, items] = placePlot(blank, chart, env), g = m.groups!.find((x) => x.plot)!;
  assert.equal(m.groups!.length, 1);
  assert.deepEqual([...g.items].sort((a, b) => a - b), [...items].sort((a, b) => a - b), "every part is in the group");
  assert.equal(plotName(g.plot!), chart.kind === "energy" ? "Energy diagram" : "Sensitivity screen");
  assert.equal(lonePlot(m, new Set(), new Set(items)), g, "picked whole, it is one chart");
  assert.ok([...(m.captions ?? []), ...(m.arrows ?? [])].every((x) => x.role), "each part has its role");
  assert.ok(m.captions!.every((c) => c.chemical === false), "its text is text only: a state named P is not phosphorus");
  // Its box holds its text as drawn, so the next chart lands clear of it.
  const fig = plotFigure(chart, env), box = figureBox(fig, em, env.measure);
  assert.ok(fig.texts.every((t) => t.at[0] >= box[0] - 1e-9 && t.at[0] <= box[2] + 1e-9 && t.at[1] >= box[1] && t.at[1] <= box[3]));
  assert.ok(box[2] > Math.max(...fig.texts.map((t) => t.at[0])) + em, "a text that starts at the right edge is counted to its end");
  assert.deepEqual(readPlot(JSON.parse(JSON.stringify(g.plot))), g.plot, "the record reads back");
  for (const [how, back] of [["oct", readOct(writeOct(m, DEFAULT_STYLE)).mol], ["CDXML", fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol]] as const) {
    const gb = back.groups!.find((x) => x.plot)!;
    assert.ok(gb, `${how}: the group keeps its record`);
    assert.deepEqual({ ...gb.plot, origin: 0, frame: 0 }, { ...g.plot, origin: 0, frame: 0 }, `${how}: the record`);
    assert.equal(back.captions!.length, m.captions!.length, `${how}: the captions`);
    assert.equal(back.arrows!.length, m.arrows!.length, `${how}: the lines and curves`);
  }
  // A plain CDXML reader (ChemDraw, Octet 1.1.1) sees lines, curves and text: the picture is in the file itself.
  const xml = toCdxml(m, DEFAULT_STYLE);
  assert.ok((xml.match(/<(graphic|arrow|curve)\b/g) ?? []).length >= m.arrows!.length, "every line and curve is an object in the CDXML");
  // A resize draws it again at the new frame, and nothing is lost.
  const wide = reframe(m, g.id, [0, 0, 12, 8], [0, 0, 16, 10], env), gw = wide.groups!.find((x) => x.plot)!;
  assert.deepEqual(gw.plot!.frame, chart.kind === "radar" ? [14, 14] : [chart.frame[0] + 4, chart.frame[1] + 2]);
  assert.equal(wide.captions!.length, m.captions!.length);
  assert.equal(replot(m, g.id, {}, env).captions!.length, m.captions!.length);
}
// The zones are behind the spokes and the line of values (the drawing order is the list's).
{
  const [m] = placePlot(blank, radar, env), order = m.arrows!.map((a) => a.role!.role);
  assert.ok(order.findIndex((r) => r.startsWith("spoke")) > order.findLastIndex((r) => r.startsWith("zone")));
  assert.ok(order.indexOf("data") > order.findLastIndex((r) => r.startsWith("spoke")));
  assert.ok(m.arrows!.filter((a) => a.role!.role.startsWith("zone")).every((a) => a.kind === "curve" && a.curve!.closed && a.fill === "solid" && /^#[0-9A-F]{6}$/.test(a.colour!)));
  assert.equal(m.captions!.find((c) => c.role!.role === "tick:0")!.size, 8, "ring values are small");
  assert.equal(m.captions!.find((c) => c.role!.role === "tick:0")!.text, "−100%", "a ring value's role is its place from the edge");
}
// Edit Data: new values show, and what the user changed stays.
{
  const [m0] = placePlot(blank, energy, env), g = m0.groups!.find((x) => x.plot)!, cap = (m: Mol, role: string) => m.captions!.find((c) => c.role?.role === role), line = (m: Mol, role: string) => m.arrows!.find((a) => a.role?.role === role);
  const edit = <T extends Caption | Arrow>(list: T[], role: string, f: (x: T) => T) => list.map((x) => (x.role?.role === role ? f(x) : x));
  // The user: recolours a level, renames TS2 by hand, moves a value, and deletes the unit.
  let m: Mol = { ...m0, arrows: edit(m0.arrows!, "level:0:1", (a) => ({ ...a, colour: "#123456" })), captions: edit(edit(m0.captions!, "state:3", (c) => ({ ...c, text: "TS2 (rds)" })), "value:0:2", (c) => ({ ...c, x: c.x + 1 })).filter((c) => c.role?.role !== "axis-title") };
  m = { ...m, groups: m.groups!.map((x) => ({ ...x, items: x.items.filter((id) => m.captions!.some((c) => c.id === id) || m.arrows!.some((a) => a.id === id)) })) };
  const next = energyOfTable({ ...table, rows: table.rows.map((r) => (r[0] === "TS1" ? ["TS1", "28.0 (22.0)", r[2]] : r[0] === "INT1" ? ["INT1", "6.0 (4.1)", r[2]] : r)) }, energy)!;
  const after = replot(m, g.id, { ...next, join: "dashed" }, env);
  assert.equal(cap(after, "value:0:1")!.text, "28.0", "a new value shows");
  assert.equal(cap(after, "value:0:2")!.text, "6.0");
  assert.ok(Math.abs(cap(after, "value:0:2")!.x - cap(m0, "value:0:2")!.x - 1) < 1e-9, "a moved value keeps its move");
  assert.equal(cap(after, "state:3")!.text, "TS2 (rds)", "text the user changed stays");
  assert.equal(line(after, "level:0:1")!.colour, "#123456", "a colour the user gave stays");
  assert.equal(line(after, "level:0:0")!.colour, energy.paths[0].colour);
  assert.equal(cap(after, "axis-title"), undefined, "a deleted part stays deleted");
  assert.equal(line(after, "join:0:0")!.style, "dashed", "the new look shows");
  assert.equal(line(after, "level:0:1")!.id, line(m0, "level:0:1")!.id, "a part keeps its id");
  assert.ok(line(after, "level:0:1")!.from[1] > line(m0, "level:0:1")!.from[1], "the level moves to its new energy");
  assert.deepEqual((after.groups!.find((x) => x.plot)!.plot as EnergyChart).paths[0].energies, [0, 28, 6, 15.8, -12.5]);
  // A state taken out: its parts go.
  const fewer = replot(m0, g.id, energyOfTable({ ...table, rows: table.rows.filter((r) => r[0] !== "INT1") }, energy)!, env);
  assert.equal(fewer.arrows!.filter((a) => a.role!.role.startsWith("level:")).length, 8);
  assert.ok(fewer.groups![0].items.every((id) => fewer.captions!.some((c) => c.id === id) || fewer.arrows!.some((a) => a.id === id)), "the group lists only what is there");
}

// --- A record from a file is hostile input ---
{
  const ok = JSON.parse(JSON.stringify({ ...energy })), okRadar = JSON.parse(JSON.stringify({ ...radar }));
  assert.deepEqual(readChart(ok), energy);
  assert.deepEqual(readChart(okRadar), radar);
  const bad: [string, (o: Record<string, any>) => void][] = [
    ["a frame that is not numbers", (o) => { o.frame = ["12", 8]; }], ["a huge frame", (o) => { o.frame = [1e9, 8]; }], ["text over its length", (o) => { o.title = "x".repeat(201); }],
    ["too many states", (o) => { o.states = Array(61).fill("s"); }], ["energies that do not match the states", (o) => { o.paths[0].energies.pop(); }], ["an energy that is not finite", (o) => { o.paths[0].energies[0] = "0"; }],
    ["a colour that is not one", (o) => { o.paths[0].colour = "red;"; }], ["too many paths", (o) => { o.paths = Array(13).fill(o.paths[0]); }], ["a join it does not know", (o) => { o.join = "zigzag"; }],
    ["places out of range", (o) => { o.places = 40; }], ["a control character in a name", (o) => { o.states[0] = "R\u0000"; }], ["too many roles", (o) => { o.roles = Array(4001).fill("r"); }],
  ];
  for (const [what, spoil] of bad) { const o = JSON.parse(JSON.stringify(ok)); spoil(o); assert.equal(readChart(o), undefined, what); }
  const badRadar: [string, (o: Record<string, any>) => void][] = [
    ["two conditions", (o) => { o.axes.length = 2; }], ["too many conditions", (o) => { o.axes = Array(25).fill(o.axes[0]); }], ["a scale the wrong way round", (o) => { o.min = 60; }],
    ["a step of 0", (o) => { o.step = 0; }], ["a step that makes thousands of rings", (o) => { o.step = 0.001; }], ["a value that is not a number", (o) => { o.axes[0].value = null; }],
  ];
  for (const [what, spoil] of badRadar) { const o = JSON.parse(JSON.stringify(okRadar)); spoil(o); assert.equal(readChart(o), undefined, what); }
  assert.equal(readPlot({ ...ok, kind: "pie" }), undefined);
  // Extra fields are not kept.
  assert.equal("evil" in readChart({ ...ok, evil: "<script>" })!, false);
  // A figure from any record that reads is small: the limits bound its parts.
  const most: EnergyChart = { ...energy, states: Array(60).fill("S"), paths: Array.from({ length: 12 }, (_, p) => ({ name: "P", energies: Array.from({ length: 60 }, (_, k) => k * 1000 + p), second: Array(60).fill(1), names: Array(60).fill("n") })) };
  const big = plotFigure(most, env);
  assert.ok(big.lines.length + big.curves.length + big.texts.length < 5000, "the largest diagram a file can hold");
}

// --- What the review of 11 November found (docs/plans/charts.md) ---
// A value's places are the larger of its two numbers', up to MAX_PLACES, so Apply with nothing changed changes nothing.
{
  assert.deepEqual(parseCell("24 (22.6)"), { value: 24, second: 22.6, places: 1 });
  assert.equal(parseCell("0.0387")!.places, 4);
  assert.equal(parseCell("0.12345678")!.value, 0.123457, "a number is read to MAX_PLACES places");
  assert.equal(MAX_PLACES, 6);
  const t = { paths: ["A"], rows: [["R", "0 (0.4)"], ["TS", "24 (22.6)"], ["P", "-5 (-4.5)"]] }, once = energyOfTable(t)!;
  assert.deepEqual(energyOfTable(tableOfEnergy(once), once), once, "the table reads back to the same record");
  const fine = energyOfTable({ paths: ["A"], rows: [["R", "0.0000"], ["TS", "0.0387"], ["P", "-0.0124"]] })!;
  assert.deepEqual(energyOfTable(tableOfEnergy(fine), fine)!.paths[0].energies, [0, 0.0387, -0.0124]);
  const axes = [{ label: "a", value: -12.25 }, { label: "b", value: 3.75, second: 1.25 }, { label: "c", value: 0 }];
  assert.deepEqual(radarOfRows(rowsOfRadar({ axes })), axes, "a sensitivity screen's values read back the same");
}
// Colours: a second path gives the first one a colour, and no two paths share one.
{
  const one = energyOfTable({ paths: ["A"], rows: [["R", "0"], ["P", "1"]] })!, two = energyOfTable({ paths: ["A", "B"], rows: [["R", "0", "0"], ["P", "1", "2"]] }, one)!;
  assert.ok(two.paths[0].colour && two.paths[1].colour && two.paths[0].colour !== two.paths[1].colour);
  // The first path taken out, a new third one added: the new one's colour is not the kept one's.
  const three = energyOfTable({ paths: ["A", "B", "C"], rows: [["R", "", "0", "0"], ["P", "", "2", "3"]] }, two)!;
  assert.equal(three.paths[0].colour, two.paths[1].colour, "a kept path keeps its colour");
  assert.notEqual(three.paths[1].colour, three.paths[0].colour);
}
// Text from a paste: no control characters reach a record, and a long run of blank lines is cut, not scanned.
{
  const dirty = energyOfTable({ paths: ["Pa\u0001th"], rows: [["R\u000b1", "0 n\u0001ame"], ["P", "1"]] })!;
  assert.ok(readChart(JSON.parse(JSON.stringify({ ...NEW_ENERGY, ...dirty, ...place }))), "a record made from pasted text reads back");
  assert.equal(dirty.states[0], "R 1");
  assert.equal(radarOfRows([["a\u0001", "1"], ["b", "2"], ["c", "3"]])![0].label, "a");
  const t0 = performance.now(), rows = pastedRows("a\tb" + "\n".repeat(2_000_000) + "c");
  assert.ok(performance.now() - t0 < 200, "a paste of two million blank lines is quick");
  assert.deepEqual(rows[0], ["a", "b"]);
  assert.deepEqual(pastedRows("a\tb\n\nc\td\n\n"), [["a", "b"], [""], ["c", "d"]], "a blank row in the middle stays");
  assert.deepEqual(pastedRows(""), []);
}
// A record with no energy at all is refused, and a name left empty is no caption.
{
  assert.equal(readChart(JSON.parse(JSON.stringify({ ...energy, paths: [{ name: "A", energies: [null, null, null, null, null] }] }))), undefined);
  const nameless = chartFigure({ ...energy, states: ["", "TS1", "INT1", "TS2", "P"], unit: "**" }, em);
  assert.ok(nameless.texts.every((t) => t.text.trim()), "no caption without text");
}
// Three close levels in one state: no text is drawn through a level or onto another text.
{
  const close: EnergyChart = { ...NEW_ENERGY, ...energyOfTable({ paths: ["A", "B", "C"], rows: [["R", "0.0", "", ""], ["TS", "20.0", "17.0 TS′", "14.0 TS′′"], ["P", "-10.0", "", ""]] })!, ...place, frame: [11.2, 12] };
  const fig = energyFigure(close, em), at = fig.texts.filter((t) => /^(value|second|name):\d+:1$|^state:1$/.test(t.role!)).map((t) => t.at[1]).sort((a, b) => a - b);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 1.0 * em, `texts ${(at[i] - at[i - 1]).toFixed(2)} apart`);
  const levels = fig.lines.filter((l) => /^level:\d+:1$/.test(l.role!)).map((l) => l.from[1]);
  for (const y of at) for (const l of levels) assert.ok(y >= l + 0.3 * em || y <= l - 0.95 * em, "no text sits on a level");
}
// The axis title stays clear of the first state's text when that level is at the top.
{
  const top: EnergyChart = { ...NEW_ENERGY, ...energyOfTable({ paths: ["A"], rows: [["R", "30"], ["P", "0"]] })!, ...place, unit: "Relative Gibbs energy (kJ/mol)" };
  const fig = energyFigure(top, em), title = fig.texts.find((t) => t.role === "axis-title")!, value = fig.texts.find((t) => t.role === "value:0:0")!;
  assert.ok(title.at[1] >= value.at[1] + 1.2 * em, "a long title goes over the text it reaches");
  // A short title that does not reach the first value stays by the axis's top.
  const short = energyFigure({ ...top, unit: "E" }, em).texts.find((t) => t.role === "axis-title")!;
  assert.ok(Math.abs(short.at[1] - (top.frame[1] + 0.9 * em)) < 1e-9);
}
// Edit Data with a state or a path taken out: each part's changes stay with what it shows.
{
  const t = { paths: ["A"], rows: [["R", "0"], ["TS1", "20"], ["INT", "5"], ["TS2", "15"], ["P", "-10"]] }, d0 = energyOfTable(t)!;
  const [m0] = placePlot(blank, { ...NEW_ENERGY, ...d0, ...place }, env), g = m0.groups![0];
  const m: Mol = { ...m0, captions: m0.captions!.map((c) => (c.role!.role === "state:3" ? { ...c, text: "TS2 (rds)" } : c)), arrows: m0.arrows!.map((a) => (a.role!.role === "level:0:3" ? { ...a, colour: "#123456" } : a)) };
  const t2 = { ...t, rows: t.rows.map((r) => (r[0] === "INT" ? ["INT", ""] : r)) }, after = replot(m, g.id, energyOfTable(t2, d0)!, env, { rename: energyRoles(t2) });
  assert.equal(after.captions!.find((c) => c.role!.role === "state:2")!.text, "TS2 (rds)", "TS2's own name moves with TS2");
  assert.equal(after.arrows!.find((a) => a.role!.role === "level:0:2")!.colour, "#123456", "and so does its colour");
  assert.equal(after.captions!.find((c) => c.role!.role === "state:3")!.text, "P");
  assert.equal(after.arrows!.find((a) => a.role!.role === "level:0:3")!.colour, undefined);
  assert.equal(after.arrows!.filter((a) => a.role!.role.startsWith("level:")).length, 4);
  assert.ok(after.groups![0].items.every((id) => after.captions!.some((c) => c.id === id) || after.arrows!.some((a) => a.id === id)), "the removed state's parts left the group");
  // A path taken out.
  const [p0] = placePlot(blank, energy, env), pm: Mol = { ...p0, captions: p0.captions!.map((c) => (c.role!.role === "value:1:1" ? { ...c, text: "18.6 (rds)" } : c)) };
  const noA = { paths: table.paths, rows: table.rows.map((r) => [r[0], "", r[2]]) }, pa = replot(pm, p0.groups![0].id, energyOfTable(noA, energy)!, env, { rename: energyRoles(noA) });
  assert.equal(pa.captions!.find((c) => c.role!.role === "value:0:1")!.text, "18.6 (rds)", "path B's text stays with path B");
  assert.equal((pa.groups![0].plot as EnergyChart).paths[0].colour, energy.paths[1].colour);
  // A condition taken out of a sensitivity screen.
  const [r0] = placePlot(blank, radar, env), rm: Mol = { ...r0, captions: r0.captions!.map((c) => (c.role!.role === "axis:3" ? { ...c, colour: "#123456" } : c)) };
  const rows = rowsOfRadar(radar).map((r, i) => (i === 1 ? ["", ""] : r)), ra = replot(rm, r0.groups![0].id, { axes: radarOfRows(rows)! }, env, { rename: radarRoles(rows) });
  assert.equal(ra.captions!.find((c) => c.role!.role === "axis:2")!.colour, "#123456");
  assert.equal(ra.captions!.find((c) => c.role!.role === "axis:2")!.text, "Low O\u2082");
}
// Text and its runs change together, in memory and after CDXML (which gives a run's keys in another order).
{
  for (const read of [(m: Mol) => m, (m: Mol) => fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol]) {
    const m = read(placePlot(blank, radar, env)[0]), g = m.groups!.find((x) => x.plot)!;
    const after = replot(m, g.id, { axes: radar.axes.map((x, i) => (i === 1 ? { ...x, label: "Low conc" } : x)) }, env), c = after.captions!.find((x) => x.role!.role === "axis:1")!;
    assert.equal(c.text, "Low conc");
    assert.equal(c.runs, undefined, "the old italic run is gone with the old text");
  }
  const [m0] = placePlot(blank, energy, env), g = m0.groups![0], bold: Mol = { ...m0, captions: m0.captions!.map((c) => (c.role!.role === "value:0:1" ? { ...c, runs: [{ text: "24.3", bold: true as const }] } : c)) };
  const next = energyOfTable({ ...table, rows: table.rows.map((r) => (r[0] === "TS1" ? ["TS1", "28.0 (22.0)", r[2]] : r)) }, energy)!;
  const v = replot(bold, g.id, next, env).captions!.find((c) => c.role!.role === "value:0:1")!;
  assert.equal(v.text, "28.0");
  assert.equal(v.runs, undefined, "restyled text that then changes takes the new text whole");
  const kept = replot(bold, g.id, { join: "dashed" }, env).captions!.find((c) => c.role!.role === "value:0:1")!;
  assert.deepEqual(kept.runs, [{ text: "24.3", bold: true }], "restyled text that stays the same keeps its style");
  const typed: Mol = { ...m0, captions: m0.captions!.map((c) => (c.role!.role === "state:1" ? { ...c, text: "TS one" } : c)) };
  const renamed = energyOfTable({ ...table, rows: table.rows.map((r) => (r[0] === "TS1" ? ["*TS*1", r[1], r[2]] : r)) }, energy)!;
  const n = replot(typed, g.id, renamed, env).captions!.find((c) => c.role!.role === "state:1")!;
  assert.equal(n.text, "TS one");
  assert.equal(n.runs, undefined, "text the user typed does not take the new runs");
}
// A sensitivity screen stays round under a resize: a side handle changes its size, and nothing slides.
{
  const [m] = placePlot(blank, radar, env), g = m.groups![0], edge = (x: Mol) => { const r = x.arrows!.find((a) => a.role!.role === "ring:0")!.curve!.points.map((q) => q.at); return [Math.min(...r.map((q) => q[0])), Math.min(...r.map((q) => q[1])), Math.max(...r.map((q) => q[0])), Math.max(...r.map((q) => q[1]))]; };
  const right = reframe(m, g.id, [0, 0, 10, 10], [0, 0, 14, 10], env), rp = right.groups![0].plot!;
  assert.deepEqual(rp.frame, [14, 14], "the frame stays square");
  assert.ok(Math.abs(edge(right)[3] - edge(right)[1] - 14) < 1e-9, "and the screen is as large as its frame");
  assert.ok(Math.abs((edge(right)[1] + edge(right)[3]) / 2 - 5) < 1e-9, "it grows about its middle on the side not dragged");
  const left = reframe(m, g.id, [0, 0, 10, 10], [-4, 0, 10, 10], env);
  assert.ok(Math.abs(edge(left)[3] - edge(left)[1] - 14) < 1e-9 && Math.abs(Math.max(...left.arrows!.flatMap((a) => (a.role!.role.startsWith("spoke") ? [a.from[0]] : []))) - 3) < 1e-9, "the left handle grows it to the left");
  assert.deepEqual(rescale(m, g.id, (q) => [q[0] * 2, q[1]], [2, 1], 1, env).groups![0].plot!.frame, [10, 10], "a stretch one way leaves it round");
}
// A chart reads as a chart on the canvas for a screen reader.
{
  const [m] = placePlot(blank, energy, env), items = describe(m, { box: () => undefined });
  assert.ok(items.some((i) => i.role === "chart" && i.name === "Energy diagram"), JSON.stringify(items.map((i) => [i.role, i.name])));
}
// New parts from Edit Data take the chart's draw order and are not lifted over its lines.
{
  const [m0] = placePlot(blank, { ...radar, zones: false }, env), g = m0.groups![0];
  const ordered: Mol = { ...m0, captions: m0.captions!.map((c) => ({ ...c, order: 2 })), arrows: m0.arrows!.map((a) => ({ ...a, order: 2 })) };
  const zoned = onTop(ordered, replot(ordered, g.id, { zones: true }, env), () => []);
  assert.ok(zoned.arrows!.filter((a) => a.role!.role.startsWith("zone")).every((a) => a.order === 2), "new zones have the chart's order");
  const list = zoned.arrows!.map((a) => a.role!.role);
  assert.ok(list.findIndex((r) => r.startsWith("spoke")) > list.findLastIndex((r) => r.startsWith("zone")), "and come before its lines in the list");
}

// --- Simple first: the sheet, the page and the panel (docs/plans/charts.md, the design of 11 November) ---
// A new energy diagram's sheet names R, TS and P and has no numbers, so nothing reaches the page that nobody typed.
{
  assert.equal(energyOfTable(tableOfEnergy(NEW_ENERGY)), undefined, "no chart until a number is typed");
  assert.deepEqual(tableOfEnergy(NEW_ENERGY).rows, [["R", ""], ["TS", ""], ["P", ""]]);
  // The sheet always has one empty row, and one empty column for the next path.
  const sheet = spare([["", ""], ["R", ""], ["TS", ""], ["P", ""]], [61, 13], true);
  assert.deepEqual(sheet, [["", ""], ["R", ""], ["TS", ""], ["P", ""], ["", ""]]);
  const typed = spare(sheet.map((r, i) => (i === 4 ? ["INT", "5"] : r)), [61, 13], true);
  assert.equal(typed.length, 6, "typing in the empty row gives a new one");
  assert.equal(typed[0].length, 3, "and a value gives an empty column for a second path");
  assert.deepEqual(spare([["a", "1"], ["", ""], ["", ""], ["", ""]], [24, 2], false), [["a", "1"], ["", ""]], "extra empty rows go");
  assert.equal(spare(Array.from({ length: 24 }, () => ["a", "1"]), [24, 2], false).length, 24, "no more rows than the chart can hold");
  assert.equal(spare(typed, [61, 13], true).length, typed.length, "a sheet that has its empty row is left as it is");
}
// A sensitivity screen's scale holds every value: it grows by whole steps when a value is past it, and a scale typed
// that would cut a value off is not sound.
{
  const axes = [{ label: "a", value: -120 }, { label: "b", value: 60, second: 80 }, { label: "c", value: 0 }];
  assert.deepEqual(coverScale({ axes, min: -100, max: 50, step: 25 }), { min: -125, max: 100 });
  assert.deepEqual(coverScale({ axes: radar.axes, min: -100, max: 50, step: 25 }), { min: -100, max: 50 }, "a scale that holds them is left");
  assert.equal(soundScale({ axes, min: -125, max: 100, step: 25 }), true);
  assert.equal(soundScale({ axes, min: -100, max: 100, step: 25 }), false, "a value past the edge");
  assert.equal(soundScale({ axes: radar.axes, min: -100, max: 50, step: 0.001 }), false, "too many rings");
  assert.equal(soundScale({ axes: radar.axes, min: 50, max: -100, step: 25 }), false);
}
// Text typed over a chart's caption on the page is the chart's data.
{
  const [m0] = placePlot(blank, energy, env), g = m0.groups![0], cap = (m: Mol, role: string) => m.captions!.find((c) => c.role?.role === role)!, level = (m: Mol, role: string) => m.arrows!.find((a) => a.role?.role === role)!;
  const type = (m: Mol, role: string, text: string): Mol => followCharts(m, { ...m, captions: m.captions!.map((c) => (c.role?.role === role ? { ...c, text, runs: undefined } : c)) }, env);
  const record = (m: Mol) => m.groups![0].plot as EnergyChart;
  // A number over a value: the record has it, the level moves, and the page shows the record's spelling.
  const a = type(m0, "value:0:1", "28");
  assert.equal(record(a).paths[0].energies[1], 28);
  assert.equal(cap(a, "value:0:1").text, "28.0");
  assert.ok(level(a, "level:0:1").from[1] > level(m0, "level:0:1").from[1], "the level moves up");
  assert.equal(cap(a, "value:0:1").id, cap(m0, "value:0:1").id);
  assert.deepEqual(tableOfEnergy(record(a)).rows[1], ["TS1", "28.0 (22.0)", "18.6 TS1′"], "Edit data shows it");
  // A minus typed as a hyphen, a decimal comma, and a second value in brackets, as a cell takes them.
  assert.equal(record(type(m0, "value:0:2", "-3,5")).paths[0].energies[2], -3.5);
  assert.deepEqual([record(type(m0, "value:0:1", "30 (25)")).paths[0].energies[1], record(type(m0, "value:0:1", "30 (25)")).paths[0].second![1]], [30, 25]);
  assert.equal(record(type(m0, "second:0:1", "(21.5)")).paths[0].second![1], 21.5);
  assert.equal(cap(type(m0, "second:0:1", "(21.5)"), "second:0:1").text, "(21.5)");
  // Text that is no number stays a label and changes no data.
  const label = type(m0, "value:0:1", "n.d.");
  assert.equal(record(label), record(m0), "the record is the same one");
  assert.equal(cap(label, "value:0:1").text, "n.d.");
  // More places typed than the chart has: every value shows them.
  assert.equal(record(type(m0, "value:0:1", "24.35")).places, 2);
  assert.equal(cap(type(m0, "value:0:1", "24.35"), "value:0:0").text, "0.00");
  // A name typed over a state's, a path's own, the key's and the axis title is that name in the record.
  assert.equal(record(type(m0, "state:1", "TS-a")).states[1], "TS-a");
  assert.equal(record(type(m0, "name:1:1", "TS-b")).paths[1].names![1], "TS-b");
  assert.equal(record(type(m0, "name:1:1", "TS-b")).states[1], "TS1", "a path's own name is not the state's");
  assert.equal(record(type(m0, "keyname:1", "via B")).paths[1].name, "via B");
  assert.equal(record(type(m0, "axis-title", "E (eV)")).unit, "E (eV)");
  assert.equal(cap(type(m0, "state:1", "TS-a"), "state:1").text, "TS-a", "and the page keeps what was typed");
  // Then Edit data with nothing changed leaves the typed name as it is.
  const named = type(m0, "state:1", "TS-a"), same = replot(named, g.id, { join: "dashed" }, env);
  assert.equal(cap(same, "state:1").text, "TS-a");
  // A sensitivity screen's condition.
  const [r0] = placePlot(blank, radar, env), rn = followCharts(r0, { ...r0, captions: r0.captions!.map((c) => (c.role?.role === "axis:2" ? { ...c, text: "Water", runs: undefined } : c)) }, env);
  assert.equal((rn.groups![0].plot as RadarChart).axes[2].label, "Water");
  // An edit that is not text (a move, a colour), an edit to another object, and Edit data itself change no record.
  assert.equal(followCharts(m0, { ...m0, captions: m0.captions!.map((c) => ({ ...c, x: c.x + 1 })) }, env).groups![0].plot, g.plot);
  assert.equal(followCharts(m0, replot(m0, g.id, { join: "dashed" }, env), env).groups![0].plot === g.plot, false, "Edit data's own record stays");
  assert.equal(retyped(energy, "tick:10/n", "12"), undefined, "an axis number is not data");
  assert.equal(retyped(energy, "value:9:9", "12"), undefined);
  assert.equal(retyped(energy, "value:0:1", ""), undefined);
  // Typing is quick: it runs on every edit of the drawing.
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) followCharts(m0, { ...m0, atoms: [] }, env);
  assert.ok(performance.now() - t0 < 100, "an edit elsewhere costs nothing to speak of");
}
// The panel: Show brings back an axis deleted on the page, and a path's colour leaves a level coloured by hand.
{
  const [m0] = placePlot(blank, energy, env), g = m0.groups![0], has = (m: Mol, start: string) => [...m.captions!, ...m.arrows!].some((x) => x.role!.role.startsWith(start));
  const gone: Mol = { ...m0, arrows: m0.arrows!.filter((a) => a.role!.role !== "axis"), groups: m0.groups!.map((x) => ({ ...x, items: x.items.filter((id) => m0.arrows!.find((a) => a.id === id)?.role?.role !== "axis") })) };
  assert.equal(replot(gone, g.id, { join: "dashed" }, env).arrows!.some((a) => a.role!.role === "axis"), false, "a deleted axis stays deleted");
  const hidden = replot(gone, g.id, { axis: false }, env);
  assert.equal(has(hidden, "tick:"), false, "Hide the axis takes its ticks and title too");
  const shown2 = replot(hidden, g.id, { axis: true }, env, { revive: (r) => /^(axis|tick:|axis-title)/.test(r) });
  assert.ok(shown2.arrows!.some((a) => a.role!.role === "axis") && has(shown2, "tick:") && has(shown2, "axis-title"), "Show the axis brings all of it back");
  const hand: Mol = { ...m0, arrows: m0.arrows!.map((a) => (a.role!.role === "level:0:1" ? { ...a, colour: "#123456" } : a)) };
  const recoloured = replot(hand, g.id, { paths: energy.paths.map((p, i) => (i === 0 ? { ...p, colour: "#00AA00" } : p)) }, env);
  assert.equal(recoloured.arrows!.find((a) => a.role!.role === "level:0:1")!.colour, "#123456", "a level coloured by hand keeps its colour");
  assert.equal(recoloured.arrows!.find((a) => a.role!.role === "level:0:0")!.colour, "#00AA00");
  assert.equal(recoloured.captions!.find((c) => c.role!.role === "value:0:0")!.colour, "#00AA00", "the path's text follows");
  assert.equal(recoloured.arrows!.find((a) => a.role!.role === "level:1:1")!.colour, energy.paths[1].colour, "the other path is left");
}

// --- What the second review of 11 November found ---
// Ticks deleted by hand stay deleted when a new value changes the axis, and the ticks left take the new numbers.
{
  const [m0] = placePlot(blank, energy, env), g = m0.groups![0], isTick = (x: { role?: { role: string } }) => !!x.role?.role.startsWith("tick:");
  const bare: Mol = { ...m0, captions: m0.captions!.filter((c) => !isTick(c)), arrows: m0.arrows!.filter((a) => !isTick(a)) }, kept = new Set([...bare.captions!, ...bare.arrows!].map((x) => x.id));
  const plain: Mol = { ...bare, groups: bare.groups!.map((x) => ({ ...x, items: x.items.filter((id) => kept.has(id)) })) };
  const higher = energyOfTable({ ...table, rows: table.rows.map((r) => (r[0] === "TS1" ? ["TS1", "45.0", r[2]] : r)) }, energy)!;
  const after = replot(plain, g.id, higher, env);
  assert.equal([...after.captions!, ...after.arrows!].some(isTick), false, "no tick comes back");
  const relabelled = replot(m0, g.id, higher, env).captions!.filter(isTick).map((c) => c.text);
  assert.ok(relabelled.includes("40") && !relabelled.includes("30"), `ticks left take the new numbers: ${relabelled}`);
}
// A state's name is the state's (state:k), whichever path carries it: deleted, it stays deleted when that path leaves
// the state, and its changes stay with it.
{
  const t = { paths: ["A", "B"], rows: [["R", "0", "0"], ["INT", "5", "8"], ["P", "-10", "-10"]] }, d0 = energyOfTable(t)!;
  const [m0] = placePlot(blank, { ...NEW_ENERGY, ...d0, ...place }, env), g = m0.groups![0], name = m0.captions!.find((c) => c.role!.role === "state:1")!;
  const cleared = { ...t, rows: t.rows.map((r) => (r[0] === "INT" ? ["INT", "", "8"] : r)) };
  const without: Mol = { ...m0, captions: m0.captions!.filter((c) => c !== name), groups: m0.groups!.map((x) => ({ ...x, items: x.items.filter((id) => id !== name.id) })) };
  assert.equal(replot(without, g.id, energyOfTable(cleared, d0)!, env, { rename: energyRoles(cleared) }).captions!.some((c) => c.role!.role === "state:1"), false, "a deleted name stays deleted");
  const mine: Mol = { ...m0, captions: m0.captions!.map((c) => (c === name ? { ...c, colour: "#123456", text: "Int. 1" } : c)) };
  const moved = replot(mine, g.id, energyOfTable(cleared, d0)!, env, { rename: energyRoles(cleared) }).captions!.find((c) => c.role!.role === "state:1")!;
  assert.deepEqual([moved.text, moved.colour, moved.id], ["Int. 1", "#123456", name.id], "a changed name keeps its changes under another path's level");
}
// Paths at one energy share the level's text, and the later path's own name and second value are still drawn.
{
  const d = energyOfTable({ paths: ["A", "B"], rows: [["R", "0", "0 (1.5) R′"], ["P", "-10", "-10"]] })!, fig = energyFigure({ ...NEW_ENERGY, ...d, ...place }, em), texts = fig.texts.map((t) => t.text);
  assert.ok(texts.includes("R′") && texts.includes("(1.5)") && texts.filter((t) => t === "0.0").length === 1, `${texts}`);
}
// Three levels with the lower two close: no text on a level or on another text. And a level is as wide as its text.
{
  const d = energyOfTable({ paths: ["A", "B", "C"], rows: [["R", "0", "0", "0"], ["TS", "25", "18 TS′", "17 TS′′"], ["P", "-10", "-10", "-10"]] })!;
  const fig = energyFigure({ ...NEW_ENERGY, ...d, ...place, frame: [11.2, 12] }, em), at = fig.texts.filter((t) => /^(value|second|name):\d+:1$|^state:1$/.test(t.role!)).map((t) => t.at[1]).sort((a, b) => a - b);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] - at[i - 1] >= 1.0 * em, `texts ${((at[i] - at[i - 1]) / em).toFixed(2)} em apart`);
  for (const y of at) for (const l of fig.lines.filter((x) => /^level:\d+:1$/.test(x.role!))) assert.ok(y >= l.from[1] + 0.3 * em || y <= l.from[1] - 0.95 * em, "no text sits on a level");
  const long = energyFigure({ ...NEW_ENERGY, ...energyOfTable({ paths: ["A"], rows: [["Reactant complex", "-1234.56"], ["P", "0"]] })!, ...place, frame: [6, 8] }, em), lv = long.lines.find((l) => l.role === "level:0:0")!;
  assert.ok(lv.to[0] - lv.from[0] >= Math.min(widthOf("Reactant complex", em), 0.8 * ((6 - 1.2 * em) / 2)) - 1e-9, "a level is as wide as its text, up to most of its slot");
}
// A sensitivity screen with a small step: ring values do not pile up, and they show the step's places.
{
  const fine = radarFigure({ ...radar, step: 5 }, em), ys = fine.texts.filter((t) => t.role?.startsWith("tick:")).map((t) => t.at[1]).sort((a, b) => a - b);
  assert.ok(ys.length < 30 && ys.length > 3);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 0.8 * em - 1e-9, "ring values have room");
  assert.ok(fine.texts.some((t) => t.text === "0%"), "the ring at 0 is one of those named");
  assert.ok(radarFigure({ ...radar, min: -1, max: 0.5, step: 0.25, axes: radar.axes.map((x) => ({ label: x.label, value: 0 })) }, em).texts.some((t) => t.text === "\u22120.25%"), "a step with two places shows them");
  // Many conditions: no two names lie on each other.
  const many = radarFigure({ ...radar, axes: Array.from({ length: 24 }, (_, i) => ({ label: `Condition ${i + 1}`, value: -i })) }, em).texts.filter((t) => t.role?.startsWith("axis:"));
  const box = (t: (typeof many)[number]) => { const w = widthOf(t.text, em), x0 = t.align === "left" ? t.at[0] : t.align === "right" ? t.at[0] - w : t.at[0] - w / 2; return [x0, t.at[1] - 0.2 * em, x0 + w, t.at[1] + 0.7 * em]; };
  for (const a of many) for (const b of many) if (a !== b) { const p = box(a), q = box(b); assert.ok(!(p[0] < q[2] && p[2] > q[0] && p[1] < q[3] && p[3] > q[1]), `${a.text} lies on ${b.text}`); }
}
// A chart read from CDXML, then a condition taken out: every name is aligned as a new chart's is.
{
  const m = fromCdxml(toCdxml(placePlot(blank, radar, env)[0], DEFAULT_STYLE)).mol, g = m.groups!.find((x) => x.plot)!;
  const rows = rowsOfRadar(radar).map((r, i) => (i === 1 ? ["", ""] : r)), after = replot(m, g.id, { axes: radarOfRows(rows)! }, env, { rename: radarRoles(rows) });
  const fresh = placePlot(blank, { ...radar, axes: radarOfRows(rows)! }, env)[0], align = (x: Mol) => Object.fromEntries(x.captions!.filter((c) => c.role!.role.startsWith("axis:")).map((c) => [c.role!.role, c.align ?? "centre"]));
  assert.deepEqual(align(after), align(fresh));
}
// After Bring to Front (every part with a draw order), zones that Edit data adds stay behind the chart's lines.
{
  const [m0] = placePlot(blank, { ...radar, zones: false }, env), g = m0.groups![0];
  const ordered: Mol = { ...m0, captions: m0.captions!.map((c, i) => ({ ...c, order: 200 + i })), arrows: m0.arrows!.map((a, i) => ({ ...a, order: 100 + i })) };
  const zoned = replot(ordered, g.id, { zones: true }, env), zones = zoned.arrows!.filter((a) => a.role!.role.startsWith("zone")), lines = zoned.arrows!.filter((a) => /^(spoke|data)/.test(a.role!.role));
  assert.ok(Math.max(...zones.map((a) => a.order!)) <= Math.min(...lines.map((a) => a.order!)), "new zones are not over the spokes or the line of values");
}

// A level moved alone (a double-click, then a drag) keeps its offset when the chart is drawn again, as any part of a
// page figure does: every part is an ordinary object, and nothing in a chart is held in place.
{
  const [m0] = placePlot(blank, energy, env), g = m0.groups![0], level = (m: Mol) => m.arrows!.find((a) => a.role!.role === "level:0:1")!;
  const moved: Mol = { ...m0, arrows: m0.arrows!.map((a) => (a.role!.role === "level:0:1" ? { ...a, from: [a.from[0] + 0.5, a.from[1] + 0.25], to: [a.to[0] + 0.5, a.to[1] + 0.25] } : a)) };
  const next = energyOfTable({ ...table, rows: table.rows.map((r) => (r[0] === "TS1" ? ["TS1", "28.0 (22.0)", r[2]] : r)) }, energy)!;
  const fresh = level(replot(m0, g.id, next, env)), kept = level(replot(moved, g.id, next, env));
  assert.ok(Math.abs(kept.from[0] - fresh.from[0] - 0.5) < 1e-9 && Math.abs(kept.from[1] - fresh.from[1] - 0.25) < 1e-9, "the level is at its new energy, as far off as the user moved it");
}
console.log("charts: ok");
