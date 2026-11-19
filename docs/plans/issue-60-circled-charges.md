# Circled charges: a document option and a free charge with a number (#60)

Issue #60 (swaldvoge-eth), with the same request from spirokai and swaldvoge-eth in #164. Sam's comment of 13
November lists two parts as not done:

- A. An option that makes + and − give circled charges.
- B. A free circled charge with a number (2+, 3−).

Branch `item/60-circled-charges`, cut from `release-1.2-mcp` at b30f413, for 1.2 (Friday 20 November) if Sam says
yes. This is the second plan (18 November). The first plan (7708109) was built on 17 November. Since then the 1.2
bug-fix session built free symbols for #164 on `fix/164-free-charges`, now in `fix/1.2-bugs-int` (75e3932, local,
waiting for Sam). Part B on this branch and that work are the same object built twice. This plan moves Part B onto
the #164 free symbol and keeps Part A.

## Where it stands (18 November)

### On this branch (8 commits, 7708109 to 9ba26d3)

Part A, built and checked:

- `DocStyle.circled`, off by default (`docstyle.ts:63-66`), read at `docstyle.ts:203`, in Octet's CDXML root data
  (`cdxml.ts:1187`, read at `cdxml.ts:1422`). Settings > Document > Style has the switch Circle new charges
  (`SettingsWindow.tsx:529`).
- Charges stop at −8 and +8 (`edit.ts:421-422`). A charge from 0 takes the option, a charge that is there keeps its
  look, and at 0 the look goes (`chargeLook`, `addCharge`, `edit.ts:425-431`; the Symbols tool at `edit.ts:449`).
- Every route passes the option: the keys on a selection and under the pointer (`Editor.tsx:6006-6007`, `6076`), the
  Actions panel (`Editor.tsx:8162-8163`), Atom Properties (`Editor.tsx:11309`), the MCP (`mcp.ts:1745-1753`,
  `mcp.ts:2330-2332`).
- Circle the charge: `circleCharges` and `chargesOf` (`edit.ts:483-495`), the command `charge.circled` with no key
  (`keys.ts:41`), Actions items (`Actions.tsx:378`, `430`, `540`).

Part B, built as a shape of kind `"charge"` (`render.ts` ShapeKind, `edit.ts:499-526`, `cdxml.ts` group writer and
`readChargeGroup`, `mcp.ts:2438-2442`, `mcp.ts:2542`). It has the number (2+ to 8+, 2− to 8−), stepping by keys and
by the Symbols tool, and an integral group in CDXML.

Checks: `circledcharges.check.ts`, `freecharge.check.ts`, `chargespeed.check.ts` pass.
`circledcharge-stress.check.ts` runs 43 cases and 11 fail (S27, X1, X2, X3, X5, X6, X7, X8, X9, X12, X13; see the
commit message of 9ba26d3). The full `npm test` fails on that file. `experiment.check.ts` failed once on a timing
under load in the same run.

### On fix/1.2-bugs-int (fix/164-free-charges, 149236d to 70ef01a)

- A free symbol: shape kind `"symbol"` with `symbol` one of plus, minus, circledPlus, circledMinus, radical, pair,
  bar, radicalCation, radicalAnion (`render.ts:409-430` on 75e3932). Its box is its ink (`SYMBOL_BOX`, `symbolInk`
  at `render.ts:2486`). It turns, sizes as text, colours, groups, aligns and deletes as a shape.
- The Symbols tool clicked away from an atom or bond places one (`Editor.tsx:8928`). A click on a free symbol gives it
  the tool's kind.
- The Actions panel shows its nine kinds and its size (`Actions.tsx:986`).
- CDXML and CDX: a lone Symbol graphic with no `represent` (`cdxml.ts:442`). An unlinked sign, radical ion or
  electron reads as a free symbol (`cdxml.ts:2515`).
- A free symbol by a structure or its brackets belongs to it (`mixtures.ts:14` symbolOwners). Clean Up Reaction moves
  it with the structure. A free plus away from structures is a reaction plus (`reaction.ts:31`).
- MCP: `shape` kind symbol, `edit` symbol, size, colour, box, turn, scale, `read` gives the kind
  (`mcp.ts:2611` addFreeSymbol).

