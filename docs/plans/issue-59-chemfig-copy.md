# Issue 59: Copy as LaTeX (chemfig), and readable chemfig code

Branch `item/59-chemfig-copy`, from `release-1.2-mcp` b30f413. For release 1.2 (Friday 20 November 2026).

Revision 2, 18 November 2026. The first plan (83aec72) was built in fd3846e, 0313822, a1017d7 and d2a3660, with
decision 0028. The stress run (963eac8) had 58 cases and 10 failed. This revision says what stands, what fails and
why, the jobs left, and a stress list cut to 20 cases.

The issue is konokonekonoko's. Their PR 127 (`feature/chemfig-export`, 926 lines of `src/chemfig.ts`) had features
that Octet 1.1.2's writer (124 lines) did not have. PR 127 is under the repository's Apache-2.0 licence. Its code was
the starting point for the writer, adapted to Octet's code and rules. The code header, decision 0028 and the notes
lines credit konokonekonoko. The PR is left as it is (no comment, close or merge).

## What exists on the branch

- `src/chemfig.ts` (585 lines). `chemfig(mol, style, measure, {compact})` (line 206) gives `{code, notice}`;
  `toChemfig` (200) gives the code alone. Readable by default, compact on request. Ring syntax with circles and
  nested ortho-fused rings where chemfig draws what the page has (`syntaxRings`, 141; `DEEPEST` = 8, 131). Labels
  in their own bold, italic, underline, runs, scripts and colour (`group`, 236–284). Greek, signs and accents as TeX;
  other characters left out and named (`texOf`, 52). Lone pairs, radicals, circled and partial charges and moved
  signs from `render()`'s `electrons`, as `\charge` (`marks`, 288–310). Bond styles and colours as TikZ options;
  hydrogen bonds dotted; wavy bonds add a comment line (`WAVY_NOTE`, 128). The notice (`chemfigNotice`, 552).
  The writer reads `render()`'s output only. `render.ts` is not changed on this branch.
- `src/Editor.tsx`: `chemfigOf` (1540), the one path for Export, Copy and the MCP. `exportChemfig` (1543) and
  `copyChemfig` (1555). File > More Formats has "Copy as LaTeX (chemfig)" (`more_chemfig_copy`, `CodeBlock` icon,
  2599) after Export LaTeX (chemfig)… (2598). The More Formats ids run only while More formats is on (2631). The
  MCP's `fileText` takes `compact` (7829). `copyPlain` takes the notice text (7932); the copy event shows it (9318).
- `src/Actions.tsx`: `copies` (347–348) puts Copy as LaTeX (chemfig) and Copy as SLN after Copy as InChIKey while
  More formats is on, in the drawing (404), structure (420) and reaction (455) contexts and for an atom or bond that
  is a whole molecule. The panel and the right-click menu get `more` from Editor.tsx (10923, 10949).
- Settings > Pro > File menu > Compact chemfig code (off). `src/settings.ts` 85, 105, 160;
  `src/SettingsWindow.tsx` 681. The row shows only while More formats is on.
- MCP: `read` `{format: "chemfig", compact}` (`src/mcp.ts` 39, 601, 603: `compact` is an unlisted boolean).
  `scripts/headless/host.ts` 237 calls the same writer.
- `docs/decisions/0028-chemfig-code.md`.
- Checks: `src/chemfig.check.ts` (635 lines: a strict chemfig grammar, a replay of chemfig's placing rules within
  0.02 bond lengths, hostile text, Sam's local corpus, timing). `src/chemfigcopy-stress.check.ts` (1,005 lines: the
  stress cases, a TeX-level reader `texLint`, and with `--ui` the app in WebKit in two windows).
  `src/textformats.check.ts` and `src/headless.check.ts` cover the menu line and `read` with `compact`.

Run on 18 November: `node src/chemfig.check.ts` passes (40 paclitaxels, 2,560 atoms, in 41 ms; a 500-residue
peptide, 4,125 atoms, in 68 ms). `node src/chemfigcopy-stress.check.ts` passes 32 of 41 cases. The WebKit cases (U1
to U16) passed in 963eac8; X12 failed there.

## What is missing

These fail, so the item is not done:

