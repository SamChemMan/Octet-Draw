# Example drawings (issue #94)

Branch `item/94-examples`, from `release-1.2-mcp` at b30f413, rebased on release-1.1.3 at f06d1b4 (Friday
20 November, with the AI features off). Planned 17 November 2026. Issue #94 asks for finished drawings a user can open, look at and take apart. Sam replied on 9 November
that 1.2 adds example drawings. This plan covers the example drawings. More tutorials are cut (see the end).

## What the branch has today

- Home shows three starter drawings in the Recent section, titled Examples, only while there are no recent and no
  recovered drawings: `src/Home.tsx` lines 873 to 884 (the tiles) and 966 (the title). A click or the tile's
  right-click Open calls `onStarter(text)` (lines 202, 217, 783).
- The three starters are Oseltamivir (a structure), Suzuki coupling (a reaction) and Suzuki cycle (a catalytic cycle):
  `src/starters.ts` lines 1 to 15, files in `src/starters/` (Octet drawing JSON and an SVG picture each, 36 KB).
  The JSON is imported with `?raw` at the top of the module, so all three are in the main bundle and parsed at start.
  The files carry no `style`, so they open in the user's new-drawing style (a user whose default template is Poster
  gets them at 300 %).
- `src/Editor.tsx` line 11079 opens a starter as a new drawing: `inNew({ text })` when another drawing is open,
  else `keepWork(() => load(undefined, text))`. The copy has no name (Untitled) and no file.
- `src/starters.check.ts` checks that the three open and that their pictures are plain SVG. `src/beside.check.ts`
  line 62 and `src/homedemo.ts` lines 4 to 7 read the same files.
- Help has Tutorial, Keyboard Shortcuts and Report a Problem: `src-tauri/src/main.rs` lines 1150 to 1156. File has
  no example item: lines 737 to 765. There is one tutorial, `src/Coach.tsx`.
- The MCP's `drawings new` opens a new drawing for a purpose, or a file's text: `src/mcp.ts` lines 543 to 547, 729
  and 2032 to 2060. It has no way to open an example.
- `src/keys.ts` lines 203 and 210: on Home only the listed commands and the `new_` and `recent_` prefixes run.

## What is missing

1. The four drawings the issue names that Octet does not have: a reaction scheme with conditions over the arrows and
   numbered compounds, a mechanism with curved arrows, lone pairs and formal charges, a stereochemistry example with
   assigned centres, a filled-in experiment page, a multi-step synthesis, a photochemistry figure and a poster-sized
   figure. Seven in all.
2. A way to reach the examples at any time. Today they go once the user has one recent drawing.
3. Lazy loading. The starters load with the main bundle.
4. A name on an opened example, and its own style.
5. MCP parity: an AI app cannot open an example.

## ChemDraw cross-check

ChemDraw 22.2 and 26.1 behaviour, from Sam's notes (17 November 2026):

- ChemDraw 22.2's File menu: Open…, Open Templates, Open Samples, ChemDraw Cloud, Open Recent, in that order.
- File > Open Samples > lists 36 sample documents by name. The samples are ordinary documents in ChemDraw's data
  folder, about 14 on chemistry, the rest biology, two of them cheat sheets. 26.1 added the macOS cheat sheets. Help
  has Contents, Getting Started, Tutorials, Hotkeys Cheat Sheet and Shortcuts Cheat Sheet. 22.2 is the same.
- A cheat sheet opens from File > Open Samples and also from Help. A help page sends the reader to a sample by its
  File > Open Samples path.
- The help has seven written tutorials (drawing, rings, Fischer, perspective, Newman, stereochemistry, templates).
- Octet never copies ChemDraw's sample files, templates or text.

Every option ChemDraw gives this feature:

| ChemDraw | What it does | Octet after this item |
| --- | --- | --- |
| File > Open Samples > (a submenu, one item a sample) | opens that sample document | File > Open Example > (one item an example), between Open… and Open Recent |
| Help > Hotkeys Cheat Sheet, Shortcuts Cheat Sheet | open two samples from Help | not copied: Octet's shortcut list is in Settings and the Command Palette |
| Help > Tutorials | seven written tutorials | Help > Tutorial (one, interactive); more tutorials cut |
| Palette, Object, Curves, Colour and Text menus, context menu, dialogs | nothing for samples | nothing |
| CDXML attributes | none: a sample is an ordinary document | none: an example is an ordinary Octet drawing |

