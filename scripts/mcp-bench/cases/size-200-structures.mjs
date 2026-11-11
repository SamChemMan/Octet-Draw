// Size (MCP v2 test plan R3, P1): 200 structures in one draw call, the most draw takes. Alcohols of 1 to 12 carbons,
// each numbered.
const structures = Array.from({ length: 200 }, (_, i) => ({ text: `${"C".repeat(1 + (i % 12))}O`, number: String(i + 1) }));
export default {
  about: "200 numbered structures in one draw call (test plan R3)",
  calls: [{ name: "draw", arguments: { kind: "structures", structures } }],
  expect: { smiles: Object.fromEntries(structures.filter((_, i) => i % 50 === 0).map((s) => [s.number, s.text])) },
};
