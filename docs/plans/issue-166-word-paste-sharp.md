# Issue 166: a drawing pasted into Word for Windows is aliased

Branch `fix/166-word-paste-sharp`, from `release-1.2-mcp` (b30f413). For release 1.2 (Friday 20 November 2026).
Plan of 17 November 2026. No product code yet.

## The report

With default settings, a drawing copied from Octet 1.1.2 and pasted into Word for Windows is a low-quality, aliased
picture. A paste from 1.1.1, or an exported PNG, is sharp and smooth. The reporter asks for a switch back to 1.1.1's
paste.

## The cause

1.1.2 put an Octet Drawing object first on the Windows clipboard (decision 0023, issue 24). Word's default paste now
makes that object, and Word draws an object from its cached picture. That picture is Octet's EMF, which has GDI
records only. Word draws an object's picture through GDI+, and GDI+ plays GDI records without anti-aliasing. 1.1.1's
paste was a plain picture, which Word draws with its own picture renderer, smoothed.

Evidence:

- The reporter's screenshot, enlarged pixel by pixel. The 1.1.2 drawing has 35 colours: every bond is 1 px of solid
  ink (15, 23, 42) with no grey edge, and the labels have grey edges (font smoothing). The 1.1.1 drawing has 704
  colours: bonds and labels both have grey edges. That is GDI playback of vector records: lines aliased, text
  smoothed.
- `src-tauri/src/vector.rs:469` `make_emf` writes GDI records only. Copy puts it on as CF_ENHMETAFILE
  (`src-tauri/src/clipboard.rs:236-242`), after "Embed Source" and "Object Descriptor" (`src-tauri/src/ole_windows.rs:1481`
  `clip_object`, through `ole::clipboard_order`). The object's own picture after Update is the same EMF
  (`ole_windows.rs:1383` `update`). Nothing in `src-tauri/src` writes an EMF+ record.
- ChemDraw for Windows has the same problem and the same cure. Revvity's support article 4408239935508 ("the result is
  a poor looking low resolution image") says to turn on File > Preferences > General > "Use Antialiasing When
  Generating Windows Metafiles", and that newer versions do not have the problem. The pictures of ChemDraw for Windows
  objects in Word documents are EMF+ dual metafiles: the first EMF+ records turn anti-aliasing on (smoothing high
  quality, text anti-aliased), then bonds are EMF+ lines and labels EMF+ strings, with GDI records after them for
  programs that read no EMF+. In five Word documents, 190 of 192 ChemDraw objects had such a picture (the other two
  a WMF), and so did 179 of 179 MestReNova objects.

Word drawing objects through GDI+ is inferred from this evidence. T7 and the tests by hand in Word confirm it.

The object stays. Its picture becomes an EMF+ dual EMF with anti-aliasing on.

## What exists on the branch

- Copy on Windows with Settings > Import and export > Copy > Office object on (the default) and the class registered:
  "Embed Source", "Object Descriptor", then 0011's formats (CF_ENHMETAFILE, CF_DIB, CDX, CDXML, MDLCT, SMILES, Octet's
  JSON) through `OleSetClipboard` and `OleFlushClipboard` (`clipboard.rs:653-685`, `ole_windows.rs:1409-1528`).
- The page sends the object only with the picture: `Editor.tsx:9331` (`WINDOWS && on.office !== false && on.pdf`).
- The object's `IDataObject` gives CF_ENHMETAFILE (the EMF) and CF_METAFILEPICT (the EMF converted by Windows,
  `ole_windows.rs:378` `medium_wmf`), and its storage (`ole_windows.rs:801`, `1171`).
- The object window sends a picture when it opens, after each change (half a second later, kept for Close and
  Quit) and on File > Update (`objects.rs:83` `Session::message`, `ole_windows.rs:1383`). Update always sends, changed
  or not (`Editor.tsx:1640-1655`).
