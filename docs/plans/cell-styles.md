# Text styles in table cells

Branch `item/cell-styles-113`, from release-1.1.3 (e5af1273). For 1.1.3.

## What it does

- In a Table cell and in a reagent table's text cell, these keys work on the selected characters, as in a caption:
  - ⌘B Bold, ⌘I Italic, ⌘U Underline
  - ⌘− Subscript, ⌘= Superscript
  - ⌘T Plain, which takes all of these off
  - ⌘F Formula: the counts in the selection (or in all of the cell) become subscripts
- The Text menu's items do the same while a cell is open. In a Table cell, the Actions panel's B, I and U buttons do
  too, and the cell stays open.
- With nothing selected, the style goes on the next characters typed.
- Font, size and colour stay on the whole Table or the whole reagent table, as before.
- The reagent table's text cells are a row's name, Formula, MW, a compound's number or name, and the rows of your own.
  Amount cells (Mass, Moles, Equiv, Volume and the other amounts) stay plain: their text is written again from their
  number each time the table is drawn. The text keys do nothing there.
- In the reagent table, text typed over a value is bold, as before. ⌘B on some of its characters takes the bold off
  them.
- A cell shows its styles on the page, in every export and after a save. Formula counts are still lowered where a
  character has no script of its own, so K₂CO₃ stays K₂CO₃ with part of it bold.
- Tab, Return, Shift-Return, the arrow keys and Escape do what they did. Return never makes a new line in a cell. A
  line break pasted into a cell becomes a space.
- Bold, Italic, Underline or Plain on a whole Table goes on every character of its cells too, so no cell keeps that
  style of its own.
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
  buttons close the cell first, as a click elsewhere does, so a row added or deleted never meets an open cell.

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

### Files

- `VERSION` stays 1. Octet 1.1.2 and the parent of this branch open a new file and keep each cell's text: their
  `readTable` and `readGrid` leave out keys they do not know.
- .oct, CDXML (Octet's own data on the table group and the arrow) and CDX keep the runs. `readTableRuns` and
  `readCellRuns` check them: only text, bold, italic, underline and script; at most 400 cells and 2000 runs; each
  joining to its text. Runs on an amount cell, or on a row of your own that is gone, are left out. Anything else that
  is wrong is left out, and the drawing still opens.
- A Table cell is written to CDXML as `<s>` runs with the faces the page draws (bold 1, italic 2, underline 4,
  subscript 32, superscript 64), its formula counts lowered (`formulaOver`). A cell without runs gets its formula
  subscripts too, so the file shows K₂CO₃ as the page does.

### Edits

- `spliceTable`, `resizeTable`, `setTableCell` and `clearTable` move, cut and clear each cell's runs with its text.
- Clearing a reagent table cell, writing it, or deleting a row of your own clears its runs.
- Make static writes a styled cell's runs into its caption.

### Drawing and speed

- A cell with runs draws them as tspans (`richSpans`), its `<text>` without the table's bold, italic and underline.
- `tableLayout` passes a cell's runs to `measure`, so a bold run is measured bold. A reagent table's row names measure
  their runs too.
- A cell without runs takes the path it took before. `tablespeed.check.ts` times a 20 by 20 Table against the
  parent's `tableLayout`. Typing in a reagent table cell no longer draws the drawing again: the drawing follows only
  which cell is open.

## Checks

- `file.check.ts`: Table runs round trip; runs that do not join, unknown keys, a font, size or colour, and too many
  runs are left out.
- `stoich.check.ts`: the reagent table's runs shown, kept and left out; .oct and CDXML; bold row names measured bold;
  Make static.
- `cdxml.check.ts`: both kinds of runs through CDXML, CDX and Octet's .cdx; the `<s>` faces of a Table cell.
- `edit.check.ts`: rows and columns added, deleted and cut keep each cell's runs with its text; Clear contents.
- `keys.check.ts`: the text keys in a cell.
- `cellstyles.check.ts`: how the boxes, the menu, the Actions panel and the Experiment details sheet are wired.
- `tablespeed.check.ts`: no slower than before.

## Left for 1.2

- AI apps (MCP) read and write cell text only. Reporting and setting cell styles there is for the 1.2 session.
- release-1.2-mcp needs the same reader changes before 1.2 ships, or 1.2 drops 1.1.3's cell styles when it saves.
