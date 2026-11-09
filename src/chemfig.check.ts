// Run: node src/chemfig.check.ts. Fails loudly if Copy As chemfig (src/chemfig.ts) stops writing chemfig code that
// draws the structure as the page does: each bond at its angle and length, labels read away from their bonds and
// styled, rings closed by hooks or in ring syntax (fused, with circles), wedges the right way round, separate
// structures kept in their places, marks, numbers and stereo labels where the page draws them, names, schemes,
// brackets and arrows (\chemmove); and if the notice stops saying what the code leaves out.
import assert from "node:assert/strict";
import { arcHalf, chemfigNotice, syntaxRings, toChemfig, type Scheme } from "./chemfig.ts";
import { QUADRUPLE, arrowPath, bendPoint, render, sweepBend, type Atom, type Bond, type Ink, type Mol } from "./render.ts";

const c30 = Math.cos(Math.PI / 6), s30 = 0.5;
const A = (label: string, x: number, y: number, more: Partial<Atom> = {}): Atom => ({ label, location: [x, y, 0], ...more });
const B = (a: number, b: number, type = 1, more: Partial<Bond> = {}): Bond => ({ type, atoms: [a, b], ...more });
const mol = (atoms: Atom[], bonds: Bond[]): Mol => ({ atoms, bonds });
// The compact layout, which the checks below spell out; each drawing is kept (with its style and options) to check the
// readable layout and every code's soundness against, at the end.
type Style = Parameters<typeof toChemfig>[1];
type Options = NonNullable<Parameters<typeof toChemfig>[2]>;
const written: [Mol, Style, Options][] = [];
const cf = (m: Mol, style: Style = {}, options: Options = {}) => (written.push([m, style, options]), toChemfig(m, style, { ...options, compact: true }));
// The code without the readable layout's line breaks and tabs (a scheme's lines end with %, and its compact
// \schemestart is followed by a space).
const flat = (s: string) => s.replace(/%?\n\t*/g, "").replace(/\\schemestart /g, "\\schemestart");
// A regular ring of n atoms with bonds of length 1 round (cx, cy), its first atom at angle t (degrees).
const ring = (n: number, cx: number, cy: number, t: number, label = "C") => {
  const r = 1 / (2 * Math.sin(Math.PI / n));
  return Array.from({ length: n }, (_, k) => A(label, cx + r * Math.cos(((t + (360 * k) / n) * Math.PI) / 180), cy + r * Math.sin(((t + (360 * k) / n) * Math.PI) / 180)));
};

// Ethanol, drawn as a zigzag: skeletal carbons are empty atoms, and OH reads away from its bond.
assert.equal(cf(mol([A("C", 0, 0), A("C", c30, s30), A("O", 2 * c30, 0)], [B(0, 1), B(1, 2)])), "\\chemfig{-[:30]-[:-30]OH}");
// The same drawn the other way: the O is written first, as HO, and the bond leaves its O.
assert.equal(cf(mol([A("O", 0, 0), A("C", c30, s30), A("C", 2 * c30, 0)], [B(0, 1), B(1, 2)])), "\\chemfig{HO-[:30]-[:-30]}");
// A bond into or out of a label read either way meets its N or O, not its H.
assert.equal(cf(mol([A("C", 0, 0), A("N", 0, 1)], [B(0, 1)])), "\\chemfig{NH_2-[:-90]}");
assert.equal(cf(mol([A("N", 0, 0), A("C", c30, -s30), A("C", c30, -1 - s30)], [B(0, 1), B(1, 2)])), "\\chemfig{H_2N-[:-30]-[:-90]}");
assert.equal(cf(mol([A("C", 0, 0), A("C", c30, s30), A("O", c30, 1 + s30)], [B(0, 1), B(1, 2)])), "\\chemfig{-[:30]-[:90,,,1]OH}");
// Acetic acid: the longest chain is the main one, the C=O a branch, its double bond centred (a terminal =O).
assert.equal(cf(mol([A("C", 0, 0), A("C", c30, s30), A("O", c30, 1 + s30), A("O", 2 * c30, 0)], [B(0, 1), B(1, 2, 2), B(1, 3)])),
  "\\chemfig{-[:30](=[:90]O)-[:-30]OH}");
// A bond straight down (or up) into a label meets it at its first atom unless told: into HN, read backwards (its other
// bond goes right), it names the N.
assert.equal(cf(mol([A("C", 0, 1), A("N", 0, 0), A("C", 1, 0)], [B(0, 1), B(1, 2)])), "\\chemfig{-[:-90,,,2]HN-}");
// Bond lengths other than the document's are written as chemfig's length factor.
assert.equal(cf(mol([A("C", 0, 0), A("C", 1.5, 0)], [B(0, 1)])), "\\chemfig{-[,1.5]}");

