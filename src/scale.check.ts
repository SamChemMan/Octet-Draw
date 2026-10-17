// Run: node src/scale.check.ts. Fails loudly if a document scale or an object's scale stops keeping sizes in
// proportion (decision 0007).
import assert from "node:assert/strict";
import { DEFAULT_STYLE, PRESETS, TEXT_SIZES, presetAt, presetOf, readStyle, sizeAt, withScale } from "./docstyle.ts";
import { scaleSettings, scaleSizes } from "./edit.ts";
import type { Mol } from "./render.ts";

// The document scale multiplies every length and text size, keeps bond spacing, and keeps the preset's name.
{
  const big = withScale(DEFAULT_STYLE, 2.5);
  assert.deepEqual([big.bond, big.line, big.bold, big.margin, big.hash, big.labelSize, big.captionSize, big.spacing, big.scale], [36, 1.5, 5, 4, 6.25, 25, 25, 18, 2.5]);
  assert.equal(big.preset, "ACS Document 1996", "the preset's name at 250%");
  assert.deepEqual(withScale(big, 1), { ...DEFAULT_STYLE }, "back to 100% exactly");
  assert.equal(presetOf({ ...big, line: 1.6 }), "Custom", "one value changed by hand");
  assert.deepEqual(presetAt("RSC", 2), { ...PRESETS.RSC, bond: 24.4, line: 0.9, bold: 3.2, margin: 2.5, hash: 3.5, labelSize: 14, captionSize: 14 });
  // Every preset reaches 10% and 1000% in proportion: nothing read back falls to the default.
  for (const name of Object.keys(PRESETS)) for (const f of [0.1, 0.37, 5, 10]) {
    const s = withScale({ ...DEFAULT_STYLE, ...PRESETS[name], preset: name }, f), again = readStyle(JSON.parse(JSON.stringify(s)));
    assert.deepEqual(again, s, `${name} at ${f * 100}% reads back`);
    assert.equal(again.preset, name, `${name} at ${f * 100}% keeps its name`);
  }
  assert.equal(readStyle({ ...DEFAULT_STYLE, scale: 50 }).scale, 1, "a scale past 1000% is not read");
  console.log("scale.check: document scale ok");
}

// The size lists are ChemDraw's sizes times the document scale, to the nearest half point.
assert.deepEqual(TEXT_SIZES.map((pt) => sizeAt(pt, 1)), [5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 24]);
assert.deepEqual(TEXT_SIZES.map((pt) => sizeAt(pt, 2.5)), [12.5, 15, 17.5, 20, 22.5, 25, 30, 35, 40, 45, 60]);
console.log("scale.check: text sizes ok");

// A new document scale multiplies the sizes the drawing holds in points; Scale… with Labels and lines multiplies the
// chosen objects' scales and the sizes of their text.
{
  const m: Mol = {
    atoms: [{ label: "O", location: [0, 0, 0], size: 14 }, { label: "C", location: [1, 0, 0] }, { label: "N", location: [5, 0, 0], scale: 2 }],
    bonds: [{ type: 1, atoms: [0, 1] }],
    captions: [{ id: 1, text: "1", x: 0, y: 0, under: [0, 1] }, { id: 2, text: "ab", x: 0, y: 3, size: 12, runs: [{ text: "a", size: 8 }, { text: "b" }] }, { id: 3, text: "x", x: 3, y: 0, on: { arrow: 4, side: "above" } }],
    arrows: [{ id: 4, kind: "reaction", from: [2, 0], to: [4, 0] }],
    shapes: [{ id: 5, kind: "table", from: [0, 5], to: [3, 4], table: { cells: [["a"]], weight: 0.5 } }],
    cycles: [{ id: 6, centre: [0, 0], radius: 2, clockwise: true, nodes: [[0], [2]] }],
  };
  const r = scaleSizes(m, 2);
  assert.deepEqual([r.atoms[0].size, r.atoms[1].size, r.captions![0].size, r.captions![1].size, r.captions![1].runs, r.shapes![0].table!.weight], [28, undefined, undefined, 24, [{ text: "a", size: 16 }, { text: "b" }], 1]);
  assert.equal(scaleSizes(m, 1), m, "no change at the same scale");
  const s = scaleSettings(m, new Set([0, 1]), new Set([4, 6]), 2, 10);
  assert.deepEqual(s.atoms.map((a) => a.scale), [2, 2, 2], "the chosen atoms' scales (the third keeps its own)");
  assert.deepEqual([s.arrows![0].scale, s.shapes![0].scale, s.cycles![0].scale], [2, undefined, 2]);
  assert.deepEqual(s.captions!.map((c) => c.size), [20, 12, 20], "text under the atoms and on the arrow takes its size; other text keeps its own");
  const back = scaleSettings(s, new Set([0, 1]), new Set([4, 6]), 0.5, 10);
  assert.deepEqual([back.atoms[0].scale, back.atoms[1].scale, back.arrows![0].scale, "scale" in back.atoms[0]], [undefined, undefined, undefined, false], "back to 1: the scale is left unset");
  console.log("scale.check: sizes and object scales ok");
}