| Case | What happens | Cause |
| --- | --- | --- |
| S30, X9 | Fe with III raised gives `Fe^{I}^{I}^{I}`; Fe with 2+ raised gives `Fe^{2}^{+}`. TeX stops: double superscript. | `group()` typesets each unit on its own and joins the results (`together[…] += t.text`, 268). |
| X1 | NH₃⁺ typed, with a charge of +1, gives `NH_{3}^{+}^{+}`. | The sign is typeset apart and added after (`out + ch`, 271). |
| X2 | CH with 2 lowered, then ₃, gives `CH_2_{3}`. | Same as S30, for lowered text. |
| S28 | 5 of Sam's 61 corpus drawings give a double superscript or subscript. | S30 and X2. |
| X3 | A coloured atom's lone pairs and dots are drawn as rings. | `.style={color=…}` (308) replaces chemfig's `fill=black`. |
| X4 | A coloured ring's aromatic circle is black. | `**6(` takes no colour. |
| X5 | Two bonded atoms on one spot (a ChemDraw file) give `-[:0,0]`. | The 0.01 floor is on hidden bonds only (356); a drawn bond's length (349) has none. |
| X15 | A ladder of 300 ortho-fused rings nests 300 deep. pdfTeX stops at 255 grouping levels. | `DEEPEST` limits where a system starts, not how deep it nests. |
| X12 | One drawing gives a Br radical's `\charge` at 98° from Copy in the app and at −87° from Octet with no window. | Not known yet (J17). |

Also missing:

- `chemfig.check.ts`'s validator passes code with a double script. Only the stress check's `texLint` finds it.
- No TeX is installed on this Mac (`which pdflatex lualatex xelatex tectonic` finds none). No output has been
  compiled.
- The stress list is too long to review (31 S, 15 X and 16 U cases). This revision cuts it to 20.
- The branch does not merge cleanly with `release-1.2-mcp` (`git merge-tree`, 18 November): two conflicts, both
  small (J19).

## ChemDraw cross-check

ChemDraw 26.1 and 22.2 have no chemfig or LaTeX output. Sources checked:

- `~/octet-research/notes/menus/live-menus.md` line 4: Edit > Copy As has SMILES, SLN, InChI, InChI Key, CDXML Text,
  MOL Text, MOL V3000 Text, HELM, HELM natural analog, 3MF ball and stick, 3MF stick, PNG.
- `~/octet-research/notes/chemdraw26-inventory.md` 396–410 (Edit > Copy As), 613 (right-click on a structure:
  Molecule > Copy As), 1254 (Possible Error in Drawing on copy and export: Stop, Ignore, Ignore All), 1258 (Save As
  text formats take an end-of-line choice: CR, LF, CR+LF).
- `~/octet-research/notes/chemdraw-inventory.md` 28, 67, 204; `chemdraw-hotkeys.md` 203–207: keys only for Copy As
  SMILES, CDXML, MOL and MOL V3000.
- `~/octet-research/notes/help26/`, `chemdraw-release-notes.md`, `chemdraw-gaps.md`, `gaps.md`: no LaTeX, TeX or
  chemfig.
- `~/octet-research/notes/spec/`: no CDXML attribute applies. The code is not kept in any file.

What follows:

- No palette, Object, Curves, Color or Text menu option and no dialog applies. The sibling in ChemDraw is the Copy As
  family, so Copy as LaTeX (chemfig) behaves as Octet's Copy As commands do.
- No default key.
- Octet's Copy As commands do not check the structure first (ChemDraw's do). Copy as LaTeX (chemfig) follows Octet's
  Copy As. Export LaTeX (chemfig)… keeps its check, as every export does.
- ChemDraw's text exports take an end-of-line choice. Octet writes LF. TeX reads any line end, so no choice is added.

chemfig facts used are from the chemfig manual and its source (`chemfig.tex`, CTAN, read 17 November 2026): `=^` and
`=_` put a double bond's second line left or right; spaces and line breaks between bonds and atoms are ignored; ring
placement at the start and after a bond; `\charge` (chemfig 1.5 and later) with its keys first; a dot's default
`.style` is `{fill=black}` and a bar's `|style` is `{black,line width=0.4pt}`; a circled ring takes
`**[start,end,tikz]n(`; each branch and ring opens a TeX group, and pdfTeX stops at 255 grouping levels.

## Rules every part keeps

1. One writer. Copy, Export and `read` (in the app and in Octet with no window) call `chemfig()` with the same
   inputs. One drawing and one setting give the same bytes from Copy, Export and the app's `read`. (Octet with no
   window: see J17.)
