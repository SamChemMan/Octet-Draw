import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Warning } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { analyse, cleanUp, importStructure, measure, parseStructure, ready, STYLE, textWidth, toSmiles } from "./chem";
import { messy, problems } from "./check";
import { parse, serialize } from "./file";
import {
  EMPTY, addCaption, addCharge, addRing, deleteCaptions, inPolygon, nextNumber, updateCaption, atomAt, atomsIn, bondAt, bondTo, bounds, chainTo, complete, cycleBond, deleteAtom, deleteAtoms, deleteBond, erase, flipBond,
  addChair, addGroup, addTemplate, alignFragments, atomsInPolygon, flipAtoms, fragments, joinOverlaps, setLabel, merge, moveAtoms, neighbours, onSelection, pos, rotateAtoms, setBondSpec, setElement, setPosition, sprout, subset,
  type BondSpec, type Group, type P,
} from "./edit";
import { snapMove, type Guide } from "./snap";
import { loadSettings, saveSettings } from "./settings";
import { actionFor, keyOf, keymap, label as keyLabel } from "./keys";
import { Actions, type Context } from "./Actions";
import { BONDS, Palette, RINGS, SELECTS, type BondKind, type RingKind, type SelectKind, type Tool } from "./tools";
import { CAPTION_PT, isNumber, placeCaptions, render, type Box, type Caption, type Mol, type Placed } from "./render";
import { selectCursor } from "./cursor";
import { loadNames, nameToSmiles, suggestName } from "./names";
import { loadTemplates, newTemplate, templateKind } from "./templates";
import "./editor.css";


const MOD = navigator.platform.startsWith("Mac") ? "⌘" : "Ctrl+";
// In the desktop app the native menu owns undo, redo and the file commands; in a browser (dev only) the page does.
const TAURI = "__TAURI_INTERNALS__" in window;

// Undo history: every edit pushes a new Mol; undo and redo move along the list.
type History = { stack: Mol[]; at: number };
type Action = { type: "set"; mol: Mol } | { type: "undo" } | { type: "redo" };
function history(h: History, a: Action): History {
  if (a.type === "undo") return { ...h, at: Math.max(0, h.at - 1) };
  if (a.type === "redo") return { ...h, at: Math.min(h.stack.length - 1, h.at + 1) };
  if (a.mol === h.stack[h.at]) return h;
  return { stack: [...h.stack.slice(0, h.at + 1), a.mol], at: h.at + 1 };
}

const L = STYLE.bond; // px per bond length at 100%
const SNAP = (15 * Math.PI) / 180; // dragged bonds snap to 15° steps
// Holding still this long with a drawing tool in hand switches to Select until the pointer is released.
const HOLD_MS = 400;
const toPath = (polys: P[][]) => polys.map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z").join("");

type Hover = { atom?: number; bond?: number; caption?: number };
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
  | { kind: "move"; from: P; working: Mol; moved: boolean; start: [number, number]; target: Hover; guides: Guide[]; point?: P; captions: Map<number, P> };

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

