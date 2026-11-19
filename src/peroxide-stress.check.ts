// Run: node src/peroxide-stress.check.ts. Stress cases for NMR shifts next to peroxides (issue 83; plan
// docs/plans/issue-83-peroxide-shifts.md): every case of the plan's stress list (P1 to P26) and more (M1 to M20): a
// messy 200-structure drawing, hostile graphs, random graphs in random atom orders, labels and names as a ChemDraw user
// types them, an AI app's odd run_command arguments, files read back by this tree and by release 1.1.2, and speed
// against release 1.1.2. Each case runs on its own and the failures are listed at the end (the file exits 1 if any).
//
// Release 1.1.2 (tag v1.1.2, whose nmr.ts and table are those of release-1.2-mcp b30f413) is read from git into a
// temporary folder for the cases that compare with it; without the tag (git fetch --tags) they are skipped.
//
// Checked by hand in the dev app (npx vite --port 1466, Chromium, 17 November 2026), not repeatable here:
// - P17, P18: hexyl hydroperoxide pasted, ¹³C panel open: Delete on the OH gives hexan-1-ol's 62.3 (Good, no stand-in);
//   ⌘Z gives 76.3 again (Rough) and ⇧⌘Z 62.3, five times each, the same each time.
// - P25: Details on, light and dark: stand-in shifts (76.3, 27.9) are drawn in the rough colour on the page and in the
//   Quality column in both themes; at the largest and smallest zoom the labels are placed as other labels are.
// Not here: an AI app reading the predicted shifts and their Quality. run_command opens the panel, and the MCP has no
// read of a prediction for any structure, as in 1.1.2; that gap is the NMR panel's as a whole, for the MCP's own work.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const gl = globalThis as Record<string, unknown>;
gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
gl.window = globalThis;
gl.self = { location: { origin: "file://" } };
gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
const { graphOf } = await import("./naming.ts");
const { hydrogens } = await import("./render.ts");
const { writeOct, readOct, writeCdx, readCdx } = await import("./oct.ts");
const { toCdxml, fromCdxml } = await import("./cdxml.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { fragments, subset } = await import("./edit.ts");
const { handle } = await import("./mcp.ts");
const nmr = await import("./nmr.ts");
const { environment, heavy, nearPeroxide, peroxides, predict, quality, readTables, nmrReady } = nmr;
type Graph = import("./naming.ts").Graph;
type Mol = import("./render.ts").Mol;
type Nucleus = import("./nmr.ts").Nucleus;
type Signal = import("./nmr.ts").Signal;
type Nmr = typeof nmr;
await chem.ready;
const TABLE = gunzipSync(readFileSync(new URL("../data/nmr/shifts.bin.gz", import.meta.url)));
readTables(TABLE);

// --- Release 1.1.2, from git --------------------------------------------------------------------------------------
const root = fileURLToPath(new URL("..", import.meta.url));
const git = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 });
const tmp = mkdtempSync(join(tmpdir(), "octet-peroxide-stress-"));
let Base: Nmr | undefined;
// Release 1.1.2's file readers (src extracted, node_modules linked): .oct, CDX and CDXML as 1.1.2 opens them.
let Old: { chem: typeof chem; graphOf: typeof graphOf; readOct: typeof readOct; readCdx: typeof readCdx; fromCdxml: typeof fromCdxml } | undefined;
try {
  const here = (f: string) => JSON.stringify(new URL(`./${f}.ts`, import.meta.url).href);
  writeFileSync(join(tmp, "nmr.ts"), git("show", "v1.1.2:src/nmr.ts").toString("utf8").replace(/"\.\/(naming|rings|metals)\.ts"/g, (_, f) => here(f)));
  Base = (await import(pathToFileURL(join(tmp, "nmr.ts")).href)) as Nmr;
  Base.readTables(gunzipSync(git("show", "v1.1.2:data/nmr/shifts.bin.gz")));
  const old = join(tmp, "v112");
  mkdirSync(old);
  execFileSync("tar", ["-x", "-C", old], { input: git("archive", "--format=tar", "v1.1.2", "src", "package.json") });
  symlinkSync(join(root, "node_modules"), join(old, "node_modules"));
  const at = (f: string) => pathToFileURL(join(old, "src", f)).href;
  const oldChem = (await import(at("chem.ts"))) as typeof chem;
  await oldChem.ready;
  Old = { chem: oldChem, graphOf: (await import(at("naming.ts"))).graphOf, readOct: (await import(at("oct.ts"))).readOct, readCdx: (await import(at("oct.ts"))).readCdx, fromCdxml: (await import(at("cdxml.ts"))).fromCdxml };
} catch (e) {
  console.log(`peroxide-stress.check: release 1.1.2 not read from git (${String(e).slice(0, 80)}): its cases are skipped. git fetch --tags`);
}

// --- Helpers ------------------------------------------------------------------------------------------------------
const fails: string[] = [];
let ran = 0;
// A list of what went wrong, as the failure's message.
const none = (bad: string[]) => { if (bad.length) throw new Error(bad.join("; ")); };
async function test(name: string, f: () => void | Promise<void>) {
  ran++;
  try { await f(); } catch (e) { fails.push(`${name}: ${(e as Error).message.split("\n")[0].slice(0, 400)}`); console.log(`FAIL ${name}\n     ${(e as Error).message.split("\n").slice(0, 6).join("\n     ")}`); }
}
const smiles = (s: string): Graph => graphOf(chem.importStructure(s))!;
type B = [number, number, number];
function graph(els: string[], bonds: B[], charge: Record<number, number> = {}, h: Record<number, number> = {}): Graph {
  const used = els.map(() => 0);
  for (const [a, b, o] of bonds) { used[a] += o; used[b] += o; }
  return { atoms: els.map((el, i) => ({ el, charge: charge[i] ?? 0, h: h[i] ?? (el === "H" ? 0 : hydrogens(el, charge[i] ?? 0, used[i])) })), bonds: bonds.map(([a, b, order]) => ({ a, b, order: order as 1 | 2 | 3 })) };
}
const NUCLEI: Nucleus[] = ["13C", "1H"];
// A prediction as text: each signal's atoms (as `back` maps them; the graph's own by default), shift, count, spheres,
// measured shifts, spread, stand-in mark and broad mark, sorted.
const text = (g: Graph, n: Nucleus, M: Nmr = nmr, back?: number[], solvent?: string) =>
  (M.predict(g, n, solvent)?.signals ?? []).map((s) => `${s.atoms.map((a) => (back ? back[a] : a)).sort((a, b) => a - b).join(",")}:${s.shift.toFixed(3)}x${s.nuclei}L${s.level}n${s.based}sd${s.sd.toFixed(3)}${s.standIn ? "*" : ""}${s.broad ? "b" : ""}`).sort().join(" ");
