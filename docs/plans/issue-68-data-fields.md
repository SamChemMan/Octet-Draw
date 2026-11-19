# Data fields on structures (issue 68)

Stefan Schramm's issue 68 (his priority: high). A chemist attaches named fields to a structure (internal number,
batch, melting point, freezer), shows any of them next to it, and gets them in SDF. Branch `item/68-data-fields`,
cut from `release-1.2-mcp` at b30f413, for release 1.2 (Friday 20 November 2026). This is the plan. Code starts
after Sam's yes. On 19 November the branch was rebased on bd7c684 for release 1.1.3, which ships with the AI features
off: the dialog, the menus and the files work in full, and the MCP parts wait for 1.2.

## What Octet has at b30f413

- No data fields. Nothing in the UI, the MCP or the files holds a name and a value on a structure.
- ChemDraw's attached data already survives a CDXML round trip as text: the reader keeps a `chemicalproperty`
  (type 23, its Name) on its caption as `Caption.property` (`src/cdxml.ts` 2141-2146, `src/render.ts` 157 and 199),
  and the writer puts it back (`src/cdxml.ts` 1080-1082). Octet does not know it is data: it cannot be edited as data
  and does not go to SDF.
- A ChemDraw file made from an SD file loses its data. ChemDraw keeps SD data items as `<annotation>` elements in each
  `<fragment>`. Octet's reader counts those as lost (`src/cdxml.ts` 1504: "Octet left out 6 annotations").
- SDF export writes each structure's molfile and `$$$$`, with no data items (`src/chem.ts` 1302-1305).
- SDF import goes through Indigo's KET (`src/chem.ts` 199-226, `fromKet` 239). `fromKet` reads no `properties` and
  no S-groups, so SD data items and Data S-groups are lost. Indigo also drops the data items of an SD file with one
  record (tried on 17 November 2026: two records keep them, one record has none).
- A structure file opens through `merge(EMPTY, mol, …)` (`src/Editor.tsx` 2086-2095, `src/edit.ts` 1241), which
  keeps atoms, bonds and ring fills only.
- `Mol.fields` is taken (an experiment page's flag, `src/render.ts` 472-475). The new list needs another name.

## What ChemDraw does

Sources: ChemDraw 26.1's help (Importing: Attached Data; Captions: Annotations) and menus (Object > Attach Data…,
Annotate…; the caption's context menu), the public CDX format description (objecttag, chemicalproperty,
PositioningType), and ChemDraw 22.2 (build 3348) on 17 November 2026: it opened three files and saved them as CDXML.

| ChemDraw option | Octet 1.2 |
| --- | --- |
| Object > Attach Data…: Field name | Name |
| Data | Value |
| Search operator (for a database search) | Cut (see Cut) |
| Tag (one character drawn by each linked object) | Cut |
| Position (where the text sits by the object) | Under the structure, or anywhere by a drag |
| Chemically significant (26.1) | Cut |
| Attach to any atoms and bonds, or one set of brackets | Whole structures (see Cut) |
| Caption menu: Edit Attached Data | Edit attached data… |
| Caption menu: Select Linked Objects | Select linked objects |
| Caption menu: Position… | Tie to structure, Un-tie from structure (exist), and a drag |
| 26.1: picking the text highlights its atoms and bonds | Cut |
| Object > Annotate… on a structure (keyword and content, Delete, Delete All) | A field that is not shown |
| MDL files: attached data saved as Data S-groups | Read. Written as SD data items in SDF |
| Default key | None in ChemDraw, so none in Octet |

What ChemDraw 22.2 wrote:

1. A molfile with two Data S-groups (Batch on all three atoms, MeltingPoint on one atom), V2000 and V3000. Each
   became a text `<t InterpretChemically="no">` holding the value, and a page-level `<chemicalproperty
   ChemicalPropertyType="23" Name="Batch" ChemicalPropertyDisplayID="<the text>" PositioningType="absolute"
   PositioningOffset="…" BasisObjects="<atom ids>"/>`. ChemDraw grouped the fragment and its texts. From V2000 the
   value came with the query columns as spaces and an `objecttag Name="attachedDataSearchOperator"` on the text.
