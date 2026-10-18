// The Actions panel: a small dock in the bottom-right corner whose actions follow what is selected.
// It answers "what would I want to do next, here?" in order of weight: what the selection is (formula, mass),
// what is wrong with it (problems, each with a fix), then its actions, likeliest first. A long list keeps its first
// rows and folds the rest into small buttons that name themselves on hover. Every action also lives where
// ChemDraw users expect it (menus and keys).
import { useEffect, useRef, useState } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, Flask, Palette, Table, ArrowsInSimple, ArrowsClockwise, ArrowsDownUp, CaretRight, SignIn, SignOut, ArrowsLeftRight, ArrowsOutSimple, Atom, BookmarkSimple, CaretUpDown,
  AlignBottomSimple, AlignTopSimple, ArrowLineDown, ArrowLineUp, CursorText, DotsThree, DotsThreeVertical, Faders, Polygon, Rectangle, ArrowArcLeft, ArrowArcRight, ArrowsCounterClockwise, ArrowUDownLeft, CircleDashed, CornersOut, MagnifyingGlass, Swap,
  ClipboardText, CopySimple, LineSegments, Minus, Plus, Stack, StackSimple, Eye, FileArrowDown, FlipHorizontal, FlipVertical, GearSix, House, LinkBreak, LinkSimple, ListNumbers, Hash, MagicWand, MinusCircle,
  PencilSimpleLine, PlusCircle, SelectionAll, SlidersHorizontal, SquareSplitHorizontal, TagSimple, TextAlignCenter, TextAlignLeft,
  TextAlignJustify, TextAlignRight, TextB, TextItalic, TextUnderline, Trash, Warning, X, Plus as PlusIcon, Rows, RowsPlusBottom, RowsPlusTop, Columns, ColumnsPlusRight, ColumnsPlusLeft, ArrowsInLineHorizontal, Backspace, Broom, CirclesThree, FlowArrow, Subtitles, Textbox, Unite, WarningCircle, WaveSine, Circle, TextSubscript, TextSuperscript, Cube, Square, BoundingBox, SelectionSlash, AlignLeft, AlignRight, AlignTop, AlignBottom, ArrowsOutLineHorizontal, ArrowsOutLineVertical,
} from "@phosphor-icons/react";
import type { Analysis } from "./chem";
import type { Problem } from "./check";
import { Menu, Pick, type MenuItem } from "./Menu";
import { ARROW_KINDS, curved, isBracket, isLine, ORBITAL_SHAPES, PHASES, SWEEPS, TABLE_LINES, type TableLine, type ArrowKind, type Head, type HeadShape, type OrbitalShape, type Phase, type ShapeKind } from "./render";
import { ElementGlyph, OrbitalGlyph, orbitalName, shapeName, FillGlyph, LineGlyph } from "./elements";
import { invoke } from "@tauri-apps/api/core";
import { COLOURS, fontStack, HIGHLIGHTS, SIZES, TINTS } from "./docstyle";
import { ArrowGlyph, ARROWS, BondGlyph, BONDS, RingGlyph, ShapeGlyph, SHAPES, TlcGlyph, type BondKind } from "./tools";

// A selected atom label's text style (the first labelled atom's, for a structure), for the label style buttons.
export type LabelText = { bold: boolean; italic: boolean; underline: boolean; font: string; size: number };
export type Context =
  | { kind: "empty" }
  | { kind: "drawing"; nameable: boolean }
  // Different kinds of thing picked together: count things; atoms, when structures are among them.
  | { kind: "selection"; count: number; atoms: boolean }
  | { kind: "structure"; text?: LabelText; atoms: number; structures: number; next: string; nameable: boolean; pairs?: "shown" | "hidden"; stereo?: "absolute" | "racemic" | "relative" | "mixed"; depth?: boolean; cip?: boolean; numbers?: boolean; circles?: boolean; halo?: string; fill?: string; properties?: boolean }
  // mode: picked captions, the text being typed, or the style the next text starts with (Text tool in hand).
  | { kind: "caption"; mode: "picked" | "typing" | "next"; convertible: boolean; count: number; colour: string; bold: boolean; italic: boolean; underline: boolean; size: number; align: "left" | "centre" | "right" | "justify"; attached: boolean; attachable: boolean;
      script?: "sub" | "super"; font?: string; fonts?: string[] }
  | { kind: "arrow"; count: number; arrow: ArrowKind; curved: boolean; sweep?: number; style: string; orbital?: { shape: OrbitalShape; phase: Phase };
      heads: boolean; start: Head; end: Head; head: HeadShape; closed?: boolean; fill: string; width: number }
  | { kind: "shape"; count: number; shape: ShapeKind; dashed: boolean; colour: string; style: string; side: string; mark: string; rf: boolean; lines: TableLine[]; cellAlign?: string; weight: number; cell: boolean; hide?: string[]; shade: { depth: number; blur: number; opacity: number; pt: number }; text?: LabelText }
  | { kind: "cycle"; clockwise: boolean; steps: number; centre: boolean }
  | { kind: "reaction"; steps: number; structures: number; clean: boolean; mapped: boolean; grid: boolean }
  | { kind: "atom"; text?: LabelText; label: string; charge: number; terminal: boolean; carbon: boolean; centre: boolean; enhanced?: string; halo?: string; fill?: string; numbered?: boolean }
  | { kind: "bond"; style: BondKind | undefined; double: boolean; flippable: boolean }
  | { kind: "spot"; style: "filled" | "hollow" | "shaded"; w: number; h: number; tail: number; rf: boolean; pt: number };

type Props = {
  open: boolean;
  context: Context;
  analysis?: Analysis;
  problems: Problem[];
  fonts: string[]; // Octet's fonts, then the other fonts the drawing uses
  hiddenWarnings?: boolean; // a selected atom has its warnings hidden
  messy: boolean;
  hint: (command: string) => string | undefined; // the key for a command, if it has one
  onOpen: (open: boolean) => void;
  run: (command: string) => void;
  // The user's arrangement for each kind of selection: the order of actions and how many show as rows.
  layout: Record<string, { order: string[]; rows: number }>;
  onLayout: (kind: string, layout: { order: string[]; rows: number }) => void;
  colour?: { value: string; tints?: boolean }; // the selection's colour, shown in the one colour row every selection gets
  palette: { name: string; hex: string }[]; // the user's own colours, after Octet's
  grouping?: { grouped: boolean; integral: boolean; group: boolean }; // a group touched (Ungroup), two or more things that can be grouped (Group)
  menus?: boolean; // Settings > Actions panel: each set of small actions as a titled row that opens its menu
};

const ELEMENTS = ["C", "N", "O", "S", "P", "F", "Cl", "Br", "I"];
const STYLES: BondKind[] = ["single", "double", "triple", "bolddouble", "dasheddouble", "aromaticdouble", "eitherdouble", "wedge", "hashwedge", "hollow", "bold", "hashed", "dashed", "wavy", "dative"];
// On a chain end: the groups chemists put there most. Values are what the atom becomes.
const ENDS = [["OH", "O"], ["NH₂", "N"], ["Me", "Me"], ["OMe", "OMe"], ["CO₂H", "CO2H"], ["CF₃", "CF3"], ["CN", "CN"], ["Ph", "Ph"]];

// Digits in a formula as subscripts: C8H9NO2 → C₈H₉NO₂.
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
const formula = (f: string) => f.replace(/\d/g, (d) => SUBSCRIPT[Number(d)]);

// A setting with a few choices, as one small button showing the current choice: a click opens its choices (a Pick
// list), each drawn as itself with its name.
function PickButton({ label, value, options, onPick }: { label: string; value: string; options: { id: string; name: string; glyph: React.ReactNode }[]; onPick: (id: string) => void }) {
  const current = options.find((o) => o.id === value) ?? options[0];
  return (
    <div className="pick">
      <Pick label={label} value={value} groups={[options.map((o) => ({ key: o.id, name: o.name, icon: <span className="pick-glyph" aria-hidden>{o.glyph}</span> }))]} onPick={onPick}
        className="chip pick-button" title={`${label}: ${current.name}`}>
        <span className="pick-label" aria-hidden>{label}</span>
        {current.glyph}
      </Pick>
    </div>
  );
}

