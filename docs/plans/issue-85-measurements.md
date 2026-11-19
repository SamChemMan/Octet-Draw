# Measurements: distance, angle and dihedral (issue 85)

Branch `item/85-measurements`, from `release-1.2-mcp` b30f413, rebased on `release-1.1.3` f06d1b4. Ships in 1.1.3
(Friday 20 November 2026): Sam, 19 November, every built item ships.

Stefan's issue asks for objects that show the distance between two atoms, the angle at three and the dihedral
across four, for teaching conformational analysis and for figures. Sam's comment of 9 November: distance, angle
and dihedral are planned; exclusion spheres are out. Plane and centroid only if cheap (they are not: see Cut).

## What Octet has now

- No measurement object. Nothing in `src/` draws, stores or reads one. The only torsion code is in two test
  helpers (`src/clean3d.check.ts:14`, `src/depth.check.ts:111`).
- 3D geometry: `Atom.location[2]` is the atom's depth in bond lengths (`src/render.ts:41-46`). It comes from 3D
  Clean Up (`src/clean3d.ts:61`, up to `MOST_3D` = 500 atoms a structure, `src/clean3d.ts:14`), Structure
  Perspective turns, and files (CDXML `xyz`, read at `src/cdxml.ts:1586`, written at `src/cdxml.ts:716`; MOL; CIF).
- 3D Clean Up works in bond lengths: a bond's real length over a C–C single bond (`ratio`, `src/clean3d.ts:96-99`,
  covalent radii at `src/clean3d.ts:24`), and the unit is the median of drawn length over ratio
  (`src/clean3d.ts:101-102`). So a bond length in the drawing times 1.52 Å over that unit is its length in Å.
- The CDX tag table knows ChemDraw's geometry and constraint objects (`src/cdxtags.ts:10`, `:307-312`), but the
  CDXML reader drops them and lists them as left out (`src/cdxml.ts:1514`).
- Text that belongs to atoms already exists: compound numbers (`Caption.under`) and live property text
  (`Caption.property`, worked out again as the structure changes, `src/proprows.ts:108`). Remapping atoms on delete
  is in `removeAtoms` (`src/edit.ts:925-956`), on copy in `pick` (`src/cdxml.ts:1176-1193`).

Gap confirmed: the whole feature is missing.

## ChemDraw (cross-check)

Sources: ChemDraw 26.1's help (3D Properties page, and the 22.2 to 26.1 changes to it), its Structure menu as
26.1 shows it, its hot keys, and the public CDX format specification (Constraint and Geometry objects;
ConstraintType, GeometricFeature, BasisObjects, ConstraintMin, ConstraintMax, DihedralIsChiral,
IgnoreUnconnectedAtoms).

- Structure > Add 3D Property, between R-Logic Query… and Enhanced Stereochemistry: Angle, Dihedral, Distance,
  Line, Plane, Exclusion Sphere, Normal, Point, Centroid. No hot key.
- They are 3D query constraints for pharmacophore searches. Each value is a range (Å or degrees). Atoms are
  picked with Shift+click in order, then the menu item.
- Point opens a dialog: a distance from the first point towards the second, in Å or as a percentage.
- Constraint values can be edited with the Text tool; only an exclusion sphere shows the change.
- They update when the structure changes and cannot be moved on their own.
- CDXML: `constraint` (ConstraintType Distance, Angle or ExclusionSphere; BasisObjects; ConstraintMin and Max;
  DihedralIsChiral; IgnoreUnconnectedAtoms) and `geometry` (GeometricFeature: points, best-fit line and plane,
  centroid, normal). An object tag named "distance" or "angle" may hold the graphic ChemDraw shows.

ChemDraw has no object that shows a measured value. Its constraints are a search feature. So Octet's measurement
is its own object, written to ChemDraw as text and dashed lines (decision D6). Every ChemDraw option Octet does not
get is listed under Cut.

## Jobs

Each job is done when its "done" line is true and its checks in the acceptance list pass.

**J1. The measurement and its maths** (`src/measurement.ts`, new)
- A measurement is a caption with `measure: { atoms: number[]; at?: [number, number] }`. 2 atoms is a distance,
  3 an angle at the middle atom, 4 a dihedral about the bond from the second to the third.
