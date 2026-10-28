// Home (decision 0003): where Octet opens. The lockup, a greeting by name and time of day, then four sections, each
// under its own heading and hairline: New (Quick start: a seamless canvas with no page, focused when Home opens, so
// Return starts it), Templates beside it (purposes, IDEA-SIZE-1: Paper, Thesis, Slides and Poster, then the user's
// own, then Custom template), Recent (the recent drawings as pictures, or three example drawings before there are any,
// with Open), and Projects. One click starts or opens a drawing. On first launch Home asks the user's name first, in
// the dotted frame a selected group gets. Nothing here needs an account.
// A project is a list in Octet that points at drawings, as an album in Photos does (src/projects.ts). A drawing goes in
// by a drag onto the project, by Add to Project in its menu, or by a drop of files from Finder; the project opens in
// Home's place, with Home to go back. Each tile has a right-click menu (the Menu key and Shift+F10 open it too), and a
// drawing or project can have a thumbnail of the user's own.
// Keys: the arrow keys move between tiles, across sections. Tab goes from section to section (one stop each, the tile
// last focused there), and each section is a region named by its heading, for screen readers.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowCounterClockwise, ArrowLeft, DotsThree, FilePlus, FolderOpen, FolderPlus, FolderSimple, FolderSimpleMinus, FolderSimplePlus, ImageSquare,
  MagnifyingGlass, MinusCircle, PencilSimple, Plus, Trash, X,
} from "@phosphor-icons/react";
import { QUICK, outlines, type DocStyle, type PurposeKind } from "./docstyle";
import mark from "../brand/logos/octet-mark.svg";
import markSmall from "../brand/logos/octet-mark-small.svg";
import markWhite from "../brand/logos/octet-mark-white.svg";
import lockup from "../brand/logos/octet-lockup.svg";
import lockupWhite from "../brand/logos/octet-lockup-white.svg";
import { Dialog, useModal } from "./Dialog";
import { tileTo } from "./keys";
import { ContextMenu, menuAt, menuKey, type MenuItem } from "./Menu";
import { Exit } from "./motion";
import { mosaic, projectOf, UNTITLED, type Project } from "./projects";
import type { HomeLibrary, TilePicture } from "./homeLibrary";
import { STARTERS } from "./starters";

export type RecentEntry = { path: string; name: string; at: number; thumb?: string; found: boolean };
// A drawing a crash took, kept with its unsaved changes (src-tauri/src/recovery.rs).
export type RecoveredEntry = { id: string; name: string; at: number };

// The greeting: welcome on the first visit, welcome back after a week away, else by the time of day.
export function greeting(name: string, now: Date, first: boolean, away: number): string {
  const n = name ? `, ${name}` : "";
  if (first) return `Welcome to Octet${n}.`;
  if (away > 7 * 24 * 3600 * 1000) return `Welcome back${n}.`;
  const h = now.getHours(), friday = now.getDay() === 5;
  if (h >= 5 && h < 12) return `Good morning${n}.`;
  if (h >= 12 && h < 17) return friday ? `Happy Friday${n}.` : `Good afternoon${n}.`;
  if (h >= 17 && h < 22) return `Good evening${n}.`;
  return name ? `Working late, ${name}?` : "Working late?";
}

