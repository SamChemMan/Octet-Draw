# 0023: Octet drawings as objects in Office for Windows

Status: approved by Sam, 5 November 2026, for release 1.2 (issue 24). Being built. Not run on Windows yet: see
"Status of the build" at the end.

Adds to decision 0011. 0011 says copy puts the same things on the clipboard on every system. On Windows, copy now
also puts an object on the clipboard, which only Windows has. Every other format, and its order, stays as 0011 says.

## The request

Prof. Schramm (issue 24) asked for a drawing pasted from Octet into Word for Windows to be an object that opens in
Octet, as a ChemDraw drawing is. Double-click opens it. An edit goes back into Word. The drawing is kept inside the
`.docx`. A separate window is enough: the drawing does not have to be edited inside Word's own window.

## Decision

- Octet is a local OLE server. Its own `.exe` is the server (`LocalServer32`). Windows' default handler
  (`ole32.dll`) is the in-process part, and keeps the picture in the document. Word draws, prints and saves the
  object with Octet closed or not installed. Word runs Octet in a separate process, so a crash in Octet cannot
  close Word, and x64 Octet serves ARM64 Office.
- No editing inside Word's window in 1.2. Edit and Open both open an Octet window.
- One Octet process serves every object. Octet registers its class object at each start on Windows. When Octet is not
  running, Windows starts it with `-Embedding`, and Octet then opens no Home window. That Octet waits for Word's first
  object, for a minute at most, and ends when Word lets go of its last object and no Octet window is open.
- The class:

  | | |
  | --- | --- |
  | CLSID | `{211EF98F-E45E-42C8-9D49-A10D2D394DB2}` (never changes: documents keep it) |
  | ProgID | `OctetDraw.Drawing.1`, with `OctetDraw.Drawing` as the version-independent ProgID |
  | Name in Office | "Octet Drawing" (the same name as the `.oct` file type) |
  | Verbs | Edit and Open. Both open the drawing in an Octet window |
  | MiscStatus | `OLEMISC_CANTLINKINSIDE` and `OLEMISC_RENDERINGISDEVICEINDEPENDENT` |

- The keys are per user, under `HKEY_CURRENT_USER\Software\Classes`. No administrator, no UAC prompt, nothing under
  `HKEY_LOCAL_MACHINE`, no `AppID`, no DCOM. They go in both registry views: Windows keeps a separate 32-bit copy of
  `Software\Classes\CLSID`, which 32-bit Office reads, and 64-bit Office reads the 64-bit one. The installer is a
  32-bit program, so its hooks set each view in turn (`SetRegView`). The installer writes them and the uninstaller removes them (NSIS hooks in
  `src-tauri/windows/hooks.nsh`). A release build of Octet repairs missing keys when it starts, on a thread of its own so start-up does not wait.
  An update from 1.1 runs the new installer (`/P /UPDATE`), which writes the keys before Octet starts again. It never takes keys
  that name another Octet that exists (a second install or a portable copy). A debug build never registers.
- The `.oct` file type ("Octet Drawing") gets a `CLSID` value, so Insert > Object > Create from File makes an Octet
  Drawing from a `.oct` file.
- The object's storage holds three streams: `\001CompObj` (the class and its name, written by Windows), `Octet`, the
  drawing as a `.oct` file in UTF-8, the same text File > Save writes, and `OctetSize`, the picture's size in
  hundredths of a millimetre (HIMETRIC): two little-endian 32-bit integers, width then height, 8 bytes, taken from the
  EMF's frame. Nothing else. (Changed 5 November 2026, before any release: the size lets `GetExtent` answer from Load
  on, before the window has drawn a picture.)
- Octet reads an object as it reads a file from the internet. It opens only the streams `Octet` and `OctetSize`. For
  `Octet` it reads at most 64 MB whatever size the stream says, requires UTF-8, and then the page reads the text as it
  reads a file from Open. `OctetSize` must be exactly 8 bytes, each side from 1 to 1,000,000 (10 m). A missing or bad
  size gives the drawing's own size (the `BoundingBox` of the `.oct` file's root CDXML element), else 1 in square.
  Octet never lists the storage and never opens a storage inside it. Windows parses the compound file, in Word's
  process, so Octet has no compound file reader of its own.
