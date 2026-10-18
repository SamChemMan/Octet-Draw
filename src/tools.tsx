// The tool palette: one tool per kind of object, each with variants in a strip that opens beside it.
// Click an active tool again (or press and hold any tool) to open its strip; press, slide and release also works.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowClockwise, ArrowCounterClockwise, CaretLeft, CaretRight, Cube, Eraser, Lasso, Plus, PushPin, Selection, TextT, Trash, X } from "@phosphor-icons/react";
import { chairPoints, type BondSpec, type SymbolKind } from "./edit";
import { ARROW_KINDS, curved, SWEEPS, type ArrowKind, type Mol, type ShapeKind } from "./render";
import { templateKind, type Template } from "./templates";
import { libraryItem } from "./library";
import { LibraryPanel } from "./TemplateLibrary";
import { columnsFor, DEFAULT_COLUMNS, Menu, menuWidth, type MenuItem } from "./Menu";
import { Exit, reduced, timing } from "./motion";
import { BracketGlyph, BRACKETS, ElementGlyph, ORBITAL_GRID, OrbitalGlyph, orbitalName, SHAPE_EXTRA, SHAPE_GRID, shapeName } from "./elements";

export type Tool = "select" | "bond" | "chain" | "ring" | "template" | "symbol" | "orbital" | "arrow" | "shape" | "bracket" | "tlc" | "table" | "fragment" | "map" | "text" | "erase";

export const BONDS = {
  single: { name: "Single", spec: { type: 1 } },
  double: { name: "Double", spec: { type: 2 } },
  triple: { name: "Triple", spec: { type: 3 } },
  bolddouble: { name: "Bold double", spec: { type: 2, display: "bold" } },
  dasheddouble: { name: "Dashed double", spec: { type: 2, display: "dashed" } },
  aromaticdouble: { name: "Aromatic double", spec: { type: 2, display: "aromatic" } },
  eitherdouble: { name: "Double either", spec: { type: 2, display: "either" } },
  wedge: { name: "Wedge", spec: { type: 1, stereo: 1 } },
  hashwedge: { name: "Hashed wedge", spec: { type: 1, stereo: 6 } },
  hollow: { name: "Hollow wedge", spec: { type: 1, display: "hollow" } },
  bold: { name: "Bold", spec: { type: 1, display: "bold" } },
  hashed: { name: "Hashed", spec: { type: 1, display: "hashed" } },
  dashed: { name: "Dashed", spec: { type: 1, display: "dashed" } },
  wavy: { name: "Wavy", spec: { type: 1, display: "wavy" } },
  dative: { name: "Dative", spec: { type: 1, display: "dative" } },
} satisfies Record<string, { name: string; spec: BondSpec }>;
export type BondKind = keyof typeof BONDS;

export const RINGS = {
  "3": { name: "Cyclopropane", n: 3, aromatic: false },
  "4": { name: "Cyclobutane", n: 4, aromatic: false },
  "5": { name: "Cyclopentane", n: 5, aromatic: false },
  "6": { name: "Cyclohexane", n: 6, aromatic: false },
  "7": { name: "Cycloheptane", n: 7, aromatic: false },
  "8": { name: "Cyclooctane", n: 8, aromatic: false },
  chair1: { name: "Chair", n: 6, aromatic: false, chair: 1 },
  chair2: { name: "Chair (flipped)", n: 6, aromatic: false, chair: 2 },
  cyclopentadiene: { name: "Cyclopentadiene", n: 5, aromatic: true },
  benzene: { name: "Benzene", n: 6, aromatic: true },
} satisfies Record<string, { name: string; n: number; aromatic: boolean; chair?: 1 | 2 }>;
export type RingKind = keyof typeof RINGS;

export const ARROWS: Record<ArrowKind, string> = {
  reaction: "Reaction", equilibrium: "Equilibrium", resonance: "Resonance", retro: "Retrosynthetic",
  nogo: "No reaction", curved: "Curved", fishhook: "Fishhook", double: "Double-headed", line: "Line", arc: "Arc", orbital: "Orbital", cut: "Fragmentation line", curve: "Curve",
};
// Curved arrows come in four sweeps. Their variants are "kind-sweep", for example "fishhook-180"; a bare kind is 120°.
const CURVED: ArrowKind[] = ["curved", "fishhook", "double"];
const STRAIGHT = ARROW_KINDS.filter((k) => !curved({ kind: k }));
export const DEFAULT_CURVED = ["curved-120", "fishhook-120"];
export function arrowVariant(v: string): { kind: ArrowKind; sweep?: number } | undefined {
  const m = /^(curved|fishhook|double)(?:-(90|120|180|270))?$/.exec(v);
  if (m) return { kind: m[1] as ArrowKind, sweep: Number(m[2] ?? 120) };
  return STRAIGHT.includes(v as ArrowKind) ? { kind: v as ArrowKind } : undefined;
}
export const arrowName = (v: string) => { const a = arrowVariant(v); return a && (a.sweep ? `${ARROWS[a.kind]}, ${a.sweep}°` : ARROWS[a.kind]); };

export const SELECTS = { box: { name: "Box" }, lasso: { name: "Lasso" }, perspective: { name: "Structure perspective" } };

export const SHAPES: Record<ShapeKind, string> = {
  box: "Box", rounded: "Rounded box", oval: "Oval", highlight: "Highlight", brackets: "Brackets", parens: "Parentheses", braces: "Braces", tlc: "TLC plate", table: "Table",
};

// Marks the Symbols tool puts on an atom.
export const SYMBOLS: Record<SymbolKind, string> = {
  plus: "Positive charge", minus: "Negative charge", circledPlus: "Circled positive", circledMinus: "Circled negative",
  radical: "Radical", pair: "Lone pair", partialPlus: "Partial positive", partialMinus: "Partial negative",
  radicalCation: "Radical cation", radicalAnion: "Radical anion", hDot: "H dot", hDash: "H dash", attach: "Attachment point", bead: "Polymer bead",
};
export type SelectKind = keyof typeof SELECTS;

// ring is a RingKind, or a template's kind (custom:id).
// template: a library template ("lib:name") or one of the user's own ("custom:id").
export type Variants = { select: SelectKind; bond: BondKind; ring: string; template: string; symbol: SymbolKind; orbital: string; arrow: string; shape: string; bracket: string; more: string };
// Specialist tools share one slot at the bottom of the toolbar, which shows the one last used.
const SPECIAL: Tool[] = ["tlc", "table", "fragment", "map"];
type Strip = "select" | "bond" | "ring" | "template" | "symbol" | "orbital" | "arrow" | "shape" | "bracket" | "more";
const isStrip = (t: Tool): t is Exclude<Strip, "more"> => t === "select" || t === "bond" || t === "ring" || t === "template" || t === "symbol" || t === "orbital" || t === "arrow" || t === "shape" || t === "bracket";
// Strips laid out as a grid of icons (named on hover): each row a shape across its styles.
const HOLD_MS = 300; // pressing a tool this long opens its strip

