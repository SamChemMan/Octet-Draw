// Catalytic cycles. A cycle holds its intermediates (sets of atoms) in order around a circle. Its arc arrows,
// and the side arrows for reagents coming in and products going out, are worked out afresh from where the
// intermediates are, so editing an intermediate keeps every arrow fitted to it.
import type { Arrow, Box, Caption, Mol } from "./render.ts";

// scale: the cycle's size against the document style (decision 0007): its arrows, gaps and side arrows follow it.
// width: its arrows' line width in points; unset uses the document's. The scale multiplies it.
// at: each node's angle about the centre (radians, drawing units, y up), for a cycle drawn with the Cycle tool. A node
// with no atoms is a break the user clicked on the circle; a node whose atoms all go becomes one. A drawn cycle can
// have any number of nodes (none is a whole circle).
export type Cycle = { id: number; centre: [number, number]; radius: number; clockwise: boolean; nodes: number[][]; at?: number[]; colour?: string; order?: number; scale?: number; width?: number };
// A cycle's caption: its centre label, or the reagent coming in or product going out on a step (node k to k + 1).
// at: where along its step a side arrow's outer end is (0 at the step's start, 1 at its end); reach: how far that end
// is from the circle, in bond lengths (less than 0 is inside it). Unset, a reagent's end is 0.18 along and a
// product's 0.82, 1.1 bond lengths outside. Dragging the text sets them.
export type CycleText = { cycle: number; step: number; side: "in" | "out" | "centre"; at?: number; reach?: number };
export const sideAt = (t: CycleText) => t.at ?? (t.side === "in" ? 0.18 : 0.82);
export const sideReach = (t: CycleText) => t.reach ?? 1.1;

type P = [number, number];
const GAP_PT = 6; // clear space between an arc's ends and an intermediate's ink, in pt

// Derived arrows get ids from here down, so they never meet the drawing's own ids.
const DERIVED = -1_000_000;

export type CycleLayout = {
  arrows: (Arrow & { cycle: number; step: number; caption?: number })[]; // caption: a side arrow's text
  // Each step's arc as drawn: px, y down. It runs from angle a0 + dir * from to a0 + dir * to about centre.
  spans: { cycle: number; step: number; centre: P; R: number; a0: number; dir: number; from: number; to: number }[];
  anchors: Map<number, { x: number; y: number; anchor: "start" | "middle" | "end" }>; // caption id → anchor (px)
};

