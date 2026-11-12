// Applies a journal's style to every figure in a folder: each drawing gets the journal's preset and its column's page,
// as set_brief gives them, and is saved in OUT. A figure that does not fit the page is named with what is off it.
// Run: node restyle.mjs JOURNAL COLUMNS FOLDER OUT   (for example: node restyle.mjs Angewandte 1 figures restyled)
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { octet } from "./octet.mjs";

const [journal, columns, folder, out] = process.argv.slice(2), o = octet();
mkdirSync(out, { recursive: true });
for (const name of readdirSync(folder).filter((f) => /\.(cdxml|cdx|oct)$/i.test(f)).sort()) {
  await o.open(join(folder, name));
  await o.call("set_brief", { destination: { kind: "paper", journal, columns: Number(columns) } });
  const { style, check } = await o.call("read");
  await o.save(join(out, name));
  await o.call("drawings", { action: "close" });
  console.log(`${name}: ${style}${check === "clean" ? "" : `, check ${JSON.stringify(check)}`}`);
}
await o.close();
