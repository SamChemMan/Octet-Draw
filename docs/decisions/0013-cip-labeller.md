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
- Rule 6 (Hanson et al.'s proposal for the most symmetric cages and spiranes) is not in the 2013 rules and is left
  out: those centres get no label.
- An R group or any other label Octet cannot read ranks above every element, as ChemDraw and Indigo rank it.
- E and Z on C=C, C=N, N=N (and Si, Ge), and on cumulenes with an odd number of double bonds, on the middle bond. No
  E or Z in a ring of under 8 atoms, on a crossed double bond, or next to a wavy bond.
- The configuration: Indigo's reading of wedges and hashes from the centre (with an implicit H or lone pair opposite
  three drawn bonds), then ChemDraw's other stereo bonds where none starts at the centre. One wedge up and one down on
  three bonds is read as ChemDraw reads it. A bold ring bond draws a ring in perspective, not a centre. A structure
  with depth and no wedge is read in 3D.
- Every digraph has a node and work limit. Past it a centre gets no label. A wedge on every CH of dodecahedrane
  labels nothing in about 45 ms.

The stereochemistry warnings still come from Indigo, but a centre Octet labels is not warned about as unset.

## Checks

- `src/cip.check.ts`: hand-drawn centres and double bonds (worked out by hand), names with descriptors read by OPSIN,
  the steroids Indigo gets wrong, renumbering and mirror images, hostile drawings, and time.
- `scripts/cip-suite.ts`: the validation suite (kept in `~/octet-research`, as it has no licence). 279 of 300 pass:
  all but the 20 rule 6 cases and one centre made pseudoasymmetric by an allene.
- `scripts/cip-corpus.ts`: ChemDraw's own labels in Sam's drawings. Octet agrees on 44 of 50 centres and 4 of 4
  double bonds. The 6 it does not are in one perspective drawing of two manganese complexes, where ChemDraw labels
  centres with no stereo bond.

## Open

- The namer's checks (`src/namer*.check.ts`) still take labels from Indigo's SMILES reading. They should take them
  from `cipLabels`.
- Rule 6, and allenes as auxiliary descriptors, if Sam wants them.