- Its value from the atoms' `location` (x, y, depth): Å for a distance, degrees for an angle (0 to 180), and a signed
  dihedral (−180 to 180, IUPAC sign). Undefined when two atoms coincide or three in a row are on one line.
- Å per drawing unit: 1.52 over the median of (3D bond length / ratio) over the bonds of the structures the atoms
  are in, with `ratio` exported from `clean3d.ts` (no change to what 3D Clean Up does). No bonds: 1.52 over the
  atom's scale. The ratios are cached by structure (bonds and elements), so a drag pays only for the median.
- Text: `2.54 Å` (no-break space), `109.5°`, `−60.2°` (U+2212), `–` when undefined. Interpret Chemically off.
- Order: from the Measure tool, the order the drag passed the atoms. From the menu and the MCP: along the bonds when
  the atoms make a chain of bonds, else the order they were picked or given.
- `settleMeasures(before, after, style)`: drops a measurement whose atoms are not 2 to 4 distinct atoms of the
  drawing, works out each text, and places each label (D4). It returns `after` itself when no caption has
  `measure`.
- Done: values agree with the test geometries to 0.01 Å and 0.1°, and every rule in this list has a check.

**J2. Editing** (`src/edit.ts`, `src/Editor.tsx`, and the readers of captions)
- `set` and the drag view (`shown`) call `settleMeasures`, beside `placeCentres` (`src/Editor.tsx:1074`, `:3407`).
  The 3D turn (tilt) drag too. Opening, pasting and inserting call it with no `before`.
- An atom deleted takes its measurements with it, in the same step (`removeAtoms`). Joins remap them; two atoms
  joined into one end the measurement.
- Copy, paste, duplicate, templates and `pick`: a measurement comes with its atoms. A label copied without all its
  atoms comes as plain text, as live property text does.
- A measurement label is attached text, as a compound number is: it belongs to its atoms (`attached`,
  `src/edit.ts:988`), so Space, groups and copies take it with its structure. No turn, flip or scale moves it on
  its own (`transformParts`, `src/edit.ts:2198`; `movers`): it follows its atoms.
- The label moved alone (drag, arrow keys, MCP move) keeps its new place relative to its atoms.
- Typing over the text, or Un-tie from structure, makes it plain text (as for live property text).
- It never reads as chemistry: not conditions (`reaction.ts`), not a compound number (`numbering.ts`), not a
  mixture, not a chart's data, never joins a cycle (`dropOnCycle`), never ties to a structure, never Make element
  or Convert name to structure. The MCP layout check leaves it out.
- Accessibility: it belongs to its structure (`src/access.ts:246`) and reads as "Distance 2.54 Å".
- Done: every edit function in the sibling list keeps measurements right in `measurement.check.ts`.

**J3. Drawing** (`src/Editor.tsx`)
- The label is the caption, centred on its point.
- Dashed lines between consecutive atoms that are not bonded, stopped short of a label as bonds are. An angle has
  an arc at its middle atom, 0.4 bond lengths across. A dihedral has no arc.
- Lines in the caption's colour (or the ink), at the document's line width, with Octet's dashed-line pattern, in the
  canvas layer under the structures (so every picture export and Print has them).
- Hover and selection look as text and lines do. A press on a line picks the measurement, as on its text.
- Live: while atoms are dragged, turned or turned in 3D, lines, value and label follow every frame.
- Done: seen in the dev server in light and dark, at 10% and the highest zoom; no `look:` errors.

**J4. Making one**
- The Measure tool, in the specialist tools' strip (`src/tools.tsx:98`, `:394`), with a glyph in Phosphor's style
  (two bonds and a dashed line across their ends). Press on an atom, drag through the atoms in order, let go: two
  atoms a distance, three an angle, four a dihedral. Lines and the value show while dragging. Going back over the
  last atom takes it off. Escape stops. A press that is not on an atom does nothing. Holding still selects, as with
  every tool.
- Structure > Measure > Distance, Angle, Dihedral, where ChemDraw has Add 3D Property (after R-Logic Query…,
  `src-tauri/src/main.rs:913`). Each is on when that many atoms are selected.
