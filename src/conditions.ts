// Text dragged onto a reaction arrow becomes its conditions (Caption.on). Logic ported from PR #144 by Prof. Dr. Stefan
// Schramm, written for Octet's own layout (render.ts placeCaptions): text goes over or under the middle of an arrow
// within 60° of level, and left (above) or right (below) of a steeper one.
import { scaleOf, straightArrow, type Arrow, type Box } from "./render.ts";

type P = [number, number];
export type Side = "above" | "below";
export type Slot = { arrow: number; side: Side };

// The largest gap a file or the user can set (pt).
export const MAX_GAP = 100;
// A gap read from a file or a command: a number from 0 to MAX_GAP, to 0.01 pt; anything else is none.
export const readGap = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_GAP ? Math.round(v * 100) / 100 : undefined);

// An arrow that takes conditions: straight, with a length, and not bent at a point.
export const takesConditions = (a: Arrow) => straightArrow(a) && !(a.point && a.bend) && (a.to[0] !== a.from[0] || a.to[1] !== a.from[1]);

// An arrow as its conditions are laid out (px, y down; k px per bond length): its middle, whether it is within 60° of
// level, and half its span along that way.
function frameOf(a: Arrow, k: number) {
  const s: P = [a.from[0] * k, -a.from[1] * k], t: P = [a.to[0] * k, -a.to[1] * k], len = Math.hypot(t[0] - s[0], t[1] - s[1]) || 1;
  const flat = Math.abs(t[0] - s[0]) >= 0.5 * len;
  return { mid: [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2] as P, flat, half: Math.abs(flat ? t[0] - s[0] : t[1] - s[1]) / 2 };
}

// How far (px) a box reaches from an arrow on a side: to its far edge.
export function reachOf(a: Arrow, side: Side, box: Box, k: number): number {
  const f = frameOf(a, k);
  return f.flat ? (side === "above" ? f.mid[1] - box[1] : box[3] - f.mid[1]) : side === "above" ? f.mid[0] - box[0] : box[2] - f.mid[0];
}

// The side of an arrow a box is on, and how far (px) its near edge is from the arrow's middle (below 0 when it reaches
// across). Undefined when the box's middle is past the arrow's ends.
export function besideArrow(a: Arrow, box: Box, k: number): { side: Side; gap: number } | undefined {
  if (!takesConditions(a)) return undefined;
  const f = frameOf(a, k), c: P = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
  if (Math.abs(f.flat ? c[0] - f.mid[0] : c[1] - f.mid[1]) > f.half) return undefined;
  if (f.flat) return c[1] < f.mid[1] ? { side: "above", gap: f.mid[1] - box[3] } : { side: "below", gap: box[1] - f.mid[1] };
  return c[0] < f.mid[0] ? { side: "above", gap: f.mid[0] - box[2] } : { side: "below", gap: box[0] - f.mid[0] };
}

// The arrow and side text with this box (px) goes to: the nearest arrow it is beside, no further out than one bond
// length (k) past what that side holds already (reach, px: the far edge of its text, else its gap).
export function slotFor(arrows: Arrow[], box: Box, k: number, reach: (a: Arrow, side: Side) => number): Slot | undefined {
  let best: (Slot & { gap: number }) | undefined;
  for (const a of arrows) {
    const s = besideArrow(a, box, k);
    if (s && s.gap <= reach(a, s.side) + k && (!best || s.gap < best.gap)) best = { arrow: a.id, ...s };
  }
  return best && { arrow: best.arrow, side: best.side };
}

// The reach of an arrow's side for slotFor: its gap (pt, at the arrow's scale; pt px per pt), or the far edge of the
// text on it (boxes), whichever is further.
export const sideReach = (a: Arrow, side: Side, boxes: Box[], k: number, gap: number, pt: number) => Math.max(gap * scaleOf(a) * pt, ...boxes.map((b) => reachOf(a, side, b, k)));
