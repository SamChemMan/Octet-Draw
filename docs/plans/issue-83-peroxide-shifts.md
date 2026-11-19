# #83: NMR prediction next to peroxides

Branch `item/83-peroxide-shifts`, from `release-1.2-mcp` b30f413. For 1.2 (Friday 20 November 2026).

Sam's note on #83 in 1.1.2: "Shifts next to peroxides have no specific improvement yet." This plan covers that part:
¹H and ¹³C shifts on and next to the carbons of an O–O bond, and the Quality each one gets.

## What is there now

- `src/nmr.ts` predicts by HOSE-style codes, sphere 6 down to 0 (`codes()`, lines 207–216), looked up in
  `data/nmr/shifts.bin.gz` (`lookup()`, lines 307–321). The table is built from nmrshiftdb2's measured spectra by
  `scripts/nmr-table.ts`; the build is reproducible (a rebuild from the 16 October 2026 download gives the shipped
  file byte for byte).
- 1.1.2 added codes on kinds (`kinds()`, line 198): an atom's label with its bonds that are not single. That is what
  fixed sulfonyl, heteroaromatic and bridged-bicyclic carbons. A peroxide O has only single bonds, so its kind is
  "O", the same as an ether or alcohol O. The codes on kinds cannot tell C–O–O from C–O–C.
- `quality()` (lines 576–580) rates a shift rough when two spheres or fewer matched, the spread is more than twice
  the nucleus's tight value, or it is a hydrogen on O, N or S. OOH hydrogens are already rough and broad, and leave
  the spectrum in D₂O and CD₃OD.
- There is no peroxide-specific code anywhere. The README (`data/nmr/README.md`, 11 November) measured ¹³C beside a
  peroxide O at 7.50 to 6.89 ppm on 6 held-out shifts.

### What is missing, measured

nmrshiftdb2 has 64 molecules with an O–O bond out of 43,536 with ¹H or ¹³C spectra. Most are natural products
(endoperoxides, allylic hydroperoxides). It has almost no simple peroxides: no tert-butyl hydroperoxide, no
di-tert-butyl peroxide, no primary hydroperoxide.

10-fold cross-validation over those 64 molecules (each tenth predicted from a table built without it, split by the
InChIKey's first block as the build script does), 1.1.2's code and table:

| Atoms | Shifts | MAE (ppm) | Median | Rated rough |
| --- | --- | --- | --- | --- |
| ¹³C on a carbon bonded to the O–O (α) | 56 | 3.90 | 1.88 | 42, MAE 4.99 |
| ¹³C one bond further (β) | 105 | 4.07 | 2.90 | 73, MAE 5.52 |
| ¹H on α carbons | 26 | 0.27 | 0.14 | 15 |
| ¹H on β carbons | 79 | 0.31 | 0.23 | 45 |
| OOH | 5 | 1.42 | 1.62 | 5 |

Simple peroxides from the literature are far worse, because the table has nothing like them and the lookup falls to
sphere 1, which is every OCH₂ (ethers, alcohols, esters). Spot checks (Kyasa, Puffer and Dussault 2013, CDCl₃):

| Compound | Atom | Measured | 1.1.2 |
| --- | --- | --- | --- |
| hexyl hydroperoxide | CH₂OO | 76.7 | 65.0 |
| benzyl hydroperoxide | CH₂OO | 79.2 | 67.2 |
| 4-phenylbutyl hydroperoxide | CH₂OO | 76.9 | 65.0 |
| 2-dodecyl hydroperoxide | CHOO | 81.7 | 74.1 |
| 1,1-bis(hexylperoxy)cyclododecane | C(OO)₂ | 113.1 | 108.9 |
| 1,1-bis(hexylperoxy)cyclododecane | OOCH₂ | 75.0 | 65.0 |
| 4-tert-butyl-1,1-dihydroperoxycyclohexane | C(OOH)₂ | 111.0 | 108.9 |

All of these are rated rough already, so Quality is honest. The values are 4 to 12 ppm out, which is what Stefan
reports: too far off to choose between two structures.

The gap is real. The table has few peroxides, and the fallback cannot see the O–O bond.

## What ChemDraw does

Sources: ChemDraw 26.1 help, ChemNMR pages (the 22.2 help says the same); Octet's ChemDraw 26.1 inventory (Structure
menu, Preferences > ChemNMR, NMR prediction output, NMR Spectrometer Frequency dialog); the 26.1 menu list; the
public CDXML specification. ChemDraw was not run for this item.

