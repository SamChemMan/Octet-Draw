// ACS 1996 structure renderer: a KET molecule in, filled outlines and text runs out. Units are px.
// The geometry follows ChemDraw's ACS 1996 output, measured to about 1e-5 pt on a reference drawing:
// - Every bond line is a filled polygon. At an unlabelled atom the polygons meet in a mitred fan.
// - Bonds stop a margin short of the label's glyph outlines, with one cut per bond.
// - Ring double bonds keep the axis line and add an inner line, trimmed back to the ring-angle bisector.
// - Terminal double bonds (C=O) are centred and run on until they meet the neighbouring bonds.
// - Labels are anchored on the advance centre and half the ink height of their first glyph.

import { units } from "./labels.ts";
import { aromaticAtoms, rings as ringsOf } from "./rings.ts";
import { lines as richLines, type TextRun } from "./richtext.ts";
import type { DocStyle } from "./docstyle.ts";
import type { Cycle, CycleText } from "./cycle.ts";

type P = [number, number];
// text: a label that is not one element (OMe, CO2Et, Ph). label then holds the element it attaches through.
// Marks drawn around an atom: radical (unpaired electrons, 1 or 2), pairs (lone pairs shown), circled (the charge
// drawn as ⊕ or ⊖ beside the atom), partial (δ+ or δ−). A radical counts against the atom's hydrogens.
// hmark: a hydrogen shown by a dot on the atom (towards the viewer) or a short hash (away). attach: a wavy line
// across the bond at this end, for a point of attachment. bead: a polymer bead (a resin sphere) at this atom.
export type Atom = {
  label: string; location: [number, number, number]; charge?: number; implicitHCount?: number; text?: string;
  radical?: number; // 1 a doublet (one unpaired electron), 2 a triplet (two), 3 a singlet (a paired carbene)
  isotope?: number; // mass number, written before the element (13C, 2H)
  pairs?: number; circled?: boolean; partial?: "+" | "-"; hmark?: "dot" | "dash"; attach?: boolean; bead?: boolean;
  map?: number; // a reaction atom map number: the same atom before and after
  enhanced?: string; // enhanced stereo: the stereocentre's group, "abs", "&1" (and) or "or1" (or)
  colour?: string; // #rrggbb for the atom's label and marks; unset draws in the document's ink
  depth?: false; // a 3D structure drawn flat (Structure Perspective off); location[2] is the atom's depth, nearer is larger
  cip?: true; // Show Stereochemistry is on for this atom's structure: its R/S (and its double bonds' E/Z) labels show
  halo?: string; // #rrggbb highlight: a disc behind the atom at 40% opacity (ChemDraw's highlight colours; NMR peak colours)
  fill?: string; // #rrggbb ring fill: a ring whose atoms all have the same fill is filled with it at 30% opacity
  circle?: true; // Toggle Aromatic Display: an aromatic ring whose atoms all have this is drawn with a circle
};
// KET stereo: 1 wedge, 6 hashed wedge. display: how a single bond is drawn when it is not plain.
// On a double bond: bold makes the main line bold, dashed the second line dashed, either crosses the two lines.
export type Display = "bold" | "dashed" | "hashed" | "wavy" | "dative" | "hollow" | "either";
// position: where a double bond's second line goes, looking from atoms[0] to atoms[1]; unset means automatic.
export type Bond = { type: number; atoms: [number, number]; stereo?: number; display?: Display; position?: "left" | "centre" | "right"; colour?: string };
// A caption: free text at x, y (bond lengths, y up; the text's anchor point by its alignment), or, with under
// set, kept centred under those atoms by the ACS rule (baseline 15 pt below the structure's ink box).
// Captions under the same structure stack one line apart, in id order.
// on: conditions text, kept centred above or below an arrow (by the arrow's id).
export type Caption = {
  id: number; text: string; x: number; y: number;
  bold?: boolean; italic?: boolean; underline?: boolean; size?: number; align?: "left" | "centre" | "right"; under?: number[];
  on?: { arrow: number; side: "above" | "below" };
  colour?: string; // #rrggbb; unset uses the document's text colour
  cycle?: CycleText; // a catalytic cycle's centre label, or a reagent or product on one of its steps
  font?: string; // the caption's font; unset uses the document's caption font
  runs?: TextRun[]; // the text in runs, each with its own style (rich text); text is always their text joined
};
// An arrow from one point to another (drawing coordinates). bend: how far a curved arrow's middle sits off the
// straight line, as a fraction of its length, to the left looking from start to end.
// line and arc are drawing elements with no head; they share the arrows' handles. style: how the shaft is drawn
// (dashed suits a proposed step; wavy and bold are for lines).
// orbital: an atomic or hybrid orbital drawn from its nucleus (from) to the tip of its main lobe (to).
// cut: a mass-fragmentation line across bonds; the pieces it makes are labelled with their formula and mass.
export type ArrowKind = "reaction" | "equilibrium" | "resonance" | "retro" | "nogo" | "curved" | "fishhook" | "double" | "line" | "arc" | "orbital" | "cut" | "curve";
export type LineStyle = "dashed" | "bold" | "wavy" | "doubled";
// The Curves model, as ChemDraw's Curves menu: a head at either end of a line (none, full, or a half head with its
// barb on the left or right, looking the way the head points), the heads' shape, and a closed curve's fill.
export type Head = "none" | "full" | "left" | "right";
export type HeadShape = "solid" | "hollow" | "angled";
export type CurveFill = "solid" | "shaded" | "faded";
export type OrbitalShape = "s" | "oval" | "lobe" | "hybrid" | "p" | "d" | "dz2";
export type Phase = "plain" | "shaded" | "filled" | "phased";
export const ORBITAL_SHAPES: OrbitalShape[] = ["s", "oval", "lobe", "hybrid", "p", "d", "dz2"];
export const PHASES: Phase[] = ["plain", "shaded", "filled", "phased"];
export type Arrow = {
  id: number; kind: ArrowKind; from: [number, number]; to: [number, number]; bend?: number; style?: LineStyle; orbital?: { shape: OrbitalShape; phase: Phase }; colour?: string;
  start?: Head; end?: Head; head?: HeadShape; // heads set by hand; unset uses the kind's own
  curve?: Curve; fill?: CurveFill; // a pen curve's points (from and to are its ends), and a closed one's fill
};
// Every kind a drawing's arrow list may hold.
export const ALL_ARROW_KINDS: ArrowKind[] = ["reaction", "equilibrium", "resonance", "retro", "nogo", "curved", "fishhook", "double", "line", "arc", "orbital", "cut", "curve"];
export const isOrbital = (a: Pick<Arrow, "kind">) => a.kind === "orbital";
export const ARROW_KINDS: ArrowKind[] = ["reaction", "equilibrium", "resonance", "retro", "nogo", "curved", "fishhook", "double"];
export const LINE_KINDS: ArrowKind[] = ["line", "arc"];
export const curved = (a: Pick<Arrow, "kind">) => a.kind === "curved" || a.kind === "fishhook" || a.kind === "double" || a.kind === "arc";
// Arrows that carry reaction conditions and make up reactions: straight ones with heads.
export const straightArrow = (a: Pick<Arrow, "kind">) => !curved(a) && a.kind !== "line" && a.kind !== "orbital" && a.kind !== "cut" && a.kind !== "curve";
export const isLine = (a: Pick<Arrow, "kind">) => a.kind === "line" || a.kind === "arc" || a.kind === "curve";
// Lines that take the Curves menu's heads: everything drawn as one shaft (not equilibrium, retrosynthetic or
// no-reaction arrows, orbitals or fragmentation cuts).
export const takesHeads = (a: Pick<Arrow, "kind">) => !["equilibrium", "retro", "nogo", "orbital", "cut"].includes(a.kind);
// A line's heads: the ones set by hand, or its kind's.
export function headsOf(a: Pick<Arrow, "kind" | "bend" | "start" | "end">): { start: Head; end: Head } {
  const own: Record<string, [Head, Head]> = {
    reaction: ["none", "full"], curved: ["none", "full"], double: ["full", "full"], resonance: ["full", "full"], nogo: ["none", "full"],
    fishhook: ["none", (a.bend ?? 0) >= 0 ? "left" : "right"], // the barb on the outside of the curve
  };
  const [start, end] = own[a.kind] ?? ["none", "none"];
  return { start: a.start ?? start, end: a.end ?? end };
}
// Curved arrows are circular arcs. Their sweeps on offer, and the bend that gives each one.
export const SWEEPS = [90, 120, 180, 270];
export const sweepBend = (degrees: number) => Math.tan((degrees * Math.PI) / 720) / 2;
export const sweepOf = (bend: number) => (4 * Math.atan(2 * Math.abs(bend)) * 180) / Math.PI;
// A box, rounded box, oval, highlight or brackets, spanning from one corner to the other (drawing coordinates).
// colour: the outline's colour, or a highlight's fill; unset is the ink colour (a highlight's is mist).
// fill: shaded (lit from the top left) or solid in the colour. shadow: a grey shadow down and to the right, with the
// shape filled white over it. side: one bracket only. mark: a sign at a bracket's top right (‡, †, a charge, n).
export type ShapeKind = "box" | "rounded" | "oval" | "highlight" | "brackets" | "parens" | "braces" | "tlc" | "table";
// A table's cells, row by row (the first row is the header), and its rules: journal style (top, header and bottom
// rules only) or a full grid.
// widths and heights: every column's width and every row's height once a border has been dragged (bond lengths; a
// column is never narrower than its text). lines: the lines drawn, from the edges, the rule under the header row,
// the lines between rows and the lines between columns (journal rules when unset: top, header and bottom; grid: true
// in older files is every line). align: each column's text (centred when unset). weight: the lines' width in points.
export type TableLine = "top" | "bottom" | "left" | "right" | "header" | "rows" | "cols";
export type CellAlign = "left" | "centre" | "right";
export type Table = { cells: string[][]; grid?: boolean; widths?: number[]; heights?: number[]; lines?: TableLine[]; align?: CellAlign[]; weight?: number };
export const TABLE_LINES: Record<"journal" | "grid" | "box" | "none", TableLine[]> = {
  journal: ["top", "header", "bottom"], grid: ["top", "bottom", "left", "right", "header", "rows", "cols"], box: ["top", "bottom", "left", "right"], none: [],
};
export const linesOf = (t?: Table): TableLine[] => t?.lines ?? (t?.grid ? TABLE_LINES.grid : TABLE_LINES.journal);
// A pen curve: anchor points joined by cubic Béziers. c1 is a point's incoming handle, c2 its outgoing one; a point
// without handles is a corner. A closed curve joins its last point back to its first.
export type CurvePoint = { at: [number, number]; c1?: [number, number]; c2?: [number, number] };
export type Curve = { points: CurvePoint[]; closed?: boolean };
// A TLC plate's lanes and spots: each spot in a lane at its Rf (0 at the origin, 1 at the solvent front).
// A TLC plate: its lanes and spots, Rf values shown for all, the origin's height and the front's depth (fractions of
// the plate, from the bottom and the top), and parts hidden, as ChemDraw's TLC tool.
export type Tlc = { lanes: number; spots: Spot[]; rf?: boolean; origin?: number; front?: number; hide?: ("origin" | "front" | "border")[] };
// A spot: its lane and Rf, and when set by hand its colour, style, half-width and half-height, the smear below it
// (bond lengths), and its own Rf label.
export type Spot = { lane: number; rf: number; colour?: string; style?: "hollow" | "shaded"; w?: number; h?: number; tail?: number; showRf?: true };
export type Shape = {
  id: number; kind: ShapeKind; from: [number, number]; to: [number, number]; dashed?: boolean; colour?: string;
  fill?: "shaded" | "solid"; shadow?: boolean; side?: "left" | "right"; mark?: string; tlc?: Tlc; table?: Table;
  shade?: Shade; // a shadow's look, when it differs from SHADE
};
// A shadow: how far it falls down and right and how soft its edge is (bond lengths), and how dark it is (0 to 1).
export type Shade = { depth: number; blur: number; opacity: number };
export const SHADE: Shade = { depth: 0.12, blur: 0, opacity: 0.35 };
export const isBracket = (sh: Pick<Shape, "kind">) => sh.kind === "brackets" || sh.kind === "parens" || sh.kind === "braces";
export const SHAPE_KINDS: ShapeKind[] = ["box", "rounded", "oval", "highlight", "brackets", "parens", "braces", "tlc", "table"];
export const HIGHLIGHT = "#DCE4F5";
// Captions, arrows, shapes and cycles share one set of ids.
export type Mol = { atoms: Atom[]; bonds: Bond[]; captions?: Caption[]; arrows?: Arrow[]; shapes?: Shape[]; cycles?: Cycle[]; groups?: Group[]; grids?: Grid[]; style?: DocStyle };
// A stoichiometry grid (Structure > Analyze Stoichiometry) under the reaction an arrow belongs to: what was typed for
// each component ("r0", "r1"… reactants, "p0"… products, in reading order), in base units, and the limiting reactant.
// Everything else is worked out from the reaction as it is drawn (stoich.ts).
export type Grid = { arrow: number; typed: Record<string, Partial<Record<"mass" | "moles" | "equiv" | "volume" | "density" | "molarity" | "purity" | "measured", number>>>; limiting?: string };
// A group (Object > Group): atoms and other objects (captions, arrows, shapes, cycles, by id) that select and move as
// one. An integral group is never split: a click on any part picks all of it.
export type Group = { id: number; atoms: number[]; items: number[]; integral?: true };
// Sizes in px: bond length, line width, bold width, double-bond spacing, hash spacing, label margin, label font size.
export type Style = { bond: number; line: number; bold: number; spacing: number; hash: number; margin: number; size: number };
// width: advance; ascent: ink top above the baseline; outline: glyph edge points relative to the text origin (y down).
export type Ink = { width: number; ascent: number; outline: P[] };
export type Label = { text: string; x: number; y: number; size: number; colour?: string; alpha?: number };
export type Box = [number, number, number, number];
// ink: each atom's ink box (its label and the bonds that touch it), for placing captions. label: the ink box of an
// atom's label alone (NH2, OMe), for highlighting it; undefined for an unlabelled atom. scale: px per bond length.
// electrons: where each lone pair and radical dot is drawn (px), for curly arrows to start from. beads: polymer beads,
// drawn shaded by the caller.
export type Drawing = {
  polygons: P[][]; colours: (string | undefined)[]; alphas: number[]; labels: Label[]; box: Box; ink: Box[]; label: (Box | undefined)[]; scale: number;
  electrons: { atom: number; at: P }[]; beads: { at: P; r: number }[];
};

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const unit = (a: P): P => mul(a, 1 / len(a));
const perp = (a: P): P => [-a[1], a[0]];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const angle = (a: P, b: P) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b)))));