2. An SD file of two records with data items. Each item became `<annotation Keyword="Batch" Content="B-001"/>` inside
   its `<fragment>`, sorted by keyword. A two-line value kept its line break, written raw inside `Content`.

So ChemDraw has two forms. Data you see (attached data, type 23, a Data S-group in MDL) and data you do not see (a
structure's annotations, an SD data item). Octet has one list of fields. Each field is shown or not.

## Jobs

Each job is done when its lines hold and its checks pass (see Acceptance).

### J1. The model

- `Mol.data?: DataField[]`. A field is `{ name, atoms }` plus its value: `value` when it is not shown, `caption` (a
  caption's id) when it is shown. One ordered list for the whole drawing.
- A field belongs to every structure that holds one of its atoms. A structure's fields are the list's fields that
  touch it, in list order.
- `src/datafields.ts` holds every rule: the fields of a structure, a field's value, set a structure's fields from
  dialog rows, show, hide, select linked, the name and value cleaners and the limits, and the SD data reader and
  writer.
- Done: `datafields.check.ts` checks each rule in "Rules".

### J2. Edits keep fields

- Every edit that renumbers atoms renumbers field atoms, as it does ring fills and captions under structures:
  delete, Cut, the eraser and Join (`removeAtoms`, `joinOverlaps`), paste and Duplicate (`insertMol`, `merge`), a
  template's objects (`src/edit.ts` 2648), Copy (`extractSelection`), CDXML's part writer (`pick`, `src/cdxml.ts`
  1176). A field goes when none of its atoms is left.
- Copy takes a field when any of its atoms is copied. When its shown text is not copied, the copy holds the value
  instead (not shown).
- Split: both pieces keep the field. A change made to it on one piece (dialog or MCP) first gives that piece its own
  copy, so the other piece keeps the old value.
- Merge (a bond drawn between two structures, Join, an atom dropped on another): the structure has both lists.
- The MCP's in-place replace (`replaceStructure`, `src/mcp.ts` 1646) moves the fields to the new structure, as it
  moves the number.
- Done: a check for each path in `datafields.check.ts`; undo and redo through `history.ts`.

### J3. .oct

- `serialize` writes `data: [{ name, atoms, value }]` or `{ name, atoms, caption: <place in the captions list> }`.
- A shown field's caption also carries ChemDraw's property `{ ChemicalPropertyType: "23", Name }` with the field's
  atoms. Octet 1.1.2 reads that (its `PROPERTY_ATTRS`) and keeps it when it saves.
- `parse` reads `data` as hostile input. An entry that is not sound is left out and the drawing opens. A caption with
  a type 23 property that no entry names becomes a shown field (a 1.2 drawing saved by 1.1.2, or 1.2 base).
- Done: round trip equal; the limits; Octet 1.1.2's own `parse` opens a 1.2 file (run once from the v1.1.2 tag in a
  scratch folder, and recorded here).

### J4. CDXML and CDX

- Write: a field not shown is an `<annotation Keyword Content>` in each `<fragment>` it touches. A shown field is
  its caption (with `InterpretChemically="no"`) and a `chemicalproperty` of type 23 with its Name and its atoms.
  These are ChemDraw's own forms. Octet's private attribute keeps the order of a structure's fields.
- Read: an annotation in a fragment is a field of that fragment's atoms. A type 23 property is a shown field. A raw
  line break in an annotation's `Content` stays a line break (ChemDraw writes it raw; Octet writes `&#10;`).
- CDX: the same objects (annotation 0x802B with Keyword and Content; chemicalproperty 0x8020), through the CDXML
  writer and reader as now.
- Done: round trip checks; ChemDraw 22.2 opens Octet's CDXML and CDX and saves CDXML, and Octet reads that file back
  with the same fields.

### J5. SDF write

- Each record gets the fields of its structure, shown or not, after `M  END`: `> <name>`, the value's lines, a blank
  line. V3000 and V2000 the same. Export, the MCP's `file`, `--convert` and Save as SDF all use `toSdf`.
- A value line that is empty or starts with `$$$$` is left out (each would end the item or the record). An empty
  value writes the header and the blank line.
- UTF-8, as every text file Octet writes.
- Done: checks on the text; Octet reads its own SDF back with every item, and Indigo reads a file of two records or
  more with every item.

### J6. SDF and MOL read

- Octet reads SD data items itself (Indigo drops them for one record). It splits the text into records, reads the
  items after `M  END`, and matches each record with Indigo's molecule by order. A record with no atoms has no
  molecule in Indigo's result and is skipped. Where a record's atom count differs from its molecule's, its fields are
  left out.
- `fromKet` reads Data S-groups (`sgroups` of type `DAT`) as fields of their atoms. They start hidden.
- Fields from a file are not shown (an SD file of 200 compounds with 10 fields each would bury its drawing).
- What is left out is said, as for a ChemDraw file: "Octet left out 3 data fields." Every way in uses this: Open,
  Import, Paste of MDL text, a drop, the MCP's file text, `--convert`.
- Done: checks on records, mapping, limits and the notice.

### J7. The UI

- Attach data… opens a dialog for the selected structure: a grid of Name, Value and Show, one row for each field, and
  one empty row to type the next. It reuses Add Chart's grid (`Cells`, moved from `src/ChartDialog.tsx` to
  `src/Cells.tsx`): Up and Down move between rows, a table pasted from a spreadsheet fills from the cell pasted in, a
  row left empty is left out. Shift+Return and Option+Return add a line to a value. Return saves. Escape cancels.
  Nothing changes the drawing until Save, and Save is one undo step.
