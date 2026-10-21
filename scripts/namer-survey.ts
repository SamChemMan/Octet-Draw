// Run: node src/namer.check.ts. Each name becomes a structure (OPSIN), Octet names the structure, and OPSIN must read
// Octet's name back as the same structure (same standard InChI). No wrong names are allowed; misses are counted.

import { existsSync, readFileSync } from "node:fs";
import { graphOf } from "../src/naming.ts";
import { iupacName, iupacNameWhy } from "../src/namer.ts";
import type { Mol } from "../src/render.ts";

const dir = new URL("../src/vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("namer.check: skipped (no OPSIN build)"); process.exit(0); }
const pack = readFileSync(new URL("opsin-data.bin", dir));
const files = new Map<string, Int8Array>();
for (let p = 0; ; ) {
  const n = pack.readUInt16BE(p); p += 2;
  if (!n) break;
  const name = pack.toString("latin1", p, p + n); p += n;
  const size = pack.readInt32BE(p); p += 4;
  files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
}
(globalThis as { opsinResource?: unknown }).opsinResource = (name: string) => files.get(name) ?? null;
const opsin = await import(new URL("opsin.js", dir).href);
opsin.init();
const indigo = await (await import(new URL("../node_modules/indigo-ketcher/indigo-ketcher-norender.js", import.meta.url).href)).default();
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
const cipOf = (smiles: string) => { const m = parsed(smiles); return { atoms: m.atoms.map((a) => a.cip), bonds: m.bonds.map((b) => b.cip) }; };


// The gap survey (not a check): every name OPSIN knows by name (names.txt), Octet's reagent names (common.ts) and
// drug names (drugs.ts), drawn from OPSIN's SMILES, then named by Octet and read back. Prints the reasons Octet
// gives no name, largest first, and every name that reads back as a different structure.
// Run: node scripts/namer-survey.ts [limit]
import { COMMON } from "../src/common.ts";
import { DRUGS } from "../src/drugs.ts";
void iupacName;
const corpus = process.argv[2] === "corpus";
const limit = corpus ? Infinity : Number(process.argv[2] ?? Infinity);
const inputs: string[] = [...new Set([
  ...readFileSync(new URL("names.txt", dir), "utf8").split("\n").map((s) => s.trim()).filter(Boolean),
  ...Object.values(COMMON).filter((v) => !v.startsWith("smiles:")),
  ...Object.keys(DRUGS),
])].slice(0, limit);
// "corpus": the structures in Sam's ChemDraw files (~/octet-research/corpus/sam), read by Indigo, one per fragment.
if (corpus) {
  const { readdirSync } = await import("node:fs");
  const { homedir } = await import("node:os");
  // chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
  const gl = globalThis as Record<string, unknown>;
  gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
  gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
  gl.window = globalThis;
  gl.self = { location: { origin: "file://" } };
  gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
  const chem = await import("../src/chem.ts");
  const { fromCdxml } = await import("../src/cdxml.ts");
  const { fragments, subset } = await import("../src/edit.ts");
  await chem.ready;
  const folder = `${homedir()}/octet-research/corpus/sam`;
  const found = new Set<string>();
  for (const f of readdirSync(folder).filter((f) => f.endsWith(".cdxml"))) {
    let m: Mol;
    try { m = fromCdxml(readFileSync(`${folder}/${f}`, "utf8")).mol; } catch { continue; }
    for (const g of fragments(m)) {
      if (g.length < 3) continue;
      try {
        const smiles = chem.toSmiles(chem.expandLabels(subset(m, new Set(g)))).split(" ")[0];
        if (smiles && !smiles.includes("*") && !smiles.includes(".")) found.add(smiles);
      } catch { /* a part Indigo cannot read */ }
    }
  }
  inputs.length = 0;
  inputs.push(...[...found].map((x) => `smiles:${x}`));
}
const why = new Map<string, string[]>(), wrong: string[] = [];
let tried = 0, named = 0;
for (const input of inputs) {
  let smiles: string | null = null;
  try { smiles = input.startsWith("smiles:") ? input.slice(7) : opsin.parseToSmiles(input); } catch { smiles = null; }
  if (!smiles || smiles.includes("*")) continue;
  let g;
  try { g = graphOf(molOf(smiles), cipOf(smiles)); } catch { continue; }
  if (!g) continue;
  tried++;
  const r = iupacNameWhy(g);
  if (!r.name) { const k = r.why ?? "?"; why.set(k, [...(why.get(k) ?? []), input]); continue; }
  let back: string | null = null;
  try { back = opsin.parseToSmiles(r.name); } catch { back = null; }
  if (back && convert(back, "inchi") === convert(smiles, "inchi")) named++;
  else wrong.push(`${input} -> ${r.name}`);
}
console.log(`survey: ${tried} structures, ${named} named right (${(100 * named / tried).toFixed(1)}%), ${wrong.length} wrong, ${tried - named - wrong.length} unnamed`);
for (const [k, v] of [...why].sort((a, b) => b[1].length - a[1].length)) console.log(`${String(v.length).padStart(5)}  ${k}: ${v.slice(0, 6).join("; ")}`);
if (wrong.length) console.log(`WRONG (${wrong.length}): ${wrong.slice(0, 40).join("; ")}`);
