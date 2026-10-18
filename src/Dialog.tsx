// Octet's one dialog: a small card over the window with a title, its fields, and Cancel and the action. Return
// does the action, Escape cancels, and the first field has the focus. Every dialog uses it (brand/CLAUDE.md).
// With no action it only shows something (About Octet): one Close button, which Return presses too. plain: the
// body carries its own heading, so the title is only read out.
import { useEffect, useRef } from "react";

// alt: a third choice, before Cancel (Don't Save). cancel: Cancel's name, when the dialog's own word is better (Stop).
type Props = { title: string; action?: string; onAction?: () => void; onClose: () => void; plain?: boolean; alt?: { label: string; onClick: () => void }; cancel?: string; children: React.ReactNode };

export function Dialog({ title, action, onClose, onAction = onClose, plain, alt, cancel = "Cancel", children }: Props) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    card.current?.querySelector<HTMLElement>("textarea, input, button, select")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      // Return in a text area makes a new line; ⌘Return (Ctrl+Enter) sends.
      if (e.key === "Enter" && (!(e.target instanceof HTMLTextAreaElement) || e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); onAction(); }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [onAction, onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        {!plain && <h2>{title}</h2>}
        <div className="dialog-body">{children}</div>
        <div className="dialog-buttons">
          {alt && <button className="dialog-button alt" onClick={alt.onClick}>{alt.label}</button>}
          {action && <button className="dialog-button" onClick={onClose}>{cancel}</button>}
          <button className="dialog-button primary" onClick={onAction}>{action ?? "Close"}</button>
        </div>
      </div>
    </div>
  );
}
