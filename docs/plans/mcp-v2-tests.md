# Octet Draw MCP v2: what to test (10 November 2026)

Companion to `docs/plans/mcp-v2.md`. Sam's point: taxol was one job he picked at random. The MCP must be tested
against everything a chemist, a student, a teacher or a lab can ask an AI app to do in Octet, against every AI app
that connects, and against the ways an AI gets things wrong. This is the ideal list. Section 12 says what is required
before 1.2 ships and what can wait.

## 0. What exists today (keep all of it)

| Layer | What | Where |
|---|---|---|
| Unit | Protocol, argument checks, every tool against a stand-in host with real Indigo | `src/mcp.check.ts` (1,025 lines), part of `npm test` (122 check files) |
| Headless | Octet with no window; draws inputs in parallel in tenths of a second | `scripts/headless/` |
| Acceptance | 10 jobs end to end against a real dev build (`OCTET_MCP=1`) | `scripts/mcp-acceptance.mjs` |
| Evals | 30 cases run by Claude through the Messages API: 20 train, 10 held out. Schemes (10), pictures (5), fix and read (6), experiment pages (3), cycles (2), grids (2), restyle | `scripts/mcp-evals/` |
| CI | Acceptance case 18 on Linux and Windows | `.github/workflows/platforms.yml` |
| Benchmark | Taxol inputs | `scripts/mcp-bench/taxol/` |

Gaps: almost every case is small (1 to 3 steps). None is a long synthesis or comes from a real paper. None tests the
brief, other journals, other AI apps, bad input, very large drawings, or what users think of the result.

## 1. The questions every test answers

Each test records these, so results compare across cases and versions:

1. **Right chemistry:** every structure matches its expected InChIKey (full key with stereo, or first block when stereo
   is not the point); conditions and yields on the right arrow; numbers right and unique.
2. **Right look:** check clean; nothing off the page (unless Quick start); text at the destination's own sizes; rows
   balanced; titles where asked; the user's emphasis shown.
3. **Right questions:** the brief asked before drawing; the destination's advice given when it does not fit.
4. **Cost:** tool calls, failed calls, coercions, characters the AI sent, bytes the AI read, tokens in and out, wall
   time split into the AI's time and Octet's.
5. **Safety:** the user's drawing never lost; one undo step a call; nothing outside the session's drawing touched.

## 2. The jobs (what users ask for)

The test set is a matrix: **jobs** (this section) × **sources** (section 3) × **destinations** (section 4) × **AI apps**
(section 7). Not every cell, but every row and column covered.

### 2.1 Schemes and syntheses

| ID | Job | Why it matters |
|---|---|---|
| S1 | One reaction, named compounds ("esterify acetic acid with ethanol") | The everyday job. Must be fast and need no fixing |
| S2 | 3 to 5 linear steps | The common scheme; wrapping starts here |
| S3 | Long linear synthesis, 15 to 30 steps (natural product) | Taxol-like: compound chaining, page fit, splitting into schemes |
| S4 | **Convergent** synthesis: two branches that meet (fragment coupling) | Layout of branches; numbering across them |
| S5 | Divergent: one intermediate to several products (an SAR series, a library) | One-to-many layout |
| S6 | Several schemes in one figure with titles ("Scheme 1. ...") | Titles as free text; numbering across schemes |
| S7 | Retrosynthesis (retro arrows, disconnections marked) | Different arrow and reading direction |
| S8 | Steps with conditions as letters and a footnote (as papers do) | Short arrows, legend layout |
| S9 | One-pot and telescoped steps ("then", "1. ... 2. ...") | Several lines over one arrow |
| S10 | Equilibria, resonance, "no reaction" arrows | Arrow kinds |
| S11 | Reactions with by-products, reagents drawn as structures over the arrow | Structures as conditions |
| S12 | Mechanism: curly arrows, lone pairs, charges, intermediates in brackets, transition states (‡) | Electron-pushing is a core chemistry drawing and the hardest to place |
| S13 | Catalytic cycle (cross-coupling, organocatalysis, enzyme) | `draw` with kind `cycle`; side arrows in and out |
| S14 | Two cycles that share a species (dual catalysis, photoredox + nickel) | Not supported today. Test that the AI is told so, not that it fakes it |
| S15 | Biosynthesis or metabolic pathway (enzymes over arrows, branches) | Long, branched, with biochemistry names |
| S16 | Polymerisation (repeat units, brackets with n) | Brackets and polymers |
| S17 | Peptide and oligonucleotide synthesis (Sequence tool, protecting groups) | 1.1.1's Sequence tool through the MCP |
| S18 | Organometallic and coordination chemistry (complexes, η-bonds, ferrocene) | Metals, multi-centre bonds, geometry hints |
| S19 | Inorganic and solid-state formulas, salts, ions | Formulas as text, charges |
| S20 | Reaction with stereochemical outcome to show (dr, ee, wedges, enhanced stereo &1 / or1) | Stereo correctness |

