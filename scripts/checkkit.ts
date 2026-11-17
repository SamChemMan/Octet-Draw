// Set-up the check files (src/*.check.ts) and some scripts and tools share. It sits outside src so that the app's type
// check leaves it alone (it is for Node). Of the app it loads only render.ts, which reads no browser globals: chem.ts
// must not load before browser() has run.
import { existsSync, readFileSync } from "node:fs";
import type { Graph } from "../src/naming.ts";
import { hydrogens, type Mol } from "../src/render.ts";

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
export function browser() {
  const g = globalThis as Record<string, unknown>;
  g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
  g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
  g.window = globalThis;
  g.self = { location: { origin: "file://" } };
  g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
}

// OPSIN's TeaVM build (tools/opsin), when it is built.
export const opsinDir = new URL("../src/vendor/opsin/", import.meta.url);
export function needOpsin(skip: string) {
  if (!existsSync(new URL("opsin.js", opsinDir))) { console.log(skip); process.exit(0); }
}
// OPSIN, started, with its data pack as its resources.
export async function loadOpsin() {
  const pack = readFileSync(new URL("opsin-data.bin", opsinDir)), files = new Map<string, Int8Array>();
  for (let p = 0; ; ) {
    const n = pack.readUInt16BE(p); p += 2;
    if (!n) break;
    const name = pack.toString("latin1", p, p + n); p += n;
    const size = pack.readInt32BE(p); p += 4;
    files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
  }
  (globalThis as { opsinResource?: unknown }).opsinResource = (name: string) => files.get(name) ?? null;
  const opsin = await import(new URL("opsin.js", opsinDir).href);
  opsin.init();
  return opsin;
}

// Indigo with no renderer, straight from the package (no chem.ts).
export const norender = async () => (await import(new URL("../node_modules/indigo-ketcher/indigo-ketcher-norender.js", import.meta.url).href)).default();

// A naming graph from elements and bonds ([a, b, order]), with hydrogens filled in.
export function graph(els: string[], bonds: [number, number, number][]): Graph {
  const used = els.map(() => 0);
  for (const [a, b, o] of bonds) { used[a] += o; used[b] += o; }
  return { atoms: els.map((el, i) => ({ el, charge: 0, h: hydrogens(el, 0, used[i]) })), bonds: bonds.map(([a, b, order]) => ({ a, b, order: order as 1 | 2 | 3 })) };
}

// The namer checks: OPSIN (the check is skipped without it), Indigo, and the structures and CIP labels Indigo reads
// from SMILES.
export async function namer(check: string) {
  needOpsin(`${check}: skipped (no OPSIN build)`);
  const opsin = await loadOpsin();
  const indigo = await norender();
  const { cipLabels } = await import("../src/cip.ts");
  const convert = (s: string, f: string, dearomatize = false) => {
    const o = new indigo.MapStringString();
    if (dearomatize) o.set("dearomatize-on-load", "true");
    try { return indigo.convert(s, f, o).trim(); } finally { o.delete(); }
  };
  // The structure and its CIP labels, read from SMILES by Indigo (Kekulé bonds).
  const parsed = (smiles: string) => {
    const o = new indigo.MapStringString();
    o.set("output-content-type", "application/json");
    o.set("dearomatize-on-load", "true");
    try {
      const ket = JSON.parse(JSON.parse(indigo.calculateCip(smiles, "ket", o)).struct);
      // Several fragments (a salt): one molecule with all of them.
      const atoms: { label: string; charge?: number; cip?: string }[] = [], bonds: { type: number; atoms: [number, number]; cip?: string }[] = [];
      for (const { $ref } of ket.root.nodes) {
        const f = ket[$ref], base = atoms.length;
        if (f?.type !== "molecule") continue;
        atoms.push(...f.atoms);
        bonds.push(...f.bonds.map((b: { type: number; atoms: [number, number]; cip?: string }) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] })));
      }
      return { atoms, bonds };
    } finally { o.delete(); }
  };
  const molOf = (smiles: string): Mol => {
    const m = parsed(smiles);
    return { atoms: m.atoms.map((a) => ({ label: a.label, charge: a.charge, location: [0, 0, 0] as [number, number, number] })), bonds: m.bonds.map((b) => ({ type: b.type, atoms: b.atoms })) };
  };
  // The CIP labels Octet gives (cip.ts) the structure as Indigo lays the SMILES out (with wedges), on the atoms and bonds
  // of `parsed`. A drawn double bond always has a geometry; one the SMILES leaves open (Indigo gives it no label) has no
  // E or Z.
  const cipOf = (smiles: string) => {
    const o = new indigo.MapStringString(), p = parsed(smiles), m: Mol = { atoms: [], bonds: [] };
    o.set("output-content-type", "application/json");
    o.set("dearomatize-on-load", "true");
    try {
      const ket = JSON.parse(JSON.parse(indigo.layout(smiles, "ket", o)).struct);
      for (const { $ref } of ket.root.nodes) {
        const f = ket[$ref], base = m.atoms.length;
        if (f?.type !== "molecule") continue;
        m.atoms.push(...f.atoms.map((a: Mol["atoms"][number]) => ({ label: a.label, location: a.location, charge: a.charge, isotope: a.isotope, ...(a.radical ? { radical: a.radical === 1 ? 3 : a.radical - 1 } : {}) })));
        m.bonds.push(...f.bonds.map((b: Mol["bonds"][number]) => ({ type: b.type, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number], ...(b.stereo === 1 || b.stereo === 6 ? { stereo: b.stereo } : {}) })));
      }
    } finally { o.delete(); }
    if (m.atoms.length !== p.atoms.length || m.bonds.length !== p.bonds.length) throw new Error(`cipOf: Indigo read ${smiles} two ways`);
    const c = cipLabels(m);
    return { atoms: c.atoms, bonds: p.bonds.map((b, k) => (b.cip ? c.bonds[k] : undefined)) };
  };
  return { opsin, indigo, convert, parsed, molOf, cipOf };
}
