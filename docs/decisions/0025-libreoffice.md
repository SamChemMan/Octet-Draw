# 0025: Octet drawings in LibreOffice

Status: Linux in release 1.1.2 (built 11 November 2026, plan steps L1 to L4). Windows and the Mac, Calc, EMF
pictures, read-only documents and crops built 17 November 2026 and finished 19 November 2026 for release 1.1.3
(issue 48, `docs/plans/issue-48-libreoffice-win-mac.md`). Linux was tried only in an Ubuntu 24.04 VM (arm64) with
LibreOffice 24.2: with Octet built there, as a Flatpak on GNOME 50, and from a stand-in for the AppImage. Windows and
the Mac have not run with a real LibreOffice yet: they are proved with stand-ins (below), and the real runs are a
checklist in `docs/testing/libreoffice-manual.md`. The paste from Octet on Windows, and into Calc on Windows and Linux,
was built on 19 November 2026 for 1.1.3 (`docs/plans/issue-48-48w-1-1-3.md`), from LibreOffice's source alone. Not
tried: a real AppImage, x86_64 Linux, Wayland, Fedora, LibreOffice from libreoffice.org, and ChemDraw's own PDF in
LibreOffice (see Not done).

Adds to decisions 0011 (the clipboard) and 0023 (the object window). LibreOffice Writer, Impress, Draw and Calc get
what Word gets on Windows: double-click a structure, edit it in Octet's object window, and Update puts it back. The
same picture works in a document that moves between Linux, Windows and the Mac. A structure gets into a document by
Insert > Octet Drawing on every system, and by a paste from Octet: into Writer, Impress, Draw or Calc on Linux, into
Writer or Calc on Windows with LibreOffice 26.2 or later (Impress and Draw too with Settings > Import and export > Copy >
Office object off), and into Writer, Impress or Draw on the Mac.

## Copy and paste

