// Run: node src/freesymbol.check.ts. Fails loudly if a free symbol (issue 164: a charge, radical or lone pair on the
// page by itself, ChemDraw's unattached chemical symbol) is not an object like the others: placed by the Symbols tool
// away from an atom, drawn to fill its box (turned with it), sized and given a new kind about its middle, kept by
// .oct, CDXML and CDX, written as ChemDraw writes one (a Symbol graphic with no represent link) and read back as one,
// while a linked or nearby symbol still goes on its atom as before.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAGIC, cdxToXml, xmlToCdx } from "./cdx.ts";
import { fromCdxml, parseXml, toCdxml } from "./cdxml.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { addArrow, addCaption, addShape, transformParts } from "./edit.ts";
import { cleanUpReactions, findReaction, layoutRow, rowOf } from "./reaction.ts";
import { withSalts } from "./mixtures.ts";
import { parse, serialize } from "./file.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import { FREE_SYMBOLS, SYMBOL_BOX, freeSymbol, resizeSymbol, settleShape, shapeBounds, shapeInk, symbolInk, symbolSize, type Mol, type Shape } from "./render.ts";
import { FREE_SYMBOL_NAMES } from "./kinds.ts";
import { describe } from "./access.ts";

const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const mid = (sh: Pick<Shape, "from" | "to">): [number, number] => [(sh.from[0] + sh.to[0]) / 2, (sh.from[1] + sh.to[1]) / 2];
const B = DEFAULT_STYLE.bond, SIGN = (0.75 * DEFAULT_STYLE.labelSize) / B; // an atom's charge sign's size, bond lengths

// 1. The model: a free symbol's box is its kind's box at its size, about its middle; a size or a new kind keeps the
// middle; a turn stays a turn (its box is drawn upright, so it is never swapped for corners).
for (const k of FREE_SYMBOLS) {
  const sh = { id: 1, ...freeSymbol(k, [2, 3], SIGN) };
  assert.equal(sh.kind, "symbol");
  assert.ok(near(Math.abs(sh.to[0] - sh.from[0]), SYMBOL_BOX[k][0] * SIGN) && near(Math.abs(sh.to[1] - sh.from[1]), SYMBOL_BOX[k][1] * SIGN), k);
  assert.ok(near(symbolSize(sh), SIGN) && near(mid(sh)[0], 2) && near(mid(sh)[1], 3), k);
  const big = { ...sh, ...resizeSymbol(sh, 2 * SIGN) };
  assert.ok(near(symbolSize(big), 2 * SIGN) && near(mid(big)[0], 2) && near(mid(big)[1], 3), k);
  assert.ok(FREE_SYMBOL_NAMES[k], k);
}
const ion = { id: 1, ...freeSymbol("radicalCation", [0, 0], SIGN), angle: 90 };
assert.equal(settleShape(ion).angle, 90);
assert.equal(settleShape({ ...ion, angle: 270 }).angle, -90);
assert.equal(settleShape({ ...ion, angle: 360 }).angle, undefined);
// A turn of the selection turns it about its middle; Scale with Labels and lines on (text 2) grows it.
const m0: Mol = { atoms: [], bonds: [], shapes: [{ ...ion, angle: undefined }] };
const turned = transformParts(m0, new Set(), new Set([1]), ([x, y]) => [-y, x]).shapes![0];
assert.ok(near(turned.angle!, 90) && near(symbolSize(turned), SIGN), JSON.stringify(turned));
const grown = transformParts(m0, new Set(), new Set([1]), ([x, y]) => [2 * x, 2 * y], [2, 2], undefined, 2).shapes![0];
assert.ok(near(symbolSize(grown), 2 * SIGN) && grown.symbol === "radicalCation");

