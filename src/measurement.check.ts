// Run: node src/measurement.check.ts. Fails loudly if a distance, angle or dihedral measurement (issue 85) reads a
// wrong value, loses its atoms in an edit, or is read as chemistry. The plan: docs/plans/issue-85-measurements.md.
import assert from "node:assert/strict";
import { clean3d } from "./clean3d.ts";
import { EMPTY, addCaption, addRing, deleteAtoms, transformParts } from "./edit.ts";
import { addMeasure, chainOrder, measureFrame, measureInk, measureText, measureValue, remapCaption, settleMeasures, soundMeasure } from "./measurement.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { ASCENT, DESCENT, type Caption, type Mol } from "./render.ts";

const all = (m: Mol) => m.atoms.map((_, i) => i);
const C = (x: number, y: number, z = 0) => ({ label: "C", location: [x, y, z] as [number, number, number] });
const near = (a: number | undefined, b: number, tol: number, what: string) => assert.ok(a !== undefined && Math.abs(a - b) <= tol, `${what}: ${a} not ${b} ± ${tol}`);
const caption = (m: Mol, id: number) => m.captions!.find((c) => c.id === id)!;
const made = (r: ReturnType<typeof addMeasure>) => { assert.ok(typeof r !== "string", String(r)); return r; };
const chain = (n: number): Mol => ({ atoms: Array.from({ length: n }, (_, k) => C(k * 0.866, k % 2 ? 0.5 : 0)), bonds: Array.from({ length: n - 1 }, (_, k) => ({ type: 1, atoms: [k, k + 1] as [number, number] })) });

// J1: values on built geometries.
{
  // Ethane after 3D Clean Up: 1.52 Å.
  const ethane = clean3d(chain(2), [0, 1]);
  near(measureValue(ethane, [0, 1]), 1.52, 0.02, "ethane C–C");
  // Benzene: its C–C bonds read about 1.38 to 1.40 Å (3D Clean Up's aromatic ratio), drawn flat or cleaned up.
  const benzene = addRing(EMPTY, 6, true, { point: [0, 0] });
  for (const m of [benzene, clean3d(benzene, all(benzene))]) for (const b of m.bonds) { const v = measureValue(m, b.atoms)!; assert.ok(v >= 1.37 && v <= 1.41, `benzene C–C ${v}`); }
  // Cyclohexane chair: dihedrals about 55° alternating in sign.
  const ring = clean3d(addRing(EMPTY, 6, false, { point: [0, 0] }), [0, 1, 2, 3, 4, 5]);
  const t = [0, 1, 2, 3, 4, 5].map((k) => measureValue(ring, [k, (k + 1) % 6, (k + 2) % 6, (k + 3) % 6].map((i) => i))!);
  assert.ok(t.every((x, k) => Math.abs(Math.abs(x) - 55) < 12 && Math.sign(x) !== Math.sign(t[(k + 1) % 6])), `chair dihedrals ${t.map((x) => x.toFixed(1))}`);
  for (let k = 0; k < 6; k++) near(measureValue(ring, [k, (k + 1) % 6, (k + 2) % 6]), 109.5, 4, "chair angle");
  // Butane on set coordinates (one bond = 1.52 Å): anti 180°, gauche ±60° by IUPAC's sign (x right, y up, depth to the
  // viewer: seen along C2→C3, the near bond turning clockwise onto the far one is positive).
  const th = Math.acos(-1 / 3), s = Math.sin(th), c = -Math.cos(th);
  const butane = (phi: number): Mol => {
    // C2 at the origin, C3 along +z; C1 in the xz plane; C4 turned phi about the C2→C3 axis.
    const p = (x: number, y: number, z: number) => C(x, y, z);
    const r = (phi * Math.PI) / 180;
    return { atoms: [p(s, 0, -c), p(0, 0, 0), p(0, 0, 1), p(s * Math.cos(r), s * Math.sin(r), 1 + c)], bonds: [0, 1, 2].map((k) => ({ type: 1, atoms: [k, k + 1] as [number, number] })) };
  };
  near(Math.abs(measureValue(butane(180), [0, 1, 2, 3])!), 180, 0.1, "anti");
  // Seen along +z (from C2 to C3), with y up, x points to the viewer's left: C1 at 9 o'clock. C4 at phi = -60 is at
  // 7 o'clock... so +60° (anticlockwise in xy seen from +z, clockwise for a viewer looking along +z) is gauche+.
  near(measureValue(butane(60), [0, 1, 2, 3]), 60, 0.1, "gauche +60");
  near(measureValue(butane(-60), [0, 1, 2, 3]), -60, 0.1, "gauche −60");
  near(measureValue(butane(60), [3, 2, 1, 0]), 60, 0.1, "the same dihedral read the other way");
  near(measureValue(butane(60), [0, 3]), 1.52 * Math.hypot(s - s * 0.5, -s * Math.sin(Math.PI / 3), -c - 1 - c), 0.01, "a distance across the chain");
  near(measureValue(butane(60), [0, 1, 2]), (th * 180) / Math.PI, 0.1, "tetrahedral angle");
  // The text.
  assert.equal(measureText("distance", 2.5449), "2.54 Å");
  assert.equal(measureText("angle", 109.47), "109.5°");
  assert.equal(measureText("dihedral", -60.24), "−60.2°");
  assert.equal(measureText("dihedral", -0.04), "0.0°");
  assert.equal(measureText("dihedral", -179.98), "180.0°");
  assert.equal(measureText("angle", undefined), "–");
  assert.equal(measureText("distance", NaN), "–");
  console.log("measurement.check: values ok");
}

