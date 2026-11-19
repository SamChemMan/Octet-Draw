// Run: node src/tilecascade-stress.check.ts. Issue 73's stress list (docs/plans/issue-73-tile-cascade.md, "Stress
// list"): Window > Cascade, Tile Top to Bottom and Tile Side by Side. Each case drives the real code where node can:
// the key map and menu registry (src/keys.ts) and the MCP's run_command (src/mcp.ts). The window maths and the queue
// are Rust (src-tauri/src/arrange.rs): each case names its Rust tests, and this check fails if one is gone. With
// OCTET_STRESS_RUST=1 and CARGO_TARGET_DIR set, it runs them too. A case that needs real windows on Windows or Linux is
// listed at the end as a real run; the plan's "Real runs" has the checklist.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(here(p), "utf8");
type Case = { id: string; title: string; ok: boolean; detail?: string };
const results: Case[] = [];
const check = (id: string, title: string, ok: boolean, detail = "") => results.push({ id, title, ok, detail });
const real: string[] = [];

const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { ACTIONS, ARRANGE, actionFor, clashes, keymap, menuRuns, registerMenu } = await import("./keys.ts");
const { ready } = await import("./chem.ts");
const { EMPTY } = await import("./edit.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { handle } = await import("./mcp.ts");
type Host = import("./mcp.ts").Host;
await ready;

const editor = read("Editor.tsx"), main = read("../src-tauri/src/main.rs"), arrange = read("../src-tauri/src/arrange.rs"), windows = read("../src-tauri/src/windows.rs");
const body = (text: string, start: string, end: string) => { const i = text.indexOf(start); return i < 0 ? "" : text.slice(i, text.indexOf(end, i)); };
const fnBody = (text: string, name: string) => body(text, name, "\n}\n");

// The Rust tests for each case. Each must be in the source; with OCTET_STRESS_RUST=1 each must pass.
const RUST: [string, string, string[]][] = [
  ["S1", "No drawing: no place for any window", ["arrange::tests::no_window_no_place"]],
  ["S2", "One drawing: the Tiles fill the work area with it, Cascade puts it at the top left at the work area's size", ["arrange::tests::one_window"]],
  ["S3", "Two drawings on 1920 x 1080: 960 px columns at 100% with frames touching; Top to Bottom at the smallest height, overlapping evenly; at 125% and 150% each the smallest width, first at the left edge, last at the right", ["arrange::tests::two_windows_at_100", "arrange::tests::two_windows_scaled"]],
  ["S4", "3, 5, 7, 11 and 40 drawings: the grid's columns, tiles that cover a large work area with no gap or overlap, 40 at the smallest size overlapping evenly, cascade runs", ["arrange::tests::the_grid", "arrange::tests::tiles_cover_the_work_area", "arrange::tests::forty_windows", "arrange::tests::the_cascade"]],
  ["S6", "Home in front: the drawings in the menu's order; the front drawing takes the first tile and the top of the cascade", ["arrange::tests::the_order"]],
  ["S7", "Only the drawings the Window menu lists: the Reaxys window is never picked", ["arrange::tests::only_the_drawings"]],
  ["S8", "Monitors at negative x and y, frames measured at 150% placed at 100% and at 100% placed at 200%", ["arrange::tests::every_count_fits", "arrange::tests::mixed_scales"]],
  ["S11", "Work areas smaller than the smallest window, a 2^32 px work area, scales of 0, NaN and infinity, hostile frames and grains: no panic, no overflow, nothing under the smallest window", ["arrange::tests::every_count_fits", "arrange::tests::no_overflow"]],
  ["S12", "A held key: one running, one waiting, the last asked for wins", ["arrange::tests::one_at_a_time"]],
  ["S15", "Only cascade, tile_top_bottom and tile_side_by_side; explode, 5, null, an object and Cascade are refused", ["arrange::tests::only_three_names", "arrange::tests::the_ids"]],
  ["S19", "Windows and Linux under X11 arrange; Wayland never; a Mac release build refuses. The Window menu keeps 5, 3 or 0 items before the drawings", ["arrange::tests::where_it_runs", "windows::tests::the_window_menu_keeps_its_own_items"]],
  ["R5", "macOS and GTK place by the point: at 200% every place and size is a whole point, inside the work area", ["arrange::tests::the_grain", "arrange::tests::on_the_point_grid"]],
];
const rustSource = (path: string) => (path.startsWith("arrange::") ? arrange : windows);
for (const [id, title, tests] of RUST) {
  const missing = tests.filter((t) => !new RegExp(`#\\[test\\]\\s*fn ${t.split("::").pop()}\\(`).test(rustSource(t)));
  check(`${id}.rust`, `${title} (Rust tests in place)`, missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : tests.join(", "));
}

// ---- S1: no drawing open; every drawing minimised ----
{
  const list = fnBody(windows, "pub fn list(");
  const dims = /for item in menu\.items\(\)\?\.iter\(\)\.filter_map\(\|i\| i\.as_menuitem\(\)\.cloned\(\)\) \{\s*if crate::arrange::ITEMS\.iter\(\)\.any\(\|\(id, _\)\| item\.id\(\) == id\) \{\s*item\.set_enabled\(!items\.is_empty\(\)\)\?;/.test(list);
  check("S1.dimmed", "No drawing in the Window menu: Cascade and the Tiles are dimmed", dims, "windows.rs list");
  const run = fnBody(arrange, "fn arrange(");
  check("S1.none", "No drawing, or every drawing minimised or hidden: a key set for them moves nothing and says nothing", /\.filter\(shown\)\.collect\(\);\s*if windows\.is_empty\(\) \{\s*return;\s*\}/.test(run) && /!w\.is_minimized\(\)\.unwrap_or\(true\)/.test(fnBody(arrange, "fn shown(")), "arrange returns before it holds the front window");
}

// ---- S5, S10: minimised, maximised, full-screen, hidden windows and windows on another virtual desktop ----
{
  const shown = fnBody(arrange, "fn shown(");
  check("S5.left", "Minimised, full-screen and hidden windows, and windows on another virtual desktop, are not counted or moved", ["is_visible().unwrap_or(false)", "!w.is_minimized().unwrap_or(true)", "!w.is_fullscreen().unwrap_or(true)", "!cloaked(w)"].every((s) => shown.includes(s)), shown.trim().split("\n")[1]?.trim());
  const run = fnBody(arrange, "fn arrange(");
  check("S5.maximised", "A maximised window is restored before its frame is measured", run.indexOf("w.unmaximize()") > 0 && run.indexOf("w.unmaximize()") < run.indexOf("windows.iter().map(frame)"));
  real.push("S5 and S10 on Windows: a minimised, a maximised and a full-screen drawing, and one on another virtual desktop (Task View)");
}

// ---- S9: off-screen window, the front window on no monitor, no monitor ----
{
  const run = fnBody(arrange, "fn arrange(");
  check("S9.monitor", "The front window's monitor, else the first arranged window's, else the primary; no monitor: nothing happens", /\.and_then\(\|w\| w\.current_monitor\(\)\.ok\(\)\.flatten\(\)\)\s*\.or_else\(\|\| windows\[0\]\.current_monitor\(\)\.ok\(\)\.flatten\(\)\)\s*\.or_else\(\|\| app\.primary_monitor\(\)\.ok\(\)\.flatten\(\)\);\s*let Some\(monitor\) = monitor else \{ return \};/.test(run));
  real.push("S8 and S9 on Windows: two monitors at 100% and 150%, a monitor above the primary, the taskbar on the left; a drawing left on an unplugged monitor");
}

// ---- S13: AI apps open and close drawings during an arrangement ----
{
  const front = fnBody(windows, "pub fn front(");
  check("S13.front", "While the windows move, menu commands and an AI app's first call go to the window that was in front", /if let Some\(held\) = HOLD\.lock\(\)\.unwrap\(\)\.clone\(\)\.filter\(\|l\| app\.get_webview_window\(l\)\.is_some\(\)\)/.test(front) && /if ours\(label\) && HOLD\.lock\(\)\.unwrap\(\)\.is_none\(\)/.test(windows));
  const run = fnBody(arrange, "fn arrange(");
  check("S13.release", "The hold ends before the focus moves, and a fault on the way leaves nothing held", run.indexOf("drop(release)") > 0 && run.indexOf("drop(release)") < run.indexOf("top.set_focus()") && /impl Drop for Release \{\s*fn drop\(&mut self\) \{\s*crate::windows::hold\(None\);/.test(arrange));
  check("S13.closed", "A drawing closed on the way is skipped with no error: each move ignores its result", /let _ = w\.set_position\(to\);/.test(run) && !/\.unwrap\(\)|\?;/.test(body(run, "for &(i, p) in &list", "let stack")));
}

// ---- S14: an AI app sends run_command with cascade or a Tile ----
{
  let ran = 0;
  const base: Partial<Host> = {
    doc: () => EMPTY, style: () => DEFAULT_STYLE, dialog: () => false, windowless: () => false, experiment: () => false,
    command: () => { ran++; return true; }, act: () => { ran++; return true; }, settle: async () => {}, asking: () => false, dismiss: () => {},
    select: () => {}, selection: () => ({ atoms: [], items: [] }), window: () => ({ id: "draw-1", name: "Untitled" }), windows: async () => [], target: async () => true,
    working: () => {}, said: () => {}, begin: () => {}, end: () => {}, set: (m) => m, problems: () => [], tables: () => [],
  };
  const host = new Proxy(base, { get: (t, k) => (k in t ? t[k as keyof Host] : typeof k === "symbol" || k === "then" ? undefined : () => undefined) }) as Host;
  let n = 0;
  const call = async (tool: string, args: unknown) => {
    const r = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "advanced", arguments: { tool, args } } }), () => host, "1.1.3", { client: "Test", session: "s-1" }));
    return { text: (r.result?.content?.[0]?.text ?? r.error?.message ?? "") as string, error: !!(r.result?.isError || r.error) };
  };
  for (const id of [...ARRANGE, " cascade ", "Cascade", "tile_side_by_side\t"]) {
    const before = ran, r = await call("run_command", { command: id });
    check(`S14.${id.trim()}${id === id.trim() ? "" : ".spaced"}`, `MCP: run_command ${JSON.stringify(id)} is refused and nothing runs`, r.error && /Octet has no command/.test(r.text) && ran === before, r.text.slice(0, 120));
  }
  const help = await call("help", { of: "run_command" });
  check("S14.help", "MCP: advanced help of run_command does not offer them", !help.error && help.text.length > 200 && !ARRANGE.some((id) => new RegExp(`\\b${id}\\b`).test(help.text)), help.text.slice(0, 80));
}

