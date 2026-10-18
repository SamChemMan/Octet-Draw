# Roadmap

## Version 1.1.0: next steps

Sam moved these three features from 1.0 to 1.1.0 on 18 October 2026. They are the next steps after 1.0.0. Build them in this order.

### 1. Template and clip-art library (audit item CD-32)

Octet has 98 templates in 6 groups: amino acids, sugars, nucleobases, heterocycles, polycyclics and ligands. ChemDraw ships 29 template sets. Octet must draw its own sets and must not copy ChemDraw's art or data.

Draw Octet's own sets in this order:

1. Stereocentres.
2. Conformers: chairs, Newman projections and sawhorse projections.
3. Cycloalkanes.
4. Aromatics and bicyclics.
5. Hexoses.
6. Functional groups.
7. Cp and arene rings, with metallocenes.
8. Lab clip art in Octet's own line style: round-bottom flask, beaker, conical flask, condenser, separatory funnel, test tube, light bulb and LED for photochemistry, heating mantle and stirrer bar.

Give every item a name, so the library search finds it. Each item must look right at the brand line weights and in dark mode.

### 2. Measured spectra (audit item CH-29)

Octet predicts ¹H and ¹³C spectra. It cannot open a measured spectrum.

- Read JCAMP-DX files (with size and nesting limits, as for every opened file) into a spectrum in the Spectrum panel.
- Let the user link each measured peak to its atoms, with the peak and atom lighting Octet already uses for predicted peaks.

### 3. Mass Spec Analysis (audit item CH-40)

The Synthesis and Retrosynthesis cut tools (audit item CD-39) are built in 1.0, so only Mass Spec Analysis stays in this step.

- A Mass Spec Analysis mode beside Mass Fragmentation.