- The switch the reporter asks for already exists: Settings > Import and export > Copy > Office object
  (`SettingsWindow.tsx:43-45`, `614`), Windows only, on by default. Off, Copy is 1.1.1's, byte for byte. The 1.1.2
  notes say so (`releases.ts:185`). The Mac's Word group in Settings > General (`SettingsWindow.tsx:624`) has the
  Mac's double-click switch only.
- `vector.rs`, `clipboard.rs` and `ole_windows.rs` are the same as in v1.1.2 (`git diff v1.1.2 HEAD` is empty for
  them), so `cdxml_from_emf` here is 1.1.2's reader.
- Windows CI: the job "Office objects (Windows)" (`.github/workflows/platforms.yml:253`) runs every test with "ole"
  in its name (`cargo test --bin octet ole`), then the container harness. It runs on a push to `main` and from
  Actions > Windows and Linux > Run workflow. `vector.rs:733` already plays an EMF through GDI and GDI+ there.
- No other 1.2 bug branch touches these files (`fix/1.2-bugs-int` changes one test in `ole.rs`).

Gap confirmed: the object's picture is GDI only, and nothing gives Word an anti-aliased one.

## ChemDraw cross-check

Sources: `~/octet-research/notes/chemdraw26-inventory.md` (Preferences > General, Copy As, Paste Special, Show
Clipboard), `chemdraw-inventory.md` (Preferences > General, line 538), `clipboard-blackbox.md`, `help26/v22/text/`
(Embedding Objects (Windows), Setting Preferences), `research_notes/ChemDraw complaints from chemists/
interop_formats_features.md` (O5, C1), Revvity support article 4408239935508 (read 17 November 2026), decision 0011
(ChemDraw 25.5's 14 Windows clipboard formats, issue 23), and the ChemDraw objects' pictures in Word documents above.

| ChemDraw | Octet after this item |
| --- | --- |
| Object pictures in Word are EMF+ dual, anti-aliased, text as text | Same: EMF+ dual, anti-aliased, labels as text |
| Preferences > General > Use Antialiasing When Generating Windows Metafiles (on in new versions; the old reason to switch it off was printer drivers) | Always on. No setting: the reason is gone, and Office object off gives the plain picture |
| Double-click opens the object in ChemDraw (Edit Graphic Object) | Unchanged (decision 0023) |
| Paste Special in Word > Picture (Enhanced Metafile) for a plain picture | Same in Word; Octet also has Office object off |
| Copy As (SMILES, SLN, InChI, InChIKey, CDXML Text, MOL Text, MOL V2000 Text, 3MF, PNG, HELM, FASTA), Show Clipboard | Not part of this item; unchanged |
| Palette, Object, Curves, Color and Text menus, context menu, CDXML attributes | Nothing applies: the picture holds no new data, and no file format changes |

Missing for Sam: ChemDraw's anti-aliasing setting itself. Octet does not add it (see "No new switch").

## Rules every part keeps

- The object stays: "Embed Source", "Object Descriptor", the storage's streams, the class and the formats' order are
  byte for byte as in 1.1.2. Double-click, Update, Close and Return, Quit and paste back into Octet are unchanged.
- True size stays: the EMF header (bounds, frame, reference device, millimetres) is the same bytes as `make_emf`'s,
  except the byte and record totals. `OctetSize`, `GetExtent` and the Object Descriptor give the same size.
- The GDI records are the fallback, and they are 1.1.2's: a program that reads no EMF+ draws exactly what it drew.
- Only the object's picture changes. Office object off, the class not registered, Export as EMF (File > Export,
  Quick export, `--convert`, the MCP's `read` with format emf), the Mac's copy for Office (with the PDF comment) and
  Linux keep their bytes. Existing CRC tests prove the Mac and the export; a new one proves the plain Windows copy.
- The CDXML comment stays, so paste reads the drawing out of the picture, in 1.2 and in 1.1.2.
- Copy is no slower than 1.1.2's (decision 0024).
- No new dependency. No `unsafe` outside the Windows test code that already plays metafiles.
- The bytes follow MS-EMFPLUS. Where the spec is silent and GDI+ is the judge (the fill mode, very large records), a
  Windows CI test decides, and the code says which test.

## Design

### D1. One walk, two streams

`vector.rs` gets `make_office_emf(tree, cdxml)`. `make_emf` and it share one writer that walks `marks()` once. With
EMF+ off the writer gives `make_emf`'s bytes exactly. With EMF+ on it adds EMR_COMMENT records that hold EMF+
records, and nothing else:

1. EMR_HEADER, as now.
2. The EMF+ header comment, the first record after the header, as MS-EMFPLUS requires: EmfPlusHeader (dual,
   version 0xDBC01002, video display, 96 by 96 dpi, the reference device's), EmfPlusSetAntiAliasMode (on, high
   quality), EmfPlusSetTextRenderingHint (anti-alias), EmfPlusSetPixelOffsetMode (half), EmfPlusSetInterpolationMode
   (high quality bicubic), EmfPlusSetPageTransform (pixels, scale 1).
3. The Octet CDXML comment, as now. Its place moves one record later; `cdxml_from_emf` walks every record, so 1.1.2
   still finds it.
4. The GDI set-up records, as now.
5. For each mark: one EMR_COMMENT with its EMF+ records, then its GDI records, as now. GDI+ writes dual metafiles in
   this order.
6. A comment with EmfPlusEndOfFile, then EMR_EOF.

Reason: one walk keeps the cost low and makes it easy to prove the two streams draw the same picture. Strip the EMF+
comments and the bytes are `make_emf`'s (for a drawing with no photo).

### D2. Coordinates

EMF+ draws in device pixels of the 96 dpi reference (page unit pixels, scale 1, world transform identity): a point is
pt × 4/3, as a float. The GDI records draw the same point at pt × 20 logical units, 15 to a device pixel. So every
EMF+ coordinate × 15 equals the GDI one to within its rounding (0.5 logical unit). Reason: GDI+ maps the EMF+ device
space onto the picture from the same header as the GDI records, with no unit conversion to get wrong.

### D3. Shapes

- A path object (object 0): the shape's points as floats, types start, line and Bézier, the close flag on each
  closed subpath's last point.
- Fill: EmfPlusFillPath with the colour inline (the S flag, ARGB with alpha 255; the colour is already blended with
  white, as for GDI). A nonzero fill sets PathPointFlags bit 0x2000, as GDI+ writes on its winding paths; an even-odd
  fill leaves it clear. MS-EMFPLUS documents no fill mode, so CI test T5 decides (see "If CI says no").
- Stroke: a pen object (object 1) with the width in px, start and end caps (flat, round, square), the join (miter,
  round, bevel), the miter limit from the SVG, and dashes in pen widths with the SVG's offset (dash caps round for a
  round cap, else flat). Then EmfPlusDrawPath.
