// Run: node src/chemfig.check.ts. Fails loudly if Copy As chemfig (src/chemfig.ts) stops writing chemfig code that
// draws the structure as the page does: each bond at its angle and length, labels read away from their bonds, rings
// closed by hooks, wedges the right way round, and separate structures kept in their places.
import assert from "node:assert/strict";
import { toChemfig } from "./chemfig.ts";
import type { Atom, Bond, Mol } from "./render.ts";

const c30 = Math.cos(Math.PI / 6), s30 = 0.5;
const A = (label: string, x: number, y: number, more: Partial<Atom> = {}): Atom => ({ label, location: [x, y, 0], ...more });
const B = (a: number, b: number, type = 1, more: Partial<Bond> = {}): Bond => ({ type, atoms: [a, b], ...more });
const mol = (atoms: Atom[], bonds: Bond[]): Mol => ({ atoms, bonds });
// A regular ring of n atoms with bonds of length 1 round (cx, cy), its first atom at angle t (degrees).
const ring = (n: number, cx: number, cy: number, t: number, label = "C") => {
  const r = 1 / (2 * Math.sin(Math.PI / n));
  return Array.from({ length: n }, (_, k) => A(label, cx + r * Math.cos(((t + (360 * k) / n) * Math.PI) / 180), cy + r * Math.sin(((t + (360 * k) / n) * Math.PI) / 180)));
};

// Ethanol, drawn as a zigzag: skeletal carbons are empty atoms, and OH reads away from its bond.
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", c30, s30), A("O", 2 * c30, 0)], [B(0, 1), B(1, 2)])), "\\chemfig{-[:30]-[:-30]OH}");
// The same drawn the other way: the O is written first, as HO, and the bond leaves its O.
assert.equal(toChemfig(mol([A("O", 0, 0), A("C", c30, s30), A("C", 2 * c30, 0)], [B(0, 1), B(1, 2)])), "\\chemfig{HO-[:30]-[:-30]}");
// A bond into or out of a label read either way meets its N or O, not its H.
assert.equal(toChemfig(mol([A("C", 0, 0), A("N", 0, 1)], [B(0, 1)])), "\\chemfig{NH_2-[:-90]}");
assert.equal(toChemfig(mol([A("N", 0, 0), A("C", c30, -s30), A("C", c30, -1 - s30)], [B(0, 1), B(1, 2)])), "\\chemfig{H_2N-[:-30]-[:-90]}");
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", c30, s30), A("O", c30, 1 + s30)], [B(0, 1), B(1, 2)])), "\\chemfig{-[:30]-[:90,,,1]OH}");
// Acetic acid: the longest chain is the main one, the C=O a branch, its double bond centred (a terminal =O).
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", c30, s30), A("O", c30, 1 + s30), A("O", 2 * c30, 0)], [B(0, 1), B(1, 2, 2), B(1, 3)])),
  "\\chemfig{-[:30](=[:90]O)-[:-30]OH}");
// Bond lengths other than the document's are written as chemfig's length factor.
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", 1.5, 0)], [B(0, 1)])), "\\chemfig{-[,1.5]}");

// Benzene: the ring is closed by a hook, and each double bond's second line goes inside the ring (chemfig's =^ or
// =_, by the way the bond is written).
{
  const atoms = ring(6, 0, 0, 150);
  const code = toChemfig(mol(atoms, [B(0, 1, 2), B(1, 2), B(2, 3, 2), B(3, 4), B(4, 5, 2), B(5, 0)]));
  assert.equal(code, "\\chemfig{?[1]=^[:-90]-[:-30]=^[:30]-[:90]=^[:150]?[1]}");
}
// A ring is closed by a plain bond where it can be; where it cannot, the hook writes the bond.
{
  const atoms = ring(6, 0, 0, 150);
  assert.equal(toChemfig(mol(atoms, [B(0, 1), B(1, 2), B(2, 3), B(3, 4), B(4, 5), B(5, 0, 2)])), "\\chemfig{?[1]=_[:30]-[:-30]-[:-90]-[:-150]-[:150]?[1]}");
  assert.match(toChemfig(mol(atoms, [B(0, 1, 2), B(1, 2), B(2, 3), B(3, 4), B(4, 5), B(5, 0, 2)])), /\?\[1,\{=[_^]?\}\]/);
}
// Naphthalene: two hooks, each named once on its first atom and once with its bond.
{
  const left = ring(6, 0, 0, 30), right = ring(6, 2 * c30, 0, 30);
  // right's atoms 2 and 4 are left's 0 and 5: keep right's other four.
  const atoms = [...left, right[0], right[1], right[5], right[4]];
  const bonds = [B(0, 1, 2), B(1, 2), B(2, 3, 2), B(3, 4), B(4, 5, 2), B(5, 0), B(0, 7), B(7, 6, 2), B(6, 8), B(8, 9, 2), B(9, 5)];
  const code = toChemfig(mol(atoms, bonds));
  for (const name of ["1", "2"]) assert.equal(code.split(`?[${name}`).length - 1, 2, code);
}