- The picture in the document is Octet's EMF, made as for Copy, with the CDXML in a comment. So the drawing survives
  with Octet uninstalled, and copying the picture out of Word into Octet on any computer, the Mac included, gives the
  drawing. If Office asks for a Windows metafile, Octet gives the EMF converted by Windows. From 1.2 the EMF also has
  EMF+ records, so Word draws it anti-aliased (issue 166, "The object's picture" below).
- The object window is a drawing window with a different File menu: "Update Document1" (Ctrl+S) in place of Save,
  "Save Copy As…" in place of Save As, "Close and Return to Document1" in place of Close, and no Revert to Saved. Its
  title is "Octet Drawing in Document1". Update changes the picture and the stored drawing in Word at once.
- Closing the window with changes not sent updates Word first, with no question (Q2). Word asks Octet to close
  (Word closes the document, or Word ends): Octet sends the newest drawing unless Word says not to (`NOSAVE`), with no
  question, also when Word asks Octet to ask (`PROMPTSAVE`). If the window has a change Word did not get (Word said `NOSAVE`, or the change came in
  the last half second), the window stays open as when Word goes away, and keeps the drawing for Save Copy As. Quit updates each document and closes each object
  window, then goes on as before.
- If Word goes away while the window is open, the window stays, its title says "Octet Drawing (Document1 is closed)",
  Update stops, and Save Copy As saves the drawing to a file. Recovery keeps a copy as for any drawing window.
- Copy on Windows goes through the OLE clipboard (`OleSetClipboard`, then `OleFlushClipboard` at once, so the copy
  stays after Octet ends). The formats, in order: "Embed Source" and "Object Descriptor" first, so Word's paste makes
  the object, then 0011's formats in 0011's order. Windows adds "Ole Private Data" and "DataObject" itself.
- Settings > Import and export > Copy has a switch "Office object", on Windows only, on by default. Off, copy is
  exactly as in 1.1.1. Octet offers the object only when its class is registered and names an Octet that exists.
- Paste in Octet reads Octet's own "Embed Source" after Octet's JSON and before CDXML, so a drawing copied out of Word
  comes back whole, catalytic cycles included. Octet does not read other programs' objects in 1.2.
- Insert > Object > Create New lists Octet Drawing and opens an empty object window.
- Create from File takes a `.oct` file. It can move to 1.2.1 if time is short.
- The MSI installer is not published from 1.2. The site and the updater use the NSIS installer, which writes and
  removes the keys. An MSI for institutions can come later with keys designed for it.

## Size

- `GetExtent` gives the size Word last asked for, else the picture's size: from `OctetSize` at Load, 1 in square for
  Insert > Object, then the frame of each picture the window sends. It never gives `OLE_E_BLANK`: while the object
  runs, Windows' default handler gives Word the server's answer as it is.
- `SetExtent` takes the size Word gives and returns `S_OK`. Microsoft's documentation keeps `E_FAIL` for an object
  whose size cannot be set, such as a link. An embedded picture can be scaled, so Octet takes the size and gives it
  back from `GetExtent`, and Word and Octet agree. The picture is not redrawn: it keeps the drawing's own aspect, and
  Word scales it into the space. An Update with a changed drawing drops Word's size, so the new drawing comes in at
  its own size. https://learn.microsoft.com/windows/win32/api/oleidl/nf-oleidl-ioleobject-setextent

## The object's picture (issue 166, 17 November 2026, release 1.2)

Issue 166: with 1.1.2 and default settings, a drawing pasted into Word for Windows is jagged. The reporter's
screenshot, pixel by pixel: every bond is 1 px of solid ink with no grey edge, and the labels have grey edges. A
plain picture (a 1.1.1 paste, or a PNG) is smooth. The reporter asked for a switch back to 1.1.1's paste.

