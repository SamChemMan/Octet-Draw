# Issues 103 and 104: old drawing formats

Branch `item/103-104-old-formats`, from `release-1.2-mcp` b30f413. For release 1.2 (Friday 20 November 2026). The
branch is one commit behind `origin/release-1.2-mcp` (015b63d, the risk assessment). Nothing here touches that commit.

Stefan asked Octet to read five old formats. Issue 103: ISIS/Draw sketches (SKC) and ISIS transportable graphics
(TGF). Issue 104: Standard Molecular Data (SMD), MSI ChemNote (MSM) and ChemDraw 2.x and 3.5 (CHM). Reading only. He
rated both issues "lowest". Sam's comment of 9 November put them in File > More Formats.

## Result of the research

- Only SMD has a published specification. It is in journal papers that are not open access. Their text could not be
  reached for this plan. Octet can read SMD when Sam has the text of the paper (job J2). Without it, J2 is cut from
  1.2.
- SKC, TGF, MSM and CHM have no public specification and no reader under a permissive licence. Octet builds a reader
  only from a public source, never guesses a layout, and studies ChemDraw's own formats only for CDX, CDXML and the
  clipboard. So none of the four is built. "Public sources" below says what is missing for each.
- Two jobs can be finished this week without new sources:
  - J1. A text format that Octet reads itself (CIF and mmCIF today, SMD with J2) reads the same on every way in.
    Today CIF text does not read from a paste or from an AI app's `add_file`. A CIF file with Latin-1 bytes opens from
    File > More Formats but not from Finder or a drop. A damaged or oversized CIF file gets a general message on
    File > Open and a drop, so the reader's own reason ("This CIF file is damaged: …") never shows.
  - J3. The four formats Octet cannot read keep a safe refusal, checked with hostile files.

## What exists on the branch, and what is missing

Exists:

- `src/Editor.tsx` 2584–2593: the More Formats list, one line a format (id, name, icon, command). It shows only while
  Settings > Pro > More formats is on (2619, 3352). `more_cif` (Open CIF or mmCIF…) runs `openCif` (2219–2226).
  That asks Rust's `open_cif` for a file and opens it as a new drawing through `takeFiles` (1968).
- `src-tauri/src/main.rs` 597–609: `open_cif`. Filter `cif`, `mmcif`. 64 MB at most. Bytes that are not UTF-8 are
  replaced.
- `src/chem.ts` 199–224: `importStructure` reads CIF itself (`isCif` and `readCif`, `src/cif.ts` 49 and 271) before it
  hands text to Indigo. Every way in that ends in `importStructure` reads CIF: File > Open through `readFile`
  (Editor.tsx 2086–2094), a drop on a window (`dropFiles`, 2025), Finder, the Dock and Home (`take_opened`,
  `src-tauri/src/open.rs` 82), and an AI app's `drawings new {text}` (`opens`, Editor.tsx 7873–7876).
- `src-tauri/src/open.rs` 169–180: `read` refuses a file that is not UTF-8 text or CDX: "Octet cannot open NAME. It
  opens Octet and ChemDraw drawings (CDX and CDXML), ChemDraw template files, MOL, SDF, RXN, SMILES and InChI files,
  JCAMP-DX spectra, and pictures." A binary SKC or CHM file gets this today.
- Text that is not a drawing goes to Indigo. A text file that Indigo cannot read gives "Octet cannot open this file.
  Octet cannot read the structures in this file." SMD-shaped text run through `importStructure` on this branch is
  refused by Indigo. Octet 1.1.2 has the same path.
- `src/moreformats.check.ts` and `src/cif.check.ts` check the list's shape and the CIF reader.

Missing:

- A reader for SKC, TGF, MSM, SMD or CHM. `grep -rniI "skc\|\btgf\b\|chemnote\|\.smd\b\|\.msm\b\|\.chm\b\|isis" src
  src-tauri/src` finds none.