// Wedges: chemfig's < is narrow at the atom it leaves; Octet's wedge is narrow at atoms[0], the stereocentre.
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", 1, 0)], [B(0, 1, 1, { stereo: 1 })])), "\\chemfig{<}");
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", 1, 0)], [B(1, 0, 1, { stereo: 1 })])), "\\chemfig{>}");
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", 1, 0)], [B(0, 1, 1, { stereo: 6 })])), "\\chemfig{<:}");
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", 1, 0)], [B(1, 0, 1, { display: "hollow" })])), "\\chemfig{>|}");
// Triple bonds, and styles chemfig has no character for, as TikZ options.
assert.equal(toChemfig(mol([A("C", 0, 0), A("N", 1, 0)], [B(0, 1, 3)])), "\\chemfig{~N}");
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", 1, 0)], [B(0, 1, 1, { display: "bold", colour: "#ff0000" })])), "\\chemfig{-[,,,,color={rgb,255:red,255;green,0;blue,0},line width=2pt]}");
assert.match(toChemfig(mol([A("C", 0, 0), A("C", 1, 0)], [B(0, 1, 1, { display: "wavy" })])), /^% Wavy bonds need \\usetikzlibrary\{decorations\.pathmorphing\}/);

// Lone atoms, charges and isotopes: H₂O with its H first, NH₄⁺, ¹³CH₄ (the mass number in braces, so chemfig keeps
// it with its C), and a skeletal carbanion's charge beside it.
assert.equal(toChemfig(mol([A("O", 0, 0)], [])), "\\chemfig{H_2O}");
assert.equal(toChemfig(mol([A("N", 0, 0, { charge: 1 })], [])), "\\chemfig{NH_4^{+}}");
assert.equal(toChemfig(mol([A("C", 0, 0, { isotope: 13 })], [])), "\\chemfig{{^{13}C}H_4}");
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", c30, s30, { charge: -1 }), A("C", 2 * c30, 0)], [B(0, 1), B(1, 2)])), "\\chemfig{-[:30]\\charge{90:1pt=$\\scriptstyle -$}{}-[:-30]}");
// A coloured label: each of its atoms takes the colour, and they stay separate atoms.
assert.equal(toChemfig(mol([A("C", 0, 0), A("O", 1, 0, { colour: "#ff0000" })], [B(0, 1)])), "\\chemfig{-{\\color[RGB]{255,0,0}O}|{\\color[RGB]{255,0,0}H}}");
// An abbreviation reads backwards where its bond comes from the right (MeO), and meets the bond at its O.
assert.equal(toChemfig(mol([A("O", 0, 0, { text: "OMe" }), A("C", 1, 0)], [B(0, 1)])), "\\chemfig{MeO-}");
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", 1, 0, { text: "CO2Et" })], [B(0, 1)])), "\\chemfig{-CO_2Et}");
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", 0.001, 1, { text: "CO2Et" })], [B(0, 1)])), "\\chemfig{-[:90,,,1]CO_2Et}");
assert.equal(toChemfig(mol([A("C", 0, 0, { text: "CO2Et" }), A("C", 1, 0)], [B(0, 1)])), "\\chemfig{EtO_2C-}");
// Text that chemfig would read as code goes in braces, an atom of its own (chemfig's C|{(CH_3)_3}).
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", 1, 0, { text: "C(CH3)3" })], [B(0, 1)])), "\\chemfig{-C|{(CH_3)_3}}");

// Separate structures (a salt) keep their places: the second hangs off the first by a bond chemfig does not draw.
assert.equal(toChemfig(mol([A("Na", 0, 0, { charge: 1 }), A("Cl", 2, 0, { charge: -1 })], [])), "\\chemfig{Na^{+}(-[,2,,,draw=none]Cl^{-})}");
// A hidden H is not written, nor its bond; nothing to draw writes nothing.
assert.equal(toChemfig(mol([A("C", 0, 0), A("H", 1, 0, { hidden: true })], [B(0, 1)])), "\\chemfig{CH_4}");
assert.equal(toChemfig(mol([], [])), "");

// Every bracket and brace is closed, in a large drawing too.
{
  const atoms = [...ring(6, 0, 0, 30), ...ring(5, 4, 0, 0, "N")], bonds = [0, 1, 2, 3, 4, 5].map((k) => B(k, (k + 1) % 6, k % 2 ? 1 : 2));
  for (let k = 0; k < 5; k++) bonds.push(B(6 + k, 6 + ((k + 1) % 5)));
  bonds.push(B(0, 6));
  const code = toChemfig(mol(atoms, bonds));
  let depth = 0;
  for (const ch of code) { depth += "({[".includes(ch) ? 1 : ")}]".includes(ch) ? -1 : 0; assert.ok(depth >= 0, code); }
  assert.equal(depth, 0, code);
}
console.log("chemfig.check: all pass");
