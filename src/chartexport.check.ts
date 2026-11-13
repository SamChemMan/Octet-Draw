// Run: node src/chartexport.check.ts. Fails loudly if a chart on the page (docs/plans/charts.md) leaves Octet as
// anything but what the page shows: a line, curve or caption that is not an ordinary object in the CDXML or the CDX
// with its colour, style, fill, text, size and italic; a file that a reader with no use for Octet's own data draws in
// other places or in another order (a zone over the lines); a file that reads back as another drawing; a name read as
// chemistry; or a copy whose Edit Data changes the original. It reads CDXML, CDX, .oct, Octet's clipboard copy and the
// structure files. The pictures (SVG, PDF, PNG, EMF and the rest) are made from the canvas in the app, so this check
// does not see them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Arrow, Caption, Group, Mol } from "./render.ts";
import { fromCdxml, parseXml, toCdxml, type Xml } from "./cdxml.ts";
import { cdxToXml, isCdx, xmlToCdx } from "./cdx.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { parse, serialize } from "./file.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import { widthOf } from "./arial.ts";
import { duplicateSelection, EMPTY, extractSelection, fitSizes, insertMol, labelable, sprout, transformParts, withCaptionAtoms } from "./edit.ts";
import { formulaCaption } from "./labels.ts";
import { reorder } from "./order.ts";
import { lonePlot, placePlot, plotShift, reframe, replot, rescale, type PlotEnv } from "./pageplot.ts";
import { energyOfTable, energyRoles, NEW_ENERGY, NEW_RADAR, radarOfRows, radarRoles, rowsOfRadar, type Chart, type EnergyChart, type RadarChart } from "./charts.ts";
import { toChemfig } from "./chemfig.ts";
import { model3mf } from "./model3mf.ts";

type P = [number, number];
const style = DEFAULT_STYLE, B = style.bond, env: PlotEnv = { captionSize: style.captionSize, bond: B, measure: (t) => widthOf(t, 1) };
// What a file's rounding leaves (bond lengths): CDXML and CDX keep hundredths of a point, Octet's own JSON 0.0001.
const FILE = 0.0051 / B, JSON_FILE = 0.000051;

// Stefan's example (charts.check.ts): two paths, the first with second values, the second with names of its own.
const table = { paths: ["Path A", "Path B"], rows: [["R", "0.0 (0.0)", "0.0"], ["TS1", "24.3 (22.0)", "18.6 TS1′"], ["INT1", "5.2 (4.1)", "−3.4 INT1′"], ["TS2", "15.8 (14.9)", "12.1 TS2′"], ["P", "−12.5 (−13.0)", "−12.5"]] };
// Each chart at the frame the editor gives a new one (Editor.tsx applyChart), at a place that is not 0,0.
const energy: EnergyChart = { ...NEW_ENERGY, ...energyOfTable(table)!, frame: [18, 12], origin: [-11.3, -4.7], scale: 1, text: 1, roles: [] };
const radar: RadarChart = { ...NEW_RADAR, frame: [10, 10], origin: [3.1, -12.9], scale: 1, text: 1, roles: [], axes: NEW_RADAR.axes.map((x, i) => ({ ...x, value: [-10, -5, -60, -20, -35, 0, -90, 5, -15, -25][i], ...(i === 2 ? { second: -30 } : {}) })) };
const on = (chart: Chart, m: Mol = EMPTY) => placePlot(m, chart, env)[0];
const charts = (m: Mol) => (m.groups ?? []).filter((g) => g.plot), chartOf = (m: Mol) => charts(m)[0];
const role = (x: Arrow | Caption) => x.role?.role ?? "", starts = (r: string) => (x: Arrow | Caption) => role(x).startsWith(r);
const caption = (m: Mol, r: string) => m.captions!.find((c) => role(c) === r)!, line = (m: Mol, r: string) => m.arrows!.find((a) => role(a) === r)!;

