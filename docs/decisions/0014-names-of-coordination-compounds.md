# 0014: Names of coordination compounds, checked in parts

Status: built 21 October 2026, for Sam's Os, Ru and Mn complexes and Rh2 paddlewheels. Porphyrins and main-group
central atoms added 23 October 2026, then phthalocyanines, corroles and free-base porphyrins the same day.

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
- Convert Structure to Name sets a name's caption as IUPAC prints it (nametype.ts, 27 October 2026): κ³N¹ with the
  count and the locant raised and the N italic, μ₃, η⁶, italic cis, fac, (SP-4-2), (Re—Co) and triangulo. The text stays
  the same characters (κ3N1), so a copied name reads back.
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

## Phthalocyanines, corroles and free-base porphyrins

Added 23 October 2026, so that phthalocyanines (H2Pc, Zn, Cu, Si, Al and Ge), corroles (H3corrole, Ga, Mn, Fe, Co and
Cu) and free-base porphyrins (H2TPP, H2OEP) get names.

- IUPAC names these rings in the tetrapyrrole recommendations (1986): phthalocyanine in TP-1.6 (Fig. 4), corrole in
  TP-5.3 (Fig. 11). The Red Book's Table VII has pc, phthalocyanine-29,31-diido. The 2013 Blue Book names neither
  (porphyrin and corrin are in P-101), and gives phthalocyanine no fusion name. Subphthalocyanine and
  naphthalocyanine are in none of them.
- OPSIN 2.8.0 reads neither name. Octet adds both to its OPSIN data as retained parents, next to porphyrin
  (`tools/opsin/pack/arylGroups.patch`), each with its figure's numbering and interior N locants: 29 to 32 for
  phthalocyanine (N29 in the ring with C1 to C4, N30 with C22 to C25: the interior atoms run against the periphery),
  21 to 24 for corrole. Phthalocyanine's fusion atoms, unnumbered in Fig. 4, take letters (FR-5.3: 4a, 28a). The
  namer has the same parents (`fusion.ts`), with the hydrogen their names imply: 29H,31H-phthalocyanine,
  21H,22H,23H-corrole.
- As the parents are Octet's own data, reading a name back checks it only against that data. So
  `src/macrocycles.check.ts` checks each parent against PubChem's InChI (phthalocyanine CID 5282330, corrole CID
  6857582), against its figure's rings written as cycles of locants, and against derivatives drawn by hand from the
  figure's Kekulé structure with a substituent at every position that has one.
- Ligands: `phthalocyanine-29,31-diido-κ4N29,N30,N31,N32` as the Red Book has it, and by the same rule
  `corrole-21,22,23-triido-κ4N21,N22,N23,N24`: dihydroxido(phthalocyanine-29,31-diido-κ4N29,N30,N31,N32)silicon(IV),
  [5,10,15-tris(pentafluorophenyl)corrole-21,22,23-triido-κ4N21,N22,N23,N24]gallium(III).
- Free bases. A drawn porphyrin has E or Z on its meso bonds in InChI (a ring of 8 or more can hold a trans double
  bond), and the namer turned these down as ring E/Z. A porphyrin's name implies them: every pyrrole N points into
  the ring. So Structure to Name (`naming.ts`) leaves out the E and Z of a macrocycle's own bonds (in a ring of 8 or
  more and in no smaller one, with an atom in a ring of at most 7) from the namer's graph and from both InChIs, but
  only when the drawing shows each pyrrole-type N pointing into the ring: at each such bond, on the side of the
  macrocycle's next atom. A pyrrole drawn turned out keeps its E and Z, and an N-confused porphyrin (C21 inside, N2
  outside) is not pyrrole-type: neither gets a name. (E)- and (Z)-cyclooctene and macrolides have no atom in a smaller
  ring, so their E and Z always count.

## Configuration, unlike metals, clusters and η ligands

Added 27 October 2026.

- Configuration at the metal (IR-9.3.3) where the drawing fixes it. A d8 metal (Ni, Pd, Pt, Rh, Ir, Au) with four donor
  atoms drawn flat as a cross is square planar (SP-4). Six donor atoms drawn with a wedge or hash on at least two bonds
  are octahedral (OC-6). [Ma2b2] and [Ma2b4] take cis or trans, [Ma3b3] fac or mer, and other complexes of monodentate
  ligands the polyhedral symbol and configuration index: cis-diamminedichloridoplatinum(II),
  (SP-4-3)-carbonylchloridobis(triphenylphosphane)iridium, (OC-6-43)-bis(acetonitrile)dicarbonylnitrosyl(...)chromium(1+).
  The donors' priorities come from their atomic numbers, then the atoms they are bonded to; where that cannot tell two
  unlike ligands apart, or a chelate needs the priming convention, there is no index. A chelate that fixes cis by itself
  ([PtCl2(en)]) gets none. A flat drawing of six donors is not read as an octahedron.
