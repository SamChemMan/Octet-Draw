// The tool palette: one tool per kind of object, each with variants in a strip that opens beside it.
// Click an active tool again (or press and hold any tool) to open its strip; press, slide and release also works.
import { useEffect, useRef, useState } from "react";
import { ArrowClockwise, ArrowCounterClockwise, Eraser, Lasso, Selection, TextT } from "@phosphor-icons/react";
import { chairPoints, type BondSpec } from "./edit";

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

export type Variants = { select: SelectKind; bond: BondKind; ring: RingKind };
const STRIPS: Partial<Record<Tool, readonly string[]>> = { select: Object.keys(SELECTS), bond: Object.keys(BONDS), ring: Object.keys(RINGS) };
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

type PaletteProps = {
  tool: Tool;
  variants: Variants;
  popKey: number; // changes when a hold switches to Select, to replay its pop
  canUndo: boolean;
  canRedo: boolean;
  modKey: string;
  onTool: (t: Tool) => void;
  onVariant: (t: "select" | "bond" | "ring", kind: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  stripWidths: Partial<Record<Tool, number>>; // widths the user dragged each strip to
  onStripWidth: (t: Tool, width: number) => void;
};

// Strip options sit in a grid: two columns by default, more or fewer as the strip is resized.
const CELL = 150, GAP = 2, PAD = 4;
const widthFor = (columns: number) => columns * CELL + (columns - 1) * GAP + 2 * PAD + 2;

export function Palette(p: PaletteProps) {
  // ?strip=ring opens a strip on load (dev only, for checking its layout).
  const [open, setOpen] = useState<Tool | undefined>(() => (new URLSearchParams(location.search).get("strip") as Tool) ?? undefined);
  const [held, setHeld] = useState(false); // the strip was opened by a press that is still down
  const [dragWidth, setDragWidth] = useState<number>(); // live width while the corner grip is dragged
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

  const tools: { id: Tool; name: string; icon: React.ReactNode }[] = [
    { id: "select", name: p.variants.select === "lasso" ? "Lasso" : "Select", icon: p.variants.select === "lasso" ? <Lasso size={20} /> : <Selection size={20} /> },
    { id: "bond", name: `${BONDS[p.variants.bond].name} bond`, icon: <BondGlyph kind={p.variants.bond} /> },
    { id: "chain", name: "Chain", icon: <ChainGlyph /> },
    { id: "ring", name: RINGS[p.variants.ring].name, icon: <RingGlyph kind={p.variants.ring} /> },
    { id: "text", name: "Text", icon: <TextT size={20} /> },
    { id: "erase", name: "Eraser ([ and ] change its size)", icon: <Eraser size={20} /> },
  ];
  const active = tools.findIndex((t) => t.id === p.tool);
  const choose = (t: Tool, kind: string) => { p.onVariant(t as "select" | "bond" | "ring", kind); p.onTool(t); setOpen(undefined); };

  return (
    <nav ref={nav} className="palette" aria-label="Tools">
      <span className="indicator" style={{ transform: `translateY(${active * 36}px)` }} aria-hidden />
      {tools.map((t) => {
        const strip = STRIPS[t.id];
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
            {strip && open === t.id && (
              <div
                className="strip"
                role="menu"
                aria-label={`${t.name} options`}
                style={{ width: dragWidth ?? p.stripWidths[t.id] ?? widthFor(2) }}
                onPointerUp={() => setHeld(false)}
              >
                {strip.map((kind) => {
                  const current = p.variants[t.id as keyof Variants] === kind;
                  const name = t.id === "bond" ? BONDS[kind as BondKind].name : t.id === "ring" ? RINGS[kind as RingKind].name : SELECTS[kind as SelectKind].name;
                  return (
                    <button
                      key={kind}
                      role="menuitemradio"
                      aria-checked={current}
                      className="variant"
                      title={name}
                      onClick={() => choose(t.id, kind)}
                      onPointerUp={() => { if (held) choose(t.id, kind); }}
                    >
                      {t.id === "bond" ? <BondGlyph kind={kind as BondKind} /> : t.id === "ring" ? <RingGlyph kind={kind as RingKind} /> : kind === "lasso" ? <Lasso size={20} /> : <Selection size={20} />}
                      <span className="variant-name">{name}</span>
                    </button>
                  );
                })}
                <span
                  className="grip"
                  role="separator"
                  aria-label="Drag to resize"
                  title="Drag to resize"
                  onPointerDown={(e) => {
                    // Drag the corner: the strip's width snaps to whole columns, from one to all of them.
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const startX = e.clientX, start = p.stripWidths[t.id] ?? widthFor(2), most = widthFor(strip.length);
                    let width = start;
                    const move = (ev: PointerEvent) => { width = Math.min(most, Math.max(widthFor(1), start + ev.clientX - startX)); setDragWidth(width); };
                    const up = () => {
                      removeEventListener("pointermove", move);
                      removeEventListener("pointerup", up);
                      const columns = Math.max(1, Math.round((width - 2 * PAD - 2 + GAP) / (CELL + GAP)));
                      p.onStripWidth(t.id, widthFor(columns));
                      setDragWidth(undefined);
                    };
                    addEventListener("pointermove", move);
                    addEventListener("pointerup", up);
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
      <hr />
      <button className="tool" aria-label="Undo" title={`Undo (${p.modKey}Z)`} disabled={!p.canUndo} onClick={p.onUndo}>
        <ArrowCounterClockwise size={20} />
      </button>
      <button className="tool" aria-label="Redo" title={`Redo (${p.modKey}⇧Z)`} disabled={!p.canRedo} onClick={p.onRedo}>
        <ArrowClockwise size={20} />
      </button>
    </nav>
  );
}
