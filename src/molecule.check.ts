// Run: node src/molecule.check.ts. Fails loudly if one bond (ethane) or one labelled atom stops being a molecule: the
// Actions panel must give it every structure action, and each structure action must work on ethane.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { browser } from "../scripts/checkkit.ts";

browser();
const { analyse, cleanUp, expandWithOrigins, parseStructure, ready, structures, toInchi, toInchiKey, toSmiles } = await import("./chem.ts");
const { wholeMolecule } = await import("./edit.ts");
const { graphOf } = await import("./naming.ts");
const { iupacName } = await import("./namer.ts");
const { predict, readTables } = await import("./nmr.ts");
const { properties } = await import("./props.ts");
const { calculated, propertyReport, propertyValues } = await import("./proprows.ts");
const { searchQuery } = await import("./search.ts");
const { isotopePattern } = await import("./mass.ts");
type Mol = import("./render.ts").Mol;
await ready;

const at = (label: string, x: number, more = {}) => ({ label, location: [x, 0, 0] as [number, number, number], ...more });
const ethane: Mol = { atoms: [at("C", 0), at("C", 1)], bonds: [{ type: 1, atoms: [0, 1] }] };
const propane: Mol = { atoms: [at("C", 0), at("C", 1), at("C", 2)], bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }] };
const alone = (more = {}): Mol => ({ atoms: [at("O", 0, more)], bonds: [] });

// One bond on its own is a whole molecule; a bond or an atom in a larger structure is not, nor two pieces together.
assert.ok(wholeMolecule(ethane, [0, 1]) && wholeMolecule(ethane, [1, 0]));
assert.ok(!wholeMolecule(ethane, [0]));
// A bond counts whatever its atoms are: a methyl with its attachment point is a structure, as larger ones are.
assert.ok(wholeMolecule({ atoms: [at("C", 0, { attach: true }), at("C", 1)], bonds: ethane.bonds }, [0, 1]));
assert.ok(!wholeMolecule(propane, [0, 1]) && !wholeMolecule(propane, [1]) && wholeMolecule(propane, [0, 1, 2]));
const withWater: Mol = { atoms: [...ethane.atoms, at("O", 3)], bonds: ethane.bonds };
assert.ok(!wholeMolecule(withWater, [0, 2]) && wholeMolecule(withWater, [2]));
// An alkene on a metal by a multi-centre attachment (Zeise's salt) is part of the complex, with no bond out of it.
assert.ok(!wholeMolecule({ atoms: [...ethane.atoms, at("C", 0.5, { centre: { atoms: [0, 1] } }), at("Pt", 0.5)], bonds: [{ type: 2, atoms: [0, 1] }, { type: 1, atoms: [2, 3] }] }, [0, 1]));
// One labelled atom is a molecule (water as O, or H2O typed as a label); an attachment point, a polymer bead or a label
// read as text only is not.
assert.ok(wholeMolecule(alone(), [0]) && wholeMolecule(alone({ label: "C", text: "H2O" }), [0]));
for (const more of [{ attach: true }, { bead: true }, { text: "Workup", chemical: false }]) assert.ok(!wholeMolecule(alone(more), [0]), JSON.stringify(more));

// The editor and the panel use it: a lone atom or bond that is a whole molecule gets its structure's actions.
const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), actions = readFileSync(new URL("Actions.tsx", import.meta.url), "utf8");
assert.match(editor, /const molecule = ids\.length <= 2 && wholeMolecule\(doc, ids\) \? structureOf\(\) : undefined;/);
assert.match(actions, /items\.push\(\.\.\.actionItems\(context\.molecule, messy, hiddenWarnings, warned, online, more\)\.filter/);
// Both the atom and the bond context carry it, and both the editor and the panel show its formula and mass.
assert.equal(editor.match(/, molecule \};/g)?.length, 2);
assert.equal((editor + actions).match(/\(\w+\??\.kind === "atom" \|\| \w+\??\.kind === "bond"\) && !!\w+\.molecule\)/g)?.length, 2);

