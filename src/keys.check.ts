// Run: node src/keys.check.ts. Fails loudly if shortcut lookup breaks.
import assert from "node:assert/strict";
import { actionFor, clashes, feedbackChord, keyOf, keymap } from "./keys.ts";

const press = (key: string, mods: Partial<{ shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {}) =>
  keyOf({ key, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, ...mods });
assert.equal(press("N", { shiftKey: true }), "shift+n");
assert.equal(press("+", { shiftKey: true }), "+");
assert.equal(press("Backspace"), "backspace");
assert.equal(press("Shift"), undefined);

const map = keymap();
// The same key means different things over an atom and over a bond.
assert.equal(actionFor(map, "h", "atom"), "element.H");
assert.equal(actionFor(map, "h", "bond"), "bond.hashwedge");
// ChemDraw: b is bromine over an atom and bold over a bond; Shift+B is boron.
assert.equal(actionFor(map, "b", "atom"), "element.Br");
assert.equal(actionFor(map, "b", "bond"), "bond.bold");
assert.equal(actionFor(map, "shift+b", "atom"), "element.B");
assert.equal(actionFor(map, "space", "none"), "tool.select");
assert.equal(press("ArrowUp", { altKey: true }), "alt+arrowup");
assert.equal(press("ArrowUp", { shiftKey: true }), "shift+arrowup");
// Keys that work anywhere still work over an atom when the atom has no use for them.
assert.equal(actionFor(map, "]", "atom"), "eraser.bigger");
assert.equal(actionFor(map, "n", "none"), undefined);
// A user change replaces the default, and clashes are found in the same place only.
const mine = keymap({ "element.N": ["m"] });
assert.equal(actionFor(mine, "m", "atom"), "element.N");
assert.equal(actionFor(mine, "n", "atom"), undefined);
assert.deepEqual(clashes(map, "element.N", "o"), ["element.O"]);
assert.deepEqual(clashes(map, "element.N", "2"), ["group.acetyl"]);
assert.deepEqual(clashes(map, "bond.double", "n"), []);
import { label } from "./keys.ts";
assert.equal(label("+"), "+");
assert.ok(["↩", "Enter"].includes(label("enter")));
// The menu's commands join the list; one no longer in the menu (Online search off removes the Search menu) leaves it.
import { ACTIONS, registerMenu } from "./keys.ts";
registerMenu([["clean_up", "Clean Up Structure", "Structure", "CmdOrCtrl+Shift+K"], ["search_reaxys", "Search Reaxys", "Search", "Alt+CmdOrCtrl+F"]]);
assert.ok(ACTIONS.some((a) => a.id === "menu.search_reaxys") && ACTIONS.some((a) => a.id === "menu.clean_up"));
assert.equal(actionFor(keymap({}), "mod+alt+f", "none"), "menu.search_reaxys");
registerMenu([["clean_up", "Clean Up Structure", "Structure", "CmdOrCtrl+Shift+K"]]);
assert.ok(!ACTIONS.some((a) => a.id === "menu.search_reaxys") && ACTIONS.some((a) => a.id === "menu.clean_up"));
assert.equal(actionFor(keymap({}), "mod+alt+f", "none"), undefined);
// View > Show Grid (⌘'), Show Rulers (⌘;) and Show Crosshair (⌥⌘X): their keys read as the page writes them.
registerMenu([["grid", "Show Grid", "View", "CmdOrCtrl+'"], ["rulers", "Show Rulers", "View", "CmdOrCtrl+;"], ["crosshair", "Show Crosshair", "View", "Alt+CmdOrCtrl+X"]]);
assert.deepEqual(["menu.grid", "menu.rulers", "menu.crosshair"].map((id) => keymap({})[id]), [["mod+'"], ["mod+;"], ["mod+alt+x"]]);
assert.equal(actionFor(keymap({}), "mod+;", "none"), "menu.rulers");
// Feedback's keys: 1, 2 and 3 with ⌘ held, all within 400 ms, in any order. No key-up is needed.
{
  const p = new Map<string, number>();
  assert.equal(feedbackChord(p, "1", 1000), false);
  assert.equal(feedbackChord(p, "3", 1100), false);
  assert.equal(feedbackChord(p, "2", 1350), true);
  assert.equal(p.size, 0, "complete keys start again");
  // Too slow: 1 at 0 ms, 3 at 500 ms. A new 1 makes them complete.
  assert.equal(feedbackChord(p, "1", 0), false);
  assert.equal(feedbackChord(p, "2", 300), false);
  assert.equal(feedbackChord(p, "3", 500), false);
  assert.equal(feedbackChord(p, "1", 600), true);
  // The same digit again is not a second digit.
  const q = new Map<string, number>();
  for (const at of [0, 50, 100]) assert.equal(feedbackChord(q, "1", at), false);
}
console.log("keys.check: ok");
