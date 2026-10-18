// Editing operations on a drawing. Each returns a new Mol and leaves the old one alone, so undo is a list of Mols.
// Coordinates are in bond lengths with y up, the same as KET.
import { hydrogens, lonePairs, tableLayout, TABLE_ROW, type Arrow, type Atom, type Bond, type Caption, type Mol, type Shape, type Table } from "./render.ts";
import type { Cycle } from "./cycle.ts";
import { anchorElement, isElement } from "./labels.ts";

export type P = [number, number];
export const EMPTY: Mol = { atoms: [], bonds: [] };

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const unit = (a: P): P => mul(a, 1 / (len(a) || 1));
const rot = (a: P, t: number): P => [a[0] * Math.cos(t) - a[1] * Math.sin(t), a[0] * Math.sin(t) + a[1] * Math.cos(t)];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const deg = Math.PI / 180;

export const pos = (m: Mol, i: number): P => [m.atoms[i].location[0], m.atoms[i].location[1]];
export const neighbours = (m: Mol, i: number) =>
  m.bonds.flatMap((b) => (b.atoms[0] === i ? [b.atoms[1]] : b.atoms[1] === i ? [b.atoms[0]] : []));
// Each atom's neighbours, in bond order (as neighbours() gives them), made in one pass over the bonds.
export function bondedTo(m: Mol): number[][] {
  const near: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) { near[b.atoms[0]]?.push(b.atoms[1]); near[b.atoms[1]]?.push(b.atoms[0]); }
  return near;
}
// A drawing with more atoms than this is large. Checks that look at each atom's neighbours, or at atoms and bonds in
// pairs, then use a list or a grid made once, not the plain loops. Measured in node on rings of 6 atoms: at 100 atoms
// the plain loops take about 0.4 ms, at 200 atoms 1.5 ms and at 1000 atoms 45 ms (they grow with the square of the
// size); the list and the grid take 0.06, 0.12 and 1.2 ms.
export const LARGE = 100;
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
    // Zig-zag: put the new bond on the other side of this bond from the previous one (as ChemDraw, only when the
    // neighbour is in a chain, with one other bond).
    const prev = neighbours(m, ns[0]).filter((j) => j !== i);
    if (prev.length === 1) {
      const axis = sub(here, pos(m, ns[0])), side = Math.sign(cross(axis, sub(pos(m, prev[0]), pos(m, ns[0]))));
      return Math.sign(cross(axis, a)) === side ? b : a;
    }
    // Otherwise ChemDraw's rule: the turn depends on which 45° sector the bond points into (its angle measured with
    // y down, as ChemDraw measures it).
    return Math.floor((Math.atan2(-dirs[0][1], dirs[0][0]) / Math.PI + 1) * 4) % 2 ? a : b;
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
// side: the click was on the left (-1) or right (1) end of the atom's label, so the bond leaves that end (the next
// direction turned to that side, when no bond is near that way).
export function sprout(m: Mol, from: number | P, spec: BondSpec = SINGLE, side = 0): Mol {
  if (typeof from !== "number") return bondTo(m, from, add(from, [Math.cos(30 * deg), Math.sin(30 * deg)]), spec);
  let d = nextDirection(m, from);
  const here = pos(m, from), turned: P = [-d[0], d[1]];
  if (side && Math.sign(d[0]) === -side && neighbours(m, from).every((j) => dot(unit(sub(pos(m, j), here)), turned) < Math.cos(60 * deg))) d = turned;
  return bondTo(m, from, add(here, d), spec);
}

// A zig-zag chain from atom i (or a point) toward q: the points after the start, one bond per 0.866 bond lengths of
// the drag, each bond at ±30° to the chain's axis so every angle is 120°. From empty canvas or a lone atom the axis is
// the drag, and the first bond goes to side (1 left of the drag, -1 right: the side the pointer is on, so a drag
// back across the axis flips it, as in ChemDraw). From an atom with bonds the first bond is at 120° to them (as
// nextDirection gives it, or either way off a chain end) and the axis is the one of those chains nearest the drag.
export function chainPoints(m: Mol, from: number | P, q: P, side = 1): P[] {
  const start = typeof from === "number" ? pos(m, from) : from, drag = sub(q, start), along = len(drag);
  const count = Math.max(1, Math.round(along / Math.cos(30 * deg)));
  const u = along > 1e-9 ? unit(drag) : ([1, 0] as P);
  const ns = typeof from === "number" ? neighbours(m, from) : [];
  // The axis and the first bond's side of it (the unit vector across the axis toward the first bond).
  let axis = u, across: P = mul([-u[1], u[0]], side < 0 ? -1 : 1);
  if (ns.length) {
    const e = unit(sub(pos(m, ns[0]), start)), next = nextDirection(m, from as number);
    const firsts = ns.length === 1 && orderBetween(m, from as number, ns[0]) !== 3 ? [next, rot(e, 120 * deg), rot(e, -120 * deg)] : [next];
    let best = -Infinity;
    for (const f of firsts) for (const t of [30, -30]) {
      const a = rot(f, t * deg), score = dot(a, u);
      if (score > best + 1e-9) { best = score; axis = a; across = unit(sub(f, mul(a, Math.cos(30 * deg)))); }
    }
  }
  return Array.from({ length: count }, (_, k) => add(add(start, mul(axis, (k + 1) * Math.cos(30 * deg))), mul(across, k % 2 ? 0 : 0.5)));
}
// The order of the bond between two atoms (1 when there is none).
const orderBetween = (m: Mol, i: number, j: number) => m.bonds[bondIndex(m, i, j)]?.type ?? 1;
// Bonds from atom i (or a new atom at a point) through each point in turn, joining atoms already there. Returns the
// drawing and the last atom.
export function chainThrough(m: Mol, from: number | P, points: P[]): { mol: Mol; last: number } {
  let last: number;
  if (typeof from === "number") last = from; else [m, last] = atomOrNew(m, from);
  for (const p of points) {
    const before = m.atoms.length;
    m = bondTo(m, last, p);
    last = atomAt(m, p, 0.1) ?? before;
  }
  return { mol: m, last };
}
// A chain dragged toward q (see chainPoints). Returns the drawing, the number of bonds added and the last atom.
export function chainTo(m: Mol, from: number | P, q: P, side = 1): { mol: Mol; bonds: number; last: number } {
  const points = chainPoints(m, from, q, side);
  return { ...chainThrough(m, from, points), bonds: points.length };
}
// The Snaking Chain (the Chain tool with Command held, as in ChemDraw): the chain's points follow the pointer p. Each
// new bond turns 60° from the one before (so every angle is 120°), to the side nearer the pointer, while that brings
// the chain nearer it; when the pointer goes back past the last atom, that atom goes. path: the points so far after
// the start; at least one stays.
export function snake(start: P, path: P[], p: P): P[] {
  const out = [...path], d = (q: P) => len(sub(p, q));
  for (let guard = 0; guard < 200; guard++) {
    const n = out.length, last = out[n - 1], prev = n > 1 ? out[n - 2] : start;
    if (n > 1 && d(prev) < d(last) - 0.25) { out.pop(); continue; }
    const way = unit(sub(last, prev)), next = [rot(way, 60 * deg), rot(way, -60 * deg)].map((w) => add(last, w)).sort((a, b) => d(a) - d(b))[0];
    if (d(last) > 0.75 && d(next) < d(last) - 0.25) { out.push(next); continue; }
    return out;
  }
  return out;
}
// Add Chain (a Chain tool click): a chain of n new atoms from atom i, or of n atoms from a point, each bond going the
// way the next click with the bond tool would (so it zig-zags). Returns the drawing and the last atom.
export function addChain(m: Mol, from: number | P, n: number): { mol: Mol; last: number } {
  let last: number;
  if (typeof from === "number") last = from; else [m, last] = atomOrNew(m, from);
  for (let k = typeof from === "number" ? 0 : 1; k < n; k++) {
    const q = add(pos(m, last), nextDirection(m, last)), before = m.atoms.length;
    m = bondTo(m, last, q);
    last = atomAt(m, q, 0.1) ?? before;
  }
  return { mol: m, last };
}

const setAtom = (m: Mol, i: number, change: Partial<Atom>): Mol => ({ ...m, atoms: m.atoms.map((a, k) => (k === i ? { ...a, ...change } : a)) });
// Marks drawn on an atom that do not change what it is: H dot or hash, attachment squiggle, polymer bead.
export const setAtomMarks = (m: Mol, i: number, change: Pick<Partial<Atom>, "hmark" | "attach" | "bead">) => setAtom(m, i, change);
const setBondAt = (m: Mol, i: number, change: Partial<Bond>): Mol => ({ ...m, bonds: m.bonds.map((b, k) => (k === i ? { ...b, ...change } : b)) });

export const setElement = (m: Mol, i: number, label: string) => setAtom(m, i, { label, text: undefined });
// Sets what an atom reads as. One element symbol makes it that element; anything else (OMe, CO2Et, Ph) is a
// written label attached through its first element, or through carbon for a group. Empty text clears it to carbon.
export function setLabel(m: Mol, i: number, text: string): Mol {
  const t = text.trim();
  if (!t) return setElement(m, i, "C");
  if (isElement(t)) return setElement(m, i, t);
  return setAtom(m, i, { label: anchorElement(t) ?? "C", text: t });
}
export const addCharge = (m: Mol, i: number, delta: number) => trimPairs(setAtom(m, i, { charge: (m.atoms[i].charge ?? 0) + delta || undefined }), i);

// The Symbols tool's marks. A charge adds to the atom's charge, drawn as a superscript sign or circled beside the
// atom. A radical or partial charge toggles. A lone pair adds one more each click, up to the atom's free pairs
// (at least one), and the click after that clears them.
export type SymbolKind = "plus" | "minus" | "circledPlus" | "circledMinus" | "radical" | "pair" | "partialPlus" | "partialMinus"
  | "radicalCation" | "radicalAnion" | "hDot" | "hDash" | "attach" | "bead";