- Built (17 November): a value's field is as high as every other field, with the caret's line in view. A field that
  grew with its lines failed `npm run look` (every `.unit-field` is `--size-control` high). Column names Name, Value
  and Show stand over the grid; the empty row has no placeholder text.
- Show puts the value under the structure as text tied to it, in the document's caption style, stacked with its
  number and captions. The text is the value. Typing over it changes the value. Deleting it deletes the field. Show
  off keeps the field and removes the text.
- On a field's text: Edit attached data… (the dialog, at that row) and Select linked objects (the structures it
  belongs to, and the text).
- Where: Object > Attach Data… (after Show Atom Numbers), the Actions panel and context menu for a structure, the
  command palette. Icons: Phosphor `Paperclip` and `SelectionBackground`. Built: the plan's `Tag` is a step name's
  and `SelectionPlus` is Select structure's, and look.check.ts holds one icon to one command.
- Make element, Convert to structure and Interpret chemically are not offered on a field's text.
- Built: Select linked objects with no field's text picked (the palette, the MCP) says "Select attached data first."
- Built: a field shared by two pieces of a split structure, changed on one piece, stays shown on the piece its text is
  tied under (its first atom). The other piece gets its own text when Show stays on, as the dialog showed it.
- Done: `npm run look` with the dialog in `scripts/look/sweep.js`, both themes, no `look:` errors; `dialog.check.ts`
  rules hold for the new dialog.

### J8. MCP

- `read`: each structure with fields has `data: [{ name, value, shown? }]`. A summary cuts a value at 200 characters
  and lists 100 fields at most, saying how many more; `detail: full` gives every field whole.
- `change` > `edit` on a structure id (s3 or its number): `data: [{ name, value, show, remove }]`, at most 100. A
  value sets the first field of that name (adding one if there is none). `remove: true` removes every field of that
  name. `show` shows or hides it. On several ids it sets each. Changed in the build from `value: null`: the MCP's
  schema has no null type (`src/mcp.ts` Prop), and a boolean needs no new kind of argument.
