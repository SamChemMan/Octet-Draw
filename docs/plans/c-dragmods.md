# Two drag modifiers: Shift keeps a move on one axis, Alt swaps box and lasso

For 1.1.3. GitHub #169 (Mickaël) and an anonymous email. Branch `item/c-dragmods` from 9ca16e2.

ChemDraw: Shift+drag on a selection keeps it horizontal or vertical, and Shift with the copy key copies along an axis
(notes chemdraw-toolbar.md 3.1; chemdraw-hotkeys.md, Duplicate row; help26 File.txt, "Copy a selected object
(constrained to X and Y axes)"). Holding Alt with the Lasso or Marquee makes it work as the other one (help26
File.txt, "Switch between the Lasso and Marquee operations"). Not checked live in ChemDraw 22.2: whether Shift or Alt
pressed part-way through a drag changes it.

## What it must do, and how each is tested

1. Shift held while a selection is dragged keeps the move on one axis: the axis the pointer has moved further along
   from the press. It can change as the pointer moves. Test: `snap.check.ts` asserts `heldAxis` holds y when the
   pointer has moved further across, x the other way round, and `oneAxis` sets the held axis to 0.
2. Snapping still works on the free axis, worked out as if the pointer had not drifted on the held axis. The held
   axis does not snap and has no guides. An atom-on-atom snap stays when the atoms are level (or straight under each
   other), and is not taken when they are not; Snap to Grid then works on the free axis. Test: `snap.check.ts`: three
   flat boxes in a row, the third Shift-dragged 0.85 across with the pointer 0.3 down, snaps to the row's spacing (0.8)
   with both spacing marks on the row; a box held on x does not snap across; an atom level with the moving one joins,
   one 0.04 above does not.
3. Copy-drag (Option on the Mac, Alt or Ctrl on Windows and Linux) with Shift makes a copy that lands level with or
   straight under the original. Copies go through the same "move" drag as moves, so 1 covers them. Test:
   `snap.check.ts` reads Editor.tsx: the "move" case calls `oneAxis` when `e.shiftKey`.
4. Pressing or letting go of Shift mid-drag takes effect at the next pointer move. The lock reads `e.shiftKey` on
   each move. Test: same Editor.tsx assert (it reads the move event, not the press).
5. The same for a reagent table (the "grid" drag). A Shift-press on a table adds it to the selection and grabs it,
   as a Shift-press on any other object does: alone, the table moves; with more picked, the whole selection moves. A
   Shift-click with no move adds the table or takes it out, from the selection before the press. Test: `snap.check.ts`
   asserts the "grid" case holds the axis before `snapBoxes`, and reads the Shift table press, the "grid" release and
   the table in `click`.
6. Every object kind that moves through the "move" drag gets it: structures, text, arrows, shapes, brackets,
   symbols, spectra, tables, pictures, and a hold from another tool on the selection. They share `startMove`, so one
   change covers them. Test: the Editor.tsx assert above, and `startMove` is the only place that makes a "move" drag
   (asserted by counting `kind: "move"` in Editor.tsx).
7. A bond tool's Shift-drag on an atom (it moves that atom alone) keeps moving freely: Shift is the key that starts
   it. Test: `snap.check.ts` asserts the lock skips a drag marked `alone`.
8. In `pressSelect`, the copy key with Shift pressed inside the selection copies, where Shift alone starts a box
   that adds. The same inside a selected group's frame. Test: `snap.check.ts` reads Editor.tsx for `(!shift || copy)`
   in both places. On Windows and Linux this also changes a Ctrl-press on bare canvas inside a selected group's frame:
   it copies the group, as Option does on the Mac. Before, it started a box that adds.
9. A Shift-press on a charge or lone pair still moves the mark (unchanged code; `kind: "mark"` is not a "move" drag).
10. Alt held (Option on the Mac) as a selection area starts on empty canvas draws the other shape: a lasso when
    Select is set to Box, a box when it is set to Lasso. Structure perspective keeps its box. Every tool whose hold
    turns into an area goes through `startArea`, so it gets the same. Test: `boxselect.check.ts` asserts `startArea`
    reads `pressAlt.current` and picks the lasso by it.
11. On Windows and Linux Alt is also a copy key. An Alt-press on the selection still copies (`pressSelect` moves
    the selection before it reaches `startArea`). Test: `boxselect.check.ts` asserts the order in `pressSelect`.
12. No slower pointer move. Timed against 9ca16e2 with a scratch run of the snap and lock step.

## Design

- `heldAxis(raw, lock)` in `src/snap.ts` gives the axis with the smaller `|raw|` when `lock` is set, and `oneAxis(d,
  held)` sets that axis to 0. `snapMove` and `snapBoxes` take `held`: they do not snap that axis, and an atom snap must
  be level on it (within 1e-6).
- Editor.tsx "move": `held = heldAxis(d0, e.shiftKey && !drag.alone)`, `raw = oneAxis(d0, held)`, the snaps run on
  `raw` with `held`, and `oneAxis` again after Snap to Grid. `startMove` puts `alone: true` on the drag for the bond
  tool's Shift-drag.
