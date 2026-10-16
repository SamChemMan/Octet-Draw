// Editing operations on a drawing. Each returns a new Mol and leaves the old one alone, so undo is a list of Mols.
// Coordinates are in bond lengths with y up, the same as KET.
import type { Atom, Bond, Mol } from "./render.ts";

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
// What a new bond is: its order, and its stereo (1 wedge, 6 hashed wedge) or display style.
export type BondSpec = Pick<Bond, "type" | "stereo" | "display">;
const SINGLE: BondSpec = { type: 1 };
// A bond with only the fields it needs (no empty stereo or display).
function makeBond(atoms: [number, number], spec: BondSpec): Bond {
  const bond: Bond = { type: spec.type, atoms };
  if (spec.stereo) bond.stereo = spec.stereo;
  if (spec.display) bond.display = spec.display;
  return bond;
}
function withBond(m: Mol, i: number, j: number, spec: BondSpec = SINGLE): Mol {
  if (i === j || bondIndex(m, i, j) >= 0) return m;
  return { ...m, bonds: [...m.bonds, makeBond([i, j], spec)] };
}

// Direction for a new bond from atom i: 30° on a lone atom, a zig-zag off a chain end,
// away from both bonds at a degree-2 atom, otherwise into the widest gap.
export function nextDirection(m: Mol, i: number): P {
  const here = pos(m, i), ns = neighbours(m, i), dirs = ns.map((j) => unit(sub(pos(m, j), here)));
  if (!dirs.length) return [Math.cos(30 * deg), Math.sin(30 * deg)];
  // sp atoms (a triple bond, or two double bonds) carry straight on.
  const orders = ns.map((j) => m.bonds[bondIndex(m, i, j)].type);
  if (dirs.length === 1 && orders[0] === 3) return mul(dirs[0], -1);
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
// A wedge's narrow end is at the start.
export function bondTo(m: Mol, from: number | P, q: P, spec: BondSpec = SINGLE): Mol {
  let i: number, j: number;
  if (typeof from === "number") i = from; else [m, i] = atomOrNew(m, from);
  [m, j] = atomOrNew(m, q);
  return withBond(m, i, j, spec);
}

// A click with the bond tool: on an atom, add a bond in the next direction; on empty canvas, add a bond at 30°.
export function sprout(m: Mol, from: number | P, spec: BondSpec = SINGLE): Mol {
  if (typeof from === "number") return bondTo(m, from, add(pos(m, from), nextDirection(m, from)), spec);
  return bondTo(m, from, add(from, [Math.cos(30 * deg), Math.sin(30 * deg)]), spec);
}

// A zig-zag chain from atom i (or a point) toward q: one bond per 0.866 bond lengths along the way, at ±30°
// to the drag direction. Returns the drawing and the number of bonds added.
export function chainTo(m: Mol, from: number | P, q: P): { mol: Mol; bonds: number } {
  const start = typeof from === "number" ? pos(m, from) : from, axis = sub(q, start), along = len(axis);
  const count = Math.max(1, Math.round(along / Math.cos(30 * deg)));
  const u = along > 1e-9 ? unit(axis) : ([1, 0] as P), v: P = [-u[1], u[0]];
  // Start the zig on the side away from an existing neighbour, so the chain carries on a zig-zag.
  let sign = 1;
  if (typeof from === "number") {
    const prev = neighbours(m, from)[0];
    if (prev !== undefined && cross(u, sub(pos(m, prev), start)) > 0) sign = -1;
  }
  let last: number | P = from;
  for (let k = 1; k <= count; k++) {
    const p = add(add(start, mul(u, k * Math.cos(30 * deg))), mul(v, k % 2 ? sign * 0.5 : 0));
    const before = m.atoms.length;
    m = bondTo(m, last, p);
    last = atomAt(m, p, 0.1) ?? before;
  }
  return { mol: m, bonds: count };
}

const setAtom = (m: Mol, i: number, change: Partial<Atom>): Mol => ({ ...m, atoms: m.atoms.map((a, k) => (k === i ? { ...a, ...change } : a)) });
const setBondAt = (m: Mol, i: number, change: Partial<Bond>): Mol => ({ ...m, bonds: m.bonds.map((b, k) => (k === i ? { ...b, ...change } : b)) });

export const setElement = (m: Mol, i: number, label: string) => setAtom(m, i, { label });
export const addCharge = (m: Mol, i: number, delta: number) => setAtom(m, i, { charge: (m.atoms[i].charge ?? 0) + delta || undefined });
// Single, then double, then triple, then single again. A wedge or hash becomes a plain double.
const respec = (m: Mol, i: number, spec: BondSpec): Mol => ({ ...m, bonds: m.bonds.map((b, k) => (k === i ? makeBond(b.atoms, spec) : b)) });
export const cycleBond = (m: Mol, i: number) => respec(m, i, { type: m.bonds[i].stereo || m.bonds[i].display ? 2 : (m.bonds[i].type % 3) + 1 });
export const setBond = (m: Mol, i: number, type: number, stereo?: number) => respec(m, i, { type, stereo });
export const setBondSpec = (m: Mol, i: number, spec: BondSpec) => respec(m, i, spec);
export const setPosition = (m: Mol, i: number, position: "left" | "centre" | "right") => setBondAt(m, i, { position });
// Swaps a bond's ends, so a wedge points the other way.
export const flipBond = (m: Mol, i: number) => setBondAt(m, i, { atoms: [m.bonds[i].atoms[1], m.bonds[i].atoms[0]] });

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
    m = withBond(m, i, j, { type: aromatic && !hasDouble(i) && !hasDouble(j) ? 2 : 1 });
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

// ChemDraw-style group keys on an atom. Each adds a group and keeps the bond rules above.
export type Group = "chain" | "other" | "acetyl" | "phenyl" | "cyclopropyl" | "cyclobutyl" | "cyclopentyl" | "cyclohexyl"
  | "wedgeMe" | "hashMe" | "methylidene" | "dimethyl" | "alkyne";
const RING_GROUPS: Partial<Record<Group, [number, boolean]>> = {
  phenyl: [6, true], cyclopropyl: [3, false], cyclobutyl: [4, false], cyclopentyl: [5, false], cyclohexyl: [6, false],
};
export function addGroup(m: Mol, i: number, g: Group): Mol {
  const here = pos(m, i), dir = nextDirection(m, i);
  const grow = (mol: Mol, spec: BondSpec = SINGLE, d: P = nextDirection(mol, i)): [Mol, number] => {
    const next = bondTo(mol, i, add(here, d), spec);
    return [next, atomAt(next, add(here, d), 0.1)!];
  };
  const ring = RING_GROUPS[g];
  if (ring) {
    // On a carbon already in a chain or ring (two neighbours), the ring is spiro; otherwise it hangs off a new bond.
    if (neighbours(m, i).length === 2 && g !== "phenyl") return addRing(m, ring[0], ring[1], { atom: i });
    const [m2, j] = grow(m);
    return addRing(m2, ring[0], ring[1], { atom: j });
  }
  switch (g) {
    case "chain": return grow(m)[0];
    case "other": {
      // The other zig-zag direction: the usual one mirrored across the existing bond.
      const ns = neighbours(m, i);
      if (ns.length !== 1) return grow(m)[0];
      const e = unit(sub(pos(m, ns[0]), here)), k = 2 * (dir[0] * e[0] + dir[1] * e[1]);
      return grow(m, SINGLE, [k * e[0] - dir[0], k * e[1] - dir[1]])[0];
    }
    case "acetyl": {
      // On a carbon with two neighbours, make it a C=O. Otherwise add C(=O)CH3.
      if (neighbours(m, i).length === 2) { const [m2, o] = grow(m, { type: 2 }); return setElement(m2, o, "O"); }
      const [m2, c] = grow(m);
      const o = bondTo(m2, c, add(pos(m2, c), nextDirection(m2, c)), { type: 2 });
      const oi = o.atoms.length - 1;
      const withO = setElement(o, oi, "O");
      return bondTo(withO, c, add(pos(withO, c), nextDirection(withO, c)));
    }
    case "wedgeMe": return grow(m, { type: 1, stereo: 1 })[0];
    case "hashMe": return grow(m, { type: 1, stereo: 6 })[0];
    case "methylidene": return grow(m, { type: 2 })[0];
    case "alkyne": return grow(m, { type: 3 })[0];
    case "dimethyl": { const [m2] = grow(m); return grow(m2)[0]; }
  }
  return m;
}

// Moves and turns a selection. Rotation is about the selection's centre, counter-clockwise for positive degrees.
export function rotateAtoms(m: Mol, ids: Set<number>, degrees: number): Mol {
  const ps = [...ids].filter((i) => i < m.atoms.length).map((i) => pos(m, i));
  if (!ps.length) return m;
  const c: P = [(Math.min(...ps.map((p) => p[0])) + Math.max(...ps.map((p) => p[0]))) / 2, (Math.min(...ps.map((p) => p[1])) + Math.max(...ps.map((p) => p[1]))) / 2];
  return { ...m, atoms: m.atoms.map((a, i) => {
    if (!ids.has(i)) return a;
    const r = add(c, rot(sub(pos(m, i), c), degrees * deg));
    return { ...a, location: [r[0], r[1], 0] };
  }) };
}

// Chair cyclohexane, drawn the textbook way: a 3D chair (bonds of length 1) seen from just above its mean plane,
// scaled so the drawn bonds average one bond length. Chair 2 is chair 1 turned upside down.
function chairPoints(which: 1 | 2): P[] {
  const R = Math.sqrt(0.75), h = 0.25, e = 30 * deg;
  const pts: P[] = Array.from({ length: 6 }, (_, k) => {
    const t = (k * 60) * deg, z = (k % 2 ? h : -h) * (which === 1 ? 1 : -1);
    return [R * Math.cos(t), z * Math.cos(e) + R * Math.sin(t) * Math.sin(e)];
  });
  const mean = pts.reduce((s, p, k) => s + len(sub(pts[(k + 1) % 6], p)), 0) / 6;
  return pts.map((p) => mul(p, 1 / mean));
}

// Places a chair on empty canvas (centred on the point), or fuses it onto a bond on the side away from the
// bond's other neighbours.
export function addChair(m: Mol, which: 1 | 2, target: { bond?: number; point?: P }): Mol {
  let pts = chairPoints(which);
  if (target.bond !== undefined) {
    const [i, j] = m.bonds[target.bond].atoms, a = pos(m, i), b = pos(m, j);
    // Map chair edge 0-1 onto a-b (rotate, scale, move), then mirror across the bond if it lands on the crowded side.
    const e0 = pts[0], e1 = pts[1], te = sub(e1, e0), be = sub(b, a);
    const k = len(be) / len(te), turn = Math.atan2(be[1], be[0]) - Math.atan2(te[1], te[0]);
    pts = pts.map((p) => add(a, mul(rot(sub(p, e0), turn), k)));
    const normal: P = unit([-(b[1] - a[1]), b[0] - a[0]]);
    const sideOf = (p: P) => Math.sign((p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1]);
    const centre = mul(pts.reduce((s, p) => add(s, p), [0, 0] as P), 1 / 6);
    const others = [...neighbours(m, i), ...neighbours(m, j)].filter((x) => x !== i && x !== j);
    if (others.reduce((s, x) => s + sideOf(pos(m, x)), 0) * sideOf(centre) > 0) {
      pts = pts.map((p) => { const d = (p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1]; return sub(p, mul(normal, 2 * d)); });
    }
  } else {
    const c = target.point!;
    pts = pts.map((p) => add(p, c));
  }
  const ids: number[] = [];
  for (const p of pts) { let id: number; [m, id] = atomOrNew(m, p); ids.push(id); }
  for (let k = 0; k < 6; k++) m = withBond(m, ids[k], ids[(k + 1) % 6]);
  return m;
}

// Atoms inside a closed lasso path (even-odd rule).
export function atomsInPolygon(m: Mol, poly: P[]): number[] {
  return m.atoms.flatMap((_, i) => {
    const [x, y] = pos(m, i);
    let inside = false;
    for (let k = 0, l = poly.length - 1; k < poly.length; l = k++) {
      const [xi, yi] = poly[k], [xj, yj] = poly[l];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside ? [i] : [];
  });
}
