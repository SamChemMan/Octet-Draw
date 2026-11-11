// Checks every structure in a manuscript's drawings: Octet's warnings (valence, stereo, a number on two structures)
// and its layout check (overlaps, off the page), one line each, then the count. The exit code is 1 when there is one.
// Run: node check.mjs scheme1.cdxml figure2.oct ...
import { basename } from "node:path";
import { octet } from "./octet.mjs";

const o = octet();
let found = 0;
for (const file of process.argv.slice(2)) {
  try { await o.open(file); } catch (e) { console.log(`${basename(file)}: ${e.message}`); found++; continue; }
  const { warnings } = await o.call("read", { detail: "full" });
  await o.call("drawings", { action: "close" });
  console.log(`${basename(file)}: ${warnings.length ? `${warnings.length} to look at` : "clean"}`);
  for (const w of warnings) {
    const label = w.atom ?? w.structure ?? w.ids?.join(" and ");
    console.log(`  ${label ? `${label} ` : ""}${w.message}`);
  }
  found += warnings.length;
}
console.log(`${found} to look at.`);
await o.close();
process.exitCode = found ? 1 : 0;
