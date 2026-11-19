// Run: node src/measurement.check.ts. Fails loudly if a distance, angle or dihedral measurement (issue 85) reads a
// wrong value, loses its atoms in an edit, or is read as chemistry. The plan: docs/plans/issue-85-measurements.md.
import assert from "node:assert/strict";
import { clean3d } from "./clean3d.ts";
import { EMPTY, addCaption, addMeasure, addRing, deleteAtoms, transformParts } from "./edit.ts";
import { chainOrder, middleOf, measureFrame, measureInk, measureText, measureValue, remapCaption, settleMeasures, soundMeasure, readMeasure, placeEnd } from "./measurement.ts";
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

// The median the Å scale takes (middleOf): the value a sort puts in the middle, duplicates and all.
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < 300; t++) {
    const v = Array.from({ length: 1 + Math.floor(rnd() * 60) }, () => (rnd() < 0.3 ? 1 : Math.round(rnd() * 20) / 4));
    const sorted = [...v].sort((p, q) => p - q);
    assert.equal(middleOf([...v]), sorted[Math.floor(v.length / 2)], JSON.stringify(v));
  }
  console.log("measurement.check: median ok");
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

// soundMeasure (S23): anything but 2 to 4 ends (distinct atoms of the drawing, or points on the page), a dihedral's
// four all atoms, and a sane offset, is not a measurement. readMeasure reads the old form ({ atoms }) too (S45).
{
  const n = 5;
  for (const bad of [null, 3, "x", {}, { ends: [0] }, { ends: [0, 1, 2, 3, 4] }, { ends: [0, 0] }, { ends: [-1, 2] }, { ends: [0, 99999] }, { ends: ["0", "1"] }, { ends: [0, NaN] }, { ends: [0, 1.5] },
    { ends: [0, 1], at: [1e9, 0] }, { ends: [0, 1], at: [NaN, 0] }, { ends: [0, 1], at: [1] }, { ends: [0, 1], at: "x" }, { ends: [0, [1, 2, 3]] }, { ends: [0, [1]] }, { ends: [0, [NaN, 1]] }, { ends: [0, [1e9, 1]] },
    { ends: [0, 1, 2, [1, 1]] }, { ends: [[0, 0], 1, 2, 3] }, { atoms: [0, 1] }]) assert.equal(soundMeasure(bad, n), false, JSON.stringify(bad));
  assert.ok(soundMeasure({ ends: [0, 1] }, n) && soundMeasure({ ends: [4, 3, 2, 1], at: [0.5, -1] }, n));
  assert.ok(soundMeasure({ ends: [[0, 0], [1, 1]] }, n) && soundMeasure({ ends: [0, [1, 1], [2, -2]] }, n) && soundMeasure({ ends: [[3, 3], [3, 3]] }, 0), "free points, with atoms or alone");
  // The old form reads as ends that are all atoms; the new form wins when a file has both; a copy comes back.
  assert.deepEqual(readMeasure({ atoms: [0, 3], at: [0.5, 1] }, n), { ends: [0, 3], at: [0.5, 1] });
  assert.deepEqual(readMeasure({ atoms: [0, 3], ends: [1, [2, 2]] }, n), { ends: [1, [2, 2]] });
  const point: [number, number] = [2, 2], read = readMeasure({ ends: [1, point] }, n)!;
  assert.notEqual(read.ends[1], point, "a copy");
  for (const bad of [{ atoms: [0, 9] }, { atoms: [0] }, { atoms: [1, 1] }, { ends: "x", atoms: [0, 1] }]) assert.equal(readMeasure(bad, n), undefined, JSON.stringify(bad));
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
  // Measuring never changes the drawing (D2): a flat structure stays flat, and reads its flat values.
  assert.equal(r.mol.atoms, plain.atoms, "the atoms as they were");
  assert.equal(r.mol.bonds, plain.bonds);
  const ring = addRing(EMPTY, 6, false, { point: [0, 0] }), hexane = made(addMeasure(ring, [0, 1, 2]));
  assert.equal(hexane.mol.atoms, ring.atoms, "a flat ring stays flat");
  assert.equal(caption(hexane.mol, hexane.id).text, "120.0°", "and reads its flat angle");
  const m = r.mol, c0 = caption(m, r.id);
  assert.match(c0.text, /^\d\.\d\d Å$/);
  assert.equal(c0.chemical, false, "Interpret Chemically off");
  assert.equal(settleMeasures(m, m), m, "settled already: the same object");
  // Unsound atoms (an edit that did not remap them): plain text.
  const broken = { ...m, captions: m.captions!.map((c) => ({ ...c, measure: { ends: [0, 99] } })) };
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
  const c3 = caption(turned, r.id), f2 = measureFrame(kept, c2.measure!.ends), f3 = measureFrame(turned, c3.measure!.ends);
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
  for (const bad of [[0], [0, 1, 2, 3, 0], [0, 0], [0, 9], [-1, 0], [0.5, 1], [0, 1, 2, [5, 5]], [[0, 0], 1, 2, 3], [0, [NaN, 1]]] as Parameters<typeof addMeasure>[1][]) assert.equal(typeof addMeasure(r.mol, bad), "string", JSON.stringify(bad));
  assert.equal(addMeasure(r.mol, [0, 1, 2, [5, 5]]), "A dihedral takes 4 atoms.", "a dihedral of atoms only");
  // Measuring a structure never changes it.
  const second = made(addMeasure(r.mol, [0, 2]));
  assert.equal(second.mol.atoms, r.mol.atoms);
  // S8: atoms of two flat structures: their distance as placed, and nothing moves.
  const two: Mol = { atoms: [...chain(3).atoms, ...chain(3).atoms.map((a) => ({ ...a, location: [a.location[0], a.location[1] + 4, 0] as [number, number, number] }))], bonds: [...chain(3).bonds, ...chain(3).bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + 3, b.atoms[1] + 3] as [number, number] }))] };
  const across = made(addMeasure(two, [0, 5]));
  assert.equal(across.mol.atoms, two.atoms);
  near(measureValue(across.mol, [0, 5]), 1.52 * Math.hypot(...[0, 1, 2].map((k) => across.mol.atoms[5].location[k] - across.mol.atoms[0].location[k])), 0.05, "their distance as placed");
  console.log("measurement.check: addMeasure ok");
}