- CIF on two ways in (J1):
  - Paste. `structureFromText` (Editor.tsx 1296–1301) sends text of several lines to `parseStructure`, which does not
    test `isCif`.
  - An AI app's `add_file`. `host.file` (Editor.tsx 7856–7860, and `scripts/headless/host.ts` 327–330) reads CDXML,
    MOL, RXN and RDF, then names and SMILES. The tool's description and its error (`src/mcp.ts` 531–534, 2600–2601)
    name no CIF.
- Latin-1 bytes (J1). `read_text_or_cdx` (main.rs 403–410) refuses them on Finder, a drop and `--convert`. Open CIF or
  mmCIF… reads the same file.
- The reader's reason (J1). `readFile` (Editor.tsx 2090) and `dropFiles` (2025–2029) replace every error from
  `importStructure` with "Octet cannot read the structures in this file." So `readCif`'s "This CIF file is damaged: …"
  and "It has a structure of more than 1,000 atoms." never reach the user from File > More Formats, Finder or a drop.
  A paste shows the limit (`RangeError`) only. `add_file` shows its own general error.

Left as they are, by Sam's design: File > Insert… offers drawings and pictures (open.rs 150), File > Import… offers
the common structure files (main.rs 579), and `--convert` of a folder takes those same files (`convert.rs` 103–105).
Rare formats have their own line in More Formats, as Import a Connection Table… has.

## Public sources, format by format

Read on 17 November 2026.

| Format | What is public | What is missing |
| --- | --- | --- |
| SMD (Standard Molecular Data) | The specification: Bebak et al., J. Chem. Inf. Comput. Sci. 1989, 29, 1–5 (doi 10.1021/ci00061a002), and ACS Symposium Series 400 (1989) chapter 11 (doi 10.1021/bk-1989-0400.ch011). A revised draft, version 5.0: Barnard, J. Chem. Inf. Comput. Sci. 1990, 30, 81–96 (doi 10.1021/ci00065a018). None is open access. The abstracts say: modular information blocks, new blocks do not affect old ones, superatoms. A free blog post (iChemLabs, on SMD 4.2) describes a connection table block (`>CT`, a count line with two counts and two Fortran format strings, atom and bond records) and a coordinate block (`>CO`, units, an exponent and integer coordinates). Its code is marked untested and has errors. ChemDraw 8's help (CambridgeSoft, 2004) calls SMD 4.3 an ASCII format for Chemical Abstracts searches. | The paper's text: how a file starts and ends and how structures are separated; every block; the meaning of each atom field (the blog names the charge only); the bond order codes; stereo; coordinate units other than Ångström; superatoms; the Fortran descriptors allowed; what 4.3 and 5.0 change. |
| SKC (ISIS/Draw sketch) | That it is MDL's binary sketch format. Open Babel's request for it (ticket 56) has been open since 2007. Its maintainer wrote in 2009 that it is an undocumented, closed binary format. ChemAxon's Marvin reads it in closed code; its pages list features, never a layout. | Everything: the header, the object records (atoms, bonds, text, graphics, brackets, R-groups, arrows), coordinate units, the font and style tables, text encoding, byte order. No specification from MDL, Symyx, Accelrys or BIOVIA. MDL's CTfile Formats (1999, 2003, 2011 and BIOVIA 2026) cover MOL, SD, RXN, RD and XD files only. |
| TGF (ISIS transportable graphics) | That it is an ASCII form of the ISIS sketch for moving drawings between computers (ChemDraw 8 help, a German ISIS/Draw course page), MIME type `chemical/x-mdl-tgf`. | The whole grammar: record types, coordinate units, how atoms, bonds, text and graphics are written. |
| MSM (MSI ChemNote, "Molecular Simulations MolFile") | ChemDraw 8 help: an ASCII file that ChemNote uses; a `.mol` or `.msi` file must be renamed `.msm` for ChemDraw. QUANTA's documentation (a public mirror at Boston University) names ChemNote's `.mol` and `.pct` files without a layout. Open Babel reads Cerius2 `.msi` files. Nothing shows that ChemNote's file is that format, and Open Babel's code is GPL. | The whole layout. |
| CHM (ChemDraw 2.x and 3.5) | That ChemDraw 2.0, 2.1 and 3.5 wrote it, and that ChemDraw imports all three and exports 3.5. The public CDX specification covers CDX only. | The whole layout. |

