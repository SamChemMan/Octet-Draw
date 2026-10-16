// The Actions panel: a small dock in the bottom-right corner whose actions follow what is selected.
// It answers "what would I want to do next, here?" in order of weight: what the selection is (formula, mass),
// what is wrong with it (problems, each with a fix), then its actions, likeliest first. A long list keeps its first
// rows and folds the rest into small buttons that name themselves on hover. Every action also lives where
// ChemDraw users expect it (menus and keys).
import { useEffect, useRef, useState } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, ArrowClockwise, ArrowsClockwise, SignIn, SignOut, ArrowCounterClockwise, ArrowsLeftRight, ArrowsOutSimple, Atom, BookmarkSimple, CaretDown,
  ClipboardText, CopySimple, LineSegments, Minus, Plus, Stack, StackSimple, Eye, FileArrowDown, FlipHorizontal, FlipVertical, GearSix, LinkBreak, LinkSimple, ListNumbers, MagicWand, MinusCircle,
  PencilSimpleLine, PlusCircle, SelectionAll, SlidersHorizontal, SquareSplitHorizontal, TagSimple, TextAa, TextAlignCenter, TextAlignLeft,
  TextAlignRight, TextB, TextItalic, TextT, TextUnderline, Trash, Warning, X, Plus as PlusIcon, Rows, RowsPlusBottom, Columns, ColumnsPlusRight, GridFour, Circle,
} from "@phosphor-icons/react";
import type { Analysis } from "./chem";
import type { Problem } from "./check";
import { ARROW_KINDS, curved, isBracket, isLine, ORBITAL_SHAPES, PHASES, SWEEPS, type ArrowKind, type Head, type HeadShape, type OrbitalShape, type Phase, type ShapeKind } from "./render";
import { ElementGlyph, OrbitalGlyph, orbitalName, shapeName, FillGlyph, LineGlyph } from "./elements";
import { COLOURS, TINTS } from "./docstyle";
import { ArrowGlyph, ARROWS, BondGlyph, BONDS, RingGlyph, ShapeGlyph, SHAPES, SymbolGlyph, type BondKind } from "./tools";

export type Context =
  | { kind: "empty" }
  | { kind: "drawing"; nameable: boolean }
  | { kind: "structure"; atoms: number; structures: number; next: string; nameable: boolean; pairs?: "shown" | "hidden"; stereo?: "absolute" | "racemic" | "relative" | "mixed" }
  // mode: picked captions, the text being typed, or the style the next text starts with (Text tool in hand).
  | { kind: "caption"; mode: "picked" | "typing" | "next"; convertible: boolean; count: number; colour: string; bold: boolean; italic: boolean; underline: boolean; size: number; align: "left" | "centre" | "right"; attached: boolean; attachable: boolean }
  | { kind: "arrow"; count: number; arrow: ArrowKind; curved: boolean; sweep?: number; style: string; orbital?: { shape: OrbitalShape; phase: Phase };
      heads: boolean; start: Head; end: Head; head: HeadShape; closed?: boolean; fill: string }
  | { kind: "shape"; count: number; shape: ShapeKind; dashed: boolean; colour: string; style: string; side: string; mark: string; rf: boolean; grid: boolean; shade: { depth: number; blur: number; opacity: number; pt: number } }
  | { kind: "cycle"; clockwise: boolean; steps: number; centre: boolean }
  | { kind: "reaction"; steps: number; structures: number; clean: boolean; mapped: boolean }
  | { kind: "atom"; label: string; charge: number; terminal: boolean; carbon: boolean; centre: boolean; enhanced?: string }
  | { kind: "bond"; style: BondKind | undefined; double: boolean; flippable: boolean };

type Props = {
  open: boolean;
  context: Context;
  analysis?: Analysis;
  problems: Problem[];
  messy: boolean;
  hint: (command: string) => string | undefined; // the key for a command, if it has one
  onOpen: (open: boolean) => void;
  run: (command: string) => void;
  // The user's arrangement for each kind of selection: the order of actions and how many show as rows.
  layout: Record<string, { order: string[]; rows: number }>;
  onLayout: (kind: string, layout: { order: string[]; rows: number }) => void;
  colour?: { value: string; tints?: boolean }; // the selection's colour, shown in the one colour row every selection gets
  palette: { name: string; hex: string }[]; // the user's own colours, after Octet's
};

