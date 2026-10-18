// Octet's one dialog: a small card over the window with a title, its fields, and Cancel and the action. Return
// does the action, Escape cancels, and the first field has the focus (with no field, the action has it, never Don't
// Save). Every dialog uses it (brand/CLAUDE.md). With no action it only shows something (About Octet): one Close
// button, which Return presses too. plain: the body carries its own heading, so the title is only read out.
import { useEffect, useLayoutEffect, useRef } from "react";
import { listOpen } from "./Menu";
import { useLeaving } from "./motion";

// While a modal (a dialog, Settings, the command palette or Home) is open, everything beside it in the window is
// inert: Tab, clicks and screen readers stay in it, and a modal over Home blocks Home too. A neighbour that starts to
// leave as the modal closes (Home, after Don't Save) stays inert, as everything leaving is (motion.tsx, Exit).
// inert does nothing on SVG (the canvas), so screen readers skip that with aria-hidden.
export function useModal(ref: React.RefObject<HTMLElement | null>, on = true) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el?.parentElement) return;
    const blocked = [...el.parentElement.children].filter((x) => x !== el && (x instanceof HTMLElement ? !x.inert : !x.hasAttribute("aria-hidden")));
    const block = (x: Element, on: boolean) => { if (x instanceof HTMLElement) x.inert = on; else if (on) x.setAttribute("aria-hidden", "true"); else x.removeAttribute("aria-hidden"); };
    for (const x of blocked) block(x, true);
    return () => { for (const x of blocked) block(x, x.classList.contains("leaving")); };
  }, [ref, on]);
}

// alt: a third choice, before Cancel (Don't Save). disabled: the action has nothing to do yet (Return does nothing).
type Props = { title: string; action?: string; onAction?: () => void; onClose: () => void; plain?: boolean; disabled?: boolean; alt?: { label: string; onClick: () => void }; children: React.ReactNode };

export function Dialog({ title, action, onClose, onAction = onClose, plain, disabled, alt, children }: Props) {
  // Leaving (motion.tsx, Exit), it gives the window back at once and takes no keys.
  const card = useRef<HTMLDivElement>(null), backdrop = useRef<HTMLDivElement>(null), leaving = useLeaving();
  useModal(backdrop, !leaving);
  // The first field (a text box, a list or a choice) takes the focus when the dialog opens, and only then: a dialog
  // draws again as its fields change, and the focus stays in the field being typed in. With no field, the action has it.
  useEffect(() => {
    const c = card.current;
    (c?.querySelector<HTMLElement>("textarea, input, select, .dialog-body button:not([tabindex='-1'])") ?? c?.querySelector<HTMLElement>(".dialog-button.primary"))?.focus();
  }, []);
  useEffect(() => {
    if (leaving) return;
    const key = (e: KeyboardEvent) => {
      if (listOpen()) return; // an open list takes its own keys
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      // Return in a text area makes a new line; ⌘Return (Ctrl+Enter) sends.
      if (e.key === "Enter" && (!(e.target instanceof HTMLTextAreaElement) || e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); if (!disabled) onAction(); }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [onAction, onClose, disabled, leaving]);
  return (
    <div ref={backdrop} className={leaving ? "modal-backdrop leaving" : "modal-backdrop"} inert={leaving} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className="dialog" role="dialog" aria-modal={!leaving} aria-label={title}>
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
