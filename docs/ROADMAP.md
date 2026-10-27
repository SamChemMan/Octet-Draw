# Roadmap

## Now (Sam, 27 October 2026: "everything other than the signing keys is tractable. Get to work, methodically")

Parked by Sam: signing keys (they cost money), institutional features, the other Octet apps. Updates are on by
default (decision 0010).

| Work | Status |
|---|---|
| Updates on by default | Done (71dab94) |
| ChemDraw file fidelity: hand-placed conditions, set label justification, turned labels, the 12 failing round trips | Done: 68 of 68 CDXML round trips |
| Template and clip-art library (CD-32), paddlewheels and ligands | In progress |
| Measured spectra from JCAMP-DX, with peak assignment (CH-29) | In progress |
| Naming gaps: mixtures with ratios, mixed-metal and cluster complexes, configuration at metals, η drawn with bonds, typography of names | In progress |
| Platform: Linux Edit menu, Mac Quit from the Dock, pictures in EMF and EPS, Windows and Linux test runs on CI | In progress |
| Mass Spec Analysis (CH-40), with isotope patterns and the HRMS line | In progress |
| Check the Revvity claims in the LinkedIn draft | In progress |
| ChemDraw session: the 13 checks in ~/octet-research/notes/chemdraw-checks-pending.md | Waiting for Sam to allow full-screen control |
| Reaxys: reproduce what fails in the built app, then fix | Waiting for the ChemDraw session |
| Template features ChemDraw has: edit in place, rows and columns, floating palettes, .ctp files, a user dictionary | Next, after the template library |
| Launch: the website on Cloudflare Pages | Next; needs Sam's Cloudflare sign-in |
| Signing and notarisation | Parked: needs Sam's keys |

## Version 1.1.0: next steps

Sam moved these three features from 1.0 to 1.1.0 on 18 October 2026. They are the next steps after 1.0.0. Build them in this order.

### 1. Template and clip-art library (audit item CD-32)

Octet has 106 templates in 7 groups: amino acids, sugars, nucleobases, heterocycles, polycyclics, ligands and lab. ChemDraw ships 29 template sets. Octet must draw its own sets and must not copy ChemDraw's art or data.

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

Octet predicts ¹H and ¹³C spectra. It cannot open a measured spectrum.

- Read JCAMP-DX files (with size and nesting limits, as for every opened file) into a spectrum in the Spectrum panel.
- Let the user link each measured peak to its atoms, with the peak and atom lighting Octet already uses for predicted peaks.

### 3. Mass Spec Analysis (audit item CH-40)

The Synthesis and Retrosynthesis cut tools (audit item CD-39) are built in 1.0, so only Mass Spec Analysis stays in this step.

- A Mass Spec Analysis mode beside Mass Fragmentation: built on 27 October 2026 (the Mass spec analysis tool and panel, `src/MassSpec.tsx` and `src/msanalysis.ts`).
- Still missing against ChemDraw 26.1: a fragmentation line with corners (ChemDraw adds a corner when a key is pressed during the drag), and dragging from a line's end to make it longer. Octet's lines are straight; draw a second line instead.
- When the measured spectra reader is in, pass its MS peak list to the Mass spec panel (`peaks`).

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
  - Not done: a node label of more than one line (Octet's labels are one line), invisible atom numbers (`AtomNumber` without `ShowAtomNumber`), and tritium typed as T (read as the text T).
- Mixtures as ChemDraw 26.1 names them: Structure to Name gives one name with the component ratios for a grouped mixture, fractional ratios too. Name to Structure already reads these names.
- Linux: Cut, Copy and Paste in the Edit menu as Octet's own items, as Close Window is.

### Platform limits

Octet cannot test these on Sam's Mac.

- Windows and Linux: the clipboard and the menus have never run on a real Windows or Linux machine.
- The build pipeline (`.github/workflows/release.yml`) has never run on GitHub.
- Updates cannot be tested until the first release is published.
- Signing and notarisation wait for Sam's Apple and Windows keys.
- The Dock's Quit (`src-tauri/src/quit.rs`) was tried only in a probe. Try it in a built Octet with unsaved changes.