// Degenerate geometry never gives NaN or Infinity (S15).
{
  const m: Mol = { atoms: [C(0, 0), C(0, 0), C(1, 0), C(2, 0), C(3, 0)], bonds: [{ type: 1, atoms: [1, 2] }, { type: 3, atoms: [2, 3] }, { type: 1, atoms: [3, 4] }] };
  near(measureValue(m, [0, 1]), 0, 1e-9, "two atoms at one point");
  assert.equal(measureValue(m, [0, 1, 2]), undefined, "an angle with a leg of no length");
  assert.equal(measureValue(m, [1, 2, 3, 4]), undefined, "a dihedral across C≡C in a line");
  // 2-Butyne after 3D Clean Up: still no dihedral.
  const butyne = clean3d({ atoms: [C(0, 0), C(1, 0), C(2, 0), C(3, 0)], bonds: [{ type: 1, atoms: [0, 1] }, { type: 3, atoms: [1, 2] }, { type: 1, atoms: [2, 3] }] }, [0, 1, 2, 3]);
  assert.equal(measureValue(butyne, [0, 1, 2, 3]), undefined, "2-butyne's dihedral is undefined");
  const one = made(addMeasure(m, [1, 2, 3, 4], "pick"));
  assert.equal(caption(one.mol, one.id).text, "–");
  console.log("measurement.check: degenerate ok");
}