// 2. The ink: inside its box, every polygon wound as the bonds' (shapeInk gives it), turned with the shape. A plus has
// two bars, a minus one; a lone pair two dots; a radical ion its dot and its sign.
const k = 100;
for (const kind of FREE_SYMBOLS) {
  const sh: Shape = { id: 1, ...freeSymbol(kind, [1, -1], SIGN) }, ink = symbolInk(sh, k);
  assert.deepEqual(shapeInk(sh, { bond: k, line: 1, bold: 3, spacing: 18, hash: 2, margin: 2, size: 10 }, k), ink);
  const [x0, y0, x1, y1] = shapeBounds(sh);
  for (const poly of ink) {
    assert.ok(poly.every(([x, y]) => x >= x0 * k - 1e-6 && x <= x1 * k + 1e-6 && -y >= y0 * k - 1e-6 && -y <= y1 * k + 1e-6), kind);
    assert.ok(poly.reduce((s, a, j) => s + a[0] * poly[(j + 1) % poly.length][1] - a[1] * poly[(j + 1) % poly.length][0], 0) <= 0, kind);
  }
  const t = symbolInk({ ...sh, angle: 30 }, k), [tx0, ty0, tx1, ty1] = shapeBounds({ ...sh, angle: 30 });
  assert.ok(t.flat().every(([x, y]) => x >= tx0 * k - 1e-6 && x <= tx1 * k + 1e-6 && -y >= ty0 * k - 1e-6 && -y <= ty1 * k + 1e-6), kind);
}
const count = (kind: Shape["symbol"]) => symbolInk({ id: 1, ...freeSymbol(kind!, [0, 0], SIGN) }, k).length;
assert.deepEqual([count("plus"), count("minus"), count("pair"), count("radical"), count("bar"), count("radicalCation"), count("radicalAnion")], [2, 1, 2, 1, 1, 3, 2]);

// 3. .oct keeps it (its kind, box, turn and colour); a symbol with no kind, or a kind Octet does not know, is a damaged file.
const sym: Shape = { id: 7, ...freeSymbol("circledMinus", [3, 2], 1.5 * SIGN), colour: "#cc0000", angle: 20 };
const doc: Mol = { atoms: [{ label: "N", location: [0, 0, 0], charge: 1 }], bonds: [], shapes: [sym] };
const own = parse(serialize(doc)).shapes![0], same = (a: number[], b: number[], e = 1e-3) => a.every((v, i) => near(v, b[i], e));
assert.deepEqual([own.kind, own.symbol, own.colour, own.angle], ["symbol", "circledMinus", "#cc0000", 20]);
assert.ok(same(own.from, sym.from) && same(own.to, sym.to), JSON.stringify(own));
assert.throws(() => parse(serialize({ ...doc, shapes: [{ ...sym, symbol: undefined }] })), /damaged/);
assert.throws(() => parse(serialize({ ...doc, shapes: [{ ...sym, symbol: "dagger" as never }] })), /damaged/);
assert.deepEqual(readOct(writeOct(doc, DEFAULT_STYLE)).mol.shapes![0].symbol, "circledMinus");