// --- The drawings checked ---
// The user's own changes (a level recoloured, a name typed over, a value moved, the axis title deleted), then Edit
// Data with a state more: its parts are new, with ids after every other id, and one name is italic in its path's colour.
const moreTable = { ...table, rows: [...table.rows, ["Q", "−20.0 (−21.0)", "−25.0 *Q*′"]] };
function energyEdited(): Mol {
  const m0 = on(energy), g = chartOf(m0), title = caption(m0, "axis-title").id;
  const m: Mol = { ...m0, arrows: m0.arrows!.map((a) => (role(a) === "level:0:1" ? { ...a, colour: "#123456" } : a)), groups: [{ ...g, items: g.items.filter((id) => id !== title) }],
    captions: m0.captions!.filter((c) => c.id !== title).map((c) => (role(c) === "value:0:2" ? { ...c, x: c.x + 1 } : role(c) === "state:3" ? { ...c, text: "TS2 (rds)" } : c)) };
  return replot(m, g.id, energyOfTable(moreTable, energy)!, env, { rename: energyRoles(moreTable) });
}
// A screen drawn without zones, then Edit Data with zones and a condition more: the zones are new parts.
function radarEdited(): Mol {
  const m = on({ ...radar, zones: false }), rows = [...rowsOfRadar(radar), ["Slow *add.*", "−45"]];
  return replot(m, chartOf(m).id, { zones: true, axes: radarOfRows(rows)! }, env, { rename: radarRoles(rows) });
}
const all = (m: Mol) => new Set(charts(m).flatMap((g) => g.items));
const moved = (m: Mol) => transformParts(m, new Set(), all(m), (q) => [q[0] + 5.37, q[1] - 2.71]);
// Scale… 150% with Labels and lines on: text at 15 pt and 12 pt, lines half as wide again.
const scaled = (m: Mol) => rescale(m, chartOf(m).id, (q) => [q[0] * 1.5, q[1] * 1.5], [1.5, 1.5], 1.5, env);
// Rotate… by 30° and Flip Horizontal (transformParts): the record is then not in use (pageplot.ts plotShift), and the
// chart is the lines, curves and turned text it shows.
const turned = (m: Mol) => transformParts(m, new Set(), all(m), (q) => [q[0] * Math.cos(Math.PI / 6) - q[1] * Math.sin(Math.PI / 6), q[0] * Math.sin(Math.PI / 6) + q[1] * Math.cos(Math.PI / 6)]);
const flipped = (m: Mol) => transformParts(m, new Set(), all(m), (q) => [6.2 - q[0], q[1]], [1, 1], undefined, 1, "across");
const structure = sprout(sprout(sprout(EMPTY, [-20, 8]), 0), 1);
const cases: [string, Mol][] = [
  ["energy diagram", on(energy)], ["energy diagram, curved joins", on({ ...energy, join: "curve" })], ["energy diagram, dashed joins", on({ ...energy, join: "dashed" })],
  ["energy diagram, one path, no axis", on({ ...energy, ...energyOfTable({ paths: ["Path 1"], rows: [["R", "0"], ["TS", "80"], ["P", "−40"]] })!, axis: false })],
  ["sensitivity screen", on(radar)], ["sensitivity screen, no zones", on({ ...radar, zones: false })],
  ["energy diagram, moved", moved(on(energy))], ["sensitivity screen, moved", moved(on(radar))],
  ["energy diagram, scaled", scaled(on(energy))], ["sensitivity screen, scaled", scaled(on(radar))],
  ["energy diagram after Edit Data", energyEdited()], ["sensitivity screen after Edit Data", radarEdited()],
  ["both beside a structure", on(radar, on(energy, structure))],
  ["energy diagram, turned", turned(on(energy))], ["sensitivity screen, flipped", flipped(on(radar))],
];
{
  // The cases hold what they are for: two paths in two colours, bold levels, dashed and curved joins, a dashed second
  // line, zones, small ring values, italic names, and parts from Edit Data.
  const [e, r, ee, re] = [cases[0][1], cases[4][1], cases[10][1], cases[11][1]];
  assert.ok(energy.paths[0].colour && energy.paths[1].colour && line(e, "level:0:1").colour === energy.paths[0].colour && line(e, "level:1:1").colour === energy.paths[1].colour && line(e, "level:0:1").style === "bold");
  assert.equal(cases[1][1].arrows!.filter((a) => a.kind === "curve").length, 8);
  assert.equal(cases[2][1].arrows!.filter((a) => a.style === "dashed").length, 8);
  assert.deepEqual(caption(e, "axis-title").runs, [{ text: "Δ" }, { text: "G", italic: true }, { text: " (kJ/mol)" }]);
  assert.equal(r.arrows!.filter(starts("zone:")).length, 6);
  assert.ok(line(r, "second").style === "dashed" && line(r, "data").style === "bold" && caption(r, "tick:0").size === 8 && caption(r, "axis:0").runs?.[1].italic);
  assert.ok(caption(ee, "name:1:5").runs?.[0].italic && caption(ee, "name:1:5").colour === energy.paths[1].colour && caption(ee, "state:3").text === "TS2 (rds)" && line(ee, "level:0:1").colour === "#123456" && !caption(ee, "axis-title"));
  assert.ok(Math.max(...ee.captions!.filter(starts("state:5")).map((c) => c.id)) > Math.max(...e.captions!.map((c) => c.id), ...e.arrows!.map((a) => a.id)), "Edit Data's new parts have new ids");
  assert.ok(re.arrows!.filter(starts("zone:")).length === 6 && re.arrows!.filter(starts("spoke:")).length === 11);
  assert.ok(cases[8][1].captions!.every((c) => c.size === 15) && cases[9][1].captions!.some((c) => c.size === 12) && cases[9][1].arrows!.every((a) => a.scale === 1.5));
  assert.ok(cases[13][1].captions!.every((c) => c.angle === 30) && cases.slice(13).every(([, m]) => chartOf(m).plot && !plotShift(m, chartOf(m))) && cases.slice(0, 13).every(([, m]) => charts(m).every((g) => plotShift(m, g))));
}

// --- The page's draw order ---
// Octet draws in layers (order.ts, and Editor.tsx): filled closed curves under everything, then structures, then the
// other lines and curves, then text, each in its list's order. No part here has a draw order of its own.
const isFill = (a: Arrow) => !!(a.curve?.closed && a.fill);
const drawn = (m: Mol): (Arrow | Caption)[] => [...m.arrows!.filter(isFill), ...m.arrows!.filter((a) => !isFill(a)), ...m.captions!];
for (const [name, m] of cases) {
  assert.ok([...m.arrows!, ...m.captions!].every((x) => !x.order), `${name}: no draw order`);
  // A role by its start ("zone:") or whole ("data"), among the lines and curves.
  const order = drawn(m).filter((x) => "from" in x).map(role), is = (r: string) => (x: string) => (r.endsWith(":") ? x.startsWith(r) : x === r);
  const last = (r: string) => order.map(is(r)).lastIndexOf(true), first = (r: string) => order.findIndex(is(r));
  if (first("zone:") < 0) continue;
  // The zones are under the spokes, the rings and the lines of values, and each zone is over the larger one before it.
  assert.ok(m.arrows!.filter(starts("zone:")).every(isFill), `${name}: a zone is a filled closed curve`);
  for (const r of ["spoke:", "ring:", "second", "data"]) assert.ok(first(r) > last("zone:"), `${name}: the zones are under ${r}`);
  assert.ok(first("data") > last("spoke:") && first("data") > last("second"), `${name}: the line of values is over the spokes`);
  const widths = m.arrows!.filter(starts("zone:")).map((a) => Math.max(...a.curve!.points.map((q) => q.at[0])) - Math.min(...a.curve!.points.map((q) => q.at[0])));
  assert.ok(widths.every((w, k) => !k || w < widths[k - 1]), `${name}: each zone is smaller than the one under it`);
}

// --- CDXML and CDX as a reader with no use for Octet's data sees them ---
// Two values the same within tol: numbers, and lists and records of them, with nothing for undefined.
const near = (a: unknown, b: unknown, tol: number): boolean => typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= tol
  : a === b || (a == null && b == null) || (!!a && !!b && typeof a === "object" && typeof b === "object" && [...new Set([...Object.keys(a), ...Object.keys(b)])].every((k) => near((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], tol)));
function alike(what: string, got: unknown[], want: unknown[], tol: number) {
  assert.equal(got.length, want.length, `${what}: ${got.length} for ${want.length}`);
  want.forEach((w, k) => assert.ok(near(got[k], w, tol), `${what}, number ${k}: ${JSON.stringify(got[k])} for ${JSON.stringify(w)}`));
}
// An object as the format's own attributes give it (never the Octet attribute): points on the page (pt, y down).
type Seen = { z: number; id: number; kind: "line" | "curve" | "text"; colour?: string; style?: string; width?: number; points?: P[]; closed?: boolean; filled?: boolean; heads?: boolean;
  text?: string; at?: P; box?: number[]; align?: string; turn?: number; chemical?: boolean; runs?: { text: string; size: number; italic: boolean; bold: boolean; script: boolean; colour: string }[] };
