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
