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
console.log("check.check: ok");