2. The code compiles in `\documentclass{article}\usepackage{chemfig}` (chemfig 1.5 or later), plus
   `\usetikzlibrary{decorations.pathmorphing}` only when its first line asks for it.
3. The code is 7-bit ASCII. Braces balance. Text from a drawing reaches TeX only escaped or mapped to a command on a
   fixed list. TeX finds no double script, no script without an argument and no line over 200,000 characters.
4. Readable and compact code differ only in line breaks and tabs: the readable lines, trimmed and joined, are the
   compact code.
5. Each atom drawn lands where the page has it, replayed by chemfig's rules, within 0.02 bond lengths. No bond in the
   code has a length under 0.01.
6. Copy, Export and `read` change nothing in the drawing and add no undo step.
7. Nothing on a hot path changes. `render.ts`, structure updates and input are not touched. The writer runs only on
   Copy, Export and `read`.
8. Loops are bounded. The walk is iterative; ring search goes at most 8 atoms deep. Bond by bond, branches nest at
   most log2(atoms) deep. A ring system in ring syntax starts at most 8 levels deep and nests at most 16 rings deep.
   So any code nests at most log2(atoms) + 24 levels: 44 for a million atoms.
9. UI text: British English, Simplified Technical English, Octet's own notice patterns. No tips or helper text.
10. The UI command shows only while Settings > Pro > More formats is on. MCP `read` works always, as in 1.1.2.

## Design decisions

D1 to D17 are built and stand. In short:

| # | Decision | Reason |
| --- | --- | --- |
| D1 | File > More Formats > Copy as LaTeX (chemfig), `more_chemfig_copy`, `CodeBlock`, after Export LaTeX (chemfig)…. | Sam keeps rare formats in More Formats (issue, 9 November). Edit > Copy As keeps ChemDraw's list. One line gives the menu on all three systems, the palette and Settings > Keys. |
| D2 | With More formats on, the Actions panel and right-click menu show Copy as LaTeX (chemfig) and Copy as SLN after Copy as InChIKey, where Copy as SMILES is. | The item asks for it where the Copy As items are. Both More Formats copy commands go together. |
| D3 | No default key. | ChemDraw has none. |
| D4 | No structure check before the copy. | No Copy As command has one. |
| D5 | Readable by default; Settings > Pro > Compact chemfig code writes one line; MCP `read` can override with `compact`. | konokonekonoko's request and PR 127's layout. One setting keeps three outputs the same. |
| D6 | The writer reads `render()`'s output (labels, `electrons`, `sides`); PR 127's moves in `render.ts` are not made. | `render.ts` is the hot path, and fix/163 and fix/164 change its marks. |
| D7 | The largest subtree is the main chain. | Nesting under log2(atoms). |
| D8 | A bond names the label's atom it meets when the label has more than one chemfig atom. | chemfig's own choice flips near ±90°. |
| D9 | Ring syntax only where the replay holds (regular to 1% and 0.5°, ortho-fused tree, radial bonds out, no centred double bond unless circled, start no deeper than 8). | chemfig has no centred double bond in a ring and draws only regular rings. |
| D10 | Text escaped, Greek and signs mapped, accents in `\mbox`; other characters left out and named. | Rule 3. |
| D11 | Atom colour on labels and marks (`\color[RGB]`), bond colour as TikZ `color=`. Black writes nothing. | Every object takes a colour. |
| D12 | Bold, dashed, hashed, wavy, dative and hydrogen bonds as TikZ options. | PR 127's mapping. |
| D13 | The notice names what the code leaves out, in a fixed order, and what it shows another way. | The user knows what to add by hand. |
| D14 | Captions read as chemistry are not in the code. | chemfig code is a drawing. |
| D15 | MCP: `read` keeps format `chemfig` with an unlisted `compact`. No `run_command` id. | `copy_*` commands are not in `MENU_COMMANDS` (mcp.ts 278); `read` gives the text. Small change while the MCP is in review. |
| D16 | No TeX here: strict validators, plus `CHEMFIG_TEX=<path>`, which writes every check drawing's code into one LaTeX file and compiles it where `pdflatex` is on the PATH. | The item says to validate strictly when no TeX exists. |
| D17 | Decision record 0028. | Significant technical decision. |

New in this revision:

