// The tool palette: one tool per kind of object, each with variants in a strip that opens beside it.
// Click an active tool again (or press and hold any tool) to open its strip; press, slide and release also works.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowClockwise, ArrowCounterClockwise, Eraser, Lasso, Plus, Selection, TextT, X } from "@phosphor-icons/react";
import { chairPoints, type BondSpec } from "./edit";
import type { Mol } from "./render";
import { templateKind, type Template } from "./templates";

export type Tool = "select" | "bond" | "chain" | "ring" | "text" | "erase";

export const BONDS = {
  single: { name: "Single", spec: { type: 1 } },
  double: { name: "Double", spec: { type: 2 } },
  triple: { name: "Triple", spec: { type: 3 } },
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

export const SELECTS = { box: { name: "Box" }, lasso: { name: "Lasso" } };
export type SelectKind = keyof typeof SELECTS;

// ring is a RingKind, or a template's kind (custom:id).
export type Variants = { select: SelectKind; bond: BondKind; ring: string };
type Strip = "select" | "bond" | "ring";
const isStrip = (t: Tool): t is Strip => t === "select" || t === "bond" || t === "ring";
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

const ChainGlyph = () => <Icon><polyline points="32,168 80,104 128,168 176,104 224,168" /></Icon>;

// A template's icon: its bonds as strokes, in the same style as the other tool icons.
export function TemplateGlyph({ mol }: { mol: Mol }) {
  const xs = mol.atoms.map((a) => a.location[0]), ys = mol.atoms.map((a) => -a.location[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)], span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1);
  const k = 192 / span, ox = 32 + (192 - (Math.max(...xs) - x0) * k) / 2, oy = 32 + (192 - (Math.max(...ys) - y0) * k) / 2;
  const at = (i: number): [number, number] => [ox + (xs[i] - x0) * k, oy + (ys[i] - y0) * k];
  const mid = [xs.reduce((s, x) => s + x, 0) / xs.length, ys.reduce((s, y) => s + y, 0) / ys.length];
  const c: [number, number] = [ox + (mid[0] - x0) * k, oy + (mid[1] - y0) * k];
  return (
    <Icon>
      {mol.bonds.map((b, i) => {
        const [p, q] = [at(b.atoms[0]), at(b.atoms[1])];
        // A double bond's second line sits towards the middle of the template, shortened.
        const inner = b.type === 2 && (() => {
          const shrink = (a: [number, number], o: [number, number]) => [a[0] + (o[0] - a[0]) * 0.2 + (c[0] - (p[0] + q[0]) / 2) * 0.3, a[1] + (o[1] - a[1]) * 0.2 + (c[1] - (p[1] + q[1]) / 2) * 0.3];
          const [a, e] = [shrink(p, q), shrink(q, p)];
          return <line x1={a[0]} y1={a[1]} x2={e[0]} y2={e[1]} />;
        })();
        return <g key={i}><line x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} />{inner}</g>;
      })}
    </Icon>
  );
}

type PaletteProps = {
  tool: Tool;
  variants: Variants;
  templates: Template[];
  pinned: string[]; // options on the toolbar, as "tool:variant"
  popKey: number; // changes when a hold switches to Select, to replay its pop
  canUndo: boolean;
  canRedo: boolean;
  modKey: string;
  canAddSelection: boolean; // something is selected that could become a ring
  renaming?: string; // a template just added, whose name is being typed
  preview: (name: string) => Mol | undefined; // the structure for a name, if it is one
  onTool: (t: Tool) => void;
  onVariant: (t: Strip, kind: string) => void;
  onPinned: (pinned: string[]) => void;
  onAddName: (name: string) => boolean;
  onAddSelection: () => void;
  onRename: (id: string, name: string) => void;
  onRemoveTemplate: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  stripWidths: Partial<Record<Tool, number>>; // widths the user dragged each strip to
  onStripWidth: (t: Tool, width: number) => void;
};

