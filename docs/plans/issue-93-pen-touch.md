# Pen and touch input on tablets (#93)

Plan, 18 Nov 2026, for Sam's yes. Branch item/93-pen-touch from release-1.2-mcp 515ed13 (161 of 161 check files
pass there). Schramm asks for pen drawing at the bench and in a seminar on a Windows tablet, and targets big enough
for a finger. Sam (9 Nov): pen and touch need tests on real tablets. This plan builds what can be proven here (a Mac
with no touch screen and no pen) and ends with a short checklist for a real tablet.

## What Octet does now (515ed13)

- The canvas reads pointer events with no look at the pointer's type. `pointerType` is read nowhere in the editor
  (src/Editor.tsx:8964 only makes a mouse press for a toolbar drop; src/Tooltip.tsx:52 skips touch).
- onPointerDown (src/Editor.tsx:5391): button 1 pans the view (5396), every other button but 0 returns (5402). A pen
  tip (button 0) already draws as the mouse does. A pen eraser end (button 5, buttons 32) does nothing. A pen side
  button (button 2) does nothing here and relies on the browser's own contextmenu event (onContextMenu, 5362).
- Every finger is a separate press. A second finger starts a second drag over the first, and lifting either one ends
  the drag. There is no two-finger pan or pinch.
- onPointerCancel is onPointerUp (src/Editor.tsx:10218): a cancelled touch commits its drag.
- Hold still for HOLD_MS (350 ms, src/tools.tsx:104) with any drawing tool and Select takes over (startHold, 5603).
  There is no long press for the Actions menu.
- Zoom: wheel and Ctrl/⌘ + wheel, and WebKit's trackpad gesture events on the Mac (src/Editor.tsx:9165-9201,
  zoomAt keeps the point under the pointer and sets the view's `pinch` flag for 150 ms).
- `.canvas` has `touch-action: none` (src/editor.css:68), so a touch screen sends raw pointer events there. The rest
  of the window has no `touch-action`. On Windows the page cannot pinch-zoom anyway: wry 0.57.0 (Cargo.lock) calls
  `SetIsPinchZoomEnabled(zoom_hotkeys_enabled)` and Octet never turns zoom hotkeys on. WebKitGTK has no such switch.
- Hit tolerances are fixed for every pointer. Atoms 0.3 and bonds 0.2 bond lengths (src/edit.ts:55-58; 0.3 is 7 px at
  the opening zoom), arrows, shapes and cycle arcs 5 px (3949, 3978, 3985), captions 3 px (4173), labels 2 px (4290),
  table edges 4 px (4121), handles 8 px (5259, 5281), resize 6 px (5321), rotation 11 px (5330), centre mark 8 px
  (5333). Click or drag is decided at 4 px of movement in about 15 places in onPointerMove.
- Sizes: tools 32 px, menu options 36 px, list rows 30 px (brand tokens). The palette's active-tool mark is a fixed
  32 px square moved in fixed 36 px steps (src/tools.tsx:800, src/editor.css:516). ContextMenu places itself with a
  fixed 32 px row (src/Menu.tsx:317). Nothing reacts to `pointer: coarse`.
- Home already handles touch: a finger drag scrolls and a cancelled press puts the selection back (src/Home.tsx:489).

Gap confirmed: pen extras, every touch behaviour beyond one finger, coarse hit tolerances and coarse targets are
missing.

## What ChemDraw does

Sources checked: ~/octet-research/notes/chemdraw26-inventory.md (3.2 Context menus, View zoom lines 444-448, Eraser
821-826), chemdraw-inventory.md, chemdraw-toolbar.md (pop-outs 84, Eraser 152), chemdraw-hotkeys.md, chemdraw-gaps.md,
gaps.md, help26/ (26.1 and 22.2 help text), menus/live-menus.md, spec/ (CDXML public spec).

- No source has a pen, touch, tablet, stylus, gesture or pinch option: no preference, menu item, palette option,
  dialog, context menu item, hotkey or CDXML attribute. CDXML stores no input device data.
- What a pen and a finger reach in ChemDraw are its mouse functions: right-click context menus on every object
  (inventory 3.2), View > Magnify, Reduce, Actual Size and Show Document (zoom), the Eraser (click deletes, a drag
  deletes all it crosses), and press-and-hold on a palette button to open its pop-out.
