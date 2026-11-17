# Issue 59: Copy as LaTeX (chemfig), and readable chemfig code

Branch `item/59-chemfig-copy`, from `release-1.2-mcp` b30f413. For release 1.2 (Friday 20 November 2026).

The issue is konokonekonoko's. Their PR 127 (`feature/chemfig-export`, 926 lines of `src/chemfig.ts`) had features
that Octet 1.1.2's own writer (124 lines) does not have. They reopened the issue on 15 November. This plan brings the
best of PR 127 into Octet's writer and adds the copy command. PR 127 is under the repository's Apache-2.0 licence.
Its code is the starting point for the parts below that name it, adapted to Octet's code and rules. The code header
and the release notes credit konokonekonoko. The PR itself is left as it is (no comment, close or merge).

## What exists on the branch, and what is missing

Exists:

- `src/chemfig.ts` (124 lines): `toChemfig(mol, style, measure)` writes one `\chemfig{…}` on one line. Bonds at the
  page's angles and lengths (relative to the drawing's median bond, `d.scale / s.bond`, line 23), rings closed by
  hooks (lines 92–101), double bonds on the page's side from `Drawing.sides` (line 69), wedges, triple bonds,
  quadruple bonds as triple (line 70), charges, isotopes, stacked H (line 58), labels read as the page reads them
  (lines 45–61), separate structures hung off the first by `draw=none` bonds (line 123). Label text is cut to
  `[A-Za-z0-9'()+.,*-]` (line 11), so Greek, signs and styles are lost.
- `src/Editor.tsx` 1537–1547: File > More Formats > Export LaTeX (chemfig)… saves the selection or the drawing as a
  `.tex` file. The notice says "The file has only the structures." when the part has text, arrows, shapes or cycles.
- `src/Editor.tsx` 2584–2593: the More Formats list. One line gives the menu item (`set_more_formats`, main.rs
  366–380 and 728–733), the command palette entry (8056) and the Settings > Keys row. The list shows only while
  Settings > Pro > More formats is on (2619, 3352).
- `src/Editor.tsx` 7939–7960: Copy As (SMILES, InChI, InChIKey, CDXML text, MOL, MOL V2000, HELM, FASTA, and SLN from
  More Formats), through `copyPlain` (7919).
- `src/mcp.ts` 36 and 601: `read` with `format: "chemfig"` gives the code. `src/Editor.tsx` 7817 and
  `scripts/headless/host.ts` 237 both call `toChemfig`.
- `src-tauri/src/export.rs` 551, 579, 669: the `.tex` export type.

Missing:

- (A) A command that copies the chemfig code to the clipboard. No `copy_chemfig` or `more_chemfig_copy` exists
  anywhere (`grep -rn chemfig src src-tauri/src`).
- (B) From PR 127: the readable layout (one atom a line, branches indented) and its Compact switch; chemfig's ring
  syntax (`*6(…)`, `**6(…)` with a circle, fused rings nested); lone pairs, radicals, circled and partial charges at
  the page's places; bold, dashed, hashed, wavy, dative, hydrogen and coloured bonds; label colour, bold, italic,
  underline, runs and raised or lowered text; Greek and signs as LaTeX; a notice that names what the code leaves out;
  a comment line when the code needs a TikZ library. Also from PR 127, and cut from this release (see Scope): reaction
  schemes, `\chemmove` arrows, `\polymerdelim` brackets, `\chemname` names, atom and map numbers, R/S and E/Z labels.

The right-click menu and the Actions panel have Copy as SMILES, InChI and InChIKey only (`src/Actions.tsx` 398, 414,
449). They have no More Formats command.

## ChemDraw cross-check

ChemDraw 26.1 has no chemfig or LaTeX output of any kind. Sources checked:

- `~/octet-research/notes/menus/live-menus.md` line 4: Edit > Copy As has SMILES, SLN, InChI, InChI Key, CDXML Text,
  MOL Text, MOL V3000 Text, HELM, HELM natural analog (FASTA since 25.5), 3MF ball and stick, 3MF stick, PNG.
