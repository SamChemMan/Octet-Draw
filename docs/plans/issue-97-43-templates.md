# Cyclodextrins, cucurbiturils and the energy transfer arrow (issues 97 and 43)

Branch `item/97-43-templates`, cut from `release-1.2-mcp` at b30f413. For release 1.2 (Friday 20 November 2026).
Plan written 17 November 2026.

## What is there and what is missing

Read on this branch.

- **Supramolecules set (issue 97).** 15 templates: crown ethers, cryptands, cyclen and cyclam from their names
  (`tools/library/build.mjs:116-126`), then calix[4]arene, p-tert-butylcalix[4]arene, pillar[5]arene and
  [2.2]paracyclophane drawn from geometry (`tools/library/hosts.mjs:138-143`), joined at `build.mjs:404`. No
  cyclodextrin and no cucurbituril. Decision 0017 says why they were left out in 1.1.2
  (`docs/decisions/0017-template-library-sets.md:203-205`): neither a flat layout nor a simple 3D build gave a clear
  drawing. Sam's comment on #97 (13 November) lists them as not done.
- **Photochemistry set (issue 43).** 17 templates in `tools/library/photochem.mjs:91-109`. The transitions are
  `transition()` arrows (`photochem.mjs:48-55`), each 2.165 bond lengths (`photochem.mjs:14`). No energy transfer
  arrow; 0017 lists it as not done (`0017:191`), and so does Sam's comment of 13 November. The energy-level object
  (#43's last part) is planned on `item/43-energy-levels` (`docs/plans/issue-43-energy-levels.md` there), which says
  this branch owns the template set and its energy transfer arrow.
- **#43's list checked again.** Every transition and species it asks for is in the set but energy transfer.
  Absorption is a straight arrow and intersystem crossing a wavy one (IUPAC: radiative straight, radiationless wavy),
  as 0017 decided; the wavy hν arrow #43 asked for is the Light template. Nothing else is missing.
- **The app needs no change to show new templates.** The library panel lists and searches every set from the data
  (`src/TemplateLibrary.tsx:335`: name, set or also words, any case). View > Templates and the command palette list
  every item (`src/Editor.tsx:765`, `:8086`). The MCP's `place_template` looks in the whole library by name or by an
  also word (`src/mcp.ts:2574-2597`). Sets past 1.1's load after start from `src/library-more.json`
  (`src/library.ts:55-68`), so `src/library.json` (read at start) does not change.
- **The build is reproducible today.** `node tools/library/build.mjs --keep-shipped` run on this branch gives
  `src/library.json` and every set of `src/library-more.json` byte for byte (checked 17 November). The library data
  has not changed since v1.1.2 (`git diff v1.1.2` is empty for both files).
- **Checks that name these sets.** `src/photochem.check.ts:15-17` lists the Photochemistry set's names in order.
  `src/templates.check.ts` checks every template: it parses (`:372-378`), its labels are clear (`:385`), a template
  with CIP labels has a reference compound (`STEREO`, `:483`), Structure to Name names it or it is in `UNNAMED`
  (`:551`), and Clean Up keeps it (`CROWDED`, `:578`).

The gap is real: 7 host templates and 1 arrow.

## ChemDraw cross-check

Sources: Octet's notes on ChemDraw 26.1 in `~/octet-research/notes` (`template-sets-inventory.md`,
`chemdraw26-inventory.md` 3.9 and "Templates ▸", `chemdraw-inventory.md`, `help26/text/Templates.txt` and
`Tutorial_7_Templates.txt`), decision 0017, and the ChemDraw 22.2 file test of 17 November in
`docs/plans/issue-43-energy-levels.md` on `item/43-energy-levels`.

- **Supramolecules set.** ChemDraw 26.1 ships one (30 templates, none named; `template-sets-inventory.md`). Three of
  them are α-, β- and γ-cyclodextrin with every O drawn. None is a cucurbituril. So Octet's set will have everything
  ChemDraw's has here, and the cucurbiturils, calixarenes and pillararene on top.
- **Template tool.** Click empty space to place, click an atom or a bond to fuse: Octet has both. Click and drag to
  turn the template as it goes down (help, Templates): Octet places at a click only. Option changes the size while
  placing: Octet has not. Both are Template tool features, not template data (scope cut 2 and 3).