| ChemDraw | Octet now | This item |
| --- | --- | --- |
| Structure > Predict 1H-NMR Shifts, Predict 13C-NMR Shifts | Predict ¹H/¹³C/¹⁹F/³¹P-NMR shifts (Actions, command palette, MCP run_command) | Same commands, better values |
| Option + Predict 1H asks for the frequency (default 300 MHz) | Field list in the Spectrum panel | No change |
| Preferences > ChemNMR: solvent CDCl₃ or DMSO-d₆; frequency; use system and user experimental data | Seven solvents; no user data | No change (user data stays a gap) |
| Additivity: a base shift from a key substructure plus substituent increments; when an increment is missing, "embedded substituents" (a smaller unit with the same neighbours) | Measured shifts by environment, falling back to shorter environments and to codes on kinds | Adds a stand-in fallback with increments for the O–O, the same idea as ChemDraw's embedded substituents |
| Protocol: base substructure, increments, and rough flags | Details table: spheres matched, measured shifts, solvent, spread, Quality (Good, Medium, Rough) | Quality marks stand-in shifts Rough. No protocol text (show, not tell) |
| Solvent-dependent shifts are rough; no OH, NH or SH shifts | OH, NH, SH rated rough, broad, gone in D₂O and CD₃OD | OOH keeps this |
| Shifts drawn on the structure, a line spectrum, peak–atom hover | All three, with quality colours when Details is on | No change |
| Make/Clear Spectrum-Structure Assignment | Lighting both ways; no assignment of measured spectra | No change |
| CDXML: predicted output is ordinary text and spectrum objects; no prediction attributes | Placed spectra keep their numbers | No file change |

There is no palette tool, Object, Curves, Color or Text menu item, context menu item or CDXML attribute for NMR
prediction in ChemDraw, so none for peroxides either. ChemDraw's own values for peroxides are not compared: Octet
compares with measured literature shifts instead.

## Rules every part keeps

1. Molecules with no O–O predict as in 1.1.2: the same shifts, levels, spreads, counts and quality. The one
   exception is an atom whose match is one of the few codes on kinds where 1.1.2 pooled C–O–O atoms with C–O–C ones
   (planning build: 68 ¹³C, 24 ¹H and 2 ¹⁹F codes of 1.16 million, and 70 in the ¹³C solvent table). Those codes lose
   the peroxide shifts; the build lists them, and no held-out class may get worse. A molecule with no O–O bond never
   enters the new code beyond one pass over its bonds.
2. The table stays nmrshiftdb2 only, under its licence (README notice unchanged). Literature shifts are used only to
   check, never to build. The validation set stays independent.
3. Where the table has the atom's real surroundings, including the O–O, Octet uses that measured shift.
4. Every shift is the same however the structure is drawn: atom order, Kekulé form, labels (OOH, OOtBu, CO3H) or
   drawn out, explicit or implicit H, rotated or flipped.
5. Quality says how far to trust a shift, set from measured errors.
6. No new UI, text or setting. No new file data. No new dependency.
7. No slower than 1.1.2 beyond noise on any structure without an O–O; bounded time with many O–O bonds.
8. No eval, no unsafe parsing. The table reader is unchanged.

## Jobs

### J1. The O–O in atom kinds

An O single-bonded to a neutral O gets "-O" in its kind (`O-O`; `O-O-O` in a trioxide). Codes on kinds for spheres 1
and 2 then see the peroxide. Codes by labels do not change. The table is rebuilt.

Done when:
- `kinds()` marks O–O, and only for neutral O atoms joined by a single bond that is not aromatic and not η.
- The rebuilt table differs from 1.1.2's only in codes on kinds that hold a peroxide atom: the build script compares
  it with the previous table and prints what changed. Planning run: codes by labels all identical; ¹H 24 codes on
  kinds new, 24 changed, 30 gone; ¹³C 68 new, 68 changed, 49 gone; ¹⁹F 2 changed; ³¹P none; 7,113,740 to 7,114,038
  bytes.
- The whole held-out tenth is no worse in any line of the report. Planning run: ¹H identical; ¹³C MAE 2.20
  unchanged, rough 4.561 to 4.560, known solvent 2.237 to 2.235; ¹⁹F rough 17.754 to 17.750; ³¹P identical.
- Cross-validation over nmrshiftdb2's peroxides (J4) is better than 1.1.2 in every class. Planning run: α ¹³C 3.90
  to 3.38, β ¹³C 4.07 to 3.78, α ¹H 0.27 to 0.24, β ¹H 0.31 to 0.28.

### J2. A stand-in when the match does not reach the O–O

