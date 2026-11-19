# Issue 27: bridges, custom monomers and how sequences show

Branch `item/27-sequence-bridges`, cut from `release-1.2-mcp` at b30f413, now on bd7c684. For release 1.1.3 (Friday
20 November 2026). Status: built on this branch (17 November 2026); finished for 1.1.3 on 19 November without custom
monomers (section 15). What changed from the plan as it was built is in section 14.

Sam's 1.1.2 note on #27 lists three things as not done: custom monomers, disulfide bridges, and a document setting
for how chains show. Stefan Schramm's comment of 8 November asks for the same three, and says HELM must keep a custom
monomer when it leaves Octet.

## 1. What Octet has now

| What | Where | Gap |
| --- | --- | --- |
| Sequence tool: click, type one-letter codes in the name field, Return draws | `src/tools.tsx:78`, `src/Editor.tsx:2459` (insertSequence), `src/Editor.tsx:10559-10572` (kind, ends and Residue labels under the field) | No D-amino acids, no other monomers, no links |
| Peptide SMILES built from codes, L only, capitals only, up to 60 residues | `src/peptide.ts:18` (MAX_RESIDUES), `:29` (lower case refused), `:42-51` | 60 is a layout-time limit (a 60-mer takes about 1 s in Indigo's tidy) |
| RNA and DNA SMILES, up to 30 nucleotides | `src/nucleic.ts:19`, `:25-37` | Same layout-time limit |
| Return lays the SMILES out in the layout worker, then straightens the chain | `src/namepreview.ts:46-75`, `src/chem.ts:337-357` (fullMol, straightened) | Measured today on this branch: a 60-mer takes 1040 ms in `parseStructure` (Indigo's layout alone: 178 ms) and 10 ms in `chainLayout` |
| Straight backbone layout | `src/chain.ts:113-251` (chainLayout) | `chainOf` returns undefined when a group bonds to the backbone at two places that are not neighbours (`src/chain.ts:66-67`, `:85-86`): any disulfide, lactam or head-to-tail ring falls back to Indigo's curved layout. One backbone per structure only (`backbone`, `:18-63`), so two chains joined by bridges (insulin) are one chain plus a large side group |
| Residue labels (H–Ala–Cys–OH), each label keeps its atoms (`inner`) and each bond its ports | `src/sequence.ts:119-151` (residues), `src/edit.ts:1282-1301` (Expand Label by ports), `:1316-1335` (Contract Label by ports) | Built from the full structure by SMILES atom order (`src/sequence.ts:140`). `labelPath` (`:156-168`) needs a plain path, so a label chain with a bridge is not read, laid out or copied. A bond drawn between two residue labels has no ports, so it joins their N atoms (`src/edit.ts:1291-1292`: port missing means atom 0) |
| Residue labels is an app setting, kept for next time | `src/settings.ts:99`, `src/Editor.tsx:2475`, `:10571` | Not a document setting. Nothing converts the chains already drawn |
| Paste HELM or FASTA: the field opens with the sequence | `src/helm.ts:14-55`, `src/Editor.tsx:2467-2471` | One polymer only. Any connection is refused: "Octet reads HELM of one peptide, RNA or DNA chain, with no links." (`src/helm.ts:25`). Inline SMILES monomers are refused, though Copy As HELM writes them (`src/helm.ts:106-117`), so Octet cannot read its own HELM back for a modified residue |
| Copy As HELM and FASTA | `src/helm.ts:61-105`, `src/Editor.tsx:1383-1384`, `:7941-7946` | `chains()` uses `chainResidues`, which fails on any bridge: a bridged peptide copies nothing |
| Files: `inner` and `ports` in .oct, CDXML and CDX | `src/file.ts:24-38`, `:240`, `:264-268`; `src/cdxml.ts:579`, `:695-697`, `:841-858`, `:1784-1786` | Works for any port, so a side-chain port (R3) needs no format change |
| MCP | `src/mcp.ts:36` (read formats helm, fasta), `:282` (insert_peptide, insert_rna, insert_dna) | No way to draw a bridge, set the display or define a monomer |
| User dictionary (own names) | `src/names.ts:86-146`, `src/settings.ts:68`, `src/SettingsWindow.tsx:208-230`, `:678-679` | No monomers |

Gap confirmed: none of the three parts exists.

## 2. What ChemDraw does

Sources: ChemDraw 26.1 and 22.2 help (public documentation), pages Disulfide Bridges, Lactam Bridges, Cyclic,
Crosslinked and Branched Peptides, Branched Peptides, Drawing Bonds between Monomers and Structures, Pasting HELM
Strings, Copying Sequence(s) as HELM String, Copying Sequence(s) as HELM (Natural Analog), Basic Sequence Operations,
Drawing Monomer Sequences, Drawing Amino Acid Sequences, Drawing RNA Sequences, Monomer Editors, Accessing the
Custom/Standard/Imported Monomer Editor, ChemDraw Shared Monomers, Clean Up Biopolymer, Graphic Monomers, Toggle Amino
Acids, Numbering Residues, Removing Residues, Selecting Monomers, Nonlinear Sequences, Document Settings (Biopolymer
Display); ChemDraw's menus and hotkeys as listed in Octet's inventory; ChemDraw's CDXML attributes for sequences.
HELM facts (monomer symbols, R1/R2/R3, caps) are from the public HELM standard and the Pistoia Alliance monomer
library conventions.

| ChemDraw | Octet 1.2 |
| --- | --- |
| Disulfide bridge: Bond tool from one C monomer to another, in one chain or between chains (insulin example) | Have after J7 (Bond tool between residue labels joins their side chains), J3 and J5 (layout) |
| Lactam bridge: Bond tool from K to D or E | Same mechanism (R3 of K, D, E) |
| Cyclic peptide: bond between the terminal residues, drawn as a looped bond | Head-to-tail link (R1–R2), drawn as a bracket (J3, J5) |
| Branched peptide: bond to a free end or an unlinked branch; else the Attachments dialog to pick the attachment point | Free R3 or a free end is picked. No Attachments dialog: a residue with no free link says so (cut, see section 10) |
| Paste and Paste Special > HELM (⇧⌘E); plain paste of HELM text draws it | Plain paste opens the field with it (have); links, more polymers, D and custom monomers, inline SMILES (J1) |
| Edit > Copy As > HELM (⌥⌘E), with connections, pairs, strand types and annotations | Connections (J6). Pairs, strand types and annotations: cut |
| Copy As > FASTA (was HELM (Natural Analog)): natural analogue letters, X for an unknown peptide monomer, N for an unknown nucleotide | Have. D monomers give their natural analogue (dF gives F) (J6) |
| Paste Special > FASTA Peptide, DNA, RNA; > Biopolymer (H-Ala-Gly-Pro-NH2) | FASTA have. Three-letter text: cut |
| HELM Monomers toolbar: polymer type (AA alpha, beta, L, D; RNA; CHEM; BLOB), data source, Replace Current Monomer, Manage Monomers, search, filters | Octet's field and Sequence tool; D monomers as [dX] (J8). Toolbar, CHEM, BLOB, beta: cut |
| Monomer Manager > Create Monomer: polymer type, Symbol, Full name, Natural analog, Monomer type, structure with R1, R2… labels, a cap for each R | Structure > Define Monomer… (J10): peptide only, Code, Name, structure with R1, R2, R3 labels; caps by rule. Natural analogue, monomer type, other polymer types: cut |
| Monomer libraries: User, Document, Natural, Pistoia, Signals; add file or URL, rename, order, sync, versions, deprecation | The user's monomers (Settings > Dictionary) and the document's own copies (J10). Library files, sync, versions: cut |
| Structure > Expand Label and Contract Label on monomers | Have; extended to D, custom and bridged residues (J5, J10) |
| Structure > Clean Up Biopolymer (aligned rows, wrapping, complementary strands, hairpins, routed bonds with round corners) | Clean Up Structure lays chains out (have); bridges and two chains (J3, J5). Strands, hairpins: cut |
| Document and Object Settings > Biopolymer Display: Limit to N residues per line (1 to 1000); amino-acid termini NH2/COOH or H/OH | Settings > Document > Sequences: Atoms or Residue labels (J9). Residues per line and termini style: cut |
| Context menu: Toggle Standard Amino Acid Style (one or three letters); Biopolymer > Show Residue ID, Show Unlinked Branches | Cut |
| Graphic monomers (shapes coloured by natural analogue), default since 23.0 | Cut |
| Removing a residue closes the gap | Cut (not part of this item) |
| Hotkeys: AA1, DNA, RNA sections; Shift toggles D/L while typing | No new keys. D monomers are typed as [dF] |
| CDXML: `ShowSequenceTermini`, `ShowSequenceBonds`, `ShowSequenceUnlinkedBranches`, `ResidueWrapCount`, `ResidueBlockCount`, `ShowResidueID`, `MonomerRenderingStyle`, `SequenceType`, `ResidueID`, NodeType Monomer | Octet writes residue labels as Fragment nicknames with external connection points (have), which ChemDraw opens as labels. No sequence objects: cut |

## 3. Scope for 1.2

In, in this order, so each step ships whole if the next one runs out of time:

1. **A. Links**: disulfide and other side-chain bridges, links between chains, head-to-tail rings. HELM in and out.
   Drawn with the straight backbone, as atoms and as residue labels. D-amino acids come with it.
2. **C. How sequences show**: a document setting, Atoms or Residue labels. A residue Octet does not know stays drawn
   in full.
3. **B. Custom monomers**: peptide monomers defined from a drawn structure, kept in the user's dictionary and in each
   document that uses them, usable in the field and in HELM.

## 4. Rules every part keeps

- One model, one builder, one reader. The field, paste, HELM, MCP, Clean Up and the document setting all go
  through them. No second path that can disagree.
- The drawing is the chemistry. A sequence as residue labels, as atoms, or mixed, has the same InChI (stereo too).
- Never worse than 1.1.2. When the new layout cannot place a chain cleanly, Octet keeps the layout 1.1.2 makes.
- Every opened, pasted or AI-given text is hostile: hard limits (section 9), linear parsing, no regular expression
  that can backtrack on long input, no eval, no innerHTML. Errors are notices that quote at most 40 characters of
  the input.
- No speed regressions: render, structure update, input and load time are no slower than v1.1.2 (6395bd5) beyond
  noise, measured as the median of interleaved runs. Sequences get faster (J2).
- UI: British English, Simplified Technical English, short plain labels, no tips. Dialog.tsx, Fields.tsx, Menu.tsx
  and the existing list components only. Values from `brand/tokens.css`. No new default shortcuts.
- Files: `file.ts` VERSION stays 1, so Octet 1.1.2 opens every new file (section 8).
- MCP parity for every new function (section 7). Small, local MCP changes.
- No ChemDraw text, icons, templates, samples or data in the repo.

## 5. Jobs

### J1. One sequence model, and HELM in

`src/helm.ts` reads HELM 2 into a model: chains (peptide, RNA, DNA), each a list of monomer codes with its ends, and
links (`{chain, unit, R}` to `{chain, unit, R}`, R 1 to 3). The field's own words ("peptide: Ac-C[dF]IQN-NH2") read
into the same model (J8).

Reads: more than one polymer (`|`); connections (`PEPTIDE1,PEPTIDE1,1:R3-6:R3`, `PEPTIDE1,PEPTIDE2,7:R3-7:R3`,
`PEPTIDE1,PEPTIDE1,1:R1-9:R2`); natural codes; [dA] [dC] [dD] [dE] [dF] [dH] [dK] [dL] [dM] [dN] [dP] [dQ] [dR] [dS]
[dV] [dW] [dY] (the HELM library's D set: no dG, dI or dT); [ac] and [am]; the user's and the document's monomers
by [code]; inline SMILES monomers with `[*:1]`, `[*:2]`, `[*:3]`. RNA and DNA as now, more than one polymer allowed.

Left out with a notice: `pair` connections ("Octet left out the base pairs."), groups and annotations ("Octet left
out the HELM annotations."). Refused with a problem: CHEM and BLOB polymers, links that touch RNA or DNA, and every
case in section 9.

When the HELM is one chain with no links and only natural codes, paste opens the field in Octet's words, as now, so
the kind and the ends can be chosen. Anything else opens the field with the HELM itself (J8).

Done when: every HELM in section 11 reads to the expected model or the expected problem; reading is linear in the
length (a 20,000-character HELM reads in under 20 ms); `bridges.check.ts` covers it.

### J2. One builder, from monomers

A monomer table: each monomer is a structure with its R1, R2 and R3 atoms, and what leaves when an R is linked (an
OH on Asp and Glu R3; H elsewhere). Natural amino acids use the residue SMILES Octet has (`src/peptide.ts:51`); R3 is
on Cys S, Asp and Glu side-chain C=O (its OH leaves), Lys Nζ, and, as the HELM library's second forms, Ser O, Thr O,
Tyr O, Asn N, Gln N, His N–H, Trp N–H and Arg terminal N. D monomers swap the α carbon's hand. Nucleotides and
phosphates as in `src/nucleic.ts`. Caps: H, Ac, OH, NH2, 5′ and 3′ phosphate.

Each monomer is read by Indigo once (and kept), with its own layout. The builder joins the monomers' atoms by their
R atoms (backbone R2 to R1, then each link), in the model's order, and hands the result to the layout (J3). A
stereocentre keeps its hand, also when an R atom is bonded to it (the hand is taken from the monomer and set again
after layout).

The same builder makes residue labels directly (J5): each label's kept atoms come from the monomer table, so there is
no full structure to cut up, and no dependence on SMILES atom order (`src/sequence.ts:140` goes).

Return and the preview both build in the layout worker, so typing never waits.

Limits: as atoms, up to 1,000 atoms (Octet's structure limit, about 120 residues); as residue labels, up to 1,000
residues. These replace MAX_RESIDUES and MAX_NUCLEOTIDES.

Done when: every stress sequence builds; the InChI of each built peptide equals the InChI of the same peptide from a
SMILES written by hand (oxytocin, vasopressin, insulin, the cyclic and D cases); a 60-mer builds and lays out faster
than v1.1.2 draws it (target under 100 ms against about 1 s, median of interleaved runs); the field preview and
Return draw the same structure.

### J3. Straight-backbone layout with links, as atoms (`src/chain.ts`)

- Finds every backbone in a structure (longest first, at least three residues), not only the longest.
- A group bonded to two places on the backbones is a link. It is cut at the bond that makes both halves known
  residues (the S–S, a lactam's amide N–C); failing that, at its middle bond. Each half is laid out as a side chain.
- Each link has a side. Both of its residues' side chains point to that side. Where the zigzag would put one on the
  other side, one backbone bond in between is drawn level (as Octet already does beside proline). The first link's
  side is set by the zigzag's start, so a single bridge with residues an even number apart needs no level bond.
- The cut bond is drawn as a bracket (J4) on that side, high enough to clear every atom between its ends by half a
  bond length. Nested links stack outward. Crossing links go on opposite sides.
- Head-to-tail: the backbone is cut at the closing bond (the bracketed one if there is one, else before the residue
  with the lowest atom number), laid out straight, and the closing bond drawn as a bracket below.
- Two chains joined by links (insulin): stacked, the first above. Their linked side chains face each other, and the
  second chain is moved along so the first link is upright. Links between the chains are plain straight bonds;
  links within a chain go on its outer side.
- More than two chains in one structure, or a link to something that is not a residue on both ends: the layout
  1.1.2 makes.

Clean Up Structure uses this, so a chain drawn by hand gets the same layout.

Done when: in `bridges.check.ts`, for oxytocin, vasopressin, the lactam peptide, insulin A, insulin A+B, the cyclic
peptide and two nested and two crossing bridges: every backbone atom is on its zigzag line (y within 0.01 of its
level), no two atoms are closer than 0.3, no bond crosses another, each bracket clears every atom between its ends,
both residues of each link point to its side, and the InChI does not change. Clean Up on 40 paclitaxels is no slower
than v1.1.2 (`perf.check.ts`, and a timing of Clean Up alone).

### J4. Bracket bonds

`Bond.route`: a single bond's bracket, the distance in bond lengths to the left of its first atom looking at its
second (negative: to the right). The bond is drawn up from each atom, along, and down, with round corners. Only on a
plain single bond; any other bond type drops it.

Every bond behaviour works on it: hover, click and box select, ⌘A, colour, highlight, its own line width, erase,
delete, undo, copy and paste, duplicate, move and nudge, rotate (the bracket turns with the bond), flip (the sign
changes, so the picture is a mirror), scale, Bond Properties (shows Single; another type drops the bracket), the
structure check (it tests the bracket's path, so no "atom near a bond" warning), the glide, dark mode, every zoom,
and every export. Saved in .oct and CDX (Octet's own data). CDXML and ChemDraw draw it straight.

Done when: `bridges.check.ts` tests hit testing on each of the three segments, flip and rotate, file round trip and
the warning; `npm run look` shows it in light and dark at 25%, 100% and 800%; the render of a drawing with no
brackets is no slower than v1.1.2 (`perf.check.ts`).

### J5. Residue labels with links

Built from the model (J2). A link is a bond between two labels with each port on the residue's R3 (or R1, R2 at a
free end).

- A chain without links: rows of 10, back and forth, as now. The look does not change.
- A chain with links and up to 40 residues: one row. Links in the row are brackets above it (nested ones stack,
  crossing ones go below). A head-to-tail link is a bracket below. Over 40 residues: rows of 10, and a link between
  rows is a straight bond.
- Two chains (insulin): the first row above the second, moved along so the first link between them is upright. Links
  between the rows are straight. Links within a row are brackets on its outer side.
- Clean Up Structure lays out label chains, linked ones and mixed ones (J9) this way.
- Expand Label and Contract Label work on a linked residue: the link goes to its S (or N, or C=O) and back.

Done when: for each stress sequence, the labels have the same InChI as the atoms; HELM out is the same from labels
and from atoms; no label box overlaps another or a bond it is not on; the textbook figures read as they should
(oxytocin, insulin) in `npm run look`.

### J6. One chain reader, and HELM and FASTA out

`chains()` in `src/helm.ts` becomes one reader for atoms, labels and mixed chains: it expands labels with their
origins (`expandWithOrigins`, `src/chem.ts:1108`), reads backbones and links with J3's analysis, and maps each residue
back to its label. A residue is named by its label when it is a known code, else by InChI against the natural, D,
document and user monomers (as `residueName` does now), else written as an inline SMILES with `[*:1]`, `[*:2]` and
`[*:3]`.

HELM out, Octet's form: polymers in order of their first atom; connections after the first `$`, sorted by their
first end, each written lower end first (`PEPTIDE1,PEPTIDE1,1:R3-6:R3`); inline SMILES in Indigo's canonical form;
groups and annotations empty; `V2.0`. FASTA: a line for each chain; D monomers as their natural letter; others X or
N, as now.

Done when: for every HELM Octet writes, reading it and writing it again gives the same string; each stress HELM in
Octet's form comes back unchanged through atoms, through labels and through a mixed chain; HELM from another form
(links written the other way round, links out of order) comes back in Octet's form with the same model.

### J7. The Bond tool between residue labels

A bond drawn from a residue label to another label, or to an atom, joins at the residue's free R3; for an end
residue with no R3, at its free end. Between two labels in one row, the bond gets a bracket above the row. A residue
with nothing free: no bond, and a notice ("Ala has no free link. Expand the label to bond to its atoms."). As atoms,
a bond from S to S is plain chemistry, as now; Clean Up lays it out.

Done when: in `bridges.check.ts`, dragBond between the two Cys labels of a sequence gives the oxytocin InChI, and
the bond has R3 ports and a bracket; Ala to Ala gives the notice and no change.

### J8. The field

- Codes: one capital letter for a natural amino acid, or `[code]` for a D monomer or a custom one
  (`peptide: Ac-C[dF]IQN-NH2`). Problems: "Not an amino acid: X" (as now), "Not a monomer: [Xyz]", "Type ] after the
  code."
- HELM in the field: typed or pasted HELM is read as HELM, drawn by the same builder. The kind and end choices are
  hidden for it; Residue labels stays.
- The limits of J2, with "Up to 1,000 atoms. Choose Residue labels." when a sequence is too large to draw in full.
- A name longer than 200 characters is not kept in the name history.

Done when: `sequence.check.ts` covers each token and problem, and the field's preview and Return draw HELM and
words through one path (checked in the dev server with the console clean).

### J9. Document setting: how sequences show

`DocStyle.sequences`: "atoms" (unset, as 1.1.2) or "labels". Set in Settings > Document > Style, row "Sequences",
a Segmented with Atoms and Residue labels; and by the Residue labels chip under the name field, which shows and sets
the same value. A new document starts with the last choice made (the app setting `sequenceLabels` becomes that
default).

Changing it is one undo step with the style:

- To Residue labels: every chain the reader finds becomes labels, through the model and the builder. A residue Octet
  does not know stays in full, in its place in the row (its N–C level, its side chain away from the other rows).
- To Atoms: every residue label of a chain is drawn out, and the chain laid out (J3).
- Each chain keeps its centre. Nothing else moves.

New sequences (field, paste, MCP) are drawn the way the document says. Expand Label and Contract Label still change
one residue; the setting applies again to all of them when it is changed.

Done when: `sequencestyle.check.ts` converts oxytocin, insulin and a chain with one modified residue both ways, with
the InChI unchanged, undo restoring the drawing exactly, and the modified residue in full; the Settings row and the
chip pass `npm run look`.

### J10. Custom monomers (peptides)

- Define: Structure > Define Monomer…, also in the context menu of a selected structure. The structure has R1 (the
  N side), R2 (the C=O side) and optionally R3 as R labels, each on one single bond, and an α-amino-acid backbone
  (R1's atom an N, R2's a C=O carbon, one carbon apart). Dialog: Code (1 to 12 letters, digits, - or _; not a
  natural letter, a D code, ac or am), Name (optional). Action: Define. A code already used for another structure:
  "[Xyz] is already a monomer. Select Define again to replace it." (as Contract Label warns). Caps by rule: an R on
  an acyl carbon caps OH, any other H.
- Kept: the user's monomers in settings (code, name, SMILES with `[*:1]`, `[*:2]`, `[*:3]`; up to 500), listed in
  Settings > Dictionary under Monomers with the component that lists names (rename, remove). A document keeps a copy
  of each monomer it uses (`Mol.monomers`), copied with the parts that use it, so it opens the same anywhere. A code
  is looked up in the document first, then in the user's monomers.
- Used: `[Xyz]` in the field and in HELM, both ways; as a residue label "Xyz" with its kept atoms and ports;
  Contract Label suggests the code for a matching residue; Copy As HELM writes `[Xyz]` for it, drawn in full or as a
  label; FASTA writes X.

Done when: `monomers.check.ts` defines a monomer from a drawn structure, refuses each bad one, draws `A[Xyz]C` as
atoms and as labels with the same InChI, writes and reads `PEPTIDE1{A.[Xyz].C}$$$$V2.0` unchanged, keeps it through a
.oct round trip on a library without it, and the dialog and the Dictionary section pass `npm run look`.

### J11. MCP

Section 7. Done when `mcp.check.ts` and `mcprobust.check.ts` cover each new argument and each bad one.

### J12. Files and formats

Section 8. Done when each row of section 8 has a check.

## 6. Design decisions

1. **Build from monomers, not from one SMILES.** A custom monomer cannot be put into a SMILES string without
   rewriting it around its R atoms, which risks its stereocentres. Joining laid-out monomers needs no rewriting, keeps
   each side chain's shape, and is about 100 times faster (a 60-mer: 10 ms of layout against 1 s of tidying). It also
   makes residue labels without a full structure first, which a 500-residue chain needs.
2. **A bridge is a bracket, as atoms and as labels.** A straight backbone with side chains above and below by turns
   puts other side chains in the way of any straight bridge. A bracket that clears them keeps the backbone straight
   and has no crossings. It is also how sequences with bridges are printed in three-letter code (oxytocin with a
   line over its two Cys), and how ChemDraw routes bonds between monomers. One bridge style in both displays.
3. **The bracket is stored on the bond, relative to the bond.** Rotating, moving and scaling need no change; only
   a flip changes its sign, in one function (`flipAtoms`). A bracket worked out when drawing would change under the
   user's hand and cost every render.
4. **Both residues of a link point the same way.** A level backbone bond, as beside proline, changes the side where
   needed. The zigzag start is chosen first, so many single bridges need none.
5. **No typed bridge syntax in Octet's words.** HELM already writes links, and the Bond tool draws them as ChemDraw
   does. A third notation would be one more thing to learn and to keep in step.
6. **D-amino acids as [dX].** The HELM library's own symbols, so HELM round-trips; a lower-case letter is refused
   today and would change what existing text means. D-Ile and D-Thr are left out, as in the HELM library, because
   "D" does not say whether the second centre is inverted; a user defines the one they mean.
7. **The setting converts the whole document.** Stefan's reason: a figure is consistent. A residue Octet does not
   know stays in full, which is the figure he asks for. One residue can still be changed by hand.
8. **The chip is the document setting.** Two controls for how sequences show, one for the document and one for the
   next sequence, would disagree.
9. **Custom monomers are α-amino acids.** The chain reader finds backbones by the N–C–C(=O) pattern; a β-amino acid
   or an ester link would split the chain when it is read back. Aib, N-methyl and peptoid residues are α and work.
10. **Bridged label chains stay on one row up to 40 residues.** A bracket cannot join two rows cleanly. Insulin's B
    chain is then one row; the user scales the figure to the page.

## 7. MCP surface

- `draw` and `replace`: a compound may be sequence words or a HELM string. They go through the builder and come out
  as the document's setting says. A bridged peptide is drawn this way (the MCP has no Bond tool).
- `read` with `format: "helm"` and `"fasta"`: links, D and custom monomers, as Copy As writes.
- `set_style`: new `sequences: "atoms" | "labels"` (J9; one undo step).
- `advanced` `define_monomer`: `code`, `name`, and either `smiles` (with `[*:1]`, `[*:2]`, optional `[*:3]`) or `id`
  (a drawn structure with R1, R2, R3 labels); `remove: true` removes one. Same rules and messages as the dialog.
- run_command: Expand Label and Contract Label work on linked residues (no new ids).

## 8. Files and formats

| Format | Written | Read back | Octet 1.1.2 opens it |
| --- | --- | --- | --- |
| .oct (CDXML with Octet's JSON) | Labels with `inner` and `ports` (R3 ports too); `route` on bracket bonds; `style.sequences`; `monomers` | All of it | Yes: it skips `route`, `sequences` and `monomers` (unknown keys), so brackets are straight lines and the document shows atoms or labels as drawn. VERSION stays 1 |
| CDXML | Residue labels as Fragment nicknames with external connection points; a link bond with `BeginExternalNum`/`EndExternalNum` on the S; no bracket; no setting; no monomer list | Labels, ports and links. A custom label keeps its atoms, so HELM writes it as inline SMILES | Yes, as today |
| CDX | As CDXML, with Octet's JSON in its own property | As .oct | Yes |
| MOL, SDF, SMILES, InChI, CML | The expanded structure, links as bonds | Atoms | Yes |
| HELM, FASTA (Copy As, MCP read) | J6 | J1 | 1.1.2 reads one chain with no links; it says why for the rest |
| Clipboard | Octet's JSON (brackets, used monomers), CDXML, PDF, SMILES, as for any drawing | Paste keeps brackets and brings the monomers it uses | 1.1.2 pastes with straight brackets |
| PDF, SVG, PNG, EMF, EPS, TIFF, Word | The page as drawn, brackets included | Not read | Not read |

ChemDraw 22.2 opens Octet's CDXML of a bridged label chain and of the same chain as atoms, saves it, and Octet reads
it back with the same InChI (checked with the ChemDraw lock, by script, no screen).

## 9. Limits for hostile input

HELM and field text up to 20,000 characters; up to 50 polymers; up to 1,000 units in a chain and 1,000 in all; up
to 500 links; unit numbers of up to 4 digits; R1 to R3 only; brackets and parentheses nested at most 32 deep; an
inline SMILES up to 2,000 characters and 256 atoms; a code up to 40 characters when read (12 when defined). A
document's monomers: up to 500, each checked as a defined one, read lazily and never added to the user's monomers
by opening a file.

## 10. Cut from 1.2

- HELM base pairs, strand types, annotations, CHEM and BLOB polymers, links on RNA or DNA: each needs drawing that
  is not designed (complementary strands, hairpins, linkers).
- Custom RNA, DNA and CHEM monomers; β-amino acids and ester links as custom monomers (decision 9); natural analogue;
  monomer library files (import, export, URLs, sync, versions).
- A built-in set of common non-natural monomers (Aib, Nle, Orn, Sar, Hyp): each needs checking against the HELM
  library's structure; users can define them.
- The Attachments dialog for a residue with no free link (a notice says so instead).
- Residues per row and the NH2/COOH termini style (ChemDraw's Biopolymer Display): a set number of residues per row
  breaks brackets across rows, and ChemDraw itself does not recommend the termini style.
- One-letter residue labels (Toggle Standard Amino Acid Style) and graphic monomers: a one-letter label is an element
  symbol (C, H, N, S), so it needs monomer shapes, not labels.
- Show Residue ID, Delete closing the gap in a chain, Paste Special > Biopolymer (three-letter text): not in #27's
  ask; listed so they are not forgotten.
- A typed bridge syntax in Octet's words (decision 5).

## 11. Stress list

| # | Case | Expected |
| --- | --- | --- |
| S1 | Oxytocin `PEPTIDE1{C.Y.I.Q.N.C.P.L.G.[am]}$PEPTIDE1,PEPTIDE1,1:R3-6:R3$$$V2.0`, pasted | Field opens with the HELM; Return draws a straight backbone with Cys1 and Cys6 up and a bracket S–S over residues 2 to 5; InChI = oxytocin's; Copy As HELM gives the same string; as labels, one row with a bracket over Tyr–Asn |
| S2 | Vasopressin (CYFQNCPRG-NH2, 1–6) | As S1 |
| S3 | Insulin A and B, three bridges (A6–A11, A7–B7, A20–B19) | Two stacked chains, A above; A7–B7 upright; A6–A11 bracket above A; HELM back unchanged; labels: two rows, the textbook figure |
| S4 | Insulin A alone with its own bridge | One level backbone bond, bracket above |
| S5 | Head-to-tail `PEPTIDE1{R.G.D.[dF].V}$PEPTIDE1,PEPTIDE1,1:R1-5:R2$$$V2.0` | Straight backbone, closing bracket below, D-Phe's hand right (InChI), HELM back unchanged |
| S6 | Lactam K–E (`PEPTIDE1{A.K.A.A.A.E.A}$PEPTIDE1,PEPTIDE1,2:R3-6:R3$$$V2.0`) | Glu's OH leaves; bracket; HELM back unchanged |
| S7 | Two nested and two crossing bridges | Nested on one side, outer higher; crossing on opposite sides; no crossings drawn |
| S8 | A 500-residue chain as HELM, labels on | Draws in under 1 s; an edit elsewhere in the drawing under 100 ms; Copy As HELM gives it back unchanged. With Atoms: "Up to 1,000 atoms. Choose Residue labels." and nothing drawn |
| S9 | A 60-mer (field) | Faster than v1.1.2 (interleaved medians); the same look |
| S10 | 40 paclitaxels and one bridged 30-mer, Clean Up all, then drag one structure | No slower than v1.1.2 on the paclitaxels; perf.check passes |
| S11 | Unknown codes: `PEPTIDE1{A.[Zzz].C}`, `peptide: A[Zzz]C`, `peptide: AXC` | "Octet does not know the HELM monomer [Zzz]." / "Not a monomer: [Zzz]" / "Not an amino acid: X"; nothing drawn |
| S12 | Hostile HELM: 20,001 characters; 2,000 units; 33-deep brackets in an inline SMILES; `99999:R3`; `R9`; `1:R3-1:R3`; R3 on Ala; R1 of residue 3; two links on one R3; `PEPTIDE7` not defined; `CHEM1{…}`; `$` and `{` unbalanced; NUL and `<script>` inside | Each a short problem, no hang (each under 20 ms), no exception reaches the window, quoted input capped at 40 characters |
| S13 | D-amino acids `PEPTIDE1{[dF].[dW].K.T}$$$$V2.0` and `peptide: [dF][dW]KT` | Same structure both ways; labels D-Phe, D-Trp; FASTA FWKT; InChI hands inverted against the L forms |
| S14 | RNA and DNA, one and two polymers, with phosphate ends | As 1.1.2 for one; two drawn as two chains; HELM back unchanged |
| S15 | HELM → atoms → HELM, → labels → HELM, → mixed → HELM, for S1–S6, S13, S14 and a custom monomer | Identical strings |
| S16 | Undo and redo: draw S1, add a bridge by hand to another sequence, Clean Up, switch the setting twice, define and use a monomer | Each one step; undo all gives the empty page; redo all gives the same drawing (deep equal) |
| S17 | Copy a bridged label chain with a custom monomer to another window that does not know the monomer, paste | Same picture, brackets kept, the monomer in the second document, Copy As HELM the same there |
| S18 | Save S3 as .oct, CDXML and CDX; open each; open the .oct in 1.1.2's reader | Same InChI each time; brackets kept in .oct and CDX, straight in CDXML; 1.1.2 opens it with no error, brackets straight |
| S19 | ChemDraw 22.2 opens S1 and S3 (labels and atoms), saves CDXML, Octet reads it | Same InChI; labels kept as labels |
| S20 | Rotate S1 by 37°, flip it horizontally and vertically, at 25% and 800% zoom, in dark mode | The bracket turns and mirrors with the chain, stays clear of the labels, is selectable on each segment, and draws in the ink colour |
| S21 | Delete Cys6's label in S1 as labels; delete one S in S1 as atoms; delete the bracket bond | The link goes with what it needs; the rest stays; Clean Up lays the rest out unbridged; HELM has no connection |
| S22 | Bond tool from Ala to Ala label; from Cys to an atom of another structure | Notice, no change; Cys joined by its S |
| S23 | Typing a 1,000-character HELM in the field one key at a time, and Return pressed five times quickly | The field never waits (each key under 16 ms on the main thread); one structure drawn |
| S24 | MCP: draw S3 by HELM; set_style sequences labels then atoms; define_monomer with no `[*:2]`, with a 13-character code, with a code that exists; read helm | Drawn; converted both ways; each bad call refused with the dialog's message; HELM as Copy As gives |
| S25 | Two AI sessions on one drawing: both draw S1 and both define `[Xyz]`, one with another structure | Two oxytocins, each one undo step; the second different `[Xyz]` refused; the document keeps the first |
| S26 | A document with 500 monomers, some with the user's codes and other structures, opened | Opens; inside it, its own monomers win; the user's monomers do not change |
| S27 | Empty and odd: `peptide: `, `peptide: []`, `PEPTIDE1{}$$$$V2.0`, `$$$$`, a FASTA of one letter | No structure and no problem for the first; a short problem for the rest; one residue for the FASTA |
| S28 | A chain with one residue Octet does not know (a phospho-Ser drawn by hand), setting to Residue labels | That residue stays in full in the row; the rest are labels; InChI the same; HELM writes it as inline SMILES |

## 12. Acceptance list

| Check | Covers |
| --- | --- |
| `src/bridges.check.ts` (new): model, HELM in, builder, layout geometry, brackets, Bond tool, HELM out, timings | J1–J7, S1–S7, S9, S11–S15, S20–S22, S27 |
| `src/sequencestyle.check.ts` (new): the setting both ways, mixed rows, undo | J9, S16, S28 |
| `src/monomers.check.ts` (new): define, refuse, use, files, lookup order | J10, S17, S25, S26 |
| `src/sequence.check.ts`, `src/chain.check.ts`, `src/peptide.check.ts`, `src/nucleic.check.ts` (extended) | J5, J8, S14, S27 |
| `src/file.check.ts`, `src/cdxml.check.ts`, `src/cdx.check.ts` (extended); 1.1.2's `parse` run on the new JSON from a `git archive` of v1.1.2 in the scratchpad | J12, S18 |
| `src/mcp.check.ts`, `src/mcprobust.check.ts` (extended) | J11, S24, S25 |
| `src/perf.check.ts` and a timing check in `bridges.check.ts` (interleaved medians against v1.1.2's path) | S8–S10, S23 |
| ChemDraw 22.2 round trip (lock, script) | S19 |
| `npm run look -- http://localhost:1467/` in WebKit, console read for `look:` errors: the field with HELM, the chip, Settings > Document > Sequences, Settings > Dictionary > Monomers, the Define Monomer dialog, brackets in light and dark at three zooms | J4, J8–J10, S20 |
| Full `npm test`, and `cargo test` in `src-tauri` (the menu item) with `CARGO_TARGET_DIR=…/cargo-g27` | Everything |

## 13. Order of work

1. J1, J2, J8 (model, builder, field), with `bridges.check.ts` started from section 11.
2. J4 (bracket bonds), then J3 (atoms layout), then J5 and J7 (labels, Bond tool).
3. J6 (reader, HELM and FASTA out). Commit: links are done here.
4. J9 (the setting). Commit.
5. J10 (custom monomers). Commit.
6. J11 and J12 checks, ChemDraw round trip, look, full test run, timings.

## 14. As built: where the work differs from the plan, and why

- **A monomer's own SMILES in HELM (J6).** Indigo writes no canonical SMILES, so the same residue drawn as atoms and
  as a label gave two strings. Octet writes such a residue as the structure its standard InChI gives (one structure
  for one InChI), so HELM out is the same string from atoms, labels and mixed chains. A stereocentre may then show an
  explicit [H] in that SMILES.
- **define_monomer for AI apps (J11)** keeps the monomer in the drawing (Mol.monomers), not in the user's settings:
  the MCP cannot reach settings, and a code is looked up in the drawing first. The dialog keeps it in settings, and a
  drawing that draws it keeps a copy, as planned.
- **The Bond tool from a residue to an atom of another structure (J7)** joins only at an R3 whose cap is H (Cys's S,
  Lys's N, Ser's O). Asp's and Glu's R3 lose an OH when linked, so a label would have to drop a kept atom: the notice
  says to expand the label. Between two labels every R3 works, as planned.
- **Wedges after the layout (J2).** Each centre's hand comes from its monomer (centres the SMILES marks @), and the
  wedge is placed as Name to Structure places one (chem.ts placeWedges, now exported as handsDrawn). In a ring that a
  link closes, a backbone bond is a ring bond, so a centre whose side chain starts at another centre (Ile, Thr) gets
  an explicit H with the wedge, as that rule says.
- **The first chain above (J3)** is the chain with the lowest atom number, for a structure drawn by hand too.
- **A lactam's bracket** is level with its bond, not with the backbone: the two link ends are at different heights
  (Lys's side chain is longer than Glu's), and a route is one number relative to the bond (decision 3). The link's
  ends keep the way to the bracket free, so the C=O does not sit on it.
- **Residue labels by default.** A document whose style does not say how sequences show follows the app's last
  choice, as 1.1.2 did; changing it in either place sets the document's style and converts its chains.
- **S19 (ChemDraw 22.2 round trip)** was not run: ChemDraw 22.2 opened no file by script on 17 November (open and
  AppleScript's open both returned with only an untitled document open, likely behind a dialog), and its window is
  not to be driven. The CDXML files are in ~/octet-research/clip-check/issue27 for the next try.

## 15. Finished for 1.1.3 (19 November 2026)

- **Custom monomers (B, J10) are cut.** Structure > Define Monomer…, its Actions menu item, Settings > Dictionary >
  Monomers, the AI apps' `define_monomer` and the monomers a drawing kept (`Mol.monomers`) are gone. The review found
  open problems in them (codes that are residue labels or hold "-", a pasted [Xyz] that means another structure, a
  file's 500 monomers read on the main thread, no look check of the dialog), and the menu item needs a Rust build.
  A peptide's own SMILES in HELM ([*:1] … [*:2]) stays, and must be an α-amino acid (decision 9).
- **A monomer's own SMILES (J6)** comes from the InChI with fixed hydrogens and reconnected metals (`/FixedH /RecMet`),
  not the standard InChI, which moved mobile hydrogens (an amide came back as an imidic acid) and cut metal bonds.
- **A residue label is read by its kept atoms** (InChI against Octet's monomers, kept per residue), never by its text.
- **What a chain is (J6, J9).** A structure drawn wholly as atoms is a chain from three residues, as in 1.1.2, or two
  residues Octet has codes for. A free amino acid, aspartame or lidocaine stays a small molecule. One with a residue
  label is a chain whatever its length.
- **The Bond tool between labels (J7)** still lays the chain out again, but each label keeps its colour, size and font,
  each bond between labels its colour, an expanded residue stays in full, and the chain keeps its scale. Only an amino
  acid's residue label joins by a link; a bond from any other label is drawn as before.
- **A bracket's height** is in bond lengths at the bond's own scale, in the drawing, the hit test, the structure check
  and the marks (hover, selection, eraser, NMR, highlight), which go along the bracket.
- **Renaming a residue label** joined by its side chain is refused with a notice; D labels (D-Phe) take a new name.
- **Three or more chains in one structure** (J3) are read as two, the third as part of a residue written as its own
  SMILES: the HELM is the same compound.


## 16. The last 1.1.3 asks (19 November 2026)

- **FASTA with no ">" line.** A paste that no name or SMILES reads, and that is only residue letters over one line or
  more, opens the field as a FASTA record does: bases (A, C, G, T, U, either case) as DNA or RNA, else the 20 amino
  acids in capitals as a peptide; a * at the end is left out. Anything else (a lower-case protein, X or O, digits,
  dashes, one letter) is not read, so the paste says what it said before. A header still reads as it did.
- **How long a chain draws in full** is set by the builder's 1,000 atoms only. The 60 and 30 caps of 1.1.2 are gone
  from every path (the field, a paste, Name to Structure on a text or label, an AI app). The longest that fit: 249 Gly,
  52 dC, 50 rC or rU; any chain of 71 amino acids, 45 DNA or 43 RNA nucleotides (Trp, dG, rG are the largest). One
  more says "Up to 1,000 atoms. Choose Residue labels." A phosphate is no residue, so 1,000 nucleotides draw as residue
  labels. "peptide:" text is built without OPSIN.
- **Expand Label on every residue label of a chain** lays it out along the straight backbone at the labels' scale
  (chem.ts chainsDrawnOut), as Sequences > Atoms draws it, in the same undo step. A chain with a label left keeps its
  places.
- Stress cases N34 to N36.

## 17. The rest of #27 (19 November 2026, afternoon)

Built on this branch after the 1.1.3 hand-over (5bea9cb), each with its checks: `monomers.check.ts`,
`seqextras.check.ts`, stress cases N37 to N39 and U9, and S19 (ChemDraw 22.2, run by AppleScript, passed).

- **Custom monomers (J10) are back**, with the review's faults mended. A code has 1 to 12 letters, digits or _ (no
  "-", which the field reads as an end) and is no code or residue label of Octet's in any case (Ala, D-Phe, NH2, rA,
  Aib, Boc). A residue is named by its kept atoms, never its text. Contract Label and Copy As HELM try only the monomers
  whose elements (but O and H, which caps add) match the residue (`monomers.ts smilesKey`), so a file's 500 monomers cost
  no time. A built sequence carries the monomers it uses (`Mol.monomers`); `edit.ts withMonomers` merges them into the
  drawing on every insert, paste and Return, the drawing's own code first. .oct, CDXML and CDX keep them in Octet's
  root data. The menu item, the right-click item (its own icon), the dialog and Settings > Dictionary > Monomers are as
  J10 planned. The AI apps' `define_monomer` is not back (the AI apps are off in 1.1.3).
- **HELM monomer libraries.** Settings > Dictionary > Monomers > Export… writes the user's monomers as a HELM library
  (JSON, `[*:n]` SMILES, a cap for each R); Import… reads one (up to 4 MB; `[*:n]` or ChemAxon's `|$…_R1…$|`), keeps
  peptide monomers that are α-amino acids and new codes, up to 500, and says how many it left out. Rust: an
  `import_monomers` command and a "json" export format (left out of `--convert`).
- **Non-natural amino acids**, by the codes that IUPAC and the HELM library (monomerLib2.0) share, each L and checked
  against the library's structure: Abu, Aib, Cha, Cit, Dab, Hcy, Hse, Hyp, Nle, Nva, Orn, Pen, Phg, Sar; R3 on Dab, Orn
  (N), Hcy and Pen (S), as the library has it. FASTA writes the library's natural analogue (Nle L, Orn K) or X.
- **A peptide's ends**: Boc-, Cbz- (Z- reads as Cbz-), Fmoc-, Bz-, Biotin- and -OMe, -OtBu, -OBn, -NHMe, -NHEt, by the
  HELM library's codes ([Boc], [Cbz], [fmoc], [Bz], [-OMe], [OtBu], [-OBn], [NHMe], [NHEt]). Biotin has no library code:
  HELM writes D-biotin's SMILES and Octet reads that back as Biotin. In the field they are typed as words; the two
  choices under the field stay N-acetyl and C-amide. As residue labels an end is a label with its atoms. A dipeptide
  drawn as atoms with such an end stays a small molecule, as aspartame (Asp-Phe-OMe) does.
- **Modified nucleotides**: the library's sugars mR, fR, MOE and LR (LNA) with any base, 5meC on any sugar, and sP. In
  the words a modified nucleotide is its label in brackets ([mA], [fU], [moeG], [LT], [d5mC], [r5mC]) and * between two
  nucleotides is a phosphorothioate. A modified sugar goes with ribose or 2-deoxyribose (gapmers); ribose and
  2-deoxyribose still not together. The chain reader finds an LNA's C5' by its O5', which bonds to no ring atom.
- **Structure > Sequence** holds Peptide…, DNA… and RNA… in place of the three Insert items. Settings > Keyboard
  shortcuts lists them under Structure › Sequence and the Sequence tool under Tools, with no default key (ChemDraw has
  none).
- **A drawn chain back in the field**: the Sequence tool's click on a chain, or Structure > Sequence with a chain
  selected, opens the field with its sequence (words, or HELM), and Return draws the field's text in its place
  (`helm.ts inPlaceOf`): centre, scale, caption and group kept, one undo step. A residue is put in or taken out by typing.

Cut, for a later stage: deleting a residue on the page closing the gap (ChemDraw's Removing Residues), a menu of ends
under the field, renaming a residue label to a non-natural or user's code, custom RNA/DNA monomers, the AI apps'
`define_monomer`, and Schramm's display asks (residues per line, termini style).

## 18. Review fixes (19 November 2026, evening)

Each with its check: stress cases N41, N42 and U11, `nicknames.check.ts` and `monomers.check.ts`.

- **A chain opened in the field and changed before Return** (the Residue labels chip, an undo, a move) is found again
  (`helm.ts markChain`, `chainAgain`): its own atoms while they are drawn as they were, else the structure with the
  same sequence nearest to where it was. Return draws one structure in its place. A chain that is gone gives way to a
  new one, placed as any name is, with no notice. Settings takes the focus, so the field closes and nothing more is
  drawn.
- **A peptide's Ac, OH and NH2 end labels** keep no atoms. In a structure with residue labels they are read by their
  place as Octet's ends (`sequence.ts chainEnds`), never by the user's nicknames: in the InChI, Expand Label and CDXML.
  Define Nickname refuses Octet's end and residue labels (OH, NH2, Boc, OMe, Ala, D-Phe, Aib, rA). A nickname an older
  Octet kept stays in the settings and still reads on a label that is no chain's end.
- **Import… of a HELM library** keeps only monomers Octet can use (`seqbuild.ts usableMonomer`: an α-amino acid whose
  SMILES reads whole, each atom an element), asked of at most 2,000; the rest are counted as left out.
- **One nucleotide as a residue label** is a chain, as one amino acid is: HELM, FASTA and the field's words.
- Define nickname… is in every right-click menu that has Define monomer…. The command palette names the items of
  Structure > Sequence Peptide sequence…, DNA sequence… and RNA sequence…. The Define monomer dialog says when the
  drawing has its own monomer by that code, which comes first in that drawing.