// Tool icons in Phosphor's style (256 grid, 16-unit round strokes). Each one draws the real object.
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width={20} height={20} viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export function BondGlyph({ kind }: { kind: BondKind }) {
  const [x1, y1, x2, y2] = [56, 200, 200, 56], d = Math.SQRT1_2;
  const line = (o: number, key?: number) => <line key={key} x1={x1 + o * d} y1={y1 + o * d} x2={x2 + o * d} y2={y2 + o * d} />;
  switch (kind) {
    case "double": return <Icon>{line(-14)}{line(14)}</Icon>;
    case "triple": return <Icon>{line(-24)}{line(0)}{line(24)}</Icon>;
    case "dasheddouble": return <Icon>{line(-14)}<line x1={x1 + 14 * d} y1={y1 + 14 * d} x2={x2 + 14 * d} y2={y2 + 14 * d} strokeDasharray="22 18" strokeLinecap="butt" /></Icon>;
    case "aromaticdouble": return <Icon>{[-14, 14].map((o) => <line key={o} x1={x1 + o * d} y1={y1 + o * d} x2={x2 + o * d} y2={y2 + o * d} strokeDasharray="22 18" strokeLinecap="butt" />)}</Icon>;
    case "eitherdouble": return <Icon><line x1={x1 - 14 * d} y1={y1 - 14 * d} x2={x2 + 14 * d} y2={y2 + 14 * d} /><line x1={x1 + 14 * d} y1={y1 + 14 * d} x2={x2 - 14 * d} y2={y2 - 14 * d} /></Icon>;
    case "bolddouble": return <Icon><line x1={x1 - 10 * d} y1={y1 - 10 * d} x2={x2 - 10 * d} y2={y2 - 10 * d} strokeWidth={40} strokeLinecap="butt" />{line(30)}</Icon>;
    case "bold": return <Icon><line x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={44} strokeLinecap="butt" /></Icon>;
    case "wedge": return <Icon><polygon points={`${x1},${y1} ${x2 - 22 * d},${y2 - 22 * d} ${x2 + 22 * d},${y2 + 22 * d}`} fill="currentColor" /></Icon>;
    case "hashwedge":
    case "hashed":
      return (
        <Icon>
          {[0.15, 0.38, 0.62, 0.85].map((t) => {
            const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t, w = kind === "hashed" ? 20 : 6 + 26 * t;
            return <line key={t} x1={cx - w * d} y1={cy - w * d} x2={cx + w * d} y2={cy + w * d} />;
          })}
        </Icon>
      );
    case "dashed": return <Icon><line x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray="26 22" strokeLinecap="butt" /></Icon>;
    case "wavy": {
      const pts = Array.from({ length: 41 }, (_, k) => {
        const t = k / 40, w = 16 * Math.sin(t * Math.PI * 6);
        return `${x1 + (x2 - x1) * t + w * d},${y1 + (y2 - y1) * t + w * d}`;
      });
      return <Icon><polyline points={pts.join(" ")} /></Icon>;
    }
    case "hollow": return <Icon><polygon points={`${x1},${y1} ${x2 - 22 * d},${y2 - 22 * d} ${x2 + 22 * d},${y2 + 22 * d}`} /></Icon>;
    case "dative": return <Icon><line x1={x1} y1={y1} x2={x2 - 12} y2={y2 + 12} /><polygon points={`${x2},${y2} ${x2 - 64},${y2 + 22} ${x2 - 22},${y2 + 64}`} fill="currentColor" /></Icon>;
    default: return <Icon>{line(0)}</Icon>;
  }
}

export function RingGlyph({ kind }: { kind: RingKind }) {
  if (kind === "chair1" || kind === "chair2") {
    // The real chair the tool draws, scaled to fill the icon (y flipped: the drawing's y points up).
    const pts = chairPoints(kind === "chair1" ? 1 : 2);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => -p[1]);
    const k = 200 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    return <Icon><polygon points={pts.map(([x, y]) => `${128 + (x - cx) * k},${128 + (-y - cy) * k}`).join(" ")} /></Icon>;
  }
  const { n, aromatic } = RINGS[kind], c = 128, r = 92;
  const pts = Array.from({ length: n }, (_, k) => [c + r * Math.sin((2 * Math.PI * k) / n), c - r * Math.cos((2 * Math.PI * k) / n)]);
  const inner = (k: number) => [pts[k], pts[(k + 1) % n]].map(([x, y]) => [c + (x - c) * 0.62, c + (y - c) * 0.62]);
  const doubles = aromatic ? (n === 6 ? [1, 3, 5] : [1, 3]) : [];
  return (
    <Icon>
      <polygon points={pts.map((p) => p.join(",")).join(" ")} />
      {doubles.map((k) => { const [[a, b], [e, f]] = inner(k); return <line key={k} x1={a} y1={b} x2={e} y2={f} />; })}
    </Icon>
  );
}

// The library: a ring standing among others, in the icon style.
const BooksGlyph = () => <Icon><polygon points="128,40 196,80 196,160 128,200 60,160 60,80" /><line x1={40} y1={224} x2={216} y2={224} /></Icon>;
export const ChainGlyph = () => <Icon><polyline points="32,168 80,104 128,168 176,104 224,168" /></Icon>;

// Arrow icons: each draws its arrow, with open heads in the icon style. kind is an arrow variant.
export function ArrowGlyph({ kind: variant }: { kind: string }) {
  const v = arrowVariant(variant), kind = v?.kind;
  if (v?.sweep) return <CurvedGlyph kind={v.kind} sweep={v.sweep} />;
  switch (kind) {
    case "equilibrium": return <Icon><polyline points="32,100 216,100 176,64" /><polyline points="224,156 40,156 80,192" /></Icon>;
    case "resonance": return <Icon><line x1={32} y1={128} x2={224} y2={128} /><polyline points="80,80 32,128 80,176" /><polyline points="176,80 224,128 176,176" /></Icon>;
    case "retro": return <Icon><line x1={32} y1={100} x2={184} y2={100} /><line x1={32} y1={156} x2={184} y2={156} /><polyline points="160,56 224,128 160,200" /></Icon>;
    case "nogo": return <Icon><line x1={32} y1={128} x2={216} y2={128} /><polyline points="168,80 216,128 168,176" /><line x1={88} y1={88} x2={136} y2={168} /><line x1={136} y1={88} x2={88} y2={168} /></Icon>;
    default: return <Icon><line x1={32} y1={128} x2={216} y2={128} /><polyline points="168,80 216,128 168,176" /></Icon>;
  }
}

