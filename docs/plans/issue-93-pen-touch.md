# Pen and touch input on tablets (#93)

Plan, 18 Nov 2026 (second version), for Sam's yes. Branch item/93-pen-touch from release-1.2-mcp 515ed13 (161 of 161
check files pass there). Schramm asks for pen drawing at the bench and in a seminar on a Windows tablet, and for targets
big enough for a finger. Sam (9 Nov): pen and touch need tests on real tablets. This plan builds what can be proven on
a Mac with no touch screen and no pen, and ends with a short checklist for a real tablet.

Changes from the first version (ee1d469): the stress list is 20 cases, the branch's state is written down, and three
design points are added (the page's touch-action on the root, touch sizes for every options menu, new tools from other
branches).

## What Octet does at 515ed13

- The canvas never reads `pointerType` (src/Tooltip.tsx:52 skips touch for tips, nothing else does).
- onPointerDown (src/Editor.tsx:5391): button 1 pans (5396), every other button but 0 returns (5402). A pen tip already
  draws as the mouse does. The eraser end (button 5, buttons 32) does nothing. The side button (button 2) relies on the
  browser's contextmenu event (onContextMenu, 5362).
- Every finger is a separate press: a second finger starts a second drag, and lifting either ends it. No pinch.
- onPointerCancel is onPointerUp (10218): a cancelled touch commits its drag.
- Hold still for HOLD_MS (350 ms, src/tools.tsx:104) and Select takes over. No long press for the Actions menu.
- Zoom: wheel, Ctrl/⌘ + wheel and WebKit's trackpad gesture events (9179-9201).
- `.canvas` has `touch-action: none`. On Windows the page cannot pinch-zoom: wry 0.57.0 calls
  `SetIsPinchZoomEnabled(zoom_hotkeys_enabled)` (webview2/mod.rs:660), default false, and Octet never sets it.
  WebKitGTK has no such switch.
- Hit tolerances are one set for every pointer: atoms 0.3 and bonds 0.2 bond lengths (src/edit.ts:55-58), arrows and
  shapes 5 px, captions 3 px, handles 6 to 11 px. Click or drag splits at 4 px.
- Sizes: tools 32 px, menu options 36 px, rows 30 px (tokens). The palette's active mark moves in fixed 36 px steps
  (src/tools.tsx:800) and ContextMenu assumes a 32 px row (src/Menu.tsx:317). Nothing reads `pointer: coarse`.
- Home already scrolls by finger and puts the selection back on a cancelled press (src/Home.tsx:489).

## State of this branch (18 Nov, 10:40)

- 51a5248, committed: src/touch.ts (the Gate, pinch, viewAfter, reachIn, REACH, SLOP). Editor.tsx: the gate creation
  (1068), onDown, onMove, onUp and onCancel (9178-9208), follow (9238), eraseWith (9312), zoomAt lifted out of the
  wheel effect (9348), openMenu shared by right-click, side button and long press (5380), the coarse reach for atoms
  and bonds (4305-4308), and `reach.current` read at 32 places in the hit code. `.editor` has `touch-action: pan-x pan-y` (src/editor.css:57).
  src/touch.check.ts: 141 asserts, passes in 0.5 s.
