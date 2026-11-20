# Long text and the other limits of Octet's own readers

Branch `item/long-text`, from release-1.1.3 (f2c6b9d); `item/long-on-113` has it merged with release-1.1.3 at 99c9586
(data fields, measurements, notes, nicknames, the colour menu). For 1.1.3 (Friday 20 November).

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
   number). In a box (a caption, a label, a table cell) only what went in is cut (`richtext.ts` `typedIn`): the text
   around it stays, and the caret goes after what went in. Dialog and panel fields keep their `maxLength`: the field
   stops at the limit as the user types.
3. A limit is raised only with a reason, and a hostile file at the new limit must still read fast and in bounded
   memory (stress list, H1 to H6).
4. When a file's JSON copy is there and matches its CDXML but cannot be read, Octet opens the CDXML and says so:
   "Octet cannot read its own copy of this drawing. It opened the ChemDraw copy, without Octet's own extras."
   Save then asks before it writes over the file (as for a file with things Octet left out): "Octet cannot read its
   own copy of this drawing. Replace removes Octet's own extras from this file. Save As keeps the original file." A
   drawing added from such a file (Insert, a drop, Paste) says "It added the ChemDraw copy" (`oct.ts` `lostNotice`,
   `replaceNote`). The style the CDXML holds is Octet's, so it is kept. A file another program changed keeps its
   message as it is.

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
| Chart label | 80 | charts.ts drops the chart record | Text typed over a chart's label, and names in the chart dialog, were cut with no notice | Kept: cut with the notice on the page. In the chart dialog (`Cells.tsx` `limit`, by column and row) the paths' and states' names and the conditions take 80, and a value's own name the chart cuts is said on Apply (`charts.ts` `longNames`) |
| Data field shown (release-1.1.3, issue 68) | 2,000 (`datafields.ts` MAX_SHOWN, the Attached data dialog's Show) | datafields.ts readData left the field out and counted it as a data field; cdxml.ts and fromProperties read it whole (20,000), so it opened again with "Octet left out 1 data field." and the dialog's Save took it off the page | Its text on the page is a caption (20,000) | Kept: the caption box holds 2,000 there, and a text typed past it is cut with "A shown value holds up to 2,000 characters." Every reader (cdxml.ts, file.ts with Octet's own fields and 1.1.2's form) does what the dialog does for a long value (`datafields.ts` longShown): the field keeps the whole text as its value (up to MAX_VALUE, 20,000, as a text: ChemDraw's shown field of 25,000 characters has its text cut to 20,000, counted, and keeps those as its value; a value longer than 20,000 in a hand-made file or another program's annotation is left out whole and counted), Show is off, and its text goes from the page (with its notes, and those of a group it held together, counted: then Save asks). Nothing else is lost, so the notice is information and Save does not ask: "A shown value holds up to 2,000 characters. Octet turned off Show for 1 data field." (`SHOWN_OFF`, `oct.ts` lostNotice and losses). Attached data's Save with nothing changed gives the same drawing, a value that ends in a line break too |
| Kept group (Contract Label) | 256 atoms, 512 bonds | file.ts refuses; cdxml.ts drops the group | Contract Label took any group | Kept: Contract Label says "Select a group of 256 atoms or fewer." `contractLabel` contracts no larger group, for any caller. Define Nickname (release-1.1.3) says the same (`chem.ts` `nicknameGroup`), and saves no nickname |
| A nickname's SMILES | 2,000 | nicknames.ts readNicknames drops it at the next start | Define Nickname on a large group | Kept: `nicknameGroup` says "Octet cannot keep this group as a nickname." |
| A nickname's label; nicknames | One word of 32, no control character; 500 | readNicknames drops a label with a control character; a label on an atom holds no < or > (`keptLabel`); `withNickname` adds none past 500 | Define Nickname took < and > and control characters, and at 500 said the nickname was defined, saved none and contracted the group | Kept: `nicknameProblem` says "A nickname cannot hold < or > or a hidden character." (Define Nickname, and a rename in Settings); at 500 Define Nickname says "Octet keeps up to 500 nicknames. Remove one in Settings > Dictionary to add another." and changes nothing |
| Dictionary names; a name's SMILES; template sets; the name history's SMILES | 2,000; 4,000; 50; 2,000 | settings.ts, names.ts `withOwnName`, templates.ts `addSet` | Add to Dictionary said a name was kept when the dictionary was full or the SMILES too long; an import did not say what it left out; New set at 50 put the template in a set the settings do not keep (the library's own New set also opened the set it did not make); a long SMILES dropped a name from the history at the next start | Kept: Add to Dictionary says "Your dictionary holds up to 2,000 names." (Save off) or "This structure is too large for the dictionary."; an import says how many it left out; New set says "You have 50 template sets, the most Octet keeps. Remove a set first." (as a template file does) and the library stays on its set; the history keeps a long SMILES's name alone |
| A template's attachment point (Attach by) | 500 templates, a name of 300 | settings.ts drops the rest at the next start | Attach by on any number of built-in or named templates | Kept: past either, Octet keeps none and says "Octet keeps the attachment points of up to 500 templates." or "Octet cannot keep the attachment point of a template with so long a name." |
| A reagent table's texts typed over its cells | 400 | stoich.ts readCells drops the rest | Text typed over any number of cells | Kept: the 401st is not made, with "A reagent table holds up to 400 typed cells." |
| A spectrum's key (Add to drawing > Key) | 20,000, as a caption | file.ts refuses | A measured spectrum of up to 2,000 multiplets, or a large structure's predicted signals | Kept: the key keeps the lines that fit in 20,000 characters, with the notice |
| Cycle steps | 64 | file.ts refuses | A click on an arc adds a step, with no cap | Kept: `resplice` adds none past 64; the click says "A cycle holds up to 64 steps." |
| Side arrow's structure | 512 atoms | cycle.ts refuses the cycle, so the file | A larger structure at a side arrow | Raised to 100,000 (every index is checked; reading stays linear) |
| Pen curve | 1,000 points | file.ts refuses; cdxml.ts drops | Each click adds a point | Kept: the Pen stops at 1,000 with "A curve holds up to 1,000 points." |
| Atoms, bonds | 100,000, 400,000 | file.ts, cdxml.ts refuse | Paste, duplicate | Kept: an edit past either is not made, with "A drawing holds up to 100,000 atoms." (`limits.ts` overLimit, in the editor's `set`). Each limit holds on its own: a drawing opened past one (another program's) takes an edit that does not make that count larger, and every other limit still holds. An insert set refuses selects nothing new (every caller asks `refused`), and an Option-drag keeps the originals selected |
| Texts, arrows, shapes, cycles, ring fills, groups | 10,000 each | file.ts refuses; cdxml.ts took 40,000 in all, so a ChemDraw file with 10,001 texts opened and its .oct did not | Paste, duplicate | Kept, as atoms. cdxml.ts leaves out those past 10,000 of each kind and counts them (`withinCounts`), with a data field whose text or a table whose arrow goes with them |
| Reagent tables | 100 (`experiment.ts` MAX_GRIDS) | file.ts refuses; cdxml.ts took any number | Analyse Stoichiometry, paste, duplicate, Insert (only `newGrids` kept 100) | Kept: `overLimit` counts them ("A drawing holds up to 100 reagent tables."); cdxml.ts leaves out those past 100, counted |
| Data fields (release-1.1.3) | 10,000 (`datafields.ts` MAX_DATA) | readData leaves the rest out and counts them | Paste, duplicate, a second SD import, Attach Data | Kept: `overLimit` counts them ("A drawing holds up to 10,000 data fields.") |
| Data fields on one structure (release-1.1.3) | 1,000 (`datafields.ts` MAX_EACH) | cdxml.ts counted only the fields not shown; readSd cuts a record; file.ts kept any number | A bond that joins two structures (800 and 800), Attach Data's Save (its grid had 1,001 rows, and setRows cut to 1,000 with no notice) | Kept: `limits.ts` overLimit counts the most on one structure ("A structure holds up to 1,000 data fields."), setRows keeps every row, the dialog's grid has 1,000 rows. Every reader keeps 1,000 on each structure (`withinEach`), counted. Paste and duplicate make structures of their own. The count needs each atom's structure, so it runs only in a drawing with more than 1,000 fields (or whose fields' text needs it, below). Worked out whole, the structures take one pass over the bonds (1 to 2 ms on 100,000 atoms, for an atom deleted). An edit that keeps the bonds of the drawing before it and adds to them (a bond drawn, a paste, a bond tool on a bond, as `edit.ts` bondsMadeFrom says) joins only what it added (overLimit 0.02 to 0.06 ms on 100,000 atoms). Another edit that keeps the bonds compares the two lists (0.1 to 0.3 ms). The fields' counts are kept with the structures, from the drawing before when they can only be fewer (L26). The readers give the fields of a structure one list, as Attach Data does, so an edit renumbers it once |
| Experiment page text kept for new pages | 200,000 characters | docstyle.ts drops it at the next start | Use for New Documents on a long page | Kept: Octet says it cannot keep this page's text, and keeps the style |
| Notes | 10,000 a note, 200 a keyword, 1,000 an object, 10,000 a drawing | annotate.ts; file.ts keeps 10,000 in a drawing (`capNotes`), with no notice, and refused a list of more than 1,000 on one object (so the recovery copy was damaged); cdxml.ts read the comment and Last changed by past 10,000 | Fields take 10,000; `withNote`; paste and Option-drag took a drawing past 10,000; Document Properties (`withDetails`) and Save's Last changed by (`stamped`) took the drawing past 1,000 | `overLimit` counts them ("A drawing holds up to 10,000 notes.") and the most on one object ("A drawing or an object holds up to 1,000 notes."); Save adds Last changed by only within every limit, the text's too (`limits.ts` stampedWithin). file.ts keeps 1,000 on an object (a document's properties and details first, then the first notes; four times as many is damaged) and counts the rest ("annotations"), as cdxml.ts keeps 1,000; cdxml.ts counts the comment and Last changed by in the 10,000, and the notes of a text, arrow or shape it leaves out past 10,000. A group of one thing is left out by every reader, and its notes are counted (file.ts did not count them) |
| A sequence's own monomers (issue 27) | 500 a drawing; a monomer's SMILES 2,000 characters, 256 atoms (its R atoms too) | file.ts and cdxml.ts left out those past 500, and any not of a defined one's form, with no notice. A residue label keeps its atoms (256 atoms, 512 bonds, file.ts `innerIn`), so a monomer of 256 atoms and more than 512 bonds (a file's or a library's: every check took it) made a drawing whose own copy file.ts refuses | A paste or a built sequence brings the monomers it uses (`withMonomers` cut at 500 with no notice); Import… did not count a library's entries past the 20,000th | Kept: `overLimit` counts them ("A drawing holds up to 500 monomers."), their text counts in the text a drawing holds (below), and file.ts and cdxml.ts count those they leave out ("monomers"). `monomers.ts smilesProblem` takes 512 bonds at most (`smilesLinks` counts them, ring closures too), and every reader of the user's monomers and Define Monomer ask it. Import… counts every entry it leaves out. A code (12 letters, digits or _) is a label whole |
| Document comment | 10,000 | experiment.ts | Field takes 10,000 | None needed |
| Details (sheet) | 200 | experiment.ts | The sheet refuses more | None needed |
| Lane, plasmid, region, marker names; polymer label | 40, 80, 80, 80, 20 | cdxml.ts, query.ts | Fields take as many | None needed |
| Table rows, columns; ring fill ring | 100, 20; 40 atoms | file.ts | `resizeTable` caps; fills go in rings of 12 or fewer | None needed |
| Multiplet name, spectrum title, solvent | 12 letters, 200, 40 | measured.ts | Set from files, cut at import | None needed |
| Spectra, notes on one object | 16, 1,000 | file.ts | One spectrum a key, `withNote` | None needed (reagent tables above) |
| CDX text styles | 16-bit byte offsets: 65,535 bytes a text | cdx.ts | – | MAX_TEXT units are at most 60,000 bytes of UTF-8. The writer no longer spreads a text's bytes into a call (an engine's argument limit). |
| MOL, SDF, SMILES Octet writes, read back | 1,000 atoms, 300,000 characters, 20,000 of SMILES; an alias 40 characters, no < or > | chem.ts (Indigo runs on the main thread), with the reason ("It has more than 1,000 atoms.") | Export of a drawing larger than that | Kept: a speed limit with its reason, not this item's. An alias is a label (40, as Octet writes it). |
| File, clipboard type, recovery copy | 64 MB (main.rs MAX_BYTES) | Rust: Save, the recovery copy and Open refuse more | Long texts: 1,400 texts of 20,000 characters were within every count, and Save and the recovery copy refused the drawing. The other counts are not within it either (measured on the writers, the largest form, a .oct, in MB): 100,000 atoms 25 to 38 (with a charge and other properties, up to 190), 400,000 bonds 45, 10,000 texts of one character 2.4, 10,000 arrows 5.6, 10,000 curves of 1,000 points 2,530, 10,000 tables of 2,000 empty cells 530, 10,000 data fields 1.8, 12 MB of pictures 56, 16 spectra 38 (as .cdx 43). So no count can be kept to 64 MB by a limit on text alone | Text, which this item made larger, is kept: a drawing holds 5,000,000 characters of text (`limits.ts` MAX_CHARACTERS; "A drawing holds up to 5,000,000 characters of text."). It counts every character of texts and their style runs, notes, data fields, table cells, risk assessment texts, reagent tables and a sequence's own monomers (issue 27), each at the most bytes it takes in any form Octet writes (.oct, .cdx, CDXML, the recovery copy; L19 measures each kind with " and €), as characters of 9 bytes: a character of a text, a note or a value 8.7 bytes (a .oct, "), a style run 309 with a size of 19 digits (35 characters) and its font's name, as a text's own font (4 bytes a character at most; a name holds 64, and Text > Font > Other Font takes any), a table cell's character 15.7 and a shown field's name's 11.3 (2), a risk text's character 4.0, a reagent table's 7.0 for each character of its JSON (1), a monomer's code, name and SMILES 14 (a control character, which JSON writes as \u0001, in a .oct: 2) and its record 120 (14). 500 monomers of 2,092 characters take up to 14 MB in a .oct, so they count (L35). A field not shown is written in each structure it is on (6 bytes a character and 88 for its record in each more), so it counts its name, value and 12 more once for each. So the text of a drawing is 45 MB at most in any form. Guaranteed: a drawing of text alone at the limit saves in every form within 64 MB, with 10,000 texts that have every style, each with a note and a shown data field (L19, measured at 9,700: .oct 54.2 MB, .cdx 27.3, CDXML 33.8, recovery copy 15.3; with their font and texts of runs in a font of 64 characters, .oct 39.8 MB, which with fonts not counted was 68 MB; with runs of no font and sizes of 19 digits, .oct 52.6 MB). Not guaranteed: everything else (structures, bonds, curves, pictures, spectra, a table's own cells, a text's or shown field's list of atoms at 24 to 30 bytes an atom), as in 1.1.2: Save refuses a drawing larger than 64 MB and says what to do ("This drawing is larger than 64 MB. Octet cannot save it. Delete part of it, or copy part of it to a new drawing and save that."), and the recovery copy kept last stays, because recovery.rs refuses a larger copy before it writes and the editor removes its copy only when the drawing is saved or the user chooses Don't Save (L29, and recovery.rs a_drawing_too_large_keeps_the_last_copy). Readers leave out notes past the limit (the last first), then texts, then data fields, counted (`withinText`), and only what brings the drawing within: when leaving out every note and text would not be enough, data fields go until it is within and the notes and texts stay; when leaving out every note would not, texts go and the notes stay (L33). Table cells, risk texts, reagent tables and monomers past it stay: when leaving out every note, text and field would not bring the drawing within, nothing is left out, and the editor then takes no edit that adds text. A text or a table cell typed past a limit stays in its box with what was typed, and the notice says why (`Editor.tsx` commitWriting, commitCell; L32). The count is kept for each list (texts, notes, shapes, groups, reagent tables, fields), so an edit that makes no new list costs nothing and one that does costs a pass over that list. A field not shown counts its structures only when the most it could be (one for each of its atoms) takes the drawing past the limit. On 100,000 atoms whose fields need their structures (an SD library of 1,000 structures with 5 fields each, made in Octet or read from a .oct; 2,000 fields on structures of 20 atoms) and on 10,000 atoms with 200 procedures of 1,000 characters, overLimit costs a bond drawn, a bond tool on a bond, a paste and a text typed 0.005 to 0.07 ms, against 0.5 to 28 ms for the edit and the rest of set, and an atom deleted 0.2 to 2 ms, against 2.3 to 25 ms; with OCTET_BASE each whole edit is as fast as in release-1.1.3 (an atom deleted 27 to 31 ms against 44 to 52, as `edit.ts` removeAtoms keeps one flag an atom, not sets and maps). At 210edd68 the fields' structures were worked out on every such edit (1 to 2 ms: up to twice the rest of set). sizeOf (d2fbc9b7), which worked out the whole drawing's size, is gone: it missed kinds of things (reagent tables, gels, plasmids) and cost 11.5 ms an atom deleted on 100,000 atoms |
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

