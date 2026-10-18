// Settings: one window, in the middle of the screen, laid out like the Mac's own settings. A sidebar lists the
// modules (Document, Keyboard shortcuts, Import and export) under a search field that is always there. With text
// in it, every matching setting from every module shows on the right, grouped by module and ready to use.
import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, Check, FileText, Files, Keyboard, MagnifyingGlass, Palette, Plus, SlidersHorizontal, X } from "@phosphor-icons/react";
import { ColourPicker } from "./ColourPicker";
import { Select } from "./Select";
import { FontPick } from "./Actions";
import { listOpen } from "./Menu";
import { NumberField, Segmented } from "./Fields";
import type { Swatch } from "./settings";
import type { ExportFormat } from "./export";
import { BACKGROUNDS, COLOURS, FONTS, PAGE_NAMES, PAGES, PRESETS, pageSize, presetOf, type DocStyle, type PageName } from "./docstyle";
import { ACTIONS, clashes, keyOf, keymap, label as keyLabel, type Keymap } from "./keys";

export type ModuleId = "document" | "keys" | "panel" | "files" | "colours";
export type FilePrefs = {
  format: ExportFormat; dpi: number; background: "white" | "transparent"; margin: number;
  clipboard: { pdf: boolean; cdxml: boolean; mol: boolean; smiles: boolean }; keepStyle: boolean;
};
// PNG resolutions; 350 dpi by default (Sam: super high resolution).
export const DPIS: [string, string][] = [["72", "72 dpi"], ["150", "150 dpi"], ["300", "300 dpi"], ["350", "350 dpi"], ["600", "600 dpi"], ["1200", "1200 dpi"]];
export const DEFAULT_FILES: FilePrefs = { format: "pdf", dpi: 350, background: "transparent", margin: 4, clipboard: { pdf: true, cdxml: true, mol: true, smiles: true }, keepStyle: true };

type Props = {
  module: ModuleId;
  onModule: (m: ModuleId) => void;
  style: DocStyle;
  isDefault: boolean; // the style is already the default for new documents
  preview: React.ReactNode; // a sample structure drawn in the style
  onStyle: (style: DocStyle) => void;
  onDefault: () => void;
  keys: Keymap; // the user's changes to the shortcuts
  onKeys: (keys: Keymap) => void;
  files: FilePrefs;
  onFiles: (files: FilePrefs) => void;
  captionOptionReturn: boolean; // captions: Option-Return for a new line, Return closes the box
  onCaptionOptionReturn: (on: boolean) => void;
  panelMenus: boolean; // the Actions panel's sets as menus, not sections
  onPanelMenus: (menus: boolean) => void;
  menuKeys: [string, string][]; // the menu commands that have a shortcut: name, shortcut as this platform shows it
  palette: Swatch[]; // the user's own colours
  onPalette: (palette: Swatch[]) => void;
  adding?: boolean; // opened to add a colour: a new one is made, ready to set
  onClose: () => void;
};