- **A template's name.** ChemDraw's Annotate gives a template a name shown on hover. Octet's templates have a name and
  search words.
- **Colours.** ChemDraw templates keep their own colours. These templates have none, as every Octet structure
  template, so they take the document's ink and follow dark mode.
- **The placed objects.** A placed host is an ordinary structure and the arrow an ordinary arrow with text on it, so
  every Object, Curves, Color and Text menu option and context menu item ChemDraw gives a structure or an arrow applies
  as it does now. For arrows ChemDraw has plain, dashed, bold and wavy lines, full and half heads, three head styles
  and three sizes; Octet has each (0017 and the item/43 plan).
- **CDXML.** Structures: `fragment`, `n` (`Element`, `p`, `NumHydrogens`), `b` (`Order`, `Display` `WedgeBegin` and
  `WedgedHashBegin`). The arrow: `arrow` and the legacy `graphic` with `LineType="Wavy"`, `ArrowheadHead="Full"`,
  `ArrowheadType="Solid"`; its text a `t` with `s` runs. ChemDraw 22.2 opened Octet's wavy arrows on 17 November and
  kept `LineType="Wavy"` and the heads; it dropped Octet's own attributes, so the text's tie to its arrow does not
  come back from a file ChemDraw saved.
- **Photochemistry.** ChemDraw has no photochemistry set and no energy transfer arrow (0017, #43).
- **Keys.** ChemDraw has no key for any of these. Octet adds none.

Octet gets every option ChemDraw gives these templates but the two Template tool features above, which are in the
scope cut.

## Jobs

Each job is done only when its last line holds.

- **J1. Energy transfer.** A template "Energy transfer" in Photochemistry, after "Internal conversion": a horizontal
  wavy arrow with a full head, 2.165 bond lengths (the set's `L`), with "EnT" above it as its conditions, no colour,
  width, size or font of its own. Also words: `EnT, ET, triplet energy transfer, TTET, sensitisation, sensitization,
  Dexter, Förster, FRET, radiationless transition, wavy arrow, Jablonski`.
  *Done:* `photochem.check.ts` lists it and checks it as the other transitions (style, head, length, text, Interpret
  Chemically adds no atoms, placed whole, back the same from CDXML, CDX and .oct), and `place_template` places it by
  "Energy transfer" and by "EnT".
- **J2. Cyclodextrins.** α-, β- and γ-cyclodextrin in Supramolecules, after [2.2]paracyclophane.
  *Done:* each one's InChI, stereo included, is the reference made from first principles in the build and is
  PubChem's standard InChI (CID 444913, 444041, 5287407); formula C36H60O30, C42H70O35, C48H80O40; monoisotopic mass
  within 0.001 Da of PubChem's; the drawing keeps the rules R1 to R7; Structure to Name gives each a name that reads
  back to it; Clean Up keeps its stereo and InChI.
- **J3. Cucurbiturils.** Cucurbit[5]uril to cucurbit[8]uril in Supramolecules, after the cyclodextrins.
  *Done:* each one's InChI is PubChem's standard InChI (CID 6096206, 196163, 6096207, 16133299), its formula
  (C6H6N4O2)n, mass as J2; the drawing keeps R1 to R7; Structure to Name gives no name (in `UNNAMED`, as the cages).
- **J4. Data.** `node tools/library/build.mjs --keep-shipped`.
  *Done:* `src/library.json` is byte for byte the same; in `src/library-more.json` the only changes are the 7 new
  Supramolecules items at the end of that set and the 1 new Photochemistry item; every other item of every set is
  byte for byte the same (a script compares set by set, item by item, and its output goes in the commit message).
- **J5. Checks.** A new `src/hosts.check.ts` for J2 and J3, the lists in `templates.check.ts` and
  `photochem.check.ts`, and one line in `mcp.check.ts`.
  *Done:* each new check run alone passes; the full `npm test` passes (162 of 162 files, the base has 161 of 161).
- **J6. Words.** Decision 0017: Supramolecules 22, Photochemistry 18, and the two "not done" lines taken out. The
  What's New lines go back to the session that writes the notes (not into `src/releases.ts` or
  `docs/release-notes`).
  *Done:* 0017 says what the sets hold; the lines are written from the user's action, in STE.
- **J7. Outside checks.** ChemDraw 22.2 round trip, Octet 1.1.2 opening the files, the speed measurements and the
  library panel in WebKit, in light and dark.
  *Done:* each result is in the acceptance table below, with the number measured.

## Rules every part keeps

- **R1. Exact chemistry.** A host's InChI is two references, each made without the other: the build's (from OPSIN
  names and hand-written structure) and PubChem's standard InChI, copied by hand into the check with its CID (as
  `src/macrocycles.check.ts` does for phthalocyanine). The formula is exact.