function objects(root: Xml) {
  const rows = root.kids.find((k) => k.name === "colortable")!.kids.map((c) => `#${["r", "g", "b"].map((k) => Math.round(Number(c.attrs[k]) * 255).toString(16).padStart(2, "0")).join("")}`.toUpperCase());
  // A colour by its number: 0 black, 1 white, then the table's rows; with none, the document's.
  const hex = (n = root.attrs.color ?? "0") => (n === "0" ? "#000000" : n === "1" ? "#FFFFFF" : rows[Number(n) - 2]);
  const nums = (s?: string) => (s ?? "").trim().split(/\s+/).filter(Boolean).map(Number), pairs = (v: number[]) => Array.from({ length: v.length >> 1 }, (_, k): P => [v[2 * k], v[2 * k + 1]]);
  const styleOf = (t?: string) => (t === "Bold" ? "bold" : t === "Dashed" ? "dashed" : t), heads = (x: Xml) => !!(x.attrs.ArrowheadHead || x.attrs.ArrowheadTail);
  // A line's width: its own, or the document's.
  const lineWidth = (x: Xml, bold: boolean) => Number(x.attrs[bold ? "BoldWidth" : "LineWidth"] ?? root.attrs[bold ? "BoldWidth" : "LineWidth"]);
  const seen: Seen[] = [], old: Xml[] = [], groups: { box: number[]; ids: number[] }[] = [], structures: number[] = [];
  const walk = (x: Xml, group?: number[]) => {
    for (const k of x.kids) {
      const id = Number(k.attrs.id), z = Number(k.attrs.Z);
      if (k.name === "group") { const ids: number[] = []; groups.push({ box: nums(k.attrs.BoundingBox), ids }); walk(k, ids); continue; }
      if (k.name === "fragment") { structures.push(z); continue; }
      // A line is an arrow with no heads, with its copy for a reader of old files (a graphic the arrow supersedes).
      if (k.name === "graphic" && k.attrs.SupersededBy) { old.push(k); continue; }
      group?.push(id);
      if (k.name === "arrow") seen.push({ z, id, kind: "line", colour: hex(k.attrs.color), style: styleOf(k.attrs.LineType), width: lineWidth(k, k.attrs.LineType === "Bold"), heads: heads(k), points: [pairs(nums(k.attrs.Tail3D).slice(0, 2))[0], pairs(nums(k.attrs.Head3D).slice(0, 2))[0]] });
      else if (k.name === "curve") {
        const bits = Number(k.attrs.CurveType ?? 0), bold = !!(bits & 4);
        // CurveType: closed 1, dashed 2, bold 4, filled 128. Closed and FillType say the same again.
        assert.equal(!!(bits & 1), k.attrs.Closed === "yes", "a curve's Closed and its CurveType agree");
        assert.equal(!!(bits & 128), k.attrs.FillType === "Solid", "a curve's FillType and its CurveType agree");
        assert.equal(bits & ~(1 | 2 | 4 | 128), 0, "a chart's curve has no arrowhead, shading or double line");
        seen.push({ z, id, kind: "curve", colour: hex(k.attrs.color), style: bold ? "bold" : bits & 2 ? "dashed" : undefined, width: lineWidth(k, bold), heads: heads(k), closed: !!(bits & 1), filled: !!(bits & 128), points: pairs(nums(k.attrs.CurvePoints)) });
      } else if (k.name === "t") {
        const just = k.attrs.Justification, face = (s: Xml) => Number(s.attrs.face ?? 0);
        assert.equal(k.attrs.CaptionJustification, just, "a caption's two justifications agree");
        // RotationAngle: degrees clockwise, times 65536; here anticlockwise from 0 to 360, as Octet turns text.
        seen.push({ z, id, kind: "text", at: pairs(nums(k.attrs.p))[0], box: nums(k.attrs.BoundingBox), turn: (360 - Number(k.attrs.RotationAngle ?? 0) / 65536) % 360, align: just === "Right" ? "right" : just === "Center" ? "centre" : just === undefined ? "left" : just, chemical: k.attrs.InterpretChemically !== "no",
          text: k.kids.map((s) => s.text).join(""), runs: k.kids.map((s) => ({ text: s.text, size: Number(s.attrs.size), italic: !!(face(s) & 2), bold: !!(face(s) & 1), script: !!(face(s) & 0x60), colour: hex(s.attrs.color ?? k.attrs.color) })) });
        assert.ok(k.kids.every((s) => s.name === "s"), "a caption holds text runs only");
      } else assert.fail(`a ${k.name} on the page: not a group, a line, a curve or text`);
    }
  };
  walk(root.kids.find((k) => k.name === "page")!);
  return { parts: seen.sort((p, q) => p.z - q.z), old, groups, structures };
}
// What the page shows of a part, as such a reader would give it: the same things, in bond lengths, y up.
function shown(x: Arrow | Caption): Omit<Seen, "z" | "id" | "box"> {
  const colour = (c?: string) => (c ?? "#000000").toUpperCase();
  if (!("from" in x)) return { kind: "text", text: x.text, at: [x.x, x.y], align: x.align ?? "centre", turn: (((x.angle ?? 0) % 360) + 360) % 360, chemical: x.chemical !== false,
    runs: (x.runs ?? [{ text: x.text }]).map((r) => ({ text: r.text, size: r.size ?? x.size ?? style.captionSize, italic: !!(r.italic ?? x.italic), bold: !!(r.bold ?? x.bold), script: !!r.script, colour: colour(r.colour ?? x.colour) })) };
  const width = (x.style === "bold" ? style.bold : style.line) * (x.scale ?? 1), heads = !!((x.start && x.start !== "none") || (x.end && x.end !== "none"));
  return x.curve ? { kind: "curve", colour: colour(x.colour), style: x.style, width, heads, closed: !!x.curve.closed, filled: x.fill === "solid", points: x.curve.points.flatMap((q): P[] => [q.c1 ?? q.at, q.at, q.c2 ?? q.at]) }
    : { kind: "line", colour: colour(x.colour), style: x.style, width, heads, points: [x.from, x.to] };
}
for (const [name, m] of cases) {
  const xml = toCdxml(m, style), tree = parseXml(xml);
  // The .oct file is this CDXML with Octet's own copy in a comment after it, so ChemDraw sees the same from both.
  assert.ok(writeOct(m, style).startsWith(xml) && /^<!--Octet 1 [0-9a-f]{16} [A-Za-z0-9+/=]+-->\n$/.test(writeOct(m, style).slice(xml.length)), `${name}: the .oct is the CDXML and a comment`);
  for (const [how, root] of [["CDXML", tree], ["CDX", cdxToXml(xmlToCdx(tree))]] as const) {
    const what = `${name}, ${how}`, { parts, old, groups, structures } = objects(root), page = drawn(m);
    assert.equal(Number(root.attrs.BondLength), B);
    // Every part is there, once. Z rises as the page draws: the lines and curves in the page's order, then the text
    // (which text is over which makes no difference to the picture, so captions are compared in an order of their own).
    assert.equal(parts.length, page.length, `${what}: ${parts.length} objects for ${page.length} parts`);
    assert.equal(new Set([...parts.map((s) => s.z), ...structures]).size, parts.length + structures.length, `${what}: two objects at one Z`);
    // Where the page's 0,0 is in the file, from the first part's first point; then every point of every part, to the
    // hundredth of a point the file keeps (twice that, for the first point's own rounding).
    const s0 = parts.find((s) => s.points)!.points![0], q0 = shown(page[0]).points![0], o: P = [s0[0] - q0[0] * B, s0[1] + q0[1] * B], toPage = (q: P): P => [o[0] + q[0] * B, o[1] - q[1] * B];
    const want = page.map((x) => { const w = shown(x); return { ...w, id: x.id, ...(w.points ? { points: w.points.map(toPage) } : {}), ...(w.at ? { at: toPage(w.at) } : {}) }; });
    const texts = <T extends { kind: string; text?: string; at?: P }>(xs: T[]) => xs.filter((x) => x.kind === "text").sort((p, q) => (p.text! < q.text! ? -1 : p.text! > q.text! ? 1 : Math.abs(p.at![0] - q.at![0]) > 0.05 ? p.at![0] - q.at![0] : p.at![1] - q.at![1]));
    const marks = <T extends { kind: string }>(xs: T[]) => xs.filter((x) => x.kind !== "text"), bare = (xs: Seen[]) => xs.map(({ z: _z, box: _box, ...x }) => x);
    // Each with its id: the ids are Octet's own, so a part keeps its id through the file.
    alike(`${what}: lines and curves in draw order`, bare(marks(parts)), marks(want), 0.0101);
    alike(`${what}: captions`, bare(texts(parts)), texts(want), 0.0101);
    // Lines: no heads, and each one's old copy says the same (its Z, colour, style and ends).
    const byId = new Map(parts.map((s) => [s.id, s])), lines = parts.filter((s) => s.kind === "line");
    assert.ok(parts.every((s) => s.kind === "text" || s.heads === false), `${what}: a line or curve with a head`);
    assert.equal(old.length, lines.length, `${what}: an old copy for each line`);
    for (const g of old) {
      const a = byId.get(Number(g.attrs.SupersededBy))!, box = g.attrs.BoundingBox.trim().split(/\s+/).map(Number);
      assert.ok(a?.kind === "line" && Number(g.attrs.Z) === a.z && g.attrs.GraphicType === "Line" && !g.attrs.ArrowType, `${what}: an old copy of no line`);
      assert.equal(g.attrs.LineType, a.style === "bold" ? "Bold" : a.style === "dashed" ? "Dashed" : undefined, `${what}: an old copy's style`);
      assert.ok(near(box, [...a.points![1], ...a.points![0]], 1e-9), `${what}: an old copy's ends`);
    }
    // Text: text only (never chemistry), no subscripts, and its box agrees with its anchor and its side (text that is
    // not turned: a turned text's box goes round it).
    for (const t of parts.filter((s) => s.kind === "text")) {
      assert.ok(t.chemical === false && t.runs!.every((r) => !r.script), `${what}: "${t.text}" is read as chemistry`);
      const [l, top, r, bottom] = t.box!, x = t.align === "left" ? l : t.align === "right" ? r : (l + r) / 2;
      assert.ok(r > l && bottom > top && (t.turn || (Math.abs(x - t.at![0]) <= 0.0101 && top < t.at![1] && bottom > t.at![1])), `${what}: "${t.text}" has a box that is not round its text`);
    }
    // The zones are under every other part, and filled; nothing else is filled.
    const fills = parts.filter((s) => s.filled), rest = parts.filter((s) => !s.filled);
    assert.equal(fills.length, m.arrows!.filter(starts("zone:")).length, `${what}: the filled curves are the zones`);
    assert.ok(fills.every((f) => f.closed && rest.every((s) => s.z > f.z)), `${what}: a zone over a line or text`);
    assert.ok(rest.filter((s) => s.kind !== "text").every((s) => parts.filter((t) => t.kind === "text").every((t) => t.z > s.z)), `${what}: text under a line`);
    // A structure on the page is over the zones and under the lines, as the page's layers are.
    assert.equal(structures.length, m.atoms.length ? 1 : 0);
    assert.ok(structures.every((z) => fills.every((s) => s.z < z) && rest.every((s) => s.z > z)), `${what}: the structure's place in the draw order`);
    // One plain group for each chart, holding its parts and nothing else, with a box that holds them.
    assert.equal(groups.length, charts(m).length, `${what}: a group for each chart`);
    assert.deepEqual(groups.map((g) => [...g.ids].sort((p, q) => p - q)).sort((p, q) => p[0] - q[0]), charts(m).map((g) => [...g.items].sort((p, q) => p - q)).sort((p, q) => p[0] - q[0]), `${what}: each group's parts`);
    for (const g of groups) for (const s of g.ids.map((id) => byId.get(id)!)) for (const q of s.points ?? [s.at!]) assert.ok(q[0] >= g.box[0] - 0.02 && q[0] <= g.box[2] + 0.02 && q[1] >= g.box[1] - 0.02 && q[1] <= g.box[3] + 0.02, `${what}: a part outside its group's box`);
  }
  // The record and the roles are in the Octet attributes and nowhere else in the file.
  assert.doesNotMatch(xml.replace(/ Octet="[^"]*"/g, ""), /plot|role|energy|radar|zone:|level:/, `${name}: Octet's data outside the Octet attribute`);
}
// A chart brought to the front or sent to the back (order.ts reorder): each part then has a draw order of its own,
// lowest first, and they keep their order among themselves. Z in the file rises the same way, with the structure under
// all of the chart or over all of it, and Octet's own file keeps each part's order. (Edit Data on such a chart is not
// checked here.)
for (const front of [true, false]) {
  const m0 = on(radar, structure), m = reorder(m0, [], all(m0), front), what = `a screen ${front ? "brought to the front" : "sent to the back"}`;
  const lowestFirst = [...m.arrows!, ...m.captions!].sort((p, q) => p.order! - q.order!);
  assert.ok(lowestFirst.every((x) => (front ? x.order! > 0 : x.order! < 0)) && new Set(lowestFirst.map((x) => x.order)).size === lowestFirst.length, `${what}: each part has its own order`);
  assert.deepEqual(lowestFirst.map(role), drawn(m0).map(role), `${what}: the parts keep their order among themselves`);
  for (const [how, root] of [["CDXML", parseXml(toCdxml(m, style))], ["CDX", cdxToXml(xmlToCdx(parseXml(toCdxml(m, style))))]] as const) {
    const { parts, structures } = objects(root);
    assert.deepEqual(parts.map((s) => s.id), lowestFirst.map((x) => x.id), `${what}, ${how}: Z rises as the page draws`);
    assert.ok(structures.length === 1 && parts.every((s) => (front ? s.z > structures[0] : s.z < structures[0])), `${what}, ${how}: the structure's place in the draw order`);
  }
  const back = readOct(writeOct(m, style), true).mol;
  assert.deepEqual([...back.arrows!, ...back.captions!].sort((p, q) => p.order! - q.order!).map(role), lowestFirst.map(role), `${what}, .oct: each part's order`);
}

// --- Reading back ---
// A part as a drawing holds it, without its id: what is compared after a file.
const lineOf = (a: Arrow) => ({ kind: a.kind, from: a.from, to: a.to, colour: a.colour?.toUpperCase(), style: a.style, fill: a.fill, closed: !!a.curve?.closed, points: a.curve?.points.map((q) => [q.at, q.c1 ?? q.at, q.c2 ?? q.at]),
  heads: [a.start, a.end, a.head, a.headSize], bend: a.bend, width: a.width, scale: a.scale ?? 1, order: a.order });
const textOf = (c: Caption) => ({ text: c.text, at: [c.x, c.y], align: c.align ?? "centre", colour: c.colour?.toUpperCase(), size: c.size, chemical: c.chemical, bold: c.bold, italic: c.italic, underline: c.underline, font: c.font, angle: c.angle, width: c.width,
  lineHeight: c.lineHeight, order: c.order, tied: [c.under, c.on, c.cycle, c.placed, c.property], runs: c.runs?.map((r) => ({ text: r.text, italic: r.italic, bold: r.bold, underline: r.underline, script: r.script, size: r.size, font: r.font, colour: r.colour?.toUpperCase() })) });
// Captions in one order whatever their ids: a reader lists them by id, and text over text looks the same either way.
const byText = (cs: Caption[]) => [...cs].sort((p, q) => (p.text < q.text ? -1 : p.text > q.text ? 1 : Math.abs(p.x - q.x) > 0.01 ? p.x - q.x : p.y - q.y));
// The lines and curves in the page's draw order: a reader lists the filled ones first, as the page draws them first.
const marksOf = (m: Mol) => [...(m.arrows ?? []).filter(isFill), ...(m.arrows ?? []).filter((a) => !isFill(a))];
// The drawing read back: the same lines and curves in the same draw order, the same captions, the same atoms, and
// each chart's parts in one group.
function same(what: string, back: Mol, m: Mol, tol: number) {
  alike(`${what}: lines and curves`, marksOf(back).map(lineOf), marksOf(m).map(lineOf), tol);
  alike(`${what}: captions`, byText(back.captions ?? []).map(textOf), byText(m.captions!).map(textOf), tol);
  alike(`${what}: atoms`, back.atoms.map((a) => [a.label, a.location]), m.atoms.map((a) => [a.label, a.location]), tol);
  assert.ok(!back.shapes?.length && !back.cycles?.length && !back.spectra?.length, `${what}: something more in the drawing`);
  assert.equal(back.groups?.length, m.groups!.length, `${what}: groups`);
  // Each group lists the parts at the same places in the lists.
  const at = (x: Mol) => new Map([...marksOf(x).map((a, k) => [a.id, `a${k}`] as const), ...byText(x.captions ?? []).map((c, k) => [c.id, `c${k}`] as const)]);
  const lists = (x: Mol) => x.groups!.map((g) => g.items.map((id) => at(x).get(id)).sort().join(" ")).sort();
  assert.deepEqual(lists(back), lists(m), `${what}: each group's parts`);
  const ids = [...(back.arrows ?? []), ...(back.captions ?? []), ...back.groups!].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, `${what}: an id twice`);
}
// A group's chart in another drawing: the one with the same parts.
const twin = (back: Mol, m: Mol, g: Group) => back.groups!.find((x) => x.items.length === g.items.length && near(lineOf(back.arrows!.find((a) => x.items.includes(a.id))!), lineOf(m.arrows!.find((a) => g.items.includes(a.id))!), 1e-3))!;
// One chart's parts as a drawing of their own.
const only = (m: Mol, g: Group): Mol => ({ atoms: [], bonds: [], arrows: m.arrows!.filter((a) => g.items.includes(a.id)), captions: m.captions!.filter((c) => g.items.includes(c.id)), groups: [g] });
// Octet's own read: each chart keeps its record, its parts their roles, and the parts are where the record says, so a
// resize or Edit Data after opening gives what it gives before saving.
function kept(what: string, back: Mol, m: Mol, tol: number) {
  same(what, back, m, tol);
  for (const g of charts(m)) {
    const b = twin(back, m, g), ids = new Set(b.items), parts = [...back.arrows!, ...back.captions!].filter((x) => ids.has(x.id));
    assert.ok(b?.plot, `${what}: the record`);
    assert.deepEqual(b.plot, g.plot, `${what}: the record is the same`);
    const roles = (x: Mol, items: number[]) => new Map([...x.arrows!, ...x.captions!].filter((p) => items.includes(p.id)).map((p) => [role(p), p.role!.at]));
    assert.ok(parts.every((x) => x.role), `${what}: every part has its role`);
    assert.ok(near([...roles(back, b.items)].sort(), [...roles(m, g.items)].sort(), tol), `${what}: the roles`);
    assert.ok(near(plotShift(back, b), plotShift(m, g), 2 * tol), `${what}: the parts are where the record says`);
    // A chart that was turned or flipped keeps its record out of use.
    if (!plotShift(m, g)) { assert.equal(lonePlot(back, new Set(), ids), undefined, `${what}: a turned chart's record in use`); continue; }
    assert.equal(lonePlot(back, new Set(), ids)?.id, b.id, `${what}: picked whole, it is one chart`);
    // A resize by the right handle, and Edit Data, after the file and before it. Edit Data changes how the chart looks
    // and what its text says: every value to two places, and names and a title with other italics.
    const box: [number, number, number, number] = [0, 0, 10, 10], wide: [number, number, number, number] = [0, 0, 13, 10], chart = g.plot as Chart;
    const change: Partial<Chart> = chart.kind === "radar" ? { zones: !chart.zones, axes: chart.axes.map((x, k) => (k === 0 ? { ...x, label: "Very high *c*" } : k === 3 ? { ...x, label: "No O₂" } : x)) }
      : { join: "curve", key: false, places: 2, unit: "Δ*H* (kJ/mol)", states: chart.states.map((x, k) => (k === 1 ? "*TS*1" : x)) };
    for (const [edit, f] of [["a resize", (x: Mol, id: number) => reframe(x, id, box, wide, env)], ["Edit Data", (x: Mol, id: number) => replot(x, id, change, env)]] as const) {
      const after = f(back, b.id), before = f(m, g.id), gb = before.groups!.find((x) => x.id === g.id)!, ga = after.groups!.find((x) => x.id === b.id)!;
      assert.notEqual(before, m);
      same(`${what}, then ${edit}`, only(after, ga), only(before, gb), 2 * tol);
      assert.deepEqual(ga.plot, gb.plot, `${what}, then ${edit}: the record`);
    }
  }
}
// Another program's read (and Octet's of a file ChemDraw saved, which drops Octet's data): the same drawing, each
// chart a plain group of plain lines, curves and text.
function plainRead(what: string, back: Mol, m: Mol, tol: number) {
  same(what, back, m, tol);
  assert.ok(back.groups!.every((g) => !g.plot && !g.integral) && [...back.arrows!, ...back.captions!].every((x) => !x.role), `${what}: a record or a role from a file with none`);
}
const noOctet = (xml: string) => xml.replace(/ Octet="[^"]*"/g, ""), noComment = (oct: string) => oct.slice(0, oct.lastIndexOf("<!--Octet"));
for (const [name, m] of cases) {
  const xml = toCdxml(m, style), oct = writeOct(m, style), cdx = writeCdx(m, style), body = xmlToCdx(parseXml(xml));
  assert.ok(noOctet(xml).length < xml.length && !noOctet(xml).includes("Octet=") && noComment(oct) === xml && isCdx(cdx) && isCdx(body));
  // Octet's own files, and the clipboard's copy (file.ts): exact but for their rounding.
  kept(`${name}, .oct`, readOct(oct, true).mol, m, JSON_FILE);
  kept(`${name}, .cdx`, readCdx(cdx).mol, m, JSON_FILE);
  kept(`${name}, Octet's clipboard copy`, parse(serialize({ ...m, style })), m, JSON_FILE);
  // The CDXML alone: exported as .cdxml, on the clipboard, or a .oct whose comment is gone.
  kept(`${name}, CDXML`, fromCdxml(xml).mol, m, FILE);
  const bare = readOct(noComment(oct), true);
  assert.ok(bare.foreign && !bare.resaved);
  kept(`${name}, .oct without its comment`, bare.mol, m, FILE);
  // Without Octet's data: the CDXML with every Octet attribute taken out, and a CDX made from it.
  const foreign = fromCdxml(noOctet(xml));
  assert.deepEqual(foreign.lost, {}, `${name}: nothing a reader cannot hold`);
  plainRead(`${name}, CDXML without Octet's data`, foreign.mol, m, FILE);
  // A CDX keeps Octet's data too (cdx.ts, under Octet's own tag); one without it reads as plain parts.
  kept(`${name}, CDX from the CDXML`, readCdx(body).mol, m, FILE);
  const bareCdx = xmlToCdx(parseXml(noOctet(xml)));
  assert.deepEqual(readCdx(bareCdx).lost, {});
  plainRead(`${name}, CDX without Octet's data`, readCdx(bareCdx).mol, m, FILE);
  // Written again from what was read, the file is the same picture: nothing drifts from save to save.
  same(`${name}, CDXML saved twice`, fromCdxml(toCdxml(fromCdxml(xml).mol, style)).mol, m, 2 * FILE);
  plainRead(`${name}, another program's file saved by Octet`, fromCdxml(noOctet(toCdxml(foreign.mol, style))).mol, m, 2 * FILE);
}
// Octet 1.1.1 reads only the keys it knows: the keys a chart adds to Octet's own JSON are "plot" on its group and
// "role" on its parts, as a page spectrum's are (pageplot.check.ts). Without them it is the same drawing.
for (const [name, m] of cases) {
  const json = JSON.parse(serialize(m)), strip = (x: Record<string, unknown>[] | undefined, key: string) => x?.forEach((o) => delete o[key]);
  assert.equal(json.version, 1);
  strip(json.groups, "plot"); strip(json.captions, "role"); strip(json.arrows, "role");
  const bare: Mol = { ...m, captions: m.captions!.map(({ role: _, ...c }) => c), arrows: m.arrows!.map(({ role: _, ...a }) => a), groups: m.groups!.map(({ plot: _, ...g }) => g) };
  assert.deepEqual(json, JSON.parse(serialize(bare)), `${name}: a key Octet 1.1.1 does not know`);
  plainRead(`${name}, as Octet 1.1.1 reads it`, parse(JSON.stringify(json)), m, JSON_FILE);
}