// Each structure action on ethane. The formula and mass (the panel's, Properties).
const facts = analyse(ethane)!;
assert.equal(facts.length, 1);
assert.equal(facts[0].formula, "C2H6");
assert.ok(Math.abs(facts[0].weight - 30.07) < 0.01, String(facts[0].weight));
assert.ok(structures(ethane)?.[0]);
// Copy as SMILES, InChI and InChIKey, and Search Reaxys and PubChem.
assert.equal(toSmiles(ethane), "CC");
assert.equal(toInchi(ethane), "InChI=1S/C2H6/c1-2/h1-2H3");
assert.equal(toInchiKey(ethane), "OTMSDBZUPAUEDD-UHFFFAOYSA-N");
assert.deepEqual(searchQuery(ethane), { smiles: "CC" });
// Structure to name.
const graph = graphOf(expandWithOrigins(ethane, true).mol)!;
assert.equal(iupacName(graph), "ethane");
assert.ok(properties(graph));
// The Properties panel's H-bond donors, H-bond acceptors and Rings, from SMILES as Indigo reads them (RDKit's NumHBD
// and NumHBA; rings in the smallest set). One value per structure, as every row: two structures, and a reaction.
const counts = (smiles: string) => {
  const values = propertyValues(structures(parseStructure(smiles))!.filter((s) => !!s), calculated).flat();
  return ["hbd", "hba", "rings"].map((k) => values.find((r) => r.key === k)!.values.join("; "));
};
for (const [name, smiles, want] of [
  ["aspirin", "CC(=O)Oc1ccccc1C(=O)O", "1 3 1"], ["caffeine", "Cn1cnc2c1c(=O)n(C)c(=O)n2C", "0 3 2"],
  ["paracetamol", "CC(=O)Nc1ccc(O)cc1", "2 2 1"], ["glucose", "OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O", "5 6 1"],
  ["morpholine", "C1COCCN1", "1 2 1"], ["pyridine", "c1ccncc1", "0 1 1"], ["indole", "c1ccc2[nH]ccc2c1", "1 0 2"],
  ["urea", "NC(N)=O", "2 1 0"], ["ethanol", "CCO", "1 1 0"], ["benzoic acid", "OC(=O)c1ccccc1", "1 1 1"],
]) assert.deepEqual(counts(smiles), want.split(" "), name);
assert.deepEqual(counts("CC(=O)Oc1ccccc1C(=O)O.Cn1cnc2c1c(=O)n(C)c(=O)n2C"), ["1; 0", "3; 3", "1; 2"]);
assert.deepEqual(counts("CC(=O)O.OCC>>CC(=O)OCC"), ["1; 1; 0", "1; 1; 2", "0; 0; 0"]);
const report = propertyReport(propertyValues(structures(parseStructure("NC(N)=O"))!.filter((s) => !!s), calculated)).split("\n");
assert.ok(report.includes("H-bond donors\t2") && report.includes("H-bond acceptors\t1") && report.includes("Rings\t0"));
// Predict ¹H-NMR and ¹³C-NMR shifts: one signal for the six H, and one for the two C.
readTables(gunzipSync(readFileSync(new URL("../data/nmr/shifts.bin.gz", import.meta.url))));
const h = predict(graph, "1H")!, c = predict(graph, "13C")!;
assert.deepEqual(h.signals.map((s) => [s.atoms, s.nuclei]), [[[0, 1], 6]]);
assert.deepEqual(c.signals.map((s) => [s.atoms, s.nuclei]), [[[0, 1], 2]]);
// Mass spec analysis: its molecular ion's isotope pattern.
assert.ok(Math.abs(isotopePattern("C2H6")![0].mz - 30.047) < 0.001);
// Clean up structure keeps the one bond.
const clean = cleanUp(ethane);
assert.equal(clean.atoms.length, 2);
assert.equal(clean.bonds.length, 1);
// One labelled atom: water's formula.
assert.equal(analyse(alone())![0].formula, "H2O");
console.log("molecule.check: ok");
