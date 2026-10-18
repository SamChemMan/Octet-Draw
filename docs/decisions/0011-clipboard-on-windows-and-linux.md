# 0011: The clipboard on Windows and Linux

Status: built on stream/release, 18 October 2026, for plan items REL-3 and CH-1 (approved by Sam). Adds to Sam's
note in CLAUDE.md ("Version 1 mirrors ChemDraw's clipboard: a vector PDF at true size…"), which describes the
Mac: Office for Windows pastes no PDF, so the picture there is a PNG.

## Decision

Copy puts the same things on the clipboard on every system, in ChemDraw's order: a picture, CDX, CDXML, a
molfile, SMILES and Octet's own JSON. No plain text, so Word and ChemDraw paste the picture and the drawing,
not text. Settings > Import and export > Copy switches each one off, except Octet's JSON. Only the names and
the picture change from system to system (`src-tauri/src/clipboard.rs`).

| | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Picture | PDF (vector, CDXML in it) | "PNG" and a bitmap (CF_DIB) | image/png and image/svg+xml |
| CDX | ChemDraw's PerkinElmer and Revvity types | "ChemDraw Interchange Format" | chemical/x-cdx |
| CDXML | com.perkinelmer.cdxml and com.revvity.cdxml | "CDXML" | chemical/x-cdxml |
| Molfile | com.mdli.molfile (length-prefixed lines) | "MDLCT" (length-prefixed lines) | chemical/x-mdl-molfile (text) |
| SMILES | org.opensmiles.smiles (with a NUL) | "SMILES" (with a NUL) | chemical/x-daylight-smiles (text) |
| Octet | io.github.samchemman.octet.json | application/x-octet+json | application/x-octet+json |

- The Windows names are the ones ChemDraw's own clipboard code uses (ChemDraw JS in ChemOffice+, and
  MestReNova reads the same three chemistry names). Research note: `notes/clipboard-blackbox.md`.
- The PNG is at 300 dpi of true size, transparent, with its resolution in it, so Office places it at true
  size. A large drawing gets a lower resolution: at most 16 million pixels and 8,192 on a side. The bitmap is
  the same picture on white, for programs that read no PNG.
- Paste reads Octet's JSON, then CDXML, then CDX, then the molfile, then SMILES, then the text the webview
  gives, on every system.
- Windows calls the clipboard through `windows-sys`; Linux through GTK (`gtk`), which the window already uses on
  X11 and Wayland. Both crates are in the build through Tauri already.

## Not done

- A vector picture on Windows. Office for Windows takes vectors as EMF. Octet would need its own EMF writer,
  and this Mac cannot show an EMF to check one.
- A picture copied back out of Word on Windows does not paste back as a structure (the Mac's PDF carries the
  CDXML; a PNG does not).

## Risks to check

- Neither system was run: Windows and Linux code was type-checked on the Mac against `windows-sys` 0.61 and
  `gtk` 0.18, and the formats were checked by `cargo test` (`windows_and_linux_copy_the_same`). Check on a
  Windows and a Linux computer: a copy into Word, PowerPoint, LibreOffice and ChemDraw for Windows; a paste from
  ChemDraw for Windows; a copy and paste between two Octet windows.
- Edit > Cut, Copy and Paste from the menu on Linux do nothing when clicked (the keys work). Tauri's menu sends
  them only with libxdo, which Octet does not use. Separate from this decision.
