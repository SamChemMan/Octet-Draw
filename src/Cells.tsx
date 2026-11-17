// A grid of fields to type a table in: a chart's data (ChartDialog.tsx) and a structure's data fields (DataDialog.tsx).
// head: the first row names the columns, and its first cell is empty. Up and Down move between rows. Paste fills from
// the cell pasted in, and grows the grid as far as `most` rows and columns. kinds: a column's fields, one line of text
// (the default), lines of text (one line in view, the caret's: Shift+Return or Option+Return makes a new line, and
// Return does the dialog's action), or a switch. limit: the most characters a column's field takes.
import { pastedRows, spare } from "./charts";
import { Switch } from "./Fields";

export type CellKind = "text" | "lines" | "switch";
type Props = {
  label: string; cells: string[][]; head: boolean; most: [number, number]; name: (r: number, c: number) => string; placeholder: (r: number, c: number) => string; onChange: (cells: string[][]) => void;
  kinds?: CellKind[]; limit?: (c: number) => number; columns?: string; first?: [number, number];
  // A pasted table that names the columns and rows: it goes in from the corner.
  headed?: (rows: string[][]) => boolean;
  // titles: each column's name, over it. disabled: a field that does not apply now.
  titles?: string[]; disabled?: (r: number, c: number) => boolean;
};

export function Cells({ label, cells, head, most, name, placeholder, onChange, kinds, limit = () => 200, columns, first, headed: isHeaded, titles, disabled }: Props) {
  const cols = cells[0].length, kind = (c: number): CellKind => kinds?.[c] ?? "text";
  const change = (next: string[][]) => onChange(spare(next, most, head));
  const set = (r: number, c: number, text: string) => change(cells.map((line, i) => (i === r ? line.map((x, j) => (j === c ? text : x)) : line)));
  const [r1, c1] = first ?? [head ? 1 : 0, 1];
  return (
    <div className="chart-table" role="group" aria-label={label} style={{ gridTemplateColumns: columns ?? `repeat(${cols}, minmax(72px, 1fr))` }}
      onKeyDown={(e) => {
        const at = (e.target as HTMLElement).dataset;
        if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || at.r === undefined || e.altKey || e.metaKey) return;
        // In lines of text, Up and Down move between its lines first.
        const t = e.target;
        if (t instanceof HTMLTextAreaElement && (e.key === "ArrowUp" ? t.value.lastIndexOf("\n", t.selectionStart - 1) >= 0 : t.value.indexOf("\n", t.selectionEnd) >= 0)) return;
        const next = e.currentTarget.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-r="${Number(at.r) + (e.key === "ArrowUp" ? -1 : 1)}"][data-c="${at.c}"]`);
        if (!next) return;
        e.preventDefault();
        next.focus();
        if (!(next instanceof HTMLButtonElement)) next.select();
      }}
      onPaste={(e) => {
        const rows = pastedRows(e.clipboardData.getData("text/plain"), most[0], most[1], Math.max(...Array.from({ length: cols }, (_, c) => limit(c))));
        const at = (e.target as HTMLElement).dataset;
        if (!rows.length || at.r === undefined) return;
        e.preventDefault();
        // A whole table (a row of path names on top, a column of state names at the left) pasted at the top of the
        // sheet goes in from the corner, so its names name the paths and the states.
        const headed = head && Number(at.r) <= 1 && Number(at.c) <= 1 && !!isHeaded?.(rows);
        const r0 = headed ? 0 : Number(at.r), c0 = headed ? 0 : Number(at.c), next = cells.map((r) => [...r]);
        rows.forEach((row, i) => row.forEach((text, j) => {
          const r = r0 + i, c = c0 + j;
          if (r >= most[0] || c >= most[1] || (c >= cols && !head) || (headed && r === 0 && c === 0) || kind(c) === "switch") return;
          while (next.length <= r) next.push(Array(next[0].length).fill(""));
          if (c >= next[0].length) for (const line of next) while (line.length <= c) line.push("");
          next[r][c] = text.slice(0, limit(c));
        }));
        change(next);
      }}>
      {titles?.map((t, c) => <span key={`title:${c}`} className="cell-title" aria-hidden>{t}</span>)}
      {cells.map((row, r) => row.map((text, c) => {
        if (head && r === 0 && c === 0) return <span key="corner" />;
        const common = { "aria-label": name(r, c), "data-r": r, "data-c": c, "data-first": c === c1 && r === r1 ? "" : undefined };
        const off = disabled?.(r, c);
        if (kind(c) === "switch") return <span key={`${r}:${c}`} className="cell-switch"><Switch on={!!text && !off} label={name(r, c)} disabled={off} onChange={(on) => set(r, c, on ? "1" : "")} /></span>;
        return (
          <span key={`${r}:${c}`} className="unit-field text">
            {kind(c) === "lines"
              ? <textarea {...common} value={text} rows={1} maxLength={limit(c)} spellCheck={false} placeholder={placeholder(r, c)} onChange={(e) => set(r, c, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  const t = e.currentTarget;
                  // Shift+Return or Option+Return: a new line where the caret is. Return: the dialog's action.
                  if (e.shiftKey || e.altKey) {
                    const [a, b] = [t.selectionStart, t.selectionEnd], value = t.value.slice(0, a) + "\n" + t.value.slice(b);
                    if (value.length > limit(c)) return;
                    set(r, c, value);
                    requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 1; });
                  } else t.closest(".dialog")?.querySelector<HTMLButtonElement>(".dialog-button.primary:not(:disabled)")?.click();
                }} />
              : <input {...common} value={text} maxLength={limit(c)} spellCheck={false} placeholder={placeholder(r, c)} onChange={(e) => set(r, c, e.target.value)} />}
          </span>
        );
      }))}
    </div>
  );
}