// Invariance (S11 to S13): a turn, a 3D turn and a scale keep the values; a flip changes a dihedral's sign.
{
  const base = clean3d(chain(5), [0, 1, 2, 3, 4]);
  const values = (m: Mol) => [measureValue(m, [0, 4])!, measureValue(m, [0, 1, 2])!, measureValue(m, [0, 1, 2, 3])!];
  const v0 = values(base);
  const turn = (m: Mol, deg: number) => { const r = (deg * Math.PI) / 180; return transformParts(m, new Set(all(m)), new Set(), ([x, y]) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]); };
  const tilt = (m: Mol, deg: number): Mol => { const r = (deg * Math.PI) / 180; return { ...m, atoms: m.atoms.map((a) => ({ ...a, location: [a.location[0], a.location[1] * Math.cos(r) - a.location[2] * Math.sin(r), a.location[1] * Math.sin(r) + a.location[2] * Math.cos(r)] as [number, number, number] })) }; };
  const scale = (m: Mol, k: number): Mol => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, location: a.location.map((x) => x * k) as [number, number, number] })) });
  const flip = (m: Mol): Mol => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, location: [-a.location[0], a.location[1], a.location[2]] as [number, number, number] })) });
  for (const [what, m] of [["turn 37°", turn(base, 37)], ["3D turn", tilt(base, 50)], ["scale 50%", scale(base, 0.5)], ["Rotate 180°", turn(base, 180)]] as const) {
    values(m).forEach((v, k) => near(v, v0[k], 1e-3, what));
  }
  const f = values(flip(base));
  near(f[0], v0[0], 1e-6, "flip distance");
  near(f[1], v0[1], 1e-6, "flip angle");
  near(f[2], -v0[2], 1e-6, "flip dihedral");
  // A document style change (another bond length in pt) is no change to the drawing's bond lengths: the same values.
  const restyled = { ...base, style: { ...DEFAULT_STYLE, bond: 30 } };
  values(restyled).forEach((v, k) => near(v, v0[k], 1e-9, "style"));
  console.log("measurement.check: invariance ok");
}

// The order rule: along the bonds when the atoms make a chain, else as picked.
{
  const m = chain(5);
  assert.deepEqual(chainOrder(m, [0, 2, 1]), [0, 1, 2], "the middle atom of an angle is the one bonded to both");
  assert.deepEqual(chainOrder(m, [1, 3, 0, 2]), [3, 2, 1, 0], "a dihedral runs along its bonds, from the end given first");
  assert.deepEqual(chainOrder(m, [0, 2, 4]), [0, 2, 4], "no chain: as picked");
  assert.deepEqual(chainOrder(m, [2, 1, 0]), [2, 1, 0], "a chain as picked stays");
  assert.deepEqual(chainOrder(m, [4, 0]), [4, 0]);
  console.log("measurement.check: order ok");
}

// soundMeasure (S23): anything but 2 to 4 distinct atoms of the drawing, and a sane offset, is not a measurement.
{
  const n = 5;
  for (const bad of [null, 3, "x", {}, { atoms: [0] }, { atoms: [0, 1, 2, 3, 4] }, { atoms: [0, 0] }, { atoms: [-1, 2] }, { atoms: [0, 99999] }, { atoms: ["0", "1"] }, { atoms: [0, NaN] }, { atoms: [0, 1.5] },
    { atoms: [0, 1], at: [1e9, 0] }, { atoms: [0, 1], at: [NaN, 0] }, { atoms: [0, 1], at: [1] }, { atoms: [0, 1], at: "x" }]) assert.equal(soundMeasure(bad, n), false, JSON.stringify(bad));
  assert.ok(soundMeasure({ atoms: [0, 1] }, n) && soundMeasure({ atoms: [4, 3, 2, 1], at: [0.5, -1] }, n));
  console.log("measurement.check: soundMeasure ok");
}