- Copy on Linux puts, in this order: the PNG (with the CDXML in a chunk), `application/pdf` (the Mac's PDF, with the
  CDXML in its `/Metadata`), the SVG, then the chemistry as before, then (since 1.1.3) LibreOffice's own copy of a
  picture holding the same PDF (below). Octet makes the PDF on a second thread while it draws the PNG, so Copy takes
  no longer than in 1.1.1 (`linux_copy_takes_no_longer`; 7.3 ms against 7.3 ms in the VM's release build). If Octet
  cannot make the PDF (a font it cannot embed), Copy puts the PNG and the SVG, as in 1.1.1.
- Writer, Impress and Draw paste the PDF, and keep it in `.odt`, `.odp` and `.odg`. LibreOffice saves a PDF newer
  than 1.6 again at 1.6 through pdfium, which takes the `/Filter` off the `/Metadata` stream and leaves it deflated.
  Octet now reads zlib data with no filter as well (`export.rs`, `cdxml_of`).
- Paste in Octet reads the PDF, and LibreOffice's own copy of a picture (`application/x-openoffice-svxb`), which holds
  the PDF as it was pasted in. LibreOffice puts no PDF on the clipboard, and its PNG has no CDXML.
- The Mac: Octet's copy has Office's zip, which LibreOffice does not know, and the PDF (`com.adobe.pdf`, which
  LibreOffice maps to `application/pdf` in `vcl/osx/DataFlavorMapping.cxx`). So LibreOffice pastes the PDF, as on
  Linux. Paste in Octet reads LibreOffice's own copy under its MIME name, spelt `svxb` and, as LibreOffice's table of
  Mac names spells it, `svbx`.
- LibreOffice's own copy of a picture (SVXB, 1.1.3): Copy on Windows and Linux puts it last, after Octet's JSON, so
  every type before it keeps its place and bytes, and no other program reads it. It holds the Mac's PDF in the form
  LibreOffice's `TypeSerializer::readGraphic` reads: "NAT5", an empty version header, then the picture's link with a
  version 1 header, type 12 (a PDF), the PDF's size and user 0, then the PDF (`clipboard::svxb_of`). LibreOffice reads
  the PDF with its own PDF reader and keeps its bytes, so the picture is the same as a pasted PDF and the extension
  opens it. Windows names it `SVXB (StarView Bitmap/Animation)`, the name in its MIME type's `windows_formatname`
  (`vcl/win/dtrans/ftransl.cxx`); Linux by the whole MIME type. No SVXB with the picture switched off, with no PDF (a
  font Octet cannot embed), or over 64 MB. Windows makes the PDF after the EMF, on the thread beside the bitmap. On
  Linux the clipboard holds the PDF twice (`application/pdf` and the SVXB), so a PDF near 64 MB puts about 128 MB on it.
- Which picture each program takes (it takes the first format in its own table that the clipboard has; the clipboard's
  order does not count). Writer (`sot/source/base/formats.cxx`, the free-area copy table) and Calc
  (`ScViewFunc::PasteFromSystem`, the Calc free-area copy table) take SVXB before every other picture and before
  Windows' OLE formats. On Linux Writer takes the SVXB, not `application/pdf`; both hold the same PDF. Impress and
  Draw (`View::InsertData`) take a PDF first, then their OLE step, then SVXB. On Linux they take the PDF. On Windows
  with Settings > Import and export > Copy > Office object on (the default), Octet's copy has "Embed Source" and
  "Object Descriptor" (`EMBED_SOURCE_OLE`, `OBJECTDESCRIPTOR_OLE`), so the OLE step runs. The clipboard also has a
  GDIMETAFILE (from the EMF), so the step inserts that and stops before SVXB. So Impress and Draw on Windows paste
  LibreOffice's own picture there, converted from the EMF without Octet's CDXML comment, and it does not open in Octet.
  With the Office object off they take the SVXB. Octet cannot get around this: Word needs the object, and LibreOffice
  for Windows reads no PDF type (`vcl/win/dtrans/ftransl.cxx` has no `application/pdf`). Writer and Calc on Windows,
  and every program on Linux, paste a PDF picture that opens in Octet.
- Windows needs LibreOffice 26.2 or later for that. LibreOffice for Windows 24.2 to 25.8 reads the clipboard name
  `SVXB (StarView Bitmap/Animation)` as `application/x-openoffice-svbx;…` (its `vcl/win/dtrans/ftransl.cxx` table,
  line 132), which is no format it knows, so it does not see Octet's SVXB: Writer takes the bitmap and Calc the
  metafile, as before 1.1.3, and neither opens in Octet. Commit dbdc2f17d64a (10 November 2025, first in 26.2) builds
  the table from `sot/source/base/exchange.cxx` and mends the spelling. No other type helps those versions: their
  table has no PDF, and their EMF paste drops Octet's comment. There a structure goes in by Insert > Octet Drawing.
- Before 1.1.3, on Windows, Writer took the bitmap (`CF_DIB`), and Impress, Draw and Calc converted the EMF with
  `TransferableDataHelper::GetGDIMetaFile`, which loses Octet's CDXML comment. Only `GetGraphic` keeps an EMF's own
  bytes, and only from LibreOffice 26.2 (tdf#168886). An SVXB that held the EMF would not help: LibreOffice reads an
  EMF link as a WMF graphic (`GfxLink::LoadNative`), which the extension does not know. Paste in Octet reads
  LibreOffice's own copy under its registered name, `SVXB (StarView Bitmap/Animation)`, which holds the PDF or EMF of a
  picture that holds a drawing.
- The Mac: LibreOffice's table of pasteboard types (`vcl/osx/DataFlavorMapping.cxx`) spells SVXB `svbx`. A pasteboard
  type `…svbx…` becomes a format LibreOffice does not know, and one spelt `…svxb…` maps only inside the LibreOffice
  that wrote it. So LibreOffice for the Mac reads no SVXB from another program, and Copy on the Mac puts none.
- Calc takes no PDF (its paste table and `ScViewFunc::PasteFromSystem` have none). On Windows and Linux it takes the
  SVXB. On the Mac a structure pasted from Octet into Calc is LibreOffice's picture: in Calc on the Mac a structure goes
  in by Insert > Octet Drawing, or as a copy of a Writer, Impress or Draw picture that holds one (LibreOffice copies its
  own SVXB, with the picture's bytes).

## The extension

`tools/libreoffice`: a Python UNO component, `octet_draw.py`, with `Jobs.xcu`, `Addons.xcu`, `description.xml` and
the manifest. `src-tauri/build.rs` zips them into `gen/octet-draw.oxt`, with Octet's version, and every installer
carries it (`tauri.conf.json`). Settings > General > Add to LibreOffice (`libreoffice.rs`), on every system, runs
`unopkg gui` on it, and LibreOffice's Extension Manager asks the user to confirm. AI apps reach it as `run_command
add_to_libreoffice`, which waits for it: the AI app hears "Octet cannot open LibreOffice." when the window says so.
Octet with no window refuses it, as a command that opens a dialog.

- Where unopkg is. Linux: on the PATH. The Mac: in `Contents/MacOS` of the LibreOffice that LaunchServices knows by its
  id (`org.libreoffice.script`, wherever the user put it), then `/Applications/LibreOffice.app`, then
  `~/Applications/LibreOffice.app`. Windows: in the program folder that `Software\LibreOffice\UNO\InstallPath` names
  (the user's install, then the computer's; the 64-bit view, then the 32-bit), then the App Paths entry of
  `unopkg.exe`, then `%ProgramFiles%`, `%ProgramFiles(x86)%` and `%LOCALAPPDATA%\Programs`, each with
  `LibreOffice\program`. Windows starts it with no console window. With no unopkg, or one that does not start, Octet
  opens the .oxt with the system, which gives it to LibreOffice.

- LibreOffice closed: the manager shows on its own, and LibreOffice has the extension when it next starts. No
  restart.
- LibreOffice open: the manager shows in LibreOffice, which asks to restart once.
- Octet does not open the .oxt as a file (`xdg-open`): that starts a closed LibreOffice with the file as its
  argument, and LibreOffice's restart after the install opens the file again and asks to install it again. Tested in
  the VM on 11 November 2026.
- A Flatpak Octet has no `unopkg`, so it opens the file through the portal. When LibreOffice was closed, its restart
  still asks to install the file again (tried in the VM). Cancel ends it.

- A job on each new view (`OnViewCreated`) adds a mouse handler and a context menu item to Writer, Impress, Draw and
  Calc.
- A double-click with the left button on a picture that holds a drawing opens Octet, and LibreOffice does nothing more.
  Every other picture keeps LibreOffice's own double-click. A drawing is a PDF whose `/Metadata` stream holds CDXML
  (Octet's or ChemDraw's), or an EMF with Octet's comment (`Octet CDXML\0`, then CDXML in its first 4 KB) among its
  first 64 records: Octet's Windows copy, a Word for Windows picture, or Office's Mac EMF, whose PDF comment comes
  first. LibreOffice keeps a picture in its own form: a mark (`0fdp` for a PDF, `0fme` for an EMF), the length, then
  the file. The extension takes the file only when the mark and the file agree.
- In a read-only document LibreOffice keeps its double-click and its context menu, and Insert > Octet Drawing says
  "This document is read-only."
- The context menu of such a picture starts with Edit in Octet Draw. Insert > Octet Drawing (after Insert > Image)
  opens an empty object window, and the first Update inserts the drawing: in Writer in line at the cursor, in Impress,
  Draw and Calc through LibreOffice's own Insert Image. Before it the extension takes the selection off the page: with
  one picture selected Insert Image puts the drawing in its place, and with one shape selected it fills the shape with
  the drawing (sd's `FuInsertGraphic`, Calc's `lcl_InsertGraphic`). Calc does not select a picture inserted by a command
  with a file name (`SdrInsertFlags::DONTMARK`), so the extension takes the picture that is new on the page (added
  last, or in an empty placeholder's place in Impress). Insert asks for a PDF on every system: LibreOffice reads a PDF
  in the same way on each and keeps its bytes, and Windows' EMF would gain nothing, since LibreOffice on Windows does
  not keep a pasted one. If the place in Writer is gone by the first Update (its table or frame deleted), the drawing
  goes in at the cursor. Insert Image reads a private copy (`mkstemp`) of the picture the
  extension read and checked. Octet's file can be gone by then: Close and Return writes the drawing and `closed`
  together, and the folder goes. On Windows LibreOffice can still hold the copy: it stays in the temporary folder.
- A picture that is open already brings Octet's window to the front. Ten fast double-clicks make one session, and
  Octet opens one window (a request for a file whose window is opening is dropped).

## Between the extension and Octet

- The extension writes the picture's file (LibreOffice's own copy of it, `drawing.pdf` or `drawing.emf`) into a new
  folder of mode 0700. Linux: under `$XDG_RUNTIME_DIR/app/io.github.samchemman.octet-draw/`, the folder a Flatpak Octet
  shares with the system. Windows and the Mac: `octet-libreoffice-*` in the user's own temporary folder. Every file
  the extension opens is opened with `O_NOFOLLOW` and `O_BINARY` where the system has them (Windows' Python has no
  `O_NOFOLLOW`).
- Update writes the new picture over the file in one step (a temporary file renamed over it), as the same kind: a PDF
  as Copy makes it on the Mac, an EMF as Copy makes it on Windows (CDXML comment, no PDF). Updates are written one at
  a time, and one older than the last written is dropped. The extension looks at the file four times a second, reads
  it as hostile (a regular file, 64 MB at most, a PDF or an EMF), and puts it in place of the picture. A file it
  cannot read at that moment is read at the next look. It notes the file it read by that file's own stamp, so an
  Update renamed in before the read goes in once, and one renamed in after it goes in at the next look. (Windows
  renames nothing over a file that is open, so there the stamp is taken while the file is open.) The picture keeps its
  anchor, wrap, rotation, flip, alt text and name, and takes the drawing's own size, as on Windows. A crop comes off:
  it was made for the old drawing. The swap is one undo step, "Octet Drawing", in every program, and Undo puts back
  the old picture with its size and crop: Impress and Draw record none for a changed picture, so the step is the
  extension's own. Undo and Redo of it on a picture that is gone since do nothing: an exception there would make
  LibreOffice clear its whole Undo list.
- Octet writes an empty `closed` file when the window closes (after the last picture), and the extension removes the
  folder. When the document closes first, or the picture is gone, the extension writes `gone`, and the window's title
  says "Octet Drawing (Report.odt is closed)". Both files are made new, never through a link. A folder that is gone
  ends its session too.
- Octet takes a document's name for the window's title with no control characters and no marks that turn the text's
  direction (U+202E and the others), as for Word.

### Linux

- It runs `octet --object <folder>/drawing.pdf --app Writer --host <document title>`, or `flatpak run
  io.github.samchemman.octet-draw` with the same arguments, as a list, never through a shell. `--app` comes from the
  document's service: `TextDocument` is Writer, `PresentationDocument` is Impress, `DrawingDocument` is Draw,
  `SpreadsheetDocument` is Calc (on every system). Octet cleans the name as it cleans a document's name, and the
  object window's button says Update in Writer, Update in Impress, Update in Draw or Update in Calc. With no `--app`
  (an older extension), the button says Update <document>. It runs it through the user's service manager
  (`systemd-run --user`): Ubuntu confines LibreOffice with AppArmor, and a Flatpak started as LibreOffice's child
  cannot start ("bwrap: setting up uid map: Permission denied"). Octet then runs unconfined, as from the app menu. `$`
  is passed as `$$`, as systemd expands variables. With no user service manager, Octet starts as a child.
- The extension first tries the program named in `$XDG_CONFIG_HOME/io.github.samchemman.octet-draw/octet-path`, then
  `/usr/bin/octet`, the Flatpak and `octet` on the PATH. Octet writes that file when it starts and at Add to
  LibreOffice: `$APPIMAGE` when it runs from an AppImage (the release's main Linux download, which can be anywhere),
  else its own program. The file holds only the path, mode 0600, written in one step. The extension reads it as
  hostile: the user's own file, which only the user can change, and no link; and the path a real path with no link
  in it, to a file that runs, that the user or root owns, and that others cannot change. An AppImage that was moved
  since falls through to the next.
- From an AppImage, the programs Octet starts (`unopkg`, `xdg-open` and the other openers) get the session's
  environment. AppImageKit's AppRun and Tauri's GTK hook set `LD_LIBRARY_PATH`, `PATH`, `PYTHONHOME`, `GTK_PATH`,
  `GIO_MODULE_DIR`, `XDG_DATA_DIRS` and others into the AppImage's mount: each list loses its entries in the mount, a
  variable left empty goes, and so do `APPIMAGE`, `APPDIR`, `ARGV0`, `OWD`, `GTK_THEME` and `PYTHONDONTWRITEBYTECODE`.
  The mount counts by `$APPDIR` and by its real path, as AppRun names it by its real path. The program starts in
  `$OWD`, never in the mount. With the AppImage's `PYTHONHOME`, `unopkg add` fails ("unopkg
  failed"): LibreOffice's Python cannot start.
- Octet's single-instance hand-off (D-Bus, under the app's own name, which a Flatpak may own) gives the request to a
  running Octet.
### Windows

- The extension starts the program that Octet's Office class names: `Software\Classes\CLSID\{211EF98F-…}\LocalServer32`
  under HKCU, 64-bit view then 32-bit (decision 0023: the installer writes it, and each release start repairs it, so
  it names the Octet that ran last). It takes the value only as a quoted or plain `X:\…\name.exe` (REG_SZ) with no
  arguments, no network path and no `.` or `..` folder, naming a regular file that is no link or junction. With no
  such program the user hears "LibreOffice cannot find Octet Draw. Open Octet Draw once, then try again."
- It runs `<program> --object <folder>\drawing.pdf --app Writer --host <document title>` (`drawing.emf` for an EMF
  picture) as a list (Python writes the
  command line by Microsoft's rules; Octet's Rust reads it by the same rules, and `libreoffice.check.py` tries
  hostile names), detached, with no console, without `PYTHONHOME` and `PYTHONPATH`. First it calls
  `AllowSetForegroundWindow(ASFW_ANY)`, so the Octet that takes the request can bring its window to the front. The
  Octet that starts gives the request to the running Octet through the single-instance plugin (its arguments
  separated by NULs) and ends. The word after `--object`, `--host` and `--app` is only that flag's value in every
  scan of Octet's arguments (`main.rs`, `own`): a document named `--unregister-ole` removes no keys, and one named
  `-Embedding` does not start Octet for Word.
- Windows refuses to replace a file while another program has it open, so Update tries a refused rename again, 20
  times at most, 25 ms apart (`objects::write`). The picture is written once. Save is not changed.
- Windows does not empty its temporary folder. When LibreOffice quits before Octet's window closes, no one watches the
  folder, so at the first double-click or Insert after LibreOffice starts again the extension removes its own folders
  (`octet-libreoffice-*`, no links) in which Octet wrote `closed`. The Mac does the same.

### The Mac

- A second Octet process would be a second Octet in the Dock, and macOS gives a running app its files by Apple Event,
  which carries no arguments. So the extension writes `object` beside the picture (a new file, mode 0600): the
  program's name, a line end, then the document's name, its own line ends made spaces. Then it runs `/usr/bin/open
  -b io.github.samchemman.octet-draw <folder>/drawing.pdf`, which reaches the running Octet or starts one. `open`
  ending with 1 (no Octet) gives the "cannot find" message. An `open` that takes over 10 s (a first start that waits
  for macOS's question about a program from the Internet) has asked for the picture already, so the session stays.
- Octet's `RunEvent::Opened` asks `objects::marked` first. A file is an object only if its name is `drawing.pdf` or
  `drawing.emf` and it is a real file (no link), its folder is named `octet-libreoffice-…` and is a real folder (no
  link) of the user's own with mode 0700 (`~/Downloads` and `~/Documents` are 0700 too), and `object` beside it is a
  real file of the user's own, 4 KB at most, in UTF-8. Every other file opens as before, so a `drawing.pdf` opened
  from Finder anywhere else is an ordinary drawing. A picture that starts Octet can come before setup: it opens once
  setup has made the menu bar. Octet with no window (`--convert`; `--headless --mcp` in 1.2) opens no object window:
  it writes `closed` at once, so the extension ends that session.

## How it was proved

- `src/libreoffice.check.ts`: the .oxt and its files, the configuration, and the extension's own Linux tests.
- `src/libreoffice.check.py` (run by it, with the system `python3`, and parsed for Python 3.8): the Windows branch with
  stand-ins for `winreg`, `ctypes` and `subprocess` (LocalServer32 cases, the arguments and flags, the command line
  read back for hostile names), the Mac branch (`object`'s text, the `open` arguments, ten fast double-clicks, a link
  where `object` goes), EMF detection (Octet's, Office's Mac EMF, no comment, hostile records), LibreOffice's form of
  a picture, Calc, read-only documents, crops and Undo, Insert's private copy, the watch, and the time of the
  double-click check on a 64 MB picture with no drawing (about 40 ms for a PDF, under 0.1 ms for an EMF).
- Rust: `clipboard::tests::libreoffice_reads_octets_svxb` (a model of LibreOffice's `readGraphic` reads Octet's SVXB
  and LibreOffice's own; cut short anywhere, nothing), `windows_copy_types` (Word's types, order and bytes unchanged;
  the SVXB holds the Mac's PDF), `windows_and_linux_copy_the_same`; `src/libreoffice-paste.check.ts` (each program's
  paste table against what Copy offers on each system). `libreoffice::tests` (unopkg in simulated Mac folders and
  Windows registry values), `objects::tests`
  (`an_emf_object_round_trips`, `update_retries_a_busy_rename`, `marked_paths`), and `clipboard` (SVXB with a PDF and
  with an EMF, on each system). `cargo check --target x86_64-pc-windows-msvc --tests` with stand-in C and resource
  tools (the Mac has no Windows C compiler; `cargo check` compiles no C).
- `mcp.check.ts`: `run_command add_to_libreoffice`, refused with no window and when misspelt, and the failure the window
  showed.
- `src/lowinmac-stress.check.ts`: the plan's stress list and more, against the real extension, MCP and (with
  `OCTET_STRESS_RUST=1`) Rust code, and the LibreOffice paste facts above, read from its public source. The command
  line is read back by a Python copy of Microsoft's rules, not by Rust's own reader, which runs only on Windows.

## Not done

- No real AppImage was built in the VM: it has no Tauri CLI, linuxdeploy or libfuse2. The test on 11 November 2026
  used a stand-in: Octet's release build copied into `/tmp/.mount_OctetSim/usr/bin`, with the .oxt beside it, and a
  launcher `~/Apps/Octet-Draw.AppImage` that sets what the AppImage runtime, AppImageKit's AppRun and Tauri's GTK hook
  set, changes to the mount, and starts Octet. Writer's double-click started it through `octet-path`; Add to
  LibreOffice installed the extension with a clean environment; Help > Report a Problem gave `xdg-open` a clean one.
- From an AppImage, `unopkg` reads the .oxt in the mount. If Octet quits before the user confirms the install, the
  file is gone.
- From an AppImage, AppRun starts Octet in its mount, so a relative path typed after the AppImage in a terminal is
  read in the mount and opens nothing. The extension and file managers give full paths.
- A Flatpak Octet cannot write the system's `octet-path` (its config folder is its own). A user who ran an AppImage
  and then installed the Flatpak gets the AppImage on a double-click while that file is still there.
- PNGs pasted before 1.1.2 open nothing: LibreOffice keeps no original bytes of a PNG.
- Windows and the Mac have not run with a real LibreOffice. The facts above from LibreOffice's source (the clipboard
  names and the paste order, the `0fme` mark, the `image/x-emf` type, the InstallPath key) are each a step of
  `docs/testing/libreoffice-manual.md`.
- The paste from Octet into LibreOffice on Windows, and into Calc on Windows and Linux, is proved from LibreOffice's
  source only: no real LibreOffice has read Octet's SVXB yet. Steps W3, W3a and L4 of the checklist.
- LibreOffice for Windows 24.2 to 25.8: a structure pasted from Octet does not open in Octet (Copy and paste, above).
  Step W3c of the checklist. Insert > Octet Drawing works there.
- Impress and Draw on Windows with the Office object on (the default): a structure pasted from Octet is LibreOffice's
  own picture and does not open in Octet (Copy and paste, above). With the Office object off it opens, and Insert >
  Octet Drawing works either way.
- Calc on the Mac: a structure pasted from Octet does not open in Octet (Copy and paste, above). It needs LibreOffice to
  spell SVXB `svxb` in its Mac table.
- A LibreOffice built without its PDF reader (pdfium) reads no PDF: on Linux, Writer, Impress and Draw already paste
  nothing usable there; Calc, and on Windows every program that takes the SVXB, now do the same. LibreOffice's own
  builds have it.
- Apache OpenOffice reads SVXB too. Whether it reads a PDF in one was not checked; if not, its paste from Octet on
  Windows and Linux gives nothing.
- The Mac: with both an Octet with no window (an AI app's, 1.2) and Octet Draw running, which one LaunchServices gives
  the picture to is not known. The one with no window ends the session, and the double-click does nothing.
- ChemDraw's Windows EMF (no CDXML in it) and Office's Mac EMF that holds only a PDF (a `.docx` from Word for Mac with
  ChemDraw pictures) open nothing: they need a reader of the PDF inside an EMF comment. Planned for 1.2.1.
- LibreOffice's own OLE objects on Windows (Paste Special > Octet Drawing, Insert > Object) are left to LibreOffice
  and decision 0023's server.
- No drag from Octet into LibreOffice: Octet has no drag-out to other programs.
- LibreOffice from the Mac App Store or the Microsoft Store, and as a Flatpak or Snap on Linux, cannot start Octet.
- On Windows, an Octet that Windows started for Word (`-Embedding`) takes no request from LibreOffice: a second Octet
  starts and opens the window.
- Octet does not say when LibreOffice has an older extension than Octet. Add to LibreOffice again replaces it.
- Not tried: x86_64, Wayland (Octet's window can open behind LibreOffice), Fedora, LibreOffice from libreoffice.org,
  and ChemDraw's own PDF in LibreOffice. A LibreOffice installed as a Flatpak cannot start Octet. Distributions that
  split Python out of LibreOffice need `libreoffice-script-provider-python`.