For an atom near an O–O (its nearer O one or two bonds away), the lookup's matched code "sees" the peroxide when it is
a code on kinds that reaches the nearer O, or a code by labels that reaches the farther O. When it does not, Octet
predicts the atom in a stand-in molecule: each nearby O–O's farther O becomes a carbon (an ether: R–O–O–R′ becomes
R–O–CH₂–R′, R–OOH becomes R–OCH₃, an endoperoxide becomes a cyclic ether of the same ring size, an ozonide a
1,3-dioxolane). The stand-in's shift plus an increment for each O–O is the prediction.

- Applies to ¹³C on α and β carbons and ¹H on α carbons. Not to ¹H on β carbons (the stand-in made them worse,
  0.28 to 0.34 ppm), not to ¹⁹F or ³¹P (no data).
- Not used for: a carbon bonded to both O atoms (dioxiranes); an O–O whose farther O is bonded to anything but C or H
  (Si, S, N, P, metals); an O that is charged, has a radical or unusual valence (it must have exactly two
  connections, H included).
- When two O–O choices are the same distance (C4 of a 1,2-dioxolane), Octet predicts both stand-ins and takes the
  mean, so the result does not depend on drawing order.
- The stand-in's environment is the real one relabelled (the farther O's label and hydrogens changed, codes on kinds
  remade), so there is no new symmetry pass. Built once per set of replaced O atoms, per prediction.

Increments: medians of (measured − stand-in) over nmrshiftdb2's peroxide atoms, by nucleus, α or β, and kind of
carbon: carbonyl (a perester or peroxy acid C=O), acetal (the carbon also bears an O or N that is not the O–O:
ozonides, peroxyketals) or plain, and for plain α ¹³C by hydrogens (C, CH, CH₂/CH₃). A class with fewer than 4 shifts
uses the class above it. This rule is fixed now, before the literature check is run. Planning values (all 64
molecules):

| Class | n | Increment (ppm) | Spread (MAD) |
| --- | --- | --- | --- |
| ¹³C α plain C | 24 | +6.2 | 2.9 |
| ¹³C α plain CH | 11 | +6.5 | 7.9 |
| ¹³C α plain CH₂ | 4 | +3.2 | 1.2 |
| ¹³C α acetal | 13 | +3.1 | 4.1 |
| ¹³C α carbonyl | 4 | −3.1 | 4.6 |
| ¹³C β sp² | 35 | −2.9 | 3.6 |
| ¹³C β sp³ | 70 | −1.8 | 2.2 |
| ¹H α plain | 18 | +0.48 | 0.52 |
| ¹H α acetal | 8 | −0.08 | 0.04 |

The constants live in `nmr.ts` with their counts and spreads, and `scripts/nmr-table.ts --test` prints them again from
the SD file, so anyone can check them.

Done when:
- Cross-validation (J4), stand-in rule with J1: α ¹³C ≤ 3.30, β ¹³C ≤ 3.70, α ¹H ≤ 0.25, β ¹H ≤ 0.28. Planning
  run: 3.17, 3.65, 0.23, 0.28.
- Literature set (J5): α ¹³C MAE ≤ 3.0 ppm (1.1.2: 8.5 ppm on the seven atoms above), every class no worse than
  1.1.2, ¹H α no worse than 1.1.2 + 0.05 ppm. Planning spot check on those atoms: errors of −12 to −2 ppm became
  −0.9 to +2.5 ppm (2-dodecyl hydroperoxide's CH kept its direct match, −0.25 ppm).

### J3. Quality

- A shift from a stand-in is Rough. Cross-validation: the stand-in shifts were 6.0 ppm (α ¹³C) and 5.9 ppm (β ¹³C) out
  on nmrshiftdb2's natural products, well past the 3 ppm line. The literature errors are smaller; if J5 shows the
  stand-in α ¹³C within 1.5 ppm on 80% of the set, Sam decides on Medium with the numbers.
- The Details row of a stand-in shift: Spheres matched is the atom's own match (what the table knew of the real
  surroundings); Measured shifts is the increment's count; Spread is the stand-in's spread and the increment's
  combined (√(sd² + s²), s = 1.4826 × MAD). These columns keep their meaning; no new column or text.
- Shifts that do not use a stand-in keep 1.1.2's rule. On the cross-validation, peroxide shifts rated good or medium
  were 0.35 to 0.85 ppm out (¹³C) and 0.06 to 0.15 ppm (¹H), so no cap is needed.
- OOH stays broad and rough, and leaves the spectrum in D₂O and CD₃OD.

Done when the check asserts each of these on named atoms.

### J4. The build script reports peroxides

