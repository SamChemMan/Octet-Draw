# Plan: generic labels and poster pages in CDXML

19 November 2026, for Octet Draw 1.1.3.

Two faults found by opening Octet's examples in ChemDraw 22.2 and saving them again:

1. The aryl label Ar on the catalytic cycle's Pd complexes comes back as argon.
2. The β-Lactam antibiotics poster (A0) comes back as a Custom 948 x 569 mm page with no purpose. An empty A0 poster
   comes back as A4.

## What ChemDraw 22.2 does (tested 19 November 2026)

Each label was written on its own atom, bonded to a carbon, in three forms: as Octet writes it today, as a
GenericNickname node (with and without its text), and with InterpretChemically="no" on its text. NeedsClean on or off
made no difference.

- ChemDraw reads every label from its text again when it opens a file. The NodeType and GenericNickname that the
  file gives are not used.
- ChemDraw's generic labels, kept as GenericNickname nodes: A, AH, G, GH, G*, GH*, M, MH, M0, Q, QH, R, X, XH and
  the 38 Reaxys classes (ACY to CXH). R', R'', R1 to R99 are GenericNickname="R" with their own text.
- Ar (and ArH, ArH2) is argon, with the warning "An atom in this label has an invalid valence". Y is yttrium. There
  is no generic Ar or Y in ChemDraw.
- M with a Roman oxidation state (MI to MX, M(I) to M(X)) becomes a fragment of M, I and V (M(IV)). An unbalanced
  M(IV or MIV) stays an Unspecified node ("Parentheses don't match").
- Bigger labels with Ar in them get argon too. ChemDraw puts an argon atom for each Ar in a fragment inside the node,
  with the invalid valence warning: ArBr, ArI, ArLi, ArB(OH)2, ArOTf, ArSnBu3, OAr, ArO, ArCH2, CH2Ar, PAr3, Ar3P,
  NHAr, SO2Ar, BArF, ArX, Ar(OMe), Ar1 (one argon), Ar2 and Ar12 (twelve). BuAr, MeAr, PdAr and YAr become fragments
  with argon in them. Ar', Ar′, Ar'', HetAr, ArBpin and Ar′B(OH)2 stay Unspecified nodes with their text ("ChemDraw
  can't interpret this label").
- Ak, Alk, Alkyl, Aryl, E, EDG, EWG, DG, Hal, Het, L, L', L1, LG, Ln, M(0), Nu, PG, R#, Rx and Z stay Unspecified
  nodes with their text. Arg is ChemDraw's nickname for arginine. [Ar,Kr] and [NOT Ar] stay element lists.
- Cy, Ph, Me and Bn become nicknames. Ra, Rb, Rf, W, As and Hg are elements.
- A label with InterpretChemically="no" keeps its text. ChemDraw marks it "Chemical Interpretation is not possible for
  this label" and puts no atoms inside it: no argon in any of the labels above. For Ar, ArH and Y it still writes
  Element 18 or 39 on the node; the others stay Unspecified nodes (a label of two lines, Ar and Br, a Fragment node with
  no fragment inside). Nothing else in the file changes.

Charges on these labels. Octet writes a label's charge as the node's Charge and its sign as a raised run after the
text (+, -, 2+, 3-), or, when the sign is drawn anywhere else, as a Plus or Minus symbol; a circled charge as a
CirclePlus or CircleMinus symbol, and a radical ion as a RadicalCation or RadicalAnion symbol.

- ChemDraw keeps the charge on Ar, ArH and Y (on the element) and on a GenericNickname R (R+, R2-).
- It leaves the charge off an Unspecified node whose text has the sign in it (M(IV)+, MIV2-, M(X)-, Ar1+, Ar'+, L+,
  R1+, L12-), and keeps the raised run of the sign. With the sign in a symbol (a radical ion) the node keeps its
  Charge.

