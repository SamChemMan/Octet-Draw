// The card the first time Octet connects itself to the AI apps on this computer (Editor connectAi, aiapps.rs), at the
// bottom right of the window: Octet's mark draws itself once at half size, as it does while an AI app draws (magic.ts,
// editor.css .mcp-parts), beside what changed. More info opens Octet and AI apps; the card stays until it is closed.
import type { CSSProperties } from "react";
import { X } from "@phosphor-icons/react";
import { FILL, LINE, mark, MARK } from "./magic";
import { useLeaving } from "./motion";

const LINES = mark();
const stroke = (l: (typeof LINES)["bonds"][number], k: number) => <div key={k} className="mcp-bond" style={{ left: l.x, top: l.y, width: l.length + LINE, "--turn": `${l.turn}deg`, "--i": l.at } as CSSProperties} />;

export function AiCard({ apps, waiting, onMore, onClose }: { apps: string[]; waiting: boolean; onMore: () => void; onClose: () => void }) {
  const leaving = useLeaving(), list = apps.length > 1 ? `${apps.slice(0, -1).join(", ")} and ${apps[apps.length - 1]}` : apps[0];
  return (
    <div className={leaving ? "ai-card leaving" : "ai-card"} role="status" inert={leaving}>
      <div className="ai-card-mark" aria-hidden>
        <div className="ai-card-scale">
          <div className="mcp-mol">
            <div className="mcp-parts" style={{ "--fill": FILL } as CSSProperties}>
              {LINES.bonds.map(stroke)}
              <div className="mcp-kekule">{LINES.inner.map(stroke)}</div>
              {LINES.edges.map(stroke)}
              <div className="mcp-fill" style={{ width: MARK, height: MARK, margin: -MARK / 2 }} />
            </div>
          </div>
        </div>
      </div>
      <div className="ai-card-body text-ui">
        <p>Nothing has changed, but Octet can now work with {list}.{waiting ? " Open Claude again to start." : ""}</p>
        <button className="text-button" onClick={onMore}>More info</button>
      </div>
      <button className="actions-close" aria-label="Close" data-tip="Close" onClick={onClose}><X size={12} /></button>
    </div>
  );
}