// Label type: subscripts 75% and 0.212 em down, charges 75% and 0.33 em up.
const SUB = 0.75, DROP = 0.212, RISE = 0.33;
const TIP = 0.0165; // wedge half-width at the stereocentre, as a fraction of the bond length
const MAX_TRIM = 0.67; // an inner-line trim longer than this (times the bond length) is skipped
const H_FIRST = new Set(['O', 'F', 'S', 'Cl', 'Se', 'Br', 'Te', 'I']); // H2O, HCl; but NH3, CH4
const VALENCE: Record<string, number> = { C: 4, Si: 4, N: 3, P: 3, As: 3, B: 3, Al: 3, O: 2, S: 2, Se: 2, Te: 2, F: 1, Cl: 1, Br: 1, I: 1 };
const ORDER: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 1.5 };

export function hydrogens(label: string, charge: number, used: number, radical = 0) {
  const v = VALENCE[label];
  if (v === undefined) return 0;
  const target = v === 4 ? v - Math.abs(charge) : label === 'B' || label === 'Al' ? v - charge : v + charge;
  return Math.max(0, Math.round(target - used - radical));
}
// Valence electrons, for how many lone pairs an atom can show.
const SHELL: Record<string, number> = { H: 1, B: 3, Al: 3, C: 4, Si: 4, N: 5, P: 5, As: 5, O: 6, S: 6, Se: 6, Te: 6, F: 7, Cl: 7, Br: 7, I: 7 };
// The lone pairs an atom has: what is left of its valence electrons after its bonds, hydrogens, charge and radical.
export function lonePairs(label: string, charge: number, used: number, h: number, radical = 0) {
  const e = SHELL[label];
  return e === undefined ? 0 : Math.max(0, Math.floor((e - used - h - charge - radical) / 2));
}

const segDist = (q: P, a: P, b: P) => {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(q, a), ab) / (dot(ab, ab) || 1)));
  return len(sub(q, add(a, mul(ab, t))));
};

// Where line p + r·t meets line q + s·t; null if they are parallel.
const meet = (p: P, r: P, q: P, s: P): P | null => {
  const d = cross(r, s);
  return Math.abs(d) < 1e-9 ? null : add(p, mul(r, cross(sub(q, p), s) / d));
};

// Small rings through bond a–b (simple paths from a back to b, up to 8 atoms).
function ringsThrough(a: number, b: number, nbrs: number[][]): number[][] {
  const out: number[][] = [];
  const walk = (path: number[]) => {
    const at = path[path.length - 1];
    if (path.length > 8) return;
    for (const n of nbrs[at]) {
      if (n === b) out.push([...path, b]);
      else if (!path.includes(n)) walk([...path, n]);
    }
  };
  for (const n of nbrs[a]) if (n !== b) walk([a, n]);
  return out;
}

// A bond, planned. Kinds 'line' and 'wedge' join the fans; 'none' is a centred double bond (its two lines only).
// 'dash', 'hashbar' and 'wavy' are drawn along the axis and stay out of the fans. half: the line's half-width
// when it is not the normal one (bold). head: an arrowhead at b (dative bond).
// lines: extra lines parallel to the axis at offset o, trimmed t0 at a and t1 at b (negative runs past the atom).
// cut: distance from a and from b at which a label stops the bond.
type Plan = {
  a: number; b: number; u: P; n: P; length: number;
  kind: 'line' | 'wedge' | 'hash' | 'none' | 'dash' | 'hashbar' | 'wavy' | 'hollow';
  half?: number;
  head?: boolean;
  // half: a line's own half width (a bold double's); dashed: drawn as dashes (a dashed double's second line).
  lines: { o: number; t0: number; t1: number; half?: number; dashed?: boolean }[];
  cross?: boolean; // a double bond drawn as two crossing lines (either geometry)
  cut: [number, number];
  hidden?: boolean;
};

