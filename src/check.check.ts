// Run: node src/check.check.ts. Fails loudly if structure checks break.
import assert from "node:assert/strict";
import { EMPTY, LARGE, addCharge, bondTo, moveAtoms, setElement, sprout } from "./edit.ts";
import type { Mol } from "./render.ts";
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
// An aromatic bond counts 1.5 and a bond of an unknown type counts 1: N with an aromatic bond, a double bond, a
// query bond and a single bond has 5.5 bond orders.
const odd = { ...m, bonds: m.bonds.map((b, k) => ({ ...b, type: [4, 2, 7, 1][k] })) };
assert.match(problems(odd)[0].message, /^N1 has 5\.5 bond orders\./);
// A large drawing uses a grid, a small one the plain loops: both give the same answer. Random chains of near-unit
// bonds (some cross, some atoms land close) are checked alone, then inside a drawing made large by spare atoms far
// away, with the chain selected and with nothing selected.
{
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const spare = Array.from({ length: LARGE + 1 }, (_, k) => ({ label: "C", location: [1000 + (k % 20) * 2, (k / 20 | 0) * 2, 0] as [number, number, number] }));
  let messyCount = 0;
  for (let t = 0; t < 400; t++) {
    const n = 4 + Math.floor(rand() * 30), atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [];
    let x = rand() * 4, y = rand() * 4, a = 0;
    for (let i = 0; i < n; i++) {
      const l = t % 4 ? 0.8 + rand() * 0.45 : 0.6 + rand() * 0.8;
      a += (rand() - 0.5) * 2.5;
      if (i && rand() < 0.15) { x = rand() * 6; y = rand() * 6; } else if (i) { x += l * Math.cos(a); y += l * Math.sin(a); bonds.push({ type: 1, atoms: [i - 1, i] }); }
      atoms.push({ label: "C", location: [x, y, 0] });
    }
    const small: Mol = { atoms, bonds }, large: Mol = { atoms: [...atoms, ...spare], bonds };
    const chain = new Set(atoms.map((_, i) => i)), part = new Set([...chain].filter((i) => i % 3));
    for (const ids of [chain, part]) assert.equal(messy(large, ids), messy(small, ids), `same answer on drawing ${t}`);
    assert.equal(messy(large, new Set()), messy(small, new Set()), `same answer on drawing ${t}, nothing selected`);
    if (messy(small)) messyCount++;
  }
  assert.ok(messyCount > 50 && messyCount < 350, `both answers are tested (${messyCount} of 400 messy)`);
}
console.log("check.check: ok");
