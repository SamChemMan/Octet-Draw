# 0017: Octet's own template sets (CD-32)

Status: built 27 October 2026 for Sam to review. Roadmap 1.1.0 item 1.

## ChemDraw 26.1

ChemDraw 26.1 ships 29 template sets (30 files with the blank New Templates sheet; the bundle's list is in
`~/octet-research/notes/chemdraw26-inventory.md` 3.9). Octet draws its own; nothing comes from ChemDraw's art or data.

| ChemDraw set | Octet |
| --- | --- |
| Amino Acids | Amino acids |
| Aromatics | Aromatics |
| Bicyclics | Bicyclics |
| Conformers | Conformers |
| Cp Rings | Cp and arene rings |
| Ph Rings | Cp and arene rings (η6 arenes), Aromatics |
| Cycloalkanes | Cycloalkanes |
| Functional Groups | Functional groups |
| Hexoses | Hexoses |
| Metallocenes | Metallocenes |
| Stereocenters | Stereocentres |
| Clipware part 1 and part 2 (glassware) | Lab |
| DNA Templates, RNA Templates | Nucleobases; DNA and RNA |
| Polyhedra | Polyhedra (coordination geometries, polyhedra as frames and cages); cubane in Bicyclics |
| Amino Acid Side Chains, Polypeptides | Side chains; Peptides |
| Supramolecules | Supramolecules (crown ethers, cryptands, cyclen, cyclam, calixarenes, pillar[5]arene, [2.2]paracyclophane) |
| Nanotubes | Carbon (C60, C70, two nanotube segments, a graphene flake) |
| Shapes | Octet's Shape tool, and Symbols in part |
| Bio Instruments | Lab equipment |
| Advanced BioDraw | Biomolecules |
| Organelles, Microorganisms | Cells |
| Anatomy | Anatomy |
| Animals | Organisms |
| Bugs | Bugs |
| BioArt | BioArt |

Octet's own sets ChemDraw has no set for: Sugars, Nucleobases, Heterocycles, Ligands and Paddlewheels.

For 1.2 (7 and 8 November 2026) the sets with no Octet set, or Octet's in part, were drawn: Lab grew from 16 to 45
items, and DNA and RNA, Side chains, Peptides, Supramolecules, Polyhedra, Carbon, Lab equipment, Biomolecules, Cells,
BioArt, Anatomy, Organisms, Bugs and Symbols are new. Octet now has 525 templates in 30 sets (issue 97 added 14
polyhedra and C70). See "1.2 sets" below.

What each ChemDraw set holds, and how it draws a Newman projection or a Cp ring, needs ChemDraw running
(`~/octet-research/notes/chemdraw-checks-pending.md` item 22).

## Decision

The library has 292 templates in 16 sets: Amino acids 20, Sugars 8, Hexoses 16, Nucleobases 5, Stereocentres 18,
Conformers 12, Cycloalkanes 17, Aromatics 25, Bicyclics 24, Heterocycles 29, Functional groups 44, Ligands 33, Cp and
arene rings 6, Metallocenes 11, Paddlewheels 8, Lab 16. Polycyclics is split into Aromatics and Bicyclics.
`tools/library/build.mjs` builds them all.