Not known from the notes: whether ChemDraw opens the bundled file itself or a copy, and what Save does then. Octet
opens a copy (decision D2). Octet's examples are its own drawings on its own topics. None of ChemDraw's sample names,
topics or content is used.

## Jobs, and what done means

J1. **Seven new example drawings**, drawn by Octet's own engine from recipes (lists of MCP tool calls) with
`scripts/gallery/make.ts`. Done when: each file exists in `src/examples/`; `make.ts` run twice gives the same bytes;
each opens with no Octet warning; each structure's InChIKey matches the list pinned in the check (worked out from
SMILES written by hand, so a change in Name to Structure cannot change a compound unseen); the style is ACS Document
1996 (Paper), the Experiment page, or ACS at 300 % on A0 (Poster); no object has a colour of its own unless this
plan names it; all text is ours.

J2. **A picture for each example**, made from the drawing by the app's own `pictureOf`, with
`scripts/gallery/pictures.mjs` (WebKit, as `npm run look` drives it). Done when: each picture is a plain SVG (no
script, foreignObject or href, as `starters.check.ts` asks), at most 200 KB, and the whole `src/examples/` folder is at
most 800 KB.

J3. **One list, loaded lazily.** `src/examples/examples.json` lists each example (id, name, kind). `src/examples.ts`
gives the browser the list, a loader for each drawing (a separate chunk, fetched on first open) and each picture's
URL. The three starters move into the list and the folder; `src/starters.ts` goes. Done when: `vite build` puts each
drawing in its own chunk and the main chunk is smaller than at b30f413; no example file is fetched when Octet starts
(WebKit network log); a picture is fetched only when its tile shows.

J4. **One way to open.** `openExample(id)` in `Editor.tsx` is the only path, for every entry point. It opens a copy:
an unsaved drawing named after the example (window title "Ester hydrolysis"), in the example's own style, with no
changes (closing it at once asks nothing), not on the Recent list until saved. Save asks where, with the example's
name as the file name. It follows the rules `onStarter` follows today: a new window when this one holds work, else
`keepWork` (asks about unsaved changes; a template being edited stays). A second request for the same example within
800 ms is ignored (a double-click or a held key opens one). A loader that fails gives the notice "Octet cannot open
this example." and changes nothing.

J5. **Home.** With no recent drawings, the section titled Examples shows every example (today: three). With recent
drawings, an Examples button beside Experiments and Open… opens the examples in Home's place, as Experiments opens its
list: Home to go back, Escape too, arrow keys between tiles, Return opens. Each tile has the existing right-click menu
with Open. Done when: `npm run look` reaches the page and every control matches; dark mode keeps the pictures on white
paper as the starter tiles do; keyboard and screen reader names work (tile name "Ester hydrolysis, Mechanism").

J6. **Menu.** File > Open Example > lists the examples by name, on the Mac, Windows and Linux. Each item is a menu
command `example_<id>`, so the Command Palette finds it and Settings > Shortcuts lists it with no default key. The
commands run on Home (`keys.ts`). The Rust menu reads the same `examples.json` at build time (`include_str!`). Done
when: a Rust test reads the list and builds the items; `keys.check.ts` covers Home.

J7. **MCP.** `drawings new` takes `example` (one of the ids; the names read too). Done when: a check opens each id, a
wrong id is refused with the list of names, `example` with `text` is refused, `for` with `example` is left out with a
note, and two sessions each get their own window.

J8. **Checks.** `src/examples.check.ts` (from this list, written before the code), additions to `keys.check.ts` and
`mcp.check.ts`, the Rust test, `npm test`, `cargo test` (own target dir), `npm run look`, the ChemDraw 22.2 round trip
and the Octet 1.1.2 read (stress list).

J9. **What's New lines** returned to the session, not written into `src/releases.ts`.

