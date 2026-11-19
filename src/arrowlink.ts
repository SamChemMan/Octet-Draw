// Curved arrows tied to what they point at. Ported from PR #143 by Prof. Dr. Stefan Schramm, in Octet's own way.
// A curved, fishhook or double-headed curved arrow drawn from or to an atom, a bond or a lone pair (or radical dot)
// keeps that end tied to it (Arrow.fromOn, toOn). When an edit moves what an end is tied to and leaves the end where it
// was, followArrows takes the end along: it keeps its place against its target (turned with it, and turned over with
// it). An end the edit moved itself (the arrow was moved or turned with its structure) stays where the edit put it.
// Atoms are numbers, so every edit that renumbers them maps the ties (retie); an end whose target goes lets go and
// stays where it is. The arrow's from and to always hold where its ends are, which every file and export writes.
import type { Arrow, ArrowEnd, Mol } from "./render.ts";

type P = [number, number];
const at = (m: Mol, i: number): P => [m.atoms[i].location[0], m.atoms[i].location[1]];
const same = (p: P, q: P) => p[0] === q[0] && p[1] === q[1];

// Arrows whose ends tie: the curved arrows the Arrow tool draws onto electrons (not an arc line).
export const tieable = (a: Pick<Arrow, "kind">) => a.kind === "curved" || a.kind === "fishhook" || a.kind === "double";
export const tied = (a: Pick<Arrow, "fromOn" | "toOn">) => !!(a.fromOn || a.toOn);
// A lone pair's or radical dot's key, as the renderer numbers an atom's marks.
export const MARK_KEY = /^(pair[0-3]|radical[01])$/;
// A lone pair or radical dot d bond lengths from p is in reach r: within the mouse's 0.3 always, and further (a pen's or
// a finger's reach) only when p is nearer it than its atom at a, so a press on the atom still takes the atom.
export const markIn = (d: number, r: number, a: readonly number[] | undefined, p: P) => d < 0.3 || (d < r && !!a && d < Math.hypot(a[0] - p[0], a[1] - p[1]));

// Whether a tie's target is in the drawing: the atom; its lone pair or radical dot; or a bond between the two atoms.
export function holds(m: Mol, on: ArrowEnd): boolean {
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < m.atoms.length;
  if ("bond" in on) {
    const [i, j] = on.bond;
    return ok(i) && ok(j) && i !== j && m.bonds.some((b) => (b.atoms[0] === i && b.atoms[1] === j) || (b.atoms[0] === j && b.atoms[1] === i));
  }
  if (!ok(on.atom)) return false;
  if (on.pair === undefined) return true;
  const a = m.atoms[on.atom], n = Number(on.pair.slice(-1));
  return on.pair.startsWith("pair") ? n < (a.pairs ?? 0) + (a.radical === 3 ? 1 : 0) : n < (a.radical === 2 ? 2 : a.radical === 1 ? 1 : 0);
}

// The ties of some arrows with each atom renumbered by to; a tie to an atom that is gone lets go (its end stays).
// Returns the same list when no arrow is tied.
export function retie<T extends Pick<Arrow, "fromOn" | "toOn">>(arrows: T[] | undefined, to: (i: number) => number | undefined): T[] | undefined {
  if (!arrows?.some(tied)) return arrows;
  const one = (on?: ArrowEnd): ArrowEnd | undefined => {
    if (!on) return undefined;
    if ("bond" in on) {
      const i = to(on.bond[0]), j = to(on.bond[1]);
      return i === undefined || j === undefined || i === j ? undefined : { bond: [i, j] };
    }
    const i = to(on.atom);
    return i === undefined ? undefined : { ...on, atom: i };
  };
  return arrows.map((a) => {
    if (!tied(a)) return a;
    const out = { ...a, fromOn: one(a.fromOn), toOn: one(a.toOn) };
    if (!out.fromOn) delete out.fromOn;
    if (!out.toOn) delete out.toOn;
    return out;
  });
}

