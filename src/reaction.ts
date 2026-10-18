// Reactions: structures, text (reagents written as words or formulas, such as H2O), plus signs and straight arrows
// in a row. Double-clicking an arrow finds its whole
// reaction (every step in line with it); Clean up reaction puts the row on one level line with even gaps.
import { straightArrow, type Arrow, type Box, type Mol } from "./render.ts";
import { fragments, moveAtoms } from "./edit.ts";

type P = [number, number];
// One thing in the row, with its box in drawing units (y up): [left, bottom, right, top].
export type Step =
  | { kind: "structure"; atoms: number[]; box: Box }
  | { kind: "plus"; id: number; box: Box }
  | { kind: "text"; id: number; box: Box } // a caption standing in the row as a reactant or product
  | { kind: "arrow"; id: number; box: Box };
export type Reaction = { steps: Step[]; arrows: number[]; atoms: number[]; captions: number[] };

const REACH = 3.5; // the widest gap (bond lengths) between neighbours in one reaction
const straight = (a: Arrow) => straightArrow(a);

// The reaction an arrow is part of. ink: a structure's box (drawing units); captionBox: a caption's box.
export function findReaction(m: Mol, arrowId: number, arrows: Arrow[], ink: (atoms: number[]) => Box | undefined, captionBox: (id: number) => Box | undefined): Reaction | undefined {
  const a = arrows.find((x) => x.id === arrowId);
  if (!a || !straight(a)) return undefined;
  const d: P = [a.to[0] - a.from[0], a.to[1] - a.from[1]], length = Math.hypot(...d) || 1, u: P = [d[0] / length, d[1] / length], n: P = [-u[1], u[0]];
  const along = (q: P) => (q[0] - a.from[0]) * u[0] + (q[1] - a.from[1]) * u[1];
  const across = (q: P) => (q[0] - a.from[0]) * n[0] + (q[1] - a.from[1]) * n[1];
  const corners = (b: Box): P[] => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
  // Everything that could be in the row, as an interval along the arrow's line.
  const items: { step: Step; lo: number; hi: number; off: number; half: number }[] = [];
  const add = (step: Step) => {
    const c = corners(step.box), xs = c.map(along), ys = c.map(across);
    items.push({ step, lo: Math.min(...xs), hi: Math.max(...xs), off: (Math.min(...ys) + Math.max(...ys)) / 2, half: (Math.max(...ys) - Math.min(...ys)) / 2 });
  };
  for (const atoms of fragments(m)) { const b = ink(atoms); if (b) add({ kind: "structure", atoms, box: b }); }
  for (const c of m.captions ?? []) { const b = captionBox(c.id); if (b && !c.under && !c.on && !c.cycle) add({ kind: c.text.trim() === "+" ? "plus" : "text", id: c.id, box: b }); }
  for (const x of arrows) {
    if (!straight(x)) continue;
    const v: P = [x.to[0] - x.from[0], x.to[1] - x.from[1]], cos = (v[0] * u[0] + v[1] * u[1]) / (Math.hypot(...v) || 1);
    if (cos > Math.cos((20 * Math.PI) / 180)) add({ kind: "arrow", id: x.id, box: [Math.min(x.from[0], x.to[0]), Math.min(x.from[1], x.to[1]), Math.max(x.from[0], x.to[0]), Math.max(x.from[1], x.to[1])] });
  }
  // In line: its middle within its own half height (plus a bond and a half) of the arrow's line.
  const inLine = items.filter((it) => Math.abs(it.off) < it.half + 1.5);
  const start = inLine.find((it) => it.step.kind === "arrow" && it.step.id === arrowId)!;
  const row = [start];
  // Walk out both ways, taking the nearest thing each time, while the gap stays small.
  for (const dir of [-1, 1]) {
    let edge = dir < 0 ? start.lo : start.hi;
    for (;;) {
      const next = inLine.filter((it) => !row.includes(it) && (dir < 0 ? it.hi <= edge + 0.3 : it.lo >= edge - 0.3)).sort((p, q) => (dir < 0 ? q.hi - p.hi : p.lo - q.lo))[0];
      if (!next || (dir < 0 ? edge - next.hi : next.lo - edge) > REACH) break;
      row.push(next);
      edge = dir < 0 ? next.lo : next.hi;
    }
  }
  row.sort((p, q) => p.lo - q.lo);
  const steps = row.map((it) => it.step);
  if (!steps.some((s) => s.kind === "structure")) return undefined;
  const arrowIds = steps.flatMap((s) => (s.kind === "arrow" ? [s.id] : []));
  const atoms = steps.flatMap((s) => (s.kind === "structure" ? s.atoms : []));
  // Its captions: the plus signs, each arrow's conditions, and the numbers and names under its structures.
  const inRow = new Set(atoms);
  const captions = (m.captions ?? []).filter((c) => steps.some((s) => (s.kind === "plus" || s.kind === "text") && s.id === c.id) || (c.on && arrowIds.includes(c.on.arrow)) || (c.under && c.under.every((i) => inRow.has(i)))).map((c) => c.id);
  return { steps, arrows: arrowIds, atoms, captions };
}

