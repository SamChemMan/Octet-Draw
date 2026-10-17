// Run: node src/render.check.ts. Fails loudly if the ACS drawing rules break.
import assert from "node:assert/strict";
import { arrowShapes, fitArrows, lineOffsets, placeCaptions, render, renderParts, type Caption, type Box, type Drawing, type Ink, type Mol, type PartCache } from "./render.ts";

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

// Document label options: terminal carbons labelled (CH3), every carbon labelled, and implicit H hidden.
{
  const propane: Mol = { atoms: [{ label: "C", location: [0, 0, 0] }, { label: "C", location: [0.866, 0.5, 0] }, { label: "C", location: [1.732, 0, 0] }, { label: "O", location: [2.598, 0.5, 0] }],
    bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }, { type: 1, atoms: [2, 3] }] };
  const text = (s: typeof S & { terminal?: boolean; carbons?: boolean; hideH?: boolean }) => render(propane, s, ink).labels.map((l) => l.text).join("");
  assert.equal(text(S), "OH");
  assert.equal(text({ ...S, terminal: true }), "CH3OH");
  assert.equal(text({ ...S, terminal: true, carbons: true }), "CH3CH2CH2OH");
  assert.equal(text({ ...S, terminal: true, hideH: true }), "CO");
  console.log("render.check: label options ok");
}

