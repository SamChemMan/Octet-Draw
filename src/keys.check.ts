// Run: node src/keys.check.ts. Fails loudly if shortcut lookup breaks.
import assert from "node:assert/strict";
import { actionFor, clashes, controlTakes, keyOf, keymap, textEntry, tileTo } from "./keys.ts";

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
// Every Actions panel action can take a key (CD-34): none has one by default, as in ChemDraw, and a key set for one
// runs it anywhere.
import { ACTIONS, registerMenu } from "./keys.ts";
const panelActions = ACTIONS.filter((a) => a.id.startsWith("action."));
assert.ok(panelActions.length > 30 && panelActions.every((a) => !map[a.id]?.length));
assert.equal(new Set(ACTIONS.map((a) => a.id)).size, ACTIONS.length, "action ids are unique");
assert.equal(actionFor(keymap({ "action.cycle.reverse": ["shift+r"] }), "shift+r", "atom"), "action.cycle.reverse");
import { label } from "./keys.ts";
assert.equal(label("+"), "+");
assert.ok(["↩", "Enter"].includes(label("enter")));
// ChemDraw's ! and > over an atom (type a label; add a bond and type its label), and Shift+Option+arrows.
assert.equal(actionFor(map, press("!", { shiftKey: true }) ?? "", "atom"), "atom.newlabel");
assert.equal(actionFor(map, press(">", { shiftKey: true }) ?? "", "atom"), "atom.sproutlabel");
assert.equal(press("ArrowLeft", { altKey: true, shiftKey: true }), "alt+shift+arrowleft");
assert.equal(actionFor(map, "alt+shift+arrowleft", "none"), "tilt.left");
assert.equal(actionFor(map, "alt+arrowup", "none"), "rotate.ccw15");
// The menu's commands join the list; one no longer in the menu (Online search off removes the Search menu) leaves it.

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
console.log("keys.check: ok");

// A button the keyboard moved to takes Space and Return; after a click, Space stays the Select key.
const button = { tagName: "BUTTON" }, slider = { tagName: "INPUT", type: "range" };
assert.equal(controlTakes(" ", button, true), true);
assert.equal(controlTakes("Enter", button, true), true);
assert.equal(controlTakes(" ", button, false), false);
assert.equal(controlTakes(" ", { tagName: "DIV" }, true), false);
assert.equal(controlTakes("e", button, true), false);
// A slider the keyboard moved to takes its arrow keys; after a click (as when Line width is dragged) the drawing has them.
assert.equal(controlTakes("ArrowLeft", slider, true), true);
assert.equal(controlTakes("ArrowLeft", slider, false), false);
assert.equal(controlTakes("h", slider, true), false);
// Only fields that take typed text take the drawing's keys away: text, search, number, email, url, text areas and
// rich text boxes. A slider, tick box, radio button, colour well or button does not.
for (const type of ["text", "search", "number", "email", "url"]) assert.equal(textEntry({ tagName: "INPUT", type }), true, type);
for (const type of ["range", "checkbox", "radio", "button", "color", "submit"]) assert.equal(textEntry({ tagName: "INPUT", type }), false, type);
assert.equal(textEntry({ tagName: "TEXTAREA" }), true);
assert.equal(textEntry({ tagName: "DIV", isContentEditable: true }), true);
assert.equal(textEntry({ tagName: "DIV", isContentEditable: false }), false);
assert.equal(textEntry({ tagName: "BUTTON" }), false);
assert.equal(textEntry(null), false);
// Home's tiles, four to a row, ten in all: right, down a row, up from the top row stays, down to a short last row.
assert.equal(tileTo("ArrowRight", 0, 10, 4), 1);
assert.equal(tileTo("ArrowDown", 1, 10, 4), 5);
assert.equal(tileTo("ArrowUp", 2, 10, 4), 2);
assert.equal(tileTo("ArrowDown", 7, 10, 4), 9);
// Down from the last row stays: one row of four (New drawing and the three starters), and the short last row.
assert.equal(tileTo("ArrowDown", 0, 4, 4), 0);
assert.equal(tileTo("ArrowDown", 8, 10, 4), 8);
assert.equal(tileTo("ArrowRight", 9, 10, 4), 9);
assert.equal(tileTo("ArrowLeft", 0, 10, 4), 0);
assert.equal(tileTo("ArrowDown", -1, 10, 4), 0);
assert.equal(tileTo("Enter", 3, 10, 4), undefined);
assert.equal(tileTo("ArrowDown", -1, 0, 4), undefined);
