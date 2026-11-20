# Text styles in table cells

Branch `item/cell-styles-113`, from release-1.1.3 (e5af1273). For 1.1.3.

## What it does

- In a Table cell and in a reagent table's text cell, these keys work on the selected characters, as in a caption:
  - ⌘B Bold, ⌘I Italic, ⌘U Underline
  - ⌘− Subscript, ⌘= Superscript
  - ⌘T Plain, which takes all of these off
  - ⌘F Formula: the counts in the selection (or in all of the cell) become subscripts
- The Text menu's items do the same while a cell is open. The Actions panel's B, I and U buttons do too, and the
  cell stays open. In a reagent table text cell they are pressed when every character of the cell has that style.
- With nothing selected, the style goes on the next characters typed.
- Font, size and colour stay on the whole Table or the whole reagent table, as before.
- The reagent table's text cells are a row's name, Formula, MW, a compound's name, text typed over its number, and
  the rows of your own. A compound number typed there is the compound's number caption in the drawing, so it takes
  no styles of its own: the text keys do nothing while the cell holds one.
  Amount cells (Mass, Moles, Equiv, Volume and the other amounts) stay plain: their text is written again from their
  number each time the table is drawn. The text keys do nothing there.
- In the reagent table, text typed over a value is bold, as before. ⌘B on some of its characters takes the bold off
  them.
- A cell shows its styles on the page, in every export and after a save. Formula counts are still lowered where a
  character has no script of its own, so K₂CO₃ stays K₂CO₃ with part of it bold.
- Tab, Return, Shift-Return, the arrow keys and Escape do what they did. Return never makes a new line in a cell. A
  line break or tab pasted into a cell becomes a space. Up or Shift-Return in a Table's top row keeps the caret where
  it is.
- While a Table cell is open, the Actions panel's B, I and U show the style at the caret or of the selection.
- Bold, Italic, Underline or Plain on a whole Table goes on every character of its cells too, so no cell keeps that
  style of its own. Plain takes the cells' subscripts and superscripts off too, as it does in a cell and on a caption.
- Each cell typed in is one undo step, as before. Styling while typing is not a step of its own.
- The Experiment details sheet takes the same keys on a value. The Text menu does not reach a dialog, so the sheet
  handles them itself.

## How

### The boxes

- Both cell boxes are now `RichBox`, the box captions and atom labels are typed in, with two new props:
  - `singleLine`: every Return goes to the cell's own key handler, `aria-multiline` is false, and a pasted line break
    is a space.
  - `base`: the style of text typed outside the box's own styled spans. It is the cell's own look: the Table's bold,
    italic and underline, or bold for text typed over a reagent table value.
- A cell's runs are each character's whole style. The box shows each span with its weight and slant set, so the
  box's own bold does not show through.
- The keys go through `textKeys(e, false, true)`. With `cell` set, `textKey` maps b, i, u, t, f, − and =, and not ⇧⌘N.
- `runAction` sends the text commands to the open cell before the whole-table styles (`styleBox`). An amount cell
  takes none.
- The Actions panel keeps the focus in the cell for a press on its text style group (`.label-style`) only. Its other
  buttons close the cell first, as a click elsewhere does, so a row added or deleted never meets an open cell. The
  reagent table's panel gets a B, I and U group of its own (`styles` in its context) while a text cell is open.
- Typing over a selection in WebKit wraps the new text in an element of its own (a `<b>`, or a span with a font
  weight) to keep the look of the first character it took. `read()` reads such an element by its tag and inline style
  (`browserStyle`), so the cell keeps what the box shows.
- A style set with nothing selected waits for the end of an input method's composition before the box is built
  again.
- Typing in a reagent table cell keeps the text on the open cell without drawing the editor again for each key, as
  the plain input before it did. Only a style applied builds the box again.

### What is stored

Runs sit beside the plain text, never inside it:

- Table: `runs?: (TextRun[] | null)[][]`, the same shape as `cells`, null for a cell without.
- Reagent table: `runs?: Record<row, Record<key, TextRun[]>>`, keyed as `text` is ("#" for a row's name; a row of
  your own by its id).
- `cells`, `text`, `name` and `values` stay the plain text. Everything that reads them (Formula and MW, Copy Table,
  the ELN export, AI apps) reads them as before.