// The user's colours: each one's swatch, name and remove button; the one chosen opens Octet's picker under it.
// Add a colour makes a new one from the last colour picked and opens it.
function PaletteEditor({ palette, onPalette, adding }: { palette: Swatch[]; onPalette: (p: Swatch[]) => void; adding?: boolean }) {
  const [open, setOpen] = useState<number>();
  const add = () => {
    if (palette.length >= 20) return;
    onPalette([...palette, { name: `Colour ${palette.length + 1}`, hex: palette[palette.length - 1]?.hex ?? "#213C99" }]);
    setOpen(palette.length);
  };
  const started = useRef(false);
  useEffect(() => { if (adding && !started.current) { started.current = true; add(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (k: number, patch: Partial<Swatch>) => onPalette(palette.map((c, i) => (i === k ? { ...c, ...patch } : c)));
  return (
    <div className="palette-editor">
      <div className="palette-builtin" role="list" aria-label="Octet's colours">
        {COLOURS.map(([name, hex]) => <span key={hex} role="listitem" className="swatch" style={{ background: hex }} title={name} aria-label={name} />)}
      </div>
      {palette.map((c, k) => (
        <div key={k} className={open === k ? "palette-row open" : "palette-row"}>
          <div className="palette-line">
            <button className="swatch" style={{ background: c.hex }} aria-label={`Change ${c.name}`} aria-expanded={open === k} onClick={() => setOpen(open === k ? undefined : k)} />
            <input className="palette-name" aria-label="Name" value={c.name} maxLength={40} onChange={(e) => change(k, { name: e.target.value })} onBlur={(e) => { if (!e.target.value.trim()) change(k, { name: `Colour ${k + 1}` }); }} />
            <button className="text-button" aria-label={`Remove ${c.name}`} title="Remove" onClick={() => { onPalette(palette.filter((_, i) => i !== k)); setOpen(undefined); }}><X size={12} /></button>
          </div>
          {open === k && <ColourPicker value={c.hex} onChange={(hex) => change(k, { hex })} />}
        </div>
      ))}
      {palette.length < 20 && <button className="palette-add" onClick={add}><Plus size={12} aria-hidden /> Add a colour</button>}
    </div>
  );
}

// ——— Fields ———

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}><span /></button>;
}

// A page drawn to scale inside a small box.
function PageThumb({ w, h, size = 26 }: { w: number; h: number; size?: number }) {
  const k = size / Math.max(w, h);
  return <span className="page-thumb" style={{ width: w * k, height: h * k }} aria-hidden />;
}
const fmt = (mm: number, unit: string) => (unit === "in" ? +(mm / 25.4).toFixed(2) : unit === "cm" ? +(mm / 10).toFixed(1) : Math.round(mm));

// Page size: a button that opens a panel next to it with every size drawn to scale, and your own size.
// The panel's corner can be dragged to make it bigger.
function PageSize({ style, change }: { style: DocStyle; change: (p: Partial<DocStyle>) => void }) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<"mm" | "cm" | "in">("mm");
  const [width, setWidth] = useState(440);
  const [place, setPlace] = useState<{ left: number; top: number; above: boolean }>();
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Opens below the button, or above it when there is no room below.
    const r = button.current!.getBoundingClientRect(), height = 400;
    const above = r.bottom + height > innerHeight - 8 && r.top - height > 8;
    setPlace({ left: Math.max(8, Math.min(r.left - 140, innerWidth - width - 8)), top: above ? r.top - 6 : r.bottom + 6, above });
    const away = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); button.current?.focus(); } };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", esc, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", esc, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [w, h] = pageSize(style);
  const names = Object.keys(PAGES) as Exclude<PageName, "Custom">[];
  const custom = style.page === "Custom";
  const setCustom = (i: 0 | 1, v: number) => {
    const mm = unit === "in" ? v * 25.4 : unit === "cm" ? v * 10 : v, size = [...pageSize({ ...style, landscape: false })] as [number, number];
    size[style.landscape ? 1 - i : i] = Math.min(2000, Math.max(10, mm));
    change({ page: "Custom", custom: size });
  };
  return (
    <>
      <button ref={button} className="page-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <PageThumb w={w} h={h} size={14} />
        <span>{PAGE_NAMES[style.page]}</span>
        <CaretDown size={12} aria-hidden />
      </button>
      {open && place && (
        <div ref={menu} className={place.above ? "page-menu above" : "page-menu"} role="dialog" aria-label="Page size" style={{ left: place.left, top: place.top, width }}>
          <div className="page-options" role="radiogroup" aria-label="Page sizes">
            {names.map((n) => {
              const [pw, ph] = PAGES[n];
              return (
                <button key={n} role="radio" aria-checked={style.page === n} className="page-option" onClick={() => { change({ page: n }); setOpen(false); }}>
                  <span className="page-option-thumb"><PageThumb w={style.landscape ? ph : pw} h={style.landscape ? pw : ph} size={34} /></span>
                  <span className="page-option-name">{PAGE_NAMES[n]}</span>
                  <span className="page-option-size">{fmt(pw, unit)} × {fmt(ph, unit)} {unit}</span>
                </button>
              );
            })}
          </div>
          <div className={custom ? "page-custom chosen" : "page-custom"}>
            <span className="setting-label">Custom</span>
            <NumberField label="Width" unit={unit} value={fmt(w, unit)} onChange={(v) => setCustom(0, v)} />
            <span className="times">×</span>
            <NumberField label="Height" unit={unit} value={fmt(h, unit)} onChange={(v) => setCustom(1, v)} />
            <Segmented className="units" label="Units" value={unit} options={[["mm", "mm"], ["cm", "cm"], ["in", "in"]]} onChange={setUnit} />
          </div>
          <span
            className="grip"
            role="separator"
            aria-label="Drag to resize"
            title="Drag to resize"
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              const x0 = e.clientX, w0 = width;
              const move = (ev: PointerEvent) => setWidth(Math.min(innerWidth - 16, Math.max(360, w0 + ev.clientX - x0)));
              const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
              addEventListener("pointermove", move);
              addEventListener("pointerup", up);
            }}
          />
        </div>
      )}
    </>
  );
}

