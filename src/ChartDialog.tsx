// A chart's data (Object > Add Chart, and Edit data on a chart): one grid to type in, and nothing else. An energy
// diagram has a row for each state and a column for each path; a sensitivity screen a row for each condition. A cell
// is a number, a second value in brackets and a name of its own (charts.ts parseCell), as the empty row shows. There is
// always one empty row, and for an energy diagram one empty column, to type the next one in. A table copied from a
// spreadsheet pastes from the cell it is pasted in. A row or a column left empty is left out. How the chart looks
// (joins, axis, key, zones, scale, colours) is in the Actions panel when the chart is picked.
import { useState } from "react";
import { Cells } from "./Cells";
import { Dialog } from "./Dialog";
import { coverScale, energyOfTable, energyRoles, longNames, MAX_AXES, MAX_PATHS, MAX_STATES, parseCell, radarOfRows, radarRoles, rowsOfRadar, spare, tableOfEnergy, type Chart, type EnergyChart, type RadarChart } from "./charts";

// What a chart shows, without its place on the page.
export type ChartData = Omit<EnergyChart, "frame" | "origin" | "scale" | "text" | "roles"> | Omit<RadarChart, "frame" | "origin" | "scale" | "text" | "roles">;

// Each field's name for a screen reader: a path's name is "Path 2", a state's name "State 3", an energy "TS1, Path B";
// a condition's name is "Condition 4" and its value "High T, value".
const nameOf = (cells: string[][], head: boolean) => (r: number, c: number) => (head
  ? r === 0 ? `Path ${c}` : c === 0 ? `State ${r}` : `${cells[r][0] || `State ${r}`}, ${cells[0][c] || `Path ${c}`}`
  : c === 0 ? `Condition ${r + 1}` : `${cells[r][0] || `Condition ${r + 1}`}, value`);
// A whole table pasted at the top of the sheet: a row of path names on top, a column of state names at the left.
const headed = (rows: string[][]) => rows.length > 1 && rows[0].slice(1).some(Boolean) && (rows[0][0] === "" || rows[0].slice(1).every((x) => !parseCell(x))) && rows.slice(1).every((r) => !parseCell(r[0]));

export function ChartDialog({ chart, adding, onClose, onDone }: { chart: ChartData; adding: boolean; onClose: () => void; onDone: (change: Partial<Chart>, rename: (role: string) => string | undefined, cut?: boolean) => void }) {
  const energyMost: [number, number] = [MAX_STATES + 1, MAX_PATHS + 1], radarMost: [number, number] = [MAX_AXES, 2];
  // The energy diagram's cells: the paths' names in the first row, then a row for each state.
  const [energy, setEnergy] = useState(() => { if (chart.kind !== "energy") return [[""]]; const t = tableOfEnergy(chart); return spare([["", ...t.paths], ...t.rows], energyMost, true); });
  // A new sensitivity screen names the paper's conditions and has no values yet.
  const [rows, setRows] = useState(() => (chart.kind === "radar" ? spare(adding ? chart.axes.map((x) => [x.label, ""]) : rowsOfRadar(chart), radarMost, false) : [["", ""]]));
  if (chart.kind === "energy") {
    const table = { paths: energy[0].slice(1), rows: energy.slice(1) }, data = energyOfTable(table, adding ? undefined : chart), last = energy.length - 1;
    return (
      <Dialog title="Energy diagram" action={adding ? "Add" : "Apply"} disabled={!data} onClose={onClose} onAction={() => data && onDone(data, energyRoles(table), longNames(table))}>
        {/* The empty row shows what a cell takes: an energy, a second value in brackets, a name of its own. */}
        {/* A name (a path's, a state's) holds 80 characters, as the chart keeps it (charts.ts str); a cell 200. */}
        <Cells label="States and paths" cells={energy} head most={energyMost} name={nameOf(energy, true)} headed={headed} limit={(c, r) => (c === 0 || r === 0 ? 80 : 200)} placeholder={(r, c) => (r === 0 ? `Path ${c}` : c === 0 ? "Name" : r === last && c === 1 ? "18.6 (15.2) TS′" : "")} onChange={setEnergy} />
      </Dialog>
    );
  }
  const axes = radarOfRows(rows);
  return (
    <Dialog title="Sensitivity screen" action={adding ? "Add" : "Apply"} disabled={!axes} onClose={onClose} onAction={() => axes && onDone({ axes, ...coverScale({ ...chart, axes }) }, radarRoles(rows))}>
      <Cells label="Conditions" cells={rows} head={false} most={radarMost} name={nameOf(rows, false)} limit={(c) => (c === 0 ? 80 : 200)} placeholder={(r, c) => (c === 0 ? "Condition" : r === rows.length - 1 ? "−12 (−30)" : "%")} onChange={setRows} />
    </Dialog>
  );
}
