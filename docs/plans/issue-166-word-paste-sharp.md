# Issue 166: a drawing pasted into Word for Windows is aliased

Branch `fix/166-word-paste-sharp`, from `release-1.2-mcp` (b30f413), rebased onto bd7c684 on 19 November. For release
1.1.3 (Friday 20 November 2026) and 1.2.
Plan of 17 November 2026, built the same day (J1 to J5). Revised 18 November 2026: what is left (J6 to J10), and the
stress list cut to 20 cases. J6 to J10 built on 18 November ("Finished", below).

## The report

With default settings, a drawing copied from Octet 1.1.2 and pasted into Word for Windows is a low-quality, aliased
picture. A paste from 1.1.1, or an exported PNG, is sharp and smooth. The reporter asks for a switch back to 1.1.1's
paste.

## The cause

1.1.2 put an Octet Drawing object first on the Windows clipboard (decision 0023, issue 24). Word's default paste now
makes that object, and Word draws an object from its cached picture. That picture was Octet's EMF, which has GDI
records only. Word draws an object's picture through GDI+, and GDI+ plays GDI records without anti-aliasing. 1.1.1's
paste was a plain picture, which Word draws with its own picture renderer, smoothed.

Evidence:

- The reporter's screenshot, enlarged pixel by pixel (looked at again on 18 November). The 1.1.2 drawing has 35
  colours: every bond is 1 px of solid ink (15, 23, 42) with stair steps and no grey edge, and the labels have grey
  edges (font smoothing). The 1.1.1 drawing has 704 colours: bonds and labels both have grey edges. That is GDI
  playback of vector records: lines aliased, text smoothed. It is not a low-resolution bitmap: the 1.1.2 bonds are
  1 px wide and sharp-edged at every angle.
- In v1.1.2, `make_emf` (`src-tauri/src/vector.rs`) wrote GDI records only, and it was the object's picture on the
  clipboard and after Update. Nothing in `src-tauri/src` wrote an EMF+ record.
- ChemDraw for Windows had the same problem and the same cure (see "ChemDraw cross-check").

The object stays. Its picture becomes an EMF+ dual EMF with anti-aliasing on.

## State of the branch (18 November 2026)

