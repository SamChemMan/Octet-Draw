# The route corpus

Drawing jobs taken from papers (docs/plans/mcp-v2-tests.md, section 6.1), one file a paper. The benchmark runner
(`../run.ts`) draws each job with no window and compares every numbered compound with its expected structure by
InChIKey.

Only what we wrote ourselves is here: each compound's SMILES, the conditions, and a citation. No paper's PDF, figure
or text is in the repository (docs/plans/mcp-v2.md, Sam's answer 2, has each paper's licence).

A file:

```
{ "source": { "citation": "...", "doi": "...", "licence": "..." },
  "jobs": [{
    "id": "PAPER-fig2a",            the paper's key, then the figure or scheme
    "kind": "S2",                   the job kind in the test plan (S1 to S20, F1 to F10)
    "figure": "Fig. 2a",
    "prompt": "...",                what a chemist would type to an AI app for this job
    "tool": "draw_reaction",        the tool, and its arguments as an AI app would write them
    "arguments": { ... },
    "expect": { "smiles": { "3a": "..." } }   each compound number's full structure (no abbreviations)
  }] }
```