- Octet writes each object with the same id again for the next shape (allowed: a new object replaces the old one).

### D4. Labels

Each GDI text run (EXTTEXTOUTW) also gets EmfPlusDrawDriverString: a font object (object 2: the same Windows face,
em size in px, bold for a weight of 600 or more, italic), the run's colour inline, Unicode characters (CmapLookup),
and each character's origin on the baseline, the same positions as the GDI run's dx. MS-EMFPLUS sizes this record as
10 bytes a glyph plus 28, so an odd count is not a multiple of 4: a run with an odd count gets one space at its end
(it draws nothing). Text that is outlines in the GDI records (turned, underlined, a face Windows lacks, right to left,
outside the Basic Multilingual Plane) is outlines in EMF+ too (D3). Reason: labels stay text, as ChemDraw's do, so
Word's Save as PDF and a printer get text; and they are smoothed as the bonds are.

### D5. Photos and other pictures in a drawing

EmfPlusGetDC, then the picture's GDI records, made self-contained: SAVEDC, the mapping records again (MM_ANISOTROPIC,
window and viewport), the existing SETSTRETCHBLTMODE, SETWORLDTRANSFORM, STRETCHDIBITS and transform reset, then
RESTOREDC. GDI+ plays GDI records only after EmfPlusGetDC and until the next EMF+ record, and it has not played the
set-up records at the top, so the section sets its own. A program that reads GDI only plays the extra records with no
change in the picture. Reason: the pixels go in once. An EMF+ image object would double a photo's bytes (a 12
megapixel photo is 36 MB as pixels) and need continued records.

