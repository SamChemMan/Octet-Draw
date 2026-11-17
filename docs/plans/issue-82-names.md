# Structure to Name: r and s, and cages drawn in 3D (#82)

Stefan's issue #82. Branch `item/82-names`, from `release-1.2-mcp` (b30f413), for 1.2 (Friday 20 November 2026).
Plan written 17 November 2026.

Stefan's classes: fused and bridged polycyclics, sugars drawn as chairs, steroids, cages, and "anything with several
stereocentres where the locants have to be chosen properly". Sam's 1.1.2 note: 6854 of 6924 named, none wrong.

## What the branch names today

Measured on b30f413, 17 November 2026.

- Test set (`scripts/namer-survey.ts`, OPSIN's names, Octet's reagent names and drug names): 6924 structures, 6857
  named right, 0 wrong, 67 unnamed. The 67 are charged species (30), Se, Te and Hg bonds (24), a few S, P and
  halogen groups, and two metallocenide salts. None is a steroid, sugar, cage or polycyclic.
- The survey does not test the drug list or the reagent names written as SMILES (`namer-survey.ts:94-97` reads each
  key as a name, and OPSIN reads none of them, and leaves out the SMILES values). Probed apart: 277 of 279 drug structures named right (paclitaxel,
  strychnine, quinine, dexamethasone, artemisinin among them; the two misses are cyclophosphamide and cisplatin), and
  139 of 185 reagent SMILES (the 46 others are metal complexes, which `complexes.ts` names in the app).
- Sam's ChemDraw corpus (`namer-survey.ts corpus`): 104 of 104.
- Named right in probes: testosterone, estradiol, cholesterol, progesterone, cortisol, prednisolone-type steroids,
  5α-androstane, cholic acid, a triterpene pentacycle; every pyranose and furanose template, flat, as a chair and as
  a Haworth projection, a disaccharide, GlcNAc and a peracetate; adamantane, adamantan-1-amine, memantine,
  adamantan-2-one, 2-oxaadamantane, hexamine, cubane, cubane-1,4-dicarboxylic acid, prismane, bicyclo[2.2.2]octatriene,
  quinuclidine, DABCO, camphor with its (1R,4R); cubane and adamantane drawn flat in perspective with dashed back
  bonds; morphine, coronene, dibenzo[c,g]phenanthrene, tetraphene.

So the classes Stefan named are mostly done. What still fails is below.

## What fails (gap confirmed)

G1. Pseudoasymmetric centres (r and s). The namer gives no name to any structure with an r or s centre:
`namer.ts:2032-2036` throws "stereo not cited" when a label is not cited, `namer.ts:1528` cites only R and S,
`namer.ts:2360-2373` (`citedLabels`) counts only R, S, E and Z, and `namer-multiplicative.ts:483,519` give up on
other labels. Octet's labeller already gives r and s (`cip.ts:675`), and Show Stereochemistry shows them. Probed
misses, all "stereo not cited":

- sugar alcohols and inositols: xylitol, ribitol, scyllo-inositol, myo-inositol (flat and on a chair);
- 1,4- and 1,3-disubstituted rings: tranexamic acid (cis and trans), trans-4-tert-butylcyclohexan-1-ol,
  trans-4-(4-chlorophenyl)cyclohexane-1-carboxylic acid, 1,3-dimethylcyclobutane, and 4-methylcyclohexan-1-ol drawn
  as a chair (both chairs);
- ring fusions: cis- and trans-decalin (the templates too);
- tropanes: tropine, pseudotropine, atropine, hyoscyamine.

OPSIN reads no r or s (tested: "(1r,4r)-4-methylcyclohexan-1-ol", "(2R,3r,4S)-pentane-1,2,3,4,5-pentol",
"(4ar,8ar)-decahydronaphthalene" all fail), so a name with r or s cannot be checked by reading it back today.
`endoexo.ts` already reads endo, exo, syn and anti that OPSIN does not, and makes r and s centres for syn and anti.

G2. Cages drawn in 3D. The Cubane template (`library.json`, atoms with depth) gets no name: the namer gives
"cubane", but the drawing's InChI has a stereo layer (`/t1-,2+,3-,4+,5+,6-,7+,8-`) from the 3D places and the name's
has none, so `checkedName` (`naming.ts:44-58`) rejects it. Octet's labeller gives no label there. A 3D adamantane
(from a 3D file or 3D Clean Up) fails the same way. `templates.check.ts:551` lists Cubane, cis-Decalin and
trans-Decalin as templates with no name.