Cause. Word's default paste makes the object, and Word draws an object from its cached picture. That picture was
`make_emf`'s EMF, with GDI records only. Word draws an object's picture through GDI+, and GDI+ draws GDI records
without anti-aliasing: lines aliased, text smoothed, as in the screenshot. Word draws a plain picture with its own
renderer, which smooths it. That Word uses GDI+ here is inferred from the screenshot and from ChemDraw (below); the
Windows CI test `ole_plus_is_smooth` checks the GDI+ half.

Decision:

- The object's picture is an EMF+ dual EMF (`make_office_emf` in `src-tauri/src/vector.rs`): `make_emf`'s GDI records,
  and before each mark's GDI records a comment with the same mark as EMF+ records (MS-EMFPLUS). The first record after
  the header is the EMF+ header (dual, GDI+ 1.1, a video display at 96 dpi), with anti-aliasing on at high quality,
  text anti-aliased, pixels offset by half, smooth scaling and page unit px. GDI+ draws the EMF+ records and skips the
  GDI ones. GDI, and every program that reads no EMF+, skips the EMF+ comments and draws what 1.1.2 drew.
- Shapes are EMF+ paths: filled with their colour (`EmfPlusFillPath`), and drawn with a pen (`EmfPlusDrawPath`) that
  has the SVG's caps, join, miter limit and dashes. Labels stay text: `EmfPlusDrawDriverString` puts each character
  where the GDI record puts it, in the same Windows font, so Word's Save as PDF and a printer get text. Text that is
  outlines in the GDI records is outlines in EMF+ too. A photo in the drawing goes through `EmfPlusGetDC` as its GDI
  records, so its pixels go in once.
- Text in a right-to-left or joining script (U+0590 to U+08FF: Hebrew, Arabic, Syriac, Thaana, N'Ko and their
  supplements; their presentation forms, U+FB1D to U+FDFF and U+FE70 to U+FEFF), or with a direction mark, is outlines
  in every EMF, the GDI records too (`right_to_left` in `pick_runs`). usvg gives those glyphs in the order they show,
  so GDI would order them again, and `EmfPlusDrawDriverString` would draw each Arabic letter on its own, not joined.
  Outlines draw what the page drew. Latin, Greek and Cyrillic labels stay text, to the byte.
