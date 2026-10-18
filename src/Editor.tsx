import { Fragment, memo, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowsOutSimple, Atom as AtomIcon, SelectionInverse, Cube, Flask, TagSimple, Circle, Square, BoundingBox, SelectionSlash, AlignLeft, AlignRight, AlignTop, AlignBottom, AlignCenterHorizontal, AlignCenterVertical, ArrowsOutLineHorizontal, ArrowsOutLineVertical, Eraser, FileArrowDown, FilePlus, FlipHorizontal, FlipVertical, FloppyDisk, FolderOpen,
  FrameCorners, GearSix, Keyboard, Lasso, MagicWand, MagnifyingGlassMinus, MagnifyingGlassPlus, Selection, SelectionAll, SlidersHorizontal,
  TextAlignCenter, TextAlignJustify, TextAlignLeft, TextAlignRight, TextAa, TextB, TextItalic, TextT, TextUnderline, Warning, Stack, StackSimple, ArrowsDownUp, FileText, CaretDown, ClockCounterClockwise, X,
  Info, Printer, Export as ExportIcon, Hash, ArrowsInSimple, Table, FileDashed, ArrowsLeftRight, Angle, CornersOut, Faders, FloppyDiskBack, LinkSimple, MagnetStraight, Paragraph, Resize, Ruler, CheckCircle,
  Asterisk, AsteriskSimple, BracketsSquare, SquaresFour, GridFour, CrosshairSimple, CopySimple,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { labelSmiles, GROUPS } from "./labels";
import { analyse, structures, expandWithOrigins, stereoFacts, stereoLabels, smilesWeight, toMolfile, toReaction, toSdf, type RxnStep, type Structure, cipOf, cleanUp, MOST_CLEAN, expandLabels, fragmentMasses, mapReaction, importStructure, toInchi, measurer, parseStructure, ready, STYLE, textExtent, textWidth, toSmiles } from "./chem";
import { MAX_PURPOSES, PURPOSES, fontStack, frameStyle, forPurpose, outlines as pageOutlines, purposeOf, readStyle, roundPt, sameStyle, styleFor, withScale, elementColours, COLOURS, FONTS, sizesAt, type DocStyle, type Guides, type PurposeKind } from "./docstyle";
import { gridLines, gridNudge, gridOf, shownStep, snapToGrid } from "./grid";
import { Rulers } from "./Rulers";
import { messy, problems, WARNING_TYPES, type Problem, type WarningType } from "./check";
import { parse, serialize } from "./file";
import {
  EMPTY, pickAtoms, addArrow, addCaption, addCycle, addCharge, addRing, updateArrow, deleteGraphics, inPolygon, nextNumber, updateCaption, atomAt, atomsIn, bondAt, bondTo, bounds, chainTo, complete, cycleBond, deleteAtom, deleteAtoms, deleteBond, erase, flipBond,
  addChair, addGroup, addTemplate, alignFragments, atomsInPolygon, flipAtoms, fragments, joinOverlaps, setLabel, merge, moveAtoms, neighbours, onSelection, pos, setBondSpec, setElement, setPosition, sprout, subset,
  addShape, addSymbol, bondOrders, freePairs, nextDirection, setAtomMarks, toggleLonePairs, updateShape, type BondSpec, type Group, type P, type SymbolKind, newTable, resizeTable, setTableCell, expandLabel, contractLabel, spliceTable, sizeTable, fitTable, clearTable, pairMap, clearMap, scaleSettings, scaleSizes, transformParts, medianBond, fitSizes, scaleAt, stereocentres, setEnhanced, nextGroup, markDirections, tiltAtoms, turnAboutBond, flattenAtoms, hingeOf, groupsOf, groupSelection, ungroupSelection, duplicateSelection, extractSelection, insertMol, wholeIntegral, wholeGroups, groupTargets, selectedGroups, outermost, outerGroups, pivotOf,
} from "./edit";
import { snapBoxes, snapMove, type Guide } from "./snap";
import { arrowTrace, kept, lobesOf, nearTrace, shapeTrace } from "./hit";
import { store, type Store } from "./store";
import { loadSettings, RULER_UNITS, saveSettings } from "./settings";
import { ACTIONS, actionFor, keyOf, keymap, label as keyLabel, native, platformLabel, registerMenu, toAccelerator } from "./keys";
import { Actions, actionItems, FontPick, SearchGlyph, type Context } from "./Actions";
import { onTop, reorder } from "./order";
import { Properties, propertyValues, PROPERTY_ROWS, type Calculated, type PropertyValues } from "./Properties";
import { SpectrumPanel, PEAK_COLOURS } from "./Spectrum";
import { acsText, multiplicity, quality } from "./nmr";
import { nmrReady, predict, type Nucleus } from "./nmr";
import { rings } from "./rings";
import { NumberField, Segmented, Switch } from "./Fields";
import { fromCdxml, toCdxml, type CdxmlOptions } from "./cdxml";
import { readOct, writeOct } from "./oct";
import { About } from "./About";
import { Home, NameBox, type RecentEntry } from "./Home";
import { Coach, NOTHING_SEEN, type Seen } from "./Coach";
import { Feedback } from "./Feedback";
import { ExportButton, ExportDialog } from "./ExportDialog";
import { flushSync } from "react-dom";
import { copyToClipboard, exportFile, MDL, readClipboard, standaloneSvg, UI, withMargin, type ExportFormat } from "./export";
import { formatAmount, formulaWeight, keyColumns, parseAmount, solve, type Field } from "./stoich";
import { logS, properties as calculate } from "./props";
import type { Graph } from "./naming";
import { CommandPalette, type Command } from "./CommandPalette";
import { StructureThumb } from "./TemplateLibrary";
import { cleanUpReaction, findReaction, GAP, layoutRow, reactionClean, roleOf, rowOf, type Reaction } from "./reaction";
import { alignByMap, clearScheme, interpret, mapScheme, rolesOf, type Part, type Role, type RoleStep } from "./interpret";
import { SEARCHES, searchNow, searchQuery } from "./search";
import { SettingsWindow, type ModuleId } from "./SettingsWindow";
import { layoutCycles, orderAround, spreadCycle, type Cycle, type CycleText } from "./cycle";
import { LIBRARY, libraryItem } from "./library";
import { BracketGlyph, BRACKETS, bracketSpec, ElementGlyph, ORBITAL_GRID, OrbitalGlyph, orbitalName, orbitalSpec, SHAPE_EXTRA, SHAPE_GRID, shapeName, shapeSpec } from "./elements";
import {
  ArrowGlyph, arrowName, arrowVariant, BondGlyph, BONDS, ChainGlyph, Palette, RingGlyph, RINGS, SELECTS, SymbolGlyph, SYMBOLS, TemplateGlyph,
  type BondKind, type RingKind, type SelectKind, type Tool,
} from "./tools";
import { arrowShapes, bendPoint, curved, scaleOf, fitArrows, HIGHLIGHT, SHADE, inShape, shapeBounds, turns, tlcLayout, spotPath, tableLayout, linesOf, TABLE_LINES, TABLE_PAD, curveBox, headsOf, takesHeads, isBracket, isLine, isOrbital, markAt, straightArrow, shapeInk, SWEEPS, sweepBend, sweepOf, isNumber, placeCaptions, render, renderParts, type Arrow, type ArrowKind, type Atom, type Box, type Drawing, type PartCache, type Caption, type CurvePoint, type Head, type HeadShape, type CurveFill, type Mol, type Placed, type Shape, type ShapeKind, type TableLine, type CellAlign, polymerLabelsAt, type AtomQuery, type Bond, type BracketUsage, type Polymer, type Grid } from "./render";
import { rotateCursor, selectCursor } from "./cursor";
import { CURSORS, handlePoint, isCorner, percentOf, resizeBy, sideAt, SIDES, type Box as RBox, type Side } from "./resize";
import { loadNames, nameToSmiles, suggestName, knownName, looksLikeSmiles } from "./names";
import { checkedName, graphOf, setNamer } from "./naming";
import { iupacName } from "./namer";

setNamer(iupacName);
import { loadTemplates, newTemplate, templateKind } from "./templates";
import { formulaRuns } from "./labels";
import { common, edited, lines as richLines, normalise, plainOf, runsOf, styleRange, styled, whole, without, type RunStyle, type TextRun } from "./richtext";
import { RichBox, type RichApi } from "./RichBox";
import { Dialog } from "./Dialog";
import { addAttachment, stepSubstituents, anyQuery, enclosed, genericSites, nextRGroup, placeAttachments, polymerLabel, polymerTags, rNumber, USAGES, USAGE_KINDS } from "./query";
import { Select } from "./Select";
import { expandGeneric, layoutGrid, MOST } from "./expand";
import "./editor.css";


const MOD = navigator.platform.startsWith("Mac") ? "⌘" : "Ctrl+";
// Export: ⌃⌘E on the Mac; Ctrl+Shift+E elsewhere, where ⌃ and ⌘ are both Ctrl (src-tauri/src/main.rs).
const EXPORT_KEYS = navigator.platform.startsWith("Mac") ? "⌃⌘E" : "⇧Ctrl+E";
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
// The drawing's origin is the middle of the page. The canvas opens at 125% of true size at the purpose's scale: 10 pt
// labels on Paper read like body text, and a structure fills a good part of the window without crowding it. Every
// purpose opens with bonds the same length on screen (IDEA-SIZE-7): Slides and Poster show their page smaller round
// the same structures. Actual Size still shows true size.
const OPEN_ZOOM = 1.25;
const openZoom = (d: DocStyle) => OPEN_ZOOM / (frameStyle(d, L).k * d.scale);
const SNAP = (15 * Math.PI) / 180; // dragged bonds snap to 15° steps
// Holding still this long with a drawing tool in hand switches to Select until the pointer is released.
const HOLD_MS = 400;
const toPath = (polys: P[][]) => polys.map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z").join("");

// A line, arc or orbital drawn the way arrows are: its kind, its bend for one sweep (signed by the drag), its style.
type Make = { kind: "line" | "arc" | "orbital" | "cut"; bend?: number; style?: Arrow["style"]; orbital?: Arrow["orbital"] };
// A handle: an arrow's ends or middle, or a picked caption's width.
type Corner = "from" | "to" | "bend" | "width";
// arrow: an arrow or a shape (they share ids).
type Hover = { atom?: number; bond?: number; caption?: number; arrow?: number; cycle?: number; step?: number };
const hitIn = (m: Mol, p: P): Hover => {
  const atom = atomAt(m, p);
  return atom !== undefined ? { atom } : { bond: bondAt(m, p) };
};
// The atoms an atom or bond hit stands for.
const atomsOf = (m: Mol, t: Hover) => (t.atom !== undefined ? [t.atom] : t.bond !== undefined ? m.bonds[t.bond].atoms : []);
// The object a hit stands for: a caption, an arrow or shape, or a cycle.
const itemsOf = (t: Hover) => [t.caption, t.arrow, t.cycle].filter((x): x is number => x !== undefined);

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
  // snap: the boxes snapping uses, made at the first move (a click does not need them) and kept for the drag.
  | { kind: "move"; from: P; working: Mol; moved: boolean; start: [number, number]; target: Hover; guides: Guide[]; point?: P; captions: Map<number, P>; arrows: Set<number>; cycles: Set<number>; snap: () => { moving: number[]; targets: number[][] } | undefined; base?: Mol; atoms?: Set<number> }
  // Drawing an arrow, and dragging one of a picked arrow's handles (an end, or the middle of a curved one).
  | { kind: "arrow"; from: P; start: [number, number]; target: Hover; to?: P; trail?: P[]; side?: number; make?: Make }
  // Drawing a shape from corner to corner.
  | { kind: "shape"; from: P; start: [number, number]; target: Hover; to?: P }
  | { kind: "handle"; id: number; which: Corner; working: Mol }
  // Placing a pen point: where it was pressed, and its outgoing handle if the press was dragged.
  | { kind: "pen"; at: P; start: [number, number]; out?: P }
  // Structure Perspective: tilting atoms through 3D from where they were (base), about their centre, or turning part
  // of a structure about the bond that joins it to the rest (hinge: [inside atom, outside atom]).
  // TLC: a spot moved (lane and Rf) or sized (Shift: width across, height up, tail down), or the origin or front moved.
  | { kind: "spot"; plate: number; index: number; base: Mol; from: P; size: boolean; moved: boolean; working: Mol }
  | { kind: "tlcline"; plate: number; which: "origin" | "front"; base: Mol; working: Mol }
  // Tables: a column or row border dragged with the Table tool (index 0 is the left or top edge).
  | { kind: "tableedge"; id: number; axis: "col" | "row"; index: number; base: Mol; working: Mol }
  | { kind: "tilt"; base: Mol; ids: Set<number>; centre: [number, number, number]; start: [number, number]; hinge?: [number, number]; working: Mol }
  // Mapping one atom to another with the Atom map tool: from the atom pressed to the pointer.
  | { kind: "map"; atom: number; start: [number, number]; to?: P }
  // Turning the selection by its rotation handle: about its centre, from the angle the drag started at.
  | { kind: "turn"; centre: P; middles: Map<number, P>; start: number; degrees: number; working: Mol }
  // Moving the centre the selection turns about (Option-drag on the centre mark). Not moved, it is an Option-click.
  | { kind: "pivot"; start: [number, number]; target: Hover; at: P; moved: boolean }
  // Resizing the selection by one of its frame's handles (resize.ts): the frame at the press (drawing units), what is
  // scaled, each free caption's middle, the stops, the factors and the point they scale about now. whole: the whole
  // drawing with Labels and lines, which a scale in proportion only zooms (it shows the drawing as it is, scaled).
  | { kind: "resize"; side: Side; frame: RBox; atoms: Set<number>; items: Set<number>; middles: Map<number, P>; stops: number[]; size: P; anchor: P; whole: boolean; labels: boolean; lines: boolean; working: Mol }
  // Moving the crosshair (View > Show Crosshair): from where it was, to where it is now.
  | { kind: "crosshair"; from: P; at: P };

// Draws again whenever a store changes, by calling its children with the value; nothing else draws again.
function Live<T>({ store: from, children }: { store: Store<T>; children: (value: T) => React.ReactNode }) {
  return <>{children(useSyncExternalStore(from.subscribe, from.get))}</>;
}
// The view: where the drawing's origin is on screen (px) and the zoom. pinch: a zoom gesture goes on (see onWheel).
type View = { x: number; y: number; zoom: number; pinch?: boolean };
// What Export and Copy make from the drawing for other programs (pictures aside).
// molfile: V2000, as ChemDraw puts it on the clipboard; mol, sdf, rxn and rdf: V3000 (or V2000 with 2000), as ChemDraw
// 26.1 saves them.
type PartFormat = "cdxml" | "oct" | "molfile" | "smiles" | "mol" | "mol2000" | "sdf" | "sdf2000" | "rxn" | "rxn2000" | "rdf" | "rdf2000";
const sameHover = (a: Hover, b: Hover) => a.atom === b.atom && a.bond === b.bond && a.caption === b.caption && a.arrow === b.arrow && a.cycle === b.cycle && a.step === b.step;
// Ink as SVG path data, kept with the arrow or shape it is made from, for each document style.
const arrowInks = new WeakMap<Arrow, [unknown, string]>(), shapeInks = new WeakMap<Shape, [unknown, string]>(), outlines = new WeakMap<object, [unknown, string]>();
// Octet's own calculators' values (props.ts), kept with the structure's values they are from (chem.ts keeps those by
// structure), so each structure is worked out once.
const calculated = new WeakMap<Structure, Calculated>();
// A drawing's rings (rings.ts, from its bonds alone), kept with its bond list: a drag that only moves atoms, a change
// of colour or fill, and undo find them again at once.
const ringLists = new WeakMap<Mol["bonds"], number[][]>();
function drawnRings(m: Mol): number[][] {
  let found = ringLists.get(m.bonds);
  if (!found) ringLists.set(m.bonds, (found = rings({ atoms: m.atoms.map(() => ({ el: "C", charge: 0, h: 0 })), bonds: m.bonds.map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: 1 as const })) })));
  return found;
}

// A caption's anchor in drawing coordinates: the start, middle or end of its first baseline.
const anchorOf = (c: Placed): P => [(c.anchor === "start" ? c.box[0] : c.anchor === "end" ? c.box[2] : (c.box[0] + c.box[2]) / 2) / L, -c.lines[0].y / L];
const union = (boxes: Box[]): Box | undefined => boxes.length ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] : undefined;
// The draft caption being typed sorts after every real one.
const DRAFT = Number.MAX_SAFE_INTEGER;
// The clipboard's plain text when it is one short line, for the name field. In the app it comes from the clipboard
// itself, so WebKit asks nothing.
async function clipboardText(): Promise<string | undefined> {
  try {
    const t = (TAURI ? (await readClipboard()).text : await navigator.clipboard?.readText())?.trim();
    return t && t.length <= 200 && !t.includes("\n") ? t : undefined;
  } catch {
    return undefined;
  }
}
// Typing in a field, or in a caption's rich text box (contentEditable): keys and Select All are the text's, not the drawing's.
const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement || (document.activeElement as HTMLElement | null)?.isContentEditable === true;

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
  for (const [colour, polys] of items) {
    const key = colour?.toLowerCase(), group = groups.get(key);
    if (group) for (const poly of polys) group.push(poly);
    else groups.set(key, [...polys]);
  }
  return [...groups];
}
// A structure moved, scaled or turned by a drag before it is drawn again (px), as an SVG transform.
const moveBy = ([x, y]: P, k = 1, turn = 0) => (turn ? `translate(${x} ${y}) rotate(${turn})${k !== 1 ? ` scale(${k})` : ""}` : k !== 1 ? `translate(${x} ${y}) scale(${k})` : x || y ? `translate(${x} ${y})` : undefined);
// A structure's ink as one path per colour and, in 3D structures, per how strongly it is drawn (Structure
// Perspective): [colour|alpha, path]. Made once for each drawing of the structure.
const inkPaths = new WeakMap<Drawing, [string, string][]>();
function structurePaths(d: Drawing): [string, string][] {
  let paths = inkPaths.get(d);
  if (!paths) {
    paths = byColour(d.polygons.map((poly, i) => [`${d.colours[i] ?? ""}|${(Math.round(d.alphas[i] * 20) / 20).toFixed(2)}`, [poly]] as const)).map(([key, polys]) => [key ?? "|1", toPath(polys)]);
    inkPaths.set(d, paths);
  }
  return paths;
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

// Octet's own clipboard type: a copied part of a drawing in Octet's file form (read back with the file checks).
const OCTET_CLIP = "application/x-octet+json";
// Abbreviations Contract Label recognises, each with its InChI when capped with xenon at its attachment point
// (worked out once, on first use): the groups chemists name, and condensed formulas they write.
const CONTRACTED = ["OMe", "OEt", "OiPr", "OtBu", "OAc", "OBz", "OBn", "OPh", "OTs", "OMs", "OTf", "OTBS", "OTIPS", "OTBDPS", "OTMS", "OMOM", "OTHP", "OPMB",
  "CO2Me", "CO2Et", "CO2tBu", "CO2Bn", "CO2H", "CHO", "CN", "NO2", "CF3", "CCl3", "OCF3", "SMe", "SO2Me", "NMe2", "NEt2", "NHAc", "NHBoc", "NHCbz", "NHFmoc",
  "NHTs", "NBoc2", "CONH2", "CONMe2", "N3", "SO3H", "COMe", "COPh"];
let contracted: [string, string][] | undefined;
function contractLabelText(want: string): string | undefined {
  contracted ??= [...CONTRACTED, ...Object.keys(GROUPS)].flatMap((name) => { const smiles = labelSmiles(name), inchi = smiles ? toInchi(`[Xe]${smiles}`) : undefined; return inchi ? [[name, inchi] as [string, string]] : []; });
  return contracted.find(([, inchi]) => inchi === want)?.[0];
}
// The stoichiometry grid's rows, as ChemDraw's: what each component is, then amounts. shown: rows that appear only
// once one of these was typed somewhere; product: rows for products (true) or reactants (false) only. Equivalents are
// a product's coefficient too, as ChemDraw's product column has them.
const GRID_ROWS: { id: string; name: string; field?: Field; product?: boolean; shown?: Field[] }[] = [
  { id: "formula", name: "Formula" }, { id: "mw", name: "MW" }, { id: "limiting", name: "Limiting?", product: false },
  { id: "equiv", name: "Equivalents", field: "equiv" }, { id: "mass", name: "Mass", field: "mass", product: false }, { id: "moles", name: "Moles", field: "moles", product: false },
  { id: "volume", name: "Volume", field: "volume", product: false, shown: ["volume", "density", "molarity"] }, { id: "density", name: "Density", field: "density", product: false, shown: ["density"] },
  { id: "molarity", name: "Molarity", field: "molarity", product: false, shown: ["molarity"] }, { id: "purity", name: "Purity", field: "purity", shown: ["purity"] },
  { id: "expected", name: "Expected mass", product: true }, { id: "expectedMoles", name: "Expected moles", product: true },
  { id: "measured", name: "Measured mass", field: "measured", product: true }, { id: "yield", name: "Yield", product: true },
];

// A pen point: a corner, or (dragged out) a smooth point with its incoming handle mirroring its outgoing one.
const penPoint = (at: P, out?: P): CurvePoint => (out ? { at, c1: [2 * at[0] - out[0], 2 * at[1] - out[1]], c2: out } : { at });

// Text with its formula counts as subscripts (see formulaRuns): 75% size, 0.212 em down, as in atom labels.
const formula = (text: string, size: number) => formulaRuns(text).map((r, k, all) => (
  <tspan key={k} dy={r.sub ? 0.212 * size : k && all[k - 1].sub ? -0.212 * size : undefined} style={r.sub ? { fontSize: 0.75 * size } : undefined}>{r.text}</tspan>
));
const formulaWidth = (text: string, size: number, bold?: boolean, italic?: boolean, family?: string) =>
  formulaRuns(text).reduce((w, r) => w + textWidth(r.text, r.sub ? 0.75 * size : size, bold, italic, family), 0);
// A caption's text on the canvas. It draws again only when its layout or look changes, so typing in one caption
// passes over all the others. reagent: its counts print as subscripts (reaction conditions, a cycle's reagents).
const samePlaced = (a: Placed, b: Placed) => a === b || (a.id === b.id && a.size === b.size && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline
  && a.colour === b.colour && a.anchor === b.anchor && a.font === b.font && a.lines.length === b.lines.length
  && a.lines.every((l, j) => l.text === b.lines[j].text && l.x === b.lines[j].x && l.y === b.lines[j].y && l.spacing === b.lines[j].spacing && JSON.stringify(l.runs) === JSON.stringify(b.lines[j].runs)));
type CaptionProps = { c: Placed; fill: string; font: string; reagent: boolean; pt: number };
const CaptionText = memo(({ c, fill, font, reagent, pt }: CaptionProps) => (
  <text className="caption" textAnchor={c.anchor} textDecoration={c.underline ? "underline" : undefined} fill={fill} style={{ font: `${c.italic ? "italic " : ""}${c.bold ? "bold " : ""}${c.size}px ${font}` }}>
    {c.lines.map((l, j) => <tspan key={j} x={l.x} y={l.y} style={l.spacing ? { wordSpacing: l.spacing } : undefined}>{l.runs ? richSpans(l.runs, c.size, pt) : reagent ? formula(l.text, c.size) : l.text}</tspan>)}
  </text>
), (a: CaptionProps, b: CaptionProps) => a.fill === b.fill && a.font === b.font && a.reagent === b.reagent && a.pt === b.pt && samePlaced(a.c, b.c));

export default function Editor() {
  const [loaded, setLoaded] = useState(false);
  const [h, dispatch] = useReducer(history, { stack: [EMPTY], at: 0 });
  const doc = h.stack[h.at];
  const [tool, setTool] = useState<Tool>("bond");
  // The drawing tool to go back to when a hold-to-select gesture ends.
  const [spring, setSpring] = useState<Tool>();
  // The view and the thing under the pointer change on each pan, zoom and pointer move. They live in stores: only the
  // parts that show them draw again (Live), and handlers read them as they run.
  const [views] = useState(() => { const s = loadSettings(); return store<View>({ x: innerWidth / 2, y: innerHeight / 2, zoom: Math.min(8, Math.max(0.25, openZoom(styleFor(s, s.purpose)))) }); });
  const setView = (next: View | ((v: View) => View)) => views.set(typeof next === "function" ? next(views.get()) : next);
  // A window made larger shows more of the grid and the rulers, which are drawn for the window alone.
  useEffect(() => { const grow = () => views.set({ ...views.get() }); addEventListener("resize", grow); return () => removeEventListener("resize", grow); }, [views]);
  const [hovers] = useState(() => store<Hover>({}, sameHover));
  const setHover = hovers.set;
  const [selection, setSelection] = useState<Set<number>>(new Set());
  // Captions picked, by id. Atoms and captions are selected separately and move, delete and copy together.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<Drag>();
  // A notice is an error (warning icon, error colour) unless it is information, such as "Copied.".
  const [notice, setNoticeState] = useState<{ text: string; info?: boolean }>();
  const setNotice = (text?: string, info?: boolean) => setNoticeState(text ? { text, info } : undefined);
  // Feedback (for testing): ⌘1, ⌘2 and ⌘3 within 1.5 s, ⌘ held or not between them (Ctrl elsewhere), takes a picture
  // of the window, then opens the feedback box (Feedback.tsx). The picture is taken first, so it shows the window as it was.
  const [feedback, setFeedback] = useState<{ picture?: string }>();
  const chord = useRef({ digits: new Set<string>(), at: 0 });
  useEffect(() => {
    const mac = navigator.platform.startsWith("Mac");
    const down = (e: KeyboardEvent) => {
      if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return;
      const c = chord.current, digit = (mac ? e.metaKey : e.ctrlKey) ? /^Digit([123])$/.exec(e.code)?.[1] : undefined;
      if (!digit) return c.digits.clear();
      e.preventDefault();
      if (Date.now() - c.at > 1500) { c.digits.clear(); c.at = Date.now(); }
      c.digits.add(digit);
      if (c.digits.size < 3) return;
      c.digits.clear();
      void invoke<string>("snapshot").then((picture) => setFeedback({ picture }), () => setFeedback({}));
    };
    addEventListener("keydown", down, true);
    return () => removeEventListener("keydown", down, true);
  }, []);
  // The hold-to-select switch: the tool icon pops and a ring pops at the pointer. pop.n restarts the animations.
  const [pop, setPop] = useState<{ n: number; x: number; y: number }>();
  const [cursor, setCursor] = useState<string>();
  const [settings, setSettings] = useState(loadSettings);
  // What this drawing shows over its page (View > Show Grid, Show Rulers, Show Crosshair). Not an edit: no undo step.
  const [guides, setGuides] = useState<Guides>({});
  // Where the pointer is (drawing coordinates), for the rulers' marks.
  const [pointers] = useState(() => store<P | undefined>(undefined));
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
    // An R-group definition takes the next R number (one a label uses with no definition yet, first).
    if ("rgroup" in spec && spec.rgroup) return { kind: "box", from, to, rgroup: { name: nextRGroup(doc) } };
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
  // What the pointer is over, for the cursor and the page and rotation handle highlights: the selection, the
  // selection's rotation handle, a table border with the Table tool (which way it drags), and a page's edge. It
  // changes as the pointer moves, so it lives in a store too.
  const [overs] = useState(() => store<{ selection: boolean; turn: boolean; edge?: "col" | "row"; page?: string; resize?: Side; cross?: boolean }>({ selection: false, turn: false },
    (a, b) => a.selection === b.selection && a.turn === b.turn && a.edge === b.edge && a.page === b.page && a.resize === b.resize && a.cross === b.cross));
  // Where the eraser outline is drawn (drawing coordinates), while the Eraser is in hand. It follows the pointer, so
  // it lives in a store too.
  const [brushes] = useState(() => store<P | undefined>(undefined));
  const setBrush = brushes.set;
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
  // The caret moving in the box changes what the Actions panel shows as on (Bold, Subscript and so on): only the panel
  // draws again.
  const [carets] = useState(() => store(0));
  useEffect(() => {
    if (!writing) return;
    const tick = () => carets.set(carets.get() + 1);
    document.addEventListener("selectionchange", tick);
    return () => document.removeEventListener("selectionchange", tick);
  }, [!!writing]); // eslint-disable-line react-hooks/exhaustive-deps
  // The curve the Pen is drawing (its points so far), and where the pointer is, for the segment to it.
  const [pen, setPen] = useState<CurvePoint[]>();
  const [penAt, setPenAt] = useState<P>();
  // The table cell being typed in: its table, row and column, and the text so far.
  const [cell, setCell] = useState<{ id: number; r: number; c: number; value: string }>();
  // The table cell last typed in: the row and column the table actions add, delete and align at.
  const [lastCell, setLastCell] = useState<{ id: number; r: number; c: number }>();
  useEffect(() => { if (cell) setLastCell({ id: cell.id, r: cell.r, c: cell.c }); }, [cell?.id, cell?.r, cell?.c]); // eslint-disable-line react-hooks/exhaustive-deps
  const cellOpen = useRef(false);
  const cellInput = useRef<HTMLInputElement>(null);
  useEffect(() => { cellInput.current?.select(); }, [cell?.id, cell?.r, cell?.c]);
  useEffect(() => { selectCursor.then(setCursor); }, []);
  const [turnCursor, setTurnCursor] = useState<string>();
  useEffect(() => { rotateCursor.then(setTurnCursor); }, []);
  // Where the centre mark was put (Option-drag, as in ChemDraw): every turn of the selection goes about it until the
  // selection changes.
  const [pivot, setPivot] = useState<P>();
  useEffect(() => setPivot(undefined), [selection, picked]);
  const hold = useRef<number>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const pointer = useRef<P>(undefined);
  // Every edit clears the selection, except a move, which keeps the same atoms selected. Groups keep whole structures,
  // so atoms drawn onto a grouped structure join its group (wholeGroups).
  const set = (mol: Mol, keepSelection = false, merge?: string) => {
    dispatch({ type: "set", mol: onTop(doc, wholeGroups(placeAttachments(mol)), fragments), merge });
    if (!keepSelection) { setSelection(new Set()); setPicked(new Set()); }
  };
  const undo = (redo = false) => { dispatch({ type: redo ? "redo" : "undo" }); setSelection(new Set()); setPicked(new Set()); };
  // The file on disk and the drawing as last saved. Undoing back to the saved drawing makes it clean again.
  const [file, setFile] = useState<{ path?: string; saved: Mol }>({ saved: EMPTY });
  // Home (decision 0003): where Octet opens (?editor skips it, for tests), with the name box on first launch and the
  // tutorial then, or from Octet > Tutorial. Recent drawings come from the app (src-tauri/src/recent.rs).
  const [home, setHome] = useState(() => !new URLSearchParams(location.search).has("editor"));
  const [welcomed, setWelcomed] = useState(false), [recents, setRecents] = useState<RecentEntry[]>([]);
  // The tutorial (Coach.tsx) on a new drawing: which run it is (0 when off), what it saw done, and the tool it points at.
  const [coach, setCoach] = useState(0), [seen, setSeen] = useState<Seen>(NOTHING_SEEN), [coachTool, setCoachTool] = useState<Tool>();
  const saw = (k: keyof Seen) => { if (coach) setSeen((s) => ({ ...s, [k]: s[k] + 1 })); };
  const [away] = useState(() => { const last = loadSettings().lastSeen; return last ? Date.now() - last : 0; });
  const dirty = doc !== file.saved;

  useEffect(() => { ready.then(() => setLoaded(true)); }, []);
  // Name to structure loads in the background once the window has settled.
  const [namesLoaded, setNamesLoaded] = useState(false);
  // The names engine loads in the background soon after start, so Structure to name is ready when first asked. Its
  // start-up is one long step, so it waits until there is no pointer or key input for 1.5 s: it does not stop the
  // window while the user draws. Asking for a name loads it at once.
  useEffect(() => {
    const input = ["pointerdown", "pointermove", "keydown", "wheel"];
    let t = 0;
    const wait = () => { clearTimeout(t); t = window.setTimeout(start, 1500); };
    const stop = () => { clearTimeout(t); input.forEach((e) => removeEventListener(e, wait, true)); };
    function start() { stop(); void loadNames().then(() => setNamesLoaded(true)).catch(() => {}); }
    input.forEach((e) => addEventListener(e, wait, { capture: true, passive: true }));
    wait();
    return stop;
  }, []);
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
  // A structure for a chemical name, laid out, or undefined (also until the names engine has loaded).
  const structureFor = (name: string): Mol | undefined => {
    const smiles = loaded ? nameToSmiles(name) : undefined;
    if (!smiles) return undefined;
    try { const m = parseStructure(smiles); return m.atoms.length ? m : undefined; } catch { return undefined; }
  };
  // A structure for typed or pasted text: a chemical name first (Octet's own names, drugs and formulas too), then
  // SMILES, InChI or a MOL file when the text looks like one. Indigo reads words such as "aspirin" as query atoms,
  // so a word is never read as SMILES.
  // refused gets the reason when the text is over Octet's limits.
  const structureFromText = (text: string, refused?: (why: string) => void): Mol | undefined => {
    const s = text.trim(), lines = s.includes("\n");
    const named = lines ? undefined : structureFor(s);
    if (named || !loaded || !(lines || looksLikeSmiles(s))) return named;
    // A MOL file keeps its first line, which is often blank (the name).
    try { const m = parseStructure(lines ? text.trimEnd() : s); return m.atoms.length ? m : undefined; } catch (err) { if (err instanceof RangeError) refused?.(err.message); return undefined; }
  };
  // A structure for a name typed with a slip in it: the name as typed, or else Octet's suggestion (thorough: from every
  // name one keystroke away too, 30 to 90 ms).
  const structureOrSuggestion = (text: string, thorough = false): { frag: Mol; name: string } | undefined => {
    const frag = structureFromText(text);
    if (frag) return { frag, name: text.trim() };
    const fixed = suggestName(text, thorough), mended = fixed ? structureFor(fixed) : undefined;
    return fixed && mended ? { frag: mended, name: fixed } : undefined;
  };
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(undefined), 4000); return () => clearTimeout(t); } }, [notice]);
  // After an edit, the thing under a still pointer may have changed.
  useEffect(() => { if (pointer.current) setHover(hit(pointer.current)); }, [doc]);

  const name = file.path?.split(/[\\/]/).pop()?.replace(/\.(octet|oct|cdxml)$/i, "") ?? "Untitled";
  useEffect(() => { if (TAURI) getCurrentWindow().setTitle(home ? "Octet" : dirty ? `${name} (edited)` : name); }, [name, dirty, home]);

  // A picture of part of the drawing (or all of it) as a standalone SVG at true size: the canvas shows only that part
  // for a moment (nothing is painted in between), and the picture is cut to the ink of what it draws.
  function pictureOf(part: Mol): string | undefined {
    const canvas = svg.current;
    if (!canvas) return undefined;
    flushSync(() => setExporting(part));
    try {
      const world = canvas.querySelector<SVGGElement>("#world"), inv = world?.getCTM()?.inverse();
      if (!world || !inv) return undefined;
      let box: [number, number, number, number] | undefined;
      for (const el of world.querySelectorAll<SVGGraphicsElement>("path, polygon, polyline, line, rect, circle, ellipse, text, image, use")) {
        if (el.closest(UI)) continue;
        const b = el.getBBox(), m = el.getCTM();
        if ((!b.width && !b.height) || !m) continue;
        for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
          const q = new DOMPoint(x, y).matrixTransform(inv.multiply(m));
          box = box ? [Math.min(box[0], q.x), Math.min(box[1], q.y), Math.max(box[2], q.x), Math.max(box[3], q.y)] : [q.x, q.y, q.x, q.y];
        }
      }
      return box && standaloneSvg(canvas, box, 1 / pt);
    } finally {
      flushSync(() => setExporting(undefined));
    }
  }
  // What other programs read: CDXML, a .oct file (the same CDXML with Octet's drawing), and the molecules as a molfile
  // and SMILES; undefined where Octet or Indigo cannot write them. Each is made when it is first asked for and kept
  // with the part (the drawing itself, or the selection's part from selectedPart), so Export and Copy make only what
  // they use, once for each version of the drawing. They are made again when the style, the name, Indigo or the arrows
  // of a catalytic cycle (what cdxmlOptions gives) change.
  const made = useRef(new WeakMap<Mol, { style: DocStyle; name: string; loaded: boolean; derived: unknown; formats: Partial<Record<PartFormat, string>> }>());
  function formatOf(part: Mol, f: PartFormat): string | undefined {
    let kept = made.current.get(part);
    if (kept?.style !== style || kept.name !== name || kept.loaded !== loaded || kept.derived !== cycleArrows) made.current.set(part, kept = { style, name, loaded, derived: cycleArrows, formats: {} });
    if (f in kept.formats) return kept.formats[f];
    const cdxml = f === "oct" ? formatOf(part, "cdxml") : undefined;
    let out: string | undefined;
    try {
      out = (f === "cdxml" ? toCdxml(part, style, cdxmlOptions()) : f === "oct" ? cdxml && writeOct(part, style, cdxmlOptions(), cdxml)
        : part.atoms.length && loaded ? chemistryOf(part, f) : undefined) || undefined;
    } catch { out = undefined; }
    return (kept.formats[f] = out);
  }
  // A part's molecules or reactions as MDL files and SMILES. A drawing with reactions copies as reaction SMILES (one line
  // for each step, with its map numbers); an RXN file holds one step, an RD file every step.
  function chemistryOf(part: Mol, f: PartFormat): string | undefined {
    const v2000 = f.endsWith("2000"), kind = f.replace("2000", "");
    if (f === "molfile" || kind === "mol") return toMolfile(part, f === "molfile" || v2000);
    if (kind === "sdf") return toSdf(part, v2000);
    const steps = stepsIn(part);
    if (f === "smiles") return steps.length ? toReaction(part, steps, "smiles") : toSmiles(part);
    if (kind === "rxn") return steps.length === 1 ? toReaction(part, steps, "rxn", v2000) : undefined;
    return steps.length ? toReaction(part, steps, "rdf", v2000) : undefined;
  }
  // File > Print (⌘P): the document's page at true size, the drawing where it sits on the page, as a picture the
  // print layout shows alone (the editor's chrome is hidden for printing), then the system's print dialog.
  const [printing, setPrinting] = useState<{ src: string; w: number; h: number }>();
  async function printDrawing() {
    const canvas = svg.current, [, w, h] = pages[0], x = (w / 2) * mm * L, y = (h / 2) * mm * L;
    if (!canvas) return;
    flushSync(() => setExporting(doc));
    let text: string;
    try { text = standaloneSvg(canvas, [-x, -y, x, y], 1 / pt); } finally { flushSync(() => setExporting(undefined)); }
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    flushSync(() => setPrinting({ src: `data:image/svg+xml;base64,${btoa(bin)}`, w: (w * 72) / 25.4, h: (h * 72) / 25.4 }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { await invoke("print_page"); } catch (e) { setNotice(`Octet cannot print. ${e}`); }
  }
  // The selection as a drawing of its own, kept while the drawing and the selection stay the same.
  const partKept = useRef<{ doc: Mol; selection: Set<number>; picked: Set<number>; part: Mol }>(undefined);
  const selectedPart = () => {
    if (!selection.size && !picked.size) return undefined;
    const s = partKept.current;
    if (s?.doc === doc && s.selection === selection && s.picked === picked) return s.part;
    return (partKept.current = { doc, selection, picked, part: extractSelection(doc, selection, picked) }).part;
  };
  // Export… (⌃⌘E, and the Export button): the settings first, with the whole drawing's picture and, when something is
  // selected, the selection's. The chosen format is made when the dialog shows it. Then the Save dialog for that format.
  function openExport() {
    const sel = selectedPart();
    setExportView({ all: pictureOf(doc), selection: sel && pictureOf(sel), parts: { all: doc, selection: sel } });
  }
  const filePrefs = settings.files;
  async function exportPart(part: "all" | "selection") {
    const v = exportView, svg = v?.[part], mol = v?.parts[part], f = filePrefs;
    if (!v || !mol) return;
    // Only what the format needs: a PDF carries the CDXML.
    const make = (pf: PartFormat, ...fs: ExportFormat[]) => (fs.includes(f.format) ? formatOf(mol, pf) : undefined);
    try {
      const path = await exportFile({ name, format: f.format, oct: make("oct", "oct"), svg: svg && withMargin(svg, f.margin), cdxml: make("cdxml", "cdxml", "pdf"), mdl: MDL.includes(f.format) ? formatOf(mol, f.format as PartFormat) : undefined, smiles: make("smiles", "smi"), dpi: f.dpi, transparent: f.background === "transparent" });
      if (path) setExportView(undefined);
    } catch (e) {
      setNotice(`Octet cannot export this drawing. ${e}`);
    }
  }
  // Quick export as PNG: the selection, or the whole drawing, straight to the Save dialog with the saved PNG settings.
  async function quickExport() {
    const svg = pictureOf(selectedPart() ?? doc), f = filePrefs;
    if (!svg) return setNotice("There is nothing to export.");
    try {
      await exportFile({ name, format: "png", svg: withMargin(svg, f.margin), dpi: f.dpi, transparent: f.background === "transparent" });
    } catch (e) {
      setNotice(`Octet cannot export this drawing. ${e}`);
    }
  }
  // What the CDXML writer needs from the editor: a catalytic cycle's arrows (drawn from the cycle, so not in the
  // drawing), each written label's atoms for ChemDraw's abbreviations, and the document's name.
  const cdxmlOptions = (): CdxmlOptions => ({
    derived: cycleArrows, name,
    expand: (text) => { const smiles = loaded ? labelSmiles(text) : undefined; try { return smiles ? parseStructure(smiles) : undefined; } catch { return undefined; } },
  });
  // What Octet could not hold from a ChemDraw file, said once: "Octet left out 6 annotations and 1 rotated shape."
  const sayLost = (lost: Record<string, number>) => {
    const parts = Object.entries(lost).map(([what, n]) => `${n} ${what}${n > 1 && !/s$/.test(what) ? "s" : ""}`);
    if (parts.length) setNotice(`Octet left out ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]}.`);
  };
  // Resolves true when the drawing was saved.
  async function save(as: boolean): Promise<boolean> {
    try {
      const path = await invoke<string | null>("save_drawing", { path: as ? null : (file.path ?? null), contents: writeOct({ ...doc, guides }, style, cdxmlOptions()) });
      if (path) setFile({ path, saved: doc });
      return !!path;
    } catch (e) {
      setNotice(`Octet cannot save this drawing. ${e}`);
      return false;
    }
  }
  // Before the drawing is replaced (New, Open, a recent drawing): with unsaved changes, ask to save them first.
  const keepWork = (next: () => void) => (dirty ? setDialog({ kind: "unsaved", next }) : next());
  // A new drawing for a purpose (IDEA-SIZE-1): its style and page, at the middle of the window and the open zoom.
  // Return and ⌘N start the purpose picked last, as ChemDraw's New takes the stationery used last.
  const newDrawing = (id = settings.purpose) => keepWork(() => {
    const style = styleFor(settings, id), fresh: Mol = { ...EMPTY, style };
    drawingColours.current = []; set(fresh); setFile({ saved: fresh }); setGuides(freshGuides([0, 0])); setHome(false); setCoach(0); openView(style);
    setSettings((s) => ({ ...s, purpose: purposeOf(s, id) ? id : "paper" }));
  });
  // The tutorial is always on Paper (IDEA-SIZE-14): its steps are made for a manuscript's sizes.
  const startTutorial = () => keepWork(() => {
    const style = styleFor(settings, "paper"), fresh: Mol = { ...EMPTY, style };
    set(fresh); setFile({ saved: fresh }); setGuides(freshGuides([0, 0])); setHome(false); openView(style); setTool("bond"); setSeen(NOTHING_SEEN); setCoach((n) => n + 1);
    setSettings((s) => ({ ...s, tutorialDone: true }));
  });
  // The open view for a new drawing in a style: the page's middle in the window's middle, at the open zoom. The page
  // outlines do not grow into place.
  const openView = (d: DocStyle) => { lastK.current = frameStyle(d, L).k * d.scale; outlineFrom.current = undefined; setView({ x: innerWidth / 2, y: innerHeight / 2, zoom: openZoom(d) }); };
  // Settings > Document > For, and For in the command palette: the open drawing takes a purpose's sizes and page in one
  // undo step. The sizes it holds in points go with the scale (decision 0007).
  const applyPurpose = (id: string) => {
    const next = forPurpose(style, styleFor(settings, id));
    set({ ...scaleSizes(doc, next.scale / style.scale), style: next }, true);
  };
  // Every purpose, for Home, Settings, File > New For and the command palette: Octet's four, then the user's own.
  const purposeList = useMemo(() => [
    ...(Object.keys(PURPOSES) as PurposeKind[]).map((kind) => ({ id: kind as string, name: PURPOSES[kind].name, kind, style: styleFor(settings, kind) })),
    ...settings.ownPurposes.map((p) => ({ id: p.id, name: p.name, kind: p.kind, style: p.style, own: true })),
  ], [settings.purposeStyles, settings.ownPurposes]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Use for new documents": the style becomes its purpose's style for new drawings (with no purpose: the purpose
  // Return starts). "Save as a new purpose…": the style becomes a purpose of the user's own, after the others.
  const keepForNew = (d: DocStyle) => setSettings((s) => {
    const id = purposeOf(s, d.purpose) ? d.purpose! : s.purpose, kept = { ...d, purpose: id };
    return s.ownPurposes.some((p) => p.id === id) ? { ...s, ownPurposes: s.ownPurposes.map((p) => (p.id === id ? { ...p, style: kept } : p)) }
      : { ...s, purposeStyles: { ...s.purposeStyles, [id]: kept } };
  });
  const savePurpose = (name: string) => setSettings((s) => {
    const same = s.ownPurposes.find((p) => p.name.toLowerCase() === name.toLowerCase()), id = same?.id ?? `u${Date.now().toString(36)}`;
    const own = { id, name, kind: purposeOf(s, style.purpose)?.kind ?? "paper", style: { ...style, purpose: id } };
    return { ...s, ownPurposes: same ? s.ownPurposes.map((p) => (p.id === id ? own : p)) : [...s.ownPurposes, own].slice(0, MAX_PURPOSES) };
  });
  // File > New For lists the user's purposes, and File > New shows the purpose it starts: the menu bar is built again
  // when they change.
  const purposeMenu = JSON.stringify([settings.ownPurposes.map((p) => p.name), purposeOf(settings, settings.purpose)?.name ?? ""]);
  useEffect(() => {
    const [names, current] = JSON.parse(purposeMenu);
    if (TAURI) invoke("set_purposes", { names, current }).then(syncChecks).catch(() => {});
  }, [purposeMenu]); // eslint-disable-line react-hooks/exhaustive-deps
  const openDrawing = () => keepWork(() => void open());
  const openRecent = (r: RecentEntry) => keepWork(() => void invoke<[string, string]>("open_recent", { path: r.path }).then((picked) => load(picked[0], picked[1]))
    .catch((e) => { setNotice(String(e)); refreshRecents(); }));
  const refreshRecents = () => { if (TAURI) invoke<RecentEntry[]>("recent_list").then(setRecents).catch(() => {}); };
  useEffect(() => { if (home) refreshRecents(); }, [home]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened or saved: the drawing's picture goes to its Home tile.
  useEffect(() => {
    if (!TAURI || !file.path) return;
    const t = window.setTimeout(() => { const svg = pictureOf(file.saved); if (svg) invoke("recent_thumb", { path: file.path, svg }).catch(() => {}); }, 0);
    return () => clearTimeout(t);
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  // When Octet was last opened, for the next "Welcome back".
  useEffect(() => { setSettings((s) => ({ ...s, lastSeen: Date.now() })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function open() {
    try {
      const picked = await invoke<[string, string] | null>("open_drawing");
      if (!picked) return;
      load(picked[0], picked[1]);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : `Octet cannot open this file. ${e}`);
    }
  }
  // A drawing read from a file, into the editor.
  function load(path: string, text: string) {
    drawingColours.current = [];
    try {
      const read = readOct(text), lost = read.lost, { guides: saved, ...kept } = read.mol;
      // Settings > Files > Keep ChemDraw styles off: another program's drawing takes Octet's default style.
      const mol = wholeGroups(read.foreign && !settings.files.keepStyle ? { ...kept, style: undefined } : kept);
      // The grid, rulers and crosshair as the drawing was saved with them; the user's last choice when it says none.
      // A drawing saved before Show Grid, with Gridlines set (a step in mm), shows its grid as it did.
      const b = bounds(mol);
      setGuides(saved ?? { ...freshGuides(b && [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]), ...(typeof kept.style?.grid === "number" ? { grid: true } : {}) });
      set(mol);
      setFile({ path, saved: mol });
      setHome(false); setCoach(0); outlineFrom.current = undefined;
      sayLost(lost);
      if (b) setView((v) => ({ ...v, x: innerWidth / 2 - ((b[0] + b[2]) / 2) * v.zoom * L, y: innerHeight / 2 + ((b[1] + b[3]) / 2) * v.zoom * L }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : `Octet cannot open this file. ${e}`);
    }
  }
  // Atom Properties: the atom's element or label, charge, isotope and radical, in one dialog.
  function atomProperties(i: number | undefined) {
    if (i === undefined || !doc.atoms[i]) return setNotice("Select an atom first.");
    const a = doc.atoms[i];
    const g = /^(abs|&|or)(\d*)$/.exec(a.enhanced ?? "");
    // Its query properties apply to every selected atom (only those changed), as ChemDraw's dialog does.
    const targets = selection.has(i) ? [...selection].filter((k) => doc.atoms[k]) : [i];
    setDialog({ kind: "atom", atom: i, element: a.text ?? a.label, charge: String(a.charge ?? 0), isotope: a.isotope ? String(a.isotope) : "", radical: String(a.radical ?? 0), stereo: g?.[1] ?? "", group: g?.[2] ?? "1",
      targets, q: { ...a.query }, q0: { ...a.query } });
  }
  // Bond Properties: the selected bonds' (or the bond pointed at) type, with ChemDraw's query types, topology and
  // reaction centre.
  function bondProperties() {
    const picked = doc.bonds.flatMap((b, k) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? [k] : [])), hovered = hovers.get().bond;
    const bonds = picked.length ? picked : hovered !== undefined ? [hovered] : [];
    if (!bonds.length) return setNotice("Select a bond first.");
    const b = doc.bonds[bonds[0]], style = b.query ?? (Object.keys(BONDS) as BondKind[]).find((k) => { const sp: BondSpec = BONDS[k].spec; return sp.type === b.type && sp.stereo === b.stereo && sp.display === b.display; }) ?? "";
    const now = { type: style, topology: b.topology ?? "", rxn: b.rxn ?? "" };
    setDialog({ kind: "bond", bonds, ...now, start: now });
  }
  // Bracket Properties: a picked pair of brackets' usage and what goes with it.
  function bracketProperties() {
    const sh = (doc.shapes ?? []).find((x) => picked.has(x.id) && isBracket(x) && !x.side);
    if (!sh) return setNotice("Select a pair of brackets first.");
    const p = sh.polymer, e = enclosed(doc, sh);
    // Flip Type is for a ladder polymer's brackets: two bonds crossing each bracket.
    setDialog({ kind: "bracket", shape: sh.id, usage: p?.usage ?? "", label: p?.usage === "sru" || p?.usage === "param" ? p.label ?? "" : "", count: p?.usage === "mult" ? p.label ?? "2" : "2",
      order: p?.order ? String(p.order) : "0", mw: p?.mw ? String(p.mw) : "", pattern: p?.pattern ?? "", flip: p?.flip ?? "", flippable: e.crossing.length === 4 });
  }
  // R-Logic Query: a row for each R-group definition.
  function rLogic() {
    const boxes = (doc.shapes ?? []).filter((x) => x.rgroup).sort((p, q) => (rNumber(p.rgroup!.name) ?? 0) - (rNumber(q.rgroup!.name) ?? 0));
    if (!boxes.length) return setNotice("Draw an R-group definition first: use the Shape tool's R-group definition round its fragments.");
    setDialog({ kind: "rlogic", rows: boxes.map((x) => ({ id: x.id, name: x.rgroup!.name, occur: x.rgroup!.occur ?? "", restH: !!x.rgroup!.restH, then: x.rgroup!.then ?? "" })) });
  }
  // An attachment on the selected atoms (two or more).
  function attach(variable: boolean) {
    const atoms = [...selection].filter((i) => doc.atoms[i] && !doc.atoms[i].centre && !doc.atoms[i].attach);
    if (atoms.length < 2) return setNotice("Select the atoms the attachment joins: two or more.");
    // Not selected: a drag from it with the Bond tool then draws its bond, and does not move it.
    set(addAttachment(doc, atoms, variable)[0]);
  }
  // Structure > Enhanced Stereochemistry on the selected stereocentres (every one with nothing selected).
  function enhance(kind: "abs" | "or" | "&" | undefined) {
    const centres = stereocentres(doc, selection.size ? selection : undefined);
    if (!centres.length) return setNotice("Select a stereocentre: an atom at the narrow end of a wedge or hash bond.");
    if (kind !== "or" && kind !== "&") return set(setEnhanced(doc, centres, kind), true);
    let m = doc;
    const moving = new Set(centres);
    for (const g of fragments(doc)) {
      const ours = g.filter((i) => moving.has(i));
      if (ours.length) m = setEnhanced(m, ours, `${kind}${nextGroup(doc, g, kind, moving)}`);
    }
    set(m, true);
  }
  // Show or hide atom numbers. Each atom's number is its place in its structure, counting from 1, as ChemDraw numbers
  // atoms in the order they were drawn. When every one of the atoms already shows its number, they are hidden.
  function numberAtoms(atoms: number[]) {
    const hide = atoms.every((i) => doc.atoms[i]?.number), place = new Map<number, number>();
    for (const g of fragments(doc)) [...g].sort((p, q) => p - q).forEach((i, k) => place.set(i, k + 1));
    set({ ...doc, atoms: doc.atoms.map((a, i) => (!atoms.includes(i) ? a : hide ? { ...a, number: undefined } : a.number ? a : { ...a, number: String(place.get(i) ?? 1) })) }, true);
  }
  // Import a structure file: it lands to the right of the drawing (or in the middle of an empty canvas), selected.
  async function importFile() {
    try {
      const picked = await invoke<[string, string] | null>("import_structure");
      if (!picked) return;
      if (/<CDXML[\s>/]/.test(picked[1].slice(0, 65536))) {
        // A ChemDraw drawing: all of it, arrows and text too, to the right of what is there.
        const { mol: add, style: from, lost } = fromCdxml(picked[1]);
        const r = insertMol(doc, fitSizes(add, from, style), add.atoms.length ? landing(add) : [0, 0]);
        set(r.mol, true);
        setSelection(r.atoms);
        setPicked(r.items);
        return sayLost(lost);
      }
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
      ...(doc.shapes ?? []).map((sh) => ({ x: shapeBounds(sh)[2], level: (sh.from[1] + sh.to[1]) / 2, arrow: false })),
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
    // A query file's R-group boxes and polymer brackets, and a reaction's arrows and plus signs, come with its atoms.
    if (frag.shapes?.length || frag.arrows?.length || frag.captions?.length) {
      const r = insertMol(base, frag, landing(frag, at));
      set(frag.arrows?.length ? laidOut(r.mol, (frag.arrows ?? []).map((a) => r.ids.get(a.id)!)) : r.mol);
      setSelection(r.atoms);
      return setPicked(r.items);
    }
    set(merge(base, frag, landing(frag, at)));
    setSelection(new Set(frag.atoms.map((_, i) => base.atoms.length + i)));
  }
  // A reaction that came in (a file or text with arrows) laid out as Clean Up Reaction lays it out, measured as it will
  // be drawn. arrowIds: its arrows.
  function laidOut(m: Mol, arrowIds: number[]): Mol {
    const d = render(m, frame, measure, L), box = (b?: Box): Box | undefined => b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
    const width = (t: string, c: Caption) => textWidth(t, (c.size ?? style.captionSize) * pt, c.bold, c.italic, fontStack(c.font ?? style.captionFont));
    const caps = placeCaptions(m, d, width, m.arrows ?? [], pt, style.captionSize), done = new Set<number>();
    for (const id of arrowIds) {
      if (done.has(id)) continue;
      const r = findReaction(m, id, m.arrows ?? [], (atoms) => box(union(atoms.filter((i) => d.ink[i]).map((i) => d.ink[i]))), (cid) => box(caps.find((c) => c.id === cid)?.box));
      if (!r) continue;
      r.arrows.forEach((a) => done.add(a));
      m = cleanUpReaction(m, r, m.arrows ?? []);
    }
    return m;
  }
  // Name to structure (⇧⌘N), from what is in hand, as ChemDraw does: the caption or lone atom label being typed or
  // picked becomes its structure, in its place. Text that is not a name opens the name field with that text. With
  // nothing in hand the name field opens empty, or with the clipboard's text when that is a name or SMILES. In the
  // name field, ⇧⌘N draws the name, as Return does.
  function nameToStructure(waited = false) {
    if (naming !== undefined) return drawNamed();
    if (!waited && !namesLoaded) return void loadNames().then(() => { setNamesLoaded(true); nameToStructure(true); }, () => openNaming());
    // The caption being typed.
    if (writing) {
      const text = writing.value.trim(), c = placed.find((x) => x.id === (writing.id ?? DRAFT)), found = text ? structureOrSuggestion(text, true) : undefined;
      // The caption is kept first, so Undo gives back the text as typed (as in ChemDraw, where the caption is there).
      commitWriting();
      if (!found || !c) return openNaming(text);
      return convertInPlace(found, writing.id !== undefined ? deleteGraphics(doc, new Set([writing.id])) : doc, [(c.box[0] + c.box[2]) / 2 / L, -(c.box[1] + c.box[3]) / 2 / L]);
    }
    // The label being typed: an atom with no bonds becomes the structure. Otherwise the label is kept, as Return keeps
    // it, and the name field opens with its text.
    if (editing) {
      const text = editing.value.trim(), lone = !doc.bonds.some((b) => b.atoms.includes(editing.atom)), found = lone && text ? structureOrSuggestion(text, true) : undefined;
      labelOpen.current = false;
      setEditing(undefined);
      const [x, y] = doc.atoms[editing.atom].location;
      // The label is kept first, as Return keeps it, so Undo gives back the text as typed.
      set(setLabel(doc, editing.atom, editing.value));
      if (found) return convertInPlace(found, deleteAtom(doc, editing.atom), [x, y]);
      return openNaming(text);
    }
    // A picked caption, or one picked atom with a label and no bonds.
    const c = picked.size === 1 && !selection.size ? doc.captions?.find((x) => picked.has(x.id)) : undefined;
    const atom = !picked.size && selection.size === 1 ? [...selection][0] : undefined, a = atom !== undefined ? doc.atoms[atom] : undefined;
    const label = a?.text && !doc.bonds.some((b) => b.atoms.includes(atom!)) ? a.text : undefined;
    if (c) {
      const found = structureOrSuggestion(c.text, true), p = placed.find((x) => x.id === c.id);
      if (found && p) return convertInPlace(found, deleteGraphics(doc, new Set([c.id])), [(p.box[0] + p.box[2]) / 2 / L, -(p.box[1] + p.box[3]) / 2 / L]);
      return openNaming(c.text);
    }
    if (label) {
      const found = structureOrSuggestion(label, true);
      if (found) return convertInPlace(found, deleteAtom(doc, atom!), [a!.location[0], a!.location[1]]);
      return openNaming(label);
    }
    openNaming();
  }
  // A structure in place of the text it was read from. A name (not SMILES) joins the names drawn before.
  function convertInPlace(found: { frag: Mol; name: string }, base: Mol, at: P) {
    place(found.frag, base, at);
    if (structureFor(found.name)) rememberName(found.name, found.frag);
  }
  // The name field, with the text given; with none, the clipboard's text if Octet reads it as a structure.
  function openNaming(text?: string) {
    void loadNames().then(() => setNamesLoaded(true), () => {});
    setNaming(text ?? "");
    if (text) return;
    void clipboardText().then((t) => {
      if (!t || !structureFromText(t)) return;
      // Selected, so a name typed in its place replaces it.
      flushSync(() => setNaming((n) => (n === "" ? t : n)));
      if (nameField.current?.value === t) nameField.current.select();
    });
  }
  // Draws what the name field holds (or the recent name the arrow keys are on). False when it is not a name.
  function drawNamed(): boolean {
    if (naming === undefined) return false;
    if (recent.at >= 0 && historyRows[recent.at] !== undefined) { pickHistory(historyRows[recent.at]); return true; }
    if (!named) return false;
    place(named);
    if (structureFromText(naming)) { if (structureFor(naming.trim())) rememberName(naming.trim(), named); } else if (suggestion) rememberName(suggestion, named);
    setNaming(undefined);
    return true;
  }
  // Menu commands. New and Open go on the undo list, so they never lose work.
  const commands = useRef<Record<string, () => void>>({});
  commands.current = {
    new: () => newDrawing(),
    ...Object.fromEntries(Object.keys(PURPOSES).map((k) => [`new_${k}`, () => newDrawing(k)])),
    ...Object.fromEntries(settings.ownPurposes.map((p, k) => [`new_own_${k}`, () => newDrawing(p.id)])),
    open: () => openDrawing(),
    home: () => setHome(true),
    tutorial: () => startTutorial(),
    import: () => void importFile(),
    save: () => void save(false),
    save_as: () => void save(true),
    // While a label or caption is being typed, the Edit menu works on its text.
    undo: () => (typing() ? void document.execCommand("undo") : undo()),
    redo: () => (typing() ? void document.execCommand("redo") : undo(true)),
    select_all: () => {
      if (typing()) {
        const el = document.activeElement as HTMLElement;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.select();
        const range = document.createRange(), sel = getSelection();
        range.selectNodeContents(el);
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
      // Everything, as ChemDraw's Select All: structures, text, arrows, orbitals, shapes, brackets and cycles.
      setSelection(new Set(doc.atoms.map((_, i) => i)));
      setPicked(new Set([...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].map((x) => x.id)));
    },
    snap: () => setSettings((s) => ({ ...s, snap: !s.snap })),
    snap_grid: () => setSettings((s) => ({ ...s, snapGrid: !s.snapGrid })),
    grid: () => showGuide("grid"),
    rulers: () => showGuide("rulers"),
    crosshair: () => showGuide("crosshair"),
    warnings: () => setSettings((s) => ({ ...s, warnings: !s.warnings })),
    // Display Warnings back on for the selected atoms, the bonds between them and the picked brackets.
    show_warnings: () => set({
      ...doc, atoms: doc.atoms.map((a, k) => (selection.has(k) && a.ignoreWarnings ? { ...a, ignoreWarnings: undefined } : a)),
      bonds: doc.bonds.map((b) => (b.ignoreWarnings && selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? { ...b, ignoreWarnings: undefined } : b)),
      ...(doc.shapes ? { shapes: doc.shapes.map((x) => (x.ignoreWarnings && picked.has(x.id) ? { ...x, ignoreWarnings: undefined } : x)) } : {}),
    }, true),
    // Structure commands act on the selection, or on the whole drawing when nothing is selected.
    clean_up: () => {
      if (!loaded || !doc.atoms.length) return;
      saw("clean");
      const ids = selection.size ? selection : undefined;
      let m = cleanUp(doc, ids);
      if (fragments(doc).some((g) => g.length > MOST_CLEAN && (!ids || g.some((i) => ids.has(i))))) setNotice(`Octet cannot clean up a structure of more than ${MOST_CLEAN.toLocaleString("en-GB")} atoms.`);
      const docBox = (b?: Box): Box | undefined => b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
      const inkOf = (mol: Mol) => { const d = render(mol, frame, measure, L); return (atoms: number[]) => docBox(union(atoms.filter((i) => d.ink[i]).map((i) => d.ink[i]))); };
      const captionOf = (id: number) => docBox(placed.find((c) => c.id === id)?.box);
      // Structures in a reaction keep their sides: each reaction they are in is laid out again, as Clean Up Reaction
      // does (reactants, the arrow, products), measured after the clean-up.
      const touched = new Set(ids ? fragments(m).filter((g) => g.some((i) => ids.has(i))).flat() : m.atoms.map((_, i) => i)), done = new Set<number>();
      for (const a of arrows.filter((x) => straightArrow(x))) {
        if (done.has(a.id)) continue;
        const r = findReaction(m, a.id, arrows, inkOf(m), captionOf);
        if (!r || !r.atoms.some((i) => touched.has(i))) continue;
        r.arrows.forEach((id) => done.add(id));
        m = cleanUpReaction(m, r, arrows);
      }
      if (done.size) return set(m, true);
      // Otherwise several structures that overlap, or have a plus sign among them, go in a row like a reaction's
      // starting materials. With a plus sign, an arrow after them is offered: Tab draws it.
      const row = rowOf(m, ids, inkOf(m), captionOf);
      if (row) {
        const laid = layoutRow(m, row.steps);
        m = laid.mol;
        const ahead = (doc.arrows ?? []).some((a) => !curved(a) && Math.min(a.from[0], a.to[0]) > laid.right - 0.5 && Math.abs((a.from[1] + a.to[1]) / 2 - laid.level) < 1.5);
        if (row.plus && !ahead) setOffer({ from: [laid.right + GAP, laid.level], to: [laid.right + GAP + 3, laid.level], doc: m });
      }
      set(m, true);
    },
    // ChemDraw's Rotate 180° Horizontal and Vertical (⇧⌘H, ⇧⌘V: stereo kept), and its Flip (a mirror image).
    flip_h: () => flip("horizontal"),
    flip_v: () => flip("vertical"),
    mirror_h: () => flip("horizontal", true),
    mirror_v: () => flip("vertical", true),
    // Add Frame (Object menu): a frame round everything selected, 0.4 bond lengths clear of it (0.3 for brackets).
    ...Object.fromEntries(([["frame_brackets", "brackets", false], ["frame_parens", "parens", false], ["frame_braces", "braces", false], ["frame_box", "box", false],
      ["frame_rounded", "rounded", false], ["frame_box_shadow", "box", true], ["frame_rounded_shadow", "rounded", true]] as const).map(([id, kind, shadow]) => [id, () => {
      const boxes = [...(selection.size ? [withCaptions(selection)].filter((b): b is Box => !!b) : []), ...placed.filter((c) => picked.has(c.id)).map((c) => c.box),
        ...arrows.filter((x) => picked.has(x.id)).map((x): Box => [Math.min(x.from[0], x.to[0]) * L, -Math.max(x.from[1], x.to[1]) * L, Math.max(x.from[0], x.to[0]) * L, -Math.min(x.from[1], x.to[1]) * L]),
        ...(doc.shapes ?? []).filter((x) => picked.has(x.id)).map((x): Box => { const b = shapeBounds(x); return [b[0] * L, -b[3] * L, b[2] * L, -b[1] * L]; })];
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
    // Scale… opens on the document's bond length, so ⌘K and Return still set it. ChemDraw opens on "So that median bond
    // is", which loses that. Median bond to types the chosen bonds' median in. With no bond chosen, it opens on Scale by
    // 100% (the median rows are dimmed).
    scale_dialog: () => setDialog({ kind: "scale", how: chosenMedian() ? "document" : "percent", value: "100" }),
    // Group (⌘G) and Ungroup (⇧⌘G), as ChemDraw's: the selected structures and objects select and move as one.
    group: () => {
      const r = groupSelection(doc, selection, picked);
      if (!r) return setNotice("Select two or more things to group.");
      set(r[0], true);
    },
    ungroup: () => set(ungroupSelection(doc, selection, picked), true),
    // Pick as One (ChemDraw's Group > Integral): on the groups Ungroup would undo.
    group_integral: () => {
      const touched = new Set(groupTargets(doc, selection, picked)), on = [...touched].every((g) => g.integral);
      if (!touched.size) return setNotice("Select a group.");
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
      return r ? set(cleanUpReaction(doc, r, arrows), true) : setNotice("Select a reaction arrow first.");
    },
    // Augmented Clean Up Reaction (ChemDraw's): each product turned to lie as the reactant it came from, by the atom
    // map (mapped for this and the map taken off again when the reaction had none), then Clean Up Reaction.
    clean_reaction_augmented: () => {
      const arrow = reactionPicked()?.arrows[0] ?? [...picked].find((id) => arrows.some((a) => a.id === id && straightArrow(a)));
      const r = arrow !== undefined ? reactionOf(arrow) : undefined;
      if (!r || arrow === undefined) return setNotice("Select a reaction arrow first.");
      const structures = (list: Part[]) => list.flatMap((x) => (x.kind === "structure" ? [x.atoms] : []));
      const steps = interpret(doc, r, arrows, inkBox, captionBox).map((x) => ({ reactants: structures(x.reactants), products: structures(x.products) }));
      const had = r.atoms.some((i) => doc.atoms[i].map);
      let m = alignByMap(had ? doc : mapScheme(doc, steps, mapReaction, (atoms) => pickAtoms(doc, atoms)) ?? doc, steps);
      if (!had) m = { ...clearScheme(m, new Set(r.atoms)), bonds: m.bonds.map((b, k) => ({ ...b, rxn: doc.bonds[k].rxn })) };
      // The reaction read again from where its parts now stand, then laid out.
      const d = render(m, frame, measure, L), box = (b?: Box): Box | undefined => b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
      const again = findReaction(m, arrow, arrows, (atoms) => box(union(atoms.filter((i) => d.ink[i]).map((i) => d.ink[i]))), captionBox);
      set(again ? cleanUpReaction(m, again, arrows) : m, true);
    },
    // Show Reaction Interpretation (View menu): pointing at a reaction shows what each part of it is.
    interpretation: () => setSettings((s) => ({ ...s, interpretation: !s.interpretation })),
    // Structure > Map Reaction Atoms and Clear Reaction Map, as ChemDraw's.
    map_reaction: () => runAction("reaction.map"),
    clear_reaction_map: () => runAction("reaction.unmap"),
    // Zoom about the middle of the window. Actual size is 100%: bonds at their true 14.4 pt.
    zoom_in: () => zoomTo(views.get().zoom * 1.25),
    zoom_out: () => zoomTo(views.get().zoom / 1.25),
    zoom_actual: () => zoomTo(1 / frame.k),
    actions: () => setSettings((s) => ({ ...s, actions: !s.actions })),
    export: () => checkFirst(openExport),
    export_quick: () => checkFirst(() => void quickExport()),
    print: () => void printDrawing(),
    about: () => setAbout(true),
    // Atom Properties (Structure menu): the selected atom's element or label, charge, isotope and radical.
    atom_properties: () => atomProperties([...selection][0] ?? hovers.get().atom),
    bond_properties: () => bondProperties(),
    bracket_properties: () => bracketProperties(),
    rlogic: () => rLogic(),
    // Add Multi-Centre Attachment and Add Variable Attachment (Structure menu): an attachment at the centre of the
    // selected atoms, for a bond to be drawn from it (to the metal of an η ligand, or to a substituent).
    add_multicentre: () => attach(false),
    add_variable: () => attach(true),
    // An R-group definition round the selected structures, named with the next R number.
    define_rgroup: () => {
      const atoms = fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat();
      if (!atoms.length) return setNotice("Select the fragments that the R-group stands for.");
      // The box clears the structures as drawn, labels and the text under them too.
      const ink = withCaptions(atoms), xs = atoms.map((i) => doc.atoms[i].location[0]), ys = atoms.map((i) => doc.atoms[i].location[1]);
      const [x0, y0, x1, y1] = ink ? [ink[0] / L, -ink[3] / L, ink[2] / L, -ink[1] / L] : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const [m, id] = addShape(doc, { kind: "box", from: [x0 - 0.4, y1 + 0.4], to: [x1 + 0.4, y0 - 0.4], rgroup: { name: nextRGroup(doc) } });
      set(m);
      setPicked(new Set([id]));
    },
    // Expand Generic Structure: every structure the selected generic structures (or all) stand for, in a new drawing.
    expand_generic: () => {
      const { mols, total } = expandGeneric(doc, selection.size ? [...selection] : doc.atoms.map((_, i) => i));
      if (!mols.length) return setNotice("This structure has nothing to expand. Use an R-group, an element list, an alternative group, a variable attachment or a wavy bond.");
      keepWork(() => {
        const grid = layoutGrid(mols);
        set(grid);
        setFile({ saved: EMPTY });
        if (total > MOST) setNotice(`Octet made the first ${MOST} of ${total.toLocaleString("en-GB")} structures.`, true);
        const b = bounds(grid);
        if (b) setView((v) => ({ ...v, x: innerWidth / 2 - ((b[0] + b[2]) / 2) * v.zoom * L, y: innerHeight / 2 + ((b[1] + b[3]) / 2) * v.zoom * L }));
      });
    },
    // Show Atom Number (Object menu): each atom's number beside it, for the selected atoms or the whole drawing.
    atom_numbers: () => numberAtoms(selection.size ? [...selection] : doc.atoms.map((_, i) => i)),
    // Page Setup (⇧⌘P): the page's size and orientation, which live in the document's settings.
    page_setup: () => setSettingsOpen("document"),
    // Analyse Stoichiometry: a grid under the picked reaction, or off again.
    stoichiometry: () => {
      const arrow = reactionPicked()?.arrows[0] ?? [...picked].find((id) => arrows.some((a) => a.id === id && straightArrow(a)));
      if (arrow === undefined) return setNotice("Select a reaction first.");
      const has = doc.grids?.some((g) => reactionOf(g.arrow)?.arrows.includes(arrow));
      set({ ...doc, grids: has ? doc.grids!.filter((g) => !reactionOf(g.arrow)?.arrows.includes(arrow)) : [...(doc.grids ?? []), { arrow, typed: {} }] }, true);
    },
    properties: () => setSettings((s) => ({ ...s, properties: !s.properties })),
    predict_1h: () => openSpectrum("1H"),
    // Expand Label (Structure menu): each selected label (OMe, CO2Et, Boc) drawn out as its atoms.
    expand_label: () => {
      let m = doc;
      const labelled = [...selection].filter((i) => doc.atoms[i]?.text).sort((a, b) => b - a);
      if (!labelled.length) return setNotice("Select a labelled atom, such as OMe or Boc.");
      for (const i of labelled) {
        const smiles = labelSmiles(doc.atoms[i].text!);
        if (!smiles) { setNotice(`Octet cannot draw out ${doc.atoms[i].text}.`); continue; }
        try { m = expandLabel(m, i, parseStructure(smiles)); } catch { setNotice(`Octet cannot draw out ${doc.atoms[i].text}.`); }
      }
      set(m);
    },
    // Contract Label (Structure menu): the selected substituent (joined to the rest by one bond) becomes one labelled
    // atom: the abbreviation it is (OMe, CO2Et, Boc, TBS), recognised whatever way it was drawn, or else its formula.
    contract_label: () => {
      const group = new Set([...selection].filter((i) => i < doc.atoms.length));
      const links = doc.bonds.filter((b) => group.has(b.atoms[0]) !== group.has(b.atoms[1]));
      if (group.size < 2 || links.length !== 1) return setNotice("Select a group joined to the rest of the structure by one bond.");
      const keep = group.has(links[0].atoms[0]) ? links[0].atoms[0] : links[0].atoms[1], outside = links[0].atoms[0] === keep ? links[0].atoms[1] : links[0].atoms[0];
      // The group with xenon in place of the rest of the structure, as an InChI, against each abbreviation's.
      const capped = subset({ ...doc, atoms: doc.atoms.map((a, i) => (i === outside ? { ...a, label: "Xe", text: undefined, charge: undefined } : a)) }, new Set([...group, outside]));
      const want = toInchi(capped), text = want && contractLabelText(want);
      const formula = analyse(subset(doc, group))?.[0]?.formula;
      set(contractLabel(doc, keep, group, text ?? formula ?? "R"));
      setSelection(new Set());
    },
    // Toggle Aromatic Display (⌥⌘K): the selected structures' aromatic rings with circles, or back to Kekulé bonds.
    aromatic_display: () => {
      const atoms = selection.size ? fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat() : doc.atoms.map((_, i) => i);
      const on = !atoms.some((i) => doc.atoms[i].circle);
      set({ ...doc, atoms: doc.atoms.map((a, i) => (atoms.includes(i) ? { ...a, circle: on || undefined } : a)) }, true);
    },
    // Show Stereochemistry (Object menu): on or off for the selected structures, or every structure.
    show_stereo: () => {
      const atoms = selection.size ? fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat() : doc.atoms.map((_, i) => i);
      const on = !atoms.every((i) => doc.atoms[i].cip);
      set({ ...doc, atoms: doc.atoms.map((a, i) => (atoms.includes(i) ? { ...a, cip: on || undefined } : a)) }, true);
    },
    predict_13c: () => openSpectrum("13C"),
    // Explain This Warning (ChemDraw's context menu): the warnings marked on the selection, in a dialog.
    explain_warning: () => { const list = selectedOf(found); return list.length ? setExplaining(list) : setNotice("Select an object with a warning."); },
    // Structure > Check Structure: the selection's problems (or the drawing's) one at a time (see checkThen).
    check_structure: () => checkThen(selection.size || picked.size ? subsetProblems() : allProblems(), () => {}, true),
    // Structure > Enhanced Stereochemistry, as ChemDraw's: on the selected stereocentres (every one with nothing
    // selected). Clear All takes their flags off; Mark as Absolute flags them abs; Create Or Group and Create And Group
    // put each structure's selected centres in a new group, numbered with the lowest number its structure has free.
    stereo_clear: () => enhance(undefined),
    stereo_abs: () => enhance("abs"),
    stereo_or: () => enhance("or"),
    stereo_and: () => enhance("&"),
    name_to_structure: () => nameToStructure(),
    document: () => setSettingsOpen("document"),
    settings: () => setSettingsOpen((settings.settingsModule as ModuleId) ?? "document"),
    structure_to_name: () => nameStructures(),
    copy_smiles: () => void document.execCommand("copy"),
    // Copy As MOL (⌥⌘O, V3000, as ChemDraw 26.1's) and Copy As MOL V2000 (⇧⌥⌘O): the selection, or the drawing, as text.
    ...Object.fromEntries(([["copy_mol", "mol"], ["copy_mol2000", "mol2000"]] as const).map(([id, f]) => [id, () => {
      const text = formatOf(selectedPart() ?? doc, f);
      if (!text) return setNotice("Octet cannot write this drawing as a molfile.");
      copyText.current = text;
      document.execCommand("copy");
    }])),
    // Search Reaxys and Search PubChem (the Search menu and the Actions panel), while Settings > Online search is on.
    ...(settings.onlineSearch ? Object.fromEntries(Object.entries(SEARCHES).map(([id, [site, exact]]) => [id, () => searchOnline(site, exact)])) : {}),
    // Bring to Front (⌘[) and Send to Back (⌘]), as ChemDraw's: any selected structure (a picked atom or bond takes its
    // whole structure) and object goes over, or under, everything else.
    bring_front: () => restack(true),
    send_back: () => restack(false),
    command_palette: () => { setCommandsOpen((o) => !o); if (!namesLoaded) void loadNames().then(() => setNamesLoaded(true)); },
    // The Text menu styles the caption being typed, or the picked captions.
    text_bold: () => runAction("caption.bold"),
    text_plain: () => runAction("caption.plain"),
    text_sub: () => runAction("caption.sub"),
    text_super: () => runAction("caption.super"),
    text_formula: () => runAction("caption.formula"),
    // Text > Font: Other Font… finds any font on the computer (the menu's own fonts are added with the font list).
    font_other: () => {
      const c = contextOf();
      setDialog({ kind: "font", font: (c.kind === "caption" ? c.font : c.kind === "atom" || c.kind === "structure" ? c.text?.font : undefined) ?? style.captionFont });
    },
    text_italic: () => runAction("caption.italic"),
    text_underline: () => runAction("caption.underline"),
    align_left: () => restyle(() => ({ align: "left" })),
    align_centre: () => restyle(() => ({ align: "centre" })),
    align_right: () => restyle(() => ({ align: "right" })),
    align_justify: () => restyle(() => ({ align: "justify" })),
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
    // Text > Size (its sizes are set with the font list, below): Other Size… types any size; Last Typed Size uses that
    // size again (ChemDraw's Other… and Set Font Size To Last One).
    size_other: () => setDialog({ kind: "size", size: String(lastSize.current ?? style.captionSize) }),
    size_last: () => (lastSize.current ? runAction(`caption.size.${lastSize.current}`) : commands.current.size_other()),
    // Text > Line Spacing…: Automatic, Variable, or Fixed at a size in pt, for the captions picked or being typed.
    line_spacing: () => {
      const c = writing ? { ...doc.captions?.find((x) => x.id === writing.id), ...writing.style } : doc.captions?.find((x) => picked.has(x.id)) ?? textStyle, lh = c.lineHeight;
      setDialog({ kind: "spacing", mode: lh === "variable" ? "variable" : typeof lh === "number" ? "fixed" : "auto", pt: String(typeof lh === "number" ? lh : Math.round((c.size ?? style.captionSize) * 1.2 * 10) / 10) });
    },
    zoom_fit: () => {
      const b = bounds(doc);
      if (!b) return setView({ x: innerWidth / 2, y: innerHeight / 2, zoom: openZoom(style) });
      const free = [innerWidth - 160, innerHeight - 120], size = [(b[2] - b[0] + 1) * L, (b[3] - b[1] + 1) * L];
      const zoom = clampZoom(Math.min(free[0] / size[0], free[1] / size[1]));
      setView({ zoom, x: innerWidth / 2 - ((b[0] + b[2]) / 2) * L * zoom, y: innerHeight / 2 + ((b[1] + b[3]) / 2) * L * zoom });
    },
  };
  function zoomTo(target: number) {
    const view = views.get(), zoom = clampZoom(target), k = zoom / view.zoom, cx = innerWidth / 2, cy = innerHeight / 2;
    setView({ zoom, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k });
  }
  // Keep the setting on disk and the View menu ticks in step with it.
  const syncChecks = () => Promise.all(([["grid", !!guides.grid], ["rulers", !!guides.rulers], ["crosshair", !!guides.crosshair], ["snap", settings.snap], ["snap_grid", settings.snapGrid],
    ["warnings", settings.warnings], ["interpretation", settings.interpretation]] as const).map(([id, checked]) => invoke("set_check", { id, checked }))).catch(() => {});
  useEffect(() => {
    saveSettings(settings);
    if (TAURI) syncChecks();
  }, [settings]);
  useEffect(() => { if (TAURI) syncChecks(); }, [guides]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Colour menu lists the user's colours by name: the menu bar is built again when they change.
  const paletteNames = settings.palette.map((c) => c.name).join("\n");
  useEffect(() => {
    if (TAURI) invoke("set_palette", { names: settings.palette.map((c) => c.name) }).then(syncChecks).catch(() => {});
  }, [paletteNames]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!TAURI) return;
    const off = listen<string>("menu", (e) => commands.current[e.payload]?.());
    return () => { off.then((f) => f()); };
  }, []);
  // Every menu command's shortcut can be changed in Settings, with the canvas keys: the menu lists its commands, and
  // is built again with the user's shortcuts (Command or Ctrl ones; the page handles any other key itself).
  // Settings > Online search: the Search menu is built only while it is on, so the list is read after it is set.
  const [menuReady, setMenuReady] = useState(0);
  useEffect(() => {
    if (TAURI) invoke("set_online_search", { on: settings.onlineSearch }).then(() => invoke<[string, string, string, string][]>("menu_items"))
      .then((items) => { registerMenu(items); setMenuReady(items.length); }).then(syncChecks).catch(() => {});
  }, [settings.onlineSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  const sentMenuKeys = useRef("");
  useEffect(() => {
    if (!TAURI || !menuReady) return;
    const map = keymap(settings.keys), keys: Record<string, string> = {};
    for (const a of ACTIONS) if (a.id.startsWith("menu.")) { const k = (map[a.id] ?? []).find(native); keys[a.id.slice(5)] = k ? toAccelerator(k) : ""; }
    const text = JSON.stringify(keys);
    if (text === sentMenuKeys.current || (!sentMenuKeys.current && !Object.keys(settings.keys).some((id) => id.startsWith("menu.")))) { sentMenuKeys.current ||= text; return; }
    sentMenuKeys.current = text;
    invoke("set_menu_keys", { keys }).then(syncChecks).catch(() => {});
  }, [settings.keys, menuReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Screen (px from the window's top left) to drawing coordinates (bond lengths, y up).
  const toDoc = (sx: number, sy: number): P => { const view = views.get(); return [(sx - view.x) / (view.zoom * L), -(sy - view.y) / (view.zoom * L)]; };

  // A part of the drawing shown alone for a moment, to take its picture (copy and export).
  const [exporting, setExporting] = useState<Mol>();
  const shown = useMemo(() => {
    if (exporting) return exporting;
    if (drag?.kind === "bond" && drag.to) return bondTo(doc, drag.from, drag.to, bondSpec);
    if (drag?.kind === "chain" && drag.to) return chainTo(doc, drag.from, drag.to).mol;
    if (drag?.kind === "move" || drag?.kind === "handle" || drag?.kind === "turn" || drag?.kind === "resize" || drag?.kind === "tilt" || drag?.kind === "spot" || drag?.kind === "tlcline" || drag?.kind === "tableedge") return drag.working;
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
  // A drawing with no style (from another program, with Keep ChemDraw styles off) takes the style File > New gives.
  const newStyle = useMemo(() => styleFor(settings, settings.purpose), [settings.purpose, settings.purposeStyles, settings.ownPurposes]); // eslint-disable-line react-hooks/exhaustive-deps
  const style: DocStyle = useMemo(() => readStyle(doc.style ?? newStyle), [doc.style, newStyle]);
  // The font lists: Octet's fonts, then any other font the drawing uses (one picked from More fonts, or a file's).
  const fontList = useMemo(() => {
    const used = new Set<string>([style.labelFont, style.captionFont]);
    for (const a of doc.atoms) if (a.font) used.add(a.font);
    for (const c of doc.captions ?? []) { if (c.font) used.add(c.font); for (const r of c.runs ?? []) if (r.font) used.add(r.font); }
    return [...FONTS, ...[...used].filter((f) => !FONTS.includes(f)).sort()];
  }, [doc.atoms, doc.captions, style]);
  // The sizes on offer: ChemDraw's sizes times the document scale (decision 0007).
  const sizeList = useMemo(() => sizesAt(style.scale), [style.scale]);
  // Text > Font and Text > Size list the same fonts and sizes, on captions and on selected atom labels, as ChemDraw's:
  // the menu bar is built again when a list changes.
  Object.assign(commands.current, Object.fromEntries(fontList.map((f) => [`font:${f}`, () => runAction(`caption.font.${f}`)])));
  Object.assign(commands.current, Object.fromEntries(sizeList.map((pt) => [`size_${pt}`, () => runAction(`caption.size.${pt}`)])));
  const fontNames = fontList.join("\n");
  useEffect(() => {
    if (TAURI) invoke("set_text_lists", { fonts: fontList, sizes: sizeList }).then(syncChecks).catch(() => {});
  }, [fontNames, sizeList]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastSize = useRef<number>(undefined); // the size last typed in Other Size…
  // The text style of the first labelled atom among these, for the label style buttons; none when no atom has a label.
  const labelText = (ids: number[]) => {
    const i = ids.find((k) => drawing.label[k]), a = i === undefined ? undefined : doc.atoms[i];
    // The size the label is drawn at: its own size (or the document's) times its atom's scale.
    return a && { bold: !!a.bold, italic: !!a.italic, underline: !!a.underline, font: a.font ?? style.labelFont, size: Math.round((a.size ?? style.labelSize) * scaleOf(a) * 100) / 100 };
  };
  // An atom label's font: its own font, bold and italic when it has them, else the document's label font.
  const labelFont = (l: { size: number; font?: string; bold?: boolean; italic?: boolean }) =>
    `${l.italic ? "italic " : ""}${l.bold ? "bold " : ""}${l.size}px ${fontStack(l.font ?? style.labelFont)}`;
  const frame = useMemo(() => frameStyle(style, L), [style]);
  const measure = useMemo(() => measurer(fontStack(style.labelFont), frame.size), [style.labelFont, frame.size]);
  const pt = (4 / 3) * frame.k; // frame px per point
  // The document's style with an object's own line width (points), one for each width, so ink is kept with it.
  const lineStyles = useMemo(() => new Map<number, typeof frame>(), [frame]);
  const lined = (width?: number) => {
    if (width === undefined) return frame;
    let s = lineStyles.get(width);
    if (!s) lineStyles.set(width, (s = { ...frame, line: width * pt }));
    return s;
  };
  // The zoom limits (set below, once the pages are known), and a zoom kept inside them.
  const zoomLimits = useRef<[number, number]>([0.25, 8]);
  const clampZoom = (z: number) => Math.min(zoomLimits.current[1], Math.max(zoomLimits.current[0], z));
  // A new bond length keeps the drawing the same size on screen relative to its true size at the document's scale. A
  // new scale (a purpose, or the Scale field) keeps the structures still on screen, and the page outlines grow or
  // shrink round them (IDEA-SIZE-7).
  const lastK = useRef(frame.k * style.scale);
  // A zoom past the limits comes back inside them about the window's middle, so the next pinch does not jump.
  useEffect(() => {
    const r = lastK.current / (frame.k * style.scale), cx = innerWidth / 2, cy = innerHeight / 2;
    lastK.current = frame.k * style.scale;
    if (Math.abs(r - 1) < 1e-3) return;
    setView((v) => { const zoom = clampZoom(v.zoom * r), q = zoom / (v.zoom * r); return { zoom, x: cx - (cx - v.x) * q, y: cy - (cy - v.y) * q }; });
  }, [frame.k, style.scale]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each structure is drawn again only when its atoms or bonds change (renderParts): a drag of text, an arrow or one
  // structure leaves the other structures' drawings as they were. A structure a drag moves keeps its drawing, moved by
  // a transform, and its points move where it lands.
  const partCache = useRef<{ frame: typeof frame; measure: typeof measure; cache: PartCache }>(undefined);
  const still = !drag;
  const drawing = useMemo(() => {
    if (partCache.current?.frame !== frame || partCache.current.measure !== measure) partCache.current = { frame, measure, cache: { parts: new WeakMap(), last: new Map() } };
    return renderParts(shown, frame, measure, L, partCache.current.cache, still);
  }, [shown.atoms, shown.bonds, frame, measure, still]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // The page outlines (mm): the page, then what the drawing's purpose needs (IDEA-SIZE-6).
  const purposeKind = purposeOf(settings, style.purpose)?.kind;
  const pages = useMemo(() => pageOutlines(style, purposeKind), [style, purposeKind]);
  // A new page size on the same drawing (a purpose or a scale): the outlines grow or shrink into place about the page's
  // middle. A new or opened drawing shows them at once.
  const pagesEl = useRef<SVGGElement>(null), outlineFrom = useRef<number>(undefined);
  useEffect(() => {
    const now = pages[0][1] * mm, was = outlineFrom.current;
    outlineFrom.current = now;
    if (was === undefined || Math.abs(was / now - 1) < 1e-3 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    pagesEl.current?.animate([{ transform: `scale(${was / now})` }, { transform: "scale(1)" }], { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
  }, [pages, mm]);
  // The page whose edge is under a point (drawing coordinates), within a few screen px.
  const pageEdgeAt = (p: P) => pages.find(([, w, h]) => {
    const [x, y] = [(w / 2) * mm, (h / 2) * mm], dx = Math.abs(Math.abs(p[0]) - x), dy = Math.abs(Math.abs(p[1]) - y), near = 5 / (views.get().zoom * L);
    return (dx < near && Math.abs(p[1]) <= y + near) || (dy < near && Math.abs(p[0]) <= x + near);
  });
  // The grid (grid.ts): the document's step, counted from the page's top-left corner (where the rulers start), or
  // from the crosshair while it shows. It shows on engineering paper and with View > Show Grid; the crosshair shows
  // its heavier lines. Snap to Grid snaps to the lines that show, within 6 screen px; ⌘ frees.
  const corner: P = [-(pages[0][1] / 2) * mm, (pages[0][2] / 2) * mm];
  const cross = drag?.kind === "crosshair" ? drag.at : guides.crosshair;
  const grid = gridOf(style.grid, mm, cross ?? corner), heavy = { ...grid, minor: grid.minor * grid.every, every: 1 };
  const gridShown = !!guides.grid || paper === "blueprint";
  const snapGrid = !settings.snapGrid ? undefined : gridShown ? grid : guides.crosshair ? heavy : undefined;
  const toGrid = (p: P, free = false): P => {
    if (!snapGrid || free) return p;
    const [x, y] = snapToGrid(snapGrid, p, views.get().zoom * L, 6);
    return [x ?? p[0], y ?? p[1]];
  };
  const onCrosshair = (p: P, t: Hover) => !!cross && t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined && t.cycle === undefined
    && Math.hypot(p[0] - cross[0], p[1] - cross[1]) * L * views.get().zoom < 8;
  // The crosshair's place when it is shown, as ChemDraw's: the middle of the window (or a point given), on the
  // nearest heavier grid line from the page's corner.
  const crosshairHome = (at?: P): [number, number] => {
    const c = at ?? toDoc(innerWidth / 2, innerHeight / 2), step = grid.minor * grid.every;
    return [0, 1].map((k) => corner[k] + Math.round((c[k] - corner[k]) / step) * step) as [number, number];
  };
  // New drawings, and drawings saved without them, show what the user last chose in the View menu.
  const freshGuides = (at?: P): Guides => ({
    ...(settings.guides.grid ? { grid: true } : {}), ...(settings.guides.rulers ? { rulers: true } : {}), ...(settings.guides.crosshair ? { crosshair: crosshairHome(at) } : {}),
  });
  const showGuide = (k: "grid" | "rulers" | "crosshair") => {
    const on = !guides[k], next: Guides = { ...guides };
    if (!on) delete next[k];
    else if (k === "crosshair") next.crosshair = crosshairHome();
    else next[k] = true;
    setGuides(next);
    setSettings((s) => ({ ...s, guides: { ...s.guides, [k]: on } }));
  };
  // The Settings window, open at a module.
  const [settingsOpen, setSettingsOpen] = useState<ModuleId>();
  const [addingColour, setAddingColour] = useState(false); // Settings opened from a colour row's +, to add a colour
  // Object > Rotate… (⌘R) and Scale… (⌘K): the dialog open, and what is typed in it.
  const [about, setAbout] = useState(false);
  // The Select tool's modifiers at the last press, and the selection before it, for a click with Shift or Option.
  const pressMods = useRef<{ shift: boolean; alt: boolean; atoms: Set<number>; picks: Set<number> } | undefined>(undefined);
  const [exportView, setExportView] = useState<{ all?: string; selection?: string; parts: { all: Mol; selection?: Mol } }>();
  const [dialog, setDialog] = useState<{ kind: "rotate"; angle: string; clockwise: boolean } | { kind: "scale"; how: "document" | "length" | "percent"; value: string }
    | { kind: "atom"; atom: number; element: string; charge: string; isotope: string; radical: string; stereo: string; group: string; targets: number[]; q: AtomQuery; q0: AtomQuery; reset?: true }
    | { kind: "bond"; bonds: number[]; type: string; topology: string; rxn: string; start: { type: string; topology: string; rxn: string } }
    | { kind: "bracket"; shape: number; usage: string; label: string; count: string; order: string; mw: string; pattern: string; flip: string; flippable: boolean }
    | { kind: "rlogic"; rows: { id: number; name: string; occur: string; restH: boolean; then: string }[] }
    | { kind: "font"; font: string } | { kind: "size"; size: string } | { kind: "spacing"; mode: "auto" | "variable" | "fixed"; pt: string }
    | { kind: "unsaved"; next: () => void }>();
  // Check Structure's dialog: the problems, the one shown, and what runs after them (a copy or export that asked).
  // select: Check Structure itself, which selects each problem's objects as it shows it.
  const [checking, setChecking] = useState<{ list: Problem[]; at: number; then: () => void; select: boolean }>();
  // Explain This Warning's dialog: the selection's warnings.
  const [explaining, setExplaining] = useState<Problem[]>();
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
    // Drawn on the page's own paper, with the canvas's ink rule: white ink on dark and blue paper.
    return (
      <div className={`style-paper paper-${paper}`} data-theme={darkPaper ? "dark" : "light"} style={darkPaper ? ({ "--ink": "#FFFFFF" } as React.CSSProperties) : undefined}>
        <svg width={(box[2] - box[0]) * scale} height={(box[3] - box[1]) * scale} viewBox={`${box[0]} ${box[1]} ${box[2] - box[0]} ${box[3] - box[1]}`}>
          <path d={toPath(d.polygons)} fill="var(--ink)" />
          {d.labels.map((l, i) => <text key={i} x={l.x} y={l.y} fill="var(--ink)" textDecoration={l.underline ? "underline" : undefined} style={{ font: labelFont(l) }}>{l.text}</text>)}
          <text x={cap.lines[0].x} y={cap.lines[0].y} textAnchor="middle" fill={textInk(style.colour)} style={{ font: `bold ${cap.size}px ${fontStack(style.captionFont)}` }}>1</text>
        </svg>
      </div>
    );
  }, [sample, frame, measure, style, pt, paper]); // eslint-disable-line react-hooks/exhaustive-deps
  // Moves the view smoothly (or at once, with reduced motion).
  const flight = useRef<number>(undefined);
  function flyTo(to: { x: number; y: number; zoom: number }) {
    cancelAnimationFrame(flight.current!);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setView(to);
    const from = views.get(), t0 = performance.now(), duration = 320;
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / duration), e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      setView({ zoom: from.zoom * (to.zoom / from.zoom) ** e, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e });
      if (t < 1) flight.current = requestAnimationFrame(step);
    };
    flight.current = requestAnimationFrame(step);
  }
  // A click on a page's edge fits that page in the window, centred.
  const fitZoom = ([, w, h]: [string, number, number]) => Math.min((innerWidth - 160) / (w * mm * L), (innerHeight - 48) / (h * mm * L));
  const fitPage = (page: [string, number, number]) => flyTo({ x: innerWidth / 2, y: innerHeight / 2, zoom: fitZoom(page) });
  // The zoom limits: a bond drawn 0.25 to 8 times its size, widened so that every page outline can be fitted. At
  // any document scale the page never stops a zoom, and no zoom jumps (decision 0007).
  zoomLimits.current = [Math.min(0.25, ...pages.map(fitZoom)), Math.max(8, ...pages.map(fitZoom))];
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
    () => (naming === undefined ? undefined : structureFromText(naming) ?? (suggestion ? structureFor(suggestion) : undefined)),
    [naming, suggestion, namesLoaded, loaded],
  );
  // Captions as laid out, with the caption being typed in place of its saved text (or added, if it is new).
  // Arrows grow to fit their conditions, including conditions being typed. The arrow lists stay the same lists while
  // their arrows do not change (most typing), so nothing drawn from them is made again.
  const laid = useRef<{ arrows: Arrow[]; cycles: ReturnType<typeof layoutCycles>["arrows"] }>({ arrows: [], cycles: [] });
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
    const same = (a: readonly Arrow[], b: readonly Arrow[]) => a.length === b.length && a.every((x, i) => x === b[i] || JSON.stringify(x) === JSON.stringify(b[i]));
    if (!same(fitted, laid.current.arrows)) laid.current.arrows = fitted;
    if (!same(cycles.arrows, laid.current.cycles)) laid.current.cycles = cycles.arrows;
    // A piece of text in a run's style: its width, for captions with a width (their lines wrap to it), and its reach
    // above and below the baseline, for Variable line spacing.
    const face = (c: Caption, r: RunStyle) => [(r.size ? r.size * pt : (c.size ?? style.captionSize) * pt) * (r.script ? 0.75 : 1), r.bold ?? c.bold, r.italic ?? c.italic, fontStack(r.font ?? c.font ?? style.captionFont)] as const;
    const measure = (t: string, c: Caption, r: RunStyle) => textWidth(t, ...face(c, r)), extent = (t: string, c: Caption, r: RunStyle) => textExtent(t, ...face(c, r));
    return { placed: placeCaptions(m, drawing, width, fitted, pt, style.captionSize, cycles.anchors, measure, extent), arrows: laid.current.arrows, cycleArrows: laid.current.cycles };
  }, [shown, drawing, writing, style, pt]);
  // The structure for the name being typed, where it will land (after the arrows and text, which landing reads).
  const ghost = useMemo(() => named && render(moveAtoms(named, new Set(named.atoms.map((_, i) => i)), landing(named)), frame, measure, L), [named, doc, frame, measure, placed, arrows]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reaction conditions and a cycle's reagents print formulas with subscripts (K2CO3 as K₂CO₃).
  const reagents = useMemo(() => new Set((shown.captions ?? []).filter((c) => c.on || c.cycle).map((c) => c.id)), [shown]);
  // Each object's ink is drawn in its layer, or on its own under or over all the layers when it has a draw order
  // (Bring to Front, Send to Back; order.ts). level: a thing that is drawn in its layer.
  const level = (x?: { order?: number }) => !x?.order;
  // Arrow ink, one path per colour (unset is the document's ink), each arrow's part kept with the arrow.
  // Filled pen curves draw their own outline with their fill, in order (below), so clip art's layers stack as drawn.
  const arrowInk = useMemo(() => {
    const groups = new Map<string | undefined, string>();
    for (const a of [...arrows.filter((x) => level(x) && !(x.curve?.closed && x.fill)), ...cycleArrows.filter(level)]) {
      const key = a.colour?.toLowerCase();
      groups.set(key, (groups.get(key) ?? "") + kept(arrowInks, a, lined(a.width), () => toPath(arrowShapes(a, lined(a.width), L))));
    }
    return [...groups];
  }, [arrows, cycleArrows, frame]);
  // Structure ink: each structure's own paths, so a drag changes only the paths of what moved.
  const structureInk = useMemo(() => drawing.parts.filter(({ ids }) => level(shown.atoms[ids[0]])).flatMap(({ ids, drawing: d, at, k, turn }) => structurePaths(d).map(([key, path]) => [`${ids[0]}|${key}`, key, path, moveBy(at, k, turn)] as const)), [drawing]); // eslint-disable-line react-hooks/exhaustive-deps
  // Atom labels as text, one group per structure, made once for each drawing of it: React passes over the ones that
  // did not change, and a structure being moved only moves its group. A structure being turned turns its group, and
  // each label turns back about its atom, so it keeps level.
  const labelCache = useRef<{ look: string; parts: WeakMap<Drawing, React.ReactElement[]> }>(undefined);
  const labelTexts = useMemo(() => {
    const look = `${darkPaper}|${style.labelFont}`;
    if (labelCache.current?.look !== look) labelCache.current = { look, parts: new WeakMap() };
    const cache = labelCache.current.parts;
    return drawing.parts.map(({ ids, drawing: d, at, k, turn }) => {
      let texts = cache.get(d);
      if (!texts) {
        texts = d.labels.map((l, i) => (
          <text key={i} x={l.x} y={l.y} fill={l.colour ? textInk(l.colour) : "var(--ink)"} fillOpacity={l.alpha} textDecoration={l.underline ? "underline" : undefined} style={{ font: labelFont(l) }}>
            {l.text}
          </text>
        ));
        cache.set(d, texts);
      }
      if (turn) texts = texts.map((t, i) => <g key={i} transform={`rotate(${-turn} ${d.labelAt[i][0]} ${d.labelAt[i][1]})`}>{t}</g>);
      return texts.length ? <g key={ids[0]} transform={moveBy(at, k, turn)}>{texts}</g> : null;
    });
  }, [drawing, darkPaper, style.labelFont]); // eslint-disable-line react-hooks/exhaustive-deps
  // Where each map number and stereo flag goes, worked out once per change of the atoms or bonds.
  const markDirs = useMemo(() => markDirections(shown, shown.atoms.flatMap((a, i) => (a.map || a.enhanced ? [i] : []))), [shown.atoms, shown.bonds]); // eslint-disable-line react-hooks/exhaustive-deps
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
        const end = side > 0 ? a.from : a.to, f = scaleOf(a), at: P = [end[0] + n[0] * side * 0.25 * f, end[1] + n[1] * side * 0.25 * f];
        return { key: `${a.id}-${k}`, at, anchor: (n[0] * side >= 0 ? "start" : "end") as "start" | "end", formula: piece.formula, exact: piece.exact, f };
      });
    });
  }, [arrows, shown, loaded]);
  // The cycle arc (or side arrow) under a point.
  // A thicker line (an object's scale) is as easy to hit as it is wide.
  const cycleAt = (p: P) => cycleArrows.find((a) => nearTrace([p[0] * L, -p[1] * L], arrowTrace(a, L), 5 / views.get().zoom + frame.line * 2 * scaleOf(a)));
  // Which step of a cycle was last pressed: reagents and products go on that step.
  const [cycleStep, setCycleStep] = useState(0);
  // The arrow under a point (drawing coordinates), within a few px of its line.
  const arrowAt = (p: P) => [...arrows].reverse().find((a) => !isOrbital(a) && nearTrace([p[0] * L, -p[1] * L], arrowTrace(a, L), 5 / views.get().zoom + frame.line * 2 * scaleOf(a)))?.id;
  // The orbital whose lobes a point is in.
  const orbitalAt = (p: P) => [...arrows].reverse().find((a) => isOrbital(a) && lobesOf(a, L).some((l) => inPolygon([p[0] * L, -p[1] * L], l.path)))?.id;
  // The shape whose line is under a point; with the Select tool, also a highlight the point is inside.
  const shapeAt = (p: P) => {
    const q: P = [p[0] * L, -p[1] * L], near = (sh: Shape) => 5 / views.get().zoom + frame.line * 2 * scaleOf(sh);
    return [...(shown.shapes ?? [])].reverse().find((sh) => (sh.kind === "table" ? tableAt(p)?.id === sh.id : nearTrace(q, shapeTrace(sh, L, frame.bond), near(sh))))?.id;
  };
  const highlightAt = (p: P) => [...(shown.shapes ?? [])].reverse().find((sh) => sh.kind === "highlight" && inShape(sh, p))?.id;
  // The TLC plate a point is on, and a click on it: a spot in that lane at that height, or off again if one is there.
  const plateAt = (p: P) => [...(shown.shapes ?? [])].reverse().find((sh) => sh.kind === "tlc"
    && p[0] >= Math.min(sh.from[0], sh.to[0]) && p[0] <= Math.max(sh.from[0], sh.to[0]) && p[1] >= Math.min(sh.from[1], sh.to[1]) && p[1] <= Math.max(sh.from[1], sh.to[1]));
  // TLC plates, as ChemDraw's TLC tool: the spot or line under a point, and a press on the plate. A press on a spot
  // drags it (Option: a copy of it; Shift: its size); on the origin or front, moves that line; anywhere else on the
  // plate, adds a spot there. A spot pressed and not moved is picked, for its colour, style and size.
  const [spotPick, setSpotPick] = useState<{ plate: number; index: number }>();
  // A spot is hit within 4 px of its edge (its tail included), the nearest one first.
  const spotHit = (sh: Shape, p: P) => {
    const t = tlcLayout(sh), slack = 4 / (views.get().zoom * L);
    const fit = (sh.tlc?.spots ?? []).map((x, i) => {
      const { rx, ry } = t.size(x), dx = (p[0] - t.lane(x.lane)) / (rx + slack), dy = p[1] - t.at(x.rf), below = dy < 0 ? Math.max(0, -dy - (x.tail ?? 0) * t.f) : dy;
      return { i, d: Math.hypot(dx, below / (ry + slack)) };
    }).filter((f) => f.d <= 1).sort((p1, q) => p1.d - q.d);
    return fit[0]?.i ?? -1;
  };
  const lineHit = (sh: Shape, p: P): "origin" | "front" | undefined => {
    const t = tlcLayout(sh), near = 5 / (views.get().zoom * L);
    return Math.abs(p[1] - t.origin) < near ? "origin" : Math.abs(p[1] - t.front) < near ? "front" : undefined;
  };
  const spotAt = (sh: Shape, p: P, screen: [number, number], copy: boolean, size: boolean) => {
    setSelection(new Set());
    setPicked(new Set([sh.id]));
    const t = tlcLayout(sh), spots = sh.tlc?.spots ?? [], hit = spotHit(sh, p);
    if (hit >= 0) {
      const base = copy ? updateShape(doc, sh.id, { tlc: { ...sh.tlc!, spots: [...spots, { ...spots[hit] }] } }) : doc;
      return setDrag({ kind: "spot", plate: sh.id, index: copy ? spots.length : hit, base, from: p, size, moved: false, working: base });
    }
    const line = lineHit(sh, p);
    if (line) return setDrag({ kind: "tlcline", plate: sh.id, which: line, base: doc, working: doc });
    const lane = Math.min(t.lanes - 1, Math.max(0, Math.floor((p[0] - t.x0) / t.width)));
    const rf = Math.round(Math.min(1, Math.max(0, (p[1] - t.origin) / (t.front - t.origin))) * 100) / 100;
    set(updateShape(doc, sh.id, { tlc: { ...sh.tlc!, spots: [...spots, { lane, rf }] } }), true);
    setSpotPick({ plate: sh.id, index: spots.length });
    void screen;
  };
  useEffect(() => { if (spotPick && (!picked.has(spotPick.plate) || picked.size !== 1)) setSpotPick(undefined); }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  // A spot's changes, on the plate it is on.
  const editSpot = (m: Mol, plate: number, index: number, change: (x: NonNullable<Shape["tlc"]>["spots"][number]) => Partial<NonNullable<Shape["tlc"]>["spots"][number]>): Mol => {
    const sh = m.shapes?.find((x) => x.id === plate);
    if (!sh?.tlc) return m;
    return updateShape(m, plate, { tlc: { ...sh.tlc, spots: sh.tlc.spots.map((x, i) => (i === index ? { ...x, ...change(x) } : x)) } });
  };
  // Tables: a cell's text width (drawing units), the table a point is on, and opening a cell to type in.
  const cellWidth = (sh: Shape) => (text: string) => formulaWidth(text, (sh.size ?? style.captionSize) * pt, sh.bold, sh.italic, fontStack(sh.font ?? style.captionFont)) / L;
  const tableAt = (p: P) => [...(shown.shapes ?? [])].reverse().find((sh) => {
    if (sh.kind !== "table") return false;
    const t = tableLayout(sh, cellWidth(sh), style.captionSize);
    return p[0] >= t.x0 && p[0] <= t.x1 && p[1] >= t.y0 && p[1] <= t.y1;
  });
  // The border of a table under a point, within 4 px: a column's (0 is the left edge) or a row's (0 is the top).
  const tableEdge = (p: P) => {
    const near = 4 / (views.get().zoom * L);
    for (const sh of [...(shown.shapes ?? [])].reverse()) {
      if (sh.kind !== "table") continue;
      const t = tableLayout(sh, cellWidth(sh), style.captionSize);
      if (p[0] < t.x0 - near || p[0] > t.x1 + near || p[1] < t.y0 - near || p[1] > t.y1 + near) continue;
      const col = Array.from({ length: t.cols + 1 }, (_, i) => i).find((i) => Math.abs(p[0] - t.col(i)) < near);
      if (col !== undefined) return { sh, axis: "col" as const, index: col };
      const row = Array.from({ length: t.rows + 1 }, (_, i) => i).find((i) => Math.abs(p[1] - t.row(i)) < near);
      if (row !== undefined) return { sh, axis: "row" as const, index: row };
    }
    return undefined;
  };
  const openCell = (sh: Shape, p: P) => {
    const t = tableLayout(sh, cellWidth(sh), style.captionSize);
    const c = Math.max(0, Array.from({ length: t.cols }, (_, i) => i).filter((i) => t.col(i) <= p[0]).pop() ?? 0);
    const r = Math.max(0, Array.from({ length: t.rows }, (_, i) => i).filter((i) => t.row(i) >= p[1]).pop() ?? 0);
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
    if (w.value !== (sh.table.cells[w.r]?.[w.c] ?? "")) { cur = { ...cur, ...setTableCell(cur, w.r, w.c, w.value, cellWidth(cur), style.captionSize) }; m = updateShape(m, sh.id, cur); }
    if (to) {
      const [r, c] = to, rows = cur.table!.cells.length;
      if (r >= rows) { cur = { ...cur, ...resizeTable(cur, rows + 1, cur.table!.cells[0].length, cellWidth(cur), style.captionSize) }; m = updateShape(m, sh.id, cur); }
      if (r >= 0) setCell({ id: sh.id, r, c, value: cur.table!.cells[r]?.[c] ?? "" });
    } else { cellOpen.current = false; setCell(undefined); }
    if (m !== doc) set(m, true);
  }
  // The caption under a point (drawing coordinates), with a few px of slack.
  const captionAt = (p: P) => {
    const [x, y] = [p[0] * L, -p[1] * L], pad = 3 / views.get().zoom;
    return [...placed].reverse().find((c) => c.id !== DRAFT && x >= c.box[0] - pad && x <= c.box[2] + pad && y >= c.box[1] - pad && y <= c.box[3] + pad)?.id;
  };
  // A reaction around an arrow, from what is drawn now: structures' and captions' boxes in drawing units.
  const inkBox = (atoms: number[]): Box | undefined => { const b = union(atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i])); return b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L]; };
  const captionBox = (id: number): Box | undefined => { const c = placed.find((x) => x.id === id); return c && [c.box[0] / L, -c.box[3] / L, c.box[2] / L, -c.box[1] / L]; };
  const reactionOf = (arrowId: number) => findReaction(doc, arrowId, arrows, inkBox, captionBox);
  // Every reaction in the drawing, each once, with its steps as Octet reads them (interpret.ts).
  const reactions = () => {
    const out: { r: Reaction; steps: RoleStep[] }[] = [], seen = new Set<number>();
    for (const a of arrows) {
      if (seen.has(a.id) || !straightArrow(a)) continue;
      const r = reactionOf(a.id);
      if (!r) continue;
      r.arrows.forEach((id) => seen.add(id));
      out.push({ r, steps: interpret(doc, r, arrows, inkBox, captionBox) });
    }
    return out;
  };
  // Show Reaction Interpretation: each reaction's steps and what each part is, read again when the drawing changes.
  const interpreted = useMemo(() => (settings.interpretation && loaded ? reactions().map(({ r, steps }) => ({ r, steps, roles: rolesOf(steps) })) : []),
    [settings.interpretation, loaded, doc, drawing, placed]); // eslint-disable-line react-hooks/exhaustive-deps
  // The reaction steps in a part of the drawing (the drawing, or the selection's part), for RXN and RD files and
  // reaction SMILES: each step's reactant, product and agent structures, by the part's atoms. A step needs a reactant
  // and a product structure, and all of it in the part.
  const stepsIn = (part: Mol): RxnStep[] => {
    const at = part === doc ? undefined : new Map([...selection].filter((i) => i < doc.atoms.length).sort((p, q) => p - q).map((i, k) => [i, k]));
    const structures = (list: Part[]) => list.flatMap((x) => (x.kind === "structure" ? [x.atoms] : []));
    return reactions().flatMap(({ steps }) => steps).map((s) => ({ reactants: structures(s.reactants), products: structures(s.products), agents: structures([...s.above, ...s.below]) }))
      .filter((s) => s.reactants.length && s.products.length && (!at || [...s.reactants, ...s.products, ...s.agents].flat().every((i) => at.has(i))))
      .map((s) => (at ? { reactants: s.reactants.map((g) => g.map((i) => at.get(i)!)), products: s.products.map((g) => g.map((i) => at.get(i)!)), agents: s.agents.map((g) => g.map((i) => at.get(i)!)) } : s));
  };
  // The reaction picked, when exactly a whole reaction is: its arrows and its structures.
  const reactionPicked = () => {
    const first = arrows.find((a) => picked.has(a.id) && !curved(a) && !isLine(a));
    if (!first || !selection.size) return undefined;
    const r = reactionOf(first.id);
    return r && r.atoms.length === selection.size && r.atoms.every((i) => selection.has(i)) && r.arrows.every((id) => picked.has(id)) ? r : undefined;
  };
  // Atoms come first, then captions, then bonds.
  const hit = (p: P): Hover => {
    // With Select, a filled shape or highlight brought to the front (order.ts) covers what is under it, so a click
    // there picks it unless what is under is in front of it too.
    const cover = tool === "select" ? (shown.shapes ?? []).filter((sh) => (sh.order ?? 0) > 0 && (sh.kind === "highlight" || sh.fill) && inShape(sh, p))
      .sort((a, b) => b.order! - a.order!)[0] : undefined;
    if (cover) {
      const under = hitBelow(p), id = under.caption ?? under.arrow, x = under.atom !== undefined ? doc.atoms[under.atom] : under.bond !== undefined ? doc.atoms[doc.bonds[under.bond].atoms[0]] : id !== undefined ? [...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? [])].find((y) => y.id === id) : undefined;
      return (x?.order ?? 0) > cover.order! ? under : { arrow: cover.id };
    }
    return hitBelow(p);
  };
  const hitBelow = (p: P): Hover => {
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
  // A structure's size as people see it, as ChemDraw treats a structure and its caption: its atoms with their labels,
  // and the captions attached to it (under it). For frames, aligning, snapping and the group frame.
  const withCaptions = (atoms: Iterable<number>): Box | undefined => {
    const set = new Set(atoms), under = new Set((shown.captions ?? []).filter((c) => c.under?.some((i) => set.has(i))).map((c) => c.id));
    return union([...[...set].flatMap((i) => (drawing.ink[i] ? [drawing.ink[i]] : [])), ...placed.filter((c) => under.has(c.id)).map((c) => c.box)]);
  };
  // Atoms and objects as drawn (px, y down): the atoms with their labels and the text under them, and the text, arrows,
  // curves, shapes and cycles. For the group frame, the rotation handle and the middle every turn and flip goes about.
  const drawnBox = (atoms: Iterable<number>, items: Set<number>): Box | undefined => union([
    ...[withCaptions(atoms)].filter((b): b is Box => !!b),
    ...placed.filter((c) => items.has(c.id)).map((c) => c.box),
    ...[...arrows.filter((a) => items.has(a.id)), ...cycleArrows.filter((a) => items.has(a.cycle))].map((a) => arrowTrace(a, L).box),
    ...(shown.shapes ?? []).filter((sh) => items.has(sh.id)).map((sh): Box => { const b = shapeBounds(sh); return [b[0] * L, -b[3] * L, b[2] * L, -b[1] * L]; }),
  ]);
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
    // One change for all, so Bold on a mixed set makes them all bold. It is on the whole of each caption, so its runs
    // lose that style.
    const delta = change(whole(first)), keys = Object.keys(delta);
    const restyled = (c: Caption): Caption => { const runs = c.runs && without(c.runs, keys); return { ...c, ...delta, ...(c.runs ? { runs: runs && styled(runs) ? runs : undefined } : {}) }; };
    set({ ...doc, captions: doc.captions?.map((c) => (picked.has(c.id) ? restyled(c) : c)) }, true);
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
      return choose(groups.flat(), [id]);
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
  // The selected things for Align and Distribute: each structure, group, cycle and object, with its box in drawing
  // units (y up: [left, bottom, right, top]) and what moves with it. A group is one thing when it is all selected; the
  // members of a group selected in part line up one by one. A picked cycle is one thing with its intermediates.
  function things() {
    const box = (b: Box): Box => [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
    const out: { atoms: number[]; items: number[]; box: Box; home?: object }[] = [];
    const groups = selectedGroups(doc, selection, picked), cycles = (doc.cycles ?? []).filter((c) => picked.has(c.id));
    const homeOf = (atoms: number[], id?: number): object | undefined => groups.find((g) => (id !== undefined ? g.items.includes(id) : atoms.some((i) => g.atoms.includes(i))))
      ?? cycles.find((c) => (id !== undefined ? c.id === id : c.nodes.some((n) => n.some((i) => atoms.includes(i)))));
    const add = (atoms: number[], items: number[], b: Box | undefined) => {
      if (!b) return;
      const home = homeOf(atoms, items[0]), mine = home && out.find((o) => o.home === home);
      if (mine) { mine.atoms.push(...atoms); mine.items.push(...items); mine.box = [Math.min(mine.box[0], b[0]), Math.min(mine.box[1], b[1]), Math.max(mine.box[2], b[2]), Math.max(mine.box[3], b[3])]; }
      else out.push({ atoms: [...atoms], items: [...items], box: b, home });
    };
    for (const g of fragments(doc).filter((f) => f.some((i) => selection.has(i)))) { const b = withCaptions(g); add(g, [], b && box(b)); }
    for (const c of cycles) { const b = drawnBox([], new Set([c.id])); add([], [c.id], b && box(b)); }
    for (const c of placed) if (picked.has(c.id)) { const cap = doc.captions?.find((x) => x.id === c.id); if (cap && !cap.under && !cap.on && !cap.cycle) add([], [c.id], box(c.box)); }
    for (const a of doc.arrows ?? []) if (picked.has(a.id)) {
      const [f, t] = a.curve ? curveBox(a.curve) : [a.from, a.to];
      add([], [a.id], [Math.min(f[0], t[0]), Math.min(f[1], t[1]), Math.max(f[0], t[0]), Math.max(f[1], t[1])]);
    }
    for (const sh of doc.shapes ?? []) if (picked.has(sh.id)) add([], [sh.id], shapeBounds(sh));
    return out;
  }
  // What Rotate…, Scale…, the flips, the Turn keys and the selection's handles act on: the selected atoms and picked
  // objects, or the whole drawing when nothing is selected. whole: it is the whole drawing (nothing selected, or all).
  const chosen = () => {
    const none = !selection.size && !picked.size, objects = [...(doc.captions ?? []).filter((c) => !c.under && !c.on && !c.cycle), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])];
    const atoms = none ? new Set(doc.atoms.map((_, i) => i)) : selection, items = none ? new Set([...(doc.captions ?? []), ...objects].map((x) => x.id)) : picked;
    return { atoms, items, whole: none || (atoms.size === doc.atoms.length && objects.every((x) => items.has(x.id))) };
  };
  // Text alone (captions and nothing else). Scale… and the handles always scale its size, as ChemDraw scales the text
  // of one label whatever its checkbox says, so Labels and lines counts as on for it.
  const textAlone = () => !selection.size && picked.size > 0 && [...picked].every((id) => doc.captions?.some((c) => c.id === id));
  const scalesText = () => settings.scaleLabels || textAlone();
  // Each free caption's middle, from its laid-out box (drawing units).
  const captionMiddles = () => new Map(placed.filter((c) => c.id !== DRAFT).map((c) => [c.id, [(c.box[0] + c.box[2]) / 2 / L, -(c.box[1] + c.box[3]) / 2 / L] as P]));
  // A scale of the chosen atoms and objects by size (across, up) about c. Shapes, tables and cycles grow with it.
  // A scale in proportion with Labels and lines on (lines) multiplies each object's own scale and its text's sizes
  // too (decision 0007); a stretch moves geometry only.
  const scaledParts = (m: Mol, atoms: Set<number>, items: Set<number>, size: P, c: P, lines: boolean, middles: Map<number, P>) => {
    const k = size[0] === size[1] ? size[0] : 1, text = lines && k !== 1 ? k : 1;
    const moved = transformParts(m, atoms, items, (q) => [c[0] + (q[0] - c[0]) * size[0], c[1] + (q[1] - c[1]) * size[1]], size, middles, text);
    return text !== 1 ? scaleSettings(moved, atoms, items, k, style.captionSize) : moved;
  };
  // Commits a scale of what is chosen (working: the drag's copy, when there is one). The whole drawing scaled in
  // proportion with Labels and lines on changes the document's scale instead (IDEA-SCALE-8), so what is drawn next
  // matches: positions are in bond lengths, so each one moves to keep c in its place, sizes in points go with it,
  // and the view zooms with the document, so the drawing looks as it did in the drag.
  function commitScale(size: P, c: P, lines: boolean, working?: Mol) {
    const { atoms, items, whole } = chosen(), k = size[0], next = withScale(style, style.scale * k);
    if (whole && lines && size[0] === size[1] && k !== 1 && Math.abs(next.scale - style.scale * k) < 1e-9) {
      const d: P = [c[0] * (1 / k - 1), c[1] * (1 / k - 1)], all = new Set([...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].map((x) => x.id));
      const moved = transformParts(doc, new Set(doc.atoms.map((_, i) => i)), all, (q) => [q[0] + d[0], q[1] + d[1]]);
      const nk = frameStyle(next, L).k, r = frame.k / nk;
      lastK.current = nk * next.scale;
      setView((v) => ({ ...v, zoom: clampZoom(v.zoom * r) }));
      return set({ ...scaleSizes(moved, k), style: next }, true);
    }
    // A drag of the whole drawing in proportion only showed it scaled (its working copy is the drawing as it was), so
    // a scale the document cannot take (outside 10% to 1000%, or past a style limit) is made here, as object scales.
    set(working && working !== doc ? working : scaledParts(doc, atoms, items, size, c, lines, captionMiddles()), true);
  }
  // The selection's scale against the document (decision 0007), for the Actions panel's Scale field: its atoms',
  // arrows', shapes' and cycles' scale; null when they differ; undefined when nothing selected has a scale.
  const selectionScale = (): number | null | undefined => {
    const xs = [...[...selection].map((i) => doc.atoms[i]), ...[...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].filter((x) => picked.has(x.id))].filter(Boolean).map(scaleOf);
    return !xs.length ? undefined : xs.every((x) => Math.abs(x - xs[0]) < 1e-4) ? xs[0] : null;
  };
  // The middle of what is chosen, in drawing units: every turn, flip and scale goes about it. Atoms count by their
  // positions and objects as drawn. Text that follows a structure, arrow or cycle is placed again after the move, so it
  // does not count: a structure with its number under it flips in place.
  const selectionMiddle = (): P => {
    const { atoms, items } = chosen(), objects = new Set(items);
    for (const c of doc.captions ?? []) if (c.under || c.on || c.cycle) objects.delete(c.id);
    const b = union([...[...atoms].filter((i) => i < doc.atoms.length).map((i): Box => { const [x, y] = pos(doc, i); return [x * L, -y * L, x * L, -y * L]; }), ...[drawnBox([], objects)].filter((x): x is Box => !!x)]);
    return b ? [(b[0] + b[2]) / 2 / L, -(b[1] + b[3]) / 2 / L] : [0, 0];
  };
  // The chosen atoms and objects turned by degrees (anticlockwise) about c. Text keeps level; shapes keep their shape.
  const turnedParts = (m: Mol, degrees: number, c: P, middles = captionMiddles()) => {
    const { atoms, items } = chosen(), r = (degrees * Math.PI) / 180, [cs, sn] = [Math.cos(r), Math.sin(r)];
    return transformParts(m, atoms, items, (q) => [c[0] + (q[0] - c[0]) * cs - (q[1] - c[1]) * sn, c[1] + (q[0] - c[0]) * sn + (q[1] - c[1]) * cs], [1, 1], middles);
  };
  // The point every turn of the selection goes about (the handle, the Turn keys, Turn 15° and Rotate…), as ChemDraw's:
  // the centre mark where it was put, else the one atom the selected atoms hang from (pivotOf), else the middle. Turns
  // one after another keep the same centre, so turning back puts everything back (text stays upright, so the middle
  // of what is drawn moves as it turns).
  const lastTurn = useRef<{ mol: Mol; selection: Set<number>; picked: Set<number>; centre: P }>(undefined);
  const turnCentre = (): P => {
    if (pivot) return pivot;
    const last = lastTurn.current;
    if (last && last.mol === doc && last.selection === selection && last.picked === picked) return last.centre;
    const k = selection.size ? pivotOf(doc, selection) : undefined;
    return k !== undefined ? pos(doc, k) : selectionMiddle();
  };
  const turnTo = (mol: Mol, centre: P) => { lastTurn.current = { mol, selection, picked, centre }; set(mol, true); };
  const rotateBy = (degrees: number) => { const c = turnCentre(); turnTo(turnedParts(doc, degrees, c), c); };
  // Rotate 180° (a turn through 3D) and Flip (a mirror), across or down, about the middle of what is chosen as drawn.
  // The atoms turn over first (flipAtoms keeps or inverts the stereochemistry), then the objects.
  function flip(axis: "horizontal" | "vertical", mirror = false) {
    const c = selectionMiddle(), k = axis === "horizontal" ? 0 : 1, { atoms, items } = chosen();
    set(transformParts(flipAtoms(doc, atoms, axis, mirror, c[k]), new Set(), items, (q) => (k ? [q[0], 2 * c[1] - q[1]] : [2 * c[0] - q[0], q[1]]), [1, 1], captionMiddles(), 1, k ? "down" : "across"), true);
  }
  function scaleBy(k: number, lines = scalesText()) {
    if (!(k > 0) || !Number.isFinite(k)) return;
    commitScale([k, k], selectionMiddle(), lines);
  }
  // The median bond length of what is chosen, in drawing units: bonds with both atoms chosen. Undefined with none.
  const chosenMedian = () => medianBond(doc, chosen().atoms);
  // Moves one of those things by d (drawing units): its atoms, free captions, arrows, shapes and curve points.
  const shiftThing = (m: Mol, t: { atoms: number[]; items: number[] }, d: P): Mol => {
    const ids = new Set(t.items), by = (q: [number, number]): [number, number] => [q[0] + d[0], q[1] + d[1]];
    let out = moveAtoms(m, new Set(t.atoms), d);
    out = {
      ...out,
      captions: out.captions?.map((c) => (ids.has(c.id) ? { ...c, x: c.x + d[0], y: c.y + d[1] } : c)),
      arrows: out.arrows?.map((a) => (ids.has(a.id) ? { ...a, from: by(a.from), to: by(a.to), ...(a.curve ? { curve: { ...a.curve, points: a.curve.points.map((q) => ({ at: by(q.at), ...(q.c1 ? { c1: by(q.c1) } : {}), ...(q.c2 ? { c2: by(q.c2) } : {}) })) } } : {}) } : a)),
      shapes: out.shapes?.map((x) => (ids.has(x.id) ? { ...x, from: by(x.from), to: by(x.to) } : x)),
      cycles: out.cycles?.map((c) => (ids.has(c.id) ? { ...c, centre: by(c.centre) } : c)),
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
  // What moves with some atoms and picked objects: the picked arrows, shapes and cycles, and each picked caption that
  // does not simply follow its structure, arrow or cycle (it comes away and moves alone, from where it is drawn).
  // original: each copy's original, for copies not yet drawn.
  const movers = (base: Mol, atoms: Set<number>, picks: Set<number>, original = new Map<number, number>()) => {
    const captions = new Map<number, P>(), arrowIds = new Set([...(base.arrows ?? []), ...(base.shapes ?? [])].filter((a) => picks.has(a.id)).map((a) => a.id));
    const cycleIds = new Set((base.cycles ?? []).filter((c) => picks.has(c.id)).map((c) => c.id));
    for (const caption of base.captions ?? []) {
      const c = placed.find((x) => x.id === (original.get(caption.id) ?? caption.id));
      const follows = (caption.under && caption.under.every((i) => atoms.has(i))) || (caption.on && arrowIds.has(caption.on.arrow)) || (caption.cycle && cycleIds.has(caption.cycle.cycle));
      if (c && picks.has(caption.id) && !follows) captions.set(caption.id, anchorOf(c));
    }
    return { captions, arrowIds, cycleIds };
  };
  const startMove = (p: P, screen: [number, number], t: Hover, picks = picked, atoms = selection, copy = false) => {
    // Option-drag moves copies, made now and kept only if the pointer moves.
    let base = doc, copies: Map<number, number> | undefined;
    const atoms0 = atoms, picks0 = picks;
    if (copy && (atoms.size || picks.size)) {
      const d = duplicateSelection(doc, atoms, picks);
      [base, atoms, picks, copies] = [d.mol, d.atoms, d.items, d.ids];
      setSelection(atoms);
      setPicked(picks);
    }
    const { captions, arrowIds, cycleIds } = movers(base, atoms, picks, new Map([...(copies ?? [])].map(([from, to]) => [to, from])));
    // Snapping (snap.ts): the box of everything moving, drawn (atoms with their labels, text as placed, arrows and
    // shapes by their ends), and every other object's, as they were at the press. Copies snap to their originals.
    // They are worked out at the first move and kept for the rest of the drag.
    let boxes: ReturnType<Extract<Drag, { kind: "move" }>["snap"]> | null = null;
    const snap = () => {
      if (boxes !== null) return boxes;
      const up = (b: Box): Box => [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
      const ends = (a: { from: P; to: P; curve?: { points: { at: P }[] }; angle?: number }): Box => {
        if (a.angle) return shapeBounds(a);
        const ps = [a.from, a.to, ...(a.curve?.points.map((q) => q.at) ?? [])];
        return [Math.min(...ps.map((q) => q[0])), Math.min(...ps.map((q) => q[1])), Math.max(...ps.map((q) => q[0])), Math.max(...ps.map((q) => q[1]))];
      };
      const ink = (g: Iterable<number>) => { const b = withCaptions(g); return b && up(b); };
      const textOf = new Map((doc.captions ?? []).map((c) => [c.id, c]));
      const moves = (id: number) => {
        const c = textOf.get(id);
        return picks0.has(id) || !!(c && ((c.under?.length && c.under.every((i) => atoms0.has(i))) || (c.on && picks0.has(c.on.arrow)) || (c.cycle && picks0.has(c.cycle.cycle))));
      };
      const things = [...arrows.filter((a) => !isOrbital(a)), ...(doc.shapes ?? [])];
      const movingBox = union([...(atoms0.size ? [ink(atoms0)] : []), ...placed.filter((c) => c.id !== DRAFT && moves(c.id)).map((c) => up(c.box)), ...things.filter((a) => picks0.has(a.id)).map(ends)].filter((b): b is Box => !!b));
      const targets = movingBox ? [
        ...fragments(doc).filter((g) => copies || !g.some((i) => atoms0.has(i))).map(ink),
        ...placed.filter((c) => c.id !== DRAFT && (copies || !moves(c.id))).map((c) => up(c.box)),
        ...things.filter((a) => copies || !picks0.has(a.id)).map(ends),
      ].filter((b): b is Box => !!b) : [];
      return (boxes = movingBox ? { moving: movingBox, targets } : undefined);
    };
    setDrag({ kind: "move", from: p, working: base, moved: false, start: screen, target: t, guides: [], captions, arrows: arrowIds, cycles: cycleIds, snap, ...(copies ? { base, atoms } : {}) });
  };
  // A press on a cycle's arrows picks the cycle with all its intermediates (and the rest of an integral group it is
  // in), and grabs them.
  function pressCycle(p: P, t: Hover, screen: [number, number], copy = false) {
    const c = doc.cycles?.find((x) => x.id === t.cycle);
    if (!c) return;
    const [atoms, picks] = wholeIntegral(doc, new Set(c.nodes.flat()), new Set([c.id]));
    setCycleStep(t.step ?? 0);
    setSelection(atoms);
    setPicked(picks);
    startMove(p, screen, t, picks, atoms, copy);
  }
  // A press on a caption or arrow picks it (Shift adds it), with the rest of an integral group it is in, and grabs it.
  function pressCaption(p: P, t: Hover, shift: boolean, screen: [number, number], copy = false) {
    const id = (t.caption ?? t.arrow)!;
    if (picked.has(id) && !shift) return startMove(p, screen, t, picked, selection, copy);
    const [atoms, picks] = wholeIntegral(doc, shift ? selection : new Set<number>(), new Set(shift ? [...picked, id] : [id]));
    setPicked(picks);
    setSelection(atoms);
    startMove(p, screen, t, picks, atoms, copy);
  }

  function pressSelect(p: P, t: Hover, shift: boolean, screen: [number, number], copy = false) {
    const ids = atomsOf(doc, t);
    // A press on any part of an integral group picks the whole (outermost) group (Shift adds it) and moves it.
    const whole = outermost(groupsOf(doc, new Set(ids), new Set(itemsOf(t))).filter((g) => g.integral));
    if (whole && selectKind !== "perspective") {
      const atoms = new Set([...(shift ? selection : []), ...whole.atoms]), picks = new Set([...(shift ? picked : []), ...whole.items]);
      setSelection(atoms);
      setPicked(picks);
      return startMove(p, screen, t, picks, atoms, copy);
    }
    // Structure Perspective: a press on the selection, or on a structure, tilts it through 3D as the pointer moves.
    if (selectKind === "perspective" && (ids.length || (selection.size && onSelection(doc, selection, p)))) {
      const on = selection.size && (onSelection(doc, selection, p) || ids.some((i) => selection.has(i)));
      const [set3, picks3] = wholeIntegral(doc, new Set(on ? [...selection] : (fragments(doc).find((g) => g.includes(ids[0])) ?? ids)), new Set());
      setSelection(set3);
      setPicked(picks3);
      const hinge = hingeOf(doc, set3), ps = [...set3].map((i) => doc.atoms[i].location);
      const centre: [number, number, number] = [0, 1, 2].map((k) => (Math.min(...ps.map((q) => q[k] ?? 0)) + Math.max(...ps.map((q) => q[k] ?? 0))) / 2) as [number, number, number];
      return setDrag({ kind: "tilt", base: doc, ids: set3, centre, start: screen, hinge, working: doc });
    }
    if (t.cycle !== undefined) return pressCycle(p, t, screen, copy);
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

  // Selects atoms and objects, with the whole of any integral group they touch: one cannot be split (as in ChemDraw,
  // where selecting any part of it selects all of it).
  const choose = (atoms: Iterable<number>, items: Iterable<number>) => {
    const [a, i] = wholeIntegral(doc, new Set(atoms), new Set(items));
    setSelection(a);
    setPicked(i);
  };
  // What a selection area takes in: also each cycle whose intermediates it takes in, all of them.
  const chooseArea = (atoms: Set<number>, items: number[]) =>
    choose(atoms, [...items, ...(doc.cycles ?? []).filter((c) => c.nodes.some((n) => n.length) && c.nodes.every((n) => n.every((i) => atoms.has(i)))).map((c) => c.id)]);
  // A selection area: a box, or a lasso, as the Select tool is set.
  function startArea(p: P, t: Hover, base: Set<number>, picks = new Set<number>()) {
    if (selectKind === "lasso") setDrag({ kind: "lasso", points: [p], base, picks, target: t, moved: false });
    else setDrag({ kind: "box", from: p, to: p, base, picks, target: t, moved: false });
  }
  // The captions and arrows whose middle is inside a selection area (drawing coordinates). Shapes are containers:
  // the area picks one when it crosses the shape's frame or takes in its middle, never when the area lies wholly
  // inside the shape, so a structure in a box can be picked on its own. corners: the area's outline points.
  const captionsWhere = (inside: (q: P) => boolean, corners: P[]) => [
    ...placed.filter((c) => c.id !== DRAFT && inside([(c.box[0] + c.box[2]) / 2 / L, -(c.box[1] + c.box[3]) / 2 / L])).map((c) => c.id),
    ...arrows.filter((a) => {
      const [f, t] = a.curve ? curveBox(a.curve) : [a.from, a.to];
      return inside([(f[0] + t[0]) / 2, (f[1] + t[1]) / 2]);
    }).map((a) => a.id),
    ...(doc.shapes ?? []).filter((sh) => {
      const b = shapeBounds(sh), lo = [b[0], b[1]], hi = [b[2], b[3]];
      const within = (q: P) => inShape(sh, q);
      const into = corners.filter(within).length;
      if (into === corners.length) return false; // drawn inside the shape
      // Takes in its middle, or crosses its frame: a corner inside, or (a box area) running right through it.
      const xs = corners.map((q) => q[0]), ys = corners.map((q) => q[1]);
      const through = corners.length === 4 && Math.min(...xs) < hi[0] && Math.max(...xs) > lo[0] && Math.min(...ys) < hi[1] && Math.max(...ys) > lo[1];
      return inside([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]) || into > 0 || through;
    }).map((sh) => sh.id),
  ];
  // A picked caption's width handle (ChemDraw's): on the side its lines run to, level with its middle, just outside its
  // width (or the end of its longest line, when it has no width). Drag it to wrap the caption.
  const HANDLE_GAP = 0.35; // em: the handle's clearance from the text
  const widthHandle = (): { id: number; at: P; c: Placed } | undefined => {
    const ids = [...picked], c = ids.length === 1 && !selection.size ? placed.find((x) => x.id === ids[0]) : undefined, w = c && shown.captions?.find((x) => x.id === c.id)?.width;
    if (!c || writing) return undefined;
    const x = c.lines[0].x, k = w ? w * L : 0, m = HANDLE_GAP * c.size;
    const hx = c.anchor === "end" ? (w ? x - k : c.box[0]) - m : (c.anchor === "middle" ? (w ? x + k / 2 : c.box[2]) : w ? x + k : c.box[2]) + m;
    return { id: c.id, at: [hx / L, -(c.box[1] + c.box[3]) / 2 / L], c };
  };
  // The handle of the one picked arrow under a point: its ends, and the middle of a curved one.
  const handleAt = (p: P): { id: number; which: Corner } | undefined => {
    const ids = [...picked], a = ids.length === 1 && !selection.size ? arrows.find((x) => x.id === ids[0]) : undefined;
    const near = (q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) * L * views.get().zoom < 8;
    const wh = widthHandle();
    if (wh && near(wh.at)) return { id: wh.id, which: "width" };
    if (!a || a.kind === "curve") return undefined;
    return near(a.to) ? { id: a.id, which: "to" } : near(a.from) ? { id: a.id, which: "from" } : curved(a) && near(bendPoint(a)) ? { id: a.id, which: "bend" } : undefined;
  };
  // The frame round the selection (px, y down) with its resize handles (resize.ts) and its rotation handle, by one
  // rule for every kind of selection: atoms, text, arrows, shapes, cycles, groups or a mix, as ChemDraw's selection
  // frame. It holds what is chosen as drawn (drawnBox), as a group's frame does. A lone straight arrow keeps its own
  // end handles and shows only the rotation handle (handles: false), and one atom of a structure gets none. corners:
  // text alone has corner handles only, as a stretch does not change text. turns: two or more things (a group is its
  // parts), or one arrow, curve or shape that can turn; one caption, table, TLC plate or atom alone does not turn.
  // Worked out once for each selection, as the pointer tests the handles on every move. It stays while the centre
  // mark is dragged (pivot), so the mark shows where it goes.
  const framing = !drag || drag.kind === "pivot";
  const selectionFrame = useMemo(() => {
    if (!framing) return undefined;
    const ids = [...picked], arrow = ids.length === 1 && !selection.size ? arrows.find((x) => x.id === ids[0]) : undefined;
    if (!picked.size && (!selection.size || (selection.size === 1 && neighbours(doc, [...selection][0]).length))) return undefined;
    const box = drawnBox(selection, new Set(ids.filter((id) => id !== DRAFT)));
    const turning = selection.size + ids.length >= 2 || !!arrow || !!doc.shapes?.some((x) => x.id === ids[0] && turns(x));
    return box && { box, handles: !arrow || arrow.kind === "curve", corners: textAlone(), turns: turning };
  }, [framing, selection, picked, drawing, placed, arrows, cycleArrows, shown.shapes]); // eslint-disable-line react-hooks/exhaustive-deps
  // The frame in drawing units (y up), 4 px clear of what it holds at this zoom, and the handles it shows: the side
  // handles only when that side is long enough on screen to hold them apart.
  const frameBox = (zoom: number): RBox | undefined => {
    const f = selectionFrame, pad = 4 / zoom;
    return f && [(f.box[0] - pad) / L, -(f.box[3] + pad) / L, (f.box[2] + pad) / L, -(f.box[1] - pad) / L];
  };
  const frameSides = (b: RBox, zoom: number) => SIDES.filter((h) => selectionFrame?.handles && (isCorner(h) || (!selectionFrame.corners && ((h === "n" || h === "s" ? b[2] - b[0] : b[3] - b[1]) * L * zoom >= 30))));
  const resizeAt = (p: P): Side | undefined => {
    const zoom = views.get().zoom, b = tool !== "erase" ? frameBox(zoom) : undefined, f = selectionFrame?.box;
    return b && sideAt(b, frameSides(b, zoom), p, 6 / (L * zoom), f && [f[0] / L, -f[3] / L, f[2] / L, -f[1] / L]);
  };
  // The rotation handle, as in ChemDraw: just off the frame's top right corner (px).
  const turnHandle = (zoom: number): P | undefined => {
    const b = frameBox(zoom);
    return b && selectionFrame!.turns ? [b[2] * L + 14 / zoom, -b[3] * L - 14 / zoom] : undefined;
  };
  const onTurnHandle = (p: P) => { const zoom = views.get().zoom, h = turnHandle(zoom); return !!h && Math.hypot(p[0] * L - h[0], -p[1] * L - h[1]) * zoom < 11; };
  // The centre mark: where the selection turns about, worked out once for each selection and drawing.
  const centreMark = useMemo(() => (selectionFrame?.turns ? turnCentre() : undefined), [selectionFrame, pivot, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const onCentreMark = (p: P) => !!centreMark && Math.hypot(p[0] - centreMark[0], p[1] - centreMark[1]) * L * views.get().zoom < 8;

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    const p = toDoc(e.clientX, e.clientY), t = hit(p), screen: [number, number] = [e.clientX, e.clientY];
    pointer.current = p;
    // The crosshair's middle drags it, whatever tool is in hand (a structure or object there comes first).
    if (onCrosshair(p, t)) return setDrag({ kind: "crosshair", from: cross!, at: cross! });
    const handle = tool !== "erase" ? handleAt(p) : undefined;
    if (handle) return setDrag({ kind: "handle", ...handle, working: doc });
    // Option-drag on the centre mark moves the centre the selection turns about (it snaps to atoms).
    if (tool !== "erase" && e.altKey && onCentreMark(p)) {
      if (tool === "select") pressMods.current = { shift: e.shiftKey, alt: true, atoms: selection, picks: picked };
      return setDrag({ kind: "pivot", start: screen, target: t, at: p, moved: false });
    }
    // A resize handle: the drag scales what is chosen. Its soft stops: 100%, and the median bond at the document's
    // bond length.
    const side = resizeAt(p);
    if (side) {
      const frame = frameBox(views.get().zoom)!, { atoms, items, whole } = chosen(), median = medianBond(doc, atoms);
      return setDrag({ kind: "resize", side, frame, atoms, items, middles: captionMiddles(), stops: [1, ...(median ? [1 / median] : [])], size: [1, 1], anchor: handlePoint(frame, side), whole, labels: scalesText(), lines: scalesText(), working: doc });
    }
    if (tool !== "erase" && onTurnHandle(p)) {
      const centre = turnCentre();
      return setDrag({ kind: "turn", centre, middles: captionMiddles(), start: Math.atan2(p[1] - centre[1], p[0] - centre[0]), degrees: 0, working: doc });
    }
    const page = t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined ? pageEdgeAt(p) : undefined;
    if (page) return fitPage(page);
    if (tool === "select") {
      pressMods.current = { shift: e.shiftKey, alt: e.altKey, atoms: selection, picks: picked };
      return pressSelect(p, t, e.shiftKey, screen, e.altKey);
    }
    // The Pen: each press places a point (drag for a smooth one); pressing the first point again closes the curve.
    if (tool === "shape" && "pen" in shapePick) {
      if (pen && pen.length >= 2 && Math.hypot(p[0] - pen[0].at[0], p[1] - pen[0].at[1]) * L * views.get().zoom < 8) return finishPen(true);
      setDrag({ kind: "pen", at: p, start: screen });
      return startHold(p, t, screen);
    }
    // With the Table tool, a border drags to size its column or row (the left and top edges size them all), and a
    // click inside a cell opens it. A hold there gives Select, as with every tool.
    if (tool === "table" && tableEdge(p)) {
      const { sh, axis, index } = tableEdge(p)!;
      setSelection(new Set());
      setPicked(new Set([sh.id]));
      setDrag({ kind: "tableedge", id: sh.id, axis, index, base: doc, working: doc });
      return startHold(p, t, screen);
    }
    if (tool === "table" && tableAt(p)) { setDrag({ kind: "click", at: p, start: screen, target: t }); return startHold(p, t, screen); }
    // With something selected, a press on it (or inside it) grabs it, whatever tool is in hand. So does a press
    // on a caption, except with the Text tool, which edits it.
    if (tool !== "erase" && selection.size && onSelection(doc, selection, p)) return startMove(p, screen, t);
    if (tool !== "erase" && tool !== "text" && t.cycle !== undefined) return pressCycle(p, t, screen);
    if (tool !== "erase" && tool !== "text" && (t.caption !== undefined || t.arrow !== undefined)) return pressCaption(p, t, e.shiftKey, screen);
    // With the TLC tool, a spot or a line on a plate drags, and a click adds a spot. A hold gives Select.
    if (tool === "tlc" && plateAt(p)) {
      const sh = plateAt(p)!;
      if (spotHit(sh, p) >= 0 || lineHit(sh, p)) spotAt(sh, p, screen, e.altKey, e.shiftKey);
      else setDrag({ kind: "click", at: p, start: screen, target: t });
      return startHold(p, t, screen);
    }
    // The eraser takes a TLC spot off its plate.
    if (tool === "erase" && plateAt(p) && spotHit(plateAt(p)!, p) >= 0) {
      const sh = plateAt(p)!, i = spotHit(sh, p);
      return set(updateShape(doc, sh.id, { tlc: { ...sh.tlc!, spots: sh.tlc!.spots.filter((_, k) => k !== i) } }));
    }
    // Pressing away from the selection with a drawing tool clears it, as ChemDraw does.
    if (selection.size || picked.size) { setSelection(new Set()); setPicked(new Set()); }
    // Snap to Grid: a press on empty canvas starts on the grid (the new atom, the text, an arrow's or shape's start).
    pressTool(tool !== "erase" && t.atom === undefined && t.bond === undefined ? toGrid(p, e.metaKey) : p, t, screen);
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
    if (guides.rulers) pointers.set(p);
    if (hold.current && holdFrom.current && Math.hypot(e.clientX - holdFrom.current[0], e.clientY - holdFrom.current[1]) >= 4) stopHold();
    if (tool === "erase") setBrush(p);
    if (pen && !drag) setPenAt(p);
    if (!drag) {
      const t = hit(p);
      overs.set({
        selection: tool !== "erase" && selection.size > 0 && onSelection(doc, selection, p), turn: tool !== "erase" && onTurnHandle(p), edge: tool === "table" ? tableEdge(p)?.axis : undefined, resize: resizeAt(p),
        page: t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined ? pageEdgeAt(p)?.[0] : undefined, cross: onCrosshair(p, t),
      });
      return setHover(t);
    }
    switch (drag.kind) {
      case "click":
        if (Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) >= 4) stopHold();
        return;
      case "crosshair": {
        // On the page's grid, a lighter step at a time from its corner (⌘ frees it); Shift keeps it to one axis.
        const step = gridOf(style.grid, mm, corner).minor;
        let q: P = e.metaKey ? p : [0, 1].map((k) => corner[k] + Math.round((p[k] - corner[k]) / step) * step) as P;
        if (e.shiftKey) q = Math.abs(q[0] - drag.from[0]) >= Math.abs(q[1] - drag.from[1]) ? [q[0], drag.from[1]] : [drag.from[0], q[1]];
        return setDrag({ ...drag, at: q });
      }
      case "bond": {
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        if (drag.target.bond !== undefined && drag.target.atom === undefined) return; // dragging from a bond does nothing
        const origin = typeof drag.from === "number" ? pos(doc, drag.from) : drag.from;
        const onto = atomAt(doc, p);
        let to: P;
        if (onto !== undefined && onto !== drag.from) to = pos(doc, onto);
        else {
          // One bond long at the scale of the atom it starts from, so it matches the bonds there.
          const a = Math.round(Math.atan2(p[1] - origin[1], p[0] - origin[0]) / SNAP) * SNAP, k = typeof drag.from === "number" ? scaleAt(doc, drag.from) : 1;
          to = [origin[0] + Math.cos(a) * k, origin[1] + Math.sin(a) * k];
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
        const a = e.altKey ? raw : Math.round(raw / SNAP) * SNAP, to: P = [drag.from[0] + far * Math.cos(a), drag.from[1] + far * Math.sin(a)];
        // Snap to Grid: a level or upright arrow ends on a grid line too (other angles keep their 15° steps).
        const turn = ((Math.round(a / SNAP) % 12) + 12) % 12, g = toGrid(to, e.metaKey || e.altKey);
        return setDrag({ ...drag, to: turn === 0 ? [g[0], to[1]] : turn === 6 ? [to[0], g[1]] : to });
      }
      case "map":
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        return setDrag({ ...drag, to: p });
      case "spot": {
        const sh = drag.base.shapes?.find((x) => x.id === drag.plate);
        if (!sh?.tlc) return;
        const t = tlcLayout(sh), x = sh.tlc.spots[drag.index], d: P = [p[0] - drag.from[0], p[1] - drag.from[1]];
        if (!drag.moved && Math.hypot(d[0], d[1]) * L * views.get().zoom < 3) return;
        const working = drag.size
          ? editSpot(drag.base, drag.plate, drag.index, () => {
            const { rx, ry } = t.size(x);
            return { w: Math.max(0.04, rx + d[0]) / t.f, ...(d[1] >= 0 ? { h: Math.max(0.04, ry + d[1]) / t.f } : { tail: Math.max(0, (x.tail ?? 0) - d[1] / t.f) }) };
          })
          : editSpot(drag.base, drag.plate, drag.index, () => ({
            lane: Math.min(t.lanes - 1, Math.max(0, Math.floor((p[0] - t.x0) / t.width))),
            rf: Math.round(Math.min(1, Math.max(0, (p[1] - t.origin) / (t.front - t.origin))) * 100) / 100,
          }));
        return setDrag({ ...drag, working, moved: true });
      }
      case "tableedge": {
        const sh = drag.base.shapes?.find((x) => x.id === drag.id);
        if (!sh?.table) return;
        const t = tableLayout(sh, cellWidth(sh), style.captionSize), i = drag.index;
        const size = drag.axis === "col"
          // The left edge scales every column, keeping the right edge; another border sizes the column before it.
          ? i === 0 ? { widths: t.widths.map((w) => (w * Math.max(0.1, t.x1 - p[0])) / (t.x1 - t.x0)), x0: Math.min(p[0], t.x1 - 0.1) } : { widths: t.widths.map((w, c) => (c === i - 1 ? p[0] - t.col(c) : w)) }
          : i === 0 ? { heights: t.heights.map((h) => (h * Math.max(0.1, p[1] - t.y0)) / (t.y1 - t.y0)), y1: Math.max(p[1], t.y0 + 0.1) } : { heights: t.heights.map((h, r) => (r === i - 1 ? t.row(r) - p[1] : h)) };
        return setDrag({ ...drag, working: updateShape(drag.base, drag.id, sizeTable(sh, size, cellWidth(sh), style.captionSize)) });
      }
      case "tlcline": {
        const sh = drag.base.shapes?.find((x) => x.id === drag.plate);
        if (!sh?.tlc) return;
        const t = tlcLayout(sh), h = t.y1 - t.y0;
        // The origin stays below the front and the front above the origin, each inside the plate.
        const change = drag.which === "origin" ? { origin: Math.min(0.9, Math.max(0.02, (p[1] - t.y0) / h), 1 - (sh.tlc.front ?? 0.1) - 0.1) }
          : { front: Math.min(0.9, Math.max(0.02, (t.y1 - p[1]) / h), 1 - (sh.tlc.origin ?? 0.12) - 0.1) };
        return setDrag({ ...drag, working: updateShape(drag.base, drag.plate, { tlc: { ...sh.tlc, ...change } }) });
      }
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
      case "pivot": {
        if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        if (!drag.moved) setDrag({ ...drag, moved: true });
        const a = atomAt(doc, p, 8 / (L * views.get().zoom));
        return setPivot(a !== undefined ? pos(doc, a) : p);
      }
      case "turn": {
        // Free, or in 15° steps with Shift. Anticlockwise is positive, as on the page.
        let degrees = ((Math.atan2(p[1] - drag.centre[1], p[0] - drag.centre[0]) - drag.start) * 180) / Math.PI;
        degrees = ((degrees + 540) % 360) - 180;
        if (e.shiftKey) degrees = Math.round(degrees / 15) * 15;
        return setDrag({ ...drag, degrees, working: turnedParts(doc, degrees, drag.centre, drag.middles) });
      }
      case "resize": {
        // ⌘ turns the soft stops off, as it turns snapping off while moving. Control turns Labels and lines over for
        // this drag, as ChemDraw's Ctrl does on its handles.
        const { size, anchor } = resizeBy(drag.frame, drag.side, p, { shift: e.shiftKey, alt: e.altKey }, e.metaKey ? [] : drag.stops, 6 / (views.get().zoom * L));
        const lines = drag.labels !== e.ctrlKey;
        if (size[0] === drag.size[0] && size[1] === drag.size[1] && anchor[0] === drag.anchor[0] && anchor[1] === drag.anchor[1] && lines === drag.lines) return;
        return setDrag({ ...drag, size, anchor, lines, working: drag.whole && lines && size[0] === size[1] ? doc : scaledParts(doc, drag.atoms, drag.items, size, anchor, lines, drag.middles) });
      }
      case "shape": {
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        // Shift makes it square (or round).
        const w = p[0] - drag.from[0], h = p[1] - drag.from[1], side = Math.max(Math.abs(w), Math.abs(h));
        return setDrag({ ...drag, to: e.shiftKey ? [drag.from[0] + Math.sign(w || 1) * side, drag.from[1] + Math.sign(h || 1) * side] : toGrid(p, e.metaKey) });
      }
      case "handle": {
        // A caption's width: from its anchor to the pointer (both ways from a centred caption's middle). Dragged out
        // past its longest line, it has no width again.
        const cap = drag.which === "width" ? placed.find((x) => x.id === drag.id) : undefined;
        if (cap) {
          const x = cap.lines[0].x / L, m = (HANDLE_GAP * cap.size) / L, d = cap.anchor === "end" ? x - p[0] - m : cap.anchor === "middle" ? 2 * (Math.abs(p[0] - x) - m) : p[0] - x - m;
          const longest = Math.max(...(doc.captions?.find((c) => c.id === cap.id)?.text.split("\n") ?? []).map((t) => textWidth(t, cap.size, cap.bold, cap.italic, fontStack(cap.font ?? style.captionFont)))) / L;
          return setDrag({ ...drag, working: updateCaption(doc, cap.id, { width: d >= longest ? undefined : Math.max(0.5, d) }) });
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
        for (const a of arrows) if (nearTrace([x, y], arrowTrace(a, L), r)) captions.add(a.id);
        for (const sh of doc.shapes ?? []) if (nearTrace([x, y], shapeTrace(sh, L, frame.bond), r)) captions.add(sh.id);
        // An integral group goes whole, as with ChemDraw's eraser.
        for (const g of groupsOf(doc, new Set([...atoms, ...[...bonds].flatMap((i) => doc.bonds[i].atoms)]), captions)) if (g.integral) { g.atoms.forEach((i) => atoms.add(i)); g.items.forEach((id) => captions.add(id)); }
        return setDrag({ ...drag, trail: [...drag.trail, p], bonds, atoms, captions, moved: true });
      }
      case "box": {
        // Smart: atoms the box only just missed (all their neighbours are in it) come along too.
        const [lo, hi] = [[Math.min(drag.from[0], p[0]), Math.min(drag.from[1], p[1])], [Math.max(drag.from[0], p[0]), Math.max(drag.from[1], p[1])]];
        chooseArea(complete(doc, new Set([...drag.base, ...atomsIn(doc, drag.from, p)])), [...drag.picks, ...captionsWhere(([x, y]) => x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1], [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]])]);
        return setDrag({ ...drag, to: p, moved: true });
      }
      case "lasso": {
        const points = [...drag.points, p];
        chooseArea(complete(doc, new Set([...drag.base, ...atomsInPolygon(doc, points)])), [...drag.picks, ...captionsWhere((q) => inPolygon(q, points), points)]);
        return setDrag({ ...drag, points, moved: true });
      }
      case "move": {
        if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        // Snap within 6 screen px, unless snapping is off or ⌘ is held (Option is ChemDraw's copy, at the press).
        const raw: P = [p[0] - drag.from[0], p[1] - drag.from[1]], base = drag.base ?? doc, moving = drag.atoms ?? selection;
        // Text, arrows and shapes moving without atoms snap the same way.
        const tol = 6 / (views.get().zoom * L);
        const boxes = !settings.snap || e.metaKey ? undefined : drag.snap();
        const snapped = !settings.snap || e.metaKey ? { d: raw, guides: [] as Guide[], point: undefined }
          : moving.size ? snapMove(base, moving, raw, tol, boxes)
          : boxes ? { ...snapBoxes(boxes.moving, boxes.targets, raw, tol), point: undefined }
          : { d: raw, guides: [] as Guide[], point: undefined };
        // Snap to Grid, on each axis an atom or object snap left free: the atom grabbed (a bond's nearer atom), or else
        // the nearest corner or middle of the moving box, lands on a grid line.
        if (snapGrid && !e.metaKey && !snapped.point) {
          const t = drag.target, grabbed = t.atom ?? (t.bond !== undefined ? base.bonds[t.bond].atoms.reduce((a, b) => (Math.hypot(pos(base, a)[0] - drag.from[0], pos(base, a)[1] - drag.from[1]) <= Math.hypot(pos(base, b)[0] - drag.from[0], pos(base, b)[1] - drag.from[1]) ? a : b)) : undefined);
          const b = grabbed !== undefined && moving.has(grabbed) ? undefined : drag.snap()?.moving;
          const points: P[] = grabbed !== undefined && moving.has(grabbed) ? [pos(base, grabbed)] : b ? [b[0], (b[0] + b[2]) / 2, b[2]].flatMap((x) => [b[1], (b[1] + b[3]) / 2, b[3]].map((y): P => [x, y])) : [];
          const nudge = gridNudge(snapGrid, points.map((q) => [q[0] + snapped.d[0], q[1] + snapped.d[1]]), views.get().zoom * L, 6);
          const free = (axis: "x" | "y") => !snapped.guides.some((g) => g.axis === axis);
          snapped.d = [snapped.d[0] + (free("x") ? nudge[0] ?? 0 : 0), snapped.d[1] + (free("y") ? nudge[1] ?? 0 : 0)];
        }
        return setDrag({ ...drag, working: moveAll(base, snapped.d, drag.captions, drag.arrows, drag.cycles, moving), moved: true, guides: snapped.guides, point: snapped.point });
      }
    }
  }

  // Runs a shortcut action (see keys.ts for the list).
  // What an atom or bond key works on: the atom or bond under the pointer, else the one atom or bond selected
  // (so a key still works while the pointer is over the Actions panel).
  const keyTarget = (): { atom?: number; bond?: number } => {
    const hover = hovers.get();
    if (hover.atom !== undefined || hover.bond !== undefined) return { atom: hover.atom, bond: hover.bond };
    if (picked.size || !selection.size || selection.size > 2) return {};
    const ids = [...selection];
    if (ids.length === 1) return { atom: ids[0] };
    const b = doc.bonds.findIndex((x) => x.atoms.includes(ids[0]) && x.atoms.includes(ids[1]));
    return b >= 0 ? { bond: b } : {};
  };
  // The Eraser's click and Delete with nothing selected: the atom, bond or object under the pointer goes, or the
  // whole of the (outermost) integral group it is part of (as with ChemDraw's eraser).
  function removeAt(t: Hover) {
    const g = outermost(groupsOf(doc, new Set(atomsOf(doc, t)), new Set(itemsOf(t))).filter((x) => x.integral));
    if (g) return set(deleteGraphics(deleteAtoms(doc, new Set(g.atoms)), new Set(g.items)));
    if (t.atom !== undefined) return set(deleteAtom(doc, t.atom));
    if (t.caption !== undefined || t.arrow !== undefined || t.cycle !== undefined) return set(deleteGraphics(doc, new Set(itemsOf(t))));
    if (t.bond !== undefined) return set(deleteBond(doc, t.bond));
  }
  function run(id: string) {
    const [kind, arg] = id.split(".");
    const { atom, bond } = keyTarget();
    // As in ChemDraw: G selects the atom or bond under the pointer; Space takes Select and, over a structure,
    // selects all of it.
    if (id === "select.here") return atom !== undefined || bond !== undefined ? choose(atomsOf(doc, { atom, bond }), []) : undefined;
    const hover = hovers.get();
    if (id === "tool.select") {
      setTool("select");
      const one = hover.atom ?? (hover.bond !== undefined ? doc.bonds[hover.bond].atoms[0] : undefined);
      if (one !== undefined) choose(fragments(doc).find((g) => g.includes(one)) ?? [one], []);
      else if (hover.caption !== undefined || hover.arrow !== undefined) choose([], [(hover.caption ?? hover.arrow)!]);
      return;
    }
    if (id === "atom.attach" && atom !== undefined) return set(setAtomMarks(doc, atom, { attach: !doc.atoms[atom].attach || undefined }));
    if (id === "atom.number" && atom !== undefined) return numberAtoms([atom]);
    if (id === "atom.properties" && atom !== undefined) return atomProperties(atom);
    if (kind === "element" && atom !== undefined) return set(setElement(doc, atom, arg));
    if (kind === "label" && atom !== undefined) return set(setLabel(doc, atom, arg));
    if (id === "atom.label" && atom !== undefined) return editLabel(atom);
    if (id === "charge.plus" && atom !== undefined) return set(addCharge(doc, atom, 1));
    if (id === "charge.minus" && atom !== undefined) return set(addCharge(doc, atom, -1));
    if (kind === "subst" && atom !== undefined) return set(stepSubstituents(doc, atom, arg as "free" | "upto" | "exactly" | "lower"));
    if (kind === "menu") return commands.current[id.slice(5)]?.(); // a menu command on a key (Settings)
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
      const m = movers(doc, selection, picked);
      return set(moveAll(doc, d, m.captions, m.arrowIds, m.cycleIds), true);
    }
    if (kind === "rotate" && (selection.size || picked.size)) return rotateBy((arg.startsWith("ccw") ? 1 : -1) * Number(arg.replace(/\D/g, "")));
    if (id === "edit.delete") {
      if (selection.size || picked.size) return set(deleteGraphics(deleteAtoms(doc, selection), picked));
      // As in ChemDraw: the first Delete on a labelled atom removes the label; the next removes the atom.
      if (atom !== undefined && doc.atoms[atom].label !== "C" && !groupsOf(doc, new Set([atom]), new Set()).some((g) => g.integral)) return set(setElement(doc, atom, "C"));
      // Any other object under the pointer goes too (ChemDraw deletes a hovered arrow), with its integral group.
      return removeAt({ ...hover, atom, bond });
    }
  }

  // Structure to name: a checked name for each structure in the selection (or the drawing), where there is one.
  // Structure to name runs only when asked, once per structure: names are kept by the structure's own file text.
  const nameCache = useRef(new Map<string, string | null>());
  const nameFor = (g: number[]): string | undefined => {
    const part = subset(doc, new Set(g)), key = serialize(part);
    if (!nameCache.current.has(key)) {
      let name: string | undefined;
      // A name's structure is drawn as Octet draws SMILES before its InChI is taken, so it counts hydrogens as the
      // drawing does (the P of PPh3 bonded to Pd has none).
      const inchiOf = (s: Mol | string) => { try { return toInchi(typeof s === "string" ? parseStructure(s) : s); } catch { return undefined; } };
      try { name = checkedName(part, expandLabels(part), nameToSmiles, inchiOf, cipOf, knownName); } catch { name = undefined; }
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
  // Search Reaxys and Search PubChem (decision 0008): the selection, or the whole drawing when nothing is selected
  // (as Copy), opens in the user's browser. Structures on one side of a reaction search Reaxys's reactions for them
  // in that part, as ChemDraw's Reactant and Reaction product searches. Only a press runs a search.
  function searchOnline(site: "reaxys" | "pubchem", exact: boolean) {
    if (!loaded) return;
    const all = !selection.size && !picked.size, part = all ? doc : extractSelection(doc, selection, picked);
    if (!part.atoms.length) return setNotice("Select a structure to search.");
    const reactions: Reaction[] = [], seen = new Set<number>();
    for (const a of arrows.filter((x) => straightArrow(x))) {
      if (seen.has(a.id)) continue;
      const r = reactionOf(a.id);
      r?.arrows.forEach((id) => seen.add(id));
      if (r) reactions.push(r);
    }
    const role = roleOf(reactions, fragments(doc).filter((g) => all || g.some((i) => selection.has(i))));
    if (role === "mixed") return setNotice("Select the starting materials or the products of the reaction.");
    let query: ReturnType<typeof searchQuery>;
    try { query = searchQuery(part); } catch { return setNotice("Octet cannot read this structure."); }
    if (!searchNow()) return;
    // A query with generic labels always looks for substructures.
    invoke("search_online", { site, ...query, exact: exact && !query.molfile, role: site === "reaxys" ? role : undefined })
      .catch((e) => setNotice(typeof e === "string" ? e : "Search runs in the Octet app."));
  }
  // The selection to the front or the back of the draw order (order.ts): each structure it touches, as a whole, and
  // each picked object (a picked cycle takes its intermediates too).
  function restack(front: boolean) {
    const inCycle = new Set((doc.cycles ?? []).filter((c) => picked.has(c.id)).flatMap((c) => c.nodes.flat()));
    const m = reorder(doc, fragments(doc).filter((g) => g.some((i) => selection.has(i) || inCycle.has(i))), picked, front);
    if (m !== doc) set(m, true);
  }
  // Structure to name: each named structure gets its name centred underneath (after its compound number).
  function nameStructures() {
    if (!namesLoaded) { void loadNames().then(() => setNamesLoaded(true)); return setNotice("Loading names. Try again in a moment.", true); }
    let m = doc, missed = 0;
    for (const atoms of targets()) {
      const name = nameFor(atoms);
      if (!name) { missed++; continue; }
      if (!m.captions?.some((c) => c.text === name && c.under?.some((i) => atoms.includes(i)))) m = addCaption(m, { text: name, x: 0, y: 0, under: atoms })[0];
    }
    setNotice(missed === 0 ? undefined : missed === 1 ? "Octet cannot name this structure yet." : `Octet cannot name ${missed} of these structures yet.`);
    if (m !== doc) set(m, true);
  }
  const nameable = loaded && doc.atoms.length > 0;
  // The colour the Actions panel shows as chosen: the first selected thing's, for every kind of selection.
  const selectionColour = (context: Context): { value: string; tints?: boolean } | undefined => {
    if (context.kind === "caption" || context.kind === "shape") return { value: context.colour, tints: context.kind === "shape" && context.shape === "highlight" };
    if (context.kind === "spot" && spotPick) return { value: doc.shapes?.find((x) => x.id === spotPick.plate)?.tlc?.spots[spotPick.index]?.colour ?? "#000000" };
    if (context.kind === "empty" || context.kind === "drawing") return undefined;
    if (context.kind === "grid") return { value: doc.grids?.find((g) => g.arrow === gridPick?.arrow)?.colour ?? "#000000" };
    // A bond alone takes its own colour (the colour action sets the bond only), so its row shows the bond's.
    if (context.kind === "bond") return { value: doc.bonds.find((b) => selection.has(b.atoms[0]) && selection.has(b.atoms[1]))?.colour ?? "#000000" };
    const first = [...selection][0], thing = [...(doc.arrows ?? []), ...(doc.cycles ?? []), ...(doc.shapes ?? []), ...(doc.captions ?? [])].find((x) => picked.has(x.id));
    return { value: (first !== undefined ? doc.atoms[first]?.colour : thing?.colour) ?? "#000000" };
  };
  // The kinds of thing selected (structures, captions, arrows, shapes, cycles) and how many things. A caption under a
  // selected structure, on a picked arrow or in a picked cycle goes with it, and so do a picked cycle's intermediates.
  const mixOf = () => {
    if (!picked.size) return { kinds: selection.size ? 1 : 0, count: 0, atoms: selection.size > 0 };
    const cycles = (doc.cycles ?? []).filter((c) => picked.has(c.id)), inCycle = new Set(cycles.flatMap((c) => c.nodes.flat()));
    const arrowIds = new Set((doc.arrows ?? []).filter((a) => picked.has(a.id)).map((a) => a.id)), shapes = (doc.shapes ?? []).filter((x) => picked.has(x.id)).length;
    const captions = (doc.captions ?? []).filter((c) => picked.has(c.id) && !c.under?.some((i) => selection.has(i)) && !(c.on && arrowIds.has(c.on.arrow)) && !(c.cycle && cycles.some((y) => y.id === c.cycle!.cycle))).length;
    const structures = fragments(doc).filter((g) => g.some((i) => selection.has(i) && !inCycle.has(i))).length;
    const counts = [structures, captions, arrowIds.size, shapes, cycles.length];
    return { kinds: counts.filter(Boolean).length, count: counts.reduce((a, b) => a + b, 0), atoms: structures > 0 };
  };
  // What the Actions panel shows: it follows the selection (and, while typing, the caret). Worked out when the panel
  // draws and when an action runs.
  // Stoichiometry grids, each laid out under its reaction: a column under each reactant, each reagent drawn or written
  // above or below an arrow (as ChemDraw's grid takes them, as reactants), and each product; text reagents such as H2O
  // or MeOH too, each item of a list such as "NaBH4, MeOH" on its own, their molar mass from the formula or the
  // abbreviation. The row names on the left, the amounts worked out from what was typed (stoich.ts). Typed values show
  // bold, worked-out ones plain, as ChemDraw's grid does. Hidden rows and columns are left out.
  const gridViews = useMemo(() => (loaded && (!exporting || exporting === doc) ? doc.grids ?? [] : []).flatMap((g) => {
    const r = reactionOf(g.arrow);
    if (!r) return [];
    const steps = interpret(doc, r, arrows, inkBox, captionBox);
    if (!steps.length) return [];
    const parts: { product: boolean; what: string; formula: string; mw: number; x: number; low: number }[] = [];
    // conditions: only text with a molar mass makes a column ("0 °C" and "2 h" do not).
    const add = (p: Part, product: boolean, conditions = false) => {
      const x = (p.box[0] + p.box[2]) / 2, low = p.box[1];
      if (p.kind === "structure") { const a = analyse(pickAtoms(doc, p.atoms))?.[0]; parts.push({ product, what: a?.formula ?? "?", formula: a?.formula ?? "", mw: a?.weight ?? 0, x, low }); return; }
      const text = doc.captions?.find((c) => c.id === p.id)?.text ?? "", items = conditions ? text.split(/[,;\n]/).map((t) => t.trim()).filter(Boolean) : [text.trim()];
      items.forEach((item, k) => {
        const plain = item.replace(/^\d+\s+(?=\S)/, ""), weight = formulaWeight(plain), smiles = weight === undefined ? labelSmiles(plain) : undefined, read = smiles ? smilesWeight(smiles) : undefined;
        if (conditions && !weight && !read) return;
        parts.push({ product, what: `"${item}"`, formula: weight ? plain.replace(/\s+/g, "") : read?.formula ?? "", mw: weight ?? read?.weight ?? 0, x: x + k * 0.01, low });
      });
    };
    steps[0].reactants.forEach((p) => add(p, false));
    for (const st of steps) for (const p of [...st.above, ...st.below]) add(p, false, true);
    steps[steps.length - 1].products.forEach((p) => add(p, true));
    if (!parts.length) return [];
    const keyed = keyColumns(parts, g.typed, g.limiting), all = keyed.cols, hidden = g.hidden ?? {};
    const solved = solve(all, keyed.limiting), limiting = keyed.limiting ?? all.find((c) => !c.product)?.key;
    // The grid takes its arrow's scale (decision 0007). Columns stand under what they are, a column's width apart.
    const f = scaleOf(doc.arrows?.find((a) => a.id === g.arrow) ?? {}), width = 3.4 * f;
    const cols = all.filter((c) => !hidden.cols?.includes(c.key)).sort((p, q) => p.x - q.x).map((c) => ({ ...c }));
    cols.forEach((c, k) => { if (k && c.x < cols[k - 1].x + width) c.x = cols[k - 1].x + width; });
    if (!cols.length) return [];
    const used = (fd: Field) => cols.some((c) => c.typed[fd] !== undefined), products = cols.some((c) => c.product);
    const rows = GRID_ROWS.filter((row) => !hidden.rows?.includes(row.id) && (row.product ? products : row.shown ? row.shown.some(used) : true));
    // Below the components and the numbers under them.
    const under = (doc.captions ?? []).filter((c) => c.under?.some((i) => r.atoms.includes(i))).map((c) => placed.find((p) => p.id === c.id)).filter(Boolean).map((p) => -p!.box[3] / L);
    const top = Math.min(...cols.map((c) => c.low), ...under) - 0.9 * f, rh = (style.captionSize * pt * 0.9 * 1.6 * f) / L;
    // The row names end a little before the first column; the rules start at the longest name.
    const left = Math.min(...cols.map((c) => c.x)) - width / 2 - 0.3 * f, size = style.captionSize * pt * 0.9 * f;
    const names = Math.max(...rows.map((row) => formulaWidth(row.name, size, false, false, fontStack(style.captionFont)) / L));
    return [{ arrow: g.arrow, all, cols, rows, solved, limiting, top, rh, left, width, start: left - names - 0.2 * f, f, colour: g.colour, hiding: !!(hidden.rows?.length || hidden.cols?.length) }];
  }), [loaded, doc, drawing, placed, exporting]); // eslint-disable-line react-hooks/exhaustive-deps
  type GridView = (typeof gridViews)[number];
  // A cell's text, and whether it was typed.
  const gridText = (v: GridView, c: GridView["cols"][number], row: (typeof GRID_ROWS)[number]): { text: string; typed?: boolean } => {
    const s = v.solved[c.key];
    if (row.id === "formula") return { text: c.formula };
    if (row.id === "mw") return { text: c.mw ? formatAmount(c.mw, "mw") : "" };
    if (row.id === "limiting") return { text: c.product ? "" : v.limiting === c.key ? "Yes" : "" };
    if (row.product !== c.product && row.product !== undefined) return { text: "" };
    if (row.id === "expected") return { text: formatAmount(s?.expectedMass, "mass") };
    if (row.id === "expectedMoles") return { text: formatAmount(s?.expectedMoles, "moles") };
    if (row.id === "yield") return { text: formatAmount(s?.yield, "yield") };
    if (!row.field || (c.product && !["purity", "measured", "equiv"].includes(row.field))) return { text: "" };
    return { text: formatAmount(s?.[row.field as keyof typeof s] as number | undefined, row.field), typed: c.typed[row.field] !== undefined };
  };
  // The grid cell under a point (drawing units), if any.
  const gridCellAt = (p: P) => {
    for (const v of gridViews) {
      const k = Math.floor((v.top - p[1]) / v.rh), c = v.cols.find((col) => Math.abs(p[0] - col.x) < v.width / 2);
      if (k >= 0 && k < v.rows.length && c) return { arrow: v.arrow, key: c.key, row: v.rows[k].id, x: c.x, y: v.top - k * v.rh, product: c.product };
    }
    return undefined;
  };
  const [gridEdit, setGridEdit] = useState<{ arrow: number; key: string; row: string; x: number; y: number; product: boolean; value: string }>();
  // A grid cell clicked with Select: picked, for the grid's actions (Set as limiting, Hide row and column, colour).
  const [gridPick, setGridPick] = useState<{ arrow: number; key: string; row: string }>();
  useEffect(() => { if (selection.size || picked.size) setGridPick(undefined); }, [selection, picked]);
  // A grid changed: its typed values and limiting reactant saved under each column's key as the grid now reads them
  // (keyColumns), so values matched by order are kept by key from now on.
  const changeGrid = (arrow: number, change: (g: Grid, v: GridView) => Partial<Grid>) => {
    const g = doc.grids?.find((x) => x.arrow === arrow), v = gridViews.find((x) => x.arrow === arrow);
    if (!g || !v) return;
    const now: Grid = { ...g, typed: Object.fromEntries(v.all.filter((c) => Object.keys(c.typed).length).map((c) => [c.key, c.typed])), limiting: v.limiting };
    set({ ...doc, grids: doc.grids!.map((x) => (x === g ? { ...now, ...change(now, v) } : x)) }, true);
  };
  // Typing in a cell: the unit says what it is (250 mg a mass, 0.5 mL a volume, 1.2 eq equivalents), a bare number is
  // the row's own quantity, and an empty cell clears it. A reactant's mass, moles, volume or equivalents replaces the
  // others (they are four ways to say how much); a product's equivalents are its coefficient. Limiting? sets the
  // limiting reactant.
  function commitGridCell(text: string) {
    const w = gridEdit;
    setGridEdit(undefined);
    if (!w) return;
    const row = GRID_ROWS.find((r) => r.id === w.row)!;
    if (row.id === "limiting") return w.product ? undefined : changeGrid(w.arrow, () => ({ limiting: w.key }));
    if (!row.field) return;
    const field0 = row.field;
    changeGrid(w.arrow, (g) => {
      const typed = { ...(g.typed[w.key] ?? {}) };
      if (!text.trim()) delete typed[field0];
      else {
        const fields: Field[] = w.product ? ["measured", "purity", "equiv"] : [field0, "mass", "moles", "volume", "equiv", "density", "molarity", "purity"];
        const bare = /^\s*[\d.,]+(e[+-]?\d+)?\s*$/i.test(text), field = bare ? (w.product && field0 !== "purity" && field0 !== "equiv" ? "measured" : field0) : fields.find((fd) => parseAmount(text, fd) !== undefined);
        const value = field && parseAmount(text, field);
        if (!field || value === undefined) { setNotice("Type an amount with its unit, such as 250 mg, 1.2 eq or 0.5 mL."); return {}; }
        if (!w.product && ["mass", "moles", "volume", "equiv"].includes(field)) for (const fd of ["mass", "moles", "volume", "equiv"] as Field[]) delete typed[fd];
        typed[field] = value;
      }
      return { typed: { ...g.typed, [w.key]: typed } };
    });
  }
  const contextOf = (): Context => {
    // Typing, or the Text tool in hand: the panel is a text editor for that text (or the next text).
    if (writing) {
      const st = { ...(writing.id !== undefined ? doc.captions?.find((c) => c.id === writing.id) : undefined), ...writing.style };
      const range = richApi.current?.range() ?? [writing.value.length, writing.value.length], at = writing.pending ?? common(writing.runs ?? [{ text: writing.value }], range[0], range[1]);
      return { kind: "caption", mode: "typing", convertible: false, colour: at.colour ?? st.colour ?? style.colour, count: 1, bold: !!(at.bold ?? st.bold), italic: !!(at.italic ?? st.italic), underline: !!(at.underline ?? st.underline),
        size: at.size ?? st.size ?? style.captionSize, align: st.align ?? "centre", attached: false, attachable: false, script: at.script, font: at.font ?? st.font ?? style.captionFont, fonts: fontList };
    }
    if (tool === "text" && !selection.size && !picked.size)
      return { kind: "caption", mode: "next", convertible: false, colour: textStyle.colour ?? style.colour, count: 1, bold: !!textStyle.bold, italic: !!textStyle.italic, underline: !!textStyle.underline, size: textStyle.size ?? style.captionSize, align: textStyle.align ?? "left", attached: false, attachable: false, font: textStyle.font ?? style.captionFont, fonts: fontList };
    // A whole reaction picked (as a double-click on its arrow picks it).
    const reaction = reactionPicked();
    if (reaction) return { kind: "reaction", grid: !!doc.grids?.some((g) => reaction.arrows.includes(g.arrow)), steps: reaction.arrows.length, structures: reaction.steps.filter((x) => x.kind === "structure").length, clean: reactionClean(reaction, arrows), mapped: reaction.atoms.some((i) => doc.atoms[i]?.map) };
    // A cycle picked (with its intermediates), when it is all that is picked.
    const mix = mixOf();
    const pickedCycle = (doc.cycles ?? []).find((c) => picked.has(c.id));
    if (pickedCycle && mix.kinds === 1) return { kind: "cycle", clockwise: pickedCycle.clockwise, steps: pickedCycle.nodes.length, centre: !!doc.captions?.some((c) => c.cycle?.cycle === pickedCycle.id && c.cycle.side === "centre") };
    // Different kinds of thing picked together (an arrow and a box, a caption and an atom, everything): what applies to
    // all of them.
    if (mix.kinds > 1) return { kind: "selection", count: mix.count, atoms: mix.atoms };
    // A TLC spot picked on its plate.
    const plate = spotPick && !selection.size && picked.size === 1 && picked.has(spotPick.plate) ? doc.shapes?.find((x) => x.id === spotPick.plate) : undefined, spot = plate?.tlc?.spots[spotPick!.index];
    if (plate && spot) {
      // The sizes shown are the sizes drawn, at the plate's scale.
      const t = tlcLayout(plate), { rx, ry } = t.size(spot);
      return { kind: "spot", style: spot.style ?? "filled", w: rx, h: ry, tail: (spot.tail ?? 0) * t.f, rf: !!spot.showRf, pt: style.bond };
    }
    // A table's lines, the alignment of the column last typed in (or of every column, when they share one), and its
    // lines' width.
    const tableContext = (sh: Shape) => {
      const cols = sh.table ? tableLayout(sh, cellWidth(sh), style.captionSize).cols : 0, aligns = Array.from({ length: cols }, (_, c) => sh.table?.align?.[c] ?? "centre");
      const cellAlign = lastCell?.id === sh.id ? aligns[lastCell.c] : aligns.every((a) => a === aligns[0]) ? aligns[0] : undefined;
      return { lines: linesOf(sh.table), cellAlign, weight: ((sh.table ? sh.table.weight : sh.width) ?? style.line) * scaleOf(sh), cell: lastCell?.id === sh.id };
    };
    // Shapes picked on their own.
    const pickedShapes = (doc.shapes ?? []).filter((x) => picked.has(x.id));
    if (!selection.size && pickedShapes.length && pickedShapes.length === picked.size) {
      const first = pickedShapes[0];
      return {
        kind: "shape", count: pickedShapes.length, shape: first.kind, dashed: !!first.dashed, colour: first.colour ?? (first.kind === "highlight" ? HIGHLIGHT : "#000000"), rgroup: pickedShapes.some((x) => x.rgroup),
        style: first.fill ?? (first.shadow ? "shadow" : first.dashed ? "dashed" : "plain"), side: first.side ?? "both", mark: first.mark ?? "", rf: !!first.tlc?.rf, ...tableContext(first), hide: first.tlc?.hide ?? [], shade: { ...SHADE, ...first.shade, pt: style.bond },
        ...(first.kind === "table" || first.kind === "tlc" ? { text: { bold: !!first.bold, italic: !!first.italic, underline: !!first.underline, font: first.font ?? style.captionFont, size: first.size ?? (first.kind === "tlc" ? style.captionSize * 0.8 : style.captionSize) } } : {}),
      };
    }
    // Arrows picked on their own.
    const pickedArrows = (doc.arrows ?? []).filter((a) => picked.has(a.id));
    if (!selection.size && pickedArrows.length && pickedArrows.length === picked.size)
      return {
        kind: "arrow", count: pickedArrows.length, arrow: pickedArrows[0].kind, curved: pickedArrows.some(curved), style: pickedArrows[0].style ?? "plain", orbital: pickedArrows[0].orbital,
        heads: pickedArrows.every(takesHeads), ...headsOf(pickedArrows[0]), head: pickedArrows[0].head ?? "solid",
        closed: pickedArrows[0].curve ? !!pickedArrows[0].curve.closed : undefined, fill: pickedArrows[0].fill ?? "none",
        // The width drawn (at the arrow's scale): a filled pen curve's outline is a hairline unless set (curveFill).
        width: (pickedArrows[0].width ?? (pickedArrows[0].curve?.closed && pickedArrows[0].fill ? 0.05 : style.line)) * scaleOf(pickedArrows[0]),
        // The sweep the curved ones share, if it is one on offer.
        sweep: SWEEPS.find((sw) => pickedArrows.filter(curved).every((a) => Math.abs(sweepOf(a.bend ?? 0) - sw) < 2)),
      };
    if (!selection.size && picked.size) {
      const cs = (doc.captions ?? []).filter((c) => picked.has(c.id)), c = cs[0];
      if (c) {
        const p = placed.find((x) => x.id === c.id), w = whole(c);
        return { kind: "caption", mode: "picked", colour: c.colour ?? style.colour, convertible: cs.length === 1 && namesLoaded && !!(nameToSmiles(c.text) || looksLikeSmiles(c.text) || suggestName(c.text, false)), count: cs.length, bold: !!w.bold, italic: !!w.italic, underline: !!w.underline, size: w.size ?? style.captionSize, align: c.align ?? "centre", attached: !!c.under, attachable: !c.under && !!p && !!structureAbove(anchorOf(p), 4) , font: w.font ?? style.captionFont, fonts: fontList };
      }
    }
    // A stoichiometry grid's cell picked.
    const pickedGrid = gridPick && !selection.size && !picked.size ? gridViews.find((v) => v.arrow === gridPick.arrow) : undefined, pickedCol = pickedGrid?.all.find((c) => c.key === gridPick!.key);
    if (pickedGrid && pickedCol) return { kind: "grid", product: pickedCol.product, limiting: pickedGrid.limiting === pickedCol.key, hidden: pickedGrid.hiding };
    if (!selection.size) return doc.atoms.length || doc.captions?.length || doc.arrows?.length || doc.shapes?.length ? { kind: "drawing", nameable, generic: genericSites(doc, doc.atoms.keys()) } : { kind: "empty" };
    // Atoms that are only in a drag (an Option-drag's copies, before they are kept) are not in the drawing yet.
    const ids = [...selection].filter((i) => i < doc.atoms.length);
    if (!ids.length) return { kind: "drawing", nameable };
    if (ids.length === 1) {
      const a = doc.atoms[ids[0]];
      // Its structure's and and or groups, and the lowest new one of each, for the stereo flag buttons.
      const centre = stereocentres(doc).includes(ids[0]), structure = centre ? fragments(doc).find((g) => g.includes(ids[0])) ?? [] : [];
      const groups = (kind: "&" | "or") => [...new Set([...structure.flatMap((i) => { const g = /^(&|or)(\d+)$/.exec(doc.atoms[i].enhanced ?? ""); return g && g[1] === kind ? [Number(g[2])] : []; }), nextGroup(doc, structure, kind)])].sort((p, q) => p - q);
      return { kind: "atom", text: labelText([ids[0]]), label: a.text ?? a.label, charge: a.charge ?? 0, terminal: neighbours(doc, ids[0]).length === 1, carbon: a.label === "C" && !a.text, centre, enhanced: a.enhanced, groups: centre ? { and: groups("&"), or: groups("or") } : undefined, halo: a.halo, fill: a.fill, numbered: !!a.number };
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
    const used = bondOrders(doc), hetero = ids.filter((i) => doc.atoms[i].label !== "C" && freePairs(doc, i, used[i]) > 0);
    const pairs = !hetero.length ? undefined : hetero.every((i) => (doc.atoms[i].pairs ?? 0) >= freePairs(doc, i, used[i])) ? "shown" as const : "hidden" as const;
    // Its stereocentres as a whole: absolute (no flags), racemic (all &1), relative (all or1), or a mix.
    const centres = stereocentres(doc, selection), flags = new Set(centres.map((i) => doc.atoms[i].enhanced ?? ""));
    const stereo = !centres.length ? undefined : flags.size > 1 ? "mixed" : flags.has("&1") ? "racemic" : flags.has("or1") ? "relative" : flags.has("") ? "absolute" : "mixed";
    // A 3D structure (Structure Perspective): drawn with depth, or flat.
    const solid = ids.some((i) => Math.abs(doc.atoms[i].location[2] ?? 0) > 1e-3);
    return { kind: "structure", text: labelText(ids), atoms: ids.length, generic: genericSites(doc, fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat()), structures: fragments(doc).filter((g) => g.some((i) => selection.has(i))).length, next: nextNumber(doc), nameable, pairs, stereo,
      ...(solid ? { depth: !ids.some((i) => doc.atoms[i].depth === false) } : {}), cip: fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat().every((i) => doc.atoms[i].cip), numbers: ids.every((i) => doc.atoms[i].number),
      // Aromatic rings drawn with circles, so the aromatic display action can name what it shows next.
      circles: fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat().some((i) => doc.atoms[i].circle),
      // The highlight and ring fill the selected atoms share, if they share one.
      halo: ids.every((i) => doc.atoms[i].halo === doc.atoms[ids[0]].halo) ? doc.atoms[ids[0]].halo : undefined,
      fill: ids.filter((i) => doc.atoms[i].fill).every((i) => doc.atoms[i].fill === doc.atoms[ids.find((k) => doc.atoms[k].fill) ?? 0].fill) ? doc.atoms[ids.find((k) => doc.atoms[k].fill) ?? 0]?.fill : undefined };
  };
  // The panel's context, worked out again only when something it reads changes: not on each frame of a drag or of
  // the Pen (the drawing and the captions' places change then, and the context follows them when what is shown is the
  // drawing again). While text is typed, the caret changes it too, so the panel works it out as it draws (see Actions
  // below).
  const settled = shown === doc;
  const panelContext = useMemo(() => (writing ? undefined : contextOf()), [doc, selection, picked, writing, tool, textStyle, spotPick, lastCell, namesLoaded, loaded, style, fontList, settled && drawing, settled && placed, gridPick, gridViews]); // eslint-disable-line react-hooks/exhaustive-deps
  // The formula and mass the panel shows (of the selection, or everything): only while it is open and shows them, and
  // only for the first three structures, as it shows no more.
  const facts = settings.actions && (panelContext?.kind === "drawing" || panelContext?.kind === "structure");
  const analysis = useMemo(() => (loaded && facts ? analyse(selection.size ? subset(doc, selection) : doc, 3) : undefined), [loaded, facts, doc, selection]);
  // The Properties panel's values, while it is open: for each structure in the selection (or the drawing), with
  // each structure's atoms in the drawing (for Add to drawing). While a box or lasso sweeps, the panel keeps the
  // values it has until the pointer stops for a moment or lets go, so it does not work them out on every move.
  const sweep = drag?.kind === "box" || drag?.kind === "lasso" ? drag.base : undefined; // the same for the whole sweep
  const [paused, setPaused] = useState<{ sweep: Set<number>; selection: Set<number> }>();
  useEffect(() => {
    if (!sweep) return;
    const t = setTimeout(() => setPaused({ sweep, selection }), 250);
    return () => clearTimeout(t);
  }, [sweep, selection]);
  const propertySelection = !sweep ? selection : paused?.sweep === sweep ? paused.selection : undefined;
  const lastProperties = useRef<{ atoms: number[][]; values: PropertyValues }>(undefined);
  const properties = useMemo(() => {
    if (!loaded || !settings.properties) return undefined;
    if (!propertySelection) return lastProperties.current;
    const ids = propertySelection.size ? [...propertySelection].filter((i) => i < doc.atoms.length).sort((a, b) => a - b) : doc.atoms.map((_, i) => i);
    const base = propertySelection.size ? subset(doc, propertySelection) : doc, groups = fragments(base), found = structures(base, groups);
    if (!found) return undefined;
    const kept = groups.map((g, k) => ({ atoms: g.map((i) => ids[i]), s: found[k] })).filter((x) => x.s).slice(0, 12);
    // Octet's own calculators, once for each structure's values; pKa sites above 13 (alcohols, amides) are left out.
    const calc = (s: Structure, g: Graph) => {
      if (!calculated.has(s)) { const p = calculate(g); calculated.set(s, { ...p, pka: p.pka.filter((x) => x.pka < 13), logS: s.logP !== undefined ? logS(s.logP, s.weight, p) : undefined }); }
      return calculated.get(s);
    };
    return { atoms: kept.map((x) => x.atoms), values: propertyValues(kept.map((x) => x.s!), calc) };
  }, [loaded, settings.properties, doc, propertySelection]);
  lastProperties.current = properties;
  // The Spectrum panel's structure (the first in the selection, or the drawing's largest), its predicted spectrum
  // once the shift tables are loaded, and which drawn atom each of the prediction's atoms is.
  const [spectrum, setSpectrum] = useState<Nucleus>();
  // The structure the spectrum is of, kept from when it opened (the first selected, or the drawing's largest), so the
  // selection can go and the structure's highlights show. Edits that renumber atoms fall back to the largest.
  const [nmrTarget, setNmrTarget] = useState<number[]>();
  function openSpectrum(nucleus: Nucleus) {
    const groups = fragments(doc), pick = (selection.size ? groups.find((g) => g.some((i) => selection.has(i))) : undefined) ?? [...groups].sort((a, b) => b.length - a.length)[0];
    setNmrTarget(pick);
    setSpectrum(nucleus);
    setSelection(new Set());
    setPicked(new Set());
  }
  const [nmrTables, setNmrTables] = useState(false);
  const [nmrPoint, setNmrPoint] = useState<number[]>();
  useEffect(() => { if (spectrum && !nmrTables) void nmrReady().then(() => setNmrTables(true)); }, [spectrum, nmrTables]);
  const nmr = useMemo(() => {
    if (!spectrum || !loaded || !doc.atoms.length) return undefined;
    const groups = fragments(doc), kept = nmrTarget && groups.find((g) => g.length === nmrTarget.length && g.every((i) => nmrTarget.includes(i)));
    const pick = kept ?? [...groups].sort((a, b) => b.length - a.length)[0];
    const ids = [...pick].sort((a, b) => a - b), { mol, from } = expandWithOrigins(subset(doc, new Set(ids))), g = graphOf(mol);
    return { prediction: g && nmrTables ? predict(g, spectrum) : undefined, toDoc: from.map((i) => ids[i]) };
  }, [spectrum, loaded, doc, nmrTarget, nmrTables]);
  // The prediction's atoms lit by pointing at an atom on the canvas, and the drawn atoms lit from the spectrum.
  const nmrLit = (atom?: number) => new Set(nmr && atom !== undefined ? nmr.toDoc.flatMap((d, k) => (d === atom ? [k] : [])) : []);
  const nmrMarks = new Set(nmr && nmrPoint ? nmrPoint.map((k) => nmr.toDoc[k]) : []);
  // Each drawn atom's predicted shifts, shown beside it while the panel is open.
  const nmrShifts = new Map<number, number[]>(), nmrQuality = new Map<number, string>();
  const stereo = useMemo(() => { const m = exporting ?? doc; return loaded && m.atoms.some((a) => a.cip) ? stereoLabels(m) : undefined; }, [loaded, doc, exporting]);
  const ringsOf = useMemo(() => (spectrum || doc.atoms.some((a) => a.cip || a.number) ? drawnRings(shown) : []), [spectrum, shown, doc]);
  // Opening the panel scrolls the canvas up if the panel would cover the structure (again once the spectrum is in,
  // as the panel grows).
  useEffect(() => {
    if (!spectrum || !nmr) return;
    const panel = document.querySelector(".spectrum")?.getBoundingClientRect(), box = svg.current?.getBoundingClientRect();
    const low = Math.min(...[...new Set(nmr.toDoc)].map((i) => pos(doc, i)[1]));
    if (!panel || !box || !Number.isFinite(low)) return;
    const view = views.get(), over = view.y - low * L * view.zoom + 2 * L * view.zoom - (panel.top - box.top);
    if (over > 0) setView((v) => ({ ...v, y: v.y - over }));
  }, [spectrum, !!nmr?.prediction, settings.nmrDetails]); // eslint-disable-line react-hooks/exhaustive-deps
  // Properties opens along the bottom too, and scrolls the canvas the same way so its structures stay in view.
  useEffect(() => {
    if (!settings.properties) return;
    const panel = document.querySelector(".properties:not(.stacked)")?.getBoundingClientRect(), box = svg.current?.getBoundingClientRect();
    const atoms = selection.size ? [...selection] : doc.atoms.map((_, i) => i), low = Math.min(...atoms.filter((i) => i < doc.atoms.length).map((i) => pos(doc, i)[1]));
    if (!panel || !box || !Number.isFinite(low)) return;
    const view = views.get(), over = view.y - low * L * view.zoom + 2 * L * view.zoom - (panel.top - box.top);
    if (over > 0) setView((v) => ({ ...v, y: v.y - over }));
  }, [settings.properties]); // eslint-disable-line react-hooks/exhaustive-deps
  for (const s of nmr?.prediction?.signals ?? []) for (const d of new Set(s.atoms.map((k) => nmr!.toDoc[k]))) { nmrShifts.set(d, [...(nmrShifts.get(d) ?? []), s.shift]); nmrQuality.set(d, quality(s, spectrum!)); }
  // Where each predicted shift goes on the canvas (px): in a gap between the atom's bonds, out of its rings (or away
  // from the atoms within two bonds), clear of its own label and of the shift labels already placed.
  function shiftLabels() {
    const out: { atom: number; x: number; y: number; anchor: "start" | "middle" | "end"; text: string }[] = [], taken: number[][] = [];
    for (const [i, shifts] of nmrShifts) {
      if (i >= shown.atoms.length) continue;
      const text = [...shifts].sort((a, b) => b - a).map((v) => v.toFixed(spectrum === "1H" ? 2 : 1)).join(", ");
      out.push({ atom: i, ...besideAtom(i, text.length * 5.2, 10, taken), text });
    }
    return out;
  }
  // A label's place beside an atom (px): in a gap between its bonds, out of its rings (or away from the atoms within
  // two bonds), clear of the atom's own label and of the boxes in `taken` (the chosen box is added to it).
  function besideAtom(i: number, w: number, h: number, taken: number[][], gap = 0.62) {
    const at = pos(shown, i), bonded = shown.bonds.filter((b) => b.atoms.includes(i)).map((b) => (b.atoms[0] === i ? b.atoms[1] : b.atoms[0]));
    const mine = ringsOf.filter((r) => r.includes(i)), two = new Set(bonded.flatMap((k) => shown.bonds.filter((b) => b.atoms.includes(k)).flatMap((b) => b.atoms)));
    two.delete(i);
    const around = (mine.length ? mine.flat() : [...two]).map((k) => pos(shown, k));
    const away = around.length ? Math.atan2(at[1] - around.reduce((s, q) => s + q[1], 0) / around.length, at[0] - around.reduce((s, q) => s + q[0], 0) / around.length) : Math.PI / 2;
    const angles = bonded.map((k) => Math.atan2(pos(shown, k)[1] - at[1], pos(shown, k)[0] - at[0])).sort((a, b) => a - b);
    // Each gap's middle, best first: wider gaps, then those facing away.
    const gaps = angles.length === 0 ? [{ m: Math.PI / 2, score: 0 }] : angles.length === 1 ? [{ m: angles[0] + Math.PI, score: 1 }, { m: angles[0] + Math.PI / 2, score: 0 }, { m: angles[0] - Math.PI / 2, score: 0 }]
      : angles.map((a, k) => { const next = k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI, m = (a + next) / 2; return { m, score: next - a + 0.3 * Math.cos(m - away) }; });
    gaps.sort((a, b) => b.score - a.score);
    const box = drawing.label[i], r = box ? Math.max(gap * L, Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 + 0.25 * L) : gap * L;
    const place = (m: number) => {
      const ux = Math.cos(m), uy = Math.sin(m), x = at[0] * L + ux * r, y = -(at[1] * L + uy * r), anchor = ux > 0.4 ? "start" as const : ux < -0.4 ? "end" as const : "middle" as const;
      const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      return { x, y, anchor, rect: [left, y - h / 2, left + w, y + h / 2] };
    };
    const free = gaps.map((g) => place(g.m)).find((c) => !taken.some((b) => c.rect[0] < b[2] && c.rect[2] > b[0] && c.rect[1] < b[3] && c.rect[3] > b[1])) ?? place(gaps[0].m);
    taken.push(free.rect);
    return { x: free.x, y: free.y, anchor: free.anchor };
  }
  // Show Stereochemistry: (R) and (S) beside stereocentres and (E) and (Z) beside double bonds, in structures that
  // have it on, in the caption font a little smaller, italic as IUPAC writes them.
  // Atom numbers go first, upright, and the stereo labels find room around them.
  function stereoMarks() {
    // Each in its atom's scale (its bond's mean for E and Z).
    const out: { key: string; x: number; y: number; anchor: "start" | "middle" | "end"; text: string; colour?: string; upright?: boolean; size: number }[] = [], taken: number[][] = [], base = style.captionSize * pt * 0.8;
    shown.atoms.forEach((a, i) => { const size = base * scaleOf(a); if (a.number) out.push({ key: `n${i}`, ...besideAtom(i, a.number.length * size * 0.55, size, taken, 0.55 * scaleOf(a)), text: a.number, colour: a.colour, upright: true, size }); });
    if (!stereo) return out;
    stereo.atoms.forEach((c, i) => {
      if (!c || !shown.atoms[i]?.cip) return;
      const text = `(${c})`, size = base * scaleOf(shown.atoms[i]);
      out.push({ key: `a${i}`, ...besideAtom(i, text.length * size * 0.55, size, taken, 0.55 * scaleOf(shown.atoms[i])), text, colour: shown.atoms[i].colour, size });
    });
    stereo.bonds.forEach((c, k) => {
      const b = shown.bonds[k];
      if (!c || !b || !shown.atoms[b.atoms[0]]?.cip) return;
      // Beside the middle of the double bond, on the side with fewer neighbours.
      const [p, q] = b.atoms.map((i) => pos(shown, i)), mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nx = -(q[1] - p[1]) / d, ny = (q[0] - p[0]) / d;
      const side = shown.bonds.filter((o) => o !== b && o.atoms.some((i) => b.atoms.includes(i))).map((o) => { const far = pos(shown, b.atoms.includes(o.atoms[0]) ? o.atoms[1] : o.atoms[0]); return Math.sign((far[0] - mx) * nx + (far[1] - my) * ny); }).reduce((s, v) => s + v, 0) > 0 ? -1 : 1;
      const f = (scaleOf(shown.atoms[b.atoms[0]]) + scaleOf(shown.atoms[b.atoms[1]])) / 2;
      out.push({ key: `b${k}`, x: (mx + side * nx * 0.5 * f) * L, y: -(my + side * ny * 0.5 * f) * L, anchor: "middle", text: `(${c})`, colour: b.colour, size: base * f });
    });
    return out;
  }
  // The problem marks: a red ring round each atom, bond (at its middle) or pair of brackets with a problem. Pointing at
  // one shows what is wrong, as ChemDraw's tooltip on a warning does.
  function problemMarks() {
    const at = new Map<string, { x: number; y: number; r: number; w?: number; h?: number; text: string[] }>();
    for (const p of found) {
      let mark: { key: string; x: number; y: number; r: number; w?: number; h?: number } | undefined;
      if (p.atom !== undefined && shown.atoms[p.atom]) { const [x, y] = pos(shown, p.atom); mark = { key: `a${p.atom}`, x: x * L, y: -y * L, r: 0.42 * L }; }
      else if (p.bond !== undefined && shown.bonds[p.bond]) {
        const [q, r] = shown.bonds[p.bond].atoms.map((i) => pos(shown, i));
        mark = { key: `b${p.bond}`, x: ((q[0] + r[0]) / 2) * L, y: (-(q[1] + r[1]) / 2) * L, r: 0.5 * L };
      } else if (p.shape !== undefined) {
        const sh = shown.shapes?.find((x) => x.id === p.shape), pad = 0.15;
        if (sh) mark = { key: `s${p.shape}`, x: (Math.min(sh.from[0], sh.to[0]) - pad) * L, y: -(Math.max(sh.from[1], sh.to[1]) + pad) * L, r: 0.2 * L, w: (Math.abs(sh.to[0] - sh.from[0]) + 2 * pad) * L, h: (Math.abs(sh.to[1] - sh.from[1]) + 2 * pad) * L };
      }
      if (!mark) continue;
      const kept = at.get(mark.key);
      if (kept) kept.text.push(p.message); else at.set(mark.key, { ...mark, text: [p.message] });
    }
    return [...at.entries()].map(([key, m]) => (m.w !== undefined
      ? <rect key={key} className="problem-mark" x={m.x} y={m.y} width={m.w} height={m.h} rx={m.r} vectorEffect="non-scaling-stroke"><title>{m.text.join("\n")}</title></rect>
      : <circle key={key} className="problem-mark" cx={m.x} cy={m.y} r={m.r} vectorEffect="non-scaling-stroke"><title>{m.text.join("\n")}</title></circle>));
  }
  // Check Structure (ChemDraw's Possible Error in Drawing): the problems one at a time, with Stop, Ignore and Ignore
  // All. Ignore goes to the next problem; after the last one, and on Ignore All, `then` runs (the copy or export that
  // asked for the check); Stop runs nothing. With no problems `then` runs at once, and Check Structure itself says so.
  // asked: Check Structure itself, which also selects each problem's atoms, bond or brackets as it shows it.
  function checkThen(list: Problem[], then: () => void, asked = false) {
    if (!list.length) { if (asked) setNotice("Octet found no problems."); return then(); }
    if (asked) showProblem(list[0]);
    setChecking({ list, at: 0, then, select: asked });
  }
  // Settings > Warnings > Check structure when copying or exporting: the selection's problems (or the drawing's)
  // first, then the copy or export.
  const checkFirst = (then: () => void) => (settings.checkCopy ? checkThen(selection.size || picked.size ? subsetProblems() : allProblems(), then) : then());
  // Whether a selected atom, a bond between selected atoms or picked brackets have their warnings hidden (for Show
  // warnings).
  const hiddenHere = () => [...selection].some((i) => doc.atoms[i]?.ignoreWarnings) || doc.bonds.some((b) => b.ignoreWarnings && selection.has(b.atoms[0]) && selection.has(b.atoms[1]))
    || !!doc.shapes?.some((x) => x.ignoreWarnings && picked.has(x.id));
  function showProblem(p: Problem) {
    if (p.atom !== undefined) { setSelection(new Set([p.atom])); setPicked(new Set()); }
    else if (p.bond !== undefined && doc.bonds[p.bond]) { setSelection(new Set(doc.bonds[p.bond].atoms)); setPicked(new Set()); }
    else if (p.shape !== undefined) { setSelection(new Set()); setPicked(new Set([p.shape])); }
  }
  // Peak colours are the highlights of the peak's atoms, so the colours are part of the drawing: saved, undone,
  // printed and pasted with it. Colour peaks gives every signal its own colour; Add key writes the coloured shifts
  // under the structure.
  const nmrColours = (nmr?.prediction?.signals ?? []).map((s) => doc.atoms[nmr!.toDoc[s.atoms[0]]]?.halo);
  const withHalos = (m: Mol, colour: (k: number) => string | undefined, only?: number): Mol => {
    if (!nmr?.prediction) return m;
    const to = new Map<number, string | undefined>();
    nmr.prediction.signals.forEach((s, k) => { if (only === undefined || only === k) for (const a of s.atoms) to.set(nmr.toDoc[a], colour(k)); });
    return { ...m, atoms: m.atoms.map((a, i) => (to.has(i) ? { ...a, halo: to.get(i) } : a)) };
  };
  const haloSignals = (colour: (k: number) => string | undefined, only?: number) => set(withHalos(doc, colour, only), true);
  function addKey() {
    const p = nmr?.prediction;
    if (!p) return;
    const coloured = p.signals.map((s, k) => ({ s, c: nmrColours[k] })).filter((x) => x.c);
    const rows = coloured.length ? coloured : p.signals.map((s, k) => ({ s, c: PEAK_COLOURS[k % PEAK_COLOURS.length] }));
    let m = coloured.length ? doc : withHalos(doc, (k) => PEAK_COLOURS[k % PEAK_COLOURS.length]);
    const head = acsText({ ...p, signals: [] }, settings.nmrMhz, settings.nmrSolvent).replace(/ δ \.$/, ", δ (ppm)");
    const runs: TextRun[] = [{ text: head }];
    for (const { s, c } of [...rows].sort((a, b) => b.s.shift - a.s.shift)) {
      runs.push({ text: "\n" }, { text: "● ", colour: c });
      runs.push({ text: p.nucleus === "1H" ? `${s.shift.toFixed(2)} (${multiplicity(s)}${s.couplings.length && !s.broad && multiplicity(s) !== "m" ? `, J = ${s.couplings.map((x) => x.j.toFixed(1)).join(", ")} Hz` : ""}, ${s.nuclei}H)` : `${s.shift.toFixed(1)}${s.nuclei > 1 ? ` (${s.nuclei}C)` : ""}` });
    }
    const atoms = [...new Set(nmr!.toDoc)];
    m = addCaption(m, { text: plainOf(normalise(runs)), x: 0, y: 0, under: atoms, runs: normalise(runs) })[0];
    set(m, true);
  }
  // Add to drawing: the chosen rows as a caption under each structure, the formula's counts as subscripts.
  function addProperties() {
    if (!properties) return;
    const chosen = PROPERTY_ROWS.flat().map((r) => r.key).filter((k) => settings.propertyRows.includes(k));
    const rows = properties.values.flat().filter((r) => chosen.includes(r.key));
    let m = doc;
    properties.atoms.forEach((atoms, k) => {
      const runs: TextRun[] = [];
      rows.forEach((r, i) => {
        const v = r.values[k];
        if (v === undefined) return;
        if (runs.length) runs.push({ text: "\n" });
        runs.push({ text: `${r.name}: ` });
        if (r.key === "formula") for (const [, letters, digits] of v.matchAll(/(\D*)(\d*)/g)) { if (letters) runs.push({ text: letters }); if (digits) runs.push({ text: digits, script: "sub" }); }
        else runs.push({ text: v });
        void i;
      });
      if (!runs.length) return;
      const clean = normalise(runs);
      m = addCaption(m, { text: plainOf(clean), x: 0, y: 0, under: atoms, ...(styled(clean) ? { runs: clean } : {}) })[0];
    });
    if (m !== doc) set(m);
  }
  // Chemical warnings (View > Show Chemical Warnings), of the kinds switched on in Settings > Warnings. The
  // stereochemistry warnings need Indigo's facts, read only when one of their kinds is on.
  const warnOn = (t: WarningType) => settings.warningTypes[t] ?? WARNING_TYPES.find((w) => w.id === t)!.on;
  const stereoWarnings = (["unspecified", "ambiguous", "enhanced", "between", "backwards"] as const).some(warnOn);
  const stereoOf = (m: Mol) => { try { return loaded && stereoWarnings ? stereoFacts(m, warnOn("enhanced")) : undefined; } catch { return undefined; } };
  const found = useMemo(() => (exporting || !settings.warnings ? [] : problems(doc, stereoOf(doc)).filter((p) => warnOn(p.type))), [doc, exporting, settings.warnings, settings.warningTypes, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every problem, those on objects with their warnings hidden too (for Check Structure), of the kinds switched on.
  const allProblems = () => problems(doc, stereoOf(doc), true).filter((p) => warnOn(p.type));
  // The problems on what is selected: its atoms, the bonds between them, and the picked shapes.
  const selectedOf = (list: Problem[]) => list.filter((p) => (p.atom !== undefined ? selection.has(p.atom) : p.bond !== undefined ? doc.bonds[p.bond]?.atoms.every((i) => selection.has(i)) : picked.has(p.shape!)));
  const subsetProblems = () => selectedOf(allProblems());
  // The drawing's own colours (a ChemDraw file's, say) join the Colour row after Octet's and the user's, as ChemDraw's
  // Color menu lists each document's colours. A colour stays in the row until another drawing opens.
  const drawingColours = useRef<string[]>([]);
  const docColours = useMemo(() => {
    const known = new Set([...COLOURS.map(([, hex]) => hex), ...settings.palette.map((c) => c.hex)].map((h) => h.toLowerCase()));
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== "object") return;
      for (const [k, x] of Object.entries(v)) {
        if (k === "style") continue;
        if (k === "colour" && typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x)) { const h = x.toLowerCase(); if (!known.has(h) && !drawingColours.current.includes(h)) drawingColours.current.push(h); }
        else walk(x);
      }
    };
    walk(doc);
    return drawingColours.current.filter((h) => !known.has(h)).slice(0, 24).map((hex) => ({ name: hex.toUpperCase(), hex }));
  }, [doc, settings.palette]);
  const untidy = useMemo(() => messy(doc, selection), [doc, selection]);
  // Text the panel asked to copy; the copy handler uses it instead of SMILES.
  const copyText = useRef<string>(undefined);

  // The key to show beside an action: menu shortcuts, then the user's shortcut table.
  const MENU_KEYS: Record<string, string> = {
    invert_selection: `⇧${MOD}I`, clean_reaction: `⇧${MOD}X`, paste_hint: `${MOD}V`, clean_up: `⇧${MOD}K`, flip_h: `⇧${MOD}H`, flip_v: `⇧${MOD}V`, select_all: `${MOD}A`, zoom_fit: `${MOD}/`, copy_smiles: `⌥${MOD}C`, copy_mol: `⌥${MOD}O`, copy_mol2000: `⇧⌥${MOD}O`, copy: `${MOD}C`, delete: "⌫",
    structure_to_name: `⌥${MOD}N`, bring_front: `${MOD}[`, send_back: `${MOD}]`, "caption.align.justify": `⇧${MOD}J`,
    search_reaxys: `⌥${MOD}F`, search_reaxys_exact: `⇧⌥${MOD}F`, search_pubchem: `⌥${MOD}U`, search_pubchem_sub: `⇧⌥${MOD}U`,
    settings: `${MOD},`, name_to_structure: `⇧${MOD}N`, "caption.bold": `${MOD}B`, "caption.italic": `${MOD}I`, "caption.underline": `${MOD}U`, "caption.sub": `${MOD}−`, "caption.super": `${MOD}+`, "caption.plain": `${MOD}T`, "caption.formula": `${MOD}F`, "caption.edit": keyLabel("enter"),
  };
  const hint = (command: string) => {
    // A menu command's shortcut as the user has it (Settings), else as the menu has it.
    const own = menuReady ? keymap(settings.keys)[`menu.${command}`] : undefined;
    if (own) return own[0] ? keyLabel(own[0]) : undefined;
    if (MENU_KEYS[command]) return platformLabel(MENU_KEYS[command]);
    if (MENU_NAMES[command]?.[1]) return platformLabel(MENU_NAMES[command][1]);
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
  // variant (templates too), and the Settings modules. Each shows its shortcut where it has one. The aromatic display
  // names what it shows next for the structures it acts on, worked out only while the palette is open.
  const MENU_NAMES: Record<string, [string, string | undefined, React.ReactNode]> = {
    copy_mol: ["Copy as MOL", `⌥${MOD}O`, <CopySimple size={18} />], copy_mol2000: ["Copy as MOL V2000", `⇧⌥${MOD}O`, <CopySimple size={18} />],
    new: ["New drawing", `${MOD}N`, <FilePlus size={18} />], open: ["Open…", `${MOD}O`, <FolderOpen size={18} />], import: ["Import a structure…", "", <FileArrowDown size={18} />],
    save: ["Save", `${MOD}S`, <FloppyDisk size={18} />], save_as: ["Save as…", `⇧${MOD}S`, <FloppyDiskBack size={18} />],
    export: ["Export…", EXPORT_KEYS, <ExportIcon size={18} />], print: ["Print…", `${MOD}P`, <Printer size={18} />], page_setup: ["Page setup…", `⇧${MOD}P`, <FileDashed size={18} />],
    about: ["About Octet", "", <Info size={18} />], atom_properties: ["Atom properties…", "", <Faders size={18} />],
    bond_properties: ["Bond properties…", "", <Faders size={18} />], bracket_properties: ["Bracket properties…", "", <Faders size={18} />], rlogic: ["R-Logic query…", "", <Faders size={18} />],
    add_multicentre: ["Add multi-centre attachment", "", <Asterisk size={18} />], add_variable: ["Add variable attachment", "", <AsteriskSimple size={18} />],
    define_rgroup: ["Make an R-group definition", "", <BracketsSquare size={18} />], expand_generic: ["Expand generic structure", "", <SquaresFour size={18} />], atom_numbers: ["Show atom numbers", "", <Hash size={18} />],
    expand_label: ["Expand label", "", <ArrowsOutSimple size={18} />], contract_label: ["Contract label", "", <ArrowsInSimple size={18} />], stoichiometry: ["Analyse stoichiometry", "", <Table size={18} />],
    undo: ["Undo", `${MOD}Z`, <ArrowCounterClockwise size={18} />], redo: ["Redo", `${MOD}Y`, <ArrowClockwise size={18} />], invert_selection: ["Invert selection", `⇧${MOD}I`, <SelectionInverse size={18} />], clean_reaction: ["Clean up reaction", `⇧${MOD}X`, <MagicWand size={18} />],
    clean_reaction_augmented: ["Augmented clean up reaction", "", <MagicWand size={18} />],
    map_reaction: ["Map atoms", "", <span className="glyph-text">A→A</span>], clear_reaction_map: ["Clear atom map", "", <X size={18} />],
    interpretation: [settings.interpretation ? "Hide reaction interpretation" : "Show reaction interpretation", "", <Flask size={18} />],
    mirror_h: ["Flip horizontal", "", <FlipHorizontal size={18} />], mirror_v: ["Flip vertical", "", <FlipVertical size={18} />],
    properties: [settings.properties ? "Hide the Properties panel" : "Show the Properties panel", "", <Flask size={18} />], aromatic_display: [commandsOpen && (selection.size ? fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat() : doc.atoms.map((_, i) => i)).some((i) => doc.atoms[i].circle) ? "Show Kekulé bonds" : "Show aromatic circles", `⌥${MOD}K`, <Circle size={18} />], show_stereo: ["Show stereochemistry", "", <span className="glyph-text">R/S</span>], predict_1h: ["Predict ¹H-NMR shifts", "", <span className="glyph-text">¹H</span>], predict_13c: ["Predict ¹³C-NMR shifts", "", <span className="glyph-text">¹³C</span>], structure_perspective: ["Structure perspective", `⌥${MOD}S`, <Cube size={18} />], flatten: ["Flatten", "", <Square size={18} />],
    rotate_dialog: ["Rotate…", `${MOD}R`, <Angle size={18} />], scale_dialog: ["Scale…", `${MOD}K`, <Resize size={18} />],
    group: ["Group", `${MOD}G`, <BoundingBox size={18} />], ungroup: ["Ungroup", `⇧${MOD}G`, <SelectionSlash size={18} />], group_integral: ["Pick as one", "", <LinkSimple size={18} />],
    arrange_left: ["Align left edges", `⌥⇧${MOD}L`, <AlignLeft size={18} />], arrange_centre: ["Align left-right centres", `⌥⇧${MOD}C`, <AlignCenterHorizontal size={18} />],
    arrange_right: ["Align right edges", `⌥⇧${MOD}R`, <AlignRight size={18} />], arrange_top: ["Align top edges", `⌥⇧${MOD}T`, <AlignTop size={18} />],
    arrange_middle: ["Align top-bottom centres", `⌥⇧${MOD}M`, <AlignCenterVertical size={18} />], arrange_bottom: ["Align bottom edges", `⌥⇧${MOD}B`, <AlignBottom size={18} />],
    arrange_across: ["Distribute horizontally", `⌥⇧${MOD}H`, <ArrowsOutLineHorizontal size={18} />], arrange_down: ["Distribute vertically", `⌥⇧${MOD}V`, <ArrowsOutLineVertical size={18} />], select_all: ["Select all", `${MOD}A`, <SelectionAll size={18} />],
    clean_up: ["Clean up structure", `⇧${MOD}K`, <MagicWand size={18} />], flip_h: ["Rotate 180° horizontal", `⇧${MOD}H`, <ArrowsLeftRight size={18} />], flip_v: ["Rotate 180° vertical", `⇧${MOD}V`, <ArrowsDownUp size={18} />],
    zoom_in: ["Magnify", `⇧${MOD}>`, <MagnifyingGlassPlus size={18} />], zoom_out: ["Reduce", `⇧${MOD}<`, <MagnifyingGlassMinus size={18} />],
    zoom_actual: ["Actual size", `${MOD}\\`, <FrameCorners size={18} />], zoom_fit: ["Fit to window", `${MOD}/`, <CornersOut size={18} />],
    name_to_structure: ["Convert name to structure", `⇧${MOD}N`, <AtomIcon size={18} />],
    check_structure: ["Check structure", "", <CheckCircle size={18} />], stereo_clear: ["Clear enhanced stereochemistry", "", <TagSimple size={18} />],
    stereo_abs: ["Mark as absolute", "", <TagSimple size={18} />], stereo_or: ["Create or group", "", <TagSimple size={18} />], stereo_and: ["Create and group", "", <TagSimple size={18} />],
    snap: [settings.snap ? "Turn snapping off" : "Turn snapping on", undefined, <MagnetStraight size={18} />],
    grid: [guides.grid ? "Hide grid" : "Show grid", `${MOD}'`, <GridFour size={18} />],
    snap_grid: [settings.snapGrid ? "Turn grid snapping off" : "Turn grid snapping on", `⇧${MOD}'`, <GridFour size={18} />],
    rulers: [guides.rulers ? "Hide rulers" : "Show rulers", `${MOD};`, <Ruler size={18} />],
    crosshair: [guides.crosshair ? "Hide crosshair" : "Show crosshair", `⌥${MOD}X`, <CrosshairSimple size={18} />],
    warnings: [settings.warnings ? "Hide chemical warnings" : "Show chemical warnings", undefined, <Warning size={18} />],
    actions: [settings.actions ? "Hide the Actions panel" : "Show the Actions panel", undefined, <SlidersHorizontal size={18} />],
    text_bold: ["Bold", `${MOD}B`, <TextB size={18} />], text_italic: ["Italic", `${MOD}I`, <TextItalic size={18} />], text_underline: ["Underline", `${MOD}U`, <TextUnderline size={18} />],
    align_left: ["Flush left", `⇧${MOD}L`, <TextAlignLeft size={18} />], align_centre: ["Centre text", `⇧${MOD}C`, <TextAlignCenter size={18} />], align_right: ["Flush right", `⇧${MOD}R`, <TextAlignRight size={18} />],
    align_justify: ["Justified", `⇧${MOD}J`, <TextAlignJustify size={18} />],
    font_other: ["Other font…", "", <TextAa size={18} />], size_other: ["Other size…", "", <Ruler size={18} />], line_spacing: ["Line spacing…", "", <Paragraph size={18} />],
    bring_front: ["Bring to front", `${MOD}[`, <StackSimple size={18} />], send_back: ["Send to back", `${MOD}]`, <Stack size={18} />],
    ...(settings.onlineSearch ? {
      search_reaxys: ["Search Reaxys", `⌥${MOD}F`, <SearchGlyph letter="R" />], search_reaxys_exact: ["Search Reaxys for exact structure", `⇧⌥${MOD}F`, <SearchGlyph letter="R" />],
      search_pubchem: ["Search PubChem", `⌥${MOD}U`, <SearchGlyph letter="P" />], search_pubchem_sub: ["Search PubChem for substructures", `⇧⌥${MOD}U`, <SearchGlyph letter="P" />],
    } as Record<string, [string, string, React.ReactNode]> : {}),
  };
  const paletteCommands = (): Command[] => {
    const toolKey = (id: string) => { const k = keymap(settings.keys)[id]?.[0]; return k ? keyLabel(k) : undefined; };
    const pick = (t: Tool, variant?: [string, string]) => () => { if (variant) setSettings((s) => ({ ...s, variants: { ...s.variants, [variant[0]]: variant[1] } })); setTool(t); };
    const variants = (t: Tool, slot: string, list: [string, string, React.ReactNode][], group: string, words = ""): Command[] =>
      list.map(([kind, name, icon]) => ({ id: `${t}:${kind}`, name, group, icon, words, run: pick(t, [slot, kind]) }));
    // A menu command that is also one of the selection's actions shows once, as the action.
    const acts = actionItems(contextOf(), untidy, hiddenHere(), selectedOf(found).length, settings.onlineSearch), acted = new Set(acts.map((i) => i.command));
    return [
      ...acts.map((i) => ({ id: `action:${i.command}`, name: i.name, group: "Actions", icon: i.icon, keys: hint(i.command), run: () => runAction(i.command) })),
      ...Object.entries(MENU_NAMES).filter(([id]) => commands.current[id] && !acted.has(id)).map(([id, [name, , icon]]) => ({ id: `menu:${id}`, name, group: "Commands", keys: hint(id), icon, run: () => commands.current[id]() })),
      ...purposeList.map((p) => ({ id: `new:${p.id}`, name: `New ${p.name}`, group: "Commands", words: "new drawing purpose", icon: <FilePlus size={18} />, run: () => newDrawing(p.id) })),
      ...purposeList.map((p) => ({ id: `for:${p.id}`, name: `For ${p.name}`, group: "Document", words: "purpose size page scale", icon: <FileText size={18} />, run: () => applyPurpose(p.id) })),
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
      ...([["document", "Document settings", <FileText size={18} />], ["keys", "Keyboard shortcuts", <Keyboard size={18} />], ["files", "Import and export settings", <ArrowsDownUp size={18} />], ["warnings", "Warnings settings", <Warning size={18} />]] as [ModuleId, string, React.ReactNode][])
        .map(([id, name, icon]) => ({ id: `settings:${id}`, name, group: "Settings", icon, run: () => setSettingsOpen(id) })),
      { id: "settings:open", name: "Settings", group: "Settings", keys: `${MOD},`, icon: <GearSix size={18} />, run: () => commands.current.settings() },
    ];
  };
  // A typed name (spelling mended) or SMILES, as a command that draws it.
  const drawCommand = (q: string): Command | undefined => {
    const text = q.trim();
    if (text.length < 2) return undefined;
    const found = structureOrSuggestion(text);
    if (!found) return undefined;
    const { frag, name: shown } = found;
    return { id: `draw:${shown}`, name: `Draw ${shown}`, group: "Structure", icon: <TemplateGlyph mol={frag} />, run: () => { place(frag); if (structureFor(shown)) rememberName(shown, frag); } };
  };

  // Runs an action from the panel on the selected atom, bond or atoms.
  function runAction(command: string) {
    const ids = [...selection];
    if (commands.current[command]) return commands.current[command]();
    // The Actions panel's Scale field: the selection takes that scale with its labels and lines, about its middle; when
    // its parts differ, each structure, group and object takes it about its own middle.
    if (command.startsWith("scale.")) {
      const v = Number(command.slice(6)) / 100, now = selectionScale(), middles = captionMiddles();
      if (!(v > 0) || now === undefined) return;
      if (now !== null) return set(scaledParts(doc, selection, picked, [v / now, v / now], selectionMiddle(), true, middles), true);
      let m = doc;
      for (const t of things()) {
        const own = [...t.atoms.map((i) => doc.atoms[i]), ...[...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].filter((x) => t.items.includes(x.id))].map(scaleOf).sort((a, b) => a - b);
        if (!own.length) continue;
        const k = v / own[Math.floor(own.length / 2)];
        m = scaledParts(m, new Set(t.atoms), new Set(t.items), [k, k], [(t.box[0] + t.box[2]) / 2, (t.box[1] + t.box[3]) / 2], true, middles);
      }
      return set(m, true);
    }
    const context = contextOf();
    // Colour, for everything selected, as ChemDraw's Color menu: atoms (their labels and marks), the bonds between
    // them, and every picked arrow, orbital, line, shape, table, TLC plate, cycle and caption, whatever else is picked
    // with them. Black is the document's ink, so it clears the colour. Only text being typed (or the Text tool's next
    // text) takes the colour as a text style.
    // A picked grid cell: ChemDraw's Set Limiting, Hide Row, Hide Column and Show All, and removing the grid.
    if (command.startsWith("grid.") && gridPick) {
      const what = command.slice(5), { arrow, key, row } = gridPick;
      if (what === "limiting") return changeGrid(arrow, () => ({ limiting: key }));
      if (what === "show") return changeGrid(arrow, () => ({ hidden: undefined }));
      setGridPick(undefined);
      if (what === "hide.row") return changeGrid(arrow, (g) => ({ hidden: { ...g.hidden, rows: [...(g.hidden?.rows ?? []), row] } }));
      if (what === "hide.col") return changeGrid(arrow, (g) => ({ hidden: { ...g.hidden, cols: [...(g.hidden?.cols ?? []), key] } }));
      if (what === "remove") return set({ ...doc, grids: doc.grids?.filter((g) => g.arrow !== arrow) }, true);
    }
    if (command === "delete" && context.kind === "grid") return runAction("grid.remove");
    if (command.startsWith("colour.")) {
      const hex = command.slice(7), ink = hex.toLowerCase() === "#000000" ? undefined : hex;
      if (context.kind === "grid" && gridPick) return changeGrid(gridPick.arrow, () => ({ colour: ink }));
      if (context.kind === "caption" && context.mode !== "picked") return runAction(`caption.colour.${hex}`);
      if (context.kind === "spot" && spotPick) return set(editSpot(doc, spotPick.plate, spotPick.index, () => ({ colour: ink })), true);
      const pick = <T extends { id: number; colour?: string }>(x: T): T => (picked.has(x.id) ? { ...x, colour: ink } : x);
      return set({
        ...doc,
        atoms: context.kind === "bond" ? doc.atoms : doc.atoms.map((a, i) => (selection.has(i) ? { ...a, colour: ink } : a)), // a bond alone keeps its atoms' colours
        bonds: doc.bonds.map((b) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? { ...b, colour: ink } : b)),
        arrows: doc.arrows?.map(pick), shapes: doc.shapes?.map(pick), cycles: doc.cycles?.map(pick),
        captions: doc.captions?.map((c) => (picked.has(c.id) ? { ...c, colour: hex.toLowerCase() === style.colour.toLowerCase() ? undefined : hex } : c)),
      }, true);
    }
    // Highlight colours (a disc behind each selected atom) and ring fills, as ChemDraw's Highlight and Ring Fill colour
    // toolbars; none takes them off. A ring fill goes in every ring wholly selected; failing that, every ring with a
    // selected atom in it; failing that, every ring of the structures the selection touches (a substituent picked).
    if (command.startsWith("halo.") || command.startsWith("ringfill.")) {
      const value = command.split(".")[1], c = value === "none" ? undefined : value, key = command.startsWith("halo.") ? "halo" : "fill";
      const atoms = selection.size ? selection : new Set(doc.atoms.map((_, i) => i));
      const all = key === "fill" ? drawnRings(doc) : [];
      const touched = new Set(fragments(doc).filter((g) => g.some((i) => atoms.has(i))).flat());
      const whole = all.filter((r) => r.every((i) => atoms.has(i))), part = all.filter((r) => r.some((i) => atoms.has(i)));
      const inRing = key === "fill" ? new Set((whole.length ? whole : part.length ? part : all.filter((r) => r.every((i) => touched.has(i)))).flat()) : atoms;
      return set({ ...doc, atoms: doc.atoms.map((a, i) => (inRing.has(i) ? { ...a, [key]: c } : a)) }, true);
    }
    // Colour by Element: heteroatom labels in their usual colours (N blue, O red, S gold, P orange, halogens green,
    // Br brown, I purple); carbon and hydrogen keep the ink.
    if (command === "colour_by_element") {
      const BY = elementColours();
      const atoms = selection.size ? selection : new Set(doc.atoms.map((_, i) => i));
      return set({ ...doc, atoms: doc.atoms.map((a, i) => (atoms.has(i) && BY[a.label] ? { ...a, colour: BY[a.label] } : a)) }, true);
    }
    if (command === "copy_smiles" || command === "copy") return void document.execCommand("copy");
    if (command === "paste_hint") return setNotice(`Copy a SMILES string or MOL file, then press ${MOD}V here.`, true);
    if (command.startsWith("copy_text:")) { copyText.current = command.slice(10); document.execCommand("copy"); return; }
    if (command.startsWith("fix:")) { const [, i, charge] = command.split(":"); return set(addCharge(doc, Number(i), Number(charge) - (doc.atoms[Number(i)].charge ?? 0)), true); }
    // A problem's atom (a3), bond (b5) or brackets (s7): shown (selected), or its warnings hidden (the object's
    // Display Warnings goes off, as in ChemDraw; saved as IgnoreWarnings).
    if (command.startsWith("show:") || command.startsWith("hide_warning:")) {
      const what = command.slice(command.indexOf(":") + 1), n = Number(what.slice(1)), on = what[0];
      if (command.startsWith("show:")) return showProblem(on === "b" ? { type: "misc", message: "", bond: n } : on === "s" ? { type: "misc", message: "", shape: n } : { type: "misc", message: "", atom: on === "a" ? n : Number(what) });
      if (on === "b") return doc.bonds[n] && set({ ...doc, bonds: doc.bonds.map((b, k) => (k === n ? { ...b, ignoreWarnings: true as const } : b)) }, true);
      if (on === "s") return doc.shapes?.some((x) => x.id === n) && set({ ...doc, shapes: doc.shapes.map((x) => (x.id === n ? { ...x, ignoreWarnings: true as const } : x)) }, true);
      const i = on === "a" ? n : Number(what);
      return doc.atoms[i] && set({ ...doc, atoms: doc.atoms.map((a, k) => (k === i ? { ...a, ignoreWarnings: true as const } : a)) }, true);
    }
    // A wedge or hash drawn the wrong way round: its ends swapped.
    if (command.startsWith("flip_bond:")) { const k = Number(command.slice(10)); return doc.bonds[k] && set(flipBond(doc, k), true); }
    if (command.startsWith("align.")) return set(alignFragments(doc, selection, command.slice(6) as "row" | "column" | "spread-row"), true);
    if (command === "delete" && context.kind === "spot") return runAction("spot.delete");
    if (command === "delete") return selection.size || picked.size ? set(deleteGraphics(deleteAtoms(doc, selection), picked)) : undefined;
    if (command === "number") return numberStructures();
    if (command === "reaction.clean") { const r = reactionPicked(); return r ? set(cleanUpReaction(doc, r, arrows), true) : undefined; }
    if (command === "reaction.augment") return commands.current.clean_reaction_augmented();
    // Atom mapping (Map Reaction Atoms): every step of the picked reaction, numbered by Indigo, with one numbering
    // through the scheme and Rxn marks on the bonds the reaction changes (interpret.ts); or every number cleared.
    if (command === "reaction.map" || command === "reaction.unmap") {
      const arrow = [...picked].find((id) => arrows.some((a) => a.id === id && straightArrow(a)));
      const r = reactionPicked() ?? (arrow !== undefined ? reactionOf(arrow) : undefined);
      if (!r) return setNotice("Select a reaction first.");
      if (command === "reaction.unmap") return set(clearScheme(doc, new Set(r.atoms)), true);
      const structures = (list: Part[]) => list.flatMap((x) => (x.kind === "structure" ? [x.atoms] : []));
      const steps = interpret(doc, r, arrows, inkBox, captionBox).map((x) => ({ reactants: structures(x.reactants), products: structures(x.products) }));
      const mapped = mapScheme(doc, steps, mapReaction, (atoms) => pickAtoms(doc, atoms));
      return mapped ? set(mapped, true) : setNotice("Octet cannot map these atoms.");
    }
    if (command.startsWith("cycle.")) return cycleAction(command.slice(6));

    // Enhanced stereo: one stereocentre's flag (again to take it off), or every stereocentre in the selection at once.
    if (command.startsWith("stereo.")) {
      const [, what, arg] = command.split(".");
      if (what === "atom") { const i = [...selection][0]; return set(setEnhanced(doc, [i], doc.atoms[i].enhanced === arg ? undefined : arg), true); }
      return set(setEnhanced(doc, stereocentres(doc, selection), what === "racemic" ? "&1" : what === "relative" ? "or1" : undefined), true);
    }
    // A picked TLC spot: style, size (hundredths of a bond length), tail, its own Rf, removal.
    if (command.startsWith("spot.") && spotPick) {
      const [, what, arg] = command.split("."), at = (change: Parameters<typeof editSpot>[3]) => set(editSpot(doc, spotPick.plate, spotPick.index, change), true, `spot-${what}`);
      if (what === "style") return at(() => ({ style: arg === "filled" ? undefined : (arg as "hollow" | "shaded") }));
      // The size shown is the size drawn; the spot keeps it over its plate's scale.
      if (what === "w" || what === "h" || what === "tail") return at(() => ({ [what]: Number(arg) / 100 / scaleOf(doc.shapes?.find((x) => x.id === spotPick.plate) ?? {}) }));
      if (what === "rf") return at((x) => ({ showRf: x.showRf ? undefined : true }));
      if (what === "delete") {
        const sh = doc.shapes?.find((x) => x.id === spotPick.plate);
        setSpotPick(undefined);
        return sh?.tlc ? set(updateShape(doc, sh.id, { tlc: { ...sh.tlc, spots: sh.tlc.spots.filter((_, k) => k !== spotPick.index) } }), true) : undefined;
      }
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
      // A plate's origin, front or border shown or hidden, and one style for all its spots.
      if (what === "hide") return each((x) => { const h = new Set(x.tlc?.hide ?? []), k = arg as "origin" | "front" | "border"; if (h.has(k)) h.delete(k); else h.add(k); return { tlc: { ...x.tlc!, hide: h.size ? [...h] : undefined } }; });
      if (what === "spots") return each((x) => ({ tlc: { ...x.tlc!, spots: (x.tlc?.spots ?? []).map((s) => ({ ...s, style: arg === "filled" ? undefined : (arg as "hollow" | "shaded") })) } }));
      // Tables: rows and columns added or deleted at the cell last typed in (at the end without one), the lines drawn
      // (a set, or one line on or off), the cells' alignment (the cell's column, or all), the lines' width, Clear
      // Contents and Size To Fit Contents.
      if (what === "row" || what === "col") return each((x) => {
        const t = tableLayout(x, cellWidth(x), style.captionSize), mine = lastCell?.id === x.id ? lastCell : undefined;
        const at = what === "row" ? mine?.r ?? t.rows - 1 : mine?.c ?? t.cols - 1, after = arg === "after" ? 1 : 0;
        if (mine && arg !== "delete") setLastCell({ ...mine, ...(after ? {} : what === "row" ? { r: mine.r + 1 } : { c: mine.c + 1 }) });
        return arg === "delete" ? spliceTable(x, what, at, 1, 0, cellWidth(x), style.captionSize) : spliceTable(x, what, at + after, 0, 1, cellWidth(x), style.captionSize);
      });
      if (what === "lines") return each((x) => ({ table: { ...x.table!, grid: undefined, lines: arg in TABLE_LINES ? TABLE_LINES[arg as keyof typeof TABLE_LINES] : linesOf(x.table).includes(arg as TableLine) ? linesOf(x.table).filter((l) => l !== arg) : [...linesOf(x.table), arg as TableLine] } }));
      if (what === "align") return each((x) => {
        const cols = tableLayout(x, cellWidth(x), style.captionSize).cols, only = lastCell?.id === x.id ? lastCell.c : undefined;
        return { table: { ...x.table!, align: Array.from({ length: cols }, (_, c) => (only === undefined || c === only ? arg as CellAlign : x.table?.align?.[c] ?? "centre")) } };
      });
      // The lines' width: a table's rules, or any other shape's outline (ChemDraw's Object Settings > Line Width). The
      // width shown is the width drawn; the shape keeps it over its scale.
      if (what === "weight") return set({ ...doc, shapes: doc.shapes?.map((x) => (!ids.has(x.id) ? x : x.table ? { ...x, table: { ...x.table, weight: Number(arg) / 100 / scaleOf(x) } } : { ...x, width: Number(arg) / 100 / scaleOf(x) })) }, true, `shape-weight-${[...ids].join()}`);
      if (what === "clear") return each((x) => clearTable(x));
      if (what === "fit") return each((x) => fitTable(x, cellWidth(x), style.captionSize));
      // One style at a time: plain, dashed, shaded, filled or with a shadow.
      if (what === "style") return each(() => ({ dashed: arg === "dashed" || undefined, fill: arg === "shaded" || arg === "solid" ? arg : undefined, shadow: arg === "shadow" || undefined }));
      if (what === "side") return each(() => ({ side: arg === "both" ? undefined : (arg as "left" | "right") }));
      if (what === "mark") return each((x) => ({ mark: x.mark === arg ? undefined : arg }));
      if (what === "colour") return each(() => ({ colour: arg.toLowerCase() === "#000000" ? undefined : arg }));
      if (what === "front" || what === "back") return restack(what === "front");
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
      // The line width, as for shapes (one undo step for a whole slider drag).
      // The width shown is the width drawn; the arrow keeps it over its scale.
      if (what === "weight") return set({ ...doc, arrows: doc.arrows?.map((a) => (ids.has(a.id) ? { ...a, width: Number(arg) / 100 / scaleOf(a) } : a)) }, true, `arrow-weight-${[...ids].join()}`);
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
      // On selected atoms, the Text menu and the label style buttons style their labels, as in ChemDraw.
      const labelled = !writing && !picked.size ? [...selection].filter((i) => drawing.label[i]) : [];
      if (labelled.length && ["bold", "italic", "underline", "plain", "font", "size"].includes(what)) {
        const first = doc.atoms[labelled[0]], ids = new Set(labelled);
        const change: Partial<Atom> = what === "plain" ? { bold: undefined, italic: undefined, underline: undefined }
          : what === "font" ? { font: arg === style.labelFont ? undefined : arg }
          : { [what]: first[what as "bold" | "italic" | "underline"] ? undefined : true };
        // A size is the size drawn: the label's own size is it over the atom's scale.
        const own = (a: Atom) => { const v = Math.round((Number(arg) / scaleOf(a)) * 100) / 100; return Math.abs(v - style.labelSize) < 0.01 ? undefined : v; };
        return set({ ...doc, atoms: doc.atoms.map((a, k) => (ids.has(k) ? { ...a, ...(what === "size" ? { size: own(a) } : change) } : a)) }, true);
      }
      // On picked tables and TLC plates, the same styles set their text (the cells, or the Rf values), as in ChemDraw.
      const texts = !writing && !selection.size ? (doc.shapes ?? []).filter((x) => picked.has(x.id) && (x.kind === "table" || x.kind === "tlc")) : [];
      if (texts.length && ["bold", "italic", "underline", "plain", "font", "size"].includes(what)) {
        const first = texts[0], ids = new Set(texts.map((x) => x.id));
        const change = (x: Shape): Partial<Shape> => what === "plain" ? { bold: undefined, italic: undefined, underline: undefined }
          : what === "font" ? { font: arg === style.captionFont ? undefined : arg }
          : what === "size" ? { size: Number(arg) === (x.kind === "tlc" ? style.captionSize * 0.8 : style.captionSize) ? undefined : Number(arg) }
          : { [what]: first[what as "bold" | "italic" | "underline"] ? undefined : true };
        return set({ ...doc, shapes: doc.shapes?.map((x) => (ids.has(x.id) ? { ...x, ...change(x) } : x)) }, true);
      }
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
    // Select: Shift-click adds what was clicked to the selection, or takes it out if it was all selected already;
    // Option-click takes it out. Either way from the selection as it was before the press.
    const mods = pressMods.current;
    pressMods.current = undefined;
    // An integral group goes in or out whole, and a cycle with its intermediates (as a click picks them).
    if (tool === "select" && mods && (mods.shift || mods.alt)) {
      const cycle = doc.cycles?.find((c) => c.id === t.cycle);
      const [ids, items] = wholeIntegral(doc, new Set([...atomsOf(doc, t), ...(cycle?.nodes.flat() ?? [])]), new Set(itemsOf(t)));
      const all = [...ids].every((i) => mods.atoms.has(i)) && [...items].every((x) => mods.picks.has(x)), out = mods.alt || all;
      const atoms = new Set(mods.atoms), picks = new Set(mods.picks);
      for (const i of ids) if (out) atoms.delete(i); else atoms.add(i);
      for (const x of items) if (out) picks.delete(x); else picks.add(x);
      setSelection(atoms);
      setPicked(picks);
      return;
    }
    // Select: a click on part of a wider selection keeps that part alone (a whole integral group; a cycle keeps the
    // intermediates its press picked).
    if (tool === "select") {
      const gc = Object.values(t).every((v) => v === undefined) ? gridCellAt(at) : undefined;
      if (gc) { choose([], []); return setGridPick({ arrow: gc.arrow, key: gc.key, row: gc.row }); }
      setGridPick(undefined);
      return t.cycle !== undefined ? undefined : choose(atomsOf(doc, t), itemsOf(t));
    }
    if ((t.caption !== undefined || t.cycle !== undefined) && tool !== "text") return; // a caption or cycle was picked, not drawn on
    if (tool === "table" && tableAt(at)) return openCell(tableAt(at)!, at);
    if (tool === "tlc" && plateAt(at)) return spotAt(plateAt(at)!, at, [0, 0], false, false);
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
      const boxes = [...(atoms.length ? [withCaptions(atoms)].filter((b): b is Box => !!b) : []), ...placed.filter((c) => c.id === t.caption).map((c) => c.box)];
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
  }

  function onPointerUp() {
    stopHold();
    if (spring) { setTool(spring); setSpring(undefined); }
    if (!drag) return;
    setDrag(undefined);
    switch (drag.kind) {
      case "crosshair":
        return setGuides((g) => ({ ...g, crosshair: drag.at }));
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
      case "spot":
        if (drag.moved) return set(drag.working, true);
        return setSpotPick({ plate: drag.plate, index: drag.index });
      case "tlcline":
      case "tableedge":
        return drag.working !== drag.base ? set(drag.working, true) : undefined;
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
        return drag.degrees ? turnTo(drag.working, drag.centre) : undefined;
      case "pivot":
        return drag.moved ? undefined : click(drag.target, drag.at);
      case "resize":
        return drag.size[0] !== 1 || drag.size[1] !== 1 ? commitScale(drag.size, drag.anchor, drag.lines, drag.working) : undefined;
      case "chain":
        if (drag.to) return set(chainTo(doc, drag.from, drag.to).mol);
        return click(drag.target, typeof drag.from === "number" ? pos(doc, drag.from) : drag.from);
      case "click":
        return click(drag.target, drag.at);
      case "erase": {
        // A click removes the atom, bond or object under the pointer; a rub removes everything it marked.
        const t = drag.target;
        if (drag.moved) return set(deleteGraphics(erase(doc, drag.bonds, drag.atoms), drag.captions));
        return removeAt(t);
      }
      case "box":
      case "lasso":
        saw("select");
        // A hold that never moved selects what it was held on; on a stoichiometry grid's cell, picks the cell.
        if (!drag.moved) {
          const gc = drag.kind === "box" && !drag.base.size && Object.values(drag.target).every((v) => v === undefined) ? gridCellAt(drag.from) : undefined;
          choose([...drag.base, ...atomsOf(doc, drag.target)], [...drag.picks, ...[drag.target.caption ?? drag.target.arrow].filter((x): x is number => x !== undefined)]);
          setGridPick(gc && { arrow: gc.arrow, key: gc.key, row: gc.row });
        }
        return;
      case "move": {
        if (!drag.moved) return click(drag.target, drag.from);
        saw("move");
        // An atom dropped exactly on another joins it. Joining renumbers atoms, so the selection clears then.
        const { mol, joined } = joinOverlaps(drag.working, drag.atoms ?? selection);
        return set(mol, !joined);
      }
    }
  }

  // Trackpad: scroll pans, pinch (or ⌘/Ctrl + scroll) zooms around the pointer. While a zoom goes on (until 150 ms
  // after its last step), the drawing's text is laid out at its own size and scaled with the drawing (pinch, in
  // editor.css), so a zoom step does not lay out all the text again. When the zoom stops, the text is laid out for
  // the screen again and looks as it did before.
  useEffect(() => {
    const el = svg.current!;
    let stop: number | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zooming = e.ctrlKey || e.metaKey;
      setView((v) => {
        if (!zooming) return { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY };
        const zoom = clampZoom(v.zoom * Math.exp(-e.deltaY * 0.01)), k = zoom / v.zoom;
        return { zoom, x: e.clientX - (e.clientX - v.x) * k, y: e.clientY - (e.clientY - v.y) * k, pinch: true };
      });
      if (!zooming) return;
      clearTimeout(stop);
      stop = window.setTimeout(() => setView((v) => (v.pinch ? { ...v, pinch: undefined } : v)), 150);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { clearTimeout(stop); el.removeEventListener("wheel", onWheel); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing() || e.defaultPrevented) return; // typing in a label or caption box, or a box already used the key
      if (home) return; // Home has its own keys
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
      if (!TAURI && mod && key === "n" && e.shiftKey) { e.preventDefault(); return commands.current.name_to_structure(); }
      // A menu command on a key without Command or Ctrl (set in Settings): the page runs it (the menu cannot take
      // such a key without taking it from text boxes too). Command and Ctrl keys are the menu's own in the app.
      const pressedKey = keyOf(e), bound = pressedKey && actionFor(keymap(settings.keys), pressedKey, "none");
      if (bound?.startsWith("menu.") && (!TAURI || !native(pressedKey!))) { e.preventDefault(); return commands.current[bound.slice(5)]?.(); }
      if (mod) return;
      // Option keys run only what the shortcut table gives them: Option + arrows turn the selection (as ChemDraw's).
      if (e.altKey) {
        const t = keyTarget(), id = pressedKey && actionFor(keymap(settings.keys), pressedKey, t.atom !== undefined ? "atom" : t.bond !== undefined ? "bond" : "none");
        if (id) { e.preventDefault(); run(id); }
        return;
      }
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
      if (e.key === "Enter" && picked.size === 1 && !selection.size && hovers.get().atom === undefined) {
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
      if (typing() || home) return; // pasting into a label or caption, or on Home
      // In the app: the clipboard as Octet, ChemDraw and Office put it (Octet's own copy, then CDXML, which ChemDraw
      // hides in its pictures and Word keeps, then a molfile, then SMILES), and the plain text last.
      if (TAURI && !e.clipboardData?.getData(OCTET_CLIP)) {
        const text = e.clipboardData?.getData("text/plain");
        e.preventDefault();
        void readClipboard().then(async (clip) => {
          if (clip.octet) {
            let add: Mol;
            try { add = parse(clip.octet); } catch { return setNotice("Octet cannot read what is on the clipboard."); }
            const r = insertMol(doc, add.style ? fitSizes(add, add.style, style) : add, [0.8, -0.8]);
            set(r.mol, true);
            setSelection(r.atoms);
            setPicked(r.items);
            return;
          }
          // ChemDraw's (or Word's copy of ChemDraw's) drawing: all of it, arrows and text too.
          if (clip.cdxml) {
            try {
              const { mol: add, style: from, lost } = fromCdxml(clip.cdxml);
              if (add.atoms.length || add.arrows?.length || add.captions?.length || add.shapes?.length) {
                const r = insertMol(doc, fitSizes(add, from, style), add.atoms.length ? landing(add) : [0, 0]);
                set(r.mol, true);
                setSelection(r.atoms);
                setPicked(r.items);
                return sayLost(lost);
              }
            } catch { /* read the molfile or SMILES instead */ }
          }
          let why = "Paste a name, a SMILES string or a MOL file.";
          const refused = (reason: string) => { why = reason; };
          for (const source of [clip.molfile, clip.smiles]) {
            if (!source || !loaded) continue;
            let frag: Mol | undefined;
            try { frag = importStructure(source); } catch (err) { frag = undefined; if (err instanceof RangeError) refused(err.message); }
            if (frag?.atoms.length) return place(frag);
          }
          if (!text?.trim()) return;
          // The names engine loads only for text, so no other paste waits for it.
          await loadNames().then(() => setNamesLoaded(true), () => {});
          const frag = structureFromText(text, refused);
          if (frag) return place(frag);
          setNotice(`Octet cannot read this structure. ${why}`);
        }).catch((err) => setNotice(`Octet cannot read the clipboard. ${err}`));
        return;
      }
      // Octet's own copy: everything that was selected, read as a hostile file is, a little down and right of where it was.
      const own = e.clipboardData?.getData(OCTET_CLIP);
      if (own) {
        e.preventDefault();
        let add: Mol;
        try { add = parse(own); } catch { return setNotice("Octet cannot read what is on the clipboard."); }
        const r = insertMol(doc, add.style ? fitSizes(add, add.style, style) : add, [0.8, -0.8]);
        set(r.mol, true);
        setSelection(r.atoms);
        setPicked(r.items);
        return;
      }
      const text = e.clipboardData?.getData("text/plain");
      if (!text?.trim() || !loaded) return;
      e.preventDefault();
      // A chemical name first, then SMILES or a MOL file.
      void loadNames().then(() => setNamesLoaded(true), () => {}).then(() => {
        let why = "Paste a name, a SMILES string or a MOL file.";
        const frag = structureFromText(text, (reason) => { why = reason; });
        if (frag) place(frag);
        else setNotice(`Octet cannot read this structure. ${why}`);
      });
    };
    // Copy puts the selection, or the whole drawing, on the clipboard as SMILES (or text the panel asked for).
    // cut: a cut's copy, whose delete waits for the check too. False when the copy waits for Check Structure.
    const onCopy = (e: ClipboardEvent, cut = false): boolean | void => {
      if (typing() && !copyText.current) return;
      if (copyText.current) {
        e.clipboardData?.setData("text/plain", copyText.current);
        e.preventDefault();
        copyText.current = undefined;
        return setNotice("Copied.", true);
      }
      // Everything selected (or the whole drawing) in Octet's own form, for pasting back with arrows, text and shapes,
      // with this drawing's style, so a paste into a drawing of another size keeps text in proportion (fitSizes);
      // and its structures as SMILES, for other programs.
      const part = selectedPart() ?? doc;
      if (!part.atoms.length && !part.captions?.length && !part.arrows?.length && !part.shapes?.length) return;
      e.preventDefault();
      // Check Structure first when Settings asks for it; the copy (and a cut's delete) waits for Ignore All, then
      // goes to the clipboard with no copy event (the app's clipboard, or the browser's as text).
      if (settings.checkCopy) {
        const list = selection.size || picked.size ? subsetProblems() : allProblems();
        if (list.length) { checkThen(list, () => { copyOut(part); if (cut) runAction("delete"); }); return false; }
      }
      copyOut(part, e);
    };
    const copyOut = (part: Mol, e?: ClipboardEvent) => {
      saw("copy");
      // In the app: as ChemDraw copies, for Word, PowerPoint and Keynote (a vector picture at true size with the
      // structure hidden in it, so it pastes back as a structure), then a molfile and SMILES, then Octet's own form.
      if (TAURI) {
        const picture = pictureOf(part);
        if (!picture) return;
        void copyToClipboard({ svg: picture, cdxml: formatOf(part, "cdxml"), molfile: formatOf(part, "molfile"), smiles: formatOf(part, "smiles"), octetJson: serialize({ ...part, style }) })
          .catch((err) => setNotice(`Octet cannot copy this. ${err}`));
        return;
      }
      const text = formatOf(part, "smiles") ?? (part.captions ?? []).map((c) => c.text).join("\n");
      if (!e) return void navigator.clipboard?.writeText(text).catch(() => setNotice("Octet cannot copy this."));
      e.clipboardData?.setData(OCTET_CLIP, serialize({ ...part, style }));
      e.clipboardData?.setData("text/plain", text);
    };
    // Cut: copy, then delete what was selected.
    const onCut = (e: ClipboardEvent) => {
      if (typing() || (!selection.size && !picked.size)) return;
      if (onCopy(e, true) === false) return;
      set(deleteGraphics(deleteAtoms(doc, selection), picked));
    };
    addEventListener("keydown", onKey);
    addEventListener("paste", onPaste);
    addEventListener("copy", onCopy);
    addEventListener("cut", onCut);
    return () => { removeEventListener("keydown", onKey); removeEventListener("paste", onPaste); removeEventListener("copy", onCopy); removeEventListener("cut", onCut); };
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
    if (a && isOrbital(a)) return <g key={key}>{lobesOf(a, L).map((l, i) => <polygon key={i} className={`arrow-mark ${cls}`} points={l.path.map((q) => q.join(",")).join(" ")} strokeWidth={0.2 * L} />)}</g>;
    if (sh) return <g key={key}>{shapeTrace(sh, L, frame.bond).paths.map((path, i) => <polyline key={i} className={`arrow-mark ${cls}`} points={path.map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />)}</g>;
    return a ? <polyline key={key} className={`arrow-mark ${cls}`} points={arrowTrace(a, L).paths[0].map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} /> : null;
  };
  // A group wholly selected (the outermost, when groups nest): a dotted frame round all of it (its atoms with their
  // labels, its text, arrows, shapes and cycles), so it reads as one thing. The frame keeps 6 px clear of the selection
  // marks (0.32 bond lengths round each atom) at any zoom.
  const groupBoxes = selectedGroups(shown, selection, picked).flatMap((g) => { const b = g.atoms.length + g.items.length > 1 ? drawnBox(g.atoms, new Set(g.items)) : undefined; return b ? [[g.id, b] as const] : []; });
  const groupFrames = groupBoxes.length > 0 && <Live store={views}>{(view) => {
    const pad = 0.32 * L + 6 / view.zoom;
    return <g className="group-frame">{groupBoxes.map(([id, b]) => <rect key={`gf${id}`} x={b[0] - pad} y={b[1] - pad} width={b[2] - b[0] + 2 * pad} height={b[3] - b[1] + 2 * pad} rx={4 / view.zoom} />)}</g>;
  }}</Live>;
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
    ...cycleArrows.filter((a) => picked.has(a.cycle)).map((a) => <polyline key={`sy${a.id}`} className="arrow-mark" points={arrowTrace(a, L).paths[0].map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />),
  ];
  // With Select or the Eraser, over any part of an integral group the mark covers all of it, as a click picks or
  // removes all of it (ChemDraw highlights the outermost integral group too). Each group's members, worked out once
  // for each drawing.
  const integrals = useMemo(() => outerGroups((doc.groups ?? []).filter((g) => g.integral)).map((g) => ({ g, atoms: new Set(g.atoms), items: new Set(g.items) })), [doc.groups]);
  const wholeMark = (w: (typeof integrals)[number]) => (
    <g key="h">
      {shown.bonds.flatMap((b, i) => (w.atoms.has(b.atoms[0]) && w.atoms.has(b.atoms[1]) ? [bondMark(i, `hb${i}`, "mark")] : []))}
      {w.g.atoms.filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `ha${i}`, "mark"))}
      {w.g.items.map((id) => captionMark(id, `hc${id}`, "mark") ?? arrowMark(id, `hr${id}`, "mark"))}
      {cycleArrows.filter((a) => w.items.has(a.cycle)).map((a) => <polyline key={`hy${a.id}`} className="arrow-mark mark" points={arrowTrace(a, L).paths[0].map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />)}
    </g>
  );
  const integralAt = (hover: Hover) => {
    if ((tool !== "select" && tool !== "erase") || !integrals.length) return undefined;
    const ids = atomsOf(doc, hover), items = itemsOf(hover);
    const w = integrals.find((x) => ids.some((i) => x.atoms.has(i)) || items.some((id) => x.items.has(id)));
    return w && (tool === "erase" || !(w.g.atoms.every((i) => selection.has(i)) && w.g.items.every((id) => picked.has(id)))) ? w : undefined;
  };
  // The grid cell picked, marked as a selection is.
  const gridPickMark = () => {
    const v = gridPick && gridViews.find((x) => x.arrow === gridPick.arrow), c = v?.cols.find((x) => x.key === gridPick!.key), k = v ? v.rows.findIndex((r) => r.id === gridPick!.row) : -1;
    return v && c && k >= 0 ? <rect className="grid-pick" x={(c.x - v.width / 2) * L} y={-(v.top - k * v.rh) * L} width={v.width * L} height={v.rh * L} /> : null;
  };
  // Show Reaction Interpretation: the reaction under the pointer, each part boxed and named by what it is.
  const ROLE_NAMES: Record<Role, string> = { reactant: "Reactant", product: "Product", above: "Above arrow", below: "Below arrow" };
  const interpretationAt = (hover: Hover) => {
    if (!interpreted.length || drag) return null;
    const atom = hover.atom ?? (hover.bond !== undefined ? doc.bonds[hover.bond]?.atoms[0] : undefined);
    const x = interpreted.find(({ r, roles }) => (atom !== undefined && roles.atoms.has(atom)) || (hover.arrow !== undefined && r.arrows.includes(hover.arrow))
      || (hover.caption !== undefined && (roles.captions.has(hover.caption) || r.captions.includes(hover.caption))));
    if (!x) return null;
    const pad = 0.15, seen = new Set<string>();
    return (
      <g className="interpretation" aria-hidden>
        {x.steps.flatMap((st) => ([["reactant", st.reactants], ["product", st.products], ["above", st.above], ["below", st.below]] as [Role, Part[]][]).flatMap(([role, list]) => list.map((part) => {
          const key = part.kind === "structure" ? `s${part.atoms[0]}` : `t${part.id}`, b = part.box;
          // An intermediate is shown once, as the product it is first.
          if (seen.has(key) || (role === "reactant" && st !== x.steps[0])) return null;
          seen.add(key);
          return (
            <g key={key} className={role}>
              <rect x={(b[0] - pad) * L} y={-(b[3] + pad) * L} width={(b[2] - b[0] + 2 * pad) * L} height={(b[3] - b[1] + 2 * pad) * L} rx={0.2 * L} />
              <text x={(b[0] - pad) * L} y={-(b[3] + pad) * L - 3}>{ROLE_NAMES[role]}</text>
            </g>
          );
        })))}
      </g>
    );
  };
  const hovered = (hover: Hover) => { const mark = hoveredMark(hover), shown = settings.interpretation ? interpretationAt(hover) : null; return shown ? <g key="h">{shown}{mark}</g> : mark; };
  // The mark on what is under the pointer, drawn by Live as the pointer moves.
  const hoveredMark = (hover: Hover, whole = drag ? undefined : integralAt(hover)) => drag ? null
    : whole ? wholeMark(whole)
    // The Reaction Atom-Atom Map tool on a mapped atom: its partners (the atoms with its number) ringed too.
    : tool === "map" && hover.atom !== undefined && shown.atoms[hover.atom]?.map ? (
      <g key="h">
        {atomMark(hover.atom, "ha", "mark")}
        <g className="mapping" aria-hidden>
          {shown.atoms.flatMap((a, i) => (a.map === shown.atoms[hover.atom!].map && i !== hover.atom ? [<circle key={i} cx={pos(shown, i)[0] * L} cy={-pos(shown, i)[1] * L} r={0.32 * L} />] : []))}
        </g>
      </g>
    )
    : hover.atom !== undefined && shown.atoms[hover.atom] ? atomMark(hover.atom, "h", "mark")
    : hover.caption !== undefined && !picked.has(hover.caption) ? captionMark(hover.caption, "h", "mark")
    : hover.arrow !== undefined && !picked.has(hover.arrow) ? arrowMark(hover.arrow, "h", "mark")
    : hover.cycle !== undefined && !picked.has(hover.cycle) ? <g key="h">{cycleArrows.filter((a) => a.cycle === hover.cycle).map((a) => <polyline key={a.id} className="arrow-mark mark" points={arrowTrace(a, L).paths[0].map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />)}</g>
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

  // The Actions panel's group row: Group when the selection holds two or more things (a group counts as one), and
  // Ungroup and Pick as One when it touches a group.
  const grouping = useMemo(() => {
    const gs = groupTargets(doc, selection, picked), count = fragments(doc).filter((g) => g.some((i) => selection.has(i))).length + picked.size;
    const group = count >= 2 && (!doc.groups?.length || !!groupSelection(doc, selection, picked));
    return gs.length || count >= 2 ? { grouped: gs.length > 0, integral: gs.length > 0 && gs.every((g) => g.integral), group } : undefined;
  }, [doc, selection, picked]);
  // Home stays on screen while it fades out, so going to a drawing (or the tutorial) is one smooth move.
  const [homeLeaving, setHomeLeaving] = useState(false), [wasHome, setWasHome] = useState(home), homeKind = useRef<"name" | "home">("home");
  if (home) homeKind.current = settings.userName === null ? "name" : "home";
  if (wasHome !== home) { setWasHome(home); setHomeLeaving(wasHome); }
  useEffect(() => {
    if (!homeLeaving) return;
    const t = setTimeout(() => setHomeLeaving(false), 180);
    return () => clearTimeout(t);
  }, [homeLeaving]);

  // The selection's extent (px at 100%), for the rulers' band: its atoms with their labels and text, picked text, and
  // picked arrows and shapes by their ends. It follows a move as it goes.
  const rulerExtent = guides.rulers && (selection.size || picked.size) ? union([
    withCaptions(selection), ...placed.filter((c) => picked.has(c.id)).map((c) => c.box),
    ...[...(shown.arrows ?? []), ...(shown.shapes ?? [])].filter((a) => picked.has(a.id)).map((a): Box => [Math.min(a.from[0], a.to[0]) * L, -Math.max(a.from[1], a.to[1]) * L, Math.max(a.from[0], a.to[0]) * L, -Math.min(a.from[1], a.to[1]) * L]),
  ].filter((b): b is Box => !!b)) : undefined;
  // The grid across the window, lighter and heavier lines (only the ones far enough apart to read at this zoom), and
  // the crosshair over it: two lines across the window, with a tick at each lighter step when the grid is off, as
  // ChemDraw's. Drawn for the window alone, so it costs the same at every zoom. Never exported or printed.
  const gridMarks = (view: { x: number; y: number; zoom: number }) => {
    if (!gridShown && !cross) return null;
    const scale = view.zoom * L, box: [number, number, number, number] = [-view.x / scale, (view.y - innerHeight) / scale, (innerWidth - view.x) / scale, view.y / scale];
    const [top, bottom, left, right] = [-box[3] * L, -box[1] * L, box[0] * L, box[2] * L], lines = gridLines(gridShown ? grid : heavy, box, scale);
    const path = (major: boolean) => [...lines.x.filter(([, m]) => m === major).map(([x]) => `M${x * L} ${top}V${bottom}`), ...lines.y.filter(([, m]) => m === major).map(([y]) => `M${left} ${-y * L}H${right}`)].join("");
    const ticks = cross && !gridShown && shownStep(grid, scale) === grid.minor ? gridLines(grid, box, scale) : undefined, t = 5 / view.zoom;
    return (
      <>
        <path className="grid" d={path(false)} vectorEffect="non-scaling-stroke" />
        <path className="grid major" d={path(true)} vectorEffect="non-scaling-stroke" />
        {cross && <path className="crosshair" vectorEffect="non-scaling-stroke"
          d={`M${cross[0] * L} ${top}V${bottom}M${left} ${-cross[1] * L}H${right}${ticks ? [...ticks.x.map(([x]) => `M${x * L} ${-cross[1] * L - t}v${2 * t}`), ...ticks.y.map(([y]) => `M${cross[0] * L - t} ${-y * L}h${2 * t}`)].join("") : ""}`} />}
      </>
    );
  };
  // A shape's fill: a highlight, a solid or shaded fill, or a shadow.
  const shapeFill = (sh: Shape) => {
    if (!(sh.kind === "highlight" || sh.fill || sh.shadow)) return null;
    const d = kept(outlines, sh, frame.bond, () => toPath(shapeTrace(sh, L, frame.bond).paths.slice(0, 1))), shade = { ...SHADE, ...sh.shade }, off = shade.depth * L * scaleOf(sh);
    if (sh.kind === "highlight") return <path key={`f${sh.id}`} d={d} fill={sh.colour ?? HIGHLIGHT} />;
    if (sh.fill) return <path key={`f${sh.id}`} d={d} fill={sh.fill === "shaded" ? `url(#shade${sh.id})` : sh.colour ? textInk(sh.colour) : "var(--ink)"} />;
    // A shadow falls down and to the right, in the shape's colour at its opacity, softened by a blur. It shows
    // only outside the shape, so the shape stays unfilled: what is behind it shows through, and an export on a
    // transparent background has nothing in it.
    return (
      <g key={`f${sh.id}`}>
        <defs>
          {shade.blur > 0 && <filter id={`soft${sh.id}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={shade.blur * L * 0.5 * scaleOf(sh)} /></filter>}
          <mask id={`outside${sh.id}`} maskUnits="userSpaceOnUse" x={-1e5} y={-1e5} width={2e5} height={2e5}>
            <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="#fff" />
            <path d={d} fill="#000" />
          </mask>
        </defs>
        <g mask={`url(#outside${sh.id})`}>
          <path d={d} transform={`translate(${off} ${off})`} fill={sh.colour ? textInk(sh.colour) : "var(--ink)"} fillOpacity={shade.opacity} filter={shade.blur > 0 ? `url(#soft${sh.id})` : undefined} />
        </g>
      </g>
    );
  };
  // A closed pen curve's fill: solid, shaded (lit from the top left) or faded (to nothing at the bottom right).
  const curveFill = (a: Arrow) => {
    if (!(a.curve?.closed && a.fill)) return null;
    // As ChemDraw draws them (checked in its SVG export): each curve's fill, then its outline as a 0.05 pt
    // hairline, in order, so a curve drawn later (a lamp's highlight over its glass, say) covers those under it.
    const ink = a.colour ? textInk(a.colour) : "var(--ink)", d = kept(outlines, a, L, () => toPath(arrowTrace(a, L).paths));
    const outline = <path d={d} fill="none" stroke={ink} strokeWidth={(a.width ?? 0.05) * pt * scaleOf(a)} />;
    if (a.fill === "solid") return <g key={`cf${a.id}`}><path d={d} fill={ink} />{outline}</g>;
    return (
      <g key={`cf${a.id}`}>
        <defs>
          {a.fill === "shaded"
            ? <radialGradient id={`cfill${a.id}`} cx="0.36" cy="0.32" r="0.75"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" style={{ stopColor: ink }} /></radialGradient>
            : <linearGradient id={`cfill${a.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: ink }} /><stop offset="1" style={{ stopColor: ink }} stopOpacity={0} /></linearGradient>}
        </defs>
        <path d={d} fill={`url(#cfill${a.id})`} />
        {outline}
      </g>
    );
  };
  const orbitalsInk = (orbitals: Arrow[]) => {
    // Orbitals sit behind the structure: plain lobes are the page's colour, shaded ones lit from the top
    // left, filled ones solid; phased orbitals fill one phase and leave the other plain.
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
        {orbitals.flatMap((a) => lobesOf(a, L).map((l, i) => {
          const ink = a.colour ? textInk(a.colour) : "var(--ink)", ph = a.orbital!.phase;
          const fill = ph === "filled" || (ph === "phased" && !l.second) ? ink : ph === "shaded" ? `url(#lobe${a.colour ? a.id : ""})` : "var(--canvas)";
          return <path key={`${a.id}-${i}`} d={toPath([l.path])} fill={fill} fillRule="evenodd" stroke={ink} strokeWidth={lined(a.width).line * scaleOf(a)} />;
        }))}
      </g>
    );
  };
  // A TLC plate's lines and spots.
  const tlcInk = (sh: Shape) => {
    // A plate's origin line, dashed solvent front, spots, and their Rf values when shown.
    const t = tlcLayout(sh), y = (v: number) => -v * L, ink = sh.colour ? textInk(sh.colour) : "var(--ink)", hide = new Set(sh.tlc?.hide ?? []), w = lined(sh.width).line * t.f;
    const dragging = drag?.kind === "spot" && drag.plate === sh.id ? drag.index : undefined;
    return (
      <g key={`tlc${sh.id}`} className="tlc">
        {!hide.has("origin") && <line x1={t.x0 * L} x2={t.x1 * L} y1={y(t.origin)} y2={y(t.origin)} stroke={ink} strokeWidth={w} />}
        {!hide.has("origin") && Array.from({ length: t.lanes }, (_, k) => <line key={`t${k}`} x1={t.lane(k) * L} x2={t.lane(k) * L} y1={y(t.origin) - 0.08 * L * t.f} y2={y(t.origin) + 0.08 * L * t.f} stroke={ink} strokeWidth={w} />)}
        {!hide.has("front") && <line x1={t.x0 * L} x2={t.x1 * L} y1={y(t.front)} y2={y(t.front)} stroke={ink} strokeWidth={w} strokeDasharray={`${0.12 * L * t.f} ${0.08 * L * t.f}`} />}
        {(sh.tlc?.spots ?? []).map((x, i) => {
          // A spot in its own colour (or the plate's): filled, hollow (its outline) or shaded (lit from the top left).
          const c = x.colour ? textInk(x.colour) : ink, d = "M" + spotPath(t, x).map(([px, py]) => `${(px * L).toFixed(2)} ${(-py * L).toFixed(2)}`).join("L") + "Z", { rx } = t.size(x);
          const picked = spotPick?.plate === sh.id && spotPick.index === i;
          return (
            <g key={i}>
              {x.style === "shaded" && <defs><radialGradient id={`spot${sh.id}-${i}`} cx="0.36" cy="0.32" r="0.75"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" style={{ stopColor: c }} /></radialGradient></defs>}
              <path d={d} fill={x.style === "hollow" ? "none" : x.style === "shaded" ? `url(#spot${sh.id}-${i})` : c} stroke={x.style === "hollow" ? c : undefined} strokeWidth={w} />
              {picked && <path d={d} className="spot-picked" fill="none" vectorEffect="non-scaling-stroke" />}
              {(sh.tlc?.rf || x.showRf || dragging === i) && <text x={(t.lane(x.lane) + rx + 0.1 * t.f) * L} y={y(t.at(x.rf)) + 0.12 * L * t.f} fill={c} style={textFace(sh, (sh.size ?? style.captionSize * 0.8) * pt * t.f)}>{x.rf.toFixed(2)}</text>}
            </g>
          );
        })}
      </g>
    );
  };
  // The text style of a table's cells or a TLC plate's Rf values (px size).
  const textFace = (sh: Shape, size: number): React.CSSProperties => ({ font: `${sh.italic ? "italic " : ""}${sh.bold ? "bold " : ""}${size}px ${fontStack(sh.font ?? style.captionFont)}`, ...(sh.underline ? { textDecoration: "underline" } : {}) });
  // A table's lines and text.
  const tableInk = (sh: Shape) => {
    // A table: the lines it has (journal rules unless set otherwise), solid or dashed, and each cell's text
    // aligned in its column.
    const t = tableLayout(sh, cellWidth(sh), style.captionSize), y = (v: number) => -v * L, ink = sh.colour ? textInk(sh.colour) : "var(--ink)", size = (sh.size ?? style.captionSize) * pt * t.f;
    const lines = new Set(linesOf(sh.table)), inner = (n: number) => Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1);
    const across = [...(lines.has("top") ? [t.y1] : []), ...inner(t.rows).filter((r) => lines.has("rows") || (r === 1 && lines.has("header"))).map((r) => t.row(r)), ...(lines.has("bottom") ? [t.y0] : [])];
    const down = [...(lines.has("left") ? [t.x0] : []), ...(lines.has("cols") ? inner(t.cols).map((c) => t.col(c)) : []), ...(lines.has("right") ? [t.x1] : [])];
    const weight = (sh.table?.weight ?? style.line) * pt * t.f, dash = sh.dashed ? `${3 * weight} ${3 * weight}` : undefined;
    const anchor = (c: number) => sh.table?.align?.[c] ?? "centre";
    return (
      <g key={`table${sh.id}`} className="table">
        {across.map((v, i) => <line key={`r${i}`} x1={t.x0 * L} x2={t.x1 * L} y1={y(v)} y2={y(v)} stroke={ink} strokeWidth={weight} strokeDasharray={dash} />)}
        {down.map((v, i) => <line key={`c${i}`} x1={v * L} x2={v * L} y1={y(t.y1)} y2={y(t.y0)} stroke={ink} strokeWidth={weight} strokeDasharray={dash} />)}
        {(sh.table?.cells ?? []).map((row, r) => row.map((text, c) => text && !(cell?.id === sh.id && cell.r === r && cell.c === c) ? (
          <text key={`${r}-${c}`} x={(anchor(c) === "left" ? t.col(c) + TABLE_PAD * t.f : anchor(c) === "right" ? t.col(c + 1) - TABLE_PAD * t.f : t.col(c) + t.widths[c] / 2) * L} y={y(t.row(r) - t.heights[r] / 2) + 0.35 * size}
            textAnchor={anchor(c) === "left" ? "start" : anchor(c) === "right" ? "end" : "middle"} fill={ink} style={textFace(sh, size)}>{formula(text, size)}</text>
        ) : null))}
      </g>
    );
  };
  // A shape's lines: its outline, a TLC plate's lines and spots, a table's lines and text, and a bracket's sign.
  const shapeLines = (sh: Shape) => (
    <Fragment key={`sl${sh.id}`}>
      {sh.kind !== "highlight" && sh.kind !== "table" && !sh.fill && !(sh.kind === "tlc" && sh.tlc?.hide?.includes("border")) && <path key={`sh${sh.id}`} d={kept(shapeInks, sh, lined(sh.width), () => toPath(shapeInk(sh, lined(sh.width), L)))} fill={sh.colour ? textInk(sh.colour) : "var(--ink)"} />}
      {sh.kind === "tlc" && tlcInk(sh)}
      {sh.kind === "table" && tableInk(sh)}
      {sh.mark && isBracket(sh) && (() => {
        const m = markAt(sh, L);
        return <text key={`m${sh.id}`} x={m.x} y={m.y} textAnchor={m.anchor} fill={sh.colour ? textInk(sh.colour) : "var(--ink)"} style={{ font: `${style.captionSize * pt * scaleOf(sh)}px ${fontStack(style.captionFont)}` }}>{sh.mark}</text>;
      })()}
      {/* A polymer bracket's usage label at its lower right, and its repeat pattern and flip at its upper right. */}
      {sh.polymer && isBracket(sh) && !sh.side && (() => {
        const at = polymerLabelsAt(sh, L), label = polymerLabel(sh.polymer), tags = polymerTags(sh.polymer), font = { font: `${0.75 * style.captionSize * pt * scaleOf(sh)}px ${fontStack(style.captionFont)}` }, fill = sh.colour ? textInk(sh.colour) : "var(--ink)";
        return (
          <Fragment key={`p${sh.id}`}>
            {label && <text x={at.label.x} y={at.label.y} fill={fill} style={font}>{label}</text>}
            {tags && <text x={at.tags.x} y={at.tags.y} fill={fill} style={font}>{tags}</text>}
          </Fragment>
        );
      })()}
      {/* An R-group definition's name, in a tab on its box's upper left edge (ChemDraw's alternative group title). */}
      {sh.rgroup && (() => {
        const x0 = Math.min(sh.from[0], sh.to[0]) * L, y0 = -Math.max(sh.from[1], sh.to[1]) * L, size = style.captionSize * pt * scaleOf(sh), w = textWidth(sh.rgroup.name, size, false, false, fontStack(style.captionFont)) + 0.8 * size, h = 1.5 * size;
        const fill = sh.colour ? textInk(sh.colour) : "var(--ink)";
        return (
          <g key={`rg${sh.id}`}>
            <path d={`M${x0} ${y0}V${y0 - h}H${x0 + w}V${y0}`} fill="none" stroke={fill} strokeWidth={lined(sh.width).line} strokeDasharray={sh.dashed ? `${0.2 * L} ${0.2 * L}` : undefined} />
            <text x={x0 + 0.4 * size} y={y0 - 0.4 * size} fill={fill} style={{ font: `${size}px ${fontStack(style.captionFont)}` }}>{sh.rgroup.name}</text>
          </g>
        );
      })()}
    </Fragment>
  );
  // The drawing's layers. Hovering, panning, zooming and the caret do not change them, and each is made again only
  // when what it shows changes, so React passes over the rest of the drawing.
  const gridKey = gridViews.length ? gridViews : undefined;
  const under = useMemo(() => (
    <>
      {/* Fills go behind the structures: highlights, shadows (with the shape white over them), solid and shaded shapes. */}
      {/* Ring fills: a ring whose atoms all have one fill, filled with it behind the bonds. */}
      {shown.atoms.some((at) => at.fill) && drawnRings(shown)
        .filter((r) => r.length <= 12 && shown.atoms[r[0]].fill && r.every((i) => shown.atoms[i].fill === shown.atoms[r[0]].fill))
        .map((r) => <polygon key={`fill${r.join("-")}`} points={r.map((i) => `${pos(shown, i)[0] * L},${-pos(shown, i)[1] * L}`).join(" ")} fill={shown.atoms[r[0]].fill} fillOpacity={0.3} />)}
      {/* Highlight colours: a disc behind each highlighted atom, one group per colour so overlapping discs don't darken. */}
      {[...new Set(shown.atoms.map((at) => at.halo).filter((c): c is string => !!c))].map((c) => (
        <g key={`halo${c}`} className="atom-halo" opacity={0.4} fill={c}>
          {shown.atoms.map((at, i) => at.halo === c && <circle key={i} cx={pos(shown, i)[0] * L} cy={-pos(shown, i)[1] * L} r={0.46 * L * scaleOf(at)} />)}
        </g>
      ))}
      <defs>
        {(shown.shapes ?? []).filter((sh) => sh.fill === "shaded").map((sh) => (
          <radialGradient key={sh.id} id={`shade${sh.id}`} cx="0.36" cy="0.32" r="0.72">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" style={{ stopColor: sh.colour ? textInk(sh.colour) : "var(--ink)" }} />
          </radialGradient>
        ))}
      </defs>
      {(shown.shapes ?? []).filter(level).map(shapeFill)}
      {arrows.filter(level).map(curveFill)}
      {arrows.some((a) => level(a) && isOrbital(a)) && orbitalsInk(arrows.filter((a) => level(a) && isOrbital(a)))}
      {gridViews.map((v) => {
        // The grid: a rule above and below, row names right-aligned on the left, each column centred under its component.
        const size = style.captionSize * pt * 0.9 * v.f, font = `${size}px ${fontStack(style.captionFont)}`, y = (k: number) => -(v.top - (k + 0.5) * v.rh) * L + 0.35 * size;
        const x0 = v.start * L, x1 = (Math.max(...v.cols.map((c) => c.x)) + v.width / 2) * L;
        return (
          <g key={`grid${v.arrow}`} className="stoich" fill={v.colour ? textInk(v.colour) : "var(--ink)"} style={{ font }}>
            <line x1={x0} x2={x1} y1={-v.top * L} y2={-v.top * L} stroke={v.colour ? textInk(v.colour) : "var(--ink)"} strokeWidth={frame.line * v.f} />
            <line x1={x0} x2={x1} y1={-(v.top - v.rows.length * v.rh) * L} y2={-(v.top - v.rows.length * v.rh) * L} stroke={v.colour ? textInk(v.colour) : "var(--ink)"} strokeWidth={frame.line * v.f} />
            {v.rows.map((row, k) => <text key={row.id} x={v.left * L} y={y(k)} textAnchor="end">{row.name}</text>)}
            {v.rows.flatMap((row, k) => v.cols.map((c) => {
              const t = gridText(v, c, row);
              return t.text && !(gridEdit?.arrow === v.arrow && gridEdit.key === c.key && gridEdit.row === row.id) ? (
                <text key={`${row.id}${c.key}`} x={c.x * L} y={y(k)} textAnchor="middle" fontWeight={t.typed ? 700 : 400}>{row.id === "formula" ? formula(t.text, size) : t.text}</text>
              ) : null;
            }))}
          </g>
        );
      })}
      {stereoMarks().map((m) => <text key={m.key} className="stereo-label" x={m.x} y={m.y} textAnchor={m.anchor} dominantBaseline="middle" fill={m.colour ?? "var(--ink)"} style={{ font: `${m.upright ? "" : "italic "}${m.size}px ${fontStack(style.captionFont)}` }}>{m.text}</text>)}
      {problemMarks()}
    </>
  ), [shown, drawing, frame, darkPaper, arrows, pt, gridKey, gridEdit, style, stereo, ringsOf, found, doc.atoms]); // eslint-disable-line react-hooks/exhaustive-deps
  // The selection's marks, and the mark on what is under the pointer (Live: a pointer move draws only that again).
  const marks = (
    <>
      {/* One group with one opacity, so overlapping marks don't stack up darker. */}
      <g className="selection-marks">{selected}</g>
      {gridPickMark()}
      {groupFrames}
      {nmrMarks.size > 0 && <g className="nmr-marks">{[...nmrMarks].filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `nmr${i}`, ""))}</g>}
      {shiftLabels().map((l) => (
        <text key={`shift${l.atom}`} className={`nmr-shift${nmrMarks.has(l.atom) ? " lit" : ""}${settings.nmrDetails ? ` q-${nmrQuality.get(l.atom)}` : ""}`} x={l.x} y={l.y} textAnchor={l.anchor} dominantBaseline="middle">{l.text}</text>
      ))}
      <Live store={hovers}>{hovered}</Live>
    </>
  );
  const ink = useMemo(() => (
    <>
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
      {structureInk.map(([id, key, path, move]) => { const [colour, alpha] = key.split("|"); return <path key={`s${id}`} d={path} transform={move} fill={colour ? textInk(colour) : "var(--ink)"} fillOpacity={Number(alpha) < 1 ? Number(alpha) : undefined} />; })}
      {arrowInk.map(([colour, d]) => <path key={`a${colour}`} d={d} fill={colour ? textInk(colour) : "var(--ink)"} />)}
      {cutLabels.map((c) => (
        <text key={c.key} x={c.at[0] * L} y={-c.at[1] * L} textAnchor={c.anchor} fill="var(--ink)" style={{ font: `${style.captionSize * pt * 0.9 * c.f}px ${fontStack(style.captionFont)}` }}>
          {c.formula.split(/(\d+)/).map((part, i) => (/^\d+$/.test(part) ? <tspan key={i} baselineShift="sub" fontSize="75%">{part}</tspan> : <tspan key={i}>{part}</tspan>))}
          <tspan dx={4}>{c.exact.toFixed(4)}</tspan>
        </text>
      ))}
    </>
  ), [drawing.beads, structureInk, arrowInk, darkPaper, cutLabels, style, pt]); // eslint-disable-line react-hooks/exhaustive-deps
  const draggedSpot = drag?.kind === "spot" ? `${drag.plate} ${drag.index}` : undefined;
  const over = useMemo(() => (
    <>
      {(shown.shapes ?? []).filter(level).map(shapeLines)}
      {shown.atoms.map((a, i) => a.enhanced && drawing.ink[i] ? (
        // Enhanced stereo flags: small, by the stereocentre on its open side, as ChemDraw prints them.
        <text key={`st${i}`} className="stereo-flag" textAnchor="middle" fill="var(--ink)" x={(pos(shown, i)[0] + 0.5 * scaleOf(a) * markDirs.get(i)![0]) * L} y={-(pos(shown, i)[1] + 0.5 * scaleOf(a) * markDirs.get(i)![1]) * L + 0.25 * frame.size * scaleOf(a)}
          style={{ font: `${frame.size * 0.7 * scaleOf(a)}px ${fontStack(style.labelFont)}` }}>{a.enhanced}</text>
      ) : null)}
      {shown.atoms.map((a, i) => a.map && drawing.ink[i] ? (
        // Atom map numbers: small, in brand blue, just off the atom on its open side.
        <text key={`map${i}`} className="atom-map" textAnchor="middle" x={(pos(shown, i)[0] + 0.42 * scaleOf(a) * markDirs.get(i)![0]) * L} y={-(pos(shown, i)[1] + 0.42 * scaleOf(a) * markDirs.get(i)![1]) * L + 0.22 * frame.size * scaleOf(a)} style={{ fontSize: frame.size * 0.62 * scaleOf(a) }}>{a.map}</text>
      ) : null)}
      {labelTexts.filter((_, k) => level(shown.atoms[drawing.parts[k].ids[0]]))}
      {placed.filter(level).map((c) => c.id === (writing?.id ?? DRAFT) || c.id === DRAFT ? null : (
        <CaptionText key={`c${c.id}`} c={c} fill={textInk(c.colour ?? style.colour)} font={fontStack(c.font ?? style.captionFont)} reagent={reagents.has(c.id)} pt={pt} />
      ))}
    </>
  ), [shown, frame, darkPaper, draggedSpot, spotPick, style, pt, cell?.id, cell?.r, cell?.c, drawing, markDirs, labelTexts, placed, writing?.id, reagents]); // eslint-disable-line react-hooks/exhaustive-deps
  // Things with a draw order (order.ts), each drawn whole: under all the layers (below zero) or over them, lowest first.
  const lifted = useMemo(() => {
    const things: [number, React.ReactNode][] = [];
    drawing.parts.forEach(({ ids, drawing: d, at, k: grown, turn }, k) => {
      const o = shown.atoms[ids[0]]?.order;
      if (o) things.push([o, (
        <g key={`os${ids[0]}`}>
          {structurePaths(d).map(([key, path]) => { const [colour, alpha] = key.split("|"); return <path key={key} d={path} transform={moveBy(at, grown, turn)} fill={colour ? textInk(colour) : "var(--ink)"} fillOpacity={Number(alpha) < 1 ? Number(alpha) : undefined} />; })}
          {labelTexts[k]}
        </g>
      )]);
    });
    for (const sh of shown.shapes ?? []) if (sh.order) things.push([sh.order, <g key={`osh${sh.id}`}>{shapeFill(sh)}{shapeLines(sh)}</g>]);
    for (const a of [...arrows, ...cycleArrows]) if (a.order) things.push([a.order, (
      <g key={`oa${a.id}`}>
        {isOrbital(a) ? orbitalsInk([a]) : a.curve?.closed && a.fill ? curveFill(a) : <path d={kept(arrowInks, a, lined(a.width), () => toPath(arrowShapes(a, lined(a.width), L)))} fill={a.colour ? textInk(a.colour) : "var(--ink)"} />}
      </g>
    )]);
    for (const c of placed) if (c.order && c.id !== (writing?.id ?? DRAFT) && c.id !== DRAFT) things.push([c.order, <CaptionText key={`oc${c.id}`} c={c} fill={textInk(c.colour ?? style.colour)} font={fontStack(c.font ?? style.captionFont)} reagent={reagents.has(c.id)} pt={pt} />]);
    things.sort((a, b) => a[0] - b[0]);
    return { back: things.filter(([o]) => o < 0).map(([, x]) => x), front: things.filter(([o]) => o > 0).map(([, x]) => x) };
  }, [shown, frame, darkPaper, draggedSpot, spotPick, style, pt, cell?.id, cell?.r, cell?.c, drawing, labelTexts, placed, arrows, cycleArrows, writing?.id, reagents]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={guides.rulers && !home ? "editor with-rulers" : "editor"}>
      {/* The canvas draws again as the view, or what the pointer is over, changes. The drawing's layers in it are made
          by the editor (under, marks, ink and over), so React passes over them. */}
      <Live store={views}>{(view) => <Live store={overs}>{({ selection: overSelection, turn: overTurn, edge: edgeHover, page: pageHover, resize: overResize, cross: overCross }) => (
      <svg
        ref={svg}
        className={`canvas paper-${paper}${view.pinch ? " pinch" : ""}`}
        data-theme={darkPaper ? "dark" : "light"}
        data-tool={tool}
        style={{
          ...((overCross && !drag) || drag?.kind === "crosshair" ? { cursor: "move" } : pageHover && !drag ? { cursor: "zoom-in" } : (overResize && !drag) || drag?.kind === "resize" ? { cursor: CURSORS[drag?.kind === "resize" ? drag.side : overResize!] }
            : (overTurn && !drag) || drag?.kind === "turn" ? { cursor: turnCursor ?? "grab" } : overSelection || drag?.kind === "move" ? { cursor: "move" } : tool === "select" && cursor ? { cursor } : {}),
          ...((edgeHover && !drag) || drag?.kind === "tableedge" ? { cursor: (drag?.kind === "tableedge" ? drag.axis : edgeHover) === "col" ? "col-resize" : "row-resize" } : {}),
          ...(darkPaper ? { "--ink": "#FFFFFF" } : {}),
        } as React.CSSProperties}
        role="img"
        aria-label="Drawing canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { pointer.current = undefined; pointers.set(undefined); setBrush(undefined); if (!drag) setHover({}); }}
        onDoubleClick={(e) => {
          // A double-click ends the Pen's curve.
          if (pen) return finishPen();
          // A double-click on a resize handle opens Scale…, and on the rotation handle Rotate…, as in ChemDraw.
          if (resizeAt(toDoc(e.clientX, e.clientY))) return commands.current.scale_dialog?.();
          if (tool !== "erase" && onTurnHandle(toDoc(e.clientX, e.clientY))) return commands.current.rotate_dialog?.();
          // With Select, a double-click on any part of a group picks the whole of its outermost group (as ChemDraw's).
          if (tool === "select") {
            const h = hit(toDoc(e.clientX, e.clientY)), g = outermost(groupsOf(doc, new Set(atomsOf(doc, h)), new Set(itemsOf(h))));
            if (g) { setSelection(new Set(g.atoms)); setPicked(new Set(g.items)); return; }
          }
          // With Select, double-click an atom to type its label (other tools would draw on each click).
          // Double-click a caption with any tool to type into it.
          const t = hit(toDoc(e.clientX, e.clientY));
          // Double-click a stoichiometry cell to type in it (Limiting? sets the limiting reactant at once).
          const gc = tool !== "erase" ? gridCellAt(toDoc(e.clientX, e.clientY)) : undefined;
          if (gc && gc.row === "limiting") { if (!gc.product) changeGrid(gc.arrow, () => ({ limiting: gc.key })); return; }
          if (gc && !["formula", "mw", "expected", "expectedMoles", "yield"].includes(gc.row)) {
            const v = gridViews.find((x) => x.arrow === gc.arrow)!, c = v.cols.find((x) => x.key === gc.key)!, row = GRID_ROWS.find((r) => r.id === gc.row)!;
            return setGridEdit({ ...gc, value: c.typed[row.field as Field] !== undefined ? gridText(v, c, row).text : "" });
          }
          // Double-click a table to type in the cell.
          const table = tool !== "erase" ? tableAt(toDoc(e.clientX, e.clientY)) : undefined;
          if (table) return openCell(table, toDoc(e.clientX, e.clientY));
          // Double-click a reaction arrow to pick the whole reaction: structures, plus signs, arrows and their text.
          const a = t.arrow !== undefined ? arrows.find((x) => x.id === t.arrow) : undefined;
          if (a && !curved(a) && !isLine(a) && tool !== "erase") {
            const r = reactionOf(a.id);
            if (r) return choose(r.atoms, [...r.arrows, ...r.captions]);
          }
          if (t.caption !== undefined && tool !== "erase") startWriting({ id: t.caption });
          else if (tool === "select" && t.atom !== undefined) editLabel(t.atom);
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {/* The grid and the crosshair, drawn for the window. Not part of the drawing. */}
          <g className="pages" aria-hidden>{gridMarks(view)}</g>
          {/* The page outlines: the page and what its purpose needs, each an edge with corner marks and its name. Not part of the drawing. */}
          <g className="pages" aria-hidden ref={pagesEl}>
            {style.edges && pages.map(([name, w, h]) => {
              const [x, y, t] = [(w / 2) * mm * L, (h / 2) * mm * L, 10 / view.zoom];
              return (
                <g key={name} className={pageHover === name ? "page hovered" : "page"}>
                  <rect className="page-edge" x={-x} y={-y} width={2 * x} height={2 * y} vectorEffect="non-scaling-stroke" />
                  {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => (
                    <path key={`${sx}${sy}`} d={`M${sx * x - sx * t} ${sy * y}H${sx * x}V${sy * y - sy * t}`} vectorEffect="non-scaling-stroke" />
                  ))}
                  <text x={-x + 3 / view.zoom} y={-y + 13 / view.zoom} style={{ fontSize: 11 / view.zoom }}>{name}</text>
                </g>
              );
            })}
          </g>
          {/* The drawing and its marks, without the page, so the Spectrum panel can show the structure beside its spectrum. */}
          <g id="world">
          {/* The whole drawing scaled in proportion is shown scaled as it is, as nothing in it changes but its size. */}
          <g transform={drag?.kind === "resize" && drag.whole && drag.lines && drag.size[0] === drag.size[1] && drag.size[0] !== 1
            ? `translate(${drag.anchor[0] * L * (1 - drag.size[0])} ${-drag.anchor[1] * L * (1 - drag.size[0])}) scale(${drag.size[0]})` : undefined}>
          {lifted.back}
          {under}
          {marks}
          {ink}
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
          {over}
          {lifted.front}
          </g>
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
              {ghost.labels.map((l, i) => <text key={i} x={l.x} y={l.y} textDecoration={l.underline ? "underline" : undefined} style={{ font: labelFont(l) }}>{l.text}</text>)}
            </g>
          )}
          {(() => {
            // A picked arrow's handles: its ends, and the middle of a curved one.
            const ids = [...picked], a = ids.length === 1 && !selection.size && drag?.kind !== "move" ? arrows.find((x) => x.id === ids[0]) : undefined;
            const wh = drag?.kind === "move" ? undefined : widthHandle();
            if ((!a || a.kind === "curve") && !wh) return null;
            const points = wh ? [wh.at] : [a!.from, a!.to, ...(curved(a!) ? [bendPoint(a!)] : [])];
            return points.map((q, i) => <circle key={`hd${i}`} className="handle" cx={q[0] * L} cy={-q[1] * L} r={4 / view.zoom} vectorEffect="non-scaling-stroke" />);
          })()}
          {(() => {
            // The selection's frame with its resize handles and rotation handle, and the centre the selection turns
            // about (a +, which Option-drag moves); while resizing, the frame as it is now and the scale in its middle;
            // while turning, the centre and the angle.
            const h = drag?.kind === "turn" ? undefined : turnHandle(view.zoom), c = drag?.kind === "turn" ? drag.centre : h && centreMark;
            const centre = c && <path className="turn-centre" d="M-5 0H5M0 -5V5" transform={`translate(${c[0] * L} ${-c[1] * L}) scale(${1 / view.zoom})`} aria-hidden />;
            if (drag?.kind === "turn") {
              return <>{centre}<text className="turn-angle" x={c![0] * L} y={-c![1] * L - 10 / view.zoom} textAnchor="middle" style={{ fontSize: 11 / view.zoom }}>{`${Math.round(drag.degrees)}°`}</text></>;
            }
            if (drag?.kind === "resize") {
              const [sx, sy] = drag.size, a = drag.anchor, f = drag.frame, x0 = a[0] + (f[0] - a[0]) * sx, x1 = a[0] + (f[2] - a[0]) * sx, y0 = a[1] + (f[1] - a[1]) * sy, y1 = a[1] + (f[3] - a[1]) * sy;
              return (
                <g aria-hidden>
                  <rect className="selection-frame" x={x0 * L} y={-y1 * L} width={(x1 - x0) * L} height={(y1 - y0) * L} vectorEffect="non-scaling-stroke" />
                  <text className="turn-angle" x={((x0 + x1) / 2) * L} y={(-(y0 + y1) / 2) * L} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 12 / view.zoom }}>{percentOf(drag.size)}</text>
                </g>
              );
            }
            const b = frameBox(view.zoom), r = 3.5 / view.zoom;
            return b && (
              <g aria-hidden>
                {selectionFrame!.handles && <rect className="selection-frame" x={b[0] * L} y={-b[3] * L} width={(b[2] - b[0]) * L} height={(b[3] - b[1]) * L} vectorEffect="non-scaling-stroke" />}
                {frameSides(b, view.zoom).map((side) => { const q = handlePoint(b, side); return <rect key={side} className={overResize === side ? "resize-handle hot" : "resize-handle"} x={q[0] * L - r} y={-q[1] * L - r} width={2 * r} height={2 * r} vectorEffect="non-scaling-stroke" />; })}
                {centre}
                {h && (
                  <g className={overTurn ? "turn-handle hot" : "turn-handle"} transform={`translate(${h[0]} ${h[1]}) scale(${1 / view.zoom})`}>
                    <circle r={9} />
                    <path d="M3.6 -3.2 A4.8 4.8 0 1 0 4.6 1.6 M3.6 -3.2 L3.8 -6.2 M3.6 -3.2 L0.7 -3" />
                  </g>
                )}
              </g>
            );
          })()}
          {box}
          {drag?.kind === "lasso" && drag.moved && (
            <polygon className="box" points={drag.points.map(([x, y]) => `${x * L},${-y * L}`).join(" ")} vectorEffect="non-scaling-stroke" />
          )}
          {rubbing}
          {drag?.kind === "chain" && drag.to && (
            <text className="count" x={drag.to[0] * L + 6 / view.zoom} y={-drag.to[1] * L - 6 / view.zoom} style={{ fontSize: 11 / view.zoom }}>
              {chainTo(doc, drag.from, drag.to).bonds}
            </text>
          )}
          <Live store={brushes}>{(brush) => tool === "erase" && brush && <circle className="brush" cx={brush[0] * L} cy={-brush[1] * L} r={settings.eraser * L} vectorEffect="non-scaling-stroke" />}</Live>
          {drag?.kind === "move" && drag.guides.map((g, i) => g.axis === "x"
            ? <line key={i} className="guide" x1={g.at * L} x2={g.at * L} y1={-g.from * L} y2={-g.to * L} vectorEffect="non-scaling-stroke" />
            : <line key={i} className="guide" y1={-g.at * L} y2={-g.at * L} x1={g.from * L} x2={g.to * L} vectorEffect="non-scaling-stroke" />)}
          {drag?.kind === "move" && drag.point && <circle className="snap-point" cx={drag.point[0] * L} cy={-drag.point[1] * L} r={0.22 * L} vectorEffect="non-scaling-stroke" />}
          </g>
        </g>
      </svg>
      )}</Live>}</Live>
      {guides.rulers && !home && <Live store={views}>{(view) => <Live store={pointers}>{(at) => (
        <Rulers view={view} scale={L} mm={mm} origin={corner} unit={settings.rulerUnit} pointer={at} extent={rulerExtent}
          onUnit={() => setSettings((s) => ({ ...s, rulerUnit: RULER_UNITS[(RULER_UNITS.findIndex(([u]) => u === s.rulerUnit) + 1) % RULER_UNITS.length][0] }))} />
      )}</Live>}</Live>}
      {editing && doc.atoms[editing.atom] && <Live store={views}>{(view) => {
        // The label box sits on the atom, in the label font at the size the label is drawn and the current zoom.
        const [ax, ay] = pos(doc, editing.atom), a = doc.atoms[editing.atom], drawn = (a.size ?? style.labelSize) * scaleOf(a);
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
            style={{ left: view.x + ax * L * view.zoom, top: view.y - ay * L * view.zoom, fontSize: frame.size * (drawn / style.labelSize) * view.zoom, fontFamily: fontStack(style.labelFont) }}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { e.preventDefault(); commit(); }
              // ⇧⌘N in the browser (the app's menu does it there): the label's text as a name.
              if (!TAURI && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") { e.preventDefault(); commands.current.name_to_structure(); }
            }}
            onBlur={commit}
          />
        );
      }}</Live>}
      {printing && (
        // What Print prints: only this, at true size (see editor.css, @media print).
        <div className="print-root" aria-hidden>
          <style>{`@page { size: ${printing.w.toFixed(2)}pt ${printing.h.toFixed(2)}pt; margin: 0; }`}</style>
          <img src={printing.src} alt="" style={{ width: `${printing.w}pt`, height: `${printing.h}pt` }} />
        </div>
      )}
      {gridEdit && <Live store={views}>{(view) => {
        // The stoichiometry cell box, over the cell; Enter keeps it, Escape leaves it as it was.
        const v = gridViews.find((x) => x.arrow === gridEdit.arrow);
        if (!v) return null;
        const z = view.zoom, w = v.width * L * z, h = v.rh * L * z;
        return (
          <input
            className="cell-box" aria-label="Amount" autoFocus spellCheck={false} defaultValue={gridEdit.value}
            style={{ left: view.x + gridEdit.x * L * z - w / 2, top: view.y - gridEdit.y * L * z, width: w, height: h, font: `${style.captionSize * pt * 0.9 * v.f * z}px ${fontStack(style.captionFont)}` }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitGridCell(e.currentTarget.value); } if (e.key === "Escape") { e.preventDefault(); setGridEdit(undefined); } }}
            onBlur={(e) => commitGridCell(e.currentTarget.value)}
          />
        );
      }}</Live>}
      {cell && <Live store={views}>{(view) => {
        // The cell box sits over the cell, in the table's font at the current zoom. Tab and Shift-Tab move along the
        // row, Enter and the up and down arrows move down and up a column, and Tab past the last cell adds a row.
        const sh = doc.shapes?.find((x) => x.id === cell.id);
        if (!sh?.table) return null;
        const t = tableLayout(sh, cellWidth(sh), style.captionSize), z = view.zoom, size = (sh.size ?? style.captionSize) * pt * t.f * z, cols = t.cols;
        const width = Math.max(t.widths[cell.c], (cellWidth(sh)(cell.value) + 2 * TABLE_PAD) * t.f) * L * z, align = sh.table.align?.[cell.c] ?? "centre";
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
              width, height: t.heights[cell.r] * L * z, ...textFace(sh, size), color: sh.colour ?? style.colour,
              textAlign: align === "centre" ? "center" : align, padding: `0 ${TABLE_PAD * t.f * L * z}px`,
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
      }}</Live>}
      {writing && <Live store={views}>{(view) => {
        // The caption box sits exactly over the caption, in its font at the current zoom, so typing is in place.
        const c = placed.find((x) => x.id === (writing.id ?? DRAFT));
        if (!c) return null;
        // Its lines as far apart as the caption's line spacing puts them (the first two lines' gap), each baseline where
        // the canvas draws it: the leading split above and below Arial's ascent and descent.
        const z = view.zoom, size = c.size * z, slack = 0.5 * size, gap = c.lines.length > 1 ? c.lines[1].y - c.lines[0].y : 1.2 * c.size, lead = (gap - 1.117 * c.size) / 2 + 0.905 * c.size;
        // A caption with a width wraps in the box as it does on the canvas: the box is that wide, from its anchor.
        const own = writing.id !== undefined ? doc.captions?.find((x) => x.id === writing.id) : undefined, wrapAt = (writing.style.width ?? own?.width ?? 0) * L;
        const x0 = !wrapAt ? c.box[0] : c.anchor === "end" ? c.lines[0].x - wrapAt : c.anchor === "middle" ? c.lines[0].x - wrapAt / 2 : c.lines[0].x;
        return (
          <RichBox
            returnNewLine={!settings.captionOptionReturn}
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
              left: view.x + x0 * z - slack,
              top: view.y + (c.lines[0].y - lead) * z,
              width: (wrapAt || c.box[2] - c.box[0]) * z + 2 * slack,
              whiteSpace: wrapAt ? "pre-wrap" : undefined,
              height: c.lines.length * gap * z,
              font: `${c.italic ? "italic " : ""}${c.bold ? "bold " : ""}${size}px/${gap * z}px ${fontStack(c.font ?? style.captionFont)}`,
              color: c.colour ?? style.colour,
              padding: `0 ${slack}px`,
              textDecoration: c.underline ? "underline" : undefined,
              textAlign: (writing.style.align ?? own?.align) === "justify" ? "justify" : c.anchor === "start" ? "left" : c.anchor === "end" ? "right" : "center",
            }}
            onRuns={(runs, rebuild) => setWriting((w) => w && { ...w, runs, value: plainOf(runs), ...(rebuild ? { version: (w.version ?? 0) + 1, caret: rebuild, pending: undefined } : {}) })}
            onKeyDown={(e) => {
              // Return reaches here only when it does not make a new line (Settings: Option-Return for a new line).
              if (e.key === "Enter" && !e.shiftKey && !e.altKey) { e.preventDefault(); commitWriting(); }
              if (e.key === "Escape") { e.preventDefault(); commitWriting(); } // Escape keeps the text, as a click elsewhere does
              // ChemDraw's text keys, in the browser (the desktop app's Text menu has them too).
              if (!TAURI && (e.metaKey || e.ctrlKey)) {
                const k = e.key.toLowerCase(), command = e.shiftKey && k === "n" ? "name_to_structure" : { b: "caption.bold", i: "caption.italic", u: "caption.underline", t: "caption.plain", f: "caption.formula", "-": "caption.sub", "=": "caption.super", "+": "caption.super" }[k];
                if (command) { e.preventDefault(); runAction(command); }
              }
            }}
            onBlur={() => commitWriting()}
          />
        );
      }}</Live>}
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
                  <X size={12} />
                </button>
              </div>
            );
          })}
          {historyMore && (
            <div role="option" aria-selected={recent.at === historyRows.length} className="name-recent show-all" onPointerMove={() => setRecent((h) => ({ ...h, at: historyRows.length }))} onClick={() => setRecent({ all: true, at: -1 })}>
              <span className="name-thumb"><CaretDown size={12} /></span>
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
            // ⇧⌘N draws the name too (in the browser; the app's menu does it there).
            const again = !TAURI && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n";
            if (e.key !== "Enter" && !again) return;
            e.preventDefault();
            if (drawNamed()) return;
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
          isDefault={sameStyle(style, styleFor(settings, purposeOf(settings, style.purpose) ? style.purpose! : settings.purpose))}
          preview={preview}
          onStyle={(next) => set({ ...scaleSizes(doc, next.scale / style.scale), style: next }, true)}
          onDefault={() => keepForNew(style)}
          purposes={purposeList}
          onPurpose={applyPurpose}
          onSavePurpose={settings.ownPurposes.length < MAX_PURPOSES ? savePurpose : undefined}
          keys={settings.keys}
          onKeys={(keys) => setSettings((s) => ({ ...s, keys }))}
          files={settings.files}
          onFiles={(files) => setSettings((s) => ({ ...s, files }))}
          captionOptionReturn={settings.captionOptionReturn}
          onCaptionOptionReturn={(captionOptionReturn) => setSettings((s) => ({ ...s, captionOptionReturn }))}
          panelMenus={settings.panelMenus}
          onPanelMenus={(panelMenus) => setSettings((s) => ({ ...s, panelMenus }))}
          onlineSearch={settings.onlineSearch}
          onOnlineSearch={(onlineSearch) => setSettings((s) => ({ ...s, onlineSearch }))}
          rulerUnit={settings.rulerUnit}
          onRulerUnit={(rulerUnit) => setSettings((s) => ({ ...s, rulerUnit }))}
          menuKeys={menuReady ? [] : Object.values(MENU_NAMES).flatMap(([name, keys]) => (keys ? [[name, platformLabel(keys)!] as [string, string]] : []))}
          palette={settings.palette}
          onPalette={(palette) => setSettings((s) => ({ ...s, palette }))}
          warnings={settings.warnings}
          onWarnings={(warnings) => setSettings((s) => ({ ...s, warnings }))}
          warningTypes={settings.warningTypes}
          onWarningTypes={(warningTypes) => setSettings((s) => ({ ...s, warningTypes }))}
          checkCopy={settings.checkCopy}
          onCheckCopy={(checkCopy) => setSettings((s) => ({ ...s, checkCopy }))}
          adding={addingColour}
          onClose={() => { setSettingsOpen(undefined); setAddingColour(false); }}
        />
      )}
      {pop && <span key={pop.n} className="halo" style={{ left: pop.x, top: pop.y }} aria-hidden />}

      <Palette
        tool={tool}
        coach={coachTool}
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
        undoKey={hint("undo")}
        redoKey={hint("redo")}
        onTool={setTool}
        onVariant={(t, kind) => setSettings((s) => ({ ...s, variants: { ...s.variants, [t]: kind } }))}
        onUndo={() => undo()}
        onRedo={() => undo(true)}
        wide={settings.paletteWide}
        onWide={(wide) => setSettings((s) => ({ ...s, paletteWide: wide }))}
        stripWidths={settings.strips}
        onStripWidth={(t, width) => setSettings((s) => ({ ...s, strips: { ...s.strips, [t]: width } }))}
      />

      {spectrum && <Live store={hovers}>{(hover) => (
        <SpectrumPanel
          prediction={nmr?.prediction}
          nucleus={spectrum}
          mhz={settings.nmrMhz}
          solvent={settings.nmrSolvent}
          lit={nmrLit(hover.atom)}
          onNucleus={(n) => setSpectrum(n)}
          onMhz={(mhz) => setSettings((s) => ({ ...s, nmrMhz: mhz }))}
          onSolvent={(solvent) => setSettings((s) => ({ ...s, nmrSolvent: solvent }))}
          onPoint={setNmrPoint}
          onCopy={(text) => runAction(`copy_text:${text}`)}
          onClose={() => { setSpectrum(undefined); setNmrPoint(undefined); }}
          inset={(() => {
            // The structure's box on the canvas (px, unzoomed), with room for its shift labels.
            const ps = [...new Set(nmr?.toDoc ?? [])].filter((i) => i < shown.atoms.length).map((i) => pos(shown, i));
            if (!ps.length) return undefined;
            const xs = ps.map((q) => q[0] * L), ys = ps.map((q) => -q[1] * L), pad = 2.6 * L;
            return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad] as [number, number, number, number];
          })()}
          solventPeaks={settings.nmrSolventPeaks}
          colours={nmrColours}
          details={settings.nmrDetails}
          onDetails={(on) => setSettings((s) => ({ ...s, nmrDetails: on }))}
          onColour={(k, c) => haloSignals(() => c, k)}
          onColourAll={(on) => haloSignals((k) => (on ? PEAK_COLOURS[k % PEAK_COLOURS.length] : undefined))}
          onKey={addKey}
          onSolventPeaks={(on) => setSettings((s) => ({ ...s, nmrSolventPeaks: on }))}
        />
      )}</Live>}
      {settings.properties && properties && (
        <Properties
          values={properties.values}
          chosen={settings.propertyRows}
          onChoose={(key) => setSettings((s) => ({ ...s, propertyRows: s.propertyRows.includes(key) ? s.propertyRows.filter((k) => k !== key) : [...s.propertyRows, key] }))}
          onCopy={(text) => runAction(`copy_text:${text}`)}
          onAdd={addProperties}
          onClose={() => setSettings((s) => ({ ...s, properties: false }))}
          stacked={!!spectrum}
        />
      )}
      <Live store={carets}>{() => {
        const context = panelContext ?? contextOf();
        return (
          <Actions
            open={settings.actions}
            context={context}
            analysis={analysis}
            problems={found}
            fonts={fontList}
            hiddenWarnings={hiddenHere()}
            warned={selectedOf(found).length}
            online={settings.onlineSearch}
            messy={untidy}
            hint={hint}
            onOpen={(open) => setSettings((s) => ({ ...s, actions: open }))}
            layout={settings.actionLayout}
            onLayout={(kind, layout) => setSettings((s) => ({ ...s, actionLayout: { ...s.actionLayout, [kind]: layout } }))}
            colour={selectionColour(context)}
            menus={settings.panelMenus}
            grouping={grouping}
            palette={[...settings.palette, ...docColours]}
            sizes={sizeList}
            scale={selectionScale()}
            run={runAction}
          />
        );
      }}</Live>
      {dialog?.kind === "rotate" && (
        <Dialog title="Rotate" action="Rotate" onClose={() => setDialog(undefined)}
          onAction={() => { const a = Number(dialog.angle); if (Number.isFinite(a)) rotateBy(dialog.clockwise ? -a : a); setDialog(undefined); }}>
          <label className="dialog-row">
            <span>Angle</span>
            <NumberField label="Angle" unit="°" min={-360} max={360} step={1} value={Number(dialog.angle)} onChange={(n) => setDialog({ ...dialog, angle: String(n) })} />
          </label>
          <Segmented label="Direction" value={dialog.clockwise ? "cw" : "ccw"} options={[["ccw", "Anticlockwise"], ["cw", "Clockwise"]]} onChange={(v) => setDialog({ ...dialog, clockwise: v === "cw" })} />
        </Dialog>
      )}
      {(home || homeLeaving) && (homeKind.current === "name"
        ? <NameBox leaving={!home} onDone={(userName) => { setSettings((s) => ({ ...s, userName })); setWelcomed(true); if (!settings.tutorialDone) startTutorial(); }} />
        : <Home leaving={!home} name={settings.userName ?? ""} first={welcomed} away={away} recents={recents} newKey={keyLabel("enter")} openKey={hint("open")}
            purposes={purposeList} purpose={settings.purpose} onNew={newDrawing} onOpen={openDrawing} onRecent={openRecent}
            onRemovePurpose={(id) => setSettings((s) => ({ ...s, ownPurposes: s.ownPurposes.filter((p) => p.id !== id), purpose: s.purpose === id ? "paper" : s.purpose }))}
            onRemove={(r) => void invoke("recent_remove", { path: r.path }).then(refreshRecents).catch(() => {})} />)}
      {coach > 0 && !home && (
        <Coach key={coach} doc={doc} selected={selection.size} seen={seen} keys={{ clean: hint("clean_up") ?? "", copy: keyLabel("mod+c") }}
          onTool={setCoachTool} onSkip={() => setCoach(0)} onFinish={() => { const fresh: Mol = { ...EMPTY, style: doc.style }; setCoach(0); set(fresh); setFile({ saved: fresh }); }} />
      )}
      {dialog?.kind === "unsaved" && (
        <Dialog title={`Save changes to “${name}”?`} action="Save" onClose={() => setDialog(undefined)}
          alt={{ label: "Don’t Save", onClick: () => { const d = dialog; setDialog(undefined); d.next(); } }}
          onAction={() => { const d = dialog; setDialog(undefined); void save(false).then((ok) => { if (ok) d.next(); }); }}>
          <p className="dialog-note">If you do not save, your changes are lost.</p>
        </Dialog>
      )}
      {about && <About onClose={() => setAbout(false)} />}
      {feedback && <Feedback picture={feedback.picture} onClose={() => setFeedback(undefined)} onError={setNotice}
        onSent={() => { setFeedback(undefined); setNotice("Your feedback is ready to send in your mail app.", true); }} />}
      <ExportButton hint={platformLabel(EXPORT_KEYS)} onQuick={() => checkFirst(() => void quickExport())} onExport={() => checkFirst(openExport)} />
      {exportView && (
        <ExportDialog prefs={settings.files} onPrefs={(p) => setSettings((s) => ({ ...s, files: { ...s.files, ...p } }))} pictures={exportView}
          chemistry={(part) => {
            // The chosen format is made now, so the dialog says at once when it cannot be. The others are offered
            // when the part can have them, and made when they are chosen.
            const mol = exportView.parts[part], may = !!mol?.atoms.length && loaded, f = settings.files.format, steps = may && mol ? stepsIn(mol).length : 0;
            const has: Partial<Record<ExportFormat, boolean>> = { oct: true, cdxml: true, smi: may, ...Object.fromEntries(MDL.map((x) => [x, x.startsWith("rxn") ? steps === 1 : x.startsWith("rdf") ? steps > 0 : may])) };
            const pf: PartFormat | undefined = f === "oct" || f === "cdxml" ? f : f === "smi" ? "smiles" : MDL.includes(f) ? (f as PartFormat) : undefined;
            if (pf && mol) has[f] = !!formatOf(mol, pf);
            return has;
          }}
          onExport={(part) => void exportPart(part)} onClose={() => setExportView(undefined)} />
      )}
      {dialog?.kind === "atom" && (
        <Dialog title="Atom Properties" action="Apply" onClose={() => setDialog(undefined)}
          onAction={() => {
            const d = dialog, a = doc.atoms[d.atom];
            if (!a) return setDialog(undefined);
            let m = d.element.trim() && d.element.trim() !== (a.text ?? a.label) ? setLabel(doc, d.atom, d.element.trim()) : doc;
            const charge = Math.max(-9, Math.min(9, Math.round(Number(d.charge) || 0))), isotope = Math.round(Number(d.isotope));
            const group = Math.max(1, Math.min(99, Math.round(Number(d.group)) || 1)), enhanced = d.stereo === "abs" ? "abs" : d.stereo ? `${d.stereo}${group}` : undefined;
            m = { ...m, atoms: m.atoms.map((x, k) => (k === d.atom ? { ...x, charge: charge || undefined, isotope: isotope >= 1 && isotope <= 300 ? isotope : undefined, radical: Number(d.radical) || undefined, enhanced } : x)) };
            // The query properties changed in the dialog, on every selected atom. After Use Defaults, every selected
            // atom starts from none.
            const changed = (Object.keys({ ...d.q, ...d.q0 }) as (keyof AtomQuery)[]).filter((k) => JSON.stringify(d.q[k]) !== JSON.stringify(d.q0[k]));
            if (changed.length || d.reset) m = { ...m, atoms: m.atoms.map((x, k) => {
              if (!d.targets.includes(k)) return x;
              const q: AtomQuery = d.reset ? {} : { ...x.query };
              for (const key of d.reset ? (Object.keys(d.q) as (keyof AtomQuery)[]) : changed) { if (d.q[key] === undefined) delete q[key]; else (q as Record<string, unknown>)[key] = d.q[key]; }
              return { ...x, query: anyQuery(q) ? q : undefined };
            }) };
            set(m, true);
            setDialog(undefined);
          }}
          alt={{ label: "Use Defaults", onClick: () => setDialog({ ...dialog, q: {}, reset: true }) }}>
          <label className="dialog-row"><span>Element</span><span className="unit-field text"><input aria-label="Element" value={dialog.element} onFocus={(e) => e.target.select()} onChange={(e) => setDialog({ ...dialog, element: e.target.value.slice(0, 40) })} /></span></label>
          <label className="dialog-row"><span>Charge</span><NumberField label="Charge" min={-9} max={9} step={1} value={Number(dialog.charge) || 0} onChange={(n) => setDialog({ ...dialog, charge: String(Math.round(n)) })} /></label>
          <label className="dialog-row"><span>Isotope</span><NumberField label="Isotope (mass number)" min={1} max={300} step={1} placeholder="Natural" value={dialog.isotope ? Number(dialog.isotope) : undefined}
            onChange={(n) => setDialog({ ...dialog, isotope: String(Math.round(n)) })} onClear={() => setDialog({ ...dialog, isotope: "" })} /></label>
          <div className="dialog-row"><span>Radical</span>
            <Segmented label="Radical" value={dialog.radical} options={[["0", "None"], ["1", "•", "Doublet"], ["2", "••", "Triplet"], ["3", ":", "Singlet"]]} onChange={(v) => setDialog({ ...dialog, radical: v })} />
          </div>
          {/* ChemDraw's Enhanced Stereochemistry, for a stereocentre: None, Absolute, Or or And, with a group number. */}
          {(stereocentres(doc).includes(dialog.atom) || doc.atoms[dialog.atom]?.enhanced) && (
            <div className="dialog-row"><span>Enhanced stereo</span>
              <Segmented label="Enhanced stereo" value={dialog.stereo} options={[["", "None"], ["abs", "Absolute"], ["or", "Or"], ["&", "And"]]} onChange={(v) => setDialog({ ...dialog, stereo: v })} />
            </div>
          )}
          {(dialog.stereo === "or" || dialog.stereo === "&") && (
            <label className="dialog-row"><span>Group</span><NumberField label="Group number" min={1} max={99} step={1} value={Number(dialog.group) || 1} onChange={(n) => setDialog({ ...dialog, group: String(Math.round(n)) })} /></label>
          )}
          {/* ChemDraw's atom query properties, for a search. Unset is ChemDraw's default for each. */}
          {(() => {
            const q = dialog.q, setQ = (k: keyof AtomQuery, v: unknown) => setDialog({ ...dialog, q: Object.fromEntries(Object.entries({ ...q, [k]: v }).filter(([, x]) => x !== undefined)) as AtomQuery });
            const row = (k: keyof AtomQuery & string, name: string, options: [string, string][]) => (
              <div className="dialog-row" key={k}><span>{name}</span><Select label={name} value={String(q[k] ?? "")} options={options} onChange={(v) => setQ(k, v === "yes" ? true : v || undefined)} /></div>
            );
            const yesNo = (k: keyof AtomQuery & string, name: string, no: string, yes: string) => (
              <div className="dialog-row" key={k}><span>{name}</span><Segmented label={name} value={q[k] ? "yes" : ""} options={[["", no], ["yes", yes]]} onChange={(v) => setQ(k, v ? true : undefined)} /></div>
            );
            return (
              <>
                <div className="dialog-row"><span>Substituents</span>
                  <Select label="Substituents" value={q.subst?.kind ?? ""} options={[["", "Unspecified"], ["free", "Free sites"], ["upto", "Up to"], ["exactly", "Exactly"]]}
                    onChange={(v) => setQ("subst", v ? { kind: v, n: q.subst?.n ?? 0 } : undefined)} />
                  {q.subst && <NumberField label="Substituents" min={0} max={15} step={1} value={q.subst.n} onChange={(n) => setQ("subst", { kind: q.subst!.kind, n: Math.round(n) })} />}
                </div>
                {yesNo("noH", "Implicit hydrogens", "Allowed", "Not allowed")}
                {row("rings", "Ring bond count", [["", "Any"], ["none", "No ring bonds"], ["drawn", "As drawn"], ["simple", "Simple ring"], ["fusion", "Fusion"], ["spiro", "Spiro or higher"]])}
                {row("unsat", "Unsaturation", [["", "Unspecified"], ["absent", "Must be absent"], ["present", "Must be present"]])}
                {yesNo("change", "Reaction change", "May be anything", "Must be as specified")}
                {row("stereo", "Reaction stereo", [["", "Any"], ["inversion", "Inversion"], ["retention", "Retention"]])}
                {row("translation", "Translation", [["", "Equal"], ["broad", "Broad"], ["narrow", "Narrow"], ["any", "Any"]])}
                {row("abundance", "Isotopic abundance", [["", "Unspecified"], ["any", "Any"], ["natural", "Natural"], ["enriched", "Enriched"], ["deficient", "Deficient"], ["nonnatural", "Nonnatural"]])}
                {yesNo("valence", "Abnormal valence", "Not allowed", "Allowed")}
              </>
            );
          })()}
        </Dialog>
      )}
      {dialog?.kind === "bond" && (() => {
        const d = dialog, kinds = Object.keys(BONDS) as BondKind[];
        // Use Defaults: the bond's own drawn type, no topology or reaction centre.
        const drawn = (k: number) => { const b = doc.bonds[k]; return kinds.find((x) => { const sp: BondSpec = BONDS[x].spec; return sp.type === b.type && sp.stereo === b.stereo && sp.display === b.display; }) ?? ""; };
        return (
          <Dialog title="Bond Properties" action="Apply" onClose={() => setDialog(undefined)} alt={{ label: "Use Defaults", onClick: () => setDialog({ ...d, type: drawn(d.bonds[0]), topology: "", rxn: "" }) }}
            onAction={() => {
              const kind = d.type !== d.start.type ? d.type : undefined;
              set({ ...doc, bonds: doc.bonds.map((b, k) => {
                if (!d.bonds.includes(k)) return b;
                let x: Bond = b;
                if (kind && kind in BONDS) { const sp: BondSpec = BONDS[kind as BondKind].spec; x = { ...x, type: sp.type, stereo: sp.stereo, display: sp.display, query: undefined }; }
                else if (kind) x = { ...x, query: kind as Bond["query"] };
                if (d.topology !== d.start.topology) x = { ...x, topology: (d.topology || undefined) as Bond["topology"] };
                if (d.rxn !== d.start.rxn) x = { ...x, rxn: (d.rxn || undefined) as Bond["rxn"] };
                return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as Bond;
              }) }, true);
              setDialog(undefined);
            }}>
            <div className="dialog-row"><span>Bond type</span>
              <Select label="Bond type" value={d.type} onChange={(type) => setDialog({ ...d, type })}
                options={[...kinds.map((k): [string, string] => [k, BONDS[k].name]), ["any", "Any"], ["sd", "Single or double"], ["sa", "Single or aromatic"], ["da", "Double or aromatic"]]} />
            </div>
            <div className="dialog-row"><span>Topology</span>
              <Select label="Topology" value={d.topology} onChange={(topology) => setDialog({ ...d, topology })} options={[["", "Unspecified"], ["ring", "Ring"], ["chain", "Chain"], ["either", "Ring or chain"]]} />
            </div>
            <div className="dialog-row"><span>Reaction centre</span>
              <Select label="Reaction centre" value={d.rxn} onChange={(rxn) => setDialog({ ...d, rxn })}
                options={[["", "Unspecified"], ["centre", "Centre"], ["makebreak", "Make or break"], ["change", "Change"], ["makechange", "Make and change"], ["not", "Not centre"], ["nochange", "Not modified"], ["unmapped", "Unmapped"]]} />
            </div>
          </Dialog>
        );
      })()}
      {dialog?.kind === "bracket" && (() => {
        const d = dialog, u = d.usage as BracketUsage | "";
        // Repeat Pattern applies to repeating units, not to components, mixtures, multiple groups or generic brackets.
        const repeats = !!u && !["c", "mix", "f", "mult", "gen"].includes(u);
        return (
          <Dialog title="Bracket Properties" action="Apply" onClose={() => setDialog(undefined)} alt={{ label: "Use Defaults", onClick: () => setDialog({ ...d, usage: "", label: "", count: "2", order: "0", mw: "", pattern: "", flip: "" }) }}
            onAction={() => {
              const n = Number(d.count), o = Math.round(Number(d.order)), mw = Number(d.mw);
              const polymer: Polymer | undefined = !u ? undefined : {
                usage: u, ...((u === "sru" || u === "param") && d.label.trim() && !(u === "sru" && d.label.trim() === "n") ? { label: d.label.trim().slice(0, 20) } : {}),
                ...(u === "mult" && n > 0 && n !== 2 ? { label: String(n) } : {}), ...(u === "c" && o > 0 ? { order: Math.min(999, o) } : {}),
                ...(u === "param" && mw > 0 ? { mw } : {}), ...(repeats && d.pattern ? { pattern: d.pattern as Polymer["pattern"] } : {}), ...(d.flippable && d.flip ? { flip: d.flip as Polymer["flip"] } : {}),
              };
              set(updateShape(doc, d.shape, { polymer }), true);
              setDialog(undefined);
            }}>
            <div className="dialog-row"><span>Bracket usage</span>
              <Select label="Bracket usage" value={d.usage} onChange={(usage) => setDialog({ ...d, usage })} options={[["", "Unspecified"], ...USAGE_KINDS.map((k): [string, string] => [k, USAGES[k].name])]} />
            </div>
            {(u === "sru" || u === "param") && (
              <label className="dialog-row"><span>{u === "sru" ? "SRU label" : "Label"}</span><span className="unit-field text"><input aria-label="Label" value={d.label} placeholder={u === "sru" ? "n" : "n, 3 or 2-5"} onFocus={(e) => e.target.select()} onChange={(e) => setDialog({ ...d, label: e.target.value.slice(0, 20) })} /></span></label>
            )}
            {u === "param" && <label className="dialog-row"><span>Mw or Mn</span><NumberField label="Mw or Mn" min={0.01} max={1e8} step={1} value={d.mw ? Number(d.mw) : undefined} placeholder="None" onChange={(v) => setDialog({ ...d, mw: String(v) })} onClear={() => setDialog({ ...d, mw: "" })} /></label>}
            {u === "mult" && <label className="dialog-row"><span>Repeat count</span><NumberField label="Repeat count" min={1} max={1e6} step={1} value={Number(d.count) || 2} onChange={(v) => setDialog({ ...d, count: String(Math.max(1, Math.round(v))) })} /></label>}
            {u === "c" && <label className="dialog-row"><span>Order</span><NumberField label="Component order" min={0} max={999} step={1} value={Number(d.order) || 0} onChange={(v) => setDialog({ ...d, order: String(Math.round(v)) })} /></label>}
            {repeats && (
              <div className="dialog-row"><span>Repeat pattern</span>
                <Select label="Repeat pattern" value={d.pattern} onChange={(pattern) => setDialog({ ...d, pattern })} options={[["", "Head-to-tail"], ["hh", "Head-to-head"], ["eu", "Either or unknown"]]} />
              </div>
            )}
            {d.flippable && u && (
              <div className="dialog-row"><span>Flip type</span>
                <Select label="Flip type" value={d.flip} onChange={(flip) => setDialog({ ...d, flip })} options={[["", "Unspecified"], ["noflip", "No flip"], ["flip", "Flip"]]} />
              </div>
            )}
          </Dialog>
        );
      })()}
      {dialog?.kind === "rlogic" && (() => {
        const d = dialog, names = d.rows.map((r) => r.name), row = (k: number, change: Partial<(typeof d.rows)[number]>) => setDialog({ ...d, rows: d.rows.map((r, j) => (j === k ? { ...r, ...change } : r)) });
        return (
          <Dialog title="R-Logic" action="Apply" onClose={() => setDialog(undefined)}
            onAction={() => {
              const by = new Map(d.rows.map((r) => [r.id, r]));
              set({ ...doc, shapes: doc.shapes?.map((x) => {
                const r = by.get(x.id);
                if (!r || !x.rgroup) return x;
                const occur = r.occur.replace(/\s+/g, "");
                return { ...x, rgroup: { name: x.rgroup.name, ...(/^[\d,<>=-]{1,20}$/.test(occur) && occur !== ">0" ? { occur } : {}), ...(r.restH ? { restH: true as const } : {}), ...(r.then && r.then !== r.name ? { then: r.then } : {}) } };
              }) }, true);
              setDialog(undefined);
            }}>
            {d.rows.map((r, k) => (
              <Fragment key={r.id}>
                <label className="dialog-row"><span>{r.name} occurrence</span><span className="unit-field text"><input aria-label={`${r.name} occurrence`} value={r.occur} placeholder=">0" onChange={(e) => row(k, { occur: e.target.value.slice(0, 20) })} /></span></label>
                <div className="dialog-row"><span>{r.name} rest H</span><Segmented label={`${r.name} rest H`} value={r.restH ? "yes" : ""} options={[["", "Off"], ["yes", "On"]]} onChange={(v) => row(k, { restH: !!v })} /></div>
                <div className="dialog-row"><span>If {r.name}, then</span><Select label={`If ${r.name}, then`} value={r.then} onChange={(then) => row(k, { then })} options={[["", "None"], ...names.filter((n) => n !== r.name).map((n): [string, string] => [n, n])]} /></div>
              </Fragment>
            ))}
          </Dialog>
        );
      })()}
      {dialog?.kind === "font" && (
        <Dialog title="Font" action="Apply" onClose={() => setDialog(undefined)} onAction={() => { runAction(`caption.font.${dialog.font}`); setDialog(undefined); }}>
          <div className="dialog-row"><span>Font</span><FontPick label="Font" font={dialog.font} fonts={fontList} onPick={(font) => setDialog({ ...dialog, font })} className="select-field" start /></div>
        </Dialog>
      )}
      {dialog?.kind === "size" && (
        <Dialog title="Size" action="Apply" onClose={() => setDialog(undefined)}
          onAction={() => { const n = Number(dialog.size), pt = roundPt(n); if (n > 0 && pt <= 999) { lastSize.current = pt; runAction(`caption.size.${pt}`); } setDialog(undefined); }}>
          {/* Any size from 0.1 to 999 pt (decision 0007), to the nearest half point from 5 pt and the nearest tenth below. */}
          <label className="dialog-row"><span>Size</span><NumberField label="Size" unit="pt" min={0.1} max={999} step={1} value={Number(dialog.size)} onChange={(n) => setDialog({ ...dialog, size: String(n) })} /></label>
        </Dialog>
      )}
      {dialog?.kind === "spacing" && (
        <Dialog title="Line Spacing" action="Apply" onClose={() => setDialog(undefined)}
          onAction={() => { const pt = Number(dialog.pt); restyle(() => ({ lineHeight: dialog.mode === "variable" ? "variable" : dialog.mode === "fixed" && pt >= 0.1 && pt <= 999 ? pt : undefined })); setDialog(undefined); }}>
          {/* ChemDraw's three: Automatic (by the caption's largest text), Variable (each line by its own) and Fixed at. */}
          <Segmented label="Line spacing" value={dialog.mode} onChange={(mode) => setDialog({ ...dialog, mode })} options={[["auto", "Automatic"], ["variable", "Variable"], ["fixed", "Fixed"]]} />
          <label className="dialog-row"><span>Fixed at</span><NumberField label="Fixed at" unit="pt" min={0.1} max={999} step={0.5} disabled={dialog.mode !== "fixed"} value={Number(dialog.pt)} onChange={(n) => setDialog({ ...dialog, pt: String(n) })} /></label>
        </Dialog>
      )}
      {dialog?.kind === "scale" && (
        <Dialog title="Scale" action="Scale" onClose={() => setDialog(undefined)}
          onAction={() => {
            const v = Number(dialog.value), median = chosenMedian();
            // The document's bond length is one bond length in the drawing; a length in pt is in the document style's points.
            if (dialog.how === "percent") scaleBy(v / 100);
            else if (median) scaleBy(dialog.how === "document" ? 1 / median : v / style.bond / median);
            setDialog(undefined);
          }}>
          {/* ChemDraw's three ways: the median bond to the document's bond length, the median bond to a length, or a percent.
              With no bond chosen, the two median ways are dimmed. "Bond length" starts at the chosen median. */}
          <Segmented label="Scale" value={dialog.how} onChange={(how) => setDialog({ ...dialog, how, value: how === "percent" ? "100" : String(Math.round((chosenMedian() ?? 1) * style.bond * 100) / 100) })}
            options={[["document", "Document bond", undefined, !chosenMedian()], ["length", "Bond length", undefined, !chosenMedian()], ["percent", "Percent"]]} />
          <label className="dialog-row">
            <span>{dialog.how === "percent" ? "Scale by" : "Median bond"}</span>
            <NumberField label={dialog.how === "percent" ? "Scale by" : "Median bond"} unit={dialog.how === "percent" ? "%" : "pt"} step={dialog.how === "percent" ? 1 : 0.1} disabled={dialog.how === "document"}
              value={dialog.how === "document" ? style.bond : Number(dialog.value)} onChange={(n) => setDialog({ ...dialog, value: String(n) })} />
          </label>
          {/* ChemDraw's "Scale atom labels and settings": label sizes, line widths and the rest scale with the positions.
              Text alone always scales its size, so the switch shows on and dimmed for it. */}
          <label className="dialog-row">
            <span>Labels and lines</span>
            <Switch on={scalesText()} label="Labels and lines" disabled={textAlone()} onChange={(on) => setSettings((s) => ({ ...s, scaleLabels: on }))} />
          </label>
        </Dialog>
      )}
      {checking && (
        <Dialog title="Possible Error in Drawing" action="Ignore" cancel="Stop" onClose={() => setChecking(undefined)}
          alt={{ label: "Ignore All", onClick: () => { const c = checking; setChecking(undefined); c.then(); } }}
          onAction={() => {
            const c = checking, at = c.at + 1;
            if (at >= c.list.length) { setChecking(undefined); return c.then(); }
            if (c.select) showProblem(c.list[at]);
            setChecking({ ...c, at });
          }}>
          <p className="dialog-note">{checking.list[checking.at].message}</p>
          {checking.list.length > 1 && <p className="dialog-note">{checking.at + 1} of {checking.list.length}</p>}
        </Dialog>
      )}
      {explaining && (
        // One warning with a fix offers the fix; otherwise the dialog only shows the warnings.
        <Dialog title="Possible Error in Drawing" onClose={() => setExplaining(undefined)} cancel="Close"
          {...(explaining.length === 1 && explaining[0].fix ? { action: explaining[0].fix.label, onAction: () => { setExplaining(undefined); runAction(explaining[0].fix!.command); } } : {})}>
          {explaining.map((p, k) => <p key={k} className="dialog-note">{p.message}</p>)}
        </Dialog>
      )}
      {commandsOpen && <CommandPalette commands={paletteCommands()} draw={drawCommand} onClose={() => setCommandsOpen(false)} />}
      {notice && (
        <p className="notice text-ui" role="status">
          {!notice.info && <Warning size={16} aria-hidden />}
          {notice.text}
        </p>
      )}
    </div>
  );
}
