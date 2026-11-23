// Run: node src/measurements-stress.check.ts. The stress list of docs/plans/issue-85-measurements.md, case by case,
// for distance, angle and dihedral measurements (issue 85). Cases another check covers already are named here and not
// run twice: S8, S15 to S21, S23, S24, S33 to S36, S39 to S45 in measurement.check.ts; S7, S27 and S28 (timing) in
// measurespeed.check.ts; S29 to S31, S32's AI path and S35's same measurement in measuremcp.check.ts. S26 (zoom) and
// S46 (the Measure tool's clicks) run in WebKit at the end of this file when OCTET_STRESS_URL names a dev server; S25
// (dark mode) is how the editor draws, checked in the dev server.
import assert from "node:assert/strict";
import { browser } from "../scripts/checkkit.ts";
import { clean3d } from "./clean3d.ts";
import { EMPTY, addMeasure, addRing, deleteAtoms, deleteChosen, erase, flattenAtoms, flipAtoms, moveAtoms, rotateAtoms, tiltAtoms, transformParts, updateCaption, type Made } from "./edit.ts";
import { measureFrame, measureText, measureValue, placeEnd, settleMeasures, kindOf } from "./measurement.ts";
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
    assert.equal(c.text, measureText(kindOf(c.measure!.ends.length)!, measureValue(m, c.measure!.ends)), `${what}: ${c.text}`);
    assert.ok(!/NaN|Infinity/.test(c.text) && Number.isFinite(c.x) && Number.isFinite(c.y), `${what}: ${JSON.stringify(c)}`);
  }
};
const values = (m: Mol) => measures(m).map((c) => measureValue(m, c.measure!.ends)!);

// S1 to S4: the Measure tool's clicks (placeEnd; the editor makes the measurement at the last end only, and Escape,
// Backspace and the rest are the UI cases below, run in WebKit).
{
  const one = placeEnd([], "distance", 7, [0, 0]);
  assert.deepEqual(one, [7], "S1: a click on an atom places it");
  assert.deepEqual(placeEnd([], "distance", undefined, [1, 2]), [[1, 2]], "S1: a click off an atom places a free point");
  const two = placeEnd([7], "dihedral", undefined, [1, 2]);
  assert.deepEqual(two, [7], "S2: Dihedral, a click off an atom: nothing placed");
  assert.deepEqual(placeEnd([7, 8, 9], "dihedral", 10, [0, 0]), [7, 8, 9, 10], "S2: its fourth atom");
  // S3: Backspace takes the last end off (the editor's slice); the next click places it again.
  assert.deepEqual(placeEnd([7, 8].slice(0, -1), "angle", 8, [0, 0]), [7, 8], "S3");
  const three: Parameters<typeof placeEnd>[0] = [7, 8];
  assert.equal(placeEnd(three, "angle", 8, [0, 0]), three, "S4: the end just placed: nothing");
  assert.equal(placeEnd(three, "angle", 7, [0, 0]), three, "S4: an atom placed already: nothing");
  console.log("measurements-stress: S1 to S4 ok");
}

// S5: an empty drawing settles to itself, and a measurement asked of no atom or of atoms that are not there says why.
{
  assert.equal(settleMeasures(undefined, EMPTY), EMPTY);
  for (const bad of [[], [0], [0, 1]]) assert.equal(typeof addMeasure(EMPTY, bad), "string", JSON.stringify(bad));
  console.log("measurements-stress: S5 ok");
}

// S6: Measure on a flat structure is one change, and measures it as drawn: no clean-up (Sam, 19 November 2026). The
// atoms are the same objects after, and the drawing before it (what ⌘Z gives back) is untouched.
{
  const flat = addRing(EMPTY, 6, false, { point: [0, 0] }), was = JSON.stringify(flat);
  const r = made(addMeasure(flat, [0, 1, 2, 3]));
  assert.equal(r.mol.atoms, flat.atoms, "the atoms as they were: nothing cleaned up");
  assert.equal(measures(r.mol).length, 1);
  assert.equal(JSON.stringify(flat), was, "the drawing before is unchanged");
  // A flat ring is measured where 3D Clean Up would put it (a chair), so its dihedral is a chair's, not 0.
  assert.ok(Math.abs(Math.abs(values(r.mol)[0]) - 57) < 5, `a flat ring's dihedral from its 3D model: ${values(r.mol)[0]}`);
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
  const v0 = values(m), lift = (c: Caption, x: Mol) => { const f = measureFrame(x, c.measure!.ends), d = [c.x - f.o[0], c.y + mid - f.o[1]]; return [d[0] * f.u[0] + d[1] * f.u[1], d[0] * f.v[0] + d[1] * f.v[1]]; };
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
  assert.ok(Math.abs(Math.abs(values(flat)[0]) - 57) < 5, `flattened ring reads its chair's dihedral ${values(flat)[0]}`);
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

// S19 in a window: a drawing opened over another (the editor's set with opened) settles with no drawing before and
// its labels kept. A caption id and atoms the window's drawing had too do not count as the label moved by hand, and
// a label away from its automatic place stays where the file has it.
{
  const window = made(addMeasure(clean3d(chain(5), [0, 1, 2, 3, 4]), [0, 3])).mol, c = measures(window)[0];
  const file: Mol = { ...window, atoms: window.atoms.map((a) => ({ ...a })), captions: [{ ...c, x: c.x + 1.3, y: c.y + 0.9 }] };
  assert.equal(settleMeasures(undefined, file, undefined, true), file, "opened: the file's labels and values as they are");
  const stale: Mol = { ...file, captions: [{ ...file.captions![0], text: "9.99 Å" }] }, back = settleMeasures(undefined, stale, undefined, true);
  assert.equal(back.captions![0].text, c.text, "opened: a value the file has wrong is worked out again");
  assert.deepEqual([back.captions![0].x, back.captions![0].y, back.captions![0].measure!.at], [file.captions![0].x, file.captions![0].y, undefined], "and its label stays");
  console.log("measurements-stress: S19 opened ok");
}

// Labels apart: on 3-methylpentane, a distance (the methyl to an end) and then the angle at the next carbon, as made
// in the dev server. The automatic places keep the two labels a gap apart (0.2 bond lengths), so they never read as
// one line of text; the same holds for a measurement of each kind on one chain.
{
  const { widthOf } = await import("./arial.ts");
  const style = DEFAULT_STYLE, size = style.captionSize / style.bond, h = (ASCENT + DESCENT) * size;
  const boxOf = (c: Caption) => { const w = widthOf(c.text, size), y = c.y + ((ASCENT - DESCENT) / 2) * size; return [c.x - w / 2, y - h / 2, c.x + w / 2, y + h / 2]; };
  const apart = (m: Mol, what: string) => {
    const bs = measures(m).map(boxOf);
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const [a, b] = [bs[i], bs[j]], gap = Math.max(a[0] - b[2], b[0] - a[2], a[1] - b[3], b[1] - a[3]);
      assert.ok(gap >= 0.2 - 1e-6, `${what}: labels ${measures(m)[i].text} and ${measures(m)[j].text} ${gap.toFixed(2)} apart`);
    }
  };
  const branched: Mol = { atoms: [C(0, 0), C(0.866, 0.5), C(1.732, 0), C(1.732, -1), C(2.598, 0.5), C(3.464, 0)], bonds: [[0, 1], [1, 2], [2, 3], [2, 4], [4, 5]].map(([a, b]) => ({ type: 1, atoms: [a, b] as [number, number] })) };
  let m = made(addMeasure(branched, [3, 5])).mol;
  m = made(addMeasure(m, [0, 1, 2])).mol;
  apart(m, "3-methylpentane");
  let n = clean3d(chain(6), [0, 1, 2, 3, 4, 5]);
  for (const atoms of [[0, 2], [1, 2, 3], [0, 1, 2, 3], [2, 3, 4], [3, 5]]) n = made(addMeasure(n, atoms)).mol;
  apart(n, "hexane, five measurements");
  console.log("measurements-stress: labels apart ok");
}