// ——— Settings as data, so search can find and show any of them ———

type Def = { module: ModuleId; section: string; label: string; keywords: string; control: React.ReactNode; wide?: boolean };
const MODULES: { id: ModuleId; name: string; icon: React.ReactNode; words: string }[] = [
  { id: "document", name: "Document", icon: <FileText size={16} />, words: "document style page text" },
  { id: "keys", name: "Keyboard shortcuts", icon: <Keyboard size={16} />, words: "keyboard shortcut hotkey keys" },
  { id: "panel", name: "Actions panel", icon: <SlidersHorizontal size={16} />, words: "actions panel side menus sections" },
  { id: "files", name: "Import and export", icon: <Files size={16} />, words: "import export file clipboard" },
  { id: "colours", name: "Colours", icon: <Palette size={16} />, words: "colour colours palette custom swatch named" },
];
// Words people use for the same thing.
const SYNONYMS: Record<string, string> = {
  color: "colour", thickness: "width", thick: "width", weight: "width", stroke: "width", hotkey: "shortcut", hotkeys: "shortcut",
  key: "shortcut", keys: "shortcut", keybinding: "shortcut", paper: "page", sheet: "page", typeface: "font", fonts: "font",
  grid: "gridlines", journal: "preset", template: "preset", image: "png", picture: "png", bitmap: "png", vector: "svg",
  word: "clipboard", powerpoint: "clipboard", keynote: "clipboard", office: "clipboard", paste: "clipboard", copy: "clipboard",
  resolution: "scale", dpi: "scale", transparency: "background", landscape: "orientation", portrait: "orientation",
  chemdraw: "cdxml", length: "length", spacing: "spacing", double: "spacing",
};
function matches(def: Def, query: string): boolean {
  const hay = `${def.label} ${def.section} ${MODULES.find((m) => m.id === def.module)!.words} ${def.keywords}`.toLowerCase();
  const words = hay.split(/[^a-z0-9.+]+/);
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((t) => {
    const w = SYNONYMS[t] ?? t;
    return words.some((h) => h.startsWith(w) || h.startsWith(t));
  });
}

function Row({ def }: { def: Def }) {
  return (
    <div className={def.wide ? "setting wide" : "setting"}>
      <span className="setting-label">{def.label}</span>
      <span className="setting-control">{def.control}</span>
    </div>
  );
}

// A section of rows, two to a line on a wide window.
function Section({ title, defs, aside }: { title: string; defs: Def[]; aside?: React.ReactNode }) {
  if (!defs.length) return null;
  return (
    <section className="settings-section">
      <div className="section-head"><h3>{title}</h3>{aside}</div>
      <div className="settings-grid">{defs.filter((d) => !d.wide).map((d) => <Row key={d.label} def={d} />)}</div>
      {defs.filter((d) => d.wide).map((d) => <Row key={d.label} def={d} />)}
    </section>
  );
}

// ——— Keyboard shortcuts ———

// A shortcut's keys as chips: click one to record a new key, × to remove it, + to add one.
function KeyChips({ id, map, recording, onRecord, onRemove }: { id: string; map: Keymap; recording?: number; onRecord: (index: number) => void; onRemove: (index: number) => void }) {
  const keys = map[id] ?? [];
  return (
    <span className="key-chips">
      {keys.map((k, i) => (
        <span key={`${k}${i}`} className={recording === i ? "key-chip recording" : "key-chip"}>
          <button onClick={() => onRecord(i)} aria-label={`Change ${keyLabel(k)}`}>{recording === i ? "Press a key" : keyLabel(k)}</button>
          {recording !== i && <button className="key-remove" onClick={() => onRemove(i)} aria-label={`Remove ${keyLabel(k)}`}><X size={12} /></button>}
        </span>
      ))}
      {recording === keys.length
        ? <span className="key-chip recording"><button>Press a key</button></span>
        : <button className="key-add" onClick={() => onRecord(keys.length)} aria-label="Add a key" title="Add a key"><Plus size={12} /></button>}
    </span>
  );
}

// ——— The window ———

