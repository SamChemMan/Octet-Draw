// Measurements (issue 85): the length between two ends, the angle at three and the dihedral across four atoms, each a
// text that belongs to its ends (a caption with measure). An end is an atom or a free point on the page. The value
// comes from the ends as drawn now, every time the drawing changes: in 3D (x, y and depth) when every end is an atom,
// on the page plane when one is a free point. Measuring never changes the drawing. The text in a file is only a copy
// for other programs. Dashed lines join the ends that no bond joins, and an angle has an arc at its vertex (measureInk).
//
// The Å scale is 3D Clean Up's own unit (clean3d.ts): a bond's real length over a C–C single bond's (its ratio), so
// a structure's median of (length / ratio) is the length of a 1.52 Å bond. For a measurement with an atom end, scaling
// the drawing or changing the style never changes a value, and a bond reads the length 3D Clean Up gives it. With no
// atom end, the document's bond length is 1.52 Å, so scaling the drawing changes the value (D14).
import { bondRatios } from "./clean3d.ts";
import { widthOf } from "./arial.ts";
import { DEFAULT_STYLE, type DocStyle } from "./docstyle.ts";
import { ASCENT, DESCENT, HBOND, type Atom, type Bond, type Caption, type End, type Measure, type Mol } from "./render.ts";

export type MeasureKind = "distance" | "angle" | "dihedral";
// By the number of ends less 2.
export const KINDS: MeasureKind[] = ["distance", "angle", "dihedral"];
export const kindOf = (atoms: number): MeasureKind | undefined => KINDS[atoms - 2];
export const MEASURE_NAMES: Record<MeasureKind, string> = { distance: "Length", angle: "Angle", dihedral: "Dihedral" };
export const UNITS: Record<MeasureKind, string> = { distance: "Å", angle: "°", dihedral: "°" };
const CC = 1.52; // Å, a C–C single bond
// An angle's arc (bond lengths), and the space between a label and its lines.
export const ARC = 0.4;
const GAP = 0.2;
// Three atoms nearer than this to one line (the sine of the angle at the middle one) leave a dihedral undefined: a
// dihedral across a C≡C, or with an atom on the line of the middle bond.
const LINEAR = Math.sin((2 * Math.PI) / 180);

type V = [number, number, number];
type P = [number, number];
const sub3 = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a: V) => Math.hypot(a[0], a[1], a[2]);
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const len = (a: P) => Math.hypot(a[0], a[1]);
const perp = (a: P): P => [-a[1], a[0]];
const unit = (a: P): P | undefined => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l] : undefined; };
const at3 = (m: Mol, i: number): V => [m.atoms[i].location[0], m.atoms[i].location[1], m.atoms[i].location[2] ?? 0];
const at2 = (m: Mol, i: number): P => [m.atoms[i].location[0], m.atoms[i].location[1]];
// An end that is an atom (its index); the other ends are free points.
export const isAtom = (e: End): e is number => typeof e === "number";
// A measurement's atoms, in order.
export const atomEnds = (x: Measure): number[] => x.ends.filter(isAtom);
// Where an end is on the page.
export const endAt = (m: Mol, e: End): P => (isAtom(e) ? at2(m, e) : e);
const point = (v: unknown, most: number): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((q) => typeof q === "number" && Number.isFinite(q) && Math.abs(q) <= most);

// A measure that can stand in a drawing of n atoms: 2 to 4 ends, each an atom of the drawing or a point within a
// million bond lengths, its atoms distinct, a dihedral's four all atoms, and a label offset within 1000 bond lengths.
// Anything else (a damaged or hostile file) is not a measurement.
export function soundMeasure(x: unknown, n: number): x is Measure {
  if (typeof x !== "object" || x === null) return false;
  const { ends, at } = x as { ends?: unknown; at?: unknown };
  if (!Array.isArray(ends) || ends.length < 2 || ends.length > 4) return false;
  if (!ends.every((e) => (Number.isInteger(e) && e >= 0 && e < n) || point(e, 1e6))) return false;
  const atoms = ends.filter((e) => typeof e === "number");
  if (new Set(atoms).size !== atoms.length || (ends.length === 4 && atoms.length !== 4)) return false;
  return at === undefined || point(at, 1000);
}
// A measure read from a file or the clipboard, in either form: { ends, at? }, or the form the 1.2 beta and 1.1.3 dev
// builds wrote, { atoms, at? } (every end an atom). A copy of it when it is sound, else undefined (plain text).
export function readMeasure(x: unknown, n: number): Measure | undefined {
  if (typeof x !== "object" || x === null) return undefined;
  const o = x as { ends?: unknown; atoms?: unknown; at?: unknown }, y = { ends: o.ends ?? o.atoms, ...(o.at !== undefined ? { at: o.at } : {}) };
  if (!soundMeasure(y, n)) return undefined;
  return { ends: y.ends.map((e) => (isAtom(e) ? e : [e[0], e[1]] as [number, number])), ...(y.at ? { at: [y.at[0], y.at[1]] as [number, number] } : {}) };
}
// A caption that is a measurement.
export const isMeasure = (c: Caption): c is Caption & { measure: Measure } => !!c.measure;

