// Catalytic cycles. A cycle holds its intermediates (sets of atoms) in order around a circle. Its arc arrows,
// and the side arrows for reagents coming in and products going out, are worked out afresh from where the
// intermediates are, so editing an intermediate keeps every arrow fitted to it.
import type { Arrow, Box, Caption, Mol } from "./render.ts";

// scale: the cycle's size against the document style (decision 0007): its arrows, gaps and side arrows follow it.
export type Cycle = { id: number; centre: [number, number]; radius: number; clockwise: boolean; nodes: number[][]; colour?: string; order?: number; scale?: number };
// A cycle's caption: its centre label, or the reagent coming in or product going out on a step (node k to k + 1).
export type CycleText = { cycle: number; step: number; side: "in" | "out" | "centre" };

type P = [number, number];
const GAP_PT = 6; // clear space between an arc's ends and an intermediate's ink, in pt

// Derived arrows get ids from here down, so they never meet the drawing's own ids.
const DERIVED = -1_000_000;

export type CycleLayout = {
  arrows: (Arrow & { cycle: number; step: number })[];
  anchors: Map<number, { x: number; y: number; anchor: "start" | "middle" | "end" }>; // caption id → anchor (px)
};

// k: px per bond length; pt: px per point. ink: an intermediate's ink box in px (y down).
export function layoutCycles(m: Mol, k: number, pt: number, ink: (atoms: number[]) => Box | undefined): CycleLayout {
  const out: CycleLayout = { arrows: [], anchors: new Map() };
  let next = DERIVED;
  for (const c of m.cycles ?? []) {
    const f = c.scale ?? 1, own = f !== 1 ? { scale: f } : {}, centre: P = [c.centre[0] * k, -c.centre[1] * k], R = c.radius * k, dir = c.clockwise ? 1 : -1;
    const boxes = c.nodes.map(ink);
    const angle = (b: Box | undefined, i: number) => (b ? Math.atan2((b[1] + b[3]) / 2 - centre[1], (b[0] + b[2]) / 2 - centre[0]) : -Math.PI / 2 + (dir * 2 * Math.PI * i) / c.nodes.length);
    const angles = boxes.map(angle);
    const at = (a: number, r = R): P => [centre[0] + r * Math.cos(a), centre[1] + r * Math.sin(a)];
    const gap = GAP_PT * f * pt;
    const inside = (p: P, b: Box | undefined) => !!b && p[0] > b[0] - gap && p[0] < b[2] + gap && p[1] > b[1] - gap && p[1] < b[3] + gap;
    const toDoc = (p: P): [number, number] => [p[0] / k, -p[1] / k];
    for (let s = 0; s < c.nodes.length; s++) {
      const t = (s + 1) % c.nodes.length;
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
      const A = at(a0 + dir * from), B = at(a0 + dir * to), mid = at(a0 + dir * (from + to) / 2);
      out.arrows.push({ id: next--, kind: "curved", from: toDoc(A), to: toDoc(B), bend: bendFor(A, B, mid), cycle: c.id, step: s, ...(c.colour ? { colour: c.colour } : {}), ...(c.order ? { order: c.order } : {}), ...own });
      // Side arrows: a reagent joins the arc before its middle; a product leaves after it.
      for (const cap of m.captions ?? []) {
        const on = cap.cycle;
        if (!on || on.cycle !== c.id || on.step !== s || on.side === "centre") continue;
        const fa = on.side === "in" ? 0.38 : 0.62, g = on.side === "in" ? 0.18 : 0.82;
        const onArc = at(a0 + dir * (from + (to - from) * fa)), away = at(a0 + dir * (from + (to - from) * g), R + 1.1 * f * k);
        const [p, q] = on.side === "in" ? [away, onArc] : [onArc, away];
        const bulge = at(a0 + dir * (from + (to - from) * (fa + g) / 2), R + 0.75 * f * k);
        out.arrows.push({ id: next--, kind: "curved", from: toDoc(p), to: toDoc(q), bend: bendFor(p, q, bulge) * 0.6, cycle: c.id, step: s, ...(c.colour ? { colour: c.colour } : {}), ...(c.order ? { order: c.order } : {}), ...own });
        // The text sits beyond the outer end of the side arrow.
        const outward = Math.atan2(away[1] - centre[1], away[0] - centre[0]), textAt = at(outward, R + 1.1 * f * k + gap);
        const anchor = Math.cos(outward) > 0.35 ? "start" : Math.cos(outward) < -0.35 ? "end" : "middle";
        out.anchors.set(cap.id, { x: textAt[0], y: textAt[1] + (Math.sin(outward) > 0.35 ? 10 : Math.sin(outward) < -0.35 ? -2 : 3.5) * f * pt, anchor });
      }
    }
    for (const cap of m.captions ?? []) if (cap.cycle?.cycle === c.id && cap.cycle.side === "centre") out.anchors.set(cap.id, { x: centre[0], y: centre[1] + 3.5 * f * pt, anchor: "middle" });
  }
  return out;
}

// The bend (see render.ts) of a curve from A to B through M: M's offset to the left of A→B, as a fraction of |AB|.
// Points are in px with y down; bend is measured in drawing coordinates (y up), so the side flips.
function bendFor(A: P, B: P, M: P): number {
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, n: P = [(B[1] - A[1]) / len, -(B[0] - A[0]) / len];
  // arrowPath draws the arc through M, so the cycle's arrows follow its circle.
  return ((M[0] - (A[0] + B[0]) / 2) * n[0] + (M[1] - (A[1] + B[1]) / 2) * n[1]) / len * -1;
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
