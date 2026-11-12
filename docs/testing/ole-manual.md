# Octet Drawing objects in Office: manual tests

Decision 0023, issue 24, release 1.2. For Sam (Windows 11 ARM in UTM, Office 365 ARM64, x64 Octet under emulation)
and Prof. Schramm (Windows 11 x64, Office 365, ChemDraw 25.5 side by side).

## Status (6 November 2026)

Nothing here has run on Windows yet. All of it was written on the Mac and type-checked for Windows (`cargo check
--target x86_64-pc-windows-msvc --tests`, debug and release, no warnings; the Mac has no Windows C compiler, so the
check runs with stand-in C tools that compile nothing, which `cargo check` does not need).

Changed on 6 November, to take risks out before the first Windows test:

- The keys go in both registry views. The installer is 32-bit, and without `SetRegView` it wrote the class only to the
  32-bit view, where 64-bit Office does not look. 32-bit Office reads the 32-bit view, so both are written.
- Word's `Close` no longer waits for the page (it waited up to 10 s, pumping messages) and never shows a question. The
  window keeps Octet's side up to date with its newest drawing, so Close sends it at once.
- Octet's main thread no longer calls Word every 2 s to see that it is still there, so a hung Word cannot hang
  Octet. Octet learns Word's process from the document's window or the window of Word's site. If it cannot, a thread
  of its own asks Word instead.
- CI also installs the published 1.1.0, updates it with the new installer as the updater does, and checks the keys.

Built and type-checked for `x86_64-pc-windows-msvc` (`cargo check --target x86_64-pc-windows-msvc`, debug and
release, with `--tests`):

- Registration: the key list (`src-tauri/src/ole.rs` `keys()`), the NSIS hooks that write it on install and remove it
  on uninstall (`src-tauri/windows/hooks.nsh`, `bundle.windows.nsis.installerHooks`), the repair at start in release
  builds, and `octet.exe --register-ole` and `--unregister-ole`. The MSI is no longer built (`bundle.targets`).
- The server (`src-tauri/src/ole_windows.rs`): `IClassFactory`; `IOleObject`, `IDataObject`, `IPersistStorage` and
  `IPersistFile` on one object; `IEnumFORMATETC`; the message filter; `CoRegisterClassObject` with
  `REGCLS_MULTIPLEUSE` in `setup` before Home shows; `-Embedding` starts with Home hidden and without the
  single-instance hand-over; revoke, OnClose and disconnect when Octet ends; an embedding Octet waits for Word's first
  object (a minute at most) and ends when Word lets go.
- The object window: label `object-N`, its own File menu (Update Document1, Save Copy As…, Close and Return to
  Document1, no Revert to Saved), title from `SetHostNames`, Update and Close through `ole_update` and `ole_close` on
  the main thread, Word's Close (save, prompt, no save), Word gone (checked every 2 s through Word's process handle).
- The clipboard: on Windows, with the Office object switch on and the class registered, copy goes through
  `OleSetClipboard` and `OleFlushClipboard` with "Embed Source" and "Object Descriptor" first, then every 1.1.1
  format in 1.1.1's order. Paste reads Octet's own "Embed Source" after Octet's JSON. Settings > Import and export >
  Copy > Office object (Windows only, on by default).
- Insert > Object: Create New (`InitNew`, `DoVerb(OLEIVERB_SHOW)`), and Create from File through `IPersistFile::Load`
  and the `.oct` type's `CLSID` key.

Tested on the Mac (`cargo test`, `npm test`): the class ID, the key list, that the installer's hooks write the same
keys and remove the same roots, the repair rule, `-Embedding` detection, the Object Descriptor's bytes, the size stream and its fallbacks (bad length, out of range, the .oct file's box), the HIMETRIC
size from the EMF frame, the clipboard's order with and without the object, the stream limits on hostile input
(65 MB stated, more or fewer bytes than stated, not UTF-8, a reader that never ends or claims too much), titles and
host names, the verbs. Mac and Linux behaviour is unchanged: every existing test passes.

Written for Windows and type-checked, not run:

- Unit tests in `ole_windows.rs` (`cargo test --bin octet ole` on Windows): storage round trip through
  `IPersistStorage`, hostile storages (no stream, wrong class, not UTF-8, 65 MB, deep nesting passed on as text), the
  object's EMF, WMF and storage through `IDataObject`, the clipboard data object's order, paste from a flattened
  compound file.
- The container harness `src-tauri/tests/ole_container.rs` (`OleCreate`, `OleRun`, `DoVerb`, `OleSave`, `OleLoad`,
  hostile storages through the real server, the server ending), and the job "Office objects (Windows)" in
  `.github/workflows/platforms.yml`, which also installs and uninstalls the NSIS build silently and checks the keys.