// What the values need of each structure, worked out once for its bonds and elements: each atom's structure (its
// bonds, and a multi-centre point's atoms) and each bond's ratio. A drag or a turn changes only the atoms' places, so
// it finds the same entry (the bonds list is the same, and each atom is the same element).
type Known = { atoms: Atom[]; comp: Int32Array; ratio: Float64Array; byComp: Map<number, number[]> };
const known = new WeakMap<Bond[], Known>();
const sameKind = (a: Atom, b: Atom) => a === b || (a.label === b.label && a.charge === b.charge && a.implicitHCount === b.implicitHCount && !a.text === !b.text && a.centre === b.centre);
function chemistry(m: Mol): Known {
  const k = known.get(m.bonds);
  if (k && (k.atoms === m.atoms || (k.atoms.length === m.atoms.length && m.atoms.every((a, i) => sameKind(a, k.atoms[i]))))) { k.atoms = m.atoms; return k; }
  const n = m.atoms.length, up = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
  const join = (i: number, j: number) => { if (i < n && j < n) up[find(i)] = find(j); };
  for (const b of m.bonds) if (b.type !== HBOND) join(b.atoms[0], b.atoms[1]);
  m.atoms.forEach((a, i) => { for (const j of a.centre?.atoms ?? []) join(i, j); });
  const comp = Int32Array.from({ length: n }, (_, i) => find(i)), ratio = new Float64Array(m.bonds.length).fill(NaN);
  for (const [b, r] of bondRatios(m, m.atoms.map((_, i) => i))) ratio[b] = r;
  // Each structure's bonds (by their place in m.bonds), so a value reads only its own structures' bonds.
  const byComp = new Map<number, number[]>();
  m.bonds.forEach((b, n) => { if (ratio[n] > 0 && comp[b.atoms[0]] !== undefined) { const c = comp[b.atoms[0]]; const l = byComp.get(c); if (l) l.push(n); else byComp.set(c, [n]); } });
  const out = { atoms: m.atoms, comp, ratio, byComp };
  known.set(m.bonds, out);
  return out;
}
// The drawing length of a 1.52 Å bond for the structures these atoms are in: the median of (length / ratio) over
// their bonds, in 3D. A structure with no bonds (a lone atom) takes its atom's scale.
// With no atom end, a bond length of the drawing (its document's) is 1.52 Å.
function unitFor(m: Mol, ends: End[], k?: Known, memo?: Map<string, number>): number {
  const atoms = ends.filter(isAtom);
  return atoms.length ? unitOf(m, atoms, k ?? chemistry(m), memo) : 1;
}
function unitOf(m: Mol, atoms: number[], k: Known, memo?: Map<string, number>): number {
  const comps = [...new Set(atoms.map((i) => k.comp[i]))].sort((p, q) => p - q), key = comps.join(" ");
  const had = memo?.get(key);
  if (had !== undefined) return had;
  const out: number[] = [];
  for (const c of comps) for (const n of k.byComp.get(c) ?? []) { const b = m.bonds[n].atoms; out.push(len3(sub3(at3(m, b[0]), at3(m, b[1]))) / k.ratio[n]); }
  const u = out.length ? middleOf(out) || 1 : m.atoms[atoms[0]].scale ?? 1;
  memo?.set(key, u);
  return u;
}
// The value in the middle of a list (the upper of two), as a sort would put it there: Hoare's select, which takes time
// in step with the list's length, not its length times its log.
export function middleOf(v: number[]): number {
  const want = Math.floor(v.length / 2);
  let lo = 0, hi = v.length - 1;
  while (lo < hi) {
    const pivot = v[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (v[i] < pivot) i++;
      while (v[j] > pivot) j--;
      if (i <= j) { [v[i], v[j]] = [v[j], v[i]]; i++; j--; }
    }
    if (want <= j) hi = j; else if (want >= i) lo = i; else break;
  }
  return v[want];
}
// A measurement's value: Å for a length, degrees for an angle (0 to 180) and a dihedral (−180 to 180, by IUPAC's
// sign: positive when the near bond turns clockwise onto the far one, seen along the middle bond). Undefined for an
// angle with a leg of no length, and a dihedral across three atoms in a line. Every end an atom: in 3D, from the
// atoms' depth too. A free end: on the page plane, with no depth for any end.
export function measureValue(m: Mol, ends: End[], unit = unitFor(m, ends)): number | undefined {
  const flat = !ends.every(isAtom), p = ends.map((e): V => (isAtom(e) && !flat ? at3(m, e) : [...endAt(m, e), 0]));
  if (p.length === 2) return (len3(sub3(p[1], p[0])) * CC) / unit;
  if (p.length === 3) {
    const a = sub3(p[0], p[1]), c = sub3(p[2], p[1]), la = len3(a), lc = len3(c);
    if (la < 1e-9 || lc < 1e-9) return undefined;
    return (Math.acos(Math.max(-1, Math.min(1, dot3(a, c) / (la * lc)))) * 180) / Math.PI;
  }
  if (p.length !== 4) return undefined;
  const b1 = sub3(p[1], p[0]), b2 = sub3(p[2], p[1]), b3 = sub3(p[3], p[2]), l1 = len3(b1), l2 = len3(b2), l3 = len3(b3);
  if (l1 < 1e-9 || l2 < 1e-9 || l3 < 1e-9) return undefined;
  const n1 = cross3(b1, b2), n2 = cross3(b2, b3);
  if (len3(n1) < LINEAR * l1 * l2 || len3(n2) < LINEAR * l2 * l3) return undefined;
  return (Math.atan2(l2 * dot3(b1, n2), dot3(n1, n2)) * 180) / Math.PI;
}
// The text: "2.54 Å" (with a no-break space), "109.5°", "−60.2°" (a minus sign), or "–" when there is no value.
export function measureText(kind: MeasureKind, v: number | undefined): string {
  if (v === undefined || !Number.isFinite(v)) return "–";
  const s = v.toFixed(kind === "distance" ? 2 : 1), plain = s.replace(/^-/, "");
  // −0.0 reads 0.0, and ±180.0 is 180.0.
  const sign = s.startsWith("-") && /[1-9]/.test(plain) && plain !== "180.0" ? "−" : "";
  return kind === "distance" ? `${sign}${plain} Å` : `${sign}${plain}°`;
}
// The ends a measurement of this kind takes: Length 2, Angle 3, Dihedral 4.
export const endsFor = (kind: MeasureKind) => KINDS.indexOf(kind) + 2;
// The Measure tool's ends after a click: on the atom under it (on), else a free point at it (at). A dihedral takes atoms
// only. An atom placed already, a point within close of the last end, or a click past the last end places nothing:
// the same list comes back.
export function placeEnd(ends: End[], kind: MeasureKind, on: number | undefined, at: P, close = 0): End[] {
  if (ends.length >= endsFor(kind)) return ends;
  if (on !== undefined) return ends.includes(on) ? ends : [...ends, on];
  const last = ends[ends.length - 1];
  if (kind === "dihedral" || (last !== undefined && !isAtom(last) && Math.hypot(at[0] - last[0], at[1] - last[1]) <= close)) return ends;
  return [...ends, [at[0], at[1]]];
}
// What a screen reader says for it: "Length 2.54 Å".
export const measureName = (c: Caption) => (c.measure ? `${MEASURE_NAMES[kindOf(c.measure.ends.length) ?? "distance"]} ${c.text}` : c.text);