- Added 28 October 2026: the other common polyhedra and Δ and Λ. Four donor atoms drawn in 3D with no two opposite are
  tetrahedral (T-4): with four unlike donors the name gives R or S (IR-9.3.4.2), read from the drawing as a
  stereocentre's configuration is (cip.ts handOf): (T-4-R)-bromidochlorido(pyridine)(triphenylphosphane)zinc(II). Five
  drawn in 3D are a trigonal bipyramid (TBPY-5: one opposite pair, the other three at right angles to it) or a square
  pyramid (SPY-5: two opposite pairs at right angles, and an apex at right angles to all four), with their configuration
  indexes (IR-9.3.3.5, IR-9.3.3.6): (TBPY-5-11)-tricarbonylbis(triphenylphosphane)iron,
  (SPY-5-12)-dibromidotris[di-tert-butyl(phenyl)phosphane]palladium(II). An octahedral tris(bidentate) complex whose
  chelates each bond through two alike donor atoms takes Δ or Λ by the skew-lines convention (IR-9.3.4.11, IR-9.3.4.12):
  two chelates' donor-donor lines define a helix, right-handed for Δ, and all three pairs must agree.
  Δ-tris(2,2'-bipyridine-κ2N1,N1')ruthenium(2+). Such a complex has no other stereoisomers, so Δ or Λ is the whole
  descriptor. The Red Book places C, A and R, S after the configuration index in the polyhedral symbol ((OC-6-24-A),
  T-4-S) but shows no name with Δ or Λ; Octet sets Δ or Λ before the name as cis and fac are set, and its checks are
  drawn as the Red Book's delta and lambda figures are (the octahedron seen down its threefold axis).
- Unlike metals and clusters of three to six metals (IR-9.2.5.5 to IR-9.2.5.7). The central atoms are cited and numbered
  by Table VI, the element met later first (rheniumcobalt, cobaltgold), then by IR-9.2.5.6's rules b to d; the numbering
  of a central structural unit runs round its rings first (octahedro: 1 and 6 opposite). Of the numberings the rules
  leave, the name with the lowest locants. Every ligand cites its metals (nonacarbonyl-1κ5C,2κ4C), bridging ones by
  metal sets (di-μ-carbonyl-1:2κ4C, tetra-μ3-carbonyl-1:2:3κ3C;...), and the metal-metal bonds are counted ((3 Os—Os))
  or, without a central structural unit, given by locants ((Os1—Os3)). Named: Fe3(CO)12, Ru3(CO)12, Os3(CO)12,
  Rh6(CO)16, [(OC)5ReCo(CO)4]. The check reads every term back against the drawing under a numbering the rules allow.
- η ligands drawn with a bond to each bonded atom (IR-10.2.5.1), with the hydrogens the drawing gives them: η and the
  count go before the part of the ligand's name that holds the bonded atoms, (η6-benzene)tricarbonylchromium,
  tricarbonyl(methyl-η6-benzene)chromium, potassium trichlorido(η2-ethene)platinate(1-). That part, read by OPSIN alone,
  must have the bonded atoms' elements joined as drawn. No oxidation number with an η ligand (organometallic).

## Not named yet

The chirality symbols C and A (IR-9.3.4.4 to IR-9.3.4.8: for an octahedron, a bipyramid or a pyramid with unlike donors
in a chiral arrangement the name gives the index alone, which tells diastereoisomers apart but not mirror images); Δ and
Λ for bis(bidentate) complexes (IR-9.3.4.13; Octet gives cis there), and for chelates with unlike donor atoms, which
also have fac and mer isomers that need the priming convention; polyhedra other than SP-4, T-4, TBPY-5, SPY-5 and OC-6;
configuration indexes that need the priming convention or CIP ranks past the donor's neighbours ((SP-4-1)-(acetonitrile)dichlorido(pyridine)platinum(II));
η ligands bonded through only some atoms of a part of their name ((1,2,3,4-η)-cycloocta-1,3,5,7-tetraene) or through two
runs (η2:η2-cycloocta-1,5-diene); carbon ligands and bridging ligands without names of their own in complexes of unlike
metals or three or more; anions of unlike metals ((dimolybdenumdiiron)ate); and donor atoms that no κ term here can
cite. Subphthalocyanines and naphthalocyanines: no IUPAC recommendation gives them a parent name, and OPSIN reads none,
so they stay unnamed. Octet does not invent a parent name for them. N-confused porphyrins, whose metal bonds to a C atom
as well as N atoms.
