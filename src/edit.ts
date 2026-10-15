// Editing operations on a drawing. Each returns a new Mol and leaves the old one alone, so undo is a list of Mols.
// Coordinates are in bond lengths with y up, the same as KET.
import type { Atom, Bond, Mol } from "./render";

export type P = [number, number];
export const EMPTY: Mol = { atoms: [], bonds: [] };

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const unit = (a: P): P => mul(a, 1 / (len(a) || 1));
const rot = (a: P, t: number): P => [a[0] * Math.cos(t) - a[1] * Math.sin(t), a[0] * Math.sin(t) + a[1] * Math.cos(t)];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const deg = Math.PI / 180;

export const pos = (m: Mol, i: number): P => [m.atoms[i].location[0], m.atoms[i].location[1]];
export const neighbours = (m: Mol, i: number) =>
  m.bonds.flatMap((b) => (b.atoms[0] === i ? [b.atoms[1]] : b.atoms[1] === i ? [b.atoms[0]] : []));
const bondIndex = (m: Mol, i: number, j: number) =>
  m.bonds.findIndex((b) => (b.atoms[0] === i && b.atoms[1] === j) || (b.atoms[0] === j && b.atoms[1] === i));

// Hit testing, in bond lengths.
export function atomAt(m: Mol, p: P, r = 0.3): number | undefined {
  let best: number | undefined, bestD = r;
  m.atoms.forEach((_, i) => { const d = len(sub(pos(m, i), p)); if (d < bestD) { best = i; bestD = d; } });
  return best;
}
export function bondAt(m: Mol, p: P, r = 0.2): number | undefined {
  let best: number | undefined, bestD = r;
  m.bonds.forEach((b, i) => {
    const a = pos(m, b.atoms[0]), ab = sub(pos(m, b.atoms[1]), a);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1)));
    const d = len(sub(p, add(a, mul(ab, t))));
    if (d < bestD) { best = i; bestD = d; }
  });
  return best;
}

const withAtom = (m: Mol, p: P, label = "C"): [Mol, number] => [{ ...m, atoms: [...m.atoms, { label, location: [p[0], p[1], 0] }] }, m.atoms.length];
// The atom at p, or a new carbon there.
function atomOrNew(m: Mol, p: P): [Mol, number] {
  const i = atomAt(m, p, 0.1);
  return i === undefined ? withAtom(m, p) : [m, i];
}
function withBond(m: Mol, i: number, j: number, type = 1): Mol {
  if (i === j || bondIndex(m, i, j) >= 0) return m;
  return { ...m, bonds: [...m.bonds, { type, atoms: [i, j] }] };
}

// Direction for a new bond from atom i: 30° on a lone atom, a zig-zag off a chain end,
// away from both bonds at a degree-2 atom, otherwise into the widest gap.
export function nextDirection(m: Mol, i: number): P {
  const here = pos(m, i), ns = neighbours(m, i), dirs = ns.map((j) => unit(sub(pos(m, j), here)));
  if (!dirs.length) return [Math.cos(30 * deg), Math.sin(30 * deg)];
  if (dirs.length === 1) {
    const [a, b] = [rot(dirs[0], 120 * deg), rot(dirs[0], -120 * deg)];
    // Zig-zag: put the new bond on the other side of this bond from the previous one.
    const prev = neighbours(m, ns[0]).find((j) => j !== i);
    if (prev !== undefined) {
      const axis = sub(here, pos(m, ns[0])), side = Math.sign(cross(axis, sub(pos(m, prev), pos(m, ns[0]))));
      return Math.sign(cross(axis, a)) === side ? b : a;
    }
    return a[0] > b[0] + 1e-9 || (Math.abs(a[0] - b[0]) < 1e-9 && a[1] > b[1]) ? a : b;
  }
  if (dirs.length === 2) {
    const s = add(dirs[0], dirs[1]);
    return len(s) < 1e-6 ? [-dirs[0][1], dirs[0][0]] : unit(mul(s, -1));
  }
  const angles = dirs.map((d) => Math.atan2(d[1], d[0])).sort((a, b) => a - b);
  let gap = -1, mid = 0;
  angles.forEach((a, k) => {
    const next = k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI;
    if (next - a > gap) { gap = next - a; mid = a + gap / 2; }
  });
  return [Math.cos(mid), Math.sin(mid)];
}

// A bond from atom i (or from a new atom at a point) to point q. Joins an existing atom at q.
export function bondTo(m: Mol, from: number | P, q: P): Mol {
  let i: number, j: number;
  if (typeof from === "number") i = from; else [m, i] = atomOrNew(m, from);
  [m, j] = atomOrNew(m, q);
  return withBond(m, i, j);
}

// A click with the bond tool: on an atom, add a bond in the next direction; on empty canvas, add a bond at 30°.
export function sprout(m: Mol, from: number | P): Mol {
  if (typeof from === "number") return bondTo(m, from, add(pos(m, from), nextDirection(m, from)));
  return bondTo(m, from, add(from, [Math.cos(30 * deg), Math.sin(30 * deg)]));
}