- `~/octet-research/notes/chemdraw26-inventory.md` 396–405 (Edit > Copy As), 613 (right-click on a structure:
  Molecule > Copy As >), 1254 (Possible Error in Drawing on copy and export: Stop, Ignore, Ignore All), 1258 (Save As
  text formats take an end-of-line choice: CR, LF, CR+LF).
- `~/octet-research/notes/help26/` (index and 175 pages), `chemdraw-release-notes.md`, `chemdraw-gaps.md`, `gaps.md`,
  `chemdraw-hotkeys.md`: no LaTeX, TeX or chemfig. No key for any Copy As format but SMILES, CDXML, MOL and HELM.
- `spec/`: no CDXML attribute applies. The code is not kept in any file.

What follows for Octet:

- No palette, Object, Curves, Color or Text menu option and no dialog applies. The sibling in ChemDraw is the Copy As
  family, so Copy as LaTeX (chemfig) behaves as Octet's Copy As commands do.
- No default key (ChemDraw has none for this).
- ChemDraw checks the structure before a copy. Octet's Copy As commands do not (Editor.tsx 2989–2996); plain Copy and
  Export do, when Settings > General > Check when copying or exporting is on (7557, 9316). Copy as LaTeX (chemfig)
  follows its Copy As siblings. Export LaTeX (chemfig)… keeps its check.
- ChemDraw's text exports take an end-of-line choice. Octet writes LF. TeX reads any line end, so no choice is added.

chemfig facts used below are from the chemfig manual (CTAN `chemfig-en.pdf`, read 17 November 2026): `=^` and `=_`
put a double bond's second line left or right of the drawing direction; spaces and line breaks between bonds and atoms
are ignored; a ring that starts a molecule has its first atom at the south-west, is drawn anticlockwise, and its last
side falls straight down onto the first atom; a ring after a bond is turned so the bond bisects its first and last
sides; a plain `=` in a ring has its second line on the left (inside); `\charge` is in chemfig 1.5 (March 2020) and
later; `#` and `\#` straight after a bond are chemfig's bond trimming; `\usetikzlibrary` goes in the preamble.

## Rules every part keeps

1. One writer. Copy, Export, MCP `read` in the app and in the headless host all call `toChemfig` with the same
   inputs. The same drawing and setting give the same bytes everywhere.
2. The code compiles in `\documentclass{article}\usepackage{chemfig}`, plus
   `\usetikzlibrary{decorations.pathmorphing}` only when its first line asks for it. chemfig 1.5 or later is needed
   for `\charge`. The manual does not say which version added `=^` and `=_`; 1.1.2 writes them already.
3. The code is 7-bit ASCII. Braces balance. Text from a drawing reaches TeX only escaped or mapped to a known command.
   A control sequence outside a fixed list never appears.
4. Readable and compact code differ only in line breaks and tabs: the readable lines, trimmed and joined, are the
   compact code.
5. Each atom drawn lands where the page has it: replayed by chemfig's rules, within 0.02 bond lengths.
6. Copy, Export and `read` change nothing in the drawing and add no undo step.
7. Nothing on a hot path changes. `render.ts`, structure updates and input are untouched. The writer runs only on
   Copy, Export and `read`.
8. Loops are bounded: the walk is iterative and ring search goes at most 8 atoms deep. Bond by bond, branches nest
   at most log2(atoms) deep. Ring syntax is used only for a ring system that starts no deeper than 8 levels (found in
   at most two walks), so nesting stays under log2(atoms) + 8 + the levels of one fused system.
9. UI text: British English, Simplified Technical English, Octet's own notice patterns. No tips or helper text.
10. The UI command shows only while Settings > Pro > More formats is on. MCP `read` works always, as today.

## Design decisions

