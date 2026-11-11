# Charts and Colour by Element

From Stefan's list of 11 November 2026. Branch `item/charts`, from the 1.1.2 tip. Sam's decision of 11 November: it
ships in 1.2 (Friday 20 November), not in 1.1.2. It joins `release-1.2-mcp` after 1.1.2 has been merged there, and its
MCP tools are written there.

Reactio Draw is AGPL-3.0. None of its code, text or pictures is in Octet.

ChemDraw has no chart objects. A chart drawn in ChemDraw is lines and text, so that is what Octet writes to CDXML.
ChemDraw 22.2 opened a CDXML file from Octet with one energy diagram and one sensitivity screen on 11 November 2026
and showed the same picture: colours, bold levels, dashed and filled curves, italic and subscript text. A file saved by
ChemDraw and read back into Octet was not tried.

## The design

Sam's rule: simple to use, easy to look at, easy to digest, and pro for those who dig. Less writing than any rival.

- **Data in a sheet.** Add Chart opens one grid and nothing else: a title, the grid, Cancel and Add.
- **Look in the Actions panel.** A picked chart shows its options there, as a table or a TLC plate does.
- **Text on the page.** A number or a name typed over the chart's own is the chart's data.

No drag sets a value. The numbers on these charts go into papers, and a drag is not exact.

### The simple path (three steps)

1. Object > Add Chart > Energy Diagram… (or the command palette). The sheet names R, TS and P and has no numbers.
   The cursor is in R's value.
2. Type the energies, or paste a table from Excel.
3. Return. The chart lands on the page, clear of what is there, picked.

A sensitivity screen is the same: the paper's ten conditions are named, their values empty. Add is on from three
values (an energy diagram: one).

### Where the deeper options are

| Option | Where |
| --- | --- |
| More states, paths or conditions | The sheet. Type in the empty row or column, and a new one appears. |
| A second value, a level's own name, a screen's dashed series | A cell: `24.3 (22.0)`, `18.6 TS1′`, `−12 (−30)`. The empty row shows one faint example. |
| Remove a state, a path or a condition | The sheet. Clear its values. |
| Change a value, a name, the axis title | The page. Type over it. A value's level moves and the axis follows. Text that is no number stays a label. |
| Joins: lines, dashed lines, curves | Actions panel: three chips, each drawn as its join. |
| A path's colour | Actions panel, Colour: a colour menu for each path, under the path's name. |
| Hide or show the axis, the key, the zones | Actions panel: a small button each. Show also brings back one deleted on the page. |
| A screen's scale | Actions panel: Edge, Centre, Step. A scale that would not hold every value is not taken. |
| The sheet again | Edit data… (first row of the Actions panel), or Return on a picked chart. |
| Restyle or move one part, resize | The page, as for any object. |

### Every word the charts add to the UI

- Menu: Add Chart, Energy Diagram…, Sensitivity Screen…, Edit Data…. Palette: Energy diagram…, Sensitivity screen…,
  Edit chart data….
- Sheet: Energy diagram, Sensitivity screen, Cancel, Add, Apply. Faint: Path 1, Name, Condition, %, and the examples
  `18.6 (15.2) TS′` and `−12 (−30)`.
