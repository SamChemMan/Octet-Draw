// While an AI app draws in this window (mcp.ts, decision 0021): the window behind goes soft under a light blur, a glow
// of Octet's colours turns slowly round its edge, and a glass pill at the bottom says who is drawing, how many steps it
// has taken, and offers Stop. It only dresses the window: the drawing under it changes at once, as decision 0024 asks,
// and nothing an AI app's tools wait for or measure waits for it. While a call runs, the window takes no clicks (Stop
// still works); between calls it stays a moment, so a run of calls reads as one piece of work, then fades.
// Reduced motion: the blur and the glow stay still, and only fade.
import { Sparkle } from "@phosphor-icons/react";
import { useLeaving } from "./motion";

export type Magic = { text: string; calling: boolean; steps: number; stop?: () => void };

export function McpMagic({ magic }: { magic: Magic }) {
  const leaving = useLeaving();
  const text = magic.text.replace(/\.$/, "");
  return (
    <div className={`mcp-magic${magic.calling ? " calling" : ""}${leaving ? " leaving" : ""}`} inert={leaving}>
      <div className="mcp-scrim" aria-hidden />
      <div className="mcp-glows" aria-hidden>
        <div className="mcp-bloom"><div className="mcp-glow wide"><div className="mcp-glow-turn" /></div></div>
        <div className="mcp-glow"><div className="mcp-glow-turn" /></div>
      </div>
      <div className="mcp-pill" role="status">
        <Sparkle size={16} aria-hidden className="mcp-sparkle" />
        <span className="mcp-text text-ui">{text}</span>
        <span className="mcp-steps text-ui">{magic.steps === 1 ? "1 step" : `${magic.steps} steps`}</span>
        {magic.calling && magic.stop && <button className="text-button" onClick={() => magic.stop?.()}>Stop</button>}
      </div>
    </div>
  );
}
