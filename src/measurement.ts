// Measurements (issue 85): the distance between two atoms, the angle at three and the dihedral across four, each a
// text that belongs to its atoms (a caption with measure). The value comes from the atoms as drawn now, in 3D (x, y
// and depth), every time the drawing changes; the text in a file is only a copy for other programs. Dashed lines join
// the atoms that no bond joins, and an angle has an arc at its middle atom (measureInk).
//
// The Å scale is 3D Clean Up's own unit (clean3d.ts): a bond's real length over a C–C single bond's (its ratio), so
// a structure's median of (length / ratio) is the length of a 1.52 Å bond. Scaling the drawing or changing the style
// never changes a value, and a bond reads the length 3D Clean Up gives it.
import { bondRatios, clean3d, MOST_3D } from "./clean3d.ts";
import { keepHands } from "./cip.ts";
import { widthOf } from "./arial.ts";
import { DEFAULT_STYLE, type DocStyle } from "./docstyle.ts";
import { addCaption } from "./edit.ts";
import { ASCENT, DESCENT, HBOND, type Atom, type Bond, type Caption, type Measure, type Mol } from "./render.ts";

export type MeasureKind = "distance" | "angle" | "dihedral";
// By the number of atoms less 2.
export const KINDS: MeasureKind[] = ["distance", "angle", "dihedral"];
export const kindOf = (atoms: number): MeasureKind | undefined => KINDS[atoms - 2];
export const MEASURE_NAMES: Record<MeasureKind, string> = { distance: "Distance", angle: "Angle", dihedral: "Dihedral" };
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

// A measure that can stand in a drawing of n atoms: 2 to 4 distinct atoms, and a label offset within 1000 bond
// lengths. Anything else (a damaged or hostile file) is not a measurement.
export function soundMeasure(x: unknown, n: number): x is Measure {
  if (typeof x !== "object" || x === null) return false;
  const { atoms, at } = x as { atoms?: unknown; at?: unknown };
  if (!Array.isArray(atoms) || atoms.length < 2 || atoms.length > 4 || new Set(atoms).size !== atoms.length) return false;
  if (!atoms.every((i) => Number.isInteger(i) && i >= 0 && i < n)) return false;
  return at === undefined || (Array.isArray(at) && at.length === 2 && at.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1000));
}
// A caption that is a measurement.
export const isMeasure = (c: Caption): c is Caption & { measure: Measure } => !!c.measure;

