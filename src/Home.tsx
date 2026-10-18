// Home (decision 0003): where Octet opens. The lockup, a greeting by name and time of day, New first, the recent
// drawings as pictures (or, before there are any, three example drawings), and Open. New starts with Quick start: a
// seamless canvas with no page, selected when Home opens, so Return starts it. Beside it are the templates (purposes,
// IDEA-SIZE-1): Paper, Thesis, Slides and Poster, then the user's own, each a picture of its page, then Custom
// template, which makes a new one. One click starts a drawing. On first launch Home asks the user's name first, in
// the dotted frame a selected group gets. Nothing here needs an account.
import { useEffect, useRef, useState } from "react";
import { FolderOpen, Plus, X } from "@phosphor-icons/react";
import { QUICK, outlines, type DocStyle, type PurposeKind } from "./docstyle";
import mark from "../brand/logos/octet-mark.svg";
import markSmall from "../brand/logos/octet-mark-small.svg";
import markWhite from "../brand/logos/octet-mark-white.svg";
import lockup from "../brand/logos/octet-lockup.svg";
import lockupWhite from "../brand/logos/octet-lockup-white.svg";
import { useModal } from "./Dialog";
import { tileTo } from "./keys";
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

export type PurposeTile = { id: string; name: string; kind: PurposeKind; style: DocStyle; own?: boolean };
type Props = {
  leaving?: boolean; // fading out as a drawing opens
  name: string; first: boolean; away: number; recents: RecentEntry[]; newKey: string; openKey?: string;
  recovered: RecoveredEntry[]; onRecovered: (r: RecoveredEntry) => void; onDiscard: (r: RecoveredEntry) => void;
  purposes: PurposeTile[]; // the templates: Octet's, then the user's own
  onNew: (purpose: string) => void; onOpen: () => void; onRecent: (r: RecentEntry) => void; onRemove: (r: RecentEntry) => void;
  onRemovePurpose: (purpose: string) => void;
  onCustom?: () => void; // makes a template of the user's own; unset when they have as many as Octet keeps
  onStarter: (text: string) => void; // opens an example drawing as a new drawing
};

// The first time Home shows (not when a drawing closes back to it), its tiles arrive one after another (FEEL-44): the
// first eight a step apart, the rest with the eighth.
let arrived = false;
const arrive = (k: number) => ({ "--i": Math.min(k, 7) }) as React.CSSProperties;

