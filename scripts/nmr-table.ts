// Builds data/nmr/shifts.bin.gz, Octet's NMR shift table (¹H, ¹³C, ¹⁹F and ³¹P), from nmrshiftdb2's SD file of
// assigned spectra (nmrshiftdb2withsignals.sd, which is not in this repository). Only measured spectra go in: the
// spectra the file marks as predicted (in its Program and NMRProgram fields) are left out. Spectra whose solvent the
// file names (one of the Spectrum panel's) also go in that solvent's table, where their shifts differ from the
// shifts in every solvent.
// Run: node scripts/nmr-table.ts <nmrshiftdb2withsignals.sd> [--test] [--compare <old shifts.bin.gz>]
// --test builds the table from nine molecules in ten and reports how well it predicts the tenth; nothing is written.
// The tenth is chosen by the first block of the InChIKey (the skeleton), so stereoisomers and isotopomers of a held-out
// molecule are held out with it. It also reports the shifts next to peroxides (see "Peroxides" below).
// --compare reads an older table and lists the codes that differ from it: since 17 November 2026 only codes on kinds
// of atoms near an O–O may (kinds() marks the O–O); any other is named.
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { gunzipSync, gzipSync } from "node:zlib";
import { hydrogens } from "../src/render.ts";
import type { Graph } from "../src/naming.ts";
import { codeHash, codes, environment, heavy, lookup, nearPeroxide, nearShift, peroxides, quality, solventCode, standIn, unmarked, useTables, writeTables, NUCLEI, NUCLEUS_LIST, PEROXIDE_INC, type Env, type Found, type Nucleus, type Table } from "../src/nmr.ts";
import { isMetal } from "../src/metals.ts";

const args = process.argv.slice(2), file = args[0], test = args.includes("--test"), compare = args.includes("--compare") ? args[args.indexOf("--compare") + 1] : undefined;
if (!file || (args.includes("--compare") && !compare)) throw new Error("Usage: node scripts/nmr-table.ts <nmrshiftdb2withsignals.sd> [--test] [--compare <old shifts.bin.gz>]");
const started = Date.now();

type Peak = { shift: number; atom: number };
type Molecule = { id: number; key: string; graph: Graph; spectra: { nucleus: Nucleus; peaks: Peak[]; solvent?: string }[] };
// nmrshiftdb2's names for the Spectrum panel's solvents (spectrumplot.ts).
const SOLVENT: Record<string, string> = {
  "Chloroform-D1 (CDCl3)": "CDCl₃", "CDCL3,TMS": "CDCl₃", "Dimethylsulphoxide-D6 (DMSO-D6, C2D6SO)": "DMSO-d₆", "DMSO": "DMSO-d₆", "(CD3)2SO": "DMSO-d₆",
  "Methanol-D4 (CD3OD)": "CD₃OD", "Deuteriumoxide (D2O)": "D₂O", "Benzene-D6 (C6D6)": "C₆D₆", "Acetone-D6 ((CD3)2CO)": "Acetone-d₆", "Acetonitrile-D3 (CD3CN)": "CD₃CN",
};
// A solvent's codes go in its table when it has at least two shifts for them, and their median there differs from
// the median in every solvent by at least this much (ppm). The difference is shrunk towards the median in every
// solvent as n / (n + 3) for n shifts in the solvent, so a few shifts move a prediction only a little. ¹H has no
// solvent table: on the held-out tenth (18 October 2026) it made ¹H shifts in a known solvent worse (MAE 0.238 to
// 0.240 ppm, 1,730 shifts; on O, N and S 1.23 to 1.27 ppm, 67 shifts), and ¹³C better (2.118 to 2.078 ppm, 6,147).
const SOLVENT_DIFF: Record<Nucleus, number> = { "13C": 0.5, "1H": Infinity, "19F": Infinity, "31P": Infinity }, SHRINK = 3;
// ¹⁹F shifts outside this range (ppm) are slips (a wrong reference or sign) and are left out, as are shifts more than
// four median absolute deviations from their code's median (the plan for ¹⁹F and ³¹P, 4 November 2026).
const F_RANGE = [-300, 250], MADS = 4;
const CHARGE: Record<number, number> = { 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 };

