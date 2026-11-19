# Plan: a Jablonski diagram whose transitions stay attached (issue 43)

17 November 2026. Branch `item/43-energy-levels`, from `release-1.2-mcp` at b30f413. For 1.2 (Friday 20 November).

Issue 43 asked for two things. The Photochemistry template set shipped in 1.1.2. The last open part is a real
energy-level diagram: levels whose transitions stay attached when a level moves, as a catalytic cycle's arcs stay
fitted to its intermediates. This plan builds that as a third chart kind, beside the energy diagram and the
sensitivity screen.

## What 1.2 has now

Read on this branch at b30f413.

- **Charts are page figures.** A chart is one plain group of lines and captions that keeps a record of what it shows
  (`src/charts.ts:13-28`, `src/pageplot.ts:30-35`). Each part keeps its role and the place Octet gave it.
  `placePlot` (`pageplot.ts:110-120`) puts a figure on the page. `replot` (`pageplot.ts:266-329`) draws it again from
  a changed record and keeps what the user changed on each part (`keep`, `pageplot.ts:239-258`). `plotShift`
  (`pageplot.ts:124-141`) finds the group's move, and turns the record off when the chart was turned or flipped.
- **The energy diagram is not a Jablonski diagram.** `energyFigure` (`charts.ts:61-146`) draws states as columns
  across, a bold level per path at a typed energy, and joins between one path's levels. It has no arrows with heads, no
  wavy lines, no vibrational levels, no transition between two levels of different columns at a chosen place, and no
  kind of transition. A figure's line (`spectrumplot.ts:307-312`) has no head at all.
- **No part of a chart follows another.** The plan for charts decided that every part moves alone and that no drag
  sets a value (`docs/plans/charts.md:22`, `:145-150`). A level dragged on the page keeps its own offset, and the joins
  stay where they were. Only two things follow today: a spectrum label's leader (`followLeaders`, `pageplot.ts:198-219`)
  and text typed over a chart's caption (`followCharts`, `pageplot.ts:334-359`, with `retyped`, `charts.ts:319-337`).
  Both run in every edit (`Editor.tsx:1078`), and the leader also follows during a move drag (`Editor.tsx:3412`).
- **The charts plan left this open.** `docs/plans/charts.md:108-111` (C4): "A diagram with levels at typed energies
  and arrows that follow them can be a third chart kind later."
- **The template is a picture.** The Photochemistry set's Jablonski diagram (`tools/library/photochem.mjs:70-89`,
  checked in `src/photochem.check.ts`) is S₀, S₁ and T₁ with three lines each, four arrows with their text as
  conditions, in one group that is not integral. Move a level and its arrows stay where they were.
- **Files keep any chart record.** CDXML writes a group's record in its Octet attribute (`cdxml.ts:1143`) and reads
  it with `readPlot` (`cdxml.ts:1525`). CDX keeps the same data under Octet's own tag (ae72024). A wavy arrow is
  written as `LineType="Wavy"` (`cdxml.ts:973`). A part copied without its group loses its role (`edit.ts:2853-2858`).
- **The MCP has no chart at all.** `src/mcp.ts` has no draw kind, tool or action for a chart (no match for "chart").
  `KINDS` is structures, reaction, cycle and figure (`mcp.ts:345`). The Actions pattern (`mcp.ts:290`) has no
  `chart.` action. Energy diagrams and sensitivity screens are not reachable by an AI app either.
- **UI.** Object › Add Chart has Energy Diagram… and Sensitivity Screen… (`src-tauri/src/main.rs:962-968`). The chart
  commands and actions are at `Editor.tsx:2842-2851` and `Editor.tsx:8153-8174`. The Actions panel shows a picked
  chart's options at `Actions.tsx:62-63`, `:563-569` and `:1128-1151`.

So the gap is real: there is no object whose transitions stay attached to its levels.

Other work in flight. `fix/37b-drag-render` makes a move drag do less work in `Editor.tsx`; it does not change the
drawing a drag shows (`Editor.tsx:3412`), where `followLevels` goes. `fix/1.2-bugs-int` changes `Editor.tsx`,
`cdxml.ts`, `edit.ts` and `render.ts`, none of it in charts. `fix/163-164-charges` changes the MCP's edit tool
(`charge_angle`), away from the chart op. `item/97-43-templates` owns the template set.

## ChemDraw cross-check

Checked on 17 November 2026 against Octet's notes on ChemDraw 26.1 (its menu bar, context menus, palettes and help)
and on ChemDraw 22.2, and with ChemDraw 22.2 opening a file from Octet.