### D6. Very large shapes

One structure's bonds are one SVG path, so a 500-residue peptide is one path of about 25,000 points (about 230 KB as
an EMF+ path object). Octet writes it as one EmfPlusObject record in one comment. MS-EMFPLUS allows an object to be
split over continued records, and GDI+ splits its own large objects, but whether GDI+ reads one large record is not
documented. CI test T6 draws a 30,000-point path through GDI+ written three ways: one record, continued as GDI+
writes it, and continued as the spec draws it. The writer uses one record while T6 passes for it.

### D7. Where the EMF+ picture goes

- Copy on Windows, when the object goes on: `copy_to_clipboard` decides `object && offered()` before it makes the
  types, and `types` takes that as a flag. With it, CF_ENHMETAFILE is `make_office_emf`. Without it, `make_emf` as in
  1.1.2. Paste Special > Picture (Enhanced Metafile) in Word then also gets the EMF+ picture, which Word draws
  smoothed.
- The object window's pictures: `ole_windows::update` makes `make_office_emf`. So the picture at open, after each
  change, on Update, on Close and Return, on Word's Close and on Quit is the same kind.
- CF_METAFILEPICT (for a program that asks for a Windows metafile) stays the EMF converted by Windows. GDI keeps the
  whole EMF in its comment records.
- Export as EMF stays GDI only. Word already draws a plain GDI picture smoothed (Sam saw Octet's EMF sharp in Word for
  Windows on 12 November 2026), and other programs (LibreOffice, Inkscape, Illustrator) read GDI records best.

### D8. Copy speed

The Windows copy makes the EMF+ EMF on a thread of its own while it draws the bitmap (CF_DIB), as the Mac's copy makes
the EMF beside the PDF. The bitmap is the slow part, so Copy takes about the bitmap's time, which is less than 1.1.2's
EMF then bitmap.

### D9. No new switch

The reporter's switch exists: Settings > Import and export > Copy > Office object, off for a plain picture. After this
fix the object's picture is as smooth as the plain picture, so the reason the reporter gave is gone. The reasons left
for a plain picture (a journal that wants pictures only, a document for people who do not have Octet, a smaller file)
are what that switch is for, and Word's Paste Special > Picture gives one paste. A second switch in Settings > General
> Word would do the same thing in a second place. The switch stays where it is: it changes what Copy puts on the
clipboard, for PowerPoint and Excel too, and Settings' search finds it for "word". No UI change.

### D10. Objects made with 1.1.2

A document keeps the picture Word cached. An object pasted from 1.1.2 stays aliased until its picture changes:
double-click it, then File > Update (Ctrl+S), which sends a picture changed or not. Opening and closing with no change
leaves the document as it was. Octet does not change a document the user did not change.

### If CI says no

- T5 (fill mode) fails: GDI+ ignores bit 0x2000. A nonzero fill with more than one subpath is then drawn as one
  even-odd path when that gives the same ink, which a test of the subpaths' crossings decides; otherwise through
  EmfPlusGetDC with its GDI records (aliased, that shape only). Measure first how many real drawings need it.
- T6 (large records) fails for one record: write continued objects in the layout T6 passed.
- T4 (GetDC) fails: the photo goes in as an EMF+ image object of its own file bytes (PNG or JPEG, compressed bitmap),
  continued as T6 found.
- T7 (the OLE cache) shows the cache keeps a WMF or the bitmap: the copy's data object offers its formats so the cache
  takes the EMF (T7 lists what the cache took).

