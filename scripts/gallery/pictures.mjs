// Run: node scripts/gallery/pictures.mjs [url] [ID...]
// The picture on each example's Home tile (src/examples/ID.svg), as the app draws it: WebKit (the Mac app's engine,
// scripts/look/webkit.swift) opens each example in the dev server (npm run dev, or the url given) and takes the
// picture the app makes of a whole drawing (Editor's pictureOf, through a hook that only the dev server has). Run it
// after scripts/gallery/make.ts changes a drawing. A picture is a plain SVG: no script, foreignObject or link.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2), url = args.find((a) => /^https?:/.test(a)) ?? "http://localhost:1420", only = args.filter((a) => !/^https?:/.test(a));
const dir = new URL("../../src/examples/", import.meta.url), list = JSON.parse(readFileSync(new URL("examples.json", dir), "utf8"));
const ids = list.map((x) => x.id).filter((id) => !only.length || only.includes(id));
if (process.platform !== "darwin") { console.error("pictures: this needs a Mac (WKWebView)."); process.exit(1); }
try { await fetch(url); } catch { console.error(`pictures: no dev server at ${url}. Start it (npm run dev).`); process.exit(1); }

// The body of an async function the page runs: each example opened in turn, then its picture once it is drawn.
const script = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (find, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = find(); if (v) return v; await wait(100); } return null; };
const out = {};
await until(() => window.octetGallery && document.querySelector(".editor"));
await document.fonts.ready;
await wait(1500);
for (const [id, name] of ${JSON.stringify(list.filter((x) => ids.includes(x.id)).map((x) => [x.id, x.name]))}) {
  window.octetGallery.open(id);
  await until(() => window.octetGallery.name() === name);
  await wait(1500);
  out[id] = window.octetGallery.picture() ?? "";
}
return JSON.stringify(out);`;
const file = join(mkdtempSync(join(tmpdir(), "octet-gallery-")), "pictures.js");
writeFileSync(file, script);
const run = spawnSync("swift", [fileURLToPath(new URL("../look/webkit.swift", import.meta.url)), `${url.replace(/\/$/, "")}/?editor`, file], { encoding: "utf8", timeout: 300_000 });
let pictures;
try { pictures = JSON.parse(run.stdout.trim().split("\n").pop()); } catch { console.error(`pictures: WebKit did not finish.\n${run.stdout}${run.stderr}`); process.exit(1); }
let failed = 0;
for (const id of ids) {
  const svg = pictures[id] ?? "";
  if (!svg.startsWith("<svg") || /<script|foreignObject|href=/i.test(svg)) { failed++; console.error(`FAIL ${id}: no plain picture`); continue; }
  writeFileSync(new URL(`${id}.svg`, dir), svg);
  console.log(`${id}.svg ${(svg.length / 1024).toFixed(1)} KB`);
}
process.exit(failed ? 1 : 0);
