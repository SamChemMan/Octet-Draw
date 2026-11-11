// Run: node src/membrane.check.ts. The Membrane line style (issue 95): a line, arc or pen curve drawn as a lipid
// bilayer whose lipids keep their size, so a stretch adds lipids; offered for lines only; and kept through CDXML (as
// curves ChemDraw shows, with the line in Octet's data), CDX, .oct and Octet's own clipboard text.
import assert from "node:assert/strict";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { transformParts } from "./edit.ts";
import { parse, serialize } from "./file.ts";
import { arrowTrace } from "./hit.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import { arrowPicks, arrowShapes, membrane, sweepBend, type Arrow, type Mol } from "./render.ts";

const near = (a: number, b: number, d = 1e-6) => Math.abs(a - b) <= d;
const line: Arrow = { id: 1, kind: "line", from: [0, 0], to: [2, 0], style: "membrane" };
const two = membrane(line, 1);
// Two bond lengths: nine lipids a side, 0.25 apart, as the library's Lipid bilayer drew them, heads 0.565 out.
assert.equal(two.heads.length, 18);
assert.equal(two.tails.length, 36, "two tails a lipid");
assert.ok(two.heads.every((h) => near(h.r, 0.105) && near(Math.abs(h.at[1]), 0.565)), "heads on both sides");
assert.ok(near(two.heads[1].at[0] - two.heads[0].at[0], 0.25), "0.25 apart");
assert.ok(two.tails.every((t) => t.every((q) => Math.abs(q[1]) > 0 && Math.abs(q[1]) <= 0.46 + 1e-9)), "tails between the heads and the line");

// A stretch (the frame's side handle moves geometry only) adds lipids of the same size; it never stretches them.
const stretched = transformParts({ atoms: [], bonds: [], arrows: [line] }, new Set(), new Set([1]), (q) => [q[0] * 3, q[1]], [3, 1]).arrows![0];
const six = membrane(stretched, 1);
assert.equal(six.heads.length, 50, "25 a side at 6 bond lengths");
assert.ok(six.heads.every((h) => near(h.r, 0.105)), "same heads");
// The arrow's own scale (a resize with Labels and lines, or Scale…) sizes the lipids, and fewer fit.
const big = membrane({ ...line, scale: 2 }, 1);
assert.equal(big.heads.length, 10);
assert.ok(big.heads.every((h) => near(h.r, 0.21) && near(Math.abs(h.at[1]), 1.13)));
// A file cannot make a membrane that takes too long to draw: at most 2000 lipids a side.
assert.equal(membrane({ ...line, to: [1e9, 0], scale: 0.01 }, 1).heads.length, 4000);
// px at k per bond length: the same drawing, k times as large (y down).
assert.ok(membrane(line, 20).heads.every((h, i) => near(h.at[0], two.heads[i].at[0] * 20) && near(h.r, 2.1)));

// Curved: an arc has fewer lipids on its inside than its outside. Closed: lipids all round, none twice at the seam.
const arc: Arrow = { id: 2, kind: "arc", from: [-2, 0], to: [2, 0], bend: sweepBend(180), style: "membrane", colour: "#213C99" };
const bent = membrane(arc, 1), ends = bent.heads.reduce((n, h) => n + (Math.hypot(h.at[0], h.at[1] + 0) < 2 ? 1 : 0), 0);
assert.ok(ends > 0 && ends < bent.heads.length / 2, `${ends} of ${bent.heads.length} heads inside`);
const k = 0.5523 * 2, cell: Arrow = { id: 3, kind: "curve", from: [2, 0], to: [0, -2], style: "membrane", curve: { closed: true, points: [
  { at: [2, 0], c1: [2, -k], c2: [2, k] }, { at: [0, 2], c1: [k, 2], c2: [-k, 2] }, { at: [-2, 0], c1: [-2, k], c2: [-2, -k] }, { at: [0, -2], c1: [-k, -2], c2: [k, -2] }] } };
const round = membrane(cell, 1).heads, gap = (i: number, j: number) => Math.hypot(round[i].at[0] - round[j].at[0], round[i].at[1] - round[j].at[1]);
assert.ok(round.every((_, i) => round.every((__, j) => i === j || gap(i, j) > 0.15)), "no two heads on each other");
const radii = round.map((h) => Math.hypot(h.at[0], h.at[1]));
assert.ok(radii.every((r) => near(r, 2.565, 0.02) || near(r, 1.435, 0.02)), "each head on its side's circle");
assert.equal(radii.filter((r) => r > 2).length, Math.round((2 * Math.PI * 2.565) / 0.25));

