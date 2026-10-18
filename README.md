# Octet

Developed by [Sam Ellis](https://www.linkedin.com/in/sam-ellis-132781206/) and our mate Claude.

[Instagram](https://www.instagram.com/samellis2004/)
[LinkedIn](https://www.linkedin.com/in/sam-ellis-132781206/) 

Please hmu on LinkedIn if you have questions or urgent requests.

A chemical structure drawing app for the 21st century.
Octet is a free, offline desktop app for Mac, Windows, and Linux.

## Download

Get the latest version from the [Releases page](https://github.com/SamChemMan/Octet-Draw/releases/latest).
No release is out yet. Until then, run Octet from source (below).

| Computer | File |
| -------- | ---- |
| Mac | `Octet_<version>_universal.dmg` |
| Windows | `Octet_<version>_x64-setup.exe`. For a PC with no internet: `Octet_<version>_x64-offline-setup.exe` |
| Linux | `.deb` (Ubuntu, Debian), `.rpm` (Fedora) or `.AppImage` |

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

Octet works with no network and sends nothing on its own: no account, no telemetry.
Two commands send a structure off your computer, and only when you press them:

- **Search Reaxys** opens Reaxys (Elsevier) in your browser with the selected structure in the address.
- **Search PubChem** opens PubChem (the US National Library of Medicine) in your browser with the selected structure in the address.

The structure stays in your browser's history. To hide both commands, turn off
Settings > Import and export > Online search. See
[decision 0008](docs/decisions/0008-online-search.md).

## Licence

Octet is free and open-source software under the
[Apache License 2.0](LICENSE).

Copyright © 2026 Sam Ellis. Built with love in Manchester and Cambridge

See the [licence plan](docs/licence.md) for the rules on third-party
libraries and on studying other software.