const setAtom = (m: Mol, i: number, change: Partial<Atom>): Mol => ({ ...m, atoms: m.atoms.map((a, k) => (k === i ? { ...a, ...change } : a)) });
const setBondAt = (m: Mol, i: number, change: Partial<Bond>): Mol => ({ ...m, bonds: m.bonds.map((b, k) => (k === i ? { ...b, ...change } : b)) });

export const setElement = (m: Mol, i: number, label: string) => setAtom(m, i, { label });
export const addCharge = (m: Mol, i: number, delta: number) => setAtom(m, i, { charge: (m.atoms[i].charge ?? 0) + delta || undefined });
// Single, then double, then triple, then single again. A wedge or hash becomes a plain double.
export const cycleBond = (m: Mol, i: number) => setBondAt(m, i, { type: m.bonds[i].stereo ? 2 : (m.bonds[i].type % 3) + 1, stereo: undefined });
export const setBond = (m: Mol, i: number, type: number, stereo?: number) => setBondAt(m, i, { type, stereo });

// Removes atoms (and their bonds), then any bare carbons left with no bonds.
function removeAtoms(m: Mol, gone: Set<number>): Mol {
  const bonds = m.bonds.filter((b) => !gone.has(b.atoms[0]) && !gone.has(b.atoms[1]));
  const used = new Set(bonds.flatMap((b) => b.atoms));
  m.atoms.forEach((a, i) => { if (!used.has(i) && a.label === "C" && !a.charge) gone.add(i); });
  const map = new Map<number, number>();
  const atoms = m.atoms.filter((_, i) => !gone.has(i));
  m.atoms.forEach((_, i) => { if (!gone.has(i)) map.set(i, map.size); });
  return { atoms, bonds: bonds.map((b) => ({ ...b, atoms: [map.get(b.atoms[0])!, map.get(b.atoms[1])!] })) };
}
export const deleteAtom = (m: Mol, i: number) => removeAtoms(m, new Set([i]));
export const deleteBond = (m: Mol, i: number) => removeAtoms({ ...m, bonds: m.bonds.filter((_, k) => k !== i) }, new Set());

// A ring of n atoms. On a bond: fused on the side with fewer neighbours. On an atom: sharing that atom,
// pointing the way a new bond would go. On empty canvas: centred on the point, with a vertex at the top.
// Benzene (aromatic) gets alternating double bonds that avoid atoms that already have one.
export function addRing(m: Mol, n: number, aromatic: boolean, target: { bond?: number; atom?: number; point?: P }): Mol {
  const r = 1 / (2 * Math.sin(Math.PI / n));
  let centre: P, start: P;
  if (target.bond !== undefined) {
    const [i, j] = m.bonds[target.bond].atoms, a = pos(m, i), b = pos(m, j), mid = mul(add(a, b), 0.5);
    const normal: P = unit([-(b[1] - a[1]), b[0] - a[0]]);
    const others = [...neighbours(m, i), ...neighbours(m, j)].filter((k) => k !== i && k !== j);
    const pull = others.reduce((s, k) => s + Math.sign((pos(m, k)[0] - mid[0]) * normal[0] + (pos(m, k)[1] - mid[1]) * normal[1]), 0);
    centre = add(mid, mul(normal, (pull > 0 ? -1 : 1) / (2 * Math.tan(Math.PI / n))));
    start = a;
  } else if (target.atom !== undefined) {
    start = pos(m, target.atom);
    centre = add(start, mul(nextDirection(m, target.atom), r));
  } else {
    centre = target.point!;
    start = add(centre, [0, r]);
  }
  // Walk the ring from start around the centre, adding atoms where none exist.
  const ids: number[] = [];
  for (let k = 0; k < n; k++) {
    let id: number;
    [m, id] = atomOrNew(m, add(centre, rot(sub(start, centre), (2 * Math.PI * k) / n)));
    ids.push(id);
  }
  const hasDouble = (i: number) => m.bonds.some((b) => b.type === 2 && b.atoms.includes(i));
  for (let k = 0; k < n; k++) {
    const i = ids[k], j = ids[(k + 1) % n];
    if (bondIndex(m, i, j) >= 0) continue;
    m = withBond(m, i, j, aromatic && !hasDouble(i) && !hasDouble(j) ? 2 : 1);
  }
  return m;
}

// Adds a fragment (from a paste) shifted by offset.
export function merge(m: Mol, frag: Mol, offset: P): Mol {
  const base = m.atoms.length;
  return {
    atoms: [...m.atoms, ...frag.atoms.map((a) => ({ ...a, location: [a.location[0] + offset[0], a.location[1] + offset[1], 0] as [number, number, number] }))],
    bonds: [...m.bonds, ...frag.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] }))],
  };
}