export function addSymbol(m: Mol, i: number, kind: SymbolKind): Mol {
  const a = m.atoms[i];
  switch (kind) {
    case "plus": case "minus": case "circledPlus": case "circledMinus": {
      const charge = (a.charge ?? 0) + (kind === "plus" || kind === "circledPlus" ? 1 : -1);
      return trimPairs(setAtom(m, i, { charge: charge || undefined, circled: charge && kind.startsWith("circled") ? true : undefined }), i);
    }
    case "radical": return trimPairs(setAtom(m, i, { radical: a.radical ? undefined : 1 }), i);
    case "partialPlus": case "partialMinus": { const p = kind === "partialPlus" ? "+" : "-"; return setAtom(m, i, { partial: a.partial === p ? undefined : p }); }
    case "pair": { const n = (a.pairs ?? 0) + 1; return setAtom(m, i, { pairs: n > Math.max(1, freePairs(m, i)) ? undefined : n }); }
    // A radical ion: one unpaired electron and a charge, together. Clicking one again takes both off.
    case "radicalCation": case "radicalAnion": {
      const charge = kind === "radicalCation" ? 1 : -1, on = a.radical === 1 && a.charge === charge;
      return trimPairs(setAtom(m, i, { radical: on ? undefined : 1, charge: on ? undefined : charge, circled: undefined }), i);
    }
    case "hDot": case "hDash": { const h = kind === "hDot" ? "dot" : "dash"; return setAtom(m, i, { hmark: a.hmark === h ? undefined : h }); }
    case "attach": return setAtom(m, i, { attach: !a.attach || undefined });
    case "bead": return setAtom(m, i, { bead: !a.bead || undefined });
  }
}
// Lone pairs shown never outnumber the ones the atom has (after a charge or radical changes them).
const trimPairs = (m: Mol, i: number) => (m.atoms[i].pairs ? setAtom(m, i, { pairs: Math.min(m.atoms[i].pairs!, freePairs(m, i)) || undefined }) : m);
// Each atom's bond orders added up, in one pass over the bonds. An aromatic bond counts 1.5, unless order says else.
export function bondOrders(m: Mol, order = (type: number) => (type === 4 ? 1.5 : type)): number[] {
  const used = m.atoms.map(() => 0);
  for (const { type, atoms: [p, q] } of m.bonds) {
    used[p] += order(type);
    if (q !== p) used[q] += order(type);
  }
  return used;
}
// How many lone pairs an atom has, from its element, bonds, hydrogens, charge and radical. used: its bond orders
// added up (from bondOrders), when they are known.
export function freePairs(m: Mol, i: number, used = bondOrders(m)[i]): number {
  const a = m.atoms[i];
  const h = a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used, a.radical);
  return lonePairs(a.label, a.charge ?? 0, Math.ceil(used), h, a.radical);
}
// Shows the lone pairs on every heteroatom among these atoms; when they all show already, hides them.
export function toggleLonePairs(m: Mol, atoms: number[]): Mol {
  const used = bondOrders(m), hetero = atoms.filter((i) => m.atoms[i].label !== "C" && freePairs(m, i, used[i]) > 0);
  const shown = hetero.every((i) => (m.atoms[i].pairs ?? 0) >= freePairs(m, i, used[i]));
  return hetero.reduce((acc, i) => setAtom(acc, i, { pairs: shown ? undefined : freePairs(m, i, used[i]) }), m);
}
// Single, then double, then triple, then single again. A wedge or hash becomes a plain double.
const respec = (m: Mol, i: number, spec: BondSpec): Mol => ({ ...m, bonds: m.bonds.map((b, k) => (k === i ? makeBond(b.atoms, spec) : b)) });
export const cycleBond = (m: Mol, i: number) => respec(m, i, { type: m.bonds[i].stereo || m.bonds[i].display ? 2 : (m.bonds[i].type % 3) + 1 });
export const setBond = (m: Mol, i: number, type: number, stereo?: number) => respec(m, i, { type, stereo });
export const setBondSpec = (m: Mol, i: number, spec: BondSpec) => respec(m, i, spec);
export const setPosition = (m: Mol, i: number, position: "left" | "centre" | "right") => setBondAt(m, i, { position });
// Swaps a bond's ends, so a wedge points the other way.
export const flipBond = (m: Mol, i: number) => setBondAt(m, i, { atoms: [m.bonds[i].atoms[1], m.bonds[i].atoms[0]] });

// The bond tools on an existing bond, as ChemDraw 26.1 changes it (its ChangeBondType and bond tracker).
// A bond style with a narrow and a wide end (a wedge, a hashed or hollow wedge, a dative arrow).
const pointed = (s: BondSpec) => !!s.stereo || s.display === "hollow" || s.display === "dative";
const sameStyle = (b: Bond, s: BondSpec) => b.type === s.type && (b.stereo ?? 0) === (s.stereo ?? 0) && b.display === s.display;
// Bond k with spec, its ends put so the narrow end is on the atom with more bonds; on a tie the wide end is on the
// atom nearer the point clicked.
function pointedAt(m: Mol, k: number, spec: BondSpec, at: P): Mol {
  const [i, j] = m.bonds[k].atoms, di = neighbours(m, i).length, dj = neighbours(m, j).length;
  const wideAtI = di !== dj ? di < dj : len(sub(at, pos(m, i))) < len(sub(at, pos(m, j)));
  return { ...m, bonds: m.bonds.map((b, n) => (n === k ? makeBond(wideAtI ? [j, i] : [i, j], spec) : b)) };
}
// A double bond's second line with a new style, on the side it was.
const restyle = (m: Mol, k: number, display?: Bond["display"]) => ({ ...m, bonds: m.bonds.map((b, n) => {
  if (n !== k) return b;
  const { display: _, ...rest } = b;
  return display ? { ...rest, display } : rest;
}) });
// The side a click puts a double bond's second line on next, from the side it is drawn on now (side: -1 left, 0
// centred, 1 right of the bond from its first atom, on screen): round centre, one side and the other, in the order
// ChemDraw uses, which looks the same on screen whichever way the bond was drawn.
export function nextSide(m: Mol, k: number, side: number): "left" | "centre" | "right" {
  const [a, b] = m.bonds[k].atoms.map((i) => pos(m, i)), c = a[1] - b[1] <= a[0] - b[0];
  if (side === 0) return c ? "right" : "left";
  if (side > 0) return c ? "left" : "centre";
  return c ? "centre" : "right";
}
// A click with a bond tool (spec) on bond k, at a point. side: where the double bond's second line is drawn now.
// - A double or triple tool sets its bond; on a double bond of its own style it moves the second line instead.
// - A single bond tool on a single bond of its own style makes it double (bold and dashed keep their style), or turns
//   a wedge or dative round. On another single bond it sets its style, a wedge pointing as pointedAt says.
// - On a double bond the Solid, Bold, Dashed and Wavy tools restyle one line, or move the second line when it already
//   has that style: Solid gives a plain double, Bold a bold double, Dashed a dashed double and then an aromatic one,
//   Wavy a double either. The Dative tool makes a single dative bond. The wedge tools leave it as it is.
// - On a triple bond a single bond tool sets its single bond.
export function clickBond(m: Mol, k: number, spec: BondSpec, at: P, side = 0): Mol {
  const b = m.bonds[k], cycle = () => setPosition(m, k, nextSide(m, k, side));
  if (spec.type > 1) return spec.type === 2 && sameStyle(b, spec) ? cycle() : sameStyle(b, spec) ? m : setBondSpec(m, k, spec);
  if (b.type === 1) {
    if (!sameStyle(b, spec)) return pointed(spec) ? pointedAt(m, k, spec, at) : setBondSpec(m, k, spec);
    if (pointed(spec)) return flipBond(m, k);
    return setBondSpec(m, k, { type: 2, ...(spec.display === "bold" || spec.display === "dashed" ? { display: spec.display } : {}) });
  }
  if (b.type !== 2) return pointed(spec) ? pointedAt(m, k, spec, at) : setBondSpec(m, k, spec);
  if (spec.stereo) return m;
  const d = b.display;
  switch (spec.display) {
    case undefined: return d === "bold" || d === "dashed" || d === "aromatic" ? restyle(m, k) : cycle();
    case "bold": return d === "bold" ? cycle() : restyle(m, k, "bold");
    case "dashed": return d === "dashed" ? restyle(m, k, "aromatic") : d === "aromatic" ? cycle() : restyle(m, k, "dashed");
    case "wavy": return d === "either" ? cycle() : restyle(m, k, "either");
    case "dative": return pointedAt(m, k, spec, at);
  }
  return m;
}
// Drawing a bond over an existing one (a bond tool dragged from one of its atoms to the other) raises its order:
// single to double, double to triple, and triple back to the tool's single bond, a wedge narrow at the atom dragged
// from (Octet has no quadruple bond yet; ChemDraw goes on to quadruple first). A single bond becomes a double of the
// tool's style: Bold a bold double, Dashed a dashed double (an aromatic double over a dashed bond), and Solid over a
// dashed bond a dashed double.
export function overBond(m: Mol, k: number, spec: BondSpec, from = m.bonds[k].atoms[0]): Mol {
  const b = m.bonds[k];
  if (b.type === 2) return setBondSpec(m, k, { type: 3 });
  if (b.type !== 1) {
    const single = spec.type === 1 ? spec : SINGLE, to = b.atoms[0] === from ? b.atoms[1] : b.atoms[0];
    return { ...m, bonds: m.bonds.map((x, n) => (n === k ? makeBond([from, to], single) : x)) };
  }
  const d = spec.type === 1 && spec.display === "dashed" ? (b.display === "dashed" ? "aromatic" : "dashed") : spec.type === 1 && spec.display === "bold" ? "bold"
    : spec.type === 1 && !spec.display && !spec.stereo && b.display === "dashed" ? "dashed" : undefined;
  return setBondSpec(m, k, { type: 2, ...(d ? { display: d } : {}) });
}
// A bond dragged from atom i (or a point) to q: on to i's neighbour it is drawn over their bond; otherwise as bondTo.
export function dragBond(m: Mol, from: number | P, q: P, spec: BondSpec = SINGLE): Mol {
  const j = typeof from === "number" ? atomAt(m, q, 0.1) : undefined, k = j === undefined ? -1 : bondIndex(m, from as number, j);
  return k >= 0 ? overBond(m, k, spec, from as number) : bondTo(m, from, q, spec);
}

