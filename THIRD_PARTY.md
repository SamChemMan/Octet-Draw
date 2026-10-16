# Third-party software

Every dependency Octet uses, with its licence. Rules: [docs/licence.md](docs/licence.md).

| Library | Version | Licence | Used for |
| ------- | ------- | ------- | -------- |
| tauri, tauri-build (Rust) | 2.12 | Apache-2.0 OR MIT | Desktop shell and installers |
| @tauri-apps/cli | 2.12 | Apache-2.0 OR MIT | Build tool (dev only) |
| @tauri-apps/api | 2.12 | Apache-2.0 OR MIT | Calls from the page to the app (menu, save, open) |
| tauri-plugin-dialog (Rust) | 2.8 | Apache-2.0 OR MIT | Native Open and Save dialogs |
| indigo-ketcher | 1.46 | Apache-2.0 | Chemistry engine, CDX/CDXML |
| react, react-dom | 19.3 | MIT | UI |
| vite, @vitejs/plugin-react | 8.3, 6.1 | MIT | Bundler (dev only) |
| typescript | 7.0 | Apache-2.0 | Type checking (dev only) |
| @types/react, @types/react-dom | 19.3 | MIT | Type definitions (dev only) |
| Instrument Sans (@fontsource/instrument-sans) | 5.3 | OFL-1.1 | UI font |
| IBM Plex Mono (@fontsource/ibm-plex-mono) | 5.3 | OFL-1.1 | SMILES, InChI and formula font |
| @phosphor-icons/react | 2.1 | MIT | UI icons |
| OPSIN | 2.8.0 | MIT | Name to structure, compiled to JavaScript ([tools/opsin](tools/opsin/README.md)) |
| dk.brics.automaton | 1.12-4 | BSD-3-Clause | Used by OPSIN (one class modified) |
| TeaVM class library and runtime | 0.16.0 | Apache-2.0 | Runs OPSIN's Java as JavaScript |
| StAX API | 1.0.1 | Apache-2.0 | XML interfaces used by OPSIN |
| Unicode character data (in TeaVM) | TeaVM 0.16.0's copy | Unicode-3.0 | Case mapping in the OPSIN build. Sam approved, 16 October 2026 |

The OPSIN build's notices are in [src/vendor/opsin/NOTICES.txt](src/vendor/opsin/NOTICES.txt). The app ships them as `licences/opsin.txt`.