- `run_command`: `attach_data` (opens the dialog; refused with no window, as other dialogs are) and `select_linked`
  (on a field's text, t5).
- `file` with sdf and `drawings new` with SD text carry fields through J5 and J6.
- Done: `datafieldsmcp.check.ts` on the headless host. The MCP change stays in `edit`, `summary` and the command
  list, so the session reviewing `src/mcp.ts` sees three small hunks.

### J9. Speed

- A drawing with no fields does exactly the work it did before: each new step starts with `m.data?.length`.
- With fields, an edit pays for one pass over the field atoms. The structures a field touches are worked out only
  when something asks (the dialog, a writer, the MCP), never on a pointer move or a render.
- Done: see Speed.

## Rules every part keeps

1. A field is a name and a value on a structure. It belongs to every structure that holds one of its atoms.
2. A name has 1 to 200 characters on one line. Control characters, `<` and `>` are taken out wherever a name comes
   from (typed, a file, the MCP). 200 is the longest property name Octet 1.1.2 keeps.
3. A value has up to 10,000 characters. Line breaks are kept as `\n` (a CR is dropped), a tab becomes a space, other
   control characters are taken out. Empty lines at its start and end are dropped. A value over 2,000 characters
   cannot be shown (the caption limit Octet 1.1.2 reads).
4. At most 1,000 fields on a structure and 10,000 in a drawing. A reader keeps the first ones and says how many it
   left out. A value over the limit is left out whole, never cut.
5. A field from a file with no name is called "Data".
6. A shown field's value is its text on the page. A field not shown holds its value itself. Never both.
7. A field's text is text only. It never counts as chemistry and never as a compound number (Number these compounds
   never changes it or counts it).
8. Every change to fields is one undo step.
9. Nothing loses a field quietly. A reader that leaves one out says so. The formats that cannot hold fields are
   listed under "Files".
10. Every file is hostile: each limit above holds in every reader, and each reader is one pass over the text.
11. The order of a structure's fields is the order in the dialog, the SDF and the MCP's read.

## Decisions

- **One list, with atoms.** Octet has no fragment object: a structure is its atoms, worked out from the bonds. Ring
  fills and captions under structures hold atom lists already, and the edits that renumber atoms already renumber
  those. One list gives one order and one place to renumber.
- **Split keeps both; a change splits the copy.** No edit loses data. An SD record is one structure, so each piece
  then writes its own record with the field. Nothing runs on each bond edit.
- **A shown field is a caption tied to the structure.** It gets every caption behaviour (font, size, colour, move,
  align, rotate, export, dark mode, ⌘A) with no new object. ChemDraw's attached data is a text linked to atoms too.
- **The shown text is the value alone.** ChemDraw stores the text as the value. A "Batch: " in front would change the
  value in ChemDraw and in SDF. The user types "mp 123 °C" as the value when they want it on the page.
- **Deleting the shown text deletes the field. Show off hides it.** ChemDraw does the same (the text is the data),
  and it keeps one source for the value.
- **SDF writes every field as a data item. Data S-groups are read only.** Data items are what registration systems,
  spreadsheets and RDKit read. Writing both forms would give two fields when the file comes back.
- **Not shown is ChemDraw's annotation; shown is ChemDraw's attached data.** ChemDraw 22.2 maps SD data items and
  Data S-groups to exactly these.
- **Octet reads SD data items itself.** Indigo drops them for an SD file of one record.
- **A dialog with Add Chart's grid.** ChemDraw's Attach Data is a dialog. The grid exists and already does rows,
  paste and Return. The Properties panel shows calculated values with Add to drawing ticks, a different job.
- **Fields from a file are not shown.** A big SD file stays readable. One switch shows any of them.
- **.oct also writes ChemDraw's property on a shown field's caption.** Octet 1.1.2 then keeps a shown field through
  its own save.
