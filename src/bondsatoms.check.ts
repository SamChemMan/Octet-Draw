// Run: node src/bondsatoms.check.ts. Fails loudly if the bond and atom options taken from ChemDraw 26.1 break:
// quadruple and hydrogen bonds, crossing bonds, label alignment, hidden hydrogens and placed symbols, and their CDXML.
import assert from "node:assert/strict";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { parse, serialize } from "./file.ts";
import { problems } from "./check.ts";
import { bondOrders, cycleBond, orderBonds, setPosition } from "./edit.ts";
import { HBOND, QUADRUPLE, render, type Atom, type Bond, type Ink, type Mol } from "./render.ts";

type P = [number, number];
const pt = 4 / 3;
const S = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
const box: P[] = [];
for (let i = 0; i <= 40; i++) { const f = i / 40; box.push([9.6 * f, 0], [9.6 * f, -9.5], [0, -9.5 * f], [9.6, -9.5 * f]); }
const ink = (): Ink => ({ width: 9.6, ascent: 9.5, outline: box });
const A = (label: string, x: number, y: number, more: Partial<Atom> = {}): Atom => ({ label, location: [x, y, 0], ...more });
const b = (i: number, j: number, more: Partial<Bond> = {}): Bond => ({ type: 1, atoms: [i, j], ...more });
const roundTrip = (m: Mol) => fromCdxml(toCdxml(m, DEFAULT_STYLE).replace(/ Octet="[^"]*"/g, "").replace(/CreationProgram="[^"]*"/, "")).mol;

// CD-8. A quadruple bond is four lines one spacing apart, centred; it counts 4 towards valence.
{
  const m: Mol = { atoms: [A("Re", 0, 0), A("Re", 1, 0)], bonds: [b(0, 1, { type: QUADRUPLE })] };
  const d = render({ ...m, atoms: [A("C", 0, 0), A("C", 1, 0)] }, S, ink);
  assert.equal(d.polygons.length, 4, "four lines");
  const ys = d.polygons.map((poly) => poly.reduce((s, q) => s + q[1], 0) / poly.length).sort((x, y) => x - y);
  assert.ok(ys.every((y, k) => Math.abs(y - (k - 1.5) * S.spacing) < 1e-6), `offsets ${ys}`);
  assert.deepEqual(bondOrders(m), [4, 4]);
  const text = toCdxml(m, DEFAULT_STYLE);
  assert.match(text, /<b\s[^>]*Order="4"/);
  assert.equal(roundTrip(m).bonds[0].type, QUADRUPLE);
  assert.equal(cycleBond(m, 0).bonds[0].type, 1, "a click with the single bond tool makes it single");
}
// A hydrogen bond is dotted, adds nothing to valence, and is ChemDraw 26's DottedHydrogen display.
{
  const m: Mol = { atoms: [A("O", 0, 0), A("H", 1, 0), A("N", 2, 0)], bonds: [b(0, 1), b(1, 2, { type: HBOND })] };
  assert.deepEqual(bondOrders(m), [1, 1, 0]);
  const dots = render({ ...m, atoms: [A("C", 0, 0), A("C", 1, 0), A("C", 2, 0)] }, S, ink).polygons.slice(1);
  assert.equal(dots.length, Math.round(S.bond / (S.hash / 2)) + 1, "one dot every half hash spacing");
  const text = toCdxml(m, DEFAULT_STYLE);
  assert.match(text, /<b\s[^>]*Display="DottedHydrogen"/);
  assert.doesNotMatch(text, /Order="hydrogen"/);
  assert.equal(roundTrip(m).bonds[1].type, HBOND);
  // The spec's hydrogen order and an older dotted bond read as hydrogen bonds too.
  assert.equal(fromCdxml(text.replace('Display="DottedHydrogen"', 'Order="hydrogen"')).mol.bonds[1].type, HBOND);
  assert.equal(fromCdxml(text.replace('Display="DottedHydrogen"', 'Display="Dot"')).mol.bonds[1].type, HBOND);
  assert.equal(cycleBond(m, 1).bonds[1].type, HBOND, "a hydrogen bond stays one");
  assert.equal(problems(m).length, 0, "H to N is a sound hydrogen bond");
  const wrong: Mol = { ...m, bonds: [b(0, 1), b(0, 2, { type: HBOND })] };
  assert.match(problems(wrong)[0]?.message ?? "", /^The hydrogen bond at O1 does not join an H atom to an acceptor\./);
  assert.deepEqual(parse(serialize(m)).bonds.map((x) => x.type), [1, HBOND]);
  assert.deepEqual(parse(serialize({ ...m, bonds: [b(0, 1, { type: QUADRUPLE })] })).bonds.map((x) => x.type), [QUADRUPLE]);
}
console.log("bondsatoms.check: quadruple and hydrogen bonds ok");

