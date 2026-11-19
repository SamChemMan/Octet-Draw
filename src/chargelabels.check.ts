// Run: node src/chargelabels.check.ts. Fails loudly if a label that stands in for a group (Nu, E, LG, R) stops taking
// a charge (issue 164), or a label's charge sign stops moving round its atom with a drag, as a ChemDraw charge does.
import assert from "node:assert/strict";
import { fromCdxml, parseXml, toCdxml } from "./cdxml.ts";
import { cdxToXml, xmlToCdx } from "./cdx.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { addSymbol, atomCaption, captionAtom, chemicalCaption, keyCharge, markNear, moveMark, standInCaption } from "./edit.ts";
import { render, turnPx, type Atom, type Caption, type Ink, type Mol } from "./render.ts";
import { actionFor, keymap } from "./keys.ts";
import { readFileSync } from "node:fs";

type P = [number, number];
const cap = (text: string, more: Partial<Caption> = {}): Caption => ({ id: 1, text, x: 0, y: 0, ...more });

// A caption written as Nu, E or LG is no chemistry (it counts in no formula), but the atom tools (the Symbols tool
// with its charges too) and Make element make it an atom, as they do Rh or OMe.
for (const t of ["Nu", "E", "LG", "R", "R1", "X", "PG", "Hal", "EWG", " Nu "]) {
  assert.ok(standInCaption(cap(t)) && atomCaption(cap(t), true), `${t} takes the atom tools`);
  assert.ok(!chemicalCaption(cap(t), true), `${t} counts in no formula`);
}
for (const t of ["reflux", "rt", "1", "2a", "Nu E", "Nu-", ""]) assert.ok(!atomCaption(cap(t), true), `${t} is text`);
assert.ok(atomCaption(cap("Rh"), true), "a caption that reads as a label still does");
assert.ok(!atomCaption(cap("Nu", { under: [0] }), true) && !atomCaption(cap("Nu", { on: { arrow: 2, side: "above" } }), true), "tied text is text");
assert.ok(!atomCaption(cap("Nu"), false) && !atomCaption(cap("Nu", { chemical: false }), true), "not with Interpret chemically off");

// The atom it makes is the label, and takes a charge from the Symbols tool and the + and - keys, drawn after it.
const pt = 4 / 3, S = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
const box: P[] = [];
for (let i = 0; i <= 40; i++) { const f = i / 40; box.push([9.6 * f, 0], [9.6 * f, -9.5], [0, -9.5 * f], [9.6, -9.5 * f]); }
const ink = (t: string): Ink => ({ width: 9.6 * t.length, ascent: 9.5, outline: box.map(([x, y]): P => [x * t.length, y]) });
const lone = (t: string): Mol => ({ atoms: [captionAtom(cap(t), [0, 0, 0], DEFAULT_STYLE)], bonds: [] });
for (const [t, made] of [["Nu", addSymbol(lone("Nu"), 0, "minus")], ["E", addSymbol(lone("E"), 0, "plus")], ["LG", keyCharge(lone("LG"), 0, "minus")]] as const) {
  assert.equal(made.atoms[0].text, t, `${t} is the label`);
  const texts = render(made, S, ink).labels.map((l) => l.text);
  assert.deepEqual(texts, [t, made.atoms[0].charge! > 0 ? "+" : "–"], `${t} is drawn with its sign`);
}
assert.equal(addSymbol(addSymbol(lone("Nu"), 0, "circledMinus"), 0, "circledMinus").atoms[0].charge, -2, "the circled marks add up too");

