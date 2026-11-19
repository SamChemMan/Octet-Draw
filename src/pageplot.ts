// A page spectrum's record (Add to drawing > Spectrum). The spectrum stays a group of ordinary lines, curves and
// captions, so each part selects, colours, moves, saves and prints as any other. The group also keeps what was
// plotted (plot) and each part keeps its role and the place Octet gave it (role). A resize or a scale then builds the
// parts again at the new frame from the record, and every part whose role is still there keeps what the user changed:
// colour, font, style, text, turn, and how far it was moved. A part the user deleted stays deleted. Nothing is laid
// out again on open or on render: the file holds every part where it was drawn. Octet 1.1.0 drops the record and the
// roles, and reads the same group.
import type { Arrow, Caption, CurvePoint, Group, Mol } from "./render.ts";
import { groupSelection } from "./edit.ts";
import { addTitle, GREY, SMALL, spectrumFigure, traceColumns, type Figure, type LabelTurn } from "./spectrumplot.ts";
import { chartFigure, chartName, endsOf, fin as num, framed, hex as colour, isChart, JABLONSKI_KINDS, KIND_LABELS, kindOf, MAX_LEVELS, MAX_TRANSITIONS, MAX_VIB, pair, readChart, retyped, roomFor, soundScale, str, vibGap, vibOf, type Chart, type JablonskiChart, type JablonskiKind, type JTransition } from "./charts.ts";
import { keyOf, levels, measuredFigure, nameOf, xAt, type Analysed, type Analysis, type Measured } from "./measured.ts";
import type { Kind } from "./jcamp.ts";
import { frequency, isNucleus, NUCLEI, type Nucleus, type Signal } from "./nmr.ts";

type P = [number, number];
// A part's role ("axis", "tick:7", "tick:7/n", "trace", "fill:k", "peak:k/0", "leader:peak:k", "title", "notice"; a
// second part with the same role gets "~1" and so on) and its place as Octet gave it (a caption's anchor, a line's
// start).
export type PlotPart = { role: string; at: P };
// A predicted signal as drawn: its key (from its atoms' class), shift, nuclei, couplings, broad, and colour.
export type PlotSignal = { key: string; shift: number; nuclei: number; couplings: { j: number; n: number }[]; broad?: true; colour?: string };
// A measured multiplet as drawn: its id, range, shift, name and nuclei, the solvent's or TMS's name, and its colour.
export type PlotPeak = { id: number; lo: number; hi: number; shift: number; name: string; n: number; other?: string; colour?: string };
// A measured trace: its points in range (at most MAX_TRACE), what they are, its baseline, and its multiplets.
export type PlotTrace = { kind: Kind; nucleus?: string; xUnit: string; yUnit: string; sticks?: true; base: number; x: number[]; y: number[]; peaks: PlotPeak[] };
// The record. frame: the plot's width and the tallest peak's height (bond lengths); origin: where the axis starts as
// Octet placed it (the parts' offsets carry any move since); scale: the structure's scale it was drawn at; text: how
// much its text and lines were scaled; labels: the Labels choice; roles: every role Octet placed last.
// A page figure's record is a spectrum's or a chart's (charts.ts: an energy diagram, a sensitivity screen).
export type Plot = SpectrumPlot | Chart;
export type SpectrumPlot = {
  kind: "predicted" | "measured"; nucleus: string; mhz: number; solvent: string; solventPeaks: boolean; range: P; frame: P; origin: P;
  scale: number; text: number; labels: LabelTurn; title: string; notice: boolean; signals?: PlotSignal[]; trace?: PlotTrace; roles: string[];
};
// What a build needs from the document: its caption size (pt), its bond length (pt), a text's width in em, and its
// line width (pt; a Jablonski diagram fits its waves to its heads with it).
export type PlotEnv = { captionSize: number; bond: number; measure?: (t: string) => number; line?: number };
export const MAX_TRACE = 8192, MAX_LINES = 20000;
// The smallest frame a resize gives (bond lengths).
const MIN_W = 3, MIN_H = 0.5;

// A page spectrum's name as one object: "¹H NMR spectrum", "¹³C NMR spectrum", "IR spectrum", "Mass spectrum".
export function plotName(p: Plot): string {
  if (isChart(p)) return chartName(p);
  const key = p.trace ? keyOf({ kind: p.trace.kind, nucleus: p.trace.nucleus ?? (p.nucleus || undefined) }) : p.nucleus;
  return key === "ms" ? "Mass spectrum" : key === "other" ? "Spectrum" : `${nameOf(key)} spectrum`;
}
// Each signal's key: its class, with "#2" and so on for a second signal of the same class.
export function signalKeys(signals: Pick<Signal, "code" | "shift">[]): string[] {
  const seen = new Map<string, number>();
  return signals.map((s) => { const k = s.code ?? s.shift.toFixed(2), n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return n > 1 ? `${k}#${n}` : k; });
}
// A measured spectrum's points in range as a record keeps them: every point, or each of MAX_TRACE / 2 - 1 columns'
// lowest and highest, so no peak is lost.
export function traceOf(m: Measured, a: Analysis, range: P, colour: (id: number) => string | undefined): PlotTrace {
  const [lo, hi] = range, pad = (hi - lo) * 0.01, x: number[] = [], y: number[] = [];
  for (let i = 0; i < m.y.length; i++) { const v = xAt(m, i); if (v >= lo - pad && v <= hi + pad) { x.push(v); y.push(m.y[i]); } }
  if (x.length > MAX_TRACE) {
    const cols = MAX_TRACE / 2 - 1, cs = traceColumns({ first: m.first, last: m.last, y: m.y, xs: m.xs }, (v) => ((v - lo + pad) / (hi - lo + 2 * pad)) * cols, cols).filter(([c]) => c >= 0 && c <= cols);
    x.length = y.length = 0;
    for (const [c, v] of cs) { x.push(lo - pad + (c / cols) * (hi - lo + 2 * pad)); y.push(v); }
  }
  // Eight figures across and six up are more than the page or the file's 16-bit levels can show.
  for (let i = 0; i < x.length; i++) { x[i] = +x[i].toPrecision(8); y[i] = +y[i].toPrecision(6); }
  const peaks = a.groups.map((g): PlotPeak => ({ id: g.id, lo: g.lo, hi: g.hi, shift: g.shift, name: g.name, n: g.n, ...(g.other ? { other: g.other } : {}), ...(colour(g.id) ? { colour: colour(g.id) } : {}) }));
  return { kind: m.kind, ...(m.nucleus ? { nucleus: m.nucleus } : {}), xUnit: m.xUnit, yUnit: m.yUnit, ...(m.sticks ? { sticks: true as const } : {}), base: levels(m).base, x, y, peaks };
}
// The figure a record gives at its frame, with its title and notice.
export function plotFigure(p: Plot, env: PlotEnv): Figure {
  if (isChart(p)) return chartFigure(p, (env.captionSize * p.text) / env.bond, env.line !== undefined ? env.line / env.bond : undefined);
  const [W, H] = p.frame, em = (env.captionSize * p.text) / env.bond, sizes = { width: W, height: H, em, pt: p.scale / env.bond, labels: p.labels, measure: env.measure };
  let fig: Figure;
  if (p.trace) {
    const t = p.trace, colours = new Map(t.peaks.map((g) => [g.id, g.colour]));
    const m = { title: "", kind: t.kind, nucleus: t.nucleus, xUnit: t.xUnit, yUnit: t.yUnit, first: t.x[0] ?? 0, last: t.x[t.x.length - 1] ?? 0, y: Float32Array.from(t.y), xs: Float64Array.from(t.x), lo: p.range[0], hi: p.range[1], threshold: 0, groups: [], ...(t.sticks ? { sticks: true as const } : {}) } as Measured;
    fig = measuredFigure({ m, a: { groups: t.peaks as Analysed[], peaks: [], per: 0, base: t.base, noise: 0 }, range: p.range, colour: (id) => colours.get(id), base: t.base, ...sizes });
  } else {
    const s = p.signals ?? [];
    fig = spectrumFigure({ prediction: { nucleus: p.nucleus as Nucleus, signals: s.map((x) => ({ atoms: [], sd: 0, based: 0, ...x })) }, nucleus: p.nucleus as Nucleus, mhz: p.mhz, solvent: p.solvent, solventPeaks: p.solventPeaks, range: p.range, colours: s.map((x) => x.colour), keys: s.map((x) => x.key), ...sizes });
  }
  addTitle(fig, { title: p.title, notice: p.notice, width: W, height: H, em });
  return fig;
}
// The figure's top above its axis (for placing it under a structure).
export const plotTop = (fig: Figure, p: SpectrumPlot, env: PlotEnv) => (fig.top ?? p.frame[1]) + 0.6 * ((env.captionSize * p.text) / env.bond);

