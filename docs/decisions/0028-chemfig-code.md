# 0028: chemfig code

Status: built 17 November 2026 for release 1.1.3 and 1.2 (issue 59). 1.1.3 ships with the AI features off, so an AI
app's `read` comes with 1.2. The plan is `docs/plans/issue-59-chemfig-copy.md`.

Octet writes structures as code for LaTeX's chemfig package in three places: File > More Formats > Export LaTeX
(chemfig)… (a `.tex` file, since 1.1.2), File > More Formats > Copy as LaTeX (chemfig) (the clipboard, new in 1.1.3),
and an AI app's `read` with format `chemfig`. Much of the writer is from konokonekonoko's pull request 127.

## What was decided

1. **One writer.** `chemfig()` in `src/chemfig.ts` gives the code and the notice's words. The editor's `chemfigOf`,
   the headless host and the MCP `read` all call it, so the same drawing gives the same bytes everywhere.
2. **Readable by default.** One atom with its bond on each line, each branch's brackets on lines of their own, a tab
   for each level. Settings > Pro > Compact chemfig code (off) writes one line. The row shows only while More formats
   is on. `read` takes `compact` (true or false); without it, the user's setting. chemfig ignores the line breaks and
   tabs between bonds and atoms, so both draw the same: the readable lines, trimmed and joined, are the compact code.
3. **The page decides.** The writer reads `render()`'s output: which atoms show a label, where each lone pair, dot,
   circled or partial charge and moved sign is (`electrons`), and which side each double bond's second line is on
   (`sides`). Nothing in `render.ts` changed for this, so the hot path is untouched, and the charge fixes of 1.2 (a
   radical ion's dot and sign, a label's sign moved by hand) come out right with no change here.
4. **Ring syntax where chemfig draws what the page has.** A regular ring of 3 to 8 atoms, or an ortho-fused system of
   them (nested), is written as `*6(…)` (`**6(…)` with its circle). The limits are tight (1% of the radius, half a
   degree) so chemfig's own ring places each atom within a fiftieth of a bond of the page. A centred double bond, a
   spiro, bridged or peri-fused system (pyrene), a fusion atom with a bond out, a slanted bond out, a ring of another
   size than the drawing's bond, and any system that would start more than 8 branches deep are written bond by bond.
   chemfig's `=_` puts a ring's second line outside, so a fused side's double bond can be in either ring.
5. **Nesting stays shallow.** The largest subtree runs on as the main chain (1.1.2's rule), so branches nest at most
   log2(atoms) deep; a row of 100 rings does not nest 200 deep.
6. **Text cannot become code.** Every character of a label is escaped, mapped to a known TeX command (Greek, signs,
   accents in an `\mbox`) or left out; the notice names what was left out. The code is 7-bit ASCII and holds no
   command outside a fixed list.
7. **TeX reads every label.** Each chemfig atom's characters are typeset at once, so its raised characters are one
   `^{…}` and its lowered ones one `_{…}`; a third part starts on `{}`. Unicode scripts, primes and the degree sign
   count as raised or lowered characters, so `Fe³⁺` typed and Fe with 3+ set by Text > Superscript give the same code.
   TeX stops at a double script, and the first build of this writer gave one for Fe with III raised.
8. **Colour as the page draws it.** A coloured atom's dots are `.style={draw=<colour>,fill=<colour>}` and its bars
   `|style={draw=<colour>,line width=0.4pt}` (chemfig's own defaults with the colour for black). An aromatic circle
   takes the colour the page gives it: `**[0,360,color=<colour>]6(`. Black writes nothing.
9. **Limits that keep TeX running.** No bond in the code is under 0.01 bond lengths, so two bonded atoms on one spot
   give a bond with a direction. A ring system in ring syntax nests at most 16 rings deep; a longer ladder (only a
   hostile file has one) is bond by bond. Each branch and ring is a TeX group, and pdfTeX stops at 255, so the code
   nests at most log2(atoms) + 24 levels.
10. **The notice names what is not in the code**, in a fixed order ("The code does not have the arrows, text and
   highlights."), and what it shows another way ("It shows quadruple bonds as triple bonds."). A circled ring written
   bond by bond (too deep for ring syntax) has no circle, so the notice names the aromatic circles.
11. **A ring bond by bond closes on a plain bond where it can.** A hook takes a coloured or styled bond's TikZ options,
   but a double bond on a hook has no side, so a double bond or wedge closes a ring only where nothing else is left.

## Added for 1.1.3 (issue 59 reopened)

12. **PR 127's other features**, in the same writer (`docs/plans/issue-59-59-1-1-3.md`): reactions as
   `\schemestart` rows (the Editor gives the drawing's or the selection's reactions), `\chemmove` for curved arrows,
   lines and lone reaction arrows, `\polymerdelim` for brackets round atoms, `\chemname*` for names under
   structures, atom and map numbers and R/S as `\charge` items, and E/Z as an atom by its bond. A drawing with a
   scheme or a name has a `\chemfig` for each compound; one with neither is one `\chemfig`, byte for byte as before.
   `\polymerdelim` and `\chemmove` go after the code, and a comment line asks for two LaTeX runs.

## Not in this release

Reading chemfig code, branching schemes, and arrows outside a scheme that `\chemmove` does not draw (equilibrium,
retrosynthetic, no-go, dipole, block, orbitals, fragmentation lines, pen curves). Nothing on this Mac compiles LaTeX.

## How it is checked

`src/chemfig.check.ts` reads every output strictly as chemfig would (grammar, braces, ASCII, the command list, hooks,
`#`), reads it again as TeX would (`scripts/chemfiglint.ts`: double scripts, maths and text commands, `\color`
values, line length) and replays chemfig's placing rules (from its manual and source: absolute angles, lengths, a
ring at the start and after a bond, nested rings) to put each atom within 0.02 bond lengths of the page. It runs on
hand-built drawings, real molecules from SMILES (40 paclitaxels, a 500-residue peptide), hostile labels and Sam's
local corpus. With `CHEMFIG_TEX=<file>` it writes every drawing's code into one LaTeX file; where `pdflatex` is on
the PATH it compiles it. No TeX is installed on this Mac, so the outputs have not been compiled yet.
