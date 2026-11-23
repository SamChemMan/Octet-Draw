// Run: node src/freecharge.check.ts. Issue 60, part B: a free charge with its number (2+, 3−), plain or circled. It is
// issue 164's free symbol of a charge kind (plus, minus, circledPlus, circledMinus) with count 2 to 8. Its model and
// limits, how it steps (D3, D5, D6, D8), its ink against an atom's circled charge, its files (.oct JSON, CDXML in an
// integral group of its own, CDX, ChemDraw's saved groups), hostile files, its chemistry (D10) and the AI tools (plan
// docs/plans/issue-60-circled-charges.md, J2 to J7).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { analyseCompound, expandLabels, mapReaction, parseStructure, ready, toSmiles } = await import("./chem.ts");
const { problems } = await import("./check.ts");
const { DEFAULT_STYLE, frameStyle } = await import("./docstyle.ts");
const { EMPTY, addShape, stepFree, stepFrees, keyCharges, circleCharges, chargesOf, transformParts, deleteChosen, groupSelection, updateShape } = await import("./edit.ts");
const { fromCdxml, parseXml, toCdxml } = await import("./cdxml.ts");
const { cdxToXml, xmlToCdx } = await import("./cdx.ts");
const { parse, serialize } = await import("./file.ts");
const { readCdx, readOct, writeCdx, writeOct } = await import("./oct.ts");
const { CHARGE_RING, DIGIT, SYMBOL_BOX, chargeKind, chargeRing, chargeText, freeSymbol, reKind, signOf, symbolCharge, symbolInk, symbolNumber, symbolSize, inShape } = await import("./render.ts");
const { describe } = await import("./access.ts");
const { handle } = await import("./mcp.ts");
const { findReaction, rowOf } = await import("./reaction.ts");
const { withSalts } = await import("./mixtures.ts");
const { actionFor, keymap } = await import("./keys.ts");
type Mol = import("./render.ts").Mol;
type Shape = import("./render.ts").Shape;
type Host = import("./mcp.ts").Host;
type Box = import("./render.ts").Box;
type P = [number, number];
await ready;

const S = DEFAULT_STYLE, B = S.bond, SIGN = (0.75 * S.labelSize) / B; // an atom's charge sign's size, bond lengths
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;
const nearP = (a: P, b: P, e = 1e-6) => near(a[0], b[0], e) && near(a[1], b[1], e);
// A free charge q (−8 to 8, not 0) with its sign at c.
const charge = (q: number, circled = false, c: P = [0, 0], size = SIGN): Shape => { const k = chargeKind(q, circled); return { id: 1, ...freeSymbol(k.symbol, c, size, k.count) }; };
const frees = (m: Mol) => (m.shapes ?? []).filter((x) => symbolCharge(x) !== undefined);
const look = (x: Shape) => [symbolCharge(x), x.symbol!.startsWith("circled")];
const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");

// J2. The model: the sign and the circle are the kind, the number is count (2 to 8, unset is 1), only on the four
// charge kinds. The sign stays where it is put: a plain charge's number widens its box to the left by a digit's cell; a
// circled one's goes inside its ring.
{
  for (let q = -8; q <= 8; q++) for (const circled of [false, true]) {
    if (!q) continue;
    const sh = charge(q, circled, [1, 2]);
    assert.equal(symbolCharge(sh), q, `${q}`);
    assert.equal(sh.count, Math.abs(q) > 1 ? Math.abs(q) : undefined);
    assert.ok(nearP(signOf(sh), [1, 2]), `${q} ${circled}: the sign is where it was put`);
    const w = circled ? SYMBOL_BOX.circledPlus[0] : 0.5 + (Math.abs(q) > 1 ? DIGIT : 0);
    assert.ok(near(Math.abs(sh.to[0] - sh.from[0]), w * SIGN) && near(symbolSize(sh), SIGN), `${q} ${circled}: its box`);
  }
  assert.equal(freeSymbol("radical", [0, 0], SIGN, 3).count, undefined, "a radical has no number");
  assert.equal(freeSymbol("plus", [0, 0], SIGN, 1).count, undefined, "1 is unset");
  assert.deepEqual([symbolCharge({ kind: "symbol", symbol: "pair" }), symbolCharge({ kind: "box" }), symbolCharge({ kind: "symbol", symbol: "minus", count: 3 })], [undefined, undefined, -3]);
  // A new kind or number keeps the sign's place, the size and the turn (D2: 2+ to Negative charge gives 2−).
  const two = { ...charge(2, false, [3, 1]), angle: 30 }, minus = { ...two, ...reKind(two, "minus", two.count) };
  assert.deepEqual([minus.symbol, minus.count], ["minus", 2]);
  assert.ok(nearP(signOf(minus), signOf(two)) && near(symbolSize(minus), SIGN));
  const one = { ...two, ...reKind(two, "plus", undefined) };
  assert.ok(one.count === undefined && nearP(signOf(one), signOf(two)) && near(Math.abs(one.to[0] - one.from[0]), 0.5 * SIGN), "1+ narrows back to the sign");
}
console.log("freecharge.check: the model ok");

