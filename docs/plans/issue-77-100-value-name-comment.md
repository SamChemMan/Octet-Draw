# Live values without names (#77) and a document comment (#100)

Two gaps Stefan filed and Sam listed as not done after 1.1.2. Branch `item/77-100-value-name-comment`, from
`release-1.2-mcp` (b30f413), for 1.2 (Friday 20 November 2026). Plan written 17 November 2026. Checked again on
18 November: A1 to A6 and B1 to B6 are built, and 8 stress cases fail. What is left is in "State on 18 November"
and jobs C1 to C8.

- #77: a live value (Properties > Add to drawing) always shows the name of each quantity ("Molecular weight:
  180.16"). Stefan wants to hide it, so the value stands alone next to the structure.
- #100: Settings > Document > Properties has Title, Author and Keywords. Stefan also asked for a free comment.

## What ChemDraw gives (checked 17 November 2026)

Sources: ChemDraw 26.1 help (Documents, Document Properties, Analysis and Properties, Captions), the public CDX
format specification (Comment, CreationUserName, Name), Octet's own lists of ChemDraw's menus and dialogs, and a
test in ChemDraw 22.2 on this Mac.

Property labels (#77):

- Structure and caption right-click: Analysis > Name, Chemical Formula, Exact Mass, Molecular Weight, m/z, Elemental
  Analysis, All. Octet has Properties > Add to drawing.
- Caption right-click: Auto-update (the text follows its structure). Octet: a value added for a whole structure is
  always live. Typing over it makes it plain text.
- Caption right-click: Position… (a dialog). Octet: the value moves as any text.
- File > Document Settings > Property Labels: the words put in front of each pasted property, for the whole
  document, editable, with Restore Defaults. CDXML keeps them as the `ChemProp…` attributes on the document (Octet
  writes ChemDraw's default words there today). An empty word gives the value alone. This is ChemDraw's only way to
  hide the name. Object > Object Settings has the same Property Labels tab for the picked objects only (checked
  again 18 November), so ChemDraw can also hide it for one label.
- No default key for any of these.
- Analysis window: Decimals (0 to 8). Octet has Decimals in the Properties panel.

The document comment (#100):

- ChemDraw keeps a document comment in the document's `Comment` property (CDX tag 0x0009, on the document object,
  read and written since ChemDraw 7.0; in CDXML an attribute of the root `CDXML` element).
- ChemDraw asks for it when the user saves, if Preferences > Open/Save > Prompt for Comment is on (the Set Document
  Comment dialog).
- File > Document Annotations: keyword and content pairs on the document. Octet's Title, Author and Keywords are
  annotations of this kind, so ChemDraw shows them there.
- File > Document Properties: typed rows (name, value, type, rule), up to 100. Octet: missing (cut, below).

ChemDraw 22.2, 17 November 2026: a CDXML with `Comment` on the root (two lines, é, →, 日本, `&`, `\`, brackets),
opened and saved as CDXML, kept the whole comment. ChemDraw writes the line break as a literal line feed inside the
attribute. A CDX with the comment as Octet writes it kept it too. In a CDX, ChemDraw read the comment right when its
bytes were UTF-8, and dropped ë and ö when they were Mac Roman. A comment of 10,000 characters came back whole.

## What the branch has and what is missing

#77:

- `src/proprows.ts:90-102` `propertyRuns` always writes `${rowLabel(r)}: ` before each value (line 96).
- `src/proprows.ts:108-128` `liveValues` works the rows out again; it has no option for names.
- `src/Editor.tsx:7743-7766` `addProperties` writes `{ rows, places }` and nothing else.
- `src/Properties.tsx:87-95` the panel's foot has Add to drawing, Copy report, Find hazards and Decimals.
- `src/Actions.tsx:435-446` the caption actions have nothing for live values.
- `src/mcp.ts` has no live values: `read` (line 3274) does not say a text is live, `edit` cannot change one, and no
  operation adds one.
- `src/file.ts:113-118` and `:435`: a `property.attrs` key other than `ChemicalPropertyType`,
  `ChemicalPropertyIsActive`, `Name`, `rows` and `places` makes the drawing data "damaged". Octet 1.1.2 has the same
  rule (tried 17 November with its reader). Its `readOct` then reads the CDXML copy in the .oct instead, as a file
  from ChemDraw (`foreign`), and can give the drawing the user's style. So a new key there is not possible.

#100:

- `src/experiment.ts:22` `PROPERTIES` is Title, Author and Keywords; `oneLine` (line 27) makes every value one line
  of 200 characters. It cuts by UTF-16 unit, so a title of 199 letters and an emoji keeps half the emoji.
- `src/SettingsWindow.tsx:572-579` a `TextField` for each property; `src/Fields.tsx:52-65` `TextField` is one line
  of 200 characters.
- `src/Editor.tsx:1485` sends `detailsOf(…, PROPERTIES)` as the PDF's `info`; `src-tauri/src/export.rs:80-86` and
  `:145-157` write Title, Author and Keywords only.
- `src/cdxml.ts:1157-1170` the root `CDXML` element has no `Comment`; `src/cdxml.ts:122` turns line breaks in every
  attribute into spaces (the XML rule), so ChemDraw's two-line comment would read as one line.
- `src/cdx.ts:388` strings are Mac Roman unless a character needs UTF-8; only annotations are always UTF-8.
- `src/file.ts:406-410` an annotation with a tab, a carriage return or more than 10,000 characters makes the .oct
  data "damaged" (1.1.2 the same).
- `src/mcp.ts:507-510` `set_style` takes `properties {title, author, keywords}` (200 characters each); `read` does
  not give the properties back.

Neither feature exists. The gap is confirmed.

## State on 18 November

Built and committed on this branch (d12897f, c83567b, f697a7d, 40687a2, 2980783, f8b40ed): jobs A1 to A6 and B1 to
B6 below. These pass: `livenames.check.ts`, `doccomment.check.ts`, `mcp.check.ts`, `cargo test` (the PDF's
properties and comment), `npm run look` (every control matches), the 1.1.2 cases with `OCTET_112` (S6, S23, S33) and
the ChemDraw 22.2 round trips (S7, S22, S29, S30). The live update of 40 values takes 12.7 ms in 1.2 and 12.9 ms in
1.1.2. Hide on 40 values takes 46 ms, the same as one live update of them.

`valuename-stress.check.ts` fails 8 of its 57 cases, so `npm test` fails. Each failure and the requirement it breaks:

| Case | What happens | Requirement it breaks |
| --- | --- | --- |
| S18 | `run_command caption.names` on `a1` (no such arrow) hides the names of `t1`. `idsOf` in `mcp.ts` takes any text, arrow or box with the number, whatever its letter, so `delete a1` deletes `t1` too. | A5: an id that names nothing is named in the result, and nothing changes. |
| S19 | `change replace` on a structure keeps its value's text and drops its data. The old value stays under the new structure and never changes again. | A1: a live value stays live when its structure changes, here from the MCP. |
| S31 | A ChemDraw file with a root `Comment` and an annotation `Comment`: a change to any property deletes the annotation. | B3: the annotation stays an annotation and is written back as one. |
| N3 | ChemDraw's annotation with the keyword `Comment` (no root `Comment`) becomes the root `Comment` when the file is opened and saved again unchanged. | B3 and the CDXML round trip: a file saved again keeps ChemDraw's data where ChemDraw put it. |
| N1 | ⌘A on structures and their values gives the Structure context, which has no Hide property names. The command palette has nothing either. | A2: ⌘A, then the item changes every live value. |
| N2 | A comment typed in Settings is lost when Escape closes Settings (Chromium, as WebView2) or clears the search (WebKit): the field goes without a blur. | B2: the comment is set when the field loses focus. |
| N4 | U+FFFE and U+FFFF in a comment or title go into the CDXML. They are not XML characters, so a strict reader refuses the file. | B1, and the rule that every file Octet writes opens. |
| N5 | `edit` with `names` and `text` on a value says "Changed t1: names" and "t1 takes no names" in one result. | A5: the result says once what changed and what did not fit. |

`release-1.2-mcp` is 66 commits past b30f413 (trims in `Editor.tsx`, `mcp.ts`, `cdxml.ts`). This branch stays on
b30f413 and the integration session merges it. The jobs left are small hunks so that the merge stays simple. No hunk
of `fix/1.2-bugs-int` touches the lines they change.

## Rules every part keeps

- A file from 1.2 opens in Octet 1.1.2 from its own drawing data (never the CDXML copy), and nothing 1.2 adds makes
  1.1.2 call it damaged. Checked with 1.1.2's reader.
- Every opened or pasted file is hostile: limits on length, no control characters, no lone surrogates, a bad value is
  left out and counted (the "Octet left out …" notice), never a crash.
- Each user change is one undo step. The live update stays inside the step it follows (`amend`).
- Copy, paste, duplicate, Option-drag, cut, delete, move, flip, rotate, align, colour and text styles keep the new
  data where they keep a live value today.
- No speed regression against 1.1.2 on live values, file reading or writing.
- No new default key. Labels are short, British English, Simplified Technical English. Every menu is `Menu.tsx`.
- MCP changes stay small and in their own hunks.

## Jobs

Each job is done when its line holds and its checks pass.

### A1. A live value can hide its names

- A live value has a names setting. Off: each line is the value alone ("180.16", "C₆H₆" with its subscripts).
- A predicted value keeps its mark after the value ("1.19 (predicted)"), as Add to drawing, Copy and the report mark
  predicted values today.
- It stays live: a change to the structure works the values out again, still without names. The decimals and a
  style on all of its text stay, as now.
- The setting goes for the whole value (every row of it). It is kept in `property.attrs.rows` as the token
  `-names` (decision D1). Tokens that are not rows are ignored.
- ChemDraw's own live property text (from a ChemDraw file, no `rows`) is not changed by any of this.
- Checks: `livenames.check.ts`.

### A2. Hide property names and Show property names

- The Actions panel and the right-click menu (the same `actionItems`) show the item when the picked text includes a
  live value: "Hide property names" while one of them shows names, else "Show property names".
- It changes every picked live value and nothing else, as one undo step, and the text changes at once (decision D4).
- Settings > Keys lists it ("Show or hide property names"), with no key. The command palette finds it.
- ⌘A then the item changes every live value in the drawing.
- Checks: `livenames.check.ts` (the change, undo, mixed text), the app at port 1463 (panel and right-click, light and
  dark), `npm run look`.

### A3. Names in the Properties panel

- The panel's foot has Names beside Decimals: a toggle in the panels' own form (`spectrum-button` with
  `aria-pressed`, as Solvent peaks and Peak list). Changed in the build: BRAND.md (Controls) says a toggle that sits
  beside fields in a panel is a segmented control of one, so the `Switch` of Settings was the wrong control here. It
  is on until turned off, and Octet remembers it as it remembers Decimals (`settings.propertyNames`, unset is on).
- Add to drawing writes the values with or without names as the switch says, live ones with the token. A value for
  part of a structure (not live) follows the switch too.
- The panel's own rows, Copy and Copy report always show the names.
- Checks: `livenames.check.ts` (what Add to drawing writes), the app, `npm run look` (the foot in light and dark,
  the switch the same as every other switch).

### A4. Files keep it

- .oct, CDXML and CDX keep the token with the value (Octet's own data). Copy and paste in one window and between
  windows keep it. The PDF and PNG exports keep it in the CDXML they carry.
- ChemDraw sees the text alone, as drawn. Octet 1.1.2 opens the file (decision D1).
- Checks: `livenames.check.ts` (round trips, and the rule 1.1.2's reader applies), the 1.1.2 reader on a 1.2 file
  (scratch script against the `r112` worktree), ChemDraw 22.2.

### A5. MCP

- `read`: a live value's text item gets `values: { rows, decimals?, names? }` (`names: false` only when hidden).
- `edit`: `names` (true or false) on text ids. On text that is no live value, the result says it did not fit.
- `run_command`: `caption.names` (the Actions item) on ids.
- `advanced` `add_values { ids, rows, decimals, names }`: Add to drawing for those structures (each gets its own
  value under it, live), with values from a new `host.values(m, atoms, places, cas)`, the function the editor's live
  update already uses (decision D6). The editor's calculator wrapper moved to `proprows.ts` (`calculated`) so the
  headless host gives the same values.
- Checks: a block of its own at the end of `mcp.check.ts`.

### A6. As fast as 1.1.2

- The live update on 40 paclitaxels, each with a value, is no slower than 1.1.2 (median of interleaved runs), names
  shown or hidden.
- Hide property names on one value takes less than a frame (16 ms) on a paclitaxel. On all 40 values at once it takes
  no more than one live update of those 40 values (the work the change causes 250 ms later today).
- A 500-residue peptide with a value: one change gives one live update, names shown or hidden.
- Checks: a timing block in `livenames.check.ts` (Octet's own work, with a stand-in for Indigo), and the app for the
  Indigo part.

### B1. The comment is a document property

- `PROPERTIES` gets Comment. It is an annotation, as Title is the annotation `Title`. Its keyword is `Document
  comment` (D9, job C3; it was `Comment` until 18 November).
- A comment keeps its lines. A line break is a line feed (`\r\n` and `\r` become `\n`). A tab becomes a space. Other
  control characters and lone surrogates go. The ends are trimmed. It is at most 10,000 characters (UTF-16 units,
  the readers' limit), cut where no character is split. An empty comment takes the annotation away.
- `oneLine` (Title, Author, Keywords and the experiment details) also cuts where no character is split.
- An own template made from an experiment page has no comment (it keeps only the experiment details, as now).
- Checks: `doccomment.check.ts`.

### B2. Comment in Settings

- Settings > Document > Properties: Title, Author, Keywords, then Comment, a field of several lines across the row
  (`TextField` with `lines`, which gives a textarea in the same look; decision D7).
- Return makes a new line. The comment is set when the field loses focus, as one undo step. The field takes 10,000
  characters.
- Settings search finds it by comment, description, notes, subject.
- Checks: the app, `npm run look` (light and dark; the field the same as the other text fields).

### B3. CDXML

- Octet writes the comment as the root `Comment` attribute, ChemDraw's document comment (decision D2), and not as an
  `annotation`.
- Octet reads the root `Comment` with its line breaks: the XML reader keeps line breaks in `Comment` (the one
  attribute that has them) and makes them `\n`. Then B1's rules apply.
- A file with a root `Comment` and an `annotation` with keyword `Comment`: the root one is first and is the comment;
  the other stays an annotation and is written back as one.
- A comment longer than 10,000 characters is left out and counted ("Octet left out 1 comment").
- Checks: `doccomment.check.ts`, ChemDraw 22.2.

### B4. CDX

- The comment goes in tag 0x0009 on the document, always as UTF-8 (as annotations are), as ChemDraw read it right in
  that form. The reader already makes `\r` a line break.
- Checks: `doccomment.check.ts`, ChemDraw 22.2.

### B5. PDF

- The comment is the PDF's Subject in its document information (decision D3). A PDF with a comment and nothing else
  set still gets document information. A PDF of several pages (an experiment page and its risk assessment) the same.
- `pdf-writer` writes it: printable ASCII as a literal string with `(`, `)` and `\` escaped, anything else (line
  breaks, é, 日本) as UTF-16 with a byte order mark.
- Checks: `cargo test` in `export.rs` (Subject written, escaped and in UTF-16; absent when empty).

### B6. MCP

- `set_style` and `advanced set_style`: `properties.comment` (up to 10,000 characters, several lines). The result
  names it ("Octet set the drawing's comment").
- `read` gives `properties { title, author, keywords, comment }` when any is set.
- Checks: the MCP block in `mcp.check.ts`.

## Jobs left (18 November)

Each job fixes stress cases that fail. Each is its own commit.

### C1. An MCP id names an object of its own kind (S18, decision D10)

- In `idsOf`, `t5` is text 5 only, `a5` is arrow 5 only (and `g5` its reagent table), `b5` is box 5 only. A letter
  and number that name nothing of that kind are unknown: the tool says "There is nothing with the id a1" and changes
  nothing.
- One condition in `idsOf`. Every tool that takes ids gets it. The report tells the MCP review session.
- Done: S18 passes. `delete a1` in a drawing with `t1` and `a2` deletes nothing. `mcp.check.ts` passes whole.

### C2. Replace keeps a live value live (S19)

- `replaceStructure` keeps each of Octet's live values under the old structure (text with `property.attrs.rows`) as
  a live value of the new one: `property.atoms` are the new atoms, and `rows` (with `-names`) and `places` stay. It
  works their text out at once with `host.values`, as `add_values` does (D4), so a read straight after the replace
  gives the new values.
- ChemDraw's own live property (no `rows`) is plain text after a replace, as now.
- Done: S19 and N18 pass.

### C3. The comment has a keyword of its own (S31, N3, decision D9)

- The drawing keeps its comment as the annotation with the keyword `Document comment`, in memory and in .oct.
  Settings still calls the field Comment.
- CDXML and CDX: Octet writes the comment as the root `Comment` (tag 0x0009), never as an annotation, and reads the
  root `Comment` into it, as now. An annotation with the keyword `Comment` from any file is someone's annotation:
  Octet keeps it, writes it back as an annotation, and does not show it in Settings.
- Done: S31, N3 and N17 pass. The checks that name the keyword take it from `PROPERTIES` and pass. S6, S23 and S33
  pass again with `OCTET_112`.

### C4. ⌘A on structures and their values offers the item (N1)

- The Structure context gets `values` (`valuesPicked`). Its items get Hide property names or Show property names as
  a small action when the picked text includes a live value, as the mixed selection has it. The command palette then
  finds it.
- Done: N1 passes. In the app at port 1463: an aspirin with a value, ⌘A, and the Actions panel, the right-click menu
  and the command palette ("property names") give the item; light and dark; `npm run look`.

### C5. Settings keeps what was typed when the field goes without a blur (N2, decision D11)

- `TextField` (`Fields.tsx`) uses what was typed when it is removed while it has the focus, as it does when it loses
  the focus: one change, one undo step. It is the only text field in Settings, so Title, Author, Keywords and Comment
  all get it.
- Done: N2 passes. In the app: type two lines in Comment and press Escape: Settings closes and the comment is kept;
  Undo takes it away in one step. Search for "comment", type in the field, press Escape: the search clears and the
  comment is kept.

### C6. Every CDXML Octet writes is XML (N4)

- `clean` in `cdxml.ts`, which every text and attribute goes through, also drops U+FFFE and U+FFFF. `oneLine` and
  `cleanComment` drop them too, so the drawing, the PDF and the files have the same text.
- Done: N4 passes. `toCdxml` on 40 paclitaxels is no slower than before (median of interleaved runs).

### C7. One answer for edit with names and text (N5)

- New text over a live value makes it plain text, as now. `names` in the same `edit` is not used: the result says
  once that the new text is plain text, which takes no names, and does not list names as changed.
- Done: N5 passes.

### C8. Finish

- `npm test` passes whole (`valuename-stress`: 59 of 59). `cargo test` passes. The app at port 1463 for C4 and C5,
  light and dark, with a clean console. `npm run look`: every control matches. The cases with `OCTET_112` pass.
- ChemDraw 22.2 is not needed again: the CDXML and CDX Octet writes change only for U+FFFE and U+FFFF (C6) and for a
  file that has an annotation `Comment` (C3), which goes back as ChemDraw wrote it.

Done on 18 November (C1 to C7 in 4849b68 to 09d16de): `npm test` 164 of 164 check files, `valuename-stress` 59 of 59
with and without `OCTET_112` (v1.1.2), `cargo test` 155 passed. `npm run look`: every control matches in 23 places.
At port 1463 in Chromium (light and dark) and WebKit: ⌘A on an aspirin and its value gives Hide property names in the
Actions panel, the right-click menu (Molecule and copy) and the command palette, and Undo and Redo are one step each.
Escape that clears the Settings search and Escape that closes Settings both keep the typed comment, and one Undo
takes back one comment change. The console has no errors and no `look:` lines.

### State on 19 November (for 1.1.3)

The branch is bd7c684 (`release-1.2-mcp` after the 1.2 bug sweep and the trim) plus this item's commits, with no merge
commits. Five files had conflicts (imports in `host.ts`, `Actions.tsx`, `Editor.tsx`; the end of `mcp.check.ts`; four
hunks of `mcp.ts`). Each keeps both sides: the trim's `plainOf` and imports, #164's symbol tests and grid commands,
and this item's lines. `calc` moved to `proprows.ts` (`calculated`) is the same function as bd7c684's.

Fixed on 19 November, from the review:

- The Comment, Title, Author and Keywords fields called the `onAnnotations` that Settings' memo kept, which held the
  drawing as it was when the annotations last changed. A live value worked out or an AI app's change while Settings
  was open came undone when a property was set. They call the latest one now.
- The Names toggle's tip says what a click does, as Solvent peaks and Details do.
- `add_values` is an op of `change` too, so one call draws a series and adds their values.
- A length refusal of text with emoji says that an emoji counts as 2 (Octet counts UTF-16 units, the files' unit; a
  JSON Schema validator counts code points).

Checks on 19 November: `valuename-stress` 59 of 59, with and without `OCTET_112` (S15b: live update of 40 values
13.44 ms in 1.2, 13.47 ms in 1.1.2). Against bd7c684 (interleaved medians, 40 paclitaxel-sized structures with values):
the live update 13.2 against 13.2 ms, `toCdxml` 14.4 against 14.4 ms, `parseXml` 4.50 against 4.48 ms. With AI off
(release-1.1.3's switch applied for the check only): `npm test` passes but for `libreoffice.check.ts`, which fails only
because that switch also sets the version to 1.1.3; `npm run look` at port 1463: every control matches in 22 places.
In Chromium at port 1463: ⌘A on an aspirin with its value and an ethane gives Hide property names in the Actions panel;
it hides the names at once, and Undo and Redo are one step each; the command palette finds Show property names after
⌘A; the right-click menu on the value has it; Escape that clears the Settings search and Escape that closes Settings
keep the typed comment, and one Undo takes back one comment change. No console errors.

## Design decisions

- **D1. The names setting is a token in `rows`.** Octet 1.1.2 refuses any new key in a live value's `attrs` (A4), and
  a new key on the caption itself would be dropped when 1.1.2 saves. `rows` is a string 1.1.2 keeps as it is in
  .oct and CDXML, and it skips keys it does not know. So with `rows: "formula weight -names"`, 1.1.2 opens the
  drawing from its own data, shows the values with names (its live update writes them back about 250 ms after it
  opens the file), keeps them live, and keeps the token when it saves. 1.2 opening that file hides the names again.
  Tried with 1.1.2's reader and live update on 17 November. The token cannot be a row key (no key starts with `-`).
- **D2. The comment is ChemDraw's `Comment` in CDXML and CDX.** It is ChemDraw's own document comment, ChemDraw 22.2
  keeps it, and a comment written in ChemDraw then reads into Octet. Writing it as an annotation as well would show
  it twice in ChemDraw. Cost: Octet 1.1.2 ignores the root `Comment` in a CDXML or CDX file (it keeps it in .oct).
- **D3. The PDF key is Subject.** The PDF document information has no Comment key (ISO 32000-1, 14.3.3: Title,
  Author, Subject, Keywords, Creator, Producer, dates, Trapped). XMP maps Subject to `dc:description`, the
  description of the document, which is what a free comment is. Readers show Subject in their document properties
  (Acrobat, Preview), so the comment is seen without opening the drawing (#100). A custom key would not be shown.
- **D4. Hide property names works the text out at once,** for the values it changes only, with the editor's live
  update function. Waiting for the next live update would leave the old text on screen for 250 ms. If A6's budget
  is not met, Octet says so in the report and the change waits for the live update instead.
- **D5. Names are per value, for all its rows.** A value of several rows is one text. To hide one row's name only, add
  that row as a value of its own. ChemDraw's Property Labels words (for the document, or for the picked objects in
  Object Settings) are cut (below).
- **D6. `add_values` in `advanced`.** Add to drawing is in the app since 1.1.2 but not in the MCP. The names setting
  is new at add time, so the MCP needs the add too. It takes rows and decimals as arguments and never reads or changes
  the user's panel settings.
- **D7. The comment field is `TextField` with `lines`.** One text field component in the same look, so Settings gets
  no one-off control. Return makes a new line there (the Feedback and peak-list fields do the same).
- **D8. A comment over the limit from a file is left out and counted,** as an annotation over the limit is. Cutting
  it would change a colleague's text without saying so.
- **D9. The comment's keyword is `Document comment`, not `Comment`.** ChemDraw's Document Annotations takes any
  keyword, `Comment` too, and that annotation is not the document comment. With one keyword for both, Octet cannot
  tell them apart, so it moved a user's annotation to the root (N3) or deleted it (S31). No file with the old keyword
  was released, so the change costs nothing. Octet 1.1.2 keeps an annotation it does not know and writes it back, so
  it still keeps the comment in .oct; in a CDXML that 1.1.2 writes, ChemDraw shows it as the annotation `Document
  comment`. The name is ChemDraw's own for this thing (its Set Document Comment dialog). Cost: a ChemDraw annotation
  with the keyword `Document comment` reads as the comment. That is unlikely, and its text stays in the file.
- **D10. An MCP id's letter must match its kind.** Read gives every object its letter. A wrong letter is a mistake of
  the AI app, and acting on another object is the worst answer to it (`delete a1` deleted `t1`). One condition in
  `idsOf` fixes it for every tool. It is older than this item; the fix is here because S18 found it.
- **D11. `TextField` uses typed text when it goes away.** Return makes a new line in Comment, so Escape is the natural
  way out of it. The fix is in the field, not in Settings' Escape key, so it covers every way the field goes (Escape
  to close, Escape to clear the search, closing the window).

## Every word added to the UI

- Actions panel and right-click: Hide property names, Show property names.
- Properties panel: Names (its switch is "Property names" to a screen reader).
- Settings > Document > Properties: Comment. Settings > Keys: Show or hide property names.
- Notice (existing form): Octet left out 1 comment.

## Consistency: the siblings

A live value (A1 to A5):

- Made by: Properties > Add to drawing (whole structure: live; part: plain text that follows the Names switch), MCP
  `add_values`.
- Changed by: the Actions panel, the right-click menu, Settings > Keys, ⌘A then the item, MCP `edit names`, MCP
  `run_command caption.names`. Typing over it makes it plain text, as now.
- Keeps the setting through: undo and redo, copy and paste (same window, another window, a new drawing), cut,
  duplicate, Option-drag, move, nudge, flip, rotate, align, colour, font, size, bold, italic, Clean Up, adding or
  deleting atoms of its structure. Deleting the whole structure deletes its value too, as it deletes its number (corrected
  in the build: that is what `erase` has always done with text under a structure).
- Files: .oct, CDXML, CDX, the clipboard (Octet's CDXML and CDX, the PDF's and PNG's CDXML). MOL, SDF, SMILES and
  InChI carry no text. SVG, PNG and PDF pictures show the text as drawn.
- Dark mode: the canvas text uses the document's ink; the panel's switch and the Actions row use the tokens.

The document properties (B1 to B6): Title, Author, Keywords and Comment act the same in Settings (a row each, one
undo step), in .oct (an annotation each), in CDX and CDXML (annotations; the comment the root `Comment`), in PDF
(Title, Author, Keywords, Subject), in the MCP (`set_style` and `read`), in templates (dropped) and on the clipboard
(not carried). An experiment page keeps Title and Author as details, as now.

## MCP surface

| Tool | Change |
| --- | --- |
| `read` | text items: `values { rows, decimals?, names? }` for a live value; the drawing: `properties { title, author, keywords, comment }` when set |
| `change` `edit` | `names` (boolean) on live value text ids |
| `change` `run_command` | `caption.names` in the action list |
| `advanced` `add_values` | `{ ids (structures), rows (keys from the Properties panel), decimals (0 to 8), names }`, live values under each structure, one undo step |
| `advanced` `set_style` | `properties.comment` (10,000 characters) |
| `help` | the descriptions of the above |

Bad arguments: an unknown row key is refused with the list of keys; decimals out of 0 to 8, a `names` that is not
true or false, a comment over 10,000 characters and an unknown property are refused by the schema; ids that are no
structure or no live value are named in the result.

## Files

| Format | What 1.2 writes | Octet 1.1.2 opening it | ChemDraw opening it |
| --- | --- | --- | --- |
| .oct | the token in `rows`; the comment as the `Document comment` annotation (no tab, no `\r`, at most 10,000) | opens from its own data; shows the names (and keeps the token); keeps the comment as an annotation it does not show, and saves both | (.oct is CDXML) as CDXML |
| CDXML | the token in Octet's data on the text; the comment as the root `Comment` | keeps the token; ignores the comment | the value as plain text; keeps the comment (tried) |
| CDX | as CDXML (Octet's data tag; tag 0x0009 in UTF-8) | as CDXML | as CDXML (tried) |
| MOL, SDF, SMILES, InChI | no text, no comment | as now | as now |
| PDF | the text as drawn; Subject; the CDXML inside as above | not read | not read |
| PNG, SVG | the text as drawn; PNG's CDXML as above | as now | as now |
| Clipboard | the value as in CDXML; no document properties | as CDXML | the value as plain text |

## Stress list

#77:

1. Hide the names, then add an atom to the structure: the value changes, still without names.
2. Add (names off), change the structure, Show property names, then Undo three times and Redo three times: each step
   shows the right text and setting, and the live update adds no undo step.
3. Type over a value with hidden names: it becomes plain text with what was typed.
4. Copy a structure and its value, paste in another window: live, names hidden. Copy the value alone: plain text.
5. Delete the structure: its value goes with it, as its number does. Undo: both come back, live, names hidden.
6. Save .oct with hidden names, open it in 1.1.2: it opens from its own data (not the CDXML copy), shows names,
   stays live; save in 1.1.2 and open in 1.2: names hidden.
7. ChemDraw 22.2 opens Octet's CDXML and CDX with a hidden-names value: the value alone as text, no warning.
8. Pick a value with names, a value without names and plain text: the item says Hide property names; it hides both
   values and leaves the plain text; again: Show property names shows both.
9. A value on a structure Indigo cannot read (an R-group label): the setting changes, the text stays, nothing fails;
   it is right once the structure reads.
10. A value with the CAS row while the names engine loads: the change waits for it, the number stays.
11. logP, MR and the other predicted rows with names hidden: "1.19 (predicted)".
12. A bold, red, 14 pt value in Times turned 30°: after the change it is still bold, red, 14 pt, Times, turned 30°,
    and in the same place.
13. A hostile .oct: `rows` at its 200-character limit filled with `-names`, unknown tokens, only `-names`: it opens;
    unknown tokens are skipped; a value with no known rows keeps its text. A CDXML `rows` cut at 200 characters
    in the middle of a token: the half token is skipped.
14. Fast input: Hide and Show twenty times quickly: it ends as the count says, each is one undo step, and no old text
    comes back 250 ms later.
15. 40 paclitaxels with a value each: ⌘A, Hide property names, within A6's budget; editing one structure updates its
    value no slower than 1.1.2.
16. A 500-residue peptide with a value: hiding the names costs one live update.
17. Zoom 10% and 800%: the shorter value stays centred under its structure.
18. MCP: `edit names` on plain text, `names: "no"`, `add_values` with `rows: ["weight", "nope"]`, `decimals: 9`,
    ids of an arrow: each refused with a reason; nothing changes.
19. Two AI sessions: one hides the names of t5 while the other edits t5's structure: the value is right and hidden.
20. Dark mode: the Actions row, the right-click menu and the panel's switch read at 4.5:1 and look as their siblings.

#100:

21. Empty, or only spaces and line breaks: no annotation, no `Comment`, no Subject.
22. Three lines with an empty middle line: the same three lines through .oct, CDXML, CDX, PDF and ChemDraw.
23. A comment pasted from Excel with tabs: spaces; the .oct opens in 1.2 and 1.1.2 from its own data.
24. `\r\n` and `\r` line ends (Windows, an old Mac file): line feeds.
25. 10,000 characters: kept. 10,001 typed or pasted: the field stops at 10,000. From the MCP: refused.
26. An emoji across the 10,000th place, and a title of 199 letters and an emoji: no half character; PDF export works.
27. A lone surrogate from a hostile CDXML (`&#xD800;`): the file is not XML (a character reference must name an XML
    character), so Octet refuses it, as it does for that reference in any attribute. A lone surrogate typed or from
    the MCP: dropped; PDF export works.
28. PDF escaping: `a (b) \c )(` gives a literal string that reads back the same; `é`, `日本` and a line break give
    UTF-16.
29. `< > & " '` and `]]>` in CDXML: escaped; ChemDraw keeps them (tried with `&` and `\`).
30. A ChemDraw CDXML whose `Comment` has a literal line break: Octet shows two lines.
31. A ChemDraw file with a root `Comment` and an annotation `Comment`: the root one shows; saving keeps both.
32. A hostile CDXML with a `Comment` of 1 MB: the file opens; "Octet left out 1 comment".
33. Octet 1.1.2 opens a 1.2 .oct with a comment: from its own data; the comment survives its save. A 1.2 CDXML: the
    comment is lost in 1.1.2 (D2).
34. Edit the comment, Undo, Redo: one step each.
35. The MCP sets the comment while Settings is open: the field shows it, unless the user is typing in it; then the
    user's text wins when the field loses focus.
36. Two AI sessions: one sets the comment, the other the keywords: both kept.
37. Make an own template from an experiment page with a comment: the template and new pages have none.
38. Copy from a drawing with comment A and paste into one with comment B: B keeps B.
39. An experiment page with its risk assessment exported as PDF: one Subject.
40. Settings search for "comment", "description" and "notes" finds the field.

`valuename-stress.check.ts` also runs N1 to N16, cases found while it was written. Two more for the jobs left:

41. (N17) A .oct that 1.1.2 saved from a ChemDraw file with the annotation `Comment`: 1.2 opens it with an empty
    Comment in Settings, keeps the annotation, and writes it back as an annotation.
42. (N18) Replace a structure whose value hides its names and has two decimals, and one with ChemDraw's live
    property: the first stays live, names hidden, two decimals, with the new structure's values at once; the second is
    plain text.

## Acceptance

| Check | Covers |
| --- | --- |
| `node src/livenames.check.ts` | A1, A3 (what Add to drawing writes), A4 round trips and 1.1.2's attribute rule, A6 Octet's part; stress 1–5, 8–14 |
| `node src/doccomment.check.ts` | B1, B3, B4; stress 21–27, 29–32, 37, 38 |
| `node src/docproperties.check.ts` (updated) | Title, Author and Keywords unchanged; oneLine cut |
| MCP block in `node src/mcp.check.ts` | A5, B6; stress 18, 19, 25, 35, 36 |
| `cargo test` (`export.rs`) | B5; stress 28, 39 |
| 1.1.2's reader (`r112` worktree, scratch script) | A4, B1; stress 6, 23, 33 (result in the report) |
| ChemDraw 22.2 (CDXML and CDX made by the branch) | A4, B3, B4; stress 7, 22, 29, 30 |
| The app at port 1463, and `npm run look` | A2, A3, B2; stress 2, 12, 14, 17, 20, 34, 35, 40 |
| Timing (interleaved medians against 1.1.2) | A6; stress 15, 16 |
| `npm test`, `cargo test`, console clean | everything |
| `node src/valuename-stress.check.ts` | C1 to C7; S18, S19, S31, N1 to N5, N17, N18 |
| `OCTET_112=<1.1.2 src> node src/valuename-stress.check.ts` | C3 against 1.1.2; S6, S23, S33 |
| `node src/mcp.check.ts` | C1 (`delete a1` deletes nothing), C2, C7 |
| The app at port 1463 (Chromium and WebKit), `npm run look` | C4, C5 |
| `toCdxml` timing on 40 paclitaxels, interleaved against b30f413 | C6 |
| `npm test`, `cargo test` | C8 |

## Cut from this item

- ChemDraw's Property Labels: a word of the user's for each property, for the whole document (Document Settings,
  with Restore Defaults) or for the picked objects (Object Settings), read from and written to the `ChemProp…`
  attributes. The words also rename a label ("Molecular Weight" to "MW"). Octet has neither the words nor renaming. It
  is a table of 19 words in two places and a reader for ChemDraw's words; #77 asks only to hide the name, which A1 to
  A3 do per value.
- Decimals for a value already on the page. Decimals applies when the value is added, as in 1.1.2.
- ChemDraw's Prompt for Comment on save and its Set Document Comment dialog. Octet's Comment is always in Settings.
- ChemDraw's Document Properties dialog (typed rows with rules). A project of its own.
- ChemDraw's Document Annotations dialog (every keyword and content pair). Octet keeps them all in its files and
  shows its four.
- The document properties in PNG text chunks, SVG `title` and `desc`, and the clipboard's PDF. Title, Author and
  Keywords are not there either; one item for all four later.
- The title, author and comment on Home's list of drawings.
- Hiding the name of one row inside a value of several rows (D5).
- ChemDraw's Auto-update on a caption, as a switch. In Octet, typing over a value stops it following, and Add to
  drawing makes a new live one. A switch to make plain text follow again needs its own design (what text it gets).
- ChemDraw's Analysis submenu on a caption's right-click (add one property there) and its Position… dialog. Octet
  has Properties > Add to drawing, and the value moves as any text.
- Text in a `NumberField` is lost in the same way as N2 when its field goes without a blur (1.1.2 the same). It is in
  many panels, where the field going can mean its object has gone, so it is an item of its own.
- `withDetails` replaces every annotation with a property's keyword, so a ChemDraw file with two `Title` annotations
  loses the second when any property changes (1.1.2 the same). An item of its own.
