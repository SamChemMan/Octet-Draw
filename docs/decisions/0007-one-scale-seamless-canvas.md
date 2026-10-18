# 0007: Size is one scale, on a seamless canvas

Status: approved by Sam in the version 1 plan, 17 October 2026 (IDEA-SIZE-13 and the scale items). Adds to
brief section 2, rule 6 ("ACS Document 1996 is the default style"), and answers part of the open question in
decision 0003 (templates on New drawing).

## Decision

- Every length an object draws is the document's length times the object's scale. Atoms, arrows, shapes and
  catalytic cycles take an optional scale; unset is 1. Line and bold widths, wedges, hash spacing, label
  margins, double-bond spacing, label sizes, lone pairs and other marks, arrowheads, TLC spots, table rules and
  text, shadows and the gap under a structure all follow it. A bond takes the mean scale of its two atoms.
  Captions keep their sizes in points, and a scale multiplies those sizes.
- The document style has one scale, in percent, next to its preset in Settings > Document. It multiplies the
  bond length, line width, bold width, margin, hash spacing, label size and caption size together. Bond spacing
  stays a percent of the bond. The preset's name stays at every scale ("ACS Document 1996" at 250%).
- A change to the document scale also multiplies every size the drawing holds in points (an atom's own label
  size, caption and text-run sizes, a fixed line spacing, an object's own line width, a table's or TLC plate's text
  size, table line weights), in the same undo step. Text stays in proportion.
- Object > Scale… has a row "Labels and lines". On: the selection's scale is multiplied with its positions, as
  ChemDraw's "Scale atom labels and settings" does. Off: positions only. The app's settings keep the choice.
  It starts on, because Sam asked for scaling that keeps everything in proportion.
- The canvas stays seamless. The page is an outline on an unlimited canvas, never a limit: nothing is clipped,
  moved or refused at a page edge, at any scale, and the zoom limits always let the whole page fit. Sam: "i
  don't want tiles like chemdraw just an infinite-ish (how it is now) seamless scale system". So Octet has no
  stationery tiles.
- New documents still open in ACS Document 1996 at 100% (brief rule 6).
- The Text > Size menu and the Actions size list are ChemDraw's sizes (5 to 24 pt) times the document scale.
  A typed size still takes any value.
- Files: CDXML holds absolute values (document values times scales), so ChemDraw shows the true sizes. An
  object with a scale writes its own LineWidth, BoldWidth, HashSpacing, MarginWidth, BondLength and LabelSize.
  Octet's own data keeps the document scale and each object's scale. On import, a structure takes a scale only
  when its bonds carry LineWidth and every other value they carry agrees with it. An atom with no bonds takes its
  scale from its own LineWidth. An arrow, curve, orbital or shape takes a scale only when it carries a BoldWidth as
  well; a LineWidth alone is its own line width (ChemDraw's Object Settings > Line Width), kept over its scale.
- Limits widen so that no scaled value falls back to a default: lengths to 10 times their old upper limits,
  font sizes 0.1 to 999 pt (ChemDraw: 5 to 999 pt). A document scale that would take a value past its limit stops
  at the limit (a custom 100 pt bond goes to 720%, not 1000%).

- The selection's frame has 8 resize handles for every kind of selection (IDEA-SCALE-3). A corner scales in
  proportion, a side stretches and moves geometry only, Shift turns proportion over, Option scales about the middle.
  Control turns "Labels and lines" over for one drag, as ChemDraw's Ctrl does on its handles. Text alone always
  scales its size (Control turns that off), as ChemDraw scales the text of one label whatever its checkbox says.
  The drag stops softly at 100% and where the median bond is the document's bond length (⌘ turns the stops off).
  A double-click on a handle opens Scale…. ChemDraw 26.1 has no key for "about the middle" on its handles.
  A lone shape uses the frame in place of its own corner handles. A turned shape keeps its angle and grows along its
  own sides. A lone straight arrow keeps its end handles and shows only the rotation handle. A lone caption keeps its
  width handle beside the frame's corner handles.
- The whole drawing (nothing selected, or everything) scaled in proportion with "Labels and lines" on changes the
  document scale, not each object's scale (IDEA-SCALE-8). Octet does not ask, as ChemDraw does. What is drawn next
  then matches. The drawing keeps its place on screen.
- A bond, chain, ring, group or template drawn from an atom takes the atom's scale. Clean Up keeps each structure's
  scale (IDEA-SCALE-7). ChemDraw's sprouted bonds take the structure's own bond length too.
- A paste or import from a drawing of other sizes keeps text in proportion, by ChemDraw's two rules: an atom's own
  label size goes by the ratio of the label sizes, a caption's size by the ratio of the bond lengths (IDEA-SCALE-10,
  IDEA-SIZE-10). Octet's clipboard keeps the source style for this. Octet shows no dialog. ChemDraw's "Change
  Settings" choice (an empty document takes the pasted drawing's settings) is not in Octet.

