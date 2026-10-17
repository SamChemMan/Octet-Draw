# Octet logo: final files

Replace the old hexagon logo everywhere in the app with these files. Use them as they are; never redraw or recolour the logo in code.

The mark is cyclooctatetraene: an eight-membered ring with four double bonds inside the top, left, bottom and right edges, Octet Blue (#1D49A7).

## App icon

| File | Use |
| --- | --- |
| `app-icon/app-icon-1024.png` | Source for Windows and Linux icons. In the Tauri project run `npx tauri icon app-icon/app-icon-1024.png` to regenerate `src-tauri/icons/` |
| `app-icon/app-icon-macos-1024.png` | macOS icon (tile inset 100 px on a 1024 canvas, per Apple's grid). Regenerate only `icon.icns` from this file and replace the one from the step above |
| `app-icon/app-icon-{64,128,256,512}.png` | Ready-made sizes for installers, Linux desktop entries and the website |
| `app-icon/*.svg` | Vector masters of the two icons |

Icon spec: cream tile #F3F0E9, mark at 75% of the tile, black (#000000) stroke on the tile edge at 2% of the tile width, corner radius 22.5%. Cream is for the app icon only, never the app UI.

## Logo

| File | Use |
| --- | --- |
| `logos/octet-mark.svg` | Main in-app mark (About window, setup welcome page, empty states) on white, `surface` or cream |
| `logos/octet-mark-reverse.svg` | White mark, on navy or Octet Blue only |
| `logos/octet-mark-mono.svg` | One-colour ink (#0F172A) mark |
| `logos/octet-mark-32.svg` / `.png` | Sizes 24–48 px (heavier strokes) |
| `logos/octet-mark-16.svg` / `.png` | Below 24 px, and the website favicon: ring only |
| `logos/octet-mark-512.png` | Raster mark for anywhere SVG is not supported |
| `logos/octet-lockup.svg` / `.png` | Mark plus "octet" wordmark (Instrument Sans Medium 500, tracking −0.03em). The SVG uses live text, so the app's bundled Instrument Sans must be loaded; the PNG has the text rendered |
| `logos/octet-lockup-reverse.svg` / `.png` | Lockup for navy or Octet Blue backgrounds |

Clear space: at least half the mark height on every side.
