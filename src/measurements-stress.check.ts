// Run: node src/measurements-stress.check.ts. The stress list of docs/plans/issue-85-measurements.md, case by case,
// for distance, angle and dihedral measurements (issue 85). Cases another check covers already are named here and not
// run twice: S8, S15 to S21, S23, S24, S33 to S36, S39 and S40 in measurement.check.ts; S7, S27 and S28 (timing) in
// measurespeed.check.ts; S29 to S31, S32's AI path and S35's same measurement in measuremcp.check.ts. S25 and S26
// (dark mode, zoom) are how the editor draws, checked in the dev server.
import assert from "node:assert/strict";
import { browser } from "../scripts/checkkit.ts";
import { clean3d } from "./clean3d.ts";
import { EMPTY, addMeasure, addRing, deleteAtoms, deleteChosen, erase, flattenAtoms, flipAtoms, moveAtoms, rotateAtoms, tiltAtoms, transformParts, updateCaption, type Made } from "./edit.ts";
import { measureFrame, measureText, measureValue, passAtom, settleMeasures, kindOf } from "./measurement.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { ASCENT, DESCENT, type Caption, type Mol } from "./render.ts";

const all = (m: Mol) => new Set(m.atoms.map((_, i) => i));
const C = (x: number, y: number, z = 0) => ({ label: "C", location: [x, y, z] as [number, number, number] });
const chain = (n: number): Mol => ({ atoms: Array.from({ length: n }, (_, k) => C(k * 0.866, k % 2 ? 0.5 : 0)), bonds: Array.from({ length: n - 1 }, (_, k) => ({ type: 1, atoms: [k, k + 1] as [number, number] })) });
const made = (r: Made | string) => { assert.ok(typeof r !== "string", String(r)); return r; };
const measures = (m: Mol) => (m.captions ?? []).filter((c) => c.measure);
const of = (m: Mol, id: number) => m.captions!.find((c) => c.id === id)!;
// Each measurement's text is the value of its atoms as drawn now, and never NaN or Infinity.
const truthful = (m: Mol, what: string) => {
  for (const c of measures(m)) {
    assert.equal(c.text, measureText(kindOf(c.measure!.atoms.length)!, measureValue(m, c.measure!.atoms)), `${what}: ${c.text}`);
    assert.ok(!/NaN|Infinity/.test(c.text) && Number.isFinite(c.x) && Number.isFinite(c.y), `${what}: ${JSON.stringify(c)}`);
  }
};
const values = (m: Mol) => measures(m).map((c) => measureValue(m, c.measure!.atoms)!);

// S1 to S4: the Measure tool's drag (passAtom; the editor makes a measurement on let go only with 2 to 4 atoms, and
// starts no drag on a press that is not on an atom, S5).
{
  let list = [7];
  assert.equal(passAtom(list, undefined), list, "S1: nothing under the pointer, nothing changes");
  assert.equal(passAtom(list, 7), list, "S1: still on the first atom: one atom, so nothing on let go");
  for (const on of [8, 9, 10, 11, 12]) list = passAtom(list, on);
  assert.deepEqual(list, [7, 8, 9, 10], "S2: six atoms passed, the first four kept");
  assert.deepEqual(passAtom(list, 9), [7, 8, 9], "S3: back on the one before the last takes the last off");
  assert.deepEqual(passAtom(passAtom([7, 8, 9], 8), 8), [7, 8], "S3: and again to a distance; staying there changes nothing");
  const three = [7, 8, 9];
  assert.equal(passAtom(three, 7), three, "S4: an atom picked already, not the one before the last, is ignored");
  assert.deepEqual(passAtom([7], 7), [7]);
  console.log("measurements-stress: S1 to S4 ok");
}

// S5: an empty drawing settles to itself, and a measurement asked of no atom or of atoms that are not there says why.
{
  assert.equal(settleMeasures(undefined, EMPTY), EMPTY);
  for (const bad of [[], [0], [0, 1]]) assert.equal(typeof addMeasure(EMPTY, bad), "string", JSON.stringify(bad));
  console.log("measurements-stress: S5 ok");
}

