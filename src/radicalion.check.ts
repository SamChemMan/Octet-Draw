// Run: node src/radicalion.check.ts. Issue 163: a radical cation or radical anion (one unpaired electron and a charge
// on one atom) draws as one unit beside its atom, its dot and then its sign (•+, •−), as ChemDraw's Radical Cation and
// Radical Anion symbols do. The dot sits level with the middle of the sign, just before it. This holds on a skeletal
// carbon and on a label, from the Symbols tool and from a ChemDraw file, and the unit goes to CDXML as one symbol.
import assert from "node:assert/strict";
import { render, type Atom, type Bond, type Ink, type Mol } from "./render.ts";
import { addSymbol } from "./edit.ts";
import { fromCdxml, parseXml, toCdxml, type Xml } from "./cdxml.ts";
import { cdxToXml, xmlToCdx } from "./cdx.ts";
import { readV3000, writeV3000 } from "./molv3.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";

type P = [number, number];
const pt = 4 / 3;
const S = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
// Every glyph is a 9.6 x 9.5 px box, as render.check.ts measures text.
const box: P[] = [];
for (let i = 0; i <= 40; i++) { const f = i / 40; box.push([9.6 * f, 0], [9.6 * f, -9.5], [0, -9.5 * f], [9.6, -9.5 * f]); }
const ink = (): Ink => ({ width: 9.6, ascent: 9.5, outline: box });
const SUB = 0.75;
const A = (label: string, x: number, y: number, more: Partial<Atom> = {}): Atom => ({ label, location: [x, y, 0], ...more });
const b = (i: number, j: number): Bond => ({ type: 1, atoms: [i, j] });

// The issue's drawing: a zigzag chain with a radical anion and a radical cation at each end and on the bends, then a
// labelled radical cation (Me3N•+) and a labelled radical anion (a lone O•−).
const zig = [0, 1, 2, 3, 4, 5].map((k) => A("C", k * 0.866, k % 2 ? 0.5 : 0));
const ions: Record<number, number> = { 0: -1, 1: -1, 3: -1, 4: -1, 5: 1 };
zig.forEach((a, k) => { if (ions[k]) Object.assign(a, { charge: ions[k], radical: 1 }); });
const mol: Mol = {
  atoms: [...zig, A("N", 0, -3, { charge: 1, radical: 1 }), A("C", -0.866, -3.5), A("C", 0.866, -3.5), A("C", 0, -2), A("O", 4, -3, { charge: -1, radical: 1 })],
  bonds: [b(0, 1), b(1, 2), b(2, 3), b(3, 4), b(4, 5), b(6, 7), b(6, 8), b(6, 9)],
};
const d = render(mol, S, ink, S.bond);
// Each sign is drawn as a label at 75% (its ink a 9.6 x 9.5 box at that size); its atom is the nearest charged atom.
const signs = d.labels.filter((l) => l.text === "+" || l.text === "–");
const atomAt = (i: number): P => [mol.atoms[i].location[0] * S.bond, -mol.atoms[i].location[1] * S.bond];
const charged = mol.atoms.flatMap((a, i) => (a.charge ? [i] : []));
const near = (q: P) => charged.reduce((best, i) => (Math.hypot(q[0] - atomAt(i)[0], q[1] - atomAt(i)[1]) < Math.hypot(q[0] - atomAt(best)[0], q[1] - atomAt(best)[1]) ? i : best));
assert.equal(signs.length, charged.length, "one sign for each radical ion");
for (const i of charged) {
  const l = signs.find((x) => near([x.x + (9.6 * SUB) / 2, x.y - (9.5 * SUB) / 2]) === i)!;
  assert.ok(l, `atom ${i} has its sign`);
  const dots = d.electrons.filter((e) => e.atom === i && e.key !== "charge");
  assert.ok(dots.length >= 1, `atom ${i} has its radical dot`);
  const [x, y] = dots[0].at, mid = l.y - (9.5 * SUB) / 2, R = 0.1 * S.size;
  assert.ok(Math.abs(y - mid) < 0.01, `atom ${i}: the dot is level with the middle of its sign (${y.toFixed(2)} against ${mid.toFixed(2)})`);
  assert.ok(x + R < l.x && l.x - (x + R) < 0.15 * S.size, `atom ${i}: the dot sits just before its sign (${(l.x - x).toFixed(2)} px)`);
  // The unit stays clear of the atom: the dot is no nearer the atom than the sign's own spacing allows.
  assert.ok(Math.hypot(x - atomAt(i)[0], y - atomAt(i)[1]) > 0.3 * S.size, `atom ${i}: the dot is clear of its atom`);
}
// The dot is a disc in the drawing, a radical dot's size, once for each radical ion.
const discs = d.polygons.filter((poly) => poly.length === 20);
assert.equal(discs.length, charged.length, "one dot for each radical ion");
console.log("radicalion.check: the dot and the sign draw as one unit ok");

