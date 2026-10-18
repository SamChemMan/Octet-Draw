// The template library beside the Ring strip: categories down the side, a search that looks in all of them, and
// each template drawn as it will look on the page. Click one to use it; pin it (or drag it onto the Ring strip) to
// keep it there; drag it onto the toolbar for a shortcut. The user's own templates come first, in named sets (CD-33,
// as ChemDraw's template documents): New set adds one, a double-click on a set's name renames it, its × removes it
// (its templates go to My templates), and a template dragged onto a set's name moves there.
import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass, Plus, PushPin, X } from "@phosphor-icons/react";
import { measure, STYLE } from "./chem";
import { fontStack } from "./docstyle";
import { LIBRARY, type LibraryItem } from "./library";
import { arrowShapes, curvePath, isOrbital, render, shapeInk, shapePaths, type Arrow, type Label, type Mol } from "./render";
import { useLeaving } from "./motion";
import { MY_SET } from "./templates";

// What the library does with the user's sets (Editor.tsx keeps them in Settings).
export type TemplateSetActions = { add: (name: string) => void; rename: (from: string, to: string) => void; remove: (name: string) => void; move: (id: string, set: string) => void };

const toPath = (polys: [number, number][][]) => polys.map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z").join("");
// Thumbnails are drawn once. Small structures keep their size (the view is at least five bonds across); big ones shrink to fit.
const thumbs = new Map<string, { d: string; fills: { d: string; colour?: string }[]; labels: Label[]; view: string }>();
const Thumb = ({ item }: { item: LibraryItem }) => <StructureThumb id={item.kind} mol={item.mol} />;
// Any structure as a thumbnail, drawn once per id.
// A template's arrows, pen curves and shapes show as they draw on the page (a closed curve's fill behind the lines),
// a highlight as its edge, an orbital as its axis, and its text as its words.
export function StructureThumb({ id, mol }: { id: string; mol: Mol }) {
  let t = thumbs.get(id);
  if (!t) {
    const L = STYLE.bond, drawing = render(mol, STYLE, measure, L), at = (q: [number, number]) => [q[0] * L, -q[1] * L];
    const filled = (a: Arrow) => !!(a.curve?.closed && a.fill), arrows = mol.arrows ?? [];
    const ink = [...arrows.filter((a) => !filled(a)).flatMap((a) => (isOrbital(a) ? [[at(a.from), at(a.to)] as [number, number][]] : arrowShapes(a, STYLE, L))), ...(mol.shapes ?? []).flatMap((x) => (x.kind === "highlight" ? shapePaths(x, L) : shapeInk(x, STYLE, L)))];
    const fills = arrows.filter(filled).map((a) => curvePath(a.curve!, L));
    const words: Label[] = (mol.captions ?? []).filter((c) => !c.under && !c.on).map((c) => { const [x, y] = at([c.x, c.y]); return { text: c.text, x, y, size: (c.size ?? 10) * (4 / 3) }; });
    const points = [...ink, ...fills].flat(), xs = [...points.map((q) => q[0]), ...words.map((w) => w.x)], ys = [...points.map((q) => q[1]), ...words.map((w) => w.y)];
    const [x0, y0, x1, y1] = mol.atoms.length || !xs.length ? [Math.min(drawing.box[0], ...xs), Math.min(drawing.box[1], ...ys), Math.max(drawing.box[2], ...xs), Math.max(drawing.box[3], ...ys)] : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const side = Math.max(x1 - x0, y1 - y0, 5 * L), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    t = { d: toPath([...drawing.polygons, ...ink]), fills: arrows.filter(filled).map((a, k) => ({ d: toPath([fills[k]]), colour: a.colour })), labels: [...drawing.labels, ...words], view: `${cx - side / 2} ${cy - side / 2} ${side} ${side}` };
    thumbs.set(id, t);
  }
  return (
    <svg className="thumb" viewBox={t.view} aria-hidden>
      {t.fills.map((f, i) => <path key={i} d={f.d} fill={f.colour ?? "currentColor"} />)}
      <path d={t.d} fill="currentColor" stroke="currentColor" strokeWidth={STYLE.line} />
      {t.labels.map((l, i) => <text key={i} x={l.x} y={l.y} fill="currentColor" style={{ font: `${l.size}px ${fontStack("Arial")}` }}>{l.text}</text>)}
    </svg>
  );
}