// One SD record: the molfile (V2000) as a graph with hydrogen counts, and its measured ¹H and ¹³C spectra.
function read(lines: string[]): Molecule | undefined {
  const na = Number(lines[3]?.slice(0, 3)), nb = Number(lines[3]?.slice(3, 6));
  if (!(na > 0) || !(nb >= 0) || lines.length < 4 + na + nb) return undefined;
  const atoms = lines.slice(4, 4 + na).map((l) => ({ el: l.slice(31, 34).trim(), charge: CHARGE[Number(l.slice(36, 39))] ?? 0, h: 0 }));
  const bonds: Graph["bonds"] = [];
  for (const l of lines.slice(4 + na, 4 + na + nb)) {
    const a = Number(l.slice(0, 3)) - 1, b = Number(l.slice(3, 6)) - 1, type = Number(l.slice(6, 9));
    if (!(type >= 1 && type <= 3) && type !== 6) return undefined;
    bonds.push({ a, b, order: (type === 6 ? 1 : type) as 1 | 2 | 3 });
  }
  const fields = new Map<string, string>();
  let name: string | undefined;
  for (const l of lines.slice(4 + na + nb)) {
    if (l.startsWith("M  CHG")) for (let k = 0, n = Number(l.slice(6, 9)); k < n; k++) atoms[Number(l.slice(10 + 8 * k, 13 + 8 * k)) - 1].charge = Number(l.slice(14 + 8 * k, 17 + 8 * k));
    const m = /^> *<(.+)>/.exec(l);
    if (m) { name = m[1]; fields.set(name, ""); continue; }
    if (name && l.trim()) fields.set(name, fields.get(name)! + l.trim());
  }
  const used = atoms.map(() => 0);
  for (const b of bonds) { used[b.a] += b.order; used[b.b] += b.order; }
  atoms.forEach((a, i) => { a.h = hydrogens(a.el, a.charge, used[i]); });
  // Spectra a program predicted, by their number ("1:ACD/Labs … 2:HOSE code …").
  const predicted = new Set<string>();
  for (const key of ["Program", "NMRProgram"]) for (const m of (fields.get(key) ?? "").matchAll(/(\d+):(\S[^:]*?)(?=\s+\d+:|$)/g)) predicted.add(m[1]);
  // Each spectrum's solvent, by its number ("0:Chloroform-D1 (CDCl3) 1:Unreported").
  const solvents = new Map<string, string>();
  for (const m of (fields.get("Solvent") ?? "").matchAll(/(\d+):(\S[^:]*?)(?=\s+\d+:|$)/g)) if (SOLVENT[m[2].trim()]) solvents.set(m[1], SOLVENT[m[2].trim()]);
  const spectra: Molecule["spectra"] = [];
  for (const [key, value] of fields) {
    const m = /^Spectrum (1H|13C|19F|31P) (\d+)$/.exec(key);
    if (!m || predicted.has(m[2])) continue;
    const peaks = value.split("|").filter(Boolean).map((p) => { const [s, , at] = p.split(";"); return { shift: Number(s), atom: Number(at) }; })
      .filter((p) => Number.isFinite(p.shift) && Number.isInteger(p.atom) && p.atom >= 0 && p.atom < na);
    if (peaks.length) spectra.push({ nucleus: m[1] as Nucleus, peaks, solvent: solvents.get(m[2]) });
  }
  return { id: Number(fields.get("nmrshiftdb2 ID")), key: fields.get("INChI key") ?? "", graph: { atoms, bonds }, spectra };
}