// S6: Measure on a flat structure is one change: cleaned up in 3D and measured in one drawing. The drawing before it
// (what ⌘Z gives back) is flat with no measurement, untouched.
{
  const flat = addRing(EMPTY, 6, false, { point: [0, 0] }), was = JSON.stringify(flat);
  const r = made(addMeasure(flat, [0, 1, 2, 3]));
  assert.equal(r.cleaned.length, 1);
  assert.ok(r.mol.atoms.some((a) => Math.abs(a.location[2]) > 1e-3) && measures(r.mol).length === 1, "cleaned up and measured together");
  assert.equal(JSON.stringify(flat), was, "the drawing before is unchanged");
  assert.ok(Math.abs(Math.abs(values(r.mol)[0]) - 55) < 12, `a chair's dihedral: ${values(r.mol)[0]}`);
  truthful(r.mol, "S6");
  console.log("measurements-stress: S6 ok");
}

// S9: deleting a measured atom (Delete, the Eraser) takes the measurement in the same change; the drawing before keeps
// both.
{
  const m = made(addMeasure(chain(5), [0, 2, 4])).mol;
  for (const [what, out] of [["Delete", deleteAtoms(m, new Set([2]))], ["Eraser", erase(m, new Set(), new Set([4]))]] as const) {
    assert.equal(measures(out).length, 0, what);
    assert.ok(!(out.captions ?? []).some((c) => c.text === measures(m)[0].text && !c.measure), `${what}: no plain text left behind`);
  }
  assert.equal(measures(m).length, 1);
  console.log("measurements-stress: S9 ok");
}

// S10: 20 steps of add, move label, colour, turn and delete atom. Each step's drawing is kept as it was (undo and redo
// give back the exact text, place and colour), and a step settles to itself.
{
  const steps: Mol[] = [clean3d(chain(8), [...all(chain(8))])], snaps: string[] = [JSON.stringify(steps[0])];
  const push = (m: Mol) => { const s = settleMeasures(steps[steps.length - 1], m); steps.push(s); snaps.push(JSON.stringify(s)); };
  const pairs = [[0, 3], [1, 2, 3], [2, 3, 4, 5], [0, 7], [4, 5, 6], [1, 6]];
  for (let k = 0; steps.length < 21; k++) {
    const m = steps[steps.length - 1], ms = measures(m), last = ms[ms.length - 1];
    switch (k % 5) {
      case 0: { const r = addMeasure(m, pairs[k % pairs.length].filter((i) => i < m.atoms.length)); if (typeof r !== "string") push(r.mol); else push(rotateAtoms(m, all(m), 5)); break; }
      case 1: push(last ? { ...m, captions: m.captions!.map((c) => (c.id === last.id ? { ...c, x: c.x + 0.4, y: c.y - 0.2 } : c)) } : rotateAtoms(m, all(m), 3)); break;
      case 2: push(last ? updateCaption(m, last.id, { colour: k % 2 ? "#C00000" : "#1F6FEB" }) : rotateAtoms(m, all(m), 3)); break;
      case 3: push(rotateAtoms(m, all(m), 37)); break;
      case 4: push(m.atoms.length > 5 ? deleteAtoms(m, new Set([m.atoms.length - 1])) : rotateAtoms(m, all(m), 11)); break;
    }
  }
  assert.equal(steps.length, 21);
  steps.forEach((m, k) => {
    assert.equal(JSON.stringify(m), snaps[k], `step ${k} is as it was`);
    assert.equal(settleMeasures(m, m), m, `step ${k} settles to itself`);
    truthful(m, `step ${k}`);
  });
  assert.ok(steps.some((m) => measures(m).some((c) => c.colour)) && steps.some((m) => measures(m).some((c) => c.measure!.at)), "the steps coloured and moved labels");
  console.log("measurements-stress: S10 ok");
}