const ELEMENTS = ["C", "N", "O", "S", "P", "F", "Cl", "Br", "I"];
const STYLES: BondKind[] = ["single", "double", "triple", "wedge", "hashwedge", "hollow", "bold", "hashed", "dashed", "wavy", "dative"];
// On a chain end: the groups chemists put there most. Values are what the atom becomes.
const ENDS = [["OH", "O"], ["NH₂", "N"], ["Me", "Me"], ["OMe", "OMe"], ["CO₂H", "CO2H"], ["CF₃", "CF3"], ["CN", "CN"], ["Ph", "Ph"]];

// Digits in a formula as subscripts: C8H9NO2 → C₈H₉NO₂.
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
const formula = (f: string) => f.replace(/\d/g, (d) => SUBSCRIPT[Number(d)]);

// The caption size: click for a menu of sizes; Enter or double-click to type any size.
const SIZES = [8, 9, 10, 12, 14, 18, 24, 36];
function SizeButton({ size, run }: { size: number; run: (command: string) => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState<string>();
  const typing = useRef(false); // Enter, Escape and blur all end typing; only the first one counts
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", escape, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", escape, true); };
  }, [open]);
  const startTyping = () => { typing.current = true; setOpen(false); setTyped(String(size)); };
  const endTyping = (keep: boolean) => {
    if (!typing.current) return;
    typing.current = false;
    const pt = Math.round(Number(typed) * 2) / 2;
    setTyped(undefined);
    if (keep && pt >= 4 && pt <= 144 && pt !== size) run(`caption.size.${pt}`);
  };
  return (
    <div className="size" ref={box}>
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
        <button
          className="chip size-button"
          aria-haspopup="menu"
          aria-expanded={open}
          title="Size"
          onClick={() => setOpen(!open)}
          onDoubleClick={startTyping}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); startTyping(); } }}
        >
          {size} pt
          <CaretDown size={12} aria-hidden />
        </button>
      )}
      {open && (
        <div className="size-menu" role="menu" aria-label="Size">
          {SIZES.map((pt) => (
            <button key={pt} role="menuitemradio" aria-checked={pt === size} onClick={() => { setOpen(false); if (pt !== size) run(`caption.size.${pt}`); }}>
              {pt} pt
            </button>
          ))}
        </div>
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

// small: shown as a small button by default (the user can drag it into the rows, and any row out of them).
export type Item = { icon: React.ReactNode; name: string; command: string; accent?: boolean; small?: boolean };

// The actions for a selection, likeliest first. The panel shows them; the command palette lists them too.
export function actionItems(context: Context, messy: boolean): Item[] {
  const items: Item[] = [];
  const it = (icon: React.ReactNode, name: string, command: string, accent?: boolean, small?: boolean): Item => ({ icon, name, command, accent, small });
  const small = (i: Item): Item => ({ ...i, small: true });
  const clean = it(<MagicWand size={18} />, "Clean up", "clean_up", messy);
  const nameIt = it(<TagSimple size={18} />, "Structure to name", "structure_to_name");
  const del = it(<Trash size={18} />, "Delete", "delete");
  const flips = [it(<FlipHorizontal size={18} />, "Rotate 180° horizontal", "flip_h", false, true), it(<FlipVertical size={18} />, "Rotate 180° vertical", "flip_v", false, true)];
  const mirrors = [it(<FlipHorizontal size={18} />, "Flip horizontal", "mirror_h", false, true), it(<FlipVertical size={18} />, "Flip vertical", "mirror_v", false, true)];

  switch (context.kind) {
    case "empty":
      items.push(it(<Atom size={18} />, "Name to structure", "name_to_structure"), it(<FileArrowDown size={18} />, "Import a structure", "import"),
        it(<ClipboardText size={18} />, "Paste a SMILES or MOL", "paste_hint"));
      break;
    case "drawing":
      items.push(clean, ...(context.nameable ? [nameIt] : []), it(<CopySimple size={18} />, "Copy as SMILES", "copy_smiles"),
        it(<Atom size={18} />, "Name to structure", "name_to_structure"), it(<FileArrowDown size={18} />, "Import a structure", "import"), ...flips,
        small(it(<SelectionAll size={18} />, "Select all", "select_all")), small(it(<ArrowsOutSimple size={18} />, "Zoom to fit", "zoom_fit")));
      break;
    case "structure":
      // Sam's order (16 October 2026): Clean up, Structure to name and the flips as rows; then lone pairs, number,
      // caption, the turns, Copy as SMILES, Add to rings and Delete as small buttons.
      items.push(clean, ...(context.nameable ? [nameIt] : []), it(<FlipVertical size={18} />, "Rotate 180° vertical", "flip_v"), it(<FlipHorizontal size={18} />, "Rotate 180° horizontal", "flip_h"));
      if (context.pairs) items.push(small(it(<SymbolGlyph kind="pair" />, context.pairs === "shown" ? "Hide lone pairs" : "Show lone pairs", "pairs")));
      items.push(small(it(<ListNumbers size={18} />, context.structures > 1 ? "Number these compounds" : "Number this compound", "number")),
        small(it(<TextT size={18} />, "Add a caption", "caption.add")),
        small(it(<ArrowClockwise size={18} />, "Turn 15° right", "rotate.cw15")), small(it(<ArrowCounterClockwise size={18} />, "Turn 15° left", "rotate.ccw15")),
        small(it(<CopySimple size={18} />, "Copy as SMILES", "copy_smiles")), small(it(<BookmarkSimple size={18} />, "Add to rings", "template.add")));
      if (context.structures > 1) items.push(small(it(<ArrowsClockwise size={18} />, "Make a catalytic cycle", "cycle.make")), small(it(<AlignCenterHorizontal size={18} />, "Line up in a row", "align.row")),
        small(it(<AlignCenterVertical size={18} />, "Line up in a column", "align.column")), small(it(<SquareSplitHorizontal size={18} />, "Space evenly", "align.spread-row")));
      items.push(...mirrors, small(del));
      break;
    case "atom":
      items.push(it(<TextAa size={18} />, "Type a label", "atom.label"), it(<PlusCircle size={18} />, "Add a positive charge", "charge.plus"), it(<MinusCircle size={18} />, "Add a negative charge", "charge.minus"), del);
      break;
    case "bond":
      if (context.double) items.push(it(<span className="glyph-text">L</span>, "Second line on the left", "bond.left"), it(<span className="glyph-text">C</span>, "Centre the double bond", "bond.centre"), it(<span className="glyph-text">R</span>, "Second line on the right", "bond.right"));
      if (context.flippable) items.push(it(<FlipHorizontal size={18} />, "Point the other way", "bond.flip"));
      items.push(del);
      break;
    case "caption":
      if (context.mode !== "picked") break;
      if (context.convertible) items.push(it(<Atom size={18} />, "Convert to structure", "name_to_structure"));
      if (context.count === 1) items.push(it(<PencilSimpleLine size={18} />, "Edit text", "caption.edit"));
      if (context.attached) items.push(it(<LinkBreak size={18} />, "Un-tie from structure", "caption.detach"));
      else if (context.attachable) items.push(it(<LinkSimple size={18} />, "Tie to structure", "caption.attach"));
      items.push(del);
      break;
    case "reaction":
      items.push(it(<MagicWand size={18} />, "Clean up reaction", "reaction.clean", !context.clean),
        it(<ListNumbers size={18} />, "Number these compounds", "number"), it(<CopySimple size={18} />, "Copy as SMILES", "copy_smiles"),
        it(<span className="glyph-text">A→A</span>, "Map atoms", "reaction.map"), ...(context.mapped ? [small(it(<X size={18} />, "Clear atom map", "reaction.unmap"))] : []), small(del));
      break;
    case "cycle":
      if (!context.centre) items.push(it(<TextT size={18} />, "Add a centre label", "cycle.centre"));
      items.push(it(<SignIn size={18} />, "Add a reagent coming in", "cycle.in"), it(<SignOut size={18} />, "Add a product going out", "cycle.out"),
        it(<MagicWand size={18} />, "Tidy the cycle", "cycle.tidy"), small(it(<ArrowsLeftRight size={18} />, "Reverse the direction", "cycle.reverse")),
        small(it(<LinkBreak size={18} />, "Ungroup", "cycle.ungroup")), small(del));
      break;
    case "shape":
      if (context.shape === "tlc") {
        items.push(it(<Plus size={18} />, "Add a lane", "shape.lanes.1"), it(<Minus size={18} />, "Remove a lane", "shape.lanes.-1"),
          it(<span className="glyph-text">Rf</span>, context.rf ? "Hide Rf values" : "Show Rf values", "shape.rf"), del);
        break;
      }
      if (context.shape === "table") {
        items.push(it(<RowsPlusBottom size={18} />, "Add a row", "shape.rows.1"), it(<ColumnsPlusRight size={18} />, "Add a column", "shape.cols.1"),
          small(it(<Rows size={18} />, "Remove a row", "shape.rows.-1")), small(it(<Columns size={18} />, "Remove a column", "shape.cols.-1")),
          it(<GridFour size={18} />, context.grid ? "Journal rules" : "All lines", "shape.grid"), del);
        break;
      }
      if (isBracket({ kind: context.shape })) items.push(it(<LineSegments size={18} />, context.dashed ? "Solid lines" : "Dashed lines", "shape.dashed"));
      items.push(small(it(<StackSimple size={18} />, "Bring to front", "shape.front")), small(it(<Stack size={18} />, "Send to back", "shape.back")), del);
      break;
    case "arrow":
      if (context.arrow === "orbital") { items.push(it(<ArrowsLeftRight size={18} />, "Swap the phases", "orbital.swap"), del); break; }
      if (context.arrow === "curve") { items.push(it(<Circle size={18} />, context.closed ? "Open the curve" : "Close the curve", "arrow.closed"), it(<ArrowsLeftRight size={18} />, "Reverse", "arrow.reverse"), del); break; }
      if (isLine({ kind: context.arrow })) { items.push(it(<ArrowsLeftRight size={18} />, "Reverse", "arrow.reverse"), ...(context.curved ? [it(<FlipVertical size={18} />, "Flip the curve", "arrow.flip")] : []), del); break; }
      if (context.count === 1 && !context.curved) items.push(it(<TextT size={18} />, "Add conditions above", "arrow.above"), it(<TextT size={18} />, "Add conditions below", "arrow.below"));
      items.push(it(<ArrowsLeftRight size={18} />, "Reverse", "arrow.reverse"));
      if (context.curved) items.push(it(<FlipVertical size={18} />, "Flip the curve", "arrow.flip"));
      items.push(del);
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

export function Actions({ open, context, analysis, problems, messy, hint, onOpen, run, layout, onLayout, colour, palette }: Props) {
  // An action being dragged to a new place: in the rows (index among rows) or the small buttons (index among them).
  const [carry, setCarry] = useState<{ command: string; x: number; y: number; to?: { rows: boolean; index: number } }>();
  const dragged = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const [settled, setSettled] = useState<string>();
  // Closing plays the panel's exit before it leaves the page; the Actions button then comes in where it was.
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
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
    structure: context.kind === "structure" && context.structures > 1 ? `${context.structures} structures` : "Structure",
    atom: "Atom",
    bond: "Bond",
    caption: context.kind !== "caption" || context.mode !== "picked" ? "Text" : context.count > 1 ? `${context.count} captions` : "Caption",
    arrow: context.kind !== "arrow" ? "Arrow" : context.arrow === "orbital" ? (context.count > 1 ? `${context.count} orbitals` : "Orbital")
      : context.count > 1 ? `${context.count} ${context.arrow === "curve" ? "curves" : isLine({ kind: context.arrow }) ? "lines" : "arrows"}`
      : context.arrow === "curve" ? "Curve" : context.arrow === "arc" ? "Arc" : context.arrow === "line" ? "Line" : "Arrow",
    cycle: "Catalytic cycle",
    reaction: context.kind === "reaction" && context.steps > 1 ? `${context.steps}-step reaction` : "Reaction",
    shape: context.kind === "shape" && context.count > 1 ? `${context.count} shapes` : context.kind === "shape" ? SHAPES[context.shape] : "Shape",
    line: "Line",
  }[context.kind];
  const whole = context.kind === "drawing" || context.kind === "structure";

  const items = actionItems(context, messy);
  // The user's order first (actions it does not know keep their place after it), then their split into rows.
  const mine = layout[context.kind];
  if (mine) items.sort((a, b) => {
    const [i, j] = [mine.order.indexOf(a.command), mine.order.indexOf(b.command)];
    return i < 0 || j < 0 ? 0 : i - j;
  });
  // By default the main actions come first as rows, and the ones marked small follow as small buttons.
  if (!mine) items.sort((a, b) => Number(!!a.small) - Number(!!b.small));
  const split = Math.min(items.length, mine ? mine.rows : items.filter((i) => !i.small).length);
  const rows = items.slice(0, split), tray = items.slice(split);

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
        <button className="actions-close" onClick={() => onOpen(false)} aria-label="Hide actions" title="Hide actions">
          <X size={14} />
        </button>
      </header>

      {analysis && whole && analysis.slice(0, 3).map((a, k) => (
        <button key={k} className="facts" onClick={() => run(`copy_text:${a.formula}, ${a.weight.toFixed(2)} g/mol`)} title={`Exact mass ${a.exact.toFixed(4)}. Click to copy.`}>
          <span className="formula">{formula(a.formula)}</span>
          <span>{a.weight.toFixed(2)} g/mol</span>
        </button>
      ))}

      {problems.length > 0 && context.kind !== "empty" && (
        <div className="problems" role="status">
          {problems.slice(0, 2).map((p) => (
            <div key={p.atom} className="problem">
              <Warning size={16} weight="bold" aria-hidden />
              <p>{p.message}</p>
              <div className="problem-buttons">
                {p.fix && <button onClick={() => run(`fix:${p.atom}:${p.fix!.charge}`)}>Fix</button>}
                <button onClick={() => run(`show:${p.atom}`)}><Eye size={14} aria-hidden /> Show</button>
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
          {([["bold", "Bold", <TextB size={16} weight="bold" />, context.bold], ["italic", "Italic", <TextItalic size={16} />, context.italic], ["underline", "Underline", <TextUnderline size={16} />, context.underline]] as const).map(([id, name, icon, on]) => (
            <button key={id} className="chip" aria-pressed={on} aria-label={name} title={`${name} (${hint(`caption.${id}`)})`} onClick={() => run(`caption.${id}`)}>{icon}</button>
          ))}
          <SizeButton size={context.size} run={run} />
          {([["left", "Align left", <TextAlignLeft size={16} />], ["centre", "Centre", <TextAlignCenter size={16} />], ["right", "Align right", <TextAlignRight size={16} />]] as const).map(([id, name, icon]) => (
            <button key={id} className="chip" aria-pressed={context.align === id} aria-label={name} title={name} onClick={() => run(`caption.align.${id}`)}>{icon}</button>
          ))}
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

      {context.kind === "arrow" && context.heads && (() => {
        // The Curves controls, as ChemDraw's Curves menu: the line, the head at each end, the heads' shape, and
        // a closed curve's fill. Each chip draws what it does.
        const c = context, chip = (key: string, name: string, on: boolean, command: string, glyph: React.ReactNode) => (
          <button key={key} className="chip" aria-pressed={on} aria-label={name} title={name} onClick={() => run(command)}>{glyph}</button>
        );
        const HEADS = [["none", "No arrowhead"], ["full", "Arrowhead"], ["left", "Half arrowhead, left"], ["right", "Half arrowhead, right"]] as const;
        return (
          <>
            <div className="chips arrows" role="group" aria-label="Line">
              {([["plain", "Plain line"], ["dashed", "Dashed line"], ["bold", "Bold line"], ["doubled", "Double line"], ["wavy", "Wavy line"]] as const).map(([st, name]) =>
                chip(st, name, c.style === st, `arrow.style.${st}`, <LineGlyph style={st} />))}
            </div>
            <div className="chips arrows" role="group" aria-label="Start">
              {HEADS.map(([h, name]) => chip(h, `${name} at the start`, c.start === h, `arrow.start.${h}`, <LineGlyph start={h} head={c.head} />))}
            </div>
            <div className="chips arrows" role="group" aria-label="End">
              {HEADS.map(([h, name]) => chip(h, `${name} at the end`, c.end === h, `arrow.end.${h}`, <LineGlyph end={h} head={c.head} />))}
            </div>
            {(c.start !== "none" || c.end !== "none") && (
              <div className="chips arrows" role="group" aria-label="Arrowheads">
                {([["solid", "Solid arrowheads"], ["hollow", "Hollow arrowheads"], ["angled", "Open arrowheads"]] as const).map(([h, name]) =>
                  chip(h, name, c.head === h, `arrow.head.${h}`, <LineGlyph end="full" head={h} />))}
              </div>
            )}
            {c.closed && (
              <div className="chips arrows" role="group" aria-label="Fill">
                {([["none", "No fill"], ["solid", "Filled"], ["shaded", "Shaded"], ["faded", "Faded"]] as const).map(([f, name]) =>
                  chip(f, name, c.fill === f, `arrow.fill.${f}`, <FillGlyph fill={f} />))}
              </div>
            )}
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
        <div className="chips arrows" role="group" aria-label="Arrow">
          {ARROW_KINDS.map((kind) => (
            <button key={kind} className="chip" aria-pressed={context.arrow === kind} aria-label={ARROWS[kind]} title={ARROWS[kind]} onClick={() => run(`arrow.kind.${kind}`)}>
              <ArrowGlyph kind={curved({ kind }) ? `${kind}-${context.sweep ?? 120}` : kind} />
            </button>
          ))}
        </div>
      )}
      {context.kind === "arrow" && context.curved && (
        <div className="chips arrows" role="group" aria-label="Sweep">
          {SWEEPS.map((sweep) => (
            <button key={sweep} className="chip" aria-pressed={context.sweep === sweep} aria-label={`${sweep}°`} title={`${sweep}°`} onClick={() => run(`arrow.sweep.${sweep}`)}>
              {context.arrow === "arc" ? <ElementGlyph v={`arc-${sweep}`} /> : <ArrowGlyph kind={`${curved({ kind: context.arrow }) ? context.arrow : "curved"}-${sweep}`} />}
            </button>
          ))}
        </div>
      )}

      {colour && (
        // One colour row for every kind of selection. A highlight takes a pale fill; anything else an ink colour.
        <div className="swatches small" role="radiogroup" aria-label="Colour">
          {[...(colour.tints ? TINTS : COLOURS), ...palette.map((c): [string, string] => [c.name, c.hex])].map(([name, hex]) => (
            <button key={`${name}${hex}`} role="radio" aria-checked={colour.value.toLowerCase() === hex.toLowerCase()} aria-label={name} title={name} className="swatch" style={{ background: hex }} onClick={() => run(`colour.${hex}`)} />
          ))}
          <button className="swatch custom" title="Add a colour" aria-label="Add a colour" onClick={() => run("colours_add")}><PlusIcon size={10} weight="bold" aria-hidden /></button>
        </div>
      )}

      {(rows.length > 0 || carry) && (
        <div className="actions-list">
          {rows.map((i, k) => (
            <div key={i.command} data-command={i.command} className={["action-slot", carry?.command === i.command && "carried", settled === i.command && "settled"].filter(Boolean).join(" ")}
              data-gap={carry?.to?.rows && rows.filter((r) => r.command !== carry.command).indexOf(i) === carry.to.index ? "" : undefined}
              onPointerDown={(e) => startCarry(e, i.command)} onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); dragged.current = false; } }}>
              <Row icon={i.icon} name={i.name} command={i.command} hint={hint(i.command)} run={run} accent={i.accent} />
              {k === rows.length - 1 && carry?.to?.rows && carry.to.index >= rows.filter((r) => r.command !== carry.command).length && <span className="drop-line end" aria-hidden />}
            </div>
          ))}
        </div>
      )}

      {(tray.length > 0 || carry) && (
        <div className={carry && !carry.to?.rows && carry.to ? "tray receiving" : "tray"} role="toolbar" aria-label="More actions">
          {tray.map((i) => (
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
      )}
      {/* Settings is always last. */}
      <button className="actions-settings" onClick={() => run("settings")}>
        <GearSix size={16} aria-hidden />
        <span>Settings</span>
        {hint("settings") && <kbd>{hint("settings")}</kbd>}
      </button>
      {tip && <span className="tip" role="tooltip" style={{ left: Math.min(tip.x, innerWidth - 8), top: tip.y }}>{tip.text}</span>}
      {carry && (() => {
        const i = items.find((x) => x.command === carry.command);
        return i && <span className="action-carry" style={{ left: carry.x, top: carry.y }} aria-hidden>{i.icon}<span>{i.name}</span></span>;
      })()}
    </section>
  );
}
