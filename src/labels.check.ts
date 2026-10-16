// Run: node src/labels.check.ts. Fails loudly if label reading breaks.
import assert from "node:assert/strict";
import { anchorElement, isElement, labelSmiles, units } from "./labels.ts";

assert.deepEqual(units("CO2Et").map((u) => [u.text, u.count ?? ""]), [["C", ""], ["O", "2"], ["Et", ""]]);
assert.deepEqual(units("NHBoc").map((u) => u.text), ["N", "H", "Boc"]);
assert.deepEqual(units("N(Boc)2").map((u) => [u.text, u.count ?? ""]), [["N", ""], ["(Boc)", "2"]]);
assert.deepEqual(units("CCl3").map((u) => [u.text, u.count ?? ""]), [["C", ""], ["Cl", "3"]]);
assert.equal(anchorElement("OMe"), "O");
assert.equal(anchorElement("Ph"), undefined);
assert.ok(isElement("Cl") && !isElement("OMe"));
const cases: Record<string, string> = {
  OMe: "O(C)", CO2Et: "C(=O)O(CC)", CO2H: "C(=O)O", CF3: "C(F)(F)(F)", NHBoc: "N(C(=O)OC(C)(C)C)", NMe2: "N(C)(C)",
  CH2OH: "CO", OH: "O", CN: "C#N", "N(Boc)2": "N(C(=O)OC(C)(C)C)(C(=O)OC(C)(C)C)", Ph: "c1ccccc1", PPh3: "P(c1ccccc1)(c1ccccc1)(c1ccccc1)",
};
for (const [label, smiles] of Object.entries(cases)) assert.equal(labelSmiles(label), smiles, label);
assert.equal(labelSmiles("Hello world"), undefined);
console.log("labels.check: ok");