- **ChemDraw has no energy-level or Jablonski object.** Its help and menus have none, and it has no photochemistry
  template set. A ChemDraw user draws one from lines, arrows and text, and moves every arrow by hand.
- **Options ChemDraw gives the parts this object is made of.** Lines: plain, dashed, bold, wavy (Drawing Elements).
  Arrows: plain, dashed, bold, doubled; full or half head at either end; solid, hollow or angled head; three head
  sizes. Colour: the document palette and Other…. Object menu: Group, Ungroup, Integral, Align, Distribute, Flip,
  Rotate 180°, Rotate…, Scale…, Bring to Front, Send to Back, Center on Page. Text: font, size, bold, italic,
  underline, subscript and superscript, justification. Octet has each of these for lines, arrows and text, and a
  chart part takes them because it is an ordinary line, arrow or caption whose changes `replot` keeps.
- **CDXML attributes used.** `group` (with `Integral`), `arrow` and its legacy `graphic` (`LineType`, `ArrowheadHead`,
  `ArrowheadTail`, `ArrowheadType`, `HeadSize`, `color`, `Z`), and `t` with `s` runs (`face` for subscript and
  superscript) and `InterpretChemically="no"`.
- **ChemDraw with our file (tried on 17 November 2026 with ChemDraw 22.2).** The template's Jablonski
  diagram and two lone wavy arrows were written by Octet as CDXML, opened in ChemDraw 22.2 and saved by it as CDXML.
  ChemDraw kept every line and arrow, the group, the full heads, the subscripts and `LineType="Wavy"` on the wavy
  arrows. It dropped every Octet attribute. So ChemDraw shows the picture, and a file it saves comes back to Octet as a
  plain group with no record.
- **Keys.** ChemDraw has no key for this. Octet adds no default key.

Octet gets every ChemDraw option for these parts. ChemDraw has nothing for the object itself, so nothing is missing.

## Design

### Rules every part keeps

- **R1. One object.** A Jablonski diagram is a chart: one plain group of ordinary lines, arrows and captions with a
  record (`kind: "jablonski"`). It is no second diagram system. It uses `placePlot`, `replot`, `plotShift`,
  `reframe`, `rescale`, `followCharts` and the readers as they are, with small additions.
