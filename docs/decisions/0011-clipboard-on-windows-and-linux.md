# 0011: The clipboard on Windows and Linux

Status: built on stream/release, 18 October 2026, for plan items REL-3 and CH-1 (approved by Sam). Adds to Sam's
note in CLAUDE.md ("Version 1 mirrors ChemDraw's clipboard: a vector PDF at true size…"), which describes the
Mac: Office for Windows pastes no PDF, so the picture there is an EMF and a bitmap.

## Decision

Copy puts the same things on the clipboard on every system, in ChemDraw's order: a picture, CDX, a molfile and
SMILES. CDXML goes after CDX as its own type, as ChemDraw JS writes it. Octet's own JSON goes last. No plain
text, so Word and ChemDraw paste the picture and the drawing, not text. Settings > Import and export > Copy
switches each one off, except Octet's JSON. Only the names and the picture change from system to system
(`src-tauri/src/clipboard.rs`).

| | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Picture | Office's own copy of the picture (a zip with an EMF in it) and a PDF (vector, CDXML in both) | EMF (vector, CDXML in a comment) and a bitmap (CF_DIB) | image/png (CDXML in an iTXt chunk) and image/svg+xml |
| CDX | ChemDraw's PerkinElmer, Revvity and CambridgeSoft types | "ChemDraw Interchange Format" | chemical/x-cdx |
| CDXML | com.perkinelmer.cdxml, com.revvity.cdxml and com.cambridgesoft.cdxml | "CDXML" | chemical/x-cdxml |
| Molfile | com.mdli.molfile (length-prefixed lines) | "MDLCT" (length-prefixed lines) | chemical/x-mdl-molfile (text) |
| SMILES | org.opensmiles.smiles (with a NUL) | "SMILES" (with a NUL) | chemical/x-daylight-smiles (text) |
| Octet | io.github.samchemman.octet.json | application/x-octet+json | application/x-octet+json |

ChemDraw 25.5 for Windows puts no CDXML type on the clipboard. ChemDraw 22.2 for the Mac puts none either: its
CDXML is in the PDF. "CDXML" is ChemDraw JS's name.

- The Windows names for CDX, the molfile and SMILES are ChemDraw's. ChemDraw 25.5 for Windows was checked on 4
  November 2026 (issue 23). MestReNova reads the same three chemistry names.
- On Windows the picture is the EMF and a bitmap (CF_DIB): the same picture on white at the export resolution, for
  programs that read no metafile. On Linux the PNG is at the export resolution of true size, transparent, with its
  resolution in it. A large drawing gets a lower resolution: at most 16 million pixels and 8,192 on a side.
- On the Mac, ChemDraw asks macOS for the name of its CDX and CDXML codes ('CDIF', 'CdxM'). ChemDraw 26.1's
  Info.plist gives each code a Revvity and a CambridgeSoft name, and 22.2's a PerkinElmer and a CambridgeSoft
  name. The name macOS gives can be any of them, so Copy writes all three and Paste reads all three.
- Paste reads Octet's JSON, then CDXML, then CDX, then the molfile, then SMILES, then the text the webview
  gives, on every system. With no JSON or CDXML type, the CDXML comes out of the picture (4 November 2026): the
  PDF, Keynote's copy of the PDF it was given (com.apple.iWork.TSPData.*), the EMF, Office's own copy of the
  picture (a zip: "Art::GVML ClipFormat" on Windows, com.microsoft.Art--GVML-ClipFormat on the Mac), the PNG, or a
  PDF, EMF or PNG file copied in Finder or the file manager. A PDF, EMF or PNG with CDXML in it also opens and drops
  as the drawing, and Export puts the CDXML in all three. The picture's CDXML comes before CDX. A paste from ChemDraw
  for Windows always takes CDX, because its EMF holds no CDXML.
- The clipboard's CDX is the plain interchange form for other programs. They read none of Octet's own objects
  from it, such as catalytic cycles: to them a cycle in it is only its arrows (issue 28). It holds Octet's data
  under Octet's own tags, which ChemDraw reads past (decision 0009). Octet's own JSON type is the lossless copy
  from one Octet window to another. Paste reads it first, and Settings cannot switch it off.
- Windows calls the clipboard through `windows-sys`; Linux through GTK (`gtk`), which the window already uses on
  X11 and Wayland. Both crates are in the build through Tauri already.

## Office objects on Windows (release 1.2, decision 0023)

On Windows, Copy also puts an Octet Drawing object first ("Embed Source" and "Object Descriptor"), through the OLE
clipboard, so Word, PowerPoint and Excel paste an object that opens in Octet. It goes on only with the picture, only
while Settings > Import and export > Copy > Office object is on (the default), and only when Octet's class is
registered for the user. Every format in the table above stays, in its order, after the object. Paste reads Octet's
own object after Octet's JSON. The Mac and Linux are not changed.

## Office's copy of the picture on the Mac (12 November 2026, release 1.1.2)

