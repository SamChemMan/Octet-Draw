// Home (decision 0003): where Octet opens. A greeting by name and time of day, New drawing first and largest, the
// recent drawings as pictures, and Open. On first launch it asks the user's name first, in the dotted frame a
// selected group gets. Nothing here needs an account.
import { useEffect, useRef, useState } from "react";
import { FolderOpen, Plus, X } from "@phosphor-icons/react";
import mark from "../brand/logos/octet-mark.svg";
import markSmall from "../brand/logos/octet-mark-32.svg";
import markReverse from "../brand/logos/octet-mark-reverse.svg";

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

// The mark (brand/logos/README.md): the heavier-stroke file from 24 to 48 px, the main one above.
function Mark({ size }: { size: number }) {
  return (
    <picture>
      <source srcSet={markReverse} media="(prefers-color-scheme: dark)" />
      <img src={size <= 48 ? markSmall : mark} alt="" width={size} height={size} draggable={false} />
    </picture>
  );
}

type Props = {
  leaving?: boolean; // fading out as a drawing opens
  name: string; first: boolean; away: number; recents: RecentEntry[]; newKey: string; openKey?: string;
  recovered: RecoveredEntry[]; onRecovered: (r: RecoveredEntry) => void; onDiscard: (r: RecoveredEntry) => void;
  onNew: () => void; onOpen: () => void; onRecent: (r: RecentEntry) => void; onRemove: (r: RecentEntry) => void;
};

export function Home(p: Props) {
  const grid = useRef<HTMLDivElement>(null), now = new Date();
  // Return makes a new drawing (as decision 0003 asks) unless a tile has the focus; arrow keys move between tiles.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (p.leaving || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const tiles = [...(grid.current?.querySelectorAll<HTMLElement>(".home-tile") ?? [])], at = tiles.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Enter" && at < 0 && !(document.activeElement instanceof HTMLButtonElement)) { e.preventDefault(); p.onNew(); return; }
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (step && tiles.length) { e.preventDefault(); tiles[Math.max(0, Math.min(tiles.length - 1, (at < 0 ? -1 : at) + step))].focus(); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  return (
    <main className={p.leaving ? "home leaving" : "home"} aria-label="Home" inert={p.leaving}>
      <div className="home-inner">
        <header className="home-head">
          <Mark size={24} />
          <span className="home-wordmark">octet</span>
        </header>
        <h1 className="home-greeting">{greeting(p.name, now, p.first, p.away)}</h1>
        <div className="home-row">
          <h2>{p.recents.length || p.recovered.length ? "Recent" : "Start"}</h2>
          <button className="home-open" onClick={p.onOpen}>
            <FolderOpen size={16} aria-hidden />
            Open…
            {p.openKey && <kbd>{p.openKey}</kbd>}
          </button>
        </div>
        <div className="home-grid" ref={grid}>
          <button className="home-tile new" onClick={p.onNew} autoFocus>
            <span className="home-thumb"><Plus size={28} aria-hidden /></span>
            <span className="home-caption">
              <span className="home-name">New drawing</span>
              <kbd>{p.newKey}</kbd>
            </span>
          </button>
          {/* Recovered drawings first, with the dashed frame of New drawing: their changes are not saved yet. */}
          {p.recovered.map((r) => (
            <div key={r.id} className="home-slot">
              <button className="home-tile recovered" onClick={() => p.onRecovered(r)}>
                <span className="home-thumb"><span className="home-initial" aria-hidden>{r.name.slice(0, 1).toUpperCase()}</span></span>
                <span className="home-caption">
                  <span className="home-name">{r.name}</span>
                  <span className="home-when">Recovered · {when(r.at, now)}</span>
                </span>
              </button>
              <button className="home-remove" onClick={() => p.onDiscard(r)} aria-label={`Discard ${r.name}`} title="Discard"><X size={12} weight="bold" /></button>
            </div>
          ))}
          {p.recents.map((r) => (
            <div key={r.path} className={r.found ? "home-slot" : "home-slot missing"}>
              <button className="home-tile" onClick={() => p.onRecent(r)} title={r.path}>
                <span className="home-thumb">
                  {r.thumb ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(r.thumb)}`} alt="" draggable={false} /> : <span className="home-initial" aria-hidden>{r.name.slice(0, 1).toUpperCase()}</span>}
                </span>
                <span className="home-caption">
                  <span className="home-name">{r.name}</span>
                  <span className="home-when">{r.found ? when(r.at, now) : "Moved or deleted"}</span>
                </span>
              </button>
              <button className="home-remove" onClick={() => p.onRemove(r)} aria-label={`Remove ${r.name} from Home`} title="Remove from Home"><X size={12} weight="bold" /></button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

// First launch: the user's name, in the dotted frame Octet draws round a selected group. Return goes on; Skip or
// Escape goes on without a name.
export function NameBox({ onDone, leaving }: { onDone: (name: string) => void; leaving?: boolean }) {
  const [name, setName] = useState("");
  return (
    <main className={leaving ? "home name-box leaving" : "home name-box"} aria-label="Welcome" inert={leaving}>
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