// remapCaption: a measurement copied with all its atoms keeps them; without one, plain text.
{
  const c: Caption = { id: 1, text: "1.52 Å", x: 0, y: 0, measure: { ends: [2, 5] } };
  assert.deepEqual(remapCaption(c, (i) => i + 10).measure, { ends: [12, 15] });
  assert.deepEqual(remapCaption({ ...c, measure: { ends: [2, [4, 5]] } }, (i) => i + 10).measure, { ends: [12, [4, 5]] }, "a free end stays where it is");
  assert.deepEqual(remapCaption({ ...c, measure: { ends: [[1, 1], [4, 5]] } }, () => undefined).measure, { ends: [[1, 1], [4, 5]] }, "no atom: nothing to remap");
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
      const g = got.find((c) => JSON.stringify(c.measure!.ends) === JSON.stringify(w.measure!.ends));
      assert.ok(g && Math.abs(value(g.text) - value(w.text)) <= 0.15 && g.text.slice(-1) === w.text.slice(-1), `${what}: ${w.text} on ${w.measure!.ends}: ${g?.text}`);
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
  const cdxml = toCdxml(base, DEFAULT_STYLE).replace(/&quot;measure&quot;:\{&quot;ends&quot;:\[[^\]]*\]/, "&quot;measure&quot;:{&quot;atoms&quot;:[999999,888888]");
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

// J2, siblings: every edit that renumbers or copies atoms keeps a measurement with its atoms, or makes it plain text.
{
  const { contractLabel, duplicateSelection, extractSelection, insertMol, joinOverlaps, scaleSettings, tidyGroups, labelable, addTemplate, moveAtoms } = await import("./edit.ts");
  const { toCdxml, fromCdxml } = await import("./cdxml.ts");
  const base = made(addMeasure(chain(5), [1, 2, 3, 4])).mol, id = base.captions![0].id;
  const m0 = base.captions![0];
  // S9: deleting a measured atom removes the measurement in the same step; deleting another atom renumbers it.
  assert.equal(deleteAtoms(base, new Set([3])).captions!.filter((c) => c.measure).length, 0);
  const less = deleteAtoms(base, new Set([0]));
  assert.deepEqual(less.captions![0].measure!.ends, [0, 1, 2, 3], "renumbered");
  assert.equal(settleMeasures(base, less).captions![0].text, m0.text, "the same value");
  // S40: Contract Label over a measured atom ends that measurement; one on the label's own atom stays.
  const two = made(addMeasure(base, [0, 2])).mol;
  const contracted = contractLabel(two, 2, new Set([2, 3, 4]), "Pr");
  assert.equal(contracted.captions!.filter((c) => c.measure).length, 1, "the dihedral went with its atoms");
  assert.deepEqual(contracted.captions!.find((c) => c.measure)!.measure!.ends, [0, 2], "the distance to the label's atom stays");
  // A join: a measured atom dropped on another atom goes on as that atom; two of its atoms made one end it.
  const apart = { ...base, atoms: [...base.atoms, { label: "C", location: [9, 9, 0] as [number, number, number] }] };
  const onto = joinOverlaps(moveAtoms(apart, new Set([5]), [base.atoms[4].location[0] - 9, base.atoms[4].location[1] - 9]), new Set([5]));
  assert.deepEqual(onto.mol.captions![0].measure!.ends, [1, 2, 3, 4], "a free atom dropped on a measured one: the measurement stays");
  const merged = joinOverlaps(moveAtoms(base, new Set([4]), [base.atoms[1].location[0] - base.atoms[4].location[0], base.atoms[1].location[1] - base.atoms[4].location[1]]), new Set([4]));
  assert.equal(merged.mol.captions!.filter((c) => c.measure).length, 0, "two of its atoms made one");
  // Copy (extractSelection) and paste (insertMol): with its atoms, a measurement of the new atoms (S16); picked without
  // them, plain text (S17).
  const all5 = new Set([0, 1, 2, 3, 4]);
  const part = extractSelection(base, all5, new Set());
  assert.deepEqual(part.captions![0].measure!.ends, [1, 2, 3, 4], "copied with its structure");
  const pasted = insertMol(base, part, [10, 0]).mol, again = settleMeasures(base, pasted);
  assert.equal(again.captions!.filter((c) => c.measure).length, 2);
  assert.deepEqual(again.captions![1].measure!.ends, [6, 7, 8, 9], "the new atoms");
  assert.equal(again.captions![1].text, m0.text, "the same value");
  const alone = extractSelection(base, new Set([0, 1, 2]), new Set([id]));
  assert.equal(alone.captions![0].measure, undefined, "a label copied without its atoms is plain text");
  assert.equal(alone.captions![0].text, m0.text);
  // S18: ⌘D (duplicateSelection) gives the copy its own measurement.
  const dup = duplicateSelection(base, all5, new Set());
  assert.deepEqual(dup.mol.captions!.map((c) => c.measure?.ends), [[1, 2, 3, 4], [6, 7, 8, 9]]);
  const dupAlone = duplicateSelection(base, new Set(), new Set([id]));
  assert.equal(dupAlone.mol.captions![1].measure, undefined, "the label alone duplicated: plain text");
  // S39: a template with a measurement, placed twice: each copy measures its own atoms.
  let placed = addTemplate(EMPTY, base, { point: [0, 0] });
  placed = addTemplate(placed, base, { point: [10, 0] });
  const ms = settleMeasures(undefined, placed).captions!.filter((c) => c.measure);
  assert.equal(ms.length, 2);
  assert.notDeepEqual(ms[0].measure!.ends, ms[1].measure!.ends);
  assert.ok(ms.every((c) => c.text === m0.text), `each copy measures its own atoms: ${ms.map((c) => c.text)}`);
  // Copy as CDXML of a selection (cdxml.ts pick): with its atoms, the measurement goes; without, the text alone.
  const sel = toCdxml(base, DEFAULT_STYLE, { selection: { atoms: all5, items: [id] } });
  assert.equal(fromCdxml(sel).mol.captions!.filter((c) => c.measure).length, 1);
  const selAlone = toCdxml(base, DEFAULT_STYLE, { selection: { atoms: [0, 1], items: [id] } });
  assert.equal(fromCdxml(selAlone).mol.captions!.filter((c) => c.measure).length, 0);
  // Groups take a measurement with its structure (it is attached text).
  const grouped = tidyGroups({ ...base, groups: [{ id: 900, atoms: [0, 1, 2, 3, 4], items: [] }, { id: 901, atoms: [], items: [] }] });
  assert.ok(grouped.groups!.some((g) => g.items.includes(id)), "a group of its structure holds it");
  // Scale with labels: its text grows when its atoms are scaled.
  assert.equal(scaleSettings(base, all5, new Set(), 2, 10).captions![0].size, 20);
  // Never chemistry: no Make element.
  assert.equal(labelable({ ...m0, text: "C" }), false);
  console.log("measurement.check: siblings ok");
}

// S33, S34: a measurement label is not a reaction's conditions, and never joins a catalytic cycle.
{
  const { findReaction } = await import("./reaction.ts");
  const { dropOnCycle } = await import("./cycle.ts");
  const { addArrow, addCycle, fragments, insertMol } = await import("./edit.ts");
  // A → B with a measurement of B's atoms whose label sits over the arrow.
  const a = chain(3), b = { ...chain(3), atoms: chain(3).atoms.map((x) => ({ ...x, location: [x.location[0] + 6, x.location[1], 0] as [number, number, number] })) };
  let m = insertMol(a, b).mol;
  [m] = addArrow(m, { kind: "reaction", from: [2.5, 0.2], to: [5, 0.2] });
  const r0 = made(addMeasure(m, [3, 5]));
  const lab = r0.mol.captions!.find((c) => c.id === r0.id)!;
  m = { ...r0.mol, captions: r0.mol.captions!.map((c) => (c.id === r0.id ? { ...c, x: 3.75, y: 0.8, measure: { ...c.measure!, at: [0, 0] as [number, number] } } : c)) };
  const ink = (atoms: number[]) => { const ps = atoms.map((i) => m.atoms[i].location); return [Math.min(...ps.map((p) => p[0])) - 0.3, Math.min(...ps.map((p) => p[1])) - 0.3, Math.max(...ps.map((p) => p[0])) + 0.3, Math.max(...ps.map((p) => p[1])) + 0.3] as [number, number, number, number]; };
  const box = (id: number) => { const c = m.captions?.find((x) => x.id === id); return c ? [c.x - 1, c.y - 0.3, c.x + 1, c.y + 0.4] as [number, number, number, number] : undefined; };
  const arrowId = m.arrows![0].id, read = findReaction(m, arrowId, m.arrows!, ink, box);
  assert.ok(read, "the reaction reads");
  assert.ok(!JSON.stringify(read!.steps).includes(`"id":${lab.id}`), "the measurement is not a step or its conditions");
  const said = (r: NonNullable<typeof read>) => JSON.stringify([r.steps, [...r.conditions.values()]]);
  assert.ok(!said(read!).includes(`"id":${lab.id}`), "nor its conditions");
  // The control: plain text in the same place is read as the arrow's conditions.
  const { measure: _m, ...asText } = m.captions!.find((x) => x.id === lab.id)!;
  m = { ...m, captions: m.captions!.map((x) => (x.id === lab.id ? asText : x)) };
  const control = findReaction(m, arrowId, m.arrows!, ink, box);
  assert.ok(said(control!).includes(`"id":${lab.id}`), "plain text there is read as part of the reaction");
  // A cycle with a break at its right: plain text dropped there joins it; a measurement label does not.
  let [c, cid] = addCycle(chain(2), { centre: [20, 0], radius: 3, clockwise: true, nodes: [], at: [] });
  c = (await import("./cycle.ts")).addStop(c, cid, 0, []);
  const near: Mol = { ...c, captions: [{ id: 50, text: "1.52 Å", x: 23, y: 0, measure: { ends: [0, 1] } }] };
  const opts = { box: (t: Caption) => [t.x - 0.5, t.y - 0.2, t.x + 0.5, t.y + 0.4] as [number, number, number, number], bond: 14.4 };
  const dropped = dropOnCycle(near, fragments(near), c, opts);
  assert.equal(dropped.captions![0].cycle, undefined, "a measurement never joins a cycle");
  const plain = dropOnCycle({ ...near, captions: [{ id: 50, text: "H2O", x: 23, y: 0 }] }, fragments(near), c, opts);
  assert.ok(plain.captions![0].cycle, "plain text there does (the control)");
  console.log("measurement.check: not chemistry ok");
}

// S36: a distance from a metal to a ring's multi-centre point is to the point, and follows the ring (the editor puts
// multi-centre points where their atoms are, then settles the measurements).
{
  const { placeCentres, moveAtoms } = await import("./edit.ts");
  const ring = [0, 1, 2, 3, 4].map((k) => ({ label: "C", location: [Math.cos((2 * Math.PI * k) / 5) * 0.85, 2 + Math.sin((2 * Math.PI * k) / 5) * 0.85, 0] as [number, number, number] }));
  const m: Mol = {
    atoms: [...ring, { label: "Fe", location: [0, 0, 0], shade: true }, { label: "C", location: [0, 2, 0], centre: { atoms: [0, 1, 2, 3, 4] } } as Mol["atoms"][number]],
    bonds: [...[0, 1, 2, 3, 4].map((k) => ({ type: 1, atoms: [k, (k + 1) % 5] as [number, number] })), { type: 1, atoms: [5, 6] as [number, number] }],
  };
  const r = made(addMeasure({ ...m, atoms: m.atoms.map((a) => ({ ...a, shade: true as const })) }, [5, 6]));
  const v0 = measureValue(r.mol, [5, 6])!;
  const up = settleMeasures(r.mol, placeCentres(moveAtoms(r.mol, new Set([0, 1, 2, 3, 4]), [0, 1])));
  assert.ok(Math.abs(up.atoms[6].location[1] - r.mol.atoms[6].location[1] - 1) < 1e-9, "the point follows its ring");
  assert.ok(measureValue(up, [5, 6])! > v0, "and the distance with it");
  assert.notEqual(up.captions![0].text, r.mol.captions![0].text);
  console.log("measurement.check: multi-centre ok");
}

// Notes (issues 101 and 102) on a measurement: its label is text, so it takes a note as any text does (Annotate…, the
// Notes panel's list), and the note stays on it through every edit and file that keeps the measurement. The note is in
// the label's own element in CDXML, never in its dashed lines. A picture's CDXML (withoutNotes) has the measurement and
// no note.
{
  const { allNotes, NOTE, noteOf, noteTargets, withNote, withoutNotes } = await import("./annotate.ts");
  const { duplicateSelection, extractSelection, insertMol, updateCaption } = await import("./edit.ts");
  const { toCdxml, fromCdxml } = await import("./cdxml.ts");
  const { parse, serialize } = await import("./file.ts");
  const { readOct, writeOct, readCdx, writeCdx } = await import("./oct.ts");
  const said = "Gauche in the crystal\nSI, page 4";
  // A distance across the chain, so it has a dashed line.
  const base = made(addMeasure(chain(5), [0, 4])).mol, id = base.captions![0].id;
  assert.deepEqual(noteTargets(base, new Set(), new Set([id])), [id], "a picked measurement takes a note");
  const m = withNote(base, [id], said);
  assert.equal(noteOf(m, id), said);
  assert.deepEqual(caption(m, id).measure, caption(base, id).measure, "and stays a measurement");
  assert.deepEqual(allNotes(m).map((r) => r.on), [id], "the Notes panel lists it");
  // Edits: an atom dragged (its value changes), a turn, the label moved alone, typing over it (plain text now).
  const dragged = settleMeasures(m, { ...m, atoms: m.atoms.map((a, i) => (i === 4 ? { ...a, location: [a.location[0] + 0.4, a.location[1] - 0.3, (a.location[2] ?? 0) + 0.5] as [number, number, number] } : a)) });
  assert.notEqual(caption(dragged, id).text, caption(m, id).text, "the value follows the atom");
  assert.equal(noteOf(dragged, id), said, "a drag keeps the note");
  assert.equal(noteOf(settleMeasures(m, transformParts(m, new Set(all(m)), new Set([id]), ([x, y]) => [-y, x])), id), said, "a turn");
  const nudged = settleMeasures(m, updateCaption(m, id, { x: caption(m, id).x + 1 }));
  assert.ok(caption(nudged, id).measure!.at, "moved alone");
  assert.equal(noteOf(nudged, id), said, "the label moved alone");
  const typed = updateCaption(m, id, { text: "about 60°", measure: undefined });
  assert.equal(caption(typed, id).measure, undefined, "typed over: plain text");
  assert.equal(noteOf(typed, id), said, "with its note");
  // Copy and paste with its atoms, Duplicate, the label copied alone (plain text): the note comes too. An atom of it
  // deleted: the measurement goes with its note.
  const pasted = settleMeasures(m, insertMol(m, extractSelection(m, new Set(all(m)), new Set()), [10, 0]).mol);
  assert.deepEqual(pasted.captions!.map((c) => [!!c.measure, noteOf(pasted, c.id)]), [[true, said], [true, said]], "pasted");
  const dup = duplicateSelection(m, new Set(all(m)), new Set()).mol;
  assert.deepEqual(dup.captions!.map((c) => [!!c.measure, noteOf(dup, c.id)]), [[true, said], [true, said]], "duplicated");
  const alone = extractSelection(m, new Set(), new Set([id]));
  assert.deepEqual([alone.captions![0].measure, alone.captions![0].notes?.[0].content], [undefined, said], "the label alone");
  const gone = deleteAtoms(m, new Set([4]));
  assert.equal(gone.captions?.length ?? 0, 0);
  assert.deepEqual(allNotes(gone), [], "its note goes with it");
  // Files: .oct, its JSON, CDXML and CDX keep both.
  const both = (back: Mol, what: string) => {
    const c = back.captions!.find((x) => x.measure);
    assert.ok(c, `${what}: the measurement`);
    assert.deepEqual(c.measure!.ends, [0, 4], `${what}: its atoms`);
    assert.equal(noteOf(back, c.id), said, `${what}: its note`);
  };
  both(parse(serialize(m)), ".oct JSON");
  both(readOct(writeOct(m, DEFAULT_STYLE), true).mol, ".oct");
  const cdxml = toCdxml(m, DEFAULT_STYLE);
  both(fromCdxml(cdxml).mol, "CDXML");
  both(readCdx(writeCdx(m, DEFAULT_STYLE)).mol, "CDX");
  const label = /<t\n[^>]*InterpretChemically="no"[^>]*>((?:(?!<\/t>).)*)<\/t>/s.exec(cdxml);
  assert.ok(label && label[1].includes(`Keyword="${NOTE}"`), "the note is in the label's t");
  assert.match(cdxml, /LineType="Dashed"/);
  assert.equal(cdxml.match(/<annotation\n Keyword="Note"/g)?.length, 1, "once: its dashed line carries none");
  // ChemDraw's save (Octet's data gone): the label is plain text and keeps its note.
  const chemdraw = fromCdxml(cdxml.replace(/\n Octet="[^"]*"/g, "")).mol, text = chemdraw.captions!.find((c) => c.text === caption(m, id).text)!;
  assert.equal(text.measure, undefined);
  assert.equal(noteOf(chemdraw, text.id), said, "ChemDraw's file: the text keeps its note");
  // A picture, another app's clipboard, an object window: the measurement, its lines and value, and no note.
  const bare = withoutNotes(m);
  assert.deepEqual(caption(bare, id).measure, caption(m, id).measure);
  assert.equal(caption(bare, id).text, caption(m, id).text);
  assert.equal(settleMeasures(m, bare), bare, "nothing to settle again");
  const picture = toCdxml(bare, DEFAULT_STYLE);
  assert.ok(!picture.includes("Gauche"), "a picture's CDXML: no note");
  assert.match(picture, /LineType="Dashed"/, "and the measurement's lines");
  console.log("measurement.check: notes ok");
}

// Free ends (redesign of 19 November 2026, S41 to S45): values on the page plane, the Å scale with and without atoms,
// files and the clipboard, copy and paste, moves and transforms, an atom deleted from a mixed measurement, a dihedral of
// atoms only, the Measure tool's placing rule, and the old form ({ atoms }) opening in every format.
{
  const { writeOct, readOct, writeCdx, readCdx } = await import("./oct.ts");
  const { toCdxml, fromCdxml } = await import("./cdxml.ts");
  const { parse, serialize } = await import("./file.ts");
  const { extractSelection, insertMol, duplicateSelection, moveAtoms, updateCaption } = await import("./edit.ts");
  type Ends = Parameters<typeof addMeasure>[1];
  // S41: no atom end: one document bond length is 1.52 Å. Two free points two bond lengths apart: 3.04 Å.
  near(measureValue(EMPTY, [[0, 0], [2, 0]]), 3.04, 1e-9, "two free points");
  near(measureValue(EMPTY, [[1, 0], [0, 0], [0, 1]]), 90, 1e-9, "a free angle");
  // With an atom: the structure's own scale. A chain drawn twice as big: 2 drawing units is one bond, 1.52 Å.
  const big: Mol = { ...chain(3), atoms: chain(3).atoms.map((a) => ({ ...a, location: [a.location[0] * 2, a.location[1] * 2, 0] as [number, number, number] })) };
  const a0 = big.atoms[0].location;
  near(measureValue(big, [0, [a0[0], a0[1] + 2]]), 1.52, 1e-3, "atom to a free point, at the structure's scale");
  // Depth is left out for every end when one is free: the same chain with depth 3 everywhere.
  const deep: Mol = { ...big, atoms: big.atoms.map((a) => ({ ...a, location: [a.location[0], a.location[1], 3] as [number, number, number] })) };
  near(measureValue(deep, [0, [a0[0], a0[1] + 2]]), 1.52, 1e-3, "on the page plane");
  near(measureValue(deep, [0, 2]), measureValue(big, [0, 2])!, 1e-9, "all atoms: in 3D as before");
  // Measuring changes nothing in the drawing (atoms identical before and after), with free ends too.
  const r1 = made(addMeasure(big, [0, [a0[0], a0[1] + 2]], "pick"));
  assert.equal(r1.mol.atoms, big.atoms, "the drawing unchanged by measuring");
  assert.equal(caption(r1.mol, r1.id).text, "1.52\u00a0Å");
  // A dihedral takes atoms only; the tool's rule places nothing off an atom for it.
  assert.equal(addMeasure(big, [0, 1, 2, [9, 9]], "pick"), "A dihedral takes 4 atoms.");
  assert.deepEqual(placeEnd([0, 1], "dihedral", undefined, [9, 9]), [0, 1], "Dihedral: a click off an atom does nothing");
  assert.deepEqual(placeEnd([0, 1], "dihedral", 2, [9, 9]), [0, 1, 2]);
  // The tool's rule: an atom placed already, or a point on the last end, places nothing; a full list takes no more.
  const ends: Ends = [0];
  assert.equal(placeEnd(ends, "angle", 0, [0, 0]), ends, "the atom just placed");
  assert.deepEqual(placeEnd(ends, "angle", undefined, [3, 4]), [0, [3, 4]]);
  const free: Ends = [[3, 4]];
  assert.equal(placeEnd(free, "distance", undefined, [3.01, 4], 0.05), free, "a click on the free end just placed");
  assert.deepEqual(placeEnd(free, "distance", undefined, [3.2, 4], 0.05), [[3, 4], [3.2, 4]]);
  const full: Ends = [0, 1];
  assert.equal(placeEnd(full, "distance", 2, [0, 0]), full, "a full list takes no more");
  // A drawing with free ends: a mixed length, an all-free length, a mixed angle (vertex an atom), one coloured and bold.
  let m = chain(4);
  const p0 = m.atoms[0].location;
  for (const e of [[0, [p0[0], p0[1] - 3]], [[5, 5], [8, 5]], [[0, 3], 1, 2]] as Ends[]) m = made(addMeasure(m, e, "pick")).mol;
  const ids = m.captions!.map((c) => c.id);
  m = settleMeasures(m, { ...m, captions: m.captions!.map((c) => (c.id === ids[1] ? { ...c, colour: "#C00000", bold: true, size: 14 } : c)) });
  const values = m.captions!.map((c) => c.text);
  assert.deepEqual(values.slice(0, 2), ["4.56\u00a0Å", "4.56\u00a0Å"], `values: ${values}`);
  // S44: .oct (its JSON and its CDXML), the clipboard (the same JSON), CDXML and CDX: free ends back where they were,
  // atom ends on their atoms, colour and Text menu styles kept.
  const same = (back: Mol, what: string) => {
    const got = back.captions!.filter((c) => c.measure);
    assert.equal(got.length, 3, `${what}: every measurement`);
    got.forEach((g, k) => {
      const w = m.captions![k];
      assert.equal(g.measure!.ends.length, w.measure!.ends.length, what);
      g.measure!.ends.forEach((e, j) => {
        const want = w.measure!.ends[j];
        if (typeof want === "number") assert.equal(e, want, `${what}: atom end`);
        else { assert.ok(Array.isArray(e), `${what}: free end`); near(e[0], want[0], 1e-3, `${what} x`); near(e[1], want[1], 1e-3, `${what} y`); }
      });
      assert.equal(g.text, w.text, `${what}: value`);
      assert.equal(g.colour, w.colour, `${what}: colour`);
      assert.equal(!!g.bold, !!w.bold, `${what}: bold`);
      assert.equal(g.size, w.size, `${what}: size`);
    });
  };
  same(parse(serialize(m)), ".oct JSON and the clipboard");
  same(readOct(writeOct(m, DEFAULT_STYLE), true).mol, ".oct");
  same(readOct(writeOct(m, DEFAULT_STYLE).replace("<CDXML ", "<CDXML Changed=\"1\" "), true).mol, ".oct read from its CDXML");
  same(fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol, "CDXML");
  same(readCdx(writeCdx(m, DEFAULT_STYLE)).mol, "CDX");
  const written = (JSON.parse(serialize(m)).captions as Caption[]).map((c) => c.measure);
  assert.deepEqual(written[1], { ends: [[5, 5], [8, 5]] }, "the new form is written");
  assert.ok(written.every((x) => x && !("atoms" in x)), "the old form is not");
  // A ChemDraw save (Octet's data gone): text and dashed lines, as before.
  const chemdraw = fromCdxml(toCdxml(m, DEFAULT_STYLE).replace(/ Octet="[^"]*"/g, ""));
  assert.equal(chemdraw.mol.captions!.filter((c) => c.measure).length, 0);
  assert.ok((chemdraw.mol.arrows ?? []).filter((a) => a.style === "dashed").length >= 2, "its dashed lines");
  // Copy and paste: the all-free one picked comes as itself; with its atoms the mixed ones come too; pasted at an
  // offset, the free ends move with the paste and the atom ends are the new atoms.
  const all4 = new Set([0, 1, 2, 3]);
  const part = extractSelection(m, all4, new Set(ids));
  assert.equal(part.captions!.filter((c) => c.measure).length, 3, "copied");
  const pasted = settleMeasures(m, insertMol(m, part, [10, -1]).mol), copies = pasted.captions!.slice(3);
  assert.deepEqual(copies.map((c) => c.text), values, "the same values pasted");
  assert.deepEqual(copies[0].measure!.ends, [4, [p0[0] + 10, p0[1] - 4]], "atom end remapped, free end moved");
  assert.deepEqual(copies[1].measure!.ends, [[15, 4], [18, 4]]);
  const freeAlone = extractSelection(m, new Set(), new Set([ids[1]]));
  assert.deepEqual(freeAlone.captions![0].measure!.ends, [[5, 5], [8, 5]], "an all-free measurement copied alone stays one");
  const mixedAlone = extractSelection(m, new Set(), new Set([ids[0]]));
  assert.equal(mixedAlone.captions![0].measure, undefined, "a mixed one copied without its atom is plain text");
  const dup = duplicateSelection(m, all4, new Set(ids)).mol;
  assert.equal(dup.captions!.filter((c) => c.measure).length, 6, "duplicated");
  // S42: moves. The label and its atoms moved by one step (a selection dragged, arrow keys, ⌘A): free ends with them.
  const by = (mol: Mol, ids2: number[], d: [number, number]) => ({ ...mol, captions: mol.captions!.map((c) => (ids2.includes(c.id) ? { ...c, x: c.x + d[0], y: c.y + d[1] } : c)) });
  const moved = settleMeasures(m, by(moveAtoms(m, all4, [1, 2]), ids, [1, 2]));
  assert.deepEqual(moved.captions!.map((c) => c.measure!.ends.map((e) => (typeof e === "number" ? e : [Math.round(e[0] * 1e6) / 1e6, Math.round(e[1] * 1e6) / 1e6]))),
    m.captions!.map((c) => c.measure!.ends.map((e) => (typeof e === "number" ? e : [e[0] + 1, e[1] + 2]))), "free ends moved with the selection");
  assert.deepEqual(moved.captions!.map((c) => c.text), values, "values kept");
  // The all-free one's label dragged alone: the whole measurement moves.
  const freeMoved = settleMeasures(m, by(m, [ids[1]], [0, 1]));
  assert.deepEqual(freeMoved.captions![1].measure!.ends, [[5, 6], [8, 6]]);
  // A mixed one's label dragged alone: only its label moves (its offset is kept); its free end stays.
  const labelMoved = settleMeasures(m, by(m, [ids[0]], [0.5, 0]));
  assert.deepEqual(labelMoved.captions![0].measure!.ends, m.captions![0].measure!.ends);
  assert.ok(labelMoved.captions![0].measure!.at, "the label's offset kept");
  // An atom dragged alone: the free end stays, the value follows.
  const atomMoved = settleMeasures(m, moveAtoms(m, new Set([0]), [0, 1]));
  assert.deepEqual(atomMoved.captions![0].measure!.ends.slice(1), m.captions![0].measure!.ends.slice(1));
  assert.equal(atomMoved.captions![0].text, "6.08\u00a0Å");
  // Turn, flip and scale with the measurement picked (transformParts): free ends go with the selection.
  const turn = ([x, y]: [number, number]): [number, number] => [-y, x];
  const turned = settleMeasures(m, transformParts(m, all4, new Set(ids), turn));
  assert.deepEqual(turned.captions![1].measure!.ends, [[-5, 5], [-5, 8]], "turned");
  assert.deepEqual(turned.captions!.map((c) => c.text), values, "a turn keeps the values");
  const flipped = settleMeasures(m, transformParts(m, all4, new Set(ids), ([x, y]) => [-x, y], [1, 1], undefined, 1, "across"));
  assert.deepEqual(flipped.captions![1].measure!.ends, [[-5, 5], [-8, 5]], "flipped");
  const grown = settleMeasures(m, transformParts(m, all4, new Set(ids), ([x, y]) => [2 * x, 2 * y], [2, 2]));
  assert.deepEqual(grown.captions![1].measure!.ends, [[10, 10], [16, 10]], "scaled");
  assert.deepEqual(grown.captions!.map((c) => c.text), [values[0], "9.12\u00a0Å", values[2]], "scaled: a structure's own scale holds; free ends alone read at the document's");
  // Not picked: the free ends stay.
  assert.deepEqual(settleMeasures(m, transformParts(m, all4, new Set(), turn)).captions![1].measure!.ends, [[5, 5], [8, 5]]);
  // S43: an atom deleted from a mixed measurement removes it in the same step; the all-free one stays.
  const gone = deleteAtoms(m, new Set([0]));
  assert.ok(!gone.captions!.some((c) => c.id === ids[0]), "the mixed length on atom 0 went");
  assert.ok(gone.captions!.some((c) => c.id === ids[1] && c.measure), "the all-free one stays");
  // Colour and the Text menu on an all-free one (updateCaption), Undo's earlier state unchanged.
  const styled = settleMeasures(m, updateCaption(m, ids[1], { colour: "#2E7D32", italic: true }));
  assert.equal(caption(styled, ids[1]).colour, "#2E7D32");
  assert.ok(caption(styled, ids[1]).italic && caption(styled, ids[1]).measure, "styled and still a measurement");
  assert.equal(caption(m, ids[1]).colour, "#C00000", "the earlier state as it was (Undo)");
  console.log("measurement.check: free ends ok");
}

// S45: the old form ({ atoms }, as the 1.2 beta and 1.1.3 dev builds saved it) opens as a measurement in .oct, the
// clipboard, CDXML and CDX, and is saved in the new form.
{
  const { writeOct, readOct, writeCdx, readCdx } = await import("./oct.ts");
  const { toCdxml, fromCdxml } = await import("./cdxml.ts");
  const { parse, serialize } = await import("./file.ts");
  const m = made(addMeasure(chain(5), [0, 2, 4], "pick")).mol, c = m.captions![0];
  const old = (s: string) => s.replace(/("measure":\s*\{\s*)"ends"/g, '$1"atoms"');
  const form = (s: string) => (JSON.parse(s).captions as { measure: object }[])[0].measure;
  const opened = (back: Mol, what: string) => {
    const g = back.captions!.find((x) => x.measure);
    assert.ok(g, `${what}: a measurement`);
    assert.deepEqual(g.measure!.ends, [0, 2, 4], `${what}: its atoms as ends`);
    assert.equal(g.text, c.text, `${what}: its value`);
    assert.deepEqual(form(serialize(back)), { ends: [0, 2, 4] }, `${what}: saved in the new form`);
  };
  const json = old(serialize(m));
  assert.deepEqual(form(json), { atoms: [0, 2, 4] }, "the test file has the old form");
  opened(parse(json), ".oct JSON and the clipboard");
  // .oct: its JSON part in the old form.
  // (Its JSON is in base64 after the CDXML, beside the CDXML's hash.)
  const oct = writeOct(m, DEFAULT_STYLE), own = /<!--Octet 1 \S+ (\S+)-->\n$/.exec(oct)!;
  const oldOct = oct.replace(own[1], Buffer.from(old(Buffer.from(own[1], "base64").toString("utf8")), "utf8").toString("base64"));
  assert.notEqual(oldOct, oct, "the test .oct has the old form");
  opened(readOct(oldOct, true).mol, ".oct");
  // CDXML and CDX: Octet's data with atoms (node ids).
  const xml = toCdxml(m, DEFAULT_STYLE).replace(/&quot;measure&quot;:\{&quot;ends&quot;:/, "&quot;measure&quot;:{&quot;atoms&quot;:");
  assert.match(xml, /&quot;measure&quot;:\{&quot;atoms&quot;:/, "the test CDXML has the old form");
  opened(fromCdxml(xml).mol, "CDXML");
  const cdx = writeCdx(fromCdxml(xml).mol, DEFAULT_STYLE);
  opened(readCdx(cdx).mol, "CDX");
  console.log("measurement.check: old form ok");
}
