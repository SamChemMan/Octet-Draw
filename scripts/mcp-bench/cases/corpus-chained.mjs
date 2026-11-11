// Three routes of the paper corpus with their products written from an earlier compound by named transformations
// (docs/plans/mcp-v2.md, section 4.3): a conjugate addition (gaunt2007-fig13: join, hydrogenate, oxidise, with the new
// centre's label), an arylation and hydrolysis (zu2025-fig3a: join, remove, hydrolyse) and a ring opened at its alkene
// (grocott2025-fig4e: open, then a vinyl group on each end). Each scheme is one draw_reaction call with the job's own
// conditions, and each compound is checked against the job's expected structure.
import { readFileSync } from "node:fs";
const job = (id) => JSON.parse(readFileSync(new URL(`../corpus/${id.split("-")[0]}.json`, import.meta.url), "utf8")).jobs.find((j) => j.id === id);
// A job's arguments with its start and its products given anew: products[k] is step k's.
const chained = (id, start, products) => ({ name: "draw_reaction", arguments: { start, steps: job(id).arguments.steps.map((s, k) => (products[k] ? { ...s, products: products[k] } : s)) } });
const IDS = ["gaunt2007-fig13", "zu2025-fig3a", "grocott2025-fig4e"];
export default {
  about: "Three corpus routes with their products written from earlier compounds by named transformations",
  calls: [
    chained(IDS[0], [{ text: "C/[CH:3]=C/C=O", number: "1" }, { text: "COc1ccc2n(Cc3ccc(Br)cc3)c(C)[cH:9]c2c1", number: "2" }],
      [[{ from: "1", changes: [{ do: "join", at: "3-9", with: "2", config: { 3: "R" } }, { do: "hydrogenate" }, { do: "oxidise" }], number: "3" }]]),
    chained(IDS[1], [{ text: "CC(C)[CH2:1]Nc1ccc(cc1)C(=O)NCCC(=O)OC", number: "79" }, { text: "Br[c:2]1ccc(cc1)-c1nnc(o1)-c1ccccc1" }],
      [[{ from: "79", changes: [{ do: "join", at: "1-2", with: "previous", config: { 1: "S" } }, { at: "2", remove: true }, { do: "hydrolyse" }], number: "81" }]]),
    chained(IDS[2], [{ text: "O=C1CCCCCCC/[CH:1]=[CH:2]\\CCCCCCO1" }],
      [[{ from: "previous", changes: [{ do: "open", at: "1-2" }, { at: "1", add: "CHCH2" }, { at: "2", add: "CHCH2" }], number: "19" }]]),
  ],
  expect: { smiles: Object.assign({}, ...IDS.map((id) => job(id).expect.smiles)) },
};