// A radical moved round its atom by hand (dragged with Select, or placed by a ChemDraw file) stays where it was put.
{
  const moved: Mol = { atoms: [A("C", 0, 0), A("C", 0.866, 0.5, { charge: 1, radical: 1, angles: { radical0: -90 } }), A("C", 1.732, 0)], bonds: [b(0, 1), b(1, 2)] };
  const e = render(moved, S, ink, S.bond).electrons.find((x) => x.key === "radical0");
  assert.ok(e && e.at[1] > 0.866 * 0.5 * -S.bond + 0.3 * S.size, "a radical moved below its atom stays there");
  // The Symbols tool's Radical cation makes the unit again.
  const tool = addSymbol(addSymbol(moved, 1, "radicalCation"), 1, "radicalCation").atoms[1];
  assert.deepEqual([tool.charge, tool.radical, tool.angles?.radical0], [1, 1, undefined], "the tool's radical ion is one unit");
  console.log("radicalion.check: a radical moved by hand ok");
}

// CDXML: a radical ion goes to the file as ChemDraw's one symbol, which stands for the charge and the radical, with
// no other sign or electron. The label keeps no sign. ChemDraw's symbol comes back as the charge and the radical.
{
  const m: Mol = { atoms: [A("C", 0, 0), A("C", 0.866, 0.5, { charge: 1, radical: 1 }), A("C", 1.732, 0), A("O", 4, 0, { charge: -1, radical: 1 })], bonds: [b(0, 1), b(1, 2)] };
  const xml = toCdxml(m, DEFAULT_STYLE);
  const types = [...xml.matchAll(/SymbolType="(\w+)"/g)].map((x) => x[1]).sort();
  assert.deepEqual(types, ["RadicalAnion", "RadicalCation"], `one symbol for each radical ion: ${types}`);
  for (const g of xml.match(/<graphic[^>]*SymbolType="Radical\w+"[^>]*>.*?<\/graphic>/g)!) assert.match(g, /attribute="Charge".*attribute="Radical"/, "the symbol stands for the charge and the radical");
  assert.ok(!/<s[^>]*>[^<]*[-+]<\/s>/.test(xml), "no label carries the sign");
  const back = fromCdxml(xml).mol;
  assert.deepEqual(back.atoms.map((a) => [a.charge, a.radical]), m.atoms.map((a) => [a.charge, a.radical]), "the radical ions come back");
  // CDX keeps the symbol; a molfile keeps the charge and radical (CHG, RAD), with no place of their own, so they draw
  // as the unit.
  const graphics = (x: Xml): Xml[] => (x.name === "graphic" ? [x] : x.kids.flatMap(graphics));
  assert.deepEqual(graphics(cdxToXml(xmlToCdx(parseXml(xml)))).map((g) => g.attrs.SymbolType).sort(), ["RadicalAnion", "RadicalCation"], "CDX");
  const mol = readV3000(writeV3000(m)).atoms[1];
  assert.deepEqual([mol.charge, mol.radical, mol.angles], [1, 1, undefined], "molfile");
  // ChemDraw's radical anion up and to the left of a carbon: the unit goes where the file puts it (its middle).
  const cd = `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><fragment id="2"><n id="3" p="100 100"/><n id="4" p="112.47 107.2" Charge="-1" Radical="Doublet"/><n id="5" p="124.94 100"/>`
    + `<b id="6" B="3" E="4"/><b id="7" B="4" E="5"/></fragment><graphic id="8" BoundingBox="109.44 102.1 105.69 102.1" GraphicType="Symbol" SymbolType="RadicalAnion"><represent attribute="Charge" object="4"/><represent attribute="Radical" object="4"/></graphic></page></CDXML>`;
  const read = fromCdxml(cd).mol.atoms[1];
  assert.deepEqual([read.charge, read.radical, Object.keys(read.angles ?? {})], [-1, 1, ["charge"]], "ChemDraw's radical anion");
  assert.ok(read.angles!.charge > 90 && read.angles!.charge < 180, `up and to the left: ${read.angles!.charge}`);
  console.log("radicalion.check: CDXML, CDX and molfile ok");
}
