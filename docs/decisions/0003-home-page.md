# 0003: Octet opens to a Home page

Status: decided by Sam, 16 October 2026. Changes brief section 2, principle 3 ("The first launch opens
straight to a blank canvas").

## Decision

Octet opens to a Home page, as Photoshop and similar apps do. Home shows the user's recent drawings as
thumbnails, with New drawing as the first and largest choice. It is Octet's own file management:
recent files, and later pinned and searched ones.

## Keeping friction near zero

The brief's principle still holds in spirit: download, install, draw.

- Home needs no account and asks nothing.
- Return, ⌘N or a click on New drawing opens a blank canvas at once.
- On first launch, Home has no recent drawings, so New drawing is the obvious next step.

## Open questions

- Whether Home also offers templates (ACS scheme, mechanism, catalytic cycle) on New drawing.

## How it is built (17 October 2026)

- Home greets the user by name and time of day ("Welcome to Octet" on the first visit, "Welcome back" after a
  week away). New is the first row: Paper, Thesis, Slides and Poster, then the user's own purposes (decision 0007);
  recent drawings follow as pictures; Open… is beside New. File >
  Home returns to it. Return makes a new drawing for the purpose picked last; the arrow keys move between tiles.
- First launch asks the user's name (in the dotted frame of a selected group; Skip leaves it out), then opens
  a new drawing with the tutorial (src/Coach.tsx). A card at the top of the page gives one step at a time: draw
  two bonds, add a ring, label an atom O, hold to select, hold to move, clean up, copy. The user does each step
  on the page and the card goes on when it sees it done, as ChemDraw's Help > Tutorials have the user draw.
  Skip is at the card's bottom right. Octet > Tutorial, or Tutorial in the command palette on every platform, starts
  it again on a new drawing.
- The app keeps the recent drawings list (src-tauri/src/recent.rs). A recent drawing opens without the file
  dialog only if the user opened or saved it before.
- New, Open and a recent drawing ask to save unsaved changes first.
- An account (sign-in, sync) is for later, before launch; nothing on Home needs one.

## Quick start and templates (18 October 2026)

Sam: "Top left on home screen needs to have the logo and Octet MUCH larger. 4x from now. In the 'new' there needs to
be 'quick start' which is just like a seamless canvas for messing around / getting one or two structures to print or
something (what we had before). It should be the default left hand side selection. These other bits should be
'templates'. There should be custom template option." This changes the Home bullet in decision 0007 (Purposes).

- The lockup at the top left is 96 px high (it was 24 px).
- New starts with Quick start, selected when Home opens. Return on Home starts it. It is the document style at 100%
  (ACS Document 1996), with page edges off and no purpose, so the canvas shows no page and no outlines. Its picture
  is an open canvas with faint dots.
- Paper, Thesis, Slides, Poster and the user's own sit beside Quick start under Templates. In the interface a purpose
  is a template; the code keeps the name purpose.
- Custom template, at the end of Templates, asks for a name and the template to start from, then opens Settings >
  Document for the new template alone. Its changes go to the template, and its tile on Home changes with them. Done or
  Escape closes it. Octet keeps 12 templates of the user's own; at 12, Custom template does not show.
- ⌘N and File > New start the one picked last (Quick start or a template), as ChemDraw's New takes the stationery
  used last. File > New For lists Quick start first, then the templates, as Home does. Use for new documents on a drawing with no template keeps the style for Quick start.
- ChemDraw: File > New Document uses the default stationery; File > New from Stationery lists the pads; a pad of the
  user's own is a document whose settings are saved with File > Save As Stationery.

## Projects, sections and thumbnails (28 October 2026)

Sam: "Make it so we can make folders on the welcome screen. Make New, Templates, Recents, Projects (the name of this new
folder section) a bit more clearly separated. Allow custom thumbnails as well."

- Home has four sections, in this order: New, Templates, Recent, Projects. Each has a heading in ink under a hairline.
  New and Templates share one band, with a hairline between them. Open… is on Recent's heading row, as it opens a
  drawing that is not on the list.
- A project is a list in Octet that points at drawings, as an album in Photos does. It is not a folder on disk: the
  files stay where they are, and Delete project… never deletes a drawing (it asks first, and says so).
- A drawing can be in more than one project. This is simpler than one project for each drawing: Add to project only
  adds, so there is no Move, and nothing comes out of another project first. Albums, playlists and tags work this way,
  so people expect it. The Add to project menu ticks the projects that have the drawing already.
- A drawing goes in a project by a drag from Recent onto the project (the project under the pointer is tinted, as a set
  in the template library is), by Add to project in the drawing's menu, by Add drawings… in the project (the Open
  dialog), or by a drop of .oct, .cdxml or .cdx files from Finder on the project. Octet refuses other files dropped on
  a project, with a notice.
- A project opens in Home's place, with Home (or Escape) to go back. A drawing that was moved or deleted shows "Moved or
  deleted". A click on it, or Locate…, picks its new place, and every project takes the new place.