// Removes atoms (and their bonds), then any bare carbons left with no bonds.
function removeAtoms(m: Mol, gone: Set<number>): Mol {
  const bonds = m.bonds.filter((b) => !gone.has(b.atoms[0]) && !gone.has(b.atoms[1]));
  const used = new Set(bonds.flatMap((b) => b.atoms));
  m.atoms.forEach((a, i) => { if (!used.has(i) && a.label === "C" && !a.charge) gone.add(i); });
  const map = new Map<number, number>();
  const atoms = m.atoms.filter((_, i) => !gone.has(i));
  m.atoms.forEach((_, i) => { if (!gone.has(i)) map.set(i, map.size); });
  // Captions under a structure follow its atoms' new numbers, and go when all of its atoms go.
  const captions = m.captions?.flatMap((c) => {
    if (!c.under) return [c];
    const under = c.under.filter((i) => map.has(i)).map((i) => map.get(i)!);
    return under.length ? [{ ...c, under }] : [];
  });
  // A cycle keeps the intermediates that still have atoms; with fewer than two it is no longer a cycle.
  const cycles = m.cycles?.flatMap((c) => {
    const nodes = c.nodes.map((n) => n.filter((i) => map.has(i)).map((i) => map.get(i)!)).filter((n) => n.length);
    return nodes.length >= 2 ? [{ ...c, nodes }] : [];
  });
  const kept = new Set(cycles?.map((c) => c.id));
  return { ...m, atoms, bonds: bonds.map((b) => ({ ...b, atoms: [map.get(b.atoms[0])!, map.get(b.atoms[1])!] })), captions: captions?.filter((c) => !c.cycle || kept.has(c.cycle.cycle)), cycles,
    groups: tidyGroups(m.groups?.map((g) => ({ ...g, atoms: g.atoms.filter((i) => map.has(i)).map((i) => map.get(i)!) }))) };
}
// Groups with fewer than two members left are no longer groups.
const tidyGroups = (gs?: Mol["groups"]) => gs?.filter((g) => g.atoms.length + g.items.length >= 2);
// Groups: every group a selection touches (by its atoms or its other objects).
export const groupsOf = (m: Mol, atoms: Set<number>, items: Set<number>) =>
  (m.groups ?? []).filter((g) => g.atoms.some((i) => atoms.has(i)) || g.items.some((id) => items.has(id)));
// Object > Group: the selected structures (whole) and objects, with any groups they were already in, as one group.
export function groupSelection(m: Mol, atoms: Set<number>, items: Set<number>): [Mol, number] | undefined {
  // Each atom's structure, from one pass over the structures.
  const frags = fragments(m), fragOf: number[][] = [];
  for (const g of frags) for (const i of g) fragOf[i] = g;
  const old = groupsOf(m, atoms, items), whole = new Set([...atoms].flatMap((i) => fragOf[i] ?? [i]));
  const all = { atoms: [...new Set([...whole, ...old.flatMap((g) => g.atoms)])].sort((p, q) => p - q), items: [...new Set([...items, ...old.flatMap((g) => g.items)])] };
  const inAll = new Set(all.atoms);
  if (all.atoms.length + all.items.length < 2 || (frags.filter((g) => g.some((i) => inAll.has(i))).length + all.items.length < 2)) return undefined;
  const id = nextId(m);
  return [{ ...m, groups: [...(m.groups ?? []).filter((g) => !old.includes(g)), { id, ...all, ...(old.some((g) => g.integral) ? { integral: true as const } : {}) }] }, id];
}
// Object > Ungroup: the groups the selection touches are undone (their members stay).
export const ungroupSelection = (m: Mol, atoms: Set<number>, items: Set<number>): Mol => {
  const old = new Set(groupsOf(m, atoms, items));
  return { ...m, groups: (m.groups ?? []).filter((g) => !old.has(g)) };
}
export const deleteAtom = (m: Mol, i: number) => removeAtoms(m, new Set([i]));
export const deleteBond = (m: Mol, i: number) => removeAtoms({ ...m, bonds: m.bonds.filter((_, k) => k !== i) }, new Set());