export default function Editor() {
  const [loaded, setLoaded] = useState(false);
  const [h, dispatch] = useReducer(history, { stack: [EMPTY], at: 0 });
  const doc = h.stack[h.at];
  const [tool, setTool] = useState<Tool>("bond");
  // The drawing tool to go back to when a hold-to-select gesture ends.
  const [spring, setSpring] = useState<Tool>();
  const [view, setView] = useState({ x: innerWidth / 2, y: innerHeight / 2, zoom: 2 });
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
  const ringKind = settings.variants.ring in RINGS || templates.some((t) => templateKind(t.id) === settings.variants.ring) ? settings.variants.ring : "benzene";
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
  const bondSpec: BondSpec = BONDS[bondKind].spec;
  const [overSelection, setOverSelection] = useState(false);
  // Where the eraser outline is drawn (drawing coordinates), while the Eraser is in hand.
  const [brush, setBrush] = useState<P>();
  // The atom whose label is being typed, and the text so far.
  const [editing, setEditing] = useState<{ atom: number; value: string }>();
  const editLabel = (atom: number) => {
    const a = doc.atoms[atom];
    setEditing({ atom, value: a.text ?? (a.label === "C" ? "" : a.label) });
  };
  // The caption being typed: an existing one (id), or a new one at a point or under a structure, with its style.
  type Writing = { id?: number; value: string; at?: P; under?: number[]; style: Partial<Caption> };
  const [writing, setWriting] = useState<Writing>();
  // True while the caption box is open. Enter, Escape and blur all close it; only the first one counts.
  const writingOpen = useRef(false);
  const openWriting = (w: Writing) => { writingOpen.current = true; setWriting(w); };
  useEffect(() => { selectCursor.then(setCursor); }, []);
  const hold = useRef<number>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const pointer = useRef<P>(undefined);
  // Every edit clears the selection, except a move, which keeps the same atoms selected.
  const set = (mol: Mol, keepSelection = false) => {
    dispatch({ type: "set", mol });
    if (!keepSelection) { setSelection(new Set()); setPicked(new Set()); }
  };
  const undo = (redo = false) => { dispatch({ type: redo ? "redo" : "undo" }); setSelection(new Set()); setPicked(new Set()); };
  // The file on disk and the drawing as last saved. Undoing back to the saved drawing makes it clean again.
  const [file, setFile] = useState<{ path?: string; saved: Mol }>({ saved: EMPTY });
  const dirty = doc !== file.saved;

  useEffect(() => { ready.then(() => setLoaded(true)); }, []);
  // Name to structure loads in the background once the window has settled.
  const [namesLoaded, setNamesLoaded] = useState(false);
  useEffect(() => { const t = setTimeout(() => loadNames().then(() => setNamesLoaded(true)), 1500); return () => clearTimeout(t); }, []);
  // The text in the name-to-structure field, while it is open.
  const [naming, setNaming] = useState<string>();
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
  function landing(frag: Mol, at?: P): P {
    const f = bounds(frag)!, d = bounds(doc);
    const centre: P = at ?? (d ? [d[2] + 1.5 + (f[2] - f[0]) / 2, (d[1] + d[3]) / 2] : toDoc(innerWidth / 2, innerHeight / 2));
    return [centre[0] - (f[0] + f[2]) / 2, centre[1] - (f[1] + f[3]) / 2];
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
    if (c && frag && p) return place(frag, deleteCaptions(doc, new Set([c.id])), [(p.box[0] + p.box[2]) / 2 / L, -(p.box[1] + p.box[3]) / 2 / L]);
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
      setSelection(new Set(doc.atoms.map((_, i) => i)));
      setPicked(new Set((doc.captions ?? []).map((c) => c.id)));
    },
    snap: () => setSettings((s) => ({ ...s, snap: !s.snap })),
    // Structure commands act on the selection, or on the whole drawing when nothing is selected.
    clean_up: () => { if (loaded && doc.atoms.length) set(cleanUp(doc, selection.size ? selection : undefined), true); },
    flip_h: () => set(flipAtoms(doc, selection.size ? selection : new Set(doc.atoms.map((_, i) => i)), "horizontal"), true),
    flip_v: () => set(flipAtoms(doc, selection.size ? selection : new Set(doc.atoms.map((_, i) => i)), "vertical"), true),
    // Zoom about the middle of the window. Actual size is 100%: bonds at their true 14.4 pt.
    zoom_in: () => zoomTo(view.zoom * 1.25),
    zoom_out: () => zoomTo(view.zoom / 1.25),
    zoom_actual: () => zoomTo(1),
    actions: () => setSettings((s) => ({ ...s, actions: !s.actions })),
    name_to_structure: () => nameToStructure(),
    // The Text menu styles the caption being typed, or the picked captions.
    text_bold: () => restyle((c) => ({ bold: !c.bold })),
    text_italic: () => restyle((c) => ({ italic: !c.italic })),
    text_underline: () => restyle((c) => ({ underline: !c.underline })),
    align_left: () => restyle(() => ({ align: "left" })),
    align_centre: () => restyle(() => ({ align: "centre" })),
    align_right: () => restyle(() => ({ align: "right" })),
    ...Object.fromEntries([8, 9, 10, 12, 14, 18, 24].map((pt) => [`size_${pt}`, () => restyle(() => ({ size: pt === CAPTION_PT ? undefined : pt }))])),
    zoom_fit: () => {
      const b = bounds(doc);
      if (!b) return zoomTo(2);
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
    if (drag?.kind === "move") return drag.working;
    return doc;
  }, [doc, drag]);
  const drawing = useMemo(() => render(shown, STYLE, measure, L), [shown]);
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
  const ghost = useMemo(() => named && render(moveAtoms(named, new Set(named.atoms.map((_, i) => i)), landing(named)), STYLE, measure, L), [named, doc]);
  // Captions as laid out, with the caption being typed in place of its saved text (or added, if it is new).
  const placed = useMemo(() => {
    let m = shown;
    if (writing?.id !== undefined) m = updateCaption(m, writing.id, { text: writing.value || " ", ...writing.style });
    else if (writing) m = { ...m, captions: [...(m.captions ?? []), { id: DRAFT, text: writing.value || " ", x: writing.at?.[0] ?? 0, y: writing.at?.[1] ?? 0, under: writing.under, ...writing.style }] };
    return placeCaptions(m, drawing, (t, c) => textWidth(t, ((c.size ?? CAPTION_PT) * 4) / 3, c.bold, c.italic));
  }, [shown, drawing, writing]);
  // The caption under a point (drawing coordinates), with a few px of slack.
  const captionAt = (p: P) => {
    const [x, y] = [p[0] * L, -p[1] * L], pad = 3 / view.zoom;
    return [...placed].reverse().find((c) => c.id !== DRAFT && x >= c.box[0] - pad && x <= c.box[2] + pad && y >= c.box[1] - pad && y <= c.box[3] + pad)?.id;
  };
  // Atoms come first, then captions, then bonds.
  const hit = (p: P): Hover => {
    const t = hitIn(doc, p);
    if (t.atom !== undefined) return t;
    const caption = captionAt(p);
    return caption !== undefined ? { caption } : t;
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

  // Typing captions. Enter or a click elsewhere keeps the text; Escape throws it away. Empty text deletes the caption.
  function startWriting(target: { id: number } | { at: P }) {
    setSelection(new Set());
    setPicked(new Set());
    if ("id" in target) {
      const c = doc.captions?.find((x) => x.id === target.id);
      if (c) openWriting({ id: c.id, value: c.text, style: {} });
      return;
    }
    // Clicked just under a structure: the caption is centred under it, by the ACS rule.
    const under = structureAbove(target.at);
    openWriting(under ? { value: "", under, style: {} } : { value: "", at: target.at, style: { align: "left" } });
  }
  function commitWriting(keep = true) {
    const w = writing;
    if (!writingOpen.current) return;
    writingOpen.current = false;
    setWriting(undefined);
    if (!w || !keep) return;
    const text = w.value.replace(/\s+$/, "");
    if (w.id !== undefined) {
      const old = doc.captions?.find((c) => c.id === w.id);
      if (!text) return set(deleteCaptions(doc, new Set([w.id])));
      if (old && (text !== old.text || Object.keys(w.style).length)) set(updateCaption(doc, w.id, { text, ...w.style }));
      return setPicked(new Set([w.id]));
    }
    if (!text) return;
    const [mol, id] = addCaption(doc, { text, x: w.at?.[0] ?? 0, y: w.at?.[1] ?? 0, ...(w.under ? { under: w.under } : {}), ...w.style });
    set(mol);
    setPicked(new Set([id]));
  }
  // Applies a style change to the caption being typed, or to every picked caption.
  function restyle(change: (c: Partial<Caption>) => Partial<Caption>) {
    if (writing) {
      const base = writing.id !== undefined ? { ...doc.captions?.find((c) => c.id === writing.id), ...writing.style } : writing.style;
      return setWriting({ ...writing, style: { ...writing.style, ...change(base) } });
    }
    if (!picked.size) return;
    const first = doc.captions?.find((c) => picked.has(c.id));
    if (!first) return;
    const delta = change(first); // one change for all, so Bold on a mixed set makes them all bold
    set({ ...doc, captions: doc.captions?.map((c) => (picked.has(c.id) ? { ...c, ...delta } : c)) }, true);
  }
  // Moves the selected atoms and the moving captions. A caption under a structure that is not moving comes
  // away from it and stays where it is dragged.
  function moveAll(base: Mol, d: P, captions: Map<number, P>): Mol {
    const m = selection.size ? moveAtoms(base, selection, d) : base;
    if (!captions.size) return m;
    return {
      ...m,
      captions: m.captions?.map((c) => {
        const from = captions.get(c.id);
        if (!from) return c;
        const { under: _, ...free } = c;
        return { ...free, x: from[0] + d[0], y: from[1] + d[1] };
      }),
    };
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

  // Select tool press: on something selected, move the selection; on something else, select it and move it;
  // on empty canvas, start a selection box. Shift adds to the selection.
  // picks: the captions that will be picked once this press's state updates land.
  const startMove = (p: P, screen: [number, number], t: Hover, picks = picked, atoms = selection) => {
    const captions = new Map<number, P>();
    for (const c of placed) {
      const caption = doc.captions?.find((x) => x.id === c.id);
      if (caption && picks.has(c.id) && !caption.under?.every((i) => atoms.has(i))) captions.set(c.id, anchorOf(c));
    }
    setDrag({ kind: "move", from: p, working: doc, moved: false, start: screen, target: t, guides: [], captions });
  };
  // A press on a caption picks it (Shift adds it) and grabs it.
  function pressCaption(p: P, t: Hover, shift: boolean, screen: [number, number]) {
    const id = t.caption!;
    if (picked.has(id) && !shift) return startMove(p, screen, t);
    const picks = new Set(shift ? [...picked, id] : [id]), atoms = shift ? selection : new Set<number>();
    setPicked(picks);
    setSelection(atoms);
    startMove(p, screen, t, picks, atoms);
  }

  function pressSelect(p: P, t: Hover, shift: boolean, screen: [number, number]) {
    const ids = atomsOf(doc, t);
    if (t.caption !== undefined) return pressCaption(p, t, shift, screen);
    if (!shift && (selection.size || picked.size) && onSelection(doc, selection, p)) return startMove(p, screen, t);
    if (ids.length) {
      const atoms = new Set(shift ? [...selection, ...ids] : ids), picks = shift ? picked : new Set<number>();
      setSelection(atoms);
      setPicked(picks);
      return startMove(p, screen, t, picks, atoms);
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
  const captionsWhere = (inside: (q: P) => boolean) =>
    placed.filter((c) => c.id !== DRAFT && inside([(c.box[0] + c.box[2]) / 2 / L, -(c.box[1] + c.box[3]) / 2 / L])).map((c) => c.id);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    const p = toDoc(e.clientX, e.clientY), t = hit(p), screen: [number, number] = [e.clientX, e.clientY];
    pointer.current = p;
    if (tool === "select") return pressSelect(p, t, e.shiftKey, screen);
    // With something selected, a press on it (or inside it) grabs it, whatever tool is in hand. So does a press
    // on a caption, except with the Text tool, which edits it.
    if (tool !== "erase" && selection.size && onSelection(doc, selection, p)) return startMove(p, screen, t);
    if (tool !== "erase" && tool !== "text" && t.caption !== undefined) return pressCaption(p, t, e.shiftKey, screen);
    if (tool === "erase") return setDrag({ kind: "erase", trail: [p], bonds: new Set(), atoms: new Set(), captions: new Set(), start: screen, target: t, moved: false });
    if (tool === "bond") setDrag({ kind: "bond", from: t.atom ?? p, at: p, start: screen, target: t });
    else if (tool === "chain") setDrag({ kind: "chain", from: t.atom ?? p, start: screen, target: t });
    else setDrag({ kind: "click", at: p, start: screen, target: t });
    // Hold still for HOLD_MS: Select takes over until release. On the selection it moves it; elsewhere it draws a box.
    stopHold();
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
    if (tool === "erase") setBrush(p);
    if (!drag) {
      setOverSelection(tool !== "erase" && selection.size > 0 && onSelection(doc, selection, p));
      return setHover(hit(p));
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
        // Snap within 6 screen px, unless snapping is off or ⌥/Alt is held.
        const raw: P = [p[0] - drag.from[0], p[1] - drag.from[1]];
        const snapped = settings.snap && !e.altKey && selection.size ? snapMove(doc, selection, raw, 6 / (view.zoom * L)) : { d: raw, guides: [] as Guide[], point: undefined };
        return setDrag({ ...drag, working: moveAll(doc, snapped.d, drag.captions), moved: true, guides: snapped.guides, point: snapped.point });
      }
    }
  }

  // Runs a shortcut action (see keys.ts for the list).
  function run(id: string) {
    const [kind, arg] = id.split(".");
    const atom = hover.atom, bond = hover.bond;
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
      if (selection.size || picked.size) return set(deleteCaptions(deleteAtoms(doc, selection), picked));
      if (hover.caption !== undefined) return set(deleteCaptions(doc, new Set([hover.caption])));
      // As in ChemDraw: the first Delete on a labelled atom removes the label; the next removes the atom.
      if (atom !== undefined) return set(doc.atoms[atom].label !== "C" ? setElement(doc, atom, "C") : deleteAtom(doc, atom));
      if (bond !== undefined) return set(deleteBond(doc, bond));
    }
  }

  // What the Actions panel shows: it follows the selection.
  const context: Context = (() => {
    if (!selection.size && picked.size) {
      const cs = (doc.captions ?? []).filter((c) => picked.has(c.id)), c = cs[0];
      if (c) {
        const p = placed.find((x) => x.id === c.id);
        return { kind: "caption", convertible: cs.length === 1 && namesLoaded && !!(nameToSmiles(c.text) || suggestName(c.text, false)), count: cs.length, bold: !!c.bold, italic: !!c.italic, underline: !!c.underline, size: c.size ?? CAPTION_PT, align: c.align ?? "centre", attached: !!c.under, attachable: !c.under && !!p && !!structureAbove(anchorOf(p), 4) };
      }
    }
    if (!selection.size) return doc.atoms.length || doc.captions?.length ? { kind: "drawing" } : { kind: "empty" };
    const ids = [...selection].filter((i) => i < doc.atoms.length);
    if (ids.length === 1) {
      const a = doc.atoms[ids[0]];
      return { kind: "atom", label: a.text ?? a.label, charge: a.charge ?? 0, terminal: neighbours(doc, ids[0]).length === 1, carbon: a.label === "C" && !a.text };
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
    return { kind: "structure", atoms: ids.length, structures: fragments(doc).filter((g) => g.some((i) => selection.has(i))).length, next: nextNumber(doc) };
  })();
  // What the panel knows about the drawing: formula and mass (of the selection, or everything), problems, mess.
  const analysis = useMemo(() => (loaded ? analyse(selection.size ? subset(doc, selection) : doc) : undefined), [loaded, doc, selection]);
  const found = useMemo(() => problems(doc), [doc]);
  const untidy = useMemo(() => messy(doc, selection), [doc, selection]);
  // Text the panel asked to copy; the copy handler uses it instead of SMILES.
  const copyText = useRef<string>(undefined);

  // The key to show beside an action: menu shortcuts, then the user's shortcut table.
  const MENU_KEYS: Record<string, string> = {
    import: `⇧${MOD}I`, paste_hint: `${MOD}V`, clean_up: `⇧${MOD}K`, flip_h: `⇧${MOD}H`, flip_v: `⇧${MOD}V`, select_all: `${MOD}A`, zoom_fit: `${MOD}1`, copy_smiles: `${MOD}C`, delete: "⌫",
    name_to_structure: `⇧${MOD}N`, "caption.bold": `${MOD}B`, "caption.italic": `${MOD}I`, "caption.underline": `${MOD}U`, "caption.edit": keyLabel("enter"),
  };
  const hint = (command: string) => {
    if (MENU_KEYS[command]) return MENU_KEYS[command];
    const first = keymap(settings.keys)[command]?.[0];
    return first ? keyLabel(first) : undefined;
  };

  // Runs an action from the panel on the selected atom, bond or atoms.
  function runAction(command: string) {
    const ids = [...selection];
    if (commands.current[command]) return commands.current[command]();
    if (command === "copy_smiles") return void document.execCommand("copy");
    if (command === "paste_hint") return setNotice(`Copy a SMILES string or MOL file, then press ${MOD}V here.`);
    if (command.startsWith("copy_text:")) { copyText.current = command.slice(10); document.execCommand("copy"); return; }
    if (command.startsWith("fix:")) { const [, i, charge] = command.split(":"); return set(addCharge(doc, Number(i), Number(charge) - (doc.atoms[Number(i)].charge ?? 0)), true); }
    if (command.startsWith("show:")) return setSelection(new Set([Number(command.slice(5))]));
    if (command.startsWith("align.")) return set(alignFragments(doc, selection, command.slice(6) as "row" | "column" | "spread-row"), true);
    if (command === "delete") return selection.size || picked.size ? set(deleteCaptions(deleteAtoms(doc, selection), picked)) : undefined;
    if (command === "number") return numberStructures();
    if (command === "template.add") return addSelectionAsRing();
    if (command === "caption.add") {
      // A new caption under the selected structures, centred on them.
      const under = fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat();
      setSelection(new Set());
      return openWriting({ value: "", under, style: {} });
    }
    if (command.startsWith("caption.")) {
      const [, what, arg] = command.split(".");
      if (what === "bold") return restyle((c) => ({ bold: !c.bold }));
      if (what === "italic") return restyle((c) => ({ italic: !c.italic }));
      if (what === "underline") return restyle((c) => ({ underline: !c.underline }));
      if (what === "size") return restyle(() => ({ size: Number(arg) === CAPTION_PT ? undefined : Number(arg) }));
      if (what === "align") return restyle(() => ({ align: arg as Caption["align"] }));
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
    if (tool === "ring") {
      const custom = templates.find((x) => templateKind(x.id) === ringKind);
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
      case "chain":
        if (drag.to) return set(chainTo(doc, drag.from, drag.to).mol);
        return click(drag.target, typeof drag.from === "number" ? pos(doc, drag.from) : drag.from);
      case "click":
        return click(drag.target, drag.at);
      case "erase": {
        // A click removes the atom or bond under the pointer; a rub removes everything it marked.
        const t = drag.target;
        if (drag.moved) return set(deleteCaptions(erase(doc, drag.bonds, drag.atoms), drag.captions));
        if (t.atom !== undefined) return set(deleteAtom(doc, t.atom));
        if (t.caption !== undefined) return set(deleteCaptions(doc, new Set([t.caption])));
        if (t.bond !== undefined) return set(deleteBond(doc, t.bond));
        return;
      }
      case "box":
      case "lasso":
        // A hold that never moved selects what it was held on.
        if (!drag.moved) {
          setSelection(new Set([...drag.base, ...atomsOf(doc, drag.target)]));
          if (drag.target.caption !== undefined) setPicked(new Set([...drag.picks, drag.target.caption]));
        }
        return;
      case "move": {
        if (!drag.moved) return click(drag.target, drag.from);
        // An atom dropped exactly on another joins it. Joining renumbers atoms, so the selection clears then.
        const { mol, joined } = joinOverlaps(drag.working, selection);
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
      if (typing()) return; // typing in a label or caption box
      const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      if (!TAURI && mod && key === "z") { e.preventDefault(); return undo(e.shiftKey); }
      if (!TAURI && mod && key === "y") { e.preventDefault(); return undo(true); }
      if (!TAURI && mod && key === "a") { e.preventDefault(); return commands.current.select_all(); }
      if (mod || e.altKey) return;
      if (e.key === "Escape") {
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
      // Everything else goes through the shortcut table (keys.ts), so every key can be changed.
      const pressed = keyOf(e);
      const id = pressed && actionFor(keymap(settings.keys), pressed, hover.atom !== undefined ? "atom" : hover.bond !== undefined ? "bond" : "none");
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
  const atomMark = (i: number, key: string, cls: string) => <circle key={key} className={cls} cx={pos(shown, i)[0] * L} cy={-pos(shown, i)[1] * L} r={0.32 * L} />;
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
  // An eraser stroke: its trail, and the bonds and atoms it will remove, tinted.
  const rubbing = drag?.kind === "erase" && drag.moved ? (
    <>
      <polyline className="trail" points={drag.trail.map(([x, y]) => `${x * L},${-y * L}`).join(" ")} strokeWidth={2 * settings.eraser * L} />
      <g className="erase-marks">
        {[...drag.bonds].filter((i) => i < shown.bonds.length).map((i) => bondMark(i, `eb${i}`, ""))}
        {[...drag.atoms].filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `ea${i}`, ""))}
        {[...drag.captions].map((id) => captionMark(id, `ec${id}`, ""))}
      </g>
    </>
  ) : null;
  const selected = drag?.kind === "erase" ? [] : [
    ...shown.bonds.flatMap((b, i) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? [bondMark(i, `sb${i}`, "")] : [])),
    ...[...selection].filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `sa${i}`, "")),
    ...[...picked].map((id) => captionMark(id, `sc${id}`, "")),
  ];
  const hovered = drag ? null
    : hover.atom !== undefined && shown.atoms[hover.atom] ? atomMark(hover.atom, "h", "mark")
    : hover.caption !== undefined && !picked.has(hover.caption) ? captionMark(hover.caption, "h", "mark")
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
        className="canvas"
        data-theme="light"
        data-tool={tool}
        style={overSelection || drag?.kind === "move" ? { cursor: "move" } : tool === "select" && cursor ? { cursor } : undefined}
        role="img"
        aria-label="Drawing canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { pointer.current = undefined; setBrush(undefined); if (!drag) setHover({}); }}
        onDoubleClick={(e) => {
          // With Select, double-click an atom to type its label (other tools would draw on each click).
          // Double-click a caption with any tool to type into it.
          const t = hit(toDoc(e.clientX, e.clientY));
          if (t.caption !== undefined && tool !== "erase") startWriting({ id: t.caption });
          else if (tool === "select" && t.atom !== undefined) editLabel(t.atom);
        }}
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {found.map((p) => doc.atoms[p.atom] && <circle key={`p${p.atom}`} className="problem-mark" cx={pos(shown, p.atom)[0] * L} cy={-pos(shown, p.atom)[1] * L} r={0.42 * L} vectorEffect="non-scaling-stroke" />)}
          {/* One group with one opacity, so overlapping marks don't stack up darker. */}
          <g className="selection-marks">{selected}</g>
          {hovered}
          <path d={toPath(drawing.polygons)} fill="var(--ink)" />
          {drawing.labels.map((l, i) => (
            <text key={i} x={l.x} y={l.y} fill="var(--ink)" style={{ font: `${l.size}px var(--atom-label-font)` }}>
              {l.text}
            </text>
          ))}
          {placed.map((c) => c.id === (writing?.id ?? DRAFT) || c.id === DRAFT ? null : (
            <text key={`c${c.id}`} className="caption" textAnchor={c.anchor} textDecoration={c.underline ? "underline" : undefined} style={{ font: `${c.italic ? "italic " : ""}${c.bold ? "bold " : ""}${c.size}px var(--caption-font)` }}>
              {c.lines.map((l, j) => <tspan key={j} x={l.x} y={l.y}>{l.text}</tspan>)}
            </text>
          ))}
          {ghost && (
            <g className="ghost" aria-hidden>
              <path d={toPath(ghost.polygons)} />
              {ghost.labels.map((l, i) => <text key={i} x={l.x} y={l.y} style={{ font: `${l.size}px var(--atom-label-font)` }}>{l.text}</text>)}
            </g>
          )}
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
        const commit = () => { set(setLabel(doc, editing.atom, editing.value)); setEditing(undefined); };
        return (
          <input
            className="label-box"
            data-theme="light"
            aria-label="Atom label"
            autoFocus
            spellCheck={false}
            value={editing.value}
            style={{ left: view.x + ax * L * view.zoom, top: view.y - ay * L * view.zoom, fontSize: STYLE.size * view.zoom }}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(undefined);
            }}
            onBlur={commit}
          />
        );
      })()}
      {writing && (() => {
        // The caption box sits exactly over the caption, in its font at the current zoom, so typing is in place.
        const c = placed.find((x) => x.id === (writing.id ?? DRAFT));
        if (!c) return null;
        const z = view.zoom, size = c.size * z, slack = 0.5 * size;
        return (
          <textarea
            className="caption-box"
            data-theme="light"
            aria-label="Caption"
            autoFocus
            spellCheck={false}
            wrap="off"
            value={writing.value}
            style={{
              left: view.x + c.box[0] * z - slack,
              top: view.y + (c.lines[0].y - 0.9465 * c.size) * z,
              width: (c.box[2] - c.box[0]) * z + 2 * slack,
              height: c.lines.length * 1.2 * size,
              font: `${c.italic ? "italic " : ""}${c.bold ? "bold " : ""}${size}px/1.2 var(--caption-font)`,
              padding: `0 ${slack}px`,
              textDecoration: c.underline ? "underline" : undefined,
              textAlign: c.anchor === "start" ? "left" : c.anchor === "end" ? "right" : "center",
            }}
            onChange={(e) => setWriting({ ...writing, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.altKey) { e.preventDefault(); commitWriting(); }
              if (e.key === "Escape") commitWriting(false);
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
          onChange={(e) => setNaming(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setNaming(undefined);
            if (e.key === "Tab" && suggestion) { e.preventDefault(); setNaming(suggestion); }
            if (e.key !== "Enter") return;
            if (named) { place(named); setNaming(undefined); return; }
            // Not a name Octet can read: the field shakes.
            if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
              e.currentTarget.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 240, easing: "ease-out" });
          }}
          onBlur={() => setNaming(undefined)}
        />
      )}
      {pop && <span key={pop.n} className="halo" style={{ left: pop.x, top: pop.y }} aria-hidden />}

      <Palette
        tool={tool}
        variants={{ select: selectKind, bond: bondKind, ring: ringKind }}
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
        run={runAction}
      />
      {notice && (
        <p className="notice text-ui" role="status">
          <Warning size={16} weight="bold" aria-hidden />
          {notice}
        </p>
      )}
    </div>
  );
}