// The atoms in measuring order: as given, unless another order of them is a chain of bonds and the given one is not
// (an angle's middle atom is the one bonded to both others; a dihedral's four run along their bonds), from the end
// given first.
export function chainOrder(m: Mol, atoms: number[]): number[] {
  if (atoms.length < 3) return atoms;
  const mine = new Set(atoms), pairs = new Set<string>();
  for (const b of m.bonds) if (b.type !== HBOND && mine.has(b.atoms[0]) && mine.has(b.atoms[1])) { pairs.add(`${b.atoms[0]} ${b.atoms[1]}`); pairs.add(`${b.atoms[1]} ${b.atoms[0]}`); }
  const chain = (o: number[]) => o.every((x, k) => !k || pairs.has(`${o[k - 1]} ${x}`));
  if (chain(atoms)) return atoms;
  const orders = (rest: number[]): number[][] => (rest.length < 2 ? [rest] : rest.flatMap((x, k) => orders([...rest.slice(0, k), ...rest.slice(k + 1)]).map((o) => [x, ...o])));
  return orders(atoms).find(chain) ?? atoms;
}

// The measurement's frame on the page: its origin and a direction along it (u), with v a quarter turn anticlockwise.
// A length: the middle of its line, along it. An angle: its vertex, along the line halving it (into the angle). A
// dihedral: the middle of its middle bond, along it. A label moved by hand keeps its offset in this frame, so it rides
// with the ends through drags, turns and 3D turns.
export function measureFrame(m: Mol, ends: End[]): { o: P; u: P; v: P } {
  const p = ends.map((e) => endAt(m, e));
  let o: P, u: P | undefined;
  if (p.length === 3) {
    const a = unit(sub(p[0], p[1])), c = unit(sub(p[2], p[1]));
    o = p[1];
    u = a && c ? unit(add(a, c)) ?? perp(a) : a ?? c;
  } else {
    const [s, t] = p.length === 2 ? [p[0], p[1]] : [p[1], p[2]];
    o = mul(add(s, t), 0.5);
    u = unit(sub(t, s));
  }
  u ??= [1, 0];
  return { o, u, v: perp(u) };
}

