// Run: node src/file.check.ts. Fails loudly if the file format breaks or accepts a bad file.
import assert from "node:assert/strict";
import { addRing, EMPTY, setBondSpec, setElement } from "./edit.ts";
import { parse, serialize } from "./file.ts";

// A drawing survives a save and reopen.
const mol = setBondSpec(setElement(addRing(EMPTY, 6, true, { point: [0, 0] }), 0, "N"), 1, { type: 1, display: "wavy" });
const back = parse(serialize(mol));
assert.deepEqual(back.bonds, mol.bonds);
assert.deepEqual(back.atoms.map((a) => a.label), mol.atoms.map((a) => a.label));
for (let i = 0; i < mol.atoms.length; i++) assert.ok(Math.abs(back.atoms[i].location[0] - mol.atoms[i].location[0]) < 1e-4);
console.log("file.check: round trip ok");

// Bad files are refused with a message, never half-loaded.
const bad = [
  "not json",
  JSON.stringify({ format: "other" }),
  JSON.stringify({ format: "octet", version: 99, structure: { atoms: [], bonds: [] } }),
  JSON.stringify({ format: "octet", version: 1, structure: { atoms: [{ label: "C", x: 0, y: 0 }], bonds: [{ atoms: [0, 5], type: 1 }] } }),
  JSON.stringify({ format: "octet", version: 1, structure: { atoms: [{ label: "<script>", x: 0, y: 0 }], bonds: [] } }),
  JSON.stringify({ format: "octet", version: 1, structure: { atoms: [{ label: "C", x: 1e400, y: 0 }], bonds: [] } }),
  JSON.stringify({ format: "octet", version: 1, structure: { atoms: [{ label: "C", x: 0, y: 0 }, { label: "C", x: 1, y: 0 }], bonds: [{ atoms: [0, 1], type: 9 }] } }),
];
for (const text of bad) assert.throws(() => parse(text), /Octet|damaged/);
console.log("file.check: bad files refused");