- **R2. Transitions stay attached.** Every transition starts on a level (or one of its vibrational levels) and ends
  on one. Whatever moves a level (drag, nudge, Align, Distribute, a resize, the MCP's move) also moves its vibrational
  levels, its name and each transition to or from it, in the same undo step, and during a drag as the pointer moves.
- **R3. Geometry is data.** A change made to a level or a transition on the page is read back into the record, so the
  next redraw puts it where the user put it. A level's height and ends, and a transition's ends, are what the record
  holds. No number is shown for a place, so no drag claims an exact value (this keeps the charts plan's rule).
- **R4. The user's changes stay.** Colour, font, text, style, heads, width, draw order and a label moved by hand stay
  across every redraw (`keep`). A kind chosen in the Actions panel changes a transition's style and head only where the
  user has not changed them.
- **R5. Text is text.** S₀, T₁ and hν add no atoms to a formula, a mass or a warning (`chemical: false`).
- **R6. Radiative straight, radiationless wavy (IUPAC).** Absorption, fluorescence and phosphorescence are straight
  arrows. Internal conversion, intersystem crossing and vibrational relaxation are wavy arrows. Every transition has a
  full head at its end.
- **R7. A wavy transition's wave ends where its head starts.** Its tail end moves back along it by less than half a
  wave, as the template's arrows are sized (`photochem.mjs:11-14`).
- **R8. Hostile input.** A record from a file or the MCP is checked: counts, indices, lengths, numbers and kinds have
  limits. A bad record is dropped and the group stays a plain group.
- **R9. No speed cost elsewhere.** A drawing with no Jablonski diagram pays one test of its groups per edit, and
  nothing during a drag.

### Decisions

- **D1. A chart kind, in `charts.ts`.** The task says to extend charts if that is the natural home. It is: the record,
  roles, redraw, files and Actions panel set already exist, and a Jablonski diagram is a figure of the same kind.
- **D2. Levels follow by reading the page back.** The charts plan made each part move alone. Here a level, a
  vibrational level or a transition moved alone is read back into the record (`followLevels`), and the chart is drawn
  again. Text still moves alone: a name or label moved by hand keeps its offset and follows its level or transition.
  Reason: this is the only way to keep R2 and still let every existing move (drag, nudge, Align, MCP move) work.
- **D3. Read from what the page shows.** `followLevels` looks at every level and
  transition of a chart the edit touched, and settles each one whose offset is not the group's move. So a level
  moved while the chart was turned, or moved by another program, is read back the next time the chart is edited.
  Deletion is the exception: only a level or a transition this edit removed takes its state or transition out of the
  record. Reason: a file opened with a level missing must not lose transitions on the user's first unrelated edit.
- **D4. Places are fractions of the frame.** A state's ends and height and a transition's ends are fractions of the
  chart's frame, and after every change the frame is set to the levels' box. Reason: `reframe` and `rescale` then work
  unchanged, and the axis always reaches the top level.
- **D5. No sheet.** A Jablonski diagram has no Edit Data…. Object › Add Chart › Jablonski Diagram puts the standard
  diagram on the page at once (no ellipsis: no dialog). Its data is edited where it is drawn. Reason: its data is
  places and kinds, and the energy diagram already draws levels at exact energies. Edit Data… with a Jablonski
  diagram picked says "A Jablonski diagram has no data sheet." Return on a picked one does what Return does on a group.
- **D6. Default diagram by Kasha's rule.** S₀, S₁, S₂ and T₁ with three vibrational levels each. Absorption from S₀ to
  S₁ and to S₂, internal conversion from S₂ to S₁, fluorescence from S₁ to S₀, intersystem crossing from S₁ to T₁,
  phosphorescence from T₁ to S₀. The same rule makes the MCP's transitions when it gives none.
- **D7. The kind of a new transition comes from its states.** Up: absorption. Down to the same letter (S to S, T to
  T): fluorescence to the lowest state, else internal conversion. Down to another letter: phosphorescence from the
  lowest T to the lowest state, else intersystem crossing. The same state: vibrational relaxation. The letter is the
  first letter of the state's name. The kind can be changed in the Actions panel.
- **D8. Columns by letter.** A new state whose name starts with S or D goes in the left column, with T or Q in the
  right column. The lowest state spans both.
- **D9. In ink.** Every part is drawn in the document's ink, as the template set is. Colour on any part stays.
- **D10. Bold levels, plain vibrational levels.** As the energy diagram draws its levels bold, so the state stands out
  from its vibrational levels.
- **D11. Names and labels.** A name that is one capital and digits (S1, T2) draws its digits as a subscript. In a name
  or a label, `_x` or `_{xy}` is a subscript and `^x` or `^{xy}` a superscript, and a label that starts with hν draws hν
  in italic (h and ν are quantities). `\_` is an underscore. Text typed over a name or label on the page is the
  record's (as `retyped`), and it is drawn again with its scripts only when it was typed as plain text.
- **D12. A copied part is plain.** A level or transition copied, cut and pasted, or Option-dragged alone, is a plain
  line or arrow outside the chart, as any chart part is (`edit.ts:2853`).
- **D13. A part that is data has only end handles.** A picked level or transition shows its two end handles, and no
  bend or added-point handle.
- **D14. `kind` joins `ARROW_KEEP`.** A transition (or any chart line) set to another arrow kind keeps it across a
  redraw, as it keeps its style. Today a redraw puts it back to a line.

### The record

```ts
type JablonskiKind = "absorption" | "fluorescence" | "phosphorescence" | "ic" | "isc" | "vr";
// x: the level's ends across, y: its height (fractions of the frame); vib: vibrational levels drawn over it (0 to 8).
type JState = { name: string; x: [number, number]; y: number; vib: number };
// from, to: states (the same one only for vr); x: each end across (fractions of the frame); vib: the vibrational level
// each end sits on (0: the state's own level).
type JTransition = { from: number; to: number; kind: JablonskiKind; label: string; x: [number, number]; vib: [number, number] };
type JablonskiChart = Base & { kind: "jablonski"; states: JState[]; transitions: JTransition[]; axis: boolean; unit: string };
```

Limits: 1 to 24 states, 0 to 64 transitions, 0 to 8 vibrational levels, names and labels 80 characters with no
control characters, every fraction in 0 to 1, x[0] < x[1], indices in range, frame at most 1000 bond lengths a side.

Roles: `axis`, `axis-title`, `level:k`, `vib:k:i`, `state:k` (name), `trans:t`, `label:t`. A state or transition
taken out renames the roles after it, as `energyRoles` does.

The figure: a level from `x[0]·W` to `x[1]·W` at `y·H`, bold; vibrational level i at `y·H + i·g`, plain, where g is
half the caption size (0.35 bond lengths in the default style), so it scales with text. A transition from its from end
(clamped inside its level, 0.2 em from each end) to its to end, with a full head. Its label beside its middle, on the
side with more room. A state's name at the outer end of its level. The axis an arrow up at the left, from the foot to
above the top vibrational level, its title "Energy" at its top.

### How a change on the page becomes data

`followLevels(was, now, env)` in `pageplot.ts`, called in `set()` before `followCharts`, and in the move and handle
drag previews beside `followLeaders` (`Editor.tsx:3412`).

1. Return at once when no group has a Jablonski record.
2. For each Jablonski chart this edit touched (one of its parts changed or went), whose record this edit did not
   change itself, and that `plotShift` still reads:
3. Level: a level whose two ends moved alike moved (new ends and height). One end moved: its length changed (the end
   not moved keeps the height). A turned level lies flat again. A level is at least 1 em long.
4. Vibrational level moved alone: its state moves as far.
5. Transition: an end that lies on a level or vibrational level of this chart (within 0.6 em up or down and inside its
   ends) joins it. An end that lies on none keeps its state and takes only its new place across. An end dropped on the
   state of its other end keeps its old state (only vibrational relaxation stays in one state). A transition moved
   whole slides across.
6. A level this edit deleted takes out its state, its vibrational levels, its name and every transition to or from it.
   A transition this edit deleted takes its label with it. When the last state goes, the record goes and what is left
   stays a plain group.
7. The frame is set to the levels' box (no side over 1000 bond lengths: a move that would pass that stops there), and
   `replot` draws the chart again. A new `Replot` option, `settle`, puts each part read back at the group's move.

### Words added to the UI

- Native menu: Object › Add Chart › Jablonski Diagram. Command palette: Jablonski diagram (found by jablonski,
  photophysics, photochemistry, excited state, singlet, triplet, fluorescence, phosphorescence, intersystem crossing,
  energy level). Notice: Jablonski diagram added. A Jablonski diagram has no data sheet.
- Actions panel, Chart set: Add a singlet, Add a triplet, Hide the axis or Show the axis (the energy diagram's words).
  A level picked: Vibrational levels (a number field), Add a transition (a `Menu` of the other states by name, and
  Vibrational relaxation, each with the glyph of the kind it makes). A transition picked: its kind (a `Menu`:
  Absorption, Fluorescence, Phosphorescence, Internal conversion, Intersystem crossing, Vibrational relaxation, each
  with a glyph of its arrow as drawn).
- On the page: S₀, S₁, S₂, T₁, hν_A, hν_F, hν_P, IC, ISC, VR, Energy.

## Jobs

Each job is done when every line under it holds and its checks pass.

### J1. The record and its figure

- `JablonskiChart` in `charts.ts`, `jablonskiFigure`, `NEW_JABLONSKI` (D6), `defaultTransitions` (D6, D7), `readChart`
  for the new kind (R8), `chartName` "Jablonski diagram".
- A figure's line can have a head (`end`), passed on by `madeOf` (`pageplot.ts:101`). Spectra and the other charts set
  none, so they draw as before.
- Done: the default record draws 4 bold levels, 12 vibrational levels, 6 transitions with the style, head and
  direction R6 gives, 6 labels, 4 names with subscripts, and the axis with a head. Every transition's ends lie on their
  levels. Every wavy transition meets R7. Every caption is `chemical: false`.

### J2. Add Chart › Jablonski Diagram

- Menu item in `main.rs`, command `chart_jablonski`, palette entry and search words, placed clear of what is on the
  page (`applyChart`), picked, in view, one undo step.
- Done: `cargo test` passes with the item (own `CARGO_TARGET_DIR`); `inventory.check.ts` still passes; the palette
  finds it by each search word; the dev server adds it from the palette and from `commands.chart_jablonski`.

### J3. Transitions stay attached

- `followLevels` and `Replot.settle` (above), wired into `set()` and the move and handle drag previews. D13 handles.
- Done: each case of steps 3 to 7 has a test in `jablonski.check.ts`, and a level dragged in the dev server takes its
  transitions with it as the pointer moves (screenshots during and after the drag).

### J4. Restyle by kind, and the Actions panel

- `chart.kind.<kind>`, `chart.vib.<n>`, `chart.link.<state>` (and `chart.link.self`), `chart.add.singlet`,
  `chart.add.triplet`, `chart.axis` in `Editor.tsx` (as `chart.join` is), and the controls in `Actions.tsx`, using
  `Menu`, `NumberField` and the existing small buttons. `ChartLook` gains the Jablonski fields.
- A new transition goes where its levels leave the most room across. A new state goes one step above the top state of
  its column, named with the next number.
- Done: each action's record change and R4 are tested; `npm run look -- http://localhost:1465/` passes with the sweep
  reaching a picked Jablonski diagram, a picked level and a picked transition; the panel looked at in light and dark.

### J5. Text on the page is data

- `retyped` for `state:k`, `label:t` and `axis-title` of a Jablonski diagram, with D11's scripts.
- Done: tests for a name and a label typed over, plain and with runs, and S3 typed as a name drawing S₃.

### J6. Files, clipboard and export

- No new writer. The record goes in the group's Octet data, the parts are arrows, lines and runs of text.
- Done: `chartexport.check.ts` gives a Jablonski diagram back the same from CDXML, CDX, `.oct` and a paste of copied
  CDXML; a hostile record is refused; ChemDraw 22.2 opens the CDXML and saves it with every arrow, head, wave and
  subscript; Octet 1.1.2's own reader (tag v1.1.2) opens the file as a plain group of the same parts; an SVG export
  from the dev server holds the waves and heads.

### J7. MCP

- See "MCP" below. Done: `mcpchart.check.ts` passes every case listed there.

### J8. Speed

- See "Speed" below. Done: the timings in `chartspeed.check.ts` pass, alone and in `npm test`.

## Consistency: the siblings

| Behaviour | Every place it applies | Expected |
| --- | --- | --- |
| Colour | each level, vibrational level, transition, name, label, the axis and its title; the whole chart | Colour menu and Actions colour row colour it; it stays after every redraw; dark mode keeps a chosen colour and shows ink as the dark ink |
| ⌘A | every part | picked, as any line and caption |
| Hold to Select | every tool over a chart | unchanged: no new tool |
| Undo and redo | add, move, length, slide, re-attach, delete, kind, vibrational levels, add a state, add a transition, axis, typed text | each one step; redo gives the same drawing |
| Copy and paste | the whole chart; one part | whole: a second chart with its own record; a part: plain (D12) |
| Duplicate, Option-drag | as copy and paste | as copy and paste |
| Flip and rotate | the whole chart; one part | whole: the record is not used until it is turned back (as the energy diagram); a level turned alone lies flat again (step 3); a transition turned alone keeps its ends on levels (step 5) |
| Align, Distribute | several levels picked | each state moves; transitions follow |
| Delete, Cut | a level; a transition; a name, label, vibrational level, the axis | step 6; the others stay deleted as any chart part, and Show the axis brings the axis back |
| Scale…, ⌘K, handles | the whole chart | `rescale` and `reframe`, as for any chart; vibrational spacing scales with the text |
| Bring to Front, Send to Back | every part | the order stays after a redraw |
| Group, Ungroup, Pick as one | the chart, and the chart grouped with a structure | ungrouped: plain, no record; grouped with more: the outer group still holds every part after a redraw; pick as one: parts cannot be picked alone, the chart moves whole |
| Text style | names, labels, axis title | bold, italic, font, size, scripts stay after a redraw |
| Arrow style | transitions | style, heads, head shape, width, kind stay (R4, D14) |
| Files | `.oct`, CDXML, CDX, clipboard | the record and every part come back the same |
| Other charts | energy diagram, sensitivity screen | the figure's new `end` and D14 change nothing they draw; their MCP and `chart.` actions are added with this item |
| Template set | the Photochemistry set's Jablonski picture | unchanged: it stays a picture |

## MCP

Kept small and local. Another session reviews MCP code.

- **draw kind `chart`** (`KINDS`, its op and advanced help). `chart`: `jablonski`, `energy` or `radar`.
  - `jablonski`: `states` (1 to 24: `name`, and `energy` (a number in any unit: places the level, the lowest at the
    foot), `vib` (0 to 8, default 3), `column` (`left` or `right`, default by D8)), `transitions` (0 to 64: `from`,
    `to` (state names), `kind` (default D7), `label` (default by kind)); without `transitions`, D6's; `axis`.
  - `energy`: `rows`, the sheet as typed (first row the paths' names, then a row for each state: its name and its cells,
    as `parseCell` reads them), `join`, `unit`. `radar`: `rows` (a condition and its cell), `min`, `max`, `step`.
  - Placed as the other draw kinds (`at`, `anchor`, `right_of` and the rest), else clear of what is drawn.
  - The reply names each part's id: "Drew a Jablonski diagram: S0 a12 (t13), S1 a16 …; absorption S0→S1 a30 (t31) …".
- **read** lists each chart once (its kind, title, and for a Jablonski diagram each state's name, level id and
  vibrational levels, each transition's from, to, kind, label and ids), and leaves its captions out of free text.
- **run_command** takes the `chart.` actions (J4, and the energy diagram's and sensitivity screen's) on the ids given.
- **move, edit, delete** need nothing new: they go through `set()`, so a level moved by id takes its transitions, and
  text edited on a name or label is the record's.
- Refusals, each naming the argument: an unknown `chart`; no states; more than 24 states or 64 transitions; two states
  with one name; a transition naming no state; `vr` between two states; a number that is not finite; `chart.kind` with
  no transition picked; `chart.vib` with no level picked; `chart.` ids from two charts.

## Files and formats

| Format | Written | Octet 1.2 reads back | ChemDraw | Octet 1.1.2 |
| --- | --- | --- | --- | --- |
| `.oct` | CDXML inside, the record in the group's Octet data, roles in each part's | the chart, record and roles | as CDXML | a plain group, the same picture |
| CDXML | as `.oct` | the same | shows the picture; a file it saves has no Octet data, so it comes back as a plain group | a plain group |
| CDX | Octet data under Octet's own tag | the same | shows the picture | a plain group |
| Clipboard (CDXML, PDF with CDXML, PNG, SVG) | the same writers | paste: a second chart | paste: the picture | paste: a plain group |
| MOL, SDF, SMILES, RXN | nothing: a chart has no atoms | | | |
| SVG, PDF, PNG, EMF, EPS export | the parts as drawn | | | |

Octet 1.1.2's `readPlot` takes only spectra, so it drops a chart's record and keeps the group and every part.

## Stress list

Each case has its expected result. "Follows" means R2 holds after it.

1. **Empty drawing, Add.** The chart lands in view, picked, one undo step.
2. **MCP chart with no states.** Refused: "states: give one state at least".
3. **One state.** One level with its vibrational levels and the axis, no transitions. Add a transition offers only
   Vibrational relaxation.
4. **24 states and 64 transitions.** Drawn; a level drag stays inside one frame (16 ms). 25 states from the MCP or a
   file: refused, and a file's group stays plain.
5. **Odd names.** 200 characters (cut to 80), an emoji, Arabic, a tab or newline (made a space), empty (no caption).
   No crash; the record keeps what the page shows.
6. **All energies equal, or negative, from the MCP.** All levels at the foot (equal) or in order (negative); no NaN.
7. **A level dragged above the top or below the foot.** The frame grows, the axis grows, no other level moves.
8. **A level dragged 2000 bond lengths away.** It stops where the frame reaches 1000 bond lengths, so the file stays
   readable.
9. **A level's end dragged past its other end.** The level is at least 1 em long, and its transitions stay on it.
10. **A level dragged past another (S₁ under T₁).** Its transitions follow and now point the other way; their kinds stay.
11. **A transition's end dropped on another level.** It joins that level. Dropped in empty space: it keeps its level and
    takes the new place across. Dropped on the same state as its other end: it keeps its old state.
12. **A transition's end dropped on a level of a second chart.** Not joined; it stays on its own chart's level.
13. **Reverse on a transition.** Its from and to swap, and it stays on both levels.
14. **Vibrational levels from 8 to 0** with transitions ending on level 3. Each end goes to the state's own level.
    Vibrational relaxation with 0 vibrational levels is not drawn, and is drawn again at 1.
15. **Delete S₀.** S₀, its vibrational levels and name, and every transition to or from it go in one step. Undo brings
    all back.
16. **Delete every level one by one.** The last one takes the record; the axis and anything left stay as a plain group.
17. **Cut a level, then paste.** The cut is step 15 for that state; the paste is a plain line. Two undos restore all.
18. **⌘A then Delete.** The whole chart goes; nothing follows.
19. **Undo and redo chain.** Add, move S₁, change ISC to IC, delete T₁, add a triplet, type a label: undo six times
    gives each drawing before it, redo six times each drawing after it, equal at every step.
20. **Escape during a level drag.** Nothing changes; the transitions are where they were.
21. **A held arrow key on a picked level (50 nudges).** Each nudge follows; each is under 2 ms.
22. **Copy the chart to a second window and change it there.** The two charts are independent.
23. **Paste into Octet 1.1.2.** A plain group of the same picture.
24. **ChemDraw opens our CDXML, saves it, Octet opens that.** The same picture in ChemDraw; back in Octet a plain group,
    every part a plain line, arrow or caption.
25. **Chart turned 90°.** Its parts are plain; a level dragged then moves alone. Turned back: the next edit to the chart
    reads that level back (D3) and its transitions follow.
26. **Chart flipped.** As 25.
27. **Chart grouped with a photocatalyst structure.** A level moved: the outer group still holds every part, and the
    structure does not move.
28. **Pick as one.** No part can be picked alone; the chart moves whole.
29. **Scale to 25% and to 400%.** Text, lines and vibrational spacing scale; transitions stay on their levels.
30. **Resize by the handles to the smallest frame.** Levels crowd; nothing is NaN; transitions stay on their levels.
31. **Document Settings changes the caption size.** The next change to the chart lays it out for the new size.
32. **Dark mode.** Ink parts draw in the dark ink; a chosen colour stays; the Actions controls match (look).
33. **Smallest and largest zoom.** Waves and heads draw; end handles can be taken (8 px).
34. **A hostile `.oct`.** Transition to state 99, `from` equal to `to` for absorption, 10⁶ transitions, NaN, a 5000
    character name, an unknown kind: each record refused, each group plain, no hang.
35. **A file whose parts disagree with the record** (a level moved by another program). Opens as saved; the first edit
    to the chart reads the level back (D3).
36. **MCP bad arguments.** `chart: "jablonksi"`, `from: "S5"`, two states named S1, `vib: 99`, `energy: "3 eV"`,
    `chart.kind.isc` on a level, `chart.vib.3` on a transition, `chart.link.9`: each refused with the argument named;
    the drawing unchanged.
37. **Two AI sessions on one drawing.** One moves S₁ while the other sets T₁'s vibrational levels: both changes are made,
    one undo step each, and every transition is on its levels.
38. **The user drags a level while an AI call moves another.** As for any object today: the change that ends last is
    kept. The record and its parts agree after it.
39. **A drawing of 40 paclitaxels with one chart.** A level drag frame and an edit to a structure: within the budgets
    below.
40. **A 500-residue peptide and no chart.** An edit costs what it cost before (noise only).
41. **S0, S1, T1 and hν in the drawing.** No atoms in the formula, mass, SDF or warnings.
42. **Return with a Jablonski diagram picked.** What Return does on any group; Edit Data… says "A Jablonski diagram has
    no data sheet."

## Speed

Hot paths: `set()` (every edit) and a move or handle drag (every pointer move).

- With no Jablonski diagram, `followLevels` returns after one test of the groups. Timed on 40 paclitaxels and on a
  500-residue peptide: the follow chain with it against the chain without it, interleaved, median of 70 runs, no
  slower beyond noise (as `chair.check.ts` times).
- A default chart: a level move read back and drawn again under 1 ms. The largest chart (24 states, 64 transitions):
  under 10 ms. Budgets five times the time on Sam's Mac, as `chartspeed.check.ts` sets them.
- Load: `readChart` for the largest record under 1 ms.
- A timing that fails under load is run alone again and compared with the base measured the same way before it is
  called a regression.

## Acceptance

| Check | Covers |
| --- | --- |
| `src/jablonski.check.ts`: record, figure, `defaultTransitions`, kind by states, `readChart` limits | J1, R5 to R8, D6, D7, D11, stress 2 to 6, 34 |
| `src/jablonski.check.ts`: `followLevels` and `replot` settle | J3, D2, D3, stress 7 to 16, 25 to 31, 35, 38 |
| `src/jablonski.check.ts`: actions' record changes and kept user changes | J4, R4, D14 |
| `src/jablonski.check.ts`: `retyped` | J5, D11, stress 5 |
| `src/jablonski.check.ts`: undo chain through a history of `set` steps (as `history.check.ts`) | stress 17 to 19 |
| `src/chartexport.check.ts` additions | J6, stress 22, 23 (CDXML text), 41 |
| `src/chartspeed.check.ts` additions | J8, R9, stress 4, 21, 39, 40 |
| `src/mcpchart.check.ts` | J7, stress 36, 37 |
| `cargo test` (own `CARGO_TARGET_DIR`), `inventory.check.ts`, the palette in the dev server | J2 |
| `npm run look -- http://localhost:1465/` with the sweep extended, light and dark | J4, stress 32 |
| Dev server in the browser pane: add, drag a level, end handles, re-attach, delete, Escape mid-drag, zoom extremes, SVG export, Return and Edit Data… on a picked one; console clean | J2, J3, J5, J6, stress 1, 20, 33, 42 |
| ChemDraw 22.2 opens the CDXML and saves it again | J6, stress 24 |
| Octet 1.1.2's readers (tag v1.1.2) on the files this item writes | J6, stress 23 |
| `npm test` at the end | everything |

## As built (17 November 2026)

Where the build differs from the plan above, and why.

- **No `Replot.settle` option.** `followLevels` puts each part it reads back where Octet now puts it by giving the part
  a new `role.at` (its offset is then the group's move) before it calls `replot`. A name or a label that moved with its
  level or transition in the same edit loses that move from its offset the same way. `replot` is unchanged.
- **The actions are one function.** `chartAction` (`pageplot.ts`) runs every `chart.` action for all three chart kinds.
  The Actions panel, Octet with no window and the MCP call it, so the MCP's `run_command` changes a chart on the ids
  given without the editor. `jablonskiPick` says which states and transitions are picked.
- **The MCP's chart code is in `src/mcpchart.ts`.** `mcp.ts` gains the kind, the action pattern, a branch in
  `run_command` and the charts in `read`, and nothing else. A state's name over 80 characters is refused by the schema
  (on the page it is cut to 80). With no energies given, the states rise in the order given.
- **A label moves along its transition.** A label beside the middle met a level crossing there (S₁ crosses the middle
  of S₀ to S₂). Each label now tries its middle and four places along its transition, on each side, and takes the first
  clear one.
- **A figure is kept for its record.** A level moved built the old figure twice (to read the page, and in `replot` to
  tell what the user changed). `chartFigure` keeps a Jablonski diagram's last figure for its record.
- **Speed.** A level moved: 0.18 ms on the default diagram and 5.8 ms on the largest (370 parts), 0.016 ms to read the
  largest record. The budgets in `chartspeed.check.ts` are 1 ms, 16 ms (one frame) and 0.1 ms. The follow on every
  edit costs the same with and without `followLevels` on 40 paclitaxels, a 500-residue peptide and a 2,000-object page.
- **Edit data… is not in the Actions panel** for a Jablonski diagram (it has no sheet). Edit Data… from the menu or the
  command palette says so.
- **ChemDraw's save of our file** reads back in Octet as the same picture in a plain group, each transition a reaction
  arrow with its full head: Octet reads every headed arrow with no Octet data that way.

Changed after the stress test and the review (19 November 2026):

- **What counts as moved.** A level or a vibrational level is moved when its start is off its role's place or its
  length differs from the figure's, neither of which changes with the text size; a transition's end counts only when
  the edit moved it. A Document Settings change of the caption size (or a paste into a drawing of another style) then
  moves nothing until the user moves a level, and that change lays the diagram out for the new size.
- **Which diagrams are read.** `followLevels` reads a diagram only when the edit changed one of its parts (compared
  object by object), so an edit elsewhere costs no figure. The group's move is the move before the edit unless the edit
  changed every part, so more than half the parts dragged together still take the labels and the axis along.
- **The follow order.** `set()` runs `followCharts` before `followLevels`, so a name typed and a level moved in one edit
  both reach the record. `followLevels` reads a diagram whose record the edit replaced too: a drop that lands after an
  AI app's change is read against the record it was built from.
- **A level's move carries its transitions.** An end on a level moved across goes with it, and a transition straight up
  or down stays so while its other level is still under it. A level turned alone keeps its length about its middle.
  With every level moved (Scale… on the levels alone), the frame grows from its left and foot, at most 1000.
- **Reverse** swaps the record's states and the arrow's heads back, so the head is at the state it now goes to.
- **Vibrational relaxation dropped on another state** takes the kind its two states give, and its label if it had the
  default one. A record that a file could not hold is never made (`readChart` checks it before the redraw).
- **Text** is cut at 80 UTF-16 units, as a file counts it. A part whose role names a state or a transition the record
  does not have is none of them when picked.
- **Transitions keep the head handle** (D13 takes only the bend and the added point).
- **The MCP** places states with no energies by their numbers (T1 under S1), counts a ground state named GS as a
  singlet, refuses vibrational relaxation on a state with no vibrational levels, and makes the frame tall enough for a
  label between close levels.

## Not in this version

- **A sheet with typed energies, values on the levels and an energy scale.** The energy diagram draws exact energies.
  A Jablonski sheet needs a second way to place levels and a scale that holds while levels are dragged; not finished
  to standard by Friday. The MCP's `energy` places levels when the chart is made.
- **An arrow drawn with the Arrow tool between two levels joining the chart.** It needs a way to draw a free arrow near
  a chart (⌘ held, as for cycles) and a feel test. Add a transition does the job.
- **Energy transfer between two diagrams (sensitiser to acceptor).** Two charts side by side and a plain arrow draw it.
  The template set's energy transfer arrow is `item/97-43-templates`'s.
- **Colours by kind.** Figures are in ink (D9); Colour on each part does it and stays.
- **Spin arrows, electron configurations, rate tables beside states.** Not asked for; text and symbols draw them.
- **A label layout pass for crowded diagrams.** Labels choose a side only. One moved by hand stays where it was put.
- **Turning the template's Jablonski picture into a chart.** The picture stays a picture.
