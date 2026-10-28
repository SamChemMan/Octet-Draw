# 0013: Octet's own CIP labeller

Status: built 21 October 2026. Replaces Indigo's `calculateCip` for Show Stereochemistry's R, S, r, s, E and Z
labels and for the labels the namer cites. Decision 0001 still holds for everything else Indigo does.

## What was wrong

- Indigo's labels depend on the drawing. A 17-ethynyl steroid's C17 came out 17S or 17R depending on the atom
  order: levonorgestrel drawn from Octet's drug list got 17S, and norethisterone read from SMILES got 17S. Both are
  17R: C13 outranks the ethynyl group at the third sphere, where C14's set (C, C, H) ties with the ethynyl carbon's
  and C12's (C, H, H) beats the triple bond's duplicate atoms (phantoms only). Indigo's ranking does not explore the
  hierarchical digraph in rank order (P-92.1.4).
- One wedge Indigo could not read (one up and one down on a centre with three bonds, say) took every label off the
  structure.
- Indigo reads only wedges and hashes from their narrow end. ChemDraw also reads a wedge's wide end, plain hashed,
  dashed and bold bonds, and hollow wedges. In Sam's drawings Indigo agreed with ChemDraw on 29 of 50 centres.
- On the CIP validation suite (below) Indigo has a wrong, missing or extra label in 100 of the 300 structures; 45 of
  them need rule 4 or 5 (like and unlike pairs, pseudoasymmetric centres). It took up to 0.4 s on a corticosteroid.

## Decision

`src/cip.ts` labels by the 2013 IUPAC rules (P-92) on the hierarchical digraph, as Hanson, Musacchio, Mayfield,
Vainio, Yerin and Redkin set them out for machines (J. Chem. Inf. Model. 2018, 58, 1755):

- Duplicate atoms for multiple bonds and ring closures. A duplicate weighs nothing for rule 2. A mancude ring atom's
  duplicate takes the mean atomic number of the atoms it could be double bonded to.
- Rules 1a, 1b, 2, 3, 4a, 4b, 4c and 5, with auxiliary descriptors for rules 3 to 5. Rule 1b compares ring closures
  only, as Hanson et al. read it: applied to a multiple bond's duplicates it makes a label depend on the Kekulé form
  drawn.
- Rule 6 (Hanson et al.'s proposal for the most symmetric cages and spiranes, added 28 October 2026): an undifferentiated
  reference node ranks above any other undifferentiated node. Where four ligands still tie after rule 5 in two sets
  (a a' b b', a a' a'' b), the second ranked is the reference and the ligands are ranked again; where all four tie, the
  first and then the second ranked are taken as the reference in turn, and two rankings that differ by an odd
  permutation give no label. A decision by rule 6 counts as one by rule 5 (lower case where it is the only one). It is
  not in the 2013 rules, but it settles every rule 6 case in the validation suite and changes no other label there or
  in Sam's drawings.
- An allene's axis (M or P) counts as an auxiliary descriptor for rules 4 and 5 (M with R, P with S), worked out at the
  allene's middle atom in the digraph of the centre being labelled, as Centres does. Its handedness comes from the
  wedges at its end atoms, as axial.ts reads them. The labels shown for allenes still come from axial.ts.
- An R group or any other label Octet cannot read ranks above every element, as ChemDraw and Indigo rank it.
- E and Z on C=C, C=N, N=N (and Si, Ge), and on cumulenes with an odd number of double bonds, on the middle bond. No
  E or Z in a ring of under 8 atoms, on a crossed double bond, or next to a wavy bond.
- The configuration, first found first:
  - ChemDraw's own record, from a ChemDraw file. ChemDraw saves every centre it labels with `Geometry="Tetrahedral"`
    and a `BondOrdering` (the centre's bonds, 0 for its H or lone pair, in an order whose first three turn clockwise
    seen with the fourth away), and labels from it where its drawing does not set the centre. Octet keeps it on the
    atom (`kept`), writes it back, and uses it while the centre's neighbours and stereo bonds are as ChemDraw saved
    them. A mirror inverts it; a turn keeps it.
  - The atoms' places, where a centre is drawn in 3D: a neighbour at least a fifth of a bond nearer or further than the
    centre, and the ligands clearly not flat. This covers 3D molfiles and SD files (PubChem's 3D files), whose depth
    Octet keeps, and 3D Clean Up. A flat drawing turned in 3D is read from its wedges. An amine or amide N is not a
    centre by its places alone.
  - Indigo's reading of wedges and hashes from the centre (with an implicit H or lone pair opposite three drawn
    bonds), then ChemDraw's other stereo bonds where none starts at the centre. One wedge up and one down on three
    bonds is read as ChemDraw reads it. A bold ring bond draws a ring in perspective, not a centre.
- Every digraph has a node and work limit. Past it a centre gets no label. A wedge on every CH of dodecahedrane
  labels nothing in about 45 ms.

The stereochemistry warnings still come from Indigo, but a centre Octet labels is not warned about as unset.

## Checks

- `src/cip.check.ts`: hand-drawn centres and double bonds (worked out by hand), names with descriptors read by OPSIN,
  the steroids Indigo gets wrong, renumbering and mirror images, hostile drawings, and time.
- `scripts/cip-suite.ts`: the validation suite (kept in `~/octet-research`, as it has no licence). 300 of 300 pass
  (279 before rule 6 and allene auxiliary descriptors).
- `scripts/cip-corpus.ts`: ChemDraw's own labels in Sam's drawings. Octet agrees on 50 of 50 centres and 4 of 4
  double bonds, and labels nothing ChemDraw does not. Six of the 50 (in a perspective drawing of manganese complexes)
  come from ChemDraw's kept record: four have no stereo bond, and at two ChemDraw's record differs from Octet's
  reading of a hashed wedge. Two centres there ChemDraw leaves unsettled; Octet reads each from its hashed wedge (on
  the outer of three bonds that lie within 180°).

## Open

- Why ChemDraw leaves those two centres unsettled, and keeps its record over the hashed wedge at the other two. It
  may not read a hashed wedge on the outer of three bonds within 180°, but other centres drawn that way carry its
  record too, so the files cannot show it. A test in ChemDraw would settle it.
- What ChemDraw 26.1 gives the rule 6 cases (spiro[4.4]nonane-1,6-dione, the suite's VS280 cage) and the allene case:
  its help names no rule 6, so it may leave them unlabelled. Listed for a test in ChemDraw.
