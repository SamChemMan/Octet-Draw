# Roadmap

Updated 12 November 2026.

This page lists the releases, the work that is built for the next releases, and the work that is not started.
The notes for each release are in `docs/release-notes/`. The decisions are in `docs/decisions/`.

Sam says when a release goes out. Releases go out on Fridays. Nothing is pushed before Sam says.

## Releases

| Version | Date | Main changes |
|---|---|---|
| 1.0.x | October to 2 November 2026 | The first public releases. 1.0.26 is the first signed and notarised Mac release. A window for each drawing (decision 0020). |
| 1.1.0 | 4 November 2026 | Experiment page, the Experiments list on Home, catalytic cycle side arrows. |
| 1.1.1 | 6 November 2026 | Sequence tool, metallocenes, 88,000 more names in Name to Structure, ChemDraw file fixes. |
| 1.1.2 | Planned: Friday 13 November 2026 | See below. |
| 1.2 | No date | Octet for AI apps (MCP). See below. |

## 1.1.2: built, not released

Branch: `release-1.1.2`. The version number is set and the notes are written (`docs/release-notes/1.1.2.md`).

Main changes:

- Spectrum panels with Minimise, Full screen and Close. A minimised spectrum is a pill beside its structure.
- ¹⁹F and ³¹P NMR prediction.
- 15 new template sets with 251 new templates.
- Gel and Plasmid map tools, and membranes as a line style.
- One colour system, with Pick from screen.
- The stoichiometry table reads reagents over the arrow, ions and coefficients (issues 131 to 136).
- Settings > Pro and File > More Formats: CML, BMP, 3MF, connection tables, SLN, chemfig, CIF and mmCIF.
- Paste into Word for Windows as an object that opens in Octet (issue 24, decision 0023).
- Word for Mac: File > Edit Picture from Word opens the picture that is selected in Word, and Update in Word puts the
  changed picture back (decision 0023, "Mac, Linux and the web"). A double-click in Word does the same only after the
  user turns it on in Settings > General > Word. It is off until then.
- LibreOffice on Linux (issue 48, decision 0025): Settings > General > Add to LibreOffice adds Octet's extension. A
  double-click on a structure in Writer, Impress or Draw then opens it in Octet, and Update puts it back.
- The fix for the 1.1.1 crash with a large drawing.
- A Flatpak test build in CI, for slow drawing on Linux with NVIDIA (issue 37).
- Windows code signing is ready in CI. It needs one secret (issue 17).
- Decision 0024: no release takes a feature away or makes one slower. `docs/removals.md` lists each approved removal.

To do for the release:

1. Sam says go.
2. Publish the release.
3. Post the Flatpak link in issue 37. Ask the reporter to test it.
4. Close the issues that 1.1.2 fixes.

Merged on 11 November: dashed and bold orbitals (issue 139), the Photochemistry set (43), gels and plasmid maps (96),
membranes (95), six more laboratory templates (98), the polyhedra frames and C70 (97), and the seven bug fixes and the
code clean-up from the code review. Added on 12 November: the Office work for the Mac and LibreOffice. Built on a
branch and not merged: charts (`item/charts`).

Not tried in the Office work: the Mac part in a signed build, and the Service "Edit in Octet Draw" in Word's Services
menu (tried with Word 16.115 in a development build only); LibreOffice with a real AppImage and on x86_64 (decision
0025, "Not done").

## 1.2: Octet for AI apps (MCP)

Branch: `release-1.2-mcp`, on GitHub since 11 November 2026. The plan (`docs/plans/mcp-v2.md`) and the tests
(`docs/plans/mcp-v2-tests.md`) are on that branch only.

An AI app draws in Octet through Octet's MCP server. The MCP must have every function that the app has.
Scripting (issue 89) and batch conversion (issue 91) use the same engine, with no window.

Built (11 November 2026):

- The benchmark runner, lenient arguments and short replies (plan steps 0 and 1).
- The brief: an AI app asks the user three questions before it draws a scheme (step 2).
- Compounds written as changes to earlier compounds, with named transformations (steps 3a and 3b).
- `draw_route`: a full synthesis in one call (step 4).
- Five tools: `draw`, `change`, `read`, `drawings` and `advanced` (step 5).
- The overlay: a molecule builds in the window while an AI app works (step 6).
- Several AI sessions at the same time, each in its own drawing.
- Octet with no window: `--headless --mcp` for scripts and `--convert` for folders of drawings (steps 9 and 10).

Not built:

- Questions to the user through MCP elicitation (step 7).
- Background jobs, with progress in the overlay (step 8).

To do before the release:

1. Merge `release-1.1.2` into `release-1.2-mcp` when Sam says (plan section 17.3).
2. After that merge, give `place_template` the new template sets and give `run_command` the spectrum commands
   (plan section 15.2).
3. Test with one AI app that is not from Anthropic. This needs Sam's sign-in.
4. Sam answers the open questions in plan section 16.

