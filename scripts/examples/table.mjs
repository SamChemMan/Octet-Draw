// One drawing a row of a table: a CSV with the columns number, name and smiles, and a first row of headings. Each row
// is drawn with its number under it and its name under that, and saved in OUT as NUMBER.svg (or the format given:
// oct, cdxml, pdf, png and the rest). Undo takes each row away once it is saved, so Octet keeps one drawing open.
// Run: node table.mjs compounds.csv OUT [svg]
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { octet } from "./octet.mjs";

const [csv, out, format = "svg"] = process.argv.slice(2), o = octet();
// A line's cells. A cell in quotes can hold commas ("2,4-dinitrophenol").
const cells = (line) => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map((m) => m[1].replace(/^"(.*)"$/, "$1").replaceAll('""', '"'));
mkdirSync(out, { recursive: true });
for (const line of readFileSync(csv, "utf8").split(/\r?\n/).slice(1).filter((l) => l.trim())) {
  const [number, name, smiles] = cells(line);
  await o.call("draw", { structures: [{ text: smiles, number, caption: name }] });
  await o.save(join(out, `${number}.${format}`), format);
  await o.call("advanced", { tool: "run_command", args: { command: "undo" } });
  console.log(`${number}.${format}: ${name}`);
}
await o.close();