// kept and onKeep: the pins that keep a template in the Ring strip (the panel beside that strip has them).
// mine: the user's own templates, each in its set (category). sets and onSets: the user's named sets.
// onAddSelection: adds the selection to a set (there is a selection). onRemove: removes one of the user's templates.
export function LibraryPanel(p: {
  current: string; kept?: string[]; dimmed?: boolean; mine?: LibraryItem[]; sets?: string[]; onSets?: TemplateSetActions;
  onAddSelection?: (set: string) => void; onRemove?: (kind: string) => void;
  onChoose: (kind: string) => void; onKeep?: (kind: string, keep: boolean) => void; onPress: (e: React.PointerEvent, kind: string) => void;
}) {
  const own = useMemo(() => [MY_SET, ...(p.sets ?? [])].map((name) => ({ name, items: (p.mine ?? []).filter((t) => t.category === name), own: true })), [p.mine, p.sets]);
  const categories = useMemo(() => [...own.filter((c) => c.items.length || p.onSets), ...LIBRARY.map((c) => ({ ...c, own: false }))], [own, p.onSets]);
  // It opens on the category of the template in hand.
  const [category, setCategory] = useState(() => categories.find((c) => c.items.some((t) => t.kind === p.current))?.name ?? categories[0].name);
  const [query, setQuery] = useState(""), leaving = useLeaving();
  // A set's name being typed: a new set ("" until it has one), or one being renamed.
  const [naming, setNaming] = useState<{ from?: string; value: string }>();
  // A template of the user's being dragged, to drop on a set's name.
  const carried = useRef<string>(undefined);
  useEffect(() => { const up = () => setTimeout(() => (carried.current = undefined)); addEventListener("pointerup", up); return () => removeEventListener("pointerup", up); }, []);
  const open = categories.find((c) => c.name === category) ?? categories[0];
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? categories.flatMap((c) => c.items).filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || !!t.also?.toLowerCase().includes(q)) : open.items;
  }, [open, query, categories]);
  const done = (keep: boolean) => {
    const n = naming;
    setNaming(undefined);
    if (!keep || !n || !n.value.trim()) return;
    if (n.from) p.onSets?.rename(n.from, n.value); else p.onSets?.add(n.value);
    setCategory(n.value.trim().slice(0, 40));
  };
  const nameField = (
    <input className="library-set-name" autoFocus aria-label="Set name" placeholder="Set name" spellCheck={false} value={naming?.value ?? ""} maxLength={40}
      onChange={(e) => setNaming({ ...naming, value: e.target.value })} onBlur={() => done(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(e.key === "Enter"); } }} />
  );
  return (
    <div className={["library", p.dimmed && "carrying", leaving && "leaving"].filter(Boolean).join(" ")} role="dialog" aria-label="Templates" inert={leaving}>
      <div className="library-side">
        <label className="library-search">
          <MagnifyingGlass size={16} aria-hidden />
          <input placeholder="Search" aria-label="Search templates" spellCheck={false} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && query) { e.stopPropagation(); setQuery(""); } }} />
        </label>
        {categories.map((c, k) => (
          <div key={c.name} className={c.own && !categories[k + 1]?.own && p.onSets ? "library-set last" : "library-set"}>
            {naming?.from === c.name ? nameField : (
              <button className="library-category" aria-pressed={!query && category === c.name} onClick={() => { setCategory(c.name); setQuery(""); }}
                onDoubleClick={() => { if (c.own && c.name !== MY_SET && p.onSets) setNaming({ from: c.name, value: c.name }); }}
                onPointerUp={() => { const kind = carried.current; if (kind && c.own && p.onSets) p.onSets.move(kind.replace(/^custom:/, ""), c.name); }}>
                {c.name}<span>{c.items.length}</span>
              </button>
            )}
            {c.own && c.name !== MY_SET && p.onSets && naming?.from !== c.name && (
              <button className="variant-action" aria-label={`Remove the set ${c.name}`} data-tip="Remove the set" onClick={() => { p.onSets!.remove(c.name); if (category === c.name) setCategory(MY_SET); }}>
                <X size={12} />
              </button>
            )}
            {c.own && !categories[k + 1]?.own && p.onSets && (naming && !naming.from ? nameField : (
              <button className="library-category library-new" onClick={() => setNaming({ value: "" })}><Plus size={12} aria-hidden />New set</button>
            ))}
          </div>
        ))}
      </div>
      <div className="library-grid" role="menu" aria-label={query ? "Results" : category}>
        {shown.map((t) => {
          const kept = !!p.kept?.includes(t.kind), mine = t.kind.startsWith("custom:");
          return (
            <div key={t.kind} className="library-cell">
              <button role="menuitemradio" aria-checked={p.current === t.kind} className="library-item" data-tip={t.name} data-tip-cut
                onPointerDown={(e) => { if (mine) carried.current = t.kind; p.onPress(e, t.kind); }} onClick={() => p.onChoose(t.kind)}>
                <Thumb item={t} />
                <span className="library-name">{t.name}</span>
              </button>
              {mine && p.onRemove ? (
                <button className="variant-action" aria-label={`Remove ${t.name}`} data-tip="Remove" onClick={() => p.onRemove!(t.kind)}>
                  <X size={12} />
                </button>
              ) : p.onKeep && !mine && (
                <button className="variant-action" aria-pressed={kept} aria-label={`Keep ${t.name} in the Ring menu`} data-tip={kept ? "In the Ring menu" : "Keep in the Ring menu"} onClick={() => p.onKeep!(t.kind, !kept)}>
                  <PushPin size={12} />
                </button>
              )}
            </div>
          );
        })}
        {!query && open.own && p.onAddSelection && (
          <div className="library-cell">
            <button className="library-item library-add" onClick={() => p.onAddSelection!(open.name)}>
              <Plus size={20} aria-hidden />
              <span className="library-name">Add selection</span>
            </button>
          </div>
        )}
        {!shown.length && query && <p className="library-none">No template called “{query.trim()}”. Type its name in the Ring list to add it.</p>}
      </div>
    </div>
  );
}
