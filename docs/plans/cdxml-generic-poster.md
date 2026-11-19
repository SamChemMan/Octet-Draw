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
- Ar (and ArH) is argon, with the warning "An atom in this label has an invalid valence". Y is yttrium. There is no
  generic Ar or Y in ChemDraw.
- M with a Roman oxidation state (MI to MX, M(I) to M(X)) becomes a fragment of M, I and V (M(IV)).
- Ak, Alk, Alkyl, Ar', Ar1, Aryl, E, EDG, EWG, DG, Hal, Het, HetAr, L, L', L1, LG, Ln, M(0), Nu, PG, R#, Rx, Z and
  bigger labels with Ar in them (OAr, ArCH2, CH2Ar, PAr3, NHAr, SO2Ar) stay Unspecified nodes with their text.
- Cy, Ph, Me and Bn become nicknames. Ra, Rb, Rf, W, As and Hg are elements.
- A label with InterpretChemically="no" keeps its text. ChemDraw marks it "Chemical Interpretation is not possible for
  this label". For Ar and Y it still writes Element 18 or 39 on the node; M(IV) stays an Unspecified node.

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

## Changes

### Generic labels (cdxml.ts)

- Writer: a label that ChemDraw reads as elements (Ar, ArH, Y, and M with a Roman oxidation state) is written with
  InterpretChemically="no" on its text. ChemDraw then keeps the text and does not count argon or yttrium. The node
  type does not change. When the user turned Interpret Chemically off on such a label, the node also gets
  {"plain":1} in its Octet attribute.
- Reader: a label with InterpretChemically="no" whose text is one of these is read as the generic label (chemistry
  not turned off), unless the node has the plain mark. ChemDraw's Element 18 or 39 on the node is not used.
- Reader: a GenericNickname node's text is never read as an element. Today Octet reads its own generic Y back as
  yttrium.
- Every other label is written as today. ChemDraw keeps all of them as Octet wrote them.

### Pages (cdxml.ts)

- Writer: a page that is not A4 or US Letter (either way round, to 1 mm) is written with DrawingSpace="poster",
  Width and Height (the printable area, as the BoundingBox). This covers Poster's A0, Slides, A3 to A0, Legal,
  Tabloid, the small pages and Custom. A4 and Letter pages, portrait or landscape, are written as today, byte for
  byte.
- Reader: the page size is read as today (the BoundingBox, which ChemDraw writes as the poster's size). A file from
  another program with DrawingSpace="poster" on a built-in purpose's page (A0 portrait for Poster, 16:9 landscape for
  Slides) gets that purpose, and the purpose's scale when the document's sizes are a preset at that scale.
- Octet's own files read as before: their page and purpose come from the Octet attribute.

## Cases (src/cdxmlcompat.check.ts)

1. Each of ChemDraw's generic labels: Octet writes a GenericNickname node, and reads ChemDraw's form (GenericNickname
   R with the text R1) back as the same label.
2. Ar, ArH, Y, M(IV), MIV, MII, M(X): written with InterpretChemically="no"; ChemDraw's form (Element 18 or 39, or an
   Unspecified node, with the text not interpreted) reads back as the same label, chemistry on.
3. Other stand-ins (L, Hal, Het, Ar', Ar1, OAr, ArCH2, M(0)...) are written as today.
4. Real argon, arsenic, mercury and yttrium atoms are written and read as elements, with no change.
5. A user's Interpret Chemically off on Ar keeps through Octet's own CDXML.
6. .oct: the CDXML inside reads back the same; the CDX writer carries InterpretChemically and DrawingSpace.
7. The catalytic cycle example and an MCP draw with {R}, {L} and {Ar}.
8. A0 poster (empty and the lactams example): DrawingSpace="poster", Width and Height; ChemDraw's form reads back as
   A0 with the Poster purpose and scale 3.
9. A4, Letter, A4 landscape, Letter landscape and an experiment page with its risk assessment on page 2: the CDXML
   is the same as the 1.1.3 writer's, byte for byte (cdxml.ts from release-1.1.3 run beside the new one).
10. Hostile pages: huge, negative, zero and NaN Width, Height and BoundingBox read as a bounded page.
11. OCTET_STRESS_CHEMDRAW=1: ChemDraw 22.2 opens and saves the 10 examples (as Export writes them), an empty A0 poster
    and the labels file, and Octet reads them back with the same labels and pages.

## Not changed

- In ChemDraw itself, Ar still shows a warning ("Chemical Interpretation is not possible for this label"). ChemDraw
  has no generic aryl label with that text.
- A ChemDraw file with Ar on a bond and chemistry on is still argon in Octet.
- Pages in ChemDraw follow its printer paper for A4 and Letter documents, as before.
