// npm run look [url]. Measures the app's controls as WebKit draws them (the engine the Mac app runs in) and fails if
// controls that must match do not. It needs a Mac and the dev server running (npm run dev, or npm run tauri dev):
// the default address is http://localhost:1420. It loads the app in a WKWebView, goes through its panels, dialogs and
// pages (scripts/look/sweep.js) and reads what the app's own watch says (src/lookwatch.ts, lines that start "look:").
// The rules are in brand/BRAND.md (Controls). ui.check.ts reads the stylesheet; this reads the page as it is drawn.
// npm run look -- <url>/?editor touch runs scripts/look/touch.js in its place: pen and touch on the canvas (issue #93).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const url = process.argv[2] ?? "http://localhost:1420", script = process.argv[3] === "touch" ? "touch" : "sweep";
const here = (name) => fileURLToPath(new URL(`./look/${name}`, import.meta.url));
if (process.platform !== "darwin" || spawnSync("which", ["swift"]).status !== 0) {
  console.log("look: skipped. It needs a Mac with Xcode's swift (WKWebView). Measure in the browser preview and read the console for look: errors.");
  process.exit(0);
}
try { await fetch(url); } catch { console.error(`look: no dev server at ${url}. Start it (npm run dev), or give its address: npm run look -- http://localhost:1432`); process.exit(1); }

// The touch checks wait for the page to settle after each step, so they get longer.
const seconds = script === "touch" ? 1800 : 180;
const run = spawnSync("swift", [here("webkit.swift"), url, here(`${script}.js`), String(seconds)], { encoding: "utf8", timeout: (seconds + 60) * 1000 });
let result;
try { result = JSON.parse(run.stdout.trim().split("\n").pop()); } catch { console.error(`look: the sweep did not finish.\n${run.stdout}${run.stderr}`); process.exit(1); }
console.log(`look: ${result.engine}, at ${url}`);
console.log(`${script === "touch" ? "Passed" : "Measured"} ${result.reached.length} ${script === "touch" ? "checks" : "places"}: ${result.reached.join("; ")}.`);
if (result.parts) console.log(`Parts (seconds from the start): ${result.parts.join("; ")}.`);
for (const place of result.missed) console.error(script === "touch" ? `look: failed: ${place}` : `look: the sweep did not reach ${place}. Mend scripts/look/sweep.js.`);
for (const line of result.look) console.error(line);
for (const line of result.errors) console.error(`error on the page: ${line}`);
if (result.timeout) console.error(`look: stopped at the time limit after ${result.parts?.at(-1) ?? "the start"}.`);
const failed = result.look.length + result.missed.length + (result.timeout ? 1 : 0);
console.log(failed ? `${result.look.length} controls do not match, ${result.missed.length} ${script === "touch" ? "checks failed" : "places not reached"}.` : script === "touch" ? "Every check passes." : "Every control matches.");
process.exit(failed ? 1 : 0);