Octet 1.1.2 and before keep their old limits. They open a 1.1.3 file with a text of more than 2,000 characters, a
reagent table column keyed by a text of more than 80 characters or of two lines, or a side arrow's structure of more
than 512 atoms from its CDXML, with no notice and without Octet's own extras (a long text is cut to 2,000). A risk text
of more than 2,000 characters, or of more than 200 runs, makes 1.1.2 leave out the risk assessment's record. This
cannot change in 1.1.2.

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
- L11: a shown data field of 5,000 characters in ChemDraw's CDXML and CDX, in Octet's own fields and in 1.1.2's form:
  the whole value, Show off, its text off the page, said as information (Save does not ask); saved in every form, it
  opens again the same with nothing said, and Attached data's Save with nothing changed gives the same drawing (with a
  value that ends in a line break too). Over 10,000: left out, counted, its text kept.
- L12, L13: `overLimit` at and past 100 reagent tables, 10,000 data fields and 10,000 notes; a CDXML with 101 tables
  opens with 100, counted; a file with 10,005 notes opens with 10,000 and counts 5.
- L14: a ChemDraw file with 10,001 texts, arrows and shapes opens with 10,000 of each, counted, and saves and opens again.
- L15, L16: nicknames with < or > or a control character refused; at 500 nicknames, 2,000 dictionary names or 50
  template sets, nothing is added and Octet says so (source).