// Each molecule's measured shifts as (heavy atom, shift) pairs on its heavy-atom graph: ¹³C, ¹⁹F and ³¹P on their
// own atoms; ¹H on the atom carrying the hydrogen, averaged within a spectrum.
function observations(mol: Molecule) {
  const { g, from } = heavy(mol.graph), to = new Map(from.map((old, k) => [old, k])), out: { nucleus: Nucleus; atom: number; shift: number; solvent?: string }[] = [];
  const carrier = (i: number) => (mol.graph.atoms[i].el === "H" ? mol.graph.bonds.find((b) => b.a === i || b.b === i) : undefined);
  for (const s of mol.spectra) {
    const byAtom = new Map<number, number[]>();
    for (const p of s.peaks) {
      let at = p.atom;
      if (mol.graph.atoms[at].el === "H") { if (s.nucleus !== "1H") continue; const b = carrier(at); if (!b) continue; at = b.a === at ? b.b : b.a; }
      const k = to.get(at);
      if (k === undefined || (s.nucleus === "1H" ? g.atoms[k].h === 0 : g.atoms[k].el !== NUCLEI[s.nucleus].el)) continue;
      if (s.nucleus === "19F" && (p.shift < F_RANGE[0] || p.shift > F_RANGE[1])) continue;
      byAtom.set(k, [...(byAtom.get(k) ?? []), p.shift]);
    }
    // A hydrogen-bearing atom given more different ¹H shifts in one spectrum than it has hydrogens (four on one CH) is a
    // slip in the assignment: its shifts there are left out.
    for (const [atom, shifts] of byAtom) if (s.nucleus !== "1H" || new Set(shifts).size <= g.atoms[atom].h) out.push({ nucleus: s.nucleus, atom, shift: shifts.reduce((a, b) => a + b, 0) / shifts.length, solvent: s.solvent });
  }
  return { g, out };
}

const molecules: Molecule[] = [];
let record: string[] = [];
for await (const line of createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity })) {
  if (line.startsWith("$$$$")) { const m = read(record); if (m?.spectra.length) molecules.push(m); record = []; } else record.push(line);
}
console.log(`${molecules.length} molecules with measured spectra`);

// unmarked(env) has the kinds release 1.1.2 made, with no O–O mark, so its codes are 1.1.2's. For --compare and the
// peroxide report.
// Each molecule's tenth (0 to 9): by the InChIKey's first block (else the nmrshiftdb2 ID). Tenth 0 is held out.
const tenth = (mol: Molecule) => (mol.key ? codeHash("1H", mol.key.slice(0, 14)) % 10 : mol.id % 10);

// Peroxides: every ¹H and ¹³C shift of a molecule with an O–O on a carbon bonded to it (α), on a carbon bonded to such a
// carbon (β), or on its O (OOH), with the codes it needs to be predicted three ways: 1.1.2's codes, the codes with
// the O–O in the kinds, and as Octet predicts now (¹³C with the stand-in, nearPeroxide; ¹H on an α carbon unmarked).
type Target = { id: number; fold: number; nucleus: Nucleus; atom: number; shift: number; cat: string; env: Env; old: Env; per: NonNullable<ReturnType<typeof peroxides>>; near?: ReturnType<typeof nearPeroxide>; alt: Env[] };
const targets: Target[] = [], need = new Set<number>();
const hasOO = (g: Graph) => g.bonds.some((b) => b.order === 1 && g.atoms[b.a].el === "O" && g.atoms[b.b].el === "O");
if (test) for (const mol of molecules) {
  if (!hasOO(mol.graph)) continue;
  const { g, out } = observations(mol);
  let env;
  try { env = environment(g); } catch { continue; }
  const per = peroxides(env);
  if (!per) continue;
  const inO = new Set(per.pairs.flat()), old = unmarked(env), bonded = (x: number) => env.edges[x].some((e) => inO.has(e.to));
  for (const o of out) {
    if (o.nucleus !== "1H" && o.nucleus !== "13C") continue;
    const el = g.atoms[o.atom].el, alpha = el === "C" && bonded(o.atom), beta = el === "C" && !alpha && env.edges[o.atom].some((e) => g.atoms[e.to].el === "C" && bonded(e.to));
    const cat = inO.has(o.atom) ? (o.nucleus === "1H" ? "OOH" : "") : alpha ? `α ${o.nucleus}` : beta ? `β ${o.nucleus}` : "";
    if (!cat) continue;
    const near = o.nucleus === "13C" ? nearPeroxide(env, per, o.atom) : undefined, alt = near ? near.far.map((f) => standIn(env, f)) : [];
    targets.push({ id: mol.id, fold: tenth(mol), nucleus: o.nucleus, atom: o.atom, shift: o.shift, cat, env, old, per, near, alt });
    for (const e of [env, old, ...alt]) for (const [code] of codes(e, o.atom, o.nucleus)) need.add(codeHash(o.nucleus, code));
  }
}
// The shifts behind each code the targets need, with their tenth and which codes they come from (0: the same in 1.1.2
// and now, 1: now only, 2: 1.1.2 only).
const cv = new Map<number, { s: number[]; f: number[]; t: number[] }>();
// --compare: the codes on kinds that differ between 1.1.2 and now (atoms near an O–O), with their codes in each
// solvent (whose shifts are shrunk towards the code's in every solvent, so they move with it).
const changed = new Set<number>(), solvents = [...new Set(Object.values(SOLVENT))];
const differs = (n: Nucleus, code: string) => { changed.add(codeHash(n, code)); for (const x of solvents) changed.add(codeHash(n, solventCode(x, code))); };