// settleMeasures: no cost without measurements (the same object); an unsound one becomes plain text; the label follows
// a dragged atom; a label moved alone keeps its offset through a turn.
{
  const plain = chain(4);
  assert.equal(settleMeasures(undefined, plain), plain, "no measurement: the drawing itself");
  const withText = addCaption(plain, { text: "hello", x: 0, y: 0 })[0];
  assert.equal(settleMeasures(plain, withText), withText);
  const r = made(addMeasure(plain, [0, 3]));
  assert.equal(r.cleaned.length, 1, "a flat structure is cleaned up in 3D first");
  // (Anti butane is flat in 3D too; a ring is not.)
  const hexane = made(addMeasure(addRing(EMPTY, 6, false, { point: [0, 0] }), [0, 3]));
  assert.ok(hexane.mol.atoms.some((a) => Math.abs(a.location[2]) > 1e-3), "a ring has depth after");
  const m = r.mol, c0 = caption(m, r.id);
  assert.match(c0.text, /^\d\.\d\d Å$/);
  assert.equal(c0.chemical, false, "Interpret Chemically off");
  assert.equal(settleMeasures(m, m), m, "settled already: the same object");
  // Unsound atoms (an edit that did not remap them): plain text.
  const broken = { ...m, captions: m.captions!.map((c) => ({ ...c, measure: { atoms: [0, 99] } })) };
  const fixed = settleMeasures(undefined, broken);
  assert.equal(caption(fixed, r.id).measure, undefined);
  assert.equal(caption(fixed, r.id).text, c0.text);
  // A dragged atom: value and label follow.
  const dragged = { ...m, atoms: m.atoms.map((a, i) => (i === 3 ? { ...a, location: [a.location[0] + 2, a.location[1] + 1, a.location[2]] as [number, number, number] } : a)) };
  const after = settleMeasures(m, dragged), c1 = caption(after, r.id);
  assert.notEqual(c1.text, c0.text, "the value follows");
  assert.ok(Math.hypot(c1.x - c0.x, c1.y - c0.y) > 0.5, "the label follows");
  // The label moved alone: it stays there, and keeps its place in its frame through a turn of the structure.
  const moved = { ...after, captions: after.captions!.map((c) => (c.id === r.id ? { ...c, x: c.x + 1, y: c.y + 2 } : c)) };
  const kept = settleMeasures(after, moved), c2 = caption(kept, r.id);
  near(c2.x, c1.x + 1, 1e-6, "moved label x");
  near(c2.y, c1.y + 2, 1e-6, "moved label y");
  assert.ok(c2.measure!.at, "its offset is kept");
  const turned = settleMeasures(kept, transformParts(kept, new Set(all(kept)), new Set([r.id]), ([x, y]) => [-y, x]));
  const c3 = caption(turned, r.id), f2 = measureFrame(kept, c2.measure!.atoms), f3 = measureFrame(turned, c3.measure!.atoms);
  // The label's middle in each frame is the same.
  const lift = ((ASCENT - DESCENT) / 2) * (DEFAULT_STYLE.captionSize / DEFAULT_STYLE.bond);
  const off = (c: Caption, f: typeof f2) => { const d = [c.x - f.o[0], c.y + lift - f.o[1]]; return [d[0] * f.u[0] + d[1] * f.u[1], d[0] * f.v[0] + d[1] * f.v[1]]; };
  off(c2, f2).forEach((v, k) => near(off(c3, f3)[k], v, 1e-6, "offset through a turn"));
  assert.equal(c3.text, c2.text, "a turn keeps the value");
  console.log("measurement.check: settle ok");
}

// Lines: only where no bond joins two atoms in a row; an angle has an arc, a dihedral none.
{
  const m = chain(5);
  assert.equal(measureInk(m, [0, 4]).lines.length, 1);
  assert.equal(measureInk(m, [0, 1]).lines.length, 0, "a bond already shows a bonded distance");
  const angle = measureInk(m, [0, 1, 2]);
  assert.equal(angle.lines.length, 0);
  assert.ok(angle.arc && Math.abs(Math.abs(angle.arc.sweep) - (120 * Math.PI) / 180) < 1e-3, "the arc goes the short way");
  assert.equal(measureInk(m, [0, 1, 2, 3]).arc, undefined, "no arc on a dihedral");
  assert.equal(measureInk(m, [0, 2, 4]).lines.length, 2);
  const trimmed = measureInk(m, [0, 4], () => 0.3).lines[0], whole = measureInk(m, [0, 4]).lines[0];
  near(Math.hypot(trimmed[1][0] - trimmed[0][0], trimmed[1][1] - trimmed[0][1]), Math.hypot(whole[1][0] - whole[0][0], whole[1][1] - whole[0][1]) - 0.6, 1e-9, "cut back for labels");
  console.log("measurement.check: ink ok");
}