// A ring of n atoms. On a bond: fused on the side with fewer neighbours. On an atom: sharing that atom, pointing
// the way a new bond would go (in line with the bond to a chain end, so the bonds there meet at 120°), with all its
// other atoms new. On empty canvas: centred on the point, with a vertex at the top.
// Benzene (aromatic) gets alternating double bonds that avoid atoms that already have one.
export function addRing(m: Mol, n: number, aromatic: boolean, target: { bond?: number; atom?: number; point?: P }): Mol {
  const r = 1 / (2 * Math.sin(Math.PI / n)), on = target.atom;
  let centre: P, start: P;
  if (target.bond !== undefined) {
    const [i, j] = m.bonds[target.bond].atoms, a = pos(m, i), b = pos(m, j), mid = mul(add(a, b), 0.5);
    const normal: P = unit([-(b[1] - a[1]), b[0] - a[0]]);
    const others = [...neighbours(m, i), ...neighbours(m, j)].filter((k) => k !== i && k !== j);
    const pull = others.reduce((s, k) => s + Math.sign((pos(m, k)[0] - mid[0]) * normal[0] + (pos(m, k)[1] - mid[1]) * normal[1]), 0);
    centre = add(mid, mul(normal, (pull > 0 ? -1 : 1) / (2 * Math.tan(Math.PI / n))));
    start = a;
  } else if (on !== undefined) {
    start = pos(m, on);
    const ns = neighbours(m, on);
    centre = add(start, mul(ns.length === 1 ? unit(sub(start, pos(m, ns[0]))) : nextDirection(m, on), r));
  } else {
    centre = target.point!;
    start = add(centre, [0, r]);
  }
  // Walk the ring from start around the centre, adding atoms where none exist (a ring on an atom never takes
  // another atom that is in the way).
  const ids: number[] = [];
  for (let k = 0; k < n; k++) {
    const p = add(centre, rot(sub(start, centre), (2 * Math.PI * k) / n));
    let id: number;
    [m, id] = on === undefined ? atomOrNew(m, p) : k ? withAtom(m, p) : [m, on];
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
    ...m,
    atoms: [...m.atoms, ...frag.atoms.map((a) => ({ ...a, location: [a.location[0] + offset[0], a.location[1] + offset[1], a.location[2] ?? 0] as [number, number, number] }))],
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
// Expand Label: the labelled atom i becomes the group its label names. frag is that group laid out (bond length 1),
// its first atom the attachment point: it is turned to point away from i's neighbour and joined where the label was.
export function expandLabel(m: Mol, i: number, frag: Mol): Mol {
  if (!frag.atoms.length) return m;
  const at = pos(m, i), nb = neighbours(m, i)[0], a0 = frag.atoms[0].location;
  const want = nb === undefined ? 0 : Math.atan2(at[1] - pos(m, nb)[1], at[0] - pos(m, nb)[0]);
  // The group points out along the bisector of its attachment atom's own bonds (C(=O)OEt: between =O and OEt).
  const rest = frag.atoms.slice(1), near = frag.bonds.filter((b) => b.atoms.includes(0)).map((b) => frag.atoms[b.atoms[0] === 0 ? b.atoms[1] : b.atoms[0]].location);
  const mid = near.length ? [near.reduce((s, q) => s + q[0], 0) / near.length, near.reduce((s, q) => s + q[1], 0) / near.length] : [a0[0] + 1, a0[1]];
  const turn = want - Math.atan2(mid[1] - a0[1], mid[0] - a0[0]), c = Math.cos(turn), s = Math.sin(turn);
  const place = (q: [number, number, number]): [number, number, number] => { const dx = q[0] - a0[0], dy = q[1] - a0[1]; return [at[0] + dx * c - dy * s, at[1] + dx * s + dy * c, 0]; };
  const base = m.atoms.length, to = (k: number) => (k === 0 ? i : base + k - 1);
  const atoms = m.atoms.map((a, k) => (k === i ? { ...a, label: frag.atoms[0].label, text: undefined, charge: frag.atoms[0].charge } : a));
  for (const a of rest) atoms.push({ ...a, location: place(a.location) });
  return { ...m, atoms, bonds: [...m.bonds, ...frag.bonds.map((b) => ({ ...b, atoms: [to(b.atoms[0]), to(b.atoms[1])] as [number, number] }))] };
}
// Contract Label: the atoms in `group` other than `keep` go, and `keep` (the one bonded to the rest) carries the label.
export function contractLabel(m: Mol, keep: number, group: Set<number>, text: string): Mol {
  const labelled = { ...m, atoms: m.atoms.map((a, k) => (k === keep ? { ...a, text, label: a.label, charge: undefined } : a)) };
  return removeAtoms(labelled, new Set([...group].filter((k) => k !== keep)));
}
export function moveAtoms(m: Mol, ids: Set<number>, d: P): Mol {
  return { ...m, atoms: m.atoms.map((a, i) => (ids.has(i) ? { ...a, location: [a.location[0] + d[0], a.location[1] + d[1], a.location[2] ?? 0] } : a)) };
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
  const out = new Set(ids), near = m.atoms.length > LARGE ? bondedTo(m) : undefined;
  m.atoms.forEach((_, i) => {
    const ns = near ? near[i] : neighbours(m, i);
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

// The hull of each selection, kept with the selection's set for its drawing (a new selection is a new set): the
// pointer tests the selection on every move.
const hulls = new WeakMap<Set<number>, [Mol, P[]]>();
// Is p on the selection: inside the outline around its atoms, or within r of it (bond lengths)?
export function onSelection(m: Mol, ids: Set<number>, p: P, r = 0.45): boolean {
  let kept = hulls.get(ids);
  if (kept?.[0] !== m) {
    const ps = [...ids].filter((i) => i < m.atoms.length).map((i) => pos(m, i));
    kept = [m, ps.length ? hull(ps) : []];
    hulls.set(ids, kept);
  }
  const h = kept[1];
  if (!h.length) return false;
  if (h.length >= 3 && h.every((a, k) => cross(sub(h[(k + 1) % h.length], a), sub(p, a)) >= 0)) return true;
  if (h.length === 1) return len(sub(p, h[0])) <= r;
  return h.some((a, k) => segDist(p, a, h[(k + 1) % h.length]) <= r);
}

// Groups of connected atoms.
export function fragments(m: Mol): number[][] {
  const near = bondedTo(m), seen = new Set<number>(), out: number[][] = [];
  m.atoms.forEach((_, start) => {
    if (seen.has(start)) return;
    const group: number[] = [], stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop()!;
      group.push(i);
      for (const j of near[i]) if (!seen.has(j)) { seen.add(j); stack.push(j); }
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
  return { mol: removeAtoms({ ...m, atoms, bonds }, new Set(into.keys())), joined: true };
}

// ChemDraw-style group keys on an atom. Each adds a group and keeps the bond rules above.
export type Group = "chain" | "other" | "acetyl" | "phenyl" | "cyclopropyl" | "cyclobutyl" | "cyclopentyl" | "cyclohexyl"
  | "wedgeMe" | "hashMe" | "methylidene" | "dimethyl" | "alkyne" | "sulfonyl" | "tBu";
const RING_GROUPS: Partial<Record<Group, [number, boolean]>> = {
  phenyl: [6, true], cyclopropyl: [3, false], cyclobutyl: [4, false], cyclopentyl: [5, false], cyclohexyl: [6, false],
};
export const addGroup = (m: Mol, i: number, g: Group): Mol => addGroupAt(m, i, g)[0];
// The same, with the atom the keyboard hotspot moves on to, so the next key carries on from there. As ChemDraw 26.1
// builds each group: on a chain end the end atom becomes part of the group (the C of C=O, a ring atom, the S of
// SO2Me); a carbon that is branched (three bonds) or unsaturated (a double, triple or aromatic bond) first gets a
// new C–C bond and the group goes on the new carbon, so no key gives a carbon five bonds. S, Se, P and As can take
// more bonds and keep the group on themselves.
export function addGroupAt(m: Mol, i: number, g: Group): [Mol, number] {
  const degree = (k: number) => neighbours(m, k).length;
  const orders = (k: number) => m.bonds.filter((b) => b.atoms.includes(k)).map((b) => b.type);
  const multiple = (k: number) => orders(k).some((t) => t !== 1);
  const special = (k: number) => !m.atoms[k].text && ["S", "Se", "P", "As"].includes(m.atoms[k].label);
  // A bond from k (the next way by default), to a new atom or one already there. Returns that atom.
  const drop = (k: number, spec: BondSpec = SINGLE, d: P = nextDirection(m, k), length = 1): number => {
    const q = add(pos(m, k), mul(d, length));
    m = bondTo(m, k, q, spec);
    return atomAt(m, q, 0.1)!;
  };
  const done = (j: number): [Mol, number] => [m, j]; // reads m after drop has changed it
  // Of two new atoms on k, the one more straight above or below it first.
  const upright = (k: number, a: number, b: number) => (Math.abs(pos(m, k)[0] - pos(m, a)[0]) <= Math.abs(pos(m, k)[0] - pos(m, b)[0]) ? [a, b] : [b, a]);
  const branched = (k: number) => !special(k) && (degree(k) >= 3 || multiple(k));
  const ring = RING_GROUPS[g];
  if (ring) {
    const [n, aromatic] = ring, d = degree(i);
    // On a CH2 in a chain or ring a saturated ring is spiro; a phenyl, or a ring on a branched or unsaturated
    // carbon or an alkyne end, goes on a new C–C bond.
    if (d >= 3 || (d === 2 && (aromatic || multiple(i))) || (d < 2 && orders(i).includes(3))) i = drop(i);
    const before = m.atoms.length, at = pos(m, i);
    m = addRing(m, n, aromatic, { atom: i });
    // The hotspot moves to the ring atom farthest from the join; of two, the higher, then the one on the right.
    let hot = i, far = -1;
    for (let k = before; k < m.atoms.length; k++) {
      const p = pos(m, k), h = pos(m, hot), dist = Math.trunc(len(sub(p, at)) * 100);
      if (dist > far || (dist === far && (p[1] > h[1] + 1e-6 || (p[1] > h[1] - 1e-6 && p[0] > h[0])))) [far, hot] = [dist, k];
    }
    return [m, hot];
  }
  // Methyls: a wedged (0) or hashed (1) one, two (2), or a hashed and a wedged one (3).
  const methyls = (kind: 0 | 1 | 2 | 3): [Mol, number] => {
    const one = orders(i);
    if (!(((kind < 2 || one.length <= 2) && (special(i) || !multiple(i))) || (one.length === 1 && one[0] === 2))) i = drop(i);
    const spec: BondSpec = kind === 0 ? { type: 1, stereo: 1 } : kind === 1 ? { type: 1, stereo: 6 } : SINGLE, ns = neighbours(m, i), here = pos(m, i);
    if (ns.length === 3) {
      // On a branched atom: opposite the bond that is nearest to straight up, down, left or right.
      const off = (k: number) => Math.min(Math.abs(pos(m, k)[0] - here[0]), Math.abs(pos(m, k)[1] - here[1]));
      const v = sub(here, pos(m, ns.reduce((a, k) => (off(k) < off(a) ? k : a))));
      return done(drop(i, spec, unit(v), len(v)));
    }
    if (ns.length === 2 && kind >= 2) {
      // A pair 60° apart, either side of the open direction (the hashed one first, clockwise).
      const open = nextDirection(m, i), before = m.atoms.length;
      const a = drop(i, kind === 3 ? { type: 1, stereo: 6 } : SINGLE, rot(open, -30 * deg));
      const b = drop(i, kind === 3 ? { type: 1, stereo: 1 } : SINGLE, rot(open, 30 * deg));
      return [m, a >= before ? a : b >= before ? b : i];
    }
    if (ns.length === 1) {
      // Off a chain end: the more upright of the two takes the wedge, and the hotspot moves on to the other.
      const [up, other] = upright(i, drop(i), drop(i));
      if (kind < 2) m = setBondSpec(m, bondIndex(m, i, up), spec);
      return [m, other];
    }
    return done(drop(i, spec));
  };
  switch (g) {
    case "chain": return done(drop(i));
    case "other": {
      const d = degree(i);
      // A long bond (1.75 bond lengths) from a carbon that is in a chain or branched, for crowded groups.
      if (!m.atoms[i].text && m.atoms[i].label === "C" && (d === 2 || d === 3)) return done(drop(i, SINGLE, nextDirection(m, i), 1.75));
      if (d !== 1) return done(drop(i));
      // Off a chain end: the other zig-zag direction, the usual one mirrored across the existing bond.
      const e = unit(sub(pos(m, neighbours(m, i)[0]), pos(m, i))), dir = nextDirection(m, i), k = 2 * dot(dir, e);
      return done(drop(i, SINGLE, [k * e[0] - dir[0], k * e[1] - dir[1]]));
    }
    case "acetyl": {
      if (branched(i)) i = drop(i);
      // In a chain the carbon becomes C=O and keeps the hotspot. On a chain end it takes =O (the more upright
      // bond) and a methyl, and the hotspot moves to the methyl.
      if (degree(i) !== 1) { const o = drop(i, { type: 2 }); m = setElement(m, o, "O"); return [m, i]; }
      const [o, me] = upright(i, drop(i), drop(i));
      m = setElement(setBond(m, bondIndex(m, i, o), 2), o, "O");
      return [m, me];
    }
    case "methylidene": {
      const lead = branched(i) ? (i = drop(i)) : undefined;
      const j = drop(i, { type: 2 });
      return [m, lead ?? j];
    }
    case "alkyne": {
      if (degree(i) >= 2 || (!special(i) && multiple(i))) i = drop(i);
      // In line with the bond before it (square to the first on an atom that keeps two bonds).
      const ns = neighbours(m, i), away = ns.length ? unit(sub(pos(m, i), pos(m, ns[0]))) : nextDirection(m, i);
      return done(drop(i, { type: 3 }, ns.length === 2 ? rot(away, 90 * deg) : away));
    }
    case "wedgeMe": return methyls(0);
    case "hashMe": return methyls(1);
    case "dimethyl": return methyls(2);
    case "sulfonyl": {
      // The atom becomes S(=O)2, with a methyl on a chain end. Nothing happens on a branched atom.
      if (degree(i) > 2 || m.atoms[i].text) return [m, i];
      m = setElement(m, i, "S");
      const hot = degree(i) === 1 ? drop(i) : i, open = nextDirection(m, i);
      for (const t of [-30, 30]) { const o = drop(i, { type: 2 }, rot(open, t * deg)); m = setElement(m, o, "O"); }
      return [m, hot];
    }
    case "tBu": {
      const a = m.atoms[i];
      if (a.text) return [m, i];
      const free = hydrogens(a.label, a.charge ?? 0, orders(i).reduce((s, t) => s + (t === 4 ? 1.5 : t), 0), a.radical);
      // A CH2 in a chain takes a wedged and a hashed methyl.
      if (a.label === "C" && free === 2) return methyls(3);
      if (free < 3) i = drop(i);
      // The atom becomes the quaternary carbon: one methyl straight on, then one either side.
      const ns = neighbours(m, i), c = drop(i, SINGLE, ns.length ? unit(sub(pos(m, i), pos(m, ns[0]))) : nextDirection(m, i));
      drop(i);
      drop(i);
      return [m, c];
    }
  }
  return [m, i];
}

// The keyboard hotspot: the atom or bond the next key acts on, as ChemDraw's.
export type Hot = { atom?: number; bond?: number };
// An arrow key (dir) moves it from an atom to the bond that points most that way, and from a bond to the end that
// lies most that way. Where two are as near, it stays.
export function walkHot(m: Mol, hot: Hot, dir: P): Hot {
  const score = (from: P, to: P) => len(sub(unit(sub(to, from)), dir));
  if (hot.atom !== undefined) {
    const i = hot.atom, here = pos(m, i);
    const ways = m.bonds.flatMap((b, k) => (b.atoms.includes(i) ? [{ k, s: score(here, pos(m, b.atoms[0] === i ? b.atoms[1] : b.atoms[0])) }] : [])).sort((a, b) => a.s - b.s);
    return ways.length && (ways.length === 1 || ways[0].s < ways[1].s - 1e-9) ? { bond: ways[0].k } : hot;
  }
  if (hot.bond === undefined) return hot;
  const [a, b] = m.bonds[hot.bond].atoms, mid = mul(add(pos(m, a), pos(m, b)), 0.5), sa = score(mid, pos(m, a)), sb = score(mid, pos(m, b));
  return sa < sb - 1e-9 ? { atom: a } : sb < sa - 1e-9 ? { atom: b } : hot;
}
// Shift+arrow: to the atom of the same structure nearest a point about three bonds (2.45 bond lengths) that way.
// Past the structure's edge it comes round from the other side.
export function jumpHot(m: Mol, hot: Hot, dir: P): Hot {
  const ends = hot.bond !== undefined ? m.bonds[hot.bond].atoms : hot.atom !== undefined ? [hot.atom] : [];
  if (!ends.length) return hot;
  const at = mul(ends.reduce((s, k) => add(s, pos(m, k)), [0, 0] as P), 1 / ends.length), group = fragments(m).find((g) => g.includes(ends[0]))!;
  const inside = new Set(group), bonds = m.bonds.filter((b) => inside.has(b.atoms[0]));
  const step = 2.45 * (bonds.reduce((s, b) => s + len(sub(pos(m, b.atoms[1]), pos(m, b.atoms[0]))), 0) / (bonds.length || 1) || 1), target = add(at, mul(dir, step));
  const span = [0, 1].map((k) => Math.max(...group.map((i) => pos(m, i)[k])) - Math.min(...group.map((i) => pos(m, i)[k])) + step);
  let best: number | undefined, near = Infinity;
  for (const i of group) {
    if (i === hot.atom) continue;
    const p = pos(m, i);
    for (const k of [0, 1]) if (dir[k] && Math.sign(p[k] - at[k]) === -Math.sign(dir[k])) p[k] += Math.sign(dir[k]) * span[k];
    const d = len(sub(p, target));
    if (d < near) [best, near] = [i, d];
  }
  return best === undefined ? hot : { atom: best };
}
// The hotspot after an edit that did not move it (was is the drawing before the edit): on the same atom or bond. An
// edit that removes atoms or bonds numbers the rest again, so then it is found again where it was. Undefined when it
// is gone.
export function keepHot(was: Mol, m: Mol, hot: Hot): Hot | undefined {
  if (m.atoms.length >= was.atoms.length && m.bonds.length >= was.bonds.length) return (hot.atom ?? -1) < m.atoms.length && (hot.bond ?? -1) < m.bonds.length ? hot : undefined;
  const find = (i: number) => (i < was.atoms.length ? atomAt(m, pos(was, i), 1e-6) : undefined);
  if (hot.atom !== undefined) { const atom = find(hot.atom); return atom === undefined ? undefined : { atom }; }
  const [a, b] = hot.bond !== undefined ? (was.bonds[hot.bond]?.atoms.map(find) ?? []) : [];
  const bond = m.bonds.findIndex((x) => x.atoms.includes(a ?? -1) && x.atoms.includes(b ?? -1));
  return bond >= 0 ? { bond } : undefined;
}
// After a ring is fused on bond `on` (its new bonds from index `from`), the new bond farthest from it, where
// ChemDraw puts the hotspot; of two, the one of higher order, then the higher, then the one on the right.
export function farBond(m: Mol, on: number, from: number): number | undefined {
  const mid = (k: number) => mul(add(pos(m, m.bonds[k].atoms[0]), pos(m, m.bonds[k].atoms[1])), 0.5), c = mid(on);
  let best: number | undefined, far = -1;
  for (let k = from; k < m.bonds.length; k++) {
    const d = Math.trunc(len(sub(mid(k), c)) * 100);
    if (best === undefined || d > far) { [best, far] = [k, d]; continue; }
    const [p, q, o, ob] = [mid(k), mid(best), m.bonds[k].type, m.bonds[best].type];
    if (d === far && (o > ob || (o === ob && (p[1] > q[1] + 1e-6 || (p[1] > q[1] - 1e-6 && p[0] > q[0]))))) best = k;
  }
  return best;
}

// Moves and turns a selection. Rotation is about the selection's centre, counter-clockwise for positive degrees.
export function rotateAtoms(m: Mol, ids: Set<number>, degrees: number): Mol {
  const ps = [...ids].filter((i) => i < m.atoms.length).map((i) => pos(m, i));
  if (!ps.length) return m;
  const c: P = [(Math.min(...ps.map((p) => p[0])) + Math.max(...ps.map((p) => p[0]))) / 2, (Math.min(...ps.map((p) => p[1])) + Math.max(...ps.map((p) => p[1]))) / 2];
  return { ...m, atoms: m.atoms.map((a, i) => {
    if (!ids.has(i)) return a;
    const r = add(c, rot(sub(pos(m, i), c), degrees * deg));
    return { ...a, location: [r[0], r[1], a.location[2] ?? 0] };
  }) };
}

// Chair cyclohexane, drawn the textbook way (as ChemDraw draws it): three pairs of parallel bonds, all one bond
// long, a steep pair at the ends (the first bond, 0-1), a pair sloping up and a pair near level. Chair 2 is chair 1
// turned upside down.
export function chairPoints(which: 1 | 2): P[] {
  const pts: P[] = [[0, 0]];
  for (const t of [-40, 35, 4, 140, 215]) pts.push(add(pts[pts.length - 1], [Math.cos(t * deg), (which === 1 ? 1 : -1) * Math.sin(t * deg)]));
  const c = mul(pts.reduce((s, p) => add(s, p), [0, 0] as P), 1 / 6);
  return pts.map((p) => sub(p, c));
}

// Places a chair on empty canvas (centred on the point), or fuses it onto a bond on the side away from the
// bond's other neighbours. The two chairs on one bond are mirror images, on the same side.
export function addChair(m: Mol, which: 1 | 2, target: { bond?: number; point?: P }): Mol {
  let pts = chairPoints(which);
  if (target.bond !== undefined) {
    const [i, j] = m.bonds[target.bond].atoms, a = pos(m, i), b = pos(m, j);
    // Map a steep chair bond onto a-b (rotate, scale, move): 0-1 for chair 1 and 1-0 for chair 2. Then mirror
    // across the bond if it lands on the crowded side.
    const [e0, e1] = which === 1 ? [pts[0], pts[1]] : [pts[1], pts[0]], te = sub(e1, e0), be = sub(b, a);
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
export function inPolygon([x, y]: P, poly: P[]): boolean {
  let inside = false;
  for (let k = 0, l = poly.length - 1; k < poly.length; l = k++) {
    const [xi, yi] = poly[k], [xj, yj] = poly[l];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const atomsInPolygon = (m: Mol, poly: P[]): number[] => m.atoms.flatMap((_, i) => (inPolygon(pos(m, i), poly) ? [i] : []));

// Flip Horizontal and Flip Vertical: a 180° turn in 3D about the vertical or horizontal axis, so wedges become
// hashed wedges and the stereochemistry is kept (as ChemDraw's "Rotate 180°"). Double-bond sides swap too.
// Turns atoms over about the middle of their box. As ChemDraw's Rotate 180° (the default) the turn is in 3D, so
// wedges become hashes and each stereocentre keeps its configuration; as its Flip (mirror) wedges stay wedges and
// the configuration inverts.
export function flipAtoms(m: Mol, ids: Set<number>, axis: "horizontal" | "vertical", mirror = false): Mol {
  const ps = [...ids].filter((i) => i < m.atoms.length).map((i) => pos(m, i));
  if (!ps.length) return m;
  const k = axis === "horizontal" ? 0 : 1;
  const mid = (Math.min(...ps.map((p) => p[k])) + Math.max(...ps.map((p) => p[k]))) / 2;
  const swap = { left: "right", right: "left", centre: "centre" } as const;
  return {
    ...m,
    // A Rotate 180° is a turn through 3D, so a 3D structure's depth turns over too; a mirror keeps it.
    atoms: m.atoms.map((a, i) => {
      if (!ids.has(i)) return a;
      const loc: [number, number, number] = [a.location[0], a.location[1], mirror ? a.location[2] ?? 0 : -(a.location[2] ?? 0)];
      loc[k] = 2 * mid - loc[k];
      return { ...a, location: loc };
    }),
    bonds: m.bonds.map((b) => {
      if (!ids.has(b.atoms[0]) || !ids.has(b.atoms[1])) return b;
      const out = { ...b };
      if (!mirror && b.stereo === 1) out.stereo = 6;
      else if (!mirror && b.stereo === 6) out.stereo = 1;
      if (b.position) out.position = swap[b.position];
      return out;
    }),
  };
}

// Lines up whole structures in a selection: their centres on one line, or evenly spaced along it.
export function alignFragments(m: Mol, ids: Set<number>, how: "row" | "column" | "spread-row" | "spread-column"): Mol {
  const groups = fragments(m).filter((g) => g.some((i) => ids.has(i)));
  if (groups.length < 2) return m;
  const boxes = groups.map((g) => {
    const xs = g.map((i) => pos(m, i)[0]), ys = g.map((i) => pos(m, i)[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  const centre = (b: number[], k: 0 | 1) => (b[k] + b[k + 2]) / 2;
  const axis: 0 | 1 = how === "row" || how === "spread-row" ? 1 : 0; // a row shares one y
  const shifts: P[] = groups.map(() => [0, 0]);
  if (how === "row" || how === "column") {
    const target = boxes.reduce((s, b) => s + centre(b, axis), 0) / boxes.length;
    boxes.forEach((b, k) => { shifts[k][axis] = target - centre(b, axis); });
  } else {
    // Equal gaps between neighbouring structures, keeping the first and last in place.
    const along: 0 | 1 = axis === 1 ? 0 : 1, order = boxes.map((_, k) => k).sort((a, b) => boxes[a][along] - boxes[b][along]);
    const total = boxes[order[order.length - 1]][along + 2] - boxes[order[0]][along];
    const sizes = order.map((k) => boxes[k][along + 2] - boxes[k][along]), gap = (total - sizes.reduce((s, x) => s + x, 0)) / (order.length - 1);
    let at = boxes[order[0]][along];
    order.forEach((k, n) => { shifts[k][along] = at - boxes[k][along]; at += sizes[n] + gap; });
  }
  let out = m;
  groups.forEach((g, k) => { out = moveAtoms(out, new Set(g), shifts[k]); });
  return out;
}

// Captions and arrows share one set of ids, unique within a drawing.
const nextId = (m: Mol) => Math.max(0, ...[...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.groups ?? [])].map((x) => x.id)) + 1;
export function addCycle(m: Mol, c: Omit<Cycle, "id">): [Mol, number] {
  const id = nextId(m);
  return [{ ...m, cycles: [...(m.cycles ?? []), { ...c, id }] }, id];
}
export function addCaption(m: Mol, c: Omit<Caption, "id">): [Mol, number] {
  const id = nextId(m);
  return [{ ...m, captions: [...(m.captions ?? []), { ...c, id }] }, id];
}
export function addArrow(m: Mol, a: Omit<Arrow, "id">): [Mol, number] {
  const id = nextId(m);
  return [{ ...m, arrows: [...(m.arrows ?? []), { ...a, id }] }, id];
}
export const updateArrow = (m: Mol, id: number, change: Partial<Arrow>): Mol =>
  ({ ...m, arrows: m.arrows?.map((a) => (a.id === id ? { ...a, ...change } : a)) });
export function addShape(m: Mol, sh: Omit<Shape, "id">): [Mol, number] {
  const id = nextId(m);
  // A highlight goes behind the shapes already there; anything else on top.
  return [{ ...m, shapes: sh.kind === "highlight" ? [{ ...sh, id }, ...(m.shapes ?? [])] : [...(m.shapes ?? []), { ...sh, id }] }, id];
}
export const updateShape = (m: Mol, id: number, change: Partial<Shape>): Mol =>
  ({ ...m, shapes: m.shapes?.map((x) => (x.id === id ? { ...x, ...change } : x)) });
// Atom maps. Pairing two atoms gives both the first one's number, or the second's, or the next free number; the
// number leaves any other atom that had it. Clearing takes an atom's number off.
export function pairMap(m: Mol, a: number, b: number): Mol {
  const n = m.atoms[a].map ?? m.atoms[b].map ?? Math.max(0, ...m.atoms.map((x) => x.map ?? 0)) + 1;
  return { ...m, atoms: m.atoms.map((x, i) => (i === a || i === b ? { ...x, map: n } : x.map === n ? { ...x, map: undefined } : x)) };
}
export const clearMap = (m: Mol, i: number): Mol => ({ ...m, atoms: m.atoms.map((x, j) => (j === i ? { ...x, map: undefined } : x)) });

// Stereocentres: the atoms at the narrow end of a wedge or hashed wedge (among some atoms, if given).
export const stereocentres = (m: Mol, among?: Set<number>) =>
  [...new Set(m.bonds.filter((b) => b.stereo === 1 || b.stereo === 6).map((b) => b.atoms[0]))].filter((i) => !among || among.has(i));
// Where a small mark beside an atom goes (a stereo flag, a map number): the middle of its widest gap between
// bonds, never inside a ring when the atom has a bond out of it, and lower on a tie. For each of the atoms asked
// for, with the drawing's ring bonds found once for all of them.
export function markDirections(m: Mol, ids: number[]): Map<number, P> {
  const out = new Map<number, P>();
  if (!ids.length) return out;
  const ring = ringBonds(m), near: number[][] = m.atoms.map(() => []);
  m.bonds.forEach((b, k) => { near[b.atoms[0]].push(k); if (b.atoms[1] !== b.atoms[0]) near[b.atoms[1]].push(k); });
  for (const i of ids) {
    const here = pos(m, i);
    // Each bond's direction, and whether the first bond to that neighbour is in a ring.
    const first = new Map<number, number>(), bonds = near[i].map((k) => {
      const b = m.bonds[k], j = b.atoms[0] === i ? b.atoms[1] : b.atoms[0];
      if (!first.has(j)) first.set(j, k);
      return { a: Math.atan2(pos(m, j)[1] - here[1], pos(m, j)[0] - here[0]), ring: ring[first.get(j)!] };
    }).sort((p, q) => p.a - q.a);
    let best: P = [0, -1], score = -Infinity;
    bonds.forEach((b, k) => {
      const next = bonds[(k + 1) % bonds.length];
      let gap = bonds.length === 1 ? 2 * Math.PI : next.a - b.a;
      if (gap <= 0) gap += 2 * Math.PI;
      const mid = b.a + gap / 2, inside = bonds.length > 2 && b.ring && next.ring && bonds.some((x) => !x.ring);
      const s = gap - (inside ? 10 : 0) - 0.01 * Math.sin(mid);
      if (s > score) { score = s; best = [Math.cos(mid), Math.sin(mid)]; }
    });
    out.set(i, best);
  }
  return out;
}
// Enhanced stereo flags on atoms: "abs", "&1" or "or1", or none.
export const setEnhanced = (m: Mol, ids: number[], label?: string): Mol =>
  ({ ...m, atoms: m.atoms.map((a, i) => (ids.includes(i) ? { ...a, enhanced: label } : a)) });

// Tables. A new one has an Entry column numbered down its rows, under a header row.
export const newTable = (rows: number, cols: number): Table =>
  ({ cells: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (c === 0 ? (r === 0 ? "Entry" : String(r)) : ""))) });
// True when the first column counts 1, 2, 3 down the rows under the header (the entry numbers a new table has).
const counts = (cells: string[][]) => cells.length > 1 && cells.slice(1).every((r, i) => r[0] === String(i + 1));
// A table with rows or columns taken out and added at a place (at least one of each stays; at most 100 rows and 20
// columns), and its box to match: the other rows keep their heights and the other columns their widths, and a new
// column is as wide as the average one. Entry numbers in the first column are numbered again.
export function spliceTable(sh: Shape, axis: "row" | "col", at: number, remove: number, add: number, measure?: (text: string) => number): Partial<Shape> {
  const t = tableLayout(sh, measure), table: Table = sh.table ?? { cells: [[""]] }, numbered = counts(table.cells);
  const cells = table.cells.map((r) => Array.from({ length: t.cols }, (_, c) => r[c] ?? ""));
  const widths = [...t.widths], heights = [...t.heights], align = table.align ? Array.from({ length: t.cols }, (_, c) => table.align![c] ?? "centre") : undefined;
  if (axis === "row") {
    const out = Math.min(remove, t.rows - 1), into = Math.max(0, Math.min(add, 100 - t.rows + out));
    cells.splice(at, out, ...Array.from({ length: into }, () => Array<string>(t.cols).fill("")));
    heights.splice(at, out, ...Array<number>(into).fill(t.h));
  } else {
    const out = Math.min(remove, t.cols - 1), into = Math.max(0, Math.min(add, 20 - t.cols + out)), average = widths.reduce((a, b) => a + b, 0) / t.cols;
    for (const r of cells) r.splice(at, out, ...Array<string>(into).fill(""));
    widths.splice(at, out, ...Array<number>(into).fill(average));
    align?.splice(at, out, ...Array<"centre">(into).fill("centre"));
  }
  if (numbered) { let n = 0; cells.forEach((r, i) => { if (i && (r[0] === "" || /^\d+$/.test(r[0]))) r[0] = String(++n); }); }
  const next: Table = { ...table, cells, ...(table.widths ? { widths } : {}), ...(table.heights ? { heights } : {}), ...(align ? { align } : {}) };
  const width = widths.reduce((a, b) => a + b, 0), height = heights.reduce((a, b) => a + b, 0);
  return { from: [t.x0, t.y1], to: [t.x0 + width, t.y1 - height], table: next };
}
// A table with rows and columns added or taken off the end (at least one of each).
export function resizeTable(sh: Shape, rows: number, cols: number, measure?: (text: string) => number): Partial<Shape> {
  const R = Math.max(1, Math.min(100, rows)), C = Math.max(1, Math.min(20, cols)), now = tableLayout(sh, measure);
  const tall = { ...sh, ...spliceTable(sh, "row", Math.min(R, now.rows), Math.max(0, now.rows - R), Math.max(0, R - now.rows), measure) };
  const both = { ...tall, ...spliceTable(tall, "col", Math.min(C, now.cols), Math.max(0, now.cols - C), Math.max(0, C - now.cols), measure) };
  return { from: both.from, to: both.to, table: both.table };
}
// A table with its columns' widths or rows' heights set (each is kept from then on, as after dragging a border), and
// its box to match. x0 and y1 move its left and top edges.
export function sizeTable(sh: Shape, size: { widths?: number[]; heights?: number[]; x0?: number; y1?: number }, measure?: (text: string) => number): Partial<Shape> {
  const old = tableLayout(sh, measure), x0 = size.x0 ?? old.x0, y1 = size.y1 ?? old.y1;
  const table: Table = {
    ...sh.table!, ...(size.widths ? { widths: size.widths.map((w) => Math.max(0.2, Math.min(50, w))) } : {}),
    ...(size.heights ? { heights: size.heights.map((h) => Math.max(0.5, Math.min(50, h))) } : {}),
  };
  const t = tableLayout({ ...sh, from: [x0, y1], to: [x0 + old.x1 - old.x0, y1 - (old.y1 - old.y0)], table }, measure);
  return { from: [t.x0, t.y1], to: [t.x1, t.y0], table };
}
// Size To Fit Contents: each column as wide as its text and each row the least height.
export function fitTable(sh: Shape, measure?: (text: string) => number): Partial<Shape> {
  const { widths: _w, heights: _h, ...table } = sh.table!, t = tableLayout({ ...sh, table }, measure);
  void _w; void _h;
  return { from: [t.x0, t.y1], to: [t.x0 + t.natural.reduce((a, b) => a + b, 0), t.y1 - t.rows * TABLE_ROW], table };
}
// Clear Contents: every cell empty, except the entry numbers and their header when the first column counts.
export function clearTable(sh: Shape): Partial<Shape> {
  const cells = sh.table?.cells ?? [[""]], keep = counts(cells);
  return { table: { ...sh.table!, cells: cells.map((r) => r.map((x, c) => (keep && c === 0 ? x : ""))) } };
}
// A table with one cell's text set, its box grown to fit the text if it no longer does.
export function setTableCell(sh: Shape, r: number, c: number, text: string, measure?: (text: string) => number): Partial<Shape> {
  const cells = (sh.table?.cells ?? [[""]]).map((row, i) => (i === r ? row.map((x, j) => (j === c ? text : x)) : row));
  const t = tableLayout({ ...sh, table: { ...sh.table, cells } }, measure);
  return { from: [t.x0, t.y1], to: [t.x1, t.y0], table: { ...sh.table, cells } };
}
export const updateCaption = (m: Mol, id: number, change: Partial<Caption>): Mol =>
  ({ ...m, captions: m.captions?.map((c) => (c.id === id ? { ...c, ...change } : c)) });
// Deletes captions, arrows, shapes and cycles by id; an arrow's conditions and a cycle's labels go with it.
export const deleteGraphics = (m: Mol, ids: Set<number>): Mol => ({
  ...m,
  captions: m.captions?.filter((c) => !ids.has(c.id) && !(c.on && ids.has(c.on.arrow)) && !(c.cycle && ids.has(c.cycle.cycle))),
  arrows: m.arrows?.filter((a) => !ids.has(a.id)),
  shapes: m.shapes?.filter((x) => !ids.has(x.id)),
  cycles: m.cycles?.filter((c) => !ids.has(c.id)),
  ...(m.grids ? { grids: m.grids.filter((g) => !ids.has(g.arrow)) } : {}),
  groups: tidyGroups(m.groups?.map((g) => ({ ...g, items: g.items.filter((id) => !ids.has(id) && !(m.captions?.some((c) => c.id === id && ((c.on && ids.has(c.on.arrow)) || (c.cycle && ids.has(c.cycle.cycle)))))) }))),
});
// The next compound number in the drawing: one more than the highest bold number already there.
export function nextNumber(m: Mol): string {
  const used = (m.captions ?? []).filter((c) => c.bold && /^\d+$/.test(c.text)).map((c) => Number(c.text));
  return String(Math.max(0, ...used) + 1);
}

// Every bond's ring flag at once (inRing for each bond): a bond is in a ring unless it is a bridge, found in one
// depth-first walk (Tarjan's bridges).
export function ringBonds(m: Mol): boolean[] {
  const near: [number, number][][] = m.atoms.map(() => []);
  m.bonds.forEach((b, k) => { near[b.atoms[0]].push([b.atoms[1], k]); near[b.atoms[1]].push([b.atoms[0], k]); });
  const order = m.atoms.map(() => -1), low = m.atoms.map(() => 0), ring = m.bonds.map(() => true);
  let t = 0;
  m.atoms.forEach((_, start) => {
    if (order[start] >= 0) return;
    order[start] = low[start] = t++;
    // Each step: an atom, the bond it was reached by, and the next of its bonds to look at.
    const stack: [number, number, number][] = [[start, -1, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1], [x, via] = top;
      if (top[2] < near[x].length) {
        const [y, k] = near[x][top[2]++];
        if (k === via) continue;
        if (order[y] < 0) { order[y] = low[y] = t++; stack.push([y, k, 0]); }
        else low[x] = Math.min(low[x], order[y]);
        continue;
      }
      stack.pop();
      if (!stack.length) continue;
      const p = stack[stack.length - 1][0];
      low[p] = Math.min(low[p], low[x]);
      if (low[x] > order[p]) ring[via] = false;
    }
  });
  return ring;
}
// A bond is in a ring when its ends stay connected without it.
export function inRing(m: Mol, k: number): boolean {
  const [from, to] = m.bonds[k].atoms, seen = new Set([from]), queue = [from];
  while (queue.length) {
    const i = queue.pop()!;
    for (const [x, b] of m.bonds.entries()) {
      if (x === k || !b.atoms.includes(i)) continue;
      const j = b.atoms[0] === i ? b.atoms[1] : b.atoms[0];
      if (j === to) return true;
      if (!seen.has(j)) { seen.add(j); queue.push(j); }
    }
  }
  return false;
}

// Places a template (a structure drawn at bond length 1): fused along a clicked bond, on the open side; sharing a
// clicked atom (the template's first atom), pointing away from that atom's bonds; or centred on a point.
// Template atoms that land on existing atoms join them, and a double bond that would give an atom two is single.
export function addTemplate(m: Mol, t: Mol, target: { bond?: number; atom?: number; point?: P }): Mol {
  if (!t.atoms.length) return m;
  let pts: P[] = t.atoms.map((a) => [a.location[0], a.location[1]]), mirrored = false;
  const middle = (ps: P[]) => mul(ps.reduce((s, p) => add(s, p), [0, 0] as P), 1 / ps.length);
  // Fuse along a ring bond on the template's outside edge (the rest of it on one side), so nothing overlaps.
  const ring = t.bonds.filter((_, k) => inRing(t, k));
  const edge = ring.find((b) => {
    const a = pts[b.atoms[0]], n: P = [-(pts[b.atoms[1]][1] - a[1]), pts[b.atoms[1]][0] - a[0]], sides = pts.map((q) => dot(sub(q, a), n));
    return sides.every((d) => d > -1e-6) || sides.every((d) => d < 1e-6);
  }) ?? ring[0] ?? t.bonds[0];
  if (target.bond !== undefined && edge) {
    // Map the template's first ring bond onto the clicked bond, then mirror it off the crowded side.
    const [i, j] = m.bonds[target.bond].atoms, a = pos(m, i), b = pos(m, j);
    const e0 = pts[edge.atoms[0]], te = sub(pts[edge.atoms[1]], e0), be = sub(b, a);
    const k = len(be) / len(te), turn = Math.atan2(be[1], be[0]) - Math.atan2(te[1], te[0]);
    pts = pts.map((p) => add(a, mul(rot(sub(p, e0), turn), k)));
    const normal = unit([-be[1], be[0]]), side = (p: P) => Math.sign(dot(sub(p, a), normal));
    const others = [...neighbours(m, i), ...neighbours(m, j)].filter((x) => x !== i && x !== j);
    if (others.reduce((s, x) => s + side(pos(m, x)), 0) * side(middle(pts)) > 0) { pts = pts.map((p) => sub(p, mul(normal, 2 * dot(sub(p, a), normal)))); mirrored = true; }
  } else if (target.atom !== undefined) {
    const a = pos(m, target.atom), dir = nextDirection(m, target.atom), v = sub(middle(pts), pts[0]);
    const turn = len(v) > 1e-6 ? Math.atan2(dir[1], dir[0]) - Math.atan2(v[1], v[0]) : 0, from = pts[0];
    pts = pts.map((p) => add(a, rot(sub(p, from), turn)));
  } else {
    const c = middle(pts), at = target.point ?? [0, 0];
    pts = pts.map((p) => add(at, sub(p, c)));
  }
  const ids: number[] = [];
  for (const [k, p] of pts.entries()) {
    const before = m.atoms.length;
    let id: number;
    [m, id] = atomOrNew(m, p);
    if (id >= before) {
      const { label, charge, text, radical } = t.atoms[k];
      m = { ...m, atoms: m.atoms.map((x, n) => (n === id ? { ...x, label, ...(charge ? { charge } : {}), ...(text ? { text } : {}), ...(radical ? { radical } : {}) } : x)) };
    }
    ids.push(id);
  }
  const hasDouble = (i: number) => m.bonds.some((b) => b.type === 2 && b.atoms.includes(i));
  for (const b of t.bonds) {
    const [i, j] = [ids[b.atoms[0]], ids[b.atoms[1]]];
    const type = b.type === 2 && (hasDouble(i) || hasDouble(j)) ? 1 : b.type;
    // A mirrored template keeps its stereochemistry: wedges and hashes swap.
    const stereo = mirrored && (b.stereo === 1 || b.stereo === 6) ? 7 - b.stereo : b.stereo;
    m = withBond(m, i, j, { type, ...(stereo ? { stereo } : {}), ...(b.display ? { display: b.display } : {}) });
  }
  return m;
}

// A structure as a template: median bond 1, centred on the origin.
export function normalise(m: Mol): Mol {
  const lengths = m.bonds.map((b) => len(sub(pos(m, b.atoms[0]), pos(m, b.atoms[1])))).sort((x, y) => x - y);
  const k = 1 / (lengths[Math.floor(lengths.length / 2)] || 1), b = bounds(m);
  if (!b) return m;
  const c: P = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  return { atoms: m.atoms.map((a) => ({ ...a, location: [(a.location[0] - c[0]) * k, (a.location[1] - c[1]) * k, (a.location[2] ?? 0) * k] })), bonds: m.bonds };
}

// The turn (degrees, anticlockwise) that sets a structure's bottom ring bond level with the page: of the ring bonds
// that would end up lowest, the one needing the smallest turn. 0 for a structure without rings.
export function levelTurn(m: Mol, atoms: number[]): number {
  const inside = new Set(atoms), inRings = ringBonds(m), ring = m.bonds.filter((b, k) => inside.has(b.atoms[0]) && inside.has(b.atoms[1]) && inRings[k]);
  if (!ring.length) return 0;
  const mids = ring.map((b): P => { const p = pos(m, b.atoms[0]), q = pos(m, b.atoms[1]); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
  let best = 0, found = false;
  for (const [k, b] of ring.entries()) {
    const p = pos(m, b.atoms[0]), q = pos(m, b.atoms[1]);
    let t = -Math.atan2(q[1] - p[1], q[0] - p[0]) / deg;
    t = ((t % 180) + 270) % 180 - 90; // the smaller way round, in (-90, 90]
    // After this turn, is the bond at the bottom of its structure?
    const c = Math.cos(t * deg), s = Math.sin(t * deg), y = (r: P) => r[0] * s + r[1] * c;
    let lowest = Infinity;
    for (const r of mids) lowest = Math.min(lowest, y(r));
    if (y(mids[k]) > lowest + 0.05) continue;
    if (!found || Math.abs(t) < Math.abs(best)) { best = t; found = true; }
  }
  return Math.abs(best) < 0.5 ? 0 : best;
}

// Structure Perspective. Tilts atoms through 3D about a centre: yaw turns them about the vertical axis (a drag
// across), pitch about the horizontal one (a drag up or down). Degrees; depth (z) points at the viewer.
export function tiltAtoms(m: Mol, ids: Set<number>, centre: [number, number, number], yaw: number, pitch: number): Mol {
  const [cy, sy, cp, sp] = [Math.cos((yaw * Math.PI) / 180), Math.sin((yaw * Math.PI) / 180), Math.cos((pitch * Math.PI) / 180), Math.sin((pitch * Math.PI) / 180)];
  return {
    ...m,
    atoms: m.atoms.map((a, i) => {
      if (!ids.has(i)) return a;
      const x = a.location[0] - centre[0], y = a.location[1] - centre[1], z = (a.location[2] ?? 0) - centre[2];
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; // about the vertical axis
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp; // then about the horizontal axis
      return { ...a, location: [centre[0] + x1, centre[1] + y2, centre[2] + z2] as [number, number, number] };
    }),
  };
}
// Turns atoms about the axis through two atoms (part of a structure about the bond that joins it), in degrees.
export function turnAboutBond(m: Mol, ids: Set<number>, from: number, to: number, degrees: number): Mol {
  const p = m.atoms[from].location, q = m.atoms[to].location, axis = [q[0] - p[0], q[1] - p[1], (q[2] ?? 0) - (p[2] ?? 0)];
  const n = Math.hypot(...axis) || 1, [ux, uy, uz] = axis.map((v) => v / n), c = Math.cos((degrees * Math.PI) / 180), s = Math.sin((degrees * Math.PI) / 180);
  return {
    ...m,
    atoms: m.atoms.map((a, i) => {
      if (!ids.has(i)) return a;
      const v = [a.location[0] - p[0], a.location[1] - p[1], (a.location[2] ?? 0) - (p[2] ?? 0)], d = ux * v[0] + uy * v[1] + uz * v[2];
      const cr = [uy * v[2] - uz * v[1], uz * v[0] - ux * v[2], ux * v[1] - uy * v[0]];
      // Rodrigues' rotation formula.
      const r = [0, 1, 2].map((k) => v[k] * c + cr[k] * s + [ux, uy, uz][k] * d * (1 - c));
      return { ...a, location: [p[0] + r[0], p[1] + r[1], (p[2] ?? 0) + r[2]] as [number, number, number] };
    }),
  };
}
// Object > Flatten: atoms keep where they are drawn and lose their depth.
export const flattenAtoms = (m: Mol, ids: Set<number>): Mol =>
  ({ ...m, atoms: m.atoms.map((a, i) => (ids.has(i) ? { ...a, location: [a.location[0], a.location[1], 0] as [number, number, number], depth: undefined } : a)) });
// The one bond joining some atoms to the rest of their structure, as [inside atom, outside atom], if there is one.
export function hingeOf(m: Mol, ids: Set<number>): [number, number] | undefined {
  const joins = m.bonds.filter((b) => ids.has(b.atoms[0]) !== ids.has(b.atoms[1]));
  if (joins.length !== 1) return undefined;
  const [a, b] = joins[0].atoms;
  return ids.has(a) ? [a, b] : [b, a];
}

// Copy: the selected atoms (with the bonds between them) and picked objects as a drawing of their own, with the
// text that belongs to them (captions under the copied atoms, conditions on copied arrows, labels of copied cycles)
// and the groups wholly inside. Ids stay as they were; insertMol gives new ones.
export function extractSelection(m: Mol, atoms: Set<number>, items: Set<number>): Mol {
  const sel = [...atoms].filter((i) => i < m.atoms.length).sort((p, q) => p - q), map = new Map(sel.map((i, k) => [i, k]));
  const arrows = (m.arrows ?? []).filter((a) => items.has(a.id)), cycles = (m.cycles ?? []).filter((c) => items.has(c.id) && c.nodes.every((n) => n.every((i) => map.has(i))));
  const keep = new Set([...items, ...arrows.map((a) => a.id), ...cycles.map((c) => c.id)]);
  const captions = (m.captions ?? []).filter((c) => (c.under ? c.under.every((i) => map.has(i)) : c.on ? keep.has(c.on.arrow) : c.cycle ? keep.has(c.cycle.cycle) : keep.has(c.id)));
  const ids = new Set([...keep, ...captions.map((c) => c.id)]);
  return {
    atoms: sel.map((i) => ({ ...m.atoms[i] })),
    bonds: m.bonds.filter((b) => map.has(b.atoms[0]) && map.has(b.atoms[1])).map((b) => ({ ...b, atoms: [map.get(b.atoms[0])!, map.get(b.atoms[1])!] as [number, number] })),
    captions: captions.map((c) => ({ ...c, ...(c.under ? { under: c.under.map((i) => map.get(i)!) } : {}) })),
    arrows, shapes: (m.shapes ?? []).filter((x) => items.has(x.id)),
    cycles: cycles.map((c) => ({ ...c, nodes: c.nodes.map((n) => n.map((i) => map.get(i)!)) })),
    groups: (m.groups ?? []).filter((g) => g.atoms.every((i) => map.has(i)) && g.items.every((id) => ids.has(id))).map((g) => ({ ...g, atoms: g.atoms.map((i) => map.get(i)!) })),
  };
}
// Paste: another drawing added to this one, moved by offset, with new ids for its objects. Returns the drawing, the
// new atoms and the new objects' ids, and each old id's new one.
export function insertMol(m: Mol, add: Mol, offset: P = [0, 0]) {
  const base = m.atoms.length, at = (i: number) => base + i;
  let id = nextId(m);
  const ids = new Map<number, number>();
  for (const x of [...(add.captions ?? []), ...(add.arrows ?? []), ...(add.shapes ?? []), ...(add.cycles ?? []), ...(add.groups ?? [])]) ids.set(x.id, id++);
  const by = (q: [number, number]): [number, number] => [q[0] + offset[0], q[1] + offset[1]];
  const mol: Mol = {
    ...m,
    atoms: [...m.atoms, ...add.atoms.map((a) => ({ ...a, location: [a.location[0] + offset[0], a.location[1] + offset[1], a.location[2] ?? 0] as [number, number, number] }))],
    bonds: [...m.bonds, ...add.bonds.map((b) => ({ ...b, atoms: [at(b.atoms[0]), at(b.atoms[1])] as [number, number] }))],
    arrows: [...(m.arrows ?? []), ...(add.arrows ?? []).map((a) => ({ ...a, id: ids.get(a.id)!, from: by(a.from), to: by(a.to),
      ...(a.curve ? { curve: { ...a.curve, points: a.curve.points.map((q) => ({ at: by(q.at), ...(q.c1 ? { c1: by(q.c1) } : {}), ...(q.c2 ? { c2: by(q.c2) } : {}) })) } } : {}) }))],
    shapes: [...(m.shapes ?? []), ...(add.shapes ?? []).map((x) => ({ ...x, id: ids.get(x.id)!, from: by(x.from), to: by(x.to) }))],
    cycles: [...(m.cycles ?? []), ...(add.cycles ?? []).map((c) => ({ ...c, id: ids.get(c.id)!, centre: by(c.centre), nodes: c.nodes.map((n) => n.map(at)) }))],
    captions: [...(m.captions ?? []), ...(add.captions ?? []).map((c) => ({
      ...c, id: ids.get(c.id)!, x: c.x + offset[0], y: c.y + offset[1], ...(c.under ? { under: c.under.map(at) } : {}),
      ...(c.on ? { on: { ...c.on, arrow: ids.get(c.on.arrow) ?? c.on.arrow } } : {}), ...(c.cycle ? { cycle: { ...c.cycle, cycle: ids.get(c.cycle.cycle) ?? c.cycle.cycle } } : {}),
    }))],
    groups: [...(m.groups ?? []), ...(add.groups ?? []).map((g) => ({ ...g, id: ids.get(g.id)!, atoms: g.atoms.map(at), items: g.items.map((x) => ids.get(x) ?? x) }))],
    ...(add.grids?.length ? { grids: [...(m.grids ?? []), ...add.grids.flatMap((g) => (ids.has(g.arrow) ? [{ ...g, arrow: ids.get(g.arrow)! }] : []))] } : {}),
  };
  return { mol, atoms: new Set(add.atoms.map((_, i) => at(i))), items: new Set([...(add.captions ?? []), ...(add.arrows ?? []), ...(add.shapes ?? []), ...(add.cycles ?? [])].map((x) => ids.get(x.id)!)), ids };
}

// Option-drag (as ChemDraw's): copies of the selected atoms (with the bonds between them) and of the picked
// objects, added with new ids. Copied captions keep to copied atoms, arrows and cycles. Returns the drawing, the
// copies' atoms and ids, and each original id's copy.
export function duplicateSelection(m: Mol, atoms: Set<number>, items: Set<number>) {
  const sel = [...atoms].filter((i) => i < m.atoms.length).sort((p, q) => p - q), map = new Map(sel.map((i, k) => [i, m.atoms.length + k]));
  let id = nextId(m);
  const ids = new Map<number, number>();
  for (const x of [...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.captions ?? [])]) if (items.has(x.id)) ids.set(x.id, id++);
  const atom = (i: number) => map.get(i) ?? i;
  const mol: Mol = {
    ...m,
    atoms: [...m.atoms, ...sel.map((i) => ({ ...m.atoms[i] }))],
    bonds: [...m.bonds, ...m.bonds.filter((b) => map.has(b.atoms[0]) && map.has(b.atoms[1])).map((b) => ({ ...b, atoms: [atom(b.atoms[0]), atom(b.atoms[1])] as [number, number] }))],
    arrows: [...(m.arrows ?? []), ...(m.arrows ?? []).filter((a) => ids.has(a.id)).map((a) => ({ ...a, id: ids.get(a.id)! }))],
    shapes: [...(m.shapes ?? []), ...(m.shapes ?? []).filter((x) => ids.has(x.id)).map((x) => ({ ...x, id: ids.get(x.id)! }))],
    cycles: [...(m.cycles ?? []), ...(m.cycles ?? []).filter((c) => ids.has(c.id)).map((c) => ({ ...c, id: ids.get(c.id)!, nodes: c.nodes.map((n) => n.map(atom)) }))],
    captions: [...(m.captions ?? []), ...(m.captions ?? []).filter((c) => ids.has(c.id)).map((c) => ({
      ...c, id: ids.get(c.id)!, ...(c.under ? { under: c.under.map(atom) } : {}),
      ...(c.on && ids.has(c.on.arrow) ? { on: { ...c.on, arrow: ids.get(c.on.arrow)! } } : {}),
      ...(c.cycle && ids.has(c.cycle.cycle) ? { cycle: { ...c.cycle, cycle: ids.get(c.cycle.cycle)! } } : {}),
    }))],
  };
  return { mol, atoms: new Set(map.values()), items: new Set(ids.values()), ids };
}