// 4. CDXML as ChemDraw writes an unattached symbol: a Symbol graphic with no represent link, its first point its
// middle, its second its size back along its turn (a radical ion's two points half its size apart about its middle).
const xml = toCdxml(doc, DEFAULT_STYLE).replace(/\n/g, " ");
const g = /<graphic\s[^>]*GraphicType="Symbol"[^>]*SymbolType="CircleMinus"[^>]*?(\/>|>.*?<\/graphic>)/.exec(xml)![0];
assert.ok(!/represent/.test(g), g);
const pts = /BoundingBox="([^"]+)"/.exec(g)![1].split(" ").map(Number), d = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]);
assert.ok(near(d, 1.5 * SIGN * B, 0.01), g);
// At 20° anticlockwise (y down on the page), the second point is back along the turn.
assert.ok(near(Math.atan2(-(pts[1] - pts[3]), pts[0] - pts[2]) * 180 / Math.PI, 20, 0.05), g);
// Octet reads its own back exactly; read as ChemDraw's (Octet's data stripped), its kind, middle and size hold, and
// it stands upright (ChemDraw's points are not a turn for every kind).
const back = fromCdxml(toCdxml(doc, DEFAULT_STYLE)).mol;
const b0 = back.shapes![0];
assert.deepEqual([b0.symbol, b0.angle, b0.colour?.toLowerCase()], ["circledMinus", 20, "#cc0000"]);
assert.ok(same(b0.from, sym.from) && same(b0.to, sym.to), JSON.stringify(b0));
const foreign = fromCdxml(toCdxml(doc, DEFAULT_STYLE).replace(/\sOctet='[^']*'/g, "").replace(/\sOctet="[^"]*"/g, "")).mol, f = foreign.shapes!.find((x) => x.kind === "symbol")!;
assert.equal(f.symbol, "circledMinus");
assert.ok(near(mid(f)[0], 3, 0.01) && near(mid(f)[1], 2, 0.01) && near(symbolSize(f), 1.5 * SIGN, 0.01) && f.angle === undefined, JSON.stringify(f));
// The atom's own charge stays on it (a linked sign), and the free symbol adds none.
assert.deepEqual([back.atoms[0].charge, foreign.atoms[0].charge], [1, 1]);
// Every kind round-trips through CDXML read as ChemDraw's, and through CDX.
for (const kind of FREE_SYMBOLS) {
  const one: Mol = { atoms: [], bonds: [], shapes: [{ id: 1, ...freeSymbol(kind, [-2, 1], SIGN), angle: kind === "radicalAnion" ? -45 : undefined }] };
  const text = toCdxml(one, DEFAULT_STYLE), plain = text.replace(/\sOctet='[^']*'/g, "").replace(/\sOctet="[^"]*"/g, "");
  for (const [read, own] of [[fromCdxml(plain).mol, false], [fromCdxml(cdxToXml(xmlToCdx(parseXml(plain)))).mol, false], [readCdx(writeCdx(one, DEFAULT_STYLE)).mol, true]] as const) {
    const x = read.shapes?.[0];
    assert.ok(x && x.kind === "symbol" && x.symbol === kind && !read.captions?.length && !read.atoms.length, `${kind}: ${JSON.stringify(read)}`);
    assert.ok(near(mid(x)[0], -2, 0.01) && near(mid(x)[1], 1, 0.01) && near(symbolSize(x), SIGN, 0.01) && near(x.angle ?? 0, own && kind === "radicalAnion" ? -45 : 0, 0.1), `${kind}: ${JSON.stringify(x)}`);
  }
  assert.ok(writeCdx(one, DEFAULT_STYLE).subarray(0, MAGIC.length).every((b, i) => b === MAGIC.charCodeAt(i)));
}

// 5. ChemDraw's own files: a page-level sign with no link is a free symbol at its size (as text before 1.2); a sign
// linked to an atom is that atom's charge; a lone pair with no link goes on the atom it is next to, as before, and one
// away from every atom is a free symbol; an electron with no link is free even next to an atom (it is no radical, so
// no formula changes); a dagger is still text.
const page = (body: string) => `<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="14.4" LabelSize="10" CaptionSize="10"><page id="1" BoundingBox="0 0 540 720">${body}</page></CDXML>`;
const atom = `<fragment id="2"><n id="3" p="200 200" Element="7"/></fragment>`;
let r = fromCdxml(page(`${atom}<graphic id="9" BoundingBox="300 200 292.5 200" GraphicType="Symbol" SymbolType="Plus"/>`)).mol;
assert.deepEqual([r.shapes?.[0]?.symbol, r.atoms[0].charge, r.captions], ["plus", undefined, undefined]);
assert.ok(near(symbolSize(r.shapes![0]) * 14.4, 7.5, 1e-3));
r = fromCdxml(page(`${atom}<graphic id="9" BoundingBox="208 192 200.5 192" GraphicType="Symbol" SymbolType="Plus"><represent attribute="Charge" object="3"/></graphic>`)).mol;
assert.deepEqual([r.shapes, r.atoms[0].charge], [undefined, 1]);
r = fromCdxml(page(`${atom}<graphic id="9" BoundingBox="207 200 199.5 200" GraphicType="Symbol" SymbolType="LonePair"/>`)).mol;
assert.deepEqual([r.shapes, r.atoms[0].pairs], [undefined, 1]);
r = fromCdxml(page(`${atom}<graphic id="9" BoundingBox="400 300 392.5 300" GraphicType="Symbol" SymbolType="Electron"/><graphic id="10" BoundingBox="398 330 402 330" GraphicType="Symbol" SymbolType="RadicalAnion"/>`)).mol;
assert.deepEqual([r.shapes?.map((x) => x.symbol), r.atoms[0].radical, r.atoms[0].charge], [["radical", "radicalAnion"], undefined, undefined]);
assert.ok(near(symbolSize(r.shapes![1]) * 14.4, 8, 1e-3) && r.shapes![1].angle === undefined);
r = fromCdxml(page(`${atom}<graphic id="9" BoundingBox="207 200 199.5 200" GraphicType="Symbol" SymbolType="Electron"/>`)).mol;
assert.deepEqual([r.shapes?.map((x) => x.symbol), r.atoms[0].radical], [["radical"], undefined]);
// ChemDraw's points may lie one below the other (its unattached electrons and daggers do): every kind stands upright,
// a radical's and lone pair's size is an atom's mark's, and a box with one point (a radical ion's too) is read sound.
r = fromCdxml(page(`<graphic id="9" BoundingBox="300 200 300 207.5" GraphicType="Symbol" SymbolType="Minus"/><graphic id="10" BoundingBox="300 250 300 252.9" GraphicType="Symbol" SymbolType="LonePair"/><graphic id="11" BoundingBox="200 300" GraphicType="Symbol" SymbolType="RadicalCation"/>`)).mol;
assert.deepEqual(r.shapes?.map((x) => [x.symbol, x.angle]), [["minus", undefined], ["pair", undefined], ["radicalCation", undefined]]);
assert.ok(r.shapes!.every((x) => [...x.from, ...x.to].every(Number.isFinite) && near(symbolSize(x), SIGN, 1e-3)), JSON.stringify(r.shapes));
assert.doesNotThrow(() => parse(serialize(r)));
r = fromCdxml(page(`<graphic id="9" BoundingBox="300 200 292.5 200" GraphicType="Symbol" SymbolType="Dagger"/>`)).mol;
assert.deepEqual([r.shapes, r.captions?.[0]?.text], [undefined, "†"]);
// A file from Octet 1.1 (an atom's lone pairs, written with no link) opens as it did.
const old: Mol = { atoms: [{ label: "O", location: [0, 0, 0], pairs: 2 }], bonds: [] };
const oldRead = fromCdxml(toCdxml(old, DEFAULT_STYLE).replace(/\sOctet='[^']*'/g, "")).mol;
assert.deepEqual([oldRead.atoms[0].pairs, oldRead.shapes], [2, undefined]);

// 6. It is an object as others are: added on top with a fresh id, named for screen readers by its kind.
const [withOne, id] = addShape(doc, freeSymbol("radicalAnion", [6, 6], SIGN));
assert.equal(withOne.shapes!.at(-1)!.id, id);
assert.ok(describe(withOne, { box: () => [0, 0, 1, 1] }).some((x) => x.role === "shape" && x.name === "Radical anion"));

// 7. The editor: the Symbols tool places one away from an atom and a bond, at an atom's charge sign's size (a lone
// pair as a bar with Option or Lone pairs as bars), and a click on one gives it the tool's kind; it is hit anywhere in
// its box; the Actions panel shows its kinds and size, and Size and the kind chips change it; a box's kind and style
// leave it alone.
const editor = readFileSync(new URL("./Editor.tsx", import.meta.url), "utf8"), actions = readFileSync(new URL("./Actions.tsx", import.meta.url), "utf8");
assert.match(editor, /if \(t\.atom !== undefined\) return set\(addSymbol\(doc, t\.atom, symbolKind, pressAlt\.current, settings\.pairBars\)\);/);
assert.match(editor, /return set\(addShape\(doc, freeSymbol\(free, at, \(0\.75 \* style\.labelSize\) \/ style\.bond\)\)\[0\]\);/);
assert.match(editor, /symbolKind === "pair" && \(pressAlt\.current \|\| settings\.pairBars\) \? "bar"/);
assert.match(editor, /\(sh\.kind === "symbol" && inShape\(sh, p\)\) \|\| nearTrace/);
assert.match(editor, /if \(what === "symbol" && \(FREE_SYMBOLS as string\[\]\)\.includes\(arg\)\)/);
assert.match(editor, /resizeSymbol\(x, Number\(arg\) \/ style\.bond\)/);
assert.match(editor, /if \(what === "style"\) return each\(\(x\) => \(x\.kind === "symbol" \? \{\} :/);
assert.match(actions, /run\(`shape\.symbol\.\$\{k\}`\)/);
assert.match(actions, /<SizeButton size=\{context\.symbolPt\} sizes=\{sizes\} run=\{run\} \/>/);
assert.match(actions, /\["tlc", "gel", "plasmid", "table", "picture", "symbol"\]\.includes\(context\.shape\)/);

// 8. A free plus is a reaction's plus sign, as a "+" caption is: A + B → C reads with its plus, from the app or from a
// ChemDraw file (its unattached Plus), and Clean Up Reaction moves it into the row and adds no second plus. It keeps
// two ions apart, and a screen reader calls it by the name the Actions panel gives it.
{
  const at = (x: number) => ({ label: "C", location: [x, 0, 0] as [number, number, number] });
  let m: Mol = { atoms: [at(0), at(1), at(3), at(4), at(8), at(9)], bonds: [{ atoms: [0, 1], order: 1 }, { atoms: [2, 3], order: 1 }, { atoms: [4, 5], order: 1 }] as Mol["bonds"] };
  [m] = addArrow(m, { kind: "reaction", from: [5, 0], to: [7, 0] });
  [m] = addShape(m, freeSymbol("plus", [2, 0.3], SIGN));
  const ink = (mol: Mol) => (atoms: number[]) => { const q = atoms.map((i) => mol.atoms[i].location); return [Math.min(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[0])), Math.max(...q.map((p) => p[1]))] as [number, number, number, number]; };
  const none = () => undefined;
  const layout = { gap: 0.8, width: 100, captionBox: none, plusBox: [-0.25, -0.15, 0.25, 0.45] as [number, number, number, number], captionPt: 10, bondPt: 14.4 };
  for (const mol of [m, fromCdxml(toCdxml(m, DEFAULT_STYLE).replace(/\sOctet='[^']*'/g, "").replace(/\sOctet="[^"]*"/g, "")).mol]) {
    const r = findReaction(mol, mol.arrows![0].id, mol.arrows!, ink(mol), none)!;
    assert.deepEqual(r.steps.map((x) => x.kind), ["structure", "plus", "structure", "arrow", "structure"]);
    assert.ok(r.carried.includes(mol.shapes![0].id));
    const out = cleanUpReactions(mol, mol.arrows!, ink, layout, () => true).mol;
    assert.equal(out.captions?.length ?? 0, 0);
    const y = mid(out.shapes![0])[1], structureY = out.atoms[0].location[1];
    assert.ok(Math.abs(y - structureY) < 0.3 && mid(out.shapes![0])[0] > out.atoms[1].location[0] && mid(out.shapes![0])[0] < out.atoms[2].location[0], JSON.stringify(out.shapes));
    assert.ok(rowOf(mol, undefined, ink(mol), none)?.plus);
  }
  // The CDXML scheme lists it as a plus of the step.
  const xml = toCdxml(m, DEFAULT_STYLE), gid = new RegExp(`<graphic\\s+id="(\\d+)"[^>]*GraphicType="Symbol"`).exec(xml)![1];
  assert.match(xml, new RegExp(`ReactionStepPlusses="${gid}"`));
  // Two ions with a free plus between them are named apart, as with a "+" caption.
  const ions: Mol = { atoms: [{ label: "Na", location: [0, 0, 0], charge: 1 }, { label: "Cl", location: [2, 0, 0], charge: -1 }], bonds: [] };
  assert.equal(withSalts(ions, [[0], [1]]).length, 1);
  assert.equal(withSalts(addShape(ions, freeSymbol("plus", [1, 0], SIGN))[0], [[0], [1]]).length, 2);
  assert.ok(describe(m, { box: () => [0, 0, 1, 1] }).some((x) => x.role === "shape" && x.name === "Positive charge"));
}

// 9. A free symbol by a structure, or by brackets round one, is that structure's charge (a complex's total charge, as
// issue 164's commenters draw it): Clean Up Reaction moves it with the structure, as it moves text there. A free plus
// there is a charge, not a plus sign of the row, and does not keep a salt's ions apart. The reaction is read again
// when a plus sign or brackets are added, though the atoms are the same.
{
  const at = (x: number, y = 0) => ({ label: "C", location: [x, y, 0] as [number, number, number] });
  const ink = (mol: Mol) => (atoms: number[]) => { const q = atoms.map((i) => mol.atoms[i].location); return [Math.min(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[0])), Math.max(...q.map((p) => p[1]))] as [number, number, number, number]; };
  const cbox = (mol: Mol) => (id: number) => { const c = mol.captions?.find((x) => x.id === id); return c ? [c.x - 0.15, c.y - 0.15, c.x + 0.15, c.y + 0.15] as [number, number, number, number] : undefined; };
  const layout = { gap: 0.8, width: 100, plusBox: [-0.25, -0.15, 0.25, 0.45] as [number, number, number, number], captionPt: 10, bondPt: 14.4 };
  const clean = (mol: Mol) => cleanUpReactions(mol, mol.arrows!, ink, { ...layout, captionBox: cbox(mol) }, () => true).mol;
  // A complex in brackets above the arrow's level, its charge by the brackets' top right.
  let m: Mol = { atoms: [at(-5, 0.25), at(-4, 0.25), at(3), at(4)], bonds: [{ atoms: [0, 1], order: 1 }, { atoms: [2, 3], order: 1 }] as Mol["bonds"] };
  [m] = addArrow(m, { kind: "reaction", from: [-3, 0], to: [1.5, 0] });
  [m] = addShape(m, { kind: "brackets", from: [-5.3, 0.75], to: [-3.7, -0.25] });
  for (const k of ["minus", "plus", "radicalCation"] as const) {
    const [x] = addShape(m, freeSymbol(k, [-3.5, 0.85], SIGN)), sym = x.shapes![1];
    const r = findReaction(x, x.arrows![0].id, x.arrows!, ink(x), cbox(x))!;
    assert.deepEqual(r.steps.map((s) => s.kind), ["structure", "arrow", "structure"], k);
    assert.ok(r.carried.includes(sym.id), k);
    const out = clean(x), br = out.shapes!.find((s) => s.kind === "brackets")!, now = out.shapes!.find((s) => s.id === sym.id)!;
    assert.ok(near(out.atoms[0].location[1], 0) && near(mid(now)[1] - br.from[1], 0.85 - 0.75) && near(mid(now)[0], -3.5), k);
  }
  // A charge by a structure (no brackets), and a free plus at a cation's top right.
  let c: Mol = { atoms: [at(0), at(1), at(4), at(5)], bonds: [{ atoms: [0, 1], order: 1 }, { atoms: [2, 3], order: 1 }] as Mol["bonds"] };
  [c] = addArrow(c, { kind: "reaction", from: [2, 0.3], to: [3.4, 0.3] });
  for (const k of ["plus", "minus", "circledMinus"] as const) {
    const [x] = addShape(c, freeSymbol(k, [1.25, 0.25], SIGN)), id = x.shapes![0].id;
    assert.deepEqual(findReaction(x, x.arrows![0].id, x.arrows!, ink(x), cbox(x))!.steps.map((s) => s.kind), ["structure", "arrow", "structure"], k);
    const out = clean(x), dy = out.atoms[1].location[1] - x.atoms[1].location[1], now = out.shapes!.find((s) => s.id === id)!;
    assert.ok(Math.abs(dy) > 0.1 && near(mid(now)[0], 1.25) && near(mid(now)[1], 0.25 + dy), k);
  }
  // A caption at the same place goes the same way.
  { const [x] = addCaption(c, { text: "−", x: 1.25, y: 0.25 } as Parameters<typeof addCaption>[1]), out = clean(x); assert.ok(near(out.captions![0].y - 0.25, out.atoms[1].location[1])); }
  // Clean up of a row of structures (no arrow) takes the charge with its structure, and reads no plus sign.
  const two: Mol = { atoms: [at(0), at(1), at(1.2, 0.2), at(2.2, 0.2)], bonds: [{ atoms: [0, 1], order: 1 }, { atoms: [2, 3], order: 1 }] as Mol["bonds"] };
  const [t] = addShape(two, freeSymbol("plus", [2.45, 0.45], SIGN)), row = rowOf(t, undefined, ink(t), () => undefined)!;
  assert.equal(row.plus, false);
  const laid = layoutRow(t, row.steps, 0.8).mol, moved = laid.atoms[3].location;
  assert.ok(near(mid(laid.shapes![0])[0] - moved[0], 0.25) && near(mid(laid.shapes![0])[1] - moved[1], 0.25));
  // A salt in brackets with its charge by them is one compound; a plus sign between the ions keeps them two.
  const salt: Mol = { atoms: [{ label: "N", location: [0, 0, 0], charge: 1 }, { label: "Cl", location: [3, 0, 0], charge: -1 }], bonds: [] };
  const [inBrackets] = addShape(salt, { kind: "brackets", from: [-1.2, -1.3], to: [1.2, 1.3] });
  assert.equal(withSalts(addShape(inBrackets, freeSymbol("plus", [1.45, 1.35], SIGN))[0], [[0], [1]]).length, 1);
  assert.equal(withSalts(addShape(inBrackets, freeSymbol("plus", [2.1, 0], SIGN))[0], [[0], [1]]).length, 2);
  // Same atoms array, a plus sign added: the ions read apart.
  let ions: Mol = { atoms: [{ label: "Na", location: [0, 0, 0], charge: 1 }, { label: "Cl", location: [2, 0, 0], charge: -1 }, at(7), at(8)], bonds: [{ atoms: [2, 3], order: 1 }] as Mol["bonds"] };
  [ions] = addArrow(ions, { kind: "reaction", from: [3.5, 0], to: [5.5, 0] });
  const read = (x: Mol) => findReaction(x, x.arrows![0].id, x.arrows!, ink(x), cbox(x))!.steps.map((s) => s.kind).join(" ");
  assert.equal(read(ions), "structure arrow structure");
  assert.equal(read(addShape(ions, freeSymbol("plus", [1, 0], SIGN))[0]), "structure plus structure arrow structure");
  // Scale with Labels and lines off keeps a free symbol's size, as it keeps an atom's charge; on, it grows with them.
  const one = { id: 1, ...freeSymbol("plus", [1, 1], SIGN) }, page: Mol = { atoms: [], bonds: [], shapes: [one] };
  assert.ok(near(symbolSize(transformParts(page, new Set(), new Set([1]), (q) => [2 * q[0], 2 * q[1]], [2, 2], undefined, 1).shapes![0]), SIGN));
  assert.ok(near(symbolSize(transformParts(page, new Set(), new Set([1]), (q) => [2 * q[0], 2 * q[1]], [2, 2], undefined, 2).shapes![0]), 2 * SIGN));
  // Text > Size on a caption and a free symbol picked together sizes both.
  assert.match(editor, /restyle\(\(\) => \(\{ size: Number\(arg\) === style\.captionSize \? undefined : Number\(arg\) \}\), \{ shapes \}\)/);
}

// A free symbol picked alone is text, as a caption is: its frame has corners only, and a corner drag sizes it with
// Labels and lines off and with Ctrl held too.
{
  const editor = (await import("node:fs")).readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /const \{ atoms, items \} = chosen\(\);\n    return !atoms\.size && \[\.\.\.items\]\.every\(\(id\) => doc\.captions\?\.some\(\(c\) => c\.id === id\) \|\| doc\.shapes\?\.some\(\(sh\) => sh\.id === id && sh\.kind === "symbol"\)\)/, "text alone is judged with its groups");
  // Control does not stop text alone from sizing: there is nothing else for it to keep.
  assert.match(editor, /const lines = drag\.text \|\| drag\.labels !== e\.ctrlKey;/);
  assert.match(editor, /lines: scalesText\(\), text: textAlone\(\),/);
  assert.match(editor, /const scalesText = \(\) => settings\.scaleLabels \|\| textAlone\(\);/);
  assert.match(editor, /corners: !grown && textAlone\(\)/);
}

console.log("freesymbol.check: free symbols place, draw, size, save and read back as ChemDraw's.");