// scale: px per input unit. By default the median bond is drawn at the style's bond length.
export function render(mol: Mol, s: Style, measure: (text: string) => Ink, scale?: number): Drawing {
  const raw = mol.bonds.map((b) => len(sub(mol.atoms[b.atoms[0]].location as unknown as P, mol.atoms[b.atoms[1]].location as unknown as P)));
  const median = [...raw].sort((x, y) => x - y)[Math.floor(raw.length / 2)] || 1;
  const k = scale ?? s.bond / median;
  const pts: P[] = mol.atoms.map((a) => [a.location[0] * k, -a.location[1] * k]); // KET y points up
  const nbrs: number[][] = mol.atoms.map(() => []);
  mol.bonds.forEach((b) => { nbrs[b.atoms[0]].push(b.atoms[1]); nbrs[b.atoms[1]].push(b.atoms[0]); });
  const bondAt = new Map<string, Bond>();
  const key = (i: number, j: number) => (i < j ? `${i} ${j}` : `${j} ${i}`);
  mol.bonds.forEach((b) => bondAt.set(key(b.atoms[0], b.atoms[1]), b));
  const L = s.bond, hw = s.line / 2, wide = s.bold * 0.75, tip = TIP * L;
  const deg = (i: number) => nbrs[i].length;
  const dir = (i: number, j: number) => unit(sub(pts[j], pts[i]));

  // Labels. Heteroatoms and lone carbons get one; skeletal carbons don't, even when charged.
  const labelled = mol.atoms.map((a, i) => !a.attach && !a.bead && (a.label !== 'C' || !deg(i) || !!a.text || !!a.isotope));
  const labels: Label[] = [], labelAtom = new Map<Label, number>();
  const marks: P[][] = mol.atoms.map(() => []); // ink that is not a label shape (a skeletal carbon's charge)
  const sign = (c: number) => `${Math.abs(c) > 1 ? Math.abs(c) : ''}${c > 0 ? '+' : '–'}`;
  const shapes: P[][] = mol.atoms.map((a, i) => {
    if (!labelled[i]) {
      // A charged skeletal carbon: the sign alone, in the direction furthest from its bonds (up-right on a tie).
      if (a.charge && !a.circled) {
        const t = sign(a.charge), m = measure(t), dirs = nbrs[i].map((j) => dir(i, j));
        const gap = (c: P) => Math.min(...dirs.map((b) => angle(b, c)));
        const d = ([[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]] as P[]).map(unit).reduce((best, c) => (gap(c) > gap(best) + 0.01 ? c : best));
        const c = add(pts[i], mul(d, 0.6 * s.size));
        labels.push({ text: t, x: c[0] - (m.width * SUB) / 2, y: c[1] + (m.ascent * SUB) / 2, size: s.size * SUB, colour: a.colour });
        labelAtom.set(labels[labels.length - 1], i);
        marks[i] = m.outline.map(([px, py]) => [c[0] - (m.width * SUB) / 2 + px * SUB, c[1] + (m.ascent * SUB) / 2 + py * SUB]);
      }
      return [];
    }
    const shape: P[] = [];
    const run = (text: string, x: number, y: number, f = 1) => {
      labels.push({ text, x, y, size: s.size * f, colour: a.colour });
      labelAtom.set(labels[labels.length - 1], i);
      for (const [px, py] of measure(text).outline) shape.push([x + px * f, y + py * f]);
    };
    const [x, y] = pts[i];
    // Which way the label reads: away from the bonds. Bonds on the right (within 70° of horizontal) reverse it.
    const v = nbrs[i].reduce<P>((acc, j) => add(acc, dir(i, j)), [0, 0]);
    const steep = len(v) > 1e-6 && Math.abs(v[1]) > Math.abs(v[0]) * Math.tan((70 * Math.PI) / 180);
    if (a.text) {
      // A written label: units in order, reversed when it reads right to left (OMe as MeO). The attaching
      // unit's first glyph sits centred on the atom.
      const us = units(a.text), reversed = deg(i) > 0 && !steep && v[0] > 1e-6;
      const width = (u: (typeof us)[number]) => measure(u.text).width + (u.count ? measure(u.count).width * SUB : 0);
      const first = measure(us[0].text[0]), base = y + first.ascent / 2;
      const order = reversed ? [...us].reverse() : us;
      let cx = x - first.width / 2 - (reversed ? order.slice(0, -1).reduce((w, u) => w + width(u), 0) : 0);
      for (const u of order) {
        run(u.text, cx, base);
        if (u.count) run(u.count, cx + measure(u.text).width, base + DROP * s.size, SUB);
        cx += width(u);
      }
      const right = reversed ? x - first.width / 2 + width(us[0]) : cx;
      if (a.charge && !a.circled) run(sign(a.charge), right, base - RISE * s.size, SUB);
      return shape;
    }
    const first = measure(a.label[0]);
    const ox = x - first.width / 2, base = y + first.ascent / 2;
    run(a.label, ox, base);
    // An isotope's mass number, raised, just before the element.
    if (a.isotope) { const t = String(a.isotope); run(t, ox - measure(t).width * SUB, base - RISE * s.size, SUB); }
    const charge = a.charge ?? 0;
    const used = nbrs[i].reduce((n, j) => n + (ORDER[bondAt.get(key(i, j))!.type] ?? 1), 0);
    const h = a.implicitHCount ?? hydrogens(a.label, charge, used, a.radical === 3 ? 2 : a.radical);
    const count = h > 1 ? String(h) : '';
    const hW = measure('H').width, cW = count ? measure(count).width * SUB : 0;
    const hs = (hx: number, hy: number) => { run('H', hx, hy); if (count) run(count, hx + hW, hy + DROP * s.size, SUB); };
    let end = ox + measure(a.label).width; // the charge goes here
    if (h) {
      // Sum of the bond directions: within 70° of horizontal, H goes on the far side; steeper, H stacks (indole NH).
      if (deg(i) ? !steep && v[0] > 1e-6 : H_FIRST.has(a.label)) hs(ox - hW - cW, base); // HO, H2N
      else if (!steep || deg(i) < 2) { hs(end, base); end += hW + cW; } // OH, NH2
      else { const pitch = 1.1 * measure('H').ascent; hs(x - hW / 2, base + (v[1] > 0 ? -pitch : pitch)); }
    }
    if (charge && !a.circled) run(sign(charge), end, base - RISE * s.size, SUB);
    return shape;
  });

  // Marks around atoms: a circled charge, a partial charge, radical dots and lone pairs. A circled or partial
  // charge sits up and to the right when that is clear; the rest share out the widest gaps between the bonds and
  // the label, evenly spaced, and each sits just clear of the label.
  const symbols: P[][][] = mol.atoms.map(() => []);
  const electrons: { atom: number; at: P }[] = [], beads: { at: P; r: number }[] = [];
  const TAU = 2 * Math.PI, turn = (x: number) => ((x % TAU) + TAU) % TAU;
  // Every polygon winds one way (see polygons below); a disc or ring built here is turned to match.
  const wound = (poly: P[]) => (poly.reduce((sum, q, j) => sum + cross(q, poly[(j + 1) % poly.length]), 0) > 0 ? poly.reverse() : poly);
  const disc = (c: P, r: number): P[] => wound(Array.from({ length: 20 }, (_, j) => add(c, [r * Math.cos((TAU * j) / 20), r * Math.sin((TAU * j) / 20)])));
  mol.atoms.forEach((a, i) => {
    const kinds: ('charge' | 'partial' | 'radical' | 'pair')[] = [];
    if (a.circled && a.charge) kinds.push('charge');
    if (a.partial) kinds.push('partial');
    for (let r = 0; r < Math.min(2, a.radical === 3 ? 0 : a.radical ?? 0); r++) kinds.push('radical');
    if (a.radical === 3) kinds.push('pair');
    for (let r = 0; r < Math.min(4, a.pairs ?? 0); r++) kinds.push('pair');
    if (!kinds.length) return;
    const X = pts[i], z = s.size, shape = shapes[i];
    // Directions already taken: the bonds, the label past its first letter (H, a charge sign), a skeletal charge.
    const taken = nbrs[i].map((j) => { const d = dir(i, j); return Math.atan2(d[1], d[0]); });
    for (const q of [...shape, ...marks[i]]) if (len(sub(q, X)) > 0.62 * z) taken.push(Math.atan2(q[1] - X[1], q[0] - X[0]));
    const clearOf = (t: number, need: number) => taken.every((b) => Math.abs(Math.atan2(Math.sin(t - b), Math.cos(t - b))) >= need);
    const at = new Map<number, number>(); // index in kinds → angle
    const UP_RIGHT = -Math.PI / 4;
    if ((kinds[0] === 'charge' || kinds[0] === 'partial') && clearOf(UP_RIGHT, Math.PI / 5)) { at.set(0, UP_RIGHT); taken.push(UP_RIGHT); }
    const rest = kinds.map((_, k) => k).filter((k) => !at.has(k));
    const sorted = taken.map(turn).sort((x, y) => x - y);
    const gaps = sorted.length
      ? sorted.map((t, j) => ({ start: t, size: j + 1 < sorted.length ? sorted[j + 1] - t : sorted[0] + TAU - t, n: 0 }))
      : [{ start: -Math.PI / 2 - Math.PI / Math.max(1, rest.length), size: TAU, n: 0 }];
    for (const _ of rest) gaps.reduce((best, g) => (g.size / (g.n + 1) > best.size / (best.n + 1) + 1e-6 ? g : best)).n++;
    let next = 0;
    for (const g of gaps.sort((x, y) => x.start - y.start)) for (let j = 0; j < g.n; j++) at.set(rest[next++], g.start + (g.size * (j + 1)) / (g.n + 1));
    kinds.forEach((kind, k) => {
      const t = at.get(k)!, d: P = [Math.cos(t), Math.sin(t)], n = perp(d);
      // The mark as discs (centre offset across, radius); how far out it goes is found by search.
      const R = kind === 'charge' ? 0.34 * z : kind === 'radical' ? 0.1 * z : kind === 'pair' ? 0.09 * z : 0;
      const text = kind === 'partial' ? (a.partial === '+' ? 'δ+' : 'δ–') : '', ink = text ? measure(text) : undefined;
      const parts: [number, number][] = kind === 'pair' ? [[0.19 * z, R], [-0.19 * z, R]] : ink ? [[0, (Math.max(ink.width, ink.ascent) * SUB) / 2]] : [[0, R]];
      const gap = 0.14 * z;
      const fits = (r: number) => parts.every(([o, pr]) => { const c = add(add(X, mul(d, r)), mul(n, o)); return shape.every((q) => len(sub(q, c)) >= pr + gap); });
      // Start past the label along the way out (so nothing sits inside a letter's counter), then find the
      // nearest distance that clears every outline point.
      const corridor = Math.max(...parts.map(([o, pr]) => Math.abs(o) + pr)) + gap;
      let lo = shape.length ? Math.max(0, ...shape.filter((q) => Math.abs(cross(sub(q, X), d)) < corridor).map((q) => dot(sub(q, X), d))) : 0.3 * z + Math.max(...parts.map((x) => x[1]));
      let hi = lo + 3 * z;
      if (!fits(lo)) { for (let j = 0; j < 24; j++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; } lo = hi; }
      const c = add(X, mul(d, lo));
      if (kind === 'radical' || kind === 'pair') { for (const [o, pr] of parts) symbols[i].push(disc(add(c, mul(n, o)), pr)); electrons.push({ atom: i, at: c }); }
      if (kind === 'charge') {
        // A ring the line width thick, with the sign inside it.
        for (let j = 0; j < 40; j++) {
          const a0 = (TAU * j) / 40, a1 = (TAU * (j + 1)) / 40, ro = R + hw, ri = R - hw;
          symbols[i].push(wound([add(c, [ri * Math.cos(a0), ri * Math.sin(a0)]), add(c, [ro * Math.cos(a0), ro * Math.sin(a0)]), add(c, [ro * Math.cos(a1), ro * Math.sin(a1)]), add(c, [ri * Math.cos(a1), ri * Math.sin(a1)])]));
        }
        const arm = 0.58 * R, bar = (u: P) => symbols[i].push(wound([add(c, add(mul(u, -arm), mul(perp(u), -hw))), add(c, add(mul(u, -arm), mul(perp(u), hw))), add(c, add(mul(u, arm), mul(perp(u), hw))), add(c, add(mul(u, arm), mul(perp(u), -hw)))]));
        bar([1, 0]);
        if ((a.charge ?? 0) > 0) bar([0, 1]);
      }
      if (ink) {
        const x = c[0] - (ink.width * SUB) / 2, y = c[1] + (ink.ascent * SUB) / 2;
        labels.push({ text, x, y, size: z * SUB, colour: a.colour });
        labelAtom.set(labels[labels.length - 1], i);
        for (const [px, py] of ink.outline) marks[i].push([x + px * SUB, y + py * SUB]);
      }
    });
  });

  // An H dot sits on the atom; an H hash points into the widest gap; an attachment squiggle crosses the bond at the
  // atom; a bead is a sphere on the atom.
  mol.atoms.forEach((a, i) => {
    if (!a.hmark && !a.attach && !a.bead) return;
    const X = pts[i], dirs = nbrs[i].map((j) => dir(i, j));
    if (a.hmark === 'dot') symbols[i].push(disc(X, 0.09 * L));
    if (a.hmark === 'dash') {
      const angles = dirs.map((d) => Math.atan2(d[1], d[0])).sort((x, y) => x - y);
      let best = -Math.PI / 2;
      if (angles.length) {
        const gaps = angles.map((t, j) => ({ t, size: (j + 1 < angles.length ? angles[j + 1] : angles[0] + 2 * Math.PI) - t }));
        const g = gaps.reduce((p, q) => (q.size > p.size ? q : p));
        best = g.t + g.size / 2;
      }
      const u: P = [Math.cos(best), Math.sin(best)], n = perp(u);
      for (let k = 1; k <= 3; k++) {
        const c = add(X, mul(u, 0.1 * L * k)), half = 0.04 * L + 0.025 * L * k;
        symbols[i].push(wound([add(add(c, mul(n, -half)), mul(u, -hw)), add(add(c, mul(n, half)), mul(u, -hw)), add(add(c, mul(n, half)), mul(u, hw)), add(add(c, mul(n, -half)), mul(u, hw))]));
      }
    }
    if (a.attach) {
      // A wave across the bond, 0.6 bond lengths long.
      const u = dirs[0] ?? [1, 0], n = perp(u), wave = waveAlong([add(X, mul(n, -0.3 * L)), add(X, mul(n, 0.3 * L))], 0.05 * L, 0.15 * L);
      for (let k = 0; k + 1 < wave.length; k++) {
        const p = wave[k], q = wave[k + 1], v = unit(sub(q, p)), m = perp(v);
        symbols[i].push(wound([add(p, mul(m, -hw)), add(p, mul(m, hw)), add(q, mul(m, hw)), add(q, mul(m, -hw))]));
      }
    }
    if (a.bead) { beads.push({ at: X, r: 0.3 * L }); for (const q of [add(X, [-0.3 * L, -0.3 * L]), add(X, [0.3 * L, 0.3 * L])]) marks[i].push(q); }
  });

  const plans: Plan[] = mol.bonds.map((bond) => {
    const [a, b] = bond.atoms, p = pts[a], q = pts[b];
    const length = len(sub(q, p)), u = unit(sub(q, p)), n = perp(u);
    const plan: Plan = { a, b, u, n, length, kind: 'line', lines: [], cut: [0, 0] };
    const side = (j: number) => Math.sign(dot(sub(pts[j], p), n));
    // Angles at x from the bond to x's other neighbours on one side, smallest first.
    const near = (x: number, y: number, sd: number) =>
      nbrs[x].filter((j) => j !== y && side(j) === sd).map((j) => angle(sub(pts[y], pts[x]), sub(pts[j], pts[x]))).sort((m, l) => m - l);

    if (bond.type === 1 && (bond.stereo === 1 || bond.stereo === 6)) { plan.kind = bond.stereo === 1 ? 'wedge' : 'hash'; return plan; }
    if (bond.type === 1 && bond.display) {
      if (bond.display === 'bold') plan.half = s.bold / 2;
      else if (bond.display === 'dative') plan.head = true;
      else plan.kind = bond.display === 'dashed' ? 'dash' : bond.display === 'hashed' ? 'hashbar' : bond.display === 'hollow' ? 'hollow' : 'wavy';
      return plan;
    }
    if (bond.type === 3) { plan.lines = [s.spacing, -s.spacing].map((o) => ({ o, t0: 0, t1: 0 })); return plan; }
    if (bond.type !== 2) return plan;
    // Bold double (ChemDraw's ⇧B): the main line bold, the second line normal and moved out by the extra width, so
    // the gap between them looks the same as a plain double bond's.
    const bold = bond.display === "bold", extra = bold ? s.bold / 2 - hw : 0, spacing = s.spacing + extra;
    // Double Either: two lines crossing between the atoms, whatever the ring or substituents.
    if (bond.display === "either") { plan.kind = 'none'; plan.cross = true; return plan; }

    // Side of the second line: into the ring with the most double bonds (then six-membered, then smallest),
    // toward the inside of the angle at an unlabelled degree-2 end, or toward more substituents. 0 = centred.
    let sd = 0, ring: number[] | undefined;
    const rings = ringsThrough(a, b, nbrs);
    // A position the user set wins. On screen (y down) the left of a→b is the -n side.
    if (bond.position) sd = bond.position === "centre" ? 0 : bond.position === "left" ? -1 : 1;
    else if (rings.length) {
      const doubles = (r: number[]) => r.reduce((c, at, i) => c + (i && bondAt.get(key(r[i - 1], at))?.type === 2 ? 1 : 0), 0);
      ring = rings.sort((x, y) => doubles(y) - doubles(x) || Number(y.length === 6) - Number(x.length === 6) || x.length - y.length)[0];
      const centre = mul(ring.reduce<P>((c, i) => add(c, pts[i]), [0, 0]), 1 / ring.length);
      sd = Math.sign(dot(sub(centre, p), n));
    } else if (deg(a) === 1 || deg(b) === 1) {
      const inner = deg(a) === 1 ? b : a, outer = inner === a ? b : a;
      if (deg(inner) === 2 && !labelled[inner]) sd = side(nbrs[inner].find((j) => j !== outer)!);
    } else {
      const linear = (x: number, y: number) =>
        deg(x) === 2 && nbrs[x].every((j) => bondAt.get(key(x, j))!.type === 2) &&
        angle(sub(pts[y], pts[x]), sub(pts[nbrs[x].find((j) => j !== y)!], pts[x])) > (161.8 * Math.PI) / 180;
      if (!(labelled[a] && labelled[b]) && !linear(a, b) && !linear(b, a)) {
        const others = [...nbrs[a].filter((j) => j !== b), ...nbrs[b].filter((j) => j !== a)];
        sd = Math.sign(others.reduce((c, j) => c + side(j), 0)) || side(nbrs[a].find((j) => j !== b)!);
      }
    }

    if (!sd) {
      // Centred: lines at ±spacing/2 that stay out of the fan and run on to the neighbouring bond's axis.
      plan.kind = 'none';
      const h = spacing / 2;
      const reach = (x: number, y: number, o: number) => {
        const phi = labelled[x] ? undefined : near(x, y, Math.sign(o))[0];
        return phi === undefined ? 0 : h / Math.tan(phi);
      };
      plan.lines = [h, -h].map((o, k) => ({ o, t0: reach(a, b, o), t1: reach(b, a, o), ...(bold && !k ? { half: s.bold / 2 } : {}), ...(bond.display === "dashed" && k ? { dashed: true } : {}) }));
      return plan;
    }
    // Offset: the axis joins the fan; the inner line is trimmed back to the angle bisector at unlabelled ends.
    const trim = (x: number, y: number, ringNbr?: number) => {
      if (labelled[x]) return 0;
      const theta = ringNbr !== undefined ? angle(sub(pts[y], pts[x]), sub(pts[ringNbr], pts[x])) : near(x, y, sd)[0];
      if (theta === undefined) return 0;
      const t = spacing / Math.tan(theta / 2);
      return t > MAX_TRIM * L ? 0 : t;
    };
    if (bold) plan.half = s.bold / 2;
    plan.lines = [{ o: sd * spacing, t0: trim(a, b, ring?.[1]), t1: trim(b, a, ring?.[ring.length - 2]), ...(bond.display === "dashed" ? { dashed: true } : {}) }];
    return plan;
  });
  // Aromatic rings drawn with a circle (Toggle Aromatic Display): their bonds are single lines, and a circle sits
  // inside each ring, 0.6 of the way from the centre to the bonds. The structure keeps its Kekulé bonds.
  const circled = mol.atoms.some((a) => a.circle) ? (() => {
    const used = mol.atoms.map(() => 0);
    for (const b of mol.bonds) for (const i of b.atoms) used[i] += b.type;
    const g = { atoms: mol.atoms.map((a, i) => ({ el: a.text ? "X" : a.label, charge: a.charge ?? 0, h: a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i]) })), bonds: mol.bonds.map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: Math.min(3, Math.max(1, b.type)) as 1 | 2 | 3 })) };
    const aromatic = aromaticAtoms(g);
    return ringsOf(g).filter((r) => r.length >= 5 && r.length <= 8 && r.every((i) => mol.atoms[i].circle && aromatic[i]));
  })() : [];
  for (const r of circled) r.forEach((x, k) => {
    const y = r[(k + 1) % r.length], pl = plans[mol.bonds.findIndex((b) => (b.atoms[0] === x && b.atoms[1] === y) || (b.atoms[0] === y && b.atoms[1] === x))];
    if (pl && mol.bonds[mol.bonds.indexOf(mol.bonds.find((b) => (b.atoms[0] === x && b.atoms[1] === y) || (b.atoms[0] === y && b.atoms[1] === x))!)].type === 2) { pl.lines = []; pl.kind = 'line'; delete pl.half; }
  });

  // Label cuts: the shortest cut along the axis at which every line of the bond clears the glyph outlines.
  // Provisional sizes for the bond styles ChemDraw's reference drawing did not include.
  const WAVE = 0.08 * L; // wavy bond amplitude
  const half = (pl: Plan) => pl.half ?? (pl.kind === 'hashbar' ? s.bold / 2 : pl.kind === 'wavy' ? WAVE + hw : hw);
  const widths = (pl: Plan, x: number): [number, number] =>
    pl.kind === 'wedge' || pl.kind === 'hash' || pl.kind === 'hollow' ? (x === pl.a ? [tip, wide] : [wide, tip]) : [half(pl), half(pl)];
  for (const pl of plans) {
    for (const end of [0, 1] as const) {
      const x = end ? pl.b : pl.a, shape = shapes[x];
      if (!shape.length) continue;
      const u = end ? mul(pl.u, -1) : pl.u, w = widths(pl, x)[0];
      const offsets = [...(pl.kind === 'none' ? [] : [0]), ...pl.lines.map((l) => l.o)];
      const clear = (t: number) => offsets.every((o) => {
        const from = add(add(pts[x], mul(u, t)), mul(pl.n, o)), to = add(add(pts[x], mul(u, pl.length)), mul(pl.n, o));
        return shape.every((q) => segDist(q, from, to) >= s.margin + w);
      });
      if (clear(0)) continue;
      if (!clear(pl.length)) { pl.hidden = true; break; }
      let lo = 0, hi = pl.length;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (clear(mid)) hi = mid; else lo = mid; }
      pl.cut[end] = hi;
    }
  }

  // Mitred fans at unlabelled atoms. Each end is a list of points from the -n to the +n side of the
  // bond as seen from that atom; with two or more members it passes through the atom centre.
  const drawnEnd = (pl: Plan, x: number): P => (x === pl.a ? add(pts[pl.a], mul(pl.u, pl.cut[0])) : add(pts[pl.b], mul(pl.u, -pl.cut[1])));
  const ends = new Map<string, P[]>();
  mol.atoms.forEach((_, x) => {
    if (labelled[x]) return;
    const X = pts[x];
    const members = plans
      .map((pl, i) => ({ pl, i }))
      .filter(({ pl }) => !pl.hidden && (pl.kind === 'line' || pl.kind === 'wedge') && (pl.a === x || pl.b === x))
      .map(({ pl, i }) => {
        const f = drawnEnd(pl, x === pl.a ? pl.b : pl.a), u = unit(sub(f, X)), [w0, w1] = widths(pl, x);
        return { i, u, n: perp(u), w0, w1, f, ang: Math.atan2(u[1], u[0]) };
      })
      .sort((m, l) => m.ang - l.ang);
    type M = (typeof members)[number];
    // Where m's +n edge meets l's -n edge. Parallel, or too far out (very acute angles): square corners instead.
    const miter = (m: M, l: M): [P, P] => {
      const pm = add(X, mul(m.n, m.w0)), pl = add(X, mul(l.n, -l.w0));
      const c = meet(pm, sub(add(m.f, mul(m.n, m.w1)), pm), pl, sub(add(l.f, mul(l.n, -l.w1)), pl));
      return c && len(sub(c, X)) < 6 * Math.max(m.w0, l.w0, hw) ? [c, c] : [pm, pl];
    };
    members.forEach((m, j) => {
      if (members.length === 1) { ends.set(`${m.i} ${x}`, [add(X, mul(m.n, -m.w0)), add(X, mul(m.n, m.w0))]); return; }
      const prev = members[(j + members.length - 1) % members.length], next = members[(j + 1) % members.length];
      ends.set(`${m.i} ${x}`, [miter(prev, m)[1], X, miter(m, next)[0]]);
    });
  });
  // An end with no fan (at a labelled atom): square, at the label cut.
  const endOf = (pl: Plan, i: number, x: number): P[] => {
    const fan = ends.get(`${i} ${x}`);
    if (fan) return fan;
    const n = x === pl.a ? pl.n : mul(pl.n, -1), c = drawnEnd(pl, x), w = widths(pl, x)[0];
    return [add(c, mul(n, -w)), add(c, mul(n, w))];
  };

  // Every polygon winds the same way (-n to +n at its start, then back along +n), so one nonzero path fills them all.
  const polygons: P[][] = [];
  const bar = (S: P, E: P, n: P, w: number) => polygons.push([add(S, mul(n, -w)), add(S, mul(n, w)), add(E, mul(n, w)), add(E, mul(n, -w))]);
  const drawPlan = (pl: Plan, i: number) => {
    if (pl.hidden) return;
    if (pl.kind === 'line' || pl.kind === 'wedge') polygons.push([...endOf(pl, i, pl.a), ...endOf(pl, i, pl.b)]);
    const S = drawnEnd(pl, pl.a), D = pl.length - pl.cut[0] - pl.cut[1];
    if (pl.kind === 'dash') {
      // Evenly spaced dashes, one per hash spacing, the first and last flush with the ends.
      const count = Math.max(1, Math.round(D / s.hash)), dash = Math.min(D, s.hash * 0.55), step = count > 1 ? (D - dash) / (count - 1) : 0;
      for (let k = 0; k < count; k++) bar(add(S, mul(pl.u, k * step)), add(S, mul(pl.u, k * step + dash)), pl.n, hw);
    }
    if (pl.kind === 'hashbar') {
      // Marks of one length (the bold width), evenly spaced from end to end.
      const marks = Math.max(1, Math.round(D / s.hash));
      for (let j = 0; j <= marks; j++) {
        const c = add(S, mul(pl.u, hw + ((D - 2 * hw) * j) / marks));
        bar(add(c, mul(pl.u, -hw)), add(c, mul(pl.u, hw)), pl.n, s.bold / 2);
      }
    }
    if (pl.kind === 'wavy') {
      // A sine wave with a whole number of waves, as one strip of even width.
      const waves = Math.max(1, Math.round(D / (0.25 * L))), k = (2 * Math.PI * waves) / D, steps = waves * 16;
      const left: P[] = [], right: P[] = [];
      for (let j = 0; j <= steps; j++) {
        const t = (D * j) / steps, c = add(add(S, mul(pl.u, t)), mul(pl.n, WAVE * Math.sin(k * t)));
        const normal = perp(unit(add(pl.u, mul(pl.n, WAVE * k * Math.cos(k * t)))));
        left.push(add(c, mul(normal, hw)));
        right.push(add(c, mul(normal, -hw)));
      }
      polygons.push([right[0], ...left, ...right.slice(1).reverse()]);
    }
    if (pl.kind === 'hollow') {
      // Hollow wedge: the wedge's outline, in normal-width lines, point at a.
      const E = drawnEnd(pl, pl.b), left = add(E, mul(pl.n, wide - hw)), right = add(E, mul(pl.n, -(wide - hw)));
      for (const corner of [left, right]) {
        const u = unit(sub(corner, S));
        bar(S, corner, perp(u), hw);
      }
      bar(add(right, mul(pl.n, -hw)), add(left, mul(pl.n, hw)), mul(pl.u, -1), hw);
    }
    if (pl.head) {
      // Dative bond: an arrowhead pointing at b.
      const E = drawnEnd(pl, pl.b), base = add(E, mul(pl.u, -0.3 * L)), w = 0.12 * L;
      polygons.push([add(base, mul(pl.n, -w)), add(base, mul(pl.n, w)), E]);
    }
    if (pl.kind === 'hash') {
      // round(length / hash spacing) marks at even pitch, the last one flush with the wide end.
      const start = drawnEnd(pl, pl.a), D = pl.length - pl.cut[0] - pl.cut[1], marks = Math.max(1, Math.round(D / s.hash)), pitch = D / marks;
      for (let j = 1; j <= marks; j++) {
        const t = j * pitch - hw, c = add(start, mul(pl.u, t));
        bar(add(c, mul(pl.u, -hw)), add(c, mul(pl.u, hw)), pl.n, tip + ((wide - tip) * t) / D);
      }
    }
    if (pl.cross) {
      // Two lines from each end's -n and +n sides to the other end's opposite side.
      const h = s.spacing / 2, A = drawnEnd(pl, pl.a), B = drawnEnd(pl, pl.b);
      for (const sgn of [1, -1]) { const p0 = add(A, mul(pl.n, sgn * h)), p1 = add(B, mul(pl.n, -sgn * h)); bar(p0, p1, perp(unit(sub(p1, p0))), hw); }
    }
    for (const { o, t0, t1, half: w, dashed } of pl.lines) {
      const from = labelled[pl.a] ? pl.cut[0] : t0, to = pl.length - (labelled[pl.b] ? pl.cut[1] : t1);
      if (to - from < 0.1) continue;
      if (dashed) {
        // Dashes as a dashed bond's: one per hash spacing, the first and last flush with the ends.
        const D = to - from, count = Math.max(1, Math.round(D / s.hash)), dash = Math.min(D, s.hash * 0.55), step = count > 1 ? (D - dash) / (count - 1) : 0;
        for (let k = 0; k < count; k++) bar(add(add(pts[pl.a], mul(pl.u, from + k * step)), mul(pl.n, o)), add(add(pts[pl.a], mul(pl.u, from + k * step + dash)), mul(pl.n, o)), pl.n, w ?? hw);
        continue;
      }
      bar(add(add(pts[pl.a], mul(pl.u, from)), mul(pl.n, o)), add(add(pts[pl.a], mul(pl.u, to)), mul(pl.n, o)), pl.n, w ?? hw);
    }
  };
  // Each polygon belongs to the bond it draws, so to both of its atoms' ink boxes.
  const ink: Box[] = pts.map(([x, y]) => [x, y, x, y]);
  const grow = (i: number, [x, y]: P) => { const b = ink[i]; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); };
  // Structure Perspective: a structure with depth (its atoms' z) is drawn as seen, nearer bonds wider and darker,
  // further ones thinner and fainter, and a nearer bond crossing in front of another cuts a gap in it.
  const depth = depthOf(mol);
  const deep = (pl: Plan) => depth[pl.a] !== undefined && depth[pl.b] !== undefined;
  const fade = (t: number) => 0.45 + 0.55 * t, wideAt = (t: number) => hw * 0.8 + (s.bold / 2 - hw * 0.8) * t;
  const drawDeep = (pl: Plan) => {
    if (pl.hidden) return;
    const S = drawnEnd(pl, pl.a), E = drawnEnd(pl, pl.b), D = len(sub(E, S));
    if (D < 1e-6) return;
    const ta = depth[pl.a]!, tb = depth[pl.b]!;
    // Gaps where a nearer bond crosses this one, as fractions along it.
    const gaps: [number, number][] = [];
    for (const other of plans) {
      if (other === pl || !deep(other) || other.hidden || [other.a, other.b].some((x) => x === pl.a || x === pl.b)) continue;
      const hit = crossing(pts[pl.a], pts[pl.b], pts[other.a], pts[other.b]);
      if (!hit) continue;
      const here = ta + (tb - ta) * hit[0], there = depth[other.a]! + (depth[other.b]! - depth[other.a]!) * hit[1];
      if (there <= here + 0.02) continue;
      const g = (wideAt(there) + 2.5 * hw + s.margin) / pl.length;
      gaps.push([hit[0] - g, hit[0] + g]);
    }
    gaps.sort((p, q) => p[0] - q[0]);
    const offsets = pl.kind === 'none' || pl.lines.length > 1 ? pl.lines.map((l) => l.o) : [0, ...pl.lines.map((l) => l.o)];
    const lines = offsets.length ? offsets : [0];
    let from = pl.cut[0] / pl.length;
    const pieces: [number, number][] = [];
    for (const [g0, g1] of gaps) { if (g0 > from) pieces.push([from, g0]); from = Math.max(from, g1); }
    pieces.push([from, 1 - pl.cut[1] / pl.length]);
    for (const [f, t] of pieces) {
      if (t - f < 1e-3) continue;
      for (const o of lines) {
        const at = (k: number): P => add(add(pts[pl.a], mul(pl.u, pl.length * k)), mul(pl.n, o)), w = (k: number) => wideAt(ta + (tb - ta) * k);
        const p = at(f), q = at(t);
        polygons.push([add(p, mul(pl.n, -w(f))), add(p, mul(pl.n, w(f))), add(q, mul(pl.n, w(t))), add(q, mul(pl.n, -w(t)))]);
      }
    }
  };
  // Each polygon's colour (its bond's, or for a mark, its atom's) and how strongly it is drawn (fainter further back).
  const colours: (string | undefined)[] = [], alphas: number[] = [];
  const order = plans.map((_, i) => i).sort((i, j) => (deep(plans[i]) && deep(plans[j]) ? depth[plans[i].a]! + depth[plans[i].b]! - depth[plans[j].a]! - depth[plans[j].b]! : 0));
  order.forEach((i) => {
    const pl = plans[i], before = polygons.length, d = deep(pl);
    if (d) drawDeep(pl); else drawPlan(pl, i);
    const alpha = d ? fade((depth[pl.a]! + depth[pl.b]!) / 2) : 1;
    for (const poly of polygons.slice(before)) { colours.push(mol.bonds[i].colour); alphas.push(alpha); for (const q of poly) { grow(pl.a, q); grow(pl.b, q); } }
  });
  // The aromatic circles, each as a ring of short bars in the line width.
  for (const r of circled) {
    const c = mul(r.reduce<P>((m, i) => add(m, pts[i]), [0, 0]), 1 / r.length);
    const inner = Math.min(...r.map((x, k) => { const p = pts[x], q = pts[r[(k + 1) % r.length]], u = unit(sub(q, p)); return Math.abs(dot(sub(c, p), perp(u))); }));
    const radius = inner * 0.6, steps = 72, before = polygons.length;
    for (let k = 0; k < steps; k++) {
      const a0 = (2 * Math.PI * k) / steps, a1 = (2 * Math.PI * (k + 1.05)) / steps, S = add(c, [Math.cos(a0) * radius, Math.sin(a0) * radius]), E = add(c, [Math.cos(a1) * radius, Math.sin(a1) * radius]);
      bar(S, E, perp(unit(sub(E, S))), hw);
    }
    for (const poly of polygons.slice(before)) { colours.push(mol.atoms[r[0]].colour); alphas.push(1); for (const q of poly) grow(r[0], q); }
  }
  // Joints in a 3D structure: a disc at each unlabelled atom as wide as its widest bond there, so tapered bonds meet.
  mol.atoms.forEach((_, x) => {
    if (depth[x] === undefined || labelled[x] || !nbrs[x].length) return;
    polygons.push(disc(pts[x], wideAt(depth[x]!)));
    colours.push(mol.atoms[x].colour);
    alphas.push(fade(depth[x]!));
  });
  shapes.forEach((shape, i) => shape.forEach((q) => grow(i, q)));
  marks.forEach((mark, i) => mark.forEach((q) => grow(i, q)));
  symbols.forEach((polys, i) => polys.forEach((poly) => { polygons.push(poly); colours.push(mol.atoms[i].colour); alphas.push(depth[i] !== undefined ? fade(depth[i]!) : 1); poly.forEach((q) => grow(i, q)); }));
  // Labels in a 3D structure fade with their atom's depth too.
  for (const l of labels) {
    const i = labelAtom.get(l);
    if (i !== undefined && depth[i] !== undefined) l.alpha = fade(depth[i]!);
  }

  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of [...pts, ...polygons.flat(), ...shapes.flat()]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = L / 2;
  const label = shapes.map((shape): Box | undefined => (shape.length ? [Math.min(...shape.map((q) => q[0])), Math.min(...shape.map((q) => q[1])), Math.max(...shape.map((q) => q[0])), Math.max(...shape.map((q) => q[1]))] : undefined));
  return { polygons, colours, alphas, labels, box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad], ink, label, scale: k, electrons, beads };
}