- Actions panel: Edit data…, Chart (the set's title), Edge, Centre, Step.
- Tooltips: Lines, Dashed lines, Curves, Hide the axis, Show the axis, Hide the key, Show the key, Hide the zones,
  Show the zones.
- Notices: Select a chart first. Octet cannot edit this chart's data, because it was rotated, flipped or taken apart.
  The scale must hold every value.

## Jobs

Each job is done when its line holds and its check passes.

### C1. A chart is a group with a record

- A chart on the page is one group of ordinary lines, curves and captions, as a page spectrum is (`pageplot.ts`).
  The group keeps what the chart shows (its record). Each part keeps its role.
- Each part picks, colours, moves, deletes, saves and exports as any line or caption. ⌘A, Colour, Group, Scale and
  the draw order treat it as they treat a page spectrum.
- `.oct` and CDXML keep the record. The picture is in the CDXML itself, so ChemDraw and Octet 1.1.1 show it as a
  plain group.
- A resize with the handles draws the chart again at the new frame. Edit data and the panel's options draw it again
  from the new record. In both, a part keeps its colour, font, style, how far it was moved, and text the user
  changed. A part the user deleted stays deleted.
- A chart's text is text only: a state named P is not phosphorus in the drawing's formula.
- A new chart lands clear of what is on the page, its text counted as wide as it is drawn.
- A record from a file is checked as hostile input: sizes, counts, lengths and numbers have limits. A bad record is
  dropped and the group stays a plain group.
- Checks: `charts.check.ts`, `chartexport.check.ts` (CDXML, CDX, `.oct`, copy and paste), `chartspeed.check.ts`.

### C2. Energy diagram

- Drawn: an axis with ticks and its title, a bold level for each value, joins between a path's levels, each value
  over its level, each name under it, and a key when there are two paths or more.
- Where the levels of a state are close, their text is placed for the whole state at once: all over the top level,
  all under the bottom one, so no text lies on a level or on other text. Paths at one energy share one text.
- A level is at least as wide as its text. The axis title stays clear of the text it reaches.
- Each path has a colour. One path alone is in the document's ink.
- Values show the places they were typed with, six at most.
- Not in this version: text beside a level (four close levels still need a label moved by hand), a break in the
  scale, opening an .xlsx or CSV file, moving a state up or down in the sheet.

### C3. Sensitivity screen

- The radar diagram of Glorius and co-workers (L. Pitzer, F. Schäfers, F. Glorius, Angew. Chem. Int. Ed. 2019, 58,
  8572): an axis for each condition, the deviation of the yield from the standard conditions on each.
- As the paper draws it: the ten conditions in its order (High *c*, Low *c*, H₂O, Low O₂, High O₂, Low *T*, High *T*,
  Low *I*, High *I*, Big Scale), from −100% at the edge to +50% at the centre in steps of 25, the ring values left of
  the top axis, and the zones in bands: two reds, a pale band from −50% to 0, green, then teal.
- Reaction B of the paper's supporting information (Table S7) drawn in Octet has the same shape as its diagram.
- A condition with no value has no axis, as the paper leaves out a condition that was not run.
- The scale grows by whole steps to hold every value. A value is never drawn on the edge as less than it is.
- The screen stays round under a resize. With a small step, a ring value shows only where it has room. Many
  conditions: a name that would lie on another steps out along its spoke.
- `*c*` in a name is italic, as in text typed on an experiment page.

### C4. Jablonski diagram: not built here

`item/photochem` (issue 43) adds a Jablonski diagram and its transitions to the template library. It is not merged
into 1.1.2 yet. A diagram with levels at typed energies and arrows that follow them can be a third chart kind later.

### H1. Colour by Element is a toggle

- Colour > By Element colours the heteroatoms of the selection, or of the whole drawing. When every one of them has
  its element's colour already, the same command puts them back in the document's ink.
- When one of them has no colour or another colour, the command colours them all, as before. A carbon coloured by
  hand keeps its colour either way.
- Check: in `colours.check.ts`.

### R1. Reagent table: another session has it

The session that built 1.1.2 took it on 11 November, in the branch `item/reagent-table`. Nothing of it is in this
branch.

### B1. Browser version: not built

Issue 92 and the roadmap's "Later: the editor as a web component". Sam decides when.

## Decisions

- One record type for every page figure: `Plot` is a spectrum's record or a chart's. `replot`, `reframe` and
  `rescale` work on both.
- A figure's lines can be bold or dashed, its curves can be closed and can go behind the lines, and its text can be
  small, in runs, or text only. Spectra set none of these, so they draw as before.
- Text Octet wrote that the user has not changed takes the new record's text. Text the user changed stays.
- A part's role is what it shows and where: `level:path:state`, `state:3`, `tick:2`. A state or a path taken out in
  the sheet takes its parts with it, and the parts after it keep their changes.
- The MCP's tools for charts go in the 1.2 branch (`release-1.2-mcp`), not here.

### Closed on 11 November 2026 by how the rest of Octet works

Sam asked for these three to be settled from what the app already does.

- **Every part of a chart moves alone, as a page spectrum's parts do.** A click picks the whole chart and a drag
  moves it whole. A double-click picks one part, and a drag or a nudge then moves that part. A redraw keeps the
  part's offset. Octet has two kinds of data-bound thing: one object drawn from its data (TLC plate, table,
  stoichiometry grid, catalytic cycle), and a group of ordinary objects with a record (the page spectrum). A chart is
  the second kind, and nothing in a spectrum is held in place. A hold on a chart's lines would be the first held part
  in any group. Pick as one (Group) holds a chart together for a user who wants that.
- **Return in the sheet does the action, from any cell.** Every dialog does (`brand/CLAUDE.md`, `dialog.check.ts`),
  and so do the dialogs with rows of fields (Experiment details, R-Logic, Atom Properties). Up and Down move between
  rows, Tab and Shift+Tab along them. Paste then Return adds the chart from wherever the paste left the cursor.
- **The sheet has no key to move a state.** Every reorder in Octet is a drag, with Move up and Move down as named
  menu items where there is a second way. No feature is reached only by a key that is named nowhere, and ⌥↑ and ⌥↓
  already turn the selection. A state moves by pasting or retyping, as a row of a page table does. If rows are to
  move, it is a drag plus named commands, for page tables too, with its own plan.

## Reviews, 11 November 2026

Two rounds. Each time reviewers checked the change (correctness, hostile files, regressions, the figures as drawn,
Octet's UI rules) and a second agent tried to refute each finding. Round one: 29 confirmed, 2 refuted. Round two, on
the fixed code: 18 confirmed, 2 refuted. All confirmed ones are fixed, each with a case in a check file, except:

- A ring's value sits by the top axis where the ring's edge slopes through it, as in the paper's own diagrams.
- Octet's CDXML reader gives no line, curve or caption a draw order (older than this branch).
- The pictures (SVG, PDF, PNG, EMF) are made from the canvas and in Rust, so no check under Node covers them. They
  were looked at in the app.

Timing (M1 Pro, median): a resize of a page spectrum is no slower than 1.1.2 (0.93 ms against 0.97 ms predicted, 3.3
ms against 3.4 ms measured). A resize or Edit data of a default chart is under 0.2 ms, and of the largest a file can
hold (60 states by 12 paths) about 25 ms.
