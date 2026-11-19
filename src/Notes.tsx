// The Notes panel (issues 101 and 102, docs/plans/issue-101-102-notes.md): the drawing's note at the top, the
// selection's under it (one field for several objects, empty and "Mixed" when theirs differ), then a row for each
// other object with a note, which selects it and brings it into view. Notes are never drawn, so this is where they
// are read and typed. A field is used when it is left, on the objects it was opened for (TextField). It sits above the
// Actions panel, on the right, and moves by its header.
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PanelControls } from "./PanelControls";
import { TextField } from "./Fields";
import { useMovable } from "./movable";
import { useLeaving } from "./motion";
import type { Target } from "./annotate";

// A field: one keyword's note on its targets, shown under label and named name for a screen reader.
export type NoteField = { key: string; label: string; name: string; keyword: string; nth: number; targets: Target[]; value: string; mixed?: boolean };
// A row: an object with a note, by its name and the note's first line.
export type NoteRow = { id: number; name: string; text: string };

// The last Annotate… whose field took the cursor.
let focused = 0;
// The least room above the Actions panel for the panel to sit there (px): its header and a field of a few lines.
const ROOM = 240;

type Props = {
  fields: NoteField[]; rows: NoteRow[];
  onNote: (targets: Target[], keyword: string, nth: number, text: string) => void;
  onRow: (id: number) => void; onClose: () => void;
  onTyped: (typed: boolean) => void; // a field holds text typed and not yet used
  focus?: { key: string; n: number }; // the field Annotate opened, each time it is chosen
};

export const Notes = memo(function Notes({ fields, rows, onNote, onRow, onClose, onTyped, focus }: Props) {
  const move = useMovable("notes"), leaving = useLeaving(), panel = useRef<HTMLElement>(null);
  // Above the Actions panel (or its pill), as tall as the room there; beside it, at the bottom, when the Actions panel
  // leaves too little room above it. The panel and the pill take turns: when the one watched goes, the other is found.
  const [place, setPlace] = useState({ below: 0, beside: false });
  useLayoutEffect(() => {
    let stop = () => {};
    const attach = () => {
      stop();
      stop = () => {};
      const el = document.querySelector<HTMLElement>(".actions:not(.leaving), .actions-reopen");
      if (!el) return setPlace({ below: 0, beside: false });
      const fit = () => {
        if (!el.isConnected || el.classList.contains("leaving")) return void requestAnimationFrame(attach);
        const below = el.offsetHeight, beside = ((el.offsetParent as HTMLElement | null)?.clientHeight ?? innerHeight) - below < ROOM;
        setPlace((p) => (p.below === below && p.beside === beside ? p : { below, beside }));
      };
      const watch = new ResizeObserver(fit);
      watch.observe(el);
      fit();
      stop = () => watch.disconnect();
    };
    attach();
    return () => stop();
  }, []);
  // Each Annotate… once: the panel made again (Settings closed over it) does not take the cursor back.
  useEffect(() => {
    if (!focus || focus.n === focused) return;
    focused = focus.n;
    panel.current?.querySelector<HTMLElement>(`[data-note="${CSS.escape(focus.key)}"] textarea`)?.focus();
  }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section ref={panel} className={["note-panel", place.beside && "beside", leaving && "leaving"].filter(Boolean).join(" ")} aria-label="Notes" inert={leaving}
      style={{ ...move.style, ...{ "--below": `${place.below}px` } } as React.CSSProperties}>
      <header onPointerDown={move.onPointerDown}>
        <h2>Notes</h2>
        <PanelControls close={onClose} />
      </header>
      <div className="note-list">
        {fields.map((f) => (
          <label key={f.key} className="note-field" data-note={f.key}>
            <span className="note-name">{f.label}</span>
            {/* A field is made again for other targets, so what was typed goes on the ones it was opened for. */}
            <TextField key={f.targets.join(" ")} lines={12} label={f.name}
              value={f.value} placeholder={f.mixed ? "Mixed" : undefined} onChange={(text) => onNote(f.targets, f.keyword, f.nth, text)} onTyped={onTyped} />
          </label>
        ))}
        {rows.length > 0 && (
          <div className="note-rows" role="group" aria-label="Other notes">
            {rows.map((r) => (
              <button key={r.id} className="action note-row" data-tip="Select" onClick={() => onRow(r.id)}>
                <span className="note-row-name">{r.name}</span>
                <span className="note-row-text">{r.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
