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
  drawing. If Office asks for a Windows metafile, Octet gives the EMF converted by Windows.
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
