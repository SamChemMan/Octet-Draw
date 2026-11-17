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
const { measureInk, settleMeasures } = await import("./measurement.ts");
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
  for (const c of moved.captions ?? []) if (c.measure) measureInk(moved, c.measure.atoms, () => 0.15);
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
    return [{ atoms: [a, d] }, { atoms: [a, b, c] }, { atoms: [a, b, c, d] }];
  }).flat().map((measure, j) => ({ id: j + 1, text: "–", x: 0, y: 0, chemical: false as const, measure }));
  const plain = m, measured = settleMeasures(undefined, { ...m, captions });
  assert.equal(measured.captions!.filter((c) => c.measure).length, 120);
  assert.equal(settleMeasures(plain, plain), plain, "no measurement: the same drawing, no work");
  const [withM, without] = interleaved(frame(measured, 3, 0.3), frame(plain, 3, 0.3));
  console.log(`measurespeed.check: 40 paclitaxels, 120 measurements: a drag frame ${withM.toFixed(3)} ms, without measurements ${without.toFixed(3)} ms`);
  assert.ok(withM - without <= 1, `a frame costs ${(withM - without).toFixed(2)} ms more with 120 measurements (budget 1 ms)`);
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
  const captions = Array.from({ length: 10 }, (_, k) => { const r = 40 * k + 10, b = r * 5; return { id: k + 1, text: "–", x: 0, y: 0, chemical: false as const, measure: { atoms: [b, b + 1, b + 3, b + 5] } }; });
  const measured = settleMeasures(undefined, { ...peptide, captions });
  assert.ok(measured.captions!.every((c) => c.text !== "–"), "every dihedral has a value");
  const [withM, without] = interleaved(frame(measured, 52, 0.3), frame(peptide, 52, 0.3));
  console.log(`measurespeed.check: 4000-atom peptide, 10 dihedrals: a drag frame ${withM.toFixed(3)} ms, without measurements ${without.toFixed(3)} ms`);
  assert.ok(withM - without <= 2, `a frame costs ${(withM - without).toFixed(2)} ms more with 10 dihedrals (budget 2 ms)`);
}

// S7: a flat 4000-atom peptide: Measure is not cleaned up in 3D (over 500 atoms, as 3D Clean Up), says so, and takes
// the value from the flat drawing, in well under 100 ms.
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
  const t = performance.now(), r = addMeasure(flat, [0, 1, 3, 5]), ms = performance.now() - t;
  assert.ok(typeof r !== "string" && r.tooBig && !r.cleaned.length, "too big to clean up: measured flat");
  assert.ok(typeof r !== "string" && r.mol.atoms === flat.atoms, "the drawing's atoms are as they were");
  console.log(`measurespeed.check: Measure on a flat 4000-atom peptide: ${ms.toFixed(1)} ms`);
  assert.ok(ms < 100, `${ms.toFixed(0)} ms`);
}
