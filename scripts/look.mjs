// npm run look [url]. Measures the app's controls as WebKit draws them (the engine the Mac app runs in) and fails if
// controls that must match do not. It needs a Mac and the dev server running (npm run dev, or npm run tauri dev):
// the default address is http://localhost:1420. It loads the app in a WKWebView, goes through its panels, dialogs and
// pages (scripts/look/sweep.js) and reads what the app's own watch says (src/lookwatch.ts, lines that start "look:").
// The rules are in brand/BRAND.md (Controls). ui.check.ts reads the stylesheet; this reads the page as it is drawn.
// npm run look -- <url>/?editor touch runs scripts/look/touch.js in its place: pen and touch on the canvas (issue #93),
// then scripts/look/chrome-touch.mjs: real touch and pen input in headless Chrome, the engine of Windows' web view.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const url = process.argv[2] ?? "http://localhost:1420", script = process.argv[3] === "touch" ? "touch" : "sweep";
const here = (name) => fileURLToPath(new URL(`./look/${name}`, import.meta.url));
if (process.platform !== "darwin" || spawnSync("which", ["swift"]).status !== 0) {
  console.log("look: skipped. It needs a Mac with Xcode's swift (WKWebView). Measure in the browser preview and read the console for look: errors.");
  process.exit(0);
}
try { await fetch(url); } catch { console.error(`look: no dev server at ${url}. Start it (npm run dev), or give its address: npm run look -- http://localhost:1432`); process.exit(1); }

// The touch checks wait for the page to settle after each step, so they take longer. A finger only pans once a pen
// has been used in a window, and the web view keeps the settings, so each group of touch checks runs in a page of its
// own, the finger's before the pen's. <url>/?editor&look-only=pen,palm runs only the parts named (touch.js), and
// look-session or look-coarse only that.
const GROUPS = ["root,touch-drags,pinch,late,hold,cancel", "touch-siblings", "taps", "undo", "reach", "pen,pen-drags,eraser", "pen-siblings", "palm,coarse"];
// look-only=chrome runs only the Chrome checks.
const only = new URL(url).searchParams.get("look-only") ?? "";
const chrome = script === "touch" && !/look-(session|coarse)/.test(url) && (!only || only.split(",").includes("chrome"));
const pages = only === "chrome" ? [] : script === "touch" && !/look-(only|session|coarse)/.test(url) ? GROUPS.map((g) => `${url}${url.includes("?") ? "&" : "?"}look-only=${g}`) : [url];
const seconds = script === "touch" ? 900 : 180;
const result = { reached: [], missed: [], look: [], errors: [], parts: [] };
for (const page of pages) {
  const run = spawnSync("swift", [here("webkit.swift"), page, here(`${script}.js`), String(seconds)], { encoding: "utf8", timeout: (seconds + 120) * 1000 });
  let one;
  try { one = JSON.parse(run.stdout.trim().split("\n").pop()); } catch { console.error(`look: the sweep did not finish at ${page}.\n${run.stdout}${run.stderr}`); process.exit(1); }
  result.engine = one.engine;
  result.session ??= one.session;
  for (const k of ["reached", "missed", "look", "errors", "parts"]) result[k].push(...(one[k] ?? []));
  if (one.timeout) result.timeout = page;
}
if (chrome) {
  const run = spawnSync(process.execPath, [here("chrome-touch.mjs"), url], { encoding: "utf8", timeout: 900000 });
  let one;
  try { one = JSON.parse(run.stdout.trim().split("\n").pop()); } catch { console.error(`look: the Chrome checks did not finish.\n${run.stdout}${run.stderr}`); process.exit(1); }
  result.engine = [result.engine, one.engine].filter(Boolean).join(" and ");
  for (const k of ["reached", "missed", "errors"]) result[k].push(...one[k]);
}
console.log(`look: ${result.engine}, at ${url}`);
console.log(`${script === "touch" ? "Passed" : "Measured"} ${result.reached.length} ${script === "touch" ? "checks" : "places"}: ${result.reached.join("; ")}.`);
if (result.parts.length) console.log(`Parts (seconds from the start of their page): ${result.parts.join("; ")}.`);
// The fixed mouse session's drawing (touch.js), to compare between two builds: <url>/?editor&look-session runs it alone.
if (result.session !== undefined) console.log(`Mouse session:\n${result.session}\nEnd of the mouse session.`);
for (const place of result.missed) console.error(script === "touch" ? `look: failed: ${place}` : `look: the sweep did not reach ${place}. Mend scripts/look/sweep.js.`);
for (const line of result.look) console.error(line);
for (const line of result.errors) console.error(`error on the page: ${line}`);
if (result.timeout) console.error(`look: stopped at the time limit at ${result.timeout}.`);
const failed = result.look.length + result.missed.length + (result.timeout ? 1 : 0);
console.log(failed ? `${result.look.length} controls do not match, ${result.missed.length} ${script === "touch" ? "checks failed" : "places not reached"}.` : script === "touch" ? "Every check passes." : "Every control matches.");
process.exit(failed ? 1 : 0);