// Captions, placed in the drawing's px frame (y down). Sizes are in pt; 1 pt is 4/3 px.
// ACS 1996: a caption under a structure is centred on the structure's ink box, its baseline 15 pt below the
// box. Left and right alignment line it up with the box's edges instead. Captions under the same atoms stack
// one line apart: the compound number first (bold digits, as ACS sets them), then the rest in id order.
// LINE (1.2 em) is provisional until it is measured against ChemDraw.
export const CAPTION_PT = 10;
export const isNumber = (c: Caption) => !!c.bold && /^\d+[a-z]?$/.test(c.text);
const GAP_PT = 15, GAP_ARROW_PT = 3, LINE = 1.2, ASCENT = 0.905, DESCENT = 0.212; // Arial's ascent and descent, in em
export type Placed = {
  id: number; size: number; bold?: boolean; italic?: boolean; underline?: boolean; colour?: string; anchor: "start" | "middle" | "end"; font?: string;
  lines: { text: string; x: number; y: number; runs?: TextRun[] }[]; box: Box;
};
// pt: px per point in the drawing frame; size: the document's caption size in pt.
// fixed: where captions placed by something else (a cycle's labels) go, in px.
export function placeCaptions(mol: Mol, d: Drawing, width: (text: string, c: Caption, line: number) => number, arrows: Arrow[] = mol.arrows ?? [], pt = 4 / 3, defaultSize = CAPTION_PT,
  fixed: Map<number, { x: number; y: number; anchor: Placed["anchor"] }> = new Map()): Placed[] {
  const k = d.scale, below = new Map<string, number>(); // the next free baseline under each structure
  const beside = new Map<string, number>(); // how far the conditions on each side of each arrow already reach
  const order = (c: Caption) => (isNumber(c) ? 0 : 1);
  return [...(mol.captions ?? [])].sort((a, b) => order(a) - order(b) || a.id - b.id).flatMap((c) => {
    const size = (c.size ?? defaultSize) * pt, lines = c.text.split("\n"), align = c.align ?? "centre";
    const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
    let x: number, y: number, anchorOverride: Placed["anchor"] | undefined;
    const arrow = c.on && arrows.find((a) => a.id === c.on!.arrow);
    if (c.on && !arrow) return [];
    const pinned = fixed.get(c.id);
    if (c.cycle && !pinned) return [];
    if (pinned) {
      [x, y, anchorOverride] = [pinned.x, pinned.y - (lines.length - 1) * LINE * size * (pinned.anchor === "middle" ? 0.5 : 0), pinned.anchor];
    } else if (arrow) {
      // Conditions: centred on the arrow's middle, GAP_ARROW_PT clear of it, stacking away from it.
      const [s, t] = [[arrow.from[0] * k, -arrow.from[1] * k], [arrow.to[0] * k, -arrow.to[1] * k]];
      const mid = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2], len = Math.hypot(t[0] - s[0], t[1] - s[1]) || 1, u = [(t[0] - s[0]) / len, (t[1] - s[1]) / len];
      const key = `${arrow.id} ${c.on!.side}`, used = beside.get(key) ?? 0, gap = GAP_ARROW_PT * pt + used;
      const block = (lines.length - 1) * LINE * size;
      beside.set(key, used + (lines.length * LINE + 0.2) * size);
      if (Math.abs(u[0]) >= 0.5) {
        // A mostly horizontal arrow: text above or below its middle.
        x = mid[0];
        y = c.on!.side === "above" ? mid[1] - gap - DESCENT * size - block : mid[1] + gap + ASCENT * size;
        anchorOverride = "middle";
      } else {
        // A steep arrow: text to its left (above) or right (below), level with its middle.
        x = c.on!.side === "above" ? mid[0] - gap : mid[0] + gap;
        y = mid[1] + (ASCENT * size - block) / 2 - (DESCENT * size) / 2;
        anchorOverride = c.on!.side === "above" ? "end" : "start";
      }
    } else if (c.under) {
      const atoms = c.under.filter((i) => d.ink[i]);
      if (!atoms.length) return [];
      const b: Box = [Math.min(...atoms.map((i) => d.ink[i][0])), Math.min(...atoms.map((i) => d.ink[i][1])), Math.max(...atoms.map((i) => d.ink[i][2])), Math.max(...atoms.map((i) => d.ink[i][3]))];
      const key = [...c.under].sort((p, q) => p - q).join(" ");
      x = align === "left" ? b[0] : align === "right" ? b[2] : (b[0] + b[2]) / 2;
      y = below.get(key) ?? b[3] + GAP_PT * pt;
      below.set(key, y + lines.length * LINE * size);
    } else [x, y] = [c.x * k, -c.y * k];
    const at = anchorOverride ?? anchor;
    const widths = lines.map((t, j) => width(t, c, j)), w = Math.max(...widths);
    const runLines = c.runs ? richLines(c.runs) : undefined;
    const left = at === "start" ? x : at === "end" ? x - w : x - w / 2;
    return [{
      id: c.id, size, bold: c.bold, italic: c.italic, underline: c.underline, colour: c.colour, anchor: at, font: c.font,
      lines: lines.map((text, j) => ({ text, x, y: y + j * LINE * size, ...(runLines ? { runs: runLines[j] ?? [] } : {}) })),
      box: [left, y - ASCENT * size, left + w, y + (lines.length - 1) * LINE * size + DESCENT * size],
    }];
  });
}