On the Mac, Copy puts Office's own clipboard type for a picture (com.microsoft.Art--GVML-ClipFormat) before the PDF.
Word takes it before the PDF. It is a zip with five small XML parts (content types, two sets of relationships, a
drawing that places one picture at the drawing's size, and a theme) and the picture's file,
`clipboard/media/image1.emf`.

Word for Mac stores a pasted PDF as an EMF of its own with three records: the header, an EMF+ comment that holds a
bitmap of the picture at one pixel a point (72 dpi), and a GDI comment (EMR_COMMENT_MULTIFORMATS) that holds the
PDF. Word for Mac draws the PDF. Word for Windows draws the bitmap, so a drawing pasted on a Mac was blurred in the
same document on Windows.

Octet's EMF in the zip holds the same PDF in the same kind of comment record, then the CDXML comment and the vector
records of the Windows EMF. Word for Mac draws the PDF and keeps the file byte for byte (pasted on 12 November 2026,
with the PDF beside it on the clipboard, and read back from Word). The vector records are for Word for Windows, which
draws Octet's Windows EMF today.

- The comment record is the first record after the header. Word for Mac does not use one that comes after the
  drawing's records.
- The comment names two formats: the PDF, then an EMF that draws nothing (the header and EMR_EOF, 128 bytes). Its
  output rectangle is the picture's bounds. Windows GDI plays the first format it knows. With the PDF alone GDI drew
  every other record, but it reported the comment as a record that failed (PlayEnhMetaFile gave 0), and a program
  that stops at a failed record would show no picture. With the second format GDI plays every record. Word for Mac
  draws the PDF from a comment with one format or with two (a document with each, opened in Word 16 on 12 November
  2026).
- A test plays the EMF with and without the comment through Windows GDI and through GDI+. It expects no error and the
  same pixels from both (`vector.rs`, run by the Office objects job).
- The PDF stays in the EMF because some versions of Word for Mac draw an EMF's records blurred (reported for 16.47
  in 2021). Word 16 of November 2026 draws them sharp.
- The PDF stays on the clipboard after Office's copy, for Keynote, Pages, ChemDraw and every other program.
- Word's own copy of such a picture has the zip with Octet's EMF and the PDF from the comment. Paste reads the
  drawing from the PDF, or from the EMF's CDXML comment when the zip is there alone.
- The EMF on Windows (the clipboard, the Office object, Export as EMF) has no PDF. Its bytes are the same as before.
- The theme part is Octet's own, the smallest the format allows. A picture uses nothing from it.
- A drawing that holds a picture (a photo, a pasted screenshot) gets Office's copy too. Its EMF holds the picture as
  raw pixels (300 dpi at most), the CDXML with the picture's file as hex, and the PDF: the pixels and about 4 times
  the file. Over paste's limit for one type (64 MB, less 64 KB for the zip's other parts) the PDF goes alone.
- Update in Word (decision 0023) gives Word the same two types as Copy (`clipboard::mac_picture`, packed by
  `word::picture`), so an updated picture is Octet's EMF too.
- To check before a release: a document pasted from Octet on a Mac, opened in Word and PowerPoint for Windows (on
  screen, printed, saved as PDF), a paste into PowerPoint and Excel for Mac, Update in Word, and a paste of a drawing
  that holds a photo (its EMF is stored in the zip, not deflated).
- The zip's parts are deflated at the fastest level, but a part over 1 MB (an EMF with a picture's pixels) is stored.
  Copy reads the SVG once and makes the EMF's records on a thread beside the PDF.
- Times on an M1 Pro (`mac_copy_time` in `clipboard.rs`), Copy against the PDF alone, which was Copy before. A
  drawing of 60 bonds and 12 labels: 2.4 ms against 2.2 ms. A drawing with a photo waits for the EMF when the EMF
  takes longer than the PDF. A 1,800 by 1,200 px JPEG: 36 ms against 30 ms. A phone's 12 megapixel JPEG drawn 6 in
  wide: 178 ms against 166 ms. A 12 megapixel JPEG with a small file (0.5 MB) drawn 8 in wide: 226 ms against 65 ms,
  because drawing its pixels takes far longer than its small PDF.
  Sam accepted these times on 12 November 2026 (decision 0024), for a picture that is sharp in Word for Windows.

## The EMF (4 November 2026, release 1.1.1, issue 20)

Prof. Schramm compared Octet 1.1.0's EMF with ChemDraw 25.5's for Windows on the same molecule. Three changes follow.

- Labels and captions are text, as in ChemDraw's EMF: a font record (EMR_EXTCREATEFONTINDIRECTW) and the characters
  (EMR_EXTTEXTOUTW, baseline-aligned), with each character's advance given, so every glyph lands where the PDF has it,
  subscripts and superscripts included. Word and PowerPoint can search them, screen readers and text extraction get
  them, and recolouring atoms in Office later needs them. Letters Octet draws one at a time (the H and O of HO) are one
  string when they abut in the same font.
- Text stays outlines where GDI cannot draw it as usvg did: a face no Windows has, turned or slanted text, a stroke or a
  line under, over or through it, a character outside the Basic Multilingual Plane or a control character, a missing
  glyph, or right-to-left text. The faces: those every Windows 10 and 11 has (Arial, Times New Roman, Courier New,
  Calibri, Segoe UI and the other core fonts), and Helvetica, Liberation, Arimo, Tinos and Cousine written as the
  Windows font with the same widths (Arial, Times New Roman or Courier New). The EPS keeps all text as outlines.
