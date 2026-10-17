// Octet's one dialog: a small card over the window with a title, its fields, and Cancel and the action. Return
// does the action, Escape cancels, and the first field has the focus (with no field, the action has it, never Don't
// Save). Every dialog uses it (brand/CLAUDE.md). With no action it only shows something (About Octet): one Close
// button, which Return presses too. plain: the body carries its own heading, so the title is only read out.
import { useEffect, useLayoutEffect, useRef } from "react";

// While a modal (a dialog, Settings, the command palette or Home) is open, everything beside it in the window is
// inert: Tab, clicks and screen readers stay in it, and a modal over Home blocks Home too. A layout effect, so a modal
// that closes gives its neighbours back before React marks one inert for its own reasons (Home as it fades out).
export function useModal(ref: React.RefObject<HTMLElement | null>, on = true) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el?.parentElement) return;
    const blocked = [...el.parentElement.children].filter((x): x is HTMLElement => x !== el && x instanceof HTMLElement && !x.inert);
    for (const x of blocked) x.inert = true;
    return () => { for (const x of blocked) x.inert = false; };
  }, [ref, on]);
}

// alt: a third choice, before Cancel (Don't Save). disabled: the action has nothing to do yet (Return does nothing).
type Props = { title: string; action?: string; onAction?: () => void; onClose: () => void; plain?: boolean; disabled?: boolean; alt?: { label: string; onClick: () => void }; children: React.ReactNode };

export function Dialog({ title, action, onClose, onAction = onClose, plain, disabled, alt, children }: Props) {
  const card = useRef<HTMLDivElement>(null), backdrop = useRef<HTMLDivElement>(null);
  useModal(backdrop);
  useEffect(() => {
    card.current?.querySelector<HTMLElement>("textarea, input, select, .dialog-button.primary")?.focus();
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      // Return in a text area makes a new line; ⌘Return (Ctrl+Enter) sends.
      if (e.key === "Enter" && (!(e.target instanceof HTMLTextAreaElement) || e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); if (!disabled) onAction(); }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [onAction, onClose, disabled]);
  return (
    <div ref={backdrop} className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        {!plain && <h2>{title}</h2>}
        <div className="dialog-body">{children}</div>
        <div className="dialog-buttons">
          {alt && <button className="dialog-button alt" onClick={alt.onClick}>{alt.label}</button>}
          {action && <button className="dialog-button" onClick={onClose}>Cancel</button>}
          <button className="dialog-button primary" onClick={onAction} disabled={disabled}>{action ?? "Close"}</button>
        </div>
      </div>
    </div>
  );
}