`scripts/nmr-table.ts --test` gains a peroxide section: 10-fold cross-validation over every molecule with an O–O
(each fold predicted from codes counted without it), by class, for 1.1.2's rule and the new one, and the increment
table. The non-test build also checks rule 1 against the previous table when one is given, and prints the code counts.
`data/nmr/README.md` gets a dated paragraph with the numbers, in the style of the others.

Done when the script runs on the 16 October SD file in under two minutes and its numbers are in the README.

### J5. The literature check

`src/nmrperoxide.check.ts`, assert-based like `nmrhetero.check.ts`. At least 10 peroxides across at least 6 classes,
each with its source (authors, journal, year, DOI) in the file, solvent CDCl₃ unless the source says otherwise.

Planned set (each value taken from the cited paper; a compound is swapped only for another from a cited paper):

| Class | Compounds | Source |
| --- | --- | --- |
| Primary, benzylic and secondary hydroperoxides | hexyl, benzyl, 4-phenylbutyl, 2-dodecyl hydroperoxide | Kyasa, Puffer, Dussault, J. Org. Chem. 2013, 78, 3452 (doi:10.1021/jo4001564) |
| gem-Bisperoxides | 1,1-bis(hexylperoxy)cyclododecane; 4-tert-butyl-1,1-dihydroperoxycyclohexane | same |
| Dialkyl peroxides (THP monoperoxyacetals) | two, primary and tertiary alkyl | Kyasa et al., J. Org. Chem. 2015, 80, 12100 (doi:10.1021/acs.joc.5b02043) |
| 1,2-Dioxolanes | two 3-alkoxy-1,2-dioxolanes | Schiaffo, Rottman, Wittlin, Dussault, ACS Med. Chem. Lett. 2011, 2, 316 (doi:10.1021/ml100308d) |
| 1,2-Dioxanes | one | Xu, Schwartz, Raible, Dussault, Tetrahedron 2009, 65, 9680 (doi:10.1016/j.tet.2009.09.068) |
| Endoperoxides | ergosterol peroxide; artemisinin | Wu et al. 2012, ergosterol peroxide from Ganoderma lucidum (PMC3431381; DOI in the check); artemisinin from a paper with a 2D-NMR assignment (to cite) |
| Ozonides, 1,2,4-trioxanes, 1,2,4,5-tetraoxanes | one dispiro ozonide, one tetraoxane | Wang et al., Bioorg. Med. Chem. Lett. 2011, 21, 5320 (doi:10.1016/j.bmcl.2011.07.024) |
| Peroxy esters and acids | one perester, one peroxy acid | a paper with both (to cite) |

Rules for the values:
- Only atoms the paper assigns, or that are unambiguous (α carbons, their hydrogens, OOH, a lone CH₃). The rest of a
  molecule's ¹³C list is compared after sorting both lists, reported apart from the per-atom numbers.
- Artemisinin and mCPBA are in nmrshiftdb2. The check reports them, and the J4 cross-validation gives their held-out
  error; they are not counted as independent.
- Before: the same atoms predicted by release 1.1.2's `nmr.ts` and table (v1.1.2, 6395bd5), written into the check
  as constants with that provenance. After: computed. The check prints both and the MAE by class.

Done when the check passes, prints before and after, and meets J2's thresholds.

### J6. Unusual and hostile structures

Every case in the stress list below is checked with its expected result, where the Acceptance table says: most in
the check, the interactive ones in the dev app.

### J7. Speed, load and memory

- Interleaved runs (base and new alternating, 15 each, median), base = v1.1.2's `nmr.ts` and table, run alone when the
  machine is quiet, again if a ratio is over the line: `predict` ¹H and ¹³C on paclitaxel, on a 500-residue peptide
  (one structure), and on the largest structure of a 40-paclitaxel drawing: new/base ≤ 1.05. Table load (gunzip and
  `readTables`) ≤ 1.05. Heap after load: within 0.1 MB.
- In the check: a 500-atom structure with 50 O–O bonds predicts ¹H and ¹³C in under 100 ms each (as B3.15 in
  `nmrhetero.check.ts`), and a peroxide-free structure of the same size predicts in under the same budget.
- The numbers go into the commit message and the README paragraph.

### J8. Release notes

No edit to `src/releases.ts` or `docs/release-notes`. What's New lines go back with the result. Draft:

- When you predict ¹³C shifts of a peroxide, the carbons on and next to the O–O get shifts much nearer to measured
  spectra (hydroperoxides, dialkyl peroxides, endoperoxides, 1,2-dioxolanes and 1,2-dioxanes, ozonides, peresters).
- When Octet has no measured shift for an atom near an O–O, it estimates the shift from the same structure with an
  ether in place of the peroxide. The Quality column under Details marks these shifts Rough.

