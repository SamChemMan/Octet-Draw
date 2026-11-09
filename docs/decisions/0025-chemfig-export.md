# 0025: chemfig export

Status: built November 2026 on the `feature/chemfig-export` branch.

Edit › Copy As › chemfig (LaTeX) and File › Export… as `.tex` write LaTeX code for the
[chemfig](https://ctan.org/pkg/chemfig) package that draws the structures as the page does. The writer is
`src/chemfig.ts`. Its checks are `src/chemfig.check.ts`. Where the code leaves something out, or draws it
differently, the notice after Copy As or Export says so (`chemfigNotice`). The notice blames Octet's export, not
chemfig.

## Decisions

### Geometry: absolute angles, bond by bond

Every bond takes its absolute angle and length from the page (`-[:30,1.5]`), so any layout comes out as drawn. The
structure is written as a tree from its leftmost atom. A ring that is not in ring syntax closes with a hook
(`?[1]`). Separate structures hang off the first one by bonds chemfig does not draw (`draw=none`).

### Ring syntax only where chemfig draws what the page has

chemfig's ring syntax (`*6(-=-=-=)`, `**6` with an aromatic circle) is the only way to get a circle, and it reads
well. chemfig draws a ring as a regular polygon with sides one bond long, and nests a fused ring on its parent's next
side. So `syntaxRings` takes a ring system only when:

- every ring has 3 to 8 atoms and is regular, with sides of one bond;
- the rings share one side each (no spiro or bridged joins), no atom is in three rings, and the joins form a tree
  (naphthalene, phenanthrene; not pyrene);
- the atoms in two rings have no bond out of the system;
- every bond out of the system points straight out from its ring's middle (within 3°).

Any other system is written bond by bond. A nested ring ends on an invisible copy (`\phantom`) of its parent's next
atom's label, so chemfig stops the side at the label's edge and the label prints once.

### Which letter of a label a bond meets

chemfig picks which atom of a label such as HC a bond leaves or meets from the bond's angle, unless it is told. At
exactly ±90° it meets a label at its first atom. Inside ring syntax, chemfig works out the angles itself, so an
upright side can come out a hair either side of 90°. `letters()` therefore names the atom for every upright bond, and
both atoms for every upright ring side. Without this, an HC met at its H pushed a fused ring out of shape.

### Marks, numbers and stereo labels with `\charge`

Lone pairs, radicals, circled and partial charges, atom and map numbers, and R/S labels are chemfig's `\charge` on
the atom, at the page's angles (`markAngles`, shared with `render.ts`). `\charge` overlays do not count in the
picture's box, so empty atoms at the box's corners keep them inside a cropped figure. An E or Z label hangs off its
double bond by an invisible bond (`stereoSpot`, shared with the page).

### Arrows with `\chemmove`

Reactions in a row are chemfig schemes (`\schemestart … \arrow … \schemestop`). Other arrows and lines use
chemfig's `\chemmove`, the package's own command for mechanism arrows. Each end, and a curve's middle, is a named
node hung by an invisible bond from the atom nearest it, so it stays with its structure. A curved arrow is two
`to[bend …, looseness …]` halves through its middle, which lie on Octet's circular arc (`arcHalf`). Heads are
chemfig's `CF` tip, with its `harpoon` option for half heads. The export writes chemfig commands only, with TikZ as
options inside them, and no other TikZ.

### Readable by default

The code is an atom a line, indented by branch. Settings › Import and export › Compact chemfig code, and the Export
dialog's switch, write it on one line. Both draw the same.

## Not done

Turned labels, highlights, query properties, equilibrium, retrosynthetic, no-go, dipole and block arrows outside a
scheme, orbitals, fragmentation lines, pen curves, and catalytic cycles. The notice names each of them.
