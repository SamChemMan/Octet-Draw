// Run: node src/measurespeed.check.ts. Measurements (issue 85) cost nothing in a drawing without them, and little in
// one with many: a drag frame of 40 paclitaxels with 3 measurements each, and of a 4000-atom peptide with 10
// dihedrals. The time is the median of interleaved runs (a busy machine slows both kinds of run alike). Budgets are the
// plan's (docs/plans/issue-85-measurements.md, S27 and S28): 1 ms and 2 ms more than without measurements.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { parseStructure, ready } = await import("./chem.ts");
const { EMPTY, addMeasure, insertMol, moveAtoms } = await import("./edit.ts");
// CI runners are about twice as slow as a developer's Mac: the budgets hold there at twice the size.
const SLOW = process.env.CI ? 2 : 1;
const { measureInk, measureValue, placeEnd, settleMeasures } = await import("./measurement.ts");
type Mol = import("./render.ts").Mol;
await ready;

// The median time (ms) of each of two calls, run in turn many times.
function interleaved(a: () => unknown, b: () => unknown, runs = 41): [number, number] {
  const ta: number[] = [], tb: number[] = [];
  for (let k = 0; k < runs; k++) {
    let t = performance.now(); a(); ta.push(performance.now() - t);
    t = performance.now(); b(); tb.push(performance.now() - t);
  }
  const med = (x: number[]) => x.sort((p, q) => p - q)[Math.floor(x.length / 2)];
  return [med(ta), med(tb)];
}
// A drag frame as the editor draws it: the drawing with one atom moved, its measurements settled (shown), and their
// lines worked out (the canvas's under layer).
const frame = (from: Mol, atom: number, d: number) => () => {
  const moved = settleMeasures(from, moveAtoms(from, new Set([atom]), [d, 0]));
  for (const c of moved.captions ?? []) if (c.measure) measureInk(moved, c.measure.ends, () => 0.15);
  return moved;
};

// S27: 40 paclitaxels, 3 measurements each (a distance, an angle and a dihedral).
{
  const one = parseStructure("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C");
  let m: Mol = EMPTY;
  for (let k = 0; k < 40; k++) m = insertMol(m, one, [(k % 8) * 14, Math.floor(k / 8) * 14]).mol;
  const n = one.atoms.length, chain = (k: number) => { const b = one.bonds[5].atoms; return [k * n + b[0], k * n + b[1]]; };
  const near = (k: number, i: number) => one.bonds.filter((b) => b.atoms.includes(i)).map((b) => k * n + (b.atoms[0] === i ? b.atoms[1] : b.atoms[0]));
  const captions = Array.from({ length: 40 }, (_, k) => {
    const [a, b] = chain(k), c = near(k, b - k * n).find((x) => x !== a)!, d = near(k, c - k * n).find((x) => x !== b)!;
    return [{ ends: [a, d] }, { ends: [a, b, c] }, { ends: [a, b, c, d] }];
  }).flat().map((measure, j) => ({ id: j + 1, text: "–", x: 0, y: 0, chemical: false as const, measure }));
  const plain = m, measured = settleMeasures(undefined, { ...m, captions });
  assert.equal(measured.captions!.filter((c) => c.measure).length, 120);
  assert.equal(settleMeasures(plain, plain), plain, "no measurement: the same drawing, no work");
  const [withM, without] = interleaved(frame(measured, 3, 0.3), frame(plain, 3, 0.3));
  console.log(`measurespeed.check: 40 paclitaxels, 120 measurements: a drag frame ${withM.toFixed(3)} ms, without measurements ${without.toFixed(3)} ms`);
  assert.ok(withM - without <= 1 * SLOW, `a frame costs ${(withM - without).toFixed(2)} ms more with 120 measurements (budget 1 ms)`);
}

