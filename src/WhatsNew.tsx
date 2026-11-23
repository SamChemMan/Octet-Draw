// What's new in this version (releases.ts): once after an update, and from About Octet Draw. Earlier versions' notes
// are on GitHub. Under the first line, one line and a Donate button (Sam, 11 November 2026: "a small but clear 'donate
// to help if you want' button", then "move donate to the top"). Then the few big changes, each a name and one line.
// Every other section is folded to its name and the number of its changes (Sam, 12 November 2026: "so hard to digest
// as there is just so much"), with the Actions panel's fold: a click on a name opens that section.
import { invoke } from "@tauri-apps/api/core";
import { Fragment, useId, useState } from "react";
import { CaretDown, Heart } from "@phosphor-icons/react";
import { Dialog } from "./Dialog";
import type { Release } from "./releases";

// A line's name: Sam writes "Energy diagrams: pick…" and "LaTeX. Copy…". The words before the first ": " or ". " are
// its name, drawn bold, when they are short (10 words or fewer), and after a full stop only when a sentence follows.
// Any other line has no name.
export function named(line: string): { name?: string; text: string } {
  const m = /^([^:.]{1,60}?)([:.]) (.+)$/s.exec(line);
  return m && m[1].trim().split(/\s+/).length <= 10 && (m[2] === ":" || m[3].split(/\s+/).length >= 4) ? { name: m[1] + (m[2] === ":" ? "" : "."), text: m[3] } : { text: line };
}
// The text with each match of the search marked.
function marked(text: string, q: string) {
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>));
}
function Line({ line, q }: { line: string; q: string }) {
  const { name, text } = named(line);
  return <>{name && <strong>{marked(name, q)} </strong>}{marked(text, q)}</>;
}

export function WhatsNew({ release, onClose }: { release: Release; onClose: () => void }) {
  const highlights = release.highlights ?? release.summary?.map((text) => ({ title: "", text }));
  const [open, setOpen] = useState<string[]>([]), [find, setFind] = useState("");
  const id = useId(), q = find.trim(), has = (t: string) => t.toLowerCase().includes(q.toLowerCase());
  const toggle = (title: string) => setOpen((o) => (o.includes(title) ? o.filter((t) => t !== title) : [...o, title]));
  // Searching: every change that has the words, under its section's name, all open.
  const found = q ? [
    ...(highlights?.some((h) => has(`${h.title} ${h.text}`)) ? [{ title: "Highlights", items: highlights!.filter((h) => has(`${h.title} ${h.text}`)).map((h) => (h.title ? `${h.title}: ${h.text}` : h.text)) }] : []),
    ...release.sections.map((s) => ({ title: s.title, items: s.items.filter(has) })).filter((s) => s.items.length),
  ] : [];
  return (
    <Dialog title={release.heading ?? `What’s new in Octet Draw ${release.version}`} onClose={onClose} alt={{ label: "All versions", onClick: () => void invoke("open_link", { name: "releases" }).catch(() => undefined) }}>
      <input className="list-find notes-find" type="search" placeholder="Find a change" aria-label="Find a change" value={find} spellCheck={false} onChange={(e) => setFind(e.target.value)} />
      {q ? (
        <div className="notes" tabIndex={0} role="region" aria-label="Changes found" aria-live="polite">
          {found.map((s) => (
            <section key={s.title} className="notes-found">
              <h3 className="notes-more">{s.title}</h3>
              <ul>{s.items.map((item) => <li key={item}><Line line={item} q={q} /></li>)}</ul>
            </section>
          ))}
          {!found.length && <p className="notes-none">No change mentions “{q}”.</p>}
        </div>
      ) : (
      <div className="notes" tabIndex={0} role="region" aria-label="Release notes">
        {release.intro && <p>{release.intro}</p>}
        {/* Octet Draw is free for everyone, and stays free. A donation is only for those who want to help: one line and
            a small button at the top of the notes, never a window of its own. */}
        <p className="notes-donate">
          <span>Octet Draw is free. If you want to help, you can donate.</span>
          <button type="button" className="dialog-button" onClick={() => void invoke("open_link", { name: "donate" }).catch(() => undefined)}><Heart size={16} aria-hidden /> Donate</button>
        </p>
        {highlights && release.heading && <h3 className="notes-more">Highlights</h3>}
        {highlights && (
          <ul className="notes-highlights" aria-label="Highlights">
            {highlights.map((h) => {
              const { name, text } = h.title ? { name: h.title, text: h.text } : named(h.text);
              return (
                <li key={h.text}>
                  {name && <strong>{name}</strong>}
                  <span>{text}</span>
                </li>
              );
            })}
          </ul>
        )}
        {release.signoff?.map((line) => <p key={line}>{line}</p>)}
        <h3 className="notes-more">More changes</h3>
        {release.sections.map((s, i) => (
          <section key={s.title} className="notes-fold">
            <button type="button" className="fold-title" aria-expanded={open.includes(s.title)} aria-controls={`${id}-${i}`} onClick={() => toggle(s.title)}>
              {s.title}
              <CaretDown size={12} className="fold-caret" aria-hidden />
              <span className="notes-count" aria-label={`${s.items.length} changes`}>{s.items.length}</span>
            </button>
            <div id={`${id}-${i}`} className="fold-body" data-open={open.includes(s.title) || undefined} inert={!open.includes(s.title)}>
              <div>{s.note && <p className="notes-note">{s.note}</p>}<ul>{s.items.map((item) => <li key={item}><Line line={item} q="" /></li>)}</ul></div>
            </div>
          </section>
        ))}
        <p className="notes-thanks">{release.thanks}</p>
      </div>
      )}
    </Dialog>
  );
}