Only Windows can prove: everything in the list below. In particular, that Word, PowerPoint and Excel accept the object
from the clipboard, show its picture, activate it, take updates, and close it; and the threading (no hang between
Tauri's main thread and Word's calls).

Not built:

- An update driven by the smoke feature in the harness (the harness checks the server's COM calls, not the page's
  Update).
- R6's picture: an object made with Create from File has no picture until its window sends one Update. Recommend
  R6 in 1.2.1 unless this is acceptable.
- Anything ChemDraw-specific (Q7): waits for Prof. Schramm.

Next steps, in order:

1. Push a branch to run the "Office objects (Windows)" job (Sam's go first). Fix what it finds. The first test prints
   whether per-user registration is seen by the elevated runner (risk 3).
2. Sam: install the NSIS build in the VM and run tests 1 to 8 below. Record what Word caches (EMF or WMF, test 3).
3. If Word caches a WMF: teach `cdxml_from_picture` to find the EMF in the WMF's comment records (D9).
4. Prof. Schramm: the Q7 list and tests 1 to 12 on x64, side by side with ChemDraw.
5. Decide Q8 (an object closed with nothing drawn) from test 6, and Create from File for 1.2 or 1.2.1.

Risks:

- Start-up time under `-Embedding` (a cold start of WebView2 on ARM64 under emulation). Measure in test 2.
- Elevated Word (Run as administrator) ignores per-user classes: the object is a picture there. Expected.
- Size (decision 0023, "Size"). `GetExtent` gives the size in the `OctetSize` stream from Load on, and `SetExtent`
  takes Word's size and gives it back. Check in tests 2 and 3, and in Excel and PowerPoint (test 9): double-click
  does not change the object's size; resize in Word, double-click, close: the size stays; Update with a larger
  drawing: note whether Word takes the new size. _____
- The window may open behind Word if Word does not allow Octet to come to the front. Check in test 2.
- Word closes the document less than half a second after a change, with the Octet window still in front: Word does
  not get that change, and the window stays open with it (Save Copy As). Switching to Word sends it at once, so this
  needs Word closed from a script. Not tested.
- An Octet that Windows started for Word does not take the single-instance hand-over. Starting Octet from the Start
  menu while it runs gives a second Octet process. Check in test 2.
- A copy installed from the 1.1 MSI updates to the NSIS build: Tauri's installer removes the MSI copy first, with
  Windows' own question and a UAC prompt. The 1.1.0 MSI had 3 downloads. Not tested.
- Defender may warn about an unsigned program that registers a COM server. Sign Windows builds for 1.2 if Certum is
  through.

## Before you start

- Windows 11 with Office for Microsoft 365. Not elevated: start Word normally, not as administrator.
- Install Octet from the NSIS installer (`Octet Draw_1.2.0_x64-setup.exe`). No MSI.
- Check the keys: `reg query "HKCU\Software\Classes\CLSID\{211EF98F-E45E-42C8-9D49-A10D2D394DB2}" /s`, and again with
  `/reg:32` at the end. In both, LocalServer32 names Octet's `octet.exe` in quotes. Nothing under HKLM:
  `reg query "HKLM\Software\Classes\OctetDraw.Drawing"` gives an error.
- Settings > Import and export > Copy: "Office object" is on.

Write down for each test: pass or fail, what you saw, and the time where a time is asked for.

## Tests

1. Paste makes an object (R1). Draw L-proline in Octet. Select all, Ctrl+C. In a new Word document, Ctrl+V.
   - Right-click the picture: the menu has "Octet Drawing Object" with Edit and Open.
   - The picture looks as a 1.1.1 paste does, at the same size (compare with Paste Special > Picture (Enhanced
     Metafile)).
   - Save as `proline.docx`. Rename a copy to `.zip` and open it: `word/embeddings/oleObject1.bin` is there, and
     `word/media/` holds the picture.

2. Double-click opens the drawing (R2). Quit Octet. Double-click the object.
   - Time from double-click to the drawing: _____ s (2 s or less).
   - One Octet process in Task Manager. No Home window. One window titled "Octet Drawing in proline.docx" (or
     "Document1" before saving). Word shades the object.
   - With Octet open on another drawing, double-click again in a second document: no second process, a new window
     (0.5 s or less).
   - Double-click the first object again: its window comes to the front; no second window.
   - The window is in front of Word, not behind it.

3. Update (R3). In the object window, change a label. Press Ctrl+S (File > Update proline.docx).
   - Word's picture changes at once. The title loses "(edited)".
   - Save the document, close Word, open it again, double-click: Octet shows the changed label.
   - Unzip the `.docx` again: is the picture in `word/media/` an `.emf` or a `.wmf`? _____. Copy the picture
     out of Word (right-click > Copy) and paste into a new Octet drawing: the drawing comes back (R11 checks the
     storage; this checks the picture).

4. Close updates Word (R3, Q2). Change something, then File > Close and Return to proline.docx (or the window's close
   button). Word's picture changes, with no question. Focus is on the object in Word.

5. Word closes first (R14). Open the object, change it, do not update. In Word, close the document and choose Save.
   Word closes at once, with no question from Octet.
   - The change is in the document when you open it again (Octet sent it before Word saved), and the Octet window
     closed.
   - Again, but end WINWORD.EXE in Task Manager while the window is open with a change. Within 2 s the title says
     "Octet Drawing (proline.docx is closed)". Ctrl+S says the document is closed. File > Save Copy As… saves a `.oct`
     that opens with the change.

6. Insert > Object (R5, Q8). In Word, Insert > Object > Create New: "Octet Drawing" is in the list. Choose it.
   - An empty object window opens. Draw benzene, Ctrl+S, close. The document shows benzene.
   - Again, but close the window with nothing drawn. Does Word keep an empty object? _____ (Q8).

7. Create from File (R6). Insert > Object > Create from File, pick `aspirin.oct`, Link to file off.
   - The object is an Octet Drawing (not a Package icon). Note what its picture is before you open it: _____.
   - Double-click: Octet shows aspirin. Ctrl+S: the picture shows aspirin.
   - Tick Link to file and try again: write down what Word does. _____

8. Settings switch (R16). Settings > Import and export > Copy > Office object off. Copy, paste into Word: a picture, as
   in 1.1.1 (no "Octet Drawing Object" on right-click). Switch it on again.

9. PowerPoint and Excel (R7). Tests 1 to 4 and 6 in PowerPoint and in Excel. In PowerPoint, the slideshow never
   opens the object. In Excel, resize the cell and the object: note what happens to the picture. _____. In Outlook, a
   new mail: paste and double-click once.

10. Copy out of Word, paste into Octet (R11). Draw a catalytic cycle (issue 28) in Octet, paste into Word. In Word,
    select the object, Ctrl+C. In a new Octet drawing, Ctrl+V: the whole cycle comes back.

11. Other programs (R10). Copy from Octet with the object on, and paste into ChemDraw for Windows, MestReNova and
    LibreOffice Writer: each pastes as it did with 1.1.1. Paste into another Octet window: the drawing, as before.

12. Uninstall (R8, R12). Uninstall Octet (Settings > Apps). No UAC prompt at install or uninstall.
    - `reg query "HKCU\Software\Classes\OctetDraw.Drawing"` gives an error.
    - Open `proline.docx`: the picture shows, prints and exports to PDF as before. Double-click: Word's own message
      that the program is missing; nothing is lost.
    - Install again: the object opens in Octet.
    - On Sam's Mac (R9): open `proline.docx` in Word for Mac. The picture shows. Copy it into Octet for the Mac: the
      drawing pastes. Save in Mac Word, open on Windows: the object still opens in Octet.

13. Accessibility (R15). With Narrator on: select the object with the keyboard, Shift+F10, Octet Drawing Object >
    Edit. Narrator reads "Octet Drawing in proline.docx". Change a label with the keyboard, Ctrl+S, Ctrl+W (or File >
    Close and Return). Focus returns to the object in Word.

14. Hostile objects (R13). Only with the files the CI harness makes, or ones Sam makes: a document whose object holds
    a 65 MB stream or text that is not UTF-8. Double-click: "Octet cannot open this object." and no crash.

15. Quit with object windows open (R14). Open two objects from two documents, change both, then File > Exit in Octet.
    Both documents get the changes; Octet ends; no question for the object windows.

## For Prof. Schramm: ChemDraw 25.5 side by side (Q7)

Only behaviour and registry data, on your own computer. No decompiling.

- Does ChemDraw edit in place inside Word, or in its own window? Which verbs does Word's menu show for a ChemDraw
  object?
- The File menu wording in ChemDraw's window for an object.
- Does Word's picture change as you draw, on Save, or on close? Does closing ask?
- After an edit that makes the drawing larger, what happens to the object's size in Word? (Same drawing in Octet:
  test 3.)
- Does Insert > Object list ChemDraw? What does Create from File do with a `.cdxml`?
- An export of `HKCR\CLSID\{ChemDraw's CLSID}` and its ProgID key (`reg export`).
- Same molecule, same steps, in ChemDraw and Octet: the number of steps and the time for tests 1 to 4.