// Symbol icons: the mark itself.
export function SymbolGlyph({ kind }: { kind: SymbolKind }) {
  const dot = (x: number, r = 22) => <circle cx={x} cy={128} r={r} fill="currentColor" stroke="none" />;
  const delta = (t: string) => <text x={128} y={128} dy="0.35em" textAnchor="middle" fill="currentColor" stroke="none" style={{ font: "600 136px var(--font-sans)" }}>{t}</text>;
  switch (kind) {
    case "plus": return <Icon><line x1={128} y1={60} x2={128} y2={196} /><line x1={60} y1={128} x2={196} y2={128} /></Icon>;
    case "minus": return <Icon><line x1={60} y1={128} x2={196} y2={128} /></Icon>;
    case "circledPlus": return <Icon><circle cx={128} cy={128} r={84} /><line x1={128} y1={84} x2={128} y2={172} /><line x1={84} y1={128} x2={172} y2={128} /></Icon>;
    case "circledMinus": return <Icon><circle cx={128} cy={128} r={84} /><line x1={84} y1={128} x2={172} y2={128} /></Icon>;
    case "radical": return <Icon>{dot(128, 28)}</Icon>;
    case "pair": return <Icon>{dot(84)}{dot(172)}</Icon>;
    case "partialPlus": return <Icon>{delta("δ+")}</Icon>;
    case "partialMinus": return <Icon>{delta("δ−")}</Icon>;
    case "radicalCation": case "radicalAnion": return <Icon>{dot(84, 26)}<line x1={140} y1={128} x2={212} y2={128} />{kind === "radicalCation" && <line x1={176} y1={92} x2={176} y2={164} />}</Icon>;
    case "hDot": return <Icon><polyline points="48,72 128,128 208,72" /><line x1={128} y1={128} x2={128} y2={216} />{dot(128, 26)}</Icon>;
    case "hDash": return <Icon><polyline points="48,184 128,128 208,184" /><line x1={128} y1={128} x2={128} y2={40} /><line x1={104} y1={96} x2={152} y2={96} /><line x1={96} y1={68} x2={160} y2={68} /></Icon>;
    case "attach": return <Icon><line x1={40} y1={208} x2={168} y2={80} /><path d="M128,40 q24,16 12,40 t12,40 t12,40 t12,40" /></Icon>;
    case "bead": return <Icon><line x1={40} y1={216} x2={116} y2={140} /><circle cx={164} cy={92} r={56} fill="currentColor" fillOpacity={0.35} stroke="none" /><circle cx={146} cy={74} r={16} fill="var(--surface-raised)" stroke="none" /></Icon>;
  }
}

// Shape icons: the shape itself.
export function ShapeGlyph({ kind }: { kind: ShapeKind }) {
  switch (kind) {
    case "rounded": return <Icon><rect x={40} y={64} width={176} height={128} rx={32} /></Icon>;
    case "oval": return <Icon><ellipse cx={128} cy={128} rx={92} ry={68} /></Icon>;
    case "highlight": return <Icon><rect x={40} y={64} width={176} height={128} rx={12} fill="currentColor" fillOpacity={0.28} stroke="none" /></Icon>;
    case "brackets": return <Icon><polyline points="84,48 52,48 52,208 84,208" /><polyline points="172,48 204,48 204,208 172,208" /></Icon>;
    case "parens": return <Icon><path d="M84,40 Q36,128 84,216" /><path d="M172,40 Q220,128 172,216" /></Icon>;
    case "braces": return <Icon><path d="M88,40 Q64,40 64,64 L64,108 Q64,128 44,128 Q64,128 64,148 L64,192 Q64,216 88,216" /><path d="M168,40 Q192,40 192,64 L192,108 Q192,128 212,128 Q192,128 192,148 L192,192 Q192,216 168,216" /></Icon>;
    case "tlc": return <TlcGlyph />;
    case "table": return <TableGlyph />;
    default: return <Icon><rect x={40} y={64} width={176} height={128} /></Icon>;
  }
}

// A TLC plate: its outline, origin, dashed front and two spots.
export const TlcGlyph = () => (
  <Icon>
    <rect x={56} y={32} width={144} height={192} rx={8} />
    <line x1={56} y1={196} x2={200} y2={196} strokeWidth={10} />
    <line x1={56} y1={60} x2={200} y2={60} strokeWidth={10} strokeDasharray="16 14" />
    <ellipse cx={100} cy={136} rx={16} ry={10} fill="currentColor" stroke="none" />
    <ellipse cx={156} cy={100} rx={16} ry={10} fill="currentColor" stroke="none" />
  </Icon>
);

// A table in journal style: top, header and bottom rules, and its columns of text as short strokes.
export const TableGlyph = () => (
  <Icon>
    <line x1={32} y1={56} x2={224} y2={56} />
    <line x1={32} y1={100} x2={224} y2={100} strokeWidth={10} />
    <line x1={32} y1={208} x2={224} y2={208} />
    {[136, 172].map((y) => [[52, 84], [116, 152], [184, 204]].map(([a, b]) => <line key={`${y}${a}`} x1={a} y1={y} x2={b} y2={y} strokeWidth={12} />))}
  </Icon>
);

// Atom map: two atoms joined by a dashed arc, ending in an arrowhead.
export const MapGlyph = () => (
  <Icon>
    <circle cx={60} cy={176} r={24} />
    <circle cx={196} cy={176} r={24} />
    <path d="M72,140 Q128,48 184,140" strokeDasharray="20 18" />
    <polyline points="152,128 184,140 192,106" />
  </Icon>
);

// Mass fragmentation: a chain cut by a dashed line.
export const FragmentGlyph = () => (
  <Icon>
    <polyline points="32,168 80,104 128,168 176,104 224,168" />
    <line x1={150} y1={40} x2={106} y2={224} strokeWidth={12} strokeDasharray="18 16" />
  </Icon>
);

// The specialist tools' names and icons.
const SPECIAL_TOOLS: Record<string, { name: string; icon: React.ReactNode }> = { tlc: { name: "TLC plate", icon: <TlcGlyph /> }, table: { name: "Table", icon: <TableGlyph /> }, fragment: { name: "Mass fragmentation", icon: <FragmentGlyph /> }, map: { name: "Atom map", icon: <MapGlyph /> } };