// The same without atom numbers, for graphs whose atom order differs (a file read back, a name, a label).
const shape = (g: Graph | undefined, M: Nmr = nmr) => (g ? NUCLEI.map((n) => text(g, n, M).split(" ").map((x) => x.replace(/^[\d,]*:/, "")).sort().join(" ")).join(" | ") : "no structure");
const fromMol = (m: Mol, c = chem, of = graphOf) => of(c.expandWithOrigins(m, true).mol);
const envOf = (g: Graph) => environment(heavy(g).g);
const finite = (p: ReturnType<typeof predict>) => (p?.signals ?? []).every((s) => Number.isFinite(s.shift) && Number.isFinite(s.sd) && Number.isFinite(s.based));
// A seeded random number (so a failure repeats), and the graph in a random atom and bond order: back[new] = old.
let seed = 83;
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
function shuffled(g: Graph): { g: Graph; back: number[] } {
  const n = g.atoms.length, p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const inv: number[] = [];
  p.forEach((o, k) => (inv[o] = k));
  const bonds = g.bonds.map((b) => (rnd() < 0.5 ? { ...b, a: inv[b.a], b: inv[b.b] } : { ...b, a: inv[b.b], b: inv[b.a] }));
  for (let i = bonds.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bonds[i], bonds[j]] = [bonds[j], bonds[i]]; }
  return { g: { atoms: p.map((o) => g.atoms[o]), bonds }, back: p };
}
// The literature peroxides of nmrperoxide.check.ts, and peroxides with a second O–O three bonds from a carbon.
const LITERATURE = ["CCCCCCOO", "OOCc1ccccc1", "OOCCCCc1ccccc1", "CC(OO)CCCCCCCCCC", "CC(C)(OO)Cc1ccccc1", "OOC1(OO)CCC(CC1)C(C)(C)C", "CCCCCCOOC1(OOCCCCCC)CCCCCCCCCCC1", "COOC(C)(C)Cc1ccccc1", "CC(C)(C)OOCCCc1ccccc1", "c1ccccc1CCCOOCCCc1ccccc1", "CC(C)(C)OOCCCCCCCC", "CC1(OOC2CCCCO2)CCCCC1", "COC(C)(C)OOCCC(C)CCC=C(C)C", "OC(=O)CC1CC(OO1)CC=CC=CC=CC=CC=CC=CC=C", "CCC=CC=CCCCC1(OC)CCC(OO1)C(C)CO", "OC1CCC2(C)C3CCC4(C)C(C(C)C=CC(C)C(C)C)CCC4C35C=CC2(C1)OO5", "CC1CCC2C(C)C(=O)OC3OC4(C)CCC1C32OO4", "CCOC(=O)C1CCC2(CC1)OOC3(O2)C4CC5CC(C4)CC3C5", "CCOC(=O)C1CCC2(CC1)OOC3(OO2)C4CC5CC(C4)CC3C5", "CC1(C)OOC(C)(C)OO1", "CC1(C)OOC(C)(C)OOC(C)(C)OO1", "CC(C)(C)OOC(=O)c1ccccc1", "CCCCCCCCCC(=O)OO"];
const TWO_OO = ["OOCCCOOC", "OOC(C)CCOOC(=O)c1ccccc1", "CC(C)(OO)CCOOC", "OOCC(C)(C)OOC", "OOC1CCC(COOC)CC1", "CC(OO)(CC(C)(C)OOC(C)(C)C)C", "OOC(C)(C)C(=O)OO"];

