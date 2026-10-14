// Run: node src/render.check.ts — fails loudly if the ACS drawing rules break.
import assert from "node:assert/strict";
import { render, type Mol } from "./render.ts";

const S = { bond: 19.2, spacing: 0.18 * 19.2, margin: 1.6 * 4 / 3, bold: 2 * 4 / 3, hash: 2.5 * 4 / 3, size: 10 * 4 / 3 };
const ink = () => ({ left: 4, right: 4, ascent: 9.5, descent: 0, width: 9.6 }); // roughly an Arial capital at 10 pt
// Pyridine: N at atom 0, double bonds 0=1, 2=3, 4=5, hexagon of unit bonds.
const hex = [...Array(6)].map((_, i) => [Math.cos((Math.PI / 3) * i + Math.PI / 6), Math.sin((Math.PI / 3) * i + Math.PI / 6), 0] as [number, number, number]);
const mol: Mol = {
  atoms: hex.map((location, i) => ({ label: i ? "C" : "N", location })),
  bonds: [0, 1, 2, 3, 4, 5].map((i) => ({ type: i % 2 ? 1 : 2, atoms: [i, (i + 1) % 6] as [number, number] })),
};
const d = render(mol, S, ink);
const centre = [0, 0];
const dist = (p: number[]) => Math.hypot(p[0] - centre[0], p[1] - centre[1]);
// Three inner lines, each closer to the ring centre than the bond they belong to, and shorter than a bond.
assert.equal(d.lines.length, 3);
for (const [p, q] of d.lines) {
  assert.ok(dist([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]) < S.bond * Math.cos(Math.PI / 6) - 1, "inner line sits inside the ring");
  assert.ok(Math.hypot(q[0] - p[0], q[1] - p[1]) < S.bond, "inner line is shorter than the bond");
}
// One closed path (the ring) broken at N, and nothing drawn inside N's ink box plus margin.
const [nx, ny] = [hex[0][0] * S.bond, -hex[0][1] * S.bond];
const coords = d.paths.join(" ").match(/-?\d+\.\d+/g)!.map(Number);
for (let i = 0; i < coords.length; i += 2) {
  const inside = Math.abs(coords[i] - nx) < 4 + S.margin - 0.01 && Math.abs(coords[i + 1] - ny) < 4.75 + S.margin - 0.01;
  assert.ok(!inside, "bonds stop outside the label box");
}
assert.equal(d.labels.length, 1);
console.log("render.check: ok");

// Methylamine drawn left to right: NH2 reads N, H, then a smaller subscript 2, all to the right of the atom.
const amine = render({ atoms: [{ label: "C", location: [0, 0, 0] }, { label: "N", location: [1, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] }, S, ink);
assert.deepEqual(amine.labels.map((l) => l.text), ["N", "H", "2"]);
assert.ok(amine.labels[1].x > amine.labels[0].x && amine.labels[2].x > amine.labels[1].x, "H2 follows N");
assert.ok(amine.labels[2].size < amine.labels[1].size && amine.labels[2].y > amine.labels[1].y, "2 is a subscript");
console.log("render.check: amine ok");

// Nitro group: N+ and O− get their charge signs; no H on either.
const nitro = render({
  atoms: [{ label: "C", location: [0, 0, 0] }, { label: "N", location: [1, 0, 0], charge: 1 }, { label: "O", location: [1.5, 0.87, 0] }, { label: "O", location: [1.5, -0.87, 0], charge: -1 }],
  bonds: [{ type: 1, atoms: [0, 1] }, { type: 2, atoms: [1, 2] }, { type: 1, atoms: [1, 3] }],
}, S, ink);
assert.deepEqual(nitro.labels.map((l) => l.text).sort(), ["+", "N", "O", "O", "−"].sort());
console.log("render.check: charges ok");