If Sam wants the four later, the source would be the owner's documentation: BIOVIA (Dassault Systèmes) for SKC, TGF
and ChemNote, Revvity Signals for CHM, under terms that let Octet's Apache-2.0 code use it.

## ChemDraw cross-check

Sources read:

- `~/octet-research/notes/help26/text/Importing.txt`: the format table. ISIS (SKC, TGF, RXN) import and export; MSI
  ChemNote (MSM) and SMD import and export; ChemDraw 3.5 (CHM) import and export; ChemDraw 2.0 and 2.1 (CHM) import
  only. Edit > Insert File… takes the same types. ChemDraw Professional and Prime read ISIS sketches with R-Logic and
  leaving groups.
- `help26/text/Exporting.txt`: TGF and SMD take Text Options on save. SMD, MSI MolFile and CT expand nicknames and
  fragments on save.
- `help26/text/Export_Compatibility.txt`: the query properties ChemDraw writes to SKC and TGF.
- `help26/text/Setting_Preferences.txt`: Open/Save > Use Default File Format; Building/Display > Show Stereoflags When
  Opening MDL Format Files, Ignore Top Level Chiral Flag in MDL Format Files, Use Enhanced Stereochemistry When Saving
  to SKC File Format.
- `help26/diff-22-26.md` 1990–1991 and 2055: SKC and TGF hold enhanced stereo.
- `chemdraw26-inventory.md` 379–386, `chemdraw-inventory.md` 48: the formats ChemDraw opens and writes.
- `menus/live-menus.md` line 4: Edit > Insert File….
- `spec/` (the public CDX specification): no CHM.
- ChemDraw 8 help (CambridgeSoft, 2004, public mirror), read in search excerpts only: TGF and MSM are ASCII, SMD is
  version 4.3, `.msi` and `.mol` ChemNote files are renamed `.msm`.

Every option ChemDraw gives these formats, and what Octet does:

| ChemDraw | Octet |
| --- | --- |
| File > Open with SKC, TGF, MSM, SMD, CHM | SMD: File > More Formats > Open SMD… (J2, if the paper comes). The others: not built (no public source). |
| Edit > Insert File… with the same types | Octet's Insert… takes drawings and pictures. A file of a rare format comes in by its More Formats line, a drop or Finder. SMD follows CIF. |
| Open/Save > Use Default File Format (the type the Open dialog shows first) | Not added. Each Octet command has one filter, and Octet reads a file by its content. |
| Show Stereoflags When Opening MDL Format Files; Ignore Top Level Chiral Flag | MDL files only. If the SMD paper gives a chiral flag, Settings > Import and export > Stereo flags from the chiral flag applies to it the same way (`asOpened`, Editor.tsx 2179). |
| Use Enhanced Stereochemistry When Saving to SKC; Save As SKC, TGF, MSM, SMD, CHM 3.5; Text Options | Saving. The issues ask for reading only. Cut. |
| SMD, MSI MolFile and CT expand nicknames on save | An SMD file has no nicknames. Nothing to contract on read. |
| Query properties in SKC and TGF; R-Logic and leaving groups | SKC and TGF are not read. |
| `.mol` and `.msi` ChemNote files renamed `.msm` | Octet reads text by its content. A ChemNote file that is an MDL molfile opens through the MOL path today, whatever its name. Octet must not refuse a file by its extension alone (J3). |
| Palette, Object, Curves, Color and Text menus, context menu, CDXML attributes | None of their own. A reader makes ordinary atoms, bonds and text, which keep every option they have. |

No default key: ChemDraw has none for these formats.

## Rules every part keeps

