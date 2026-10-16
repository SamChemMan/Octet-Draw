import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowsOutSimple, Atom as AtomIcon, SelectionInverse, Cube, Square, BoundingBox, SelectionSlash, AlignLeft, AlignRight, AlignTop, AlignBottom, AlignCenterHorizontal, AlignCenterVertical, ArrowsOutLineHorizontal, ArrowsOutLineVertical, Eraser, FileArrowDown, FilePlus, FlipHorizontal, FlipVertical, FloppyDisk, FolderOpen,
  FrameCorners, GearSix, Keyboard, Lasso, LinkSimple, MagicWand, MagnifyingGlassMinus, MagnifyingGlassPlus, Selection, SelectionAll, SlidersHorizontal,
  TextAlignCenter, TextAlignLeft, TextAlignRight, TextB, TextItalic, TextT, TextUnderline, Warning, ArrowsDownUp, FileText, CaretDown, ClockCounterClockwise, X,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { analyse, cipOf, cleanUp, expandLabels, fragmentMasses, mapReaction, importStructure, toInchi, measurer, parseStructure, ready, STYLE, textWidth, toSmiles } from "./chem";
import { PAGE_NAMES, fontStack, pageSize, frameStyle, readStyle, COLOURS, FONTS, type DocStyle, type PageName } from "./docstyle";
import { messy, problems } from "./check";
import { parse, serialize } from "./file";
import {
  EMPTY, addArrow, addCaption, addCycle, addCharge, addRing, updateArrow, deleteGraphics, inPolygon, nextNumber, updateCaption, atomAt, atomsIn, bondAt, bondTo, bounds, chainTo, complete, cycleBond, deleteAtom, deleteAtoms, deleteBond, erase, flipBond,
  addChair, addGroup, addTemplate, alignFragments, atomsInPolygon, flipAtoms, fragments, joinOverlaps, setLabel, merge, moveAtoms, neighbours, onSelection, pos, rotateAtoms, setBondSpec, setElement, setPosition, sprout, subset,
  addShape, addSymbol, freePairs, nextDirection, setAtomMarks, toggleLonePairs, updateShape, type BondSpec, type Group, type P, type SymbolKind, newTable, resizeTable, setTableCell, pairMap, clearMap, stereocentres, setEnhanced, markDirection, tiltAtoms, turnAboutBond, flattenAtoms, hingeOf, groupsOf, groupSelection, ungroupSelection, duplicateSelection,
} from "./edit";
import { snapBox, snapMove, type Guide } from "./snap";
import { loadSettings, saveSettings } from "./settings";
import { actionFor, keyOf, keymap, label as keyLabel } from "./keys";
import { Actions, actionItems, type Context } from "./Actions";
import { CommandPalette, type Command } from "./CommandPalette";
import { StructureThumb } from "./TemplateLibrary";
import { cleanUpReaction, findReaction, GAP, layoutRow, reactionClean, rowOf } from "./reaction";
import { SettingsWindow, type ModuleId } from "./SettingsWindow";
import { layoutCycles, orderAround, spreadCycle, type Cycle, type CycleText } from "./cycle";
import { LIBRARY, libraryItem } from "./library";
import { BracketGlyph, BRACKETS, bracketSpec, ElementGlyph, ORBITAL_GRID, OrbitalGlyph, orbitalName, orbitalSpec, SHAPE_EXTRA, SHAPE_GRID, shapeName, shapeSpec } from "./elements";
import {
  ArrowGlyph, arrowName, arrowVariant, BondGlyph, BONDS, ChainGlyph, Palette, RingGlyph, RINGS, SELECTS, SymbolGlyph, SYMBOLS, TemplateGlyph,
  type BondKind, type RingKind, type SelectKind, type Tool,
} from "./tools";
import { arrowPath, arrowShapes, bendPoint, curved, fitArrows, HIGHLIGHT, SHADE, tlcLayout, tableLayout, curveBox, headsOf, takesHeads, isBracket, isLine, isOrbital, markAt, orbitalPaths, straightArrow, shapeInk, shapePaths, SWEEPS, sweepBend, sweepOf, isNumber, placeCaptions, render, type Arrow, type ArrowKind, type Box, type Caption, type CurvePoint, type Head, type HeadShape, type CurveFill, type Mol, type Placed, type Shape, type ShapeKind } from "./render";
import { rotateCursor, selectCursor } from "./cursor";
import { loadNames, nameToSmiles, suggestName } from "./names";
import { checkedName, setNamer } from "./naming";
import { iupacName } from "./namer";

setNamer(iupacName);
import { loadTemplates, newTemplate, templateKind } from "./templates";
import { formulaRuns } from "./labels";
import { common, edited, lines as richLines, normalise, plainOf, runsOf, styleRange, styled, type RunStyle, type TextRun } from "./richtext";
import { RichBox, type RichApi } from "./RichBox";
import { Dialog } from "./Dialog";
import "./editor.css";


const MOD = navigator.platform.startsWith("Mac") ? "⌘" : "Ctrl+";
// In the desktop app the native menu owns undo, redo and the file commands; in a browser (dev only) the page does.
const TAURI = "__TAURI_INTERNALS__" in window;

// Undo history: every edit pushes a new Mol; undo and redo move along the list.
// merge: edits with the same key one after another (a slider being dragged) make one step.
type History = { stack: Mol[]; at: number; merge?: string };
type Action = { type: "set"; mol: Mol; merge?: string } | { type: "undo" } | { type: "redo" };
function history(h: History, a: Action): History {
  if (a.type === "undo") return { ...h, at: Math.max(0, h.at - 1), merge: undefined };
  if (a.type === "redo") return { ...h, at: Math.min(h.stack.length - 1, h.at + 1), merge: undefined };
  if (a.mol === h.stack[h.at]) return h;
  if (a.merge && a.merge === h.merge && h.at === h.stack.length - 1 && h.at > 0) return { stack: [...h.stack.slice(0, h.at), a.mol], at: h.at, merge: a.merge };
  return { stack: [...h.stack.slice(0, h.at + 1), a.mol], at: h.at + 1, merge: a.merge };
}

const L = STYLE.bond; // px per bond length at 100%
// The drawing's origin is the middle of the page. The canvas opens at 125% of true size: 10 pt labels read like
// body text, and a structure fills a good part of the window without crowding it.
const OPEN_ZOOM = 1.25;
// The page sizes shown together: the ISO series, or the US one.
const SERIES: Record<string, PageName[]> = { iso: ["A4", "A3", "A2"], us: ["Letter", "Legal", "Tabloid"] };
const SNAP = (15 * Math.PI) / 180; // dragged bonds snap to 15° steps
// Holding still this long with a drawing tool in hand switches to Select until the pointer is released.
const HOLD_MS = 400;
const toPath = (polys: P[][]) => polys.map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z").join("");

// A line, arc or orbital drawn the way arrows are: its kind, its bend for one sweep (signed by the drag), its style.
type Make = { kind: "line" | "arc" | "orbital" | "cut"; bend?: number; style?: Arrow["style"]; orbital?: Arrow["orbital"] };
// A handle: an arrow's ends or middle, or a shape's corners (c1 and c2 are the two it is not drawn from).
type Corner = "from" | "to" | "bend" | "c1" | "c2";
// arrow: an arrow or a shape (they share ids).
type Hover = { atom?: number; bond?: number; caption?: number; arrow?: number; cycle?: number; step?: number };
const hitIn = (m: Mol, p: P): Hover => {
  const atom = atomAt(m, p);
  return atom !== undefined ? { atom } : { bond: bondAt(m, p) };
};
// The atoms an atom or bond hit stands for.
const atomsOf = (m: Mol, t: Hover) => (t.atom !== undefined ? [t.atom] : t.bond !== undefined ? m.bonds[t.bond].atoms : []);

// One pointer gesture. "working" kinds edit a copy of the drawing that commits as one undo step on release.
type Drag =
  | { kind: "bond"; from: number | P; at: P; start: [number, number]; target: Hover; to?: P }
  | { kind: "click"; at: P; start: [number, number]; target: Hover }
  | { kind: "chain"; from: number | P; start: [number, number]; target: Hover; to?: P }
  | { kind: "erase"; trail: P[]; bonds: Set<number>; atoms: Set<number>; captions: Set<number>; start: [number, number]; target: Hover; moved: boolean }
  | { kind: "box"; from: P; to: P; base: Set<number>; picks: Set<number>; target: Hover; moved: boolean }
  | { kind: "lasso"; points: P[]; base: Set<number>; picks: Set<number>; target: Hover; moved: boolean }
  // Moving the selection. If the pointer never moves, the press counts as a click with the tool in hand.
  // captions: where each moving caption starts (drawing coordinates), for captions that do not simply follow their structure.
  // base and atoms: what is moved, when it is not the drawing and the selection (Option-drag moves new copies).
  | { kind: "move"; from: P; working: Mol; moved: boolean; start: [number, number]; target: Hover; guides: Guide[]; point?: P; captions: Map<number, P>; arrows: Set<number>; cycles: Set<number>; textBox?: Box; base?: Mol; atoms?: Set<number> }
  // Drawing an arrow, and dragging one of a picked arrow's handles (an end, or the middle of a curved one).
  | { kind: "arrow"; from: P; start: [number, number]; target: Hover; to?: P; trail?: P[]; side?: number; make?: Make }
  // Drawing a shape from corner to corner.
  | { kind: "shape"; from: P; start: [number, number]; target: Hover; to?: P }
  | { kind: "handle"; id: number; which: Corner; working: Mol }
  // Placing a pen point: where it was pressed, and its outgoing handle if the press was dragged.
  | { kind: "pen"; at: P; start: [number, number]; out?: P }
  // Structure Perspective: tilting atoms through 3D from where they were (base), about their centre, or turning part
  // of a structure about the bond that joins it to the rest (hinge: [inside atom, outside atom]).
  | { kind: "tilt"; base: Mol; ids: Set<number>; centre: [number, number, number]; start: [number, number]; hinge?: [number, number]; working: Mol }
  // Mapping one atom to another with the Atom map tool: from the atom pressed to the pointer.
  | { kind: "map"; atom: number; start: [number, number]; to?: P }
  // Turning the selection by its rotation handle: about its middle, from the angle the drag started at.
  | { kind: "turn"; centre: P; start: number; degrees: number; working: Mol };

// Distance from a point to a polyline, in the polyline's units.
const distToPath = (q: P, path: P[]) => Math.min(...path.slice(1).map((b, i) => {
  const a = path[i], ab: P = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1)));
  return Math.hypot(q[0] - a[0] - ab[0] * t, q[1] - a[1] - ab[1] * t);
}));

// A caption's anchor in drawing coordinates: the start, middle or end of its first baseline.
const anchorOf = (c: Placed): P => [(c.anchor === "start" ? c.box[0] : c.anchor === "end" ? c.box[2] : (c.box[0] + c.box[2]) / 2) / L, -c.lines[0].y / L];
const union = (boxes: Box[]): Box | undefined => boxes.length ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] : undefined;
// The draft caption being typed sorts after every real one.
const DRAFT = Number.MAX_SAFE_INTEGER;
const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;

// Rubbing out: marks every bond within radius r of the pointer's path between two points, and any lone atom.
// Nothing is removed until the pointer is released.
function rub(m: Mol, a: P, b: P, r: number, bonds: Set<number>, atoms: Set<number>) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(0.05, r / 2)));
  for (let k = 0; k <= steps; k++) {
    const p: P = [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
    m.bonds.forEach((_, i) => { if (!bonds.has(i) && bondAt({ ...m, bonds: [m.bonds[i]] }, p, r) === 0) bonds.add(i); });
    m.atoms.forEach((_, i) => { if (!atoms.has(i) && !neighbours(m, i).length && Math.hypot(pos(m, i)[0] - p[0], pos(m, i)[1] - p[1]) < r + 0.1) atoms.add(i); });
  }
}

// Groups ink by colour: one list of polygons per colour, in first-seen order (undefined is the document's ink).
function byColour(items: readonly (readonly [string | undefined, P[][]])[]): [string | undefined, P[][]][] {
  const groups = new Map<string | undefined, P[][]>();
  for (const [colour, polys] of items) { const key = colour?.toLowerCase(); groups.set(key, [...(groups.get(key) ?? []), ...polys]); }
  return [...groups];
}

// A line of rich text as tspans: each run in its style, a subscript 0.212 em down and a superscript 0.33 em up at
// 75% size (as atom labels), each run starting from where the last one left the baseline.
function richSpans(runs: TextRun[], size: number, PT: number) {
  let shift = 0;
  return runs.map((r, k) => {
    const to = r.script === "sub" ? 0.212 * size : r.script === "super" ? -0.33 * size : 0, dy = to - shift;
    shift = to;
    const px = r.size ? r.size * PT : size;
    return (
      <tspan key={k} dy={dy || undefined} fill={r.colour} style={{ fontSize: r.script ? px * 0.75 : px, fontWeight: r.bold ? "bold" : undefined, fontStyle: r.italic ? "italic" : undefined, fontFamily: r.font ? fontStack(r.font) : undefined, textDecoration: r.underline ? "underline" : undefined }}>
        {r.text}
      </tspan>
    );
  });
}

// A pen point: a corner, or (dragged out) a smooth point with its incoming handle mirroring its outgoing one.
const penPoint = (at: P, out?: P): CurvePoint => (out ? { at, c1: [2 * at[0] - out[0], 2 * at[1] - out[1]], c2: out } : { at });

// Text with its formula counts as subscripts (see formulaRuns): 75% size, 0.212 em down, as in atom labels.
const formula = (text: string, size: number) => formulaRuns(text).map((r, k, all) => (
  <tspan key={k} dy={r.sub ? 0.212 * size : k && all[k - 1].sub ? -0.212 * size : undefined} style={r.sub ? { fontSize: 0.75 * size } : undefined}>{r.text}</tspan>
));
const formulaWidth = (text: string, size: number, bold?: boolean, italic?: boolean, family?: string) =>
  formulaRuns(text).reduce((w, r) => w + textWidth(r.text, r.sub ? 0.75 * size : size, bold, italic, family), 0);

