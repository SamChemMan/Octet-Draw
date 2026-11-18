# Tile and Cascade for drawing windows (issue 73)

Plan for release 1.2, 18 November 2026. Status: draft for Sam's review. Branch `item/73-tile-cascade` from
`release-1.2-mcp` 515ed13. Nothing is built yet.

## What Octet has now (515ed13)

- The Window menu lists the open drawings, with a tick on the one in front, on Windows and Linux
  (`src-tauri/src/windows.rs` `list` line 134, `entries` line 154, `menus` line 165; built in `src-tauri/src/main.rs`
  lines 1138 to 1148). Choosing a drawing brings it to the front (`main.rs` line 1443, `windows.rs` `window_show` line
  352). Unit test: `the_window_menu_lists_the_drawings`. This half of issue 73 shipped in 1.1.2.
- Windows: the Window menu has Minimize, then the drawings.
- Linux: the Window menu has the drawings only (GTK has no Minimize or Full Screen item). With no drawing open, the
  menu is dimmed (`windows.rs` line 141).
- Mac: the Window menu has Minimize and Full Screen, and it is the app's windows menu (`main.rs` line 172), so macOS
  lists the windows and adds its own items (see "What macOS gives").
- Every drawing window has a minimum inner size of 800 x 620 (`windows.rs` lines 202, 262, 388; `tauri.conf.json`;
  REL-29: the toolbar always fits). A new window opens 28 px right of and below the window in front (`windows.rs`
  line 207).
- CDXML: Octet writes `WindowPosition="0 0"` and `WindowSize="0 0"` (`src/cdxml.ts` line 1158) and reads neither.
- Missing: Tile and Cascade. Decision 0020 lists them under "Not done".

So the gap is real: there is no Tile or Cascade on any platform, and the Mac lacks two of ChemDraw's Window items.

## What ChemDraw does

Sources checked: `chemdraw26-inventory.md` (3.1 Window; the Windows toolbar), `chemdraw-inventory.md` (22.2 Window
menu), `chemdraw-hotkeys.md` and `chemdraw-hotkeys.tsv` (no window keys), `menus/live-menus.md` (22.2 top-level
menus), the 26.1 help page Documents ("Selecting an Open Document"), and the public CDXML specification (Document
object).

