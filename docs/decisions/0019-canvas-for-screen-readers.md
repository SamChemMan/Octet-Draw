# 0019: The canvas for screen readers and the keyboard

Status: built 28 October 2026 for Sam to review (roadmap: screen readers on the canvas).

The canvas was one SVG named "Drawing canvas", so VoiceOver and Narrator read the whole drawing as one image. A blind
or low-vision chemist could not find out what was drawn, or move through it.

## What others do

- ChemDraw 26.1 (`~/octet-research/notes/chemdraw-accessibility.md`): its canvas view is one accessibility element,
  role AXLayoutArea, label "ChemDraw Document", with nothing inside it. Its help: with the Lasso or Marquee tool,
  Tab selects the next structure and Shift+Tab the previous one; with a hotspot, Tab selects the hotspot's structure;
  with nothing selected, Tab selects the first. Enter on a selected structure puts the hotspot on it, and the arrow
  keys walk the hotspot atom to bond to atom. No desktop release since 22.2 lists accessibility work; ChemDraw+ 26.3
  worked on toolbars and popovers, not the canvas. What needs ChemDraw running is item 25 in
  `~/octet-research/notes/chemdraw-checks-pending.md`.
- Figma ("Building accessibility into a canvas-based product", figma.com/blog): a mirror DOM of the objects, laid out
  where they are drawn (so magnifiers and the screen reader's cursor follow), kept in step with the selection both
  ways, updated a part at a time, and live-region messages only for what focus does not say, with related events put
  together ("Moved five pixels"). Its help: Tab and Shift+Tab move through the layers; Return and Shift+Return go into
  and out of a layer.
- Accessible chemical diagrams (Sorge, Lee and Wilkinson, W4A 2015 and ICCHP 2016): a molecule explored by keyboard in
  layers (the molecule, its ring systems and chains, its atoms), spoken through ARIA. Blind students drew the
  structures back from what they heard.
- NavMol 2.0 (Eur. J. Org. Chem. 2013, 1415–1419): a molecule navigator for blind students that gives each neighbour's
  direction as a clock position.
- The image description guidelines for chemistry (NCAM and Benetech's DIAGRAM Center): name the compound; else say its
  atoms and how they join.
- Searched, nothing to use: Ketcher (no published screen reader or canvas keyboard work found); Marvin Pro (menus,
  dialogs and toolbars reach screen readers; its drawing area "is still being extended"); ChemVox (a voice skill for
  quantum chemistry calculations, not a structure reader).

## What Octet does

- `CanvasAccess.tsx` puts an element over each object on the canvas, where it is drawn, in reading order (rows from
  the top, each from the left; a compound number after its structure, conditions after their arrow), inside one
  element with role `application` named "Drawing canvas" (so NVDA and JAWS pass the drawing keys through). The SVG is
  hidden from screen readers. Each element has `role="img"`, `aria-roledescription` (structure, reaction arrow, text,
  shape, spectrum, group, catalytic cycle) and a name from `access.ts`:
  - a structure: its checked name with the abbreviation Octet cites (Structure to Name's), with its formula and rings
    after it; else its formula and rings ("C9H8O4, one ring"); before Indigo has loaded, its atoms and rings;
  - a reaction arrow: its step as a sentence, "2-hydroxybenzoic acid plus acetic anhydride (Ac2O) gives
    2-(acetyloxy)benzoic acid, conditions: H2SO4, 90 °C"; an equilibrium "is in equilibrium with", a retrosynthetic
    arrow "is made from", a no-reaction arrow "does not give";
  - a curved arrow its ends ("From oxygen 1 to the bond between carbon 1 and oxygen 1"); text its text; shapes their
    kind, a TLC plate its lanes and Rf values, a table its rows and cells; a spectrum added to the drawing its title.
- Tab and Shift+Tab step through the objects with any tool, and the selection follows (ChemDraw's Tab steps through
  structures, with Select only). With a hotspot, Tab selects its structure (ChemDraw's). An object with the focus but
  not selected is selected where it is. With the focus on the canvas, Tab past the last object leaves the canvas for
  the next control; from no control, it comes round. Tab was free: no key in `keys.ts` uses it, and the arrow Octet
  offers after Clean Up still takes it first.
- Enter on a selected structure puts the hotspot on it (ChemDraw's), and the arrow keys walk it (`walkHot`,
  ChemDraw's). Each atom and bond is an element that takes the focus, so the screen reader reads it with no live
  message: "Carbon 9, no hydrogens. Double bond to oxygen 4 at 3 o'clock; single bond to carbon 8 at 7 o'clock; single
  bond to oxygen 3 at 11 o'clock." An atom is numbered among the atoms of its element in its structure (or by the
  number it shows); its neighbours go clockwise from 12 o'clock, so the arrow key that reaches each one can be chosen
  by ear. With no bond that way, Octet says "No bond that way."
- Escape from the hotspot goes up to its structure, selected (Figma's Escape). After a delete, the next object takes
  the focus, not selected, so a second Delete does not take it too.
- While the keyboard's focus is on the canvas, the pointer does not take the keys (ChemDraw's keys act on what the
  pointer is over; VoiceOver can move the pointer to follow its cursor). A click gives the keys back to the pointer.
- One polite live region says what each edit changed, 400 ms after the last change, so a key held down says one
  sentence: "Added a single bond, oxygen to carbon.", "Carbon changed to nitrogen.", "Moved 41 pt right.", "Turned
  15° anticlockwise.", "Deleted 13 atoms and 13 bonds.", "Undo. Deleted two atoms and three bonds.", "Cleaned up the
  drawing." A new or opened drawing says nothing.
- The focus ring is `--shadow-focus` round the object, shown at once (no motion, so reduced motion changes nothing),
  with a clear outline that forced colours draw. It keeps 3:1 on every page: white on engineering paper, and on a
  page of the user's own colour white or navy where the focus blue would not stand out (`ringOn`).

## Speed

The objects' names and order are worked out 300 ms after the drawing last changed, not on each edit; formulas and
names come from a cache kept by each structure's content (wherever it is drawn), filled a few at a time with the
window free between them; structures of more than 120 atoms are not named. The view moves the elements' layer, so a
pan or zoom draws none of them again. `access.check.ts` holds the time on 500 atoms under a budget and checks that it
grows with the drawing, not its square; `scripts/canvas-a11y.mjs` measures keys in the app.

## Not done

- Ring systems and chains as a layer between the structure and its atoms (Sorge's middle layer).
- Stoichiometry grids and the Spectrum and Mass spec panels' own contents.
- A real VoiceOver, Narrator and NVDA session: the tree is checked in Chrome only (WKWebView on the Mac, WebView2 on
  Windows and WebKitGTK on Linux may expose it differently); the roadmap's VoiceOver check covers it.
