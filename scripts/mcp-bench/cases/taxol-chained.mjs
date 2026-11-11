// The three taxol schemes of taxol-schemes, with each compound that is the one before with a change written from it
// (taxol/route.json: from and changes, docs/plans/mcp-v2.md section 4). Each scheme is one draw call.
import { readFileSync } from "node:fs";
const json = (f) => JSON.parse(readFileSync(new URL(`../taxol/${f}.json`, import.meta.url), "utf8"));
export default {
  about: "Nicolaou's taxol synthesis with compounds written as changes to earlier ones: 9 of its 21 structures are from another",
  calls: json("route").schemes.map(({ start, steps }) => ({ name: "draw", arguments: { kind: "reaction", start, steps } })),
  // Compound 20 (the β-lactam) is a reagent over the last arrow, not a structure in the schemes.
  expect: { smiles: Object.fromEntries(Object.entries(json("structures")).filter(([n]) => n !== "20")) },
};
