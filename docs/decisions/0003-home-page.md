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
  Skip is at the card's bottom right. Octet > Tutorial starts it again on a new drawing.
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