// k: px per bond length; pt: px per point. ink: an intermediate's ink box in px (y down).
export function layoutCycles(m: Mol, k: number, pt: number, ink: (atoms: number[]) => Box | undefined): CycleLayout {
  const out: CycleLayout = { arrows: [], anchors: new Map(), spans: [] };
  let next = DERIVED;
  for (const c of m.cycles ?? []) {
    const f = c.scale ?? 1, own = f !== 1 ? { scale: f } : {}, centre: P = [c.centre[0] * k, -c.centre[1] * k], R = c.radius * k, dir = c.clockwise ? 1 : -1;
    // A break (a node with no ink) is a point on the circle; a cycle with no nodes is one whole circle, broken at the top.
    const point = (a: number): Box => { const q: P = [centre[0] + R * Math.cos(-a), centre[1] + R * Math.sin(-a)]; return [q[0], q[1], q[0], q[1]]; };
    const nodes = c.nodes.length ? c.nodes : [[]], boxes = nodes.map((n, i) => (n.length ? ink(n) : undefined) ?? (c.at?.[i] !== undefined ? point(c.at[i]) : !c.nodes.length ? point(Math.PI / 2) : undefined));
    const angle = (b: Box | undefined, i: number) => (b ? Math.atan2((b[1] + b[3]) / 2 - centre[1], (b[0] + b[2]) / 2 - centre[0]) : -Math.PI / 2 + (dir * 2 * Math.PI * i) / nodes.length);
    const angles = boxes.map(angle);
    const at = (a: number, r = R): P => [centre[0] + r * Math.cos(a), centre[1] + r * Math.sin(a)];
    const gap = GAP_PT * f * pt;
    const inside = (p: P, b: Box | undefined) => !!b && p[0] > b[0] - gap && p[0] < b[2] + gap && p[1] > b[1] - gap && p[1] < b[3] + gap;
    const toDoc = (p: P): [number, number] => [p[0] / k, -p[1] / k];
    for (let s = 0; s < nodes.length; s++) {
      const t = (s + 1) % nodes.length;
      let a0 = angles[s], a1 = angles[t];
      // Travel the way the cycle turns; a two-node cycle goes half way round each time.
      let span = dir * (a1 - a0);
      while (span <= 0) span += 2 * Math.PI;
      // Leave each intermediate's ink, then stop short of the next one's.
      const step = 0.01;
      let from = 0, to = span;
      while (from < span / 2 && inside(at(a0 + dir * from), boxes[s])) from += step;
      while (to > span / 2 && inside(at(a0 + dir * to), boxes[t])) to -= step;
      if (to - from < 0.05) continue;
      out.spans.push({ cycle: c.id, step: s, centre, R, a0, dir, from, to });
      const A = at(a0 + dir * from), B = at(a0 + dir * to), mid = at(a0 + dir * (from + to) / 2);
      out.arrows.push({ id: next--, kind: "curved", from: toDoc(A), to: toDoc(B), bend: bendFor(A, B, mid), cycle: c.id, step: s, ...(c.colour ? { colour: c.colour } : {}), ...(c.order ? { order: c.order } : {}), ...own, ...(c.width ? { width: c.width } : {}) });
      // Side arrows: a reagent joins the arc before its middle; a product leaves after it.
      for (const cap of m.captions ?? []) {
        const on = cap.cycle;
        if (!on || on.cycle !== c.id || on.step !== s || on.side === "centre") continue;
        // The arrow meets the arc 0.2 of the step on from its outer end (back from it, for a product), and no more than
        // 0.6 radians on, so it stays short on a step most of the way round (one with fewer than two nodes).
        const g = sideAt(on), reach = sideReach(on), w = Math.min(0.2, 0.6 / (to - from)), fa = Math.min(0.95, Math.max(0.05, on.side === "in" ? g + w : g - w));
        const onArc = at(a0 + dir * (from + (to - from) * fa)), away = at(a0 + dir * (from + (to - from) * g), R + reach * f * k);
        const [p, q] = on.side === "in" ? [away, onArc] : [onArc, away];
        const bulge = at(a0 + dir * (from + (to - from) * (fa + g) / 2), R + reach * (0.75 / 1.1) * f * k);
        out.arrows.push({ id: next--, kind: "curved", from: toDoc(p), to: toDoc(q), bend: bendFor(p, q, bulge) * 0.6, cycle: c.id, step: s, caption: cap.id, ...(c.colour ? { colour: c.colour } : {}), ...(c.order ? { order: c.order } : {}), ...own, ...(c.width ? { width: c.width } : {}) });
        // The text sits beyond the outer end of the side arrow.
        const outward = Math.atan2(away[1] - centre[1], away[0] - centre[0]), textAt = at(outward, R + reach * f * k + Math.sign(reach || 1) * gap);
        const anchor = Math.cos(outward) > 0.35 ? "start" : Math.cos(outward) < -0.35 ? "end" : "middle";
        out.anchors.set(cap.id, { x: textAt[0], y: textAt[1] + (Math.sin(outward) > 0.35 ? 10 : Math.sin(outward) < -0.35 ? -2 : 3.5) * f * pt, anchor });
      }
    }
    for (const cap of m.captions ?? []) if (cap.cycle?.cycle === c.id && cap.cycle.side === "centre") out.anchors.set(cap.id, { x: centre[0], y: centre[1] + 3.5 * f * pt, anchor: "middle" });
  }
  return out;
}

// The bend (see render.ts) of a curve from A to B through M: M's offset to the left of A→B, as a fraction of |AB|.
// Points are in px with y down, where n is the left of A→B as drawn: the same side as in drawing coordinates.
function bendFor(A: P, B: P, M: P): number {
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, n: P = [(B[1] - A[1]) / len, -(B[0] - A[0]) / len];
  // arrowPath draws the arc through M, so the cycle's arrows follow its circle.
  return ((M[0] - (A[0] + B[0]) / 2) * n[0] + (M[1] - (A[1] + B[1]) / 2) * n[1]) / len;
}

