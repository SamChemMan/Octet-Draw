// A chart's data (Object > Add Chart, and Edit data on a chart): one grid to type in, and nothing else. An energy
// diagram has a row for each state and a column for each path; a sensitivity screen a row for each condition. A cell
// is a number, a second value in brackets and a name of its own (charts.ts parseCell), as the empty row shows. There is
// always one empty row, and for an energy diagram one empty column, to type the next one in. A table copied from a
// spreadsheet pastes from the cell it is pasted in. A row or a column left empty is left out. How the chart looks
// (joins, axis, key, zones, scale, colours) is in the Actions panel when the chart is picked.
import { useState } from "react";
import { Dialog } from "./Dialog";
import { coverScale, energyOfTable, energyRoles, MAX_AXES, MAX_PATHS, MAX_STATES, parseCell, pastedRows, radarOfRows, radarRoles, rowsOfRadar, spare, tableOfEnergy, type Chart, type EnergyChart, type RadarChart } from "./charts";

// What a chart shows, without its place on the page.
export type ChartData = Omit<EnergyChart, "frame" | "origin" | "scale" | "text" | "roles"> | Omit<RadarChart, "frame" | "origin" | "scale" | "text" | "roles">;

// A grid of text fields. head: the first row names the columns, and its first cell is empty. Up and Down move between
// rows. Paste fills from the cell pasted in, and grows the grid as far as `most` rows and columns.
function Cells({ label, cells, head, most, placeholder, onChange }: { label: string; cells: string[][]; head: boolean; most: [number, number]; placeholder: (r: number, c: number) => string; onChange: (cells: string[][]) => void }) {
  // Each field's name for a screen reader: a path's name is "Path 2", a state's name "State 3", an energy "TS1, Path B";
  // a condition's name is "Condition 4" and its value "High T, value".
  const cols = cells[0].length, name = (r: number, c: number) => (head
    ? r === 0 ? `Path ${c}` : c === 0 ? `State ${r}` : `${cells[r][0] || `State ${r}`}, ${cells[0][c] || `Path ${c}`}`
    : c === 0 ? `Condition ${r + 1}` : `${cells[r][0] || `Condition ${r + 1}`}, value`);
  const change = (next: string[][]) => onChange(spare(next, most, head));
  return (
    <div className="chart-table" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${cols}, minmax(72px, 1fr))` }}
      onKeyDown={(e) => {
        const at = (e.target as HTMLElement).dataset;
        if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || at.r === undefined || e.altKey || e.metaKey) return;
        const next = e.currentTarget.querySelector<HTMLInputElement>(`input[data-r="${Number(at.r) + (e.key === "ArrowUp" ? -1 : 1)}"][data-c="${at.c}"]`);
        if (!next) return;
        e.preventDefault();
        next.focus();
        next.select();
      }}
      onPaste={(e) => {
        const rows = pastedRows(e.clipboardData.getData("text/plain")), at = (e.target as HTMLElement).dataset;
        if (!rows.length || at.r === undefined) return;
        e.preventDefault();
        // A whole table (a row of path names on top, a column of state names at the left) pasted at the top of the
        // sheet goes in from the corner, so its names name the paths and the states.
        const headed = head && Number(at.r) <= 1 && Number(at.c) <= 1 && rows.length > 1 && rows[0].slice(1).some(Boolean) && (rows[0][0] === "" || rows[0].slice(1).every((x) => !parseCell(x))) && rows.slice(1).every((r) => !parseCell(r[0]));
        const r0 = headed ? 0 : Number(at.r), c0 = headed ? 0 : Number(at.c), next = cells.map((r) => [...r]);
        rows.forEach((row, i) => row.forEach((text, j) => {
          const r = r0 + i, c = c0 + j;
          if (r >= most[0] || c >= most[1] || (c >= cols && !head) || (headed && r === 0 && c === 0)) return;
          while (next.length <= r) next.push(Array(next[0].length).fill(""));
          if (c >= next[0].length) for (const line of next) while (line.length <= c) line.push("");
          next[r][c] = text;
        }));
        change(next);
      }}>
      {cells.map((row, r) => row.map((text, c) => (head && r === 0 && c === 0 ? <span key="corner" /> : (
        <span key={`${r}:${c}`} className="unit-field text">
          <input aria-label={name(r, c)} data-r={r} data-c={c} data-first={c === 1 && r === (head ? 1 : 0) ? "" : undefined} value={text} maxLength={200} spellCheck={false} placeholder={placeholder(r, c)}
            onChange={(e) => change(cells.map((line, i) => (i === r ? line.map((x, j) => (j === c ? e.target.value : x)) : line)))} />
        </span>
      ))))}
    </div>
  );
}

export function ChartDialog({ chart, adding, onClose, onDone }: { chart: ChartData; adding: boolean; onClose: () => void; onDone: (change: Partial<Chart>, rename: (role: string) => string | undefined) => void }) {
  const energyMost: [number, number] = [MAX_STATES + 1, MAX_PATHS + 1], radarMost: [number, number] = [MAX_AXES, 2];
  // The energy diagram's cells: the paths' names in the first row, then a row for each state.
  const [energy, setEnergy] = useState(() => { if (chart.kind !== "energy") return [[""]]; const t = tableOfEnergy(chart); return spare([["", ...t.paths], ...t.rows], energyMost, true); });
  // A new sensitivity screen names the paper's conditions and has no values yet.
  const [rows, setRows] = useState(() => (chart.kind === "radar" ? spare(adding ? chart.axes.map((x) => [x.label, ""]) : rowsOfRadar(chart), radarMost, false) : [["", ""]]));
  if (chart.kind === "energy") {
    const table = { paths: energy[0].slice(1), rows: energy.slice(1) }, data = energyOfTable(table, adding ? undefined : chart), last = energy.length - 1;
    return (
      <Dialog title="Energy diagram" action={adding ? "Add" : "Apply"} disabled={!data} onClose={onClose} onAction={() => data && onDone(data, energyRoles(table))}>
        {/* The empty row shows what a cell takes: an energy, a second value in brackets, a name of its own. */}
        <Cells label="States and paths" cells={energy} head most={energyMost} placeholder={(r, c) => (r === 0 ? `Path ${c}` : c === 0 ? "Name" : r === last && c === 1 ? "18.6 (15.2) TS′" : "")} onChange={setEnergy} />
      </Dialog>
    );
  }
  const axes = radarOfRows(rows);
  return (
    <Dialog title="Sensitivity screen" action={adding ? "Add" : "Apply"} disabled={!axes} onClose={onClose} onAction={() => axes && onDone({ axes, ...coverScale({ ...chart, axes }) }, radarRoles(rows))}>
      <Cells label="Conditions" cells={rows} head={false} most={radarMost} placeholder={(r, c) => (c === 0 ? "Condition" : r === rows.length - 1 ? "−12 (−30)" : "%")} onChange={setRows} />
    </Dialog>
  );
}
