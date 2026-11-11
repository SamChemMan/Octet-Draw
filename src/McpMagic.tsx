// While an AI app draws in this window (mcp.ts, decision 0021): a molecule is built in the middle of the window, atom
// by atom in Octet's blue. Each atom pops in, the bonds draw between them, a ring closes, the molecule turns slowly,
// clears, and the next one starts (magic.ts has the molecules; editor.css moves them, with transforms and opacity only). A glass pill at the bottom says who is drawing, how
// many steps it has taken and how far a long call is, and offers Stop. While a call runs, and for a moment after, the
// window is soft and takes no clicks (Stop still works). Between calls the AI app is thinking: the molecule goes on,
// but moves down to the pill, so the drawing is clear (the canvas comes first). All of it fades a few seconds after
// the last call. It only dresses the window: the drawing under it changes at once, as decision 0024 asks, and nothing
// an AI app's tools wait for or measure waits for it.
// Reduced motion: one molecule, still, by the pill, and only fades.
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Sparkle } from "@phosphor-icons/react";
import { HOLD, parts, SKETCHES } from "./magic";
import { useLeaving } from "./motion";
import type { Store } from "./store";

export type Magic = { text: string; calling: boolean; steps: number; stop?: () => void };


// progress: how far the call that runs is ("9 of 17"), when it says. It is a store, so only the pill draws again.
// page: the page's paper (Editor's paperOf). The soft window and the molecule lie on the page, so they take its
// colours, as the canvas does; the pill takes the window's.
export function McpMagic({ magic, progress, page }: { magic: Magic; progress: Store<string | undefined>; page: { paper: string; dark: boolean; own?: string } }) {
  const leaving = useLeaving(), far = useSyncExternalStore(progress.subscribe, progress.get);
  // Each turn of the loop that shows the molecule (mcp-life) builds the next one.
  const [turn, setTurn] = useState(0), { lines, dots } = parts(SKETCHES[turn % SKETCHES.length]);
  // The look of a call stays a moment after it (HOLD).
  const [held, setHeld] = useState(magic.calling);
  useEffect(() => {
    if (magic.calling) return setHeld(true);
    const t = setTimeout(() => setHeld(false), HOLD);
    return () => clearTimeout(t);
  }, [magic.calling]);
  const text = magic.text.replace(/\.$/, "");
  const onPage = { "data-theme": page.dark ? "dark" : "light", style: page.own ? ({ "--canvas": page.own } as CSSProperties) : undefined, "aria-hidden": true };
  return (
    <div className={`mcp-magic${magic.calling ? " calling" : ""}${held ? " held" : ""}${leaving ? " leaving" : ""}`} inert={leaving}>
      <div className={`mcp-scrim paper-${page.paper}`} {...onPage} />
      <div className={`mcp-stage paper-${page.paper}`} {...onPage}>
        {/* Plain boxes, not an SVG: the browser moves a box's transform and opacity without the page's thread, and
            an SVG's parts it lays out and paints again each frame (so the sparkle's motion is on a box too). */}
        <div className="mcp-mol" onAnimationIteration={() => setTurn(turn + 1)}>
          {lines.map((l, k) => <div key={`${turn}-${k}`} className="mcp-bond" style={{ left: l.x, top: l.y, width: l.length, "--turn": `${l.turn}deg`, "--i": l.at } as CSSProperties} />)}
          {dots.map((d, k) => <div key={`${turn}.${k}`} className="mcp-atom" style={{ left: d.x, top: d.y, "--i": d.at } as CSSProperties} />)}
        </div>
      </div>
      <div className="mcp-pill" role="status">
        <span className="mcp-sparkle" aria-hidden><Sparkle size={16} /></span>
        <span className="mcp-text text-ui">{text}</span>
        <span className="mcp-steps text-ui">{magic.steps === 1 ? "1 step" : `${magic.steps} steps`}</span>
        {far && <span className="mcp-steps text-ui">{far}</span>}
        {magic.calling && magic.stop && <button className="text-button" onClick={() => magic.stop?.()}>Stop</button>}
      </div>
    </div>
  );
}
