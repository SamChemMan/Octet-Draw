// The taxol job as a model now does it (docs/plans/mcp-v2.md, section 19): the three titled schemes of the route in the
// line notation (lines.json, as src/notation.check.ts draws them), in one draw call that carries the brief (Quick
// start: the user has no preference). Its reply lists every compound with its formula and the check, so the job needs
// no read. taxol-route and taxol-v1-job are the same job with draw_route and with v1.
import { readFileSync } from "node:fs";
const json = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8"));
export default {
  about: "Nicolaou's taxol synthesis as lines in one draw call with the brief in it, on Quick start: three titled schemes, 21 structures, 17 steps",
  brief: false,
  calls: [{ name: "draw", arguments: { lines: json("../lines.json")["taxol-route"], brief: "quick" } }],
  // Compound 20 (the β-lactam) is a reagent over the last arrow, not a structure in the schemes.
  expect: { smiles: Object.fromEntries(Object.entries(json("../taxol/structures.json")).filter(([n]) => n !== "20")) },
};
