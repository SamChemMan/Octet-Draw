# Benchmark: the Nicolaou taxol synthesis (Nature 1994, 367, 630)

The job that showed the MCP is too slow (10 November 2026, docs/plans/mcp-v2.md). Claude drew the paper's Figs 2, 3
and 5 in Octet in about 40 tool calls and well over an hour, most of it Claude's own writing and fixing.

- `scheme.mjs`: each compound as taxol's own SMILES (PubChem) cut down, so every stereocentre keeps taxol's tag.
  `node scheme.mjs write` (in this folder) writes the three scheme files.
- `structures.json`: the 20 compounds (2 to 20, and 1, taxol) in full, from `scheme.mjs` (`FULL`). The benchmark
  compares what is drawn with these by InChIKey.
- `scheme1.json`, `scheme2.json`, `scheme3.json`: the three `draw_reaction` arguments as they were finally drawn
  (groups as `*` with labels OTBS, OTBDPS, OBn, OTES, OAc, OBz).

The cases that use them are in `../cases/` and `node scripts/mcp-bench/run.ts` runs them (docs/plans/mcp-v2.md,
section 15.1, has the numbers). The measure is the whole job: tool calls, characters the AI app writes and reads,
failed calls and Octet's time, from "draw this synthesis" to a figure with a clean check.
