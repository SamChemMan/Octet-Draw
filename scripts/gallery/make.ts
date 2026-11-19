// Run: node scripts/gallery/make.ts [--check] [--show] [ID...]
// Octet's example drawings (src/examples/examples.json, issue 94), drawn by Octet with no window (scripts/headless):
// each recipe here (ID.json: { for: a purpose, calls: AI app tool calls }) is drawn in a new drawing for its purpose
// and written to src/examples/ID.json as the drawing's text (src/file.ts serialize). A starter (no recipe: drawn in
// the app before 1.2) is read and written again with the Quick start style, so it opens the same for every user.
// The text names Octet 1.1.3, the first with the examples, as the app that wrote it: the same recipe gives the same bytes
// in every version, and parse reads it as a file of this version (with no app, as one from 1.0.x, which it migrates).
// --check: draws each one and compares, writing nothing (after a merge that changes drawing code). --show: each call's
// result, the structures with their InChIKeys, and the warnings.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { load, drawing, session } from "../headless/host.ts";
import { handle } from "../../src/mcp.ts";
import { parse, serialize } from "../../src/file.ts";
import { QUICK_STYLE } from "../../src/docstyle.ts";

type Call = { name: string; arguments?: unknown };
type Recipe = { for: string; calls: Call[] };
const args = process.argv.slice(2), check = args.includes("--check"), show = args.includes("--show"), only = args.filter((a) => !a.startsWith("--"));
const dir = new URL("../../src/examples/", import.meta.url), list: { id: string; name: string }[] = JSON.parse(readFileSync(new URL("examples.json", dir), "utf8"));
const version = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
// The drawing's text, with 1.1.3 as the app's version.
const text = (t: string) => { const o = JSON.parse(t); o.app = "1.1.3"; return JSON.stringify(o, null, 1) + "\n"; };

await load();
let failed = 0;
for (const { id, name } of list.filter((x) => !only.length || only.includes(x.id))) {
  const recipe = new URL(`${id}.json`, import.meta.url), out = new URL(`${id}.json`, dir);
  let made: string;
  if (!existsSync(recipe)) {
    const mol = parse(readFileSync(out, "utf8"));
    made = text(serialize({ ...mol, style: mol.style ?? QUICK_STYLE }));
  } else {
    const r: Recipe = JSON.parse(readFileSync(recipe, "utf8")), d = drawing(r.for, name), errors: string[] = [];
    let n = 0;
    const call = async (c: Call) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: c }), () => d.host, version, session("Octet gallery", id)));
    for (const c of r.calls) {
      const res = await call(c), said: string = res.error?.message ?? res.result?.content?.[0]?.text ?? "";
      if (res.error || res.result?.isError) errors.push(`${c.name}: ${said.split("\n")[0]}`);
      if (show) console.log(`${id} ${c.name}: ${said.split("\n")[0]}`);
    }
    // Octet's warnings and its layout check (text off the page, overlaps), as read gives them to an AI app.
    const reading = (await call({ name: "read", arguments: { detail: "full" } })).result.structuredContent, warnings: { message: string }[] = reading.warnings;
    if (show) {
      for (const s of reading.structures) console.log(`${id} ${s.id} ${s.number ?? ""} ${s.formula} ${s.inchiKey} ${s.name ?? ""}`);
      for (const w of warnings) console.log(`${id} warning: ${w.message}`);
    }
    if (warnings.length) errors.push(`${warnings.length} warnings: ${warnings.slice(0, 3).map((w) => w.message).join("; ")}`);
    if (errors.length) { failed++; console.error(`FAIL ${id}: ${errors.join("; ")}`); continue; }
    made = text(serialize(d.host.doc()));
  }
  const was = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (check) { if (was !== made) { failed++; console.error(`FAIL ${id}: the drawing differs from what its recipe draws`); } else console.log(`ok   ${id}`); }
  else { if (was !== made) writeFileSync(out, made); console.log(`${was === made ? "same" : "made"} ${id} (${(made.length / 1024).toFixed(1)} KB)`); }
}
process.exit(failed ? 1 : 0);