// When a drawing was last opened or saved: today and yesterday with the time, this week by day, else the date.
function when(at: number, now: Date): string {
  const d = new Date(at * 1000), day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000), time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days > 1 && days < 7) return d.toLocaleDateString("en-GB", { weekday: "long" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

// The mark (brand/logos/README.md): the small-size file under 20 px, the exact mark above; white on the dark navy.
function Mark({ size }: { size: number }) {
  return (
    <picture>
      <source srcSet={markWhite} media="(prefers-color-scheme: dark)" />
      <img src={size < 20 ? markSmall : mark} alt="" width={size} height={size} draggable={false} />
    </picture>
  );
}

// A purpose's page as a picture: the page and its outlines, with a small scheme (two rings and an arrow) at its true
// size on that page, so each tile shows how big a structure is on it.
export function PurposePicture({ style, kind }: { style: DocStyle; kind: PurposeKind }) {
  const all = outlines(style, kind), w = Math.max(...all.map((o) => o[1])), h = Math.max(...all.map((o) => o[2]));
  const b = (style.bond * 25.4) / 72, r = (Math.sqrt(3) / 2) * b; // bond length (mm); a ring's half width
  const ring = (cx: number) => `M${[0, 1, 2, 3, 4, 5].map((k) => `${cx + b * Math.sin((k * Math.PI) / 3)} ${-b * Math.cos((k * Math.PI) / 3)}`).join("L")}Z`;
  const gap = 0.6 * b, arrow = 2.4 * b, half = r + gap + arrow / 2;
  return (
    <svg viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} aria-hidden>
      {all.map(([name, ow, oh], k) => <rect key={name} className={k ? "guide" : "sheet"} x={-ow / 2} y={-oh / 2} width={ow} height={oh} vectorEffect="non-scaling-stroke" />)}
      <path className="scheme" d={`${ring(-half - r)}${ring(half + r)}M${-arrow / 2} 0H${arrow / 2}M${arrow / 2 - 0.35 * b} ${-0.2 * b}L${arrow / 2} 0L${arrow / 2 - 0.35 * b} ${0.2 * b}`} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Quick start's picture: an open canvas. The canvas fills the tile to its edges, with faint dots that go past them, and
// the scheme the templates show sits in the middle, clear of the dots. No page, so no edge.
function QuickPicture() {
  const b = 9, r = (Math.sqrt(3) / 2) * b, ring = (cx: number) => `M${[0, 1, 2, 3, 4, 5].map((k) => `${cx + b * Math.sin((k * Math.PI) / 3)} ${60 - b * Math.cos((k * Math.PI) / 3)}`).join("L")}Z`;
  const gap = 0.6 * b, arrow = 2.4 * b, half = r + gap + arrow / 2, w = half + 2 * r + 8;
  return (
    <svg className="quick-picture" viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="quick-dots" width="12" height="12" patternUnits="userSpaceOnUse" x="2"><circle cx="6" cy="6" r="0.8" /></pattern>
        <mask id="quick-clear"><rect width="160" height="120" fill="#fff" /><rect x={80 - w} y={60 - b - 8} width={2 * w} height={2 * b + 16} rx="8" fill="#000" /></mask>
      </defs>
      <rect width="160" height="120" fill="url(#quick-dots)" mask="url(#quick-clear)" />
      <path className="scheme" d={`${ring(80 - half - r)}${ring(80 + half + r)}M${80 - arrow / 2} 60H${80 + arrow / 2}M${80 + arrow / 2 - 0.35 * b} ${60 - 0.2 * b}L${80 + arrow / 2} 60L${80 + arrow / 2 - 0.35 * b} ${60 + 0.2 * b}`} />
    </svg>
  );
}

// A drawing's picture in its tile: the white page with the drawing on it (export.ts draws it in the light theme), a
// photo of the user's own across the whole tile, or, with no picture, the drawing's first letter in the theme's colours.
function DrawingPicture({ name, picture }: { name: string; picture?: TilePicture }) {
  return (
    <span className="home-thumb" data-theme={picture ? "light" : undefined}>
      {picture ? <img className={picture.fill ? "fill" : undefined} src={picture.src} alt="" draggable={false} /> : <span className="home-initial" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

// A project's picture: its own thumbnail, else a mosaic of its first drawings (one, two side by side, or up to four),
// else an empty folder. Behind it, the edge of a second sheet: a project holds more than one drawing.
function ProjectPicture({ thumb, cells }: { thumb?: string; cells: TilePicture[] }) {
  if (thumb) return <span className="home-thumb stack" data-theme="light"><img className="fill" src={thumb} alt="" draggable={false} /></span>;
  if (!cells.length) return <span className="home-thumb stack empty"><FolderSimple size={20} aria-hidden /></span>;
  return (
    <span className={`home-thumb stack mosaic n${cells.length}`} data-theme="light">
      {cells.map((c, k) => <span key={k} className="cell"><img className={c.fill ? "fill" : undefined} src={c.src} alt="" draggable={false} /></span>)}
    </span>
  );
}

// A section of Home: its heading (and an action beside it), then its tiles.
function Section({ id, title, action, className, children }: { id: string; title: string; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`home-section${className ? ` ${className}` : ""}`} data-section={id} aria-labelledby={`${id}-title`}>
      <div className="home-row">
        <h2 id={`${id}-title`}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export type PurposeTile = { id: string; name: string; kind: PurposeKind; style: DocStyle; own?: boolean };
type Props = {
  leaving?: boolean; // fading out as a drawing opens
  name: string; first: boolean; away: number; recents: RecentEntry[]; newKey: string; openKey?: string;
  recovered: RecoveredEntry[]; onRecovered: (r: RecoveredEntry) => void; onDiscard: (r: RecoveredEntry) => void;
  purposes: PurposeTile[]; // the templates: Octet's, then the user's own
  onNew: (purpose: string) => void; onOpen: () => void; onRecent: (r: { path: string }) => void; onRemove: (r: RecentEntry) => void;
  onRemovePurpose: (purpose: string) => void;
  onCustom?: () => void; // makes a template of the user's own; unset when they have as many as Octet keeps
  onStarter: (text: string) => void; // opens an example drawing as a new drawing
  lib: HomeLibrary; // the projects and thumbnails
  drops?: boolean; // files from Finder can be dropped on a project (the app; not the UI-only preview)
};

// What a right-click menu is for.
type MenuFor = { at: { x: number; y: number }; keyboard?: boolean } & (
  | { kind: "drawing"; path: string; name: string; found: boolean; recent?: RecentEntry; project?: string }
  | { kind: "project"; id: string }
  | { kind: "purpose"; id: string; name: string; own?: boolean }
  | { kind: "recovered"; entry: RecoveredEntry }
  | { kind: "starter"; text: string; name: string }
);

// The first time Home shows (not when a drawing closes back to it), its tiles arrive one after another (FEEL-44): the
// first eight a step apart, the rest with the eighth.
let arrived = false;
const arrive = (k: number) => ({ "--i": Math.min(k, 7) }) as React.CSSProperties;
const drawings = (n: number) => `${n} ${n === 1 ? "drawing" : "drawings"}`;

export function Home(p: Props) {
  const grid = useRef<HTMLDivElement>(null), page = useRef<HTMLElement>(null), now = new Date(), lib = p.lib;
  const [first] = useState(() => !arrived);
  useEffect(() => { arrived = true; }, []);
  const [menu, setMenu] = useState<MenuFor>();
  // A project being named: a new one (with the drawings it takes when it is made), or one being renamed.
  const [naming, setNaming] = useState<{ id?: string; value: string; then?: { path: string; name?: string }[] }>();
  const [deleting, setDeleting] = useState<Project>();
  const open = projectOf(lib.store, lib.open);
  const n = 1 + p.purposes.length + (p.onCustom ? 1 : 0); // the New tiles: Quick start, the templates, Custom template
  // Home covers the editor, which takes no keys or clicks until Home goes.
  useModal(page, !p.leaving);

  // One Tab stop for each section (roving): the tile last focused there, else its first. The arrow keys go to the rest.
  const roving = useRef<Record<string, string>>({});
  const rove = () => {
    for (const section of page.current?.querySelectorAll<HTMLElement>("[data-section]") ?? []) {
      const tiles = [...section.querySelectorAll<HTMLElement>("button.home-tile")], stop = tiles.find((t) => t.dataset.key === roving.current[section.dataset.section!]) ?? tiles[0];
      for (const t of tiles) t.tabIndex = t === stop ? 0 : -1;
    }
  };
  useLayoutEffect(rove);
  const focused = (e: React.FocusEvent) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>(".home-tile"), section = tile?.closest<HTMLElement>("[data-section]");
    if (!tile || !section) return;
    roving.current[section.dataset.section!] = tile.dataset.key!;
    rove();
  };

  // Return starts Quick start (as decision 0003 asks) unless a tile or a button has the focus; arrow keys move between
  // tiles, up and down to the nearest tile in the row there (tileTo). Escape goes back from a project. A dialog over
  // Home (Save changes) makes Home inert and keeps the keys.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (p.leaving || page.current?.inert || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || menu || deleting) return;
      if (e.target instanceof HTMLInputElement) return;
      const tiles = [...(grid.current?.querySelectorAll<HTMLElement>("button.home-tile") ?? [])], at = tiles.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Enter" && at < 0 && !(document.activeElement instanceof HTMLButtonElement)) { e.preventDefault(); p.onNew(QUICK); return; }
      if (e.key === "Escape" && open) { e.preventDefault(); back(); return; }
      const to = tileTo(e.key, at, tiles.map((t) => t.getBoundingClientRect()));
      if (to !== undefined) { e.preventDefault(); tiles[to].focus(); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  // Going back from a project focuses its tile, so the keyboard carries on from there.
  const back = () => {
    const id = lib.open;
    lib.setOpen(undefined);
    requestAnimationFrame(() => page.current?.querySelector<HTMLElement>(`.home-tile[data-key="project:${CSS.escape(id ?? "")}"]`)?.focus());
  };
  const openProject = (id: string) => {
    lib.setOpen(id);
    page.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() => page.current?.querySelector<HTMLElement>("[data-section='project'] .home-tile")?.focus());
  };

  // The project under a point, tinted as the template library tints where a drop goes (data-over).
  const over = useRef<HTMLElement | null>(null);
  const mark = (el: HTMLElement | null) => {
    if (el === over.current) return;
    over.current?.removeAttribute("data-over");
    el?.setAttribute("data-over", "");
    over.current = el;
  };
  const projectAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-project]") ?? null;
  // Files from Finder over the window (the app sends where the pointer is): the project under them is tinted, and
  // the one they are let go on is where they go (Editor's takeOpened reads it).
  useEffect(() => {
    if (!p.drops) return;
    const scale = /Windows/.test(navigator.userAgent) ? devicePixelRatio : 1; // WebView2 gives device pixels
    type At = { payload: { position: { x: number; y: number } } };
    const at = (e: At) => projectAt(e.payload.position.x / scale, e.payload.position.y / scale);
    const offs = [
      listen("tauri://drag-enter", (e: At) => mark(at(e))),
      listen("tauri://drag-over", (e: At) => mark(at(e))),
      listen("tauri://drag-leave", () => mark(null)),
      listen("tauri://drag-drop", (e: At) => { lib.dropTarget.current = at(e)?.dataset.project; mark(null); }),
    ];
    return () => { for (const off of offs) void off.then((f) => f()); };
  }, [p.drops]); // eslint-disable-line react-hooks/exhaustive-deps

  // A drawing carried onto a project: press a tile and move; the project under the pointer is tinted, and the drawing
  // goes in when it is let go there. Near the window's top or bottom edge Home scrolls. Escape puts it back.
  const ghost = useRef<HTMLDivElement>(null), stray = useRef(false), pointer = useRef({ x: 0, y: 0 });
  const [carried, setCarried] = useState<{ name: string; picture?: TilePicture }>();
  const place = () => { if (ghost.current) ghost.current.style.transform = `translate(${pointer.current.x + 12}px, ${pointer.current.y + 12}px)`; };
  useLayoutEffect(place, [carried]); // the carried picture starts at the pointer
  const press = (e: React.PointerEvent, d: { path: string; name: string; picture?: TilePicture }) => {
    if (e.button !== 0 || open || !lib.store.projects.length) return;
    const x0 = e.clientX, y0 = e.clientY;
    let on = false, frame = 0;
    const scroll = () => {
      const el = page.current, edge = 56, y = pointer.current.y;
      if (el) el.scrollTop += y < edge ? -(edge - y) / 4 : y > innerHeight - edge ? (y - innerHeight + edge) / 4 : 0;
      frame = requestAnimationFrame(scroll);
    };
    const move = (ev: PointerEvent) => {
      pointer.current = { x: ev.clientX, y: ev.clientY };
      if (!on && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      if (!on) { on = true; setCarried({ name: d.name, picture: d.picture }); frame = requestAnimationFrame(scroll); }
      place();
      mark(projectAt(ev.clientX, ev.clientY));
    };
    const end = (drop: boolean) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("keydown", escape, true);
      removeEventListener("blur", away);
      cancelAnimationFrame(frame);
      const target = over.current?.dataset.project;
      mark(null);
      if (!on) return;
      stray.current = true; // the click that ends the drag does not open the drawing
      setTimeout(() => (stray.current = false));
      setCarried(undefined);
      if (drop && target) void lib.add(target, [{ path: d.path, name: d.name }]);
    };
    const up = () => end(true), away = () => end(false); // the window losing the focus puts it back too
    const escape = (ev: KeyboardEvent) => { if (ev.key === "Escape" && on) { ev.preventDefault(); ev.stopPropagation(); end(false); } };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("keydown", escape, true);
    addEventListener("blur", away);
  };

  // Right-click menus: on the tile, or with the Menu key or Shift+F10 on a focused tile.
  const menuProps = (f: () => Omit<MenuFor, "at" | "keyboard">) => ({
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setMenu({ ...f(), ...menuAt(e) } as MenuFor); },
    onKeyDown: (e: React.KeyboardEvent) => { if (!menuKey(e)) return; e.preventDefault(); e.stopPropagation(); setMenu({ ...f(), ...menuAt(e) } as MenuFor); },
  });
  const item = (key: string, name: string, icon: React.ReactNode, more?: boolean, checked?: boolean): MenuItem => ({ key, name, icon, more, checked });
  const menuGroups = (m: MenuFor): MenuItem[][] => {
    if (m.kind === "drawing") {
      const own = !!lib.pictureFor(m.path)?.own;
      return [
        [m.found ? item("open", "Open", <FolderOpen size={18} />) : item("locate", "Locate…", <MagnifyingGlass size={18} />)],
        [item("add", "Add to project", <FolderPlus size={18} />, true), item("thumb", "Set thumbnail…", <ImageSquare size={18} />), ...(own ? [item("auto", "Use automatic thumbnail", <ArrowCounterClockwise size={18} />)] : [])],
        [m.project ? item("out", "Remove from project", <FolderSimpleMinus size={18} />) : item("remove", "Remove from Home", <MinusCircle size={18} />)],
      ];
    }
    if (m.kind === "project") {
      const own = !!projectOf(lib.store, m.id)?.thumb;
      return [
        [item("open", "Open", <FolderOpen size={18} />), item("add-files", "Add drawings…", <FilePlus size={18} />)],
        [item("rename", "Rename", <PencilSimple size={18} />), item("thumb", "Set thumbnail…", <ImageSquare size={18} />), ...(own ? [item("auto", "Use automatic thumbnail", <ArrowCounterClockwise size={18} />)] : [])],
        [item("delete", "Delete project…", <Trash size={18} />)],
      ];
    }
    if (m.kind === "purpose") return [[item("new", "New drawing", <FilePlus size={18} />)], m.own ? [item("remove", "Remove template", <MinusCircle size={18} />)] : []];
    if (m.kind === "recovered") return [[item("open", "Open", <FolderOpen size={18} />)], [item("discard", "Discard", <Trash size={18} />)]];
    return [[item("open", "Open", <FolderOpen size={18} />)]];
  };
  // Add to project: every project (ticked where the drawing is already), then a new one.
  const sub = (key: string) => {
    if (key !== "add" || menu?.kind !== "drawing") return undefined;
    const path = menu.path, others = lib.store.projects.filter((x) => x.id !== menu.project);
    return { label: "Add to project", groups: [others.map((x) => item(`add:${x.id}`, x.name, <FolderSimple size={18} />, false, x.drawings.some((d) => d.path === path))), [item("add:new", "New project…", <FolderSimplePlus size={18} />)]].filter((g) => g.length) };
  };
  const choose = (key: string) => {
    const m = menu;
    if (!m) return;
    if (m.kind === "drawing") {
      if (key === "open") return p.onRecent({ path: m.path });
      if (key === "locate") return lib.locate(m.path);
      if (key === "thumb") return void lib.chooseThumb({ path: m.path });
      if (key === "auto") return void lib.resetThumb({ path: m.path });
      if (key === "out" && m.project) return void lib.removeDrawing(m.project, m.path);
      if (key === "remove" && m.recent) return p.onRemove(m.recent);
      if (key === "add:new") return startNaming([{ path: m.path, name: m.name }]);
      if (key.startsWith("add:")) return void lib.add(key.slice(4), [{ path: m.path, name: m.name }]);
    }
    if (m.kind === "project") {
      if (key === "open") return openProject(m.id);
      if (key === "add-files") return lib.addPicked(m.id);
      if (key === "rename") return setNaming({ id: m.id, value: projectOf(lib.store, m.id)?.name ?? "" });
      if (key === "thumb") return void lib.chooseThumb({ project: m.id });
      if (key === "auto") return void lib.resetThumb({ project: m.id });
      if (key === "delete") return setDeleting(projectOf(lib.store, m.id));
    }
    if (m.kind === "purpose") return key === "new" ? p.onNew(m.id) : p.onRemovePurpose(m.id);
    if (m.kind === "recovered") return key === "open" ? p.onRecovered(m.entry) : p.onDiscard(m.entry);
    if (m.kind === "starter") return p.onStarter(m.text);
  };

  // A new project's name, typed in its tile; Return or a click away makes it (Untitled project when empty), Escape
  // does not. A project being renamed takes the name the same way.
  const startNaming = (then?: { path: string; name?: string }[]) => {
    if (open) lib.setOpen(undefined);
    setNaming({ value: "", then });
    requestAnimationFrame(() => page.current?.querySelector("[data-section='projects']")?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const named = (keep: boolean) => {
    const it = naming;
    setNaming(undefined);
    if (!it || !keep) return;
    if (it.id) void lib.rename(it.id, it.value);
    else void lib.create(it.value || UNTITLED, it.then).then((id) => requestAnimationFrame(() => page.current?.querySelector<HTMLElement>(`.home-tile[data-key="project:${CSS.escape(id)}"]`)?.focus()));
  };
  const nameField = (
    <input className="home-name-field" autoFocus aria-label="Project name" placeholder={UNTITLED} spellCheck={false} maxLength={60} value={naming?.value ?? ""}
      onFocus={(e) => e.target.select()} onChange={(e) => setNaming((x) => x && { ...x, value: e.target.value })} onBlur={() => named(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); named(e.key === "Enter"); } }} />
  );

  // A drawing's tile, in Recent or in a project. A drawing that was moved or deleted shows so, and Locate… finds it.
  const drawingTile = (d: { path: string; name: string; found: boolean; recent?: RecentEntry; project?: string; when: string }, k: number) => {
    const picture = lib.pictureFor(d.path), key = `drawing:${d.path}`;
    return (
      <div key={key} className={d.found ? "home-slot" : "home-slot missing"} style={arrive(k)}>
        <button className="home-tile" data-key={key} data-tip={d.path} onClick={() => (d.found ? p.onRecent({ path: d.path }) : lib.locate(d.path))}
          onPointerDown={(e) => press(e, { path: d.path, name: d.name, picture })} {...menuProps(() => ({ kind: "drawing", path: d.path, name: d.name, found: d.found, recent: d.recent, project: d.project }))}>
          <DrawingPicture name={d.name} picture={picture} />
          <span className="home-caption">
            <span className="home-name">{d.name}</span>
            <span className="home-when">{d.found ? d.when : "Moved or deleted"}</span>
          </span>
        </button>
        {d.recent && <button className="home-remove" tabIndex={-1} onClick={() => p.onRemove(d.recent!)} aria-label={`Remove ${d.name} from Home`} data-tip="Remove from Home"><X size={12} /></button>}
      </div>
    );
  };
  const projectTile = (x: Project, k: number) => {
    const key = `project:${x.id}`, cells = mosaic(x, lib.pictureFor), lost = x.drawings.filter((d) => lib.missing.has(d.path)).length;
    return (
      <div key={key} className="home-slot" style={arrive(k)}>
        <button className="home-tile project" data-key={key} data-project={x.id} onClick={() => openProject(x.id)} {...menuProps(() => ({ kind: "project", id: x.id }))}
          aria-label={`${x.name}, ${drawings(x.drawings.length)}`}>
          <ProjectPicture thumb={x.thumb && lib.urls[x.thumb]} cells={cells} />
          <span className="home-caption">
            {naming?.id === x.id ? <span className="home-name" /> : <span className="home-name">{x.name}</span>}
            <span className="home-when">{x.drawings.length ? drawings(x.drawings.length) : "No drawings"}{lost ? `, ${lost} missing` : ""}</span>
          </span>
        </button>
        {naming?.id === x.id && <div className="home-naming">{nameField}</div>}
      </div>
    );
  };

  const recentTiles = !p.recents.length && !p.recovered.length ? STARTERS.map((s, k) => (
    <div key={s.name} className="home-slot" style={arrive(n + k)}>
      <button className="home-tile" data-key={`starter:${s.name}`} onClick={() => p.onStarter(s.text)} {...menuProps(() => ({ kind: "starter", text: s.text, name: s.name }))}>
        <span className="home-thumb" data-theme="light"><img src={s.picture} alt="" draggable={false} /></span>
        <span className="home-caption">
          <span className="home-name">{s.name}</span>
          <span className="home-when">{s.kind}</span>
        </span>
      </button>
    </div>
  )) : [
    // Recovered drawings first, with a dashed frame as New's tiles have: their changes are not saved yet.
    ...p.recovered.map((r, k) => (
      <div key={r.id} className="home-slot" style={arrive(n + k)}>
        <button className="home-tile recovered" data-key={`recovered:${r.id}`} onClick={() => p.onRecovered(r)} {...menuProps(() => ({ kind: "recovered", entry: r }))}>
          <span className="home-thumb"><span className="home-initial" aria-hidden>{r.name.slice(0, 1).toUpperCase()}</span></span>
          <span className="home-caption">
            <span className="home-name">{r.name}</span>
            <span className="home-when">Recovered · {when(r.at, now)}</span>
          </span>
        </button>
        <button className="home-remove" tabIndex={-1} onClick={() => p.onDiscard(r)} aria-label={`Discard ${r.name}`} data-tip="Discard"><X size={12} /></button>
      </div>
    )),
    ...p.recents.map((r, k) => drawingTile({ path: r.path, name: r.name, found: r.found, recent: r, when: when(r.at, now) }, n + p.recovered.length + k)),
  ];

  const main = (
    <>
      <h1 className="home-greeting">{greeting(p.name, now, p.first, p.away)}</h1>
      {/* New and Templates side by side, each its own section. */}
      <div className="home-band">
        <Section id="new" title="New">
          <div className="home-slot home-quick" style={arrive(0)}>
            <button className="home-tile new" data-key="new" onClick={() => p.onNew(QUICK)} autoFocus {...menuProps(() => ({ kind: "purpose", id: QUICK, name: "Quick start" }))}>
              <span className="home-thumb"><QuickPicture /></span>
              <span className="home-caption">
                <span className="home-name">Quick start</span>
                <kbd>{p.newKey}</kbd>
              </span>
            </button>
          </div>
        </Section>
        <Section id="templates" title="Templates" className="home-templates">
          <div className="home-grid purposes">
            {p.purposes.map((t, k) => (
              <div key={t.id} className="home-slot" style={arrive(1 + k)}>
                <button className="home-tile new" data-key={`purpose:${t.id}`} onClick={() => p.onNew(t.id)} {...menuProps(() => ({ kind: "purpose", id: t.id, name: t.name, own: t.own }))}>
                  <span className="home-thumb"><PurposePicture style={t.style} kind={t.kind} /></span>
                  <span className="home-caption"><span className="home-name">{t.name}</span></span>
                </button>
                {t.own && <button className="home-remove" tabIndex={-1} onClick={() => p.onRemovePurpose(t.id)} aria-label={`Remove ${t.name}`} data-tip="Remove template"><X size={12} /></button>}
              </div>
            ))}
            {p.onCustom && (
              <div className="home-slot" style={arrive(n - 1)}>
                <button className="home-tile new custom" data-key="custom" onClick={p.onCustom}>
                  <span className="home-thumb"><span className="custom-sheet" aria-hidden><Plus size={20} /></span></span>
                  <span className="home-caption"><span className="home-name">Custom template</span></span>
                </button>
              </div>
            )}
          </div>
        </Section>
      </div>
      <Section id="recent" title={p.recents.length || p.recovered.length ? "Recent" : "Examples"}
        action={<button className="home-open" onClick={p.onOpen}><FolderOpen size={16} aria-hidden />Open…{p.openKey && <kbd>{p.openKey}</kbd>}</button>}>
        <div className="home-grid">{recentTiles}</div>
      </Section>
      <Section id="projects" title="Projects">
        <div className="home-grid">
          {lib.store.projects.map((x, k) => projectTile(x, n + p.recents.length + k))}
          {naming && !naming.id ? (
            <div className="home-slot">
              <div className="home-tile project naming" aria-hidden>
                <ProjectPicture cells={[]} />
                <span className="home-caption"><span className="home-name" /><span className="home-when">No drawings</span></span>
              </div>
              <div className="home-naming">{nameField}</div>
            </div>
          ) : (
            <div className="home-slot" style={arrive(n + p.recents.length + lib.store.projects.length)}>
              <button className="home-tile new custom" data-key="new-project" onClick={() => startNaming()}>
                <span className="home-thumb"><span className="custom-folder" aria-hidden><FolderSimplePlus size={20} /></span></span>
                <span className="home-caption"><span className="home-name">New project</span></span>
              </button>
            </div>
          )}
        </div>
      </Section>
    </>
  );

  // A project, open in Home's place: Home to go back, its name (its menu beside it), and its drawings. A drawing on the
  // recent list shows when it was last opened or saved; another, when it went in the project.
  const opened = (path: string, added: number) => {
    const recent = p.recents.find((r) => r.path === path);
    if (recent) return when(recent.at, now);
    const w = when(added, now);
    return `Added ${/^(Today|Yesterday)/.test(w) ? w[0].toLowerCase() + w.slice(1) : w}`;
  };
  const project = open && (
    <>
      <button className="home-back" onClick={back}><ArrowLeft size={16} aria-hidden />Home</button>
      <div className="home-title-row" {...menuProps(() => ({ kind: "project", id: open.id }))}>
        <h1 className="home-greeting home-project-name">{open.name}</h1>
        <button className="home-more" aria-label={`${open.name} options`} data-tip="Options" aria-haspopup="menu"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ kind: "project", id: open.id, at: { x: r.left, y: r.bottom + 4 }, keyboard: e.detail === 0 }); }}><DotsThree size={20} /></button>
      </div>
      <Section id="project" title={open.drawings.length ? drawings(open.drawings.length) : "No drawings"} className="home-project">
        <div className="home-grid" data-project={open.id}>
          {open.drawings.map((d, k) => drawingTile({ path: d.path, name: d.name, found: !lib.missing.has(d.path), project: open.id, when: opened(d.path, d.added) }, k))}
          <div className="home-slot">
            <button className="home-tile new custom" data-key="add-files" onClick={() => lib.addPicked(open.id)}>
              <span className="home-thumb"><span className="custom-sheet" aria-hidden><Plus size={20} /></span></span>
              <span className="home-caption"><span className="home-name">Add drawings…</span></span>
            </button>
          </div>
        </div>
      </Section>
    </>
  );

  const deleteName = deleting?.name;
  return (
    <main ref={page} className={[p.leaving ? "home leaving" : "home", carried && "carrying"].filter(Boolean).join(" ")} aria-label="Home" inert={p.leaving}
      onFocus={focused} onClickCapture={(e) => { if (stray.current) { e.preventDefault(); e.stopPropagation(); } }}>
      <div className="home-inner">
        {/* The lockup file as it is (brand/logos/README.md), so the wordmark's weight, size and gap match the logo. */}
        <header className="home-head">
          <picture>
            <source srcSet={lockupWhite} media="(prefers-color-scheme: dark)" />
            <img src={lockup} alt="Octet" height={96} draggable={false} />
          </picture>
        </header>
        <div ref={grid} key={open ? `project:${open.id}` : "home"} className={["home-view", first && !open && "home-arrive"].filter(Boolean).join(" ")}>
          {project || main}
        </div>
      </div>
      {carried && createPortal(
        <div ref={ghost} className="home-carry" aria-hidden>
          <DrawingPicture name={carried.name} picture={carried.picture} />
        </div>, document.body)}
      {menu && <ContextMenu label={menu.kind === "project" ? projectOf(lib.store, menu.id)?.name ?? "Project" : "name" in menu ? menu.name : "entry" in menu ? menu.entry.name : "Drawing"}
        at={menu.at} keyboard={menu.keyboard} groups={menuGroups(menu).filter((g) => g.length)} sub={sub} onChoose={choose} onClose={() => setMenu(undefined)} />}
      <Exit>{deleting && (
        <Dialog title={`Delete “${deleteName}”?`} action="Delete" onClose={() => setDeleting(undefined)} onAction={() => { const id = deleting.id; setDeleting(undefined); void lib.remove(id); }}>
          <p className="dialog-note">The drawings stay where they are. Octet removes only the project.</p>
        </Dialog>
      )}</Exit>
    </main>
  );
}

// First launch: the user's name, in the dotted frame Octet draws round a selected group. Return goes on; Skip or
// Escape goes on without a name.
export function NameBox({ onDone, leaving }: { onDone: (name: string) => void; leaving?: boolean }) {
  const [name, setName] = useState(""), page = useRef<HTMLElement>(null);
  useModal(page, !leaving);
  return (
    <main ref={page} className={leaving ? "home name-box leaving" : "home name-box"} aria-label="Welcome" inert={leaving}>
      <div className="name-box-inner">
        <Mark size={56} />
        <h1 className="name-title">Hey, what shall we call you?</h1>
        <label className="name-frame">
          <svg className="name-dots" aria-hidden><rect x="0.5" y="0.5" rx="10" /></svg>
          <input value={name} autoFocus maxLength={40} aria-label="Your name" placeholder="Your name" spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onDone(name.trim()); }
              if (e.key === "Escape") { e.preventDefault(); onDone(""); }
            }} />
        </label>
        <div className="name-actions">
          <button className="dialog-button primary" onClick={() => onDone(name.trim())} disabled={!name.trim()}>Continue</button>
          <button className="text-button" onClick={() => onDone("")}>Skip</button>
        </div>
      </div>
    </main>
  );
}