- **No new key.** ChemDraw has none for Attach Data.

## The UI

The simple path:

1. Select the structure. Choose **Attach data…** (Actions panel, Object menu or command palette).
2. Type a name and a value. The next empty row appears. Paste a table from a spreadsheet to fill several rows.
3. Turn on **Show** for the ones to see on the page. Push Return.

Every word this adds: Attach data… (Actions panel, palette), Attach Data… (Object menu), Attached data (the dialog's
title), Name, Value, Show, Cancel, Save, Edit attached data…, Select linked objects, "Select a structure first.",
"Octet left out N data fields." No other text.

## Siblings (consistency)

| Sibling | A field |
| --- | --- |
| Colour, font, size, bold, italic, underline, alignment, line spacing | The shown text takes each, as any caption |
| ⌘A | Selects the shown text with everything else. A field not shown is not an object |
| Hold for Select | No tool is added, so nothing to hold |
| Undo and redo | Every change is one step |
| Copy, Cut, Paste, Duplicate, Option-drag, between drawings and windows | Fields come with their structure (J2) |
| Flip, Rotate, Rotate…, Scale, Align, Distribute, Centre on page | The tied text stays under the structure. Un-tied text moves as any caption |
| Delete, the eraser | J2. Deleting the shown text deletes the field |
| Group, Ungroup, Pick as one, Bring to front, Send to back | As any caption |
| Tie to structure, Un-tie from structure | Work on the shown text. Un-tied text keeps its field |
| Clean up, Clean up reaction, 3D clean up, Expand label, Contract label, Join | Fields stay with the atoms left |
| Templates saved by the user | Keep their fields; inserting one brings them |
| .oct, CDXML, CDX, SDF, clipboard, PDF with CDXML inside | See Files |
| Dark mode | The dialog and the text use tokens only |
| Autosave and recovery | Through `serialize` |
| MCP | J8 |
| Command palette, menu bar, context menu, Actions panel | J7 |

## Files

| Format | Write | Read | Octet 1.1.2 with the file | ChemDraw with the file |
| --- | --- | --- | --- | --- |
| .oct | `data`, and type 23 on shown captions | Yes | Opens it. Shows shown fields as text. Ignores `data`. Its save keeps the shown ones only | n/a |
| CDXML | Fragment annotations; type 23 property and text | Yes | Opens it. Keeps shown ones as text with the property. Says it left out the annotations | Annotations on the structure; attached data |
| CDX | As CDXML | Yes | As CDXML | As CDXML |
| SDF V3000, V2000 | Data items for every field | Data items and Data S-groups | Reads no fields (as now) | Annotations on each structure (seen 17 Nov) |
| MOL V3000, V2000 | No fields | Data S-groups | n/a | n/a |
| RXN, RDF, CML, CT, SLN, HELM, FASTA, SMILES, InChI, chemfig | No fields | No fields | n/a | n/a |
| Octet's clipboard | `serialize`, all fields | Yes | Pastes shown text | n/a |
| Clipboard CDXML, CDX, the PDF's CDXML (Word and back) | As CDXML | Yes | As CDXML | As CDXML |
| Clipboard MOL, SMILES | No fields | No fields | n/a | n/a |
| PDF, SVG, PNG, EMF, EPS, TIFF and the rest | Shown text is drawn | n/a | n/a | n/a |

## Stress list