| # | Decision | Reason |
| --- | --- | --- |
| D18 | Each chemfig atom's characters are typeset once: the label's units that make up that atom, then its charge sign, go to `typeset()` as one list. Raised characters side by side are one `^{…}` and lowered ones one `_{…}`. A base takes at most one lowered and one raised part; a third part starts on `{}` (`X_{1}^{+}{}_{2}`). A prime after a raised part goes in it as `\prime`. | TeX stops at a double script (S30, X1, X2, X9, S28). PR 127 wrote `Fe^{(III)}` as one group. Fixing where the text is built is smaller than repairing the joined text afterwards. |
| D19 | A coloured atom's marks: `.style={fill=<colour>}` and `|style={<colour>,line width=0.4pt}`. | chemfig's defaults with the colour in place of black. `color=` alone leaves a dot hollow (X3). PR 127 used `fill`. |
| D20 | A circled ring in a colour: `**[0,360,color=<colour>]n(`, the colour `render()` gives that circle. | The page draws the circle in a colour (render.ts 1642); the code follows the page (X4). |
| D21 | Every bond in the code is at least 0.01 bond lengths long, drawn or hidden. | A bond of length 0 has no direction. 0313822 did this for hidden bonds only (X5). |
| D22 | A ring system in ring syntax nests at most 16 rings deep. A deeper system is bond by bond, closed by hooks. | Rule 8 and pdfTeX's 255 grouping levels (X15). Ortho-fused systems in papers are a few rings long (hexacene has 6), so 16 leaves room. Peri-fused sheets such as coronene are bond by bond already (D9). |
| D23 | X12 is found before it is fixed. If the two hosts' `render()` put the dot in different places (their text measuring differs), the code follows each host's own page, and rule 1 for Octet with no window reads "the same bytes except a mark's angle where its own page places the mark another way". Sam gets one line about the measuring difference; `render.ts` is outside this item. If the writer reads one page two ways, the writer is fixed. | Plan before code: find which requirement breaks before the patch. |
| D24 | One TeX-level reader for both checks: `texLint` moves from the stress check to `scripts/chemfiglint.ts`, and `chemfig.check.ts` runs it on every output. | The grammar validator missed double scripts. One reader, not two. |
| D25 | The stress check is regrouped under ST1 to ST20 below. Its sub-checks stay; those that only repeat `chemfig.check.ts` go. | A list a reviewer can read. Each case is one risk. |
| D26 | The two merge conflicts with `release-1.2-mcp` are resolved this way: `exportChemfig` uses the new `exportAs(() => ({ format: "tex", tex: code }), (path) => notice ? … : undefined)`; the Editor import line keeps `chemfig` and adds `type ExportRequest`; `chemfig.check.ts` keeps both tails, with its Editor pattern changed to `chemfigOf`. The merge itself is done by the integration session or on Sam's go. | Upstream moved every export to `exportAs` (b56943a). This branch does not merge. |

## PR 127 against Octet 1.1.2, feature by feature

| Feature | 1.1.2 | PR 127 | This branch |
| --- | --- | --- | --- |
| Copy to the clipboard | no | Edit > Copy As | File > More Formats, Actions, right-click (D1, D2) |
| Readable layout, Compact switch | no | readable default; switch in Settings > Files > Export | readable default; switch in Settings > Pro (D5) |
| Ring syntax, circles, fused rings | hooks only | yes | yes (D9); circle colour (D20); depth cap (D22) |
| Bond styles and colours | wedges, double, triple | all | all (D11, D12) |
| Hydrogen bonds | left out | dotted | dotted |
| Lone pairs, radicals, circled and partial charges | skeletal charge only | yes | from the page's places (D6); colour fill (D19) |
| Label styles, runs, scripts, colour | no | yes | yes; scripts typeset once (D18) |
| Greek, signs, escaping | cut to a safe set | mapped, others left in | mapped; others left out and named (D10) |
| Notice of what is left out | one sentence, export only | detailed | detailed (D13) |
| Comment for a TikZ library | no | yes | wavy bonds only |
| Reaction schemes, `\chemmove`, `\polymerdelim`, `\chemname`, atom and map numbers, R/S and E/Z | no | yes | cut (Scope) |

## Jobs

Each job is done when its checks in the acceptance list pass and `npm test` passes.

Built (J1 to J12, from revision 1). Status on 18 November:

| Job | What | Done means | Status |
| --- | --- | --- | --- |
| J1 | The command in File > More Formats | In the menu on all three systems, the palette and Settings > Keys while More formats is on; in none while off. Copied text = exported file text without its last line break. | Done |
| J2 | Right-click and Actions items | Present with More formats on, absent with it off; no `look:` line. | Done |
| J3 | One writer path | One drawing gives the same bytes from Copy, Export, the app's `read` and Octet with no window. | Open: X12 (J17) |
| J4 | Readable layout and Compact chemfig code | Rule 4 for every check drawing; the switch changes Copy, Export and `read`; it persists; a second window follows it. | Done |
| J5 | Ring syntax | D9 cases in ring syntax or bond by bond as listed; replay within tolerance. | Open: X4 (J14), X15 (J16) |
| J6 | Bonds | Each `Display` kind and colour as TikZ options; the notice names what shows another way. | Open: X5 (J15) |
| J7 | Marks | Each `\charge` within 1° of the page's angle, in the atom's colour. | Open: X3 (J14) |
| J8 | Labels | Every hostile and Unicode case valid; ASCII. | Open: S30, X1, X2, X9 (J13) |
| J9 | Notice | Each left-out kind named once, in order; "Copied." alone for structures only. | Done |
| J10 | MCP | `compact` true, false, absent; `"yes"` refused; errors as for other formats. | Done |
| J11 | Tests, validator, timing | All pass alone and in `npm test`. | Open: the validator misses double scripts (J18) |
| J12 | Decision record and credit | 0028; header credit; notes lines returned, not written. | Done |

Left to do:

- **J13 Scripts typeset once (D18).** `group()` builds each chemfig atom's character list (its units, then its
  sign) and calls `typeset()` once. `typeset()` merges neighbouring raised or lowered parts, starts a third part on
  `{}`, and puts a prime into a raised part as `\prime`. Done: S30, X1, X2, X9 and the five corpus drawings in S28
  pass `texLint`; the replay and every other check still pass; the same label typed with Unicode scripts and with
  Text > Superscript gives the same code.
- **J14 Colour on marks and circles (D19, D20).** Done: X3's dots are filled in the atom's colour and its bars keep
  0.4 pt; X4's circle has the circle's colour from `render()`; an uncoloured or black drawing gives the same bytes as
  before this job.
- **J15 No bond under 0.01 (D21).** Done: X5 gives a bond of 0.01; no output of any check has a length field under
  0.01.
- **J16 Nesting cap (D22).** Done: X15's ladder is bond by bond past 16 rings and nests at most 8 + 16 + log2(atoms)
  levels; naphthalene to a 16-ring ladder keep ring syntax; every check drawing nests within rule 8 (the check counts
  the deepest `(` level).
- **J17 Octet with no window and the app (D23).** First, record the dot's place in each host's `render()` output for
  X12's drawing. Then fix the writer, or restate rule 1 and tell Sam about the measuring. Done: X12 passes under the
  rule that holds, with the finding in the commit message.
- **J18 One TeX-level reader (D24).** Done: `chemfig.check.ts` fails on a double script (shown by a check that feeds
  it `Fe^{I}^{I}`); the stress check uses the same reader.
- **J19 Stress check regrouped (D25), and merge notes (D26).** Done: the stress check reports ST1 to ST20 only;
  `git merge-tree` against `origin/release-1.2-mcp` lists only the two known conflicts, and the plan's resolution is
  in the hand-over to the integration session.

## Siblings (consistency pillar)

Where the command shows, and its siblings there:

| Place | Siblings | Behaviour that must match |
| --- | --- | --- |
| File > More Formats (Mac, Windows, Linux menus) | Export LaTeX (chemfig)…, Copy as SLN, the other More Formats lines | Shown and run only while More formats is on. |
| Command palette, Settings > Keys | Every menu command | One `moreFormats` line gives both. A key set by the user works; none by default. |
| Actions panel, right-click menu | Copy as SMILES, Copy as InChI, Copy as InChIKey | Same contexts (drawing, structure, reaction, an atom or bond that is a whole molecule); small items; kind `library`; can be dragged and arranged as the others. |
| Clipboard | Copy as SMILES, SLN, InChI, HELM, FASTA, CDXML text, MOL | Plain text through `copyPlain`; "Copied." notice; "There is no structure to copy." (info) with no structure; no undo step; works in the app and in a browser. |
| Export | Export LaTeX (chemfig)… | The same code byte for byte; the same notice after "Saved name.tex.". |
| MCP | `read` with the other formats | Same ids handling and errors. |

