# Octet

Octet is a chemical drawing tool built to replace ChemDraw. The brand should feel like a calm, precise instrument: quiet, fast and exact. It should never feel like legacy academic software, and it should never shout.

Octet shares Steps Blue with The Steps Foundation, so the two read as one family, but Octet is all blue and neutral: no warm accents.

## Principles

1. **Free for every individual, near-zero friction.** A hard promise. Octet is a native desktop app (Mac, Windows and Linux) that works fully offline. Download, install, draw: no account, no email wall, no licence key, no watermarks, no export limits, no trial timers. First launch opens straight to a blank canvas. An account is optional and only adds sync and sharing. Never design a sign-up gate, upsell modal or "Pro" lock in front of an individual feature.
1. **Chill by default.** Soft neutral chrome (`surface`, `hairline`), generous space, one colour family. Nothing flashes, bounces or competes with the drawing.
2. **The structure is the hero.** The canvas is white (`canvas`). Colour in the UI is for state (active tool, selection, focus), not decoration.
3. **Blue only.** `brand` does the work, `brand-bright` marks live interaction, `brand-mist` is the soft tint. Status colours appear only when something needs attention.
4. **Instrument, not paperwork.** No serif faces anywhere in the product, no Times New Roman atom labels, no grey bevelled toolbars. Instrument Sans for the interface, IBM Plex Mono for machine strings.
6. **Crafted, not templated.** Octet must not look like a generic startup template (Geist or Inter, shadcn cards, gradient hero). The type, the hexagon motif and the ACS-correct canvas are what make it ours.
5. **Journal-correct by default.** The `drawing` tokens match the ACS 1996 document style, so an export drops straight into a manuscript.

## Logo

The mark is a Kekulé benzene ring: three alternating double bonds, with one ring bond replaced by a dashed arrow in `brand-bright`. The ring says "chemistry", the arrow says "mechanism and movement", and the dashed stroke says "editable, in progress". Two blues keep it calm while the arrow still reads as the active part.

- **Primary:** `octet-mark.svg`, Octet Blue ring with a bright-blue arrow, on `canvas` or `surface`.
- **Reverse:** `octet-mark-reverse.svg`, white ring with a bright-blue arrow, on `navy`.
- **Wordmark:** "octet" in lowercase, Instrument Sans SemiBold (600), letter-spacing −0.03em, set in `ink`. Lockup gap between mark and wordmark = 0.3 × the mark height.
- **App icon:** the reverse mark centred on a `navy` tile with `radius-icon` corners, mark at 64% of the tile.
- **Clear space:** at least half the mark height on every side.
- **Minimum size:** 16px for the mark. Below 24px, drop the inner double bonds and keep the outer ring plus arrow.

These files are working drafts for the final logo. Redraw them on a proper grid before launch.

## Colour

| Token | Light | Role |
| --- | --- | --- |
| `brand` | #1D49A7 | Primary actions, active tool, the mark |
| `brand-bright` | #2C6FFF | The logo arrow, focus, selection handles, snap guides |
| `brand-mist` | #DCE4F5 | Selected tool, active row, soft tint |
| `navy` | #000E2F | App icon tile, footers |
| `canvas` | #FFFFFF | Drawing area |
| `surface` | #F8FAFC | App chrome and page ground |
| `ink` | #0F172A | Text and bonds |

Rules:

- **One family.** Every accent is a blue from the `brand` set. Do not add a second hue to "liven things up".
- **Navy is depth, not a background.** Use it for the icon tile and footers. Do not flood a section with it.
- **Status needs a second signal.** `warning` and `error` always come with an icon or text, never colour alone.
- **Element colouring is optional.** The `atom-*` tokens colour heteroatom labels when the user turns it on. Carbon stays `ink`. Default export is all `ink`, as journals expect.

## Typography

**Instrument Sans** (UI and display) and **IBM Plex Mono** (machine strings). Both are under the SIL Open Font License 1.1: free for commercial use, embedding in the app and redistribution. Load them from Google Fonts on the web, or bundle the official release files in the desktop app (keep the OFL licence file with them).

Why Instrument Sans: it is a clean, precise grotesque with the polish of San Francisco but a little more character, and it is not the default face of every startup template. IBM Plex Mono brings quiet scientific credibility to SMILES, InChI and formulae without looking like a code editor.