- L17: the caption box's limit is the text's (`textMost`): a shown value 2,000, a chart label 80, a detail 200.
- L18: 1,000 data fields on one structure: a bond that joins two structures of 800 and Attach Data's Save of 1,001 are
  refused, paste and duplicate are not; .oct, CDXML (shown fields) and SD readers keep 1,000, counted.
- L19: 5,000,000 characters of text: 1,400 texts of 20,000 refused; each kind of text counts at least the bytes it writes
  in every form (texts of " and €, style runs, runs with a font of 64 characters and a size of 19 digits, runs of no
  font, a text's own font, notes and their keywords on the drawing, a text, an arrow, a shape and a group, values and
  names on one and on three structures, a field on 2,000 structures, a shown field's name, table cells, risk texts and
  runs, reagent table keys); every bond deleted under 400 fields refused; text at the limit, with 9,700 styled texts,
  notes and shown fields, saves within 64 MB in every form, and a text more is refused; so does the independent
  check's drawing, its texts and runs in a font of 64 characters; readers leave out notes, then texts, then fields past
  it, counted.
- L20: each limit on its own (a drawing with 10,002 notes takes a new text, not a note or 100,001 atoms); a ChemDraw
  file with 10,000 notes, a comment and ModificationUserName opens with 10,000; Save adds no Last changed by past it.
