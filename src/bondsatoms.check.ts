// Run: node src/bondsatoms.check.ts. Fails loudly if the bond and atom options taken from ChemDraw 26.1 break:
// quadruple and hydrogen bonds, crossing bonds, label alignment, hidden hydrogens and placed symbols, and their CDXML.
import assert from "node:assert/strict";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { parse, serialize } from "./file.ts";
import { problems } from "./check.ts";
import { addSymbol, atomAt, bondAt, bondOrders, cycleBond, orderBonds, setPosition, toggleHydrogens } from "./edit.ts";
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

// CD-35. Toggle Hydrogen Display hides explicit H on carbon and keeps an H that means something: on a heteroatom,
// charged, an isotope, on a stereo bond or a stereocentre. A hidden H is not drawn nor hit, still counts towards
// valence, and is saved as Visible="no".
{
  const m: Mol = {
    atoms: [A("C", 0, 0), A("H", 0, 1), A("O", 1, 0), A("H", 1.8, 0.5), A("H", -1, 0, { isotope: 2 }), A("C", 0, -1), A("H", 0.5, -1.8), A("C", -1, -1.5)],
    bonds: [b(0, 1), b(0, 2), b(2, 3), b(0, 4), b(0, 5), b(5, 6, { stereo: 1 }), b(5, 7)],
  };
  const t = toggleHydrogens(m, m.atoms.map((_, i) => i));
  assert.deepEqual(t.atoms.map((a, i) => (a.hidden ? i : -1)).filter((i) => i >= 0), [1], "only the plain H on C1 hides");
  assert.equal(toggleHydrogens(t, [1]).atoms[1].hidden, undefined, "again shows it");
  const d = render(t, S, ink), plain = render({ ...t, atoms: t.atoms.map(({ hidden: _, ...a }) => a) }, S, ink);
  assert.equal(d.labels.filter((l) => l.text === "H").length, plain.labels.filter((l) => l.text === "H").length - 1, "its label is not drawn");
  assert.ok(d.polygons.length < plain.polygons.length, "nor its bond");
  assert.equal(atomAt(t, [0, 1]), undefined);
  assert.equal(bondAt(t, [0, 0.5]), undefined);
  assert.deepEqual(bondOrders(t)[0], bondOrders(m)[0], "its bond still counts");
  const text = toCdxml(t, DEFAULT_STYLE);
  assert.equal((text.match(/Visible="no"/g) ?? []).length, 2, "the H and its bond");
  assert.equal(roundTrip(t).atoms[1].hidden, true);
  assert.equal(parse(serialize(t)).atoms[1].hidden, true);
}
console.log("bondsatoms.check: hidden hydrogens ok");

// CD-26. A mark moved round its atom keeps its angle; lone pairs can be bars; an attachment point can be ChemDraw's
// diamond or star, and the bond stops at it.
{
  const water = (more: Partial<Atom> = {}): Mol => ({ atoms: [A("O", 0, 0, { pairs: 2, ...more }), A("C", 1, 0)], bonds: [b(0, 1)] });
  const at = (m: Mol, key: string) => { const e = render(m, S, ink).electrons.find((x) => x.key === key)!; return Math.round((Math.atan2(-e.at[1], e.at[0]) * 180) / Math.PI); };
  assert.equal(at(water({ angles: { pair0: 90 } }), "pair0"), 90, "pair0 straight up");
  assert.notEqual(at(water({ angles: { pair0: 90 } }), "pair1"), 90, "pair1 goes elsewhere");
  const dots = render(water(), S, ink).polygons.length, bars = render(water({ bars: true }), S, ink).polygons.length;
  assert.equal(dots - bars, 2, "two bars for four dots");
  assert.deepEqual([addSymbol(water(), 0, "pair", true).atoms[0].bars, addSymbol(water({ bars: true }), 0, "pair", true).atoms[0].bars], [true, undefined], "Option-click switches the lone pairs' style");
  // Diamond and star: the bond stops at the shape, which is drawn as an outline.
  const point = (attach: Atom["attach"]): Mol => ({ atoms: [A("C", 0, 0), A("C", 1, 0, { attach })], bonds: [b(0, 1)] });
  const reach = (m: Mol) => Math.max(...render(m, S, ink).polygons[0].map((q) => q[0]));
  assert.ok(reach(point("diamond")) < S.bond - (0.75 * S.size + 2 * S.line) / 2 + 0.5, "the bond stops at the diamond");
  assert.ok(reach(point(true)) > S.bond - 1, "a wavy point does not cut the bond");
  assert.deepEqual([addSymbol(point(true), 1, "attachStar").atoms[1].attach, addSymbol(point("star"), 1, "attachStar").atoms[1].attach], ["star", undefined]);
  for (const attach of [true, "diamond", "star"] as const) assert.equal(roundTrip(point(attach)).atoms[1].attach, attach);
  assert.match(toCdxml(point("diamond"), DEFAULT_STYLE), /ExternalConnectionType="Diamond"/);
  // CDXML: bars are LonePairBar symbols; angles go back exactly in Octet's files and from the symbols' places in
  // ChemDraw's.
  const moved = water({ bars: true, angles: { pair0: 90 } }), text = toCdxml(moved, DEFAULT_STYLE);
  assert.equal((text.match(/SymbolType="LonePairBar"/g) ?? []).length, 2);
  assert.deepEqual(fromCdxml(text).mol.atoms[0].angles, { pair0: 90 });
  const foreign = roundTrip(moved).atoms[0];
  assert.equal(foreign.bars, true);
  assert.equal(foreign.angles?.pair0, 90, "ChemDraw's copy: the symbol's place gives the angle");
  assert.deepEqual(parse(serialize(moved)).atoms[0].angles, { pair0: 90 });
  assert.equal(parse(serialize(point("star"))).atoms[1].attach, "star");
}
console.log("bondsatoms.check: placed and styled symbols ok");
