// Run: node src/cellstyles.check.ts. Text styles in table cells and the Experiment details sheet: ⌘B, ⌘I, ⌘U, ⌘T,
// ⌘−, ⌘= and ⌘F work on the characters selected in a Table cell, a reagent table's text cell and an Experiment details
// value, as in a caption (docs/plans/cell-styles.md). The editor is a React page, so this reads how it is wired.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { browserStyle, normalise, ownRuns, plainOf, sliceRuns, styleRange } from "./richtext.ts";
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
// A tab or other control character pasted is a space too (a file whose cell holds one is refused as damaged).
assert.ok(box.includes('text = p.singleLine ? lined.replace(/[\\u0000-\\u001f]/g, " ") : lined'));
assert.ok(box.includes('flat = !!p.singleLine && /[\\u0000-\\u001f]/.test(plainOf(got))'));
// A box emptied of its text holds a bare line break: in one line it is no text, so a cleared cell is "", not " ".
assert.ok(box.includes('got = p.singleLine && plainOf(all).endsWith("\\n") ? edited(all, plainOf(all).slice(0, -1)) : all'));
// The menu's and the keys' styles go to the open cell first; an amount cell takes none, and its font, size and colour
// stay the whole table's.
assert.match(editor, /const box = cell && cellOpen\.current \? "table" : gridEdit \? "grid" : undefined;\s*if \(box && \(toggles\[what\] \|\| what === "formula"\)\)/);
assert.match(editor, /if \(gridStyles\(gridEdit!, gridEdit!\.value\)\) setGridEdit\(styleBox\(gridEdit!, gridApi\.current\?\.range\(\), patch\)\);\s*return;/);
assert.ok(editor.indexOf("const box = cell && cellOpen.current") < editor.indexOf("const texts = !writing && !selection.size"), "before the whole table's styles");
// A compound number goes to its caption and keeps no styles, so the keys do nothing while the cell holds one.
assert.match(editor, /const gridStyles = \(gc: GridCell, text\?: string\) => gridWrites\(gc\) && takesRuns\(gc\.row, gc\.key\) && !\(text !== undefined && gridNumber\(gc, oneLine\(text\)\.trim\(\)\)\);/);
assert.match(editor, /const own = kept && gridStyles\(w, text\) && text \? ownRuns\(kept, gridBase\(w\)\) : undefined, cap = gridNumber\(w, text\);/);
// A row of your own deleted takes its styles with it, both ways (Delete on its name, the Delete row action), and so
// does one an AI app deletes.
assert.equal(editor.match(/changeGrid\([^)]*\(h\) => dropOwn\(h, row(\.id)?\)\)/g)?.length, 2);
assert.ok(!/own: h\.own\?\.filter\(\(o\) => o\.id !== row\) \}/.test(editor));
const mcp = read("mcp.ts");
assert.match(mcp, /!grid\.own\?\.some\(\(o\) => o\.id === row\) \|\| own\.some\(\(o\) => o\.id === row\)/);
// Cells an AI app gives keep their styles only while the rows stay as many (a row taken out would move styles to
// the rows under it).
assert.match(mcp, /keep = !t\.cells \|\| cells\.length === was\?\.cells\.length;\s*return \{ \.\.\.rest, \.\.\.\(runs && keep \? \{ runs \} : \{\}\),/);
// Up or Shift-Return in the top row stays in the cell with its caret where it was (no new box, nothing selected).
assert.match(editor, /if \(r === w\.r && c === w\.c\) \{ if \(value !== plainOf\(w\.runs\)\) setCell\(\{ \.\.\.cellOf\(cur, r, c, w\.version \+ 1\), caret: \[value\.length, value\.length\] \}\); \}\s*else if \(r >= 0\) setCell/);
// An underlined table's empty cell shows the underline while typed in.
assert.match(editor, /textFace\(\{ \.\.\.sh, underline: sh\.underline && cell\.runs\.every\(\(x\) => !x\.text \|\| x\.underline\) \? true : undefined \}, size\)/);
// The panel's B, I and U show the open cell's style at the caret, and follow the caret.
assert.match(editor, /const at: \{ bold\?: boolean; italic\?: boolean; underline\?: boolean \} = range \? cell!\.pending \?\? common\(cell!\.runs, range\[0\], range\[1\]\) : sh;/);
assert.match(editor, /text: \{ \.\.\.tableFace\(first\), font:/);
// A reagent table cell too: its B, I and U follow a style applied, and go when the cell closes (Escape).
assert.match(editor, /const panelContext = useMemo\(\(\) => \(writing \|\| cell \|\| gridEdit \? undefined :[^\n]*\[doc, selection, picked, writing, !!cell, !!gridEdit,/);
assert.ok(editor.indexOf("const [cell, setCell] = useState") < editor.indexOf("if (!writing && !cell) return;"), "cell is declared before the caret effect reads it");
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
// Typing over a selection in WebKit wraps the new text in an element of its own that keeps the look of the first
// character it took: the box reads it in that look, so the cell keeps what the box shows.
const css = (c: Partial<Record<"fontWeight" | "fontStyle" | "textDecoration" | "verticalAlign", string>>) => ({ fontWeight: "", fontStyle: "", textDecoration: "", verticalAlign: "", ...c });
assert.deepEqual(browserStyle("B", css({}), {}), { bold: true }, "a <b> over a plain table is bold");
assert.deepEqual(browserStyle("SPAN", css({ fontWeight: "400" }), { bold: true }), {}, "font-weight 400 over a bold table is plain");
assert.deepEqual(browserStyle("SPAN", css({ fontWeight: "700", fontStyle: "italic", textDecoration: "underline", verticalAlign: "sub" }), {}), { bold: true, italic: true, underline: true, script: "sub" });
assert.deepEqual(browserStyle("SPAN", css({ fontStyle: "normal", textDecoration: "none", verticalAlign: "baseline" }), { italic: true, underline: true, script: "super" }), {});
assert.deepEqual(browserStyle("SPAN", css({}), { bold: true }), { bold: true }, "a span with no style of its own keeps the style around it");
assert.match(box, /else if \(n\.tagName !== "DIV"\) s = browserStyle\(n\.tagName, n\.style, style\)/, "read() uses it for elements without data-style");
// and over a span's own style: WebKit types into a copy of a styled span with its look kept inline (font-weight 400).
assert.match(box, /s = browserStyle\(n\.tagName, n\.style, JSON\.parse\(n\.dataset\.style\) as RunStyle\)/, "read() uses it over data-style");
// Plain on a whole Table takes the cells' scripts off too, as in a cell and on a caption.
assert.match(editor, /const keys = what === "plain" \? \["bold", "italic", "underline", "script"\]/);
// Typing in a reagent table cell does not draw the editor again for each key; a style applied does.
assert.match(editor, /if \(!rebuild\) \{ gridEdit\.runs = runs; gridEdit\.value = plainOf\(runs\); return; \}/);
assert.match(box, /if \(!p\.pending\) \{ runs\.current = now;/, "the box keeps the runs typed itself");
// A pending style waits for the end of a composition.
assert.match(box, /onInput=\{\(e\) => \{ if \(!\(p\.pending && \(e\.nativeEvent as InputEvent\)\.isComposing\)\) typed\(\); \}\}/);
assert.match(box, /onCompositionEnd=\{\(\) => \{ if \(p\.pending\) typed\(\); \}\}/);
// The reagent table's panel has B, I and U while a text cell is open, in the group that keeps the cell open.
assert.match(actions, /context\.kind === "grid" && context\.styles && \(\s*\/\/[^\n]*\n[^\n]*\n\s*<div className="chips label-style" role="group" aria-label="Cell style">/);
assert.match(editor, /const cellStyles = gridEdit && gridStyles\(gridEdit, gridEdit\.value\) \? \{ styles: common\(gridEdit\.runs, 0, gridEdit\.value\.length\) \} : \{\};/);
// A reagent table cell trimmed at both ends keeps each character's style: " dry THF " with "dry" italic is "dry THF"
// with "dry" italic, not all plain.
{
  const typed = [{ text: " " }, { text: "dry", italic: true as const }, { text: " THF " }], text = plainOf(typed).trim(), at = plainOf(typed).indexOf(text);
  assert.deepEqual(normalise(sliceRuns(typed, at, at + text.length)), [{ text: "dry", italic: true }, { text: " THF" }]);
  assert.match(editor, /const at = runs \? plainOf\(runs\)\.indexOf\(text\) : -1, kept = runs && \(at >= 0 \? sliceRuns\(runs, at, at \+ text\.length\) : edited\(runs, text\)\);/);
}
// The details sheet's text keys read the selection as the key comes, not as it was at the last redraw.
assert.match(sheet, /if \(command\) \{\s*e\.preventDefault\(\);\s*const r = apiOf\(f\.key\)\.current\?\.range\(\);\s*if \(r\) last\.current = \{ key: f\.key, range: r \};/);
console.log("cellstyles.check: ok");