// The atoms that set where a target's end goes: its atom (or a bond's two), a neighbour that gives the way it faces,
// and a third atom that tells a flip (both in before and after, by the same numbers).
// nbrs: each atom's neighbours in after.
function frameAtoms(before: Mol, nbrs: number[][], on: ArrowEnd): number[] {
  const ends = "bond" in on ? [...on.bond] : [on.atom];
  const near = (i: number) => [...new Set(nbrs[i] ?? [])].filter((k) => k < before.atoms.length && !ends.includes(k)).sort((p, q) => p - q);
  const first = near(ends[0]);
  if ("bond" in on) return [...ends, ...[...first, ...near(ends[1])].slice(0, 1)];
  const j = first[0];
  if (j === undefined) return ends;
  return [ends[0], j, ...[...first.slice(1), ...near(j).filter((k) => k !== ends[0])].slice(0, 1)];
}

// Where an end p goes when its target moves from where it was in before (tied by was) to where it is in after (by on):
// the same place against the target. Against a bond: as far along it, and as far off it. Against an atom: as far off
// it, turned as the atom's first neighbour turned about it. Turned over when the target was. With nothing to turn by
// (an atom on its own, or atoms numbered anew), it moves as the atom moved.
function carry(before: Mol, after: Mol, nbrs: number[][], was: ArrowEnd, on: ArrowEnd, p: P): P {
  const o0 = "bond" in was ? at(before, was.bond[0]) : at(before, was.atom), o1 = "bond" in on ? at(after, on.bond[0]) : at(after, on.atom);
  const moveBy = (): P => [p[0] + o1[0] - o0[0], p[1] + o1[1] - o0[1]];
  // Numbered anew (a delete, a join, a label drawn again): a bond from its own two atoms; an atom moves as it moved.
  if (JSON.stringify(was) !== JSON.stringify(on)) return "bond" in was && "bond" in on ? across(o0, at(before, was.bond[1]), o1, at(after, on.bond[1]), p, false, true) : moveBy();
  const [, ref, third] = frameAtoms(before, nbrs, on);
  if (ref === undefined) return moveBy();
  let flip = false;
  if (third !== undefined) {
    const side = (m: Mol, o: P) => { const r = at(m, ref), k = at(m, third); return (r[0] - o[0]) * (k[1] - o[1]) - (r[1] - o[1]) * (k[0] - o[0]); };
    flip = Math.sign(side(before, o0)) * Math.sign(side(after, o1)) < 0;
  }
  return across(o0, at(before, ref), o1, at(after, ref), p, flip, "bond" in on);
}
// p against the line o0–r0, put against o1–r1: along it as a fraction of the line when along, else as a distance; off
// it as a distance (on the other side when flip).
function across(o0: P, r0: P, o1: P, r1: P, p: P, flip: boolean, along: boolean): P {
  const v0: P = [r0[0] - o0[0], r0[1] - o0[1]], v1: P = [r1[0] - o1[0], r1[1] - o1[1]], n0 = Math.hypot(...v0), n1 = Math.hypot(...v1);
  if (n0 < 1e-9 || n1 < 1e-9) return [p[0] + o1[0] - o0[0], p[1] + o1[1] - o0[1]];
  const u0: P = [v0[0] / n0, v0[1] / n0], u1: P = [v1[0] / n1, v1[1] / n1], d: P = [p[0] - o0[0], p[1] - o0[1]];
  const x = d[0] * u0[0] + d[1] * u0[1], y = (u0[0] * d[1] - u0[1] * d[0]) * (flip ? -1 : 1), s = along ? x * (n1 / n0) : x;
  return [o1[0] + s * u1[0] - y * u1[1], o1[1] + s * u1[1] + y * u1[0]];
}

