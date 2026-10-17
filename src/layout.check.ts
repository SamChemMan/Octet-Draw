// Run: node src/layout.check.ts. Fails loudly if text from outside (a paste, a typed SMILES, a file) can stop the
// editor. Each crowded structure below ran for minutes in Indigo's layout with no cap; each must now be laid out or
// refused in under two seconds. Real structures must be laid out exactly as Indigo lays them out with no cap.
// The structures run in a worker thread, so a layout that never ends stops the check instead of hanging it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Worker, isMainThread, parentPort } from "node:worker_threads";

const BOUND = 2000; // ms for each structure
const ph = "c1ccccc1", pph3 = "P(c1ccccc1)(c1ccccc1)c1ccccc1", on = (group: string, n: number) => `(${group})`.repeat(n);
let dendrimer = "C";
for (let k = 0; k < 5; k++) dendrimer = "C" + on(dendrimer, 3);

// Laid out, or refused, in under BOUND ms.
const crowded: [string, string][] = [
  ["a ring atom with five phenyls", "c1ccccc1" + on(ph, 5)],
  ["a cyclohexane atom with five cyclohexyls", "C1CCCCC1" + on("C2CCCCC2", 5)],
  ["a carbon with 50 phenyls", "C" + on(ph, 50)],
  ["a carbon with 99 chlorines next to tBu", "CC(C)(C)C" + on("Cl", 99)],
  ["a carbon with 99 methyls next to trityl", "C(c1ccccc1)(c1ccccc1)(c1ccccc1)C" + on("C", 99)],
  ["a carbon with 33 phenyls (199 atoms)", "C" + on(ph, 33)],
  ["ten rings with five phenyls each", Array(10).fill("c1ccccc1" + on(ph, 5)).join(".")],
  ["a carbon with 99 phenyls (595 atoms)", "C" + on(ph, 99)],
  ["a carbon with 166 phenyls (997 atoms)", "C" + on(ph, 166)],
  ["75 diphenylmethylenes in a chain (977 atoms)", "C" + "C(c1ccccc1)(c1ccccc1)".repeat(75) + "C"],
  ["a branched dendrimer (364 atoms)", dendrimer],
  ["a 1,000-atom chain", "C".repeat(1000)],
  ["20,000 characters on one line that are not chemistry", "x".repeat(20_000)],
  ["a 300,000-character file that is not chemistry", "<" + "abc def\n".repeat(37_500).slice(1)],
];
// Refused before Indigo reads them, with the reason Octet shows.
const tooBig: [string, string, RegExp][] = [
  ["a carbon with 333 phenyls (1,999 atoms)", "C" + on(ph, 333), /more than 1,000 atoms/],
  ["a 1,001-atom chain", "C".repeat(1001), /more than 1,000 atoms/],
  ["a 20,001-character line", "x".repeat(20_001), /more than 20,000 characters/],
  ["a 300,001-character file", "C\n".repeat(150_001).slice(1), /more than 300,000 characters/],
];
// Laid out as Indigo lays them out with no cap.
const real: [string, string][] = [
  ["paracetamol", "CC(=O)Nc1ccc(O)cc1"],
  ["ibuprofen", "CC(C)Cc1ccc(cc1)C(C)C(=O)O"],
  ["morphine", "CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5"],
  ["strychnine", "O=C7N2c1ccccc1[C@@]64[C@@H]2[C@@H]3[C@@H](OC/C=C5\\[C@@H]3C[C@@H]6N(CC4)C5)C7"],
  ["paclitaxel", "CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C"],
  ["vancomycin", "CC1C(C(CC(O1)OC2C(C(C(OC2OC3=C4C=C5C=C3OC6=C(C=C(C=C6)C(C(C(=O)NC(C(=O)NC5C(=O)NC7C8=CC(=C(C=C8)O)C9=C(C=C(C=C9O)O)C(NC(=O)C(C(C1=CC(=C(O4)C=C1)Cl)O)NC7=O)C(=O)O)CC(=O)N)NC(=O)C(CC(C)C)NC)O)Cl)CO)O)O)(C)N)O"],
  ["Pd(PPh3)4", `[Pd](${pph3})(${pph3})(${pph3})${pph3}`],
  ["RhCl(PPh3)3", `Cl[Rh](${pph3})(${pph3})${pph3}`],
  ["Grubbs II", "CC1=CC(C)=C(N2CCN(C3=C(C)C=C(C)C=C3C)C2=[Ru](Cl)(Cl)(=CC4=CC=CC=C4)P(C5CCCCC5)(C6CCCCC6)C7CCCCC7)C(C)=C1"],
  ["BINAP", "c1ccc(cc1)P(c2ccccc2)c3ccc4ccccc4c3-c5c(ccc6ccccc56)P(c7ccccc7)c8ccccc8"],
  ["tetraphenylporphyrin", "c1ccc(cc1)-c2c3ccc(n3)c(-c4ccccc4)c5ccc([nH]5)c(-c6ccccc6)c7ccc(n7)c(-c8ccccc8)c9ccc2[nH]9"],
  ["tetrakis(trityl)methane", "C" + on("C(c1ccccc1)(c1ccccc1)c1ccccc1", 4)],
  ["W(CO)6", "O#C[W](C#O)(C#O)(C#O)(C#O)C#O"],
  ["a 100-residue polyleucine (902 atoms)", "N" + "C(CC(C)C)C(=O)N".repeat(100) + "CC(=O)O"],
];

