# Notes on the drawing and on one object (issues 101 and 102)

Issue 101 asks for notes that belong to the drawing: a panel of notes that is not exported with the figure and stays in
the file sent to a co-author. Issue 102 asks for a note on one object, shown on demand, that stays with the object when
the drawing is rearranged. Both are for release 1.1.3 (Friday 20 November 2026). Branch `item/101-102-notes`, from
`release-1.2-mcp` b30f413, rebased on `release-1.1.3` f06d1b4 on 19 November (see "At the rebase onto 1.1.3").

Sam's conditions (9 November): the notes stay out of every export and picture, stay in the `.oct` file and survive
ChemDraw files.

Issue 68 (data fields on structures, branch `item/68-data-fields`, plan `docs/plans/issue-68-data-fields.md`) is
planned at the same time. It takes ChemDraw's annotations on a structure as data fields that are not shown, and it
maps ChemDraw's Annotate on a structure to such a field. So this plan does not add a second model for structures: a
structure's note is its issue 68 field named `Note`, not shown. See decision 2 and job N9.

## What Octet has now (b30f413)

- The drawing keeps keyword and content pairs, as ChemDraw keeps them: `Mol.annotations` and `Group.annotations`
  (`render.ts` 472, 480 to 482, 509). `.oct` reads and writes both (`file.ts` 85, 88, 384 to 389, `readAnnotations`
  406 to 411). CDXML writes the document's on the page and a group's in its group (`cdxml.ts` 144 to 147, 1143, 1151)
  and reads them back (1504, `keepNote` 1517 to 1523, 2648 to 2649). Limits: 1000 in a list, keyword 200 characters,
  content 10,000 (`cdxml.ts` 147).
- They hold Settings > Document > Properties (Title, Author, Keywords: `experiment.ts` 20 to 23,
  `SettingsWindow.tsx` 568 to 580), an experiment page's details (`experiment.ts` FIELDS), and a template pane's name
  (`ctp.ts`). Anything else from a ChemDraw file is kept and written back but never shown.
- Missing:
  - No way to read or write a note in the app or through the MCP (`mcp.ts` 510 takes title, author and keywords only).
  - No note on a structure, text, arrow, shape or catalytic cycle.
  - The CDXML reader counts a fragment's annotations as left out (`cdxml.ts` 1504), and drops those on atoms, bonds,
    text, arrows, graphics and curves with no count.
  - A group of one thing goes, and its annotations with it, with no count (`tidyGroups`, `edit.ts` 1055 to 1090).
  - ChemDraw writes a line break in an annotation as a raw line break, which the reader turns into a space
    (`cdxml.ts` 122).
  - Export and Copy put the page's annotations into the CDXML inside a PDF, PNG and EMF (`export.ts` 163,
    `Editor.tsx` 1482 and `copyOut` 9322), and into the Office object (`officeUpdate`, 1640).

So the data model and its limits exist for the drawing and for groups. The UI, the MCP, notes on every other object
and the export rule do not.

## What ChemDraw does

Sources: ChemDraw 26.1's help (Documents: annotating documents; Captions: annotations; Templates), its menus as
listed from the running app, its right-click menus, its CDX tag list (`cdxtags.ts`), what is new in 23.1 and 26.1,
and ChemDraw 22.2 opening and saving files that Octet wrote (17 November 2026). ChemDraw 26.1 itself could not be run
(no licence).

Every option ChemDraw gives:

| Where | Option |
| --- | --- |
| File > Document Annotations… | The Annotate dialog for the document |
| Object > Annotate… | The same dialog for the selected object |
| Right-click menu of every object (atom, atom label, bond, arrow, pen curve, drawing element, bracket, TLC plate, table, stoichiometry grid, molecule, group) | Annotate… |
| Right-click on the empty page | Document Annotations… |
| Annotate dialog | Keyword list (Name, Description, Type, Other Info, and the user's own keywords), Content for the keyword chosen, Add New Annotation (a new keyword with its content), Delete (the keyword chosen), Delete All (26.1, asks first), OK |
| Template panes | Document Annotations on a pane: its Name shows as the pane's tooltip |
| Paste (23.1) | The document's own annotations stay when something is pasted in |
| Preferences > Open/Save | Prompt for Comment: a comment asked for at each save (a separate feature) |

No annotation is drawn or printed. In CDXML and CDX an annotation is an `annotation` object (tag 0x802B) with
`Keyword` (0x1500) and `Content` (0x1501), both strings, inside the object it annotates. The document's are inside
the page.

ChemDraw 22.2, given a file from Octet's own CDXML writer with an annotation in each kind of object:

- It keeps, in CDXML and in CDX, the annotations in the page, a group, a fragment, an atom (`n`), a bond (`b`), a text
  (`t`), a rectangle, a bracket, a line, an arrow and a pen curve.
- It drops one on the root `CDXML` element.
- An arrow's annotation is written twice: in the `arrow` and in its older `graphic` (the one with `SupersededBy`).
- Each group's annotation is also written on the page, unless the page has one with that keyword already. The page's
  own is never replaced.
- A line break in Content is a raw line break in CDXML, and `\n` in CDX.
- It drops Octet's own `Octet` attributes, so a catalytic cycle comes back as plain arcs and text.
- It reads text such as "A" and "B" as atoms and takes them out of their group (seen in the test; not about notes).

## Decisions

1. **One model: ChemDraw's annotation.** A note is an annotation. The note a user types has the keyword `Note`.
   Annotations with other keywords (a ChemDraw file's Description, Name, Other Info) are notes too, shown under their
   keyword. Reason: CDXML and CDX keep them exactly, Octet 1.1.2 already keeps the drawing's and a group's, and
   ChemDraw lists `Note` as a keyword of the user's own.
2. **Where each note lives.**
   - The drawing: `Mol.annotations`.
   - A group: `Group.annotations`.
   - A text, an arrow (every kind, lines, pen curves and orbitals too), a shape (every kind) and a catalytic cycle:
     a new `notes` on `Caption`, `Arrow`, `Shape` and `Cycle`. These objects have ids and are copied whole by every
     edit, so a note on them goes wherever they go.
   - A structure: its issue 68 field named `Note`, not shown. Octet has no structure object (a structure is atoms
     joined by bonds), and issue 68 adds one list of data on structures, with the rules for a split, a join, a
     delete and a copy, and ChemDraw's fragment annotation as its form in CDXML. Two models on one CDXML element
     would fight. In issue 68's dialog the note is the row named Note.
3. **Notes go only into drawing files.** They are kept in `.oct`, CDXML and CDX (Save, Save As, Export to those
   three, Save Copy As, recovery), and in Octet's own clipboard data, so copy and paste between Octet windows keeps
   them. Nothing else gets them:
   - The pictures: PDF, PNG, EMF, SVG, EPS, TIFF, JPEG, GIF, BMP, from Export, Quick export, Print, the MCP and
     `--convert`. The CDXML inside a PDF, PNG and EMF has no notes either.
   - Everything else Copy puts on the clipboard: the picture, CDXML, CDX, MOL, SMILES and the Office object.

   Reason: issue 101's point is that the figure sent to a journal carries no note. Word and LibreOffice keep the
   CDXML inside a pasted picture, and anyone can read it from there. ChemDraw keeps annotations in its pictures and on
   its clipboard; Octet does not, on purpose. The cost: a note goes to ChemDraw in a file and not by copy and paste.
   Issue 68's other fields are data and still travel as its plan says. An SD file gets a structure's `Note` as a data
   item, as it gets every field (issue 68, J5), which is how ChemDraw maps a structure's annotations.
4. **No notes in a Word, PowerPoint, Excel or LibreOffice object.** In an object window, Annotate and the Notes panel
   are not offered, a drawing opened there has its notes taken out, and Update sends none. Reason: on the Mac and on
   Linux the object is the PDF itself, so a note typed there would be gone at the next edit.
5. **One Notes panel, with no modes.**
   - At the top, the drawing's note.
   - Under it, when something is selected, the selection's note.
   - Under that, a row for each other object that has a note: its name and the note's first line. A click selects the
     object and brings it into view.

   So every note can be found, an object's note shows only when asked for, and nothing is drawn on the canvas. The
   panel opens on the right above the Actions panel, moves by its header as Properties does, and keeps out of the
   bottom row, which the Spectrum and Properties use.
   - Changed in the build (17 November): when the room above the Actions panel is less than 240 px, the panel opens
     beside it, at the bottom. Reason: the Actions panel of an arrow or a shape fills most of a window 900 px high,
     and the panel had no room above it.
   - An object in a group selected whole keeps its row: the selection's field is the group's note, so the row is the
     only place that object's own note shows.
6. **Names.**
   - View > Show or Hide Notes.
   - Object > Annotate… (ChemDraw's name). It opens the panel with the cursor in the selection's note, or in the
     drawing's when nothing is selected.
   - Annotate… also in the Actions panel and the right-click menu of every object, and of the empty page.
   - No default key, as ChemDraw has none.
7. **Keywords not shown.** Title, Author, Keywords and the experiment details have their own places. GUID and
   ComponentID are ChemDraw's own data, which no one types. These are kept and written back, and the Notes panel
   does not list them. On a structure the panel shows the `Note` field only; the other fields are issue 68's.
8. **A field commits when it is left** (Tab, a click elsewhere, Escape, closing the panel, a save), as one undo
   step, to the objects it was opened for, and only when something was typed. So a selection change, an undo or an
   AI app's change while the field is open cannot put the note on the wrong object or undo the other change. Return
   starts a new line.
9. **Limits**, the same as now: 10,000 characters a note, 200 a keyword, 1000 annotations on one object or the
   drawing. New: 10,000 notes in a whole drawing (issue 68 has the same number for fields). Text is cleaned by issue
   68's rule 3 for values: line breaks kept as `\n` (a `\r` dropped), a tab becomes a space, other control characters
   and lone surrogates go, empty lines at the start and end go. An empty note is no note. Reason: Octet 1.1.2 calls a
   file damaged when a drawing's or group's annotation has a tab or a `\r` or is over these limits.
10. **Templates leave notes out.** Add to templates and a purpose template made from a drawing keep no notes, so a
    note on one drawing does not come back in every new one.
11. **ChemDraw's copies are not doubled.** Reading a file ChemDraw wrote, a page annotation that is the same keyword
    and content as one of the file's groups is ChemDraw's copy, and is left out.
12. **Order of work with issue 68.** Jobs N1 to N8 need nothing from issue 68. Job N9 (structures) is done once
    issue 68's model is in the branch the two meet in. Whichever of the two items lands second uses the first's
    cleaner and the line-break change in `parseXml` (both plans make it), so neither is written twice.

## Rules every part keeps

- Every opened, pasted or MCP-given note is hostile input: the limits and cleaning above, no `innerHTML`, no
  `eval`. The panel shows note text as plain text in a `textarea`.
- No new dependency. No new default shortcut.
- UI: `brand/` rules and tokens, British English and Simplified Technical English, no tips or helper text. The note
  field is `TextField` (`Fields.tsx`) given a `lines` option, not a new field. The panel's controls are
  `PanelControls`. The panel is in `scripts/look/sweep.js` and `panels.check.ts`. `npm run look` passes in both
  themes.
- Hot paths no slower than 1.1.2: rendering never reads notes; a drawing with no notes takes the same paths as
  now; `withoutNotes` gives back the same drawing when there are none.
- Every change is one undo step. Notes never change what is drawn.
- Small, separate hunks where issue 68 also changes a file (`cdxml.ts`, `file.ts`, `mcp.ts`, `Actions.tsx`,
  `main.rs`), so the merge is easy to read.

## Jobs

Each job is done when its lines hold and its checks pass.

### N1. The notes model (`annotate.ts`)

- `NOTE` (the keyword), the keywords not shown, `cleanNote`, and the limits.
- Targets from a selection: a picked text, arrow, shape or cycle is itself; a group selected whole is the group; a
  TLC spot or lane is its plate; a selected atom or bond is its structure (N9). A stoichiometry grid cell is no
  target.
- `notesOf(mol, target)`, `withNote(mol, targets, text)` (sets, changes or removes the `Note` of each target),
  `allNotes(mol)` (the drawing's and each object's, in reading order, for the panel and the MCP), `withoutNotes(mol)`.
- Done: `annotate.check.ts` covers each function, the limits, the cleaning, and that `withoutNotes` gives back the
  same object when there are no notes.

### N2. `.oct`

- `notes` on each text, arrow, shape and cycle in the JSON. A bad `notes` makes the file damaged, as a bad annotation
  does now. Over the 10,000-note limit: the first 10,000 are kept (changed in the build, 17 November: Paste and
  Option-drag can take a drawing over the limit, and a file Octet saved must open again). Two groups that cross and
  become one keep at most 1000 annotations.
- Done: `annotatefiles.check.ts` round-trips a drawing with a note on each kind of object and on the drawing. Octet
  1.1.2's own `parse` and `readOct` (from tag v1.1.2, run outside the repo) open the file without an error, with the
  same drawing, the drawing's `Note` and the groups' notes.

### N3. CDXML and CDX

- Writing: each object's notes are `annotation` elements after its other children: `t`, `arrow` (not its older
  `graphic`), `graphic` (the first of a bracket pair), `curve`, `tlcplate`, `embeddedobject`, Octet's own `group`
  for a table, gel, plasmid or membrane, and a cycle's first arc. One helper does it for every object.
- Reading back from the same places:
  - A cycle's note from its first arc, also where ChemDraw has made the arc a plain arrow.
  - An atom's or a bond's annotation is counted as left out ("Octet left out 2 annotations").
  - A group of one thing: its annotations are counted as left out.
  - A ChemDraw file: its copies of group annotations on the page are left out (decision 11).
  - The 10,000-note limit: the rest are counted as left out.
- A fragment's annotations are issue 68's (its J4). This item does not change that code.
- CDX goes through the same tree (`cdxToXml`, `xmlToCdx`).
- Built and tried (17 November, ChemDraw 22.2 by AppleScript): Octet's CDXML and CDX with a note on the drawing, a
  group, two texts, a reaction arrow, a line, a pen curve, an orbital, a cycle, a box, an oval, brackets, a TLC plate
  and a table. ChemDraw kept all 14 and saved them as CDXML and CDX; it did not copy the group's note to the page,
  which had a Note already. Octet reads 13 back on their objects (the cycle's on its first arc, now an arrow; the
  table's on its group). ChemDraw read the conditions text THF as an atom label and moved its note into the label:
  Octet counts that one as left out (N9 can put it on the structure).
- Done: cases in `annotatefiles.check.ts` for each object kind, in CDXML and CDX, and for each reading rule. ChemDraw
  22.2 opens Octet's CDXML and CDX with a note on each kind of object and saves both again, and Octet reads every note
  back on its object.

### N4. Notes stay out of pictures and other apps

- `exportRequest` takes notes out for every picture format (so Export, Quick export, the MCP and `--convert` too).
- `copyOut` makes every clipboard type from the drawing without notes, except Octet's own JSON.
- Object windows: the drawing is opened without notes, `officeUpdate` sends none, and the window offers no Annotate
  and no Notes panel. Native menu items go as Revert to Saved does.
- Add to templates and purpose templates take notes out.
- Print draws no notes (nothing to change; checked).
- Done: `annotatefiles.check.ts` checks that a PDF's, PNG's and EMF's CDXML has no note while a CDXML export has it;
  that the source runs `withoutNotes` in `exportRequest`, `copyOut`, `officeUpdate` and the template paths; and that
  the copied Octet JSON keeps the notes. In the app: copy an arrow with a note, paste in a second window (the note is
  there) and into TextEdit as PDF (`strings` on it finds no note).

### N5. Notes go with every edit

- Move, nudge, turn, flip, scale, align, distribute, Clean Up Reaction, Group, Option-drag, copy, cut, paste, undo
  and redo all keep notes on their objects.
- Edits that change an object's kind keep its note: a text read as a label (Make element) and an arrow's kind changed.
  Convert Name to Structure on a text puts the text's note on the structure made from it (with N9).
- Deleting an object deletes its note. Ungroup deletes the group's note. Undo brings both back.
- A chart, page spectrum or risk assessment drawn again (Edit data, a resize, Update substances) keeps its group's
  note.
- Paste never adds to the drawing's own notes (ChemDraw 23.1's rule).
- Done: `annotate.check.ts` runs each of these edit functions on a drawing with notes.

### N6. The Notes panel and its commands

- `Notes.tsx`: the panel of decision 5. The note field grows to 12 lines, then scrolls. Several objects selected
  show one field for all of them: their note when it is the same, else empty with "Mixed" in faint text. Typing sets
  it on each. Other keywords show as fields under their keyword, for one target only.
- Commands:
  - View > Show or Hide Notes (`notes`) and Object > Annotate… (`annotate`), in `main.rs` and in the command
    palette.
  - Annotate… in every Actions context but the stoichiometry grid: empty page, drawing, selection, text, arrow,
    shape, cycle, reaction, part, chart, TLC spot (and structure, atom and bond with N9). The right-click menu
    follows the same lists.
- The panel open or closed is remembered (`notesPanel` in settings). `panelSpans` counts it, so what comes into view
  is not under it.
- Done: `panels.check.ts` lists the panel; `ui.check.ts` passes; `npm run look` in WebKit, light and dark, with the
  panel in `sweep.js`. Keyboard: Tab reaches each field and row, Escape leaves a field for the canvas, rows are
  buttons with their names. Checked by hand in the browser at port 1471: each target kind, the Mixed field, the rows,
  an object window (no Annotate).

### N7. MCP

- `read`: `notes`, a list of `{ on, keyword?, text }`, only when there are notes. `on` is `drawing`, an object id
  (`t2`, `a5`, `b4`, `c1`, and `s3` with N9) or `group` with `ids`, its members. Each note's text is cut to 200
  characters with "…", unless `detail: 'full'` or the call names the object.
- `change` > `edit`: `note` (text up to 10,000; `''` takes it off) on each id. With `group: true` it goes on the
  smallest group that holds every id. A reagent table id does not take one (the result says so, as for any property
  that does not fit).
- `advanced` > `set_style`: `properties.note`, the drawing's note.
- `run_command`: `notes` and `annotate` (it opens the panel, so it counts as a box to type in).
- In an object window, a note is refused with a reason.
- Done: `annotatemcp.check.ts` (its own file, apart from the MCP session's): read, set, change, take off; a group; a
  reagent table; 10,001 characters refused; control characters cleaned; unknown ids; two calls make two undo steps;
  the 10,000-note limit.
- Built (17 November): a read that names an id also gives the note of each group that id is in, with the group's
  ids, as the panel shows the group's note beside the object's.

### N8. Speed

- Done: `perf.check.ts` gets budgets and growth checks for `allNotes`, `withoutNotes`, `serialize` with notes, and
  `parse` with notes. Medians of interleaved runs, the branch against v1.1.2 (each run alone), for `serialize`,
  `parse`, `toCdxml`, `fromCdxml`, extract and insert of 40 paclitaxels (from SMILES with Indigo, as
  `hardmolecules.check.ts` makes them) and a 500-residue peptide, with no notes: the same within noise. With a note on
  every object, the extra time is the notes' text only.

### N9. Structures, on issue 68's fields

Done once issue 68's model is in the branch the two items meet in.

- A selected atom, bond or structure is a structure target. Its note is its field named `Note` (not shown), read and
  written through issue 68's functions. Split, join, delete, copy and the MCP's replace follow issue 68's rules.
- The panel's structure section, the rows, Annotate… on structure, atom and bond, and the MCP's `note` on `s3` and
  on atom and bond ids use it.
- `withoutNotes` also takes out each structure's `Note` field that is not shown. A shown one is text on the page, so it
  stays, as any text does.
- Done: cases in `annotate.check.ts`, `annotatefiles.check.ts` and `annotatemcp.check.ts` for a structure, and
  issue 68's own checks still pass.

If issue 68 is not in the release, N9 waits with it, and Annotate is not offered on a structure.

Status (17 November): issue 68's model (`item/68-data-fields` c49d327) is not in this branch, so N9 waits. Annotate…
is not offered on a structure, an atom or a bond, and the MCP's edit says a structure takes no note. A text made into
an atom label (Make element) or converted to a structure loses its note until N9 (Undo brings it back).

## At the rebase onto 1.1.3 (19 November)

Release 1.1.3 has the AI apps switched off, so job N7 is built and checked but does nothing in 1.1.3. What changed
to fit the release:

- One `TextField` for Settings > Document > Properties > Comment (issue 100) and the notes. Both grow with their
  text up to their lines (the comment 4, a note 12), then scroll, and Escape leaves the field. Before, the comment
  showed 4 lines when empty and could be resized by hand.
- The comment is a document property (`PROPERTIES`), so it is not a note: the Notes panel does not list it, and a
  picture keeps it in its document information, as issue 100 says.
- Free symbols (issue 164) are shapes, so each takes a note. In CDXML a free symbol's note is in its `Symbol`
  graphic, and a δ+ or δ−'s in its `t`.
- An object window from LibreOffice (issue 48) is an object window: no Annotate and no Notes panel.
- What an object window keeps for its host while the user draws (`officePrime`, the first picture, and
  `officeKeep`, each change) is made from `withoutNotes`, as Update is. A note pasted into the window goes to none
  of them, on the Mac (the picture and its CDXML) or on Windows (the `.oct` too).
- Copy As CDXML Text is text for another app, so it has no notes.
- A chart's or page spectrum's text and lines keep their notes when it is drawn again (`pageplot.ts` `CAPTION_KEEP`
  and `ARROW_KEEP`): Edit data, a resize, a Jablonski diagram's level moved.
- `src/notes-stress.check.ts` runs the stress list (S1 to S30) and cases for the above (N1 to N10).
- Seen while checking, not this item's: Octet 1.1.2 calls the clipboard JSON of a drawing with a free symbol
  damaged (it has no free symbols). Its `.oct`, CDX and CDXML readers open such a file.

## Consistency pillar: the siblings

| Thing | Takes a note | Where it is kept | CDXML |
| --- | --- | --- | --- |
| The drawing | yes | `Mol.annotations` | in `page` |
| Structure (an atom or a bond selected is its structure) | yes (N9) | issue 68's field `Note`, not shown | in `fragment` (issue 68) |
| Text: free text, conditions, compound numbers, a cycle's labels, chart and spectrum text | yes | `Caption.notes` | in `t` |
| Arrows: every kind, lines, arcs, curved and fishhook arrows, orbitals, cuts, pen curves, membranes | yes | `Arrow.notes` | in `arrow`, `curve`, `graphic` or `group` |
| Shapes: box, rounded box, oval, highlight, brackets, parentheses, braces, TLC plate, gel, plasmid, table, picture, free symbols | yes | `Shape.notes` | in `graphic`, `tlcplate`, `embeddedobject`, `group` or `t` (δ+, δ−) |
| Catalytic cycle | yes | `Cycle.notes` | in its first arc |
| Group (also a page spectrum, chart or risk assessment) | yes | `Group.annotations` | in `group` |
| Stoichiometry grid | no (cut) | | |

Each behaviour below is tested on each thing that takes a note: Annotate from the Object menu, the right-click menu,
the Actions panel and the palette; ⌘A then Annotate ("12 objects"); copy and paste in one window and between two;
Option-drag; undo and redo; delete; turn, flip, scale, align and nudge; Group and Ungroup; `.oct`, CDXML and CDX
round trips; the MCP's read and edit; the panel in dark mode.

## Files

| Format | Notes | What Octet 1.1.2 does with it |
| --- | --- | --- |
| `.oct` (JSON part) | All of them | Opens it. Keeps the drawing's and groups' notes. Leaves out the other objects' notes with no word, and a save from 1.1.2 loses them. Structures: as issue 68's Files table says. |
| `.oct` (CDXML part), `.cdxml` | All, as `annotation` elements | Reads the JSON when the file is unchanged. A `.cdxml`: says it left out the structures' notes, and drops the others with no word. |
| `.cdx` | All, as annotation objects | As `.oct` (JSON in tag 0x4F43) |
| Octet's clipboard JSON | All | Pastes. Keeps the groups' notes only. |
| Clipboard CDXML, CDX, MOL, SMILES, picture, Office object | None | |
| PDF, PNG, EMF (with CDXML inside), SVG, EPS, TIFF, JPEG, GIF, BMP, print | None | |
| SDF | A structure's `Note`, as a data item (issue 68) | |
| MOL, RXN, RDF, SMILES, InChI, CML, HELM, FASTA, connection table, SLN, chemfig | None: these formats have no place for a note | |
| A template set saved for ChemDraw (`.ctp`) | A pane drawing's notes, as for CDXML | |
| Recovery copy | All (it is a `.oct`) | |

ChemDraw opening Octet's file: it shows each note in its Annotate dialogs (keyword `Note`), and keeps them when it
saves.

## Stress list

| # | Case | Expected |
| --- | --- | --- |
| 1 | A note of only spaces and new lines; a note cleared | No note. Clearing one takes it off, as one undo step. |
| 2 | 10,000 characters pasted; 1 MB pasted; the MCP sends 10,001 | 10,000 kept; the field takes the first 10,000; the MCP call is refused with the limit. |
| 3 | Tabs, `\r\n`, NUL, a lone surrogate, emoji, Arabic, `]]>`, `<annotation`, quotes and `&` | Cleaned and escaped, kept the same in every round trip, and Octet 1.1.2 still opens the file. |
| 4 | A ChemDraw file whose page has 1000 annotations, then a note typed | The note is not added. The notice: "This drawing has 1000 annotations, the most Octet keeps." |
| 5 | Add a note, change it, delete its object, then Undo three times and Redo three times | Each state exactly as it was. |
| 6 | Type in an arrow's note, then click another arrow | The text goes on the first arrow. The panel then shows the second. |
| 7 | The object is deleted (an undo or an AI app) while its note is being typed | Nothing typed goes on another object. No error. |
| 8 | An AI app changes a note while its field is open and nothing was typed; then the field is left | The AI app's note stays. |
| 9 | Copy and paste in one window, between two windows, and Cut then Paste | The notes come with the objects. |
| 10 | Copy into Word (Mac PDF, Windows EMF and object, Linux PNG and PDF), copy it back into Octet, and Edit Picture from Word | No note in the picture's data; none back in Octet; the object window offers no Annotate. |
| 11 | Paste from ChemDraw (CDX and CDXML) with annotations on a text, an arrow and a group | Each comes with its object. The page's annotations do not join this drawing's notes. |
| 12 | Save as `.oct`, CDXML and CDX; open each; ChemDraw 22.2 opens and saves each as CDXML and CDX; Octet opens the result | Every note on its object, no double from ChemDraw's group copy. |
| 13 | Octet 1.1.2 opens the 1.1.3 `.oct`, `.cdx` and `.cdxml` with a note on every kind | It opens each, with no "damaged". The drawing's note is kept; the rest as the Files table says. |
| 14 | A group whose members are deleted until one is left; Ungroup a group with a note | The group and its note go; Undo brings them back. |
| 15 | Turn, flip, scale, align and nudge text, arrows, shapes, cycles and groups with notes | The notes do not change. |
| 16 | A note on a catalytic cycle; the file goes through ChemDraw 22.2 | The cycle comes back as arcs; the note is on the first arc. |
| 17 | A TLC spot picked, then Annotate | The note goes on the plate. |
| 18 | 40 paclitaxels with a reaction arrow and conditions between each pair, a 10,000-character note on every arrow and text | Save, open, copy and export no slower than 1.1.2 apart from the notes' own text. The panel lists every row. Typing in a field does not draw the canvas again. |
| 19 | A 500-residue peptide with notes on its text and the drawing | Open, save and edit no slower than 1.1.2 (N8). |
| 20 | Dark mode; zoom at 10% and 1000%; export at 2400 dpi | The panel reads well in both themes. A row click brings the object into view at any zoom. No note in any picture. |
| 21 | Press Annotate many times fast; toggle the panel fast; hold a key in the field | No undo step until the field is left. No text lost. |
| 22 | MCP: `note` as a number, unknown ids, a reagent table id, `group: true` with ids from two groups, `set_style` with control characters | Refused with the reason, or "did not fit", or cleaned, as N7 says. |
| 23 | Two AI apps set notes on one object in turn | The last one stays; each call is one undo step; `read` gives the last. |
| 24 | A hostile CDXML: 100,000 annotations, an annotation in an annotation, a keyword of 1 MB, a 20 MB Content | The parser's limits hold; the rest are counted as left out; no hang. |
| 25 | An experiment page with a note; Settings > Document > Properties changed | The details and the note stay apart; the note is never shown as a detail. |
| 26 | A ChemDraw clip-art group with GUID and Name annotations, placed from the template library | GUID kept and not shown; Name shown under its keyword. |
| 27 | Add to templates from objects with notes; place the template | The placed copy has no note. |
| 28 | Print with the Notes panel open | The printout has no panel and no note. |
| 29 | ⌘A then Annotate on a drawing of 500 objects; type one note | One undo step puts it on all 500. The 10,000-note limit is checked first. |
| 30 | With N9: join two structures with notes, break the bond again, delete half, replace through the MCP | As issue 68's S12, S13, S14 and S28: both notes kept on a join, both pieces keep them on a split, the note goes only with the last atom, a replace keeps it. |
| 31 | Type a note and, with the cursor still in its field, press Ctrl+S and then Ctrl+W (Windows and Linux), or choose Quit (every platform) | Save writes the note. Close and Quit ask to save it: the window counts as edited from the first key typed. |

## Acceptance

| Job or case | Check |
| --- | --- |
| N1, cases 1, 3, 15, 17 | `annotate.check.ts` |
| N2, cases 3, 13 | `annotatefiles.check.ts`; Octet 1.1.2's reader run on the files (a scratch run from tag v1.1.2) |
| N3, cases 11, 12, 16, 24 | `annotatefiles.check.ts`; ChemDraw 22.2 open and save of Octet's files, read back |
| N4, cases 10, 27, 28 | `annotatefiles.check.ts` (exported data, source checks); copy into TextEdit and into a second window in the dev app |
| N5, cases 5, 9, 14 | `annotate.check.ts` |
| N6, cases 6, 7, 8, 20, 21, 25, 26, 29, 31 | `panels.check.ts`, `ui.check.ts`, `npm run look` (light and dark), and by hand at port 1471 |
| N7, cases 2, 22, 23 | `annotatemcp.check.ts` |
| N8, cases 18, 19 | `perf.check.ts`; interleaved medians against v1.1.2 |
| N9, case 30 | The structure cases in the three check files, after issue 68's model is in |
| Case 4 | `annotate.check.ts` (limit) and by hand (the notice) |
| Every stress case, and N1 to N10 | `notes-stress.check.ts` (with `OCTET_112` for 1.1.2's readers, `OCTET_BASE` to time against the release without this item) |
| Everything | Full `npm test`; `cargo test` in `src-tauri` (the menu items) |

## Not in this plan

- **A note on a stoichiometry grid.** Octet writes its table as its own record, not as ChemDraw's grid object, so a
  note there could not reach ChemDraw. The table's arrow takes a note.
- **A note on one atom or one bond.** Octet puts the note on the atom's structure. A ChemDraw file's annotation on an
  atom or a bond is counted as left out.
- **A structure's note before issue 68's model is in** (decision 12, job N9).
- **Canvas markers on objects with notes.** The panel's rows find every note. Markers can come later if Sam wants
  them.
- **Notes in a Word, PowerPoint, Excel or LibreOffice object** (decision 4).
- **The MCP's `draw` taking a note on each compound.** `edit` does it in a second call.
- **Notes on the Home page or in a search.**

Missing against ChemDraw, for Sam:

- A new keyword of the user's own (ChemDraw's Add New Annotation). Octet's notes use `Note`; other keywords come only
  from files, where Octet shows and changes them. On a structure, issue 68's dialog takes any name.
- ChemDraw 26.1's Delete All, which clears every annotation at once. In Octet each field is cleared.
- A note going to ChemDraw by copy and paste (decision 3). It goes in a file.
- ChemDraw's Prompt for Comment at each save, and Document Properties (typed rows): separate features, not notes.