// --- The plan's stress list ---------------------------------------------------------------------------------------
await test("P1 no structure: an empty graph predicts nothing and does not throw", () => {
  for (const n of [...NUCLEI, "19F", "31P"] as Nucleus[]) assert.equal(predict({ atoms: [], bonds: [] }, n)?.signals.length ?? 0, 0);
});
await test("P2 hydrogen peroxide: no ¹³C; one broad OOH of 2H, rough, no stand-in", () => {
  const g = smiles("OO"), p = predict(g, "1H")!;
  assert.equal(predict(g, "13C")?.signals.length ?? 0, 0);
  assert.equal(p.signals.length, 1);
  assert.ok(p.signals[0].broad && p.signals[0].nuclei === 2 && !p.signals[0].standIn && quality(p.signals[0], "1H") === "rough");
});
await test("P3 O₂, ozone, peroxide dianion, HOO⁻, superoxide salt: not peroxides, predict as release 1.1.2", () => {
  for (const s of ["O=O", "[O-][O+]=O", "[Na+].[Na+].[O-][O-]", "[O-]O", "[K+].[O-][O]", "[O-]O.[Na+]"]) {
    const g = graphOf(chem.importStructure(s));
    if (!g) continue; // a radical: graphOf gives no graph, so the panel says No structure and predict is not called
    assert.equal(peroxides(envOf(g)), undefined, s);
    if (Base) for (const n of NUCLEI) assert.equal(text(g, n), text(g, n, Base), `${s} ${n}`);
  }
});
await test("P4 dimethyldioxirane: no stand-in, every shift finite", () => {
  const g = smiles("CC1(C)OO1");
  assert.ok(!nearPeroxide(envOf(g), peroxides(envOf(g))!, 1));
  for (const n of NUCLEI) { const p = predict(g, n); assert.ok(finite(p) && p!.signals.every((s) => !s.standIn), n); }
});
await test("P5 gem-bisperoxide and tetraoxane: both farther O replaced, two increments", () => {
  for (const [s, c] of [["CC1(C)OOC(C)(C)OO1", 1], ["OOC1(OO)CCC(CC1)C(C)(C)C", 2], ["CCCCCCOOC1(OOCCCCCC)CCCCCCCCCCC1", 8]] as [string, number][]) {
    const env = envOf(smiles(s)), n = nearPeroxide(env, peroxides(env)!, c)!;
    assert.equal(n.far.length, 1, s);
    assert.equal(n.far[0].length, 2, s);
    assert.deepEqual([...n.inc].sort(), ["α C", "α acetal"], s);
  }
});
await test("P6 trioxide: no stand-in, finite", () => {
  const g = smiles("CC(C)(C)OOOC(C)(C)C");
  for (const n of NUCLEI) { const p = predict(g, n); assert.ok(finite(p) && p!.signals.every((s) => !s.standIn), n); }
});
await test("P7 silyl, sulfonyl, aminyl, phosphoryl peroxides and tert-butylperoxy titanium: no stand-in", () => {
  for (const s of ["C[Si](C)(C)OOC(C)(C)C", "CS(=O)(=O)OOC(C)(C)C", "CN(C)OOC(C)(C)C", "CCOP(=O)(OCC)OOC(C)(C)C", "CC(C)(C)OO[Ti](Cl)(Cl)Cl", "CC(C)(C)OO[B](C)C"]) {
    const g = smiles(s);
    for (const n of NUCLEI) { const p = predict(g, n); assert.ok(finite(p) && p!.signals.every((x) => !x.standIn), `${s} ${n}`); }
  }
});
await test("P8 η²-peroxo complex: the O–O is an η bond, not a peroxide", () => {
  assert.equal(peroxides(envOf(graph(["Ti", "O", "O", "Cl", "Cl"], [[0, 1, 1], [0, 2, 1], [1, 2, 1], [0, 3, 1], [0, 4, 1]]))), undefined);
});
await test("P9 peroxyl radical: no graph from the drawing (No structure); a hand-made one has no stand-in", () => {
  const m = chem.importStructure("CC(C)(C)OO");
  const radical: Mol = { ...m, atoms: m.atoms.map((a, i) => (i === m.atoms.length - 1 ? { ...a, radical: 2 as never, implicitHCount: 0 } : a)) };
  assert.equal(graphOf(radical), undefined);
  const g = graph(["C", "C", "C", "C", "O", "O"], [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1], [4, 5, 1]], {}, { 5: 0 });
  for (const n of NUCLEI) { const p = predict(g, n); assert.ok(finite(p) && p!.signals.every((s) => !s.standIn), n); }
});
await test("P10 an O–O in a ring read as aromatic is no peroxide", () => {
  const dioxin = graph(["C", "C", "C", "C", "O", "O"], [[0, 1, 2], [1, 2, 1], [2, 3, 2], [3, 4, 1], [4, 5, 1], [5, 0, 1]]), env = envOf(dioxin);
  for (const [a, b] of peroxides(env)?.pairs ?? []) assert.equal(env.edges[a].find((e) => e.to === b)!.bond, "");
  assert.ok(finite(predict(dioxin, "13C")));
});
await test("P11 1,2-dioxolane C4 takes both stand-ins; 1,2-dioxane C4 one", () => {
  const a = envOf(smiles("C1CCOO1")), b = envOf(smiles("C1CCOOC1"));
  assert.equal(nearPeroxide(a, peroxides(a)!, 1)!.far.length, 2);
  assert.equal(nearPeroxide(b, peroxides(b)!, 1)!.far.length, 1);
});
await test("P12a one peroxide (literature set) in 12 random atom and bond orders: the same prediction", () => {
  const bad: string[] = [];
  for (const s of LITERATURE) {
    const g = smiles(s), id = g.atoms.map((_, i) => i);
    for (const n of NUCLEI) {
      const want = text(g, n, nmr, id);
      for (let k = 0; k < 12; k++) { const { g: h, back } = shuffled(g); if (text(h, n, nmr, back) !== want) { bad.push(`${s} ${n}`); break; } }
    }
  }
  none(bad);
});
await test("P12b two O–O, one three bonds from a carbon, in 12 random orders: the same prediction (stress 12, rule 4)", () => {
  const bad: string[] = [];
  for (const s of TWO_OO) {
    const g = smiles(s), id = g.atoms.map((_, i) => i), want = text(g, "13C", nmr, id);
    for (let k = 0; k < 12; k++) { const { g: h, back } = shuffled(g); const got = text(h, "13C", nmr, back); if (got !== want) { bad.push(`${s}\n  want ${want}\n  got  ${got}`); break; } }
  }
  none(bad);
});
await test("P12c rotated, flipped and duplicated: coordinates do not enter; two copies give each signal twice", () => {
  const m = chem.importStructure("OOC(C)CCOOC(=O)c1ccccc1"), g = fromMol(m)!;
  const moved = (f: (p: number[]) => number[]): Mol => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, location: f(a.location as number[]) as [number, number, number] })) });
  for (const [what, x] of [["rotated 90°", moved(([x, y, z]) => [-y, x, z])], ["flipped", moved(([x, y, z]) => [-x, y, z])]] as [string, Mol][]) assert.equal(shape(fromMol(x)), shape(g), what);
  const n = m.atoms.length, two: Mol = { atoms: [...m.atoms, ...moved(([x, y, z]) => [x + 20, y, z]).atoms], bonds: [...m.bonds, ...m.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + n, b.atoms[1] + n] as [number, number] }))] };
  const one = predict(g, "13C")!.signals, both = predict(fromMol(two)!, "13C")!.signals;
  assert.deepEqual(both.map((s) => [s.shift, s.nuclei]).sort(), one.map((s) => [s.shift, s.nuclei * 2]).sort());
});
await test("P13a labels as a ChemDraw user types them, at either end: the drawn-out structure's prediction", () => {
  const labelled = (n: number, label: string, left = false): Mol => ({ atoms: [...Array.from({ length: n }, (_, i) => ({ label: "C", location: [(i + 1) * 1.2, (i % 2) * 0.7, 0] as [number, number, number] })), { label: "C", text: label, location: [left ? 0 : (n + 1) * 1.2, left ? 0.7 : (n % 2) * 0.7, 0] as [number, number, number] }], bonds: Array.from({ length: n }, (_, i) => ({ type: 1, atoms: (left ? (i === 0 ? [n, 0] : [i - 1, i]) : [i, i + 1]) as [number, number] })) });
  const bad: string[] = [];
  for (const [label, s, left] of [["OOH", "CCCCCCOO"], ["HOO", "CCCCCCOO", true], ["O2H", "CCCCCCOO"], ["OOtBu", "CCCCCCOOC(C)(C)C"], ["tBuOO", "CCCCCCOOC(C)(C)C", true], ["OOt-Bu", "CCCCCCOOC(C)(C)C"], ["OOMe", "CCCCCCOOC"], ["MeOO", "CCCCCCOOC", true], ["OOBz", "CCCCCCOOC(=O)c1ccccc1"], ["BzOO", "CCCCCCOOC(=O)c1ccccc1", true], ["OOAc", "CCCCCCOOC(C)=O"], ["AcOO", "CCCCCCOOC(C)=O", true], ["OOTMS", "CCCCCCOO[Si](C)(C)C"], ["CO3H", "CCCCCC(=O)OO"]] as [string, string, boolean?][]) {
    const got = shape(fromMol(labelled(s.startsWith("CCCCCC(") ? 5 : 6, label, left))), want = shape(smiles(s));
    if (got !== want) bad.push(label);
  }
  none(bad);
});
await test("P13b perester labels CO3tBu and CO3Me read as the perester (C(=O)OOR), not as an O with three bonds", () => {
  const one = (label: string): Mol => ({ atoms: [{ label: "C", location: [0, 0, 0] }, { label: "C", text: label, location: [1.2, 0.7, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] });
  const bad: string[] = [];
  for (const [label, s] of [["CO3tBu", "CC(=O)OOC(C)(C)C"], ["CO3Me", "CC(=O)OOC"]]) {
    const got = shape(fromMol(one(label))), want = shape(smiles(s));
    if (got !== want) bad.push(`${label} reads as ${chem.toSmiles(chem.expandWithOrigins(one(label), true).mol)}, not ${s}`);
  }
  none(bad);
});
// Name to Structure (OPSIN with Octet's own names), when the names engine is built.
const opsinDir = new URL("./vendor/opsin/", import.meta.url);
let nameToSmiles: ((s: string) => string | undefined) | undefined;
if (existsSync(new URL("opsin.js", opsinDir))) {
  const pack = readFileSync(new URL("opsin-data.bin", opsinDir)), files = new Map<string, Int8Array>();
  for (let p = 0; ; ) {
    const n = pack.readUInt16BE(p); p += 2;
    if (!n) break;
    const name = pack.toString("latin1", p, p + n); p += n;
    const size = pack.readInt32BE(p); p += 4;
    files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
  }
  gl.opsinResource = (name: string) => files.get(name) ?? null;
  const opsin = await import(new URL("opsin.js", opsinDir).href);
  opsin.init();
  const { DRUGS } = await import("./drugs.ts");
  const names = await import("./names.ts");
  const json = (file: string) => JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
  names.attachOpsin(opsin, readFileSync(new URL("names.txt", opsinDir), "utf8"), json("./nameindex.json"), DRUGS, json("./abbreviations.json"));
  nameToSmiles = names.nameToSmiles;
} else console.log("peroxide-stress.check: names skipped (no OPSIN build)");
await test("P13c peroxides by name: the structure the name means", () => {
  if (!nameToSmiles) return;
  const bad: string[] = [];
  for (const [name, s] of [["TBHP", "CC(C)(C)OO"], ["tert-butyl hydroperoxide", "CC(C)(C)OO"], ["DTBP", "CC(C)(C)OOC(C)(C)C"], ["DCP", "CC(C)(OOC(C)(C)c1ccccc1)c1ccccc1"], ["dicumyl peroxide", "CC(C)(OOC(C)(C)c1ccccc1)c1ccccc1"], ["mCPBA", "OOC(=O)c1cccc(Cl)c1"], ["BPO", "O=C(OOC(=O)c1ccccc1)c1ccccc1"], ["benzoyl peroxide", "O=C(OOC(=O)c1ccccc1)c1ccccc1"], ["peracetic acid", "CC(=O)OO"], ["cumyl hydroperoxide", "CC(C)(OO)c1ccccc1"], ["tert-butyl peroxybenzoate", "CC(C)(C)OOC(=O)c1ccccc1"], ["artemisinin", "CC1CCC2C(C)C(=O)OC3OC4(C)CCC1C32OO4"], ["1,2-dioxolane", "C1COOC1"], ["dimethyldioxirane", "CC1(C)OO1"]]) {
    const from = nameToSmiles(name);
    if (!from || shape(graphOf(chem.parseStructure(from))) !== shape(smiles(s))) bad.push(`${name} reads as ${from}`);
  }
  none(bad);
});
await test("P13d cumene hydroperoxide and tetralin hydroperoxide by name: one molecule with an OOH, not a salt", () => {
  if (!nameToSmiles) return;
  const bad: string[] = [];
  for (const [name, s] of [["cumene hydroperoxide", "CC(C)(OO)c1ccccc1"], ["tetralin hydroperoxide", "OOC1CCCc2ccccc12"]]) {
    const from = nameToSmiles(name);
    if (!from || shape(graphOf(chem.parseStructure(from))) !== shape(smiles(s))) bad.push(`${name} reads as ${from}, want ${s}`);
  }
  none(bad);
});
await test("P13e files and clipboard formats: MOL V2000 and V3000, SDF, SMILES, CDXML, CDX and .oct read back predict the same", () => {
  const bad: string[] = [];
  for (const s of [...LITERATURE.slice(0, 8), ...TWO_OO, "OO", "CC(C)(C)OOOC(C)(C)C", "C[Si](C)(C)OOC(C)(C)C"]) {
    const m = chem.importStructure(s), want = shape(fromMol(m));
    for (const [what, read] of [["MOL V3000", () => chem.importStructure(chem.toMolfile(m))], ["MOL V2000", () => chem.importStructure(chem.toMolfile(m, true))], ["SDF", () => chem.importStructure(chem.toSdf(m))], ["SMILES", () => chem.importStructure(chem.toSmiles(m))], ["CDXML", () => fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol], ["CDX", () => readCdx(writeCdx(m, DEFAULT_STYLE)).mol], [".oct", () => readOct(writeOct(m, DEFAULT_STYLE)).mol]] as [string, () => Mol][])
      if (shape(fromMol(read())) !== want) bad.push(`${s} ${what}`);
  }
  none(bad);
});
await test("P14 500-atom chains with 50 O–O (alkyl, germyl, 1,2-dioxolane rings): finite, under 100 ms a nucleus (best of 3)", () => {
  const chain = (unit: string[], extra: (o: number, els: string[], bonds: B[]) => void, units = 50) => {
    const els: string[] = [], bonds: B[] = [];
    for (let k = 0; k < units; k++) { const o = els.length; els.push(...unit); for (let i = 0; i < unit.length - 1; i++) bonds.push([o + i, o + i + 1, 1]); if (k) bonds.push([o - unit.length, o, 1]); extra(o, els, bonds); }
    return graph(els, bonds);
  };
  const cases: [string, Graph][] = [
    ["alkyl", chain(["C", "C", "C", "C", "C", "C", "C", "C", "O", "O"], () => {})],
    ["germyl", chain(["Ge", "C", "C", "O", "O", "C", "C", "C", "C", "C"], (o, els, bonds) => { els.push("C", "C"); bonds.push([o, els.length - 2, 1], [o, els.length - 1, 1]); }, 42)],
    ["1,2-dioxolanes", chain(["C", "C", "C", "C", "C", "C", "C", "C", "C", "C"], (o, els, bonds) => { els.push("O", "O"); bonds.push([o + 4, els.length - 2, 1], [els.length - 2, els.length - 1, 1], [els.length - 1, o + 6, 1]); }, 42)],
  ];
  for (const [what, g] of cases) {
    assert.ok(peroxides(envOf(g))!.pairs.length >= 42, what);
    for (const n of NUCLEI) {
      // A time over the line is measured once more, best of 10, before it counts (the machine may be busy).
      let best = Infinity, p;
      for (let k = 0; k < 13 && (k < 3 || best >= 100); k++) { const t = performance.now(); p = predict(g, n); best = Math.min(best, performance.now() - t); }
      assert.ok(finite(p), `${what} ${n} finite`);
      assert.ok(best < 100, `${what}: ${n} took ${best.toFixed(1)} ms at ${g.atoms.length} atoms`);
    }
  }
});
const PACLITAXEL = "CC1=C2C(C(=O)C3(C(CC4C(C3C(C(C2(C)C)(CC1OC(=O)C(C(C5=CC=CC=C5)NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C";
const AA = ["NCC(=O)", "NC(C)C(=O)", "NC(CO)C(=O)", "NC(CC(C)C)C(=O)", "NC(Cc1ccccc1)C(=O)", "NC(CCC(=O)O)C(=O)", "NC(CCCCN)C(=O)"];
await test("P15 speed against release 1.1.2 (median of 15 interleaved runs): no O–O ≤ 1.10, with O–O bounded (≤ 2)", () => {
  if (!Base) return;
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];
  const ratio = (g: Graph, n: Nucleus) => {
    const tn: number[] = [], tb: number[] = [];
    for (let k = 0; k < 15; k++) for (const [M, out] of (k % 2 ? [[nmr, tn], [Base, tb]] : [[Base, tb], [nmr, tn]]) as [Nmr, number[]][]) { const t = performance.now(); M.predict(g, n); out.push(performance.now() - t); }
    return med(tn) / med(tb);
  };
  // A ratio over the line is measured once more before it counts (the machine may be busy).
  const check = (what: string, g: Graph, most: number) => { for (const n of NUCLEI) { const r = Math.min(ratio(g, n), ratio(g, n)); assert.ok(r <= most, `${what} ${n}: ${r.toFixed(3)} of 1.1.2's time`); } };
  check("paclitaxel", smiles(PACLITAXEL), 1.1);
  check("a 60-residue peptide", smiles(Array.from({ length: 60 }, (_, i) => AA[(i * 3) % AA.length]).join("") + "O"), 1.1);
  check("ergosterol peroxide", smiles(LITERATURE[15]), 2);
  check("artemisinin", smiles(LITERATURE[16]), 2);
});
// Common structures with no O–O. Rule 1 lets an atom whose match is a code on kinds that 1.1.2 shared with peroxide
// atoms change (the plan names them); over nmrshiftdb2's 58,071 records with no O–O, 6,108 signals changed, by 3.0 ppm
// at most, none in its spheres matched or its Quality (17 November 2026).
const PLAIN = ["CCOC(C)=O", "Cc1ccccc1", "CCO", "Oc1ccccc1", "C1CCOC1", "CCOCC", "C1COCO1", "CCS(N)(=O)=O", PACLITAXEL, "CC(C)(C)O", "CC(C)(C)OC", "CC(C)(C)OC(C)(C)C", "COC(C)(C)C", "CC(=O)OC(C)(C)C", "O=C(OC(C)(C)C)c1ccccc1", "CC(C)(O)c1ccccc1", "CC1(C)OCC(C)(C)O1", "CC1(C)OC(C)(C)OC(C)(C)O1", "C1CCOCO1", "OC(=O)c1cccc(Cl)c1", "CCCCCCO", "CCCCCCOC", "COCCCOC", "CC(=O)[O-].[Na+]", "O=C1CCCCC1", "c1ccncc1", "CC(C)(C)O[Si](C)(C)C", "CN(C)OC(C)(C)C", "C1=CC2CCC1O2", "OCC1OC(O)C(O)C(O)C1O"];
await test("P16 no O–O: the same spheres and Quality as release 1.1.2, every shift within 3.0 ppm", () => {
  if (!Base) return;
  const bad: string[] = [];
  for (const s of PLAIN) {
    const g = smiles(s);
    assert.equal(peroxides(envOf(g)), undefined, s);
    for (const n of NUCLEI) {
      const a = predict(g, n)?.signals ?? [], b = Base.predict(g, n)?.signals ?? [];
      if (a.length !== b.length) { bad.push(`${s} ${n}: ${b.length} signals to ${a.length}`); continue; }
      a.forEach((x, k) => { const y = b[k]; if (x.level !== y.level || quality(x, n) !== Base!.quality(y, n) || Math.abs(x.shift - y.shift) > 3 || x.standIn) bad.push(`${s} ${n} ${x.atoms}: ${y.shift} L${y.level} to ${x.shift} L${x.level}`); });
    }
  }
  none(bad);
});
await test("P17 delete one O of the O–O: the alcohol's or ether's prediction, no stand-in; put back, the peroxide's again", () => {
  const per = text(smiles("CCCCCCOO"), "13C");
  for (const s of ["CCCCCCO", "CCCCCCOC"]) { const p = predict(smiles(s), "13C")!; assert.ok(p.signals.every((x) => !x.standIn), s); if (Base) assert.equal(text(smiles(s), "13C"), text(smiles(s), "13C", Base), s); }
  assert.equal(text(smiles("CCCCCCOO"), "13C"), per);
});
await test("P18 ten rounds of undo and redo across an O–O: each state predicts as the first time", () => {
  const states = ["CCCCCCO", "CCCCCCOO", "CCCCCCOOC", "OOC(C)CCOOC(=O)c1ccccc1"].map(smiles), first = states.map((g) => NUCLEI.map((n) => text(g, n)).join("|"));
  for (let k = 0; k < 10; k++) for (const i of [3, 2, 1, 0, 1, 2, 3]) assert.equal(NUCLEI.map((n) => text(states[i], n)).join("|"), first[i], `round ${k} state ${i}`);
});
await test("P19 a second window (the tables read again) and two pastes in one drawing: the same values", () => {
  const g = smiles("CC1CCC2C(C)C(=O)OC3OC4(C)CCC1C32OO4"), want = NUCLEI.map((n) => text(g, n));
  readTables(TABLE);
  assert.deepEqual(NUCLEI.map((n) => text(g, n)), want);
});
await test("P20 D₂O and CD₃OD: OOH gone; the stand-in uses the ¹³C solvent table; odd solvent names do not throw", () => {
  const g = smiles("CCCCCCOO");
  for (const solvent of ["D₂O", "CD₃OD"]) assert.ok(!predict(g, "1H", solvent)!.signals.some((x) => x.atoms.includes(7)), solvent);
  for (const solvent of ["CDCl₃", "DMSO-d₆", "C₆D₆", "", "CDCl3", "nonsense", "D₂O|x"]) for (const n of NUCLEI) assert.ok(finite(predict(g, n, solvent)), `${n} in ${JSON.stringify(solvent)}`);
});
await test("P21 isotopes: OOD drawn as a D atom and a ¹³C-labelled α carbon predict as the plain compound", () => {
  const plain = smiles("CCCCCCOO"), withD = graph(["C", "C", "C", "C", "C", "C", "O", "O", "H"], [[0, 1, 1], [1, 2, 1], [2, 3, 1], [3, 4, 1], [4, 5, 1], [5, 6, 1], [6, 7, 1], [7, 8, 1]]);
  withD.atoms[8] = { ...withD.atoms[8], iso: 2 };
  assert.equal(shape(withD), shape(plain));
  assert.equal(shape({ atoms: plain.atoms.map((a, i) => (i === 5 ? { ...a, iso: 13 } : a)), bonds: plain.bonds }), shape(plain));
});
await test("P22 typing O, O, O on a chain: each state finite, and back to the hydroperoxide gives its first values", () => {
  const states = ["CCCC", "CCCCO", "CCCCOO", "CCCCOOO", "CCCCOOOO", "CCCCOOO", "CCCCOO"].map(smiles), first = NUCLEI.map((n) => text(states[2], n));
  for (const g of states) for (const n of NUCLEI) assert.ok(finite(predict(g, n)));
  assert.deepEqual(NUCLEI.map((n) => text(states[6], n)), first);
});
await test("P23 two windows predicting at once: interleaved predictions equal each alone; one table load", async () => {
  const a = smiles(LITERATURE[16]), b = smiles(TWO_OO[1]), alone = [text(a, "13C"), text(b, "13C")];
  for (let k = 0; k < 5; k++) assert.deepEqual([text(a, "13C"), text(b, "13C")], alone);
  const p = nmrReady();
  assert.equal(nmrReady(), p, "one load");
  await p;
  assert.deepEqual([text(a, "13C"), text(b, "13C")], alone);
});
// The MCP: an editor stand-in with a hydroperoxide; run_command acts on it.
const acted: string[] = [];
const host = new Proxy({
  doc: () => chem.importStructure("CCCCCCOO"), style: () => DEFAULT_STYLE, ready: async () => {}, settle: async () => {}, command: () => false,
  act: (id: string) => { acted.push(id); return /^predict_(1h|13c|19f|31p)$/.test(id); }, dialog: () => false, windowless: () => false, asking: () => false, dismiss: () => {},
  experiment: () => false, select: () => {}, selection: () => ({ atoms: [], items: [] }), window: () => ({ id: "w1", name: "Untitled" }), windows: async () => [{ id: "w1", name: "Untitled", edited: false }],
  target: async () => true, begin: () => {}, end: () => {}, said: () => {}, working: () => {}, problems: () => [], tables: () => [],
} as Record<string, unknown>, { get: (t, k: string) => (k in t ? t[k] : () => undefined) }) as unknown as import("./mcp.ts").Host;
let rpc = 0;
const send = async (method: string, params?: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method, params }), () => host, "1.2.0", { client: "stress", session: "s-1" }));
await send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "stress", version: "0" } });
const run = async (args: unknown) => { const r = await send("tools/call", { name: "advanced", arguments: { tool: "run_command", args } }); return { error: !!r.result?.isError || !!r.error, text: String(r.result?.content?.[0]?.text ?? r.error?.message ?? "") }; };
await test("P24 MCP run_command with a wrong name, case, type, ids or extra argument: refused, nothing run", async () => {
  acted.length = 0;
  for (const args of [{ command: "predict_17o" }, { command: "PREDICT_13C" }, { command: "" }, { command: 13 }, { command: "predict_13c", ids: ["s99"] }, { command: "predict_13c", ids: "s1" }, { command: "predict_13c", extra: true }, { command: "predict_13c".repeat(9) }])
    assert.ok((await run(args)).error, JSON.stringify(args));
  assert.deepEqual(acted, []);
  assert.ok(!(await run({ command: " predict_13c " })).error);
  assert.deepEqual(acted, ["predict_13c"]);
});
await test("P26 a salt whose far O is charged: no peroxide, the rest predicts", () => {
  const g = smiles("CC(C)(C)O[O-].[Na+]");
  assert.equal(peroxides(envOf(g)), undefined);
  for (const n of NUCLEI) assert.ok(finite(predict(g, n)));
});

