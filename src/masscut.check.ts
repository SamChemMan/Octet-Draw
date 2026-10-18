// Run: node src/masscut.check.ts. Fails loudly if a mass-fragmentation cut finds the wrong bonds, sides or sums.
import assert from "node:assert/strict";
import type { Mol } from "./render.ts";
import { addFormulas, bendOf, crossedBonds, cutSides, type Piece } from "./masscut.ts";

// Pentane drawn left to right: C0–C1–C2–C3–C4.
const pentane: Mol = { atoms: [0, 1, 2, 3, 4].map((i) => ({ label: "C", location: [i * 0.866, i % 2 ? 0.5 : 0, 0] })), bonds: [0, 1, 2, 3].map((i) => ({ type: 1, atoms: [i, i + 1] })) };
// The pieces a cut leaves, as fragmentMasses gives them, from a fake that counts carbons (CH3 at the ends of a piece,
// CH2 inside it, as homolysis leaves them).
const fake = (m: Mol, cut: number[]): Piece[] => {
  const root = m.atoms.map((_, i) => i), find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  m.bonds.forEach((b, k) => { if (!cut.includes(k)) root[find(b.atoms[0])] = find(b.atoms[1]); });
  const touched = new Set(cut.flatMap((k) => m.bonds[k].atoms.map(find)));
  return [...touched].map((r) => {
    const atoms = m.atoms.map((_, i) => i).filter((i) => find(i) === r), h = atoms.reduce((s, i) => s + (i === 0 || i === 4 ? 3 : 2), 0);
    return { atoms, formula: `C${atoms.length > 1 ? atoms.length : ""}H${h}`, exact: atoms.length * 12 + h * 1.007825 };
  });
};

// A vertical cut downwards between C1 and C2 crosses bond 1; C1 is on the right of a downward cut.
const down: [number, number][] = [[1.3, 2], [1.3, -2]];
assert.deepEqual(crossedBonds(pentane, down), [{ bond: 1, side: -1 }]);
const one = cutSides(pentane, down, fake)!;
assert.deepEqual(one.map((s) => [s.side, s.formula, s.atoms.sort()]), [[1, "C3H7", [2, 3, 4]], [-1, "C2H5", [0, 1]]]);
// Two cuts' worth of bonds on one path (a curve through bonds 0 and 3): the two end pieces are on one side, added up.
const bent: [number, number][] = [[0.4, -1], [0.4, 1], [3.1, 1], [3.1, -1]];
const two = cutSides(pentane, bent, fake)!;
assert.equal(two.length, 2);
const outside = two.find((s) => s.atoms.includes(0))!, inside = two.find((s) => s.atoms.includes(2))!;
assert.equal(outside.formula, "C2H6");
assert.deepEqual(outside.atoms.sort(), [0, 4]);
assert.ok(Math.abs(outside.exact - (24 + 6 * 1.007825)) < 1e-9);
assert.equal(inside.formula, "C3H6");
assert.notEqual(outside.side, inside.side);
// Nothing crossed: no sides.
assert.equal(cutSides(pentane, [[0, 3], [3, 3]], fake), undefined);
// A ring bond alone leaves one piece, so one side.
const ring: Mol = { atoms: [0, 1, 2].map((i) => ({ label: "C", location: [Math.cos((i * 2 * Math.PI) / 3), Math.sin((i * 2 * Math.PI) / 3), 0] })), bonds: [[0, 1], [1, 2], [2, 0]].map((a) => ({ type: 1, atoms: a })) };
assert.equal(cutSides(ring, [[0.2, 0.2], [1, 1]], fake)!.length, 1);

// Hill order, with H after C, and alphabetical with no carbon.
assert.equal(addFormulas(["CH3", "C2H5O", "Cl"]), "C3H8ClO");
assert.equal(addFormulas(["HO", "Br"]), "BrHO");
assert.equal(addFormulas(["C6H5", "C"]), "C7H5");

// Option's curve: straight when the pointer kept near the line, bent to its farthest point otherwise (left positive).
assert.equal(bendOf([[0, 0], [1, 0.01], [2, 0]]), 0);
assert.ok(Math.abs(bendOf([[0, 0], [1, 0.5], [2, 0]]) - 0.25) < 1e-9);
assert.ok(bendOf([[0, 0], [1, -0.5], [2, 0]]) < 0);
assert.equal(bendOf([[0, 0], [1, 5], [2, 0]]), 0.5);
console.log("masscut.check: ok");
