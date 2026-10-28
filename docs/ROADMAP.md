# Roadmap

## Now (Sam, 27 October 2026: "everything other than the signing keys is tractable. Get to work, methodically")

Parked by Sam: signing keys (they cost money), institutional features, the other Octet apps. Updates are on by
default (decision 0010).

| Work | Status |
|---|---|
| Updates on by default | Done (71dab94) |
| ChemDraw file fidelity: hand-placed conditions, set label justification, turned labels, the 12 failing round trips | Done: 68 of 68 CDXML round trips |
| Template and clip-art library (CD-32), paddlewheels and ligands | Done: 292 templates in 16 sets, no label clashes |
| Measured spectra from JCAMP-DX, with peak assignment (CH-29) | Done, with ChemDraw's spectrum object in CDXML and CDX, peaks linked to bonds, and SPC files |
| Naming gaps: mixtures with ratios, mixed-metal and cluster complexes, configuration at metals, η drawn with bonds, typography of names | Done: 6855 of 6924 named right, 0 wrong |
| Platform: Linux Edit menu, Mac Quit from the Dock, pictures in EMF and EPS, Windows and Linux test runs on CI | Done: Windows and Linux runs pass every step |
| Windows: screen readers could not open Octet's menus (found by the CI run, 28 October) | Done: the menu bar was in UI Automation all along, but MSAA and UI Automation open a menu by pressing Alt and its access key, which WebView2 kept from the window. Each menu now has an access key, and `access_keys.rs` passes Alt and the key to the menu bar. The Windows run opens each menu through UI Automation. The Reaxys window has the same handler (28 October); the Windows run does not open that window yet |
| Mac: check VoiceOver's view of a dev build with the AX API | Waiting for Sam to allow accessibility access |
| Screen readers on the canvas: the drawing is one image to VoiceOver and Narrator; structures need a text equivalent and keyboard navigation | Done (decision 0019); next: a real VoiceOver, Narrator and NVDA session |
| Mass Spec Analysis (CH-40), with isotope patterns and the HRMS line | Done |
| Check the Revvity claims in the LinkedIn draft | Done: ~/octet-research/notes/revvity-claims-and-products.md |
| ChemDraw session: the 13 checks in ~/octet-research/notes/chemdraw-checks-pending.md | Waiting for Sam to allow full-screen control |
| Reaxys: reproduce what fails in the built app, then fix | Waiting for the ChemDraw session |
| Template features ChemDraw has: edit in place, rows and columns, floating palettes, .ctp files, a user dictionary | Done (decision 0018): Edit, order by drag, floating palettes, .ctp and .cts files, the user's dictionary; next: write .ctp |
| Launch: the website on Cloudflare Pages | Next; needs Sam's Cloudflare sign-in |
| Signing and notarisation | Parked: needs Sam's keys |

## Version 1.1.0: next steps

Sam moved these three features from 1.0 to 1.1.0 on 18 October 2026. They are the next steps after 1.0.0. Build them in this order.

### 1. Template and clip-art library (audit item CD-32)

Built on 27 October 2026 for Sam to review (decision 0017): 292 templates in 16 sets, with the eight sets below, more ligands, paddlewheels and seven more lab items. ChemDraw ships 29 template sets; decision 0017 lists which Octet covers. Octet must draw its own sets and must not copy ChemDraw's art or data.

Draw Octet's own sets in this order:

1. Stereocentres.
2. Conformers: chairs, Newman projections and sawhorse projections.
3. Cycloalkanes.
4. Aromatics and bicyclics.
5. Hexoses.
6. Functional groups.
7. Cp and arene rings, with metallocenes.
8. Lab clip art in Octet's own line style: round-bottom flask, beaker, conical flask, condenser, separatory funnel, test tube, light bulb and LED for photochemistry, heating mantle and stirrer bar. A starter set of eight (light bulb, LED, round-bottom flask, beaker, conical flask, reflux condenser, separatory funnel and test tube) ships in 1.0 as the library's Lab group.

Give every item a name, so the library search finds it. Each item must look right at the brand line weights and in dark mode.

### 2. Measured spectra (audit item CH-29)

Built 27 October 2026 for Sam to review (decision 0016). Octet opens JCAMP-DX and Bruker spectra into the Spectrum panel, picks peaks and multiplets, and links them to atoms.

