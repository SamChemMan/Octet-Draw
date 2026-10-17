// Snapping for anything moved: structures, text, arrows and shapes, alone or together. An atom dropped on an atom
// lands on it; otherwise the moving things' box lines up its edges and middle with every other object's (a box
// round a structure counts, so a structure centres in its box and a box centres round its structure).
// Distances are in bond lengths, y up.
import { fragments, pos, type P } from "./edit.ts";
import type { Mol } from "./render";

// A guide line to draw: at x (axis "x", a vertical line) or y, running from `from` to `to` on the other axis.
export type Guide = { axis: "x" | "y"; at: number; from: number; to: number };
type Line = { at: number; lo: number; hi: number }; // a snap line and the extent of what it belongs to

const box = (ps: P[]) => {
  const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

// Moves `d` by up to `tol` so the selection lands on an atom or lines up with another object. boxes: the moving
// things' drawn box and every other object's, from the caller (labels, text and shapes included); without them,
// the boxes of the atoms.
export function snapMove(m: Mol, ids: Set<number>, d: P, tol: number, boxes?: { moving: number[]; targets: number[][] }): { d: P; guides: Guide[]; point?: P } {
  const moving = [...ids].filter((i) => i < m.atoms.length).map((i) => pos(m, i));
  const others = fragments(m).map((g) => g.filter((i) => !ids.has(i))).filter((g) => g.length);
  if (boxes && !others.length) return snapBoxes(boxes.moving, boxes.targets, d, tol);
  if (!moving.length || !others.length) return { d, guides: [] };

  // An atom landing on an atom wins outright.
  let best: { gap: number; shift: P; at: P } | undefined;
  for (const a of moving) for (const g of others) for (const i of g) {
    const s = pos(m, i), shift: P = [s[0] - a[0] - d[0], s[1] - a[1] - d[1]], gap = Math.hypot(...shift);
    if (gap < tol && (!best || gap < best.gap)) best = { gap, shift, at: s };
  }
  if (best) return { d: [d[0] + best.shift[0], d[1] + best.shift[1]], guides: [], point: best.at };
  if (boxes) return snapBoxes(boxes.moving, boxes.targets, d, tol);

  // Otherwise line up outline edges and centres, each axis on its own. (Every atom as well would make
  // almost every position snap.)
  const mb = box(moving).map((v, k) => v + d[k % 2]);
  const axis = (k: 0 | 1) => {
    const lo = mb[k], hi = mb[k + 2], mid = (lo + hi) / 2;
    const refs = [lo, mid, hi];
    const targets: Line[] = others.flatMap((g) => {
      const b = box(g.map((i) => pos(m, i))), o = 1 - k;
      return [b[k], (b[k] + b[k + 2]) / 2, b[k + 2]].map((at) => ({ at, lo: b[o], hi: b[o + 2] }));
    });
    let pick: { diff: number; line: Line } | undefined;
    for (const r of refs) for (const t of targets) {
      const diff = t.at - r;
      if (Math.abs(diff) < tol && (!pick || Math.abs(diff) < Math.abs(pick.diff))) pick = { diff, line: t };
    }
    return pick;
  };
  const sx = axis(0), sy = axis(1);
  const out: P = [d[0] + (sx?.diff ?? 0), d[1] + (sy?.diff ?? 0)];
  const fb = box(moving).map((v, k) => v + out[k % 2]);
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: "x", at: sx.line.at, from: Math.min(fb[1], sx.line.lo) - 0.3, to: Math.max(fb[3], sx.line.hi) + 0.3 });
  if (sy) guides.push({ axis: "y", at: sy.line.at, from: Math.min(fb[0], sy.line.lo) - 0.3, to: Math.max(fb[2], sy.line.hi) + 0.3 });
  return { d: out, guides };
}

// A box moved among others: its edges and middle line up with each other box's edges and middle, and its middle
// with the point halfway between two neighbouring boxes (where a + or a label belongs). Middles count for a little
// more than edges, so things centre when they can. moving and boxes: [left, bottom, right, top]; d: the move so far.
export function snapBoxes(moving: number[], boxes: number[][], d: P, tol: number): { d: P; guides: Guide[] } {
  if (!boxes.length) return { d, guides: [] };
  const mb = moving.map((v, k) => v + d[k % 2]);
  const axis = (k: 0 | 1) => {
    const o = 1 - k, refs = [mb[k], (mb[k] + mb[k + 2]) / 2, mb[k + 2]];
    const targets: Line[] = boxes.flatMap((b) => [b[k], (b[k] + b[k + 2]) / 2, b[k + 2]].map((at) => ({ at, lo: b[o], hi: b[o + 2] })));
    // Halfway between two structures side by side (overlapping across the other axis).
    for (const a of boxes) for (const b of boxes) {
      if (a === b || a[k + 2] >= b[k] || a[o] > b[o + 2] || b[o] > a[o + 2]) continue;
      targets.push({ at: (a[k + 2] + b[k]) / 2, lo: Math.min(a[o], b[o]), hi: Math.max(a[o + 2], b[o + 2]) });
    }
    let pick: { diff: number; line: Line } | undefined;
    for (const [n, r] of refs.entries()) for (const t of targets) {
      const diff = t.at - r;
      // Middles count for a little more than edges, so text centres when it can.
      const weight = n === 1 ? 0.7 : 1;
      if (Math.abs(diff) < tol && (!pick || Math.abs(diff) * weight < Math.abs(pick.diff))) pick = { diff, line: t };
    }
    return pick;
  };
  const sx = axis(0), sy = axis(1);
  const out: P = [d[0] + (sx?.diff ?? 0), d[1] + (sy?.diff ?? 0)];
  const fb = moving.map((v, k) => v + out[k % 2]), guides: Guide[] = [];
  if (sx) guides.push({ axis: "x", at: sx.line.at, from: Math.min(fb[1], sx.line.lo) - 0.3, to: Math.max(fb[3], sx.line.hi) + 0.3 });
  if (sy) guides.push({ axis: "y", at: sy.line.at, from: Math.min(fb[0], sy.line.lo) - 0.3, to: Math.max(fb[2], sy.line.hi) + 0.3 });
  return { d: out, guides };
}