// D3, D5, D8. Stepping skips 0 and stops at ±8; at ±8 only the look can change; circled says the look (unset keeps
// it). The free charges among ids step together; a radical, a box and anything else stay. Circle the charge swaps plain
// and circled on atoms and free charges together, keeping each number.
{
  const step = (q: number, d: number, circled?: boolean) => { const s = charge(q), c = stepFree(s, d, circled); return c && look({ ...s, ...c } as Shape); };
  assert.deepEqual([step(1, -1), step(-1, 1), step(2, -1), step(-2, 1), step(7, 1), step(-7, -1)], [[-1, false], [1, false], [1, false], [-1, false], [8, false], [-8, false]]);
  assert.deepEqual([step(8, 1), step(-8, -1), step(8, 1, true), step(3, 0, true), step(3, 0, false)], [undefined, undefined, [8, true], [3, true], undefined]);
  const c2 = charge(2, true), down = stepFree(c2, -1)!;
  assert.deepEqual(look({ ...c2, ...down } as Shape), [1, true], "a step keeps a circled look");
  let m: Mol = { atoms: [{ label: "N", location: [0, 0, 0] }, { label: "O", location: [1, 0, 0], charge: -1 }], bonds: [] };
  [m] = addShape(m, charge(1, false, [3, 0]));
  [m] = addShape(m, charge(-2, true, [5, 0]));
  [m] = addShape(m, freeSymbol("radical", [7, 0], SIGN));
  [m] = addShape(m, { kind: "box", from: [8, 1], to: [9, 0] });
  const ids = (m.shapes ?? []).map((x) => x.id);
  // S8: a selection of everything, then +: the atoms and free charges step as one change; the radical and the box stay.
  const plus = keyCharges(m, [0, 1], ids, "plus", false);
  assert.deepEqual([plus.atoms.map((a) => a.charge), frees(plus).map(look)], [[1, undefined], [[2, false], [-1, true]]]);
  assert.deepEqual(plus.shapes!.slice(2), m.shapes!.slice(2), "the radical and the box stay");
  assert.equal(stepFrees(m, [ids[2], ids[3]], 1), m, "nothing to step: the same drawing");
  // The circled pair step in their own look, and the document's look goes on an atom's new charge only (D9).
  const circledPlus = keyCharges(m, [0], ids, "circledPlus", false);
  assert.deepEqual([circledPlus.atoms[0].circled, frees(circledPlus).map(look)], [true, [[2, true], [-1, true]]]);
  assert.deepEqual(keyCharges(m, [0], ids, "plus", true).atoms[0].circled, true, "Circle new charges on an atom's new charge");
  // D8: Circle the charge circles every charge picked, or, when all are circled, takes every circle off.
  const on = circleCharges(m, [1], ids);
  assert.deepEqual([on.atoms[1].circled, frees(on).map(look)], [true, [[1, true], [-2, true]]]);
  const off = circleCharges(on, [1], ids);
  assert.deepEqual([off.atoms[1].circled, frees(off).map(look)], [undefined, [[1, false], [-2, false]]]);
  assert.ok(nearP(signOf(frees(off)[1]), signOf(frees(m)[1])), "a circle on and off keeps the sign's place");
  assert.deepEqual([chargesOf(m, [], ids), chargesOf(on, [1], ids), chargesOf(m, [0], [ids[2]])], [{ circled: false }, { circled: true }, undefined]);
  assert.deepEqual(keyCharges(m, [], ids, "circled"), circleCharges(m, [], ids));
}
console.log("freecharge.check: stepping and Circle the charge ok");

