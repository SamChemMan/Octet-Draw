# Home: select several drawings

Status: built 6 Nov 2026, in n-ole and v111 (1.1.1). Folders and templates are not selectable yet.

## Why Discard looked broken

Discard works. `recovery_list` returns 24 kept drawings at most, and Sam's data folder has 367 (test runs that force
quit Octet). Discard removes one and the 25th moves into its place, so the grid looks the same.

## What it must do

Each job has its acceptance test.

1. **Every kept drawing shows.** Home lists every recovered drawing, newest first, up to 1,000 (a bound on a folder
   that a bug fills).
   Test: 367 copies in the folder give 367 Recovered tiles. Discard one gives 366.
2. **Select by pointer, as in Finder.** On the drawing tiles in Recent, and in an open folder: ⌘-click (Ctrl-click on
   Windows and Linux) adds or removes a tile. Shift-click selects every tile from the last one clicked. A plain click
   opens a drawing, as now, and clears any selection.
   Test: ⌘-click on 3 tiles selects 3. Shift-click on a fourth tile selects the range. A plain click opens the drawing.
3. **Select by keyboard.** ⌘A selects every drawing tile in Recent (or in the open folder). Shift+arrow keys extend the
   selection from the focused tile. Escape clears it.
   Test: ⌘A then Escape leaves nothing selected. Shift+Right twice from a tile selects 3.
4. **A selected tile looks selected.** It gets the `--selection` tint and the focus-ring colour on its frame, in light
   and dark. No text is added to the tile.
   Test: screenshot in both themes.
5. **Act on the selection.** The right-click menu on a selected tile acts on every selected tile:
   - Discard (recovered drawings): one dialog, "Discard 12 drawings?", the same note as now.
   - Remove from Home (recent drawings): no dialog, as now.
   - Add to folder / Move to folder: all of them go in, and each picture flies in.
   A mixed selection shows the items that fit each kind and acts on the ones each fits. Delete or Backspace does
   Discard and Remove from Home together, with the dialog when there are recovered drawings in the selection.
   Test: ⌘A, Delete, Discard gives an empty Recovered row and the recents gone from Home. The drawing files stay on
   disk.
6. **One call for many.** `recovery_discard` takes a list of ids and removes each one. It removes the ones it can
   and reports the ones it cannot, in one error.
   Test: Rust test with 3 ids, one of them still open in a live session: 2 go, the error names 1.
7. **Speed.** Home with 400 tiles opens and scrolls with no lag. Selection changes do not re-render the thumbnails.
   Test: timing check of Home's first paint, before and after, with 400 copies.

## Decisions

- One click still opens. Home has always opened on one click, so selection uses the modifier keys, as Finder's
  list view and Mail do.
- Folders and templates are not selectable in this change. See the question below.
- The tests that drive Octet write their copies into the real data folder. That is a separate fix: the test runs
  should use a folder of their own.

## Question for Sam

Should folders (Delete folder) and your own templates (Remove template) be selectable too, for the consistency
pillar? That adds about a third to the work.
