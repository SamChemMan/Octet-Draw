// Charts on the page (Object > Add Chart): an energy diagram and a sensitivity screen. Each is a page figure, as a
// page spectrum is (pageplot.ts): a group of ordinary lines, curves and captions that keeps what it shows (its record)
// and each part's role, so a resize or Edit Data draws it again and keeps what the user changed. This file holds the
// records, the figure each gives, the table the dialog shows for each, and the reader for a record from a file.
import type { Figure } from "./spectrumplot.ts";
import { SMALL, tint } from "./spectrumplot.ts";
import { markupRuns } from "./experiment.ts";
import { normalise, plainOf, styled, type TextRun } from "./richtext.ts";
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
// A Jablonski diagram (issue 43): each state a bold level with its vibrational levels over it, and transitions between
// them that stay on their levels when a level moves (pageplot.ts followLevels). A state's x is its level's ends and y
// its height, and a transition's x is each end across, all fractions of the frame, which is the levels' box. vib: the
// vibrational levels drawn over a state (0 to MAX_VIB), and the one each end of a transition sits on (0: the state's
// own level). unit: the axis's title.
export type JablonskiKind = "absorption" | "fluorescence" | "phosphorescence" | "ic" | "isc" | "vr";
export type JState = { name: string; x: P; y: number; vib: number };
export type JTransition = { from: number; to: number; kind: JablonskiKind; label: string; x: P; vib: P };
export type JablonskiChart = Base & { kind: "jablonski"; states: JState[]; transitions: JTransition[]; axis: boolean; unit: string };
export type Chart = EnergyChart | RadarChart | JablonskiChart;
export const isChart = (p: { kind: string }): p is Chart => p.kind === "energy" || p.kind === "radar" || p.kind === "jablonski";
export const chartName = (c: Chart) => (c.kind === "energy" ? "Energy diagram" : c.kind === "radar" ? "Sensitivity screen" : "Jablonski diagram");

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
// --- Jablonski diagram --------------------------------------------------------------------------------------------
export const MAX_LEVELS = 24, MAX_TRANSITIONS = 64, MAX_VIB = 8;
export const JABLONSKI_KINDS: readonly JablonskiKind[] = ["absorption", "fluorescence", "phosphorescence", "ic", "isc", "vr"];
export const KIND_NAMES: Record<JablonskiKind, string> = { absorption: "Absorption", fluorescence: "Fluorescence", phosphorescence: "Phosphorescence", ic: "Internal conversion", isc: "Intersystem crossing", vr: "Vibrational relaxation" };
// Each kind's label as a new transition gets it (scripted reads _A as a subscript).
export const KIND_LABELS: Record<JablonskiKind, string> = { absorption: "hν_A", fluorescence: "hν_F", phosphorescence: "hν_P", ic: "IC", isc: "ISC", vr: "VR" };
// IUPAC: a radiative transition is a straight arrow, a radiationless one wavy.
export const radiative = (k: JablonskiKind) => k === "absorption" || k === "fluorescence" || k === "phosphorescence";
// The default style's line width in bond lengths (0.6 pt over 14.4 pt), when the document's is not given.
export const LINE = 0.6 / 14.4;
// How far apart vibrational levels are: half the caption size, so they scale with the text.
export const vibGap = (em: number) => em / 2;
// A state's letter (S, T, D, Q), by which a new state finds its column and a new transition its kind. A name that
// starts with another letter (GS, A) counts as a singlet, as most ground states are.
const letterOf = (name: string) => { const l = (name.trim()[0] ?? "").toUpperCase(); return l && "STDQ".includes(l) ? l : "S"; };
// The lowest state (the ground state), or the lowest of those that pass.
function lowest(states: Pick<JState, "y">[], ok: (k: number) => boolean = () => true): number {
  let best = -1;
  states.forEach((s, k) => { if (ok(k) && (best < 0 || s.y < states[best].y - 1e-9)) best = k; });
  return best;
}
// A new transition's kind, from its states (D7): up is absorption; down within a letter is fluorescence to the ground
// state and internal conversion otherwise; down to another letter is phosphorescence from the lowest state of its
// letter to the ground state and intersystem crossing otherwise; within one state, vibrational relaxation.
export function kindOf(states: Pick<JState, "name" | "y">[], from: number, to: number): JablonskiKind {
  if (from === to) return "vr";
  const a = states[from], b = states[to], ground = lowest(states);
  if (b.y > a.y + 1e-9) return "absorption";
  if (letterOf(a.name) === letterOf(b.name)) return to === ground ? "fluorescence" : "ic";
  return to === ground && from === lowest(states, (k) => letterOf(states[k].name) === letterOf(a.name)) ? "phosphorescence" : "isc";
}
// The vibrational level each end of a new transition sits on: absorption to a higher one (Franck-Condon), emission to
// the first over the ground state's level, a radiationless crossing to the top one (it keeps its energy), and
// vibrational relaxation from the top one down.
export function vibOf(kind: JablonskiKind, a: Pick<JState, "vib">, b: Pick<JState, "vib">): P {
  return kind === "absorption" ? [0, Math.min(2, b.vib)] : kind === "vr" ? [a.vib, 0] : radiative(kind) ? [0, Math.min(1, b.vib)] : [0, b.vib];
}
// The transitions Kasha's rule gives (D6): absorption from the ground state to each excited state of its letter,
// internal conversion down each letter, fluorescence from the lowest excited state of the ground state's letter,
// intersystem crossing from it to the highest state of each other letter under it (else that letter's lowest), and
// phosphorescence from the lowest state of each other letter to the ground state.
export function defaultTransitions(states: JState[]): Omit<JTransition, "x">[] {
  const ground = lowest(states);
  if (ground < 0) return [];
  const g = letterOf(states[ground].name), out: Omit<JTransition, "x">[] = [], up = (k: number) => states[k].y;
  const add = (from: number, to: number) => { const kind = kindOf(states, from, to); out.push({ from, to, kind, label: KIND_LABELS[kind], vib: vibOf(kind, states[from], states[to]) }); };
  const of = (l: string) => states.map((_, k) => k).filter((k) => k !== ground && letterOf(states[k].name) === l).sort((p, q) => up(p) - up(q));
  const own = of(g), letters = [...new Set(states.map((s) => letterOf(s.name)))].filter((l) => l !== g);
  for (const k of own) if (up(k) > up(ground) + 1e-9) add(ground, k);
  for (const l of [g, ...letters]) { const list = l === g ? own : of(l); for (let i = list.length - 1; i > 0; i--) if (up(list[i]) > up(list[i - 1]) + 1e-9) add(list[i], list[i - 1]); }
  const first = own[0];
  if (first !== undefined && up(first) > up(ground) + 1e-9) add(first, ground);
  for (const l of letters) {
    const list = of(l), under = list.filter((k) => up(k) < up(first ?? ground) - 1e-9);
    if (first !== undefined && list.length) add(first, under.length ? under[under.length - 1] : list[0]);
    if (list.length && up(list[0]) > up(ground) + 1e-9) add(list[0], ground);
  }
  return out.slice(0, MAX_TRANSITIONS);
}
// Where a new transition goes across (fractions of the frame), where its levels leave the most room: between two
// levels one over the other, the middle of the widest gap between the transitions already there; between two levels
// side by side, from the end of one facing the other to the start of the other.
export function roomFor(c: Pick<JablonskiChart, "states" | "transitions">, from: number, to: number, taken: number[] = c.transitions.flatMap((t) => t.x)): P {
  const a = c.states[from], b = c.states[to], lo = Math.max(a.x[0], b.x[0]), hi = Math.min(a.x[1], b.x[1]);
  if (hi > lo + 1e-6) {
    const cuts = [lo, ...taken.filter((x) => x > lo + 1e-6 && x < hi - 1e-6).sort((p, q) => p - q), hi];
    let at = 0;
    for (let i = 1; i < cuts.length - 1; i++) if (cuts[i + 1] - cuts[i] > cuts[at + 1] - cuts[at] + 1e-9) at = i;
    const x = (cuts[at] + cuts[at + 1]) / 2;
    return [x, x];
  }
  const inset = (s: JState) => 0.1 * (s.x[1] - s.x[0]);
  return a.x[1] <= b.x[0] + 1e-9 ? [a.x[1] - inset(a), b.x[0] + inset(b)] : [a.x[0] + inset(a), b.x[1] - inset(b)];
}
// Text as a name or a label draws it (D11): a name that is one capital and digits (S1, T12) has its digits as a
// subscript; _x or _{xy} is a subscript and ^x or ^{xy} a superscript (\_ and \^ are the characters); a label that
// starts with hν has hν in italic (h and ν are quantities).
export function scripted(text: string): { text: string; runs?: TextRun[] } {
  const one = /^([A-Z])(\d+)$/.exec(text);
  if (one) return { text, runs: [{ text: one[1] }, { text: one[2], script: "sub" }] };
  const runs: TextRun[] = [], chars = Array.from(text);
  let i = 0;
  if (text.startsWith("hν")) { runs.push({ text: "hν", italic: true }); i = 2; }
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === "\\" && (chars[i + 1] === "_" || chars[i + 1] === "^")) { runs.push({ text: chars[i + 1] }); i += 2; continue; }
    if ((ch === "_" || ch === "^") && i + 1 < chars.length) {
      const script = ch === "_" ? "sub" as const : "super" as const, close = chars[i + 1] === "{" ? chars.indexOf("}", i + 2) : -1;
      const part = close > 0 ? chars.slice(i + 2, close).join("") : chars[i + 1];
      if (part) runs.push({ text: part, script });
      i = close > 0 ? close + 1 : i + 2;
      continue;
    }
    runs.push({ text: ch });
    i++;
  }
  const clean = normalise(runs);
  return { text: plainOf(clean), ...(styled(clean) ? { runs: clean } : {}) };
}
// Text's width as drawn (em), a script at 0.7 of the size.
const runsWidth = (t: { text: string; runs?: TextRun[] }) => (t.runs ?? [{ text: t.text }]).reduce((w, r) => w + widthOf(r.text, r.script ? 0.7 : 1), 0);
// A wavy line's tail moved along it so that its wave ends on its axis where its head starts (R7): render.ts draws a
// wave 0.2 bond lengths long (times the arrow's scale f) up to the notch of a line's small head, 8.75 line widths back
// from the tip. line: the line width in bond lengths. The tail moves by a quarter of a wave at most.
export function waveFit(from: P, to: P, line: number, f: number): P {
  const d: P = [to[0] - from[0], to[1] - from[1]], L = Math.hypot(...d), notch = 8.75 * line * f, half = 0.1 * f;
  if (L - notch <= half) return from;
  const fitted = Math.round((L - notch) / half) * half + notch;
  return [to[0] - (d[0] / L) * fitted, to[1] - (d[1] / L) * fitted];
}
// Whether the segment p-q passes through the box (left, bottom, right, top).
function crosses(b: [number, number, number, number], p: P, q: P): boolean {
  let t0 = 0, t1 = 1;
  const d = [q[0] - p[0], q[1] - p[1]];
  for (const [num, den] of [[p[0] - b[0], -d[0]], [b[2] - p[0], d[0]], [p[1] - b[1], -d[1]], [b[3] - p[1], d[1]]]) {
    if (Math.abs(den) < 1e-12) { if (num < 0) return false; continue; }
    const t = num / den;
    if (den < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}
// A transition's ends in the figure, before its wave is fitted: each on its vibrational level (none past the state's
// last), inside its level by 0.2 em, or at its middle on a level too short for that. Undefined when it has no length.
export function endsOf(c: Pick<JablonskiChart, "states" | "transitions" | "frame">, i: number, em: number): [P, P] | undefined {
  const t = c.transitions[i], a = c.states[t?.from], b = c.states[t?.to], [W, H] = c.frame, g = vibGap(em), pad = 0.2 * em;
  if (!a || !b) return undefined;
  const across = (s: JState, x: number) => (s.x[1] - s.x[0] < (2 * pad) / W ? ((s.x[0] + s.x[1]) / 2) * W : Math.min(s.x[1] * W - pad, Math.max(s.x[0] * W + pad, x * W)));
  const from: P = [across(a, t.x[0]), a.y * H + Math.min(t.vib[0], a.vib) * g], to: P = [across(b, t.x[1]), b.y * H + Math.min(t.vib[1], b.vib) * g];
  return Math.hypot(to[0] - from[0], to[1] - from[1]) < 1e-6 ? undefined : [from, to];
}
// The figure, its frame's lower left corner at [0, 0]. em: the caption size in bond lengths; line: the line width in
// bond lengths (at the record's text scale 1).
export function jablonskiFigure(c: JablonskiChart, em: number, line = LINE): Figure {
  const fig = empty(), [W, H] = c.frame, g = vibGap(em), f = c.text;
  if (!c.states.length) return fig;
  const levels = c.states.map((s) => ({ x0: s.x[0] * W, x1: s.x[1] * W, y: s.y * H, vib: s.vib }));
  const segments: [P, P][] = [];
  // Each level bold, and its vibrational levels plain over it (D10).
  levels.forEach((l, k) => {
    fig.lines.push({ from: [l.x0, l.y], to: [l.x1, l.y], style: "bold", role: `level:${k}` });
    segments.push([[l.x0, l.y], [l.x1, l.y]]);
    for (let i = 1; i <= l.vib; i++) { fig.lines.push({ from: [l.x0, l.y + i * g], to: [l.x1, l.y + i * g], role: `vib:${k}:${i}` }); segments.push([[l.x0, l.y + i * g], [l.x1, l.y + i * g]]); }
  });
  // Each state's name at the outer end of its level: left of a level in the left half, else right of it.
  const middle = W / 2, names: number[] = [];
  c.states.forEach((s, k) => {
    const l = levels[k], left = (l.x0 + l.x1) / 2 <= middle + 1e-9, t = scripted(s.name);
    fig.texts.push({ ...t, at: [left ? l.x0 - 0.3 * em : l.x1 + 0.3 * em, l.y - 0.35 * em], align: left ? "right" : "left", role: `state:${k}` });
    if (left) names.push(l.x0 - 0.3 * em - runsWidth(t) * em);
  });
  // Each transition from its end on one level to its end on the other, inside each level, with a full head; a
  // radiationless one wavy, its tail fitted to its wave (R7). Vibrational relaxation with no vibrational level to
  // start from has no length and is not drawn.
  const ends = c.transitions.map((t, i) => { const e = endsOf(c, i, em); return e && [radiative(t.kind) ? e[0] : waveFit(e[0], e[1], line, f), e[1]] as [P, P]; });
  ends.forEach((e, i) => {
    if (!e) return;
    fig.lines.push({ from: e[0], to: e[1], end: "full", ...(radiative(c.transitions[i].kind) ? {} : { style: "wavy" as const }), role: `trans:${i}` });
    segments.push(e);
  });
  // Each label beside its transition: right of a steep one (left when the right has no room), over a shallow one
  // (under it when that has no room), at its middle, or else along it where it is clear of every line and every label
  // placed before it (a level that crosses the middle).
  // Each line's box, so a label's place is tested only against the lines it may meet.
  const boxes: [number, number, number, number][] = [], reach = segments.map(([p, q]) => [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]);
  const order = c.transitions.map((_, i) => i).filter((i) => ends[i]).sort((p, q) => (ends[p]![0][0] + ends[p]![1][0]) - (ends[q]![0][0] + ends[q]![1][0]));
  for (const i of order) {
    const [p, q] = ends[i]!, t = scripted(c.transitions[i].label), w = runsWidth(t) * em;
    if (!t.text.trim()) continue;
    // A steep transition that leans keeps its label clear of it by as much as it leans over the label's height, and a
    // wavy one by its wave too.
    const steep = Math.abs(q[1] - p[1]) >= Math.abs(q[0] - p[0]), slope = steep ? 0 : Math.abs(q[1] - p[1]) / Math.max(1e-9, Math.abs(q[0] - p[0]));
    const wave = radiative(c.transitions[i].kind) ? 0 : 0.15 * em, side = steep ? 0.3 * em + wave + (0.7 * em * Math.abs(q[0] - p[0])) / Math.max(1e-9, Math.abs(q[1] - p[1])) : 0;
    const spots = [0.5, 0.35, 0.65, 0.2, 0.8].flatMap((k) => {
      const m: P = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
      return (steep ? [[m[0] + side, m[1] - 0.35 * em, "left"], [m[0] - side, m[1] - 0.35 * em, "right"]] : [[m[0], m[1] + 0.5 * em + wave + (slope * w) / 2, "centre"], [m[0], m[1] - 1.25 * em - wave - (slope * w) / 2, "centre"]]) as [number, number, "left" | "right" | "centre"][];
    });
    const boxOf = ([x, y, align]: (typeof spots)[number]): [number, number, number, number] => { const x0 = align === "left" ? x : align === "right" ? x - w : x - w / 2; return [x0 - 0.15 * em, y - 0.35 * em, x0 + w + 0.15 * em, y + 0.95 * em]; };
    const clashes = (b: [number, number, number, number]) => segments.filter((s, k) => s !== ends[i] && b[0] <= reach[k][2] && b[2] >= reach[k][0] && b[1] <= reach[k][3] && b[3] >= reach[k][1] && crosses(b, s[0], s[1])).length + boxes.filter((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]).length;
    // The first clear place, else the one with fewest clashes (the first of those).
    let pick = 0, fewest = Infinity;
    for (let k = 0; k < spots.length; k++) { const n = clashes(boxOf(spots[k])); if (n < fewest) { fewest = n; pick = k; } if (!n) break; }
    const [x, y, align] = spots[pick];
    boxes.push(boxOf(spots[pick]));
    fig.texts.push({ ...t, at: [x, y], align, role: `label:${i}` });
  }
  // The axis: an arrow up at the left, clear of the names, from the foot to over the top vibrational level, its title
  // at its top.
  if (c.axis) {
    const x = Math.min(0, ...levels.map((l) => l.x0), ...names) - 0.6 * em, top = Math.max(...levels.map((l) => l.y + l.vib * g)) + 0.8 * em, foot = Math.min(...levels.map((l) => l.y)) - 0.4 * em;
    fig.lines.push({ from: [x, foot], to: [x, top], end: "full", role: "axis" });
    if (c.unit) fig.texts.push({ ...marked(c.unit), at: [x, top + 0.35 * em], align: "centre", role: "axis-title" });
  }
  return fig;
}
// A Jablonski diagram's record with its states and transitions placed in the page's terms (absolute: bond lengths,
// x across from the old frame's left and y up from its foot), as fractions of a frame that is their levels' box: the
// frame's foot and left at the lowest level and the leftmost end, and the record's origin moved by as much. A side of
// the frame stays 0.5 bond lengths at least, and its old length when every level is level with the others.
export function framed(c: JablonskiChart, states: { name: string; x0: number; x1: number; y: number; vib: number }[], transitions: (Omit<JTransition, "x"> & { x: P })[]): JablonskiChart {
  const left = Math.min(...states.map((s) => s.x0)), right = Math.max(...states.map((s) => s.x1)), foot = Math.min(...states.map((s) => s.y)), top = Math.max(...states.map((s) => s.y));
  const W = right - left > 0.5 ? right - left : Math.max(0.5, c.frame[0]), H = top - foot > 0.5 ? top - foot : Math.max(0.5, c.frame[1]);
  const fx = (x: number) => Math.min(1, Math.max(0, (x - left) / W)), r = (v: number) => Math.round(v * 1e9) / 1e9;
  return { ...c, origin: [c.origin[0] + left, c.origin[1] + foot], frame: [W, H],
    states: states.map((s) => ({ name: s.name, x: [r(fx(s.x0)), r(fx(s.x1))], y: r(Math.min(1, Math.max(0, (s.y - foot) / H))), vib: s.vib })),
    transitions: transitions.map((t) => ({ ...t, x: [r(fx(t.x[0])), r(fx(t.x[1]))] })) };
}
// A new Jablonski diagram (D6): S0, S1, S2 and T1 with three vibrational levels each, singlets on the left and the
// triplet on the right, and the six transitions of Kasha's rule.
const STATES_NEW: JState[] = [
  { name: "S0", x: [0, 1], y: 0, vib: 3 }, { name: "S1", x: [0, 0.45], y: 0.6, vib: 3 }, { name: "S2", x: [0, 0.45], y: 1, vib: 3 }, { name: "T1", x: [0.6, 1], y: 0.42, vib: 3 },
];
const ACROSS_NEW: P[] = [[0.04, 0.04], [0.15, 0.15], [0.26, 0.26], [0.37, 0.37], [0.43, 0.64], [0.82, 0.82]];
export const NEW_JABLONSKI: Pick<JablonskiChart, "kind" | "title" | "states" | "transitions" | "axis" | "unit" | "frame"> = {
  kind: "jablonski", title: "Jablonski diagram", states: STATES_NEW, axis: true, unit: "Energy", frame: [15, 7],
  transitions: defaultTransitions(STATES_NEW).map((t, i) => ({ ...t, x: ACROSS_NEW[i] })),
};

// A Jablonski diagram's last figure for each record: a level moved reads the page against the record's figure, and
// replot builds that figure again to tell what the user changed (pageplot.ts), on every pointer move of a drag.
// Records are never changed in place, so a record is its figure's key. Figures are not changed after they are made.
const drawn = new WeakMap<JablonskiChart, { em: number; line: number; fig: Figure }>();
// A chart's figure. Its text is text only: a state named P is not phosphorus in the drawing's formula. line: the line
// width in bond lengths.
export function chartFigure(c: Chart, em: number, line = LINE): Figure {
  if (c.kind === "jablonski") { const was = drawn.get(c); if (was && was.em === em && was.line === line) return was.fig; }
  const fig = c.kind === "energy" ? energyFigure(c, em) : c.kind === "radar" ? radarFigure(c, em) : jablonskiFigure(c, em, line);
  fig.texts = fig.texts.filter((t) => t.text.trim()); // a name left empty is no caption (CDXML keeps none)
  for (const t of fig.texts) t.chemical = false;
  if (c.kind === "jablonski") drawn.set(c, { em, line, fig });
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
// Text cut to n UTF-16 units, as a file's check (str) counts them, never through the middle of a character that takes
// two (an emoji, a rare letter).
export const cut = (t: string, n: number) => (t.length <= n ? t : t.slice(0, n)).replace(/[\ud800-\udbff]$/, "");
export function parseCell(text: string): { value: number; second?: number; name?: string; places: number } | undefined {
  const m = CELL.exec(cut(plain(text), 200));
  if (!m || !Number.isFinite(num(m[1])) || Math.abs(num(m[1])) > 1e6) return undefined;
  const second = m[2] === undefined ? undefined : num(m[2]), counted = second !== undefined && Math.abs(second) <= 1e6;
  return { value: num(m[1]), ...(counted ? { second } : {}), ...(m[3] ? { name: cut(m[3], 80) } : {}), places: Math.max(placesIn(m[1]), counted ? placesIn(m[2]!) : 0) };
}
export const cellText = (value: number | null | undefined, second: number | null | undefined, name: string | null | undefined, places: number) =>
  value == null ? "" : [shown(value, places), second == null ? "" : `(${shown(second, places)})`, name ?? ""].filter(Boolean).join(" ");
// Text copied from a spreadsheet as rows of cells. inLines: it is pasted in a field of lines of text, where text with
// no tab is that field's own (a value of several lines), not a table.
export function pastedRows(text: string, most = MAX_STATES + 1, wide = MAX_PATHS + 1, chars = 200, inLines = false): string[][] {
  if (inLines && !text.includes("\t")) return [];
  // Cut first: no more text than the largest table holds is looked at.
  const lines = text.slice(0, most * wide * (chars + 2)).replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  const rows = lines.slice(0, most).map((r) => r.split("\t").slice(0, wide).map((x) => cut(plain(x), chars)));
  return rows.length > 1 || (rows[0]?.length ?? 0) > 1 ? rows : [];
}
// An energy diagram's table: the paths' names, and a row for each state (its name, then a cell for each path).
export type EnergyTable = { paths: string[]; rows: string[][] };
// Whether a value's own name in the table is longer than the chart keeps it (parseCell keeps 80 characters): the
// chart dialog says so (docs/plans/long-text.md). Its fields hold a name, the paths' and the states', to 80.
export const longNames = (t: EnergyTable) => t.rows.some((r) => r.slice(1).some((x) => (CELL.exec(cut(plain(x), 200))?.[3]?.length ?? 0) > 80));
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
// On a Jablonski diagram, text over a state's name or a transition's label is that name or label (J5), drawn again
// with its scripts when it was typed as plain text (rich: it has a style of its own, which stays as typed).
// The roles whose text retyped takes as data: it keeps 80 characters of it, as the record holds (str).
export const isDataRole = (role: string) => role === "axis-title" || /^(?:(?:value|second|name|keyname|axis):\d+(?::\d+)?|(?:state|label):\d+)$/.test(role);
export function retyped(c: Chart, role: string, text: string, rich = false): { chart: Chart; redraw: boolean } | undefined {
  const m = /^(value|second|name|keyname|axis):(\d+)(?::(\d+))?$/.exec(role), t = cut(plain(text), 80);
  if (!t) return undefined;
  if (c.kind === "jablonski") {
    const k = /^(state|label):(\d+)$/.exec(role), redraw = !rich && !!scripted(t).runs, i = k ? +k[2] : -1;
    if (role === "axis-title") return { chart: { ...c, unit: t }, redraw: false };
    if (k?.[1] === "state" && c.states[i]) return { chart: { ...c, states: c.states.map((s, j) => (j === i ? { ...s, name: t } : s)) }, redraw };
    if (k?.[1] === "label" && c.transitions[i]) return { chart: { ...c, transitions: c.transitions.map((x, j) => (j === i ? { ...x, label: t } : x)) }, redraw };
    return undefined;
  }
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
export const fin = (v: unknown, lo = -1e6, hi = 1e6): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
export const str = (v: unknown, most = 80): v is string => typeof v === "string" && v.length <= most && !/[\u0000-\u001f]/.test(v);
export const pair = (v: unknown, lo?: number, hi?: number): v is P => Array.isArray(v) && v.length === 2 && v.every((x) => fin(x, lo, hi));
export const hex = (v: unknown): v is string | undefined => v === undefined || (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v));
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
  if (o.kind === "jablonski") {
    const states = o.states as Record<string, unknown>[], ts = o.transitions as Record<string, unknown>[], n = Array.isArray(states) ? states.length : 0;
    const whole = (v: unknown, hi: number) => Number.isInteger(v) && fin(v, 0, hi), part = (v: unknown) => fin(v, 0, 1);
    if (!n || n > MAX_LEVELS || !states.every((s) => s && str(s.name) && pair(s.x, 0, 1) && (s.x as P)[0] < (s.x as P)[1] && part(s.y) && whole(s.vib, MAX_VIB))) return undefined;
    if (!Array.isArray(ts) || ts.length > MAX_TRANSITIONS || !ts.every((t) => t && whole(t.from, n - 1) && whole(t.to, n - 1) && JABLONSKI_KINDS.includes(t.kind as JablonskiKind) && (t.from === t.to) === (t.kind === "vr")
      && str(t.label) && pair(t.x, 0, 1) && Array.isArray(t.vib) && t.vib.length === 2 && t.vib.every((v) => whole(v, MAX_VIB)))) return undefined;
    if (typeof o.axis !== "boolean" || !str(o.unit)) return undefined;
    return { ...base, kind: "jablonski", axis: o.axis, unit: o.unit as string,
      states: states.map((s) => ({ name: s.name as string, x: [...(s.x as P)] as P, y: s.y as number, vib: s.vib as number })),
      transitions: ts.map((t) => ({ from: t.from as number, to: t.to as number, kind: t.kind as JablonskiKind, label: t.label as string, x: [...(t.x as P)] as P, vib: [...(t.vib as P)] as P })) };
  }
  return undefined;
}
