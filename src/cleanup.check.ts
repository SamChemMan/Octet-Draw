// Run: node src/cleanup.check.ts. Fails loudly if Clean Up can stop the editor. Indigo's clean-up took 4 s on each
// crowded structure, and on each real one of more than about 25 atoms. Each drawing below must now be cleaned, or left
// as drawn when a structure is too large, in under BOUND ms (REAL ms for a real structure). Small real structures must
// be cleaned as Indigo cleans them with no time limit. The structures are drawn by hand: each atom is moved up to 0.3
// bond lengths from where Indigo lays it out.
// The structures run in a worker thread, so a clean-up that never ends stops the check instead of hanging it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import type { Mol } from "./render.ts";

const BOUND = 2000, REAL = 500; // ms for each drawing
const ph = "c1ccccc1", pph3 = "P(c1ccccc1)(c1ccccc1)c1ccccc1", on = (group: string, n: number) => `(${group})`.repeat(n);

// Cleaned, or left as drawn, in under BOUND ms.
const crowded: [string, string][] = [
  ["a ring atom with five phenyls", "c1ccccc1" + on(ph, 5)],
  ["a cyclohexane atom with five cyclohexyls", "C1CCCCC1" + on("C2CCCCC2", 5)],
  ["a carbon with 24 phenyls (145 atoms)", "C" + on(ph, 24)],
  ["a 150-atom chain", "C".repeat(150)],
  ["ten rings with five phenyls each", Array(10).fill("c1ccccc1" + on(ph, 5)).join(".")],
  ["a carbon with 50 phenyls (301 atoms)", "C" + on(ph, 50)],
  ["a carbon with 166 phenyls (997 atoms)", "C" + on(ph, 166)],
  ["a 1,000-atom chain", "C".repeat(1000)],
];
// Cleaned in under REAL ms, as Indigo cleans them with no time limit.
const small: [string, string][] = [
  ["benzene", "c1ccccc1"],
  ["hexane", "CCCCCC"],
  ["paracetamol", "CC(=O)Nc1ccc(O)cc1"],
  ["glucose", "OCC1OC(O)C(O)C(O)C1O"],
  ["caffeine", "Cn1cnc2c1c(=O)n(C)c(=O)n2C"],
  ["W(CO)6", "O#C[W](C#O)(C#O)(C#O)(C#O)C#O"],
];
// Cleaned in under REAL ms.
const large: [string, string][] = [
  ["ibuprofen", "CC(C)Cc1ccc(cc1)C(C)C(=O)O"],
  ["morphine", "CN1CCC23c4c5ccc(O)c4OC2C(O)C=CC3C1C5"],
  ["atorvastatin", "CC(C)c1c(C(=O)Nc2ccccc2)c(c(c3ccc(F)cc3)n1CCC(O)CC(O)CC(=O)O)c4ccccc4"],
  ["paclitaxel", "CC1=C2C(C(=O)C3(C)C(CC4OCC4(OC(C)=O)C3C(OC(=O)c5ccccc5)C(O)(CC1OC(=O)C(O)C(NC(=O)c6ccccc6)c7ccccc7)C2(C)C)O)OC(C)=O"],
  ["vancomycin", "CC1C(C(CC(O1)OC2C(C(C(OC2OC3=C4C=C5C=C3OC6=C(C=C(C=C6)C(C(C(=O)NC(C(=O)NC5C(=O)NC7C8=CC(=C(C=C8)O)C9=C(C=C(C=C9O)O)C(NC(=O)C(C(C1=CC(=C(O4)C=C1)Cl)O)NC7=O)C(=O)O)CC(=O)N)NC(=O)C(CC(C)C)NC)O)Cl)CO)O)O)(C)N)O"],
  ["Pd(PPh3)4", `[Pd](${pph3})(${pph3})(${pph3})${pph3}`],
  ["Grubbs II", "CC1=CC(C)=C(N2CCN(C3=C(C)C=C(C)C=C3C)C2=[Ru](Cl)(Cl)(=CC4=CC=CC=C4)P(C5CCCCC5)(C6CCCCC6)C7CCCCC7)C(C)=C1"],
  ["tetraphenylporphyrin", "c1ccc(cc1)-c2c3ccc(n3)c(-c4ccccc4)c5ccc([nH]5)c(-c6ccccc6)c7ccc(n7)c(-c8ccccc8)c9ccc2[nH]9"],
  ["a reaction scheme of five structures", ["CC(=O)Nc1ccc(O)cc1", "CC(C)Cc1ccc(cc1)C(C)C(=O)O", "Cn1cnc2c1c(=O)n(C)c(=O)n2C", "OC(=O)c1ccccc1OC(C)=O", "CC(=O)Oc1ccccc1C(=O)O"].join(".")],
];

