// The notice at the bottom of the window. Its icon says what kind it is (notice.ts). It stays long enough to read,
// stays while the pointer is on it, and fades out. An error is read out at once; other kinds wait their turn.
import { useEffect, useState } from "react";
import { CheckCircle, Info, Warning, X } from "@phosphor-icons/react";
import { noticeTime, type NoticeKind } from "./notice";

export type Notice = { text: string; kind: NoticeKind; action?: { label: string; run: () => void }; n: number };

const ICONS: Record<NoticeKind, React.ReactNode> = {
  error: <Warning size={16} weight="bold" aria-hidden />,
  info: <Info size={16} weight="bold" aria-hidden />,
  done: <CheckCircle size={16} weight="bold" aria-hidden />,
};

export function NoticeBar({ notice, onGone }: { notice: Notice; onGone: () => void }) {
  const [held, setHeld] = useState(false), [leaving, setLeaving] = useState(false);
  useEffect(() => setLeaving(false), [notice.n]);
  useEffect(() => {
    if (held || leaving) return;
    const t = setTimeout(() => setLeaving(true), noticeTime(notice.text));
    return () => clearTimeout(t);
  }, [notice.n, held, leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  // The fade-out is 150 ms; the notice goes when it ends (or after 200 ms, if the animation does not run).
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(onGone, 200);
    return () => clearTimeout(t);
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`notice ${notice.kind}${leaving ? " leaving" : ""}`} role={notice.kind === "error" ? "alert" : "status"}
      onPointerEnter={() => { setHeld(true); setLeaving(false); }} onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={() => setHeld(false)} onAnimationEnd={(e) => { if (leaving && e.target === e.currentTarget) onGone(); }}>
      {ICONS[notice.kind]}
      <span className="notice-text text-ui">{notice.text}</span>
      {notice.action && <button className="text-button" onClick={() => { notice.action!.run(); onGone(); }}>{notice.action.label}</button>}
      <button className="notice-close" aria-label="Close" onClick={onGone}><X size={12} weight="bold" /></button>
    </div>
  );
}
