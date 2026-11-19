// Run: node src/conditions.check.ts. Text dragged onto a reaction arrow (conditions.ts): which arrow and side it takes,
// the gap between an arrow and its conditions as Octet lays them out, and the gap kept in .oct and CDXML files.
import assert from "node:assert/strict";
import { besideArrow, readGap, sideReach, slotFor, takesConditions } from "./conditions.ts";
import { parse, serialize } from "./file.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { DEFAULT_STYLE, readStyle } from "./docstyle.ts";
import { placeCaptions, type Arrow, type Box, type Mol } from "./render.ts";

const k = 20; // px per bond length
const level: Arrow = { id: 1, kind: "reaction", from: [0, 0], to: [4, 0] }; // px: x 0 to 80, y 0
const steep: Arrow = { id: 2, kind: "reaction", from: [10, 2], to: [10, -2] }; // px: x 200, y -40 to 40
const none = () => 0;

// Which arrows take conditions: straight ones with a length, not bent at a point.
assert.ok(takesConditions(level) && takesConditions(steep));
for (const a of [{ ...level, kind: "curved" as const }, { ...level, kind: "line" as const }, { ...level, point: true, bend: 0.2 }, { ...level, to: [0, 0] as [number, number] }]) assert.ok(!takesConditions(a));

