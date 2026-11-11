// The taxol job in v2 form (docs/plans/mcp-v2.md, sections 4.4, 5.4 and 15): the brief, the three schemes of
// taxol/route.json in one draw_route call with their titles, and one read. A product made from the compound before
// it gives no from, and a scheme that starts with a compound drawn before gives it by from alone: it keeps its number.
// On Quick start, as for a user with no preference; taxol-route-paper is the same job for a paper page. taxol-v1-job
// is the same job as v1 was used for it.
import { readFileSync } from "node:fs";
const json = (f) => JSON.parse(readFileSync(new URL(`../taxol/${f}.json`, import.meta.url), "utf8"));
let before; // the number of the compound before, as the route reads it
const schemes = json("route").schemes.map(({ title, start, steps }) => ({
  title,
  start: start.map(({ ...c }) => { if (c.from === c.number && !c.changes) delete c.number; before = c.number ?? c.from; return c; }),
  steps: steps.map((s) => ({ ...s, products: s.products.map(({ ...c }) => { if (c.changes && c.from === before) delete c.from; before = c.number; return c; }) })),
}));
export default {
  about: "Nicolaou's taxol synthesis in one draw_route call on Quick start: three titled schemes, 21 structures, 17 steps, then one read",
  brief: { destination: { kind: "quick" } },
  calls: [{ name: "draw_route", arguments: { schemes } }, { name: "read", arguments: {} }],
  // Compound 20 (the β-lactam) is a reagent over the last arrow, not a structure in the schemes.
  expect: { smiles: Object.fromEntries(Object.entries(json("structures")).filter(([n]) => n !== "20")) },
};