// ---- S15: the page gives only one of three names; Octet with no window returns at once ----
{
  check("S15.page", "The page asks Rust only with the three ids", /\.\.\.Object\.fromEntries\(ARRANGE\.map\(\(how\) => \[how, \(\) => void invoke\("arrange_windows", \{ how \}\)\.catch\(\(\) => \{\}\)\]\)\),/.test(editor) && (editor.match(/invoke\("arrange_windows"/g) ?? []).length === 1);
  const cmd = fnBody(arrange, "pub async fn arrange_windows(");
  check("S15.headless", "--headless: the command returns at once, before the queue", cmd.indexOf("HEADLESS.load") > 0 && cmd.indexOf("HEADLESS.load") < cmd.indexOf("QUEUE.lock()"));
  check("S15.size", "Sizes and places never come from the page: the command takes only how", /pub async fn arrange_windows\(app: AppHandle, how: How\) -> Result<\(\), String>/.test(arrange));
}

// ---- S16: Undo, the Edited mark, typing a label, Document Settings open ----
{
  const over = [{ home: true, modal: false, typing: false }, { home: false, modal: true, typing: false }, { home: false, modal: false, typing: true }, { home: false, modal: false, typing: false, calling: true }, { home: true, modal: true, typing: true, calling: true }];
  for (const id of ARRANGE) check(`S16.${id}`, `${id} runs over Home, a dialog, typing and an AI app's call`, over.every((o) => menuRuns(id, o)));
  check("S16.nothing", "Undo is not taken: the page writes no undo step, Edited mark or recovery copy for them (it only asks Rust)", !/arrange_windows[^\n]*(setDoc|commit|push|setEdited|recovery)/.test(editor));
  check("S16.rust", "Rust writes nothing: no file, no event to the page, no setting", !/std::fs|\.emit\(|settings|write\(/.test(arrange.slice(0, arrange.indexOf("#[cfg(test)]"))));
}

// ---- S17: renders ----
{
  const run = fnBody(arrange, "fn arrange(");
  check("S17.once", "A window is sized once, and only if its size changes (one page render)", /if w\.inner_size\(\)\.ok\(\) != Some\(size\) \{\s*let _ = w\.set_size\(size\);\s*let _ = w\.set_position\(to\);\s*\}/.test(run));
  real.push("S17 on Windows: 40 paclitaxels and a 500-residue peptide in two windows; each renders once; a floating template palette near the right edge");
}

// ---- S18: a key set in Settings > Keyboard shortcuts; the same settings in Octet 1.1.2 ----
{
  const MENU: [string, string, string, string][] = [["select_all", "Select All", "Edit", "CmdOrCtrl+A"], ["cascade", "Cascade", "Window", ""], ["tile_top_bottom", "Tile Top to Bottom", "Window", ""], ["tile_side_by_side", "Tile Side by Side", "Window", ""]];
  registerMenu(MENU);
  const keys = { "menu.tile_side_by_side": ["mod+alt+t"] };
  check("S18.listed", "Settings > Keyboard shortcuts lists the three under Window, with no key", ARRANGE.every((id) => { const a = ACTIONS.find((x) => x.id === `menu.${id}`); return a?.group === "Window" && keymap()[a.id]?.length === 0; }));
  check("S18.runs", "A key set for Tile Side by Side runs it over a drawing, an atom, a bond and a caption", (["none", "atom", "bond", "caption"] as const).every((p) => actionFor(keymap(keys), "mod+alt+t", p) === "menu.tile_side_by_side"), String(actionFor(keymap(keys), "mod+alt+t", "atom")));
  const clash = clashes(keymap({ ...keys, "menu.cascade": ["mod+alt+t"] }), "menu.tile_side_by_side", "mod+alt+t");
  check("S18.clash", "The same key on Cascade shows as a clash, as for any key", clash.includes("menu.cascade"), clash.join(", "));
  // Octet 1.1.2's menu has no such command: the stored key finds nothing and breaks nothing.
  registerMenu(MENU.slice(0, 1));
  check("S18.old", "With a menu that has no Cascade or Tile (Octet 1.1.2, the Mac, Wayland), a stored key finds nothing", actionFor(keymap(keys), "mod+alt+t", "none") === undefined && !ACTIONS.some((a) => ARRANGE.some((id) => a.id === `menu.${id}`)));
  real.push("S18 on Windows: Ctrl+Alt+T set for Tile Side by Side, pressed in a drawing, on Home, in Document Settings and while typing a label");
}

// ---- S19: Linux under Wayland and the Flatpak; the Mac ----
{
  const palette = body(editor, "...(menuReady && ACTIONS.some((a) => a.id === \"menu.cascade\") ? {", "} as Record");
  check("S19.palette", "The command palette lists them only where the Window menu has them", palette.length > 0 && !ACTIONS.some((a) => a.id === "menu.cascade"), "after a menu with no Cascade, ACTIONS has no menu.cascade");
  const menu = body(main, 'section.replace("Window".into());', 'section.replace("Help".into());');
  check("S19.menu", "The Window menu adds them only where Octet places windows; the Mac adds Zoom and Bring All to Front", /if arrange::places_windows\(\) \{/.test(menu) && /PredefinedMenuItem::maximize/.test(menu) && /PredefinedMenuItem::bring_all_to_front/.test(menu));
  check("S19.x11", "Linux reads X11 or Wayland once, before the menu is made", /#\[cfg\(target_os = "linux"\)\]\s*arrange::x11\(\);\s*let \(bar, checks, list\) = menu\(/.test(main) && /d\.type_\(\)\.name\(\) == "GdkX11Display"/.test(arrange));
  real.push("S19 on Linux: X11 shows Cascade and both Tiles; Wayland and the Flatpak show the drawings only. Mac: Window shows Minimize, Zoom, Full Screen, Bring All to Front (Arrange in Front with Option)");
}

// ---- S20, S21: files, paste, offline, dark mode ----
{
  check("S20.files", "Arranging writes nothing to a file: CDXML's WindowPosition and WindowSize stay 0 0", /WindowPosition: "0 0", WindowSize: "0 0"/.test(read("cdxml.ts")) && !/WindowPosition|WindowSize/.test(arrange));
  check("S21.offline", "Nothing in the arrangement uses the network", !/reqwest|ureq|TcpStream|http:|https:/.test(arrange));
  const rows = body(editor, "...(menuReady && ACTIONS.some((a) => a.id === \"menu.cascade\") ? {", "} as Record");
  check("S21.rows", "The palette rows are the palette's own rows (name, no key, an 18 px icon), so light and dark follow the tokens", (rows.match(/\["Tile [a-z ]+", "", <\w+ size=\{18\} \/>\]/g) ?? []).length === 2 && /cascade: \["Cascade", "", <Browsers size=\{18\} \/>\]/.test(rows));
  real.push("S20 and S21 on Windows: save .oct, CDXML and CDX before and after Tile and compare bytes; copy in one tiled window and paste in the other; dark mode palette rows");
}

// ---- The Rust tests themselves (OCTET_STRESS_RUST=1) ----
if (process.env.OCTET_STRESS_RUST) {
  if (!process.env.CARGO_TARGET_DIR) check("rust", "The Rust cases run", false, "OCTET_STRESS_RUST=1 needs CARGO_TARGET_DIR");
  else {
    const r = spawnSync("cargo", ["test", "--manifest-path", here("../src-tauri/Cargo.toml"), "--", "arrange::", "windows::tests::"], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 3_600_000 });
    const out = `${r.stdout}`;
    for (const [id, title, tests] of RUST) {
      const failed = tests.filter((t) => !new RegExp(`test ${t.replace(/[:]/g, "\\:")} \\.\\.\\. ok`).test(out));
      check(`${id}.ran`, `${title} (Rust tests pass)`, failed.length === 0, failed.length ? `not ok: ${failed.join(", ")}` : "");
    }
    check("rust.all", "Every arrange:: and windows:: test passes", r.status === 0, (out.split("\n").find((l) => l.startsWith("test result:")) ?? (r.stderr ?? "").slice(-1500)));
  }
} else real.push("The Rust cases above: run with OCTET_STRESS_RUST=1 and CARGO_TARGET_DIR, or cargo test arrange::");

const failed = results.filter((r) => !r.ok);
for (const r of results) if (!r.ok || process.env.OCTET_STRESS_VERBOSE) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.id}: ${r.title}${r.detail ? ` (${r.detail})` : ""}`);
if (process.env.OCTET_STRESS_VERBOSE) for (const r of real) console.log(`real run: ${r}`);
console.log(`tilecascade-stress: ${results.length - failed.length} of ${results.length} cases pass; ${real.length} need a real run`);
process.exit(failed.length ? 1 : 0);
