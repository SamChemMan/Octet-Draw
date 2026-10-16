// Rich text in captions: a caption's text as runs, each with its own style (as ChemDraw's text runs, and CDXML's
// <s> elements). A caption without runs is one run in the caption's own style.
export type RunStyle = { bold?: true; italic?: true; underline?: true; script?: "sub" | "super"; font?: string; size?: number; colour?: string };
export type TextRun = RunStyle & { text: string };

const KEYS = ["bold", "italic", "underline", "script", "font", "size", "colour"] as const;
export const sameStyle = (a: RunStyle, b: RunStyle) => KEYS.every((k) => a[k] === b[k]);
export const styleOf = (r: TextRun): RunStyle => Object.fromEntries(KEYS.filter((k) => r[k] !== undefined).map((k) => [k, r[k]])) as RunStyle;
export const plainOf = (runs: TextRun[]) => runs.map((r) => r.text).join("");
export const runsOf = (c: { text: string; runs?: TextRun[] }): TextRun[] => (c.runs?.length ? c.runs : [{ text: c.text }]);
// True when any run has a style of its own (otherwise the caption needs no runs).
export const styled = (runs: TextRun[]) => runs.some((r) => KEYS.some((k) => r[k] !== undefined));

// Neighbours in the same style become one run; empty runs go (one empty run stays for an empty text).
export function normalise(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) out[out.length - 1] = { ...last, text: last.text + r.text };
    else out.push({ ...r });
  }
  return out.length ? out : [{ text: "", ...styleOf(runs[0] ?? { text: "" }) }];
}

// The runs with characters start to end restyled by patch (each run's style in, its new style out).
export function styleRange(runs: TextRun[], start: number, end: number, patch: (s: RunStyle) => RunStyle): TextRun[] {
  const out: TextRun[] = [];
  let at = 0;
  for (const r of runs) {
    const a = at, b = at + r.text.length;
    at = b;
    if (b <= start || a >= end) { out.push(r); continue; }
    const s = Math.max(start, a) - a, e = Math.min(end, b) - a;
    if (s > 0) out.push({ ...r, text: r.text.slice(0, s) });
    out.push({ ...clean(patch(styleOf(r))), text: r.text.slice(s, e) });
    if (e < r.text.length) out.push({ ...r, text: r.text.slice(e) });
  }
  return normalise(out);
}
const clean = (s: RunStyle): RunStyle => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && (v as unknown) !== false)) as RunStyle;

// The style every character from start to end shares (a key is left out where they differ). An empty range gives
// the style of the character before it.
export function common(runs: TextRun[], start: number, end: number): RunStyle {
  const picked: RunStyle[] = [];
  let at = 0;
  for (const r of runs) {
    const a = at, b = at + r.text.length;
    at = b;
    if (start === end ? a < start && start <= b : b > start && a < end) picked.push(styleOf(r));
  }
  if (!picked.length) return runs.length ? styleOf(runs[0]) : {};
  return Object.fromEntries(KEYS.filter((k) => picked.every((s) => s[k] === picked[0][k]) && picked[0][k] !== undefined).map((k) => [k, picked[0][k]])) as RunStyle;
}

// The runs after the text was typed to `next`: what changed is found by the longest common start and end, and
// new characters take `pending` (a style set with nothing selected) or the style of the character before them.
export function edited(runs: TextRun[], next: string, pending?: RunStyle): TextRun[] {
  const old = plainOf(runs);
  let p = 0;
  while (p < old.length && p < next.length && old[p] === next[p]) p++;
  let s = 0;
  while (s < old.length - p && s < next.length - p && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
  const inserted = next.slice(p, next.length - s), style = pending ?? common(runs, p, p);
  const keep = (from: number, to: number) => {
    const out: TextRun[] = [];
    let at = 0;
    for (const r of runs) {
      const a = at, b = at + r.text.length;
      at = b;
      const x = Math.max(from, a), y = Math.min(to, b);
      if (y > x) out.push({ ...r, text: r.text.slice(x - a, y - a) });
    }
    return out;
  };
  return normalise([...keep(0, p), ...(inserted ? [{ ...style, text: inserted }] : []), ...keep(old.length - s, old.length)]);
}

// The runs line by line (split at each newline).
export function lines(runs: TextRun[]): TextRun[][] {
  const out: TextRun[][] = [[]];
  for (const r of runs) {
    r.text.split("\n").forEach((part, i) => {
      if (i) out.push([]);
      if (part) out[out.length - 1].push({ ...r, text: part });
    });
  }
  return out;
}
