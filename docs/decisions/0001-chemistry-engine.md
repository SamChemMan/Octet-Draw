# 0001: Indigo as the chemistry engine, not RDKit

Date: 14 October 2026. Status: accepted, pending Sam's review.

## Context

The brief recommends RDKit (BSD) for valence, aromaticity, stereo and
SMILES/InChI/MOL I/O, and requires CDXML import and export from version 1.
It asks us to check what RDKit already reads.

## What we tested

In Node, on 14 October 2026:

- `@rdkit/rdkit` 2026.9.1 (the WebAssembly build). `get_mol` returned
  nothing for a CDXML file, including a full CDXML file written by Indigo.
  The JS API has no CDX or CDXML writer. RDKit's C++ library has a CDXML
  reader, but the WebAssembly build does not include it.
- `indigo-ketcher` 1.46.0 (Apache-2.0, EPAM's Indigo built to WebAssembly).
  It converted SMILES to CDXML and back, and SMILES to binary CDX and back,
  without loss. It also does valence, aromaticity, stereo, layout, SMILES,
  InChI and MOL. It is the engine behind Ketcher.
- Size: Indigo without rendering is 7.5 MB (2.0 MB gzipped). RDKit is
  7.4 MB (2.4 MB gzipped).

## Decision

Use Indigo as the only chemistry engine for now. It runs offline in the
webview, and it covers CDX and CDXML, which RDKit's WebAssembly build does
not.

## Corpus test

On 14 October 2026 we ran 35 real CDXML files made in ChemDraw 22.2
(schemes, catalytic cycles, metal complexes, posters) through Indigo:

- Indigo loaded all 35 files. The molecules came through.
- Indigo's CDXML output dropped drawing objects in 25 of 35 files: boxes,
  lines, arc arrows, freehand curves, images and some text.
- Indigo's CDXML output replaced the ACS 1996 document settings in all 35.

## Consequences

- Indigo handles chemistry only: valence, stereo, aromaticity, layout,
  SMILES, InChI and MOL.
- Octet reads and writes the CDXML document layer itself: graphics,
  arrows, text, colours, fonts, images, schemes and document settings. This
  matches the brief, which makes the layout engine Octet's own code.
- Indigo has open CDXML bugs (text, CIP labels, implicit hydrogens,
  S-groups). Octet will need its own CDXML test suite and will likely send
  fixes upstream.
- RDKit stays an option for specific jobs if Indigo falls short, for
  example CIP labelling or 2D layout. Both are permissive, so they can run
  side by side. Add RDKit only when a real case needs it.
- Revisit if RDKit's WebAssembly build gains CDXML support, or if Indigo
  blocks a version 1 requirement.
