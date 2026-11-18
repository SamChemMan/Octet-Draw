// Run: node src/window-arrange.check.ts. Fails loudly if Window > Cascade, Tile Top to Bottom and Tile Side by Side
// (issue 73; src-tauri/src/arrange.rs) stop running from the menu, a key or the command palette, or reach the MCP.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ACTIONS, ARRANGE, actionFor, keymap, menuRuns, registerMenu } from "./keys.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const editor = read("Editor.tsx"), main = read("../src-tauri/src/main.rs"), arrange = read("../src-tauri/src/arrange.rs"), mcp = read("mcp.ts");
const body = (text: string, start: string, end: string) => { const i = text.indexOf(start); assert.ok(i >= 0, `found ${start}; update this check`); return text.slice(i, text.indexOf(end, i)); };

// The ids and names are the Rust menu's, in the order of ChemDraw's Windows toolbar (Cascade, Tile Horizontal, Tile
// Vertical). None starts with window_ (a drawing in the Window menu) or arrange_ (Object > Align).
const items = [...body(arrange, "pub const ITEMS", ";\n").matchAll(/\("([a-z_]+)", "([^"]+)"\)/g)].map((m) => [m[1], m[2]]);
assert.deepEqual(items, [["cascade", "Cascade"], ["tile_top_bottom", "Tile Top to Bottom"], ["tile_side_by_side", "Tile Side by Side"]]);
assert.deepEqual([...ARRANGE], items.map(([id]) => id));
for (const id of ARRANGE) assert.ok(!id.startsWith("window_") && !id.startsWith("arrange_"), id);

// The Window menu: the three after Minimize and a line on Windows, first on Linux under X11, before the drawings; no
// default keys (ChemDraw has none). The Mac adds Zoom and Bring All to Front, as ChemDraw's Window menu has them, and no
// Tile or Cascade of Octet's own: macOS has Move & Resize and Arrange in Front.
const windowMenu = body(main, 'section.replace("Window".into());', 'section.replace("Help".into());');
assert.match(windowMenu, /if arrange::places_windows\(\) \{\n\s*if cfg!\(windows\) \{\n\s*window\.append\(&sep\(\)\?\)\?;\n\s*\}\n\s*for \(id, name\) in arrange::ITEMS \{\n\s*window\.append\(&item\(id, name, ""\)\?\)\?;/);
assert.ok(windowMenu.indexOf("arrange::ITEMS") < windowMenu.indexOf("windows::list(app, &window)"), "before the drawings");
assert.match(windowMenu, /#\[cfg\(target_os = "macos"\)\]\n\s*\{\n\s*window\.append\(&PredefinedMenuItem::maximize\(app, None\)\?\)\?;\n\s*window\.append\(&PredefinedMenuItem::fullscreen\(app, None\)\?\)\?;\n\s*window\.append\(&sep\(\)\?\)\?;\n\s*window\.append\(&PredefinedMenuItem::bring_all_to_front\(app, None\)\?\)\?;/);
assert.match(main, /\barrange::arrange_windows,/, "arrange_windows is a command");
assert.match(main, /#\[cfg\(target_os = "linux"\)\]\n\s*arrange::x11\(\);\n\s*let \(bar, checks, list\) = menu\(/, "Linux reads X11 or Wayland before the menu is made");

// Settings > Keyboard shortcuts lists them under Window with no key, and a key set there finds the command.
registerMenu(items.map(([id, name]) => [id, name, "Window", ""]));
for (const [id, name] of items) {
  const action = ACTIONS.find((a) => a.id === `menu.${id}`);
  assert.deepEqual([action?.name, action?.group, keymap()[`menu.${id}`]], [name, "Window", []], id);
}
assert.equal(actionFor(keymap({ "menu.tile_side_by_side": ["mod+alt+t"] }), "mod+alt+t", "none"), "menu.tile_side_by_side");

// They move windows, not the drawing: they run over Home, a dialog, typing and an AI app's call (stress cases 16, 18).
for (const id of ARRANGE) {
  for (const over of [{ home: true, modal: false, typing: false }, { home: false, modal: true, typing: false }, { home: false, modal: false, typing: true }, { home: false, modal: false, typing: false, calling: true }]) {
    assert.equal(menuRuns(id, over), true, `${id} ${JSON.stringify(over)}`);
  }
}
// Each one asks the Rust side with its id, and nothing else: no undo step, no Edited mark, no setting (R11).
assert.match(editor, /\.\.\.Object\.fromEntries\(ARRANGE\.map\(\(how\) => \[how, \(\) => void invoke\("arrange_windows", \{ how \}\)\.catch\(\(\) => \{\}\)\]\)\),/);

// The command palette lists them where the Window menu has them, with ChemDraw's names as search words.
const palette = body(editor, 'ACTIONS.some((a) => a.id === "menu.cascade")', "} as Record");
assert.match(palette, /cascade: \["Cascade", "", <Browsers size=\{18\} \/>\], tile_top_bottom: \["Tile top to bottom", "", <Rows size=\{18\} \/>\], tile_side_by_side: \["Tile side by side", "", <Columns size=\{18\} \/>\]/);
const words = body(editor, "const WORDS: Record<string, string> = {", "};");
assert.match(words, /tile_top_bottom: "tile horizontal[^"]*"/);
assert.match(words, /tile_side_by_side: "tile vertical[^"]*"/);
assert.match(words, /cascade: "arrange windows[^"]*"/);

// The MCP: no tool and no run_command id. They only arrange the user's screen, as New, Open, Close and Home (not there
// either) open and close windows. run_command refuses them as it refuses any id it does not list (stress case 14).
const commands = body(mcp, "const MENU_COMMANDS = [", "] as const;");
for (const id of ARRANGE) assert.ok(!commands.includes(`"${id}"`) && !mcp.includes(`"${id}"`), id);
for (const id of ["new", "open", "close", "home"]) assert.ok(!commands.includes(`"${id}"`), id);

console.log("window-arrange.check: ok");
