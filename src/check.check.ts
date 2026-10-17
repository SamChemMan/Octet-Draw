// Run: node src/check.check.ts. Fails loudly if structure checks break.
import assert from "node:assert/strict";
import { EMPTY, addCharge, bondTo, moveAtoms, setElement, sprout } from "./edit.ts";
import { messy, problems } from "./check.ts";

// A nitrogen with four bonds is flagged, with a positive charge as the fix; once charged it is fine.
let m = setElement(sprout(EMPTY, [0, 0]), 0, "N");
for (const p of [[-1, 0], [0, 1], [0, -1]] as [number, number][]) m = bondTo(m, 0, p);
const found = problems(m);
assert.equal(found.length, 1);
assert.match(found[0].message, /^N1 has 4 bonds\. Nitrogen has a maximum of 3\./);
assert.equal(found[0].fix?.charge, 1);
assert.equal(problems(addCharge(m, 0, 1)).length, 0);
// Clean drawings are not messy; a squashed bond or overlapping atoms are.
const clean = sprout(sprout(EMPTY, [0, 0]), 1);
assert.equal(messy(clean), false);
assert.equal(messy(moveAtoms(clean, new Set([2]), [-0.5, 0])), true);
// Bonds that cross are messy. The quick check agrees with comparing every pair, on random drawings.
const x: typeof clean = { atoms: [[0, 0], [1, 1], [0, 1], [1, 0]].map(([a, b]) => ({ label: "C", location: [a, b, 0] as [number, number, number] })), bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [2, 3] }] };
assert.equal(messy(x), true);
let seed = 3;
const seen = new Set<boolean>();
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
for (let n = 0; n < 300; n++) {
  // Bonds one long (so only crowding and crossing decide), and a few lone atoms.
  const atoms: typeof clean.atoms = [], bonds: typeof clean.bonds = [];
  for (let k = 1 + Math.floor(rand() * 7); k > 0; k--) {
    const [a, b, t] = [rand() * 3, rand() * 3, rand() * 2 * Math.PI];
    bonds.push({ type: 1, atoms: [atoms.length, atoms.length + 1] });
    atoms.push({ label: "C", location: [a, b, 0] }, { label: "C", location: [a + Math.cos(t), b + Math.sin(t), 0] });
  }
  for (let k = Math.floor(rand() * 3); k > 0; k--) atoms.push({ label: "C", location: [rand() * 3, rand() * 3, 0] });
  const m = { atoms, bonds }, p = (i: number) => atoms[i].location, d = (i: number, j: number) => Math.hypot(p(i)[0] - p(j)[0], p(i)[1] - p(j)[1]);
  const s = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const near = (i: number, j: number) => bonds.some((b) => b.atoms.includes(i) && b.atoms.includes(j));
  const want = bonds.some((b) => d(b.atoms[0], b.atoms[1]) < 0.75 || d(b.atoms[0], b.atoms[1]) > 1.3)
    || atoms.some((_, i) => atoms.some((__, j) => j > i && d(i, j) < 0.35 && !near(i, j)))
    || bonds.some((b, k) => bonds.some((c, l) => l > k && !b.atoms.some((i) => c.atoms.includes(i))
      && s(p(b.atoms[0]), p(b.atoms[1]), p(c.atoms[0])) * s(p(b.atoms[0]), p(b.atoms[1]), p(c.atoms[1])) < 0
      && s(p(c.atoms[0]), p(c.atoms[1]), p(b.atoms[0])) * s(p(c.atoms[0]), p(c.atoms[1]), p(b.atoms[1])) < 0));
  assert.equal(messy(m), want, `random drawing ${n}`);
  seen.add(want);
}
assert.equal(seen.size, 2, "both tidy and messy drawings were tried");
console.log("check.check: ok");
