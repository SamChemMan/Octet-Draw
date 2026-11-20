// Run: node src/keys.check.ts. Fails loudly if shortcut lookup breaks.
import assert from "node:assert/strict";
import { actionFor, addsToSelection, clashes, controlTakes, copyDrag, skipsCycle, feedbackChord, keyOf, keymap, menuRuns, textEntry, textKey, tileTo } from "./keys.ts";

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
assert.equal(actionFor(map, "w", "bond"), "bond.wedge");
assert.equal(actionFor(map, "shift+w", "bond"), "bond.hashwedge");
assert.equal(actionFor(map, "w", "atom"), "element.N");
// Hollow wedge and dative take a key but have none by default, as in ChemDraw.
assert.ok(!map["bond.hollow"]?.length && !map["bond.dative"]?.length);
assert.equal(actionFor(keymap({ "bond.hollow": ["shift+v"] }), "shift+v", "bond"), "bond.hollow");
assert.equal(actionFor(keymap({ "bond.dative": ["shift+v"] }), "shift+v", "bond"), "bond.dative");
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
// Issue #10: every bond kind can take a key over a bond (Settings), the hollow wedge and dative bond too, with no
// default key, as in ChemDraw. w and h (and Shift+W) are the wedge keys.
import { BONDS } from "./kinds.ts";
assert.deepEqual(Object.keys(BONDS).filter((k) => !ACTIONS.some((a) => a.id === `bond.${k}` && a.place === "bond")), []);
assert.deepEqual([map["bond.hollow"], map["bond.dative"]], [[], []]);
assert.equal(actionFor(keymap({ "bond.hollow": ["shift+w"], "bond.hashwedge": ["h"] }), "shift+w", "bond"), "bond.hollow");
assert.deepEqual(["w", "h", "shift+w"].map((k) => actionFor(map, k, "bond")), ["bond.wedge", "bond.hashwedge", "bond.hashwedge"]);
// A bond key over a bond, on a selection and as an Actions panel style chip (which shows that key) all go through
// keyBond, so Wedge on a wedge turns it round in each.
import { readFileSync } from "node:fs";
const bondKeys = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8").match(/\w+\([^()]*BONDS\[arg as BondKind\]\.spec/g) ?? [];
assert.ok(bondKeys.length >= 3 && bondKeys.every((s) => s.startsWith("keyBond(")), bondKeys.join("\n"));
// Every Actions panel action can take a key (CD-34): none has one by default, as in ChemDraw, and a key set for one
// runs it anywhere.
import { ACTIONS, DIALOGS, MENU_READ, registerMenu } from "./keys.ts";
const panelActions = ACTIONS.filter((a) => a.id.startsWith("action."));
assert.ok(panelActions.length > 30 && panelActions.every((a) => !map[a.id]?.length));
assert.equal(new Set(ACTIONS.map((a) => a.id)).size, ACTIONS.length, "action ids are unique");
assert.equal(actionFor(keymap({ "action.cycle.reverse": ["shift+r"] }), "shift+r", "atom"), "action.cycle.reverse");
// A key saved for Remove the cycle under its old id (cycle.ungroup) still removes it.
assert.equal(actionFor(keymap({ "action.cycle.ungroup": ["shift+u"] }), "shift+u", "none"), "action.cycle.remove");
import { label } from "./keys.ts";
assert.equal(label("+"), "+");
assert.ok(["↩", "Enter"].includes(label("enter")));
// ChemDraw's ! and > over an atom (type a label; add a bond and type its label), and Shift+Option+arrows.
assert.equal(actionFor(map, press("!", { shiftKey: true }) ?? "", "atom"), "atom.newlabel");
assert.equal(actionFor(map, press(">", { shiftKey: true }) ?? "", "atom"), "atom.sproutlabel");
assert.equal(press("ArrowLeft", { altKey: true, shiftKey: true }), "alt+shift+arrowleft");
assert.equal(actionFor(map, "alt+shift+arrowleft", "none"), "tilt.left");
assert.equal(actionFor(map, "alt+arrowup", "none"), "rotate.ccw15");
// Shift with Command (Ctrl) and a symbol key records the physical key and keeps Shift, as a menu shortcut is
// written: ⇧⌘- (Reduce) is mod+shift+-, though the key types _. ⌘; and Option with a symbol are their keys too.
const held = (key: string, code: string, shift = false) => keyOf({ key, code, shiftKey: shift, altKey: false, metaKey: true, ctrlKey: false });
assert.equal(held("_", "Minus", true), "mod+shift+-");
assert.equal(held("+", "Equal", true), "mod+shift+=");
assert.equal(held(";", "Semicolon"), "mod+;");
assert.equal(held("!", "Digit1", true), "mod+shift+1");
assert.equal(keyOf({ key: "≠", code: "Equal", shiftKey: false, altKey: true, metaKey: false, ctrlKey: false }), "alt+=");
// View > Magnify (⇧⌘+) and Reduce (⇧⌘-): the keys pressed find the menu's commands, so the page runs them when the
// menu does not (registerMenu below puts the menu back as other checks need it).
registerMenu([["zoom_in", "Magnify", "View", "CmdOrCtrl+Shift+="], ["zoom_out", "Reduce", "View", "CmdOrCtrl+Shift+-"]]);
assert.equal(actionFor(keymap({}), held("+", "Equal", true)!, "none"), "menu.zoom_in");
assert.equal(actionFor(keymap({}), held("_", "Minus", true)!, "none"), "menu.zoom_out");
// The menu's commands join the list; one no longer in the menu (Online search off removes the Search menu) leaves it.