// Benzene in chemfig's ring syntax, its double bonds inside, as chemfig puts them; started at the atom with the one
// before it straight above, chemfig's own way round, so it needs no turn.
{
  const atoms = ring(6, 0, 0, 150);
  const code = cf(mol(atoms, [B(0, 1, 2), B(1, 2), B(2, 3, 2), B(3, 4), B(4, 5, 2), B(5, 0)]));
  assert.equal(code, "\\chemfig{*6(-=-=-=)}");
}
// A ring written bond by bond (here its sides are 1.5, and chemfig's ring syntax draws sides of 1) is closed by a
// hook: by a plain bond where it can be; where it cannot, the hook writes the bond.
{
  const big = ring(6, 0, 0, 150).map((a) => ({ ...a, location: [a.location[0] * 1.5, a.location[1] * 1.5, 0] as [number, number, number] }));
  assert.equal(cf(mol(big, [B(0, 1), B(1, 2), B(2, 3), B(3, 4), B(4, 5), B(5, 0, 2)])), "\\chemfig{?[1]=_[:30,1.5]-[:-30,1.5]-[:-90,1.5]-[:-150,1.5]-[:150,1.5]?[1]}");
  assert.equal(cf(mol(big, [B(0, 1, 2), B(1, 2), B(2, 3), B(3, 4), B(4, 5), B(5, 0, 2)])), "\\chemfig{?[1]=^[:-90,1.5]-[:-30,1.5]-[:30,1.5]-[:90,1.5]-[:150,1.5]?[1,{=_}]}");
}
// Rings in chemfig's ring syntax: isolated, regular rings whose bonds out point straight out from the middle. A ring
// drawn with a circle is **6 with single sides. A first ring the other way up is turned with [:θ], and then every
// other bond gives its angle (0 too, as in a ring a missing angle is the bisector). Branches off the ring go inside its
// code, those of its first atom first. A ring in a fused system, or with a bond out at a slant, is written bond by bond.
{
  const kek = (o: number) => [0, 1, 2, 3, 4, 5].map((k) => B(o + k, o + ((k + 1) % 6), k % 2 ? 1 : 2));
  const outOf = (h: Atom[], k: number, label = "C") => { const [x, y] = h[k].location, l = Math.hypot(x, y); return A(label, x + x / l, y + y / l); };
  const benzene = ring(6, 0, 0, 30);
  assert.equal(cf(mol(benzene.map((a) => ({ ...a, circle: true })), kek(0))), "\\chemfig{**6(------)}");
  assert.equal(chemfigNotice("Copied", mol(benzene.map((a) => ({ ...a, circle: true })), kek(0)), true), undefined, "the circle is in the code");
  const flat = ring(6, 0, 0, 0);
  assert.equal(cf(mol([...flat, outOf(flat, 0)], [...kek(0), B(0, 6)])), "\\chemfig{[:-30]*6(-=-(-[:0])=-=)}");
  assert.equal(cf(mol(benzene.map((a, k) => (k === 3 ? { ...a, label: "N" } : a)), kek(0))), "\\chemfig{N*6(-=-=-=)}");
  // Phenol: the walk starts at the ring (its leftmost atom), and the OH is a branch inside its code.
  assert.equal(cf(mol([...benzene, outOf(benzene, 1, "O")], [...kek(0), B(1, 6)])), "\\chemfig{*6(-=-=(-[:90,,,1]OH)-=)}");
  // A methyl at a slant: bond by bond, with hooks.
  const slant = mol([...benzene, A("C", benzene[0].location[0] + 1, benzene[0].location[1])], [...kek(0), B(0, 6)]);
  assert.match(cf(slant), /\?\[1\]/);
  // A second ring hanging off the first reaches it through a point straight out from its middle.
  const two = mol([...benzene, ...ring(6, 4, 0, 30)], [...kek(0), ...kek(6)]);
  assert.equal(cf(two), "\\chemfig{*6((-[:-9,3.17,,,draw=none]-[:30,,,,draw=none]*6(-=-=-=))-=-=-=)}");
}
// Fused rings in ring syntax: a ring fused at an atom of its parent is nested after that atom, built from it
// counterclockwise, and ends on the parent's next atom (an empty atom), so the side they share is the parent's.
{
  const left = ring(6, 0, 0, 30), right = ring(6, 2 * c30, 0, 30), naphAtoms = [...left, right[0], right[1], right[5], right[4]];
  const naphBonds = [B(0, 1, 2), B(1, 2), B(2, 3, 2), B(3, 4), B(4, 5, 2), B(5, 0), B(0, 7), B(7, 6, 2), B(6, 8), B(8, 9, 2), B(9, 5)];
  const naph = naphAtoms.map((a) => ({ ...a, circle: true as const }));
  assert.equal(cf(mol(naphAtoms, naphBonds)), "\\chemfig{*6(-=*6(-=-=-{})-=-=)}");
  // With circles: every side single, the shared one too, and nothing reported as left out.
  assert.equal(cf(mol(naph, naphBonds)), "\\chemfig{**6(--**6(-----{})----)}");
  assert.equal(chemfigNotice("Copied", mol(naph, naphBonds), true), undefined);
  // A circle in one ring only (the left one, which every atom of is marked): the other keeps its double bonds, and
  // the shared side is single, as the page draws it, even when it is a double bond.
  const one = naphAtoms.map((a, k) => (k < 6 ? { ...a, circle: true as const } : a));
  assert.equal(cf(mol(one, naphBonds)), "\\chemfig{**6(--*6(-=-=-{})----)}");
  const shifted = [B(0, 1), B(1, 2, 2), B(2, 3), B(3, 4, 2), B(4, 5), B(5, 0, 2), B(0, 7), B(7, 6, 2), B(6, 8), B(8, 9, 2), B(9, 5)];
  assert.equal(cf(mol(one, shifted)), "\\chemfig{**6(--*6(-=-=-{})----)}");
  assert.equal(cf(mol(naphAtoms, shifted)), "\\chemfig{*6(=-*6(-=-=-{})=-=-)}");
  // A label in the nested ring, and a branch off it.
  const quin = naphAtoms.map((a, k) => (k === 6 ? { ...a, label: "N" } : a));
  assert.equal(cf(mol(quin, naphBonds)), "\\chemfig{*6(-=*6(-=-N=-{})-=-=)}");
  // Atom 8 is the right ring's lower right atom: a methyl straight out from that ring's middle.
  const [x8, y8] = naphAtoms[8].location, l8 = Math.hypot(x8 - 2 * c30, y8);
  const methyl = A("C", x8 + (x8 - 2 * c30) / l8, y8 + y8 / l8);
  assert.equal(cf(mol([...naphAtoms, methyl], [...naphBonds, B(8, 10)])), "\\chemfig{*6(-=*6(-=(-[:-30])-=-{})-=-=)}");
  // A fusion atom with a label: the parent writes it, and the nested ring's last side ends on an invisible copy of it
  // (\phantom, without its marks), so chemfig stops the side at the label's edge and nothing is printed twice.
  assert.equal(cf(mol(naphAtoms.map((a, k) => (k === 0 ? { ...a, label: "N" } : a)), naphBonds)), "\\chemfig{*6(-=*6(-=-=-{\\phantom{N}})-N=-=)}");
  // A charged skeletal carbon has no label (its sign is a mark the parent writes): the empty atom as usual.
  assert.equal(cf(mol(naphAtoms.map((a, k) => (k === 0 ? { ...a, charge: 1 } : a)), naphBonds)), "\\chemfig{*6(-=*6(-=-=-{})-\\charge{-37:1pt[anchor=180+\\chargeangle]=$\\scriptstyle +$}{}=-=)}");
  // Label Every Carbon, with circles.
  assert.equal(cf(mol(naph, naphBonds), { carbonLabels: true }),
    "\\chemfig{HC**6(-{\\chembelow{C}{H}}-C**6(-{\\chembelow{C}{H}}-CH-[,,1,1]CH-{\\chemabove{C}{H}}-{\\phantom{C}})-C-{\\chemabove{C}{H}}-HC-[,,2,2])}");
  // Where ring syntax cannot draw the system as the page does, all of it is written bond by bond: a bond out at a
  // slant, or a fusion atom with a bond out of the system.
  const none = (m: Mol) => assert.equal(syntaxRings(m).length, 0);
  none(mol([...naphAtoms, A("C", x8 + 1, y8)], [...naphBonds, B(8, 10)]));
  none(mol([...naphAtoms, A("C", naphAtoms[0].location[0], naphAtoms[0].location[1] + 1)], [...naphBonds, B(0, 10)]));
  // An atom in three rings (phenalene's middle, as in pyrene): no. Its hexagons' atoms, bonded where they are 1 apart.
  const pts = [90, 210, 330].flatMap((p) => ring(6, Math.cos((p * Math.PI) / 180), Math.sin((p * Math.PI) / 180), p + 180)).filter((a, k, all) => all.findIndex((b) => Math.hypot(a.location[0] - b.location[0], a.location[1] - b.location[1]) < 1e-6) === k);
  const near = pts.flatMap((a, i) => pts.slice(i + 1).flatMap((b, d) => (Math.abs(Math.hypot(a.location[0] - b.location[0], a.location[1] - b.location[1]) - 1) < 1e-6 ? [B(i, i + 1 + d)] : [])));
  assert.equal(pts.length, 13);
  none(mol(pts, near));
  // Phenanthrene with its third ring below the second's lower right, Label Every Carbon and circles. chemfig turns a
  // ring's sides itself, so an upright side can come out a hair either side of ±90°, where chemfig's own choice of the
  // atom of a label a bond leaves or meets flips: a side straight up or down names both (an HC met at its H pushed the
  // third ring out of shape, so its sides no longer met). Atoms row by row, bonds Kekulé.
  const phenPts: [number, number][] = [[c30, 0.5], [0, 1], [-c30, 0.5], [-c30, -0.5], [0, -1], [c30, -0.5], [3 * c30, 0.5], [2 * c30, 1], [2 * c30, -1], [3 * c30, -0.5], [4 * c30, -1], [2 * c30, -2], [3 * c30, -2.5], [4 * c30, -2]];
  const phenBonds = [B(0, 1, 2), B(0, 5), B(0, 7), B(1, 2), B(2, 3, 2), B(3, 4), B(4, 5, 2), B(5, 8), B(6, 7, 2), B(6, 9), B(8, 9, 2), B(8, 11), B(9, 10), B(10, 13, 2), B(11, 12, 2), B(12, 13)];
  const phen = mol(phenPts.map(([x, y]) => A("C", x, y, { circle: true })), phenBonds);
  assert.equal(cf(phen, { carbonLabels: true }),
    "\\chemfig{HC**6(-{\\chembelow{C}{H}}-C**6(-C**6(-[,,,2]HC-{\\chembelow{C}{H}}-CH-[,,1,1]CH-{\\phantom{C}})-C-[,,,1]CH-{\\chemabove{C}{H}}-{\\phantom{C}})-C-{\\chemabove{C}{H}}-HC-[,,2,2])}");
  assert.equal(chemfigNotice("Copied", phen, true), undefined);
  // The same turned half round: the labels read the other way (CH for HC), and the upright sides still name both.
  const turned = mol(phenPts.map(([x, y]) => A("C", -x, -y, { circle: true })), phenBonds);
  assert.equal(cf(turned, { carbonLabels: true }),
    "\\chemfig{HC**6(-C**6(-[,,,2]HC-{\\chembelow{C}{H}}-C**6(-{\\chembelow{C}{H}}-CH-[,,1,1]CH-{\\chemabove{C}{H}}-{\\phantom{C}})-C-{\\phantom{C}})-C-[,,,1]CH-{\\chemabove{C}{H}}-HC-[,,2,2])}");
  // Nor rings that share one atom (spiro), a ring out of shape, or one of more than 8 atoms. (Atoms bonded where they
  // are 1 apart.)
  const linked = (as: Atom[]) => mol(as, as.flatMap((a, i) => as.slice(i + 1).flatMap((b, d) => (Math.abs(Math.hypot(a.location[0] - b.location[0], a.location[1] - b.location[1]) - 1) < 1e-6 ? [B(i, i + 1 + d)] : []))));
  const r5 = 1 / (2 * Math.sin(Math.PI / 5));
  none(linked([...ring(5, 0, 0, 0), ...ring(5, 2 * r5, 0, 180).slice(1)]));
  none(mol(ring(6, 0, 0, 30).map((a, k) => (k ? a : { ...a, location: [a.location[0] + 0.1, a.location[1], 0] as [number, number, number] })), [0, 1, 2, 3, 4, 5].map((k) => B(k, (k + 1) % 6))));
  none(mol(ring(9, 0, 0, 0), Array.from({ length: 9 }, (_, k) => B(k, (k + 1) % 9))));
  // A fusion atom with a label of two atoms (NH⁺): its invisible copy has both, the bond meeting the N.
  assert.match(cf(mol(naphAtoms.map((a, k) => (k === 0 ? { ...a, label: "N", charge: 1 } : a)), naphBonds.map((b) => B(b.atoms[0], b.atoms[1])))), /-\[,,,1\]\{\\phantom\{N\}\}\|\{\\phantom\{H\^\{\+\}\}\}\)/);
  // Anthracene: the middle ring nested in the first, the last nested in the middle.
  const third = ring(6, 4 * c30, 0, 30), anth = [...naphAtoms, third[1], third[0], third[5], third[4]];
  const anthBonds = [...naphBonds, B(6, 10), B(10, 11, 2), B(11, 12), B(12, 13, 2), B(13, 8)];
  assert.equal(cf(mol(anth, anthBonds)), "\\chemfig{*6(-=*6(-=*6(-=-=-{})-=-{})-=-=)}");
}