- Structures with a name are drawn from it (OPSIN, then Indigo's layout), as before. Where Indigo's layout runs a bond
  through a label (a porphyrin's NH), Octet's Clean Up lays it out again: porphyrin, H2TPP, phthalocyanine and XPhos.
- Conformers, hexoses, Fischer projections, paddlewheels and cubane are drawn in perspective: each atom keeps its depth
  (decision 0012), worked out from simple geometry (`tools/library/perspective.mjs`). Octet reads their
  stereochemistry from the atoms' places (decision 0013), so a chair or Haworth projection has R and S, names right
  and is the right isomer. Where a group goes up or down, the build tries each way and keeps the one whose InChI is
  the named compound's. A chair has the Ring tool's textbook shape with real depths; a Haworth ring is a real ring seen
  from 35° above, drawn 1.3 times as wide, its substituents straight up and down. A sugar's rings are drawn larger
  than one bond length (Haworth 1.45, chair 1.3), as textbooks draw them, so the labels fit inside and round them.
- No label overlaps another, and no bond runs through a label but its own atom's, as the app draws the template at
  the default style with Arial's metrics (`tools/library/clashes.mjs`). The build places substituents by that test:
  each takes the length (0.65 to 2.1 times its own) and, on an upright bond, the reading (OH or HO) that clears its
  label, one at a time and then two at a time, and never one that changes the compound. A paddlewheel takes the
  smallest size and nearest view in which every label is clear. Decamethylferrocene's rings sit 0.45 bond lengths
  further from the iron, so their methyls clear each other.
- A Fischer projection is drawn plain, as chemists draw it: its across groups lie a bond length nearer the viewer, so
  the stereochemistry is in the drawing. No wedges are needed.
- A bond seen end on (its atoms within a tenth of its length on the page) is a Newman projection: the bond is not
  drawn, and the atom behind (when it has no label) is a circle 0.4 bond lengths across that its other bonds start
  from. This also draws any structure turned in 3D to look down a bond. ChemDraw draws such a bond as nothing and the
  two atoms on top of each other.
- Cp and arene rings and metallocenes are drawn with Octet's π ligands (the j and Shift+J keys), on a metal or on M.
  Carbonyls are M=C=O, as common.ts draws them.
- Functional groups have R as their first atom: a click on an atom puts the group there.
- The Lab group adds a Schlenk flask, vial, syringe, chromatography column, heating mantle, hotplate stirrer and
  stirrer bar in its own line style, and a TLC plate that is Octet's own TLC object.
- Ligands are named as common.ts keys them (bpy, tpy, PyBOX), so the library's search shows the library's own
  drawing for an abbreviation. A template kept in the Ring strip under its old name (bipy, terpy, pybox) still works.
- A template placed on the page keeps its depth (mirrored, its depth changes sign, so it turns over in 3D).
- Clean Up leaves a structure with depth as drawn, as it never marks one messy. It also leaves a π ligand's ring as
  drawn: before, the ring (not bonded to its multi-centre point) was redrawn as a flat regular polygon.

## 1.2 sets

- DNA and RNA (22): the eight nucleosides, their 5'-monophosphates, ADP, ATP and cAMP, laid out by Indigo from their
  names (cAMP from SMILES, as OPSIN reads no name of it), and the A·T, G·C and A·U Watson-Crick pairs. A pair is drawn
  from the Nucleobases set: each base turned about its middle, the pyrimidine mirrored to face the purine, placed so
  each pair of hydrogen-bonded atoms is 2.05 bond lengths apart (2.9 Å over a 1.4 Å bond), with no two atoms nearer
  than 1.5 and the two sugar bonds alike either side of the pair, then turned so the hydrogen bonds run across the
  page. Each donor's H is drawn, with a hydrogen bond (dashed) to its acceptor, and R where each sugar joins.
- Side chains (20): each amino acid's side chain with R where it joins the α carbon, as Functional groups are.
  Glycine's is R-H. Proline's ring is drawn whole, with R on the α carbon and on the N.
- Peptides (4): backbones of 2 to 5 residues, H2N to CO2H left to right, the α carbons L, with R1 to Rn in order.
- Supramolecules (15): crown ethers, cryptands, cyclen and cyclam from their names; calix[4]arene,
  p-tert-butylcalix[4]arene and pillar[5]arene drawn flat as papers draw them (each ring pointing out round a square or
  a pentagon, as Indigo's layout puts rings over their own OH groups), and [2.2]paracyclophane in perspective, its
  rings face to face, built from geometry and relaxed to bond length 1 (`tools/library/hosts.mjs`).
- Polyhedra (30): coordination geometries from linear to pentagonal bipyramidal, M with ligands L, as chemists draw
  them: plain bonds in the page, wedges towards the viewer and hashes away, each M-L bond 1.7 bond lengths so the bond
  between two labels shows; 14 coordination polyhedra as frames (issue 97), from the trigonal bipyramid to the
  icosahedron, a corner where each ligand goes, 1.7 bond lengths from the middle on average, in perspective with the
  hidden edges dashed and no corner seen on an edge it is not on (a corner of five or six edges has its warnings off,
  as no carbon has that valence); and the cages tetrahedrane, prismane, pentaprismane and dodecahedrane in
  perspective, an edge with no face turned towards the viewer dashed (`tools/library/polyhedra.mjs`). Octet reads a
  dashed bond as one behind the page, as ChemDraw's, so the corners get r and s labels; `templates.check.ts` lets
  them off.
- Carbon (5): C60, C70 (issue 97: C60's halves across a five-fold axis, eclipsed, with a belt of ten carbons between
  them, relaxed so every pentagon is regular and every hexagon flat), (5,5) armchair and (9,0) zigzag nanotube
  segments, each atom at its place in 3D (kept as depth), and circumcoronene, a graphene flake. Double bonds: C60's 30
  bonds between two hexagons; the others a perfect matching of their atoms (C70's found by search, with the fewest in
  a pentagon: five).
- Lab (29 more), Lab equipment (22), Biomolecules (13), Cells (18), BioArt (8), Anatomy (7), Organisms (7), Bugs
  (8) and Symbols (18): drawings in the Lab group's line style, written as SVG path data in
  `tools/library/glassware.mjs`, `equipment.mjs`, `bio.mjs`, `life.mjs` and `symbols.mjs` and turned into Octet's pen
  curves and lines by `tools/library/art.mjs`. Symbols has what ChemDraw's Shapes set has and the Shape tool does not
  draw: a star, polygons, a burst, a tick mark and a cross, a lightning bolt, the sex symbols, a target, warning and
  high voltage signs, the radiation trefoil and four GHS hazard diamonds. Fills use only the Lab group's two blue tints, on small parts, so a drawing
  reads on a dark page too. Each is one integral group that takes the document's line width and comes back whole
  from CDXML and .oct (`src/lab.check.ts`).
- `node tools/library/build.mjs --keep-shipped` builds the new sets and keeps the sets released in 1.1 as
  `src/library.json` has them. Built again from scratch, the hexose chairs, the chair conformers and the Cp and arene
  sets come out a little different from 1.1 (later changes to the chair and to Clean Up); they are not rebuilt.
- Two files, so Octet starts no slower: `src/library.json` holds the sets and Lab items 1.1 had (byte for byte), and
  `src/library-more.json` the rest, about three times as large. `library.ts` loads it once the window is idle after
  starting (or 1.5 s after, where WebKit has no requestIdleCallback), or at once when the library opens; Vite puts it
  in a chunk of its own.

## Structures and clip art (1.1.2)

ChemDraw 26.1 lists every set in one alphabetical Templates menu: Clipware, BioArt, Anatomy and Bugs sit between
Aromatics and Bicyclics. Its BioDraw tools are a toolbar of their own. Octet's library had the same problem: 30 sets in
one list, the drawings after Paddlewheels.

- The library has a switch under its search field: Structures or Clip art. Each shows its own sets. Clip art is Lab and
  the drawn sets (a set whose templates have no atoms, `library.ts` ART_SETS); every other set is Structures. The
  user's own sets show with both. Photochemistry has no atoms either, but it is notation for schemes, so it shows with
  the structures (`library.ts` NOTATION_SETS).
- It opens on the kind of the template in hand: a flask chosen last time opens Clip art, on its set. With a ring in
  hand, the Ring tool's library opens Structures.
- Search looks in both kinds. Its results show in two groups, Structures and Clip art, each under its name, the kind the
  switch was on first (so "tube" on Clip art shows the test tubes before the structures found by name). While a search
  shows, neither half of the switch is on, as no set is. A click on either half clears the search.
- View > Templates and File > Save Templates for ChemDraw list the user's sets, then Octet's structures, then its clip
  art, with a separator between each group. The menu is built again when the later sets load, so each item opens the set
  it names (before, the items after the first group could open the wrong set once `library-more.json` had loaded).
- The command palette finds every template by "structure" or "clip art" (a command's other words now match words in a
  row, as "clip art").
- The library is 30 px wider (the side is 180 px), so the switch's two halves are equal and "Cp and arene rings" fits on
  one line. Where the window is too narrow for it beside the Ring menu, it moves left to stay 8 px inside the window,
  over that menu's edge.

## Photochemistry (issue 43)

ChemDraw has no photochemistry set; its users draw a wavy line, add a head and type the text. Octet's Photochemistry
set (17, `tools/library/photochem.mjs`) is made of Octet's own lines and arrows, text with subscripts and
superscripts, and brackets, so every part stays editable: a Jablonski diagram (S0, S1 and T1 with two vibrational
levels each, absorption, fluorescence, intersystem crossing and phosphorescence, in one group that is not integral, so
a double-click picks a part); light (a wavy arrow with hν), a photochemical step (hν) and a thermal step (Δ) as
conditions on their arrows; absorption, fluorescence, phosphorescence, intersystem crossing and internal conversion;
[X]* (brackets with an asterisk mark); ¹O₂ and ³O₂; S₀, S₁ and T₁; Sens and Sens*.

- As IUPAC draws a Jablonski diagram, radiative transitions are straight arrows and radiationless ones wavy. h and ν
  are italic, as quantities are.
- The Lab group's style: lines take the document's line width and text the document's caption style, with no colour
  of their own. Each lone arrow is 2.165 bond lengths, so its text fits and a wave ends on the axis at the head.
- State labels have Interpret Chemically off, so S1 and T1 are not read as sulfur and tritium.
- The library's thumbnails draw text as the page sets it (conditions beside their arrow, text under its structure, runs
  with their subscripts and superscripts) and a bracket's mark.
- Not done: energy transfer between two species, and an energy-level diagram object whose transitions stay on their
  levels when a level moves (ChemDraw has none).

## Not done

- Bridged rings (norbornane, adamantane, bicyclo[2.2.2]octane, DABCO) stay flat, as Indigo lays them out. Drawn in 3D
  they look as chemists draw them, but Octet's CIP labeller and Indigo's InChI then read their bridgeheads as
  stereocentres (r and s on norbornane), and Structure to Name gives them no name. The flat drawings and the crowded
  biaryl phosphines (BINAP, Xantphos, XPhos, SPhos) are marked for Clean Up as drawn.
- Not named by Structure to Name: functional groups (R), the M templates, Cp2TiCl2, Cp2ZrCl2, (benzene)Cr(CO)3,
  CpMn(CO)3, bis(benzene)chromium, Mo2(OAc)4, IMes and IPr (carbenes), cis- and trans-decalin, cubane.
- ChemDraw writes a Newman projection's depth to CDXML as `xyz`; ChemDraw draws it without the circle.
- Left out because they did not look right: cyclodextrins and cucurbiturils (no clear drawing of a ring of six to
  eight sugars, or of glycolurils, came out of a flat layout or a simple 3D build), the nucleosome, and from the drawn
  sets the heart, the stomach and the brain.
- ChemDraw's Animals set has many farm and zoo animals; Organisms has the lab model organisms only (mouse, rat, rabbit,
  zebrafish, frog, nematode, plant). Its Shapes set's weather clouds, recycling and biohazard symbols, skull and
  crossbones, caduceus and rod of Asclepius are not in Symbols.
- ChemDraw's Polyhedra set has 25 frames. Octet has 17 of them (the frames, tetrahedrane, prismane and pentaprismane);
  not drawn: the bicapped octahedron, the trigonal prism capped on its two triangles, the 11-corner closo
  octadecahedron, the hexagonal, heptagonal and octagonal prisms, and the pentagonal and hexagonal prisms capped on
  both ends. Its Nanotubes set has (5,5) to (10,10) armchair and (9,0) to (18,0) zigzag segments; Carbon has (5,5)
  and (9,0).

## Checks

`src/templates.check.ts`: every built-in template (both files) parses back from Octet's file text, has a name of its
own, has clear labels (every template with atoms, none let off), has the CIP labels and InChI of its reference compound
(the dashed cages let off), gets a name from Structure to Name that reads back to its structure, and survives Clean
Up. `src/lab.check.ts` covers the 145 drawings of the Lab group and the eight drawn sets,
`src/photochem.check.ts` the Photochemistry set, and `src/perspective.check.ts` the Newman circle.