Pages (ChemDraw's default printer paper on this Mac is A4):

- With no print record in the file, ChemDraw does not use the page's BoundingBox. A page becomes one or more A4
  sheets (523 x 770 pt each). Letter, A3 and A4 landscape all come back as A4 portrait. A large drawing comes back
  as several sheets (the lactams poster as 5 x 2).
- A page with DrawingSpace="poster", Width and Height keeps its size. ChemDraw saves BoundingBox 0 0 Width Height,
  the same Width and Height, PageOverlap="0", DrawingSpace="poster", and WidthPages and HeightPages as the number
  of sheets it prints on. A 16:9 slide with a structure past its edge keeps its size too.
- Width and Height without DrawingSpace are not used. DrawingSpace="poster" without them gives a poster one sheet
  in size.
- A Mac print record (MacPrintInfo) for A0 paper gives the largest paper the printer has (864 x 1296 pt here), so it
  is no way to keep a page size.
- A CDX file with the same attributes is kept the same way (the lactams poster and the labels, from Octet's CDX).

Posters ChemDraw does not open:

- A poster with a side of 25.4 mm or less (no printable area inside the half-inch margins) does not open, and
  ChemDraw then does not quit when asked. 10 x 10, 25 x 25 and 300 x 10 mm did not open; 25.42 x 25.42, 25.42 x 300
  and 25.5 x 25.5 mm opened at once.
- A poster smaller than its drawing (all its objects, wherever they are) is made bigger as ChemDraw opens it. That
  took from a few seconds to over a minute, or did not end: a ring on 30 x 30, 32 x 32 and 35 x 35 mm pages, 300 x 30
  mm, two rings 22 bond lengths apart on 100 x 100 mm, and a bond 1.7 pt longer than the page. A ring on a 40 x 40 mm
  page and a bond 0.5 pt shorter than the page opened at once. Where the drawing is does not matter: a ring 150 bond
  lengths off a 100 x 100 mm page opened at once.

## Changes

### Generic labels (cdxml.ts)

- Writer: a label that ChemDraw reads as elements is written with InterpretChemically="no" on its text: Y, M with a
  Roman oxidation state (balanced brackets or none), and every label with Ar in it that is not a word (Ar followed by a
  small letter: Aryl, Arg). ChemDraw then keeps the text and puts no argon or yttrium in it. The node type does not
  change. Element lists, alternative groups and link nodes are written as before. When the user turned Interpret
  Chemically off on such a label, the node also gets {"plain":1} in its Octet attribute.
- Reader: a label with InterpretChemically="no" whose text, less its charge's sign (with the count for 2 or more), is
  one of these is read as the generic label (chemistry not turned off), unless the node has the plain mark. ChemDraw's
  Element 18 or 39 on the node is not used. Where ChemDraw left the charge off the node, a raised run of a sign alone
  (+, -, 2+ to 9-) is the charge.
- Reader: the count of a charge after a label that ends in a digit is the charge's own (R1+ is R1 with a charge of 1,
  R12+ R1 with a charge of 2). 1.1.3 read R1+ as R and R12+ as R12.
- Reader: a GenericNickname node's text is never read as an element. Today Octet reads its own generic Y back as
  yttrium.
- Every other label is written as today. ChemDraw keeps all of them as Octet wrote them.

### Pages (cdxml.ts)

- Writer: a page that is not A4 or US Letter (either way round, to 1 mm) is written with DrawingSpace="poster",
  Width and Height (the printable area, as the BoundingBox), when ChemDraw opens it: each printable side is more than
  0 pt, and the drawing is at least 9 pt smaller than it each way (a margin for objects ChemDraw measures a little
  bigger; not measured). This covers Poster's A0, Slides, A3 to A0, Legal, Tabloid, the small pages and Custom. Any
  other page, and A4 and Letter pages portrait or landscape, are written as today, byte for byte.
- Reader: the page size is read as today (the BoundingBox, which ChemDraw writes as the poster's size). A file from
  another program with DrawingSpace="poster" on a built-in purpose's page (A0 portrait for Poster, 16:9 landscape for
  Slides) gets that purpose, and the purpose's scale when the document's sizes are a preset at that scale.
- Octet's own files read as before: their page and purpose come from the Octet attribute.

## Cases (src/cdxmlcompat.check.ts)

1. Each of ChemDraw's generic labels: Octet writes a GenericNickname node, and reads ChemDraw's form (GenericNickname
   R with the text R1) back as the same label.
2. Ar, ArH, Y, M(IV), MIV, MII, M(X): written with InterpretChemically="no"; ChemDraw's form (Element 18 or 39, or an
   Unspecified node, with the text not interpreted) reads back as the same label, chemistry on.
3. Bigger labels with Ar in them (Ar', Ar1, Ar12, OAr, ArBr, ArB(OH)2, BuAr, PdAr, a label of two lines): written with
   InterpretChemically="no", and read back the same from ChemDraw's form.
4. Other stand-ins, words (Aryl, Arg), unbalanced M(IV and MIV), and element lists with argon are written as today.
5. Charges of 1, 2 and 3 either way, radicals and radical ions on Ar, ArH, Y, M(IV), MIV, MII, M(X), Ar1, OAr and
   ArB(OH)2 keep their charge through ChemDraw's form, the charge on the node or not. A sign typed in the text (Ar+,
   ArN2+) is not a charge. R1, L1, Ar1, R2 and Nu1 with a charge keep their digit.
6. Real argon, arsenic, mercury and yttrium atoms are written and read as elements, with no change.
7. A user's Interpret Chemically off on Ar, Y and OAr keeps through Octet's own CDXML.
8. .oct: the CDXML inside reads back the same; the CDX writer carries InterpretChemically and DrawingSpace.
9. The catalytic cycle example (Ar and Ar′) and an MCP draw with {R}, {L} and {Ar}.
10. A0 poster (empty and the lactams example): DrawingSpace="poster", Width and Height; ChemDraw's form reads back as
    A0 with the Poster purpose and scale 3.
11. Pages ChemDraw does not open as a poster (a side of 25.4 mm or less, a drawing bigger than the page, or less than
    9 pt smaller) are written as before; pages just bigger than that are posters, wherever the drawing is.
12. A4, Letter, A4 landscape, Letter landscape, an experiment page with its risk assessment on page 2, and the pages
    of case 11 that are not posters: this item's change leaves the CDXML the same, byte for byte. Both writers are
    cdxml.ts from the commit before this item, one with this item's commits applied, so no other change to cdxml.ts
    is in either (skipped with the reason in a clone with no history).
13. Hostile pages: huge, negative, zero and NaN Width, Height and BoundingBox read as a bounded page.
14. OCTET_STRESS_CHEMDRAW=1: ChemDraw 22.2 opens and saves the 10 examples (as Export writes them), an empty A0
    poster, the labels file, the charged labels file and pages that are and are not posters (two examples on a page
    10 pt bigger than them), and Octet reads them back with the same labels, charges and pages.

## Not changed

- In ChemDraw itself, Ar still shows a warning ("Chemical Interpretation is not possible for this label"). ChemDraw
  has no generic aryl label with that text.
- A ChemDraw file with Ar on a bond and chemistry on is still argon in Octet.
- Pages in ChemDraw follow its printer paper for A4 and Letter documents, as before.
- A charge on a label ChemDraw keeps as text it cannot interpret (L+, R1+, L12-) is left off the node in ChemDraw's
  file; Octet reads the label back with the sign in its text and no charge, as 1.1.3 does.
