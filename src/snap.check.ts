// Run: node src/snap.check.ts. Fails loudly if snapping breaks.
import assert from "node:assert/strict";
import { EMPTY, merge, sprout } from "./edit.ts";
import { snapBoxes, snapMove } from "./snap.ts";

// Two ethanes side by side. Moving the second (atoms 2, 3) a little off line snaps it back level.
const a = sprout(EMPTY, [0, 0]), m = merge(a, a, [3, 0.04]);
const ids = new Set([2, 3]);
const near = snapMove(m, ids, [0, -0.02], 0.1);
assert.equal(near.guides.length > 0, true, "a guide shows");
assert.ok(Math.abs(near.d[1] - -0.04) < 1e-9, "it lines up exactly");
// Dropping an atom close to another atom snaps onto it.
// Atom 2 starts at (3, 0.04); atom 1 is at (cos 30°, sin 30°). Drag atom 2 to within 0.04 of atom 1.
const onto = snapMove(m, ids, [Math.cos(Math.PI / 6) - 3 + 0.03, Math.sin(Math.PI / 6) - 0.04 + 0.02], 0.1);
assert.ok(onto.point, "point snap");
assert.ok(Math.abs(onto.d[0] - (Math.cos(Math.PI / 6) - 3)) < 1e-9 && Math.abs(onto.d[1] - (Math.sin(Math.PI / 6) - 0.04)) < 1e-9, "lands exactly on the atom");
// Far from everything: no change.
const free = snapMove(m, ids, [0, 5], 0.1);
assert.deepEqual(free.d, [0, 5]);
assert.equal(free.guides.length, 0);
// A structure inside a box (no other structures): its middle snaps to the box's middle on both axes.
const inBox = snapMove(a, new Set([0, 1]), [0.05, -0.03], 0.1, { moving: [0, 0, 0.866, 0.5], targets: [[-2, -2.25, 2.866, 2.75]] });
assert.ok(Math.abs(inBox.d[0]) < 1e-9 && Math.abs(inBox.d[1]) < 1e-9 && inBox.guides.length === 2, `centred in its box: ${inBox.d}`);
// A box moved round a structure centres on it the same way.
const round = snapBoxes([-2, -2, 3, 3], [[0, 0, 1, 1]], [0.04, 0.03], 0.1);
assert.ok(round.d.every((v) => Math.abs(v) < 1e-9), `centred round it: ${round.d}`);
console.log("snap.check: ok");
