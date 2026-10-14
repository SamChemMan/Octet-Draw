# Octet — build brief for Claude Code

Owner: Sam Ellis · Date: 14 October 2026 · Status: pre-build

Read this whole file before you write code. `brand/` holds the visual system. `CLAUDE.md` holds the hard rules in short form.

---

## 1. What Octet is

Octet is a free, native desktop app for drawing chemical structures, reactions and schemes. It replaces ChemDraw.

It has two modes:

- **Beginner mode** corrects the chemistry as you draw: bond angles, geometry from hybridisation, valence, implicit hydrogens, ring shapes, charges. A first-year student gets a correct, journal-ready structure with no training.
- **Pro mode** never overrides the user. Every atom, bond, angle and label can be set by hand, for complex molecules, organometallics, hypervalent centres and rare cases. Auto-correct stays available as an explicit command ("Clean structure"), never a silent action.

Its edge is **chemistry-aware layout**. ChemDraw and every competitor treat layout as generic drawing (circles, arrows, text boxes). Octet treats it as chemistry:

- A native **catalytic cycle** object.
- **Scheme grids** that snap structures, arrows and labels to each other.
- **Styled titles, callout boxes and annotations** that look good by default.
- Everything **ACS 1996-correct by default**.

---

## 2. Non-negotiables

These are product decisions. Do not trade them away for convenience.

1. **Free for every individual. A hard promise.** No trial timers, watermarks, export limits, licence keys or "Pro" locks on any individual feature. Never design a sign-up gate or upsell modal.
2. **Native desktop, offline-first.** Mac and Windows. Every feature works with no internet. Not a web app. It must feel official.
3. **Near-zero friction.** Download, install, draw. No account. The first launch opens straight to a blank canvas. An account is optional and only adds cloud sync and sharing. Files always save locally.
4. **Signed and notarised installers.** macOS notarisation and Windows code signing, so users never see an "unidentified developer" warning. A small download that starts in seconds.
5. **ChemDraw files in and out.** Import and export `.cdxml` (and read `.cdx` where possible) with high fidelity from version 1. Users have decades of files. Without this, nobody switches.
6. **ACS Document 1996 is the default style.** Bond length 14.4 pt, line width 0.6 pt, bold width 2 pt, bond spacing 18%, hash spacing 2.5 pt, atom labels 10 pt. See `brand/tokens.json` → `drawing`.
7. **British English for all user-facing text**, with chemistry spelling per IUPAC and the RSC: sulfur, sulfate, aluminium, caesium. Code identifiers keep standard spellings (`color`).
8. **ASD-STE100 Simplified Technical English** for guides, help, tooltips, error messages and onboarding.
9. **No serif fonts anywhere.** No Times New Roman atom labels.
10. **Calm UI.** Blue family and neutrals only. One elevation level. Short, soft motion. It must not look like a generic startup template.

---

## 3. Why now (market context)

Evidence gathered on 14 October 2026:

- **ChemDraw went subscription-only.** Perpetual licences ended 1 January 2025. Versions 20–22 reached end of life on 30 September 2026.
- **The free tier collapsed in 2026.** Revvity (ChemDraw's owner) bought ACD/Labs and discontinued ChemSketch Freeware in August 2026 (2.5 million+ downloads). Certara ended free individual academic Marvin licences on 31 July 2026 and moved Marvin to a paid cloud subscription.
- **New entrants are moving in.** The main one is Zoho ChemStudio: free, web and desktop (it also works offline), and it opens ChemSketch files. Others are mostly web apps built on Ketcher and RDKit (ChemStitch, MolDraw) or AI figure generators (SciDraw, SciFig).
- **The gap:** no tool has a native catalytic cycle object or chemistry-aware layout. No tool combines a beginner auto-correct mode with an unrestricted pro mode.
- **Watch out:** ChemDraw users rate it 4.4/5. Site-licensed academics already get ChemDraw free. Octet must be clearly faster and better-looking to win them. Being free wins everyone else.

---

## 4. Users

| User | Situation | What wins them |
| --- | --- | --- |
| Undergraduate / A-level student | Struggles with ChemDraw, often has no licence after graduating | Beginner mode, free, no account |
| PhD / postdoc | Draws schemes, mechanisms, catalytic cycles and SI figures daily | Speed, layout tools, CDXML round-trip, ACS defaults |
| Teacher | Makes worksheets and slides, often no licence | Free, simple, clean export to slides |
| Independent / small biotech chemist | No site licence; would have to pay for ChemDraw | Free, professional output |
| Ex-ChemSketch / ex-Marvin user | Just lost a free tool | Free desktop app, file import |

---

## 5. Version 1 scope

### In scope

**Drawing core**
- Atoms, bonds (single, double, triple, aromatic, wedge, hash, wavy, dative/coordination, bold), rings and chains, charges, radicals, lone pairs, isotopes.
- Atom labels with automatic subscripts and correct label anchoring (e.g. OMe, CO2Et, NHBoc, PPh3).
- Abbreviations and superatoms (Ph, Me, Et, iPr, tBu, Ac, Boc, Ts, OTf, Cp, cod, etc.), expandable.
- Templates: common rings, amino acids, sugars, common ligands.
- Metals and coordination complexes drawn correctly, including multi-hapto (η) bonds.

**Beginner mode (auto-correct)**
- Snap bond angles to the correct geometry for the atom's hybridisation (sp: 180°, sp2: 120°, sp3: zig-zag 120° in 2D).
- Live valence checking with a visible, non-blocking warning (icon plus text).
- Implicit hydrogens shown on heteroatoms per ACS convention.
- Auto-clean of a selection or the whole drawing.
- Suggested corrections, e.g. "N3 has five bonds. Nitrogen has a maximum of four. Remove one bond or add a positive charge."

**Pro mode**
- No automatic changes. Free angles and lengths; any valence allowed.
- A per-object "lock" so auto-clean never touches chosen atoms or bonds.
- A mode switch that is first-class and visible, not buried in preferences. Per-document setting, with a global default.

**Chemistry-aware layout (the headline feature)**
- **Catalytic cycle object.** Choose N steps. Intermediates sit on nodes around a ring. Arc arrows join the nodes. Reagents enter and products leave on side arrows. Edit any intermediate and the cycle reflows and keeps its spacing. Clockwise by default; option for counter-clockwise. Optional centre label (catalyst name).
- **Scheme grid.** Structures, reaction arrows, conditions text and compound numbers snap into rows and columns with even spacing. Wrapping for long schemes. Automatic bold compound numbers (**1**, **2a**) under structures.
- **Smart snapping and alignment.** Snap to atoms, bond midpoints, structure centres and baselines. Live guides like a design tool. Distribute evenly. Align to page or journal column width (ACS single column 3.25 in / 8.25 cm, double column 7 in / 17.8 cm).
- **Text and boxes.** Styled title, subtitle, caption and annotation styles. Rounded and square callout boxes, highlight boxes around parts of a scheme, brackets. All use the brand type and colours, and can switch to the journal style on export.
- **Arrows.** Reaction, equilibrium, retrosynthetic, resonance, curly (two-electron) and fishhook (one-electron) arrows. Curly arrows snap from a bond or lone pair to an atom or bond, with editable curvature.

**Files and export**
- Native format: Octet's own file (JSON-based, versioned, human-readable).
- Import: CDXML, CDX (best effort), MOL/SDF (V2000 and V3000), SMILES, InChI.
- Export: PDF, SVG, PNG (with DPI), CDXML, MOL/SDF, SMILES, InChI.
- Copy and paste to Word, PowerPoint and Keynote as vector graphics.
- Paste a SMILES or name onto the canvas to draw the structure (name-to-structure can use an offline engine such as OPSIN; check its licence).

**App**
- Mac (Apple Silicon and Intel) and Windows 10/11.
- Light and dark mode chrome; the canvas stays white for print fidelity.
- Full keyboard shortcuts, with a command palette.
- Undo and redo with unlimited history.
- Autosave and crash recovery to local disk.

### Out of scope for version 1

NMR prediction, 3D views, property calculation beyond formula and mass, retrosynthesis, AI features, collaboration, biopolymers (HELM), Markush structures, a mobile app, and a web app. Leave clean extension points for these. Do not build them.

---

## 6. Technical direction

These are recommendations, not hard rules. If you find a better option, write a short decision note in `docs/decisions/` and explain why.

- **App shell:** Tauri 2 (Rust core, system webview). Small installers, native menus, offline, signing and notarisation support. Electron is the fallback if a blocking Tauri issue appears.
- **UI:** TypeScript, with a custom canvas or SVG renderer for the drawing surface. No component library that brings a "template" look; build controls from `brand/tokens.css`.
- **Chemistry engine:** RDKit (BSD licence) for valence, aromaticity, stereo, SMILES, InChI and MOL I/O. Use RDKit compiled to WebAssembly in the UI, or Rust bindings in the core. It must run fully offline.
- **CDXML:** check what RDKit already reads. Write and test a CDXML writer against real ChemDraw files. Build a test corpus of at least 50 real-world CDXML files (schemes, cycles, organometallics) and a round-trip test suite.
- **Layout engine:** your own code. This is the product. Model cycles, grids and snapping as first-class document objects, not as groups of loose shapes.
- **Licences:** use only permissive open-source dependencies (MIT, BSD, Apache 2.0). Record every dependency and its licence in `THIRD_PARTY.md`. Do not copy any ChemDraw UI assets, icons, names or documentation.

---

## 7. Build order

1. **Foundation:** Tauri shell, document model, canvas renderer, tokens wired in, undo/redo, local save.
2. **Drawing core:** atoms, bonds, rings, labels, ACS 1996 rendering that is pixel-correct against a ChemDraw reference.
3. **Chemistry engine:** RDKit integration, valence checks, SMILES/MOL I/O, clean-up.
4. **Beginner and pro modes.**
5. **Layout layer:** snapping and guides, scheme grid, text and box styles, arrows.
6. **Catalytic cycle object.**
7. **CDXML import and export** with the round-trip test suite.
8. **Export and clipboard:** PDF, SVG, PNG, Office paste.
9. **Packaging:** signed and notarised installers, auto-update, crash reporting (opt-in only).

Show Sam a working build at the end of steps 2, 5 and 6.

---

## 8. Definition of done (version 1)

- A first-time user draws aspirin in beginner mode in under 60 seconds with no help.
- An expert draws a four-step Suzuki catalytic cycle in under 3 minutes.
- A CDXML scheme from ChemDraw opens, is edited and saved, and reopens in ChemDraw with no visible change.
- Default export matches ACS 1996 measurements exactly.
- The app installs and opens on clean Mac and Windows machines with no warning and no account prompt.
- It works fully with the network turned off.
- All user-facing text passes a British English and STE check.
- All text meets 4.5:1 contrast in light and dark chrome, and every control shows a visible focus ring.

---

## 9. Brand summary

Full detail: `brand/BRAND.md`. Use `brand/tokens.css` for every value. Never hard-code a colour, font or size that a token covers.

| Element | Rule |
| --- | --- |
| Name | Octet (wordmark lowercase: "octet") |
| Mark | Kekulé benzene ring with one ring bond replaced by a dashed arrow. Drafts in `brand/logos/`. Use them as they are; Sam will redraw the final logo |
| Colours | Octet Blue `#1D49A7` (primary), Bright Blue `#2C6FFF` (logo arrow, focus, selection), Brand Mist `#DCE4F5`, Navy `#000E2F` (app icon tile), white canvas, cool neutrals. No other hues except status |
| Type | Instrument Sans for UI, display and atom labels. IBM Plex Mono for SMILES, InChI, formulae and coordinates. Both SIL Open Font License; bundle the font files with the app (no network fetch) and include the OFL licence |
| UI size | 13 px base UI text, like macOS |
| Shape | 4 px grid. Radii 6 / 10 / 16 px. One shadow (`--shadow-float`) for floating palettes and menus only |
| Motion | 150–200 ms ease-out. No bounce, no spring overshoot |
| Icons | 20 px line icons, 1.5 px stroke, round caps. Tools draw the real object (bond, hexagon, curly arrow) |
| Feel | Calm, precise, chill. Not academic, not a generic startup template (no Geist/Inter, no shadcn look, no gradient heroes) |

Note: `brand/tokens.css` imports the fonts from Google Fonts for convenience. In the app, replace that import with bundled local font files, because the app must work offline.

---

## 10. Voice and copy

- Short, relaxed, chemist-to-chemist. Real terms (wedge, hashed bond, curly arrow, Kekulé). No hype.
- STE rules for all help and UI text: one instruction per sentence; procedural sentences of 20 words maximum; start steps with a verb; active voice; one word per meaning (a "bond" is never a "line"); simple verbs (use, select, set, make sure); warnings before the step they apply to; name UI elements in bold.
- Example guide step: "1. Select the **Ring** tool. 2. Click the canvas. Octet adds a benzene ring."
- Example error: "N3 has five bonds. Nitrogen has a maximum of four. Remove one bond or add a positive charge."
- Never: "Unleash your molecular creativity!"

---

## 11. Open questions for Sam

Ask Sam these when they block you. Do not guess.

1. Linux support in version 1, or later?
2. Open source the app, or keep it closed source but free?
3. Which funding route comes first (grants, sponsorship, donations, institutional tier)? This decides whether to build accounts and sync early.
4. Final logo and app icon: when will they arrive? Use the drafts until then.
5. Auto-update: on by default, or ask on first launch?
