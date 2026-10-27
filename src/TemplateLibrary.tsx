// The template library beside the Ring strip (and the Template tool's): categories down the side, a search that looks
// in all of them and also finds structures by name or abbreviation (TREN, dppf, a name OPSIN reads), each one a
// template like the library's own, and each template drawn as it will look on the page. Click one to use it; pin it (or drag it onto
// the Ring strip) to keep it there; drag it onto the toolbar for a shortcut, or onto the canvas to place it. The
// user's own templates come first, in named sets (CD-33, as ChemDraw's template documents): New set adds one, a
// double-click on a set's name renames it, its × removes it (its templates go to My templates). In My templates and
// each set of the user's, Add (always the first tile) adds the selection, or the structure clicked next. A template
// of the user's is renamed by a double-click on its name or from its menu (right-click), which also moves and removes
// it; a built-in template's menu copies it into the user's sets. A template dragged onto a set's name moves there (a
// built-in one is copied), and a selection dragged from the canvas onto the open set or a set's name goes in it.
import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkSimple, Folders, FolderSimple, FolderSimplePlus, FolderSimpleUser, MagnifyingGlass, PencilSimple, Plus, PushPin, Trash, X } from "@phosphor-icons/react";
import { ContextMenu, type MenuItem } from "./Menu";
import { commonKey } from "./common";
import { measure, STYLE } from "./chem";
import { fontStack } from "./docstyle";
import { LIBRARY, type LibraryItem } from "./library";
import { arrowShapes, curvePath, isOrbital, render, shapeInk, shapePaths, type Arrow, type Label, type Mol } from "./render";
import { useLeaving } from "./motion";
import { MY_SET, ownId, templateKind } from "./templates";

// The tool a library is beside (the Ring tool's Templates row, or the Template tool): a template chosen or added there
// is that tool's.
export type TemplateTool = "ring" | "template";
// What the library does with the user's sets (Editor.tsx keeps them in Settings).
export type TemplateSetActions = { add: (name: string) => void; rename: (from: string, to: string) => void; remove: (name: string) => void; move: (id: string, set: string) => void };

// The sets a template can go in, as a sub-menu: My templates, then the user's own sets, then New set… (which names one
// first). key: each set's option; but: a set left out (the one the template is in).
export const setItems = (sets: string[], key: (set: string) => string, fresh: string, but?: string): MenuItem[][] => [
  [MY_SET, ...sets].filter((set) => set !== but).map((set) => ({ key: key(set), name: set, icon: set === MY_SET ? <FolderSimpleUser size={18} /> : <FolderSimple size={18} /> })),
  [{ key: fresh, name: "New set…", icon: <FolderSimplePlus size={18} /> }],
];

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

// The last library change shown (reveal's n): a library opened again later shows no name field.
let revealed = 0;
// A click on the name of a template of the user's waits this long for a second click, which renames it (ms).
const NAME_CLICK = 250;