## Checks that wait

| Check | Waits for |
|---|---|
| A VoiceOver, Narrator and NVDA session on the canvas and the menus (decision 0019) | Sam to allow accessibility access on the Mac |
| The ChemDraw checks in Sam's notes (`chemdraw-checks-pending.md`) | A session on Sam's Mac with ChemDraw open |
| Search Reaxys in the built app (decision 0008) | Sam to say what failed. Ask Sam before you start. |
| Quit from the Dock: a real logout or restart, and Save from the question on a new drawing | A test on Sam's Mac |
| A signed Windows installer | The Windows certificate. It was under verification on 4 November. Then add the secret (`docs/release.md`). |

## Open on GitHub

Problem reports:

- 140: the Single bond tool does not change an aromatic double bond to a single bond.

Requests that are not built:

| Area | Issues |
|---|---|
| Drawing | 85 (3D measurement objects), 93 (pen and touch), 101 (document annotations), 102 (annotate one object), 107 (objects from other programs in a drawing) |
| Windows | 73 (Tile and Cascade; the list of open drawings is in 1.1.2) |
| Files | 68 (data fields that go into SDF), 103 (ISIS/Draw files), 104 (SMD, ChemNote and CHM files), 111 (NMR assignments to and from Mnova), 117 (export to an electronic lab notebook) |
| Search | 114 (supplier lookup) |
| Help | 94 (tutorials and example drawings) |
| Platforms | 48 (Android), 92 (a browser version; see "The editor as a web component") |

Pull requests: 61, 62, 65, 66, 124, 126, 127, 128, 137 and 138 are open. Sam decides each one. 1.1.2 has the
features of five of them: fishhook arrows (65), label colours (66), circled charges (124), chemfig (127) and the
stoichiometry table (137).

## Later

Sam parked these. Do not start them before Sam says.

- Institutional features.
- The other Octet apps.
- Tile and Cascade for drawing windows (issue 73).

### A Mac App Store build

Sam agreed to this on 3 November 2026. It is a separate build. Not started.

- Turn on the App Sandbox.
- Keep access to the recent files on Home with security-scoped bookmarks.
- Turn the updater off in the Store build.
- Make the Store certificates and the provisioning profile.
- Write the App Store listing.

### The editor as a web component

A user asked on 3 November 2026 for Octet's editor as a component that web apps can embed (ELNs, LIMS, journal
submission and teaching sites). Sam wants it after 1.x. Issue 92 asks for a browser version.

- On 3 November, 9 of about 200 files in `src/` called the desktop shell: `Actions.tsx`, `App.tsx`, `crashlog.ts`,
  `Home.tsx`, `Editor.tsx`, `homeApi.ts`, `export.ts`, `Feedback.tsx` and `About.tsx`.
- The other files are React and TypeScript, and Indigo is WASM. They run in a browser now (the `octet-ui-only`
  preview).
- Until this work starts, put new shell calls in those 9 files only.
- The work:
  1. Put the shell calls behind one interface, with a desktop version and a web version.
  2. Give the editor an API: load and get SMILES, MOL and CDXML, and an event when the drawing changes.
  3. Publish it on npm as a React component and a web component.
  4. Write the documents and a demo page.
- Decide how to version the API before the first release. Apps that embed Octet depend on it.
- Other editors that web apps embed: Ketcher (Apache-2.0), Marvin JS, ChemDraw JS and JSME.
- Companies that embed Octet are the organisations most likely to pay for support.

### Idea: compound numbers in Word

Not scheduled (7 November 2026). Compound numbers in a Word document that renumber themselves: marks in the text
and in pasted drawings become 1, 2a and so on, and each chapter has its own numbers. Reactio Draw does this.
Reactio Draw is AGPL-3.0, so use none of its code. Design Octet's own, with the Word object and an Office add-in.

## Done from the roadmap of October 2026

| Work | Result |
|---|---|
| Updates on by default | Done (decision 0010). |
| ChemDraw file fidelity | Done: 68 of 68 CDXML round trips. |
| Template and clip-art library (audit item CD-32) | Done (decision 0017): 292 templates in 16 sets. 1.1.2 adds 15 sets. |
| Template features: edit, order by drag, floating palettes, sizes, `.ctp` and `.cts` files | Done (decision 0018). |
| Measured spectra with peak assignment (audit item CH-29) | Done (decision 0016). |
| Mass Spec Analysis (audit item CH-40) | Done. |
| Names of mixtures, clusters and metal complexes | Done: 6855 of 6924 named right, 0 wrong. |
| Windows and Linux test runs in CI | Done: each run passes every step. |
| Screen readers: the menus on Windows, and the structures on the canvas | Done (decision 0019). The real session is in "Checks that wait". |
| The website | Done: octet.software is live since 30 October 2026. |
| Mac signing and notarisation | Done from 1.0.26 (2 November 2026). |
| The release workflow on GitHub | Done: it builds each release. |