- Working tree, not committed (the first build run, last written 10:34): job 9 (token `--size-touch: 44px` in
  tokens.css, tokens.json and BRAND.md; `data-pointer` in src/main.tsx; the coarse rule in editor.css; the active mark
  and pin slot from tokens in tools.tsx; ContextMenu's row from the token; lookwatch reads each token at the control),
  `.name-recent` added to ui.check's NOT_CONTROLS (its 44 px row now equals a token), scripts/look.mjs takes a `touch`
  argument, scripts/look/touch.js (444 lines, about 50 checks), touch.check timing in batches, and the finger's first
  move after its press. tsc, touch.check and ui.check pass on the working tree.
- Not proven: no record of a WebKit run of touch.js, of the mouse session against 515ed13, of the speed runs, or of a
  full npm test on this tree.
- Not built: the three design points marked "added" below.

Gap confirmed. The build stage reviews the working-tree diff against this plan, keeps what meets it, adds the missing
parts and proves all of it. It does not start again.

## Finish for release 1.1.3 (19 Nov)

Sam put every built item in 1.1.3. The branch is rebased onto release-1.1.3 f06d1b4 (1.2 with the AI switch off).

- Conflicts: the `.editor` rule (the release's `--ruler` stays, the touch-action moves to `:root` as planned), the keys
  import (`menuKeysVersion`) and `shapeAt` (the release's free symbols are hit in their box; the line test takes the
  reach).
- The release's hit code: a reagent table's line (`gridLineAt`, 3 px) and the centre mark's snap to an atom (8 px)
  take the reach too. touch.check now fails on any px value over the zoom in Editor.tsx without `reach.current`, except
  the few that snap, place a mark or start a drag, so a hit test merged later (item/85-measurements' `measureAt`)
  fails there until it takes the reach.
- touch.js had never run in full. Its fixes: each group of checks runs in a page of its own (a finger only pans once
  a pen is used, and the web view keeps the settings), the tools' options are set first, strokes on a bond find it
  from its box, a key goes in once (each ⌘Z was three Undos), a finger leaves as it lifts, a tap with Chain opens Add
  Chain (ChemDraw's), so the ten quick taps use Bond, and the lasso runs before Mass spec analysis hides the Actions
  panel the check reads.
- Review of 00e1e7a: in Chrome (the engine of Windows' web view) a finger's tap drew nothing, and a finger drag that
  started on a drawn object's element stopped. Chromium sends lostpointercapture after each pointerup, and to the
  element a finger landed on when the canvas takes the finger's capture. The canvas's handler stopped the press for
  both. It now stops a press only when the canvas itself lost a pointer the gate still follows. That also mends a
  quick tap of the eraser end, which lifts before its press goes in. touch.js sends lostpointercapture after each
  pointerup, as a browser does, and taps the eraser end quickly. scripts/look/chrome-touch.mjs sends real touch and
  pen input to headless Chrome over the DevTools protocol: `npm run look -- <url>/?editor touch` runs it after the
  WebKit pages, and `look-only=chrome` runs it alone.
- Review of 3430216 (on release-1.1.3): in Chrome, a finger held for the Actions menu that drifted a few px and lifted
  over an option ran it (Chromium sends a click for the lift), and a finger's tap that opened a text field (the
  Sequence tool's name field, a new table's first cell) lost the focus to Chromium's mousedown for the tap, which
  comes after the gate's press. Every right-click menu (ContextMenu) now leaves out a finger's click with no press in
  the menu before it. The canvas cancels a finger's pointerdown, so Chromium sends no mousedown or mouseup for its tap
  (click and double-click still come), and the gate's press moves the focus as the mouse's mousedown does. A finger's
  leave as it lifts waits a frame, so its tap's release still has the point: the Sequence tool's structure lands where
  the finger tapped. chrome-touch.mjs checks both (18 pass; 8 fail on 3430216), and
  `OCTET_STRESS_URL=<url> node src/touch.check.ts` runs it.
- Review of ba2bbfe3: in Chrome, a finger's tap left the hover mark on the atom it tapped or drew, so a key such as o
  then changed that atom. The finger's leave waited a frame for the tap's release, which put the hover back, and it
  read the drag from before that release. A finger's leave now clears the hover whatever drag it reads. Chromium's
  dblclick for a finger's double tap can come before the second tap's release, and the release then picked the text
  the double-click had opened for typing. A finger's dblclick now goes in after that release, as the mouse's comes
  after its mouseup. chrome-touch.mjs checks both. With every tool, a finger's tap on an atom (and with Bond a tap on
  the canvas and a drag) leaves no mark, and o then does what it does after a mouse that left the canvas. With Select,
  a double tap on an atom, a bond, a text and an arrow does what the mouse's double-click does. Results are in the
  table below.
- Found on the way, not changed: the review's Atom label after a mouse double-click on an atom came from Return over
  the atom still under the mouse (Return types the label of the atom under the pointer). With the mouse off the
  canvas, Return on the structure the double-click picked puts the keyboard's hotspot on it, as it does after a
  finger's double tap. Chromium sends the mouse no click or dblclick for a press that redraws what it landed on (a
  picked arrow lifted for a move). So on Windows a mouse double-click on a reaction arrow picks the arrow, not its
  reaction. A finger's double tap picks the reaction, as the double-click code does. The mouse is unchanged here and
  needs an item of its own. (Done in the review of 48511faf, below.)
- Review of 48511faf, all four findings fixed:
  - After a pen, a finger's double tap still edited the drawing (a text opened for typing, a structure was picked, a
    table cell opened), though the finger only pans. A palm's double tap while the pen was held did the same. Chromium
    sends a dblclick for those taps, and the check that delays a finger's dblclick read only whether a finger had the
    press. Each press on the canvas now says whether it was a finger's, and the gate's press for that finger marks it
    pressed. A dblclick after a finger's press the gate kept from the editor does nothing.
  - In Chromium a mouse double-click on a resize handle or the rotation handle opened nothing, and on a reaction arrow
    picked only the arrow. The same on release-1.1.3. Chromium sends no click, so no dblclick, when the press redraws
    the element it landed on. The canvas now sends a dblclick after a second release (mousedown and mouseup with
    detail 2 on the canvas) that has none after it. The mouse and the pen now open Scale… and Rotate… and pick the
    reaction, as a finger's double tap does. In 69 double-click cases (23 places, mouse, finger and pen) only these
    six change against 48511faf.
  - A finger's long press could open a second menu (Turn, flip and arrange's own). Chromium sends a pointerover to an
    element that appears under the mouse at rest, and the Actions menu opened its option's own menu on pointerover.
    An option with more now opens its own menu on pointermove. A tap on it still opens it, and so do the mouse and the
    pen moving onto it.
  - A two-finger pan changed the zoom by rounding (1.25 to 1.2500000000000022). Chromium sends each finger's move in
    turn, so the fingers' distance changes and changes back, and the zoom steps did not multiply back to 1. The gate
    now sends two fingers' pan and zoom as sums since they started (n), and pinchView applies them to the view at that
    start. Fingers that end as far apart as they started leave the zoom as it was. At a zoom limit it starts again
    from there, so the way back zooms at once, as before. One finger's pan after a pen is still a step.