// Where each intermediate should go: evenly round a circle, starting at the top and turning the cycle's way, on a
// radius big enough that no two intermediates come closer than about two bonds. Returns each node's shift (drawing
// units) and the radius (bond lengths).
export function spreadCycle(c: Cycle, k: number, ink: (atoms: number[]) => Box | undefined): { shifts: P[]; radius: number } {
  const n = c.nodes.length, boxes = c.nodes.map(ink);
  const size = Math.max(...boxes.map((b) => (b ? Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 : k)));
  const radius = Math.max(2.5 * k, (2 * size + 2 * k) / (2 * Math.sin(Math.PI / Math.max(n, 2)))) / k;
  const centre: P = [c.centre[0] * k, -c.centre[1] * k];
  const shifts = boxes.map((b, i): P => {
    const a = -Math.PI / 2 + ((c.clockwise ? 1 : -1) * 2 * Math.PI * i) / n;
    const target: P = [centre[0] + radius * k * Math.cos(a), centre[1] + radius * k * Math.sin(a)];
    const now: P = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : target;
    return [(target[0] - now[0]) / k, -(target[1] - now[1]) / k];
  });
  return { shifts, radius };
}

// Orders intermediates by their angle around their middle, clockwise from the top (as they read on screen).
export function orderAround(centre: P, items: { atoms: number[]; middle: P }[]): number[][] {
  const angle = (p: P) => { const a = Math.atan2(-(p[1] - centre[1]), p[0] - centre[0]); return (a + Math.PI / 2 + 4 * Math.PI) % (2 * Math.PI); };
  return [...items].sort((a, b) => angle(a.middle) - angle(b.middle)).map((x) => x.atoms);
}

export const isCycleText = (c: Caption) => !!c.cycle;