- Every file is hostile. Limits on bytes, lines, fields, atoms, bonds, structures and nesting. A damaged file is
  refused with the reason, never half read. No `eval`, no `innerHTML`, no `unsafe` Rust.
- A reader is written from a public source only. Nothing is guessed. Test files are written by the checks themselves
  from the specification. No file from a paper, a supporting information or Stefan's archive goes into the repository.
- The opened drawing is Octet's own atoms and bonds. It saves to `.oct`, CDXML and CDX as any drawing does. Octet
  writes no new object, attribute or file type.
- A file reads the same on every way in: its More Formats line, Finder and the Dock, a drop on a window or on Home,
  `--convert` of that file, a paste of its text, and an AI app's `add_file` and `drawings new {text}`.
- No speed regression on paste, typing in the name field, File > Open or import (median of interleaved runs against
  `v1.1.2`).
- UI words are the menu's own: "Open SMD…". No new dialog, panel or setting. No tip or helper text.
- MCP changes are small and local to `src/mcp.ts` (descriptions and one error line) and the two `file` hosts.

## Design decisions

- D1. Only SMD, and only from the paper. The blog post alone leaves the atom fields and bond codes unknown. A reader
  built on it would guess. So J2 waits for the paper's text.
- D2. SMD goes where CIF went. `src/smd.ts` has `isSmd(text)` and `readSmd(text): Mol`, as `src/cif.ts` has.
  `importStructure` tests `isCif`, then `isSmd`, then hands the text to Indigo. So every way in that reads CIF reads SMD
  with no other change.
- D3. One open command for the text formats of More Formats. `open_cif` becomes `open_more(format)` with a fixed table:
  `cif` (CIF and mmCIF; `cif`, `mmcif`) and `smd` (SMD; `smd`). Any other name is refused. `openCif` becomes
  `openMore(format)`. One function serves both.
- D4. One test for "Octet reads this text itself". `isOwnFormat(text)` in `src/chem.ts` is `isCif(text) ||
  isSmd(text)`. `structureFromText` and both `host.file` functions send such text to `importStructure` first. Paste,
  the name field and `add_file` then read it as File > Open does. Only text of several lines is tested, so typing a
  name costs nothing more.
- D5. Latin-1 bytes. `open::read` reads a file whose extension is `cif`, `mmcif` (and `smd` with J2) with the bytes that
  are not UTF-8 replaced, as `open_cif` does. Other files keep the strict UTF-8 test, which refuses binary files.
- D6. No refusal by extension (J3). A file named `.skc`, `.tgf`, `.msm` or `.chm` takes today's path. Binary bytes are
  refused in Rust. Text goes to the readers by its content. A ChemNote file that happens to be an MDL molfile keeps
  opening. A message that names the format would need a list of extensions, and would refuse such a file.
- D7. SMD limits match CIF's (`src/cif.ts` 21–22): 1,000 atoms in a structure, 20,000 atoms and bonds in a file, 1,000
  structures. Also: lines of 1,000 characters at most, format strings of 200 characters, parentheses two deep, a
  repeat count of 1,000 at most, field widths from 1 to 80, 100 fields in a record, a coordinate exponent from 0 to 9,
  and finite coordinates under 1,000,000 Å. A count over a limit refuses the file before its records are read.
- D8. SMD layout. 2D coordinates are kept and scaled so the median bond is one bond length (`scaled`, chem.ts 226). 3D
  coordinates keep z as depth, as a 3D MOL file does. A structure with no coordinates, or with every atom at one point,
  is laid out as a SMILES is. Several structures go in a row, as CIF's data blocks do. Aromatic bonds, if the paper
  has them, are kekulised as CIF's are, then Settings > Import and export > Aromatic rings applies (`asOpened`).
- D9. A block that changes the chemistry and that Octet cannot apply (for example a stereo block Octet cannot map)
  refuses the file with the block's name. A structure is never shown wrong. A block that holds no chemistry (a name,
  a comment, data) is skipped. The title in a structure's header is dropped, as a MOL file's name line is.