// The table: every level of every observed atom's code, with the shifts seen there; and in its solvent's table too,
// with the hash of the code in every solvent.
const seen = Object.fromEntries(NUCLEUS_LIST.map((n) => [n, new Map()])) as Record<Nucleus, Map<number, number[]>>;
const seenIn = Object.fromEntries(NUCLEUS_LIST.map((n) => [n, new Map()])) as Record<Nucleus, Map<number, { all: number; shifts: number[] }>>;
const held: { mol: Molecule; g: Graph; out: ReturnType<typeof observations>["out"] }[] = [];
for (const mol of molecules) {
  const { g, out } = observations(mol);
  if (!out.length) continue;
  const fold = tenth(mol), add = !(test && fold === 0);
  if (!add) held.push({ mol, g, out });
  let env;
  try { env = environment(g); } catch { continue; }
  const old = (compare || need.size) && peroxides(env) ? unmarked(env) : undefined;
  for (const o of out) {
    const now = [...codes(env, o.atom, o.nucleus)].map(([code]) => code), then = old ? new Set([...codes(old, o.atom, o.nucleus)].map(([code]) => code)) : undefined;
    const keep = (code: string, t: number) => {
      const h = codeHash(o.nucleus, code);
      if (!need.has(h)) return;
      let x = cv.get(h);
      if (!x) cv.set(h, (x = { s: [], f: [], t: [] }));
      x.s.push(o.shift); x.f.push(fold); x.t.push(t);
    };
    for (const code of now) {
      keep(code, then && !then.has(code) ? 1 : 0);
      if (then && !then.has(code)) differs(o.nucleus, code);
      if (!add) continue;
      const h = codeHash(o.nucleus, code), list = seen[o.nucleus].get(h);
      if (list) list.push(o.shift); else seen[o.nucleus].set(h, [o.shift]);
      if (!o.solvent) continue;
      const hs = codeHash(o.nucleus, solventCode(o.solvent, code)), there = seenIn[o.nucleus].get(hs);
      if (there) there.shifts.push(o.shift); else seenIn[o.nucleus].set(hs, { all: h, shifts: [o.shift] });
    }
    if (then) for (const code of then) if (!now.includes(code)) {
      keep(code, 2);
      differs(o.nucleus, code);
    }
  }
}
// A nucleus's table: each code's median, spread and count, × scale (100 for ¹H and ¹³C, 10 for ¹⁹F and ³¹P, whose
// shifts run past ±327 ppm). outliers: leave out shifts more than MADS median absolute deviations from the median.
const table = (m: Map<number, number[]>, scale = 100, outliers = false): Table => {
  const keys = [...m.keys()].sort((a, b) => a - b), t = { hash: new Uint32Array(keys), shift: new Int16Array(keys.length), sd: new Uint16Array(keys.length), n: new Uint16Array(keys.length), scale };
  const top = 32767 / scale, mid = (v: number[]) => { const h = v.length >> 1; return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2; };
  keys.forEach((k, i) => {
    let v = m.get(k)!.sort((a, b) => a - b);
    if (outliers && v.length >= 3) {
      const c = mid(v), mad = mid(v.map((x) => Math.abs(x - c)).sort((a, b) => a - b));
      if (mad > 0) v = v.filter((x) => Math.abs(x - c) <= MADS * mad);
    }
    const median = mid(v), mean = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
    t.shift[i] = Math.round(Math.max(-top, Math.min(top, median)) * scale);
    t.sd[i] = Math.round(Math.min(65535 / scale, sd) * scale);
    t.n[i] = Math.min(65535, v.length);
  });
  return t;
};
const median = (v: number[]) => { const w = [...v].sort((a, b) => a - b), mid = w.length >> 1; return w.length % 2 ? w[mid] : (w[mid - 1] + w[mid]) / 2; };
// A solvent's codes that have enough shifts there, and whose shifts there differ from those in every solvent.
const differing = (nucleus: Nucleus) => new Map([...seenIn[nucleus]].flatMap(([h, x]): [number, number[]][] => {
  const all = median(seen[nucleus].get(x.all)!), d = median(x.shifts) - all;
  if (x.shifts.length < 2 || Math.abs(d) < SOLVENT_DIFF[nucleus]) return [];
  // The shrunk shift, as many times as there were shifts (table() keeps their median and count).
  return [[h, x.shifts.map(() => all + (d * x.shifts.length) / (x.shifts.length + SHRINK))]];
}));
const tables = { "13C": table(seen["13C"]), "1H": table(seen["1H"]), "19F": table(seen["19F"], 10, true), "31P": table(seen["31P"], 10, true), solvent: { "13C": table(differing("13C")), "1H": table(differing("1H")) } };
console.log(`codes: ${NUCLEUS_LIST.map((n) => `${n} ${tables[n].hash.length}`).join(", ")}; in one solvent: ¹³C ${tables.solvent["13C"].hash.length}, ¹H ${tables.solvent["1H"].hash.length}`);