## Siblings (consistency pillar)

Every way a picture of an Octet drawing gets into an Office document on Windows, and what this item does to it:

| Route | Picture after this item |
| --- | --- |
| Edit > Copy, Ctrl+C, the context menu's Copy (object on) | EMF+ (D7) |
| Edit > Cut, Ctrl+X (the same copy) | EMF+ |
| The MCP's `run_command` copy and cut (the page's own command) | EMF+ |
| Copy with Check Structure on Copy (copies after Ignore All) | EMF+ |
| Object window: picture at open, after each change, File > Update, Close and Return, Word's Close, Quit | EMF+ (D7) |
| Insert > Object > Create New, then Update | EMF+ |
| Insert > Object > Create from File (.oct), then Update | EMF+ (no picture before the first Update, as now) |
| A program that asks the object for a Windows metafile | WMF converted by Windows, as now |
| Paste Special > Picture (Enhanced Metafile) after an Octet copy | EMF+ |
| Office object off, or the class not registered | 1.1.2's EMF, byte for byte |
| Export as EMF, Quick export, `--convert`, MCP `read` emf | 1.1.2's EMF, byte for byte |
| Mac: Office's copy (PDF comment), Update in Word | Unchanged |
| Linux: PDF, PNG, SVG; LibreOffice extension | Unchanged |
| Paste into Octet of Word's copy (Embed Source, or the picture alone) | Reads the drawing, as now |

What every drawing can hold, each tested through both streams: bonds (filled paths), wedges and hashes, dashed and
wavy bonds, arrows (filled and stroked, curved, dashed), labels and captions (text runs, sub- and superscripts,
coloured, bold, italic), outlined text, shapes (rectangles, ellipses, brackets, orbitals with even-odd fills), ring
fills, highlights at part opacity, reagent tables, charts, spectra, TLC plates and gels, and photos. Rotated and
flipped objects carry their transform in the path points. Dark mode does not change the copied picture.

## MCP surface

No new function, so no new tool. `run_command` "copy" and "cut" run the page's copy, which reaches the EMF+ picture
on Windows. `read` with format emf is Export's EMF and does not change. Check during the build that the MCP's copy
goes through `copyOut` (`Editor.tsx:9322`).

## Files and formats

| Format | Change | Octet 1.1.2 with the new bytes |
| --- | --- | --- |
| .oct, CDXML, CDX, SDF, MOL, SMILES | None | As before |
| Clipboard on Windows, object on | CF_ENHMETAFILE is EMF+ dual; every other format the same bytes | Pastes Octet's JSON or Embed Source first; from the picture alone it finds the CDXML comment (same reader) |
| Clipboard on Windows, object off | None | As before |
| Object picture in Word, PowerPoint, Excel (word/media/imageN.emf) | EMF+ dual | Paste of Word's copy: Embed Source first, then the picture's CDXML |
| Embed Source storage (Octet, OctetSize) | None | Opens the object as before |
| Export EMF and the others | None | As before |
| Mac and Linux clipboard | None | As before |

ChemDraw for Windows pastes Octet's copy through CDX, which does not change.

## Jobs

### J1. The EMF+ writer (`vector.rs`)

Done when:
- `make_emf` gives the same bytes as before (the existing CRC tests pass unchanged).
- `make_office_emf` is valid MS-EMFPLUS, checked by a parser in the tests: the EMF+ header in the first record after
  the EMF header; every EMF+ record's Size a multiple of 4 and DataSize = Size − 12; object ids 0 to 63; every object
  defined before a record uses it; path point and type counts agree; glyph counts even; EmfPlusEndOfFile the last EMF+
  record; the EMF header's totals right.
- With the EMF+ comments taken out, its bytes are `make_emf`'s (header totals aside), for every test drawing with no
  photo.
