// The template library beside the Ring strip: categories down the side, a search that looks in all of them, and
// each template drawn as it will look on the page. Click one to use it; pin it (or drag it onto the Ring strip) to
// keep it there; drag it onto the toolbar for a shortcut.
import { useMemo, useState } from "react";
import { MagnifyingGlass, PushPin } from "@phosphor-icons/react";
import { measure, STYLE } from "./chem";
import { fontStack } from "./docstyle";
import { LIBRARY, type LibraryItem } from "./library";
import { render, type Label, type Mol } from "./render";
import { useLeaving } from "./motion";

const toPath = (polys: [number, number][][]) => polys.map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z").join("");
// Thumbnails are drawn once. Small structures keep their size (the view is at least five bonds across); big ones shrink to fit.
const thumbs = new Map<string, { d: string; labels: Label[]; view: string }>();
const Thumb = ({ item }: { item: LibraryItem }) => <StructureThumb id={item.kind} mol={item.mol} />;
// Any structure as a thumbnail, drawn once per id.
export function StructureThumb({ id, mol }: { id: string; mol: Mol }) {
  let t = thumbs.get(id);
  if (!t) {
    const drawing = render(mol, STYLE, measure, STYLE.bond), [x0, y0, x1, y1] = drawing.box;
    const side = Math.max(x1 - x0, y1 - y0, 5 * STYLE.bond), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    t = { d: toPath(drawing.polygons), labels: drawing.labels, view: `${cx - side / 2} ${cy - side / 2} ${side} ${side}` };
    thumbs.set(id, t);
  }
  return (
    <svg className="thumb" viewBox={t.view} aria-hidden>
      <path d={t.d} fill="currentColor" />
      {t.labels.map((l, i) => <text key={i} x={l.x} y={l.y} fill="currentColor" style={{ font: `${l.size}px ${fontStack("Arial")}` }}>{l.text}</text>)}
    </svg>
  );
}

// kept and onKeep: the pins that keep a template in the Ring strip (the panel beside that strip has them).
// mine: the user's own templates, as a first category.
export function LibraryPanel(p: {
  current: string; kept?: string[]; dimmed?: boolean; mine?: LibraryItem[];
  onChoose: (kind: string) => void; onKeep?: (kind: string, keep: boolean) => void; onPress: (e: React.PointerEvent, kind: string) => void;
}) {
  const categories = useMemo(() => (p.mine?.length ? [{ name: "My templates", items: p.mine }, ...LIBRARY] : LIBRARY), [p.mine]);
  // It opens on the category of the template in hand.
  const [category, setCategory] = useState(() => categories.find((c) => c.items.some((t) => t.kind === p.current))?.name ?? categories[0].name);
  const [query, setQuery] = useState(""), leaving = useLeaving();
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? categories.flatMap((c) => c.items).filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) : (categories.find((c) => c.name === category) ?? categories[0]).items;
  }, [category, query, categories]);
  return (
    <div className={["library", p.dimmed && "carrying", leaving && "leaving"].filter(Boolean).join(" ")} role="dialog" aria-label="Templates" inert={leaving}>
      <div className="library-side">
        <label className="library-search">
          <MagnifyingGlass size={16} aria-hidden />
          <input placeholder="Search" aria-label="Search templates" spellCheck={false} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && query) { e.stopPropagation(); setQuery(""); } }} />
        </label>
        {categories.map((c) => (
          <button key={c.name} className="library-category" aria-pressed={!query && category === c.name} onClick={() => { setCategory(c.name); setQuery(""); }}>
            {c.name}<span>{c.items.length}</span>
          </button>
        ))}
      </div>
      <div className="library-grid" role="menu" aria-label={query ? "Results" : category}>
        {shown.map((t) => {
          const kept = !!p.kept?.includes(t.kind);
          return (
            <div key={t.kind} className="library-cell">
              <button role="menuitemradio" aria-checked={p.current === t.kind} className="library-item" data-tip={t.name} data-tip-cut
                onPointerDown={(e) => p.onPress(e, t.kind)} onClick={() => p.onChoose(t.kind)}>
                <Thumb item={t} />
                <span className="library-name">{t.name}</span>
              </button>
              {p.onKeep && (
                <button className="variant-action" aria-pressed={kept} aria-label={`Keep ${t.name} in the Ring menu`} data-tip={kept ? "In the Ring menu" : "Keep in the Ring menu"} onClick={() => p.onKeep!(t.kind, !kept)}>
                  <PushPin size={12} />
                </button>
              )}
            </div>
          );
        })}
        {!shown.length && <p className="library-none">No template called “{query.trim()}”. Type its name in the Ring list to add it.</p>}
      </div>
    </div>
  );
}