- **R2. Octet's own drawing.** Every place is worked out from geometry in `tools/library/hosts.mjs`. Nothing comes
  from ChemDraw's templates or any other program's files, and no coordinates come from PubChem: PubChem gives only the
  InChI the check compares with.
- **R3. The set's style.** Bond length 1 (the median), centred, flat (no depth), every heteroatom an element label
  (no CH2OH text label), no colour, width or font of its own: as calix[4]arene and pillar[5]arene are drawn.
- **R4. Clear.** No clash (`tools/library/clashes.mjs`, as Octet draws it at the default style). Not messy
  (`src/check.ts` `messy`: every bond 0.75 to 1.3 of the median, no two bonds crossing, no two atoms within 0.35), so
  the Actions panel does not offer Clean Up for a template as placed. No two labelled atoms that are not bonded closer
  than 1.0 bond length.
- **R5. Symmetric.** Every unit is the same drawing turned by 360°/n about the middle.
- **R6. Stereo as chemists read it.** Wedges and hashes only on bonds out of a ring, the narrow end at the
  stereocentre and the wide end never at another stereocentre (ChemDraw marks a wedge between two stereocentres).
  Octet's checks show no warning for the template as placed.
- **R7. Found by any name a chemist types.** In the library search and in `place_template`. One general word picks
  the commonest member: "cyclodextrin" is β-cyclodextrin, "cucurbituril" is cucurbit[6]uril (the first one made, and
  what the word meant before the homologues).
- **R8. Nothing else changes.** No other template, and no app code: the change is template data, its build, checks and
  docs. `src/mcp.ts` does not change.

## Design

**D1. Cyclodextrins flat, round a polygon, as pillar[5]arene is drawn.** Each glucose is a regular hexagon along a
side of an n-gon, its C1 and C4 at the two ends, the glycosidic O outside each corner. C2 and C3 (the secondary OH)
point out; O5 and C5 point in, with C6 and its OH inside. Why: the cone is wide at the secondary rim and narrow at the
primary rim, so seen from the wide rim the CH2OH groups are the inner ring, as drawn. The other way round, the 2n
secondary OH crowd the middle and two neighbours' OH meet (worked out for α: 0.14 bond lengths apart). The prototype
(17 November) has no clash, every bond 1.00 to 1.11, and is not messy, for n = 6, 7 and 8. Indigo's layout with Clean
Up was tried first: it is irregular and its inner OH labels touch.

**D2. Cyclodextrin stereo picked, not typed.** The build tries all 32 ways of putting a wedge or a hash on the five
bonds out of each ring (C1–O, C2–O2, C3–O3, C4–O, C5–C6, the same on every unit) and keeps the one whose InChI is the
reference; it fails if not exactly one is. The prototype found exactly one for each size. The drawing is turned over
(mirrored, the wedges then picked again) so that each glucose reads as its Haworth projection does: C1–O hashed (α),
C2–O2 hashed, C3–O3 wedged, C4–O hashed, C5–C6 wedged. The build fails if the picked way is not that one.

**D3. The cyclodextrin reference from first principles.** OPSIN reads the linear chain
`α-D-glucopyranosyl-(1→4)-…-α-D-glucopyranose` (n units). The build closes it in SMILES: a ring bond from the first
unit's O4 takes the place of the last unit's anomeric OH, written where the OH was, so each stereocentre's neighbour
order and @ or @@ stay. The prototype's InChI from this equals PubChem's for all three. The check holds PubChem's
three InChIs too, so a fault in either reference shows.