It has no number, no + or − key on a free symbol and no Circle new charges. Its atom charge keys have no ±8 limit.

### The collision

`git merge-tree` of 9ba26d3 and 75e3932 conflicts in 10 files: `Actions.tsx`, `Editor.tsx`, `access.ts`, `cdxml.ts`,
`edit.ts`, `file.ts`, `keys.ts`, `kinds.ts`, `mcp.ts`, `render.ts`. Both make a free charge from the same Symbols tool
click and both read the same CDXML symbols. Two shape kinds for one thing cannot both ship.

### A fault in fix/164's CDXML, found on this branch

On 17 November ChemDraw 22.2 opened two Octet files and saved them again:

- A lone CirclePlus 1.4 bond lengths from an Fe atom: ChemDraw moved the symbol into the fragment, linked it to the
  node and gave Fe a charge of +1. Symbols 3 or more bond lengths away stayed free.
- The same symbol in an integral group of its own: it stayed free, and Fe kept no charge.

fix/164 writes every free symbol as a lone graphic. A total charge by a complex's brackets is usually within 1.5
bond lengths of an atom, so ChemDraw users who open that file get a charged atom. The session that owns
fix/1.2-bugs-int must know this. A second round trip with radicals and radical ions was asked for on 18 November;
the ChemDraw lock was held from 17 November 13:56, so it is not done (see "Open points").

## What is missing for #60

1. A base that has fix/164's free symbol. Part B as kind `"charge"` goes.
2. On the free symbol: a number (2 to 8) on the four charge kinds, drawn as an atom's is.
3. The Symbols tool, the + and − keys, the circled pair, the Actions items and Circle the charge on a free charge.
4. CDXML and CDX for a numbered free charge, and an integral group for every free charge (the fault above).
5. The MCP: `charge` and `circled` on free charges, `read` with the charge.
6. Part A carried onto the new base, with fix/164's charge key on a Nu, E or Rh caption passing the option.
7. The faults the stress run found that still apply after the move: X5 (+ on atoms and free charges together), X7
   (the MCP says what did not fit), X9 (`read` gives the charge), X12 (a group that holds a structure).
   S27, X6 and X8 are fixed by fix/164. X1, X2, X3 and X13 belong to kind `"charge"` and go with it.

## Base (a decision before the build)

The work rules for this branch say never merge. Part B cannot be built on the free symbol without its code. Two
ways:

- **Recommended.** The orchestrator or Sam allows one local merge of `fix/1.2-bugs-int` (75e3932) into this branch.
  The merge resolves each conflict toward kind `"symbol"` and drops kind `"charge"`. Nothing else moves. The branch's
  diff against fix/1.2-bugs-int is then #60 alone.
- **If not.** The build does Part A only on this branch and takes kind `"charge"` out. The number on free charges
  waits until fix/1.2-bugs-int is in release-1.2-mcp. #60 then ships half done in 1.2.

## ChemDraw cross-check

Sources checked (the first plan's list, read again on 18 November):

- ChemDraw's help: Chemical Annotations (Chemical Symbols, Charge Symbols, Rotating a Symbol) and Chemical
  Interpretation (Charges).
- Octet's ChemDraw notes: the toolbar (3.20 Chemical Symbols), the 26.1 inventory (Chemical Symbols; Atom Properties
  charge −8 to +8), the object inventory (Chemical symbol object menu), the hotkeys (section 2, the CHARGE command)
  and the gaps list.
- The CDXML notes on Symbols (SymbolType, `represent`, BoundingBox, the Warning ChemDraw adds on save).
- Sam's 68 corpus files: 12 charge symbols, all on atoms. No free charge made by ChemDraw.
- Issue #60: Prof. Schramm's measurements on ChemDraw 25.5 for Windows.
- ChemDraw 22.2 opening Octet's files and saving them again (17 November, above).