type Made = { role: string; caption?: Omit<Caption, "id">; arrow?: Omit<Arrow, "id"> };
// The figure's parts at origin, each with its role. Text scaled by the record's text gets that size, and lines that
// scale.
function madeOf(fig: Figure, at: P, text: number, captionSize: number): Made[] {
  const to = (q: P): P => [at[0] + q[0], at[1] + q[1]], seen = new Map<string, number>(), out: Made[] = [];
  const named = (r = "part") => { const n = seen.get(r) ?? 0; seen.set(r, n + 1); return n ? `${r}~${n}` : r; };
  const paint = (x: { colour?: string; grey?: true }) => (x.colour || x.grey ? { colour: x.colour ?? GREY } : {});
  const scaled = text !== 1 ? { scale: text } : {}, sized = (k: number) => (k !== 1 ? { size: Math.round(captionSize * k * 10) / 10 } : {});
  const curve = (c: Figure["curves"][number]) => {
    const role = named(c.role), pts: CurvePoint[] = c.points.map((q) => ({ at: to(q.at), ...(q.c1 ? { c1: to(q.c1) } : {}), ...(q.c2 ? { c2: to(q.c2) } : {}) }));
    out.push({ role, arrow: { kind: "curve", from: pts[0].at, to: pts[pts.length - 1].at, curve: { points: pts, ...(c.fill || c.closed ? { closed: true } : {}) }, ...(c.fill ? { fill: "solid" as const, colour: c.fill } : paint(c)), ...(c.style ? { style: c.style } : {}), ...scaled, role: { role, at: pts[0].at } } });
  };
  // A chart's zones go behind its lines.
  for (const c of fig.curves) if (c.back) curve(c);
  for (const l of fig.lines) { const role = named(l.role), from = to(l.from); out.push({ role, arrow: { kind: "line", from, to: to(l.to), ...paint(l), ...(l.style ? { style: l.style } : {}), ...(l.end ? { end: l.end } : {}), ...scaled, role: { role, at: from } } }); }
  for (const c of fig.curves) if (!c.back) curve(c);
  for (const t of fig.texts) {
    const role = named(t.role), q = to(t.at);
    out.push({ role, caption: { text: t.text, x: q[0], y: q[1], align: t.align, ...paint(t), ...(t.runs ? { runs: t.runs } : {}), ...(t.chemical === false ? { chemical: false as const } : {}), ...(t.angle ? { angle: t.angle } : {}), ...(t.width ? { width: t.width } : {}), ...sized(text * (t.small ? SMALL : 1)), role: { role, at: q } } });
  }
  return out;
}
// A record's figure on the page in one plain group with the record. The new drawing, and its parts' ids.
export function placePlot(m: Mol, p: Plot, env: PlotEnv, fig = plotFigure(p, env)): [Mol, number[]] {
  // The next id is taken once and the parts added in one step: a large chart has thousands of parts.
  const made = madeOf(fig, p.origin, p.text, env.captionSize), items: number[] = [], captions: Caption[] = [], arrows: Arrow[] = [];
  let id = Math.max(0, ...[...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.groups ?? [])].map((x) => x.id)) + 1;
  for (const x of made) { if (x.caption) captions.push({ ...x.caption, id }); else arrows.push({ ...x.arrow!, id }); items.push(id++); }
  if (items.length) m = { ...m, ...(captions.length ? { captions: [...(m.captions ?? []), ...captions] } : {}), ...(arrows.length ? { arrows: [...(m.arrows ?? []), ...arrows] } : {}) };
  const grouped = groupSelection(m, new Set(), new Set(items));
  if (!grouped) return [m, items];
  const plot = { ...p, roles: made.map((x) => x.role) };
  return [{ ...grouped[0], groups: grouped[0].groups?.map((g) => (g.id === grouped[1] ? { ...g, plot } : g)) }, items];
}

// How far most of a page spectrum's parts are from where Octet put them: the group's move. Undefined when fewer than
// half agree (the group was turned or flipped, or has no parts with roles), so the record is not used.
export function plotShift(m: Mol, g: Group): P | undefined {
  if (!g.plot) return undefined;
  const ids = new Set(g.items), offs: P[] = [];
  for (const c of m.captions ?? []) if (ids.has(c.id) && c.role) offs.push([c.x - c.role.at[0], c.y - c.role.at[1]]);
  for (const a of m.arrows ?? []) if (ids.has(a.id) && a.role) offs.push([a.from[0] - a.role.at[0], a.from[1] - a.role.at[1]]);
  let best: P | undefined, most = 0;
  const near = (q: P, o: P) => Math.abs(q[0] - o[0]) < 2e-3 && Math.abs(q[1] - o[1]) < 2e-3;
  for (const o of offs.slice(0, 200)) {
    const n = offs.reduce((k, q) => k + (near(q, o) ? 1 : 0), 0);
    if (n > most) { most = n; best = o; }
  }
  if (!best || 2 * most < offs.length) return undefined;
  // After a flip, the parts that still agree all sit on one line (the axis and its ticks), so they must spread both
  // across and up.
  const ats = [...(m.captions ?? []), ...(m.arrows ?? [])].flatMap((x) => (ids.has(x.id) && x.role && near("from" in x ? [x.from[0] - x.role.at[0], x.from[1] - x.role.at[1]] : [x.x - x.role.at[0], x.y - x.role.at[1]], best!) ? [x.role.at] : []));
  const spread = (k: 0 | 1) => Math.max(...ats.map((q) => q[k])) - Math.min(...ats.map((q) => q[k])) > 1e-3;
  return spread(0) && spread(1) ? best : undefined;
}
// The page spectra (with records still in use) whose parts are all among these objects.
export const plotsIn = (m: Mol, items: Set<number>) => (m.groups ?? []).filter((g) => g.plot && g.items.every((id) => items.has(id)) && plotShift(m, g));
// The one page spectrum that is all of what is chosen, if it is.
export function lonePlot(m: Mol, atoms: Set<number>, items: Set<number>): Group | undefined {
  const gs = atoms.size ? [] : plotsIn(m, items);
  return gs.length === 1 && [...items].every((id) => gs[0].items.includes(id)) ? gs[0] : undefined;
}

// A peak label across is a caption a line: "2.42" over "(q, 2H)", roles "peak:k/1" and "peak:k/0". Both lines of the
// label this caption is a line of, in its own spectrum, so they pick, move and colour as one label. Any other caption:
// itself.
const labelKey = (r: string) => { const k = /^((?:peak|solvent):[^/~]*)\/\d+(~\d+)?$/.exec(r); return k ? k[1] + (k[2] ?? "") : undefined; };
export function labelLines(m: Mol, id: number): number[] {
  const c = m.captions?.find((x) => x.id === id), k = c?.role && labelKey(c.role.role);
  const g = k ? (m.groups ?? []).filter((x) => x.items.includes(id)).sort((a, b) => a.items.length - b.items.length)[0] : undefined;
  if (!g) return [id];
  const ids = new Set(g.items);
  return m.captions!.filter((x) => ids.has(x.id) && x.role && labelKey(x.role.role) === k).map((x) => x.id);
}