- Both streams draw the same picture: each EMF+ point × 15 is the GDI point to within 1 logical unit; fill and pen
  colours equal; pen width × 15 equals the GDI pen width to within 1; each DrawDriverString's characters, face, size
  and positions equal its EXTTEXTOUTW's (positions to within 1 logical unit).
- The header bytes 0 to 108 equal `make_emf`'s except the byte and record totals.
- The same input gives the same bytes every time.

### J2. The EMF+ picture where Word draws it (`clipboard.rs`, `ole_windows.rs`)

Done when:
- Copy on Windows with the object puts `make_office_emf` as CF_ENHMETAFILE, made on a thread beside the bitmap (D8),
  and the other formats are 1.1.2's bytes, in 1.1.2's order.
- Copy without the object (switch off, or not offered) is 1.1.2's bytes: a CRC test of `types` for the Windows plain
  copy.
- `ole_windows::update` makes `make_office_emf`; the object's GetData(CF_ENHMETAFILE) gives it, and GetData
  (CF_METAFILEPICT) still converts it (the existing Windows test, extended).
- `cargo check --target x86_64-pc-windows-msvc --tests`, debug and release, has no warnings.

### J3. Proof on Windows (CI, job "Office objects (Windows)")

Tests with "ole" in their names, so `cargo test --bin octet ole` runs them. Each draws the test drawings (a line and a
box, L-proline with labels, a photo, a dashed curved arrow, the overlap test, a 30,000-point path) into bitmaps:

- T1. GDI+ draws `make_office_emf` smoothed: on a diagonal bond, at least 30% of the edge pixels are partly covered;
  GDI+ drawing `make_emf` has none on the same bond.