## Changes after the literature check (17 November 2026, build)

The rule fixed above passed cross-validation but failed J5 on the literature set (`src/nmrperoxide.check.ts`):
¹H α 0.11 to 0.22 ppm (limit 0.16), and three ¹³C classes got worse: peresters and peroxy acids 2.98 to 8.40,
ozonides and tetraoxanes 2.32 to 4.32, endoperoxides 3.08 to 3.39. Causes, found before any patch:

- A shallow code on kinds (1 or 2 spheres) that sees the O–O can come from a few unlike nmrshiftdb2 molecules:
  perdecanoic acid's C=O matched only CF₃CO₃H and (CF₃CO₂)₂ (150.4 ppm for 174.8); a tert-butyl peroxide's CH₃
  matched tetramethyl-1,2-dioxetanes (21.5 for 26.4). This breaks rule 3: one or two spheres are not the atom's real
  surroundings. The cross-validation could not show it, because nmrshiftdb2's peroxides come in families of analogues.
- A carbon with two O–O (gem-bisperoxides, tetraoxanes) took two plain increments. nmrshiftdb2 has no such carbon, so
  the rule was untested; cyclic ones came out 3 to 11 ppm high.
- The ¹H α acetal increment (−0.2 ppm, 8 shifts) comes from one family of N,O-acetal trioxanes.
- Marked codes for ¹H on α carbons: on the literature set they doubled the error (secondary CH–OO took 4.70 from
  bicyclic endoperoxides, for 4.08 to 4.28); on nmrshiftdb2 they gained 0.27 to 0.22. Pooled, no gain.

What changed (J2, J3):

1. ¹³C: the atom's own match stands when it sees the O–O and matched as many spheres as the stand-ins' shallowest. A
   match that does not see the O–O, or matched two spheres fewer than the stand-ins, gives way to the stand-ins'. In
   between, the two are weighed by the own match's count, n / (n + 1). Chosen on the cross-validation, where it beat
   the planned rule in every class (α 3.17 to 3.01, β 3.65 to 3.44).
2. A second O–O on one carbon takes the acetal increment (the carbon already bears an O). Set with the literature
   set in view, so the gem-bisperoxide and tetraoxane rows there are not independent; the check says so.
3. ¹H: no stand-in. Hydrogens on a carbon bonded to an O–O are looked up with 1.1.2's codes on kinds (unmarked). β
   hydrogens keep the marked codes (0.31 to 0.28 on nmrshiftdb2, 0.28 to 0.23 on the literature).
4. Increments are ¹³C only; the table in nmr.ts drops the ¹H rows.

Measured with the final rule:

| | 1.1.2 | O–O in kinds | Now | Plan's line |
| --- | --- | --- | --- | --- |
| nmrshiftdb2 held out, α ¹³C (56) | 3.90 | 3.38 | 3.01 | ≤ 3.30 |
| β ¹³C (105) | 4.07 | 3.78 | 3.44 | ≤ 3.70 |
| α ¹H (26) | 0.27 | 0.24 | 0.27 | ≤ 0.25: not met, kept at 1.1.2 by item 3 |
| β ¹H (79) | 0.31 | 0.28 | 0.28 | ≤ 0.28 |
| Literature, α ¹³C (33, independent) | 4.80 | | 1.78 | ≤ 3.0 |
| β ¹³C (21) | 3.45 | | 2.16 | |
| α ¹H (14) | 0.11 | | 0.11 | ≤ 0.16 |
| β ¹H (18) | 0.28 | | 0.23 | |

