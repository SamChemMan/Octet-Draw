# 0004: The .oct file is CDXML with Octet's drawing inside

Status: decided by Sam, 16 October 2026. Changes brief section 7 ("Native format: Octet's own file
(JSON-based, versioned, human-readable)").

## Decision

- Octet saves `.oct` files by default.
- A `.oct` file is a CDXML document. ChemDraw's own objects describe the drawing, so ChemDraw can read
  it. Octet's full drawing (its versioned JSON) is embedded in the same file, so Octet loses nothing.
- A setting makes `.cdxml` the default save format instead.
- Converting is one step either way: Save As with the other extension. The contents are the same.
- Octet still opens the old `.octet` JSON files.

## Why

Sam wants an Octet file that ChemDraw users can open. ChemDraw only opens `.cdx` and `.cdxml`, so the
file has to be CDXML inside.

## Risks to check before building

- ChemDraw may refuse a file named `.oct`. If so, the user renames it to `.cdxml`, or saves with the
  ChemDraw setting.
- ChemDraw must keep the embedded Octet part when it saves the file. Test this in ChemDraw 22.2.
- If ChemDraw edits the drawing, the embedded Octet part is out of date. Octet stores a hash of the
  CDXML it wrote; when the hash no longer matches, Octet reads the CDXML and ignores the embedded part.
- `.oct` is also the extension of GNU Octave's compiled function files. A clash in the Finder is
  unlikely, since few chemists have Octave installed.