// The + and - keys over such a caption add the charge as the Symbols tool does: the key is a charge key there, and the
// editor makes the caption its atom first, in the same undo step. Other atom keys keep what they do over text.
const map = keymap({});
assert.deepEqual(["+", "-"].map((k) => actionFor(map, k, "caption")), ["charge.plus", "charge.minus"], "a charge key over Nu");
for (const k of ["c", "n", "1", "="]) assert.equal(actionFor(map, k, "caption"), actionFor(map, k, "none"), `${k} over a caption does what it did`);
const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
assert.match(editor, /keyCaption\(\) \? "caption"/, "the keys look for such a caption under the pointer");
assert.match(editor, /if \(kind === "charge"\) \{\s*const c = keyCaption\(\)[^\n]*makeElements\(\[c\], key, false\);\s*if \(made\) return set\(keyCharge\(made, doc\.atoms\.length, arg(, !!style\.circled)?\), false, key\);/, "and make it the atom with the charge, as one step");

// A label's sign is a mark, as a skeletal carbon's and a circled one are: a drag with Select moves it round its atom
// (Atom.angles charge), clear of the label, and it stays there.
const A = (label: string, x: number, y: number, more: Partial<Atom> = {}): Atom => ({ label, location: [x, y, 0], ...more });
const amine: Mol = { atoms: [A("N", 0, 0, { charge: 1, implicitHCount: 0 }), A("C", -0.87, 0.5), A("C", 0.87, 0.5)], bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [0, 2] }] };
const L = S.bond, doc = (p: P): P => [p[0] / L, -p[1] / L];
const signOf = (m: Mol) => render(m, S, ink).electrons.find((e) => e.atom === 0 && e.key === "charge")?.at;
const first = signOf(amine);
assert.ok(first, "the sign is a mark");
assert.deepEqual(markNear(render(amine, S, ink).electrons, amine, doc(first), L), { atom: 0, mark: "charge" }, "a press on the sign takes the sign");
const down = moveMark(amine, 0, "charge", [0.05, -1], true);
assert.equal(down.atoms[0].angles?.charge, -90, "dragged below the atom, in 15° steps");
const below = signOf(down)!, plus = render(down, S, ink).labels.find((l) => l.text === "+")!;
assert.ok(Math.abs(below[0]) < 1 && below[1] > 9.5 / 2, "the sign goes below the N, clear of it");
assert.ok(plus.y - (9.5 * plus.size) / S.size > 9.5 / 2, "the sign's ink is under the N's");
assert.notDeepEqual(signOf(moveMark(amine, 0, "charge", [-1, 0], true)), below, "and goes where it is dragged");

// CDXML: a sign moved off its label is a Plus symbol linked to the atom, where it is drawn (ChemDraw keeps a sign moved
// round its atom so); a ChemDraw file's symbol comes back at its angle.
const xml = toCdxml(down, DEFAULT_STYLE), sym = /<graphic\s[^>]*BoundingBox="([\d.-]+) ([\d.-]+)[^>]*SymbolType="Plus"/.exec(xml.replace(/\n/g, " "));
assert.ok(sym, "a Plus symbol");
const n = /<n\s[^>]*?p="([\d.-]+) ([\d.-]+)"[^>]*Element="7"/.exec(xml.replace(/\n/g, " "))!;
assert.ok(Number(sym[2]) - Number(n[2]) > 3 && Math.abs(Number(sym[1]) - Number(n[1])) < 1, "below the N on the page");
const read = fromCdxml(xml.replace(/ Octet="[^"]*"/g, "")).mol.atoms.find((a) => a.label === "N")!;
assert.ok(Math.abs(read.angles!.charge + 90) < 1, "ChemDraw's symbol comes back at its angle");
assert.equal(fromCdxml(xml).mol.atoms.find((a) => a.label === "N")!.angles?.charge, -90, "Octet's own angle comes back");
// A sign that cannot go after its label (a bond on each side) goes clear of it, never on the atom.
const chain: Mol = { atoms: [A("C", -1, 0), A("N", 0, 0, { charge: 1 }), A("C", 1, 0)], bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }] };
const flat = toCdxml(chain, DEFAULT_STYLE).replace(/\n/g, " "), at = /<graphic\s[^>]*BoundingBox="([\d.-]+) ([\d.-]+)[^>]*SymbolType="Plus"/.exec(flat)!, np = /<n\s[^>]*?p="([\d.-]+) ([\d.-]+)"[^>]*Element="7"/.exec(flat)!;
assert.ok(Math.hypot(Number(at[1]) - Number(np[1]), Number(at[2]) - Number(np[2])) > 5, "the sign is not on the atom");
console.log("chargelabels.check: ok");