- The EMF+ picture goes where Word draws an object: Copy with the object (`CF_ENHMETAFILE`, made on a thread beside
  the bitmap), and every picture the object window sends (at open, after each change, Update, Close and Return,
  Word's Close, Quit). Every other EMF keeps its 1.1.2 bytes (but right-to-left text, above): Copy with Office object off or the class not registered
  (a test checks the CRC-32 of 1.1.2's copy), Export as EMF, Quick export, `--convert`, the AI apps' `read` with
  format emf, the Mac's copy for Office, and Linux. Paste reads the CDXML comment as before, in 1.2 and in 1.1.2.
- ChemDraw: the pictures of ChemDraw for Windows objects in Word documents are EMF+ dual EMFs with anti-aliasing on
  (190 of 192 objects in five documents; MestReNova's 179 of 179). ChemDraw has a switch, File > Preferences >
  General > "Use Antialiasing When Generating Windows Metafiles"; Revvity's support article 4408239935508 gives it as
  the cure for the same complaint. Octet has no switch: it is always on. The old reason to turn it off was printer
  drivers, and Office object off gives the GDI-only picture.
- No new switch. Settings > Import and export > Copy > Office object (Windows only, on by default; Settings' search
  finds it for "word") off gives a plain picture: 1.1.2's plain copy to the byte, 1.1.1's formats in 1.1.1's order.
  After this fix the object's picture is as smooth as a plain picture, so the reason the reporter gave is gone. The
  reasons left for a plain picture (a journal that takes pictures only, a smaller document) are what that switch is
  for, and Word's Paste Special > Picture (Enhanced Metafile) gives one plain paste. A second switch in Settings >
  General > Word would do the same thing in a second place.
- An object pasted with 1.1.2 keeps its jagged picture until the picture changes: double-click it and choose File >
  Update (Ctrl+S), which sends a picture, changed or not. Octet does not change a document the user did not change.

Proof. There is no Windows computer on the Mac where this was built.

- Mac (`cargo test`, `src-tauri/src/vector_plus_tests.rs`): a reader of the EMF+ records by MS-EMFPLUS (sizes, object
  ids defined before use, path point counts and kinds, pens, fonts, an even number of characters in each text record,
  the end record last); every EMF+ shape and text checked against its GDI records (points within 1/20 pt, colours,
  pen widths, fonts, character positions); without its EMF+ comments the EMF is `make_emf`'s to the byte; the same
  input gives the same bytes; and the clipboard's other formats are unchanged.
- Windows CI on every push: Check's smoke job runs `cargo test --bin octet ole -- --nocapture` on its Windows machine
  after the smoke run (`.github/workflows/check.yml`), and the Office objects job in `platforms.yml` runs it on `main`
  and from Run workflow. The tests draw into a DIB section through a DC, as Word draws: `ole_plus_is_smooth` (GDI+ anti-aliases the object's picture and not the GDI-only one),
  `ole_plus_ink_box_and_gdi_pixels` (GDI+'s ink box is GDI's within 2 px; GDI draws the new EMF to 1.1.2's pixels),
  `ole_plus_photo` (a photo through `EmfPlusGetDC`, upright and turned), `ole_plus_fill_mode`, `ole_plus_large_path`,
  `ole_cache_keeps_the_plus_picture` (Windows' OLE cache, filled from the flushed clipboard as `OleCreateFromData`
  fills it, keeps the EMF+ bytes through a save and a load, and prints what it cached), `ole_plus_labels` and
  `ole_plus_zoom` (0.25 to 40 px a pt), and `ole_stress_gdiplus_draws_every_drawing` (every stress drawing, its ink box
  GDI's). Not run yet: they run on the next push.
- Where MS-EMFPLUS is silent, a CI test decides. Fill mode: a nonzero fill sets `PathPointFlags` bit 0x2000, as GDI+
  writes a path with winding fill (`ole_plus_fill_mode`). It matters: Octet's bond outlines overlap a little where
  bonds meet, and drawn even-odd, 42 of L-proline's 4,918 ink pixels at 4 px a pt would be white. Size: a 500-residue peptide's bonds are one path object of
  about 230 KB in one record (`ole_plus_large_path` also prints whether GDI+ takes it continued over records). If
  either fails, the fallbacks are in `docs/plans/issue-166-word-paste-sharp.md` ("If CI says no").
- By hand on Windows: `docs/testing/ole-manual.md`, test 16.

Speed (decision 0024; `cargo test --release --bin octet windows_copy_time -- --ignored --nocapture`; Apple M1 Pro,
with other work running, load average 14 to 23 on 10 cores; the middle of 9 runs taken in turn; 600 dpi, Settings'
default):

| Drawing | Copy with the object | Without it | 1.1.2's Copy | `make_office_emf` | `make_emf` | EMF+ EMF | GDI EMF |
| --- | --- | --- | --- | --- | --- | --- | --- |
| L-proline | 1.84 ms | 1.82 ms | 1.71 ms | 0.010 ms | 0.009 ms | 4,184 B | 3,120 B |
| 40 paclitaxels | 223.6 ms | 222.4 ms | 223.2 ms | 1.00 ms | 0.74 ms | 964 KB | 705 KB |
| A 500-residue peptide | 331.3 ms | 333.3 ms | 329.7 ms | 1.55 ms | 1.14 ms | 1.51 MB | 1.13 MB |

Copy is within 1.1.2's time plus a tenth and 2 ms: reading the SVG and drawing the bitmap are most of it, and the EMF
is made beside the bitmap. The object window's picture (after each change, off the main thread) takes 1.3 to 1.4
times `make_emf`'s time, and 1 ms for 40 paclitaxels. The EMF+ EMF is 1.3 to 1.4 times the GDI EMF; a photo adds
under 1 KB. The drawings other than L-proline are made by a generator with Octet's export's shapes and counts
(`octet_drawing`): paclitaxel 69 bonds and 20 labels, the peptide 3,500 bonds and 1,500 labels in one path of about
24,000 points.

Not checked: LibreOffice reads EMF+ records with its own reader, which may not take the winding fill flag. A copy
pasted into LibreOffice on Windows with the object on may show that. The LibreOffice item (issue 48) owns it.

## Threads

- Every COM object lives on the main thread, the thread of the window loop. That thread is a single-threaded
  apartment: the window library initialises OLE there, and Octet does too before it registers.
- No incoming call waits for the page, makes a window or shows a dialog: a window made on the main thread in a call
  that waits hangs Octet on Windows (decision 0020). Edit records what to open, starts the window from another
  thread, and returns.
- The object window sends its newest drawing to Octet's side (not to Word) half a second after each change and at once
  when it loses focus. Each message has a number, and Octet drops one that arrives after a newer one. While Word's Close
  runs, Octet takes no message from the page. So `Close` and Quit send Word that drawing at once and never wait for the page.
- The main thread never calls Word to see that it is still there. Octet watches Word's process, learnt from the
  document's window, then from the window of Word's site, then from the call. When none gives it, a thread of its own
  asks Word's site every 2 seconds (the site goes to that thread through the global interface table), so a hung Word
  stops only that thread.
- The page's Update reaches the main thread through `run_on_main_thread`. No COM pointer leaves the main thread.
- No lock is held across a call to Word. Word calls back into Octet during those calls.
- A message filter retries a call that Word refuses while it shows a dialog, for up to 10 seconds.

## Security

- Any program of the same user can make an Octet Drawing and call it. That is the trust a program already has when it
  starts Octet with a file. Other users and other computers cannot: no remote activation, Windows' default COM
  security. Octet does not change process-wide COM security.
- Word run as administrator does not use classes registered per user, so there the object is a picture that cannot
  be edited.
- Protected View and Office's own blocks for objects stay in force. Octet does nothing to get round them.
- Octet registers only its own new class. It changes no class that another program owns.

## Mac, Linux and the web

Office for Mac runs no OLE servers, so Word for Mac shows the picture of a Windows object and cannot open it as an
object. The picture holds the CDXML, so copying it out of Mac Word into Octet gives the drawing.

From 1.1.2 the object window is on every system (`src-tauri/src/objects.rs`), and the Mac and Linux get to it in
their own ways:

- The Mac (`src-tauri/src/word.rs`): File > Edit Picture from Word asks Word, through Apple Events, for the picture
  that is selected. If it is one inline picture whose PDF holds CDXML (Octet's or ChemDraw's), its drawing opens in an
  object window. Update in Word puts the new picture in its place, as one Undo step in Word. With Word's cursor in
  text and nothing selected, the command opens an empty object window, and the first Update puts a new picture at the
  cursor. The Service "Edit in Octet Draw" in Word's Services menu runs the same command.
- A double-click on such a picture in Word opens it too, but only after the user turns this on in Settings > General >
  Word. It is off for a new user and for a user who updates. While it is off, Octet watches no mouse click, and sends
  Word nothing until the user chooses a command.
- Octet sends Apple Events only to Word. macOS asks the user to allow this at the first one.
- Tried with Word 16.115 in a development build. Not tried: a signed and notarised build, and the Service.
- Linux: LibreOffice Writer, Impress and Draw, through Octet's extension (decision 0025).

An Office add-in for Word for Mac and Word on the web is later work.

## Accessibility

The object window is a drawing window, so decision 0019 applies. Word owns the object's alt text: OLE gives a server
no way to set it. Closing the window gives focus back to the object in Word.

## Not decided yet

- What ChemDraw 25.5 for Windows does on the same steps (verbs, File menu wording, when Word's picture changes, the
  size after an edit, whether Insert > Object lists it). Prof. Schramm will check. Octet follows it where it is known.
- Whether Word removes an object made with Insert > Object > Create New that was closed with nothing drawn (Q8). If it
  does not, Octet sends one update of the empty drawing.
- Live updates while drawing. 1.2 updates on Ctrl+S and on close.

## Status of the build

See `docs/testing/ole-manual.md` for what is built, what is tested and what is not.