- The Actions panel and the right-click menu, with 2 to 4 atoms selected: Measure distance, Measure angle or Measure
  dihedral (`src/Actions.tsx`, structure context, beside Add multi-centre attachment). The command palette lists it.
- A flat structure (no atom with depth) is cleaned up in 3D first, as 3D Clean Up does it, in the same step, with
  the glide. Over 500 atoms: no clean-up, the same notice 3D Clean Up gives, and the value from the flat drawing.
- The same measurement asked for again picks the one there.
- The new measurement is picked.
- Done: each path makes the same object in one undo step.

**J5. Files and the clipboard**
- `.oct` and Octet's clipboard (JSON): the caption with `measure: { atoms, at? }`. On read, an unsound `measure` is
  left out and the caption stays as its text (`src/file.ts` `readCaptions`). The text, x and y are always written.
- CDXML and CDX: the label as `t` with InterpretChemically no and Octet's data `measure: { atoms: node ids, at }`;
  the dashed lines and the arc as Octet-only graphics (`Octet: {"d":1}`), which ChemDraw draws and Octet skips.
  Octet's own file reads back the measurement; a file ChemDraw has saved reads back as text and dashed lines.
- Done: round trips in the checks, and the ChemDraw and Octet 1.1.2 checks below.

**J6. MCP** (`src/mcp.ts`, small and local)
- `text` takes `measure`: 2 to 4 atom ids in order (s3.2). It makes the measurement as the tool does, flat
  structures cleaned up in 3D first, and says so.
- `read`: a measurement's text entry has `measure: { kind, atoms, value, unit }`.
- `run_command measure`, with ids in order, as the menu.
- `edit` (colour, size, font, bold, italic, underline), `delete` and `move` work on its t id as on any text.
- Done: each of these, and each bad argument in the stress list, has a check.

**J7. Speed and the full test run**
- No cost for drawings without measurements: `settleMeasures` returns the same object, so nothing downstream draws
  again. A timing check holds the cost with measurements.
- Done: `npm test` passes; timing checks pass when run alone, measured against the base the same way.

## Rules every part keeps

1. A value always comes from the atoms as drawn now. The text in a file is a copy for other programs.
2. Å with 2 decimals, degrees with 1. A dihedral has its sign.
3. The Å scale comes from the measured structures' own bonds, so scaling the drawing or changing the document style
   never changes a value, and a bond reads the length 3D Clean Up gives it.
4. A measurement follows its atoms. Only moving its label alone changes where the label sits.
5. A measurement goes when any of its atoms goes, in the same undo step.
6. It never reads as chemistry.
7. It behaves as text everywhere else (sibling list).
8. No file, paste or MCP call can make Octet throw. Unsound data is read as plain text or refused with a message.
9. Drawings without measurements cost what they cost in 1.1.2.
10. Everything the user can do with one, the MCP can do.
11. No new dependency and no new default key.

## Design decisions

- **D1. A caption with a `measure` field, not a new list of objects.** Text already has colour, the Text menu,
  selection, Tab, copy, groups, order, files, exports and MCP ids. A new list needs a branch in each of about 20
  places, and each one missed breaks the consistency pillar. Octet 1.1.2 also shows the value as text.
- **D2. Values from the atoms as drawn; a flat structure is cleaned up in 3D when a measurement is made.** A flat
  drawing has no real 3D geometry: its angles read 120° and its ring dihedrals 0°. Measuring from a hidden 3D model
  was rejected: 3D Clean Up takes about 73 ms for paclitaxel on this Mac, which would run on every edit, and the
  number would not match the drawing. After Flatten the values are the flat drawing's: they describe what is drawn.
- **D3. The Å scale is 3D Clean Up's own unit.** With a plain 1.52 Å per median bond, a cleaned-up benzene would
  read 1.52 Å for each C–C bond. With the ratio, it reads 1.38 Å.
- **D4. Label place.** Automatic: a distance's label beside the middle of its line, on the side with fewer
  neighbours; an angle's inside the angle past the arc; a dihedral's beside the middle bond, away from the outer
  atoms. A label moved by hand keeps an offset in the measurement's own frame (along and across its line, its
  angle's bisector or its middle bond), so it rides with turns, 3D turns and a dragged atom.
