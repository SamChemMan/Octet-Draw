// Run: node src/cellstyles.check.ts. Text styles in table cells and the Experiment details sheet: ⌘B, ⌘I, ⌘U, ⌘T,
// ⌘−, ⌘= and ⌘F work on the characters selected in a Table cell, a reagent table's text cell and an Experiment details
// value, as in a caption (docs/plans/cell-styles.md). The editor is a React page, so this reads how it is wired.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalise, ownRuns, plainOf, styleRange } from "./richtext.ts";
import { formulaOver } from "./labels.ts";
import { expandRuns } from "./escapes.ts";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const editor = read("Editor.tsx"), sheet = read("DetailsSheet.tsx"), box = read("RichBox.tsx"), actions = read("Actions.tsx");

// Both cell boxes are rich text boxes on one line: Return, Tab, the arrows and Escape stay the cell's own keys, and
// the text keys come after them.
const cellBoxes = editor.split("<RichBox").slice(1).filter((b) => /className="cell-box"/.test(b.slice(0, 300)));
assert.equal(cellBoxes.length, 2, "a Table cell and a reagent table cell");
for (const b of cellBoxes) {
  const props = b.slice(0, b.indexOf("/>"));
  assert.match(props, /singleLine/);
  assert.match(props, /textKeys\(e, false, true\)/);
  assert.match(props, /api=\{(cellApi|gridApi)\}/);
}
assert.match(editor, /if \(dir\) \{[\s\S]{0,200}commitGridCell\(gridEdit\.value, gridEdit, gridEdit\.runs\);[\s\S]{0,120}\} else if \(e\.key === "Escape"\) \{ e\.preventDefault\(\); setGridEdit\(undefined\); \}\s*else textKeys\(e, false, true\);/);
assert.match(editor, /if \(e\.key === "Escape"\) \{ e\.preventDefault\(\); return commitCell\(\); \}\s*\/\/ ChemDraw's text keys, as in a caption\.\s*textKeys\(e, false, true\);/);
// One line: every Return is the cell's, never a new line; a pasted line break is a space; screen readers hear one line.
assert.match(box, /if \(e\.key === "Enter" && p\.singleLine\) e\.preventDefault\(\);\s*else if \(e\.key === "Enter" && \(e\.shiftKey \|\| e\.altKey \|\| p\.returnNewLine\)\)/);
assert.match(box, /aria-multiline=\{!p\.singleLine\}/);
assert.match(box, /text = p\.singleLine \? lined\.replace\(\/\\n\/g, " "\) : lined/);
// The menu's and the keys' styles go to the open cell first; an amount cell takes none, and its font, size and colour
// stay the whole table's.
assert.match(editor, /const box = cell && cellOpen\.current \? "table" : gridEdit \? "grid" : undefined;\s*if \(box && \(toggles\[what\] \|\| what === "formula"\)\)/);
assert.match(editor, /if \(gridStyles\(gridEdit!\)\) setGridEdit\(styleBox\(gridEdit!, gridApi\.current\?\.range\(\), patch\)\);\s*return;/);
assert.ok(editor.indexOf("const box = cell && cellOpen.current") < editor.indexOf("const texts = !writing && !selection.size"), "before the whole table's styles");
// The Actions panel's B, I and U keep the cell open (its other buttons close it first, as a click elsewhere does).
assert.match(actions, /cellOpen && e\.target instanceof Element && e\.target\.closest\("\.label-style"\)/);
assert.match(editor, /cellOpen=\{!!cell \|\| !!gridEdit\}/);
// Each commit is one undo step: the styles go into the drawing with the text, in setTableCell's and changeGrid's step.
assert.match(editor, /setTableCell\(cur, w\.r, w\.c, value, cellWidth\(cur\), style\.captionSize, own\)/);
assert.match(editor, /if \(m !== doc\) set\(m, true\);/);
// Typing in a reagent table cell does not draw the drawing again: the drawing follows only which cell is open.
assert.match(editor, /const gridEditing = gridEdit && `\$\{gridEdit\.arrow\}\|\$\{gridEdit\.row\}\|\$\{gridEdit\.key\}`;/);
assert.ok(!/\[shown, drawing, frame, darkPaper, arrows, pt, gridKey, gridEdit,/.test(editor));

// The Experiment details sheet: the same keys on a value (the Text menu does not reach a dialog).
assert.match(sheet, /const command = \(MAC \? e\.metaKey : e\.ctrlKey\) && !e\.altKey \? textKey\(e, false, true\) : undefined;/);
for (const [command, run] of [["bold", 'toggle\\("bold"\\)'], ["italic", 'toggle\\("italic"\\)'], ["underline", 'toggle\\("underline"\\)'], ["sub", 'script\\("sub"\\)'], ["super", 'script\\("super"\\)'], ["formula", "formula"], ["plain", "restyle\\("]])
  assert.match(sheet, new RegExp(`"caption\\.${command}": (\\(\\) => )?${run}`), command);

// What a cell keeps: runs only where a character differs from the cell's own look, a typed name expanded with each
// character's style, formula counts lowered only where a character has no script of its own.
const bold = { bold: true as const };
assert.equal(ownRuns([{ text: "THF", ...bold }], bold), undefined, "typed over a value, bold is the cell's own look");
assert.deepEqual(ownRuns([{ text: "TH", ...bold }, { text: "F" }], bold), [{ text: "TH", bold: true }, { text: "F" }], "⌘B took the bold off F");
assert.equal(ownRuns([{ text: "" }], {}), undefined);
assert.equal(plainOf(expandRuns([{ text: "5 \\mu{}", ...bold }, { text: "L" }])), "5 μL");
assert.deepEqual(formulaOver(normalise(styleRange([{ text: "K2CO3" }], 0, 2, (s) => ({ ...s, ...bold })))), [{ text: "K", bold: true }, { text: "2", bold: true, script: "sub" }, { text: "CO" }, { text: "3", script: "sub" }]);
assert.deepEqual(formulaOver([{ text: "H2", script: "super" }, { text: "O" }]), [{ text: "H2", script: "super" }, { text: "O" }], "a character's own script stays");
console.log("cellstyles.check: ok");