Every literature class is better or equal except endoperoxide ¹³C (ergosterol peroxide, 8 shifts, 3.08 to 3.39:
C5/C8 and C6/C7 match nmrshiftdb2's 1,4-endoperoxides of cyclohexadienes at one or two spheres) and ¹H of
hydroperoxides and dialkyl peroxides (+0.01 ppm each, β CH₃). The check names these with their numbers.

Stress case 6 (trioxide R–O–O–O–R): the middle O's kind is O-O-O, and the far O is bonded to an O, so J2's own
exclusion applies: no stand-in, direct lookup. The row said "stand-in replaces both outer links"; J2's rule wins.

## Changes when finishing (19 November 2026)

Review and stress findings, fixed at their cause:

1. Atom order (rule 4). For an O–O whose nearer O is 3 bonds from the carbon, the farther O is 4 bonds away, and the
   code took that distance (-1, "beyond 3") as nearer. The stand-in then made the nearer O a carbon whenever it had
   the lower atom number: OOC(C)CCOOC(=O)c1ccccc1 gave 80.9 and 69.6 ppm, the same molecule drawn the other way 82.6
   and 72.6. An O beyond 3 bonds is now the farther. J2 also replaces such an O–O (nearer O 3 bonds away, no
   increment), so the stand-in's deeper spheres are an ether too; the plan did not say so.
2. A stand-in that matched one sphere or none no longer replaces a match that does not see the O–O. Such a stand-in
   is any carbon with the same neighbours, and the increments are for a stand-in that matched its real surroundings:
   tetraoxane 2t's spiro carbon took 109.0 + 9.4 = 118.4 ppm for 110.6 (1.1.2: 108.9). Now 107.1.
3. Next to an O–O that cannot be replaced (Si, S, N, P, B or a metal on the far O, a trioxide, a dioxirane), every
   atom with the O–O 2 bonds away or less is looked up with 1.1.2's codes on kinds (unmarked), ¹H and ¹³C, as the cut
   list below promised. The marked codes gave a tert-butyl group on a silyl, sulfonyl, aminyl, phosphoryl, boryl or
   titanium peroxide the dioxetanes' CH₃ (21.5 ppm for about 26.4).
4. The labels CO3R (CO3tBu, CO3Me, CO3Et, CO3Ph) read as the perester C(=O)OOR. They read as an O with three bonds
   (labels.ts, as in 1.1.2). CO3H was already right.
5. Name to Structure reads cumene hydroperoxide and tetralin hydroperoxide (common.ts). OPSIN read them as the
   hydrocarbon and an HOO⁻ ion.

Measured with these:

| | 1.1.2 | Before | Now |
| --- | --- | --- | --- |
| nmrshiftdb2 held out, α ¹³C (56) | 3.90 | 3.01 | 3.19 |
| β ¹³C (105) | 4.07 | 3.44 | 3.27 |
| α ¹H (26), β ¹H (79) | 0.27, 0.31 | 0.27, 0.28 | 0.27, 0.28 |
| Literature, α ¹³C (33) | 4.80 | 1.78 | 1.49 |
| β ¹³C (21) | 3.45 | 2.16 | 2.16 |
| ozonide or tetraoxane ¹³C (8) | 2.32 | 2.13 | 0.97 |

Item 2 moved 11 nmrshiftdb2 shifts (6 α, 5 β) from a stand-in to their own match. Each of them matched one sphere
either way and was 1.6 to 48 ppm out. Their summed error, held out, rose 10.1 ppm on α and fell 17.9 ppm on β. Both
lines stay inside J2's (α ≤ 3.30, β ≤ 3.70). The increments do not change.

Not changed:

- The α carbonyl increment (−3.1 ppm, 4 shifts) moves perdecanoic acid's C=O from 171.8 to 170.7 (measured 174.8).
  Setting it from the literature would make the check depend on what it checks (rule 2). The class improves (2.98 to
  2.78).
- An AI app cannot read a prediction through the MCP for any structure (as in 1.1.2); `run_command` opens the panel.
  That is a gap of the NMR panel as a whole, for the MCP's own work. Release 1.1.3 ships with the AI apps' server off.
- About 8% of nmrshiftdb2 structures with no O–O predict differently by count or spread, 68 shifts by 0.5 to 3.0 ppm,
  none with other spheres or Quality: rule 1's exception, the codes on kinds that held C–O–O and C–O–C atoms together.
  The held-out tenth is no worse; stress case 16 pins it.

## Design decisions

1. **The O–O goes into the kinds, as the sulfonyl did in 1.1.2.** That costs nothing for other molecules and needs
   no format change. But the kinds cannot add data that is not there: with the peroxide kind, hexyl hydroperoxide's
   CH₂ still falls to sphere 1 (65.1 ppm), because nmrshiftdb2 has no primary CH₂–OO. So J2 is needed.
2. **The stand-in is an ether.** Against the ether, the α increments are small and alike (primary hydroperoxide
   +3.8 ppm against hexyl methyl ether; against hexanol it would be +13.8). It also keeps rings: an endoperoxide's
   stand-in is the same ring with one O, so the skeleton matches deep in the table.
3. **The stand-in only when the real match cannot see the O–O.** Where nmrshiftdb2 has the peroxide, it wins: for
   2-dodecyl hydroperoxide, the code on kinds gives 81.45 ppm (measured 81.7) and the stand-in 78.0.
4. **Increments come from nmrshiftdb2.** The literature set then tests them honestly. The class rule is fixed before
   the literature values are collected.
5. **The stand-in relabels the real molecule.** It reuses the real molecule's edges, aromaticity and η marks. The O→C
   change cannot make a ring aromatic (the new carbon has two or more hydrogens), and an aromatic or η O–O is not a
   peroxide here. So a stand-in costs one label array copy.
6. **Rough for stand-ins**, by the measured errors (J3). The Quality column and the shift label colours already show
   it; no new words.
7. **No ¹H β, ¹⁹F or ³¹P stand-in.** The measurements say it does not help or there is no data.

## Siblings (consistency)

The change is in `predict()`, so every place that shows a prediction gets it. Each is checked:

| Where | What to check |
| --- | --- |
| Spectrum panel, ¹H trace and ¹³C sticks | New shifts; multiplets unchanged (couplings do not cross O) |
| ¹⁹F | Kinds only: CF₃CO₃H and a fluorinated perester predict, no stand-in |
| ³¹P | Unchanged (no kinds): a phosphate–peroxide predicts as in 1.1.2 |
| Shift labels on the structure, quality colours (Details on), light and dark mode | Stand-in shifts show the rough colour in both themes |
| Details table and Copy table | Spheres matched, Measured shifts, Spread, Quality as J3 |
| Copy ACS text; place on the page; print; SVG, PDF, PNG, CDXML and CDX of a placed spectrum | Numbers as predicted; a placed spectrum keeps its numbers after a later prediction changes |
| Peak and atom lighting | Atoms of each signal unchanged |
| Solvents (seven), field, decoupling | OOH gone in D₂O and CD₃OD; the ¹³C solvent table applies to the stand-in |
| Compare with a measured spectrum | Uses the same prediction |
| MCP: run_command predict_1h, predict_13c (and 19F, 31P) | Same `predict()`; no MCP code change |
| How the structure arrives: drawn, labels (OOH, OOtBu, CO3H, OOBz), Name to Structure (TBHP, DTBP, DCP, mCPBA), SMILES paste, MOL, SDF, CDXML, CDX, .oct, Image to Structure | Same graph, same prediction |
| A second window | Its own table load, same values |

Colour, ⌘A, hold-to-Select, duplicate, flip, rotate and align act on drawn objects. This item adds no object: they
apply only in that a rotated, flipped or duplicated peroxide must predict the same (stress list).

## MCP

No new tool and no change to `src/mcp.ts`. An AI app reaches the change through `run_command` `predict_1h` and
`predict_13c`, which open the panel on the same `predict()`. The check covers `predict()` directly. The session
reviewing MCP code is not touched. The MCP has no read of a prediction's shifts and Quality, for any structure, as in
1.1.2: a gap of the NMR panel as a whole (changes when finishing).

## Files and formats

| File | Change |
| --- | --- |
| `data/nmr/shifts.bin.gz` | Rebuilt. Format version 3, unchanged; about 300 bytes larger |
| `src/nmr.ts` | Peroxide kind, stand-in, increments, quality |
| `scripts/nmr-table.ts` | Peroxide report, rule-1 check |
| `data/nmr/README.md` | Dated paragraph |
| `src/nmrperoxide.check.ts` | New |
| `.oct`, CDXML, CDX, MOL, SDF, SMILES, clipboard, PDF/SVG/PNG exports | No change. A placed spectrum stores its numbers, so a drawing made in 1.2 opens in 1.1.2 as it was, and 1.1.2 predicts the same structure with 1.1.2's values. ChemDraw sees no difference: there is no new data in the files |

Octet 1.1.2 never reads 1.2's table (each app has its own). If it did, the format is the same and the new codes are
never looked up.

## Stress list

| # | Case | Expected |
| --- | --- | --- |
| 1 | Empty selection, or no structure | "No structure" as now; `predict` not called |
| 2 | H₂O₂ alone | ¹³C: nothing. ¹H: one broad OOH signal, 2H, rough; no stand-in; no error |
| 3 | O₂ (O=O), ozone (O=O⁺–O⁻), superoxide, peroxide dianion (Na₂O₂), HOO⁻ | Not peroxides (J2); predict as 1.1.2 does; no error |
| 4 | Dimethyldioxirane (C bonded to both O) | No stand-in; direct lookup; rough |
| 5 | gem-Bisperoxide and 1,2,4,5-tetraoxane (two O–O on one carbon) | Both farther O replaced; two increments added |
| 6 | Trioxide R–O–O–O–R | Kind O-O-O; no stand-in (far O bonded to O, J2); finite shift; no error |
| 7 | Silyl, sulfonyl, aminyl peroxides; tert-butylperoxy titanium | No stand-in for those O–O; direct lookup |
| 8 | η²-peroxo metal complex | O–O is an η bond (~), not a peroxide; as 1.1.2 |
| 9 | Peroxyl radical ROO• | Unusual valence: no stand-in; as 1.1.2 |
| 10 | O–O in a ring Octet reads as aromatic | Not single: no stand-in |
| 11 | 1,2-dioxolane C4 (both O at the same distance); 1,2-dioxane C4/C5 (β to one O, γ to the other: one stand-in) | Mean of both stand-ins for the dioxolane; same result for every atom order |
| 12 | The same peroxide drawn in 6 atom orders, both Kekulé forms of an aryl, H drawn or implicit, rotated 90°, flipped, duplicated | Identical predictions |
| 13 | OOH, OOtBu, CO3H, OOBz typed as labels; TBHP, DTBP, DCP, mCPBA by name; the same from SMILES, MOL, SDF, CDXML, CDX, .oct | Identical predictions to the drawn-out structure |
| 14 | 500-atom chain with 50 O–O bonds | Under 100 ms per nucleus; all shifts finite |
| 15 | 40 paclitaxels on one page; a 500-residue peptide | Within 5% of 1.1.2 (J7) |
| 16 | Non-peroxide snapshot: ethyl acetate, toluene, ethanol, phenol, THF, diethyl ether, 1,3-dioxolane, ferrocene, ethanesulfonamide, paclitaxel | Shifts, levels, counts, spreads and quality equal to 1.1.2's, written in the check; an atom that matches one of rule 1's changed codes is named in the check with both values |
| 17 | Delete one O of the O–O while the panel is open | Prediction is the alcohol or ether's, no stand-in; undo brings the peroxide's back, same values |
| 18 | Undo and redo ten times across adding and removing an O–O | Each state predicts as the first time (prediction depends only on the structure) |
| 19 | Copy a peroxide to a second window; paste twice in one drawing | Same values everywhere |
| 20 | D₂O and CD₃OD | OOH gone from ¹H; α and β shifts as in any solvent; ¹³C solvent table used for the stand-in where it has the code |
| 21 | Deuterated OOD, ¹³C-labelled carbon | Isotopes do not change codes; same as unlabelled |
| 22 | Typing O, O, O fast on a chain (an O–O appears and grows) | Each state predicts once; no stale stand-in (cache is per prediction) |
| 23 | Two AI sessions call predict_13c on two windows at once | Each window's own result; the table loads once per window (one promise) |
| 24 | MCP run_command with a bad name (predict_17o) or nothing selected | The existing refusals, unchanged |
| 25 | Dark mode, zoom 10% and 3200% with Details on | Rough colour readable in both themes; labels as 1.1.2 places them |
| 26 | Peroxide whose far O is in a charged fragment of a salt | Charged O is no peroxide; the rest predicts |

## Acceptance

| Job or case | Check |
| --- | --- |
| J1 | Build output (rule 1 and code counts), `node src/nmr.check.ts` unchanged, CV numbers in README |
| J2 | `node src/nmrperoxide.check.ts` (stand-in values, ties, exclusions), J4 numbers |
| J3 | `nmrperoxide.check.ts`: quality of named atoms; Details row values; look at the Details table and shift colours in WebKit with `npm run look` on port 1466, light and dark |
| J4 | `node scripts/nmr-table.ts <SD> --test` output in the README |
| J5 | `nmrperoxide.check.ts` literature section, before and after printed |
| J6 | Stress cases 2–14, 16, 20, 21, 26 in `nmrperoxide.check.ts`; 1, 17–19, 22, 25 in the dev app on port 1466 (Spectrum panel, undo, two windows, dark mode, zoom); 23–24 against the MCP code paths in `mcp.check.ts` as they stand (no change expected) |
| J7 | Timing script in the scratchpad (interleaved, against v1.1.2), numbers in the commit; budget asserts in `nmrperoxide.check.ts` |
| All | `npm test` passes; no `look:` errors in the dev console |

## Cut from this item

- ¹⁷O shifts: Octet does not predict ¹⁷O.
- A stand-in for ¹⁹F and ³¹P near an O–O: no data to set increments.
- A better OOH shift: OOH stays as the table gives it, rated rough (ChemDraw gives no OH shift at all).
- Peroxides on Si, S, N, P, B or metals, trioxides, dioxiranes, charged and radical peroxides: no stand-in; looked up
  with 1.1.2's codes on kinds.
- Stereo effects (cis and trans 1,2-dioxanes, axial and equatorial): the codes have no stereo.
- Literature shifts in the table: the table stays one documented source, and the check stays independent.
- ChemDraw's estimation protocol text and user experimental data: these are gaps of the NMR feature as a
  whole.