// The computer's fonts, asked for once (the app lists them; a browser cannot).
const TAURI = "__TAURI_INTERNALS__" in window;
let installed: Promise<string[]> | undefined;
const systemFonts = () => (installed ??= invoke<string[]>("system_fonts").catch(() => []));
const fontItem = (f: string): MenuItem => ({ key: f, name: f, icon: null, style: { fontFamily: fontStack(f) } });

// Octet's one font list: Octet's fonts and the drawing's (each shown in itself), then More fonts…, which lists every
// font on the computer with a field to find one, as ChemDraw's Font menu lists every installed font (Sam: the list
// stays short until it is asked for more). The Actions panel, Settings and Text > Other Font… use it.
export function FontPick({ label, font, fonts, onPick, className = "chip size-button", start }: { label: string; font: string; fonts: string[]; onPick: (font: string) => void; className?: string; start?: boolean }) {
  return (
    <Pick label={label} value={font} groups={[(fonts.includes(font) ? fonts : [font, ...fonts]).map(fontItem)]} onPick={onPick} className={className} title={label} style={{ fontFamily: fontStack(font) }} start={start}
      more={TAURI ? { name: "More fonts…", find: "Find a font", load: () => systemFonts().then((all) => all.map(fontItem)) } : undefined}>
      <span className="font-name">{font}</span>
      <CaretUpDown size={12} aria-hidden />
    </Pick>
  );
}

// The text size: a click opens the sizes, and Other size…, Return or a double-click types any size.
function SizeButton({ size, run }: { size: number; run: (command: string) => void }) {
  const [typed, setTyped] = useState<string>();
  const typing = useRef(false); // Enter, Escape and blur all end typing; only the first one counts
  const startTyping = () => { typing.current = true; setTyped(String(size)); };
  const endTyping = (keep: boolean) => {
    if (!typing.current) return;
    typing.current = false;
    const pt = Math.round(Number(typed) * 2) / 2;
    setTyped(undefined);
    if (keep && pt >= 4 && pt <= 144 && pt !== size) run(`caption.size.${pt}`);
  };
  return (
    <div className="size">
      {typed !== undefined ? (
        <input
          className="chip size-input"
          aria-label="Size in points"
          autoFocus
          inputMode="decimal"
          value={typed}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTyped(e.target.value.replace(/[^\d.]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); endTyping(true); } }}
          onBlur={() => endTyping(true)}
        />
      ) : (
        <Pick label="Size" value={String(size)} groups={[SIZES.map((pt) => ({ key: String(pt), name: `${pt} pt`, icon: null })), [{ key: "other", name: "Other size…", icon: null }]]}
          onPick={(k) => (k === "other" ? startTyping() : run(`caption.size.${k}`))} className="chip size-button" title="Size" onDoubleClick={startTyping}
          onKey={(e) => { if (e.key !== "Enter") return false; e.preventDefault(); startTyping(); return true; }}>
          {size} pt
          <CaretUpDown size={12} aria-hidden />
        </Pick>
      )}
    </div>
  );
}


// Octet's one slider: a name, the track, and the value as it reads. Use it wherever a value is dragged.
export function Slider({ name, value, min, max, step, show, onChange }: { name: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="slider-name">{name}</span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={name} aria-valuetext={show(value)} onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} />
      <span className="slider-value">{show(value)}</span>
    </label>
  );
}

// A TLC spot in its style: filled, hollow, or shaded and lit from the top left.
function SpotGlyph({ style }: { style: "filled" | "hollow" | "shaded" }) {
  return (
    <svg width={20} height={20} viewBox="0 0 256 256" aria-hidden>
      {style === "shaded" && <defs><radialGradient id="spot-glyph" cx="0.36" cy="0.32" r="0.75"><stop offset="0" stopColor="var(--surface-raised)" /><stop offset="1" stopColor="currentColor" /></radialGradient></defs>}
      <ellipse cx={128} cy={128} rx={88} ry={52} fill={style === "hollow" ? "none" : style === "shaded" ? "url(#spot-glyph)" : "currentColor"} stroke="currentColor" strokeWidth={style === "hollow" ? 16 : 0} />
    </svg>
  );
}

// A table's lines as a chip draws them: the lines given in ink, and (faint) the rest of the grid faintly.
function TableGlyph({ on, faint }: { on: TableLine[]; faint?: boolean }) {
  const has = new Set(on), x = [2, 7.33, 12.67, 18], y = [2, 6, 10, 14];
  const lines: [TableLine, number, number, number, number][] = [
    ["top", 2, 2, 18, 2], ["bottom", 2, 14, 18, 14], ["left", 2, 2, 2, 14], ["right", 18, 2, 18, 14], ["header", 2, y[1], 18, y[1]], ["rows", 2, y[2], 18, y[2]],
    ["cols", x[1], 2, x[1], 14], ["cols", x[2], 2, x[2], 14],
  ];
  const ink = (k: TableLine, i: number) => has.has(k) || (i === 4 && has.has("rows"));
  return (
    <svg width={20} height={16} viewBox="0 0 20 16" aria-hidden>
      {lines.map(([k, x1, y1, x2, y2], i) => (ink(k, i) || faint) && <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={ink(k, i) ? 1.5 : 1} opacity={ink(k, i) ? 1 : 0.25} />)}
    </svg>
  );
}

// small: shown as a small button by default (the user can drag it into the rows, and any row out of them).
export type Item = { icon: React.ReactNode; name: string; command: string; accent?: boolean; small?: boolean };
// The small actions fall into sets, each a section of small buttons under a small title (Sam, 17 October 2026):
// the object's own edits (a table's, a plate's, a cycle's); Analyse; Turn and flip (every turn, rotation and flip);
// Display and copy (what is shown on the structure, the rest, the clipboard and library); Arrange, File and View
// when they apply. Delete is the last small button in every panel, with no title.
const SETS = ["table", "plate", "cycle", "analysis", "turn", "more", "arrange", "file", "view", "delete"] as const;
type SetId = (typeof SETS)[number];
const SET_TITLES: Record<SetId, string> = { table: "Table", plate: "Plate", cycle: "Cycle", analysis: "Analyse", turn: "Turn and flip", more: "Display and copy", arrange: "Arrange", file: "File", view: "View", delete: "Delete" };
// Each set's icon, for its row when the sets show as menus.
const SET_ICONS: Record<SetId, React.ReactNode> = { table: <Table size={18} />, plate: <TlcGlyph />, cycle: <ArrowsClockwise size={18} />, analysis: <Flask size={18} />, turn: <ArrowArcRight size={18} />, more: <Eye size={18} />,
  arrange: <AlignCenterHorizontal size={18} />, file: <FileArrowDown size={18} />, view: <MagnifyingGlass size={18} />, delete: <Trash size={18} /> };
// Each action's kind. Kinds make up the sets; the kinds in Display and copy keep this order within it.
const SET_FOR: Record<string, SetId> = { table: "table", plate: "plate", cycle: "cycle", analysis: "analysis", arrange: "arrange", file: "file", view: "view", turn: "turn", marks: "more", other: "more", library: "more", delete: "delete" };
const MORE_GROUPS = ["marks", "other", "library"];
const KIND_OF: Record<string, string> = {
  select_all: "view", zoom_fit: "view", import: "file",
  "shape.row.before": "table", "shape.col.before": "table", "shape.row.delete": "table", "shape.col.delete": "table", "shape.fit": "table", "shape.clear": "table", "shape.dashed": "table",
  "shape.hide.origin": "plate", "shape.hide.front": "plate", "shape.hide.border": "plate", "cycle.reverse": "cycle", "cycle.ungroup": "cycle",
  properties: "analysis", show_stereo: "analysis", predict_1h: "analysis", predict_13c: "analysis",
  "rotate.cw15": "turn", "rotate.ccw15": "turn", flip_h: "turn", flip_v: "turn", mirror_h: "turn", mirror_v: "turn", structure_perspective: "turn", flatten: "turn",
  pairs: "marks", number: "marks", atom_numbers: "marks", show_warnings: "marks", "caption.add": "marks", colour_by_element: "marks", aromatic_display: "marks", contract_label: "marks",
  "cycle.make": "arrange", "align.row": "arrange", "align.column": "arrange", "align.spread-row": "arrange", group: "arrange", ungroup: "arrange", group_integral: "arrange",
  arrange_left: "arrange", arrange_centre: "arrange", arrange_right: "arrange", arrange_top: "arrange", arrange_middle: "arrange", arrange_bottom: "arrange",
  arrange_across: "arrange", arrange_down: "arrange", bring_front: "arrange", send_back: "arrange",
  copy_smiles: "library", "template.add": "library", delete: "delete",
};
const kindOf = (command: string) => KIND_OF[command] ?? "other";
const setOf = (command: string) => SET_FOR[kindOf(command)];

