// CDXML, ChemDraw's XML format: a drawing written as a file ChemDraw opens, and ChemDraw's files read back. Octet's
// .oct files are CDXML inside (decision 0004). Format facts come from Octet's clean-room spec of the document layer;
// "spec 9.2" below means its section 9.2.
// Units: Octet stores bond lengths with y up and its page centred on 0,0. CDXML stores points with y down from the
// top left of the page's printable area. The style's bond length (pt) converts between them.
// Octet-only data that CDXML cannot hold goes in an "Octet" attribute holding JSON, a name ChemDraw drops (spec 22).
// Objects written only so ChemDraw can show something Octet draws itself (a table's lines, a cycle's arrows) carry
// Octet='{"d":1}', and Octet skips them when it reads its own file back.

import { FONTS, PAGES, fontName, pageSize, readStyle, type DocStyle } from "./docstyle.ts";
import {
  HIGHLIGHT, ringCircleRadius, SHADE, TLC_FRONT, TLC_ORIGIN, bendPoint, circledRings, curved, headsOf, hydrogens, isBracket, linesOf, markAt, settleShape, shapeBounds, straightArrow, tableLayout, takesHeads, tlcLayout, turnPoint,
  ORBITAL_SHAPES, PHASES, ALL_ARROW_KINDS,
  type Arrow, type ArrowKind, type Atom, type Bond, type Box, type Caption, type CurveFill, type CurvePoint, type Display, type Grid, type Group, type Head, type HeadShape,
  type LineStyle, type Mol, type OrbitalShape, type Phase, type Shape, type ShapeKind, type Spot, type Table, type TableLine, type Tlc,
} from "./render.ts";
import { ELEMENTS, anchorElement, formulaRuns, isElement, units } from "./labels.ts";
import { normalise, runsOf, styled, type RunStyle, type TextRun } from "./richtext.ts";
import { findReaction } from "./reaction.ts";
import { fragments, groupParents, tidyGroups } from "./edit.ts";
import { kekulise, rings } from "./rings.ts";
import type { Cycle } from "./cycle.ts";

export const TOO_BIG = "This file is too large to open.";
export const NOT_CDXML = "This file is not a ChemDraw drawing.";
export const DAMAGED = "This ChemDraw file is damaged.";

// ---------------------------------------------------------------------------------------------------------------
// XML. A small strict reader: elements, attributes, text, comments, CDATA, the declaration and a DOCTYPE (skipped).
// No entity is defined or expanded; an unknown named entity is dropped, as ChemDraw drops it (spec 1.1).

export type Xml = { name: string; attrs: Record<string, string>; kids: Xml[]; text: string };
const MAX_CHARS = 64 * 1024 * 1024, MAX_DEPTH = 64, MAX_ELEMENTS = 1_000_000, MAX_ATTRS = 512;
const ENTITY: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const NAME = /[A-Za-z_:][\w.:-]*/y, SPACE = /\s*/y;

// Character and entity references in text or an attribute value. A bare & or a bad character number fails.
function decode(s: string): string {
  if (s.indexOf("&") < 0) return s;
  const out = s.replace(/&(?:#x([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z_][\w.-]{0,63}));/g, (_, hex, dec, name) => {
    if (name) return ENTITY[name] ?? "";
    const c = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    const ok = c === 9 || c === 10 || c === 13 || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff);
    if (!ok) throw new Error(DAMAGED);
    return String.fromCodePoint(c);
  });
  // An & that started no reference is not XML.
  if (/&(?!(?:#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z_][\w.-]{0,63});)/.test(s)) throw new Error(DAMAGED);
  return out;
}

// The document's root element. Throws DAMAGED (or TOO_BIG) on anything that is not well-formed or is too big.
export function parseXml(src: string): Xml {
  if (src.length > MAX_CHARS) throw new Error(TOO_BIG);
  const fail = (): never => { throw new Error(DAMAGED); };
  const top: Xml = { name: "", attrs: Object.create(null), kids: [], text: "" }, stack = [top];
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0, elements = 0;
  const text = (t: string) => {
    if (stack.length === 1) { if (/\S/.test(t)) fail(); return; }
    stack[stack.length - 1].text += t;
  };
  const name = () => { NAME.lastIndex = i; const m = NAME.exec(src); if (!m) fail(); i += m![0].length; return m![0]; };
  const space = () => { SPACE.lastIndex = i; SPACE.exec(src); i = SPACE.lastIndex; };
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { text(decode(src.slice(i).replace(/\r\n?/g, "\n"))); break; }
    if (lt > i) text(decode(src.slice(i, lt).replace(/\r\n?/g, "\n")));
    i = lt;
    const skip = (open: string, close: string) => { const e = src.indexOf(close, i + open.length); if (e < 0) fail(); const inner = src.slice(i + open.length, e); i = e + close.length; return inner; };
    if (src.startsWith("<!--", i)) { skip("<!--", "-->"); continue; }
    if (src.startsWith("<![CDATA[", i)) { text(skip("<![CDATA[", "]]>").replace(/\r\n?/g, "\n")); continue; }
    if (src.startsWith("<?", i)) { skip("<?", "?>"); continue; }
    if (src.startsWith("<!DOCTYPE", i)) {
      // Skipped whole, internal subset included; its declarations are never used.
      if (stack.length > 1 || top.kids.length) fail();
      const sub = src.indexOf("[", i), end = src.indexOf(">", i);
      if (end < 0) fail();
      if (sub >= 0 && sub < end) { const close = /\]\s*>/g; close.lastIndex = sub; if (!close.exec(src)) fail(); i = close.lastIndex; } else i = end + 1;
      continue;
    }
    if (src[i + 1] === "/") {
      i += 2;
      const n = name();
      space();
      if (src[i] !== ">" || stack.length < 2 || stack[stack.length - 1].name !== n) fail();
      i++;
      stack.pop();
      continue;
    }
    i++;
    const el: Xml = { name: name(), attrs: Object.create(null), kids: [], text: "" };
    if (++elements > MAX_ELEMENTS || stack.length > MAX_DEPTH || (stack.length === 1 && top.kids.length)) fail();
    let count = 0;
    for (;;) {
      const at = i;
      space();
      if (src.startsWith("/>", i)) { i += 2; stack[stack.length - 1].kids.push(el); break; }
      if (src[i] === ">") { i++; stack[stack.length - 1].kids.push(el); stack.push(el); break; }
      if (i === at || ++count > MAX_ATTRS) fail();
      const key = name();
      space();
      if (src[i] !== "=") fail();
      i++;
      space();
      const q = src[i];
      if (q !== '"' && q !== "'") fail();
      const e = src.indexOf(q, i + 1);
      if (e < 0) fail();
      const raw = src.slice(i + 1, e);
      if (raw.includes("<") || key in el.attrs) fail();
      el.attrs[key] = decode(raw.replace(/\r\n|[\r\n\t]/g, " "));
      i = e + 1;
    }
  }
  if (stack.length !== 1 || top.kids.length !== 1) fail();
  return top.kids[0];
}