**D4. Cucurbiturils flat and concentric.** The CB[n] graph has one flat drawing that keeps its symmetry: the two
portals as two rings, one inside the other. Each glycoluril is drawn as chemists draw glycoluril (two five-membered
rings sharing the CH–CH bond), that bond along the circle, one urea ring and its C=O outside, the other and its C=O
inside, the CH2 bridges joining neighbours on both rims. The inner ring is drawn smaller, as the far portal looks from
above, because the inner rim is shorter than the outer by 2π × 1.9 / n bond lengths (2.0 for CB[6]) with the same
number of bonds. Why not 3D: built in 3D and seen from the best of every angle, CB[5] to CB[8] still had 8 to 22
label clashes and could not be read. Why not Indigo: its layout of CB[6] has crossing bonds. Why not a bracketed
repeat unit: that is a polymer to Octet, so its InChI, name and SMILES would be wrong.

**D5. Cucurbituril geometry by search, with limits.** The prototype with regular pentagons is clear of clashes for
n = 5 to 8 with the inner ring at 0.7 to 0.8, but its outer bridges come out straight (a 180° N–CH2–N reads as one long
N–N bond) and its bonds reach 1.35 (messy). So the build searches, for each n, the circle's radius, the inner ring's
size, and how far the outer urea ring's N atoms splay along the circle (which shortens the outer gap), and keeps the
drawing that meets every limit: R4, every bridge angle at CH2 150° or less, every ring angle within 25° of a regular
pentagon's. Fallback, decided by the check and not by eye: a size whose outer bridges cannot bend within the limits
shows those bridge carbons as CH2 (a shown carbon), which reads right when straight. Either way the chemistry is the
same.

**D6. No wedges on a cucurbituril.** Its 2n methine CH pairs are cis-fused, every H out. PubChem's standard InChI for
CB[5] to CB[8] has no stereo layer, and papers draw it without wedges; 4n wedges would bury the drawing. A flat
drawing does not tell CB[n] from the inverted iCB[n], and neither do those records.

**D7. The first atom.** Placed on an atom, a template's first atom becomes that atom (`edit.ts:2604-2608`). A
cyclodextrin's first atom is the top unit's O6, so a click on an atom puts the cyclodextrin there through C6: the
6-substituted cyclodextrins are the ones chemists make most. A cucurbituril's first atom is a methine carbon, as the
other hosts' first atom is a ring atom.

**D8. Energy transfer is a transition arrow, not a reaction arrow.** It is a photophysical step between two species
or states, drawn as intersystem crossing is: a wavy line with a head (radiationless, IUPAC). A reaction arrow would
make Octet read the species round it as a reaction and Clean Up Reaction would move them. "EnT" is the photocatalysis
literature's mark for energy transfer, apart from ET or SET (electron transfer). It is ordinary conditions text, so the
user can type another label.

**D9. Names and search words.** In the set's style (Calix[4]arene, Pillar[5]arene, α-D-Glucopyranose):

| Name | Also |
| --- | --- |
| α-Cyclodextrin | alpha-cyclodextrin, α-CD, alpha-CD, cyclomaltohexaose, cyclohexaamylose |
| β-Cyclodextrin | cyclodextrin, beta-cyclodextrin, β-CD, beta-CD, cyclomaltoheptaose, cycloheptaamylose |
| γ-Cyclodextrin | gamma-cyclodextrin, γ-CD, gamma-CD, cyclomaltooctaose, cyclooctaamylose |
| Cucurbit[5]uril | CB[5], CB5 |
| Cucurbit[6]uril | cucurbituril, CB[6], CB6 |
| Cucurbit[7]uril | CB[7], CB7 |
| Cucurbit[8]uril | CB[8], CB8 |

The library search finds every one by "cyclodextrin", "cucurbit" or "CB[", as it matches part of a name.

**D10. Order.** New items go at the end of Supramolecules and after Internal conversion in Photochemistry. Nothing
that is there moves within its set. A template kept in the Ring strip is kept by name, so it stays.

**D11. Build code.** `hosts.mjs` gets `flatCyclodextrin(n)` (the drawing for every wedge way) and
`flatCucurbituril(n)`; the build picks the cyclodextrin's way with its `picker` (`build.mjs:208-216`) given the
reference SMILES of D3, and adds the 7 entries after `HOSTS` at `build.mjs:404`. `photochem.mjs` gets one
`transition()` line. The prototypes are in the session's scratch folder, not in the repository.

## Siblings (consistency pillar)

A host is a structure and the arrow is an arrow, so each takes what every structure or arrow takes. Each row is
checked for the new templates as stated.