if (isMainThread) {
  const worker = new Worker(new URL(import.meta.url));
  let timer: ReturnType<typeof setTimeout> | undefined, current = "Loading Indigo";
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      console.error(`layout.check: ${current} took more than ${ms} ms`);
      void worker.terminate().then(() => process.exit(1));
    }, ms);
  };
  arm(60_000);
  worker.on("message", (m: { start?: string; done?: string; ms?: number; outcome?: string; end?: true }) => {
    if (m.start) { current = m.start; arm(BOUND); }
    if (m.done) { clearTimeout(timer); console.log(`layout.check: ${m.done}: ${m.ms} ms, ${m.outcome}`); }
    if (m.end) console.log("layout.check: no text stops the editor, and real structures lay out as before");
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
  const { parseStructure, ready } = await import("./chem.ts");
  // A second Indigo, for the layout with no cap.
  const indigo = await (await import(new URL("../node_modules/indigo-ketcher/indigo-ketcher-norender.js", import.meta.url).href)).default();
  await ready;
  const post = (m: object) => parentPort!.postMessage(m);
  const timed = (name: string, run: () => string) => {
    post({ start: name });
    const t = performance.now(), outcome = run();
    post({ done: name, ms: Math.round(performance.now() - t), outcome });
  };
  const uncapped = (smiles: string): number[][] => {
    const o = new indigo.MapStringString();
    try {
      o.set("output-content-type", "application/json");
      o.set("dearomatize-on-load", "true");
      const ket = JSON.parse(JSON.parse(indigo.layout(smiles, "ket", o)).struct);
      return (ket.root.nodes as { $ref: string }[]).flatMap(({ $ref }) => (ket[$ref]?.type === "molecule" ? ket[$ref].atoms.map((a: { location: number[] }) => a.location) : []));
    } finally {
      o.delete();
    }
  };
  // A molfile with no coordinates, as another program might paste it.
  const molfile = (smiles: string) => { const o = new indigo.MapStringString(); try { return indigo.convert(smiles, "molfile", o); } finally { o.delete(); } };
  const tryParse = (text: string) => {
    try { return `${parseStructure(text).atoms.length} atoms`; } catch (e) { return `not read (${e instanceof Error ? e.message.slice(0, 60) : e})`; }
  };

  for (const [name, smiles] of crowded) timed(name, () => tryParse(smiles));
  timed("a ring atom with five phenyls, as a molfile", () => tryParse(molfile(crowded[0][1])));
  for (const [name, text, why] of tooBig) timed(name, () => { assert.throws(() => parseStructure(text), (e) => e instanceof RangeError && why.test(e.message)); return "refused"; });
  const at = (p: number[]) => p.slice(0, 2).map((v) => v.toFixed(4));
  for (const [name, smiles] of real)
    timed(name, () => { assert.deepEqual(parseStructure(smiles).atoms.map((a) => at(a.location)), uncapped(smiles).map(at), name); return "as with no cap"; });
  post({ end: true });
}
