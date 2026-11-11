// Size (MCP v2 test plan R3, P1): one large molecule from SMILES, a peptide of 249 glycines (997 atoms; Octet reads up
// to 1,000 atoms in one structure, as the window does).
const text = `${"NCC(=O)".repeat(249)}O`;
export default {
  about: "A 997-atom peptide from SMILES in one draw call (test plan R3)",
  calls: [{ name: "draw", arguments: { kind: "structures", structures: [{ text, number: "1" }] } }],
  expect: { smiles: { 1: text } },
};
