// Run: node src/labels.check.ts. Fails loudly if label reading breaks.
import assert from "node:assert/strict";
import { anchorElement, formulaRuns, isElement, labelSmiles, units } from "./labels.ts";

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
// Formulas in conditions and tables: counts after an element, group or bracket are subscripts; other numbers are not.
const runs = (t: string) => formulaRuns(t).map((r) => (r.sub ? `_${r.text}` : r.text)).join("");
for (const [t, want] of Object.entries({
  K2CO3: "K_2CO_3", "Pd(PPh3)4": "Pd(PPh_3)_4", Et3N: "Et_3N", "DMSO-d6": "DMSO-d_6", "[Rh(cod)Cl]2": "[Rh(cod)Cl]_2", B2pin2: "B_2pin_2",
  "1,4-dioxane": "1,4-dioxane", "12 h": "12 h", L1: "L1", B3LYP: "B3LYP", "THF/H2O (4:1)": "THF/H_2O (4:1)", "2a": "2a",
})) assert.equal(runs(t), want, t);
console.log("labels.check: ok");