Results of the 48511faf review:

| Check | Result |
| --- | --- |
| C1 node src/touch.check.ts, and with `OCTET_STRESS_URL` | passes; Chrome passes 62 checks. The node checks add a two-finger pan sent one finger at a time (the zoom stays 1.25, the steps' sum is not), the way back from a zoom limit, and 2000 random gestures |
| C2 `npm run look -- <url>/?editor touch` | 185 checks pass (123 WebKit, 62 Chrome), none fail |
| C2 Chrome checks on 48511faf | 50 pass, 12 fail: two long presses that open a second menu, the two-finger pan's zoom, the mouse's double-click on a resize handle, the rotation handle and a reaction arrow, and six double taps after a pen or by a palm |
| C3 mouse session in WebKit | the same drawing as 48511faf |
| C3 Chrome, 69 double-clicks (23 places; mouse, finger and pen) | 63 the same as 48511faf. The six that change are the mouse's and the pen's on the two handles and the reaction arrow, which now do what the finger's does. One dblclick reaches the canvas for a double-click on an atom, a text, empty canvas and a resize handle |
| C3 Chrome, an option with more in the Actions menu | opens its own menu when the mouse or the pen moves onto it and when a finger taps it, as on 48511faf |
| C5 `npm run look` (the sweep, WebKit) | every control matches, 34 places. From an origin with no storage the sweep does not reach Home or Home's examples after the welcome page's Skip, on 48511faf too |
| C7 npm test | 224 of 224 check files pass |

Results of the ba2bbfe3 review, against release-1.1.3 e5af127:

| Check | Result |
| --- | --- |
| C1 node src/touch.check.ts, and with `OCTET_STRESS_URL` | passes; Chrome passes 48 checks |
| C2 `npm run look -- <url>/?editor touch` | 171 checks pass (123 WebKit, 48 Chrome), none fail. The finger's drag with Atom map still draws as the mouse's |
| C2 Chrome on ba2bbfe3 | 35 pass, 13 fail: the double tap on a text, and a finger's tap that leaves its mark with 12 tools |
| C3 mouse session in WebKit | the same drawing as e5af127 |
| C3 Chrome, the mouse and the pen in 120 runs of 67 scenarios | the same as e5af127, but for a finger after a pen, which pans (the palm rule) |
| C7 npm test | 224 of 224 check files pass |

Results on f06d1b4 plus this branch:

| Check | Result |
| --- | --- |
| C1 node src/touch.check.ts | passes |
| C2 `npm run look -- <url>/?editor touch` (8 pages) | 119 checks pass, none fail. One full run stopped once at the time limit in the pen page while the window was covered (WebKit pauses frames); that page alone passes. After the lost-capture fix, each page alone: 120 pass, none fail. On 00e1e7a with lostpointercapture after each pointerup, the taps page fails 2 (ten quick taps, a tap on an atom with Chain) |
| C2 Chrome, real input (`look-only=chrome`) | 10 pass, none fail. On 00e1e7a 3 fail: a finger's tap, its tap on an atom, its drag that starts on a bond |
| C3 mouse session, branch against f06d1b4 | the same drawing |
| C4 40 paclitaxels, 2000 hover moves and a 2000-move box drag, 5 runs each, interleaved | medians: hover 948 ms against 946 ms, box drag 167 ms against 170 ms (noise) |
| C5 `npm run look`, fine; coarse light and dark; `look-coarse` at 768 px tall | every control matches; 24 coarse checks pass |
| C6 `git diff f06d1b4 --stat` | no format, MCP, settings or Rust file |
| C7 npm test | 190 of 190 check files pass. A run at a load average near 38 (other agents) put three timing checks over their limits (dictionary, layout, lowinmac-stress); each passes alone and in the next full run |
| C8 real tablet | not run: no hardware here |

## What ChemDraw does

Sources checked: ~/octet-research/notes/chemdraw26-inventory.md (3.2 Context menus; View zoom, lines 444-448; Eraser),
chemdraw-inventory.md, chemdraw-toolbar.md (pop-outs; 3.6 Eraser, line 152), chemdraw-hotkeys.md, chemdraw-gaps.md,
gaps.md, chemdraw-accessibility.md, help26/ (26.1 and 22.2 help text), menus/ (live-menus.md, cocoamain.txt), spec/
(public CDXML spec). Limits from ~/octet-research/private/CLAUDE-research.md.

- No source has a pen, touch, tablet, stylus, gesture or pinch option: no preference, menu item, palette option,
  dialog, context menu item, hotkey or CDXML attribute. CDXML stores no input device data.
- What a pen and a finger reach in ChemDraw are its mouse functions: right-click menus on every object, View >
  Magnify, Reduce, Actual Size and Show Document, the Eraser (a click deletes, a drag deletes all it crosses), and
  press-and-hold on a palette button for its pop-out.
- On a Windows tablet ChemDraw gets Windows' own mouse emulation (a tap is a click; the side button and a held pen are
  a right-click). That is general Windows behaviour, not checked on a tablet here.

