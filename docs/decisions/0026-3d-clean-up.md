# 0026: 3D Clean Up settles an energy

Status: in release 1.1.2. Built 12 November 2026. Reviewed twice the same day by independent agents, and compared
with ChemDraw 22.2's 3D Clean Up on 17 structures.

## What changed

Until 1.1.1, 3D Clean Up moved atoms to fit distances, one constraint at a time. It left a ring of benzene rings
flat, squashed bridged rings, and gave 312 of 818 wedged centres on six-membered rings the opposite configuration.

`src/clean3d.ts` now settles an energy (Octet's own, no force field library):

- Each bond, each angle (as a distance between the two outer atoms), each double bond's cis or trans, flat double
  bonds, aromatic rings and sp2 atoms, and a least distance between atoms three or more bonds apart.
- The hydrogens the drawing leaves out are particles. They are what twists biphenyl. They are not added to the
  drawing.
- A stereocentre's hand comes from its own wedges and hashes, read on the page.
- The minimiser is FIRE (Bitzek et al., Phys. Rev. Lett. 97, 170201). It stops at 4,000 steps, or after 20 million
  terms worked out.
- The stiffness of each term is in about the proportions of DREIDING (Mayo, Olafson and Goddard, J. Phys. Chem. 94,
  8897). The proportion that matters most: an sp2 atom bends out of its plane more easily than in it. Without that a
  hoop of benzene rings stays flat.

## Rules that the reviews set

- A pull to flat across a single bond between two sp2 atoms has three strengths. Firm: an amide's C–N. Weak: between
  two aromatic rings, and any bond to an O or N (aryl ethers and nitro groups must turn when they are crowded).
  Middle: a bond between two carbon atoms, an ester's C–O, and an amide N's other bond.
- No contact is harder for heavy atoms than for hydrogens. A harder one turned a stereocentre over in oxycodone and
  sofosbuvir, and made N-acetylglucosamine a twist-boat.
- A flat drawing with saturated six-membered rings that ends strained is tried again from the rings' other chairs and
  from no chairs. The lower energy stays, unless it turns a stereocentre over. Only for structures of up to 200
  atoms with their hydrogens.
- A flat drawing that was turned in 3D is cleaned up as the flat drawing it is, then turned back.
- A structure comes out the size it went in, however many times it is cleaned up.

## Stereo after a clean-up

Indigo reads a centre from its wedges and the bonds' directions in the page. After a clean-up the same wedges can
draw the other hand, because the atoms moved. `keepHands` (`src/cip.ts`) compares each wedged centre before and after,
by Indigo's own rule, and swaps wedge and hash where the reading changed. 3D Clean Up, Flatten and a Structure
Perspective turn call it for the atoms they move. No wedge is set from depth: a document from 1.1.1 can hold a 3D
shape with a wrong centre, and its wedges are still what the chemist drew.

Tried and taken out the same day: giving Indigo a flat picture with wedges set from depth. It lost a centre from
InChI in some views, and it trusted the depth of old documents.

## Measured

- 190 stereoisomer drawings, 818 wedged centres: 0 with the wrong hand (1.1.1: 312).
- 222 wedged structures: SMILES and InChI the same after a clean-up, and after a second one (without `keepHands`: 42
  differ).
- [8]cycloparaphenylene: a hoop 10.82 Å across with 1.48 Å between rings. The crystal structure has 11.0 Å and
  1.48 to 1.49 Å. ChemDraw 22.2 gives 10.74 Å and 1.48 Å.
- Sparteine: angles 105° to 122° (ChemDraw 22.2: 102° to 118°; Octet 1.1.1: 62° to 166°).
- 500 atoms: 330 to 380 ms for a chain, a peptide and a polyphenylene (1.1.1: 450 to 520 ms). A 496-atom chain of
  cages: 1.2 s (1.1.1: 0.5 s).
- ChemDraw 22.2 allows 500 atoms in the selection, with the implicit hydrogens. Octet allows 500 drawn atoms in each
  structure.

## Not right yet

- Styrene and stilbene turn about 20°, and acetanilide's ring 34°. ChemDraw 22.2 gives 18°, 1° and 36°.
- A second clean-up moves a structure with free O–H groups by up to 0.3 of a bond. ChemDraw 22.2's moves most
  structures by 0.1 to 0.7 of a bond.
- Structures of 40 to 200 atoms take longer than in 1.1.1: taxol 120 ms against 20 ms.
- Some cis-fused and crowded rings come out as twist-boats (all-cis hexamethylcyclohexane, 9-methyl-cis-decalin).
- An allene's two ends come out in one plane. They are at 90° in reality.
- A view that shows a wedged bond end-on gives no SMILES, as before.