| # | Case | Expected |
| --- | --- | --- |
| S1 | SD file of 10,000 records with fields (about 5 MB) | Open refuses at once with "It has more than 300,000 characters." (the limit now). No freeze |
| S2 | SD file just under 300,000 characters: 250 records, 10 fields each | Opens; each structure has its 10 fields in file order; time within 10% of the same file with no fields |
| S3 | Values with line breaks, CRLF, empty lines inside, trailing empty lines, tabs | .oct, CDXML, CDX keep the lines (CR dropped, tab a space). SDF leaves out empty lines; read back the same as written |
| S4 | `<` and `>` in names: typed, `> <a<b>` in SDF, a CDXML keyword | Taken out of the name everywhere; every SDF header reads back |
| S5 | Two fields named ID on one structure | Both kept in order, both written to SDF, both read back. MCP `value` sets the first; `remove: true` removes both |
| S6 | Empty values | Kept as an empty field; SDF writes the header and a blank line; read back empty |
| S7 | Empty names | A dialog row with no name is left out. A file's field with no name is called Data |
| S8 | Unicode: α, °C, 日本, 🧪 (two UTF-16 units), Arabic | Kept in every format. A value over the limit is left out whole, so nothing splits a character |
| S9 | Hostile SDF: one value of 290,000 characters; 20,000 tiny items on one record; a header with no name; NUL and ESC in values; a record with fields and no atoms; `$$$$` with spaces after it | The big value and the items past 1,000 are left out and counted; the nameless item is left out; control characters taken out; the empty record's fields counted; separators found. One notice. Under a second |
| S10 | Hostile .oct: `data` not a list, 100,000 entries, atoms out of range, a caption place that is wrong, a 10,000-character name | Bad entries left out, the drawing opens. 10,000 entries at most |
| S11 | Hostile CDXML: 5,000 annotations in one fragment; a type 23 property with no text or no atoms | 1,000 fields kept, the rest counted; the property counted lost (as now) |
| S12 | A structure split in two (delete a bond) | Both pieces list every field; SDF has both records with them. Editing one piece's field leaves the other's |
| S13 | Two structures merged (a bond between them, Join, an atom dropped on an atom) | The one structure has both lists, the earlier structure's first. Duplicates stay |
| S14 | Deleting what it depends on: every atom; some atoms; the shown text; Cut then Paste | Field gone; field kept; field gone (Undo brings both back); fields back after Paste |
| S15 | Undo chain: attach, show, type over the text, hide, then Undo four times and Redo four times | Each step exactly as it was. Typing in the dialog is no step until Save |
| S16 | Copy and paste between drawings and between windows | Same fields. A text copied alone is plain text. A structure copied without its un-tied text brings the field, hidden, with its value |
| S17 | Round trip .oct → CDXML → CDX → .oct → SDF V2000 → open → SDF V3000 → open | Same names and values on the same structures. Shown state kept until SDF (fields from SDF are not shown) |
| S18 | ChemDraw 22.2 opens Octet's CDXML and CDX, saves CDXML | Its file has the annotations and the type 23 property; Octet reads it back with the same fields |
| S19 | Octet 1.1.2 opens a 1.2 .oct and CDXML with shown and hidden fields | Opens with no "damaged". Shown values are text. After its save, 1.2 gets the shown fields back; hidden ones are gone (known) |
| S20 | Dark mode, and zoom from the smallest to the largest | The dialog and the text use tokens; the text draws as any caption |
| S21 | Rotated and flipped structure | Tied text stays under it; fields unchanged |
| S22 | Fast input: typing in the dialog; 100 MCP `edit` calls in a row | No drawing change until Save. 100 undo steps, final state right |
| S23 | MCP bad arguments: `data` on t5 or a7; a name with `<`, empty, 201 characters; a value of 10,001 characters; show on a 2,001-character value; removing a name that is not there; the 1,001st field; `data` not a list | Each refused or reported with its reason; nothing else changes |
| S24 | Two AI sessions edit one structure | Calls run one at a time; each is one undo step; the later value wins; a call on a structure the other deleted says there is nothing with that id |
| S25 | 40 paclitaxels with 10 fields each | Delete a bond, drag, Undo: no slower than with no fields, beyond noise. SDF export under a second |
| S26 | A 500-residue peptide with 20 fields | Edits no slower; the dialog opens at once; SDF one record with 20 items |
| S27 | Shown values "MeOH", "NaCl", "C6H6", and a bold "12" | Never chemistry (formula and mass of the drawing unchanged); never a compound number |
| S28 | MCP `structure` replace in place | The fields move to the new structure |
| S29 | A field on a structure in a reaction; Clean up reaction | Fields unchanged; RXN export has none (listed) |
| S30 | A user template with fields | Inserting it brings the fields |
| S31 | Expand label and Contract label on a structure with fields | The field stays on the structure |
| S32 | Attach data… with nothing selected, or with an arrow selected | "Select a structure first." |