Octet maps each of these mouse options onto the pen and the finger. Two-finger pan and pinch, the eraser end and palm
rejection are Octet's own.

## Jobs

1. **Pen draws as the mouse.** The pen tip does what the left button does with every tool and handle (Siblings).
   Pressure, tilt, twist and contact size are never read. A pen tap is a click: moves under 6 px from the press do not
   count. Done: WebKit draws the same drawing from a pen sequence as from the mouse sequence; node feeds junk values.
2. **Eraser end.** A press with the eraser end (button 5 or buttons 32) erases with the Eraser for that stroke, in one
   undo step. The tool in hand comes back on release. Done: WebKit erases a bond with the Bond tool in hand, and the
   Bond tool is pressed after.
3. **Side button.** A side-button press (button 2) opens the Actions menu at the pen once, as a right-click does.
   Done: WebKit opens one menu, with and without a contextmenu event after it.
4. **One finger.** With no pen used in the window yet, one finger does what the mouse does. Its press waits until it
   moves 10 px or lifts. Done: node gate checks; WebKit draws a bond by tap and by drag.
5. **Two fingers.** Two fingers pan and pinch-zoom about their midpoint on every tool, within the zoom limits. A pan
   or zoom is never an undo step. A second finger after a drag started cancels it as Escape does. The window itself
   never zooms, wherever the pinch starts (added: `:root` carries the page's touch-action, so menus and dialogs
   placed on `body` are covered). Done: node pinch maths; WebKit view after a pinch, drawing after a late finger, and
   computed touch-action on the root, the canvas, an open menu and Home.
6. **Long press.** A finger held still for HOLD_MS opens the Actions menu there, with the mouse's hold ring. Lifting
   chooses nothing. Done: WebKit; Chrome for a lift over an option.
7. **Palm rejection.** Touches on the canvas do nothing while a pen is down or was seen in the last 500 ms. A pen
   press cancels a finger's press under way. After a pen has been used in a window, one finger pans and two pan and
   zoom; a tap and a long press do nothing. Done: node gate checks; WebKit palm after pen hover.
8. **Coarse reach.** Pen and touch hit atoms, bonds, text, arrows, shapes and every handle from further away. The
   mouse keeps its exact values. Done: node check that mouse values are equal for 10 000 random zooms and that an atom
   never covers the middle of its bonds.