| Where or what | Check |
| --- | --- |
| Template tool: click on empty space, on an atom, on a bond | `hosts.check.ts` (S1, S4, S5) |
| Ring strip: kept, then drawn once the later sets load | browser preview (S21) |
| Library panel: the set, the search, the thumbnail, light and dark | browser preview and `npm run look` (S13, S18) |
| View > Templates, command palette | browser preview: both list the new items |
| Copy a built-in into My templates; save that set as a ChemDraw template file and read it back | `hosts.check.ts` (S22) |
| Template button icon (shows the books for a large template) | `hosts.check.ts`: `legible` is false for each host |
| MCP `place_template` | `mcp.check.ts` (S19, S20) |
| Select, ⌘A, Space (whole structure), move, nudge | browser preview on the dev server |
| Rotate, Flip Horizontally and Vertically, Scale | `hosts.check.ts` (S6, S7) |
| Align, Distribute, Duplicate, Group | browser preview |
| Colour, highlight, ring fill | `hosts.check.ts`: colour on a host and on the arrow and its text comes back from .oct and CDXML |
| Undo and redo | `hosts.check.ts` (S2), one step per placing |
| Copy, cut, paste, in one window and into another | `hosts.check.ts` through Octet's clipboard text and CDXML (S9) |
| Delete (all, one atom, the arrow) | `hosts.check.ts` (S8) |
| Clean Up structure | `templates.check.ts` and S23 |
| Structure to Name, Analysis (formula, masses), Check (warnings) | `templates.check.ts`, `hosts.check.ts` |
| .oct, CDXML, CDX, MOL V2000 and V3000, SDF, SMILES, InChI | `hosts.check.ts` (S10) |
| PDF, PNG and SVG export, clipboard pictures | browser preview: Export dialog shows each; nothing new is drawn |
| Dark mode | browser preview in dark (S13) |

## MCP

- No code change. `place_template` already looks in every set by name, by an exact also word, and with `set` and `on`
  (`mcp.ts:2574-2597`). `read` reports each placed host's formula as for any structure.
- Its description names examples (ATP, ferrocene, Round-bottom flask); it does not need the new names, and another
  session is reviewing that file, so it stays.
- `mcp.check.ts`: the loop at line 2177 that places one template from each later set gets `["β-Cyclodextrin",
  "Supramolecules"]`, `["Cucurbit[7]uril", "Supramolecules"]` and `["Energy transfer", "Photochemistry"]`; the
  words "cyclodextrin", "cucurbituril" and "EnT" are placed and give β-Cyclodextrin, Cucurbit[6]uril and Energy
  transfer. That is the whole MCP change.

## Files

| Format | What goes in | Octet 1.1.2 opening it | ChemDraw |
| --- | --- | --- | --- |
| .oct | atoms, bonds, wedges; an arrow with `style: wavy` and text on it | the same (no new attribute) | n/a |
| CDXML | `fragment`, `n`, `b` with `WedgeBegin` and `WedgedHashBegin`; `arrow` with `LineType="Wavy"`, `t` | the same | opens; keeps structures and wavy arrow; drops the text's tie to its arrow (as for the 1.1.2 set) |
| CDX | the same as binary | the same | opens (checked through ChemDraw 22.2) |
| MOL, SDF | V2000 and V3000 with wedges | the same | n/a |
| SMILES, InChI | the structure, stereo for the cyclodextrins | the same | n/a |
| Clipboard | Octet's text, PDF with CDXML, CDX, MOL, SMILES, as for any structure | pastes | pastes |
| PDF, PNG, SVG, EMF | as drawn | n/a | n/a |

No parser changes, so the hostile-file surface does not change. No new dependency.

## Stress list

Expected results. "As 1.1.2" means the same code path gives the same behaviour it gives Pillar[5]arene or
Intersystem crossing today, checked side by side.

1. **Empty page, the largest one.** γ-Cyclodextrin (88 atoms) placed by a click: one structure, InChI the reference,
   no warning, not messy, one undo step.
2. **Undo and redo chain.** Place Cucurbit[8]uril, rotate 30°, flip, colour it red, delete one CH2; undo five times:
   the empty page; redo five times: the drawing before the undos, equal in every atom, bond and colour.