- The metafile's reference device is 96 dpi (20 by 15 in, 1,920 by 1,440 px). A device pixel is exactly 15 logical
  units (1/20 pt each), every size in the header is a whole number, and bounds records are in device pixels.
  Release 1.1.1 made it 720 dpi, because programs that draw a metafile into pixels at its reference resolution
  (GDI+'s DrawImage) were said to make bonds fat at 96 dpi. ChemDraw's is about 261 dpi.

  Changed back to 96 dpi in release 1.1.2 (issue 55). Word sizes a metafile with text in it by its bounds, read at
  96 dpi, and one with no text by its frame. At 720 dpi a drawing with labels pasted at its true size with a 13%
  scale, and was 7.5 times too large at 100%. At 96 dpi the two sizes agree to under a device pixel (0.75 pt).
  Prof. Schramm checked on Windows 11 (Word 365 16.0.17932): GDI+'s DrawImage draws the 96 and 720 dpi metafiles
  the same, with a hashed wedge's hashes apart. The frame stays the ink's size: Word places the pasted picture by it.
- Every picture's frame fits its ink (Copy and Export, every format alike): a label counts by its glyphs' ink (canvas
  measureText), a stroke by half its width, and the edges are rounded outward to 0.01 pt. Before, labels counted by
  their line boxes and the edges went out to whole points. L-proline went from 58 by 41 pt to 56.21 by 36.55 pt, its ink within 0.01 pt of each edge (ChemDraw:
  within 0.2 pt). Export's margin is added to that, as before; Copy has none. Text still counts by its line box where
  the glyphs cannot be placed exactly: turned or underlined text, and text on the middle baseline (atom numbers, R and
  S), which Chromium's getStartPositionOfChar does not move.

Word keeps the EMF byte for byte (SHA-256 checked on Windows 11 with Word 365): its zip holds the EMF as Octet put
it on, comment and all.

## ChemDraw for Windows (4 November 2026, issue 23)

Prof. Schramm checked a copy from ChemDraw 25.5 for Windows on Windows 11. ChemDraw put 14 formats on the clipboard:
"ChemDraw Interchange Format", "ChemDraw Structure Data", "MDLSK", "MDLCT", "SMILES", "SLNSTRING", CF_ENHMETAFILE,
CF_METAFILEPICT, "Embed Source", "Native", "OwnerLink", "Object Descriptor", "Ole Private Data" and "DataObject". No
"CDXML", no PNG and no bitmap.

- CDX is the only route a ChemDraw paste takes on Windows. It carries the whole drawing: structure, wedges, captions
  and arrows. MDLCT and SMILES are there if the CDX cannot be read. Paste reads none of the other formats, because
  CDX always comes with them and carries more. `chemdraw_for_windows_pastes_its_cdx` in `clipboard.rs` tests this.
- ChemDraw's SMILES for a drawing with an arrow is reaction SMILES, with a side left empty
  (`O=C(O)[C@H]1NCCC1>>`). Octet reads it as the structure and an arrow. Octet's own Copy writes no `>>` for a
  structure with a lone arrow.
- ChemDraw's EMF holds no CDXML. ChemDraw keeps the structure in its OLE formats ("Embed Source", "Native"). So a
  ChemDraw picture copied back out of Word on Windows gives Octet a picture at best, as Octet does not read the OLE
  formats yet. When the clipboard holds something and Paste can use none of it, Octet says "Octet cannot read what is
  on the clipboard." An empty clipboard gives no notice.

## Not done

- Not checked on Windows: how PowerPoint and LibreOffice size and draw the 96 dpi metafile and its text records.

## Risks to check

- Neither system was run: Windows and Linux code was type-checked on the Mac against `windows-sys` 0.61 and
  `gtk` 0.18, and the formats were checked by `cargo test` (`windows_and_linux_copy_the_same`). Check on a
  Windows and a Linux computer: a copy into Word, PowerPoint, LibreOffice and ChemDraw for Windows; a copy and
  paste between two Octet windows. A paste from ChemDraw 25.5 for Windows was checked on 4 November 2026 (issue
  23): the whole drawing comes across through CDX.
- Not seen yet: what Word for Windows puts on the clipboard when a ChemDraw object is copied out of it, and whether
  ChemDraw for Windows pastes a copy from Octet that has only the CDXML type.
- Edit > Cut, Copy and Paste from the menu on Linux did nothing when clicked (the keys worked): GTK's own items
  press the keys only with libxdo, which Octet does not use. Since 27 October 2026 they are Octet's own items there,
  as Close Window is. They take Ctrl+X, C and V, and the page runs them: in a text field on its text through the
  app's clipboard, elsewhere as the drawing's cut, copy and paste. The Reaxys window has no menu bar on Linux, so its
  page keeps those keys. Windows keeps the system's items: muda presses Ctrl+X, C and V there with SendInput, which
  reaches WebView2 as the keys do. `.github/workflows/platforms.yml` tries both on GitHub's Windows and Linux
  machines.