// Strip options sit in a grid: two columns by default, more or fewer as the strip is resized.
const CELL = 150, GAP = 2, PAD = 4;
const widthFor = (columns: number) => columns * CELL + (columns - 1) * GAP + 2 * PAD + 2;
const DRAG_PX = 6; // an option pressed and moved this far is being dragged to the toolbar

export function Palette(p: PaletteProps) {
  // ?strip=ring opens a strip on load (dev only, for checking its layout).
  const [open, setOpen] = useState<Tool | undefined>(() => (new URLSearchParams(location.search).get("strip") as Tool) ?? undefined);
  const [held, setHeld] = useState(false); // the strip was opened by a press that is still down
  const [dragWidth, setDragWidth] = useState<number>(); // live width while the corner grip is dragged
  // An option being dragged onto the toolbar (or a shortcut being dragged along it or off it).
  const [carry, setCarry] = useState<{ key: string; x: number; y: number; over: boolean }>();
  const dragged = useRef(false); // the last press was a drag, so its click does nothing
  const [adding, setAdding] = useState("");
  const timer = useRef<number>(undefined);
  const nav = useRef<HTMLElement>(null);

  // Close the strip on Escape or a press anywhere else.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!nav.current?.contains(e.target as Node)) setOpen(undefined); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(undefined); };
    addEventListener("pointerdown", away);
    addEventListener("keydown", esc);
    return () => { removeEventListener("pointerdown", away); removeEventListener("keydown", esc); };
  }, [open]);
  // A template added from the drawing opens the ring list, with its name ready to type.
  useEffect(() => { if (p.renaming) setOpen("ring"); }, [p.renaming]);

  const template = (kind: string) => p.templates.find((t) => templateKind(t.id) === kind);
  const nameOf = (tool: Strip, kind: string) =>
    tool === "bond" ? BONDS[kind as BondKind]?.name : tool === "ring" ? (RINGS[kind as RingKind]?.name ?? template(kind)?.name) : SELECTS[kind as SelectKind]?.name;
  const iconOf = (tool: Strip, kind: string) => {
    if (tool === "bond") return <BondGlyph kind={kind as BondKind} />;
    if (tool === "select") return kind === "lasso" ? <Lasso size={20} /> : <Selection size={20} />;
    const t = template(kind);
    return t ? <TemplateGlyph mol={t.mol} /> : <RingGlyph kind={kind as RingKind} />;
  };
  const options = (tool: Strip) => (tool === "bond" ? Object.keys(BONDS) : tool === "select" ? Object.keys(SELECTS) : [...Object.keys(RINGS), ...p.templates.map((t) => templateKind(t.id))]);
  // Pinned shortcuts whose option still exists.
  const pins = p.pinned.flatMap((key) => {
    const [tool, ...rest] = key.split(":"), kind = rest.join(":");
    return isStrip(tool as Tool) && nameOf(tool as Strip, kind) ? [{ key, tool: tool as Strip, kind }] : [];
  });

  const tools: { id: Tool; name: string; icon: React.ReactNode }[] = [
    { id: "select", name: p.variants.select === "lasso" ? "Lasso" : "Select", icon: p.variants.select === "lasso" ? <Lasso size={20} /> : <Selection size={20} /> },
    { id: "bond", name: `${BONDS[p.variants.bond].name} bond`, icon: <BondGlyph kind={p.variants.bond} /> },
    { id: "chain", name: "Chain", icon: <ChainGlyph /> },
    { id: "ring", name: nameOf("ring", p.variants.ring) ?? "Ring", icon: iconOf("ring", p.variants.ring) },
    { id: "text", name: "Text", icon: <TextT size={20} /> },
    { id: "erase", name: "Eraser ([ and ] change its size)", icon: <Eraser size={20} /> },
  ];
  const active = tools.findIndex((t) => t.id === p.tool);
  const choose = (t: Strip, kind: string) => { p.onVariant(t, kind); p.onTool(t); setOpen(undefined); };

  // Drag an option onto the toolbar to pin it there; drag a shortcut along the toolbar to move it, or off it to remove it.
  function startCarry(e: React.PointerEvent, key: string) {
    if (e.button !== 0) return;
    const [sx, sy] = [e.clientX, e.clientY];
    let moving = false;
    dragged.current = false;
    const inside = (x: number, y: number) => { const r = nav.current!.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    const move = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_PX) return;
      moving = dragged.current = true;
      setCarry({ key, x: ev.clientX, y: ev.clientY, over: inside(ev.clientX, ev.clientY) });
    };
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setCarry(undefined);
      if (!moving) return;
      const rest = p.pinned.filter((k) => k !== key);
      if (!inside(ev.clientX, ev.clientY)) return p.pinned.includes(key) && p.onPinned(rest);
      // Dropped on the toolbar: before the first shortcut it is above, else at the end.
      const at = [...nav.current!.querySelectorAll<HTMLElement>("[data-pin]")].filter((el) => el.dataset.pin !== key).findIndex((el) => ev.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
      p.onPinned(at < 0 ? [...rest, key] : [...rest.slice(0, at), key, ...rest.slice(at)]);
      setOpen(undefined);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  function addByName() {
    if (p.onAddName(adding.trim())) return setAdding("");
  }
  const addPreview = useMemo(() => (adding.trim() ? p.preview(adding) : undefined), [adding]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <nav ref={nav} className={carry?.over ? "palette dropping" : "palette"} aria-label="Tools">
      <span className="indicator" style={{ transform: `translateY(${active * 36}px)`, opacity: active < 0 ? 0 : 1 }} aria-hidden />
      {tools.map((t) => {
        const strip = isStrip(t.id) ? options(t.id) : undefined;
        return (
          <div key={t.id} className="slot">
            <button
              className="tool"
              aria-pressed={p.tool === t.id}
              aria-label={t.name}
              aria-haspopup={strip ? "menu" : undefined}
              aria-expanded={strip ? open === t.id : undefined}
              title={strip ? `${t.name}. Click again or hold for more.` : t.name}
              onPointerDown={() => {
                if (!strip) return;
                clearTimeout(timer.current);
                timer.current = window.setTimeout(() => { setOpen(t.id); setHeld(true); }, HOLD_MS);
              }}
              onPointerUp={() => clearTimeout(timer.current)}
              onPointerLeave={() => clearTimeout(timer.current)}
              onClick={() => {
                if (held) return setHeld(false);
                if (strip && p.tool === t.id) return setOpen(open === t.id ? undefined : t.id);
                setOpen(undefined);
                p.onTool(t.id);
              }}
            >
              <span key={t.id === "select" ? `pop${p.popKey}` : t.id} className={t.id === "select" && p.popKey ? "glyph pop" : "glyph"}>
                {t.icon}
              </span>
              {strip && <span className="more" aria-hidden />}
            </button>
            {strip && isStrip(t.id) && open === t.id && (() => {
              const tool = t.id;
              return (
                <div
                  className="strip"
                  role="menu"
                  aria-label={`${t.name} options`}
                  style={{ width: dragWidth ?? p.stripWidths[tool] ?? widthFor(2) }}
                  onPointerUp={() => setHeld(false)}
                >
                  {strip.map((kind) => {
                    const current = p.variants[tool] === kind, name = nameOf(tool, kind)!, custom = template(kind);
                    if (custom && p.renaming === custom.id) {
                      return (
                        <div key={kind} className="variant" role="none">
                          {iconOf(tool, kind)}
                          <input
                            className="variant-input"
                            aria-label="Name"
                            autoFocus
                            defaultValue={custom.name}
                            onFocus={(e) => e.target.select()}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur(); }}
                            onBlur={(e) => p.onRename(custom.id, e.target.value.trim() || custom.name)}
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={kind} className="variant-cell">
                        <button
                          role="menuitemradio"
                          aria-checked={current}
                          className="variant"
                          title={name}
                          onPointerDown={(e) => startCarry(e, `${tool}:${kind}`)}
                          onClick={() => { if (!dragged.current) choose(tool, kind); }}
                          onPointerUp={() => { if (held) choose(tool, kind); }}
                        >
                          {iconOf(tool, kind)}
                          <span className="variant-name">{name}</span>
                        </button>
                        {custom && (
                          <button className="variant-remove" aria-label={`Remove ${name}`} title="Remove" onClick={() => p.onRemoveTemplate(custom.id)}>
                            <X size={12} weight="bold" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {tool === "ring" && (
                    <>
                      <label className="variant add">
                        {addPreview ? <TemplateGlyph mol={addPreview} /> : <Plus size={20} />}
                        <input
                          className="variant-input"
                          placeholder="Add by name"
                          aria-label="Add a ring by name"
                          spellCheck={false}
                          value={adding}
                          aria-invalid={!!adding.trim() && !addPreview}
                          onChange={(e) => setAdding(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addByName();
                            if (e.key === "Escape") { setAdding(""); e.currentTarget.blur(); }
                          }}
                        />
                      </label>
                      {p.canAddSelection && (
                        <button className="variant add" onClick={p.onAddSelection}>
                          <Plus size={20} />
                          <span className="variant-name">Add selection</span>
                        </button>
                      )}
                    </>
                  )}
                  <span
                    className="grip"
                    role="separator"
                    aria-label="Drag to resize"
                    title="Drag to resize"
                    onPointerDown={(e) => {
                      // Drag the corner: the strip's width snaps to whole columns, from one to all of them.
                      e.preventDefault();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const startX = e.clientX, start = p.stripWidths[tool] ?? widthFor(2), most = widthFor(strip.length);
                      let width = start;
                      const move = (ev: PointerEvent) => { width = Math.min(most, Math.max(widthFor(1), start + ev.clientX - startX)); setDragWidth(width); };
                      const up = () => {
                        removeEventListener("pointermove", move);
                        removeEventListener("pointerup", up);
                        const columns = Math.max(1, Math.round((width - 2 * PAD - 2 + GAP) / (CELL + GAP)));
                        p.onStripWidth(tool, widthFor(columns));
                        setDragWidth(undefined);
                      };
                      addEventListener("pointermove", move);
                      addEventListener("pointerup", up);
                    }}
                  />
                </div>
              );
            })()}
          </div>
        );
      })}
      {pins.length > 0 && <hr />}
      {pins.map(({ key, tool, kind }) => (
        <button
          key={key}
          data-pin={key}
          className={carry?.key === key ? "tool carried" : "tool"}
          aria-pressed={p.tool === tool && p.variants[tool] === kind}
          aria-label={nameOf(tool, kind)}
          title={nameOf(tool, kind)}
          onPointerDown={(e) => startCarry(e, key)}
          onClick={() => { if (!dragged.current) choose(tool, kind); }}
        >
          {iconOf(tool, kind)}
        </button>
      ))}
      <hr />
      <button className="tool" aria-label="Undo" title={`Undo (${p.modKey}Z)`} disabled={!p.canUndo} onClick={p.onUndo}>
        <ArrowCounterClockwise size={20} />
      </button>
      <button className="tool" aria-label="Redo" title={`Redo (${p.modKey}⇧Z)`} disabled={!p.canRedo} onClick={p.onRedo}>
        <ArrowClockwise size={20} />
      </button>
      {carry && (() => {
        const [tool, ...rest] = carry.key.split(":");
        return <span className="carry" style={{ left: carry.x, top: carry.y }} aria-hidden>{iconOf(tool as Strip, rest.join(":"))}</span>;
      })()}
    </nav>
  );
}