## Rules every part keeps

- Real chemistry, correct to the literature, with no invented data: no yields or ee values in the schemes; the
  experiment page's amounts and yield are a worked classroom example and are consistent with each other (Octet works
  them out).
- ACS Document 1996 by the book for Paper drawings. Text is Arial 10 pt there; the Poster is ACS at 300 %.
- Drawn from scratch by Octet. Only Octet's own templates (the Photochemistry set, `tools/library/photochem.mjs`). No
  third-party or ChemDraw content, no clip art.
- Show, not tell: tiles carry a name and a kind, no descriptions. Short plain labels in British English and STE.
- Every options menu is `src/Menu.tsx`; the Home page reuses Home's own tile, section, back button and `home-open`
  button. No new layout. Values from `brand/tokens.css`.
- No new dependency. No default shortcut.
- Security: an id from the menu, Home or the MCP selects from the fixed list; no path is built from it. The drawing
  text still goes through `file.ts` `parse`, with its bounds, as any file does. Pictures show as `<img>`, never inline.
- No speed regression: nothing on a hot path changes; start-up loads less.
- MCP changes stay small and local (another session reviews `mcp.ts`).

## Design decisions

D1. **File > Open Example, between Open… and Open Recent.** ChemDraw puts Open Samples in File, after Open… and before
Open Recent. One place only: the same ids twice in one native menu would register the commands twice. On the Mac, the Help menu's search
finds the items in File.

D2. **An example opens as a copy with its name.** The shipped file is part of the app bundle and is never written.
The copy has no path, so Save asks where. It is not marked edited until the user changes it. Today `load()` with a
title marks a drawing edited (`setFile({ saved: EMPTY, name })`, `Editor.tsx` line 2067), so `openExample` sets the
name after a plain load.

D3. **Octet drawing JSON, not `.oct`.** The examples ship as the JSON a `.oct` holds (format `octet`, version 1), as
the starters do. It is a third of the size of a `.oct` (no CDXML, no base64), and `parse` reads it with the same
checks. What the user saves is a normal `.oct` or `.cdxml`.

D4. **Each example carries its style.** The starters get the Quick start style (ACS Document 1996, no page) written
in, so the user's default template no longer changes how they open.

D5. **Recipes, not hand edits.** Each example is a recipe of MCP calls in `scripts/gallery/<id>.json`, drawn by the
headless engine (`scripts/headless/host.ts`) and written with `serialize`. A recipe can be read, changed and drawn
again after the 1.2 merges. A feature the Node host lacks is done with the recipe's own `edit` call (for example
`lone_pairs`, since `run_command pairs` cannot run there; probe below), never by hand in the JSON.

D6. **Pictures from the app.** `pictureOf` needs the canvas. A dev-only hook (`import.meta.env.DEV`, removed from the
build) lets `scripts/gallery/pictures.mjs` ask the page for each example's picture after it opens it from the
Examples page. `main.tsx` already loads `lookwatch` in this way.

