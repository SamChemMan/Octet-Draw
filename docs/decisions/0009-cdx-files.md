# 0009: Octet reads and writes CDX itself

Status: built on stream/release, 18 October 2026, for plan items CH-3 and REL-17 (approved by Sam). Changes
decision 0001 (Indigo for CDX and CDXML) and brief section 5 ("Import: CDXML, CDX (best effort)"): Octet
reads and writes CDX in full, with its own code.

## Decision

- Octet opens, imports, saves, exports, copies and pastes ChemDraw's binary format, `.cdx`, as well as
  `.cdxml`.
- CDX is the same tree of objects and attributes as CDXML. `src/cdx.ts` turns a CDX file into the tree
  `src/cdxml.ts` reads, and turns the tree `src/cdxml.ts` writes into CDX. One reader and one writer serve
  both formats, so a feature added to one is in the other.
- Indigo is not used for CDX. Indigo reads and writes only the molecules, and loses arrows, text, shapes,
  pictures and styles.
- A `.cdx` file Octet saves holds Octet's drawing (its JSON) in a user property of the document, tag
  0x4F43, first in the document, beside a hash of the rest of the file. As with `.oct` (decision 0004), a
  matching hash gives Octet's drawing back exactly; after another program changes the file, Octet reads the
  CDX as ChemDraw's drawing. Export as CDX and the clipboard's CDX leave the JSON out.
- Copy puts ChemDraw's CDX type on the clipboard (under its PerkinElmer and Revvity names), after the PDF,
  as ChemDraw does. ChemDraw reads it first, so the whole drawing pastes into ChemDraw. Settings > Import and
  export > Copy has a CDX switch.

## Format facts

`src/cdxtags.ts` lists every object and property tag, its CDXML name, how its bytes read and its value
names. It is generated from Octet's research notes (`notes/binary-tag-table.json`, from ChemDraw 22.2's
file-format library and the public CDX spec; `specs-draft/cdx-binary.md`). Facts only; no ChemDraw code.

- The header is "VjCD0100", the byte order (04 03 02 01 little-endian; 01 02 03 04 big-endian, as early Mac
  ChemDraw wrote), 10 reserved bytes, then the document object's tag and id. Indigo leaves the document's
  tag and id as zeros; Octet reads both.
- Text has two copies: each run in its font's legacy charset (0x0700) and in UTF-8 (0x0709). Octet reads
  the UTF-8 copy first. It writes both, as Mac ChemDraw does: the legacy copy in Mac Roman, each run cut at
  its first character Mac Roman lacks.
- Flags are written with no data, Point3D in 12 bytes, style records in 8. The reader checks every length
  against the bytes left, caps nesting at 64 levels and objects at a million, and leaves out a property
  that does not read as its tag says.

## Checks

- `src/cdx.check.ts`: reading, writing, hostile files, Octet's own `.cdx`.
- ChemDraw's own CDX files (29 templates and 21 stationery pads in its bundle, and Sam's clipboard copy; local
  only) read, write and read back the same tree. Written again, 369,369 of the 383,423 properties in the
  little-endian ones match ChemDraw's bytes. The rest: colours older files wrote in 4 bytes (Octet writes 2,
  as ChemDraw 22 does), the font table's platform field, automatic double-bond positions (CDXML cannot tell
  them from chosen ones) and 21 empty H-dot properties.
- `scripts/cdxml-corpus.ts`: each of Sam's 68 files is written as CDX and read back the same.

## Risks to check

- No ChemDraw has opened a CDX file Octet wrote yet (test T04). Sam: save five drawings as `.cdx` from
  Octet and open them in ChemDraw 26.1.
- Whether Windows ChemDraw writes charset 1252 (iso-8859-1) fonts: Octet reads them either way.
- ChemDraw keeps unknown properties when it saves, so a `.cdx` that ChemDraw saved still holds Octet's
  JSON. The hash no longer matches, so Octet reads the CDX instead.