- App UI runs at 13px (`ui`), the same as macOS system UI.
- Headlines use weight 600 and negative tracking. Never use 800 or 900.
- Atom labels and captions on the canvas follow the document style. The default is ACS Document 1996, by the book: Arial at 10 pt (`atom-label-font`, `atom-label-size`). Export matches the page exactly. Subscripts at 70% size, dropped 0.25em.
- SMILES, InChI, formulae and coordinates use IBM Plex Mono (`smiles`, `formula`).
- The system stack (`-apple-system`, SF Pro) is the fallback, so the app still looks native before the fonts load.

## Space, shape and depth

- 4px base grid. Toolbars use `space-2` gaps, panels `space-4` padding.
- Controls use `radius-sm` (6px). Buttons and popovers `radius-md`. Panels and dialogs `radius-lg`.
- One elevation only: `shadow-float`, for floating palettes and menus. Panels sit flat, divided by `hairline`.
- Every control shows `shadow-focus` on keyboard focus.
- Motion is short and soft: 150–200ms ease-out fades and slides. No bounce, no spring overshoot.
  One exception, from Sam (16 October 2026): dragging an option onto the toolbar. The item settles into
  its slot and the other icons ripple a 2px bounce. It gives toolbar customising some character; it
  never touches the drawing. Reduced motion turns it off.

## Iconography

Every icon comes from [Phosphor Icons](https://phosphoricons.com) (MIT), Regular weight, at 20px. Chemistry tools Phosphor lacks (bond types, rings, curly and fishhook arrows) are drawn in Phosphor's style: 256-unit grid, 16-unit stroke, round caps and joins. Icons are drawn in `ink-muted`, and `brand` when active. No other icon sets. Chemistry tools draw the real object: the bond tool is a bond, the ring tool is a hexagon, the arrow tool is a curly arrow. No filled glyphs, no emoji, no clip-art flasks.

## Voice

Short, relaxed, chemist-to-chemist. Use the real terms (wedge, hashed bond, curly arrow, Kekulé) and skip the hype.

- Yes: "Paste a name, SMILES or InChI." / "Valence error on N3."
- No: "Unleash your molecular creativity!"

### Rule: British English, everywhere

Every word a user reads is British English: UI, guides, errors, marketing, emails, the website. No exceptions.

- **-our:** colour, behaviour, favourite. Never color, behavior.
- **-ise / -isation:** optimise, organise, recognise, customisation.
- **-re:** centre, metre (not center, meter).
- **Chemistry follows IUPAC and the RSC:** sulfur, sulfate, sulfide, sulfonyl (always "f", never "ph"), with aluminium and caesium kept British, as the RSC does. Chemical names, units and symbols follow current IUPAC recommendations, in the UI and in every export.
- **Other:** licence (noun) / license (verb), grey, analyse, catalogue, programme (except computer program), modelling, labelled, travelled.
- **Dates and units:** 14 October 2026, 24-hour time, SI units, °C.

Code is the one exception: CSS properties, API fields and token names keep their standard spellings (`color`, `center`), because the language requires them. Labels that show those values to users are still British.

### Guides, help and UI text: ASD-STE100

All guides, help pages, tooltips, error messages and onboarding follow **ASD-STE100 Simplified Technical English**. Marketing headlines can be looser, but anything that tells a user how to do something is STE.

- **One instruction per sentence.** Procedures: 20 words maximum. Descriptions: 25 words maximum.
- **Start procedural steps with a verb** in the imperative: "Select the bond tool." Not "You can select the bond tool."
- **Active voice only.** "Octet calculates the formula." Not "The formula is calculated."
- **Use one word for one meaning.** A "bond" is always a bond, never a "line" or "link". A "ring" is always a ring, never a "cycle" in UI text.
- **Use simple approved verbs:** use, select, push, move, set, make sure. Not utilise, leverage, navigate, configure.
- **No -ing forms for actions** and no phrasal verbs where a single verb works ("remove", not "take off").
- **Put warnings before the step** they apply to, never after.
- **Name the exact UI element** in bold: **Export**, **Bond length**, **Clean structure**.

Example, a guide step:

> 1. Select the **Ring** tool.
> 2. Click the canvas. Octet adds a benzene ring.
> 3. To fuse a second ring, click a bond on the first ring.

Example, an error:

> N3 has five bonds. Nitrogen has a maximum of four. Remove one bond or add a positive charge.