// The actions for a selection, likeliest first. The panel shows them; the command palette lists them too.
export function actionItems(context: Context, messy: boolean, hiddenWarnings = false): Item[] {
  const items: Item[] = [];
  const it = (icon: React.ReactNode, name: string, command: string, accent?: boolean, small?: boolean): Item => ({ icon, name, command, accent, small });
  const small = (i: Item): Item => ({ ...i, small: true });
  const clean = it(<MagicWand size={18} />, "Clean up structure", "clean_up", messy);
  const nameIt = it(<TagSimple size={18} />, "Convert structure to name", "structure_to_name");
  const del = small(it(<Trash size={18} />, "Delete", "delete")); // the last small button in every panel
  // Rotate 180° keeps stereochemistry (arrows round), Flip mirrors it (mirror glyphs).
  const flips = [it(<ArrowsLeftRight size={18} />, "Rotate 180° horizontal", "flip_h", false, true), it(<ArrowsDownUp size={18} />, "Rotate 180° vertical", "flip_v", false, true)];
  const mirrors = [it(<FlipHorizontal size={18} />, "Flip horizontal", "mirror_h", false, true), it(<FlipVertical size={18} />, "Flip vertical", "mirror_v", false, true)];
  // Every turn and flip, for any selection they act on (as ChemDraw's Object menu, for every kind of object).
  const turnings = [small(it(<ArrowArcRight size={18} />, "Turn 15° clockwise", "rotate.cw15")), small(it(<ArrowArcLeft size={18} />, "Turn 15° anticlockwise", "rotate.ccw15"))];
  const turnsAndFlips = [...turnings, ...flips, ...mirrors];
  // The draw order, for every kind of object (Object menu: Bring to Front, Send to Back). On an atom or a bond it moves
  // the whole structure, as the menu command does.
  const order = [it(<StackSimple size={18} />, "Bring to front", "bring_front", false, true), it(<Stack size={18} />, "Send to back", "send_back", false, true)];

  switch (context.kind) {
    case "empty":
      items.push(it(<Atom size={18} />, "Convert name to structure", "name_to_structure"), it(<ClipboardText size={18} />, "Paste a SMILES or MOL", "paste_hint"),
        small(it(<FileArrowDown size={18} />, "Import a structure…", "import")));
      break;
    case "drawing":
      items.push(clean, ...(context.nameable ? [nameIt] : []), it(<Atom size={18} />, "Convert name to structure", "name_to_structure"), ...flips,
        small(it(<CopySimple size={18} />, "Copy as SMILES", "copy_smiles")), small(it(<FileArrowDown size={18} />, "Import a structure…", "import")),
        small(it(<SelectionAll size={18} />, "Select all", "select_all")), small(it(<CornersOut size={18} />, "Fit to window", "zoom_fit")));
      break;
    case "selection":
      items.push(...(context.atoms ? [clean] : []), it(<CopySimple size={18} />, "Copy", "copy"), ...turnsAndFlips, ...order, del);
      break;
    case "structure":
      // Sam (17 October 2026): Clean up and Structure to name as rows; every turn, rotation and flip in one sub-menu;
      // what is shown on it, the clipboard and library, and Delete in another.
      items.push(clean, ...(context.nameable ? [nameIt] : []), ...flips, ...order);
      if (context.pairs) items.push(small(it(<span className="glyph-text">N:</span>, context.pairs === "shown" ? "Hide lone pairs" : "Show lone pairs", "pairs")));
      items.push(small(it(<ListNumbers size={18} />, context.structures > 1 ? "Number these compounds" : "Number this compound", "number")),
        small(it(<Hash size={18} />, context.numbers ? "Hide atom numbers" : "Show atom numbers", "atom_numbers")),
        ...(hiddenWarnings ? [small(it(<WarningCircle size={18} />, "Show warnings", "show_warnings"))] : []),
        small(it(<Subtitles size={18} />, "Add a caption", "caption.add")),
        ...turnings, small(it(<CopySimple size={18} />, "Copy as SMILES", "copy_smiles")), small(it(<BookmarkSimple size={18} />, "Add to rings", "template.add")), small(it(<Flask size={18} />, context.properties ? "Hide the Properties panel" : "Show the Properties panel", "properties")), small(it(<span className="glyph-text">R/S</span>, context.cip ? "Hide stereochemistry" : "Show stereochemistry", "show_stereo")), small(it(<Palette size={18} />, "Colour by element", "colour_by_element")), small(it(<Circle size={18} />, context.circles ? "Show Kekulé bonds" : "Show aromatic circles", "aromatic_display")), small(it(<ArrowsInSimple size={18} />, "Contract label", "contract_label")), small(it(<span className="glyph-text">¹H</span>, "Predict ¹H-NMR shifts", "predict_1h")), small(it(<span className="glyph-text">¹³C</span>, "Predict ¹³C-NMR shifts", "predict_13c")));
      if (context.structures > 1) items.push(small(it(<ArrowsClockwise size={18} />, "Make a catalytic cycle", "cycle.make")), small(it(<DotsThree size={18} />, "Line up in a row", "align.row")),
        small(it(<DotsThreeVertical size={18} />, "Line up in a column", "align.column")), small(it(<SquareSplitHorizontal size={18} />, "Space evenly", "align.spread-row")));
      if (context.depth !== undefined) items.push(small(it(<Cube size={18} />, context.depth ? "Draw flat" : "Draw with depth", "structure_perspective")), small(it(<Square size={18} />, "Flatten", "flatten")));
      items.push(...mirrors, del);
      break;
    case "atom":
      items.push(it(<CursorText size={18} />, "Type a label", "atom.label"), it(<PlusCircle size={18} />, "Add a positive charge", "charge.plus"), it(<MinusCircle size={18} />, "Add a negative charge", "charge.minus"),
        ...(context.label.length > 2 || !/^[A-Z][a-z]?$/.test(context.label) ? [it(<ArrowsOutSimple size={18} />, "Expand label", "expand_label")] : []), it(<Faders size={18} />, "Atom properties…", "atom_properties"), it(<Hash size={18} />, context.numbered ? "Hide atom number" : "Show atom number", "atom_numbers"),
        ...(hiddenWarnings ? [it(<WarningCircle size={18} />, "Show warnings", "show_warnings")] : []), ...order, del);
      break;
    case "bond":
      if (context.double) items.push(it(<span className="glyph-text">L</span>, "Second line on the left", "bond.left"), it(<span className="glyph-text">C</span>, "Centre the double bond", "bond.centre"), it(<span className="glyph-text">R</span>, "Second line on the right", "bond.right"));
      if (context.flippable) items.push(it(<ArrowUDownLeft size={18} />, "Point the other way", "bond.flip"));
      items.push(...order, del);
      break;
    case "caption":
      if (context.mode !== "picked") break;
      if (context.convertible) items.push(it(<Atom size={18} />, "Convert name to structure", "name_to_structure"));
      if (context.count === 1) items.push(it(<PencilSimpleLine size={18} />, "Edit text", "caption.edit"));
      if (context.attached) items.push(it(<LinkBreak size={18} />, "Un-tie from structure", "caption.detach"));
      else if (context.attachable) items.push(it(<LinkSimple size={18} />, "Tie to structure", "caption.attach"));
      items.push(...order, del);
      break;
    case "reaction":
      items.push(it(<Broom size={18} />, "Clean up reaction", "clean_reaction", !context.clean),
        it(<ListNumbers size={18} />, "Number these compounds", "number"), small(it(<CopySimple size={18} />, "Copy as SMILES", "copy_smiles")),
        it(<FlowArrow size={18} />, "Map atoms", "reaction.map"), it(<Table size={18} />, context.grid ? "Remove stoichiometry" : "Analyse stoichiometry", "stoichiometry"), ...(context.mapped ? [small(it(<X size={18} />, "Clear atom map", "reaction.unmap"))] : []), ...turnsAndFlips, ...order, del);
      break;
    case "cycle":
      if (!context.centre) items.push(it(<Textbox size={18} />, "Add a centre label", "cycle.centre"));
      items.push(it(<SignIn size={18} />, "Add a reagent coming in", "cycle.in"), it(<SignOut size={18} />, "Add a product going out", "cycle.out"),
        it(<CirclesThree size={18} />, "Tidy the cycle", "cycle.tidy"), small(it(<ArrowsCounterClockwise size={18} />, "Reverse the direction", "cycle.reverse")),
        small(it(<CircleDashed size={18} />, "Remove the cycle", "cycle.ungroup")), ...turnsAndFlips, ...order, del);
      break;
    case "shape":
      if (context.shape === "tlc") {
        const hidden = (k: string) => context.hide?.includes(k);
        items.push(it(<Plus size={18} />, "Add a lane", "shape.lanes.1"), it(<Minus size={18} />, "Remove a lane", "shape.lanes.-1"),
          it(<span className="glyph-text">Rf</span>, context.rf ? "Hide Rf values" : "Show Rf values", "shape.rf"),
          small(it(<AlignBottomSimple size={18} />, hidden("origin") ? "Show the origin" : "Hide the origin", "shape.hide.origin")),
          small(it(<AlignTopSimple size={18} />, hidden("front") ? "Show the solvent front" : "Hide the solvent front", "shape.hide.front")),
          small(it(<Rectangle size={18} />, hidden("border") ? "Show the border" : "Hide the border", "shape.hide.border")), ...order, del);
        break;
      }
      if (context.shape === "table") {
        // At the cell last typed in, or at the end of the table.
        items.push(it(<RowsPlusBottom size={18} />, "Add a row below", "shape.row.after"), it(<ColumnsPlusRight size={18} />, "Add a column after", "shape.col.after"),
          small(it(<RowsPlusTop size={18} />, "Add a row above", "shape.row.before")), small(it(<ColumnsPlusLeft size={18} />, "Add a column before", "shape.col.before")),
          small(it(<Rows size={18} />, context.cell ? "Delete the row" : "Delete the last row", "shape.row.delete")), small(it(<Columns size={18} />, context.cell ? "Delete the column" : "Delete the last column", "shape.col.delete")),
          small(it(<ArrowsInLineHorizontal size={18} />, "Size to fit contents", "shape.fit")), small(it(<Backspace size={18} />, "Clear contents", "shape.clear")),
          small(it(<LineSegments size={18} />, context.dashed ? "Solid lines" : "Dashed lines", "shape.dashed")), ...order, del);
        break;
      }
      if (isBracket({ kind: context.shape })) items.push(it(<LineSegments size={18} />, context.dashed ? "Solid lines" : "Dashed lines", "shape.dashed"));
      items.push(...turnsAndFlips, ...order, del);
      break;
    case "spot":
      items.push(it(<span className="glyph-text">Rf</span>, context.rf ? "Hide its Rf" : "Show its Rf", "spot.rf"), del);
      break;
    case "arrow":
      if (context.arrow === "orbital") { items.push(it(<Swap size={18} />, "Swap the phases", "orbital.swap"), ...turnsAndFlips, ...order, del); break; }
      if (context.arrow === "curve") { items.push(it(<Polygon size={18} />, context.closed ? "Open the curve" : "Close the curve", "arrow.closed"), it(<ArrowUDownLeft size={18} />, "Reverse", "arrow.reverse"), ...turnsAndFlips, ...order, del); break; }
      if (isLine({ kind: context.arrow })) { items.push(it(<ArrowUDownLeft size={18} />, "Reverse", "arrow.reverse"), ...(context.curved ? [it(<WaveSine size={18} />, "Flip the curve", "arrow.flip")] : []), ...turnsAndFlips, ...order, del); break; }
      if (context.count === 1 && !context.curved) items.push(it(<ArrowLineUp size={18} />, "Add conditions above", "arrow.above"), it(<ArrowLineDown size={18} />, "Add conditions below", "arrow.below"));
      items.push(it(<ArrowUDownLeft size={18} />, "Reverse", "arrow.reverse"));
      if (context.curved) items.push(it(<WaveSine size={18} />, "Flip the curve", "arrow.flip"));
      items.push(...turnsAndFlips, ...order, del);
      break;
  }
  return items;
}