What can be in the drawing, and what the code does with it:

| Object | In the code |
| --- | --- |
| Atoms, labels (element, written, abbreviation, residue), isotopes, charges, hidden H, stacked H | Yes, as the page shows them. |
| Bonds: single, double (each side), triple, quadruple (as triple), aromatic, wedges, hashes, bold, dashed, wavy, dative, hydrogen, crossed | Yes; the notice names what shows another way. |
| Rings, aromatic circles, fused systems | Yes (D9, D20, D22). |
| Lone pairs, bars, radicals, carbenes, circled and partial charges, signs moved by hand | Yes (D6, D19). |
| Colour on atoms, labels, bonds, marks, circles; Colour by Element | Yes (D11, D19, D20). |
| Rotated, flipped, scaled structures; grouped structures; structures in a cycle or on an experiment page | Yes, as drawn. |
| Highlights (halo), ring fill, depth shading | No; named in the notice. |
| Text, captions, arrows, shapes, brackets, cycles' arrows, reagent tables, charts, spectra, TLC plates, pictures, orbitals | No; named in the notice. |
| Multi-centre and variable attachments, polymer beads | Atoms as the page draws them; attachment points and beads named. |

Other sibling behaviours: dark mode and zoom never change the code; undo and redo are not touched by a copy; the
same drawing after `.oct`, CDXML or CDX round trips gives the same code; Cmd+A then Copy as LaTeX (chemfig) codes
every structure; a second window reads the shared setting.

## MCP surface

- `read` `{format: "chemfig", ids?, compact?}`. `compact` is an unlisted boolean, as `dpi` is; the description has one
  clause for it. Without it, the user's setting.
- Errors as for other formats: unknown ids give "There is nothing with the id …"; ids with no structure give "Octet
  cannot write these as CHEMFIG."; an empty drawing gives "Octet cannot write this drawing as CHEMFIG.". A wrong
  `compact` type is refused by the schema.
- No `run_command` id: no Copy As command is in `MENU_COMMANDS`; `read` gives the AI app the text. Nothing else in
  `mcp.ts` changes in this revision.
- Read only: no undo step, no change; two AI sessions can read while either edits.

## Files

| File | Change in this revision |
| --- | --- |
| `src/chemfig.ts` | J13 to J17. |
| `src/chemfig.check.ts` | J13 to J18 checks; runs the shared reader. |
| `scripts/chemfiglint.ts` (new, checks only) | The TeX-level reader, moved from the stress check (J18). |
| `src/chemfigcopy-stress.check.ts` | Regrouped to ST1 to ST20 (J19). |
| `docs/decisions/0028-chemfig-code.md` | D18 to D23 added in short. |

No Rust, UI, settings or MCP change in this revision. No new dependency.

## File formats

| Format | Effect |
| --- | --- |
| `.oct`, CDXML, CDX | None. The code is never kept in a drawing. Round trips are unchanged. |
| MOL, SDF, RXN, SMILES, InChI, HELM, FASTA, SLN | None. |
| Clipboard | Plain text, the type Copy as SMILES uses. ASCII with LF line ends. |
| `.tex` (Export LaTeX (chemfig)…) | Readable by default (1.1.2 wrote one line). Both draw the same. |
| Settings storage | New key `chemfigCompact`. Octet 1.1.2 keeps keys it does not know (X11), so the setting survives a run of 1.1.2. |

Octet 1.1.2 opening a file from this build: no file type changes, so it opens every file as before. Octet opens no
`.tex` file. ChemDraw has no chemfig reader; the files ChemDraw opens (CDXML, CDX) do not change.

## Stress list

Each case names the stress check's earlier ids it takes in. "Fails now" marks what this revision must fix.