## Acceptance

| Check | Covers |
| --- | --- |
| `src/datafields.check.ts`: model and rules | J1, rules 1-7, 11; S4-S8 |
| `src/datafields.check.ts`: edits | J2; S12-S16, S21, S28-S31 |
| `src/datafields.check.ts`: .oct | J3; S10, S17; the 1.1.2 conditions (caption property names, text length, no tabs) |
| `src/datafields.check.ts`: CDXML and CDX | J4; S3, S11, S17 |
| `src/datafields.check.ts`: SDF write and read | J5, J6; S1-S3, S9, S17 |
| `src/datafields.check.ts`: undo chain through `history.ts` | Rule 8; S15 |
| `src/datafields.check.ts`: timing | J9; S25, S26 (median of interleaved runs, with and without fields) |
| `src/datafieldsmcp.check.ts` (headless host) | J8; S22-S24, S28 |
| `src/datafields-stress.check.ts` | Every case of the stress list but S18 and S19, each on its own |
| `src/numbering.check.ts` and a chemistry check | Rule 7; S27 |
| `npm run look` with the dialog in `sweep.js`, light and dark | J7; S20, S32 |
| `npm test`, `cargo test` (the menu item) | Everything else still passes |
| ChemDraw 22.2: open Octet's CDXML and CDX, save CDXML, read back | S18 |
| Octet 1.1.2's `parse` and `fromCdxml` from the v1.1.2 tag on 1.2 files (scratch folder) | S19 |
| Interleaved timing against v1.1.2 (6395bd5) on drawings with no fields: delete, drag, undo, open, SDF export | Rule 10, no speed regression |

## Speed

- With no fields, every changed function does one extra `undefined` test. Measured against v1.1.2 as the median of
  interleaved runs: 40 paclitaxels and the 500-residue peptide, delete a bond, drag, Undo, open, SDF export.
- With fields: the same steps on the same drawings with 10 fields on each structure, against no fields. The check
  fails when the median is more than 15% slower; a failure is run again alone before it counts (the machine is busy).
- Built: the with-fields check compares 400 fields (2 of 10 shown on each paclitaxel) with the same drawing holding
  the same 80 texts and no fields, so it times the fields alone (the texts cost what any text under a structure
  costs). Its bound is 15% plus 0.5 ms, as a sub-millisecond edit varies by more than 15% on a busy machine. Fields made
  together share one atom list, which an edit renumbers once.

Measured 17 November 2026 (busy machine, median of 25 interleaved runs, no fields), this branch against v1.1.2:

| Drawing | Delete a bond | Drag | Copy and paste | Open .oct | Open CDXML | SDF export |
| --- | --- | --- | --- | --- | --- | --- |
| 40 paclitaxels | 1.25 / 1.22 ms | 10.5 / 21.7 ms | 0.14 / 0.13 ms | 2.29 / 1.98 ms | 104 / 100 ms | 276 / 287 ms |
| 5 x 100-residue peptides (3,705 atoms) | 1.23 / 1.26 ms | 364 / 386 ms | 0.66 / 0.65 ms | 3.12 / 1.87 ms | 158 / 153 ms | 254 / 280 ms |

Open .oct run again alone, three ways interleaved (60 runs): this branch 2.50 ms, b30f413 2.75 ms, v1.1.2 2.37 ms. The
first run's gap was the order of the runs. With 400 fields against their texts alone (datafields.check.ts): delete a
bond 1.41 / 1.31 ms, delete atoms 1.90 / 1.46 ms, copy and paste 0.43 / 0.36 ms; 241 SD records of 10 fields open in
315 ms, 353 ms with none.