- T2. GDI+'s ink box for `make_office_emf` is GDI's ink box for `make_emf` to within 2 px, at 4 px a pt.
- T3. GDI plays `make_office_emf` to the same pixels as `make_emf` (the fallback is 1.1.2's).
- T4. The photo: GDI+ draws its red pixels in the same box as GDI, to within 1 px, upright and turned 30 degrees.
- T5. Fill mode: two overlapping squares wound the same way in one path. Nonzero (bit 0x2000): GDI+ fills the
  overlap. Even-odd: the overlap stays white.
- T6. A 30,000-point path written three ways (D6): GDI+ draws the one the writer uses, and the test prints which
  others it draws.
- T7. Word's paste, without Word: the copy's data object (as `clip_object` makes it) on the clipboard through
  `OleSetClipboard` and `OleFlushClipboard`, then `OleGetClipboard`, then Windows' default handler for Octet's class
  with a draw cache (`OleCreateDefaultHandler`, `IOleCache::Cache` for content, `IOleCache2::InitCache` with the
  clipboard's data object), as `OleCreateFromData` does. The cache gives back CF_ENHMETAFILE with the EMF+ header,
  byte for byte the copy's. Save it to a storage, load a new handler from it: the same bytes. The test prints the
  format the cache took.
- T8. Labels: GDI+'s dark pixels for each label lie inside that label's GDI text box, and the centre of its ink is
  within 1.5 px of GDI's.
- T9. Zoom: GDI+ draws L-proline at 0.25, 1, 4 and 40 px a pt with no error, smoothed edges at each, and an ink box
  that grows with the scale (within 2 px).

Done when the tests are in, they pass a Windows type check here, and the job's step runs them. Sam runs the workflow
(Actions > Windows and Linux > Run workflow, on `release-1.2-mcp` or this branch once pushed) and they pass.

### J4. Speed and size

- `windows_copy_time` (ignored, `cargo test --release --bin octet windows_copy_time -- --ignored --nocapture`): the
  Windows copy with the object against 1.1.2's (`make_emf` then the bitmap), for L-proline, 40 paclitaxels and a
  500-residue peptide, the middle of 9 runs taken in turn. Pass: no slower than 1.1.2 + 10% + 2 ms. The drawings are
  made from Octet's own export of each (SVG files Octet writes, made with the dev server), kept small in the test as a
  generator of the same paths and labels.
- The object window's message (after each change, off the main thread): `make_office_emf` against `make_emf` for the
  same drawings. Reported, with a bound: at most twice `make_emf`'s time and 15 ms for 40 paclitaxels on an M1 Pro.
- Size: the EMF+ EMF is at most three times the GDI EMF for drawings with no photo; a photo adds under 1 KB.

Done when the test is in and its numbers are in decision 0023.

### J5. Documents

- Decision 0023: the object's picture is an EMF+ dual EMF, why (Word draws objects through GDI+), ChemDraw's
  equivalent, the CI tests, the speed numbers, D9 and D10.
- Decision 0011: one line in "Office objects on Windows" that the object's EMF has EMF+ records too, and that every
  other EMF is unchanged.
- `docs/testing/ole-manual.md`: the checks only Windows can do (below).
- What's New lines go back to the release session. `src/releases.ts` is the release session's.

## Stress list

| # | Case | Expected |
| --- | --- | --- |
| S1 | Empty drawing (Insert > Object > Create New, then Update with nothing drawn) | EMF+ header, set-up and end only; GDI+ draws nothing, no error; size from the blank picture as now |
| S2 | One label of one letter ("O") | DrawDriverString with 2 glyphs (O and a space), Size a multiple of 4; drawn where GDI draws it |
| S3 | 40 paclitaxels | Copy within J4's bound; EMF+ at most 3 × the GDI EMF; GDI+ draws it |
| S4 | A 500-residue peptide (one path of about 25,000 points) | One large record that GDI+ draws (T6); Copy within J4's bound |
| S5 | A drawing with a 12 megapixel photo | GetDC section; under 1 KB more; under 64 MB as before; GDI+ draws the photo in place (T4) |
| S6 | A structure turned 30 degrees and flipped, with labels | Turned labels are outlines in both streams; points match |
| S7 | A photo turned 30 degrees | GDI+ draws it in GDI's box (T4) |
| S8 | Overlapping fills in one nonzero path (bonds meeting at a crowded atom, two ring fills) | Overlap filled (T5) |
| S9 | An even-odd path (an orbital's shaded lobe) | No 0x2000 bit; the hole stays (T5) |
| S10 | Dashed bonds and a dashed curved arrow with round caps; a 0.1 pt hairline; a 10 pt line | Dashes in pen widths; ink box as GDI's (T2); the hairline drawn faint and whole |
| S11 | Colour by Element labels; a highlight at 40% opacity | EMF+ colours equal the GDI colours, alpha 255 |
| S12 | Text GDI cannot draw: a face Windows lacks, right to left, an emoji, underlined | Outlines in both streams; no DrawDriverString |
| S13 | Office object off; the class not registered (a portable copy) | CF_ENHMETAFILE is 1.1.2's bytes; no EMF+ |
| S14 | Export as EMF, Quick export, `--convert`, MCP `read` emf | 1.1.2's bytes |
| S15 | Mac copy for Office | Unchanged bytes (existing CRC test) |
| S16 | Word's copy of the object pasted into Octet 1.2 and 1.1.2; the EMF+ picture alone pasted | The whole drawing; from the picture, the CDXML comment (same reader as 1.1.2) |
| S17 | A hostile EMF on the clipboard: an EMF+ comment that claims more bytes than the file | Paste reads nothing from it; no panic |
| S18 | Ctrl+C 20 times fast, two selections in turn | Each copy joins its threads; the clipboard holds a whole copy; the same input gives the same bytes |
| S19 | Zoom from 10% to 500% in Word | Smoothed at every zoom (T9; by hand in Word) |
| S20 | An object pasted from 1.1.2 | Unchanged until File > Update; after Update, smoothed (D10) |
| S21 | Undo and redo in an object window, Update after each | Each Update sends a new EMF+ picture; the same drawing gives the same bytes |
| S22 | Two objects from two documents open, then Quit | Both documents get EMF+ pictures (flush sends the stored picture) |
| S23 | Two AI sessions: one copies through `run_command` while the other edits | The copy is the selection at that moment; no new state is shared |
| S24 | MCP `run_command` with a misspelt "copy", or `read` with format "emf+" | Refused, as now |
| S25 | A poster 2 m wide | EMF+ floats fine; GDI points within range as now; frame valid |
| S26 | Copy while Octet is in dark mode | The same bytes as in light mode |
| S27 | Word run as administrator (the class is not seen) | A picture only (no object); it is the EMF+ copy, smoothed |
| S28 | The document opened in Word for Mac | The picture shows (EMF+ or the GDI records) |
| S29 | Printed from Word for Windows, and saved as PDF | Vector bonds; labels as text |

## Acceptance

| Check | Covers |
| --- | --- |
| `cargo test` (Mac): J1's parser, stream match, header, determinism, the existing CRC tests | J1, D1 to D4, S1, S2, S6, S10 to S12, S14, S15, S21, S25 |
| `cargo test` (Mac): `types` for Windows with and without the object; paste from the EMF+ EMF; hostile EMF | J2, S13, S16, S17, S18 |
| `cargo check --target x86_64-pc-windows-msvc --tests`, debug and release | J2, J3 type check |
| Windows CI T1 to T9 | J3, S3 to S5, S7 to S10, S19 |
| `windows_copy_time` (release, ignored) and the message timing | J4, S3, S4 |
| Full `npm test` | Nothing else broke |
| Dev check of the page's export SVG in dark and light mode (dev server on port 1460) | S26 |
| Code reading: MCP copy goes through `copyOut`; Update always sends | S20, S23, S24 |
| By hand on Windows (`docs/testing/ole-manual.md`): paste into Word, PowerPoint and Excel at 100% and 400%; print to PDF and Save as PDF; unzip the .docx and read 4 bytes at offset 120 of `word/media/image1.emf` ("EMF+"); a 1.1.2 object before and after Update; open on the Mac | S19, S20, S22, S27 to S29 |

What stops a check here: there is no Windows computer and no Office for Windows on this Mac, and Word must not be
driven. T1 to T9 run on GitHub's Windows machine when Sam runs the workflow; Word, PowerPoint and Excel need Sam or
Prof. Schramm.

## Not in this item

- A new Settings switch (D9).
- ChemDraw's anti-aliasing setting (always on; D9).
- EMF+ in Export as EMF, in the plain Windows copy, or in the Mac's copy for Office (D7).
- A smoother WMF for programs that ask for one (old programs only).
- Refreshing a 1.1.2 object's picture without Update (D10).
- LibreOffice reading Octet's EMF+ (no LibreOffice here; the LibreOffice item, issue 48, owns it).

## Build notes (17 November 2026)

Built as planned. Details the plan did not fix:

- The SVG's miter join is GDI+'s LineJoinMiterClipped (a bevel past the limit, as SVG). GDI+ has no square dash cap,
  so with square caps each dash is a pen width longer and starts half a width earlier. A dash or gap is at least
  1/20 pt, as in the GDI pen.
- T1 and T4 assert on GDI+ drawing into a DC (as Word draws); the same on a GDI+ bitmap is printed. T6's continued
  layouts are an ignored test of their own (`ole_plus_large_path_continued`), run by a CI step that may fail, so a
  part GDI+ misreads cannot end the asserted tests' process.
- Octet's bond outlines overlap a little where bonds meet: drawn even-odd, 42 of L-proline's 4,918 ink pixels at 4 px a
  pt would be white. So T5 matters; its fallback stays as above.
- J4's paclitaxel and peptide are a generator (`octet_drawing` in `vector_plus_tests.rs`) with Octet's export's
  shapes and counts, not exports from the dev server.

## What's New lines (for the release session)

- When you paste a drawing into Word, PowerPoint or Excel for Windows, its bonds and labels are smooth at all zoom
  levels and in print.
- To make a drawing that you pasted with Octet 1.1.2 smooth, double-click it in Word and choose File > Update.