| # | Case | Expected |
| --- | --- | --- |
| ST1 | Nothing to code: an empty drawing; a selection of only text and arrows; a selection whose atoms an AI app deleted. (S1, S23, U1, U12) | "There is no structure to copy." (info); the clipboard keeps what it had. Export: "There is nothing to export." MCP: its "cannot write" error. |
| ST2 | Lone atoms and salts: CH4, H2O, Na+, a lone ¹³C, 300 salts in a list. (S2, S5) | `\chemfig{CH_4}`, `H_2O`, `Na^{+}`, the mass number in braces; each salt one level down. Valid. |
| ST3 | Big drawings: 40 paclitaxels; a 500-residue peptide as atoms and with residue labels; a page of 200 messy structures. (S3, S4, X6, U14) | Under 300 ms (median of 5, run alone) in Node; 15 paclitaxels under 300 ms in WebKit. Valid; replay within tolerance. |
| ST4 | Long and deep: a 1,000-atom chain; a 30-ring; a cyclic 500-mer; 100 para-phenylenes; a dendrimer of rings; a ladder of 300 fused rings. (S5, S6, S31, X15) | No stack overflow. 4 times the atoms in under 10 times the time. Nesting within rule 8; never over 64. Fails now (ladder). |
| ST5 | Hostile label text: `\input{/etc/passwd}`, `}{`, `%`, `#`, `$`, `&`, `~`, `^`, `_`, control characters, a 10,000-character label, a 60,000-character label in a ChemDraw file. (S7, X13) | Every special escaped or braced; no command outside the list; ASCII; no line over 200,000 characters. |
| ST6 | Unicode labels: α, Δ, capital Alpha, ±, °, é, ü, ß, 中, an emoji. (S8) | TeX commands for the first eight; 中 and the emoji left out and named in the notice. ASCII. |
| ST7 | Raised and lowered runs: Fe with III raised, Fe2+ and SO4 2- typed raised, R1', NH₃⁺ with a charge, CH with 2 lowered then ₃, OsCl3 • H2O, a label all raised; the same through MCP `read`. (S30, X1, X2, X9) | At most one raised and one lowered part on each base; `texLint` passes; the page's look kept. Fails now. |
| ST8 | Rings: naphthalene, anthracene, phenanthrene; pyrene, spiro[4.5]decane, norbornane; a steroid with a slanted methyl; half a benzene selected. (S9, S24) | First three nested in ring syntax; the rest bond by bond. Replay within tolerance. |
| ST9 | Turned 17°, flipped, scaled to 150% among structures at 100%. (S10) | Turned and flipped rings keep ring syntax; 150% rings bond by bond at length 1.5. Replay within tolerance. |
| ST10 | Zoom at 5% and 4,000%, and dark mode. (S11, U6) | The same bytes as at 100% in light mode. |
| ST11 | Colour: coloured labels, bonds and marks; a coloured aromatic ring with its circle; black set by hand; Colour by Element. (S12, X3, X4) | Labels and marks in `\color[RGB]`; filled dots; bars 0.4 pt; the circle coloured; black writes nothing. Fails now (dots, circle). |
| ST12 | Marks: two lone pairs, bars, a radical, a triplet carbene, a circled charge, δ+, a pair and a sign dragged round by hand, N•+ on a label. (S13, S14) | Each `\charge` within 1° of the page's angle. Valid with and without fix/163. |
| ST13 | Bonds: wavy, bold, dashed, hashed, dative, hydrogen; quadruple; crossed and dashed double; hidden H and Hide implicit H. (S15, S16) | TikZ options; the comment line for wavy; the notice's second sentence; hidden H not written. |
| ST14 | Atoms on one spot: two copies of a structure; two bonded atoms from a ChemDraw file; ferrocene's η5 centre; a variable attachment; a polymer bead. (S25, X5, S26) | No bond under 0.01. Valid. The notice names attachment points and beads. Fails now (bonded atoms). |
| ST15 | Hostile drawing data: duplicate and self bonds, charges of ±100, odd counts, colours and bond types, 1,000 lone pairs on one atom, 10,000 lone atoms. (X7) | No throw. Valid. |
| ST16 | Undo and fast input: draw, copy, edit, copy, undo, copy, redo, copy; the command 50 times in one second. (S17, S18, U5, U7) | No undo step from a copy; the third copy equals the first, the fourth the second. 50 equal copies, one notice, no error. |
| ST17 | Two windows: Compact set in window A, Copy in window B; code copied in A and pasted on B's page and in a text box; a large code pasted. (S19, S20, U9, U10, U15) | B's copy is compact. On the page: nothing drawn, the notice for text that is not a structure, answered within 2 s. In a text box: the code as text. |
| ST18 | More formats off: menu, palette, Actions, right-click, a key set earlier. (S27, U11) | The command is in none of them; the key does nothing. MCP `read` still gives the code. |
| ST19 | AI apps: `read` with `compact` true, false, absent and `"yes"`; format in other cases; ids empty, unknown, 501 of them, text only; one session reads while another edits; the same drawing read from Octet with no window and copied in the app. (S21, S22, X10, X12) | The code, or a plain refusal, never a throw. Reads change nothing. App and no-window bytes as J17 decides. Fails now (X12). |
| ST20 | Round trips and other apps: `.oct`, CDXML and CDX; a drawing ChemDraw 22.2 saved again; Sam's 61 corpus drawings (local); Octet 1.1.2 run between two runs of this build. (S29, X14, S28, X11) | The same code within the files' rounding; ChemDraw's copy the same but mark angles; every corpus drawing valid; Compact chemfig code kept. Fails now (5 corpus drawings, from ST7). |