// Arrows grow to fit their conditions: a straight arrow is lengthened about its middle until the widest
// conditions text has ARROW_MARGIN_PT clear at each end. Curved arrows keep their shape.
const ARROW_MARGIN_PT = 6;
export function fitArrows(mol: Mol, scale: number, width: (c: Caption) => number, pt = 4 / 3): Arrow[] {
  return (mol.arrows ?? []).map((a) => {
    if (curved(a)) return a;
    const widest = Math.max(0, ...(mol.captions ?? []).filter((c) => c.on?.arrow === a.id).map(width));
    const need = (widest + 2 * ARROW_MARGIN_PT * pt) / scale, len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]);
    if (!widest || len >= need || !len) return a;
    const grow = (need - len) / 2 / len, d = [(a.to[0] - a.from[0]) * grow, (a.to[1] - a.from[1]) * grow];
    return { ...a, from: [a.from[0] - d[0], a.from[1] - d[1]], to: [a.to[0] + d[0], a.to[1] + d[1]] };
  });
}

// The middle of a curved arrow's arc, in drawing coordinates.
export function bendPoint(a: Arrow): [number, number] {
  const len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]), b = a.bend ?? 0;
  const n = [-(a.to[1] - a.from[1]) / (len || 1), (a.to[0] - a.from[0]) / (len || 1)];
  return [(a.from[0] + a.to[0]) / 2 + n[0] * b * len, (a.from[1] + a.to[1]) / 2 + n[1] * b * len];
}

