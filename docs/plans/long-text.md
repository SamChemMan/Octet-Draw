# Long text and the other limits of Octet's own readers

Branch `item/long-text`, from release-1.1.3 (f2c6b9d). For 1.1.3 (Friday 20 November).

## The fault

A caption of more than 2,000 characters makes the .oct's JSON copy fail its check (`file.ts` MAX_TEXT). Octet then
opens the file from its CDXML copy with `foreign` set: the text is cut to 2,000 characters, nothing says so, and the
drawing can lose its own style (Keep ChemDraw styles off) and the other things only the JSON copy holds. A recovery
copy is the JSON alone, so a drawing with such a caption does not come back after a crash. A user template with one
is dropped at the next start. The editor lets the user type or paste text of any length.

The same kind of fault is in other limits. Each one is in the table below.

## Rules

1. Every limit a reader has is a limit the editor keeps too. What the editor makes, its own readers read whole.
2. Text that is typed or pasted past a limit is cut where it is made, and Octet says so with one notice:
   "A text holds up to 20,000 characters. Octet left out the rest." (`notice.ts` `cutNotice`, with the thing and the
   number). Dialog and panel fields keep their `maxLength`: the field stops at the limit as the user types.
3. A limit is raised only with a reason, and a hostile file at the new limit must still read fast and in bounded
   memory (stress list, H1 to H6).
4. When a file's JSON copy is there and matches its CDXML but cannot be read, Octet opens the CDXML and says so:
   "Octet cannot read its own copy of this drawing. It opened the ChemDraw copy, without Octet's own extras."
   Save then asks before it writes over the file (as for a file with things Octet left out). The style the CDXML
   holds is Octet's, so it is kept. A file another program changed keeps its message as it is.

## Limits

R: a reader that refuses or cuts. E: how the editor could make more. "Kept" means the limit stays and the editor is
made to keep it.

| What | Limit | Readers (R) | Editor (E) before this item | Change |
| --- | --- | --- | --- | --- |
| Caption text | 2,000 units | file.ts refuses the file; cdxml.ts cuts with no notice | Caption box: typing, paste (no cap); names; an experiment's procedure (markup takes 20,000) | Raised to 20,000 (`richtext.ts` MAX_TEXT) in both. The caption box cuts at 20,000 with the notice. cdxml.ts counts what it cuts: "Octet left out 1,234 characters." |
| Caption runs | 2,000 | file.ts refuses | A long styled text | Raised to MAX_TEXT (a run has at least one character) |
| Label runs | 2,000 | file.ts refuses | Not past 40 characters | Raised with the caption's (one reader) |
| Risk assessment texts | 2,000 units, 200 runs | riskassess.ts drops the whole record, no notice | A risk text typed on the page is a caption | Raised to MAX_TEXT units and runs |
| Reagent table column key | 80 characters, one line | stoich.ts refuses the grid, so file.ts refuses the file | A reactant written as text is keyed by all its text; a long name or two lines, then an amount typed | Raised to MAX_TEXT + 8 characters, line breaks allowed |
| Atom label | 40 characters, no < or > | file.ts refuses; cdxml.ts cuts, counts "label text" | Label box and Make Element (no cap); the Label fields took < and > | Kept. `setLabel` cuts to 40 and drops < and >; the label box cuts a paste at 40; both say so. The Label fields drop < and >. |
| Table cell | 500 characters, no tab | file.ts and cdxml.ts refuse | Cell box (no cap); a row pasted from a spreadsheet keeps its tabs | Kept. The cell box turns tabs into spaces and cuts at 500 with the notice. |
| Reagent table text cell | 200 (`oneLine`) | stoich.ts cuts | `writeGridCell` cut with no notice | Kept, with the notice |
| Experiment detail on the page | 200 (`oneLine`) | experiment.ts cuts the detail | A detail's text typed on the page was cut with no notice | Kept: the text is cut to 200 with the notice |
| Chart label | 80 | charts.ts drops the chart record | Text typed over a chart's label, and names in the chart dialog, were cut with no notice | Kept: cut with the notice on the page; the dialog's name cells take 80 |
| Kept group (Contract Label) | 256 atoms, 512 bonds | file.ts refuses; cdxml.ts drops the group | Contract Label took any group | Kept: Contract Label says "Select a group of 256 atoms or fewer." |
| Cycle steps | 64 | file.ts refuses | A click on an arc adds a step, with no cap | Kept: `resplice` adds none past 64; the click says "A cycle holds up to 64 steps." |
| Side arrow's structure | 512 atoms | cycle.ts refuses the cycle, so the file | A larger structure at a side arrow | Raised to 100,000 (every index is checked; reading stays linear) |
| Pen curve | 1,000 points | file.ts refuses; cdxml.ts drops | Each click adds a point | Kept: the Pen stops at 1,000 with "A curve holds up to 1,000 points." |
| Atoms, bonds | 100,000, 400,000 | file.ts, cdxml.ts refuse | Paste, duplicate | Kept: an edit past either is not made, with "A drawing holds up to 100,000 atoms." (`file.ts` overLimit, in the editor's `set`) |
| Texts, arrows, shapes, cycles, ring fills, groups | 10,000 each | file.ts refuses; cdxml.ts at 40,000 in all | Paste, duplicate | Kept, as atoms |
| Experiment page text kept for new pages | 200,000 characters | docstyle.ts drops it at the next start | Use for New Documents on a long page | Kept: Octet says it cannot keep this page's text, and keeps the style |
| Notes | 10,000 a note, 200 a keyword, 1,000 an object, 10,000 a drawing | annotate.ts | Fields take 10,000; `withNote` and `capNotes` | None needed |
| Document comment | 10,000 | experiment.ts | Field takes 10,000 | None needed |
| Details (sheet) | 200 | experiment.ts | The sheet refuses more | None needed |
| Lane, plasmid, region, marker names; polymer label | 40, 80, 80, 80, 20 | cdxml.ts, query.ts | Fields take as many | None needed |
| Table rows, columns; ring fill ring | 100, 20; 40 atoms | file.ts | `resizeTable` caps; fills go in rings of 12 or fewer | None needed |
| Multiplet name, spectrum title, solvent | 12 letters, 200, 40 | measured.ts | Set from files, cut at import | None needed |
| Grids, spectra, notes on one object | 100, 16, 1,000 | file.ts | `newGrids`, one spectrum a key, `withNote` | None needed |
| CDX text styles | 16-bit byte offsets: 65,535 bytes a text | cdx.ts | – | MAX_TEXT units are at most 60,000 bytes of UTF-8. The writer no longer spreads a text's bytes into a call (an engine's argument limit). |
| MOL, SDF, SMILES Octet writes, read back | 1,000 atoms, 300,000 characters, 20,000 of SMILES; an alias 40 characters, no < or > | chem.ts (Indigo runs on the main thread), with the reason ("It has more than 1,000 atoms.") | Export of a drawing larger than that | Kept: a speed limit with its reason, not this item's. An alias is a label (40, as Octet writes it). |
| File, clipboard type | 64 MB | Rust | – | None |
| Nesting | CDXML and CDX 64 deep; JSON: only the shapes Octet knows are walked | cdxml.ts, cdx.ts, file.ts | Octet writes under 10 deep | None |