export function SettingsWindow(p: Props) {
  const [query, setQuery] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState<{ id: string; index: number }>();
  const [note, setNote] = useState<{ id: string; text: string; undo: Keymap }>();
  const map = keymap(p.keys);
  const style = p.style;
  const change = (patch: Partial<DocStyle>) => { const next = { ...style, ...patch }; p.onStyle({ ...next, preset: presetOf(next) }); };

  // Escape: stops recording a key, then clears the search, then closes the window. ⌘F goes to the search.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (recording) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") return setRecording(undefined);
        const k = keyOf(e);
        if (!k) return;
        const list = [...(map[recording.id] ?? [])];
        list[recording.index] = k;
        const before = p.keys, next: Keymap = { ...p.keys, [recording.id]: [...new Set(list)] };
        // A key another action used in the same place moves to this one; the note can undo it.
        const taken = clashes(map, recording.id, k);
        for (const other of taken) next[other] = (map[other] ?? []).filter((x) => x !== k);
        p.onKeys(next);
        if (taken.length) setNote({ id: recording.id, text: `Taken from ${taken.map((t) => ACTIONS.find((a) => a.id === t)!.name.toLowerCase()).join(", ")}.`, undo: before });
        setRecording(undefined);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") { e.preventDefault(); search.current?.focus(); return; }
      if (e.key !== "Escape" || listOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery("");
      else p.onClose();
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [recording, query, map, p]);
  useEffect(() => { search.current?.focus(); }, []);

  const presets: [string, string][] = [...Object.keys(PRESETS).map((x): [string, string] => [x, x]), ...(style.preset === "Custom" ? [["Custom", "Custom"] as [string, string]] : [])];
  const files = p.files, setFiles = (patch: Partial<FilePrefs>) => p.onFiles({ ...files, ...patch });

  const defs: Def[] = useMemo(() => {
    const d = (module: ModuleId, section: string, label: string, keywords: string, control: React.ReactNode, wide?: boolean): Def => ({ module, section, label, keywords, control, wide });
    const num = (k: keyof DocStyle, label: string, unit: string, words: string, section = "Style") =>
      d("document", section, label, words, <NumberField label={label} unit={unit} value={style[k] as number} onChange={(n) => change({ [k]: n })} />);
    return [
      num("bond", "Bond length", "pt", "bond length fixed size"), num("line", "Line width", "pt", "line width bonds arrows"),
      num("bold", "Bold width", "pt", "bold width wedge"), num("spacing", "Bond spacing", "%", "double bond spacing gap"),
      num("hash", "Hash spacing", "pt", "hash hashed wedge spacing"), num("margin", "Margin", "pt", "label margin clearance"),
      d("document", "Style", "Atom labels", "atom label font typeface", <FontPick label="Atom label font" font={style.labelFont} fonts={FONTS} onPick={(v) => change({ labelFont: v })} className="select-field" />),
      num("labelSize", "Label size", "pt", "atom label font size"),
      d("document", "Style", "Label terminal carbons", "terminal carbon labels ch3 methyl show", <Switch on={style.terminalLabels} label="Label terminal carbons" onChange={(on) => change({ terminalLabels: on })} />),
      d("document", "Style", "Label every carbon", "non-terminal carbon labels all carbons show", <Switch on={style.carbonLabels} label="Label every carbon" onChange={(on) => change({ carbonLabels: on })} />),
      d("document", "Style", "Hide implicit hydrogens", "implicit hydrogens hide labels h", <Switch on={style.hideH} label="Hide implicit hydrogens" onChange={(on) => change({ hideH: on })} />),
      d("document", "Text", "Captions", "caption text font typeface", <FontPick label="Caption font" font={style.captionFont} fonts={FONTS} onPick={(v) => change({ captionFont: v })} className="select-field" />),
      num("captionSize", "Caption size", "pt", "caption text font size", "Text"),
      d("document", "Text", "Colour", "text colour caption", (
        <span className="swatches" role="radiogroup" aria-label="Text colour">
          {[...COLOURS, ...p.palette.map((c): [string, string] => [c.name, c.hex])].map(([name, hex]) => (
            <button key={`${name}${hex}`} role="radio" aria-checked={style.colour.toLowerCase() === hex.toLowerCase()} aria-label={name} title={name} className="swatch" style={{ background: hex }} onClick={() => change({ colour: hex })} />
          ))}
          <button className="swatch custom" title="Add a colour" aria-label="Add a colour" onClick={() => p.onModule("colours")}><Plus size={12} aria-hidden /></button>
        </span>
      ), true),
      d("document", "Page", "Size", "page paper size a4 a3 letter custom half column", <PageSize style={style} change={change} />),
      d("document", "Page", "Orientation", "page orientation portrait landscape", (
        <Segmented label="Orientation" value={style.landscape ? "landscape" : "portrait"} onChange={(v) => change({ landscape: v === "landscape" })}
          options={[["portrait", <span className="page-glyph" />, "Portrait"], ["landscape", <span className="page-glyph wide" />, "Landscape"]]} />
      )),
      d("document", "Page", "Gridlines", "grid gridlines guides page", <Select label="Gridlines" value={String(style.grid)} options={[["0", "None"], ["5", "5 mm"], ["10", "10 mm"], ["20", "20 mm"]]} onChange={(v) => change({ grid: Number(v) })} />),
      d("document", "Page", "Page edges", "page edges outline guides", <Switch on={style.edges} label="Page edges" onChange={(on) => change({ edges: on })} />),
      d("document", "Page", "Background", "background page colour dark mode night white system engineering paper blueprint blue grid", (
        // Each background as a small page of itself.
        <span className="paper-choices" role="radiogroup" aria-label="Background">
          {BACKGROUNDS.map(([b, name]) => (
            <button key={b} role="radio" aria-checked={style.background === b} aria-label={name} title={name} className={`paper-choice ${b}`} onClick={() => change({ background: b })}>
              <span />
            </button>
          ))}
        </span>
      )),
      d("panel", "Small actions", "Show as", "actions panel small actions menus sections pop out buttons", (
        <Segmented label="Show small actions as" value={p.panelMenus ? "menus" : "sections"} onChange={(v) => p.onPanelMenus(v === "menus")} options={[["sections", "Sections"], ["menus", "Menus"]]} />
      )),
      // ChemDraw's text preference: in a caption Return makes a new line, unless Option-Return is asked for.
      d("keys", "Typing", "New line in captions", "caption text new line return enter option", (
        <Select label="New line in captions" value={p.captionOptionReturn ? "option" : "return"} options={[["return", "Return"], ["option", "⌥ Return"]]} onChange={(v) => p.onCaptionOptionReturn(v === "option")} />
      )),
      // The menu commands' shortcuts, as the menus show them (fixed, as ChemDraw's), so a search finds them here too.
      ...p.menuKeys.map(([name, keys]) => d("keys", "Menu commands", name, `${name} menu command shortcut ${keys}`, <kbd className="menu-key">{keys}</kbd>)),
      ...ACTIONS.map((a) => d("keys", a.group, a.name, `${a.id} ${a.group} shortcut ${(map[a.id] ?? []).join(" ")}`, (
        <>
          <KeyChips id={a.id} map={map} recording={recording?.id === a.id ? recording.index : undefined}
            onRecord={(index) => { setNote(undefined); setRecording({ id: a.id, index }); }}
            onRemove={(index) => p.onKeys({ ...p.keys, [a.id]: (map[a.id] ?? []).filter((_, i) => i !== index) })} />
          {note?.id === a.id && <span className="key-note">{note.text} <button className="text-button" onClick={() => { p.onKeys(note.undo); setNote(undefined); }}>Undo</button></span>}
        </>
      ), true)),
      d("files", "Export", "Format", "export format pdf svg png cdxml file save", <Select label="Export format" value={files.format} options={[["oct", "Octet drawing"], ["pdf", "PDF"], ["png", "PNG"], ["svg", "SVG"], ["cdxml", "CDXML (ChemDraw)"], ["mol", "MOL"], ["sdf", "SDF"], ["smi", "SMILES"]]} onChange={(v) => setFiles({ format: v as FilePrefs["format"] })} />),
      d("files", "Export", "PNG resolution", "png image resolution dpi scale", <Select label="PNG resolution" value={String(files.dpi)} options={DPIS} onChange={(v) => setFiles({ dpi: Number(v) })} />),
      d("files", "Export", "Background", "background transparent white png svg", <Select label="Background" value={files.background} options={[["transparent", "Transparent"], ["white", "White"]]} onChange={(v) => setFiles({ background: v as FilePrefs["background"] })} />),
      d("files", "Export", "Margin", "export margin padding border", <NumberField label="Margin" unit="pt" min={0} max={72} step={1} value={files.margin} onChange={(n) => setFiles({ margin: n })} />),
      ...([["pdf", "PDF, with the structure inside", "pdf word powerpoint keynote office"], ["cdxml", "CDXML", "cdxml chemdraw"], ["mol", "MOL", "mol molfile"], ["smiles", "SMILES", "smiles text"]] as const).map(([k, name, words]) =>
        d("files", "Copy", name, `clipboard copy paste ${words}`, <Switch on={files.clipboard[k]} label={name} onChange={(on) => setFiles({ clipboard: { ...files.clipboard, [k]: on } })} />)),
      d("colours", "Colours", "Your colours", "colour colours palette custom swatch named add", <PaletteEditor palette={p.palette} onPalette={p.onPalette} adding={p.adding} />, true),
      d("files", "Import", "Keep ChemDraw styles", "import open cdxml chemdraw style keep", <Switch on={files.keepStyle} label="Keep ChemDraw styles" onChange={(on) => setFiles({ keepStyle: on })} />),
    ];
  }, [style, map, recording, note, files, p.palette, p.adding, p.panelMenus, p.captionOptionReturn, p.menuKeys.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const found = query.trim() ? defs.filter((def) => matches(def, query)) : [];
  const counts = new Map(MODULES.map((m) => [m.id, found.filter((f) => f.module === m.id).length]));
  const sections = (module: ModuleId, list: Def[]) => [...new Set(list.filter((x) => x.module === module).map((x) => x.section))];

  const content = (module: ModuleId, list: Def[]) => {
    if (module === "document") return (
      <>
        {!query && <div className="style-preview" aria-hidden>{p.preview}</div>}
        {sections(module, list).map((s) => (
          <Section key={s} title={s} defs={list.filter((x) => x.module === module && x.section === s)}
            aside={s === "Style" ? <Select label="Style preset" value={style.preset} options={presets} onChange={(v) => v in PRESETS && p.onStyle({ ...style, ...PRESETS[v], preset: v })} /> : undefined} />
        ))}
        {!query && (
          <div className="settings-foot">
            {p.isDefault
              ? <span className="quiet-note"><Check size={16} aria-hidden /> Default for new documents</span>
              : <button className="text-button" onClick={p.onDefault}>Use for new documents</button>}
          </div>
        )}
      </>
    );
    if (module === "keys") return (
      <>
        {sections(module, list).map((s, i) => (
          <Section key={s} title={s} defs={list.filter((x) => x.module === module && x.section === s)}
            aside={i === 0 && !query && <button className="text-button" onClick={() => p.onKeys({})} disabled={!Object.keys(p.keys).length}>Reset to ChemDraw keys</button>} />
        ))}
      </>
    );
    return <>{sections(module, list).map((s) => <Section key={s} title={s} defs={list.filter((x) => x.module === module && x.section === s)} />)}</>;
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className="settings-window" role="dialog" aria-modal="true" aria-label="Settings">
        <nav className="settings-sidebar" aria-label="Settings modules">
          <label className="settings-search">
            <MagnifyingGlass size={16} aria-hidden />
            <input ref={search} type="search" placeholder="Search" aria-label="Search settings" spellCheck={false} value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button className="search-clear" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="Clear search"><X size={12} /></button>}
          </label>
          {MODULES.map((m) => (
            <button key={m.id} className="module" aria-current={!query && p.module === m.id ? "page" : undefined}
              data-dim={query && !counts.get(m.id) ? "" : undefined}
              onClick={() => { setQuery(""); p.onModule(m.id); }}>
              {m.icon}
              <span>{m.name}</span>
              {query && counts.get(m.id) ? <span className="module-count">{counts.get(m.id)}</span> : null}
            </button>
          ))}
        </nav>
        <div className="settings-main">
          <header>
            <h2>{query ? "Search" : MODULES.find((m) => m.id === p.module)!.name}</h2>
            <button className="actions-close" onClick={p.onClose} aria-label="Close settings" title="Close settings"><X size={12} /></button>
          </header>
          <div className="settings-body" key={query ? "search" : p.module}>
            {query
              ? found.length
                ? MODULES.filter((m) => counts.get(m.id)).map((m) => (
                  <div key={m.id} className="search-group">
                    <h4>{m.icon}{m.name}</h4>
                    {content(m.id, found)}
                  </div>
                ))
                : <p className="settings-empty">No settings match “{query}”.</p>
              : content(p.module, defs)}
          </div>
        </div>
      </div>
    </div>
  );
}