registerMenu([["clean_up", "Clean Up Structure", "Structure", "CmdOrCtrl+Shift+K"], ["search_reaxys", "Search Reaxys", "Search", "Alt+CmdOrCtrl+F"]]);
assert.ok(ACTIONS.some((a) => a.id === "menu.search_reaxys") && ACTIONS.some((a) => a.id === "menu.clean_up"));
assert.equal(actionFor(keymap({}), "mod+alt+f", "none"), "menu.search_reaxys");
// A command whose menu name ends in "…" opens a dialog (Octet with no window refuses it); its name in the list has no "…".
registerMenu([["clean_up", "Clean Up Structure", "Structure", "CmdOrCtrl+Shift+K"], ["rotate_dialog", "Rotate…", "Object", "CmdOrCtrl+R"]]);
assert.deepEqual([DIALOGS.has("rotate_dialog"), DIALOGS.has("clean_up"), ACTIONS.find((a) => a.id === "menu.rotate_dialog")?.name], [true, false, "Rotate"]);
// Octet with no window answers once the menu's commands are known (MENU_READ): they are, after registerMenu.
{
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([MENU_READ, new Promise((_, no) => { timer = setTimeout(() => no(new Error("MENU_READ never came")), 1000); })]);
  clearTimeout(timer);
}
registerMenu([["clean_up", "Clean Up Structure", "Structure", "CmdOrCtrl+Shift+K"]]);
assert.ok(!ACTIONS.some((a) => a.id === "menu.search_reaxys") && ACTIONS.some((a) => a.id === "menu.clean_up"));
assert.equal(actionFor(keymap({}), "mod+alt+f", "none"), undefined);
// View > Show Grid (⌘'), Show Rulers (⌘;) and Show Crosshair (⌥⌘X): their keys read as the page writes them.
registerMenu([["grid", "Show Grid", "View", "CmdOrCtrl+'"], ["rulers", "Show Rulers", "View", "CmdOrCtrl+;"], ["crosshair", "Show Crosshair", "View", "Alt+CmdOrCtrl+X"]]);
assert.deepEqual(["menu.grid", "menu.rulers", "menu.crosshair"].map((id) => keymap({})[id]), [["mod+'"], ["mod+;"], ["mod+alt+x"]]);
assert.equal(actionFor(keymap({}), "mod+;", "none"), "menu.rulers");
// A View or Window command leaves a measurement in progress; another menu command takes it away (Editor's menu listener),
// but Undo and Redo: the menu's Undo takes off its last end, and its Redo does nothing (Editor's undo).
import { showsOnly } from "./keys.ts";
registerMenu([["zoom_in", "Magnify", "View", "CmdOrCtrl+Shift+="], ["grid", "Show Grid", "View", "CmdOrCtrl+'"], ["minimise", "Minimise", "Window", "CmdOrCtrl+M"], ["clean_up", "Clean Up Structure", "Structure", "CmdOrCtrl+Shift+K"], ["undo", "Undo", "Edit", "CmdOrCtrl+Z"]]);
assert.deepEqual(["zoom_in", "grid", "minimise", "clean_up", "undo", "nothing"].map(showsOnly), [true, true, true, false, false, false]);
assert.match(readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), /useListen<string>\("menu", \(e\) => \{[^]*?if \(!showsOnly\(e\.payload\) && e\.payload !== "undo" && e\.payload !== "redo"\) setMeasuring\(undefined\);/);
// The menu's Undo and Redo run the editor's undo (commands.current.undo and redo), which a curve or a measurement in
// progress takes first: Undo takes off its last point, Redo does nothing, and the history stays as it is.
assert.match(readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), /const undo = \(redo = false\) => \{[^}]*?if \(pen \|\| measuring\) \{ if \(!redo\) takeBack\(\); return; \}/);
assert.match(readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), /undo: \(\) => \(typing\(\) \? void document\.execCommand\("undo"\) : undo\(\)\),\s+redo: \(\) => \(typing\(\) \? void document\.execCommand\("redo"\) : pen \|\| measuring \|\| h\.at < h\.stack\.length - 1 \? undo\(true\) : repeatLast\(\)\),/);
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
// ChemDraw's text keys in a caption or label box (⌘B, ⌘I, ⌘U, ⌘T and so on): a label takes the style keys, as a
// caption does, but not Formula; ⇧⌘N in either. Subscript and Superscript go to a label too (issue 44: Fe with III
// raised).
for (const [key, command] of [["b", "caption.bold"], ["I", "caption.italic"], ["u", "caption.underline"], ["t", "caption.plain"], ["-", "caption.sub"], ["=", "caption.super"], ["+", "caption.super"]]) {
  assert.equal(textKey({ key, shiftKey: false }, true), command, key);
  assert.equal(textKey({ key, shiftKey: false }, false), command, key);
}
assert.equal(textKey({ key: "f", shiftKey: false }, false), "caption.formula");
assert.equal(textKey({ key: "f", shiftKey: false }, true), undefined);
assert.deepEqual([textKey({ key: "N", shiftKey: true }, true), textKey({ key: "n", shiftKey: true }, false), textKey({ key: "c", shiftKey: false }, false)], ["name_to_structure", "name_to_structure", undefined]);
assert.equal(textEntry({ tagName: "BUTTON" }), false);
assert.equal(textEntry(null), false);
// Home's tiles: the New row (six narrow tiles) over the recent drawings (four wide tiles to a row, ten in all, so the
// last row has two). Up and Down go to the tile in the next row whose middle is nearest across, not by reading order.
const newRow = [0, 1, 2, 3, 4, 5].map((k) => ({ x: k * 166, y: 100, width: 150, height: 130 }));
const recent = [...Array(10).keys()].map((k) => ({ x: (k % 4) * 240, y: 300 + Math.floor(k / 4) * 224 + (k % 2), width: 220, height: 200 }));
const home = [...newRow, ...recent];
// Down from the fourth New tile (middle 573) goes to the third recent drawing (middle 590), not the fourth.
assert.equal(tileTo("ArrowDown", 3, home), 8);
assert.equal(tileTo("ArrowDown", 0, home), 6);
assert.equal(tileTo("ArrowDown", 5, home), 9);
// Up from a recent drawing goes to the nearest New tile; up from the New row stays.
assert.equal(tileTo("ArrowUp", 9, home), 5);
assert.equal(tileTo("ArrowUp", 7, home), 2);
assert.equal(tileTo("ArrowUp", 2, home), 2);
// Down a recent row, and down to the short last row with nothing under: its nearest tile. Down from the last row stays.
assert.equal(tileTo("ArrowDown", 7, home), 11);
assert.equal(tileTo("ArrowDown", 13, home), 15);
assert.equal(tileTo("ArrowDown", 15, home), 15);
// Left and Right go in reading order, from the end of the New row to the first recent drawing; the ends stay.
assert.equal(tileTo("ArrowRight", 5, home), 6);
assert.equal(tileTo("ArrowLeft", 6, home), 5);
assert.equal(tileTo("ArrowLeft", 0, home), 0);
assert.equal(tileTo("ArrowRight", 15, home), 15);
// No tile with the focus: any arrow goes to the first. Other keys, or no tiles, do nothing.
assert.equal(tileTo("ArrowDown", -1, home), 0);
assert.equal(tileTo("Enter", 3, home), undefined);
assert.equal(tileTo("ArrowDown", -1, []), undefined);
// Home blocks the drawing's menu commands as a dialog does. New (and New For), Open, Settings, About and the tutorial
// still run, and Select All selects Home's drawings; Undo, Redo and Select All run on the text of the name box.
const onHome = { home: true, modal: false, typing: false };
for (const id of ["flip_h", "mirror_v", "clean_up", "zoom_in", "export", "save", "import", "command_palette", "colour_0"]) assert.equal(menuRuns(id, onHome), false, id);
for (const id of ["new", "new_quick", "new_paper", "new_own_0", "open", "settings", "about", "tutorial", "home", "recent_0", "recent_clear", "check_updates", "quit", "select_all"]) assert.equal(menuRuns(id, onHome), true, id);
// File > Open Example opens a copy of an example from Home and over a drawing, but not over a dialog or an AI app's call.
for (const id of ["example_oseltamivir", "example_hydrolysis", "example_lactams"]) {
  assert.equal(menuRuns(id, onHome), true, id);
  assert.equal(menuRuns(id, { home: false, modal: false, typing: false }), true, id);
  assert.equal(menuRuns(id, { home: false, modal: true, typing: false }), false, id);
  assert.equal(menuRuns(id, { home: true, modal: false, typing: false, calling: true }), false, id);
}
// Quit and Close Window ask about unsaved changes over any dialog (the Dock's Quit too).
for (const id of ["quit", "close"]) assert.equal(menuRuns(id, { home: false, modal: true, typing: false }), true, id);
// Cut, Copy and Paste (Octet's own on Linux) run everywhere: on a field's text, or on the drawing, which takes them only
// when nothing covers it.
for (const id of ["cut", "copy", "paste"]) for (const over of [onHome, { home: false, modal: true, typing: true }, { home: false, modal: false, typing: false }]) assert.equal(menuRuns(id, over), true, id);
assert.equal(menuRuns("select_all", { ...onHome, typing: true }), true);
assert.equal(menuRuns("flip_h", { ...onHome, typing: true }), false);
// While an AI app's call runs, the drawing takes no menu command, key, cut or paste of the user's (they would join the
// call's undo step): Quit, Close Window and Copy still run.
const calling = { home: false, modal: false, typing: false, calling: true };
for (const id of ["undo", "redo", "delete", "clean_up", "flip_h", "select_all", "save"]) assert.equal(menuRuns(id, calling), false, id);
for (const id of ["quit", "close", "copy"]) assert.equal(menuRuns(id, calling), true, id);
{
  const editor = readFileSync(new URL("./Editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /if \(home \|\| modal\(\)\) return; \/\/ Home and dialogs have their own keys\n(?:\s*\/\/.*\n)*\s*if \(mcpCalling\.current\) return;/, "the canvas takes no keys during a call");
  assert.equal(editor.match(/calling: mcpCalling\.current/g)?.length, 2, "both menu paths say a call runs");
  assert.equal(editor.match(/modal\(\) \|\| mcpCalling\.current/g)?.length, 2, "cut and paste wait for the call");
}
// A dialog blocks every command but the text ones; with no dialog and no Home, every command runs.
assert.equal(menuRuns("new", { home: false, modal: true, typing: false }), false);
assert.equal(menuRuns("undo", { home: false, modal: true, typing: true }), true);
assert.equal(menuRuns("flip_h", { home: false, modal: false, typing: false }), true);
assert.equal(menuRuns("text_bold", { home: false, modal: false, typing: true }), true);

// Copy-drag (issues 33, 45): Option on the Mac only; Ctrl or Alt on Windows and Linux.
const mods = (o: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean }>) => ({ altKey: false, ctrlKey: false, metaKey: false, ...o });
assert.equal(copyDrag(mods({ altKey: true }), true), true);
assert.equal(copyDrag(mods({ ctrlKey: true }), true), false);
assert.equal(copyDrag(mods({}), true), false);
assert.equal(copyDrag(mods({ ctrlKey: true }), false), true);
assert.equal(copyDrag(mods({ altKey: true }), false), true);
assert.equal(copyDrag(mods({}), false), false);
// Ctrl during a move keeps it off a catalytic cycle, unless Ctrl started the drag as a copy.
assert.equal(skipsCycle(mods({ ctrlKey: true }), false), true);
assert.equal(skipsCycle(mods({ ctrlKey: true }), true), false);
assert.equal(skipsCycle(mods({ metaKey: true }), true), true);
assert.equal(skipsCycle(mods({}), false), false);

// Issue 32: on Windows and Linux Ctrl-click adds to the selection (or takes out what was all selected) as Shift-click
// does; on the Mac Control-click is the right-click and adds nothing. Shift adds everywhere.
const keysOf = (o: Partial<{ shiftKey: boolean; ctrlKey: boolean }>) => ({ shiftKey: false, ctrlKey: false, ...o });
assert.equal(addsToSelection(keysOf({ ctrlKey: true }), false), true, "Ctrl-click adds on Windows and Linux");
assert.equal(addsToSelection(keysOf({ ctrlKey: true }), true), false, "not on the Mac");
for (const mac of [true, false]) {
  assert.equal(addsToSelection(keysOf({ shiftKey: true }), mac), true);
  assert.equal(addsToSelection(keysOf({}), mac), false);
}
// The click adds; the press stays Ctrl-drag's, which moves a copy (copyDrag), and is made with Shift alone but on bare
// canvas, where a Ctrl press starts a box that adds as Shift's does. Shift and Ctrl reach the click the same way.
{
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), at = editor.indexOf('    if (tool === "select") {\n      // Ctrl-click');
  assert.ok(at > 0, "found the Select press");
  const block = editor.slice(at, editor.indexOf("\n    }", at));
  assert.match(block, /pressMods\.current = \{ shift: adds, alt: e\.altKey/);
  assert.match(block, /return pressSelect\(p, t, e\.shiftKey \|\| bare, screen, copy\)/);
  assert.equal((editor.match(/pressMods\.current = \{ shift: e\.shiftKey/g) ?? []).length, 0, "every Select press counts Ctrl as Shift for its click");
  assert.ok(editor.indexOf("if (MAC && e.ctrlKey) {") < at, "the Mac's Control-click goes to the context menu first");
}

// Issue 60: the circled charges take a key in Settings, over an atom, and have none by default. A charge key on one
// atom and on a selection both go through keyCharge, and the circled pair mark the charge as the Symbols tool does.
import { keyCharge } from "./edit.ts";
import type { Mol } from "./render.ts";
{
  const charges = ACTIONS.filter((a) => a.id.startsWith("charge."));
  assert.deepEqual(charges.map((a) => [a.id, a.place, map[a.id] ?? []]),
    [["charge.plus", "atom", ["+"]], ["charge.minus", "atom", ["-"]], ["charge.circledPlus", "atom", []], ["charge.circledMinus", "atom", []], ["charge.circled", "atom", []]]);
  assert.equal(actionFor(keymap({ "charge.circledPlus": ["("] }), "(", "atom"), "charge.circledPlus");
  assert.deepEqual(clashes(map, "charge.circledMinus", ")"), []);
  const n: Mol = { atoms: [{ label: "N", location: [0, 0, 0] }], bonds: [] }, mark = (m: Mol, arg: string) => keyCharge(m, 0, arg).atoms[0];
  assert.deepEqual(charges.map((a) => { const x = mark(n, a.id.slice(7)); return [x.charge, x.circled]; }), [[1, undefined], [-1, undefined], [1, true], [-1, true], [undefined, undefined]]);
  const circled = keyCharge(n, 0, "circledPlus");
  assert.deepEqual([mark(circled, "circledPlus").charge, mark(circled, "circledMinus").circled], [2, undefined], "a second circled key adds up, or takes the charge off");
  assert.equal(mark(circled, "plus").circled, true, "+ on a circled charge keeps the circle, as before");
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  assert.equal(editor.match(/if \(kind === "charge"[^\n]*keyCharge\(\w+, \w+, arg, !!style\.circled\)/g)?.length, 2, "a charge key on an atom and on a selection, in the document's look");
}
console.log("keys.check: circled charges on a key ok");

// Every tool can be given a key (PR #58). The tools are read from their own union, so a tool added later needs an action.
{
  const { DEFAULT_KEYS, MEASURE_TOOLS, PEN_TOOLS, RING_TOOLS, optionCommand } = await import("./keys.ts");
  const tools = readFileSync(new URL("tools.tsx", import.meta.url), "utf8"), editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  const ids = tools.match(/^export type Tool = (.+);$/m)![1].split("|").map((t) => t.trim().replace(/"/g, ""));
  assert.ok(ids.length > 20 && ids.includes("gel") && ids.includes("sequence"), `read the tools: ${ids.join(" ")}`);
  assert.deepEqual(ids.filter((id) => !ACTIONS.some((a) => a.id === `tool.${id}` && a.place === "any" && a.group === "Tools")), [], "every tool has a tool.<id> action");
  assert.deepEqual(ids.filter((id) => !(`tool.${id}` in DEFAULT_KEYS)), [], "every tool has a DEFAULT_KEYS entry");
  // No new default key: ChemDraw 22.2 has none for these.
  const added = ["sequence", "cycle", "gel", "plasmid", "table", "fragment", "massspec", "synthesis", "retro", "map", "measure", "measureLength", "measureAngle", "measureDihedral"];
  assert.deepEqual(added.flatMap((id) => DEFAULT_KEYS[`tool.${id}`]), []);
  assert.deepEqual(added.map((id) => ACTIONS.find((a) => a.id === `tool.${id}`)!.name), ["Sequence tool", "Catalytic cycle tool", "Gel tool", "Plasmid map tool", "Table tool",
    "Mass fragmentation tool", "Mass spec analysis tool", "Synthesis tool", "Retrosynthesis tool", "Atom map tool", "Measure tool", "Measure length tool", "Measure angle tool", "Measure dihedral tool"]);
  // A key the user sets picks the tool, over nothing and over an atom with no action for it; it clashes with a tool
  // that has it; Reset to ChemDraw keys (no changes) takes it off.
  const mine = keymap({ "tool.gel": ["shift+v"], "tool.sequence": ["g"] });
  assert.equal(actionFor(mine, "shift+v", "none"), "tool.gel");
  assert.equal(actionFor(mine, "shift+v", "atom"), "tool.gel");
  assert.deepEqual(clashes(keymap(), "tool.gel", "g"), ["tool.tlc"]);
  assert.deepEqual(clashes(mine, "tool.map", "g").sort(), ["tool.sequence", "tool.tlc"]);
  assert.deepEqual(keymap({})["tool.gel"], []);
  assert.equal(actionFor(keymap({}), "g", "none"), "tool.tlc");
  // The Ring slot, its menu and a pinned ring name the ring's key; the More tools menu names each tool's.
  assert.deepEqual([optionCommand("ring", "benzene"), optionCommand("ring", "cyclopentadiene"), optionCommand("ring", "6"), optionCommand("ring", "5")],
    ["tool.benzene", "tool.cyclopentadiene", "tool.cyclohexane", "tool.cyclopentane"]);
  assert.deepEqual([optionCommand("ring", "3"), optionCommand("ring", "chair1"), optionCommand("bond", "single"), optionCommand("more", "gel")], [undefined, undefined, undefined, "tool.gel"]);
  assert.deepEqual([keymap()[optionCommand("ring", "benzene")!], keymap()[optionCommand("ring", "cyclopentadiene")!]], [["j"], ["shift+j"]]);
  // The Measure slot's variants (Length, Angle, Dihedral) each have a command, with no default key (no ChemDraw key moves).
  assert.deepEqual(["distance", "angle", "dihedral"].map((k) => optionCommand("measure", k)), ["tool.measureLength", "tool.measureAngle", "tool.measureDihedral"]);
  assert.deepEqual(Object.values(MEASURE_TOOLS), ["distance", "angle", "dihedral"]);
  assert.match(tools, /t\.id === "measure" \? optionKey\("measure", p\.variants\.measure\)/, "the Measure slot names its variant's key");
  assert.ok(Object.values(RING_TOOLS).every((k) => new RegExp(`^  "?${k}"?: \\{ name:`, "m").test(tools)), "each ring command picks a ring in RINGS");
  assert.match(tools, /data-key=\{t\.id === "pen" \? optionKey\("pen", p\.variants\.pen\) : p\.keys\(`tool\.\$\{t\.id\}`\) \?\? \(t\.id === "ring" \? optionKey\("ring", p\.variants\.ring\)/, "the Ring slot names its ring's key, and the Pen slot its option's");
  assert.match(tools, /hint: optionKey\("more", id\)/, "the More tools menu names each tool's key");
  assert.match(tools, /arrived: arrived === kind, hint: optionKey\(tool, kind\)/, "a strip's options name their keys");
  assert.match(tools, /aria-label=\{nameOf\(tool, kind\)\}\s+data-key=\{optionKey\(tool, kind\)\}/, "a pinned option names its key");
  // The clash note keeps TLC and Me as they are written; Reset to ChemDraw keys clears it, so its Undo cannot undo the reset.
  const settings = readFileSync(new URL("SettingsWindow.tsx", import.meta.url), "utf8");
  assert.match(settings, /Taken from \$\{taken\.map\(\(t\) => ACTIONS\.find\(\(a\) => a\.id === t\)!\.name\.replace\(\/\^\[A-Z\]\(\?=\[a-z\]\)\/, \(c\) => c\.toLowerCase\(\)\)\)/);
  assert.deepEqual(["TLC plate tool", "Gel tool", "Set atom to Me"].map((n) => n.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())), ["TLC plate tool", "gel tool", "set atom to Me"]);
  assert.match(settings, /onClick=\{\(\) => \{ p\.onKeys\(\{\}\); setNote\(undefined\); \}\}/);
  // A specialist tool's key leaves it in its slot, as its menu does; a Pen key picks its option in the Pen slot, and a
  // Measure variant's key the variant.
  assert.match(editor, /slot = ring \? "ring" : penOption \? "pen" : measure \? "measure" : SPECIAL\.includes\(arg as Tool\) \? "more" : undefined;\s+if \(slot\) setSettings\(\(s\) => \(\{ \.\.\.s, variants: \{ \.\.\.s\.variants, \[slot\]: ring \?\? penOption \?\? measure \?\? arg \} \}\)\);\s+return setTool\(ring \? "ring" : penOption \? "pen" : measure \? "measure" : \(arg as Tool\)\);/);
  // The Pen tool (Sam, 19 November 2026): tool.pen picks the Pen and tool.editcurve Edit curve, with no key by default
  // (ChemDraw 22.2's hotkeys give its Pen tools none; only 17.1's guide gave the Pen l). Settings lists them as the
  // other tools ("Pen tool"), and the Pen strip, its slot and a pinned Pen option name their keys.
  const { PENS } = await import("./kinds.ts");
  assert.deepEqual(["tool.pen", "tool.editcurve"].map((id) => [ACTIONS.find((a) => a.id === id)?.name, ACTIONS.find((a) => a.id === id)?.group, DEFAULT_KEYS[id]]), [["Pen tool", "Tools", []], ["Edit curve tool", "Tools", []]]);
  assert.deepEqual([optionCommand("pen", "pen"), optionCommand("pen", "pen-edit"), optionCommand("pen", "box-plain"), optionCommand("shape", "pen")], ["tool.pen", "tool.editcurve", undefined, undefined]);
  assert.deepEqual(Object.values(PEN_TOOLS).sort(), Object.keys(PENS).sort(), "each Pen option has its command");
  const mine2 = keymap({ "tool.editcurve": ["shift+v"] });
  assert.equal(actionFor(mine2, "shift+v", "none"), "tool.editcurve");
  assert.deepEqual(clashes(keymap({ "tool.pen": ["g"] }), "tool.pen", "g"), ["tool.tlc"]);
  // No ChemDraw key moved: DEFAULT_KEYS but the two Pen commands, the three Measure variants' (and the menu's, which
  // registerMenu above put in) is as Octet 1.1.3 began (release-1.1.3 e5af1273). The digest is sha256 of its entries
  // sorted by id, as JSON, cut to 16 hex digits.
  const { createHash } = await import("node:crypto");
  const rest = Object.entries(DEFAULT_KEYS).filter(([id]) => !["tool.pen", "tool.editcurve", "tool.measureLength", "tool.measureAngle", "tool.measureDihedral"].includes(id) && !id.startsWith("menu.")).sort(([a], [b]) => (a < b ? -1 : 1));
  assert.equal(createHash("sha256").update(JSON.stringify(rest)).digest("hex").slice(0, 16), "b8569d18f3cb9344", "a default key changed: every other default is ChemDraw's");
  assert.equal(rest.length, 142);
}
console.log("keys.check: every tool can be given a key, and the Ring slot names its ring's ok");
