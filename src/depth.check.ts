// Run: node src/depth.check.ts. Fails if a structure with depth (from a CIF or 3D MOL file, or 3D Clean Up) can stop
// the editor again. Indigo reads stereocentres from depth with a symmetry search that has no limit: tetrakis-
// (triisopropylsilyl)silane with its hydrogens drawn as atoms took 20 seconds for its formula, and the Actions
// panel stopped the window with it. The checks run in a child process that is stopped after 30 seconds, so a hang
// fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.argv[2] !== "run") {
  const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "run"], { stdio: ["ignore", "inherit", "inherit"], timeout: 30_000 });
  assert.equal(run.signal, null, "depth.check: a call never ended (stopped after 30 seconds)");
  process.exit(run.status ?? 1);
}

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
const { hydrogens } = await import("./render.ts");
type Mol = import("./render.ts").Mol;
await chem.ready;

// A structure with every hydrogen drawn as an atom and each atom at its own depth, as a CIF file gives it.
let seed = 7;
const depth = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
function in3d(smiles: string): Mol {
  const m = chem.parseStructure(smiles), used = m.atoms.map(() => 0);
  for (const b of m.bonds) for (const i of b.atoms) used[i] += b.type;
  const atoms = m.atoms.map((a) => ({ ...a, location: [a.location[0], a.location[1], depth()] as [number, number, number] })), bonds = [...m.bonds];
  m.atoms.forEach((a, i) => {
    for (let k = hydrogens(a.label, 0, used[i]); k > 0; k--) {
      atoms.push({ label: "H", location: [a.location[0] + 0.3 * Math.cos(k * 2), a.location[1] + 0.3 * Math.sin(k * 2), depth()] });
      bonds.push({ type: 1, atoms: [i, atoms.length - 1] });
    }
  });
  return { atoms, bonds };
}
const timed = <T>(f: () => T): [T | Error, number] => { const t = performance.now(); try { return [f(), performance.now() - t]; } catch (e) { return [e as Error, performance.now() - t]; } };

const tips = "[Si](C(C)C)(C(C)C)C(C)C", busy = in3d(`[Si](${tips})(${tips})(${tips})${tips}`);
assert.equal(busy.atoms.length, 125);
// The formula and masses do not read stereochemistry, so they do not need the depth: they come at once.
const [found, ms] = timed(() => chem.analyse(busy));
assert.ok(ms < 1000, `the formula took ${Math.round(ms)} ms`);
assert.equal((found as chem.Analysis)[0].formula, "C36H84Si5");
// A call that reads stereochemistry stops at Indigo's timeout and fails, so the window is free again.
const [inchi, inchiMs] = timed(() => chem.toInchi(busy));
assert.ok(inchiMs < 3000, `the InChI took ${Math.round(inchiMs)} ms`);
assert.equal(inchi, undefined);
const [smiles] = timed(() => chem.toSmiles(busy));
assert.ok(smiles instanceof RangeError, "SMILES past the ceiling fails");
console.log("depth.check: a crowded structure with depth gives its formula and does not stop the editor ok");

// Depth still sets stereochemistry where it is read: L-alanine in 3D is L-alanine.
const alanine: Mol = {
  atoms: ([["C", -0.577, 0.433, 0.017], ["C", 0.877, 0.034, -0.143], ["C", -1.418, -0.782, 0.31], ["N", -1.046, 1.16, -1.146], ["O", 1.36, -0.984, 0.322], ["O", 1.647, 0.891, -0.836], ["H", -0.66, 1.123, 0.86]] as const)
    .map(([label, x, y, z]) => ({ label, location: [x, y, z] as [number, number, number] })),
  bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [1, 4, 2], [1, 5, 1], [0, 6, 1]].map(([p, q, type]) => ({ type, atoms: [p, q] as [number, number] })),
};
assert.equal(chem.toInchi(alanine), "InChI=1S/C3H7NO2/c1-2(4)3(5)6/h2H,4H2,1H3,(H,5,6)/t2-/m0/s1");
assert.equal(chem.analyse(alanine)?.[0].formula, "C3H7NO2");
console.log("depth.check: depth still gives a stereocentre its hand ok");