export function Home(p: Props) {
  const grid = useRef<HTMLDivElement>(null), page = useRef<HTMLElement>(null), now = new Date();
  const [first] = useState(() => !arrived);
  useEffect(() => { arrived = true; }, []);
  const n = 1 + p.purposes.length + (p.onCustom ? 1 : 0); // the New tiles: Quick start, the templates, Custom template
  // Home covers the editor, which takes no keys or clicks until Home goes.
  useModal(page, !p.leaving);
  // Return starts Quick start (as decision 0003 asks) unless a tile has the focus; arrow keys move between tiles, up
  // and down to the nearest tile in the row there (tileTo). A dialog over Home (Save changes) makes Home inert and
  // keeps the keys.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (p.leaving || page.current?.inert || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const tiles = [...(grid.current?.querySelectorAll<HTMLElement>(".home-tile") ?? [])], at = tiles.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Enter" && at < 0 && !(document.activeElement instanceof HTMLButtonElement)) { e.preventDefault(); p.onNew(QUICK); return; }
      const to = tileTo(e.key, at, tiles.map((t) => t.getBoundingClientRect()));
      if (to !== undefined) { e.preventDefault(); tiles[to].focus(); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  return (
    <main ref={page} className={p.leaving ? "home leaving" : "home"} aria-label="Home" inert={p.leaving}>
      <div className="home-inner">
        {/* The lockup file as it is (brand/logos/README.md), so the wordmark's weight, size and gap match the logo. */}
        <header className="home-head">
          <picture>
            <source srcSet={lockupWhite} media="(prefers-color-scheme: dark)" />
            <img src={lockup} alt="Octet" height={96} draggable={false} />
          </picture>
        </header>
        <h1 className="home-greeting">{greeting(p.name, now, p.first, p.away)}</h1>
        <div ref={grid} className={first ? "home-arrive" : undefined}>
        {/* New: Quick start, then the templates beside it under their own heading. */}
        <div className="home-new" role="group" aria-label="New">
          <div className="home-row"><h2>New</h2></div>
          <div className="home-row">
            <h3>Templates</h3>
            <button className="home-open" onClick={p.onOpen}>
              <FolderOpen size={16} aria-hidden />
              Open…
              {p.openKey && <kbd>{p.openKey}</kbd>}
            </button>
          </div>
          <div className="home-slot home-quick" style={arrive(0)}>
            <button className="home-tile new" onClick={() => p.onNew(QUICK)} autoFocus>
              <span className="home-thumb"><QuickPicture /></span>
              <span className="home-caption">
                <span className="home-name">Quick start</span>
                <kbd>{p.newKey}</kbd>
              </span>
            </button>
          </div>
          <div className="home-grid purposes" role="group" aria-label="Templates">
            {p.purposes.map((t, k) => (
              <div key={t.id} className="home-slot" style={arrive(1 + k)}>
                <button className="home-tile new" onClick={() => p.onNew(t.id)}>
                  <span className="home-thumb"><PurposePicture style={t.style} kind={t.kind} /></span>
                  <span className="home-caption"><span className="home-name">{t.name}</span></span>
                </button>
                {t.own && <button className="home-remove" onClick={() => p.onRemovePurpose(t.id)} aria-label={`Remove ${t.name}`} data-tip="Remove template"><X size={12} /></button>}
              </div>
            ))}
            {p.onCustom && (
              <div className="home-slot" style={arrive(n - 1)}>
                <button className="home-tile new custom" onClick={p.onCustom}>
                  <span className="home-thumb"><span className="custom-sheet" aria-hidden><Plus size={20} /></span></span>
                  <span className="home-caption"><span className="home-name">Custom template</span></span>
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="home-row"><h2>{p.recents.length || p.recovered.length ? "Recent" : "Examples"}</h2></div>
        <div className="home-grid">
          {!p.recents.length && !p.recovered.length && STARTERS.map((s, k) => (
            <button key={s.name} className="home-tile" onClick={() => p.onStarter(s.text)} style={arrive(n + k)}>
              <span className="home-thumb" data-theme="light"><img src={s.picture} alt="" draggable={false} /></span>
              <span className="home-caption">
                <span className="home-name">{s.name}</span>
                <span className="home-when">{s.kind}</span>
              </span>
            </button>
          ))}
          {/* Recovered drawings first, with a dashed frame as New's tiles have: their changes are not saved yet. */}
          {p.recovered.map((r, k) => (
            <div key={r.id} className="home-slot" style={arrive(n + k)}>
              <button className="home-tile recovered" onClick={() => p.onRecovered(r)}>
                <span className="home-thumb"><span className="home-initial" aria-hidden>{r.name.slice(0, 1).toUpperCase()}</span></span>
                <span className="home-caption">
                  <span className="home-name">{r.name}</span>
                  <span className="home-when">Recovered · {when(r.at, now)}</span>
                </span>
              </button>
              <button className="home-remove" onClick={() => p.onDiscard(r)} aria-label={`Discard ${r.name}`} data-tip="Discard"><X size={12} /></button>
            </div>
          ))}
          {p.recents.map((r, k) => (
            <div key={r.path} className={r.found ? "home-slot" : "home-slot missing"} style={arrive(n + p.recovered.length + k)}>
              <button className="home-tile" onClick={() => p.onRecent(r)} data-tip={r.path}>
                {/* The picture is of the white page (export.ts draws it in the light theme), so it stays on white. With
                    no picture, the tile takes the theme, as the New tiles do. */}
                <span className="home-thumb" data-theme={r.thumb ? "light" : undefined}>
                  {r.thumb ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.thumb)}`} alt="" draggable={false} /> : <span className="home-initial" aria-hidden>{r.name.slice(0, 1).toUpperCase()}</span>}
                </span>
                <span className="home-caption">
                  <span className="home-name">{r.name}</span>
                  <span className="home-when">{r.found ? when(r.at, now) : "Moved or deleted"}</span>
                </span>
              </button>
              <button className="home-remove" onClick={() => p.onRemove(r)} aria-label={`Remove ${r.name} from Home`} data-tip="Remove from Home"><X size={12} /></button>
            </div>
          ))}
        </div>
        </div>
      </div>
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

// First launch, after the name: whether Octet checks for updates when it opens (decision 0010). Nothing is checked
// before the user answers. Escape is No. Settings > General changes the answer.
export function UpdatesBox({ onDone, leaving }: { onDone: (check: boolean) => void; leaving?: boolean }) {
  const page = useRef<HTMLElement>(null);
  useModal(page, !leaving);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !leaving) { e.preventDefault(); onDone(false); } };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  return (
    <main ref={page} className={leaving ? "home name-box leaving" : "home name-box"} aria-label="Updates" inert={leaving}>
      <div className="name-box-inner">
        <Mark size={56} />
        <h1 className="name-title">Check for updates automatically?</h1>
        <div className="name-actions">
          <button className="dialog-button primary" onClick={() => onDone(true)} autoFocus>Check Automatically</button>
          <button className="text-button" onClick={() => onDone(false)}>Don’t Check</button>
        </div>
      </div>
    </main>
  );
}