// Drawing structure by structure gives the same drawing as drawing them all at once, and a structure whose atoms and
// bonds are the same objects is not drawn again. Two structures in perspective crossing each other are drawn as one.
// While a drag moves a structure, its drawing moves as it is; when the drag stops, it is drawn again where it is.
{
  const shift = (m: Mol, dx: number): Mol => ({ atoms: m.atoms.map((a) => ({ ...a, location: [a.location[0] + dx, a.location[1], a.location[2]] as [number, number, number] })), bonds: m.bonds });
  const join = (...ms: Mol[]): Mol => ms.reduce((all, m) => ({ atoms: [...all.atoms, ...m.atoms], bonds: [...all.bonds, ...m.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + all.atoms.length, b.atoms[1] + all.atoms.length] as [number, number] }))] }), { atoms: [], bonds: [] } as Mol);
  const lone: Mol = { atoms: [{ label: "O", text: "H2O2", location: [9, 3, 0] }], bonds: [] };
  const crossing: Mol = { atoms: [{ label: "C", location: [0, -5, 0] }, { label: "C", location: [2, -5, 1] }, { label: "C", location: [1, -4, 0] }, { label: "C", location: [1, -6, 1] }], bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [2, 3] }] };
  const nitroMol: Mol = {
    atoms: [{ label: "C", location: [6, 0, 0] }, { label: "N", location: [7, 0, 0], charge: 1 }, { label: "O", location: [7.5, 0.87, 0] }, { label: "O", location: [7.5, -0.87, 0], charge: -1, pairs: 3 }],
    bonds: [{ type: 1, atoms: [0, 1] }, { type: 2, atoms: [1, 2] }, { type: 1, atoms: [1, 3] }],
  };
  const m = join(pyridine, shift(pyridine, 4), lone, crossing, nitroMol);
  const whole = render(m, S, ink, S.bond), cache: PartCache = { parts: new WeakMap(), last: new Map() }, parts = renderParts(m, S, ink, S.bond, cache);
  const sorted = <T,>(xs: T[]) => xs.map((x) => JSON.stringify(x)).sort();
  const polys = (d: Drawing) => d.polygons.map((p, i) => [p, d.colours[i], d.alphas[i]]);
  assert.deepEqual(parts.ink, whole.ink, "each atom's ink box");
  assert.deepEqual(parts.label, whole.label, "each atom's label box");
  assert.deepEqual(parts.box, whole.box, "the drawing's box");
  assert.deepEqual(sorted(parts.parts.flatMap((p) => polys(p.drawing))), sorted(polys(whole)), "the same polygons");
  assert.deepEqual(sorted(parts.parts.flatMap((p) => p.drawing.labels)), sorted(whole.labels), "the same labels");
  assert.deepEqual(parts.parts.map((p) => p.ids.length), [6, 6, 1, 4, 4], "two pyridines, H2O2, the two bonds in perspective as one, nitro");
  // Move the second pyridine: only it is drawn again.
  const move = (dx: number, dy: number): Mol => ({ ...m, atoms: m.atoms.map((a, i) => (i >= 6 && i < 12 ? { ...a, location: [a.location[0] + dx, a.location[1] + dy, a.location[2]] as [number, number, number] } : a)) });
  const moved = move(1, 0.5), again = renderParts(moved, S, ink, S.bond, cache);
  assert.equal(again.parts[0].drawing, parts.parts[0].drawing, "the first pyridine is not drawn again");
  assert.notEqual(again.parts[1].drawing, parts.parts[1].drawing, "the moved pyridine is drawn again");
  const near = (a: Box[], b: Box[]) => a.every((x, i) => x.every((v, j) => Math.abs(v - b[i][j]) < 1e-9));
  assert.ok(near(again.ink, render(moved, S, ink, S.bond).ink), "ink boxes where the atoms are");
  // The same move during a drag: the pyridine's drawing moves as it is, and is drawn again once it is still.
  const drag: PartCache = { parts: new WeakMap(), last: new Map() };
  const before = renderParts(m, S, ink, S.bond, drag, false), during = renderParts(moved, S, ink, S.bond, drag, false);
  assert.equal(during.parts[1].drawing, before.parts[1].drawing, "moved, not drawn again");
  assert.ok(Math.abs(during.parts[1].at[0] - S.bond) < 1e-9 && Math.abs(during.parts[1].at[1] + 0.5 * S.bond) < 1e-9, "moved by the drag (y down)");
  assert.ok(near(during.ink, again.ink) && near([during.box], [again.box]), "ink boxes and box where the atoms are");
  const dropped = renderParts(moved, S, ink, S.bond, drag, true);
  assert.notEqual(dropped.parts[1].drawing, before.parts[1].drawing, "drawn again when still");
  assert.deepEqual(dropped.parts[1].at, [0, 0]);
  // When still, the moved drawing's own points are where a new drawing puts them.
  const fresh = again.parts[1].drawing, got = dropped.parts[1].drawing, close = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  assert.ok(got.polygons.length === fresh.polygons.length && got.polygons.every((p, i) => p.every((q, j) => close(q[0], fresh.polygons[i][j][0]) && close(q[1], fresh.polygons[i][j][1]))), "polygons where a new drawing puts them");
  assert.ok(got.labels.every((l, i) => l.text === fresh.labels[i].text && close(l.x, fresh.labels[i].x) && close(l.y, fresh.labels[i].y)), "labels where a new drawing puts them");
  assert.ok(near(got.ink, fresh.ink) && near([got.box], [fresh.box]) && near(dropped.ink, again.ink), "ink boxes where a new drawing puts them");
  assert.equal(dropped.parts[0].drawing, before.parts[0].drawing, "the rest is not drawn again");
  console.log("render.check: structure by structure ok");
}

// Label cuts: a bond stops where every point of the label's outline is a margin clear of it (the largest a + √(m² − d²)
// over the points, a along the bond and d across it), whichever way the bond comes in, however the outline's points
// are grouped to pass over the far ones.
{
  // An O-like outline: two rings of points, 900 in all, off-centre so no two ways in are alike.
  const ring = (r: number, n: number, cx: number): P[] => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n), -4.75 + 1.2 * r * Math.sin((2 * Math.PI * k) / n)]);
  const oInk = (): Ink => ({ width: 9.6, ascent: 9.5, outline: [...ring(4.6, 500, 5.3), ...ring(2.9, 400, 5.3)] });
  for (let deg = 0; deg < 360; deg += 7.5) {
    const t = (deg * Math.PI) / 180, from: [number, number, number] = [Math.cos(t), Math.sin(t), 0];
    const d = render({ atoms: [{ label: "C", location: from }, { label: "O", location: [0, 0, 0], implicitHCount: 0 }], bonds: [{ type: 1, atoms: [0, 1] }] }, S, oInk, S.bond);
    const X: P = [0, 0], u: P = [Math.cos(t), -Math.sin(t)], n: P = [-u[1], u[0]], m = S.margin + S.line / 2, first = oInk();
    const x0 = -first.width / 2, y0 = first.ascent / 2;
    let cut = 0;
    for (const [px, py] of first.outline) {
      const q: P = [x0 + px, y0 + py], a = (q[0] - X[0]) * u[0] + (q[1] - X[1]) * u[1], c = (q[0] - X[0]) * n[0] + (q[1] - X[1]) * n[1];
      if (Math.abs(c) < m) cut = Math.max(cut, a + Math.sqrt(m * m - c * c));
    }
    const reach = Math.min(...d.polygons[0].map((q) => q[0] * u[0] + q[1] * u[1]));
    assert.ok(Math.abs(reach - cut) < 1e-9, `bond from ${deg}° stops at the cut`);
  }
  console.log("render.check: label cuts ok");
}

