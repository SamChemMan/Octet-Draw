# Two drag modifiers: Shift keeps a move on one axis, Alt swaps box and lasso

For 1.1.3. GitHub #169 (Mickaël) and an anonymous email. Branch `item/c-dragmods` from 9ca16e2.

ChemDraw: Shift+drag on a selection keeps it horizontal or vertical, and Shift with the copy key copies along an axis
(notes chemdraw-toolbar.md 3.1; chemdraw-hotkeys.md, Duplicate row; help26 File.txt, "Copy a selected object
(constrained to X and Y axes)"). Holding Alt with the Lasso or Marquee makes it work as the other one (help26
File.txt, "Switch between the Lasso and Marquee operations"). Not checked live in ChemDraw 22.2: whether Shift or Alt
pressed part-way through a drag changes it.

## What it must do, and how each is tested

1. Shift held while a selection is dragged keeps the move on one axis: the axis the pointer has moved further along
   from the press. It can change as the pointer moves. Test: `snap.check.ts` asserts `oneAxis` keeps x and zeroes y
   when the pointer has moved further across, and the other way round.
2. Snapping still works on the free axis. Guides on the locked axis go. An atom-on-atom snap goes (it moves both
   axes), and the free axis then follows the pointer. Test: `snap.check.ts` asserts a guide on the free axis stays,
   a guide on the locked axis goes (a spacing mark counts for the axis it snaps, as in the Snap to Grid step), and a
   point snap is dropped.
3. Copy-drag (Option on the Mac, Alt or Ctrl on Windows and Linux) with Shift makes a copy that lands level with or
   straight under the original. Copies go through the same "move" drag as moves, so 1 covers them. Test:
   `snap.check.ts` reads Editor.tsx: the "move" case calls `oneAxis` when `e.shiftKey`.
4. Pressing or letting go of Shift mid-drag takes effect at the next pointer move. The lock reads `e.shiftKey` on
   each move. Test: same Editor.tsx assert (it reads the move event, not the press).
5. The same for a reagent table (the "grid" drag). Test: `snap.check.ts` asserts the "grid" case calls `oneAxis`.
6. Every object kind that moves through the "move" drag gets it: structures, text, arrows, shapes, brackets,
   symbols, spectra, tables, pictures, and a hold from another tool on the selection. They share `startMove`, so one
   change covers them. Test: the Editor.tsx assert above, and `startMove` is the only place that makes a "move" drag
   (asserted by counting `kind: "move"` in Editor.tsx).
7. A bond tool's Shift-drag on an atom (it moves that atom alone) keeps moving freely: Shift is the key that starts
   it. Test: `snap.check.ts` asserts the lock skips a drag marked `alone`.
8. In `pressSelect`, the copy key with Shift pressed inside the selection copies, where Shift alone starts a box
   that adds. The same inside a selected group's frame. Test: `snap.check.ts` reads Editor.tsx for `(!shift || copy)`
   in both places.
9. A Shift-press on a charge or lone pair still moves the mark (unchanged code; `kind: "mark"` is not a "move" drag).
10. Alt held (Option on the Mac) as a selection area starts on empty canvas draws the other shape: a lasso when
    Select is set to Box, a box when it is set to Lasso. Structure perspective keeps its box. Every tool whose hold
    turns into an area goes through `startArea`, so it gets the same. Test: `boxselect.check.ts` asserts `startArea`
    reads `pressAlt.current` and picks the lasso by it.
11. On Windows and Linux Alt is also a copy key. An Alt-press on the selection still copies (`pressSelect` moves
    the selection before it reaches `startArea`). Test: `boxselect.check.ts` asserts the order in `pressSelect`.
12. No slower pointer move. Timed against 9ca16e2 with a scratch run of the snap and lock step.

## Design

- `oneAxis(s, raw, lock)` in `src/snap.ts`. When `lock` is false it returns `s` unchanged. Otherwise k is the axis
  with the larger `|raw|`. The other axis of `s.d` is set to 0. Guides that snap the other axis are dropped. A point
  snap is dropped and the free axis goes back to `raw`.
- Editor.tsx "move": after the snap and Snap to Grid steps, `snapped = oneAxis(snapped, raw, e.shiftKey &&
  !drag.alone)`. `startMove` puts `alone: true` on the drag for the bond tool's Shift-drag.
- Editor.tsx "grid": the same after its Snap to Grid step.
- `pressSelect`: `!shift` becomes `(!shift || copy)` in the "press on the selection" test and the group frame test.
- `startArea`: the lasso test is `selectKind === "lasso" ? !pressAlt.current : selectKind === "box" &&
  pressAlt.current`.
- No new MCP op. MCP moves (`advanced` move ops) take exact offsets, so they need no lock.

## Results (19 November)

- `npm test`: 183 of 183 check files pass. `snap.check.ts` and `boxselect.check.ts` pass with the new asserts.
- In the dev server (Chromium pane, pointer events with modifiers), on an ethane: Shift-drag moved it 100 px across
  and 0 down for a pointer 100 across and 30 down. Letting go of Shift mid-drag freed it at the next move.
  Option+Shift-drag made a copy straight under the original (same x, pointer 30 px across). Shift-drag of the
  selected copy by an end atom moved the whole copy straight down. Option-drag on empty canvas with Select set to
  Box drew the lasso; without Option, the box. A reagent table and the other object kinds were not dragged by hand:
  they share the "move" drag (asserted).
- Timing, Node, a 50-structure drawing, 15 interleaved runs of 2000 moves: snap step alone 16.15 µs a move, with
  `oneAxis` 16.24 µs (Shift up) and 16.23 µs (Shift held). `oneAxis` alone is 0.05 µs. Noise level.
- `npm run look` (WebKit): every control matches; the sweep did not reach Home (the sweep's own step, no UI changed
  here).