// --- Leaders ------------------------------------------------------------------------------------------------------
// A label's leader is one line, or three (stub, slant, drop): roles "leader:R", "leader:R~1", "leader:R~2", where R is
// the label's role ("R/0" is its bottom line across, "R" the label turned). n: how many parts Octet placed, from the
// record; a figure with no record (a mass spectrum) counts the parts it has.
type Leader = { label?: Caption; parts: (Arrow | undefined)[]; n: number };
// Within what a file's rounding leaves (as plotShift), so a drawing read from CDXML alone still joins.
const close = (a: P, b: P) => Math.abs(a[0] - b[0]) < 2e-3 && Math.abs(a[1] - b[1]) < 2e-3;
const plus = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const offsetOf = (x: Caption | Arrow): P => ("from" in x ? [x.from[0] - x.role!.at[0], x.from[1] - x.role!.at[1]] : [x.x - x.role!.at[0], x.y - x.role!.at[1]]);
function leadersOf(m: Mol, g: Group): Map<string, Leader> {
  const out = new Map<string, Leader>(), ids = new Set(g.items), at = (r: string) => { const k = /~(\d+)$/.exec(r); return k ? [r.slice(0, k.index), +k[1]] as const : [r, 0] as const; };
  const get = (r: string) => out.get(r) ?? out.set(r, { parts: [], n: 0 }).get(r)!;
  for (const r of g.plot?.roles ?? []) if (r.startsWith("leader:")) get(at(r.slice(7))[0]).n++;
  if (g.plot && !out.size) return out;
  for (const a of m.arrows ?? []) {
    if (!ids.has(a.id) || !a.role?.role.startsWith("leader:")) continue;
    const [r, k] = at(a.role.role.slice(7));
    if (g.plot && !out.has(r)) continue;
    const l = get(r);
    l.parts[k] = a;
    if (!g.plot) l.n = Math.max(l.n, k + 1);
  }
  const caps = new Map((m.captions ?? []).filter((c) => ids.has(c.id) && c.role).map((c) => [c.role!.role, c]));
  for (const [r, l] of out) l.label = caps.get(`${r}/0`) ?? caps.get(r);
  return out;
}
// Whether a leader still joins its label as Octet keeps it: every part there, its first part moved as far as its
// label, and each part starting where the one before ends. A leader the user moved, cut or bent does not.
function joined(l: Leader): boolean {
  if (!l.label || !l.n || l.parts.length !== l.n || [...l.parts].some((a) => !a)) return false;
  return close(offsetOf(l.parts[0]!), offsetOf(l.label)) && l.parts.every((a, k) => !k || close(l.parts[k - 1]!.to, a!.from));
}
// A label moved (a nudge, a drag): its leader follows, so it still joins label and peak. Its first part moves with the
// label (one line: only its label end), and the slant runs from there to the drop, which stays on its peak. A leader
// that no longer joins its label, or that this edit moved itself, stays as it is, and so does a spectrum this edit
// built again (replot joins its leaders). was: the drawing before the edit.
export function followLeaders(was: Mol, now: Mol): Mol {
  if (was === now || was.captions === now.captions || !now.groups?.length) return now;
  const before = new Map((was.captions ?? []).map((c) => [c.id, c]));
  const moved = new Set((now.captions ?? []).filter((c) => { const o = c.role && before.get(c.id); return o && !close([o.x, o.y], [c.x, c.y]); }).map((c) => c.id));
  if (!moved.size) return now;
  const change = new Map<number, Arrow>();
  for (const g of now.groups) {
    const og = g.items.some((id) => moved.has(id)) ? was.groups?.find((x) => x.id === g.id) : undefined;
    if (!og || og.plot !== g.plot) continue;
    const old = leadersOf(was, og);
    for (const [r, l] of leadersOf(now, g)) {
      const o = old.get(r), c0 = o?.label, c1 = l.label;
      if (!o || !c0 || !c1 || c0.id !== c1.id || !moved.has(c1.id) || !joined(o)) continue;
      if (l.parts.length !== o.parts.length || o.parts.some((a, k) => !l.parts[k] || !close(a!.from, l.parts[k]!.from) || !close(a!.to, l.parts[k]!.to))) continue;
      const d: P = [c1.x - c0.x, c1.y - c0.y], [s, slant] = l.parts as Arrow[];
      if (l.parts.length === 1) { change.set(s.id, { ...s, from: plus(s.from, d) }); continue; }
      const stub = { ...s, from: plus(s.from, d), to: plus(s.to, d) };
      change.set(s.id, stub);
      change.set(slant.id, { ...slant, from: stub.to });
    }
  }
  return change.size ? { ...now, arrows: now.arrows!.map((a) => change.get(a.id) ?? a) } : now;
}
// After a rebuild: each leader that joined its label before joins it again. Its first part goes as far from where Octet
// put it as its label did, its last part (the drop) as far as the whole spectrum moved, and the slant runs between.
function rejoin(old: Map<string, Leader>, captions: Caption[], arrows: Arrow[], shift: P): Arrow[] {
  const caps = new Map(captions.filter((c) => c.role).map((c) => [c.role!.role, c])), lines = new Map(arrows.filter((a) => a.role).map((a) => [a.role!.role, a])), change = new Map<number, Arrow>();
  for (const [r, o] of old) {
    if (!joined(o)) continue;
    const label = caps.get(`${r}/0`) ?? caps.get(r), parts: Arrow[] = [];
    for (let k = 0; k < 8; k++) { const a = lines.get(k ? `leader:${r}~${k}` : `leader:${r}`); if (!a) break; parts.push(a); }
    if (!label || !parts.length) continue;
    // Each part where Octet put it now: it was moved whole, so its end is as far from Octet's as its start.
    const at = parts.map((a): [P, P] => { const d = offsetOf(a); return [a.role!.at, [a.to[0] - d[0], a.to[1] - d[1]]]; }), dl = offsetOf(label), n = parts.length;
    const made: [P, P][] = n === 1 ? [[plus(at[0][0], dl), plus(at[0][1], shift)]] : at.map(([f, t], k) => (k === 0 ? [plus(f, dl), plus(t, dl)] : [plus(f, shift), plus(t, shift)]));
    for (let k = 1; k < n - 1; k++) made[k] = [made[k - 1][1], made[k + 1][0]];
    parts.forEach((a, k) => change.set(a.id, { ...a, from: made[k][0], to: made[k][1] }));
  }
  return change.size ? arrows.map((a) => change.get(a.id) ?? a) : arrows;
}