### 2.2 Structures and figures

| ID | Job |
|---|---|
| F1 | A grid of structures with numbers and captions (an SI table, a compound library) |
| F2 | A figure of panels (a, b, c) with titles and citations |
| F3 | A visual abstract or graphical TOC (structures, arrows, short text, colour) |
| F4 | A substrate scope table (one core, R groups varied, yields under each) |
| F5 | Highlighting: a group, a bond, a ring; colour by the user's choice; "show which bond forms" |
| F6 | Large single molecules: macrocycles, a cyclic peptide, vancomycin, a dendrimer, a protein fragment |
| F7 | 3D-ish drawings: chairs, Newman and Fischer projections, perspective |
| F8 | Atom numbering, NMR assignments next to atoms, spectra panels |
| F9 | Labels and abbreviations: Ph, OTBS, Boc, R groups, Markush (R1 = ...) |
| F10 | Lab pictures: glassware set-ups from the template library |

### 2.3 Work on an existing drawing

| ID | Job |
|---|---|
| E1 | "What is wrong with my drawing?" (valence, charges, stereo, a reaction that does not balance) |
| E2 | Fix one thing the user names, change nothing else |
| E3 | Restyle for a journal ("make this ready for JACS") and report what did not fit |
| E4 | Add a step to an existing scheme, in its style, without moving the rest |
| E5 | Renumber compounds across a document |
| E6 | Tidy a messy drawing made by hand (Clean Up, align) without changing chemistry |
| E7 | Read the drawing and answer questions (names, formulas, masses, SMILES, "how many stereocentres") |
| E8 | Fill in an experiment page from a procedure (amounts, equivalents, yield) |
| E9 | Export for a purpose (PDF for Word, CDXML for a colleague, PNG for slides) |
| E10 | Undo what the AI did (one step, Octet's Undo) |

## 3. Where the job comes from (sources)

The same scheme is a different job when it arrives as words, a picture or a file. Test each source:

| ID | Source | What can go wrong |
|---|---|---|
| Q1 | A sentence from the user ("draw a Suzuki coupling") | The AI fills gaps with guesses; must ask or say what it assumed |
| Q2 | An experimental procedure (paragraph with amounts) | Reagents vs solvents vs workup; amounts to the experiment page |
| Q3 | A paper as a PDF with text | Long route; compound numbers from the paper kept |
| Q4 | **A scanned PDF with no text layer** (the taxol paper was this) | The AI must read pictures; damaged files (the taxol attachment arrived broken) |
| Q5 | A picture of a scheme (screenshot, photo of a whiteboard or notebook) | Redrawing; stereo from wedges in a blurry picture |
| Q6 | A hand sketch | Ambiguity; must ask, not guess |
| Q7 | A ChemDraw file (CDXML or CDX) to redraw, extend or restyle | Keep the user's style and objects |
| Q8 | SMILES, InChI, MOL or SDF lists | Exact structures; many at once |
| Q9 | A name the dictionary does not know (new compound, typo, trade name, code name like "BMS-986020") | Must say it cannot read it, never invent a structure |
| Q10 | A reaction database export (RXN, RDF, Reaxys) | Conditions and roles |
| Q11 | A follow-up in the same chat ("now make step 3 bigger", "use OTES not OTBS") | Session memory; the brief kept |
| Q12 | Non-English requests (German, Chinese, Spanish) | Prof. Schramm is in Germany; answers in the user's language, chemistry names still right |

## 4. Destinations (the brief, question 2)

Every job kind runs against several destinations. The test checks the style, the sizes and the advice:

| ID | Destination | Checks |
|---|---|---|
| D1 | No preference | Quick start (ACS 1996, no page). Never a journal on its own (Sam) |
| D2 | JACS / ACS one column (ACS1, 3.25 in) and two columns (ACS2, 7 in) | Sizes from the preset; fit advice for a long scheme |
| D3 | RSC, Wiley (Angewandte), Nature, Science, Thieme and every other preset in `PRESETS` | Each preset's own sizes, never smaller to make it fit |
| D4 | Thesis (A4, page by page) | Splitting across pages |
| D5 | Slides (16:9, scale 2) and a poster (A0, scale 3) | Larger sizes; few steps a slide |
| D6 | Lab notebook / experiment page | The experiment page and reagent table |
| D7 | "My own style" from a file the user sends | Every style value read from the file (bond length, line, bold, fonts, sizes); compare with the file's own |
| D8 | A size given in mm ("must fit 8 cm wide") | Fit or say it cannot |
| D9 | A destination Octet has no preset for ("Org. Lett.", "my university's template") | Says so, offers the nearest, asks |

## 5. The brief itself

| ID | Test |
|---|---|
| B1 | A drawing tool called with no brief is refused with the three questions, word for word |
| B2 | Tools that only read or edit work with no brief |
| B3 | "No preference" gives Quick start |
| B4 | The brief is kept for the whole session and not shared with another session (two AI apps at once) |
| B5 | A new session starts with no brief |
| B6 | Changing the brief mid-session restyles in one undo step and says what changed |
| B7 | Elicitation: a client that supports it gets a form; "decline" and "cancel" leave no brief; a client that does not support it gets the refusal |
| B8 | Style from a file: CDXML from ChemDraw 26, a `.oct`, a CDXML with no style, a broken file (refused with the reason) |
| B9 | Fit advice: a scheme that fits (no advice), one that does not (advice with choices), Quick start (no advice) |
| B10 | Emphasis carried out: "highlight the new C–C bond", "colour the protecting groups", "follow Fig. 2 of the paper" |
| B11 | The AI follows the instructions and asks before its first draw (count how often the refusal is hit; target: almost never) |
| B12 | A single structure with no brief ("draw caffeine") draws at once in the drawing's style, with no questions |

## 6. Chemistry correctness (the part that must never be wrong)

These run headless, thousands at a time, with no AI in the loop. Each compares InChIKeys.

| ID | Test |
|---|---|
| C1 | **Compound chaining (`from` + `changes`):** every change kind on a corpus of real routes; the result's InChIKey equals the expected one |
| C2 | **Stereo kept:** a change away from a stereocentre never changes its CIP label (R/S, E/Z), checked on every centre |
| C3 | **Stereo warned:** a change that touches a centre warns; one that would invert it says so |
| C4 | Map numbers survive every change, are never drawn, never exported (CDXML, MOL, SMILES all clean) |
| C5 | Named transformations (phase 2): each on 20+ substrates, including ones with two matching sites (must refuse and name them) and none (must refuse) |
| C6 | Labels: every abbreviation in `abbreviations.json` and `GROUPS` expands to the right structure in formula and InChI (OTBDPS, OTPS, OTES, Boc...) |
| C7 | Names to structures: the names an AI typically sends (common, IUPAC, trade, abbreviations) against a corpus with known InChIKeys |
| C8 | Round trip: MCP draws → `read` with format CDXML → ChemDraw 26 opens it the same (Sam's Mac) → back into Octet unchanged |
| C9 | Numbers: unique, kept across schemes, a repeated compound has one number |
| C10 | Conditions: reagent vs catalyst vs solvent on the right side of the arrow; formula and molar mass of each read correctly |
| C11 | Stoichiometry on experiment pages: masses, moles, equivalents and yield worked out right from every unit form |
| C12 | Garbage in: invalid SMILES, impossible valence, wrong stereo in the request → warned, never silently "fixed" |

### 6.1 The corpus

Build it once, keep it in `scripts/mcp-bench/`, add to it with every bug:

- **Routes from the literature (by kind, not by famous name):** 5 long linear (natural products), 5 convergent, 5
  medicinal chemistry (SAR series, scale-up route), 3 process chemistry, 3 peptide or nucleotide, 3 organometallic,
  3 polymer, 3 biosynthesis. Each with every compound's expected InChIKey. Prefer open-access papers (licence for test
  data) or write the routes ourselves from public structures.
- **Taxol stays** as one of the long linear cases. It is useful because it was hard (20 compounds, many protecting
  groups, a scanned PDF), not because it is special.
- **Teaching set:** first-year reactions (SN1/SN2, E1/E2, aldol, Grignard, Diels–Alder, Fischer) with mechanisms.
- **Users' real drawings** (with permission): the 6 November cage visual abstract, Prof. Schramm's files, the scheme
  that crashed Sam's friend's 1.1.1 (ask for it).
- **Adversarial set:** section 9.

## 7. AI apps and models

The MCP is used by more than Claude Desktop. Each app sends arguments its own way.

| ID | Client | Why |
|---|---|---|
| A1 | Claude Desktop (the `.mcpb` install), Mac and Windows | Main target; elicitation support to check |
| A2 | Claude Code (CLI) | Developers; different context handling |
| A3 | Other MCP clients: ChatGPT (where it supports MCP), Cursor, VS Code Copilot, Cline, Gemini CLI | Different argument styles; no elicitation in some |
| A4 | Models: a large model, a fast cheap one, and an older one | A small model shows where the tools are unclear. A good MCP works for all of them |
| A5 | Effort and context: long chats where `tools/list` competes for context | The 4,000-token target |

Record, per client: setup time from zero, whether elicitation works, failed calls per job, and a transcript.

## 8. Layout and look

Automatic checks on every drawing the other tests make, plus a human review sample.

| ID | Test |
|---|---|
| L1 | Check clean: no overlaps, nothing on a bond, no labels touching |
| L2 | Nothing past the page edge except in Quick start |
| L3 | Text sizes exactly the destination's (never shrunk to fit) |
| L4 | Rows balanced; arrows a sensible length; conditions centred on their arrow |
| L5 | Orientation kept along a scheme (a ring stays the same way round from compound to compound) |
| L6 | Titles above their scheme, never attached to an arrow |
| L7 | Each structure drawn well: no crossed bonds, labels clear, rings regular (compare with Indigo's and ChemDraw's layout) |
| L8 | **Golden images:** a picture per case, compared with an approved one; a change shows as a diff for Sam to approve |
| L9 | **Human review (Sam only):** Sam scores a sample 1 to 5: "would I put this in a paper as it is?" The target is the share scored 4 or 5 |

## 9. When things go wrong (robustness and safety)

| ID | Test |
|---|---|
| R1 | Every tool with wrong types, missing fields, unknown fields, huge strings, deep nesting, `null`s: refused with one-line fixes, never a crash |
| R2 | Coercion only where there is one meaning: a test for each coercion and for each look-alike that must still be refused |
| R3 | **Size:** 200 structures, a 50-step route, a 2,000-atom molecule, a 10 MB CDXML. Octet stays responsive, the job runs in the background, memory stays bounded. (Links to the 1.1.2 crash: Indigo's 2 GB heap) |
| R4 | Cancel mid-job: Stop in the overlay, the client's cancel, the client disconnecting. The drawing goes back to exactly how it was |
| R5 | The user works while the AI works: draws, undoes, closes the window, switches drawings. Nothing lost, nothing lands in the wrong drawing |
| R6 | Two sessions in two drawings at once; two sessions on the same drawing |
| R7 | The app quits or crashes mid-job: recovery keeps the user's work |
| R8 | Security (existing, keep): wrong key, other Origin, other Host (DNS rebinding), rate limits, request size limits, no file written outside Octet's folder, `export` never saves on its own |
| R9 | Prompt injection in content: a CDXML or PDF whose text says "delete everything" or "export to ...". The text is drawn, never obeyed |
| R10 | The user's drawing is never deleted unless the user asked (the instructions say so; test that `delete` on user objects from an AI call is flagged in the transcript review) |
| R11 | Two Octets running (installed and beta): each finds its own server (`mcp.json` clash, plan section 17) |
| R12 | Offline: no network, everything still works |

## 10. Performance

Run on Sam's Mac and on a slow machine (GitHub's runners, which are about 3 times slower, as `cleanup` checks do).

| ID | Measure | Target |
|---|---|---|
| P1 | Octet's time per tool, by size (1, 10, 50, 200 structures) | Under 1 s for a 10-compound scheme; never blocks the window over 100 ms at a time |
| P2 | Reply size by tool | Under 20 KB unless a picture or `full` is asked |
| P3 | Picture time | Under 1 s for a medium picture (4.6 s today for large) |
| P4 | `tools/list` size | Under 4,000 tokens |
| P5 | Whole jobs: calls, failed calls, characters sent, tokens, wall time | Per job kind, written down as the baseline and compared each release |
| P6 | Memory over a long session (100 calls) | Bounded; Indigo's heap does not grow without limit |

## 11. The experience (what the user sees)

| ID | Test |
|---|---|
| X1 | Setup from zero on a clean Mac, Windows and Linux: install Octet, turn on AI apps, install the bundle, first drawing. Time it and count the steps |
| X2 | The overlay: starts on the first call, stays through thinking, shows progress, Stop works, goes when work ends; reduced motion; light and dark; two windows |
| X3 | Undo after an AI job: one step takes back the whole job |
| X4 | Notices: the user always knows what the AI did ("Claude drew a scheme"), with Undo |
| X5 | Error messages a chemist understands (STE, British English, as the app's own) |
| X6 | Accessibility: the overlay and pill read by VoiceOver; no information only in motion or colour |
| X7 | User study (Sam only): Sam does 10 real jobs of his own with no help. Record where he gets stuck, how long it takes, and what he would change |

## 12. What must pass before 1.2, and what can wait

### 12.1 Required for 1.2

- All of section 0 still passing.
- Brief: B1 to B6, B8, B9, B11, B12 (B7 elicitation if built).
- Chemistry: C1 to C4, C6, C9, C10, C12 on the corpus (6.1), headless, in `npm test` or a nightly run.
- Jobs, as eval cases (train and held), each in at least two destinations: S1, S2, S3, S4, S6, S12, S13, S18, S20, F1,
  F4, F5, E1, E2, E3, E4, E8. At least 3 long routes (S3 or S4) from different kinds of chemistry, not only taxol.
- Sources: Q1, Q2, Q3, Q4, Q5, Q7, Q9, Q11.
- Clients: A1, A2, and one non-Anthropic client (A3). Models: A4 with at least a large and a small model.
- Layout: L1 to L6 automatic on every case; L9: Sam scores 30 drawings, at least 80% scored 4 or 5.
- Robustness: R1 to R6, R8, R9, R11.
- Performance: P1 to P6 with numbers written down.
- Experience: X1 on Mac and Windows, X2, X3, X4.

### 12.2 After 1.2

S14 (dual cycles), S15 to S17 in depth, F6 to F10, C5 (named transformations), C8 on every case, Q6, Q10, Q12, A3
(all clients), L8 (golden images), R7, R10, R12, X6, X7.

## 13. How to build the test system

1. **One case format** for evals, acceptance and benchmark: prompt, source files, destination answers (the brief the
   simulated user gives), expected InChIKeys, expected layout facts, and limits (calls, failed calls, bytes).
2. **A simulated user** for the brief: the eval runner answers Octet's three questions from the case, so evals run
   without a person. Also a case where the simulated user says "no preference".
3. **Headless first:** chemistry and layout tests use `scripts/headless/` (tenths of a second each), so thousands run
   on every commit. Only the eval and experience layers need the app or an AI.
4. **Cost control:** evals cost API money. Run the train set on each MCP change, the held set before a release, the
   full matrix nightly or weekly. Record tokens per case so cost is visible.
5. **One report** per run, as `run.mjs` writes today, plus the section 1 measures and a comparison with the last
   release. A drop in any measure fails the run (CLAUDE.md: no step backwards).
6. **Transcripts kept** for every eval case, so a human reads why a case failed, not only that it did.

## 14. Sam's answers (10 November 2026), and what is still to ask

The building session asks Sam for the open items at the start (`mcp-v2.md`, **Start here**).

- **A single structure needs no brief.** B1 applies to schemes, routes, figures, cycles and grids. B12 tests that
  "draw caffeine" with no brief draws it at once.
- **Test data:** Sam will provide open-access papers. Ask for them at the start. Record each paper's licence with its
  case.
- **Scoring and user studies: Sam only.** L9 is 30 drawings scored by Sam. X7 is Sam doing real jobs himself, with his
  notes written down. No other people take part.
- **Eval budget:** up to 100% of one weekly Ultra usage limit, about US$5,000 of API credit, for the whole v2
  programme. Record tokens and cost per case (section 13, item 4). Plan the matrix to fit it, and report the spend.
- **The 1.1.1 crash scheme:** Sam will provide it. Ask for it at the start. It is a case for R3 and P6.
- **Still to ask:** which non-Anthropic AI app to test (A3), and how Sam wants eval spending reported.

## 15. Scripting (#89) and the command line (#91)

For `mcp-v2.md` section 18 (decided 11 November 2026: build it as written there).

| ID | Test |
|---|---|
| K1 | `--headless --mcp` with no Octet open: every acceptance case that needs no dialog passes over standard input and output |
| K2 | No window, no Dock icon and no port while it runs; it ends when its input ends, and when its starter dies |
| K3 | `read { file }` in each export format gives the same bytes as Export with the same options (PDF, SVG, PNG, EMF, and each text format) |
| K4 | `--convert` on the 68 CDXML round-trip files to `.oct` and back: nothing lost. To PDF, SVG, PNG: each opens, at the width and resolution asked |
| K5 | `--convert` on a folder of 200 files: one line a file, the count at the end, memory bounded (P6), time a file written down |
| K6 | Bad input: a file that is not a drawing, a 10 MB file, a file with no read permission, a folder that does not exist. Each is named with its reason, the rest are converted, the exit code is 1 |
| K7 | Nothing written over without `--overwrite`; nothing written outside `--out` or beside the inputs |
| K8 | `--to sdf --each`: every compound of every drawing, with its number as a data field |
| K9 | Windows release build: output shows in the console it was started from, and the exit code reaches the shell |
| K10 | The four examples on the scripting page run as written, in Python and in JavaScript, on Mac, Windows and Linux |
| K11 | An AI app still cannot read or write a file: no v2 tool takes a path (a check on the tool schemas) |