// Where a label goes when it has not been moved by hand (its middle), for a label w by h (bond lengths): the nearest
// place clear of the bonds, the atoms and the labels placed before it (taken), out along its frame. A distance's and a
// dihedral's, beside the middle of the line (the middle bond): first on the side with fewer of the atoms near it (with as
// many each side, above), then the other side, a step further each time. An angle's, inside the angle past its arc, then
// outside past its middle atom. Where nothing is clear, the place with the fewest in the way.
type Box = [number, number, number, number];
const STEP = 0.25, FAR = 3;
function autoPlace(m: Mol, atoms: End[], f: { o: P; u: P; v: P }, w: number, h: number, near: (i: number) => number[], taken: Box[]): P {
  let fewest = Infinity;
  const space = spaceOf(m, f.o, FAR + Math.max(w, h) + 1);
  const reach = (d: P) => (Math.abs(d[0]) * w) / 2 + (Math.abs(d[1]) * h) / 2;
  let ways: { d: P; from: number }[];
  if (atoms.length === 3) {
    const out = mul(f.u, -1), vertex = isAtom(atoms[1]) && labelled(m.atoms[atoms[1]]) ? 0.35 : 0.1;
    ways = [{ d: f.u, from: ARC + GAP + reach(f.u) }, { d: out, from: vertex + GAP + reach(out) }];
  } else {
    const mine = new Set(atoms), others = new Set<number>();
    for (const i of atoms) if (isAtom(i)) for (const j of near(i)) if (!mine.has(j)) others.add(j);
    if (atoms.length === 4 && isAtom(atoms[0]) && isAtom(atoms[3])) { others.add(atoms[0]); others.add(atoms[3]); }
    let score = 0;
    for (const j of others) { const s = cross(f.u, sub(at2(m, j), f.o)); if (Math.abs(s) > 1e-6) score += Math.sign(s); }
    const side = score > 0 ? -1 : score < 0 ? 1 : f.v[1] > 1e-9 || (Math.abs(f.v[1]) <= 1e-9 && f.v[0] < 0) ? 1 : -1;
    ways = [mul(f.v, side), mul(f.v, -side)].map((d) => ({ d, from: GAP + reach(d) }));
  }
  // How much is in the way at a place: counted only as far as the fewest found so far. Another measurement's label
  // counts within GAP of it, so two labels never touch and read as one.
  const hits = (c: P) => {
    const bx: Box = [c[0] - w / 2, c[1] - h / 2, c[0] + w / 2, c[1] + h / 2];
    let n = 0;
    for (const t of taken) if (t[0] - GAP < bx[2] && t[2] + GAP > bx[0] && t[1] - GAP < bx[3] && t[3] + GAP > bx[1] && (n += 2) >= fewest) return n;
    return n + space.count(bx, fewest - n);
  };
  // An angle tries inside first, a little way, before outside; a line takes its two sides in turn.
  const order: P[] = [];
  const along = (k: number, n: number) => { const x = ways[k]; return add(f.o, mul(x.d, x.from + n * STEP)); };
  const steps = Math.round(FAR / STEP);
  if (atoms.length === 3) { for (let n = 0; n <= 4; n++) order.push(along(0, n)); for (let n = 0; n <= steps; n++) order.push(along(1, n)); for (let n = 5; n <= steps; n++) order.push(along(0, n)); }
  else for (let n = 0; n <= steps; n++) order.push(along(0, n), along(1, n));
  let best = order[0];
  for (const c of order) { const n = hits(c); if (n < fewest) { [best, fewest] = [c, n]; if (!n) break; } }
  return best;
}
// The bonds and atoms of a drawing within r of a point (bond lengths, each way), so a label tried near it tests only
// what is near: how many bonds cross a box, and how many atoms (with a label's room round them) are in it, counted as
// far as most.
type Space = { count: (b: Box, most?: number) => number };
function spaceOf(m: Mol, o: P, r: number): Space {
  const segs: number[] = [], points: number[] = [], inside = (x: number, y: number) => Math.abs(x - o[0]) <= r && Math.abs(y - o[1]) <= r;
  for (const b of m.bonds) {
    const p = m.atoms[b.atoms[0]]?.location, q = m.atoms[b.atoms[1]]?.location;
    if (p && q && (inside(p[0], p[1]) || inside(q[0], q[1]))) segs.push(p[0], p[1], q[0], q[1]);
  }
  for (const a of m.atoms) if (!a.centre && inside(a.location[0], a.location[1])) points.push(a.location[0], a.location[1], labelled(a) ? 0.35 : 0.08);
  return {
    count: (bx, most = Infinity) => {
      let n = 0;
      for (let k = 0; k < points.length; k += 3) { const x = points[k], y = points[k + 1], e = points[k + 2]; if (x > bx[0] - e && x < bx[2] + e && y > bx[1] - e && y < bx[3] + e && ++n >= most) return n; }
      for (let k = 0; k < segs.length; k += 4) if (crosses([segs[k], segs[k + 1]], [segs[k + 2], segs[k + 3]], bx) && ++n >= most) return n;
      return n;
    },
  };
}
// Whether a line from p to q passes through a box (Liang and Barsky's clip).
function crosses(p: P, q: P, b: Box): boolean {
  let t0 = 0, t1 = 1;
  const d = sub(q, p);
  for (const [den, num] of [[-d[0], p[0] - b[0]], [d[0], b[2] - p[0]], [-d[1], p[1] - b[1]], [d[1], b[3] - p[1]]]) {
    if (Math.abs(den) < 1e-12) { if (num < 0) return false; continue; }
    const t = num / den;
    if (den < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1;
}
// Each atom's bonded neighbours, for the drawing's bonds: without hydrogen bonds, or with them (all).
const neighbourLists = [new WeakMap<Bond[], number[][]>(), new WeakMap<Bond[], number[][]>()];
function neighboursOf(m: Mol, all = false): (i: number) => number[] {
  const cache = neighbourLists[all ? 1 : 0];
  let near = cache.get(m.bonds);
  if (!near || near.length < m.atoms.length) {
    near = m.atoms.map(() => []);
    for (const b of m.bonds) if ((all || b.type !== HBOND) && near[b.atoms[0]] && near[b.atoms[1]]) { near[b.atoms[0]].push(b.atoms[1]); near[b.atoms[1]].push(b.atoms[0]); }
    cache.set(m.bonds, near);
  }
  return (i) => near![i] ?? [];
}

const sameEnd = (a: End, b: End) => a === b || (!isAtom(a) && !isAtom(b) && a[0] === b[0] && a[1] === b[1]);
export const sameEnds = (a: End[], b: End[]) => a === b || (a.length === b.length && a.every((x, k) => sameEnd(x, b[k])));
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
// A measurement's free ends moved by f (a move, turn, flip or scale of what it is part of). The same object when it has none.
export const moveEnds = (x: Measure, f: (q: P) => P): Measure => (x.ends.every(isAtom) ? x : { ...x, ends: x.ends.map((e) => (isAtom(e) ? e : f(e))) });
// Each measurement after an edit: its value and text worked out from its ends, and its label placed (or, when the
// edit moved the label alone, its offset kept). A label moved by the same step as every one of its atoms (or with no
// atom end) takes its free ends with it: the measurement was moved whole. A measurement that is not sound
// (soundMeasure) becomes plain text. before: the drawing the edit started from (none when a drawing is opened or pasted).
// docStyle: the document's style, when the drawing does not carry it (a file being read). kept: a drawing read from a
// file, whose labels stay where the file has them (where Octet placed them when it saved), so it opens as it was
// saved; only their values are worked out again. Returns after itself when nothing changes, and at once when it has no
// measurement.
export function settleMeasures(before: Mol | undefined, after: Mol, docStyle?: DocStyle, kept = false): Mol {
  const cs = after.captions;
  if (!cs?.some(isMeasure)) return after;
  const k = chemistry(after), memo = new Map<string, number>(), style = docStyle ?? after.style ?? DEFAULT_STYLE, around = neighboursOf(after);
  const was = before?.captions?.some(isMeasure) ? new Map(before.captions.filter(isMeasure).map((c) => [c.id, c])) : undefined;
  let changed = false;
  const taken: Box[] = [];
  // The structures with an atom the edit changed. A measurement settled before whose structures it left alone, and
  // whose label it did not touch, stays as it is (a drag frame works out only the measurements it moves).
  const touched = before && before.bonds === after.bonds && before.atoms.length === after.atoms.length && before.style === after.style ? new Set<number>() : undefined;
  if (touched) after.atoms.forEach((a, i) => { if (a !== before!.atoms[i]) touched.add(k.comp[i]); });
  const box = (c: Caption, text: string): Box => {
    const size = (c.size ?? style.captionSize) / style.bond, w = widthOf(text, size), h = (ASCENT + DESCENT) * size, shift = c.align === "left" || c.align === "justify" ? w / 2 : c.align === "right" ? -w / 2 : 0;
    const m: P = [c.x + shift, c.y + ((ASCENT - DESCENT) / 2) * size];
    return [m[0] - w / 2, m[1] - h / 2, m[0] + w / 2, m[1] + h / 2];
  };
  const out = cs.map((c) => {
    if (!c.measure) return c;
    if (!soundMeasure(c.measure, after.atoms.length)) { changed = true; const { measure: _, ...plain } = c; return plain; }
    const p = was?.get(c.id);
    if (touched && p === c && c.chemical === false && !c.runs && atomEnds(c.measure).every((i) => !touched.has(k.comp[i]))) {
      if (taken.length < 100) taken.push(box(c, c.text));
      return c;
    }
    if (kept) {
      const text = measureText(kindOf(c.measure.ends.length)!, measureValue(after, c.measure.ends, unitFor(after, c.measure.ends, k, memo)));
      if (taken.length < 100) taken.push(box(c, text));
      if (text === c.text && c.chemical === false && !c.runs) return c;
      changed = true;
      const { runs: _r, ...rest } = c;
      return { ...rest, text, chemical: false as const };
    }
    let ends = c.measure.ends;
    if (p && before && !ends.every(isAtom) && sameEnds(p.measure.ends, ends)) {
      const d: P = [c.x - p.x, c.y - p.y], by = (i: number) => { const a = before.atoms[i]?.location, b = after.atoms[i].location; return !!a && near(b[0] - a[0], d[0]) && near(b[1] - a[1], d[1]); };
      if ((!near(d[0], 0) || !near(d[1], 0)) && ends.every((e) => !isAtom(e) || by(e))) ends = ends.map((e) => (isAtom(e) ? e : [e[0] + d[0], e[1] + d[1]]));
    }
    const kind = kindOf(ends.length)!, text = measureText(kind, measureValue(after, ends, unitFor(after, ends, k, memo)));
    const size = (c.size ?? style.captionSize) / style.bond, w = widthOf(text, size), lift = ((ASCENT - DESCENT) / 2) * size;
    // The label's middle from its anchor, and back, by its alignment.
    const shift = c.align === "left" || c.align === "justify" ? w / 2 : c.align === "right" ? -w / 2 : 0;
    const f = measureFrame(after, ends), prev = was?.get(c.id);
    let at = c.measure.at, middle: P;
    if (prev && sameEnds(prev.measure.ends, ends) && (!near(prev.x, c.x) || !near(prev.y, c.y))) {
      // Moved alone: it stays where it was put, and keeps that place in its frame from now on.
      middle = [c.x + shift, c.y + lift];
      const d = sub(middle, f.o);
      at = [Math.round(dot(d, f.u) * 1e6) / 1e6, Math.round(dot(d, f.v) * 1e6) / 1e6];
    } else middle = at ? add(f.o, add(mul(f.u, at[0]), mul(f.v, at[1]))) : autoPlace(after, ends, f, w, (ASCENT + DESCENT) * size, around, taken);
    // (The first hundred labels keep clear of each other: a hostile file of thousands costs no more than that.)
    if (taken.length < 100) taken.push([middle[0] - w / 2, middle[1] - ((ASCENT + DESCENT) * size) / 2, middle[0] + w / 2, middle[1] + ((ASCENT + DESCENT) * size) / 2]);
    const x = middle[0] - shift, y = middle[1] - lift, same = c.text === text && near(c.x, x) && near(c.y, y) && at === c.measure.at && ends === c.measure.ends && !c.runs && c.chemical === false;
    if (same) return c;
    changed = true;
    const { runs: _r, ...rest } = c;
    return { ...rest, text, x, y, chemical: false as const, measure: at ? { ends: ends, at } : { ends: ends } };
  });
  return changed ? { ...after, captions: out } : after;
}

// A measurement's lines on the page (bond lengths, y up): a dashed line between each two ends in a row that no bond
// joins, each atom end cut back by trim (to clear a label), and an angle's arc at its vertex (from one leg round to the
// other, the short way). The value and the label are the caption's.
export type MeasureInk = { lines: [P, P][]; arc?: { centre: P; r: number; start: number; sweep: number } };
export function measureInk(m: Mol, ends: End[], trim: (i: number) => number = () => 0): MeasureInk {
  const near = neighboursOf(m, true), lines: [P, P][] = [], gone = ends.some((e) => isAtom(e) && e >= m.atoms.length), cut = (e: End) => (isAtom(e) ? trim(e) : 0);
  if (gone) return { lines };
  for (let k = 1; k < ends.length; k++) {
    const [i, j] = [ends[k - 1], ends[k]];
    if (isAtom(i) && isAtom(j) && near(i).includes(j)) continue;
    const s = endAt(m, i), t = endAt(m, j), u = unit(sub(t, s)), a = cut(i), b = cut(j), l = len(sub(t, s));
    if (u && l - a - b > 1e-6) lines.push([add(s, mul(u, a)), sub(t, mul(u, b))]);
  }
  if (ends.length !== 3) return { lines };
  const [a, o, c] = ends.map((e) => endAt(m, e)), ua = unit(sub(a, o)), uc = unit(sub(c, o));
  if (!ua || !uc) return { lines };
  const start = Math.atan2(ua[1], ua[0]), sweep = Math.atan2(cross(ua, uc), dot(ua, uc));
  return { lines, arc: { centre: o, r: Math.max(ARC, cut(ends[1]) + 0.1), start, sweep } };
}
// Whether an atom shows a label, which a measurement's line stops short of.
export const labelled = (a: Atom) => a.label !== "C" || !!a.text || !!a.shown;
// An arc as points along it.
export const arcPoints = (a: NonNullable<MeasureInk["arc"]>, n = 24): P[] =>
  Array.from({ length: n + 1 }, (_, k) => { const t = a.start + (a.sweep * k) / n; return [a.centre[0] + a.r * Math.cos(t), a.centre[1] + a.r * Math.sin(t)]; });

// A measurement copied or moved to new atom numbers, its free ends as they are: undefined when `to` leaves out any of
// its atoms (it cannot be measured without them), or two of them become one.
export function remapMeasure(x: Measure, to: (i: number) => number | undefined): Measure | undefined {
  const ends = x.ends.map((e) => (isAtom(e) ? to(e) : e)), atoms = ends.filter((e) => typeof e === "number");
  if (ends.some((e) => e === undefined) || new Set(atoms).size !== atoms.length) return undefined;
  return { ...x, ends: ends as End[] };
}
// A caption with its measurement remapped, or as plain text when the measurement cannot go with it (a label copied
// without its atoms). Other captions as they are.
export function remapCaption(c: Caption, to: (i: number) => number | undefined): Caption {
  if (!c.measure) return c;
  const measure = remapMeasure(c.measure, to);
  if (measure) return { ...c, measure };
  const { measure: _, ...plain } = c;
  return plain;
}