- ChemDraw is a classic Win32 and Cocoa program, so on a Windows tablet it gets Windows' own mouse emulation (tap is
  a click, the pen's side button and press-and-hold are a right-click). That is general Windows behaviour. It is not
  checked on a tablet here.

So every option ChemDraw gives is a mouse option, and Octet maps each one onto the pen and the finger below. Octet
adds two-finger pan and pinch, the eraser end and palm rejection, which ChemDraw does not have.

## Jobs

1. **Pen draws as the mouse.** The pen tip does what the left button does with every tool and on every handle
   (list under Siblings): bonds, chains, rings, templates, arrows, shapes and Pen curves, box and lasso, text
   placement, handle drags, hold-to-Select. Pressure, tilt, twist and contact size are never read. A pen tap is a
   click: movement under 6 px from the press is not a drag. Done: WebKit check draws the same drawing from a pen
   sequence as from the same mouse sequence; node check feeds junk pressure and tilt values.
2. **Eraser end.** A press with the pen's eraser end (buttons 32 or button 5) erases with the Eraser for that stroke:
   a tap removes what is under it, a rub removes all it crosses, as the Eraser tool does, in one undo step. The tool
   in hand comes back on release. Done: WebKit check erases a bond with an eraser stroke while the Bond tool is in
   hand, and the Bond tool is still pressed after.
3. **Side button.** A press with the pen's side button (button 2) opens the Actions menu at the pen, as a right-click
   does, once. Done: WebKit check opens one menu from a side-button press, also when a contextmenu event follows it.
4. **One finger.** With no pen used in the window yet, one finger does what the mouse does: a tap is a click, a drag
   is a drag with the tool in hand. The press waits until it is clearly one finger (it moves 10 px, or lifts). Done:
   node checks of the gate; WebKit check draws a bond with a finger tap and with a finger drag.
5. **Two fingers.** Two fingers pan and pinch-zoom about their midpoint, on every tool, within the zoom limits. The
   point of the drawing under the midpoint stays under it. A pan or zoom is never an undo step. A second finger that
   lands after the first one started a drag cancels that drag as Escape does (nothing drawn, the selection as it
   was). The page itself never zooms. Done: node check of the pinch maths; WebKit check of the view after a pinch
   and of the drawing after a late second finger.
6. **Long press.** A finger held still for HOLD_MS opens the Actions menu there, as a right-click does, with the same
   hold ring the mouse sees. Lifting the finger keeps the menu open and chooses nothing. Done: WebKit check.
7. **Palm rejection.** While a pen is down or was seen over the canvas in the last 500 ms, touches on the canvas are
   ignored. A pen press cancels a finger's press that is under way (a palm that landed first). After a pen has
   touched or hovered over the canvas once, touch only moves the view in that window: one finger pans, two fingers
   pan and zoom, a tap and a long press do nothing. Done: node checks; WebKit check of a palm tap after pen hover.
8. **Coarse hit tolerances.** Pen and touch hit atoms, bonds, text, arrows, shapes and every handle from further
   away; the mouse keeps the exact values it has now. Done: node check that the mouse values are unchanged for
   every zoom, and that an atom never covers the middle of its bonds.
9. **Coarse targets.** When the main pointer is coarse (`pointer: coarse`, a tablet with no keyboard cover), the
   palette's tools, the options in its strips and the rows of the Actions (context) menu are 44 px. Done: look sweep
   with the coarse attribute set: every control matches its token, the active-tool mark sits on the active tool,
   light and dark.
10. **Mouse and trackpad unchanged.** Every mouse and trackpad behaviour, size and timing stays as it is. Done: the
    same scripted mouse session gives the same drawing on this branch and on 515ed13; npm run look matches as on
    515ed13; mouse hover on 40 paclitaxels is no slower (Speed).

## Rules every part keeps

- The mouse path does what it does now. The only new work on it is reading `pointerType` and a pointer-id compare.
- One pointer presses at a time on the canvas. Moves and releases from other pointers do not move that press. A pen
  press is the one exception: it cancels a finger's press.