export default function Editor() {
  const [loaded, setLoaded] = useState(false);
  const [h, dispatch] = useReducer(history, { stack: [EMPTY], at: 0 });
  const doc = h.stack[h.at];
  const [tool, setTool] = useState<Tool>("bond");
  // The drawing tool to go back to when a hold-to-select gesture ends.
  const [spring, setSpring] = useState<Tool>();
  const [view, setView] = useState(() => ({ x: innerWidth / 2, y: innerHeight / 2, zoom: OPEN_ZOOM / frameStyle(readStyle(loadSettings().docStyle), L).k }));
  const [hover, setHover] = useState<Hover>({});
  const [selection, setSelection] = useState<Set<number>>(new Set());
  // Captions picked, by id. Atoms and captions are selected separately and move, delete and copy together.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<Drag>();
  const [notice, setNotice] = useState<string>();
  // The hold-to-select switch: the tool icon pops and a ring pops at the pointer. pop.n restarts the animations.
  const [pop, setPop] = useState<{ n: number; x: number; y: number }>();
  const [cursor, setCursor] = useState<string>();
  const [settings, setSettings] = useState(loadSettings);
  const bondKind = (settings.variants.bond in BONDS ? settings.variants.bond : "single") as BondKind;
  // The user's own rings, and the one in hand (a built-in RingKind or a template's kind).
  const templates = useMemo(() => loadTemplates(settings.templates), [settings.templates]);
  const ringKind = settings.variants.ring in RINGS || templates.some((t) => templateKind(t.id) === settings.variants.ring) || libraryItem(settings.variants.ring) ? settings.variants.ring : "benzene";
  const [renaming, setRenaming] = useState<string>();
  function addRingTemplate(name: string, mol: Mol) {
    const t = newTemplate(name, mol);
    setSettings((s) => ({ ...s, templates: [...s.templates, t], variants: { ...s.variants, ring: templateKind(t.id) } }));
    setTool("ring");
    return t;
  }
  function removeRingTemplate(id: string) {
    setSettings((s) => ({
      ...s,
      templates: s.templates.filter((t) => t.id !== id),
      pinned: s.pinned.filter((k) => k !== `ring:${templateKind(id)}`),
      variants: s.variants.ring === templateKind(id) ? { ...s.variants, ring: "benzene" } : s.variants,
    }));
  }
  // The selection becomes a ring template; its name is typed in the ring list straight away.
  const addSelectionAsRing = () => {
    if (!selection.size) return;
    setRenaming(addRingTemplate(`Ring ${templates.length + 1}`, subset(doc, selection)).id);
  };
  const selectKind = (settings.variants.select in SELECTS ? settings.variants.select : "box") as SelectKind;
  const symbolKind = (settings.variants.symbol in SYMBOLS ? settings.variants.symbol : "plus") as SymbolKind;
  // The template in hand: a library one or the user's own.
  const templateMol = (kind: string) => templates.find((x) => templateKind(x.id) === kind)?.mol ?? libraryItem(kind)?.mol;
  const templateVariant = templateMol(settings.variants.template) ? settings.variants.template : "lib:Alanine";
  // The Shape and Bracket tools' choices. A line or arc from the Shape tool is drawn like an arrow, with no head.
  const shapeChoice = shapeSpec(settings.variants.shape) ? settings.variants.shape : "box-plain";
  const bracketChoice = bracketSpec(settings.variants.bracket) ? settings.variants.bracket : "brackets";
  const shapePick = shapeSpec(shapeChoice)!, bracketPick = bracketSpec(bracketChoice)!;
  const orbitalChoice = orbitalSpec(settings.variants.orbital) ? settings.variants.orbital : "p-shaded";
  // A clicked orbital's tip: s orbitals a third of a bond across, lobes most of a bond long, pointing up, or for a
  // single lobe or hybrid on an atom, out into the atom's widest gap.
  const orbitalTip = (make: Make, from: P, t: Hover): P => {
    const shape = make.orbital?.shape, length = shape === "s" || shape === "oval" ? 0.35 : 0.85;
    const d = (shape === "lobe" || shape === "hybrid") && t.atom !== undefined ? nextDirection(doc, t.atom) : [0, 1];
    return [from[0] + d[0] * length, from[1] + d[1] * length];
  };
  // The shape a drag from one point to another makes with the tool in hand. A circle grows out from where it starts.
  const shapeFrom = (from: P, to: P): Omit<Shape, "id"> | undefined => {
    // A TLC plate gets a lane for about every 1.6 bond lengths of its width.
    if (tool === "tlc") return { kind: "tlc", from, to, tlc: { lanes: Math.max(1, Math.round(Math.abs(to[0] - from[0]) / 1.6)), spots: [] } };
    // A table gets a column for about every 2.2 bond lengths of its width and a row for every 0.9 of its height.
    if (tool === "table") {
      const cols = Math.max(2, Math.min(12, Math.round(Math.abs(to[0] - from[0]) / 2.2))), rows = Math.max(2, Math.min(40, Math.round(Math.abs(to[1] - from[1]) / 0.9)));
      return { kind: "table", from: [Math.min(from[0], to[0]), Math.max(from[1], to[1])], to: [Math.max(from[0], to[0]), Math.min(from[1], to[1])], table: newTable(rows, cols) };
    }
    const spec = tool === "bracket" ? bracketPick : shapePick;
    if (!("shape" in spec)) return undefined;
    const style = { ...("dashed" in spec && spec.dashed ? { dashed: true } : {}), ...("fill" in spec && spec.fill ? { fill: spec.fill } : {}), ...("shadow" in spec && spec.shadow ? { shadow: true } : {}), ...("side" in spec && spec.side ? { side: spec.side } : {}) };
    if ("circle" in spec && spec.circle) { const r = Math.hypot(to[0] - from[0], to[1] - from[1]); return { kind: "oval", from: [from[0] - r, from[1] - r], to: [from[0] + r, from[1] + r], ...style }; }
    return { kind: spec.shape, from, to, ...style };
  };
  const arrowPick = arrowVariant(settings.variants.arrow) ?? { kind: "reaction" as ArrowKind };
  const arrowKind = arrowPick.kind;
  // A new arrow of the kind in hand. A curved one is an arc of the sweep in hand, bent to the left of its line, or
  // to the right (side -1) when the drag curved that way.
  const newArrow = (from: P, to: P, side = 1, make?: Make): Omit<Arrow, "id"> => (make
    ? { ...make, from, to, ...(make.bend ? { bend: side * make.bend } : {}) }
    : { kind: arrowKind, from, to, ...(curved({ kind: arrowKind }) ? { bend: side * sweepBend(arrowPick.sweep ?? 120) } : {}) });
  // The offered sweep nearest an arc's.
  const nearestSweep = (bend: number) => SWEEPS.reduce((best, s) => (Math.abs(s - sweepOf(bend)) < Math.abs(best - sweepOf(bend)) ? s : best));
  const bondSpec: BondSpec = BONDS[bondKind].spec;
  const [overSelection, setOverSelection] = useState(false);
  // Where the eraser outline is drawn (drawing coordinates), while the Eraser is in hand.
  const [brush, setBrush] = useState<P>();
  // The atom whose label is being typed, and the text so far.
  const [editing, setEditing] = useState<{ atom: number; value: string }>();
  const labelOpen = useRef(false);
  const editLabel = (atom: number) => {
    const a = doc.atoms[atom];
    labelOpen.current = true;
    setEditing({ atom, value: a.text ?? (a.label === "C" ? "" : a.label) });
  };
  // The caption being typed: an existing one (id), or a new one at a point or under a structure, with its style.
  // runs: the text in styled runs as it is typed; version and caret: the box is built again (a style was applied)
  // with the selection there; pending: a style set with nothing selected, for the next characters typed.
  type Writing = { id?: number; value: string; at?: P; under?: number[]; on?: Caption["on"]; cycle?: CycleText; style: Partial<Caption>;
    runs?: TextRun[]; version?: number; caret?: [number, number]; pending?: RunStyle };
  const [writing, setWriting] = useState<Writing>();
  // True while the caption box is open. Enter, Escape and blur all close it; only the first one counts.
  const writingOpen = useRef(false);
  // The style new text starts with, set from the Actions panel while the Text tool is in hand.
  const [textStyle, setTextStyle] = useState<Partial<Caption>>({});
  const openWriting = (w: Writing) => { writingOpen.current = true; setWriting(w); };
  const richApi = useRef<RichApi>(undefined);
  // The caret moving in the box changes what the Actions panel shows as on (Bold, Subscript and so on).
  const [, setCaretTick] = useState(0);
  useEffect(() => {
    if (!writing) return;
    const tick = () => setCaretTick((n) => n + 1);
    document.addEventListener("selectionchange", tick);
    return () => document.removeEventListener("selectionchange", tick);
  }, [!!writing]); // eslint-disable-line react-hooks/exhaustive-deps
  // The curve the Pen is drawing (its points so far), and where the pointer is, for the segment to it.
  const [pen, setPen] = useState<CurvePoint[]>();
  const [penAt, setPenAt] = useState<P>();
  // The table cell being typed in: its table, row and column, and the text so far.
  const [cell, setCell] = useState<{ id: number; r: number; c: number; value: string }>();
  const cellOpen = useRef(false);
  const cellInput = useRef<HTMLInputElement>(null);
  useEffect(() => { cellInput.current?.select(); }, [cell?.id, cell?.r, cell?.c]);
  useEffect(() => { selectCursor.then(setCursor); }, []);
  const [turnCursor, setTurnCursor] = useState<string>();
  useEffect(() => { rotateCursor.then(setTurnCursor); }, []);
  const [overTurn, setOverTurn] = useState(false); // the pointer is on the selection's rotation handle
  const hold = useRef<number>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const pointer = useRef<P>(undefined);
  // Every edit clears the selection, except a move, which keeps the same atoms selected.
  const set = (mol: Mol, keepSelection = false, merge?: string) => {
    dispatch({ type: "set", mol, merge });
    if (!keepSelection) { setSelection(new Set()); setPicked(new Set()); }
  };
  const undo = (redo = false) => { dispatch({ type: redo ? "redo" : "undo" }); setSelection(new Set()); setPicked(new Set()); };
  // The file on disk and the drawing as last saved. Undoing back to the saved drawing makes it clean again.
  const [file, setFile] = useState<{ path?: string; saved: Mol }>({ saved: EMPTY });
  const dirty = doc !== file.saved;

  useEffect(() => { ready.then(() => setLoaded(true)); }, []);
  // Name to structure loads in the background once the window has settled.
  const [namesLoaded, setNamesLoaded] = useState(false);
  // The names engine loads in the background soon after start, so Structure to name is ready when first asked.
  useEffect(() => { const t = setTimeout(() => void loadNames().then(() => setNamesLoaded(true)).catch(() => {}), 1500); return () => clearTimeout(t); }, []);
  useEffect(() => { const t = setTimeout(() => loadNames().then(() => setNamesLoaded(true)), 1500); return () => clearTimeout(t); }, []);
  // The text in the name-to-structure field, while it is open.
  const [naming, setNaming] = useState<string>();
  // Names drawn before: five under the field, or all fifty when opened. at: the row the arrow keys are on.
  const [recent, setRecent] = useState<{ all: boolean; at: number }>({ all: false, at: -1 });
  useEffect(() => setRecent({ all: false, at: -1 }), [naming === undefined]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each name is kept with its structure (as SMILES), so it draws again whatever happens to the name lists.
  const rememberName = (name: string, frag: Mol) => {
    let smiles = "";
    try { smiles = toSmiles(frag); } catch { /* kept by name alone */ }
    setSettings((s) => ({ ...s, nameHistory: [{ name, smiles }, ...s.nameHistory.filter((n) => n.name.toLowerCase() !== name.toLowerCase())].slice(0, 50) }));
  };
  const historyMols = useRef(new Map<string, Mol | undefined>());
  const nameField = useRef<HTMLInputElement>(null);
  // A structure for a chemical name, laid out, or undefined.
  const structureFor = (name: string): Mol | undefined => {
    const smiles = loaded && namesLoaded ? nameToSmiles(name) : undefined;
    if (!smiles) return undefined;
    try { const m = parseStructure(smiles); return m.atoms.length ? m : undefined; } catch { return undefined; }
  };
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(undefined), 4000); return () => clearTimeout(t); } }, [notice]);
  // After an edit, the thing under a still pointer may have changed.
  useEffect(() => { if (pointer.current) setHover(hit(pointer.current)); }, [doc]);

  const name = file.path?.split(/[\\/]/).pop()?.replace(/\.octet$/, "") ?? "Untitled";
  useEffect(() => { if (TAURI) getCurrentWindow().setTitle(dirty ? `${name} (edited)` : name); }, [name, dirty]);

  async function save(as: boolean) {
    try {
      const path = await invoke<string | null>("save_drawing", { path: as ? null : (file.path ?? null), contents: serialize(doc) });
      if (path) setFile({ path, saved: doc });
    } catch (e) {
      setNotice(`Octet cannot save this drawing. ${e}`);
    }
  }
  async function open() {
    try {
      const picked = await invoke<[string, string] | null>("open_drawing");
      if (!picked) return;
      const mol = parse(picked[1]);
      set(mol);
      setFile({ path: picked[0], saved: mol });
      const b = bounds(mol);
      if (b) setView((v) => ({ ...v, x: innerWidth / 2 - ((b[0] + b[2]) / 2) * v.zoom * L, y: innerHeight / 2 + ((b[1] + b[3]) / 2) * v.zoom * L }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : `Octet cannot open this file. ${e}`);
    }
  }
  // Import a structure file: it lands to the right of the drawing (or in the middle of an empty canvas), selected.
  async function importFile() {
    try {
      const picked = await invoke<[string, string] | null>("import_structure");
      if (!picked) return;
      place(importStructure(picked[1]));
    } catch (e) {
      setNotice(e instanceof Error ? `Octet cannot read this file. ${e.message}` : String(e));
    }
  }
  // Where a new fragment goes: beside the drawing, or centred in an empty view (or centred on a given point).
  // Where a pasted or named structure goes: to the right of everything drawn (arrows, shapes and text too). Just
  // after a reaction arrow it lands as the product: on the arrow's level, at the reaction's spacing.
  function landing(frag: Mol, at?: P): P {
    const f = bounds(frag)!, d = bounds(doc);
    if (at) return [at[0] - (f[0] + f[2]) / 2, at[1] - (f[1] + f[3]) / 2];
    const ends = [
      ...(d ? [{ x: d[2], level: (d[1] + d[3]) / 2, arrow: false }] : []),
      ...arrows.filter((a) => !isOrbital(a)).map((a) => ({ x: Math.max(a.from[0], a.to[0]), level: (a.from[1] + a.to[1]) / 2, arrow: straightArrow(a) })),
      ...(doc.shapes ?? []).map((sh) => ({ x: Math.max(sh.from[0], sh.to[0]), level: (sh.from[1] + sh.to[1]) / 2, arrow: false })),
      ...placed.filter((c) => c.id !== DRAFT).map((c) => ({ x: c.box[2] / L, level: -(c.box[1] + c.box[3]) / 2 / L, arrow: false })),
    ];
    if (!ends.length) { const c = toDoc(innerWidth / 2, innerHeight / 2); return [c[0] - (f[0] + f[2]) / 2, c[1] - (f[1] + f[3]) / 2]; }
    const last = ends.reduce((p, q) => (q.x > p.x + 1e-6 || (Math.abs(q.x - p.x) < 1e-6 && q.arrow) ? q : p));
    const level = last.arrow ? last.level : d ? (d[1] + d[3]) / 2 : last.level;
    return [last.x + (last.arrow ? GAP : 1.5) - f[0], level - (f[1] + f[3]) / 2];
  }
  // Puts a new fragment in place and selects it.
  function place(frag: Mol, base: Mol = doc, at?: P) {
    if (!frag.atoms.length) throw new Error("It has no atoms.");
    set(merge(base, frag, landing(frag, at)));
    setSelection(new Set(frag.atoms.map((_, i) => base.atoms.length + i)));
  }
  // Name to structure: a picked caption that is a name becomes its structure, in its place. Otherwise the
  // name field opens (with the caption's text, if it was not a name).
  function nameToStructure() {
    const c = picked.size === 1 && !selection.size ? doc.captions?.find((x) => picked.has(x.id)) : undefined;
    const fixed = c && suggestName(c.text);
    const frag = c && (structureFor(c.text) ?? (fixed ? structureFor(fixed) : undefined)), p = c && placed.find((x) => x.id === c.id);
    if (c && frag && p) return place(frag, deleteGraphics(doc, new Set([c.id])), [(p.box[0] + p.box[2]) / 2 / L, -(p.box[1] + p.box[3]) / 2 / L]);
    void loadNames().then(() => setNamesLoaded(true));
    setNaming(c?.text ?? "");
  }
  // Menu commands. New and Open go on the undo list, so they never lose work.
  const commands = useRef<Record<string, () => void>>({});
  commands.current = {
    new: () => { set(EMPTY); setFile({ saved: EMPTY }); },
    open: () => void open(),
    import: () => void importFile(),
    save: () => void save(false),
    save_as: () => void save(true),
    // While a label or caption is being typed, the Edit menu works on its text.
    undo: () => (typing() ? void document.execCommand("undo") : undo()),
    redo: () => (typing() ? void document.execCommand("redo") : undo(true)),
    select_all: () => {
      if (typing()) return (document.activeElement as HTMLInputElement).select();
      // Everything, as ChemDraw's Select All: structures, text, arrows, orbitals, shapes, brackets and cycles.
      setSelection(new Set(doc.atoms.map((_, i) => i)));
      setPicked(new Set([...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].map((x) => x.id)));
    },
    snap: () => setSettings((s) => ({ ...s, snap: !s.snap })),
    // Structure commands act on the selection, or on the whole drawing when nothing is selected.
    clean_up: () => {
      if (!loaded || !doc.atoms.length) return;
      const ids = selection.size ? selection : undefined;
      let m = cleanUp(doc, ids);
      // Several structures that overlap, or have a plus sign among them, go in a row like a reaction's starting
      // materials. With a plus sign, an arrow after them is offered: Tab draws it.
      const d = render(m, frame, measure, L), docBox = (b?: Box): Box | undefined => b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
      const row = rowOf(m, ids, (atoms) => docBox(union(atoms.filter((i) => d.ink[i]).map((i) => d.ink[i]))), (id) => docBox(placed.find((c) => c.id === id)?.box));
      if (row) {
        const laid = layoutRow(m, row.steps);
        m = laid.mol;
        const ahead = (doc.arrows ?? []).some((a) => !curved(a) && Math.min(a.from[0], a.to[0]) > laid.right - 0.5 && Math.abs((a.from[1] + a.to[1]) / 2 - laid.level) < 1.5);
        if (row.plus && !ahead) setOffer({ from: [laid.right + GAP, laid.level], to: [laid.right + GAP + 3, laid.level], doc: m });
      }
      set(m, true);
    },
    // ChemDraw's Rotate 180° Horizontal and Vertical (⇧⌘H, ⇧⌘V: stereo kept), and its Flip (a mirror image).
    flip_h: () => set(flipAtoms(doc, selection.size ? selection : new Set(doc.atoms.map((_, i) => i)), "horizontal"), true),
    flip_v: () => set(flipAtoms(doc, selection.size ? selection : new Set(doc.atoms.map((_, i) => i)), "vertical"), true),
    mirror_h: () => set(flipAtoms(doc, selection.size ? selection : new Set(doc.atoms.map((_, i) => i)), "horizontal", true), true),
    mirror_v: () => set(flipAtoms(doc, selection.size ? selection : new Set(doc.atoms.map((_, i) => i)), "vertical", true), true),
    // Add Frame (Object menu): a frame round everything selected, 0.4 bond lengths clear of it (0.3 for brackets).
    ...Object.fromEntries(([["frame_brackets", "brackets", false], ["frame_parens", "parens", false], ["frame_braces", "braces", false], ["frame_box", "box", false],
      ["frame_rounded", "rounded", false], ["frame_box_shadow", "box", true], ["frame_rounded_shadow", "rounded", true]] as const).map(([id, kind, shadow]) => [id, () => {
      const boxes = [...[...selection].filter((i) => drawing.ink[i]).map((i) => drawing.ink[i]), ...placed.filter((c) => picked.has(c.id)).map((c) => c.box),
        ...[...arrows, ...(doc.shapes ?? [])].filter((x) => picked.has(x.id)).map((x): Box => [Math.min(x.from[0], x.to[0]) * L, -Math.max(x.from[1], x.to[1]) * L, Math.max(x.from[0], x.to[0]) * L, -Math.min(x.from[1], x.to[1]) * L])];
      const b = boxes.length ? union(boxes) : undefined;
      if (!b) return setNotice("Select what to frame first.");
      const pad = (isBracket({ kind }) ? 0.3 : 0.4) * L;
      const [mol, frameId] = addShape(doc, { kind, from: [(b[0] - pad) / L, -(b[3] + pad) / L], to: [(b[2] + pad) / L, -(b[1] - pad) / L], ...(shadow ? { shadow: true } : {}) });
      set(mol);
      setPicked(new Set([frameId]));
    }])),
    // Structure Perspective (⌥⌘S): a 3D structure drawn with depth (nearer bonds wider and darker) or flat. Flatten
    // (Object menu): the selected atoms lose their depth and keep where they are drawn.
    structure_perspective: () => {
      const atoms = selection.size ? fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat() : doc.atoms.map((_, i) => i);
      const off = atoms.some((i) => doc.atoms[i].depth === false);
      set({ ...doc, atoms: doc.atoms.map((a, i) => (atoms.includes(i) ? { ...a, depth: off ? undefined : false } : a)) }, true);
    },
    flatten: () => set(flattenAtoms(doc, selection.size ? selection : new Set(doc.atoms.map((_, i) => i))), true),
    // Align (⇧⌥⌘ L, C, R, T, M, B) and Distribute (⇧⌥⌘ H, V), as ChemDraw's Object menu: every selected structure,
    // group and object is one thing; they line up on the one highest on the page, or space out evenly between the
    // two at the ends.
    ...Object.fromEntries((["left", "centre", "right", "top", "middle", "bottom", "across", "down"] as const).map((how) => [`arrange_${how}`, () => arrange(how)])),
    // Rotate… (⌘R) and Scale… (⌘K), as ChemDraw's.
    rotate_dialog: () => setDialog({ kind: "rotate", angle: "90", clockwise: false }),
    scale_dialog: () => setDialog({ kind: "scale", how: "document", value: "100" }),
    // Group (⌘G) and Ungroup (⇧⌘G), as ChemDraw's: the selected structures and objects select and move as one.
    group: () => {
      const r = groupSelection(doc, selection, picked);
      if (!r) return setNotice("Select two or more things to group.");
      set(r[0], true);
    },
    ungroup: () => set(ungroupSelection(doc, selection, picked), true),
    group_integral: () => {
      const touched = new Set(groupsOf(doc, selection, picked)), on = [...touched].every((g) => g.integral);
      set({ ...doc, groups: doc.groups?.map((g) => (touched.has(g) ? { ...g, integral: on ? undefined : true } : g)) }, true);
    },
    // Invert Selection (⇧⌘I): everything that was not selected is, and the rest is not.
    invert_selection: () => {
      setSelection(new Set(doc.atoms.map((_, i) => i).filter((i) => !selection.has(i))));
      setPicked(new Set([...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].map((x) => x.id).filter((id) => !picked.has(id))));
    },
    // Clean Up Reaction (⇧⌘X): the picked reaction, or the reaction around the one arrow picked.
    clean_reaction: () => {
      const arrow = reactionPicked()?.arrows[0] ?? [...picked].find((id) => arrows.some((a) => a.id === id && straightArrow(a)));
      const r = arrow !== undefined ? reactionOf(arrow) : undefined;
      return r ? set(cleanUpReaction(doc, r, arrows), true) : setNotice("Pick a reaction arrow first.");
    },
    // Zoom about the middle of the window. Actual size is 100%: bonds at their true 14.4 pt.
    zoom_in: () => zoomTo(view.zoom * 1.25),
    zoom_out: () => zoomTo(view.zoom / 1.25),
    zoom_actual: () => zoomTo(1 / frame.k),
    actions: () => setSettings((s) => ({ ...s, actions: !s.actions })),
    name_to_structure: () => nameToStructure(),
    document: () => setSettingsOpen("document"),
    settings: () => setSettingsOpen((settings.settingsModule as ModuleId) ?? "document"),
    structure_to_name: () => nameStructures(),
    copy_smiles: () => void document.execCommand("copy"),
    bring_front: () => runAction("shape.front"),
    send_back: () => runAction("shape.back"),
    command_palette: () => { setCommandsOpen((o) => !o); if (!namesLoaded) void loadNames().then(() => setNamesLoaded(true)); },
    // The Text menu styles the caption being typed, or the picked captions.
    text_bold: () => runAction("caption.bold"),
    text_plain: () => runAction("caption.plain"),
    text_sub: () => runAction("caption.sub"),
    text_super: () => runAction("caption.super"),
    text_formula: () => runAction("caption.formula"),
    ...Object.fromEntries(FONTS.map((f, k) => [`font_${k}`, () => runAction(`caption.font.${f}`)])),
    text_italic: () => runAction("caption.italic"),
    text_underline: () => runAction("caption.underline"),
    align_left: () => restyle(() => ({ align: "left" })),
    align_centre: () => restyle(() => ({ align: "centre" })),
    align_right: () => restyle(() => ({ align: "right" })),
    // The Curves menu: line styles, heads at either end (again takes one off), and a closed curve's fill.
    ...Object.fromEntries(["plain", "dashed", "bold", "doubled"].map((st) => [`curves_${st}`, () => runAction(`arrow.style.${st}`)])),
    ...Object.fromEntries((["start", "end"] as const).flatMap((at) => (["full", "left", "right"] as const).map((h) => [`curves_${at}_${h}`, () => runAction(`arrow.${at}.${h}`)]))),
    curves_closed: () => runAction("arrow.closed"),
    ...Object.fromEntries(["solid", "shaded", "faded"].map((f) => [`curves_${f}`, () => runAction(`arrow.fill.${f}`)])),
    // The Colour menu: each colour in COLOURS by its place, and Other Colour… for the system picker.
    ...Object.fromEntries(COLOURS.map(([, hex], k) => [`colour_${k}`, () => runAction(`colour.${hex}`)])),
    ...Object.fromEntries(settings.palette.map((c, k) => [`colour_user_${k}`, () => runAction(`colour.${c.hex}`)])),
    colour_other: () => setSettingsOpen("colours"),
    colours_add: () => { setAddingColour(true); setSettingsOpen("colours"); },
    ...Object.fromEntries([8, 9, 10, 12, 14, 18, 24].map((pt) => [`size_${pt}`, () => restyle(() => ({ size: pt === style.captionSize ? undefined : pt }))])),
    zoom_fit: () => {
      const b = bounds(doc);
      if (!b) return setView({ x: innerWidth / 2, y: innerHeight / 2, zoom: OPEN_ZOOM / frame.k });
      const free = [innerWidth - 160, innerHeight - 120], size = [(b[2] - b[0] + 1) * L, (b[3] - b[1] + 1) * L];
      const zoom = Math.min(8, Math.max(0.25, Math.min(free[0] / size[0], free[1] / size[1])));
      setView({ zoom, x: innerWidth / 2 - ((b[0] + b[2]) / 2) * L * zoom, y: innerHeight / 2 + ((b[1] + b[3]) / 2) * L * zoom });
    },
  };
  function zoomTo(target: number) {
    const zoom = Math.min(8, Math.max(0.25, target)), k = zoom / view.zoom, cx = innerWidth / 2, cy = innerHeight / 2;
    setView({ zoom, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k });
  }
  // Keep the setting on disk and the View menu tick in step with it.
  useEffect(() => {
    saveSettings(settings);
    if (TAURI) invoke("set_check", { id: "snap", checked: settings.snap }).catch(() => {});
  }, [settings]);
  // The Colour menu lists the user's colours by name: the menu bar is built again when they change.
  const paletteNames = settings.palette.map((c) => c.name).join("\n");
  useEffect(() => {
    if (TAURI) invoke("set_palette", { names: settings.palette.map((c) => c.name) }).then(() => invoke("set_check", { id: "snap", checked: settings.snap })).catch(() => {});
  }, [paletteNames]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!TAURI) return;
    const off = listen<string>("menu", (e) => commands.current[e.payload]?.());
    return () => { off.then((f) => f()); };
  }, []);

  // Screen (px from the window's top left) to drawing coordinates (bond lengths, y up).
  const toDoc = (sx: number, sy: number): P => [(sx - view.x) / (view.zoom * L), -(sy - view.y) / (view.zoom * L)];

  const shown = useMemo(() => {
    if (drag?.kind === "bond" && drag.to) return bondTo(doc, drag.from, drag.to, bondSpec);
    if (drag?.kind === "chain" && drag.to) return chainTo(doc, drag.from, drag.to).mol;
    if (drag?.kind === "move" || drag?.kind === "handle" || drag?.kind === "turn" || drag?.kind === "tilt") return drag.working;
    if (drag?.kind === "arrow" && drag.to) return addArrow(doc, newArrow(drag.from, drag.to, drag.side, drag.make))[0];
    if (drag?.kind === "shape" && drag.to) { const sh = shapeFrom(drag.from, drag.to); return sh ? addShape(doc, sh)[0] : doc; }
    if (pen || drag?.kind === "pen") {
      // The curve so far, with the point being placed (or a straight run to the pointer).
      const now = drag?.kind === "pen" ? penPoint(drag.at, drag.out) : penAt ? { at: penAt } : undefined, points = [...(pen ?? []), ...(now ? [now] : [])];
      if (points.length >= 2) return addArrow(doc, { kind: "curve", from: points[0].at, to: points[points.length - 1].at, curve: { points } })[0];
    }
    return doc;
  }, [doc, drag, pen, penAt]); // eslint-disable-line react-hooks/exhaustive-deps
  // The document's style (or the default for new documents), as widths and sizes in the drawing frame.
  const style: DocStyle = useMemo(() => readStyle(doc.style ?? settings.docStyle), [doc.style, settings.docStyle]);
  const frame = useMemo(() => frameStyle(style, L), [style]);
  const measure = useMemo(() => measurer(fontStack(style.labelFont), frame.size), [style.labelFont, frame.size]);
  const pt = (4 / 3) * frame.k; // frame px per point
  // A new bond length keeps the drawing the same size on screen relative to its true size.
  const lastK = useRef(frame.k);
  useEffect(() => { if (lastK.current !== frame.k) { const r = lastK.current / frame.k; lastK.current = frame.k; setView((v) => ({ ...v, zoom: v.zoom * r })); } }, [frame.k]);
  const drawing = useMemo(() => render(shown, frame, measure, L), [shown, frame, measure]);
  // Pages, in bond lengths: the document's page, then the rest of its series, all turned the same way.
  const mm = ((72 / 25.4) * (4 / 3) * frame.k) / L;
  // The page's background. On a dark or blue page, structures and default-coloured text are white.
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const q = matchMedia("(prefers-color-scheme: dark)"), on = () => setSystemDark(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  const paper = style.background === "system" ? (systemDark ? "dark" : "white") : style.background;
  const darkPaper = paper === "dark" || paper === "blueprint";
  const textInk = (c: string) => (darkPaper && /^#(000000|0f172a)$/i.test(c) ? "#FFFFFF" : c);
  const pages = useMemo(() => {
    const series = ["A4", "A3", "A2"].includes(style.page) ? SERIES.iso : ["Letter", "Legal", "Tabloid"].includes(style.page) ? SERIES.us : [style.page];
    return [style.page, ...series.filter((name) => name !== style.page)].map((name) => {
      const [w, h] = name === style.page ? pageSize(style) : pageSize({ ...style, page: name });
      const label = name === "Custom" ? `${Math.round(w)} × ${Math.round(h)} mm` : PAGE_NAMES[name].replace("US ", "");
      return [label, w, h] as [string, number, number];
    });
  }, [style]);
  // The page whose edge is under a point (drawing coordinates), within a few screen px.
  const pageEdgeAt = (p: P) => pages.find(([, w, h]) => {
    const [x, y] = [(w / 2) * mm, (h / 2) * mm], dx = Math.abs(Math.abs(p[0]) - x), dy = Math.abs(Math.abs(p[1]) - y), near = 5 / (view.zoom * L);
    return (dx < near && Math.abs(p[1]) <= y + near) || (dy < near && Math.abs(p[0]) <= x + near);
  });
  const [pageHover, setPageHover] = useState<string>();
  // The Settings window, open at a module.
  const [settingsOpen, setSettingsOpen] = useState<ModuleId>();
  const [addingColour, setAddingColour] = useState(false); // Settings opened from a colour row's +, to add a colour
  // Object > Rotate… (⌘R) and Scale… (⌘K): the dialog open, and what is typed in it.
  const [dialog, setDialog] = useState<{ kind: "rotate"; angle: string; clockwise: boolean } | { kind: "scale"; how: "document" | "length" | "percent"; value: string }>();
  const [commandsOpen, setCommandsOpen] = useState(false);
  // An arrow Octet offers after a row of starting materials (from Clean up). Tab draws it; any other change drops it.
  const [offer, setOffer] = useState<{ from: P; to: P; doc: Mol }>();
  useEffect(() => { if (offer && offer.doc !== doc) setOffer(undefined); }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const docOpen = settingsOpen === "document";
  // The Document window's preview: paracetamol with its compound number, drawn in the style at 125% of true size
  // (smaller if it would not fit), so a change of preset shows as a change of size.
  const sample = useMemo(() => (loaded && docOpen ? parseStructure("CC(=O)Nc1ccc(O)cc1") : undefined), [loaded, docOpen]);
  const preview = useMemo(() => {
    if (!sample) return null;
    const m: Mol = { ...sample, captions: [{ id: 1, text: "1", x: 0, y: 0, bold: true, under: sample.atoms.map((_, i) => i) }] };
    const d = render(m, frame, measure, L);
    const width = (t: string, c: Caption) => textWidth(t, (c.size ?? style.captionSize) * pt, c.bold, c.italic, fontStack(style.captionFont));
    const [cap] = placeCaptions(m, d, width, [], pt, style.captionSize);
    const box = [Math.min(d.box[0], cap.box[0]), Math.min(d.box[1], cap.box[1]), Math.max(d.box[2], cap.box[2]), Math.max(d.box[3], cap.box[3]) + frame.size * 0.3];
    const scale = Math.min(OPEN_ZOOM / frame.k, 112 / (box[3] - box[1]), 420 / (box[2] - box[0]));
    return (
      <svg width={(box[2] - box[0]) * scale} height={(box[3] - box[1]) * scale} viewBox={`${box[0]} ${box[1]} ${box[2] - box[0]} ${box[3] - box[1]}`}>
        <path d={toPath(d.polygons)} fill="#000" />
        {d.labels.map((l, i) => <text key={i} x={l.x} y={l.y} fill="#000" style={{ font: `${l.size}px ${fontStack(style.labelFont)}` }}>{l.text}</text>)}
        <text x={cap.lines[0].x} y={cap.lines[0].y} textAnchor="middle" fill={style.colour} style={{ font: `bold ${cap.size}px ${fontStack(style.captionFont)}` }}>1</text>
      </svg>
    );
  }, [sample, frame, measure, style, pt]);
  // Moves the view smoothly (or at once, with reduced motion).
  const flight = useRef<number>(undefined);
  function flyTo(to: { x: number; y: number; zoom: number }) {
    cancelAnimationFrame(flight.current!);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setView(to);
    const from = view, t0 = performance.now(), duration = 320;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration), e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      setView({ zoom: from.zoom * (to.zoom / from.zoom) ** e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (t < 1) flight.current = requestAnimationFrame(step);
    };
    flight.current = requestAnimationFrame(step);
  }
  // A click on a page's edge fits that page in the window, centred.
  const fitPage = ([, w, h]: [string, number, number]) =>
    flyTo({ x: innerWidth / 2, y: innerHeight / 2, zoom: Math.min((innerWidth - 160) / (w * mm * L), (innerHeight - 48) / (h * mm * L)) });
  // The structure for the name being typed, drawn faintly where it will land.
  // A suggestion when the text is not a name: from the common names straight away, or (after a pause in typing)
  // from every name one keystroke away.
  const quick = useMemo(() => (naming === undefined || !namesLoaded ? undefined : suggestName(naming, false)), [naming, namesLoaded]);
  const [thorough, setThorough] = useState<{ typed: string; name?: string }>();
  useEffect(() => {
    if (naming === undefined || quick || !namesLoaded) return;
    const t = setTimeout(() => setThorough({ typed: naming, name: suggestName(naming) }), 150);
    return () => clearTimeout(t);
  }, [naming, quick, namesLoaded]);
  const suggestion = quick ?? (thorough && thorough.typed === naming ? thorough.name : undefined);
  const named = useMemo(
    () => (naming === undefined ? undefined : structureFor(naming) ?? (suggestion ? structureFor(suggestion) : undefined)),
    [naming, suggestion, namesLoaded, loaded],
  );
  // Captions as laid out, with the caption being typed in place of its saved text (or added, if it is new).
  // Arrows grow to fit their conditions, including conditions being typed.
  const { placed, arrows, cycleArrows } = useMemo(() => {
    let m = shown;
    const runs = writing?.runs && styled(writing.runs) && plainOf(writing.runs) ? writing.runs : undefined;
    if (writing?.id !== undefined) m = updateCaption(m, writing.id, { text: writing.value || " ", ...writing.style, runs });
    else if (writing) m = { ...m, captions: [...(m.captions ?? []), { id: DRAFT, text: writing.value || " ", x: writing.at?.[0] ?? 0, y: writing.at?.[1] ?? 0, under: writing.under, on: writing.on, cycle: writing.cycle, ...writing.style, runs }] };
    // A line's width: each run in its own font, size and style (rich text), or the caption's own.
    const width = (t: string, c: Caption, j = 0) => {
      const px = (c.size ?? style.captionSize) * pt;
      if (c.runs) return (richLines(c.runs)[j] ?? []).reduce((w, r) => w + textWidth(r.text, (r.size ? r.size * pt : px) * (r.script ? 0.75 : 1), r.bold ?? c.bold, r.italic ?? c.italic, fontStack(r.font ?? c.font ?? style.captionFont)), 0);
      return (c.on || c.cycle ? formulaWidth : textWidth)(t, px, c.bold, c.italic, fontStack(c.font ?? style.captionFont));
    };
    const fitted = fitArrows(m, L, (c) => Math.max(...c.text.split("\n").map((t, j) => width(t, c, j))), pt);
    // Catalytic cycles: their arcs, side arrows and labels follow wherever their intermediates are.
    const cycles = layoutCycles(m, L, pt, (atoms) => union(atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i])));
    return { placed: placeCaptions(m, drawing, width, fitted, pt, style.captionSize, cycles.anchors), arrows: fitted, cycleArrows: cycles.arrows };
  }, [shown, drawing, writing, style, pt]);
  // The structure for the name being typed, where it will land (after the arrows and text, which landing reads).
  const ghost = useMemo(() => named && render(moveAtoms(named, new Set(named.atoms.map((_, i) => i)), landing(named)), frame, measure, L), [named, doc, frame, measure, placed, arrows]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reaction conditions and a cycle's reagents print formulas with subscripts (K2CO3 as K₂CO₃).
  const reagents = useMemo(() => new Set((shown.captions ?? []).filter((c) => c.on || c.cycle).map((c) => c.id)), [shown]);
  // Arrow ink, one path per colour (unset is the document's ink).
  const arrowInk = useMemo(() => byColour([...arrows, ...cycleArrows].map((a) => [a.colour, arrowShapes(a, frame, L)] as const)), [arrows, cycleArrows, frame]);
  // Structure ink by colour and, in 3D structures, by how strongly it is drawn (Structure Perspective).
  const structureInk = useMemo(() => byColour(drawing.polygons.map((poly, i) => [`${drawing.colours[i] ?? ""}|${(Math.round(drawing.alphas[i] * 20) / 20).toFixed(2)}`, [poly]] as const)), [drawing]);
  // Mass fragmentation: the bonds each cut line crosses, and the pieces they leave, labelled at the line's ends
  // on each piece's side with its formula and exact mass.
  const cutLabels = useMemo(() => {
    if (!loaded) return [];
    const cross = (a: P, b: P, c: P, d: P) => {
      const r = (p: P, q: P, x: P) => (q[0] - p[0]) * (x[1] - p[1]) - (q[1] - p[1]) * (x[0] - p[0]);
      return r(a, b, c) * r(a, b, d) < 0 && r(c, d, a) * r(c, d, b) < 0;
    };
    return arrows.filter((a) => a.kind === "cut").flatMap((a) => {
      const cut = shown.bonds.flatMap((b, k) => (cross(a.from, a.to, pos(shown, b.atoms[0]), pos(shown, b.atoms[1])) ? [k] : []));
      const pieces = cut.length ? fragmentMasses(shown, cut) : undefined;
      if (!pieces) return [];
      const u: P = [a.to[0] - a.from[0], a.to[1] - a.from[1]], len = Math.hypot(...u) || 1, n: P = [-u[1] / len, u[0] / len];
      return pieces.map((piece, k) => {
        const ps = piece.atoms.map((i) => pos(shown, i)), c: P = [ps.reduce((s0, q) => s0 + q[0], 0) / (ps.length || 1), ps.reduce((s0, q) => s0 + q[1], 0) / (ps.length || 1)];
        const side = Math.sign((c[0] - a.from[0]) * n[0] + (c[1] - a.from[1]) * n[1]) || (k ? -1 : 1);
        // The left-hand piece is labelled at the start of the line, the right-hand one at its end.
        const end = side > 0 ? a.from : a.to, at: P = [end[0] + n[0] * side * 0.25, end[1] + n[1] * side * 0.25];
        return { key: `${a.id}-${k}`, at, anchor: (n[0] * side >= 0 ? "start" : "end") as "start" | "end", formula: piece.formula, exact: piece.exact };
      });
    });
  }, [arrows, shown, loaded]);
  // The cycle arc (or side arrow) under a point.
  const cycleAt = (p: P) => cycleArrows.find((a) => distToPath([p[0] * L, -p[1] * L], arrowPath(a, L)) < 5 / view.zoom + frame.line * 2);
  // Which step of a cycle was last pressed: reagents and products go on that step.
  const [cycleStep, setCycleStep] = useState(0);
  // The arrow under a point (drawing coordinates), within a few px of its line.
  const arrowAt = (p: P) => [...arrows].reverse().find((a) => !isOrbital(a) && distToPath([p[0] * L, -p[1] * L], arrowPath(a, L)) < 5 / view.zoom + frame.line * 2)?.id;
  // The orbital whose lobes a point is in.
  const orbitalAt = (p: P) => [...arrows].reverse().find((a) => isOrbital(a) && orbitalPaths(a, L).some((l) => inPolygon([p[0] * L, -p[1] * L], l.path)))?.id;
  // The shape whose line is under a point; with the Select tool, also a highlight the point is inside.
  const shapeAt = (p: P) => {
    const q: P = [p[0] * L, -p[1] * L], near = 5 / view.zoom + frame.line * 2;
    return [...(shown.shapes ?? [])].reverse().find((sh) => (sh.kind === "table" ? tableAt(p)?.id === sh.id : shapePaths(sh, L, frame.bond).some((path) => distToPath(q, path) < near)))?.id;
  };
  const highlightAt = (p: P) => [...(shown.shapes ?? [])].reverse().find((sh) => sh.kind === "highlight"
    && p[0] >= Math.min(sh.from[0], sh.to[0]) && p[0] <= Math.max(sh.from[0], sh.to[0]) && p[1] >= Math.min(sh.from[1], sh.to[1]) && p[1] <= Math.max(sh.from[1], sh.to[1]))?.id;
  // The TLC plate a point is on, and a click on it: a spot in that lane at that height, or off again if one is there.
  const plateAt = (p: P) => [...(shown.shapes ?? [])].reverse().find((sh) => sh.kind === "tlc"
    && p[0] >= Math.min(sh.from[0], sh.to[0]) && p[0] <= Math.max(sh.from[0], sh.to[0]) && p[1] >= Math.min(sh.from[1], sh.to[1]) && p[1] <= Math.max(sh.from[1], sh.to[1]));
  const spotAt = (sh: Shape, p: P) => {
    const t = tlcLayout(sh), lane = Math.min(t.lanes - 1, Math.max(0, Math.floor((p[0] - t.x0) / t.width)));
    const rf = Math.round(Math.min(1, Math.max(0, (p[1] - t.origin) / (t.front - t.origin))) * 100) / 100;
    const spots = sh.tlc?.spots ?? [], hit = spots.findIndex((x) => x.lane === lane && Math.abs(x.rf - rf) < 0.06);
    set(updateShape(doc, sh.id, { tlc: { ...sh.tlc!, spots: hit >= 0 ? spots.filter((_, i) => i !== hit) : [...spots, { lane, rf }] } }));
    setSelection(new Set());
    setPicked(new Set([sh.id]));
  };
  // Tables: a cell's text width (drawing units), the table a point is on, and opening a cell to type in.
  const cellWidth = (text: string) => formulaWidth(text, style.captionSize * pt, false, false, fontStack(style.captionFont)) / L;
  const tableAt = (p: P) => [...(shown.shapes ?? [])].reverse().find((sh) => {
    if (sh.kind !== "table") return false;
    const t = tableLayout(sh, cellWidth);
    return p[0] >= t.x0 && p[0] <= t.x1 && p[1] >= t.y0 && p[1] <= t.y1;
  });
  const openCell = (sh: Shape, p: P) => {
    const t = tableLayout(sh, cellWidth);
    const c = Math.max(0, Array.from({ length: t.cols }, (_, i) => i).filter((i) => t.col(i) <= p[0]).pop() ?? 0);
    const r = Math.max(0, Math.min(t.rows - 1, Math.floor((t.y1 - p[1]) / t.h)));
    cellOpen.current = true;
    setCell({ id: sh.id, r, c, value: sh.table?.cells[r]?.[c] ?? "" });
    setSelection(new Set());
    setPicked(new Set([sh.id]));
  };
  // Ends the Pen's curve (closed when it came back to its first point) and adds it, if it has two points or more.
  function finishPen(closed = false) {
    const points = (pen ?? []).filter((q, i, all) => i === 0 || Math.hypot(q.at[0] - all[i - 1].at[0], q.at[1] - all[i - 1].at[1]) > 0.05);
    setPen(undefined);
    setPenAt(undefined);
    if (points.length < 2) return;
    const curve = { points, ...(closed && points.length > 2 ? { closed: true } : {}) };
    const [mol, id] = addArrow(doc, { kind: "curve", from: points[0].at, to: points[points.length - 1].at, curve });
    set(mol);
    setPicked(new Set([id]));
  }
  // Putting the Pen down ends its curve.
  useEffect(() => { if (pen && !(tool === "shape" && "pen" in shapePick)) finishPen(); }, [tool, shapeChoice]); // eslint-disable-line react-hooks/exhaustive-deps
  // Saves the cell being typed, then moves to another cell (adding a row past the last one) or closes.
  function commitCell(to?: [number, number]) {
    const w = cell;
    if (!cellOpen.current || !w) return;
    const sh = doc.shapes?.find((x) => x.id === w.id);
    if (!sh?.table) { cellOpen.current = false; return setCell(undefined); }
    let cur = sh, m = doc;
    if (w.value !== (sh.table.cells[w.r]?.[w.c] ?? "")) { cur = { ...cur, ...setTableCell(cur, w.r, w.c, w.value, cellWidth) }; m = updateShape(m, sh.id, cur); }
    if (to) {
      const [r, c] = to, rows = cur.table!.cells.length;
      if (r >= rows) { cur = { ...cur, ...resizeTable(cur, rows + 1, cur.table!.cells[0].length, cellWidth) }; m = updateShape(m, sh.id, cur); }
      if (r >= 0) setCell({ id: sh.id, r, c, value: cur.table!.cells[r]?.[c] ?? "" });
    } else { cellOpen.current = false; setCell(undefined); }
    if (m !== doc) set(m, true);
  }
  // The caption under a point (drawing coordinates), with a few px of slack.
  const captionAt = (p: P) => {
    const [x, y] = [p[0] * L, -p[1] * L], pad = 3 / view.zoom;
    return [...placed].reverse().find((c) => c.id !== DRAFT && x >= c.box[0] - pad && x <= c.box[2] + pad && y >= c.box[1] - pad && y <= c.box[3] + pad)?.id;
  };
  // A reaction around an arrow, from what is drawn now: structures' and captions' boxes in drawing units.
  const reactionOf = (arrowId: number) => findReaction(doc, arrowId, arrows,
    (atoms) => { const b = union(atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i])); return b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L]; },
    (id) => { const c = placed.find((x) => x.id === id); return c && [c.box[0] / L, -c.box[3] / L, c.box[2] / L, -c.box[1] / L]; });
  // The reaction picked, when exactly a whole reaction is: its arrows and its structures.
  const reactionPicked = () => {
    const first = arrows.find((a) => picked.has(a.id) && !curved(a) && !isLine(a));
    if (!first || !selection.size) return undefined;
    const r = reactionOf(first.id);
    return r && r.atoms.length === selection.size && r.atoms.every((i) => selection.has(i)) && r.arrows.every((id) => picked.has(id)) ? r : undefined;
  };
  // Atoms come first, then captions, then bonds.
  const hit = (p: P): Hover => {
    const t = hitIn(doc, p);
    if (t.atom !== undefined) return t;
    const caption = captionAt(p);
    if (caption !== undefined) return { caption };
    const arrow = arrowAt(p) ?? shapeAt(p);
    if (arrow !== undefined) return { arrow };
    const arc = cycleAt(p);
    if (arc) return { cycle: arc.cycle, step: arc.step };
    const inside = t.bond === undefined ? (tool === "select" ? highlightAt(p) ?? plateAt(p)?.id : undefined) ?? (tool === "select" || tool === "orbital" ? orbitalAt(p) : undefined) : undefined;
    return inside !== undefined ? { arrow: inside } : t;
  };
  // Curved arrows start and end on atoms and bond middles, where electrons are.
  const electronAt = (p: P, t: Hover): P => {
    // A lone pair or radical dot near the pointer comes first: the arrow starts at the electrons themselves.
    const near = drawing.electrons.map((e) => ({ e, d: Math.hypot(e.at[0] / L - p[0], -e.at[1] / L - p[1]) })).filter((x) => x.d < 0.3).sort((a, b) => a.d - b.d)[0];
    if (near) return [near.e.at[0] / L, -near.e.at[1] / L];
    if (t.atom !== undefined) return pos(doc, t.atom);
    if (t.bond !== undefined) { const [a, b] = doc.bonds[t.bond].atoms.map((i) => pos(doc, i)); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    return p;
  };
  // The arrow whose conditions a caption at this point would be: just above or below the middle of a straight arrow.
  const arrowBeside = (p: P): Caption["on"] => {
    for (const a of arrows) {
      if (!straightArrow(a)) continue;
      const len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]), u = [(a.to[0] - a.from[0]) / len, (a.to[1] - a.from[1]) / len];
      const along = (p[0] - a.from[0]) * u[0] + (p[1] - a.from[1]) * u[1], off = -(p[0] - a.from[0]) * u[1] + (p[1] - a.from[1]) * u[0];
      if (along < 0 || along > len || Math.abs(off) > 1.2) continue;
      // Above on screen is +y in the drawing; for an arrow pointing left the sides swap.
      return { arrow: a.id, side: (off > 0) === (u[0] >= 0) ? "above" : "below" };
    }
    return undefined;
  };
  const inkOf = (atoms: number[]) => union(atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i]));
  // The structure a caption at this point (drawing coordinates) would sit under: one whose ink is just above it.
  const structureAbove = (p: P, reach = 2.5) => {
    const [x, y] = [p[0] * L, -p[1] * L];
    return fragments(doc).find((g) => {
      const b = inkOf(g);
      return b && x >= b[0] - 0.5 * L && x <= b[2] + 0.5 * L && y > b[3] && y < b[3] + reach * L;
    });
  };

  // Typing captions. Enter, Escape or a click elsewhere keeps the text. Empty text deletes the caption.
  function startWriting(target: { id: number } | { at: P }) {
    setSelection(new Set());
    setPicked(new Set());
    if ("id" in target) {
      const c = doc.captions?.find((x) => x.id === target.id);
      if (c) openWriting({ id: c.id, value: c.text, runs: runsOf(c).map((r) => ({ ...r })), version: 0, style: {} });
      return;
    }
    // Clicked just above or below an arrow: the text is its conditions.
    const on = arrowBeside(target.at);
    if (on) return openWriting({ value: "", on, style: { ...textStyle } });
    // Clicked just under a structure: the caption is centred under it, by the ACS rule.
    const under = structureAbove(target.at);
    openWriting(under ? { value: "", under, style: { ...textStyle } } : { value: "", at: target.at, style: { align: "left", ...textStyle } });
  }
  function commitWriting() {
    const w = writing;
    if (!writingOpen.current) return;
    writingOpen.current = false;
    setWriting(undefined);
    if (!w) return;
    const text = w.value.replace(/\s+$/, "");
    // Runs are kept only when some text has a style of its own; trailing space goes from them as from the text.
    const runs = w.runs && styled(w.runs) ? edited(w.runs, text) : undefined;
    if (w.id !== undefined) {
      const old = doc.captions?.find((c) => c.id === w.id);
      if (!text) return set(deleteGraphics(doc, new Set([w.id])));
      if (old && (text !== old.text || Object.keys(w.style).length || JSON.stringify(runs) !== JSON.stringify(old.runs))) set(updateCaption(doc, w.id, { text, ...w.style, runs }));
      return setPicked(new Set([w.id]));
    }
    if (!text) return;
    const [mol, id] = addCaption(doc, { text, x: w.at?.[0] ?? 0, y: w.at?.[1] ?? 0, ...(w.under ? { under: w.under } : {}), ...(w.on ? { on: w.on } : {}), ...(w.cycle ? { cycle: w.cycle } : {}), ...w.style, ...(runs ? { runs } : {}) });
    set(mol);
    setPicked(new Set([id]));
  }
  // A text style on the characters selected in the caption box (with nothing selected, on the next characters
  // typed), or on the whole of every picked caption (the caption's own bold, italic and underline go into its runs,
  // so part of it can be set apart).
  function styleText(patch: (s: RunStyle, all: RunStyle) => RunStyle, what: string) {
    const fold = (c: Partial<Caption>, runs: TextRun[]) => runs.map((r) => ({ ...(c.bold ? { bold: true as const } : {}), ...(c.italic ? { italic: true as const } : {}), ...(c.underline ? { underline: true as const } : {}), ...r }));
    const unfold = { bold: false, italic: false, underline: false };
    if (writing) {
      const base = writing.id !== undefined ? { ...doc.captions?.find((c) => c.id === writing.id), ...writing.style } : writing.style;
      const runs = normalise(fold(base, writing.runs ?? [{ text: writing.value }])), [s, e] = richApi.current?.range() ?? [writing.value.length, writing.value.length];
      const all = common(runs, s, e);
      if (s === e) return setWriting({ ...writing, runs, style: { ...writing.style, ...unfold }, pending: patch({ ...(writing.pending ?? all) }, writing.pending ?? all), version: (writing.version ?? 0) + 1, caret: [s, e] });
      return setWriting({ ...writing, runs: styleRange(runs, s, e, (st) => patch(st, all)), style: { ...writing.style, ...unfold }, version: (writing.version ?? 0) + 1, caret: [s, e] });
    }
    if (!picked.size) return what === "font" ? setTextStyle((t) => ({ ...t, font: patch({}, {}).font })) : undefined;
    set({
      ...doc,
      captions: doc.captions?.map((c) => {
        if (!picked.has(c.id)) return c;
        const runs = normalise(fold(c, runsOf(c))), next = styleRange(runs, 0, c.text.length, (st) => patch(st, common(runs, 0, c.text.length)));
        return { ...c, bold: undefined, italic: undefined, underline: undefined, runs: styled(next) ? next : undefined };
      }),
    }, true);
  }
  // Formula (⌘F, as ChemDraw's): the counts in the selected text (or the whole caption) become subscripts.
  function formulaText() {
    const apply = (runs: TextRun[], s: number, e: number) => {
      const text = plainOf(runs).slice(s, e);
      let out = runs, at = s;
      for (const r of formulaRuns(text)) { if (r.sub) out = styleRange(out, at, at + r.text.length, (st) => ({ ...st, script: "sub" })); at += r.text.length; }
      return out;
    };
    if (writing) {
      const runs = writing.runs ?? [{ text: writing.value }], range = richApi.current?.range(), [s, e] = range && range[0] !== range[1] ? range : [0, writing.value.length];
      return setWriting({ ...writing, runs: apply(runs, s, e), version: (writing.version ?? 0) + 1, caret: range ?? [s, e] });
    }
    set({ ...doc, captions: doc.captions?.map((c) => { if (!picked.has(c.id)) return c; const next = apply(runsOf(c), 0, c.text.length); return { ...c, runs: styled(next) ? next : undefined }; }) }, true);
  }
  // Applies a style change to the caption being typed, or to every picked caption.
  function restyle(change: (c: Partial<Caption>) => Partial<Caption>) {
    if (writing) {
      const base = writing.id !== undefined ? { ...doc.captions?.find((c) => c.id === writing.id), ...writing.style } : writing.style;
      return setWriting({ ...writing, style: { ...writing.style, ...change(base) } });
    }
    if (!picked.size) return tool === "text" ? setTextStyle((s) => ({ ...s, ...change(s) })) : undefined;
    const first = doc.captions?.find((c) => picked.has(c.id));
    if (!first) return;
    const delta = change(first); // one change for all, so Bold on a mixed set makes them all bold
    set({ ...doc, captions: doc.captions?.map((c) => (picked.has(c.id) ? { ...c, ...delta } : c)) }, true);
  }
  // Moves the selected atoms and the moving captions. A caption under a structure that is not moving comes
  // away from it and stays where it is dragged.
  function moveAll(base: Mol, d: P, captions: Map<number, P>, arrowIds = new Set<number>(), cycleIds = new Set<number>(), atoms = selection): Mol {
    let m = atoms.size ? moveAtoms(base, atoms, d) : base;
    if (cycleIds.size) m = { ...m, cycles: m.cycles?.map((c) => (cycleIds.has(c.id) ? { ...c, centre: [c.centre[0] + d[0], c.centre[1] + d[1]] } : c)) };
    const shift = <T extends { id: number; from: [number, number]; to: [number, number] }>(a: T): T => (arrowIds.has(a.id) ? { ...a, from: [a.from[0] + d[0], a.from[1] + d[1]], to: [a.to[0] + d[0], a.to[1] + d[1]] } : a);
    const shiftCurve = (x: Arrow): Arrow => (arrowIds.has(x.id) && x.curve ? { ...shift(x), curve: { ...x.curve, points: x.curve.points.map((q) => ({ at: [q.at[0] + d[0], q.at[1] + d[1]], ...(q.c1 ? { c1: [q.c1[0] + d[0], q.c1[1] + d[1]] as P } : {}), ...(q.c2 ? { c2: [q.c2[0] + d[0], q.c2[1] + d[1]] as P } : {}) })) } } : shift(x));
    if (arrowIds.size) m = { ...m, arrows: m.arrows?.map(shiftCurve), shapes: m.shapes?.map(shift) };
    if (!captions.size) return m;
    return {
      ...m,
      captions: m.captions?.map((c) => {
        const from = captions.get(c.id);
        if (!from) return c;
        const { under: _u, on: _o, cycle: _c, ...free } = c;
        return { ...free, x: from[0] + d[0], y: from[1] + d[1] };
      }),
    };
  }
  // Catalytic cycles: make one from the selected structures, tidy it, turn it the other way, label it, or ungroup it.
  function cycleAction(what: string) {
    const ink = (atoms: number[]) => inkOf(atoms);
    const spread = (m: Mol, c: Cycle) => {
      const { shifts, radius } = spreadCycle(c, L, ink);
      c.nodes.forEach((n, i) => { m = moveAtoms(m, new Set(n), shifts[i]); });
      return { ...m, cycles: m.cycles?.map((x) => (x.id === c.id ? { ...x, radius } : x)) };
    };
    if (what === "make") {
      const groups = fragments(doc).filter((g) => g.some((i) => selection.has(i)));
      if (groups.length < 2) return;
      const items = groups.map((atoms) => { const b = inkOf(atoms)!; return { atoms, middle: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] as P }; });
      const middle: P = [items.reduce((s, x) => s + x.middle[0], 0) / items.length, items.reduce((s, x) => s + x.middle[1], 0) / items.length];
      const [m, id] = addCycle(doc, { centre: [middle[0] / L, -middle[1] / L], radius: 3, clockwise: true, nodes: orderAround(middle, items) });
      set(spread(m, m.cycles!.find((c) => c.id === id)!));
      setSelection(new Set(groups.flat()));
      return setPicked(new Set([id]));
    }
    const c = (doc.cycles ?? []).find((x) => picked.has(x.id));
    if (!c) return;
    if (what === "tidy") return set(spread(doc, c), true);
    if (what === "reverse") return set({ ...doc, cycles: doc.cycles?.map((x) => (x.id === c.id ? { ...x, clockwise: !x.clockwise } : x)) }, true);
    if (what === "ungroup") return set(deleteGraphics(doc, new Set([c.id])));
    if (what === "centre" || what === "in" || what === "out") {
      setPicked(new Set());
      setSelection(new Set());
      return openWriting({ value: "", cycle: { cycle: c.id, step: what === "centre" ? 0 : cycleStep, side: what }, style: { ...textStyle } });
    }
  }
  // Numbers the structures in the selection, left to right, skipping any that already have a number.
  function numberStructures() {
    let m = doc;
    const groups = fragments(doc).filter((g) => g.some((i) => selection.has(i)) && !doc.captions?.some((c) => isNumber(c) && c.under?.some((i) => g.includes(i))));
    groups.sort((a, b) => (inkOf(a)?.[0] ?? 0) - (inkOf(b)?.[0] ?? 0));
    for (const g of groups) m = addCaption(m, { text: nextNumber(m), x: 0, y: 0, bold: true, under: g })[0];
    if (m !== doc) set(m, true);
  }

  const stopHold = () => { clearTimeout(hold.current); hold.current = undefined; };
  const holdFrom = useRef<[number, number]>(undefined); // where the press that may become a hold went down

  // Select tool press: on something selected, move the selection; on something else, select it and move it;
  // on empty canvas, start a selection box. Shift adds to the selection.
  // picks: the captions that will be picked once this press's state updates land.
  // The selected things for Align and Distribute: each structure, group and object, with its box in drawing units
  // (y up: [left, bottom, right, top]) and what moves with it.
  function things() {
    const box = (b: Box): Box => [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
    const out: { atoms: number[]; items: number[]; box: Box }[] = [];
    const groups = groupsOf(doc, selection, picked), inGroup = (atoms: number[], id?: number) => groups.find((g) => (id !== undefined ? g.items.includes(id) : atoms.some((i) => g.atoms.includes(i))));
    const add = (atoms: number[], items: number[], b: Box | undefined) => {
      if (!b) return;
      const g = inGroup(atoms, items[0]), mine = g && out.find((o) => o.atoms.some((i) => g.atoms.includes(i)) || o.items.some((id) => g.items.includes(id)));
      if (mine) { mine.atoms.push(...atoms); mine.items.push(...items); mine.box = [Math.min(mine.box[0], b[0]), Math.min(mine.box[1], b[1]), Math.max(mine.box[2], b[2]), Math.max(mine.box[3], b[3])]; }
      else out.push({ atoms: [...atoms], items: [...items], box: b });
    };
    for (const g of fragments(doc).filter((f) => f.some((i) => selection.has(i)))) { const b = union(g.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i])); add(g, [], b && box(b)); }
    for (const c of placed) if (picked.has(c.id)) { const cap = doc.captions?.find((x) => x.id === c.id); if (cap && !cap.under && !cap.on && !cap.cycle) add([], [c.id], box(c.box)); }
    for (const a of [...(doc.arrows ?? []), ...(doc.shapes ?? [])]) if (picked.has(a.id)) {
      const [f, t] = "curve" in a && a.curve ? curveBox(a.curve) : [a.from, a.to];
      add([], [a.id], [Math.min(f[0], t[0]), Math.min(f[1], t[1]), Math.max(f[0], t[0]), Math.max(f[1], t[1])]);
    }
    return out;
  }
  // Rotate… and Scale…: every point of the selection (or the whole drawing) moved by f about the selection's middle.
  // Shapes keep their own size and turn about their middle; atoms, text, arrows and curves move point by point.
  function transformSelection(f: (q: P) => P, scale = 1) {
    const all = !selection.size && !picked.size, atoms = all ? new Set(doc.atoms.map((_, i) => i)) : selection;
    const items = all ? new Set([...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? [])].map((x) => x.id)) : picked;
    const by = (q: [number, number]): [number, number] => f(q);
    const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    set({
      ...doc,
      atoms: doc.atoms.map((a, i) => (atoms.has(i) ? { ...a, location: [...by([a.location[0], a.location[1]]), (a.location[2] ?? 0) * scale] as [number, number, number] } : a)),
      captions: doc.captions?.map((c) => (items.has(c.id) && !c.under && !c.on && !c.cycle ? { ...c, ...(([x, y]) => ({ x, y }))(by([c.x, c.y])) } : c)),
      arrows: doc.arrows?.map((a) => (items.has(a.id) ? { ...a, from: by(a.from), to: by(a.to), ...(a.curve ? { curve: { ...a.curve, points: a.curve.points.map((q) => ({ at: by(q.at), ...(q.c1 ? { c1: by(q.c1) } : {}), ...(q.c2 ? { c2: by(q.c2) } : {}) })) } } : {}) } : a)),
      shapes: doc.shapes?.map((x) => {
        if (!items.has(x.id)) return x;
        const c = mid(x.from, x.to), to = by(c), half: [number, number] = [((x.to[0] - x.from[0]) / 2) * scale, ((x.to[1] - x.from[1]) / 2) * scale];
        return { ...x, from: [to[0] - half[0], to[1] - half[1]], to: [to[0] + half[0], to[1] + half[1]] };
      }),
    }, true);
  }
  // The middle of the selection (or the whole drawing), in drawing units.
  const selectionMiddle = (): P => {
    const all = !selection.size && !picked.size, pts: P[] = [...doc.atoms.map((_, i) => i).filter((i) => all || selection.has(i)).map((i) => pos(doc, i)),
      ...[...(doc.arrows ?? []), ...(doc.shapes ?? [])].filter((x) => all || picked.has(x.id)).flatMap((x) => [x.from, x.to])];
    return pts.length ? [(Math.min(...pts.map((q) => q[0])) + Math.max(...pts.map((q) => q[0]))) / 2, (Math.min(...pts.map((q) => q[1])) + Math.max(...pts.map((q) => q[1]))) / 2] : [0, 0];
  };
  function rotateBy(degrees: number) {
    const c = selectionMiddle(), r = (degrees * Math.PI) / 180, [cs, sn] = [Math.cos(r), Math.sin(r)];
    transformSelection((q) => [c[0] + (q[0] - c[0]) * cs - (q[1] - c[1]) * sn, c[1] + (q[0] - c[0]) * sn + (q[1] - c[1]) * cs]);
  }
  function scaleBy(k: number) {
    if (!(k > 0) || !Number.isFinite(k)) return;
    const c = selectionMiddle();
    transformSelection((q) => [c[0] + (q[0] - c[0]) * k, c[1] + (q[1] - c[1]) * k], k);
  }
  // The median bond length of the selection (or the drawing), in drawing units.
  const medianBond = () => {
    const all = !selection.size, ls = doc.bonds.filter((b) => all || (selection.has(b.atoms[0]) && selection.has(b.atoms[1]))).map((b) => Math.hypot(pos(doc, b.atoms[0])[0] - pos(doc, b.atoms[1])[0], pos(doc, b.atoms[0])[1] - pos(doc, b.atoms[1])[1])).sort((p, q) => p - q);
    return ls.length ? ls[Math.floor(ls.length / 2)] : 1;
  };
  // Moves one of those things by d (drawing units): its atoms, free captions, arrows, shapes and curve points.
  const shiftThing = (m: Mol, t: { atoms: number[]; items: number[] }, d: P): Mol => {
    const ids = new Set(t.items), by = (q: [number, number]): [number, number] => [q[0] + d[0], q[1] + d[1]];
    let out = moveAtoms(m, new Set(t.atoms), d);
    out = {
      ...out,
      captions: out.captions?.map((c) => (ids.has(c.id) ? { ...c, x: c.x + d[0], y: c.y + d[1] } : c)),
      arrows: out.arrows?.map((a) => (ids.has(a.id) ? { ...a, from: by(a.from), to: by(a.to), ...(a.curve ? { curve: { ...a.curve, points: a.curve.points.map((q) => ({ at: by(q.at), ...(q.c1 ? { c1: by(q.c1) } : {}), ...(q.c2 ? { c2: by(q.c2) } : {}) })) } } : {}) } : a)),
      shapes: out.shapes?.map((x) => (ids.has(x.id) ? { ...x, from: by(x.from), to: by(x.to) } : x)),
    };
    return out;
  };
  function arrange(how: "left" | "centre" | "right" | "top" | "middle" | "bottom" | "across" | "down") {
    const list = things();
    if (list.length < (how === "across" || how === "down" ? 3 : 2)) return setNotice(how === "across" || how === "down" ? "Select three or more things to space out." : "Select two or more things to line up.");
    let m = doc;
    if (how === "across" || how === "down") {
      const k = how === "across" ? 0 : 1, sorted = [...list].sort((p, q) => (p.box[k] + p.box[k + 2]) - (q.box[k] + q.box[k + 2]));
      const span = sorted[sorted.length - 1].box[k + 2] - sorted[0].box[k], sizes = sorted.reduce((s, t) => s + t.box[k + 2] - t.box[k], 0), gap = (span - sizes) / (sorted.length - 1);
      let at = sorted[0].box[k + 2] + gap;
      for (const t of sorted.slice(1, -1)) { const d: P = k ? [0, at - t.box[1]] : [at - t.box[0], 0]; m = shiftThing(m, t, d); at += t.box[k + 2] - t.box[k] + gap; }
    } else {
      const top = list.reduce((p, q) => (q.box[3] > p.box[3] ? q : p)), mid = (b: Box, k: number) => (b[k] + b[k + 2]) / 2;
      for (const t of list) {
        if (t === top) continue;
        const d: P = how === "left" ? [top.box[0] - t.box[0], 0] : how === "right" ? [top.box[2] - t.box[2], 0] : how === "centre" ? [mid(top.box, 0) - mid(t.box, 0), 0]
          : how === "top" ? [0, top.box[3] - t.box[3]] : how === "bottom" ? [0, top.box[1] - t.box[1]] : [0, mid(top.box, 1) - mid(t.box, 1)];
        m = shiftThing(m, t, d);
      }
    }
    set(m, true);
  }
  const startMove = (p: P, screen: [number, number], t: Hover, picks = picked, atoms = selection, copy = false) => {
    // Option-drag moves copies, made now and kept only if the pointer moves.
    let base = doc, copies: Map<number, number> | undefined;
    if (copy && (atoms.size || picks.size)) {
      const d = duplicateSelection(doc, atoms, picks);
      [base, atoms, picks, copies] = [d.mol, d.atoms, d.items, d.ids];
      setSelection(atoms);
      setPicked(picks);
    }
    const original = new Map([...(copies ?? [])].map(([from, to]) => [to, from]));
    // A caption follows its structure or arrow when that moves too; otherwise it comes away and moves alone.
    const captions = new Map<number, P>(), arrowIds = new Set([...(base.arrows ?? []), ...(base.shapes ?? [])].filter((a) => picks.has(a.id)).map((a) => a.id));
    const cycleIds = new Set((base.cycles ?? []).filter((c) => picks.has(c.id)).map((c) => c.id));
    for (const caption of base.captions ?? []) {
      const c = placed.find((x) => x.id === (original.get(caption.id) ?? caption.id));
      const follows = (caption.under && caption.under.every((i) => atoms.has(i))) || (caption.on && arrowIds.has(caption.on.arrow)) || (caption.cycle && cycleIds.has(caption.cycle.cycle));
      if (c && picks.has(caption.id) && !follows) captions.set(caption.id, anchorOf(c));
    }
    // Text moving on its own keeps its starting box, for snapping.
    const textBox = !atoms.size && captions.size ? union(placed.filter((c) => captions.has(original.get(c.id) ?? c.id) || captions.has(c.id)).map((c) => c.box)) : undefined;
    setDrag({ kind: "move", from: p, working: base, moved: false, start: screen, target: t, guides: [], captions, arrows: arrowIds, cycles: cycleIds, textBox, ...(copies ? { base, atoms } : {}) });
  };
  // A press on a cycle's arrows picks the cycle with all its intermediates, and grabs them.
  function pressCycle(p: P, t: Hover, screen: [number, number]) {
    const c = doc.cycles?.find((x) => x.id === t.cycle);
    if (!c) return;
    const atoms = new Set(c.nodes.flat()), picks = new Set([c.id]);
    setCycleStep(t.step ?? 0);
    setSelection(atoms);
    setPicked(picks);
    startMove(p, screen, t, picks, atoms);
  }
  // A press on a caption or arrow picks it (Shift adds it) and grabs it.
  function pressCaption(p: P, t: Hover, shift: boolean, screen: [number, number], copy = false) {
    const id = (t.caption ?? t.arrow)!;
    if (picked.has(id) && !shift) return startMove(p, screen, t, picked, selection, copy);
    const picks = new Set(shift ? [...picked, id] : [id]), atoms = shift ? selection : new Set<number>();
    setPicked(picks);
    setSelection(atoms);
    startMove(p, screen, t, picks, atoms, copy);
  }

  function pressSelect(p: P, t: Hover, shift: boolean, screen: [number, number], copy = false) {
    const ids = atomsOf(doc, t);
    // A press on any part of an integral group picks the whole group and moves it.
    const whole = !shift && groupsOf(doc, new Set(ids), new Set([t.caption, t.arrow].filter((x): x is number => x !== undefined))).find((g) => g.integral);
    if (whole && selectKind !== "perspective") {
      setSelection(new Set(whole.atoms));
      setPicked(new Set(whole.items));
      return startMove(p, screen, t, new Set(whole.items), new Set(whole.atoms));
    }
    // Structure Perspective: a press on the selection, or on a structure, tilts it through 3D as the pointer moves.
    if (selectKind === "perspective" && (ids.length || (selection.size && onSelection(doc, selection, p)))) {
      const on = selection.size && (onSelection(doc, selection, p) || ids.some((i) => selection.has(i)));
      const set3 = new Set(on ? [...selection] : (fragments(doc).find((g) => g.includes(ids[0])) ?? ids));
      setSelection(set3);
      setPicked(new Set());
      const hinge = hingeOf(doc, set3), ps = [...set3].map((i) => doc.atoms[i].location);
      const centre: [number, number, number] = [0, 1, 2].map((k) => (Math.min(...ps.map((q) => q[k] ?? 0)) + Math.max(...ps.map((q) => q[k] ?? 0))) / 2) as [number, number, number];
      return setDrag({ kind: "tilt", base: doc, ids: set3, centre, start: screen, hinge, working: doc });
    }
    if (t.cycle !== undefined) return pressCycle(p, t, screen);
    if (t.caption !== undefined || t.arrow !== undefined) return pressCaption(p, t, shift, screen, copy);
    if (!shift && (selection.size || picked.size) && onSelection(doc, selection, p)) return startMove(p, screen, t, picked, selection, copy);
    if (ids.length) {
      const atoms = new Set(shift ? [...selection, ...ids] : ids), picks = shift ? picked : new Set<number>();
      setSelection(atoms);
      setPicked(picks);
      return startMove(p, screen, t, picks, atoms, copy);
    }
    const base = shift ? selection : new Set<number>(), picks = shift ? picked : new Set<number>();
    setSelection(base);
    setPicked(picks);
    startArea(p, t, base, picks);
  }

  // A selection area: a box, or a lasso, as the Select tool is set.
  function startArea(p: P, t: Hover, base: Set<number>, picks = new Set<number>()) {
    if (selectKind === "lasso") setDrag({ kind: "lasso", points: [p], base, picks, target: t, moved: false });
    else setDrag({ kind: "box", from: p, to: p, base, picks, target: t, moved: false });
  }
  // The captions whose middle is inside a test (drawing coordinates).
  const captionsWhere = (inside: (q: P) => boolean) => [
    ...placed.filter((c) => c.id !== DRAFT && inside([(c.box[0] + c.box[2]) / 2 / L, -(c.box[1] + c.box[3]) / 2 / L])).map((c) => c.id),
    ...[...arrows, ...(doc.shapes ?? [])].filter((a) => {
      const [f, t] = "curve" in a && a.curve ? curveBox(a.curve) : [a.from, a.to];
      return inside([(f[0] + t[0]) / 2, (f[1] + t[1]) / 2]);
    }).map((a) => a.id),
  ];
  // The handle of the one picked arrow under a point: its ends, and the middle of a curved one.
  const handleAt = (p: P): { id: number; which: Corner } | undefined => {
    const ids = [...picked], a = ids.length === 1 && !selection.size ? arrows.find((x) => x.id === ids[0]) : undefined;
    const near = (q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) * L * view.zoom < 8;
    const sh = ids.length === 1 && !selection.size ? doc.shapes?.find((x) => x.id === ids[0]) : undefined;
    if (sh) return (Object.entries(corners(sh)) as [Corner, P][]).filter(([, q]) => near(q)).map(([which]) => ({ id: sh.id, which }))[0];
    if (!a || a.kind === "curve") return undefined;
    return near(a.to) ? { id: a.id, which: "to" } : near(a.from) ? { id: a.id, which: "from" } : curved(a) && near(bendPoint(a)) ? { id: a.id, which: "bend" } : undefined;
  };
  // The selection's rotation handle, as in ChemDraw: just off the top right corner of the selection's box (px).
  const turnHandle = (): P | undefined => {
    if (selection.size < 2 || drag?.kind === "move") return undefined;
    const b = union([...selection].filter((i) => drawing.ink[i]).map((i) => drawing.ink[i]));
    return b && [b[2] + 10 / view.zoom, b[1] - 10 / view.zoom];
  };
  const onTurnHandle = (p: P) => { const h = turnHandle(); return !!h && Math.hypot(p[0] * L - h[0], -p[1] * L - h[1]) * view.zoom < 11; };
  // A shape's four corners, as handles.
  const corners = (sh: Shape): Record<"from" | "to" | "c1" | "c2", P> => ({ from: sh.from, to: sh.to, c1: [sh.from[0], sh.to[1]], c2: [sh.to[0], sh.from[1]] });

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    const p = toDoc(e.clientX, e.clientY), t = hit(p), screen: [number, number] = [e.clientX, e.clientY];
    pointer.current = p;
    const handle = tool !== "erase" ? handleAt(p) : undefined;
    if (handle) return setDrag({ kind: "handle", ...handle, working: doc });
    if (tool !== "erase" && onTurnHandle(p)) {
      const ps = [...selection].map((i) => pos(doc, i));
      const centre: P = [(Math.min(...ps.map((q) => q[0])) + Math.max(...ps.map((q) => q[0]))) / 2, (Math.min(...ps.map((q) => q[1])) + Math.max(...ps.map((q) => q[1]))) / 2];
      return setDrag({ kind: "turn", centre, start: Math.atan2(p[1] - centre[1], p[0] - centre[0]), degrees: 0, working: doc });
    }
    const page = t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined ? pageEdgeAt(p) : undefined;
    if (page) return fitPage(page);
    if (tool === "select") return pressSelect(p, t, e.shiftKey, screen, e.altKey);
    // The Pen: each press places a point (drag for a smooth one); pressing the first point again closes the curve.
    if (tool === "shape" && "pen" in shapePick) {
      if (pen && pen.length >= 2 && Math.hypot(p[0] - pen[0].at[0], p[1] - pen[0].at[1]) * L * view.zoom < 8) return finishPen(true);
      setDrag({ kind: "pen", at: p, start: screen });
      return startHold(p, t, screen);
    }
    // With something selected, a press on it (or inside it) grabs it, whatever tool is in hand. So does a press
    // on a caption, except with the Text tool, which edits it.
    if (tool !== "erase" && selection.size && onSelection(doc, selection, p)) return startMove(p, screen, t);
    if (tool !== "erase" && tool !== "text" && t.cycle !== undefined) return pressCycle(p, t, screen);
    if (tool !== "erase" && tool !== "text" && (t.caption !== undefined || t.arrow !== undefined)) return pressCaption(p, t, e.shiftKey, screen);
    if (tool === "tlc" && plateAt(p)) return spotAt(plateAt(p)!, p);
    if (tool === "table" && tableAt(p)) return openCell(tableAt(p)!, p);
    // Pressing away from the selection with a drawing tool clears it, as ChemDraw does.
    if (selection.size || picked.size) { setSelection(new Set()); setPicked(new Set()); }
    pressTool(p, t, screen);
    startHold(p, t, screen);
  }
  // What a press does with each drawing tool in hand: starts its drag (a click when the pointer never moves).
  function pressTool(p: P, t: Hover, screen: [number, number]) {
    if (tool === "arrow") return setDrag({ kind: "arrow", from: curved({ kind: arrowKind }) ? electronAt(p, t) : p, start: screen, target: t });
    if (tool === "shape" && "line" in shapePick) {
      const make: Make = { kind: shapePick.line, ...(shapePick.sweep ? { bend: sweepBend(shapePick.sweep) } : {}), ...(shapePick.style ? { style: shapePick.style } : {}) };
      return setDrag({ kind: "arrow", from: p, start: screen, target: t, make });
    }
    if (tool === "shape" || tool === "bracket" || tool === "tlc" || tool === "table") return setDrag({ kind: "shape", from: p, start: screen, target: t });
    if (tool === "map" && t.atom !== undefined) return setDrag({ kind: "map", atom: t.atom, start: screen });
    if (tool === "fragment") return setDrag({ kind: "arrow", from: p, start: screen, target: t, make: { kind: "cut" } });
    // An orbital grows from the atom pressed (or the point) towards the pointer.
    if (tool === "orbital") return setDrag({ kind: "arrow", from: t.atom !== undefined ? pos(doc, t.atom) : p, start: screen, target: t, make: { kind: "orbital", orbital: orbitalSpec(orbitalChoice)! } });
    if (tool === "erase") return setDrag({ kind: "erase", trail: [p], bonds: new Set(), atoms: new Set(), captions: new Set(), start: screen, target: t, moved: false });
    if (tool === "bond") return setDrag({ kind: "bond", from: t.atom ?? p, at: p, start: screen, target: t });
    if (tool === "chain") return setDrag({ kind: "chain", from: t.atom ?? p, start: screen, target: t });
    setDrag({ kind: "click", at: p, start: screen, target: t });
  }
  // Every drawing tool: hold still for HOLD_MS and Select takes over until release. On the selection it moves it;
  // elsewhere it draws a box. Moving 4 px first keeps the tool (see onPointerMove).
  function startHold(p: P, t: Hover, screen: [number, number]) {
    stopHold();
    holdFrom.current = screen;
    hold.current = window.setTimeout(() => {
      hold.current = undefined;
      setSpring(tool);
      setTool("select");
      setPop((old) => ({ n: (old?.n ?? 0) + 1, x: screen[0], y: screen[1] }));
      const ids = atomsOf(doc, t);
      if (ids.length && ids.every((i) => selection.has(i))) return startMove(p, screen, t);
      setSelection(new Set());
      startArea(p, t, new Set());
    }, HOLD_MS);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = toDoc(e.clientX, e.clientY);
    pointer.current = p;
    if (hold.current && holdFrom.current && Math.hypot(e.clientX - holdFrom.current[0], e.clientY - holdFrom.current[1]) >= 4) stopHold();
    if (tool === "erase") setBrush(p);
    if (pen && !drag) setPenAt(p);
    if (!drag) {
      setOverSelection(tool !== "erase" && selection.size > 0 && onSelection(doc, selection, p));
      setOverTurn(tool !== "erase" && onTurnHandle(p));
      const t = hit(p);
      setPageHover(t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined ? pageEdgeAt(p)?.[0] : undefined);
      return setHover(t);
    }
    switch (drag.kind) {
      case "click":
        if (Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) >= 4) stopHold();
        return;
      case "bond": {
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        if (drag.target.bond !== undefined && drag.target.atom === undefined) return; // dragging from a bond does nothing
        const origin = typeof drag.from === "number" ? pos(doc, drag.from) : drag.from;
        const onto = atomAt(doc, p);
        let to: P;
        if (onto !== undefined && onto !== drag.from) to = pos(doc, onto);
        else {
          const a = Math.round(Math.atan2(p[1] - origin[1], p[0] - origin[0]) / SNAP) * SNAP;
          to = [origin[0] + Math.cos(a), origin[1] + Math.sin(a)];
        }
        return setDrag({ ...drag, to });
      }
      case "arrow": {
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        // A curved arrow ends on an atom or bond; a straight one snaps to 15° steps (⌥/Alt frees it).
        if (curved({ kind: drag.make?.kind ?? arrowKind })) {
          // The arc bulges the way the drag went: the sign of the area between the pointer's path and the line.
          const to = drag.make ? p : electronAt(p, hitIn(doc, p)), trail = [...(drag.trail ?? [drag.from]), p], ring = [...trail, to];
          let area = 0;
          for (let i = 0; i < ring.length; i++) { const [a, b] = [ring[i], ring[(i + 1) % ring.length]]; area += a[0] * b[1] - b[0] * a[1]; }
          const chord = Math.hypot(to[0] - drag.from[0], to[1] - drag.from[1]);
          const side = Math.abs(area / 2) > 0.05 * chord * chord ? (area < 0 ? 1 : -1) : (drag.side ?? 1);
          return setDrag({ ...drag, to, trail, side });
        }
        const far = Math.hypot(p[0] - drag.from[0], p[1] - drag.from[1]), raw = Math.atan2(p[1] - drag.from[1], p[0] - drag.from[0]);
        const a = e.altKey ? raw : Math.round(raw / SNAP) * SNAP;
        return setDrag({ ...drag, to: [drag.from[0] + far * Math.cos(a), drag.from[1] + far * Math.sin(a)] });
      }
      case "map":
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        return setDrag({ ...drag, to: p });
      case "tilt": {
        // Half a degree per pixel: across turns about the vertical axis, up and down about the horizontal one;
        // Shift keeps to one axis. Part of a structure joined by one bond turns about that bond.
        let dx = e.clientX - drag.start[0], dy = e.clientY - drag.start[1];
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const working = drag.hinge ? turnAboutBond(drag.base, drag.ids, drag.hinge[1], drag.hinge[0], (dx - dy) * 0.5) : tiltAtoms(drag.base, drag.ids, drag.centre, dx * 0.5, -dy * 0.5);
        return setDrag({ ...drag, working });
      }
      case "pen":
        if (!drag.out && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        return setDrag({ ...drag, out: p });
      case "turn": {
        // Free, or in 15° steps with Shift. Anticlockwise is positive, as on the page.
        let degrees = ((Math.atan2(p[1] - drag.centre[1], p[0] - drag.centre[0]) - drag.start) * 180) / Math.PI;
        degrees = ((degrees + 540) % 360) - 180;
        if (e.shiftKey) degrees = Math.round(degrees / 15) * 15;
        return setDrag({ ...drag, degrees, working: rotateAtoms(doc, selection, degrees) });
      }
      case "shape": {
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        // Shift makes it square (or round).
        const w = p[0] - drag.from[0], h = p[1] - drag.from[1], side = Math.max(Math.abs(w), Math.abs(h));
        return setDrag({ ...drag, to: e.shiftKey ? [drag.from[0] + Math.sign(w || 1) * side, drag.from[1] + Math.sign(h || 1) * side] : p });
      }
      case "handle": {
        const sh = doc.shapes?.find((x) => x.id === drag.id);
        if (sh) {
          const w = drag.which;
          const change: Partial<Shape> = w === "from" ? { from: p } : w === "to" ? { to: p } : w === "c1" ? { from: [p[0], sh.from[1]], to: [sh.to[0], p[1]] } : { from: [sh.from[0], p[1]], to: [p[0], sh.to[1]] };
          return setDrag({ ...drag, working: updateShape(doc, sh.id, change) });
        }
        const a = doc.arrows?.find((x) => x.id === drag.id);
        if (!a) return;
        if (drag.which === "bend") {
          // The middle follows the pointer across the line; how far across sets the bend.
          const len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]) || 1, n = [-(a.to[1] - a.from[1]) / len, (a.to[0] - a.from[0]) / len];
          const off = (p[0] - (a.from[0] + a.to[0]) / 2) * n[0] + (p[1] - (a.from[1] + a.to[1]) / 2) * n[1];
          return setDrag({ ...drag, working: updateArrow(doc, a.id, { bend: Math.max(-1.5, Math.min(1.5, off / len)) }) });
        }
        const other = drag.which === "from" ? a.to : a.from;
        let q: P = curved(a) ? electronAt(p, hitIn(doc, p)) : p;
        if (!curved(a) && !e.altKey) {
          const far = Math.hypot(q[0] - other[0], q[1] - other[1]), ang = Math.round(Math.atan2(q[1] - other[1], q[0] - other[0]) / SNAP) * SNAP;
          q = [other[0] + far * Math.cos(ang), other[1] + far * Math.sin(ang)];
        }
        return setDrag({ ...drag, working: updateArrow(doc, a.id, { [drag.which as "from" | "to"]: q }) });
      }
      case "chain": {
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        // The chain follows the pointer: its direction snaps to 15° steps, its length is free.
        const origin = typeof drag.from === "number" ? pos(doc, drag.from) : drag.from, far = Math.hypot(p[0] - origin[0], p[1] - origin[1]);
        const a = Math.round(Math.atan2(p[1] - origin[1], p[0] - origin[0]) / SNAP) * SNAP;
        return setDrag({ ...drag, to: [origin[0] + far * Math.cos(a), origin[1] + far * Math.sin(a)] });
      }
      case "erase": {
        if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        const bonds = new Set(drag.bonds), atoms = new Set(drag.atoms), captions = new Set(drag.captions);
        rub(doc, drag.trail[drag.trail.length - 1], p, settings.eraser, bonds, atoms);
        const [x, y] = [p[0] * L, -p[1] * L], r = settings.eraser * L;
        for (const c of placed) if (x >= c.box[0] - r && x <= c.box[2] + r && y >= c.box[1] - r && y <= c.box[3] + r) captions.add(c.id);
        for (const a of arrows) if (distToPath([x, y], arrowPath(a, L)) < r) captions.add(a.id);
        for (const sh of doc.shapes ?? []) if (shapePaths(sh, L, frame.bond).some((path) => distToPath([x, y], path) < r)) captions.add(sh.id);
        return setDrag({ ...drag, trail: [...drag.trail, p], bonds, atoms, captions, moved: true });
      }
      case "box": {
        // Smart: atoms the box only just missed (all their neighbours are in it) come along too.
        const [lo, hi] = [[Math.min(drag.from[0], p[0]), Math.min(drag.from[1], p[1])], [Math.max(drag.from[0], p[0]), Math.max(drag.from[1], p[1])]];
        setSelection(complete(doc, new Set([...drag.base, ...atomsIn(doc, drag.from, p)])));
        setPicked(new Set([...drag.picks, ...captionsWhere(([x, y]) => x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1])]));
        return setDrag({ ...drag, to: p, moved: true });
      }
      case "lasso": {
        const points = [...drag.points, p];
        setSelection(complete(doc, new Set([...drag.base, ...atomsInPolygon(doc, points)])));
        setPicked(new Set([...drag.picks, ...captionsWhere((q) => inPolygon(q, points))]));
        return setDrag({ ...drag, points, moved: true });
      }
      case "move": {
        if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        // Snap within 6 screen px, unless snapping is off or ⌘ is held (Option is ChemDraw's copy, at the press).
        const raw: P = [p[0] - drag.from[0], p[1] - drag.from[1]], base = drag.base ?? doc, moving = drag.atoms ?? selection;
        // Text moving on its own snaps to the structures too.
        const textBox = !moving.size ? drag.textBox : undefined;
        const snapped = !settings.snap || e.metaKey ? { d: raw, guides: [] as Guide[], point: undefined }
          : moving.size ? snapMove(base, moving, raw, 6 / (view.zoom * L))
          : textBox ? { ...snapBox(doc, [textBox[0] / L, -textBox[3] / L, textBox[2] / L, -textBox[1] / L], raw, 6 / (view.zoom * L),
              (atoms) => { const b = union(atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i])); return b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L]; }), point: undefined }
          : { d: raw, guides: [] as Guide[], point: undefined };
        return setDrag({ ...drag, working: moveAll(base, snapped.d, drag.captions, drag.arrows, drag.cycles, moving), moved: true, guides: snapped.guides, point: snapped.point });
      }
    }
  }

  // Runs a shortcut action (see keys.ts for the list).
  // What an atom or bond key works on: the atom or bond under the pointer, else the one atom or bond selected
  // (so a key still works while the pointer is over the Actions panel).
  const keyTarget = (): { atom?: number; bond?: number } => {
    if (hover.atom !== undefined || hover.bond !== undefined) return { atom: hover.atom, bond: hover.bond };
    if (picked.size || !selection.size || selection.size > 2) return {};
    const ids = [...selection];
    if (ids.length === 1) return { atom: ids[0] };
    const b = doc.bonds.findIndex((x) => x.atoms.includes(ids[0]) && x.atoms.includes(ids[1]));
    return b >= 0 ? { bond: b } : {};
  };
  function run(id: string) {
    const [kind, arg] = id.split(".");
    const { atom, bond } = keyTarget();
    // As in ChemDraw: G selects the atom or bond under the pointer; Space takes Select and, over a structure,
    // selects all of it.
    if (id === "select.here") {
      if (atom !== undefined) { setPicked(new Set()); return setSelection(new Set([atom])); }
      if (bond !== undefined) { setPicked(new Set()); return setSelection(new Set(doc.bonds[bond].atoms)); }
      return;
    }
    if (id === "tool.select") {
      setTool("select");
      const one = hover.atom ?? (hover.bond !== undefined ? doc.bonds[hover.bond].atoms[0] : undefined);
      if (one !== undefined) { setPicked(new Set()); setSelection(new Set(fragments(doc).find((g) => g.includes(one)) ?? [one])); }
      else if (hover.caption !== undefined || hover.arrow !== undefined) { setSelection(new Set()); setPicked(new Set([(hover.caption ?? hover.arrow)!])); }
      return;
    }
    if (id === "atom.attach" && atom !== undefined) return set(setAtomMarks(doc, atom, { attach: !doc.atoms[atom].attach || undefined }));
    if (kind === "element" && atom !== undefined) return set(setElement(doc, atom, arg));
    if (kind === "label" && atom !== undefined) return set(setLabel(doc, atom, arg));
    if (id === "atom.label" && atom !== undefined) return editLabel(atom);
    if (id === "charge.plus" && atom !== undefined) return set(addCharge(doc, atom, 1));
    if (id === "charge.minus" && atom !== undefined) return set(addCharge(doc, atom, -1));
    if (kind === "group" && atom !== undefined) return set(addGroup(doc, atom, arg as Group));
    if (kind === "bond" && bond !== undefined) {
      if (arg in BONDS) return set(setBondSpec(doc, bond, BONDS[arg as BondKind].spec));
      if (arg === "left" || arg === "centre" || arg === "right") return set(setPosition(doc, bond, arg));
      if (arg === "chair1" || arg === "chair2") return set(addChair(doc, arg === "chair1" ? 1 : 2, { bond }));
      const ring = arg.startsWith("ring") ? RINGS[arg.slice(4) as RingKind] : RINGS[arg as RingKind];
      if (ring) return set(addRing(doc, ring.n, ring.aromatic, { bond }));
    }
    if (kind === "tool") {
      const ringTools: Record<string, RingKind> = { benzene: "benzene", cyclopentadiene: "cyclopentadiene", cyclohexane: "6", cyclopentane: "5" };
      if (ringTools[arg]) {
        setSettings((s) => ({ ...s, variants: { ...s.variants, ring: ringTools[arg] } }));
        return setTool("ring");
      }
      return setTool(arg as Tool);
    }
    if (kind === "eraser") return setSettings((s) => ({ ...s, eraser: Math.min(2, Math.max(0.05, s.eraser * (arg === "bigger" ? 1.25 : 0.8))) }));
    if (kind === "nudge" && (selection.size || picked.size)) {
      // 1 pt is 1/14.4 of a bond (ACS 1996). Up is +y in the drawing.
      const step = (arg.endsWith("10") ? 10 : 1) / 14.4, dir = arg.replace("10", "");
      const d: P = dir === "left" ? [-step, 0] : dir === "right" ? [step, 0] : dir === "up" ? [0, step] : [0, -step];
      const captions = new Map(placed.filter((c) => picked.has(c.id) && !doc.captions?.find((x) => x.id === c.id)?.under?.every((i) => selection.has(i))).map((c) => [c.id, anchorOf(c)]));
      return set(moveAll(doc, d, captions), true);
    }
    if (kind === "rotate" && selection.size) return set(rotateAtoms(doc, selection, (arg.startsWith("ccw") ? 1 : -1) * Number(arg.replace(/\D/g, ""))), true);
    if (id === "edit.delete") {
      if (selection.size || picked.size) return set(deleteGraphics(deleteAtoms(doc, selection), picked));
      if (hover.caption !== undefined) return set(deleteGraphics(doc, new Set([hover.caption])));
      // As in ChemDraw: the first Delete on a labelled atom removes the label; the next removes the atom.
      if (atom !== undefined) return set(doc.atoms[atom].label !== "C" ? setElement(doc, atom, "C") : deleteAtom(doc, atom));
      if (bond !== undefined) return set(deleteBond(doc, bond));
    }
  }

  // Structure to name: a checked name for each structure in the selection (or the drawing), where there is one.
  // Structure to name runs only when asked, once per structure: names are kept by the structure's own file text.
  const nameCache = useRef(new Map<string, string | null>());
  const nameFor = (g: number[]): string | undefined => {
    const part = subset(doc, new Set(g)), key = serialize(part);
    if (!nameCache.current.has(key)) {
      let name: string | undefined;
      try { name = checkedName(part, expandLabels(part), nameToSmiles, toInchi, cipOf); } catch { name = undefined; }
      nameCache.current.set(key, name ?? null);
    }
    return nameCache.current.get(key) ?? undefined;
  };
  // The structures to name. The ions of a salt (charged pieces within 3.5 bond lengths of each other whose charges
  // cancel) are named together, as sodium acetate rather than two names.
  const targets = () => {
    const all = fragments(doc).filter((g) => g.length && (!selection.size || g.some((i) => selection.has(i))));
    const charge = (g: number[]) => g.reduce((q, i) => q + (doc.atoms[i].charge ?? 0), 0);
    const ions = all.filter((g) => charge(g) !== 0), group = ions.map((_, k) => k);
    const root = (k: number): number => (group[k] === k ? k : (group[k] = root(group[k])));
    const near = (g: number[], h: number[]) => g.some((i) => h.some((j) => Math.hypot(pos(doc, i)[0] - pos(doc, j)[0], pos(doc, i)[1] - pos(doc, j)[1]) < 3.5));
    ions.forEach((g, k) => ions.forEach((h, j) => { if (j > k && near(g, h)) group[root(j)] = root(k); }));
    const salts = new Map<number, number[][]>();
    ions.forEach((g, k) => salts.set(root(k), [...(salts.get(root(k)) ?? []), g]));
    const merged = [...salts.values()].filter((gs) => gs.length > 1 && gs.reduce((q, g) => q + charge(g), 0) === 0);
    const inSalt = new Set(merged.flat());
    return [...all.filter((g) => !inSalt.has(g)), ...merged.map((gs) => gs.flat())];
  };
  // Structure to name: each named structure gets its name centred underneath (after its compound number).
  function nameStructures() {
    if (!namesLoaded) { void loadNames().then(() => setNamesLoaded(true)); return setNotice("Loading names. Try again in a moment."); }
    let m = doc, missed = 0;
    for (const atoms of targets()) {
      const name = nameFor(atoms);
      if (!name) { missed++; continue; }
      if (!m.captions?.some((c) => c.text === name && c.under?.some((i) => atoms.includes(i)))) m = addCaption(m, { text: name, x: 0, y: 0, under: atoms })[0];
    }
    setNotice(missed === 0 ? undefined : missed === 1 ? "Octet can't name this structure yet." : `Octet can't name ${missed} of these structures yet.`);
    if (m !== doc) set(m, true);
  }
  const nameable = loaded && doc.atoms.length > 0;
  // The colour the Actions panel shows as chosen: the first selected thing's, for every kind of selection.
  const selectionColour = (): { value: string; tints?: boolean } | undefined => {
    if (context.kind === "caption" || context.kind === "shape") return { value: context.colour, tints: context.kind === "shape" && context.shape === "highlight" };
    if (context.kind === "empty" || context.kind === "drawing") return undefined;
    const first = [...selection][0], thing = [...(doc.arrows ?? []), ...(doc.cycles ?? []), ...(doc.shapes ?? [])].find((x) => picked.has(x.id));
    return { value: (first !== undefined ? doc.atoms[first]?.colour : thing?.colour) ?? "#000000" };
  };
  // What the Actions panel shows: it follows the selection.
  const context: Context = (() => {
    // Typing, or the Text tool in hand: the panel is a text editor for that text (or the next text).
    if (writing) {
      const st = { ...(writing.id !== undefined ? doc.captions?.find((c) => c.id === writing.id) : undefined), ...writing.style };
      const range = richApi.current?.range() ?? [writing.value.length, writing.value.length], at = writing.pending ?? common(writing.runs ?? [{ text: writing.value }], range[0], range[1]);
      return { kind: "caption", mode: "typing", convertible: false, colour: at.colour ?? st.colour ?? style.colour, count: 1, bold: !!(at.bold ?? st.bold), italic: !!(at.italic ?? st.italic), underline: !!(at.underline ?? st.underline),
        size: at.size ?? st.size ?? style.captionSize, align: st.align ?? "centre", attached: false, attachable: false, script: at.script, font: at.font ?? st.font ?? style.captionFont, fonts: FONTS };
    }
    if (tool === "text" && !selection.size && !picked.size)
      return { kind: "caption", mode: "next", convertible: false, colour: textStyle.colour ?? style.colour, count: 1, bold: !!textStyle.bold, italic: !!textStyle.italic, underline: !!textStyle.underline, size: textStyle.size ?? style.captionSize, align: textStyle.align ?? "left", attached: false, attachable: false, font: textStyle.font ?? style.captionFont, fonts: FONTS };
    // A whole reaction picked (as a double-click on its arrow picks it).
    const reaction = reactionPicked();
    if (reaction) return { kind: "reaction", steps: reaction.arrows.length, structures: reaction.steps.filter((x) => x.kind === "structure").length, clean: reactionClean(reaction, arrows), mapped: reaction.atoms.some((i) => doc.atoms[i]?.map) };
    // A cycle picked (with its intermediates).
    const pickedCycle = (doc.cycles ?? []).find((c) => picked.has(c.id));
    if (pickedCycle) return { kind: "cycle", clockwise: pickedCycle.clockwise, steps: pickedCycle.nodes.length, centre: !!doc.captions?.some((c) => c.cycle?.cycle === pickedCycle.id && c.cycle.side === "centre") };
    // Shapes picked on their own.
    const pickedShapes = (doc.shapes ?? []).filter((x) => picked.has(x.id));
    if (!selection.size && pickedShapes.length && pickedShapes.length === picked.size) {
      const first = pickedShapes[0];
      return {
        kind: "shape", count: pickedShapes.length, shape: first.kind, dashed: !!first.dashed, colour: first.colour ?? (first.kind === "highlight" ? HIGHLIGHT : "#000000"),
        style: first.fill ?? (first.shadow ? "shadow" : first.dashed ? "dashed" : "plain"), side: first.side ?? "both", mark: first.mark ?? "", rf: !!first.tlc?.rf, grid: !!first.table?.grid, shade: { ...SHADE, ...first.shade, pt: style.bond },
      };
    }
    // Arrows picked on their own.
    const pickedArrows = (doc.arrows ?? []).filter((a) => picked.has(a.id));
    if (!selection.size && pickedArrows.length && pickedArrows.length === picked.size)
      return {
        kind: "arrow", count: pickedArrows.length, arrow: pickedArrows[0].kind, curved: pickedArrows.some(curved), style: pickedArrows[0].style ?? "plain", orbital: pickedArrows[0].orbital,
        heads: pickedArrows.every(takesHeads), ...headsOf(pickedArrows[0]), head: pickedArrows[0].head ?? "solid",
        closed: pickedArrows[0].curve ? !!pickedArrows[0].curve.closed : undefined, fill: pickedArrows[0].fill ?? "none",
        // The sweep the curved ones share, if it is one on offer.
        sweep: SWEEPS.find((sw) => pickedArrows.filter(curved).every((a) => Math.abs(sweepOf(a.bend ?? 0) - sw) < 2)),
      };
    if (!selection.size && picked.size) {
      const cs = (doc.captions ?? []).filter((c) => picked.has(c.id)), c = cs[0];
      if (c) {
        const p = placed.find((x) => x.id === c.id);
        return { kind: "caption", mode: "picked", colour: c.colour ?? style.colour, convertible: cs.length === 1 && namesLoaded && !!(nameToSmiles(c.text) || suggestName(c.text, false)), count: cs.length, bold: !!c.bold, italic: !!c.italic, underline: !!c.underline, size: c.size ?? style.captionSize, align: c.align ?? "centre", attached: !!c.under, attachable: !c.under && !!p && !!structureAbove(anchorOf(p), 4) };
      }
    }
    if (!selection.size) return doc.atoms.length || doc.captions?.length || doc.arrows?.length || doc.shapes?.length ? { kind: "drawing", nameable } : { kind: "empty" };
    const ids = [...selection].filter((i) => i < doc.atoms.length);
    if (ids.length === 1) {
      const a = doc.atoms[ids[0]];
      return { kind: "atom", label: a.text ?? a.label, charge: a.charge ?? 0, terminal: neighbours(doc, ids[0]).length === 1, carbon: a.label === "C" && !a.text, centre: stereocentres(doc).includes(ids[0]), enhanced: a.enhanced };
    }
    const bi = ids.length === 2 ? doc.bonds.findIndex((b) => selection.has(b.atoms[0]) && selection.has(b.atoms[1])) : -1;
    if (bi >= 0) {
      const b = doc.bonds[bi];
      const style = (Object.keys(BONDS) as BondKind[]).find((k) => {
        const spec: BondSpec = BONDS[k].spec;
        return spec.type === b.type && spec.stereo === b.stereo && spec.display === b.display;
      });
      return { kind: "bond", style, double: b.type === 2, flippable: !!b.stereo || b.display === "dative" || b.display === "hollow" };
    }
    // Lone pairs: whether the heteroatoms have any to show, and whether they all show already.
    const hetero = ids.filter((i) => doc.atoms[i].label !== "C" && freePairs(doc, i) > 0);
    const pairs = !hetero.length ? undefined : hetero.every((i) => (doc.atoms[i].pairs ?? 0) >= freePairs(doc, i)) ? "shown" as const : "hidden" as const;
    // Its stereocentres as a whole: absolute (no flags), racemic (all &1), relative (all or1), or a mix.
    const centres = stereocentres(doc, selection), flags = new Set(centres.map((i) => doc.atoms[i].enhanced ?? ""));
    const stereo = !centres.length ? undefined : flags.size > 1 ? "mixed" : flags.has("&1") ? "racemic" : flags.has("or1") ? "relative" : flags.has("") ? "absolute" : "mixed";
    // A 3D structure (Structure Perspective): drawn with depth, or flat.
    const solid = ids.some((i) => Math.abs(doc.atoms[i].location[2] ?? 0) > 1e-3);
    return { kind: "structure", atoms: ids.length, structures: fragments(doc).filter((g) => g.some((i) => selection.has(i))).length, next: nextNumber(doc), nameable, pairs, stereo,
      ...(solid ? { depth: !ids.some((i) => doc.atoms[i].depth === false) } : {}) };
  })();
  // What the panel knows about the drawing: formula and mass (of the selection, or everything), problems, mess.
  const analysis = useMemo(() => (loaded ? analyse(selection.size ? subset(doc, selection) : doc) : undefined), [loaded, doc, selection]);
  const found = useMemo(() => problems(doc), [doc]);
  const untidy = useMemo(() => messy(doc, selection), [doc, selection]);
  // Text the panel asked to copy; the copy handler uses it instead of SMILES.
  const copyText = useRef<string>(undefined);

  // The key to show beside an action: menu shortcuts, then the user's shortcut table.
  const MENU_KEYS: Record<string, string> = {
    invert_selection: `⇧${MOD}I`, clean_reaction: `⇧${MOD}X`, paste_hint: `${MOD}V`, clean_up: `⇧${MOD}K`, flip_h: `⇧${MOD}H`, flip_v: `⇧${MOD}V`, select_all: `${MOD}A`, zoom_fit: `${MOD}/`, copy_smiles: `⌥${MOD}C`, delete: "⌫",
    structure_to_name: `⌥${MOD}N`, "shape.front": `${MOD}[`, "shape.back": `${MOD}]`,
    settings: `${MOD},`, name_to_structure: `⇧${MOD}N`, "caption.bold": `${MOD}B`, "caption.italic": `${MOD}I`, "caption.underline": `${MOD}U`, "caption.sub": `${MOD}−`, "caption.super": `${MOD}+`, "caption.plain": `${MOD}T`, "caption.formula": `${MOD}F`, "caption.edit": keyLabel("enter"),
  };
  const hint = (command: string) => {
    if (MENU_KEYS[command]) return MENU_KEYS[command];
    const first = keymap(settings.keys)[command]?.[0];
    return first ? keyLabel(first) : undefined;
  };

  // The names drawn before that match what is typed (all of them when nothing is), five at a time until opened.
  const historyMatches = naming === undefined ? [] : settings.nameHistory.filter(({ name: n }) => { const q = naming.trim().toLowerCase(); return !q || (n.toLowerCase().includes(q) && n.toLowerCase() !== q); });
  const historyRows = recent.all ? historyMatches : historyMatches.slice(0, 5), historyMore = !recent.all && historyMatches.length > 5;
  const historyMol = ({ name, smiles }: { name: string; smiles: string }) => {
    if (!historyMols.current.has(name) && loaded && (smiles || namesLoaded)) {
      let m: Mol | undefined;
      try { m = smiles ? parseStructure(smiles) : structureFor(name); } catch { m = undefined; }
      historyMols.current.set(name, m?.atoms.length ? m : undefined);
    }
    return historyMols.current.get(name);
  };
  const pickHistory = (entry: { name: string; smiles: string }) => {
    const frag = historyMol(entry) ?? structureFor(entry.name);
    if (!frag) return;
    place(frag);
    rememberName(entry.name, frag);
    setNaming(undefined);
  };

  // Everything the command palette offers: the actions for the selection, the menu commands, every tool and
  // variant (templates too), and the Settings modules. Each shows its shortcut where it has one.
  const MENU_NAMES: Record<string, [string, string | undefined, React.ReactNode]> = {
    new: ["New drawing", `${MOD}N`, <FilePlus size={18} />], open: ["Open…", `${MOD}O`, <FolderOpen size={18} />], import: ["Import a structure…", "", <FileArrowDown size={18} />],
    save: ["Save", `${MOD}S`, <FloppyDisk size={18} />], save_as: ["Save as…", `⇧${MOD}S`, <FloppyDisk size={18} />],
    undo: ["Undo", `${MOD}Z`, <ArrowCounterClockwise size={18} />], redo: ["Redo", `${MOD}Y`, <ArrowClockwise size={18} />], invert_selection: ["Invert selection", `⇧${MOD}I`, <SelectionInverse size={18} />], clean_reaction: ["Clean up reaction", `⇧${MOD}X`, <MagicWand size={18} />],
    mirror_h: ["Flip horizontal", "", <FlipHorizontal size={18} />], mirror_v: ["Flip vertical", "", <FlipVertical size={18} />],
    structure_perspective: ["Structure perspective", `⌥${MOD}S`, <Cube size={18} />], flatten: ["Flatten", "", <Square size={18} />],
    rotate_dialog: ["Rotate…", `${MOD}R`, <ArrowClockwise size={18} />], scale_dialog: ["Scale…", `${MOD}K`, <ArrowsOutSimple size={18} />],
    group: ["Group", `${MOD}G`, <BoundingBox size={18} />], ungroup: ["Ungroup", `⇧${MOD}G`, <SelectionSlash size={18} />],
    arrange_left: ["Align left edges", `⇧⌥${MOD}L`, <AlignLeft size={18} />], arrange_centre: ["Align left-right centres", `⇧⌥${MOD}C`, <AlignCenterHorizontal size={18} />],
    arrange_right: ["Align right edges", `⇧⌥${MOD}R`, <AlignRight size={18} />], arrange_top: ["Align top edges", `⇧⌥${MOD}T`, <AlignTop size={18} />],
    arrange_middle: ["Align top-bottom centres", `⇧⌥${MOD}M`, <AlignCenterVertical size={18} />], arrange_bottom: ["Align bottom edges", `⇧⌥${MOD}B`, <AlignBottom size={18} />],
    arrange_across: ["Distribute horizontally", `⇧⌥${MOD}H`, <ArrowsOutLineHorizontal size={18} />], arrange_down: ["Distribute vertically", `⇧⌥${MOD}V`, <ArrowsOutLineVertical size={18} />], select_all: ["Select all", `${MOD}A`, <SelectionAll size={18} />],
    clean_up: ["Clean up", `⇧${MOD}K`, <MagicWand size={18} />], flip_h: ["Rotate 180° horizontal", `⇧${MOD}H`, <FlipHorizontal size={18} />], flip_v: ["Rotate 180° vertical", `⇧${MOD}V`, <FlipVertical size={18} />],
    zoom_in: ["Magnify", `⇧${MOD}>`, <MagnifyingGlassPlus size={18} />], zoom_out: ["Reduce", `⇧${MOD}<`, <MagnifyingGlassMinus size={18} />],
    zoom_actual: ["Actual size", `${MOD}\\`, <FrameCorners size={18} />], zoom_fit: ["Fit to window", `${MOD}/`, <ArrowsOutSimple size={18} />],
    name_to_structure: ["Name to structure", `⇧${MOD}N`, <AtomIcon size={18} />],
    snap: [settings.snap ? "Turn snapping off" : "Turn snapping on", undefined, <LinkSimple size={18} />],
    actions: [settings.actions ? "Hide the Actions panel" : "Show the Actions panel", undefined, <SlidersHorizontal size={18} />],
    text_bold: ["Bold", `${MOD}B`, <TextB size={18} />], text_italic: ["Italic", `${MOD}I`, <TextItalic size={18} />], text_underline: ["Underline", `${MOD}U`, <TextUnderline size={18} />],
    align_left: ["Flush left", `⇧${MOD}L`, <TextAlignLeft size={18} />], align_centre: ["Centre text", `⇧${MOD}C`, <TextAlignCenter size={18} />], align_right: ["Flush right", `⇧${MOD}R`, <TextAlignRight size={18} />],
  };
  const paletteCommands = (): Command[] => {
    const toolKey = (id: string) => { const k = keymap(settings.keys)[id]?.[0]; return k ? keyLabel(k) : undefined; };
    const pick = (t: Tool, variant?: [string, string]) => () => { if (variant) setSettings((s) => ({ ...s, variants: { ...s.variants, [variant[0]]: variant[1] } })); setTool(t); };
    const variants = (t: Tool, slot: string, list: [string, string, React.ReactNode][], group: string, words = ""): Command[] =>
      list.map(([kind, name, icon]) => ({ id: `${t}:${kind}`, name, group, icon, words, run: pick(t, [slot, kind]) }));
    // A menu command that is also one of the selection's actions shows once, as the action.
    const acts = actionItems(context, untidy), acted = new Set(acts.map((i) => i.command));
    return [
      ...acts.map((i) => ({ id: `action:${i.command}`, name: i.name, group: "Actions", icon: i.icon, keys: hint(i.command), run: () => runAction(i.command) })),
      ...Object.entries(MENU_NAMES).filter(([id]) => commands.current[id] && !acted.has(id)).map(([id, [name, keys, icon]]) => ({ id: `menu:${id}`, name, group: "Commands", keys, icon, run: () => commands.current[id]() })),
      { id: "tool:select", name: "Select", group: "Tools", keys: toolKey("tool.select"), icon: <Selection size={18} />, run: pick("select", ["select", "box"]) },
      { id: "tool:lasso", name: "Lasso", group: "Tools", icon: <Lasso size={18} />, run: pick("select", ["select", "lasso"]) },
      ...variants("bond", "bond", (Object.keys(BONDS) as BondKind[]).map((k) => [k, `${BONDS[k].name} bond`, <BondGlyph kind={k} />]), "Bonds"),
      { id: "tool:chain", name: "Chain", group: "Tools", keys: toolKey("tool.chain"), icon: <ChainGlyph />, run: pick("chain") },
      ...variants("ring", "ring", (Object.keys(RINGS) as RingKind[]).map((k) => [k, RINGS[k].name, <RingGlyph kind={k} />]), "Rings"),
      ...LIBRARY.flatMap((c) => variants("template", "template", c.items.map((t) => [t.kind, t.name, <TemplateGlyph mol={t.mol} />]), c.name, "template")),
      ...templates.map((t) => ({ id: `template:${templateKind(t.id)}`, name: t.name, group: "My templates", icon: <TemplateGlyph mol={t.mol} />, run: pick("template", ["template", templateKind(t.id)]) })),
      ...variants("symbol", "symbol", Object.entries(SYMBOLS).map(([k, n]) => [k, n, <SymbolGlyph kind={k as SymbolKind} />]), "Symbols"),
      ...variants("arrow", "arrow", ["reaction", "equilibrium", "resonance", "retro", "nogo", ...["curved", "fishhook", "double"].flatMap((k) => SWEEPS.map((sw) => `${k}-${sw}`))]
        .map((k) => [k, `${arrowName(k)} arrow`, <ArrowGlyph kind={k} />]), "Arrows"),
      ...variants("shape", "shape", [...SHAPE_GRID.flat(), ...SHAPE_EXTRA].map((k) => [k, shapeName(k)!, <ElementGlyph v={k} />]), "Shapes"),
      ...variants("bracket", "bracket", Object.entries(BRACKETS).map(([k, n]) => [k, n, <BracketGlyph v={k} />]), "Brackets"),
      ...variants("orbital", "orbital", ORBITAL_GRID.flat().map((k) => [k, orbitalName(k)!, <OrbitalGlyph v={k} />]), "Orbitals"),
      { id: "tool:text", name: "Text", group: "Tools", keys: toolKey("tool.text"), icon: <TextT size={18} />, run: pick("text") },
      { id: "tool:erase", name: "Eraser", group: "Tools", icon: <Eraser size={18} />, run: pick("erase") },
      ...([["document", "Document settings", <FileText size={18} />], ["keys", "Keyboard shortcuts", <Keyboard size={18} />], ["files", "Import and export settings", <ArrowsDownUp size={18} />]] as [ModuleId, string, React.ReactNode][])
        .map(([id, name, icon]) => ({ id: `settings:${id}`, name, group: "Settings", icon, run: () => setSettingsOpen(id) })),
      { id: "settings:open", name: "Settings", group: "Settings", keys: `${MOD},`, icon: <GearSix size={18} />, run: () => commands.current.settings() },
    ];
  };
  // A typed name (spelling mended) or SMILES, as a command that draws it.
  const drawCommand = (q: string): Command | undefined => {
    const text = q.trim();
    if (text.length < 2) return undefined;
    let frag = structureFor(text), shown = text;
    if (!frag && namesLoaded) { const fixed = suggestName(text, false); if (fixed) { frag = structureFor(fixed); shown = fixed; } }
    if (!frag && loaded && /^[A-Za-z0-9@+\-[\]()=#$%/\\.:*]+$/.test(text) && /[cCnNoOsS]/.test(text)) {
      try { const m = parseStructure(text); if (m.atoms.length) frag = m; } catch { /* not SMILES either */ }
    }
    return frag ? { id: `draw:${shown}`, name: `Draw ${shown}`, group: "Structure", icon: <TemplateGlyph mol={frag} />, run: () => { place(frag!); if (structureFor(shown)) rememberName(shown, frag!); } } : undefined;
  };

  // Runs an action from the panel on the selected atom, bond or atoms.
  function runAction(command: string) {
    const ids = [...selection];
    if (commands.current[command]) return commands.current[command]();
    // Colour, for everything selected, as ChemDraw's Color menu: atoms (their labels and marks), the bonds between
    // them, and every picked arrow, orbital, line, shape, cycle and caption. Black is the document's ink.
    if (command.startsWith("colour.")) {
      const hex = command.slice(7), ink = hex.toLowerCase() === "#000000" ? undefined : hex;
      if (context.kind === "caption") return runAction(`caption.colour.${hex}`);
      if (context.kind === "shape") return runAction(`shape.colour.${hex}`);
      const pick = <T extends { id: number; colour?: string }>(x: T): T => (picked.has(x.id) ? { ...x, colour: ink } : x);
      return set({
        ...doc,
        atoms: context.kind === "bond" ? doc.atoms : doc.atoms.map((a, i) => (selection.has(i) ? { ...a, colour: ink } : a)), // a bond alone keeps its atoms' colours
        bonds: doc.bonds.map((b) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? { ...b, colour: ink } : b)),
        arrows: doc.arrows?.map(pick), shapes: doc.shapes?.map(pick), cycles: doc.cycles?.map(pick),
        captions: doc.captions?.map((c) => (picked.has(c.id) ? { ...c, colour: hex.toLowerCase() === style.colour.toLowerCase() ? undefined : hex } : c)),
      }, true);
    }
    if (command === "copy_smiles") return void document.execCommand("copy");
    if (command === "paste_hint") return setNotice(`Copy a SMILES string or MOL file, then press ${MOD}V here.`);
    if (command.startsWith("copy_text:")) { copyText.current = command.slice(10); document.execCommand("copy"); return; }
    if (command.startsWith("fix:")) { const [, i, charge] = command.split(":"); return set(addCharge(doc, Number(i), Number(charge) - (doc.atoms[Number(i)].charge ?? 0)), true); }
    if (command.startsWith("show:")) return setSelection(new Set([Number(command.slice(5))]));
    if (command.startsWith("align.")) return set(alignFragments(doc, selection, command.slice(6) as "row" | "column" | "spread-row"), true);
    if (command === "delete") return selection.size || picked.size ? set(deleteGraphics(deleteAtoms(doc, selection), picked)) : undefined;
    if (command === "number") return numberStructures();
    if (command === "reaction.clean") { const r = reactionPicked(); return r ? set(cleanUpReaction(doc, r, arrows), true) : undefined; }
    // Atom mapping: the first step of the picked reaction (what stands before its first arrow, and between that
    // arrow and the next), numbered by Indigo; or every number cleared.
    if (command === "reaction.map" || command === "reaction.unmap") {
      const r = reactionPicked();
      if (!r) return;
      const first = r.steps.findIndex((x) => x.kind === "arrow"), next = r.steps.findIndex((x, k) => k > first && x.kind === "arrow");
      const side = (from: number, to: number) => r.steps.slice(from, to < 0 ? undefined : to).flatMap((x) => (x.kind === "structure" ? [x.atoms] : []));
      const left = side(0, first), right = side(first + 1, next);
      if (command === "reaction.unmap") return set({ ...doc, atoms: doc.atoms.map((a, i) => (r.atoms.includes(i) ? { ...a, map: undefined } : a)) }, true);
      const maps = mapReaction(left.map((g) => subset(doc, new Set(g))), right.map((g) => subset(doc, new Set(g))));
      if (!maps) return setNotice("Octet couldn't map these atoms.");
      const number = new Map<number, number>();
      left.forEach((g, k) => g.forEach((i, j) => { const n = maps.reactants[k][j]; if (n) number.set(i, n); }));
      right.forEach((g, k) => g.forEach((i, j) => { const n = maps.products[k][j]; if (n) number.set(i, n); }));
      return set({ ...doc, atoms: doc.atoms.map((a, i) => (number.has(i) ? { ...a, map: number.get(i) } : r.atoms.includes(i) ? { ...a, map: undefined } : a)) }, true);
    }
    if (command.startsWith("cycle.")) return cycleAction(command.slice(6));

    // Enhanced stereo: one stereocentre's flag (again to take it off), or every stereocentre in the selection at once.
    if (command.startsWith("stereo.")) {
      const [, what, arg] = command.split(".");
      if (what === "atom") { const i = [...selection][0]; return set(setEnhanced(doc, [i], doc.atoms[i].enhanced === arg ? undefined : arg), true); }
      return set(setEnhanced(doc, stereocentres(doc, selection), what === "racemic" ? "&1" : what === "relative" ? "or1" : undefined), true);
    }
    if (command.startsWith("shape.")) {
      const [, what, arg] = command.split(".");
      const ids = new Set((doc.shapes ?? []).filter((x) => picked.has(x.id)).map((x) => x.id));
      const each = (f: (x: Shape) => Partial<Shape>) => set({ ...doc, shapes: doc.shapes?.map((x) => (ids.has(x.id) ? { ...x, ...f(x) } : x)) }, true);
      if (what === "kind") {
        setSettings((s) => ({ ...s, variants: { ...s.variants, shape: arg } }));
        // A colour made for a highlight's fill (or an outline) does not carry over between the two.
        return each((x) => ({ kind: arg as ShapeKind, ...((x.kind === "highlight") !== (arg === "highlight") ? { colour: undefined } : {}) }));
      }
      if (what === "dashed") return each((x) => ({ dashed: !x.dashed || undefined }));
      // A shadow's depth, softness and opacity (in hundredths), from the Actions sliders: a drag is one undo step.
      if (what === "depth" || what === "blur" || what === "opacity") {
        const value = Number(arg) / 100;
        return set({ ...doc, shapes: doc.shapes?.map((x) => (ids.has(x.id) ? { ...x, shade: { ...SHADE, ...x.shade, [what]: value } } : x)) }, true, `shade-${what}-${[...ids].join()}`);
      }
      // TLC plates: a lane more or fewer (spots in a lane that goes go with it), and Rf values on or off.
      if (what === "lanes") return each((x) => { const lanes = Math.max(1, Math.min(40, (x.tlc?.lanes ?? 1) + Number(arg))); return { tlc: { ...x.tlc!, lanes, spots: (x.tlc?.spots ?? []).filter((y) => y.lane < lanes) } }; });
      if (what === "rf") return each((x) => ({ tlc: { ...x.tlc!, rf: !x.tlc?.rf || undefined } }));
      // Tables: a row or column more or fewer, and journal rules or a full grid.
      if (what === "rows" || what === "cols") return each((x) => { const cells = x.table?.cells ?? [[""]], n = Number(arg); return resizeTable(x, cells.length + (what === "rows" ? n : 0), cells[0].length + (what === "cols" ? n : 0), cellWidth); });
      if (what === "grid") return each((x) => ({ table: { ...x.table!, grid: !x.table?.grid || undefined } }));
      // One style at a time: plain, dashed, shaded, filled or with a shadow.
      if (what === "style") return each(() => ({ dashed: arg === "dashed" || undefined, fill: arg === "shaded" || arg === "solid" ? arg : undefined, shadow: arg === "shadow" || undefined }));
      if (what === "side") return each(() => ({ side: arg === "both" ? undefined : (arg as "left" | "right") }));
      if (what === "mark") return each((x) => ({ mark: x.mark === arg ? undefined : arg }));
      if (what === "colour") return each(() => ({ colour: arg }));
      // Bring to the front or send to the back: the order shapes are drawn in.
      if (what === "front" || what === "back") {
        const mine = (doc.shapes ?? []).filter((x) => ids.has(x.id)), rest = (doc.shapes ?? []).filter((x) => !ids.has(x.id));
        return set({ ...doc, shapes: what === "front" ? [...rest, ...mine] : [...mine, ...rest] }, true);
      }
    }
    if (command.startsWith("orbital.")) {
      const [, what, arg] = command.split(".");
      const ids = new Set((doc.arrows ?? []).filter((a) => picked.has(a.id) && isOrbital(a)).map((a) => a.id));
      const each = (f: (a: Arrow) => Partial<Arrow>) => set({ ...doc, arrows: doc.arrows?.map((a) => (ids.has(a.id) ? { ...a, ...f(a) } : a)) }, true);
      const first = doc.arrows?.find((a) => ids.has(a.id));
      if (first?.orbital && (what === "shape" || what === "phase")) {
        const next = { ...first.orbital, [what]: arg } as NonNullable<Arrow["orbital"]>;
        if (next.phase === "phased" && !["p", "d", "dz2", "hybrid"].includes(next.shape)) next.phase = "filled";
        setSettings((s) => ({ ...s, variants: { ...s.variants, orbital: `${next.shape}-${next.phase}` } }));
        return each((a) => ({ orbital: { ...a.orbital!, [what]: arg, ...(next.phase !== (what === "phase" ? arg : a.orbital!.phase) ? { phase: next.phase } : {}) } as Arrow["orbital"] }));
      }
      // Turning an orbital round swaps its phases.
      if (what === "swap") return each((a) => ({ to: [2 * a.from[0] - a.to[0], 2 * a.from[1] - a.to[1]] }));
    }
    if (command.startsWith("arrow.")) {
      const [, what, arg] = command.split(".");
      const ids = new Set((doc.arrows ?? []).filter((a) => picked.has(a.id)).map((a) => a.id)), id = [...ids][0];
      const each = (f: (a: Arrow) => Partial<Arrow>) => set({ ...doc, arrows: doc.arrows?.map((a) => (ids.has(a.id) ? { ...a, ...f(a) } : a)) }, true);
      if (what === "kind") {
        // Switching between straight and curved adds or drops the bend.
        const kind = arg as ArrowKind, bent = curved({ kind }), first = doc.arrows?.find((a) => ids.has(a.id));
        setSettings((s) => ({ ...s, variants: { ...s.variants, arrow: bent ? `${kind}-${first?.bend ? nearestSweep(first.bend) : 120}` : kind } }));
        return each((a) => ({ kind, bend: bent ? (a.bend || sweepBend(120)) : undefined }));
      }
      if (what === "sweep") {
        const first = doc.arrows?.find((a) => ids.has(a.id) && curved(a));
        if (first) setSettings((s) => ({ ...s, variants: { ...s.variants, arrow: `${first.kind}-${arg}` } }));
        return each((a) => (curved(a) ? { bend: (Math.sign(a.bend ?? 1) || 1) * sweepBend(Number(arg)) } : {}));
      }
      if (what === "reverse") return each((a) => ({ from: a.to, to: a.from, ...(a.bend ? { bend: -a.bend } : {}), ...(a.curve ? { curve: { ...a.curve, points: [...a.curve.points].reverse().map((q) => ({ at: q.at, ...(q.c2 ? { c1: q.c2 } : {}), ...(q.c1 ? { c2: q.c1 } : {}) })) } } : {}), ...(a.start || a.end ? { start: a.end, end: a.start } : {}) }));
      // The Curves model: a head at the start or end (again with the same head takes it off), the heads' shape,
      // a pen curve closed or opened, and a closed curve's fill (again takes it off).
      if (what === "start" || what === "end") {
        const h = arg as Head, all = (doc.arrows ?? []).filter((a) => ids.has(a.id) && takesHeads(a)), on = all.every((a) => headsOf(a)[what] === h);
        return each((a) => (takesHeads(a) ? { [what]: on && h !== "none" ? "none" : h } : {}));
      }
      if (what === "head") return each(() => ({ head: arg === "solid" ? undefined : (arg as HeadShape) }));
      if (what === "closed") return each((a) => (a.curve ? { curve: { ...a.curve, closed: !a.curve.closed || undefined }, ...(a.curve.closed ? { fill: undefined } : {}) } : {}));
      if (what === "fill") return each((a) => (a.curve?.closed ? { fill: arg === "none" || a.fill === arg ? undefined : (arg as CurveFill) } : {}));
      // A style chip sets it; the arrows' Dashed line action turns dashes on and off.
      if (what === "style") return each((a) => ({ style: arg === "plain" || (arg === "dashed" && a.style === "dashed" && !isLine(a) && a.kind !== "curve") ? undefined : (arg as Arrow["style"]) }));
      if (what === "flip") return each((a) => ({ bend: -(a.bend ?? sweepBend(120)) }));
      if ((what === "above" || what === "below") && id !== undefined) {
        setPicked(new Set());
        return openWriting({ value: "", on: { arrow: id, side: what }, style: { ...textStyle } });
      }
    }
    if (command === "template.add") return addSelectionAsRing();
    if (command === "caption.add") {
      // A new caption under the selected structures, centred on them.
      const under = fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat();
      setSelection(new Set());
      return openWriting({ value: "", under, style: { ...textStyle } });
    }
    if (command.startsWith("caption.")) {
      const [, what, ...rest] = command.split("."), arg = rest.join(".");
      // Text styles: on the characters selected while typing (or the next ones typed), else on whole captions.
      const toggle = (key: "bold" | "italic" | "underline") => (s: RunStyle, all: RunStyle): RunStyle => ({ ...s, [key]: all[key] ? undefined : true });
      const script = (to: "sub" | "super") => (s: RunStyle, all: RunStyle): RunStyle => ({ ...s, script: all.script === to ? undefined : to });
      const patches: Record<string, ((s: RunStyle, all: RunStyle) => RunStyle) | undefined> = {
        bold: toggle("bold"), italic: toggle("italic"), underline: toggle("underline"), sub: script("sub"), super: script("super"),
        plain: (s) => ({ ...s, bold: undefined, italic: undefined, underline: undefined, script: undefined }),
        font: (s) => ({ ...s, font: arg === style.captionFont ? undefined : arg }),
      };
      if (what === "formula") return formulaText();
      if (patches[what] && (writing || what === "sub" || what === "super" || what === "plain" || what === "font")) return styleText(patches[what]!, what);
      if (what === "bold") return restyle((c) => ({ bold: !c.bold }));
      if (what === "italic") return restyle((c) => ({ italic: !c.italic }));
      if (what === "underline") return restyle((c) => ({ underline: !c.underline }));
      if (what === "size" && writing && richApi.current?.range()?.[0] !== richApi.current?.range()?.[1]) return styleText((s) => ({ ...s, size: Number(arg) }), what);
      if (what === "size") return restyle(() => ({ size: Number(arg) === style.captionSize ? undefined : Number(arg) }));
      if (what === "align") return restyle(() => ({ align: arg as Caption["align"] }));
      if (what === "colour") return restyle(() => ({ colour: arg.toLowerCase() === style.colour.toLowerCase() ? undefined : arg }));
      const id = [...picked][0];
      if (what === "edit" && id !== undefined) return startWriting({ id });
      if (what === "detach" || what === "attach") {
        // Detach leaves the caption where it is, as free text. Attach centres it under the structure above it.
        const moves = new Map(placed.filter((c) => picked.has(c.id)).map((c) => [c.id, anchorOf(c)]));
        return set({
          ...doc,
          captions: doc.captions?.map((c) => {
            const at = moves.get(c.id);
            if (!at) return c;
            if (what === "detach") { const { under: _, ...free } = c; return { ...free, x: at[0], y: at[1] }; }
            const under = structureAbove(at, 4);
            return under ? { ...c, under, align: undefined } : c;
          }),
        }, true);
      }
    }
    if (command.startsWith("rotate.")) return run(command);
    if (command === "pairs") return set(toggleLonePairs(doc, [...selection]), true);
    if (context.kind === "atom") {
      const i = ids[0], [kind, arg] = command.split(".");
      if (kind === "element") return set(setElement(doc, i, arg), true);
      if (command.startsWith("label:")) return set(setLabel(doc, i, command.slice(6)), true);
      if (kind === "group") return set(addGroup(doc, i, arg as Group));
      if (command === "atom.label") return editLabel(i);
      if (command === "charge.plus" || command === "charge.minus") return set(addCharge(doc, i, command === "charge.plus" ? 1 : -1), true);
    }
    if (context.kind === "bond") {
      const bi = doc.bonds.findIndex((b) => selection.has(b.atoms[0]) && selection.has(b.atoms[1])), arg = command.split(".")[1];
      if (arg in BONDS) return set(setBondSpec(doc, bi, BONDS[arg as BondKind].spec), true);
      const ring = arg.startsWith("ring") ? RINGS[arg.slice(4) as RingKind] : arg === "benzene" ? RINGS.benzene : undefined;
      if (ring) return set(addRing(doc, ring.n, ring.aromatic, { bond: bi }));
      if (arg === "left" || arg === "centre" || arg === "right") return set(setPosition(doc, bi, arg), true);
      if (arg === "flip") return set(flipBond(doc, bi), true);
    }
  }

  // What a click does with each tool in hand.
  function click(t: Hover, at: P) {
    if (t.caption !== undefined && tool !== "text") return; // a caption was picked, not drawn on
    if (tool === "bond") {
      if (t.atom !== undefined) return set(sprout(doc, t.atom, bondSpec));
      if (t.bond === undefined) return set(sprout(doc, at, bondSpec));
      // On a bond: single cycles 1, 2, 3; any other style sets it; a wedge or dative clicked again flips round.
      if (bondKind === "single") return set(cycleBond(doc, t.bond));
      const b = doc.bonds[t.bond], same = b.type === bondSpec.type && b.stereo === bondSpec.stereo && b.display === bondSpec.display;
      if (same && (bondSpec.stereo || bondSpec.display === "dative")) return set(flipBond(doc, t.bond));
      return set(setBondSpec(doc, t.bond, bondSpec));
    }
    if (tool === "chain") return set(sprout(doc, t.atom ?? at));
    if (tool === "symbol") return t.atom !== undefined ? set(addSymbol(doc, t.atom, symbolKind)) : undefined;
    if (tool === "bracket" && "mark" in bracketPick) {
      // A dagger goes on a bracket clicked (again takes it off), or stands alone where clicked.
      const sh = t.arrow !== undefined ? doc.shapes?.find((x) => x.id === t.arrow && isBracket(x)) : undefined;
      if (sh) return set(updateShape(doc, sh.id, { mark: sh.mark === bracketPick.mark ? undefined : bracketPick.mark }));
      return set(addCaption(doc, { text: bracketPick.mark, x: at[0], y: at[1], align: "left" })[0]);
    }
    if (tool === "shape" || tool === "bracket") {
      // A click puts the shape round the structure or caption clicked (Add Frame puts one round a selection).
      const one = t.atom ?? (t.bond !== undefined ? doc.bonds[t.bond].atoms[0] : undefined);
      const atoms = one !== undefined ? fragments(doc).find((g) => g.includes(one)) ?? [] : [];
      const boxes = [...atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i]), ...placed.filter((c) => c.id === t.caption).map((c) => c.box)];
      const b = boxes.length ? union(boxes) : undefined;
      if (!b) return;
      const pad = (tool === "bracket" ? 0.3 : 0.4) * L, sh = shapeFrom([0, 0], [1, 1]);
      if (!sh) return;
      // A circle round something is the smallest circle round its box.
      const round = "circle" in shapePick && shapePick.circle && tool === "shape", cx = (b[0] + b[2]) / 2 / L, cy = -(b[1] + b[3]) / 2 / L, r = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 / L + pad / L;
      const [mol, id] = addShape(doc, { ...sh, ...(round ? { from: [cx - r, cy - r], to: [cx + r, cy + r] } : { from: [(b[0] - pad) / L, -(b[3] + pad) / L], to: [(b[2] + pad) / L, -(b[1] - pad) / L] }) });
      set(mol);
      setSelection(new Set());
      return setPicked(new Set([id]));
    }
    if (tool === "template") {
      const mol = templateMol(templateVariant);
      return mol ? set(addTemplate(doc, mol, t.bond !== undefined ? { bond: t.bond } : t.atom !== undefined ? { atom: t.atom } : { point: at })) : undefined;
    }
    if (tool === "ring") {
      const custom = templates.find((x) => templateKind(x.id) === ringKind) ?? libraryItem(ringKind);
      if (custom) return set(addTemplate(doc, custom.mol, t.bond !== undefined ? { bond: t.bond } : t.atom !== undefined ? { atom: t.atom } : { point: at }));
      const r: { n: number; aromatic: boolean; chair?: 1 | 2 } = RINGS[ringKind as RingKind];
      if (r.chair) return set(addChair(doc, r.chair, t.bond !== undefined ? { bond: t.bond } : { point: at }));
      return set(addRing(doc, r.n, r.aromatic, t.bond !== undefined ? { bond: t.bond } : t.atom !== undefined ? { atom: t.atom } : { point: at }));
    }
    if (tool === "text") {
      if (t.atom !== undefined) return editLabel(t.atom);
      return startWriting(t.caption !== undefined ? { id: t.caption } : { at });
    }
    if (tool === "select") setSelection(new Set(atomsOf(doc, t)));
  }

  function onPointerUp() {
    stopHold();
    if (spring) { setTool(spring); setSpring(undefined); }
    if (!drag) return;
    setDrag(undefined);
    switch (drag.kind) {
      case "bond": {
        const { to, from, target: t, at } = drag;
        if (to) return set(bondTo(doc, from, to, bondSpec));
        return click(t, at);
      }
      case "arrow": {
        // A click makes an arrow of the usual length (three bonds; a short arc for a curved one), going right.
        const to: P = drag.to ?? (drag.make?.kind === "orbital" ? orbitalTip(drag.make, drag.from, drag.target) : curved({ kind: drag.make?.kind ?? arrowKind }) ? [drag.from[0] + 1.5, drag.from[1]] : [drag.from[0] + 3, drag.from[1]]);
        if (Math.hypot(to[0] - drag.from[0], to[1] - drag.from[1]) < 0.2) return;
        const [mol, id] = addArrow(doc, newArrow(drag.from, to, drag.side, drag.make));
        set(mol);
        return setPicked(new Set([id]));
      }
      case "shape": {
        // Too small to be a shape is a click. A circle needs only a radius; anything else both a width and a height.
        const round = tool === "shape" && "circle" in shapePick && shapePick.circle;
        const tiny = !drag.to || (round ? Math.hypot(drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]) < 0.1 : Math.abs(drag.to[0] - drag.from[0]) < 0.1 || Math.abs(drag.to[1] - drag.from[1]) < 0.1);
        // A click with the Table tool makes a table of four columns and six rows there.
        const to = tiny && tool === "table" ? [drag.from[0] + 8.8, drag.from[1] - 5.4] as P : drag.to;
        if ((tiny && tool !== "table") || !to) return click(drag.target, drag.from);
        const sh = shapeFrom(drag.from, to);
        if (!sh) return;
        const [mol, id] = addShape(doc, sh);
        set(mol);
        setPicked(new Set([id]));
        // A new table opens its second header cell for typing (the first says Entry).
        if (sh.kind === "table") { cellOpen.current = true; setCell({ id, r: 0, c: 1, value: "" }); }
        return;
      }
      case "handle":
        return set(drag.working, true);
      case "tilt":
        return set(drag.working, true);
      case "pen":
        setPenAt(drag.at);
        return setPen([...(pen ?? []), penPoint(drag.at, drag.out)]);
      case "map": {
        // Dropped on another atom: the two are mapped to each other. A click on a mapped atom takes its number off.
        const to = drag.to ? hitIn(doc, drag.to).atom : drag.atom;
        if (to === drag.atom) return doc.atoms[drag.atom].map ? set(clearMap(doc, drag.atom), true) : undefined;
        return to !== undefined ? set(pairMap(doc, drag.atom, to), true) : undefined;
      }
      case "turn":
        return drag.degrees ? set(drag.working, true) : undefined;
      case "chain":
        if (drag.to) return set(chainTo(doc, drag.from, drag.to).mol);
        return click(drag.target, typeof drag.from === "number" ? pos(doc, drag.from) : drag.from);
      case "click":
        return click(drag.target, drag.at);
      case "erase": {
        // A click removes the atom or bond under the pointer; a rub removes everything it marked.
        const t = drag.target;
        if (drag.moved) return set(deleteGraphics(erase(doc, drag.bonds, drag.atoms), drag.captions));
        if (t.atom !== undefined) return set(deleteAtom(doc, t.atom));
        if (t.caption !== undefined) return set(deleteGraphics(doc, new Set([t.caption])));
        if (t.bond !== undefined) return set(deleteBond(doc, t.bond));
        return;
      }
      case "box":
      case "lasso":
        // A hold that never moved selects what it was held on.
        if (!drag.moved) {
          setSelection(new Set([...drag.base, ...atomsOf(doc, drag.target)]));
          const id = drag.target.caption ?? drag.target.arrow;
          if (id !== undefined) setPicked(new Set([...drag.picks, id]));
        }
        return;
      case "move": {
        if (!drag.moved) return click(drag.target, drag.from);
        // An atom dropped exactly on another joins it. Joining renumbers atoms, so the selection clears then.
        const { mol, joined } = joinOverlaps(drag.working, drag.atoms ?? selection);
        return set(mol, !joined);
      }
    }
  }

  // Trackpad: scroll pans, pinch (or ⌘/Ctrl + scroll) zooms around the pointer.
  useEffect(() => {
    const el = svg.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        if (!e.ctrlKey && !e.metaKey) return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
        const zoom = Math.min(8, Math.max(0.25, v.zoom * Math.exp(-e.deltaY * 0.01))), k = zoom / v.zoom;
        return { zoom, x: e.clientX - (e.clientX - v.x) * k, y: e.clientY - (e.clientY - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing() || e.defaultPrevented) return; // typing in a label or caption box, or a box already used the key
      const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      // Drawing with the Pen: Return or Escape ends the curve; Delete takes back the last point.
      if (pen && (e.key === "Enter" || e.key === "Escape")) { e.preventDefault(); return finishPen(); }
      if (pen && (e.key === "Backspace" || e.key === "Delete")) { e.preventDefault(); return setPen(pen.length > 1 ? pen.slice(0, -1) : undefined); }
      // Redo is ⌘Y (ChemDraw's) in the menu; ⇧⌘Z, the Mac's own, works too.
      if (!TAURI && mod && key === "z") { e.preventDefault(); return undo(e.shiftKey); }
      if (mod && key === "y") { e.preventDefault(); return undo(true); }
      if (TAURI && mod && e.shiftKey && key === "z") { e.preventDefault(); return undo(true); }
      if (!TAURI && mod && key === "a" && !e.shiftKey) { e.preventDefault(); return commands.current.select_all(); }
      if (!TAURI && mod && key === "a" && e.shiftKey) { e.preventDefault(); return commands.current.command_palette(); }
      if (mod || e.altKey) return;
      if (e.key === "Escape") {
        // Escape dismisses one thing at a time. With nothing left to dismiss it goes on to the window (which leaves
        // full screen).
        if (!drag && !spring && !selection.size && !picked.size && !hold.current) return;
        e.preventDefault();
        stopHold();
        setDrag(undefined);
        if (spring) { setTool(spring); setSpring(undefined); }
        setPicked(new Set());
        return setSelection(new Set());
      }
      // Enter on a picked caption types into it, as Enter on an atom types its label.
      if (e.key === "Enter" && picked.size === 1 && !selection.size && hover.atom === undefined) {
        e.preventDefault();
        return startWriting({ id: [...picked][0] });
      }
      // Tab takes the arrow Octet offers.
      if (e.key === "Tab" && offer) {
        e.preventDefault();
        const [m, id] = addArrow(doc, { kind: "reaction", from: offer.from, to: offer.to });
        setOffer(undefined);
        set(m, true);
        setSelection(new Set());
        return setPicked(new Set([id]));
      }
      // Everything else goes through the shortcut table (keys.ts), so every key can be changed.
      const pressed = keyOf(e);
      const target = keyTarget(), id = pressed && actionFor(keymap(settings.keys), pressed, target.atom !== undefined ? "atom" : target.bond !== undefined ? "bond" : "none");
      if (!id) return;
      e.preventDefault();
      run(id);
    };
    // Paste a SMILES string or MOL file: it goes to the right of the drawing, or in the middle of an empty canvas.
    const onPaste = (e: ClipboardEvent) => {
      if (typing()) return; // pasting into a label or caption
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text || !loaded) return;
      e.preventDefault();
      // A SMILES string or MOL file first, then a chemical name.
      let frag: Mol | undefined;
      try { frag = parseStructure(text); } catch { frag = undefined; }
      if (!frag?.atoms.length) frag = structureFor(text);
      if (frag) place(frag);
      else setNotice("Octet cannot read this structure. Paste a name, a SMILES string or a MOL file.");
    };
    // Copy puts the selection, or the whole drawing, on the clipboard as SMILES (or text the panel asked for).
    const onCopy = (e: ClipboardEvent) => {
      if (typing() && !copyText.current) return;
      if (copyText.current) {
        e.clipboardData?.setData("text/plain", copyText.current);
        e.preventDefault();
        copyText.current = undefined;
        return setNotice("Copied.");
      }
      const what = selection.size ? subset(doc, selection) : doc;
      if (!what.atoms.length || !loaded) return;
      try {
        e.clipboardData?.setData("text/plain", toSmiles(what));
        e.preventDefault();
      } catch {
        setNotice("Octet cannot write this drawing as SMILES.");
      }
    };
    addEventListener("keydown", onKey);
    addEventListener("paste", onPaste);
    addEventListener("copy", onCopy);
    return () => { removeEventListener("keydown", onKey); removeEventListener("paste", onPaste); removeEventListener("copy", onCopy); };
  });

  // Highlights, in px at 100% (the same frame as the drawing): the selection, then the hover on top.
  // An atom's mark covers its whole label (NH2, OMe); an unlabelled atom gets a dot.
  const atomMark = (i: number, key: string, cls: string) => {
    const b = drawing.label[i], pad = 0.16 * L;
    if (b) return <rect key={key} className={cls} x={b[0] - pad} y={b[1] - pad} width={b[2] - b[0] + 2 * pad} height={b[3] - b[1] + 2 * pad} rx={Math.min(0.32 * L, (b[3] - b[1]) / 2 + pad)} />;
    return <circle key={key} className={cls} cx={pos(shown, i)[0] * L} cy={-pos(shown, i)[1] * L} r={0.32 * L} />;
  };
  const bondMark = (i: number, key: string, cls: string) => {
    const [a, b] = shown.bonds[i].atoms.map((k) => pos(shown, k));
    return <line key={key} className={cls} x1={a[0] * L} y1={-a[1] * L} x2={b[0] * L} y2={-b[1] * L} strokeWidth={0.36 * L} />;
  };
  const captionMark = (id: number, key: string, cls: string) => {
    const c = placed.find((x) => x.id === id);
    if (!c) return null;
    const pad = 0.12 * L;
    return <rect key={key} className={cls} x={c.box[0] - pad} y={c.box[1] - pad} width={c.box[2] - c.box[0] + 2 * pad} height={c.box[3] - c.box[1] + 2 * pad} rx={pad} />;
  };
  // An arrow's mark: a wide soft line along it.
  const arrowMark = (id: number, key: string, cls: string) => {
    const a = arrows.find((x) => x.id === id), sh = a ? undefined : shown.shapes?.find((x) => x.id === id);
    if (a && isOrbital(a)) return <g key={key}>{orbitalPaths(a, L).map((l, i) => <polygon key={i} className={`arrow-mark ${cls}`} points={l.path.map((q) => q.join(",")).join(" ")} strokeWidth={0.2 * L} />)}</g>;
    if (sh) return <g key={key}>{shapePaths(sh, L, frame.bond).map((path, i) => <polyline key={i} className={`arrow-mark ${cls}`} points={path.map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />)}</g>;
    return a ? <polyline key={key} className={`arrow-mark ${cls}`} points={arrowPath(a, L).map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} /> : null;
  };
  // An eraser stroke: its trail, and the bonds and atoms it will remove, tinted.
  const rubbing = drag?.kind === "erase" && drag.moved ? (
    <>
      <polyline className="trail" points={drag.trail.map(([x, y]) => `${x * L},${-y * L}`).join(" ")} strokeWidth={2 * settings.eraser * L} />
      <g className="erase-marks">
        {[...drag.bonds].filter((i) => i < shown.bonds.length).map((i) => bondMark(i, `eb${i}`, ""))}
        {[...drag.atoms].filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `ea${i}`, ""))}
        {[...drag.captions].map((id) => captionMark(id, `ec${id}`, "") ?? arrowMark(id, `ea${id}`, ""))}
      </g>
    </>
  ) : null;
  const selected = drag?.kind === "erase" ? [] : [
    ...shown.bonds.flatMap((b, i) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? [bondMark(i, `sb${i}`, "")] : [])),
    ...[...selection].filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `sa${i}`, "")),
    ...[...picked].map((id) => captionMark(id, `sc${id}`, "") ?? arrowMark(id, `sr${id}`, "")),
    ...cycleArrows.filter((a) => picked.has(a.cycle)).map((a) => <polyline key={`sy${a.id}`} className="arrow-mark" points={arrowPath(a, L).map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />),
  ];
  const hovered = drag ? null
    : hover.atom !== undefined && shown.atoms[hover.atom] ? atomMark(hover.atom, "h", "mark")
    : hover.caption !== undefined && !picked.has(hover.caption) ? captionMark(hover.caption, "h", "mark")
    : hover.arrow !== undefined && !picked.has(hover.arrow) ? arrowMark(hover.arrow, "h", "mark")
    : hover.cycle !== undefined && !picked.has(hover.cycle) ? <g key="h">{cycleArrows.filter((a) => a.cycle === hover.cycle).map((a) => <polyline key={a.id} className="arrow-mark mark" points={arrowPath(a, L).map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />)}</g>
    : hover.bond !== undefined && shown.bonds[hover.bond] ? bondMark(hover.bond, "h", "mark") : null;
  const box = drag?.kind === "box" && drag.moved ? (
    <rect
      className="box"
      x={Math.min(drag.from[0], drag.to[0]) * L}
      y={-Math.max(drag.from[1], drag.to[1]) * L}
      width={Math.abs(drag.to[0] - drag.from[0]) * L}
      height={Math.abs(drag.to[1] - drag.from[1]) * L}
      vectorEffect="non-scaling-stroke"
    />
  ) : null;

  return (
    <div className="editor">
      <svg
        ref={svg}
        className={`canvas paper-${paper}`}
        data-theme={darkPaper ? "dark" : "light"}
        data-tool={tool}
        style={{
          ...(pageHover && !drag ? { cursor: "zoom-in" } : (overTurn && !drag) || drag?.kind === "turn" ? { cursor: turnCursor ?? "grab" } : overSelection || drag?.kind === "move" ? { cursor: "move" } : tool === "select" && cursor ? { cursor } : {}),
          ...(darkPaper ? { "--ink": "#FFFFFF" } : {}),
          // Engineering paper: a 1 mm grid with a heavier line every 5 mm, fixed to the page as it moves and zooms.
          ...(paper === "blueprint" ? { backgroundSize: `${5 * mm * L * view.zoom}px ${5 * mm * L * view.zoom}px, ${5 * mm * L * view.zoom}px ${5 * mm * L * view.zoom}px, ${mm * L * view.zoom}px ${mm * L * view.zoom}px, ${mm * L * view.zoom}px ${mm * L * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` } : {}),
        } as React.CSSProperties}
        role="img"
        aria-label="Drawing canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { pointer.current = undefined; setBrush(undefined); if (!drag) setHover({}); }}
        onDoubleClick={(e) => {
          // A double-click ends the Pen's curve.
          if (pen) return finishPen();
          // With Select, a double-click on any part of a group picks the whole group.
          if (tool === "select") {
            const h = hit(toDoc(e.clientX, e.clientY)), g = groupsOf(doc, new Set(atomsOf(doc, h)), new Set([h.caption, h.arrow].filter((x): x is number => x !== undefined)))[0];
            if (g) { setSelection(new Set(g.atoms)); setPicked(new Set(g.items)); return; }
          }
          // With Select, double-click an atom to type its label (other tools would draw on each click).
          // Double-click a caption with any tool to type into it.
          const t = hit(toDoc(e.clientX, e.clientY));
          // Double-click a table to type in the cell.
          const table = tool !== "erase" ? tableAt(toDoc(e.clientX, e.clientY)) : undefined;
          if (table) return openCell(table, toDoc(e.clientX, e.clientY));
          // Double-click a reaction arrow to pick the whole reaction: structures, plus signs, arrows and their text.
          const a = t.arrow !== undefined ? arrows.find((x) => x.id === t.arrow) : undefined;
          if (a && !curved(a) && !isLine(a) && tool !== "erase") {
            const r = reactionOf(a.id);
            if (r) { setSelection(new Set(r.atoms)); setPicked(new Set([...r.arrows, ...r.captions])); return; }
          }
          if (t.caption !== undefined && tool !== "erase") startWriting({ id: t.caption });
          else if (tool === "select" && t.atom !== undefined) editLabel(t.atom);
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {/* Page corners: small marks where an A4, A3 and A2 page would end. Not part of the drawing. */}
          <g className="pages" aria-hidden>
            {style.grid > 0 && (() => {
              // Gridlines inside the document's page.
              const [, w, h] = pages[0], [x, y] = [(w / 2) * mm * L, (h / 2) * mm * L], g = style.grid * mm * L, lines: string[] = [];
              for (let v = -x + g; v < x - 0.01; v += g) lines.push(`M${v} ${-y}V${y}`);
              for (let v = -y + g; v < y - 0.01; v += g) lines.push(`M${-x} ${v}H${x}`);
              return <path className="grid" d={lines.join("")} vectorEffect="non-scaling-stroke" />;
            })()}
            {style.edges && pages.map(([name, w, h]) => {
              const [x, y, t] = [(w / 2) * mm * L, (h / 2) * mm * L, 10 / view.zoom];
              return (
                <g key={name} className={pageHover === name ? "page hovered" : "page"}>
                  <rect className="page-edge" x={-x} y={-y} width={2 * x} height={2 * y} vectorEffect="non-scaling-stroke" />
                  {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => (
                    <path key={`${sx}${sy}`} d={`M${sx * x - sx * t} ${sy * y}H${sx * x}V${sy * y - sy * t}`} vectorEffect="non-scaling-stroke" />
                  ))}
                  <text x={-x + 3 / view.zoom} y={-y + 12 / view.zoom} style={{ fontSize: 9 / view.zoom }}>{name}</text>
                </g>
              );
            })}
          </g>
          {/* Fills go behind the structures: highlights, shadows (with the shape white over them), solid and shaded shapes. */}
          <defs>
            {(shown.shapes ?? []).filter((sh) => sh.fill === "shaded").map((sh) => (
              <radialGradient key={sh.id} id={`shade${sh.id}`} cx="0.36" cy="0.32" r="0.72">
                <stop offset="0" stopColor="#FFFFFF" />
                <stop offset="1" style={{ stopColor: sh.colour ?? "var(--ink)" }} />
              </radialGradient>
            ))}
          </defs>
          {(shown.shapes ?? []).filter((sh) => sh.kind === "highlight" || sh.fill || sh.shadow).map((sh) => {
            const d = toPath(shapePaths(sh, L, frame.bond).slice(0, 1)), shade = { ...SHADE, ...sh.shade }, off = shade.depth * L;
            if (sh.kind === "highlight") return <path key={`f${sh.id}`} d={d} fill={sh.colour ?? HIGHLIGHT} />;
            if (sh.fill) return <path key={`f${sh.id}`} d={d} fill={sh.fill === "shaded" ? `url(#shade${sh.id})` : sh.colour ?? "var(--ink)"} />;
            // A shadow falls down and to the right, in the shape's colour at its opacity, softened by a blur.
            return (
              <g key={`f${sh.id}`}>
                {shade.blur > 0 && <defs><filter id={`soft${sh.id}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={shade.blur * L * 0.5} /></filter></defs>}
                <path d={d} transform={`translate(${off} ${off})`} fill={sh.colour ? textInk(sh.colour) : "var(--ink)"} fillOpacity={shade.opacity} filter={shade.blur > 0 ? `url(#soft${sh.id})` : undefined} />
                <path d={d} fill="var(--canvas)" />
              </g>
            );
          })}
          {arrows.filter((a) => a.curve?.closed && a.fill).map((a) => {
            // A closed pen curve's fill: solid, shaded (lit from the top left) or faded (to nothing at the bottom right).
            const ink = a.colour ? textInk(a.colour) : "var(--ink)", d = toPath([arrowPath(a, L)]);
            if (a.fill === "solid") return <path key={`cf${a.id}`} d={d} fill={ink} />;
            return (
              <g key={`cf${a.id}`}>
                <defs>
                  {a.fill === "shaded"
                    ? <radialGradient id={`cfill${a.id}`} cx="0.36" cy="0.32" r="0.75"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" style={{ stopColor: ink }} /></radialGradient>
                    : <linearGradient id={`cfill${a.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: ink }} /><stop offset="1" style={{ stopColor: ink }} stopOpacity={0} /></linearGradient>}
                </defs>
                <path d={d} fill={`url(#cfill${a.id})`} />
              </g>
            );
          })}
          {arrows.some(isOrbital) && (() => {
            // Orbitals sit behind the structure: plain lobes are the page's colour, shaded ones lit from the top
            // left, filled ones solid; phased orbitals fill one phase and leave the other plain.
            const orbitals = arrows.filter(isOrbital);
            return (
              <g className="orbitals">
                <defs>
                  <radialGradient id="lobe" cx="0.36" cy="0.32" r="0.75">
                    <stop offset="0" stopColor="#FFFFFF" />
                    <stop offset="1" style={{ stopColor: "var(--ink)" }} stopOpacity={0.55} />
                  </radialGradient>
                </defs>
                {orbitals.filter((a) => a.colour && a.orbital!.phase === "shaded").map((a) => (
                  <radialGradient key={`g${a.id}`} id={`lobe${a.id}`} cx="0.36" cy="0.32" r="0.75">
                    <stop offset="0" stopColor="#FFFFFF" />
                    <stop offset="1" stopColor={textInk(a.colour!)} stopOpacity={0.55} />
                  </radialGradient>
                ))}
                {orbitals.flatMap((a) => orbitalPaths(a, L).map((l, i) => {
                  const ink = a.colour ? textInk(a.colour) : "var(--ink)", ph = a.orbital!.phase;
                  const fill = ph === "filled" || (ph === "phased" && !l.second) ? ink : ph === "shaded" ? `url(#lobe${a.colour ? a.id : ""})` : "var(--canvas)";
                  return <path key={`${a.id}-${i}`} d={toPath([l.path])} fill={fill} fillRule="evenodd" stroke={ink} strokeWidth={frame.line} />;
                }))}
              </g>
            );
          })()}
          {found.map((p) => doc.atoms[p.atom] && <circle key={`p${p.atom}`} className="problem-mark" cx={pos(shown, p.atom)[0] * L} cy={-pos(shown, p.atom)[1] * L} r={0.42 * L} vectorEffect="non-scaling-stroke" />)}
          {/* One group with one opacity, so overlapping marks don't stack up darker. */}
          <g className="selection-marks">{selected}</g>
          {hovered}
          {drawing.beads.length > 0 && (
            // Polymer beads: spheres lit from the top left.
            <>
              <defs>
                <radialGradient id="bead" cx="0.36" cy="0.32" r="0.72">
                  <stop offset="0" stopColor="#FFFFFF" />
                  <stop offset="1" style={{ stopColor: "var(--ink)" }} />
                </radialGradient>
              </defs>
              {drawing.beads.map((b, i) => <circle key={`bd${i}`} cx={b.at[0]} cy={b.at[1]} r={b.r} fill="url(#bead)" />)}
            </>
          )}
          {structureInk.map(([key, polys]) => { const [colour, alpha] = (key ?? "|1").split("|"); return <path key={`s${key}`} d={toPath(polys)} fill={colour ? textInk(colour) : "var(--ink)"} fillOpacity={Number(alpha) < 1 ? Number(alpha) : undefined} />; })}
          {arrowInk.map(([colour, polys]) => <path key={`a${colour}`} d={toPath(polys)} fill={colour ? textInk(colour) : "var(--ink)"} />)}
          {cutLabels.map((c) => (
            <text key={c.key} x={c.at[0] * L} y={-c.at[1] * L} textAnchor={c.anchor} fill="var(--ink)" style={{ font: `${style.captionSize * pt * 0.9}px ${fontStack(style.captionFont)}` }}>
              {c.formula.split(/(\d+)/).map((part, i) => (/^\d+$/.test(part) ? <tspan key={i} baselineShift="sub" fontSize="75%">{part}</tspan> : <tspan key={i}>{part}</tspan>))}
              <tspan dx={4}>{c.exact.toFixed(4)}</tspan>
            </text>
          ))}
          {offer && (() => {
            // The offered arrow, faint, with the key that takes it.
            const a: Arrow = { id: -1, kind: "reaction", from: offer.from, to: offer.to }, mid: P = [((a.from[0] + a.to[0]) / 2) * L, -a.from[1] * L];
            return (
              <g className="suggested" aria-label="Suggested arrow. Press Tab to draw it.">
                <path d={toPath(arrowShapes(a, frame, L))} />
                <g transform={`translate(${mid[0]} ${mid[1] + 0.55 * L}) scale(${1 / view.zoom})`}>
                  <rect x={-16} y={-10} width={32} height={20} rx={5} />
                  <text x={0} y={4} textAnchor="middle">Tab</text>
                </g>
              </g>
            );
          })()}
          {(shown.shapes ?? []).filter((sh) => sh.kind !== "highlight" && sh.kind !== "table" && !sh.fill).map((sh) => <path key={`sh${sh.id}`} d={toPath(shapeInk(sh, frame, L))} fill={sh.colour ?? "var(--ink)"} />)}
          {(shown.shapes ?? []).filter((sh) => sh.kind === "tlc").map((sh) => {
            // A plate's origin line, dashed solvent front, spots, and their Rf values when shown.
            const t = tlcLayout(sh), y = (v: number) => -v * L, ink = sh.colour ?? "var(--ink)";
            return (
              <g key={`tlc${sh.id}`} className="tlc">
                <line x1={t.x0 * L} x2={t.x1 * L} y1={y(t.origin)} y2={y(t.origin)} stroke={ink} strokeWidth={frame.line} />
                {Array.from({ length: t.lanes }, (_, k) => <line key={`t${k}`} x1={t.lane(k) * L} x2={t.lane(k) * L} y1={y(t.origin) - 0.08 * L} y2={y(t.origin) + 0.08 * L} stroke={ink} strokeWidth={frame.line} />)}
                <line x1={t.x0 * L} x2={t.x1 * L} y1={y(t.front)} y2={y(t.front)} stroke={ink} strokeWidth={frame.line} strokeDasharray={`${0.12 * L} ${0.08 * L}`} />
                {(sh.tlc?.spots ?? []).map((x, i) => (
                  <g key={i}>
                    <ellipse cx={t.lane(x.lane) * L} cy={y(t.at(x.rf))} rx={Math.min(0.3 * t.width, 0.34) * L} ry={0.15 * L} fill={ink} />
                    {sh.tlc?.rf && <text x={(t.lane(x.lane) + Math.min(0.3 * t.width, 0.34) + 0.1) * L} y={y(t.at(x.rf)) + 0.12 * L} fill={ink} style={{ font: `${style.captionSize * pt * 0.8}px ${fontStack(style.captionFont)}` }}>{x.rf.toFixed(2)}</text>}
                  </g>
                ))}
              </g>
            );
          })}
          {(shown.shapes ?? []).filter((sh) => sh.kind === "table").map((sh) => {
            // A table: journal rules (top, under the header, bottom) or a full grid, and each cell's text centred.
            const t = tableLayout(sh, cellWidth), y = (v: number) => -v * L, ink = sh.colour ?? "var(--ink)", size = style.captionSize * pt;
            const across = sh.table?.grid ? Array.from({ length: t.rows + 1 }, (_, r) => t.row(r)) : [t.y1, t.row(1), t.y0];
            const down = sh.table?.grid ? Array.from({ length: t.cols + 1 }, (_, c) => t.col(c)) : [];
            return (
              <g key={`table${sh.id}`} className="table">
                {across.map((v, i) => <line key={`r${i}`} x1={t.x0 * L} x2={t.x1 * L} y1={y(v)} y2={y(v)} stroke={ink} strokeWidth={frame.line} />)}
                {down.map((v, i) => <line key={`c${i}`} x1={v * L} x2={v * L} y1={y(t.y1)} y2={y(t.y0)} stroke={ink} strokeWidth={frame.line} />)}
                {(sh.table?.cells ?? []).map((row, r) => row.map((text, c) => text && !(cell?.id === sh.id && cell.r === r && cell.c === c) ? (
                  <text key={`${r}-${c}`} x={(t.col(c) + t.widths[c] / 2) * L} y={y(t.row(r) - t.h / 2) + 0.35 * size} textAnchor="middle" fill={ink} style={{ font: `${size}px ${fontStack(style.captionFont)}` }}>{formula(text, size)}</text>
                ) : null))}
              </g>
            );
          })}
          {(shown.shapes ?? []).filter((sh) => sh.mark && isBracket(sh)).map((sh) => {
            const m = markAt(sh, L);
            return <text key={`m${sh.id}`} x={m.x} y={m.y} textAnchor={m.anchor} fill={sh.colour ?? "var(--ink)"} style={{ font: `${style.captionSize * pt}px ${fontStack(style.captionFont)}` }}>{sh.mark}</text>;
          })}
          {shown.atoms.map((a, i) => a.enhanced && drawing.ink[i] ? (
            // Enhanced stereo flags: small, by the stereocentre on its open side, as ChemDraw prints them.
            <text key={`st${i}`} className="stereo-flag" textAnchor="middle" fill="var(--ink)" x={(pos(shown, i)[0] + 0.5 * markDirection(shown, i)[0]) * L} y={-(pos(shown, i)[1] + 0.5 * markDirection(shown, i)[1]) * L + 0.25 * frame.size}
              style={{ font: `${frame.size * 0.7}px ${fontStack(style.labelFont)}` }}>{a.enhanced}</text>
          ) : null)}
          {shown.atoms.map((a, i) => a.map && drawing.ink[i] ? (
            // Atom map numbers: small, in brand blue, just off the atom on its open side.
            <text key={`map${i}`} className="atom-map" textAnchor="middle" x={(pos(shown, i)[0] + 0.42 * markDirection(shown, i)[0]) * L} y={-(pos(shown, i)[1] + 0.42 * markDirection(shown, i)[1]) * L + 0.22 * frame.size} style={{ fontSize: frame.size * 0.62 }}>{a.map}</text>
          ) : null)}
          {drawing.labels.map((l, i) => (
            <text key={i} x={l.x} y={l.y} fill={l.colour ? textInk(l.colour) : "var(--ink)"} fillOpacity={l.alpha} style={{ font: `${l.size}px ${fontStack(style.labelFont)}` }}>
              {l.text}
            </text>
          ))}
          {placed.map((c) => c.id === (writing?.id ?? DRAFT) || c.id === DRAFT ? null : (
            <text key={`c${c.id}`} className="caption" textAnchor={c.anchor} textDecoration={c.underline ? "underline" : undefined} fill={textInk(c.colour ?? style.colour)} style={{ font: `${c.italic ? "italic " : ""}${c.bold ? "bold " : ""}${c.size}px ${fontStack(c.font ?? style.captionFont)}` }}>
              {c.lines.map((l, j) => <tspan key={j} x={l.x} y={l.y}>{l.runs ? richSpans(l.runs, c.size, pt) : reagents.has(c.id) ? formula(l.text, c.size) : l.text}</tspan>)}
            </text>
          ))}
          {(pen || drag?.kind === "pen") && (() => {
            // The Pen's points as small squares, and the handle being dragged out of the point being placed.
            const r = 3.5 / view.zoom, now = drag?.kind === "pen" ? penPoint(drag.at, drag.out) : undefined;
            return (
              <g className="pen-points" aria-hidden>
                {now?.c1 && now.c2 && <line x1={now.c1[0] * L} y1={-now.c1[1] * L} x2={now.c2[0] * L} y2={-now.c2[1] * L} />}
                {now?.c1 && now.c2 && [now.c1, now.c2].map((q, i) => <circle key={i} cx={q[0] * L} cy={-q[1] * L} r={r * 0.8} />)}
                {[...(pen ?? []), ...(now ? [now] : [])].map((q, i) => <rect key={i} x={q.at[0] * L - r} y={-q.at[1] * L - r} width={2 * r} height={2 * r} />)}
              </g>
            );
          })()}
          {drag?.kind === "map" && drag.to && (() => {
            // The atom being mapped, joined by a dashed line to the pointer, or to the atom under it (ringed).
            const a = pos(doc, drag.atom), on = hitIn(doc, drag.to).atom, b = on !== undefined && on !== drag.atom ? pos(doc, on) : drag.to;
            return (
              <g className="mapping" aria-hidden>
                <circle cx={a[0] * L} cy={-a[1] * L} r={0.32 * L} />
                <line x1={a[0] * L} y1={-a[1] * L} x2={b[0] * L} y2={-b[1] * L} strokeDasharray={`${0.18 * L} ${0.14 * L}`} />
                {on !== undefined && on !== drag.atom && <circle cx={b[0] * L} cy={-b[1] * L} r={0.32 * L} />}
              </g>
            );
          })()}
          {ghost && (
            <g className="ghost" aria-hidden>
              <path d={toPath(ghost.polygons)} />
              {ghost.labels.map((l, i) => <text key={i} x={l.x} y={l.y} style={{ font: `${l.size}px ${fontStack(style.labelFont)}` }}>{l.text}</text>)}
            </g>
          )}
          {(() => {
            // A picked arrow's handles: its ends, and the middle of a curved one.
            const ids = [...picked], a = ids.length === 1 && !selection.size && drag?.kind !== "move" ? arrows.find((x) => x.id === ids[0]) : undefined;
            const sh = ids.length === 1 && !selection.size && drag?.kind !== "move" ? shown.shapes?.find((x) => x.id === ids[0]) : undefined;
            if ((!a || a.kind === "curve") && !sh) return null;
            const points = sh ? Object.values(corners(sh)) : [a!.from, a!.to, ...(curved(a!) ? [bendPoint(a!)] : [])];
            return points.map((q, i) => <circle key={`hd${i}`} className="handle" cx={q[0] * L} cy={-q[1] * L} r={4 / view.zoom} vectorEffect="non-scaling-stroke" />);
          })()}
          {(() => {
            // The rotation handle, and the angle while turning.
            const h = drag?.kind === "turn" ? undefined : turnHandle();
            if (drag?.kind === "turn") {
              const c = drag.centre;
              return <text className="turn-angle" x={c[0] * L} y={-c[1] * L} textAnchor="middle" style={{ fontSize: 12 / view.zoom }}>{`${Math.round(drag.degrees)}°`}</text>;
            }
            return h && (
              <g className={overTurn ? "turn-handle hot" : "turn-handle"} transform={`translate(${h[0]} ${h[1]}) scale(${1 / view.zoom})`} aria-hidden>
                <circle r={9} />
                <path d="M3.6 -3.2 A4.8 4.8 0 1 0 4.6 1.6 M3.6 -3.2 L3.8 -6.2 M3.6 -3.2 L0.7 -3" />
              </g>
            );
          })()}
          {box}
          {drag?.kind === "lasso" && drag.moved && (
            <polygon className="box" points={drag.points.map(([x, y]) => `${x * L},${-y * L}`).join(" ")} vectorEffect="non-scaling-stroke" />
          )}
          {rubbing}
          {drag?.kind === "chain" && drag.to && (
            <text className="count" x={drag.to[0] * L + 6 / view.zoom} y={-drag.to[1] * L - 6 / view.zoom} style={{ fontSize: 12 / view.zoom }}>
              {chainTo(doc, drag.from, drag.to).bonds}
            </text>
          )}
          {tool === "erase" && brush && <circle className="brush" cx={brush[0] * L} cy={-brush[1] * L} r={settings.eraser * L} vectorEffect="non-scaling-stroke" />}
          {drag?.kind === "move" && drag.guides.map((g, i) => g.axis === "x"
            ? <line key={i} className="guide" x1={g.at * L} x2={g.at * L} y1={-g.from * L} y2={-g.to * L} vectorEffect="non-scaling-stroke" />
            : <line key={i} className="guide" y1={-g.at * L} y2={-g.at * L} x1={g.from * L} x2={g.to * L} vectorEffect="non-scaling-stroke" />)}
          {drag?.kind === "move" && drag.point && <circle className="snap-point" cx={drag.point[0] * L} cy={-drag.point[1] * L} r={0.22 * L} vectorEffect="non-scaling-stroke" />}
        </g>
      </svg>
      {editing && doc.atoms[editing.atom] && (() => {
        // The label box sits on the atom, in the label font at the current zoom.
        const [ax, ay] = pos(doc, editing.atom);
        // Enter, Escape and a click elsewhere all keep the label; only the first one counts.
        const commit = () => { if (!labelOpen.current) return; labelOpen.current = false; set(setLabel(doc, editing.atom, editing.value)); setEditing(undefined); };
        return (
          <input
            className="label-box"
            data-theme="light"
            aria-label="Atom label"
            autoFocus
            spellCheck={false}
            value={editing.value}
            style={{ left: view.x + ax * L * view.zoom, top: view.y - ay * L * view.zoom, fontSize: frame.size * view.zoom, fontFamily: fontStack(style.labelFont) }}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { e.preventDefault(); commit(); }
            }}
            onBlur={commit}
          />
        );
      })()}
      {cell && (() => {
        // The cell box sits over the cell, in the table's font at the current zoom. Tab and Shift-Tab move along the
        // row, Enter and the up and down arrows move down and up a column, and Tab past the last cell adds a row.
        const sh = doc.shapes?.find((x) => x.id === cell.id);
        if (!sh?.table) return null;
        const t = tableLayout(sh, cellWidth), z = view.zoom, size = style.captionSize * pt * z, cols = t.cols;
        const width = Math.max(t.widths[cell.c], cellWidth(cell.value) + 2 * 0.35) * L * z;
        return (
          <input
            ref={cellInput}
            className="cell-box"
            aria-label={`Row ${cell.r + 1}, column ${cell.c + 1}`}
            autoFocus
            spellCheck={false}
            value={cell.value}
            style={{
              left: view.x + ((t.col(cell.c) + t.widths[cell.c] / 2) * L * z) - width / 2, top: view.y - t.row(cell.r) * L * z,
              width, height: t.h * L * z, font: `${size}px ${fontStack(style.captionFont)}`, color: sh.colour ?? style.colour,
            }}
            onChange={(e) => setCell({ ...cell, value: e.target.value })}
            onKeyDown={(e) => {
              const i = cell.r * cols + cell.c;
              if (e.key === "Tab") {
                e.preventDefault();
                // Forwards, Tab steps over the entry numbers the table filled in itself.
                let j = e.shiftKey ? Math.max(0, i - 1) : i + 1;
                if (!e.shiftKey && j % cols === 0 && cols > 1 && (sh.table!.cells[j / cols]?.[0] ?? String(j / cols)) === String(j / cols)) j++;
                return commitCell([Math.floor(j / cols), j % cols]);
              }
              if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); return cell.r + 1 < t.rows ? commitCell([cell.r + 1, cell.c]) : commitCell(); }
              if (e.key === "ArrowUp") { e.preventDefault(); return commitCell([Math.max(0, cell.r - 1), cell.c]); }
              if (e.key === "Escape") { e.preventDefault(); return commitCell(); }
            }}
            onBlur={() => commitCell()}
          />
        );
      })()}
      {writing && (() => {
        // The caption box sits exactly over the caption, in its font at the current zoom, so typing is in place.
        const c = placed.find((x) => x.id === (writing.id ?? DRAFT));
        if (!c) return null;
        const z = view.zoom, size = c.size * z, slack = 0.5 * size;
        return (
          <RichBox
            runs={writing.runs ?? [{ text: writing.value }]}
            version={writing.version ?? 0}
            caret={writing.caret}
            pending={writing.pending}
            api={richApi}
            look={(r) => ({
              fontWeight: r.bold ? "bold" : "", fontStyle: r.italic ? "italic" : "", textDecoration: r.underline ? "underline" : "",
              fontFamily: r.font ? fontStack(r.font) : "", color: r.colour ?? "", verticalAlign: r.script === "sub" ? "sub" : r.script === "super" ? "super" : "",
              fontSize: r.size ? `${r.size * pt * z * (r.script ? 0.75 : 1)}px` : r.script ? "75%" : "",
            })}
            style={{
              left: view.x + c.box[0] * z - slack,
              top: view.y + (c.lines[0].y - 0.9465 * c.size) * z,
              width: (c.box[2] - c.box[0]) * z + 2 * slack,
              height: c.lines.length * 1.2 * size,
              font: `${c.italic ? "italic " : ""}${c.bold ? "bold " : ""}${size}px/1.2 ${fontStack(c.font ?? style.captionFont)}`,
              color: c.colour ?? style.colour,
              padding: `0 ${slack}px`,
              textDecoration: c.underline ? "underline" : undefined,
              textAlign: c.anchor === "start" ? "left" : c.anchor === "end" ? "right" : "center",
            }}
            onRuns={(runs, rebuild) => setWriting((w) => w && { ...w, runs, value: plainOf(runs), ...(rebuild ? { version: (w.version ?? 0) + 1, caret: rebuild, pending: undefined } : {}) })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.altKey) { e.preventDefault(); commitWriting(); }
              if (e.key === "Escape") { e.preventDefault(); commitWriting(); } // Escape keeps the text, as a click elsewhere does
              // ChemDraw's text keys, in the browser (the desktop app's Text menu has them too).
              if (!TAURI && (e.metaKey || e.ctrlKey)) {
                const k = e.key.toLowerCase(), command = { b: "caption.bold", i: "caption.italic", u: "caption.underline", t: "caption.plain", f: "caption.formula", "-": "caption.sub", "=": "caption.super", "+": "caption.super" }[k];
                if (command) { e.preventDefault(); runAction(command); }
              }
            }}
            onBlur={() => commitWriting()}
          />
        );
      })()}
      {naming !== undefined && suggestion && !nameToSmiles(naming) && (() => {
        // The suggested name under the field, with the letters it adds or changes marked. Tab takes it.
        const typed = naming.trim().toLowerCase(), name = suggestion;
        let a = 0, b = 0;
        while (a < typed.length && a < name.length && typed[a] === name[a].toLowerCase()) a++;
        while (b < typed.length - a && b < name.length - a && typed[typed.length - 1 - b] === name[name.length - 1 - b].toLowerCase()) b++;
        return (
          <p className="name-suggestion" aria-live="polite">
            <span>{name.slice(0, a)}<mark>{name.slice(a, name.length - b)}</mark>{name.slice(name.length - b)}</span>
            <kbd>Tab</kbd>
          </p>
        );
      })()}
      {naming !== undefined && (historyRows.length > 0) && (
        // Names drawn before, newest first, matching what is typed. The field keeps focus while a row is clicked.
        <div className={["name-history", suggestion && !nameToSmiles(naming) && "below", recent.all && "all"].filter(Boolean).join(" ")} role="listbox" aria-label="Recent names" onPointerDown={(e) => e.preventDefault()}>
          {historyRows.map((entry, i) => {
            const mol = historyMol(entry), name = entry.name;
            return (
              <div key={name} role="option" aria-selected={recent.at === i} className="name-recent" onPointerMove={() => setRecent((h) => ({ ...h, at: i }))} onClick={() => pickHistory(entry)}>
                <span className="name-thumb">{mol ? <StructureThumb id={`name:${name}`} mol={mol} /> : <ClockCounterClockwise size={16} />}</span>
                <span className="name-text">{name}</span>
                <button className="name-forget" aria-label={`Remove ${name}`} title="Remove" onClick={(e) => { e.stopPropagation(); setSettings((s) => ({ ...s, nameHistory: s.nameHistory.filter((n) => n.name !== name) })); }}>
                  <X size={12} weight="bold" />
                </button>
              </div>
            );
          })}
          {historyMore && (
            <div role="option" aria-selected={recent.at === historyRows.length} className="name-recent show-all" onPointerMove={() => setRecent((h) => ({ ...h, at: historyRows.length }))} onClick={() => setRecent({ all: true, at: -1 })}>
              <span className="name-thumb"><CaretDown size={14} /></span>
              <span className="name-text">Show all {historyMatches.length}</span>
            </div>
          )}
        </div>
      )}
      {naming !== undefined && (
        <input
          ref={nameField}
          className="name-field"
          aria-label="Chemical name"
          aria-invalid={!!naming.trim() && namesLoaded && !named}
          placeholder="Name"
          autoFocus
          spellCheck={false}
          value={naming}
          onChange={(e) => { setNaming(e.target.value); setRecent((h) => ({ ...h, at: -1 })); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setNaming(undefined); }
            if (e.key === "Tab" && suggestion) { e.preventDefault(); setNaming(suggestion); }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = historyRows.length + (historyMore ? 1 : 0);
              if (n) setRecent((h) => ({ ...h, at: e.key === "ArrowDown" ? Math.min(n - 1, h.at + 1) : Math.max(-1, h.at - 1) }));
            }
            if (e.key === "Enter" && recent.at === historyRows.length && historyMore) { e.preventDefault(); return setRecent({ all: true, at: -1 }); }
            if (e.key !== "Enter") return;
            if (recent.at >= 0 && historyRows[recent.at] !== undefined) return void pickHistory(historyRows[recent.at]);
            if (named) { place(named); rememberName(structureFor(naming.trim()) ? naming.trim() : suggestion ?? naming.trim(), named); setNaming(undefined); return; }
            // Not a name Octet can read: the field shakes.
            if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
              e.currentTarget.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 240, easing: "ease-out" });
          }}
          onBlur={() => setNaming(undefined)}
        />
      )}
      {settingsOpen && (
        <SettingsWindow
          module={settingsOpen}
          onModule={(m) => { setSettingsOpen(m); setSettings((s) => ({ ...s, settingsModule: m })); }}
          style={style}
          isDefault={JSON.stringify({ ...style, preset: "" }) === JSON.stringify({ ...readStyle(settings.docStyle), preset: "" })}
          preview={preview}
          onStyle={(next) => set({ ...doc, style: next }, true)}
          onDefault={() => setSettings((s) => ({ ...s, docStyle: style }))}
          keys={settings.keys}
          onKeys={(keys) => setSettings((s) => ({ ...s, keys }))}
          files={settings.files}
          onFiles={(files) => setSettings((s) => ({ ...s, files }))}
          palette={settings.palette}
          onPalette={(palette) => setSettings((s) => ({ ...s, palette }))}
          adding={addingColour}
          onClose={() => { setSettingsOpen(undefined); setAddingColour(false); }}
        />
      )}
      {pop && <span key={pop.n} className="halo" style={{ left: pop.x, top: pop.y }} aria-hidden />}

      <Palette
        tool={tool}
        variants={{ select: selectKind, bond: bondKind, ring: ringKind, template: templateVariant, symbol: symbolKind, orbital: orbitalChoice, shape: shapeChoice, bracket: bracketChoice, more: settings.variants.more ?? "tlc", arrow: arrowVariant(settings.variants.arrow) ? settings.variants.arrow : "reaction" }}
        curvedArrows={settings.curvedArrows}
        onCurvedArrows={(curvedArrows) => setSettings((s) => ({ ...s, curvedArrows }))}
        libraryRings={settings.libraryRings}
        onLibraryRings={(libraryRings) => setSettings((s) => ({ ...s, libraryRings }))}
        templates={templates}
        pinned={settings.pinned}
        onPinned={(pinned) => setSettings((s) => ({ ...s, pinned }))}
        canAddSelection={selection.size > 0}
        renaming={renaming}
        preview={(name) => structureFor(name) ?? (() => { const s = suggestName(name, false); return s ? structureFor(s) : undefined; })()}
        onAddName={(typed) => {
          // A misspelt name is added with its corrected spelling.
          const name = nameToSmiles(typed) ? typed : suggestName(typed);
          const m = name && structureFor(name);
          if (!name || !m) return false;
          addRingTemplate(name.charAt(0).toUpperCase() + name.slice(1), m);
          return true;
        }}
        onAddSelection={addSelectionAsRing}
        onRename={(id, name) => {
          setSettings((s) => ({ ...s, templates: s.templates.map((t) => (t.id === id ? { ...t, name: name.slice(0, 80) } : t)) }));
          setRenaming(undefined);
        }}
        onRemoveTemplate={removeRingTemplate}
        popKey={pop?.n ?? 0}
        canUndo={h.at > 0}
        canRedo={h.at < h.stack.length - 1}
        modKey={MOD}
        onTool={setTool}
        onVariant={(t, kind) => setSettings((s) => ({ ...s, variants: { ...s.variants, [t]: kind } }))}
        onUndo={() => undo()}
        onRedo={() => undo(true)}
        wide={settings.paletteWide}
        onWide={(wide) => setSettings((s) => ({ ...s, paletteWide: wide }))}
        stripWidths={settings.strips}
        onStripWidth={(t, width) => setSettings((s) => ({ ...s, strips: { ...s.strips, [t]: width } }))}
      />

      <Actions
        open={settings.actions}
        context={context}
        analysis={analysis}
        problems={found}
        messy={untidy}
        hint={hint}
        onOpen={(open) => setSettings((s) => ({ ...s, actions: open }))}
        layout={settings.actionLayout}
        onLayout={(kind, layout) => setSettings((s) => ({ ...s, actionLayout: { ...s.actionLayout, [kind]: layout } }))}
        colour={selectionColour()}
        grouping={(() => {
          const gs = groupsOf(doc, selection, picked), count = fragments(doc).filter((g) => g.some((i) => selection.has(i))).length + picked.size;
          return gs.length ? { grouped: true, integral: gs.every((g) => g.integral) } : count >= 2 ? { grouped: false, integral: false } : undefined;
        })()}
        palette={settings.palette}
        run={runAction}
      />
      {dialog?.kind === "rotate" && (
        <Dialog title="Rotate" action="Rotate" onClose={() => setDialog(undefined)}
          onAction={() => { const a = Number(dialog.angle); if (Number.isFinite(a)) rotateBy(dialog.clockwise ? -a : a); setDialog(undefined); }}>
          <label className="dialog-row">
            <span>Angle</span>
            <span className="unit-field"><input aria-label="Angle" inputMode="decimal" value={dialog.angle} onFocus={(e) => e.target.select()} onChange={(e) => setDialog({ ...dialog, angle: e.target.value.replace(/[^\d.-]/g, "") })} /><span className="unit">°</span></span>
          </label>
          <span className="segmented" role="radiogroup" aria-label="Direction">
            <button role="radio" aria-checked={!dialog.clockwise} onClick={() => setDialog({ ...dialog, clockwise: false })}>Anticlockwise</button>
            <button role="radio" aria-checked={dialog.clockwise} onClick={() => setDialog({ ...dialog, clockwise: true })}>Clockwise</button>
          </span>
        </Dialog>
      )}
      {dialog?.kind === "scale" && (
        <Dialog title="Scale" action="Scale" onClose={() => setDialog(undefined)}
          onAction={() => {
            const v = Number(dialog.value), median = medianBond();
            // The document's bond length is one bond length in the drawing; a length in pt is in the document style's points.
            scaleBy(dialog.how === "document" ? 1 / median : dialog.how === "length" ? v / style.bond / median : v / 100);
            setDialog(undefined);
          }}>
          {([["document", `Median bond to the document's bond length (${style.bond} pt)`], ["length", "Median bond to"], ["percent", "Scale by"]] as const).map(([how, name]) => (
            <label key={how} className="dialog-row">
              <input type="radio" name="scale-how" checked={dialog.how === how} onChange={() => setDialog({ ...dialog, how, value: how === "percent" ? "100" : how === "length" ? String(style.bond) : dialog.value })} />
              <span>{name}</span>
              {how !== "document" && dialog.how === how && (
                <span className="unit-field"><input aria-label={name} inputMode="decimal" value={dialog.value} onFocus={(e) => e.target.select()} onChange={(e) => setDialog({ ...dialog, value: e.target.value.replace(/[^\d.]/g, "") })} /><span className="unit">{how === "percent" ? "%" : "pt"}</span></span>
              )}
            </label>
          ))}
        </Dialog>
      )}
      {commandsOpen && <CommandPalette commands={paletteCommands()} draw={drawCommand} onClose={() => setCommandsOpen(false)} />}
      {notice && (
        <p className="notice text-ui" role="status">
          <Warning size={16} weight="bold" aria-hidden />
          {notice}
        </p>
      )}
    </div>
  );
}