// What the values need of each structure, worked out once for its bonds and elements: each atom's structure (its
// bonds, and a multi-centre point's atoms) and each bond's ratio. A drag or a turn changes only the atoms' places, so
// it finds the same entry (the bonds list is the same, and each atom is the same element).
type Known = { atoms: Atom[]; comp: Int32Array; ratio: Float64Array };
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
  const out = { atoms: m.atoms, comp, ratio };
  known.set(m.bonds, out);
  return out;
}
// The drawing length of a 1.52 Å bond for the structures these atoms are in: the median of (length / ratio) over
// their bonds, in 3D. A structure with no bonds (a lone atom) takes its atom's scale.
function unitOf(m: Mol, atoms: number[], k: Known, memo?: Map<string, number>): number {
  const comps = [...new Set(atoms.map((i) => k.comp[i]))].sort((p, q) => p - q), key = comps.join(" ");
  const had = memo?.get(key);
  if (had !== undefined) return had;
  const mine = new Set(comps), out: number[] = [];
  m.bonds.forEach((b, n) => {
    const r = k.ratio[n];
    if (r > 0 && mine.has(k.comp[b.atoms[0]])) out.push(len3(sub3(at3(m, b.atoms[0]), at3(m, b.atoms[1]))) / r);
  });
  out.sort((p, q) => p - q);
  const u = out.length ? out[Math.floor(out.length / 2)] || 1 : m.atoms[atoms[0]].scale ?? 1;
  memo?.set(key, u);
  return u;
}
// A measurement's value: Å for a distance, degrees for an angle (0 to 180) and a dihedral (−180 to 180, by IUPAC's
// sign: positive when the near bond turns clockwise onto the far one, seen along the middle bond). Undefined for an
// angle with a leg of no length, and a dihedral across three atoms in a line.
export function measureValue(m: Mol, atoms: number[], unit = unitOf(m, atoms, chemistry(m))): number | undefined {
  const p = atoms.map((i) => at3(m, i));
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
// What a screen reader says for it: "Distance 2.54 Å".
export const measureName = (c: Caption) => (c.measure ? `${MEASURE_NAMES[kindOf(c.measure.atoms.length) ?? "distance"]} ${c.text}` : c.text);

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
// A distance: the middle of its line, along it. An angle: its middle atom, along the line halving it (into the angle). A
// dihedral: the middle of its middle bond, along it. A label moved by hand keeps its offset in this frame, so it rides
// with the atoms through drags, turns and 3D turns.
export function measureFrame(m: Mol, atoms: number[]): { o: P; u: P; v: P } {
  const p = atoms.map((i) => at2(m, i));
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

// Where a label goes when it has not been moved by hand (its middle), for a label w by h (bond lengths). An angle's,
// inside the angle past its arc. A distance's and a dihedral's, beside the middle of the line (the middle bond), on
// the side with fewer of the atoms near it; with as many each side, above.
function autoPlace(m: Mol, atoms: number[], f: { o: P; u: P; v: P }, w: number, h: number, near: (i: number) => number[]): P {
  const reach = (d: P) => (Math.abs(d[0]) * w) / 2 + (Math.abs(d[1]) * h) / 2;
  if (atoms.length === 3) return add(f.o, mul(f.u, ARC + GAP + reach(f.u)));
  const mine = new Set(atoms), others = new Set<number>();
  for (const i of atoms) for (const j of near(i)) if (!mine.has(j)) others.add(j);
  if (atoms.length === 4) { others.add(atoms[0]); others.add(atoms[3]); }
  let score = 0;
  for (const j of others) { const s = cross(f.u, sub(at2(m, j), f.o)); if (Math.abs(s) > 1e-6) score += Math.sign(s); }
  const side = score > 0 ? -1 : score < 0 ? 1 : f.v[1] > 1e-9 || (Math.abs(f.v[1]) <= 1e-9 && f.v[0] < 0) ? 1 : -1;
  const d = mul(f.v, side);
  return add(f.o, mul(d, GAP + reach(d)));
}
// Each atom's bonded neighbours (no hydrogen bonds), for the drawing's bonds.
const neighbourLists = new WeakMap<Bond[], number[][]>();
function neighboursOf(m: Mol): (i: number) => number[] {
  let near = neighbourLists.get(m.bonds);
  if (!near || near.length < m.atoms.length) {
    near = m.atoms.map(() => []);
    for (const b of m.bonds) if (b.type !== HBOND && near[b.atoms[0]] && near[b.atoms[1]]) { near[b.atoms[0]].push(b.atoms[1]); near[b.atoms[1]].push(b.atoms[0]); }
    neighbourLists.set(m.bonds, near);
  }
  return (i) => near![i] ?? [];
}

const sameAtoms = (a: number[], b: number[]) => a.length === b.length && a.every((x, k) => x === b[k]);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
// Each measurement after an edit: its value and text worked out from its atoms, and its label placed (or, when the
// edit moved the label alone, its offset kept). A measurement whose atoms are not 2 to 4 distinct atoms of the
// drawing becomes plain text. before: the drawing the edit started from (none when a drawing is opened or pasted).
// docStyle: the document's style, when the drawing does not carry it (a file being read). Returns after itself when
// nothing changes, and at once when it has no measurement.
export function settleMeasures(before: Mol | undefined, after: Mol, docStyle?: DocStyle): Mol {
  const cs = after.captions;
  if (!cs?.some(isMeasure)) return after;
  const k = chemistry(after), memo = new Map<string, number>(), style = docStyle ?? after.style ?? DEFAULT_STYLE, around = neighboursOf(after);
  const was = before?.captions?.some(isMeasure) ? new Map(before.captions.filter(isMeasure).map((c) => [c.id, c])) : undefined;
  let changed = false;
  const out = cs.map((c) => {
    if (!c.measure) return c;
    if (!soundMeasure(c.measure, after.atoms.length)) { changed = true; const { measure: _, ...plain } = c; return plain; }
    const atoms = c.measure.atoms, kind = kindOf(atoms.length)!, text = measureText(kind, measureValue(after, atoms, unitOf(after, atoms, k, memo)));
    const size = (c.size ?? style.captionSize) / style.bond, w = widthOf(text, size), lift = ((ASCENT - DESCENT) / 2) * size;
    // The label's middle from its anchor, and back, by its alignment.
    const shift = c.align === "left" || c.align === "justify" ? w / 2 : c.align === "right" ? -w / 2 : 0;
    const f = measureFrame(after, atoms), prev = was?.get(c.id);
    let at = c.measure.at, middle: P;
    if (prev && sameAtoms(prev.measure.atoms, atoms) && (!near(prev.x, c.x) || !near(prev.y, c.y))) {
      // Moved alone: it stays where it was put, and keeps that place in its frame from now on.
      middle = [c.x + shift, c.y + lift];
      const d = sub(middle, f.o);
      at = [Math.round(dot(d, f.u) * 1e6) / 1e6, Math.round(dot(d, f.v) * 1e6) / 1e6];
    } else middle = at ? add(f.o, add(mul(f.u, at[0]), mul(f.v, at[1]))) : autoPlace(after, atoms, f, w, (ASCENT + DESCENT) * size, around);
    const x = middle[0] - shift, y = middle[1] - lift, same = c.text === text && near(c.x, x) && near(c.y, y) && at === c.measure.at && !c.runs && c.chemical === false;
    if (same) return c;
    changed = true;
    const { runs: _r, ...rest } = c;
    return { ...rest, text, x, y, chemical: false as const, measure: at ? { atoms, at } : { atoms } };
  });
  return changed ? { ...after, captions: out } : after;
}

// A measurement's lines on the page (bond lengths, y up): a dashed line between each two atoms in a row that no bond
// joins, each end cut back by trim (to clear a label), and an angle's arc at its middle atom (from one leg round to
// the other, the short way). The value and the label are the caption's.
export type MeasureInk = { lines: [P, P][]; arc?: { centre: P; r: number; start: number; sweep: number } };
export function measureInk(m: Mol, atoms: number[], trim: (i: number) => number = () => 0): MeasureInk {
  const bonded = new Set<string>(), mine = new Set(atoms);
  for (const b of m.bonds) if (mine.has(b.atoms[0]) && mine.has(b.atoms[1])) { bonded.add(`${b.atoms[0]} ${b.atoms[1]}`); bonded.add(`${b.atoms[1]} ${b.atoms[0]}`); }
  const lines: [P, P][] = [];
  for (let k = 1; k < atoms.length; k++) {
    const [i, j] = [atoms[k - 1], atoms[k]];
    if (bonded.has(`${i} ${j}`) || i >= m.atoms.length || j >= m.atoms.length) continue;
    const s = at2(m, i), t = at2(m, j), u = unit(sub(t, s)), a = trim(i), b = trim(j), l = len(sub(t, s));
    if (u && l - a - b > 1e-6) lines.push([add(s, mul(u, a)), sub(t, mul(u, b))]);
  }
  if (atoms.length !== 3 || atoms.some((i) => i >= m.atoms.length)) return { lines };
  const [a, o, c] = atoms.map((i) => at2(m, i)), ua = unit(sub(a, o)), uc = unit(sub(c, o));
  if (!ua || !uc) return { lines };
  const start = Math.atan2(ua[1], ua[0]), sweep = Math.atan2(cross(ua, uc), dot(ua, uc));
  return { lines, arc: { centre: o, r: Math.max(ARC, trim(atoms[1]) + 0.1), start, sweep } };
}
// Whether an atom shows a label, which a measurement's line stops short of.
export const labelled = (a: Atom) => a.label !== "C" || !!a.text || !!a.shown;
// An arc as points along it.
export const arcPoints = (a: NonNullable<MeasureInk["arc"]>, n = 24): P[] =>
  Array.from({ length: n + 1 }, (_, k) => { const t = a.start + (a.sweep * k) / n; return [a.centre[0] + a.r * Math.cos(t), a.centre[1] + a.r * Math.sin(t)]; });

// A measurement copied or moved to new atom numbers: undefined when `to` leaves out any of its atoms (it cannot be
// measured without them), or two of them become one.
export function remapMeasure(x: Measure, to: (i: number) => number | undefined): Measure | undefined {
  const atoms = x.atoms.map(to);
  if (atoms.some((i) => i === undefined) || new Set(atoms).size !== atoms.length) return undefined;
  return { ...x, atoms: atoms as number[] };
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

// The structures (by their atoms) these atoms are in.
export function structuresOf(m: Mol, atoms: number[]): number[][] {
  const k = chemistry(m), want = new Set(atoms.map((i) => k.comp[i])), out = new Map<number, number[]>();
  k.comp.forEach((c, i) => { if (want.has(c)) { const g = out.get(c) ?? []; g.push(i); out.set(c, g); } });
  return [...out.values()];
}
// A structure drawn flat: no atom has depth, and none has depth shading (3D Clean Up turns it on, so a structure that
// is flat in 3D, such as anti butane, is not cleaned up again each time).
const flatAtoms = (m: Mol, g: number[]) => g.every((i) => Math.abs(m.atoms[i].location[2] ?? 0) < 1e-6 && !m.atoms[i].shade);

// The drawing with the structures these atoms are in cleaned up in 3D, as 3D Clean Up does it, where they are drawn
// flat, so a measurement of them has a real value. A structure of more than MOST_3D atoms stays flat (tooBig).
export function cleanedFor(m: Mol, atoms: number[]): { mol: Mol; cleaned: number[][]; tooBig: boolean } {
  let mol = m, tooBig = false;
  const cleaned: number[][] = [];
  for (const g of structuresOf(m, atoms)) {
    if (g.length < 2 || !flatAtoms(m, g)) continue;
    if (g.length > MOST_3D) { tooBig = true; continue; }
    mol = keepHands(mol, clean3d(mol, g), g);
    cleaned.push(g);
  }
  return { mol, cleaned, tooBig };
}

// Makes a measurement of these atoms (2 a distance, 3 an angle, 4 a dihedral), in the order given (order "pick", the
// Measure tool's) or along their bonds (chainOrder: the menu's and an AI app's). A structure drawn flat is first cleaned
// up in 3D (cleanedFor). The same measurement asked for again (the same atoms, either way round) is the one there
// (made false). A string says why there is none.
export type Made = { mol: Mol; id: number; made: boolean; cleaned: number[][]; tooBig: boolean };
export function addMeasure(m: Mol, atoms: number[], order: "pick" | "chain" = "chain"): Made | string {
  if (atoms.length < 2 || atoms.length > 4) return "A measurement takes 2 to 4 atoms.";
  if (new Set(atoms).size !== atoms.length) return "A measurement takes each atom once.";
  if (!atoms.every((i) => Number.isInteger(i) && i >= 0 && i < m.atoms.length)) return "That atom is not in the drawing.";
  const ordered = order === "pick" ? atoms : chainOrder(m, atoms), back = [...ordered].reverse();
  const there = m.captions?.find((c) => c.measure && (sameAtoms(c.measure.atoms, ordered) || sameAtoms(c.measure.atoms, back)));
  if (there) return { mol: m, id: there.id, made: false, cleaned: [], tooBig: false };
  const { mol, cleaned, tooBig } = cleanedFor(m, ordered);
  const [made, id] = addCaption(mol, { text: "–", x: 0, y: 0, chemical: false, measure: { atoms: ordered } });
  return { mol: settleMeasures(undefined, made), id, made: true, cleaned, tooBig };
}