G3. Numbering by stereodescriptors. Where numberings tie after every other rule, the namer takes the first
(`namer.ts:1369-1421`). IUPAC gives the lower locants to Z before E, R before S and r before s. Xylitol needs it to be
(2R,3r,4S) and not (2S,3r,4R).

G4. The test set cannot see G1 or G2: it has no r or s structure and no 3D drawing.

Not fixed here (see Scope cut): perhydropyrene ("interior locant"), dodecahedrane ("von Baeyer size").

## ChemDraw cross-check

Sources checked, 17 November 2026:

- ChemDraw 26.1 help, `~/octet-research/notes/help26/text/Structure_Name.txt`, and the 22.2 page
  (`help26/v22/text/Struct_Name_Professional_Level.txt`, `help26/diff-22-26.md`).
- `chemdraw26-inventory.md` lines 137, 237-239, 512-514, 624, 1123, 1371-1375; `chemdraw-inventory.md` 144, 207.
- `chemdraw-hotkeys.md` line 185; `menus/live-menus.md` line 7 (Structure menu).
- `cdx-own-tags-and-autonumber.md` (captions tied to a structure by a `chemicalproperty`).
- `~/octet-research/specs-draft/cdxml-document-layer.md` line 883: the atom attribute `AS` holds the CIP label, with
  r (4) and s (5) for pseudoasymmetric centres. ChemDraw knows r and s.
