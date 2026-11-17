# Issue 48: Octet drawings in LibreOffice on Windows and the Mac

Branch `item/48-libreoffice-win-mac`, from `release-1.2-mcp` b30f413. For release 1.2 (Friday 20 November 2026).
Extends decision 0025, which is Linux only.

What Sam wrote on the issue (13 November): "LibreOffice on Windows and on the Mac does not have this yet." This plan
gives Windows and the Mac what Linux has in 1.1.2: Settings > General > Add to LibreOffice, a double-click on a
structure in Writer, Impress or Draw that opens it in Octet, Update that puts the picture back as one Undo step, and
a paste from Octet that LibreOffice keeps as an Octet picture.

LibreOffice is not installed on this Mac and must not be installed for this work. Everything below is proved with
simulated install folders, the extension's Python run by the system `python3` with stubbed UNO modules, Rust tests,
and `cargo check --target x86_64-pc-windows-msvc`. A real run on Windows and on a Mac is a short checklist at the end
(it goes into `docs/testing/libreoffice-manual.md`).

## 1. What is there now

Read on this branch (b30f413).

| Part | Where | State |
| --- | --- | --- |
| The extension | `tools/libreoffice/octet_draw.py` | Linux only. See the rows below. |
| Folder for the hand-off | `octet_draw.py:172-181` | `$XDG_RUNTIME_DIR/app/<id>/`, else `mkdtemp`. Works on any system, but the Flatpak folder is Linux only. |
| Finding Octet | `octet_draw.py:134-168` | Linux only: `octet-path`, `/usr/bin/octet`, Flatpak, PATH. `noted_octet` calls `os.getuid`, which Windows' Python does not have. |
| Starting Octet | `octet_draw.py:247-283` | `systemd-run`, else `Popen(..., start_new_session=True)`. On the Mac this starts a second Octet process each time: the Mac has no single-instance hand-off. |
| New files, reads | `octet_draw.py:185-210` | `os.O_NOFOLLOW` (Windows' Python has none: AttributeError, so a double-click silently does nothing) and no `os.O_BINARY` (Windows would open in text mode). |
| Pictures it knows | `octet_draw.py:64-112` | PDF only (`0fdp` in LibreOffice's own form). An EMF with Octet's CDXML comment (Octet's Windows copy, Word for Windows documents) opens nothing (0025, Not done). |
| Programs | `octet_draw.py:39`, `Addons.xcu` | Writer, Impress, Draw. No Calc, although Excel is a sibling on Windows (decision 0023). |
| Insert's temporary copy | `octet_draw.py:327-334` | `os.unlink` in `finally` is not guarded. On Windows a file still held raises, `put` catches it and marks the session `gone`. |
| The .oxt in installers | `src-tauri/tauri.linux.conf.json` | Linux bundles only. `build.rs:14-46` builds the .oxt on every system already. |
| Add to LibreOffice | `src-tauri/src/main.rs:562-573`, `1356` | `#[cfg(target_os = "linux")]`, runs `unopkg` from PATH. |
| Settings row | `src/SettingsWindow.tsx:41-42`, `627-631` | Shown only when `navigator.platform` is Linux. |
| Object windows for files | `src-tauri/src/objects.rs` | On every system. `Kind` is PDF or CDXML only (`objects.rs:217-243`). Update writes with one rename (`objects.rs:270-273`, `main.rs:426-441`), no retry. |
| Hand-off to a running Octet | `main.rs:1319-1331` | Windows and Linux: the single-instance plugin passes `--object` to the running Octet. The Mac has none, and `RunEvent::Opened` (`main.rs:1486`) sends every file to `open::offer`, which opens a PDF as an ordinary drawing. |
| Paste from LibreOffice | `src-tauri/src/clipboard.rs:109`, `126`, `139` | LibreOffice's own copy (SVXB) is read on Linux only. Mac and Windows have no name for it. |
| MCP | `src/mcp.ts:278-288` | No command for Add to LibreOffice. `save` in an object window is Update. |
| Tests | `src/libreoffice.check.ts` | Linux shapes only; asserts `tauri.linux.conf.json` and the LINUX gate. |

So the gap is real: on Windows the extension cannot work at all, on the Mac it starts a second Octet, neither
installer carries the .oxt, and Settings hides the button. `gap_confirmed` is true.

### What LibreOffice does, from its public source

These decide the design. Each one is on the real-run checklist.

- Mac clipboard: LibreOffice maps `com.adobe.pdf` to `application/pdf` (`vcl/osx/DataFlavorMapping.cxx`). Octet's
  Mac copy has the PDF (after Office's zip, which LibreOffice does not know), so LibreOffice pastes the PDF, as on
  Linux. Its own copy of a picture goes on the pasteboard under its MIME name; the table spells it `svbx`, the format
  itself is `svxb`. Octet reads both.
- Windows clipboard: Writer's and Impress's paste tables (`sot/source/base/formats.cxx`) take the GDI metafile
  before PDF, PNG and OLE objects, and LibreOffice offers a GDI metafile for an EMF. `vcl/source/treelist/transfer.cxx`
  imports that EMF "directly into Graphic to preserve GfxLink", so the picture keeps the EMF's own bytes, and with
  them Octet's CDXML comment. So a paste from Octet on Windows is an EMF picture, not an Octet OLE object.
- LibreOffice's own form of a vector picture (`vcl/source/gdi/TypeSerializer.cxx`) is a 4-byte magic, the length, then
  the bytes. The PDF magic reads `0fdp` (0025); EMF is `0fme`.
- Windows install: `HKLM\Software\LibreOffice\UNO\InstallPath` (default value: the `program` folder) and App Paths
  `unopkg.exe` (`scp2/source/ooo/registryitem_ooo.scp`). A per-user install writes the same under HKCU.

## 2. ChemDraw cross-check

Sources read: `~/octet-research/notes/help26/v22/text/Embedding_Objects_Windo.txt`,
`~/octet-research/notes/help26/text/Sharing_Information.txt`, `~/octet-research/notes/chemdraw26-inventory.md`
("Clipboard, files and paste"), `~/octet-research/notes/clipboard-blackbox.md`, `~/octet-research/notes/menus/`
(`live-menus.md`, `cocoamain.txt`), decisions 0011 and 0023, and the limits in
`~/octet-research/private/CLAUDE-research.md`. No ChemDraw run was needed: the feature adds no drawing object.

| ChemDraw gives | Octet after this item |
| --- | --- |
| Copy a drawing into another program as an object | Have: PDF (Mac, Linux), EMF (Windows), each with the CDXML. |
| Drag a drawing into another program as an object | Missing on every system (Octet has no drag-out). Cut, below. |
| Double-click the object to edit it in ChemDraw | Have on all three after this item (LibreOffice through the extension; Word on Windows through OLE; Word on the Mac through Settings). |
| Closing ChemDraw's window puts the changes back | Have: Close and Return, window close and Quit send the newest drawing; Update (⌘S, Ctrl+S) sends it at once. |
| Windows: the object stays in the document | Word: OLE (0023). LibreOffice: the picture holds the CDXML; no OLE needed. |
| Palette, Object, Curves, Color and Text menus, context menu, dialogs, CDXML attributes | None for this feature. ChemDraw has no LibreOffice integration and no menu item for it. |

ChemDraw's own pictures: a ChemDraw PDF (Mac) pasted into LibreOffice opens in Octet, as on Linux. A ChemDraw EMF
(Windows) has no CDXML in it (0011), so LibreOffice keeps its own double-click there.

## 3. Jobs, each with what done means

### J1. The extension in every installer, and Add to LibreOffice on every system

- `bundle.resources` in `tauri.conf.json` gets `"gen/octet-draw.oxt": "libreoffice/octet-draw.oxt"`;
  `tauri.linux.conf.json` goes (it held only that).
- `add_to_libreoffice` moves from `main.rs` to a new `src-tauri/src/libreoffice.rs`, on every system. It finds
  `unopkg` and runs `unopkg gui <oxt>` as fixed arguments; if there is none or it does not start, it opens the .oxt
  with the system (`open_external`), which LibreOffice owns on all three (Windows: `soffice -o`). A failure is the
  existing notice "Octet cannot open LibreOffice."
- Where `unopkg` is looked for, in order, as a pure function over a list of candidates and an `exists` test:
  - Linux: as today (`unopkg` on PATH, through `linux::spawn`).
  - Mac: the app LaunchServices gives for `org.libreoffice.script`, then `/Applications/LibreOffice.app`, then
    `~/Applications/LibreOffice.app`; in each, `Contents/MacOS/unopkg`.
  - Windows: `Software\LibreOffice\UNO\InstallPath` (default value) under HKCU then HKLM, 64-bit view then 32-bit;
    then App Paths `unopkg.exe` (HKCU, HKLM); then `%ProgramFiles%\LibreOffice\program`,
    `%ProgramFiles(x86)%\LibreOffice\program`, `%LOCALAPPDATA%\Programs\LibreOffice\program`; in each,
    `unopkg.exe`. Started with `CREATE_NO_WINDOW`, so no console shows.
- Settings > General > LibreOffice shows on every system, the same row and button as on Linux.

Done: the .oxt is in the Mac, Windows and Linux bundles (config test); the finder picks the right file in simulated
folders and registry values on each system (Rust tests); `cargo check` passes for the Mac and for
`x86_64-pc-windows-msvc`; the Settings row renders as its siblings in WebKit (`npm run look`).

### J2. The extension runs on Windows and the Mac

In `octet_draw.py`, one system switch (`sys.platform`) and three small parts per system. Linux code paths stay as
they are.

- Files: `NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)`, `BINARY = getattr(os, "O_BINARY", 0)` in every `os.open`.
- Folder: Linux as today. Windows and the Mac: `tempfile.mkdtemp(prefix="octet-libreoffice-")` in the user's own
  temporary folder (mode 0700 on the Mac; the user's profile on Windows).
- Finding and starting Octet:
  - Windows: the program Octet's OLE class names, `Software\Classes\CLSID\{211EF98F-…}\LocalServer32` (HKCU,
    64-bit then 32-bit view; the installer writes it and every release start repairs it, decision 0023). Taken only
    if it is a quoted or plain absolute `X:\…\*.exe` path to a regular file that is not a link; no UNC path, no
    relative path, no arguments. Started with `subprocess.Popen(list)` (no shell), `DETACHED_PROCESS |
    CREATE_NEW_PROCESS_GROUP`, without `PYTHONHOME` and `PYTHONPATH`. Before that,
    `AllowSetForegroundWindow(ASFW_ANY)` through `ctypes`, in `try`, so the Octet that takes the hand-off can bring
    its window to the front.
  - Mac: see J3. `/usr/bin/open -b io.github.samchemman.octet-draw <file>`, no shell.
  - Not found or does not start: the existing message ("LibreOffice cannot find Octet Draw. Open Octet Draw once,
    then try again."), and the folder goes.
- Insert's temporary copy: `os.unlink` in its own `try`; a copy LibreOffice still holds stays in the temporary
  folder, and the session is not marked `gone`.

Done: the Python tests run the Windows and Mac branches with stubbed `winreg`, `ctypes` and `subprocess`, and the
Linux tests still pass unchanged.

### J3. The Mac: Octet takes the hand-off from a running or a closed Octet

On the Mac a second `octet --object …` process would be a second Octet. macOS gives a running app its files by Apple
Event, so the extension uses `open -b`, and the arguments travel in a small file:

- The extension writes `object` (a new file, mode 0600) beside the picture's file in its 0700 folder: the program's
  name (Writer), a line end, then the document's name (its first 260 characters, line ends made spaces).
- Octet's `RunEvent::Opened` asks `objects::marked(path)` first. A path is an object only if: its name is
  `drawing.pdf` or `drawing.emf`; its folder is a real folder (no link) that the user owns with mode 0700 or
  stricter; and `object` in it is a regular file (no link) the user owns, 4 KB at most, UTF-8. Then
  `objects::open_file(path, host, program)`, as on Linux and Windows. Every other file goes to `open::offer` as now.
- A second double-click on the same picture runs `open -b` again; `open_file` finds the path and brings that window
  to the front. `object` is written once per session.
- When Octet was not running, `open` starts it and the file arrives after start-up, so Home opens as well, as on
  Linux.

Done: Rust tests of `marked` with real folders: a good one; the folder a link; mode 0755; `object` missing, a link,
empty, over 4 KB, not UTF-8; a wrong file name. (Another owner needs root, so the owner rule is read in the code, not
tested.) Python tests of the marker text and the `open` arguments.

### J4. Windows: the hand-off that is there, made safe

- The single-instance plugin already passes `--object` (`main.rs:1326-1330`), and a first start reads it
  (`main.rs:1367`, `1420`). No change.
- Update's rename can meet the extension reading the file (Windows refuses to replace an open file). `objects::write`
  retries the rename up to 20 times, 25 ms apart, on Windows only, on `PermissionDenied`. Save is not touched.
- Command line: Python's `list2cmdline` and Rust's argument reader follow the same Microsoft rules. A test parses
  `list2cmdline` output for hostile document names with those rules.

Done: Rust test of the retry with a stand-in that fails twice; the command-line test; `cargo check` for Windows.

### J5. EMF pictures

- Extension: `picture_of(graphic)` replaces `pdf_of`. It serialises only pictures whose `MimeType` is
  `application/pdf`, `image/x-emf` or `image/emf`, and takes `0fdp` as PDF and `0fme` as EMF. `has_drawing` gets an
  EMF branch: at most 64 records, each 8 bytes or more, a multiple of 4 and inside the data; a record 70
  (`EMR_COMMENT`) whose data starts with `Octet CDXML\0` (the tag in `vector.rs:463`) and has `<CDXML` in its first
  4 KB; it stops at `EMR_EOF`. This reads Octet's Windows EMF and Office's Mac EMF (the PDF comment first, then
  Octet's).
- The hand-off file is `drawing.pdf` or `drawing.emf` by the picture's kind. Insert > Octet Drawing uses the kind
  Copy gives LibreOffice on that system: EMF on Windows, PDF on the Mac and Linux.
- Octet: `Kind::Emf` in `objects.rs`. Open reads the CDXML with `export::cdxml_from_picture` (bounded, already used
  by paste). Update writes an EMF made as Copy on Windows makes it (`vector::make_emf` with the CDXML, no PDF).
- The extension reads Octet's file as PDF or EMF by its first bytes, 64 MB at most.

Done: Python tests of EMF detection (Octet's, Office's Mac EMF, ChemDraw-like with no comment, and hostile ones);
Rust round trip of an EMF object (open, Update, read the CDXML back, no temporary file left).

### J6. Calc

- `DOCUMENTS` gets `("com.sun.star.sheet.SpreadsheetDocument", "Calc")` after Draw; `Addons.xcu`'s
  `MergeContext` gets `com.sun.star.sheet.SpreadsheetDocument`. A picture in Calc is a shape on the sheet, so the
  Impress and Draw paths apply (one selected `GraphicObjectShape`, Insert through `.uno:InsertGraphic`).

Done: Python test that a Calc document gets `--app Calc` and goes the Impress and Draw way; config test.

### J7. Update in odd documents, on every system

- A read-only document: a double-click does what LibreOffice does (the extension returns False), and the context
  menu gets no item. Insert > Octet Drawing says "This document is read-only." (`doc.isReadonly()`).
- A cropped picture: Update takes the crop off (the new drawing comes in whole, at its own size, as 0025 says), and
  Undo puts the old picture, size and crop back. `Swap` keeps `GraphicCrop` with the picture and the size.
- Rotation, flip, anchor, wrap, alt text and name stay as they are (not touched).

Done: Python tests with stub documents and shapes.

### J8. Paste from LibreOffice into Octet on the Mac and Windows

- `clipboard.rs` names for `Kind::Svxb`: the Mac gets `SVXB` and the same name spelt `svbx`; Windows gets the
  registered format `SVXB (StarView Bitmap/Animation)`. The reader (`svxb_picture`, then `cdxml_from_picture`) is
  the Linux one and already reads an EMF in it.

Done: the `clip(System::Mac, …)` and `clip(System::Windows, …)` tests read a drawing from an SVXB holding a PDF and
one holding an EMF.

### J9. MCP

- `add_to_libreoffice` joins `MENU_COMMANDS` in `src/mcp.ts` and the editor's commands, as a command that opens a
  dialog (LibreOffice's Extension Manager asks the user), so headless Octet refuses it with the usual text. No other
  MCP change: an object window is a drawing window, and `save` there is Update (checked, not changed).

Done: an `mcp.check.ts` case for the command, and a refusal when windowless.

### J10. Documents and checklists

- Decision 0025 becomes "Octet drawings in LibreOffice", with a Windows section and a Mac section, the paste facts
  above, and its Not done list brought up to date.
- `docs/testing/libreoffice-manual.md`: the real-run checklist (section 9), for Windows, the Mac and a Linux
  regression run.
- What's New lines go back to the orchestrator; `src/releases.ts` and `docs/release-notes` are not edited.

## 4. Rules every part keeps

- Every file from LibreOffice or Octet is hostile: 64 MB at most, real files only (no links where the system has
  them), record and stream counts capped, UTF-8 checked. No shell, no `eval`, no `innerHTML`, no new port, socket or
  network use.
- Programs are started with fixed argument lists. The only programs the extension starts: Octet (Linux: as today;
  Windows: the OLE class's program; Mac: `/usr/bin/open -b` Octet's id).
- Linux behaves as in 1.1.2, except J6 and J7, which apply on every system.
- The extension stays standard-library Python that runs on LibreOffice's own Python 3.8 and later. No new
  dependency anywhere; THIRD_PARTY.md does not change.
- Old documents, old extensions and Octet 1.1.2 keep working (section 7).
- No hot path changes (section 8).
- UI: one existing row and button, now on every system. One new message in LibreOffice ("This document is
  read-only."). British English, STE.

## 5. Design decisions, with reasons

1. **The picture is the object on every system, not OLE.** One format works in a document that moves between
   Windows, the Mac and Linux, and LibreOffice's paste on Windows picks the EMF anyway. LibreOffice's own OLE objects
   on Windows are left to LibreOffice and decision 0023's server (scope cut).
2. **Update keeps the picture's kind.** A Windows paste is an EMF; Update gives an EMF back, so the document stays
   as Word for Windows reads it. A PDF stays a PDF. Insert uses the kind Copy uses on that system.
3. **Mac hand-off by Apple Event plus a file beside the drawing.** `open -b` reaches a running Octet or starts one;
   arguments would be dropped for a running app. The marker's rules (0700 folder, owned, no links) keep an ordinary
   PDF opened from Finder an ordinary drawing.
4. **Windows finds Octet through its OLE class.** The installer writes it and Octet repairs it at each release start,
   so no new file has to be written, and it names the Octet that ran last.
5. **Add to LibreOffice runs `unopkg gui`, as on Linux.** 0025 found that opening the .oxt as a file asks to install
   it twice after LibreOffice's restart. Opening the file stays only as the fallback.
6. **`libreoffice.rs`, a new small module.** `main.rs` changes only by a `mod` line and the handler list, which keeps
   the merge with fix/165 (it changes the same `generate_handler!` line) to one line.
7. **Calc joins.** Excel is an object container on Windows (0023); Calc is its sibling, and it costs one row.
8. **Crop goes on Update.** A crop made for the old drawing cuts the new one at random. Undo brings it back.
9. **Rename retry only in `objects::write`, only on Windows.** Save's `write_atomic` is shared and stays as it is.

## 6. Siblings (consistency pillar)

Each is a test or a checklist step (section 10).

- Systems: Linux, Windows, the Mac.
- Programs: Writer, Impress, Draw, Calc.
- Ways in: double-click, context menu Edit in Octet Draw, Insert > Octet Drawing, a second double-click on a picture
  that is open (window to the front).
- Pictures: Octet PDF (Mac and Linux copy, Update), ChemDraw PDF (Mac), Octet EMF (Windows copy, Update, Word for
  Windows documents), Office's Mac EMF (PDF comment then Octet's), ChemDraw EMF (no CDXML: LibreOffice's own
  double-click), PNG (none).
- Ways out: Update, Close and Return, closing the window, Quit, the document closing (`gone`), the picture deleted
  (`gone`).
- In LibreOffice: Undo and Redo of each Update; copy the picture to another document and edit that one.
- Clipboard both ways: Octet to LibreOffice (PDF on the Mac and Linux, EMF on Windows) and LibreOffice to Octet
  (SVXB on all three).
- The object window as a drawing window (0023): dark mode, zoom, Undo, Save Copy As, recovery, its title and
  "Update in Writer/Impress/Draw/Calc".
- Settings row and Settings search on all three; MCP `run_command add_to_libreoffice`.

## 7. Formats and older versions

| Format | Change |
| --- | --- |
| .oct, CDXML, CDX, SDF, MOL, SMILES | None. |
| Copy (every system) | None. |
| Paste | Reads LibreOffice's SVXB on the Mac and Windows too. |
| Export | None. |
| Update's file | PDF as today, or EMF made as Windows Copy makes it. |
| .odt, .odp, .odg, .ods | LibreOffice keeps the PDF or EMF as it keeps any picture. Nothing of Octet's own goes in. |
| The .oxt | Same files; Calc added to `Addons.xcu`; version from package.json as today. |

- Octet 1.1.2 with a 1.2 document: the pictures are plain PDF or EMF with the CDXML, as 1.1.2 writes. Copying one
  into 1.1.2 on Linux gives the drawing (SVXB). On the Mac and Windows 1.1.2 has no SVXB name and pastes LibreOffice's
  bitmap.
- The 1.1.2 extension (Linux) with Octet 1.2: works as before; it ignores EMF pictures and Calc. Add to LibreOffice
  again updates it (LibreOffice's Extension Manager replaces the older version).
- A 1.2 extension with Octet 1.1.2 (only after a downgrade): an EMF hand-off gives Octet's "cannot open" message;
  a PDF one works.
- ChemDraw: it does not open LibreOffice documents. A picture copied out of LibreOffice into ChemDraw is LibreOffice's
  bitmap, as today. Octet's PDF after Update has the CDXML where ChemDraw puts it, so it pastes back into ChemDraw on
  the Mac as Octet's Copy does.

## 8. Speed

Nothing here runs while drawing. Copy, render, structure update, input and start-up do not change.

- Paste on the Mac and Windows asks for one more name only when the earlier ones gave no drawing.
- `RunEvent::Opened` adds three `lstat` calls for a file named `drawing.pdf` or `drawing.emf`, none for others.
- Update uses the same makers as Copy (`make_pdf`, `make_emf`), so a 40-paclitaxel or 500-residue drawing updates in
  Copy's time plus one file write. The extension sees it within 250 ms.
- The extension's double-click check is bounded: 2,000 `stream` places for a PDF (as today), 64 records for an EMF.
  The Python test times `has_drawing` on a 64 MB PDF with no drawing and on a 64 MB EMF, median of 5, and records it
  (expected: under 100 ms and under 1 ms).

## 9. Stress list

| # | Case | Expected |
| --- | --- | --- |
| S1 | Empty hand-off file (Insert); then delete everything and Update | Opens empty. Update with nothing drawn sends the page's blank 1 in square (`BLANK_SVG`), as for Word. The picture still holds a CDXML (an empty page), so a double-click opens it again. Rust and Python test both kinds. |
| S2 | A PDF of exactly 64 MB, and 64 MB + 1 byte | The first is read; the second is not Octet's (LibreOffice's own double-click). |
| S3 | EMF with a record of size 0, 3, 2^32-4, a record past the end, 10,000 tiny records before the comment | Not Octet's, at once (64-record cap). No exception reaches LibreOffice. |
| S4 | EMF comment `Octet CDXML\0` with non-UTF-8 bytes or no `<CDXML` | Extension: not Octet's if `<CDXML` is missing. Octet: "cannot open" message, `closed` written, folder removed. |
| S5 | Document names with `"`, `\` at the end, `\"`, `%PATH%`, `^&|<>`, a tab, a line end, 300 characters, right-to-left marks, an emoji, `--convert`, `--headless` | Windows: Rust reads back the same words; Octet shows the name cleaned and cut to 260. Mac: line ends become spaces in `object`. Never an option. |
| S6 | Octet not installed; LocalServer32 missing, empty, unquoted, relative, UNC, naming a deleted file, a folder, a `.bat`, a link; `open -b` exits 1 | "LibreOffice cannot find Octet Draw. Open Octet Draw once, then try again." The folder goes. LibreOffice does nothing more. |
| S7 | Double-click the same picture 10 times fast | One session and one window, brought to the front. |
| S8 | Two pictures in two documents open at once, Update in each | Each Update goes to its own picture and document. |
| S9 | Update pressed 20 times in 2 seconds, on Windows while the extension reads | No "cannot update" message; LibreOffice ends with the last drawing; each Update that LibreOffice saw is one Undo step. |
| S10 | Update 3 times, Undo 3 times, Redo 3 times in LibreOffice, then Update again after one Undo | Undo walks back to the pasted picture, Redo forward; the late Update replaces the picture shown and clears Redo. |
| S11 | Delete the picture in LibreOffice while Octet's window is open, then Update | Octet's title says the document is closed; Update stops; Save Copy As works. |
| S12 | Close the document first; quit LibreOffice; kill LibreOffice | Closed or quit: `gone`, as S11. Killed: Octet's Updates still write the file; the folder stays in the temporary folder (the system cleans it). |
| S13 | Quit Octet (⌘Q, File > Quit) with three object windows open | Each document gets its newest drawing, `closed` is written, the folders go. |
| S14 | Read-only document | Double-click and the context menu are LibreOffice's own; Insert > Octet Drawing says "This document is read-only." |
| S15 | Cropped, rotated and flipped picture, in a table cell, a header, a frame, a group in Impress | Update: crop off, rotation and flip kept, anchor and wrap kept. A group is LibreOffice's (enter it first). Undo brings back the crop. |
| S16 | Paste from Octet on Windows, save `.odt`, open on the Mac and Linux, Update there, back on Windows | EMF read everywhere; Update keeps EMF; Windows reads it again. |
| S17 | The same with `.docx` and `.pptx` saved by LibreOffice, then opened in Word | The picture in Word is the EMF (or LibreOffice's export of the PDF); recorded in the real run. |
| S18 | Copy the picture in LibreOffice, paste into Octet (each system) and into another LibreOffice document | Octet: the drawing (SVXB). LibreOffice: a picture that opens a session of its own. |
| S19 | 40 paclitaxels and a 500-residue peptide: double-click, Update, Close | Double-click starts Octet within LibreOffice's click (check under 100 ms); Update takes Copy's time; no frame drop in Octet. |
| S20 | Dark mode and zoom 10% and 3200% in the object window | Update's picture is the same bytes as at 100% in light mode (Copy's colours, true size). |
| S21 | The temporary folder deleted by hand while the window is open | Update says "Octet cannot update Report.odt. Try again."; Save Copy As works. |
| S22 | A Finder or Explorer user opens `drawing.pdf` from a folder that is not the extension's (0755, or no `object`, or `object` a link) | An ordinary drawing window, not an object. |
| S23 | MCP: `run_command add_to_libreoffice` with ids, twice in a row, from headless Octet, misspelt | Ids ignored; each call opens LibreOffice's dialog for the user; headless refuses (no window); a misspelt command is refused by name. |
| S24 | Two AI sessions edit the object window's drawing while the user presses Update | Each MCP call is one Undo step; Update sends the drawing as it is; Close sends the newest. No edit is lost (the session's numbered messages). |
| S25 | Insert in Impress on Windows while LibreOffice still holds the temporary copy | The picture is inserted; the copy stays in the temporary folder; the session goes on. |
| S26 | A Windows Octet started for Word (`-Embedding`) is running when LibreOffice asks | A second Octet process starts and opens the window (as for a file opened from Explorer then). Recorded, not changed. |

## 10. Acceptance list

| Check | Covers |
| --- | --- |
| `node src/libreoffice.check.ts`: the .oxt is a resource of every bundle; Settings has no LINUX gate on the row | J1 |
| `cargo test` in `src-tauri` (`libreoffice::tests`): the finder with simulated Mac folders and Windows registry values | J1 |
| `cargo check --target x86_64-pc-windows-msvc` and `cargo check` (Mac), with `CARGO_TARGET_DIR=…/cargo-g48` | J1, J3, J4, J5, J8 |
| `npm run look -- http://localhost:1472/`: Settings > General's LibreOffice row matches the other text buttons; no `look:` errors | J1 |
| Python, Windows branch: LocalServer32 cases, `Popen` arguments and flags, environment, `AllowSetForegroundWindow` called, `O_BINARY` used | J2, S6 |
| Python, Mac branch: `object` text, `open -b` arguments, failure message, marker written once | J2, J3, S5, S7 |
| Python, Linux branch: the existing tests unchanged | J2 |
| Rust `objects::tests::marked_paths` (unix) | J3, S22 |
| Rust `objects::tests::update_retries_a_busy_rename`; Python+TS command-line round trip | J4, S5, S9 |
| Python EMF detection cases; Rust `objects::tests::an_emf_object_round_trips` | J5, S2, S3, S4, S16 |
| Python: Calc row and its path | J6 |
| Python: read-only, crop and Undo, unlink failure | J7, S14, S15, S25 |
| Rust `clipboard` tests for SVXB on the Mac and Windows | J8, S18 |
| `node src/mcp.check.ts` case | J9, S23 |
| Existing Rust `objects` session tests | S8, S10, S11, S13, S24 |
| Python timing of `has_drawing` (median of 5, recorded) | S19, section 8 |
| Full `npm test` and `cargo test`, compared with the base log (161 of 161) | all |
| Real-run checklist (below), by Sam | S1, S10, S12, S15, S16, S17, S19, S20, S21, S26, and the LibreOffice facts in section 1 |

## 11. Real-run checklist

Goes into `docs/testing/libreoffice-manual.md`. LibreOffice 24.x or later from libreoffice.org, Octet 1.2 installed.

Windows:
1. Settings > General > Add to LibreOffice, with LibreOffice closed, then with it open. The Extension Manager asks
   once; no console window shows.
2. Copy a structure in Octet, paste into Writer. Right-click the picture: Edit in Octet Draw is first. (This
   confirms LibreOffice pasted the EMF and kept its bytes.)
3. Double-click it: Octet's window comes to the front, titled "Octet Drawing in <document>", button "Update in
   Writer". Change it, Ctrl+S: the picture changes. Edit > Undo in Writer: the old picture.
4. The same in Impress, Draw and Calc, and Insert > Octet Drawing in each.
5. Close the window with a change not sent: the picture changes. Quit Octet with a window open: the same.
6. Close the document while the window is open: the title says it is closed.
7. Save as `.odt`, reopen, edit again. Save as `.docx`, open in Word: record what Word shows.
8. Copy the picture in Writer, paste into Octet: the drawing.
9. With Octet not running, double-click: Octet starts and opens it.

Mac:
1. `mdls -name kMDItemCFBundleIdentifier /Applications/LibreOffice.app` gives `org.libreoffice.script`.
2. Add to LibreOffice, closed and open.
3. Copy in Octet, paste into Writer; Edit in Octet Draw is in the context menu (LibreOffice pasted the PDF).
4. Double-click with Octet running, then with Octet quit: one Octet in the Dock each time, the window in front.
5. Steps 3 to 8 of Windows, with ⌘S.
6. `osascript -e 'clipboard info'` after a copy in Writer: note the SVXB type's exact name.
7. A ChemDraw PDF pasted into Writer opens in Octet.

Linux (regression, the VM of 0025): Writer, Impress, Draw and now Calc, double-click, Update, Undo; a read-only
document; a cropped picture.

## 12. Scope cut

- LibreOffice's own OLE objects on Windows (Paste Special > Octet Drawing, Insert > Object > OLE Object): left to
  LibreOffice and decision 0023's server; a normal paste is the EMF picture. Not built or tested here.
- ChemDraw's Windows EMF pictures (no CDXML in them) and Office's Mac EMF that holds only a PDF (a `.docx` from Word
  for Mac with ChemDraw pictures): need a reader of the PDF inside an EMF comment. Later (1.2.1).
- PNG pictures pasted before 1.1.2: LibreOffice keeps no CDXML for them.
- Drag and drop from Octet into LibreOffice (ChemDraw's EGO allows a drag): Octet has no drag-out to other programs on
  any system. A feature of its own.
- LibreOffice from the Mac App Store (sandboxed) and other store builds; LibreOffice as a Flatpak or Snap on Linux
  (0025): they cannot start Octet.
- Telling the user that LibreOffice has an older extension than Octet: later.
- Live updates while drawing: Update on ⌘S or Ctrl+S and on close, as decision 0023.
- Android.
- Real runs on Windows and the Mac: LibreOffice is not installed here and may not be. The checklist is for Sam.

## 13. What's New (draft, for the orchestrator)

- To edit a structure in LibreOffice on Windows or a Mac, click Add to LibreOffice in Settings > General. Then
  double-click the structure in Writer, Impress, Draw or Calc.
- When you paste a structure from Octet into LibreOffice on Windows, you can double-click it to edit it in Octet.
- To put an Octet structure into a LibreOffice spreadsheet, choose Insert > Octet Drawing in Calc.

## 14. Changes during the build (17 November 2026)

What the build found that the plan did not say, each with the requirement it serves:

- J3, S7: AppKit can send a picture that starts Octet before Octet's setup has made the menu bar. `objects::opened`
  keeps such a picture and `objects::ready` (called at the end of setup) opens it, as an `--object` start waits on
  Linux and Windows.
- S7: Octet drops a request for a file whose window is opening (`objects::OPENING`), so ten fast double-clicks open
  one window on every system, not only one session in LibreOffice.
- S9: the extension marks a file as seen only once it could read it. On Windows a read can meet Octet's rename; that
  file is read again at the next look (a quarter of a second later).
- S5: a NUL in a document's name is dropped before Octet is started (no system passes one to a program).
- `has_drawing` keeps the PDF search for every picture that is not an EMF (as in 1.1.2), so the Linux tests are
  unchanged.
- `cargo check --target x86_64-pc-windows-msvc` needs stand-in C and resource tools on the Mac (ring's C, and the
  Windows resource file); `cargo check` compiles neither, as `docs/testing/ole-manual.md` notes.