// A curved arrow's icon: its arc at its true sweep, bulging up, with a head at the right-hand end (both ends for a
// double-headed arrow, and one barb on the outside for a fishhook).
function CurvedGlyph({ kind, sweep }: { kind: ArrowKind; sweep: number }) {
  const half = (sweep * Math.PI) / 360, n = 24;
  const raw = Array.from({ length: n + 1 }, (_, i) => { const a = Math.PI / 2 + half - (2 * half * i) / n; return [Math.cos(a), -Math.sin(a)]; });
  const xs = raw.map((q) => q[0]), ys = raw.map((q) => q[1]);
  const k = 168 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const cx = 128 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k, cy = 128 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k;
  const pts = raw.map(([x, y]) => [cx + x * k, cy + y * k]);
  // Barbs 52 units long at 45° to the arc's last chord; a fishhook keeps the one away from the circle's centre.
  const barbs = (tip: number[], from: number[], one: boolean) => {
    const d = Math.hypot(tip[0] - from[0], tip[1] - from[1]), u = [(tip[0] - from[0]) / d, (tip[1] - from[1]) / d], L = 52 * Math.SQRT1_2;
    const b = [[tip[0] - u[0] * L - u[1] * L, tip[1] - u[1] * L + u[0] * L], [tip[0] - u[0] * L + u[1] * L, tip[1] - u[1] * L - u[0] * L]];
    const out = (q: number[]) => Math.hypot(q[0] - cx, q[1] - cy);
    return one ? [out(b[0]) > out(b[1]) ? b[0] : b[1], tip] : [b[0], tip, b[1]];
  };
  const line = (q: number[][]) => q.map((x) => x.map((c) => c.toFixed(1)).join(",")).join(" ");
  return (
    <Icon>
      <polyline points={line(pts)} />
      <polyline points={line(barbs(pts[n], pts[n - 4], kind === "fishhook"))} />
      {kind === "double" && <polyline points={line(barbs(pts[0], pts[4], false))} />}
    </Icon>
  );
}

// A big template with rings (a pyranose, a ligand) reads best at icon size as its rings alone: the bonds in rings and
// their atoms. A bond is in a ring when its ends stay joined without it.
function ringsOnly(m: Mol): Mol {
  if (m.atoms.length <= 9) return m;
  const joined = (skip: number, a: number, b: number) => {
    const seen = new Set([a]), todo = [a];
    while (todo.length) {
      const x = todo.pop()!;
      if (x === b) return true;
      m.bonds.forEach((bd, k) => { if (k === skip || !bd.atoms.includes(x)) return; const y = bd.atoms[0] === x ? bd.atoms[1] : bd.atoms[0]; if (!seen.has(y)) { seen.add(y); todo.push(y); } });
    }
    return false;
  };
  const ring = m.bonds.filter((b, k) => joined(k, b.atoms[0], b.atoms[1]));
  if (!ring.length) return m;
  const keep = [...new Set(ring.flatMap((b) => b.atoms))], at = new Map(keep.map((i, k) => [i, k]));
  return { atoms: keep.map((i) => m.atoms[i]), bonds: ring.map((b) => ({ ...b, atoms: [at.get(b.atoms[0])!, at.get(b.atoms[1])!] as [number, number] })) };
}

// A template's icon: its bonds as strokes in the tool icons' style, and heteroatoms as letters with the bonds
// stopping short of them, as in a drawn structure.
export function TemplateGlyph({ mol: whole }: { mol: Mol }) {
  const mol = ringsOnly(whole), xs = mol.atoms.map((a) => a.location[0]), ys = mol.atoms.map((a) => -a.location[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)], span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1);
  const k = 176 / span, ox = 40 + (176 - (Math.max(...xs) - x0) * k) / 2, oy = 40 + (176 - (Math.max(...ys) - y0) * k) / 2;
  const at = (i: number): [number, number] => [ox + (xs[i] - x0) * k, oy + (ys[i] - y0) * k];
  const mid = [xs.reduce((s, x) => s + x, 0) / xs.length, ys.reduce((s, y) => s + y, 0) / ys.length];
  const c: [number, number] = [ox + (mid[0] - x0) * k, oy + (mid[1] - y0) * k];
  const label = (i: number) => mol.atoms[i].text ?? (mol.atoms[i].label !== "C" ? mol.atoms[i].label : undefined);
  const GAP = 44; // a labelled atom's clear space, in icon units
  // A line from p to q, shortened at each end that has a label.
  const trim = (p: [number, number], q: [number, number], cutP: boolean, cutQ: boolean) => {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, u = [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
    return [[p[0] + u[0] * (cutP ? GAP : 0), p[1] + u[1] * (cutP ? GAP : 0)], [q[0] - u[0] * (cutQ ? GAP : 0), q[1] - u[1] * (cutQ ? GAP : 0)]];
  };
  return (
    <Icon>
      {mol.bonds.map((b, i) => {
        const [ia, ib] = b.atoms, [p, q] = trim(at(ia), at(ib), !!label(ia), !!label(ib));
        // A double bond's second line sits towards the middle of the template, shortened.
        const inner = b.type === 2 && (() => {
          const shift = [(c[0] - (p[0] + q[0]) / 2) * 0.28, (c[1] - (p[1] + q[1]) / 2) * 0.28];
          const a = [p[0] + (q[0] - p[0]) * 0.2 + shift[0], p[1] + (q[1] - p[1]) * 0.2 + shift[1]], e = [q[0] + (p[0] - q[0]) * 0.2 + shift[0], q[1] + (p[1] - q[1]) * 0.2 + shift[1]];
          return <line x1={a[0]} y1={a[1]} x2={e[0]} y2={e[1]} />;
        })();
        return <g key={i}><line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />{inner}</g>;
      })}
      {mol.atoms.map((_, i) => {
        const t = label(i);
        if (!t) return null;
        const [x, y] = at(i);
        return <text key={`l${i}`} x={x} y={y} dy="0.35em" textAnchor="middle" fill="currentColor" stroke="none" style={{ font: `600 ${t.length > 1 ? 72 : 96}px var(--font-sans)` }}>{t}</text>;
      })}
    </Icon>
  );
}

type PaletteProps = {
  tool: Tool;
  coach?: Tool; // the tool the tutorial asks for: it pulses until chosen
  variants: Variants;
  templates: Template[];
  pinned: string[]; // options on the toolbar, as "tool:variant"
  popKey: number; // changes when a hold switches to Select, to replay its pop
  canUndo: boolean;
  canRedo: boolean;
  keys: (command: string) => string | undefined; // a command's shortcut, for its tooltip
  canAddSelection: boolean; // something is selected that could become a ring
  renaming?: string; // a template just added, whose name is being typed
  preview: (name: string) => Mol | undefined; // the structure for a name, if it is one
  onTool: (t: Tool) => void;
  onVariant: (t: keyof Variants, kind: string) => void;
  onPinned: (pinned: string[]) => void;
  onAddName: (name: string) => boolean;
  onAddSelection: () => void;
  onRename: (id: string, name: string) => void;
  onRemoveTemplate: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDrop: (x: number, y: number) => void; // an option, now in hand, was let go here on the canvas (px)
  stripWidths: Record<string, number>; // widths the user dragged each menu to, by tool ("more", "curves" too)
  onStripWidth: (key: string, width: number) => void;
  curvedArrows: string[]; // curved arrow variants in the Arrow strip
  onCurvedArrows: (list: string[]) => void;
  libraryRings: string[]; // library templates in the Ring strip
  onLibraryRings: (list: string[]) => void;
  wide: boolean; // the toolbar in two columns
  onWide: (wide: boolean) => void;
};