- Decision 0013 (Octet's CIP labeller against ChemDraw's labels in Sam's files: 50 of 50).
- Not checked: ChemDraw's own names for r and s structures. ChemDraw 26.1 has no licence on this Mac, and ChemDraw
  22.2 is used here only for file round trips by AppleScript. The files for Sam to try are at the end.

Every option ChemDraw gives this feature, and what Octet has:

| ChemDraw | Octet now | This item |
| --- | --- | --- |
| Structure > Convert Structure to Name, ⌥⌘N | have | more structures |
| Structure to Name button (Structure toolbar, 26.1) | Actions panel, Convert structure to name | none |
| Right-click structure > Analysis > Name (caption tied to the structure) | Properties > Add to drawing writes a fixed caption | none |
| Caption right-click > Auto-update | missing (live values are #77) | none |
| Preferences > Building/Display > Display IUPAC atom numbers on S2N/N2S | missing | none |
| CIP descriptors in names (help: "proper CIP stereochemistry descriptors") | R, S, E, Z | adds r and s |
| Enhanced stereo: rac-, rel-, RS, SR, R*, S* | missing | none |
| Fused, bridged fused, spiro, ring assemblies, von Baeyer | have | 3D cages |
| Grouped mixtures with ratios (26.1) | have (`mixtures.ts`) | none |
| Polymers, bracket stoichiometry (hemi, sesqui) | missing | none |
| CAS-style indicated hydrogen (1,3-dioxole, not 2H-1,3-dioxole) | IUPAC style | none |
| Name to Structure reads IUPAC names | OPSIN plus Octet's readers | reads r and s |
| CDXML: name caption with `chemicalproperty` (type 1, BasisObjects); atom `AS` r and s | keeps ChemDraw's caption tie; writes no `AS` | none |

No palette, Object, Curves, Color or Text menu option belongs to this feature. No dialog.

## Jobs and what "done" means

J1. The namer cites r and s.
- r and s are cited with R, S, E and Z, in locant order, in the same enclosing marks: (2R,3r,4S)-, (1r,4r)-,
  (4ar,8ar)-, (1R,3r,5S)-. In a substituent prefix and an ester's alkyl part too:
  [(1r,4r)-4-aminocyclohexyl], (1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-yl (2S)-….
- `citedLabels` counts r and s, so a dropped label still stops the name.
- Every other label (c, t, M, P, m, p, ?) still stops the name.
- A multiplicative name with r or s on a unit is not made; the substitutive name is used.
- Done: every G1 example except myo-inositol gets a name that reads back (J3) to the drawing's InChI.

J2. Numbering by stereodescriptors.
- After the alphanumerical rule, the remaining numberings are chosen by lowest locants to Z, then R, then r
  (IUPAC 2013, the stereo criterion of P-31.1.4; check the paragraph number against the printed text when coding).
- Done: xylitol (2R,3r,4S), ribitol (2R,3s,4S), galactitol (2R,3S,4R,5S), meso-tartaric acid (2R,3S), tropine
  (1R,3r,5S), pentane-2,4-diol meso (2R,4S). Survey still 0 wrong and no fewer named.

J3. Octet reads names with r and s (`src/pseudo.ts`, new).
- Used by every Name to Structure path and by the check behind every name (`checkedName` reads names with
  `nameToSmiles`).
- Steps: the r and s items are taken out of the name; OPSIN reads the rest (constitution, R, S, E and Z); the open
  centres are found (an sp3 C with one H, no stereo bond, and two neighbours alike in the constitution); each of their
  configurations is drawn (an H with a wedge or hash); Octet's labeller and namer name each one; the ones whose name
  cites the same r and s at the same locants are kept; they must all have one InChI. That structure is the reading.
- Limits: names up to 300 characters, at most 6 open centres (64 tries), at most 120 heavy atoms. Past a limit: no
  reading.
- A gate: a text with no r or s in a descriptor list never reaches the reader.
- The last 16 readings are kept by text, so the name field's repeated reads cost nothing.
- Done: Octet's own r and s names read back; typed IUPAC names draw the right diastereomer; every malformed name in
  the stress list gives no structure.

J4. Cages drawn in 3D.
- `checkedName` compares without the stereo layer only when all of these hold: Octet's labeller gives no label in
  the structure; the drawing's InChI has a `/t` layer and no `/m` and no `/b`; every `/t` atom (mapped by AuxInfo) is a
  bridgehead with depth; the bridgeheads are joined, pair by pair, by three short paths (bridges of 1 to 3 atoms, or a
  shared bond with two bridges of at most 2 atoms), so none can change configuration on its own; and the 3D bonds of
  the cage are 0.6 to 1.6 times the drawing's median bond length.
- Then the structure has one stereoisomer, and its name cites none.
- Done: the Cubane template is named "cubane"; a 3D adamantane and a 3D cubane-1,4-dicarboxylic acid are named;
  camphor in 3D keeps (1R,4R); a 2D drawing with wedges on a cage is not changed.

J5. Measurement.
- `src/namer-pseudo.check.ts` (new): the #82 class set (about 60 structures written as SMILES or drawn: steroids,
  sugars flat, chair and Haworth, alditols and inositols, 1,4- and 1,3-rings, ring fusions, tropanes, cages flat,
  dashed and 3D, fused polycyclics), each named and read back; the published names in J2; reader cases; hostile
  names; a time bound for the reader.
- `scripts/namer-survey.ts` reads names back with Octet's reader too, so an r or s name counts as named.
- `scripts/namer-suite.ts` (new, local, skips without the file): each CIP validation suite structure Octet names must
  cite the suite's r and s labels at the right locants (`iupacLocants`).
- `src/templates.check.ts:551`: cis-Decalin, trans-Decalin and Cubane leave the unnamed list.
- Done: counts reported before and after for the survey (6857 of 6924 before) and the class set; namer bench no
  slower.

J6. Wiring and MCP.
- `src/Editor.tsx` and `scripts/headless/host.ts` give names.ts the reader and naming.ts the cage check, next to
  `setNamer` (Editor.tsx:124-125, host.ts:38-39).
- No new MCP tool. `draw` takes r and s names, `read` and `run_command structure_to_name` give them.
- Done: the MCP acceptance cases below pass in the headless host.

## Rules every part keeps

- No wrong name. A name shows only if Octet's Name to Structure reads it back to the drawing's standard InChI, stereo
  included. OPSIN always decides the constitution, R, S, E and Z. Octet's reader decides only r and s.
- Not sure: no name. The notice stays "Octet cannot name this structure yet."
- One labeller. The namer, Show Stereochemistry and the reader all take `cip.ts`'s labels.
- Hostile text and files: length caps, a cap on open centres and atoms, no `eval` or `innerHTML`, bounded work.
- No speed regression on any hot path (below).
- No new dependency. No new UI and no new wording. No file format change. Default keys stay ChemDraw's.

## Design decisions

1. r and s, not cis and trans. One rule covers chains, rings, cages and substituents; cis and trans cover only a ring
   with two centres. IUPAC 2013 uses r and s in preferred names, and ChemDraw records r and s on atoms (`AS`).
   OPSIN reads cis and trans, so the tests use them as a second opinion for two-centre rings.
2. The reader searches configurations. It does not map locants. OPSIN gives each component its own locants (an
   ester has two atoms numbered 1), so mapping is not safe. The search works the same in a parent, a prefix or an
   ester, and finds an ambiguous name (two InChIs).
3. The cost of decision 2: r and s are checked with Octet's own labeller, not a second program. Against that,
   `cip.ts` passes all 300 cases of the CIP validation suite (77 decided by rule 5), and the tests compare Octet's r
   and s with three outside sources: Indigo's labels for chain centres, OPSIN's cis and trans for two-centre rings,
   and published names (xylitol, ribitol, tropine, pseudotropine).
4. Where OPSIN cannot read the R and S part (myo-inositol and its isomers other than scyllo), no name. R and S stay
   checked by OPSIN.
5. The stereo numbering rule applies to every name, R, S, E and Z ones too, so one rule chooses every numbering.
6. A 3D cage drops its stereo layer only under J4's conditions. Without depth there is no geometry to prove the drawn
   configuration exists, so a 2D cage with wedges stays unnamed. Cages drawn flat or with dashed back bonds already
   have names.
7. A cage with labels cites them. A 3D amantadine gets (3s,5s,7s), as norbornene drawn with wedges already gets
   (1S,4R). Octet cites every label Show Stereochemistry shows. Sam may prefer no labels on cage atoms: that would
   change Show Stereochemistry too, and is not in this item.
8. names.ts does not load Indigo. The reader is given to it (`setPseudoReader`), as the namer is given to naming.ts.

## Siblings (consistency)

Every place that writes a name goes through `checkedName`, so each gets r and s and 3D cages at once:

- Structure > Convert Structure to Name (⌥⌘N), the Actions panel's Convert structure to name, the caption's name
  under a chemical caption (Rh as rhodium);
- Properties: the Name row, Add to drawing, Copy report;
- the canvas for screen readers (a structure's name, `Editor.tsx:6177-6240`);
- grouped mixtures (`mixtures.ts`), salts, the abbreviation after a name ("… (TREN)");
- the risk assessment's names; the MCP's `read`, `run_command structure_to_name` (`Editor.tsx:7835`,
  `host.ts:318`).

Every place that reads a name goes through `nameToSmiles`:

- Edit > Convert Name to Structure (⇧⌘N), the name field and its live preview, the Actions panel's Name to structure;
- a caption converted to a structure (Interpret); reagent text in the reagent table and stoichiometry;
- the MCP's `draw` (names in lines) and `change`.

Stereo siblings: Show Stereochemistry already shows r and s; the stereo warnings (Indigo) are not changed. A flip
(horizontal or vertical) turns R into S and keeps r and s, so a meso structure keeps its name. Chairs, Haworth
projections, Fischer projections and ChemDraw's kept configuration (`kept`) all reach the namer through `cipOf`.

Dark mode, zoom, colour, align, duplicate, copy and paste: a name is a caption, drawn and copied as any caption.
`nametype.ts:35-38` already sets r and s in italic.

## MCP surface

No new tool or argument. Checks in the headless host:

- `draw` with "(1r,4r)-4-(aminomethyl)cyclohexane-1-carboxylic acid" draws trans tranexamic acid; "(1s,4s)-…" cis.
- `read` of a drawing with xylitol gives "(2R,3r,4S)-pentane-1,2,3,4,5-pentol".
- `run_command structure_to_name` on xylitol and myo-inositol names xylitol and reports one structure not named.
- Bad arguments: `draw` with "(1q,4r)-4-methylcyclohexan-1-ol", "(9r)-pentane-1,2,3,4,5-pentol", "(1r,4r)-" or 2,000
  characters of descriptors gives the unread warning and draws nothing.

## Files and formats

Code: `src/namer.ts`, `src/naming.ts`, `src/names.ts`, `src/pseudo.ts` (new), `src/Editor.tsx` (two lines),
`scripts/headless/host.ts` (two lines). Checks: `src/namer-pseudo.check.ts` (new), `src/templates.check.ts`,
`scripts/namer-survey.ts`, `scripts/namer-suite.ts` (new, local).

No file format changes. A name is a caption with italic runs in .oct, CDXML and CDX, as now; SDF, MOL, SMILES and
the clipboard carry the structure and its wedges, as now. Octet 1.1.2 opens a 1.2 file with an r or s name and shows
the caption; its own Structure to Name has no name for that structure. ChemDraw opens the CDXML and shows the caption
as text.

## Speed

Hot paths: the screen-reader naming of every structure up to 120 atoms after each edit, Name to Structure as the user
types (`Editor.tsx:3752`, and `nameToSmiles` in render at 10578 and 10593), and `checkedName`.

- Namer bench: `iupacNameWhy` over the survey's 6924 graphs, 5 rounds, median. Base b30f413: 2,055, 2,114 and
  2,072 ms (three runs, load average 9.5). After: base and branch run in turn, three times each; the branch must be
  within 5% of the base.
- `checkedName` on 40 paclitaxels: median per structure, base and branch in turn. No r or s and an InChI with `/m`,
  so neither the reader nor the cage check runs.
- Reader: tranexamic acid's name under 30 ms (median, warm); 6 open centres under 400 ms; a name with no r or s costs
  only the gate (500 names, before and after).
- Typing an r or s name: each prefix of a 60-character name reads in under 30 ms; repeats come from the cache.
- A timing assertion in `namer-pseudo.check.ts` (three times the measured bound), run alone again before any
  failure counts.

## Stress list

| # | Case | Expected |
| --- | --- | --- |
| 1 | Empty drawing; Structure to Name with nothing selected | as now: nothing named, no notice |
| 2 | Xylitol drawn as a zigzag with wedges; flipped; turned 90°; turned in 3D | (2R,3r,4S)-pentane-1,2,3,4,5-pentol every time |
| 3 | Hyoscyamine, then flipped horizontally | (1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-yl (2S)-3-hydroxy-2-phenylpropanoate; flipped: (1R,3r,5S)-…-yl (2R)-… |
| 4 | trans-4-tert-butylcyclohexan-1-ol as each chair (eq/eq, ax/ax), as a flat ring with wedges; cis likewise | (1r,4r)-4-tert-butylcyclohexan-1-ol; cis (1s,4s) |
| 5 | cis-Decalin and trans-Decalin templates | (4as,8as)- and (4ar,8ar)-decahydronaphthalene, each read back to its own InChI |
| 6 | Typed: "(1r,4r)-4-(aminomethyl)cyclohexane-1-carboxylic acid", "(1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-ol", "(2R,3s,4S)-pentane-1,2,3,4,5-pentol" | trans tranexamic acid, tropine, ribitol |
| 7 | Typed: "(1R,4R)-4-methylcyclohexan-1-ol" (R on a pseudo centre), "(1r,3r)-3-methylcyclohexan-1-ol" (r on a real centre), "(9r)-pentane-1,2,3,4,5-pentol", "(1r,4q)-…", "(1r,1s)-…" | no structure, as for any name that does not read |
| 8 | An r or s name typed one character at a time | no lag; preview when complete; each read under 30 ms |
| 9 | Seven or more open centres (a chain of cyclohexane rings) | no reading, no name, under 0.5 s |
| 10 | myo-inositol flat and on a chair; scyllo-inositol | myo: no name; scyllo: (1r,2r,3r,4r,5r,6r)-cyclohexane-1,2,3,4,5,6-hexaol |
| 11 | An r or s centre made by deuterium; an r or s centre on a charged N | a checked name or none, never a wrong one |
| 12 | A structure with an r centre and a c or t double bond | no name |
| 13 | Structure to Name on xylitol, ⌘Z, ⇧⌘Z; ⌥⌘N pressed five times fast | caption goes and comes back; one caption only |
| 14 | Copy xylitol to a second window and name it there; paste the caption's text into Name to Structure | same name, italic r; the text draws xylitol |
| 15 | Save with the caption as .oct, CDXML, CDX; export MOL, SDF, SMILES; open each and name again | same name; caption keeps its italic r in .oct, CDXML and CDX |
| 16 | ChemDraw 22.2 opens the CDXML and saves it (AppleScript); Octet opens that file | same structure, same name |
| 17 | Octet 1.1.2 opens the .oct | caption shows; no damaged-file message |
| 18 | Dark mode; zoom 10% and 800% | caption in the theme's text colour, italic r readable; exports black |
| 19 | 40 paclitaxels, all selected, Structure to Name | 40 names; time within noise of the base |
| 20 | A 500-residue peptide | not named by the screen-reader pass (over 120 atoms); no reader work |
| 21 | Delete the structure under a name caption | caption stays as text, as now |
| 22 | Cubane template; 3D adamantane; 3D cubane-1,4-dicarboxylic acid | cubane; adamantane; cubane-1,4-dicarboxylic acid |
| 23 | 3D amantadine; camphor in 3D and with wedges | (3s,5s,7s)-adamantan-1-amine; (1R,4R)-1,7,7-trimethylbicyclo[2.2.1]heptan-2-one |
| 24 | 2D norbornane with hashed bridgehead bonds; 2D trans-bicyclo[2.2.0]hexane with wedges | no stereo-free name (J4 needs depth) |
| 25 | A 3D cage with stretched bonds (one bond 3 times the median) | J4 does not apply; no name |
| 26 | MCP bad arguments (MCP surface above); two AI sessions name the same drawing at once | unread warnings, no exception; identical names |
| 27 | A pasted CDXML caption of 3,000 characters of descriptors, converted with Interpret | no structure, under 50 ms |

## Acceptance list

| Check | Covers |
| --- | --- |
| `namer-pseudo.check.ts`: class set named and read back; published names; r/s against Indigo (chains) and OPSIN cis/trans (rings) | J1, J2, J3, stress 2-6, 10 |
| `namer-pseudo.check.ts`: hostile and malformed names, caps, gate, cache, time bound | J3, stress 7-9, 11, 12, 27 |
| `namer-pseudo.check.ts`: 3D cages, camphor, stretched cage, 2D wedged cages | J4, stress 22-25 |
| `templates.check.ts`: Cubane, cis- and trans-Decalin named | J1, J4, stress 5, 22 |
| `chair.check.ts` additions: chair-drawn 1,4-rings and inositols | J1, stress 4, 10 |
| `scripts/namer-survey.ts`: 6924 set, 0 wrong, named not below 6857; corpus 104 of 104 | J2, J5 |
| `scripts/namer-suite.ts` (local): suite r and s at the right locants | J1, J3 |
| Namer bench and `checkedName` timing, interleaved with the base | Speed, stress 19, 20 |
| Headless host MCP script: draw, read, run_command, bad arguments | J6, stress 26 |
| In the dev app (port 1474) with `npm run look`: Structure to Name, undo, redo, repeat, copy to a second window, dark mode, zoom | stress 1, 13, 14, 18, 21 |
| File round trips: .oct, CDXML, CDX, MOL, SDF, SMILES; ChemDraw 22.2 by AppleScript; Octet 1.1.2's reader on the .oct | stress 15-17 |
| Full `npm test` (161 check files on the base) and `cargo test` untouched | everything |

## Scope cut

- Carbohydrate names (β-D-glucopyranose) and steroid parent names (5α-androstane). ChemDraw also gives systematic
  names for these, and Octet already does. A second naming system with its own read-back is weeks of work.
- myo-inositol and the other inositols whose R and S OPSIN cannot read: no second reading of R and S, so no name.
- c and t, M and P, m and p in names, and enhanced stereo (rac-, rel-, RS, SR, R*, S*).
- Hydro locants on interior atoms (hexadecahydropyrene) and von Baeyer systems over the size limit (dodecahedrane).
- Cages drawn in 2D with wedges or hashes: no geometry to prove the drawn configuration exists.
- Leaving out r and s on cage atoms (decision 7): it changes Show Stereochemistry too.
- ChemDraw options outside this item: Auto-update captions (#77), Display IUPAC atom numbers on S2N/N2S, polymers,
  bracket stoichiometry.

## For Sam to try in ChemDraw

Draw in ChemDraw 26.1 (or 22.2) and run Convert Structure to Name: xylitol, ribitol, trans- and cis-tranexamic acid,
cis- and trans-decalin, tropine, hyoscyamine, the 3D cubane and a 3D amantadine. Octet's names are in the stress
list. A difference in r or s, or in the numbering, is a finding for this item.