// Naphthalene drawn larger than chemfig's ring syntax draws (sides 1.5), bond by bond: two hooks, each named once on
// its first atom and once with its bond.
{
  const left = ring(6, 0, 0, 30), right = ring(6, 2 * c30, 0, 30);
  // right's atoms 2 and 4 are left's 0 and 5: keep right's other four.
  const atoms = [...left, right[0], right[1], right[5], right[4]].map((a) => ({ ...a, location: [a.location[0] * 1.5, a.location[1] * 1.5, 0] as [number, number, number] }));
  const bonds = [B(0, 1, 2), B(1, 2), B(2, 3, 2), B(3, 4), B(4, 5, 2), B(5, 0), B(0, 7), B(7, 6, 2), B(6, 8), B(8, 9, 2), B(9, 5)];
  const code = cf(mol(atoms, bonds));
  assert.doesNotMatch(code, /\*6/);
  for (const name of ["1", "2"]) assert.equal(code.split(`?[${name}`).length - 1, 2, code);
}

// Wedges: chemfig's < is narrow at the atom it leaves; Octet's wedge is narrow at atoms[0], the stereocentre.
assert.equal(cf(mol([A("C", 0, 0), A("C", 1, 0)], [B(0, 1, 1, { stereo: 1 })])), "\\chemfig{<}");
assert.equal(cf(mol([A("C", 0, 0), A("C", 1, 0)], [B(1, 0, 1, { stereo: 1 })])), "\\chemfig{>}");
assert.equal(cf(mol([A("C", 0, 0), A("C", 1, 0)], [B(0, 1, 1, { stereo: 6 })])), "\\chemfig{<:}");
assert.equal(cf(mol([A("C", 0, 0), A("C", 1, 0)], [B(1, 0, 1, { display: "hollow" })])), "\\chemfig{>|}");
// Given the page's drawing, a double bond's second line goes where the page drew it (its sides are on screen, y down:
// 1 is right of the bond's first atom to its second, so below this bond, chemfig's =_).
{
  const butene = mol([A("C", 0, 0), A("C", c30, s30), A("C", 2 * c30, 0), A("C", 3 * c30, s30)], [B(0, 1), B(1, 2, 2), B(2, 3)]);
  const page = (s: number) => ({ electrons: [], scale: 1, sides: [0, s, 0] });
  assert.match(cf(butene, {}, { page: page(1) }), /=_\[:-30\]/);
  assert.match(cf(butene, {}, { page: page(-1) }), /=\^\[:-30\]/);
  assert.match(cf(butene, {}, { page: page(0) }), /=\[:-30\]/);
}
// Triple bonds, and styles chemfig has no character for, as TikZ options.
assert.equal(cf(mol([A("C", 0, 0), A("N", 1, 0)], [B(0, 1, 3)])), "\\chemfig{~N}");
assert.equal(cf(mol([A("C", 0, 0), A("C", 1, 0)], [B(0, 1, 1, { display: "bold", colour: "#ff0000" })])), "\\chemfig{-[,,,,color={rgb,255:red,255;green,0;blue,0},line width=2pt]}");
assert.match(cf(mol([A("C", 0, 0), A("C", 1, 0)], [B(0, 1, 1, { display: "wavy" })])), /^% Wavy bonds need \\usetikzlibrary\{decorations\.pathmorphing\}/);

// Lone atoms, charges and isotopes: H₂O with its H first, NH₄⁺, ¹³CH₄ (the mass number in braces, so chemfig keeps
// it with its C), and a skeletal carbanion's charge beside it.
assert.equal(cf(mol([A("O", 0, 0)], [])), "\\chemfig{H_2O}");
assert.equal(cf(mol([A("N", 0, 0, { charge: 1 })], [])), "\\chemfig{NH_4^{+}}");
assert.equal(cf(mol([A("C", 0, 0, { isotope: 13 })], [])), "\\chemfig{{^{13}C}H_4}");
assert.equal(cf(mol([A("C", 0, 0), A("C", c30, s30, { charge: -1 }), A("C", 2 * c30, 0)], [B(0, 1), B(1, 2)])), "\\chemfig{-[:30]\\charge{90:1pt[anchor=180+\\chargeangle]=$\\scriptstyle -$}{}-[:-30]}");
// A coloured label: each of its atoms takes the colour, and they stay separate atoms.
assert.equal(cf(mol([A("C", 0, 0), A("O", 1, 0, { colour: "#ff0000" })], [B(0, 1)])), "\\chemfig{-{\\color[RGB]{255,0,0}O}|{\\color[RGB]{255,0,0}H}}");
// An abbreviation reads backwards where its bond comes from the right (MeO), and meets the bond at its O.
assert.equal(cf(mol([A("O", 0, 0, { text: "OMe" }), A("C", 1, 0)], [B(0, 1)])), "\\chemfig{MeO-}");
assert.equal(cf(mol([A("C", 0, 0), A("C", 1, 0, { text: "CO2Et" })], [B(0, 1)])), "\\chemfig{-CO_2Et}");
assert.equal(cf(mol([A("C", 0, 0), A("C", 0.001, 1, { text: "CO2Et" })], [B(0, 1)])), "\\chemfig{-[:90,,,1]CO_2Et}");
assert.equal(cf(mol([A("C", 0, 0, { text: "CO2Et" }), A("C", 1, 0)], [B(0, 1)])), "\\chemfig{EtO_2C-}");
// Text that chemfig would read as code goes in braces, an atom of its own (chemfig's C|{(CH_3)_3}).
assert.equal(cf(mol([A("C", 0, 0), A("C", 1, 0, { text: "C(CH3)3" })], [B(0, 1)])), "\\chemfig{-C|{(CH_3)_3}}");

// Separate structures (a salt) keep their places: the second hangs off the first by a bond chemfig does not draw.
assert.equal(cf(mol([A("Na", 0, 0, { charge: 1 }), A("Cl", 2, 0, { charge: -1 })], [])), "\\chemfig{Na^{+}(-[,2,,,draw=none]Cl^{-})}");
// A hidden H is not written, nor its bond; nothing to draw writes nothing.
assert.equal(cf(mol([A("C", 0, 0), A("H", 1, 0, { hidden: true })], [B(0, 1)])), "\\chemfig{CH_4}");
assert.equal(cf(mol([], [])), "");

// The readable layout: an atom a line, each branch's brackets on lines of their own, indented a tab for each branch.
assert.equal(toChemfig(mol([A("C", 0, 0), A("C", c30, s30), A("O", c30, 1 + s30), A("O", 2 * c30, 0)], [B(0, 1), B(1, 2, 2), B(1, 3)])),
  "\\chemfig{\n\t-[:30]\n\t(\n\t\t=[:90]O\n\t)\n\t-[:-30]OH\n}");
