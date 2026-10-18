# Third-party software

Every dependency Octet uses, with its licence. Rules: [docs/licence.md](docs/licence.md).

| Library | Version | Licence | Used for |
| ------- | ------- | ------- | -------- |
| tauri, tauri-build (Rust) | 2.12 | Apache-2.0 OR MIT | Desktop shell and installers |
| @tauri-apps/cli | 2.12 | Apache-2.0 OR MIT | Build tool (dev only) |
| @tauri-apps/api | 2.12 | Apache-2.0 OR MIT | Calls from the page to the app (menu, save, open) |
| tauri-plugin-dialog (Rust) | 2.8 | Apache-2.0 OR MIT | Native Open and Save dialogs |
| tauri-plugin-single-instance (Rust) | 2.5 | Apache-2.0 OR MIT | Windows and Linux: a file opened from Explorer or a file manager goes to the Octet that runs. On Linux it brings zbus, zvariant and endi (MIT) and the smol async crates (Apache-2.0 OR MIT) |
| svg2pdf, pdf-writer, subsetter (Rust, typst project) | 0.13, 0.12, 0.2 | MIT OR Apache-2.0 | Vector PDF of the drawing for export and the clipboard, with font subsets and the CDXML in the PDF |
| resvg, usvg (Rust, linebender) | 0.45 | Apache-2.0 OR MIT | Reads the drawing's SVG; draws the PNG export |
| tiny-skia (Rust) | 0.11 | BSD-3-Clause | Raster drawing for the PNG export (used by resvg) |
| fontdb (Rust) | 0.23 | MIT | Finds the system fonts to embed in PDFs (used by usvg) |
| slotmap (Rust) | 1.1 | Zlib | Used by fontdb. Zlib approved by Sam, 17 October 2026 |
| png (Rust) | 0.17 | MIT OR Apache-2.0 | Writes the PNG export with its resolution |
| miniz_oxide (Rust) | 0.8 | MIT OR Zlib OR Apache-2.0 | Compresses and reads the CDXML stream in PDFs |
| base64 (Rust) | 0.22 | MIT OR Apache-2.0 | ChemDraw's CDX from the clipboard, sent to the page |
| serde (Rust) | 1 | MIT OR Apache-2.0 | Export and paste data between the page and the app |
| serde_json (Rust) | 1 | MIT OR Apache-2.0 | The recent drawings list on Home (already in the build through Tauri) |
| objc2, objc2-foundation, objc2-app-kit (Rust) | 0.6, 0.3, 0.3 | MIT; MIT; Zlib OR Apache-2.0 OR MIT | The macOS clipboard (NSPasteboard). Already used by Tauri |
| objc2-web-kit, block2 (Rust) | 0.3, 0.6 | Zlib OR Apache-2.0 OR MIT; MIT | Feedback's picture of the window (WKWebView snapshot). Already used by Tauri |
| indigo-ketcher | 1.46 | Apache-2.0 | Chemistry engine, CDX/CDXML |
| Indigo's MoleculeCleaner2d and BiconnectedDecomposer (indigo-core) | 1.46.0 | Apache-2.0 | Clean Up's geometry, ported to TypeScript and changed in `src/clean2d.ts` (EPAM's copyright notice kept there) |
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
| nmrshiftdb2 data (measured spectra) | Download of 16 October 2026 | nmrshiftdb2 Database License (ODbL 1.0 with clause 4.5) | The ¹H and ¹³C shift table in [data/nmr/](data/nmr/README.md). Sam approved, 16 October 2026 (decision 0006) |
| thermo (Caleb Bell), Joback group values | 0.6.1, `thermo/group_contribution/joback.py` | MIT | The Joback & Reid group contribution table in `src/props.ts` (values only; Octet's own group typer) |
| Dimorphite-DL site table (Durrant lab) | 2.1.0, `dimorphite_dl/smarts/site_substructures.smarts` | Apache-2.0 | Ionisable groups with mean pKa and SD in `src/props.ts` (values only; Octet's own group tests) |
| PatWalters/solubility, ESOL coefficients | `esol.py`, master of 16 October 2026 | MIT | ESOL logS coefficients refitted for Crippen logP in `src/props.ts` |
| RDKit | 2026.09.1 | BSD-3-Clause | Reference values in `src/props.check.ts` (TPSA, rotatable bonds, aromatic atoms, logP, weight). Not shipped |

The OPSIN build's notices are in [src/vendor/opsin/NOTICES.txt](src/vendor/opsin/NOTICES.txt). The app ships them as `licences/opsin.txt`.