## Cut from this item

- Attach to part of a structure (atoms, bonds or brackets, as ChemDraw can). Fields are per structure. A file's
  partial atom list is kept as read.
- Search operator, tag character and Chemically significant. No Octet search uses them, and none is asked for.
- Highlighting the linked atoms when the text is picked (26.1). Select linked objects does it in one click.
- Writing fields as Data S-groups in MOL and RXN, RD file data, CML properties.
- Attach data… on several structures at once in the dialog. The MCP's `edit` takes several ids.
- Annotate… on arrows, text, shapes and groups. Group annotations are kept as now but not edited.
- Expand generic structure to SDF giving each record the generic structure's fields.
- Showing "Name: value" on the page.
- Moving a row up or down in the dialog.
- Selecting every structure with a given field or value.
- SD files over 300,000 characters (the limit now).
- The record's name line from a field.
- Data S-groups in a molfile with query or polymer features (read by Octet's own V3000 reader).

## Files this item changes

New: `src/datafields.ts`, `src/datafields.check.ts`, `src/datafieldsmcp.check.ts`, and the dialog (with `Cells` in
a file both dialogs use). Changed: `src/render.ts` (type), `src/edit.ts`, `src/file.ts`, `src/cdxml.ts`, `src/chem.ts`,
`src/Editor.tsx`, `src/Actions.tsx`, `src/ChartDialog.tsx`, `src/numbering.ts`, `src/mcp.ts`, `src/editor.css`,
`src-tauri/src/main.rs` (one menu item), `scripts/look/sweep.js`.

`fix/1.2-bugs-int` changes `src/edit.ts` (`erase`), `src/cdxml.ts`, `src/render.ts`, `src/Editor.tsx` and `main.rs`.
None of its hunks is in the functions above, so a merge should be clean; the build checks it.

## Octet 1.1.2 with a 1.2 file (S19), run 17 November

From the v1.1.2 tag in a scratch folder, Octet 1.1.2's own readers on a drawing with three fields on aspirin (one
shown, two lines) and one shown field on ethanol:

- `parse` (.oct JSON) opens it with no error: the two shown values are text. Its `serialize`, read by this branch,
  gives both shown fields back, with their names. The hidden ones are gone, as planned.
- `readOct` on the .oct file (CDXML with the drawing inside) opens it, nothing left out.
- `fromCdxml` on the CDXML opens it, says it left out 2 annotations (the hidden fields), and keeps both texts with
  property type 23; its save, read by this branch, has both shown fields.

## ChemDraw 22.2 with Octet's files (S18), 17 November

Not done. ChemDraw 22.2 (running since 10:29, started by another session) opened no file this run: not Octet's CDXML
with fields, not its CDX, and not a plain two-atom CDXML. `open -g -a` returned at once and the AppleScript `open`
timed out, while `name of every document` still answered ("Untitled ACS Document 1996-1"). ChemDraw seems to wait on
a dialog that only the screen shows. Tried again at 12:28 with the lock: the same. The files are ready to check once
ChemDraw opens files again (Octet's CDXML and CDX with three fields on aspirin, one shown, and two on ethanol).

19 November: still not done. Another session held the ChemDraw lock for the whole finishing run.

## Open for Sam

- Deleting the shown text deletes the field (ChemDraw's way). The other way: deleting the text only hides it.
- The shown text is the value alone (ChemDraw's way). The other way: "Name: value".

## What's New lines (draft)

- To attach data to a structure, select it and choose **Attach data…**. Type a name and a value for each field.
- To show a field under its structure, turn on **Show** for it. Type over the text to change the value.
- When you save as SDF, each structure's fields are its data items. When you open an SD file, each record's data
  items are fields of its structure.
- To select the structure that a field's text belongs to, choose **Select linked objects**.