// Groups: in a structure's group, a measurement's label and its dashed lines go in the group too, so ChemDraw moves
// them with the structure. Tie to structure leaves a measurement alone (it follows its own atoms, and an under of its
// own would keep stale atom numbers after a delete). Structure > Measure has its own heading in Keyboard shortcuts.
{
  const { readFileSync } = await import("node:fs");
  const { toCdxml, fromCdxml } = await import("./cdxml.ts");
  let m = clean3d(chain(6), [0, 1, 2, 3, 4, 5]);
  m = made(addMeasure(m, [0, 5])).mol;
  m = made(addMeasure(m, [1, 2, 3])).mol;
  const gid = Math.max(0, ...(m.captions ?? []).map((c) => c.id)) + 100;
  m = { ...m, groups: [{ id: gid, atoms: [0, 1, 2, 3, 4, 5], items: [] }] };
  const cdxml = toCdxml(m, DEFAULT_STYLE), open = cdxml.indexOf("<group"), close = cdxml.lastIndexOf("</group>");
  assert.ok(open > 0 && close > open, "the group is written");
  const inside = cdxml.slice(open, close), outside = cdxml.slice(0, open) + cdxml.slice(close);
  assert.ok((inside.match(/LineType="Dashed"/g) ?? []).length >= 2, "groups: the distance's dashed line, and its legacy copy, in the group");
  assert.ok(!/LineType="Dashed"/.test(outside), "groups: no dashed line outside it");
  assert.ok(/GraphicType="Arc"/.test(inside), "groups: the angle's arc in the group");
  for (const c of measures(m)) assert.ok(inside.includes(`>${c.text}</s>`), `groups: ${c.text} in the group`);
  const back = fromCdxml(cdxml).mol;
  assert.equal(measures(back).length, 2, "groups: both measurements read back");
  assert.equal(back.arrows?.length ?? 0, 0, "groups: the lines are not read back as lines");
  assert.deepEqual(back.groups?.map((g) => [...g.atoms].sort((p, q) => p - q)), [[0, 1, 2, 3, 4, 5]], "groups: the group read back with its atoms");
  const editor = readFileSync(new URL("./Editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /const under = !c\.measure && structureAbove\(at, 4\);/, "Tie to structure skips a measurement");
  const rust = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
  assert.match(rust, /section\.replace\("Structure › Measure"\.into\(\)\);\s*let measure = Submenu/, "Structure > Measure has its own heading");
  console.log("measurements-stress: groups, tie and heading ok");
}

// S46: the Measure tool in WebKit (the engine the Mac app runs in), driven with pointer and key events as a person gives
// them, when OCTET_STRESS_URL names a dev server (npx vite --port 1522): two clicks, empty points, three clicks with the
// live arc, a drag let go, a hold (Select), Escape, Backspace, a tool change, Dihedral off an atom, Undo, Redo and ⌘A,
// Undo and Redo while measuring, Measure length on a bond (the Actions panel, the right-click menu and the menu's
// command), 10% and the highest zoom, each live value equal to the value made, and pointer moves on 4000 atoms against
// Select's.
// Then a measurement to an empty point moved with its structure, and the Measure tool's edges (followUi). Then the
// toolbar's indicator on every tool in hand, in one column and two, with the section's lines.
{
  const ui = process.env.OCTET_STRESS_URL?.replace(/\/$/, "");
  const { spawnSync } = await import("node:child_process");
  if (!ui) console.log("measurements-stress: the Measure tool in WebKit skipped: set OCTET_STRESS_URL to a running dev server");
  else if (process.platform !== "darwin" || spawnSync("which", ["swift"]).status !== 0) console.log("measurements-stress: the Measure tool in WebKit skipped: it needs a Mac with Xcode's swift");
  else {
    const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const { serialize } = await import("./file.ts");
    const peptide = (): Mol => {
      const atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [], add = (label: string, x: number, y: number) => atoms.push({ label, location: [x, y, 0] }) - 1;
      for (let row = 0; row < 16; row++) {
        let prev = -1;
        for (let r = 0; r < 50; r++) {
          const x = r * 2.6, y = -row * 4, n = add("N", x, y), ca = add("C", x + 0.87, y + 0.5), cb = add("C", x + 0.87, y + 1.5), c = add("C", x + 1.73, y), o = add("O", x + 1.73, y - 1);
          if (prev >= 0) bonds.push({ type: 1, atoms: [prev, n] });
          bonds.push({ type: 1, atoms: [n, ca] }, { type: 1, atoms: [ca, cb] }, { type: 1, atoms: [ca, c] }, { type: 2, atoms: [c, o] });
          prev = c;
        }
      }
      return { atoms, bonds };
    };
    const dir = mkdtempSync(join(tmpdir(), "octet-measure-")), runner = fileURLToPath(new URL("../scripts/look/webkit.swift", import.meta.url));
    const run = (body: string) => {
      const file = join(dir, "run.js");
      writeFileSync(file, `const CHAIN = ${JSON.stringify(serialize(chain(6)))};\nconst BIG = ${JSON.stringify(serialize(peptide()))};\n${body}`);
      const r = spawnSync("swift", [runner, ui, file], { encoding: "utf8", timeout: 300_000 });
      try { return JSON.parse(r.stdout.trim().split("\n").pop()!); } catch { throw new Error(`the WebKit run did not finish: ${r.stdout.slice(-300)}${r.stderr.slice(-300)}`); }
    };
    try {
      const flow = run(`return await (${measureUi.toString()})();`) as { cases: { id: string; title: string; ok: boolean; note?: string }[]; errors: string[] };
      for (const c of flow.cases) console.log(`measurements-stress: ${c.id} ${c.ok ? "ok" : "FAILED"}: ${c.title}${c.note ? ` (${c.note})` : ""}`);
      assert.deepEqual(flow.cases.filter((c) => !c.ok).map((c) => c.id), [], "every case in WebKit");
      assert.equal(flow.cases.length, 16, "every case ran");
      assert.deepEqual(flow.errors, [], "no errors on the page");
      const follow = run(`return await (${followUi.toString()})();`) as typeof flow;
      for (const c of follow.cases) console.log(`measurements-stress: ${c.id} ${c.ok ? "ok" : "FAILED"}: ${c.title}${c.note ? ` (${c.note})` : ""}`);
      assert.deepEqual(follow.cases.filter((c) => !c.ok).map((c) => c.id), [], "every move case in WebKit");
      assert.equal(follow.cases.length, 10, "every move case ran");
      assert.deepEqual(follow.errors, [], "no errors on the page");
      const bar = run(`return await (${indicatorUi.toString()})();`) as { res: { how: string; tools: number; wide: boolean; bad: string[] }[]; errors: string[] };
      for (const r of bar.res) console.log(`measurements-stress: the indicator on each of ${r.tools} tools, ${r.how}: ${r.bad.length ? r.bad.join("; ") : "ok"}`);
      assert.deepEqual(bar.res.flatMap((r) => r.bad), [], "the indicator sits on the tool in hand");
      assert.deepEqual(bar.res.map((r) => r.wide), [false, true]);
      assert.deepEqual(bar.errors, []);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
}

console.log("measurements-stress.check: every case ok");

// The flow in the page (run by S46 above; it uses nothing from this file but CHAIN and BIG, Octet clipboard copies of a
// hexane and of 4000 atoms). It reads the editor's state from React's own records (the undo history, the picked set,
// the view) and drives the canvas with pointer and key events, as energylevels-stress.check.ts does.
async function measureUi() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (find, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = find(); if (v) return v; await wait(100); } return null; };
  const out = { cases: [], errors: [] };
  const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  const key = (init) => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  const editorFiber = () => { const root = document.getElementById("root"), k = Object.keys(root).find((x) => x.startsWith("__reactContainer")), stack = [root[k].stateNode.current]; while (stack.length) { const f = stack.pop(); if (!f) continue; if (f.type?.name === "Editor") return f; if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); } };
  const hookList = () => { const r = []; let h = editorFiber()?.memoizedState; while (h) { r.push(h); h = h.next; } return r; };
  const hooks = () => hookList().map((h) => h.memoizedState);
  const hist = () => hookList().find((h) => h.memoizedState && Array.isArray(h.memoizedState.stack) && typeof h.memoizedState.at === "number").memoizedState;
  const doc = () => hist().stack[hist().at];
  const picked = () => hooks().filter((v) => v instanceof Set).sort((a, b) => b.size - a.size)[0];
  const viewStore = () => hooks().find((v) => v && typeof v.get === "function" && typeof v.set === "function" && v.get() && typeof v.get().zoom === "number");
  const world = () => document.getElementById("world");
  let L = NaN;
  const toScreen = ([x, y]) => { const p = new DOMPoint(x * L, -y * L).matrixTransform(world().getScreenCTM()); return [p.x, p.y]; };
  const ev = (type, [x, y], extra = {}) => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, pointerType: "mouse", isPrimary: true, ...extra }));
  const move = async (p) => { ev("pointermove", p, { buttons: 0 }); await wait(60); };
  const click = async (p, extra) => { ev("pointermove", p, { buttons: 0, ...extra }); ev("pointerdown", p, extra); await wait(30); ev("pointerup", p, extra); await wait(160); };
  const atom = (i) => toScreen(doc().atoms[i].location);
  const tool = () => [...document.querySelectorAll(".palette .slot > .tool")].find((b) => b.getAttribute("aria-pressed") === "true")?.getAttribute("aria-label");
  const measureButton = () => [...document.querySelectorAll(".palette .slot > .tool")].find((b) => /^Measure/.test(b.getAttribute("aria-label") ?? ""));
  const variant = async (name) => {
    const b = measureButton();
    b.click(); await wait(250);
    if (!document.querySelector('.strip[data-tool="measure"]')) { b.click(); await wait(300); }
    const item = [...document.querySelectorAll('.strip[data-tool="measure"] [role=menuitemradio]')].find((x) => (x.getAttribute("aria-label") ?? x.textContent.trim()) === name);
    item?.click(); await wait(300);
    if (!item) throw new Error(`no ${name} in the Measure strip: ${document.querySelector('.strip[data-tool="measure"]')?.textContent}`);
    return true;
  };
  const overlay = () => document.querySelector(".measuring");
  const liveValue = () => overlay()?.querySelector("text.turn-angle")?.textContent;
  const measures = () => (doc().captions ?? []).filter((c) => c.measure);
  const result = (id, title, ok, note) => out.cases.push({ id, title, ok: !!ok, ...(note ? { note } : {}) });
  const step = async (id, title, f) => { try { await f(); } catch (e) { result(id, title, false, `the script stopped: ${e && e.message}`); } };
  const escape = async () => { key({ key: "Escape", code: "Escape" }); await wait(150); };

  await until(() => document.querySelector(".home, .editor"));
  await wait(1200);
  button("Skip")?.click();
  await wait(900);
  document.querySelector(".home-tile.new")?.click();
  await until(() => document.querySelector(".palette"));
  [...document.querySelectorAll(".coach button")].find((b) => /skip/i.test(b.textContent))?.click();
  await wait(600);
  // The chain to measure: Octet's own clipboard.
  const dt = new DataTransfer();
  dt.setData("application/x-octet+json", CHAIN);
  window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  if (!(await until(() => doc()?.atoms.length === 6, 8000))) return JSON.stringify({ cases: [{ id: "W0", title: "the chain pasted", ok: false, note: `atoms ${doc()?.atoms.length}, editor ${!!editorFiber()}` }], errors: window.__errors });
  await wait(400);
  key({ key: "Escape", code: "Escape" });
  await wait(200);
  const atomsBefore = JSON.stringify(doc().atoms);
  L = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bond-length")) * 4) / 3;

  await step("W1", "Length: two clicks on two atoms", async () => {
    await variant("Length");
    const at0 = hist().at;
    await click(atom(0));
    const ringed = overlay()?.querySelectorAll("circle").length ?? 0;
    await move(atom(3));
    const live = liveValue(), dotted = !!overlay()?.querySelector("line.live");
    await click(atom(3));
    const m = measures().at(-1);
    result("W1", "Length: a click on A rings it; the dotted line and the value follow the pointer; the second click makes it in one step, picked, Measure still in hand, the value as shown",
      ringed >= 1 && dotted && m && JSON.stringify(m.measure.ends) === "[0,3]" && m.text === live && hist().at - at0 === 1 && picked()?.has(m.id) && /^Measure length/.test(tool() ?? "") && !overlay(),
      `ringed ${ringed}, dotted ${dotted}, live ${live}, made ${m?.text} ${JSON.stringify(m?.measure)}, steps ${hist().at - at0}, picked ${picked()?.has(m?.id)}, tool ${tool()}`);
  });
  await step("W2", "Length between two empty points", async () => {
    const at0 = hist().at, a = toScreen([0, -3]), b = toScreen([3, -3]);
    await click(a);
    const dot = !!overlay()?.querySelector("circle.end");
    await move(b);
    const live = liveValue();
    await click(b);
    const m = measures().at(-1), free = m?.measure.ends.every((e) => Array.isArray(e));
    result("W2", "Length between empty points: free ends, a dot at the first, the value in Å at the document's scale (3 bond lengths: 4.56 Å), the drawing unchanged",
      dot && free && m.text === live && /^4\.5\d/.test(m.text) && hist().at - at0 === 1 && JSON.stringify(doc().atoms) === atomsBefore,
      `dot ${dot}, ends ${JSON.stringify(m?.measure.ends)}, live ${live}, made ${m?.text}, steps ${hist().at - at0}`);
  });
  await step("W3", "Angle: three clicks with the live arc", async () => {
    await variant("Angle");
    const at0 = hist().at;
    await click(atom(1)); await click(atom(2));
    await move(atom(3));
    const arc = !!overlay()?.querySelector("polyline"), live = liveValue();
    await click(atom(3));
    const m = measures().at(-1);
    result("W3", "Angle: after the vertex the arc and the value follow the pointer; the third click makes it with the value shown",
      arc && m && JSON.stringify(m.measure.ends) === "[1,2,3]" && m.text === live && live === "120.0°" && hist().at - at0 === 1,
      `arc ${arc}, live ${live}, made ${m?.text}, steps ${hist().at - at0}`);
  });
  await step("W4", "Drag and let go", async () => {
    await variant("Length");
    const at0 = hist().at, a = atom(0), b = atom(5);
    ev("pointermove", a, { buttons: 0 }); ev("pointerdown", a);
    for (let k = 1; k <= 6; k++) { ev("pointermove", [a[0] + ((b[0] - a[0]) * k) / 6, a[1] + ((b[1] - a[1]) * k) / 6]); await wait(30); }
    const live = liveValue();
    ev("pointerup", b); await wait(200);
    const m = measures().at(-1);
    result("W4", "A press on A dragged and let go on B makes the length A to B", m && JSON.stringify(m.measure.ends) === "[0,5]" && m.text === live && hist().at - at0 === 1, `made ${JSON.stringify(m?.measure)} ${m?.text}, live ${live}, steps ${hist().at - at0}`);
  });
  await step("W5", "Hold to Select", async () => {
    const at0 = hist().at, n = measures().length, p = toScreen([1, -5]);
    ev("pointermove", p, { buttons: 0 }); ev("pointerdown", p);
    await wait(700);
    const held = tool();
    ev("pointerup", p); await wait(300);
    result("W5", "A press held still gives Select, and places nothing", /^Select|^Lasso/.test(held ?? "") && measures().length === n && hist().at === at0 && !overlay(), `held ${held}, measurements ${measures().length - n}, steps ${hist().at - at0}`);
    measureButton().click(); await wait(250);
  });
  await step("W6", "Escape", async () => {
    const at0 = hist().at;
    await click(atom(0)); await move(atom(2));
    const had = !!overlay();
    await escape();
    await move(atom(4));
    result("W6", "Escape takes the measurement in progress away; nothing in the history", had && !overlay() && hist().at === at0, `had ${had}, after ${!!overlay()}, steps ${hist().at - at0}`);
  });
  await step("W7", "Backspace", async () => {
    await variant("Angle");
    const at0 = hist().at;
    await click(atom(0)); await click(atom(1));
    await move(toScreen([2, -2]));
    const rings2 = overlay()?.querySelectorAll("circle:not(.end)").length;
    key({ key: "Backspace", code: "Backspace" }); await wait(150);
    await move(toScreen([2, -2]));
    const rings1 = overlay()?.querySelectorAll("circle:not(.end)").length;
    await click(atom(4)); await click(atom(5));
    const m = measures().at(-1);
    result("W7", "Backspace takes off the last end; the next clicks go on from the one left", rings2 === 2 && rings1 === 1 && m && JSON.stringify(m.measure.ends) === "[0,4,5]" && hist().at - at0 === 1, `rings ${rings2} then ${rings1}, made ${JSON.stringify(m?.measure)}`);
  });
  await step("W8", "A tool change mid-way", async () => {
    const at0 = hist().at;
    await click(atom(0));
    const had = !!overlay();
    [...document.querySelectorAll(".palette .slot > .tool")].find((b) => /^Select/.test(b.getAttribute("aria-label") ?? ""))?.click(); await wait(200);
    measureButton().click(); await wait(250);
    await move(atom(3));
    result("W8", "Changing tool takes the measurement in progress away", had && !overlay() && hist().at === at0, `had ${had}, after ${!!overlay()}`);
  });
  await step("W9", "Dihedral: atoms only", async () => {
    await variant("Dihedral");
    const at0 = hist().at;
    await click(toScreen([1, -4]));
    const none = !overlay() || !overlay().querySelector("circle");
    for (const i of [0, 1, 2]) await click(atom(i));
    await click(toScreen([1, -4]));
    const still = !!overlay();
    await click(atom(3));
    const m = measures().at(-1);
    result("W9", "Dihedral: a click off an atom places nothing; four atoms make it", none && still && m && JSON.stringify(m.measure.ends) === "[0,1,2,3]" && hist().at - at0 === 1, `first off ${none}, still ${still}, made ${JSON.stringify(m?.measure)}`);
  });
  await step("W10", "Undo, Redo and ⌘A on a measurement with free ends", async () => {
    await variant("Length");
    await click(atom(1));
    key({ key: "z", code: "KeyZ", metaKey: true }); await wait(200);
    const undoTakesIt = !overlay();
    const n = measures().length;
    await click(toScreen([0, 3])); await click(toScreen([4, 3]));
    const free = measures().at(-1);
    key({ key: "z", code: "KeyZ", metaKey: true }); await wait(250);
    const undone = !measures().some((c) => c.id === free.id) && measures().length === n;
    key({ key: "z", code: "KeyZ", metaKey: true, shiftKey: true }); await wait(250);
    const redone = measures().length === n + 1 && measures().some((c) => c.id === free.id && JSON.stringify(c.measure.ends) === JSON.stringify(free.measure.ends));
    key({ key: "a", code: "KeyA", metaKey: true }); await wait(250);
    const all = picked()?.has(free.id);
    await escape();
    result("W10", "Undo takes a measurement in progress away; Undo and Redo the made one; ⌘A picks it", undoTakesIt && measures().length >= n && undone && redone && all, `undo in progress ${undoTakesIt}, undone ${undone}, redone ${redone}, ⌘A ${all}`);
  });
  await step("W15", "Undo and Redo while measuring", async () => {
    await variant("Angle");
    const at0 = hist().at, len0 = hist().stack.length, doc0 = doc(), n = measures().length;
    const rings = async () => { await move(toScreen([2, -2])); return overlay()?.querySelectorAll("circle:not(.end)").length ?? 0; };
    const cmd = async (k, shiftKey = false) => { key({ key: k, code: `Key${k.toUpperCase()}`, metaKey: true, shiftKey }); await wait(250); };
    await click(atom(0)); await click(atom(1));
    const two = await rings();
    await cmd("z");
    const one = await rings(), kept = hist().at === at0 && hist().stack.length === len0 && doc() === doc0;
    await cmd("z", true); await cmd("y");
    const still = await rings(), same = hist().at === at0 && hist().stack.length === len0 && doc() === doc0;
    await click(atom(2)); await click(atom(3));
    const m = measures().at(-1), made = !!m && JSON.stringify(m.measure.ends) === "[0,2,3]" && hist().at === at0 + 1;
    // One end placed: ⌘Z takes it off and the measurement in progress ends; the next ⌘Z undoes the angle made above.
    await click(atom(5));
    await cmd("z");
    const ended = !overlay() && hist().at === at0 + 1 && measures().length === n + 1;
    await cmd("z");
    const undid = hist().at === at0 && measures().length === n;
    await cmd("z", true);
    const back = hist().at === at0 + 1 && measures().length === n + 1;
    result("W15", "⌘Z while measuring takes off the last end and leaves the history as it is; ⇧⌘Z and ⌘Y do nothing; with no end left, the next ⌘Z undoes as usual",
      two === 2 && one === 1 && kept && still === 1 && same && made && ended && undid && back,
      `ends ${two} → ⌘Z ${one} (history kept ${kept}) → ⇧⌘Z, ⌘Y ${still} (history kept ${same}); made ${JSON.stringify(m?.measure.ends)} ${made}; one end ⌘Z ended ${ended}; next ⌘Z undid ${undid}; ⇧⌘Z ${back}`);
  });
  await step("W14", "Colour and the Text menu on a measurement with free ends", async () => {
    const palette = async (text) => {
      key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true });
      const find = await until(() => document.querySelector(".command-palette input"), 3000);
      if (!find) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(find, text);
      find.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(500);
      find.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      await wait(700);
      return true;
    };
    await variant("Length");
    await click(toScreen([0, 4])); await click(toScreen([3, 4]));
    const id = measures().at(-1).id, at0 = hist().at;
    // The Actions panel's colour (its swatch for Green), then Bold from the command palette (the Text menu's).
    const swatch = await until(() => [...document.querySelectorAll(".actions button, .actions [role=radio], .actions [role=menuitemradio]")].find((x) => /^Green$/.test(x.getAttribute("aria-label") ?? x.getAttribute("data-tip") ?? "")), 3000);
    if (!swatch) throw new Error(`no Green swatch in the Actions panel: ${[...document.querySelectorAll(".actions [aria-label]")].map((x) => x.getAttribute("aria-label")).slice(0, 60).join(", ")}`);
    swatch.click(); await wait(400);
    await palette("Bold");
    const c = doc().captions.find((x) => x.id === id), steps = hist().at - at0;
    key({ key: "z", code: "KeyZ", metaKey: true }); await wait(250);
    const undone = doc().captions.find((x) => x.id === id);
    result("W14", "The Actions panel's colour and Bold (the Text menu's, from the palette) go on a measurement with free ends, one step each, and it stays a measurement; Undo takes the last back",
      c?.colour === "#22775B" && c.bold && c.measure && steps === 2 && !!undone && !undone.bold && undone.colour === "#22775B", `colour ${c?.colour}, bold ${c?.bold}, measure ${!!c?.measure}, steps ${steps}, after undo ${undone ? `bold ${undone.bold}, colour ${undone.colour}` : "gone"}`);
    await escape();
  });
  await step("W16", "Measure length on a bond: the Actions panel, the right-click menu and Structure > Measure > Length", async () => {
    // A bond clicked with Select (40% along it, clear of the measurements' lines and labels) or right-clicked: its two
    // atoms are what is selected, and the panel shows the bond's actions.
    [...document.querySelectorAll(".palette .slot > .tool")].find((b) => /^Select/.test(b.getAttribute("aria-label") ?? ""))?.click(); await wait(300); await escape();
    const along = (i, j) => { const a = doc().atoms[i].location, b = doc().atoms[j].location; return toScreen([a[0] + (b[0] - a[0]) * 0.4, a[1] + (b[1] - a[1]) * 0.4]); };
    const lengthOf = (i, j) => measures().find((c) => c.measure.ends.length === 2 && c.measure.ends.every((e) => e === i || e === j));
    // Picked: the editor's picked set holds it alone (the selection of atoms is empty after a measurement is made).
    const pickedIt = (id) => hooks().some((v) => v instanceof Set && v.size === 1 && v.has(id));
    const n = measures().length;
    // The Actions panel: Measure length beside 3D clean up, as for 2 atoms.
    let at0 = hist().at;
    await click(along(1, 2));
    const bond = !!document.querySelector('.actions [data-command="bond_properties"]'), button = document.querySelector('.actions .tray-button[data-command="measure_distance"]');
    const beside = !!button && button.parentElement === document.querySelector('.actions .tray-button[data-command="clean_3d"]')?.parentElement && button.getAttribute("aria-label") === "Measure length";
    button?.click(); await wait(400);
    // A C–C bond of the chain: 1.52 Å (with a no-break space, as measureText writes it).
    const panel = lengthOf(1, 2), panelSteps = hist().at - at0, panelPicked = !!panel && pickedIt(panel.id), byPanel = panel?.text === "1.52\u00a0Å" && panelSteps === 1 && panelPicked;
    await escape();
    // The right-click menu: Measure length in 3D tools.
    at0 = hist().at;
    const p = along(3, 4);
    ev("pointermove", p, { buttons: 0 }); await wait(60);
    (document.elementFromPoint(p[0], p[1]) ?? document.body).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: p[0], clientY: p[1], button: 2 }));
    await wait(600);
    const menuItem = (name) => [...document.querySelectorAll(".context-menu button, .context-menu [role=menuitem]")].find((b) => (b.getAttribute("aria-label") ?? b.textContent.trim()) === name || b.textContent.trim() === name);
    const tools3d = menuItem("3D tools");
    tools3d?.click(); await wait(500);
    const item = menuItem("Measure length");
    item?.click(); await wait(500);
    const menu = lengthOf(3, 4), menuSteps = hist().at - at0, byMenu = menu?.text === "1.52\u00a0Å" && menuSteps === 1;
    await escape(); await escape();
    // Structure > Measure > Length (the menu's command, run from the command palette) with a bond selected.
    at0 = hist().at;
    await click(along(4, 5));
    key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true });
    const find = await until(() => document.querySelector(".command-palette input"), 3000);
    if (find) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(find, "Measure length");
      find.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(500);
      find.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
      await wait(700);
    }
    const command = lengthOf(4, 5), commandSteps = hist().at - at0, byCommand = command?.text === "1.52\u00a0Å" && commandSteps === 1;
    await escape();
    await variant("Length");
    result("W16", "Measure length on a bond: in the Actions panel beside 3D clean up, in the right-click menu's 3D tools, and Structure > Measure > Length; each a length between its two atoms in one step",
      bond && beside && byPanel && !!tools3d && byMenu && byCommand && measures().length === n + 3,
      `bond actions ${bond}, button beside 3D clean up ${beside}, panel ${panel?.text} in ${panelSteps} step, picked ${panelPicked}; menu 3D tools ${!!tools3d}, item ${!!item}, ${menu?.text} in ${menuSteps} step; command ${command?.text} in ${commandSteps} step; made ${measures().length - n}`);
  });
  for (const [id, zoom] of [["W11", 0.1], ["W12", 8]]) await step(id, `Zoom ${zoom * 100}%`, async () => {
    const v = viewStore(), was = v.get();
    const a0 = doc().atoms[0].location;
    v.set({ zoom, x: innerWidth / 2 - a0[0] * L * zoom, y: innerHeight / 2 + a0[1] * L * zoom });
    await wait(300);
    const at0 = hist().at;
    await click(atom(0)); await move(atom(zoom > 1 ? 1 : 4));
    const live = liveValue();
    await click(atom(zoom > 1 ? 1 : 4));
    const m = measures().at(-1);
    v.set(was); await wait(200);
    result(id, `At ${zoom * 100}%: a length by two clicks, its value as shown`, m && m.text === live && hist().at - at0 === 1, `live ${live}, made ${m?.text}`);
  });
  await step("W13", "Pointer moves on a large drawing: Measure against Select", async () => {
    await escape();
    key({ key: "a", code: "KeyA", metaKey: true }); await wait(150);
    key({ key: "Backspace", code: "Backspace" }); await wait(300);
    const big = new DataTransfer();
    big.setData("application/x-octet+json", BIG);
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: big, bubbles: true, cancelable: true }));
    await until(() => doc().atoms.length >= 4000, 30000);
    await wait(800); await escape();
    const v = viewStore(), a0 = doc().atoms[0].location, zoom = 0.6;
    v.set({ zoom, x: 200 - a0[0] * L * zoom, y: 200 + a0[1] * L * zoom }); await wait(400);
    // Each move through the editor's own path (its hit test, the hover, the dotted line and the value), timed to the
    // next task: the mean, the middle and the 95th of 200 moves over the atoms.
    const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
    const path = Array.from({ length: 200 }, (_, k) => atom((k * 97) % doc().atoms.length));
    const time = async () => { const t = []; for (const p of path) { const s = performance.now(); ev("pointermove", p, { buttons: 0 }); await tick(); t.push(performance.now() - s); } t.sort((p, q) => p - q); return { mean: t.reduce((p, q) => p + q, 0) / t.length, median: t[100], p95: t[190] }; };
    const runs = { select: [], length: [], angle: [] };
    let selectTool;
    // Twice, in turn, so a busy moment counts against each; the better of the two is kept.
    for (let round = 0; round < 2; round++) {
      [...document.querySelectorAll(".palette .slot > .tool")].find((b) => /^Select/.test(b.getAttribute("aria-label") ?? ""))?.click(); await wait(300); await escape();
      selectTool = tool();
      runs.select.push(await time());
      await variant("Length"); await click(atom(0));
      runs.length.push(await time());
      await escape();
      await variant("Angle"); await click(atom(0)); await click(atom(1));
      runs.angle.push(await time());
      await escape();
    }
    const best = (k) => runs[k].reduce((a, b) => (b.mean < a.mean ? b : a)), say = (k) => { const b = best(k); return `${k} ${b.mean.toFixed(2)} ms (middle ${b.median.toFixed(1)}, 95th ${b.p95.toFixed(1)})`; };
    result("W13", "A pointer move with a length or an angle in progress on 4000 atoms costs at most 1.5 ms more than Select's (mean of 200 moves)", /^Select/.test(selectTool ?? "") && best("length").mean <= best("select").mean + 1.5 && best("angle").mean <= best("select").mean + 1.5,
      `${["select", "length", "angle"].map(say).join(", ")}, atoms ${doc().atoms.length}`);
  });
  out.errors = window.__errors;
  return JSON.stringify(out);
}
// A measurement from an atom to an empty point moved with its structure, and the Measure tool's edges (run by S46
// above; it uses CHAIN as measureUi does). F1 to F4: a drag, the arrow keys, Space and a drag, and an Option-drag copy
// take its free end with its atom, so its value stays. F5: its label dragged alone leaves the free end. F9: Align takes
// it with its structure too. F6: with grid
// snapping on, the value shown before a click is the value the click makes. F7: Backspace once more than the ends
// placed changes nothing. F8: the measurement just made shows no handle with Measure in hand, and a press there places
// an end. F10: nor does its selection frame, so a click on the atom just measured places an end.
async function followUi() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (find, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = find(); if (v) return v; await wait(100); } return null; };
  const out = { cases: [], errors: [] };
  const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  const key = (init) => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  const editorFiber = () => { const root = document.getElementById("root"), k = Object.keys(root).find((x) => x.startsWith("__reactContainer")), stack = [root[k].stateNode.current]; while (stack.length) { const f = stack.pop(); if (!f) continue; if (f.type?.name === "Editor") return f; if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); } };
  const hookList = () => { const r = []; let h = editorFiber()?.memoizedState; while (h) { r.push(h); h = h.next; } return r; };
  const hooks = () => hookList().map((h) => h.memoizedState);
  const hist = () => hookList().find((h) => h.memoizedState && Array.isArray(h.memoizedState.stack) && typeof h.memoizedState.at === "number").memoizedState;
  const doc = () => hist().stack[hist().at];
  const world = () => document.getElementById("world");
  let L = NaN;
  const toScreen = ([x, y]) => { const p = new DOMPoint(x * L, -y * L).matrixTransform(world().getScreenCTM()); return [p.x, p.y]; };
  const ev = (type, [x, y], extra = {}) => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, pointerType: "mouse", isPrimary: true, ...extra }));
  const move = async (p) => { ev("pointermove", p, { buttons: 0 }); await wait(60); };
  const click = async (p, extra) => { ev("pointermove", p, { buttons: 0, ...extra }); ev("pointerdown", p, extra); await wait(30); ev("pointerup", p, extra); await wait(160); };
  const drag = async (from, by, extra = {}) => {
    ev("pointermove", from, { buttons: 0, ...extra }); ev("pointerdown", from, extra); await wait(30);
    for (let k = 1; k <= 8; k++) { ev("pointermove", [from[0] + (by[0] * k) / 8, from[1] + (by[1] * k) / 8], extra); await wait(25); }
    ev("pointerup", [from[0] + by[0], from[1] + by[1]], extra); await wait(300);
  };
  const atom = (i) => toScreen(doc().atoms[i].location);
  const toolButton = (name) => [...document.querySelectorAll(".palette .slot > .tool")].find((b) => (b.getAttribute("aria-label") ?? "").startsWith(name));
  const measureButton = () => toolButton("Measure");
  const variant = async (name) => {
    const b = measureButton();
    b.click(); await wait(250);
    if (!document.querySelector('.strip[data-tool="measure"]')) { b.click(); await wait(300); }
    const item = [...document.querySelectorAll('.strip[data-tool="measure"] [role=menuitemradio]')].find((x) => (x.getAttribute("aria-label") ?? x.textContent.trim()) === name);
    item?.click(); await wait(300);
    if (!item) throw new Error(`no ${name} in the Measure strip`);
  };
  const select = async () => { toolButton("Select").click(); await wait(250); if (document.querySelector(".strip")) { key({ key: "Escape", code: "Escape" }); await wait(200); } };
  const overlay = () => document.querySelector(".measuring");
  const liveValue = () => overlay()?.querySelector("text.turn-angle")?.textContent;
  const measures = () => (doc().captions ?? []).filter((c) => c.measure);
  const result = (id, title, ok, note) => out.cases.push({ id, title, ok: !!ok, ...(note ? { note } : {}) });
  const step = async (id, title, f) => { try { await f(); } catch (e) { result(id, title, false, `the script stopped: ${e && e.message}`); } };
  const escape = async () => { key({ key: "Escape", code: "Escape" }); await wait(150); };
  const palette = async (text) => {
    key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true });
    const find = await until(() => document.querySelector(".command-palette input"), 3000);
    if (!find) throw new Error("no command palette");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(find, text);
    find.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(500);
    find.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    await wait(600);
  };

  await until(() => document.querySelector(".home, .editor"));
  await wait(1200);
  button("Skip")?.click();
  await wait(900);
  document.querySelector(".home-tile.new")?.click();
  await until(() => document.querySelector(".palette"));
  [...document.querySelectorAll(".coach button")].find((b) => /skip/i.test(b.textContent))?.click();
  await wait(600);
  const dt = new DataTransfer();
  dt.setData("application/x-octet+json", CHAIN);
  window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  if (!(await until(() => doc()?.atoms.length === 6, 8000))) return JSON.stringify({ cases: [{ id: "F0", title: "the chain pasted", ok: false }], errors: window.__errors });
  await wait(400);
  await escape();
  L = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--bond-length")) * 4) / 3;

  // The measurement: atom 0 to the empty point 3 bond lengths below it (4.56 Å).
  await variant("Length");
  const a0 = doc().atoms[0].location;
  await click(atom(0)); await click(toScreen([a0[0], a0[1] - 3]));
  const id = measures().at(-1)?.id;
  await escape();
  await select();
  const now = () => { const d = doc(), c = d.captions.find((x) => x.id === id); return { atom: d.atoms[0].location.slice(0, 2), free: c.measure.ends[1], text: c.text, label: [c.x, c.y] }; };
  // The atom moved, the free end by the same step, and the value as it was.
  const went = (a, b) => { const da = [b.atom[0] - a.atom[0], b.atom[1] - a.atom[1]], df = [b.free[0] - a.free[0], b.free[1] - a.free[1]]; return Math.hypot(...da) > 0.1 && Math.hypot(da[0] - df[0], da[1] - df[1]) < 1e-6 && b.text === a.text; };
  const show = (a, b) => `atom ${a.atom.map((v) => v.toFixed(2))} to ${b.atom.map((v) => v.toFixed(2))}, free end ${a.free.map((v) => v.toFixed(2))} to ${b.free.map((v) => v.toFixed(2))}, ${a.text} to ${b.text}`;

  await step("F1", "A drag", async () => {
    const was = now();
    key({ key: "a", code: "KeyA", metaKey: true }); await wait(200);
    await drag(atom(2), [120, 60]);
    result("F1", "⌘A and a drag: the free end goes with the structure; the value stays", was.text === "4.56 Å" && went(was, now()), show(was, now()));
    await escape();
  });
  await step("F2", "The arrow keys", async () => {
    const was = now();
    key({ key: "a", code: "KeyA", metaKey: true }); await wait(200);
    for (let k = 0; k < 5; k++) { key({ key: "ArrowRight", code: "ArrowRight", shiftKey: true }); await wait(120); }
    result("F2", "⌘A and Shift+Right five times: the free end goes with the structure; the value stays", went(was, now()), show(was, now()));
    await escape();
  });
  await step("F3", "Space and a drag", async () => {
    const was = now();
    await move(atom(2));
    key({ key: " ", code: "Space" }); await wait(250);
    await drag(atom(2), [-80, 40]);
    result("F3", "Space over the structure takes its measurement with it; a drag takes the free end too; the value stays", went(was, now()), show(was, now()));
    await escape();
  });
  await step("F4", "An Option-drag copy", async () => {
    const was = now(), ids = new Set(measures().map((c) => c.id)), n = doc().atoms.length;
    key({ key: "a", code: "KeyA", metaKey: true }); await wait(200);
    await drag(atom(2), [0, 160], { altKey: true });
    const copy = measures().find((c) => !ids.has(c.id) && typeof c.measure.ends[0] === "number"), d = doc();
    const da = copy && [d.atoms[copy.measure.ends[0]].location[0] - d.atoms[0].location[0], d.atoms[copy.measure.ends[0]].location[1] - d.atoms[0].location[1]];
    const df = copy && [copy.measure.ends[1][0] - was.free[0], copy.measure.ends[1][1] - was.free[1]];
    result("F4", "⌘A and an Option-drag: the copy's free end goes with the copy's atoms; both read 4.56 Å", copy && d.atoms.length === 2 * n && Math.hypot(...da) > 0.5 && Math.hypot(da[0] - df[0], da[1] - df[1]) < 1e-6 && copy.text === was.text && now().text === was.text && now().free[0] === was.free[0] && now().free[1] === was.free[1],
      `copy ${copy ? `${JSON.stringify(copy.measure.ends)} ${copy.text}` : "none"}, atoms ${d.atoms.length}, step ${da?.map((v) => v.toFixed(2))} against ${df?.map((v) => v.toFixed(2))}`);
    await escape();
  });
  await step("F5", "The label dragged alone", async () => {
    const was = now(), c = doc().captions.find((x) => x.id === id);
    await drag(toScreen([c.x, c.y + 0.25]), [0, 50]);
    const after = now();
    result("F5", "The label dragged alone moves; its free end and the atoms stay", Math.hypot(after.label[0] - was.label[0], after.label[1] - was.label[1]) > 0.5 && after.free[0] === was.free[0] && after.free[1] === was.free[1] && after.atom[0] === was.atom[0] && after.text === was.text, `label ${was.label.map((v) => v.toFixed(2))} to ${after.label.map((v) => v.toFixed(2))}; ${show(was, after)}`);
    await escape();
  });
  await step("F9", "Align top edges", async () => {
    const mixed = () => measures().filter((c) => typeof c.measure.ends[0] === "number" && Array.isArray(c.measure.ends[1]));
    const was = mixed().map((c) => ({ id: c.id, atom: doc().atoms[c.measure.ends[0]].location.slice(0, 2), free: c.measure.ends[1], text: c.text }));
    key({ key: "a", code: "KeyA", metaKey: true }); await wait(200);
    await palette("Align top edges");
    const after = was.map((w) => { const c = doc().captions.find((x) => x.id === w.id); return { id: w.id, atom: doc().atoms[c.measure.ends[0]].location.slice(0, 2), free: c.measure.ends[1], text: c.text }; });
    const moved = after.filter((a, k) => Math.hypot(a.atom[0] - was[k].atom[0], a.atom[1] - was[k].atom[1]) > 0.1);
    result("F9", "⌘A and Align top edges: a structure that moves takes its measurement's free end with it; every value stays", was.length === 2 && moved.length === 1 && after.every((a, k) => went(was[k], a) || (a.atom[0] === was[k].atom[0] && a.atom[1] === was[k].atom[1] && a.free[0] === was[k].free[0] && a.free[1] === was[k].free[1])),
      after.map((a, k) => show(was[k], a)).join("; "));
    await escape();
  });
  await step("F6", "Grid snapping", async () => {
    await palette("Show grid");
    await palette("Turn grid snapping on");
    await variant("Length");
    const base = doc().atoms[0].location, from = [base[0] - 6, base[1] + 5], bad = [];
    let snapped = 0;
    for (const dx of [2.13, 2.37, 2.61, 2.89]) {
      const to = [from[0] + dx, from[1] + 0.04];
      await click(toScreen(from)); await move(toScreen(to));
      const live = liveValue();
      await click(toScreen(to));
      const m = measures().at(-1), end = m.measure.ends[1];
      if (Math.hypot(end[0] - to[0], end[1] - to[1]) > 0.05) snapped++;
      if (m.text !== live) bad.push(`${dx}: live ${live}, made ${m.text} ${JSON.stringify(m.measure.ends)}`);
      // Undo, so the next one is a new measurement.
      key({ key: "z", code: "KeyZ", metaKey: true }); await wait(250);
    }
    await palette("Turn grid snapping off");
    await palette("Hide grid");
    result("F6", "With grid snapping on, the value shown before each click is the value the click makes", snapped > 0 && !bad.length, `${snapped} of 4 snapped; ${bad.join("; ")}`);
    await escape();
  });
  await step("F7", "Backspace once more", async () => {
    await variant("Length");
    const at0 = hist().at, n = doc().atoms.length;
    await click(atom(3));
    key({ key: "Backspace", code: "Backspace" }); await wait(150);
    const off = !overlay();
    await move(atom(3));
    key({ key: "Backspace", code: "Backspace" }); await wait(250);
    result("F7", "Backspace takes the end off; once more with the pointer on the atom, nothing changes", off && doc().atoms.length === n && hist().at === at0, `end off ${off}, atoms ${n} to ${doc().atoms.length}, steps ${hist().at - at0}`);
  });
  await step("F8", "The width handle", async () => {
    await variant("Length");
    await click(atom(0)); await click(atom(4));
    const made = measures().at(-1), at0 = hist().at, handle = document.querySelector("circle.handle")?.getBoundingClientRect();
    const box = [...document.querySelectorAll("#world text")].filter((t) => t.textContent === made.text).map((t) => t.getBoundingClientRect()).at(-1);
    const p = handle ? [handle.x + handle.width / 2, handle.y + handle.height / 2] : [box.right + 6, box.y + box.height / 2];
    await click(p);
    const placed = !!overlay(), width = doc().captions.find((c) => c.id === made.id)?.width;
    await escape();
    result("F8", "The measurement just made shows no handle with Measure in hand, and a press beside its label places an end", !handle && placed && hist().at === at0 && width === undefined, `handle ${!!handle}, end placed ${placed}, steps ${hist().at - at0}, width ${width}`);
  });
  await step("F10", "The selection frame", async () => {
    // A length 0 to 3 at 100% (a new drawing's zoom): its label is picked, and a corner of its frame came within 5 px of
    // atom 3.
    await variant("Length");
    await click(atom(0)); await click(atom(3));
    const made = measures().at(-1), marks = document.querySelectorAll(".resize-handle, .turn-handle, .selection-frame").length, at0 = hist().at;
    await click(atom(3));
    const placed = !!overlay(), size = doc().captions.find((c) => c.id === made.id)?.size;
    await escape();
    // ⌘A with Measure in hand: no frame, so no turn handle to drag.
    key({ key: "a", code: "KeyA", metaKey: true }); await wait(300);
    const all = document.querySelectorAll(".resize-handle, .turn-handle, .selection-frame").length;
    await escape();
    result("F10", "With Measure in hand no selection frame or handle shows, so a click on the atom just measured places an end, and ⌘A gives no turn handle", made && !marks && placed && hist().at === at0 && size === made.size && !all,
      `frame marks ${marks}, end placed ${placed}, steps ${hist().at - at0}, size ${made?.size} to ${size}, after ⌘A ${all}`);
  });
  out.errors = window.__errors;
  return JSON.stringify(out);
}
// The toolbar's indicator on each tool in hand, in one column and in two (the toggle).
async function indicatorUi() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (find, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = find(); if (v) return v; await wait(100); } return null; };
  const out = { cases: [], errors: [] };
  const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
  const key = (init) => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  const editorFiber = () => { const root = document.getElementById("root"), k = Object.keys(root).find((x) => x.startsWith("__reactContainer")), stack = [root[k].stateNode.current]; while (stack.length) { const f = stack.pop(); if (!f) continue; if (f.type?.name === "Editor") return f; if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); } };
  const hookList = () => { const r = []; let h = editorFiber()?.memoizedState; while (h) { r.push(h); h = h.next; } return r; };
  const hooks = () => hookList().map((h) => h.memoizedState);
  const hist = () => hookList().find((h) => h.memoizedState && Array.isArray(h.memoizedState.stack) && typeof h.memoizedState.at === "number").memoizedState;
  const doc = () => hist().stack[hist().at];
  const picked = () => hooks().filter((v) => v instanceof Set).sort((a, b) => b.size - a.size)[0];
  const viewStore = () => hooks().find((v) => v && typeof v.get === "function" && typeof v.set === "function" && v.get() && typeof v.get().zoom === "number");
  const world = () => document.getElementById("world");
  let L = NaN;
  const toScreen = ([x, y]) => { const p = new DOMPoint(x * L, -y * L).matrixTransform(world().getScreenCTM()); return [p.x, p.y]; };
  const ev = (type, [x, y], extra = {}) => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, pointerType: "mouse", isPrimary: true, ...extra }));
  const move = async (p) => { ev("pointermove", p, { buttons: 0 }); await wait(60); };
  const click = async (p, extra) => { ev("pointermove", p, { buttons: 0, ...extra }); ev("pointerdown", p, extra); await wait(30); ev("pointerup", p, extra); await wait(160); };
  const atom = (i) => toScreen(doc().atoms[i].location);
  const tool = () => [...document.querySelectorAll(".palette .slot > .tool")].find((b) => b.getAttribute("aria-pressed") === "true")?.getAttribute("aria-label");
  const measureButton = () => [...document.querySelectorAll(".palette .slot > .tool")].find((b) => /^Measure/.test(b.getAttribute("aria-label") ?? ""));
  const variant = async (name) => {
    const b = measureButton();
    b.click(); await wait(250);
    if (!document.querySelector('.strip[data-tool="measure"]')) { b.click(); await wait(300); }
    const item = [...document.querySelectorAll('.strip[data-tool="measure"] [role=menuitemradio]')].find((x) => (x.getAttribute("aria-label") ?? x.textContent.trim()) === name);
    item?.click(); await wait(300);
    if (!item) throw new Error(`no ${name} in the Measure strip: ${document.querySelector('.strip[data-tool="measure"]')?.textContent}`);
    return true;
  };
  const overlay = () => document.querySelector(".measuring");
  const liveValue = () => overlay()?.querySelector("text.turn-angle")?.textContent;
  const measures = () => (doc().captions ?? []).filter((c) => c.measure);
  const result = (id, title, ok, note) => out.cases.push({ id, title, ok: !!ok, ...(note ? { note } : {}) });
  const step = async (id, title, f) => { try { await f(); } catch (e) { result(id, title, false, `the script stopped: ${e && e.message}`); } };
  const escape = async () => { key({ key: "Escape", code: "Escape" }); await wait(150); };

  await until(() => document.querySelector(".home, .editor"));
  await wait(1200);
  button("Skip")?.click();
  await wait(900);
  document.querySelector(".home-tile.new")?.click();
  await until(() => document.querySelector(".palette"));
  [...document.querySelectorAll(".coach button")].find((b) => /skip/i.test(b.textContent))?.click();
  await wait(600);

  // The indicator on each tool in hand: one column, then two (the toggle), and a short window (two by itself).
  const check = async (how) => {
    const bad = [];
    const slots = [...document.querySelectorAll(".palette .slot > .tool")];
    for (const b of slots) {
      b.click(); await wait(420);
      document.querySelector(".strip") && b.click(); await wait(50);
      key({ key: "Escape", code: "Escape" }); await wait(250);
      const i = document.querySelector(".palette .indicator").getBoundingClientRect(), r = b.getBoundingClientRect();
      if (b.getAttribute("aria-pressed") !== "true") bad.push(`${how} ${b.getAttribute("aria-label")}: not in hand`); else if ((Math.abs(i.x - r.x) > 0.5 || Math.abs(i.y - r.y) > 0.5)) bad.push(`${how} ${b.getAttribute("aria-label")}: ${i.x},${i.y} not ${r.x},${r.y}`);
    }
    return { how, tools: slots.length, wide: document.querySelector(".palette").classList.contains("wide"), bad };
  };
  const res = [await check("one column")];
  document.querySelector(".palette-toggle")?.click(); await wait(600);
  res.push(await check("two columns"));
  document.querySelector(".palette-toggle")?.click(); await wait(400);
  return JSON.stringify({ res, errors: window.__errors });
}
