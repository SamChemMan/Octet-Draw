// Run: node src/reaction.check.ts. A messy two-step scheme (A + B → C → D) is found from either arrow, and
// Clean up reaction levels it with even gaps.
import assert from "node:assert/strict";
import { addArrow, addCaption, addRing, EMPTY, fragments, pos } from "./edit.ts";
import { cleanUpReaction, findReaction, GAP, reactionClean } from "./reaction.ts";
import type { Box, Mol } from "./render.ts";

let m: Mol = EMPTY;
m = addRing(m, 6, true, { point: [0, 0.3] });
m = addRing(m, 6, false, { point: [3.4, -0.2] });
m = addRing(m, 5, false, { point: [9.6, 0.4] });
m = addRing(m, 6, true, { point: [16, -0.5] });
const [m1, plus] = addCaption(m, { text: "+", x: 1.7, y: 0, align: "centre" });
const [m2, first] = addArrow(m1, { kind: "reaction", from: [5.2, 0.1], to: [7.9, 0.1] });
const [m3, second] = addArrow(m2, { kind: "reaction", from: [11.2, 0], to: [14.3, -0.1] });
const [mol] = addCaption(m3, { text: "far away", x: 30, y: 10 });
// Structures' boxes from their atoms; the plus sign a small box at its point.
const ink = (atoms: number[]): Box => { const ps = atoms.map((i) => pos(mol, i)); return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))]; };
const capBox = (id: number): Box | undefined => { const c = mol.captions?.find((x) => x.id === id); return c && [c.x - 0.15, c.y - 0.15, c.x + 0.15, c.y + 0.15]; };

for (const id of [first, second]) {
  const r = findReaction(mol, id, mol.arrows!, ink, capBox)!;
  assert.deepEqual(r.steps.map((s) => s.kind), ["structure", "plus", "structure", "arrow", "structure", "arrow", "structure"], "the whole scheme, in order");
  assert.deepEqual(r.arrows, [first, second]);
  assert.ok(r.captions.includes(plus) && !r.captions.some((c) => mol.captions?.find((x) => x.id === c)?.text === "far away"));
  assert.equal(reactionClean(r, mol.arrows!), false);
}
const r = findReaction(mol, first, mol.arrows!, ink, capBox)!;
const clean = cleanUpReaction(mol, r, mol.arrows!);
const ink2 = (atoms: number[]): Box => { const ps = atoms.map((i) => pos(clean, i)); return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))]; };
const cap2 = (id: number): Box | undefined => { const c = clean.captions?.find((x) => x.id === id); return c && [c.x - 0.15, c.y - 0.15, c.x + 0.15, c.y + 0.15]; };
const again = findReaction(clean, first, clean.arrows!, ink2, cap2)!;
assert.equal(again.steps.length, 7, "still one reaction after clean up");
assert.ok(reactionClean(again, clean.arrows!), "level, with even gaps");
for (const s of again.steps.slice(1).map((x, k) => x.box[0] - again.steps[k].box[2])) assert.ok(Math.abs(s - GAP) < 1e-6);
assert.equal(fragments(clean).length, 4);
// Reagents written as text (H2O) stand in the row: Clean up keeps them before the arrow and the product after it.
{
  let t: Mol = EMPTY;
  t = addRing(t, 6, false, { point: [0, 0] });
  const [t1] = addCaption(t, { text: "+", x: 2.2, y: 0, align: "centre" });
  const [t2, water] = addCaption(t1, { text: "H2O", x: 3.6, y: 0.2, align: "centre" });
  const [t3, arrow] = addArrow(t2, { kind: "reaction", from: [5, 0], to: [8, 0] });
  const tm = addRing(t3, 5, false, { point: [10, 0.3] });
  const box = (mm: Mol) => (atoms: number[]): Box => { const ps = atoms.map((i) => pos(mm, i)); return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))]; };
  const cap = (mm: Mol) => (id: number): Box | undefined => { const c = mm.captions?.find((x) => x.id === id); return c && [c.x - 0.5, c.y - 0.2, c.x + 0.5, c.y + 0.2]; };
  const rr = findReaction(tm, arrow, tm.arrows!, box(tm), cap(tm))!;
  assert.deepEqual(rr.steps.map((s) => s.kind), ["structure", "plus", "text", "arrow", "structure"]);
  const done = cleanUpReaction(tm, rr, tm.arrows!), a = done.arrows!.find((x) => x.id === arrow)!, w = done.captions!.find((c) => c.id === water)!;
  assert.ok(w.x + 0.5 < Math.min(a.from[0], a.to[0]) && Math.max(...fragments(done).map((g) => Math.min(...g.map((i) => pos(done, i)[0])))) > Math.max(a.from[0], a.to[0]), "H2O before the arrow, the product after it");
}
console.log("reaction.check: ok");
