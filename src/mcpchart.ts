// Charts for AI apps (issue 43, plan J7): draw's kind chart (a Jablonski diagram, an energy diagram or a sensitivity
// screen), the charts read lists, and run_command's chart. actions on the ids given. Pure functions on a drawing, so
// mcp.ts wires them in a few lines and the editor and Octet with no window do the same. Everything here comes from an
// AI app and is checked: a record that readChart would refuse is never placed.
import { chartAction, placePlot, plotFigure, plotShift, type PlotEnv } from "./pageplot.ts";
import { chartName, coverScale, cut, defaultTransitions, energyOfTable, figureBox, isChart, KIND_LABELS, KIND_NAMES, kindOf, MAX_LEVELS, MAX_TRANSITIONS, NEW_ENERGY, NEW_RADAR, plain, radarOfRows, readChart, roomFor, soundScale, vibOf, type Chart, type JablonskiChart, type JablonskiKind, type JState, type JTransition } from "./charts.ts";
import { widthOf } from "./arial.ts";
import type { DocStyle } from "./docstyle.ts";
import type { Group, Mol } from "./render.ts";

type P = [number, number];
export type ChartIn = {
  chart: "jablonski" | "energy" | "radar"; title?: string; axis?: boolean; unit?: string;
  states?: { name: string; energy?: number; vib?: number; column?: "left" | "right" }[]; transitions?: { from: string; to: string; kind?: JablonskiKind; label?: string }[];
  rows?: string[][]; join?: "line" | "dashed" | "curve"; min?: number; max?: number; step?: number; zones?: boolean;
};
export const envOf = (s: DocStyle): PlotEnv => ({ captionSize: s.captionSize, bond: s.bond, line: s.line, measure: (t) => widthOf(t, 1) });
// Text as a record keeps it: one line, 80 UTF-16 units at most, never through the middle of a character.
const name = (t: string) => cut(plain(t), 80);
const place = { origin: [0, 0] as P, scale: 1, text: 1, roles: [] as string[] };

