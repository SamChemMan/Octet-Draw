// Run: node src/search.check.ts. What Search Reaxys and Search PubChem send for a structure: plain SMILES, or a
// molfile that keeps generic labels.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { ready, parseStructure } = await import("./chem.ts");
const { searchQuery, SEARCHES } = await import("./search.ts");
type Mol = import("./render.ts").Mol;
await ready;

// Aspirin as drawn: SMILES only.
assert.deepEqual(Object.keys(searchQuery(parseStructure("CC(=O)Oc1ccccc1C(=O)O"))), ["smiles"]);
// A label Octet cannot read is a pseudo-atom: the SMILES has no CXSMILES part (|$;;$|) after it.
const ethyl = (text: string): Mol => ({
  atoms: [{ label: "C", location: [0, 0, 0] }, { label: "C", location: [0.866, 0.5, 0] }, { label: "C", text, location: [1.732, 0, 0] }],
  bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }],
});
const odd = searchQuery(ethyl("Zz9"));
assert.ok(odd.smiles && !/\s|\|/.test(odd.smiles), odd.smiles);
// Generic labels: a molfile with each as its atom symbol, under the header Reaxys was seen to read.
for (const label of ["X", "Q", "A", "M", "XH"]) {
  const q = searchQuery(ethyl(label));
  assert.equal(q.smiles, undefined);
  const lines = q.molfile!.split("\n");
  assert.deepEqual(lines.slice(0, 3), ["Octet", "  Octet", ""]);
  assert.match(lines[3], /^\s+3\s+2\s.*V2000$/);
  assert.equal(lines[6].slice(31, 34).trim(), label, lines[6]);
  assert.ok(lines.includes("M  END"));
}
// Reaxys looks for substructures by default, as ChemDraw does; PubChem for the same structure.
assert.deepEqual(SEARCHES.search_reaxys, ["reaxys", false]);
assert.deepEqual(SEARCHES.search_pubchem, ["pubchem", true]);
console.log("search.check: ok");