assert.equal(toChemfig(mol([A("Na", 0, 0, { charge: 1 }), A("Cl", 2, 0, { charge: -1 })], [])), "\\chemfig{\n\tNa^{+}\n\t(\n\t\t-[,2,,,draw=none]Cl^{-}\n\t)\n}");
// Lone pairs (\:, or \| as bars), unpaired electrons (\.) and circled and partial charges, with chemfig's \charge on
// the atom the bonds meet. Dots sit 1pt clear of a label, 2pt from a skeletal carbon; a sign or δ touches its place
// with its near side.
{
  const acetone = (o: Partial<Atom>, c: Partial<Atom> = {}) => mol([A("C", 0, 0), A("C", c30, s30, c), A("C", 2 * c30, 0), A("O", c30, 1 + s30, o)], [B(0, 1), B(1, 2), B(1, 3, 2)]);
  assert.equal(cf(acetone({ pairs: 2 })), "\\chemfig{-[:30](=[:90]\\charge{150:1pt=\\:,30:1pt=\\:}{O})-[:-30]}");
  assert.equal(cf(acetone({ pairs: 2, bars: true })), "\\chemfig{-[:30](=[:90]\\charge{150:1pt=\\|,30:1pt=\\|}{O})-[:-30]}");
  // A pair dragged by hand keeps its place; the next takes the widest gap left.
  assert.equal(cf(acetone({ pairs: 2, angles: { pair0: 45 } })), "\\chemfig{-[:30](=[:90]\\charge{45:1pt=\\:,158:1pt=\\:}{O})-[:-30]}");
  const chain = (c: Partial<Atom>) => mol([A("C", 0, 0), A("C", c30, s30, c), A("C", 2 * c30, 0)], [B(0, 1), B(1, 2)]);
  assert.equal(cf(chain({ radical: 1 })), "\\chemfig{-[:30]\\charge{90:2pt=\\.}{}-[:-30]}", "a radical on a skeletal carbon");
  assert.equal(cf(chain({ radical: 2 })), "\\chemfig{-[:30]\\charge{-90:2pt=\\.,90:2pt=\\.}{}-[:-30]}", "a triplet's two electrons");
  assert.equal(cf(chain({ radical: 3 })), "\\chemfig{-[:30]\\charge{90:2pt=\\:}{}-[:-30]}", "a singlet's pair");
  assert.equal(cf(chain({ charge: -1, pairs: 1 })), "\\chemfig{-[:30]\\charge{90:1pt[anchor=180+\\chargeangle]=$\\scriptstyle -$,-90:2pt=\\:}{}-[:-30]}", "a carbanion's sign and pair");
  // A circled charge is a mark, not part of the label; so is a partial charge.
  const circled = cf(mol([A("C", 0, 0), A("N", c30, s30, { charge: 1, circled: true }), A("C", 2 * c30, 0), A("C", c30, 1 + s30)], [B(0, 1), B(1, 2), B(1, 3, 2)]));
  assert.match(circled, /\\charge\{45:0pt\[anchor=180\+\\chargeangle\]=\$\\scriptstyle \\oplus\$\}\{N\}/);
  assert.doesNotMatch(circled, /\^\{/);
  assert.match(cf(acetone({ partial: "-" }, { partial: "+" })), /\\charge\{45:1pt\[anchor=180\+\\chargeangle\]=\$\\scriptstyle\\delta\^\{\+\}\$\}\{\}.*\\charge\{45:0pt\[anchor=180\+\\chargeangle\]=\$\\scriptstyle\\delta\^\{-\}\$\}\{O\}/);
  // The marks of a coloured atom take its colour; the \charge itself is never in braces.
  assert.equal(cf(chain({ radical: 1, colour: "#ff0000" })), "\\chemfig{-[:30]\\charge{[.style={fill={rgb,255:red,255;green,0;blue,0}},|style={color={rgb,255:red,255;green,0;blue,0},line width=0.4pt}]90:2pt=\\.}{}-[:-30]}");
  // On a label, the marks go round the atom the bonds meet (the O of OH, the N of H2N), not the whole label.
  assert.equal(cf(mol([A("C", 0, 0), A("C", c30, s30), A("O", 2 * c30, 0, { pairs: 2 })], [B(0, 1), B(1, 2)])), "\\chemfig{-[:30]-[:-30]\\charge{-105:1pt=\\:,75:1pt=\\:}{O}H}");
  assert.match(cf(mol([A("N", 0, 0, { pairs: 1 }), A("C", c30, s30)], [B(0, 1)])), /^\\chemfig\{H_2\|\\charge\{[^}]*\}\{N\}-\[:30\]\}$/);

  // The same places as the page: the renderer's own marks (render.ts), for one-letter labels and skeletal carbons.
  const pt = 4 / 3, box: [number, number][] = [[0, -9.5], [9.6, -9.5], [9.6, 0], [0, 0]], ink = (): Ink => ({ width: 9.6, ascent: 9.5, outline: box });
  const S = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
  const angles = (code: string) => [...code.matchAll(/(-?\d+):\d+pt(?:\[[^\]]*\])?=/g)].map((x) => Number(x[1]));
  for (const m of [acetone({ pairs: 2 }), acetone({ pairs: 2, angles: { pair0: 45 } }), chain({ radical: 1 }), chain({ radical: 2 }), chain({ radical: 3 }), chain({ pairs: 1, charge: -1 }),
    mol([A("C", 0, 0), A("O", c30, s30, { pairs: 2 }), A("C", 2 * c30, 0)], [B(0, 1), B(1, 2)]), mol([A("C", 0, 0), A("O", 1, 0, { partial: "-", pairs: 2 })], [B(0, 1, 2)])]) {
    const d = render(m, S, ink), i = m.atoms.findIndex((a) => a.pairs || a.radical || a.partial);
    const page = d.electrons.filter((e) => e.atom === i).map((e) => Math.round((Math.atan2(-e.at[1] - m.atoms[i].location[1] * d.scale, e.at[0] - m.atoms[i].location[0] * d.scale) * 180) / Math.PI));
    assert.deepEqual(angles(cf(m)), page, JSON.stringify(m.atoms[i]));
  }
  // Given the page's drawing, each mark goes exactly where the page has it (its label's real outline counted); a mark
  // drawn on the atom itself gives no direction, so that one is worked out.
  const water = mol([A("C", 0, 0), A("O", 1, 0, { pairs: 2 })], [B(0, 1)]);
  const page = { scale: 10, electrons: [{ atom: 1, at: [10, -20] as [number, number], key: "pair0" }, { atom: 1, at: [10, 0] as [number, number], key: "pair1" }] };
  assert.match(cf(water, {}, { page }), /\\charge\{90:1pt=\\:,(-?\d+):1pt=\\:\}\{O\}/);
  assert.notEqual(cf(water, {}, { page }).match(/\\charge\{90:1pt=\\:,(-?\d+)/)![1], "0");
}