// Each tied end of an edit's drawing (after) that the edit left where it was, taken along with its target when the
// edit moved it (before: the drawing before the edit). Ties whose target went, and ties on arrows that are no longer
// curved, let go. Returns after itself when nothing changes, so a drawing with no ties pays one look at its arrows.
export function followArrows(before: Mol, after: Mol): Mol {
  if (!after.arrows?.some(tied)) return after;
  const old = new Map((before.arrows ?? []).map((a) => [a.id, a]));
  let changed = false, adjacent: number[][] | undefined;
  const nbrs = () => {
    if (adjacent) return adjacent;
    adjacent = after.atoms.map(() => []);
    for (const b of after.bonds) { adjacent[b.atoms[0]]?.push(b.atoms[1]); adjacent[b.atoms[1]]?.push(b.atoms[0]); }
    return adjacent;
  };
  const arrows = after.arrows.map((a) => {
    if (!tied(a)) return a;
    let out = a;
    for (const end of ["from", "to"] as const) {
      const key = end === "from" ? "fromOn" : "toOn", on = out[key];
      if (!on) continue;
      if (!tieable(out) || !holds(after, on)) { const { [key]: _, ...rest } = out; out = rest as Arrow; continue; }
      const o = old.get(a.id), was = o?.[key];
      // A new arrow, a new tie, or an end this edit moved itself: as it is.
      if (!o || !was || !holds(before, was) || !same(o[end], out[end])) continue;
      const moved = JSON.stringify(was) !== JSON.stringify(on) || frameAtoms(before, nbrs(), on).some((i) => !same(at(before, i), at(after, i)));
      if (!moved) continue;
      const q = carry(before, after, nbrs(), was, on, out[end]);
      if (!same(q, out[end])) out = { ...out, [end]: q };
    }
    if (out !== a) changed = true;
    return out;
  });
  return changed ? { ...after, arrows } : after;
}

// What an end at p would tie to: a lone pair or radical dot in reach (markIn; marks: where the renderer drew them, in
// bond lengths, y up), else an atom, else a bond (atomAt and bondAt, as the pointer finds them).
export function tieAt(m: Mol, p: P, marks: { atom: number; at: P; key?: string }[], atomAt: (m: Mol, p: P) => number | undefined, bondAt: (m: Mol, p: P) => number | undefined, r = 0.3): ArrowEnd | undefined {
  const near = marks.filter((e) => e.key && MARK_KEY.test(e.key)).map((e) => ({ e, d: Math.hypot(e.at[0] - p[0], e.at[1] - p[1]) })).filter((x) => markIn(x.d, r, m.atoms[x.e.atom]?.location, p)).sort((x, y) => x.d - y.d)[0];
  if (near && near.e.atom < m.atoms.length) return { atom: near.e.atom, pair: near.e.key };
  const i = atomAt(m, p);
  if (i !== undefined) return { atom: i };
  const k = bondAt(m, p), b = k === undefined ? undefined : m.bonds[k];
  return b && b.atoms[0] !== b.atoms[1] ? { bond: [b.atoms[0], b.atoms[1]] } : undefined;
}

// An arrow with its ends tied as given (a tie on an arrow that does not tie, or the same target at both ends, is left
// off).
export function withTies<T extends Omit<Arrow, "id">>(a: T, fromOn?: ArrowEnd, toOn?: ArrowEnd): T {
  const { fromOn: _f, toOn: _t, ...rest } = a, sameEnd = !!fromOn && !!toOn && JSON.stringify(fromOn) === JSON.stringify(toOn);
  if (!tieable(a) || sameEnd) return rest as T;
  return { ...rest, ...(fromOn ? { fromOn } : {}), ...(toOn ? { toOn } : {}) } as T;
}

// A tie read from a file (hostile): undefined unless it names atoms of this drawing and nothing else.
export function readTie(x: unknown, atoms: number): ArrowEnd | undefined {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Record<string, unknown>, ok = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < atoms;
  if (Array.isArray(o.bond)) return o.bond.length === 2 && ok(o.bond[0]) && ok(o.bond[1]) && o.bond[0] !== o.bond[1] ? { bond: [o.bond[0], o.bond[1]] } : undefined;
  if (!ok(o.atom)) return undefined;
  if (o.pair === undefined) return { atom: o.atom };
  return typeof o.pair === "string" && MARK_KEY.test(o.pair) ? { atom: o.atom, pair: o.pair } : undefined;
}
