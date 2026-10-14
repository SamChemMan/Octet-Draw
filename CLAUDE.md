# CLAUDE.md

Guidance for Claude Code sessions in this repository, both local on Sam's
Mac and in cloud sessions.

## Project

Octet is a free, open-source (Apache-2.0) chemical structure drawing
editor that aims to be a better alternative to ChemDraw. Status: planning.
There is no code and no chosen tech stack yet.

Read [docs/licence.md](docs/licence.md) before you add a dependency or
anything that comes from studying ChemDraw.

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

## Git

- Local and cloud sessions share this repository through GitHub. Pull
  before you start and push when you finish.
- Work on a branch. Merge into `main` only when Sam asks.
