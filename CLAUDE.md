# CLAUDE.md

Guidance for Claude Code sessions in this repository, both local on Sam's
Mac and in cloud sessions.

## Read first

1. [OCTET_BRIEF.md](OCTET_BRIEF.md): product, scope, build order and
   definition of done. Read it fully before any work.
2. [brand/CLAUDE.md](brand/CLAUDE.md) and [brand/BRAND.md](brand/BRAND.md)
   before any UI, icon or user-facing text work. Every value lives in
   `brand/tokens.json` and `brand/tokens.css`. There is no generator yet, so
   change both and keep them in step.
3. [docs/licence.md](docs/licence.md) before you add a dependency or
   anything that comes from studying ChemDraw.
4. [docs/decisions/](docs/decisions/): decisions that change the brief.

## Project

Octet is a free, open-source (Apache-2.0), native, offline desktop app for
drawing chemical structures. It replaces ChemDraw. Platforms: Mac, Windows and
Linux. Status: brief build step 1 (foundation).

Stack: Tauri 2 (Rust) shell, React + TypeScript + Vite for the UI, and
Indigo (`indigo-ketcher`, WASM) for chemistry and CDX/CDXML (see
[docs/decisions/0001-chemistry-engine.md](docs/decisions/0001-chemistry-engine.md)).
Octet draws structures itself as SVG. The app icon source is
`src-tauri/icons/app-icon.svg`.

## Hard rules (from the brief)

- Free for every individual. No trial timers, watermarks, export limits,
  licence keys, sign-up gates, upsell modals or Pro locks.
- Offline-first. Every feature works with no network. No account to start:
  first launch opens a blank canvas. Accounts are optional and only add
  sync and sharing. Files always save locally.
- Signed and notarised installers.
- CDXML import and export from version 1, with a round-trip test suite.
- New documents use ACS Document 1996 by the book (Arial 10 pt labels).
  Users can change the style. Export matches the page exactly.
- When a question in section 11 of the brief blocks you, ask Sam. Don't
  guess.

Colours, fonts, British English, STE and accessibility rules are in
`brand/CLAUDE.md`.

## Product priorities

The top priority is that Octet is a pleasure to use: super smooth and
snappy with no lag, well designed and really well animated (within the
motion rules in `brand/`), better looking than ChemDraw, with better
features and good templates. It caters for everyone. It isn't daunting at
first sight, but it has a huge depth of features for people who go looking.
Final Cut Pro is the model for this.

Sam's additions to the brief (14 October 2026), in no strict order:

- Paste into Word, PowerPoint and Keynote as a sharp vector picture that
  resizes cleanly, copy it back into Octet to edit, and change atom colours
  inside Office.
- Keyboard drawing as fast as ChemDraw's hotkeys.
- Crash safety: autosave, recovery and atomic saves.

Ideas to explore:

- A radial menu at the cursor, like Vorssaint's: hold a key or mouse
  button, point, release. Use it for quick molecules and templates, and
  quick actions such as clean-up. Keep item positions fixed so experts can
  flick without looking, as in Maya's marking menus and Blender's pie
  menus.

## Security

Security is a top priority.

- No account required, no licence checks, no telemetry. Crash reports and
  sync are opt-in. The auto-update default is an open question (brief
  section 11).
- Treat every opened or pasted file as hostile. Parse it with bounds
  checks and limits on size and nesting. No `unsafe` Rust for parsing.
- Keep the CSP in `src-tauri/tauri.conf.json` strict. No remote scripts,
  styles or fonts.
- Grant Tauri capabilities per feature, with the narrowest scope that
  works (for example, file access only to files the user picked).
- Never pass file or clipboard content to `eval`, `innerHTML` or
  `dangerouslySetInnerHTML`.
- `.npmrc` blocks install scripts. Commit lockfiles. Run `npm audit` and
  `cargo audit` before each release. Check the maintainer and licence of
  every new dependency.
- Releases: signed and notarised installers, and signed updates.

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
- Record significant technical decisions in `docs/decisions/`.

## Licences

- Add only dependencies with permissive licences: MIT, BSD, Apache-2.0,
  ISC. Fonts may use OFL-1.1. Ask Sam before you add anything else.
- Never add GPL or AGPL code, for example Open Babel.
- Record each dependency in [THIRD_PARTY.md](THIRD_PARTY.md).

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
- Guide: `~/octet-research/REA-GUIDE.md`.

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