// A label's look: its own bold, italic and underline go on all of it (H, counts and sign too), in maths alphabets that
// shrink in a script; bold italic needs no package. A written label's runs style their characters, and a part raised
// or lowered by hand takes that script and stays with the unit before it.
{
  const end = (more: Partial<Atom>, label = "O") => cf(mol([A("C", 0, 0), A("C", c30, s30), A(label, 2 * c30, 0, more)], [B(0, 1), B(1, 2)]));
  assert.equal(end({ bold: true }), "\\chemfig{-[:30]-[:-30]{\\mathbf{O}}|{\\mathbf{H}}}");
  assert.equal(end({ italic: true }), "\\chemfig{-[:30]-[:-30]{\\mathit{O}}|{\\mathit{H}}}");
  assert.equal(end({ underline: true }), "\\chemfig{-[:30]-[:-30]{\\underline{O}}|{\\underline{H}}}");
  assert.equal(end({ bold: true, italic: true }), "\\chemfig{-[:30]-[:-30]{\\mbox{\\boldmath$\\mathit{O}$}}|{\\mbox{\\boldmath$\\mathit{H}$}}}");
  assert.equal(end({ bold: true, charge: 1 }, "N"), "\\chemfig{-[:30]-[:-30]{\\mathbf{N}}|{\\mathbf{H}_{\\mathbf{3}}^{\\mathbf{+}}}}");
  assert.equal(end({ italic: true, isotope: 13 }, "C"), "\\chemfig{-[:30]-[:-30]{^{\\mathit{13}}\\mathit{C}}|{\\mathit{H}_{\\mathit{3}}}}");
  assert.equal(end({ bold: true, text: "OMe" }), "\\chemfig{-[:30]-[:-30]{\\mathbf{O}}|{\\mathbf{Me}}}");
  // A bold label keeps its lone pairs and its colour.
  assert.match(end({ bold: true, pairs: 2 }), /\\charge\{[^}]*\}\{\{\\mathbf\{O\}\}\}\|\{\\mathbf\{H\}\}/);
  assert.equal(end({ bold: true, colour: "#ff0000" }), "\\chemfig{-[:30]-[:-30]{\\color[RGB]{255,0,0}{\\mathbf{O}}}|{\\color[RGB]{255,0,0}{\\mathbf{H}}}}");
  // Runs: part of a written label styled as it was typed.
  assert.equal(end({ text: "NHBoc", runs: [{ text: "NH" }, { text: "Boc", bold: true }] }, "N"), "\\chemfig{-[:30]-[:-30]NH|{\\mathbf{Boc}}}");
  assert.equal(end({ text: "CO2Et", runs: [{ text: "CO2" }, { text: "Et", italic: true }] }, "C"), "\\chemfig{-[:30]-[:-30]CO_2|{\\mathit{Et}}}");
  assert.equal(end({ text: "OTf", runs: [{ text: "O" }, { text: "T", underline: true }, { text: "f" }] }), "\\chemfig{-[:30]-[:-30]O|{\\underline{T}f}}");
  const iron = { text: "Fe(III)", runs: [{ text: "Fe" }, { text: "(III)", script: "super" as const }] };
  assert.equal(end(iron, "Fe"), "\\chemfig{-[:30]-[:-30]Fe^{(III)}}");
  assert.equal(cf(mol([A("Fe", 0, 0, iron), A("C", c30, s30)], [B(0, 1)])), "\\chemfig{Fe^{(III)}-[:30]}", "the raised part stays after Fe when the label reads backwards");
  // Runs that do not spell the label's text (left from an edit) are not used.
  assert.equal(end({ text: "OMe", runs: [{ text: "OEt", bold: true }] }), "\\chemfig{-[:30]-[:-30]OMe}");
  // A count in bold italic shrinks with its script.
  assert.match(end({ text: "CH2CH3", bold: true, italic: true }, "C"), /_\{\\mbox\{\\boldmath\$\\scriptstyle\\mathit\{2\}\$\}\}/);
}

// Names under structures (captions kept under their atoms) with \chemname*, each under its own structure as on the
// page: lines joined by \\, names under one structure in the page's order, runs in their looks, TeX's characters
// escaped.
{
  const acid = (dx = 0) => [A("C", dx, 0), A("C", dx + c30, s30), A("O", dx + c30, 1 + s30), A("O", dx + 2 * c30, 0)];
  const named = (captions: Partial<NonNullable<Mol["captions"]>[number]>[], atoms = acid(), bonds = [B(0, 1), B(1, 2, 2), B(1, 3)]): Mol =>
    ({ atoms, bonds, captions: captions.map((c, k) => ({ id: k + 1, text: "", x: 0, y: -2, under: [0, 1, 2, 3], ...c })) });
  const acetic = "\\chemfig{-[:30](=[:90]O)-[:-30]OH}";
  assert.equal(cf(named([{ text: "Acetic acid" }])), `\\chemname*{${acetic}}{Acetic acid}`);
  assert.equal(cf(named([{ id: 6, text: "acetic acid" }, { id: 5, text: "1", bold: true }])), `\\chemname*{${acetic}}{\\textbf{1}\\\\acetic acid}`);
  assert.equal(cf(named([{ text: "(S)-tert-butyl\n50% yield", runs: [{ text: "(" }, { text: "S", italic: true }, { text: ")-" }, { text: "tert", italic: true }, { text: "-butyl\n50% yield" }] }])),
    `\\chemname*{${acetic}}{(\\textit{S})-\\textit{tert}-butyl\\\\50\\% yield}`);
  assert.equal(cf(named([{ text: "red", colour: "#ff0000", underline: true }, { text: "x^2", runs: [{ text: "x" }, { text: "2", script: "super" }] }])),
    `\\chemname*{${acetic}}{\\textcolor[RGB]{255,0,0}{\\underline{red}}\\\\x\\textsuperscript{2}}`);
  assert.equal(cf(named([{ text: "a_b & c#" }])), `\\chemname*{${acetic}}{a\\_b \\& c\\#}`);
  // One name over two ions keeps them in one \chemfig.
  assert.equal(cf(named([{ text: "Sodium chloride", under: [0, 1] }], [A("Na", 0, 0, { charge: 1 }), A("Cl", 2, 0, { charge: -1 })], [])), "\\chemname*{\\chemfig{Na^{+}(-[,2,,,draw=none]Cl^{-})}}{Sodium chloride}");
  // Names on two structures: each its own \chemfig, left to right, and a structure with no name stands on its own.
  assert.equal(cf(named([{ text: "A" }, { text: "2", bold: true, under: [4, 5, 6, 7] }], [...acid(), ...acid(4), A("O", 8, 0)], [B(0, 1), B(1, 2, 2), B(1, 3), B(4, 5), B(5, 6, 2), B(5, 7)])),
    `\\chemname*{${acetic}}{A}\\qquad\\chemname*{${acetic}}{\\textbf{2}}\\qquad\\chemfig{H_2O}`);
  // With no names, separate structures stay in one \chemfig, in their places. A caption not under a structure is not a name.
  assert.equal(cf(named([{ text: "free text", under: undefined }])), acetic);
  assert.equal(toChemfig(named([{ text: "Acetic acid" }])), "\\chemname*{\\chemfig{\n\t-[:30]\n\t(\n\t\t=[:90]O\n\t)\n\t-[:-30]OH\n}}{Acetic acid}");
}

