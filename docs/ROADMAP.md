# Roadmap

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

Octet predicts ¹H and ¹³C spectra. It cannot open a measured spectrum.

- Read JCAMP-DX files (with size and nesting limits, as for every opened file) into a spectrum in the Spectrum panel.
- Let the user link each measured peak to its atoms, with the peak and atom lighting Octet already uses for predicted peaks.

### 3. Mass Spec Analysis (audit item CH-40)

The Synthesis and Retrosynthesis cut tools (audit item CD-39) are built in 1.0, so only Mass Spec Analysis stays in this step.

- A Mass Spec Analysis mode beside Mass Fragmentation.

### Search Reaxys needs fixing

Sam, 18 October 2026: the Reaxys integration needs fixing. Fix it first in 1.1.0.

- Search Reaxys opens Reaxys in Octet's Reaxys window (decision 0008). The window clears the Query Builder form that Reaxys keeps from the last search, because Reaxys's own site searches that old form before it loads the new structure. The research note is `~/octet-research/notes/reaxys-search.md` on Sam's Mac.
- The window was tested in headless Chrome and in a bare macOS web view. It has not been tested in the built app.
- What Sam saw fail is not recorded yet. Ask Sam before you start.

### Moved from 1.0 on 18 October 2026 to save usage

Sam wanted these in 1.0. They are not done yet.

- ChemDraw file fidelity:
  - Conditions keep their text positions from a ChemDraw file. Now Octet lays out the conditions of an arrow again, so text that ChemDraw placed by hand moves.
  - Centred labels: a label with `LabelJustification="Center"` keeps it. Now Octet reads and writes the justification it works out itself.
  - Label turns: a label's `RotationAngle` is kept. Now Octet keeps it on captions only.
  - Arrowhead sizes and hollow block arrows are done.
- Mixtures as ChemDraw 26.1 names them: Structure to Name gives one name with the component ratios for a grouped mixture, fractional ratios too. Name to Structure already reads these names.
- Linux: Cut, Copy and Paste in the Edit menu as Octet's own items, as Close Window is.

### Platform limits

Octet cannot test these on Sam's Mac.

- Windows and Linux: the clipboard and the menus have never run on a real Windows or Linux machine.
- The build pipeline (`.github/workflows/release.yml`) has never run on GitHub.
- Updates cannot be tested until the first release is published.
- Signing and notarisation wait for Sam's Apple and Windows keys.
- The Dock's Quit (`src-tauri/src/quit.rs`) was tried only in a probe. Try it in a built Octet with unsaved changes.