| # | Decision | Reason |
| --- | --- | --- |
| D1 | File > More Formats > Copy as LaTeX (chemfig), id `more_chemfig_copy`, Phosphor `CodeBlock` icon, after Export LaTeX (chemfig)…. | Sam keeps rare formats in More Formats (issue comment, 9 November). ChemDraw has no chemfig, so Edit > Copy As keeps ChemDraw's list. Copy as SLN is there already. One line gives the menu on all three systems, the palette and Settings > Keys. `CodeBlock` is unused; `BracketsCurly` is the export's and HELM's. |
| D2 | The Actions panel and right-click menu show Copy as LaTeX (chemfig) and Copy as SLN beside Copy as SMILES (contexts drawing, structure, reaction, and an atom or bond that is a whole molecule), only while More formats is on. They run the More Formats ids. | The item asks for it where the Copy As items are. Consistency: both More Formats copy commands go together. `runAction` runs a menu id first (Editor.tsx 8138). |
| D3 | No default key. | ChemDraw has none. Never invent defaults. |
| D4 | No structure check before the copy. | Its siblings (every Copy As) have none. |
| D5 | Readable by default: one atom with its bond on each line, each branch's `(` and `)` on their own lines, a tab for each level; a ring's `*6(` ends its first atom's line and its sides go one level in. Settings > Pro > File menu > Compact chemfig code (off) writes one line. The row shows only while More formats is on. One setting for Copy, Export and MCP; MCP `read` can override it with `compact`. | konokonekonoko's request; PR 127's layout. One setting keeps the three outputs the same. Settings already hides rows by condition (SettingsWindow.tsx 544, 634). |
| D6 | The writer starts from PR 127's `chemfig.ts`, cut to the scope below. It reads the page from `render()`'s output: which atoms show a label (`Drawing.label`), each mark's place (`Drawing.electrons` with its key), each double bond's side (`Drawing.sides`). PR 127's moves in `render.ts` (`markKinds`, `markAngles`, `stereoSpot`, `showsLabel`) are not made. | `render.ts` is the hot path, and fix/163 and fix/164 change its marks now. The page's own output gives exact places with no second copy of the rules, and fits those fixes: a label's charge sign moved by hand (fix/164) comes as an `electrons` entry keyed `charge`. |
| D7 | The main chain is the largest subtree (1.1.2). | Nesting stays under log2(atoms), safe for TeX's grouping limit and for indents on a 4,000-atom drawing. PR 127's longest-chain rule can nest deeper. |
| D8 | A bond names the atom of a label it leaves and meets whenever the label has more than one chemfig atom (1.1.2). | It never depends on chemfig's own choice, which PR 127 found flips near ±90°. It costs a few characters. |
| D9 | Ring syntax only where chemfig draws what the page has: PR 127's rules (each ring regular, 3 to 8 atoms; rings joined only by one shared side, no atom in three rings, the joins a tree; fusion atoms have no bond out; each bond out points straight out from its ring's middle), with tighter limits so the replay holds (each atom within 1% of the ring's radius, corners within 0.5°, bonds out within 0.5°), and two more: no double bond in the system is centred (inside is chemfig's `=`, outside its `=_`), unless the ring has a circle, and the system starts no deeper than 8 branches. Else bond by bond. | chemfig has no centred double bond in a ring. (Changed in the build: the plan had outside double bonds bond by bond, but the manual's `=_` puts a ring's second line outside, so a fused side's double bond can be in either ring.) Each ring after another ring's atom is a branch inside it, so a row of 100 phenylenes would nest 200 deep; bond by bond keeps the log2 bound (D7). |
| D10 | Text: TeX's special characters escaped (`\#`, `\$`, `\%`, `\&`, `\_`, `\{`, `\}`, `\backslash`, `\sim`, `\hat{}`), Greek by TeX's names (`escapes.ts`; capitals TeX has no command for become their Latin letters), signs from a table, accented Latin letters with TeX accents in an `\mbox`. Any other character is left out and the notice names it. Text with chemfig's own characters (`-=~<>()[]*?!@|,`) or `\#` goes in braces. | Rule 3. A hostile label cannot add a command. ASCII compiles with any engine and any input encoding. |
| D11 | Colour: an atom's colour on its label and marks (`\color[RGB]{r,g,b}`), a bond's as a TikZ `color=`. Black and no colour write nothing. | Every object takes a colour. The code follows the document's colours, never the screen's theme. |
| D12 | Bond styles as TikZ options in chemfig's fifth bond field: bold (line width), dashed, hashed (dash pattern), wavy (snake; the code's first line says `% Add \usetikzlibrary{decorations.pathmorphing} to the preamble for the wavy bonds.`), dative (an arrow tip), hydrogen bond (dotted; 1.1.2 leaves it out). | PR 127's mapping. The manual puts `\usetikzlibrary` in the preamble, so the code cannot load it. |
| D13 | Notice after a copy or save: "Copied." or "Saved name.tex.", then "The code does not have the arrows, text and highlights." (kinds in a fixed order, plural nouns, no counts), then, if it applies, "It shows quadruple bonds as triple bonds." Characters left out: "…does not have the characters ★ and 中." It replaces "The file has only the structures." | The user knows what to add by hand. Short and plain. |
| D14 | Captions read as chemistry are not in the code (as 1.1.2's export). | chemfig code is a drawing. A formula with no arrow beside it has no place. The notice names the text. |
| D15 | MCP: `read` keeps format `chemfig`. It gets an unlisted `compact` boolean, as pictures have `dpi`. The description changes by one clause. No `run_command` id. | Another session reviews `mcp.ts`, so the change stays small. `copy_*` commands are not in the catalogue: `read` gives the code. |
| D16 | No TeX is installed on this Mac (`which pdflatex lualatex xelatex` finds none; `mdfind` finds no chemfig). `chemfig.check.ts` holds a strict validator and a replay of the geometry. With `CHEMFIG_TEX=<path>` it writes every check's code into one LaTeX file; when `pdflatex` is on the PATH it compiles that file and fails on any error. | The item says to compile when TeX exists and to validate strictly when not. The file lets Sam or a machine with TeX compile all of it at once. Installing TeX needs Sam's yes. |
| D17 | A short decision record, `docs/decisions/00NN-chemfig-code.md`, numbered at the time with the next free number. | CLAUDE.md asks for one for a significant technical decision. Other items may take numbers this week. |

## PR 127 against Octet 1.1.2, feature by feature

| Feature | 1.1.2 | PR 127 | This plan |
| --- | --- | --- | --- |
| Copy to the clipboard | no | Edit > Copy As | Yes (D1, D2) |
| Readable layout, Compact switch | no | yes, readable default | Yes (D5) |
| Ring syntax, circles, fused rings | hooks only | yes | Yes (D9) |
| Bond styles and colours | wedges, double, triple | all | Yes (D12, D11) |
| Hydrogen bonds | left out | dotted | Yes |
| Lone pairs, radicals, circled and partial charges | skeletal charge only | yes | Yes, from the page's own places (D6) |
| Label styles, runs, scripts, colour | no | yes | Yes |
| Greek, signs, escaping | cut to a safe set | mapped, others left in | Mapped; others left out and named (D10) |
| Notice of what is left out | one sentence, export only | detailed | Yes (D13) |
| Comment for a TikZ library | no | yes | Yes, wavy only |
| Multi-centre `*` | empty atom | `*` | As the page draws it (`Drawing.label`) |
| Reaction schemes, `\chemmove` arrows, brackets, names, atom and map numbers, R/S and E/Z | no | yes | Cut (Scope) |
| Export dialog switch | n/a | yes | No: chemfig export is a direct More Formats save |

## Jobs

Each job is done when its checks in the acceptance list pass and `npm test` passes.

- **J1 The command.** A `moreFormats` line "Copy as LaTeX (chemfig)" after Export LaTeX (chemfig)…. It copies
  `chemfigOf(selectedPart() ?? doc)` with `copyPlain`. No structures: "There is no structure to copy." (info), and the
  clipboard is left as it was. Done: the command is in File > More Formats on the Mac, Windows and Linux menus, the
  palette and Settings > Keys while More formats is on, and in none of them while it is off. The copied text equals
  the exported file's text without its last line break.
- **J2 Right-click and Actions.** Copy as LaTeX (chemfig) and Copy as SLN as small items beside Copy as InChIKey,
  kind `library`, in the contexts of D2, only while More formats is on. Done: present and working in the panel, the
  right-click menu and the palette's action list with More formats on; absent with it off; `npm run look` reports no
  `look:` line for them.
- **J3 One writer path.** `chemfigOf(part, compact = settings.chemfigCompact)` in Editor.tsx for Copy, Export and MCP
  `fileText`; `host.ts` the same with `compact` from the call. Done: one drawing gives the same bytes from Copy, Export,
  MCP in the app and MCP headless.
- **J4 Readable layout and Compact chemfig code.** `chemfigCompact` in Settings (default false, read as
  `saved.chemfigCompact === true`). Row in Settings > Pro > File menu under More formats, shown only while More
  formats is on. Done: rule 4 holds for every check drawing; the switch changes Copy, Export and `read`; it persists;
  a second window follows it (the `storage` event, Editor.tsx 3130).
- **J5 Ring syntax.** D9. Done: benzene `*6(`, a circled ring `**6(` with single sides, naphthalene, anthracene and
  phenanthrene nested; pyrene, spiro and bridged systems, a slanted bond out, a fusion atom with a bond out, a ring
  scaled to 150% and a ring with a centred double bond all bond by bond; a ring with an outside double bond in ring
  syntax with `=_`; rings deeper than 8 branches bond by bond; the replay matches the page for each.
- **J6 Bonds.** D11, D12, and type 4 (aromatic) as a double bond on the page's side. Done: each `Display` kind, a
  hydrogen bond and a coloured bond give their TikZ options; a wavy bond adds the comment line; a quadruple bond, a
  crossed double bond and a dashed double bond are named in the notice's second sentence.
- **J7 Marks.** From `Drawing.electrons`: lone pairs (`\:`, or `\|` for bars), unpaired electrons (`\.`), a carbene's
  pair, circled charges (`\oplus`, `\ominus`), partial charges (`\delta^{+}`), a skeletal carbon's sign, a label's
  sign moved by hand; each `\charge` at the page's angle, in the atom's colour. A radical with a charge on a label
  goes where the page draws it, with or without fix/163. Done: each angle within 1° of the page's.
- **J8 Labels.** D10, the label's own bold, italic and underline, its runs, raised and lowered parts, colour. Done:
  every hostile and Unicode case in the stress list passes the validator, and the output is ASCII.
- **J9 Notice.** D13, for Copy and Export. Done: each kind the code leaves out is named once, in the fixed order; a
  drawing with only structures gives "Copied." or "Saved name.tex." alone.
- **J10 MCP.** D15. Done: `read` `{format: "chemfig"}` gives the setting's layout; `compact: true` and `false` give
  one line and the readable code; `compact: "yes"` is refused by the schema; unknown ids and a part with no structure
  give the present errors.
- **J11 Tests, validator, timing.** `src/chemfig.check.ts` (validator, replay, hostile text, corpus, timing),
  `src/textformats.check.ts` (the More Formats line), `src/headless.check.ts` (`read` with `compact`). Done: all pass
  alone and in `npm test`.
- **J12 Record and credit.** The decision record (D17). The code header credits konokonekonoko and PR 127. What's
  New lines go back to the workflow, not into `src/releases.ts`.

## The validator (in `src/chemfig.check.ts`)

It reads the code as chemfig does and fails on anything chemfig would not take:

- Comment lines only at the top, only the known one. After them, `\chemfig{` … `}` once, nothing after it.
- 7-bit ASCII. Braces balance overall and within each atom. `$` pairs within each atom.
- A token grammar: an optional `[:θ]` first; then atoms, bonds `-`, `=`, `=^`, `=_`, `~`, `<`, `>`, `<:`, `>:`, `<|`,
  `>|` with an optional `[angle,length,from,to,tikz]` (angle `:number`, length a positive number, from and to whole
  numbers within the label's atoms), branches `(`…`)`, rings `*n(` and `**n(` (n from 3 to 8, n sides, a nested ring
  n-1 sides), hooks `?[name]` and `?[name,{bond},tikz]` (each name exactly twice, the first plain).
- Control sequences only from a fixed list: `\charge`, `\chemabove`, `\chembelow`, `\phantom`, `\mathrm`, `\mathbf`,
  `\mathit`, `\underline`, `\mbox`, `\boldmath`, `\color`, `\scriptstyle`, `\oplus`, `\ominus`, `\delta`, `\.`, `\:`,
  `\|`, TeX's Greek, the sign table, the accent commands and the escapes of D10.
- `#` never outside braces.
- Hooks: the atom written first carries the plain `?[n]` and the bond is drawn from it, so the writer finds the
  written order first (one pass) and then writes the hooks (added in the build: a bond from a ring's branch back to a
  later ring atom would otherwise put the bond's character on the hook chemfig reads as plain).
- The replay: from chemfig's rules (absolute angles, length factors, a ring at the start with its first atom
  south-west and its last side falling onto it, a ring after a bond turned so the bond bisects its first and last
  sides, hooks), each atom's place, compared with the page's within 0.02 bond lengths.

## Files

| File | Change |
| --- | --- |
| `src/chemfig.ts` | The writer (about 650 lines): PR 127's ring syntax, letters, labels, marks and readable lines, cut to scope, reading `render()`'s output; `chemfigNotice(mol)` for D13. |
| `src/chemfig.check.ts` | Extended (J11). |
| `src/Editor.tsx` | `chemfigOf`; the `moreFormats` line; Export and Copy notices; `fileText` passes `compact`; the More formats flag to Actions. |
| `src/Actions.tsx` | Two small items (D2), their `KIND_OF` entries, the More formats flag beside `online`. |
| `src/settings.ts`, `src/SettingsWindow.tsx` | `chemfigCompact` and its row. |
| `src/mcp.ts` | `compact` in `read`'s schema and `FileOptions`; one clause in the description. |
| `scripts/headless/host.ts` | `compact` passed to the writer. |
| `src/textformats.check.ts`, `src/headless.check.ts` | The new line; `read` with `compact`. |
| `docs/decisions/00NN-chemfig-code.md` | D17. |

No Rust change: More Formats and the `.tex` export already take the new line and text. No new dependency.

## File formats

| Format | Effect |
| --- | --- |
| `.oct`, CDXML, CDX | None. The code is never stored in a drawing. Round trips are unchanged. |
| MOL, SDF, RXN, SMILES, InChI | None. |
| Clipboard | Plain text only, the same type as Copy as SMILES. ASCII with LF line ends. |
| `.tex` (Export LaTeX (chemfig)…) | Same type. Its text is readable by default; it was one line in 1.1.2. Both draw the same. |
| Settings storage | New key `chemfigCompact`. Octet 1.1.2 does not read it; its loader keeps the other settings as they are. |

Octet 1.1.2 opening a file from this build: no file type changes, so it opens every file as before. Octet opens no
`.tex` file. ChemDraw has no chemfig reader; files ChemDraw opens (CDXML, CDX) do not change.

## Stress list

| # | Case | Expected |
| --- | --- | --- |
| S1 | Empty drawing; a selection of only text and arrows; Copy as LaTeX (chemfig). | "There is no structure to copy." (info). The clipboard keeps what it had. Export: "There is nothing to export." MCP: "Octet cannot write this drawing as CHEMFIG." |
| S2 | A lone atom: CH4, H2O, Na+, a lone ¹³C. | `\chemfig{CH_4}`, `H_2O` as 1.1.2, `Na^{+}`, the mass number in braces. Valid. |
| S3 | 40 paclitaxels in a grid (about 2,500 drawn atoms). | Code in under 300 ms (median of 5, render and code, run alone) on Sam's Mac. Taxane rings bond by bond where not regular, phenyls in ring syntax. Nesting within rule 8. Valid; replay within tolerance. |
| S4 | A 500-residue peptide drawn as atoms, then with Residue labels on. | Under 300 ms. Labels such as `{Ala}` braced, bonds on both sides meet them. Nesting within rule 8. Valid. |
| S5 | A 1,000-atom chain; 300 separate salts in a list. | No stack overflow (iterative walk). Chain: depth 0, 1,000 lines. Salts: each hangs off the first at depth 1. Valid. |
| S6 | A 30-membered macrocycle; a cyclic 500-mer. | Bond by bond with one hook. Ring search stops at 8 atoms, so time grows in line with size (growth check: 4 times the atoms, under 10 times the time). |
| S7 | Hostile labels from a file: `\input{/etc/passwd}`, `}{`, `%`, `#`, `$`, `&`, `~`, `^`, `_`, `!@?*|`, a 10,000-character label, control characters. | Every special escaped or braced; no control sequence outside the list; ASCII; braces balance. The validator passes. |
| S8 | Unicode labels: α, Δ, capital Alpha, ±, °, é, ü, ß, 中, an emoji. | `\alpha`, `\Delta`, `A`, `\pm`, `^{\circ}`, accents in `\mbox`; 中 and the emoji are left out and the notice names them. ASCII. |
| S9 | Fused and odd rings: naphthalene, anthracene, phenanthrene; pyrene; spiro[4.5]decane; norbornane; a steroid with a slanted methyl. | Ring syntax nested for the first three. The others bond by bond. Replay within tolerance for all. |
| S10 | One structure turned 17°, one flipped horizontally, one scaled to 150% among others at 100%. | Turned and flipped rings still in ring syntax (first ring turned with `[:θ]`); wedges as the page shows them. The 150% rings bond by bond with length 1.5. Replay within tolerance. |
| S11 | The same drawing at 5% and 4,000% zoom, and in dark mode. | The same bytes as at 100% in light mode. |
| S12 | Colours: coloured labels, bonds and marks; black set by hand; Colour by Element. | `\color[RGB]` on labels and marks, `color={rgb,255:…}` on bonds; black writes nothing; Colour by Element colours each label as the page does. |
| S13 | Marks: two lone pairs, bars, a radical, a triplet carbene, a circled charge, δ+, a pair and a sign dragged round by hand. | Each `\charge` within 1° of the page's angle. Valid. |
| S14 | A radical cation on a label (N•+), before and after fix/163 is merged. | The radical and sign where the page draws them. Valid either way. |
| S15 | Wavy, bold, dashed, hashed, dative and hydrogen bonds; a quadruple bond; a crossed double bond; a dashed (delocalised) double bond. | TikZ options; the comment line for wavy; the notice says it shows quadruple bonds as triple bonds and the others differently. |
| S16 | Hidden H (Toggle Hydrogen Display), Hide implicit H in the style, explicit H atoms. | Hidden H and its bond not written. H counts as the page shows them. |
| S17 | Undo and redo: draw, copy, edit, copy, undo twice, copy, redo. | No undo step from a copy. The third copy equals the first. Redo still works. |
| S18 | The command 50 times in one second (key held). | No error. The clipboard holds the code. One notice shows. The heap after is within 5% of before. |
| S19 | Copy in window A, paste on window B's page and in a text box. | On the page: what pasting text that is not a structure does today; nothing new is drawn and nothing breaks. In a text box: the code as text. |
| S20 | Compact switched on in window A, then Copy in window B. | Window B's copy is compact. |
| S21 | MCP: `read` chemfig with `compact` true, false, `"yes"`; unknown ids; ids of only an arrow; the 40-paclitaxel drawing. | One line; readable; schema refusal; "There is nothing with the id …"; "Octet cannot write these as CHEMFIG."; code under the S3 budget. |
| S22 | Two AI sessions: one reads chemfig while the other edits the drawing. | Each read gives the drawing as it was at that call. No change, no undo step, no error. |
| S23 | A selection, then its atoms deleted by an AI session, then Copy as LaTeX (chemfig). | No error. The code of what is still selected, or "There is no structure to copy." |
| S24 | Half a benzene ring selected. | Its atoms bond by bond (no ring syntax for a part of a ring). Valid. |
| S25 | Two copies of a structure on the same spot. | The second hangs off the first by a `draw=none` bond of length 0. Valid. |
| S26 | Ferrocene (multi-centre bonds), a variable attachment, a polymer bead. | Drawn as the page draws the atoms; the notice names attachment points and beads. Valid. |
| S27 | More formats off: menu, palette, Actions, right-click, a shortcut set earlier. | The command is in none of them; the shortcut does nothing. MCP `read` still gives the code. |
| S28 | Sam's corpus (68 ChemDraw 22.2 CDXML files, local only). | For each: no throw, the validator passes, the notice lists the other kinds. Skipped where the corpus is absent. |
| S29 | One drawing saved as `.oct`, CDXML and CDX, and opened again. | The same code from each (CDXML and CDX within the 0.1° of their rounding). |
| S30 | A label with bold, italic and raised and lowered runs, coloured. | Maths alphabets per run, scripts kept, colour on all of it. Valid. |
| S31 | 100 para-phenylenes in a row; a dendrimer of rings. | The first rings in ring syntax, rings deeper than 8 branches bond by bond. Nesting within rule 8. Valid; replay within tolerance. |

## Acceptance list

| Check | Covers |
| --- | --- |
| `node src/chemfig.check.ts`: validator and replay on every drawing it builds | Rules 2–5, 8; J5–J8; S2, S5–S10, S13–S16, S24–S26, S29–S31 |
| same, readable and compact of each drawing | Rule 4; J4 |
| same, hostile and Unicode labels | Rule 3; J8; S7, S8 |
| same, notice text | J9; S1, S8, S15, S26 |
| same, timing (budget and growth, re-run alone before any timing failure counts) | S3–S6, S21 (time) |
| same, corpus (local) | S28 |
| same, `CHEMFIG_TEX` file; compiled when `pdflatex` exists | Rule 2 (blocked here: no TeX) |
| `node src/textformats.check.ts` | J1 (the line, the icon, the gating) |
| `node src/headless.check.ts` | J3, J10; S21 |
| A node check of `actionItems` with the flag on and off | J2; S27 |
| Dev server (port 1462), WebKit: Copy, then the clipboard read back; Settings > Pro row; Actions and right-click items; S11 (zoom, dark), S17, S18, S19, S20, S23 | J1, J2, J4 |
| `npm run look -- http://localhost:1462/` and the console's `look:` lines | J2, J4 (controls match) |
| `npm test` (full) | Everything |

## Scope

In: J1 to J12.

Cut, with reasons:

- Reaction schemes (`\schemestart`, `\arrow`, `\+`, conditions): need Octet's reaction reading shared by the app and
  the headless host, a second layout system, and TeX to check. Not to standard by Friday.
- `\chemmove` arrows and lines: need two LaTeX runs and node names; nothing here can compile them.
- Brackets and polymer brackets (`\polymerdelim`): two LaTeX runs; same.
- Names and compound numbers under structures (`\chemname*`): split the code into one `\chemfig` per named structure
  and need caption ownership rules. After the core.
- Atom numbers, map numbers, R/S and E/Z labels: need stereo labels from Indigo in both hosts. After the core.
- The Export dialog's compact switch: Octet's chemfig export is a direct More Formats save; Settings has the switch.
- An MCP note of what the code leaves out: keeps `mcp.ts` changes small during its review. The AI app can read the
  other objects with `read`.
- A pdfLaTeX or LuaLaTeX compile: no TeX on this Mac; installing one needs Sam's yes. The validator and the
  `CHEMFIG_TEX` file stand in.
- Check Structure before every Copy As: a change to all Copy As commands, outside this item.
- Reading chemfig code into Octet.

## What's New (draft; final lines go back to the workflow)

- To copy the structures as LaTeX chemfig code, choose File > More Formats > Copy as LaTeX (chemfig). With More
  formats on, the right-click menu and the Actions panel also have it, and Copy as SLN.
- When you copy or export chemfig code, Octet writes one atom on each line and indents each branch. To write it on
  one line, set Settings > Pro > Compact chemfig code to on.
- chemfig code keeps rings in chemfig's ring syntax with their circles, lone pairs, radicals, partial charges, bold,
  dashed, wavy, dative and hydrogen bonds, colours, and label styles. The notice names what the code does not have.
  Much of this is from konokonekonoko's PR 127.