// D5, D6. The editor: the Symbols tool's charge on a free charge adds to it in the tool's look (a radical or lone pair
// keeps fix/164's rule, the tool's kind); + and − over a free charge step it, an atom under the pointer first; a
// selection steps its atoms and free charges in one undo step; the Actions panel and run_command take the same route.
{
  assert.match(editor, /if \(on && symbolCharge\(on\) !== undefined && symbolCharge\(\{ kind: "symbol", symbol: free \}\) !== undefined\) \{ const c = stepFree\(on, free === "plus" \|\| free === "circledPlus" \? 1 : -1, free\.startsWith\("circled"\)\); return c && set\(updateShape\(doc, on\.id, c\)\); \}/);
  assert.match(editor, /if \(on\) return set\(updateShape\(doc, on\.id, reKind\(on, free, on\.count\)\)\);/);
  assert.match(editor, /t\.atom !== undefined \? "atom" : t\.bond !== undefined \? "bond" : keyCaption\(\) \? "caption" : keyFree\(\) \? "caption" : "none"/, "an atom under the pointer first, then a stand-in caption, then a free charge");
  assert.match(editor, /const f = keyFree\(\);\s*if \(f\) return set\(keyCharges\(doc, \[\], \[f\.id\], arg\)\);/);
  assert.match(editor, /const charge = pressed && !many && freesTarget\(\) \? actionFor\(keymap\(settings\.keys\), pressed, "caption"\) : undefined;/);
  assert.match(editor, /if \(\/\^charge\\\.\(plus\|minus\|circledPlus\|circledMinus\|circled\)\$\/\.test\(command\)\) return set\(keyCharges\(doc, signPick !== undefined && !ids\.length && !picked\.size \? \[signPick\] : ids, picked, command\.slice\(7\), !!style\.circled\), true\);/);
  // Over a free charge the + and − keys are charge keys (as over a stand-in caption); other keys do what they did.
  const map = keymap({});
  assert.deepEqual(["+", "-"].map((k) => actionFor(map, k, "caption")), ["charge.plus", "charge.minus"]);
  // The Actions panel: an atom's charge items on a free charge, and its kind keeps the number (shape.symbol).
  const actions = readFileSync(new URL("Actions.tsx", import.meta.url), "utf8");
  assert.match(actions, /if \(context\.charges\) items\.push\(it\(<PlusCircle size=\{18\} \/>, "Add a positive charge", "charge\.plus"\), it\(<MinusCircle size=\{18\} \/>, "Add a negative charge", "charge\.minus"\),/);
  assert.match(editor, /reKind\(x, arg as FreeSymbol, x\.count\)/);
  assert.match(editor, /charges: chargesOf\(doc, \[\], picked\)/);
  // A charge clicked on an atom's charge sign (outside the atom's own hit) adds to that atom, as on the atom: the click
  // finds the sign with markNear, as Select does. The sign of a carbocation, a circled N+ and an O− is found there.
  assert.match(editor, /const sign = \/\^\(plus\|minus\|circledPlus\|circledMinus\)\$\/\.test\(symbolKind\) \? markNear\(drawing\.electrons, doc, at, L, markReach\(\)\) : undefined;\s*if \(sign\?\.mark === "charge"\) return set\(addSymbol\(doc, sign\.atom, symbolKind\)\);/);
  const { render } = await import("./render.ts"), { addSymbol, markNear } = await import("./edit.ts");
  const fs = frameStyle(S, (S.bond * 4) / 3), L = fs.bond, ms = (t: string) => ({ width: 0.556 * fs.size * t.length, ascent: 0.716 * fs.size, outline: [] as P[] });
  for (const a of [{ label: "C", charge: 1 }, { label: "N", charge: 1, circled: true as const }, { label: "O", charge: -1 }]) {
    const m: Mol = { atoms: [{ ...a, location: [0, 0, 0] }, { label: "C", location: [1, 0, 0] }], bonds: [{ atoms: [0, 1], order: 1 }] as Mol["bonds"] };
    const e = render(m, fs, ms, L).electrons.find((x) => x.atom === 0 && x.key === "charge")!, at: P = [e.at[0] / L, -e.at[1] / L];
    assert.deepEqual(markNear(render(m, fs, ms, L).electrons, m, at, L), { atom: 0, mark: "charge" }, a.label);
    assert.equal(addSymbol(m, 0, a.charge > 0 ? "plus" : "minus").atoms[0].charge, 2 * a.charge, a.label);
  }
  // A box's line style, side and mark (shape.style, dashed, boldline, side, mark) leave a free symbol picked with it as
  // it is.
  for (const what of ["style", "dashed", "boldline", "side", "mark"]) assert.match(editor, new RegExp(`if \\(what === "${what}"\\) return each\\(\\(x\\) => \\(x\\.kind === "symbol" \\? \\{\\} :`), what);
}
console.log("freecharge.check: the Symbols tool, keys and Actions ok");

// J3. The ink. A circled charge's ring is an atom's ring (chargeRing) and its number an atom's (chargeText): at the
// default size the two are the same. A plain charge's number is text in its digit's cell, left of the sign's ink. A
// turned charge turns its number about the same middle as its ink. The canvas, thumbnails and exports draw it.
{
  const s = frameStyle(S, (B * 4) / 3), k = s.bond;
  const measure = (t: string) => ({ width: 0.556 * s.size * t.length, ascent: 0.716 * s.size, outline: [] as P[] });
  for (const q of [2, -3, 8]) {
    const sh = charge(q, true, [0, 0]), ink = symbolInk(sh, k), ring = chargeRing([0, 0], q, CHARGE_RING * s.size, s.line / 2);
    assert.equal(ink.length, ring.length, `${q}: one ring, no bars`);
    // (Both are wound one way; compare each polygon as a set of points.)
    const key = (poly: P[]) => poly.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).sort().join(" ");
    assert.deepEqual(ink.map(key).sort(), ring.map(key).sort(), `${q}: an atom's ring`);
    const n = symbolNumber(sh, k, measure, s.size)!, t = chargeText([0, 0], q, true, CHARGE_RING * s.size, s.size, measure)!;
    assert.deepEqual([n.text, n.x, n.y, n.size].map((v) => (typeof v === "number" ? v.toFixed(6) : v)), [t.text, t.x, t.y, t.size].map((v) => (typeof v === "number" ? v.toFixed(6) : v)), `${q}: an atom's number`);
  }
  assert.equal(symbolNumber(charge(1, true), k, measure, s.size), undefined, "1 is all bars");
  assert.equal(symbolNumber(charge(-1), k, measure, s.size), undefined);
  const plain = charge(3, false, [2, 1]), n = symbolNumber(plain, k, measure, s.size)!, ink = symbolInk(plain, k);
  const signLeft = Math.min(...ink.flat().map((p) => p[0])), cell = Math.min(plain.from[0], plain.to[0]) * k + DIGIT * SIGN * k;
  assert.equal(n.text, "3");
  assert.ok(n.x >= Math.min(plain.from[0], plain.to[0]) * k - 1e-6 && n.x + measure("3").width * (SIGN * k) / s.size <= cell + 1e-6 && signLeft >= cell - 1e-6, "the number in its cell, before the sign");
  const turned = { ...plain, angle: 37 }, tn = symbolNumber(turned, k, measure, s.size)!;
  assert.ok(tn.angle === 37 && nearP(tn.at, [((turned.from[0] + turned.to[0]) / 2) * k, -((turned.from[1] + turned.to[1]) / 2) * k]), "it turns about the box's middle, as the ink does");
  // The canvas draws the number in the label font with the shape's colour or the ink (light and dark), the template
  // thumbnails as the canvas does, and the hit area is the box.
  assert.match(editor, /sh\.kind === "symbol" && sh\.count && \(\(\) => \{\s*const n = symbolNumber\(sh, L, measure, frame\.size\);/);
  assert.match(editor, /fill=\{sh\.colour \? textInk\(sh\.colour\) : "var\(--ink\)"\} style=\{\{ font: `\$\{n\.size\}px \$\{fontStack\(style\.labelFont\)\}` \}\}>\{n\.text\}<\/text>/);
  assert.match(readFileSync(new URL("TemplateLibrary.tsx", import.meta.url), "utf8"), /const n = x\.count \? symbolNumber\(x, L, measure, style\.size\) : undefined;/);
  assert.ok(inShape(plain, [Math.min(plain.from[0], plain.to[0]) + 0.01, 1]), "a click on the number picks it");
  // A screen reader reads the number with the sign.
  const [withTwo] = addShape(EMPTY, charge(2, true));
  assert.ok(describe(withTwo, { box: () => [0, 0, 1, 1] }).some((x) => x.name === "Circled positive 2+"));
  assert.ok(describe(addShape(EMPTY, charge(-3))[0], { box: () => [0, 0, 1, 1] }).some((x) => x.name === "Negative charge 3−"));
}
console.log("freecharge.check: the ink ok");

// A structure and a numbered charge turned 37° and flipped move together; the number stays with its sign (S16).
{
  let m: Mol = { atoms: [{ label: "Fe", location: [0, 0, 0] }], bonds: [] };
  [m] = addShape(m, charge(3, false, [0.6, 0.4]));
  const r = (37 * Math.PI) / 180, turn = (q: P): P => [q[0] * Math.cos(r) - q[1] * Math.sin(r), q[0] * Math.sin(r) + q[1] * Math.cos(r)];
  const t = transformParts(m, new Set([0]), new Set([m.shapes![0].id]), turn), x = t.shapes![0];
  assert.ok(near(x.angle!, 37, 1e-6) && x.count === 3 && nearP(signOf(x), turn([0.6, 0.4]), 1e-6), JSON.stringify(x));
  const f = transformParts(m, new Set([0]), new Set([m.shapes![0].id]), (q) => [-q[0], q[1]], [1, 1], undefined, 1, "across").shapes![0];
  assert.ok(f.count === 3 && near(signOf(f)[1], 0.4) && f.from[0] < f.to[0], "a flip keeps the number before the sign");
}
console.log("freecharge.check: turns and flips ok");

// J2. .oct keeps count; a count that is not a whole number from 2 to 8 on a charge kind is a damaged file.
{
  let m: Mol = EMPTY;
  for (const [q, c] of [[2, false], [-3, true], [8, false], [-8, true], [1, true]] as const) [m] = addShape(m, { ...charge(q, c, [q, 0]), colour: "#C42B2B" });
  const back = parse(serialize(m));
  assert.deepEqual(back.shapes!.map(look), m.shapes!.map(look));
  assert.equal(serialize(parse(serialize(m))), serialize(m), "byte for byte");
  const json = JSON.parse(serialize(m));
  for (const bad of [0, 1, 9, 2.5, "2", -2, null, true]) assert.throws(() => parse(JSON.stringify({ ...json, shapes: [{ ...json.shapes[0], count: bad }] })), /damaged/, `count ${bad}`);
  assert.throws(() => parse(JSON.stringify({ ...json, shapes: [{ ...json.shapes[0], symbol: "radical", count: 2 }] })), /damaged/, "count on a radical");
  assert.throws(() => parse(JSON.stringify({ ...json, shapes: [{ ...json.shapes[0], kind: "box", symbol: undefined, count: 2 }] })), /damaged/, "count on a box");
  assert.throws(() => parse(JSON.stringify({ ...json, structure: { atoms: [{ label: "N", x: 0, y: 0, charge: 1, circled: "yes" }], bonds: [] } })), /damaged/, "circled yes");
  assert.deepEqual(readOct(writeOct(m, S)).mol.shapes!.map(look), m.shapes!.map(look));
  assert.deepEqual(readCdx(writeCdx(m, S)).mol.shapes!.map(look), m.shapes!.map(look));
}
console.log("freecharge.check: .oct ok");

// J5, D7. CDXML and CDX: each free charge in an integral group of its own, so ChemDraw keeps it free; from 2, the group
// holds the number as a digit, which the symbol represents. Radicals and lone pairs stay lone graphics (fix/164).
// Octet reads its own back exactly, and as ChemDraw's (Octet's data gone): the same charges at the same places.
const strip = (x: string) => x.replace(/\sOctet='[^']*'/g, "").replace(/\sOctet="[^"]*"/g, "");
{
  let m: Mol = { atoms: [{ label: "Fe", location: [0, 0, 0] }], bonds: [] };
  const made: Shape[] = [];
  for (const [q, c, at] of [[1, false, [0.5, 0.3]], [2, true, [3, 0]], [-3, false, [5, 1]], [8, true, [7, -1]], [-8, false, [9, 0]], [-1, true, [0, 1.2]]] as [number, boolean, P][]) {
    let id: number;
    [m, id] = addShape(m, { ...charge(q, c, at), ...(q === 2 ? { colour: "#2B6CC4" } : {}) });
    made.push(m.shapes!.find((x) => x.id === id)!);
  }
  [m] = addShape(m, freeSymbol("radicalCation", [11, 0], SIGN));
  const xml = toCdxml(m, S), flat = xml.replace(/\n/g, " ");
  const groups = [...flat.matchAll(/<group\s[^>]*Integral="yes"[^>]*>(.*?)<\/group>/g)].map((x) => x[1]);
  assert.equal(groups.length, 6, "a group for each free charge");
  for (const body of groups) {
    const digit = /<t\s[^>]*id="(\d+)"[^>]*>.*?<s[^>]*>(\d)<\/s>.*?<\/t>/.exec(body), sym = /<graphic\s[^>]*GraphicType="Symbol"[^>]*?(\/>|>(.*?)<\/graphic>)/.exec(body)!;
    if (digit) assert.match(sym[0], new RegExp(`<represent attribute="Charge" object="${digit[1]}"\\s*/>`), body);
    else assert.ok(!/represent/.test(sym[0]), body);
  }
  assert.deepEqual(groups.map((b) => /<s[^>]*>(\d)<\/s>/.exec(b)?.[1]).filter(Boolean), ["2", "3", "8", "8"]);
  assert.ok(/<graphic\s[^>]*SymbolType="RadicalCation"/.test(flat) && !groups.some((b) => /RadicalCation/.test(b)), "a radical ion stays a lone graphic");
  const same = (read: Mol, exact: boolean, what: string) => {
    const got = frees(read);
    assert.deepEqual(got.map(look), made.map(look), what);
    for (const [k, x] of got.entries()) {
      assert.ok(nearP(signOf(x), signOf(made[k]), 0.01) && near(symbolSize(x), SIGN, 0.01), `${what}: ${JSON.stringify(x)}`);
      if (exact) assert.ok(nearP(x.from, made[k].from, 1e-3) && nearP(x.to, made[k].to, 1e-3), `${what}: its box`);
    }
    assert.equal(read.atoms[0].charge, undefined, `${what}: Fe has no charge`);
    assert.equal(read.groups?.length ?? 0, 0, `${what}: no group left over`);
    assert.equal(read.captions?.length ?? 0, 0, `${what}: no digit left as text`);
    assert.equal(read.shapes!.find((x) => x.symbol === "radicalCation")?.kind, "symbol");
  };
  same(fromCdxml(xml).mol, true, "own CDXML");
  same(fromCdxml(strip(xml)).mol, false, "as ChemDraw's");
  same(fromCdxml(cdxToXml(xmlToCdx(parseXml(strip(xml))))).mol, false, "CDX as ChemDraw's");
  same(readCdx(writeCdx(m, S)).mol, true, "own CDX");
  assert.equal(fromCdxml(xml).mol.shapes!.find((x) => x.count === 2)?.colour?.toUpperCase(), "#2B6CC4", "its colour");
  // In a user's group: it stays in the group, and the group holds no more than before.
  let grouped = m, gid: number;
  [grouped, gid] = groupSelection(m, new Set([0]), new Set([made[1].id]))!;
  const read = fromCdxml(toCdxml(grouped, S)).mol, gr = read.groups!.find((x) => x.id === gid) ?? read.groups![0];
  assert.deepEqual([read.groups!.length, gr.atoms, gr.items], [1, [0], [made[1].id]]);
}
console.log("freecharge.check: CDXML and CDX ok");

// ChemDraw's saved groups (as 22.2 saves Octet's) and hostile CDXML. Only a group of exactly one charge symbol, linked
// to nothing or its digit, and at most one text of a single digit 2 to 8, is a numbered charge. Anything else is a group.
{
  const page = (body: string) => `<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="14.4" LabelSize="10" CaptionSize="10"><page id="1" BoundingBox="0 0 540 720">${body}</page></CDXML>`;
  const t = (id: number, text: string, x = 290) => `<t id="${id}" p="${x} 205" BoundingBox="${x} 197 ${x + 6} 205"><s font="3" size="7.5">${text}</s></t>`;
  const sym = (type: string, link?: number, box = "300 200 292.5 200") => `<graphic id="9" BoundingBox="${box}" GraphicType="Symbol" SymbolType="${type}">${link ? `<represent attribute="Charge" object="${link}"/>` : ""}</graphic>`;
  const read = (body: string) => fromCdxml(page(body)).mol;
  // As ChemDraw 22.2 saved Octet's group: the digit linked, not integral, and a digit not linked.
  for (const body of [`<group id="5" Integral="yes">${t(7, "3")}${sym("CircleMinus", 7)}</group>`, `<group id="5">${t(7, "3")}${sym("CircleMinus")}</group>`, `<group id="5"><objecttag Name="x"/>${sym("CircleMinus", 7)}${t(7, "3")}</group>`]) {
    const r = read(body);
    assert.deepEqual([frees(r).map(look), r.groups?.length ?? 0, r.captions?.length ?? 0], [[[-3, true]], 0, 0], body);
  }
  assert.deepEqual(read(`<group id="5">${sym("Plus")}</group>`).shapes!.map(look), [[1, false]], "a group of one sign");
  // Not one charge: a 9, a long number, markup, two digits, a structure with them, a radical, two signs, a link to an atom.
  const kept = (body: string, why: string, group = true) => { const r = read(body); assert.ok(!frees(r).some((x) => x.count) && (!group || (r.groups?.length ?? 0) >= 1), `${why}: ${JSON.stringify(r)}`); return r; };
  kept(`<group id="5">${t(7, "9")}${sym("Plus", 7)}</group>`, "9");
  kept(`<group id="5">${t(7, "99999999")}${sym("Plus", 7)}</group>`, "99999999");
  kept(`<group id="5">${t(7, "&lt;b&gt;2&lt;/b&gt;")}${sym("Plus", 7)}</group>`, "markup");
  const two = kept(`<group id="5">${t(7, "2")}${t(8, "3", 280)}${sym("Plus")}</group>`, "two digits");
  assert.equal(two.captions?.length, 2);
  const x12 = kept(`<group id="5"><fragment id="2"><n id="3" p="250 200" Element="26"/></fragment>${t(7, "2")}${sym("Plus", 7)}</group>`, "a structure in the group");
  assert.deepEqual([x12.atoms.map((a) => a.label), x12.atoms[0].charge], [["Fe"], undefined], "X12: the structure is kept, with no charge");
  assert.deepEqual(kept(`<group id="5"><fragment id="2"><n id="3" p="250 200" Element="26"/></fragment>${sym("Plus", 3)}</group>`, "a sign linked to an atom", false).atoms[0].charge, 1, "it is the atom's charge, as before");
  kept(`<group id="5">${t(7, "2")}<graphic id="9" BoundingBox="300 200 292.5 200" GraphicType="Symbol" SymbolType="Electron"/></group>`, "a radical");
  kept(`<group id="5">${t(7, "2")}${sym("Plus")}<graphic id="10" BoundingBox="320 200 312.5 200" GraphicType="Symbol" SymbolType="Minus"/></group>`, "two signs");
  const many = Array.from({ length: 100 }, (_, i) => `<graphic id="${100 + i}" BoundingBox="${300 + i} 200 ${292.5 + i} 200" GraphicType="Symbol" SymbolType="Plus"/>`).join("");
  const hundred = kept(`<group id="5">${t(7, "2")}${many}</group>`, "100 signs and a 2");
  assert.equal(hundred.shapes!.length, 100);
  // Sizes out of reason fall back to an atom's sign's; no markup runs; the reader's nesting limit holds.
  for (const box of ["NaN NaN NaN NaN", "1e9 1e9 0 0", "300 200 300 200"]) {
    const r = read(`<group id="5">${t(7, "4")}${sym("Minus", 7, box)}</group>`);
    assert.ok((r.shapes ?? []).every((x) => [...x.from, ...x.to].every(Number.isFinite) && symbolSize(x) < 41), box);
    assert.doesNotThrow(() => parse(serialize(r)));
  }
  const deep = `${"<group>".repeat(200)}${sym("Plus")}${"</group>".repeat(200)}`;
  assert.throws(() => fromCdxml(page(deep)));
}
console.log("freecharge.check: ChemDraw's groups and hostile CDXML ok");

// D10, R4. A plus with a number is a charge: never a reaction's plus sign, and it keeps no salt's ions apart. It is in
// no chemistry (formula, SMILES), as every free symbol.
{
  const at = (x: number) => ({ label: "C", location: [x, 0, 0] as [number, number, number] });
  let m: Mol = { atoms: [at(0), at(1), at(4), at(5)], bonds: [{ atoms: [0, 1], type: 1 }, { atoms: [2, 3], type: 1 }] as Mol["bonds"] };
  const ink = (mol: Mol) => (atoms: number[]): Box => { const q = atoms.map((i) => mol.atoms[i].location); return [Math.min(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[0])), Math.max(...q.map((p) => p[1]))]; };
  const [one] = addShape(m, charge(1, false, [2.5, 0])), [two] = addShape(m, charge(2, false, [2.5, 0]));
  assert.equal(rowOf(one, undefined, ink(one), () => undefined)?.plus, true, "a free plus between two structures is a plus sign");
  assert.notEqual(rowOf(two, undefined, ink(two), () => undefined)?.plus, true, "a 2+ is not");
  const ions: Mol = { atoms: [{ label: "Na", location: [0, 0, 0], charge: 1 }, { label: "Cl", location: [2, 0, 0], charge: -1 }], bonds: [] };
  assert.equal(withSalts(addShape(ions, charge(1, false, [1, 0]))[0], [[0], [1]]).length, 2);
  assert.equal(withSalts(addShape(ions, charge(2, false, [1, 0]))[0], [[0], [1]]).length, 1, "a 2+ keeps no ions apart");
  [m] = addShape(m, charge(-3, true, [6, 1]));
  assert.equal(toSmiles(expandLabels(m)), toSmiles(expandLabels({ ...m, shapes: [] })));
  assert.equal(analyseCompound(m)?.formula, analyseCompound({ ...m, shapes: [] })?.formula);
  // The owners rule holds: a 2+ by a product's brackets moves with it in Clean Up Reaction (findReaction carries it).
  let r: Mol = { atoms: [at(0), at(1), at(5), at(6)], bonds: [{ atoms: [0, 1], type: 1 }, { atoms: [2, 3], type: 1 }] as Mol["bonds"] };
  [r] = addShape(r, { kind: "brackets", from: [4.7, 0.5], to: [6.3, -0.5] });
  [r] = addShape(r, { kind: "symbol", ...charge(2, false, [6.55, 0.6]) });
  [r] = (await import("./edit.ts")).addArrow(r, { kind: "reaction", from: [2, 0], to: [4, 0] });
  const found = findReaction(r, r.arrows![0].id, r.arrows!, ink(r), () => undefined)!;
  assert.deepEqual(found.steps.map((x) => x.kind), ["structure", "arrow", "structure"]);
  assert.ok(found.carried.includes(r.shapes![1].id), "the 2+ goes with the product");
}
console.log("freecharge.check: chemistry ok");

// J7. The AI tools, against a stand-in for the editor.
{
  let m: Mol = EMPTY, steps = 0, open = 0, picked = { atoms: [] as number[], items: [] as number[] };
  const acted: string[] = [];
  const ink = (atoms: number[]): Box | undefined => { const ps = atoms.map((i) => m.atoms[i]?.location).filter(Boolean); return ps.length ? [Math.min(...ps.map((p) => p[0])) - 0.3, Math.min(...ps.map((p) => p[1])) - 0.3, Math.max(...ps.map((p) => p[0])) + 0.3, Math.max(...ps.map((p) => p[1])) + 0.3] : undefined; };
  const host = {
    doc: () => m, style: () => m.style ?? S, ready: async () => {},
    structure: (t: string) => { try { const x = parseStructure(t); return x.atoms.length ? x : undefined; } catch { return undefined; } },
    tidy: (x: Mol) => x, named: () => false,
    begin: () => { steps++; open++; }, end: () => { open--; },
    set: (x: Mol) => { assert.equal(open, 1, "a change outside its undo step"); return (m = x); }, settle: async () => {},
    cleanReactions: (ids: Set<number>) => ids.size, tidyCycle: () => {}, command: () => false, newWindow: () => undefined,
    // The editor's runAction for the charge items, on what is selected (Editor.tsx: keyCharges on ids and picked).
    act: (id: string) => { acted.push(id); if (/^charge\./.test(id)) m = keyCharges(m, picked.atoms, picked.items, id.slice(7), !!m.style?.circled); return true; }, map: mapReaction,
    reaction: (id: number) => findReaction(m, id, m.arrows ?? [], ink, () => undefined), ink, textBox: () => undefined, labelBox: () => undefined, tables: () => [], fileText: () => undefined, inchi: () => ({}), reagent: () => undefined,
    problems: () => problems(m), smiles: (x: Mol) => toSmiles(expandLabels(x)), formula: (x: Mol) => analyseCompound(x)?.formula, name: () => undefined,
    picture: async () => "iVBOR", restyle: (s: typeof S) => { m = { ...m, style: s }; }, experiment: () => false,
    said: () => {}, working: () => {}, selection: () => picked, select: (atoms: number[], items: number[]) => { picked = { atoms, items }; },
    file: () => undefined, export: () => true, dialog: () => false, windowless: () => false, asking: () => false, dismiss: () => {},
    opens: async () => ({}), window: () => ({ id: "draw-1", name: "Untitled" }), windows: async () => [], target: async () => true, close: async () => "theirs" as const,
  } as unknown as Host;
  let n = 0;
  const call = async (name: string, args: unknown, session = "s-1") => (JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => host, "1.2.0", { client: "Test", session, keep: () => {} })).result) as { content: { text: string }[]; isError?: boolean; structuredContent?: any };
  const change = (op: Record<string, unknown>, session?: string) => call("change", { operations: [op] }, session);
  const fine = (r: { content: { text: string }[]; isError?: boolean }) => { assert.ok(!r.isError, r.content[0].text); return r.content[0].text; };
  const refused = (r: { content: { text: string }[]; isError?: boolean }, why: RegExp) => { assert.ok(r.isError, r.content[0].text); assert.match(r.content[0].text, why); };
  const last = () => m.shapes!.at(-1)!;

  // shape kind symbol with charge: the sign and number; circled unset takes the drawing's Circle new charges, which a
  // circled symbol or circled overrides.
  fine(await change({ op: "shape", kind: "symbol", charge: 2, at: [1, 2] }));
  assert.ok(look(last()).join() === "2,false" && nearP(signOf(last()), [1, 2]), JSON.stringify(last()));
  fine(await call("advanced", { tool: "set_style", args: { circled_charges: true } }));
  assert.equal(m.style?.circled, true);
  fine(await change({ op: "shape", kind: "symbol", charge: -3, at: [3, 2] }));
  assert.deepEqual(look(last()), [-3, true], "the drawing's look");
  fine(await change({ op: "shape", kind: "symbol", charge: 4, circled: false, at: [5, 2] }));
  assert.deepEqual(look(last()), [4, false]);
  fine(await change({ op: "shape", kind: "symbol", symbol: "minus", charge: 2, at: [7, 2] }));
  assert.deepEqual(look(last()), [2, false], "the charge's sign wins; the symbol's look holds");
  fine(await change({ op: "shape", kind: "symbol", symbol: "circledMinus", at: [9, 2] }));
  assert.deepEqual(look(last()), [-1, true]);
  m = { ...m, atoms: [{ label: "Fe", location: [12, 0, 0] }] };
  fine(await change({ op: "shape", kind: "symbol", charge: 3, circled: false, around: ["s1"] }));
  assert.ok(Math.min(last().from[0], last().to[0]) > 12.2 && signOf(last())[1] > 0, "round ids: its box just right of them");
  const ids = m.shapes!.map((x) => `b${x.id}`);
  // S19: what is refused, with nothing half done; what does not fit is named.
  const before = serialize(m);
  for (const [args, why] of [
    [{ charge: 0, at: [0, 0] }, /cannot be 0/],
    [{ charge: 12, at: [0, 0] }, /charge/],
    [{ charge: "two", at: [0, 0] }, /charge/],
    [{ circled: "yes", at: [0, 0] }, /circled/],
  ] as [Record<string, unknown>, RegExp][]) refused(await change({ op: "shape", kind: "symbol", ...args }), why);
  refused(await change({ op: "edit", ids: [ids[0]], charge: 0 }), /cannot be 0/);
  refused(await change({ op: "edit", ids: [ids[0], ids[1]], colour: "#C42B2B", charge: 0 }), /cannot be 0/);
  refused(await call("advanced", { tool: "set_style", args: { circled_charges: "yes" } }), /circled_charges/);
  assert.equal(serialize(m), before, "nothing half done");
  assert.match(fine(await change({ op: "shape", kind: "symbol", symbol: "radical", charge: 2, at: [0, 5] })), /Not drawn: charge \(a radical, lone pair or partial charge takes no charge\)/);
  assert.equal(last().symbol, "radical");
  fine(await change({ op: "shape", kind: "box", box: [20, 0, 21, 1] }));
  const box = `b${last().id}`, radical = `b${m.shapes!.at(-2)!.id}`;
  assert.match(fine(await change({ op: "edit", ids: [box, radical, ids[0]], charge: 5 })), /Not changed: b\d+ takes no charge; b\d+ takes no charge/);
  assert.deepEqual(look(m.shapes!.find((x) => `b${x.id}` === ids[0])!), [5, false], "the free charge took it");
  m = { ...m, atoms: [...m.atoms, { label: "N", location: [14, 0, 0] }] };
  assert.match(fine(await change({ op: "edit", ids: ["s2.1", ids[0]], circled: true })), /s2.1 has no charge to circle/);
  assert.deepEqual(look(m.shapes!.find((x) => `b${x.id}` === ids[0])!), [5, true]);
  // edit charge and circled on a free charge: the number and sign, the look, its place.
  const at0 = signOf(m.shapes!.find((x) => `b${x.id}` === ids[1])!);
  fine(await change({ op: "edit", ids: [ids[1]], charge: 7 }));
  const seven = m.shapes!.find((x) => `b${x.id}` === ids[1])!;
  assert.ok(look(seven).join() === "7,true" && nearP(signOf(seven), at0), JSON.stringify(seven));
  fine(await change({ op: "edit", ids: [ids[1]], symbol: "minus" }));
  assert.deepEqual(look(m.shapes!.find((x) => `b${x.id}` === ids[1])!), [-7, false], "a new kind keeps the number");
  // read: a free charge's charge without detail, and with it; the drawing's option.
  const summary = await call("read", {});
  assert.ok(JSON.stringify(summary.structuredContent ?? summary.content).includes(`"charge":-7`), JSON.stringify(summary.structuredContent ?? summary.content).slice(0, 800));
  assert.ok(JSON.stringify((await call("read", { detail: "full" })).structuredContent).includes(`"charge":-7`));
  // run_command: the charge items step free charges (S7: − on +1 gives −1), circled pair in their look, Circle the
  // charge; with nothing that has a charge, a clear refusal.
  m = { ...m, shapes: m.shapes!.map((x) => (`b${x.id}` === ids[2] ? { ...x, ...reKind(x, "plus", undefined) } : x)) };
  fine(await call("advanced", { tool: "run_command", args: { command: "charge.minus", ids: [ids[2]] } }));
  assert.deepEqual(look(m.shapes!.find((x) => `b${x.id}` === ids[2])!), [-1, false]);
  fine(await call("advanced", { tool: "run_command", args: { command: "charge.circledPlus", ids: [ids[2]] } }));
  assert.deepEqual(look(m.shapes!.find((x) => `b${x.id}` === ids[2])!), [1, true]);
  fine(await call("advanced", { tool: "run_command", args: { command: "charge.circled", ids: [ids[2]] } }));
  assert.deepEqual(look(m.shapes!.find((x) => `b${x.id}` === ids[2])!), [1, false]);
  refused(await call("advanced", { tool: "run_command", args: { command: "charge.circled", ids: [box] } }), /did not fit: nothing picked has a charge/);
  refused(await call("advanced", { tool: "run_command", args: { command: "charge.plus", ids: [radical] } }), /did not fit: pick an atom or a free charge/);
  // S20: two sessions. One steps a charge, the other colours it: both apply, one undo step each. One deletes it; the
  // other's edit then says it is gone.
  const was = steps;
  fine(await call("advanced", { tool: "run_command", args: { command: "charge.plus", ids: [ids[3]] } }, "s-1"));
  fine(await change({ op: "edit", ids: [ids[3]], colour: "#C42B2B" }, "s-2"));
  const both = m.shapes!.find((x) => `b${x.id}` === ids[3])!;
  assert.deepEqual([look(both), both.colour, steps - was], [[3, false], "#C42B2B", 2]);
  fine(await change({ op: "delete", ids: [ids[3]] }, "s-1"));
  refused(await change({ op: "edit", ids: [ids[3]], charge: 2 }, "s-2"), /nothing with the id/);
}
console.log("freecharge.check: the AI tools ok");
