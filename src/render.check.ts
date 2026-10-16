// Run: node src/render.check.ts. Fails loudly if the ACS drawing rules break.
import assert from "node:assert/strict";
import { arrowShapes, fitArrows, placeCaptions, render, type Ink, type Mol } from "./render.ts";

type P = [number, number];
const pt = 4 / 3;
const S = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
// Every glyph is a 9.6 x 9.5 px box (roughly an Arial capital at 10 pt); its outline is the box edge.
const box: P[] = [];
for (let i = 0; i <= 40; i++) { const f = i / 40; box.push([9.6 * f, 0], [9.6 * f, -9.5], [0, -9.5 * f], [9.6, -9.5 * f]); }
const ink = (): Ink => ({ width: 9.6, ascent: 9.5, outline: box });
const has = (poly: P[], q: P) => poly.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6);
const centroid = (poly: P[]) => poly.reduce<P>((c, p) => [c[0] + p[0] / poly.length, c[1] + p[1] / poly.length], [0, 0]);

// Pyridine: N at atom 0, double bonds 0=1, 2=3, 4=5, hexagon of unit bonds.
const hex = [...Array(6)].map((_, i) => [Math.cos((Math.PI / 3) * i + Math.PI / 6), Math.sin((Math.PI / 3) * i + Math.PI / 6), 0] as [number, number, number]);
const pyridine: Mol = {
  atoms: hex.map((location, i) => ({ label: i ? "C" : "N", location })),
  bonds: [0, 1, 2, 3, 4, 5].map((i) => ({ type: i % 2 ? 1 : 2, atoms: [i, (i + 1) % 6] as [number, number] })),
};
const d = render(pyridine, S, ink);
const L = S.bond, at = (i: number): P => [hex[i][0] * L, -hex[i][1] * L];
// Six axis polygons and three inner lines, each inner line inside the ring and shorter than a bond.
assert.equal(d.polygons.length, 9);
const inner = d.polygons.filter((poly) => Math.hypot(...centroid(poly)) < L * Math.cos(Math.PI / 6) - 1);
assert.equal(inner.length, 3, "three inner lines sit inside the ring");
for (const poly of inner) assert.ok(Math.hypot(poly[2][0] - poly[1][0], poly[2][1] - poly[1][1]) < L * 0.85, "inner line is trimmed");
// Carbons meet in a mitred fan through the atom centre: atom 3 is shared by both of its bond polygons.
assert.equal(d.polygons.filter((poly) => has(poly, at(3))).length, 2, "both bonds at C3 pass through its centre");
// Nothing is drawn within the margin of N's glyph box.
const [nx, ny] = at(0), [bx, by] = [nx - 4.8, ny + 4.75];
for (const [x, y] of d.polygons.flat()) {
  const dx = Math.max(bx - x, 0, x - (bx + 9.6)), dy = Math.max(by - 9.5 - y, 0, y - by);
  assert.ok(Math.hypot(dx, dy) > S.margin - 0.01, "bonds stop outside the label margin");
}
assert.equal(d.labels.length, 1);
console.log("render.check: pyridine ok");

// Isobutane centre: three bonds share the atom-centre vertex.
const iso = render({
  atoms: [{ label: "C", location: [0, 0, 0] }, ...[90, 210, 330].map((a) => ({ label: "C", location: [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), 0] as [number, number, number] }))],
  bonds: [1, 2, 3].map((j) => ({ type: 1, atoms: [0, j] as [number, number] })),
}, S, ink);
assert.equal(iso.polygons.filter((poly) => has(poly, [0, 0])).length, 3, "fan shares the centre");
console.log("render.check: fan ok");

// Acetone: the centred C=O lines run 0.748 pt past the carbonyl carbon (h · cot 120°).
const acetone = render({
  atoms: [{ label: "C", location: [0, 0, 0] }, { label: "O", location: [0, 1, 0] }, { label: "C", location: [-0.866, -0.5, 0] }, { label: "C", location: [0.866, -0.5, 0] }],
  bonds: [{ type: 2, atoms: [0, 1] }, { type: 1, atoms: [0, 2] }, { type: 1, atoms: [0, 3] }],
}, S, ink);
const co = acetone.polygons.filter((poly) => poly.length === 4 && Math.abs(poly[0][1] - poly[3][1]) > 5);
assert.equal(co.length, 2, "two C=O lines");
for (const poly of co) assert.ok(Math.abs(poly[0][1] - 0.748 * pt) < 0.01, "C=O line starts 0.748 pt past the carbon");
console.log("render.check: carbonyl ok");