if (test) {
  useTables(tables);
  for (const nucleus of NUCLEUS_LIST) {
    const errors: number[] = [], levels = new Array(7).fill(0), rated: Record<string, number[]> = { good: [], medium: [], rough: [] };
    // Shifts measured in a known solvent, predicted from every solvent and from that solvent's table: all of them, and
    // those of hydrogens on O, N and S.
    const known = { any: [] as number[], own: [] as number[], anyX: [] as number[], ownX: [] as number[] };
    let missed = 0;
    for (const { g, out } of held) {
      let env;
      try { env = environment(g); } catch { continue; }
      for (const o of out.filter((x) => x.nucleus === nucleus)) {
        const p = lookup(env, nucleus, o.atom);
        if (!p) { missed++; continue; }
        errors.push(Math.abs(p.shift - o.shift));
        levels[p.level]++;
        const metal = nucleus !== "1H" && nucleus !== "13C" && env.edges[o.atom].some((e) => isMetal(g.atoms[e.to].el)), x = ["O", "N", "S"].includes(g.atoms[o.atom].el);
        rated[quality({ atoms: [], shift: p.shift, nuclei: 1, couplings: [], sd: p.sd, based: p.based, level: p.level, ...(metal ? { metal: true as const } : {}), ...(nucleus === "1H" && x ? { broad: true } : {}) }, nucleus)].push(Math.abs(p.shift - o.shift));
        if (!o.solvent) continue;
        const q = lookup(env, nucleus, o.atom, o.solvent)!;
        known.any.push(Math.abs(p.shift - o.shift)); known.own.push(Math.abs(q.shift - o.shift));
        if (x) { known.anyX.push(Math.abs(p.shift - o.shift)); known.ownX.push(Math.abs(q.shift - o.shift)); }
      }
    }
    errors.sort((a, b) => a - b);
    const mae = errors.reduce((a, b) => a + b, 0) / errors.length, mean = (v: number[]) => (v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(3) : "–");
    if (!errors.length) { console.log(`${nucleus}: no held-out shifts`); continue; }
    console.log(`${nucleus}: ${errors.length} shifts, MAE ${mae.toFixed(2)} ppm, median ${errors[errors.length >> 1].toFixed(2)}, 90% within ${errors[Math.floor(errors.length * 0.9)].toFixed(2)}, not covered ${missed} (coverage ${((100 * errors.length) / (errors.length + missed)).toFixed(1)}%), by level ${levels.join("/")}`);
    console.log(`  by quality: ${Object.entries(rated).map(([q, v]) => `${q} ${((100 * v.length) / errors.length).toFixed(0)}% MAE ${mean(v)}`).join(", ")}`);
    console.log(`  in a known solvent: ${known.any.length} shifts, MAE ${mean(known.any)} from every solvent, ${mean(known.own)} with the solvent's table; on O, N and S: ${known.anyX.length}, ${mean(known.anyX)} and ${mean(known.ownX)}`);
  }
  peroxideReport();
} else {
  const bytes = gzipSync(writeTables(tables), { level: 9 }), dir = new URL("../data/nmr/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL("shifts.bin.gz", dir), bytes);
  console.log(`wrote data/nmr/shifts.bin.gz, ${bytes.length} bytes (${(bytes.length / 1e6).toFixed(2)} MB)`);
  if (compare) compareWith(compare);
}
console.log(`${((Date.now() - started) / 1000).toFixed(0)} s`);

// --compare: each part of the old table against the new one, by code hash: codes gone, new and changed (shift, spread
// or count), and any of them that is not a code on kinds near an O–O.
function compareWith(path: string) {
  const parts = (bytes: Uint8Array) => {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), k = v.getUint32(8, true), out = new Map<string, Map<number, string>>();
    let at = 12 + 8 * k;
    for (let i = 0; i < k; i++) {
      const o = 12 + 8 * i, n = v.getUint32(o + 4, true), m = new Map<number, string>();
      for (let j = 0; j < n; j++) m.set(v.getUint32(at + 4 * j, true), `${v.getInt16(at + 4 * n + 2 * j, true)}/${v.getUint16(at + 6 * n + 2 * j, true)}/${v.getUint16(at + 8 * n + 2 * j, true)}`);
      out.set(`${NUCLEUS_LIST[bytes[o]]}${bytes[o + 1] ? " in one solvent" : ""}`, m);
      at += 10 * n;
    }
    return out;
  };
  const before = parts(gunzipSync(readFileSync(path))), after = parts(writeTables(tables));
  let stray = 0;
  for (const [name, b] of before) {
    const a = after.get(name) ?? new Map<number, string>();
    const gone = [...b.keys()].filter((h) => !a.has(h)), added = [...a.keys()].filter((h) => !b.has(h)), moved = [...b.keys()].filter((h) => a.has(h) && a.get(h) !== b.get(h));
    const odd = [...gone, ...added, ...moved].filter((h) => !changed.has(h));
    stray += odd.length;
    console.log(`${name}: ${b.size} codes before, ${a.size} now; ${added.length} new, ${moved.length} changed, ${gone.length} gone${odd.length ? `; ${odd.length} NOT codes on kinds near an O–O: ${odd.slice(0, 10).join(", ")}` : ""}`);
  }
  console.log(stray ? `rule 1 broken: ${stray} codes differ that are not codes on kinds near an O–O` : "rule 1 kept: every code that differs is a code on kinds near an O–O");
}

