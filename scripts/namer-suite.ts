// Structure to Name against the CIP validation suite's r and s (Hanson, Mayfield, Vainio, Yerin, Musacchio and Redkin,
// J. Chem. Inf. Model. 2018). Each suite structure with an r or s label is named as the editor names it (checkedName,
// with Octet's reader of r and s), and each r and s the suite gives on an atom of the name's parent must be cited at
// that atom's locant. The suite has no licence, so it is not in this repository (see scripts/cip-suite.ts): the script
// skips without the file. Run: node scripts/namer-suite.ts [--list].
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { Mol } from "../src/render.ts";

const file = process.env.CIP_SUITE ?? `${homedir()}/octet-research/data/cip-validation-suite/compounds_2d.sdf`;
const dir = new URL("../src/vendor/opsin/", import.meta.url);
if (!existsSync(file) || !existsSync(new URL("opsin.js", dir))) { console.log("namer-suite: skipped (no suite file or no OPSIN build)"); process.exit(0); }
const list = process.argv.includes("--list");
const gl = globalThis as Record<string, unknown>;
gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
gl.window = globalThis;
gl.self = { location: { origin: "file://" } };
gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("../src/chem.ts");
await chem.ready;
const pack = readFileSync(new URL("opsin-data.bin", dir)), files = new Map<string, Int8Array>();
for (let p = 0; ; ) {
  const n = pack.readUInt16BE(p); p += 2;
  if (!n) break;
  const name = pack.toString("latin1", p, p + n); p += n;
  const size = pack.readInt32BE(p); p += 4;
  files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
}
gl.opsinResource = (name: string) => files.get(name) ?? null;
const opsin = await import(new URL("opsin.js", dir).href);
opsin.init();
const { attachOpsin, knownName, nameToSmiles, setPseudoReader } = await import("../src/names.ts");
attachOpsin(opsin, readFileSync(new URL("names.txt", dir), "utf8"));
const { checkedName, graphOf, namerName, setCageCheck, setNamer } = await import("../src/naming.ts");
const { iupacLocants, iupacName } = await import("../src/namer.ts");
const { pseudoReader } = await import("../src/pseudo.ts");
setNamer(iupacName);
setPseudoReader(pseudoReader({ mol: (s) => chem.parseStructure(s, false), inchi: chem.toInchi, cip: chem.cipOf, name: namerName }));
setCageCheck(chem.toInchiAux);
const inchiOf = (s: Mol | string) => { try { return chem.toInchi(typeof s === "string" ? chem.parseStructure(s, false) : s); } catch { return undefined; } };

// A V2000 record as drawn (as scripts/cip-suite.ts reads it).
function read(record: string): { id: string; mol: Mol; labels: string[] } {
  const lines = record.split("\n"), na = Number(lines[3].slice(0, 3)), nb = Number(lines[3].slice(3, 6)), mol: Mol = { atoms: [], bonds: [] };
  for (let i = 0; i < na; i++) { const l = lines[4 + i]; mol.atoms.push({ label: l.slice(31, 34).trim(), location: [Number(l.slice(0, 10)), Number(l.slice(10, 20)), Number(l.slice(20, 30))] }); }
  for (let i = 0; i < nb; i++) {
    const l = lines[4 + na + i], a = Number(l.slice(0, 3)) - 1, b = Number(l.slice(3, 6)) - 1, type = Number(l.slice(6, 9)), st = Number(l.slice(9, 12));
    mol.bonds.push({ type, atoms: [a, b], ...(type === 1 && (st === 1 || st === 6) ? { stereo: st } : {}), ...(type === 1 && st === 4 ? { display: "wavy" as const } : {}), ...(type === 2 && st === 3 ? { display: "either" as const } : {}) });
  }
  for (const l of lines) {
    const m = /^M {2}(CHG|ISO)(.*)$/.exec(l);
    if (!m) continue;
    const v = m[2].trim().split(/\s+/).map(Number);
    for (let k = 1; k + 1 < v.length; k += 2) { const a = mol.atoms[v[k] - 1]; if (m[1] === "CHG") a.charge = v[k + 1]; else a.isotope = v[k + 1]; }
  }
  const labels = (/^>\s*<CIP_LABELS>\n([^\n]*)/m.exec(record)?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
  return { id: lines[0].trim(), mol, labels };
}

let cases = 0, named = 0, cited = 0, located = 0, readBack = 0;
const wrong: string[] = [], unnamed: string[] = [];
for (const record of readFileSync(file, "utf8").split("$$$$\n").filter((r) => r.trim())) {
  const { id, mol, labels } = read(record), rs = labels.filter((x) => /^\d+[rs]$/.test(x));
  if (!rs.length) continue;
  cases++;
  let name: string | undefined;
  try { name = checkedName(mol, chem.expandLabels(mol), nameToSmiles, inchiOf, chem.cipOf, knownName); } catch { name = undefined; }
  if (!name) { unnamed.push(id); continue; }
  named++;
  if (inchiOf(nameToSmiles(name) ?? "") === inchiOf(mol)) readBack++;
  // Each suite r and s on an atom of the parent: cited at that atom's locant.
  const g = graphOf(chem.expandLabels(mol), chem.cipOf(chem.expandLabels(mol)), true), locs = g && iupacLocants(g);
  const items = new Set([...name.matchAll(/\(([^()]*)\)-/g)].flatMap((m) => m[1].split(",")));
  for (const x of rs) {
    cited++;
    const at = Number(x.slice(0, -1)) - 1, loc = locs?.[at];
    if (loc === undefined) continue;
    located++;
    if (!items.has(`${loc}${x.slice(-1)}`)) wrong.push(`${id}: ${x} is ${loc}${x.slice(-1)}, not cited in ${name}`);
  }
}
console.log(`namer-suite: ${cases} suite structures with r or s, ${named} named (${readBack} read back as drawn); ${cited} r and s cited, ${located} on the parent, ${wrong.length} at a wrong locant`);
if (list) console.log(`not named: ${unnamed.join(" ")}`);
for (const w of wrong) console.log(`WRONG ${w}`);
process.exit(wrong.length || readBack !== named ? 1 : 0);
