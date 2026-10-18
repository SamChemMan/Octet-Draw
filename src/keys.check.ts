// Run: node src/keys.check.ts. Fails loudly if shortcut lookup breaks.
import assert from "node:assert/strict";
import { actionFor, buttonTakes, clashes, keyOf, keymap, tileTo } from "./keys.ts";

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
console.log("keys.check: ok");

// A button the keyboard moved to takes Space and Return; after a click, Space stays the Select key.
assert.equal(buttonTakes(" ", true, true), true);
assert.equal(buttonTakes("Enter", true, true), true);
assert.equal(buttonTakes(" ", true, false), false);
assert.equal(buttonTakes(" ", false, true), false);
assert.equal(buttonTakes("e", true, true), false);
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