function Row({ icon, name, command, hint, run, accent }: { icon: React.ReactNode; name: string; command: string; hint?: string; run: (c: string) => void; accent?: boolean }) {
  return (
    <button className={accent ? "action accent" : "action"} onClick={() => run(command)}>
      {icon}
      <span className="action-name">{name}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );
}

export function Actions({ open, context, analysis, problems, fonts, hiddenWarnings, messy, hint, onOpen, run, layout, onLayout, colour, palette, grouping, menus }: Props) {
  // An action being dragged to a new place: in the rows (index among rows) or the small buttons (index among them).
  const [carry, setCarry] = useState<{ command: string; x: number; y: number; to?: { rows: boolean; index: number } }>();
  const dragged = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const [settled, setSettled] = useState<string>();
  // Closing plays the panel's exit before it leaves the page; the Actions button then comes in where it was.
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  // The formula and mass keep their last values while the panel leaves, as the editor stops working them out once
  // the panel is closed.
  const facts = useRef(analysis);
  if (open) facts.current = analysis;
  useEffect(() => {
    if (open) { setShown(true); setLeaving(false); return; }
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => { setShown(false); setLeaving(false); }, 180); // in case the animation never ends
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // The tray's names show above the button after a short wait, then at once while moving along the tray.
  const [tip, setTip] = useState<{ text: string; x: number; y: number }>();
  const tipTimer = useRef<number>(undefined), tipShownAt = useRef(0);
  const showTip = (e: React.PointerEvent<HTMLElement>, text: string) => {
    const r = e.currentTarget.getBoundingClientRect(), place = { text, x: r.left + r.width / 2, y: r.top };
    clearTimeout(tipTimer.current);
    if (Date.now() - tipShownAt.current < 600) return setTip(place);
    tipTimer.current = window.setTimeout(() => setTip(place), 400);
  };
  useEffect(() => setTip(undefined), [context.kind]); // a name never outlives the list it came from
  // With sets as menus: the one open beside the panel, and where (fixed, so the panel's scrolling never cuts it off).
  // A click outside it or Escape closes it, and so does a new selection.
  const [sub, setSub] = useState<{ set: SetId; top: number; right: number }>();
  const subBox = useRef<HTMLDivElement>(null);
  useEffect(() => setSub(undefined), [context.kind]);
  useEffect(() => {
    if (!sub) return;
    const away = (e: PointerEvent) => { const t = e.target as Element; if (!subBox.current?.contains(t) && !t.closest?.(".submenu-row")) setSub(undefined); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSub(undefined); } };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", escape, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", escape, true); };
  }, [sub]);
  const hideTip = () => { clearTimeout(tipTimer.current); if (tip) tipShownAt.current = Date.now(); setTip(undefined); };

  if (!shown) {
    return (
      <button className="actions-reopen" onClick={() => onOpen(true)} title="Show actions">
        <SlidersHorizontal size={16} aria-hidden />
        Actions
        {problems.length > 0 && <span className="badge" aria-label={`${problems.length} problems`}>{problems.length}</span>}
      </button>
    );
  }
  const title = {
    empty: "Actions",
    drawing: "Whole drawing",
    selection: context.kind === "selection" ? `${context.count} objects` : "Objects",
    structure: context.kind === "structure" && context.structures > 1 ? `${context.structures} structures` : "Structure",
    atom: "Atom",
    bond: "Bond",
    caption: context.kind !== "caption" || context.mode !== "picked" ? "Text" : context.count > 1 ? `${context.count} captions` : "Caption",
    arrow: context.kind !== "arrow" ? "Arrow" : context.arrow === "orbital" ? (context.count > 1 ? `${context.count} orbitals` : "Orbital")
      : context.count > 1 ? `${context.count} ${context.arrow === "curve" ? "curves" : isLine({ kind: context.arrow }) ? "lines" : "arrows"}`
      : context.arrow === "curve" ? "Curve" : context.arrow === "arc" ? "Arc" : context.arrow === "line" ? "Line" : "Arrow",
    cycle: "Catalytic cycle",
    reaction: context.kind === "reaction" && context.steps > 1 ? `${context.steps}-step reaction` : "Reaction",
    spot: "TLC spot",
    shape: context.kind === "shape" && context.count > 1 ? `${context.count} shapes` : context.kind === "shape" ? SHAPES[context.shape] : "Shape",
    line: "Line",
  }[context.kind];
  const whole = context.kind === "drawing" || context.kind === "structure";

  const items = actionItems(context, messy, hiddenWarnings);
  // Group and Ungroup, and Align and Distribute, for any selection of two or more things, as small buttons.
  if (grouping) items.push(...([["arrange_left", "Align left edges", <AlignLeft size={18} />], ["arrange_centre", "Align left-right centres", <AlignCenterHorizontal size={18} />], ["arrange_right", "Align right edges", <AlignRight size={18} />],
    ["arrange_top", "Align top edges", <AlignTop size={18} />], ["arrange_middle", "Align top-bottom centres", <AlignCenterVertical size={18} />], ["arrange_bottom", "Align bottom edges", <AlignBottom size={18} />],
    ["arrange_across", "Distribute horizontally", <ArrowsOutLineHorizontal size={18} />], ["arrange_down", "Distribute vertically", <ArrowsOutLineVertical size={18} />]] as const).map(([command, name, icon]) => ({ icon, name, command, small: true })));
  if (grouping?.group) items.push({ icon: <BoundingBox size={18} />, name: "Group", command: "group", small: true });
  if (grouping?.grouped) items.push({ icon: <SelectionSlash size={18} />, name: "Ungroup", command: "ungroup", small: true }, { icon: <Unite size={18} />, name: grouping.integral ? "Let parts be picked" : "Pick as one", command: "group_integral", small: true });
  // The user's order first (actions it does not know keep their place after it), then their split into rows.
  const mine = layout[context.kind];
  if (mine) items.sort((a, b) => {
    const [i, j] = [mine.order.indexOf(a.command), mine.order.indexOf(b.command)];
    return i < 0 || j < 0 ? 0 : i - j;
  });
  // By default the main actions come first as rows, and the ones marked small follow as small buttons, set by set.
  if (!mine) items.sort((a, b) => Number(!!a.small) - Number(!!b.small) || (a.small ? SETS.indexOf(setOf(a.command)) - SETS.indexOf(setOf(b.command)) : 0));
  const split = Math.min(items.length, mine ? mine.rows : items.filter((i) => !i.small).length);
  const rows = items.slice(0, split), tray = items.slice(split);
  // The small actions set by set, whatever order they were arranged in.
  const sets = SETS.map((s) => [s, tray.filter((i) => setOf(i.command) === s)
    .sort((a, b) => (s === "more" ? MORE_GROUPS.indexOf(kindOf(a.command)) - MORE_GROUPS.indexOf(kindOf(b.command)) : 0))] as const).filter(([, list]) => list.length);

  // Drag any action to a new place: along the rows, along the small buttons, or from one to the other.
  function startCarry(e: React.PointerEvent, command: string) {
    if (e.button !== 0) return;
    const [sx, sy] = [e.clientX, e.clientY];
    let moving = false, to: { rows: boolean; index: number } | undefined;
    dragged.current = false;
    const target = (x: number, y: number) => {
      const el = panel.current!, list = [...el.querySelectorAll<HTMLElement>(".actions-list .action-slot")], buttons = [...el.querySelectorAll<HTMLElement>(".tray-button")];
      const trayBox = el.querySelector<HTMLElement>(".tray")?.getBoundingClientRect(), box = el.getBoundingClientRect();
      if (x < box.left - 40 || x > box.right + 40 || y < box.top - 40 || y > box.bottom + 40) return undefined;
      if (trayBox && y >= trayBox.top - 4) {
        const others = buttons.filter((b) => b.dataset.command !== command);
        const at = others.findIndex((b) => x < b.getBoundingClientRect().left + b.offsetWidth / 2);
        return { rows: false, index: at < 0 ? others.length : at };
      }
      const others = list.filter((r) => r.dataset.command !== command);
      const at = others.findIndex((r) => y < r.getBoundingClientRect().top + r.offsetHeight / 2);
      return { rows: true, index: at < 0 ? others.length : at };
    };
    const move = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      moving = dragged.current = true;
      hideTip();
      to = target(ev.clientX, ev.clientY);
      setCarry({ command, x: ev.clientX, y: ev.clientY, to });
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setCarry(undefined);
      if (!moving || !to) return;
      const rest = items.map((i) => i.command).filter((c) => c !== command);
      const rowsLeft = rows.filter((i) => i.command !== command).length;
      const at = to.rows ? to.index : rowsLeft + to.index;
      onLayout(context.kind, { order: [...rest.slice(0, at), command, ...rest.slice(at)], rows: to.rows ? rowsLeft + 1 : rowsLeft });
      setSettled(command);
      setTimeout(() => setSettled(undefined), 300);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }
  const label = (i: Item) => (hint(i.command) ? `${i.name}  ${hint(i.command)}` : i.name);

  return (
    <section
      ref={panel}
      className={["actions", leaving && "leaving", carry && "arranging"].filter(Boolean).join(" ")}
      aria-label="Actions"
      inert={leaving}
      onAnimationEnd={(e) => { if (leaving && e.target === e.currentTarget) { setShown(false); setLeaving(false); } }}
      // While text is being typed, the panel's buttons style it without taking the focus away from it.
      onMouseDown={(e) => { if (context.kind === "caption" && context.mode === "typing" && !(e.target instanceof HTMLInputElement)) e.preventDefault(); }}
    >
      <header>
        <h2>{title}</h2>
        <button className="actions-close" onClick={() => onOpen(false)} aria-label="Close actions" title="Close actions">
          <X size={12} />
        </button>
      </header>

      {facts.current && whole && facts.current.slice(0, 3).map((a, k) => (
        <button key={k} className="facts" onClick={() => run(`copy_text:${a.formula}, ${a.weight.toFixed(2)} g/mol`)} title={`${Number.isFinite(a.exact) ? `Exact mass ${a.exact.toFixed(4)}. ` : ""}Click to copy.`}>
          <span className="formula">{formula(a.formula)}</span>
          <span>{a.weight.toFixed(2)} g/mol</span>
        </button>
      ))}

      {problems.length > 0 && context.kind !== "empty" && (
        <div className="problems" role="status">
          {problems.slice(0, 2).map((p) => (
            <div key={p.atom} className="problem">
              <Warning size={16} aria-hidden />
              <p>{p.message}</p>
              <button className="problem-hide" onClick={() => run(`hide_warning:${p.atom}`)} aria-label={`Hide this warning`} title="Hide this warning"><X size={12} /></button>
              <div className="problem-buttons">
                {p.fix && <button onClick={() => run(`fix:${p.atom}:${p.fix!.charge}`)}>Fix</button>}
                <button onClick={() => run(`show:${p.atom}`)}><Eye size={12} aria-hidden /> Show</button>
              </div>
            </div>
          ))}
          {problems.length > 2 && <p className="more-problems">{problems.length - 2} more</p>}
        </div>
      )}

      {context.kind === "atom" && (
        <>
          <div className="chips" role="group" aria-label="Element">
            {ELEMENTS.map((el) => (
              <button key={el} className="chip" aria-pressed={context.label === el} onClick={() => run(`element.${el}`)} title={hint(`element.${el}`) ? `${el} (${hint(`element.${el}`)})` : el}>
                {el}
              </button>
            ))}
          </div>
          {context.terminal ? (
            <div className="chips groups" role="group" aria-label="Groups">
              {ENDS.map(([shown, value]) => (
                <button key={value} className="chip" onClick={() => run(`label:${value}`)} title={`Make this ${shown}`}>{shown}</button>
              ))}
            </div>
          ) : context.carbon ? (
            <div className="chips groups" role="group" aria-label="Add">
              {[["+Me", "group.chain"], ["=O", "group.acetyl"], ["+Ph", "group.phenyl"], ["+ wedge", "group.wedgeMe"], ["+ hash", "group.hashMe"]].map(([shown, command]) => (
                <button key={command} className="chip" onClick={() => run(command)} title={hint(command) ? `${shown} (${hint(command)})` : shown}>{shown}</button>
              ))}
            </div>
          ) : null}
          {context.centre && (
            <div className="chips groups" role="group" aria-label="Stereo flag">
              {([["abs", "Absolute"], ["&1", "And group 1 (racemic)"], ["or1", "Or group 1 (relative)"]] as const).map(([flag, name]) => (
                <button key={flag} className="chip" aria-pressed={context.enhanced === flag} onClick={() => run(`stereo.atom.${flag}`)} title={name}>{flag}</button>
              ))}
            </div>
          )}
        </>
      )}
      {context.kind === "structure" && context.stereo && (
        <div className="chips groups" role="group" aria-label="Stereochemistry">
          {([["absolute", "abs", "Absolute"], ["racemic", "rac", "Racemic"], ["relative", "rel", "Relative"]] as const).map(([id, text, name]) => (
            <button key={id} className="chip" aria-pressed={context.stereo === id} onClick={() => run(`stereo.${id}`)} title={name}>{text}</button>
          ))}
        </div>
      )}

      {context.kind === "bond" && (
        <>
          <div className="chips styles" role="group" aria-label="Bond style">
            {STYLES.map((kind) => (
              <button key={kind} className="chip" aria-pressed={context.style === kind} aria-label={BONDS[kind].name}
                title={hint(`bond.${kind}`) ? `${BONDS[kind].name} (${hint(`bond.${kind}`)})` : BONDS[kind].name} onClick={() => run(`bond.${kind}`)}>
                <BondGlyph kind={kind} />
              </button>
            ))}
          </div>
          <div className="chips rings" role="group" aria-label="Fuse a ring">
            {(["benzene", "6", "5"] as const).map((ring) => {
              const command = ring === "benzene" ? "bond.benzene" : `bond.ring${ring}`;
              const name = ring === "benzene" ? "Fuse a benzene" : `Fuse a ${ring}-membered ring`;
              return (
                <button key={ring} className="chip" onClick={() => run(command)} aria-label={name} title={hint(command) ? `${name} (${hint(command)})` : name}>
                  <RingGlyph kind={ring} />
                </button>
              );
            })}
          </div>
        </>
      )}

      {context.kind === "caption" && (
        <div className="chips" role="group" aria-label="Style">
          {([["bold", "Bold", <TextB size={16} />, context.bold], ["italic", "Italic", <TextItalic size={16} />, context.italic], ["underline", "Underline", <TextUnderline size={16} />, context.underline],
            ["sub", "Subscript", <TextSubscript size={16} />, context.script === "sub"], ["super", "Superscript", <TextSuperscript size={16} />, context.script === "super"]] as const).map(([id, name, icon, on]) => (
            <button key={id} className="chip" aria-pressed={on} aria-label={name} title={hint(`caption.${id}`) ? `${name} (${hint(`caption.${id}`)})` : name} onClick={() => run(`caption.${id}`)}>{icon}</button>
          ))}
          <button className="chip" aria-label="Formula" title={`Formula: counts become subscripts (${hint("caption.formula")})`} onClick={() => run("caption.formula")}><span className="glyph-text">H<sub>2</sub>O</span></button>
          {context.fonts && <div className="size font"><FontPick label="Font" font={context.font ?? context.fonts[0]} fonts={context.fonts} onPick={(f) => run(`caption.font.${f}`)} /></div>}
          <SizeButton size={context.size} run={run} />
          {([["left", "Flush left", <TextAlignLeft size={16} />], ["centre", "Centre text", <TextAlignCenter size={16} />], ["right", "Flush right", <TextAlignRight size={16} />], ["justify", "Justified", <TextAlignJustify size={16} />]] as const).map(([id, name, icon]) => (
            <button key={id} className="chip" aria-pressed={context.align === id} aria-label={name} title={hint(`caption.align.${id}`) ? `${name} (${hint(`caption.align.${id}`)})` : name} onClick={() => run(`caption.align.${id}`)}>{icon}</button>
          ))}
        </div>
      )}

      {(context.kind === "atom" || context.kind === "structure" || context.kind === "shape") && context.text && (
        // A label styles as text does, as in ChemDraw: the Text menu's styles, font and size on the selected labels,
        // and on a table's cells or a TLC plate's Rf values.
        <div className="chips label-style" role="group" aria-label="Label style">
          {([["bold", "Bold", <TextB size={16} />, context.text.bold], ["italic", "Italic", <TextItalic size={16} />, context.text.italic], ["underline", "Underline", <TextUnderline size={16} />, context.text.underline]] as const).map(([id, name, icon, on]) => (
            <button key={id} className="chip" aria-pressed={on} aria-label={name} title={hint(`caption.${id}`) ? `${name} (${hint(`caption.${id}`)})` : name} onClick={() => run(`caption.${id}`)}>{icon}</button>
          ))}
          <div className="size font"><FontPick label="Font" font={context.text.font} fonts={fonts} onPick={(f) => run(`caption.font.${f}`)} /></div>
          <SizeButton size={context.text.size} run={run} />
        </div>
      )}

      {context.kind === "shape" && context.shape !== "tlc" && context.shape !== "table" && (
        <div className="chips arrows" role="group" aria-label="Shape">
          {(isBracket({ kind: context.shape }) ? ["brackets", "parens", "braces"] as ShapeKind[] : ["box", "rounded", "oval", "highlight"] as ShapeKind[]).map((kind) => (
            <button key={kind} className="chip" aria-pressed={context.shape === kind} aria-label={SHAPES[kind]} title={SHAPES[kind]} onClick={() => run(`shape.kind.${kind}`)}>
              <ShapeGlyph kind={kind} />
            </button>
          ))}
        </div>
      )}
      {context.kind === "shape" && !isBracket({ kind: context.shape }) && context.shape !== "highlight" && context.shape !== "tlc" && context.shape !== "table" && (() => {
        // The shape's style, drawn as the shape itself in each style.
        const row = context.shape === "oval" ? "oval" : context.shape === "rounded" ? "rounded" : "box";
        return (
          <div className="chips arrows" role="group" aria-label="Style">
            {["plain", "dashed", "shaded", "solid", "shadow"].map((st) => (
              <button key={st} className="chip" aria-pressed={context.style === st} aria-label={shapeName(`${row}-${st}`)} title={shapeName(`${row}-${st}`)} onClick={() => run(`shape.style.${st}`)}>
                <ElementGlyph v={`${row}-${st}`} />
              </button>
            ))}
          </div>
        );
      })()}
      {(context.kind === "spot" || (context.kind === "shape" && context.shape === "tlc")) && (
        // A spot's style (or every spot's, from the plate), each drawn as a spot.
        <div className="chips arrows" role="group" aria-label="Spot">
          {(["filled", "hollow", "shaded"] as const).map((st) => (
            <button key={st} className="chip" aria-pressed={context.kind === "spot" && context.style === st} aria-label={`${st[0].toUpperCase()}${st.slice(1)} spot${context.kind === "spot" ? "" : "s"}`} title={`${st[0].toUpperCase()}${st.slice(1)} spot${context.kind === "spot" ? "" : "s"}`}
              onClick={() => run(context.kind === "spot" ? `spot.style.${st}` : `shape.spots.${st}`)}>
              <SpotGlyph style={st} />
            </button>
          ))}
        </div>
      )}
      {context.kind === "spot" && (
        <div className="sliders" role="group" aria-label="Size">
          <Slider name="Width" value={context.w} min={0.04} max={1} step={0.01} show={(v) => `${(v * 2 * context.pt).toFixed(1)} pt`} onChange={(v) => run(`spot.w.${Math.round(v * 100)}`)} />
          <Slider name="Height" value={context.h} min={0.04} max={1} step={0.01} show={(v) => `${(v * 2 * context.pt).toFixed(1)} pt`} onChange={(v) => run(`spot.h.${Math.round(v * 100)}`)} />
          <Slider name="Tail" value={context.tail} min={0} max={2} step={0.01} show={(v) => `${(v * context.pt).toFixed(1)} pt`} onChange={(v) => run(`spot.tail.${Math.round(v * 100)}`)} />
        </div>
      )}
      {context.kind === "shape" && context.shape === "table" && (() => {
        // The table's lines (a set, then each line on its own), its cells' alignment (the column last typed in, or
        // every column) and the lines' width.
        const same = (a: TableLine[], b: TableLine[]) => a.length === b.length && a.every((x) => b.includes(x));
        const EACH: [TableLine, string][] = [["top", "Top line"], ["header", "Line under the header"], ["rows", "Lines between rows"], ["bottom", "Bottom line"], ["left", "Left line"], ["cols", "Lines between columns"], ["right", "Right line"]];
        return (
          <>
            <div className="chips arrows" role="group" aria-label="Lines">
              {([["journal", "Journal rules"], ["grid", "All lines"], ["box", "Box"], ["none", "No lines"]] as const).map(([id, name]) => (
                <button key={id} className="chip" aria-pressed={same(context.lines, TABLE_LINES[id])} aria-label={name} title={name} onClick={() => run(`shape.lines.${id}`)}><TableGlyph on={TABLE_LINES[id]} faint={id === "none"} /></button>
              ))}
            </div>
            <div className="chips arrows" role="group" aria-label="Each line">
              {EACH.map(([id, name]) => (
                <button key={id} className="chip" aria-pressed={context.lines.includes(id)} aria-label={name} title={name} onClick={() => run(`shape.lines.${id}`)}><TableGlyph on={[id]} faint /></button>
              ))}
            </div>
            <div className="chips" role="group" aria-label="Alignment">
              {([["left", "Flush left", <TextAlignLeft size={16} />], ["centre", "Centre text", <TextAlignCenter size={16} />], ["right", "Flush right", <TextAlignRight size={16} />]] as const).map(([id, name, icon]) => (
                <button key={id} className="chip" aria-pressed={context.cellAlign === id} aria-label={name} title={name} onClick={() => run(`shape.align.${id}`)}>{icon}</button>
              ))}
            </div>
            <div className="sliders" role="group" aria-label="Lines">
              <Slider name="Line width" value={context.weight} min={0.1} max={4} step={0.05} show={(v) => `${v.toFixed(2)} pt`} onChange={(v) => run(`shape.weight.${Math.round(v * 100)}`)} />
            </div>
          </>
        );
      })()}
      {context.kind === "shape" && context.style === "shadow" && (
        // The shadow's depth (how far it falls), softness and opacity, each on a slider.
        <div className="sliders" role="group" aria-label="Shadow">
          <Slider name="Depth" value={context.shade.depth} min={0} max={0.5} step={0.01} show={(v) => `${(v * context.shade.pt).toFixed(1)} pt`} onChange={(v) => run(`shape.depth.${Math.round(v * 100)}`)} />
          <Slider name="Softness" value={context.shade.blur} min={0} max={0.5} step={0.01} show={(v) => `${(v * context.shade.pt).toFixed(1)} pt`} onChange={(v) => run(`shape.blur.${Math.round(v * 100)}`)} />
          <Slider name="Opacity" value={context.shade.opacity} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => run(`shape.opacity.${Math.round(v * 100)}`)} />
        </div>
      )}
      {context.kind === "shape" && isBracket({ kind: context.shape }) && (() => {
        // Both brackets or one, and the sign at the top right: drawn as they read.
        const [l, r] = context.shape === "parens" ? ["(", ")"] : context.shape === "braces" ? ["{", "}"] : ["[", "]"];
        return (
          <>
            <div className="chips arrows" role="group" aria-label="Sides">
              {([["both", `${l} ${r}`, "Both"], ["left", l, "Left only"], ["right", r, "Right only"]] as const).map(([id, text, name]) => (
                <button key={id} className="chip" aria-pressed={context.side === id} aria-label={name} title={name} onClick={() => run(`shape.side.${id}`)}><span className="glyph-text">{text}</span></button>
              ))}
            </div>
            <div className="chips arrows" role="group" aria-label="Sign">
              {["‡", "†", "+", "–", "n"].map((m) => (
                <button key={m} className="chip" aria-pressed={context.mark === m} aria-label={m === "n" ? "Repeat count n" : m} title={m === "n" ? "Repeat count n" : m} onClick={() => run(`shape.mark.${m}`)}><span className="glyph-text">{m}</span></button>
              ))}
            </div>
          </>
        );
      })()}

      {context.kind === "arrow" && context.orbital && (() => {
        // The orbital's shape, and its phases, each drawn as itself.
        const o = context.orbital;
        return (
          <>
            <div className="chips arrows" role="group" aria-label="Orbital">
              {ORBITAL_SHAPES.map((shape) => (
                <button key={shape} className="chip" aria-pressed={o.shape === shape} aria-label={orbitalName(`${shape}-plain`)} title={orbitalName(`${shape}-plain`)} onClick={() => run(`orbital.shape.${shape}`)}>
                  <OrbitalGlyph v={`${shape}-${o.phase === "phased" && !["p", "d", "dz2", "hybrid"].includes(shape) ? "filled" : o.phase}`} />
                </button>
              ))}
            </div>
            <div className="chips arrows" role="group" aria-label="Phase">
              {PHASES.filter((ph) => ph !== "phased" || ["p", "d", "dz2", "hybrid"].includes(o.shape)).map((ph) => (
                <button key={ph} className="chip" aria-pressed={o.phase === ph} aria-label={orbitalName(`${o.shape}-${ph}`)} title={orbitalName(`${o.shape}-${ph}`)} onClick={() => run(`orbital.phase.${ph}`)}>
                  <OrbitalGlyph v={`${o.shape}-${ph}`} />
                </button>
              ))}
            </div>
          </>
        );
      })()}
      {context.kind === "arrow" && !isLine({ kind: context.arrow }) && context.arrow !== "orbital" && (
        // The arrow's kind, the choice made most: reaction, equilibrium, resonance, retrosynthetic, no-go.
        <div className="chips arrows" role="group" aria-label="Arrow">
          {ARROW_KINDS.map((kind) => (
            <button key={kind} className="chip" aria-pressed={context.arrow === kind} aria-label={ARROWS[kind]} title={ARROWS[kind]} onClick={() => run(`arrow.kind.${kind}`)}>
              <ArrowGlyph kind={curved({ kind }) ? `${kind}-${context.sweep ?? 120}` : kind} />
            </button>
          ))}
        </div>
      )}
      {context.kind === "arrow" && (context.heads || context.curved) && (() => {
        // The rest of ChemDraw's Curves menu, one small button each: the line, the head at each end, the heads' shape,
        // the curve's sweep and a closed curve's fill. Each shows its choice; a click opens the others.
        const c = context, HEADS = [["none", "None"], ["full", "Arrowhead"], ["left", "Half, left"], ["right", "Half, right"]] as const;
        return (
          <div className="picks" role="group" aria-label="Line and arrowheads">
            {c.heads && <PickButton label="Line" value={c.style ?? "plain"} onPick={(v) => run(`arrow.style.${v}`)}
              options={([["plain", "Plain"], ["dashed", "Dashed"], ["bold", "Bold"], ["doubled", "Double"], ["wavy", "Wavy"]] as const).map(([id, name]) => ({ id, name, glyph: <LineGlyph style={id} /> }))} />}
            {c.heads && <PickButton label="Start" value={c.start ?? "none"} onPick={(v) => run(`arrow.start.${v}`)} options={HEADS.map(([id, name]) => ({ id, name, glyph: <LineGlyph start={id} head={c.head} /> }))} />}
            {c.heads && <PickButton label="End" value={c.end ?? "none"} onPick={(v) => run(`arrow.end.${v}`)} options={HEADS.map(([id, name]) => ({ id, name, glyph: <LineGlyph end={id} head={c.head} /> }))} />}
            {c.heads && (c.start !== "none" || c.end !== "none") && <PickButton label="Heads" value={c.head ?? "solid"} onPick={(v) => run(`arrow.head.${v}`)}
              options={([["solid", "Solid"], ["hollow", "Hollow"], ["angled", "Open"]] as const).map(([id, name]) => ({ id, name, glyph: <LineGlyph end="full" head={id} /> }))} />}
            {c.curved && <PickButton label="Curve" value={String(c.sweep ?? 120)} onPick={(v) => run(`arrow.sweep.${v}`)}
              options={SWEEPS.map((sweep) => ({ id: String(sweep), name: `${sweep}°`, glyph: c.arrow === "arc" ? <ElementGlyph v={`arc-${sweep}`} /> : <ArrowGlyph kind={`${curved({ kind: c.arrow }) ? c.arrow : "curved"}-${sweep}`} /> }))} />}
            {c.closed && <PickButton label="Fill" value={c.fill ?? "none"} onPick={(v) => run(`arrow.fill.${v}`)}
              options={([["none", "None"], ["solid", "Filled"], ["shaded", "Shaded"], ["faded", "Faded"]] as const).map(([id, name]) => ({ id, name, glyph: <FillGlyph fill={id} /> }))} />}
          </div>
        );
      })()}
      {((context.kind === "shape" && context.shape !== "highlight" && context.shape !== "table" && context.style !== "solid" && context.style !== "shaded") || context.kind === "arrow") && (
        // The width of the lines, for every object drawn in lines (a table's is with its lines, above).
        <div className="sliders" role="group" aria-label="Lines">
          <Slider name="Line width" value={context.kind === "arrow" ? context.width : context.weight} min={0.05} max={4} step={0.05} show={(v) => `${v.toFixed(2)} pt`} onChange={(v) => run(`${context.kind}.weight.${Math.round(v * 100)}`)} />
        </div>
      )}
      {colour && (
        // Colour is a section of its own, titled like the sets below, and set off from the main rows.
        <div className="colour-block" role="group" aria-label="Colour">
        <span className="tray-title" aria-hidden>Colour</span>
        {/* One colour row for every kind of selection. A highlight takes a pale fill; anything else an ink colour. */}
        <div className="swatches small" role="radiogroup" aria-label="Colour">
          {[...(colour.tints ? TINTS : COLOURS), ...palette.map((c): [string, string] => [c.name, c.hex])].map(([name, hex]) => (
            <button key={`${name}${hex}`} role="radio" aria-checked={colour.value.toLowerCase() === hex.toLowerCase()} aria-label={name} title={name} className="swatch" style={{ background: hex }} onClick={() => run(`colour.${hex}`)} />
          ))}
          <button className="swatch custom" title="Add a colour" aria-label="Add a colour" onClick={() => run("colours_add")}><PlusIcon size={12} aria-hidden /></button>
        </div>
        {(context.kind === "structure" || context.kind === "atom") && (() => {
          // Highlight (a disc behind each atom) and ring fill (every ring wholly selected), each a labelled button.
          const swatch = (c: string) => <span className="pick-swatch" style={{ background: c }} />;
          const options = [{ id: "none", name: "None", glyph: <span className="pick-swatch none" /> }, ...HIGHLIGHTS.map(([name, hex]) => ({ id: hex, name, glyph: swatch(hex) }))];
          return (
            <div className="picks" role="group" aria-label="Highlight and ring fill">
              <PickButton label="Highlight" value={context.halo ?? "none"} options={options} onPick={(v) => run(`halo.${v}`)} />
              <PickButton label="Ring fill" value={context.fill ?? "none"} options={options} onPick={(v) => run(`ringfill.${v}`)} />
            </div>
          );
        })()}
        </div>
      )}


      {(rows.length > 0 || (menus && sets.length > 0) || carry) && (
        <div className="actions-list">
          {rows.map((i, k) => (
            <div key={i.command} data-command={i.command} className={["action-slot", carry?.command === i.command && "carried", settled === i.command && "settled"].filter(Boolean).join(" ")}
              data-gap={carry?.to?.rows && rows.filter((r) => r.command !== carry.command).indexOf(i) === carry.to.index ? "" : undefined}
              onPointerDown={(e) => startCarry(e, i.command)} onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); dragged.current = false; } }}>
              <Row icon={i.icon} name={i.name} command={i.command} hint={hint(i.command)} run={run} accent={i.accent} />
              {k === rows.length - 1 && carry?.to?.rows && carry.to.index >= rows.filter((r) => r.command !== carry.command).length && <span className="drop-line end" aria-hidden />}
            </div>
          ))}
          {menus && sets.map(([s, list]) => s === "delete" ? <Row key={s} icon={list[0].icon} name={list[0].name} command={list[0].command} hint={hint(list[0].command)} run={run} /> : (
            <button key={s} className="action submenu-row" aria-haspopup="menu" aria-expanded={sub?.set === s}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect(), p = panel.current!.getBoundingClientRect();
                setSub(sub?.set === s ? undefined : { set: s, top: r.top - 5, right: innerWidth - p.left + 8 });
              }}>
              {SET_ICONS[s]}
              <span className="action-name">{SET_TITLES[s]}</span>
              <CaretRight size={12} className="submenu-caret" aria-hidden />
            </button>
          ))}
        </div>
      )}
      {menus && sub && (() => {
        const list = sets.find(([s]) => s === sub.set)?.[1];
        if (!list) return null;
        const groups = sub.set === "more" ? MORE_GROUPS.map((k) => list.filter((i) => kindOf(i.command) === k)) : [list];
        return (
          <div ref={subBox}>
            <Menu label={SET_TITLES[sub.set]} className="panel-submenu" columns={1} style={{ position: "fixed", top: sub.top, right: sub.right, left: "auto" }}
              groups={groups.map((g) => g.map((i) => ({ key: i.command, name: i.name, icon: i.icon })))}
              onChoose={(command) => { setSub(undefined); run(command); }} />
          </div>
        );
      })()}

      {((!menus && sets.length > 0) || carry) && (
        <div className={carry && !carry.to?.rows && carry.to ? "tray receiving" : "tray"} role="toolbar" aria-label="More actions">
          {sets.map(([s, set]) => (
            <div key={s} className="tray-set" role="group" aria-label={SET_TITLES[s]}>
            {!(set.length === 1 && set[0].command === "delete") && <span className="tray-title" aria-hidden>{SET_TITLES[s]}</span>}
            <div className="tray-buttons">
            {set.map((i) => (
            <button
              key={i.command}
              data-command={i.command}
              className={["tray-button", i.command === "delete" && "delete", i.accent && "accent", carry?.command === i.command && "carried", settled === i.command && "settled"].filter(Boolean).join(" ")}
              aria-label={i.name}
              onPointerDown={(e) => startCarry(e, i.command)}
              onClick={() => { if (dragged.current) { dragged.current = false; return; } hideTip(); run(i.command); }}
              onPointerEnter={(e) => showTip(e, label(i))}
              onPointerLeave={hideTip}
              onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: label(i), x: r.left + r.width / 2, y: r.top }); }}
              onBlur={hideTip}
            >
              {i.icon}
            </button>
            ))}
            </div>
            </div>
          ))}
        </div>
      )}
      {/* Settings is always last, with Home beside it. */}
      <div className="actions-foot">
        <button className="actions-settings" onClick={() => run("settings")}>
          <GearSix size={16} aria-hidden />
          <span>Settings</span>
          {hint("settings") && <kbd>{hint("settings")}</kbd>}
        </button>
        <button className="actions-home" aria-label="Home" onClick={() => { hideTip(); run("home"); }}
          onPointerEnter={(e) => showTip(e, hint("home") ? `Home  ${hint("home")}` : "Home")} onPointerLeave={hideTip}
          onFocus={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: "Home", x: r.left + r.width / 2, y: r.top }); }} onBlur={hideTip}>
          <House size={16} aria-hidden />
        </button>
      </div>
      {tip && <span className="tip" role="tooltip" style={{ left: Math.min(tip.x, innerWidth - 8), top: tip.y }}>{tip.text}</span>}
      {carry && (() => {
        const i = items.find((x) => x.command === carry.command);
        return i && <span className="action-carry" style={{ left: carry.x, top: carry.y }} aria-hidden>{i.icon}<span>{i.name}</span></span>;
      })()}
    </section>
  );
}