## Why 20,000

- A procedure with its characterisation data is 1,000 to 5,000 characters a compound. 20,000 is several compounds,
  and Apply Markup already works on up to 20,000 (`experiment.ts` MAX_MARKUP). A formatted paste takes 20,000 too
  (`richpaste.ts`).
- CDX keeps a text's style runs at 16-bit byte offsets. 20,000 UTF-16 units are at most 60,000 bytes of UTF-8, so
  every text Octet keeps has its styles in the right place in a .cdx file and on the clipboard.
- Each check on a text is one pass over it, and a file is at most 64 MB, so a hostile file reads in time and memory
  that grow with its size, as before (H1 to H6).

## Old files

Files from 1.1.2 and before open as they did. One whose JSON copy has a caption of 2,001 to 20,000 characters now
opens from the JSON copy, whole. One with a longer caption opens from its CDXML with the new notice, the text cut to
20,000 and counted. Nothing in the file format changes.

## Cases (`src/longtext-stress.check.ts`)

Each limit at, just over and far over, in each kind of text: captions, a shown detail, notes, reagent cells and keys,
chart labels, the comment, risk texts, names (a live name of 20,000 characters, a column keyed by a long name).

- L1 to L6: serialize then parse, writeOct then readOct, writeCdx then readCdx, toCdxml then fromCdxml, the recovery
  copy (serialize then readOct), the clipboard's .oct, at each limit: the drawing comes back the same.
- L7: just over: the JSON reader refuses; the .oct opens from its CDXML with `fallback` and the notice's words.
- L8: the editor's cuts: `cutRuns`, `setLabel`, `resplice`, `overLimit`, and the editor's use of them (source).
- L9: a file another program changed still opens with `foreign` and no fallback.
- L10: 1.1.2 files: a .oct with a 2,500-character caption opens whole from JSON; one with 25,000 from CDXML, cut and
  counted.

## Stress list

- H1: a .oct JSON of 60 MB: 3,000 captions of 20,000 characters (the limit, at the file size limit): read in time
  linear in size, heap growth bounded.
- H2: a CDXML with one text of 60 million characters: cut to 20,000, counted, fast.
- H3: 10,001 captions; 100,001 atoms: refused fast.
- H4: JSON nested 100,000 deep; CDXML nested 10,000 deep: refused fast, no stack overflow.
- H5: a reagent table with 60 columns keyed by 20,000-character names and 400 cells: read fast.
- H6: one caption of 20,000 characters laid out and drawn: fast.
- S1: speed on normal files (the examples): parse, serialize, readOct, writeOct and fromCdxml against release-1.1.3,
  interleaved runs (with OCTET_BASE set to its src folder).

Not checked here: ChemDraw's own limit on a text's length (no ChemDraw run for this item), and the editor's speed
while typing in a text of 20,000 characters (H6 times the layout alone: under 0.1 s in Node, with Arial's widths).
