// Size (MCP v2 test plan R3, P1): a 50-step route. draw takes 20 steps in one call, so an AI app sends it as three
// reactions, each starting from the last product before it and drawn below.
const product = (k) => `${"C".repeat(2 + (k % 6))}O`, step = (k) => ({ reagents: ["NaBH4"], solvents: ["MeOH"], yield: "90%", products: [{ text: product(k), number: String(k + 2) }] });
const part = (from, to) => ({ name: "draw", arguments: { kind: "reaction", start: from ? [{ text: product(from - 1) }] : [{ text: "CCO", number: "1" }], steps: Array.from({ length: to - from }, (_, i) => step(from + i)) } });
export default {
  about: "A 50-step route in three draw calls of 20, 20 and 10 steps (test plan R3)",
  calls: [part(0, 20), part(20, 40), part(40, 50)],
  expect: { smiles: { 1: "CCO", 21: product(19), 51: product(49) } },
};