// The peroxide report (--test): 10-fold cross-validation over every molecule with an O–O, each tenth predicted from the
// shifts of the other nine, three ways: 1.1.2's codes, the codes with the O–O in the kinds (kinds()), and as predict()
// does now (nearShift): ¹³C with the stand-ins and increments from the other nine tenths, ¹H on an α carbon from the
// unmarked codes in the new table. Then the increments from every tenth, as nmr.ts has them (PEROXIDE_INC).
function peroxideReport() {
  const mid = (v: number[]) => { const w = [...v].sort((a, b) => a - b), h = w.length >> 1; return w.length % 2 ? w[h] : (w[h - 1] + w[h]) / 2; };
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  // An atom's shift from its most telling code with shifts outside its tenth: 1.1.2's table (shifts of t 0 and 2) or
  // the new one (t 0 and 1).
  const look = (env: Env, x: Target, now: boolean): Found | undefined => {
    for (const [code, level] of codes(env, x.atom, x.nucleus)) {
      const e = cv.get(codeHash(x.nucleus, code));
      if (!e) continue;
      const v = e.s.filter((_, k) => e.f[k] !== x.fold && (e.t[k] === 0 || e.t[k] === (now ? 1 : 2)));
      if (!v.length) continue;
      const m = mean(v);
      return { shift: mid(v), sd: Math.sqrt(mean(v.map((y) => (y - m) ** 2))), based: v.length, level, kinds: code.startsWith("k:"), code: "" };
    }
    return undefined;
  };
  const rows = targets.map((x) => {
    const old = look(x.old, x, false), j1 = look(x.env, x, true), alts = x.alt.map((e) => look(e, x, true));
    return { x, old, j1, alts, alt: alts.length && alts.every(Boolean) ? mean(alts.map((y) => y!.shift)) : undefined };
  });
  // The increments: medians of measured − stand-in over carbons with one O–O in reach, by class; a class with fewer
  // than 4 shifts takes the class above it. leave: the tenth to leave out (none: every tenth).
  const above = (k: string) => (/ (C|CH|CH2)$/.test(k) ? k.replace(/ \S+$/, " plain") : k.includes(" ") ? k.split(" ")[0] : undefined);
  const chain = (k: string) => { const out = [k]; for (let u = above(k); u; u = above(u)) out.push(u); return out; };
  const increments = (leave?: number) => {
    const res = rows.filter((r) => r.x.fold !== leave && r.alt !== undefined && r.x.near!.inc.length === 1).map((r) => ({ k: r.x.near!.inc[0], d: r.x.shift - r.alt! }));
    return Object.fromEntries(Object.keys(PEROXIDE_INC).map((k): [string, [number, number, number]] => {
      const ks = chain(k), pool = (u: string) => res.filter((r) => chain(r.k).includes(u)).map((r) => r.d);
      const v = pool(ks.find((u) => pool(u).length >= 4) ?? ks[ks.length - 1]), m = v.length ? mid(v) : 0;
      return [k, [m, v.length, v.length ? mid(v.map((y) => Math.abs(y - m))) : 0]];
    }));
  };
  const folds = new Map([...new Set(rows.map((r) => r.x.fold))].map((f) => [f, increments(f)]));
  const ways = rows.map((r) => {
    const { x, j1 } = r, now = j1 && nearShift(x.env, x.per, x.nucleus, x.atom, j1, (e) => look(e, x, true), new Map(), folds.get(x.fold)!);
    return { ...r, now, stood: !!now?.standIn };
  });
  console.log(`\nPeroxides: ${new Set(targets.map((x) => x.id)).size} molecules with an O–O; MAE (ppm) and median, held out by tenths: 1.1.2 / O–O in kinds / now`);
  const err = (v: (Found | undefined)[], w: typeof ways) => v.map((p, k) => (p ? Math.abs(p.shift - w[k].x.shift) : NaN)).filter(Number.isFinite);
  const line = (v: number[]) => (v.length ? `${mean(v).toFixed(2)}/${mid(v).toFixed(2)}` : "–");
  for (const cat of ["α 13C", "β 13C", "α 1H", "β 1H", "OOH"]) {
    const w = ways.filter((r) => r.x.cat === cat), s = w.filter((r) => r.stood);
    if (!w.length) continue;
    const rated = (q: string) => { const v = w.filter((r) => r.now && quality({ atoms: [], shift: r.now.shift, nuclei: 1, couplings: [], sd: r.now.sd, based: r.now.based, level: r.now.level, ...(r.stood ? { standIn: true as const } : {}), ...(cat === "OOH" ? { broad: true } : {}) }, r.x.nucleus) === q); return `${q} ${v.length} ${line(err(v.map((r) => r.now), v))}`; };
    console.log(`  ${cat}: ${w.length} shifts, ${line(err(w.map((r) => r.old), w))} / ${line(err(w.map((r) => r.j1), w))} / ${line(err(w.map((r) => r.now), w))}; from a stand-in ${s.length}, ${line(err(s.map((r) => r.old), s))} / ${line(err(s.map((r) => r.j1), s))} / ${line(err(s.map((r) => r.now), s))}; rated ${["good", "medium", "rough"].map(rated).join(", ")}`);
  }
  const all = increments();
  console.log("  increments from every tenth (shift, shifts, MAD), as PEROXIDE_INC should have them:");
  console.log(`  ${JSON.stringify(Object.fromEntries(Object.entries(all).map(([k, [d, n, m]]) => [k, [+d.toFixed(1), n, +m.toFixed(1)]])))}`);
  const off = Object.keys(all).filter((k) => all[k].some((y, i) => Math.abs(y - PEROXIDE_INC[k][i]) > (i === 1 ? 0 : 0.05)));
  console.log(off.length ? `  PEROXIDE_INC differs in ${off.join(", ")}` : "  PEROXIDE_INC matches");
}
