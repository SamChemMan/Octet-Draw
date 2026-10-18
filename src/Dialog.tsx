// Octet's one dialog: a small card over the window with a title, its fields, and Cancel and the action. Return
// does the action, Escape cancels, and the first field has the focus. Every dialog uses it (brand/CLAUDE.md).
// With no action it only shows something (About Octet): one Close button, which Return presses too. plain: the
// body carries its own heading, so the title is only read out.
import { useEffect, useRef } from "react";

// The modal cards open now, the top one last. Only the top one takes keys.
const open: React.RefObject<HTMLElement | null>[] = [];
const FOCUSABLE = "button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])";
// The cards' backdrops stack in the order the cards opened (from 6, .modal-backdrop's z-index), so the top card shows
// over the others: Quit's "Save changes" question shows over Export, not under it.
const restack = () => open.forEach((c, i) => { const backdrop = c.current?.parentElement; if (backdrop) backdrop.style.zIndex = String(6 + i); });

// A modal card keeps the keyboard (REL-27): Tab and Shift+Tab go round its controls only, and when it closes, the
// focus goes back to the control that had it before. Returns whether a card is the top one.
export function useModal(card: React.RefObject<HTMLElement | null>): () => boolean {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    open.push(card);
    restack();
    const tab = (e: KeyboardEvent) => {
      const el = card.current;
      if (e.key !== "Tab" || !el || open[open.length - 1] !== card) return;
      const all = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => !x.matches(":disabled") && x.getClientRects().length);
      const at = all.indexOf(document.activeElement as HTMLElement);
      if (!all.length || (e.shiftKey ? at <= 0 : at < 0 || at === all.length - 1)) {
        e.preventDefault();
        all[e.shiftKey ? all.length - 1 : 0]?.focus();
      }
    };
    addEventListener("keydown", tab, true);
    return () => {
      removeEventListener("keydown", tab, true);
      open.splice(open.indexOf(card), 1);
      restack();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return () => open[open.length - 1] === card;
}

// alt: a third choice, before Cancel (Don't Save).
type Props = { title: string; action?: string; onAction?: () => void; onClose: () => void; plain?: boolean; alt?: { label: string; onClick: () => void }; children: React.ReactNode };

export function Dialog({ title, action, onClose, onAction = onClose, plain, alt, children }: Props) {
  const card = useRef<HTMLDivElement>(null);
  const top = useModal(card);
  // The latest handlers, so the keys and the first field's focus are set up once, when the dialog opens.
  const handlers = useRef({ onAction, onClose });
  handlers.current = { onAction, onClose };
  useEffect(() => {
    // Never the third choice (Don't Save, Replace): Space on it would lose work.
    card.current?.querySelector<HTMLElement>("textarea, input, button:not(.alt), select")?.focus();
    const key = (e: KeyboardEvent) => {
      if (!top()) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); handlers.current.onClose(); }
      // Return in a text area makes a new line; ⌘Return (Ctrl+Enter) sends.
      if (e.key === "Enter" && (!(e.target instanceof HTMLTextAreaElement) || e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); handlers.current.onAction(); }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        {!plain && <h2>{title}</h2>}
        <div className="dialog-body">{children}</div>
        <div className="dialog-buttons">
          {alt && <button className="dialog-button alt" onClick={alt.onClick}>{alt.label}</button>}
          {action && <button className="dialog-button" onClick={onClose}>Cancel</button>}
          <button className="dialog-button primary" onClick={onAction}>{action ?? "Close"}</button>
        </div>
      </div>
    </div>
  );
}
