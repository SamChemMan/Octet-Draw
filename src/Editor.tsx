import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ArrowClockwise, ArrowCounterClockwise, Eraser, Selection, Warning } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { measure, parseStructure, ready, STYLE, toSmiles } from "./chem";
import { parse, serialize } from "./file";
import {
  EMPTY, addCharge, addRing, atomAt, atomsIn, bondAt, bondTo, bounds, complete, cycleBond, deleteAtom, deleteAtoms, deleteBond, erase, joinOverlaps,
  merge, moveAtoms, neighbours, onSelection, pos, setBond, setElement, sprout, subset, type P,
} from "./edit";
import { snapMove, type Guide } from "./snap";
import { loadSettings, saveSettings } from "./settings";
import { actionFor, keyOf, keymap } from "./keys";
import { render, type Mol } from "./render";
import { selectCursor } from "./cursor";
import "./editor.css";

type Tool = "select" | "bond" | "benzene" | "cyclohexane" | "cyclopentane" | "erase";
const RINGS: Partial<Record<Tool, [number, boolean]>> = { benzene: [6, true], cyclohexane: [6, false], cyclopentane: [5, false] };

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

type Hover = { atom?: number; bond?: number };
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
  | { kind: "erase"; trail: P[]; bonds: Set<number>; atoms: Set<number>; start: [number, number]; target: Hover; moved: boolean }
  | { kind: "box"; from: P; to: P; base: Set<number>; target: Hover; moved: boolean }
  // Moving the selection. If the pointer never moves, the press counts as a click with the tool in hand.
  | { kind: "move"; from: P; working: Mol; moved: boolean; start: [number, number]; target: Hover; guides: Guide[]; point?: P };

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
  const [drag, setDrag] = useState<Drag>();
  const [notice, setNotice] = useState<string>();
  // The hold-to-select switch: the tool icon pops and a ring pops at the pointer. pop.n restarts the animations.
  const [pop, setPop] = useState<{ n: number; x: number; y: number }>();
  const [cursor, setCursor] = useState<string>();
  const [settings, setSettings] = useState(loadSettings);
  const [overSelection, setOverSelection] = useState(false);
  // Where the eraser outline is drawn (drawing coordinates), while the Eraser is in hand.
  const [brush, setBrush] = useState<P>();
  useEffect(() => { selectCursor.then(setCursor); }, []);
  const hold = useRef<number>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const pointer = useRef<P>(undefined);
  // Every edit clears the selection, except a move, which keeps the same atoms selected.
  const set = (mol: Mol, keepSelection = false) => {
    dispatch({ type: "set", mol });
    if (!keepSelection) setSelection(new Set());
  };
  const undo = (redo = false) => { dispatch({ type: redo ? "redo" : "undo" }); setSelection(new Set()); };
  // The file on disk and the drawing as last saved. Undoing back to the saved drawing makes it clean again.
  const [file, setFile] = useState<{ path?: string; saved: Mol }>({ saved: EMPTY });
  const dirty = doc !== file.saved;

  useEffect(() => { ready.then(() => setLoaded(true)); }, []);
  useEffect(() => { if (notice) { const t = setTimeout(() => setNotice(undefined), 4000); return () => clearTimeout(t); } }, [notice]);
  // After an edit, the thing under a still pointer may have changed.
  useEffect(() => { if (pointer.current) setHover(hitIn(doc, pointer.current)); }, [doc]);

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
  // Menu commands. New and Open go on the undo list, so they never lose work.
  const commands = useRef<Record<string, () => void>>({});
  commands.current = {
    new: () => { set(EMPTY); setFile({ saved: EMPTY }); },
    open: () => void open(),
    save: () => void save(false),
    save_as: () => void save(true),
    undo: () => undo(),
    redo: () => undo(true),
    select_all: () => setSelection(new Set(doc.atoms.map((_, i) => i))),
    snap: () => setSettings((s) => ({ ...s, snap: !s.snap })),
  };
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
    if (drag?.kind === "bond" && drag.to) return bondTo(doc, drag.from, drag.to);
    if (drag?.kind === "move") return drag.working;
    return doc;
  }, [doc, drag]);
  const drawing = useMemo(() => render(shown, STYLE, measure, L), [shown]);

  const stopHold = () => { clearTimeout(hold.current); hold.current = undefined; };

  // Select tool press: on something selected, move the selection; on something else, select it and move it;
  // on empty canvas, start a selection box. Shift adds to the selection.
  const startMove = (p: P, screen: [number, number], t: Hover) =>
    setDrag({ kind: "move", from: p, working: doc, moved: false, start: screen, target: t, guides: [] });

  function pressSelect(p: P, t: Hover, shift: boolean, screen: [number, number]) {
    const ids = atomsOf(doc, t);
    if (!shift && selection.size && onSelection(doc, selection, p)) return startMove(p, screen, t);
    if (ids.length) {
      setSelection(new Set(shift ? [...selection, ...ids] : ids));
      return startMove(p, screen, t);
    }
    const base = shift ? selection : new Set<number>();
    setSelection(base);
    setDrag({ kind: "box", from: p, to: p, base, target: t, moved: false });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    const p = toDoc(e.clientX, e.clientY), t = hitIn(doc, p), screen: [number, number] = [e.clientX, e.clientY];
    pointer.current = p;
    if (tool === "select") return pressSelect(p, t, e.shiftKey, screen);
    // With something selected, a press on it (or inside it) grabs it, whatever tool is in hand.
    if (tool !== "erase" && selection.size && onSelection(doc, selection, p)) return startMove(p, screen, t);
    if (tool === "erase") return setDrag({ kind: "erase", trail: [p], bonds: new Set(), atoms: new Set(), start: screen, target: t, moved: false });
    if (tool === "bond") setDrag({ kind: "bond", from: t.atom ?? p, at: p, start: screen, target: t });
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
      setDrag({ kind: "box", from: p, to: p, base: new Set(), target: t, moved: false });
    }, HOLD_MS);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = toDoc(e.clientX, e.clientY);
    pointer.current = p;
    if (tool === "erase") setBrush(p);
    if (!drag) {
      setOverSelection(tool !== "erase" && selection.size > 0 && onSelection(doc, selection, p));
      return setHover(hitIn(doc, p));
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
      case "erase": {
        if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        const bonds = new Set(drag.bonds), atoms = new Set(drag.atoms);
        rub(doc, drag.trail[drag.trail.length - 1], p, settings.eraser, bonds, atoms);
        return setDrag({ ...drag, trail: [...drag.trail, p], bonds, atoms, moved: true });
      }
      case "box":
        // Smart: atoms the box only just missed (all their neighbours are in it) come along too.
        setSelection(complete(doc, new Set([...drag.base, ...atomsIn(doc, drag.from, p)])));
        return setDrag({ ...drag, to: p, moved: true });
      case "move": {
        if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        // Snap within 6 screen px, unless snapping is off or ⌥/Alt is held.
        const raw: P = [p[0] - drag.from[0], p[1] - drag.from[1]];
        const snapped = settings.snap && !e.altKey ? snapMove(doc, selection, raw, 6 / (view.zoom * L)) : { d: raw, guides: [] as Guide[], point: undefined };
        return setDrag({ ...drag, working: moveAtoms(doc, selection, snapped.d), moved: true, guides: snapped.guides, point: snapped.point });
      }
    }
  }

  // Runs a shortcut action (see keys.ts for the list).
  function run(id: string) {
    const [kind, arg] = id.split(".");
    const atom = hover.atom, bond = hover.bond;
    if (kind === "element" && atom !== undefined) return set(setElement(doc, atom, arg));
    if (id === "charge.plus" && atom !== undefined) return set(addCharge(doc, atom, 1));
    if (id === "charge.minus" && atom !== undefined) return set(addCharge(doc, atom, -1));
    if (kind === "bond" && bond !== undefined) {
      const shape: Record<string, [number, number?]> = { single: [1], double: [2], triple: [3], wedge: [1, 1], hash: [1, 6] };
      return set(setBond(doc, bond, ...shape[arg]));
    }
    if (kind === "tool") return setTool(arg as Tool);
    if (kind === "eraser") return setSettings((s) => ({ ...s, eraser: Math.min(2, Math.max(0.05, s.eraser * (arg === "bigger" ? 1.25 : 0.8))) }));
    if (id === "edit.delete") {
      if (selection.size) return set(deleteAtoms(doc, selection));
      if (atom !== undefined) return set(deleteAtom(doc, atom));
      if (bond !== undefined) return set(deleteBond(doc, bond));
    }
  }

  // What a click does with each tool in hand.
  function click(t: Hover, at: P) {
    if (tool === "bond") return set(t.atom !== undefined ? sprout(doc, t.atom) : t.bond !== undefined ? cycleBond(doc, t.bond) : sprout(doc, at));
    const ring = RINGS[tool];
    if (ring) return set(addRing(doc, ring[0], ring[1], t.bond !== undefined ? { bond: t.bond } : t.atom !== undefined ? { atom: t.atom } : { point: at }));
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
        if (to) return set(bondTo(doc, from, to));
        return click(t, at);
      }
      case "click":
        return click(drag.target, drag.at);
      case "erase": {
        // A click removes the atom or bond under the pointer; a rub removes everything it marked.
        const t = drag.target;
        if (drag.moved) return set(erase(doc, drag.bonds, drag.atoms));
        if (t.atom !== undefined) return set(deleteAtom(doc, t.atom));
        if (t.bond !== undefined) return set(deleteBond(doc, t.bond));
        return;
      }
      case "box":
        // A hold that never moved selects what it was held on.
        if (!drag.moved) setSelection(new Set([...drag.base, ...atomsOf(doc, drag.target)]));
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
      const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      if (!TAURI && mod && key === "z") { e.preventDefault(); return undo(e.shiftKey); }
      if (!TAURI && mod && key === "y") { e.preventDefault(); return undo(true); }
      if (!TAURI && mod && key === "a") { e.preventDefault(); return commands.current.select_all(); }
      if (mod || e.altKey) return;
      if (e.key === "Escape") {
        stopHold();
        setDrag(undefined);
        if (spring) { setTool(spring); setSpring(undefined); }
        return setSelection(new Set());
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
      const text = e.clipboardData?.getData("text/plain")?.trim();
      if (!text || !loaded) return;
      e.preventDefault();
      try {
        const frag = parseStructure(text);
        if (!frag.atoms.length) throw new Error("empty");
        const f = bounds(frag)!, d = bounds(doc);
        const centre: P = d ? [d[2] + 1.5 + (f[2] - f[0]) / 2, (d[1] + d[3]) / 2] : toDoc(innerWidth / 2, innerHeight / 2);
        set(merge(doc, frag, [centre[0] - (f[0] + f[2]) / 2, centre[1] - (f[1] + f[3]) / 2]));
      } catch {
        setNotice("Octet cannot read this structure. Paste a SMILES string or a MOL file.");
      }
    };
    // Copy puts the selection, or the whole drawing, on the clipboard as SMILES.
    const onCopy = (e: ClipboardEvent) => {
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
  // An eraser stroke: its trail, and the bonds and atoms it will remove, tinted.
  const rubbing = drag?.kind === "erase" && drag.moved ? (
    <>
      <polyline className="trail" points={drag.trail.map(([x, y]) => `${x * L},${-y * L}`).join(" ")} strokeWidth={2 * settings.eraser * L} />
      <g className="erase-marks">
        {[...drag.bonds].filter((i) => i < shown.bonds.length).map((i) => bondMark(i, `eb${i}`, ""))}
        {[...drag.atoms].filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `ea${i}`, ""))}
      </g>
    </>
  ) : null;
  const selected = drag?.kind === "erase" ? [] : [
    ...shown.bonds.flatMap((b, i) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? [bondMark(i, `sb${i}`, "")] : [])),
    ...[...selection].filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `sa${i}`, "")),
  ];
  const hovered = drag ? null
    : hover.atom !== undefined && shown.atoms[hover.atom] ? atomMark(hover.atom, "h", "mark")
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

  const tools: { id: Tool; name: string; icon: React.ReactNode }[] = [
    { id: "select", name: "Select", icon: <Selection size={20} /> },
    { id: "bond", name: "Bond (hold to select)", icon: <BondIcon /> },
    { id: "benzene", name: "Benzene (hold to select)", icon: <RingIcon n={6} aromatic /> },
    { id: "cyclohexane", name: "Cyclohexane (hold to select)", icon: <RingIcon n={6} /> },
    { id: "cyclopentane", name: "Cyclopentane (hold to select)", icon: <RingIcon n={5} /> },
    { id: "erase", name: "Eraser (drag to rub out)", icon: <Eraser size={20} /> },
  ];
  const active = tools.findIndex((t) => t.id === tool);

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
      >
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {/* One group with one opacity, so overlapping marks don't stack up darker. */}
          <g className="selection-marks">{selected}</g>
          {hovered}
          <path d={toPath(drawing.polygons)} fill="var(--ink)" />
          {drawing.labels.map((l, i) => (
            <text key={i} x={l.x} y={l.y} fill="var(--ink)" style={{ font: `${l.size}px var(--atom-label-font)` }}>
              {l.text}
            </text>
          ))}
          {box}
          {rubbing}
          {tool === "erase" && brush && <circle className="brush" cx={brush[0] * L} cy={-brush[1] * L} r={settings.eraser * L} vectorEffect="non-scaling-stroke" />}
          {drag?.kind === "move" && drag.guides.map((g, i) => g.axis === "x"
            ? <line key={i} className="guide" x1={g.at * L} x2={g.at * L} y1={-g.from * L} y2={-g.to * L} vectorEffect="non-scaling-stroke" />
            : <line key={i} className="guide" y1={-g.at * L} y2={-g.at * L} x1={g.from * L} x2={g.to * L} vectorEffect="non-scaling-stroke" />)}
          {drag?.kind === "move" && drag.point && <circle className="snap-point" cx={drag.point[0] * L} cy={-drag.point[1] * L} r={0.22 * L} vectorEffect="non-scaling-stroke" />}
        </g>
      </svg>
      {pop && <span key={pop.n} className="halo" style={{ left: pop.x, top: pop.y }} aria-hidden />}

      <nav className="palette" aria-label="Tools">
        <span className="indicator" style={{ transform: `translateY(${active * 36}px)` }} aria-hidden />
        {tools.map((t) => (
          <button key={t.id} className="tool" aria-pressed={tool === t.id} aria-label={t.name} title={t.name} onClick={() => setTool(t.id)}>
            <span key={t.id === "select" ? `pop${pop?.n ?? 0}` : t.id} className={t.id === "select" && pop ? "glyph pop" : "glyph"}>
              {t.icon}
            </span>
          </button>
        ))}
        <hr />
        <button className="tool" aria-label="Undo" title={`Undo (${MOD}Z)`} disabled={h.at === 0} onClick={() => undo()}>
          <ArrowCounterClockwise size={20} />
        </button>
        <button className="tool" aria-label="Redo" title={`Redo (${MOD}⇧Z)`} disabled={h.at === h.stack.length - 1} onClick={() => undo(true)}>
          <ArrowClockwise size={20} />
        </button>
      </nav>

      {!doc.atoms.length && (
        <p className="hint text-ui" data-theme="light">
          Click the canvas to draw a bond.
          <br />
          Paste a SMILES string to add a structure.
        </p>
      )}
      {notice && (
        <p className="notice text-ui" role="status">
          <Warning size={16} weight="bold" aria-hidden />
          {notice}
        </p>
      )}
    </div>
  );
}

// Chemistry tool icons in Phosphor's style (256 grid, 16-unit round strokes). Each tool draws its real object.
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width={20} height={20} viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}
const BondIcon = () => <Icon><line x1={60} y1={196} x2={196} y2={60} /></Icon>;
function RingIcon({ n, aromatic }: { n: number; aromatic?: boolean }) {
  const c = 128, r = 92;
  const pts = Array.from({ length: n }, (_, k) => [c + r * Math.sin((2 * Math.PI * k) / n), c - r * Math.cos((2 * Math.PI * k) / n)]);
  const inner = (k: number) => [pts[k], pts[(k + 1) % n]].map(([x, y]) => [c + (x - c) * 0.62, c + (y - c) * 0.62]);
  return (
    <Icon>
      <polygon points={pts.map((p) => p.join(",")).join(" ")} />
      {aromatic && [1, 3, 5].map((k) => { const [[x1, y1], [x2, y2]] = inner(k); return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} />; })}
    </Icon>
  );
}