// Methylamine drawn left to right: NH2 reads N, H, then a smaller subscript 2, all to the right of the atom.
const amine = render({ atoms: [{ label: "C", location: [0, 0, 0] }, { label: "N", location: [1, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] }, S, ink);
assert.deepEqual(amine.labels.map((l) => l.text), ["N", "H", "2"]);
assert.ok(amine.labels[1].x > amine.labels[0].x && amine.labels[2].x > amine.labels[1].x, "H2 follows N");
assert.ok(amine.labels[2].size < amine.labels[1].size && amine.labels[2].y > amine.labels[1].y, "2 is a subscript");
console.log("render.check: amine ok");

// Nitro group: N+ and O– get their charge signs; neither gets an H.
const nitro = render({
  atoms: [{ label: "C", location: [0, 0, 0] }, { label: "N", location: [1, 0, 0], charge: 1 }, { label: "O", location: [1.5, 0.87, 0] }, { label: "O", location: [1.5, -0.87, 0], charge: -1 }],
  bonds: [{ type: 1, atoms: [0, 1] }, { type: 2, atoms: [1, 2] }, { type: 1, atoms: [1, 3] }],
}, S, ink);
assert.deepEqual(nitro.labels.map((l) => l.text).sort(), ["+", "N", "O", "O", "–"].sort());
console.log("render.check: charges ok");

// Carbocation: no C label, just the + beside the vertex, and the carbon still joins its bonds in a fan.
const cation = render({
  atoms: [{ label: "C", location: [0, 0, 0], charge: 1 }, ...[90, 210, 330].map((a) => ({ label: "C", location: [Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180), 0] as [number, number, number] }))],
  bonds: [1, 2, 3].map((j) => ({ type: 1, atoms: [0, j] as [number, number] })),
}, S, ink);
assert.deepEqual(cation.labels.map((l) => l.text), ["+"]);
assert.equal(cation.polygons.filter((poly) => has(poly, [0, 0])).length, 3, "charged carbon keeps its fan");
console.log("render.check: carbocation ok");

// Written labels read away from their bond: OMe on a bond from the left reads OMe; from the right, MeO.
const methoxy = (fromRight: boolean) => render({
  atoms: [{ label: "C", location: [fromRight ? 1 : 0, 0, 0] }, { label: "O", text: "OMe", location: [fromRight ? 0 : 1, 0, 0] }],
  bonds: [{ type: 1, atoms: [0, 1] }],
}, S, ink);
assert.deepEqual(methoxy(false).labels.map((l) => l.text), ["O", "Me"]);
assert.deepEqual(methoxy(true).labels.map((l) => l.text), ["Me", "O"]);
// CO2Et from the right reads EtO2C, with the 2 as a subscript.
const ester = render({
  atoms: [{ label: "C", location: [1, 0, 0] }, { label: "C", text: "CO2Et", location: [0, 0, 0] }],
  bonds: [{ type: 1, atoms: [0, 1] }],
}, S, ink);
assert.deepEqual(ester.labels.map((l) => l.text), ["Et", "O", "2", "C"]);
assert.ok(ester.labels[2].size < ester.labels[1].size, "2 is a subscript");
console.log("render.check: written labels ok");

// Captions: centred on the structure's ink box, baseline 15 pt below it; a second caption stacks one line down.
{
  const one = (w: number) => () => w;
  const withCaptions: Mol = { ...pyridine, captions: [{ id: 2, text: "pyridine", x: 0, y: 0, under: [0, 1, 2, 3, 4, 5] }, { id: 1, text: "1", x: 0, y: 0, bold: true, under: [0, 1, 2, 3, 4, 5] }] };
  const dc = render(withCaptions, S, ink);
  const [placedNumber, placedName] = placeCaptions(withCaptions, dc, one(30));
  const xs = dc.ink.flatMap((b) => [b[0], b[2]]), ys = dc.ink.flatMap((b) => [b[1], b[3]]);
  const centre = (Math.min(...xs) + Math.max(...xs)) / 2, bottom = Math.max(...ys);
  assert.equal(placedNumber.id, 1, "captions stack in id order");
  assert.ok(Math.abs(placedNumber.lines[0].x - centre) < 1e-9 && placedNumber.anchor === "middle", "centred on the ink box");
  assert.ok(Math.abs(placedNumber.lines[0].y - bottom - 15 * pt) < 1e-9, "baseline 15 pt below the ink box");
  assert.ok(Math.abs(placedName.lines[0].y - placedNumber.lines[0].y - 1.2 * 10 * pt) < 1e-9, "the next caption is one line down");
  // A free caption stays where it was put, in drawing units.
  const [free] = placeCaptions({ ...pyridine, captions: [{ id: 1, text: "a\nb", x: 2, y: -1, align: "left" }] }, dc, one(10));
  assert.deepEqual([free.lines[0].x, free.lines[0].y, free.lines.length, free.anchor], [2 * dc.scale, dc.scale, 2, "start"]);
  console.log("render.check: captions ok");
}

// Arrows: a reaction arrow is a shaft and a head; conditions wider than the arrow lengthen it about its middle.
{
  const a = { id: 1, kind: "reaction" as const, from: [0, 0] as [number, number], to: [2, 0] as [number, number] };
  assert.equal(arrowShapes(a, S, S.bond).length, 2, "shaft and head");
  assert.equal(arrowShapes({ ...a, kind: "equilibrium" }, S, S.bond).length, 4, "two shafts, two half heads");
  const [fitted] = fitArrows({ atoms: [], bonds: [], arrows: [a], captions: [{ id: 2, text: "x", x: 0, y: 0, on: { arrow: 1, side: "above" } }] }, S.bond, () => 200);
  assert.ok(fitted.from[0] < 0 && fitted.to[0] > 2 && Math.abs(fitted.from[0] + fitted.to[0] - 2) < 1e-9, "lengthened about its middle");
  console.log("render.check: arrows ok");
}
