# CLAUDE.md

Guidance for Claude Code sessions in this repository, both local on Sam's
Mac and in cloud sessions.

## Project

Octet is a free, open-source (Apache-2.0) chemical structure drawing
editor that aims to be a better alternative to ChemDraw. It ships as a
downloadable desktop app for Mac, Windows and Linux. Status: early
development.

Stack: Tauri 2 (Rust) desktop shell, React + TypeScript + Vite for the UI,
and Indigo (`indigo-ketcher`, WASM) for chemistry and CDX/CDXML. Octet draws
structures itself as SVG from Indigo's coordinates.

Read [docs/licence.md](docs/licence.md) before you add a dependency or
anything that comes from studying ChemDraw.

Read [brand/CLAUDE.md](brand/CLAUDE.md) before any UI, icon or user-facing
text work. Use the tokens in `brand/tokens.css`. The app icon source is
`src-tauri/icons/app-icon.svg`.

## Product priorities

The top priority is that Octet is a pleasure to use: super smooth and
snappy with no lag, well designed and really well animated (within the
motion rules in `brand/`), better looking than ChemDraw, with better
features and good templates. It caters for everyone. It isn't daunting at
first sight, but it has a huge depth of features for people who go looking.
Final Cut Pro is the model for this.

Important features from the ChemDraw complaints research (October 2026),
in no strict order:

- Paste into Word and PowerPoint as a sharp vector picture that resizes
  cleanly, copy it back into Octet to edit, and change atom colours inside
  Office.
- Keyboard drawing as fast as ChemDraw's hotkeys.
- CDX and CDXML read and write that ChemDraw opens cleanly.
- ACS 1996 output and exact-size export.
- Crash safety: autosave, recovery and atomic saves.

Ideas to explore:

- A radial menu at the cursor, like Vorssaint's: hold a key or mouse
  button, point, release. Use it for quick molecules and templates, and
  quick actions such as clean-up. Keep item positions fixed so experts can
  flick without looking, as in Maya's marking menus and Blender's pie
  menus.

## How to build

- Code: use `/ponytail ultra`. Write the smallest change that works.
  Ponytail never removes accessibility, data safety or anything Sam asked
  for.
- UI: load `/impeccable`, `/emil-design-eng` and `/design-taste-frontend`
  before UI work. Measure interactions against the best apps for each job:
  Apple's Human Interface Guidelines for Mac conventions, Final Cut Pro for
  a simple surface over deep features, Figma and Sketch for canvas
  selection, snapping, zoom and nudging, and Linear and Things for calm,
  keyboard-first chrome.
- When they disagree: `brand/` decides look and copy, then accessibility,
  then the design skills, then ponytail on code size.
- These skills are installed on Sam's Mac only. Cloud sessions follow
  `brand/`.

## Licences

- Add only dependencies with Apache-compatible permissive licences: MIT,
  BSD, Apache-2.0, ISC. Ask Sam before you add anything else.
- Never add GPL or AGPL code, for example Open Babel.
- Record each dependency in the table in `docs/licence.md`.

## Clean room (ChemDraw)

This repository is public.

- Never commit, paste or quote ChemDraw code, disassembly, decompiler
  output, REA Evidence, icons, templates, text or files. This applies to
  code, docs, commit messages, issues and pull requests.
- Put all reverse-engineering output and notes in `~/octet-research/` on
  Sam's Mac, outside this repository.
- Write specifications in `docs/` only from public documentation and
  observed behaviour, in your own words.
- Decompile only for compatibility: CDX, CDXML and clipboard formats.
  Never touch licence or activation code.
- Use only files Sam created as test files.

## Reverse-engineering tools (Sam's Mac only)

- The REA MCP server is registered for Claude Code on Sam's Mac.
- Default engine: Ghidra 12.1.4. Pass `provider_id: "ghidra"` to
  `open_binary`.
- IDA Free 9.3 reads Intel (x86_64) code only, and its licence is for
  non-commercial use. Use it only as a second opinion, and only after
  Sam confirms its licence terms fit. It needs IDA open with the target
  loaded and Edit → Plugins → MCP started.
- ChemDraw 22.2.0 is at `/Applications/ChemDraw 22.2.0.app`. Its main
  executable is x86_64 only.
- Cloud sessions have no ChemDraw, Ghidra or IDA.

## Workflow

1. Pull before you start. Local and cloud sessions share this repository
   through GitHub.
2. Make the change.
3. Show Sam a preview: run the app so its window opens on Sam's Mac, or
   show the diff when there is nothing to run.
4. When Sam approves, commit and push straight to `main`. No branches or
   pull requests are needed. This is standing permission from Sam.

Never force-push or rewrite history on `main`.

Preview command: `npm run tauri dev` (needs Node and Rust). Cloud sessions
without Rust can run `npm run dev` to serve the UI at http://localhost:1420.