// Over the middle of a level arrow: above or below by the side its middle is on; past an end, nothing.
const box = (cx: number, cy: number, w = 30, h = 12): Box => [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
assert.deepEqual(slotFor([level], box(40, -10), k, none), { arrow: 1, side: "above" });
assert.deepEqual(slotFor([level], box(40, 12), k, none), { arrow: 1, side: "below" });
assert.deepEqual(slotFor([level], box(78, -10), k, none), { arrow: 1, side: "above" }, "its middle over the arrow's end is still beside it");
assert.equal(slotFor([level], box(90, -10), k, none), undefined, "past the arrow's end");
// No further out than a bond length past what the side holds.
assert.equal(besideArrow(level, box(40, -30), k)!.gap, 24);
assert.equal(slotFor([level], box(40, -30), k, none), undefined, "24 px out is more than a bond length (20 px)");
assert.deepEqual(slotFor([level], box(40, -30), k, () => 10), { arrow: 1, side: "above" }, "past text already there, it still reaches");
// A steep arrow: left of it is above, right of it below.
assert.deepEqual(slotFor([steep], box(175, 0), k, none), { arrow: 2, side: "above" });
assert.deepEqual(slotFor([steep], box(225, 0), k, none), { arrow: 2, side: "below" });
// Of two arrows, the nearer.
const other: Arrow = { id: 3, kind: "reaction", from: [0, -1.5], to: [4, -1.5] }; // y 30 px
assert.deepEqual(slotFor([level, other], box(40, 20), k, none), { arrow: 3, side: "above" });
// The reach of a side: the far edge of its text, else its gap.
assert.equal(sideReach(level, "above", [], k, 3, 4 / 3), 4);
assert.equal(sideReach(level, "above", [[30, -25, 50, -5]], k, 3, 4 / 3), 25);

// Gaps: 0 to 100 pt, to 0.01 pt; anything else is none.
assert.deepEqual([readGap(12.345), readGap(0), readGap(100), readGap(-1), readGap(101), readGap("5"), readGap(NaN)], [12.35, 0, 100, undefined, undefined, undefined, undefined]);

// Layout: a gap of its own, else the document's, else 3 pt. pt = 1 here, so a pt is a px. Text 10 pt, its baseline
// DESCENT (0.212 em) above its bottom.
const mol = (gap?: number): Mol => ({ atoms: [], bonds: [], arrows: [level], captions: [{ id: 5, text: "heat", x: 0, y: 0, on: { arrow: 1, side: "below", ...(gap !== undefined ? { gap } : {}) } }] });
const top = (m: Mol, arrowGap?: number) => placeCaptions(m, { ink: [], scale: k }, () => 20, m.arrows, 1, 10, undefined, undefined, undefined, arrowGap)[0].box[1];
assert.ok(Math.abs(top(mol()) - 3) < 1e-9, "3 pt below the arrow");
assert.ok(Math.abs(top(mol(), 8) - 8) < 1e-9, "the document's gap");
assert.ok(Math.abs(top(mol(12), 8) - 12) < 1e-9, "its own gap");
// Two on a side: the second starts past the first, whichever has the larger gap.
const two: Mol = { ...mol(10), captions: [...mol(10).captions!, { id: 6, text: "2 h", x: 0, y: 0, on: { arrow: 1, side: "below" } }] };
const [a, b] = placeCaptions(two, { ink: [], scale: k }, () => 20, two.arrows, 1, 10);
assert.ok(Math.abs(a.box[1] - 10) < 1e-9 && b.box[1] > a.box[3], "the second stacks past the first");

// .oct keeps a caption's gap, and the document's.
const saved = parse(serialize({ ...mol(7.5), style: { ...DEFAULT_STYLE, arrowGap: 6 } }));
assert.deepEqual([saved.captions![0].on, saved.style!.arrowGap], [{ arrow: saved.arrows![0].id, side: "below", gap: 7.5 }, 6]);
const bad = JSON.parse(serialize(mol(7.5)));
bad.captions[0].on.gap = 1e9;
assert.deepEqual(parse(JSON.stringify(bad)).captions![0].on, { arrow: parse(JSON.stringify(bad)).arrows![0].id, side: "below" }, "a gap out of range is left out, the text kept");
assert.equal(readStyle({ arrowGap: 3 }).arrowGap, undefined, "3 pt is the default, kept as none");
assert.equal(readStyle({ arrowGap: -2 }).arrowGap, undefined);

// CDXML: the text is the arrow's conditions in the step, as ChemDraw reads them, written its gap clear of the arrow;
// Octet reads its gap back, and lays it out again.
{
  const style = { ...DEFAULT_STYLE, arrowGap: 5 }, m = mol(12), xml = toCdxml(m, style);
  const step = /<step[^>]*ReactionStepObjectsBelowArrow="(\d+)"/.exec(xml), t = /<t\s+id="(\d+)"\s+p="([\d.]+) ([\d.]+)"/.exec(xml);
  assert.ok(step && t && step[1] === t[1], "the text is the step's conditions below the arrow");
  const arrowY = Number(/<arrow[^>]*Head3D="[\d.]+ ([\d.]+)/.exec(xml)![1]);
  // Its baseline: the gap and the text's ascent (0.905 em) below the arrow.
  assert.ok(Math.abs(Number(t![3]) - arrowY - (12 + 0.905 * 10)) < 0.01, "written 12 pt clear of the arrow");
  const back = fromCdxml(xml);
  assert.deepEqual([back.mol.captions![0].on, back.mol.captions![0].placed, back.style.arrowGap], [{ arrow: back.mol.arrows![0].id, side: "below", gap: 12 }, undefined, 5]);
  // A ChemDraw file has no gap: its conditions keep the place ChemDraw gave them.
  const chemdraw = fromCdxml(xml.replace(/\s+Octet="[^"]*"/g, ""));
  assert.ok(chemdraw.mol.captions![0].on && chemdraw.mol.captions![0].on.gap === undefined && chemdraw.mol.captions![0].placed);
}

// Speed: finding the slot over 200 arrows, as a pointer move does for each moving text, takes well under a frame.
{
  const many = Array.from({ length: 200 }, (_, i): Arrow => ({ id: i + 10, kind: "reaction", from: [i * 6, 0], to: [i * 6 + 4, 0] }));
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) slotFor(many, box(600 + (i % 50), -10), k, none);
  const each = (performance.now() - t0) / 1000;
  assert.ok(each < 0.5, `slotFor over 200 arrows: ${each.toFixed(3)} ms`);
}
console.log("conditions: all checks pass");