// A Jablonski diagram from states and transitions as an AI app gives them: each state's level at its energy (the
// lowest at the foot; none given, by its name's number with a triplet or a quartet under the singlet of its number,
// as T1 under S1, else in the order given), the ground state across both columns and the others
// in theirs (S and D left, T and Q right, D8), and the transitions given (else Kasha's rule's), each kind from its
// states unless given. Transitions between two levels one over the other share the room across evenly, in the order
// given; the others run from the end of one level to the start of the other.
function jablonskiOf(a: ChartIn): JablonskiChart | string {
  const given = a.states ?? [];
  if (!given.length) return "states: give one state at least";
  if (given.length > MAX_LEVELS) return `states: give ${MAX_LEVELS} at most`;
  const names = given.map((s) => name(s.name)), twice = names.find((n, i) => names.indexOf(n) !== i);
  if (twice !== undefined) return `states: two states are named ${twice || "with no name"}`;
  const energies = given.filter((s) => s.energy !== undefined).length;
  if (energies && energies < given.length) return "states: give every state an energy, or none";
  const bad = given.findIndex((s) => (s.energy !== undefined && !Number.isFinite(s.energy)) || (s.vib !== undefined && !(Number.isInteger(s.vib) && s.vib >= 0 && s.vib <= 8)));
  if (bad >= 0) return `states[${bad}]: energy is a number, and vib a whole number from 0 to 8`;
  const n = given.length, numbers = names.map((t) => /^([A-Za-z])[_{]*(\d{1,3})(?!\d)/.exec(t.replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080))));
  const heights = energies ? given.map((s) => s.energy!) : numbers.every(Boolean) ? numbers.map((x) => Number(x![2]) - (/[TQ]/i.test(x![1]) ? 0.3 : 0)) : given.map((_, i) => i);
  const lo = Math.min(...heights), hi = Math.max(...heights), ys = heights.map((h) => (hi - lo > 1e-12 ? (h - lo) / (hi - lo) : 0));
  const ground = ys.indexOf(Math.min(...ys));
  const states: JState[] = given.map((s, i) => {
    const right = (s.column ?? (/^[TQ]/i.test(names[i]) ? "right" : "left")) === "right";
    return { name: names[i], x: i === ground ? [0, 1] : right ? [0.6, 1] : [0, 0.45], y: Math.round(ys[i] * 1e9) / 1e9, vib: s.vib ?? 3 };
  });
  let transitions: Omit<JTransition, "x">[];
  if (a.transitions === undefined) transitions = defaultTransitions(states);
  else {
    if (a.transitions.length > MAX_TRANSITIONS) return `transitions: give ${MAX_TRANSITIONS} at most`;
    transitions = [];
    for (const [i, t] of a.transitions.entries()) {
      const from = names.indexOf(name(t.from)), to = names.indexOf(name(t.to));
      if (from < 0) return `transitions[${i}].from: no state is named ${name(t.from)}`;
      if (to < 0) return `transitions[${i}].to: no state is named ${name(t.to)}`;
      const kind = t.kind ?? kindOf(states, from, to);
      if ((from === to) !== (kind === "vr")) return `transitions[${i}].kind: vibrational relaxation is within one state, and every other kind between two`;
      if (kind === "vr" && !states[from].vib) return `transitions[${i}]: vibrational relaxation needs vibrational levels (vib 1 or more on ${names[from]})`;
      transitions.push({ from, to, kind, label: t.label !== undefined ? name(t.label) : KIND_LABELS[kind], vib: vibOf(kind, states[from], states[to]) });
    }
  }
  // The room across: transitions between levels one over the other, by the stretch both levels share.
  const shared = (t: Omit<JTransition, "x">): P | undefined => { const p = states[t.from], q = states[t.to], l = Math.max(p.x[0], q.x[0]), h = Math.min(p.x[1], q.x[1]); return h > l + 1e-6 ? [l, h] : undefined; };
  const groups = new Map<string, number[]>();
  transitions.forEach((t, i) => { const s = shared(t); if (s) groups.set(s.join(), [...(groups.get(s.join()) ?? []), i]); });
  const across: P[] = transitions.map(() => [0, 0]);
  for (const [k, list] of groups) { const [l, h] = k.split(",").map(Number); list.forEach((i, j) => { const x = l + ((j + 0.5) / list.length) * (h - l); across[i] = [x, x]; }); }
  transitions.forEach((t, i) => { if (!shared(t)) across[i] = roomFor({ states, transitions: [] }, t.from, t.to); });
  const most = Math.max(0, ...[...groups.values()].map((l) => l.length));
  // Tall enough that between two levels one over the other there is room for the lower one's vibrational levels and a
  // label (at the default caption size, 0.69 bond lengths), up to 60 bond lengths.
  const em = 10 / 14.4, room = states.flatMap((p) => states.flatMap((q) => (q.y > p.y + 1e-9 && Math.min(p.x[1], q.x[1]) > Math.max(p.x[0], q.x[0]) + 1e-6 ? [(p.vib * em / 2 + 2.2 * em) / (q.y - p.y)] : [])));
  const c: JablonskiChart = { kind: "jablonski", title: a.title ? name(a.title) : "Jablonski diagram", states, transitions: transitions.map((t, i) => ({ ...t, x: across[i] })), axis: a.axis ?? true, unit: a.unit !== undefined ? name(a.unit) : "Energy",
    frame: [Math.max(15, 3.6 * most), Math.min(60, Math.max(7, 1.8 * (n - 1), ...room))], ...place };
  return readChart(JSON.parse(JSON.stringify(c))) ? c : "states: Octet cannot draw these";
}
// A chart's record from what an AI app gives, or why it cannot be drawn (the argument first).
export function chartRecord(a: ChartIn): Chart | string {
  if (a.chart === "jablonski") return jablonskiOf(a);
  const rows = (a.rows ?? []).map((r) => r.map((x) => String(x)));
  if (a.chart === "energy") {
    const data = rows.length > 1 ? energyOfTable({ paths: rows[0].slice(1), rows: rows.slice(1) }) : undefined;
    if (!data) return "rows: give the paths' names (after an empty cell), then each state's name and its energy on each path";
    return { ...NEW_ENERGY, ...data, ...place, title: a.title ? name(a.title) : NEW_ENERGY.title, join: a.join ?? "line", unit: a.unit !== undefined ? name(a.unit) : NEW_ENERGY.unit, axis: a.axis ?? true, key: true, frame: [Math.max(10, 3.4 * data.states.length + 1), 12] };
  }
  const axes = radarOfRows(rows);
  if (!axes) return "rows: give three conditions or more, each with its value (% from the standard conditions)";
  const scale = { axes, min: a.min ?? NEW_RADAR.min, max: a.max ?? NEW_RADAR.max, step: a.step ?? NEW_RADAR.step };
  const sound = soundScale(scale) ? scale : a.min === undefined && a.max === undefined && a.step === undefined ? { ...scale, ...coverScale(scale) } : undefined;
  if (!sound || !soundScale(sound)) return "min, max, step: the scale must hold every value, with 40 rings at most";
  return { ...NEW_RADAR, ...place, ...sound, title: a.title ? name(a.title) : NEW_RADAR.title, zones: a.zones ?? true, frame: [10, 10] };
}
// The chart on the page with its box's top left at a point: the new drawing, its group and its parts' ids.
export function placeChart(m: Mol, c: Chart, env: PlotEnv, at: P): { mol: Mol; group: number; items: number[] } {
  const fig = plotFigure(c, env), em = (env.captionSize * c.text) / env.bond, box = figureBox(fig, em, env.measure);
  const [mol, items] = placePlot(m, { ...c, origin: [at[0] - box[0], at[1] - box[3]] }, env, fig);
  return { mol, group: mol.groups?.find((g) => g.plot && g.items.includes(items[0]))?.id ?? -1, items };
}
// The chart a part is in (its id, t5 or a7), as its group.
export const chartOf = (m: Mol, id: string): Group | undefined => { const n = Number(/^[tab](\d+)$/.exec(id)?.[1]); return Number.isInteger(n) ? m.groups?.find((g) => g.plot && isChart(g.plot) && g.items.includes(n)) : undefined; };
// A part of a chart by its role, as an id.
function partsOf(m: Mol, g: Group) {
  const ids = new Set(g.items), by = new Map<string, string>();
  for (const a of m.arrows ?? []) if (ids.has(a.id) && a.role) by.set(a.role.role, `a${a.id}`);
  for (const c of m.captions ?? []) if (ids.has(c.id) && c.role) by.set(c.role.role, `t${c.id}`);
  return by;
}
// What read gives for each chart: its kind, title, every part's id, and its data. A Jablonski diagram's states (each
// with its level's id, its name's and its vibrational levels) and transitions (from, to, kind, label, and the ids of
// the arrow and its label); an energy diagram's states and paths; a sensitivity screen's conditions. in_use: false
// for a chart that was turned or flipped, whose data cannot change.
export function chartsOf(m: Mol) {
  return (m.groups ?? []).filter((g) => g.plot && isChart(g.plot)).map((g) => {
    const c = g.plot as Chart, by = partsOf(m, g), base = { chart: c.kind, title: c.title, name: chartName(c), ...(plotShift(m, g) ? {} : { in_use: false }), ids: [...by.values()] };
    if (c.kind === "energy") return { ...base, states: c.states, paths: c.paths.map((p) => p.name) };
    if (c.kind === "radar") return { ...base, conditions: c.axes.map((x) => ({ name: x.label, value: x.value })) };
    return { ...base, axis: c.axis,
      states: c.states.map((s, k) => ({ name: s.name, level: by.get(`level:${k}`), text: by.get(`state:${k}`), vib: s.vib })),
      transitions: c.transitions.map((t, i) => ({ from: c.states[t.from].name, to: c.states[t.to].name, kind: t.kind, label: t.label, id: by.get(`trans:${i}`), text: by.get(`label:${i}`) })) };
  });
}
// The ids of every chart's parts: read leaves them out of its free text and arrows, as it lists them with their chart.
export const chartParts = (m: Mol) => new Set((m.groups ?? []).filter((g) => g.plot && isChart(g.plot)).flatMap((g) => g.items));
// What draw says it drew: each state with its level's id (its name's), each transition with its arrow's (its label's).
export function chartReply(m: Mol, gid: number): string {
  const g = m.groups?.find((x) => x.id === gid), c = g?.plot;
  if (!g || !c || !isChart(c)) return "Octet drew nothing.";
  const by = partsOf(m, g), ids = (r: string, t: string) => [by.get(r), by.get(t) && `(${by.get(t)})`].filter(Boolean).join(" ");
  if (c.kind !== "jablonski") return `Drew ${c.kind === "energy" ? "an energy diagram" : "a sensitivity screen"} of ${g.items.length} parts: ${[...by.values()].slice(0, 3).join(", ")} and the rest (read lists them).`;
  return `Drew a Jablonski diagram: ${c.states.map((s, k) => `${s.name} ${ids(`level:${k}`, `state:${k}`)}`).join(", ")}; ${c.transitions.map((t, i) => `${KIND_NAMES[t.kind].toLowerCase()} ${c.states[t.from].name}→${c.states[t.to].name} ${ids(`trans:${i}`, `label:${i}`)}`).join(", ") || "no transitions"}.`;
}
// run_command's chart. actions on the ids given (by their numbers): the chart they are all parts of. The new drawing,
// or why not (the argument first).
export function chartCommand(m: Mol, command: string, items: number[], env: PlotEnv): { mol: Mol } | string {
  if (!items.length) return "ids: give the ids of a chart's parts (read lists them)";
  const gs = (m.groups ?? []).filter((g) => g.plot && isChart(g.plot) && items.some((id) => g.items.includes(id)));
  if (!gs.length) return "ids: none of these is part of a chart";
  if (gs.length > 1) return "ids: these are parts of two charts; give one chart's";
  const g = gs[0];
  if (items.some((id) => !g.items.includes(id))) return "ids: some of these are not part of the chart";
  if (!plotShift(m, g)) return "ids: this chart was turned or flipped, so its data cannot change";
  const r = chartAction(m, g.id, command, items, env);
  const named = chartName(g.plot as Chart);
  if (!r) return `command: ${command} is not an action of this ${g.plot?.kind === "jablonski" ? named : named.toLowerCase()}`;
  if ("mol" in r) return r;
  const which = /transition first/.test(r.notice) ? "ids: give a transition's id (or its label's)" : /one level/.test(r.notice) ? "ids: give one level's id" : /level first/.test(r.notice) ? "ids: give a level's id (or a vibrational level's, or its name's)" : `command: ${r.notice.replace(/\.$/, "")}`;
  return which;
}