- L21: 1,000 annotations on the drawing: Document Properties past it refused, Save adds none; a file with 1,001 opens
  from its own copy with its Title.
- L22, L24: the callers that select what an insert added ask whether set made it (the > key's new label too); New set
  at 50, attachment points and typed cells (source).
- L23: notes on the texts cdxml.ts leaves out past 10,000 are counted.
- L25: structures are not counted: 100,000 atoms with every property (a .oct over 64 MB) take a new text and bond and
  open whole; Save refuses a drawing over 64 MB (source).
- L26: the limits' cost on drawings whose data fields need their structures (an SD library made in Octet and read from
  a .oct, 2,000 fields on 100,000 atoms, 200 procedures on 10,000), with the app's edits (sprout, keyBond, insertMol,
  deleteChosen, a text typed): overLimit at most a twentieth of the edit and set's pipeline (a fifth for an atom
  deleted), and an atom deleted from 100,000 atoms at most 8 times set's pipeline (12 to 13 times in 1.1.2 and
  release-1.1.3). With OCTET_BASE (release-1.1.3's or 1.1.2's src folder), each whole edit against that version's,
  interleaved.
- L27: a long shown value's text in a group with a note (1.1.2's form): the group's notes are counted in every reader,
  so Save asks; 4,000 annotations on one object in a hand-made .oct: 1,000 kept, counted.
