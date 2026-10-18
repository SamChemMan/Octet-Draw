// Motion in script, from the same tokens as the CSS (brand/tokens.css): animations made with element.animate(), and
// Exit, which lets an overlay leave with a motion instead of vanishing in one frame.
import { cloneElement, createContext, isValidElement, useContext, useEffect, useReducer, useRef } from "react";

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// A motion token (--motion-fast, --motion, --motion-slow) as Web Animations timing, with the brand's ease-out.
export function timing(token = "--motion") {
  const root = getComputedStyle(document.documentElement);
  return { duration: parseFloat(root.getPropertyValue(token)) || 180, easing: root.getPropertyValue("--ease-out").trim() || "ease-out" };
}

// True inside an overlay that is leaving. The overlay adds the class "leaving" to its root (editor.css plays the exit)
// and is inert, so it takes no clicks or keys on its way out.
const Leaving = createContext(false);
export const useLeaving = () => useContext(Leaving);

// Wrap an overlay that comes and goes: <Exit>{open && <Menu … />}</Exit>. When it closes, Exit keeps it on screen for
// the exit (motion-fast), then lets it go. A plain element (a div, an input) gets "leaving" and inert from Exit; a
// component reads useLeaving. Opened again while it leaves, a new one opens. Reduced motion: it goes at once.
export function Exit({ children }: { children: React.ReactNode }) {
  const shown = !!children, kept = useRef<React.ReactNode>(null), round = useRef(0), was = useRef(false);
  const [, gone] = useReducer((n: number) => n + 1, 0);
  if (shown && !was.current) round.current++;
  was.current = shown;
  if (shown) kept.current = children;
  else if (kept.current && reduced()) kept.current = null;
  useEffect(() => {
    if (shown || !kept.current) return;
    const t = setTimeout(() => { kept.current = null; gone(); }, timing("--motion-fast").duration);
    return () => clearTimeout(t);
  }, [shown]);
  let k = kept.current;
  if (!k) return null;
  if (!shown && isValidElement<{ className?: string; inert?: boolean }>(k) && typeof k.type === "string")
    k = cloneElement(k, { className: [k.props.className, "leaving"].filter(Boolean).join(" "), inert: true });
  return <Leaving.Provider key={round.current} value={!shown}>{k}</Leaving.Provider>;
}
