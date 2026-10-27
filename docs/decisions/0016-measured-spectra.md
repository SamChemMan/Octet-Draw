# 0016: Measured spectra, and links from their peaks to atoms

Status: built 27 October 2026 for Sam to review (roadmap 1.1.0 step 2, audit item CH-29).

## ChemDraw 26.1

From the 26.1 help (Importing, ChemNMR) and the strings of `ChemDrawBase`:

- File > Open reads JCAMP (JDX, DX) and Galactic SPC. A spectrum becomes an object on the page: NMR, IR, MS,
  UV-Vis or generic. The JCAMP labels it names are XYDATA (X++(Y..Y)), FIRSTX, LASTX, NPOINTS, XFACTOR, YFACTOR,
  XUNITS, YUNITS and DATA TYPE. A file it cannot read gives "unable to interpret this JCAMP file".
- Assignment: select atoms and bonds, Shift-click peaks, then Structure > Make Spectrum-Structure Assignment.
  Clear Spectrum-Structure Assignment removes it. With Lasso or Marquee, pointing at a peak lights its atoms.
- The spectrum object's menu: Center on Page, Bring to Front, Send to Back, Flip, Scale, and Mass Spec Analysis.
- Nothing in the help or the strings shows peak picking, multiplets, J values, integrals or a text line.

Open questions for a run of 26.1 are item 19 in `~/octet-research/notes/chemdraw-checks-pending.md`.

## What Octet does

- `src/jcamp.ts` reads JCAMP-DX 4.24 to 6.0: XYDATA in every form (AFFN, PAC, SQZ, DIF, DUP, with the Y check),
  XYPOINTS, PEAK TABLE (XY, XYW, XYM), NTUPLES pages of a processed NMR spectrum (the real part), and compound files.
  NMR in Hz becomes ppm by .OBSERVE FREQUENCY, and .SHIFT REFERENCE or $OFFSET moves the axis. It reads Bruker's
  processed data (procs, 1r and acqus) too. A raw FID and a 2D spectrum are refused with a plain message.
- Limits, checked before memory is used: 64 MB of text, 2,097,152 points in a spectrum, 8,388,608 in a file, 64
  blocks, blocks nested 3 deep, 100,000 peaks in a table, 16 spectra. A repeat count (DUP) that would pass the
  limit stops the read at once.
- `src/measured.ts` picks peaks above a threshold (2% of the tallest by default, and four times the noise), each
  standing out from its surroundings. For ¹H it groups peaks no more than 18 Hz apart into multiplets, the
  solvent's, water's and TMS's lines apart, and finds first-order patterns and their J values by Hoye's method
  (J. Org. Chem. 1994, 59, 4096). It integrates each multiplet and scales the integrals so the counts are nearest
  whole numbers, or to the count the user gives one.
- The text line follows ACS style: "¹H NMR (400 MHz, CDCl₃) δ 7.26 (d, J = 8.0 Hz, 2H), 7.35–7.20 (m, 5H)". A
  multiplet m is given by the range of its peaks, as MestReNova's multiplet report does.

## Where it is kept

- The spectrum is part of the drawing (`Mol.spectra`, one for each nucleus or kind). The drawing's JSON keeps the
  trace as 16-bit levels in base64 with the range they stand for, at most 262,144 points (a longer trace keeps the
  largest point of each run, so no peak is lost). A drawing opens with the same trace, so peak picking gives the
  same peaks after saving.
- Multiplets have ids. Each atom keeps the ids of the multiplets it is linked to (`Atom.peaks`), as it keeps its
  highlight. So links move, copy, undo and delete with their atoms. A link to an id the drawing does not have is
  dropped when a file or a paste is read.
- The .oct, .cdxml and .cdx files keep the spectrum inside Octet's drawing. ChemDraw does not see it: Octet writes
  no CDXML spectrum object yet.

## Why Octet's own reader

jcampconverter (MIT, cheminfo) reads the same forms. Octet's reader is under 350 lines, checks every limit this
project needs before it allocates, refuses a damaged file with a message the user can read, and adds no
dependency.

## Bruker

Bruker data opens by a drop (the pdata folder, its 1r or procs file, or the experiment folder) and by a pasted path.
File > Open cannot pick it: its file dialog picks files by extension, and 1r and procs have none.