// S28: a 4000-atom peptide-like chain (800 residues: N, CA with a CB, C=O), 10 dihedrals along its backbone; one
// atom dragged.
{
  const atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [];
  const add = (label: string, x: number, y: number) => atoms.push({ label, location: [x, y, 0] }) - 1;
  let prev = -1;
  for (let r = 0; r < 800; r++) {
    const x = r * 2.6, nAt = add("N", x, 0), ca = add("C", x + 0.87, 0.5), cb = add("C", x + 0.87, 1.5), c = add("C", x + 1.73, 0), o = add("O", x + 1.73, -1);
    if (prev >= 0) bonds.push({ type: 1, atoms: [prev, nAt] });
    bonds.push({ type: 1, atoms: [nAt, ca] }, { type: 1, atoms: [ca, cb] }, { type: 1, atoms: [ca, c] }, { type: 2, atoms: [c, o] });
    prev = c;
  }
  const peptide: Mol = { atoms, bonds };
  assert.equal(atoms.length, 4000);
  const captions = Array.from({ length: 10 }, (_, k) => { const r = 40 * k + 10, b = r * 5; return { id: k + 1, text: "–", x: 0, y: 0, chemical: false as const, measure: { ends: [b, b + 1, b + 3, b + 5] } }; });
  const measured = settleMeasures(undefined, { ...peptide, captions });
  assert.ok(measured.captions!.every((c) => c.text !== "–"), "every dihedral has a value");
  const [withM, without] = interleaved(frame(measured, 52, 0.3), frame(peptide, 52, 0.3));
  console.log(`measurespeed.check: 4000-atom peptide, 10 dihedrals: a drag frame ${withM.toFixed(3)} ms, without measurements ${without.toFixed(3)} ms`);
  assert.ok(withM - without <= 2 * SLOW, `a frame costs ${(withM - without).toFixed(2)} ms more with 10 dihedrals (budget 2 ms)`);
  // Free ends: a length from an atom to a free point and one between two free points, 10 each, beside the dihedrals.
  const mixed = settleMeasures(undefined, { ...peptide, captions: [...captions, ...Array.from({ length: 20 }, (_, k) => ({ id: 100 + k, text: "–", x: 0, y: 0, chemical: false as const,
    measure: { ends: k < 10 ? [k * 200, [k * 52, 4]] as [number, [number, number]] : [[k * 52, 4], [k * 52 + 3, 5]] as [[number, number], [number, number]] } }))] });
  assert.equal(mixed.captions!.filter((c) => c.measure).length, 30);
  const [withFree, plainFrame] = interleaved(frame(mixed, 52, 0.3), frame(peptide, 52, 0.3));
  console.log(`measurespeed.check: 4000-atom peptide, 10 dihedrals and 20 lengths with free ends: a drag frame ${withFree.toFixed(3)} ms, without ${plainFrame.toFixed(3)} ms`);
  assert.ok(withFree - plainFrame <= 2 * SLOW, `a frame costs ${(withFree - plainFrame).toFixed(2)} ms more with free ends (budget 2 ms)`);
  // The pointer moving with Measure in hand and an angle in progress (two ends placed): the overlay's work at each move,
  // as Editor.tsx draws it (the next end, the dashed legs, the dotted line on, the live arc and the value), over atoms
  // and empty canvas in turn. The Atom map tool's move does no such work (its line is drawn from two points), so the
  // budget is that of a frame: at most 1 ms a move (median), on 4000 atoms.
  const placed: [number, number] = [500, 501];
  const overlay = (k: number) => () => {
    const on = k % 2 ? 503 + 5 * (k % 40) : undefined, p: [number, number] = [peptide.atoms[500].location[0] + (k % 7) * 0.3, 2 + (k % 5) * 0.2];
    const live = placeEnd(placed, "angle", on, p);
    measureInk(peptide, placed, () => 0.15);
    measureInk(peptide, [placed[1], live[live.length - 1]], () => 0.15);
    return [measureInk(peptide, live, () => 0.15).arc, measureValue(peptide, live)];
  };
  let k = 0;
  const [move] = interleaved(() => overlay(k++)(), () => undefined, 201);
  console.log(`measurespeed.check: a pointer move with an angle in progress on 4000 atoms: ${move.toFixed(3)} ms`);
  assert.ok(move <= 1 * SLOW, `a pointer move costs ${move.toFixed(2)} ms (budget 1 ms)`);
}

// S7: a flat 4000-atom peptide: Measure takes the value from the drawing as it is (nothing is cleaned up, whatever its
// size), in well under 100 ms.
{
  const atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [];
  const add = (label: string, x: number, y: number) => atoms.push({ label, location: [x, y, 0] }) - 1;
  let prev = -1;
  for (let r = 0; r < 800; r++) {
    const x = r * 2.6, nAt = add("N", x, 0), ca = add("C", x + 0.87, 0.5), cb = add("C", x + 0.87, 1.5), c = add("C", x + 1.73, 0), o = add("O", x + 1.73, -1);
    if (prev >= 0) bonds.push({ type: 1, atoms: [prev, nAt] });
    bonds.push({ type: 1, atoms: [nAt, ca] }, { type: 1, atoms: [ca, cb] }, { type: 1, atoms: [ca, c] }, { type: 2, atoms: [c, o] });
    prev = c;
  }
  const flat: Mol = { atoms, bonds };
  // The best of three, each on a fresh copy of the bonds (so nothing is known of the structure yet): a busy machine
  // slows one run, not all three.
  let ms = Infinity, r: ReturnType<typeof addMeasure> = "";
  for (let k = 0; k < 3; k++) { const t = performance.now(); r = addMeasure({ ...flat, bonds: flat.bonds.map((b) => ({ ...b })) }, [0, 1, 3, 5]); ms = Math.min(ms, performance.now() - t); }
  assert.ok(typeof r !== "string" && r.mol.atoms === flat.atoms, "measured flat: the drawing's atoms are as they were");
  console.log(`measurespeed.check: Measure on a flat 4000-atom peptide: ${ms.toFixed(1)} ms`);
  assert.ok(ms < 100, `${ms.toFixed(0)} ms`);
}