- **D5. Lines only where there is no bond.** A bond already shows the leg. A dihedral's arc drawn on the page would
  not show the 3D angle, so there is none.
- **D6. ChemDraw gets text and dashed lines, not a constraint.** A constraint is a range for a 3D search: ChemDraw
  would show a range and search with it. Text and lines show ChemDraw the same picture Octet shows.
- **D7. Deleting an atom deletes the measurement**, with no warning. A measurement without one of its atoms has no
  value. Undo brings both back.
- **D8. Typing over the value makes plain text**, as live property text does. The Text menu styles it without that.
- **D9. One drag through the atoms**, as the Atom map tool drags from atom to atom. No click count to finish.
- **D10. Names.** Tool: Measure. Menu: Structure > Measure > Distance, Angle, Dihedral. Actions and palette:
  Measure distance, Measure angle, Measure dihedral. ChemDraw's "Add 3D Property" names its query feature.
- **D11. A measurement asked for twice is made once.**
- **D12. Fixed decimals.** No setting yet.

## Siblings (consistency pillar)

Each is checked for a measurement:

| Behaviour | A measurement |
| --- | --- |
| Colour menu, Actions colour, MCP colour | text and lines |
| Text menu: font, size, bold, italic, underline, plain | the label |
| ⌘A, box, lasso, click, Space (whole structure), Tab | picked as text; Space and groups take it with its atoms |
| Hold to Select | the Measure tool too |
| Undo and redo | every change one step |
| Copy, cut, paste (window to window), Paste into ChemDraw and Office | with its atoms; alone, plain text |
| Duplicate, Add to templates | with its atoms |
| Delete, Eraser, MCP delete | removes it; an atom deleted removes it |
| Move label: drag, arrow keys, MCP move | offset kept |
| Align, Distribute | not a thing of its own, as a compound number |
| Turn, Rotate…, Flip, Rotate 180°, Scale, Structure Perspective (3D turn) | follows; stays upright; values hold (Mirror changes a dihedral's sign) |
| 3D Clean Up, Clean Up Structure, Flatten, Clean Up Reaction | follows the new geometry |
| Group, Ungroup, integral groups | with its structure |
| Bring to Front, Send to Back | as text |
| .oct, CDXML, CDX, Octet clipboard | kept (J5) |
| MOL, SDF, RXN, RDF, SMILES, InChI, HELM, FASTA, LaTeX, 3MF | not written (a picture object) |
| PDF, PNG, SVG, EMF, EPS, TIFF, JPEG, GIF, Print | drawn |
| Dark mode, zoom | as text and lines |
| Screen readers | "Distance 2.54 Å", in its structure |
| MCP read, edit, delete, move, text, run_command | J6 |
| Native menu, right-click menu, Actions panel, command palette | J4 |
| Notes (issues 101 and 102): Annotate…, the Notes panel, MCP edit's note | the label takes a note, as text; it stays through every edit and file that keeps the measurement, and in the label's `t` in CDXML, never in its lines; no picture or other app gets it |

## MCP

- `text` `{ measure: ["s3.2", "s3.5"] }` → `t12`, its text, and "cleaned up s3 in 3D" when it was flat. `text` with
  `measure` takes the text style arguments too; `text` and `id` are refused with it.
- `read` (full): `{ id: "t12", text: "2.54 Å", measure: { kind: "distance", atoms: ["s3.2", "s3.5"], value: 2.54,
  unit: "Å" } }`. The summary lists it under text with `measure: "distance"`.
- `run_command` `{ command: "measure", ids: ["s3.2", "s3.3", "s3.4"] }`: the menu command on those atoms.
- `edit`, `delete`, `move` on t12: as any text.

## Files

| Format | Written | Read | Octet 1.1.2 with the new file |
| --- | --- | --- | --- |
| .oct (JSON part) | caption + `measure` | measurement; unsound `measure` as plain text | the value as plain text where it was, no lines |
| .oct (CDXML part), .cdxml | `t` + Octet data; lines and arc for ChemDraw only | Octet's: measurement. ChemDraw-saved: text and dashed lines | text; the lines are skipped (1.1.2 skips Octet-only graphics) |
| .cdx | as CDXML | as CDXML | as CDXML |
| Octet clipboard | as .oct JSON | as .oct | (not shared between versions) |
| CDXML/CDX clipboard (ChemDraw) | as CDXML | as CDXML | |
| PDF, PNG, SVG and the other pictures, Office PDF | drawn | | |
| MOL, SDF, RXN, RDF, SMILES, InChI | no measurement; depth as now | | |

A drawing saved by 1.1.2 after it opened the file keeps the value as plain text.

## Stress list

| # | Case | Expected |
| --- | --- | --- |
| S1 | Measure tool: press an atom, let go with no second atom | nothing added, no undo step |
| S2 | Drag through 6 atoms | a dihedral of the first four; the rest ignored |
| S3 | Drag back over the last atom, then let go | that atom taken off; a distance of the two left |
| S4 | Drag passes an atom already picked (not the last) | ignored |
| S5 | Empty drawing; press on empty canvas, a bond or text | nothing, no error |
| S6 | Measure on a flat structure, then ⌘Z, then ⇧⌘Z | one step: cleaned up in 3D and measured; ⌘Z gives the flat drawing with no measurement; ⇧⌘Z both again |
| S7 | Flat 500-residue peptide (about 4000 atoms) | no clean-up, 3D Clean Up's notice, value from the flat drawing, under 100 ms |
| S8 | Distance between atoms of two structures, both flat | both cleaned up; the value is their distance as placed |
| S9 | Delete one measured atom, then ⌘Z | the measurement goes in the same step; ⌘Z brings both |
| S10 | Undo and redo 20 steps of add, move label, colour, turn, delete atom | each step gives back the exact text, place and colour |
| S11 | Turn 37°, Structure Perspective turn, Rotate 180° | values the same to 0.001; label upright, same place relative to the atoms |
| S12 | Flip; Mirror | Flip (a 180° turn in 3D) keeps every value; Mirror keeps distance and angle and changes a dihedral's sign |
| S13 | Scale 50%; document bond length 30 pt to 18 pt | values the same |
| S14 | Drag one measured atom | value, lines and label follow every frame |
| S15 | Two atoms at one point; angle with a zero leg; dihedral across C≡C | `0.00 Å`; `–`; `–`. Never NaN or Infinity |
| S16 | Copy a structure with measurements, paste in another window | measurements on the new atoms, same values |
| S17 | Copy part of a structure that leaves out a measured atom, label picked | the label pastes as plain text |
| S18 | ⌘D on a structure with measurements | the copy has its own measurements |
| S19 | .oct save and open | identical measurements |
| S20 | CDXML and CDX save and open in Octet | measurements back; lines not doubled |
| S21 | CDXML opened and saved by ChemDraw 22.2, then opened in Octet | ChemDraw keeps text and lines; Octet opens text and dashed lines, nothing left out |
| S22 | Octet 1.1.2 opens the new .oct | no "damaged" message; value as text in place |
| S23 | Hostile .oct: `measure` atoms -1, 99999, one atom, five, the same atom twice, strings, NaN; `at` 1e9 | file opens; each such caption is plain text |
| S24 | Hostile CDXML: Octet data naming missing nodes; 10,000 measurement captions | plain text; opens within the reader's limits |
| S25 | Dark mode, and a picture exported from dark mode | dark ink on screen; paper colours in the picture |
| S26 | Zoom 10% and the highest zoom | lines, dashes, arc and label scale with the drawing |
| S27 | 40 paclitaxels with 3 measurements each | `set` and a drag frame each at most 1 ms more than without |
| S28 | 500-residue peptide with 10 dihedrals: drag one atom | a frame at most 2 ms more than without |
| S29 | MCP `text` measure with 1 atom, 5 atoms, `s3` (a structure), `s99.1`, an atom twice, a text id | an error that says what to give; nothing changes |
| S30 | Two AI sessions: A measures, B deletes a measured atom, A edits the old t id | the measurement goes; A gets "not found"; no crash |
| S31 | MCP read of a drawing with measurements | each value equals its label |
| S32 | Text tool types over the value; then ⌘Z | plain text, lines gone; ⌘Z gives the measurement back |
| S33 | Label dragged onto a catalytic cycle | does not join the cycle |
| S34 | Measurement next to a reaction arrow | not read as conditions; the reaction reads as before |
| S35 | Hold ⌘Z and ⇧⌘Z through 50 steps; Measure distance three times on the same atoms | no error; one measurement |
| S36 | Distance from a metal to a ring's multi-centre point | measured to the point; follows the ring |
| S37 | ⌘A then Delete | everything goes, measurements too |
| S38 | Flatten, Clean Up Structure on a measured structure | values follow the new geometry |
| S39 | A measurement in a template, placed twice | each placed copy measures its own atoms |
| S40 | Contract Label over a measured atom; a measurement on the label's own atom | the first goes with the atom; the second stays |

## Acceptance list

Checks are in `src/measurement.check.ts` (new) unless named.

| Check | Covers |
| --- | --- |
| Values on built geometries: ethane after 3D Clean Up 1.52 ± 0.02 Å; benzene C–C 1.38 to 1.40 Å; cyclohexane chair dihedrals 55 ± 12° alternating in sign; butane anti 180° and gauche ±60° on set coordinates; tetrahedral angle 109.5 ± 3° | J1 |
| Invariance: turn, 3D turn, scale, style change; flip negates the dihedral | J1, S11-S13 |
| Text forms and degenerate cases | J1, S15 |
| Order rule: bonded chain order beats pick order | J1, J4 |
| `settleMeasures` returns `after` itself with no measurements; drops unsound ones; follows a dragged atom; keeps a moved label's offset under a turn | J1, J2, S14 |
| `removeAtoms`, join, Contract Label, `insertMol`, `duplicateSelection`, `extractSelection`, `pick`, template objects | J2, S9, S16-S18, S39, S40 |
| `transformParts` leaves measurement labels to follow | J2, S11 |
| Reaction reading, numbering and `dropOnCycle` ignore measurement labels | J2, S33, S34 |
| .oct, CDXML and CDX round trips; ChemDraw-saved CDXML read as text and lines | J5, S19-S21 |
| Hostile .oct and CDXML | J5, S23, S24 |
| 1.1.2: its `file.ts` (from tag v1.1.2, run from a scratch folder) parses the new .oct | J5, S22 |
| ChemDraw 22.2 opens and saves a CDXML and a CDX from Octet with three measurements; Octet reads them back | J5, S21 |
| MCP: `text` measure, read, run_command, edit, delete, move, bad arguments, two hosts | J6, S29-S31 |
| Timing: settle on 40 paclitaxels and the peptide, median of interleaved runs, against the base measured the same way; perf.check.ts unchanged | J7, S7, S27, S28 |
| Dev server (port 1470): tool drag, menu, Actions panel, right-click, palette, hold to Select, light and dark, zoom extremes, export SVG and PDF | J3, J4, S1-S6, S25, S26, S32, S35-S38 |
| `npm run look -- http://localhost:1470/`: the Measure tool button and the Actions button match their neighbours; no `look:` errors | J4 |
| `cargo check` (own target folder) for the menu | J4 |
| `npm test` | all |

## Cut (not in 1.1.3)

- ChemDraw's other 3D properties: Line, Plane, Normal, Point (and its dialog), Centroid, Exclusion Sphere. Each
  needs points that are not atoms, with their own drawing and file forms. Not cheap. Sam put exclusion spheres out.
- ChemDraw's constraint ranges (minimum to maximum, signed or unsigned dihedral, unconnected atoms in a sphere),
  and reading ChemDraw's constraint and geometry objects as objects. They are a 3D search feature and Octet has no
  3D search. On open they stay "left out", as now.
- A choice of decimals or units (pm, nm, radians).
- Measuring to implicit hydrogens: they are not atoms in the drawing.
- Line width and line style for a measurement's lines (the document's are used).
- Setting a value to move atoms (a dihedral typed to turn a bond).
- ChemDraw's Info window (distance and angle of a drag or a selection on the page): a different, 2D feature.
- Measurements in 3MF models and in MOL V3000 3D blocks.

