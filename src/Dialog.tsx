// Octet's one dialog: a small card over the window with a title, its fields, and Cancel and the action. Return
// does the action, Escape cancels, and the first field has the focus. Every dialog uses it (brand/CLAUDE.md).
import { useEffect, useRef } from "react";

type Props = { title: string; action: string; onAction: () => void; onClose: () => void; children: React.ReactNode };

export function Dialog({ title, action, onAction, onClose, children }: Props) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    card.current?.querySelector<HTMLElement>("input, button, select")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onAction(); }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [onAction, onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-buttons">
          <button className="dialog-button" onClick={onClose}>Cancel</button>
          <button className="dialog-button primary" onClick={onAction}>{action}</button>
        </div>
      </div>
    </div>
  );
}
