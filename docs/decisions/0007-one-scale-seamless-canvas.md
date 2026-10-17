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
  size, caption and text-run sizes, table line weights), in the same undo step. Text stays in proportion.
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
  when its bonds carry LineWidth and every other value they carry agrees with it.
- Limits widen so that no scaled value falls back to a default: lengths to 10 times their old upper limits,
  font sizes 1 to 999 pt (ChemDraw: 5 to 999 pt).

## Why

Sam: a structure scaled to 300% must not keep 0.6 pt lines and 10 pt labels, and Arial 10 pt is right for a
manuscript and wrong for a poster. One factor keeps every part in proportion by design. Seven separate
settings, as ChemDraw has, let them drift apart.

## Open questions for Sam

1. "Labels and lines" starts on (Octet) or off (ChemDraw).
2. Purposes (Paper, Thesis, Slides, Poster): named document scales in one control (for example Slides =
   ACS at 200%, Poster = ACS at 300% on A0), or nothing beyond the scale field.
3. Whether every scale opens at the same on-screen bond length (IDEA-SIZE-7), or at true size as now.