3. **Fast repeated clicks.** 20 clicks with the Template tool 0.5 bond lengths apart: 20 undo steps, no exception, no
   coordinate that is not a number. A click that lands on an atom or bond of the last host fuses, as 1.1.2.
4. **On an atom.** β-Cyclodextrin clicked onto methanol's O: one structure C43H72O35, InChI that of
   6-O-methyl-β-cyclodextrin built by SMILES (D7).
5. **On a bond, mirrored.** β-Cyclodextrin on a C–C bond of cyclohexane, on the side that makes Octet mirror it:
   wedges swap (`edit.ts:2639-2640`), and every stereocentre the host brings keeps its CIP label.
6. **Flip.** Flip Horizontally on β-cyclodextrin gives its mirror image (InChI `/m0`, as ChemDraw's Flip does); a
   second flip gives the InChI back exactly.
7. **Rotate.** 37°, 90° and 180° (Rotate dialog and Option + arrows): InChI the same, still not messy.
8. **Delete what it depends on.** (a) One glycosidic O of β-cyclodextrin: one open chain C42H72O34, the other 33
   stereocentres keep their CIP labels, no wedge left without a stereocentre at its narrow end, undo restores it.
   (b) The Energy transfer arrow alone: its EnT text does what Intersystem crossing's ISC does in 1.1.2.
9. **Copy and paste.** β-Cyclodextrin copied and pasted 10 times in its window and once into a second window (Octet's
   clipboard text and CDXML): each paste's InChI the reference, new ids, one undo step each.
10. **Round trips.** All 7 hosts and Energy transfer through .oct, CDXML, CDX, MOL V2000, MOL V3000, SDF, SMILES and
    InChI as far as each format goes: same InChI; places within 0.01 and wedges through .oct, CDXML and CDX; the arrow's
    kind, wave, head, text runs and tie to its arrow through .oct, CDXML and CDX.
11. **ChemDraw opens our files.** One CDXML and one CDX holding all 8, opened by ChemDraw 22.2 and saved by it as
    CDXML (file commands only, no screen control, with the lock): back in Octet, each host's InChI the same, the
    arrow wavy with its head, EnT present as text.
12. **Octet 1.1.2 opens our files.** The 1.1.2 sources (`git archive v1.1.2`) read the .oct and CDXML of stress 10:
    the same InChI for each host, the same arrow and text.
13. **Dark mode.** The 8 templates on the page and in the library's thumbnails are in the dark theme's ink; wedges
    and hashes show.
14. **Zoom extremes.** γ-Cyclodextrin and Cucurbit[8]uril at 25% and 800%: drawn, labels in place, no number that is
    not finite.
15. **A big drawing.** 40 paclitaxels, then γ-cyclodextrin placed: the time to place and draw is no more than
    placing Pillar[5]arene in the same drawing on the base, measured as the median of interleaved runs (same code,
    so this measures the data).
16. **A 500-residue peptide** (about 4,000 atoms), then β-cyclodextrin: as stress 15.
17. **Many hosts.** 50 β-cyclodextrins pasted, ⌘A, a drag: the drag's frame time is no more than with 50
    Pillar[5]arenes on the base, measured the same way.
18. **Library search.** "cyclodextrin": the 3 cyclodextrins. "beta-cyclodextrin": β only. "CB[": the 4
    cucurbiturils. "cucurbituril": the 4. "[6]": Cucurbit[6]uril. "EnT" and "energy transfer": Energy transfer.
    "energy": Energy transfer and the Jablonski diagram.
19. **MCP with bad arguments.** `place_template` with name "", "   ", "CB[9]", 10,000 characters, a right name with
    `set: "Photochemistry"`, or `on: "s99.1"`: an error that names what was wrong, the drawing unchanged, no undo step.
20. **Two AI sessions.** Two `place_template` calls sent at once: both placed, two undo steps, different ids, neither
    on top of the other.
21. **Ring strip.** γ-Cyclodextrin kept in the Ring strip, the window reloaded: the strip shows it (the books) once
    the later sets load, and a click places it.
22. **Saved as a ChemDraw template file.** γ-Cyclodextrin and Cucurbit[8]uril copied into My templates and saved as
    .ctp: both written (each under `MOST_TEMPLATE`), both read back whole.
23. **Clean Up on each host.** The cyclodextrins keep stereo and InChI, the cucurbiturils their InChI; tidy after, or
    listed in `CROWDED` with the reason; undo gives the drawing back exactly.
24. **Energy transfer turned and flipped.** Rotated 90° and flipped: EnT stays on its arrow and upright; the wave and
    head stay; undo.
25. **Energy transfer beside a catalytic cycle.** Placed next to a cycle's arc: as the Light template in 1.1.2.
26. **Structure to Name.** β-Cyclodextrin gets its checked von Baeyer name, read back by OPSIN to its structure;
    a cucurbituril gets none and no wrong name.
27. **Background naming cost.** After a host is placed, Octet names it once in the background for screen readers
    (`Editor.tsx:6216-6221`). Measured in node on 17 November: β-cyclodextrin 197 ms, Pillar[5]arene (in 1.1.2)
    166 ms, paclitaxel 55 ms. Expected: one pause of that size per new shape, never per frame; measured again in the
    app and reported (moving naming off the main thread is scope cut 6).

## Acceptance

| Check | Covers |
| --- | --- |
| `node src/hosts.check.ts` (new): references (build and PubChem), formula, masses, R3 to R7 on the drawings, D2's Haworth way, D7, placing, undo, clipboard, round trips | J2, J3, stress 1 to 10, 22, 23 |
| `node src/templates.check.ts` with the 3 cyclodextrins in `STEREO` (their reference SMILES), the 4 cucurbiturils in `UNNAMED`, and `CROWDED` as Clean Up finds | J2, J3, stress 23, 26 |
| `node src/photochem.check.ts` with Energy transfer in its list and in its transition checks | J1, stress 8b, 10, 24 |
| `node src/mcp.check.ts` with the lines in "MCP" and stress 19 and 20 | J1 to J3, stress 19, 20 |
| `node src/lab.check.ts` unchanged and passing (Supramolecules and Photochemistry stay out of clip art) | R8 |
| Scratch script: build, then compare `library.json` and `library-more.json` with the base set by set, item by item | J4, R8 |
| ChemDraw 22.2 by file commands, with the lock: CDXML and CDX in, CDXML out, read back | stress 11 |
| `git archive v1.1.2 src` in scratch, its readers on our .oct and CDXML | stress 12 |
| Scratch bench: medians of interleaved runs, base against branch, each run again alone before any call of a regression | stress 15 to 17, 27, and the load of `library-more.json` |
| Dev server on port 1464 in the browser preview: library panel, search, Ring strip, View > Templates, command palette, ⌘A, Align, Duplicate, export, light and dark, 25% and 800%; console clean | stress 13, 14, 18, 21, 25, siblings |
| `npm run look -- http://localhost:1464/` | no control changes (none should) |
| Full `npm test` | everything |

## Order of work

1. J1 (one template, one check change).
2. J2: hosts.mjs drawing, build, `hosts.check.ts` part one, `templates.check.ts` lists.
3. J3: the search of D5 and its limits; if a size needs D5's fallback, the check says which.
4. J4, then J5's MCP line and the full checks.
5. J7, then J6.

Small commits, one per job where it stands alone.

## Scope cut

1. **The energy-level diagram object** (#43's last part): `item/43-energy-levels` owns it.
2. **Drag to turn a template while placing it** (ChemDraw's Template tool): a Template tool change for every
   template, not template data.
3. **Option to size a template while placing it** (ChemDraw): the same.
4. **More hosts:** inverted cucurbiturils (iCB[n]), CB[10], substituted cyclodextrins (hydroxypropyl-β-CD,
   methyl-β-CD), decamethylcucurbit[5]uril. Not asked for; each needs its own drawing and reference.
5. **Hosts in 3D** (the cyclodextrin cone, the cucurbituril barrel): the 3D cucurbituril had 8 to 22 label clashes
   at its best view; the flat drawings are clear.
6. **Structure to Name off the main thread** for large rings: the background name of a cyclodextrin takes 200 to 350
   ms, as Pillar[5]arene's 166 ms does in 1.1.2. A separate speed item.
7. **Name to Structure for "β-cyclodextrin" or "cucurbit[7]uril" typed in the Name box:** OPSIN reads neither name.
   The library search finds both.
8. **The repeat-unit drawing of CB[n]** (a glycoluril in brackets with n): Octet would read it as a polymer.