// addMeasure: the same measurement asked for twice is made once (S35), in either order; bad atoms say why.
{
  const r = made(addMeasure(chain(4), [0, 1, 2, 3]));
  const again = made(addMeasure(r.mol, [3, 2, 1, 0]));
  assert.equal(again.made, false);
  assert.equal(again.id, r.id);
  assert.equal(again.mol, r.mol);
  assert.equal(again.mol.captions!.filter((c) => c.measure).length, 1);
  for (const bad of [[0], [0, 1, 2, 3, 0], [0, 0], [0, 9], [-1, 0], [0.5, 1]]) assert.equal(typeof addMeasure(r.mol, bad), "string", JSON.stringify(bad));
  // A structure with depth already is not cleaned up again.
  const second = made(addMeasure(r.mol, [0, 2]));
  assert.deepEqual(second.cleaned, []);
  assert.equal(second.mol.atoms, r.mol.atoms);
  // S8: atoms of two flat structures: both cleaned up.
  const two: Mol = { atoms: [...chain(3).atoms, ...chain(3).atoms.map((a) => ({ ...a, location: [a.location[0], a.location[1] + 4, 0] as [number, number, number] }))], bonds: [...chain(3).bonds, ...chain(3).bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + 3, b.atoms[1] + 3] as [number, number] }))] };
  const across = made(addMeasure(two, [0, 5]));
  assert.equal(across.cleaned.length, 2);
  near(measureValue(across.mol, [0, 5]), 1.52 * Math.hypot(...[0, 1, 2].map((k) => across.mol.atoms[5].location[k] - across.mol.atoms[0].location[k])), 0.05, "their distance as placed");
  console.log("measurement.check: addMeasure ok");
}

// remapCaption: a measurement copied with all its atoms keeps them; without one, plain text.
{
  const c: Caption = { id: 1, text: "1.52 Å", x: 0, y: 0, measure: { atoms: [2, 5] } };
  assert.deepEqual(remapCaption(c, (i) => i + 10).measure, { atoms: [12, 15] });
  assert.equal(remapCaption(c, (i) => (i === 2 ? 0 : undefined)).measure, undefined);
  assert.equal(remapCaption(c, () => 0).measure, undefined, "two atoms made one");
  assert.equal(deleteAtoms({ ...chain(3), captions: [c] }, new Set([0])).captions?.length, 0);
  console.log("measurement.check: remap ok");
}

// J5: files. .oct (its JSON, and its CDXML when another program changed it), CDXML and CDX keep the measurements;
// the lines are written for ChemDraw and skipped when Octet reads its own file back (not doubled).
{
  const { writeOct, readOct, writeCdx, readCdx } = await import("./oct.ts");
  const { toCdxml, fromCdxml } = await import("./cdxml.ts");
  const { parse, serialize } = await import("./file.ts");
  let m = chain(6);
  for (const atoms of [[0, 5], [0, 1, 2], [1, 2, 3, 4], [0, 2, 4]]) m = made(addMeasure(m, atoms)).mol;
  // One moved by hand, one coloured and bold.
  const ids = m.captions!.map((c) => c.id);
  m = settleMeasures(m, { ...m, captions: m.captions!.map((c) => (c.id === ids[0] ? { ...c, x: c.x + 0.7, y: c.y - 0.4 } : c.id === ids[1] ? { ...c, colour: "#C00000", bold: true } : c)) });
  const style = DEFAULT_STYLE;
  const same = (back: Mol, what: string) => {
    const got = back.captions!.filter((c) => c.measure), want = m.captions!.filter((c) => c.measure);
    assert.equal(got.length, want.length, `${what}: every measurement`);
    for (const w of want) {
      // CDXML keeps places to 0.01 pt, so a value read back from it may differ in its last place.
      const value = (t: string) => Number(t.replace("−", "-").replace(/[^\d.-]/g, ""));
      const g = got.find((c) => JSON.stringify(c.measure!.atoms) === JSON.stringify(w.measure!.atoms));
      assert.ok(g && Math.abs(value(g.text) - value(w.text)) <= 0.15 && g.text.slice(-1) === w.text.slice(-1), `${what}: ${w.text} on ${w.measure!.atoms}: ${g?.text}`);
      near(g.x, w.x, 0.02, `${what} x`);
      near(g.y, w.y, 0.02, `${what} y`);
      assert.equal(!!g.measure!.at, !!w.measure!.at, `${what}: a label moved by hand stays so`);
      assert.equal(g.colour, w.colour);
      assert.equal(!!g.bold, !!w.bold);
    }
    assert.equal(back.arrows?.length ?? 0, 0, `${what}: the lines are not read back as lines`);
  };
  same(parse(serialize(m)), ".oct JSON");
  same(readOct(writeOct(m, style), true).mol, ".oct");
  const cdxml = toCdxml(m, style);
  assert.match(cdxml, /LineType="Dashed"/, "the lines are written for ChemDraw");
  assert.match(cdxml, /GraphicType="Arc"/, "and the angle's arc");
  assert.match(cdxml, /InterpretChemically="no"/);
  same(fromCdxml(cdxml).mol, "CDXML");
  same(readCdx(writeCdx(m, style)).mol, "CDX");
  // .oct with its CDXML changed by another program: read from the CDXML.
  const oct = writeOct(m, style), changed = oct.replace("<CDXML ", "<CDXML Changed=\"1\" ");
  same(readOct(changed, true).mol, ".oct read from its CDXML");
  // As ChemDraw saves it: the Octet data gone. Text and dashed lines, nothing left out.
  const chemdraw = cdxml.replace(/ Octet="[^"]*"/g, "");
  const r = fromCdxml(chemdraw);
  assert.equal(r.mol.captions!.filter((c) => c.measure).length, 0, "ChemDraw's file: plain text");
  assert.ok(r.mol.captions!.some((c) => c.text === m.captions![0].text), "with the values as text");
  assert.ok((r.mol.arrows ?? []).filter((a) => a.style === "dashed").length >= 3, "and the dashed lines");
  assert.deepEqual(r.lost, {}, "nothing left out");
  console.log("measurement.check: files ok");
}