export function bounds(m: Mol): [number, number, number, number] | undefined {
  if (!m.atoms.length) return undefined;
  const xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// Selection helpers. A selection is a set of atom indices; a bond is selected when both its atoms are.
export const deleteAtoms = (m: Mol, ids: Set<number>) => removeAtoms(m, new Set(ids));
export function moveAtoms(m: Mol, ids: Set<number>, d: P): Mol {
  return { ...m, atoms: m.atoms.map((a, i) => (ids.has(i) ? { ...a, location: [a.location[0] + d[0], a.location[1] + d[1], 0] } : a)) };
}
export function atomsIn(m: Mol, a: P, b: P): number[] {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return m.atoms.flatMap((_, i) => { const [x, y] = pos(m, i); return x >= x0 && x <= x1 && y >= y0 && y <= y1 ? [i] : []; });
}
// The selected atoms and the bonds between them, as their own drawing (for Copy).
export function subset(m: Mol, ids: Set<number>): Mol {
  const keep = new Set([...ids].filter((i) => i < m.atoms.length));
  return removeAtoms({ ...m }, new Set(m.atoms.map((_, i) => i).filter((i) => !keep.has(i))));
}

// Removes the given bonds and atoms at once (one eraser stroke), then any bare carbons left with no bonds.
export function erase(m: Mol, bonds: Set<number>, atoms: Set<number>): Mol {
  return removeAtoms({ ...m, bonds: m.bonds.filter((_, i) => !bonds.has(i)) }, new Set(atoms));
}

// Atoms a selection box missed but that obviously belong: every neighbour is selected (a terminal O, an H,
// an atom bridging two selected ones).
export function complete(m: Mol, ids: Set<number>): Set<number> {
  const out = new Set(ids);
  m.atoms.forEach((_, i) => {
    const ns = neighbours(m, i);
    if (!out.has(i) && ns.length && ns.every((j) => ids.has(j))) out.add(i);
  });
  return out;
}

// Convex hull (monotone chain), counter-clockwise.
function hull(ps: P[]): P[] {
  const s = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const half = (pts: P[]) => {
    const out: P[] = [];
    for (const p of pts) {
      while (out.length >= 2 && cross(sub(out[out.length - 1], out[out.length - 2]), sub(p, out[out.length - 2])) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(s), ...half([...s].reverse())];
}
const segDist = (p: P, a: P, b: P) => {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1)));
  return len(sub(p, add(a, mul(ab, t))));
};

// Is p on the selection: inside the outline around its atoms, or within r of it (bond lengths)?
export function onSelection(m: Mol, ids: Set<number>, p: P, r = 0.45): boolean {
  const ps = [...ids].filter((i) => i < m.atoms.length).map((i) => pos(m, i));
  if (!ps.length) return false;
  const h = hull(ps);
  if (h.length >= 3 && h.every((a, k) => cross(sub(h[(k + 1) % h.length], a), sub(p, a)) >= 0)) return true;
  if (h.length === 1) return len(sub(p, h[0])) <= r;
  return h.some((a, k) => segDist(p, a, h[(k + 1) % h.length]) <= r);
}

// Groups of connected atoms.
export function fragments(m: Mol): number[][] {
  const seen = new Set<number>(), out: number[][] = [];
  m.atoms.forEach((_, start) => {
    if (seen.has(start)) return;
    const group: number[] = [], stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop()!;
      group.push(i);
      for (const j of neighbours(m, i)) if (!seen.has(j)) { seen.add(j); stack.push(j); }
    }
    out.push(group);
  });
  return out;
}

// After a move: each moved atom that sits exactly on another atom joins it, so no atom hides under another.
// The other atom keeps its label unless it is a plain carbon. Returns the drawing and whether anything joined.
export function joinOverlaps(m: Mol, moved: Set<number>): { mol: Mol; joined: boolean } {
  const into = new Map<number, number>();
  for (const i of moved) {
    if (i >= m.atoms.length) continue;
    const j = m.atoms.findIndex((_, k) => !moved.has(k) && len(sub(pos(m, k), pos(m, i))) < 1e-6);
    if (j >= 0) into.set(i, j);
  }
  if (!into.size) return { mol: m, joined: false };
  let atoms = m.atoms;
  for (const [i, j] of into) if (atoms[j].label === "C" && atoms[i].label !== "C") atoms = atoms.map((a, k) => (k === j ? { ...a, label: atoms[i].label } : a));
  const bonds: Bond[] = [];
  for (const b of m.bonds) {
    const ends = b.atoms.map((k) => into.get(k) ?? k) as [number, number];
    if (ends[0] === ends[1] || bonds.some((c) => (c.atoms[0] === ends[0] && c.atoms[1] === ends[1]) || (c.atoms[0] === ends[1] && c.atoms[1] === ends[0]))) continue;
    bonds.push({ ...b, atoms: ends });
  }
  return { mol: removeAtoms({ atoms, bonds }, new Set(into.keys())), joined: true };
}