// CD-9. Two bonds that cross in a flat drawing: the one behind has a gap where the front one passes, as wide as the
// front bond and a margin either side. The later bond is in front, unless a bond's z puts it forward.
{
  // One structure: a horizontal bond, a vertical bond across it, and a bond joining their ends.
  const cross: Mol = { atoms: [A("C", -0.5, 0), A("C", 0.5, 0), A("C", 0, -0.5), A("C", 0, 0.5)], bonds: [b(0, 1), b(2, 3), b(1, 3)] };
  const pieces = (m: Mol) => render(m, S, ink).polygons;
  const xs = (poly: P[]) => poly.map((q) => q[0]), ys = (poly: P[]) => poly.map((q) => q[1]);
  const flat = pieces(cross);
  assert.equal(flat.length, 4, "the first bond is cut in two, the others are whole");
  const horiz = flat.filter((poly) => Math.max(...ys(poly)) - Math.min(...ys(poly)) < 1);
  assert.equal(horiz.length, 2, "the horizontal bond (behind) is in two pieces");
  const gap = Math.min(...horiz.map((poly) => Math.min(...xs(poly).map(Math.abs))));
  assert.ok(Math.abs(gap - (S.line / 2 + S.margin)) < 1e-6, `gap half-width ${gap}`);
  const front = pieces({ ...cross, bonds: [b(0, 1, { z: 1 }), b(2, 3), b(1, 3)] });
  assert.equal(front.filter((poly) => Math.max(...xs(poly)) - Math.min(...xs(poly)) < 1).length, 2, "with z the first bond is in front");
  // A double bond in front cuts a gap as wide as both its lines.
  const dbl = pieces({ ...cross, bonds: [b(0, 1), b(2, 3, { type: 2, position: "left" }), b(1, 3)] }).filter((poly) => Math.max(...ys(poly)) - Math.min(...ys(poly)) < 1);
  assert.equal(dbl.length, 2);
  // Bonds that share an atom never cut each other.
  assert.equal(pieces({ atoms: [A("C", 0, 0), A("C", 1, 0), A("C", 0.5, 0.8)], bonds: [b(0, 1), b(1, 2), b(2, 0)] }).length, 3);
  // f (orderBonds) brings a bond to the front and keeps the rest in order; CDXML keeps the order through Z.
  const fronted = orderBonds(cross, [0], true);
  assert.deepEqual(fronted.bonds.map((x) => x.z), [1, undefined, undefined]);
  assert.deepEqual(orderBonds(fronted, [0], false).bonds.map((x) => x.z), [-1, undefined, undefined]);
  const text = toCdxml(fronted, DEFAULT_STYLE), zs = [...text.matchAll(/<b\s[^>]*?id="(\d+)"[^>]*?Z="(\d+)"/g)];
  assert.ok(zs.length === 3 && Number(zs[2][2]) > Number(zs[1][2]) && Number(zs[2][1]) < Number(zs[0][1]), "the front bond is written last, with the higher Z");
  const back = roundTrip(fronted);
  assert.equal(pieces(back).filter((poly) => Math.max(...xs(poly)) - Math.min(...xs(poly)) < 1).length, 2, "the first bond is still in front");
  assert.equal(roundTrip(cross).bonds.some((x) => x.z), false, "bonds in their own order keep no z");
  assert.deepEqual(parse(serialize(fronted)).bonds.map((x) => x.z), [1, undefined, undefined]);
  // Automatic position: a set side can be taken off again.
  assert.equal(setPosition(setPosition(cross, 0, "left"), 0).bonds[0].position, undefined);
}
console.log("bondsatoms.check: crossing bonds and bond order ok");

// CD-21. A label's alignment set by hand: OMe with its bond on the right reads MeO by itself; Flush Left keeps OMe,
// Centred puts the whole label on the atom, Stacked Above puts Me over O. NH2 Flush Right is H2N.
{
  const ome = (align?: Atom["align"]): Mol => ({ atoms: [A("O", 0, 0, { text: "OMe", ...(align ? { align } : {}) }), A("C", 1, 0)], bonds: [b(0, 1)] });
  const runs = (m: Mol) => render(m, S, ink).labels.map((l) => [l.text, Math.round(l.x * 10) / 10, Math.round(l.y * 10) / 10] as const);
  const o = (m: Mol) => runs(m).find((r) => r[0] === "O")!, me = (m: Mol) => runs(m).find((r) => r[0] === "Me")!;
  assert.ok(me(ome())[1] < o(ome())[1], "automatic: MeO");
  assert.ok(me(ome("left"))[1] > o(ome("left"))[1], "flush left: OMe");
  assert.deepEqual(o(ome("right")), o(ome()), "flush right is MeO, as automatic is here");
  const centre = runs(ome("centre")), wide = 9.6 * 2; // every text measures 9.6 here
  assert.ok(Math.abs(centre.find((r) => r[0] === "O")![1] + wide / 2) < 0.1, "centred: the label's middle on the atom");
  const above = me(ome("above"));
  assert.ok(above[2] < o(ome("above"))[2] && Math.abs(above[1] + 4.8) < 0.1, "stacked above: Me over O, centred");
  const nh2 = (align?: Atom["align"]): Mol => ({ atoms: [A("N", 0, 0, align ? { align } : {}), A("C", -1, 0)], bonds: [b(0, 1)] });
  const h = (m: Mol) => render(m, S, ink).labels.find((l) => l.text === "H")!.x;
  assert.ok(h(nh2()) > 0 && h(nh2("right")) < 0, "NH2 by itself; H2N flush right");
  // CDXML: the node's LabelDisplay says the alignment was set by hand; a label left automatic has none.
  const text = toCdxml(ome("above"), DEFAULT_STYLE);
  assert.match(text, /LabelDisplay="Above"/);
  assert.match(text, /LabelAlignment="Above"/);
  assert.doesNotMatch(toCdxml(ome(), DEFAULT_STYLE), /LabelDisplay/);
  for (const align of ["left", "centre", "right", "above", "below"] as const) assert.equal(roundTrip(ome(align)).atoms[0].align, align);
  assert.equal(roundTrip(ome()).atoms[0].align, undefined);
  assert.equal(parse(serialize(ome("centre"))).atoms[0].align, "centre");
}
console.log("bondsatoms.check: label alignment ok");
