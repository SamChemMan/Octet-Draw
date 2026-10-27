# 0018: Edit, order and float template sets, ChemDraw template files, and a dictionary of the user's own names

Status: built 27 October 2026 for Sam to review (roadmap: template features ChemDraw has).

## ChemDraw 26.1

From the 26.1 help (Templates, Tutorial 7, Importing, Adding Structures to the Dictionary), its menu file
(`Resources/SpecialPurpose/GUI/Common/XML/Menus/Menus.xml`), the strings of `ChemDrawUI`, and its own template files
(read only, nothing copied):

- A template set is a template document. File > Open Templates opens one (or New Templates, a blank grid). A click on
  a pane shows its template in the document window, to edit there; File > Save keeps it. A template is added by
  drawing in an empty pane and saving, and removed by clearing its pane and saving.
- With a pane selected, the Edit menu has Add Row Before, Add Row After, Add Column Before, Add Column After, Delete
  Row and Delete Column.
- A pane's name is its annotation (right-click an empty space in the pane, Document Annotations, Content). ChemDraw
  shows it as the template's tooltip.
- View > Templates lists the palettes; each item shows or hides that palette's window (`toggleTemplateWindow`). The
  Template tool's pop-out lists them too. A palette's corner resizes its panes.
- Templates keep captions, colours, boxes, arcs, orbitals, arrows, curves, pictures, groups and integral groups.
- File formats: ChemDraw Template (CTP) and ChemDraw Template Style Sheet (CTS), both read and written.
- Structure > Add Structure to Dictionary… opens "Add Structure to Dictionary" with "Enter Name:" and Save. A name in
  the dictionary already gets a question: replace it? ChemDraw keeps the name with its SMILES. Convert Name to
  Structure then draws it, with the name as a caption. Its own engine reads a name first, then the FDA drugs, then
  the user's dictionary, then ChemACX online.

What 26.1 does that only a run of it shows is item 24 in `~/octet-research/notes/chemdraw-checks-pending.md` (with
item 11, which is still open).

## The files

Format facts, from reading ChemDraw's 30 bundled files with Octet's own CDX reader (nothing kept):

- A .ctp file is a CDX document (little-endian; ChemDraw 4 wrote big-endian) with a TemplateGrid object (0x800B:
  NumRows 0x1001, NumColumns 0x1002, PaneHeight 0x1000, and the pane size as 2DExtent) and NumRows × NumColumns page
  objects, one for each pane, row by row. A pane's name is a Name annotation on its page. A .cts file (New
  Templates.cts) is the same with every page empty: the blank sheet a new template document starts from.
- Octet reads all 30: 827 templates, 277 of them named, in 0.3 s at most for a file. 46 panes, most of them large
  pictures (Animals 25, Anatomy 9), are past Octet's limits and are left out, with a notice that says how many.

## Decision

1. Edit. A template of the user's opens on the canvas (right-click > Edit, in the library or a floating palette) as
   a drawing of its own, with its own undo steps; the drawing in hand is set aside. A bar at the top shows the
   template's name, Cancel and Save (File > Save also saves it). Save puts the drawing in the template (bond length 1,
   centred, as every template) and brings the drawing back; Cancel brings it back. A built-in template has Edit a
   copy: Save keeps it in My templates under its name. The template opens at up to three times the open zoom, as
   templates are small. While a template is open, New, Open, Home, Close and Quit wait: a notice says to save or
   cancel first. Recovery and the error boundary keep the drawing set aside, not the template. Duplicate (a copy just
   after the template) is in the same menu.
2. Order, not rows and columns. ChemDraw's rows and columns exist because a template document is a fixed grid of
   pages, and empty panes keep places in it. Octet's sets flow to the panel's width, so a row or a column has no
   meaning that lasts; what the user controls is the order. A template of the user's is dragged to its place (a bar
   shows where it goes, and the others glide there), or moved by Move to start and Move to end in its menu. A
   template moved to another set goes at its end. A .ctp file's panes keep their order, row by row, and its empty
   panes are left out. Explicit rows (a gap, or a new line, to group templates) wait for the run of ChemDraw: item 24
   asks whether people use empty panes to group templates.
