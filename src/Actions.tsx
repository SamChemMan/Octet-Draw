// The Actions panel: a small dock in the bottom-right corner whose actions follow what is selected.
// It answers "what would I want to do next, here?": the formula and mass, problems with a fix, Clean up when
// the drawing needs it, the likely groups for an atom, ring fusion for a bond, and alignment for several
// structures. Every action also lives where ChemDraw users expect it (menus and keys).
import { useEffect, useRef, useState } from "react";
import {
  AlignCenterHorizontal, Atom, BookmarkSimple, CaretDown, AlignCenterVertical, ClipboardText, FileArrowDown, ArrowClockwise, ArrowCounterClockwise, ArrowsOutSimple, CopySimple,
  Eye, FlipHorizontal, FlipVertical, LinkBreak, LinkSimple, ListNumbers, MagicWand, MinusCircle, PencilSimpleLine, PlusCircle, SelectionAll,
  SlidersHorizontal, SquareSplitHorizontal, TextAa, TextAlignCenter, TextAlignLeft, TextAlignRight, TextB, TextItalic, TextT, TextUnderline, Trash, Warning, X,
} from "@phosphor-icons/react";
import type { Analysis } from "./chem";
import type { Problem } from "./check";
import { BondGlyph, BONDS, RingGlyph, type BondKind } from "./tools";

export type Context =
  | { kind: "empty" }
  | { kind: "drawing" }
  | { kind: "structure"; atoms: number; structures: number; next: string }
  | { kind: "caption"; convertible: boolean; count: number; bold: boolean; italic: boolean; underline: boolean; size: number; align: "left" | "centre" | "right"; attached: boolean; attachable: boolean }
  | { kind: "atom"; label: string; charge: number; terminal: boolean; carbon: boolean }
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
};

const ELEMENTS = ["C", "N", "O", "S", "P", "F", "Cl", "Br", "I"];
const STYLES: BondKind[] = ["single", "double", "triple", "wedge", "hashwedge", "hollow", "bold", "hashed", "dashed", "wavy", "dative"];
// On a chain end: the groups chemists put there most. Values are what the atom becomes.
const ENDS = [["OH", "O"], ["NH₂", "N"], ["Me", "Me"], ["OMe", "OMe"], ["CO₂H", "CO2H"], ["CF₃", "CF3"], ["CN", "CN"], ["Ph", "Ph"]];

// Digits in a formula as subscripts: C8H9NO2 → C₈H₉NO₂.
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
const formula = (f: string) => f.replace(/\d/g, (d) => SUBSCRIPT[Number(d)]);

function Row({ icon, name, note, command, hint, run, accent }: { icon: React.ReactNode; name: string; note?: string; command: string; hint?: string; run: (c: string) => void; accent?: boolean }) {
  return (
    <button className={accent ? "action accent" : "action"} onClick={() => run(command)}>
      {icon}
      <span className="action-name">
        {name}
        {note && <small>{note}</small>}
      </span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );
}

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
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
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
          onKeyDown={(e) => { if (e.key === "Enter") endTyping(true); if (e.key === "Escape") endTyping(false); }}
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