const DRAG_PX = 6; // an option pressed and moved this far is being dragged to the toolbar

export function Palette(p: PaletteProps) {
  // ?strip=ring opens a strip on load (dev only, for checking its layout).
  const [open, setOpen] = useState<Tool | undefined>(() => (new URLSearchParams(location.search).get("strip") as Tool) ?? undefined);
  const [held, setHeld] = useState(false); // the strip was opened by a press that is still down
  // An option being dragged onto the toolbar (or a shortcut being dragged along it or off it). index: where it
  // would land among the shortcuts. phase: following the pointer, flying into its slot, or fading away.
  // toList: a curved arrow is over the Arrow strip, which takes it into its list.
  const [carry, setCarry] = useState<{ key: string; pin: boolean; x: number; y: number; tilt: number; over: boolean; toList?: boolean; index: number; phase: "drag" | "land" | "drop" }>();
  const [curves, setCurves] = useState(false); // every curved arrow, beside the Arrow strip
  const [library, setLibrary] = useState(false); // the template library, beside the Ring strip
  const [arrived, setArrived] = useState<string>(); // a curved arrow just added to the Arrow strip settles in
  const [landed, setLanded] = useState<{ key: string; n: number }>(); // the shortcut that just landed: it settles, the others ripple
  const [chosen, setChosen] = useState<string>(); // the shortcut last chosen, as "tool:variant"
  const dragged = useRef(false); // the last press was a drag, so its click does nothing
  const [adding, setAdding] = useState("");
  const timer = useRef<number>(undefined);
  const nav = useRef<HTMLElement>(null);
  // A window too short for one column of tools gets two, and the user's choice stays as it was. The toggle goes
  // until one column fits again. one: the toolbar's height in one column, measured when it last was.
  const [short, setShort] = useState(false), one = useRef(0), wide = p.wide || short;
  useLayoutEffect(() => {
    const box = nav.current!;
    const fit = () => {
      if (!wide) one.current = box.offsetHeight;
      setShort(!p.wide && one.current > innerHeight - 2 * box.offsetTop);
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    addEventListener("resize", fit);
    return () => { watch.disconnect(); removeEventListener("resize", fit); };
  }, [wide, p.wide]);

  // Close the strip on Escape or a press anywhere else.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!nav.current?.contains(e.target as Node)) setOpen(undefined); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(undefined); } };
    addEventListener("pointerdown", away);
    addEventListener("keydown", esc);
    return () => { removeEventListener("pointerdown", away); removeEventListener("keydown", esc); };
  }, [open]);
  useEffect(() => { if (open !== "arrow") setCurves(false); if (open !== "ring") setLibrary(false); }, [open]);
  useEffect(() => { if (arrived) { const t = setTimeout(() => setArrived(undefined), 400); return () => clearTimeout(t); } }, [arrived]);
  // Lists the user keeps in a strip: curved arrows in the Arrow strip, library templates in the Ring strip.
  const keptIn = (tool: Strip) => (tool === "arrow" ? p.curvedArrows : tool === "ring" ? p.libraryRings : []);
  const setKept = (tool: Strip, list: string[]) => (tool === "arrow" ? p.onCurvedArrows(list) : p.onLibraryRings(list));
  const keep = (tool: Strip, v: string) => { if (!keptIn(tool).includes(v)) setKept(tool, [...keptIn(tool), v]); setArrived(v); };
  const unkeep = (tool: Strip, v: string) => setKept(tool, keptIn(tool).filter((x) => x !== v));
  // The strip whose list a dragged option can go into, if any.
  const keepable = (key: string): Strip | undefined => (key.startsWith("arrow:") && arrowVariant(key.slice(6))?.sweep ? "arrow" : key.startsWith("ring:lib:") ? "ring" : undefined);
  // A template added from the drawing opens the ring list, with its name ready to type.
  useEffect(() => { if (p.renaming) setOpen("ring"); }, [p.renaming]);

  const template = (kind: string) => p.templates.find((t) => templateKind(t.id) === kind);
  const shapeOf = (kind: string) => template(kind)?.mol ?? libraryItem(kind)?.mol;
  const nameOf = (tool: Strip, kind: string) =>
    tool === "more" ? SPECIAL_TOOLS[kind]?.name : tool === "bond" ? BONDS[kind as BondKind]?.name : tool === "template" ? (template(kind)?.name ?? libraryItem(kind)?.name) : tool === "symbol" ? SYMBOLS[kind as SymbolKind] : tool === "shape" ? shapeName(kind) : tool === "orbital" ? orbitalName(kind) : tool === "bracket" ? BRACKETS[kind] : tool === "ring" ? (RINGS[kind as RingKind]?.name ?? template(kind)?.name ?? libraryItem(kind)?.name)
      : tool === "arrow" ? arrowName(kind) : SELECTS[kind as SelectKind]?.name;
  const iconOf = (tool: Strip, kind: string) => {
    if (tool === "more") return SPECIAL_TOOLS[kind]?.icon;
    if (tool === "bond") return <BondGlyph kind={kind as BondKind} />;
    if (tool === "select") return kind === "lasso" ? <Lasso size={20} /> : kind === "perspective" ? <Cube size={20} /> : <Selection size={20} />;
    if (tool === "arrow") return <ArrowGlyph kind={kind} />;
    if (tool === "symbol") return <SymbolGlyph kind={kind as SymbolKind} />;
    if (tool === "template") { const mol = shapeOf(kind); return mol ? <TemplateGlyph mol={mol} /> : <BooksGlyph />; }
    if (tool === "shape") return <ElementGlyph v={kind} />;
    if (tool === "orbital") return <OrbitalGlyph v={kind} />;
    if (tool === "bracket") return <BracketGlyph v={kind} />;
    const mol = shapeOf(kind);
    return mol ? <TemplateGlyph mol={mol} /> : <RingGlyph kind={kind as RingKind} />;
  };
  const options = (tool: Strip) =>
    tool === "bond" ? Object.keys(BONDS) : tool === "template" ? [p.variants.template] : tool === "symbol" ? Object.keys(SYMBOLS) : tool === "shape" ? [...SHAPE_GRID.flat(), ...SHAPE_EXTRA] : tool === "orbital" ? ORBITAL_GRID.flat() : tool === "bracket" ? Object.keys(BRACKETS) : tool === "select" ? Object.keys(SELECTS) : tool === "arrow" ? [...STRAIGHT, ...p.curvedArrows.filter((v) => arrowVariant(v)?.sweep)] : [...Object.keys(RINGS), ...p.templates.map((t) => templateKind(t.id)), ...p.libraryRings.filter((k) => libraryItem(k))];
  // A menu's groups: shapes across their styles, then lines, arcs and the rest; each orbital across its phases;
  // one group for everything else.
  const groupsOf = (tool: Strip, list: string[]): string[][] =>
    tool === "shape" ? [...SHAPE_GRID.map((r) => r.slice(0, 5)), SHAPE_GRID.map((r) => r[5]), SHAPE_GRID.flatMap((r) => r.slice(6)), SHAPE_EXTRA]
      : tool === "orbital" ? ORBITAL_GRID : [list];
  // The columns a menu opens with: the user's own, or two across.
  const columnsOf = (key: string) => (p.stripWidths[key] ? columnsFor(p.stripWidths[key]) : DEFAULT_COLUMNS);
  // Pinned shortcuts whose option still exists.
  const pins = p.pinned.flatMap((key) => {
    const [tool, ...rest] = key.split(":"), kind = rest.join(":");
    return (isStrip(tool as Tool) || tool === "more") && nameOf(tool as Strip, kind) ? [{ key, tool: tool as Strip, kind }] : [];
  });

  const tools: { id: Tool; name: string; icon: React.ReactNode }[] = [
    { id: "select", name: p.variants.select === "lasso" ? "Lasso" : p.variants.select === "perspective" ? "Structure perspective" : "Select", icon: p.variants.select === "lasso" ? <Lasso size={20} /> : p.variants.select === "perspective" ? <Cube size={20} /> : <Selection size={20} /> },
    { id: "bond", name: `${BONDS[p.variants.bond].name} bond`, icon: <BondGlyph kind={p.variants.bond} /> },
    { id: "chain", name: "Chain", icon: <ChainGlyph /> },
    { id: "ring", name: nameOf("ring", p.variants.ring) ?? "Ring", icon: iconOf("ring", p.variants.ring) },
    { id: "template", name: `${nameOf("template", p.variants.template) ?? "Template"}. Templates`, icon: iconOf("template", p.variants.template) },
    { id: "orbital", name: orbitalName(p.variants.orbital) ?? "Orbital", icon: <OrbitalGlyph v={p.variants.orbital} /> },
    { id: "symbol", name: SYMBOLS[p.variants.symbol], icon: <SymbolGlyph kind={p.variants.symbol} /> },
    { id: "arrow", name: `${arrowName(p.variants.arrow) ?? "Reaction"} arrow`, icon: <ArrowGlyph kind={p.variants.arrow} /> },
    { id: "shape", name: shapeName(p.variants.shape) ?? "Shape", icon: <ElementGlyph v={p.variants.shape} /> },
    { id: "bracket", name: BRACKETS[p.variants.bracket] ?? "Brackets", icon: <BracketGlyph v={p.variants.bracket} /> },
    { id: "text", name: "Text", icon: <TextT size={20} /> },
    { id: "erase", name: "Eraser ([ and ] change its size)", icon: <Eraser size={20} /> },
  ];
  // The specialist slot: the special tool in hand, or the one last used.
  const special = SPECIAL.includes(p.tool) ? p.tool : SPECIAL.includes(p.variants.more as Tool) ? (p.variants.more as Tool) : SPECIAL[0];
  tools.push({ id: special, name: SPECIAL_TOOLS[special].name, icon: SPECIAL_TOOLS[special].icon });
  const active = tools.findIndex((t) => t.id === p.tool);
  const choose = (t: Strip, kind: string) => { p.onVariant(t, kind); p.onTool(t === "more" ? (kind as Tool) : t); setOpen(undefined); setChosen(undefined); };
  // A shortcut chosen from the toolbar takes the active look (the indicator) from its tool's slot while that option
  // stays in hand, so one button looks active, never two.
  const holds = (x: { tool: Strip; kind: string }) => (x.tool === "more" ? p.tool === x.kind : p.tool === x.tool && p.variants[x.tool] === x.kind);
  const lit = pins.find((x) => x.key === chosen && holds(x));
  if (chosen && !lit) setChosen(undefined);
  const indicator = useRef<HTMLSpanElement>(null), [litAt, setLitAt] = useState<[number, number]>();
  useLayoutEffect(() => {
    const el = lit && nav.current?.querySelector<HTMLElement>(`[data-pin="${CSS.escape(lit.key)}"]`), from = indicator.current;
    const at: [number, number] | undefined = el && from ? [el.offsetLeft - from.offsetLeft, el.offsetTop - from.offsetTop] : undefined;
    if (at?.[0] !== litAt?.[0] || at?.[1] !== litAt?.[1]) setLitAt(at);
  });

  // Drag an option onto the toolbar to pin it there; drag a shortcut along the toolbar to move it, or off it to remove it.
  // An option let go on the canvas goes in there. pin: a shortcut is dragged, not an option from a menu.
  function startCarry(e: React.PointerEvent, key: string, pin = false) {
    if (e.button !== 0) return;
    const [sx, sy] = [e.clientX, e.clientY];
    let moving = false, lastX = sx, tilt = 0, index = 0;
    dragged.current = false;
    const calm = reduced();
    const inside = (x: number, y: number) => { const r = nav.current!.getBoundingClientRect(); return x >= r.left - 24 && x <= r.right + 24 && y >= r.top && y <= r.bottom + 36; };
    // A curved arrow or library template can also go into its strip's list.
    const listTool = keepable(key), list = listTool ? nav.current!.querySelector(`.strip[data-tool="${listTool}"]`) : null;
    const onList = (x: number, y: number) => { const r = list?.getBoundingClientRect(); return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    // Where it would land: before the first other shortcut that comes after the pointer in reading order (below
    // it, or on its row and to its right), else at the end.
    const slotAt = (x: number, y: number) => {
      const others = [...nav.current!.querySelectorAll<HTMLElement>("[data-pin]")].filter((el) => el.dataset.pin !== key);
      const at = others.findIndex((el) => { const r = el.getBoundingClientRect(); return y < r.top || (y < r.bottom && x < r.left + r.width / 2); });
      return at < 0 ? others.length : at;
    };
    const move = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_PX) return;
      moving = dragged.current = true;
      // It leans into the direction it is pulled, and straightens when it stops.
      tilt = calm ? 0 : Math.max(-12, Math.min(12, tilt * 0.6 + (ev.clientX - lastX) * 0.8));
      lastX = ev.clientX;
      const toList = onList(ev.clientX, ev.clientY), over = !toList && inside(ev.clientX, ev.clientY);
      if (over) index = slotAt(ev.clientX, ev.clientY);
      setCarry({ key, pin, x: ev.clientX, y: ev.clientY, tilt, over, toList, index, phase: "drag" });
    };
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      if (!moving) return setCarry(undefined);
      const rest = p.pinned.filter((k) => k !== key);
      if (onList(ev.clientX, ev.clientY)) {
        setCarry((c) => c && { ...c, tilt: 0, toList: false, phase: "drop" });
        keep(listTool!, key.slice(listTool!.length + 1));
        return void setTimeout(() => setCarry(undefined), timing("--motion-fast").duration);
      }
      if (!inside(ev.clientX, ev.clientY)) {
        // Off the toolbar: a shortcut is removed, an option goes back. Either way it fades where it was let go. An
        // option let go on the canvas is the tool in hand now, and goes in there as a click there would put it: a ring
        // fused onto the bond under it, a symbol on the atom, a bond style on the bond, an arrow of the usual length.
        setCarry((c) => c && { ...c, tilt: 0, over: false, phase: "drop" });
        const [tool, ...kind] = key.split(":");
        if (!pin && document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".canvas")) {
          choose(tool as Strip, kind.join(":"));
          p.onDrop(ev.clientX, ev.clientY);
        }
        return void setTimeout(() => { if (pin) p.onPinned(rest); setCarry(undefined); }, timing("--motion-fast").duration);
      }
      // On the toolbar: it flies into the gap that opened for it, then the toolbar takes it.
      const slot = nav.current!.querySelector(".pin-slot")?.getBoundingClientRect();
      setCarry((c) => c && { ...c, tilt: 0, phase: "land", ...(slot ? { x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 } : {}) });
      setTimeout(() => {
        p.onPinned([...rest.slice(0, index), key, ...rest.slice(index)]);
        setCarry(undefined);
        setOpen(undefined);
        setLanded((l) => ({ key, n: (l?.n ?? 0) + 1 }));
      }, calm ? 0 : timing().duration);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }
  // One column or two: every tool glides from where it was to where it goes, and the toolbar grows or shrinks to
  // match (instant with reduced motion).
  function toggleWide() {
    const box = nav.current!;
    const items = [...box.querySelectorAll<HTMLElement>(":scope > .slot, :scope > .tool, :scope > hr, :scope > .palette-toggle")];
    const before = items.map((el) => el.getBoundingClientRect()), from = box.getBoundingClientRect();
    flushSync(() => p.onWide(!p.wide));
    if (reduced()) return;
    const to = box.getBoundingClientRect(), glide = timing();
    box.animate([{ width: `${from.width}px`, height: `${from.height}px` }, { width: `${to.width}px`, height: `${to.height}px` }], glide);
    items.forEach((el, i) => {
      const r = el.getBoundingClientRect(), dx = before[i].left - r.left, dy = before[i].top - r.top;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], glide);
    });
  }
  // The landing ripple runs once, then the class comes off so it can run again next time.
  useEffect(() => { if (landed) { const t = setTimeout(() => setLanded(undefined), 700); return () => clearTimeout(t); } }, [landed]);

  function addByName() {
    if (p.onAddName(adding.trim())) return setAdding("");
  }
  const addPreview = useMemo(() => (adding.trim() ? p.preview(adding) : undefined), [adding]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <nav ref={nav} className={["palette", wide && "wide", carry?.over && "dropping", landed && "rippling"].filter(Boolean).join(" ")} aria-label="Tools" data-tips="right">
      <span ref={indicator} className="indicator" style={{ transform: lit && litAt ? `translate(${litAt[0]}px, ${litAt[1]}px)` : wide ? `translate(${(active % 2) * 36}px, ${Math.floor(active / 2) * 36}px)` : `translateY(${active * 36}px)`, opacity: active < 0 && !lit ? 0 : 1 }} aria-hidden />
      {tools.map((t, i) => {
        const group = SPECIAL.includes(t.id);
        const strip = group ? SPECIAL : isStrip(t.id) ? options(t.id) : undefined;
        return (
          <div key={t.id} className="slot" data-col={wide ? i % 2 : undefined} style={{ "--d": Math.abs(i - (tools.length + 1 + pins.findIndex((x) => x.key === landed?.key))) } as React.CSSProperties}>
            <button
              className={p.coach === t.id && p.tool !== t.id ? "tool coach-target" : "tool"}
              aria-pressed={p.tool === t.id && !lit}
              aria-label={t.name}
              aria-haspopup={strip ? "menu" : undefined}
              aria-expanded={strip ? open === t.id : undefined}
              data-key={p.keys(`tool.${t.id}`)}
              onPointerDown={() => {
                if (!strip) return;
                clearTimeout(timer.current);
                timer.current = window.setTimeout(() => { setOpen(t.id); setHeld(true); }, HOLD_MS);
              }}
              onPointerUp={() => clearTimeout(timer.current)}
              onPointerLeave={() => clearTimeout(timer.current)}
              onClick={() => {
                if (held) return setHeld(false);
                if (strip && p.tool === t.id && !lit) return setOpen(open === t.id ? undefined : t.id);
                setOpen(undefined);
                setChosen(undefined);
                p.onTool(t.id);
              }}
            >
              <span key={t.id === "select" ? `pop${p.popKey}` : t.id} className={t.id === "select" && p.popKey ? "glyph pop" : "glyph"}>
                {t.icon}
              </span>
              {strip && <span className="more" aria-hidden />}
            </button>
            <Exit>{group && open === t.id && (
              // The specialist tools; any can be dragged onto the toolbar.
              <Menu label="More tools" groups={[SPECIAL.map((id) => ({ key: id, name: SPECIAL_TOOLS[id].name, icon: SPECIAL_TOOLS[id].icon, checked: p.tool === id }))]}
                columns={columnsOf("more")} onColumns={(n) => p.onStripWidth("more", menuWidth(n))}
                onPress={(e, id) => startCarry(e, `more:${id}`)} onChoose={(id) => { if (!dragged.current) choose("more", id); }} onRelease={(id) => { if (held) choose("more", id); }} />
            )}</Exit>
            <Exit>{t.id === "template" && open === "template" && (
              <LibraryPanel current={p.variants.template} mine={p.templates.map((x) => ({ kind: templateKind(x.id), name: x.name, category: "My templates", mol: x.mol }))}
                onChoose={(kind) => { if (!dragged.current) choose("template", kind); }}
                onPress={(e, kind) => startCarry(e, `template:${kind}`)} />
            )}</Exit>
            <Exit>{strip && isStrip(t.id) && t.id !== "template" && open === t.id && (() => {
              const tool = t.id, curveCarry = !!carry && keepable(carry.key) === tool;
              const item = (kind: string): MenuItem => {
                const name = nameOf(tool, kind)!, custom = template(kind);
                const kept = (tool === "arrow" && !!arrowVariant(kind)?.sweep) || (tool === "ring" && !!libraryItem(kind));
                return {
                  key: kind, name, icon: iconOf(tool, kind), checked: p.variants[tool] === kind, arrived: arrived === kind,
                  ...(custom || kept ? { action: { icon: <X size={12} />, label: `Remove ${name}`, onClick: () => (custom ? p.onRemoveTemplate(custom.id) : unkeep(tool, kind)) } } : {}),
                  ...(custom && p.renaming === custom.id ? {
                    editing: (
                      <input className="variant-input" aria-label="Name" autoFocus defaultValue={custom.name} onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.currentTarget.blur(); } }}
                        onBlur={(e) => p.onRename(custom.id, e.target.value.trim() || custom.name)} />
                    ),
                  } : {}),
                };
              };
              const groups = groupsOf(tool, strip).map((g) => g.map(item));
              // Rows under the options: the way into all curved arrows, or into the template library and adding rings.
              const extra = tool === "arrow" ? (
                <button className="variant" aria-haspopup="menu" aria-expanded={curves} onClick={() => setCurves(!curves)} onPointerUp={() => { if (held) setCurves(true); }}>
                  <ArrowGlyph kind="curved-180" />
                  <span className="variant-name">Curved arrows</span>
                  <CaretRight size={12} className="variant-caret" aria-hidden />
                </button>
              ) : tool === "ring" ? (
                <>
                  <button className="variant" aria-haspopup="dialog" aria-expanded={library} onClick={() => setLibrary(!library)} onPointerUp={() => { if (held) setLibrary(true); }}>
                    <BooksGlyph />
                    <span className="variant-name">Templates</span>
                    <CaretRight size={12} className="variant-caret" aria-hidden />
                  </button>
                  <label className="variant add">
                    {addPreview ? <TemplateGlyph mol={addPreview} /> : <Plus size={20} />}
                    <input className="variant-input" placeholder="Add by name" aria-label="Add a ring by name" spellCheck={false} value={adding}
                      aria-invalid={!!adding.trim() && !addPreview} onChange={(e) => setAdding(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addByName(); if (e.key === "Escape") { e.preventDefault(); e.currentTarget.blur(); } }} />
                  </label>
                  {p.canAddSelection && (
                    <button className="variant add" onClick={p.onAddSelection}>
                      <Plus size={20} />
                      <span className="variant-name">Add selection</span>
                    </button>
                  )}
                </>
              ) : undefined;
              // Every curved arrow, one group per kind: the pin keeps one in the Arrow menu.
              const curveGroups = CURVED.map((kind) => SWEEPS.map((sweep): MenuItem => {
                const v = `${kind}-${sweep}`, name = arrowName(v)!, isKept = p.curvedArrows.includes(v);
                return { key: v, name, icon: <ArrowGlyph kind={v} />, checked: p.variants.arrow === v,
                  action: { icon: <PushPin size={12} />, label: isKept ? "In the Arrow menu" : "Keep in the Arrow menu", pressed: isKept, onClick: () => (isKept ? unkeep("arrow", v) : keep("arrow", v)) } };
              }));
              return (
                <Menu label={`${t.name} options`} tool={tool} groups={groups} className={[carry && !curveCarry && "carrying", carry?.toList && "receiving"].filter(Boolean).join(" ")}
                  columns={columnsOf(tool)} onColumns={(n) => p.onStripWidth(tool, menuWidth(n))}
                  onPress={(e, kind) => startCarry(e, `${tool}:${kind}`)} onChoose={(kind) => { if (!dragged.current) choose(tool, kind); }} onRelease={(kind) => { if (held) choose(tool, kind); }}
                  extra={extra}>
                  <Exit>{tool === "arrow" && curves && (
                    <Menu label="Curved arrows" className={["submenu", curveCarry && "carrying"].filter(Boolean).join(" ")} groups={curveGroups}
                      columns={columnsOf("curves")} onColumns={(n) => p.onStripWidth("curves", menuWidth(n))}
                      onPress={(e, v) => startCarry(e, `arrow:${v}`)} onChoose={(v) => { if (!dragged.current) choose("arrow", v); }} />
                  )}</Exit>
                  <Exit>{tool === "ring" && library && (
                    <LibraryPanel current={p.variants.ring} kept={p.libraryRings} dimmed={curveCarry}
                      mine={p.templates.map((x) => ({ kind: templateKind(x.id), name: x.name, category: "My templates", mol: x.mol }))}
                      onChoose={(kind) => { if (!dragged.current) choose("ring", kind); }}
                      onKeep={(kind, on) => (on ? keep("ring", kind) : unkeep("ring", kind))}
                      onPress={(e, kind) => startCarry(e, `ring:${kind}`)} />
                  )}</Exit>
                </Menu>
              );
            })()}</Exit>
          </div>
        );
      })}
      {(() => {
        // Shortcuts, with a gap where a dragged option would land. The one being dragged leaves its place.
        const gap = carry && (carry.phase === "land" || (carry.phase === "drag" && carry.over));
        const shown = pins.filter((x) => !(gap && x.key === carry.key));
        const items: React.ReactNode[] = shown.map(({ key, tool, kind }, j) => (
          <button
            key={key}
            data-pin={key}
            className={landed?.key === key ? "tool landed" : "tool"}
            style={{ "--d": Math.abs(j - shown.findIndex((x) => x.key === landed?.key)) } as React.CSSProperties}
            aria-pressed={lit?.key === key}
            aria-label={nameOf(tool, kind)}
            onPointerDown={(e) => startCarry(e, key, true)}
            onClick={() => { if (!dragged.current) { choose(tool, kind); setChosen(key); } }}
          >
            <span className="glyph">{iconOf(tool, kind)}</span>
          </button>
        ));
        if (gap) items.splice(carry.index, 0, <span key="slot" className="pin-slot" aria-hidden />);
        return items.length ? <><hr />{items}</> : null;
      })()}
      <hr />
      <button className="tool" aria-label="Undo" data-key={p.keys("undo")} disabled={!p.canUndo} onClick={p.onUndo}>
        <ArrowCounterClockwise size={20} />
      </button>
      <button className="tool" aria-label="Redo" data-key={p.keys("redo")} disabled={!p.canRedo} onClick={p.onRedo}>
        <ArrowClockwise size={20} />
      </button>
      {!short && (
        <button className="palette-toggle" aria-label={p.wide ? "One column" : "Two columns"} onClick={toggleWide}>
          {p.wide ? <CaretLeft size={12} /> : <CaretRight size={12} />}
        </button>
      )}
      {carry && (() => {
        const [tool, ...rest] = carry.key.split(":");
        // A shortcut pulled off the toolbar: the window greys and a red bin shows it will go.
        const leaving = carry.pin && !carry.over && !carry.toList && carry.phase !== "land";
        return (
          <>
            {leaving && <div className={carry.phase === "drop" ? "remove-shade going" : "remove-shade"} aria-hidden />}
            <span className={`carry ${carry.phase}${leaving ? " removing" : ""}`} style={{ left: carry.x, top: carry.y, "--tilt": `${carry.tilt}deg` } as React.CSSProperties} aria-hidden>
              {iconOf(tool as Strip, rest.join(":"))}
              {leaving && <span className="remove-bin"><Trash size={12} /></span>}
            </span>
          </>
        );
      })()}
    </nav>
  );
}