if (isMainThread) {
  const worker = new Worker(new URL(import.meta.url));
  let timer: ReturnType<typeof setTimeout> | undefined, current = "Loading Indigo";
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.error(`cleanup.check: ${current} took more than ${ms} ms`);
      void worker.terminate().then(() => process.exit(1));
    }, ms);
  };
  arm(60_000);
  worker.on("message", (m: { start?: string; bound?: number; done?: string; ms?: number; outcome?: string; end?: true }) => {
    if (m.start) { current = m.start; arm(m.bound!); }
    if (m.done) { clearTimeout(timer); console.log(`cleanup.check: ${m.done}: ${m.ms} ms, ${m.outcome}`); }
    if (m.end) console.log("cleanup.check: Clean Up cannot stop the editor, and small structures are cleaned as before");
  });
  worker.on("error", (e) => { clearTimeout(timer); console.error(e); process.exitCode = 1; });
} else {
  // chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
  g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
  g.window = globalThis;
  g.self = { location: { origin: "file://" } };
  g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
  const { cleanUp, MOST_CLEAN, ready } = await import("./chem.ts");
  const { fragments } = await import("./edit.ts");
  // A second Indigo, to lay out the structures (in 50 rounds, as Octet lays out pasted text).
  const indigo = await (await import(new URL("../node_modules/indigo-ketcher/indigo-ketcher-norender.js", import.meta.url).href)).default();
  await ready;
  const post = (m: object) => parentPort!.postMessage(m);
  const timed = <T>(name: string, bound: number, run: () => T, outcome: (t: T) => string) => {
    post({ start: name, bound });
    const t = performance.now(), out = run();
    post({ done: name, ms: Math.round(performance.now() - t), outcome: outcome(out) });
    return out;
  };
  // Octet's own layout, drawn by hand: each atom moved up to 0.3 bond lengths (the same moves each run). Wedges are
  // left out, as Indigo refuses a stereocentre whose bonds are drawn too close together.
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const drawn = (smiles: string): Mol => {
    const o = new indigo.MapStringString(), mol: Mol = { atoms: [], bonds: [] };
    try {
      o.set("output-content-type", "application/json");
      o.set("dearomatize-on-load", "true");
      o.set("layout-max-iterations", "50");
      const ket = JSON.parse(JSON.parse(indigo.layout(smiles, "ket", o)).struct);
      for (const { $ref } of ket.root.nodes as { $ref: string }[]) {
        const first = mol.atoms.length;
        for (const a of ket[$ref].atoms as { label: string; location: number[] }[])
          mol.atoms.push({ label: a.label, location: [a.location[0] + rnd() * 0.3, a.location[1] + rnd() * 0.3, 0] });
        for (const b of ket[$ref].bonds as { type: number; atoms: number[] }[]) mol.bonds.push({ type: b.type, atoms: [first + b.atoms[0], first + b.atoms[1]] });
      }
      return mol;
    } finally {
      o.delete();
    }
  };
  const moved = (from: Mol, to: Mol) => Math.max(...from.atoms.map((a, i) => Math.hypot(a.location[0] - to.atoms[i].location[0], a.location[1] - to.atoms[i].location[1])));
  const bondError = (m: Mol) => Math.sqrt(m.bonds.reduce((s, b) => s + (Math.hypot(...[0, 1].map((k) => m.atoms[b.atoms[0]].location[k] - m.atoms[b.atoms[1]].location[k])) - 1) ** 2, 0) / m.bonds.length);

  for (const [name, smiles] of crowded) {
    const mol = drawn(smiles), big = fragments(mol).some((f) => f.length > MOST_CLEAN);
    timed(name, BOUND, () => cleanUp(mol), (out) => {
      if (big) assert.equal(moved(mol, out), 0, `${name} is left as drawn`);
      return big ? "left as drawn" : `moved up to ${moved(mol, out).toFixed(2)} bond lengths`;
    });
  }
  for (const [name, smiles] of small) {
    const mol = drawn(smiles), before = cleanUp(mol, undefined, 2000);
    timed(name, REAL, () => cleanUp(mol), (out) => {
      assert.ok(moved(before, out) < 0.01, `${name} is cleaned as before (${moved(before, out).toFixed(3)} bond lengths apart)`);
      return "as before";
    });
  }
  for (const [name, smiles] of large) {
    const mol = drawn(smiles);
    const out = timed(name, REAL, () => cleanUp(mol), (out) => `bond lengths ${bondError(out).toFixed(2)} out (drawn ${bondError(mol).toFixed(2)})`);
    timed(`${name}, cleaned again`, REAL, () => cleanUp(out), (again) => `bond lengths ${bondError(again).toFixed(2)} out`);
  }
  post({ end: true });
}