// Characters beyond ASCII in LaTeX's own forms, so pdfLaTeX sets them with what chemfig loads: Greek and signs in
// maths in a label and in text in a name, script digits as one script, accented letters as they are in text (in an
// \mbox in maths). Anything else stays, and a comment names it.
{
  const end = (text: string, name?: string) => cf({ atoms: [A("C", 0, 0), A("C", c30, s30), A("C", 2 * c30, 0, { text })], bonds: [B(0, 1), B(1, 2)], ...(name ? { captions: [{ id: 1, text: name, x: 0, y: -2, under: [0, 1, 2] }] } : {}) });
  assert.equal(end("Rδ·OTf"), "\\chemfig{-[:30]-[:-30]R|{\\delta}|{\\cdot}OTf}");
  assert.equal(end("R′"), "\\chemfig{-[:30]-[:-30]R|{'}}");
  assert.equal(end("Né"), "\\chemfig{-[:30]-[:-30]N|{\\mbox{é}}}");
  assert.match(end("R", "α-pinene, 5 °C, ±2 ‰ – Δ"), /\{\$\\alpha\$-pinene, 5 \\textdegree\{\}C, \$\\pm\$2 \\textperthousand\{\} -- \$\\Delta\$\}$/);
  assert.match(end("R", "H₂O ¹³C, 3 Å, β′"), /\{H\\textsubscript\{2\}O \\textsuperscript\{13\}C, 3 \\AA\{\}, \$\\beta'\$\}$/);
  assert.match(end("R", "Ångström, Müller"), /\{\\AA\{\}ngström, Müller\}$/);
  assert.match(end("R", "5$α"), /\{5\\\$\$\\alpha\$\}$/, "an escaped dollar stays apart from the maths after it");
  // Raised digits in a label are one script (_{1}_{3} would be an error).
  assert.match(cf(mol([A("C", 0, 0), A("C", 1, 0, { text: "R¹³" })], [B(0, 1)])), /\^\{13\}/);
  const star = end("R★");
  assert.match(star, /^% pdfLaTeX cannot set ★: replace it, or compile with LuaLaTeX or XeLaTeX and a font that has it\.\n\\chemfig\{/);
  assert.doesNotMatch(end("Né", "Müller"), /^%/, "accented letters need no comment");
}

// A long chain (here 20,000 atoms, with a branch on every tenth) is written without running out of stack.
{
  const n = 20000, atoms = Array.from({ length: n }, (_, k) => A("C", k * c30, k % 2 ? s30 : 0)), bonds = Array.from({ length: n - 1 }, (_, k) => B(k, k + 1));
  for (let k = 0; k < n; k += 10) { atoms.push(A("O", k * c30, (k % 2 ? s30 : 0) + 1)); bonds.push(B(k, atoms.length - 1)); }
  const code = toChemfig(mol(atoms, bonds), {}, { compact: true });
  assert.equal(code.split("OH").length - 1, n / 10);
}

// What Copy As and Export say: the parts the code leaves out, by kind, and the parts it draws differently. Nothing
// when the code shows it all; a name under a structure and a caption read as chemistry are in the code.
{
  const base = (more: Partial<Mol> = {}, a: Partial<Atom> = {}): Mol => ({ atoms: [A("C", 0, 0, a), A("C", 1, 0)], bonds: [B(0, 1)], ...more });
  const arrow = (id: number, kind: NonNullable<Mol["arrows"]>[number]["kind"]) => ({ id, kind, from: [0, 1] as [number, number], to: [1, 1] as [number, number] });
  const caption = (id: number, text: string, more = {}) => ({ id, text, x: 0, y: -1, ...more });
  assert.equal(chemfigNotice("Copied", base(), true), undefined);
  // Curved arrows, lines and lone reaction arrows are in the code (\chemmove); other arrows are not yet.
  assert.equal(chemfigNotice("Copied", base({ arrows: [arrow(1, "curved"), arrow(2, "fishhook"), arrow(3, "line")] }), true), undefined);
  assert.equal(chemfigNotice("Copied", base({ arrows: [arrow(1, "orbital")] }), true), "Copied without 1 orbital: Octet cannot export it to chemfig yet.");
  assert.equal(chemfigNotice("Saved a.tex", base({ arrows: [arrow(1, "equilibrium"), arrow(2, "dipole")], shapes: [{ id: 3, kind: "box", from: [0, 0], to: [1, 1] }] }), true),
    "Saved a.tex without 2 arrows and 1 shape: Octet cannot export them to chemfig yet.");
  assert.equal(chemfigNotice("Copied", base({ captions: [caption(4, "heat")] }), true), "Copied without text: Octet cannot export it to chemfig yet.");
  assert.equal(chemfigNotice("Copied", base({ captions: [caption(4, "NaCl"), caption(5, "Name", { under: [0, 1] })] }), true), undefined);
  assert.equal(chemfigNotice("Copied", base({ captions: [caption(4, "NaCl")] }), false), "Copied without text: Octet cannot export it to chemfig yet.", "with Interpret Chemically off, NaCl is text");
  assert.equal(chemfigNotice("Copied", base({ bonds: [B(0, 1, QUADRUPLE)] }), true), "Copied. Octet exports 1 quadruple bond to chemfig differently.");
  assert.equal(chemfigNotice("Copied", base({ bonds: [B(0, 1, QUADRUPLE)] }, { cip: true, halo: "#ff0000" }), true),
    "Copied without 1 highlight: Octet cannot export it to chemfig yet. Octet exports 1 quadruple bond to chemfig differently.");
  // A hidden atom's marks are not in the drawing either.
  assert.equal(chemfigNotice("Copied", base({}, { hidden: true, halo: "#ff0000" }), true), undefined);
}

// Reactions as chemfig's schemes: the row in order (each structure a compound, named when it has names, \+ for a
// plus sign), each arrow as its kind with its conditions above and below (stacked), its angle, and its length from the
// page. Structures in no reaction come after, together.
{
  const atoms = [A("C", 0, 0), A("C", c30, s30), A("O", 2 * c30, 0), A("S", 4, 0, { text: "H2SO4" }), A("C", 10, 0), A("C", 10 + c30, s30),
    A("C", 6.5, 1.5), A("C", 6.5 + c30, 2), A("C", 10, -5), A("C", 10 + c30, -4.5), A("Br", 10 + 2 * c30, -5), A("O", 20, 0)];
  const m: Mol = {
    atoms, bonds: [B(0, 1), B(1, 2), B(4, 5, 2), B(6, 7), B(8, 9), B(9, 10)],
    captions: [{ id: 1, text: "+", x: 3, y: 0 }, { id: 2, text: "heat", x: 7, y: 1 }, { id: 3, text: "THF\n0 °C", x: 7, y: -1 }, { id: 4, text: "98%", x: 11, y: -2.5 }, { id: 5, text: "1", bold: true, x: 0, y: -1, under: [0, 1, 2] }],
    arrows: [{ id: 10, kind: "reaction", from: [5.5, 0], to: [8.5, 0] }, { id: 11, kind: "equilibrium", from: [10.4, -1.5], to: [10.4, -3.5] }],
  };
  const schemes: Scheme[] = [{
    row: [{ atoms: [0, 1, 2] }, { plus: 1 }, { atoms: [3] }, { arrow: 10 }, { atoms: [4, 5] }, { arrow: 11 }, { atoms: [8, 9, 10] }],
    above: new Map([[10, [{ atoms: [6, 7] }, { caption: 2 }]]]), below: new Map([[10, [{ caption: 3 }]], [11, [{ caption: 4 }]]]),
  }];
  const compact = cf(m, {}, { schemes }), readable = toChemfig(m, {}, { schemes });
  assert.equal(compact, "\\schemestart \\chemname*{\\chemfig{-[:30]-[:-30]OH}}{\\textbf{1}}\\+\\chemfig{H_2SO_4}"
    + "\\arrow{->[{\\shortstack{\\chemfig{-[:30]}\\\\heat}}][{\\shortstack{THF\\\\0 \\textdegree{}C}}]}[,1.8]\\chemfig{=[:30]}"
    + "\\arrow{<=>[][{98\\%}]}[-90,1.2]\\chemfig{-[:30]-[:-30]Br}\\schemestop\n\n\\chemfig{H_2O}");
  assert.equal(flat(readable), flat(compact));
  assert.match(readable, /^\\schemestart%\n\t\\chemname\*\{\\chemfig\{\n\t\t-\[:30\]/, "a piece a line, each ended by %, the code indented a tab more");
  // What is in a scheme is not reported as left out; an arrow kind chemfig has none of is reported as written differently.
  assert.equal(chemfigNotice("Copied", m, true, schemes), undefined);
  const retro = { ...m, arrows: [{ ...m.arrows![0], kind: "retro" as const }, m.arrows![1]], captions: [...m.captions!, { id: 6, text: "note", x: 0, y: 5 }] };
  assert.equal(chemfigNotice("Copied", retro, true, schemes), "Copied without text: Octet cannot export it to chemfig yet. Octet exports 1 retrosynthetic arrow to chemfig differently.");
  assert.equal(chemfigNotice("Copied", m, true), "Copied without 1 arrow and text: Octet cannot export them to chemfig yet.", "without schemes, the reaction arrow is drawn (\chemmove) and the equilibrium left out");
  // Conditions on an arrow are formulas, as the page draws them.
  const onArrow = { ...m, captions: [...m.captions!, { id: 7, text: "H2SO4, heat", x: 7, y: 2, on: { arrow: 10, side: "above" as const } }] };
  assert.match(cf(onArrow, {}, { schemes: [{ ...schemes[0], above: new Map([[10, [{ caption: 7 }]]]) }] }), /\\arrow\{->\[\{H\\textsubscript\{2\}SO\\textsubscript\{4\}, heat\}\]/);
}

// Brackets round atoms with \polymerdelim: nodes at the middles of its sides and empty atoms at its corners, placed by
// bonds chemfig does not draw from the first atom; the kind, height, one side, turn, usage label and mark as on the
// page; a comment that it needs two runs. A bracket round nothing is not written, and the notice says so.
{
  const fe = (sh: Partial<NonNullable<Mol["shapes"]>[number]>): Mol => ({ atoms: [A("Fe", 0, 0)], bonds: [], shapes: [{ id: 8, kind: "brackets", from: [-0.7, -0.8], to: [0.7, 0.8], ...sh }] });
  const code = cf(fe({ mark: "3+" })), name = /@\{(oct\w+?)o\}/.exec(code)![1];
  assert.equal(code, "% Brackets (\\polymerdelim) need two LaTeX runs to be in place.\n"
    + `\\chemfig{Fe(-[:180,0.7,,,draw=none]@{${name}o})(-[:0,0.7,,,draw=none]@{${name}c})(-[:-131,1.06,,,draw=none])(-[:49,1.06,,,draw=none])(-[:35,1.22,,,draw=none]{\\scriptstyle 3+})}`
    + `\\polymerdelim[delimiters={[]}, height=2.4em, depth=2.4em, indice={}]{${name}o}{${name}c}`);
  assert.match(name, /^oct\w+8$/, "the name carries the drawing's hash and the bracket's id");
  assert.match(cf(fe({ kind: "parens", side: "right", polymer: { usage: "sru" } })), /delimiters=\{\.\)\}, height=2\.4em, depth=2\.4em, indice=\{n\}/);
  assert.match(cf(fe({ kind: "braces", polymer: { usage: "mult", label: "3" } })), /delimiters=\{\\\{\\\}\}.*indice=\{3\}/);
  assert.match(cf(fe({ angle: 30 })), /h align=false, rotate=30\]/);
  // A drawing moved elsewhere gets other names, so two in one document do not clash.
  const moved = cf({ ...fe({}), atoms: [A("Fe", 5, 0)], shapes: [{ id: 8, kind: "brackets", from: [4.3, -0.8], to: [5.7, 0.8] }] });
  assert.doesNotMatch(moved, new RegExp(name));
  assert.equal(chemfigNotice("Copied", fe({}), true), undefined);
  const empty: Mol = { ...fe({}), shapes: [{ id: 8, kind: "brackets", from: [3, 3], to: [4, 4] }] };
  assert.equal(chemfigNotice("Copied", empty, true), "Copied without 1 bracket: Octet cannot export it to chemfig yet.");
  assert.doesNotMatch(cf(empty), /polymerdelim/);
}

// Atom numbers and map numbers, as small text beside the atom with \charge: an atom number in a gap between its
// bonds, out of its ring, clear of its marks; a map number where the page drew it, else after a label that reads one
// way (on the label's last letter, after the H of OH) or on the atom's open side. Neither is reported as left out.
// As \charge's marks are not in the picture's box, empty atoms at the corners the numbers need keep them in a cropped
// figure: only on a side they reach past the structure.
{
  const chain = mol(Array.from({ length: 3 }, (_, k) => A("C", k * c30, k % 2 ? s30 : 0, { number: String(k + 1) })), [B(0, 1), B(1, 2)]);
  assert.equal(cf(chain), "\\chemfig{\\charge{-150:9pt[anchor=180+\\chargeangle]=$\\scriptstyle 1$}{}(-[:-150,0.53,,,draw=none])(-[:25,2.43,,,draw=none])"
    + "-[:30]\\charge{90:9pt[anchor=180+\\chargeangle]=$\\scriptstyle 2$}{}-[:-30]\\charge{-30:9pt[anchor=180+\\chargeangle]=$\\scriptstyle 3$}{}}");
  // In a ring, a number faces out of the ring.
  const hex = ring(6, 0, 0, 90).map((a, k) => (k === 0 ? { ...a, number: "1" } : a));
  assert.match(cf(mol(hex, hex.map((_, k) => B(k, (k + 1) % 6)))), /\\charge\{90:9pt\[anchor=180\+\\chargeangle\]=\$\\scriptstyle 1\$\}\{\}/);
  const mapped = mol([A("C", 0, 0, { map: 1 }), A("C", c30, s30, { map: 2 }), A("O", 2 * c30, 0, { map: 3 })], [B(0, 1), B(1, 2)]);
  assert.equal(cf(mapped), "\\chemfig{\\charge{-150:3pt[anchor=180+\\chargeangle]=$\\scriptstyle 1$}{}(-[:19,2.62,,,draw=none])-[:30]\\charge{90:3pt[anchor=180+\\chargeangle]=$\\scriptstyle 2$}{}"
    + "-[:-30]O|\\charge{0:1pt[anchor=180+\\chargeangle]=$\\scriptstyle 3$}{H}}");
  // Where the page drew a map number wins (here straight below the O).
  const page = { scale: 10, electrons: [], maps: [{ atom: 2, text: "3", at: [2 * c30 * 10, 8] as [number, number], size: 7, h: 5 }] };
  assert.match(cf(mapped, {}, { page }), /\\charge\{-90:1pt\[anchor=180\+\\chargeangle\]=\$\\scriptstyle 3\$\}\{O\}H/);
  assert.equal(chemfigNotice("Copied", chain, true), undefined);
  assert.equal(chemfigNotice("Copied", mapped, true), undefined);
}

// Show Stereochemistry: R, S, r and s beside the atom as small text (\charge, as an atom number, after it in the next
// clear gap), E and Z half a bond out from the double bond's middle on the side with fewer neighbours, hung off an end
// of the bond by a bond chemfig does not draw. The letter italic, the parentheses (Settings) upright. Only on atoms of a
// structure with it on (cip), as on the page.
{
  const centre = (more: Partial<Atom> = {}) => mol([A("C", 0, 0, more), A("C", c30, s30), A("O", 0, -1), A("N", -c30, s30)], [B(0, 1), B(0, 2, 1, { stereo: 1 }), B(0, 3)]);
  const rs = { atoms: ["R", undefined, undefined, undefined], bonds: [undefined, undefined, undefined], parens: true };
  const st = (m: Mol, stereo: typeof rs) => cf(m, {}, { stereo });
  assert.equal(st(centre({ cip: true }), rs), "\\chemfig{H_2N-[:-30]\\charge{90:9pt[anchor=180+\\chargeangle]=$\\scriptstyle (\\mathit{R})$}{}(<[:-90,,,1]OH)-[:30]}");
  assert.equal(st(centre({ cip: true }), { ...rs, atoms: ["s"], parens: false }), "\\chemfig{H_2N-[:-30]\\charge{90:9pt[anchor=180+\\chargeangle]=$\\scriptstyle \\mathit{s}$}{}(<[:-90,,,1]OH)-[:30]}");
  // With Show Stereochemistry off for the structure, nothing.
  assert.equal(st(centre(), rs), cf(centre()));
  // With the atom's number too: the number first, the label in the next clear gap.
  assert.equal(st(centre({ cip: true, number: "2" }), rs), "\\chemfig{H_2N-[:-30]\\charge{90:9pt[anchor=180+\\chargeangle]=$\\scriptstyle 2$,-30:9pt[anchor=180+\\chargeangle]=$\\scriptstyle (\\mathit{R})$}{}(<[:-90,,,1]OH)-[:30]}");
  // (E)-but-2-ene: the E above the middle of its double bond, away from the two methyls below it, in the bond's colour.
  const butene = mol([A("C", 0, 0, { cip: true }), A("C", c30, s30, { cip: true }), A("C", 2 * c30, 0, { cip: true }), A("C", 3 * c30, s30, { cip: true })], [B(0, 1), B(1, 2, 2, { colour: "#ff0000" }), B(2, 3)]);
  assert.equal(st(butene, { atoms: [], bonds: [undefined, "E", undefined], parens: true }), "\\chemfig{-[:30](-[:15,0.71,,,draw=none]{\\color[RGB]{255,0,0}\\scriptstyle (\\mathit{E})})=_[:-30,,,,color={rgb,255:red,255;green,0;blue,0}]-[:30]}");
  // The E of an imine hangs off its N, a label of two atoms (NH): it leaves the N, named.
  const imine = mol([A("C", 0, 0, { cip: true }), A("C", c30, s30, { cip: true }), A("N", 2 * c30, 0, { cip: true })], [B(0, 1), B(2, 1, 2)]);
  assert.match(cf(imine, {}, { stereo: { atoms: [], bonds: [undefined, "E"], parens: true } }), /N\|?H\(-\[:-?[\d.]+,0\.\d+,1,,draw=none\]\{\\scriptstyle \(\\mathit\{E\}\)\}\)/);
  // Labels are written, so not reported as left out.
  assert.equal(chemfigNotice("Copied", centre({ cip: true }), true), undefined);
}

// Arrows not in a scheme, with chemfig's \chemmove: each end (and a curve's middle) a node placed from the atom nearest
// it by a bond chemfig does not draw, and the arrow drawn between them after the code. A curved arrow is the page's
// circular arc in two halves (bend left or right as the page bends it, looseness for a circle); heads chemfig's CF, a
// fishhook's its harpoon, a line's none (\chemmove's own tip is CF). Two LaTeX runs, as the code says.
{
  const acetone = [A("C", 0, 0), A("O", 0, 1), A("C", -c30, -0.5), A("C", c30, -0.5)], bonds = [B(0, 1, 2), B(0, 2), B(0, 3)];
  const arrows: NonNullable<Mol["arrows"]> = [
    { id: 1, kind: "curved", from: [0.08, 0.5], to: [0.35, 1.1], bend: -0.4 },
    { id: 2, kind: "fishhook", from: [-1.2, 0.6], to: [-0.25, 1.1], bend: 0.25, colour: "#ff0000" },
    { id: 3, kind: "line", from: [1, 0.5], to: [2, 0.5], style: "dashed" },
  ];
  const code = cf({ ...mol(acetone, bonds), arrows }), n = /@\{(oct\w{4}a)1s\}/.exec(code)![1]; // the drawing's hash and a, then the arrow's id
  assert.equal(code.replaceAll(n, "N"), "% Arrows (\\chemmove) need two LaTeX runs to be in place.\n\\chemfig{(-[:106.89,1.15,,,draw=none]@{N2s})-[:30](=[:90]O(-[:15.95,0.36,,,draw=none]@{N1e})(-[:-34.09,0.55,,,draw=none]@{N1m})(-[:158.2,0.27,,,draw=none]@{N2e})(-[:174.12,0.85,,,draw=none]@{N2m}))(-[:80.91,0.51,,,draw=none]@{N1s})-[:-30](-[:82.37,1.01,,,draw=none]@{N3s})(-[:41.41,1.51,,,draw=none]@{N3e})}"
    + "\\chemmove{\\draw[-{CF}](N1s)to[bend right=38.66,looseness=0.96](N1m)to[bend right=38.66,looseness=0.96](N1e);"
    + "\\draw[-{CF[harpoon]},color={rgb,255:red,255;green,0;blue,0}](N2s)to[bend left=26.57,looseness=0.9](N2m)to[bend left=26.57,looseness=0.9](N2e);\\draw[-,dashed](N3s)--(N3e);}");
  assert.equal(chemfigNotice("Copied", { ...mol(acetone, bonds), arrows }, true), undefined);
  // A lone reaction arrow, bold; a resonance arrow with hollow heads; a wavy line, which says what it needs.
  const more = cf({ ...mol(acetone, bonds), arrows: [{ id: 4, kind: "reaction", from: [1.5, 0], to: [3, 0], style: "bold" }, { id: 5, kind: "resonance", from: [1.5, -1], to: [3, -1], head: "hollow" }, { id: 6, kind: "line", from: [-2, 1], to: [-1, 1], style: "wavy" }] });
  assert.match(more, /^% Wavy arrows need \\usetikzlibrary\{decorations\.pathmorphing\} in the preamble\.\n% Arrows \(\\chemmove\) need two LaTeX runs/);
  assert.match(more, /\\draw\[-\{CF\},line width=0\.8pt\]\(\w+4s\)--\(\w+4e\);\\draw\[\{CF\[open\]\}-\{CF\[open\]\}\]\(\w+5s\)--\(\w+5e\);\\draw\[-,decorate,/);
  // Brackets and arrows together: one comment for both.
  assert.match(cf({ atoms: [A("Fe", 0, 0)], bonds: [], shapes: [{ id: 8, kind: "brackets", from: [-0.7, -0.8], to: [0.7, 0.8] }], arrows: [arrows[0]] }), /^% Brackets \(\\polymerdelim\) and arrows \(\\chemmove\) need two LaTeX runs/);
  // The two TikZ halves lie on the page's circle (render.ts arrowPath's), each way round, for sweeps up to 270°: within
  // a thousandth of a bond up to 180°, 0.005 at 270°.
  for (const sweep of [20, 90, 120, 180, 270]) for (const sign of [1, -1]) {
    const a: NonNullable<Mol["arrows"]>[number] = { id: 1, kind: "curved", from: [0.3, -0.2], to: [1.7, 0.6], bend: sign * sweepBend(sweep) };
    const h = arcHalf(a.bend!), m = bendPoint(a), arc = arrowPath(a, 1000).map(([x, y]): [number, number] => [x / 1000, -y / 1000]);
    // TikZ's to[bend, looseness]: a cubic whose control points sit 0.3915 × looseness × the chord off each end, at bend.
    const half = (p: [number, number], q: [number, number]) => {
      const d = [q[0] - p[0], q[1] - p[1]], t = Math.atan2(d[1], d[0]), b = ((sign * h.bend) * Math.PI) / 180, k = 0.3915 * h.looseness * Math.hypot(d[0], d[1]);
      const c1 = [p[0] + k * Math.cos(t + b), p[1] + k * Math.sin(t + b)], c2 = [q[0] - k * Math.cos(t - b), q[1] - k * Math.sin(t - b)];
      return (u: number) => [0, 1].map((x) => (1 - u) ** 3 * p[x] + 3 * (1 - u) ** 2 * u * c1[x] + 3 * (1 - u) * u * u * c2[x] + u ** 3 * q[x]);
    };
    // The circle through Octet's ends and middle, which its samples lie on.
    const [S, M, T] = [a.from, m, a.to], dd = 2 * (S[0] * (M[1] - T[1]) + M[0] * (T[1] - S[1]) + T[0] * (S[1] - M[1])), sq = (q: number[]) => q[0] ** 2 + q[1] ** 2;
    const O = [(sq(S) * (M[1] - T[1]) + sq(M) * (T[1] - S[1]) + sq(T) * (S[1] - M[1])) / dd, (sq(S) * (T[0] - M[0]) + sq(M) * (S[0] - T[0]) + sq(T) * (M[0] - S[0])) / dd], r = Math.hypot(S[0] - O[0], S[1] - O[1]);
    for (const p of arc) assert.ok(Math.abs(Math.hypot(p[0] - O[0], p[1] - O[1]) - r) < 1e-6);
    for (const c of [half(a.from, m), half(m, a.to)]) for (let k = 0; k <= 50; k++) {
      const q = c(k / 50);
      assert.ok(Math.abs(Math.hypot(q[0] - O[0], q[1] - O[1]) - r) < (sweep > 180 ? 0.005 : 0.001), `sweep ${sweep}`);
    }
    // And on the page's side of the chord: the first half's middle is near Octet's arc.
    const q = half(a.from, m)(0.5);
    assert.ok(Math.min(...arc.map((p) => Math.hypot(p[0] - q[0], p[1] - q[1]))) < 0.2, `sweep ${sweep} the other way round`);
  }
  // An arrow between two compounds of a scheme: each end's node is in its own structure's \chemfig.
  const two: Mol = { atoms: [A("C", 0, 0), A("C", c30, s30), A("C", 5, 0), A("C", 5 + c30, s30)], bonds: [B(0, 1), B(2, 3)], arrows: [{ id: 9, kind: "reaction", from: [2, 0], to: [4, 0] }, { id: 7, kind: "curved", from: [c30, 0.8], to: [5, 0.6], bend: 0.3 }] };
  const across = cf(two, {}, { schemes: [{ row: [{ atoms: [0, 1] }, { arrow: 9 }, { atoms: [2, 3] }], above: new Map(), below: new Map() }] });
  const pieces = across.split("\\chemfig{");
  assert.equal(pieces.length, 3, across);
  assert.match(pieces[1], /@\{oct\w+a7s\}/);
  assert.match(pieces[2], /@\{oct\w+a7e\}/);
  assert.match(across, /\\schemestop\\chemmove\{\\draw\[-\{CF\}\]\(oct\w+a7s\)to\[bend left=/);
  // With no structure there is nothing to place the nodes on: no code, and the notice says the arrow is left out.
  const bare: Mol = { atoms: [], bonds: [], arrows: [arrows[0]] };
  assert.equal(cf(bare), "");
  assert.equal(chemfigNotice("Copied", bare, true), "Copied without 1 curved arrow: Octet cannot export it to chemfig yet.");
}

// Every code written: both layouts hold the same code (the readable one only adds line breaks and tabs, which chemfig
// ignores); every bracket and brace is closed; and no number came out as NaN, Infinity or undefined.
for (const [m, style, options] of written) {
  const compact = toChemfig(m, style, { ...options, compact: true });
  assert.equal(flat(toChemfig(m, style, { ...options, compact: false })), flat(compact));
  let depth = 0;
  // (Escaped braces, and \polymerdelim's delimiters, which are the bracket's own characters, do not count.)
  for (const ch of compact.replace(/\\[{}]/g, "").replace(/delimiters=\{[^}]*\}/g, "")) { depth += "({[".includes(ch) ? 1 : ")}]".includes(ch) ? -1 : 0; assert.ok(depth >= 0, compact); }
  assert.equal(depth, 0, compact);
  assert.doesNotMatch(compact, /NaN|Infinity|undefined/, compact);
}
console.log("chemfig.check: all pass");