## Changes while building (17 November 2026)

What the build changed in this plan, and why:

- `addMeasure` and `cleanedFor` are in `edit.ts`, not `measurement.ts`. They need `addCaption` (edit.ts), and
  edit.ts needs `measurement.ts`; the two importing each other broke Vite's hot reload.
- Label place (D4): the automatic place is the nearest one clear of bonds, atoms and the measurement labels placed
  before it (the first hundred), out along the measurement's frame: both sides of a line in turn, inside an angle
  first and then outside it. The first build put a 1,4 distance's label on the ring's far bonds.
- A settle works out again only the measurements whose structures the edit changed, or whose label it changed. A drag
  frame of 40 paclitaxels with 120 measurements went from 30 ms to 0.4 ms.
- A file opens with each label where Octet saved it (`settleMeasures` with `kept`): only the values are worked out
  again, so a drawing opens as it was saved.
- "Flat" (J4) is no depth and no depth shading. 3D Clean Up turns shading on, so a structure that is flat in 3D (anti
  butane) is not cleaned up again at each new measurement.
- The arc is a solid line; the lines between atoms are dashed.
- Structure > Measure's items are always on, as Add Multi-Centre Attachment's are (native menu items here have no
  enabled state). With the wrong number of atoms selected, a notice says how many to select.