// The Cycle tool. A structure's middle (drawing units): the middle of its atoms' box.
const middleOf = (m: Mol, atoms: number[]): P | undefined => {
  const ps = atoms.flatMap((i) => (m.atoms[i] ? [[m.atoms[i].location[0], m.atoms[i].location[1]]] : []));
  if (!ps.length) return undefined;
  const xs = ps.map((q) => q[0]), ys = ps.map((q) => q[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};
export const angleAbout = (c: Cycle, p: P) => Math.atan2(p[1] - c.centre[1], p[0] - c.centre[0]);
// Each node's angle: where its structure is, or its saved angle.
const anglesOf = (m: Mol, c: Cycle) => c.nodes.map((n, i) => { const q = middleOf(m, n); return q ? angleAbout(c, q) : (c.at?.[i] ?? Math.PI / 2); });
// A cycle with every node's angle saved as it is now (before its atoms go).
export const keepAngles = (m: Mol, c: Cycle): Cycle => ({ ...c, at: anglesOf(m, c) });
// How far round from node 0 an angle is, going the way the cycle turns (clockwise on screen is down in angle).
const round = (c: Cycle, from: number, a: number) => { const d = (c.clockwise ? from - a : a - from) % (2 * Math.PI); return d < 0 ? d + 2 * Math.PI : d; };
// The step an angle is on: node k to k + 1. A cycle with no nodes has one step.
export function stepAt(m: Mol, c: Cycle, a: number): number {
  const angles = anglesOf(m, c);
  if (angles.length < 2) return 0;
  const t = round(c, angles[0], a), next = angles.findIndex((x, k) => k > 0 && round(c, angles[0], x) > t);
  return next < 0 ? angles.length - 1 : next - 1;
}
// The break nearest an angle, within tol radians.
export function breakAt(m: Mol, c: Cycle, a: number, tol: number): number | undefined {
  const angles = anglesOf(m, c);
  let best: number | undefined, d = tol;
  c.nodes.forEach((n, k) => { if (n.length) return; const e = Math.abs(((angles[k] - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); if (e <= d) { d = e; best = k; } });
  return best;
}
const withCycle = (m: Mol, c: Cycle, shift: (step: number) => number): Mol => ({
  ...m,
  cycles: m.cycles?.map((x) => (x.id === c.id ? c : x)),
  captions: m.captions?.map((t) => (t.cycle?.cycle === c.id && t.cycle.side !== "centre" && shift(t.cycle.step) !== t.cycle.step ? { ...t, cycle: { ...t.cycle, step: shift(t.cycle.step) } } : t)),
});
// A node (a structure, or a break when atoms is empty) at an angle, in its place going round. The step it lands on
// splits in two: its reagents and products stay on the first half, and the steps after it move on by one.
export function addStop(m: Mol, id: number, a: number, atoms: number[]): Mol {
  const c = m.cycles?.find((x) => x.id === id);
  if (!c) return m;
  const angles = anglesOf(m, c), j = c.nodes.length ? stepAt(m, c, a) + 1 : 0;
  const nodes = [...c.nodes.slice(0, j), atoms, ...c.nodes.slice(j)], at = [...angles.slice(0, j), a, ...angles.slice(j)];
  return withCycle(m, { ...c, nodes, at }, (s) => (c.nodes.length > 1 && s >= j ? s + 1 : s));
}
// Takes node j out; its two steps become one.
export function removeStop(m: Mol, id: number, j: number): Mol {
  const c = m.cycles?.find((x) => x.id === id);
  if (!c) return m;
  const angles = anglesOf(m, c);
  return withCycle(m, { ...c, nodes: c.nodes.filter((_, k) => k !== j), at: angles.filter((_, k) => k !== j) }, (s) => (s >= j && s > 0 ? s - 1 : s));
}
// How close a structure's middle must be to a circle to be on it (bond lengths): a bond length, or more for a big one.
const onCircle = (m: Mol, c: Cycle, atoms: number[]) => {
  const q = middleOf(m, atoms);
  if (!q) return false;
  const xs = atoms.map((i) => m.atoms[i].location[0]), ys = atoms.map((i) => m.atoms[i].location[1]), size = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
  const d = Math.hypot(q[0] - c.centre[0], q[1] - c.centre[1]);
  return d > 0.35 * c.radius && Math.abs(d - c.radius) <= Math.max(1, 0.75 * size);
};
// Structures on a cycle's circle become its intermediates: one that lands on a break takes its place. moved: the atoms
// an edit moved or added (every atom when unset), so only those structures join. A structure that is in no cycle
// joins the first whose circle it is on.
export function joinCycles(m: Mol, frags: number[][], moved?: (i: number) => boolean): Mol {
  if (!m.cycles?.length) return m;
  const taken = new Set(m.cycles.flatMap((c) => c.nodes.flat()));
  for (const f of frags) {
    if (f.some((i) => taken.has(i)) || (moved && !f.some(moved))) continue;
    const c = m.cycles!.find((x) => onCircle(m, x, f));
    if (!c) continue;
    const a = angleAbout(c, middleOf(m, f)!), xs = f.map((i) => m.atoms[i].location[0]), ys = f.map((i) => m.atoms[i].location[1]);
    const spot = breakAt(m, c, a, Math.max(0.6, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2 + 0.5) / c.radius);
    m = spot !== undefined ? withCycle(m, { ...c, nodes: c.nodes.map((n, k) => (k === spot ? f : n)), at: anglesOf(m, c).map((x, k) => (k === spot ? a : x)) }, (s) => s) : addStop(m, c.id, a, f);
    f.forEach((i) => taken.add(i));
  }
  return m;
}

// Where a side arrow's text dragged to p (px, y down) puts its outer end: how far along its step and how far from the
// circle (CycleText at and reach). Undefined when the step is not drawn.
export function sideFor(layout: CycleLayout, t: CycleText, p: P, k: number, f = 1): { at: number; reach: number } | undefined {
  const s = layout.spans.find((x) => x.cycle === t.cycle && x.step === t.step);
  if (!s) return undefined;
  let travel = (s.dir * (Math.atan2(p[1] - s.centre[1], p[0] - s.centre[0]) - s.a0)) % (2 * Math.PI);
  if (travel < 0) travel += 2 * Math.PI;
  // Past the end of the step is its end; before its start (the rest of the way round) is its start.
  const past = travel > s.to + (2 * Math.PI - s.to + s.from) / 2 ? 0 : Math.min(1, Math.max(0, (travel - s.from) / (s.to - s.from)));
  const reach = (Math.hypot(p[0] - s.centre[0], p[1] - s.centre[1]) - s.R) / (f * k);
  // The end stays a little away from the circle, and inside it no nearer the middle than a fifth of the radius.
  return { at: Math.round(past * 100) / 100, reach: Math.round(Math.max(-0.8 * s.R / (f * k), Math.abs(reach) < 0.4 ? Math.sign(reach || 1) * 0.4 : reach) * 100) / 100 };
}