// Drawn: tails as bars, each head a ring (its outer edge one way round and its inner edge the other, so it has a hole).
const ink = arrowShapes(line, { bond: 20, line: 0.8, bold: 2.7, spacing: 3.6, hash: 3.6, margin: 2.2, size: 13 }, 20);
const area = (p: number[][]) => p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0) / 2;
assert.equal(ink.length, 36 * 4 + 18 * 2);
const rings = ink.slice(-36);
assert.ok(rings.every((p, i) => (i % 2 ? area(p) > 0 : area(p) < 0) && area(ink[0]) < 0), "rings wound against each other");
// Its box and a click take in its heads, not just the line it is drawn along.
assert.deepEqual(arrowTrace(line, 20).box.map((v) => Math.round(v * 100) / 100), [-2.1, -13.4, 42.1, 13.4]);

// Offered as a line style for lines, arcs and pen curves, never for an arrow; a membrane has no heads to choose.
const picks = (c: object) => arrowPicks({ kind: "arrow", ratio: 1, heads: true, shaped: true, curved: false, fillable: false, style: "plain", start: "none", end: "none", head: "solid", fill: "none", ...c } as { kind: string });
const styles = (c: object) => picks(c)[0].picks.find((p) => p.label === "Line")!.options.map(([id]) => id);
assert.ok(styles({ arrow: "line" }).includes("membrane") && styles({ arrow: "curve" }).includes("membrane"));
assert.ok(!styles({ arrow: "reaction" }).includes("membrane"));
assert.deepEqual(picks({ arrow: "line", style: "membrane", fillable: true })[0].picks.map((p) => p.label), ["Line"]);

// Files: CDXML, CDX and .oct give each membrane back as it was; ChemDraw gets its lipids as curves in one group.
const mol: Mol = { atoms: [], bonds: [], arrows: [line, arc, { ...cell, width: 1, scale: 0.8 }] };
const xml = toCdxml(mol, DEFAULT_STYLE), lipids = two.heads.length + bent.heads.length + membrane(mol.arrows![2], 1).heads.length;
assert.equal((xml.match(/<curve/g) ?? []).length, 4 * lipids, "a head's fill, its outline and two tails for each lipid");
assert.equal((xml.match(/Integral="yes"/g) ?? []).length, 3, "ChemDraw picks each membrane whole");
const same = (got: Mol, label: string) => {
  assert.equal(got.arrows?.length, 3, label);
  got.arrows!.forEach((a, i) => {
    const b = mol.arrows![i];
    assert.deepEqual([a.id, a.kind, a.style, a.colour, a.width, a.scale, !!a.curve?.closed, a.curve?.points.length], [b.id, b.kind, b.style, b.colour, b.width, b.scale, !!b.curve?.closed, b.curve?.points.length], label);
    assert.ok(near(a.from[0], b.from[0], 1e-3) && near(a.from[1], b.from[1], 1e-3) && near(a.bend ?? 0, b.bend ?? 0, 1e-9), label);
    (a.curve?.points ?? []).forEach((q, j) => assert.ok(near(q.at[0], b.curve!.points[j].at[0], 1e-3) && near(q.c1![1], b.curve!.points[j].c1![1], 1e-3), label));
  });
};
const read = fromCdxml(xml);
assert.deepEqual(read.lost, {});
same(read.mol, "CDXML");
same(readCdx(writeCdx(mol, DEFAULT_STYLE)).mol, "CDX");
same(readOct(writeOct(mol, DEFAULT_STYLE)).mol, ".oct");
same(parse(serialize(mol)), "Octet's own text");
// Saved over by ChemDraw (Octet's data gone), the lipids are curves in their groups.
const foreign = fromCdxml(xml.replace(/ Octet="[^"]*"/g, ""));
assert.equal(foreign.mol.arrows?.length, 4 * lipids);
assert.equal(foreign.mol.groups?.length, 3);
console.log(`membrane: lipids keep their size as a membrane stretches, bends or closes, and ${lipids} lipids' membranes round-trip through CDXML, CDX, .oct and Octet's text ok`);
