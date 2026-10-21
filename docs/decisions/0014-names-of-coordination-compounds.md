# 0014: Names of coordination compounds, checked in parts

Status: built 21 October 2026, for Sam's Os, Ru and Mn complexes and Rh2 paddlewheels.

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

## Not named yet

Configuration at the metal (cis, Δ, polyhedral symbols), η ligands drawn with bonds to each atom, three or more metal
atoms, two metals of different elements, porphyrins (InChI gives their ring double bonds E or Z from the drawing),
and donor atoms that no κ term here can cite.