// kept and onKeep: the pins that keep a template in the Ring strip (the panel beside that strip has them).
// mine: the user's own templates, each in its set (category). sets and onSets: the user's named sets.
// tool: the tool the library is beside; a template added here, or dropped here from the canvas, is that tool's.
// onAdd: Add in My templates or a set of the user's (the selection goes in, or a structure is picked next).
// reveal: a set to open on, and a template just added whose name is ready to type. onRename, onRemove: one of the
// user's templates. onCopy: a built-in template copied into a set of the user's. onNewSet: New set…, then what goes in.
// find: structures for what is searched, by name or abbreviation (TREN), each as a built-in template: Octet's own names
// that begin as typed and are drawn already (read false, at once), or all of them with the name as typed or its
// suggestion (read true, once typing pauses).
export function LibraryPanel(p: {
  current: string; kept?: string[]; dimmed?: boolean; mine?: LibraryItem[]; sets?: string[]; onSets?: TemplateSetActions;
  tool?: TemplateTool; reveal?: { set: string; id?: string; n: number }; find?: (query: string, read: boolean) => LibraryItem[];
  onAdd?: (set: string) => void; onRemove?: (kind: string) => void; onRename?: (id: string, name: string) => void;
  onCopy?: (kind: string, set: string) => void; onNewSet?: (then: (set: string) => void) => void;
  onChoose: (kind: string) => void; onKeep?: (kind: string, keep: boolean) => void; onPress: (e: React.PointerEvent, kind: string) => void;
}) {
  const own = useMemo(() => [MY_SET, ...(p.sets ?? [])].map((name) => ({ name, items: (p.mine ?? []).filter((t) => t.category === name), own: true })), [p.mine, p.sets]);
  const categories = useMemo(() => [...own.filter((c) => c.items.length || p.onSets), ...LIBRARY.map((c) => ({ ...c, own: false }))], [own, p.onSets]);
  const fresh = p.reveal && p.reveal.n !== revealed ? p.reveal : undefined;
  // It opens on the set a template was just added to, or on the category of the template in hand.
  const [category, setCategory] = useState(() => fresh?.set ?? categories.find((c) => c.items.some((t) => t.kind === p.current))?.name ?? categories[0].name);
  const [query, setQuery] = useState(""), leaving = useLeaving();
  // A set's name being typed: a new set ("" until it has one), or one being renamed.
  const [naming, setNaming] = useState<{ from?: string; value: string }>();
  // The template whose name is being typed, and the template whose menu is open (at the pointer, or under the
  // template when a key opened it).
  const [editing, setEditing] = useState(() => (fresh?.id ? templateKind(fresh.id) : undefined));
  const [menu, setMenu] = useState<{ kind: string; at: { x: number; y: number }; keyboard?: boolean }>();
  useEffect(() => {
    if (!fresh) return;
    revealed = fresh.n;
    setCategory(fresh.set);
    setQuery("");
    setEditing(fresh.id ? templateKind(fresh.id) : undefined);
  }, [fresh?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // A template being dragged, to drop on a set's name: one of the user's moves there, a built-in one is copied there.
  const carried = useRef<string>(undefined), [dragging, setDragging] = useState(false);
  useEffect(() => {
    const up = () => { setDragging(false); setTimeout(() => (carried.current = undefined)); };
    addEventListener("pointerup", up);
    return () => removeEventListener("pointerup", up);
  }, []);
  const grid = useRef<HTMLDivElement>(null), timer = useRef<number>(undefined), refocus = useRef<string>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // A name typed with the keyboard gives the focus back to its template.
  useEffect(() => {
    if (editing || !refocus.current) return;
    grid.current?.querySelector<HTMLElement>(`[data-kind="${CSS.escape(refocus.current)}"]`)?.focus();
    refocus.current = undefined;
  }, [editing]);
  const open = categories.find((c) => c.name === category) ?? categories[0];
  // Structures found by name: the ones already drawn at once, all of them once typing pauses (drawing takes a moment).
  const typed = query.trim();
  const quick = useMemo(() => (typed && p.find ? p.find(typed, false) : []), [typed, p.find]);
  const [read, setRead] = useState<{ typed: string; items: LibraryItem[] }>();
  useEffect(() => {
    if (!typed || !p.find) return;
    const t = setTimeout(() => setRead({ typed, items: p.find!(typed, true) }), 150);
    return () => clearTimeout(t);
  }, [typed, p.find]);
  const named = read?.typed === typed ? read.items : quick;
  // The library's templates whose name, category or other words have what is typed in them, then the structures found by
  // name (the library's own template where it has one by that name, as P(t-Bu)3 for P(tBu)3); the one named exactly as
  // typed first.
  const shown = useMemo(() => {
    const q = typed.toLowerCase();
    if (!q) return open.items;
    const all = categories.flatMap((c) => c.items);
    const found = all.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || !!t.also?.toLowerCase().includes(q));
    for (const t of named) {
      const item = all.find((x) => commonKey(x.name) === commonKey(t.name)) ?? t;
      if (!found.some((x) => x.kind === item.kind || commonKey(x.name) === commonKey(item.name))) found.push(item);
    }
    const exact = (t: LibraryItem) => commonKey(t.name) === commonKey(typed);
    return [...found.filter(exact), ...found.filter((t) => !exact(t))];
  }, [open, typed, categories, named]);
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
  // Where a canvas selection dragged here goes (the Editor reads these as it is let go): the open set of the user's,
  // or one of their sets' names.
  const drop = (set: string) => (p.onSets && p.tool ? { "data-drop-set": set, "data-drop-tool": p.tool } : {});
  // A template's menu: Rename, Move to and Remove for the user's own; Add to templates (a copy) and the Ring menu pin
  // for a built-in one.
  const item = menu && [...categories.flatMap((c) => c.items), ...named].find((t) => t.kind === menu.kind), id = menu && ownId(menu.kind);
  const kept = !!item && !!p.kept?.includes(item.kind);
  const menuGroups: MenuItem[][] = !item ? [] : id ? [
    [...(p.onRename ? [{ key: "rename", name: "Rename", icon: <PencilSimple size={18} /> }] : []), ...(p.onSets ? [{ key: "move", name: "Move to", icon: <Folders size={18} />, more: true }] : [])],
    p.onRemove ? [{ key: "remove", name: "Remove", icon: <Trash size={18} /> }] : [],
  ] : [[
    ...(p.onCopy && p.onSets ? [{ key: "copy", name: "Add to templates", icon: <BookmarkSimple size={18} />, more: true }] : []),
    ...(p.onKeep ? [{ key: "keep", name: "Keep in the Ring menu", icon: <PushPin size={18} />, checked: kept }] : []),
  ]];
  const menuSub = (key: string) => (key === "move" ? { label: "Move to", groups: setItems(p.sets ?? [], (s) => `move:${s}`, "move.new", item?.category) }
    : key === "copy" ? { label: "Add to templates", groups: setItems(p.sets ?? [], (s) => `copy:${s}`, "copy.new") } : undefined);
  const menuChoose = (key: string) => {
    if (!item) return;
    if (key === "rename") return setEditing(item.kind);
    if (key === "remove") return p.onRemove?.(item.kind);
    if (key === "keep") return p.onKeep?.(item.kind, !kept);
    if (key.startsWith("move:") && id) return p.onSets?.move(id, key.slice(5));
    if (key.startsWith("copy:")) return p.onCopy?.(item.kind, key.slice(5));
    if (key === "move.new" && id) return p.onNewSet?.((set) => p.onSets?.move(id, set));
    if (key === "copy.new") return p.onNewSet?.((set) => p.onCopy?.(item.kind, set));
  };
  // A click on a name of the user's waits for a second one (a double-click renames it); a click elsewhere chooses at once.
  const onName = (e: React.MouseEvent) => !!(e.target as Element).closest(".library-name");
  return (
    <div className={["library", p.dimmed && "carrying", dragging && "dragging", leaving && "leaving"].filter(Boolean).join(" ")} role="dialog" aria-label="Templates" inert={leaving}>
      <div className="library-side">
        <label className="library-search">
          <MagnifyingGlass size={16} aria-hidden />
          <input placeholder="Search" aria-label="Search templates" spellCheck={false} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && query) { e.stopPropagation(); setQuery(""); } }} />
        </label>
        {categories.map((c, k) => (
          <div key={c.name} className={c.own && !categories[k + 1]?.own && p.onSets ? "library-set last" : "library-set"}>
            {naming?.from === c.name ? nameField : (
              <button className="library-category" aria-pressed={!query && category === c.name} onClick={() => { setCategory(c.name); setQuery(""); }} {...(c.own ? drop(c.name) : {})}
                onDoubleClick={() => { if (c.own && c.name !== MY_SET && p.onSets) setNaming({ from: c.name, value: c.name }); }}
                onPointerUp={() => {
                  const kind = carried.current, id = kind && ownId(kind);
                  if (!kind || !c.own || !p.onSets) return;
                  if (id) p.onSets.move(id, c.name); else p.onCopy?.(kind, c.name);
                }}>
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
      <div ref={grid} className="library-grid" role="menu" aria-label={query ? "Results" : category} {...(!query && open.own ? drop(open.name) : {})}>
        {!query && open.own && p.onAdd && (
          <div className="library-cell">
            <button role="menuitem" className="library-item library-add" aria-label={`Add a structure to ${open.name}`} onClick={() => p.onAdd!(open.name)}>
              <span className="library-add-mark" aria-hidden><Plus size={20} /></span>
              <span className="library-name">Add</span>
            </button>
          </div>
        )}
        {shown.map((t) => {
          const kept = !!p.kept?.includes(t.kind), mine = !!ownId(t.kind);
          if (editing === t.kind) return (
            <div key={t.kind} className="library-cell">
              <div className="library-item editing">
                <Thumb item={t} />
                <input className="library-rename" aria-label="Template name" autoFocus defaultValue={t.name} maxLength={80} spellCheck={false} onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== "Escape") return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.key === "Escape") e.currentTarget.value = t.name;
                    refocus.current = t.kind;
                    e.currentTarget.blur();
                  }}
                  onBlur={(e) => { setEditing(undefined); p.onRename?.(ownId(t.kind)!, e.target.value); }} />
              </div>
            </div>
          );
          return (
            <div key={t.kind} className="library-cell">
              <button role="menuitemradio" aria-checked={p.current === t.kind} className="library-item" data-tip={t.name} data-tip-cut data-kind={t.kind}
                onPointerDown={(e) => { if (e.button === 0) { carried.current = t.kind; setDragging(true); } p.onPress(e, t.kind); }}
                onClick={(e) => {
                  clearTimeout(timer.current);
                  if (mine && p.onRename && onName(e)) timer.current = window.setTimeout(() => p.onChoose(t.kind), NAME_CLICK);
                  else p.onChoose(t.kind);
                }}
                onDoubleClick={(e) => { if (mine && p.onRename && onName(e)) { clearTimeout(timer.current); setEditing(t.kind); } }}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ kind: t.kind, at: { x: e.clientX, y: e.clientY } }); }}
                onKeyDown={(e) => {
                  if (e.key !== "ContextMenu" && !(e.key === "F10" && e.shiftKey)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenu({ kind: t.kind, at: { x: r.left + r.width / 2, y: r.bottom - 8 }, keyboard: true });
                }}>
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
        {!shown.length && query && <p className="library-none">No template called “{query.trim()}”. Type its name in the Ring list to add it.</p>}
      </div>
      {menu && item && (
        <ContextMenu label={item.name} at={menu.at} keyboard={menu.keyboard} groups={menuGroups} sub={menuSub} onChoose={menuChoose}
          onClose={() => { const k = menu.kind; setMenu(undefined); if (menu.keyboard) grid.current?.querySelector<HTMLElement>(`[data-kind="${CSS.escape(k)}"]`)?.focus(); }} />
      )}
    </div>
  );
}