// An arrow's path in px (y down): two points for a straight arrow, a sampled arc for a curved one. The arc is
// the circle through both ends and the middle point, which is how CDXML stores curved arrows too.
export function arrowPath(a: Arrow, k: number): P[] {
  if (a.kind === "curve" && a.curve) return curvePath(a.curve, k);
  const S: P = [a.from[0] * k, -a.from[1] * k], T: P = [a.to[0] * k, -a.to[1] * k];
  if (!curved(a) || !a.bend) return [S, T];
  const m = bendPoint(a), M: P = [m[0] * k, -m[1] * k];
  const d = 2 * (S[0] * (M[1] - T[1]) + M[0] * (T[1] - S[1]) + T[0] * (S[1] - M[1]));
  if (Math.abs(d) < 1e-9) return [S, T];
  const sq = (q: P) => q[0] * q[0] + q[1] * q[1];
  const O: P = [
    (sq(S) * (M[1] - T[1]) + sq(M) * (T[1] - S[1]) + sq(T) * (S[1] - M[1])) / d,
    (sq(S) * (T[0] - M[0]) + sq(M) * (S[0] - T[0]) + sq(T) * (M[0] - S[0])) / d,
  ];
  const r = Math.hypot(S[0] - O[0], S[1] - O[1]), angle = (q: P) => Math.atan2(q[1] - O[1], q[0] - O[0]);
  const turn = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // From the start round to the end, the way that passes the middle.
  const a0 = angle(S);
  let sweep = turn(angle(T) - a0);
  if (turn(angle(M) - a0) > sweep) sweep -= 2 * Math.PI;
  const n = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 48)));
  return Array.from({ length: n + 1 }, (_, i) => (i === 0 ? S : i === n ? T : [O[0] + r * Math.cos(a0 + (sweep * i) / n), O[1] + r * Math.sin(a0 + (sweep * i) / n)] as P));
}