- D10. Opened from More Formats, an SMD file opens as a new drawing named after the file, as a CIF file does. Octet
  cannot save over it, and it is not on Home's recent list.
- D11. A reader's refusal keeps its words. `cif.ts` and `smd.ts` throw `RangeError` for a limit (as `chem.ts` `over`
  does now) and a `DamagedFile` error (a new `Error` subclass in `cif.ts`) for damage. `readFile`, `dropFiles`, the
  paste's `refused` and `add_file` show those two messages as they are. Every other error (Indigo's own text) keeps
  today's general words. `host.file` lets the two through; `addFile` returns the message as its error.

## Jobs

Each job is done when its lines hold and its checks pass.

### J1. Text formats Octet reads itself read the same on every way in

Build now.

- A paste of a CIF or mmCIF file's text (⌘V, and into the name field) draws the same structures as File > More
  Formats > Open CIF or mmCIF…, selected, one undo step.
- An AI app's `add_file {text}` with CIF text adds the same structures. The tool's description and its error name CIF.
  The headless host (`scripts/headless/host.ts`) does the same.
- A damaged or oversized CIF file shows the reader's reason on File > More Formats, Finder, a drop, a paste and
  `add_file` (D11). Text no reader takes keeps today's words.
- A CIF file with Latin-1 bytes opens from Finder, a drop and `--convert` as it opens from its More Formats line.
- A single-line text in the name field takes no more time than in 1.1.2 (`isOwnFormat` is not called).
- Paste of a 300,000-character MOL text, and File > Open of it, take no more time than in 1.1.2, beyond noise.
- Checks: `src/filetext.check.ts` (new); `src/cif.check.ts` (`open_more`); `cargo test` (`open::read` and Latin-1).

### J2. SMD reader

Built only when Sam has the paper's text (D1). It must reach this branch by Wednesday 18 November at 18:00 for 1.2.

- The paper's answers are written into this plan first, as S1 to S9:
  - S1. How a file starts and ends, and how structures are separated.
  - S2. Every block, and which ones carry chemistry.
  - S3. The count line of the connection table.
  - S4. Each atom field: element, charge, isotope, hydrogens, radical, and the rest.
  - S5. Bond order and stereo codes.
  - S6. Coordinate units and the exponent. 2D and 3D.
  - S7. The Fortran descriptors allowed, and the rule when a block has none.
  - S8. Superatoms.
  - S9. What versions 4.2, 4.3 and 5.0 change. ChemDraw writes 4.3.
- `src/smd.ts`: `isSmd` and `readSmd` to S1–S9, with D7's limits and D8's and D9's rules. A Fortran format interpreter
  limited to the descriptors in S7.
- `importStructure` reads SMD after CIF (D2). `isOwnFormat` includes SMD (D4). `open::read` treats `.smd` as D5 says.
- File > More Formats > Open SMD… (`more_smd`, `FolderOpen` icon, after Open CIF or mmCIF…). Rust `open_more("smd")`
  (D3).
- MCP: `add_file` and `drawings new` descriptions name SMD.
- A false `isSmd` on every format Octet reads (CDXML, MOL V2000 and V3000, SDF, RXN, RDF, CML, SMILES, InChI, KET,
  CIF, mmCIF, JCAMP-DX, CT) and a false `isCif` on SMD.
- Checks: `src/smd.check.ts` (new); `src/moreformats.check.ts` (the new line); `src/filetext.check.ts` (SMD on every
  way in); `cargo test` (`open_more`).

### J3. Formats Octet cannot read are refused safely

Build now. No new code unless a check fails.

- A binary file named `.skc` or `.chm` gives today's refusal from Rust, on Finder, a drop, Insert… and `--convert`.
- A text file named `.tgf` or `.msm` goes to the readers by its content. Text no reader takes gives "Octet cannot read
  the structures in this file." An MDL molfile named `.msm` opens as a MOL file.