// S11 to S13: a turn of 37°, a 3D turn (Structure Perspective), Rotate 180°, Flip, Mirror, Scale 50% and another bond
// length in the document style, as the editor does them. Values hold (Mirror changes a dihedral's sign), labels stay upright,
// and a label moved by hand keeps its place by its atoms.
{
  let m = clean3d(chain(5), [...all(chain(5))]);
  for (const atoms of [[0, 4], [0, 1, 2], [0, 1, 2, 3]]) m = made(addMeasure(m, atoms)).mol;
  const moved = measures(m)[0].id;
  m = settleMeasures(m, { ...m, captions: m.captions!.map((c) => (c.id === moved ? { ...c, x: c.x + 0.6, y: c.y + 0.3 } : c)) });
  // (A label's place by its atoms: its middle in its measurement's frame.)
  const mid = ((ASCENT - DESCENT) / 2) * (DEFAULT_STYLE.captionSize / DEFAULT_STYLE.bond);
  const v0 = values(m), lift = (c: Caption, x: Mol) => { const f = measureFrame(x, c.measure!.atoms), d = [c.x - f.o[0], c.y + mid - f.o[1]]; return [d[0] * f.u[0] + d[1] * f.u[1], d[0] * f.v[0] + d[1] * f.v[1]]; };
  const at0 = lift(of(m, moved), m);
  const centre: [number, number, number] = [m.atoms[2].location[0], m.atoms[2].location[1], 0];
  const turned: [string, Mol][] = [
    ["turn 37°", rotateAtoms(m, all(m), 37)],
    ["Rotate 180°", rotateAtoms(m, all(m), 180)],
    ["3D turn", tiltAtoms(m, all(m), centre, 0.6, 0.4)],
    ["Scale 50%", transformParts(m, all(m), new Set(), ([x, y]) => [x * 0.5, y * 0.5], [0.5, 0.5])],
  ];
  for (const [what, x] of turned) {
    const s = settleMeasures(m, x);
    values(s).forEach((v, k) => assert.ok(Math.abs(v - v0[k]) < 1e-3, `${what}: ${v} not ${v0[k]}`));
    assert.ok(measures(s).every((c) => !c.angle), `${what}: labels upright`);
    if (what !== "Scale 50%") lift(of(s, moved), s).forEach((v, k) => assert.ok(Math.abs(v - at0[k]) < 1e-6, `${what}: the moved label by its atoms ${v} not ${at0[k]}`));
    truthful(s, what);
  }
  // S12: Flip is a 180° turn in 3D (flipAtoms; stereocentres keep their configuration), so every value holds. Mirror
  // keeps distances and angles and changes a dihedral's sign.
  for (const mirror of [false, true]) {
    const what = mirror ? "Mirror" : "Flip", out = settleMeasures(m, flipAtoms(m, all(m), "horizontal", mirror)), v = values(out);
    assert.ok(Math.abs(v[0] - v0[0]) < 1e-6 && Math.abs(v[1] - v0[1]) < 1e-6 && Math.abs(v[2] - (mirror ? -v0[2] : v0[2])) < 1e-6, `${what}: ${v} from ${v0}`);
    assert.ok(measures(out).every((c) => !c.angle), `${what}: labels upright`);
    truthful(out, what);
  }
  // S13: the document's bond length 30 pt to 18 pt.
  for (const bond of [30, 18]) {
    const s = settleMeasures(undefined, { ...m, style: { ...DEFAULT_STYLE, bond } }, { ...DEFAULT_STYLE, bond });
    values(s).forEach((v, k) => assert.ok(Math.abs(v - v0[k]) < 1e-9, `bond ${bond} pt`));
    assert.deepEqual(measures(s).map((c) => c.text), measures(m).map((c) => c.text));
  }
  console.log("measurements-stress: S11 to S13 ok");
}

