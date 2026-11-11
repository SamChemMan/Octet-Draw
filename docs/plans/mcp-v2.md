# Octet Draw MCP, version 2: the new architecture (10 November 2026)

For the next session (Fable 5.2) to build from. Written by Claude after the taxol run, at Sam's request. Decisions
marked **Sam** are his. The rest are proposals Sam can change.

Read first: `docs/decisions/0021-mcp.md` (what the MCP is), `docs/plans/mcp.md` sections 8 and 19 to 21 (decisions and
the speed work so far), `CLAUDE.md` (the brief, the AI apps paragraph, decision 0024), and
**`docs/plans/mcp-v2-tests.md`: everything v2 must be tested against.** Taxol (`scripts/mcp-bench/taxol/`) is one case
among many: Sam picked it at random. Do not tune v2 to it.

**Order (Sam, 11 November 2026):** 1.1.2 ships first, on Friday, from `release-1.1.2`: `ole-1.2` without the MCP, plus
the bug fixes and features in `~/Desktop/big-workorder-1.2.md`. This work is for 1.2, on the branch `release-1.2-mcp`
(made from `origin/ole-1.2`). The MCP also becomes the scripting interface (#89) and the hidden batch-conversion engine
(#91). Sam's goal: as fast as physically possible, with the time per tool call in every commit message.

## Start here, Fable: ask Sam for these before building

Sam asked (10 November 2026) that the session building this asks him for each item below **at the start, before any
code**. Use the ask-question tool, one item at a time. Write the answers and the files' paths into this section, then
begin.

1. **The scheme that crashed his friend's 1.1.1.** He will provide it. Ask where the file is. It is a test case for R3
   and P6 in `mcp-v2-tests.md`, and for the 1.1.2 crash fix.
2. **Open-access papers to use as test data.** He will provide some. Ask for the PDFs or links. For each, confirm it is
   open access and note its licence. They become the route corpus (`mcp-v2-tests.md` section 6.1).
3. **Branches and files** (section 14): does `release-1.2-mcp` exist yet, with the unpushed R7 commit `8b84ab7` on it?
   How do this plan and the other uncommitted MCP files in the `n-ole` worktree move onto it? Nothing is committed or
   pushed until he says.
4. **The animation** (section 9): a molecule building, Octet's mark, or something else? May it bounce?
5. **A style from a file** (section 3, question 1): saved as his default for AI apps, or for this session only?
6. **Old tool names:** remove the v1 names in 1.3, or keep them longer?
7. **Named transformations** (phase 3b): build them, or stop at 3a if the benchmark is good enough?
8. **The non-Anthropic AI app to test** (`mcp-v2-tests.md` A3): ChatGPT, Cursor or another?
9. **Eval spending reports:** the budget is set (below). Ask how he wants the spend reported: after each run, or daily.
10. **Scripting (#89) and batch conversion (#91):**
    - What must a script be able to do: the same as the MCP tools, or more?
    - Where does batch conversion run: a hidden command line, through the MCP, or both?
    - Which formats come first?

    Batch conversion has no menu item (Sam).

### Sam's answers (11 November 2026)

1. **The crash scheme: Sam does not have it.** It was very large. He has the crash log
   (`~/Downloads/crash.log`: five stops in one minute, the stack the work order maps to `analyseAll` in `chem.ts`).
   R3 and P6 run on drawings built for the purpose: 200 structures, a 50-step route, a 2,000-atom molecule, a 10 MB
   CDXML, and Indigo's memory over 100 calls. If the friend's file arrives, it is one more case.
2. **Papers.** Six, in `~/Downloads`. Licences checked in each PDF and on Crossref:

   | Paper | DOI | Licence | Use |
   |---|---|---|---|
   | Robinson et al., Programmable remodelling of carbon–nitrogen connectivity in amines, Nature 2026 | 10.1038/s41586-026-11009-1 | CC BY 4.0 | May be committed, with attribution |
   | Grocott and Gaunt, One-carbon homologation of alkenes, Nature 2025 | 10.1038/s41586-025-09159-9 | CC BY 4.0 | May be committed, with attribution |
   | Trowbridge, Reich and Gaunt, Multicomponent synthesis of tertiary alkylamines by photocatalytic olefin-hydroaminoalkylation, Nature 2018 | 10.1038/s41586-018-0537-9 | © Springer Nature, all rights reserved | Local only |
   | Zu et al., Direct enantioselective C(sp3)−H coupling of N-alkyl anilines via metallaphotoredox catalysis, Nature Chemistry | 10.1038/s41557-025-02018-0 | Exclusive licence to Springer Nature | Local only |
   | Proctor and Phipps, Recent Advances in Minisci-Type Reactions, Angew. Chem. Int. Ed. 2019 | 10.1002/anie.201900977 | Wiley terms | Local only |
   | Gaunt, Johansson, McNally and Vo, Enantioselective organocatalysis, Drug Discovery Today 2007 | 10.1016/j.drudis.2006.11.004 | © Elsevier, all rights reserved | Local only |

   **Local only (Sam):** the PDF, its figures and its text never go in the repository. Only what we write ourselves
   is committed: each compound's SMILES and InChIKey, the conditions, and a citation. None of the six is a long total
   synthesis: they give methodology schemes, substrate scopes (F4), mechanisms and catalytic cycles (S12, S13, S14) and
   stereo outcomes (S20). The long routes (S3, S4) are taxol and routes we write from public structures.
3. **Branches.** `release-1.2-mcp` was made from `origin/ole-1.2` by the 1.1.2 session (11 November, 02:06 UTC),
   in the worktree `.claude/worktrees/r12mcp`. R7 (`8b84ab7`) is cherry-picked onto it (`a011b6d`, no conflicts). The
   v2 files are carried from `n-ole` as Claude thinks best. Nothing is pushed until Sam says.
4. **The animation: a molecule building, with a small bounce.** `brand/BRAND.md` gets the second allowed overshoot.
   Reduced motion still gets a still molecule and fades.
5. **A style from a file: that session only.** Nothing is stored, and there is no new setting.
6. **Old tool names: remove them.** Nobody but Sam has used them. So there is no compatibility layer (section 5.3 is
   dropped): the acceptance script, the evals and the headless runner move to the new names in step 5.
7. **Named transformations: build them** (phase 3b is in 1.2). Sam: the day estimates in section 14 are human times;
   push on.
8. **The non-Anthropic AI app: Claude chooses.** Gemini CLI: it is scripted from a terminal, and it is another model
   family. It needs Sam's Google sign-in at that step.
9. **Eval spending: no reports.** The evals run on the Claude Ultra subscription. The runner still records tokens for
   each case (test plan section 13), as that is free.
10. **Scripting (#89) and batch conversion (#91):**
    - A script uses the same tools as AI apps. Run from the command line, it may also open and save files and loop
      over a folder. AI apps still have no file access (decision 0021's "no files" rule holds).
    - Batch conversion runs from the command line only (Claude's choice): a hidden `--convert` with no window, on the
      headless code. No MCP tool, as that would need file access.
    - Formats: everything Octet opens and saves, through the app's own open and export code.

Already answered by Sam (10 November 2026). Do not ask again:

- **A single structure ("draw caffeine") does not need the brief.** The brief is required for schemes, routes, figures,
  cycles and grids (section 3.1).
- **Scoring and user studies: Sam only.** He scores the drawings (L9) and is the user in X7.
- **Eval budget:** up to 100% of one weekly usage limit on the Ultra plan, about US$5,000 of API credit, for the whole
  v2 eval programme. Plan the runs to fit it, and report the spend.
- **The crash scheme and the papers:** he will provide both (items 1 and 2 are to get them).

## 0. Why: what the taxol run showed

On 10 November 2026 Claude drew the Nicolaou taxol synthesis (three schemes, 20 compounds, 17 steps) from the paper with
the MCP. It worked and looked good. It took far too long.

| Measured | Time or size |
|---|---|
| Octet drawing one scheme (`draw_reaction`, in the app) | 1.2 to 1.6 s |
| The same headless (`scripts/headless/draw.ts`) | 0.6 to 2.6 s |
| `read_drawing` short / full / with a large picture | 0.4 s, 75 KB / 0.7 s, 97 KB / 4.6 s, 465 KB |
| `tools/list` (26 tools) | about 44,000 characters (about 12,500 tokens), read at the start of every chat |
| Largest schemas | `edit` 8.3k characters, `draw_reaction` 5.6k (the molecule object repeated in every slot), `run_command` 4.4k |
| MCP calls in the run | about 40: about 8 failed on argument form, about 15 were layout and style fixes |

Where the time went, largest first:

1. **Claude writing structures.** All 20 compounds as full SMILES with stereochemistry, by hand. Each intermediate is
   the one before with one change, but the MCP had no way to say that.
2. **Fixing after drawing.** With no brief, Claude picked the Nature preset (6 pt labels, too small), then A3, then A3
   landscape. Schemes ran off the page and rows were moved one call at a time. A scheme title given `below` a
   structure became a reagent on the next arrow.
3. **Failed calls.** These were refused:
   - `number` as a number ("not text").
   - `new_drawing` without `for`.
   - `format: "MOL"` (only "mol" is accepted).
   - `detail: "summary"`.
   - `replace_structure` refusing the MOL text Octet's own `get_file` wrote.
   - `$3.made` where one id was needed.

   Each cost a round trip and more thinking.
4. **Reading to check.** Replies of 75 to 465 KB, plus pictures, read and re-read to find what to fix.
5. **Blocking.** A large batch took over 30 s, and calls on the same session waited behind it.

Octet was never the slow part. The design asks the AI to do work that code should do.

## 1. The principle

> **The AI says what it wants in the fewest exact words. Octet does everything that has one right answer: structures
> from earlier structures, layout, page fit, style, numbering, checking.**

Rules for every v2 tool:

- **R1. One call for one job.** A scheme, a route or a figure is one call. Fixes are the exception.
- **R2. Ask before drawing.** Where the drawing goes, and in what style, is known before the first stroke (section 3).
- **R3. Say a structure once.** Later structures are written as changes to earlier ones (section 4).
- **R4. Octet lays out.** Nothing drawn in one call runs off the page, overlaps or needs moving.
- **R5. Take what the AI sends.** Accept every reasonable form; refuse only what is wrong (section 6).
- **R6. Answer short.** A result says what was done and what is wrong, in a few lines. Detail only on request.
- **R7. Never block.** A job over about 3 s runs in the background and reports progress (section 8).
- **No model inside Octet.** The user's AI app is the model (section 12).

## 2. What changes, at a glance

| Area | Now (v1) | v2 |
|---|---|---|
| Tools listed | 26, about 12,500 tokens | 7 core tools plus `advanced`; target under 4,000 tokens |
| Before drawing | Nothing asked; the style stays as it is | **Brief required** (3 questions, **Sam**), kept for the session; drawing tools refuse until it is given |
| Style | Whatever the drawing has; the AI may pick a preset | From the brief: Quick start (ACS 1996, no page) by default (**Sam**), a journal or purpose when the user says, or the style of the user's own file |
| Structures | Each as a full name, SMILES or molecule | Also `from` an earlier compound with `changes` (labels swapped, groups added, removed or changed, named transformations) |
| A synthesis | Several `draw_reaction` calls; titles and row moves by hand | One `draw_route`: schemes, titles, numbers, wrapping and page fit in one call |
| Arguments | Strict; small differences refused | Lenient: coerce what has one meaning, refuse only what is wrong, say how to fix it |
| Results | Sentence plus full JSON (boxes, names, every id), often 9 to 25 KB; reads up to 465 KB | `summary` by default (a few hundred characters); `detail: "full"` gives today's data |
| Long jobs | One blocking call with a 120 s wait | Background job; the `job` tool shows progress or the result; the overlay shows progress |
| Molecule schema | Repeated in every slot of every tool | Defined once (`$defs`) and referred to everywhere |
| Asking the user | Not used (plan section 8, decision 4) | Used for the brief where the AI app supports MCP elicitation; otherwise the AI asks in chat |
| While the AI works | Blur and glow overlay (`McpMagic.tsx`, uncommitted) | A playful animation for the whole time the AI works, not only during a call (**Sam**, section 9) |

## 3. The brief (required, **Sam**)

Sam's rule: before any scheme or figure is drawn, the user is asked three questions. It is a MUST.

1. **"Do you have a preferred working style?"** If yes: "Send me a drawing in that style" (a CDXML, a `.oct`, or the
   name of an open drawing). Octet reads its document style (bond length, line widths, fonts, sizes) and uses it.
2. **"Where is this going, and how big does it need to be?"** A paper (which journal; one column or two), a thesis,
   slides, a poster, a lab notebook, or a quick look. Octet picks the style and page from the answer, and **says when
   the drawing will not fit**. Example: "17 steps at this size need two pages at Nature's two-column width. Shall I
   split it into three schemes?"
3. **"Is there anything you want to emphasise, or a layout you want to follow?"** Groups to highlight, a figure to copy,
   colours, what goes on one row.

Default when the user has no preference (**Sam**): **Quick start**, ACS Document 1996 on the seamless canvas with no
page (`QUICK_STYLE` in `docstyle.ts`). There, running past a page edge is not a problem. Octet never picks a journal
preset on its own.

### 3.1 How it is enforced

- New core tool **`set_brief`**:
  ```
  { style?: { from_drawing?: string, from_file?: string /* CDXML or .oct text */, none?: true },
    destination: { kind: "quick" | "paper" | "thesis" | "slides" | "poster" | "notebook",
                   journal?: string /* a preset name */, columns?: 1 | 2, size_mm?: [number, number] },
    emphasis?: string, layout?: string }
  ```
  It applies the style and page in one undo step. It returns the brief as Octet read it, plus Octet's advice.
- The brief is kept **per MCP session**. `Session` in `mcp.rs` gets `brief: Option<String>` (JSON), sent to the page
  with each request in `From`, as `session` and `client` are now. A new session starts with no brief.
- **Every tool that draws a scheme, route, figure, cycle or grid refuses until there is a brief:** `draw_route`,
  `draw_reaction`, `draw_cycle`, `draw_figure`, `draw_structures` with more than one structure, and `batch` steps that
  do any of these. **A single structure needs no brief (Sam, 10 November 2026):** "draw caffeine" draws it at once in
  the drawing's style (Quick start in a new drawing). One structure from `place_template` or `add_file` is the same. The
  refusal is a normal tool error that tells the AI what to do, word for word:
  > Octet needs the brief first. Ask the user these three questions, then call set_brief: 1. Do you have a preferred
  > working style? If so, ask them for a drawing in it. 2. Where is this going, and how big does it need to be? 3. Is
  > there anything to emphasise, or a layout to follow?
- The server **instructions** say the same in their first lines, so a good AI app asks before its first call and never
  meets the refusal.
- Tools that do not draw new content (`read_drawing`, `list_drawings`, `use_drawing`, `get_file`, `export`, `select`,
  `edit`, `move`, `delete`) work with no brief. A user who asks "what is wrong with my drawing?" is not questioned.
- **Elicitation:** the client declares `capabilities.elicitation` at initialize (MCP 2025-06-18 and later). When it
  does, `set_brief` with answers missing asks the user directly in the AI app, as a form: an enum for the destination,
  free text for the rest. When it does not, the refusal above is the fallback. This reverses plan section 8, decision
  4. That decision was about confirmations, which stay unused. Transport work is in section 7.3.
- `docs/decisions/0021-mcp.md` and `docs/plans/mcp.md` section 8 change to say so.

### 3.2 Advice on fit (question 2)

Before drawing, Octet works out whether the job fits the destination:

- It compares the page inside its margins (`pageSize` and `PAGES` in `docstyle.ts`; journal widths such as Nature 89
  and 183 mm, ACS1, ACS2) with the width each row needs at the destination's bond length.
- It says plainly what will not fit and offers choices: more rows, split into schemes, a smaller scale, two columns,
  a larger page. It never shrinks text below the destination's own size to make things fit.
- Quick start has no page, so it gives no advice on fit.

## 4. Compounds as changes to earlier compounds

The biggest saving. In a synthesis, almost every compound is the one before with one change. v2 lets the AI say that.

### 4.1 The compound object (one definition, used everywhere)

Every place that takes a structure today (`text`, `molecule`, `labels`, hints) takes this instead, defined once as
`$defs.compound`:

```
compound = {
  text?: string,            // name, SMILES, InChI, CAS, MOL (as now)
  labels?: string[],        // one per * (as now)
  from?: string,            // an earlier compound: its number ("13"), its id ("s52"), or "previous"
  changes?: change[],       // applied to `from`, in order
  number?: string | number, // compound number (a number is read as text)
  ...hints                  // up, down, left, right, rotate, flip, geometry, colours, like (as now)
}
change =
  | { swap: { [label: string]: string } }             // label for label: { "OBn": "OTES" }
  | { at: string, set: string }                       // the group on a named atom becomes this: { at: "C10", set: "OAc" }
  | { at: string, add: string } | { at: string, remove: true }
  | { bond: string, to: "single" | "double" | "triple" }
  | { do: transformation, at?: string }               // a named transformation, section 4.3
```

- `from` with no `changes` is the same compound again, drawn the same way round (today's `like`, made automatic).
- A compound with `from` inherits its orientation from `from` (Augmented Clean Up Reaction, as
  `keep_orientation` does now).
- Octet checks every result: valence, stereo kept where the change does not touch it, and a warning when a change
  touches a stereocentre.

### 4.2 Naming atoms: how the AI says "C10"

The AI needs to name a place without atom ids. Three ways, in this order:

1. **Labels as anchors** (phase 1, simplest, covers most protecting-group work). A labelled group is its own anchor:
   `{ swap: { "OBn": "OTES" } }`. When a label appears twice, the AI adds `occurrence: 2`.
2. **Map numbers in the SMILES** (phase 1). The AI writes the first compound with atom maps on the atoms it will
   change later: `C[C@H:10](O)...`. Octet keeps the maps through every change and does not draw them. `at: "10"`
   names that atom in any later compound. This is exact and costs the AI almost nothing.
3. **Natural product numbering** (later, optional). For known skeletons (taxane, steroid, prostaglandin), a table maps
   C1 to C20 onto a SMARTS for the skeleton. Only after 1 and 2 work.

### 4.2.1 As built (step 3a, 11 November 2026): `src/compound.ts`

- **A group** is a part of the compound joined to the rest by one bond. It is named by a label: a label written on an
  atom (`OBn`), or atoms that are that label's structure (a benzyl ether drawn atom by atom is `OBn` too). `swap`
  takes any group so. `=O` and `#N` say the bond.
- **`at` is a map number** (`"7"`, or `"C7"`) and names **the atom that carries the group. That atom stays.** Its group
  is its one group through an atom that is not carbon (OH, OTBS, =O, Br: the functional group); with none, its one
  carbon group. `set` puts the new group where the old one was, `remove` leaves a hydrogen, `add` takes the place of a
  hydrogen. An atom with two such groups is refused with both named. `swap` with `at` then says which: the group of
  that name on that atom. `at` can also be a label, which is then the group itself.
- **A group is the smaller side of its bond.** When the part on the atom has more atoms than the part that stays
  (the benzoate on an ethyl's carbon, the phenoxy on a methyl's), Octet refuses and names both sides: the AI app may
  mean to keep the larger part. `swap` by label is then the way (`{ swap: { OEt: "OH" } }`). A protecting group drawn
  atom by atom on a substrate smaller than it is refused the same way.
- A group with the opposite charge to its atom's (an N-oxide's O, a sulfoxide's drawn S+ and O−) is removed with both
  charges, and the atom takes no hydrogen.
- **Nothing else moves.** The new group is a label on the old group's first atom, on the same bond with its wedge, so
  each stereocentre keeps its configuration (retention at the atom a change is made at, and the reply says so). A
  group added at a stereocentre goes where the hydrogen was: Octet tries each gap, plain, hashed and wedged, and
  keeps the one that reads as the centre did.
- **Refused, never guessed:** a group that is there twice with no `occurrence`; a label or number that is not there
  (the reply lists the compound's numbers and labels); a change that breaks valence; a new double bond drawn atom to
  atom that could be E or Z; a bond between atoms that are not bonded (a ring or chain made or broken); `from` that
  names nothing, two structures of the drawing with one number, or two compounds of the call with one number that
  are not one compound; a key that does not go with the change (`to` with `set`, `occurrence` with an atom's number);
  a label on a double or triple bond that Octet's label reader gets wrong (`=CHCO2Et`, `=CHCN`: it reads a label as on
  a single bond, and these come out with no C=O or C≡N. Fixing the reader is work for `labels.ts`, not for 3a).
- **Said in the reply, not refused:** a new group Octet cannot read and that is no generic group (`OTBDSP`: it is
  drawn as a label with no structure, as `L` or `EWG` is on purpose); a new double bond to a label that can be E or Z
  (a label is drawn neither way); a numbered atom written with no hydrogens (`[C:7]` is a radical in SMILES).
- `from` by a number is every part under that number (both ions of a salt). Changes made on a structure itself
  (`edit`, `replace_structure` with changes alone) leave it where its atoms are. `edit`'s reply has what
  `replace_structure` says: the new name, what happened at each stereocentre, and the new id.
- **Not in 3a:** a new stereocentre or E/Z bond with a set configuration, and rings made or opened (acetonides,
  epoxides, carbonates, lactones). These are the named transformations of 4.3. Until then such a compound is written
  in full.
- Map numbers are kept on the atoms in memory (`Atom.tag`), through every change and from call to call. They are not
  drawn, and no file has them. A drawing saved and opened again has lost them.
- The compound is listed once in each tool (`$defs.compound`), and `changes` is listed as a list of objects that
  `compound.ts` checks itself, so `tools/list` did not grow with the feature. Its descriptions then added 286
  characters (the review of 11 November).
- **Left for step 5:** the change forms typed in the schema (they are in `draw_structures`' description only: typing
  them is about 1,500 characters over the 52,000 that `mcp.check.ts` allows, and 132 are left); the evals, which
  have not been run on `from` and `changes`; and the idempotent hint of `replace_structure` and `edit`, which is
  wrong for changes alone on a structure named by its number (a second call makes the change again, as `edit`'s
  `rotate` does). Merge this branch before others that add to a description.

### 4.3 Named transformations (phase 2)

A small library of reaction templates (SMIRKS-like, run with Indigo's reaction tools in `chem.ts`), each with a short
name:

| Kind | Names |
|---|---|
| Protect and deprotect | `protect: TBS / TBDPS / TES / TMS / TIPS / Bn / PMB / MOM / Ac / Bz / Boc / Cbz / acetonide`, `deprotect: <same>` |
| Oxidation level | `oxidise` (alcohol to aldehyde or ketone), `reduce` (carbonyl to alcohol; ester or lactone to diol), `epoxidise`, `dihydroxylate`, `hydroborate` |
| Carbonyl | `acetylate`, `benzoylate`, `esterify`, `hydrolyse` |
| Other | `hydrogenate`, `open_epoxide`, `form_carbonate` |

- Each takes `at` (a map number or label) and a stereo choice where the change makes a centre: `face: "alpha" |
  "beta"`, or `like: "<compound>"` to copy it.
- When a transformation does not apply cleanly (no match, or two places match), Octet refuses and names the places it
  found. It never guesses.
- This is the hard part (stereochemistry). Build 4.1 and 4.2 first, measure, then decide.

### 4.4 What the taxol route looks like in v2 (target)

```
{ number: "3",  from: "2",  changes: [{ at: "7", set: "OTBS" }, { at: "4", set: "OTBS" }, { swap: { "CO2Et": "CH2OH" } }] }
{ number: "4",  from: "3",  changes: [{ at: "7", set: "OBn" }, { swap: { "CH2OH": "CH2OTBDPS" } }] }
...
{ number: "17", from: "16", changes: [{ swap: { "OBn": "OTES" } }, { at: "20", set: "OH" }] }
```

That is about one line a compound instead of a 150-character SMILES with stereochemistry.

## 5. The tools

### 5.1 Core (listed in full)

| Tool | What | New or changed |
|---|---|---|
| `set_brief` | The three answers; applies style and page; returns advice | **New** |
| `draw_route` | A whole synthesis: schemes (each with a title), compounds (section 4), steps, wrapping and page fit from the brief | **New**. Built on `draw_reaction` and `draw_figure` code |
| `draw` | Structures, one reaction, a cycle or a figure: `{ kind: "structures" \| "reaction" \| "cycle" \| "figure", ... }` | **Merges** `draw_structures`, `draw_reaction`, `draw_cycle`, `draw_figure`; their arguments stay as they are |
| `change` | Edit, move, delete, restyle objects, numbers, text, arrows, shapes: a list of operations, one undo step | **Merges** `edit`, `move`, `delete`, `set_number`, `add_text`, `add_arrow`, `add_shape`, `arrange`, `replace_structure`, `select` and `batch` |
| `read` | The drawing: `summary` (default), `full`, `picture`, `file` (CDXML, MOL, SMILES and so on) | **Merges** `read_drawing` and `get_file`; short by default |
| `drawings` | List, use, new | **Merges** `list_drawings`, `use_drawing`, `new_drawing` |
| `job` | A background job's progress or result; cancel | **New** (section 8) |

### 5.2 `advanced` (one tool, listed briefly)

`{ tool: string, args: object }` for everything else: `run_command`, `fill_experiment`, `place_template`, `add_file`,
`export`. Its description lists the names and one line each. The full schema of one is returned by
`advanced { tool: "help", args: { of: "run_command" } }`. Rarely used, so it costs nothing to list.

### 5.3 Compatibility

- v1 tool names stay callable for one release. They are not listed, but `tools/call` with an old name still works and
  maps to the new tool. The acceptance script, evals, headless runner and anything a user scripted keep working.
- `mcp.check.ts` gets a test for each old name mapping to the new one.
- Remove the old names in 1.3.

### 5.4 `draw_route` in detail

```
{ title?: string,
  schemes: [{ title: string /* "Scheme 1. C-ring aldehyde 7" */,
              start: compound[],
              steps: [{ products: compound[], reagents?, catalysts?, solvents?, temperature?, time?, atmosphere?,
                        yield?, above?: string[], below?: string[], label?: string /* "a, b" */ }] }],
  legend?: "none" | "letters" /* steps as a), b) with conditions in a footnote, as a paper does */ }
```

- Compounds are numbered across schemes. A compound that ends one scheme and starts the next is drawn twice but has
  one number (no "number on more than one structure" warning).
- Titles are free text above each scheme, never attached to an arrow (fixes the bug in section 0).
- Wrapping: each scheme wraps to the page width from the brief. Rows are balanced (no lone last compound).
- With `legend: "letters"`, long conditions go into a footnote under the scheme (a, b, c...) with short letters over
  the arrows, as the paper's figures do. That keeps arrows short and rows dense.
- The reply is a summary: schemes drawn, compounds, warnings, check, and the advice if anything did not fit.

## 6. Lenient arguments (R5)

Today `check()` in `mcp.ts` refuses anything not exactly in the schema. v2 adds a **coerce step before check**, for
forms with one meaning only:

| AI sends | Octet reads |
|---|---|
| `number: 13` | `"13"` |
| `format: "MOL"`, `"Mol"`, `".mol"` | `"mol"` (enums are case-blind and take a leading dot) |
| `detail: "summary"`, `"short"`, `"brief"` | `"summary"` (each enum lists its synonyms) |
| `new_drawing {}` | `for: "quick"` (a missing argument with a safe default takes it) |
| A MOL or CDXML block in any `text` | Read as that file (fixes `replace_structure`) |
| `$3.made` where one id is needed and step 3 made one top-level object | That object |
| `"1 (taxol)"` as a number | Number `1`, caption `taxol` |

Rules:

- Coerce only where there is one meaning. Anything else is refused as now.
- Each coercion is reported in the reply as one short line ("read number 13 as text"), so the AI learns, and the evals
  can count them.
- A refusal always says the fix in one line, with the accepted values. That is true today: keep it.

## 7. The transport (`src-tauri/src/mcp.rs`)

### 7.1 What stays

Streamable HTTP on 127.0.0.1, the bearer key, the Origin and Host checks, the rate limits, sessions, the relay for
Claude Desktop (`--mcp`), and `.mcpb` install. All of it is good and tested.

### 7.2 What changes

- `Session` gets `brief: Option<String>` and `jobs: HashMap<String, Job>`.
- `From` (sent to the page with each request) gets `brief` and `elicit: bool` (the client supports elicitation).
- New command `mcp_brief(session, brief)` so the page stores the brief after `set_brief`.

### 7.3 Elicitation

The server needs to send a request to the client mid-call and wait for the answer.

1. The tool call's POST is answered with an event stream (already done for progress).
2. The page asks Rust (`mcp_elicit(id, body)`), which writes an `elicitation/create` request on that stream, with a new
   JSON-RPC id.
3. The client answers with a new POST carrying that id as a response. `handle()` in `mcp.rs` matches it to the waiting
   call and gives it back to the page (`mcp_elicited` event).
4. The page carries on with the answer, or treats "decline" and "cancel" as no brief.

Test it with a small client in `scripts/` that answers elicitation, as `mcp-evals/octet.mjs` is for calls.

## 8. Background jobs (R7)

- Any write call that Octet expects to take over about 3 s (a route with more than about 8 compounds, a batch of more
  than about 20 steps, a figure with many panels) is started as a job. The reply comes back at once:
  `{ job: "j3", started: "draw_route", parts: 17 }`.
- `job { id }` gives `{ state: "running" | "done" | "failed" | "cancelled", done: 9, of: 17, result? }`.
  `job { id, cancel: true }` stops it, and the drawing goes back as it was (as Stop does now).
- Clients that send a progress token keep today's streamed progress instead (no change for them).
- The job is one undo step, as a call is now.
- The overlay (section 9) shows the job's progress ("9 of 17 compounds").
- Other calls on the same session that only read are answered while a job runs. Calls that write wait for it, and
  their reply says so.
- The MCP spec has an experimental tasks feature for this. Check its state in the 2025-11-25 spec and later before
  building. If clients support it, use it instead of `job`.

## 9. The overlay while the AI works (**Sam**)

Sam: the blur and glow (`src/McpMagic.tsx`, uncommitted on `ole-1.2`) is "not fun enough or magic enough". Put a fun
animation on screen, in Octet's style, for the whole time Claude is working, not only during each call.

- **When:** from the first call of a session's piece of work until a few seconds after its last call (today 1.5 s).
  Between calls Claude is thinking, so the animation keeps going there too. Make it longer (about 8 s) and add the
  `job` state, so it covers thinking time.
- **What (proposal, Sam to choose):** a molecule being built in the middle of the window. Atoms appear as small brand-blue
  dots and bonds draw between them, a ring closes, the molecule turns slowly, and it dissolves and starts again. Or
  Octet's mark assembling. Draw it with SVG and CSS keyframes in brand tokens. Keep the pill with the client's name,
  steps, progress and Stop.
- **Rules:**
  - Brand colours only.
  - No overshoot unless Sam allows it (the toolbar drop is the only bounce today).
  - Reduced motion: a still molecule and fades only.
  - It never touches the drawing. Decision 0024 (AI apps never glide) is about the drawing, not this overlay. Add a
    line to 0024 saying so.
  - `motion.check.ts` lets loop timings typed by hand through only as `Ns ease-in-out infinite`, which the current
    overlay follows.
- **Calls that change nothing** (reads) do not start it. Today `working()` is only called for write tools: keep that,
  and add the job state.

## 10. Short replies (R6)

- Every write result by default: one sentence, then `{ made: [...top-level ids], check: "clean" | {...}, warnings:
  [...], advice?: "..." }`. Drop per-atom names, Octet's IUPAC names of each compound, every caption id and boxes for
  everything. Keep boxes only for top-level objects made, with numbers rounded to 0.1.
- `detail: "full"` on any call gives today's full data.
- `read` defaults to `summary`: structures (id, number, formula; SMILES only when asked), reactions as
  `"2 -> 3 -> 4"`, the check and warnings. Today's short read is 75 KB for the taxol figure; the target is under 5 KB.
- Pictures: only when asked. Default `medium`, PNG at most 1000 px. Look at a faster picture path. 4.6 s for a large
  picture is the slowest thing Octet does for an AI app; profile `pictureOf` and `mcp_png`.

## 11. Instructions and prompts

The server instructions are rewritten around the new flow, in this order:

1. Ask the three brief questions first, then `set_brief`. If the user has no preference, the default is Quick start.
2. For a synthesis, use `draw_route` with compounds written `from` the one before. Write each compound in full once.
3. Trust Octet's layout. Read with `summary`; look at a picture only when the user asks how it looks.
4. Keep today's good rules: colour only on request, highlights with `edit`, never delete the user's work.

The prompts (`draw_scheme`, `journal_figure`, and so on) start with the brief.

## 12. No LLM inside Octet

Decided in chat on 10 November 2026: Octet does not add a language model.

- The user's AI app is the model.
- Every hard part that is not understanding words has one right answer and is code: names to structures (Octet has
  them), structures from earlier ones (section 4), layout, page fit, style and checks.
- A model would add gigabytes, break the offline promise, cost money, and send users' chemistry off their computer.
- MCP sampling (asking the client's model to do a small job) is there if ever needed. It is not planned.
- Later, maybe: reading a scheme from a picture or a scanned paper with a small image-to-structure model (MolScribe,
  DECIMER). Check licences, size and accuracy first. Optional, as the AI app can already read pictures.

## 13. What changes in the code, file by file

| File | Change |
|---|---|
| `src/mcp.ts` (2,260 lines) | Split it: `mcp/protocol.ts` (`handle`, `reply`, versions, prompts, resources), `mcp/args.ts` (schema, coerce, check), `mcp/tools/*.ts` (one file a tool), `mcp/compound.ts` (section 4), `mcp/brief.ts` (section 3), `mcp/route.ts` (section 5.4), `mcp/summary.ts` (section 10). `Host` stays one interface. |
| `src/mcp.check.ts` | Tests for coercion, the brief refusal, `set_brief` from a CDXML, compounds `from`/`changes` (stereo kept, errors named), `draw_route` numbering and wrapping, old names mapping, short replies under their size limits |
| `src-tauri/src/mcp.rs` | Brief and jobs on `Session`; `mcp_brief`, `mcp_elicit`, `mcp_elicited`; responses from the client matched to waiting calls (section 7) |
| `src/Editor.tsx` | `Host.working` gets job progress; overlay timing as in section 9; `set_brief` applies style and page (`restyle`, `forPurpose`) |
| `src/McpMagic.tsx`, `src/editor.css` | The new animation |
| `src/chem.ts` | Map numbers kept through edits and never drawn; reaction templates for section 4.3 (phase 2) |
| `src/docstyle.ts` | A fit check for a destination: page width inside margins at its bond length |
| `scripts/headless/host.ts` | Brief and jobs in the stand-in host |
| `scripts/mcp-acceptance.mjs`, `scripts/mcp-evals/*` | Cases start with `set_brief`; new taxol case; compare calls, characters and time with v1 |
| `scripts/mcp-bench/taxol/` | Benchmark inputs (present). Add `route.json` in v2 form and a runner that times the whole job |
| `docs/decisions/0021-mcp.md` | The brief is required; elicitation used for it; tool list v2 |
| `docs/decisions/0024-*.md` | The overlay is not motion of the drawing |
| `docs/plans/mcp.md` | Section 8, decision 4 changed; a section 22 pointing here |
| `CLAUDE.md` | The AI apps paragraph: "asks where the drawing goes before drawing" |

## 14. Build order (each step measured on the test set in `mcp-v2-tests.md`, taxol among them)

First, before step 0: `ole-1.2` has split from `origin/ole-1.2`. Local has `8b84ab7` (R7, every command and property),
which is not pushed. The remote has about 10 commits from 7 November that local does not (glides, Clean Up, decision
0024 "AI apps never glide"). The worktree also has about 67 uncommitted files from earlier work, plus this session's
work (the MCP Beta label, `McpMagic.tsx`, the `vite.config.ts` fix for the linked `node_modules`, the launch setting,
this plan and `scripts/mcp-bench/`). **Ask Sam** before rebasing, committing or pushing any of it.

| Step | Work | Days (estimate) | Done when |
|---|---|---|---|
| 0 | Benchmark runner: replay the taxol job, count calls, characters sent, failed calls, time | 0.5 | Baseline numbers written in section 15 |
| 1 | Lenient arguments (6) and short replies (10) | 1 | Taxol replay has no failed calls; replies under the limits |
| 2 | The brief (3): `set_brief`, the refusal, per-session storage, the style from a file, advice on fit | 1 to 2 | Drawing with no brief is refused with the three questions; Quick start by default |
| 3a | Compounds `from` with `swap`, `set`, `add`, `remove`, map numbers (4.1, 4.2) | 2 to 3 | Taxol route written in v2 form with the same InChIKeys as `structures.json` (done, 19 of 19). The fifth of today's characters was the target here and is not reached: 88% measured (15.1). **For Sam:** take 3a so and move the fifth to 3b and step 4, or hold 3a |
| 4 | `draw_route` (5.4) | 3 to 5 | Taxol in one call, check clean, no moves |
| 5 | Tool merge (5.1 to 5.3), `$defs`, instructions (11) | 1 to 2 | `tools/list` under 4,000 tokens; evals pass at least as well as v1 |
| 6 | Overlay animation (9) | 0.5 to 1 | Sam likes it; `motion.check.ts` passes |
| 7 | Elicitation (3.1, 7.3) | 1 to 2 | A test client gets the form and the brief is stored |
| 8 | Background jobs (8) | 2 to 4 | A 40-compound route returns at once; progress in the overlay |
| 3b | Named transformations (4.3) | 3 to 5 | Only after measuring 3a and 4. Each transformation has stereo tests. With step 4's letters for conditions, the taxol route at under a fifth of today's characters (moved from 3a, if Sam agrees) |

First release candidate: steps 0 to 6 (about 9 to 14 days). Then 7 and 8. Then decide on 3b.

Every step: `npm test` passes (122 check files today), the acceptance script passes against a dev build
(`octet-mcp-beta` launch setting), and the benchmark is re-timed.

## 15. Targets

| Measure (taxol job) | v1 (10 Nov) | v2 target |
|---|---|---|
| Tool calls | about 40 | 5 or fewer: brief, route, read, at most 2 fixes |
| Failed calls | about 8 | 0 |
| Characters Claude writes in tool arguments | about 27,000 (the 20-compound check grid, three schemes of about 4,400, and every retry and fix) | under 5,000 |
| Largest reply read | 465 KB | under 20 KB unless a picture is asked for |
| `tools/list` | about 12,500 tokens | under 4,000 |
| Octet's own time | about 5 s for 3 schemes | the same or less |

The hour-plus wall time in the run was mostly Claude, plus detours unrelated to the MCP (a damaged PDF, OCR). The
benchmark runner should time only the MCP part.

### 15.1 Measured (the benchmark runner, step 0)

`node scripts/mcp-bench/run.ts` replays each case in `scripts/mcp-bench/cases/` with no window and compares with
`scripts/mcp-bench/results.json`. A worse number fails the run. Each step of section 14 adds its row here.

| Step | `tools/list` characters (tokens, at 3.5 characters each) | Instructions | Case | Calls | Failed | Sent | Read | Octet ms | Right | Warnings |
|---|---|---|---|---|---|---|---|---|---|---|
| 0: v1 with R7 (11 Nov) | 63,348 (18,100), 26 tools | 2,358 | taxol-schemes | 3 | 0 | 4,436 | 15,836 | 2,599 | 18 of 19 | 44 |
| | | | taxol-v1-job | 33 | 6 | 15,365 | 282,623 | 3,649 | 18 of 19 | 17 |
| 3a: compounds from earlier ones (11 Nov) | 63,605 (18,200), 26 tools | 2,457 | taxol-chained | 3 | 0 | 3,887 | 15,367 | 2,192 | 19 of 19 | 42 |
| | | | taxol-schemes | 3 | 0 | 4,436 | 15,836 | 2,569 | 18 of 19 | 44 |
| The layout faults of section 17 (11 Nov, `mcp/layout`) | the same | the same | taxol-chained | 3 | 0 | 3,887 | 14,849 | 2,192 | 19 of 19 | 42 |
| | | | taxol-schemes | 3 | 0 | 4,436 | 14,823 | 2,569 | 18 of 19 | 42 |
| | | | taxol-v1-job | 33 | 6 | 15,295 | 275,602 | 3,565 | 18 of 19 | 11 |

- `taxol-chained` is the three schemes of `taxol/route.json`: 9 of its 21 structures are written `from` another (3,
  4, 7, 7 and 13 drawn again, 14, 16, 17, 19). Those nine take 610 characters where they took 1,166 (52%). The whole
  job's arguments fall by 12% only, as the other twelve compounds (new skeletons, rings made and opened, a new centre
  with a set configuration) and the conditions (1,640 characters) are written as before. Section 4.4's fifth is not
  reached by 3a alone: it needs the named transformations (3b) and `draw_route`'s letters for conditions (5.4).
  Octet makes a compound from another in 4 ms where reading it from SMILES takes 11 ms (the seven with changes:
  30 ms against 80 ms).
- The 3a row is as `results.json` has it. `taxol-chained`'s time was written by `run.ts --write taxol-chained` while
  other work ran on the Mac (2,170 to 2,340 ms over eight runs), and `taxol-schemes` keeps step 0's time, which 3a
  does not move. Run `--write` again on a quiet Mac before 1.2.
- `taxol-schemes` is the three final `draw_reaction` calls only. `taxol-v1-job` is the whole job rebuilt from section
  0's notes (no record of the chat's calls was kept): the six refusals, the check grid, the style changes, the titles,
  the reads and the row moves. It has no pictures (there is no picture with no window), so the 465 KB read is not in
  it.
- `tools/list` is larger than section 0 says (44,000 characters): R7 and the work of 6 to 8 November added to it.
- Right: 18 of 19, as the last product's number is `1 (taxol)`, not `1` (section 6 reads that as number 1 with a
  caption). Compound 20 is a reagent over an arrow, so it is not counted.
- The layout row is as `results.json` has it. Its times are those kept before: the layout work does not move them.
  Replayed in one process in turn (the sum of each call's quickest of 4 to 6 runs), before then after: `taxol-chained`
  2,287 and 2,298 ms, `taxol-schemes` 2,873 and 2,871 ms, `taxol-v1-job` 4,295 and 4,223 ms. `run.ts --write` on the
  busy Mac gave 2,315, 2,827 and 3,772 ms (the quickest of four runs), and the code before gave 2,140 to 2,336, 2,647
  to 2,736 and 3,732 to 3,800 ms in the same hour. Where a `--write` time was lower than the kept one (17 corpus
  jobs), it is kept.
- Step 0's 44 warnings were the three schemes drawn over one another and past the page edge (section 17). With the
  layout faults fixed there are 42: 40 are scheme 3 under the page's bottom edge (Octet lists 40 at most) and 2 are
  the compound numbers 7 and 13, each on two structures. Nothing overlaps, nothing runs past the right edge, and the
  drawing reads as three reactions of 5, 5 and 7 steps (it read as 5, 1, 4, 1 and 6). Schemes 1 and 2 fill an A4 page
  at ACS sizes, so what is left is page fit (section 3.2).
- The 60 corpus jobs with the layout faults fixed: 162 warnings (181 before; no job has more) and 110,236 characters
  read (112,152 before). 41 jobs read 1 to 33 characters more: work starts at the top of the page, where a coordinate
  has one more digit.
- **The benchmark's own data was wrong.** `structures.json` had compounds 4 to 7 and 9 to 11 with the TBDPS group
  joined through its tert-butyl carbon (`scheme.mjs` wrote the group as a prefix). Octet's drawings were right. Fixed
  in `scheme.mjs` on 11 November.

### 15.2 Left off this branch until 1.1.2 is merged in

The uncommitted v1 work of 6 to 8 November in `n-ole` is carried here, but for two pieces that need 1.1.2 code this
branch does not have. Put them back when `release-1.1.2` is merged in:

- `place_template` reads only the first library sets. The later sets need `loadMore` in `src/library.ts` and
  `src/library-more.json` (add `await loadMore()` to `placeTemplate`, and the ATP check in `mcp.check.ts`).
- `run_command` does not list `predict_19f`, `predict_31p`, `mass_spec`, `toggle_spectrum`, `spectrum_full_screen`
  or `spectrum_close`: the editor's commands for them are 1.1.2 work.

## 16. For Sam to decide

All the open questions, and Sam's answers so far, are in **Start here** at the top. The session asks him the rest
first.

Open since step 3a (11 November 2026):

- **3a did not reach its fifth.** The taxol route's arguments are 3,887 characters against 4,436 (88%), and the nine
  compounds written `from` another are 610 against 1,166 (52%). The other twelve each make or open a ring, join two
  fragments or set a new centre, which `swap`, `set`, `add`, `remove` and `bond` cannot write. Take 3a as it is, with
  the fifth moved to 3b and step 4 (section 14 is written so), or hold 3a?
- **What `at` takes when the part on the atom is the larger side** (4.2.1): refused today, so `{ at, set: "OH" }`
  on a small alcohol under a silyl group drawn atom by atom needs `swap` by label. Keep that, or take a known
  protecting group as the group whatever its size?

## 17. Known issues to fix along the way (from the taxol run)

- `replace_structure` refuses MOL text that `get_file` wrote (section 6).
- **Fixed (11 November, `mcp/layout`).** `add_text` with `below` a structure in a scheme attached to the next arrow
  as a condition. New work now starts 3 bond lengths under the boxes of everything drawn (numbers, conditions, free
  text, reagent tables and shapes too), and `draw_reaction` lays its row out apart from what is there, so a title stays
  free text.
- **Fixed (11 November, `mcp/layout`).** `run_command clean_up` on one reactant added a second "+" beside the existing
  one. A plus sign that a structure reaches over is read where it stands.
- **Fixed in part (11 November, `mcp/layout`).** `draw_reaction` lays long schemes past the page edge (R4, section
  5.4). A scheme now wraps when its first line is too wide for the page, starts at the top margin of an empty page,
  and goes inside the page's margins (in the middle of the page when a line is wider than the margins). Schemes drawn
  one after another no longer overlap. Left for the brief and `draw_route` (sections 3.2 and 5.4): page fit. A scheme
  taller than what is left of the page runs past its bottom edge, and a line that cannot break (one step wider than
  the page) runs past its right edge.
- A compound repeated across schemes (7, 13) warns "number on more than one structure" (section 5.4).
- Calls on one session wait behind a long batch (section 8).
- The MCP Beta build shares `mcp.json` and the app data folder with the installed Octet. Two Octets running fight over
  `mcp.json`. Give dev builds their own identifier, or their own file name.

### 17.1 Faults the paper corpus found (11 November 2026)

60 jobs from six papers (`scripts/mcp-bench/corpus/`), each structure read from the page by one agent and checked by
a second. v1 draws 225 of 240 numbered compounds right. The 67 confirmed faults, each with its smallest input, are
in `docs/plans/mcp-v2-corpus-faults.md`. Grouped:

| Group | Faults | Where |
|---|---|---|
| Labels not read, with no warning | `Bpin`, `BBN` (read as B-B-N), `F3B`, `D`, `Allyl`, `Vinyl`, `OtBu`, hyphenated `t-Bu`, `i-Pr`, `n-Bu`, `4-ClPh`. A nonsense label gets the same silent reply. | `src/labels.ts`; the reply in `read()` |
| Labels read wrong | `Ar` drawn as phenyl (the tool description's own example); `NC` as an isocyanide; `P(O)(OEt)2`; `BF3K` warned though right; a radical marked on Si or N of an expanded label in `read_drawing`'s SMILES | `src/labels.ts`, `src/chem.ts` |
| Salts | A salt given as one compound becomes two structures with the same number. No structure has the salt's InChIKey, and the scheme does not wrap. | `read()`, `place()` in `src/mcp.ts` |
| Layout | `draw_structures` picks columns by count, not by the page or by label widths. A one-step reaction that is too wide is not fitted. A `structure:` line over an arrow gets no room. A wrapped second product drops out of the reaction as read. Side-arrow text on a cycle overlaps. | `src/mcp.ts`, `src/reaction.ts`, `src/cycle.ts` |
| Tool gaps | A structure at an arrow takes no number or labels. `draw_structures` takes no caption. A number is at most 12 characters. A cycle takes no text node and no structure on a side arrow. A double bond with no geometry is drawn and keyed as E. | The compound object (section 4.1) fixes the first three |
| Metals | A neutral N or P donor on a metal warns about valence. `Ir(ppy)3` by name warns on each N. `fac-` is dropped with no note. Hoveyda-Grubbs by name has no O to Ru bond. | `src/check.ts`, `src/complexes.ts` |
| Name to Structure | `(R)-carvone` and `(R)-limonene` refused though the (S) forms read; chlorido complex names; spelling variants of catalyst names; a quinuclidine with bridgehead descriptors | `src/names.ts` (outside the MCP: for Sam to place in a release) |
| Small | A valence warning numbers the atom by the whole drawing. `1,5-HAT` is split at its comma. Explicit H at ring fusions is missing when a group is a label. | `src/check.ts`, `classify()` in `src/mcp.ts` |

The label, salt, layout and tool-gap groups are MCP work and are in the build order. Names and metals change what
every user sees, so each needs Sam's yes and the ChemDraw cross-check.

### 17.2 Indigo stops working after about 1,266 refused calls

Found by the 1.1.2 session on the same night (it is the cause of the 1.1.1 crash): each call Indigo refuses loses 32
to 48 bytes of its 64 KB stack for good, and then any call fails ("getWasmTableEntry(...) is not a function",
"memory access out of bounds"). The benchmark met it when it drew all 60 corpus jobs three times in one process. An
AI app sends many texts Octet cannot read, so a long MCP session can reach it too (test plan P6 and R3). The fix is
on the 1.1.2 side (`item/indigo-crash`) and comes here with the merge. Until then the runner draws each corpus job
once.

### 17.3 Taking 1.1.2 into this branch (from the 1.1.2 session)

`release-1.1.2` has a commit that takes the MCP out (`38674b3`). Record it as merged with none of its changes
first, then merge the rest: `git merge -s ours 38674b3`, then `git merge release-1.1.2`. Expect conflicts in
`src/Editor.tsx`, `src/editor.css` and `src/releases.ts`. Only when Sam says.

### 17.4 Before any push

`docs/plans/mcp.md` and `docs/decisions/0021-mcp.md` are in this branch's history (from R7). Sam's notes say they
stay private, and the repository is public. Nothing on `release-1.2-mcp` or `mcp/*` is pushed until Sam says how
they come out.

## 18. Scripting (#89) and batch conversion (#91): a proposal for Sam's yes

Sam's answers (Start here, 10): a script uses the same tools as AI apps; from the command line it may also open and
save files and loop over a folder; AI apps still have no file access; batch conversion runs from the command line
only, with no menu item; it handles everything Octet opens and saves. **Not built until Sam says yes to this section.**

### 18.1 One engine: Octet with no window

Both issues ask for Octet's work "without opening the program". Both get it from one new mode of the app's own
program, so nothing is written twice and every format and layout is the app's own:

- `Octet Draw --headless` starts Octet with one drawing window that is never shown (no Dock icon, no Home). The page
  in it is the normal drawing page, so Name to Structure, Clean Up, the readers and the exporters are the ones the
  app uses. It ends when its input ends.
- It does not use the server, the key or `mcp.json`, and it does not need "Let AI apps use Octet" on. It talks only
  to the program that started it, on standard input and output. Nothing listens on a port.
- The Node runner in `scripts/headless/` stays what it is: a test tool for this repository. It is not shipped.

### 18.2 Scripting (#89)

- `Octet Draw --headless --mcp` speaks MCP on standard input and output, with the v2 tools (section 5). A script in
  any language starts it and sends tool calls, exactly as an AI app does. With Octet open, `Octet Draw --mcp` (the
  relay that exists) does the same in the user's open drawing.
- **Files are the script's own work.** The script reads a file and gives its text to `drawings { new, from: text }`
  (CDXML, CDX, MOL, SDF, RXN, SMILES, InChI, CML and `.oct`). It asks `read { file: format }` for the drawing's text
  or bytes and writes the file itself. So Octet needs no tool that takes a path, and decision 0021's "no files" rule
  stays whole for AI apps and scripts alike.
- For that, `read`'s `file` takes every format Export has: the text formats of today, and SVG, PDF, PNG and EMF (the
  binary ones as base64), each with the Export dialog's own options (`width_mm`, `dpi`, `transparent`, `selection`).
  It makes the file's bytes with the app's export code and returns them. It opens no dialog and writes nothing.
- Documentation: one page, `scripting.html` on octet.software, with the tool list and four worked examples from the
  issue (renumber compounds across the schemes of a review; apply a journal's style to every figure in a folder; one
  drawing a row from a table of SMILES; check every structure in a manuscript). Each example is under 30 lines of
  Python and of JavaScript, with no package to install: a 20-line client that starts Octet and sends JSON lines.
- No Python package, no interpreter inside Octet, no add-in system (issue #90 is closed).

### 18.3 Batch conversion (#91)

A command of the same program, with no menu item and no setting:

```
Octet Draw --convert INPUT... --to FORMAT [--out FOLDER] [--width 89mm] [--dpi 600] [--style PRESET] [--each]
```

- `INPUT`: files or folders (a folder gives every drawing file in it; `--recursive` goes into folders inside it).
- `--to`: any format Export or Save writes. With `--to sdf --each`, one SDF of every compound in each drawing.
- `--out`: where the files go (beside each input by default). A file that exists is never written over: the new one
  gets a number, and `--overwrite` allows it.
- `--width` and `--dpi` are Export's own options. `--style` restyles first (a journal preset or a `.oct` or CDXML
  whose style to use), as `set_brief` does.
- It prints one line a file (`figure3.cdxml -> figure3.pdf`) and ends with the count. A file that cannot be read is
  named with the reason, the rest carry on, and the exit code is 1.
- It is the headless engine with the loop and the file reads and writes in Rust. Rust reads and writes only the
  paths given on the command line (the user picked them). Each file is parsed in the page with the same limits as
  File > Open (every file is hostile input).
- Windows: the release build is a window program, so its output does not show in a console. `--convert` writes its
  lines to the console it was started from when there is one (`AttachConsole`), as the relay's pipes already work.

### 18.4 Order and tests

After step 5 (the tool merge), so scripts are written against the final tool names:

| Step | Work | Done when |
|---|---|---|
| 9 | `--headless`: a hidden window that answers on standard input and output; `read { file }` in every export format | The acceptance script passes through `--headless --mcp` with no Octet open; a PDF and an SVG from `read` are the same bytes as Export's |
| 10 | `--convert` | The 68 CDXML round-trip files convert to `.oct`, PDF, SVG and SDF and back with nothing lost; a 200-file folder converts with a bounded memory use |
| 11 | The scripting page and its four examples | Each example runs as written on Mac, Windows and Linux |

Tests are in `mcp-v2-tests.md`, section 15.

Open for Sam: is the command's name `--convert` on the app's own program right (on Mac that is
`/Applications/Octet Draw.app/Contents/MacOS/Octet Draw --convert ...`), or does he want a short `octet` command
installed on the PATH (an installer step on each platform)?