## Why

Sam: a structure scaled to 300% must not keep 0.6 pt lines and 10 pt labels, and Arial 10 pt is right for a
manuscript and wrong for a poster. One factor keeps every part in proportion by design. Seven separate
settings, as ChemDraw has, let them drift apart.

## Purposes (18 October 2026)

Sam approved the purpose items of the version 1 plan (IDEA-SIZE-1 to 3, 6 to 8, 11, 14 and 15). They answer open
questions 2 and 3 below.

- A purpose is a journal style at a document scale, on a page, with the outlines that page needs. Octet has four:
  Paper (the journal at 100% on A4), Thesis (the journal at 100% on A4, with the 150 x 257 mm text block of a 40 mm
  binding margin and 20 mm on the other sides), Slides (ACS at 200% on PowerPoint's 16:9 slide, 338.67 x 190.5 mm) and
  Poster (ACS at 300% on A0, with A1 inside). Paper's outlines are the journal's columns (ACS 1 and 2 column, Nature
  89 and 183 mm, RSC 83 mm). A drawing keeps its purpose in its style. A file from another program has none and shows
  the page's ISO or US series, as before.
- Home's first row is New: a tile for each purpose, then the user's own, each a picture of its page with a small scheme
  at its true size on it. One click starts a drawing for it. Return and ⌘N start the purpose picked last, as
  ChemDraw's New takes the stationery used last. It starts on Paper, so ACS Document 1996 stays the first default.
  File > New shows that purpose's name, and File > New For lists them all. Home asks nothing and shows no tips.
- Settings > Document has a For row above Style. A pick gives the open drawing the purpose's sizes, scale and page in
  one undo step; its background, page edges, gridlines, text colour and carbon labels stay. The journal list stays
  under it. Use for new documents keeps the style for that purpose, so an RSC Paper stays RSC after a Poster.
  Save as a new purpose… names the style as a purpose of the user's own (12 at most); it is removed from its Home tile.
  The command palette has New and For for each purpose.
- Every purpose opens with bonds the same length on screen. A change of scale (a purpose, or the Scale field) keeps
  the structures still on screen, and the page outlines grow or shrink round them in 200 ms. A change of bond length
  at the same scale (a journal) keeps the true-size ratio, as before. Actual Size still shows true size.
- The tutorial always runs on Paper, once after the name box and from Octet > Tutorial.
- Pages: A1, A0, Slide 16:9 and Slide 4:3 join the page list, stored portrait, with landscape on for slides. A slide
  picked from the page list is landscape, and a paper page picked from a slide is portrait.
- Journal list: ChemDraw 26.1's pads. J. Chin. Chem. Soc., J. Het. Chem., Phytomedicine, Science of Synthesis and
  New Document (ChemDraw) are added. Slides is now New Slide (ChemDraw). RSC and Helv. Chim. Acta use Arial, as the
  26.1 pads do (the help says Helvetica). Times New Roman in a pad is Arial in Octet (Adv. Synth. Catal. captions,
  J. Het. Chem., New Document and New Slide captions).
- There are no ChemDraw-style tiled pages or stationery files (Sam: "i don't want tiles like chemdraw just an
  infinite-ish (how it is now) seamless scale system"). A purpose is a scale and an outline on the seamless canvas.

## Open questions for Sam

1. "Labels and lines" starts on (Octet) or off (ChemDraw).
2. Slides at ACS 200% (now) or at ChemDraw's New Slide numbers (30 pt bond, 12 pt labels, 16 pt captions).
3. Poster at 300% (now: 30 pt text) or 360% (Purdue's 36 pt), and on A0 portrait (now) or 48 x 36 in.
4. Paper on A4 (now) or US Letter, as ChemDraw's ACS Document 1996 pad. A journal carries its columns, not its paper
   size; ChemDraw's pads also set the paper (Wiley A4 landscape, Nature and Adv. Synth. Catal. Letter).
5. Not added as journals: J. Mol. Mod. (1 and 2 Column) is ACS Document 1996 with Times New Roman, so with Arial it is
   the same as ACS; I Draw Styles and Show Terminal Carbon Labels are New Document with Hide implicit hydrogens or
   Label terminal carbons on; Dark Mode is ACS with 1.6 pt lines on a dark page (Octet has the Dark background).
   Phytomedicine's labels are bold in its pad; Octet's journal values hold no bold labels.
6. RSC and Helv. Chim. Acta in Arial, as ChemDraw 26.1's pads (now), or in Helvetica, as ChemDraw's help lists. A
   file or saved default with the Helvetica values now shows as Custom.