| What ChemDraw gives | Source | Octet after this work |
| --- | --- | --- |
| Chemical Symbols: Circle Plus, Circle Minus, Plus, Minus and more | toolbar 3.20, inventory | Have |
| Click an atom: the charge goes on it, the H count follows | help, Charge Symbols | Have |
| An unattached symbol anywhere, resized | help, Chemical Symbols; toolbar 3.20 | fix/164 |
| Object menu on a symbol: Center on Page, Front, Back, Flip, Rotate 180°, Rotate…, Scale… | object inventory | fix/164 (shape actions) |
| Colour menu | every object | fix/164 |
| Only radical ions and lone pairs turn | help, Rotating a Symbol | fix/164 turns every free symbol. Not changed here; for Sam |
| + and − over an atom (CHARGE). No key for a circled charge. No charge key over empty canvas | hotkeys 2; #60 | Same. + and − over a free charge step it (Octet's own) |
| Charge −8 to +8 | 26.1 inventory, Atom Properties | J1 |
| A document setting for circled charges | none (#60: none of 68 document attributes) | Octet's own: Circle new charges |
| A free symbol near an atom counts as that atom's charge in ChemDraw's analysis; on opening a file ChemDraw 22.2 links a lone one within about 1.5 bond lengths | help, Chemical Interpretation; round trip | Octet counts a free symbol in no chemistry (fix/164). Written in a group so ChemDraw keeps it free (J5) |
| A free charge with a number | none | Octet's own: digit text in the symbol's group (D4) |

## Rules every part keeps

- R1. Each atom keeps the look it was drawn with. Opening a drawing, or turning the option on or off, changes no atom.
- R2. Only a charge that starts from 0 takes the option. A charge that is there keeps its look as it goes up or down.
  At 0 the look goes.
- R3. The Symbols tool's four charges say their own look and do not read the option.
- R4. A free symbol counts in no chemistry and is never a warning (fix/164's rule).
- R5. Charges run from −8 to +8 on atoms and free charges, from every route. A free charge is never 0.
- R6. One user action is one undo step. One MCP call is one undo step.
- R7. Every opened or pasted file is hostile: numbers checked, groups read only when their shape is exact, text never
  used as markup.
- R8. No new default key.
- R9. Nothing on a hot path gets slower than 1.1.2 beyond noise.
- R10. UI words are short, British English and STE. Controls reuse what is there.
- R11. fix/164's free symbol behaviour stays as it is, apart from the changes this plan names (D3, D4, D7).

## Design decisions

- D1. **A free charge is fix/164's free symbol** of kind plus, minus, circledPlus or circledMinus. Kind `"charge"`
  goes. One object for a sign on the page, with one CDXML reader and one Symbols tool gesture.
- D2. **The number is `count`** on the shape: an integer 2 to 8, only on the four charge kinds, unset is 1. The sign
  and the circle stay in `symbol`. A magnitude cannot disagree with the kind, and a new kind from the Actions chips
  keeps it (2+ to Negative charge gives 2−).
- D3. **Stepping skips 0.** + on a free −1 gives +1, − on +1 gives −1. Only Delete and the Eraser remove a free charge,
  so no charge command deletes an object. At ±8 nothing changes.
- D4. **Drawn as an atom's charge.** Circled: the ring, with "2+" inside for 2 or more, from this branch's
  `chargeRing` and `chargeText` (shared with atoms, so the two match at one size). Plain: fix/164's sign, with the
  number as text in the label font before it. The sign keeps its place and the box grows to its left by the digit.
  A turned free charge turns its number with it (render's labels take a turn). Light and dark as other ink.
- D5. **The Symbols tool on a free charge adds as on an atom** when the tool is one of the four charges: + on 2+ gives
  3+, and the tool's look wins (Circled positive on a plain 2+ gives a circled 3+). This changes fix/164, where a
  click gave the tool's kind. The reason: the same click on an atom adds, and #60 asks for 2+ and 3− by the same
  means. A non-charge tool on a free charge, or a charge tool on a radical or lone pair, keeps fix/164's rule.
- D6. **Keys.** + and − (and the circled pair) over a free charge step it, as `actionFor` does for an atom (this
  branch's place for a free charge, beside fix/164's place for a stand-in caption). An atom under the pointer comes
  first. On a selection, atoms and free charges both step in one undo step (X5). Over empty canvas nothing, as in
  ChemDraw.
- D7. **CDXML and CDX.** Each free charge goes in an integral group of its own, so ChemDraw keeps it free. From 2,
  the group also holds the number as plain text just left of the symbol, and the symbol's `represent` names that
  text, as ChemDraw links them when it saves. Octet's data (box, turn, count) stays on the graphic, as fix/164 has
  it. On reading, a group that holds exactly one charge symbol and at most one text of a single digit 2 to 8 (linked
  to it or not) is one free charge, with no group left over. Any other group is a group. Radicals and lone pairs keep
  fix/164's lone graphic until the open round trip says otherwise.
- D8. **Circle the charge on a free charge** swaps plus with circledPlus and minus with circledMinus, about its middle
  at its size, keeping `count`.
- D9. **The option (Part A) is unchanged**: it covers charge edits on atoms only. A new free charge takes the look of
  the tool or command that made it. The MCP's `shape` with `charge` and no `circled` takes the option (an AI app has
  no tool to say the look).
- D10. **Never a reaction plus with a number.** fix/164 reads a free plus away from structures as a reaction plus
  (`reaction.ts:31`, `mixtures.ts` withSalts). A plus with `count` is a charge and never that.
- D11. **Names.** The Actions title stays fix/164's kind name. A screen reader and the MCP add the number: "Circled
  positive 2+".

## Jobs

Each job is done when its checks in "Acceptance" pass.

- J0. **Base.** One local merge of fix/1.2-bugs-int (after the go), the 10 conflicts resolved toward kind
  `"symbol"`. Kind `"charge"` and its code go: `render.ts` ShapeKind and SHAPE_KINDS, `kinds.ts`, `file.ts`,
  `cdxml.ts` writer and readChargeGroup, `Editor.tsx` keyFrees and the Symbols tool branch, `Actions.tsx`, `access.ts`,
  `TemplateLibrary.tsx`, `mcp.ts` addFreeCharge. Done: `tsc` clean, no `"charge"` shape kind left, fix/1.2-bugs-int's
  checks (`freesymbol.check.ts`, `mcp.check.ts`, `radicalion.check.ts`, `chargelabels.check.ts`) pass.
- J1. **Part A on the new base.** Every route in "Where it stands" passes the option, and so does fix/164's charge key
  on a Nu, E or Rh caption. ±8 on fix/164's routes too. Done: `circledcharges.check.ts` passes; S1 to S4, S21.
- J2. **The number.** `count` on the shape, in `serialize` and `parse` (an integer 2 to 8 on the four charge kinds
  only, else "This drawing is damaged."). Done: S13 (JSON part).
- J3. **Drawing.** D4 in `render.ts`, the box rule in fix/164's `freeSymbol` and `resizeSymbol`. Done: an atom's
  circled 2+ and a free circled 2+ give the same ring polygons and text at one size; S14, S15, S16.
- J4. **Making and stepping.** D5, D6 and D8 in the Editor. The Actions panel for a free charge adds Add a positive
  charge, Add a negative charge and Circle the charge (the atom's items, same component). Done: S5, S7, S8, S22.
- J5. **Files.** D7 in `cdxml.ts` (CDX follows CDXML). The clipboard's Octet JSON, CDXML, CDX and pictures. Done: S10,
  S11, S12, S13 (CDXML part).
- J6. **Chemistry and layout.** D10 in `reaction.ts` and `mixtures.ts`. fix/164's owners rule holds for a numbered
  charge. Done: S17.
- J7. **MCP.** See "MCP". Done: S19, S20, S23.
- J8. **Checks and speed.** `freecharge.check.ts` rewritten on kind `"symbol"` (or folded into `freesymbol.check.ts`),
  `circledcharge-stress.check.ts` cut down to the stress list below, `chargespeed.check.ts` on kind `"symbol"`.
  Done: every check file passes in a full `npm test`, the count matches the merged base plus this work, and S18 holds
  against 1.1.2.

## Siblings (consistency pillar)

| Behaviour | Free charge (kind symbol) | Atom's charge |
| --- | --- | --- |
| Colour (menu, Actions row, MCP) | fix/164 | Have |
| ⌘A, click, marquee, lasso, Tab | fix/164 | Have |
| Hold for Select on every tool | fix/164 (as any shape) | Have |
| Move: drag, arrow keys, MCP | fix/164 | Marks move round the atom |
| Size: handles, Text > Size, Scale…, MCP | fix/164; the number sizes with it (J3) | Follows the atom |
| Turn and flip | fix/164; the number turns with it (J3) | Turns with the structure |
| Align, distribute, centre, front and back, group | fix/164 | n/a |
| Undo and redo | R6 | R6 |
| Copy, paste, duplicate, between windows | J5 | Have |
| Delete, Eraser | fix/164 | With its atom |
| + and − keys, circled pair, Actions charge items | J4 | J1 |
| Symbols tool click | J4 (adds) | Have (adds) |
| Circle the charge (Actions, command, MCP) | J4, J7 | J1 |
| Circle new charges | n/a (R3, D9) | J1 |
| .oct, .cdxml, .cdx | J2, J5 | Have; J1 for the option |
| MOL, SDF, SMILES, InChI, names, formula, mass | Left out (R4) | Charge kept, look not |
| PDF, PNG, SVG, EMF, Office clipboard, print | J3 | Have |
| Dark mode | J3 | Have |
| Template thumbnails, Save as template | fix/164 + J3 | Have |
| Screen reader | J3 (D11) | Have |
| Clean Up Reaction, salts | fix/164 + J6 | n/a |
| MCP draw, change, read, run_command | J7 | J1, J7 |

## MCP

Small and local, on fix/164's ops:

- `shape` kind symbol: `charge` (−8 to 8, not 0) sets the kind's sign and `count`; `circled` (default: the drawing's
  Circle new charges, D9). `charge` with a radical or lone pair `symbol`: "did not fit".
- `edit` on a free charge: `charge` (0: "A free charge cannot be 0. Delete it.") and `circled`. On an atom: `circled`
  (with no charge: "did not fit"). Unfit properties are named in the reply (X7).
- `read`: a free charge gives `charge` (signed) without detail (X9). Atoms give `circled: true`. The document gives
  `circled_charges: true` when on.
- `set_style`: `circled_charges` (boolean).
- `run_command`: `charge.circledPlus`, `charge.circledMinus` and `charge.circled` in the catalogue. `charge.plus` and
  `charge.minus` step free charges among the ids too.

## File formats

| Format | Free charge | Circle new charges | Atom's circle |
| --- | --- | --- | --- |
| .oct JSON | shape `kind: "symbol"`, `symbol`, `count` from 2 | `style.circled` | `circled` (as now) |
| .oct CDXML, .cdxml | integral group: the Symbol graphic (Plus, Minus, CirclePlus, CircleMinus) with Octet's data; from 2, a digit text the symbol represents | root Octet data `circled: 1` | CirclePlus or CircleMinus linked to the node (as now) |
| .cdx | the same in CDX | same | same |
| MOL, SDF, SMILES | left out | n/a | charge only |
| Clipboard | Octet JSON, CDXML, CDX, PDF and pictures as drawn | with the JSON | as now |
| PDF, PNG, SVG, EMF, print | drawn as on the canvas, light theme | n/a | as now |

What other programs do with 1.2's files:

- **ChemDraw** shows each free charge as its symbol, and a numbered one as the digit and symbol, moved as one. No
  atom's charge changes. It adds its Warning on save. Octet reads the saved file back as the same free charges.
- **Octet 1.1.2** refuses the JSON shape kind `"symbol"` and reads the CDXML part. There each free charge is a
  caption (+, −, ⊕ or ⊖) in a group, with its number as a caption beside it. The drawing opens and every charge shows.
  A file with only the option on opens from its JSON: 1.1.2 drops the option and keeps each atom's look. Pasting a
  1.2 copy with a free symbol into 1.1.2 says "Octet cannot read what is on the clipboard."

## Merge notes

- J0's merge brings fix/1.2-bugs-int and release-1.2-mcp up to 33c482c, with its Editor refactors. Resolve by hand.
- fix/164's charge key on a stand-in caption (`Editor.tsx:6134` on 75e3932) passes `style.circled`.
- fix/164's Symbols tool block (`Editor.tsx:8928`): D5 for a charge tool on a free charge.
- fix/164's writer (`cdxml.ts:442`) and reader (`cdxml.ts:2515`): D7 for the four charge kinds only.
- `reaction.ts:31` isPlusShape and `mixtures.ts` withSalts: D10.
- Tell the fix/1.2-bugs-int session about the ChemDraw fault above. If fix/1.2-bugs-int goes to release-1.2-mcp
  without this branch, its free charges near atoms change chemistry in ChemDraw.

## Stress list

| # | Case | Expected |
| --- | --- | --- |
| S1 | + held down (2 s) over an uncharged N, over 20 selected atoms, over a free charge | Stops at +8 (−8 for −). The file opens from its JSON |
| S2 | Circled +1 atom, −, then + with the option off | Plain +1 |
| S3 | 100 charged atoms, plain and circled; Circle new charges on and off ten times | No atom changes. One undo step each |
| S4 | A drawing saved with the option on, opened where new drawings have it off, and the reverse; a ChemDraw file | The drawing's own option holds. A ChemDraw file has it off |
| S5 | 30 Positive charge clicks at one empty point in 3 s; 30 clicks at 30 points; then Circled negative on the 8+ | One free charge at 8+; 30 at +1; a circled 7+ |
| S6 | Place, step ×3, circle, colour, resize, move, turn with a structure, group, delete; undo ×9; redo ×9 | Empty, then the same JSON byte for byte |
| S7 | − on a free +1; + on a free −1; MCP edit charge 0 | −1; +1; an error and no change |
| S8 | ⌘A over atoms, free charges, a free radical and a box, then + | Atoms and free charges step in one undo step. The radical and the box stay |
| S9 | Copy a numbered, circled, coloured free charge: paste here, in a second window, ⌘D, into Word and back | The same object each time |
| S10 | .oct, .cdxml and .cdx round trips of ±1 to ±8, plain and circled, coloured, scaled, turned, in a user group, 0.5 bond lengths from an atom; MOL and SMILES of the drawing | The same objects. MOL and SMILES hold the structure only |
| S11 | ChemDraw 22.2 opens and saves Octet's CDXML with free charges 0.5 to 1.5 bond lengths from atoms and by brackets, numbered and not | No atom's charge changes. Octet reads the saved file as the same free charges |
| S12 | Octet 1.1.2's code opens a 1.2 .oct with numbered free charges, and one with only the option on | Opens as "File formats" says |
| S13 | Hostile JSON (count 0, 1, 9, 2.5, "2"; count on a radical; circled "yes") and CDXML (a group of 100 symbols and a "2"; text "99999999"; a digit with markup; a group with a structure, a symbol and a digit; 200 nested groups; BoundingBox NaN or 1e9) | JSON: "This drawing is damaged." CDXML: only the exact group shape gives a numbered charge; the structure is kept (X12); sizes fall back; no markup runs; the reader's limits hold |
| S14 | Smallest and largest zoom; the smallest free charge | The number is drawn, the ring stays round, it can be clicked |
| S15 | Dark mode, with ink and with a colour; export from dark mode | Light on the dark canvas. The export is as on white paper |
| S16 | A structure and a numbered free charge turned 37° and flipped | They move together, the number stays with its sign; undo puts them back |
| S17 | Delete the structure beside a free charge; Eraser on it; Clean Up Reaction with a 2+ by a product's brackets; a 2+ between two structures | The charge stays; the Eraser takes only it; it moves with the product; the 2+ is not a reaction plus |
| S18 | 40 paclitaxels; a 500-residue peptide; the paclitaxels with 500 numbered free charges; ⌘A and drag | Render no slower than 1.1.2 (median of interleaved runs). With the charges, within the check's budget |
| S19 | MCP: shape charge 0, 12, "two"; charge with symbol radical; circled "yes"; edit charge on a box and on a radical; edit circled on an uncharged atom; set_style circled_charges "yes"; run_command charge.circled with nothing picked | A clear error, or "did not fit" naming each property; nothing half done |
| S20 | Two AI sessions: one steps b5, one colours it; then one deletes it and the other edits it | Both first changes apply. The edit after the delete says b5 is gone. One undo step each |
| S21 | + over a Nu caption with the option on | A Nu atom with a circled +1, one undo step |
| S22 | A free charge dragged over an atom, then + with the pointer on the atom | The atom takes the charge |
| S23 | MCP read with no detail on a drawing with a 3− free charge | It gives charge −3 |

## Acceptance

| Check | Covers |
| --- | --- |
| `circledcharges.check.ts` on the merged base: the option in JSON, CDXML and Use for new documents; R2 on every route; ±8; the circle cleared at 0; source asserts for each Editor call site, fix/164's caption key included | J1, S1 to S4, S21 |
| `freecharge.check.ts` on kind `"symbol"`: `count` model and limits, D3, D5, D6, D8, ink against an atom's mark, JSON, CDXML and CDX round trips, ChemDraw-saved groups, hostile input, D10, MCP shape, edit, read, run_command, delete and two sessions | J2 to J7, S5 to S8, S10, S13, S16, S17, S19, S20, S22, S23 |
| `circledcharge-stress.check.ts`: one case for each row of the stress list, all passing | S1 to S23 (the parts code can run) |
| `chargespeed.check.ts`, and interleaved timing against v1.1.2 code (each failure run alone again before it counts) | S18, R9 |
| v1.1.2 code exported to the scratchpad: `readOct` on 1.2 files | S12 |
| ChemDraw 22.2 open and save, with the lock | S11 |
| Dev server on port 1461 and `npm run look`; the page in the browser: Symbols tool clicks, keys, ⌘A, copy and paste, ⌘D, Eraser, undo; Settings > Document > Style; the Actions panel for a free charge and a charged atom; light and dark; zoom limits; console free of `look:` errors | J1, J3, J4, S6, S9 (in the page), S14, S15, S22 |
| `npm test` in full | everything |

Word (S9) and a second app window need the shell. If the browser page cannot do them, the report says so.

## Words the UI adds

- Settings > Document > Style: Circle new charges.
- Actions panel: Circle the charge, Remove the circle, Circle the charges, Remove the circles. Add a positive charge
  and Add a negative charge are there already.
- Settings > Keyboard shortcuts: Circle the charge, or remove its circle.
- Screen reader: Circled positive 2+, Negative charge 3−.
- MCP error: A free charge cannot be 0. Delete it.

## Build notes (18 November)

Where the build differs from the design above, and why:

- D4: the free circled charge's ring radius is now `CHARGE_RING / 0.75` of its size (0.4533), not fix/164's 0.455. At
  the default size it is then exactly an atom's ring, so the two draw the same polygons (freecharge.check.ts). The
  change in fix/164's drawing is 0.4%.
- D4: a plain charge's digit cell is its share of the box's width, so a box stretched by a corner drag keeps the digit
  in the cell the ink leaves for it.
- D9: the MCP's `shape` takes the look from `circled`, else from a circled or plain `symbol` given with `charge`, else
  from Circle new charges. A symbol says its look as the Symbols tool does (R3).
- S6 runs move and turn in place of group: the AI tools have no group operation. Grouping a free charge is covered by
  S10 and freecharge.check.ts (a free charge in a user's group through CDXML).
- J5: the free plus that is a reaction's plus sign also goes in a group of its own (it is a free charge). The ChemDraw
  22.2 round trip checks that ChemDraw keeps it in the scheme.

## Open points

- The base (above) needs a go before J0.
- ChemDraw 22.2 with lone radicals, radical ions and lone pairs near atoms: not run, because the lock was held. If
  ChemDraw links those too, D7's group should cover them; that is fix/164's code and its session's call.
- fix/164 lets every free symbol turn. ChemDraw turns only radical ions and lone pairs. Sam's call.

## Scope cut

- A number on radicals and lone pairs: #60 asks for charges only.
- ChemDraw's analysis giving a nearby free symbol to its atom: Octet counts a free symbol in no chemistry (fix/164).
- Pulling an atom's charge off as a free one, or dropping a free one on an atom to attach it: ChemDraw has neither.
- Moving an attached charge any distance from its atom (spirokai, #164): fix/164 moves a label's sign round its atom.
- The option for whole new structures (names, SMILES, files, templates, paste, the MCP's draw): it covers charge edits.
  Circle the charges does a selection in one step.
- A default key for the circled charges: Sam has not chosen one, and ChemDraw has none.
- A preview of the free charge under the pointer before the click.
- The number of an atom's circled 2+ as text in CDXML: the atom's Charge already says 2.

## What's New (draft)

- To put a charge with a number anywhere on the page, pick a charge in the Symbols tool and click where there is
  nothing, then click it again for 2+, 3+ and so on.
- To change a free charge, point at it and press + or −.
- To give new charges a circle in a drawing, turn on Circle new charges in Settings > Document > Style.
- To put a circle round a charge that is there, select it and click Circle the charge in the Actions panel.