// The props of a part the user can change, which a rebuild keeps. notes: a part's notes (annotate.ts).
const CAPTION_KEEP = ["colour", "font", "bold", "italic", "underline", "text", "runs", "angle", "align", "lineHeight", "chemical", "order", "notes"] as const;
const TWIN_KEEP = ["colour", "font", "bold", "italic", "underline", "order"] as const;
// kind: a chart's line made a reaction arrow stays one (D14).
const ARROW_KEEP = ["kind", "colour", "style", "width", "start", "end", "head", "headSize", "fill", "order", "notes"] as const;
// wrote: the part as Octet made it last, when the record's data changed: a prop the user left as Octet made it takes
// the new record's (a value typed in Edit Data shows), and one the user changed stays.
// A caption's text and its runs are one prop: text the user left takes the new text and runs; text the user changed
// stays with its runs; runs the user restyled stay only while the text is the same. Values are compared whatever the
// order of their keys (a file gives a run's keys in its own order).
const alike = (a: unknown, b: unknown): boolean => a === b || (!!a && !!b && typeof a === "object" && typeof b === "object" && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => alike((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])));
function keep<T extends object>(made: T, old: object, keys: readonly string[], wrote?: object): T {
  const out = { ...made } as Record<string, unknown>, o = old as Record<string, unknown>, w = wrote as Record<string, unknown> | undefined;
  const fresh = !!w && keys.includes("text") && o.text === w.text && (alike(o.runs, w.runs) || out.text !== o.text);
  for (const k of keys) {
    // A centred caption read from a file has no align: that is the same as "centre".
    if (k === "text" || k === "runs" ? fresh : w && (k === "align" ? (o[k] ?? "centre") === (w[k] ?? "centre") : alike(o[k], w[k]))) continue;
    if (o[k] === undefined) delete out[k]; else out[k] = o[k];
  }
  return out as T;
}
// A page spectrum built again with its record changed (a new frame, origin or text scale; for a chart, new data too).
// Each part whose role is still there keeps its id, what the user changed and its offset from where Octet put it; a
// new part takes the group's move. Text keeps its size, times the change in the record's text scale.
// how.rename: a part's role before the change as its role after it, or undefined when what it showed is gone (a state
// or a path taken out in Edit Data), so each part's changes stay with what it shows. how.revive: roles that come back
// though the user deleted them (Show the axis). how.retyped: captions (by role) whose text is the record's again,
// because what the user typed there became data (followCharts).
export type Replot = { rename?: (role: string) => string | undefined; revive?: (role: string) => boolean; retyped?: Set<string> };
export function replot(m: Mol, gid: number, change: Partial<Plot>, env: PlotEnv, how: Replot = {}): Mol {
  const rename = how.rename ?? ((r: string) => r);
  const g = m.groups?.find((x) => x.id === gid), was = g?.plot, shift = g && plotShift(m, g);
  if (!g || !was || !shift) return m;
  const ids = new Set(g.items), now = new Map<string, Caption | Arrow>(), parts = [...(m.captions ?? []), ...(m.arrows ?? [])].filter((x) => ids.has(x.id) && x.role), there = new Set(parts.map((x) => x.role!.role));
  for (const x of parts) { const r = rename(x.role!.role); if (r !== undefined) now.set(r, x); }
  const p = { ...was, ...change } as Plot, ratio = p.text / was.text, made = madeOf(plotFigure(p, env), p.origin, p.text, env.captionSize);
  // With new data, the parts as Octet made them last, by role.
  const wrote = Object.keys(change).some((k) => k !== "frame" && k !== "origin" && k !== "text") ? new Map(madeOf(plotFigure(was, env), was.origin, was.text, env.captionSize).flatMap((x) => { const r = rename(x.role); return r === undefined ? [] : [[r, x.caption ?? x.arrow!] as const]; })) : undefined;
  // Deleted: a role Octet placed that is gone, and a role whose every part is gone (a whole leader).
  const base = (r: string) => r.split(/[/~]/)[0], placed = was.roles.flatMap((r) => { const to = rename(r); return to === undefined ? [] : [[to, there.has(r)] as const]; });
  const gone = new Set(placed.filter(([r, here]) => !here && !how.revive?.(r)).map(([r]) => r)), live = new Set(placed.filter(([, here]) => here).map(([r]) => base(r))), goneBase = new Set(placed.map(([r]) => base(r)).filter((b) => !live.has(b) && !how.revive?.(b)));
  // A new part takes the draw order of the kept part nearest after it in the figure (else nearest before it), so new
  // zones stay behind the chart's lines and nothing new is lifted over them (order.ts).
  const kept = made.map((x) => now.get(x.role)), orderAt = (k: number): number | undefined => {
    for (let j = k + 1; j < made.length; j++) if (kept[j]) return kept[j]!.order;
    for (let j = k - 1; j >= 0; j--) if (kept[j]) return kept[j]!.order;
    return undefined;
  };
  let next = Math.max(0, ...[...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.groups ?? [])].map((x) => x.id)) + 1;
  // A label that turns (Auto) or turns back takes the colour, font, size and move of the label it was: a turned label's
  // role is "peak:k" and its two lines across are "peak:k/0" and "peak:k/1".
  const roles = new Set(made.map((x) => x.role));
  const twin = (r: string) => {
    if (!/^(peak|solvent):[^/~]*(\/\d)?$/.test(r)) return undefined;
    const root = r.split("/")[0], c = (r === root ? [`${root}/0`, `${root}/1`] : [root]).find((k) => !roles.has(k) && now.get(k) && !("from" in now.get(k)!));
    return c === undefined ? undefined : (now.get(c) as Caption);
  };
  const captions: Caption[] = [], arrows: Arrow[] = [];
  for (const [k, x] of made.entries()) {
    if (gone.has(x.role) || goneBase.has(base(x.role))) continue;
    const order = kept[k] ? undefined : orderAt(k);
    const old = now.get(x.role), prior = old ?? (x.caption ? twin(x.role) : undefined);
    const d: P = prior ? ("from" in prior ? [prior.from[0] - prior.role!.at[0], prior.from[1] - prior.role!.at[1]] : [prior.x - prior.role!.at[0], prior.y - prior.role!.at[1]]) : shift;
    const id = old?.id ?? next++, by = (q: P): P => [q[0] + d[0], q[1] + d[1]];
    if (x.caption) {
      const o = prior && !("from" in prior) ? prior : undefined, c: Caption = { ...x.caption, id, x: x.caption.x + d[0], y: x.caption.y + d[1] };
      captions.push(o ? { ...keep(c, o, old ? CAPTION_KEEP : TWIN_KEEP, old ? wrote?.get(x.role) : undefined), ...(how.retyped?.has(x.role) ? { text: c.text, runs: c.runs } : {}), ...(o.size !== undefined ? { size: Math.round(o.size * ratio * 10) / 10 } : {}) } : order === undefined ? c : { ...c, order });
    } else {
      const a0 = x.arrow!, o = old && "from" in old ? old : undefined;
      const a: Arrow = { ...a0, id, from: by(a0.from), to: by(a0.to), ...(a0.curve ? { curve: { ...a0.curve, points: a0.curve.points.map((q) => ({ at: by(q.at), ...(q.c1 ? { c1: by(q.c1) } : {}), ...(q.c2 ? { c2: by(q.c2) } : {}) })) } } : {}) };
      arrows.push(o ? { ...keep(a, o, ARROW_KEEP, wrote?.get(x.role)), ...(o.scale !== undefined ? { scale: o.scale * ratio } : {}) } : order === undefined ? a : { ...a, order });
    }
  }
  // The new parts go where the old ones were in the drawing order.
  // A file read as CDXML lists every filled curve before the lines, so a chart's zones can be far from its lines in
  // the list: the new filled curves go where the old ones were, and the other parts where the old other parts were.
  const swap = <T extends { id: number; role?: PlotPart; fill?: unknown }>(list: T[] | undefined, fresh: T[]): T[] => {
    const all = list ?? [], mine = (x: T) => ids.has(x.id) && !!x.role, rest = all.filter((x) => !mine(x));
    const place = (filled: boolean) => { const first = all.findIndex((x) => mine(x) && !!x.fill === filled); return first < 0 ? -1 : all.slice(0, first).filter((x) => !mine(x)).length; };
    const fills = fresh.filter((x) => x.fill), others = fresh.filter((x) => !x.fill), a = place(true), b = place(false);
    if (a < 0 || b < 0 || a === b || !fills.length) { const at = Math.max(a, b) < 0 ? rest.length : a < 0 ? b : b < 0 ? a : Math.min(a, b); return [...rest.slice(0, at), ...fresh, ...rest.slice(at)]; }
    const [lo, hi, low, high] = a < b ? [a, b, fills, others] : [b, a, others, fills];
    return [...rest.slice(0, lo), ...low, ...rest.slice(lo, hi), ...high, ...rest.slice(hi)];
  };
  const removed = new Set(parts.map((x) => x.id)), newIds = [...captions.map((c) => c.id), ...arrows.map((a) => a.id)];
  const plot = { ...p, roles: made.map((x) => x.role) } as Plot, rejoined = rejoin(leadersOf(m, g), captions, arrows, shift);
  // The spectrum's group, and any group it is in (which lists everything in it too), lose the parts gone and gain the
  // new ones.
  const holds = (x: Group) => x.id === gid || g.items.every((id) => x.items.includes(id));
  return { ...m, captions: swap(m.captions, captions), arrows: swap(m.arrows, rejoined),
    groups: m.groups!.map((x) => (holds(x) ? { ...x, items: [...x.items.filter((id) => !removed.has(id)), ...newIds], ...(x.id === gid ? { plot } : {}) } : x)) };
}
// Text typed over a chart's caption on the page becomes the chart's data (charts.ts retyped): a number typed over a
// level's value moves the level, and a name typed over a state's, a path's or a condition's name is its name in Edit
// data too. Text that is no number over a value stays a label and changes no data. A chart whose record this edit
// changed itself (Edit data, a resize) is left as it is. was: the drawing before the edit.
export function followCharts(was: Mol, now: Mol, env: PlotEnv): Mol {
  if (was === now || was.captions === now.captions || !now.groups?.some((g) => g.plot && isChart(g.plot))) return now;
  const before = new Map((was.captions ?? []).map((c) => [c.id, c]));
  let out = now;
  for (const g of now.groups) {
    const chart = g.plot && isChart(g.plot) ? g.plot : undefined;
    if (!chart || was.groups?.find((x) => x.id === g.id)?.plot !== chart) continue;
    const ids = new Set(g.items), redraw = new Set<string>();
    let record: Chart = chart;
    for (const c of now.captions ?? []) {
      const o = c.role && ids.has(c.id) ? before.get(c.id) : undefined;
      if (!o?.role || o.role.role !== c.role!.role || o.text === c.text) continue;
      const change = retyped(record, c.role!.role, c.text, !!c.runs?.length);
      if (!change) continue;
      record = change.chart;
      if (change.redraw) redraw.add(c.role!.role);
    }
    if (record === chart) continue;
    const { kind: _, title: __, frame: ___, origin: ____, scale: _____, text: ______, roles: _______, ...data } = record;
    const drawn = redraw.size ? replot(out, g.id, data as Partial<Plot>, env, { retyped: redraw }) : out;
    // A chart that cannot be drawn again (it was turned or flipped) keeps its record: its numbers are its captions'.
    if (redraw.size && drawn === out) continue;
    out = redraw.size ? drawn : { ...out, groups: out.groups!.map((x) => (x.id === g.id ? { ...x, plot: record } : x)) };
  }
  return out;
}
// --- Jablonski diagrams: transitions that stay on their levels (issue 43) -------------------------------------------
type Absolute = { name: string; x0: number; x1: number; y: number; vib: number };
type Line = { from: P; to: P };
const minus = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
// The ids of the parts an edit changed: a new object in a part's place, or a part gone. Lists of the same length are
// compared place by place, so an edit that moves one part builds no map.
function changedIds(was: Mol, now: Mol): Set<number> {
  const out = new Set<number>();
  const diff = (a: { id: number }[] = [], b: { id: number }[] = []) => {
    if (a === b) return;
    if (a.length === b.length) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.add(a[i].id).add(b[i].id); return; }
    const by = new Map(a.map((x) => [x.id, x])), here = new Set<number>();
    for (const x of b) { here.add(x.id); if (by.get(x.id) !== x) out.add(x.id); }
    for (const x of a) if (!here.has(x.id)) out.add(x.id);
  };
  diff(was.arrows, now.arrows);
  diff(was.captions, now.captions);
  return out;
}
// A part of a Jablonski diagram moved on the page becomes the diagram's data (D2, D3), so its transitions stay on
// their levels (R2). For each diagram one of whose parts this edit changed, and that is not turned or flipped: a level,
// or a vibrational level, that is not where Octet put it is read back as its state's level (moved, stretched by one
// end, or laid flat again about its middle after a turn, as long as it was; at least 1 em long), and a transition this
// edit moved as where it now runs (moved whole, it slides across; an end moved alone joins the level it is dropped on,
// or keeps its state; reversed, it swaps its states and its head). A transition's end on a level that moved goes with
// it, and one straight up or down stays so while its other level is still under it. Vibrational relaxation dropped on
// another state becomes the kind its two states give. A level or a transition this edit deleted takes its state or
// transition out, with every transition to or from it; the last state takes the record. The frame is then the levels'
// box (no side over 1000 bond lengths), and the diagram is drawn again: each part read back where Octet now puts it,
// and a name or a label that moved with its level or transition goes with it (the rest keep their offsets). A record
// that a file could not hold is never made: the edit then stays as it is. was: the drawing before the edit (in a drag,
// before the drag).
export function followLevels(was: Mol, now: Mol, env: PlotEnv): Mol {
  if (was === now || !now.groups?.some((g) => g.plot?.kind === "jablonski")) return now;
  let out = now, changed: Set<number> | undefined;
  for (const g of now.groups) {
    if (g.plot?.kind !== "jablonski") continue;
    const og = was.groups?.find((x) => x.id === g.id);
    if (!og) continue;
    changed ??= changedIds(was, now);
    if (og.items === g.items && og.plot === g.plot && !g.items.some((id) => changed!.has(id))) continue;
    out = settleLevels(was, out, og, env, changed);
  }
  return out;
}
function settleLevels(was: Mol, m: Mol, og: Group, env: PlotEnv, changed: Set<number>): Mol {
  const g = m.groups!.find((x) => x.id === og.id)!, p = g.plot as JablonskiChart;
  // The group's move: where the parts this edit left alone are (the move before it), or, when it changed every part,
  // where most of them are now (the whole diagram moved).
  const shift = g.items.every((id) => changed.has(id)) ? plotShift(m, g) : plotShift(was, og);
  if (!shift) return m;
  const em = (env.captionSize * p.text) / env.bond, gap = vibGap(em), [W, H] = p.frame, tol = 2e-3, close = (a: P, b: P) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
  const ids = new Set(g.items), arrows = new Map<string, Arrow>(), olds = new Set(og.items);
  for (const a of m.arrows ?? []) if (ids.has(a.id) && a.role) arrows.set(a.role.role, a);
  // Deleted by this edit: a level or a transition that was in the diagram and is not.
  const here = new Set([...(m.arrows ?? []), ...(m.captions ?? [])].filter((x) => ids.has(x.id)).map((x) => x.id)), goneStates = new Set<number>(), goneTrans = new Set<number>();
  for (const a of was.arrows ?? []) {
    if (!olds.has(a.id) || here.has(a.id) || !a.role) continue;
    const r = /^(level|trans):(\d+)$/.exec(a.role.role);
    if (r) (r[1] === "level" ? goneStates : goneTrans).add(+r[2]);
  }
  // Where Octet put each line (in the figure, from the record's origin), and where it is now.
  const before = new Map([...(was.arrows ?? []), ...(was.captions ?? [])].filter((x) => olds.has(x.id)).map((x) => [x.id, x]));
  const fig = new Map(plotFigure(p, env).lines.map((l) => [l.role!, l as Line])), at = (q: P): P => [q[0] - p.origin[0] - shift[0], q[1] - p.origin[1] - shift[1]];
  const own = (a: Arrow): Line => ({ from: at(a.from), to: at(a.to) }), settle = new Set<number>(), reversed = new Set<number>();
  // Which ends of a line are not where Octet put them: its start by its role's place, and a level's end by the
  // figure's length (neither changes with the text size). A transition's end counts only when this edit moved it, as
  // where it meets a vibrational level changes with the text size.
  const movedEnds = (a: Arrow, e: Line, level: boolean): [boolean, boolean] => {
    const mf = !close(minus(a.from, a.role!.at), shift);
    if (level) return [mf, !close(minus(minus(a.to, a.role!.at), shift), minus(e.to, e.from))];
    const b = before.get(a.id);
    return [mf, !close(own(a).to, e.to) && (!b || !("from" in b) || !close(a.to, b.to))];
  };
  const states: Absolute[] = p.states.map((s) => ({ name: s.name, x0: s.x[0] * W, x1: s.x[1] * W, y: s.y * H, vib: s.vib })), was0 = states.slice();
  const moved: number[] = [];
  states.forEach((s, k) => {
    if (goneStates.has(k)) return;
    const lines = [[`level:${k}`, 0], ...Array.from({ length: s.vib }, (_, i) => [`vib:${k}:${i + 1}`, (i + 1) * gap])] as [string, number][];
    let read = false;
    for (const [role, dy] of lines) {
      const a = arrows.get(role), e = fig.get(role);
      if (!a || !e) continue;
      const [mf, mt] = movedEnds(a, e, true);
      if (!mf && !mt) continue;
      settle.add(a.id);
      if (read) continue;
      read = true;
      // Both ends moved: moved whole, or turned (flat again about its middle, as long as it is). One end: the other
      // keeps the height.
      const l = own(a), f: P = [l.from[0], l.from[1] - dy], t: P = [l.to[0], l.to[1] - dy], L = Math.hypot(t[0] - f[0], t[1] - f[1]), c = (f[0] + t[0]) / 2;
      const y = mf && mt ? (f[1] + t[1]) / 2 : mf ? t[1] : f[1];
      let [x0, x1] = mf && mt ? [c - L / 2, c + L / 2] : [Math.min(f[0], t[0]), Math.max(f[0], t[0])];
      if (x1 - x0 < em) {
        if (mf !== mt) { const fixed = mf ? t[0] : f[0], end = mf ? f[0] : t[0]; [x0, x1] = end >= fixed ? [fixed, fixed + em] : [fixed - em, fixed]; }
        else [x0, x1] = [c - em / 2, c + em / 2];
      }
      states[k] = { ...s, x0, x1, y };
      moved.push(k);
    }
  });
  // No side of the frame over 1000 bond lengths: a level moved past that stops there (with every level moved, the
  // frame grows from its left and its foot).
  if (moved.length) {
    const L = 999, kept = states.map((_, k) => k).filter((k) => !goneStates.has(k)), still = kept.filter((k) => !moved.includes(k)), ref = (still.length ? still : kept).map((k) => states[k]);
    const left = Math.min(...ref.map((s) => s.x0)), right = Math.max(...ref.map((s) => s.x1)), foot = Math.min(...ref.map((s) => s.y)), top = Math.max(...ref.map((s) => s.y));
    const [lo, hi, down, up] = still.length ? [right - L, left + L, top - L, foot + L] : [left, left + L, foot, foot + L];
    for (const k of moved) {
      const s = states[k], w = Math.min(s.x1 - s.x0, L), x0 = Math.min(Math.max(s.x0, lo), hi - w);
      states[k] = { ...s, x0, x1: x0 + w, y: Math.min(Math.max(s.y, down), up) };
    }
  }
  // The level (or vibrational level) under a point, nearest first: within 0.6 em up or down and inside its ends.
  const lineAt = (q: P): { k: number; i: number } | undefined => {
    let best: { k: number; i: number; d: number } | undefined;
    states.forEach((s, k) => {
      if (goneStates.has(k) || q[0] < s.x0 - 0.2 * em || q[0] > s.x1 + 0.2 * em) return;
      for (let i = 0; i <= s.vib; i++) { const d = Math.abs(q[1] - (s.y + i * gap)); if (d <= 0.6 * em && (!best || d < best.d)) best = { k, i, d }; }
    });
    return best && { k: best.k, i: best.i };
  };
  const inside = (k: number, x: number) => Math.min(states[k].x1, Math.max(states[k].x0, x));
  // How far a level moved across, kept as long as it was (a stretched level keeps its transitions where they are).
  const across = (k: number) => (Math.abs(states[k].x1 - states[k].x0 - (was0[k].x1 - was0[k].x0)) < 1e-6 ? states[k].x0 - was0[k].x0 : 0);
  const transitions: (Omit<JTransition, "x"> & { x: P })[] = p.transitions.map((t, i) => {
    const out = { ...t, x: [t.x[0] * W, t.x[1] * W] as P, vib: [...t.vib] as P }, da = across(t.from), db = across(t.to);
    if (da || db) {
      const upright = Math.abs(out.x[0] - out.x[1]) < 1e-6;
      out.x = [out.x[0] + da, out.x[1] + db];
      if (upright && !da !== !db) { const x = da ? out.x[0] : out.x[1], other = states[da ? t.to : t.from]; if (x >= other.x0 && x <= other.x1) out.x = [x, x]; }
    }
    const a = arrows.get(`trans:${i}`), e = fig.get(`trans:${i}`), drawn = endsOf(p, i, em);
    if (!a || !e || !drawn || goneTrans.has(i)) return out;
    const [mf, mt] = movedEnds(a, e, false);
    if (!mf && !mt) return out;
    settle.add(a.id);
    const l = own(a);
    if (close(l.from, e.to) && close(l.to, e.from)) { reversed.add(a.id); return { ...out, from: t.to, to: t.from, x: [out.x[1], out.x[0]], vib: [t.vib[1], t.vib[0]] }; }
    const d = minus(l.from, e.from);
    if (mf && mt && close(d, minus(l.to, e.to))) return { ...out, x: [drawn[0][0] + d[0], drawn[1][0] + d[0]] };
    const ends = [[mf, l.from, 0], [mt, l.to, 1]] as const;
    for (const [m, q, j] of ends) {
      if (!m) continue;
      const hit = lineAt(q), other = j ? out.from : out.to;
      if (hit && (hit.k !== other || t.kind === "vr")) { if (j) out.to = hit.k; else out.from = hit.k; out.vib[j] = hit.i; }
      out.x[j] = q[0];
    }
    if (out.kind === "vr" && out.from !== out.to) { const kind = kindOf(states, out.from, out.to); return { ...out, kind, label: t.label === KIND_LABELS.vr ? KIND_LABELS[kind] : t.label }; }
    return out;
  });
  if (!settle.size && !goneStates.size && !goneTrans.size) return m;
  // What is left of the diagram: its states and the transitions between them, renumbered.
  const keptStates = states.map((_, k) => k).filter((k) => !goneStates.has(k));
  if (!keptStates.length) return { ...m, groups: m.groups!.map((x) => { if (x.id !== g.id) return x; const { plot: _, ...plain } = x; return plain; }) };
  const keptTrans = transitions.map((_, i) => i).filter((i) => !goneTrans.has(i) && !goneStates.has(transitions[i].from) && !goneStates.has(transitions[i].to));
  const next = framed(p, keptStates.map((k) => states[k]), keptTrans.map((i) => { const t = transitions[i]; return { ...t, from: keptStates.indexOf(t.from), to: keptStates.indexOf(t.to), x: [inside(t.from, t.x[0]), inside(t.to, t.x[1])] as P }; }));
  if (!readChart(next)) return m;
  const rename = (r: string): string | undefined => {
    const k = /^(level|state|vib):(\d+)(.*)$/.exec(r), t = /^(trans|label):(\d+)(.*)$/.exec(r);
    if (k) { const j = keptStates.indexOf(+k[2]); return j < 0 ? undefined : `${k[1]}:${j}${k[3]}`; }
    if (t) { const j = keptTrans.indexOf(+t[2]); return j < 0 ? undefined : `${t[1]}:${j}${t[3]}`; }
    return r;
  };
  // Each part read back is where Octet puts it now (its offset the group's move); a transition reversed takes its
  // heads back the other way, so its head stays at the state it now goes to. A name or a label this edit moved with
  // its level or its transition goes with it: its offset loses that move.
  const moveOf = (x: Arrow | Caption | undefined): P | undefined => { const o = x && before.get(x.id); return !o || !x || "from" in x !== "from" in o ? undefined : "from" in x ? minus(x.from, (o as Arrow).from) : [x.x - (o as Caption).x, x.y - (o as Caption).y]; };
  const anchors = new Map((m.arrows ?? []).filter((a) => ids.has(a.id) && a.role).map((a) => [a.role!.role, a]));
  const back = ({ start, end, ...a }: Arrow): Arrow => ({ ...a, ...(end ? { start: end } : {}), ...(start ? { end: start } : {}) });
  const settled: Mol = { ...m,
    arrows: m.arrows!.map((a) => (settle.has(a.id) ? { ...(reversed.has(a.id) ? back(a) : a), role: { ...a.role!, at: minus(a.from, shift) } } : a)),
    captions: m.captions?.map((c) => {
      const r = c.role && ids.has(c.id) ? /^(state|label):(\d+)$/.exec(c.role.role) : null, anchor = r ? anchors.get(`${r[1] === "state" ? "level" : "trans"}:${r[2]}`) : undefined;
      const dc = r ? moveOf(c) : undefined, da = moveOf(anchor);
      if (!dc || !da || Math.hypot(...dc) < tol || !close(dc, da)) return c;
      return { ...c, role: { ...c.role!, at: [c.role!.at[0] + dc[0], c.role!.at[1] + dc[1]] } };
    }) };
  const { kind: _k, title: _t, scale: _s, text: _x, roles: _r, ...data } = next;
  return replot(settled, g.id, data, env, { rename });
}
// What of a Jablonski diagram is picked: the states (a level, a vibrational level or a name) and the transitions (an
// arrow or its label). A part whose role names a state or a transition the record does not have (a file can say
// anything) is none of them.
export function jablonskiPick(m: Mol, g: Group, picked: Iterable<number>): { states: number[]; transitions: number[] } {
  const ids = new Set(picked), states = new Set<number>(), transitions = new Set<number>(), p = g.plot as JablonskiChart | undefined;
  for (const x of [...(m.arrows ?? []), ...(m.captions ?? [])]) {
    if (!ids.has(x.id) || !x.role || !g.items.includes(x.id)) continue;
    const r = /^(level|vib|state|trans|label):(\d+)/.exec(x.role.role), k = r ? +r[2] : -1, trans = r?.[1] === "trans" || r?.[1] === "label";
    if (r && k < (trans ? p?.transitions.length ?? 0 : p?.states.length ?? 0)) (trans ? transitions : states).add(k);
  }
  return { states: [...states].sort((a, b) => a - b), transitions: [...transitions].sort((a, b) => a - b) };
}
// A chart's own action, as the Actions panel runs it (chart.*): the new drawing, or what stops it. Each draws the chart
// again and keeps what the user changed on the page. An energy diagram's joins, axis, key and a path's colour; a
// sensitivity screen's zones and scale (one that would not hold every value is not taken); a Jablonski diagram's axis,
// a singlet or a triplet added, the vibrational levels of the picked levels, the kind of the picked transitions, and a
// transition added from the picked level (chart.link.<state>, or chart.link.self for vibrational relaxation). Show
// also brings back a part deleted on the page. Undefined: not a chart action.
export function chartAction(m: Mol, gid: number, command: string, picked: Iterable<number>, env: PlotEnv): { mol: Mol } | { notice: string } | undefined {
  const g = m.groups?.find((x) => x.id === gid), c = g?.plot, [, what, a, b] = command.split(".");
  if (!g || !c || !isChart(c) || !command.startsWith("chart.")) return undefined;
  const redraw = (change: Partial<Chart>, revive?: RegExp, how: Replot = {}) => ({ mol: replot(m, gid, change, env, { ...how, ...(revive ? { revive: (r: string) => revive.test(r) } : {}) }) });
  if (c.kind === "energy") {
    if (what === "join" && (a === "line" || a === "dashed" || a === "curve")) return redraw({ join: a });
    if (what === "axis") return redraw({ axis: !c.axis }, c.axis ? undefined : /^(axis|tick:|axis-title)/);
    if (what === "key") return redraw({ key: !c.key }, c.key ? undefined : /^key/);
    if (what === "colour" && c.paths[+a] && /^#[0-9a-f]{6}$/i.test(b)) return redraw({ paths: c.paths.map((x, i) => (i === +a ? { ...x, colour: b } : x)) });
    return undefined;
  }
  if (c.kind === "radar") {
    if (what === "zones") return redraw({ zones: !c.zones }, c.zones ? undefined : /^zone:/);
    if (what === "scale" && (a === "min" || a === "max" || a === "step")) {
      const next = { ...c, [a]: Number(command.split(".").slice(3).join(".")) };
      return soundScale(next) ? redraw({ min: next.min, max: next.max, step: next.step }) : { notice: "The scale must hold every value." };
    }
    return undefined;
  }
  if (what === "axis") return redraw({ axis: !c.axis }, c.axis ? undefined : /^(axis|axis-title)$/);
  const em = (env.captionSize * c.text) / env.bond, [W, H] = c.frame, gap = vibGap(em), pick = jablonskiPick(m, g, picked);
  const abs = c.states.map((s) => ({ name: s.name, x0: s.x[0] * W, x1: s.x[1] * W, y: s.y * H, vib: s.vib })), across = c.transitions.map((t) => ({ ...t, x: [t.x[0] * W, t.x[1] * W] as P }));
  const data = (x: JablonskiChart) => { const { kind: _k, title: _t, scale: _s, text: _x, roles: _r, ...d } = x; return d; };
  if (what === "add" && (a === "singlet" || a === "triplet")) {
    if (c.states.length >= MAX_LEVELS) return { notice: `A Jablonski diagram takes at most ${MAX_LEVELS} levels.` };
    // Named with the next number of its letter, one step over the top state of its column (D8), as long as it.
    const L = a === "singlet" ? "S" : "T", mine = c.states.map((_, k) => k).filter((k) => /^[A-Z]/.test(c.states[k].name) && c.states[k].name[0] === L);
    const n = Math.max(-1, ...mine.map((k) => Number(/^[A-Z](\d+)$/.exec(c.states[k].name)?.[1] ?? 0))) + 1, ground = c.states.reduce((lo, s, k) => (s.y < c.states[lo].y ? k : lo), 0);
    const column = mine.filter((k) => k !== ground), top = column.length ? column.reduce((hi, k) => (c.states[k].y > c.states[hi].y ? k : hi)) : undefined;
    const ref = top !== undefined ? abs[top] : abs[ground], [x0, x1] = top !== undefined ? [ref.x0, ref.x1] : L === "S" ? [ref.x0, ref.x0 + 0.45 * (ref.x1 - ref.x0)] : [ref.x0 + 0.6 * (ref.x1 - ref.x0), ref.x1];
    const added = framed(c, [...abs, { name: `${L}${Math.max(n, 1)}`, x0, x1, y: ref.y + Math.max(ref.vib, 3) * gap + 1.2 * em, vib: 3 }], across);
    return redraw(data(added));
  }
  if (what === "vib") {
    const n = Number(a);
    if (!Number.isInteger(n) || n < 0 || n > MAX_VIB || command.split(".").length !== 3) return { notice: `Vibrational levels are 0 to ${MAX_VIB}.` };
    if (!pick.states.length) return { notice: "Select a level first." };
    return redraw({ states: c.states.map((s, k) => (pick.states.includes(k) ? { ...s, vib: n } : s)) });
  }
  if (what === "kind") {
    const k = a as JablonskiKind;
    if (!JABLONSKI_KINDS.includes(k) || command.split(".").length !== 3) return undefined;
    if (!pick.transitions.length) return { notice: "Select a transition first." };
    if (pick.transitions.some((i) => (c.transitions[i].from === c.transitions[i].to) !== (k === "vr"))) return { notice: "Vibrational relaxation is within one level, and every other kind between two." };
    return redraw({ transitions: c.transitions.map((t, i) => (pick.transitions.includes(i) ? { ...t, kind: k, label: t.label === KIND_LABELS[t.kind] ? KIND_LABELS[k] : t.label } : t)) });
  }
  if (what === "link") {
    const from = pick.states.length === 1 && !pick.transitions.length ? pick.states[0] : -1, to = a === "self" ? from : Number(a);
    if (from < 0) return { notice: "Select one level first." };
    if (!Number.isInteger(to) || !c.states[to] || command.split(".").length !== 3) return { notice: "There is no such level." };
    if (c.transitions.length >= MAX_TRANSITIONS) return { notice: `A Jablonski diagram takes at most ${MAX_TRANSITIONS} transitions.` };
    if (from === to && !c.states[from].vib) return { notice: "Vibrational relaxation needs vibrational levels." };
    const kind = kindOf(c.states, from, to), t: JTransition = { from, to, kind, label: KIND_LABELS[kind], x: roomFor(c, from, to), vib: vibOf(kind, c.states[from], c.states[to]) };
    return redraw({ transitions: [...c.transitions, t] });
  }
  return undefined;
}
// A page spectrum whose frame on the page (box, bond lengths: left, bottom, right, top) is dragged from `from` to
// `to` by a resize handle: the plot grows by what the frame grows, and the side not dragged stays where it is.
export function reframe(m: Mol, gid: number, from: [number, number, number, number], to: [number, number, number, number], env: PlotEnv): Mol {
  const p = m.groups?.find((x) => x.id === gid)?.plot;
  if (!p) return m;
  const dw = to[2] - to[0] - (from[2] - from[0]), dh = to[3] - to[1] - (from[3] - from[1]);
  const moved = (a: number, b: number) => Math.abs(a - b) > 1e-9, share = (lo: boolean, hi: boolean) => (lo ? (hi ? 0.5 : 1) : 0);
  const sx = share(moved(to[0], from[0]), moved(to[2], from[2])), sy = share(moved(to[1], from[1]), moved(to[3], from[3]));
  // A sensitivity screen stays round: its frame grows by the larger change, about its middle on a side not dragged.
  if (p.kind === "radar") {
    const was = Math.min(...p.frame), S = Math.max(MIN_W, was + (Math.abs(dw) >= Math.abs(dh) ? dw : dh)), across = moved(to[0], from[0]) || moved(to[2], from[2]), up = moved(to[1], from[1]) || moved(to[3], from[3]);
    return S === was ? m : replot(m, gid, { frame: [S, S], origin: [p.origin[0] - (across ? sx : 0.5) * (S - was), p.origin[1] - (up ? sy : 0.5) * (S - was)] }, env);
  }
  const W = Math.max(MIN_W, p.frame[0] + dw), H = Math.max(MIN_H, p.frame[1] + dh);
  return replot(m, gid, { frame: [W, H], origin: [p.origin[0] - sx * (W - p.frame[0]), p.origin[1] - sy * (H - p.frame[1])] }, env);
}
// A page spectrum scaled by size (across, up) as f moves points (Scale…, and the handles on a wider selection): its
// frame grows by size, its axis start goes where f puts it, and its text and lines grow by `text`.
export function rescale(m: Mol, gid: number, f: (q: P) => P, size: P, text: number, env: PlotEnv): Mol {
  const g = m.groups?.find((x) => x.id === gid), p = g?.plot, shift = g && plotShift(m, g);
  if (!p || !shift) return m;
  const q = f([p.origin[0] + shift[0], p.origin[1] + shift[1]]);
  const side = Math.max(MIN_W, Math.min(p.frame[0] * Math.abs(size[0]), p.frame[1] * Math.abs(size[1])));
  return replot(m, gid, { frame: p.kind === "radar" ? [side, side] : [Math.max(MIN_W, p.frame[0] * Math.abs(size[0])), Math.max(MIN_H, p.frame[1] * Math.abs(size[1]))], origin: [q[0] - shift[0], q[1] - shift[1]], text: p.text * text }, env);
}

// --- Reading ------------------------------------------------------------------------------------------------------
// A record or a role from a file, if it is sound: anything else is left out, and the group or part stays plain.
// (The checks are charts.ts's: each text here is given its own limit.)
const KINDS: Kind[] = ["nmr", "ir", "uv", "ms", "other"];
export function readPart(v: unknown): PlotPart | undefined {
  const o = v as Record<string, unknown> | undefined;
  return o && str(o.role, 120) && (o.role as string).length > 0 && pair(o.at) ? { role: o.role as string, at: [o.at[0], o.at[1]] } : undefined;
}
export function readPlot(v: unknown): Plot | undefined {
  const o = v as Record<string, unknown> | undefined;
  if (o && (o.kind === "energy" || o.kind === "radar" || o.kind === "jablonski")) return readChart(o);
  if (!o || (o.kind !== "predicted" && o.kind !== "measured") || !str(o.nucleus, 20) || !num(o.mhz, 0, 1e4) || !str(o.solvent, 40) || typeof o.solventPeaks !== "boolean"
    || !pair(o.range) || o.range[0] >= o.range[1] || !pair(o.frame, 0.01, 1000) || !pair(o.origin) || !num(o.scale, 0.01, 100) || !num(o.text, 0.01, 100)
    || !["auto", "horizontal", "vertical"].includes(o.labels as string) || !str(o.title, 400) || typeof o.notice !== "boolean"
    || !Array.isArray(o.roles) || o.roles.length > 20000 || !o.roles.every((r) => str(r, 120))) return undefined;
  const out: SpectrumPlot = { kind: o.kind, nucleus: o.nucleus as string, mhz: o.mhz as number, solvent: o.solvent as string, solventPeaks: o.solventPeaks, range: o.range, frame: o.frame, origin: o.origin,
    scale: o.scale as number, text: o.text as number, labels: o.labels as LabelTurn, title: o.title as string, notice: o.notice, roles: o.roles as string[] };
  if (o.signals !== undefined) {
    const ss = o.signals as Record<string, unknown>[];
    if (!Array.isArray(ss) || ss.length > 2000 || !ss.every((s) => s && str(s.key, 40) && num(s.shift) && num(s.nuclei, 0, 1000) && colour(s.colour) && (s.broad === undefined || s.broad === true)
      && Array.isArray(s.couplings) && s.couplings.length <= 16 && (s.couplings as Record<string, unknown>[]).every((c) => c && num(c.j, 0, 2000) && Number.isInteger(c.n) && num(c.n, 0, 64)))) return undefined;
    // A trace (¹H, ¹⁹F) is sampled every 0.3 Hz, and each coupling multiplies its signal's lines, so a record that would make
    // more than a million points or MAX_LINES lines is left out.
    const many = ss.reduce((n, s) => n + (s.couplings as { n: number }[]).reduce((k, c) => Math.min(k * (c.n + 1), MAX_LINES + 1), 1), 0);
    if (!isNucleus(o.nucleus) || !num(o.mhz, 20, 1500) || many > MAX_LINES || (NUCLEI[o.nucleus].trace && (o.range[1] - o.range[0]) * frequency(o.nucleus, o.mhz as number) > 3e5)) return undefined;
    out.signals = ss.map((s) => ({ key: s.key as string, shift: s.shift as number, nuclei: s.nuclei as number, couplings: (s.couplings as { j: number; n: number }[]).map((c) => ({ j: c.j, n: c.n })), ...(s.broad ? { broad: true as const } : {}), ...(s.colour ? { colour: s.colour as string } : {}) }));
  }
  if (o.trace !== undefined) {
    const t = o.trace as Record<string, unknown>, ps = t?.peaks as Record<string, unknown>[];
    if (!t || !KINDS.includes(t.kind as Kind) || (t.nucleus !== undefined && !str(t.nucleus, 20)) || !str(t.xUnit, 20) || !str(t.yUnit, 20) || (t.sticks !== undefined && t.sticks !== true) || !num(t.base, -1e30, 1e30)
      || !Array.isArray(t.x) || !Array.isArray(t.y) || t.x.length !== t.y.length || t.x.length > MAX_TRACE || !t.x.every((x) => num(x, -1e9, 1e9)) || !t.y.every((y) => num(y, -1e30, 1e30))
      || !Array.isArray(ps) || ps.length > 2000 || !ps.every((g) => g && Number.isInteger(g.id) && num(g.lo, -1e9, 1e9) && num(g.hi, -1e9, 1e9) && num(g.shift, -1e9, 1e9) && str(g.name, 40) && num(g.n, 0, 1e4) && (g.other === undefined || str(g.other, 40)) && colour(g.colour))) return undefined;
    out.trace = { kind: t.kind as Kind, ...(t.nucleus !== undefined ? { nucleus: t.nucleus as string } : {}), xUnit: t.xUnit as string, yUnit: t.yUnit as string, ...(t.sticks ? { sticks: true as const } : {}), base: t.base as number, x: t.x as number[], y: t.y as number[],
      peaks: ps.map((g) => ({ id: g.id as number, lo: g.lo as number, hi: g.hi as number, shift: g.shift as number, name: g.name as string, n: g.n as number, ...(g.other !== undefined ? { other: g.other as string } : {}), ...(g.colour ? { colour: g.colour as string } : {}) })) };
  }
  return (out.kind === "predicted") === !!out.signals && (out.kind === "measured") === !!out.trace ? out : undefined;
}