9. **Coarse targets.** When the main pointer is coarse (`pointer: coarse`), the palette's tools and every options menu
   (each Menu.tsx menu: the palette's strips, list menus and the Actions menu) are 44 px (`--size-touch`). Added: the
   first build covered the palette and the Actions menu only; the consistency pillar puts every Menu.tsx menu on one
   size. Done: look sweep with `data-pointer="coarse"`, light and dark: every control matches its token, the active
   mark sits on the active tool, every menu fits in the window.
10. **Mouse and trackpad unchanged.** Every mouse and trackpad behaviour, size and timing stays as it is. Done: one
    scripted mouse session gives the same drawing here and on 515ed13; npm run look matches; Speed below.

## Rules every part keeps

- The mouse path does what it does now. Its only new work is one `pointerType` test and one pointer-id compare.
- One pointer presses at a time on the canvas. A pen press is the one exception: it cancels a finger's press.
- A cancel (late second finger, pen over a palm, pointercancel from a pen or finger, blur, lost capture) is Escape:
  nothing commits, the tool in hand comes back, the selection is as before the press. A mouse pointercancel releases
  as now.
- Each drawn thing is one undo step, as with the mouse. View changes are never undo steps.
- No new default keys, no new settings, no new words in the UI.
- Sizes come from tokens (tokens.css and tokens.json in step). Every menu stays src/Menu.tsx.
- Event data is hostile: NaN or infinite coordinates, zero distance between fingers, unknown pointer types (a mouse),
  reused ids, a pointerup that never comes. No network use.

## Design

The gesture logic is pure TypeScript in src/touch.ts with no React and no DOM, so node checks drive it with synthetic
sequences (pointerId, pointerType, isPrimary, button, buttons, pressure, time). Editor.tsx feeds it pen and touch
events and does what it returns: pass, press, erase, cancel, view, ring, unring, menu, timer.

- **The gate.** States idle, wait, press, view, pan, menu, dead. A waiting finger becomes a press at 10 px (the press
  goes in where it landed, then the move) or on lift (press, then release a frame later). It becomes a menu at
  HOLD_MS. A second finger starts the view gesture. The press reaches the editor as a PointerEvent on the canvas, so
  every tool's own press code runs.
- **One finger draws until a pen is used (decision).** A touch screen with no pen has only the finger to draw with,
  and Schramm asks for a finger that reaches the targets. Two fingers always pan, so the view is never out of reach.
  Once a pen is used, the finger only moves the view, which keeps a resting palm from drawing. This lasts for the
  window's life. A switch for it waits for the tablet run.
- **A long press opens the menu for touch (decision).** Windows, iPadOS and Android open a context menu on a long
  press, and a finger has no other right-click. Hold-to-Select stays for the mouse and the pen. Both holds use HOLD_MS
  and the same ring.
- **The press waits.** If the first finger acted at once, a two-finger pan would first clear the selection, and with
  the Eraser it would delete. A drag shows only after it moves and a click acts on release, so the wait shows nothing.
- **Pinch maths.** The factor is the new finger distance over the last (1 when either is under 1 px or not finite);
  the pan is the midpoint's move. zoomAt is shared with the wheel, so the limits, the `pinch` flag and the text scaling
  during a zoom are the trackpad's. A gesture start stops a running glide.
- **Slop.** Mouse 4 px (existing literals). Pen 6 px and touch 10 px, applied in the gate. Values to tune on a tablet.
- **Reach.** `reach` holds the last pointer's reach: mouse 1, pen 1.5, touch 2.5. Every px tolerance multiplies by it.
  Tolerances in bond lengths get a floor of 6 px x reach, capped (atoms 0.4, bonds 0.5 of a bond). With reach 1 every
  function returns its 515ed13 value. Hit order is unchanged.
- **Side button.** One openMenu for right-click, side button and long press. A side-button press waits 100 ms after
  release for the browser's contextmenu; if none came, the gate opens the menu. A pen's or a finger's contextmenu
  within 800 ms of a touch, or while a pen tip is held, is ignored, so a menu never opens twice and a held pen is
  hold-to-Select. onContextMenu takes the contextmenu as the event of the pointer that pressed last on the canvas, so
  the mouse's right-click always opens its menu. Each menu opens with the reach of the pointer that opened it (a long press a finger's, the side
  button a pen's), whatever pointer moved last.
- **Eraser end.** It goes first in the pen path, before handles and selection: the tool goes to `spring`, the Eraser
  takes the press a frame later, and release gives the tool back.
- **Coarse targets.** src/main.tsx sets `data-pointer` from `matchMedia("(pointer: coarse)")` and follows its change.
  Token `--size-touch: 44px` (WCAG 2.5.5 and Apple ask for 44 px; Windows about 40). Under `[data-pointer="coarse"]`,
  `.palette` and `.strip` (the root of every Menu.tsx menu) set `--size-tool`, `--size-cell` and `--size-row` to it.
  Any code that computes a menu height from a fixed row reads the token. The primary pointer decides, so a touch-screen
  laptop used with its trackpad keeps the dense layout.
- **Page zoom (added).** `touch-action: pan-x pan-y` moves from `.editor` to `:root`, because Menu.tsx (248, 333),
  Home's carried card (src/Home.tsx:1117) and the print view portal to `body`, outside `.editor`. `.canvas` keeps
  `none`. No Rust change.
- **New tools from other branches (added).** item/85-measurements adds a 4 px `measureAt` and item/43-energy-levels a
  new tool. Both press through onPointerDown, so pen and finger reach them. At their merge, each new px tolerance
  multiplies by `reach.current`. fix/140 changes the Eraser's click; the eraser end uses the Eraser's own press, so it
  takes that fix as it is. fix/162 (box select) runs through the same move code.
- **Merged with release-1.1.3's tip (added).** The Measure tool places its ends by clicks: a pen's or a finger's tap
  places an end, on the atom `hitAt` finds with the reach, and a free end within 4 px times the reach of the last is
  that end again. Its dotted line follows a pen hovering, and a finger's press and drag. The Pen's points and Edit
  curve's anchors and handles take the reach. The toolbar's active mark steps by `--size-tool` and `--space-1`, so it
  sits on Pen and Measure (the section between two lines) at 44 px too. The Arrow menu's size switch takes
  `--size-touch` for `--size-control` with a coarse pointer. A finger's tap in a table's RichBox cell keeps the focus
  there, as in the old cell. chrome-touch.mjs and touch.js check each.

## Siblings (consistency pillar)

Each is in the WebKit checks with a pen sequence and a finger sequence, or says why not.

- Tools: Select (box and lasso), Bond, Chain, Ring, Template, Text, Arrow, Shape and the Pen curve, Bracket, Symbol,
  TLC, Gel, Plasmid, Table, Cycle, Map, Orbital, Fragment, Mass spec, Synthesis, Retro, Eraser, and the new
  measurement and energy-level tools at their merge. Pen and one finger act as the mouse; long press gives the menu.
- Handles: arrow ends, bend, head, width and middle; Pen-curve anchors; resize sides and corners; rotation; centre
  mark; cycle handles; table edges; TLC spots, lines and ticks; page edge fit. Each takes the coarse reach.
- Context menu: right-click, Control-click, Menu key, side button, long press, all through openMenu. Off the canvas
  (Home cards, toolbar options, list items) the web view's own long press sends contextmenu, so those menus open as a
  right-click opens them. Tablet run.
- Zoom: wheel, Ctrl/⌘ + wheel, trackpad pinch, touch pinch, Magnify, Reduce, Actual Size, Fit: one zoomAt, one set of
  limits.
- Pan: scroll, middle button (also a pen's second barrel button, reported as button 1), two fingers, one finger after
  a pen.
- Erase: Eraser tool, eraser end, Delete: one removal path.
- Undo, copy, paste, duplicate, flip, rotate, align, delete, colour: reached through the long-press menu and the side
  button as through right-click. No new paths.
- Menus: every Menu.tsx menu takes the coarse size.
- Dark mode: the hold ring, menus and the coarse palette use tokens. Look runs light and dark.
- Spectrum and Mass spec plots: one finger acts as the mouse; their pinch is cut (Scope cut).

## MCP surface

None, and no MCP file changes. Pen and touch are ways the hand reaches the canvas. Every action they lead to (draw,
erase, select, every Actions menu command) is already in the MCP (draw, change, run_command). Zoom, pan and the coarse
sizes only arrange the user's screen.

## Files and formats

No change to .oct, CDXML, CDX, MOL, SDF, RDF, the clipboard or any export. A drawing made with a pen or a finger is
the same data as one made with a mouse, so Octet 1.1.2 and ChemDraw open it as any drawing. No settings keys are added
(`data-pointer` lives only in the running page), so 1.1.2 reads the settings file as before. No Rust and no dependency.

## Stress list

1. Two fingers land 120 ms apart with the Bond tool. No bond; the view pans and zooms; the undo list is unchanged.
2. A second finger lands after the first has dragged a bond 3 cm, or moved a selection 3 cm. No bond, the objects go
   back, the selection is as before, no undo step; then the pinch.
3. Two fingers land on a TLC spot with the Eraser in hand. Nothing is erased.
4. Three or four touches (two fingers and a palm), and a pinch finger that lifts and lands again. The first two drive
   the view; the rest do nothing, also when they lift first. After a lift no finger acts until all lift, and the next
   touch starts with no jump.
5. A pinch past the zoom limits, both fingers on one spot, coordinates NaN or infinite. The zoom stops at the limit
   and the pan goes on; factor 1 and no move; the view is never NaN.
6. pointercancel during a finger or pen drag, and a pointerup that never comes (the finger leaves the window).
   Nothing commits. Blur, lost capture or a new primary touch drops the stale pointer; no stuck drag. A mouse
   pointercancel releases as now.
7. A second pointer during a press: a palm presses, then the pen comes down; a mouse click during a finger's drag;
   a palm rests and moves while the pen hovers. The palm's press stops and the pen's bond is the only undo step; the
   mouse click is ignored until the finger lifts; the palm draws nothing, pans nothing and shows no hover marks.
8. The eraser end on a selected structure, on a resize handle, on the rotation handle, and while a caption is being
   typed. It erases what is under it and never moves, scales or turns; the caption closes as on a click away; the
   tool in hand comes back.
9. The side button on an atom, with and without the browser's contextmenu after it; a pen held still on empty canvas
   (Windows sends a right-click for it). One Actions menu for the side button. The held pen gives Select and no menu.
10. Junk pen data: pressure 0 and 1.7, tilt 90, twist 359, width 0; pointerType empty or unknown. The same result as
    a mouse press; an unknown type is a mouse.
11. Ten finger taps a second on one atom with the Chain tool; a pen double-tap on an atom with Select. One chain per
    tap; the label opens once, as with a mouse double-click.
12. A long press on empty canvas, then a drag without lifting; a finger tap while a menu is open. The menu stays and
    nothing is drawn; the tap closes the menu as a mouse click away does, then does what a mouse click there does.
13. Five bonds by finger with pinches between them, then ⌘Z five times and ⌘⇧Z five times. The bonds go and come
    back; the zoom does not change.
14. Zoom extremes with the coarse reach: at 8x; at 0.25x a tap between two close atoms and a tap in the middle of
    benzene; a turned caption and a flipped structure. At 8x the floors do nothing; at 0.25x the nearer atom is hit
    and the ring centre hits nothing; the turned caption takes the reach in its own box.
15. Two AI sessions: an MCP edit lands during a pinch, and an MCP delete removes the structure a finger drags. The
    view goes on; the drag ends as a mouse drag ends now; the undo order is unchanged.
16. A pen used in window A; copy from A's side-button menu, paste in window B from a long-press menu. B's finger still
    draws (palm mode is per window); the paste is the mouse's paste.
17. 40 paclitaxels in one drawing, and a 500-residue peptide. Mouse hover and box drag are no slower than 515ed13 and
    v1.1.2; a pinch step costs no more than a Ctrl + wheel step.
18. Coarse sizes in a 768 px tall window, light and dark; the keyboard cover comes off with a drawing and a menu open.
    Two palette columns when it is too tall, as now; the active mark on the active tool; every menu option and row
    44 px and inside the window; nothing else changes.
19. A pinch that starts on the toolbar, on an open menu, on a panel and on Home. The window never zooms; panels and
    Home still scroll with one finger.
20. A drawing made only with pen and finger, saved as .oct, CDXML and CDX, opened in Octet 1.1.2 and ChemDraw 22.2.
    The files hold the same data as the mouse-made drawing; both open it as any drawing.

## Acceptance

| Check | Covers |
| --- | --- |
| C1 node src/touch.check.ts: gate sequences, two gates apart | jobs 1-4, 6, 7; stress 1-7, 9-12, 16 |
| C1 node: pinch maths (midpoint fixed, limits, NaN) | job 5; stress 5 |
| C1 node: reach (mouse equal for 10 000 zooms, floors, caps) | job 8; stress 14 |
| C1 node: the gate's cost on the mouse path, budget and growth | job 10; stress 17 (gate part) |
| C2 WebKit `npm run look -- http://localhost:1476/?editor touch` (scripts/look/touch.js): every sibling tool with pen and finger, late finger, Eraser + two fingers, long press, eraser end, side button, held pen, palm after hover, finger after pen, pointercancel, pen jitter tap, ⌘Z chain, turned caption, Undo during a finger drag and a pinch against the same during a mouse drag | jobs 1-8; stress 1-3, 6-9, 11-15 |
| C3 WebKit mouse session, :1476 against 515ed13 on :1477 (throwaway worktree, removed after): drawing and CanvasAccess equal | job 10; stress 20 (same data) |
| C4 WebKit timing (Speed) | job 10; stress 17 |
| C5 npm run look, light and dark, fine and coarse; computed touch-action on root, canvas, menu, Home | jobs 5, 9; stress 18, 19 |
| C6 `git diff 515ed13 --stat`: no format, MCP, settings or Rust file changes | stress 20; MCP surface |
| C7 npm test (tsc, every check, ui.check token rules) | all |
| C8 real-tablet run (below) | jobs 1-7, 9 on hardware; stress 6, 9, 16, 19 |

Stress 15 runs on the dev server, where MCP calls cannot arrive (they need the Tauri shell). An outside edit and an
Undo both replace the drawing under a press through one path, and the gate holds no drawing data, so the Undo stands
in for the MCP edit. Stress 20 needs no ChemDraw round trip: C6 shows no format code changed and C2 and C3 show the
same drawing.

## Speed

The mouse's pointermove is the hot path. In WebKit, with 40 paclitaxels in one drawing and with a 500-residue
peptide: 2000 mouse moves over the drawing (hover, hit testing each move) and 2000 moves of a box drag. Branch (:1476)
against 515ed13 (:1477), five runs each, interleaved, medians compared; a slower median runs again alone before it
counts. v1.1.2 for the record. Pinch: 200 two-finger moves against 200 Ctrl + wheel steps on the same drawings. The
node check holds the gate's own cost under a budget.

## Real-tablet checklist for Sam

Windows tablet with a pen (Surface or similar), keyboard cover off:

1. Pen: draw a bond, a chain, a ring, an arrow, a lasso; place text; drag an arrow's end. A tap is a click.
2. Pen held still on empty canvas with the Bond tool: Select takes over, and no Windows menu opens.
3. Side button on an atom: one Actions menu. Eraser end over bonds: they go, the Bond tool comes back.
4. In a new window, before any pen: a finger tap and drag draw; two fingers pan and pinch about the fingers; a pinch
   on the toolbar, a menu or a panel never zooms the window.
5. Long press on the canvas: the menu; lifting chooses nothing. Long press on a Home card: its menu.
6. After the pen: rest a palm while drawing. Nothing from the palm. One finger pans.
7. Tools and menu options are 44 px with the cover off and 32 and 36 px with it on.
8. Two windows: the pen in one, a finger draws in the other.
9. Text tool tap: does Windows' touch keyboard open?
10. A pinch on a busy drawing is smooth.

Linux touch screen, if one is to hand: steps 4 to 7. Mac with a Wacom or Sidecar: step 1.

## Scope cut

- Pinch and two-finger pan on the Spectrum and Mass spec plots: they have their own zoom code. One finger acts as the
  mouse there.
- 44 px buttons in panels, dialogs, Settings and Home: each needs its own layout pass. 1.2 does the palette and every
  options menu.
- A Settings switch for "a finger draws after a pen": waits for the tablet run and Sam's call.
- Press-hold-slide on the palette with a finger: the touch is captured by the button it lands on, and a fix cannot be
  proven without a touch screen. Tap, then tap, works.
- The eraser's circle while the eraser end hovers: depends on what each digitiser reports.
- Palm rejection off the canvas: the digitiser's own rejection covers the toolbar and panels.
- Pressure, tilt and line width from the pen: ChemDraw has none, and drawings keep ACS widths.
- Reading a hand-drawn sketch as a structure: a project of its own.
- Touch on Linux and the pen on the Mac: they go as far as WebKitGTK and WebKit report pointer types. No hardware here.

## Order of work for the build stage

1. Review the working-tree diff against jobs 9 and 10 and the rules; keep what meets them.
2. Add the root touch-action and the `.strip` coarse rule, with their checks in touch.js and the coarse sweep.
3. Commit in small commits; run C1 to C7; fix against the job each failure breaks.
4. Close every server, look run and window started from this worktree.

## What's New (1.1.3)

- When you draw with a pen on a tablet, the pen draws as the mouse does. Its eraser end erases, and its side button
  opens the Actions menu.
- When you draw on a touch screen with one finger, the finger draws as the mouse does.
- To move or zoom the drawing on a touch screen, drag or pinch with two fingers.
- To open the Actions menu with a finger, touch and hold.
- When you use a pen in a window, a finger after it only moves and zooms the drawing there, so your hand can rest on
  the screen.
- When you point with a pen or a finger, it reaches atoms, bonds, text and handles from further away than the mouse.
- When you measure with a pen or a finger, a tap places an end. The dotted line follows a pen as it hovers, and a
  finger while you touch and drag.
- When you use a tablet with its keyboard off, the tools, the options in menus and the Arrow menu's size switch are
  larger.
- When you double-click a resize handle on Windows, Scale… opens. On the rotation handle, Rotate… opens, and on a
  reaction arrow, the whole reaction is picked.
