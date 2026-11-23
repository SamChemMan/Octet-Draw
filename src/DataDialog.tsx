// Attach Data (Object > Attach Data…, and Edit attached data… on a field's text): a structure's data fields in one grid
// to type in, Add Chart's (Cells.tsx). Each row is a field's name, its value and whether it is shown under the
// structure. There is always one empty row to type the next one in, and a table copied from a spreadsheet pastes from
// the cell it is pasted in. Text with line breaks and no tab pasted in a value stays in that value. A row with no name
// is left out. Shift+Return or Option+Return makes a new line in a value; Return saves. Nothing changes the drawing
// until Save, which is one step to undo (datafields.ts setRows).
import { useState } from "react";
import { Cells } from "./Cells";
import { Dialog } from "./Dialog";
import { spare } from "./charts";
import { MAX_EACH, MAX_NAME, MAX_SHOWN, MAX_VALUE, type DataRow } from "./datafields";

// A structure holds MAX_EACH fields (Save adds none past it), so the grid has as many rows at most.
const MOST: [number, number] = [MAX_EACH, 3];
const LIMITS = [MAX_NAME, MAX_VALUE, 1];

// focus: the row of the field whose text was picked (Edit attached data…).
export function DataDialog({ rows, focus, onClose, onSave }: { rows: DataRow[]; focus?: number; onClose: () => void; onSave: (rows: DataRow[]) => void }) {
  const [cells, setCells] = useState(() => spare(rows.length ? rows.map((r) => [r.name, r.value, r.show ? "1" : ""]) : [["", "", ""]], MOST, false));
  const at = focus === undefined ? 0 : Math.max(0, rows.findIndex((r) => r.key === focus));
  // A value too long to show has its Show off.
  const long = (r: number) => cells[r][1].length > MAX_SHOWN;
  const save = () => onSave(cells.map((c, r) => ({ name: c[0], value: c[1], show: !!c[2] && !long(r), ...(r < rows.length ? { key: rows[r].key } : {}) })));
  const name = (r: number, c: number) => (c === 0 ? `Name ${r + 1}` : `${cells[r][0] || `Name ${r + 1}`}, ${c === 1 ? "value" : "show"}`);
  return (
    <Dialog title="Attached data" action="Save" onClose={onClose} onAction={save}>
      <Cells label="Attached data" cells={cells} head={false} most={MOST} name={name} placeholder={() => ""}
        kinds={["text", "lines", "switch"]} limit={(c) => LIMITS[c]} columns="minmax(96px, 2fr) minmax(120px, 3fr) auto" first={[at, focus === undefined ? 0 : 1]} titles={["Name", "Value", "Show"]}
        disabled={(r, c) => c === 2 && long(r)} onChange={setCells} />
    </Dialog>
  );
}
