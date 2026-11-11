// The lab's speed job paper-cycle (scripts/mcp-evals/speed.mjs) as Haiku wrote it in lines (plan 19, round 3): the
// Hajos–Parrish proline cycle with its title in the middle. The title met intermediate 2 and nothing the model could
// move cleared it; the cycle now leaves room for its centre text, so the reply's check is clean.
export default {
  about: "paper-cycle: the Hajos–Parrish proline cycle, 4 intermediates with side text and a title, as lines in one draw call with the brief",
  brief: false,
  calls: [{ name: "draw", arguments: { brief: "quick", lines: "# Hajos–Parrish proline cycle\nOC(=O)[C@@H]1CCCN1 (1) -> CC(=[N+]1CCC[C@H]1C(=O)[O-])CCC1(C)C(=O)CCC1=O (2), +triketone, -H2O -> C=C(CCC1(C)C(=O)CCC1=O)N1CCC[C@H]1C(=O)O (3), tautomerisation -> CC12C(=O)CCC1(O)CC(=[N+]3CCC[C@H]3C(=O)[O-])CC2 (4), intramolecular aldol -> 1, +H2O, -ketol" } }],
  expect: { smiles: { 1: "OC(=O)[C@@H]1CCCN1", 2: "CC(=[N+]1CCC[C@H]1C(=O)[O-])CCC1(C)C(=O)CCC1=O", 3: "C=C(CCC1(C)C(=O)CCC1=O)N1CCC[C@H]1C(=O)O", 4: "CC12C(=O)CCC1(O)CC(=[N+]3CCC[C@H]3C(=O)[O-])CC2" } },
};