// A charge on a stand-in label (Nu) moves as any label's sign does: a press on it takes it, a drag puts it below, and
// CDXML and CDX write a Minus symbol below the Nu, which comes back at that angle (from Octet's own file, and as
// ChemDraw's file without Octet's notes).
{
  const nu = addSymbol(lone("Nu"), 0, "minus"), sign = signOf(nu)!;
  assert.deepEqual(markNear(render(nu, S, ink).electrons, nu, doc(sign), L), { atom: 0, mark: "charge" }, "a press on Nu's sign takes the sign");
  const moved = moveMark(nu, 0, "charge", [0, -1], true), at = signOf(moved)!;
  assert.equal(moved.atoms[0].angles?.charge, -90, "Nu's sign is dragged below");
  assert.ok(Math.abs(at[0]) < 1 && at[1] > 9.5 / 2, `Nu's sign draws below it, clear of it (${at.map((v) => v.toFixed(1))})`);
  const out = toCdxml(moved, DEFAULT_STYLE).replace(/\n/g, " ");
  const g = /<graphic\s[^>]*BoundingBox="([\d.-]+) ([\d.-]+)[^>]*SymbolType="Minus"/.exec(out), p = /<n\s[^>]*?p="([\d.-]+) ([\d.-]+)"/.exec(out)!;
  assert.ok(g && Number(g[2]) - Number(p[2]) > 3 && Math.abs(Number(g[1]) - Number(p[1])) < 1, `CDXML: a Minus symbol below the Nu (${g?.slice(1)}, atom ${p.slice(1)})`);
  const xml = toCdxml(moved, DEFAULT_STYLE), cdx = (x: string) => cdxToXml(xmlToCdx(parseXml(x)));
  for (const [what, back] of [["CDXML", fromCdxml(xml)], ["CDX", fromCdxml(cdx(xml))], ["ChemDraw's CDXML", fromCdxml(xml.replace(/ Octet="[^"]*"/g, ""))], ["ChemDraw's CDX", fromCdxml(cdx(xml.replace(/ Octet="[^"]*"/g, "")))]] as const) {
    const a = back.mol.atoms[0];
    assert.deepEqual([a.text, a.charge], ["Nu", -1], `${what}: Nu keeps its charge`);
    assert.ok(Math.abs(a.angles!.charge + 90) < 1, `${what}: the sign comes back below (${a.angles?.charge})`);
  }
}
console.log("chargelabels.check: a stand-in label's sign moves ok");

// On a turned label (labelAngle) a sign or radical ion that is not after the label is a symbol of its own: it draws
// level, out from the atom the way it was dragged on the page (not turned with the label), clear of the label's ink.
// CDXML writes the symbol where it is drawn, and a ChemDraw file brings it back there. An undragged radical ion is a
// symbol too, so it goes to the file where Octet draws it.
{
  const way = (q: number[], o: number[]) => (Math.atan2(-(q[1] - o[1]), q[0] - o[0]) * 180) / Math.PI;
  const off = (p: number, q: number) => Math.abs((((p - q) % 360) + 540) % 360 - 180);
  const X: P = [L, 0];
  const markOf = (m: Mol) => {
    const r = render(m, S, ink), marks = r.electrons.filter((e) => e.atom === 1 && e.key === "charge");
    return { r, at: marks.reduce<P>((s, e) => [s[0] + e.at[0] / marks.length, s[1] + e.at[1] / marks.length], [0, 0]) };
  };
  const cases: [Partial<Atom>, number | undefined][] = [
    [{ charge: 1, labelAngle: 90, angles: { charge: 90 } }, 90],
    [{ charge: 1, labelAngle: 45, angles: { charge: -90 } }, -90],
    [{ charge: 1, radical: 1, labelAngle: 90, angles: { charge: 90 } }, 90],
    [{ charge: -1, radical: 1, labelAngle: 45, angles: { charge: 90 } }, 90],
    [{ charge: 1, radical: 1, labelAngle: 90 }, undefined],
  ];
  for (const [more, deg] of cases) {
    const what = JSON.stringify(more), m: Mol = { atoms: [A("C", 0, 0), A("N", 1, 0, more)], bonds: [{ type: 1, atoms: [0, 1] }] };
    const { r, at } = markOf(m), drawn = way(at, X);
    if (deg !== undefined) assert.ok(off(drawn, deg) < 10, `${what}: drawn the way it was dragged (${drawn.toFixed(0)}°)`);
    // The sign stays level; the label turns.
    const t = (more.charge! > 0 ? "+" : "–"), sign = r.labels.find((l) => l.text === t)!, n = r.labels.find((l) => l.text === "N")!;
    assert.ok(!sign.angle && n.angle === more.labelAngle, `${what}: the sign is level, the label turned`);
    // Clear of the label's ink: no corner of a turned glyph's box is inside the sign's box.
    const k = 0.75, sx = [sign.x, sign.x + 9.6 * k], sy = [sign.y - 9.5 * k, sign.y];
    for (const l of r.labels.filter((x) => x.angle)) {
      const f = l.size / S.size, w = 9.6 * f * [...l.text].length;
      for (const q of ([[l.x, l.y], [l.x + w, l.y], [l.x, l.y - 9.5 * f], [l.x + w, l.y - 9.5 * f]] as P[]).map((q) => turnPx(q, l.pivot!, l.angle!)))
        assert.ok(q[0] < sx[0] || q[0] > sx[1] || q[1] < sy[0] || q[1] > sy[1], `${what}: the sign is clear of ${l.text}`);
    }
    const xml = toCdxml(m, DEFAULT_STYLE).replace(/\n/g, " "), p = [...xml.matchAll(/<n\s[^>]*?p="([\d.-]+) ([\d.-]+)"/g)].map((x) => [Number(x[1]), Number(x[2])])[1];
    const g = /BoundingBox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"[^>]*SymbolType="(\w+)"/.exec(xml)!;
    assert.ok(g, `${what}: a symbol`);
    const c = g[5].startsWith("Radical") ? [(+g[1] + +g[3]) / 2, (+g[2] + +g[4]) / 2] : [+g[1], +g[2]], file = way(c, p);
    assert.ok(off(file, drawn) < 20, `${what}: CDXML writes the symbol the way it is drawn (${file.toFixed(0)}° against ${drawn.toFixed(0)}°)`);
    const back = fromCdxml(xml.replace(/ Octet="[^"]*"/g, "")).mol, again = way(markOf(back).at, X);
    assert.equal(back.atoms[1].labelAngle, more.labelAngle, `${what}: the label comes back turned`);
    assert.ok(off(again, drawn) < 20, `${what}: ChemDraw's file draws it where it was (${again.toFixed(0)}° against ${drawn.toFixed(0)}°)`);
  }
}
console.log("chargelabels.check: a sign round a turned label ok");

// CDXML counts a label's whole ink when it places the sign, as render.ts does: a stacked H (NH2 with H2 below the N), a
// written label's other lines, and a count's subscript. So the symbol goes where Octet draws it, never on the H row,
// and a ChemDraw file brings it back there. Arial's metrics, as CDXML takes them.
{
  const { arialInk } = await import("./cdxml.ts");
  const arial = arialInk(S.size), way = (q: number[], o: number[]) => (Math.atan2(-(q[1] - o[1]), q[0] - o[0]) * 180) / Math.PI;
  const off = (p: number, q: number) => Math.abs((((p - q) % 360) + 540) % 360 - 180);
  const drawn = (m: Mol, i: number) => {
    const q = render(m, S, arial).electrons.filter((e) => e.atom === i && e.key === "charge"), X: P = [m.atoms[i].location[0] * L, -m.atoms[i].location[1] * L];
    const at = q.reduce<P>((s, e) => [s[0] + e.at[0] / q.length, s[1] + e.at[1] / q.length], [0, 0]);
    return { deg: way(at, X), r: Math.hypot(at[0] - X[0], at[1] - X[1]) };
  };
  const ring = Array.from({ length: 6 }, (_, k) => { const t = -Math.PI / 2 + (k * Math.PI) / 3; return A(k ? "C" : "N", Math.cos(t), Math.sin(t), k ? {} : { charge: 1 }); });
  const up = (more: Partial<Atom>): Mol => ({ atoms: [A("C", -0.87, 0.5), A("N", 0, 0, more), A("C", 0.87, 0.5)], bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }] });
  const cases: [string, Mol, number][] = [
    ["piperidinium, N at the bottom", { atoms: ring, bonds: ring.map((_, k) => ({ type: 1 as const, atoms: [k, (k + 1) % 6] as [number, number] })) }, 0],
    ["NH2+ stacked below", up({ charge: 1 }), 1],
    ["NH2+ dragged below", up({ charge: 1, angles: { charge: -90 } }), 1],
    ["NH2 radical cation", up({ charge: 1, radical: 1 }), 1],
    ["N, Me on two lines, dragged below", up({ text: "N\nMe", charge: 1, angles: { charge: -90 } }), 1],
    ["NH3+ turned 90, dragged up", { atoms: [A("C", 0, 0), A("N", 1, 0, { charge: 1, labelAngle: 90, angles: { charge: 90 } })], bonds: [{ type: 1, atoms: [0, 1] }] }, 1],
  ];
  for (const [what, m, i] of cases) {
    const d = drawn(m, i), xml = toCdxml(m, DEFAULT_STYLE), flat = xml.replace(/\n/g, " ");
    const p = [...flat.matchAll(/<n\s[^>]*?p="([\d.-]+) ([\d.-]+)"/g)].map((x) => [Number(x[1]), Number(x[2])])[i];
    const g = /BoundingBox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"[^>]*SymbolType="(\w+)"/.exec(flat)!;
    assert.ok(g, `${what}: a symbol`);
    const c = g[5].startsWith("Radical") ? [(+g[1] + +g[3]) / 2, (+g[2] + +g[4]) / 2] : [+g[1], +g[2]], deg = way(c, p), r = Math.hypot(c[0] - p[0], c[1] - p[1]) * pt;
    assert.ok(off(deg, d.deg) < 15 && Math.abs(r - d.r) < 3, `${what}: CDXML writes the symbol where it is drawn (${deg.toFixed(0)}° ${r.toFixed(1)} px against ${d.deg.toFixed(0)}° ${d.r.toFixed(1)} px)`);
    const back = drawn(fromCdxml(xml.replace(/ Octet="[^"]*"/g, "")).mol, i);
    assert.ok(off(back.deg, d.deg) < 15 && Math.abs(back.r - d.r) < 3, `${what}: ChemDraw's file draws it where it was (${back.deg.toFixed(0)}° against ${d.deg.toFixed(0)}°)`);
  }
}
console.log("chargelabels.check: a sign clear of the whole label in CDXML ok");