// Text for XML: control characters and lone surrogates dropped, the five special characters escaped. In an
// attribute, line breaks and tabs are escaped too so they survive the reader's whitespace rule.
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "");
const SPECIAL: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;", "\n": "&#10;", "\t": "&#9;", "\r": "&#13;" };
const escText = (s: string) => clean(s).replace(/\r/g, "").replace(/[&<>"']/g, (c) => SPECIAL[c]);
const escAttr = (s: string) => clean(s).replace(/[&<>"'\n\t\r]/g, (c) => SPECIAL[c]);

// An element as ChemDraw writes it: one attribute per line, children straight after the start tag. Attributes
// with undefined values are left out.
function el(name: string, attrs: Record<string, string | number | undefined>, inner = ""): string {
  let s = `<${name}`;
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) s += `\n ${k}="${escAttr(String(v))}"`;
  return inner ? `${s}\n>${inner}</${name}>` : `${s}\n/>`;
}

// ---------------------------------------------------------------------------------------------------------------
// Numbers, written the way ChemDraw writes them so files diff cleanly against its own (spec 1.2).

// Lengths and coordinates: 2 decimals, both dropped only when both are zero ("30", "14.40", "0.60").
export function fmt(n: number): string {
  const s = n.toFixed(2);
  return s === "-0.00" ? "0" : s.endsWith(".00") ? s.slice(0, -3) : s;
}
// Colour components: 4 decimals, but 0 and 1 bare.
export const fmtColour = (v: number) => (v <= 0 ? "0" : v >= 1 ? "1" : v.toFixed(4));
// Angles: 1 decimal, dropped when zero ("-120", "44.6").
export function fmtAngle(n: number): string {
  const s = n.toFixed(1);
  return s === "-0.0" ? "0" : s.endsWith(".0") ? s.slice(0, -2) : s;
}
// Text sizes: the shortest form ("7.5", "9.65", "10").
export const fmtSize = (n: number) => String(+n.toFixed(2));

// ---------------------------------------------------------------------------------------------------------------
// Names and tables shared by the writer and the reader.


type P = [number, number];
const SYMBOLS = [...ELEMENTS]; // in atomic-number order, then D
// Colour index 0 is black and 1 white; the table's first row is index 2. ChemDraw starts every table with these.
const BASE_COLOURS = ["#FFFFFF", "#000000", "#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF"];
const RADICALS = ["None", "Singlet", "Doublet", "Triplet"];
const HEADS: Record<Head, string | undefined> = { none: undefined, full: "Full", left: "HalfLeft", right: "HalfRight" };
const HEAD_SHAPES: Record<HeadShape, string> = { solid: "Solid", hollow: "Hollow", angled: "Angle" };
const H_FIRST = new Set(["O", "F", "S", "Cl", "Se", "Br", "Te", "I"]); // H2O, HCl drawn with the H first (as render.ts)
const BOND_ORDER: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 1.5 };
// Orbitals: ChemDraw's OrbitalType names and the Octet shape and phase each reads as (spec 9.8).
const ORBITALS: [string, OrbitalShape, Phase][] = [
  ["s", "s", "plain"], ["oval", "oval", "plain"], ["lobe", "lobe", "plain"], ["p", "p", "plain"],
  ["sShaded", "s", "shaded"], ["ovalShaded", "oval", "shaded"], ["lobeShaded", "lobe", "shaded"], ["pShaded", "p", "shaded"],
  ["sFilled", "s", "filled"], ["ovalFilled", "oval", "filled"], ["lobeFilled", "lobe", "filled"], ["pFilled", "p", "filled"],
  ["hybridPlus", "hybrid", "phased"], ["hybridMinus", "hybrid", "phased"], ["hybridPlusFilled", "hybrid", "filled"], ["hybridMinusFilled", "hybrid", "filled"],
  ["dz2Plus", "dz2", "phased"], ["dz2Minus", "dz2", "phased"], ["dz2PlusFilled", "dz2", "filled"], ["dz2MinusFilled", "dz2", "filled"],
  ["dxy", "d", "phased"], ["dxyFilled", "d", "filled"],
];
const BRACKETS: Record<string, ShapeKind> = { Square: "brackets", Round: "parens", Curly: "braces", SquarePair: "brackets", RoundPair: "parens", CurlyPair: "braces" };
const SYMBOL_TEXT: Record<string, string> = { Plus: "+", Minus: "−", CirclePlus: "⊕", CircleMinus: "⊖", Dagger: "†", DoubleDagger: "‡", Racemic: "Rac", Absolute: "Abs", Relative: "Rel" };

// Arial's advance widths (1/1000 em) for placing labels and sizing text boxes the way ChemDraw measures them.
const UPPER = [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611];
const LOWER = [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500];
const OTHER: Record<string, number> = { " ": 278, "+": 584, "-": 333, "−": 584, "(": 333, ")": 333, "[": 278, "]": 278, ".": 278, ",": 278, "'": 191 };
function advance(ch: string, size: number): number {
  const c = ch.charCodeAt(0);
  const w = c >= 65 && c <= 90 ? UPPER[c - 65] : c >= 97 && c <= 122 ? LOWER[c - 97] : OTHER[ch] ?? 556;
  return (w * size) / 1000;
}
const widthOf = (text: string, size: number) => [...text].reduce((w, ch) => w + advance(ch, size), 0);

// The kind an arrow reads as from what CDXML stores: its heads, head shape, shaft spacing, no-go mark and whether it
// is an arc. The writer keeps a kind this does not give back in Octet's own data.
type Stored = { arc: boolean; head?: string; tail?: string; type?: string; spacing: boolean; nogo: boolean };
function kindOf(s: Stored): ArrowKind {
  if (s.nogo) return "nogo";
  if (s.arc) return s.head?.startsWith("Half") && !s.tail ? "fishhook" : s.head === "Full" && s.tail === "Full" ? "double" : !s.head && !s.tail ? "arc" : "curved";
  if (s.type === "Angle" && s.spacing) return "retro";
  if (s.head === "HalfLeft" && s.tail === "HalfLeft" && s.spacing) return "equilibrium";
  return s.head === "Full" && s.tail === "Full" ? "resonance" : !s.head && !s.tail ? "line" : "reaction";
}
const headOf = (name?: string): Head => (name === "Full" ? "full" : name === "HalfLeft" ? "left" : name === "HalfRight" ? "right" : "none");

// Octet's page centred on 0,0, as CDXML's printable area: the paper less 36 pt margins all round (spec 6).
function printable(style: Pick<DocStyle, "page" | "custom" | "landscape">): [number, number] {
  const [w, h] = pageSize(style);
  return [(w * 72) / 25.4 - 72, (h * 72) / 25.4 - 72];
}
// The middle of a page side, on the 0.01 pt grid so Octet's 0,0 is written exactly.
const middle = (side: number) => Math.round(side * 50) / 100;
const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();

// ---------------------------------------------------------------------------------------------------------------
// Writing.

export type CdxmlOptions = {
  selection?: { atoms: Iterable<number>; items: Iterable<number> }; // only these atoms (and the bonds between them) and objects
  derived?: Arrow[]; // arrows Octet draws from other objects (a catalytic cycle's), written so ChemDraw shows them too
  expand?: (text: string) => Mol | undefined; // a written label's atoms (atom 0 attaches), for ChemDraw's abbreviation
  name?: string; // the document's name
};
const PROGRAM = "Octet 0.1.0";
const DERIVED = '{"d":1}';
const GRID_FIELDS = ["mass", "moles", "equiv", "volume", "density", "molarity", "purity", "measured"];
const num6 = (v: number) => String(+v.toFixed(6));
const union = (boxes: Box[]): Box | undefined => (boxes.length ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] : undefined);
const boxOf = (qs: P[], pad = 0): Box => [Math.min(...qs.map((q) => q[0])) - pad, Math.min(...qs.map((q) => q[1])) - pad, Math.max(...qs.map((q) => q[0])) + pad, Math.max(...qs.map((q) => q[1])) + pad];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const len = (a: P) => Math.hypot(a[0], a[1]);
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
// The circle through three points, or undefined when they are in a line.
function circle(S: P, M: P, T: P): { O: P; r: number } | undefined {
  const d = 2 * (S[0] * (M[1] - T[1]) + M[0] * (T[1] - S[1]) + T[0] * (S[1] - M[1]));
  if (Math.abs(d) < 1e-9) return undefined;
  const sq = (q: P) => q[0] * q[0] + q[1] * q[1];
  const O: P = [(sq(S) * (M[1] - T[1]) + sq(M) * (T[1] - S[1]) + sq(T) * (S[1] - M[1])) / d, (sq(S) * (T[0] - M[0]) + sq(M) * (S[0] - T[0]) + sq(T) * (M[0] - S[0])) / d];
  return { O, r: len(sub(S, O)) };
}
const turn = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

// The drawing (or the part selected) as a CDXML document ChemDraw 22 to 26 opens.
export function toCdxml(input: Mol, style: DocStyle, opts: CdxmlOptions = {}): string {
  const mol = opts.selection ? pick(input, opts.selection) : input;
  // The page's size as written, so the reader finds the same centre.
  const B = style.bond, line = style.line, [W, H] = printable(style).map((v) => Number(fmt(v))), [cx, cy] = [middle(W), middle(H)];
  const at = (q: readonly number[]): P => [cx + q[0] * B, cy - q[1] * B];
  const pt = (q: P) => `${fmt(q[0])} ${fmt(q[1])}`, pt3 = (q: P, z = 0) => `${pt(q)} ${fmt(z)}`;
  const boxText = (b: Box) => `${fmt(b[0])} ${fmt(b[1])} ${fmt(b[2])} ${fmt(b[3])}`;
  const colours = [...BASE_COLOURS];
  const colour = (c?: string) => {
    if (!c) return undefined;
    const u = c.toUpperCase();
    return u === "#000000" ? 0 : u === "#FFFFFF" ? 1 : (colours.includes(u) ? colours.indexOf(u) : colours.push(u) - 1) + 2;
  };
  const fonts: string[] = [];
  const font = (name: string) => (fonts.includes(name) ? fonts.indexOf(name) : fonts.push(name) - 1) + 1;
  font(style.labelFont);
  font(style.captionFont);
  const priv = (o: Record<string, unknown>) => {
    const kept = Object.entries(o).filter(([, v]) => v !== undefined);
    return kept.length ? JSON.stringify(Object.fromEntries(kept)) : undefined;
  };
  // A reaction arrow's stoichiometry grid, kept in Octet's own data on the arrow (ChemDraw's grid is not in CDXML).
  const gridOf = (arrow: number) => { const g = mol.grids?.find((x) => x.arrow === arrow); return g && { typed: g.typed, limiting: g.limiting }; };

  // Ids: Octet's own object ids where they are sound, everything else from one counter above them (spec 2).
  const own = [...(mol.captions ?? []), ...(mol.arrows ?? []), ...(mol.shapes ?? []), ...(mol.cycles ?? []), ...(mol.groups ?? [])].map((x) => x.id);
  const sound = own.every((id) => Number.isInteger(id) && id > 0 && id < 2 ** 30) && new Set(own).size === own.length;
  let next = sound ? own.reduce((m, id) => Math.max(m, id), 0) + 1 : 1;
  const fresh = () => next++;
  const idOf = new Map<number, number>(own.map((id) => [id, sound ? id : fresh()]));
  // Z: one drawing order for the page (spec 7.1), back to front as Octet draws: fills, orbitals, structures, arrows, text.
  // Things with a draw order (order.ts) each take a band of their own, under or over all of that, in their order.
  const orders = [...new Set([...mol.atoms, ...(mol.captions ?? []), ...(mol.arrows ?? []), ...(mol.shapes ?? []), ...(mol.cycles ?? [])].flatMap((x) => (x.order ? [x.order] : [])))].sort((p, q) => p - q);
  const band = Math.floor(16000 / Math.max(1, orders.length)), back = orders.filter((o) => o < 0).length, filled = new Map<number, number>();
  const starts = new Map(orders.map((o, k) => [o, 1 + k * band + (o > 0 ? 16384 : 0)]));
  let z = back * band, zOrder: number | undefined; // zOrder: the order of the thing being written
  const Z = () => {
    if (!zOrder) return z < back * band + 16384 ? ++z : z;
    const n = filled.get(zOrder) ?? 0;
    filled.set(zOrder, Math.min(n + 1, band - 1));
    return starts.get(zOrder)! + n;
  };

  // Everything on the page, with its type rank (ChemDraw writes children grouped by type, spec 7.2) and its group.
  type Out = { xml: string; rank: number; group?: number; box: Box };
  const outs: Out[] = [];
  // Groups nest: each object goes in the smallest group that holds it, inner groups first. Text that belongs to a
  // structure, arrow or cycle goes in the group of what it belongs to, so ChemDraw moves them together.
  const groups = mol.groups ?? [], parentOf = groupParents(groups);
  const innerFirst = groups.map((_, k) => k).sort((p, q) => groups[p].atoms.length + groups[p].items.length - groups[q].atoms.length - groups[q].items.length || q - p);
  const groupOfItem = new Map<number, number>(), groupOfAtom = new Map<number, number>();
  for (const g of innerFirst.map((k) => groups[k])) {
    for (const id of g.items) if (!groupOfItem.has(id)) groupOfItem.set(id, g.id);
    for (const i of g.atoms) if (!groupOfAtom.has(i)) groupOfAtom.set(i, g.id);
  }
  for (const c of mol.captions ?? []) {
    const host = groupOfItem.get(c.id) ?? (c.under?.length ? groupOfAtom.get(c.under[0]) : c.on ? groupOfItem.get(c.on.arrow) : c.cycle && groupOfItem.get(c.cycle.cycle));
    if (host !== undefined) groupOfItem.set(c.id, host);
  }
  const put = (xml: string, rank: number, box: Box, item?: number) => outs.push({ xml, rank, box, group: item === undefined ? undefined : groupOfItem.get(item) });
  const run = (text: string, s: { font: string; size: number; colour?: string; face: number }) => {
    const c = colour(s.colour);
    return `<s font="${font(s.font)}" size="${fmtSize(s.size)}"${c !== undefined ? ` color="${c}"` : ""}${s.face ? ` face="${s.face}"` : ""}>${escText(text)}</s>`;
  };
  const face = (s: RunStyle) => (s.bold ? 1 : 0) | (s.italic ? 2 : 0) | (s.underline ? 4 : 0) | (s.script === "sub" ? 0x20 : s.script === "super" ? 0x40 : 0);
  // A caption-styled text object written for ChemDraw only (a bracket's mark, a partial charge, a table cell).
  const note = (text: string, p: P, size: number, align: "left" | "centre" | "right", c?: string, item?: number) => {
    const w = widthOf(text, size), left = align === "left" ? p[0] : align === "right" ? p[0] - w : p[0] - w / 2, just = align === "centre" ? "Center" : align === "right" ? "Right" : undefined;
    put(el("t", { id: fresh(), p: pt(p), BoundingBox: boxText([left, p[1] - 0.716 * size, left + w, p[1]]), Z: Z(), color: colour(c), CaptionJustification: just, Justification: just, LineHeight: "auto", Octet: DERIVED },
      run(text, { font: style.captionFont, size, colour: c, face: 0 })), 2, [left, p[1] - size, left + w, p[1]], item);
  };

  // Shapes: boxes and ovals as graphics with their 3D frame (spec 9.2), turned as drawn, brackets as one graphic a
  // side, TLC plates, and tables as a group of lines and text that ChemDraw shows, with the table itself in Octet's
  // data. A line width set on the shape is its LineWidth.
  for (const sh of mol.shapes ?? []) {
    zOrder = sh.order;
    const id = idOf.get(sh.id)!, [x0, y0] = at([Math.min(sh.from[0], sh.to[0]), Math.max(sh.from[1], sh.to[1])]), [x1, y1] = at([Math.max(sh.from[0], sh.to[0]), Math.min(sh.from[1], sh.to[1])]);
    const up: Box = [x0, y0, x1, y1], c: P = [(x0 + x1) / 2, (y0 + y1) / 2], hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    // Points of the upright shape (page coordinates) where the turned shape has them, and the box round it as drawn.
    const middle: P = [(sh.from[0] + sh.to[0]) / 2, (sh.from[1] + sh.to[1]) / 2], turned = (q: P): P => (sh.angle ? at(turnPoint(q, middle, sh.angle)) : at(q));
    const drawn = shapeBounds(sh), box: Box = sh.angle ? [...at([drawn[0], drawn[3]]), ...at([drawn[2], drawn[1]])] as Box : up;
    const page = (q: P): P => [middle[0] + (q[0] - c[0]) / B, middle[1] - (q[1] - c[1]) / B];
    const frame = { Center3D: pt3(c), MajorAxisEnd3D: pt3(turned(page([c[0] + hw, c[1]]))), MinorAxisEnd3D: pt3(turned(page([c[0], c[1] + hh]))) };
    const shadow = sh.shadow ? Math.round(((sh.shade ?? SHADE).depth * B * 100) / line) : undefined;
    const ink = colour(sh.kind === "highlight" ? sh.colour ?? HIGHLIGHT : sh.colour), width = sh.width === undefined ? undefined : fmt(sh.width);
    if (sh.kind === "box" || sh.kind === "rounded" || sh.kind === "highlight") {
      const bits = [sh.kind === "rounded" && "RoundEdge", sh.shadow && "Shadow", sh.fill === "shaded" && "Shaded", (sh.fill === "solid" || sh.kind === "highlight") && "Filled", sh.dashed && "Dashed"].filter(Boolean);
      put(el("graphic", { id, BoundingBox: `${fmt(box[2])} ${fmt(box[3])} ${fmt(box[0])} ${fmt(box[1])}`, Z: Z(), color: ink, LineWidth: width, GraphicType: "Rectangle", RectangleType: bits.join(" ") || "Plain",
        CornerRadius: sh.kind === "rounded" ? Math.round((0.3 * B * 100) / line) : undefined, ShadowSize: shadow, ...frame, Octet: priv({ kind: sh.kind === "highlight" ? "highlight" : undefined, shade: sh.shade, angle: sh.angle }) }), 3, box, sh.id);
    } else if (sh.kind === "oval") {
      const bits = [Math.abs(hw - hh) < 0.01 && "Circle", sh.fill === "shaded" && "Shaded", sh.fill === "solid" && "Filled", sh.dashed && "Dashed", sh.shadow && "Shadowed"].filter(Boolean);
      put(el("graphic", { id, BoundingBox: `${pt(turned(page([c[0] + hw, c[1]])))} ${pt(c)}`, Z: Z(), color: ink, LineWidth: width, GraphicType: "Oval", OvalType: bits.join(" "), ShadowSize: shadow, ...frame, Octet: priv({ shade: sh.shade, angle: sh.angle }) }), 3, box, sh.id);
    } else if (isBracket(sh)) {
      // Each bracket runs so its lips point inward: the left one upward, the right one downward (spec 9.9), turned
      // with the shape.
      const sides = sh.side ? [sh.side] : ["left", "right"];
      sides.forEach((side, k) => {
        const ends = side === "left" ? [[x0, y1], [x0, y0]] : [[x1, y0], [x1, y1]];
        put(el("graphic", { id: k ? fresh() : id, BoundingBox: ends.map((q) => pt(turned(page(q as P)))).join(" "), Z: Z(), color: ink, LineWidth: width, LineType: sh.dashed ? "Dashed" : undefined, GraphicType: "Bracket", BracketType: { brackets: "Square", parens: "Round", braces: "Curly" }[sh.kind as "brackets"], IgnoreWarnings: sh.ignoreWarnings ? "yes" : undefined,
          Octet: priv(k ? { pair: id } : { mark: sh.mark, span: sh.side ? [Math.min(sh.from[0], sh.to[0]), Math.max(sh.from[0], sh.to[0])] : undefined, angle: sh.angle }) }), 3, box, sh.id);
      });
      if (sh.mark) { const m = markAt(sh, 1); note(sh.mark, at([m.x, -m.y]), style.captionSize, m.anchor === "end" ? "right" : "left", sh.colour, sh.id); }
    } else if (sh.kind === "tlc") {
      const t = tlcLayout(sh), tlc: Tlc = sh.tlc ?? { lanes: 1, spots: [] }, hide = new Set(tlc.hide ?? []);
      // Spots go in their lanes; Octet's own order comes back from its data when it differs.
      const order = tlc.spots.map((_, k) => k).sort((p, q) => tlc.spots[p].lane - tlc.spots[q].lane || p - q);
      const spot = (x: Spot) => {
        const { rx, ry } = t.size(x);
        return el("tlcspot", { id: fresh(), color: colour(x.colour), Rf: num6(x.rf), Width: Math.round(2 * rx * B * 65536), Height: Math.round(2 * ry * B * 65536), Tail: Math.round((x.tail ?? 0) * B * 65536),
          CurveType: x.style === "shaded" ? 256 : undefined, ShowRf: tlc.rf || x.showRf ? "yes" : undefined });
      };
      const lanes = Array.from({ length: tlc.lanes }, (_, k) => el("tlclane", { id: fresh() }, order.filter((j) => tlc.spots[j].lane === k).map((j) => spot(tlc.spots[j])).join(""))).join("");
      const face = (sh.bold ? 1 : 0) | (sh.italic ? 2 : 0) | (sh.underline ? 4 : 0);
      put(el("tlcplate", { id, BoundingBox: boxText(box), Z: Z(), color: ink, LineWidth: width, LabelFont: sh.font ? font(sh.font) : undefined, LabelSize: sh.size ? fmtSize(sh.size) : undefined, LabelFace: face || undefined, TopLeft: pt([x0, y0]), TopRight: pt([x1, y0]), BottomRight: pt([x1, y1]), BottomLeft: pt([x0, y1]),
        OriginFraction: num6(tlc.origin ?? TLC_ORIGIN), SolventFrontFraction: num6(tlc.front ?? TLC_FRONT), ShowOrigin: hide.has("origin") ? undefined : "yes", ShowSolventFront: hide.has("front") ? undefined : "yes", ShowBorders: hide.has("border") ? undefined : "yes",
        Octet: priv({ rf: tlc.rf, hollow: tlc.spots.flatMap((x, k) => (x.style === "hollow" ? [k] : [])).join(" ") || undefined, own: tlc.rf ? tlc.spots.flatMap((x, k) => (x.showRf ? [k] : [])).join(" ") || undefined : undefined,
          order: order.some((j, k) => j !== k) ? order.join(" ") : undefined }) }, lanes), 5, box, sh.id);
    } else if (sh.kind === "table") {
      // The table's rules and cells, laid out as Octet lays them out (text measured with Arial's widths).
      const size = sh.size ?? style.captionSize, face = (sh.bold ? 1 : 0) | (sh.italic ? 2 : 0) | (sh.underline ? 4 : 0);
      const t = tableLayout(sh, (s) => widthOf(s, size) / B), lines = new Set(linesOf(sh.table)), inner = (n: number) => Array.from({ length: Math.max(0, n - 1) }, (_, k) => k + 1);
      const across = [...(lines.has("top") ? [t.y1] : []), ...inner(t.rows).filter((r) => lines.has("rows") || (r === 1 && lines.has("header"))).map((r) => t.row(r)), ...(lines.has("bottom") ? [t.y0] : [])];
      const down = [...(lines.has("left") ? [t.x0] : []), ...(lines.has("cols") ? inner(t.cols).map((k) => t.col(k)) : []), ...(lines.has("right") ? [t.x1] : [])];
      const rules = [...across.map((v): [P, P] => [at([t.x0, v]), at([t.x1, v])]), ...down.map((v): [P, P] => [at([v, t.y1]), at([v, t.y0])])];
      const kids = rules.map(([p, q]) => el("graphic", { id: fresh(), BoundingBox: `${pt(p)} ${pt(q)}`, Z: Z(), color: colour(sh.colour), LineWidth: sh.table?.weight === undefined ? undefined : fmt(sh.table.weight), LineType: sh.dashed ? "Dashed" : undefined, GraphicType: "Line", Octet: DERIVED }));
      (sh.table?.cells ?? []).forEach((row, r) => row.forEach((text, k) => {
        if (!text) return;
        const align = sh.table?.align?.[k] ?? "centre", x = align === "left" ? t.col(k) + 0.35 : align === "right" ? t.col(k + 1) - 0.35 : t.col(k) + t.widths[k] / 2;
        const p = at([x, t.row(r) - t.heights[r] / 2]), q: P = [p[0], p[1] + 0.35 * size], just = align === "centre" ? "Center" : align === "right" ? "Right" : undefined;
        kids.push(el("t", { id: fresh(), p: pt(q), Z: Z(), color: colour(sh.colour), CaptionJustification: just, Justification: just, LineHeight: "auto", Octet: DERIVED }, run(text, { font: sh.font ?? style.captionFont, size, colour: sh.colour, face })));
      }));
      put(el("group", { id, BoundingBox: boxText(box), Z: Z(), color: colour(sh.colour), Octet: priv({ kind: "table", table: sh.table ?? { cells: [[""]] }, dashed: sh.dashed, font: sh.font, size: sh.size, face: face || undefined }) }, kids.join("")), 0, box, sh.id);
    }
  }

  // Orbitals and filled pen curves sit behind the structures.
  const curveOut = (a: Arrow) => {
    const c = a.curve!, { start, end } = headsOf(a), half = (h: Head) => h === "left" || h === "right";
    const bits = (c.closed ? 1 : 0) | (a.style === "dashed" ? 2 : 0) | (a.style === "bold" ? 4 : 0) | (end === "full" ? 8 : 0) | (start === "full" ? 16 : 0) | (half(end) ? 32 : 0) | (half(start) ? 64 : 0)
      | (a.fill === "solid" ? 128 : 0) | (a.fill === "shaded" || a.fill === "faded" ? 256 : 0) | (a.style === "doubled" ? 512 : 0);
    const qs = c.points.flatMap((q) => [q.c1 ?? q.at, q.at, q.c2 ?? q.at]).map(at), heads = start !== "none" || end !== "none";
    put(el("curve", { id: idOf.get(a.id)!, Z: Z(), color: colour(a.colour), LineWidth: a.width === undefined ? undefined : fmt(a.width), FillType: a.fill === "solid" ? "Solid" : a.fill ? "Shaded" : undefined, CurveType: bits || undefined,
      ArrowheadHead: HEADS[end], ArrowheadTail: HEADS[start], ArrowheadType: HEAD_SHAPES[a.head ?? "solid"], HeadSize: heads ? 1000 : undefined, ArrowheadCenterSize: heads ? 875 : undefined, ArrowheadWidth: heads ? 250 : undefined,
      Closed: c.closed ? "yes" : undefined, CurvePoints: qs.map(pt).join(" "), Octet: priv({ fill: a.fill === "faded" ? "faded" : undefined, style: a.style === "wavy" ? "wavy" : undefined }) }), 4, boxOf(qs), a.id);
  };
  for (const a of mol.arrows ?? []) {
    zOrder = a.order;
    if (a.kind === "orbital" && a.orbital) {
      const { shape, phase } = a.orbital;
      const name = (ORBITALS.find(([, s, p]) => s === shape && p === phase) ?? ORBITALS.find(([n, s]) => s === shape && n.endsWith("Filled") === (phase === "filled")) ?? ORBITALS.find(([, s]) => s === shape)!)[0];
      const back = ORBITALS.find(([n]) => n === name)!, tip = at(a.to), nucleus = at(a.from);
      put(el("graphic", { id: idOf.get(a.id)!, BoundingBox: `${pt(tip)} ${pt(nucleus)}`, Z: Z(), color: colour(a.colour), LineWidth: a.width === undefined ? undefined : fmt(a.width), GraphicType: "Orbital", OrbitalType: name,
        Octet: back[1] === shape && back[2] === phase ? undefined : priv({ orbital: a.orbital }) }), 3, boxOf([nucleus], len(sub(tip, nucleus))), a.id);
    } else if (a.kind === "curve" && a.curve?.closed && a.fill) curveOut(a);
  }

  // Structures: one fragment per connected set of atoms, its nodes, bonds and the symbols drawn on its atoms.
  const nodeId = new Map<number, number>(), bondId = mol.bonds.map(() => 0), fragId = new Map<number, number>();
  const nbrs: number[][] = mol.atoms.map(() => []), bondsAt: number[][] = mol.atoms.map(() => []);
  mol.bonds.forEach((b, k) => { nbrs[b.atoms[0]].push(b.atoms[1]); nbrs[b.atoms[1]].push(b.atoms[0]); bondsAt[b.atoms[0]].push(k); bondsAt[b.atoms[1]].push(k); });
  const used = (i: number) => bondsAt[i].reduce((n, k) => n + (BOND_ORDER[mol.bonds[k].type] ?? 1), 0);
  // Node and bond ids rise in Octet's atom and bond order, which is how the reader puts that order back.
  const frags = fragments(mol).map((f) => f.sort((p, q) => p - q)).sort((p, q) => p[0] - q[0]);
  mol.atoms.forEach((_, i) => nodeId.set(i, fresh()));
  mol.bonds.forEach((_, k) => { bondId[k] = fresh(); });
  for (const atoms of frags) { const f = fresh(); for (const i of atoms) fragId.set(i, f); }
  const page = (i: number) => at(mol.atoms[i].location);
  // Aromatic rings drawn with a circle: ChemDraw stores their bonds as order 1.5 and the circle as an oval inside the
  // ring's fragment (its own files). Octet keeps each bond's Kekulé order in its own data, to read back exactly.
  const circled = circledRings(mol), ringBond = new Set<number>();
  for (const r of circled) r.forEach((x, k) => { const y = r[(k + 1) % r.length]; ringBond.add(mol.bonds.findIndex((b) => (b.atoms[0] === x && b.atoms[1] === y) || (b.atoms[0] === y && b.atoms[1] === x))); });
  const circles = (atoms: number[]) => circled.filter((r) => atoms.includes(r[0])).map((r) => {
    const c: P = [r.reduce((s, i) => s + page(i)[0], 0) / r.length, r.reduce((s, i) => s + page(i)[1], 0) / r.length];
    const edge = Math.min(...r.map((x, k) => len(sub(page(r[(k + 1) % r.length]), page(x)))));
    const radius = ringCircleRadius(r.length, edge, style.spacing / 100), major: P = [c[0] + radius, c[1]], minor: P = [c[0], c[1] + radius];
    return el("graphic", { id: fresh(), BoundingBox: `${pt(major)} ${pt(c)}`, Z: Z(), color: colour(mol.atoms[r[0]].colour), GraphicType: "Oval", OvalType: "Circle",
      Center3D: pt3(c), MajorAxisEnd3D: pt3(major), MinorAxisEnd3D: pt3(minor), Octet: DERIVED });
  }).join("");
  for (const atoms of frags) {
    zOrder = mol.atoms[atoms[0]].order;
    let xml = "";
    const boxes: Box[] = [];
    for (const i of atoms) {
      const n = node(i);
      xml += n.xml;
      boxes.push(n.box);
    }
    for (const k of [...new Set(atoms.flatMap((i) => bondsAt[i]))].sort((p, q) => p - q)) xml += bond(k);
    for (const i of atoms) xml += marks(i);
    xml += circles(atoms);
    const box = union(boxes)!;
    outs.push({ xml: el("fragment", { id: fragId.get(atoms[0])!, BoundingBox: boxText(box), Z: Z() }, xml), rank: 1, box, group: atoms.map((i) => groupOfAtom.get(i)).find((g) => g !== undefined) });
  }

  // A node, with its label and, for an abbreviation Octet can expand, the abbreviation's atoms (spec 13.3).
  function node(i: number): { xml: string; box: Box } {
    const a = mol.atoms[i], X = page(i), deg = nbrs[i].length, charge = a.charge ?? 0;
    const shown = !a.attach && !a.bead && (a.label !== "C" || !deg || !!a.text || !!a.isotope || (deg === 1 ? style.terminalLabels : style.carbonLabels));
    const generic = !!a.text && /^(R\d{0,2}'{0,2}|X|Y|M|Q|A)$/.test(a.text);
    const inner = a.text && !generic ? opts.expand?.(a.text) : undefined;
    const type = a.attach || a.bead ? "ExternalConnectionPoint" : generic ? "GenericNickname" : a.text ? (inner?.atoms.length ? "Fragment" : "Unspecified") : undefined;
    const element = type ? undefined : a.label === "D" ? 1 : SYMBOLS.indexOf(a.label) + 1;
    const h = shown && !a.text ? a.implicitHCount ?? hydrogens(a.label, charge, used(i), a.radical === 3 ? 2 : a.radical) : undefined;
    const enhanced = /^(abs|&|or)(\d*)$/.exec(a.enhanced ?? "");
    const label = shown ? labelOf(i, style.hideH ? 0 : h ?? 0) : undefined;
    const z = a.location[2] ?? 0;
    const xml = el("n", {
      id: nodeId.get(i)!, p: pt(X), Z: Z(), NodeType: type, Element: element && element !== 6 ? element : undefined, Isotope: type ? undefined : a.isotope ?? (a.label === "D" ? 2 : undefined), Charge: charge || undefined,
      Radical: a.radical ? RADICALS[a.radical === 3 ? 1 : Math.min(2, a.radical) + 1] : undefined, NumHydrogens: h, ExternalConnectionType: a.attach ? "Wavy" : a.bead ? "PolymerBead" : undefined,
      NeedsClean: shown ? "yes" : undefined, GenericNickname: generic ? a.text : undefined,
      EnhancedStereoType: enhanced ? { abs: "Absolute", "&": "And", or: "Or" }[enhanced[1]] : undefined, EnhancedStereoGroupNum: enhanced?.[2] || undefined,
      color: colour(a.colour), highlightColor: colour(a.halo), ShowAtomStereo: a.cip ? "yes" : undefined, ShowAtomNumber: a.number ? "yes" : undefined, AtomNumber: a.number, IgnoreWarnings: a.ignoreWarnings ? "yes" : undefined, xyz: z ? `${pt(X)} ${fmt(z * B)}` : undefined,
      BondOrdering: inner && deg > 1 ? bondsAt[i].map((k) => bondId[k]).join(" ") : undefined,
      Octet: priv({ hmark: a.hmark, partial: a.partial, depth: a.depth === false ? false : undefined, map: a.map, circle: a.circle }),
    }, (inner ? nested(i, inner) : "") + (label?.xml ?? ""));
    if (a.partial) note(a.partial === "+" ? "δ+" : "δ−", [X[0] + 0.45 * B, X[1] - 0.45 * B] as P, style.labelSize * 0.75, "left", a.colour);
    return { xml, box: label?.box ?? [X[0], X[1], X[0], X[1]] };
  }

  // An atom's label as ChemDraw stores it: the text in formula face, any charge as a superscript run after it, and
  // its anchor placed so the attaching glyph sits on the atom (spec 13.1). H goes where Octet draws it.
  function labelOf(i: number, h: number): { xml: string; box: Box } {
    const a = mol.atoms[i], X = page(i), size = a.size ?? style.labelSize, charge = a.charge ?? 0, deg = nbrs[i].length;
    const v = nbrs[i].reduce<P>((acc, j) => { const d = sub(page(j), X), l = len(d) || 1; return [acc[0] + d[0] / l, acc[1] + d[1] / l]; }, [0, 0]);
    const steep = len(v) > 1e-6 && Math.abs(v[1]) > Math.abs(v[0]) * Math.tan((70 * Math.PI) / 180), right = deg > 0 && !steep && v[0] > 1e-6;
    let text = a.text ?? a.label, just = a.text && right ? "Right" : "Left", stack: string | undefined;
    if (!a.text && h) {
      text += `H${h > 1 ? h : ""}`;
      if (deg ? right : H_FIRST.has(a.label)) just = "Right";
      else if (steep && deg >= 2) stack = v[1] > 0 ? "Above" : "Below";
    }
    const sign = charge && !a.circled ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ""}${charge > 0 ? "+" : "-"}` : "";
    // An isotope's mass number, a superscript run before the element; the element stays on the atom.
    const iso = !a.text && a.isotope && a.label !== "D" ? String(a.isotope) : "", isoW = widthOf(iso, 0.75 * size);
    const wide = (s: string) => [...s].reduce((w, ch, k) => w + advance(ch, /\d/.test(ch) && k ? 0.75 * size : size), 0);
    const first = units(text)[0]?.text + (units(text)[0]?.count ?? ""), width = isoW + wide(text) + widthOf(sign, 0.75 * size);
    const x = just === "Right" ? X[0] - advance(text[0], size) / 2 + wide(first) + widthOf(sign, 0.75 * size) : X[0] - advance(text[0], size) / 2 - isoW;
    const y = X[1] + (/[OSCGQ]/.test(text) ? 0.364 : 0.358) * size, left = just === "Right" ? x - width : x;
    const box: Box = [left, y - 0.716 * size, left + width, y + (/\d/.test(text) ? 0.15 * size : 0)];
    const style2 = { font: a.font ?? style.labelFont, size, colour: a.colour }, look = (a.bold ? 1 : 0) | (a.italic ? 2 : 0) | (a.underline ? 4 : 0);
    return {
      xml: el("t", { p: pt([x, y]), BoundingBox: boxText(box), color: colour(a.colour), LabelJustification: just, Justification: just === "Left" ? undefined : just, LabelAlignment: stack },
        (iso ? run(iso, { ...style2, face: 0x40 | look }) : "") + run(text, { ...style2, face: 0x60 | look }) + (sign ? run(sign, { ...style2, face: 0x40 | look }) : "")),
      box,
    };
  }

  // An abbreviation's own atoms, turned to point away from the host's bonds, with a connection point towards each
  // outer neighbour in the host's bond order (spec 13.3).
  function nested(i: number, inner: Mol): string {
    const X = page(i), out = nbrs[i].map((j) => { const d = sub(page(j), X), l = len(d) || 1; return [d[0] / l, d[1] / l] as P; });
    const away: P = out.length ? out.reduce<P>((s, d) => [s[0] - d[0], s[1] - d[1]], [0, 0]) : [1, 0];
    const o = inner.atoms[0].location, rel = (q: readonly number[]): P => [(q[0] - o[0]) * B, -(q[1] - o[1]) * B];
    const mid = inner.atoms.reduce<P>((s, q) => { const r = rel(q.location); return [s[0] + r[0], s[1] + r[1]]; }, [0, 0]);
    const t = len(mid) > 1e-6 && len(away) > 1e-6 ? Math.atan2(away[1], away[0]) - Math.atan2(mid[1], mid[0]) : 0;
    const place = (r: P): P => [X[0] + r[0] * Math.cos(t) - r[1] * Math.sin(t), X[1] + r[0] * Math.sin(t) + r[1] * Math.cos(t)];
    const ids = inner.atoms.map(() => fresh());
    let xml = inner.atoms.map((q, k) => {
      const e = SYMBOLS.indexOf(q.label) + 1;
      return el("n", { id: ids[k], p: pt(place(rel(q.location))), Element: e > 0 && e !== 6 ? e : undefined, Charge: q.charge || undefined });
    }).join("");
    xml += inner.bonds.map((b) => el("b", { id: fresh(), B: ids[b.atoms[0]], E: ids[b.atoms[1]], Order: b.type === 2 ? "2" : b.type === 3 ? "3" : undefined })).join("");
    for (const d of out) {
      const point = fresh();
      xml += el("n", { id: point, p: pt([X[0] + d[0] * B, X[1] + d[1] * B]), NodeType: "ExternalConnectionPoint" }) + el("b", { id: fresh(), B: point, E: ids[0] });
    }
    return el("fragment", { id: fresh() }, xml);
  }

  // A bond: order, display, forced double-bond side, colour, and its neighbours' order round a double bond (spec 13.4).
  function bond(k: number): string {
    const b = mol.bonds[k], d = b.display, [i, j] = b.atoms;
    const display = b.type === 1 ? (b.stereo === 1 ? "WedgeBegin" : b.stereo === 6 ? "WedgedHashBegin" : d ? ({ bold: "Bold", dashed: "Dash", hashed: "Hash", wavy: "Wavy", hollow: "HollowWedgeBegin" } as Record<string, string>)[d] : undefined)
      : b.type === 2 ? ({ bold: "Bold", either: "Wavy" } as Record<string, string>)[d ?? ""] : undefined;
    let circular: string | undefined;
    if (b.type === 2 && nbrs[i].length > 1 && nbrs[j].length > 1) {
      // [Begin-left, Begin-right, End-right, End-left], looking from Begin to End on the page (y down).
      const axis = sub(page(j), page(i)), slots = [0, 0, 0, 0];
      const fill = (x: number, left: number, right: number) => {
        for (const kk of bondsAt[x]) {
          if (kk === k) continue;
          const y = mol.bonds[kk].atoms[0] === x ? mol.bonds[kk].atoms[1] : mol.bonds[kk].atoms[0], s = cross(axis, sub(page(y), page(x))) < 0 ? left : right;
          const slot = slots[s] ? (s === left ? right : left) : s;
          if (!slots[slot]) slots[slot] = bondId[kk];
        }
      };
      fill(i, 0, 1);
      fill(j, 3, 2);
      circular = slots.join(" ");
    }
    // A dashed double bond is ChemDraw's Tautomeric (its ⇧D): order 1.5, the second line dashed. Its Aromatic double
    // has both lines dashed.
    const ring = ringBond.has(k), dashed = !ring && b.type === 2 && (d === "dashed" || d === "aromatic");
    return el("b", {
      id: bondId[k], Z: Z(), B: nodeId.get(i)!, E: nodeId.get(j)!,
      Order: ring || dashed || b.type === 4 ? "1.5" : d === "dative" ? "dative" : b.type === 2 ? "2" : b.type === 3 ? "3" : undefined,
      Display: ring ? undefined : dashed && d === "aromatic" ? "Dash" : display, Display2: dashed ? "Dash" : undefined, Octet: ring ? priv({ order: b.type }) : undefined, DoublePosition: b.type === 2 && b.position ? { left: "Left", right: "Right", centre: "Center" }[b.position] : undefined,
      color: colour(b.colour), ShowBondStereo: mol.atoms[i].cip && mol.atoms[j].cip ? "yes" : undefined, BondCircularOrdering: circular, IgnoreWarnings: b.ignoreWarnings ? "yes" : undefined,
    });
  }

  // The symbols ChemDraw draws round an atom (spec 9.10): a circled charge or a skeletal carbon's charge, radical
  // electrons and lone pairs, each in the widest gap between the atom's bonds and label.
  function marks(i: number): string {
    const a = mol.atoms[i], X = page(i), charge = a.charge ?? 0, deg = nbrs[i].length;
    const shown = !a.attach && !a.bead && (a.label !== "C" || !deg || !!a.text || !!a.isotope || (deg === 1 ? style.terminalLabels : style.carbonLabels));
    const list: [string, string[]][] = [];
    if (charge && (a.circled || !shown)) list.push([a.circled ? (charge > 0 ? "CirclePlus" : "CircleMinus") : charge > 0 ? "Plus" : "Minus", ["Charge"]]);
    // A singlet radical (carbene) is a pair of electrons that stands for the radical.
    if (a.radical === 3) list.push(["LonePair", ["Radical"]]);
    else for (let r = 0; r < Math.min(2, a.radical ?? 0); r++) list.push(["Electron", ["Radical"]]);
    for (let r = 0; r < Math.min(4, a.pairs ?? 0); r++) list.push(["LonePair", []]);
    if (!list.length) return "";
    const taken = nbrs[i].map((j) => { const d = sub(page(j), X); return Math.atan2(d[1], d[0]); });
    if (shown && (a.text || a.label !== "C")) taken.push(a.text && nbrs[i].length && taken.every((t) => Math.cos(t) > 0) ? Math.PI : 0);
    const angles: number[] = [];
    if (list[0][1][0] === "Charge" && taken.every((t) => Math.abs(Math.atan2(Math.sin(t + Math.PI / 4), Math.cos(t + Math.PI / 4))) >= Math.PI / 5)) { angles.push(-Math.PI / 4); taken.push(-Math.PI / 4); }
    const sorted = taken.map(turn).sort((p, q) => p - q);
    const gaps = sorted.length ? sorted.map((t, k) => ({ start: t, size: k + 1 < sorted.length ? sorted[k + 1] - t : sorted[0] + 2 * Math.PI - t, n: 0 })) : [{ start: -Math.PI / 2, size: 2 * Math.PI, n: 0 }];
    for (let k = angles.length; k < list.length; k++) gaps.reduce((best, g) => (g.size / (g.n + 1) > best.size / (best.n + 1) + 1e-6 ? g : best)).n++;
    for (const g of gaps) for (let k = 0; k < g.n; k++) angles.push(g.start + (g.size * (k + 1)) / (g.n + 1));
    const r = 0.5 * B, size = (7.5 * style.labelSize) / 10;
    return list.map(([type, represent], k) => {
      const c: P = [X[0] + r * Math.cos(angles[k]), X[1] + r * Math.sin(angles[k])];
      return el("graphic", { id: fresh(), BoundingBox: `${pt(c)} ${pt([c[0] - size, c[1]])}`, Z: Z(), color: colour(a.colour), GraphicType: "Symbol", SymbolType: type },
        represent.map((what) => `<represent attribute="${what}" object="${nodeId.get(i)}"/>`).join(""));
    }).join("");
  }

  // Arrows: each written twice, as ChemDraw 22 does (spec 11): the arrow, and a legacy line or arc graphic that
  // points at it with SupersededBy. Curved arrows store their circle as a frame and a signed sweep (spec 10.2).
  const legacyOf = new Map<number, number>();
  const arrowOut = (a: Arrow, derived: boolean) => {
    const id = derived ? fresh() : idOf.get(a.id)!, S = at(a.from), T = at(a.to);
    let head: string | undefined, tail: string | undefined, type = "Solid", spacing: number | undefined, nogo = false, sizes = [1000, 875, 250];
    if (takesHeads(a) || a.kind === "nogo") {
      const h = headsOf(a);
      [head, tail, type, nogo] = [HEADS[h.end], HEADS[h.start], HEAD_SHAPES[a.head ?? "solid"], a.kind === "nogo"];
    } else if (a.kind === "equilibrium") [head, tail, spacing] = ["HalfLeft", "HalfLeft", Math.round((0.22 * B * 100) / line)];
    else if (a.kind === "retro") [head, type, spacing, sizes] = ["Full", "Angle", Math.round((0.18 * B * 100) / line), [1000, 1000, Math.round(250 + (18 * B) / line)]];
    const arc = curved(a) && a.bend ? circle(S, at(bendPoint(a)), T) : undefined;
    let frame: Record<string, string>, angular: number | undefined, path: P[];
    if (arc) {
      // The sweep from tail to head that passes the arc's middle, in the page's angles; AngularSize is minus it.
      const { O, r } = arc, ang = (q: P) => Math.atan2(q[1] - O[1], q[0] - O[0]), M = at(bendPoint(a));
      let sweep = turn(ang(T) - ang(S));
      if (turn(ang(M) - ang(S)) > sweep) sweep -= 2 * Math.PI;
      angular = (-sweep * 180) / Math.PI;
      frame = { Center3D: pt3(O), MajorAxisEnd3D: pt3([O[0] + r, O[1]]), MinorAxisEnd3D: pt3([O[0], O[1] + r]) };
      path = Array.from({ length: 33 }, (_, k) => { const t = ang(S) + (sweep * k) / 32; return [O[0] + r * Math.cos(t), O[1] + r * Math.sin(t)] as P; });
    } else {
      const d = sub(T, S);
      frame = { Center3D: pt3(S), MajorAxisEnd3D: pt3([S[0] + d[0], S[1] + d[1]]), MinorAxisEnd3D: pt3([S[0] - d[1], S[1] + d[0]]) };
      path = [S, T];
    }
    const kind = kindOf({ arc: !!arc, head, tail, type, spacing: !!spacing, nogo });
    const lineType = a.style === "dashed" ? "Dashed" : a.style === "bold" ? "Bold" : a.style === "wavy" ? "Wavy" : undefined;
    const box = boxOf(path, head || tail ? (sizes[2] * line) / 100 : line / 2), z = Z(), legacy = fresh(), c = colour(a.colour), width = a.width === undefined ? undefined : fmt(a.width);
    // A catalytic cycle's arrow goes in the cycle's group, and names its cycle so Octet reads the group back.
    const cycle = derived ? (a as Arrow & { cycle?: number }).cycle : undefined, item = derived ? cycle : a.id;
    const tag = cycle !== undefined && idOf.has(cycle) ? priv({ d: 1, cycle: idOf.get(cycle) }) : DERIVED;
    legacyOf.set(a.id, legacy);
    // The legacy copy: a line from head to tail, or an arc from the head round its centre, with the old arrow type.
    const legacyType = a.kind === "equilibrium" ? "Equilibrium" : a.kind === "retro" ? "RetroSynthetic" : head === "Full" && tail === "Full" ? "Resonance"
      : head === "Full" || (!head && tail === "Full") ? "FullHead" : head || tail ? "HalfHead" : undefined;
    const flip = !arc && !head && !!tail, snapped = arc ? [90, 120, 180, 270].reduce((best, s) => (Math.abs(Math.abs(angular!) - s) < Math.abs(Math.abs(angular!) - best) ? s : best)) * (head && angular! < 0 ? -1 : 1) : undefined;
    put(el("graphic", { id: legacy, SupersededBy: id, BoundingBox: arc ? `${pt(T)} ${pt(arc.O)}` : flip ? `${pt(S)} ${pt(T)}` : `${pt(T)} ${pt(S)}`, Z: z, color: c, LineWidth: width, LineType: lineType,
      GraphicType: arc ? "Arc" : "Line", ArrowType: legacyType, HeadSize: 1000, AngularSize: snapped, Octet: derived ? tag : undefined }), 3, box, item);
    put(el("arrow", {
      id, BoundingBox: boxText(box), Z: z, color: c, LineWidth: width, LineType: lineType, FillType: "None", ArrowheadHead: head, ArrowheadTail: tail, ArrowheadType: type,
      HeadSize: sizes[0], ArrowheadCenterSize: sizes[1], ArrowheadWidth: sizes[2], ArrowShaftSpacing: spacing, NoGo: nogo ? "Cross" : undefined, AngularSize: angular === undefined ? undefined : fmtAngle(angular),
      Head3D: pt3(T), Tail3D: pt3(S), ...frame, Octet: derived ? tag : priv({ kind: kind === a.kind ? undefined : a.kind, style: a.style === "doubled" ? "doubled" : undefined, bend: arc ? a.bend : undefined, grid: gridOf(a.id) }),
    }), 6, box, item);
  };
  for (const a of mol.arrows ?? []) {
    zOrder = a.order;
    if (a.kind === "curve" && a.curve) { if (!(a.curve.closed && a.fill)) curveOut(a); }
    else if (a.kind !== "orbital") arrowOut(a, false);
  }
  for (const a of opts.derived ?? []) { zOrder = a.order; if (a.kind !== "orbital" && a.kind !== "curve") arrowOut(a, true); }

  // Captions: style runs (spec 8.1), the caption's own style as the text's caption style, and the anchor by its
  // alignment. Captions Octet places itself (under a structure, on an arrow) are written where Octet would put them.
  const captions = [...(mol.captions ?? [])].sort((p, q) => p.id - q.id);
  const stacked = new Map<string, number>();
  for (const c of captions) {
    zOrder = c.order;
    const size = c.size ?? style.captionSize, align = c.align === "justify" ? "left" : c.align ?? "centre", lines = c.text.split("\n").length;
    let [x, y] = [c.x, c.y];
    const arrow = c.on && mol.arrows?.find((a) => a.id === c.on!.arrow);
    const atoms = (c.under ?? []).filter((i) => i < mol.atoms.length);
    if (atoms.length) {
      const xs = atoms.map((i) => mol.atoms[i].location[0]), key = [...atoms].sort((p, q) => p - q).join(" "), k = stacked.get(key) ?? 0;
      stacked.set(key, k + lines);
      x = align === "left" ? Math.min(...xs) - 0.3 : align === "right" ? Math.max(...xs) + 0.3 : (Math.min(...xs) + Math.max(...xs)) / 2;
      y = Math.min(...atoms.map((i) => mol.atoms[i].location[1])) - 0.3 - (15 + 0.905 * size + k * 1.2 * size) / B;
    } else if (arrow) {
      const mid: P = [(arrow.from[0] + arrow.to[0]) / 2, (arrow.from[1] + arrow.to[1]) / 2], flat = Math.abs(arrow.to[0] - arrow.from[0]) >= Math.abs(arrow.to[1] - arrow.from[1]);
      x = flat ? mid[0] : mid[0] + ((c.on!.side === "above" ? -1 : 1) * 3) / B;
      y = flat ? mid[1] + (c.on!.side === "above" ? 3 + 0.212 * size + (lines - 1) * 1.2 * size : -(3 + 0.905 * size)) / B : mid[1];
    }
    const p = at([x, y]), runs = runsOf(c), whole: RunStyle = { bold: c.bold || undefined, italic: c.italic || undefined, underline: c.underline || undefined };
    const width = Math.max(...c.text.split("\n").map((l) => widthOf(l, size))), left = align === "left" ? p[0] : align === "right" ? p[0] - width : p[0] - width / 2;
    const box: Box = [left, p[1] - 0.716 * size, left + width, p[1] + (lines - 1) * 1.15 * size + 0.212 * size];
    const just = c.align === "justify" ? "Full" : align === "centre" ? "Center" : align === "right" ? "Right" : undefined, cf = face(whole);
    put(el("t", {
      id: idOf.get(c.id)!, p: pt(p), BoundingBox: boxText(box), Z: Z(), color: colour(c.colour), CaptionFont: c.font ? font(c.font) : undefined, CaptionSize: c.size, CaptionFace: cf || undefined,
      WordWrapWidth: c.width ? Math.round(c.width * B) : undefined,
      // Line spacing as ChemDraw writes it: a text's LineHeight is auto or pt, and Variable is its caption style's.
      CaptionJustification: just, Justification: just, LineHeight: c.lineHeight === "variable" ? undefined : typeof c.lineHeight === "number" ? fmtSize(c.lineHeight) : "auto",
      CaptionLineHeight: c.lineHeight === "variable" ? "variable" : undefined,
      Octet: priv({ under: c.under?.map((i) => nodeId.get(i)).filter((n) => n !== undefined), cycle: c.cycle && { ...c.cycle, cycle: idOf.get(c.cycle.cycle) }, xy: x !== c.x || y !== c.y ? [c.x, c.y] : undefined,
        width: c.width && Math.round(c.width * B) / B !== c.width ? c.width : undefined }),
    }, runs.map((r) => run(r.text, { font: r.font ?? c.font ?? style.captionFont, size: r.size ?? size, colour: r.colour ?? c.colour, face: face({ ...whole, ...r }) })).join("")), 2, box, c.id);
  }

  // Reaction schemes: each reaction Octet finds (structures, plus signs and arrows in a row) as a scheme with a step
  // per arrow, listing fragments, the legacy arrow graphic, conditions above and below, and atom maps (spec 14).
  const schemes: string[] = [], done = new Set<number>(), arrows = mol.arrows ?? [];
  const ink = (atoms: number[]): Box => { const xs = atoms.map((i) => mol.atoms[i].location[0]), ys = atoms.map((i) => mol.atoms[i].location[1]); return [Math.min(...xs) - 0.3, Math.min(...ys) - 0.3, Math.max(...xs) + 0.3, Math.max(...ys) + 0.3]; };
  const captionBox = (id: number): Box | undefined => {
    const c = captions.find((x) => x.id === id), size = (c?.size ?? style.captionSize) / B;
    if (!c || c.under || c.on || c.cycle) return undefined;
    const w = widthOf(c.text, c.size ?? style.captionSize) / B, x0 = c.align === "left" ? c.x : c.align === "right" ? c.x - w : c.x - w / 2;
    return [x0, c.y - 0.2 * size, x0 + w, c.y + 0.7 * size];
  };
  type RowStep = NonNullable<ReturnType<typeof findReaction>>["steps"][number];
  const step = (arrowId: number, before: RowStep[], after: RowStep[]) => {
    const frag = (s: RowStep[]) => s.flatMap((x) => (x.kind === "structure" ? [fragId.get(x.atoms[0])!] : []));
    const list = (ids: number[]) => (ids.length ? ids.join(" ") : undefined);
    const on = (side: string) => captions.filter((c) => c.on?.arrow === arrowId && c.on.side === side).map((c) => idOf.get(c.id)!);
    const mapped = (s: RowStep[]) => s.flatMap((x) => (x.kind === "structure" ? x.atoms.filter((i) => mol.atoms[i].map) : []));
    const pairs = mapped(before).flatMap((i) => { const j = mapped(after).find((k) => mol.atoms[k].map === mol.atoms[i].map); return j === undefined ? [] : [nodeId.get(i)!, nodeId.get(j)!]; });
    return el("step", {
      id: fresh(), ReactionStepReactants: list(frag(before)), ReactionStepProducts: list(frag(after)), ReactionStepPlusses: list([...before, ...after].flatMap((x) => (x.kind === "plus" ? [idOf.get(x.id)!] : []))),
      ReactionStepArrows: legacyOf.get(arrowId), ReactionStepObjectsAboveArrow: list(on("above")), ReactionStepObjectsBelowArrow: list(on("below")), ReactionStepAtomMapManual: list(pairs),
    });
  };
  for (const a of arrows) {
    if (!straightArrow(a) || done.has(a.id)) continue;
    const r = findReaction(mol, a.id, arrows, ink, captionBox);
    if (!r) continue;
    const at = r.steps.flatMap((s, k) => (s.kind === "arrow" ? [k] : []));
    schemes.push(el("scheme", { id: fresh() }, at.map((k, n) => {
      const id = (r.steps[k] as { id: number }).id;
      done.add(id);
      return step(id, r.steps.slice(n ? at[n - 1] + 1 : 0, k), r.steps.slice(k + 1, n + 1 < at.length ? at[n + 1] : r.steps.length));
    }).join("")));
  }
  for (const a of arrows) if (!done.has(a.id) && legacyOf.has(a.id) && captions.some((c) => c.on?.arrow === a.id)) schemes.push(el("scheme", { id: fresh() }, step(a.id, [], [])));

  zOrder = undefined;
  // Groups hold their structures and objects, inner groups first, each in the group round it (with its own Integral).
  const RANKED = (list: Out[]) => [...list].sort((p, q) => p.rank - q.rank);
  for (const k of innerFirst) {
    const g = groups[k], kids = outs.filter((o) => o.group === g.id), box = union(kids.map((o) => o.box));
    if (!kids.length || !box) continue;
    for (const o of kids) o.group = -1;
    const parent = parentOf[k];
    outs.push({ xml: el("group", { id: idOf.get(g.id)!, BoundingBox: boxText(box), Z: Z(), Integral: g.integral ? "yes" : undefined }, RANKED(kids).map((o) => o.xml).join("")), rank: 0, box, group: parent === undefined ? undefined : groups[parent].id });
  }
  const top = outs.filter((o) => o.group !== -1), all = union(top.map((o) => o.box)) ?? [0, 0, 0, 0];
  const cycles = (mol.cycles ?? []).map((c: Cycle) => ({ id: idOf.get(c.id), centre: c.centre, radius: c.radius, clockwise: c.clockwise, nodes: c.nodes.map((n) => n.map((i) => nodeId.get(i)).filter((v) => v !== undefined)), colour: c.colour }));
  const pageXml = el("page", { id: fresh(), BoundingBox: `0 0 ${fmt(W)} ${fmt(H)}`, HeaderPosition: 36, FooterPosition: 36, PrintTrimMarks: "yes", HeightPages: 1, WidthPages: 1 }, RANKED(top).map((o) => o.xml).join("") + schemes.join(""));
  const doc = colour(style.colour) ?? 0;
  const rgb = (c: string) => [1, 3, 5].map((k) => fmtColour(parseInt(c.slice(k, k + 2), 16) / 255));
  const tables = `<colortable>\n${colours.map((c) => { const [r, g, b] = rgb(c); return `<color r="${r}" g="${g}" b="${b}"/>`; }).join("\n")}\n</colortable><fonttable>\n${fonts.map((f, k) => `<font id="${k + 1}" charset="x-mac-roman" name="${escAttr(f)}"/>`).join("\n")}\n</fonttable>`;
  const root = el("CDXML", {
    CreationProgram: PROGRAM, Name: opts.name ?? "Untitled Document", BoundingBox: boxText(all), WindowPosition: "0 0", WindowSize: "0 0", FractionalWidths: "yes", InterpretChemically: "yes",
    ShowAtomQuery: "yes", ShowAtomStereo: "no", ShowAtomEnhancedStereo: "yes", ShowAtomNumber: "no", ShowResidueID: "no", ShowBondQuery: "yes", ShowBondRxn: "yes", ShowBondStereo: "no",
    ShowTerminalCarbonLabels: style.terminalLabels ? "yes" : "no", ShowNonTerminalCarbonLabels: style.carbonLabels ? "yes" : "no", HideImplicitHydrogens: style.hideH ? "yes" : "no", LabelFont: font(style.labelFont), LabelSize: fmtSize(style.labelSize), LabelFace: 96,
    CaptionFont: font(style.captionFont), CaptionSize: fmtSize(style.captionSize), HashSpacing: fmt(style.hash), MarginWidth: fmt(style.margin), LineWidth: fmt(style.line), BoldWidth: fmt(style.bold),
    BondLength: fmt(style.bond), BondSpacing: fmtSize(style.spacing), ChainAngle: 120, LabelJustification: "Auto", CaptionJustification: "Left", AminoAcidTermini: "HOH", ShowSequenceTermini: "yes",
    ShowSequenceBonds: "yes", ShowSequenceUnlinkedBranches: "no", ResidueWrapCount: 40, ResidueBlockCount: 10, PrintMargins: "36 36 36 36",
    ChemPropName: "", ChemPropFormula: "Chemical Formula: ", ChemPropExactMass: "Exact Mass: ", ChemPropMolWt: "Molecular Weight: ", ChemPropMOverZ: "m/z: ", ChemPropAnalysis: "Elemental Analysis: ",
    ChemPropBoilingPt: "Boiling Point: ", ChemPropMeltingPt: "Melting Point: ", ChemPropCritTemp: "Critical Temp: ", ChemPropCritPres: "Critical Pres: ", ChemPropCritVol: "Critical Vol: ",
    ChemPropGibbs: "Gibbs Energy: ", ChemPropLogP: "Log P: ", ChemPropMR: "MR: ", ChemPropHenry: "Henry's Law: ", ChemPropEForm: "Heat of Form: ", ChemProptPSA: "tPSA: ", ChemPropID: "", ChemPropFragmentLabel: "",
    color: doc, bgcolor: 1, RxnAutonumberStart: 1, RxnAutonumberConditions: "no", RxnAutonumberStyle: "Roman", RxnAutonumberFormat: "(#)",
    Octet: priv({ v: 1, page: style.page, custom: style.custom, landscape: style.landscape || undefined, edges: style.edges ? undefined : false, grid: style.grid || undefined,
      background: style.background === "white" ? undefined : style.background, cycles: cycles.length ? cycles : undefined }),
  }, tables + pageXml);
  return `<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" >\n${root}\n`;
}

// The selected part of a drawing: those atoms, the bonds between them, and those objects, with references kept
// only where what they name came too.
function pick(m: Mol, sel: { atoms: Iterable<number>; items: Iterable<number> }): Mol {
  const atoms = new Set([...sel.atoms].filter((i) => i >= 0 && i < m.atoms.length)), items = new Set(sel.items), map = new Map<number, number>();
  m.atoms.forEach((_, i) => { if (atoms.has(i)) map.set(i, map.size); });
  const keep = (ids: number[]) => ids.filter((i) => map.has(i)).map((i) => map.get(i)!);
  const arrows = (m.arrows ?? []).filter((a) => items.has(a.id)), cycles = (m.cycles ?? []).filter((c) => items.has(c.id)).map((c) => ({ ...c, nodes: c.nodes.map(keep).filter((n) => n.length) })).filter((c) => c.nodes.length >= 2);
  const captions = (m.captions ?? []).filter((c) => items.has(c.id) && (!c.cycle || cycles.some((y) => y.id === c.cycle!.cycle))).map((c) => {
    const out: Caption = { ...c, under: c.under && keep(c.under) };
    if (!out.under?.length) delete out.under;
    if (c.on && !arrows.some((a) => a.id === c.on!.arrow)) delete out.on;
    return out;
  });
  const shapes = (m.shapes ?? []).filter((s) => items.has(s.id)), ids = new Set([...arrows, ...cycles, ...captions, ...shapes].map((x) => x.id));
  const groups = (m.groups ?? []).map((g) => ({ ...g, atoms: keep(g.atoms), items: g.items.filter((id) => ids.has(id)) }));
  return tidyGroups({ atoms: m.atoms.filter((_, i) => map.has(i)), bonds: m.bonds.filter((b) => map.has(b.atoms[0]) && map.has(b.atoms[1])).map((b) => ({ ...b, atoms: [map.get(b.atoms[0])!, map.get(b.atoms[1])!] })), captions, arrows, shapes, cycles, groups });
}

// ---------------------------------------------------------------------------------------------------------------
// Reading. The file is hostile until checked: sizes and nesting are capped by the XML reader, every number is
// checked and bounded, and what Octet cannot hold is counted in `lost` (by what it was) instead of half-read.

export type CdxmlRead = { mol: Mol; style: DocStyle; lost: Record<string, number> };
const MAX_ATOMS = 100_000, MAX_OBJECTS = 10_000, MAX_TEXT = 2_000, MAX_LABEL = 40;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d{1,3})?$/;
const real = (s?: string) => { const t = s?.trim(); if (!t || !NUMBER.test(t)) return undefined; const v = Number(t); return Math.abs(v) < 1e7 ? v : undefined; };
const reals = (s: string | undefined, n: number) => { const v = (s ?? "").trim().split(/\s+/).slice(0, n).map(real); return v.length === n && v.every((x) => x !== undefined) ? (v as number[]) : undefined; };
// Integers are read up to the first character that is not a digit, as ChemDraw reads them (spec 1.2).
const int = (s?: string) => { const m = /^\s*([+-]?\d{1,10})/.exec(s ?? ""); return m ? Number(m[1]) : undefined; };
const yes = (s?: string) => s === "yes" || s === "true";
const idList = (s?: string) => (s ?? "").trim().split(/\s+/).slice(0, 100_000).map(int).filter((v): v is number => v !== undefined);
const isColour = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
// Text Octet can hold: no control characters but line breaks, tabs as spaces.
const cleanText = (s: string) => s.replace(/\t/g, " ").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");

// A font name as one of Octet's fonts, or as the family named, with the bold or italic its name carries ("Arial Bold
// Italic"). Symbol is left out: ChemDraw writes Greek in it as Latin letters.
function fontOf(name?: string): { font?: string; bold?: true; italic?: true } {
  if (!name) return {};
  const family = name.replace(/\b(Bold|Black|Heavy|Italic|Oblique|Regular|MT|PSMT)\b/gi, "").replace(/[-,]/g, " ").trim().replace(/\s+/g, " "), base = family.toLowerCase();
  const font = FONTS.find((f) => f.toLowerCase() === base) ?? (base === "times" ? "Times New Roman" : base.startsWith("helvetica") ? "Helvetica" : base.startsWith("arial") ? "Arial" : base !== "symbol" && fontName(family) ? family : undefined);
  return { font, ...(/\b(Bold|Black|Heavy)\b/i.test(name) ? { bold: true as const } : {}), ...(/\b(Italic|Oblique)\b/i.test(name) ? { italic: true as const } : {}) };
}

// A table from Octet's own data, if it is sound (the same limits as Octet's file format).
function readTable(v: unknown): Table | undefined {
  const t = v as Record<string, unknown>, list = (x: unknown, most: number, ok: (y: unknown) => boolean) => x === undefined || (Array.isArray(x) && x.length <= most && x.every(ok));
  if (!t || typeof t !== "object" || !Array.isArray(t.cells) || !t.cells.length || t.cells.length > 100) return undefined;
  if (!t.cells.every((r) => Array.isArray(r) && r.length >= 1 && r.length <= 20 && r.every((c) => typeof c === "string" && c.length <= 500 && !/[\u0000-\u0009\u000b-\u001f]/.test(c)))) return undefined;
  const size = (n: unknown) => isNum(n, 0.2, 50);
  if (!list(t.widths, 20, size) || !list(t.heights, 100, size) || !list(t.lines, 7, (x) => ["top", "bottom", "left", "right", "header", "rows", "cols"].includes(x as string))
    || !list(t.align, 20, (x) => ["left", "centre", "right"].includes(x as string)) || (t.weight !== undefined && !isNum(t.weight, 0.1, 10)) || (t.grid !== undefined && t.grid !== true)) return undefined;
  return {
    cells: t.cells as string[][], ...(t.grid ? { grid: true } : {}), ...(t.widths ? { widths: t.widths as number[] } : {}), ...(t.heights ? { heights: t.heights as number[] } : {}),
    ...(t.lines ? { lines: [...new Set(t.lines as TableLine[])] } : {}), ...(t.align ? { align: t.align as Table["align"] } : {}), ...(t.weight !== undefined ? { weight: t.weight as number } : {}),
  };
}

// A CDXML document (ChemDraw's own, or one Octet wrote) as an Octet drawing and its document style.
// Throws an Error with a message for the user when the file is not CDXML, is damaged or is too large.
export function fromCdxml(text: string): CdxmlRead {
  if (text.length > MAX_CHARS) throw new Error(TOO_BIG);
  if (!/<CDXML[\s>/]/.test(text.slice(0, 65536))) throw new Error(NOT_CDXML);
  const root = parseXml(text);
  if (root.name !== "CDXML") throw new Error(NOT_CDXML);
  const lost: Record<string, number> = {};
  const lose = (what: string, n = 1) => { lost[what] = (lost[what] ?? 0) + n; };
  const json = (x: Xml): Record<string, unknown> | undefined => {
    try { const v = x.attrs.Octet === undefined ? undefined : JSON.parse(x.attrs.Octet); return v && typeof v === "object" && !Array.isArray(v) ? v : undefined; } catch { return undefined; }
  };
  const top = json(root), octet = top?.v === 1; // Octet wrote this file and ChemDraw has not saved over it
  const priv = (x: Xml) => (octet ? json(x) : undefined);

  // First pass: arrows that can stand for their legacy graphics, graphics that point at an arrow, the largest id.
  const usable = new Set<number>(), superseded = new Set<number>();
  let maxId = 0, atomCount = 0;
  const scan = (x: Xml) => {
    const id = int(x.attrs.id) ?? 0;
    if (id > maxId && id < 2 ** 31) maxId = id;
    if (x.name === "n" && ++atomCount > MAX_ATOMS) throw new Error(TOO_BIG);
    if (x.name === "arrow" && x.attrs.Head3D && x.attrs.Tail3D && x.attrs.Center3D) usable.add(id);
    if (x.name === "graphic" && x.attrs.SupersededBy) superseded.add(int(x.attrs.SupersededBy) ?? 0);
    x.kids.forEach(scan);
  };
  scan(root);

  // Colours and fonts (spec 4 and 5).
  const table: string[] = [], fonts = new Map<number, string>();
  for (const k of root.kids) {
    if (k.name === "colortable") for (const c of k.kids.slice(0, 4096)) {
      const v = ["r", "g", "b"].map((a) => Math.round(Math.min(1, Math.max(0, real(c.attrs[a]) ?? 0)) * 255));
      table.push(`#${v.map(hex).join("")}`);
    }
    if (k.name === "fonttable") for (const f of k.kids.slice(0, 4096)) { const id = int(f.attrs.id); if (id !== undefined && f.attrs.name) fonts.set(id, f.attrs.name.slice(0, 100)); }
  }
  // A colour index as #RRGGBB; black (the default ink) as undefined.
  const colourOf = (s?: string) => {
    const k = int(s), c = k === undefined ? undefined : k === 0 ? "#000000" : k === 1 ? "#FFFFFF" : table[k - 2];
    return c === "#000000" ? undefined : c;
  };

  // The document style, and the page that sets the coordinate frame: its printable area's centre is Octet's 0,0.
  const pages = root.kids.filter((k) => k.name === "page");
  const pb = reals(pages[0]?.attrs.BoundingBox, 4) ?? [0, 0, 540, 720];
  const W = Math.max(1, pb[2] - pb[0]), H = Math.max(1, pb[3] - pb[1]), ox = pb[0] + middle(W), oy = pb[1] + middle(H);
  const r = root.attrs, bondPt = real(r.BondLength), B = bondPt && bondPt >= 1 && bondPt <= 200 ? bondPt : 14.4;
  const toOctet = (x: number, y: number): P => [(x - ox) / B, (oy - y) / B];
  const mm = [((W + 72) * 25.4) / 72, ((H + 72) * 25.4) / 72];
  const paper = Object.entries(PAGES).find(([, [w, h]]) => (Math.abs(w - mm[0]) < 1 && Math.abs(h - mm[1]) < 1) || (Math.abs(h - mm[0]) < 1 && Math.abs(w - mm[1]) < 1));
  const style = readStyle({
    page: paper?.[0] ?? "Custom", landscape: !!paper && mm[0] > mm[1] + 1, custom: mm.map((v) => Math.round(Math.min(2000, Math.max(10, v)) * 100) / 100),
    ...(octet ? { page: top!.page, custom: top!.custom, landscape: top!.landscape === true, edges: top!.edges !== false, grid: top!.grid, background: top!.background } : {}),
    bond: B, line: real(r.LineWidth), bold: real(r.BoldWidth), margin: real(r.MarginWidth), hash: real(r.HashSpacing), spacing: real(r.BondSpacing),
    labelFont: fontOf(fonts.get(int(r.LabelFont) ?? -1)).font, labelSize: real(r.LabelSize), captionFont: fontOf(fonts.get(int(r.CaptionFont) ?? -1)).font, captionSize: real(r.CaptionSize),
    colour: colourOf(r.color) ?? "#000000",
    terminalLabels: yes(r.ShowTerminalCarbonLabels), carbonLabels: yes(r.ShowNonTerminalCarbonLabels), hideH: yes(r.HideImplicitHydrogens),
  });

  // Octet's own angle for a turned shape, when the shape as ChemDraw holds it agrees (to 0.1°); else the one read.
  const exact = (own: unknown, read: number) => (isNum(own, -360, 360) && Math.abs(((((own as number) - read) % 360) + 540) % 360 - 180) < 0.1 ? (own as number) : read);
  // A turned shape set upright (settleShape), with its corners low and high whichever way ChemDraw ran its axes, so
  // it reads back the same once Octet has written it. The corners' order does not change how a shape draws.
  const settled = (sh: Shape & { z: number }): Shape & { z: number } => {
    const s = settleShape(sh) as Shape & { z: number };
    return { ...s, from: [Math.min(s.from[0], s.to[0]), Math.min(s.from[1], s.to[1])], to: [Math.max(s.from[0], s.to[0]), Math.max(s.from[1], s.to[1])] };
  };
  // A table's or TLC plate's text style: a font named, a size in pt, and face bits (bold 1, italic 2, underline 4).
  const textStyleOf = (name: unknown, size: unknown, face: unknown): Partial<Shape> => ({
    ...(typeof name === "string" && fontName(name) && name !== style.captionFont ? { font: name } : {}), ...(isNum(size, 4, 144) ? { size: size as number } : {}),
    ...(isNum(face, 0, 0xffff) && (face as number) & 1 ? { bold: true as const } : {}), ...(isNum(face, 0, 0xffff) && (face as number) & 2 ? { italic: true as const } : {}), ...(isNum(face, 0, 0xffff) && (face as number) & 4 ? { underline: true as const } : {}),
  });
  // A line width set on an object (pt), when it is not the document's.
  const lineWidthOf = (x: Xml) => { const w = real(x.attrs.LineWidth); return w !== undefined && w >= 0.05 && w <= 20 && Math.abs(w - style.line) > 1e-3 ? w : undefined; };

  // Octet ids: the file's own when Octet wrote it, otherwise numbered afresh.
  const taken = new Set<number>();
  let nextId = octet ? maxId + 1 : 1;
  const newId = (x?: Xml) => {
    const id = x && octet ? int(x.attrs.id) : undefined;
    if (id !== undefined && id > 0 && id < 2 ** 31 && !taken.has(id)) { taken.add(id); return id; }
    while (taken.has(nextId)) nextId++;
    taken.add(nextId);
    return nextId++;
  };

  const mol: Mol = { atoms: [], bonds: [] };
  const captions: (Caption & { z: number })[] = [], arrows: (Arrow & { z: number })[] = [], shapes: (Shape & { z: number })[] = [], grids: Grid[] = [];
  type G = { id: number; atoms: Set<number>; items: number[]; integral?: true; parent?: G };
  const groups: G[] = [];
  const nodeIds: number[] = [], bondIds: number[] = [];
  const atomOf = new Map<number, number>(), objectOf = new Map<number, number>(), arrowOfGraphic = new Map<number, number>();
  const labels: { i: number; text: string; type: string; isotope?: number }[] = [];
  const numH = new Map<number, number>(), delocalised: { k: number; order?: 1 | 2 }[] = [], ovals: { id: number; c: P; r: number }[] = [];
  const bondsToRead: Xml[] = [], symbols: { x: Xml; atoms: number[]; group?: G }[] = [], steps: Xml[] = [], unders: { c: Caption; nodes: unknown }[] = [];
  const brackets: { x: Xml; id: number; z: number; group?: G; ends: number[] }[] = [];
  const zOf = (x: Xml) => int(x.attrs.Z) ?? 0;
  const count = () => { if (captions.length + arrows.length + shapes.length + groups.length > 4 * MAX_OBJECTS) throw new Error(TOO_BIG); };
  // Groups nest: what is in a group is in each group round it too.
  const member = (g: G | undefined, id: number) => { for (let x = g; x; x = x.parent) x.items.push(id); };

  const visit = (x: Xml, group?: G, atoms?: number[]) => {
    const p = priv(x);
    // Written by Octet for ChemDraw's eyes only. A catalytic cycle's arrows name their cycle, so its group is known.
    if (p?.d === 1) return void (Number.isInteger(p.cycle) && member(group, p.cycle as number));
    if (x.attrs.Visible !== undefined && !yes(x.attrs.Visible)) { lose("hidden object"); return; }
    count();
    switch (x.name) {
      case "group":
        if (p?.kind === "table") return readTableGroup(x, p, group);
        { const g = newGroup(x, group); for (const k of x.kids) visit(k, g); }
        return;
      case "fragment": return readFragment(x, group);
      case "t": return readCaption(x, group);
      case "graphic": return readGraphic(x, group, atoms);
      case "curve": return readCurve(x, group);
      case "arrow": return readArrow(x, group);
      case "tlcplate": return readTlc(x, group);
      case "scheme": steps.push(...x.kids.filter((k) => k.name === "step")); return;
      case "step": steps.push(x); return;
      // Not drawn, but meaning Octet does not keep: notes, polymer brackets' meaning, live property text.
      case "annotation": return lose("annotation");
      case "bracketedgroup": return lose("bracket meaning");
      case "chemicalproperty": return lose("property link");
      case "objecttag": case "bracketattachment": case "crossingbond": case "represent": case "DocumentProperties": return;
      case "embeddedobject": return lose("picture");
      default: return lose(x.name);
    }
  };
  const newGroup = (x: Xml, parent?: G): G => {
    const g: G = { id: newId(x), atoms: new Set(), items: [], ...(x.attrs.Integral === "yes" ? { integral: true as const } : {}), parent };
    groups.push(g);
    return g;
  };

  // A fragment's nodes (not the atoms inside abbreviations), then its bonds, symbols and anything else in it.
  function readFragment(f: Xml, group?: G) {
    const atoms: number[] = [];
    for (const k of f.kids) if (k.name === "n") { const i = readNode(k); if (i !== undefined) { atoms.push(i); for (let g = group; g; g = g.parent) g.atoms.add(i); } }
    if (yes(f.attrs.ShowAtomStereo)) for (const i of atoms) mol.atoms[i].cip = true;
    for (const k of f.kids) {
      if (k.name === "b") bondsToRead.push(k);
      else if (k.name !== "n") visit(k, group, atoms);
    }
  }

  function readNode(n: Xml): number | undefined {
    const q = reals(n.attrs.p, 2);
    if (!q) { lose("atom"); return undefined; }
    const [x, y] = toOctet(q[0], q[1]), depth = reals(n.attrs.xyz, 3)?.[2] ?? 0, type = n.attrs.NodeType ?? "Element";
    const element = int(n.attrs.Element) ?? 6, isotope = int(n.attrs.Isotope);
    const a: Atom = { label: type === "Element" ? (element === 1 && isotope === 2 ? "D" : element >= 1 && element <= 118 ? SYMBOLS[element - 1] : "C") : "C", location: [x, y, depth / B] };
    const charge = int(n.attrs.Charge) ?? 0;
    if (charge && Math.abs(charge) <= 9) a.charge = charge; else if (charge) lose("charge");
    const radical = RADICALS.indexOf(n.attrs.Radical ?? "");
    if (radical > 0) a.radical = radical === 1 ? 3 : radical === 2 ? 1 : 2;
    if (type === "Element" && isotope && !(element === 1 && isotope === 2) && isotope >= 1 && isotope <= 300) a.isotope = isotope;
    if (type === "ExternalConnectionPoint") { if (n.attrs.ExternalConnectionType === "PolymerBead") a.bead = true; else a.attach = true; }
    if (["MultiAttachment", "VariableAttachment", "LinkNode", "AnonymousAlternativeGroup", "Monomer"].includes(type)) lose(type);
    const colour = colourOf(n.attrs.color), halo = colourOf(n.attrs.highlightColor);
    if (colour) a.colour = colour;
    if (halo) a.halo = halo;
    if (yes(n.attrs.ShowAtomStereo)) a.cip = true;
    const group = int(n.attrs.EnhancedStereoGroupNum), g = group && group >= 1 && group <= 99 ? group : 1;
    const enhanced = { Absolute: "abs", And: `&${g}`, Or: `or${g}` }[n.attrs.EnhancedStereoType ?? ""];
    if (enhanced) a.enhanced = enhanced;
    const p = priv(n);
    if (p?.hmark === "dot" || p?.hmark === "dash") a.hmark = p.hmark;
    if (p?.partial === "+" || p?.partial === "-") a.partial = p.partial;
    if (p?.depth === false) a.depth = false;
    if (Number.isInteger(p?.map) && isNum(p!.map, 1, 9999)) a.map = p!.map as number;
    if (p?.circle === true) a.circle = true;
    const number = yes(n.attrs.ShowAtomNumber) ? (n.attrs.AtomNumber ?? "").trim() : "";
    if (number) { if (/^[\w'′*-]{1,8}$/.test(number)) a.number = number; else lose("atom number"); }
    if (yes(n.attrs.IgnoreWarnings)) a.ignoreWarnings = true;
    const i = mol.atoms.push(a) - 1;
    nodeIds.push(int(n.attrs.id) ?? 0);
    numH.set(i, int(n.attrs.NumHydrogens) ?? 0);
    atomOf.set(int(n.attrs.id) ?? -1, i);
    const t = n.kids.find((k) => k.name === "t");
    // The label's own text style, where it differs from the document's: bold, italic, underline, font and size.
    const first = t?.kids.find((k) => k.name === "s");
    if (first) {
      const f = int(first.attrs.face) ?? 0, font = fontOf(fonts.get(int(first.attrs.font) ?? -1)).font, size = real(first.attrs.size);
      if (f & 1) a.bold = true;
      if (f & 2) a.italic = true;
      if (f & 4) a.underline = true;
      if (font && font !== style.labelFont) a.font = font;
      if (size && size >= 4 && size <= 72 && Math.abs(size - style.labelSize) > 0.01) a.size = size;
    }
    if (t) labels.push({ i, text: t.kids.filter((k) => k.name === "s").map((k) => k.text).join(""), type, isotope });
    return i;
  }

  // Bonds join nodes by id, the last node read with an id winning; a bond to a missing node, to its own atom or
  // repeating another is dropped (spec 2).
  function readBonds() {
    const seen = new Set<string>();
    for (const b of bondsToRead) {
      const i = atomOf.get(int(b.attrs.B) ?? -1), j = atomOf.get(int(b.attrs.E) ?? -1);
      const key = i === undefined || j === undefined ? "" : i < j ? `${i} ${j}` : `${j} ${i}`;
      if (!key || i === j || seen.has(key)) { lose("bond"); continue; }
      seen.add(key);
      const order = new Set((b.attrs.Order ?? "1").trim().split(/\s+/)), d = b.attrs.Display ?? "", d2 = b.attrs.Display2 ?? "";
      // Order 1.5: with a dashed line, ChemDraw's DoubleDashed bond; otherwise a delocalised bond, made Kekulé below
      // (Octet's own files say which order each one had).
      // ChemDraw reads order 1.5 with a dashed Display2 as a double bond: Tautomeric, or Aromatic when Display is
      // dashed too. Order 2 with a dashed Display is Aromatic as well.
      const deloc = order.size === 1 && order.has("1.5"), dashed = deloc && !!d2 && d2 !== "Solid";
      const bond: Bond = { type: order.has("3") ? 3 : order.has("2") || dashed ? 2 : 1, atoms: [i!, j!] };
      if (dashed) bond.display = d === "Dash" ? "aromatic" : "dashed";
      else if (deloc) { const kept = priv(b)?.order; delocalised.push({ k: mol.bonds.length, order: kept === 1 || kept === 2 ? kept : undefined }); }
      if (bond.type === 1 && order.size === 1 && order.has("dative")) bond.display = "dative";
      else if (bond.type === 1 && order.has("hydrogen")) bond.display = "dashed";
      else if (!deloc && [...order].some((o) => !["1", "2", "3"].includes(o))) lose("bond order");
      let swap = false;
      if (bond.type === 1 && !bond.display) {
        const single: Record<string, [Display | undefined, number | undefined, boolean]> = {
          WedgeBegin: [undefined, 1, false], WedgeEnd: [undefined, 1, true], WedgedHashBegin: [undefined, 6, false], WedgedHashEnd: [undefined, 6, true], Bold: ["bold", undefined, false],
          Dash: ["dashed", undefined, false], Dot: ["dashed", undefined, false], DashDot: ["dashed", undefined, false], Hash: ["hashed", undefined, false], Wavy: ["wavy", undefined, false],
          WavyWedgeBegin: ["wavy", undefined, false], WavyWedgeEnd: ["wavy", undefined, false], HollowWedgeBegin: ["hollow", undefined, false], HollowWedgeEnd: ["hollow", undefined, true],
        };
        const s = single[d];
        if (s) { if (s[0]) bond.display = s[0]; if (s[1]) bond.stereo = s[1]; swap = s[2]; }
      } else if (bond.type === 2) {
        if (dashed) { /* above */ } else if (d === "Bold") bond.display = "bold"; else if (d === "Wavy") bond.display = "either"; else if (d === "Dash") bond.display = "aromatic"; else if (d2 === "Dash") bond.display = "dashed"; else if (d && d !== "Solid") lose("bond display");
        const side = { Left: "left", Right: "right", Center: "centre" }[b.attrs.DoublePosition ?? ""] as Bond["position"];
        if (side) bond.position = side;
      } else if (d && d !== "Solid") lose("bond display");
      if (swap) bond.atoms = [j!, i!];
      const colour = colourOf(b.attrs.color);
      if (colour) bond.colour = colour;
      if (b.attrs.highlightColor) lose("bond highlight");
      if (yes(b.attrs.IgnoreWarnings)) bond.ignoreWarnings = true;
      mol.bonds.push(bond);
      bondIds.push(int(b.attrs.id) ?? 0);
    }
  }

  // Labels: one element with the hydrogens Octet would draw is a plain atom; anything else is written text (OMe,
  // Delocalised rings: ChemDraw's ring bonds of order 1.5, and any ring with a circle inside it (ChemDraw reads a single
  // bond near a closed circle as aromatic). Octet draws such a ring with its circle, from Kekulé bonds: each atom that
  // can take a double bond gets one where it can, carbons first. A circle Octet takes as a ring's is not kept as a shape.
  function readDelocalised() {
    const ring = new Set<number>(), taken = new Set<number>(), g = { atoms: mol.atoms.map(() => ({ el: "C", charge: 0, h: 0 })), bonds: mol.bonds.map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: 1 as const })) };
    const bondOf = (x: number, y: number) => mol.bonds.findIndex((b) => (b.atoms[0] === x && b.atoms[1] === y) || (b.atoms[0] === y && b.atoms[1] === x));
    const found = ovals.length ? rings(g).filter((r) => r.length >= 5 && r.length <= 8) : [];
    for (const o of ovals) {
      const r = found.find((rr) => {
        const c: P = [rr.reduce((s, i) => s + mol.atoms[i].location[0], 0) / rr.length, rr.reduce((s, i) => s + mol.atoms[i].location[1], 0) / rr.length];
        const R = rr.reduce((s, i) => s + Math.hypot(mol.atoms[i].location[0] - c[0], mol.atoms[i].location[1] - c[1]), 0) / rr.length;
        return Math.hypot(o.c[0] - c[0], o.c[1] - c[1]) < 0.25 * R && o.r > 0.3 * R && o.r < 0.95 * R;
      });
      if (!r) continue;
      taken.add(o.id);
      for (const i of r) mol.atoms[i].circle = true;
      r.forEach((x, k) => { const kk = bondOf(x, r[(k + 1) % r.length]); if (kk >= 0) ring.add(kk); });
    }
    if (taken.size) shapes.splice(0, shapes.length, ...shapes.filter((s) => !taken.has(s.id)));
    const kept = new Map(delocalised.map((x) => [x.k, x.order]));
    for (const [k, o] of kept) if (o) mol.bonds[k].type = o;
    const loose = [...new Set([...kept.keys()].filter((k) => !kept.get(k)).concat([...ring].filter((k) => !kept.has(k))))].filter((k) => mol.bonds[k].type === 1 && !mol.bonds[k].display && !mol.bonds[k].stereo);
    if (!loose.length) return;
    // An atom can take a double bond when its valence has room after its bonds (a delocalised one counts as single),
    // its hydrogens and its charge.
    const VALENCE: Record<string, number> = { C: 4, Si: 4, N: 3, P: 3, B: 3, O: 2, S: 2, Se: 2 };
    const room = (i: number) => {
      const a = mol.atoms[i], v = VALENCE[a.label], q = a.charge ?? 0;
      if (v === undefined || a.text) return 0;
      const bonds = mol.bonds.reduce((n, b) => n + (b.atoms.includes(i) ? (BOND_ORDER[b.type] ?? 1) : 0), 0);
      return (a.label === "C" || a.label === "B" || a.label === "Si" ? v - Math.abs(q) : v + q) - bonds - (numH.get(i) ?? 0);
    };
    const atoms = [...new Set(loose.flatMap((k) => mol.bonds[k].atoms))].filter((i) => room(i) >= 1);
    atoms.sort((p, q) => Number(mol.atoms[p].label !== "C" || !!mol.atoms[p].charge) - Number(mol.atoms[q].label !== "C" || !!mol.atoms[q].charge) || p - q);
    kekulise(loose.map((k) => mol.bonds[k].atoms), atoms).forEach((on, n) => { if (on) mol.bonds[loose[n]].type = 2; });
  }

  // Ph, CO2Et), less any charge the node already holds (spec 9.10).
  function readLabels() {
    const used = mol.atoms.map(() => 0), degree = mol.atoms.map(() => 0);
    for (const b of mol.bonds) for (const i of b.atoms) { used[i] += BOND_ORDER[b.type] ?? 1; degree[i]++; }
    for (const { i, text: raw, type, isotope } of labels) {
      const a = mol.atoms[i], charge = a.charge ?? 0;
      let text = cleanText(raw).replace(/\n/g, "").trim();
      const sign = /(\d*)([+\-−–])$/.exec(text);
      if (charge && sign && (sign[2] === "+") === charge > 0) text = text.slice(0, text.length - (sign[1] === String(Math.abs(charge)) ? sign[0].length : 1));
      if (!text || text === "\ufffc" || a.attach || a.bead) continue;
      if (type === "Element" && (!isotope || a.label === "D" || a.isotope)) {
        if (a.isotope && text.startsWith(String(a.isotope))) text = text.slice(String(a.isotope).length);
        const m = new RegExp(`^(?:H(\\d*))?${a.label}(?:H(\\d*))?$`).exec(text);
        const h = m ? (m[1] === undefined ? 0 : Number(m[1] || 1)) + (m[2] === undefined ? 0 : Number(m[2] || 1)) : -1;
        if (m && (a.label !== "C" || !degree[i] || a.isotope || (degree[i] === 1 ? style.terminalLabels : style.carbonLabels)) && h === hydrogens(a.label, charge, used[i], a.radical === 3 ? 2 : a.radical)) continue;
      } else if (isotope) lose("isotope");
      if (text.length > MAX_LABEL || /[<>]/.test(text)) { lose("label text"); text = text.replace(/[<>]/g, "").slice(0, MAX_LABEL); }
      if (isElement(text)) a.label = text;
      else { a.text = text; a.label = anchorElement(text) ?? "C"; }
    }
  }

  // A caption: its style runs, its own style (in Octet's files, the text's caption style; in ChemDraw's, what every
  // run shares), its alignment, and formula-face runs turned into subscripts the way ChemDraw draws them (spec 8.3).
  function readCaption(t: Xml, group?: G) {
    const q = reals(t.attrs.p, 2);
    if (!q) return lose("text");
    if (int(t.attrs.RotationAngle)) lose("text rotation");
    const p = priv(t), docFont = style.captionFont, docSize = style.captionSize, runs: (RunStyle & { text: string; font: string; size: number })[] = [];
    let room = MAX_TEXT;
    for (const s of t.kids) {
      if (s.name !== "s" || room <= 0) continue;
      const text = cleanText(s.text).slice(0, room), named = fontOf(fonts.get(int(s.attrs.font) ?? -1)), f = int(s.attrs.face) ?? 0, size = real(s.attrs.size), colour = colourOf(s.attrs.color ?? "3");
      if (s.attrs.font && fonts.has(int(s.attrs.font) ?? -1) && !named.font) lose("font");
      room -= text.length;
      const base = { ...(named.bold || f & 1 ? { bold: true as const } : {}), ...(named.italic || f & 2 ? { italic: true as const } : {}), ...(f & 4 ? { underline: true as const } : {}),
        font: named.font ?? docFont, size: size ? Math.min(144, Math.max(4, size)) : docSize, ...(colour ? { colour } : {}) };
      if ((f & 0x60) === 0x60) for (const r of formulaRuns(text)) runs.push({ ...base, ...(r.sub ? { script: "sub" as const } : {}), text: r.text });
      else runs.push({ ...base, ...((f & 0x60) === 0x20 ? { script: "sub" as const } : (f & 0x60) === 0x40 ? { script: "super" as const } : {}), text });
    }
    const text = runs.map((r) => r.text).join("");
    if (!text.replace(/[\s\ufffc]/g, "")) return lose("empty text");
    const shared = <K extends keyof RunStyle>(k: K) => (runs.every((r) => r[k] === runs[0][k]) ? runs[0][k] : undefined);
    const cf = int(t.attrs.CaptionFace) ?? 0, cs = real(t.attrs.CaptionSize);
    const whole: RunStyle = octet
      ? { bold: cf & 1 ? true : undefined, italic: cf & 2 ? true : undefined, underline: cf & 4 ? true : undefined, font: fontOf(fonts.get(int(t.attrs.CaptionFont) ?? -1)).font, size: cs ? Math.min(144, Math.max(4, cs)) : undefined, colour: colourOf(t.attrs.color) }
      : { bold: shared("bold"), italic: shared("italic"), underline: shared("underline"), font: shared("font") === docFont ? undefined : shared("font"), size: shared("size") === docSize ? undefined : shared("size"), colour: shared("colour") };
    const own = runs.map((r): TextRun => ({
      text: r.text, ...(r.bold && !whole.bold ? { bold: true } : {}), ...(r.italic && !whole.italic ? { italic: true } : {}), ...(r.underline && !whole.underline ? { underline: true } : {}), ...(r.script ? { script: r.script } : {}),
      ...(r.font !== (whole.font ?? docFont) ? { font: r.font } : {}), ...(r.size !== (whole.size ?? docSize) ? { size: r.size } : {}), ...(r.colour !== whole.colour ? { colour: r.colour ?? "#000000" } : {}),
    }));
    const just = t.attrs.Justification ?? t.attrs.CaptionJustification, xy = p?.xy;
    const [x, y] = Array.isArray(xy) && xy.length === 2 && xy.every((v) => isNum(v, -1e6, 1e6)) ? (xy as P) : toOctet(q[0], q[1]);
    const c: Caption & { z: number } = { id: newId(t), text, x, y, z: zOf(t) };
    for (const k of ["bold", "italic", "underline", "size", "colour", "font"] as const) if (whole[k] !== undefined) (c as Record<string, unknown>)[k] = whole[k];
    if (just === "Right") c.align = "right"; else if (just === "Full") c.align = "justify"; else if (just !== "Center") c.align = "left";
    // A width, in pt (spec WordWrapWidth): the caption wraps to it.
    const wrapAt = real(t.attrs.WordWrapWidth);
    if (wrapAt !== undefined && wrapAt >= B / 2 && wrapAt <= 1000 * B) c.width = isNum(p?.width, 0.5, 1000) ? (p!.width as number) : wrapAt / B;
    // Line spacing: auto (Octet's default), variable, or fixed in pt.
    const lh = t.attrs.LineHeight ?? t.attrs.CaptionLineHeight, fixed = real(lh);
    if (lh === "variable") c.lineHeight = "variable"; else if (fixed !== undefined && fixed >= 1 && fixed <= 400) c.lineHeight = fixed;
    const normal = normalise(own);
    if (styled(normal)) c.runs = normal;
    if (p?.under) unders.push({ c, nodes: p.under });
    const cyc = p?.cycle as Record<string, unknown> | undefined;
    if (cyc && Number.isInteger(cyc.cycle) && Number.isInteger(cyc.step) && isNum(cyc.step, 0, 63) && ["in", "out", "centre"].includes(cyc.side as string)) c.cycle = { cycle: cyc.cycle as number, step: cyc.step as number, side: cyc.side as "in" };
    captions.push(c);
    objectOf.set(int(t.attrs.id) ?? -1, c.id);
    member(group, c.id);
  }

  // Graphics: legacy arrows (unless their arrow is read), rectangles and ovals, orbitals, brackets and symbols.
  function readGraphic(x: Xml, group?: G, atoms?: number[]) {
    const type = x.attrs.GraphicType, box = reals(x.attrs.BoundingBox, 4), p = priv(x), z = zOf(x), cid = int(x.attrs.id) ?? -1;
    if (type === "Symbol") return void symbols.push({ x, atoms: atoms ?? [], group });
    if (!box) return lose("graphic");
    const [p1, p2] = [toOctet(box[0], box[1]), toOctet(box[2], box[3])], colour = colourOf(x.attrs.color);
    if (type === "Line" || type === "Arc") {
      const sup = int(x.attrs.SupersededBy);
      if (sup !== undefined && usable.has(sup)) return void arrowOfGraphic.set(cid, sup);
      // A legacy graphic on its own (spec 11.2): its old arrow type as heads.
      const t = x.attrs.ArrowType ?? "NoHead", half = (int(x.attrs.HeadSize) ?? 0) < 0 ? "HalfRight" : "HalfLeft";
      const stored: Stored = { arc: type === "Arc", head: ({ HalfHead: half, FullHead: "Full", Resonance: "Full", Equilibrium: "HalfLeft", Hollow: "Full", RetroSynthetic: "Full" } as Record<string, string>)[t],
        tail: ({ Resonance: "Full", Equilibrium: "HalfLeft" } as Record<string, string>)[t], type: t === "Hollow" ? "Hollow" : t === "RetroSynthetic" ? "Angle" : "Solid", spacing: t === "Equilibrium" || t === "RetroSynthetic", nogo: false };
      if (type === "Line") return addArrow(x, group, stored, p2, p1, undefined, z);
      // An arc: the head, then the circle's centre; the tail is the head turned back by the sweep (spec 11.3).
      const ang = ((real(x.attrs.AngularSize) || 90) * Math.PI) / 180, th = Math.atan2(box[1] - box[3], box[0] - box[2]), rr = Math.hypot(box[0] - box[2], box[1] - box[3]);
      const round = (t: number) => toOctet(box[2] + rr * Math.cos(t), box[3] + rr * Math.sin(t));
      return addArrow(x, group, stored, round(th + ang), p1, round(th + ang / 2), z);
    }
    if (type === "Rectangle" || type === "Oval") {
      const [C, U, V] = [x.attrs.Center3D, x.attrs.MajorAxisEnd3D, x.attrs.MinorAxisEnd3D].map((s) => reals(s, 2) as P | undefined);
      const bits = new Set(((type === "Rectangle" ? x.attrs.RectangleType : x.attrs.OvalType) ?? "").split(/\s+/));
      let b: Box, angle = 0;
      if (C && U && V) {
        // The sides run along the axes; a turned shape takes its angle from the major axis (y runs down the page).
        const u = sub(U, C), v = sub(V, C), hx = len(u), hy = len(v);
        angle = exact(p?.angle, Math.round((Math.atan2(-u[1], u[0]) * 180000) / Math.PI) / 1000);
        b = [C[0] - hx, C[1] - hy, C[0] + hx, C[1] + hy];
      } else if (type === "Rectangle") b = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
      else {
        // Only the end of one axis and the centre: the other axis as ChemDraw's own export guesses it (spec 9.7).
        const a = Math.hypot(box[0] - box[2], box[1] - box[3]), other = bits.has("Circle") ? a : 0.4 * a, wide = Math.abs(box[0] - box[2]) >= Math.abs(box[1] - box[3]);
        b = [box[2] - (wide ? a : other), box[3] - (wide ? other : a), box[2] + (wide ? a : other), box[3] + (wide ? other : a)];
      }
      const kind: ShapeKind = type === "Oval" ? "oval" : p?.kind === "highlight" ? "highlight" : bits.has("RoundEdge") ? "rounded" : "box";
      const sh = settled({ id: newId(x), kind, from: toOctet(b[0], b[3]), to: toOctet(b[2], b[1]), angle, z });
      const w = lineWidthOf(x);
      if (w) sh.width = w;
      if (kind !== "highlight" && bits.has("Filled")) sh.fill = "solid"; else if (kind !== "highlight" && bits.has("Shaded")) sh.fill = "shaded";
      if (bits.has("Shadow") || bits.has("Shadowed")) sh.shadow = true;
      if (bits.has("Dashed")) sh.dashed = true;
      if (bits.has("Bold")) lose("bold shape");
      if (colour && !(kind === "highlight" && colour === HIGHLIGHT)) sh.colour = colour;
      const shade = p?.shade as Record<string, unknown> | undefined;
      if (shade && isNum(shade.depth, 0, 1) && isNum(shade.blur, 0, 1) && isNum(shade.opacity, 0, 1)) sh.shade = { depth: shade.depth, blur: shade.blur, opacity: shade.opacity };
      if (type === "Oval" && bits.has("Circle") && !sh.fill) ovals.push({ id: sh.id, c: toOctet((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), r: (b[2] - b[0]) / 2 / B });
      return addShape(sh, x, group);
    }
    if (type === "Orbital") {
      const named = ORBITALS.find(([n]) => n === x.attrs.OrbitalType) ?? ORBITALS[0], o = p?.orbital as Record<string, unknown> | undefined;
      const orbital = o && ORBITAL_SHAPES.includes(o.shape as OrbitalShape) && PHASES.includes(o.phase as Phase) ? { shape: o.shape as OrbitalShape, phase: o.phase as Phase } : { shape: named[1], phase: named[2] };
      const a: Arrow & { z: number } = { id: newId(x), kind: "orbital", from: p2, to: p1, orbital, z, ...(colour ? { colour } : {}), ...(lineWidthOf(x) ? { width: lineWidthOf(x) } : {}) };
      arrows.push(a);
      objectOf.set(cid, a.id);
      return void member(group, a.id);
    }
    if (type === "Bracket") return void brackets.push({ x, id: cid, z, group, ends: box });
    lose(`graphic ${type ?? ""}`.trim());
  }
  function addShape(sh: Shape & { z: number }, x: Xml, group?: G) {
    shapes.push(sh);
    objectOf.set(int(x.attrs.id) ?? -1, sh.id);
    member(group, sh.id);
  }

  // An arrow from what was stored: its kind (Octet's own when it kept one), the arc's middle as a bend, line style,
  // colour, and heads where they differ from the kind's.
  function addArrow(x: Xml, group: G | undefined, s: Stored, from: P, to: P, mid: P | undefined, z: number) {
    const p = priv(x), named = p?.kind as ArrowKind, colour = colourOf(x.attrs.color);
    const a: Arrow & { z: number } = { id: newId(x), kind: ALL_ARROW_KINDS.includes(named) && named !== "orbital" && named !== "curve" ? named : kindOf(s), from, to, z };
    // Octet's own bend is exact; ChemDraw's arc gives it to within the file's 0.01 pt.
    if (curved(a) && isNum(p?.bend, -5, 5) && p!.bend) a.bend = p!.bend as number;
    else if (curved(a) && mid) {
      const l = len(sub(to, from)) || 1, bend = ((mid[0] - (from[0] + to[0]) / 2) * -(to[1] - from[1]) + (mid[1] - (from[1] + to[1]) / 2) * (to[0] - from[0])) / (l * l);
      if (Math.abs(bend) > 1e-6) a.bend = Math.max(-5, Math.min(5, bend));
    }
    const lines = new Set((x.attrs.LineType ?? "").split(/\s+/));
    const style = p?.style === "doubled" ? "doubled" : lines.has("Dashed") ? "dashed" : lines.has("Bold") ? "bold" : lines.has("Wavy") ? "wavy" : undefined;
    if (style) a.style = style;
    if (colour) a.colour = colour;
    const w = lineWidthOf(x);
    if (w) a.width = w;
    if (takesHeads(a)) {
      const kind = headsOf(a), start = headOf(s.tail), end = headOf(s.head);
      if (start !== kind.start) a.start = start;
      if (end !== kind.end) a.end = end;
      if (s.type === "Hollow") a.head = "hollow"; else if (s.type === "Angle") a.head = "angled";
    }
    arrows.push(a);
    objectOf.set(int(x.attrs.id) ?? -1, a.id);
    const g = p?.grid as Record<string, unknown> | undefined, typed = g?.typed as Record<string, Record<string, unknown>> | undefined;
    if (typed && typeof typed === "object" && !Array.isArray(typed) && Object.keys(typed).length <= 40
      && Object.entries(typed).every(([k, v]) => /^[rp]\d{1,2}$/.test(k) && typeof v === "object" && v && !Array.isArray(v) && Object.entries(v).every(([f, n]) => GRID_FIELDS.includes(f) && isNum(n, 0, 1e9)))
      && (g!.limiting === undefined || (typeof g!.limiting === "string" && /^r\d{1,2}$/.test(g!.limiting)))) grids.push({ arrow: a.id, typed: typed as Grid["typed"], ...(g!.limiting ? { limiting: g!.limiting as string } : {}) });
    member(group, a.id);
  }
  const headName = (v?: string) => (v === "Full" || v === "HalfLeft" || v === "HalfRight" ? v : undefined);

  // An arrow: straight from Tail3D to Head3D, or an arc of the ellipse in its frame (spec 10.2). The middle of the
  // sweep becomes Octet's bend; endpoints off the ellipse scale it, as the spec's reading rule says.
  function readArrow(x: Xml, group?: G) {
    const id = int(x.attrs.id) ?? -1, head = reals(x.attrs.Head3D, 2), tail = reals(x.attrs.Tail3D, 2);
    if (!usable.has(id) && superseded.has(id)) return;
    if (!head || !tail) return lose("arrow");
    const angular = real(x.attrs.AngularSize) ?? 0, [C, U, V] = [x.attrs.Center3D, x.attrs.MajorAxisEnd3D, x.attrs.MinorAxisEnd3D].map((s) => reals(s, 2) as P | undefined);
    let mid: P | undefined;
    if (angular && C && U && V) {
      const A = sub(U, C), Bv = sub(V, C), det = cross(A, Bv), d = sub(tail as P, C);
      if (Math.abs(det) > 1e-9) {
        const cs = cross(d, Bv) / det, sn = cross(A, d) / det, k = Math.hypot(cs, sn), t = Math.atan2(sn, cs) + ((det > 0 ? -1 : 1) * angular * Math.PI) / 360;
        mid = toOctet(C[0] + k * (Math.cos(t) * A[0] + Math.sin(t) * Bv[0]), C[1] + k * (Math.cos(t) * A[1] + Math.sin(t) * Bv[1]));
      }
    }
    const spacing = (int(x.attrs.ArrowShaftSpacing) ?? 0) > 0;
    addArrow(x, group, { arc: !!mid, head: headName(x.attrs.ArrowheadHead), tail: headName(x.attrs.ArrowheadTail), type: x.attrs.ArrowheadType, spacing, nogo: x.attrs.NoGo === "Cross" || x.attrs.NoGo === "Hash" },
      toOctet(tail[0], tail[1]), toOctet(head[0], head[1]), mid, zOf(x));
  }

  // A pen curve: points in threes per anchor (in-handle, anchor, out-handle), CurveType bits and the newer
  // Closed, FillType and arrowhead fields together (spec 12).
  function readCurve(x: Xml, group?: G) {
    const raw = (x.attrs.CurvePoints ?? "").trim().split(/\s+/).map(real);
    if (raw.length < 6 || raw.length % 6 || raw.length > 6000 || raw.some((v) => v === undefined)) return lose("curve");
    const v = raw as number[], q = (k: number) => toOctet(v[2 * k], v[2 * k + 1]), same = (j: number, k: number) => v[2 * j] === v[2 * k] && v[2 * j + 1] === v[2 * k + 1];
    const points: CurvePoint[] = Array.from({ length: v.length / 6 }, (_, k) => ({ at: q(3 * k + 1), ...(same(3 * k, 3 * k + 1) ? {} : { c1: q(3 * k) }), ...(same(3 * k + 2, 3 * k + 1) ? {} : { c2: q(3 * k + 2) }) }));
    const bits = int(x.attrs.CurveType) ?? 0, p = priv(x), closed = !!(bits & 1) || yes(x.attrs.Closed), colour = colourOf(x.attrs.color);
    const a: Arrow & { z: number } = { id: newId(x), kind: "curve", from: points[0].at, to: points[points.length - 1].at, curve: { points, ...(closed ? { closed: true } : {}) }, z: zOf(x) };
    const fill: CurveFill | undefined = p?.fill === "faded" ? "faded" : bits & 128 || x.attrs.FillType === "Solid" ? "solid" : bits & 256 || x.attrs.FillType === "Shaded" ? "shaded" : undefined;
    if (fill) a.fill = fill;
    const style: LineStyle | undefined = p?.style === "wavy" ? "wavy" : bits & 512 ? "doubled" : bits & 2 ? "dashed" : bits & 4 ? "bold" : undefined;
    if (style) a.style = style;
    const end = headName(x.attrs.ArrowheadHead) ?? (bits & 8 ? "Full" : bits & 32 ? "HalfLeft" : undefined), start = headName(x.attrs.ArrowheadTail) ?? (bits & 16 ? "Full" : bits & 64 ? "HalfLeft" : undefined);
    if (end) a.end = headOf(end);
    if (start) a.start = headOf(start);
    if ((end || start) && x.attrs.ArrowheadType === "Hollow") a.head = "hollow"; else if ((end || start) && x.attrs.ArrowheadType === "Angle") a.head = "angled";
    if (colour) a.colour = colour;
    const w = lineWidthOf(x);
    if (w) a.width = w;
    arrows.push(a);
    objectOf.set(int(x.attrs.id) ?? -1, a.id);
    member(group, a.id);
  }

  // A TLC plate (spec 21.1): its corners, lanes and spots. Spot sizes are 1/65536 pt; ones at Octet's own default
  // size are left unset again.
  function readTlc(x: Xml, group?: G) {
    const corners = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((k) => reals(x.attrs[k], 2)).filter((c): c is number[] => !!c);
    const box = corners.length === 4 ? boxOf(corners as P[]) : reals(x.attrs.BoundingBox, 4);
    if (!box) return lose("TLC plate");
    const lanes = x.kids.filter((k) => k.name === "tlclane").slice(0, 40), spots: Spot[] = [];
    lanes.forEach((l, lane) => l.kids.forEach((s) => {
      if (s.name !== "tlcspot") return;
      if (spots.length >= 400) return lose("TLC spot");
      const spot: Spot = { lane, rf: Math.min(1, Math.max(0, real(s.attrs.Rf) ?? 0)) }, size = (k: string, d: number) => Math.min(5, Math.max(0, (int(s.attrs[k]) ?? 0) / 65536 / d / B));
      const [w, h, tail] = [size("Width", 2), size("Height", 2), size("Tail", 1)], colour = colourOf(s.attrs.color);
      if (w) spot.w = w;
      if (h) spot.h = h;
      if (tail) spot.tail = tail;
      if (colour) spot.colour = colour;
      if ((int(s.attrs.CurveType) ?? 0) & 256) spot.style = "shaded";
      if (yes(s.attrs.ShowRf)) spot.showRf = true;
      spots.push(spot);
    }));
    const tlc: Tlc = { lanes: Math.max(1, lanes.length), spots }, p = priv(x);
    const origin = real(x.attrs.OriginFraction), front = real(x.attrs.SolventFrontFraction);
    if (origin !== undefined && origin >= 0 && Math.abs(origin - TLC_ORIGIN) > 1e-9) tlc.origin = Math.min(0.9, origin);
    if (front !== undefined && front >= 0 && Math.abs(front - TLC_FRONT) > 1e-9) tlc.front = Math.min(0.9, front);
    const hide = (["origin", "front", "border"] as const).filter((_, j) => !yes(x.attrs[["ShowOrigin", "ShowSolventFront", "ShowBorders"][j]]));
    if (hide.length) tlc.hide = [...hide];
    // Octet's own: spot order, hollow spots, and Rf shown for all.
    const list = (v: unknown) => (typeof v === "string" ? v.split(" ").map(Number).filter((k) => Number.isInteger(k) && k >= 0 && k < spots.length) : []);
    const order = list(p?.order);
    if (order.length === spots.length && new Set(order).size === spots.length) { const was = [...spots]; order.forEach((k, j) => { spots[k] = was[j]; }); }
    for (const k of list(p?.hollow)) spots[k].style = "hollow";
    if (p?.rf === true) { tlc.rf = true; const own = new Set(list(p.own)); spots.forEach((s, k) => { if (own.has(k)) s.showRf = true; else delete s.showRf; }); }
    const sh: Shape & { z: number } = { id: newId(x), kind: "tlc", from: toOctet(box[0], box[3]), to: toOctet(box[2], box[1]), tlc, z: zOf(x) }, colour = colourOf(x.attrs.color), w = lineWidthOf(x);
    if (colour) sh.colour = colour;
    if (w) sh.width = w;
    Object.assign(sh, textStyleOf(x.attrs.LabelFont === undefined ? undefined : fontOf(fonts.get(int(x.attrs.LabelFont) ?? -1)).font, real(x.attrs.LabelSize), int(x.attrs.LabelFace)));
    const t = tlcLayout(sh);
    for (const s of spots) {
      const d = t.size({ lane: s.lane, rf: s.rf });
      if (s.w !== undefined && Math.abs(s.w - d.rx) < 1e-3) delete s.w;
      if (s.h !== undefined && Math.abs(s.h - d.ry) < 1e-3) delete s.h;
    }
    addShape(sh, x, group);
  }

  // A table Octet wrote: the table from Octet's data, its box from the group's.
  function readTableGroup(x: Xml, p: Record<string, unknown>, group?: G) {
    const table = readTable(p.table), box = reals(x.attrs.BoundingBox, 4), colour = colourOf(x.attrs.color);
    if (!table || !box) return lose("table");
    const sh: Shape & { z: number } = { id: newId(x), kind: "table", from: toOctet(box[0], box[3]), to: toOctet(box[2], box[1]), table, z: zOf(x), ...textStyleOf(typeof p.font === "string" ? p.font : undefined, p.size, p.face) };
    if (p.dashed === true) sh.dashed = true;
    if (colour) sh.colour = colour;
    addShape(sh, x, group);
  }

  // Brackets: Octet's pairs from its data; ChemDraw's by facing pairs of the same type that overlap (spec 9.9). A
  // bracket's lips are on the right of the way it runs, so one that runs up the page is a left bracket, and one that
  // runs any other way is a left bracket turned (a right bracket is one turned a half).
  function readBrackets() {
    const done = new Set<number>(), ends = (b: (typeof brackets)[number]): [P, P] => [toOctet(b.ends[0], b.ends[1]), toOctet(b.ends[2], b.ends[3])];
    const way = (b: (typeof brackets)[number]): P => { const [A, Z] = ends(b), d = sub(Z, A), l = len(d) || 1; return [d[0] / l, d[1] / l]; };
    const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1], mid = (b: (typeof brackets)[number]): P => { const [A, Z] = ends(b); return [(A[0] + Z[0]) / 2, (A[1] + Z[1]) / 2]; };
    // o faces b: it runs the other way, on b's lips side, and the two overlap along b by half the shorter.
    const faces = (b: (typeof brackets)[number], o: (typeof brackets)[number]) => {
      const t = way(b), n: P = [t[1], -t[0]], along = (q: P) => dot(q, t), [A, Z] = ends(b), [C, D] = ends(o);
      const lo = Math.max(Math.min(along(A), along(Z)), Math.min(along(C), along(D))), hi = Math.min(Math.max(along(A), along(Z)), Math.max(along(C), along(D)));
      return dot(way(o), t) < -0.99 && dot(sub(mid(o), mid(b)), n) > 0 && hi - lo > 0.5 * Math.min(len(sub(Z, A)), len(sub(D, C)));
    };
    brackets.forEach((b, k) => {
      if (done.has(k) || (octet && priv(b.x)?.pair !== undefined)) return;
      done.add(k);
      const type = b.x.attrs.BracketType ?? "RoundPair", kind = BRACKETS[type] ?? "parens", pair = type.endsWith("Pair"), p = priv(b.x);
      const j = pair ? -1 : brackets.findIndex((o, n) => !done.has(n) && (octet ? priv(o.x)?.pair === b.id : BRACKETS[o.x.attrs.BracketType ?? ""] === kind && (faces(b, o) || faces(o, b))));
      if (j >= 0) done.add(j);
      // The angle from the way the first bracket runs (a pair is the same turned a half); the shape's box is its
      // brackets' ends turned upright about their middle.
      const o = brackets[j], t = way(b), angle = exact(p?.angle, Math.round((Math.atan2(t[1], t[0]) * 180000) / Math.PI) / 1000 - 90);
      const points = [...ends(b), ...(o ? ends(o) : [])], c: P = [points.reduce((v, q) => v + q[0], 0) / points.length, points.reduce((v, q) => v + q[1], 0) / points.length];
      const upright = points.map((q) => turnPoint(q, c, -angle)), xs = upright.map((q) => q[0]), ys = upright.map((q) => q[1]);
      const sh: Shape & { z: number } = { id: newId(b.x), kind, from: [Math.min(...xs), Math.max(...ys)], to: [Math.max(...xs), Math.min(...ys)], angle, z: b.z };
      if (!pair && !o) {
        // One bracket alone: its box reaches its width to the right of it (Octet's width, or a bond length).
        sh.side = "left";
        const span = p?.span, w = Array.isArray(span) && span.length === 2 && span.every((v) => isNum(v, -1e6, 1e6)) ? Math.abs((span[1] as number) - (span[0] as number)) : 1;
        sh.to[0] = sh.from[0] + Math.max(0.05, w);
        // The box was turned upright about the bracket's middle: it goes back about its own.
        const m: P = [(sh.from[0] + sh.to[0]) / 2, (sh.from[1] + sh.to[1]) / 2], d = sub(turnPoint(m, c, angle), m);
        sh.from = [sh.from[0] + d[0], sh.from[1] + d[1]];
        sh.to = [sh.to[0] + d[0], sh.to[1] + d[1]];
      }
      if (typeof p?.mark === "string" && p.mark.length <= 8) sh.mark = p.mark;
      const colour = colourOf(b.x.attrs.color), width = lineWidthOf(b.x);
      if (colour) sh.colour = colour;
      if (width) sh.width = width;
      if (b.x.attrs.LineType?.includes("Dashed")) sh.dashed = true;
      // Display Warnings off when every bracket of the pair has it off.
      if ([b, o].every((x) => !x || yes(x.x.attrs.IgnoreWarnings))) sh.ignoreWarnings = true;
      addShape(settled(sh), b.x, b.group);
    });
  }

  // Symbols: a charge or radical they represent belongs to that node; lone pairs and stray electrons to the
  // nearest atom (in their own fragment first); other signs become text.
  function readSymbols() {
    const nearest = (c: P, among: number[]) => among.reduce<number | undefined>((best, i) => {
      const d = len(sub(mol.atoms[i].location as unknown as P, c));
      return d < 1 && (best === undefined || d < len(sub(mol.atoms[best].location as unknown as P, c))) ? i : best;
    }, undefined);
    const everyAtom = mol.atoms.map((_, i) => i);
    for (const { x, atoms, group } of symbols) {
      const type = x.attrs.SymbolType ?? "LonePair", box = reals(x.attrs.BoundingBox, 2);
      if (!box) { lose("symbol"); continue; }
      const c = toOctet(box[0], box[1]), linked = x.kids.filter((k) => k.name === "represent").map((k) => atomOf.get(int(k.attrs.object) ?? -1)).find((i) => i !== undefined);
      const sign = ({ Plus: 1, CirclePlus: 1, RadicalCation: 1, Minus: -1, CircleMinus: -1, RadicalAnion: -1 } as Record<string, number>)[type], unpaired = type === "Electron" || type.startsWith("Radical");
      if (linked !== undefined && (sign || unpaired)) {
        const a = mol.atoms[linked];
        if (sign && !a.charge) a.charge = sign;
        if (type.startsWith("Circle")) a.circled = true;
        if (unpaired && !a.radical) a.radical = 1;
        continue;
      }
      if (linked !== undefined && type === "LonePair" && mol.atoms[linked].radical === 3 && x.kids.some((k) => k.name === "represent" && k.attrs.attribute === "Radical")) continue;
      if (type === "LonePair" || type === "LonePairBar" || type === "Electron") {
        const i = nearest(c, atoms) ?? nearest(c, everyAtom);
        if (i === undefined) { lose("symbol"); continue; }
        const a = mol.atoms[i];
        if (type === "Electron") a.radical = Math.min(2, (a.radical ?? 0) + 1); else a.pairs = Math.min(4, (a.pairs ?? 0) + 1);
        continue;
      }
      const text = SYMBOL_TEXT[type];
      if (!text) { lose("symbol"); continue; }
      const id = newId(x);
      captions.push({ id, text, x: c[0], y: c[1] - (0.35 * style.captionSize) / B, z: zOf(x) });
      member(group, id);
    }
  }

  // Steps: conditions above and below an arrow become that arrow's conditions (straight arrows, or any in Octet's
  // own files), and atom-map pairs give both atoms one map number (spec 14).
  function readSteps() {
    let maps = mol.atoms.reduce((m, a) => Math.max(m, a.map ?? 0), 0);
    for (const s of steps) {
      const id = idList(s.attrs.ReactionStepArrows).map((g) => objectOf.get(arrowOfGraphic.get(g) ?? g)).find((v) => v !== undefined), arrow = arrows.find((a) => a.id === id);
      if (arrow && (octet || straightArrow(arrow))) for (const side of ["above", "below"] as const) {
        for (const cid of idList(s.attrs[side === "above" ? "ReactionStepObjectsAboveArrow" : "ReactionStepObjectsBelowArrow"])) {
          const c = captions.find((x) => x.id === objectOf.get(cid));
          if (c && !c.cycle && !c.on && !unders.some((u) => u.c === c)) c.on = { arrow: arrow.id, side };
        }
      }
      for (const key of ["ReactionStepAtomMap", "ReactionStepAtomMapManual", "ReactionStepAtomMapAuto"]) {
        const list = idList(s.attrs[key]);
        for (let k = 0; k + 1 < list.length; k += 2) {
          const i = atomOf.get(list[k]), j = atomOf.get(list[k + 1]);
          if (i === undefined || j === undefined) continue;
          const n = mol.atoms[i].map ?? mol.atoms[j].map ?? (maps < 9999 ? ++maps : undefined);
          if (!n) continue;
          mol.atoms[i].map ??= n;
          mol.atoms[j].map ??= n;
        }
      }
    }
  }

  // Cycles are Octet's own (no CDXML object holds one): their ids are kept first, their atoms found after.
  const cycleData = octet && Array.isArray(top!.cycles) ? (top!.cycles as Record<string, unknown>[]).slice(0, MAX_OBJECTS) : [];
  for (const c of cycleData) if (c && Number.isInteger(c.id) && (c.id as number) > 0 && (c.id as number) < 2 ** 31) taken.add(c.id as number);
  for (const pg of pages) for (const k of pg.kids) visit(k);
  readBonds();
  readLabels();
  readDelocalised();
  readSymbols();
  readBrackets();
  readSteps();
  for (const { c, nodes } of unders) {
    const under = Array.isArray(nodes) ? [...new Set(nodes.map((n) => atomOf.get(Number.isInteger(n) ? (n as number) : -1)).filter((i): i is number => i !== undefined))] : [];
    if (under.length) c.under = under;
  }
  const cycles: Cycle[] = cycleData.flatMap((c) => {
    const centre = c?.centre, nodes = Array.isArray(c?.nodes) ? (c.nodes as unknown[]).slice(0, 64).map((n) => (Array.isArray(n) ? n.map((id) => atomOf.get(Number.isInteger(id) ? id : -1)).filter((i): i is number => i !== undefined) : [])).filter((n) => n.length) : [];
    if (!Array.isArray(centre) || centre.length !== 2 || !centre.every((v) => isNum(v, -1e6, 1e6)) || !isNum(c.radius, 1e-6, 1e6) || nodes.length < 2 || !Number.isInteger(c.id)) return [];
    return [{ id: c.id as number, centre: centre as P, radius: c.radius as number, clockwise: c.clockwise !== false, nodes, ...(isColour(c.colour) ? { colour: c.colour } : {}) }];
  });
  for (const c of captions) if (c.cycle && !cycles.some((y) => y.id === c.cycle!.cycle)) delete c.cycle;
  // Octet's own files: atoms and bonds back in Octet's order (their ids rise in it).
  let ix = (i: number) => i;
  if (octet) {
    const order = mol.atoms.map((_, i) => i).sort((p, q) => nodeIds[p] - nodeIds[q]), place = new Map(order.map((i, k) => [i, k]));
    ix = (i) => place.get(i)!;
    mol.bonds = mol.bonds.map((b, k) => [b, bondIds[k]] as const).sort((p, q) => p[1] - q[1]).map(([b]) => ({ ...b, atoms: [ix(b.atoms[0]), ix(b.atoms[1])] }));
    mol.atoms = order.map((i) => mol.atoms[i]);
    for (const c of captions) if (c.under) c.under = c.under.map(ix);
    for (const c of cycles) c.nodes = c.nodes.map((n) => n.map(ix));
  }
  const byZ = <T extends { z: number }>(list: T[]) => list.map((x, k) => [x, k] as const).sort((p, q) => p[0].z - q[0].z || p[1] - q[1]).map(([x]) => { const out = { ...x } as Partial<T>; delete out.z; return out as Omit<T, "z">; });
  // Captions and arrows in id order (Octet draws them by kind); shapes in drawing order, which Octet keeps.
  if (captions.length) mol.captions = byZ(captions).sort((p, q) => p.id - q.id);
  if (arrows.length) mol.arrows = byZ(arrows).sort((p, q) => p.id - q.id);
  if (shapes.length) mol.shapes = byZ(shapes);
  if (cycles.length) mol.cycles = cycles;
  if (grids.length) mol.grids = grids;
  const ids = new Set([...captions, ...arrows, ...shapes, ...cycles].map((x) => x.id));
  const kept = groups.map((g): Group => ({ id: g.id, atoms: [...g.atoms].map(ix).sort((p, q) => p - q), items: [...new Set(g.items.filter((id) => ids.has(id)))].sort((p, q) => p - q), ...(g.integral ? { integral: true } : {}) }));
  if (kept.length) mol.groups = kept;
  return { mol: tidyGroups(mol), style, lost };
}
