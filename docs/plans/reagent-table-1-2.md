# Reagent table fixes for 1.2

Sam, 13 Nov 2026, testing the 1.2 beta's experiment page. Status: approved by Sam 13 Nov; built on item/table-1.2.

## What ChemDraw does (help 26.1 "Stoichiometry Grid", CDX notes)

- Cells are typed in with the Text tool: click the cell, type. Typed values are bold, worked-out values plain.
- Hide Row, Hide Column, Show All, Set Limiting, Colour from the context menu. No way to add a row.
- The grid is its own object with its own position (`stoichiometrygrid` has `p`). Each column keeps the id of the
  structure it reads (`ComponentReferenceID`).
- Still to check by running ChemDraw 22.2: whether the grid follows the reaction when the reaction moves, and whether
  a moved grid snaps.

Octet keeps all of that and goes further where Sam asked.

## Jobs

Each job has its acceptance test.

1. **Snap when moved.** Dragging the table snaps its edges and centre to other objects (structures, text, arrows,
   shapes, the Reaction scheme box and page margins) with the same guides as moving anything else, and to the grid
   when the grid is on. Test: drag the table near the left edge of the reaction's first structure; it locks to it and
   the guide shows.
2. **Text tool types in cells.** With the Text tool, a click on a cell opens it for typing, as in ChemDraw. Every
   cell, including Formula, MW and the name cells: typing over a worked-out value replaces it with what you typed
   (bold, as typed values are). Clearing it brings the worked-out value back. Test: Text tool, click MW, type 151.2,
   Return; the cell shows 151.2 in bold; Delete brings back the worked-out MW.
3. **Add and remove rows.** Context menu: Add Row Above, Add Row Below. A new row has a name you type and a value you
   type in each column (plain text, no maths). Any row, the built-in ones too, can be deleted (Delete on its name, or
   Delete Row in the menu). Show All brings built-in rows back; a deleted row of your own is gone (⌘Z undoes).
   Test: add a row "Supplier", type "Sigma" under one column, save, reopen; it is still there. Delete it; ⌘Z brings it.
4. **Compound number on top.** When a compound in the reaction has a number, the table's first row is the number
   (bold, as the number is drawn), with Formula under it. Without numbers the row is not shown. Test: number the
   reaction (Autonumber); the top row shows 1, 2, 3 above the formulas.
5. **Parts delete one by one.** Each part of the table picks and deletes on its own, like other objects: a cell (its
   text goes, the cell stays blank), a row name (the row goes), a column heading (the column goes), a line (that line
   goes). Delete with the whole table picked removes the table. Test: pick a cell, Delete, it is blank; pick a
   horizontal line, Delete, it is gone; save and reopen keeps both.
6. **Moved means free.** Once you move the table by hand, it stays where you put it on the page: moving or changing
   the reaction no longer moves it. Context menu: Attach to Reaction puts it back under the reaction, and it follows
   the reaction again. Test: move the table, move the reaction; the table stays. Attach to Reaction; it goes back
   under the reaction.
7. **MCP parity.** Every new action (type in any cell, add and delete rows, delete a cell or line, attach) is
   reachable through the MCP (`run_command` grid.* actions and `fill_experiment`).
8. **Files.** `.oct` and CDXML keep everything above. ChemDraw reads the table's built-in rows as before; rows of your
   own and deleted lines are Octet's own data (they round-trip in Octet, ChemDraw ignores them).

## Rules every part keeps

- The maths keeps working whatever is changed by hand. A value typed over a worked-out one is used in the maths when
  it is a number in that row's unit (an MW typed in is used for moles).
- One undo step for each change.
- Same component for every menu (src/Menu.tsx).
- No slower than 1.1.2 when the table redraws (timing check on a 6-column table).

## Decisions

- Item 5 (Sam, 13 Nov): the table stays live for every delete it can store: a row, a column, a single cell's text
  (the cell shows blank, the maths still uses its value), a single line. The `Grid` record keeps these as lists
  (hidden rows, columns, cells and lines), so they save and undo like any change. Show All brings them back.
- Make Static is a command in the table's menu. It turns the table into ordinary text boxes and lines, each its own
  object (no group, so each one picks and deletes alone).
  An edit only free objects allow (dragging one cell's text out of the table, rotating a part) asks first: "The
  table becomes plain text and lines. Its amounts will no longer work themselves out." Buttons: Make Static, Cancel.
  ⌘Z brings the live table back.
- Item 6 (Sam, 13 Nov): position only. A moved table stays put and its values stay live. Attach to Reaction puts it
  back under the reaction.

## Files

src/gridview.ts (layout, number row, own rows, lines), src/render.ts (`Grid` fields), src/Editor.tsx (drag with
snapMove, Text tool clicks, picking parts, menu actions), src/stoich.ts (readGrid limits for new fields), src/cdxml.ts
(own data), src/mcp.ts, checks in src/gridview.check.ts and src/stoich.check.ts.

## Follow-up (Sam, 16 Nov 2026)

- Amounts show one decimal from 10 up (146.5 mg, not 147 mg), two under 10.
- Every edit carries through: a formula typed over gives the MW and the amounts; a product's Expected moles is the
  amount wanted (kept as its Expected mass); its Yield gives its Measured mass; a compound number typed in the Compound
  row (or as a name, as rows) is the number in the drawing too. MCP: fill_experiment takes a product's yield and moles.
- Not checked against ChemDraw: how many decimals its grid shows.
