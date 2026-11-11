# Benchmark: the Nicolaou taxol synthesis (Nature 1994, 367, 630)

The job that showed the MCP is too slow (10 November 2026, docs/plans/mcp-v2.md). Claude drew the paper's Figs 2, 3
and 5 in Octet in about 40 tool calls and well over an hour, most of it Claude's own writing and fixing.

- `scheme.mjs`: each compound as taxol's own SMILES (PubChem) cut down, so every stereocentre keeps taxol's tag.
  `node scheme.mjs write` (in this folder) writes the three scheme files.
- `structures.json`: the 20 compounds (2 to 20, and 1, taxol) in full, from `scheme.mjs` (`FULL`). The benchmark
  compares what is drawn with these by InChIKey.
- `scheme1.json`, `scheme2.json`, `scheme3.json`: the three `draw_reaction` arguments as they were finally drawn
  (groups as `*` with labels OTBS, OTBDPS, OBn, OTES, OAc, OBz).
- `route.json`: the same three schemes in the v2 form (docs/plans/mcp-v2.md, sections 4 and 5.4): a compound that is
  an earlier one with a change is written `from` it with `changes`, and the atoms that change later have map numbers
  in the SMILES (taxol's own numbering: C7, C4, C2, C9, C10, C20). Nine of the 21 structures are from another: 3, 4,
  7 (and 7 again in scheme 2), 13 again in scheme 3, 14, 16, 17 and 19. The rest are written in full: 2 and 8 start
  the route; 9 (the Shapiro coupling), 13 (the McMurry closure), 18 (the oxetane) and 1 (the side chain) are new
  skeletons; and 5 (a lactone opened), 6 (an acetonide made), 10 and 11 (an epoxide made and opened), 12 (a carbonate
  made) and 15 (a new stereocentre with a set configuration, and the acetonide opened) are changes to rings or new
  centres, which wait for the named transformations (section 4.3).

The cases that use them are in `../cases/` (`taxol-chained` draws `route.json`) and `node scripts/mcp-bench/run.ts`
runs them (docs/plans/mcp-v2.md, section 15.1, has the numbers). The measure is the whole job: tool calls, characters
the AI app writes and reads, failed calls and Octet's time, from "draw this synthesis" to a figure with a clean check.