// An arrow as filled polygons in px (y down). Heads follow ChemDraw's CDXML defaults (HeadSize 1000,
// ArrowheadCenterSize 875, ArrowheadWidth 250, read as hundredths of the line width): 10 line widths long,
// 2.5 wide on each side, the back notched in to 8.75. Provisional until measured against ChemDraw's output.
export function arrowShapes(a: Arrow, s: Style, k: number): P[][] {
  const hw = s.line / 2, H = 10 * s.line, C = 8.75 * s.line, W = 2.5 * s.line;
  const out: P[][] = [];
  const bar = (p: P, q: P, w = hw) => { const u = unit(sub(q, p)), n = perp(u); out.push([add(p, mul(n, w)), add(q, mul(n, w)), add(q, mul(n, -w)), add(p, mul(n, -w))]); };
  // Points shortened at their end by `trim` (where a head takes over).
  const cut = (pts: P[], trim: number) => {
    const path = [...pts];
    for (let left = trim; left > 0 && path.length > 1; ) {
      const [p, q] = [path[path.length - 2], path[path.length - 1]], d = len(sub(q, p));
      if (d > left) { path[path.length - 1] = add(q, mul(unit(sub(p, q)), left)); break; }
      left -= d;
      path.pop();
    }
    return path;
  };
  // A shaft along points, stopping `trim` short of the end, drawn in the arrow's style: dashes of 0.15 bond lengths
  // with gaps of 0.1, a wave 0.06 bond lengths high every 0.2, the bold width, or two lines 0.1 bond lengths apart.
  const line = (pts: P[], trim: number) => {
    const path = cut(pts, trim);
    if (a.style === "doubled") {
      const g = 0.05 * s.bond;
      for (const side of [-1, 1]) { const o = offsetPath(path, side * g); for (let i = 0; i + 1 < o.length; i++) if (len(sub(o[i + 1], o[i])) > 1e-9) bar(o[i], o[i + 1]); }
      return;
    }
    if (a.style === "dashed" || a.kind === "cut") return dashes(path, 0.15 * s.bond, 0.1 * s.bond).forEach(([p, q]) => bar(p, q));
    if (a.style === "wavy") {
      const wave = waveAlong(path, 0.06 * s.bond, 0.2 * s.bond);
      for (let i = 0; i + 1 < wave.length; i++) bar(wave[i], wave[i + 1]);
      return;
    }
    for (let i = 0; i + 1 < path.length; i++) if (len(sub(path[i + 1], path[i])) > 1e-9) bar(path[i], path[i + 1], a.style === "bold" ? s.bold / 2 : hw);
  };
  // A head at the end of pts: full, or half (the barb on the left side looking along the arrow, or the right),
  // solid, hollow (its outline) or angled (open barbs). On a curve it points along the chord of its own length,
  // so it sits on the arc.
  const shape = a.head ?? "solid";
  const head = (pts: P[], half?: "left" | "right") => {
    const T = pts[pts.length - 1], back = cut(pts, H).pop()!, u = unit(sub(T, back)), n = perp(u);
    const base = add(T, mul(u, -H)), notch = add(T, mul(u, -C));
    const barbs = half ? [half === "left" ? -1 : 1] : [1, -1];
    if (shape === "angled") { for (const side of barbs) bar(T, add(base, mul(n, side * W))); return; }
    if (shape === "hollow") {
      for (const side of barbs) { bar(T, add(base, mul(n, side * W))); bar(add(base, mul(n, side * W)), half ? base : base); }
      if (!half) bar(add(base, mul(n, W)), add(base, mul(n, -W)));
      return;
    }
    if (!half) out.push([T, add(base, mul(n, W)), notch, add(base, mul(n, -W))]);
    else out.push([T, add(base, mul(n, half === "left" ? -W : W)), add(notch, mul(n, half === "left" ? -hw : hw))]);
  };
  // How far a head takes over the shaft: to its notch (solid), its base (hollow), or not at all (angled).
  const takes = (h: Head) => (h === "none" ? 0 : shape === "angled" ? hw : shape === "hollow" ? H : h === "full" ? C : 0);
  const path = arrowPath(a, k), [S, T] = [path[0], path[path.length - 1]];
  const u = unit(sub(T, S)), n = perp(u);
  if (takesHeads(a)) {
    // One shaft, and a head at either end as set (the Curves menu) or as the kind has them.
    const { start, end } = headsOf(a), reversed = [...path].reverse();
    line(cut(cut(path, takes(end)).reverse(), takes(start)).reverse(), 0);
    if (end !== "none") head(path, end === "full" ? undefined : end);
    if (start !== "none") head(reversed, start === "full" ? undefined : start);
    if (a.kind === "nogo") {
      // A cross on the middle of the shaft.
      const m = mul(add(S, T), 0.5), r = 0.22 * s.bond;
      for (const d of [add(u, n), sub(u, n)]) bar(add(m, mul(unit(d), -r)), add(m, mul(unit(d), r)));
    }
    return out;
  }
  switch (a.kind) {
    case "cut":
      line(path, 0);
      break;
    case "equilibrium": {
      // Two half-headed arrows, one each way, barbs on the outside.
      const g = 0.11 * s.bond, top: P[] = [add(S, mul(n, -g)), add(T, mul(n, -g))], bottom: P[] = [add(T, mul(n, g)), add(S, mul(n, g))];
      line(top, 0);
      head(top, "left");
      line(bottom, 0);
      head(bottom, "left");
      break;
    }
    case "retro": {
      // Two lines and an open head.
      const g = 0.09 * s.bond, tip = add(T, mul(u, -2 * g)), back = add(T, mul(u, -(H + 2 * g)));
      for (const side of [-1, 1]) {
        bar(add(S, mul(n, side * g)), add(tip, mul(n, side * g)));
        bar(T, add(back, mul(n, side * (W + 2 * g))));
      }
      break;
    }
  }
  return out;
}

// A path moved sideways by d (px) at every point, along the path's own normal there.
function offsetPath(path: P[], d: number): P[] {
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)], t = sub(b, a);
    return len(t) < 1e-9 ? p : add(p, mul(perp(unit(t)), d));
  });
}

// A shape's lines in px (y down), as paths: the outline of a box or oval, or each bracket of a pair. A highlight's
// outline is its edge. Rounded corners have a radius of 0.3 bond lengths; bracket ends reach 0.25 bond lengths in.
export function shapePaths(sh: Shape, k: number, bond = k): P[][] {
  const x0 = Math.min(sh.from[0], sh.to[0]) * k, x1 = Math.max(sh.from[0], sh.to[0]) * k;
  const y0 = -Math.max(sh.from[1], sh.to[1]) * k, y1 = -Math.min(sh.from[1], sh.to[1]) * k;
  const w = x1 - x0, h = y1 - y0, arc = (c: P, r: [number, number], a0: number, a1: number, n = 12): P[] =>
    Array.from({ length: n + 1 }, (_, i) => [c[0] + r[0] * Math.cos(a0 + ((a1 - a0) * i) / n), c[1] + r[1] * Math.sin(a0 + ((a1 - a0) * i) / n)] as P);
  switch (sh.kind) {
    case "oval": return [arc([(x0 + x1) / 2, (y0 + y1) / 2], [w / 2, h / 2], 0, 2 * Math.PI, 72)];
    case "rounded": {
      const r = Math.min(0.3 * bond, w / 2, h / 2);
      return [[...arc([x1 - r, y0 + r], [r, r], -Math.PI / 2, 0), ...arc([x1 - r, y1 - r], [r, r], 0, Math.PI / 2), ...arc([x0 + r, y1 - r], [r, r], Math.PI / 2, Math.PI), ...arc([x0 + r, y0 + r], [r, r], Math.PI, 1.5 * Math.PI), [x1 - r, y0]]];
    }
    case "brackets": {
      const t = Math.min(0.25 * bond, w / 3);
      return sides(sh, [[x0 + t, y0], [x0, y0], [x0, y1], [x0 + t, y1]], [[x1 - t, y0], [x1, y0], [x1, y1], [x1 - t, y1]]);
    }
    case "parens": {
      // Each one an arc through its ends and a middle 0.25 bond lengths out.
      const t = Math.min(0.25 * bond, w / 3), R = (t * t + (h / 2) ** 2) / (2 * t), half = Math.asin(Math.min(1, h / 2 / R));
      return sides(sh, arc([x0 + R, (y0 + y1) / 2], [R, R], Math.PI - half, Math.PI + half, 32), arc([x1 - R, (y0 + y1) / 2], [R, R], half, -half, 32));
    }
    case "braces": {
      // Hooks at the ends, straight runs, and a point at the middle.
      const t = Math.min(0.25 * bond, w / 3), c = Math.min(t / 2, h / 4), m = (y0 + y1) / 2;
      const q = (a: P, ctl: P, b: P): P[] => Array.from({ length: 9 }, (_, i) => { const u = i / 8, v = 1 - u; return [v * v * a[0] + 2 * v * u * ctl[0] + u * u * b[0], v * v * a[1] + 2 * v * u * ctl[1] + u * u * b[1]] as P; });
      const brace = (x: number, s: number): P[] => [
        ...q([x + s * t, y0], [x + (s * t) / 2, y0], [x + (s * t) / 2, y0 + c]), ...q([x + (s * t) / 2, m - c], [x + (s * t) / 2, m], [x, m]),
        ...q([x, m], [x + (s * t) / 2, m], [x + (s * t) / 2, m + c]), ...q([x + (s * t) / 2, y1 - c], [x + (s * t) / 2, y1], [x + s * t, y1]),
      ];
      return sides(sh, brace(x0, 1), brace(x1, -1));
    }
    default: return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
  }
}

// A pair of brackets, or the one side asked for.
const sides = (sh: Shape, left: P[], right: P[]): P[][] => (sh.side === "left" ? [left] : sh.side === "right" ? [right] : [left, right]);
// Where a bracket's mark goes: just outside its top right corner (px, y down), or the top left for a left bracket alone.
export function markAt(sh: Shape, k: number): { x: number; y: number; anchor: "start" | "end" } {
  const x0 = Math.min(sh.from[0], sh.to[0]) * k, x1 = Math.max(sh.from[0], sh.to[0]) * k, y0 = -Math.max(sh.from[1], sh.to[1]) * k;
  return sh.side === "left" ? { x: x0 - 0.08 * k, y: y0 + 0.1 * k, anchor: "end" } : { x: x1 + 0.08 * k, y: y0 + 0.1 * k, anchor: "start" };
}

// A shape's ink as filled polygons (px, y down), winding like the bonds: its lines at the line width, dashed when
// asked (dashes and gaps of 0.2 bond lengths). A highlight has no lines; its fill is its outline.
export function shapeInk(sh: Shape, s: Style, k: number): P[][] {
  if (sh.kind === "highlight") return [];
  const hw = s.line / 2, out: P[][] = [], dash = 0.2 * s.bond;
  const bar = (p: P, q: P) => { const d = len(sub(q, p)); if (d < 1e-9) return; const n = perp(unit(sub(q, p))); out.push([add(p, mul(n, -hw)), add(p, mul(n, hw)), add(q, mul(n, hw)), add(q, mul(n, -hw))]); };
  for (const path of shapePaths(sh, k, s.bond)) {
    // Lines run on by half a width at each joint so corners close.
    if (!sh.dashed) {
      for (let i = 0; i + 1 < path.length; i++) {
        if (len(sub(path[i + 1], path[i])) < 1e-9) continue; // where two curves meet
        const u = unit(sub(path[i + 1], path[i]));
        bar(add(path[i], mul(u, -hw)), add(path[i + 1], mul(u, hw)));
      }
      continue;
    }
    let on = true, left = dash;
    for (let i = 0; i + 1 < path.length; i++) {
      let p = path[i];
      const q = path[i + 1];
      while (len(sub(q, p)) > 1e-9) {
        const step = Math.min(left, len(sub(q, p))), r = add(p, mul(unit(sub(q, p)), step));
        if (on) bar(p, r);
        p = r;
        left -= step;
        if (left <= 1e-9) { on = !on; left = dash; }
      }
    }
  }
  return out;
}