- Each command has its own icon (look.check: one icon for one command): Measure distance two atoms and a dashed line,
  Measure angle an angle sign, Measure dihedral a Newman projection. The Measure tool's icon is an angle with a dashed
  line across its ends.
- The command palette lists Measure distance, angle and dihedral. It lists no specialist tool (Atom map, TLC plate),
  so the Measure tool is not there either.
- Speed: the ring search (rings.ts) stops at 19 bonds from each bond, as rings of more than 20 atoms were left out
  already, and 3D Clean Up's typing lists each atom's bonds once. Results are the same; Measure on a flat 4000-atom
  peptide went from 3.8 s to 60 ms.
- In the Actions panel and the right-click menu, Measure distance, angle and dihedral are in 3D tools, beside 3D
  Clean Up (they measure in 3D, and clean up a flat structure first).
- AI apps: new text over a measurement (edit's text or runs, text with id) makes it plain text, as typing over it does.
- The ChemDraw 22.2 round trip by AppleScript did not run on 17 November: ChemDraw 22.2 (started by another session at
  10:29) opened no file sent to it, not even a plain Octet CDXML with no measurement, and an AppleScript open timed
  out. The same check with ChemDraw's save stood in for by taking out Octet's data passes (measurement.check.ts).

## Finishing for 1.1.3 (19 November 2026)

- Rebased on release-1.2-mcp bd7c684 (the 1.2 bug sweep, the trim and the reagent table).
- Charges typed as text (issue 164) count a "+" or "−" by a structure as its charge. A measurement whose value cannot
  be worked out reads "–", so `symbolOwners` (mixtures.ts) leaves measurements out, and a measurement is not a
  stand-in caption (Make element).
- S12 was written for a mirror. Octet's Flip is a 180° turn in 3D (stereocentres keep their configuration), so a
  dihedral keeps its sign; Mirror changes it.
- The Measure tool's rule for the atoms a drag passes is `passAtom` (measurement.ts), so the stress check runs S1 to S4.
- The stress list is `src/measurements-stress.check.ts`, with the cases other checks hold named at its top.
- Rebased again on release-1.1.3 f06d1b4 (AI off, 1.1.3, and items #77/#100, #59, #83, #43, #60, #103, #48, #82). The
  editor's `set` and drag view keep the release's Jablonski (`followLevels`) steps; measurements settle after them.
- A drawing opened (the editor's `set` with `opened`) settles its measurements with no drawing before and its labels
  kept, so a caption id the window's old drawing also had is not taken for a label moved by hand.
- The automatic label place keeps a gap (0.2 bond lengths) from the measurement labels placed before it. In the dev
  server a distance and then an angle on 3-methylpentane put "110.4°" against "3.23 Å", so they read as one line.
- Plane, normal and centroid stay cut (see Cut). A distance between two groups needs a centroid, which needs a point
  that is not an atom, with its own drawing and file forms.
- The ChemDraw 22.2 round trip did not run on 19 November either. With the lock held, ChemDraw 22.2 (started at
  12:41) listed no documents after `open -g -a`, and an AppleScript open timed out (-1712), as on 17 November. It needs
  a run with the ChemDraw window in view: open Octet's CDXML and CDX with three measurements, save each, and open the
  saves in Octet (S21).