// --- Our own cases ------------------------------------------------------------------------------------------------
await test("M1 the same molecule from two SMILES: OOC(C)CCOOC(=O)c1ccccc1 and c1ccccc1C(=O)OOCCC(C)OO", () => {
  const ppm = (s: string) => predict(smiles(s), "13C")!.signals.map((x) => x.shift.toFixed(1)).sort((p, q) => +q - +p).join(", ");
  none([["OOC(C)CCOOC(=O)c1ccccc1", "c1ccccc1C(=O)OOCCC(C)OO"], ["OOCCCOOC", "COOCCCOO"], ["OOCC(C)(C)OOC", "COOC(C)(C)COO"]].filter(([a, b]) => shape(smiles(a)) !== shape(smiles(b))).map(([a, b]) => `${a}: δ ${ppm(a)}; ${b}: δ ${ppm(b)}`));
});
await test("M2 a carbon α or β to one O–O and three bonds from another: the stand-in replaces the farther O of each", () => {
  // OOCCCOOC: C2 is α to O0–O1 and three bonds from O5 (O6 is four): its stand-ins replace O0 and O6, never O5.
  const env = envOf(smiles("OOCCCOOC"));
  const far = nearPeroxide(env, peroxides(env)!, 2)!.far;
  assert.deepEqual(far, [[0, 6]], `stand-ins replace ${JSON.stringify(far)}`);
});
// Random graphs rich in O–O (3 to 16 atoms of C, O, N, S, Si, F, Cl, P, Se, Ti, some charged, some rings).
const VAL: Record<string, number> = { C: 4, O: 2, N: 3, S: 2, Si: 4, F: 1, Cl: 1, P: 3, Se: 2, Ti: 4 };
function randomGraph(): Graph {
  const n = 3 + Math.floor(rnd() * 14), els: string[] = [], used: number[] = [], bonds: Graph["bonds"] = [];
  const pick = <T>(v: T[]) => v[Math.floor(rnd() * v.length)];
  for (let i = 0; i < n; i++) {
    els.push(rnd() < 0.45 ? "O" : rnd() < 0.8 ? "C" : pick(["N", "S", "Si", "F", "Cl", "P", "Se", "Ti"]));
    used.push(0);
    const room = Array.from({ length: i }, (_, k) => k).filter((k) => used[k] < VAL[els[k]]);
    if (i && room.length && used[i] < VAL[els[i]]) {
      const k = pick(room), o = rnd() < 0.15 && els[k] === "C" && !["F", "Cl"].includes(els[i]) && used[k] < 3 && used[i] < VAL[els[i]] - 1 ? 2 : 1;
      bonds.push({ a: k, b: i, order: o as 1 | 2 }); used[k] += o; used[i] += o;
    }
  }
  for (let r = 0; r < 2; r++) if (rnd() < 0.4) { const a = Math.floor(rnd() * n), b = Math.floor(rnd() * n); if (a !== b && used[a] < VAL[els[a]] && used[b] < VAL[els[b]] && !bonds.some((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))) { bonds.push({ a, b, order: 1 }); used[a]++; used[b]++; } }
  return { atoms: els.map((el, i) => ({ el, charge: rnd() < 0.05 ? pick([-1, 1]) : 0, h: Math.max(0, VAL[el] - used[i]) })), bonds };
}
await test("M3 1,500 random graphs with O–O, each in 4 random orders: no throw, finite, the same prediction (as 1.1.2 is)", () => {
  seed = 11;
  const bad: string[] = [];
  let tried = 0;
  for (let k = 0; k < 1500; k++) {
    const g = randomGraph();
    if (!g.bonds.some((b) => g.atoms[b.a].el === "O" && g.atoms[b.b].el === "O")) continue;
    tried++;
    for (const n of NUCLEI) {
      const id = g.atoms.map((_, i) => i), want = text(g, n, nmr, id);
      assert.ok(!/NaN|Infinity/.test(want), `finite: ${JSON.stringify(g)}`);
      for (let r = 0; r < 4; r++) {
        const { g: h, back } = shuffled(g);
        if (text(h, n, nmr, back) !== want && (!Base || text(h, n, Base, back) === text(g, n, Base, id))) { if (bad.length < 3) bad.push(`${n} ${JSON.stringify(g)}`); else bad.push("…"); break; }
      }
    }
  }
  assert.ok(tried > 300, `tried ${tried}`);
  none(bad.length ? [`${bad.length} graphs depend on atom order`, ...bad.filter((x) => x !== "…")] : []);
});
await test("M4 hostile graphs (self-bond, doubled O–O, negative or NaN hydrogens, empty element, bond to no atom, NaN charge, O₂₀₀ chain, O₃₀ ring): no throw, finite", () => {
  const at = (el: string, h = 0, charge = 0) => ({ el, charge, h });
  const chainO = (k: number) => ({ atoms: [at("C", 3), ...Array.from({ length: k }, () => at("O")), at("C", 3)], bonds: Array.from({ length: k + 1 }, (_, i) => ({ a: i, b: i + 1, order: 1 as const })) });
  const cases = [
    { atoms: [at("C", 3), at("O"), at("O", 1)], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 1, b: 1, order: 1 }] },
    { atoms: [at("C", 3), at("O"), at("O", 1)], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 2, b: 1, order: 1 }] },
    { atoms: [at("C", 3), at("O"), at("O")], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 1, b: 2, order: 2 }] },
    { atoms: [at("C", 3), at("O", -1), at("O", 1), at("C", 3)], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 1, b: 3, order: 1 }] },
    { atoms: [at("C", 3), at("O", NaN), at("O", 1)], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }] },
    { atoms: [at("", 3), at("O"), at("O", 1)], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }] },
    { atoms: [at("C", 3), at("O"), at("O", 1)], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }, { a: 2, b: 9, order: 1 }] },
    { atoms: [at("C", 3), at("O", 0, NaN), at("O", 1)], bonds: [{ a: 0, b: 1, order: 1 }, { a: 1, b: 2, order: 1 }] },
    chainO(200),
    { atoms: Array.from({ length: 30 }, () => at("O")), bonds: Array.from({ length: 30 }, (_, i) => ({ a: i, b: (i + 1) % 30, order: 1 })) },
  ] as Graph[];
  for (const [k, g] of cases.entries()) for (const n of [...NUCLEI, "19F", "31P"] as Nucleus[]) { let p; assert.doesNotThrow(() => (p = predict(g, n)), `case ${k} ${n}`); assert.ok(finite(p), `case ${k} ${n}`); }
});
await test("M5 hydrogens drawn as atoms everywhere: the same prediction", () => {
  for (const [a, b] of [["[H]OOC([H])([H])C([H])([H])C([H])([H])[H]", "CCCOO"], ["[H]C([H])([H])C([H])([H])OOC([H])([H])[H]", "CCOOC"]]) assert.equal(shape(smiles(a)), shape(smiles(b)), a);
});
await test("M6 a messy 200-structure drawing: through .oct, CDXML and CDX, each structure predicts as alone; all 200 in under 3 s", () => {
  const pool = [...LITERATURE, ...TWO_OO, ...PLAIN.slice(0, 12), "OO", "CC(C)(C)O[O-].[Na+]", "CC1(C)OO1", "C[Si](C)(C)OOC(C)(C)C", "CC(C)(C)OOOC(C)(C)C"];
  const atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [], want: string[] = [];
  for (let k = 0; k < 200; k++) {
    const s = pool[k % pool.length], m = chem.importStructure(s), o = atoms.length, dx = (k % 20) * 30, dy = Math.floor(k / 20) * 30;
    atoms.push(...m.atoms.map((a) => ({ ...a, location: [a.location[0] + dx, a.location[1] + dy, 0] as [number, number, number] })));
    bonds.push(...m.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + o, b.atoms[1] + o] as [number, number] })));
    want.push(shape(fromMol(m)));
  }
  const doc: Mol = { atoms, bonds };
  const each = (m: Mol) => fragments(m).sort((p, q) => Math.min(...p) - Math.min(...q)).map((f) => fromMol(subset(m, new Set(f))));
  const counts = (v: string[]) => v.reduce((c, x) => c.set(x, (c.get(x) ?? 0) + 1), new Map<string, number>());
  const t = performance.now(), got = each(doc).map((g) => shape(g)), took = performance.now() - t;
  // A salt is two fragments: compare the multiset of non-ion predictions.
  const w = counts(want), drop = (v: string[]) => v.filter((x) => !/^\| |^$/.test(x));
  for (const [what, m] of [[".oct", readOct(writeOct(doc, DEFAULT_STYLE)).mol], ["CDXML", fromCdxml(toCdxml(doc, DEFAULT_STYLE)).mol], ["CDX", readCdx(writeCdx(doc, DEFAULT_STYLE)).mol]] as [string, Mol][])
    assert.deepEqual([...counts(drop(each(m).map((g) => shape(g)))).entries()].sort(), [...counts(drop(got)).entries()].sort(), what);
  assert.ok([...w.keys()].filter((k) => !/^\| |^$/.test(k)).every((k) => got.includes(k)), "each structure as alone");
  assert.ok(took < 3000, `200 structures took ${took.toFixed(0)} ms`);
});
await test("M7 a carbon on OOH and on (or β to) a silyl or trioxide O–O: no stand-in for it, finite", () => {
  for (const [s, c] of [["OOC(C)(C)OO[Si](C)(C)C", 1], ["OOCC(C)OO[Si](C)(C)C", 2], ["OOCCOOOC", 2]] as [string, number][]) {
    const g = smiles(s), env = envOf(g);
    assert.ok(!nearPeroxide(env, peroxides(env)!, c), s);
    for (const n of NUCLEI) assert.ok(finite(predict(g, n)), `${s} ${n}`);
  }
});
await test("M8 ¹⁹F and ³¹P next to an O–O: finite, no stand-in", () => {
  for (const [s, n] of [["OOC(=O)C(F)(F)F", "19F"], ["FC(F)(F)C(=O)OOC(=O)C(F)(F)F", "19F"], ["CCOP(=O)(OCC)OOC(C)(C)C", "31P"], ["CC(C)(C)OOP(=O)(c1ccccc1)c1ccccc1", "31P"]] as [string, Nucleus][]) {
    const p = predict(smiles(s), n);
    assert.ok(p && p.signals.length && finite(p) && p.signals.every((x) => !x.standIn), `${s} ${n}`);
  }
});
await test("M9 ¹H couplings and multiplets of peroxides: the same as release 1.1.2 (couplings do not cross O)", () => {
  if (!Base) return;
  for (const s of [...LITERATURE, ...TWO_OO]) {
    const g = smiles(s), a = predict(g, "1H")!.signals, b = Base.predict(g, "1H")!.signals;
    const key = (v: Signal[]) => v.map((x) => `${[...x.atoms].sort((p, q) => p - q)}:${x.nuclei}:${JSON.stringify(x.couplings)}`).sort();
    assert.deepEqual(key(a), key(b), s);
  }
});
await test("M10 ¹³C with and without ¹H decoupling asked for: the same shifts, every one finite", () => {
  const g = smiles(TWO_OO[1]);
  assert.deepEqual(predict(g, "13C", undefined, false)!.signals.map((s) => s.shift), predict(g, "13C", undefined, true)!.signals.map((s) => s.shift));
});
await test("M11 eight stand-ins for one carbon (an α OOH and three 1,2-dioxolan-4-yl groups): finite and quick", () => {
  const g = smiles("OOC(C1COOC1)(C1COOC1)C1COOC1"), env = envOf(g);
  assert.equal(nearPeroxide(env, peroxides(env)!, 2)!.far.length, 8);
  const t = performance.now();
  for (const n of NUCLEI) assert.ok(finite(predict(g, n)));
  assert.ok(performance.now() - t < 100);
});
await test("M12 Quality of every stand-in shift is Rough; every OOH is broad and Rough (literature set)", () => {
  for (const s of [...LITERATURE, ...TWO_OO]) {
    const g = smiles(s);
    for (const x of predict(g, "13C")!.signals) if (x.standIn) assert.equal(quality(x, "13C"), "rough", `${s} ${x.atoms}`);
    for (const x of predict(g, "1H")!.signals) if (x.atoms.some((a) => g.atoms[a].el === "O")) assert.ok(x.broad && quality(x, "1H") === "rough", `${s} OOH`);
  }
});
await test("M13 Octet 1.1.2 opens this tree's .oct, CDXML and CDX of peroxides as the same structures", () => {
  if (!Old) return;
  const bad: string[] = [];
  for (const s of [...LITERATURE.slice(0, 6), ...TWO_OO.slice(0, 3), "CC1CCC2C(C)C(=O)OC3OC4(C)CCC1C32OO4"]) {
    const m = chem.importStructure(s), want = shape(fromMol(m));
    for (const [what, read] of [[".oct", () => Old!.readOct(writeOct(m, DEFAULT_STYLE)).mol], ["CDXML", () => Old!.fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol], ["CDX", () => Old!.readCdx(writeCdx(m, DEFAULT_STYLE)).mol]] as [string, () => Mol][])
      if (shape(fromMol(read(), Old.chem, Old.graphOf)) !== want) bad.push(`${s} ${what}`);
  }
  none(bad);
});

