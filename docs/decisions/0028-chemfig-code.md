# 0028: chemfig code

Status: built 17 November 2026 for release 1.2 (issue 59). The plan is `docs/plans/issue-59-chemfig-copy.md`.

Octet writes structures as code for LaTeX's chemfig package in three places: File > More Formats > Export LaTeX
(chemfig)… (a `.tex` file, since 1.1.2), File > More Formats > Copy as LaTeX (chemfig) (the clipboard, new in 1.2),
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
7. **The notice names what is not in the code**, in a fixed order ("The code does not have the arrows, text and
   highlights."), and what it shows another way ("It shows quadruple bonds as triple bonds.").

## Not in this release

Reaction schemes (`\schemestart`), `\chemmove` arrows, `\polymerdelim` brackets, names under structures
(`\chemname`), atom and map numbers and R/S and E/Z labels, and reading chemfig code. PR 127 had the first five;
they need TeX to check and two LaTeX runs, and nothing on this Mac compiles LaTeX.

## How it is checked

`src/chemfig.check.ts` reads every output strictly as chemfig would (grammar, braces, ASCII, the command list, hooks,
`#`) and replays chemfig's placing rules (from its manual and source: absolute angles, lengths, a ring at the start
and after a bond, nested rings) to put each atom within 0.02 bond lengths of the page. It runs on hand-built drawings,
real molecules from SMILES (40 paclitaxels, a 500-residue peptide), hostile labels and Sam's local corpus. With
`CHEMFIG_TEX=<file>` it writes every drawing's code into one LaTeX file; where `pdflatex` is on the PATH it compiles
it. No TeX is installed on this Mac, so the outputs have not been compiled yet.
