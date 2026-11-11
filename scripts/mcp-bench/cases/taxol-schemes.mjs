// The three taxol schemes, each one draw_reaction call, as v1 finally drew them (taxol/README.md).
import { readFileSync } from "node:fs";
const json = (f) => JSON.parse(readFileSync(new URL(`../taxol/${f}.json`, import.meta.url), "utf8"));
export default {
  about: "Nicolaou's taxol synthesis (Nature 1994, 367, 630): three schemes, 20 compounds, 17 steps, with no retries or fixes",
  calls: ["scheme1", "scheme2", "scheme3"].map((f) => ({ name: "draw_reaction", arguments: json(f) })),
  // Compound 20 (the β-lactam) is a reagent over the last arrow, not a structure in the schemes.
  expect: { smiles: Object.fromEntries(Object.entries(json("structures")).filter(([n]) => n !== "20")) },
};