- File access: a drawing in a project opens without the file dialog, as a recent drawing does. A project takes only a
  drawing Octet may open already: one on the recent list, one in a project already, or one the user picked or dropped
  this session (src-tauri/src/home.rs). The Tauri file scope does not change.
- Thumbnails: Set thumbnail… in the menu of a drawing or a project picks a picture file. Octet checks its size (32 MB)
  and pixel count (40 million) first, and only the webview decodes it. Octet keeps a 512 by 384 JPEG of its middle on
  white (twice the largest tile), and the app decodes that again with the image crate, within limits, before it keeps
  it. Octet never keeps the original. Use automatic thumbnail goes back. In a drawing, Use selection as thumbnail (the
  command palette) takes a picture of the selection. A project with no thumbnail of its own shows a mosaic of its first
  four drawings.
- Storage: home.json in the app's data folder (version 1) and the thumbnails in thumbs/, each named by 16 hex digits.
  A damaged home.json reads as no projects, with a notice, and Octet keeps it as home-damaged.json at the next change.
  Octet does not read or write over a home.json from a later version.
- Sync, for later: the store is one small versioned JSON document. Projects have ids, drawings have paths, and the
  thumbnails are separate files by id, so a sync can send the document and the pictures apart. Paths differ between
  computers, so sync needs a file id or a path inside a synced folder; version 2 of the store can add it.
- Keys: the arrow keys move between tiles, across sections. Tab goes from section to section: one stop each, the tile
  last used there. Each section is a region named by its heading, for screen readers. The Menu key or Shift+F10 opens a
  tile's menu, which is ContextMenu (src/Menu.tsx).
- ChemDraw 26.1 has nothing to match: File > Open Recent and Clear Menu, with no thumbnails and no folders (its help,
  Documents).

## Folders, project dots and movable sections (28 October 2026)

Sam asked for a larger heading on each section, small project buttons under each drawing, sections the user can move
and fold, and projects drawn as folders that are fun to use. This replaces the mosaic above.

- Headings are the headline size (20 px, brand/tokens.css). The gap between sections went from 40 px to 48 px.
- A project is a folder in Phosphor's folder shape: a back with a tab, its first three drawings as pages in it, and a
  front over them. It is Octet Blue (#213C99) until the user picks a colour: Colour in the project's menu lists the
  document colours (docstyle.ts COLOURS), then the user's own, then Custom colour… (ColourPop, as the Actions panel
  uses). The project's own thumbnail sits on the front in grey, multiplied into the folder's colour, as the symbol on a
  macOS folder does. A folder near black has a lighter back and shows the picture lighter. Every folder has the
  swatches' edge, so a Black or Ink folder shows on the dark theme.
- Motion: on hover or focus the front tips open (180 ms) and the pages lift. A drawing carried over a folder opens it
  wider, and a drop gives a 200 ms settle. Reduced motion: the folder stays still, and a ring shows where a drop goes.
- Dots: under each drawing tile (Recent and in a project), a dot for each project in its colour, filled when the
  drawing is in the project and a dashed ring when not. A click puts the drawing in or takes it out, with no notice.
  The dots always show; More and the plus show with the pointer on the tile or the focus in it. With
  more than six projects, five dots show (the projects the drawing is in, then those used last, in Home's order) and
  More opens Add to project. The plus makes a new project with the drawing in it. Taking a drawing out counts as a
  use, so its dot stays where it was for a second click. The dots are not Tab stops (the tile's menu does the same),
  but each is a pressed or unpressed button named by its project, so a screen reader reaches it.
- A picture dropped on a drawing or a project becomes its thumbnail, through the same checks as Set thumbnail…. In
  the app the drop comes from Tauri (open.rs gives a picture dropped on a project back as a picture); in the browser
  preview, from the browser's drop.
- Sections are modules. A click on a heading folds the section to its heading. A drag by the heading moves it up or
  down (it lifts as a card, and the other sections slide out of its way); Escape puts it back. The heading's menu (the
  Menu key or Shift+F10 too) has Move up, Move down and Collapse or Expand. New and Templates sit side by side when they
  are next to each other and open. Settings keeps the order and the folded sections (homeLayout), as it keeps the
  Actions panel's folded sections. Quick start still has the focus when Home opens, and Return still starts it,
  wherever New is or if it is folded.
- Storage: each project in home.json can have a colour (#RRGGBB) and used (seconds since 1970). The store is still
  version 1: an older Octet reads it and drops the two. home.rs refuses a store with a colour that is not "#" and six
  hex digits.
- Tooltips: a tile's id is data-tile. Tooltip.tsx reads data-key as a shortcut, so the old data-key on Home's tiles
  showed the id as a key and squeezed the path to one letter a line. A drawing's tooltip shows its place with the home
  folder as ~, and breaks a long place after a slash.