// Line spacing: Automatic spaces every line by the caption's largest text, Variable each line by its own, and Fixed
// by the points given.
{
  const two = { text: "a\nb" }, big = { text: "a\nb", runs: [{ text: "a\n" }, { text: "b", size: 20 }] };
  assert.deepEqual(lineOffsets(two, 10, 1), [0, 12]);
  assert.deepEqual(lineOffsets({ ...big }, 10, 1), [0, 24]);
  assert.deepEqual(lineOffsets({ ...two, lineHeight: 15 }, 10, 2), [0, 30]);
  const v = lineOffsets({ ...big, lineHeight: "variable" }, 10, 1);
  assert.ok(v[1] > 12 && v[1] < 24, `variable: between the two sizes' spacing (${v[1]})`);
  // Variable, as ChemDraw's: the line above's lowest descender and this line's tallest character, with no gap. An empty
  // line has no ink, so it takes the ascent and descent of its text size.
  assert.deepEqual(lineOffsets({ ...two, lineHeight: "variable" }, 10, 1, (j) => (j === 0 ? [7, 2] : [8, 0])), [0, 10]);
  const gap = lineOffsets({ text: "a\n\nb", lineHeight: "variable" }, 10, 1, (j) => (j === 1 ? undefined : [7, 2]));
  assert.ok(Math.abs(gap[1] - (2 + 9.05)) < 1e-9 && Math.abs(gap[2] - gap[1] - (2.12 + 7)) < 1e-9, `empty line: ${gap}`);
  // placeCaptions measures each line's runs, a subscript lowered as it is drawn.
  const placed = placeCaptions({ atoms: [], bonds: [], captions: [{ id: 1, text: "H2\nO", x: 0, y: 0, lineHeight: "variable", runs: [{ text: "H" }, { text: "2", script: "sub" }, { text: "\nO" }] }] },
    { ink: [], scale: 19.2 }, (t) => t.length, [], 1, 10, new Map(), undefined, (_, __, r) => (r.script ? [5, 1] : [7, 0]))[0];
  assert.ok(Math.abs(placed.lines[1].y - placed.lines[0].y - (1 + 0.212 * 10 + 7)) < 1e-9, `subscript ink: ${placed.lines.map((l) => l.y)}`);
  console.log("render.check: line spacing ok");
}

// A caption with a width wraps to it, and a justified one fills it on every line but the last.
{
  const pc = (align: Caption["align"]) => placeCaptions({ atoms: [], bonds: [], captions: [{ id: 1, text: "aa bb cc dd", x: 0, y: 0, width: 6 / 19.2, align }] }, { ink: [], scale: 19.2 },
    (t) => t.length, [], 1, 10, new Map(), (t) => t.length)[0];
  const left = pc("left");
  assert.deepEqual(left.lines.map((l) => l.text), ["aa bb", "cc dd"]);
  assert.ok(left.lines.every((l) => !l.spacing));
  const full = pc("justify");
  assert.equal(full.anchor, "start");
  assert.ok(Math.abs(full.lines[0].spacing! - 1) < 1e-9, "the first line's one space takes the one spare px");
  assert.equal(full.lines[1].spacing, undefined, "the last line is not spread");
  console.log("render.check: caption width ok");
}

