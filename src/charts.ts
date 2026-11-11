// Charts on the page (Object > Add Chart): an energy diagram and a sensitivity screen. Each is a page figure, as a
// page spectrum is (pageplot.ts): a group of ordinary lines, curves and captions that keeps what it shows (its record)
// and each part's role, so a resize or Edit Data draws it again and keeps what the user changed. This file holds the
// records, the figure each gives, the table the dialog shows for each, and the reader for a record from a file.
import type { Figure } from "./spectrumplot.ts";
import { SMALL, tint } from "./spectrumplot.ts";
import { markupRuns } from "./experiment.ts";
import { plainOf, styled } from "./richtext.ts";
import { HIGHLIGHT_COLOURS, RING_FILLS } from "./docstyle.ts";
import { widthOf } from "./arial.ts";

type P = [number, number];
// What every page figure's record has (pageplot.ts): its name, its frame (bond lengths), where Octet placed it, the
// scale it was drawn at, how much its text and lines were scaled, and every role Octet placed last.
type Base = { title: string; frame: P; origin: P; scale: number; text: number; roles: string[] };
// A path through the states: its energy at each state (null: it does not go through that state), a second value at
// each (written in brackets under the first: ΔH beside ΔG), and a name of its own for a state (TS1′).
export type EnergyPath = { name: string; colour?: string; energies: (number | null)[]; second?: (number | null)[]; names?: (string | null)[] };
// An energy diagram. unit: the axis's title; join: how a path's levels are joined; places: decimal places of the
// values; frame: the axis's height and the width of the levels.
export type EnergyChart = Base & { kind: "energy"; states: string[]; paths: EnergyPath[]; unit: string; join: "line" | "dashed" | "curve"; axis: boolean; key: boolean; places: number };
// A sensitivity screen (L. Pitzer, F. Schäfers, F. Glorius, Angew. Chem. Int. Ed. 2019, 58, 8572): the deviation of
// the yield from the standard conditions (%), on an axis for each condition changed. min is at the edge and max at the
// centre, so a sensitive reaction covers a large area. second: a second value, joined by a dashed line.
export type RadarChart = Base & { kind: "radar"; axes: { label: string; value: number; second?: number }[]; min: number; max: number; step: number; zones: boolean };
export type Chart = EnergyChart | RadarChart;
export const isChart = (p: { kind: string }): p is Chart => p.kind === "energy" || p.kind === "radar";
export const chartName = (c: Chart) => (c.kind === "energy" ? "Energy diagram" : "Sensitivity screen");

export const MAX_STATES = 60, MAX_PATHS = 12, MAX_AXES = 24, MAX_RINGS = 40;
// A new path's colour: one path alone is in the document's ink.
const PATH_COLOURS = ["Red", "Blue", "Green", "Orange", "Purple", "Teal", "Pink", "Brown", "Slate", "Gold", "Cyan", "Indigo"].map((n) => HIGHLIGHT_COLOURS.find(([name]) => name === n)![1]);
const named = (n: string) => RING_FILLS.find(([name]) => name === n)![1], LOSS = named("Red"), GAIN = named("Green"), HIGH = named("Teal"), SMALL_LOSS = named("Sand");
// A zone's colour, for the step from v to u on a scale from min to max, banded as the paper's diagrams are: the outer
// half of the losses in two reds, the inner half pale (a small loss is not a sensitive reaction), the gains green and,
// past half of the largest gain, teal. A step across 0 is grey.
function zoneFill(v: number, u: number, min: number, max: number): string {
  if (u <= 1e-9) { const t = min < 0 ? v / min : 1; return t > 0.5 + 1e-9 ? tint(LOSS, t > 0.75 + 1e-9 ? 0.7 : 0.4) : tint(SMALL_LOSS, 0.3); }
  return v >= -1e-9 ? tint(max > 0 && u / max > 0.5 + 1e-9 ? HIGH : GAIN, 0.45) : "#EEEEEE";
}

// A number as the page shows it: a true minus sign, and never "−0.0".
export function shown(v: number, places: number, plus = false): string {
  const s = v.toFixed(places), zero = Number(s) === 0;
  return zero ? s.replace("-", "") : v < 0 ? s.replace("-", "−") : plus ? `+${s}` : s;
}
// Text with *italic* and **bold** as a caption takes it (experiment.ts markupRuns).
function marked(text: string) {
  const runs = markupRuns([{ text }]);
  return { text: plainOf(runs), ...(styled(runs) ? { runs } : {}) };
}
const empty = (): Figure => ({ lines: [], curves: [], texts: [] });

