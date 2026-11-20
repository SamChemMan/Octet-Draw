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

**J1. The measurement and its maths** (`src/measurement.ts`; redesigned 19 November 2026)
- A measurement is a caption with `measure: { ends, at? }`. `ends` in order, each an atom (its index) or a free point
  fixed in drawing units (`[x, y]`). 2 ends is a length, 3 an angle at the second end (the vertex), 4 a dihedral about
  the second to the third. A dihedral's 4 ends are atoms. Atom ends are distinct.
- The old form `{ atoms, at? }` (the 1.2 beta, and .oct files saved by 1.1.3 dev builds) is read everywhere a
  measurement is read (.oct, Octet's clipboard, CDXML and CDX Octet data) as ends that are all atoms (`readMeasure`).
  Only the new form is written.
- Its value is worked out from the ends as drawn (D2). All ends atoms: from the atoms' `location` (x, y and depth).
  Any free end: on the page plane, depth left out for every end. Å for a length, degrees for an angle (0 to 180), and a
  signed dihedral (−180 to 180, IUPAC sign). Undefined when two ends coincide or three in a row are on one line.
- Å per drawing unit: when any end is an atom, 1.52 over the median of (3D bond length / ratio) over the bonds of the
  measured structures (D3), with `ratio` from `clean3d.ts`. No bonds: 1.52 over the atom's scale. All ends free: the
  document's bond length is 1.52 Å. The ratios are cached by structure, so a drag pays only for the median.
- Text: `2.54 Å` (no-break space), `109.5°`, `−60.2°` (U+2212), `–` when undefined. Interpret Chemically off.
- Order: from the Measure tool, the order clicked. From the menu and the MCP: along the bonds when the atoms make a
  chain of bonds, else the order they were picked or given.
- `settleMeasures(before, after, style)`: drops a measurement whose ends are not sound, works out each text, and places
  each label (D4). A label moved by the same step as every atom end (or with no atom end) moves its free ends with it.
  It returns `after` itself when no caption has `measure`.
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
- A measurement with a free end whose label moves with every one of its atoms (⌘A, Space, Select Structure, a box round
  both, Align and Distribute, an Option-drag copy, an AI app's move of both ids) moves whole: its free ends go by the same
  step, so its value stays (`carriedMeasure`, `followsAtoms` in edit.ts). Space and Select Structure pick the structure's
  measurements with it, as ⌘A does. Its atoms moved without its label (a drag of one atom) leave the free ends, so the
  value changes.
- Typing over the text, or Un-tie from structure, makes it plain text (as for live property text).
- It never reads as chemistry: not conditions (`reaction.ts`), not a compound number (`numbering.ts`), not a
  mixture, not a chart's data, never joins a cycle (`dropOnCycle`), never ties to a structure, never Make element
  or Convert name to structure. The MCP layout check leaves it out.
- Accessibility: it belongs to its structure (`src/access.ts:246`) and reads as "Length 2.54 Å" (D10).
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

**J4. Making one** (redesigned 19 November 2026)
- The Measure tool has its own slot on the main toolbar, in a section of its own after Bracket and before Text, with a
  line above and below (Sam, 19 November). Its strip (`src/Menu.tsx`) has three variants: Length, Angle and Dihedral.
  The slot shows the variant last used. Each variant has a keyboard action (Measure length tool, Measure angle tool,
  Measure dihedral tool), with no default key. Measure is not in the specialist slot any more.
- Click to place: with Measure in hand, a click places the next end. Over an atom (ringed on hover, before the click)
  it is that atom; anywhere else it is a free point. Length takes 2 ends, Angle 3 (the angle at the second), Dihedral 4,
  all atoms: a click off an atom does nothing for Dihedral. After each end a dotted line follows the pointer from the
  last end, on to the atom under the pointer when there is one, with the value the next click gives beside the pointer.
  Ends placed so far keep their rings (atoms) or a small dot (free points), with dashed legs between them (none where a
  bond is the leg). An angle shows its arc as soon as its vertex is placed.
- The last click makes the measurement in one undo step, picks it, and keeps Measure in hand. Nothing changes in the
  drawing or its history before that.
- A press moved 4 px or more and let go places the next end where it is let go, so a drag from A to B makes a length.
  A press held still gives Select, as with every tool.
- Escape takes the measurement in progress away. Backspace (or Delete) takes off the last end, and so does Undo (⌘Z,
  Edit > Undo, the toolbar's Undo), with no change to the history; with no end left the measurement in progress ends,
  and the next Undo undoes as usual. Redo does nothing while one is in progress. The Pen's curve in progress is the same
  (20 November 2026). Changing tool or variant, the right-click menu or a menu command takes it away, but for Undo,
  Redo and the View and Window menus' commands (Magnify, Show Grid), which change only what is shown. A click on the end just placed, or on an atom placed already, does
  nothing. With Measure in hand and nothing picked, Delete takes nothing from under the pointer.
- With Measure in hand no handle shows or takes a press (as with the Eraser): a press by the label of the measurement
  just made places an end.
- With grid snapping on, an end off an atom or bond goes on the grid, and the dotted line and the value follow the
  point on the grid, so the value shown is the value the click makes.
- Mouse, pen and touch: pointer events, a tap is a click.
- Structure > Measure > Length, Angle, Dihedral, where ChemDraw has Add 3D Property (after R-Logic Query…). The
  Actions panel and the right-click menu, with 2 to 4 atoms selected: Measure length, Measure angle or Measure
  dihedral. A bond selected or right-clicked (its 2 atoms, the bond's actions) has Measure length too, in the same
  place, beside 3D clean up (20 November 2026). The command palette lists them.
- No 3D clean-up when measuring, from any of these (D2).
- The same measurement asked for again picks the one there. The new measurement is picked.
- Done: each path makes the same object in one undo step.

**J5. Files and the clipboard**
- `.oct` and Octet's clipboard (JSON): the caption with `measure: { ends, at? }`, each end an atom index or a free
  point `[x, y]`. The old form `{ atoms, at? }` still opens (S45). On read, an unsound `measure` is
  left out and the caption stays as its text (`src/file.ts` `readCaptions`). The text, x and y are always written.
- CDXML and CDX: the label as `t` with InterpretChemically no and Octet's data `measure: { ends: node ids or points, at }`;
  the dashed lines and the arc as Octet-only graphics (`Octet: {"d":1}`), which ChemDraw draws and Octet skips.
  Octet's own file reads back the measurement; a file ChemDraw has saved reads back as text and dashed lines.
- Done: round trips in the checks, and the ChemDraw and Octet 1.1.2 checks below.

**J6. MCP** (`src/mcp.ts`, small and local)
- `text` takes `measure`: 2 to 4 atom ids in order (s3.2). It makes the measurement as the tool does, from the
  atoms as drawn (no clean-up). Free points through the MCP are for the 1.2 MCP session.
- `read`: a measurement's text entry has `measure: { kind, atoms, value, unit }`.
- `run_command measure`, with ids in order, as the menu.
- `edit` (colour, size, font, bold, italic, underline), `delete` and `move` work on its t id as on any text.
- Done: each of these, and each bad argument in the stress list, has a check.

**J7. Speed and the full test run**
- No cost for drawings without measurements: `settleMeasures` returns the same object, so nothing downstream draws
  again. A timing check holds the cost with measurements.
- Done: `npm test` passes; timing checks pass when run alone, measured against the base the same way.

## Rules every part keeps

1. A value always comes from the ends as drawn now. The text in a file is a copy for other programs. Measuring never
   changes the drawing.
2. Å with 2 decimals, degrees with 1. A dihedral has its sign.
3. The Å scale comes from the measured structures' own bonds, so scaling the drawing or changing the document style
   never changes the value of a measurement with an atom end, and a bond reads the length 3D Clean Up gives it. With
   no atom end, the document's bond length is 1.52 Å, so a scale changes the value (D14).
4. A measurement follows its atoms. Its free ends move with it when it is moved or transformed as part of a
   selection (its label with all its atoms: ⌘A, Space, a box round both), as a line's ends do. Only moving its label
   alone changes where the label sits. One with no atom end moves whole when its label is dragged: its label is the
   only thing to drag it by (open for Sam: a drag of its label could move the label alone, and a drag of its line the
   whole).
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
- **D2. Values as drawn; measuring never changes the drawing** (19 November 2026, replaces the 3D clean-up). Sam: a
  length to or between empty points reads in Å at the drawing's scale, and measuring never changes the drawing
  (measure as drawn). So a flat drawing reads its flat values (120° angles, 0° ring dihedrals) until the user runs 3D
  Clean Up. The tool, the menu, the Actions panel, the palette and the MCP make the same measurement from the drawing as
  it is, with no clean-up, no glide and no 500-atom notice.
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
- **D9. Click to place** (19 November 2026, replaces the drag through the atoms). Sam: "measure tool is so funky to
  use. you need to see it as a user, perhaps with a little dotted line that spawns when you drag. also holding your
  click is not the meta. that's what people are used to doing to go to select. you should be able to CLICK between 2
  points anywhere on the screen. ... should be a measure - length and a measure angle tool." The flow follows
  Avogadro's Measure tool (click the atoms in order) and the click-to-measure of Figma and Sketch (click, and a line
  with its value follows the pointer). A drag still works (press on A, let go on B), and a hold still gives Select.
- **D10. Names** (19 November 2026). Tool: Measure, with Length, Angle and Dihedral in its strip; "Measure length",
  "Measure angle", "Measure dihedral" where a full name is needed. Menu: Structure > Measure > Length, Angle, Dihedral.
  Actions, right-click and palette: Measure length, Measure angle, Measure dihedral. A screen reader reads "Length
  2.54 Å". One name (Length) everywhere the user reads it; "Distance" is gone. ChemDraw's "Add 3D Property" names its
  query feature.
- **D13. Its own toolbar slot** (19 November 2026). Sam, on the dihedral: "it needs its own slot in the tool bar along
  with pen ... why tf is it hidden like it is? all three of these under one tool." Measure leaves the specialist slot.
  Sam asked for Pen and Measure each in their own slot, together in a section after Bracket and before Text ("if it's
  too long of a toolbar we can figure it out and rearrange after"). This branch adds the section with Measure in it;
  Pen joins it from its own branch.
- **D14. Free ends under Scale and a 3D turn** (20 November 2026; design, no code change). A free end is a point on
  the page: it has no depth and no bonds.
  - Scale: a measurement with no atom end reads in Å at the document's bond length (1.52 Å). Scale with its label
    picked moves its free ends apart (or together), and the document's bond length stays as it is, so its value changes
    with the scale: Scale 50% halves it. A measurement with an atom end keeps its value, as its scale comes from its
    structure's bonds, which scale with it (a mixed one's free ends scale with its atoms).
  - 3D turn (Structure Perspective, the tilt drag): the atoms turn in depth and the free ends stay where they are on the
    page, as they have no depth. A mixed measurement (atoms and free ends) is worked out on the page plane, so its value
    changes as its atoms turn. One with every end an atom keeps its value (it reads the atoms' depth). One with no atom
    end does not move.
  - Why: a free end marks a place on the page, not on a molecule. For a free length to keep its value under Scale it
    would need a scale of its own, and for a free end to turn with its atoms it would need a depth. Both are new data
    for a case no one has asked for. `src/measurement.ts`'s header still says a scale never changes a value; it holds for
    measurements with an atom end.
- **D11. A measurement asked for twice is made once.**
- **D12. Fixed decimals.** No setting yet.

## Siblings (consistency pillar)

Each is checked for a measurement:

| Behaviour | A measurement |
| --- | --- |
| Colour menu, Actions colour, MCP colour | text and lines |
| Text menu: font, size, bold, italic, underline, plain | the label |
| ⌘A, box, lasso, click, Space (whole structure), Tab | picked as text; Space and groups take it with its atoms; one with no atom end is picked as itself |
| Hold to Select | the Measure tool too (a press held still) |
| Undo and redo | every change one step; mid-way, Undo takes off the last end and Redo does nothing, as for the Pen's curve |
| Copy, cut, paste (window to window), Paste into ChemDraw and Office | with its atoms; alone, plain text |
| Duplicate, Add to templates | with its atoms |
| Delete, Eraser, MCP delete | removes it; an atom deleted removes it |
| Move label: drag, arrow keys, MCP move | offset kept |
| Align, Distribute | not a thing of its own, as a compound number |
| Turn, Rotate…, Flip, Rotate 180°, Scale, Structure Perspective (3D turn) | follows; stays upright; values hold (Mirror changes a dihedral's sign; Scale changes one with no atom end, and a 3D turn a mixed one: D14) |
| 3D Clean Up, Clean Up Structure, Flatten, Clean Up Reaction | follows the new geometry |
| Group, Ungroup, integral groups | with its structure |
| Bring to Front, Send to Back | as text |
| .oct, CDXML, CDX, Octet clipboard | kept (J5) |
| MOL, SDF, RXN, RDF, SMILES, InChI, HELM, FASTA, LaTeX, 3MF | not written (a picture object) |
| PDF, PNG, SVG, EMF, EPS, TIFF, JPEG, GIF, Print | drawn |
| Dark mode, zoom | as text and lines |
| Screen readers | "Length 2.54 Å", in its structure (one with no atom end: on its own) |
| MCP read, edit, delete, move, text, run_command | J6 |
| Native menu, right-click menu, Actions panel, command palette | J4 |
| Notes (issues 101 and 102): Annotate…, the Notes panel, MCP edit's note | the label takes a note, as text; it stays through every edit and file that keeps the measurement, and in the label's `t` in CDXML, never in its lines; no picture or other app gets it |

## MCP

- `text` `{ measure: ["s3.2", "s3.5"] }` → `t12` and its text, measured as drawn. `text` with
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
| S1 | Measure tool: one click on an atom, then Escape | the ring goes; nothing added, no undo step |
| S2 | Dihedral: a click off an atom | nothing placed |
| S3 | Backspace after two ends of an angle | the last end taken off; the next click places it again |
| S4 | A click on the end just placed, or on an atom placed already | nothing |
| S5 | Empty drawing; press on empty canvas, a bond or text | nothing, no error |
| S6 | Measure on a flat structure, then ⌘Z, then ⇧⌘Z | one step; atoms as they were (no clean-up); ⌘Z takes the measurement away; ⇧⌘Z gives it back |
| S7 | Flat 500-residue peptide (about 4000 atoms) | no clean-up, no notice, value from the flat drawing, under 100 ms |
| S8 | Length between atoms of two structures, both flat | the value is their distance as placed; nothing moves |
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
| S41 | Length between two free points; and from an atom to a free point | Å at 1.52 per document bond; at the structure's scale |
| S42 | Free ends: move, arrow keys, turn, flip, scale with the label picked | the free ends move with it |
| S43 | An atom deleted from a mixed measurement | the measurement goes in the same step |
| S44 | Free ends through .oct, the clipboard, CDXML, CDX, copy, paste, duplicate | kept, atom ends remapped |
| S45 | An old-form measurement (`atoms`) in .oct, the clipboard, CDXML and CDX | opens as a measurement; saved in the new form |
| S46 | Click flow in WebKit: two clicks, three clicks with the live arc, drag and let go, hold, Escape, Backspace, a tool change, zoom 10% and the highest | as J4; the live value equals the value made |
| S47 | ⌘Z, ⇧⌘Z and ⌘Y with two ends of an angle placed; ⌘Z with one end placed, then ⌘Z again; the same for the Pen's curve | ⌘Z takes off the last end, history unchanged; ⇧⌘Z and ⌘Y nothing; with no end left, the next ⌘Z undoes the step before (W15; pentool T13) |
| S48 | A bond selected, then right-clicked; Structure > Measure > Length with a bond selected | Measure length beside 3D clean up in the panel and in 3D tools in the menu; each makes the bond's length, 1.52 Å, in one step (W16) |

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

- ChemDraw's Add 3D Property items against Octet (19 November 2026; ChemDraw has no measuring tool, these are 3D
  search constraints):
  - Distance: in, as Length (atoms or free points).
  - Angle: in (atoms or free points).
  - Dihedral: in (atoms only).
  - Point: in part. A free end is a point on the page; ChemDraw's Point is placed by a distance or a percentage from
    one point towards another, by a dialog. Missing.
  - Line: missing.
  - Plane: missing.
  - Normal: missing.
  - Centroid: missing. A length between two groups needs it.
  - Exclusion Sphere: missing (Sam put it out).
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

- `addMeasure` is in `edit.ts`, not `measurement.ts` (`cleanedFor` went with the clean-up on
  19 November). It needs `addCaption` (edit.ts), and edit.ts needs `measurement.ts`; the two importing each other
  broke Vite's hot reload.
- Label place (D4): the automatic place is the nearest one clear of bonds, atoms and the measurement labels placed
  before it (the first hundred), out along the measurement's frame: both sides of a line in turn, inside an angle
  first and then outside it. The first build put a 1,4 distance's label on the ring's far bonds.
- A settle works out again only the measurements whose structures the edit changed, or whose label it changed. A drag
  frame of 40 paclitaxels with 120 measurements went from 30 ms to 0.4 ms.
- A file opens with each label where Octet saved it (`settleMeasures` with `kept`): only the values are worked out
  again, so a drawing opens as it was saved.
- (Up to 19 November) "Flat" was no depth and no depth shading, for the clean-up on measuring. Measuring no
  longer cleans up (D2), so this no longer applies.
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

## Redesign (19 November 2026)

Sam, using the tool on 19 November: "measure tool is so funky to use. you need to see it as a user, perhaps with a
little dotted line that spawns when you drag. also holding your click is not the meta. that's what people are used to
doing to go to select. you should be able to CLICK between 2 points anywhere on the screen. ... should be a measure -
length and a measure angle tool." On the dihedral: "it needs its own slot in the tool bar along with pen ... why tf is
it hidden like it is? all three of these under one tool." Sam's answers: a length to or between empty points reads in
Å at the drawing's scale; measuring never changes the drawing (measure as drawn).

What changed (J1, J4, D2, D9, D10, D13 and rules 1, 3 and 4 above hold the detail):

- Ends: atoms or free points (`measure: { ends, at? }`). The old `{ atoms, at? }` still opens everywhere.
- Click to place, with a dotted line and the live value following the pointer. A drag from A to B still makes a length.
- No 3D clean-up when measuring. Values as drawn: 3D from atoms with depth when every end is an atom, on the page
  plane otherwise.
- Toolbar: Measure has its own slot with Length, Angle and Dihedral, in a section of its own after Bracket.
- Distance is called Length everywhere the user reads it.
- Free ends move with the measurement when it moves as part of a selection: a translation is found in
  `settleMeasures` (the label and every atom end moved by the same step), and a turn, flip or scale moves them in
  `transformParts`. A paste, duplicate or template placed at an offset moves them in `insertMol`.
- The MCP keeps its arguments (atom ids). Its read gives atom ends as ids; free points are for the 1.2 MCP session.

Built (19 November 2026):

- With Measure in hand every press goes to the measurement, also on text, an arrow, a cycle or the selection: Sam asked to
  click between two points anywhere. A press on empty canvas with something picked clears the pick and places the end in
  the same press (Measure picks each measurement it makes, and changes nothing in the drawing).
- Undo while measuring takes the measurement in progress away and nothing else: none of it is in the history yet.
  (Changed on 20 November: Undo takes off the last end, as Backspace does. See J4.)
- The pointer's place while measuring is in a store, so a pointer move draws the dotted line and its value again and not
  the editor (as the Eraser's brush): on 2000 atoms a move costs about 1.3 ms, against about 3.8 ms for an Atom map drag.
- The toolbar's indicator is placed by counting the slots and the section's lines (13 px each, its 1 px, its margins and
  the gap after it); measurements-stress.check.ts checks it on every tool in one column and two.
- The command palette has no Measure tool entries: its Measure length, angle and dihedral are the commands on selected
  atoms, and two entries of one name would read as one. Sequence and Catalytic cycle are not there either.

## Fixes after the independent check (20 November 2026)

- A measurement from an atom to an empty point stayed behind at its free end when its structure and label moved
  together (a drag, the arrow keys, Space and a drag, an Option-drag copy, an AI app's move), so its value changed. The
  move counted it as text that follows its atoms. It now moves whole, its free ends by the same step (`followsAtoms`,
  `carriedMeasure`); Align and Distribute too. Space and Select Structure pick the structure's measurements, as the
  siblings table says ("Space and groups take it with its atoms"). Checks: followUi F1 to F4 and F9 in WebKit, and
  measuremcp.check.ts for the AI move.
- Grid snapping: the dotted line and the value followed the pointer, but the click placed the point on the grid. The
  line and the value now use the point on the grid (`measureAim`). Check: F6.
- One Backspace more than the ends placed deleted the atom under the pointer. With Measure in hand and nothing picked,
  Delete now does nothing. The Pen keeps ChemDraw's Delete over an atom: it is a drawing tool. Check: F7.
- The width handle of the measurement just made took a press with Measure in hand. Handles do not show or take a press
  with Measure (as with the Eraser). Check: F8.
- Every native menu command took the measurement in progress away, View > Magnify too. A View or Window command keeps it
  (`showsOnly`, keys.ts). Check: keys.check.ts (the app's menu cannot run in the dev server).
- The pointer timing (W13) compared Measure with an Atom map drag. It now times the editor's own path (hit test, hover,
  dotted line and value) against Select's on 4000 atoms, length and angle in progress, best of two rounds each, with a
  1.5 ms budget on the mean. The line that follows the pointer reuses the move's hit test (`measureHit`): measured in
  WebKit, Select 1.0 to 1.4 ms a move, a length in progress 1.3 to 2.3 ms, an angle 1.5 to 2.2 ms (1 ms timer steps).
- Left as designed: the label of a measurement with no atom end moves the whole measurement (rule 4). Sam to decide.

## Changes on 20 November 2026 (after Sam's review)

- Measure length on a bond. Two bonded atoms selected, or a bond right-clicked, give the bond's actions, which had no
  Measure length. It is now in the bond's Actions panel and right-click menu, in the same place as for 2 atoms (3D
  tools, beside 3D clean up), and makes the same length as Structure > Measure > Length with the bond's 2 atoms
  selected. Check: W16 (measurements-stress.check.ts).
- Undo in the middle of a curve or a measurement. ⌘Z while a Pen curve was in progress undid the step before and left
  the curve going (1.1.2 did this too), and ⌘Z while measuring took the whole measurement in progress away. Now Undo
  (⌘Z, Edit > Undo, the toolbar's Undo) takes off the last point placed, as Delete or Backspace does, and the history
  stays as it is. With no point left the curve or the measurement ends, and the next Undo undoes as usual. Redo (⇧⌘Z,
  ⌘Y, Edit > Redo) does nothing while one is in progress, and Repeat does not run. The menu's Undo and Redo leave a
  measurement in progress to the editor's undo. Checks: W15, pentool T13, keys.check.ts (the menu path).
- Scale and the 3D turn with free ends: D14.