// --- Text only: never chemistry ---
// A state named P or INT1 would read as a label (edit.ts labelable; since 1.2's label fixes TS1 does not). The
// chart's text has Interpret Chemically off, so it adds nothing to the formula, the mass, the names or a structure
// file, on the page and after every file.
const { ready, parseStructure, toCml, toInchi, toMolfile, toSdf, toSmiles } = await (async () => {
  // chem.ts loads Indigo's wasm as a browser does; these stand in for the browser (as copyas.check.ts does).
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
  g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
  g.window = globalThis;
  g.self = { location: { origin: "file://" } };
  g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
  return import("./chem.ts");
})();
await ready;
{
  const e = cases[0][1], asked = e.captions!.filter(labelable).map((c) => c.text);
  for (const t of ["P", "INT1"]) assert.ok(asked.includes(t), `${t} reads as a label`);
  const flagless: Mol = { ...e, captions: e.captions!.map(({ chemical: _, ...c }) => c) };
  assert.ok(withCaptionAtoms(flagless, true).mol.atoms.some((a) => a.label === "P"), "without the flag, P would be phosphorus");
  // The structure files the editor writes (Editor.tsx formatOf): the drawing with its chemical captions as atoms. A MOL
  // file's header has the minute it was written, which is left out.
  const ethanol = parseStructure("CCO"), files = (x: Mol) => { const c = withCaptionAtoms(x, true).mol; return [toSmiles(c), toInchi(c), toMolfile(c), toMolfile(c, true), toSdf(c), toCml(c)].map((t) => t?.replace(/-INDIGO-\d+/g, "")); };
  assert.equal(files(ethanol)[0], "CCO");
  // Every glyph a box, as chemfig.check.ts measures.
  const pt = 4 / 3, S = { bond: B * pt, line: style.line * pt, bold: style.bold * pt, spacing: 0.18 * B * pt, hash: style.hash * pt, margin: 1.69 * pt, size: style.labelSize * pt };
  const ink = () => ({ width: 9.6, ascent: 9.5, outline: [[0, 0], [9.6, 0], [9.6, -9.5], [0, -9.5]] as P[] });
  for (const [name, m] of cases) {
    const reads: [string, Mol][] = [["on the page", m], ["after CDXML", fromCdxml(toCdxml(m, style)).mol], ["after CDXML without Octet's data", fromCdxml(noOctet(toCdxml(m, style))).mol], ["after CDX", readCdx(xmlToCdx(parseXml(toCdxml(m, style)))).mol],
      ["after .oct", readOct(writeOct(m, style), true).mol], ["pasted", insertMol(EMPTY, parse(serialize(extractSelection(m, new Set(m.atoms.map((_, i) => i)), new Set([...m.arrows!, ...m.captions!].map((x) => x.id))))), [0.8, -0.8]).mol]];
    for (const [how, x] of reads) {
      const what = `${name}, ${how}`;
      assert.ok(x.captions!.length === m.captions!.length && x.captions!.every((c) => c.chemical === false), `${what}: text with Interpret Chemically on`);
      assert.equal(withCaptionAtoms(x, true).mol, x, `${what}: text counted as atoms`);
      // The page draws a caption as a formula (subscripts) only where formulaCaption says so, and so does the CDXML.
      assert.ok(!x.captions!.some(formulaCaption), `${what}: text drawn as a formula`);
    }
    // A chart beside ethanol: only ethanol's atoms count, and (written for the first diagram and the first screen)
    // every structure file is ethanol's alone. A chart alone: no structure file at all (the editor writes one only for
    // a drawing with atoms), no chemfig code and no 3D model.
    const [e, c] = [insertMol(m, ethanol).mol, insertMol({ ...m, atoms: [], bonds: [] }, EMPTY).mol];
    assert.equal(withCaptionAtoms(e, true).mol, e, `${name}: text counted as atoms beside a structure`);
    if (m === cases[0][1] || m === cases[4][1]) assert.deepEqual(files(e), files(ethanol), `${name}: a structure file with the chart's text in it`);
    assert.equal(withCaptionAtoms(c, true).mol.atoms.length, 0, `${name}: atoms from a chart`);
    assert.equal(toChemfig(c, S, ink), "", `${name}: chemfig code from a chart`);
    assert.equal(model3mf(c), undefined, `${name}: a 3D model from a chart`);
  }
}