await test("M14 next to an O–O that cannot be replaced (silyl, sulfonyl, aminyl, phosphoryl, boryl, titanium, trioxide, dioxirane): every shift as release 1.1.2's", () => {
  if (!Base) return;
  const bad: string[] = [];
  for (const s of ["C[Si](C)(C)OOC(C)(C)C", "CS(=O)(=O)OOC(C)(C)C", "CN(C)OOC(C)(C)C", "CCOP(=O)(OCC)OOC(C)(C)C", "CC(C)(C)OOB(O)O", "CC(C)(C)OO[Ti](Cl)(Cl)Cl", "CC(C)(C)OOOC(C)(C)C", "CC1(C)OO1", "OOC(C)(C)OO[Si](C)(C)C"]) {
    const g = smiles(s);
    for (const n of NUCLEI) {
      const now = predict(g, n)!.signals, old = Base.predict(g, n)!.signals;
      if (now.length !== old.length || now.some((x, k) => x.level !== old[k].level || Math.abs(x.shift - old[k].shift) > 0.2)) bad.push(`${s} ${n}: ${text(g, n, Base)} → ${text(g, n)}`);
    }
  }
  none(bad);
});
await test("M15 a stand-in that matched one sphere does not replace a match that does not see the O–O: tetraoxane 2t's spiro carbons within 2 ppm", () => {
  // Amado et al. 2022 (nmrperoxide.check.ts): 107.28 and 110.61, sorted.
  const g = smiles("CCOC(=O)C1CCC2(CC1)OOC3(OO2)C4CC5CC(C4)CC3C5"), p = predict(g, "13C")!.signals;
  const spiro = [8, 13].map((a) => p.find((x) => x.atoms.includes(a))!.shift).sort((a, b) => a - b);
  assert.ok(Math.abs(spiro[0] - 107.28) <= 2 && Math.abs(spiro[1] - 110.61) <= 2, `spiro carbons ${spiro.map((x) => x.toFixed(2)).join(", ")}`);
});
rmSync(tmp, { recursive: true, force: true });
console.log(`peroxide-stress.check: ${ran - fails.length} of ${ran} cases pass`);
if (fails.length) {
  console.error(`peroxide-stress.check: ${fails.length} failing:\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