export function Actions({ open, context, analysis, problems, messy, hint, onOpen, run }: Props) {
  if (!open) {
    return (
      <button className="actions-reopen" onClick={() => onOpen(true)} title="Show actions">
        <SlidersHorizontal size={16} aria-hidden />
        Actions
        {problems.length > 0 && <span className="badge" aria-label={`${problems.length} problems`}>{problems.length}</span>}
      </button>
    );
  }
  const row = (icon: React.ReactNode, name: string, command: string, extra: { note?: string; accent?: boolean } = {}) =>
    <Row key={command} icon={icon} name={name} command={command} hint={hint(command)} run={run} {...extra} />;
  const title = {
    empty: "Actions",
    drawing: "Whole drawing",
    structure: context.kind === "structure" && context.structures > 1 ? `${context.structures} structures selected` : `${context.kind === "structure" ? context.atoms : 0} atoms selected`,
    atom: "Atom",
    bond: "Bond",
    caption: context.kind === "caption" && context.count > 1 ? `${context.count} captions` : "Caption",
  }[context.kind];
  const whole = context.kind === "drawing" || context.kind === "structure";

  return (
    <section className="actions" aria-label="Actions">
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
          {problems.slice(0, 3).map((p) => (
            <div key={p.atom} className="problem">
              <Warning size={16} weight="bold" aria-hidden />
              <p>{p.message}</p>
              <div className="problem-buttons">
                {p.fix && <button onClick={() => run(`fix:${p.atom}:${p.fix!.charge}`)}>Fix</button>}
                <button onClick={() => run(`show:${p.atom}`)}><Eye size={14} aria-hidden /> Show</button>
              </div>
            </div>
          ))}
          {problems.length > 3 && <p className="more-problems">{problems.length - 3} more</p>}
        </div>
      )}

      {context.kind === "empty" && (
        <>
          <div className="actions-list">
            {row(<Atom size={18} />, "Name to structure", "name_to_structure")}
            {row(<FileArrowDown size={18} />, "Import a structure", "import")}
            {row(<ClipboardText size={18} />, "Paste a SMILES or MOL", "paste_hint")}
          </div>
        </>
      )}

      {whole && (
        <div className="actions-list">
          {row(<MagicWand size={18} />, "Clean up", "clean_up", messy ? { note: "Bonds are uneven", accent: true } : {})}
          {context.kind === "structure" && row(<ListNumbers size={18} />, context.structures > 1 ? "Number these compounds" : "Number this compound", "number")}
          {context.kind === "structure" && row(<TextT size={18} />, "Add a caption", "caption.add")}
          {context.kind === "structure" && row(<BookmarkSimple size={18} />, "Add to rings", "template.add")}
          {context.kind === "structure" && context.structures > 1 && (
            <>
              {row(<AlignCenterHorizontal size={18} />, "Line up in a row", "align.row")}
              {row(<AlignCenterVertical size={18} />, "Line up in a column", "align.column")}
              {row(<SquareSplitHorizontal size={18} />, "Space evenly", "align.spread-row")}
            </>
          )}
          {row(<FlipHorizontal size={18} />, "Flip horizontal", "flip_h")}
          {row(<FlipVertical size={18} />, "Flip vertical", "flip_v")}
          {context.kind === "structure" && row(<ArrowCounterClockwise size={18} />, "Turn 15° left", "rotate.ccw15")}
          {context.kind === "structure" && row(<ArrowClockwise size={18} />, "Turn 15° right", "rotate.cw15")}
          {row(<CopySimple size={18} />, "Copy as SMILES", "copy_smiles")}
          {context.kind === "drawing" && row(<SelectionAll size={18} />, "Select all", "select_all")}
          {context.kind === "drawing" && row(<ArrowsOutSimple size={18} />, "Zoom to fit", "zoom_fit")}
          {context.kind === "drawing" && row(<Atom size={18} />, "Name to structure", "name_to_structure")}
          {context.kind === "drawing" && row(<FileArrowDown size={18} />, "Import a structure", "import")}
          {context.kind === "structure" && row(<Trash size={18} />, "Delete", "delete")}
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
          <div className="actions-list">
            {row(<TextAa size={18} />, "Type a label", "atom.label")}
            {row(<PlusCircle size={18} />, "Add a positive charge", "charge.plus")}
            {row(<MinusCircle size={18} />, "Add a negative charge", "charge.minus")}
            {row(<Trash size={18} />, "Delete", "delete")}
          </div>
        </>
      )}

      {context.kind === "caption" && (
        <>
          <div className="chips" role="group" aria-label="Style">
            {([["bold", "Bold", <TextB size={16} weight="bold" />, context.bold], ["italic", "Italic", <TextItalic size={16} />, context.italic], ["underline", "Underline", <TextUnderline size={16} />, context.underline]] as const).map(([id, name, icon, on]) => (
              <button key={id} className="chip" aria-pressed={on} aria-label={name} title={`${name} (${hint(`caption.${id}`)})`} onClick={() => run(`caption.${id}`)}>{icon}</button>
            ))}
            <SizeButton size={context.size} run={run} />
            {([["left", "Align left", <TextAlignLeft size={16} />], ["centre", "Centre", <TextAlignCenter size={16} />], ["right", "Align right", <TextAlignRight size={16} />]] as const).map(([id, name, icon]) => (
              <button key={id} className="chip" aria-pressed={context.align === id} aria-label={name} title={name} onClick={() => run(`caption.align.${id}`)}>{icon}</button>
            ))}
          </div>
          <div className="actions-list">
            {context.convertible && row(<Atom size={18} />, "Convert to structure", "name_to_structure")}
            {context.count === 1 && row(<PencilSimpleLine size={18} />, "Edit text", "caption.edit")}
            {context.attached
              ? row(<LinkBreak size={18} />, "Un-tie from structure", "caption.detach")
              : context.attachable && row(<LinkSimple size={18} />, "Tie to structure", "caption.attach")}
            {row(<Trash size={18} />, "Delete", "delete")}
          </div>
        </>
      )}

      {context.kind === "bond" && (
        <>
          <div className="chips styles" role="group" aria-label="Bond style">
            {STYLES.map((kind) => (
              <button
                key={kind}
                className="chip"
                aria-pressed={context.style === kind}
                aria-label={BONDS[kind].name}
                title={hint(`bond.${kind}`) ? `${BONDS[kind].name} (${hint(`bond.${kind}`)})` : BONDS[kind].name}
                onClick={() => run(`bond.${kind}`)}
              >
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
          <div className="actions-list">
            {context.double && row(<span className="glyph-text">L</span>, "Second line on the left", "bond.left")}
            {context.double && row(<span className="glyph-text">C</span>, "Centre the double bond", "bond.centre")}
            {context.double && row(<span className="glyph-text">R</span>, "Second line on the right", "bond.right")}
            {context.flippable && row(<FlipHorizontal size={18} />, "Point the other way", "bond.flip")}
            {row(<Trash size={18} />, "Delete", "delete")}
          </div>
        </>
      )}
    </section>
  );
}
