# 0016: Octet's own template sets (CD-32)

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
| Clipware part 1 and part 2 (glassware) | Lab, in part |
| DNA Templates, RNA Templates | Nucleobases only |
| Polyhedra | Cubane only |
| Amino Acid Side Chains, Polypeptides, Supramolecules, Nanotubes, Shapes | none (Octet's Shape tool draws shapes) |
| Advanced BioDraw, Anatomy, Animals, Bio Instruments, BioArt, Bugs, Microorganisms, Organelles | none |

Octet's own sets ChemDraw has no set for: Sugars, Nucleobases, Heterocycles, Ligands and Paddlewheels.

What each ChemDraw set holds, and how it draws a Newman projection or a Cp ring, needs ChemDraw running
(`~/octet-research/notes/chemdraw-checks-pending.md` item 22).

## Decision

The library has 292 templates in 16 sets: Amino acids 20, Sugars 8, Hexoses 16, Nucleobases 5, Stereocentres 18,
Conformers 12, Cycloalkanes 17, Aromatics 25, Bicyclics 24, Heterocycles 29, Functional groups 44, Ligands 33, Cp and
arene rings 6, Metallocenes 11, Paddlewheels 8, Lab 16. Polycyclics is split into Aromatics and Bicyclics.
`tools/library/build.mjs` builds them all.

- Structures with a name are drawn from it (OPSIN, then Indigo's layout), as before.
- Conformers, hexoses, Fischer projections, paddlewheels and cubane are drawn in perspective: each atom keeps its depth
  (decision 0012), worked out from simple geometry (`tools/library/perspective.mjs`). Octet reads their
  stereochemistry from the atoms' places (decision 0013), so a chair or Haworth projection has R and S, names right
  and is the right isomer. Where a group goes up or down, the build tries each way and keeps the one whose InChI is
  the named compound's. A chair has the Ring tool's textbook shape with real depths; a Haworth ring is a real ring seen
  from above, drawn 1.3 times as wide. Groups whose labels would collide are drawn a little longer or shorter.
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

## Not done

- Bridged rings (norbornane, adamantane, bicyclo[2.2.2]octane, DABCO) stay flat, as Indigo lays them out. Drawn in 3D
  they look as chemists draw them, but Octet's CIP labeller and Indigo's InChI then read their bridgeheads as
  stereocentres (r and s on norbornane), and Structure to Name gives them no name. The flat drawings and the crowded
  biaryl phosphines (BINAP, Xantphos, XPhos, SPhos) are marked for Clean Up as drawn.
- Not named by Structure to Name: functional groups (R), the M templates, Cp2TiCl2, Cp2ZrCl2, (benzene)Cr(CO)3,
  CpMn(CO)3, bis(benzene)chromium, Mo2(OAc)4, IMes and IPr (carbenes), cis- and trans-decalin, cubane.
- ChemDraw writes a Newman projection's depth to CDXML as `xyz`; ChemDraw draws it without the circle.

## Checks

`src/templates.check.ts`: every built-in template parses back from Octet's file text, has a name of its own, has the
CIP labels and InChI of its reference compound (74 with stereo), gets a name from Structure to Name that reads back
to its structure (213 named), and survives Clean Up (60 kept as drawn, 216 kept whole). `src/lab.check.ts` covers the
Lab group, and `src/perspective.check.ts` the Newman circle.
