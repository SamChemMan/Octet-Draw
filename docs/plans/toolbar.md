# Plan: the main toolbar

16 October 2026. Sam answered the open questions the same day (see Decisions).

Goal: everything on ChemDraw's main toolbar, with the same keys, but far easier to find and faster to use.

## What is wrong with ChemDraw's toolbar

- About 30 small icons in a dense grid. Most hide a pop-out palette behind a tiny triangle you press and hold.
- One kind of object is split over many buttons: there are eight separate bond buttons.
- Useful tricks are modifier keys that nobody finds (Option-drag, Shift-click).
- Curved arrows snap to angles the user did not choose. Reaction conditions and compound numbers are loose text, not tied to the arrow or structure.
- Fixes live in menus. Chemists ask on forums how to do things the app can already do.
- Experts love the hotkeys. Any redesign must keep them.

## Principles

1. **One tool per kind of object.** Bond, Chain, Ring, Arrow, Text, Symbol, Bracket, Shape. The variants (wedge, hash, triple; curved arrow, equilibrium arrow) live inside the tool, not as separate buttons.
2. **Variants are one move away and remembered.** Each tool button shows the variant you used last. Click the tool again, or hold it, and a strip of its variants opens beside it with large icons, names and keys. No tiny triangles.
3. **The pointer gives context.** What is under the pointer decides what happens (atom, bond, empty canvas), as now. Atom and bond keys work with any tool in hand.
4. **Keyboard first for experts.** ChemDraw's hotkeys are the defaults. Every tool and variant has a key, shown in its tooltip and changeable in Keyboard settings.
5. **Simple surface, deep tools.** A new user sees twelve everyday tools. Specialist tools (orbitals, 3D rotate, tables, TLC plates, query tools, mass fragmentation) sit under an expand button at the bottom of the palette, and any of them can be pinned to the palette.
6. **Fix in place, not in menus.** Select something and a small bar appears next to it with what you can do to that thing: bond order and stereo for a bond; element, charge and H for an atom; Clean up, Flip, Rotate and Align for a structure.
7. **Attach, don't float.** Conditions text sits on its arrow. Compound numbers sit under their structure. Curved arrows start and end on atoms, bonds or lone pairs, and bend freely. Move the parent and the child moves with it.

## Proposed palette

Every tool on ChemDraw 22.2's Tools palette (36 buttons, from Sam's screenshot, 16 October 2026) has a home in Octet. Twelve tools show by default in one column; the specialist ones sit under the expand button.

| Octet tool (shown by default) | ChemDraw tools it covers |
| --- | --- |
| Select | Marquee, Lasso |
| Eraser | Eraser |
| Bond | Solid, Multiple bonds (double, triple, dative), Dashed, Hashed, Hashed wedged, Bold, Bold wedged, Hollow wedged, Wavy |
| Chain | Acyclic chain |
| Ring | Cyclopropane to cyclooctane, both chair cyclohexanes, cyclopentadiene, benzene |
| Text | Text |
| Arrow | Arrows (reaction, equilibrium, resonance, retrosynthetic, no reaction, curved, fishhook, dipole) |
| Symbol | Chemical symbols (charges, circled charges, radicals, lone pairs) |
| Brackets | Brackets |
| Shapes | Drawing elements (lines, boxes, rounded callouts, circles) |
| Pen | Pen (curves) |
| Templates | Templates |

| Under the expand button | ChemDraw tools it covers |
| --- | --- |
| Orbitals | Orbitals |
| 3D rotate | Structure perspective |
| Table | Table |
| TLC and gel | TLC plate, gel electrophoresis |
| Query and mapping | Query tools, reaction atom-atom mapping |
| Mass fragmentation | Mass fragmentation |

Any tool under the expand button can be pinned to the palette. Undo and Redo stay at the bottom.

**Templates** open a searchable browser rather than a pop-out grid: rings, amino acids, sugars, ligands, protecting groups, abbreviations (Ph, Boc, Ts). Type to filter. Recently used first.

**Radial menu** (the Vorssaint idea already in CLAUDE.md): press and hold W, flick toward a slot, release. A quick tap of W keeps its normal meaning. Eight fixed slots, so experts can flick without looking: benzene, cyclohexane, chain, arrow, text, eraser, select, last template. The trigger and the slots are changeable; the trigger can also be a mouse click.

**Command palette** (⌘K): type any command, tool or template by name ("chair", "clean up", "Boc").

## Build order

Each step ends with a usable build and a side-by-side check against ChemDraw (same drawing: output, time, number of steps).

1. Palette with variant strips. All bond types drawn to ACS 1996, including hollow wedges. Chain tool. Ring sizes 3 to 8, cyclopentadiene, both chair cyclohexanes. Lasso. ChemDraw's hotkeys.
2. Text: atom labels with abbreviations that expand (OMe, CO2Et, NHBoc, PPh3), captions, bold compound numbers that stay under their structure.
3. Arrows, including curved arrows attached to atoms, bonds and lone pairs with free curvature, and conditions text attached to reaction arrows. Symbols.
4. The bar next to a selection: bond, atom and structure actions, Clean up, Flip, Rotate, Align.
5. Templates browser, radial menu and command palette.
6. Brackets, shapes and callout boxes, and pen. Then the specialist tools under the expand button: orbitals, 3D rotate, table, TLC and gel, query and mapping, mass fragmentation.

## Decisions (Sam, 16 October 2026)

1. **Radial menu trigger:** changeable, including a mouse click. Default: press and hold W. A tap of W keeps its normal meaning. Check W against ChemDraw's hotkeys.
2. **Specialist tools:** hidden under an expand button at the bottom of the palette; any can be pinned.
3. **The bar next to a selection:** "whatever science says is best". Delays belong to things that appear on hover, to stop accidental triggers (Nielsen Norman Group suggests about 0.3 to 0.5 s). Finishing a selection is a deliberate act, so the bar appears as soon as the pointer is released, fades in over 150 ms, sits above the selection without covering it, and hides while anything is dragged or drawn.