- A cell keeps runs only where a character differs from the cell's own look (`ownRuns`). A cell that looks as it did
  adds nothing to the file.
- Runs count only while they join to the cell's text (`runsFor`, `cellRuns`). A writer that changes the text alone,
  such as an older Octet or an AI app, leaves them out of use, and the cell draws plain.
- In the reagent table, runs count only on text kept in the table (`Grid.text`, or a row of your own), the same rule
  `readGrid` uses. When that text is taken off, the default or worked-out text shows plain.

### Files

- `VERSION` stays 1. Octet 1.1.2 and the parent of this branch open a new file and keep each cell's text: their
  `readTable` and `readGrid` leave out keys they do not know.
- .oct, CDXML (Octet's own data on the table group and the arrow) and CDX keep the runs. `readTableRuns` and
  `readCellRuns` check them: only text, bold, italic, underline and script; no more runs than characters; each
  joining to its text. Every cell the editor can make may keep runs: a Table's own limits (100 rows, 20 columns,
  500 characters a cell) bound them, and in the reagent table the text they join to does (400 cells typed over, 20
  rows of your own). Runs on an amount cell, or on a row of your own that is gone, are left out. Anything else that
  is wrong is left out, and the drawing still opens.
- A Table cell is written to CDXML as `<s>` runs with the faces the page draws (bold 1, italic 2, underline 4,
  subscript 32, superscript 64), its formula counts lowered (`formulaOver`). A cell without runs gets its formula
  subscripts too, so the file shows K₂CO₃ as the page does.

### Edits

- `spliceTable`, `resizeTable`, `setTableCell` and `clearTable` move, cut and clear each cell's runs with its text.
  An entry number numbered again keeps its style, and so does one Clear contents keeps.
- Clearing a reagent table cell, writing it, or deleting a row of your own (Delete on its name or the Delete row
  action) clears its runs.
- Make static writes a styled cell's runs into its caption.

### Drawing and speed

- A cell with runs draws them as tspans (`richSpans`), its `<text>` without the table's bold, italic and underline.
- `tableLayout` passes a cell's runs to `measure`, so a bold run is measured bold. A reagent table's row names measure
  their runs too.
- A cell without runs takes the path it took before. `tablespeed.check.ts` times a 20 by 20 Table against the
  parent's `tableLayout`. Typing in a reagent table cell no longer draws the drawing again: the drawing follows only
  which cell is open.

## Checks

- `file.check.ts`: Table runs round trip; runs that do not join, unknown keys, a font, size or colour, and more
  runs than characters are left out; all 2000 cells of a 100 by 20 table keep theirs.
- `stoich.check.ts`: the reagent table's runs shown, kept and left out; .oct and CDXML; bold row names measured bold;
  Make static.
- `cdxml.check.ts`: both kinds of runs through CDXML, CDX and Octet's .cdx; the `<s>` faces of a Table cell.
- `edit.check.ts`: rows and columns added, deleted and cut keep each cell's runs with its text; Clear contents.
- `keys.check.ts`: the text keys in a cell.
- `cellstyles.check.ts`: how the boxes, the menu, the Actions panel and the Experiment details sheet are wired.
- `tablespeed.check.ts`: no slower than before.

## Known approximation

- The CDXML and CDX export lays a Table out with Arial's plain widths (`arial.ts` has no bold widths). A column with
  bold text, a bold run or the whole table bold, is a little narrower there than on the page when the table has no
  widths of its own, so its rules and left or right aligned text can sit slightly apart from the page. This was so
  for a bold Table before this change.

## Left for 1.2

- AI apps (MCP) read and write cell text only. Reporting and setting cell styles there is for the 1.2 session. A
  table given with fewer rows keeps the runs of the rows left, and a row of your own an AI app deletes takes its
  runs with it.
- An AI app setting Bold, Italic or Underline on a whole Table sets the table's flag only and leaves the cells' runs
  as they are, so a cell with runs keeps its own style. The Text menu takes that style off the runs (`even` in
  `runAction`); the MCP shape change should do the same in 1.2.
- release-1.2-mcp needs the same reader changes before 1.2 ships, or 1.2 drops 1.1.3's cell styles when it saves.