- A cancel (second finger, pen over a palm, pointercancel from a pen or a finger, the window losing focus) is
  Escape: nothing commits, the tool in hand comes back, the selection is as it was before the press. A mouse
  pointercancel keeps today's release.
- Each drawn thing is one undo step, as with the mouse. View changes are never undo steps.
- No new default keys, no new settings, no new words in the UI.
- Sizes come from tokens (brand/tokens.css and tokens.json, kept in step). Every menu stays src/Menu.tsx.
- Treat event data as hostile: NaN or infinite coordinates, zero distance between fingers, unknown pointer types
  (read as mouse), ids reused at once, a pointerup that never comes.

## Design

The gesture logic is pure TypeScript in a new src/touch.ts, with no React and no DOM, so node checks drive it with
synthetic event sequences (pointerId, pointerType, isPrimary, button, buttons, pressure, time). Editor.tsx feeds it
pen and touch events and does what it returns: press, move, release, cancel, view (pan and zoom), menu, ring.

- **The touch gate.** States: idle, waiting (one finger down, nothing done yet), pressing (the press went to the
  editor), view (two fingers), menu (long press fired), dead (touches that are ignored until all lift). A waiting
  finger becomes a press when it moves 10 px (the press goes in at the point where the finger landed, then the move)
  or when it lifts (press, then release a frame later, the way a toolbar drop presses now at src/Editor.tsx:8964).
  It becomes a menu at HOLD_MS. A second finger while waiting or pressing starts the view gesture. The editor gets
  the press as a PointerEvent on the canvas, so every tool's press code runs as it is.
- **Why one finger draws (decision).** A touch screen with no pen has only the finger to draw with, and Schramm's
  ask is a finger that can reach the targets. Two fingers always pan, so the view is never out of reach. Once a pen
  is used, the pen draws and the finger only moves the view, which keeps a resting palm from drawing (Excalidraw
  switches the same way). This lasts for the window's life. A Settings switch to change it is cut until the tablet
  run (see Scope cut).
- **Why a long press opens the menu for touch (decision).** Windows, iPadOS and Android all open a context menu on a
  long press, and a finger has no other way to right-click. Hold-to-Select stays for the mouse and the pen on every
  tool. The two holds use the same time (HOLD_MS) and the same ring. This is the one place the touch screen differs
  from the mouse, and it follows the platform.
- **Why the press waits.** If the first finger acted at once, a two-finger pan would first clear the selection, and
  with the Eraser it would delete what it landed on. Waiting until 10 px or the lift costs nothing visible: a drag
  shows only after it moves, and a click acts on release today. A late second finger still cancels, for the rare
  case where the first finger was already drawing.
- **Pinch maths.** From the two fingers' last and new positions: the zoom factor is the new distance over the last
  (1 when either is under 1 px or not finite), and the pan is the midpoint's move. The editor applies them with the
  same zoomAt the wheel uses (lifted out of the wheel effect so both call it), so the limits, the `pinch` flag and
  the text scaling during a zoom are the same as for a trackpad pinch. A gesture start stops a running glide, as
  gesturestart does.
- **Slop.** Mouse 4 px (the existing literals stay). Pen 6 px and touch 10 px: the gate drops pen moves within 6 px
  of the press point while the tip is down, so the 4 px code downstream sees a drag only past 6 px, and the hold
  ring is not cancelled by a shaking hand. Values to tune on the tablet run.
- **Reach.** A ref holds the reach of the last pointer event: mouse 1, pen 1.5, touch 2.5. Every px tolerance in the
  canvas hit code multiplies by it. Tolerances in bond lengths get a screen floor of 6 px x reach for pen and touch,
  capped so an atom never covers the middle of its bonds (atoms at most 0.4 bond, bonds at most 0.5 bond). With
  reach 1 every function returns exactly the value it returns now. The checks are in the order they are now: where
  two targets overlap the first checked still wins.
- **Pen side button.** onContextMenu stays the one way in; its body becomes openMenu(x, y) so the long press calls
  it too. A side-button press records a pending menu; if no contextmenu event came by 100 ms after its release, the
  gate opens it. A contextmenu event within 800 ms of a touch is ignored (the gate owns the long press), so a menu
  never opens twice.