- Read JCAMP-DX files (with size and nesting limits, as for every opened file) into a spectrum in the Spectrum panel.
- Let the user link each measured peak to its atoms, with the peak and atom lighting Octet already uses for predicted peaks.

Done on the `spectra-parity` branch (27 October 2026, decision 0016): ChemDraw's spectrum object and its spectrum-structure assignments are written and read in CDXML and CDX, peaks link to bonds as ChemDraw's assignment does, and Galactic SPC files open. ChemDraw checks 19 (h) to (l) wait in `~/octet-research/notes/chemdraw-checks-pending.md`.

### 3. Mass Spec Analysis (audit item CH-40)

The Synthesis and Retrosynthesis cut tools (audit item CD-39) are built in 1.0, so only Mass Spec Analysis stays in this step.

- A Mass Spec Analysis mode beside Mass Fragmentation: built on 27 October 2026 (the Mass spec analysis tool and panel, `src/MassSpec.tsx` and `src/msanalysis.ts`).
- Done (28 October 2026, `drawing-loose-ends` branch): a fragmentation line with corners (any key pressed during the drag adds one where the pointer is), dragging from a line's end to make it longer, and Tab (Shift+Tab back) through the fragments of the atom or bond under the pointer. ChemDraw check 26 waits in `~/octet-research/notes/chemdraw-checks-pending.md`.
- Done (`spectra-parity` branch): a measured mass spectrum in the drawing is the Mass spec panel's peak list (`peaks`).

### Search Reaxys needs fixing

Sam, 18 October 2026: the Reaxys integration needs fixing. Fix it first in 1.1.0.

- Search Reaxys opens Reaxys in Octet's Reaxys window (decision 0008). The window clears the Query Builder form that Reaxys keeps from the last search, because Reaxys's own site searches that old form before it loads the new structure. The research note is `~/octet-research/notes/reaxys-search.md` on Sam's Mac.
- The window was tested in headless Chrome and in a bare macOS web view. It has not been tested in the built app.
- What Sam saw fail is not recorded yet. Ask Sam before you start.

### Moved from 1.0 on 18 October 2026 to save usage

Sam wanted these in 1.0. They are not done yet.

- ChemDraw file fidelity (done on the `file-fidelity` branch, 27 October 2026; ChemDraw checks 15 to 18 wait in `~/octet-research/notes/chemdraw-checks-pending.md`):
  - Done: conditions keep their text positions from a ChemDraw file, by their arrow, until the arrow changes length or direction or Clean Up Reaction runs.
  - Done: a label keeps the justification its file gives it (centred, left, right, stacked) where Octet's automatic one would draw it another way.
  - Done: a label's `RotationAngle` is kept, drawn and written back.
  - Done: all 68 of Sam's CDXML files write and read back unchanged.
  - Arrowhead sizes and hollow block arrows are done.
  - Done (27 October 2026; ChemDraw check 23): tritium typed as T is hydrogen-3, as D is hydrogen-2, in the formula's weight, CDXML and MOL; an atom number ChemDraw keeps hidden (`AtomNumber` without `ShowAtomNumber`) is kept and written back without showing.
  - Done (28 October 2026, `drawing-loose-ends` branch): a node label of more than one line ("Direct,\nNo ISC" in the corpus). Option-Return in the label box starts a new line (Settings > Typing > New line in labels can make it Return, as ChemDraw's preference). The attaching line sits on the atom as a one-line label does; the other lines go a caption's line apart, lined up with it. Bonds stop at each line's box. CDXML and CDX keep the break and write LineStarts. ChemDraw check 26 waits in `~/octet-research/notes/chemdraw-checks-pending.md`.

### Platform limits

Octet cannot test these on Sam's Mac.

- Windows and Linux: the clipboard and the menus have never run on a real Windows or Linux machine. The workflow
  `.github/workflows/platforms.yml` drives them on GitHub's machines (docs/release.md, Checks); it has not run yet.
- The build pipeline (`.github/workflows/release.yml`) has never run on GitHub.
- Updates cannot be tested until the first release is published.
- Signing and notarisation wait for Sam's Apple and Windows keys.
- The Dock's Quit (`src-tauri/src/quit.rs`) was tried on 27 October 2026 in a built Octet with a quit Apple Event, as the Dock
  sends: with no changes Octet ends at once; with unsaved changes the question shows and the quit waits; Cancel stops it
  and Don't Save ends Octet. Not tried: a real logout or restart, and Save from that question on a new drawing.
