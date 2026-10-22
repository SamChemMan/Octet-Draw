# 0014: Names of coordination compounds, checked in parts

Status: built 21 October 2026, for Sam's Os, Ru and Mn complexes and Rh2 paddlewheels. Porphyrins and main-group
central atoms added 23 October 2026.

## Problem

Structure to Name shows a name only if OPSIN reads it back as the drawn structure (`naming.ts`). OPSIN reads no κ,
so no name of a chelate complex could pass that check. Sam's polypyridyl complexes, Jacobsen's catalyst and the Rh2
paddlewheels had no name.

## Decision

`complexes.ts` gives additive names (IUPAC 2005 Red Book IR-9, IR-10) and checks each one in parts. A name shows only
if every part agrees with the drawing:

1. Each ligand, cut from the metal, is a molecule or ion. OPSIN must read its name back as that structure (same
   standard InChI, stereo included). A carbon ligand (methyl, an ylidene) is read on silane in the metal's place.
2. Each κ term is read by OPSIN as an isotope label on the part of the name it follows: 2,2'-bipyridine-κ2N1,N1' is
   read as (1,1'-15N2)-2,2'-bipyridine. The labelled structure must be the drawn ligand with exactly its donor atoms
   labelled. Primes alone (κ2O,O') may instead cite every atom of an element, or one of alike atoms.
3. The finished name is parsed term by term and each term read again: ligands and counts, donor atoms per metal,
   the metal and how many, μ, the metal-metal bond, the counter-ion, and the charge or oxidation number.

OPSIN's JavaScript build exports `parseToAtoms` (`tools/opsin/js`), which gives each atom's locants, so that the
namer can find the locants of the donor atoms. The build is OPSIN 2.8.0 as before; `parseToSmiles` gives the same
SMILES for every name in `names.txt`.

## Style

- Charge number for a complex ion (ruthenium(2+), ferrate(3-)). For a neutral complex, an oxidation number only
  where the drawing fixes it: a charge on the metal or a ligand atom, an anionic ligand or a hydride (rhodium(I)
  in Wilkinson's catalyst). With the metal and every ligand neutral, none (IR-9.2.2.4 makes it optional): Sam
  draws his Os(II) and Ru(II) complexes with no charges, and osmium(0) would be a claim he never made. None for an
  organometallic compound (IR-10.2.1.4) or a polynuclear one.
- A metal label with a Roman numeral in brackets (Os(II), Ru(III), Fe(0)) is that metal with that oxidation number.
  The atom is the metal with no charge, so the formula is what is drawn, and the name ends osmium(II). Where the
  drawing fixes a different number (Pt(IV) on cisplatin) there is no name. How ChemDraw 26.1 reads such a label is
  not known yet: it needs a test in ChemDraw.
- Multiplying prefixes (IR-9.2.2.2): di, tri and no enclosing marks for ligands with names of their own (chlorido,
  ammine, aqua, carbonyl, cyanido) and for simple anion names of one word (diacetato). Bis, tris and enclosing marks
  for names with locants, prefixes or κ (tetrakis(triphenylphosphane), tetrakis(μ-acetato-κO:κO')), for neutral
  organic ligands (bis(pyridine): dipyridine reads as a ring assembly), for carbon ligands (IR-10.2.2:
  trichlorido(methyl)titanium), and for names that begin as a multiplying prefix does (bis(octanoato)).
- κ after the part of a ligand's name that holds the donor atom, with OPSIN's locants there.
- Names show as plain text, as every name caption does: κ3N1 with the 3 on the line, μ-acetato, no italic N or O.
- Terpyridines as ring assemblies (2,2':6',2''-terpyridine), and two identical anionic units on a benzene ring by a
  multiplicative name (esp).

## Porphyrins and main-group central atoms

Added 23 October 2026, for Sam's two P(V) porphyrins.

- A main-group atom (B, Al, Ga, In, Si, Ge, Sn, Pb, P, As, Sb) is a central atom when a ligand chelates it and it
  is bonded by single bonds to donor atoms alone (IR-7.1 allows additive names for main-group compounds). With a bond
  to carbon it is not: silyl ethers, boronic esters and phosphonium salts keep their substitutive names. Structure to
  Name asks `complexes.ts` only when the namer has no name, so the namer's names always come first.
- Its oxidation number must be one its group allows: at most the group's, in steps of two (P(V), P(III), Sn(IV),
  Sn(II)). A drawing that gives another (a charge left off, or P(VI)) gets no name.
- Porphyrin ligands take the Red Book's form (Table VII: tpp, 5,10,15,20-tetraphenylporphyrin-21,23-diido), with
  their four N atoms cited by OPSIN's locants:
  `dimethanolato(5,10,15,20-tetraphenylporphyrin-21,23-diido-κ4N21,N22,N23,N24)phosphorus(1+)`.
- InChI gives E or Z to bonds in rings of 8 or more atoms, and in a free porphyrin anion also to the single meso
  C-C bonds, as it moves the charges along the ring. A porphyrin's name cites none. In the complex each of those bonds
  is in a six-membered chelate ring with the central atom, which fixes it. So the check of a ligand's name leaves out
  the E or Z of bonds that are in rings of 8 or more atoms of the ligand alone and in a chelate ring of at most 7
  (InChI's AuxInfo gives their numbers). Every other E and Z counts: a styryl group's (E) on a porphyrin, and the E
  or Z of an ordinary large ring (cyclooctene, a macrolide), which no central atom fixes.

## Not named yet

Configuration at the metal (cis, Δ, polyhedral symbols), η ligands drawn with bonds to each atom, three or more metal
atoms, two metals of different elements, and donor atoms that no κ term here can cite. Phthalocyanines,
subphthalocyanines and corroles: OPSIN 2.8.0 reads no name for these ligands (phthalocyanine, corrole, nor
tetrabenzo or tetraaza names on porphyrin), and the namer has none, so their names cannot be checked.