// Lines the reaction up: every structure, plus sign and arrow centred on one level line through the first arrow,
// arrows level, in their order, with the same gap between neighbours. Arrows keep their length; conditions and
// numbers follow what they belong to.
export const GAP = 0.6; // bond lengths between neighbours
export function cleanUpReaction(m: Mol, r: Reaction, arrows: Arrow[]): Mol {
  const first = arrows.find((a) => a.id === r.arrows[0]);
  if (!first) return m;
  const level = (first.from[1] + first.to[1]) / 2;
  let x = Math.min(...r.steps.map((s) => s.box[0])), out = m;
  for (const s of r.steps) {
    const w = s.box[2] - s.box[0], h = (s.box[1] + s.box[3]) / 2;
    if (s.kind === "structure") out = moveAtoms(out, new Set(s.atoms), [x - s.box[0], level - h]);
    if (s.kind === "plus" || s.kind === "text") {
      const [dx, dy] = [x - s.box[0], level - h];
      out = { ...out, captions: out.captions?.map((c) => (c.id === s.id ? { ...c, x: c.x + dx, y: c.y + dy } : c)) };
    }
    if (s.kind === "arrow") {
      const a = arrows.find((y) => y.id === s.id)!, length = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]), right = a.to[0] >= a.from[0];
      const ends: [P, P] = [[x, level], [x + length, level]];
      // A drawn arrow can be shorter than shown (it grows to fit its conditions); it keeps its own length here.
      const stored = m.arrows?.find((y) => y.id === s.id);
      const own = stored ? Math.hypot(stored.to[0] - stored.from[0], stored.to[1] - stored.from[1]) : length, pad = (length - own) / 2;
      const [from, to]: [P, P] = right ? [[ends[0][0] + pad, level], [ends[1][0] - pad, level]] : [[ends[1][0] - pad, level], [ends[0][0] + pad, level]];
      out = { ...out, arrows: out.arrows?.map((y) => (y.id === s.id ? { ...y, from, to } : y)) };
      x += length + GAP;
      continue;
    }
    x += w + GAP;
  }
  return out;
}

// Whether a reaction is already clean: everything centred on the first arrow's line, arrows level, gaps even.
export function reactionClean(r: Reaction, arrows: Arrow[]): boolean {
  const first = arrows.find((a) => a.id === r.arrows[0]);
  if (!first || Math.abs(first.from[1] - first.to[1]) > 0.02) return false;
  const level = first.from[1], mids = r.steps.map((s) => (s.box[1] + s.box[3]) / 2);
  if (mids.some((y) => Math.abs(y - level) > 0.05)) return false;
  const gaps = r.steps.slice(1).map((s, k) => s.box[0] - r.steps[k].box[2]);
  return gaps.every((g) => Math.abs(g - GAP) < 0.08);
}

