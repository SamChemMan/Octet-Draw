// The card the first time Octet connects itself to the AI apps on this computer (Editor connectAi, aiapps.rs), at the
// bottom right of the window: Octet's mark draws itself once at half size, as it does while an AI app draws (magic.ts,
// editor.css .mcp-parts), beside what changed. More info opens Octet and AI apps; the card stays until it is closed.
import { X } from "@phosphor-icons/react";
import { MarkParts } from "./McpMagic";
import { useLeaving } from "./motion";

export function AiCard({ apps, waiting, onMore, onClose }: { apps: string[]; waiting: boolean; onMore: () => void; onClose: () => void }) {
  const leaving = useLeaving(), list = apps.length > 1 ? `${apps.slice(0, -1).join(", ")} and ${apps[apps.length - 1]}` : apps[0];
  return (
    <div className={leaving ? "ai-card leaving" : "ai-card"} role="status" inert={leaving}>
      <div className="ai-card-mark" aria-hidden>
        <div className="ai-card-scale">
          <div className="mcp-mol"><MarkParts /></div>
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