// --- Energy diagram -----------------------------------------------------------------------------------------------
// An axis's step: 1, 2 or 5 times a power of ten, for about five steps over the span.
function stepOf(span: number): number {
  const raw = span / 5, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
// The figure, its axis's foot at [0, 0]. em: the caption size in bond lengths.
export function energyFigure(c: EnergyChart, em: number): Figure {
  const fig = empty(), [W, H] = c.frame, n = c.states.length, all = c.paths.flatMap((p) => p.energies.filter((v): v is number => v !== null));
  if (!n || !all.length) return fig;
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const st = stepOf(hi - lo), a = Math.floor(lo / st + 1e-9) * st, b = Math.ceil(hi / st - 1e-9) * st, y = (v: number) => ((v - a) / (b - a)) * H;
  const left = c.axis ? 1.2 * em : 0, slot = (W - left) / n, mid = (k: number) => left + (k + 0.5) * slot, line = 1.2 * em, wide = (t: string) => widthOf(t, em);
  // Each state's levels, top down, with their text: the value, and under it the second value and the name. The state's
  // name (role state:k) goes with the first path through it that has no name of its own. Paths at the same energy
  // share one level's text: the first path's, then any other path's second value or own name that differs.
  type Text = { text: string; runs?: Figure["texts"][number]["runs"]; role: string; colour?: string };
  type Level = { v: number; value: Text; under: Text[] };
  const levels = c.states.map((state, k): Level[] => {
    const named = c.paths.findIndex((p) => p.energies[k] != null && !p.names?.[k]), out: Level[] = [];
    c.paths.forEach((p, pi) => {
      const v = p.energies[k], sec = p.second?.[k], own = p.names?.[k], paint = p.colour ? { colour: p.colour } : {};
      if (v == null) return;
      const second = sec == null ? undefined : { text: `(${shown(sec, c.places)})`, role: `second:${pi}:${k}`, ...paint };
      const name = own ? { ...marked(own), role: `name:${pi}:${k}`, ...paint } : pi === named && state ? { ...marked(state), role: `state:${k}`, ...paint } : undefined;
      const same = out.find((e) => Math.abs(e.v - v) < 1e-9);
      if (!same) out.push({ v, value: { text: shown(v, c.places), role: `value:${pi}:${k}`, ...paint }, under: [second, name].filter((t): t is Text => !!t) });
      else for (const t of [second, name]) if (t && !same.under.some((u) => u.text === t.text)) same.under.push(t);
    });
    return out.sort((p, q) => q.v - p.v);
  });
  // A level is at least as wide as its widest text, so a join does not run through a number.
  const widest = Math.max(0, ...levels.flat().flatMap((e) => [e.value, ...e.under]).map((t) => wide(t.text))), half = Math.min(slot * 0.4, Math.max(slot * 0.25, widest / 2));
  if (c.axis) {
    const places = st < 1 ? Math.min(3, Math.ceil(-Math.log10(st) - 1e-9)) : 0;
    fig.lines.push({ from: [0, 0], to: [0, H], role: "axis" });
    // A tick's role is its place on the axis, so one the user deleted stays deleted when the values change.
    for (let v = a, k = 0; v <= b + st / 2 && k < 50; v += st, k++) {
      fig.lines.push({ from: [-0.3 * em, y(v)], to: [0, y(v)], role: `tick:${k}` });
      fig.texts.push({ text: shown(v, places), at: [-0.5 * em, y(v) - 0.35 * em], align: "right", role: `tick:${k}/n` });
    }
  }
  c.paths.forEach((p, pi) => {
    const paint = p.colour ? { colour: p.colour } : {}, at = p.energies.flatMap((v, k) => (v === null || k >= n ? [] : [k]));
    for (const k of at) fig.lines.push({ from: [mid(k) - half, y(p.energies[k]!)], to: [mid(k) + half, y(p.energies[k]!)], style: "bold", ...paint, role: `level:${pi}:${k}` });
    at.slice(1).forEach((j, q) => {
      const k = at[q], from: P = [mid(k) + half, y(p.energies[k]!)], to: P = [mid(j) - half, y(p.energies[j]!)], d = (to[0] - from[0]) / 2;
      if (c.join === "curve") fig.curves.push({ points: [{ at: from, c2: [from[0] + d, from[1]] }, { at: to, c1: [to[0] - d, to[1]] }], ...paint, role: `join:${pi}:${k}` });
      else fig.lines.push({ from, to, ...(c.join === "dashed" ? { style: "dashed" as const } : {}), ...paint, role: `join:${pi}:${k}` });
    });
  });
  // Where each level's text goes. split: its value over it and the rest under it. over: all of it over the level, name
  // on top. under: all of it under the level. Chosen for the whole state at once: no text on a neighbour's level or
  // text where the levels leave room for that, and split wherever it fits.
  const MODES = ["split", "over", "under"] as const;
  type Mode = (typeof MODES)[number];
  const up = (e: Level, m: Mode) => (m === "split" ? 1 : m === "over" ? 1 + e.under.length : 0), down = (e: Level, m: Mode) => (m === "split" ? e.under.length : m === "under" ? 1 + e.under.length : 0);
  const inkUp = (lines: number) => (lines ? 1.15 * em + (lines - 1) * line : 0), inkDown = (lines: number) => (lines ? 1.3 * em + (lines - 1) * line : 0);
  const modesOf = (list: Level[]): Mode[] => {
    let best = MODES.map((m) => ({ cost: m === "split" ? 0 : 1, modes: [m] as Mode[] }));
    for (let i = 1; i < list.length; i++) {
      const gap = y(list[i - 1].v) - y(list[i].v);
      best = MODES.map((m) => best.map((was) => {
        const need = inkDown(down(list[i - 1], was.modes[i - 1])) + inkUp(up(list[i], m)) + 0.1 * em;
        return { cost: was.cost + (gap < need ? 1000 * (1 + (need - gap) / em) : 0) + (m === "split" ? 0 : 1), modes: [...was.modes, m] };
      }).reduce((p, q) => (q.cost < p.cost ? q : p)));
    }
    return best.reduce((p, q) => (q.cost < p.cost ? q : p)).modes;
  };
  // The axis title stays clear of any text it reaches across to.
  const title = c.axis && c.unit ? marked(c.unit) : undefined, reach = title ? -2 * em + wide(title.text) : -Infinity;
  let top = -Infinity;
  levels.forEach((list, k) => {
    const modes = modesOf(list), x = mid(k);
    list.forEach((e, i) => {
      const seconds = e.under.filter((t) => t.role.startsWith("second")), names = e.under.filter((t) => !t.role.startsWith("second")), mode = modes[i], y0 = y(e.v);
      const over = mode === "over" ? [...seconds.reverse(), e.value, ...names] : mode === "split" ? [e.value] : [], under = mode === "under" ? [e.value, ...seconds, ...names] : mode === "split" ? [...seconds, ...names] : [];
      over.forEach((t, j) => {
        fig.texts.push({ ...t, at: [x, y0 + 0.35 * em + j * line], align: "centre" });
        if (x - wide(t.text) / 2 < reach) top = Math.max(top, y0 + 0.35 * em + j * line);
      });
      under.forEach((t, j) => fig.texts.push({ ...t, at: [x, y0 - 1.05 * em - j * line], align: "centre" }));
    });
  });
  if (title) fig.texts.push({ ...title, at: [-2.5 * em, Math.max(H + 0.9 * em, top + 1.3 * em)], align: "left", role: "axis-title" });
  if (c.key && c.paths.length > 1) c.paths.forEach((p, pi) => {
    const x = W + em, y0 = H - 0.4 * em - pi * 1.5 * em, paint = p.colour ? { colour: p.colour } : {};
    fig.lines.push({ from: [x, y0 + 0.3 * em], to: [x + 1.5 * em, y0 + 0.3 * em], style: "bold", ...paint, role: `key:${pi}` });
    fig.texts.push({ ...marked(p.name), at: [x + 2 * em, y0], align: "left", ...paint, role: `keyname:${pi}` });
  });
  return fig;
}

// --- Sensitivity screen -------------------------------------------------------------------------------------------
// The figure, its frame's lower left corner at [0, 0].
export function radarFigure(c: RadarChart, em: number): Figure {
  const fig = empty(), R = Math.min(...c.frame) / 2, n = c.axes.length, span = c.max - c.min;
  if (n < 3 || !(span > 0) || !(c.step > 0)) return fig;
  const dir = (i: number): P => { const t = Math.PI / 2 - (2 * Math.PI * i) / n; return [Math.cos(t), Math.sin(t)]; };
  const r = (v: number) => (R * (c.max - Math.max(c.min, Math.min(c.max, v)))) / span;
  const at = (i: number, rad: number): P => [R + dir(i)[0] * rad, R + dir(i)[1] * rad];
  const ring = (rad: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ at: at(i, rad(i)) }));
  const places = Math.max(placesOf(c.step), placesOf(c.min)), rings: number[] = [];
  for (let v = c.min; v < c.max - 1e-9 && rings.length < MAX_RINGS; v += c.step) rings.push(v);
  // A ring's value shows at every ring that has room for it, counted from the ring at 0 (else from the edge).
  const every = Math.max(1, Math.ceil((SMALL * em) / ((R * c.step) / span))), first = Math.max(0, rings.findIndex((v) => Math.abs(v) < 1e-9));
  // A zone's, a ring's and a ring value's role is its place from the edge, so one the user deleted stays deleted when
  // the scale changes.
  rings.forEach((v, i) => {
    const u = Math.min(c.max, v + c.step), zero = Math.abs(v) < 1e-9;
    if (c.zones) fig.curves.push({ points: ring(() => r(v)), back: true, fill: zoneFill(v, u, c.min, c.max), role: `zone:${i}` });
    // The ring at 0 (the standard conditions) is in ink, the others grey. With zones, only it and the edge are drawn.
    if (!c.zones || zero || i === 0) fig.curves.push({ points: ring(() => r(v)), closed: true, ...(zero ? {} : { grey: true as const }), role: `ring:${i}` });
    if (((i - first) % every + every) % every === 0) fig.texts.push({ text: `${shown(v, places, true)}%`, at: [R - 0.25 * em, R + r(v) - 0.75 * em], align: "right", small: true, role: `tick:${i}` });
  });
  for (let i = 0; i < n; i++) fig.lines.push({ from: [R, R], to: at(i, R), grey: true, role: `spoke:${i}` });
  if (c.axes.some((x) => x.second !== undefined)) fig.curves.push({ points: ring((i) => r(c.axes[i].second ?? c.axes[i].value)), closed: true, style: "dashed", role: "second" });
  fig.curves.push({ points: ring((i) => r(c.axes[i].value)), closed: true, style: "bold", role: "data" });
  // Each condition's name at the end of its spoke: left of it on the left, right of it on the right, centred at the
  // top and the bottom. The names at the sides go first, and a name that would lie on one already placed steps out
  // along its spoke until it is clear (many conditions crowd the top and the bottom).
  const boxes: [number, number, number, number][] = [];
  for (const i of c.axes.map((_, k) => k).sort((p, q) => Math.abs(dir(q)[0]) - Math.abs(dir(p)[0]))) {
    const d = dir(i), t = marked(c.axes[i].label), w = widthOf(t.text, em), align = d[0] > 0.01 ? "left" as const : d[0] < -0.01 ? "right" as const : "centre" as const;
    let p: P = [0, 0], box: [number, number, number, number] = [0, 0, 0, 0];
    for (let step = 0; step < 12; step++) {
      const q = at(i, R + (0.6 + 0.4 * step) * em), x0 = align === "left" ? q[0] : align === "right" ? q[0] - w : q[0] - w / 2;
      p = [q[0], q[1] + (d[1] > 0.3 ? 0 : d[1] < -0.3 ? -0.75 * em : -0.35 * em)];
      box = [x0 - 0.2 * em, p[1] - 0.3 * em, x0 + w + 0.2 * em, p[1] + 0.8 * em];
      if (!boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) break;
    }
    boxes.push(box);
    fig.texts.push({ ...t, at: p, align, role: `axis:${i}` });
  }
  return fig;
}
// A chart's figure. Its text is text only: a state named P is not phosphorus in the drawing's formula.
export function chartFigure(c: Chart, em: number): Figure {
  const fig = c.kind === "energy" ? energyFigure(c, em) : radarFigure(c, em);
  fig.texts = fig.texts.filter((t) => t.text.trim()); // a name left empty is no caption (CDXML keeps none)
  for (const t of fig.texts) t.chemical = false;
  return fig;
}
// A figure's box (left, bottom, right, top), with its text as wide as it is drawn. measure: a text's width in em.
export function figureBox(fig: Figure, em: number, measure: (text: string) => number = (t) => t.length * 0.56): [number, number, number, number] {
  const xs = [...fig.lines.flatMap((l) => [l.from[0], l.to[0]]), ...fig.curves.flatMap((c) => c.points.map((q) => q.at[0]))], ys = [...fig.lines.flatMap((l) => [l.from[1], l.to[1]]), ...fig.curves.flatMap((c) => c.points.map((q) => q.at[1]))];
  for (const t of fig.texts) {
    const k = em * (t.small ? SMALL : 1), w = measure(t.text) * k, x = t.align === "left" ? t.at[0] : t.align === "right" ? t.at[0] - w : t.at[0] - w / 2;
    xs.push(x, x + w);
    ys.push(t.at[1] - 0.25 * k, t.at[1] + 0.8 * k);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// --- The dialog's tables ------------------------------------------------------------------------------------------
// A cell as typed: a number, a second number in brackets after it, and a name after them: "24.3", "24.3 (22.0)",
// "18.6 TS1′". A comma is a decimal point and a hyphen a minus. Undefined when it does not start with a number.
const NUM = "[+\\-−]?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)";
const CELL = new RegExp(`^\\s*(${NUM})\\s*(?:\\(\\s*(${NUM})\\s*\\))?\\s*(.*?)\\s*$`);
// A number as read: to MAX_PLACES places at most, so the record holds what the page shows.
export const MAX_PLACES = 6;
const num = (t: string) => Number(Number(t.replace(",", ".").replace("−", "-")).toFixed(MAX_PLACES));
const placesIn = (t: string) => Math.min(MAX_PLACES, /[.,](\d+)/.exec(t)?.[1].length ?? 0);
// Text as a record keeps it: one line, no control characters (readChart refuses them).
export const plain = (t: string) => t.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
// Text cut to n characters, never through the middle of one (an emoji, a rare letter).
const cut = (t: string, n: number) => (t.length <= n ? t : Array.from(t).slice(0, n).join("")).replace(/[\ud800-\udbff]$/, "");
export function parseCell(text: string): { value: number; second?: number; name?: string; places: number } | undefined {
  const m = CELL.exec(cut(plain(text), 200));
  if (!m || !Number.isFinite(num(m[1])) || Math.abs(num(m[1])) > 1e6) return undefined;
  const second = m[2] === undefined ? undefined : num(m[2]), counted = second !== undefined && Math.abs(second) <= 1e6;
  return { value: num(m[1]), ...(counted ? { second } : {}), ...(m[3] ? { name: cut(m[3], 80) } : {}), places: Math.max(placesIn(m[1]), counted ? placesIn(m[2]!) : 0) };
}
export const cellText = (value: number | null | undefined, second: number | null | undefined, name: string | null | undefined, places: number) =>
  value == null ? "" : [shown(value, places), second == null ? "" : `(${shown(second, places)})`, name ?? ""].filter(Boolean).join(" ");
// Text copied from a spreadsheet as rows of cells.
export function pastedRows(text: string): string[][] {
  // Cut first: no more text than the largest table holds is looked at.
  const lines = text.slice(0, (MAX_STATES + 1) * (MAX_PATHS + 1) * 202).replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const rows = lines.slice(0, MAX_STATES + 1).map((r) => r.split("\t").slice(0, MAX_PATHS + 1).map((x) => cut(plain(x), 200)));
  return rows.length > 1 || (rows[0]?.length ?? 0) > 1 ? rows : [];
}
// An energy diagram's table: the paths' names, and a row for each state (its name, then a cell for each path).
export type EnergyTable = { paths: string[]; rows: string[][] };
export const tableOfEnergy = (c: Pick<EnergyChart, "states" | "paths" | "places">): EnergyTable =>
  ({ paths: c.paths.map((p) => p.name), rows: c.states.map((s, k) => [s, ...c.paths.map((p) => cellText(p.energies[k], p.second?.[k], p.names?.[k], c.places))]) });
// The table as a record's states and paths. A row with no energy and a path with none are left out. was: the record
// before, whose paths keep their colours. Undefined with no energy at all.
// The table's cells as read, and the rows and columns it keeps (those with an energy).
function keptOf(t: EnergyTable) {
  const cells = t.rows.map((r) => t.paths.map((_, p) => parseCell(r[p + 1] ?? "")));
  const rows = t.rows.map((_, k) => k).filter((k) => cells[k].some(Boolean)).slice(0, MAX_STATES), cols = t.paths.map((_, p) => p).filter((p) => rows.some((k) => cells[k][p])).slice(0, MAX_PATHS);
  return { cells, rows, cols };
}
export function energyOfTable(t: EnergyTable, was?: Pick<EnergyChart, "paths">): Pick<EnergyChart, "states" | "paths" | "places"> | undefined {
  const { cells, rows, cols } = keptOf(t);
  if (!rows.length || !cols.length) return undefined;
  const places = Math.max(...rows.flatMap((k) => cols.map((p) => cells[k][p]?.places ?? 0)));
  // A path keeps its colour. A new path, and a path that was alone and in ink, takes the first colour not in use.
  const used = new Set(cols.map((p) => was?.paths[p]?.colour).filter(Boolean)), free = () => { const c = PATH_COLOURS.find((x) => !used.has(x)) ?? PATH_COLOURS[used.size % PATH_COLOURS.length]; used.add(c); return c; };
  const paths = cols.map((p, i): EnergyPath => {
    const col = rows.map((k) => cells[k][p]), colour = was?.paths[p]?.colour ?? (cols.length > 1 ? free() : undefined);
    return { name: cut(plain(t.paths[p] ?? "") || `Path ${i + 1}`, 80), ...(colour ? { colour } : {}), energies: col.map((x) => x?.value ?? null),
      ...(col.some((x) => x?.second !== undefined) ? { second: col.map((x) => x?.second ?? null) } : {}), ...(col.some((x) => x?.name) ? { names: col.map((x) => x?.name ?? null) } : {}) };
  });
  return { states: rows.map((k) => cut(plain(t.rows[k][0] ?? ""), 80)), paths, places };
}
// A part's role before Edit Data as its role after it (pageplot.ts replot): a state's or a path's parts follow it to
// its new place in the table, and the parts of one taken out have none. first, second: the old places kept, in order.
const INDEXED = /^(level|join|value|second|name|key|keyname|axis|spoke):(\d+)(?::(\d+))?(.*)$/;
function roleMap(first: number[], second?: number[]) {
  return (role: string): string | undefined => {
    const m = INDEXED.exec(role);
    if (!m) return role;
    const a = first.indexOf(Number(m[2])), b = m[3] === undefined ? undefined : (second ?? []).indexOf(Number(m[3]));
    return a < 0 || (b !== undefined && b < 0) ? undefined : `${m[1]}:${a}${b === undefined ? "" : `:${b}`}${m[4]}`;
  };
}
export const energyRoles = (t: EnergyTable) => {
  const { rows, cols } = keptOf(t), map = roleMap(cols, rows);
  // A state's name follows its row.
  return (role: string): string | undefined => { const m = /^state:(\d+)(.*)$/.exec(role), k = m ? rows.indexOf(Number(m[1])) : -1; return m ? (k < 0 ? undefined : `state:${k}${m[2]}`) : map(role); };
};
// A sensitivity screen's rows: each condition's name and its cell.
const placesOf = (v: number) => Math.min(MAX_PLACES, (String(v).split(".")[1] ?? "").length);
export const rowsOfRadar = (c: Pick<RadarChart, "axes">): string[][] => c.axes.map((x) => [x.label, cellText(x.value, x.second, undefined, Math.max(placesOf(x.value), placesOf(x.second ?? 0)))]);
// The rows as a record's axes: a row with no value is left out. Undefined with fewer than three.
// A condition with no value has no axis (the paper leaves out a condition that was not run).
const radarKept = (rows: string[][]) => rows.map((_, k) => k).filter((k) => parseCell(rows[k][1] ?? "")).slice(0, MAX_AXES);
export function radarOfRows(rows: string[][]): RadarChart["axes"] | undefined {
  const axes = radarKept(rows).map((k) => { const x = parseCell(rows[k][1] ?? "")!; return { label: cut(plain(rows[k][0] ?? ""), 80), value: x.value, ...(x.second !== undefined ? { second: x.second } : {}) }; });
  return axes.length >= 3 ? axes : undefined;
}
export const radarRoles = (rows: string[][]) => roleMap(radarKept(rows));
// The dialog's grid with one empty row to type the next state or condition in, and (head: the first row names the
// columns) one empty column for the next path, up to most rows and columns. More empty ones at the end are dropped.
export function spare(cells: string[][], most: [number, number], head: boolean): string[][] {
  const out = cells.map((r) => [...r]), blank = (r: string[]) => r.every((x) => !x.trim()), least = head ? 2 : 1;
  while (out.length > least && blank(out[out.length - 1]) && blank(out[out.length - 2])) out.pop();
  if ((out.length < least || !blank(out[out.length - 1])) && out.length < most[0]) out.push(out[0].map(() => ""));
  if (head) {
    const empty = (c: number) => out.every((r) => !(r[c] ?? "").trim());
    while (out[0].length > 2 && empty(out[0].length - 1) && empty(out[0].length - 2)) for (const r of out) r.pop();
    if (!empty(out[0].length - 1) && out[0].length < most[1]) for (const r of out) r.push("");
  }
  return out;
}
// A sensitivity screen's scale is sound when it has room for rings and holds every value: a value past the edge would
// be drawn on the edge and read as less than it is.
export function soundScale(c: Pick<RadarChart, "axes" | "min" | "max" | "step">): boolean {
  const values = c.axes.flatMap((x) => [x.value, ...(x.second === undefined ? [] : [x.second])]);
  return [c.min, c.max, c.step].every(Number.isFinite) && c.max > c.min && c.step > 0 && (c.max - c.min) / c.step <= MAX_RINGS && values.every((v) => v >= c.min - 1e-9 && v <= c.max + 1e-9);
}
// The scale grown by whole steps to hold these values.
export function coverScale(c: Pick<RadarChart, "axes" | "min" | "max" | "step">): Pick<RadarChart, "min" | "max"> {
  const values = c.axes.flatMap((x) => [x.value, ...(x.second === undefined ? [] : [x.second])]), lo = Math.min(c.min, ...values), hi = Math.max(c.max, ...values);
  return { min: c.min - Math.ceil((c.min - lo) / c.step - 1e-9) * c.step, max: c.max + Math.ceil((hi - c.max) / c.step - 1e-9) * c.step };
}
// Text typed over one of a chart's captions on the page, as the chart's data (pageplot.ts followCharts). A number over
// a level's value is its energy (with a second value in brackets and a name, as a cell takes them); a number in
// brackets over a second value is that; text over a state's name, a path's name in the key, the axis title or a
// condition's name is that name. redraw: the chart must be drawn again (a level moves). Undefined when the text is no
// data: a value that is no number stays a label.
export function retyped(c: Chart, role: string, text: string): { chart: Chart; redraw: boolean } | undefined {
  const m = /^(value|second|name|keyname|axis):(\d+)(?::(\d+))?$/.exec(role), t = cut(plain(text), 80);
  if (!t) return undefined;
  if (c.kind === "radar") return m?.[1] === "axis" && c.axes[+m[2]] ? { chart: { ...c, axes: c.axes.map((x, i) => (i === +m[2] ? { ...x, label: t } : x)) }, redraw: false } : undefined;
  if (role === "axis-title") return { chart: { ...c, unit: t }, redraw: false };
  const state = /^state:(\d+)$/.exec(role);
  if (state) return c.states[+state[1]] === undefined ? undefined : { chart: { ...c, states: c.states.map((x, i) => (i === +state[1] ? t : x)) }, redraw: false };
  const p = m ? c.paths[+m[2]] : undefined, k = m?.[3] === undefined ? -1 : +m[3];
  if (!m || !p) return undefined;
  const path = (next: EnergyPath): EnergyChart => ({ ...c, paths: c.paths.map((x, i) => (i === +m[2] ? next : x)) }), put = <T,>(list: (T | null)[] | undefined, v: T) => Array.from({ length: c.states.length }, (_, i) => (i === k ? v : list?.[i] ?? null));
  if (m[1] === "keyname") return { chart: path({ ...p, name: t }), redraw: false };
  if (k < 0 || k >= c.states.length || p.energies[k] == null) return undefined;
  if (m[1] === "name") return { chart: path({ ...p, names: put(p.names, t) }), redraw: false };
  const x = parseCell(m[1] === "second" ? t.replace(/^\((.*)\)$/, "$1") : t);
  if (!x) return undefined;
  const places = Math.max(c.places, x.places);
  if (m[1] === "second") return { chart: { ...path({ ...p, second: put(p.second, x.value) }), places }, redraw: true };
  return { chart: { ...path({ ...p, energies: put(p.energies, x.value) as (number | null)[], ...(x.second !== undefined ? { second: put(p.second, x.second) } : {}), ...(x.name ? { names: put(p.names, x.name) } : {}) }), places }, redraw: true };
}
// What a new chart's dialog starts with: the states and conditions named, and no numbers.
export const NEW_ENERGY: Pick<EnergyChart, "kind" | "title" | "states" | "paths" | "unit" | "join" | "axis" | "key" | "places"> = {
  kind: "energy", title: "Energy diagram", states: ["R", "TS", "P"], paths: [{ name: "", energies: [null, null, null] }], unit: "Δ*G* (kJ/mol)", join: "line", axis: true, key: true, places: 1,
};
export const NEW_RADAR: Pick<RadarChart, "kind" | "title" | "axes" | "min" | "max" | "step" | "zones"> = {
  kind: "radar", title: "Sensitivity screen", min: -100, max: 50, step: 25, zones: true,
  axes: ["High *c*", "Low *c*", "H₂O", "Low O₂", "High O₂", "Low *T*", "High *T*", "Low *I*", "High *I*", "Big Scale"].map((label) => ({ label, value: 0 })),
};

// --- Reading ------------------------------------------------------------------------------------------------------
// A chart's record from a file, if it is sound: anything else is left out, and the group stays a plain group.
const fin = (v: unknown, lo = -1e6, hi = 1e6): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, most = 80): v is string => typeof v === "string" && v.length <= most && !/[\u0000-\u001f]/.test(v);
const pair = (v: unknown, lo?: number, hi?: number): v is P => Array.isArray(v) && v.length === 2 && v.every((x) => fin(x, lo, hi));
const hex = (v: unknown): v is string | undefined => v === undefined || (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v));
const list = <T>(v: unknown, n: number, ok: (x: unknown) => x is T): v is T[] => Array.isArray(v) && v.length === n && v.every(ok);
const orNull = <T>(ok: (x: unknown) => x is T) => (x: unknown): x is T | null => x === null || ok(x);
export function readChart(v: unknown): Chart | undefined {
  const o = v as Record<string, unknown> | undefined;
  if (!o || !str(o.title, 200) || !pair(o.frame, 0.01, 1000) || !pair(o.origin) || !fin(o.scale, 0.01, 100) || !fin(o.text, 0.01, 100) || !Array.isArray(o.roles) || o.roles.length > 4000 || !o.roles.every((r) => str(r, 120))) return undefined;
  const base: Base = { title: o.title, frame: [o.frame[0], o.frame[1]], origin: [o.origin[0], o.origin[1]], scale: o.scale, text: o.text, roles: o.roles as string[] };
  if (o.kind === "energy") {
    const states = o.states, paths = o.paths as Record<string, unknown>[];
    if (!Array.isArray(states) || !states.length || states.length > MAX_STATES || !states.every((s) => str(s)) || !Array.isArray(paths) || !paths.length || paths.length > MAX_PATHS) return undefined;
    const n = states.length, energy = orNull((x): x is number => fin(x)), name = orNull((x): x is string => str(x));
    if (!paths.every((p) => p && str(p.name) && hex(p.colour) && list(p.energies, n, energy) && (p.second === undefined || list(p.second, n, energy)) && (p.names === undefined || list(p.names, n, name)))) return undefined;
    if (!str(o.unit) || !["line", "dashed", "curve"].includes(o.join as string) || typeof o.axis !== "boolean" || typeof o.key !== "boolean" || !Number.isInteger(o.places) || !fin(o.places, 0, MAX_PLACES)) return undefined;
    // With no energy at all there is nothing to draw: a resize would take every part away.
    if (!paths.some((p) => (p.energies as unknown[]).some((v) => v !== null))) return undefined;
    return { ...base, kind: "energy", states: states as string[], unit: o.unit, join: o.join as EnergyChart["join"], axis: o.axis, key: o.key, places: o.places,
      paths: paths.map((p) => ({ name: p.name as string, ...(p.colour ? { colour: p.colour as string } : {}), energies: [...(p.energies as (number | null)[])], ...(p.second ? { second: [...(p.second as (number | null)[])] } : {}), ...(p.names ? { names: [...(p.names as (string | null)[])] } : {}) })) };
  }
  if (o.kind === "radar") {
    const axes = o.axes as Record<string, unknown>[];
    if (!Array.isArray(axes) || axes.length < 3 || axes.length > MAX_AXES || !axes.every((x) => x && str(x.label) && fin(x.value) && (x.second === undefined || fin(x.second)))) return undefined;
    if (!fin(o.min) || !fin(o.max) || !fin(o.step, 1e-6) || !(o.max > o.min) || (o.max - o.min) / o.step > MAX_RINGS || typeof o.zones !== "boolean") return undefined;
    return { ...base, kind: "radar", min: o.min, max: o.max, step: o.step, zones: o.zones, axes: axes.map((x) => ({ label: x.label as string, value: x.value as number, ...(x.second !== undefined ? { second: x.second as number } : {}) })) };
  }
  return undefined;
}
