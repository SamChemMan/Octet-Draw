# Licence plan

Status: decided, 14 October 2026. This is a plan, not legal advice.

## Decision

Octet is free and open-source software under the
[Apache License 2.0](../LICENSE).

- Anyone (students, universities, companies) can use, change and share
  Octet, and build it into other products.
- Every contributor gives a patent licence for their contributions, which
  protects users.
- The main chemistry libraries use the same family of licences (RDKit,
  Ketcher, Indigo, OPSIN), so Octet can use them and they can use Octet.

Accepted trade-off: someone can make a closed version of Octet.

This replaces the earlier plan for paid institutional licences.

## Contributions

Apache-2.0 section 5 licenses each contribution under Apache-2.0 unless
the contributor states otherwise, so no separate contributor agreement is
needed. If the project gets outside contributors, consider asking for a
Developer Certificate of Origin sign-off (`git commit -s`).

## Third-party libraries

Every library in Octet must have a licence that is compatible with
Apache-2.0.

- **Allowed for fonts only:** SIL Open Font License 1.1 (OFL-1.1). Keep
  each font's licence file with the app.
- **Allowed:** MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC. For
  example: RDKit (BSD-3-Clause), OPSIN (MIT), Ketcher (Apache-2.0),
  Indigo (Apache-2.0), OpenChemLib (BSD-3-Clause).
- **Ask first:** LGPL, MPL-2.0, EPL and any other licence.
- **Not allowed:** GPL and AGPL (for example Open Babel), licences that
  forbid commercial use, and code with no licence.

Keep this list current and ship each library's licence notice with Octet.

| Library | Version | Licence | Used for |
| ------- | ------- | ------- | -------- |
| tauri, tauri-build (Rust) | 2.12 | Apache-2.0 OR MIT | Desktop shell and installers |
| @tauri-apps/cli | 2.12 | Apache-2.0 OR MIT | Build tool (dev only) |
| indigo-ketcher | 1.46 | Apache-2.0 | Chemistry engine, CDX/CDXML |
| react, react-dom | 19.3 | MIT | UI |
| vite, @vitejs/plugin-react | 8.3, 6.1 | MIT | Bundler (dev only) |
| typescript | 7.0 | Apache-2.0 | Type checking (dev only) |
| @types/react, @types/react-dom | 19.3 | MIT | Type definitions (dev only) |
| Instrument Sans (@fontsource/instrument-sans) | 5.3 | OFL-1.1 | UI and atom label font |
| IBM Plex Mono (@fontsource/ibm-plex-mono) | 5.3 | OFL-1.1 | SMILES, InChI and formula font |

## Clean-room rules for studying ChemDraw

The repository is public. Octet must contain no ChemDraw code or assets,
and nothing learned by decompiling ChemDraw may be published.

- Study ChemDraw only with your own licensed copy.
- Observe and test its behaviour freely. You can describe behaviour in
  public specifications, in your own words.
- Decompile only for compatibility: CDX and CDXML files, and clipboard
  formats.
- Keep decompiled code, disassembly, REA output and all notes from
  decompiling in `~/octet-research/`, outside this repository. Never put
  them in code, docs, commits, issues or pull requests.
- Write specifications in `docs/` only from public documentation and
  observed behaviour. Build Octet from those specifications.
- Never copy ChemDraw code, icons, templates, text, sample files or data.
- Never touch licence or activation code.
- Use only files you created yourself as test files.
- Do not use "ChemDraw" in Octet's name or logo. Every comparison in
  marketing must be true.

Why the decompiling notes stay private: UK law (Copyright, Designs and
Patents Act 1988, section 50B) and EU law (Directive 2009/24/EC,
article 6) allow decompiling for interoperability, but they restrict
giving the information obtained to others beyond what interoperability
needs.

## Open decisions

- [ ] **Name check.** Make sure "Octet" is free to use as a software
      name before launch.
- [ ] **IDA Free.** Its licence is for non-commercial use. Check
      Hex-Rays' terms before using it for Octet. Ghidra has no such limit.
- [ ] **Funding (optional):** donations, grants, sponsorship, or a paid
      hosted version.
- [x] **Tech stack.** Decided 14 October 2026: Tauri 2, React,
      TypeScript, Vite and Indigo. See `CLAUDE.md`.