- **Eraser end.** It goes first in onPointerDown, before the button check and before handles, selection and
  resize: it saves the tool in `spring` (as hold-to-Select does), puts the Eraser in hand and starts the Eraser's
  own drag. release() gives the tool back.
- **Coarse targets.** src/main.tsx sets `data-pointer="coarse"` on the document element from
  `matchMedia("(pointer: coarse)")` and follows its change event (each window loads main.tsx). A new token
  `--size-touch: 44px` (WCAG 2.5.5 and Apple ask for 44; Windows' touch guidance for about 40). Under
  `[data-pointer="coarse"]`, `.palette` and `.context-menu` set `--size-tool`, `--size-cell` and `--size-row` to
  `--size-touch`, so every control of one kind inside them stays one size. The active-tool mark and its steps use
  the tokens (calc) in place of 32 and 36, ContextMenu reads its row height from the token, and lookwatch reads each
  token at the control it measures. The primary pointer decides, so a touch-screen laptop used with its trackpad
  keeps the dense layout.
- **Page zoom.** `.editor` gets `touch-action: pan-x pan-y` (panels still scroll with a finger; no pinch or double-tap
  zoom of the page), `.canvas` keeps `none`. No Rust change: WebView2's page pinch is already off (above).

## Siblings (consistency pillar)

Each one is in the WebKit checks with a pen sequence and a finger sequence, or says why not.

- Tools: Select (box and lasso), Bond, Chain, Ring, Template, Text, Arrow, Shape (with the Pen curve and its
  close-by-first-point), Bracket, Symbol, TLC, Gel, Plasmid, Table, Cycle, Map, Orbital, Fragment, Mass spec,
  Synthesis, Retro, Eraser, crosshair drag. Pen and one finger: as the mouse. Long press: the menu on every tool.
- Handles: arrow ends, bend, head, width and middle point, Pen-curve anchors and their handles, resize sides and
  corners, rotation, centre mark (Option-drag stays mouse and keyboard), cycle lead, trail, bow and side-arrow
  handles, table edges, TLC spots, lines and lane ticks, page edge (fit). Each takes the coarse reach.
- Hold-to-Select: every tool, mouse and pen. Touch: the long press menu (decision above).
- Context menu: right-click, Control-click, Menu key, pen side button, long press. One function opens it.
- Zoom: wheel, Ctrl/⌘ + wheel, trackpad pinch, touch pinch, Magnify, Reduce, Actual Size, Fit. One zoomAt and one
  set of limits.
- Pan: scroll, middle-button drag (also a pen's second side button, which Windows reports as button 1), two fingers,
  one finger after a pen.
- Erase: Eraser tool, eraser end, Delete. Same removal code (and #140's fix when it merges).
- Undo, copy, paste, duplicate, flip, rotate, align, delete, colour: reached through the long press menu and the
  side button as through right-click; no new paths.
- Dark mode: the hold ring, menus and coarse palette use tokens; look sweep runs light and dark.
- Home: already scrolls by finger and puts the selection back on a cancel. Kept as it is.
- Spectrum and Mass spec plots: wheel zoom of their own; pinch there is cut (see Scope cut). One finger acts as the
  mouse there.
- Palette pop-outs: tap the tool, tap again for its strip, tap an option. Press-hold-slide with a finger is cut.

## MCP surface

None. Pen and touch are ways the user's hand reaches the canvas, and every action they lead to (draw, erase,
select, the Actions menu's commands) is already an MCP function (draw, change, run_command). Zoom and pan arrange the
user's screen. The coarse sizes arrange the screen. No MCP file changes, so the MCP review is not touched.

## Files and formats

No file format changes: .oct, CDXML, CDX, MOL, SDF, RDF, the clipboard and every export are as on 515ed13. A drawing
made with a pen or a finger is the same data as one made with a mouse, so Octet 1.1.2 and ChemDraw open it as they
open any drawing. No settings keys are added, so 1.1.2 reads the settings file as before.

Code: src/touch.ts (new), src/touch.check.ts (new), src/Editor.tsx (gate wiring, eraser end, side button, reach,
zoomAt, openMenu, pointer-id rule, pen and touch pointercancel), src/main.tsx (data-pointer), src/tools.tsx (active
mark from tokens), src/Menu.tsx (row height from the token), src/lookwatch.ts (token at the control),
src/editor.css, brand/tokens.css, brand/tokens.json, brand/BRAND.md (one Size row), scripts/look/touch.js and
scripts/look.mjs (a `touch` argument). No Rust, no dependency.

## Stress list

1. Two fingers land 120 ms apart with the Bond tool: no bond, the view pans and zooms, the undo list is unchanged.
2. A second finger lands after the first has dragged a bond 3 cm: no bond, no undo step, the selection as before,
   then the pinch.
3. A second finger lands while the first moves a selection: the objects go back where they were.
4. Two fingers land on a TLC spot with the Eraser in hand: nothing is erased.
5. Three or four touches (two fingers and a palm): the first two drive the view; the others do nothing, also when
   they lift first.
6. One finger of a pinch lifts and lands again: the gesture ends at the lift, the other finger does nothing until
   all lift, the new contact starts fresh with no jump.
7. Pinch past the zoom limits (0.25 to 8, widened for page fits): the zoom stops at the limit, the pan goes on, the
   point under the fingers stays put up to the limit.
8. Both fingers on one spot, or coordinates NaN or infinite: factor 1, no move, the view is never NaN.
9. pointercancel during a finger or pen drag (an edge swipe, the OS taking the pen): nothing commits. Mouse
   pointercancel: as now.
10. A pointerup that never comes (the finger leaves the window), then a new touch with a new id: the gate drops
    the stale pointer on blur, lostpointercapture or a new primary pointer; no stuck drag.
11. A palm lands and starts a press, then the pen comes down: the palm's press is cancelled, the pen draws, the undo
    list holds the pen's bond only.
12. Pen hovering, palm resting and moving: no hover marks, no drawing, no pan.
13. Eraser end on a selected structure, on a resize handle and on the rotation handle: it erases what is under it
    and never moves, scales or turns.
14. Eraser end while a caption is being typed: the caption closes as on a click away, the stroke erases, the Text
    tool comes back.
15. Side button on an atom, with the browser's own contextmenu event arriving and with none arriving: one menu.
16. Pen contact with pressure 0, pressure 1.7, tilt 90, twist 359, width 0: the same result as a mouse press.
17. Ten finger taps a second on one atom with the Chain tool, and a pen double-tap on an atom with Select: one chain
    per tap, and the label opens once, as with the mouse.
18. Long press on empty canvas, then a drag without lifting: the menu stays, nothing is drawn.
19. A finger tap while a context menu is open: the menu closes, as with a mouse click away; the tap then does what a
    mouse click there does now.
20. Five bonds by finger with pinches between them, then ⌘Z five times: the five bonds go, the zoom stays; ⌘⇧Z
    brings them back.
21. A mouse press during a finger's drag on a touch-screen laptop: the mouse press is ignored until the finger
    lifts.
22. Zoom extremes with touch reach: at 8x the floors do nothing (0.3 bond is bigger); at 0.25x a tap between two
    close atoms hits the nearer one, and a tap in the middle of a benzene ring hits nothing.
23. A turned caption and a flipped structure: the coarse reach applies in the caption's own turned box.
24. An MCP edit lands during a pinch, and an MCP delete removes the structure a finger is dragging: the view goes on
    and the drag ends as it does for a mouse drag now; undo order is unchanged.
25. Pen used in window A: window B's finger still draws until a pen is used in B (per window).
26. Unknown pointerType (empty, or a name no engine uses yet): read as mouse.
27. Coarse palette on a 768 px tall window: two columns as now when too tall, the active mark on the active tool,
    light and dark.
28. The keyboard cover comes off (pointer becomes coarse) with a drawing open: the sizes change, nothing else.

## Acceptance

| Check | Covers |
| --- | --- |
| node src/touch.check.ts: gate sequences | jobs 1, 4, 5, 6, 7; stress 1, 2, 3, 5, 6, 8, 9, 10, 11, 12, 16, 18, 21, 25, 26 |
| node src/touch.check.ts: pinch maths (midpoint point fixed, limits, NaN) | job 5; stress 7, 8 |
| node src/touch.check.ts: reach (mouse values exact for 10 000 random zooms; floors; caps) | jobs 8, 10; stress 22 |
| node src/touch.check.ts: timing of the gate's mouse pass-through (budget and growth, as perf.check.ts) | job 10 |
| WebKit scripts/look/touch.js on :1476: finger tap and drag, staggered two fingers, late second finger, Eraser + two fingers, long press, pen eraser end, side button, palm after hover, finger after pen, pointercancel, pen jitter tap, every sibling tool with pen and finger | jobs 1 to 7; stress 1 to 4, 9, 11 to 15, 17 to 20, 23 |
| WebKit mouse session, branch :1476 against 515ed13 :1477: CanvasAccess list and drawing markup equal | job 10 |
| WebKit timing (Speed) | job 10; stress 24 speed side |
| npm run look on :1476, light and dark | jobs 9, 10 |
| look sweep with `data-pointer="coarse"`, light and dark | job 9; stress 27, 28 |
| npm test (tsc, every check, ui.check.ts token rules) | all |
| Real-tablet run (below) | what needs hardware |

## Speed

The mouse's pointermove is the hot path. Measure in WebKit (the look runner) with 40 paclitaxels in one drawing and
with a 500-residue peptide: 2000 mouse moves over the drawing (hover, hit testing on each), and 2000 moves of a box
drag. Branch (:1476) against 515ed13 (a throwaway worktree on :1477, removed after), five runs each, interleaved,
medians compared; a slower median is run again alone before it counts. Also against v1.1.2 for the record. Pinch on
the same drawings: 200 two-finger moves against 200 Ctrl + wheel steps on the branch (same zoomAt). The node check
holds the gate's own cost under a budget.

## Real-tablet checklist for Sam

Windows tablet with a pen (Surface or similar), keyboard cover off:

1. Pen: draw a bond, a chain, a ring, an arrow, a lasso, place text, drag an arrow's end. Taps are clicks (no short
   stray bonds).
2. Pen held still on empty canvas with the Bond tool: Select takes over; no Windows right-click menu as well.
3. Side button on an atom: the Actions menu, once. Eraser end rubbed over bonds: they go, the Bond tool comes back.
4. Before any pen use in a new window: finger tap and drag draw; two fingers pan and pinch about the fingers;
   pinching on the toolbar or a panel never zooms the page.
5. Long press: the menu; lifting chooses nothing.
6. After the pen: rest a palm while drawing. Nothing from the palm. One finger pans.
7. Tools and menu options are 44 px with the cover off and 32 px with it on (a restart may be needed).
8. Text tool tap: does Windows' touch keyboard open?
9. A pinch on a busy drawing is smooth.

Linux touch screen, if one is to hand: steps 4 to 7. Mac with an iPad (Sidecar) or a Wacom: step 1.

## Scope cut

- Pinch and two-finger pan on the Spectrum and Mass spec plots: they have their own zoom code; one finger acts as
  the mouse there for now.
- 44 px targets in the Actions panel, dialogs, Settings, Home and the spectrum panels: each needs its own layout
  pass. 1.2 does the palette, its strips and the Actions menu, which holds the panel's actions.
- A Settings switch for "a finger draws after a pen": waits for Sam's call after the tablet run.
- Press-hold-slide on the palette with a finger: a touch is captured by the button it lands on, and the fix cannot
  be proven without a touch screen. Tap, tap works.
- The eraser circle while the eraser end hovers: depends on what each digitiser reports.
- Palm rejection off the canvas: the digitiser's own rejection covers the toolbar and panels for now.
- Pressure, tilt and line width from the pen: ChemDraw has none, and drawings keep ACS widths.
- Reading a hand-drawn sketch as a structure: a project of its own.
- Touch on Linux and the pen on the Mac go as far as WebKitGTK and WebKit report pointer types; no hardware here.

## What's New (draft lines)

- When you draw with a pen on a tablet, the pen draws as the mouse does. Its eraser end erases, and its side button
  opens the Actions menu.
- To move or zoom the drawing on a touch screen, drag or pinch with two fingers.
- To open the Actions menu with a finger, touch and hold.
- After you use a pen in a window, a finger only moves and zooms the drawing there, so your hand can rest on the
  screen.
- On a tablet with no keyboard, the tools and the options in menus are larger.
