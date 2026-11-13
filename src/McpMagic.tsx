// While an AI app draws in this window (mcp.ts, decision 0021): a molecule is built in the middle of the window, atom
// by atom in Octet's blue. Each atom pops in, the bonds draw between them, a ring closes, the molecule turns slowly,
// clears, and the next one starts (magic.ts has the molecules; editor.css moves them, with transforms and opacity
// only). It goes on there while the AI app thinks between calls. A glass pill at the bottom says who is drawing, how
// many steps it has taken and how far a long call is, and offers Stop. While a call runs the window is soft and takes
// no clicks (Stop still works); it stays soft a moment after (HOLD), then the drawing is clear again, but for the
// molecule. All of it fades a few seconds after the last call. It only dresses the window: the drawing under it
// changes at once, as decision 0024 asks, and nothing an AI app's tools wait for or measure waits for it.
// Reduced motion: one molecule, still, and only fades.
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { HOLD, parts, SKETCHES } from "./magic";
import { useLeaving } from "./motion";
import type { Store } from "./store";

export type Magic = { text: string; calling: boolean; steps?: number; stop?: () => void };

// progress: how far the call that runs is ("Step 9 of 17"), when it says. It is a store, so only the pill draws
// again. page: the page's paper (Editor's paperOf). The soft window and the molecule lie on the page, so they take
// its colours, as the canvas does; the pill takes the window's.
export function McpMagic({ magic, progress, page }: { magic: Magic; progress: Store<string | undefined>; page: { paper: string; dark: boolean; own?: string } }) {
  const leaving = useLeaving(), far = useSyncExternalStore(progress.subscribe, progress.get);
  // Each turn of the loop that shows the molecule (mcp-life) builds the next one, in a new element (key): its loop and
  // its parts start together, and the old one, which mcp-gone cleared, never shows again.
  const [turn, setTurn] = useState(0), { lines, dots } = parts(SKETCHES[turn % SKETCHES.length]);
  // The soft window of a call stays a moment after it (HOLD).
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
        {/* The molecule is plain boxes: the browser moves a box's transform and opacity without the page's thread.
            In Chrome an SVG's parts were laid out and painted again each frame (so the sparkle's motion is on a box
            too). */}
        <div key={turn} className="mcp-mol" onAnimationIteration={() => setTurn(turn + 1)}>
          <div className="mcp-parts">
            {lines.map((l, k) => <div key={k} className="mcp-bond" style={{ left: l.x, top: l.y, width: l.length, "--turn": `${l.turn}deg`, "--i": l.at } as CSSProperties} />)}
            {dots.map((d, k) => <div key={`a${k}`} className="mcp-atom" style={{ left: d.x, top: d.y, "--i": d.at } as CSSProperties} />)}
          </div>
        </div>
      </div>
      <div className="mcp-pill">
        <span className="mcp-sparkle" aria-hidden><Sparkle size={16} /></span>
        {/* A screen reader reads out who draws and the steps, as each changes. How far a call is changes many times
            in a call: it is there to read, and is not read out each time. */}
        <span className="mcp-said" role="status">
          <span className="mcp-text text-ui">{text}</span>
          {magic.steps !== undefined && <span className="mcp-steps text-ui">{magic.steps === 1 ? "1 step" : `${magic.steps} steps`}</span>}
        </span>
        {far && <span className="mcp-steps text-ui">{far}</span>}
        {magic.calling && magic.stop && <button className="text-button" onClick={() => magic.stop?.()}>Stop</button>}
      </div>
    </div>
  );
}

// Image to Structure's first-use card (decision 0027): a picture of a molecule is read, and the same molecule builds
// beside it, as it does while an AI app works. Each turn of the molecule's loop takes the next sketch, in the picture
// too. Reduced motion: the picture and the molecule, still.
export function PictureDemo() {
  const [turn, setTurn] = useState(0), { lines, dots } = parts(SKETCHES[turn % SKETCHES.length]);
  const line = (l: (typeof lines)[number], k: number, className: string) => <div key={k} className={className} style={{ left: l.x, top: l.y, width: l.length, "--turn": `${l.turn}deg`, "--i": l.at } as CSSProperties} />;
  return (
    <div className="pic-demo" aria-hidden>
      <div key={turn} className="pic-photo">
        <div className="pic-sketch">{lines.map((l, k) => line(l, k, "pic-line"))}</div>
        <div className="pic-scan" />
      </div>
      <ArrowRight className="pic-arrow" size={16} />
      <div className="pic-built">
        <div key={turn} className="mcp-mol" onAnimationIteration={() => setTurn(turn + 1)}>
          <div className="mcp-parts">
            {lines.map((l, k) => line(l, k, "mcp-bond"))}
            {dots.map((d, k) => <div key={`a${k}`} className="mcp-atom" style={{ left: d.x, top: d.y, "--i": d.at } as CSSProperties} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
