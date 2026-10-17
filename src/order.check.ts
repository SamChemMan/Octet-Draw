// Run: node src/order.check.ts. Fails loudly if Bring to Front or Send to Back breaks.
import assert from "node:assert/strict";
import { toCdxml } from "./cdxml.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { EMPTY, merge, sprout } from "./edit.ts";
import { reorder } from "./order.ts";
import type { Mol } from "./render.ts";

// Two ethanes, a box, an arrow and a caption.
const two = merge(sprout(EMPTY, [0, 0]), sprout(EMPTY, [0, 0]), [3, 0]);
const m: Mol = { ...two, shapes: [{ id: 1, kind: "box", from: [0, 0], to: [1, 1] }], arrows: [{ id: 2, kind: "reaction", from: [0, 0], to: [1, 0] }], captions: [{ id: 3, text: "A", x: 0, y: 0 }] };

// Nothing selected: nothing moves.
assert.equal(reorder(m, [], new Set(), true), m);

// The box to the front: over everything, so its order is above zero.
const a = reorder(m, [], new Set([1]), true);
assert.equal(a.shapes![0].order, 1);
// Then the first structure to the front: over the box. Every atom of it takes the order.
const b = reorder(a, [[0, 1]], new Set(), true);
assert.deepEqual(b.atoms.map((x) => x.order), [2, 2, undefined, undefined]);
// The arrow and the caption to the back together: under everything, the arrow (drawn first) lowest.
const c = reorder(b, [], new Set([2, 3]), false);
assert.equal(c.arrows![0].order, -2);
assert.equal(c.captions![0].order, -1);
// Again to the front: they keep their order among themselves, over the structure.
const d = reorder(c, [], new Set([2, 3]), true);
assert.deepEqual([d.arrows![0].order, d.captions![0].order], [3, 4]);
// Nothing else changes.
assert.equal(d.bonds, m.bonds);
assert.deepEqual(d.atoms.map((x) => x.location), m.atoms.map((x) => x.location));

// CDXML: the box sent to the back is under every other object (lowest Z); the structure brought to the front is over
// every other object (its fragment and every node and bond in it have the highest Zs).
{
  const e = reorder(reorder(m, [], new Set([1]), false), [[0, 1]], new Set(), true);
  const xml = toCdxml(e, DEFAULT_STYLE, { name: "order.cdxml" });
  const zs = (tag: string) => [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*?\\bZ="(\\d+)"`, "g"))].map((x) => Number(x[1]));
  const all = zs("[a-z]+"), box = zs("graphic").filter((_, k) => k === 0)[0], frags = zs("fragment");
  assert.equal(Math.min(...all), box, "the box is lowest");
  assert.ok(Math.max(...frags) > Math.max(...zs("t"), ...zs("arrow")), "the structure is over the arrow and the text");
  assert.ok(all.every((z) => z > 0 && z <= 32767), "every Z is a 16-bit Z");
}
console.log("order: ok");