- L28: a value of 20,000 characters, not shown, and ChemDraw's shown fields of 20,000, 25,000 and 30,000 characters
  (Show off, 20,000 kept): the same from .oct, CDXML, CDX and the clipboard; a value of 20,001 left out whole, counted.
- L29: a drawing over 64 MB: Save says what to do; recovery.rs refuses a larger copy before it writes, and the editor
  removes its copy only when the drawing is clean.
- L30: a group of one thing: its notes counted by the JSON reader, as by the CDXML reader.
- L31: what the editor adds after set (Last changed by on Save, markup, a risk assessment's substances and hazards,
  live values) stays within the limits.
- L32: a text or a table cell set refuses stays in its box with what was typed, and no box opens over it (source).
- L33: readers leave out only what brings a drawing within MAX_CHARACTERS: 260 hidden procedures of 20,000 characters
  and 1,000 texts, 200 with a note, lose fields only; tables past the limit lose nothing.
- L34: a sequence's monomers: a monomer of 512 bonds read by every reader, one past refused; a residue label of 256
  atoms and 512 bonds back in every form; `overLimit` at 501 monomers; a file with 505 and one of the wrong form opens
  with 500 and counts 6; a code within a label; a library of 25,000 entries counts every one it leaves out.
- L35: a sequence's monomers (of ", a control character, €, an emoji, <, &) count at least what they write in every
  form; 500 monomers of 2,000 control characters and texts of " up to MAX_CHARACTERS save within 64 MB in every form,
  one more text and the 501st monomer refused; a reader keeps the monomers and leaves out the texts past it, counted.