- Nothing hangs, nothing is half added, and the drawing is unchanged after a refusal.
- Checks: `src/filetext.check.ts` (the page's side); `cargo test` (`open::read` on random bytes named `.skc` and `.chm`).

## Consistency pillar: siblings

The siblings are the ways a file comes in, and the other text formats of More Formats.

| Way in | CIF today | CIF after J1 | SMD after J2 |
| --- | --- | --- | --- |
| File > More Formats line | yes | yes | yes |
| Finder, the Dock, command line, a second launch | yes (UTF-8 only) | yes | yes |
| Drop on a window (insert at the point) | yes (UTF-8 only) | yes | yes |
| Drop on Home (opens) | yes (UTF-8 only) | yes | yes |
| Drop on a Home tile (project) | refused: not a drawing | same | same |
| `--convert` of the file | yes (UTF-8 only) | yes | yes |
| Paste (⌘V), and paste into the name field | no | yes | yes |
| AI app `add_file {text}` | no | yes | yes |
| AI app `drawings new {text}` | yes | yes | yes |
| File > Insert…, File > Import…, `--convert` of a folder | not offered (rare format) | same | same |

What a structure that came from a file must do, as any drawn structure does: colour, ⌘A, hold to Select, undo and redo,
copy and paste in a window and between windows, duplicate, flip and rotate, align, delete, `.oct`, CDXML and CDX round
trips, dark mode, zoom. The readers make ordinary atoms and bonds, so these come from the existing code. The checks
below run them on the readers' output.

## MCP surface

- No new tool and no new argument.
- `advanced add_file {text}` and `change` op `add_file`: CIF (J1) and SMD (J2) text. Description and the error text
  name them.
- `drawings new {text}`: reads them already through `opens`. Its description names them.
- `run_command more_cif` and `more_smd`: these open a file dialog, so the MCP refuses them as it refuses every command
  whose name ends in "…" (`dialog`, Editor.tsx 7872).
- `read` and `export` are unchanged: Octet writes no SMD.

## File formats touched

- `.oct`, CDXML, CDX: no change. A drawing read from CIF or SMD holds atoms, bonds, charges, isotopes and coordinates
  only. Octet 1.1.2 opens it. ChemDraw opens its CDXML and CDX.
- SDF, MOL, SMILES, InChI, exports (PDF, PNG, SVG, EMF): no change.
- Clipboard: paste reads CIF and SMD text (J1, J2). Copy is unchanged.
- An SMD file opened in Octet 1.1.2: refused with "Octet cannot open this file. Octet cannot read the structures in
  this file." Nothing is drawn.
- SKC, TGF, MSM, CHM: unchanged (J3).

## Stress list

| # | Case | Expected |
| --- | --- | --- |
| 1 | An empty `.smd` or `.cif` file, from every way in | As an empty `.mol` file does today on that way in: "There are no structures in this file." Drawing unchanged. |
| 2 | A file of 64 MB and 1 byte | Refused in Rust before it is read: "This file is larger than 64 MB." |
| 3 | A 500-residue peptide (about 3,900 heavy atoms) as one SMD structure, and as one CIF block | Refused in under 10 ms (SMD at its count line): "It has a structure of more than 1,000 atoms." The same words on every way in (D11). |
| 4 | 40 paclitaxels with hydrogens (4,520 atoms, 40 structures) as SMD and as CIF | Opens. Median time no more than the same structures as an SDF file through Indigo. 40 structures in a row. |
| 5 | 1,001 structures, or 20,001 atoms and bonds | Refused. Never half read. |
| 6 | A count line that says 5 atoms over 3 atom records; or 3 over 5 | "This SMD file is damaged: …". |
| 7 | A bond to atom 0, to atom 99 of 5, to itself, or twice between one pair | Damaged. |
| 8 | Hostile format strings: `(999999A2)`, 1,000 nested parentheses, `(I0)`, `(I99999)`, an unknown descriptor, 10,000 characters | Refused in under 10 ms each. No hang, no stack overflow. |
| 9 | Coordinate exponent 300, −1 or text; a 40-digit integer; every atom at one point | Exponent and number: damaged. One point: laid out as a SMILES is. No NaN or Infinity anywhere. |
| 10 | CR line ends (an old Mac file), CRLF, tabs, trailing spaces, Latin-1 names | Reads as the LF file reads. |
| 11 | CIF text with `>CT` in a comment; SMD with a title that starts `data_` | Each read by its own reader only. |
| 12 | 5,000 fuzzed SMD and CIF files (cut at a random byte, lines doubled, deleted or swapped, fields made huge, negative or text) | Each ends in under 50 ms with a valid drawing (finite coordinates, bonds between atoms that exist, within the limits) or a refusal that starts "This SMD file is damaged", "This CIF file is damaged" or "It has". No other exception. |
| 13 | Paste CIF text 20 times fast | 20 additions, each clear of the last, 20 undo steps. ⌘Z twenty times gives the empty drawing; ⇧⌘Z twenty times gives it back. |
| 14 | Drop 21 `.smd` files on Home at once | 20 open, each in its own window (open.rs `MOST`). Octet stays responsive. |
| 15 | Drop an `.smd` file on a drawing | Its structures at the drop point, selected, one undo step. |
| 16 | The file is moved or deleted between the dialog and the read | "This file is not where it was. It was moved or deleted." |
| 17 | Save a drawing read from SMD and CIF as `.oct`, CDXML and CDX, then open each | Same atoms, bonds, charges, isotopes and coordinates. Octet 1.1.2's reader opens the three files the same. ChemDraw 22.2 opens the CDXML and saves it back with the same atoms and bonds. |
| 18 | Rotate 90°, flip, align, colour, duplicate and delete a structure read from SMD or CIF; copy it to another drawing | As for a drawn structure. Finite coordinates. Undo puts each back. |
| 19 | Dark mode; zoom at the smallest and largest steps | Drawn with the theme's ink. No `look:` errors. No NaN in the SVG. |
| 20 | `add_file` with 1,000,001 characters; with `""`; with damaged CIF | Schema refusal; the error that names the formats; "This CIF file is damaged: …". Drawing unchanged each time. |
| 21 | Two AI sessions call `add_file` with CIF text at once, each on its own drawing | Each drawing gets its own structures. One undo step each. |
| 22 | `run_command more_cif` or `more_smd`; More formats off and `more_smd` asked by name | Refused as a dialog command; "no command" while More formats is off. |
| 23 | A binary file of 1 MB random bytes named `.skc` or `.chm`, from Finder, a drop and `--convert` | Today's refusal. Nothing added. |
| 24 | Random text of 1 MB named `.tgf` or `.msm`; and of 100 KB | Today's words: "Octet cannot read the structures in this file." (over 300,000 characters Indigo is not asked). Under 1 s. Nothing added. |
| 25 | An MDL V2000 molfile named `.msm` | Opens as a MOL file (no refusal by extension). |
| 26 | More formats switched off | No Open SMD… in the File menu, the palette or Settings > Keys. A dropped `.smd` file still opens, as a dropped `.cif` does. |

## Acceptance list

| Job or case | Check |
| --- | --- |
| J1 paste and name field; D11; cases 1, 3, 11, 13 | `src/filetext.check.ts`: `isOwnFormat` on each format; source checks that `structureFromText` and both `host.file` functions call it before `parseStructure`, and that `readFile`, `dropFiles` and the paste pass `RangeError` and `DamagedFile` messages through. Dev server on port 1473: paste CIF text through the page's paste handler, see the structures, ⌘Z and ⇧⌘Z. |
| J1 `add_file`; cases 20, 21 | `src/filetext.check.ts`: `handle()` from `src/mcp.ts` with a host built as `mcprobust.check.ts` builds one, its `file` the headless host's; two sessions at once. |
| J1 Latin-1; case 10 | `cargo test` in `src-tauri` with `CARGO_TARGET_DIR=…/cargo-g103`: `open::read` of a Latin-1 `.cif`; a binary `.mol` still refused. |
| J1 speed | `src/filetext.check.ts`: interleaved medians of `importStructure` on a 300,000-character MOL text, this branch's code against `v1.1.2`'s (from `git archive v1.1.2`), within 3%. `isOwnFormat` on that text under 1 ms. |
| J2 reader; cases 3–9, 12 | `src/smd.check.ts`: files written by the check from S1–S9; every field; limits; fuzz with a fixed seed; time caps. |
| J2 detection; case 11 | `src/smd.check.ts`: `isSmd` false on every other format's text from the existing checks' writers. `isCif` false on SMD. |
| J2 menu; cases 22, 26 | `src/moreformats.check.ts` (the line's shape); `src/cif.check.ts` and `cargo test` (`open_more` table, unknown names refused); dev server: the palette lists Open SMD… with the same icon and row as Open CIF or mmCIF…, `npm run look -- http://localhost:1473/` with no `look:` errors. |
| J2 case 4 | `src/smd.check.ts`: interleaved medians, `readSmd` against `importStructure` of the same SDF. |
| Case 14, 15, 16 | `cargo test`: `open::read` of a missing file. Cases 14 and 15 take the same Rust path as a `.mol` file (`offer` keeps `MOST`, `take_opened` reads it): a source check in `src/filetext.check.ts` that no extension list decides it. The page's step (`importStructure`, then `insertMol` at a point, one undo step) runs on SMD and CIF text in `src/filetext.check.ts`. |
| Case 17 | `src/filetext.check.ts`: write `.oct`, CDXML and CDX with Octet's writers, read back, compare. Octet 1.1.2: the same files through `readOct` from `git archive v1.1.2` in the scratchpad. ChemDraw 22.2: the CDXML through AppleScript (lock taken), saved back as CDXML, read and compared. |
| Case 18, 19 | `src/filetext.check.ts`: rotate, flip, align and colour with `edit.ts` on the reader's output; finite coordinates. Dev server: light and dark, smallest and largest zoom, `npm run look`, console read. Between windows: the same clipboard code as within one window, checked within one window. |
| J3; cases 23–25 | `cargo test`: random bytes named `.skc` and `.chm`. `src/filetext.check.ts`: random text, and a V2000 molfile, through `importStructure`. |
| Whole branch | `npm test` (tsc and every check) and `cargo test`, against the baseline of b30f413 (161 of 161 pass). |

## Scope cut

- SKC, TGF, MSM and CHM readers: no public specification (see "Public sources").
- SMD, if the paper's text is not on the branch by Wednesday 18 November, 18:00.
- Saving any of the five formats: the issues ask for reading only.
- A message that names each unreadable format: it would refuse files that read today (D6).
- Adding CIF and SMD to File > Insert…, File > Import… and `--convert` of a folder: Sam keeps rare formats to their
  own More Formats line.

## What's New lines (drafts)

- When you paste the text of a CIF or mmCIF file, Octet draws its structures. File > More Formats > Open CIF or
  mmCIF… draws the same.
- When an AI app gives Octet the text of a CIF file, Octet adds its structures to the drawing.
- When a CIF file has accented letters from an old program, it opens from Finder and from a drop too.
- To open a Standard Molecular Data (SMD) file, use File > More Formats > Open SMD…. You can also drop it on Octet.
  (J2 only.)

## For Sam

- SMD: the paper is Bebak et al. 1989 (doi 10.1021/ci00061a002), with Barnard 1990 (doi 10.1021/ci00065a018) for
  version 5.0. Through the Cambridge library: https://ezp.lib.cam.ac.uk/login?url=https%3A%2F%2Fdoi.org%2F10.1021%2Fci00061a002.
  Keep the PDF outside the repository.
- Issues 103 and 104 can be answered: SKC, TGF, ChemNote and CHM have no public specification, so Octet cannot read
  them under its rules; SMD comes when the specification is in hand.
