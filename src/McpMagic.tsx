// While an AI app draws in this window (mcp.ts, decision 0021): Octet's mark draws itself in the middle of the window,
// in Octet's blue. The hexagon's six bonds draw one after another, then a Kekulé benzene's three inner lines, then the
// octagon's edges sweep round it and the solid mark fades in, as the app icon draws it. It holds, leaves softly and
// starts again (magic.ts has the mark; editor.css moves it, with transforms and opacity only). It goes on there while
// the AI app thinks between calls. A glass pill at the bottom says who is drawing, how many steps it has taken and how
// far a long call is, and offers Stop. While a call runs the window is soft and takes no clicks (Stop still works); it
// stays soft a moment after (HOLD), then the drawing is clear again, but for the mark. All of it fades a few seconds
// after the last call. It only dresses the window: the drawing under it changes at once, as decision 0024 asks, and
// nothing an AI app's tools wait for or measure waits for it.
// Reduced motion: the mark, still, and only fades.
import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { ArrowRight, Sparkle } from "@phosphor-icons/react";
import { DEMO_MOLS, FILL, HOLD, LINE, mark, MARK } from "./magic";
import { StructureThumb } from "./TemplateLibrary";
import { useLeaving } from "./motion";
import type { Store } from "./store";

// A line of the mark: a box drawn out from its start (editor.css .mcp-bond).
type Line = ReturnType<typeof mark>["bonds"][number];
const stroke = (l: Line, k: number) => <div key={k} className="mcp-bond" style={{ left: l.x, top: l.y, width: l.length + LINE, "--turn": `${l.turn}deg`, "--i": l.at } as CSSProperties} />;
const MARK_LINES = mark();

export type Magic = { text: string; calling: boolean; steps?: number; stop?: () => void };

// progress: how far the call that runs is ("Step 9 of 17"), when it says. It is a store, so only the pill draws
// again. page: the page's paper (Editor's paperOf). The soft window and the molecule lie on the page, so they take
// its colours, as the canvas does; the pill takes the window's.
export function McpMagic({ magic, progress, page }: { magic: Magic; progress: Store<string | undefined>; page: { paper: string; dark: boolean; own?: string } }) {
  const leaving = useLeaving(), far = useSyncExternalStore(progress.subscribe, progress.get);
  // Each turn of the loop that shows the mark (mcp-life) draws it again, in a new element (key): its loop and its parts
  // start together, and the old one, which mcp-gone cleared, never shows again.
  const [turn, setTurn] = useState(0);
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
        {/* The mark is plain boxes: the browser moves a box's transform and opacity without the page's thread. In
            Chrome an SVG's parts were laid out and painted again each frame (so the sparkle's motion is on a box too).
            The solid mark is a box cut to the mark's shape (editor.css .mcp-fill) that only fades. */}
        <div key={turn} className="mcp-mol" onAnimationIteration={() => setTurn(turn + 1)}>
          <div className="mcp-parts" style={{ "--fill": FILL } as CSSProperties}>
            {MARK_LINES.bonds.map(stroke)}
            <div className="mcp-kekule">{MARK_LINES.inner.map(stroke)}</div>
            {MARK_LINES.edges.map(stroke)}
            <div className="mcp-fill" style={{ width: MARK, height: MARK, margin: -MARK / 2 }} />
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

// Image to Structure's first-use card (decision 0026): a photo of a molecule is read by a line that sweeps down it,
// and Octet's drawing of the same molecule (its own renderer, ACS Document 1996) shows beside it as the line goes.
// Each turn of the loop takes the next molecule. Reduced motion: the photo and the drawing, still.
export function PictureDemo() {
  const [turn, setTurn] = useState(0), { id, mol } = DEMO_MOLS[turn % DEMO_MOLS.length];
  return (
    <div className="pic-demo" aria-hidden>
      <div key={turn} className="pic-photo">
        <StructureThumb id={id} mol={mol} />
        <div className="pic-scan" />
      </div>
      <ArrowRight className="pic-arrow" size={16} />
      <div key={`d${turn}`} className="pic-built">
        <StructureThumb id={id} mol={mol} />
        <div className="pic-cover" onAnimationIteration={() => setTurn(turn + 1)} />
      </div>
    </div>
  );
}