## Stress list

- H1: a .oct JSON of 60 MB: 3,000 captions of 20,000 characters (the limit, at the file size limit): read in time
  linear in size, heap growth bounded, and the texts past MAX_CHARACTERS left out, counted (as a .oct it would be over
  64 MB).
- H2: a CDXML with one text of 60 million characters: cut to 20,000, counted, fast.
- H3: 10,001 captions; 100,001 atoms: refused fast.
- H4: JSON nested 100,000 deep; CDXML nested 10,000 deep: refused fast, no stack overflow.
- H5: a reagent table with 60 columns keyed by 20,000-character names and 400 cells: read fast.
- H6: one caption of 20,000 characters laid out and drawn: fast.
- S1: speed on normal files (the examples): parse, serialize, readOct, writeOct and fromCdxml against release-1.1.3,
  interleaved runs (with OCTET_BASE set to its src folder).

Not checked here: ChemDraw's own limit on a text's length (no ChemDraw run for this item), and the editor's speed
while typing in a text of 20,000 characters (H6 times the layout alone: under 0.1 s in Node, with Arial's widths).

## What's New

- When you type or paste a long text, such as a procedure with its characterisation data, the text keeps up to
  20,000 characters. It saves and opens again whole, in .oct, CDXML and CDX files and on the clipboard.
- When you type or paste past a limit (a text, a label, a table cell, a chart label, a shown data field), Octet keeps
  what fits and says so.
- When Octet cannot read its own copy of a drawing in a file, it opens the ChemDraw copy and says so. Save asks
  before it replaces the file.
- When you contract a label or define a nickname for a group of more than 256 atoms, Octet says to select a smaller
  group.
- When you paste, duplicate, import, join two structures or add text past what a drawing holds (10,000 texts, arrows,
  shapes, data fields or notes, 1,000 data fields on a structure, 100 reagent tables, or 5,000,000 characters of text),
  Octet makes no change and says why. Text you typed stays in its box.
- When you open a ChemDraw file with more than a drawing holds, Octet opens what fits and says what it left out. Saved
  again, the drawing opens with nothing left out.
- When you open a file with a shown data field of more than 2,000 characters, Octet keeps the whole value (up to
  20,000 characters, as a text) and turns off Show for it, as Attached data does, and says so.
- When you save a drawing that is larger than 64 MB, Octet says to delete part of it, or to copy part of it to a new
  drawing. The copy Octet kept last for recovery stays.
- When you define a nickname with < or >, or you have 500 nicknames already, Octet says why and changes nothing. Add
  to Dictionary at 2,000 names and New set at 50 sets do the same.
- When you delete atoms from a large drawing, Octet takes half the time it took before.