// Dash segments along a path: on, off, on, ... measured along it.
export function dashes(path: P[], on: number, off: number): [P, P][] {
  const out: [P, P][] = [];
  let drawing = true, left = on, start: P | undefined = path[0];
  for (let i = 0; i + 1 < path.length; i++) {
    let p = path[i];
    const q = path[i + 1];
    while (len(sub(q, p)) > 1e-9) {
      const step = Math.min(left, len(sub(q, p))), r = add(p, mul(unit(sub(q, p)), step));
      p = r;
      left -= step;
      if (left <= 1e-9) {
        if (drawing && start) out.push([start, r]);
        drawing = !drawing;
        left = drawing ? on : off;
        start = drawing ? r : undefined;
      }
    }
  }
  if (drawing && start && len(sub(path[path.length - 1], start)) > 1e-9) out.push([start, path[path.length - 1]]);
  return out;
}
// A sine wave following a path: amplitude and wavelength in px, sampled finely.
export function waveAlong(path: P[], amplitude: number, wavelength: number): P[] {
  const out: P[] = [];
  let travelled = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path[i], q = path[i + 1], d = len(sub(q, p));
    if (d < 1e-9) continue;
    const u = unit(sub(q, p)), n = perp(u), steps = Math.max(1, Math.ceil(d / (wavelength / 12)));
    for (let j = 0; j <= steps; j++) {
      const t = (d * j) / steps, along = travelled + t;
      out.push(add(add(p, mul(u, t)), mul(n, amplitude * Math.sin((2 * Math.PI * along) / wavelength))));
    }
    travelled += d;
  }
  return out;
}

// An orbital's lobes as closed outlines (px, y down). second: the lobe takes the other phase (the back lobe of a p
// orbital, alternate lobes of a d orbital, a dz2's ring). Lobes follow r = L cos²(angle from their axis).
export function orbitalPaths(a: Arrow, k: number): { path: P[]; second: boolean }[] {
  const C: P = [a.from[0] * k, -a.from[1] * k], T: P = [a.to[0] * k, -a.to[1] * k], L = len(sub(T, C));
  if (L < 1e-6 || !a.orbital) return [];
  const u = unit(sub(T, C)), n = perp(u), axis = Math.atan2(u[1], u[0]);
  const at = (t: number, r: number): P => add(C, [r * Math.cos(t), r * Math.sin(t)]);
  const lobe = (dir: number, length: number, narrow = 1): P[] =>
    Array.from({ length: 49 }, (_, i) => { const f = -Math.PI / 2 / narrow + (Math.PI / narrow) * (i / 48); return at(dir + f, length * Math.cos(f * narrow) ** 2); });
  const ellipse = (a1: number, b1: number): P[] => Array.from({ length: 64 }, (_, i) => { const t = (2 * Math.PI * i) / 64; return add(add(C, mul(u, a1 * Math.cos(t))), mul(n, b1 * Math.sin(t))); });
  switch (a.orbital.shape) {
    case "s": return [{ path: ellipse(L, L), second: false }];
    case "oval": return [{ path: ellipse(L, 0.42 * L), second: false }];
    case "lobe": return [{ path: lobe(axis, L), second: false }];
    case "hybrid": return [{ path: lobe(axis, L), second: false }, { path: lobe(axis + Math.PI, 0.38 * L), second: true }];
    case "p": return [{ path: lobe(axis, L), second: false }, { path: lobe(axis + Math.PI, L), second: true }];
    case "d": return [0, 1, 2, 3].map((q) => ({ path: lobe(axis + Math.PI / 4 + (q * Math.PI) / 2, L, 2), second: q % 2 === 1 }));
    case "dz2": {
      // Two lobes along the axis and a ring round the middle, drawn as a flat band.
      const ring = ellipse(0.24 * L, 0.62 * L), hole = ellipse(0.1 * L, 0.32 * L).reverse();
      return [{ path: [...ring, ring[0], ...hole, hole[0]], second: true }, { path: lobe(axis, L), second: false }, { path: lobe(axis + Math.PI, L), second: false }];
    }
  }
}

// A TLC plate's layout (drawing units): its box, the origin and solvent front heights, each lane's middle, and
// where a spot of a given Rf sits.
export const TLC_ORIGIN = 0.12, TLC_FRONT = 0.1; // the origin's height and the front's depth, as fractions of the plate
export function tlcLayout(sh: Shape) {
  const x0 = Math.min(sh.from[0], sh.to[0]), x1 = Math.max(sh.from[0], sh.to[0]), y0 = Math.min(sh.from[1], sh.to[1]), y1 = Math.max(sh.from[1], sh.to[1]);
  const lanes = Math.max(1, sh.tlc?.lanes ?? 1), origin = y0 + (y1 - y0) * (sh.tlc?.origin ?? TLC_ORIGIN), front = y1 - (y1 - y0) * (sh.tlc?.front ?? TLC_FRONT);
  const lane = (k: number) => x0 + ((x1 - x0) * (k + 0.5)) / lanes;
  const width = (x1 - x0) / lanes;
  // A spot's half-width and half-height (bond lengths): set by hand, or 30% of a lane (at most 0.34) by 0.15.
  const size = (x: Spot) => ({ rx: x.w ?? Math.min(0.3 * width, 0.34), ry: x.h ?? 0.15 });
  return { x0, x1, y0, y1, origin, front, lanes, width, lane, size, at: (rf: number) => origin + (front - origin) * rf };
}
// A spot's outline (drawing units): an ellipse, drawn out below into a smear when it has a tail.
export function spotPath(t: ReturnType<typeof tlcLayout>, x: Spot): [number, number][] {
  const cx = t.lane(x.lane), cy = t.at(x.rf), { rx, ry } = t.size(x), tail = x.tail ?? 0, n = 32, out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * 2 * i) / n, sin = Math.sin(a);
    // The lower half stretches down by the tail, narrowing a little, so a smear reads as a streak.
    const down = sin < 0 ? tail * -sin : 0, narrow = sin < 0 && tail ? 1 - 0.35 * Math.min(1, tail / (ry * 4)) * -sin : 1;
    out.push([cx + rx * Math.cos(a) * narrow, cy + ry * sin - down]);
  }
  return out;
}

// A table's layout (drawing units, y up). Each column is as wide as its widest text plus padding, and the columns
// share out any width the box has to spare; rows are equal. measure: a cell's text width in drawing units.
export const TABLE_PAD = 0.35, TABLE_ROW = 0.8; // bond lengths: padding each side of a column's text; least row height
export function tableLayout(sh: Shape, measure: (text: string) => number = () => 0) {
  const x0 = Math.min(sh.from[0], sh.to[0]), y1 = Math.max(sh.from[1], sh.to[1]);
  const cells = sh.table?.cells.length ? sh.table.cells : [[""]];
  const rows = cells.length, cols = Math.max(...cells.map((r) => r.length));
  const natural = Array.from({ length: cols }, (_, c) => Math.max(1, ...cells.map((r) => (r[c] ? measure(r[c]) + 2 * TABLE_PAD : 0))));
  const spare = Math.max(0, Math.abs(sh.to[0] - sh.from[0]) - natural.reduce((a, b) => a + b, 0)) / cols;
  // Columns and rows whose borders were dragged keep their sizes; the rest share the box.
  const widths = natural.map((w, c) => Math.max(w, sh.table?.widths?.[c] ?? w + spare)), edges = [x0];
  for (const w of widths) edges.push(edges[edges.length - 1] + w);
  const h = Math.max(TABLE_ROW, Math.abs(sh.to[1] - sh.from[1]) / rows);
  const heights = Array.from({ length: rows }, (_, r) => sh.table?.heights?.[r] ?? h), tops = [y1];
  for (const v of heights) tops.push(tops[tops.length - 1] - v);
  return { x0, x1: edges[cols], y0: tops[rows], y1, rows, cols, h, widths, heights, natural, col: (c: number) => edges[c], row: (r: number) => tops[r] }; // row 0 at the top
}

// A pen curve as a polyline (px, y down): each Bézier segment in 24 steps.
export function curvePath(c: Curve, k: number): P[] {
  const pts = c.points, out: P[] = [], px = (q: [number, number]): P => [q[0] * k, -q[1] * k];
  if (!pts.length) return out;
  out.push(px(pts[0].at));
  const segments = c.closed && pts.length > 2 ? pts.length : pts.length - 1;
  for (let i = 0; i < segments; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], p0 = px(a.at), p1 = px(a.c2 ?? a.at), p2 = px(b.c1 ?? b.at), p3 = px(b.at);
    if (!a.c2 && !b.c1) { out.push(p3); continue; }
    for (let j = 1; j <= 24; j++) {
      const t = j / 24, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
  }
  return out;
}
// A curve's box (drawing units) over its anchors and handles: [from, to] as a shape stores them.
export function curveBox(c: Curve): [[number, number], [number, number]] {
  const qs = c.points.flatMap((p) => [p.at, ...(p.c1 ? [p.c1] : []), ...(p.c2 ? [p.c2] : [])]);
  return [[Math.min(...qs.map((q) => q[0])), Math.max(...qs.map((q) => q[1]))], [Math.max(...qs.map((q) => q[0])), Math.min(...qs.map((q) => q[1]))]];
}

// How near each atom of a 3D structure is, 0 (furthest) to 1 (nearest), for Structure Perspective; undefined for
// atoms of flat structures and of structures drawn flat (depth: false).
export function depthOf(m: Mol): (number | undefined)[] {
  const out: (number | undefined)[] = m.atoms.map(() => undefined), seen = new Set<number>(), nbrs: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) { nbrs[b.atoms[0]].push(b.atoms[1]); nbrs[b.atoms[1]].push(b.atoms[0]); }
  m.atoms.forEach((_, start) => {
    if (seen.has(start)) return;
    const group = [start];
    seen.add(start);
    for (let k = 0; k < group.length; k++) for (const j of nbrs[group[k]]) if (!seen.has(j)) { seen.add(j); group.push(j); }
    const zs = group.map((i) => m.atoms[i].location[2] ?? 0), lo = Math.min(...zs), hi = Math.max(...zs);
    if (hi - lo < 1e-3 || group.some((i) => m.atoms[i].depth === false)) return;
    group.forEach((i, k) => { out[i] = (zs[k] - lo) / (hi - lo); });
  });
  return out;
}
// Where segments p1–p2 and q1–q2 cross, as fractions along each (inside both), or undefined.
function crossing(p1: P, p2: P, q1: P, q2: P): [number, number] | undefined {
  const r = sub(p2, p1), s = sub(q2, q1), d = cross(r, s);
  if (Math.abs(d) < 1e-9) return undefined;
  const t = cross(sub(q1, p1), s) / d, u = cross(sub(q1, p1), r) / d;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98 ? [t, u] : undefined;
}