3. Floating palettes. Keep open (the button by the open set's name in the library, or a set's right-click menu) and
   View > Templates (ticked while open; a second choice hides it, as ChemDraw's does) tear a set off into a small
   palette beside the canvas: its name on a bar that drags it, a close button, and the templates as thumbnails named
   by their tooltips. A click uses one; a drag puts one on the canvas or the toolbar; right-click gives the same menu
   as the library (Rename opens the library with the name ready to type); a set of the user's is ordered by drag
   there too. The corner grip makes it wider or narrower in whole columns, as the menus' grip does. Open palettes,
   their places and widths are kept in the settings, so they come back at the next launch. They sit in the
   toolbar's layer, so a dialog makes them inert with the toolbar. Thumbnails are drawn once for each structure.
4. ChemDraw template files. File > Open and a drop read .ctp and .cts (src/ctp.ts) as a new set of the user's,
   named after the file (with a number when the name is taken), and the library opens on it. A pane's name is its
   annotation, else its place in the set ("Template 7"). The file is hostile: the CDX and CDXML readers cap
   size, depth and objects; here at most 500 panes are read, a template is at most 256 KB and the set 2 MB (the
   settings live in the app's own storage). A template file is never a drawing Octet saves over or lists on Home.
   Octet does not write .ctp files yet.
5. A dictionary of the user's own names. Add to dictionary… (right-click a structure, the Actions panel, or
   Structure > Add Structure to Dictionary…) asks for a name, as ChemDraw does, and says first when the name is in
   the dictionary already (the button reads Replace) or when Octet reads the name already. The entry keeps the name,
   the SMILES and the standard InChI. The name then reads in Name to Structure (any case, spaces or hyphens, and in
   mixtures), completes first in the library's search and the command palette, and a drawn structure that is the
   entry's shows the name in the Structure panel's header, as an abbreviation does. Drawn from its name, the
   structure has the name as a caption under it, as ChemDraw draws it. A name of the user's reads before Octet's own
   tables and OPSIN (ChemDraw reads its own engine first): the user gave it on purpose, and a name in the dictionary
   that drew something else would be a surprise. Settings > Dictionary renames and removes entries, and exports and
   imports them as a SMILES file (one entry a line: the SMILES, a tab, the name), which other programs read. An
   import keeps the user's own entry where a name is in both, and leaves out a SMILES Octet cannot read.

## ChemDraw's options and Octet's

| ChemDraw 26.1 | Octet |
| --- | --- |
| Open Templates, a pane shown in the document window, edit, Save | Edit, with Save and Cancel |
| New Templates (blank .cts) | New set; a .cts opens as an empty set |
| Add a template (draw in an empty pane) | Add (the first tile), drag a selection onto a set, Add to templates |
| Delete a template (clear its pane, Save) | Remove (×, or the menu) |
| Annotate a pane (its name) | A name for every template, shown under it in the library and as its tooltip in a palette |
| Add Row Before / After, Add Column Before / After | Drag to a place, Move to start, Move to end |
| Delete Row, Delete Column | Not needed: a set has no empty panes |
| View > Templates (toggle a palette) | View > Templates, ticked while open |
| Template tool pop-out of palettes | The Template tool's library |
| A floating palette, its resize corner | Keep open; the grip sets its columns |
| Pane size (the resize corner makes panes bigger) | Missing: a palette's thumbnails have one size |
| Templates keep text, colours, shapes, curves, pictures, groups, integral groups | The same (decision 0017) |
| Open CTP and CTS | Yes, as a set |
| Save CTP and CTS | Missing |
| The 26.1 Template editor window (storyboard) | Waits for the run of 26.1 (item 11) |
| Add Structure to Dictionary…, Enter Name, Save, the replace question | Yes, with the question shown in the dialog |
| The name drawn with its caption | Yes |
| The dictionary's file (where ChemDraw keeps it, its format) | Unknown; Octet exports and imports SMILES files |

## Checks

`src/templates.check.ts`: order by place, Move to start and Move to end, a move to another set; Edit and Save (the
drawing changes, the id, name, set and place stay, an empty drawing changes nothing, the template is kept at bond
length 1 and centred); Duplicate; floating palettes opened, brought to the front, moved, widened, closed, read back
from the settings and mended when damaged, renamed and closed with their set; a template document made with Octet's
own writer (CDX bytes, base64 and CDXML text) read pane by pane, with names from annotations, the empty pane left out,
and hostile files (no grid, cut short, junk, too many panes, a pane too big, blank stationery).
`src/names.check.ts`: the user's dictionary end to end (add, read in any case and in mixtures, search, recognise by
InChI, a name of Octet's taken over and given back, replace, rename, remove, export, import with damaged lines).
