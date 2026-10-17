// Run: node src/oct.check.ts. Fails loudly if a .oct file stops coming back exactly, or trusts a changed one.
import assert from "node:assert/strict";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { addArrow, addCaption, addRing, EMPTY } from "./edit.ts";
import { parse, serialize } from "./file.ts";
import { readOct, writeOct } from "./oct.ts";

let mol = addRing(EMPTY, 6, false, { point: [0, 0] });
[mol] = addCaption(mol, { text: "Café 5 °C -- über", x: 0, y: -3 });
[mol] = addArrow(mol, { kind: "reaction", from: [3, 0], to: [6, 0] });
mol = { ...mol, atoms: mol.atoms.map((a, i) => (i === 0 ? { ...a, isotope: 13, location: [a.location[0] + 0.123456, a.location[1], 0] } : a)) };
const style = { ...DEFAULT_STYLE, labelSize: 12 };
const file = writeOct(mol, style);
// ChemDraw reads the CDXML part; Octet gets its own drawing back exactly, coordinates and all.
assert.match(file, /^<\?xml[^]*<\/CDXML>\n<!--Octet 1 [0-9a-f]{16} [A-Za-z0-9+/=]+-->\n$/);
const back = readOct(file);
assert.equal(serialize(back.mol), serialize(parse(serialize({ ...mol, style }))));
assert.deepEqual(back.lost, {});
// Another program changed the CDXML (here a label size): Octet reads the CDXML, not its stale copy.
const edited = readOct(file.replace('LabelSize="12"', 'LabelSize="14"'));
assert.equal(edited.mol.style?.labelSize, 14);
// A damaged copy falls back to the CDXML; an old .octet file is the JSON alone.
assert.equal(readOct(file.replace(/ ([A-Za-z0-9+/=]{8})/, " AAAA$1")).mol.atoms.length, 6);
assert.equal(readOct(serialize(mol)).mol.atoms.length, 6);
// What the window showed (View > Show Grid, Show Rulers, Show Crosshair) comes back with the drawing.
const guides = { rulers: true as const, crosshair: [1, -0.5] as [number, number] };
assert.deepEqual(readOct(writeOct({ ...mol, guides }, style)).mol.guides, guides);
assert.equal(readOct(file).mol.guides, undefined);
console.log("oct.check: ok");