// S23, S24: hostile files open, and each unsound measurement is plain text.
{
  const { parse, serialize } = await import("./file.ts");
  const { toCdxml, fromCdxml } = await import("./cdxml.ts");
  const base = made(addMeasure(chain(4), [0, 3])).mol, json = JSON.parse(serialize(base));
  for (const bad of [{ atoms: [-1, 2] }, { atoms: [0, 99999] }, { atoms: [0] }, { atoms: [0, 1, 2, 3, 0] }, { atoms: [0, 1, 2, 3, 2] }, { atoms: [1, 1] }, { atoms: ["0", "1"] }, { atoms: [0, null] }, { atoms: [0, 1], at: [1e9, 0] }, "x", 7, null, []]) {
    const doc = { ...json, captions: json.captions.map((c: Record<string, unknown>) => ({ ...c, measure: bad })) };
    const back = parse(JSON.stringify(doc));
    assert.equal(back.captions![0].measure, undefined, JSON.stringify(bad));
    assert.equal(back.captions![0].text, base.captions![0].text);
  }
  // CDXML with Octet data naming nodes that are not there.
  const cdxml = toCdxml(base, DEFAULT_STYLE).replace(/&quot;measure&quot;:\{&quot;atoms&quot;:\[[^\]]*\]/, "&quot;measure&quot;:{&quot;atoms&quot;:[999999,888888]");
  assert.ok(cdxml.includes("999999"), "the test file names missing nodes");
  const back = fromCdxml(cdxml).mol;
  assert.equal(back.captions!.filter((c) => c.measure).length, 0, "missing nodes: plain text");
  // 10,000 measurement captions in a JSON file: within the reader's limits, it opens (or is refused as damaged).
  const many = { ...json, captions: Array.from({ length: 10000 }, () => json.captions[0]) };
  const t = performance.now();
  try { const opened = parse(JSON.stringify(many)); assert.equal(opened.captions!.filter((c) => c.measure).length, 10000); } catch (e) { assert.match(String(e), /damaged/); }
  assert.ok(performance.now() - t < 5000, "quickly");
  console.log("measurement.check: hostile files ok");
}