| Where | ChemDraw | Octet after this plan |
|---|---|---|
| Windows toolbar (ChemDraw for Windows) | Cascade, Tile Horizontal, Tile Vertical | Window > Cascade, Tile Top to Bottom, Tile Side by Side (Windows, Linux on X11) |
| Window menu (Mac, 26.1 and 22.2) | Minimize ⌘M, Zoom, Bring All to Front, the open documents | Minimize ⌘M, Zoom, Bring All to Front (added), the windows (macOS's list) |
| Window menu (all) | Lists open documents and templates; the one chosen becomes active | Have (1.1.2) |
| Keys | None recorded for Cascade or Tile | None by default. Settings > Keyboard shortcuts can give each one a key |
| Context menu, dialogs | None for window arrangement | None |
| CDXML Document | `WindowPosition` (0x0901), `WindowSize` (0x0902), `WindowIsZoomed` (0x0900): the document window's place, size and zoomed state | Unchanged: Octet writes `0 0`, reads none. Arranging windows writes nothing to any file |
| View > Add Splitter ⇧⌥⌘S | Two views of one document | Not in this item (scope cut) |

ChemDraw for Windows keeps its document windows inside one frame, so its Tile never meets a minimum size. Octet's
drawing windows are top-level windows with an 800 x 620 minimum. That changes the maths (rule R4).

What ChemDraw's Tile Horizontal and Tile Vertical mean: they follow the Windows convention. Tile Horizontal puts
windows one above the other (each is a wide strip). Tile Vertical puts them side by side (each is a tall strip).

## What macOS gives

Checked on macOS 27.2 with a minimal AppKit app whose Window menu is the app's windows menu, as Octet's is. When the
menu opens, AppKit adds:

- Fill and Center.
- Move & Resize: Left, Right, Top, Bottom; Top Left, Top Right, Bottom Left, Bottom Right; Arrange: Left & Right,
  Right & Left, Top & Bottom, Bottom & Top, Quarters (with Option: Left & Quarters and the others); Return to Previous
  Size.
- Full Screen Tile, and Remove Window from Set.
- Minimize All (Minimize with Option).
- The list of windows.

AppKit does not add Zoom or Bring All to Front. When the menu has them, AppKit adds Zoom All (Zoom with Option) and
Arrange in Front (Bring All to Front with Option). Arrange in Front puts all the app's windows in a cascade in front.

So on the Mac, macOS already tiles two to four windows (Move & Resize > Arrange) and, once Bring All to Front is in the
menu, cascades them (Arrange in Front). Octet adds no Tile or Cascade of its own on the Mac. It adds ChemDraw's Zoom
and Bring All to Front, which macOS does not add.

## Jobs

Each job ends with what "done" means.

1. **Arrangement maths.** A pure Rust function (new file `src-tauri/src/arrange.rs`) gives each window its place and
   size for Cascade, Tile Top to Bottom and Tile Side by Side, from the work area, the monitor's scale, Octet's
   minimum size and each window's frame. Done: the unit tests in "Tests" pass, and `cargo test` passes.
2. **Arranging the windows.** `arrange(app, how)` picks the windows (rule R1), picks the monitor (R2), measures each
   window, restores maximised ones, moves and sizes them (R5), sets the stacking order (R6) and gives the focus back
   (R7). The Tauri command `arrange_windows { how }` runs it for the page. Done: the Mac run in "Real runs" places
   every window where the maths says, to the pixel, and `cargo check --target x86_64-pc-windows-msvc --tests` has no
   errors or warnings.
3. **Window menu on Windows and on Linux with X11.** Window: Minimize (Windows only), a line, Cascade, Tile Top to
   Bottom, Tile Side by Side, a line, the drawings. The three items are dimmed when no drawing is listed. They go
   through `item()` in `menu()`, so Settings > Keyboard shortcuts lists them under Window, and an object window's own
   menu bar has them too. On Linux with Wayland the menu stays as it is now. Done: unit tests for the item count
   before the drawing list (R9) and for the ids (R10); the Windows type check; Sam's Windows run.
4. **The page's way in.** `commands.current` gets the three ids, each calling `arrange_windows`. They run over Home,
   over a dialog, while text is typed and during an AI app's call (`menuRuns`), because they do not touch the
   drawing. The command palette lists them on Windows and Linux when the menu has them, with ChemDraw's names as
   search words ("tile horizontal", "tile vertical", "arrange windows"). Done: `src/window-arrange.check.ts` passes;
   a key set in Settings runs the command from a drawing, from Home and over a dialog (Sam's Windows run).
5. **Mac Window menu.** Add Zoom (`PredefinedMenuItem::maximize`) and Bring All to Front
   (`PredefinedMenuItem::bring_all_to_front`), as ChemDraw's Mac menu has them. Done: Sam sees Minimize, Zoom,
   macOS's items, Full Screen, Bring All to Front (Arrange in Front with Option) and the windows.
6. **Records.** Decision 0020: "Not done" becomes what was built and why the Mac differs. `THIRD_PARTY.md`: the
   windows-sys line also names window arrangement (one more feature of a crate already listed; no new dependency).
   Done: both edited in the same commit as the code they describe.
7. **What's New lines.** Returned to the release session, not written into `src/releases.ts` or
   `docs/release-notes`.

## Rules every part keeps

- **R1 Which windows.** Exactly the drawings the Window menu lists (Home's window only while it holds a drawing; every
  `draw-N`; every Office object window `object-N`). Never Home showing Home, the Reaxys window or anything else.
  Settings, About, dialogs and floating palettes are inside a window and go with it. Left alone and not counted:
  minimised windows, full-screen windows, hidden windows, windows on another virtual desktop (Windows: DWM cloaked),
  and a window that is not on the list yet (its page has not started).
- **R2 Which monitor.** The monitor of the window in front (`windows::front`), when that window is not minimised.
  Else the first arranged window's monitor. Else the primary monitor. No monitor: nothing happens. Windows on other
  monitors move to this one.
- **R3 Work area.** The monitor's work area (Tauri `Monitor::work_area`: taskbar, Dock, menu bar and panels taken
  out). Every window's visible frame stays inside it, unless the work area is smaller than the minimum window, when
  the window sits at its top left at the minimum size.
- **R4 Minimum size.** No window gets less than 800 x 620 inner size in the target monitor's logical pixels. When a
  tile is smaller, the windows keep the minimum and overlap evenly: the first at the work area's left (or top) edge,
  the last at its right (or bottom) edge.
- **R5 Pixels and scale.** All maths in the target monitor's physical pixels. A window's frame (title bar, borders,
  menu bar) is measured at its own scale and scaled to the target's. Each window is moved, then sized, then moved
  again (a window that changes monitor scale is resized by the system between the first two). Size is set once, so a
  page renders once for its new size.
- **R6 Order.** The window in front takes the first tile (top left) and the last cascade place (on top). The rest
  follow in Window menu order. The stacking follows the cascade, without making each window active: Windows uses
  `SetWindowPos` with `HWND_TOP` and `SWP_NOACTIVATE`; Linux raises each GDK window on the main thread.
- **R7 Focus.** The window that was in front stays in front with the keyboard focus. When Home (holding no drawing)
  was in front, the first arranged drawing comes to the front. While an arrangement runs, `windows::front` gives that
  window, so a menu command or an AI app's first call goes where it went before.
- **R8 One at a time.** A request while one runs waits as the one pending request; a newer request replaces it. A
  held key never queues more than one, and the last one asked for wins. The Window menu is listed again once, at the
  end.
- **R9 Menu shape.** `list` removes and adds only the drawing items, after a fixed count: 5 on Windows (Minimize,
  line, three items), 3 on Linux with X11, 0 on Linux with Wayland.
- **R10 Ids.** `cascade`, `tile_top_bottom`, `tile_side_by_side`. None starts with `window_` (the drawing list's
  prefix, `main.rs` line 1443) or `arrange_` (the Align commands).
- **R11 Nothing else changes.** No drawing changes, no undo step, no Edited mark, no recovery copy, no change of zoom
  or selection, no file written, no setting saved. Windows jump to their places, as Windows' own Cascade and Tile do.
- **R12 Hostile input.** The page gives only `how`, an enum. Any other value is refused and nothing moves. Sizes and
  places never come from the page. With `--headless`, the command returns at once.

## Design decisions

- **Mac: nothing that macOS gives.** macOS 27.2 tiles two to four windows (Move & Resize > Arrange) and cascades them
  (Arrange in Front, once Bring All to Front is in the menu). ChemDraw for Mac has no Tile or Cascade. The Mac gets
  Zoom and Bring All to Front, which ChemDraw's Mac Window menu has and macOS does not add. In debug builds only, the
  Mac also takes `arrange_windows`, so the code can run on this Mac for the real run; release builds refuse it there.
- **Linux: X11 only.** Under Wayland an app cannot place its windows, so Tile and Cascade cannot work. The items show
  only when GDK's display is X11, read once at start on the main thread, as the eyedropper does
  (`eyedropper.rs` line 57) and as fix/165 does. GNOME and KDE tile windows themselves under Wayland. The Flatpak
  build runs on Wayland where the session has it, so it gets no items there.
- **Names.** "Tile Top to Bottom" for ChemDraw's Tile Horizontal and "Tile Side by Side" for its Tile Vertical. The
  Windows convention reads the wrong way round to most people, and the issue asks for "side by side" and "one above
  the other". macOS says Top & Bottom and Left & Right. ChemDraw's names are search words in the palette. Order as
  ChemDraw's toolbar: Cascade, then the horizontal one, then the vertical one. If Sam wants ChemDraw's names, only the
  three labels change.
- **Tile grid.** For n windows: r = floor(sqrt n) rows, c = floor(n / r) columns, and the last n - r·c columns take
  one window more. Side by Side fills column by column; Top to Bottom is the same grid turned (rows of windows, filled
  row by row). Two windows: two columns, or two rows. Three: three. Five: columns of 2 and 3. Every edge falls on a
  whole pixel and the tiles cover the work area with no gap. This is the usual Windows tiling shape, written from the
  rule above.
- **Cascade.** Step d = the title bar height on the target monitor, at least 28 logical px (Octet's new-window offset).
  m = the most windows in one run that keep each window at least half the work area and at least the minimum, at
  most n. Every window is the work area less (m - 1) steps. Window k goes (k mod m) steps from the top left; after m
  windows the next run starts at the top left again, as Windows' Cascade does. Every title bar in a run shows.
- **Visible frames on Windows.** Windows 10 and 11 draw an invisible resize border round each window, so tiles placed
  by outer size show gaps of about 7 px per side. Octet measures the visible frame
  (`DwmGetWindowAttribute(DWMWA_EXTENDED_FRAME_BOUNDS)`) and places that on the tile, so windows touch. It reads
  `DWMWA_CLOAKED` with the same call to leave out windows on other virtual desktops. This adds the
  `Win32_Graphics_Dwm` feature to windows-sys, which Octet already uses.
- **Minimised windows stay minimised.** As Windows' Show windows side by side and Tile in ChemDraw's frame. Maximised
  ones are restored and arranged.
- **No MCP tool.** Arranging windows arranges the user's screen. It changes no drawing and an AI app has no use for
  it. `MENU_COMMANDS` in `src/mcp.ts` leaves out the app-level commands (new, open, close, home) for the same reason.
  The three ids stay out of it.
- **No undo of an arrangement.** ChemDraw has none, and Edit > Undo belongs to the drawing. macOS has its own Return
  to Previous Size.
- **Zoom kept.** Each window keeps its zoom, as on a resize by hand and as in ChemDraw. Fit to Window (⌘/) is one key
  away.
- **No animation.** Windows move as the system moves them. Animating native window frames step by step would cost a
  page render per step in every window.

## Siblings (consistency pillar)

| Sibling | Result |
|---|---|
| Home's window holding a drawing | Arranged (it is on the Window menu) |
| Home's window showing Home | Not moved; arranging from it works, and the first drawing comes to the front |
| Drawing windows `draw-N` | Arranged |
| Office object windows `object-N` | Arranged; their own menu bar (Windows, Linux) has the three items |
| Drawings an AI app opened | Arranged like any drawing |
| Reaxys window | Never moved |
| Settings, About, dialogs, Character map, floating template palettes | Inside their window; they reflow as on a resize by hand |
| Window menu of the main menu bar | Has the items (Windows, Linux X11) |
| Settings > Keyboard shortcuts | Lists the three under Window; a key set there works from the native menu and from the page |
| Ctrl keys run by the page (Windows, Linux) | Run the same command (`commands.current`) |
| Command palette | Lists them on Windows and Linux X11 |
| Home's Open windows list | Unchanged (it lists; it does not arrange) |
| MCP | Not offered (see decisions) |
| One-window mode (Settings, `windows` off) | One drawing: Tile fills the work area with it |
| Mac, Windows, Linux X11, Linux Wayland, Flatpak | As in the decisions |
| Light and dark | Native menus follow the system; palette rows use the existing row component and tokens |
| Undo, copy and paste, files, export, print | Untouched (R11) |

Colour, ⌘A, hold-to-Select, flip, rotate, align and delete apply to objects in a drawing. Window arrangement has no
object, so they do not apply.

## Files and formats

Nothing in any file changes. `.oct`, CDXML, CDX, MOL, SDF, RDF, SMILES, the clipboard (PDF, CDXML, CDX, MOL, SMILES,
pictures) and every export are written as before. `WindowPosition` and `WindowSize` stay `0 0`. Octet 1.1.2 and
ChemDraw open a file saved after Tile exactly as before, because the bytes are the same. The only stored change: a key
the user sets for one of the three commands goes in `settings.keys` as `menu.cascade` and the others. Octet 1.1.2 has
no such command, so it ignores the key, as it ignores the Search menu's keys when Online search is off.

## Stress list

| # | Case | Expected |
|---|---|---|
| 1 | No drawing open, Home only | The three items are dimmed; a key set for them does nothing; no error |
| 2 | One drawing | Both Tiles fill the work area with it; Cascade puts it at the top left, the work area's size |
| 3 | Two drawings, 1920 x 1080 at 100% | Side by Side: two 960 px columns, full height, frames touching. Top to Bottom: full width; each height is the minimum, so they overlap by the difference; the front one stays on top |
| 4 | Two drawings, 1920 x 1080 at 125% or 150% | Side by Side: each 800 logical px wide, overlapping evenly, the first at the left edge and the last at the right; nothing outside the work area |
| 5 | 40 drawings | Side by Side: six columns of 6, 6, 7, 7, 7 and 7 windows, every window at the minimum, overlapping evenly inside the work area. Cascade: runs of m. Done in one pass; the Window menu listed again once |
| 6 | Odd counts 3, 5, 7, 11 | 3 columns; 2 + 3; 2 + 2 + 3; 3 + 4 + 4. No empty tile; edges on whole pixels; tiles cover the work area |
| 7 | A minimised drawing; all minimised | It stays minimised and is not counted; with all minimised nothing moves |
| 8 | A maximised drawing | Restored, then arranged |
| 9 | A full-screen drawing (a Linux window manager can do this) | Left alone, not counted |
| 10 | Home in front, holding no drawing | Home does not move; the drawings go to Home's monitor; the first drawing comes to the front |
| 11 | Office object window open, Tile from its own menu bar | Arranged with the drawings, the same as from the main menu |
| 12 | Reaxys window open | Never moved |
| 13 | Two monitors: front on the left one at (-1920, 0) and 100%, two others on the right one at 150% | All three on the left monitor's work area; frames scaled from 150% to 100%; minimum at 100%; nothing under the taskbar |
| 14 | Taskbar on the left or top; a monitor above the primary at negative y | Tiles start at the work area's origin, negative or not; nothing under the taskbar |
| 15 | A drawing window left off-screen (monitor unplugged) | Moved onto the front window's monitor |
| 16 | The front window on no monitor | Primary monitor; with no monitor at all, nothing happens and nothing is shown |
| 17 | Tile key held down; Tile then Cascade at once | At most one running and one pending; the last command asked for is the final layout |
| 18 | An AI app closes a drawing during Cascade | That window is skipped; the rest are arranged; no error |
| 19 | An AI app opens a drawing during Tile | The new window is not moved; it opens where new windows open |
| 20 | Two AI sessions; one with no drawing sends its first call during Cascade | The call goes to the window that was in front before Cascade, not to one raised on the way |
| 21 | Edit > Undo after Tile | Undoes the last drawing edit; titles keep or lack "(edited)" as before; no recovery copy is written |
| 22 | Tile from the menu while a label is being typed | The text box keeps its text and caret; nothing is committed |
| 23 | A dialog (Document Settings) open in a window that Tile makes smaller | The dialog stays open and fits (the window is at least the minimum) |
| 24 | 40 paclitaxels in one window and a 500-residue peptide in another | The arrangement's own time does not depend on the drawings; each window renders once for its new size, as on a resize by hand; a window whose size does not change does not render |
| 25 | A floating template palette near the right edge, then a narrower tile | The palette stays inside the window, as on a resize by hand (if it does not, that is a fault of resizing by hand: report it to Sam, do not fix it here) |
| 26 | Zoom at 6400% or 1% in a window that is tiled | The zoom is kept; the view reflows as on a resize by hand |
| 27 | A key set in Settings (Ctrl+Alt+T for Tile Side by Side) on Windows | Works from a drawing, from Home, over a dialog and while typing; clashes show as for any key |
| 28 | Linux under Wayland | No items; Settings and the palette do not list them; the Window menu is as in 1.1.2 |
| 29 | Mac | Window: Minimize, Zoom, macOS's items, Full Screen, Bring All to Front (Arrange in Front with Option), the windows. No Octet Tile or Cascade. `arrange_windows` refused in a release build |
| 30 | A window on another virtual desktop (Windows) | Not counted, not moved |
| 31 | Work area smaller than the minimum (1024 x 600 at 125%) | Every window at the work area's top left at the minimum size; no negative size; no panic |
| 32 | Very large work area (three 4K monitors, 100 000 px in a test) | Exact tiles; no overflow (64-bit maths) |
| 33 | `invoke("arrange_windows", { how: "explode" })`, `{ how: 5 }`, no argument | Refused; nothing moves |
| 34 | `--headless --mcp` | No menu; the command returns at once |
| 35 | A drawing saved before and after Tile as .oct, CDXML and CDX | The same bytes |
| 36 | Copy in one tiled window, paste in the other | Works as before |
| 37 | One-window mode | One drawing: Tile fills the work area with it |
| 38 | Offline | Works; nothing uses the network |
| 39 | Dark mode | Native menus follow the system; palette rows as the others |

## Tests

Rust (`src-tauri/src/arrange.rs`, `cargo test` with `CARGO_TARGET_DIR=.../cargo-g73`):

- No windows: no places. One window: the work area (tiles), its top left (cascade).
- Every n from 1 to 40, both tiles, a large work area: no two tiles overlap, their areas add up to the work area, the
  last column and row end on the work area's edge, and the column counts are as the grid rule says (cases 5, 6).
- Every n from 1 to 40, every mode, work areas 1280 x 720 at 1, 1920 x 1040 at 1.25, 2560 x 1400 at 2,
  3840 x 2100 at 1.5, 1024 x 600 at 1.25 and 700 x 500 at 1: every frame inside the work area when the minimum fits;
  at the top left at the minimum when it does not (cases 3, 4, 31).
- Order: the front window first in tiles, last in the cascade.
- Cascade: equal steps of at least 28 logical px, each step at least the title bar, runs restart at the top left,
  every window at least half the work area and the minimum.
- Work areas at (-2560, -1440) and (-1920, 0): every frame inside (cases 13, 14).
- A window measured at scale 2 placed on a monitor at scale 1, and the other way: frame and inset scaled, inner size
  = tile less the scaled frame, inner size at least ceil(800·s) x ceil(620·s).
- 100 000 x 100 000 work area, scale 0 and NaN (taken as 1): no panic, no overflow (case 32).
- The fixed count before the drawing list: 5, 3, 0 (R9).
- The three ids: none starts with `window_` or `arrange_` (R10).
- The one-at-a-time state: a request while running becomes pending, a newer one replaces it, and the pending one runs
  once (case 17).

Page (`src/window-arrange.check.ts`, run with `node`, then in `npm test`):

- `menuRuns` lets the three run over Home, a dialog, typing and an AI call.
- The ids and labels match the Rust menu (the check reads `main.rs`), and the palette's search words name ChemDraw's
  Tile Horizontal and Tile Vertical.

Whole run: `npm test` (all check files, compared with the 515ed13 baseline: 161 of 161 pass), `cargo test`, and
`cargo check --target x86_64-pc-windows-msvc --tests` with stand-in C tools, as `docs/testing/ole-manual.md` did.

UI: the only web UI touched is three palette rows on Windows and Linux, drawn by the existing row component. On this
Mac the palette has no such rows. `npm run look -- http://localhost:1475/` still runs to show nothing else moved, and
the dev console must show no `look:` error.

Speed: no hot path changes on the Mac. On Windows and Linux, `list` sets three items' enabled state when it runs
(when a window comes to the front). The arrangement is not a hot path. The Mac real run times `arrange_windows` for
2, 5 and 12 windows (median of 5, modes interleaved) and counts page renders per window (case 24).

## Real runs

Mac (this machine). A local harness, never committed, in a dev build with its own `CARGO_TARGET_DIR`
(`cargo-g73`), its own identifier, and the dev server on port 1475. The harness opens 2, 5 and 12 drawing windows
(two holding 40 paclitaxels and a 500-residue peptide) and calls `arrange_windows` for each mode. A small script reads
each window's frame from the window server (no accessibility access needed) and compares it with the maths, to the
pixel. Also: a minimised window, a zoomed window, Home in front, the Reaxys window, a bad `how`, a held key, Undo and
the Edited mark after Tile, typing in a label during Tile. Then every window closed, the build stopped, and `ps`
checked for anything started from the worktree.

Windows: nothing can run here. The type check proves it builds. Sam's checklist (Windows 11 in UTM; Prof. Schramm has
Windows 11 x64 and can try two monitors):

1. Open three drawings. Window menu: Minimize, a line, Cascade, Tile Top to Bottom, Tile Side by Side, a line, the
   three drawings with a tick on the front one.
2. Tile Side by Side: three columns, frames touching, no gap at the screen edges or above the taskbar.
3. Tile Top to Bottom with two drawings: each full width; on a 1080p screen they overlap (minimum height).
4. Cascade: each title bar shows; the front drawing is on top and keeps the focus; no window flashes active on the
   way.
5. Minimise one drawing, Tile: it stays minimised. Maximise one, Tile: it is restored and tiled.
6. Settings > Keyboard shortcuts > Window: give Tile Side by Side a key; press it in a drawing, on Home, in Document
   Settings and while typing a label.
7. View > Command Palette (Ctrl+Shift+A): type "tile vertical"; Tile Side by Side is found and runs.
8. Two monitors at different scales (if there are two): Tile from a window on each monitor; all windows go to that
   monitor and fit its work area.
9. Open a Word object window (Insert > Object > Octet Drawing): its own Window menu has the items, and it is arranged
   with the drawings.

Linux (whoever has a Linux desktop; CI compiles it):

1. X11 session: the Window menu has Cascade and both Tiles, then the drawings; checks 2 to 6 above.
2. Wayland session (and the Flatpak): the Window menu lists the drawings only, as in 1.1.2.

Mac (Sam, one look): Window menu shows Minimize, Zoom, Fill, Center, Move & Resize, Full Screen Tile, Full Screen,
Bring All to Front, the windows. Hold Option: Arrange in Front cascades the drawings.

## Acceptance

| Job or case | Check |
|---|---|
| Job 1; cases 2 to 6, 13, 14, 31, 32 | Rust unit tests |
| Job 2; cases 7, 8, 10, 12, 18 to 24, 26, 33, 34 | Mac real run (harness), Rust unit tests for order and the one-at-a-time state |
| Job 2 on Windows; cases 9, 15, 16, 30 | Windows type check; Sam's Windows run (case 9: Linux run) |
| Job 3; cases 1, 11, 28 | Rust unit tests (count, ids); Sam's Windows run; Linux run |
| Job 4; cases 17, 27 | `src/window-arrange.check.ts`; Rust unit test; Sam's Windows run |
| Job 5; case 29 | Sam's Mac look |
| Job 6 | Diff of decision 0020 and THIRD_PARTY.md |
| Case 25 | Mac real run (report only) |
| Cases 35, 36 | Mac real run: save before and after Tile, compare bytes; copy and paste between two tiled windows |
| Cases 37, 38, 39 | Mac real run in one-window mode, with the network off, and in dark mode (palette rows on the Mac are untouched) |

## Files

- `src-tauri/src/arrange.rs` (new): the maths, the glue, the command, the tests.
- `src-tauri/src/main.rs`: the Window menu items, the menu event, the command in `generate_handler!`, the X11 check at
  start. Several branches also change the `generate_handler!` line (fix/165, item/48): the merge takes both.
- `src-tauri/src/windows.rs`: `list` (fixed count, enabled state), `front` (the arrangement's window while it runs).
- `src-tauri/Cargo.toml`: `Win32_Graphics_Dwm` on windows-sys.
- `src/keys.ts`, `src/Editor.tsx`: the three commands, `menuRuns`, the palette rows.
- `src/window-arrange.check.ts` (new).
- `docs/decisions/0020-windows.md`, `THIRD_PARTY.md`.

## Questions for Sam (not blocking; the plan takes the first answer)

1. Names: Tile Top to Bottom and Tile Side by Side, or ChemDraw's Tile Horizontal and Tile Vertical?
2. The 800 x 620 minimum (REL-29) means two drawings side by side overlap on a 1080p screen at 125% or more, and two
   one above the other overlap on any 1080p screen. Keep the minimum (this plan), or lower it for drawing windows in
   another item?
3. Mac: add Zoom and Bring All to Front, as ChemDraw has them (this plan)?

## What's New (draft, for the release session)

- To put the open drawings side by side, choose Window > Tile Side by Side (Windows and Linux).
- To put the open drawings one above the other, choose Window > Tile Top to Bottom (Windows and Linux).
- To put the open drawings in a stack with each title bar in view, choose Window > Cascade (Windows and Linux).
- On the Mac, the Window menu has Zoom and Bring All to Front. To put the drawings in a stack, hold Option and choose
  Window > Arrange in Front.
