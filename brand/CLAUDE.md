# Octet brand rules for Claude Code

Octet is a chemical drawing app (a ChemDraw replacement). Every UI, page, guide and string you write for it must follow this folder.

## Read first
- `BRAND.md` is the brand book. Read it before any UI or copy work.
- `tokens.css` holds every colour, shadow, font, spacing, radius and drawing value as CSS custom properties, with light and dark themes. Import it once at the app root.
- `tokens.json` is the source for `tokens.css`. Change values there, then regenerate the CSS. Never hard-code a hex value, font name or px size that a token already covers.
- `logos/` holds the draft marks. Use the SVG files as they are. Do not redraw them.

## Hard rules
- Colours: blue family and neutrals only (`--brand`, `--brand-bright`, `--brand-mist`, `--navy`, neutrals). Do not add other hues. Status colours only for status.
- Fonts: Instrument Sans for all UI and text (`--font-sans`), IBM Plex Mono for SMILES, InChI, formulae and coordinates (`--font-mono`). No serif fonts. No Times New Roman. No Geist or Inter.
- Feel: calm and quiet. One elevation (`--shadow-float`). Motion 150–200 ms ease-out, no bounce. No gradients, no shadcn-default look, no template hero sections.
- Canvas: white (`--canvas`). Drawing defaults follow the ACS 1996 document style (`--bond-length`, `--bond-width` and the other drawing tokens).
- Spelling: British English for all user-facing text (colour, centre, optimise). Chemistry spelling follows IUPAC and the RSC: sulfur, sulfate, aluminium, caesium. Code identifiers keep standard spellings (`color`).
- Guides, help, tooltips, errors and onboarding: ASD-STE100 Simplified Technical English. One instruction per sentence, imperative verbs, active voice, max 20 words per procedural sentence.
- Accessibility: text 4.5:1 contrast in both themes, visible `--shadow-focus` on every control, real buttons and labels.
