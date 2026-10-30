# Octet Draw

Developed by [Sam Ellis](https://www.linkedin.com/in/sam-ellis-132781206/) and our mate Claude.

[Instagram](https://www.instagram.com/samellis2004/)
[LinkedIn](https://www.linkedin.com/in/sam-ellis-132781206/) 

Please hmu on LinkedIn if you have questions or urgent requests.

A chemical structure drawing app for the 21st century.
Octet Draw is a free, offline desktop app for Mac, Windows, and Linux.
Part of the Open-source Chemistry Toolkit for Experiment & Theory

## Download

Get the latest version from [octet.software](https://octet.software) or the
[Releases page](https://github.com/SamChemMan/Octet-Draw/releases/latest).

| Computer | File |
| -------- | ---- |
| Mac | `Octet-Draw-mac.dmg` (Apple silicon and Intel) |
| Windows | `Octet-Draw-windows.exe`. For a PC with no internet: `Octet.Draw_<version>_x64-offline-setup.exe` |
| Linux | `.deb` (Ubuntu, Debian), `.rpm` (Fedora) or `Octet-Draw-linux.AppImage` |

To uninstall: on a Mac, drag Octet Draw from Applications to the Bin. On Windows, Settings > Apps > Installed
apps > Octet Draw > Uninstall. On Linux, remove the package with your package manager, or delete the AppImage.

## System requirements

- macOS 12 Monterey or later, on Apple silicon or Intel.
- Windows 10 or 11, 64-bit.
- Linux, 64-bit, with WebKitGTK 4.1 (for example Ubuntu 22.04 or Debian 12, or later).

Octet needs no account and no internet connection.

## What it does

- Draws structures, reactions, arrows, shapes and text, with ChemDraw's keyboard shortcuts.
- Starts each drawing in the ACS Document 1996 style. Settings has other journal styles.
- Opens and saves ChemDraw files (CDXML and CDX). Imports and exports MOL, SDF, SMILES and InChI.
- Exports PDF, SVG and PNG. On the Mac, Copy puts the drawing into Word, PowerPoint and Keynote, and it pastes
  back into Octet or ChemDraw as a structure.
- Turns names into structures and structures into names, offline.
- Predicts ¹H and ¹³C NMR shifts, and shows formula, mass and other properties.

## Report a problem

Use Help > Report a Problem in Octet, or open an [issue](https://github.com/SamChemMan/Octet-Draw/issues/new).
For a security problem, follow [SECURITY.md](SECURITY.md) instead.

## Run from source

You need [Node.js](https://nodejs.org) 24 and [Rust](https://rustup.rs).

```bash
npm install
npm run tauri dev
```

`npm test` runs the type check and every check file. [docs/release.md](docs/release.md) tells how releases are
built and signed.

## Sam

Hello everyone, 
I'm currently a student in the [Nitschke](https://www.nitschkegroup-cambridge.com/) group at The University Of Cambridge. 
Previously, I was an undergraduate at The University Of Manchester.

Chemistry is fantastic, but communicating it is extremely difficult. This is my first attempt to make it
ever-so-slightly easier.

Always up for a chat about my research, this project, or anything else.

Reach me Sam[at]Octet.world
or, for chemistry, Spe29[at]cam.ac.uk

## Privacy

Octet works with no network: no account, no licence check, no analytics, no crash reporting.
It goes online only in these cases:

- **Update check.** When it opens, Octet asks GitHub whether a newer version exists. It sends no drawings,
  files or personal details. Turn it off in Settings > General > Updates. See
  [decision 0010](docs/decisions/0010-updates.md).
- **Search Reaxys** opens Reaxys (Elsevier) in your browser with the selected structure in the address, only
  when you press it.
- **Search PubChem** opens PubChem (the US National Library of Medicine) in your browser with the selected
  structure in the address, only when you press it.

The structure stays in your browser's history. To hide both searches, turn off
Settings > Import and export > Online search. See
[decision 0008](docs/decisions/0008-online-search.md).

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/). This covers the Windows installers, which GitHub Actions builds
from this repository. Each release is signed only after a person approves it.

- Committers and reviewers: [Sam Ellis (SamChemMan)](https://github.com/SamChemMan)
- Approvers: [Sam Ellis (SamChemMan)](https://github.com/SamChemMan)

Privacy: see above. The policy is also at [octet.software/code-signing.html](https://octet.software/code-signing.html).

## Licence

Octet is free and open-source software under the
[Apache License 2.0](LICENSE).

Copyright © 2026 Sam Ellis. Built with love in Manchester and Cambridge

See the [licence plan](docs/licence.md) for the rules on third-party
libraries and on studying other software.
