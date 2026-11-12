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
- **As built (step 7, 11 November 2026, branch `mcp/elicit`).** Read against MCP 2025-11-25 (Elicitation), the newest
  version in `VERSIONS`. An AI app takes elicitation when its initialize gives `capabilities.elicitation` as `{}` or
  with `form` (url mode alone does not count): `elicits` in `mcp.rs`, kept on its `Session` and sent with each
  request, initialize too, as `From.elicit`. The page reads only that, for the instructions as for the form.
  - **Where a call would get the refusal** (a scheme with no brief, `needsBrief`), and for `set_brief` with no
    destination, Octet asks with `elicitation/create` (`ASK_BRIEF`): "Where is this drawing going, and in what
    style?", with destination (one choice, named Quick look, no page; Paper; Thesis; Slides; Poster; Notebook, the
    only field required), journal_or_size ("JACS, 2 columns", "A4", "85 x 60 mm"), emphasis and layout, all text. The
    choice is `enum` with `enumNames`: 2025-06-18 takes no other choice with names, and 2025-11-25 still takes it
    (as legacy). The page does not know which version the AI app agreed, so it sends the form both take. A tool
    call's own arguments are checked first, so a wrong call asks nothing; `set_brief`'s are checked with a stand-in
    destination.
  - **accept:** the destination and journal_or_size are made into one line ("paper, JACS, 2 columns") and read by
    `briefOf`, as draw's brief is; emphasis and layout are kept as the user typed them, so text in one field never
    reads as another field. The call then goes on as if it had that brief: set first in the same undo step, said in the first
    line of the reply, kept for the session when the call does its work. The reply is the one the call gives with that
    brief (a check proves it). `set_brief` takes the answers as its arguments; what it was given wins.
  - **decline:** the user has no preference, so the brief is quick.
  - **cancel, no answer in 5 minutes, or an answer that is not one** (a destination not one of the six, an action not
    of the three): the call ends with "Octet changed nothing. The user closed Octet's questions without answering. Ask
    them in the chat, then call again with brief:" and the three questions. Nothing is kept: the old path still works.
    A journal Octet has no preset for gets draw's own refusal for it, which says to ask the user.
  - **Stop and cancel:** Stop in Octet's window, or notifications/cancelled, ends the wait at once, and the call is
    cancelled as any call is. While it waits, Octet's notice shows, with Stop, and says "Waiting for your answer in"
    the AI app's name.
  - **The wait is outside the page's queue:** a call from such an AI app takes its turn in the queue only once it has
    the brief, so while the user fills in the form every other request to the window (other sessions, reads) goes on.
    A call from an AI app without elicitation is queued as before.
  - **The instructions** for such an AI app have one line changed: the bullet with the three questions becomes "For a
    scheme, route, figure, cycle or grid, just call draw: Octet asks the user about style, destination and emphasis
    itself when it needs to. Give brief only for answers the user has already given in the chat." (`instructionsFor`,
    over `INSTRUCTIONS`, which is not changed). Other AI apps get the instructions as before, word for word.
  - **Not built:** the prompts (draw_scheme and the rest) still say to ask the three questions, for every AI app; the
    form has no field for the user's own style file (a form takes text, not a file), so that stays `set_brief`'s
    from_file; a draw that fails after the user answered keeps no brief (as draw's brief), so the next call asks
    again.

### 3.2 Advice on fit (question 2)

Before drawing, Octet works out whether the job fits the destination:

- It compares the page inside its margins (`pageSize` and `PAGES` in `docstyle.ts`; journal widths such as Nature 89
  and 183 mm, ACS1, ACS2) with the width each row needs at the destination's bond length.
- It says plainly what will not fit and offers choices: more rows, split into schemes, a smaller scale, two columns,
  a larger page. It never shrinks text below the destination's own size to make things fit.
- Quick start has no page, so it gives no advice on fit.

### 3.3 As built (step 2, 11 November 2026, branch `mcp/brief`)

- **`set_brief`** is the sixth tool (last in `tools/list`), the operation `brief` in `OPS` (`setBrief` in `src/mcp.ts`),
  with the arguments of 3.1. Its hints: not read-only, not destructive, idempotent (the same brief again changes
  nothing and opens no undo step). Its reply: what changed since the last brief (B6), the style with its label and bond
  sizes, the advice, then the brief as JSON (also its `structuredContent.brief`).
- **Kept per session.** `From` (`src/mcp.ts`) has `brief` and `keep`. In the app, `Session.brief` in `mcp.rs` is sent
  with each request as `brief`, and the page keeps a new one with `mcp_brief(session, brief)` (16 KB at most). Requests
  with no session (an older client) share one, so they can still draw a scheme. In memory only: a new session, or Octet
  started again, has none. `scripts/headless/host.ts` keeps them the same way (`session(client, id)`), and so does the
  stand-in of `src/mcp.check.ts`.
- **The refusal** comes after a call is routed and before its schema check (`needsBrief`): draw with kind reaction,
  cycle or figure, or structures with more than one; a change with one of these, or with more than one structure
  drawn in all. The text is exactly 3.1's, with nothing before it. draw and change take the answers as `brief`
  (change since `mcp/lenient`), so their refusal says to call again with them as brief, if the user has given them
  (`BRIEF_HERE`); tools without brief keep 3.1's text (`BRIEF_FIRST`).
- **Destination.** quick is `QUICK_STYLE` (page edges off, no purpose). paper, thesis, slides and poster are their
  purposes (`purposeStyle`). notebook is the experiment purpose when the drawing is an experiment page, else paper's,
  and the reply says how to open an experiment page. journal is the one preset whose name, or a journal named in its
  brackets, starts with what is given (case, spaces and stops aside), so `ACS`, `Wiley`, `Thieme`, `Angewandte` and
  `Synthesis` are presets; else it is refused with the nearest preset (by publisher, else ACS Document 1996) and
  nothing changes (D9: so `JACS`, `Org. Lett.` and `Chem. Commun.` are asked about, as test plan D9 says). An empty
  journal is refused. With a style from a file or the drawing, a journal gives only its column, and the reply says
  the style is the user's own in place of the journal's. quick with columns or size_mm is refused (it has no page). columns is the journal's column
  (`COLUMNS` in `docstyle.ts`: ACS1 and ACS2, Nature 89 and 183 mm, RSC 83 mm); a journal with none says to give
  size_mm. size_mm is a page of that size (a named page when it is one).
- **A style from a file** (`readOct`: CDXML, `.oct`, or an old `.octet` file) gives every value of its document style,
  on the destination's page. Refused with the reason: text that is not a drawing's, a damaged file (the reader's own
  words), and a CDXML whose document gives no style (no BondLength, LineWidth or LabelSize). Nothing is kept but the
  brief (Sam's answer 5). `from_drawing` takes this session's drawing only: another drawing's style is in its own
  window, so the reply says to read it with format cdxml and give that as from_file.
- **Advice on fit (3.2).** `set_brief` gives the page's room inside its margins in bond lengths, and what of the drawing
  runs past the page now, with the choices: more rows, split into schemes, two columns, a larger page. A draw that
  does not fit says what it said before, with `set_brief` in place of `set_style` for a larger page. Quick start has
  no page, so the layout check no longer names what runs past one (`layoutWarnings`, test plan L2): before, every
  Quick start drawing was told to fix what lay past an A4 page that is not there.
- **Instructions and prompts.** The instructions' second line asks the three questions and says one structure needs
  none. draw_scheme, redraw_picture and fill_experiment start with the brief; journal_figure gives the journal through
  `set_brief`.
- **Room in `tools/list`.** `set_brief` is 1,409 characters; the list went from 13,995 to 13,994. What was cut, each
  said elsewhere or moved behind help:
  - `advanced`: the 13 preset names, the 13 page names and the 16 export formats. set_brief lists the journals by
    their short names (made from `PRESETS`); help of set_style gives the presets and pages, and of export the formats.
    "Octet redraws everything in it, and" went.
  - `read`: "Results of draw and change already give ids, boxes and a layout check, so you seldom need to read" (the
    instructions say it); "atoms lists atom and bond ids, for change", "picture adds a PNG", format's "The drawing as
    this file's text, in place of the reading" and ids' "Read only these objects" (each said once, not twice); picture's
    own description.
  - `change`: "Also ops: draw (with kind), set_style, place_template, add_file, fill_experiment" (op's enum lists them)
    is "draw: kind, and its arguments as draw takes them"; arrange's 12 values are "left, top, across, page and more";
    highlight's "Octet's Highlight behind an atom, a bond, or all of a structure" (the instructions say it); the
    letters after '$1.s[0]' (the sentence before gives them). How to add a step to a drawn scheme is in help of arrow,
    and change says so.
  - `draw`: "Give a compound's name when you know it, else a SMILES" (the instructions say it); the reaction and cycle
    kinds say less, as steps' own description says each part.
  - "Add a PNG of what changed" on draw, change and advanced (the instructions say it). drawings' wording is shorter.
- **Decided by the main session** (Sam left them to it, 11 November; built on `mcp/ai`, section 19.4):
  - **No preference on a drawing with work in it keeps that drawing's own style and page**, and the reply says so
    ("The drawing has work in it, so it keeps its own style and page."): the brief's style is `from_drawing`, and its
    advice on fit is the page's when the drawing has one. Quick start is for an empty drawing. Before, quick replaced
    the style and page with Quick start (undo brought them back).
  - **A journal that uses a preset's style under its own name is that preset** (`ALIASES` in `src/mcp.ts`, by the
    journal's name or abbreviation, case, spaces and stops aside): JACS, Org. Lett., J. Org. Chem., Inorg. Chem.,
    J. Med. Chem., Organometallics, Chem. Rev., Acc. Chem. Res., Chem. Mater., J. Nat. Prod., Org. Process Res. Dev.,
    J. Phys. Chem., Biochemistry and every ACS ... journal are ACS Document 1996; Angewandte, Chem. Eur. J., Eur. J. Org.
    Chem., Eur. J. Inorg. Chem., Chem. Asian J., ChemCatChem, ChemMedChem, ChemSusChem, ChemBioChem, ChemPhysChem
    and ChemistrySelect are Wiley (Angewandte); Chem. Commun., Chem. Sci., Org. Biomol. Chem., Dalton Trans., Green
    Chem., Org. Chem. Front., RSC Adv., Catal. Sci. Technol., Chem. Soc. Rev. and Nat. Prod. Rep. are RSC; Nature
    Chemistry, Nature Communications, Nature Catalysis, Nature Synthesis and Nature Reviews Chemistry are Nature.
    The reply names the preset. A journal Octet truly has nothing for (Bull. Chem. Soc. Jpn., Tetrahedron Lett.) is
    still refused with the nearest, as test plan D9 says, and nothing changes.
- **Open for Sam** (review of 11 November): add_file never needs a brief, even for a file that is a whole scheme
  (3.1 exempts one structure from add_file). Should a file of more than one structure or a reaction wait for the
  brief?
- **Not built:** asking the user through MCP elicitation (step 7); carrying out emphasis and layout (kept with the
  brief and said back: the AI app does them with draw and change).
- **Benchmark.** Each case gives its brief first, counted as a call: its own (`brief` in the case), else the page it
  starts on (every corpus job: paper, as drawn before). Every one of the 64 cases has one call more, sends 32
  characters more (`{"destination":{"kind":"paper"}}`) and reads 231 more (the brief's reply). Nothing else moved:
  failed calls, coerced, structures right, warnings and summaries are as they were. Times: `results.json` keeps each
  case's lower time. The four main cases, the code before and after in turn, four rounds each at load 6 to 8 (the
  quickest): `taxol-schemes` 2,579 and 2,517 ms, `taxol-chained` 1,754 and 1,761, `taxol-v1-job` 3,895 and 3,883,
  `corpus-chained` 103 and 105. set_brief takes 0.03 ms on an empty drawing when nothing changes, 0.07 with a scheme
  drawn, and about 0.7 ms when it sets a new page; a refused call 0.004 ms.

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
  atom that could be E or Z; a bond change between atoms that are not bonded (`close` and `join` make a bond); `from` that
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
- **Done in step 5 (5.5):** the change forms are typed where `draw` lists the compound, and `replace` and `edit` are
  no longer said to be idempotent. Still left: the evals, which have not been run on `from` and `changes`.
- **Was left for step 5:** the change forms typed in the schema (they are in `draw_structures`' description only: typing
  them is about 1,500 characters over the 52,000 that `mcp.check.ts` allows, and 936 are left since wave A was
  merged, 15.1); the evals, which
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

### 4.3.1 As built (step 3b, 11 November 2026): `src/compound.ts`

- One more change: `{ do, at?, with?, to?, config? }`. The names and their arguments are `TRANSFORMATIONS` in
  `compound.ts`. Since the merge with step 5 (`mcp/integrate2`, 15.1), `advanced` with `help` and
  `{ of: "transformations" }` gives that table, and `draw`'s list of a compound's changes names `do` in one example
  (`{do: 'reduce', at: '7', config: 'R'}`) and says help lists the rest. A refused `do` lists the names. Protect and deprotect take `with` (the 13 groups, `acetonide`,
  `carbonate`); also `acetylate`, `benzoylate`, `form_carbonate`, `esterify`, `hydrolyse`, `oxidise`, `reduce`,
  `hydrogenate`, `epoxidise`, `dihydroxylate`, `hydroborate`, `open_epoxide`, `lactonise`, `close`, `open` and
  `join` (a bond to an atom of another earlier compound, named by `with`).
- **A stereo choice is a CIP label**, `config: { "9": "S" }` or `{ "5-6": "E" }` (on any change), so it has one
  reading for any structure: alpha and beta (above) need a drawing's convention. With none, a new centre is drawn
  with no configuration and the reply says how to give one.
- Each transformation finds every place it fits and is made at the one `at` names, or the only one; with none or
  more, the refusal names the places. They are made on the atoms as drawn (Indigo's WASM build has no reaction
  templates). New atoms go where the bond tool puts them; a new small ring is a regular ring.
- A ring closed between atoms far apart (an oxetane, 18), or new atoms with no room (6, 10, 12), has the new ring
  drawn again alone: with the ring's bonds taken out, the largest part stays where it is, the ring is regular through
  its atoms there, and each other part goes with its atoms on the ring (turned, or turned over with its wedges). A new
  small ring goes on the side of its bond with room. `at` takes a label too (OTBS: the atom it is on). `hydrolyse`
  also takes an acetal (a ketal, a THP ether: the part with the atom `at` names stays, or the largest). `config` on a
  centre that the changes keep is refused: it sets only a new centre, or one a change took the configuration of.
- **Left:** the evals have not been run on `do` (they need the app), and `tools/list` does not type `do`, `with` or
  `config` (an object inside a tool's arguments is open, so a strict AI app sends them).
- **Not as specified:** when the part that stays has atoms of the new ring that are not one run (the McMurry, 13:
  the A ring with the carbonate holds three atoms of the B ring), Octet lays out the whole compound with Indigo,
  turned (or mirrored, with its wedges) to lie as it did, and the reply says the atoms moved. A ring-closing
  metathesis between two vinyl labels (corpus grocott2025-fig4e, 20) cannot be said: no number names a label's
  atoms.

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

Dropped (Sam's answer 6): the v1 names are gone, with no compatibility layer. What follows is the first proposal.

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

### 5.4.1 As built (step 4, 11 November 2026, branch `mcp/brief`)

- **`draw_route`** is the seventh tool (last in `tools/list`), the operation `route` (`drawRoute` in `src/mcp.ts`), with
  the arguments of 5.4 and `keep_orientation` (left out of the listing: true unless set false, and `advanced` help of
  draw_route gives it; the listing says each scheme needs start and steps and each step products). Each scheme is drawn by the reaction drawing that was there
  (`drawReaction`: Clean Up Reaction's wrap, `across`, the page-fit sentence), one under another, with its title
  before it and its note after it. One undo step: when a scheme cannot be drawn, nothing of the route is kept, and the
  reply says which scheme. A route needs the brief, as a scheme does.
- **A reaction is draw_route's.** `draw` no longer lists the reaction kind (its `start`, the reaction's step fields and
  `keep_orientation` went, and its description says "A reaction or scheme is draw_route's"), but it still takes one,
  so `change`'s `draw`, the acceptance script, the evals and the corpus jobs are as they were. A route of one scheme with
  no title or letters is that reaction, and its reply is the reaction's.
- **Room in `tools/list`** (13,994 to 13,991; the 14,000 check stays): `draw` is 4,002 (5,712) and `draw_route` 2,294.
  `draw_route` lists its compounds as objects, "as draw takes it" (`draw` lists the compound's parts once). Moved to
  the instructions, as two tools take compounds now: the generic group and metal sentence ('*c1ccccc1', '*[Pd]*').
  Cut, each said by an argument's name or by help: the compound's text and from descriptions and the glosses in its
  changes ("a group for a group", "a new group for the one on an atom"); edit's list of properties by kind (one line);
  arrow's 15 kinds (now "reaction, equilibrium, curved, fishhook, line and more"); read's list of file formats (the
  enum has them) and its atoms description; advanced's examples of commands, "The result's check names what no longer
  fits" and "The user saves it where they choose"; drawings' "(its window stays behind)" and "as File > New For";
  set_brief's "(one undo step)"; a cycle's and a figure's step and panel descriptions shortened. Instructions: 2,768 to
  2,928 characters (the moved sentence, and draw_route named where a scheme is drawn).
- **Numbers across schemes (test plan C9).** The route's numbers are one series. A compound `from` another with no
  changes and no number is that compound, drawn again with its number (no warning, as before). A product with changes
  and no `from` is from the compound before it (`previous`). A scheme that starts `from: 'previous'` starts from the
  last product of the scheme before, by its number, else its id. Octet does not number compounds the AI app left
  unnumbered: a co-reactant or a reagent drawn in a scheme often has none.
- **Titles (L6).** Each is free text left-aligned over its scheme, `Scheme 1.` in bold as papers set it, and the
  scheme starts 3 bond lengths under it, as new work does: further than conditions sit from their arrow (`NEAR`,
  reaction.ts) or a name from its structure (`NAMED`), so the reaction reader never takes it, and the user's Clean Up
  Reaction afterwards leaves it where it is (headless.check). CDXML has no flag that keeps text out of a reaction:
  ChemDraw's scheme names the steps' objects and the title is in none, and Octet reads a file's reactions by where
  things are, so the distance is what keeps it apart. A title moved by hand onto an arrow becomes its conditions, as any
  text does.
- **Wrapping and balance (L2, L4).** Clean Up Reaction's wrap now puts no product alone on the last line where a line
  before can be the short one (reaction.ts: the fewest lines, then a last line of more than one structure, then the
  narrowest widest line), for the user's Clean Up Reaction too. Only the last line is judged so: a line before it is
  chosen by width alone, so a row that ends with a product alone whatever is done breaks as evenly as before. Found on the way: a scheme whose products the
  orientation turn stood upright (alkyl chains) left gaps wider than a reaction's between them, so Clean Up Reaction
  read it as two reactions, did not wrap it and it ran off the page. After the turn each product keeps its left edge
  and what comes after it moves as far as it grew or shrank (`respaced`). This fixed grocott2025-fig4e (7 warnings to
  0) and changed nothing else in the benchmark.
- **legend: letters (S8).** Each step with conditions gets its label, else the next letter after those used (a, b, c;
  a label 'b, c' goes on to d; a label whose letters do not go on from the last, such as 'i', is the step's own and the
  next is still the next letter), on its arrow, and its conditions as text, in order, in a note under the scheme:
  "Reagents and conditions: (a) ...; (b) ...". A structure at an arrow stays there.
- **Fit (plan 3.2).** The reply says the first scheme wider than the page (a line that cannot break: a larger page or
  landscape, or a starting material in above) and the first that runs past the bottom (draw the schemes from it on in
  a new drawing, or a larger page). Quick start draws with no advice. Octet does not split a route across pages itself.
- **Branches (S4, S5).** A schemes list draws a convergent route as a scheme for each branch and one that starts with
  the compounds they make (from their numbers), and a divergent one as a scheme for each branch from the shared
  compound. When a scheme does not start from the last product of the one before, the reply says that Octet drew each
  branch as a scheme of its own, under the one before, with a shared compound drawn again under its number, and does
  not join branches with arrows. Nothing joins them: Clean Up Reaction does not lay out a route with two branches.
- **Benchmark.** `taxol-route` (Quick start) and `taxol-route-paper`: set_brief, one draw_route with the three titled
  schemes of `taxol/route.json` (a product from the compound before gives no `from`; 7 and 13 start their schemes by
  `from` alone), one read. Each multi-step corpus job is also a case `route-...`: one draw_route with its figure as the
  title, the same structures right and warnings as the job.
- **Left:** compound 12 of the taxol route has two labels that meet (`s12.2`, `s12.14`), as in `taxol-chained`, so the
  check is not clean on Quick start (its changes draw it so: compound.ts). The window was not tried.

### 5.5 As built (step 5, 11 November 2026, branch `mcp/tools`)

`tools/list` has five tools: `draw`, `change`, `read`, `drawings` and `advanced`. It was 13,970 characters on
`mcp/tools`, from 59,857 with 26 tools. With page fit and the named transformations merged in (`mcp/integrate2`, 15.1)
it is 13,995 (about 4,000 tokens at 3.5 characters each): 5 characters are left under the 14,000 that `mcp.check.ts`
allows. `set_brief`, `draw_route` and `job` are not built: each is one more entry in `TOOLS` (`src/mcp.ts`), so those
three need the limit looked at again, or room found (`draw_route` can take over what `draw` says of a reaction).

- **What the merge with `mcp/fit` and `mcp/transform` published.** `advanced help { of: "transformations" }` gives
  the named transformations (4.3.1), and `draw`'s list of changes names `do` in one example. `help` of `reaction`
  says that `above` and `below` take a compound as well as text, that a list over 30 characters goes on more lines
  between its items and a free line after a comma or semicolon, and that `read` gives the compounds at an arrow
  after its text lines; `draw`'s steps say "one free line or compound each". For room, two lines were cut with no
  loss: `change`'s "Also ops, each with its own arguments beside op:" is "Also ops:" (its first line says each op has its
  arguments beside it), and "drawing, so it lies the same way" is "drawing: it lies the same way". The compound's
  "Give text instead when a ring is made or broken, or a new stereocentre is set" went, as `do` and `config` now say
  those.
- **Left:** `above` and `below` are listed as text only: typing them as text or a compound would take `tools/list`
  to about 14,070. A strict AI app that checks a call against the list will not send a compound object there. It can
  give a structure as text (`'structure: name'`), but not one with labels or a number.

- **How it is made.** The 26 tools of v1 are the operations (`OPS`), each with its own schema, which every call is
  still checked against, and its own code, which is as it was. A tool is a name, a short description, the arguments
  it lists and a `route`: the operation a call is. Nothing an operation does changed.
  - `draw { kind, ... }`: the kind's operation, with its arguments as they were.
  - `change { operations: [{ op, ... }] }`: one operation is run as itself, so its result is what its own call gave in
    v1 (and a `select` alone opens no undo step). More than one are the batch of v1: one undo step, `$1.s[0]` for
    what an earlier one made, nothing kept when one fails. An operation is `edit`, `replace`, `number`, `delete`,
    `move`, `arrange`, `text`, `arrow`, `shape` or `select`, and also `draw` (with `kind`), `set_style`,
    `place_template`, `add_file` or `fill_experiment`, as a batch of v1 could draw and then annotate.
  - `read`: a read, or with `format` the file's text (`get_file`).
  - `drawings { action }`: `list`, `use` or `new`. With no action it lists, and the reply says so.
  - `advanced { tool, args }`: `run_command`, `set_style`, `export`, `place_template`, `add_file`,
    `fill_experiment`, and `help`.
- **`advanced` with `help` and `{ of }`** gives the whole description and schema of a kind of `draw`, an operation of
  `change` or an advanced tool: what v1 listed for that tool. With no `of` it says what it is of. So nothing is
  undocumented: `run_command`'s catalogue (3,900 characters), every property `edit` takes (8,400), the hints and the
  molecule of a compound, and a figure's items are read when they are needed, not in every chat.
- **What is listed.** Each tool lists what a call needs to be right at the first try. `draw` lists every argument of
  the four kinds at its top level, and the compound once (`$defs`): `text`, `labels`, `from`, `changes` (typed: `swap`,
  `occurrence`, `at`, `set`, `add`, `remove`, `bond`, `to`), `number` and `caption`. `change` lists `op` and `ids`,
  and says each operation's main arguments in a line. A tool's own arguments are closed, and an object inside is open,
  as in v1, so an argument that only help lists passes an AI app that checks a call against the list.
- **`detail`, `picture` and `picture_size`** are listed on `draw`, `change` and `advanced` (and `read` has its own).
  `picture_size` was on `batch` and `read_drawing` only.
- **A refusal by an operation's schema** says where the argument is in the call (`operations[0].ids`, `args.preset`)
  and ends "advanced help of edit gives its arguments."
- **Hints.** A tool's hints are made from its operations': read-only and idempotent when every one is, destructive
  when one is. So only `read` is read-only or idempotent, and `change` and `advanced` are destructive.
  `outputSchema` is the change's shape for `draw` and `change`, and an object for the other three.
- **Claude Desktop's bundle.** `mcp.rs` makes no bundle when a tool's description is over 2,000 bytes, and three of
  the 26 were (`run_command` 3,947, `draw_structures` 2,614, `edit` 2,158), so Settings > AI apps > Claude Desktop >
  Install failed on this branch. The five are 1,386 at most, and `mcp.check.ts` holds that.
- **Instructions** are 2,367 characters (2,487). They answer what misled AI apps in the evals (mcp-v2-eval-notes.md): a co-reactant goes in start or over the arrow, amounts go in its text or a caption (or fill_experiment), what each id in made is, and when a picture is needed. The prompts name the new tools.
- **Judged as an AI app would** (twelve typical jobs, each call written from the list and the instructions alone and
  run with no window): 11 of 12 were right at the first try. Export was refused only as there is no dialog with no
  window. A renumbering by compound number (1 to 2, 2 to 3, 3 to 4) was taken and gave wrong numbers: a number that
  two structures have names the first, with no warning. `change` now says to renumber by id, and the fault itself is
  left (section 17). Adding a step to a drawn scheme is two calls (a `change` that draws the product, the arrow and
  its text, then `clean_reaction`), which `change` now says. Every call of the benchmark fits the listed schema as a
  strict AI app checks it (66 of 66).
- **A second test, by a reader who did not write the merge** (25 jobs, each written from `tools/list` and the
  instructions alone, run with no window): 19 of 25 were right at the first try, counted as the instructions count
  it (a result whose check is not clean needs another call), and 24 of 25 after the fixes below. (The first count
  said 21 and then 24: it did not read the checks, and two jobs, then three, ended with ids in them.)
  The 25 are now a table in `headless.check.ts`: every call must fit the listed schema as a strict AI app checks it,
  be taken, leave every result's check clean (the restyle job must name what no longer fits), and make what the job
  asks, so the list cannot drift from what the tools take.
  - A catalytic cycle: `Pd(PPh3)2` as an intermediate's text is not a name Octet reads. `draw` now gives a metal and
    its ligands as a SMILES with `*` and labels (`'*[Pd]*'`, `['PPh3', 'PPh3']`).
  - Conditions as letters with a footnote: `below: '$1.made'` under a whole scheme was refused ("names 14 objects
    here"). A place beside (`right_of`, `left_of`, `below`, `above`) now takes an id or ids, and a reference that
    names more than one object, as the box round them all. `draw` lists it so too (one `side` in its `$defs`), as
    every operation takes it. A reference that names one top-level object (a structure and its number) reads as
    before, with its note.
  - A convergent synthesis: the product placed `right_of` the last one (gap 1.5) left no room for the arrow, which
    was refused, and at gap 4 the conditions over the arrow overlapped both structures. `change` now says the gap is
    1 + 0.4 a character of the arrow's text, and the refusal says how far apart the two are and that rule.
    `clean_reaction` does not lay out a route with two branches (it moves them off the page).
  - A reagent drawn as a structure over the arrow (`'structure: Boc2O'`): the arrow was sized to the text only, so
    Clean Up Reaction did not read the structure as the arrow's and it overlapped the product. The arrow now reaches
    past the structures over and under it.
  - An equilibrium and a retro arrow, the second `below` the first's starting material: centred under a structure at
    the left margin, the wider scheme ran off the page. A place below or above now keeps it on the page across.
  - `read` with `format` and `picture` or `detail`, and `advanced` with `detail` on help or export, were refused with
    "is not an argument of this tool", which the list contradicts. They are now refused as "picture does not go with
    format".
  - Align and distribute: Octet with no window has no Arrange commands ("a dialog is open"), as it has no Export
    dialog. The window has them; not a fault of the list.
- **Not tried:** the acceptance script and the evals (both need the app). They are on the new names and `node --check`
  passes. The Rust tests of the relay and the bundle now send the names `read`, `draw` and `advanced` (`mcp/integrate2`;
  not run there, as nothing was built).

### 5.6 The line notation (11 November 2026, branch `mcp/lines`)

Sam's order: optimise for the AI model, not for Octet. A one-reaction job costs a model about 3,000 output tokens and
25 s for about 70 tokens of arguments (`scripts/mcp-evals/aicost.py`): the cost is deciding where each condition goes
and writing nested JSON. So a model can write what a chemist types, and Octet sorts it:

```
4-bromoanisole + PhB(OH)2 (1.5 equiv) -> 4-methoxybiphenyl (3), Pd(PPh3)4 (5 mol%), K2CO3, THF/H2O, 80 °C, 91%
-> 3[OMe>OH] (4), BBr3, 78%
```

- **Built:** `src/notation.ts` (`fromLines`, and `NOTATION`, the 609-character description a model reads). It gives
  the arguments the drawing code already takes: a kind of draw (reaction, structures, cycle, figure), or a batch of
  them (a title and a scheme, several schemes, a scheme and a grid). The conditions are one list in any order, sorted as
  a drawn arrow's are read (`conditionKind`, moved from `mcp.ts` to `stoich.ts` so both share it). A reactant that is
  also the solvent, amounts in brackets, `then`, and numbered or lettered operations need no decision. A compound's
  changes (`compound.ts`) are written in brackets after its number: `16[OBn>OTES; 20:OH]`, `7[join 2-1 8 (2S)]`.
- **The hook (built on `mcp/ai`, section 19.4):** `draw` takes `lines` (text; its description is `NOTATION`), and `kind` is no longer
  required. Its route becomes `route: (a, notes) => (a.lines !== undefined ? fromLines(a) : <as now>)`. The other
  arguments of the call go with the lines when they draw one thing. When they draw several (a batch: titles with
  schemes, two schemes), only `picture`, `picture_size` and `detail` go with them, and anything else (placement,
  `columns`, `keep_orientation`) is refused in one line that says to draw them in separate calls. A batch through
  `draw` is drawn as `change` draws one (`callOf` in `notation.ts` gives that call).
- **Room in `tools/list`:** it is at 13,995 of 14,000 characters, and `lines` adds 658. Measured with the hook in place
  (`lines` added, `kind` not required): cutting these from `draw` brings the list to 13,980. From its description:
  the reaction example (" Example, a reaction: start [...] ... number:'1'}]}].", 187), the generic group sentence
  (" For a generic group (R, Ar, L) ... ['PPh3', 'PPh3']).", 135; lines write `{R}`), " Give a compound's name when you
  know it, else a SMILES." (56), " (Octet wraps it between steps to fit the page)" (46) and " Octet lays it out, below
  what is drawn unless you place it." (60). From `steps`: the bracket after "its conditions as data" (" (reagents,
  then catalysts, go over the arrow; ... one free line or compound each)", 167), which says where each JSON field
  goes. If the tool table changes first, measure again.
- **Measured** (`src/notation.check.ts`): the 60 corpus jobs and the taxol route, written in the notation, draw the
  same as their JSON (each compound by number and InChIKey, every text, each arrow's kind with the words and
  structures over and under it). 18,420 characters against 34,638 as JSON (53%); taxol 1,729 against 3,916. Reading the
  taxol route takes about 0.05 ms a line. Hostile text (100,000 characters of brackets, arrows or separators; a
  million characters; lone surrogates; control characters) is refused or read in about 0.2 s at most.
- **Octet's own sorting:** the same transcriptions with every `^`, `_` and `"..."` taken out (a model that leaves the
  sides to Octet) put each arrow's words and structures on the sides the paper does in 20 of the 40 jobs with arrows
  (8 before a catalyst's loading, light and molecular sieves went under the arrow, as the papers draw them). The rest
  are choices the papers make one way and another (Et3N under the arrow in one, step names such as SET and
  N-alkylation, operations a) b) laid out by hand), so a model that wants the paper's exact layout still marks them.
- **Review fixes (11 November):** a bracket atom alone (`[Pd]`, `[Li]`) is a SMILES, and a change in brackets is only
  a transformation `compound.ts` knows (the names are in `src/named.ts`, which loads no Indigo). `(R)`, `(S)`, `(E)`,
  `(Z)` or `(2S)` after a name, and an earlier number that is also a formula (`C`, `CO`), are refused with both
  readings (`[R]` and `**C**` are the numbers). Steps that come back to their first compound are a cycle only with a
  title or a `+x` or `-x`; with a yield or a line over or under an arrow they are a scheme, and with neither they are
  refused. A reagent in its solvent (`HCl/dioxane`) goes over the arrow; `yield 88%` and `E:Z >95:5` are yields; `—>`
  and `–>` are arrows; a reaction SMILES with agents, a comma with no space that is not between locants (`B,X`) and
  operations that skip a number are refused with what to write.
- **Round 2: what models write (11 November, branch `mcp/ai`).** Three models wrote twelve jobs from the description
  alone (Haiku, Sonnet, Opus; 26 of 36 right), and Haiku's lab run was refused 5 times for things with one meaning
  (19.4). Each is now read, at one place in the reader:
  - A catalytic cycle as models write it. An intermediate Octet cannot read as a structure (`Pd(0)L2`, `L2Pd(Ar)Br`,
    `{L}2Pd({Ar})Br`) is a text intermediate, as the editor's cycle tool has them: the cycle tool (`drawCycle`, so the
    JSON too) writes it as the node's text, its labels in place of its `*`, formulas with subscripts and its number in
    bold under it, and its reply says which are text; read gives its text's id as the intermediate. What goes in or out
    can be written against a compound with no space after the sign (`P (1) +triketone -> ...`, `4 -ketol -> 1`,
    `OA +ArBr`): before an arrow on its line it is that arrow's step; at the end of a line, in goes into the step from
    the compound and out comes from the step to it. Side text is as written, with no braces or quotes (`+{Ar}Br` is
    ArBr). Back to the start with any `+x` or `-x`, or a `#` title, is a cycle with no further question. The centre
    text is a line of its own (`L = PPh3`, `{L}: PPh3`) before such a cycle or after it, or a line in quotes after it.
  - What is not a cycle reads as before. A chain back to its start with yields and no `+x`, `-x` or title is a scheme,
    and a quoted line after it is a note. Its compounds are read as written (`A +B` is two, `trans -stilbene` one
    name). A definition that no cycle takes (`TBS = tert-butyldimethylsilyl`) is free text, as a quoted line is: not a
    title.
  - A compound alone on a line (the first of its panel, under a `#` title, after a scheme or a figure), then a line
    that starts with an arrow: the lone compound is the start.
  - Conditions before the arrow (`cyclohexanone + NaBH4, MeOH, 0 °C -> cyclohexanol (1), 95%`): starting materials are
    joined by `+`, so what follows the first comma on the left is the step's conditions, and the reply says so in its
    coerced line ("Line 1: Octet read "MeOH, 0 °C", before the arrow, as the step's conditions."). Before, it was
    refused as two readings.
  - A scope as models write it: the core and its compounds on one line (`CORE{R}: then R=OMe (3a) 91%; R=F (3b) 85%`),
    `;` between compounds when the next starts with the core's first group, `then` before a compound or after the
    colon, the group again after the core (`CORE {R}:`), `R = OMe`, and the number bare (`R=OMe 3a 91%`) or in brackets.
  - A refusal that Octet can correct ends with the line as it would have it (`Write: A -> B, X, 90%` for `B,X`; a
    cycle's `@Y` or `^Y` without its mark): the reader's refusal carries its correction. A name or SMILES of the lines
    that Octet cannot read is named as the lines wrote it, with the line it is on and no more, on every path (a
    reaction, a route, a batch, a grid, `change`'s draw): `Octet cannot read "{R}C(=O)Nqqzx" (line 1) as a
    structure.` `fromLines` gives the line of each name (`where`) and `read` names it; the JSON form still says to give
    a SMILES.
  - `NOTATION` (549 characters, from 810) is examples, as models copy them: a titled route with conditions and a
    continuing step with a change, a scope with its core on one line, a cycle on one line with what goes in and out
    and its centre text, then one line of changes, marks and arrows. No title says "Scheme". `src/notation.check.ts`
    draws each example.
  - The model test's check (`scripts/mcp-evals/notation.ts`) counts a word drawn as its structure (`1 + SOCl2 -> 2`, a
    reagent written as a starting material, is right) and no longer wants "Scheme" in a title the job did not ask for.
  - Measured: the 36 answers through the new reader and check, 35 right (Haiku 9 to 12, Sonnet 7 to 11, Opus 10 to
    12); the one left is Sonnet's cycle, which draws Pd(PPh3)4 as intermediate A and never writes L = PPh3. The 61
    jobs (60 of the corpus and taxol) draw as before, taxol read in about 25 µs a line. Benchmark: no case worse;
    tools/list 12,209 characters (12,463), and lines-grocott2025-fig2a-catalyst reads 91 (150), its refusal naming the
    line of the name Octet cannot read.
  - **For Sam:** item 1(b) asked for what goes in or out to be drawn as a structure when Octet can read it, unless
    quoted. Not built: the tools' cycle takes side text only (`steps[].in` and `out`), so a cycle's side items are text
    for now. The editor has structures at a side arrow's end (`CycleEnd.atoms`, put there by `attachBeside`); the
    tools' cycle would take a compound at `in` and `out`, which changes its JSON too. Sam to agree before it is built.
- **Still JSON only:** a compound's hints (up, down, left, right, rotate, flip, geometry, colours, like) and a molecule
  atom by atom; MOL or CDXML text as a compound; `from` by a structure's id (`s3`); a figure item's brackets, mark and
  colour, a panel's frame and fill, and rich text runs; a cycle's `anticlockwise`. Every operation of `change` other
  than draw. `draw_route`'s `legend` and a step's `label` are lines now: `(a)` first in a step's conditions (19.4).
- **Not done:** the model test. No model could be started from the builder's session or the review fix's (`claude -p`:
  "OAuth session expired"). The twelve jobs and the checker are `scripts/mcp-evals/notation.ts`: `ask` runs `claude -p`
  on each and checks it, or `prompts` prints each prompt for a fresh model with no tools and `check answers.json`
  checks what they wrote.

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

Built on 11 November 2026 (`coerce` in `mcp.ts`, before each `check`):

- The lines come as a second text block after the result ("Read number 13 as text."), and in
  `structuredContent.coerced`. A read's first block stays its JSON. Many readings of one kind in a call are one line
  ("Read number 2 as text, and 19 more the same way.").
- A number is read as text only for a compound number and an atom's number (`numeral` in the schema), and only a
  whole number from 0 up: `2.5`, `-3` and `1e21` are refused. `text: 5` is still refused.
- A line quotes the value without the spaces, tabs and line breaks round it, so each reading is one line.
- Other names for an enum's values are `also` in the schema: `short` and `brief` for `summary`; `smi` and `smiles`,
  `jpeg`, `tiff` for the file formats.
- `new_drawing`'s `for` stays required in `tools/list`. A call without it is for `quick`, and the reply says so.
- Every compound takes `caption` (text under its number), which is where `"1 (taxol)"` puts `taxol`. `set_number` and
  `edit` have no caption, so they keep such a number as it is given. Any text in the brackets is split off the same
  way: `"7 (85%)"`, `"5 (R)"`, `"2a (R = Me)"` (section 16).
- A caption has room. Clean Up Reaction already spaced a reaction round the text under a structure, and the
  reaction reader (`findReaction`) now counts the gap to an arrow from that text, so a scheme with a caption wider
  than its compound still reads as one route (it read as two halves from about 24 characters). `draw_structures`
  spaces its grid again from each structure's box as drawn when a caption needs more room than a cell has.
  CDXML's scheme has the steps whole. Not done: `draw_cycle` spaces by the atoms only, so a caption wider than its
  intermediate can meet its neighbour's (the result's check says so).
- `replace_structure` keeps the text under the structure, the caption too, and its sentence says so.
- `$3.made` is read as one id in `resolve`, where a batch puts ids in.
- Not built: a number for other short text (`equiv: 1.2`, `temperature: 25`), and text for a number (`columns: "4"`).

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

**As built (step 7, 11 November 2026, branch `mcp/elicit`):**

- `From` has `elicit`, a function, present only when the session's AI app takes elicitation: mcp.rs sends `elicit` with
  each request, and the window (`Editor.tsx`) makes it a call of the command `mcp_elicit(id, body)`; the Node host
  (`scripts/headless/host.ts`, `session(client, id, elicit)`) takes it from the caller, so a check gives the answer.
- **The stream.** The choice is made late: a tool call without a progress token is answered with plain JSON, as before,
  unless the page asks; the first question writes the event stream's headers, then the question, then the reply comes
  as an event (`opened` and `event` in `serve`). A call with a progress token is a stream from the start, as before. So
  a call that asks nothing is answered byte for byte as before, for every AI app.
- **mcp_elicit** writes `elicitation/create` with an id of its own (`octet-ask-N`) on the call's stream (`Msg::Ask`),
  one at a time per call, and waits up to `ASK` (5 minutes). The call's own wait (`WAIT`) grows by `ASK` when it asks.
- **The answer** is a POST of a JSON-RPC response (no method). `answered` gives it to the call of the same session that
  waits on that id; any other is ignored. It is checked (`checked`): at most 16 KB, action accept, decline or cancel,
  and only the form's own fields that are text or a number. Anything else is no answer.
- **The wait ends at once** when the call ends (its `Pending` goes: the page answered, Stop, the window closed),
  when notifications/cancelled names it, or when the answer is not one; else after `ASK`. The page reads each as no
  answer. Each time it ends with no answer (all but the last), Octet sends notifications/cancelled for its own
  `octet-ask-N` on the call's stream before the reply (`Pending::unask`), so the AI app closes its form.
- **`--headless --mcp`:** the question goes out as a line, and the answer comes in as a line (`stdio`).
- **The relay (`--mcp`, Claude Desktop):** the question comes on the call's stream and goes out as a line; the answer
  line goes to Octet as a POST, as a notification does. An AI app that takes elicitation has its calls wait `ASK` more
  in the relay.
- Checked by Rust tests in `mcp.rs` (the capability, the question on the stream, the answer by id, an unknown id, an
  answer that is not one, the time running out, a cancel, the relay both ways), `src/mcp.check.ts` and
  `src/headless.check.ts`, and acceptance case 22 (to run on a build).

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

**Not built (11 November 2026).** A job would make a long draw slower for the user, so it is left out.

- Measured on the Node host, one `draw` call with the brief in it: the taxol route (3 schemes, 19 numbered compounds)
  takes 1.6 to 2.0 s, and the same lines given twice (6 schemes, 38 numbered compounds) take 3.6 to 4.3 s. So a
  40-compound route takes about 4 s, which is past this section's own line of about 3 s.
- A job costs the AI model one more turn: it calls, gets `{ job }`, then calls `job` for the result. In the lab runs
  (19.5) a job with one Octet call takes Opus about 19 s, nearly all of it the model's. One more turn costs more than
  the 4 s it would save.
- What else a job would have fixed is done another way. Calls from several sessions no longer wait on each other
  (17.5, built). Progress and Stop show in the window during a call (9). A call that waits for the user's answer
  waits outside the page's queue (3.1).
- Build it when a call is measured over about 10 s in the app. Use the spec's tasks feature then, if AI apps
  support it.

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

**Built (11 November 2026, branch `mcp/overlay`).** `src/McpMagic.tsx`, `src/magic.ts` and the `.mcp-` rules in
`src/editor.css`; `src/motion.check.ts` holds its rules.

- The molecules: benzene, caffeine, cyclooctatetraene (the octagon of the mark) and aspirin. One molecule has 7 s:
  the first atom at 0.36 s, built by 2.0 to 2.4 s, whole until 6.0 s, clear by 7 s. Each atom pops in 260 ms with the
  overshoot, each bond draws in 180 ms. A double bond in a ring has its second line inside the ring. A C=O is
  centred, as the page draws one.
- It is in the middle of the window for the whole time, the 8 s after the last call included (`LINGER`). **Sam to
  confirm.** Between calls the drawing is clear but for the molecule's ground, 200 px across, and an AI app's drawing
  lands in the middle of the window, so the ground covers part of it for up to 8 s. Clicks pass through the ground.
  The first build moved the molecule down to the pill between calls: a call takes about 110 ms, so the molecule was
  by the pill almost all the time, and went up and down at each call.
- During a call, and for 1 s after (`HOLD`), the window is soft. Only a call blocks clicks.
- A notice sits above the pill while the overlay shows (`.mcp-magic ~ .notice`). The pill is in the notice's place,
  and it stayed 1.5 s before: at 8 s it covered the Undo and Close of "Claude drew a reaction." for all of the
  notice's 5 s. The notice glides down when the overlay goes.
- **Sam to choose the words.** After a call the notice says "Claude drew a reaction." and the pill under it still
  says "Claude is drawing", for up to 8 s. Octet cannot tell that the AI app has finished.
- The pill shows a call's progress in the tool's own words, which say what is counted: "Step 2 of 3", "Drew 3 of 5
  rows", "Laid out the figure". A tool's name after a colon is left out. It reaches the pill through
  `Host.working(text, stop, far)`. Background jobs (section 8) are not built here: a job passes its progress the same
  way ("9 of 17 compounds").
- A screen reader reads out who draws and the step count as they change. A call's progress is in the pill to read,
  and is not read out at each change. Not tried with VoiceOver.
- A molecule that has cleared cannot show again. `mcp-gone` clears its parts for good as its turn ends, so a page
  too busy to put the next molecule in on time (a call can hold the page's thread for over 1 s) shows an empty ground.
  Tried in Chrome with the page's thread held for 900 ms across the end of a turn.
- It is drawn with plain boxes and CSS keyframes. In Chrome an SVG's parts could not be moved off the page's
  thread: each frame of the build laid the SVG out and painted it, and a loop on an `<svg>` kept the page's thread at
  work every frame.
- The glow is gone (its colours were not brand colours) and so is the light that ran along the pill's words (it was
  a background position, which the browser paints each frame).

Measured in Chrome 156 on Sam's Mac at 120 frames a second, during a call, 15 s traced. Every number here is from
Chrome:

| | Page-thread work | Frames that ran style | Layouts | Paints |
|---|---|---|---|---|
| The old blur and glow (the first build's trace) | 74 ms a second | every frame | 0 | two every frame |
| The molecule | 17 ms a second, 4 of them the script that ran the test | 469 of about 2,200 (while a molecule builds) | 2 (one for each new molecule) | 55 (at the same two times) |

A second animation on the same element as `mcp-life` took both off Chrome's own thread: the page's thread then ran
style on every frame, 73 ms a second. So `mcp-gone` is on an element of its own, and `motion.check.ts` holds that.

**Not seen in the app.** The app's web views are WKWebView (Mac) and WebKitGTK (Linux): nothing above was run in
either. To check in the `octet-mcp-beta` build: light, dark and engineering paper; Reduce Motion on in System
Settings; VoiceOver on; a Web Inspector timeline while it shows; that the soft window fades in and out (it is a
backdrop filter faded by opacity); and that each bond draws out from its atom (both ends of `mcp-draw` now list the
same transforms, so no engine has to go between them as matrices).

## 10. Short replies (R6)

- Every write result by default: one sentence, then `{ made: [...top-level ids], check: "clean" | {...}, warnings:
  [...], advice?: "..." }`. Drop per-atom names, Octet's IUPAC names of each compound, every caption id and boxes for
  everything. Keep boxes only for top-level objects made, with numbers rounded to 0.1.
- `detail: "full"` on any call gives today's full data.
- `read` defaults to `summary`: structures (id, number, formula; SMILES only when asked), reactions as
  `"2 -> 3 -> 4"`, the check and warnings. Today's short read is 75 KB for the taxol figure; the target is under 5 KB.
- Pictures: only when asked. Default `medium`, PNG at most 1000 px. Look at a faster picture path. 4.6 s for a large
  picture is the slowest thing Octet does for an AI app; profile `pictureOf` and `mcp_png`.

Built on 11 November 2026 (the result in `answer`, and `summary`, in `mcp.ts`):

- **A write result** is the sentence, then `{ made, boxes, warnings, check }`. `made` is the top-level objects, 200 at
  most: a number, conditions and a cycle's text belong to their structure, arrow or cycle. `warnings` is the new
  chemical warnings, 10 at most. The layout is in `check`, by id, and not in the warnings again. `more` says how many
  objects or warnings were left out. A tool's own answer stays (`opened` from `new_drawing`, `tables` from
  `fill_experiment`). A reaction's plus signs are in `made`: each has its own place, and `move` takes only the ids it
  is given, so a plus sign left out would stay behind when an AI app moves what a call made.
- **The sentence** says what was done in a few words. It names a compound only where Name to Structure read a name
  as another name (decision 0021): the name given, its formula and Octet's name (120 characters at most, 12 names at
  most). A SMILES or a file is drawn as given: it gets no name, and Octet does not work one out (12 ms a compound)
  until `detail: "full"` asks. A sentence too long for the 20,000 limit (a batch of 40 steps, each with 12 such
  names, was 71,000 characters) is cut to fit, and ends "(cut: detail: full gives all of it)".
- **A compound's note** (4.2.1: what its changes did at each stereocentre, a group Octet cannot read, a numbered atom
  with no hydrogens) is in the sentence too, after the names read another way, with how the compound was given and
  its number: "Octet notes: from 7 (8) [Atom 7 is no longer a stereocentre.]". `replace_structure` and `edit` with
  changes name the new compound, as the name is how an AI app sees that the change is the one it meant: "Replaced s1
  with (2S)-butan-2-ol [Atom 7 keeps its configuration (S).], now s2, which keeps its number 1." With text they name
  it only when Octet read the name another way. (Wave A, 11 November: lenient arguments and short replies merged
  with compounds as changes.)
- **`detail: "full"`** gives the data as it was before this step: the drawing, every id made, changed and deleted,
  their boxes, `names`, a figure's or a batch's ids by step, and the layout's warnings in words. Checked on both
  benchmark cases against the replies before: the same but for the sentence. A batch step's `detail` is the batch's.
  Every tool whose result is a change takes it, but `tools/list` lists it only on `read_drawing`: 23 more copies are
  1,219 characters in every chat, and take the tools past the 52,000 that `mcp.check.ts` allows. The instructions say
  it in one line ("detail: 'full' on any write call adds all it changed, with boxes"). **Closed in step 5 (5.5):**
  `detail` is listed on `draw`, `change` and `advanced`. **It was a known gap until then:**
  the listed schema of a write tool is closed and has no `detail`, so an AI app that checks its arguments against the
  schema cannot send it. Step 5 lists it on the merged tools. Sam can have it listed sooner (section 16).
- **`read_drawing`** is a summary by default: each structure's id, number, caption and formula; each reaction as
  `{ route: "1 + s4 -> 2 -> 3", conditions: { a7: "TBSCl, imidazole; DMF; 95%" } }`; cycles as before; free text (200
  characters of each); arrows and shapes outside reactions by id and kind; the check; the first 10 chemical
  warnings, each `at` its atom or structure. A compound goes by its number when the number is on one structure only
  and is not an id's form (`s9`), else by its id. The arrow is `->`, `<=>` (equilibrium), `=>` (retro), `<->`
  (resonance) or `-/->` (no reaction). `smiles: true` adds each SMILES. No default read is over 20,000 characters:
  while one is, its longest list loses its last half, and `more` counts what was left out. `atoms: true` and
  `detail: "full"` are never cut. A drawing as a resource is the summary. A cut read's `more` also has
  `rest: "detail: full reads all"`. An arrow with no conditions is in `conditions` with `""`: its id is how `add_text`
  and `edit` name it, and a summary lists a reaction's arrows nowhere else. The prompt `check_drawing` reads with
  `smiles: true`, as the chemistry cannot be judged from formulas.
- **Text and `structuredContent`** hold the same data, each once. The specification (2025-06-18 and 2025-11-25,
  Tools, Structured Content) says: "For backwards compatibility, a tool that returns structured content SHOULD also
  return the serialized JSON in a TextContent block." So an AI app gives its model one of the two, and each must be
  whole: a write's text is the sentence, a line break, then the JSON without the sentence; its `structuredContent`
  has the sentence as `done`. A read's text is its JSON. Data in only one of them would leave some AI apps without it.
  Octet cannot stop an AI app that gives its model both, and short replies make that cost small.
- **`outputSchema`** of a write: `done`, `made`, `warnings` and `check` are required, which holds short and full.
  Every call in `mcp.check.ts` is checked against its tool's `outputSchema`, and every default reply against the
  20,000 limit.
- **Speed.** A read no longer indexes the drawing for a change it does not report (2.4 ms a read on 40 structures),
  and the layout check skips its second pass when no shape has an edge to cross. A read reads each reaction once
  (it read it again from every arrow), `findReaction` finds and measures the structures once for all the rows it
  reads, and a short result does not work out the layout's warnings before the call (only a full result gives
  them).
- Not built: `advice` (it comes with the brief, section 3.2) and the picture work above.

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
| 5 | Tool merge (5.1 to 5.3), `$defs`, instructions (11) | 1 to 2 | `tools/list` under 4,000 tokens (done: 13,824 characters, 5.5); evals pass at least as well as v1 (not run: they need the app) |
| 6 | Overlay animation (9) | 0.5 to 1 | Sam likes it; `motion.check.ts` passes |
| 7 | Elicitation (3.1, 7.3) | 1 to 2 | A test client gets the form and the brief is stored |
| 8 | Background jobs (8) | 2 to 4 | A 40-compound route returns at once; progress in the overlay. **Not built:** a 38-compound route takes about 4 s in one call, and a job adds a model turn that costs more (section 8) |
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
| 1, arguments: lenient (11 Nov) | 63,462 (18,130), 26 tools | 2,358 | taxol-schemes | 3 | 0 | 4,436 | 15,889 | 2,657 | 19 of 19 | 42 |
| | | | taxol-v1-job | 33 | 0 | 15,482 | 359,204 | 4,236 | 19 of 19 | 23 |
| 1, replies: short (11 Nov) | 60,515 (17,290), 26 tools | 2,358 | taxol-schemes | 3 | 0 | 4,436 | 2,489 | 2,586 | 19 of 19 | 42 |
| | | | taxol-v1-job | 33 | 0 | 15,482 | 178,153 | 4,114 | 19 of 19 | 23 |
| 1, review (11 Nov) | 60,619 (17,320), 26 tools | 2,388 | taxol-schemes | 3 | 0 | 4,436 | 2,489 | 2,586 | 19 of 19 | 42 |
| | | | taxol-v1-job | 33 | 0 | 15,482 | 178,207 | 3,867 | 19 of 19 | 23 |
| 3a: compounds from earlier ones (11 Nov) | 63,605 (18,200), 26 tools | 2,457 | taxol-chained | 3 | 0 | 3,887 | 15,367 | 2,192 | 19 of 19 | 42 |
| | | | taxol-schemes | 3 | 0 | 4,436 | 15,836 | 2,569 | 18 of 19 | 44 |
| The layout faults of section 17 (11 Nov, `mcp/layout`) | the same | the same | taxol-chained | 3 | 0 | 3,887 | 14,849 | 2,192 | 19 of 19 | 42 |
| | | | taxol-schemes | 3 | 0 | 4,436 | 14,823 | 2,569 | 18 of 19 | 42 |
| | | | taxol-v1-job | 33 | 6 | 15,295 | 275,602 | 3,565 | 18 of 19 | 11 |
| Wave A merged: 1, 3a, the layout faults, the dev build and the overlay (11 Nov, `mcp/integrate`) | 59,857 (17,100), 26 tools | 2,487 | taxol-chained | 3 | 0 | 3,887 | 2,411 | 2,140 | 19 of 19 | 40 |
| | | | taxol-schemes | 3 | 0 | 4,436 | 2,090 | 2,569 | 19 of 19 | 40 |
| | | | taxol-v1-job | 33 | 0 | 15,490 | 169,663 | 3,867 | 19 of 19 | 9 |
| 5: the tool merge (11 Nov, `mcp/tools`) | 13,824 (3,950), 5 tools | 2,367 | taxol-chained | 3 | 0 | 3,941 | 2,411 | 2,140 | 19 of 19 | 40 |
| | | | taxol-schemes | 3 | 0 | 4,490 | 2,090 | 2,569 | 19 of 19 | 40 |
| | | | taxol-v1-job | 33 | 0 | 16,009 | 169,663 | 3,867 | 19 of 19 | 9 |
| Tool merge, page fit and transformations merged (11 Nov, `mcp/integrate2`) | 13,995 (4,000), 5 tools | 2,367 | taxol-chained | 3 | 0 | 3,699 | 2,819 | 1,777 | 19 of 19 | 40 |
| | | | taxol-schemes | 3 | 0 | 4,490 | 2,208 | 2,481 | 19 of 19 | 40 |
| | | | taxol-v1-job | 33 | 0 | 16,010 | 169,892 | 3,713 | 19 of 19 | 9 |
| | | | corpus-chained | 3 | 0 | 1,781 | 1,232 | 105 | 6 of 6 | 2 |
| 2: the brief (11 Nov, `mcp/brief`) | 13,994 (4,000), 6 tools | 2,768 | taxol-chained | 4 | 0 | 3,731 | 3,050 | 1,776 | 19 of 19 | 40 |
| | | | taxol-schemes | 4 | 0 | 4,522 | 2,439 | 2,481 | 19 of 19 | 40 |
| | | | taxol-v1-job | 34 | 0 | 16,042 | 170,123 | 3,713 | 19 of 19 | 9 |
| | | | corpus-chained | 4 | 0 | 1,813 | 1,463 | 105 | 6 of 6 | 2 |
| 4: draw_route (11 Nov, `mcp/brief`) | 13,991 (4,000), 7 tools | 2,928 | taxol-route (Quick start) | 3 | 0 | 3,606 | 5,052 | 1,842 | 19 of 19 | 0 |
| | | | taxol-route-paper | 3 | 0 | 3,606 | 5,528 | 1,804 | 19 of 19 | 40 |
| | | | taxol-chained | 4 | 0 | 3,731 | 3,053 | 1,776 | 19 of 19 | 40 |
| | | | taxol-v1-job | 34 | 0 | 16,042 | 170,123 | 3,713 | 19 of 19 | 9 |

- Step 4 against the targets of section 15 (`taxol-route`, against `taxol-v1-job`): 3 calls (34), 0 failed (0; 6 in
  v1), 3,606 characters written (16,042; draw_route's arguments are 3,572), largest reply 2,690 characters, the route's
  on a paper page (465 KB in the v1 run), `tools/list` 3,997 tokens, Octet 1.8 s for the whole route (3.7 s). No
  moves: the one read is the check. The draw_route call takes what the three draw calls of `taxol-chained` take: in
  turn, four rounds at load 5 to 9 (the quickest of three each), `taxol-route` 1,773 to 1,862 ms and `taxol-chained`
  1,754 to 1,866 on the code before and 1,805 to 1,845 after. The new respacing after the orientation turn takes 0.3
  ms for the 17 products of the three schemes.
- 3b (named transformations): `taxol-chained` has 18 of its 21 structures written `from` another; only 2 and 8 (each
  scheme's new skeleton) and taxol 1 (its side chain is a reagent, not an earlier compound) are text. The 18 take
  1,581 characters where they took 2,399 (66%); the job sends 3,645 where `taxol-schemes` sends 4,436 (82%), and
  reads 2,656 (was 2,411: the notes of the new compounds). `corpus-chained` writes three corpus jobs (gaunt2007-fig13,
  zu2025-fig3a, grocott2025-fig4e) chained, 7 of 7 right; it sends 1,337 where the three jobs send 1,161, as a
  name (crotonaldehyde) is shorter than a SMILES with map numbers. The 16 compounds of the route with changes take
  186 ms against 192 ms from SMILES; the 5 of them laid out again take 116 ms against 55 ms.
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
- Step 1, arguments: no call is refused. The six calls that were refused now do their work, so `taxol-v1-job` does
  more than before: the check grid is drawn twice and read twice, and the β-lactam batch draws. That is the growth in
  characters read and in Octet's time, not slower code (the three schemes alone take the same time). The case's
  `delete` call now names both grids and the structure `replace_structure` made. Its warnings went from 17 to 23: two
  fewer for compounds 7 and 13 drawn twice, one more for the caption `taxol` past the page edge with its structure,
  and seven more where the case's later row moves put scheme 3 on the β-lactam. The runner also counts coerced lines:
  1 and 5. `tools/list` grew by 114 characters: `caption` on each of the four compound lists, and `summary` for
  `short`. Times were taken with other work running on the Mac: the three schemes took 2,656 ms before the change on
  the same day, so `results.json` keeps 2,599 for them. The coerce step itself takes about 4 µs on scheme 3's
  arguments (the dispatcher refuses them in 18 µs, 13 to 14 before) and nothing that can be measured on a small call.
- Step 1, replies: the three schemes' replies went from 15,889 characters to 2,489. In `taxol-v1-job` the 22 calls
  that change the drawing went from 58,052 to 15,542, and the five default reads from 154,261 to 15,720 (2,236 to
  4,368 each). The four reads that ask for `detail: "full"` are 138,990 of the 178,153 left, and the two files 7,901.
  The runner has a new column, Summary: the default read of the finished drawing, 2,825 and 3,380 characters (the
  target is under 5,000). `tools/list` is 2,947 characters shorter (the write tools' `outputSchema`), and what an AI
  app gives its model (name, description, input schema) is 51,722, from 51,725. Octet's time, taken in one process
  with the code before and after in turn (best of 4, other work running): the schemes 2,697 ms before and 2,637
  after, the job 4,368 and 4,102, a default read of the finished drawing 57.5 and 32.9, a full read 59.5 and 57.8.
  Nearly all of the schemes' time is Map Reaction Atoms (2.7 s in 17 calls).
- Step 1, review: the fixes from the review of step 1, with `release-1.2-mcp` merged in (the 60 corpus jobs:
  225 of 240 right and 181 warnings, as there; they read 30,402 characters, 112,152 there). `tools/list` is 104
  characters longer (`caption` named in four descriptions, and `run_command`'s last line) and the instructions 30
  (the line on `detail`). What an AI app gives its model is 51,826 (51,722). The taxol summaries are 18 characters
  longer (2,843 and 3,398): `"caption":"taxol"` on compound 1's row, which a summary did not have. Time, the code
  before and after in turn in one process (best of 6 to 30, with other work running on the Mac, so `results.json`
  keeps the lower time of each case): a default read of the finished taxol job 36.5 ms before and 13.0 after, a full
  read 64 and 41, every reaction of that drawing read 19.3 and 13.6, the three schemes 2,822 and 2,821 (each call's
  best), the job 4,256 and 4,188. `findReaction` on one small reaction is the same (10.8 and 10.9 µs). The
  benchmark's own run of the job, when the Mac was quieter, took 3,867 ms (4,114 kept before).
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
- Wave A merged (`mcp/integrate`: `mcp/layout`, `mcp/args`, `mcp/dev` and `mcp/overlay` on `release-1.2-mcp`). No
  case has fewer structures right, more refused calls or more warnings than on any of the three branches that
  measured it.
  - The three schemes have 40 warnings, all of them scheme 3 under the page's bottom edge (Octet lists 40 at most).
    The two for the numbers 7 and 13 on two structures are gone. They read as three reactions of 5, 5 and 7 steps.
  - `taxol-v1-job` has 9 warnings (17 at step 0, 23 with step 1 alone, 11 with the layout faults alone). After its
    three schemes and the β-lactam it has none: all 9 come from the row moves that follow, which are v1's fixes
    replayed on a drawing that no longer needs them. It sends 8 characters more than with step 1 alone: the MOL text
    it sends back has one more digit in some coordinates, as the grid is at the top of the page.
  - The 60 corpus jobs: 225 of 240 right, 1 refused call, 162 warnings, 30,476 characters read and 36,631 in the
    default reads of the finished drawings. With step 1 alone they read 30,402 and 36,658.
  - The tools as an AI app gives them to its model were 52,055 characters with step 1 and 3a together, over the
    52,000 that `mcp.check.ts` allows. They are 51,064: text that can be runs is listed once in `draw_figure`
    (`$defs.rich`, 862 shorter) and an arrow's end once in `add_arrow` (`$defs.place`, 129 shorter). `$defs` can give
    no more: each tool's schema stands alone, and the molecule comes once in each of the four tools that take it.
    936 characters are left (section 16).
  - Times: `results.json` keeps, for each case, the lowest of the times the three branches kept and three
    `--write` runs of the merged code (load 6 to 8 on the Mac). 15 of the 63 keep a branch's time. `taxol-v1-job`
    keeps step 1's 3,867 ms, as only that branch has the job with no call refused (measured here: 3,948 to 4,058).
    Replayed by two codes in one process in turn (each call's quickest of 5): the schemes 2,747 ms merged and 2,726
    with step 1 alone, the chained schemes 2,338 merged and 2,354 with the layout faults alone, the whole job 4,131
    merged and 4,042 with step 1 alone at load 7 to 13. The job's two grids, 12 times each at load 27: 334.5 and
    353.9 ms merged, 337.3 and 351.7 with step 1 alone. No slower code was found, and the noise was 2 to 4%. Run
    `--write` once more on a quiet Mac.
- Step 5, the tool merge. Nothing but what is sent changed: every case has the calls, refused calls, characters read,
  structures right, warnings and summary it had (the 60 corpus jobs: 225 of 240 right, 1 refused, 162 warnings,
  30,476 read, 36,631 in the default reads).
  - Sent is up, as what was the tool's name is now an argument, and the runner counts arguments only. A draw sends
    15 to 20 more (`"kind":"reaction",`) and its name is 6 to 11 shorter, so it is 9 more to write in all. The 60 jobs
    send 30,722 (29,662). `taxol-v1-job` sends 16,009 (15,490) in the same 33 calls, and its tool names are 176
    characters (318): 377 more in all, 11 a call.
  - Times: `results.json` keeps each case's lower time (62 of the 63 are the times kept before; the Mac's load was
    10 to 30 through the night). In one process in turn, on one drawing, 3,000 calls each (the quickest, in µs):
    a move 270.3 before and 271.9 after, a select 55.5 and 56.5, a read 99.0 and 99.0, listing the drawings 2.5 and
    3.0, a refused call 2.0 and 3.2. Finding a call's operation costs 0.5 to 1.5 µs, which no case shows. The three
    schemes took 2,807 ms before and 2,720 after (the quickest of 6), a grid of six 7.95 and 7.97. `tools/list`
    itself is answered in 0.07 ms (0.83): it is made once, not at each call.
- Tool merge, page fit and transformations merged (`mcp/integrate2`: `mcp/tools`, then `mcp/fit`, then
  `mcp/transform`, on `release-1.2-mcp`, then what fit and transform left for the tool merge published in help, 5.5).
  No case has fewer structures right, more refused calls or more warnings than on any branch that measured it.
  - The 60 corpus jobs: 227 of 240 right, 1 refused call and 73 warnings (as `mcp/fit`; 225, 1 and 159 on
    `mcp/tools`), 30,722 characters sent (as `mcp/tools`), 30,233 read and 34,731 in the default reads (as
    `mcp/fit`).
  - `taxol-chained` sends 3,699: `mcp/transform`'s 3,645 and 54 for `"kind":"reaction",` in three calls. It reads
    2,819: fit's sentences on what does not fit the page and transform's notes on the new compounds (2,411 on
    `release-1.2-mcp`, 2,647 on `mcp/fit`, 2,566 on `mcp/transform`). `taxol-schemes` reads fit's 2,208.
    `taxol-v1-job` sends 16,010, one more than `mcp/tools`, as on `mcp/fit` (the MOL text it sends back).
  - `corpus-chained` (new on `mcp/transform`): 6 of 6 right, sends 1,781 (1,727 there, and 54 for the kind), reads
    1,232 (1,241 there: fit's shorter replies).
  - Times: `results.json` keeps, for each case, the lowest of the times the four branches kept and three `--write`
    runs of the merged code (load 4 to 5). 19 of the 64 keep a branch's time, `taxol-v1-job` among them
    (`mcp/transform`'s 3,713 ms; measured here 3,820 to 3,889). `run.ts taxol-v1-job` on each branch's code in turn,
    four rounds (the quickest, and the slowest): `release-1.2-mcp` 3,701 (3,794), `mcp/tools` 3,791 (3,942),
    `mcp/fit` 3,803 (3,959), `mcp/transform` 3,742 (4,188), merged 3,817 (3,832). The merged code was the steadiest,
    and its quickest is 3% over the quickest branch: within the noise of these runs, but no run proves it is not
    slower. The three schemes: 2,481 merged against 2,543 on `mcp/transform` (each code's quickest of 4); the chained
    schemes 1,771 against 1,791.
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

From the review of step 1 (11 November 2026). Each has a default that is built, so nothing waits:

1. **Done in step 5 (5.5).** **`detail` on the write tools is not in `tools/list`** (section 10). Listing it is 53 characters a tool, 1,219 for
   the 23 tools, which takes what an AI app gives its model past the 52,000 check. Three ways: list it and
   find the characters (taking "Add a PNG of what changed" off the 20 write tools and saying it once in the
   instructions gives back 840); raise the limit; or leave it until step 5 merges the tools. Built: left until step 5.
   Since wave A the tools are 51,064 characters, so 936 are left: still too few to list it.
2. **Any text in brackets after a number becomes a caption** (section 6): `"7 (85%)"` is number 7 with `85%` under
   it, `"5 (R)"` is number 5 with `R`, `"2a (R = Me)"` is 2a with `R = Me`. Before, each was drawn whole as the bold
   number. Is that right for a yield and for a descriptor, or should only a name be split off? Built: all are split,
   and the reply says how each was read.
3. **`replace_structure` keeps the caption** under the structure, as it keeps the number, and says so. A caption that
   names the old structure is then out of date. The other way is to take the caption away and say that. Built: kept.
4. **The SMILES `CCC` is drawn as chlormequat chloride**: Name to Structure reads it as the trade name CCC before it
   is tried as a SMILES. The result's sentence shows it ("Octet read the names as: CCC (C5H13ClN; ...)"). It is the
   same on `release-1.2-mcp`, and the reading is Name to Structure's own, so it is not changed here. Should a text
   that is a valid SMILES of plain atoms win over an abbreviation?

From the merge of wave A (11 November 2026). Each has a default that is built:

1. **Past (step 5, 5.5): the check is 14,000, with 176 left.** **Room under the 52,000 check: 936 characters.** `$defs` is used up (15.1). More room needs one of: open
   objects (`colours`, a change, a batch step's `args`) listed as `{"type": "object"}` with no empty `properties`
   and no `additionalProperties: true`, which means the same in JSON Schema (about 540); the picture argument's
   description said once in the instructions (840, and the instructions grow); or step 5's tool merge. Built: none.
2. **The words for a compound's note in a short result** (section 10): "Octet notes: from 7 (8) [Atom 7 is no longer
   a stereocentre.]". The compound goes by how it was given (`from 7`). Octet's name for it is left out, as a short
   result names no compound. Built: so.
3. **What a call made comes into view, and the overlay's molecule is in the middle of the window** (section 9). With
   both merged, the molecule's ground may lie over the new work for up to 8 s. Not seen in the app.

## 17. Known issues to fix along the way (from the taxol run)

All of these fixes are in `mcp/integrate` (wave A, 15.1).

- **Fixed (11 November, `mcp/args`).** `replace_structure` refused MOL text that `get_file` wrote (section 6). Text
  of several lines keeps its lines and spaces.
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
- **Fixed (11 November, `mcp/args`).** A compound repeated across schemes (7, 13) warned "number on more than one
  structure" (section 5.4). The warning is only for structures that differ (by InChIKey).
- **Fixed on the Mac (11 November, `mcp/dev`).** The MCP Beta build shared `mcp.json` with the installed Octet, and
  two Octets running fought over it. A debug build keeps `mcp-dev.json` in the same folder and uses port 47682
  (decision 0021).

Left after wave A:

- Page fit (sections 3.2 and 5.4): a scheme taller than what is left of the page, and a line that cannot break.
  The three taxol schemes' 40 warnings are all this.
- A salt drawn as two ions under one number still warns "number on more than one structure" (17.1, Salts). Fixed
  in `mcp/fit` (17.1).
- Calls on one session wait behind a long batch (section 8, step 8). Left so: the longest call measured takes
  about 4 s (section 8, not built).
- A dev build beside the installed Octet on Windows and Linux: the second Octet gives its files to the first and
  ends, so a dev build needs its own identifier there (decision 0021). On every platform the two share recent
  drawings and Home's folders, and the one that saves last drops what the other added.
- A compound number that two structures have names the first of them, in `change` and `read` (found in step 5, 5.5:
  renumbering 1 to 2, then 2 to 3, changes the first structure twice). `from` refuses such a number. `change` says
  to renumber by id.
- A step added to a drawn scheme needs `clean_reaction` after it (5.5). `draw_route` (5.4) is where a scheme that
  grows belongs.
- Not tried in the app, as no session could start it on the night of the merge: that what a call made comes into
  view (`mcp/layout`), the overlay in WKWebView (`mcp/overlay`, section 9), and acceptance case 18 against a dev
  build (`mcp/dev`). An AI app set up for a dev build by its address must be given port 47682 and the key in
  `mcp-dev.json`.

### 17.1 Faults the paper corpus found (11 November 2026)

60 jobs from six papers (`scripts/mcp-bench/corpus/`), each structure read from the page by one agent and checked by
a second. v1 draws 225 of 240 numbered compounds right. The 67 confirmed faults, each with its smallest input, are
in `docs/plans/mcp-v2-corpus-faults.md`. Grouped:

| Group | Faults | Where |
|---|---|---|
| Labels not read, with no warning | `Bpin`, `BBN` (read as B-B-N), `F3B`, `D`, `Allyl`, `Vinyl`, `OtBu`, hyphenated `t-Bu`, `i-Pr`, `n-Bu`, `4-ClPh`. A nonsense label gets the same silent reply. **Done on `mcp/labels` (11 November):** each is read, and a result names every label Octet does not read. Still not read, and named in the result: ChemDraw's `i-C3H7`, `t-C4H9`, `t-Butyl`, `t-Boc`, `p-Tolyl`, `c-Hx` and its Am names; `CDCl3` and `CD3OD`; a phenyl with two different groups on it. Every path that takes a label from an AI app goes through `givenLabel` and `unknownLabel` (`src/labels.ts`): a * of a compound in JSON or lines (`{R}`, a scope's `R=`), an atom of a molecule, `edit`'s label and a change's new group (`compound.ts` `labelled`). A label given as runs (a molecule atom's `runs`, `edit`'s `runs`) is kept as written: its runs are the text and styles the AI app asked for. A nitrile written from its N (`MeCN`, `NCMe`) and a label written round a stand-in after its first atom (`OPG`, `HNu`, `MLn`, `CO2Alkyl`) were found after the merge: the first is named as not read (it had been read as an amine), the second is not named. | `src/labels.ts`; `readAs` and `unreadNote` in `src/mcp.ts` |
| Labels read wrong | `Ar` drawn as phenyl (the tool description's own example); `NC` as an isocyanide; `P(O)(OEt)2`; `BF3K` warned though right; a radical marked on Si or N of an expanded label in `read_drawing`'s SMILES. **Done on `mcp/labels`:** all five. `NC` for a * in an AI app's call is the nitrile; `NC` typed in the editor stays an isocyanide until Sam has tried it in ChemDraw 22.2. **Open for Sam:** the editor's `NC` (an isocyanide) and the editor's `Ar` on a bonded atom (still argon, through `setLabel`), where every MCP path makes `NC` the nitrile and `Ar` an aryl *. | `src/labels.ts`, `src/chem.ts`, `src/mcp.ts` |
| Salts | A salt given as one compound becomes two structures with the same number. No structure has the salt's InChIKey, and the scheme does not wrap. | `read()`, `place()` in `src/mcp.ts` |
| Layout | `draw_structures` picks columns by count, not by the page or by label widths. A one-step reaction that is too wide is not fitted. A `structure:` line over an arrow gets no room. A wrapped second product drops out of the reaction as read. Side-arrow text on a cycle overlaps. | `src/mcp.ts`, `src/reaction.ts`, `src/cycle.ts` |
| Tool gaps | A structure at an arrow takes no number or labels. `draw_structures` takes no caption. A number is at most 12 characters. A cycle takes no text node and no structure on a side arrow. A double bond with no geometry is drawn and keyed as E. | The compound object (section 4.1) fixes the first three |
| Metals | A neutral N or P donor on a metal warns about valence. `Ir(ppy)3` by name warns on each N. `fac-` is dropped with no note. Hoveyda-Grubbs by name has no O to Ru bond. | `src/check.ts`, `src/complexes.ts` |
| Name to Structure | `(R)-carvone` and `(R)-limonene` refused though the (S) forms read; chlorido complex names; spelling variants of catalyst names; a quinuclidine with bridgehead descriptors | `src/names.ts` (outside the MCP: for Sam to place in a release) |
| Small | A valence warning numbers the atom by the whole drawing. `1,5-HAT` is split at its comma. Explicit H at ring fusions is missing when a group is a label. | `src/check.ts`, `classify()` in `src/mcp.ts` |

The label, salt, layout and tool-gap groups are MCP work and are in the build order. Names and metals change what
every user sees, so each needs Sam's yes and the ChemDraw cross-check.

- **Fixed in part (11 November, `mcp/fit`).** Salts: a compound of several structures is one compound in
  `read_drawing`, ids, numbers and reaction sides (`compounds` in `src/mixtures.ts`): the ions of a salt, by the rule
  Structure to Name uses (`withSalts`, which now pairs the nearest ions first, so two salts side by side are two), and
  the structures under one number. A group is not a compound, and Octet makes none for a salt. A lone H+ by an anion
  stays apart (a mechanism step). Layout: `draw_structures` takes its columns from the page and each structure's box
  as drawn; conditions longer than 30 characters go on more lines; a second product goes to the next line and is
  still read as the step's; a structure at an arrow gets room. Tool gaps: a line in `above` or `below` can be a
  compound object. The reply says what does not fit (a grid, a scheme, a cycle and its side text). Benchmark: 162
  warnings to 73, 225 to 227 right of 240. Merged with the tool merge and the named transformations
  (`mcp/integrate2`, 15.1): the same 227 and 73 there, on `draw`, `change` and `read`, and `help` of `reaction` says
  what a line at an arrow takes (5.5). Left: a one-step reaction wider than the page is not fitted (zu2025-fig3a,
  3b, 3c, 4b, robinson2026-fig3c, proctor2019-scheme72-52: the reply says so and what to do); grocott2025-fig4e still
  has 7 warnings; a hydrate or other parts with no charge and no number read as several compounds.

### 17.1.1 In the app (11 November 2026, the MCP Beta dev build with wave A merged)

`node scripts/mcp-acceptance.mjs`: 113 checks pass and 2 fail. Both failures are one fault, in cases 5 and 6 (the
experiment page): the second line under the arrow ("90%") overlaps the top of the reagent table by 0.1 bond
lengths. With no window the same overlap was there before wave A and after it: the editor started the reagent table
under the components, their numbers and the conditions that make a column, and left out text under the arrow that
makes no column. Fixed on `mcp/int2` (1c3790f): `layGrid` in `src/gridview.ts` now starts the table 0.9 bond length
(at the arrow's scale) under all the text under its arrow. The windowless acceptance run of the merged tree gives
"Every check passed." (106 PASS; `--headless` leaves out cases 7, 9, 18 and 21). Case 18 (the relay and Claude Desktop's bundle against a dev build's
`mcp-dev.json`) passes.

Not seen by anyone yet, as no agent may drive the app's window: the overlay in WKWebView (light, dark, Reduce
Motion, VoiceOver), and that the first thing drawn on a new Paper drawing comes into view.

### 17.2 Indigo stops working after about 1,266 refused calls

Found by the 1.1.2 session on the same night (it is the cause of the 1.1.1 crash): each call Indigo refuses loses 32
to 48 bytes of its 64 KB stack for good, and then any call fails ("getWasmTableEntry(...) is not a function",
"memory access out of bounds"). The benchmark met it when it drew all 60 corpus jobs three times in one process. An
AI app sends many texts Octet cannot read, so a long MCP session can reach it too (test plan P6 and R3). The fix is
on the 1.1.2 side (`item/indigo-crash`) and comes here with the merge. Until then the runner draws each corpus job
once.

Merged on 11 November 2026 (branch `mcp/112`): the benchmark runs every case in one process, the lines cases too. It
gives the event loop a turn before each call, as an AI app's calls come one at a time, so Octet's fresh Indigo (loaded
after 500 failed calls) takes over: with no turn it never loaded, and the 1,038th failure (zu2025-table1) ran out of
memory. Three runs in a row, 146 cases each, all clean. Each corpus job is still drawn once, for the run's time.
The limit is still there inside one call: Octet (`src/chem.ts`) can change to a fresh Indigo only between turns of
the event loop, so a single tool call that makes about 1,270 refused Indigo calls with no turn between them still
runs out of Indigo's stack. No job in the benchmark comes near it (zu2025-table1, the most, makes about 1,040 over
many calls). Open: chem.ts could give the event loop a turn inside a long batch.

### 17.3 Taking 1.1.2 into this branch (from the 1.1.2 session)

`release-1.1.2` has a commit that takes the MCP out (`38674b3`). Record it as merged with none of its changes
first, then merge the rest: `git merge -s ours 38674b3`, then `git merge release-1.1.2`. Expect conflicts in
`src/Editor.tsx`, `src/editor.css` and `src/releases.ts`. Only when Sam says.

After that merge, two things for Clean Up Reaction (1.1.2's `item/clean-up`, `166c79a`, which Sam approved on 11 Nov:
Clean Up Reaction now does both jobs and `clean_reaction_augmented` is gone):

- Take `clean_reaction_augmented` off `run_command`'s list in `src/mcp.ts`.
- In the app, `clean_reaction` lays the reaction out first and turns the products from a timer when the glide ends
  (`turnNext`, `turnProducts` in `Editor.tsx`), so a `run_command` call returns before the turn. The MCP path and
  `scripts/headless/host.ts` must turn the products at once (`turnProducts`, then one set), so the call returns the
  finished drawing. Add a check that the reply's drawing is the turned one.

Done on 11 November 2026 (branch `mcp/112`): the merge, both points above, and `turnScheme` in `src/interpret.ts`,
which the editor and the host with no window share.
Then what else 1.1.2 added, for full parity (same branch): the spectrum, SDF and Insert commands, opacity, the later
template sets in place_template, gels, plasmid maps, membrane lines, a bond's own widths, the drawing's properties,
the reagent table's roles, measured amounts, concentration and conditions, and CML, CT, SLN, HELM and FASTA in read
with a format.
After review (same branch): an edit to a plasmid map changes only what it gives; a gel's range needs two sizes; a
gel hides its lane names and scale (edit's gel hide, and shape.hide.names and shape.hide.scale); a gel's lanes come
and go as the Lanes actions add and delete them, so the gel gets wider or narrower; a band past the lanes is named
in the result; fill_experiment sets a role with the table's own setRole, gives each step a table (steps) and hides
empty rows (hide_empty); read with a format gives chemfig and BMP; the editor turns the products at once only for
the call's own Clean Up Reaction. Left out, for Sam: the Properties panel's CAS number and Find hazards. Hazards and
the CAS numbers the dictionary lacks come from PubChem, which Octet asks only when the user presses the button
(decision 0008): an AI app's call is not that press. The CAS numbers in Octet's own dictionary could go in read;
that is not done yet.

### 17.4 Pushing these branches

`release-1.2-mcp` is on GitHub from 11 November 2026 (Sam: the MCP is 1.2 and all of it goes on the 1.2 branch; never
`main`, and no `v*` tag, which starts the release). Two files stay private and are in no pushed commit: the first MCP
plan and decision 0021. They were taken out of the 90 commits that had not been pushed, and they are kept outside the
repository.

A branch made before that day (`mcp/*`) still has them in its own history. Before it is merged or pushed, give it the
same history, from a clean worktree:

`git filter-branch --index-filter 'git rm -q --cached --ignore-unmatch docs/plans/mcp.md docs/decisions/0021-mcp.md' -- BRANCH --not --remotes`

The rewrite gives the same commits each time, so a branch done later sits on the pushed history. Then clear the two
files from that branch's worktree. Never add either file again.

### 17.5 Several AI sessions at once (found 11 November 2026, to fix with step 8)

In the eval run of 11 November, 8 agents worked at once in one Octet. A call that takes 0.1 to 2 s alone took up to
114 s, and a new drawing timed out three times. Traced from the code (nothing a call waits on stops when its window
is behind others: `settle`, `ready` and the new-drawing wait already use message polls, not timers or frames):

| Cause | Proven? | Smallest fix |
|---|---|---|
| A session with no drawing yet is given the last window opened (`mcp.rs` `serve`, `windows::front`). So every session's first calls run in one page, one after another, and **a tool that session calls before it makes its own drawing acts on another session's drawing.** | From the code | Do not give a session a drawing on protocol methods or on `drawings`; only on its first other call. Answer initialize, ping, tools/list, prompts, resources/list and `drawings` outside the page's queue (`handle` in `mcp.ts`). |
| A new drawing polls the window list for 8 s with no pause, from every waiting page, on the app's main thread. Eight windows starting at once need longer. | From the code | Return when `open_window` gives the label and the session's target is set. Rust's 15 s wait for the page then covers start-up. |
| A request sent to a page that is not ready after 15 s is lost, and the call waits the whole 120 s. | From the code | Answer at once: "The drawing is still starting. Call again." |
| Reply, progress, cancel, ready, target and window-list commands run on the app's main thread, with window making. | Structure from the code, size not measured | Mark them `#[tauri::command(async)]`: each only takes a lock. |
| WebKit slows the page of a covered window (App Nap, background role), though windows are built with background throttling off when AI apps are on. Home is not. | Likely, needs a measurement in the app | For a window with a call in flight, turn window occlusion detection off (a private WKWebView setting, guarded) and back on after. |

Test with no one watching: `scripts/mcp-acceptance.mjs` with 1, 2, 4 and 8 clients at once and Octet behind another
app. Each makes a drawing, draws, restyles and reads. Every session must end in its own drawing, none may time out,
and no call may take over 15 s. The second check fails today.

**Built (11 November 2026, branch `mcp/sessions`).**

- **Where a session's calls go** (`mcp.rs` `route`). A session with a drawing: that drawing. A session with no drawing
  yet sends initialize, ping, the lists, prompts and `drawings` to the window in front and takes no drawing by them
  (`drawings list` then gives no `using`). When the page in front has not started (often another session's new
  window), they go to the newest window whose page listens (`listening`), so they never wait for another session's
  new drawing. Its first other tool call (`set_brief` too) takes the window in front, as
  decision 0021 and mcp.md section 8 have an AI app work in the user's open drawing, **unless another session works
  there**: then Octet changes nothing and says so, with the two ways on ("For a drawing of your own, call drawings
  with action new, then call again. To work in draw-3 with the other AI app, call drawings with action use and drawing
  draw-3."). A session works in a drawing while it has a call under way or called in the last 10 minutes, so a session
  an AI app left without ending it does not hold the user's drawing for the 12 hours sessions last. Two sessions with
  no drawing that call at once: the first through the sessions lock takes the window in front and the second is
  refused, so the second never acts in the first's drawing. `drawings new` gives the session its new window inside
  `open_window`, before the window is made, so no other session's first call can take it in between (if the window
  cannot be made, the session has its drawing from before again).
- **The page's queue** (`handle` in `mcp.ts`). The protocol's own requests and `drawings` are answered at once, outside
  the queue: they neither wait for the drawing to settle nor read it (so `drawings new` and `use` report no change,
  only the drawing the session uses now). Everything else runs in order, so a read sees each write whole.
- **A new drawing** answers once its window is made, with no wait for the page. `mcp.rs` holds the session's next call
  up to 15 s for the page to start, then answers "The drawing is still starting. Call again." at once.
- **Commands off the main thread:** `mcp_reply`, `mcp_progress`, `mcp_cancelled`, `mcp_ready`, `mcp_target`,
  `mcp_brief` and `window_list` are `#[tauri::command(async)]`.
- **The WebKit measurement, not the fix:** a dev build run with `OCTET_MCP_TIMES=1` gives each reply's
  `result._meta["octet/times"]`: `sent` (Rust sent it), `got` (the page's listener got it), `start` and `end` of the
  work, `wait` (in the queue) and `work` in ms, and the page's `visibility` and `focus` when it got the call. A large
  `got - sent` with `visibility: "hidden"` is WebKit slowing a covered page.
- **The test:** acceptance case 21. Run a dev build with `OCTET_MCP=1`, put another app in front, then
  `node scripts/mcp-acceptance.mjs 21`. It prints each call's median and slowest time for N = 1, 2, 4 and 8.

## 18. Scripting (#89) and batch conversion (#91)

Sam's answers (Start here, 10): a script uses the same tools as AI apps; from the command line it may also open and
save files and loop over a folder; AI apps still have no file access; batch conversion runs from the command line
only, with no menu item; it handles everything Octet opens and saves.

**Decided (Sam, 11 November 2026: "you decide whatever the best option is"): build it as written here.** The command
is `--convert` on the app's own program. No `octet` command is put on the PATH: that is an installer step on each
platform for a hidden feature, and a user who wants a short name makes an alias. The scripting page shows how.

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
- **Files are the script's own work.** The script reads a file and gives its text to `drawings { new, text }`
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

### 18.5 As built (steps 9 and 10, 11 November 2026, branch `mcp/headless`)

- `Octet Draw --headless --mcp` (`--headless` alone is the same): main.rs starts the app with no window in the config,
  no single-instance hand-over, no files from the arguments, no `OCTET_MCP` server, and on the Mac the Accessory
  policy (no Dock icon, no menu bar). A thread opens one hidden drawing window (`windows::open`, Quick start) and runs
  `mcp::stdio`. That reads JSON-RPC lines and takes the server's own route (`route`: sessions, subscriptions, the
  window) and call (`send`, `answer`) with standard input and output in place of HTTP, and no rate limit. When input
  ends, the calls under way finish and Octet ends. Nothing listens and nothing reads or writes `mcp.json`.
- A hidden page is told so (`index.html?window&headless`): it keeps no recovery copy, saves no settings, offers no
  Export dialog (`advanced export` says it cannot), and a window opened with a file answers once the file is open, or
  answers each call with why it did not open. `window_show` and Home do nothing with no window.
- WebKit holds back a hidden page's timers, and the names engine waits on them: the first Name to Structure took 47 s.
  `windows::open` turns WebKit's `hiddenPageDOMTimerThrottlingEnabled` off for a hidden page (0.4 s). WebView2 and
  WebKitGTK were not tried (no Windows or Linux here).
- `read` with a format takes every format Export writes. The pictures come from `exportRequest` (Editor.tsx), the
  request Export and Quick export send, through `export_bytes` (export.rs), which runs Export's own `file_of` and
  writes nothing. Options: `dpi`, `transparent`, `width_mm` (the whole picture, margin included, that wide). They
  are left out of tools/list (unlisted). After the merge with set_brief and draw_route, tools/list had 2 characters to
  spare, so it lists only the 8 formats read had before (the rest are `quiet`: taken, not listed), and `advanced
  help` of `file` names every format and the options. read's description points there.
- `--convert` (convert.rs): each file is read with File > Open's limits (`open::read`), opened in a hidden window as a
  window opened with a file's text, restyled (`--style`: a preset through `set_style`, or a drawing's file as File >
  Apply Settings From File), then made with `read` and written as Export writes it. `--to sdf --each` reads each
  structure as a MOL and adds its number as `> <Number>`. A file that is there gets ` 2`, ` 3` and on in its name.
- After review: `--convert` reads only regular files (a named pipe, a device or a folder walked to: refused or left
  out), and at most 64 MB of one, whatever its size said first (`read_text_or_cdx`). A folder gives the drawings
  File > Open opens and the files Import a Structure reads (`open::DRAWINGS` and `STRUCTURES`, one list each; File >
  Open's filter uses `open::DRAWINGS` too). Two inputs with the same name never write over each other, with or without
  `--overwrite`: the second gets a number. `--style` is tried once before any file: a file that is not a drawing, a
  drawing Octet cannot read, or a preset it does not have ends the run with its reason and exit code 1. What File >
  Open says it left out is said on the file's line. A structure file's text waits for Indigo before it opens.
- `--headless` and `--convert` count wherever they are in the arguments; `--mcp --headless` is never the relay.
  `--headless` takes only `--mcp`, and `--convert` takes no `--headless`: anything else is refused with the usage line
  and exit code 2. No line goes out with `println!` or `eprintln!` on these paths (they panic when the reader has
  gone, as `| head` does): `say!` lets a line it cannot write go. With no window, run_command refuses a command that
  opens a dialog or a box to type in (its menu name ends in "…", Save on a drawing with no file, a step's text above or
  below its arrow), and Export, each saying to use read with a format. A second initialize on standard input keeps
  the session (its brief and its drawing). `drawings new` takes a file's `text` (unlisted, in advanced help of `new`;
  at most 1,000,000 characters, as `add_file`),
  which opens in a window of its own in its own style.
- Windows: not run (there is no Windows here; the whole program does not build for Windows on this Mac, as ring needs
  a Windows C toolchain). What the code assumes: the release build is a window program (`windows_subsystem`); with
  no standard output of its own (GetStdHandle gives 0) `--convert` and `--headless` attach to the parent's console
  (AttachConsole), and a pipe or file it was given stays as it is; Rust's standard output looks up its handle on each
  write, so the lines after AttachConsole go to that console; a hidden WebView2 window runs its page's timers and
  answers calls; with no window Octet does not start the Octet Drawing class object (no Office object is served).
  To try on Windows, from cmd.exe and from PowerShell:
  1. `"Octet Draw.exe" --convert a.cdxml --to pdf`: the lines show in the console; `echo %ERRORLEVEL%` after
     `start /wait "" "Octet Draw.exe" --convert ...` is 0, and 1 with a bad file.
  2. The same piped and redirected: `... | more`, `... > out.txt 2> err.txt`, and `... | findstr /n .` with the
     reader ended early: no crash dialog, nothing in `%LOCALAPPDATA%\io.github.samchemman.octet-draw\logs\crash.log`.
  3. `node scripts/mcp-acceptance.mjs --headless "C:\Program Files\Octet Draw\Octet Draw.exe"`: the cases pass as
     on the Mac, with no window, no taskbar button and no tray icon at any time.
  4. With Octet open and Word open: `--headless --mcp` and `--convert` change nothing in the open Octet, and Word's
     Insert > Object > Octet Drawing still starts or uses the open Octet, never the headless one.
  5. A folder of 200 files: time a file, and memory in Task Manager (Octet and its msedgewebview2 processes).
  6. Paths with spaces and non-ASCII letters, a UNC path (`\\server\share\a.cdxml`) and a file another program
     holds open.
- `.oct` now keeps a stereocentre's ChemDraw configuration (`kept`, file.ts): without it, 15 of the 68 corpus files
  lost Geometry and BondOrdering through `.oct` and back.
- Second review (11 November): the argument is `text`, as built (18.2 said `from`; `text` is what `add_file` takes).
  `drawings new` with `text` reads the file in the page first, as File > Open reads it (`host.opens`, the same
  reading as `load`): one that does not open opens no window and the reply says why, and the reply says what Octet
  left out. With no window, run_command also closes any dialog or box to type in that a command opened all the same
  (an Actions panel action such as Add to dictionary… or a caption's box, which no name gives away), with Escape,
  and refuses it; and a hidden window answers only once the menu's commands are known (keys.ts `MENU_READ`), so
  Document Settings… is refused by its name. A reader that goes away ends `--headless --mcp` at its next line, with
  exit code 1. A second initialize on standard input makes no new session, and the one session never ends from
  idleness. With no window there is no recovery folder (no lock file). `--mcp` anywhere is the relay; any other
  `--` option is refused with a usage line and exit code 2. `--convert` opens a PDF, EMF or PNG for the drawing in
  it, as File > Open does (`open::drawing`; folder walks take PDF and EMF, not every picture), reads a picture's bytes
  with the same 64 MB bound, says "Octet does not have permission to read it." for such a file, takes `--style` as a
  journal's name through `set_brief` (ACS, Angewandte), says "There is no such file or folder." for a style file
  that is not there, and a picture of an empty drawing says Export's "There is nothing to export.".

### 18.6 As built (step 11, 11 November 2026, branch `mcp/script`)

- `docs/scripting.md` is the page; `scripts/examples` holds the client (`octet.py`, `octet.mjs`) and the four
  examples in each language. mcp.check fails when the page's table of tools is not tools/list's, when its change and
  advanced rows leave out an operation or tool, or when a file it shows is not the file in `scripts/examples`.
  headless.check runs `scripts/examples/run-all.mjs` (both languages) against the Node host on standard input and
  output (`scripts/headless/stdio.ts`), which says what the window says for a file it cannot read. It needs Python 3,
  and fails without it.
- The client is 35 lines in Python and 36 in JavaScript, not 20: a line each for the reply's error, the binary
  formats and closing. The longest example is 31 lines. Lines are at most 120 characters, so the page does not scroll
  sideways.
- Ran on the Mac only, against `--headless --mcp` from a release build: each example in both languages. Windows and
  Linux were not run, so step 11 is not done there. The page's Windows path (`%LOCALAPPDATA%\Octet Draw\octet.exe`) is
  the one platforms.yml installs to; `/usr/bin/octet` and the AppImage come from tauri.conf.json, not from an
  install. Before the page goes on the website, run the four examples in both languages on a Windows and a Linux
  install.
- Windows and Linux (branch `mcp/ci`): platforms.yml's `examples` job builds a release with no installer, copies it
  to a folder named `Octet Draw`, runs `scripts/examples/run-all.mjs` (the files made through the program, the four
  examples in both languages, a failure when either prints other lines or ends with another code than the page's, or
  the two write different files; the second scheme must save as `.oct`) and `--convert` to PDF and SVG. headless.check
  runs the same script against `scripts/headless/stdio.ts`, where the second scheme is saved as `.cdxml`. The
  office-objects job checks that the release installer puts `octet.exe` at the page's Windows path and that it answers
  initialize. Nothing installs a `.deb`, `.rpm` or AppImage, so the Linux paths
  are not checked. Not run yet when written: the job runs on push to main, or by hand.
- For an AI app that takes elicitation, the prompts say to call and give the brief only for answers the user has
  given; the prompt's own answers count (fill_experiment's notebook, journal_figure's journal). journal_figure then
  gives no column unless the user said one, and Octet's form does not ask (it asks only with no destination). If the
  column must be asked, set_brief would have to ask for only the missing parts of a destination: Sam's choice.

## 19. Speed for the AI model (Sam, 11 November 2026)

Sam: "Octet-side speed seems to be the fastest bit by a mile. Optimise for AI models. Change the way they communicate
with Octet. Build whatever it takes on the Octet side to make this really good."

### 19.1 What a job costs the model (measured)

`scripts/mcp-evals/aicost.py` reads the eval agents' logs. The 21 train cases on the five tools, agents on Opus 5.5:

| | A job, median | All 21 |
|---|---|---|
| Model turns | 10 | 239 |
| Output tokens | 3,363 | 85,267 |
| Seconds | 28 | 684 |
| Octet's own time | under 1 s | 15.7 s |

A one-reaction job is about 3,000 output tokens, and its tool arguments are about 70 of them. So the model's cost
is its turns and its thinking, not the characters it sends, except on a long route. About half the turns in that run
were the eval harness itself (printing the tools, setting the case up, writing the answer to a file).

### 19.2 What to change, in order of what it should save

1. **One call a job, and no need to look again.** Each extra call is a model turn. So: the brief can be given inside
   the first drawing call; the reply says enough to answer the user (what was drawn, how each compound was read, the
   check), and the instructions say not to read back or ask for a picture when the check is clean.
2. **Nothing to decide.** The eval agents' notes are a list of decisions the tools make them take: reagent or
   reactant, where amounts go, which field each condition is, over or under the arrow. A line notation takes them
   away: one reaction a line as a chemist types it, with the conditions as one free list that Octet sorts
   (`src/notation.ts`, in build).
3. **Say a structure once.** Compounds from earlier ones (built), a scope as one core and its variations, a compound
   from a name in Octet's dictionary with changes.
4. **Nothing refused that has one meaning** (built: section 6), and a refusal that names the nearest right form.
5. **A small first read** (built: the tool list is about 4,000 tokens).

### 19.3 How it is measured

A lab with no window (`scripts/mcp-evals/`, in build): a headless server that speaks the app's protocol, a lean
harness in which the model's turns are the job's own, speed jobs with exact checks, and a cost report (turns, tool
calls, output tokens, characters sent and read, seconds) kept and compared like `scripts/mcp-bench/results.json`.
Each change above is kept only if a small, a middle and a large model each do the jobs in fewer turns and tokens with
no fewer passes.

### 19.4 As built (part 2, 11 November 2026, branch `mcp/ai`)

What a model sees and sends was rebuilt so that a drawing job is one call and no read.

- **One way to draw: `draw` with `lines`.** `fromLines` is the hook of 5.6. Lines of schemes alone (with a `#` title, or
  more than one, or a step's label) are a route (`route`, as `draw_route` draws one): one series of numbers, a compound
  drawn in two schemes with one number, each title over its scheme, wrapped to the page, and page-fit advice. A
  step's label is its first item in round brackets, `(a)` or `(b, c)` (a single `(a)` followed by its next, `(b)`, is
  numbered operations, as before): the route then has letters on its arrows and the conditions in a note under each
  scheme (`legend: letters`, a, b, c for steps with none). A cycle, a grid, or a scheme with a grid are as before.
  `change`'s `draw` takes lines of one drawing too.
- **What is listed** (6 tools, 12,463 characters, from 13,998 with 7; what a model gets is 10,986, from 12,353):
  `draw` lists `lines`, `brief`, `structures` (the JSON, with its compound's hints: `up`, `down`, `left`, `right`,
  `rotate`, `flip`, which the eval agents called help for), `columns`, placement and the reply's arguments. `kind`
  and the JSON of a cycle and a figure are no longer listed: `draw` still takes them, `change`'s `draw` takes them in
  its open operations, and help of each says so. `draw_route` is not listed: lines draw a route, `advanced` takes it as
  JSON (`{tool: 'draw_route', args}`), and its name still calls it (`hidden` in `TOOLS`), so scripts and checks that
  call it work. `set_brief` stays listed: the refusal tells the AI app to call it (Sam's words, unchanged), and it is
  how to change the brief later or give a style file. `replace` takes the hints (it refused them), and `change` says so.
  The JSON compound's `text` says what it takes (a name, CAS number, SMILES, InChI or MOL file) and its `changes` that
  `at` is a map number given in a SMILES with its hydrogens and that `occurrence` picks the second group (170
  characters). `NOTATION` is 810 characters, bounded at 820 in `src/notation.check.ts` (610 before it said a step's
  label and a name changed): it has the room `draw_route`'s listing left, and the list stays under 14,000.
- **The brief in the first drawing call.** `draw`'s `brief` is the answers in one line (`quick`, `paper, JACS, 2
  columns`, `thesis; emphasis: the new bond`), read into set_brief's arguments (`briefOf`), or set_brief's own object.
  The answers come as the user types them: parts split at commas, semicolons and full stops, and in each part the
  destination, columns (1, 2, single, double), a size in mm and a page (A4, US Letter, 16:9) are found wherever they
  are; the words left are the journal (`a JACS paper`, `paper (JACS), 2 columns`). A part that says no or nothing
  (`no particular journal`, `Nothing to emphasise`) is left out, and `No preferred style` alone is quick. A page that is
  the destination's own (a thesis on A4) changes nothing; another is its size in mm. A line with none of these is
  refused with how to write it. It is set as set_brief sets it, first, in the same undo step, said in a line before the result (the
  room inside the margins is left out: the draw says what does not fit), and kept for the session only when the call
  succeeds. Lines given with `structures` are refused as such (give one or the other), and a route made by lines
  takes no placement (Octet places it below what is drawn), which its refusal says. A call with no brief, in a session with none, that draws more than one structure is refused with the three
  questions, word for word as before. One structure needs none.
- **The reply that ends a job** (a draw by lines; `answer` and `madeCompounds`): the sentence, then `compounds` (each
  structure made: its number, its id, its formula, and Octet's name where a name was given and Octet's name for it is
  another), `made` (the other ids: arrows, titles, notes, a cycle; no structures, plus signs or boxes), `warnings` and
  `check`. The sentence leaves out that Octet laid it out with Clean Up and that it is one undo step (every draw by lines
  is), "With no page, nothing runs off it" (as the room inside the margins), and leaves out "Octet read the names as" (the names are in compounds) and a stereocentre that keeps
  its configuration (nothing to do for it); what needs the AI app (a centre with no configuration, a compound drawn
  again) stays. A JSON draw answers as before. The 60 corpus jobs and taxol, each one draw call with the brief: every
  reply is under 1,200 characters (`src/notation.check.ts`); the longest is 1,128 (trowbridge2018-fig3a-cycle), taxol on Quick start 1,083. Taxol on a
  paper page is about 1,500: it runs past the page, and the reply names the 20 ids past it and what to do.
- **Lines over and under an arrow.** Not built as a report: a line forced over (`^`) or under (`_`) is drawn there, and
  the reply would say nothing in every job measured. Octet's own sorting is the papers' (5.6), and the instructions say
  the model need not sort.
- **Instructions** (2,162 characters, from 2,928): ask the three questions unless answered or one structure; then one
  draw call with lines, the brief in it; each compound once, later ones as changes; do not sort conditions; an amount in
  brackets after its compound; when check is clean answer the user with no read and no picture; else fix the ids in
  one change call; the hints for a picture; highlight, colour, undo; help. The prompts say the same.
- **A name changed** (`aspirin[OAc>OH]`, or `{text, changes}` in JSON with no from): Octet's reading of the name with
  the changes made. Changes by a group's label (`OAc>OH`) and named transformations that fit one place work; a change
  by an atom's number is refused ("This compound has no atom numbers"), as a name has no map numbers: give a SMILES with
  them. A SMILES that ends in a bracket atom (`CC[Pd]`) is a SMILES.
- **Measured.** The benchmark (`node scripts/mcp-bench/run.ts`): every case as before (calls, refused calls,
  characters, structures right, warnings). `taxol-lines`: 1 call, 1,780 characters sent, 1,177 read, 19 of 19 right,
  0 warnings, no read; 1,083 read after the reply lost its padding (`taxol-route`: 3 calls, 3,606 sent, 5,052 read; `taxol-v1-job`: 34, 16,042, 170,123). The 60
  corpus jobs as lines (a run of every case runs them after the rest in a process of their own, as `run.ts lines`
  does: with every other case in one process they reach the end of Indigo's stack, 17.2): 60 calls (120 with
  set_brief), 18,637 sent (32,642), 26,662 read (43,906), then 23,999 read with the padding gone, 227 of 240 right and 66
  warnings, as their JSON, no job worse. The lab, as a dry run only (the builder wrote each job after building the
  tool list, so this is no evidence of what a model does; part 2 is judged by the main session's model runs), run with
  no window and judged: the 25 typical jobs of `src/headless.check.ts`, 25 of 25 right at the first try on part 1 and
  here, 57 calls to 41, 7,469 characters sent to 3,976, 19,172 read to 14,634; the 14 speed jobs, through `call.mjs`
  against the headless server, 14 of 14 on both, 25 calls to 14, 8,524 sent to 5,389, 8,689 read to 5,991.
- **Round 2 of the notation (what models write, 5.6).** Haiku on the lab's 14 speed jobs (draw with lines, cc2647f):
  71 turns to 52 and 38 Octet calls to 22 against the seven old tools, 10 jobs passed against 8, but output tokens
  106,738 to 116,258 (thinking 83,680 to 99,487): 5 calls were refused for things with one meaning, each costing
  thousands of thinking tokens. Haiku's own calls replayed through the new reader on the headless server: 4 of the 5
  go through. say-cycle's first call draws the cycle and passes (before: 3 refusals, then a scheme that failed);
  say-five-step's first call (a lone first compound under the title) draws and passes; paper-cycle's first call draws
  a cycle (before: refused, then a scheme), which still fails on Haiku's own SMILES for 4 and its long title, as the
  centre, over two intermediates (the check names them). The one still refused is say-cycle's third try (`"triketone"
  at 1 to 2`, words for where), which a model no longer reaches. Whether thinking falls is for the main session's
  model runs. After review: the same 4 of 5 go through, and the 36 answers are still 35 right, with a scheme back to
  its start, a definition line and `trans -stilbene` read as before round 2, a lone compound under a figure's title
  taken as the start, and a name Octet cannot read named with its line on every path. NOTATION is 549 characters and
  tools/list 12,209.
- **Not done:** models on the lab (the main session runs them).


### 19.5 Model runs (main session, 11 November 2026)

How: each of the 14 speed jobs is done by a model standing in for an AI app, against the windowless lab server, three
runs a model on each version. A job passes when the drawing has what the user asked for (`judge.mjs`). Turns, tokens
and seconds come from the model's own transcript (`cost.mjs`). The lab adds two turns a job that a real app does not
have (reading its first message, giving its answer), the same on every version. One run of 14 jobs differs from the
next by one or two passes and by 10% in seconds, so one run proves nothing: compare three with three.

| Version | Model | Pass (of 14) | Turns | Octet calls | Refused | Output tokens | Seconds |
|---|---|---|---|---|---|---|---|
| Seven old tools (`f693134`), one run | Opus | 11 | 56 | 28 | 0 | 28,665 | 318 |
| Seven old tools, one run | Haiku | 8 | 71 | 38 | 3 | 106,738 | 520 |
| Lines, six tools (`80015d1`) | Opus | 14, 14, 14 | 44, 46, 45 | 16, 19, 17 | 0, 0, 0 | 26,614, 27,607, 25,701 | 314, 337, 301 |
| Lines, six tools | Haiku | 10, 12, 11 | 54, 50, 50 | 19, 18, 21 | 3, 0, 3 | 115,038, 114,485, 93,701 | 531, 525, 445 |
| Round 3 (`6482004`) | Opus | 14, 14, 14 | 44, 45, 43 | 16, 17, 15 | 1, 1, 0 | 24,496, 25,120, 23,772 | 273, 275, 264 |
| Round 3 | Haiku | 11, 11, 9 | 49, 52, 49 | 19, 19, 16 | 1, 3, 1 | 105,093, 92,981, 106,725 | 496, 438, 531 |
| Round 3b (`877a97f`) | Opus | 11, 11, 12 | 42, 49, 42 | 14, 22, 14 | 0, 1, 0 | 23,279, 29,086, 24,374 | 251, 311, 258 |
| Round 3b | Haiku | 11, 11, 11 | 55, 51, 47 | 22, 21, 19 | 4, 3, 2 | 102,450, 98,844, 85,085 | 475, 464, 395 |
| Rounds 3 to 3c and elicitation (`b290c32`) | Opus | 14, 13, 14 | 42, 43, 42 | 14, 15, 14 | 0, 0, 0 | 26,661, 23,454, 23,720 | 284, 257, 261 |
| Rounds 3 to 3c and elicitation | Haiku | 13, 12, 14 | 46, 46, 48 | 15, 17, 17 | 0, 0, 2 | 98,327, 99,249, 97,694 | 450, 460, 459 |

(The old-tools rows used an earlier wording of the lab's own prompt, so read them against the rest for calls and
passes only. Round 3's third Haiku run lost one job to a message that was not the chemist's.)

What the runs say:

- **The tool list is no longer where the time goes.** A plain job is one Octet call on every version since the lines.
  Opus spends 8 to 20 s on one, nearly all of it writing the call and the answer.
- **Round 3 took 15% off Opus's time** with no pass lost: shorter answers to the user (the instructions ask for a
  sentence or two), and no second call for labels Octet's own layout had left on each other (`say-two-schemes` 28 to
  34 s, then 18 to 19 s).
- **Haiku did not move.** About 85% of its output tokens are thinking, and its thinking is on things the instructions
  leave open. Asked to list them before its first call, it named: "a later one is a change to it" read as a rule (it
  tries to turn SMILES the user gave into changes); no example of lettered steps with two yields on one arrow, of a
  plain grid, of a cycle with numbered species, or of a route from a lone compound; a scope whose variable part is an
  amine, written out twelve times by hand. Round 3b builds these.
- **A cycle on one line is read two ways.** Haiku writes side items before their arrow (`(4), -ketol -> 1`); Octet
  read the first one that way and the rest as after their product. It then tried `edit` with `at: "4→1"`, the words
  `read` gives, and no such argument existed. Round 3b: one reading a line, the example one step a line, and `edit`
  takes `at`.
- **Models do not use changes** (`3[OBn>OTES]`) when they have the SMILES: copying is cheaper than thinking, and that
  is right.

- **Round 3b made one thing worse, and the runs caught it.** Its new route example put the second reactant among the
  conditions, and a start line `A + B` with no arrow was read as one salt, so both models lost the two three-step jobs
  in 10 of 12 tries. Round 3c put it right: 12 of 12 on the last row.
- **The last row is the best of each model**: Opus 257 to 284 s with 14 or 15 calls for 14 jobs, Haiku 12 to 14 jobs
  right where it had 10 to 12. What still fails is the model's own chemistry (a cis ring fusion left unmarked, a wrong
  iminium), which no wording of Octet's changes.
- **Elicitation is not in these numbers.** The lab's jobs carry the user's answers, so the turn it saves (the model
  asking the three questions) never happens there. Acceptance case 22 shows it works on a real build.
- **The scope's `R=` with an amine is not used yet.** Both models still write the 12 products out. It costs nothing
  to have, and the example shows it.

The `taxol-v1-job` replay reads 170,273 characters since round 3 (169,999 before). Its row moves are fixed distances
made up from this plan's notes, with no recording behind them to make again, so the kept number was changed to
170,273 (Sam left the choice open, 11 November). Calls, warnings and structures right are the same.

### 19.6 As built (round 3b, 11 November 2026, branch `mcp/ai3`)

What Haiku's transcripts showed still cost it thinking, calls and passes.

- **Instructions:** "Write each compound as the name or SMILES you have (copy the user's); only with neither, as a
  change to an earlier one (3[OBn>OTES]), which keeps stereocentres." Haiku had read "write each compound once ... a
  later one is a change to it" as a rule and said sorry for full SMILES. 2,157 characters from 2,160: "{R} in a SMILES"
  is "{R} ({L}[Pd]{L})" and "Octet places each as papers do" goes (Do not sort says it). The highlight line still
  names a group, and a metal ligand is still a metal ligand.
- **NOTATION's examples** (764 characters from 549, 18 lines from 11; tools/list 12,428 from 12,206): a route from a
  lone numbered compound, a second scheme from it by its number with lettered parts and a yield each on one arrow, a
  scope with `R=morpholin-4-yl`, a grid with numbers and yields, and a cycle one step a line with numbered species,
  each step's name and +in/-out on its own line and the last back to 1. One line says that `|` splits a row and a new
  line is a new row, and that `(a), (b) and then` are kept as written. The examples are numbered 2 to 6 with no gap. The
  36 replayed answers still score 35.
- **Side items before an arrow.** A chain line with conditions between its first compound and its first arrow puts
  each step's before its arrow: `... (4), -ketol -> 1` puts the ketol on 4→1. A yield stays with the product it
  follows (`B (2), 90% -> C` is 90% of B). A line with nothing there reads as before.
- **A cycle's side text and step names can be moved:** `edit` takes `at` (the step as read gives it, `4→1`) on side
  text and step names, and `side` (in, out) on side text. The text leaves its side arrow (which goes when it has no
  other end) for one on the new step, as the Side arrow tool puts it. Where the new step has that text already, the two
  join in one (`ketol, triketone`), as draw writes two at one step, so there is no second side arrow on the first. A
  moved text that lies on an intermediate goes out from the circle as draw puts it (`clearSides`).
- **No page, no page advice:** a figure drawn with no page (Quick start) says nothing about a page.
- **Labels after a draw:** Clean Up cleared the labels of Opus's triol 5 (paper-five-step), and turning it back by 29
  degrees put them on each other again. A structure whose labels meet once turned back now lies as Clean Up left it.
- **A scope's R=** takes a label (OMe), a SMILES joined by its first atom, a substituent name joined where its lithium
  compound has the lithium (`morpholin-4-yl`, `morpholino`, `cyclopropyl`, `methyl`), and a compound name joined at its
  one N–H (`4-phenylpiperidine`). A SMILES with ring digits is read as SMILES first (`N1CCOCC1` had read as the label
  NCCOCC, a chain, and `C1CC1` as propyl). Two N–H (`piperazine`) and a word Octet cannot join (`cyclopropy`) are
  refused with their line. A short label Octet does not know (L, Nu, Ar') and a compound name with no N–H (dppf, a
  ligand) stay labels. Only a scope by lines does this: a label in JSON and `{Allyl}` in a SMILES stay labels.

### 19.7 As built (round 3c, 11 November 2026, branch `mcp/ai3`)

Round 3b lost the second starting material of the lab's two three-step jobs: Opus and Haiku failed them in 10 of 12
tries ("compound 11a is drawn", "an arrow from 11a to 12a"), where round 3 passed 6 of 6.

- **A start line with a +.** Compounds joined by ` + ` on a line with no arrow, when the next line starts with an
  arrow, are that scheme's starting materials, each with its own number, as `A + B -> C` has them. Haiku's
  `piribedil + but-3-en-1-yl tosylate (11a)` had read as one compound 11a (C27H32N4O5S). A lone compound, a grid row,
  a scope, a + line with no arrow after it, and a salt (one SMILES with a dot, or one name) read as before.
- **A compound among the conditions.** One with a compound number (`(12a), Cc1ccc(cc1)S(=O)(=O)OCCC=C (11a)`, or the
  name) is the scheme's: at the first step a starting material beside the first with a +, at a later step a structure
  over the arrow, as an added reactant is; it is listed in the reply's compounds. A number is told from an amount as a
  compound's own is ((1.5 equiv), (5 mol%) and (4M) stay conditions). Only a reagent takes a number this way, and only
  one no compound has yet that is no amount in units: `NaH (2eq)`, `H2 (1atm)`, `rt (16h)`, `CH2Cl2 (16h)` and
  `Pd2(dba)3 (2)` after product 2 stay conditions. A SMILES with no number and a double or triple bond or an aromatic
  ring closed is drawn over its arrow, never as its text; a formula or an abbreviation that looks like a SMILES (NBS,
  SOCl2, Boc2O, Cs2CO3, [Zn](SO2CF3)2) stays text.
- **Left for Sam.** A SMILES with no number and no `=`, `#` or aromatic ring (CCO, C1CCCCC1, CC(C)O) still shows as
  text over its arrow: NBS, CO and PCC are valid SMILES too, so Octet cannot tell these from an abbreviation.
- **NOTATION's route** starts `4-bromoanisole (2) + PhB(OH)2` and then `-> 4-methoxybiphenyl (3), Pd(PPh3)4 ...`:
  the second reactant is a starting material (models had copied it into the conditions). 765
  characters; tools/list 12,429. The 36 replayed answers still score 35.

### 19.8 As built (round 4, 11 November 2026, branch `mcp/ai4`)

What the model spends: its turns and its thinking. A job given as names (paper-*) cost 2 to 6 times the same job as
SMILES, because the model worked out every SMILES itself.

- **draw, change and read load at once.** Claude Code defers every MCP tool until the model searches for it (a turn
  before the first call) unless the tool's tools/list entry has `_meta: {"anthropic/alwaysLoad": true}`. These three
  have it (`ALWAYS_LOADED`); drawings, advanced and set_brief do not. mcp.rs passes the page's tools/list through
  unchanged, and gives none while Octet is closed.
- **Instructions in 2,048 characters** (2,046 from 2,157; for an AI app that takes elicitation 1,867 from 1,944):
  Claude Code before 2.1.296 cut them at 2,048 and lost the help line. The same instructions, in fewer words.
- **A scope from the user's names.** paper-scope as one scope (the shared part once, R= each amine as the user named
  it, 7l whole in the grid, two rows of six) draws the twelve structures its check wants. For that: a group's name can
  be past 40 characters (labels take 300, as text does), but a label that stays a label is refused past 40, the most
  the CDXML reader keeps; a `(cis)` or `(trans)` before a scope compound's number stays with its group
  (`R=3-azabicyclo[3.1.0]hexane (cis) (7e)`), and other words in brackets there are dropped as before (`R=Me (S)`); a name with `(cis)` or `(trans)` after it reads as with it
  before (Name to Structure too); two N–H that are the same (piperazine) join at either. A group that cannot join (two
  N–H that differ, a word Octet cannot read) leaves out that compound only, with its line and "give it as a SMILES";
  the rest is drawn, as a name Octet cannot read is.
- **NOTATION** shows `R=morpholine (5b)` and says "R= takes a label, SMILES or name (an amine joins at its NH)" (at N since round 5): 788
  characters from 765. tools/list 12,566 from 12,429 (111 of it the three `_meta`). The 36 replayed answers still score
  35.
- **Names for whole compounds:** no words added. paper-three-step gives names and Opus kept them; paper-five-step
  describes each compound as a change to the one before, which instruction 3 already covers. Whether the scope change
  moves the models is for the main session's runs.

### 19.9 As built (round 5, 11 November 2026, branch `mcp/ai4`)

paper-five-step tells each later compound in words ("both OH groups become TBS ethers", "the secondary TBS ether comes
off", "reduces the lactone"). In all six runs both models wrote five whole SMILES by hand (Opus 4,008 output tokens,
Haiku 13,929 and wrong stereo in some runs). Tried against the code before this round: steps 3, 4 and 5 could be
written only with `occurrence` (1st OTBS was the tertiary one, by atom order, which a model cannot see) or map
numbers, and the acetonide 6 only with two map numbers.

- **Which of a group, as the user says it.** A swap's group (and a label as `at` of set or remove) can start with
  `both` or `all` (every one; `both` is for two, and the reply says `Changed both OH to OTBS.`) and a class for the carbon
  that carries it: `1°`, `2°`, `3°`, also `prim`, `sec`, `tert` and `p-`, `s-`, `t-`. A name that is a label whole
  (`t-Bu`) is that label. One place in `compound.ts` (`each`) reads it for every caller: lines and JSON alike.
- **Refused, never guessed:** a group there more than once with nothing to pick by is refused with its classes in words
  (`OTBS is on a secondary carbon and a tertiary carbon: write 2° OTBS or 3° OTBS for one, or both OTBS.`); a class that is not
  there says the classes that are; places of one class keep the occurrence advice and add `both`.
- **A kind of place for a named transformation:** `at` as a word names the places of that kind (`reduce lactone`,
  `reduce ketone`, `reduce ester`, `hydrolyse ester`, `deprotect acetonide`). A lactone is now called one in a refusal (it was "the ester").
- **The route in words:** `2[both OH>OTBS; CO2Et>CH2OH]`, `3[2° OTBS>OH; CH2OH>CH2OTBDPS; OH>OBn]`,
  `4[reduce lactone; OTBS>OH]` and `6[CH2OH>CHO]` from 2's SMILES with no numbers give the job's six InChIKeys
  (compound.check). The bench's taxol route with steps 3, 4, 5, 16 and 17 so written gives every compound too.
- **Not built:** the acetonide 6 from two named OH. 5 has a 1,2-diol and a 1,3-diol on the tertiary carbon, so
  `protect acetonide 3° OH` has two readings, and naming "the CH2OH on the same carbon" needs more than this reader.
  6 is a SMILES, or `protect acetonide 4-20` with map numbers.
- **The corpus:** none of the 88 reactant-to-product steps in `lines.json` is one such change (searched by trying
  each class, both and all swap among 30 labels, and reduce or hydrolyse by kind).
- **Words:** instruction 3 says "only with neither, write what a step does as a change (3[2° OTBS>OH]): it keeps
  stereocentres." (the given name or SMILES still comes first, round 3b), and "Colour only what is asked" stays:
  instructions 2,044 from 2,046. NOTATION's change line shows `both OH>OBn, 2° OTBS>OH, 7:OTBS`: the plain swap
  (`OBn>OTES`, the class form without a class), remove (`7:H`) and add (`7+OH`) left it for room. 784 characters from
  788 (the scope line says "an amine joins at N"); tools/list 12,562 from 12,566. The 36 replayed answers still score
  35.
- **After review:** the classes are for an sp3 carbon only: a group on an aryl or other sp2 carbon has none (a phenol
  is not 2°), and `p-`, `s-`, `t-` are classes only where the group is on an sp3 carbon (`p-OMe` on an arene is the
  OMe). `primary`, `secondary` and `tertiary` in full are classes too. A refusal says each class once with how many
  (`OH is on two secondary carbons and a tertiary carbon`), counts with a class in words (`there are two 2° OH`,
  `Changed both 2° OH to OBn.`), and `both` or `all` with `occurrence` is refused. A kind of place is a site's own
  field (aldehyde, ketone, acid, ester, lactone, acetonide, carbonate, acetal, epoxide; a CO2Et label is an ester), in
  any letters, passed to the one place that picks a site; with none of that kind the refusal names the kinds there
  (`reduce fits no aldehyde in this compound, only a ketone and an ester.`).

### 19.10 As built (what the real Claude Code runs showed, 12 November 2026, branch `mcp/ai4`)

The lab ran the 14 speed jobs through the Claude Code command line on 6da8b80, three runs each on Opus and Haiku.
Loading draw, change and read at once saved a turn a job and stays. Each point below is its own commit, so the main
session can keep or drop each by what the lab says next.

- **Every tool loads at once.** A restyle or a help call still cost a tool search (say-restyle: 5 turns on Opus, where
  a job that draws is 2). All six tools have `_meta: {"anthropic/alwaysLoad": true}`: tools/list 12,854 from 12,740 (12,853 after
  the next point's NOTATION).
- **Round 5's words go back.** Told to write a step the user describes as a change (`3[2° OTBS>OH]`), Opus did so in
  paper-five-step, was refused in two runs of three (`reduce 3`, `5[acetonide 9-13]: acetonide is not a
  transformation`), and its clean run cost more than SMILES had (31.1 s and 3,382 tokens against 26.9 s and 2,915).
  Instruction 3 and NOTATION's change line are as on `release-1.2-mcp` again (`only with neither, as a change to an
  earlier one (3[OBn>OTES])`; `OBn>OTES, 7:OTBS, 7:H, 7+OH (7: map [C:7]), 5=6, reduce 9`). The reader stays (both,
  all, the classes, the kinds and their refusals): a model or a script that writes them is read. Instructions 2,040
  from 2,044; NOTATION 783 from 784.
- **Lines as a JSON array.** Haiku wrote draw's lines as an array of lines inside the text, about 12 calls in three
  runs and never before (`'["# Substrate scope 7", "CCCC(...) (7a) 51% | ..."]'`), and was told line 1 was longer than
  300 characters or could not be read as a structure. Lines that are a JSON array of strings, as a list or as text that
  parses as one, are those lines one under the other (`linesOf` in `notation.ts`, called once where the lines arrive:
  draw's route and change's draw operation, before `fromLines`, so a refusal counts the array's lines). The reply says nothing:
  it is the same drawing. The schema stays text: a model that gives a list is read, and none is told to.
- **An empty argument a tool does not take is left out.** draw `{operations: '[]', lines}` was told "The lines make
  operations is not an argument of this tool". `coerce` now leaves out an argument an object does not take whose value
  asks for nothing (null, `''`, `'[]'`, `'{}'`, `[]`, `{}`), with "Left out operations, which is empty." (plan 6: one
  meaning, said). One with something in it is refused as the call's own (`arguments: operations is not an argument of
  this tool`), not as the lines'. The existing check of `change {operations, steps: []}` gives `steps: [{}]` now.
- **advanced and help as models call them.** Haiku's say-restyle had 11 refused calls in one job, and help with
  `detail: 'full'` was refused 5 times. advanced's route now reads: `detail` with help is left out ("Left out detail:
  help has none."); what help is about is `args.of`, `of`, or the one other text (`{tool: 'help', command:
  'set_style'}`, `{tool: 'help', brief: 'set_style'}`), and `{command: 'help set_style'}` with no tool is help of
  set_style ("Read command as help of set_style."); a tool's own arguments beside `tool` are its args ("Read style as an
  argument of set_style in args."); `{tool: 'set_brief', ...}` goes through set_brief's own route. help of grid,
  scope, lines, scheme, route or notation gives NOTATION (`call: 'draw with lines'`). set_style's `preset` takes a
  preset as set_brief reads a journal (`Angewandte Chemie` is Wiley (Angewandte)), under `style`, `name`, `value` or
  `journal` too: two options any argument can take in `coerce` (`reads`, a value in words; `names`, other names for
  the argument), so change's set_style reads them the same way, said in one line ("Read style Angewandte Chemie as
  preset Wiley (Angewandte)."). After review: `tool` is read in any letters (`Help`); `of` beside tool is said ("Read
  of as args.of."); the move into args is said only for an argument the tool takes by that name; and any other argument
  stays where it was given and is refused as before (`{tool: 'help', command: 'set_style', foo: 'x'}`: "command is not
  an argument of this tool"). tools/list is unchanged (neither is published).
  Changed checks: `{tool: 'export', format: 'pdf'}` (refused before) gives an unknown argument (`colour`) beside it;
  `set_style {journal: 'Nature'}` (refused before) gives `font`; help with `detail` (refused before) gives `picture`.
- **replace in a catalytic cycle.** real-r4-opus-1 paper-cycle replaced intermediates 2 and 4 (E/Z it had worked out
  from read's InChI) and the job's check "the four intermediates in order" failed though the reply said `changed: c5`
  and check clean. Replayed through `scripts/headless/host.ts`, the cycle read `[s1, null, s3, null]`: `erase` leaves an
  empty node where a structure was, and replace never filled it. Now `replaceStructure` puts the new structure in each
  node (and side arrow end) that was the old one, so it keeps its place, number and side texts. Replayed again, the
  cycle is `[s1, s5, s3, s6]` and all four InChIKeys are the job's (2 OWBIRFRDSASUHN-OKHBPPCESA-N, 4
  LCJXXGHDFMYFGG-CRVSIBDBSA-N): the run would have passed. change's replace with the ids of one structure and no
  structure (real-r4-haiku-3 say-fix: "structure is missing") is that structure ("Read ids as structure.").
- **Two lines forms Haiku wrote.** (a) Conditions on a line of their own under the arrow's line (real-r4-haiku-3
  say-one-step: `... (2), 99% ee\nL-proline (20 mol%), CHCl3, rt`) were read as a compound and refused with "put a
  space after the comma before  CHCl3", which had one: the check for a comma with no space took any comma. A list
  (split at a comma with a space, or a semicolon) on the line right under an arrow's line, with no arrow, no `|` or ` + `, and no
  compound number in it, can only be more conditions for that arrow, and is read so ("Line 2: Octet read it as more
  conditions for the arrow on line 1."). Not after a blank line, in a scope, or before a line that starts with an arrow
  (a start line, round 3c, or a lone compound): a compound with a comma and a space in it is refused there with "is a
  list, not a compound: put conditions after the product on its arrow's line", and anywhere else with "is a list, not a
  compound: put each compound between | or on a line of its own" (`aspirin, caffeine`). (b) The number before the
  structure (real-r4-haiku-2 say-three-step: `piribedil + 11a (Cc1ccc(cc1)S(=O)(=O)OCCC=C) -> 12a (...)`) was "no
  compound 11a earlier in this call or in the drawing". In `read` (`mcp.ts`), where every compound's number is matched
  against the call and the drawing, a number that is neither, with a name or SMILES in brackets after it, is that
  compound with that number; one that is a compound already keeps the bracket as its caption, as before. A short
  SMILES in the brackets (`11a (CCO)`), which the notation reads as a new number, is read the same way when it is no
  compound number itself and `11a` is no compound. The reply says so: "Read 11a (CCO) as compound 11a."
- **The reply says each compound's stereo.** In both rounds both models tried RDKit in the shell on their own SMILES
  (Opus: "Check CIP labels with RDKit"), and round 4's sentence moved Opus to read `{ids, detail: 'full'}`, work the E/Z
  out of the InChI and replace two structures (paper-cycle: 3 and 2 calls where base had 1). Now a draw's and a
  change's compounds, and read's summary (`stereo`, also in a full read), give each compound's descriptors after the
  formula, as Show Stereochemistry works them out (`stereoLabels`: R, S, r, s, E, Z, M, P in atom order) and with how
  many centres a wedged structure leaves undefined (`stereoFacts`, which Indigo reads only for a structure with a
  wedge; for Sam: a structure with no wedge, `CC(O)CC`, is not said to have an undefined centre, as reading it cost an
  Indigo call for each such compound of every draw, 3.5% more Octet ms on the corpus lines jobs measured turn about,
  past noise. Left out until Sam decides): `2 s2 C15H21NO4 (Z,S)`, `3 C7H16O (S; 1 undefined centre)`. No locants: Octet has none cheaply. Nothing for a
  compound with neither. One function, `stereoOf`, beside the formula in `madeCompounds` and `summary`; both chem.ts
  functions keep what they work out by structure, and the layout check has already read the drawing's stereo.
  draw's description: "the reply gives each formula and stereo (R, S, E, Z): do not test a name or SMILES with other
  tools first"; read's: "structures (id, number, caption, formula, stereo)". tools/list 12,885 from 12,853. change's
  replace from text gives the new structure's formula and stereo too ("Replaced 70 with C4H8 (Z), which keeps its
  number 70."), as Opus replaced structures to set their E/Z: taxol-v1-job read 176,619 from 176,579. Changed check:
  replace of 1 with toluene says "Replaced 1 with C7H8, which keeps its number 1 and its caption."
- **Measured** (benchmark turn about with the commit before, two runs each, best of each): Octet ms over all 147 cases
  27,133 then 27,331 (+0.7%, noise); taxol-lines 1,908 then 1,903, taxol-route 1,913 then 1,891, taxol-v1-job 3,826
  then 3,824. Read characters rise only for compounds with stereo: taxol-lines 950 to 1,254, taxol-route 4,989 to
  5,570, paper-cycle 293 to 330, say-two-schemes 302 to 408, and 35 corpus lines jobs by 4 to 110; summaries likewise
  (taxol-route 2,443 to 3,024, under 5,000). results.json holds the new counts, tools/list and instructions; its times
  are the ones it had. notation.check's longest reply of a job in one call goes to under 1,300 characters from 1,200
  (the taxol route is 1,254). The 36 replayed answers still score 35.
- **Counts by commit.** results.json was written once, in the stereo commit: the commits before it fail the benchmark
  on tools/list alone. A session that drops a commit runs `node scripts/mcp-bench/run.ts --write` for the counts and
  keeps the times that results.json had: alwaysLoad moves tools/list (12,854), the notation's line moves it by one
  (12,853) and the instructions (2,040), and the stereo commit the rest.

### 19.11 As built (round 6, 12 November 2026, branch `mcp/ai6`)

What the real Claude Code runs of round 5 (`real-r5-*`) showed still costs turns. Each point is its own commit.

- **What no line begins with.** In about one call in eight Haiku wrote stray characters before its first line, and
  three forms were still refused: a lone `"` before the `# ` title (and one after the last line: "Line 1: a \" has no
  closing \"", haiku-2 paper-scope, haiku-3 say-two-schemes), `*/` before it (read as a structure, haiku-1 and haiku-2
  say-three-step) and a comma on a line of its own (haiku-2 paper-five-step). `linesOf` in `notation.ts`, where draw's
  and change's lines arrive, takes off what cannot begin a line before the first title or compound: a quote mark with
  no partner on its line, `*/`, `/*`, a comma, a code fence, a bracket left from an array that did not parse, and blank
  lines; and at the very end a lone closing quote, a fence or a bracket on a line of its own. The reply says nothing.
  A line in quotes with its partner (`"x" as written`), a SMILES in brackets (`[Na+].[Cl-]`) and a `//` comment are as
  given. The 36 replayed answers still score 35.