- Editor.tsx "grid": the same with `e.shiftKey`.
- `pressSelect`: a Shift-press on a table adds it to `picked`, then `startMove` with more picked, else `grabTable`.
  The "grid" release sends a Shift-click with no move to `click`, and `click`'s Shift and Option toggle counts the
  table under the point (`gridAt`).
- `pressSelect`: `!shift` becomes `(!shift || copy)` in the "press on the selection" test and the group frame test.
- `startArea`: the lasso test is `selectKind === "lasso" ? !pressAlt.current : selectKind === "box" &&
  pressAlt.current`.
- No new MCP op. MCP moves (`advanced` move ops) take exact offsets, so they need no lock.

## Results (19 November)

- `npm test`: see the review fix commit. `snap.check.ts` and `boxselect.check.ts` pass with the new asserts.
- In the dev server (Chromium pane, pointer events with modifiers), on an ethane: Shift-drag moved it 100 px across
  and 0 down for a pointer 100 across and 30 down. Letting go of Shift mid-drag freed it at the next move.
  Option+Shift-drag made a copy straight under the original (same x, pointer 30 px across). Option-drag on empty canvas
  with Select set to Box drew the lasso; without Option, the box.
- After the review, on an Experiment page with a reaction and its reagent table: a Shift-press and drag on the lone
  table moved it 120 px across and 0 down (pointer 40 down) and picked it. A Shift-click with no move took it out of
  the selection, and another put it back. With everything selected (⌘A), a Shift-drag on the table moved the whole
  selection 100 px down and 0 across (pointer 30 across). A Shift-drag on a text moved it 120 across and 0 down.
- Timing, Node, a 50-structure drawing, 2000 moves a run, 59 interleaved runs, median: the snap step at 9ca16e2
  9.6 µs a move; now with Shift up 9.7 µs (noise); with Shift held 7.2 µs (one axis snaps).
- `npm run look` (WebKit): every control matches; the sweep did not reach Home (the sweep's own step, no UI changed
  here).

## Polish of the Shift lock (19 Nov, after Sam's ChemDraw 22.2 check)

Sam tried ChemDraw 22.2 by hand. Shift pressed part-way through a drag snaps the move onto one axis, but the jump
feels bad. Option + Shift brings a copy back in line with the original, and Sam likes that. Option at the start of a
marquee gives a lasso, which matches item 10. Sam approved this polish:

13. Glide. When the lock turns on, turns off or swaps axis, the drawing slides from where it was shown to where it
    now belongs in `--motion-fast` (150 ms) with `--ease-out` (cubic-bezier(0.23, 1, 0.32, 1)). It does not jump.
    Pointer moves during the glide keep it going toward the new place. With reduced motion (prefers-reduced-motion)
    it jumps, as now. Same for a copy, a reagent table and every object that moves through "move" or "grid".
14. No flicker. Once locked, the axis swaps only when the pointer has moved clearly further the other way: more than
    1.5 times as far. The first lock takes the axis moved further, as now.
15. Shift acts at once. Pressing or releasing Shift mid-drag takes effect without a pointer move, from the last
    pointer position.
16. A guide line. While the lock is on, a thin line along the free axis runs through where the grabbed point
    started, so the axis is visible. It uses the snap guide's look and goes when the lock goes or the drag ends.
17. No slower pointer move than 1.1.2. The glide runs frames only for 150 ms after a change.

### How (13 to 17)

- `heldAxis(raw, lock, was)`: with `was` set, the axis swaps only when the other `|raw|` is more than `SWAP` (1.5)
  times the current one's.
- "move" and "grid" drags keep `d` (shown), `to` (where the move goes) and `held`. A change of `held` after the first
  move calls `glideFrom(drag.d)`: `tween` with `--motion-fast` moves `lockGlide.t`, and each frame sets the drag again
  from `to` (`glideStep`: `moveAll` for "move", `d` for "grid"). A pointer move shows `glided(to)`. Reduced motion: no
  glide. `release`, Escape, `startMove` and `grabTable` stop it; a release during a glide lands at `to`.
- A keydown or keyup of Shift (not a repeat, not while typing) during a moved "move" or "grid" drag runs
  `onPointerMove` again from `lastMove` with the new Shift.
- `lockLine` gives a `Guide` along the free axis through `drag.from`, across the window, drawn with the snap guides.

### Results (13 to 17)

- `snap.check.ts` asserts the hysteresis and reads Editor.tsx for the glide, reduced motion, the stops, the Shift
  re-run and the line. Timing in the same file: the snap and lock step, 2000 moves on 50 boxes, 31 interleaved runs,
  median: 0.57 to 0.61 µs a move now, 0.58 to 0.60 µs with 2d16aac5's `heldAxis`.
- Dev server (Chromium pane, scripted pointer events): an ethane dragged 100 px across and 30 down, then Shift down
  with no pointer move: it went partway (y 384 of 402 to 372) a few frames in, and to 372 after. The line showed while
  Shift was down and went when it came up. Let go part-way through a glide, it landed at 372. Shift-dragged up 120 px:
  a vertical line through the press; at 130 across it stayed vertical, at 200 across it swapped. Escape took the line
  away. No console errors.