// Several structures as Clean up sees them: a row to lay out when they overlap, or when a plus sign stands among
// them (then they read as a reaction's starting materials, and plus is true). atoms: the structures in play
// (all of them when undefined).
export function rowOf(m: Mol, atoms: Set<number> | undefined, ink: (atoms: number[]) => Box | undefined, captionBox: (id: number) => Box | undefined): { steps: Step[]; plus: boolean } | undefined {
  const structures = fragments(m).filter((g) => !atoms || g.some((i) => atoms.has(i))).flatMap((g): Step[] => { const b = ink(g); return b ? [{ kind: "structure", atoms: g, box: b }] : []; });
  if (structures.length < 2) return undefined;
  const all: Box = [Math.min(...structures.map((s) => s.box[0])) - 1, Math.min(...structures.map((s) => s.box[1])) - 1, Math.max(...structures.map((s) => s.box[2])) + 1, Math.max(...structures.map((s) => s.box[3])) + 1];
  const plus = (m.captions ?? []).flatMap((c): Step[] => {
    const b = captionBox(c.id);
    return b && c.text.trim() === "+" && !c.under && !c.on && b[0] >= all[0] && b[2] <= all[2] && b[1] >= all[1] && b[3] <= all[3] ? [{ kind: "plus", id: c.id, box: b }] : [];
  });
  const touch = (p: Box, q: Box) => p[0] < q[2] + 0.3 && q[0] < p[2] + 0.3 && p[1] < q[3] + 0.3 && q[1] < p[3] + 0.3;
  const overlap = structures.some((s, k) => structures.slice(k + 1).some((t) => touch(s.box, t.box)));
  if (!overlap && !plus.length) return undefined;
  // In reading order: by the middle of each, left to right.
  const steps = [...structures, ...plus].sort((p, q) => (p.box[0] + p.box[2]) - (q.box[0] + q.box[2]));
  return { steps, plus: plus.length > 0 };
}

// Lays a row out on one level line (the first structure's middle) with even gaps, from where its left end is.
// Returns the drawing, the level, and where the row ends on the right.
export function layoutRow(m: Mol, steps: Step[]): { mol: Mol; level: number; right: number } {
  const first = steps.find((s) => s.kind === "structure")!, level = (first.box[1] + first.box[3]) / 2;
  let x = Math.min(...steps.map((s) => s.box[0])), out = m;
  for (const s of steps) {
    const [dx, dy] = [x - s.box[0], level - (s.box[1] + s.box[3]) / 2];
    if (s.kind === "structure") out = moveAtoms(out, new Set(s.atoms), [dx, dy]);
    if (s.kind === "plus" || s.kind === "text") out = { ...out, captions: out.captions?.map((c) => (c.id === s.id ? { ...c, x: c.x + dx, y: c.y + dy } : c)) };
    x += s.box[2] - s.box[0] + GAP;
  }
  return { mol: out, level, right: x - GAP };
}

// The part structures take in the drawing's reactions, for a Reaxys reaction search (ChemDraw's Reactant search
// and Reaction product search): what goes in (before a reaction's first arrow), what comes out (after its last), or
// either (between two arrows). structures: each one's atoms. undefined: in no reaction. "mixed": more than one
// part (a whole reaction), or some in a reaction and some not.
export type Role = "starting_material" | "product" | "all_reactions";
export function roleOf(reactions: Reaction[], structures: number[][]): Role | "mixed" | undefined {
  const roles = new Set(structures.map((atoms) => {
    for (const r of reactions) {
      const k = r.steps.findIndex((s) => s.kind === "structure" && s.atoms.includes(atoms[0]));
      if (k < 0) continue;
      const arrows = r.steps.flatMap((s, i) => (s.kind === "arrow" ? [i] : []));
      return k < arrows[0] ? "starting_material" : k > arrows[arrows.length - 1] ? "product" : "all_reactions";
    }
    return "none";
  }));
  if (roles.size > 1) return "mixed";
  const [role] = roles;
  return role === "none" ? undefined : role;
}