// S14: one measured atom dragged over 30 frames: each frame's value, text and label follow.
{
  let m = made(addMeasure(chain(5), [0, 2, 4])).mol;
  m = made(addMeasure(m, [0, 4])).mol;
  const start = m;
  let last = measures(m).map((c) => [c.text, c.x, c.y].join());
  let changed = 0;
  for (let f = 1; f <= 30; f++) {
    const next = settleMeasures(m, moveAtoms(start, new Set([4]), [f * 0.05, f * 0.03]));
    truthful(next, `frame ${f}`);
    const now = measures(next).map((c) => [c.text, c.x, c.y].join());
    if (now.join() !== last.join()) changed++;
    last = now;
    m = next;
  }
  assert.ok(changed >= 25, `the labels follow the frames (${changed} of 30)`);
  console.log("measurements-stress: S14 ok");
}

// S15 with charges typed as text (issue 164): a measurement whose value cannot be worked out reads "–", and is still
// not its structure's charge. Plain "–" text there is (the control).
{
  const { symbolOwners } = await import("./mixtures.ts");
  const m: Mol = { atoms: [C(0, 0), C(1, 0), C(2, 0), C(3, 0)], bonds: [{ type: 1, atoms: [0, 1] }, { type: 3, atoms: [1, 2] }, { type: 1, atoms: [2, 3] }] };
  const r = made(addMeasure({ ...m, atoms: m.atoms.map((a) => ({ ...a, shade: true as const })) }, [0, 1, 2, 3]));
  assert.equal(of(r.mol, r.id).text, "–");
  const box: [number, number, number, number] = [-0.3, -0.3, 3.3, 0.3], beside = (c: Caption) => [c.x - 0.1, 0.35, c.x + 0.1, 0.55] as [number, number, number, number];
  const near = { ...r.mol, captions: r.mol.captions!.map((c) => ({ ...c, y: 0.35 })) };
  assert.equal(symbolOwners(near, [box], (id) => beside(of(near, id))).size, 0, "a measurement is not a charge");
  const { measure: _, ...plain } = of(near, r.id);
  assert.equal(symbolOwners({ ...near, captions: [plain] }, [box], () => beside(plain)).size, 1, "plain text there is (the control)");
  console.log("measurements-stress: S15 with charges ok");
}

// S37: ⌘A then Delete takes everything, measurements too.
{
  const m = made(addMeasure(made(addMeasure(chain(4), [0, 3])).mol, [0, 1, 2])).mol, ids = new Set(m.captions!.map((c) => c.id));
  assert.equal(deleteChosen(m, all(m), ids).captions?.length ?? 0, 0, "everything picked");
  assert.equal(measures(deleteChosen(m, all(m), new Set())).length, 0, "the atoms alone take their measurements");
  console.log("measurements-stress: S37 ok");
}

// S38: Flatten and 3D Clean Up on a measured structure: the values follow the new geometry.
{
  const r = made(addMeasure(addRing(EMPTY, 6, false, { point: [0, 0] }), [0, 1, 2, 3]));
  const flat = settleMeasures(r.mol, flattenAtoms(r.mol, all(r.mol)));
  assert.ok(Math.abs(values(flat)[0]) < 0.1, `flattened ring dihedral ${values(flat)[0]}`);
  truthful(flat, "Flatten");
  const again = settleMeasures(flat, clean3d(flat, [...all(flat)]));
  assert.ok(Math.abs(Math.abs(values(again)[0]) - 55) < 12, `cleaned up again ${values(again)[0]}`);
  truthful(again, "3D Clean Up");
  // Clean Up Structure on the flattened ring, bent out of shape.
  browser();
  const { cleanUp, ready } = await import("./chem.ts");
  await ready;
  const bent = moveAtoms(flat, new Set([0]), [0.4, 0.3]), tidy = settleMeasures(bent, cleanUp(bent, all(bent)));
  assert.notDeepEqual(tidy.atoms[0].location, bent.atoms[0].location, "Clean Up Structure moved the atom");
  truthful(tidy, "Clean Up Structure");
  console.log("measurements-stress: S38 ok");
}

console.log("measurements-stress.check: every case ok");