// --- Copy and paste ---
// Frozen through and through: an edit that changes what it was given, in place of making a new drawing, throws.
const frozen = <T>(x: T): T => { if (x && typeof x === "object" && !Object.isFrozen(x)) { Object.freeze(x); Object.values(x).forEach(frozen); } return x; };
// Copy and Paste as the editor does them (Editor.tsx copyOut and onPaste): the picked part with the document's style
// as Octet's clipboard copy, read back, fitted to the document it lands in, and put in 0.8 across and down.
const copyOf = (m: Mol, items: Set<number>) => serialize({ ...extractSelection(m, new Set(), items), style });
const paste = (m: Mol, clip: string, to = style) => { const add = parse(clip); return insertMol(m, add.style ? fitSizes(add, add.style, to) : add, [0.8, -0.8]); };
// Edit Data as the dialog gives it (ChartDialog.tsx): the table with a value changed, a state or a condition taken out
// (its cells emptied) and, for the diagram, a state more; the record it makes, and each role's new name.
const lessTable = { ...moreTable, rows: moreTable.rows.map((r) => (r[0] === "TS1" ? ["TS1", "30.0 (22.0)", r[2]] : r[0] === "INT1" ? ["INT1", "", ""] : r)) };
const lessRows = rowsOfRadar(radar).map((r, i) => (i === 0 ? [r[0], "−80"] : i === 1 ? ["", ""] : r));
for (const [chart, change, rename, check] of [
  [energy, energyOfTable(lessTable, energy)!, energyRoles(lessTable), (x: Mol) => caption(x, "value:0:1").text === "30.0" && x.arrows!.filter(starts("level:0:")).length === 5 && caption(x, "state:2").text === "TS2" && caption(x, "state:4").text === "Q"],
  [radar, { axes: radarOfRows(lessRows)!, zones: false }, radarRoles(lessRows), (x: Mol) => x.arrows!.filter(starts("spoke:")).length === 9 && !x.arrows!.some(starts("zone:")) && caption(x, "axis:1").text === "H₂O"],
] as [Chart, Partial<Chart>, (r: string) => string | undefined, (x: Mol) => boolean][]) {
  const name = chart.kind, m0 = frozen(on(chart, structure)), g0 = chartOf(m0), items = new Set(g0.items), parts = (m: Mol, g: Group) => [...m.arrows!, ...m.captions!].filter((x) => g.items.includes(x.id));
  // The original after an edit to a copy: the same record, and every part the very object it was.
  const untouched = (what: string, m: Mol) => {
    const g = m.groups!.find((x) => x.id === g0.id)!;
    assert.deepEqual(g, g0, `${name}, ${what}: the original's group or record changed`);
    assert.ok(m0.arrows!.every((a) => m.arrows!.includes(a)) && m0.captions!.every((c) => m.captions!.includes(c)) && m0.atoms.every((a, i) => m.atoms[i] === a), `${name}, ${what}: a part of the original changed`);
    assert.deepEqual(plotShift(m, g), [0, 0]);
  };
  // A copy: a chart with its own group, record, roles and ids, at its own place.
  const isCopy = (what: string, m: Mol, ids: Set<number>, shift: P) => {
    const gs = charts(m).filter((g) => g.id !== g0.id && g.items.every((id) => ids.has(id)));
    assert.equal(gs.length, 1, `${name}, ${what}: the copy is one chart`);
    const g = gs[0];
    assert.deepEqual(g.plot, g0.plot, `${name}, ${what}: the copy's record`);
    assert.ok(g.items.length === g0.items.length && g.items.every((id) => !items.has(id)) && ids.size === g.items.length, `${name}, ${what}: the copy's ids are its own`);
    assert.deepEqual(parts(m, g).map(role).sort(), parts(m0, g0).map(role).sort(), `${name}, ${what}: the copy's roles`);
    assert.ok(near(plotShift(m, g), shift, 1e-9), `${name}, ${what}: the copy is where it was put`);
    assert.equal(lonePlot(m, new Set(), new Set(g.items))?.id, g.id, `${name}, ${what}: picked whole, the copy is one chart`);
    const all = [...m.arrows!, ...m.captions!, ...m.groups!].map((x) => x.id);
    assert.equal(new Set(all).size, all.length, `${name}, ${what}: an id twice`);
    // Moved back by as much, the copy is the original again, part for part.
    same(`${name}, ${what}: the copy`, transformParts(only(m, g), new Set(), new Set(g.items), (q) => [q[0] - shift[0], q[1] - shift[1]]), only(m0, g0), JSON_FILE);
    return g;
  };
  // Option-drag and Duplicate (duplicateSelection), and Copy then Paste.
  const dup = duplicateSelection(m0, new Set(), items), pasted = paste(m0, copyOf(m0, items));
  untouched("duplicated", dup.mol);
  untouched("pasted", pasted.mol);
  const gd = isCopy("duplicated", dup.mol, dup.items, [0, 0]), gp = isCopy("pasted", pasted.mol, pasted.items, [0.8, -0.8]);
  assert.deepEqual([...dup.items].sort(), g0.items.map((id) => dup.ids.get(id)!).sort(), `${name}: each part's copy`);
  // The duplicate is dropped where the drag ends, so it is not left on top of the original.
  const dropped = transformParts(dup.mol, new Set(), dup.items, (q) => [q[0] + 3.3, q[1] - 2.2]);
  untouched("duplicated and dropped", dropped);
  assert.ok(near(plotShift(dropped, dropped.groups!.find((x) => x.id === gd.id)!), [3.3, -2.2], 1e-9), `${name}: the duplicate where it was dropped`);
  // Edit Data on the copy leaves the original as it was, and the copy shows the new data where the copy is.
  for (const [how, m, g, shift] of [["duplicated", frozen(dropped), dropped.groups!.find((x) => x.id === gd.id)!, [3.3, -2.2]], ["pasted", frozen(pasted.mol), gp, [0.8, -0.8]]] as [string, Mol, Group, P][]) {
    const after = replot(m, g.id, change, env, { rename }), ga = after.groups!.find((x) => x.id === g.id)!;
    untouched(`${how}, then Edit Data on the copy`, after);
    assert.ok(check({ ...after, arrows: parts(after, ga).filter((x): x is Arrow => "from" in x), captions: parts(after, ga).filter((x): x is Caption => !("from" in x)) }), `${name}, ${how}: the copy shows its new data`);
    assert.notDeepEqual(ga.plot, g0.plot);
    assert.ok(near(plotShift(after, ga), shift, 1e-9), `${name}, ${how}: the copy stays where it is`);
    const ids = [...after.arrows!, ...after.captions!, ...after.groups!].map((x) => x.id);
    assert.ok(new Set(ids).size === ids.length && ga.items.every((id) => !items.has(id)) && ga.items.every((id) => [...after.arrows!, ...after.captions!].some((x) => x.id === id)), `${name}, ${how}: the copy's ids after Edit Data`);
    // A resize of the copy, too.
    untouched(`${how}, then a resize of the copy`, reframe(m, g.id, [0, 0, 10, 10], [0, 0, 13, 12], env));
    // And the other way: Edit Data on the original leaves the copy as it was, and gives the original what it gave the
    // copy, part for part.
    const other = replot(m, g0.id, change, env, { rename });
    same(`${name}, ${how}: Edit Data on the copy and on the original`, transformParts(only(after, ga), new Set(), new Set(ga.items), (q) => [q[0] - shift[0], q[1] - shift[1]]), only(other, other.groups!.find((x) => x.id === g0.id)!), JSON_FILE);
    assert.deepEqual(other.groups!.find((x) => x.id === g.id), g, `${name}, ${how}: Edit Data on the original changed the copy's record`);
    assert.ok(parts(m, g).every((x) => [...other.arrows!, ...other.captions!].includes(x)), `${name}, ${how}: Edit Data on the original changed the copy`);
    // Both in one file: two charts, each with its own record at its own place; for another program, two plain groups.
    kept(`${name}, ${how}, then Edit Data on the copy, CDXML`, fromCdxml(toCdxml(after, style)).mol, after, FILE);
    kept(`${name}, ${how}, then Edit Data on the copy, .oct`, readOct(writeOct(after, style), true).mol, after, JSON_FILE);
    plainRead(`${name}, ${how}, then Edit Data on the copy, CDXML without Octet's data`, fromCdxml(noOctet(toCdxml(after, style))).mol, after, FILE);
  }
  // A part of the chart copied without the rest is plain: no role, no record, and the original keeps every part.
  const some = new Set(g0.items.slice(0, 7));
  for (const [how, r] of [["duplicated", duplicateSelection(m0, new Set(), some)], ["pasted", paste(m0, copyOf(m0, some))]] as const) {
    untouched(`a part ${how}`, r.mol);
    assert.ok(r.items.size === 7 && [...r.mol.arrows!, ...r.mol.captions!].filter((x) => r.items.has(x.id)).every((x) => !x.role) && charts(r.mol).length === 1, `${name}: a part ${how} is plain`);
  }
  // The chart copied with its structure, and everything on the page copied: the chart comes whole.
  const everything = new Set([...m0.arrows!, ...m0.captions!].map((x) => x.id)), atoms = new Set(m0.atoms.map((_, i) => i));
  const whole = insertMol(m0, parse(serialize({ ...extractSelection(m0, atoms, everything), style })), [0.8, -0.8]);
  untouched("pasted with its structure", whole.mol);
  isCopy("pasted with its structure", whole.mol, whole.items, [0.8, -0.8]);
  assert.equal(whole.mol.atoms.length, 2 * m0.atoms.length);
  // Pasted into a document with other sizes (30 pt bonds, 12 pt captions): places are in bond lengths, so the copy
  // keeps its shape, its record and its roles, and its text keeps its proportion to it (edit.ts fitSizes).
  const big = { ...style, bond: 30, captionSize: 12 }, there = paste(EMPTY, copyOf(m0, items), big), gt = chartOf(there.mol), k = big.bond / style.bond;
  assert.ok(gt?.plot && near(plotShift(there.mol, gt), [0.8, -0.8], 1e-9) && there.mol.captions!.every((c) => c.role && c.chemical === false), `${name}: pasted into a document with other sizes`);
  // Its record keeps its text at the size it was pasted at, so a resize or Edit data there lays it out the same.
  assert.deepEqual(gt.plot, { ...g0.plot!, text: g0.plot!.text * ((style.captionSize * k) / big.captionSize) });
  const bigEnv: PlotEnv = { captionSize: big.captionSize, bond: big.bond, measure: env.measure }, again = replot(there.mol, gt.id, {}, bigEnv);
  alike(`${name}: drawn again in a document with other sizes`, byText(again.captions!).map((c) => [c.text, c.x, c.y]), byText(there.mol.captions!).map((c) => [c.text, c.x, c.y]), JSON_FILE);
  const back = transformParts(only(there.mol, gt), new Set(), new Set(gt.items), (q) => [q[0] - 0.8, q[1] + 0.8]), was = only(m0, g0);
  alike(`${name}: its lines in a document with other sizes`, marksOf(back).map(lineOf), marksOf(was).map(lineOf), JSON_FILE);
  alike(`${name}: its text in a document with other sizes`, byText(back.captions!).map((c) => [c.text, c.x, c.y, c.size]), byText(was.captions!).map((c) => [c.text, c.x, c.y, Math.round((c.size ?? style.captionSize) * k * 100) / 100]), JSON_FILE);
}
console.log("chartexport.check: ok");