## Acceptance list

| Check | Covers |
| --- | --- |
| `node src/chemfig.check.ts`: grammar, `texLint`, replay, rule 4, notice text, timing (re-run alone before a timing failure counts), corpus where present | Rules 2 to 5, 8; J4 to J9, J11, J13 to J16, J18; ST2, ST5 to ST9, ST11 to ST15, ST20 |
| same, `CHEMFIG_TEX=<file>`; compiled when `pdflatex` exists | Rule 2. Blocked here: no TeX on this Mac. The file is kept for Sam. |
| `node src/chemfigcopy-stress.check.ts` | ST1 to ST20, Node parts; J13 to J17, J19 |
| `node src/chemfigcopy-stress.check.ts --ui http://localhost:1462/` (dev server: `npx vite --port 1462 --strictPort`) | J1, J2, J4; ST1, ST3, ST10, ST16 to ST19 in WebKit, two windows |
| `node src/textformats.check.ts`, `node src/molecule.check.ts` | J1, J2; ST18 |
| `node src/headless.check.ts` | J3, J10; ST19 |
| `npm run look -- http://localhost:1462/` and the console's `look:` lines | J2, J4: the new items and the Settings row match their siblings |
| `git merge-tree --write-tree HEAD origin/release-1.2-mcp` (no commit) | J19: only the two known conflicts |
| `npm test` (full) | Everything |

## Scope

In: J13 to J19. J1 to J12 are built.

Cut, with reasons:

- Reaction schemes (`\schemestart`, `\arrow`, `\+`): need Octet's reaction reading in both hosts, a second layout
  system and TeX to check. Not to standard by Friday.
- `\chemmove` arrows, `\polymerdelim` brackets: need two LaTeX runs and node names; nothing here compiles them.
- Names and compound numbers under structures (`\chemname`): split the code into one `\chemfig` per named structure
  and need rules for which caption belongs to which structure.
- Atom numbers, map numbers, R/S and E/Z labels: need stereo labels from Indigo in both hosts.
- A compact switch in the Export dialog: Octet's chemfig export is a direct More Formats save; Settings has the
  switch.
- An MCP note of what the code leaves out: keeps `mcp.ts` small during its review. `read` gives the other objects.
- A LaTeX compile: no TeX on this Mac. Installing one is a large download and needs Sam's yes.
- A structure check before every Copy As: a change to all Copy As commands, outside this item.
- Reading chemfig code into Octet.
- Making `render()` measure text the same way in the app and in Octet with no window, if J17 finds that is the cause
  of X12: `render.ts` is the hot path and outside this item. Sam gets the finding.
- Merging `release-1.2-mcp` into this branch: the integration session does it, or Sam says when.
- Stress cases past the 20 above.

## What's New (draft; the final lines go back to the workflow)

- To copy structures as LaTeX chemfig code, choose File > More Formats > Copy as LaTeX (chemfig). When More formats
  is on, the right-click menu and the Actions panel also show Copy as LaTeX (chemfig) and Copy as SLN.
- When you copy or export chemfig code, Octet writes one atom on each line and indents each branch. To write the code
  on one line, set Settings > Pro > Compact chemfig code to on.
- When you copy or export chemfig code, Octet writes rings in chemfig's ring syntax and keeps aromatic circles, lone
  pairs, radicals, partial charges, bond styles, colours and label styles. The notice tells you what the code does
  not have. Much of this work is from konokonekonoko (PR 127).