Built (9 commits on b30f413, the plan's J1 to J5):

- `make_office_emf` (`src-tauri/src/vector.rs:485`), sharing one walk with `make_emf` (`vector.rs:473`, `emf` at
  `vector.rs:676`): EMF+ header and set-up, paths (`plus_shape`, `vector.rs:568`), pens (`pen`, `vector.rs:606`),
  labels as `EmfPlusDrawDriverString` (`plus_text`, `vector.rs:643`), photos through `EmfPlusGetDC`.
- Copy on Windows decides the object first (`clipboard.rs:670`) and makes the EMF+ EMF on a thread beside the bitmap
  (`clipboard.rs:241-249`). The object window's pictures use it (`ole_windows.rs:1385`, `update`).
- Mac tests: `src-tauri/src/vector_plus_tests.rs` (a reader by MS-EMFPLUS, both streams compared, bytes steady) and
  `src-tauri/src/wordpaste_stress_tests.rs` (14 stress tests). Windows tests with "ole" in their names: `ole_plus_*`
  (`vector_plus_tests.rs:774-999`), `ole_stress_gdiplus_draws_every_drawing` (`wordpaste_stress_tests.rs:745`),
  `ole_cache_keeps_the_plus_picture` (`ole_windows.rs:1707`).
- CRC test of the Windows copy without the object (`clipboard.rs`, `windows_copy_with_and_without_the_object`).
- Speed test `windows_copy_time` (release, ignored). Numbers in decision 0023: Copy within 1.1.2's time.
- Decision 0023 ("The object's picture"), one line in decision 0011, `docs/testing/ole-manual.md` test 16, and the
  Windows CI step in `platforms.yml` (job "Office objects (Windows)").
- `src/wordpaste-stress.check.ts`: 46 cases (the old S1 to S29 and M1 to M17).

Checked on 18 November:

- `cargo test --bin octet` for the item's tests on the Mac: 46 pass, 1 fails (`stress_s12_right_to_left_text_is_outlines`).
- `cargo check --target x86_64-pc-windows-msvc --tests --bin octet`, debug and release: no errors, no warnings.
- `node src/wordpaste-stress.check.ts`: 2 of 46 fail (S12, M10). So `npm test` fails on this branch (161 of 162
  check files on 17 November).

Gaps:

1. Right-to-left text goes in as text runs. Hebrew and Arabic labels are EXTTEXTOUTW and DrawDriverString records,
   in display order. In EMF+, Arabic letters are drawn in their separate forms (DrawDriverString draws each
   character's own glyph). `pick_runs` (`vector.rs:203`) means to make right-to-left text outlines: it looks for a
   glyph left of the one before, but usvg gives right-to-left glyphs left to right, so that test never fires. The bug
   is in 1.1.2's GDI records too.
2. An AI app's `run_command` cut and paste do nothing during the call and answer "Ran cut." The page's cut and paste
   handlers return while `mcpCalling` is set (`Editor.tsx:9348`, `9214`). `clipCommand` (`Editor.tsx:7930`) sends a
   synthetic clipboard event, which those handlers drop. This came in with 2685d77 on the MCP branch, not with this
   item. Copy is not blocked, so the MCP's copy gets the EMF+ picture.
3. The Windows tests have never run. `platforms.yml` runs on a push to `main` and from Run workflow only. A push of
   `release-1.2-mcp` runs `check.yml`, which has no picture test.
4. `release-1.2-mcp` has moved 66 commits on. `git merge-tree` merges the branch cleanly, but the merged tree does not
   compile its tests: `crate::export::crc32` is gone (`clipboard.rs:920`, in this branch's new test) and so is
   `ole_windows::registered` (`ole_windows.rs:1712`, in T7). Both are in this branch's new tests only.
5. The stress list was 46 cases, too many to read. This revision has 20, each still checked.

Gap confirmed: the core is built, and these five things stop it from going into 1.2.

### Finished (18 November 2026)

- Gap 1: J6 (eacc12d). Gap 2: cut, for the MCP session. Gap 3: J8 (20c0e9c). Gap 4: J9 (e562ef1). Gap 5: J7 (20c0e9c).
- `cargo test` (Mac, all): 176 pass, 0 fail. `cargo check --target x86_64-pc-windows-msvc --tests --bin octet`, debug
  and release: no errors, no warnings.
- `windows_copy_time` (release, run alone, load 4): L-proline 1.70 ms with the object, 1.66 ms for 1.1.2's Copy; 40
  paclitaxels 226.3 ms and 228.4 ms; the peptide 338.9 ms and 345.1 ms. Within the bound; J6 changed nothing here.
- Merge-tree of e562ef1 and `origin/release-1.2-mcp` 33c482c (tree 797d53a, no conflicts), extracted to the
  scratchpad: Mac and Windows type checks clean (debug and release), `cargo test --bin octet` 173 pass, 0 fail, and
  `node src/wordpaste-stress.check.ts` passes its 20 cases (the MCP calls of S20 too).
- Full `npm test` on c3b834b: 162 of 162 check files pass (5 min 37 s; the base b30f413 had 161 of 161). Workflow
  files parse. `npm run look` (WebKit, port 1460): 22 places, every control matches. This item changes no UI.

### Finish (19 November 2026)

Rebased onto `release-1.2-mcp` bd7c684 (no conflicts) for release 1.1.3. The review and stress findings:

- LibreOffice on Windows pastes CF_ENHMETAFILE, plays only the EMF+ records and fills each path even-odd, so the
  bond overlaps came out white. Fixed (D3): a nonzero fill's figures go in paths of their own, except figures with a
  point in common to 0.05 px (mitred bonds, a cycle's arc in pieces: no anti-aliased seam in GDI+) and a figure in
  another's box within 8 figures (a letter's holes). New test `plus_fills_draw_the_same_in_any_fill_mode` (also on
  the structure and cycle starters). T5 and T6 draw shapes that stay one path. Copy stays within 1.1.2's time
  (decision 0023's table); `make_office_emf` is 2.3 times `make_emf` at most, inside J4's bound.
- Checks on bd7c684 + this branch: `cargo test` 174 pass; the Windows type check, debug and release, clean; full
  `npm test` 169 of 169, and 170 of 170 with 1.1.3's AI switch off (applied for the check, then taken out).
- An EMF+ pen under 1/20 pt: the pen is now at least 1/20 pt, as the GDI pen, so its dashes match.
- A picture under 0.014 pt: its frame is at least 0.01 mm each way, so Word gets a size (both EMFs).
- S12 (right-to-left text) was J6; the Windows tests on every push were J8.
- Left: the MCP's `run_command` cut and paste (gap 2, the MCP session's; no MCP in 1.1.3); EMF+ records over 65,020
  bytes for one mitred structure of over about 7,000 points (T6 decides); usvg's own stack on deep nesting (not this
  item).

## ChemDraw cross-check

Sources: `~/octet-research/notes/chemdraw26-inventory.md` (Preferences > General: "Use antialiasing: n/a" on the
Mac; Copy As; Paste Special; Show Clipboard), `chemdraw-inventory.md` (Preferences > General, line 538: antialiasing),
`clipboard-blackbox.md` (ChemDraw's clipboard on the Mac and what Word gives back), `help26/text/` and
`help26/v22/text/` (Embedding_Objects_Windo: Edit Graphic Object; Setting_Preferences: File > Preferences > General),
`research_notes/ChemDraw complaints from chemists/interop_formats_features.md` (line 62: pastes into Word look low
resolution unless anti-aliasing for Windows metafiles is on), Revvity support article 4408239935508 (read 17 November
2026), decision 0011 (ChemDraw 25.5's 14 Windows clipboard formats), and the pictures of ChemDraw objects in Word
documents (190 of 192 ChemDraw objects and 179 of 179 MestReNova objects in five documents are EMF+ dual EMFs with
anti-aliasing on, labels as EMF+ strings). No ChemDraw files were opened for this item: it changes no CDXML or CDX.

| ChemDraw | Octet after this item |
| --- | --- |
| Object pictures in Word are EMF+ dual, anti-aliased, text as text | Same |
| File > Preferences > General > Use Antialiasing When Generating Windows Metafiles (the old reason to turn it off was printer drivers; on by default in new versions) | Always on. No setting (D9) |
| Double-click opens the object in ChemDraw (Edit Graphic Object) | Unchanged (decision 0023) |
| Word's Paste Special > Picture (Enhanced Metafile) gives a plain picture | Same in Word; Octet also has Office object off |
| Copy As, Show Clipboard | Not part of this item; unchanged |
| Palette, Object, Curves, Color and Text menus, context menu, CDXML attributes | Nothing applies: the picture holds no new data |

Missing for Sam: ChemDraw's anti-aliasing setting itself (D9 says why Octet has none).

## Rules every part keeps

- The object stays: "Embed Source", "Object Descriptor", the storage's streams, the class and the formats' order are
  byte for byte as in 1.1.2. Double-click, Update, Close and Return, Quit and paste back into Octet are unchanged.
- True size stays: the EMF header (bounds, frame, reference device, millimetres) is `make_emf`'s except the byte and
  record totals. `OctetSize`, `GetExtent` and the Object Descriptor give the same size.
- The GDI records are the fallback, and they are 1.1.2's: a program that reads no EMF+ draws what it drew.
- Only the object's picture changes. Office object off, the class not registered, Export as EMF (File > Export, Quick
  export, `--convert`, the MCP's `read` with format emf), the Mac's copy for Office and Linux keep their bytes. One
  exception, a fix (D11): text in a right-to-left script becomes outlines in every EMF.
- The CDXML comment stays, so paste reads the drawing out of the picture, in 1.2 and in 1.1.2.
- Copy is no slower than 1.1.2's (decision 0024).
- No new dependency. No `unsafe` outside the Windows test code that already plays metafiles.
- The bytes follow MS-EMFPLUS. Where the spec is silent and GDI+ is the judge (fill mode, very large records), a
  Windows CI test decides, and the code names the test.
- The branch builds and tests on b30f413 and on the current `release-1.2-mcp`. No merge commit on the branch.

## Design

D1 to D10 are built. D11 to D13 are new.

### D1. One walk, two streams

`make_office_emf(tree, cdxml)` and `make_emf` share one writer that walks `marks()` once. With EMF+ off the writer
gives `make_emf`'s bytes exactly. With EMF+ on it adds EMR_COMMENT records that hold EMF+ records, and nothing else:
the EMF header; the EMF+ header comment (dual, version 0xDBC01002, video display, 96 dpi; anti-aliasing high quality,
text anti-aliased, pixel offset half, interpolation high quality bicubic, page unit pixels); the CDXML comment; the
GDI set-up records; for each mark, one comment with its EMF+ records, then its GDI records; EmfPlusEndOfFile; EMR_EOF.
Strip the EMF+ comments and the bytes are `make_emf`'s (for a drawing with no photo).

### D2. Coordinates

EMF+ draws in device pixels of the 96 dpi reference: a point is pt × 4/3, as a float. The GDI records draw it at
pt × 20 logical units, 15 to a device pixel. So every EMF+ coordinate × 15 equals the GDI one within its rounding.

### D3. Shapes

A path object with float points (start, line, Bézier, close flags). Fill: EmfPlusFillPath with the colour inline. A
nonzero fill sets PathPointFlags bit 0x2000, as GDI+ writes its winding paths; even-odd leaves it clear (T5 decides).
A nonzero fill's figures are in more than one path where that makes even-odd readers draw the same (Finish, above).
Stroke: a pen object with width, caps, join (miter clipped, as SVG), miter limit and dashes in pen widths; then
EmfPlusDrawPath. Each object id is used again for the next shape.

### D4. Labels

Each GDI text run also gets EmfPlusDrawDriverString: the same Windows face, em size in px, bold at weight 600 or more,
italic, the run's colour, and each character's origin on the baseline. A run with an odd count gets one space at its
end so the record is a multiple of 4 bytes. Text that is outlines in the GDI records is outlines in EMF+ too. Labels
stay text, as ChemDraw's do, so Word's Save as PDF and a printer get text.

### D5. Photos

EmfPlusGetDC, then the picture's GDI records, self-contained (SAVEDC, the mapping again, the existing stretch,
transform and STRETCHDIBITS records, RESTOREDC). The pixels go in once.

### D6. Very large shapes

A 500-residue peptide's bonds are one path of about 25,000 points (about 230 KB), written as one EmfPlusObject record.
T6 checks GDI+ draws it, and prints which continued layouts it also takes.

### D7. Where the EMF+ picture goes

Copy on Windows when the object goes on (CF_ENHMETAFILE), and every picture the object window sends (open, after
each change, Update, Close and Return, Word's Close, Quit). CF_METAFILEPICT stays the EMF converted by Windows. Export
as EMF stays GDI only: other programs (LibreOffice, Inkscape, Illustrator) read GDI records best, and Word already
smooths a plain picture.

### D8. Copy speed

The EMF+ EMF is made on a thread beside the bitmap. Measured: Copy within 1.1.2's time (decision 0023's table).

### D9. No new switch

The reporter's switch exists: Settings > Import and export > Copy > Office object (Windows only, on by default; the
Settings search finds it for "word"). Off, Copy is 1.1.2's plain copy to the byte, which is 1.1.1's formats in
1.1.1's order. After this fix the object's picture is as smooth as the plain picture, so the reason the reporter gave
is gone. The reasons left for a plain picture (a journal that takes pictures only, a smaller document) are what that
switch is for, and Word's Paste Special > Picture gives one plain paste. A second switch in Settings > General > Word
would do the same thing in a second place. No UI change.

### D10. Objects made with 1.1.2

A document keeps the picture Word cached. An object pasted from 1.1.2 stays aliased until its picture changes:
double-click it, then File > Update (Ctrl+S), which sends a picture changed or not. Octet does not change a document
the user did not change.

### D11. Right-to-left text is outlines (new)

`pick_runs` returns None (outlines) when a glyph's character is in a right-to-left or joining script: U+0590 to
U+08FF (Hebrew, Arabic, Syriac, Thaana, N'Ko, Samaritan, Mandaic and the Arabic supplements), U+FB1D to U+FDFF and
U+FE70 to U+FEFF (their presentation forms), or a direction mark (U+200E, U+200F, U+202A to U+202E, U+2066 to
U+2069). The check is a range test per glyph, beside the tests that are already there.

Reasons: outlines draw what usvg drew, in both streams, with no reordering by GDI and no joining forms lost by
DrawDriverString. It is what the comment on `pick_runs` has said since issue 20. Both EMFs share `pick_runs`, so Export
as EMF gets the fix too (consistency); no Latin, Greek or Cyrillic label changes, so the existing CRC tests stay.
Other complex scripts (Devanagari, Thai) are already outlines when a glyph stands for more than one character, which
is how usvg gives their joined forms.

### D12. The Windows tests run on every push (new)

`check.yml` runs on every push to every branch, and its smoke job already builds Octet on `windows-latest`. It gets
one step, Windows only, after the smoke run: `cargo test --manifest-path src-tauri/Cargo.toml --bin octet ole --
--nocapture`. So the picture tests (and the object's other tests) run when Sam pushes `release-1.2-mcp`, with no
click. `platforms.yml` keeps its steps for `main` and Run workflow. Reason: one step reuses the job's checkout,
toolchain, cache and `npm ci`; a new job would repeat them.

### D13. Fit to the moved base (new)

In this branch's new tests only: `crate::export::crc32(..)` becomes `crc32fast::hash(..)` (a direct dependency on
both bases), and `registered(..)` in T7 becomes `crate::clipboard::win::format(..) as u16` (public on both bases). Then
the branch compiles on b30f413 and on the merge with the current `release-1.2-mcp`. Proof without merging: `git
merge-tree --write-tree HEAD origin/release-1.2-mcp`, `git archive` of that tree into the scratchpad, and the checks
below run there.

### If CI says no

- T5 (fill mode) fails: GDI+ ignores bit 0x2000. A nonzero fill with more than one subpath is then drawn as one
  even-odd path when that gives the same ink (a test of the subpaths' crossings decides), else through EmfPlusGetDC
  with its GDI records (aliased, that shape only).
- T6 fails for one record: write continued objects in the layout `ole_plus_large_path_continued` found.
- T4 (GetDC) fails: the photo goes in as an EMF+ image object of its own PNG or JPEG bytes.
- T7 shows the cache keeps a WMF or the bitmap: the copy's data object offers its formats so the cache takes the EMF.

## Siblings (consistency pillar)

Every way a picture of an Octet drawing gets into an Office document on Windows:

| Route | Picture after this item |
| --- | --- |
| Edit > Copy, Ctrl+C, the context menu's Copy (object on) | EMF+ |
| Edit > Cut, Ctrl+X | EMF+ |
| Copy with Check Structure on Copy (after Ignore All) | EMF+ |
| The MCP's `run_command` copy | EMF+ (the page's own Copy) |
| The MCP's `run_command` cut and paste | Do nothing during a call (gap 2; scope cut) |
| Object window: open, after each change, File > Update, Close and Return, Word's Close, Quit | EMF+ |
| Insert > Object > Create New, or Create from File (.oct), then Update | EMF+ |
| A program that asks the object for a Windows metafile | WMF converted by Windows, as now |
| Word's Paste Special > Picture (Enhanced Metafile) after an Octet copy | EMF+ |
| Office object off, or the class not registered | 1.1.2's EMF (D11 aside) |
| Export as EMF, Quick export, `--convert`, MCP `read` emf | 1.1.2's EMF (D11 aside) |
| Mac: Office's copy (PDF comment), Update in Word | Unchanged (D11 aside) |
| Linux: PDF, PNG, SVG; LibreOffice extension | Unchanged |
| Paste into Octet of Word's copy (Embed Source, or the picture alone) | Reads the drawing, as now |

What a drawing can hold, each through both streams: bonds, wedges and hashes, dashed and wavy bonds, arrows (filled,
stroked, curved, dashed), labels and captions (sub- and superscripts, colour, bold, italic), outlined text, shapes
(rectangles, ellipses, brackets, orbitals with even-odd fills), ring fills, highlights at part opacity, reagent
tables, charts, spectra, TLC plates and gels, and photos. Rotated and flipped objects carry their transform in the
points. Dark mode does not change the copied picture.

## MCP surface

No new function, so no new tool. `run_command` copy runs the page's Copy and gets the EMF+ picture on Windows. `read`
with format emf is Export's EMF (D11 is its only change). `run_command` cut and paste are gap 2: the MCP session's,
reported with the cause, not changed here.

## Files and formats

| Format | Change | Octet 1.1.2 with the new bytes |
| --- | --- | --- |
| .oct, CDXML, CDX, SDF, MOL, SMILES | None | As before |
| Clipboard on Windows, object on | CF_ENHMETAFILE is EMF+ dual; every other format the same bytes | Pastes Octet's JSON or Embed Source first; from the picture alone it finds the CDXML comment (same reader) |
| Clipboard on Windows, object off | None (D11 aside) | As before |
| Object picture in Word, PowerPoint, Excel (`word/media/imageN.emf`) | EMF+ dual | Paste of Word's copy: Embed Source first, then the picture's CDXML |
| Embed Source storage (Octet, OctetSize) | None | Opens the object as before |
| Export EMF | Right-to-left text as outlines (D11) | Pastes or opens it as before |
| Other exports, Mac and Linux clipboard | None (D11 aside for the Mac's EMF in Office's copy) | As before |

ChemDraw for Windows pastes Octet's copy through CDX, which does not change.

## Jobs

### J1. The EMF+ writer (`vector.rs`). Done.

`make_emf` gives the same bytes (CRC tests); `make_office_emf` reads valid by MS-EMFPLUS; without its EMF+ comments it
is `make_emf`'s; both streams draw the same points, colours, pens and text; the header is `make_emf`'s but the totals;
the same input gives the same bytes. Tests: `plus_records_follow_ms_emfplus`, `plus_draws_each_case`,
`plus_pens_carry_caps_joins_and_dashes`, `plus_bytes_are_steady_and_small`.

### J2. The EMF+ picture where Word draws it. Done.

Copy with the object puts `make_office_emf` on; without it, 1.1.2's bytes (CRC test); `update` makes
`make_office_emf`; the Windows type check is clean, debug and release.

### J3. Proof on Windows. Written; not run yet.

T1 `ole_plus_is_smooth`, T2 `ole_plus_ink_box_and_gdi_pixels`, T4 `ole_plus_photo`, T5 `ole_plus_fill_mode`, T6
`ole_plus_large_path` (and `ole_plus_large_path_continued`, information only), T7
`ole_cache_keeps_the_plus_picture`, T8 `ole_plus_labels`, T9 `ole_plus_zoom`, and
`ole_stress_gdiplus_draws_every_drawing`. Done when they pass on GitHub's Windows machine (J8 makes that automatic).

### J4. Speed and size. Done.

`windows_copy_time` (release, ignored): Copy within 1.1.2 + 10% + 2 ms for L-proline, 40 paclitaxels and a
500-residue peptide; `make_office_emf` at most twice `make_emf` and 15 ms for 40 paclitaxels; EMF+ EMF at most 3 times
the GDI EMF. Numbers in decision 0023.

### J5. Documents. Done; J10 adds D11.

### J6. Right-to-left text is outlines (D11). Done.

Done when:
- `stress_s12_right_to_left_text_is_outlines` passes: Hebrew, Arabic, Arabic with Latin, and a Hebrew letter after
  Latin give no EXTTEXTOUTW and no DrawDriverString for those characters, in `make_emf` and `make_office_emf`.
- A new test in `vector.rs` checks a direction mark alone in a Latin label makes it outlines.
- The existing CRC tests and `labels_are_text_at_their_glyph_positions` pass unchanged (Latin labels stay text).
- `windows_copy_time` still passes (release, run alone).

### J7. The stress check matches this plan. Done.

Done when:
- `src/wordpaste-stress.check.ts` lists the 20 cases below with these ids, each with the tests named in the table, and
  asserts there are 20.
- Gap 2 is no longer one of its cases: the MCP cut and paste go to the MCP session (scope cut).
- `node src/wordpaste-stress.check.ts` passes.

### J8. The Windows tests run on every push (D12). Done.

Done when:
- `check.yml`'s smoke job has the step, Windows only, and the file parses (`ruby -ryaml -e
  'YAML.load_file(".github/workflows/check.yml")'`; Node has no YAML reader here).
- The check asserts the step is there and that each Windows test's name starts with "ole".

### J9. Fit to the moved base (D13). Done.

Done when:
- The branch compiles and its tests pass on b30f413 (as now).
- In the merge-tree of HEAD and `origin/release-1.2-mcp`, extracted to the scratchpad: `cargo check --tests --bin
  octet` (Mac) and with `--target x86_64-pc-windows-msvc` have no errors or warnings; the item's Mac tests pass;
  `node src/wordpaste-stress.check.ts` passes (with this worktree's `node_modules` linked).

### J10. Finish. Done.

Done when:
- Full `npm test` passes on the branch (162 of 162).
- `cargo test` (Mac, all) passes; the Windows type check, debug and release, is clean.
- Decision 0023 says right-to-left text is outlines in every EMF, and that the picture tests run on every push.
- What's New lines go back to the release session (below). `src/releases.ts` is not changed.

## Stress list

Old ids (S and M, from the 46-case list) in brackets, so the tests that already exist map across.

| # | Case | Expected | Checked by |
| --- | --- | --- | --- |
| S1 | Empty drawing: Insert > Object > Create New, then Update with nothing drawn [S1] | EMF+ header, set-up and end only; GDI+ draws nothing, no error | `plus_draws_each_case`, `stress_every_office_emf_reads_by_the_specs` |
| S2 | Labels: one letter ("O"); 10 faces; weights 100 to 900; 0.05 pt and 280 pt; a 2,000-character caption [S2, M4] | Glyph counts even, records a multiple of 4; text where GDI puts it; faces Windows lacks are outlines | `stress_text_runs_and_outlines`, T8 |
| S3 | Text GDI cannot draw as text: Hebrew, Arabic, Arabic with Latin, an emoji, underlined, a face Windows lacks [S12] | Outlines in both streams (J6) | `stress_s12_right_to_left_text_is_outlines`, `stress_text_runs_and_outlines` |
| S4 | 40 paclitaxels, and a chemist's page of 200 structures with 949 labels [S3, M1, M9] | Copy within J4's bound; EMF+ at most 3 times the GDI EMF; GDI+ draws it | `windows_copy_time`, `stress_copy_time`, `ole_stress_gdiplus_draws_every_drawing` |
| S5 | A 500-residue peptide: one path of about 25,000 points, a record over 65,020 bytes [S4, M13] | GDI+ draws the one record (else the continued layout T6 found) | `stress_large_drawings_sizes`, T6 |
| S6 | Photos: 12 megapixels; turned 30 and 45 degrees [S5, S7] | One GetDC section each; under 1 KB more; GDI+ draws it in GDI's box | `stress_photos_are_getdc_sections`, T4 |
| S7 | A structure turned 30 degrees and flipped, with labels [S6] | Turned labels outlines in both streams; points match | `plus_draws_each_case` |
| S8 | Fills: overlapping subpaths in one nonzero path (a crowded atom, two ring fills); an even-odd orbital lobe [S8, S9] | Overlap filled, also by a reader that fills even-odd; the lobe's hole stays | `plus_draws_each_case`, `plus_fills_draw_the_same_in_any_fill_mode`, T5 |
| S9 | Pens: dashed bonds; a dashed curved arrow with round caps; 0.1 pt and 10 pt lines; odd dash lists, a negative offset, 1/1000 pt dashes [S10, M5] | Dashes in pen widths, as many as the GDI pen's; ink box as GDI's | `stress_pens_and_dashes`, `plus_pens_carry_caps_joins_and_dashes`, T2 |
| S10 | Colour by Element; a highlight at 40% opacity; Copy in dark mode [S11, S26] | EMF+ colours equal the GDI colours, alpha 255; dark mode gives the light mode's bytes | `plus_draws_each_case`, the check's export code test |
| S11 | Hostile pictures copied: deep nesting, 200,000 points, a scale of 1e-30, control characters, a broken image, 10,000 labels, a poster 2 m wide, a picture 10 km wide [M3, S25] | No panic; valid by the specs; GDI coordinates in range; size limits kept | `stress_hostile_pictures`, `plus_draws_each_case` |
| S12 | A damaged EMF pasted: every truncation, bytes changed, record sizes 0, odd, huge and past the end; an EMF+ comment longer than the file [S17] | Paste reads nothing from a broken picture; never panics; quick | `stress_paste_reads_damaged_office_emfs_safely`, `paste_reads_the_plus_emf_and_refuses_a_hostile_one` |
| S13 | Paste back: Word's copy into Octet 1.2 and 1.1.2; the EMF+ picture alone; a CDXML comment with odd padding, UTF-8, "EMF+" inside it, 6 MB [S16, M8, M14] | The whole drawing; Octet's own forms first; from the picture, 1.1.2's reader finds the CDXML | `stress_cdxml_comment_round_trips`, the check's reader hashes and paste order |
| S14 | Plain copies: Office object off; class not registered; Export as EMF, Quick export, `--convert`, MCP `read` emf; the Mac's Office copy [S13, S14, S15, M17] | 1.1.2's bytes (D11 aside); CDX and CDXML unchanged | `windows_copy_with_and_without_the_object`, `mac_copy_puts_offices_copy_first`, the check |
| S15 | Ctrl+C 20 times fast, two selections in turn, from 4 threads; Undo and Redo in an object window with Update after each [S18, S21] | Each copy waits for its thread; the same input gives the same bytes | `windows_copies_in_a_row_give_the_same_bytes`, `stress_same_bytes_on_many_threads` |
| S16 | An object pasted from 1.1.2 [S20] | Unchanged until File > Update; smooth after | The check (Update always sends); `ole-manual.md` test 16 |
| S17 | Two objects from two documents open and changed, then Quit [S22] | Both documents get EMF+ pictures | `ole-manual.md` test 15 |
| S18 | Word at 10% to 500%; printed; Save as PDF [S19, S29] | Smooth at every zoom; vector bonds and text labels in print and PDF | T9; `ole-manual.md` test 16 |
| S19 | Word without Octet's class (run as administrator); the document opened in Word for Mac [S27, S28] | A picture only, the EMF+ copy, smooth; Word for Mac shows the picture | `ole-manual.md` test 16 |
| S20 | AI apps: `run_command` copy while another AI session edits; a misspelt copy; `read` with format "emf+", "wmf" or 42 [S23, S24] | Copy is the page's Copy, of the selection at that moment, EMF+; bad arguments refused as now | The check (copy wiring, MCP calls) |

## Acceptance

| Check | Covers |
| --- | --- |
| `cargo test --bin octet` (Mac): plus and stress tests, CRC tests, the J6 test | J1, J2, J6, S1 to S3, S5 to S15 |
| `cargo check --target x86_64-pc-windows-msvc --tests --bin octet`, debug and release | J2, J3 type check |
| Windows CI (J8 step, `cargo test --bin octet ole -- --nocapture`): T1 to T9 and the stress drawing test | J3, S4 to S6, S8, S9, S18 |
| `windows_copy_time`, release, run alone, compared with 1.1.2's path in the same run | J4, J6 speed, S4, S5 |
| `node src/wordpaste-stress.check.ts` | J7, J8, S10, S13, S14, S16, S20 |
| Merge-tree with the current `release-1.2-mcp`: Mac and Windows type checks, the item's tests, the check | J9 |
| Full `npm test` and `cargo test` on the branch | J10 |
| By hand on Windows (`docs/testing/ole-manual.md` tests 15 and 16): paste into Word, PowerPoint and Excel at 100% and 400%; print and Save as PDF; offset 120 of `word/media/image1.emf` reads "EMF+"; a 1.1.2 object before and after Update; Word as administrator; open on the Mac | S16 to S19 |

What stops a check here: there is no Windows computer and no Office for Windows on this Mac, and Word must not be
driven. T1 to T9 run on GitHub's Windows machine on Sam's next push (J8). Word, PowerPoint and Excel need Sam or
Prof. Schramm.

## Not in this item

- An AI app's `run_command` cut and paste doing nothing during a call (gap 2). Not caused by this item; the guard is
  the MCP session's (2685d77). Reported to them with the cause: `onCut` and `onPaste` return while `mcpCalling` is set,
  and `clipCommand` sends its event during the call.
- A new Settings switch (D9).
- ChemDraw's anti-aliasing setting (always on; D9).
- EMF+ in Export as EMF, in the plain Windows copy, or in the Mac's copy for Office (D7).
- A smoother WMF for programs that ask for one (old programs only).
- Refreshing a 1.1.2 object's picture without Update (D10).
- LibreOffice reading Octet's EMF+ (no LibreOffice for Windows here; issue 48 owns it).
- Running the Windows workflow: only Sam can push or click Run workflow.

## Build notes (17 November 2026)

- The SVG's miter join is GDI+'s LineJoinMiterClipped. GDI+ has no square dash cap, so with square caps each dash
  is a pen width longer and starts half a width earlier. A dash or gap is at least 1/20 pt, as in the GDI pen.
- T1 and T4 assert on GDI+ drawing into a DC (as Word draws). T6's continued layouts are an ignored test of their
  own, run by a `platforms.yml` step that may fail, so a layout GDI+ misreads cannot end the asserted tests.
- Octet's bond outlines overlap a little where bonds meet: drawn even-odd, 42 of L-proline's 4,918 ink pixels at 4 px
  a pt would be white. So T5 matters.
- J4's paclitaxel and peptide come from a generator (`octet_drawing` in `vector_plus_tests.rs`) with Octet's
  export's shapes and counts.

## What's New lines (for the release session)

- When you paste a drawing into Word, PowerPoint or Excel for Windows, its bonds and labels are smooth at all zoom
  levels and in print.
- To make a drawing that you pasted with Octet 1.1.2 smooth, double-click it in Word and choose File > Update.
- When you export a drawing as EMF, or paste it into Word for Windows, Hebrew and Arabic labels show as they do in
  Octet.