D7. **Home shows every example when Recent is empty, and has an Examples button otherwise.** It reuses the
Experiments pattern (a button beside Open… that opens a list in Home's place). The ten tiles wrap into two rows on a
first launch. Sam can ask for fewer there; the Examples page stays.

D8. **MCP: `drawings new` with `example`.** Opening a drawing is `drawings`' job (as `for` opens File > New For), so
`run_command` does not list the `example_` commands, as it does not list `new_`. The new window takes `{ example: id }`
as its start (the Rust side passes the start through as JSON, `windows.rs` line 187), so the drawing text does not
cross the IPC. With no windows (the Node host) it is refused, as `text` is.

D9. **One list for TypeScript, Rust and checks.** `src/examples/examples.json`. Node checks cannot run
`import.meta.glob`, so the browser loaders live in `src/examples.ts` and the checks read the list and files directly.

## The examples

Order on Home and in the menu, simplest first. Ids are menu command ids (`example_<id>`) and MCP values.

| Id | Name | Kind | Template | Content |
| --- | --- | --- | --- | --- |
| oseltamivir | Oseltamivir | Structure | Quick start | today's starter |
| suzuki | Suzuki coupling | Reaction | Quick start | today's starter |
| epoxidation | Sharpless epoxidation | Reaction scheme | Paper | benzaldehyde (1) + triethyl phosphonoacetate (2) → ethyl (E)-cinnamate (3), NaH, THF, 0 °C to rt; → (E)-cinnamyl alcohol (4), DIBAL-H (2.2 equiv), CH2Cl2, −78 °C; → (2S,3S)-3-phenylglycidol (5), Ti(OiPr)4 (5 mol%), (+)-DET (6 mol%), TBHP, 4 Å MS, CH2Cl2, −20 °C |
| hydrolysis | Ester hydrolysis | Mechanism | Paper | B<sub>Ac</sub>2 hydrolysis of methyl acetate: HO⁻ adds to C=O (⇌), the tetrahedral intermediate expels MeO⁻ (⇌), MeO⁻ takes the acid's proton (→). Curved arrows from lone pairs and bonds, lone pairs on every O, formal charges |
| threonine | Threonine stereoisomers | Stereochemistry | Paper | L-threonine (2S,3R), D-threonine (2R,3S), L-allo-threonine (2S,3S), D-allo-threonine (2R,3R), wedges, R/S shown, double-headed arrows marked enantiomers and diastereomers |
| cycle | Suzuki cycle | Catalytic cycle | Quick start | today's starter |
| ibuprofen | Ibuprofen routes | Synthesis | Paper | two schemes with titles. Boots: isobutylbenzene → 4′-isobutylacetophenone (AcCl, AlCl3) → glycidic ester (ClCH2CO2Et, NaOEt) → 2-(4-isobutylphenyl)propanal (H3O⁺, heat) → oxime (NH2OH) → nitrile (Ac2O) → ibuprofen (H3O⁺). BHC: isobutylbenzene → 4′-isobutylacetophenone (Ac2O, HF) → 1-(4-isobutylphenyl)ethanol (H2, Raney Ni) → ibuprofen (CO, Pd catalyst). A compound in both keeps its number |
| photooxygenation | Photo-oxygenation | Photochemistry | Paper | Octet's Jablonski diagram template; Sens → ¹Sens* → ³Sens* (ISC), ³Sens* + ³O2 → Sens + ¹O2; α-terpinene (1) + ¹O2 → ascaridole (2), hν, O2, rose bengal, MeOH |
| aspirin | Aspirin | Experiment | Experiment | salicylic acid 2.00 g (limiting), acetic anhydride 5.0 mL (1.08 g/mL), 85 % H3PO4 (5 drops), 85 °C, 15 min, aspirin 2.08 g measured; every detail field filled; no risk assessment page (cut) |
| lactams | β-Lactam antibiotics | Poster | Poster | a title and panels: penicillins (benzylpenicillin, amoxicillin), a cephalosporin (cefalexin), a carbapenem (meropenem), a monobactam (aztreonam), an inhibitor (clavulanic acid), each β-lactam ring with one ring fill |

## Probes run while planning (17 November, headless engine at b30f413)

- The epoxidation scheme draws in 0.3 s: five structures, numbers 1 to 5, conditions above and below each arrow,
  (E), (E) and (S,S) read back, no warnings. "(2S,3S)-3-phenylglycidol" is not read as a name; the IUPAC name is.
- The poster figure draws in 0.4 s on A0 with all six antibiotics and their stereocentres, no warnings.
- The mechanism's lines draw. `run_command pairs` fails in the Node host ("Octet cannot run pairs now"), so the recipe
  uses `edit` with `lone_pairs`. A bond id is two atom numbers of that structure; read them before the arrows.
- The aspirin page draws and fills, with 40 warnings that the structures and the risk assessment run past the bottom
  edge. Risk R1: find whether the Node host checks page 1 alone, before this example is drawn. The example must open
  in the app with no warning.

## Siblings for the consistency pillar

Entry points, each going through `openExample` and each tested:

- a Home tile in the empty Recent section (click, Return, right-click Open);
- a tile on the Examples page (the same);
- File > Open Example > (on Home and over a drawing);
- the Command Palette;
- a shortcut the user sets in Settings > Shortcuts;
- MCP `drawings new` with `example`;
- with Settings > General > Windows on and off; from Home's window, a drawing window and an object window (Word).

What a user does to an opened example, each tested on every example, because each must behave as a drawing made by
hand: Select All (⌘A takes every object kind on the page), hold to select, colour (every object takes it), undo and
redo, copy and paste within and between windows, duplicate, flip and rotate, align, delete, Clean Up Structure and
Clean Up Reaction, Save, Export, round trips through `.oct`, CDXML and CDX, dark mode.

## MCP surface

- `drawings` (action `new`) and the `new` operation take `example`: an enum of the ids, with the names (lower case,
  without the β) read as the id. The description gains one sentence: "example: a copy of one of Octet's example
  drawings, in its own style."
- `newDrawing` in `mcp.ts`: with `example`, `host.newWindow(purpose, session, undefined, example)`; the reply names the
  example and the window. `Host.newWindow` gains one optional argument; the Editor host sends `{ example: id }` to
  `open_window`; `scripts/headless/host.ts` refuses as for text.
- Refusals: an unknown id ("Octet has no example …: <the names>"), `example` with `text` ("Give example or text."),
  wrong type or too long (the schema's own messages). `for` with `example`: left out, with a note.
- `drawings list` and the `octet://drawings` resource show the window by the example's name.

## Files and formats touched

| Format | What changes | Check |
| --- | --- | --- |
| Shipped drawing (`src/examples/<id>.json`) | new: Octet drawing JSON, version 1, app 1.2.0 | `parse` reads it; atom, bond, text, arrow, shape and grid counts as recorded |
| Shipped picture (`src/examples/<id>.svg`) | new | plain SVG, size budget |
| `.oct` (a saved copy) | nothing new | `writeOct` then `readOct` gives the same `serialize` text |
| CDXML | nothing new | `toCdxml` then `fromCdxml`: same InChIKeys, charges, stereo, text, arrows and conditions |
| CDX | nothing new | `writeCdx` then `readCdx`: the same |
| SDF, RXN, MOL, SMILES, InChI | nothing new | one SDF record a structure with the pinned InChIKey; RXN for each scheme step |
| Clipboard | nothing new | copy all, paste in a new window: same counts (WebKit) |
| PDF, PNG, SVG export | nothing new | the poster (A0) exports at 300 dpi within Export's own limits, no stop |
| ChemDraw 22.2 | opens our CDXML | round trip (stress S16) |
| Octet 1.1.2 | opens a saved copy | v1.1.2's `parse` and `readOct` on each saved copy (stress S17) |

Octet 1.1.2 and a saved copy: 1.1.2 reads the `.oct`'s JSON, keeps what it knows and ignores keys it does not know
(to confirm per example in S17). The examples use only objects that 1.1.2 has (structures, arrows, text, shapes,
cycles, reagent grids, templates), so it is expected to draw them the same.

## Stress list

| # | Case | Expected |
| --- | --- | --- |
| S1 | Double-click an example tile, or hold a shortcut set for an example | one drawing opens |
| S2 | Open the same example twice, change the first copy, open it a third time | each copy is the example as shipped; the bundle never changes |
| S3 | Windows off, a drawing with unsaved changes, open an example | the Unsaved dialog; Cancel keeps the drawing as it was |
| S4 | Open an example while a template is being edited | the notice "Save or cancel the template first.", as File > Open gives |
| S5 | Open an example, close it at once | no Save question; after one change, the question |
| S6 | Open, Save, then reopen from Recent | Save asks where with the example's name; the saved file is on Recent; an experiment page joins Experiments only now |
| S7 | Undo just after opening; then 50 mixed edits, undo all, redo all | nothing to undo at first; undo all gives the example as opened, redo all the last state |
| S8 | ⌘A then Delete then Undo, on each example | every object is selected and deleted; Undo puts back exactly the same drawing |
| S9 | Delete an arrow with conditions, a numbered structure, a cycle intermediate, the aspirin reaction's arrow | the conditions, number and table go or stay as they do in a drawing made by hand; Undo restores all |
| S10 | Flip the threonine example horizontally, then again | R and S swap on the first flip and come back on the second; the drawing is as before |
| S11 | Rotate the epoxidation scheme 90° and 180° | conditions stay on their arrows and read upright; numbers follow their structures |
| S12 | Copy all of the poster, paste it into a window holding 40 paclitaxels | same counts; the paste takes no longer than pasting the same drawing from a file |
| S13 | Every example in dark mode, at 6 % and at the largest zoom | light ink on the dark canvas (no object is black of its own); tiles stay on white paper; no stop, no blank frame |
| S14 | Open each example while a 500-residue peptide is open (windows off, after Save) | the example opens; the open time is within noise of the same file through File > Open |
| S15 | Select All on the aspirin page, colour red, undo | every kind takes the colour (structures, arrows, text, grid); undo restores |
| S16 | Each example saved as CDXML, opened in ChemDraw 22.2 and saved by it, then opened in Octet | ChemDraw opens it; Octet reads ChemDraw's file back with the same InChIKeys and text; any loss written down |
| S17 | Each example saved as `.oct` by this branch, read by v1.1.2's `parse`/`readOct` | no error; the same atoms and bonds; anything 1.1.2 leaves out written down |
| S18 | MCP: `example` unknown, a number, 500 characters, `../../etc/passwd`, empty, upper case name | refused with the names, or read as the id for a name; no file is read |
| S19 | MCP: `example` with `text`; `example` with `for: poster` | refused; opened in its own style with a note |
| S20 | Two AI sessions call `drawings new` with the same example at once, then each edits | two windows, each its own copy; each edit is one undo step in its own window |
| S21 | One AI session opens an example, a second uses that window and edits | both edits go to that drawing; the shipped example is unchanged |
| S22 | The example's chunk cannot load (dev server stopped) | the notice "Octet cannot open this example."; Home and the drawing stay as they were |
| S23 | A damaged example text (empty, `{`, a 1e9 coordinate) through the loader | `parse` refuses it with its own message; nothing changes |
| S24 | The user's default template is Poster, then open Oseltamivir | it opens in ACS Document 1996 at 100 % |
| S25 | Open every example in turn ten times in one window | memory after is within noise of after the first round |
| S26 | Start-up of Octet with the examples, cold, medians of interleaved runs against b30f413 | Home ready no later beyond noise; main chunk smaller |
| S27 | File > Open Example from an object window (Word) | a new window opens; the Word object's drawing is unchanged |
| S28 | Examples page: Escape, Home, arrow keys, ⌘A, Delete, a drag onto a folder | Escape and Home go back; ⌘A and Delete do nothing to examples; an example cannot go in a folder |

## Acceptance list

| Job or case | Check | Pass |
| --- | --- | --- |
| J1, S8, S9, S10, S11, S15, S23, S24 | `node src/examples.check.ts` | each example: parse, no warnings (`problems`), pinned InChIKeys, style, no own black, select-all delete and undo, flip twice, rotate, colour all, the dependants on delete, damaged texts refused |
| J1 | `node scripts/gallery/make.ts --check` | the committed drawings are what the recipes draw (run after each 1.2 merge; not part of `npm test`) |
| J2 | `node scripts/gallery/pictures.mjs` and `examples.check.ts` | pictures made from the app; plain SVG; size budget |
| J3, S26 | `vite build` size before and after; WebKit network log | each drawing a chunk; main chunk smaller; no example fetched at start |
| J4, S1 to S7, S22, S25, S27 | WebKit on the dev server (port 1468), and the shell where the rule needs windows | as the table says |
| J5, S28, S13 | `npm run look -- http://localhost:1468/` with the Examples page added to `scripts/look/sweep.js`; dark mode by the same | every control matches; no console errors |
| J6 | `cargo test` (target `cargo-g94`) and `node src/keys.check.ts` | the menu lists the examples; the commands run on Home |
| J7, S18 to S21 | `node src/mcp.check.ts` | as the table says |
| S12, S14 | timing in WebKit, medians of interleaved runs against b30f413, rerun alone on a fail | within noise |
| S16 | ChemDraw 22.2, with the lock | as the table says |
| S17 | `git archive v1.1.2 src` into the scratchpad, its `parse` and `readOct` on each saved copy | as the table says |
| J8 | `npm test` | every check passes |

## Cut from scope

- More tutorials. Coach is one fixed sequence; a second tutorial needs its own design and steps. Not to Octet's
  standard by Friday beside seven drawings.
- A Help > Examples item (D1).
- The risk assessment page on the aspirin example. Its hazards come from PubChem on the user's computer; Octet does
  not ship safety data it has not checked.
- Prof. Schramm's photochemistry and chemiluminescence set. His drawings are welcome as a contribution after 1.2, under
  Apache-2.0.
- A chemiluminescence example.
- `drawings new` with `example` in the Node headless host (refused, as `text` is).
- Dark-mode pictures for the tiles. Tiles keep white paper, as the starter tiles do.

## What's New (draft, for the session to place)

For 1.1.3 (the AI features are off, so the MCP's `example` is not in it):

- To open an example drawing, choose File > Open Example and then the example. Octet opens a copy with the name of the
  example. The example in Octet does not change.
- When you have no recent drawings, Home shows all the example drawings in Examples.
- To see the example drawings when Home shows your recent drawings, click Examples beside Open….
- To find an example in the Command Palette, type the name of the example.
- After you open a drawing, Undo does not remove it or show the drawing that was there before.

For 1.2: when an AI app opens a new drawing with an example, Octet opens a copy of that example in a new window, in the
style of the example.

## Build notes (17 November 2026)

What the build changed from the plan, and why:

- J7: an unknown example is refused with the schema's own message, as every enum is ("example: not one of
  oseltamivir, suzuki, …"): the ids are what an AI app gives back. `for` with `example` is left out and the reply says
  so ("Octet left out for poster: an example opens in its own style."); with no `for`, the reply does not say it was
  read as quick.
- J1: the headless host runs the Actions panel's Ring fill as the editor does (rings wholly picked, else those with a
  picked atom), so the poster's β-lactam rings are drawn by the recipe and an AI app's edit with ring_fill works in
  Octet with no window too.
- J1, aspirin: the recipe places the scheme under the page's Reaction scheme heading. On a new experiment page the
  MCP's origin() counts the page's own rule (an arrow) as drawn work, so a draw with no place lands under Procedure.
  Left for the MCP session (src/mcp.ts origin): not part of this item.
- J1, mechanism: lone pairs only on the three oxygens that push electrons (HO⁻, the tetrahedral O⁻, MeO⁻); lone
  pairs on every oxygen crowded the labels and hid the short arrows. Hydroxide is drawn H–O⁻ so its pairs clear the
  charge.
- J1, photo-oxygenation: ascaridole is drawn from coordinates (Name to Structure lays the peroxide bridge over the
  ring's double bond), kept the way round α-terpinene lies; hν in the conditions is italic, as IUPAC sets it.
- J8: the MCP's edit takes no cycle id, so an AI app cannot colour or turn a catalytic cycle's arcs, which the window
  can. examples.check.ts leaves cycle ids out of its colour and turn steps. Left for the MCP session.
- S10: Flip Horizontal is ChemDraw's Rotate 180° and keeps R and S; Flip as a mirror swaps them. The check covers both.
- J6: the Word item's place in File moved from 7 to 8, so it keeps its place by Insert….
- S16, ChemDraw 22.2 round trip: nine of the ten come back with the same compounds and text, except that one-word
  chemical conditions (NaH, TBHP, Ac2O, CO, NH2OH, MeOH, Pd(PPh3)4, and the Jablonski diagram's ISC) come back from
  ChemDraw as structures, and ChemDraw does not keep Octet's reagent table. These are Octet's CDXML for any drawing,
  not the examples'. The poster (A0 at 300 %) did not open in ChemDraw 22.2, and after it ChemDraw answered no open
  request (a dialog is up that only Sam can close).
- S17: Octet 1.1.2's readOct reads every saved copy with the same atoms, bonds, text, arrows, cycles, tables and fills.
- J3: the main chunk is 9,014 bytes smaller (3,541,679 to 3,532,665); each drawing is a chunk of its own; no example
  is fetched at start. Start-up to Home in WebKit, medians of seven interleaved runs: 221 ms at b30f413, 222 ms here.
- S1, S5, S22 in the browser on the dev server: a double request opens the example once; an opened example is not
  edited until a change; with the server stopped, an example not yet fetched gives "Octet cannot open this example."
  and the drawing stays. The native File > Open Example menu was not opened: driving the app's menus needs screen
  control this item does not have; cargo test reads the list for it, and keys.check runs its commands on Home.

## Finishing pass (19 November 2026, for 1.1.3)

Rebased on bd7c684, then on release-1.1.3 at f06d1b4 (the AI features off). Every stress and review finding was gone
through:

- The Command Palette lists each example as "Open <name> example" (group Examples). A name that began with the
  example's ("Aspirin…") would score 90 for "aspirin" and come before Draw aspirin; this one scores below 70, so Draw
  aspirin stays first.
- Undo after opening: `load()` starts a fresh undo history for every drawing it opens (File > Open, Open Recent, a
  recovered drawing, an example, a new window's start, a dropped file). Undo could take an opened drawing back to the
  blank one before it, or, with Settings > General > Windows off, show the previous drawing under the opened file's
  name, so Save wrote it over that file (in 1.1.2 too). Revert to Saved keeps its steps, as its dialog says ("Undo
  brings your changes back").
- Held key: the 800 ms is counted from the last request, not the last one taken, so a held key opens one copy. The
  last request is kept in localStorage too, which Octet's windows share, so the repeats that go to the new window the
  first one opened are ignored there as well. A request that fails can be made again at once. Of two examples asked
  for close together, the one asked for last opens (the earlier one's text is dropped when it arrives).
- File > Open Example is between Open… and Open Recent, where ChemDraw 22.2 has Open Samples.
- The examples carry `"app": "1.1.3"` (make.ts), so `parse` reads them as files of this version and never runs the
  1.0.x ligand migration on them.
- examples.check: hidden files (.DS_Store) in src/examples do not fail it; shapes are checked for the colour too; the
  CDXML round trip checks text, conditions and numbers; the 180° turn checks each condition's distance from its arrow.
- The stress check counts the examples a window shows (dev hook `shown`), since Undo no longer empties an opened one.
  The dark-mode case draws a frame every tenth zoom step, so it ends within WebKit's 180 s.
- This plan names no research files or methods.
- The Word paste tests from issue 166 read the three starter pictures. They stay as test pictures in
  `src-tauri/tests/pictures`. The new pictures draw a cycle's arcs as lines, and
  `plus_fills_draw_the_same_in_any_fill_mode` needs the old cycle picture's arc of many filled pieces.

Results: `npm test`; `node src/examples-stress.check.ts` with OCTET_STRESS_URL (WebKit, 65 of 65, AI on and with
1.1.3's AI switch off); `npm run look` on Home with no recent drawings and on ?demo (Examples page): every control
matches; `node scripts/gallery/make.ts --check`: the recipes give the committed drawings.

Not fixed here, with the reason:

- One-word chemical conditions (NaH, TBHP, Ac2O, CO, NH2OH, MeOH, Pd(PPh3)4, ISC) come back from ChemDraw 22.2 as
  structures. Octet writes them as plain `<t>` text in a document with InterpretChemically="yes", as it does for every
  drawing since 1.0; the examples only show it. The fix is in cdxml.ts and needs a ChemDraw session: its own item.
- The poster (A0 at 300 %) and ChemDraw 22.2: ChemDraw stopped answering after the poster was opened on 17 November,
  and the cause was not found. Every Octet poster's CDXML has the same one-page A0 page; the example adds nothing to
  it. Needs a ChemDraw run by Sam (an empty A0 Poster drawing first, then the example).
- After 1.1.3's Jablonski diagram (issue 43) is merged, the Photo-oxygenation recipe can draw its diagram with Object >
  Add Chart > Jablonski Diagram; today it uses the Photochemistry template set's.
