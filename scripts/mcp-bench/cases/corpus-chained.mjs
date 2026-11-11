// Three two-step routes of the paper corpus (jobs of kind S2) with every product the changes can say written from an
// earlier compound (docs/plans/mcp-v2.md, section 4.3): an enamine and its alkylation (trowbridge2018-fig4b-10a: join,
// then a bond and a group; the job gives the two starting materials no numbers, and join needs one), an intramolecular
// Diels-Alder (gaunt2007-fig11d: bond orders and two ring closures, with the four new centres' labels) and a ring
// opened at its alkene (grocott2025-fig4e: open, then a vinyl group on each end). Two products stay as text: the
// pyranone of solanapyrone D (3) is no group a label can say, and the ring-closing metathesis to 20 makes its bond
// between atoms of the two vinyl labels, which no number can name. Each scheme is one draw call with the
// job's own conditions, and each compound is checked against the job's expected structure.
import { readFileSync } from "node:fs";
const job = (id) => JSON.parse(readFileSync(new URL(`../corpus/${id.split("-")[0]}.json`, import.meta.url), "utf8")).jobs.find((j) => j.id === id);
// A job's arguments with its start and its products given anew: products[k] is step k's, or the job's own.
const chained = (id, start, products) => ({ name: "draw", arguments: { kind: "reaction", start, steps: job(id).arguments.steps.map((s, k) => (products[k] ? { ...s, products: products[k] } : s)) } });
const IDS = ["trowbridge2018-fig4b-10a", "gaunt2007-fig11d", "grocott2025-fig4e"];
export default {
  about: "Three two-step corpus routes with their products written from earlier compounds by changes and named transformations",
  // The brief: the corpus jobs were drawn on a paper page (A4, ACS Document 1996).
  brief: { destination: { kind: "paper" } },
  calls: [
    chained(IDS[0], [{ text: "C1CC[NH:8]C1", number: "1" }, { text: "O=[C:1]1[CH2:2]CCCC1", number: "2" }],
      [[{ from: "2", changes: [{ at: "1", remove: true }, { do: "join", at: "1-8", with: "1" }, { bond: "1-2", to: "double" }] }], [{ from: "previous", changes: [{ bond: "1-2", to: "single" }, { at: "1", add: "CH2CHPh2" }], number: "10a" }]]),
    chained(IDS[1], [{ text: "C/[CH:11]=[CH:10]/[CH:9]=[CH:8]/CCCC/[CH:3]=[CH:2]/C=O", number: "1" }],
      [[{ from: "1", changes: [{ bond: "8-9", to: "single" }, { bond: "9-10", to: "double" }, { bond: "10-11", to: "single" }, { bond: "2-3", to: "single" }, { do: "close", at: "3-8" }, { do: "close", at: "2-11", config: { 2: "R", 3: "R", 8: "S", 11: "R" } }], number: "2" }]]),
    chained(IDS[2], [{ text: "O=C1CCCCCCC/[CH:1]=[CH:2]\\CCCCCCO1" }],
      [[{ from: "previous", changes: [{ do: "open", at: "1-2" }, { at: "1", add: "CHCH2" }, { at: "2", add: "CHCH2" }], number: "19" }]]),
  ],
  expect: { smiles: Object.assign({}, ...IDS.map((id) => job(id).expect.smiles)) },
};
