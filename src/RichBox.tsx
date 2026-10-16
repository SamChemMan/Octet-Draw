// The box a caption is typed in: rich text, each run in its own style, over the caption on the canvas.
// Security: the box is built from text nodes and spans made here (textContent, never HTML), styles are read back from
// each span's own data, and paste inserts plain text only.
import { useEffect, useLayoutEffect, useRef } from "react";
import { edited, normalise, plainOf, styleOf, type RunStyle, type TextRun } from "./richtext";

export type RichApi = { range: () => [number, number] | undefined; select: (start: number, end: number) => void };

type Props = {
  runs: TextRun[];
  version: number; // changes when the runs were changed from outside (a style applied): the box is built again
  caret?: [number, number]; // where the selection goes after it is built again
  pending?: RunStyle; // the style set with nothing selected: the next characters typed take it
  look: (r: RunStyle) => React.CSSProperties; // how a run looks in the box (font, size at the current zoom, colour)
  style: React.CSSProperties;
  api: React.MutableRefObject<RichApi | undefined>;
  onRuns: (runs: TextRun[], rebuild?: [number, number]) => void; // rebuild: build the box again, the caret there
  onKeyDown: (e: React.KeyboardEvent) => void;
  onBlur: () => void;
};

// Character offsets in the box, counting each span's text and each line break.
function offsetOf(root: Node, node: Node, offset: number): number {
  let count = 0, found = -1;
  const walk = (n: Node) => {
    if (found >= 0) return;
    if (n === node && n.nodeType !== Node.TEXT_NODE) {
      for (let i = 0; i < offset; i++) count += lengthOf(n.childNodes[i]);
      found = count;
      return;
    }
    if (n.nodeType === Node.TEXT_NODE) { if (n === node) { found = count + offset; return; } count += n.textContent?.length ?? 0; return; }
    if (n instanceof HTMLBRElement) { if (!("end" in n.dataset)) count += 1; return; }
    n.childNodes.forEach(walk);
  };
  walk(root);
  return found < 0 ? count : found;
}
const lengthOf = (n: Node | undefined): number =>
  !n ? 0 : n.nodeType === Node.TEXT_NODE ? n.textContent?.length ?? 0 : n instanceof HTMLBRElement ? ("end" in n.dataset ? 0 : 1) : [...n.childNodes].reduce((s, c) => s + lengthOf(c), 0);
function pointAt(root: Node, index: number): [Node, number] {
  let left = index;
  const texts: Text[] = [];
  const walk = (n: Node) => { if (n.nodeType === Node.TEXT_NODE) texts.push(n as Text); else n.childNodes.forEach(walk); };
  walk(root);
  for (const t of texts) { const n = t.textContent?.length ?? 0; if (left <= n) return [t, left]; left -= n; }
  return [root, root.childNodes.length];
}

// The runs the box holds now: each text node in the style of the span it is in.
function read(root: HTMLElement): TextRun[] {
  const out: TextRun[] = [];
  const walk = (n: Node, style: RunStyle) => {
    if (n.nodeType === Node.TEXT_NODE) { out.push({ ...style, text: n.textContent ?? "" }); return; }
    if (n instanceof HTMLBRElement) { if (!("end" in n.dataset)) out.push({ ...style, text: "\n" }); return; }
    if (n instanceof HTMLElement) {
      let s = style;
      if (n.dataset.style) { try { s = JSON.parse(n.dataset.style) as RunStyle; } catch { s = style; } }
      // A block the browser made for a new line starts on a line of its own.
      if (n.tagName === "DIV" && out.length && !plainOf(out).endsWith("\n")) out.push({ ...s, text: "\n" });
      n.childNodes.forEach((c) => walk(c, s));
    }
  };
  root.childNodes.forEach((c) => walk(c, {}));
  return normalise(out);
}

export function RichBox(p: Props) {
  const box = useRef<HTMLDivElement>(null), runs = useRef(p.runs);
  runs.current = p.runs;
  // Builds the box from the runs (on opening, and after a style is applied), then puts the selection back.
  const build = (caret?: [number, number]) => {
    const el = box.current!;
    const nodes: Node[] = p.runs.filter((r) => r.text).map((r) => {
      const span = document.createElement("span");
      span.dataset.style = JSON.stringify(styleOf(r));
      span.textContent = r.text;
      Object.assign(span.style, p.look(r));
      return span;
    });
    const text = plainOf(p.runs);
    if (!text || text.endsWith("\n")) { const br = document.createElement("br"); br.dataset.end = ""; nodes.push(br); }
    el.replaceChildren(...nodes);
    const [s, e] = caret ?? [text.length, text.length];
    select(s, e);
  };
  const select = (start: number, end: number) => {
    const el = box.current!, sel = getSelection();
    if (!sel) return;
    const r = document.createRange(), [a, ao] = pointAt(el, start), [b, bo] = pointAt(el, end);
    r.setStart(a, ao);
    r.setEnd(b, bo);
    sel.removeAllRanges();
    sel.addRange(r);
  };
  useLayoutEffect(() => { build(p.caret); box.current?.focus(); }, [p.version]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    p.api.current = {
      range: () => {
        const sel = getSelection(), el = box.current;
        if (!sel || !el || !sel.rangeCount || !el.contains(sel.anchorNode)) return undefined;
        const r = sel.getRangeAt(0), a = offsetOf(el, r.startContainer, r.startOffset), b = offsetOf(el, r.endContainer, r.endOffset);
        return [Math.min(a, b), Math.max(a, b)];
      },
      select,
    };
  });
  return (
    <div
      ref={box}
      className="caption-box rich"
      data-theme="light"
      role="textbox"
      aria-label="Caption"
      aria-multiline
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={p.style}
      onInput={() => {
        const el = box.current!, now = read(el);
        if (!p.pending) return p.onRuns(now);
        // Characters typed after a style was set with nothing selected take that style; the box is built again.
        p.onRuns(edited(runs.current, plainOf(now), p.pending), p.api.current?.range());
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
        if (text) document.execCommand("insertText", false, text);
      }}
      onDrop={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        // A new line with Shift-Return; the browser's own bold, italic and underline are not used (Octet's are).
        if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); document.execCommand("insertText", false, "\n"); return; }
        if ((e.metaKey || e.ctrlKey) && ["b", "i", "u"].includes(e.key.toLowerCase())) e.preventDefault();
        p.onKeyDown(e);
      }}
      onBlur={p.onBlur}
    />
  );
}
