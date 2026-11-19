// Run: node src/seqbridges-stress.check.ts. A stress test of issue 27 (docs/plans/issue-27-sequence-bridges.md):
// disulfide and other links, head-to-tail rings, D-amino acids, inline monomers, the document's Sequences setting and
// HELM and FASTA in and out. It goes through every case of the plan's stress list (S1 to S28) and more of our own (N1
// on), each driving the real code: the HELM reader, the builder, the chain layout and reader, the bracket bonds (hit,
// flip, rotate, render, check), the Bond tool between labels, the files (.oct, CDXML, CDX), Octet 1.1.2's readers on
// what this branch writes, and the MCP tools on Octet with no window. Each case runs alone, so one failure does not hide
// the next. The check lists every case that fails, with what it expected and what it got, and fails if any does.
//
// Cases that need what a plain run does not have are skipped with a reason:
//   OCTET_STRESS_CHEMDRAW=1   ChemDraw 22.2 opens our CDXML and saves it (by AppleScript, one session at a time).
//   OCTET_STRESS_URL=<url>    the dev server (npx vite --port 1467): the app in WebKit (scripts/look/webkit.swift).
//   OCTET_STRESS_ONLY=<regex> only the cases whose ids match.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Ink, Mol } from "./render.ts";

const gl = globalThis as Record<string, unknown>;
gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
gl.window = globalThis;
gl.self = { location: { origin: "file://" } };
gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
await chem.ready;
const helmMod = await import("./helm.ts");
const { parseHelm, helmOf, toHelm, toFasta, readSequence, fieldSeq, linkResidues, seqBuilt, seqProblem, seqOf, withSequences, chainText, MOST_TEXT } = helmMod;
const { buildAtoms, buildLabels, MOST_BUILT_ATOMS } = await import("./seqbuild.ts");
const { bracketOf, bracketPath, render } = await import("./render.ts");
const { relabel } = await import("./sequence.ts");
const { bondAt, flipAtoms, rotateAtoms, fragments, dragBond, labelHooks, setLabel, erase, insertMol, expandLabel, contractLabel, duplicateSelection, scaleSizes, pickAtoms, transformParts, moveAtoms } = await import("./edit.ts");
const { serialize, parse } = await import("./file.ts");
const { toCdxml, fromCdxml } = await import("./cdxml.ts");
const { readOct, writeOct, readCdx, writeCdx } = await import("./oct.ts");
const { DEFAULT_STYLE, readStyle } = await import("./docstyle.ts");
const { problems, messy } = await import("./check.ts");
const { chainLayout } = await import("./chain.ts");
const { peptideSmiles } = await import("./peptide.ts");
const seqbuildMore = await import("./seqbuild.ts"), monomersMod = await import("./monomers.ts");
const { labelSmiles } = await import("./labels.ts");

type P = [number, number];
type Seq = Extract<NonNullable<ReturnType<typeof parseHelm>>, { seq: unknown }>["seq"];

// --- The runner ---------------------------------------------------------------------------------------------------
type Result = { id: string; title: string; state: "ok" | "failed" | "skipped"; note?: string };
const results: Result[] = [];
// OCTET_STRESS_ONLY=<regex> runs only the cases whose ids match (while a case is worked on).
const only = process.env.OCTET_STRESS_ONLY ? new RegExp(`^(${process.env.OCTET_STRESS_ONLY})$`) : undefined;
async function check(id: string, title: string, run: () => void | string | Promise<void | string>) {
  if (only && !only.test(id)) return;
  try {
    const skipped = await run();
    results.push(typeof skipped === "string" ? { id, title, state: "skipped", note: skipped } : { id, title, state: "ok" });
  } catch (e) {
    results.push({ id, title, state: "failed", note: e instanceof Error ? e.message.split("\n")[0] : String(e) });
  }
}
// The median of n runs after a warm-up.
function time(f: () => unknown, n = 5): number {
  f();
  const t: number[] = [];
  for (let k = 0; k < n; k++) { const t0 = performance.now(); f(); t.push(performance.now() - t0); }
  return t.sort((a, b) => a - b)[t.length >> 1];
}

// --- Helpers ------------------------------------------------------------------------------------------------------
const seqOfHelm = (h: string): Seq => { const p = parseHelm(h); assert.ok(p && "seq" in p, `${h.slice(0, 40)}: reads (${JSON.stringify(p)})`); return (p as { seq: Seq }).seq; };
const atoms = (h: string) => { const b = buildAtoms(seqOfHelm(h)); assert.ok("mol" in b, `${h.slice(0, 40)}: built (${JSON.stringify(b)})`); return (b as { mol: Mol }).mol; };
const labels = (h: string) => { const b = buildLabels(seqOfHelm(h)); assert.ok("mol" in b, `${h.slice(0, 40)}: built as labels (${JSON.stringify(b)})`); return (b as { mol: Mol }).mol; };
const inchi = (m: Mol | string) => chem.toInchi(m);
const at = (m: Mol, i: number): P => [m.atoms[i].location[0], m.atoms[i].location[1]];
const isLabel = (m: Mol, i: number) => !!(m.atoms[i].inner?.atoms.length && m.atoms[i].text);
const brackets = (m: Mol) => m.bonds.map((b, k) => [b, k] as const).filter(([b]) => bracketOf(b));
const pathOf = (m: Mol, b: Mol["bonds"][number]) => bracketPath(at(m, b.atoms[0]), at(m, b.atoms[1]), bracketOf(b));
// Two segments cross (not at a shared end).
const crosses = (a: number[], b: number[], c: number[], d: number[]) => { const s = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return s(a, b, c) * s(a, b, d) < -1e-9 && s(c, d, a) * s(c, d, b) < -1e-9; };
// Every drawn segment of every bond (a bracket's three).
const segments = (m: Mol) => m.bonds.flatMap((b) => { const p = bracketOf(b) ? pathOf(m, b) : [at(m, b.atoms[0]), at(m, b.atoms[1])]; return p.slice(1).map((q, n) => ({ b, s: [p[n], q] as [P, P] })); });
function noCrossings(m: Mol, what: string) {
  const s = segments(m);
  for (let x = 0; x < s.length; x++) for (let y = x + 1; y < s.length; y++) {
    if (s[x].b === s[y].b || s[x].b.atoms.some((i) => s[y].b.atoms.includes(i))) continue;
    assert.ok(!crosses(s[x].s[0], s[x].s[1], s[y].s[0], s[y].s[1]), `${what}: bond ${s[x].b.atoms} crosses bond ${s[y].b.atoms}`);
  }
}
function apart(m: Mol, what: string, d = 0.3) {
  for (let i = 0; i < m.atoms.length; i++) for (let j = i + 1; j < m.atoms.length; j++) {
    const p = at(m, i), q = at(m, j);
    assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) > d, `${what}: atoms ${i} (${m.atoms[i].text ?? m.atoms[i].label}) and ${j} (${m.atoms[j].text ?? m.atoms[j].label}) ${Math.hypot(p[0] - q[0], p[1] - q[1]).toFixed(2)} apart`);
  }
}
// Each bracket clears every atom between its ends by margin (perpendicular to the bond).
function clears(m: Mol, what: string, margin = 0.45) {
  for (const [b] of brackets(m)) {
    const [p, , , q] = pathOf(m, b), d = [q[0] - p[0], q[1] - p[1]], l = Math.hypot(d[0], d[1]), n = [-d[1] / l, d[0] / l], h = bracketOf(b);
    for (let i = 0; i < m.atoms.length; i++) {
      if (b.atoms.includes(i)) continue;
      const t = ((at(m, i)[0] - p[0]) * d[0] + (at(m, i)[1] - p[1]) * d[1]) / l, off = ((at(m, i)[0] - p[0]) * n[0] + (at(m, i)[1] - p[1]) * n[1]) * Math.sign(h);
      if (t > 0 && t < l) assert.ok(off < Math.abs(h) - margin, `${what}: the bracket ${b.atoms} passes ${(Math.abs(h) - off).toFixed(2)} from atom ${i} (${m.atoms[i].text ?? m.atoms[i].label})`);
    }
  }
}
// No bracket line runs through a label (a residue label, or N, O, S, H on an atom), but the two it joins. A label's box
// is taken as 0.2 bond lengths a character each side of its atom and 0.3 up and down (Arial 10 pt on a 14.4 pt bond).
function labelsClear(m: Mol, what: string) {
  const hit = (s: [P, P], b: [number, number, number, number]) => {
    for (let t = 0; t <= 1; t += 1 / 64) { const x = s[0][0] + (s[1][0] - s[0][0]) * t, y = s[0][1] + (s[1][1] - s[0][1]) * t; if (x > b[0] && x < b[2] && y > b[1] && y < b[3]) return true; }
    return false;
  };
  for (const [b] of brackets(m)) {
    const p = pathOf(m, b), lines: [P, P][] = [[p[0], p[1]], [p[1], p[2]], [p[2], p[3]]];
    m.atoms.forEach((a, i) => {
      if (b.atoms.includes(i) || (a.label === "C" && !a.text)) return;
      const w = 0.2 * (a.text ?? a.label).length, q = at(m, i), box: [number, number, number, number] = [q[0] - w, q[1] - 0.3, q[0] + w, q[1] + 0.3];
      assert.ok(!lines.some((s) => hit(s, box)), `${what}: the bracket ${b.atoms} runs through ${a.text ?? a.label} (atom ${i})`);
    });
  }
}
// The y of a bracket's top line, and the backbone's mean y.
const bracketY = (m: Mol, b: Mol["bonds"][number]) => (pathOf(m, b)[1][1] + pathOf(m, b)[2][1]) / 2;
const noNaN = (m: unknown, what: string) => assert.ok(!/null|NaN|Infinity/.test(JSON.stringify(m)), `${what}: no NaN or Infinity`);

// The render's style and a text measure, as render.check.ts stubs them.
const pt = 4 / 3;
const STYLE = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
const box: P[] = [];
for (let i = 0; i <= 40; i++) { const f = i / 40; box.push([9.6 * f, 0], [9.6 * f, -9.5], [0, -9.5 * f], [9.6, -9.5 * f]); }
const INK = (): Ink => ({ width: 9.6, ascent: 9.5, outline: box });

// --- The stress sequences -----------------------------------------------------------------------------------------
const S = {
  oxytocin: "PEPTIDE1{C.Y.I.Q.N.C.P.L.G.[am]}$PEPTIDE1,PEPTIDE1,1:R3-6:R3$$$V2.0",
  vasopressin: "PEPTIDE1{C.Y.F.Q.N.C.P.R.G.[am]}$PEPTIDE1,PEPTIDE1,1:R3-6:R3$$$V2.0",
  insulin: "PEPTIDE1{G.I.V.E.Q.C.C.T.S.I.C.S.L.Y.Q.L.E.N.Y.C.N}|PEPTIDE2{F.V.N.Q.H.L.C.G.S.H.L.V.E.A.L.Y.L.V.C.G.E.R.G.F.F.Y.T.P.K.T}$PEPTIDE1,PEPTIDE1,6:R3-11:R3|PEPTIDE1,PEPTIDE2,7:R3-7:R3|PEPTIDE1,PEPTIDE2,20:R3-19:R3$$$V2.0",
  insulinA: "PEPTIDE1{G.I.V.E.Q.C.C.T.S.I.C.S.L.Y.Q.L.E.N.Y.C.N}$PEPTIDE1,PEPTIDE1,6:R3-11:R3$$$V2.0",
  cyclic: "PEPTIDE1{R.G.D.[dF].V}$PEPTIDE1,PEPTIDE1,1:R1-5:R2$$$V2.0",
  lactam: "PEPTIDE1{A.K.A.A.A.E.A}$PEPTIDE1,PEPTIDE1,2:R3-6:R3$$$V2.0",
  nested: "PEPTIDE1{C.A.C.A.C.A.C.A}$PEPTIDE1,PEPTIDE1,1:R3-7:R3|PEPTIDE1,PEPTIDE1,3:R3-5:R3$$$V2.0",
  crossing: "PEPTIDE1{C.A.C.A.C.A.C.A}$PEPTIDE1,PEPTIDE1,1:R3-5:R3|PEPTIDE1,PEPTIDE1,3:R3-7:R3$$$V2.0",
  dAmino: "PEPTIDE1{[dF].[dW].K.T}$$$$V2.0",
  rna: "RNA1{P.R(A)P.R(C)P.R(G)}$$$$V2.0",
  dna: "RNA1{[dR](G)P.[dR](A)P.[dR](T)P.[dR](T)P.[dR](A)P}$$$$V2.0",
  twoNucleic: "RNA1{[dR](A)P.[dR](T)}|RNA2{R(G)P.R(U)}$$$$V2.0",
};
const SMILES: Record<string, string> = {
  oxytocin: "N[C@@H](CS1)C(=O)N[C@@H](Cc2ccc(O)cc2)C(=O)N[C@@H]([C@@H](C)CC)C(=O)N[C@@H](CCC(N)=O)C(=O)N[C@@H](CC(N)=O)C(=O)N[C@@H](CS1)C(=O)N3CCC[C@H]3C(=O)N[C@@H](CC(C)C)C(=O)NCC(N)=O",
  vasopressin: "N[C@@H](CS1)C(=O)N[C@@H](Cc2ccc(O)cc2)C(=O)N[C@@H](Cc2ccccc2)C(=O)N[C@@H](CCC(N)=O)C(=O)N[C@@H](CC(N)=O)C(=O)N[C@@H](CS1)C(=O)N3CCC[C@H]3C(=O)N[C@@H](CCCNC(=N)N)C(=O)NCC(N)=O",
  cyclic: "O=C1[C@H](CCCNC(=N)N)NC(=O)[C@H](C(C)C)NC(=O)[C@@H](Cc2ccccc2)NC(=O)[C@H](CC(=O)O)NC(=O)CN1",
  lactam: "C[C@H](N)C(=O)N[C@H]1CCCCNC(=O)CC[C@@H](C(=O)N[C@@H](C)C(=O)O)NC(=O)[C@H](C)NC(=O)[C@H](C)NC(=O)[C@H](C)NC1=O",
  dAmino: "N[C@H](Cc1ccccc1)C(=O)N[C@H](Cc1c[nH]c2ccccc12)C(=O)N[C@@H](CCCCN)C(=O)N[C@@H]([C@@H](C)O)C(=O)O",
};
// The backbone atoms of a peptide drawn in full: N, Cα and C=O of each residue, in order (N–C–C(=O) runs).
function backboneYs(m: Mol): number[] {
  const near = m.atoms.map((): number[] => []);
  for (const b of m.bonds) { near[b.atoms[0]].push(b.atoms[1]); near[b.atoms[1]].push(b.atoms[0]); }
  const acyl = (i: number) => m.atoms[i].label === "C" && m.bonds.some((b) => b.type === 2 && b.atoms.includes(i) && m.atoms[b.atoms[0] === i ? b.atoms[1] : b.atoms[0]].label === "O");
  const ys: number[] = [];
  m.atoms.forEach((a, n) => { if (a.label !== "N") return; for (const c of near[n]) if (m.atoms[c].label === "C" && !acyl(c)) for (const k of near[c]) if (acyl(k) && k !== n) ys.push(at(m, n)[1], at(m, c)[1], at(m, k)[1]); });
  return ys;
}

// ==================================================================================================================
// The plan's stress list
// ==================================================================================================================
await check("S1", "Oxytocin pasted: field opens with the HELM; straight backbone, Cys up, a bracket S–S over 2 to 5; InChI; HELM back; labels one row, bracket over Tyr–Asn", () => {
  assert.deepEqual(readSequence(S.oxytocin), { text: S.oxytocin }, "the field opens with the HELM");
  const r = seqBuilt({ build: S.oxytocin, labels: false });
  assert.ok(r && !("problem" in r), "the field builds it");
  const m = r as Mol;
  assert.equal(inchi(m), inchi(SMILES.oxytocin), "oxytocin's InChI");
  const ys = backboneYs(m), levels = [...new Set(ys.map((y) => Math.round(y * 20)))];
  assert.ok(levels.length <= 3, `backbone on its zigzag (${levels.length} heights)`);
  const [[b]] = brackets(m);
  assert.ok(b && m.atoms[b.atoms[0]].label === "S" && m.atoms[b.atoms[1]].label === "S", "the bracket joins the two S");
  const mean = ys.reduce((s, y) => s + y, 0) / ys.length;
  assert.ok(at(m, b.atoms[0])[1] > mean && at(m, b.atoms[1])[1] > mean, "both Cys side chains up");
  assert.ok(bracketY(m, b) > Math.max(...ys), "the bracket above the backbone");
  clears(m, "oxytocin");
  assert.equal(toHelm(m), S.oxytocin, "Copy As HELM gives the same string");
  const l = labels(S.oxytocin), lb = brackets(l);
  assert.equal(new Set(l.atoms.filter((a, i) => isLabel(l, i) || a.text).map((a) => Math.round(a.location[1] * 100))).size, 1, "labels: one row");
  assert.equal(lb.length, 1, "labels: one bracket");
  const [p, q] = lb[0][0].atoms.map((i) => l.atoms[i].text);
  assert.deepEqual([p, q], ["Cys", "Cys"], "between the two Cys");
  assert.ok(bracketY(l, lb[0][0]) > l.atoms[0].location[1], "above the row");
  assert.equal(toHelm(l), S.oxytocin, "labels: HELM back");
});

await check("S2", "Vasopressin: as S1", () => {
  const m = atoms(S.vasopressin);
  assert.equal(inchi(m), inchi(SMILES.vasopressin));
  assert.equal(brackets(m).length, 1);
  clears(m, "vasopressin");
  noCrossings(m, "vasopressin");
  assert.equal(toHelm(m), S.vasopressin);
  assert.equal(toHelm(labels(S.vasopressin)), S.vasopressin);
});

await check("S3", "Insulin A and B, three bridges: two stacked chains, A above, A7–B7 upright, A6–A11 above A; HELM back; labels two rows", () => {
  const m = atoms(S.insulin), s = m.atoms.flatMap((a, i) => (a.label === "S" ? [i] : []));
  assert.equal(s.length, 6, "six S");
  apart(m, "insulin");
  noCrossings(m, "insulin");
  clears(m, "insulin");
  const routed = brackets(m);
  assert.equal(routed.length, 1, "one bracket (A6–A11)");
  const between = m.bonds.filter((b) => b.atoms.every((i) => s.includes(i)) && !bracketOf(b));
  assert.equal(between.length, 2, "two links between the chains");
  assert.ok(between.some((b) => Math.abs(at(m, b.atoms[0])[0] - at(m, b.atoms[1])[0]) < 0.6), "the first link upright");
  assert.equal(toHelm(m), S.insulin);
  const l = labels(S.insulin);
  assert.equal(toHelm(l), S.insulin, "labels: HELM back");
  const rows = [...new Set(l.atoms.filter((a, i) => isLabel(l, i)).map((a) => Math.round(a.location[1] * 100)))];
  assert.equal(rows.length, 2, "labels: two rows");
  const gly = l.atoms.findIndex((a) => a.text === "Gly"), phe = l.atoms.findIndex((a) => a.text === "Phe");
  assert.ok(at(l, gly)[1] > at(l, phe)[1], "A (starts Gly) above B (starts Phe)");
  const lb = brackets(l);
  assert.equal(lb.length, 1, "labels: A6–A11 a bracket");
  assert.ok(bracketY(l, lb[0][0]) > at(l, gly)[1], "labels: A6–A11 above A");
  noCrossings(l, "insulin labels");
});

await check("S4", "Insulin A alone with its own bridge: a bracket above, the backbone straight", () => {
  const m = atoms(S.insulinA), [[b]] = brackets(m), ys = backboneYs(m);
  assert.ok(bracketY(m, b) > Math.max(...ys), "the bracket above the backbone");
  assert.ok(new Set(ys.map((y) => Math.round(y * 20))).size <= 3, "the backbone on its zigzag");
  clears(m, "insulin A");
  noCrossings(m, "insulin A");
  assert.equal(toHelm(m), S.insulinA);
});

await check("S5", "Head-to-tail cyclo(RGD-dF-V): straight backbone, closing bracket below, D-Phe's hand, HELM back", () => {
  const m = atoms(S.cyclic), [[b]] = brackets(m), ys = backboneYs(m);
  assert.equal(inchi(m), inchi(SMILES.cyclic), "the compound, D-Phe's hand too");
  assert.ok(bracketY(m, b) < Math.min(...ys), "the closing bracket below");
  clears(m, "cyclic");
  assert.equal(toHelm(m), S.cyclic);
  assert.equal(toHelm(labels(S.cyclic)), S.cyclic);
});

await check("S6", "Lactam K–E: Glu's OH leaves, a bracket, HELM back", () => {
  const m = atoms(S.lactam);
  assert.equal(inchi(m), inchi(SMILES.lactam));
  assert.equal(brackets(m).length, 1);
  clears(m, "lactam");
  noCrossings(m, "lactam");
  assert.equal(toHelm(m), S.lactam);
  assert.equal(toHelm(labels(S.lactam)), S.lactam);
});

await check("S7", "Two nested and two crossing bridges: nested on one side, outer higher; crossing on opposite sides; no crossings", () => {
  for (const how of ["atoms", "labels"] as const) {
    const n = how === "atoms" ? atoms(S.nested) : labels(S.nested), nb = brackets(n).map(([b]) => b);
    assert.equal(nb.length, 2, `${how}: nested, two brackets`);
    const span = (m: Mol, b: Mol["bonds"][number]) => Math.abs(at(m, b.atoms[0])[0] - at(m, b.atoms[1])[0]);
    const [inner, outer] = [...nb].sort((p, q) => span(n, p) - span(n, q));
    assert.equal(Math.sign(bracketY(n, inner) - at(n, inner.atoms[0])[1]), Math.sign(bracketY(n, outer) - at(n, outer.atoms[0])[1]), `${how}: nested on one side`);
    assert.ok(Math.abs(bracketY(n, outer)) > Math.abs(bracketY(n, inner)), `${how}: the outer one higher`);
    noCrossings(n, `${how} nested`);
    const c = how === "atoms" ? atoms(S.crossing) : labels(S.crossing), cb = brackets(c).map(([b]) => b);
    assert.equal(cb.length, 2, `${how}: crossing, two brackets`);
    const row = how === "atoms" ? backboneYs(c).reduce((s, y, _, a) => s + y / a.length, 0) : c.atoms.find((a) => a.text === "Cys")!.location[1];
    assert.ok(Math.sign(bracketY(c, cb[0]) - row) !== Math.sign(bracketY(c, cb[1]) - row), `${how}: crossing ones on opposite sides`);
    noCrossings(c, `${how} crossing`);
    assert.equal(toHelm(n), S.nested);
    assert.equal(toHelm(c), S.crossing);
  }
});

const H500 = `PEPTIDE1{${Array.from({ length: 500 }, (_, k) => "ACDEFGHIKLMNPQRSTVWY"[k % 20]).join(".")}}$$$$V2.0`;
await check("S8", "500 residues as HELM, labels: under 1 s; an edit elsewhere under 100 ms; HELM back; as atoms the problem and nothing drawn", () => {
  const seq = seqOfHelm(H500), ms = time(() => buildLabels(seq), 3), l = (buildLabels(seq) as { mol: Mol }).mol;
  assert.ok(ms < 1000, `built in ${ms.toFixed(0)} ms`);
  assert.equal(toHelm(l), H500, "HELM back");
  assert.deepEqual(seqBuilt({ build: H500, labels: false }), { problem: "Up to 1,000 atoms. Choose Residue labels." });
  // An edit elsewhere: a benzene added beside it, then the structure check and a render, as the editor's set and draw do.
  const page = insertMol(l, chem.parseStructure("c1ccccc1"), [0, 40]).mol, moved = { ...page, atoms: page.atoms.map((a, i) => (i === page.atoms.length - 1 ? { ...a, location: [a.location[0] + 0.1, a.location[1], 0] as [number, number, number] } : a)) };
  const edit = time(() => { problems(moved); render(moved, STYLE, INK); }, 3);
  assert.ok(edit < 100, `an edit elsewhere (check and render): ${edit.toFixed(0)} ms`);
});

let oldDir = "";
// Octet 1.1.2's own code, from the tag, in a folder of its own (as other stress checks read an old version).
async function v112(): Promise<{ chem: typeof chem; peptide: typeof import("./peptide.ts"); nucleic: { nucleicText: (t: string) => { smiles: string } | { problem: string } | undefined }; parse: typeof parse; readOct: typeof readOct; readCdx: typeof readCdx; helm: typeof import("./helm.ts") } | string> {
  const root = fileURLToPath(new URL("..", import.meta.url));
  try { execFileSync("git", ["rev-parse", "--verify", "v1.1.2^{commit}"], { cwd: root, stdio: "ignore" }); } catch { return "no tag v1.1.2 in this clone"; }
  const dir = mkdtempSync(join(tmpdir(), "octet-v112-"));
  execFileSync("sh", ["-c", `git archive v1.1.2 src package.json | tar -x -C "${dir}"`], { cwd: root });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const there = (f: string) => `file://${join(dir, "src", f)}`;
  const [c, p, n, f, o, h, r, e, k] = await Promise.all([import(there("chem.ts")), import(there("peptide.ts")), import(there("nucleic.ts")), import(there("file.ts")), import(there("oct.ts")), import(there("helm.ts")), import(there("render.ts")), import(there("edit.ts")), import(there("check.ts"))]);
  await c.ready;
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  oldDir = dir;
  return { chem: c, peptide: p, nucleic: n, parse: f.parse, readOct: o.readOct, readCdx: o.readCdx, helm: h };
}
const old = await v112();

await check("S9", "A 60-mer from the field: faster than 1.1.2 draws it (interleaved medians), the same compound", () => {
  if (typeof old === "string") return old;
  const text = `peptide: ${"ACDEFGHIKLMNPQRSTVWY".repeat(3)}`, seq = (fieldSeq(text) as { seq: Seq }).seq, smiles = old.peptide.peptideSmiles(text)!;
  assert.equal(inchi((buildAtoms(seq) as { mol: Mol }).mol), inchi(smiles), "the same compound as 1.1.2's SMILES");
  const now: number[] = [], before: number[] = [];
  for (let k = 0; k < 3; k++) { now.push(time(() => buildAtoms(seq), 1)); before.push(time(() => old.chem.fullMol(smiles), 1)); }
  const a = now.sort((p, q) => p - q)[1], b = before.sort((p, q) => p - q)[1];
  assert.ok(a < 100 && a < b, `60-mer: ${a.toFixed(0)} ms here, ${b.toFixed(0)} ms in 1.1.2`);
});

// 40 paclitaxels, as the other speed checks draw them.
const taxol = chem.indigoLayout("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C");
const taxols: Mol = { atoms: [], bonds: [] };
for (let k = 0; k < 40; k++) {
  const b = taxols.atoms.length;
  taxols.atoms.push(...taxol.atoms.map((a) => ({ ...a, location: [a.location[0] + 20 * (k % 8), a.location[1] + 20 * Math.floor(k / 8), 0] as [number, number, number] })));
  taxols.bonds.push(...taxol.bonds.map((x) => ({ ...x, atoms: [x.atoms[0] + b, x.atoms[1] + b] as [number, number] })));
}
const H30 = "PEPTIDE1{C.A.K.L.E.C.A.K.L.E.C.A.K.L.E.C.A.K.L.E.C.A.K.L.E.C.A.K.L.C}$PEPTIDE1,PEPTIDE1,1:R3-30:R3|PEPTIDE1,PEPTIDE1,6:R3-26:R3$$$V2.0";
await check("S10", "40 paclitaxels and one bridged 30-mer, Clean Up all: no slower than 1.1.2 on the paclitaxels; then a drag", () => {
  if (typeof old === "string") return old;
  const page = insertMol(taxols, atoms(H30), [0, -30]).mol;
  const here: number[] = [], before: number[] = [];
  for (let k = 0; k < 3; k++) { here.push(time(() => chem.cleanUp(taxols), 1)); before.push(time(() => old.chem.cleanUp(taxols), 1)); }
  const a = here.sort((p, q) => p - q)[1], b = before.sort((p, q) => p - q)[1];
  assert.ok(a <= b * 1.15 + 20, `Clean Up of 40 paclitaxels: ${a.toFixed(0)} ms here, ${b.toFixed(0)} ms in 1.1.2`);
  const cleaned = chem.cleanUp(page);
  assert.equal(inchi(cleaned), inchi(page), "Clean Up keeps every compound");
  assert.equal(brackets(cleaned).length, 2, "the 30-mer keeps its two brackets");
  const drag = time(() => problems({ ...cleaned, atoms: cleaned.atoms.map((x, i) => (i < 60 ? { ...x, location: [x.location[0] + 0.3, x.location[1], 0] as [number, number, number] } : x)) }), 3);
  assert.ok(drag < 200, `a drag's structure check: ${drag.toFixed(0)} ms`);
});

await check("S11", "Unknown codes: [Zzz] in HELM and the field, X in the field: each its problem, nothing drawn", () => {
  assert.deepEqual(parseHelm("PEPTIDE1{A.[Zzz].C}$$$$V2.0"), { problem: "Octet does not know the HELM monomer [Zzz]." });
  assert.deepEqual(fieldSeq("peptide: A[Zzz]C"), { problem: "Not a monomer: [Zzz]" });
  assert.deepEqual(fieldSeq("peptide: AXC"), { problem: "Not an amino acid: X" });
  for (const t of ["PEPTIDE1{A.[Zzz].C}$$$$V2.0", "peptide: A[Zzz]C", "peptide: AXC"]) assert.ok(seqBuilt({ build: t, labels: false }) && "problem" in seqBuilt({ build: t, labels: false })!, `${t}: nothing drawn`);
});

const units = (n: number) => Array.from({ length: n }, () => "A").join(".");
const HOSTILE: [string, RegExp][] = [
  [`PEPTIDE1{${"A.".repeat(10_001)}A}$$$$`, /20,000 characters/],
  [`PEPTIDE1{${units(2000)}}$$$$`, /1,000 monomers/],
  [`PEPTIDE1{A.[${"(".repeat(33)}C${")".repeat(33)}].A}$$$$`, /nested too deep/],
  ["PEPTIDE1{C.A.C}$PEPTIDE1,PEPTIDE1,99999:R3-3:R3$$$", /no unit 99999/],
  ["PEPTIDE1{C.A.C}$PEPTIDE1,PEPTIDE1,1:R9-3:R3$$$", /not R9/],
  ["PEPTIDE1{C.A.C}$PEPTIDE1,PEPTIDE1,1:R3-1:R3$$$", /to itself/],
  ["PEPTIDE1{C.A.C}$PEPTIDE1,PEPTIDE1,2:R3-3:R3$$$", /has no R3/],
  ["PEPTIDE1{C.A.C}$PEPTIDE1,PEPTIDE1,3:R1-1:R3$$$", /two links at R1/],
  ["PEPTIDE1{C.A.C.C}$PEPTIDE1,PEPTIDE1,1:R3-3:R3|PEPTIDE1,PEPTIDE1,1:R3-4:R3$$$", /two links at R3/],
  ["PEPTIDE1{C.A.C}$PEPTIDE7,PEPTIDE1,1:R3-3:R3$$$", /PEPTIDE7 is not defined/],
  ["CHEM1{[PEG2]}$$$$", /CHEM or BLOB/],
  ["PEPTIDE1{A.C}$$$$$$$", /too many \$ sections/],
  ["PEPTIDE1{A.C$$$$", /does not pair up/],
  ["PEPTIDE1{A.\u0000C}$$$$", /not text/],
  ["PEPTIDE1{A.<script>alert(1)</script>}$$$$", /does not know the HELM monomer/],
];
await check("S12", "Hostile HELM: each a short problem in under 20 ms, quoting at most 40 characters, through parse, the field, paste and the worker", () => {
  for (const [h, want] of HOSTILE) {
    for (const [how, run] of [["parse", () => parseHelm(h)], ["field", () => fieldSeq(h)], ["paste", () => readSequence(h)], ["worker", () => seqBuilt({ build: h, labels: true })]] as const) {
      let r: unknown;
      const ms = time(() => { r = run(); }, 3);
      assert.ok(r && typeof r === "object" && "problem" in r, `${how} ${h.slice(0, 30)}: refused (${JSON.stringify(r)?.slice(0, 80)})`);
      const p = (r as { problem: string }).problem;
      if (how === "parse") assert.match(p, want, h.slice(0, 40));
      assert.ok(p.length < 140 && !/A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A\.A/.test(p) && !p.includes("\u0000"), `${how}: short, quoted briefly: ${p.slice(0, 80)}`);
      assert.ok(ms < 20, `${how} ${h.slice(0, 30)}: ${ms.toFixed(1)} ms`);
    }
  }
});

await check("S13", "D-amino acids: HELM and the field give the same; labels D-Phe, D-Trp; FASTA FWKT; the hands inverted", () => {
  const a = (fieldSeq("peptide: [dF][dW]KT") as { seq: Seq }).seq;
  assert.deepEqual(a, seqOfHelm(S.dAmino), "the same sequence");
  const m = atoms(S.dAmino), l = labels(S.dAmino);
  assert.equal(inchi(m), inchi(SMILES.dAmino), "D-Phe and D-Trp, with L-Lys and L-Thr");
  assert.deepEqual(l.atoms.filter((x) => x.inner).map((x) => x.text), ["D-Phe", "D-Trp", "Lys", "Thr"]);
  assert.equal(toFasta(m), "FWKT");
  assert.equal(toFasta(l), "FWKT");
  const d = inchi(m)!, ll = inchi(atoms("PEPTIDE1{F.W.K.T}$$$$V2.0"))!;
  assert.ok(d.split("/t")[0] === ll.split("/t")[0] && d !== ll, "the same atoms, other hands");
  for (const k of ["dA", "dC", "dD", "dE", "dF", "dH", "dK", "dL", "dM", "dN", "dP", "dQ", "dR", "dS", "dV", "dW", "dY"]) {
    const x = atoms(`PEPTIDE1{G.[${k}].G}$$$$V2.0`), y = atoms(`PEPTIDE1{G.${k[1]}.G}$$$$V2.0`), ix = inchi(x)!, iy = inchi(y)!;
    assert.ok(ix !== iy && ix.split("/t")[0] === iy.split("/t")[0], `[${k}] is the mirror of ${k[1]} at its α carbon`);
    assert.equal(toHelm(x), `PEPTIDE1{G.[${k}].G}$$$$V2.0`, `[${k}] HELM back`);
  }
});

await check("S14", "RNA and DNA, one and two polymers, with phosphate ends: as 1.1.2 for one; two chains drawn as two; HELM back", () => {
  for (const h of [S.rna, S.dna, S.twoNucleic, "RNA1{P.R(A)P.R(U)P}$$$$V2.0"]) {
    const m = atoms(h), l = labels(h);
    assert.equal(toHelm(m), h, `atoms: ${h}`);
    assert.equal(toHelm(l), h, `labels: ${h}`);
    assert.equal(inchi(l), inchi(m), `labels the same compound: ${h}`);
  }
  assert.equal(fragments(atoms(S.twoNucleic)).length, 2, "two polymers, two structures");
  if (typeof old !== "string") {
    for (const t of ["rna: pACGU", "dna: GATTACAp", "rna: ACGU"]) {
      const was = old.nucleic.nucleicText(t);
      assert.ok(was && "smiles" in was, `${t}: 1.1.2 reads it`);
      const now = seqBuilt({ build: t, labels: false }) as Mol;
      assert.equal(inchi(now), inchi((was as { smiles: string }).smiles), `${t}: the compound 1.1.2 drew`);
    }
  }
});

// A residue label expanded, as Structure > Expand Label draws one out (its kept atoms, each bond to its port).
const expandResidue = (m: Mol, text: string, nth = 0) => { const i = m.atoms.map((a, k) => [a, k] as const).filter(([a]) => a.text === text && a.inner)[nth][1]; return expandLabel(m, i, m.atoms[i].inner!); };

await check("S15", "HELM → atoms → HELM, → labels → HELM, → mixed → HELM: the same string (S1–S6, S13, S14)", () => {
  for (const [k, h] of Object.entries(S)) {
    const m = atoms(h), l = labels(h);
    assert.equal(toHelm(m), h, `${k}: atoms`);
    assert.equal(toHelm(l), h, `${k}: labels`);
    // Mixed: the second residue label drawn out.
    const second = l.atoms.filter((a) => a.inner && a.text)[1].text!, mixed = expandResidue(l, second);
    assert.equal(inchi(mixed), inchi(m), `${k}: mixed, the same compound`);
    assert.equal(toHelm(mixed), h, `${k}: mixed (${second} drawn out)`);
  }
});

// Octet with no window: the headless host and the MCP, as the other stress checks drive them.
const mcpReady = existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url));
const headless = mcpReady ? await import("../scripts/headless/host.ts") : undefined;
const mcp = mcpReady ? await import("./mcp.ts") : undefined;
if (headless) await headless.load();
let rpcId = 0;
type Reply = { result?: { content: { text?: string }[]; isError?: boolean; structuredContent?: any }; error?: { message: string } };
const ai = (d: { host: unknown }, who = "Stress") => async (name: string, args: unknown) => JSON.parse(await mcp!.handle(JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }), () => d.host as never, "1", headless!.session(who, `stress-${who}`))) as Reply;
const said = (r: Reply) => r.result?.content[0]?.text ?? r.error?.message ?? "";
const refused = (r: Reply) => !!(r.error || r.result?.isError);
const NO_MCP = "no OPSIN build (src/vendor/opsin), so Octet with no window does not load";
type Headless = ReturnType<NonNullable<typeof headless>["drawing"]>;
const docOf = (d: Headless) => d.host.doc();

await check("S16", "Undo and redo: draw S1, another sequence, Clean Up, the setting twice, a D-amino acid sequence: each one step; undo all empties; redo all gives it back", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "S16"), call = ai(d), states: Mol[] = [docOf(d)];
  const steps: [string, unknown][] = [
    ["draw", { kind: "structures", structures: [{ text: S.oxytocin }] }],
    ["draw", { kind: "structures", structures: [{ text: "peptide: CAAAAC" }] }],
    ["advanced", { tool: "run_command", args: { command: "clean_up" } }],
    ["advanced", { tool: "set_style", args: { sequences: "labels" } }],
    ["advanced", { tool: "set_style", args: { sequences: "atoms" } }],
    ["draw", { kind: "structures", structures: [{ text: "peptide: A[dF]C" }] }],
  ];
  for (const [tool, args] of steps) {
    const r = await call(tool, args);
    assert.ok(!refused(r), `${tool} ${JSON.stringify(args).slice(0, 60)}: ${said(r)}`);
    assert.notEqual(docOf(d), states[states.length - 1], `${JSON.stringify(args).slice(0, 60)}: changed the drawing`);
    states.push(docOf(d));
  }
  for (let k = steps.length - 1; k >= 0; k--) {
    assert.ok(d.host.command("undo"), `undo ${k}`);
    assert.deepEqual(docOf(d), states[k], `undo of step ${k + 1} gives the drawing before it`);
  }
  assert.equal(docOf(d).atoms.length, 0, "undo all: the empty page");
  for (let k = 1; k <= steps.length; k++) { d.host.command("redo"); assert.deepEqual(docOf(d), states[k], `redo of step ${k}`); }
});

// The editor's copy and paste: Octet's own copy is the part serialized (file.ts), read back and inserted (Editor.tsx
// copyOut and pasteOwn).
const editorSource = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
const copyOf = (part: Mol) => serialize({ ...part, style: DEFAULT_STYLE });
const pasteInto = (doc: Mol, json: string) => insertMol(doc, parse(json), [0, -20]).mol;
await check("S17", "Copy a bridged label chain to another drawing, paste: the same picture, the bracket kept, HELM the same", () => {
  assert.match(editorSource, /octetJson = serialize\(\{ \.\.\.part, style, \.\.\.\(carried\.length \? \{ monomers: carried \} : \{\}\) \}\)/, "the editor's copy is the part as a file");
  const h = "PEPTIDE1{C.[dF].Y.C.A}$PEPTIDE1,PEPTIDE1,1:R3-4:R3$$$V2.0", l = labels(h);
  const there = pasteInto({ atoms: [], bonds: [] }, copyOf(l));
  assert.equal(brackets(there).length, 1, "the bracket kept");
  assert.equal(toHelm(there), h, "Copy As HELM the same there");
  assert.equal(inchi(there), inchi(l));
});

await check("S18", "Save insulin as .oct, CDXML and CDX, open each, and in Octet 1.1.2: the same InChI; brackets in .oct and CDX, straight in CDXML", () => {
  const m = atoms(S.insulin), want = inchi(m), style = DEFAULT_STYLE;
  const oct = readOct(writeOct(m, style), true).mol, xml = fromCdxml(toCdxml(m, style)).mol, cdx = readCdx(writeCdx(m, style)).mol;
  for (const [how, back] of [[".oct", oct], ["CDXML", xml], ["CDX", cdx]] as const) assert.equal(inchi(back), want, `${how}: the same compound`);
  assert.equal(brackets(oct).length, 1, ".oct keeps the bracket");
  assert.equal(brackets(cdx).length, 1, "CDX keeps the bracket");
  assert.equal(brackets(xml).length, 0, "CDXML draws it straight");
  const l = labels(S.insulin);
  for (const [how, back] of [[".oct", readOct(writeOct(l, style), true).mol], ["CDXML", fromCdxml(toCdxml(l, style)).mol], ["CDX", readCdx(writeCdx(l, style)).mol]] as const) {
    assert.equal(inchi(back), want, `labels ${how}: the same compound`);
    assert.equal(toHelm(back), S.insulin, `labels ${how}: HELM back`);
  }
  if (typeof old === "string") return old;
  for (const [how, back] of [[".oct", old.readOct(writeOct(m, style), true).mol], ["CDXML", old.readOct(toCdxml(m, style)).mol], ["CDX", old.readCdx(writeCdx(m, style)).mol], ["the clipboard", old.parse(serialize({ ...m, style }))], ["labels .oct", old.readOct(writeOct(l, style), true).mol]] as const) {
    assert.equal(inchi(back), want, `1.1.2 ${how}: the same compound`);
    assert.ok(back.bonds.every((b: Mol["bonds"][number]) => b.route === undefined), `1.1.2 ${how}: straight`);
  }
});

await check("S20", "Rotate oxytocin 37°, flip it both ways, 25% and 800%, dark: the bracket turns and mirrors, clears the labels, is hit on each line, draws in the ink", () => {
  for (const how of ["atoms", "labels"] as const) {
    const m0 = how === "atoms" ? atoms(S.oxytocin) : labels(S.oxytocin), all = new Set(m0.atoms.map((_, i) => i));
    for (const [name, m] of [["turned", rotateAtoms(m0, all, 37)], ["flipped across", flipAtoms(m0, all, "horizontal")], ["flipped down", flipAtoms(m0, all, "vertical")], ["turned and flipped", flipAtoms(rotateAtoms(m0, all, 37), all, "horizontal")]] as const) {
      assert.equal(inchi(m), inchi(m0), `${how} ${name}: the same compound`);
      const [[b, k]] = brackets(m), path = pathOf(m, b);
      for (let n = 1; n < 4; n++) assert.equal(bondAt(m, [(path[n - 1][0] + path[n][0]) / 2, (path[n - 1][1] + path[n][1]) / 2]), k, `${how} ${name}: hit on line ${n}`);
      clears(m, `${how} ${name}`);
      labelsClear(m, `${how} ${name}`);
      for (const z of [0.25, 1, 8]) {
        const d = render(m, STYLE, INK, z), mine = d.polygons.filter((_, n) => d.owners?.[n] === k);
        assert.ok(mine.length > 0, `${how} ${name} at ${z * 100}%: the bracket is drawn`);
        assert.ok(mine.every((poly) => poly.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]))), `${how} ${name} at ${z * 100}%: finite`);
        assert.ok(d.polygons.every((_, n) => d.owners?.[n] !== k || d.colours[n] === undefined), `${how} ${name}: in the ink colour (so dark mode draws it light)`);
        void d;
      }
    }
    const red = { ...m0, bonds: m0.bonds.map((b) => (bracketOf(b) ? { ...b, colour: "#C0392B" } : b)) }, [[, k]] = brackets(red), d = render(red, STYLE, INK);
    assert.ok(d.polygons.some((_, n) => d.owners?.[n] === k && d.colours[n] === "#C0392B"), `${how}: a coloured bracket draws in its colour`);
  }
});

await check("S21", "Delete Cys6's label (labels), one S (atoms), the bracket: the link goes with what needs it, the rest stays, Clean Up lays out unbridged, HELM has no connection", () => {
  const l = labels(S.oxytocin), cys = l.atoms.flatMap((a, i) => (a.text === "Cys" ? [i] : []));
  const noCys6 = erase(l, new Set(), new Set([cys[1]]));
  assert.equal(brackets(noCys6).length, 0, "labels: the bracket went with Cys6");
  assert.ok(!/\$PEPTIDE/.test(toHelm(noCys6) ?? ""), `labels: HELM has no connection (${toHelm(noCys6)})`);
  assert.equal(fragments(noCys6).length, 2, "labels: the two halves stay");
  const m = atoms(S.oxytocin), s = m.atoms.findIndex((a) => a.label === "S"), noS = erase(m, new Set(), new Set([s]));
  const cleaned = chem.cleanUp(noS);
  assert.equal(brackets(cleaned).length, 0, "atoms: Clean Up, no bracket left");
  assert.ok(!/\$PEPTIDE/.test(toHelm(cleaned) ?? ""), `atoms: no connection (${toHelm(cleaned)})`);
  const [[, k]] = brackets(m), noBracket = chem.cleanUp(erase(m, new Set([k]), new Set()));
  assert.equal(toHelm(noBracket), "PEPTIDE1{C.Y.I.Q.N.C.P.L.G.[am]}$$$$V2.0", "the bracket bond deleted: the chain with no link");
  assert.equal(brackets(noBracket).length, 0);
  noCrossings(noBracket, "unbridged, cleaned up");
});

await check("S22", "Bond tool: Ala to Ala a notice and no change; Cys to an atom of another structure joins by its S; Lys by its N; Asp says to expand", () => {
  let told = "";
  labelHooks.link = (m, i, j) => { const r = linkResidues(m, i, j); if (r && "problem" in r) { told = r.problem; return m; } return r; };
  try {
    const ala = labels("PEPTIDE1{A.A.A.A}$$$$V2.0"), a = ala.atoms.flatMap((x, i) => (x.text === "Ala" ? [i] : []));
    assert.equal(dragBond(ala, a[1], at(ala, a[3])), ala, "no change");
    assert.equal(told, "Ala has no free link. Expand the label to bond to its atoms.");
    for (const [code, el] of [["C", "S"], ["K", "N"]] as const) {
      const l = labels(`PEPTIDE1{A.${code}.A}$$$$V2.0`), r = l.atoms.findIndex((x) => x.inner && x.text !== "Ala"), two: Mol = { ...l, atoms: [...l.atoms, { label: "C", location: [0, 10, 0] }] };
      const joined = dragBond(two, r, [0, 10]);
      assert.equal(fragments(joined).length, 1, `${code}: joined`);
      const ex = chem.expandWithOrigins(joined).mol, c = ex.atoms.findIndex((x, i) => x.label === "C" && ex.bonds.filter((b) => b.atoms.includes(i)).length === 1 && ex.bonds.some((b) => b.atoms.includes(i) && ex.atoms[b.atoms[0] === i ? b.atoms[1] : b.atoms[0]].label === el));
      assert.ok(c >= 0, `${code}: the methyl on its ${el}`);
    }
    told = "";
    const asp = labels("PEPTIDE1{A.D.A}$$$$V2.0"), dIdx = asp.atoms.findIndex((x) => x.text === "Asp"), two: Mol = { ...asp, atoms: [...asp.atoms, { label: "C", location: [0, 10, 0] }] };
    assert.equal(dragBond(two, dIdx, [0, 10]), two, "Asp to an atom: no change");
    assert.match(told, /Asp has no free link/);
  } finally { labelHooks.link = undefined; }
});

await check("S23", "Typing a 1,000-character HELM one key at a time: each key's read under 16 ms; never an exception", () => {
  const h = `PEPTIDE1{${Array.from({ length: 160 }, (_, k) => "CYIQNPLG"[k % 8]).join(".")}}$PEPTIDE1,PEPTIDE1,1:R3-6:R3|PEPTIDE1,PEPTIDE1,9:R3-14:R3$$$V2.0`.slice(0, 1000);
  let worst = 0;
  for (let n = 1; n <= h.length; n++) {
    const t = h.slice(0, n), t0 = performance.now(), r = fieldSeq(t);
    if (r && "seq" in r) seqProblem(r.seq, false);
    worst = Math.max(worst, performance.now() - t0);
  }
  assert.ok(worst < 16, `the slowest key: ${worst.toFixed(1)} ms`);
});

await check("S24", "MCP: draw insulin by HELM; set_style labels then atoms; read helm", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "S24"), call = ai(d);
  let r = await call("draw", { kind: "structures", structures: [{ text: S.insulin }] });
  assert.ok(!refused(r), said(r));
  assert.equal(said(await call("read", { format: "helm" })), S.insulin, "read helm");
  r = await call("advanced", { tool: "set_style", args: { sequences: "labels" } });
  assert.ok(!refused(r) && docOf(d).atoms.every((a) => a.inner || a.text || a.label === "H"), `labels: ${said(r)}`);
  assert.equal(said(await call("read", { format: "helm" })), S.insulin, "read helm as labels");
  r = await call("advanced", { tool: "set_style", args: { sequences: "atoms" } });
  assert.equal(chem.analyse(docOf(d))?.[0]?.formula, "C257H383N65O77S6", "atoms again: insulin");
});

await check("S25", "Two AI sessions on one drawing: both draw oxytocin: two oxytocins, each one step", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "S25"), one = ai(d, "One"), two = ai(d, "Two");
  const before = docOf(d);
  await Promise.all([one("draw", { kind: "structures", structures: [{ text: S.oxytocin }] }), two("draw", { kind: "structures", structures: [{ text: S.oxytocin }] })]);
  assert.equal(fragments(docOf(d)).length, 2, "two oxytocins");
  assert.equal(inchi(fragments(docOf(d)).length === 2 ? pickAtoms(docOf(d), fragments(docOf(d))[0]) : docOf(d)), inchi(SMILES.oxytocin), "oxytocin");
  d.host.command("undo"); d.host.command("undo");
  assert.deepEqual(docOf(d), before, "two undos: the drawing before them (each draw one step)");
});

await check("S27", "Empty and odd: 'peptide: ' nothing; 'peptide: []', 'PEPTIDE1{}', '$$$$' a short problem or not a sequence; a one-letter FASTA one residue", () => {
  assert.equal(fieldSeq("peptide: "), undefined);
  assert.deepEqual(fieldSeq("peptide: []"), { problem: "Not a monomer: []" });
  assert.deepEqual(parseHelm("PEPTIDE1{}$$$$V2.0"), { problem: "PEPTIDE1 has no monomers." });
  assert.equal(parseHelm("$$$$"), undefined);
  assert.deepEqual(readSequence(">x\nW"), { text: "peptide: W" });
  const w = seqBuilt({ build: "peptide: W", labels: false }) as Mol;
  assert.equal(inchi(w), inchi("N[C@@H](Cc1c[nH]c2ccccc12)C(=O)O"), "one tryptophan");
  // Drawn as atoms it is tryptophan, a small molecule (N28, and Octet 1.1.2 reads a chain from three residues); as a
  // residue label it is a sequence and copies back.
  assert.equal(toHelm(w), undefined, "as atoms, no HELM");
  const wl = seqBuilt({ build: "peptide: W", labels: true }) as Mol;
  assert.equal(toFasta(wl), "W", "as a label it copies back as FASTA");
  assert.equal(toHelm(wl), "PEPTIDE1{W}$$$$V2.0", "and as HELM");
});

await check("S28", "A chain with a phospho-Ser drawn by hand, to Residue labels: it stays in full in the row, the rest labels, InChI the same, HELM inline SMILES", () => {
  const hand = chem.cleanUp(chem.parseStructure("N[C@@H](C)C(=O)N[C@@H](COP(=O)(O)O)C(=O)N[C@@H](CS)C(=O)NCC(=O)O"));
  const l = withSequences(hand, "labels", []);
  assert.equal(inchi(l), inchi(hand), "the same compound");
  assert.deepEqual(l.atoms.filter((a) => a.inner).map((a) => a.text), ["Ala", "Cys", "Gly"]);
  assert.equal(l.atoms.filter((a) => !a.inner && !a.text && a.label !== "H").length, 10, "the phospho-Ser's ten atoms in full");
  assert.match(toHelm(l)!, /^PEPTIDE1\{A\.\[[^\]]*P\(=O\)[^\]]*\[\*:1\][^\]]*\]\.C\.G\}\$\$\$\$V2\.0$|^PEPTIDE1\{A\.\[.*\]\.C\.G\}\$\$\$\$V2\.0$/, "inline SMILES");
  assert.equal(toHelm(l), toHelm(hand), "the same HELM as drawn in full");
  apart(l, "the mixed row", 0.3);
});

// ==================================================================================================================
// Our own cases
// ==================================================================================================================
// The number of C=O and C=N double bonds a structure draws (a tautomer shows here, not in its InChI).
const doubles = (m: Mol) => { const e = chem.expandLabels(m), el = (i: number) => e.atoms[i].label, n = { CO: 0, CN: 0 }; for (const b of e.bonds) if (b.type === 2) { const p = [el(b.atoms[0]), el(b.atoms[1])].sort().join(""); if (p === "CO") n.CO++; if (p === "CN") n.CN++; } return n; };

await check("N2", "Copy As HELM of residues Octet does not know (N-methyl Gln, Boc, formyl, pyroGlu): pasted back, they draw C=O as drawn, not the iminol C(OH)=N", () => {
  const wrong: string[] = [];
  for (const [name, smiles] of [
    ["N-methyl Gln", "N[C@@H](C)C(=O)N[C@@H](CCC(=O)NC)C(=O)N[C@@H](C)C(=O)O"],
    ["Boc-Ala-Ala-Ala", "CC(C)(C)OC(=O)N[C@@H](C)C(=O)N[C@@H](C)C(=O)N[C@@H](C)C(=O)O"],
    ["formyl-Met-Leu-Phe", "O=CN[C@@H](CCSC)C(=O)N[C@@H](CC(C)C)C(=O)N[C@@H](Cc1ccccc1)C(=O)O"],
    ["pyroGlu-His-Pro-NH2", "O=C1CC[C@@H](N1)C(=O)N[C@@H](Cc1c[nH]cn1)C(=O)N1CCC[C@H]1C(N)=O"],
  ] as const) {
    const hand = chem.cleanUp(chem.parseStructure(smiles)), h = toHelm(hand)!;
    assert.ok(h, `${name}: some HELM`);
    if (JSON.stringify(doubles(atoms(h))) !== JSON.stringify(doubles(hand))) wrong.push(`${name} ${h.slice(0, 70)}`);
  }
  assert.equal(wrong.length, 0, `drawn back as another tautomer: ${wrong.join("; ")}`);
});

// Indigo's SMILES depends on the atoms' order, which the monomer's own SMILES sets, so the two drawings are compared
// by canonicalSmiles: one string for one structure with its hydrogens where they are drawn (the tautomer too).
await check("N3", "HELM → drawing → HELM → drawing: the second drawing is the first (the same tautomer, not just the same standard InChI)", () => {
  for (const h of ["PEPTIDE1{A.[[*:1]NC(CC(N)=O)C(=O)[*:2]].A}$$$$V2.0", "PEPTIDE1{A.[[*:1]N[C@@H](CCC(=O)NC)C(=O)[*:2]].A}$$$$V2.0"]) {
    const first = atoms(h), again = atoms(toHelm(first)!);
    assert.equal(chem.canonicalSmiles(again), chem.canonicalSmiles(first), `${h.slice(0, 50)}: drawn the same after Copy As HELM and paste`);
  }
});

// The chain reader finds residues by their N–C–C(=O) backbone, so a monomer of another shape would come back as
// another sequence: it is refused when read, and Copy As HELM never writes what Octet cannot read back.
await check("N4", "An inline monomer that is no α-amino acid ([*:1]O[*:2], a β-amino acid): refused with a problem, as atoms and as labels", () => {
  for (const h of ["PEPTIDE1{A.[[*:1]O[*:2]].A}$$$$V2.0", "PEPTIDE1{A.[[*:1]NCCC(=O)[*:2]].A}$$$$V2.0", "PEPTIDE1{A.[[*:1]C(C)C(=O)[*:2]].A}$$$$V2.0"]) {
    for (const labels of [false, true]) {
      const r = seqBuilt({ build: h, labels });
      assert.ok(r && "problem" in r && /α-amino acid/.test(r.problem), `${h} (${labels ? "labels" : "atoms"}): ${JSON.stringify(r)?.slice(0, 80)}`);
    }
  }
  for (const h of ["PEPTIDE1{A.[[*:1]NC(C)(C)C(=O)[*:2]].A}$$$$V2.0", "PEPTIDE1{[CC(C)(C)OC(=O)N[C@@H](C)C(=O)[*:2]].A.A}$$$$V2.0", "PEPTIDE1{A.A.[[*:1]N[C@@H](Cc1ccccc1)C(=O)OC]}$$$$V2.0"]) {
    const m = atoms(h), back = toHelm(m);
    assert.equal(inchi(atoms(back!)), inchi(m), `${h.slice(0, 50)}: Copy As HELM (${back}) is the compound drawn`);
  }
});

await check("N5", "Degenerate inline monomers ([*:1][*:2], R on R) give a problem, never an exception, wherever a sequence is built", () => {
  for (const h of ["PEPTIDE1{A.[[*:1][*:2]].A}$$$$V2.0", "PEPTIDE1{[[*:1][*:2]]}$$$$V2.0", "PEPTIDE1{A.[[*:1][*:2][*:3]].C}$PEPTIDE1,PEPTIDE1,2:R3-3:R3$$$V2.0"]) {
    for (const labels of [false, true]) {
      let r: unknown;
      assert.doesNotThrow(() => { r = seqBuilt({ build: h, labels }); }, `${h} (${labels ? "labels" : "atoms"}): an exception`);
      assert.ok(r && typeof r === "object" && "problem" in r, `${h}: a problem the field can show (${JSON.stringify(r)?.slice(0, 60)})`);
    }
  }
});

// The plan reads two chains in one structure (J3, J6: more than two get the layout 1.1.2 makes). With three, the third
// chain is read as part of a residue of the second, written as its own SMILES: the HELM is the same compound.
await check("N6", "Three chains joined by links: HELM out is the same compound, from atoms and from labels", () => {
  const h = "PEPTIDE1{C.A.C}|PEPTIDE2{C.A.C}|PEPTIDE3{C.A.C}$PEPTIDE1,PEPTIDE2,1:R3-1:R3|PEPTIDE2,PEPTIDE3,3:R3-3:R3$$$V2.0";
  for (const [how, m] of [["atoms", atoms(h)], ["labels", labels(h)]] as const) {
    const back = toHelm(m);
    assert.ok(back, `${how}: some HELM`);
    assert.equal(inchi(atoms(back!)), inchi(m), `${how}: ${back!.slice(0, 60)} is the compound drawn`);
  }
});

await check("N7", "Residue labels of a 20,000-character HELM of distinct inline monomers: refused like 1,000 atoms in full, not a 10,000-atom structure in half a second", () => {
  const units = Array.from({ length: 400 }, (_, k) => `[[*:1]NC(${"C".repeat(1 + (k % 20))}${"N".repeat((Math.floor(k / 20) % 20) + 1)})C(=O)[*:2]]`), h = `PEPTIDE1{${units.join(".")}}$$$$V2.0`;
  assert.ok(h.length <= MOST_TEXT, "within the HELM limit");
  const t = performance.now(), r = seqBuilt({ build: h, labels: true }), ms = performance.now() - t;
  assert.ok(r && "problem" in r, `refused (${r && "atoms" in r ? `${r.atoms.length} atoms` : JSON.stringify(r)}, ${ms.toFixed(0)} ms)`);
});

await check("N10", "The field's size problem agrees with the builder: 115 Glu says 'Up to 1,000 atoms' under the field, not only after Return", () => {
  for (const [code, n] of [["E", 115], ["D", 125], ["W", 70], ["A", 140]] as const) {
    const seq = (fieldSeq(`peptide: ${code.repeat(n)}`) as { seq: Seq }).seq, field = seqProblem(seq, false), built = buildAtoms(seq);
    assert.equal(!!field, "problem" in built, `${n} × ${code}: the field says ${JSON.stringify(field)}, the builder ${"problem" in built ? JSON.stringify(built.problem) : `${built.mol.atoms.length} atoms`}`);
  }
});

// A messy page: 40 peptides of four kinds, 160 small molecules, a peptide with a drug on its Cys, and a stray label.
const SMALL = ["c1ccccc1", "CCO", "CC(=O)Oc1ccccc1C(=O)O", "CN1CCC[C@H]1c1cccnc1", "O=C(O)C[C@@H](N)C(=O)O", "C1CCCCC1", "NCC(=O)O", "CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O", "OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O", "Cn1cnc2c1c(=O)n(C)c(=O)n2C"];
function messyPage(): Mol {
  let page: Mol = { atoms: [], bonds: [] };
  const peptides = [S.oxytocin, S.insulinA, "PEPTIDE1{A.C.D.E.F.G.H.I.K.L.M.N}$$$$V2.0", S.cyclic];
  for (let k = 0; k < 40; k++) page = insertMol(page, atoms(peptides[k % 4]), [40 * (k % 5), -30 * Math.floor(k / 5)]).mol;
  for (let k = 0; k < 160; k++) page = insertMol(page, chem.indigoLayout(SMALL[k % SMALL.length]), [220 + 10 * (k % 16), -12 * Math.floor(k / 16)]).mol;
  page = insertMol(page, chem.cleanUp(chem.parseStructure("N[C@@H](CSSc1ccc(cc1)C(=O)O)C(=O)N[C@@H](C)C(=O)N[C@@H](C)C(=O)O")), [0, 60]).mol;
  return page;
}
await check("N11", "A messy 200-structure page to Residue labels and back: chains change, nothing else moves, every compound the same, in a few seconds", () => {
  // (The peptide with a drug on its Cys is N21's case.)
  const page = messyPage(), small = (m: Mol) => fragments(m).filter((f) => f.length < 40 && !f.some((i) => m.atoms[i].inner || m.atoms[i].label === "S")).map((f) => JSON.stringify(pickAtoms(m, f))).sort();
  let t = performance.now();
  const l = withSequences(page, "labels", []);
  const toLabels = performance.now() - t;
  t = performance.now();
  const back = withSequences(l, "atoms", []);
  const toAtoms = performance.now() - t;
  assert.equal(inchi(l), inchi(page), "labels: every compound the same");
  assert.equal(inchi(back), inchi(page), "back: every compound the same");
  const was = new Set(small(page)), gone = small(page).length - small(l).filter((x) => was.has(x)).length;
  assert.equal(gone, 0, `labels: ${gone} of the ${small(page).length} small molecules redrawn (the free amino acids: N28)`);
  assert.equal(fragments(l).length, fragments(page).length, "each structure still one");
  assert.ok(toLabels < 5000 && toAtoms < 5000, `${toLabels.toFixed(0)} ms to labels, ${toAtoms.toFixed(0)} ms back`);
  assert.equal(toHelm(back), toHelm(page), "HELM of the page the same");
});

await check("N12", "Hostile .oct: damaged brackets refused or ignored, a truncated file says so", () => {
  const m = atoms(S.oxytocin), good = serialize(m), k = m.bonds.findIndex((b) => bracketOf(b)), r = m.bonds[k].route!;
  for (const bad of ['"x"', "1e9", "-1001", "null", "true", "[1]"]) assert.throws(() => parse(good.replace(`"route": ${r}`, `"route": ${bad}`)), /damaged/, `route ${bad}`);
  const double = parse(good.replace(/"type": 1,(\s*)"route"/, '"type": 2,$1"route"'));
  assert.equal(brackets(double).length, 0, "a bracket on a double bond is not drawn");
  const json = JSON.parse(good);
  json.structure.bonds[k].__proto__ = { polluted: true };
  assert.doesNotThrow(() => parse(JSON.stringify(json)));
  assert.equal(({} as Record<string, unknown>).polluted, undefined, "no prototype pollution");
  for (const cut of [10, good.length >> 1, good.length - 3]) assert.throws(() => parse(good.slice(0, cut)), /not an Octet drawing/, `cut at ${cut}`);
  const lab = serialize(labels(S.oxytocin));
  assert.match(lab, /"ports": \[\s*\d+,/);
  assert.throws(() => parse(lab.replace(/"ports": \[\s*(\d+),/, '"ports": [9999,')), /damaged/, "a port past the label's atoms");
});

await check("N13", "ChemDraw habits: HELM with links reversed and a line break; FASTA in lower case; X, B, Z, U, O; three-letter text not misread", () => {
  assert.equal(toHelm(atoms("PEPTIDE1{C.Y.I.Q.N.\nC.P.L.G.[am]}$PEPTIDE1,PEPTIDE1,6:R3-1:R3$$$V2.0")), S.oxytocin, "reversed link and a line break: Octet's form back");
  assert.deepEqual(readSequence(">sp|P01178|OXYT_HUMAN\ncyiqncplg"), { text: "peptide: CYIQNCPLG" });
  assert.deepEqual(fieldSeq("peptide: ACDXBZUO"), { problem: "Not amino acids: X, B, Z, U, O" });
  for (const t of ["H-Cys-Tyr-Ile-Gln-Asn-Cys-Pro-Leu-Gly-NH2", "cyclo(RGDfV)", "Cys-Tyr"]) assert.equal(readSequence(t), undefined, `${t}: not read as a sequence`);
  assert.deepEqual(readSequence("PEPTIDE1{C.Y}$$$$V2.0\r\n"), { text: "peptide: CY" }, "Windows line ends");
});

await check("N14", "Keyboard fuzz: 3,000 edits of the stress HELMs and words, typed into the field: never an exception, each read and build quick", () => {
  let seed = 27;
  const rand = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const alphabet = "PEPTIDERNA{}[]().|$,:-R123456789ACDEFGHIKLMNPQRSTVWY*@=#dacm \n";
  const bases = [...Object.values(S), "peptide: Ac-C[dF]IQN-NH2", "rna: pACGU", "PEPTIDE1{A.[[*:1]N[C@@H](C)C(=O)[*:2]].C}$$$$V2.0"];
  const thrown: string[] = [];
  let slowest = 0, slowText = "";
  for (let k = 0; k < 3000; k++) {
    let t = bases[rand(bases.length)];
    for (let e = 1 + rand(4); e > 0; e--) {
      const at = rand(t.length + 1), op = rand(3);
      t = op === 0 ? t.slice(0, at) + alphabet[rand(alphabet.length)] + t.slice(at) : op === 1 ? t.slice(0, at) + t.slice(at + 1) : t.slice(0, at) + alphabet[rand(alphabet.length)] + t.slice(at + 1);
    }
    const t0 = performance.now();
    try {
      const r = fieldSeq(t);
      readSequence(t);
      if (r && "seq" in r) { seqProblem(r.seq, false); seqBuilt({ build: t, labels: rand(2) === 1 }); }
    } catch (e) { thrown.push(`${JSON.stringify(t).slice(0, 70)}: ${String(e).slice(0, 60)}`); }
    const ms = performance.now() - t0;
    if (ms > slowest) { slowest = ms; slowText = t; }
  }
  assert.deepEqual(thrown.slice(0, 3), [], `${thrown.length} texts threw`);
  assert.ok(slowest < 500, `the slowest took ${slowest.toFixed(0)} ms: ${JSON.stringify(slowText).slice(0, 80)}`);
});

await check("N15", "AI app with odd arguments: problems say what is wrong (unknown code, too many monomers)", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "N15"), call = ai(d);
  const unknown = await call("draw", { kind: "structures", structures: [{ text: "peptide: A[Zzz]C" }] });
  assert.ok(refused(unknown), "nothing drawn");
  assert.match(said(unknown), /Not a monomer: \[Zzz\]|does not know the HELM monomer \[Zzz\]/, `the AI app is told why: ${said(unknown).slice(0, 120)}`);
  const big = await call("draw", { kind: "structures", structures: [{ text: `PEPTIDE1{${Array(1001).fill("A").join(".")}}$$$$V2.0` }] });
  assert.match(said(big), /1,000 monomers/, `the AI app is told why: ${said(big).slice(0, 120)}`);
});

await check("N16", "AI app draws a sequence while the drawing shows Residue labels: no warning that Octet does not know Cys, Tyr… (they are residue labels)", async () => {
  if (!headless) return NO_MCP;
  const d = headless.drawing("paper", "N16"), call = ai(d);
  await call("advanced", { tool: "set_style", args: { sequences: "labels" } });
  const r = await call("draw", { kind: "structures", structures: [{ text: S.oxytocin }] });
  assert.ok(!refused(r), said(r));
  assert.ok(docOf(d).atoms.some((a) => a.inner && a.text === "Cys"), "drawn as residue labels");
  assert.doesNotMatch(said(r), /does not know the label/, said(r).slice(0, 200));
});

await check("N17", "Octet 1.1.2 opens the new .oct (brackets, R3 ports, style.sequences, a D-amino acid label): no error, the same compound", () => {
  if (typeof old === "string") return old;
  const h = "PEPTIDE1{C.[dF].Y.C.A}$PEPTIDE1,PEPTIDE1,1:R3-4:R3$$$V2.0", l: Mol = { ...labels(h), style: { ...DEFAULT_STYLE, sequences: "labels" } }, m: Mol = atoms(h);
  for (const [how, x] of [["labels", l], ["atoms", m]] as const) {
    const back = old.readOct(writeOct(x, DEFAULT_STYLE), true).mol, clip = old.parse(serialize(x));
    assert.equal(inchi(back), inchi(x), `${how} .oct: the same compound in 1.1.2`);
    assert.equal(inchi(clip), inchi(x), `${how} clipboard: the same compound in 1.1.2`);
    assert.ok(back.bonds.every((b: Mol["bonds"][number]) => !("route" in b)), `${how}: straight in 1.1.2`);
    let cleaned: Mol | undefined;
    assert.doesNotThrow(() => { cleaned = old.chem.cleanUp(back); }, `${how}: 1.1.2's Clean Up`);
    assert.equal(inchi(cleaned!), inchi(x), `${how}: 1.1.2's Clean Up keeps the compound`);
    assert.doesNotThrow(() => old.helm.toHelm(back, old.chem.toInchi, old.chem.toSmiles), `${how}: 1.1.2's Copy As HELM`);
  }
});

await check("N18", "Bond tool over the bond between two neighbouring residue labels: the chemistry stays right (no N=N, no lost H)", () => {
  labelHooks.link = (m, i, j) => { const r = linkResidues(m, i, j); return r && "problem" in r ? m : r; };
  try {
    const ala = labels("PEPTIDE1{A.A.A.A}$$$$V2.0"), a = ala.atoms.flatMap((x, i) => (x.text === "Ala" ? [i] : [])), after = dragBond(ala, a[1], at(ala, a[2]));
    assert.equal(chem.analyse(after)?.[0]?.formula, chem.analyse(ala)?.[0]?.formula, `neighbours, the bond made ${JSON.stringify(after.bonds.find((b) => b.atoms.includes(a[1]) && b.atoms.includes(a[2])))} (1.1.2 does the same)`);
    assert.equal(after, ala, "no change");
  } finally { labelHooks.link = undefined; }
});

await check("N18b", "Bond tool over the bracket between two Cys labels: the chemistry stays right, the bracket stays a link", () => {
  labelHooks.link = (m, i, j) => { const r = linkResidues(m, i, j); return r && "problem" in r ? m : r; };
  try {
    const ox = labels(S.oxytocin), cys = ox.atoms.flatMap((x, i) => (x.text === "Cys" ? [i] : [])), over = dragBond(ox, cys[0], at(ox, cys[1]));
    assert.equal(chem.analyse(over)?.[0]?.formula, chem.analyse(ox)?.[0]?.formula, `the bond made ${JSON.stringify(over.bonds.find((b) => b.atoms.includes(cys[0]) && b.atoms.includes(cys[1])))}`);
  } finally { labelHooks.link = undefined; }
});

await check("N19", "Expand Label on a linked Cys keeps its link on the S; Contract Label back suggests Cys; HELM the same", () => {
  const l = labels(S.oxytocin), out = expandResidue(l, "Cys", 0);
  assert.equal(inchi(out), inchi(l));
  assert.equal(toHelm(out), S.oxytocin);
  const s = out.atoms.findIndex((a, i) => a.label === "S" && !a.inner && out.bonds.some((b) => b.atoms.includes(i) && b.ports));
  assert.ok(s >= 0, "the link bond on the S, its other end on the other Cys's port");
  const both = expandResidue(out, "Cys", 0);
  assert.equal(toHelm(both), S.oxytocin, "both drawn out");
  assert.equal(brackets(both).length, 1, "the bracket kept between the two S");
});

await check("N20", "Consistency: duplicate, scale, stretch, Clean Up keep the bracket; the check has no warning; messy is false after a build", () => {
  for (const how of ["atoms", "labels"] as const) {
    const m = how === "atoms" ? atoms(S.oxytocin) : labels(S.oxytocin), all = new Set(m.atoms.map((_, i) => i));
    const dup = duplicateSelection(m, all, new Set()) as unknown as { mol?: Mol } & Mol, two = (dup.mol ?? dup) as Mol;
    assert.equal(brackets(two).length, 2, `${how}: duplicate, two brackets`);
    assert.equal(toHelm(two)?.match(/PEPTIDE\d+\{/g)?.length, 2, `${how}: two polymers (${toHelm(two)})`);
    const big = scaleSizes(m, 2);
    assert.equal(brackets(big).length, 1, `${how}: scaled`);
    const stretched = transformParts(m, all, new Set(), ([x, y]) => [x * 1.5, y]);
    assert.equal(brackets(stretched).length, 1, `${how}: stretched`);
    assert.equal(brackets(chem.cleanUp(stretched)).length, 1, `${how}: stretched then Clean Up`);
    assert.deepEqual(problems(m).map((p) => p.message), [], `${how}: no warning`);
    if (how === "atoms") assert.equal(messy(m), false, `${how}: not messy, so Clean Up is not offered`);
  }
});

// The plan's J9: a residue Octet has no label for stays in full in its row (S28). The Cys with the aryl on its S is
// one such residue, so the setting draws Ala–Ala–Ala as labels beside it, and the compound stays the same.
await check("N21", "A peptide joined to a small molecule by its Cys S (a conjugate): HELM and FASTA do not fail, Clean Up keeps it, the setting keeps the modified Cys in full", () => {
  const conj = chem.cleanUp(chem.parseStructure("N[C@@H](CSSc1ccc(cc1)C(=O)O)C(=O)N[C@@H](C)C(=O)N[C@@H](C)C(=O)N[C@@H](C)C(=O)O"));
  assert.doesNotThrow(() => { toHelm(conj); toFasta(conj); });
  assert.equal(inchi(chem.cleanUp(conj)), inchi(conj));
  const l = withSequences(conj, "labels", []);
  assert.equal(inchi(l), inchi(conj), "the same compound either way");
  assert.deepEqual(l.atoms.filter((a) => a.inner).map((a) => a.text), ["Ala", "Ala", "Ala"], "the known residues as labels");
  assert.ok(l.atoms.some((a) => a.label === "S" && !a.inner), "the modified Cys in full");
  assert.equal(inchi(withSequences(l, "atoms")), inchi(conj), "and back to atoms");
});

await check("N22", "Near the limit: 110 residues in full build in under a second along one straight backbone; one past says why", () => {
  const codes = "ACDEFGHIKLMNPQRSTVWY".repeat(6).slice(0, 110), seq = (fieldSeq(`peptide: ${codes}`) as { seq: Seq }).seq, ms = time(() => buildAtoms(seq), 1), b = buildAtoms(seq);
  assert.ok(!("problem" in b), `110 residues: ${"problem" in b ? b.problem : ""}`);
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
  const m = (b as { mol: Mol }).mol;
  assert.ok(m.atoms.length <= MOST_BUILT_ATOMS);
  const ys = backboneYs(m);
  assert.ok(new Set(ys.map((y) => Math.round(y * 20))).size <= 3, "one straight backbone");
  const w = (fieldSeq(`peptide: ${"W".repeat(80)}`) as { seq: Seq }).seq;
  assert.ok("problem" in buildAtoms(w), "80 Trp: too many atoms");
});

// The plan (J5, cut list): over 40 residues a chain is in rows of 10 and a link between rows is a straight bond, which
// can cross the rows between; routing it round them is cut from this release.
await check("N23", "A link drawn with the Bond tool in a 45-residue label chain (over one row): rows of 10, no NaN, labels apart, the link straight", () => {
  labelHooks.link = (m, i, j) => { const r = linkResidues(m, i, j); return r && "problem" in r ? m : r; };
  try {
    const codes = Array.from({ length: 45 }, (_, k) => (k === 2 || k === 37 ? "C" : "A")).join("."), l = labels(`PEPTIDE1{${codes}}$$$$V2.0`), cys = l.atoms.flatMap((a, i) => (a.text === "Cys" ? [i] : []));
    const linked = dragBond(l, cys[0], at(l, cys[1]));
    assert.notEqual(linked, l, "linked");
    noNaN(linked, "45 residues");
    assert.equal(toHelm(linked), `PEPTIDE1{${codes}}$PEPTIDE1,PEPTIDE1,3:R3-38:R3$$$V2.0`);
    const ls = linked.atoms.map((_, i) => i).filter((i) => linked.atoms[i].text || linked.atoms[i].label === "H");
    for (let x = 0; x < ls.length; x++) for (let y = x + 1; y < ls.length; y++) { const p = at(linked, ls[x]), q = at(linked, ls[y]); assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) > 1.5, `labels ${x} and ${y} apart`); }
    const link = linked.bonds.find((b) => b.atoms.every((x) => linked.atoms[x].text === "Cys"));
    assert.ok(link && !bracketOf(link), "the link between rows is straight");
  } finally { labelHooks.link = undefined; }
});

await check("N24", "A bracket with a tiny, a huge and a zero-length span renders finite and is still hit", () => {
  const two: Mol = { atoms: [{ label: "S", location: [0, 0, 0] }, { label: "S", location: [3, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1], route: 0.01 }] };
  for (const route of [0.01, -0.01, 1000, -1000]) {
    const m = { ...two, bonds: [{ ...two.bonds[0], route }] };
    for (const z of [0.25, 8]) { const d = render(m, STYLE, INK, z); assert.ok(d.polygons.length && d.polygons.every((p) => p.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]))), `route ${route} at ${z}`); }
    assert.equal(bondAt(m, [1.5, route]), 0, `route ${route}: hit on its top line`);
  }
  const same: Mol = { atoms: [{ label: "S", location: [0, 0, 0] }, { label: "S", location: [0, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1], route: 1 }] };
  const d = render(same, STYLE, INK);
  assert.ok(d.polygons.every((p) => p.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]))), "two atoms on one place: finite");
});

await check("N26", "Links at the ends' caps: R2 of [ac], a link to [am], R1 of a residue after [ac]: a short problem each, no exception", () => {
  for (const h of ["PEPTIDE1{[ac].C.A.C}$PEPTIDE1,PEPTIDE1,1:R2-4:R3$$$V2.0", "PEPTIDE1{C.A.[am]}$PEPTIDE1,PEPTIDE1,1:R3-3:R1$$$V2.0", "PEPTIDE1{[ac].A.A}$PEPTIDE1,PEPTIDE1,2:R1-3:R2$$$V2.0", "PEPTIDE1{[ac].A.A.[am]}$PEPTIDE1,PEPTIDE1,1:R1-4:R2$$$V2.0"]) {
    let r: unknown;
    assert.doesNotThrow(() => { r = seqBuilt({ build: h, labels: false }); }, h);
    assert.ok(r && typeof r === "object" && "problem" in r, `${h}: ${JSON.stringify(r)?.slice(0, 80)}`);
  }
});

await check("N27", "Every stress sequence, as atoms and as labels: atoms apart, no crossings, brackets clear of every label, no NaN", () => {
  for (const [k, h] of Object.entries(S)) for (const how of ["atoms", "labels"] as const) {
    const m = how === "atoms" ? atoms(h) : labels(h);
    noNaN(m, `${k} ${how}`);
    apart(m, `${k} ${how}`, how === "atoms" ? 0.3 : 0.3);
    noCrossings(m, `${k} ${how}`);
    labelsClear(m, `${k} ${how}`);
  }
});

await check("N28", "Settings > Document > Sequences leaves small molecules alone: glycine, Asp, N-acetylcysteine, aspartame, enalapril, lisinopril", () => {
  const changed: string[] = [];
  for (const [name, smiles] of [
    ["glycine", "NCC(=O)O"], ["aspartic acid", "N[C@@H](CC(=O)O)C(=O)O"], ["N-acetylcysteine", "CC(=O)N[C@@H](CS)C(=O)O"],
    ["aspartame", "COC(=O)[C@H](Cc1ccccc1)NC(=O)[C@@H](N)CC(=O)O"], ["enalapril", "CCOC(=O)[C@H](CCc1ccccc1)N[C@@H](C)C(=O)N1CCC[C@H]1C(=O)O"],
    ["lisinopril", "NCCCC[C@H](N[C@@H](CCc1ccccc1)C(=O)O)C(=O)N1CCC[C@H]1C(=O)O"],
  ] as const) {
    const m = chem.cleanUp(chem.parseStructure(smiles)), l = withSequences(m, "labels", []);
    if (l !== m) changed.push(`${name} (now ${l.atoms.filter((a) => a.inner || a.text).map((a) => a.text).join("–")})`);
  }
  assert.equal(changed.length, 0, `redrawn as residue labels: ${changed.join("; ")}`);
});

// Measured in a fresh process: in this one, the shared helpers render, the hit test and the structure check call
// (pos, sub, len) have run on every case above and are slower for it than 1.1.2's own copies, which only ever saw
// this page.
const SPEEDS = `
const gl = globalThis; gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) }; gl.window = globalThis; gl.self = { location: { origin: "file://" } };
gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
const { readFileSync } = await import("node:fs");
gl.fetch = async (u) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const load = async (dir) => ({ edit: await import(dir + "edit.ts"), render: await import(dir + "render.ts"), check: await import(dir + "check.ts") });
const [now, before] = [await load(process.argv[2]), await load(process.argv[3])], page = JSON.parse(readFileSync(process.argv[4], "utf8"));
const pt = 4 / 3, STYLE = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt }, box = [];
for (let i = 0; i <= 40; i++) { const f = i / 40; box.push([9.6 * f, 0], [9.6 * f, -9.5], [0, -9.5 * f], [9.6, -9.5 * f]); }
const INK = () => ({ width: 9.6, ascent: 9.5, outline: box });
const pts = page.atoms.slice(0, 200).map((a) => [a.location[0] + 0.37, a.location[1] + 0.21]);
const runs = { render: (x) => x.render.render(page, STYLE, INK), "hit test (200 points)": (x) => pts.forEach((q) => x.edit.bondAt(page, q)), "structure check": (x) => x.check.problems(page) };
const out = {}, med = (v) => v.sort((p, q) => p - q)[v.length >> 1];
for (const [name, f] of Object.entries(runs)) {
  const t = (x) => { const t0 = performance.now(); f(x); return performance.now() - t0; }, a = [], b = [];
  t(now); t(before);
  for (let k = 0; k < 11; k++) { if (k % 2) { a.push(t(now)); b.push(t(before)); } else { b.push(t(before)); a.push(t(now)); } }
  out[name] = [med(a), med(b)];
}
console.log(JSON.stringify(out));`;
await check("N29", "No speed regression on 40 paclitaxels (no brackets): render, hit test and the structure check against 1.1.2, interleaved medians", () => {
  if (typeof old === "string") return old;
  const dir = mkdtempSync(join(tmpdir(), "octet-speed27-")), script = join(dir, "speed.mjs"), json = join(dir, "page.json");
  try {
    writeFileSync(script, SPEEDS);
    writeFileSync(json, JSON.stringify(taxols));
    const run = spawnSync(process.execPath, [script, new URL("./", import.meta.url).href, `file://${join(oldDir, "src")}/`, json], { encoding: "utf8", timeout: 300_000 });
    let out: Record<string, [number, number]>;
    try { out = JSON.parse(run.stdout.trim().split("\n").pop()!); } catch { throw new Error(`the timing did not run: ${run.stderr.slice(-300)}`); }
    const slow = Object.entries(out).filter(([, [x, y]]) => x > y * 1.15 + 1).map(([name, [x, y]]) => `${name} ${x.toFixed(1)} ms against ${y.toFixed(1)} ms`);
    assert.equal(slow.length, 0, `slower than 1.1.2: ${slow.join("; ")}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await check("N30", "A 500-nucleotide RNA as residue labels: built in under a second, HELM back the same, labels apart", () => {
  const bases = Array.from({ length: 500 }, (_, k) => "ACGU"[(k * 7) % 4]).join(""), seq = (fieldSeq(`rna: ${bases}`) as { seq: Seq }).seq;
  const ms = time(() => buildLabels(seq), 1), b = buildLabels(seq);
  assert.ok("mol" in b, `built: ${JSON.stringify(b).slice(0, 80)}`);
  assert.ok(ms < 1000, `${ms.toFixed(0)} ms`);
  const l = (b as { mol: Mol }).mol, h = toHelm(l)!;
  assert.ok(h && h.startsWith("RNA1{R(A)P."), h?.slice(0, 40));
  assert.equal(toHelm(labels(h)), h, "HELM back");
  noNaN(l, "500 nucleotides");
});

await check("N33", "A new name typed over a residue label: a Cys joined by its S keeps its name (and says why); D-Phe over Phe keeps the chain and inverts the centre", () => {
  const ox = labels(S.oxytocin), cys = ox.atoms.findIndex((a) => a.text === "Cys"), was = inchi(ox);
  let said = "";
  const hook = labelHooks.relabel;
  labelHooks.relabel = (m, i, t) => { const r = relabel(m, i, t, chem.parseStructure); if (r && "problem" in r) { said = r.problem; return m; } return r; };
  try {
    const after = setLabel(ox, cys, "Ser");
    assert.equal(inchi(after), was, "the compound stays oxytocin");
    assert.match(said, /joined by its side chain/);
    const l = labels("PEPTIDE1{A.F.G}$$$$V2.0"), f = l.atoms.findIndex((a) => a.text === "Phe"), d = setLabel(l, f, "D-Phe");
    assert.equal(d.atoms[f].text, "D-Phe");
    assert.ok(d.atoms[f].inner?.atoms.length, "D-Phe keeps its atoms");
    assert.equal(inchi(d), inchi(labels("PEPTIDE1{A.[dF].G}$$$$V2.0")), "the D compound");
    assert.equal(toHelm(d), "PEPTIDE1{A.[dF].G}$$$$V2.0");
    assert.equal(inchi(setLabel(d, f, "Phe")), inchi(l), "and back to Phe");
  } finally { labelHooks.relabel = hook; }
});

// ==================================================================================================================
// For 1.1.3: FASTA with no header, the longest chains, Expand Label of a whole chain
// ==================================================================================================================
await check("N34", "FASTA with no '>' line, pasted when no name or SMILES reads: DNA, RNA and peptide told apart, lower-case bases, over lines; words and junk not read", () => {
  const bare = (t: string) => readSequence(t, true);
  assert.deepEqual(bare("ATGCATGCAT"), { text: "dna: ATGCATGCAT" });
  assert.equal(readSequence("ATGCATGCAT"), undefined, "only when asked: a paste tries names and SMILES first");
  assert.deepEqual(bare("atgcatgcat\r\nggcc ttaa\n"), { text: "dna: ATGCATGCATGGCCTTAA" }, "lower case, over lines, spaces");
  assert.deepEqual(bare("ACGUACGU\nACGU"), { text: "rna: ACGUACGUACGU" });
  assert.deepEqual(bare("MALWMRLLPL\nLALLALWGPD"), { text: "peptide: MALWMRLLPLLALLALWGPD" });
  assert.deepEqual(bare("CYIQNCPLG"), { text: "peptide: CYIQNCPLG" });
  assert.deepEqual(bare("MALWMRLLPL*\n"), { text: "peptide: MALWMRLLPL" }, "a stop at the end");
  assert.deepEqual(bare(">sp|P01178|OXYT_HUMAN\nCYIQNCPLG"), { text: "peptide: CYIQNCPLG" }, "a header still reads as before");
  // Not a sequence with no header: a protein in lower case (a misspelt name), a letter that is no amino acid or base,
  // digits, dashes, a damaged SMILES, one letter, nothing.
  for (const t of ["cyiqncplg", "asprin", "HELLO", "ACDX", "Octet", "C1CC", "AC-GT", "1 atgc", "A", "", "  \n", "AC*GT", "*", "x".repeat(20_001)]) assert.equal(bare(t), undefined, JSON.stringify(t.slice(0, 20)));
  // 1,000 bases with no header: the field reads them and they build as residue labels.
  const long = Array.from({ length: 1000 }, (_, k) => "ACGT"[(k * 7) % 4]).join(""), read = bare(long) as { text: string };
  assert.equal(read.text, `dna: ${long}`);
  const seq = (fieldSeq(read.text) as { seq: Seq }).seq;
  assert.equal(seqProblem(seq, true), undefined, "1,000 bases: no problem under the field");
  assert.ok("mol" in buildLabels(seq), "1,000 bases build as residue labels (a phosphate is no residue)");
  assert.deepEqual(fieldSeq(`dna: ${long}A`), { problem: "Up to 1,000 residues." }, "1,001 bases");
  assert.equal(seqProblem((fieldSeq(`peptide: Ac-${"ACDEFGHIKL".repeat(100)}-NH2`) as { seq: Seq }).seq, true), undefined, "1,000 amino acids with both ends");
  assert.ok(time(() => bare(`${"ACGT".repeat(4999)}`), 3) < 20, "20,000 letters read in under 20 ms");
  // Both paste paths try it after a name and SMILES, before a picture.
  assert.equal(editorSource.match(/if \(frag\) return place\(frag\);\n\s*if \(pasteSequence\(text, false, true\)\) return;/g)?.length, 1, "the clipboard path");
  assert.equal(editorSource.match(/if \(frag\) place\(frag\);\n\s*else if \(named && pasteSequence\(text!, false, true\)\) return;/g)?.length, 1, "the paste event's path");
});

// The longest chain each kind draws in full is set by the builder's 1,000 atoms, not a count of residues (1.1.2 drew
// up to 60 amino acids and 30 nucleotides). The most of the smallest monomer fit (Gly, dC, rC), and any chain of the
// largest one's count fits (Trp, dG, rG). One more says why, under the field and from the builder alike.
const LONGEST: [string, string, number][] = [["peptide", "G", 249], ["peptide", "W", 71], ["peptide", "A", 199], ["dna", "C", 52], ["dna", "G", 45], ["rna", "C", 50], ["rna", "U", 50], ["rna", "G", 43]];
await check("N35", "The longest chains in full: 249 Gly, 71 Trp, 52 dC, 45 dG, 50 rC, 43 rG draw, each one more says why; as residue labels they draw; the old 60 and 30 caps are gone", () => {
  for (const [kind, code, n] of LONGEST) for (const k of [n, n + 1]) {
    const text = `${kind}: ${code.repeat(k)}`, read = fieldSeq(text) as { seq: Seq }, field = seqProblem(read.seq, false), built = buildAtoms(read.seq);
    if (k === n) {
      assert.equal(field, undefined, `${k} × ${code} (${kind}): ${field}`);
      assert.ok("mol" in built && built.mol.atoms.length <= MOST_BUILT_ATOMS, `${k} × ${code} (${kind}) builds`);
      const m = (built as { mol: Mol }).mol;
      if (kind === "peptide") assert.ok(new Set(backboneYs(m).map((y) => Math.round(y * 20))).size <= 3, `${k} × ${code}: one straight backbone`);
      noNaN(m, `${k} × ${code}`);
    } else {
      assert.equal(field, "Up to 1,000 atoms. Choose Residue labels.", `${k} × ${code} (${kind}) under the field`);
      assert.deepEqual(built, { problem: field }, `${k} × ${code} (${kind}) from the builder`);
      assert.equal(seqProblem(read.seq, true), undefined, `${k} × ${code} (${kind}) as residue labels`);
      assert.ok("mol" in buildLabels(read.seq), `${k} × ${code} (${kind}) builds as residue labels`);
    }
  }
  // With ends: Ac- and -NH2 on 71 Trp, phosphates on 45 dG, still fit.
  for (const text of [`peptide: Ac-${"W".repeat(71)}-NH2`, `dna: p${"G".repeat(45)}p`, `rna: p${"G".repeat(43)}p`]) assert.equal(seqProblem((fieldSeq(text) as { seq: Seq }).seq, false), undefined, text.slice(0, 20));
  // Text made a structure (a paste, a text converted, an AI app) reads the same lengths: no 60 or 30 cap there.
  assert.ok(peptideSmiles(`peptide: ${"G".repeat(249)}`), "249 Gly as SMILES");
  assert.ok(peptideSmiles(`peptide: ${"ACDEFGHIKLMNPQRSTVWY".repeat(50)}`), "1,000 residues as SMILES");
  assert.equal(peptideSmiles(`peptide: ${"G".repeat(1001)}`), undefined, "over 1,000");
  assert.ok(editorSource.includes("if (isSequence(s)) {\n      let r: ReturnType<typeof seqBuilt>;\n      try { r = seqBuilt({ build: s, labels: seqLabels, own: ownMonomers }); }"), "structureFromText builds a sequence as the field does");
});

await check("N36", "Expand Label on a whole residue-label chain: along one straight backbone as Sequences > Atoms draws it, the same InChI, HELM and brackets; at its scale; one label left keeps the places", () => {
  // As Structure > Expand Label does it (Editor.tsx expand_label), every residue label drawn out by its kept atoms,
  // the ends with them or not.
  const drawOut = (l: Mol, ends: boolean, skip = -1) => {
    let m = l;
    const residues = new Set<number>(), ids = m.atoms.map((_, i) => i).filter((i) => m.atoms[i].text).sort((p, q) => q - p);
    for (const i of ids) {
      const ported = !!m.atoms[i].inner?.atoms.length && m.bonds.some((b) => b.ports && b.atoms.some((k, e) => k === i && b.ports![e] >= 0));
      if (i === skip || (!ported && !ends)) continue;
      const smiles = ported ? undefined : labelSmiles(m.atoms[i].text!);
      if (!smiles && !m.atoms[i].inner?.atoms.length) continue;
      m = expandLabel(m, i, smiles ? chem.parseStructure(smiles) : m.atoms[i].inner!);
      if (ported) residues.add(i);
    }
    return { m, out: chem.chainsDrawnOut(m, residues) };
  };
  for (const k of ["oxytocin", "insulin", "cyclic", "lactam", "dAmino", "dna", "rna"] as const) for (const ends of [false, true]) {
    const h = S[k], l = labels(h), full = atoms(h), { m, out } = drawOut(l, ends), what = `${k}${ends ? " with its ends" : ""}`;
    assert.notEqual(out, m, `${what}: laid out`);
    assert.equal(inchi(out), inchi(full), `${what}: the same compound`);
    assert.equal(toHelm(out), h, `${what}: HELM`);
    assert.equal(brackets(out).length, brackets(full).length, `${what}: its brackets`);
    apart(out, what);
    clears(out, what);
    noNaN(out, what);
    if (k === "oxytocin" || k === "cyclic" || k === "dAmino") assert.ok(new Set(backboneYs(out).map((y) => Math.round(y * 20))).size <= 3, `${what}: one straight backbone`);
  }
  // At its scale: a chain at 50% stays at 50%.
  const half = labels(S.oxytocin);
  const small = { ...half, atoms: half.atoms.map((a) => ({ ...a, location: [a.location[0] / 2, a.location[1] / 2, 0] as [number, number, number], scale: 0.5 })) };
  const { out } = drawOut(small, true), lengths = out.bonds.filter((b) => !bracketOf(b)).map((b) => Math.hypot(at(out, b.atoms[0])[0] - at(out, b.atoms[1])[0], at(out, b.atoms[0])[1] - at(out, b.atoms[1])[1])).sort((p, q) => p - q);
  assert.ok(Math.abs(lengths[lengths.length >> 1] - 0.5) < 0.02, `bonds at 50%: ${lengths[lengths.length >> 1].toFixed(2)}`);
  // One residue label left: the chain is mixed, and nothing moves.
  const ox = labels(S.oxytocin), last = ox.atoms.findIndex((a) => a.text === "Leu"), some = drawOut(ox, false, last);
  assert.equal(some.out, some.m, "a residue label left: as drawn");
  // Another structure on the page does not move.
  const page = insertMol(labels(S.oxytocin), chem.indigoLayout("CC(=O)Oc1ccccc1C(=O)O"), [0, 30]).mol, n = labels(S.oxytocin).atoms.length, after = drawOut(page, false).out;
  const aspirin = (x: Mol) => x.atoms.slice(n, n + 13).map((a) => a.location);
  assert.deepEqual(aspirin(after), aspirin(page), "aspirin stays");
  assert.match(editorSource, /set\(chainsDrawnOut\(m, residues\)\);/, "Structure > Expand Label lays it out");
});

await check("N37", "The user's monomers (Define Monomer): defined, drawn as atoms and labels, HELM both ways, kept by the drawing in every file, 1.1.2 opens such a file, a hostile list and library refused quickly", () => {
  const { monomerOf, helmLibrary } = seqbuildMore, { readMonomers, readHelmLibrary, MOST_OWN_MONOMERS } = monomersMod;
  const marked = chem.parseStructure("[Xe]N[C@@H](CCCCNC(C)=O)C(=O)[Kr]", false);
  const def = monomerOf({ ...marked, atoms: marked.atoms.map((a) => (a.label === "Xe" ? { ...a, label: "R", text: "R1" } : a.label === "Kr" ? { ...a, label: "R", text: "R2" } : a)) });
  assert.ok("smiles" in def, JSON.stringify(def));
  const own = [{ code: "Kac", smiles: (def as { smiles: string }).smiles }], helm = "PEPTIDE1{C.[Kac].A.A.C}$PEPTIDE1,PEPTIDE1,1:R3-5:R3$$$V2.0";
  const seq = (parseHelm(helm, own) as { seq: Seq }).seq, a = (buildAtoms(seq, undefined, own) as { mol: Mol }).mol, l = (buildLabels(seq, undefined, own) as { mol: Mol }).mol;
  assert.equal(inchi(a), inchi(l), "the same compound");
  assert.equal(toHelm(a, undefined, undefined, own), helm, "HELM from atoms, the link kept");
  assert.equal(toHelm(l, undefined, undefined, own), helm, "HELM from labels");
  assert.equal(brackets(a).length, 1, "the disulfide a bracket");
  const style = DEFAULT_STYLE;
  for (const [how, back] of [[".oct", readOct(writeOct(l, style), true).mol], ["CDXML", fromCdxml(toCdxml(l, style)).mol], ["CDX", readCdx(writeCdx(l, style)).mol], ["the clipboard", parse(serialize({ ...l, style }))]] as const) {
    assert.deepEqual(back.monomers, own, `${how}: the monomer kept`);
    assert.equal(toHelm(back, undefined, undefined, back.monomers), helm, `${how}: HELM on another computer`);
  }
  // Hostile: a list of 20,000, codes Octet has, a 5,000-character SMILES, a library of 4 MB: refused or cut, quickly.
  const t = performance.now();
  assert.equal(readMonomers(Array.from({ length: 20_000 }, (_, k) => ({ code: `Q${k}`, smiles: own[0].smiles }))).length, MOST_OWN_MONOMERS);
  assert.deepEqual(readMonomers([{ code: "Ala", smiles: own[0].smiles }, { code: "Q", smiles: "C".repeat(5000) }, { code: "x<script>", smiles: own[0].smiles }]), []);
  assert.deepEqual(readHelmLibrary("[".repeat(100_000)), { problem: "This file is not a HELM monomer library." });
  assert.ok(performance.now() - t < 1000, `${Math.round(performance.now() - t)} ms`);
  assert.deepEqual((readHelmLibrary(helmLibrary(own)) as { monomers: unknown }).monomers, own, "a library back");
  if (typeof old === "string") return old;
  for (const [how, back] of [[".oct", old.readOct(writeOct({ ...l, monomers: own }, style), true).mol], ["the clipboard", old.parse(serialize({ ...l, monomers: own, style }))]] as const) assert.equal(inchi(back), inchi(l), `1.1.2 ${how}: opens, the same compound`);
});

await check("N38", "Octet's non-natural amino acids and a peptide's ends (Aib, Nle, Orn, Sar, Hyp; Boc, Fmoc, Z, Biotin; OMe, OtBu, NHMe): words, HELM, atoms and labels, files and 1.1.2, the longest that draw", () => {
  const text = "peptide: Fmoc-[Aib][Nle][Orn][Sar][Hyp][Cha][Phg][Pen]-OtBu", read = fieldSeq(text);
  assert.ok(read && "seq" in read, JSON.stringify(read));
  const a = (buildAtoms(read.seq) as { mol: Mol }).mol, l = (buildLabels(read.seq) as { mol: Mol }).mol, helm = "PEPTIDE1{[fmoc].[Aib].[Nle].[Orn].[Sar].[Hyp].[Cha].[Phg].[Pen].[OtBu]}$$$$V2.0";
  assert.equal(inchi(a), inchi(l));
  assert.equal(toHelm(a), helm);
  assert.equal(toHelm(l), helm);
  assert.deepEqual(readSequence(helm), { text });
  assert.equal(toFasta(a), "XLKGPAGV");
  apart(a, "as atoms");
  noNaN(a, "as atoms");
  assert.equal(inchi(withSequences(a, "labels")), inchi(a));
  const style = DEFAULT_STYLE;
  for (const [how, back] of [[".oct", readOct(writeOct(l, style), true).mol], ["CDX", readCdx(writeCdx(l, style)).mol]] as const) assert.equal(toHelm(back), helm, how);
  // A Biotin and Z chain, HELM out and in.
  const b = fieldSeq("peptide: Biotin-G[Hcy]G-NHMe") as { seq: Seq }, bm = (buildAtoms(b.seq) as { mol: Mol }).mol;
  assert.deepEqual(readSequence(toHelm(bm)!), { text: "peptide: Biotin-G[Hcy]G-NHMe" });
  assert.deepEqual(fieldSeq("peptide: Z-AG"), fieldSeq("peptide: Cbz-AG"));
  // The longest of the largest that draw in full, and one more.
  let n = 1;
  while (!seqProblem((fieldSeq(`peptide: ${"[Cha]".repeat(n + 1)}`) as { seq: Seq }).seq, false)) n++;
  assert.ok("mol" in buildAtoms((fieldSeq(`peptide: ${"[Cha]".repeat(n)}`) as { seq: Seq }).seq), `${n} Cha`);
  assert.equal(seqProblem((fieldSeq(`peptide: ${"[Cha]".repeat(n + 1)}`) as { seq: Seq }).seq, false), "Up to 1,000 atoms. Choose Residue labels.");
  if (typeof old === "string") return old;
  const back = old.readOct(writeOct(l, style), true).mol;
  assert.equal(inchi(back), inchi(l), "1.1.2 opens the labels, the same compound");
});

await check("N39", "Modified nucleotides (2'-OMe, 2'-F, MOE, LNA, 5-methyl-C) and phosphorothioates: a gapmer by words and HELM, atoms and labels, Clean Up's straight backbone, files and 1.1.2, hostile words refused quickly", () => {
  const words = "dna: [LA]*[LT]*[L5mC]*G*C*A*T*T*G*C*[LG]*[LA]*[LT]", read = fieldSeq(words);
  assert.ok(read && "seq" in read, JSON.stringify(read));
  const a = (buildAtoms(read.seq) as { mol: Mol }).mol, l = (buildLabels(read.seq) as { mol: Mol }).mol, helm = toHelm(a)!;
  assert.ok(helm.startsWith("RNA1{[LR](A)[sP].[LR](T)[sP].[LR]([5meC])[sP].[dR](G)[sP]"), helm);
  assert.equal(toHelm(l), helm);
  assert.deepEqual(readSequence(helm), { text: words });
  assert.equal(inchi(a), inchi(l));
  apart(a, "as atoms");
  noNaN(a, "as atoms");
  assert.ok(chainLayout(a, a.atoms.map((_, k) => k)), "a straight backbone, LNA's bridge and all");
  const style = DEFAULT_STYLE;
  for (const [how, back] of [[".oct", readOct(writeOct(l, style), true).mol], ["CDXML", fromCdxml(toCdxml(l, style)).mol], ["CDX", readCdx(writeCdx(l, style)).mol]] as const) assert.equal(toHelm(back), helm, how);
  // Hostile words: a long label in brackets, 20,000 stars, an unclosed bracket, every one answered quickly.
  const t = performance.now();
  for (const bad of [`dna: [${"L".repeat(5000)}]`, `dna: A${"*".repeat(20_000)}`, `rna: [mA${"C".repeat(19_000)}`, `dna: ${"[LT]*".repeat(4000)}A`]) assert.ok("problem" in (fieldSeq(bad) ?? {}), bad.slice(0, 30));
  assert.ok(performance.now() - t < 200, `${Math.round(performance.now() - t)} ms`);
  if (typeof old === "string") return old;
  assert.equal(inchi(old.readOct(writeOct(l, style), true).mol), inchi(l), "1.1.2 opens the labels, the same compound");
});

// The field's worker (namepreview.ts) with a stand-in worker, as the field calls it: the preview timer's
// seqLayout(…, true) and Return's seqLayout(…). One job runs at a time.
await check("N40", "The Sequence field's worker: a preview timer that fires after Return, while a slow preview still builds, never drops or holds back Return; Return during its own preview builds once; a stale preview is dropped; Return cancelled (a space typed after it) leaves a preview sharing its build; a request sharing a build drops an older preview waiting for another sequence; Escape still cancels", async () => {
  const { seqLayout, quickLayout, fullLayout } = await import("./namepreview.ts");
  type Ask = { build?: string; smiles?: string; pieces?: string[] };
  const sent: { ask: Ask; w: Stand }[] = [];
  let stopped = 0;
  class Stand {
    onmessage?: (e: { data: unknown }) => void;
    onerror?: () => void;
    postMessage(ask: Ask) { sent.push({ ask, w: this }); }
    terminate() { stopped++; }
  }
  const answer = (data: unknown) => sent.at(-1)!.w.onmessage!({ data });
  const built = (text: string) => ({ atoms: [{ label: "C", location: [0, 0, 0], text }], bonds: [] });
  const preview = (text: string) => seqLayout(text, false, [], true), enter = (text: string) => seqLayout(text, false, []);
  gl.Worker = Stand;
  try {
    // The review's case: the preview of the text before the last keystroke is still building, Return is pressed, and
    // then the preview timer for the field's text fires.
    const slow = preview("peptide: GAVL");
    assert.equal(sent.length, 1, "the slow preview builds");
    const r = enter("peptide: GAVLI"), late = preview("peptide: GAVLI");
    answer(built("GAVL"));
    assert.equal(sent.at(-1)!.ask.build, "peptide: GAVLI", "Return's sequence is built next");
    answer(built("GAVLI"));
    assert.deepEqual(await r.result, built("GAVLI"), "Return draws what is in the field");
    assert.equal(await late.result, await r.result, "the late preview shows the same structure");
    assert.equal(sent.length, 2, "built once");
    assert.deepEqual(await slow.result, built("GAVL"));
    // Return while its own preview builds: the same build, so no slower than the preview.
    const own = preview("peptide: KLMN"), r2 = enter("peptide: KLMN");
    answer(built("KLMN"));
    assert.equal(await r2.result, await own.result);
    assert.equal(sent.length, 3, "Return during its preview builds nothing more");
    // Return takes a waiting preview of its sequence as its own job: a newer preview (another sequence, or Name to
    // Structure's) waits behind it and does not drop it.
    const busy = quickLayout("CCCCCC"), waiting = preview("peptide: PQRS"), r3 = enter("peptide: PQRS"), newer = preview("peptide: PQRST"), quick = quickLayout("CCCCCCCC");
    assert.equal(await newer.result, undefined, "the newer preview drops only the preview waiting before it");
    answer("hexane");
    assert.equal(await busy, "hexane");
    assert.equal(sent.at(-1)!.ask.build, "peptide: PQRS", "Return's goes before the preview");
    answer(built("PQRS"));
    assert.deepEqual(await r3.result, built("PQRS"));
    assert.equal(await waiting.result, await r3.result);
    assert.deepEqual(sent.at(-1)!.ask, { smiles: "CCCCCCCC" }, "then the preview waiting");
    answer("octane");
    assert.equal(await quick, "octane");
    // A stale preview waiting is dropped by a newer one, and the newer one is built.
    const big = fullLayout(["CCCCCCC"], true), stale = preview("peptide: WY"), fresh = preview("peptide: WYA");
    assert.equal(await stale.result, undefined, "the stale preview is dropped");
    answer(["heptane"]);
    assert.deepEqual(await big.result, ["heptane"]);
    assert.equal(sent.at(-1)!.ask.build, "peptide: WYA");
    answer(built("WYA"));
    assert.deepEqual(await fresh.result, built("WYA"));
    // A space typed after Return cancels Return (the field's text is no longer the text Return was for) while the
    // preview timer's request shares Return's build: the preview still gets it, and the worker goes on.
    const ra = enter("peptide: STV"), pa = preview("peptide: STV"), wasA = stopped, nA = sent.length;
    assert.equal(sent.at(-1)!.ask.build, "peptide: STV", "Return's build has started");
    ra.cancel();
    assert.equal(await ra.result, undefined, "Return is cancelled");
    assert.equal(stopped, wasA, "the worker goes on for the preview");
    answer(built("STV"));
    assert.deepEqual(await pa.result, built("STV"), "the preview shows it");
    assert.equal(sent.length, nA, "built once");
    // The same with Return's build waiting (Return took the waiting preview as its own job): the preview keeps it, and
    // it waits as a preview again, so a newer Return goes before it.
    const busyB = quickLayout("CCCC(C)C"), pb = preview("peptide: RTW"), rb = enter("peptide: RTW");
    rb.cancel();
    assert.equal(await rb.result, undefined, "Return is cancelled");
    const rc = enter("peptide: MMM");
    answer("isohexane");
    assert.equal(await busyB, "isohexane");
    assert.equal(sent.at(-1)!.ask.build, "peptide: MMM", "a newer Return goes first");
    answer(built("MMM"));
    assert.deepEqual(await rc.result, built("MMM"));
    assert.equal(sent.at(-1)!.ask.build, "peptide: RTW", "then the preview Return left");
    answer(built("RTW"));
    assert.deepEqual(await pb.result, built("RTW"), "the preview shows it");
    // Only the newest preview waits: a newer preview waiting when Return is cancelled goes ahead of the one Return left.
    const busyC = quickLayout("CCCCC(C)C"), pc = preview("peptide: YYY"), rcc = enter("peptide: YYY"), pd = preview("peptide: YYYW");
    rcc.cancel();
    assert.equal(await pc.result, undefined, "the older preview goes");
    answer("isoheptane");
    assert.equal(await busyC, "isoheptane");
    assert.equal(sent.at(-1)!.ask.build, "peptide: YYYW");
    answer(built("YYYW"));
    assert.deepEqual(await pd.result, built("YYYW"));
    // A request that shares a build on its way drops an older preview waiting for another sequence: the field no
    // longer holds that sequence, so it would be built later for nothing. A preview sharing Return's build:
    const rd = enter("peptide: DDK"), oldD = preview("peptide: DDKA"), backD = preview("peptide: DDK"), nD = sent.length;
    answer(built("DDK"));
    assert.equal(sent.length, nD, "the older preview is not built");
    assert.equal(await oldD.result, undefined, "it is dropped");
    assert.deepEqual(await backD.result, built("DDK"));
    assert.deepEqual(await rd.result, built("DDK"));
    // And Return sharing a preview's build:
    const pe = preview("peptide: NNP"), oldE = preview("peptide: NNPQ"), re = enter("peptide: NNP"), nE = sent.length;
    answer(built("NNP"));
    assert.equal(sent.length, nE, "the older preview is not built");
    assert.equal(await oldE.result, undefined, "it is dropped");
    assert.deepEqual(await re.result, built("NNP"));
    assert.deepEqual(await pe.result, built("NNP"));
    // Escape: Return waiting that nobody else wants is dropped and never built; Return that has started stops its
    // worker.
    const n = sent.length, other = quickLayout("CCCCCCCCC"), r4 = enter("peptide: EFG");
    r4.cancel();
    assert.equal(await r4.result, undefined, "Escape drops Return");
    answer("nonane");
    assert.equal(await other, "nonane");
    assert.equal(sent.length, n + 1, "nothing more is built");
    const r5 = enter("peptide: HIK"), was = stopped;
    assert.equal(sent.at(-1)!.ask.build, "peptide: HIK");
    r5.cancel();
    assert.equal(await r5.result, undefined);
    assert.equal(stopped, was + 1, "Escape stops the worker building Return's");
  } finally { delete gl.Worker; }
});

await check("N41", "One residue label alone is a chain, a nucleotide as an amino acid is: rA, dG, [mA] and Ala each give HELM, FASTA and the field's words; Sequences > Atoms draws it out, the same compound; drawn as atoms it stays a small molecule", () => {
  for (const [words, helm, fasta] of [["rna: A", "RNA1{R(A)}$$$$V2.0", "A"], ["dna: G", "RNA1{[dR](G)}$$$$V2.0", "G"], ["rna: [mA]", "RNA1{[mR](A)}$$$$V2.0", "A"], ["peptide: A", "PEPTIDE1{A}$$$$V2.0", "A"]]) {
    const seq = (fieldSeq(words) as { seq: Seq }).seq, l = (buildLabels(seq) as { mol: Mol }).mol, a = (buildAtoms(seq) as { mol: Mol }).mol;
    assert.equal(l.atoms.filter((_, i) => isLabel(l, i)).length, 1, `${words}: one residue label`);
    assert.equal(toHelm(l), helm, `${words}: HELM`);
    assert.equal(toFasta(l), fasta, `${words}: FASTA`);
    assert.equal(chainText(l, l.atoms.map((_, i) => i)), words, `${words}: the field's words (the Sequence tool's click)`);
    const out = withSequences(l, "atoms");
    assert.ok(out.atoms.length > l.atoms.length && !out.atoms.some((_, i) => isLabel(out, i)), `${words}: drawn out`);
    assert.equal(inchi(out), inchi(a), `${words}: the same compound`);
    assert.equal(toHelm(a), undefined, `${words}: as atoms, a small molecule (adenosine, alanine)`);
    assert.equal(withSequences(a, "labels"), a, `${words}: and stays one`);
  }
});

await check("N42", "A chain opened in the Sequence field and changed under it before Return (drawn again as labels or atoms, moved, undone, one of two alike): Return draws one structure in its place; a chain deleted or changed is gone", () => {
  const { markChain, chainAgain, inPlaceOf } = helmMod;
  const built = (words: string, as: "atoms" | "labels") => { const seq = (fieldSeq(words) as { seq: Seq }).seq; return ((as === "atoms" ? buildAtoms(seq) : buildLabels(seq)) as { mol: Mol }).mol; };
  const aspirin = chem.parseStructure("CC(=O)Oc1ccccc1C(=O)O");
  const page = insertMol(aspirin, built("peptide: AGF", "atoms"), [12, 0]).mol, chain = page.atoms.map((_, i) => i).slice(aspirin.atoms.length);
  const opened = markChain(page, chain);
  assert.ok(opened, "the chain opens in the field");
  assert.equal(opened.text, "peptide: AGF");
  const parts = (m: Mol) => fragments(m).length, mid = (m: Mol, atoms: number[]) => [0, 1].map((k) => { const v = atoms.map((i) => m.atoms[i].location[k]); return (Math.min(...v) + Math.max(...v)) / 2; });
  const want = inchi(built("peptide: AGGF", "atoms"));
  // Return: the new chain in place of the one found; the drawing keeps its two structures, the new one where it was.
  const land = (m: Mol, found: number[] | undefined, as: "atoms" | "labels", why: string) => {
    assert.ok(found, `${why}: found again`);
    const out = inPlaceOf(m, found, built("peptide: AGGF", as)), fresh = fragments(out).find((f) => f.some((i) => out.atoms[i].label === "N" || isLabel(out, i)))!;
    assert.equal(parts(out), 2, `${why}: one structure in its place, none added`);
    assert.equal(inchi(pickAtoms(out, fresh)), want, `${why}: the new chain`);
    mid(out, fresh).forEach((v, k) => assert.ok(Math.abs(v - mid(m, found)[k]) < 1e-6, `${why}: at its centre`));
  };
  // The Residue labels choice, or Settings > Document > Sequences: every chain drawn again with new atoms.
  const labelled = withSequences(page, "labels");
  assert.notEqual(labelled, page);
  land(labelled, chainAgain(labelled, opened.mark), "labels", "drawn again as labels");
  // Moved: the same atoms.
  const moved = { ...page, atoms: page.atoms.map((a, i) => (i >= aspirin.atoms.length ? { ...a, location: [a.location[0] + 3, a.location[1] - 2, 0] as [number, number, number] } : a)) };
  assert.deepEqual(chainAgain(moved, opened.mark), chain, "moved: its own atoms");
  land(moved, chainAgain(moved, opened.mark), "atoms", "moved");
  // Drawn again as labels, then moved: found by its sequence.
  const both = { ...labelled, atoms: labelled.atoms.map((a) => (a.inner || a.text || a.label === "H" ? { ...a, location: [a.location[0] + 4, a.location[1], 0] as [number, number, number] } : a)) };
  land(both, chainAgain(both, opened.mark), "labels", "as labels and moved");
  // Opened as labels, then undone to atoms.
  const fromLabels = markChain(labelled, fragments(labelled).find((f) => f.some((i) => isLabel(labelled, i)))!)!;
  land(page, chainAgain(page, fromLabels.mark), "atoms", "undone");
  // Two chains alike: the one nearest to where it was.
  const two = insertMol(page, built("peptide: AGF", "atoms"), [30, 0]).mol, second = two.atoms.map((_, i) => i).slice(page.atoms.length), twice = markChain(two, second)!;
  const again = withSequences(two, "labels"), found = chainAgain(again, twice.mark)!;
  assert.ok(mid(again, found)[0] > mid(again, chainAgain(withSequences(page, "labels"), opened.mark)!)[0] + 5, "the second of two alike");
  // Gone: deleted, or changed by hand (a sequence no longer).
  assert.equal(chainAgain(erase(page, new Set(), new Set(chain)), opened.mark), undefined, "deleted");
  assert.equal(chainAgain(insertMol(aspirin, built("peptide: AGW", "atoms"), [12, 0]).mol, opened.mark), undefined, "another sequence");
  assert.match(editorSource, /const gone = e && naming !== undefined && isSequence\(naming\.trim\(\)\) \? \(e\.doc === doc \? e\.mark\.atoms : chainAgain\(doc, e\.mark, ownMonomers\)\) : undefined;/, "Return looks for it");
});

await check("N43", "A nucleotide drawn as atoms stays a small molecule, as in Octet 1.1.2 (one nucleotide is a chain only as a residue label, N41): ATP, ADP, NAD+, CoA, dTTP, GTP, FAD, UDP-glucose and sofosbuvir give no HELM, no FASTA and no field text, and stay as drawn; beside a peptide, RNA or DNA (atoms or labels) Edit > Copy As > HELM and FASTA give the chain alone", () => {
  const small: [string, string][] = [
    ["ATP", "Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)(O)OP(=O)(O)OP(=O)(O)O)[C@@H](O)[C@H]1O"],
    ["ADP", "Nc1ncnc2c1ncn2[C@@H]1O[C@H](COP(=O)(O)OP(=O)(O)O)[C@@H](O)[C@H]1O"],
    ["NAD+", "NC(=O)c1ccc[n+](c1)[C@@H]1O[C@H](COP(=O)([O-])OP(=O)(O)OC[C@H]2O[C@@H](n3cnc4c(N)ncnc43)[C@H](O)[C@@H]2O)[C@@H](O)[C@H]1O"],
    ["CoA", "CC(C)(COP(=O)(O)OP(=O)(O)OC[C@H]1O[C@@H](n2cnc3c(N)ncnc32)[C@H](O)[C@@H]1OP(=O)(O)O)[C@@H](O)C(=O)NCCC(=O)NCCS"],
    ["dTTP", "Cc1cn([C@H]2C[C@H](O)[C@@H](COP(=O)(O)OP(=O)(O)OP(=O)(O)O)O2)c(=O)[nH]c1=O"],
    ["GTP", "Nc1nc2n(cnc2c(=O)[nH]1)[C@@H]1O[C@H](COP(=O)(O)OP(=O)(O)OP(=O)(O)O)[C@@H](O)[C@H]1O"],
    ["FAD", "Cc1cc2nc3c(=O)[nH]c(=O)nc-3n(C[C@H](O)[C@H](O)[C@H](O)COP(=O)(O)OP(=O)(O)OC[C@H]3O[C@@H](n4cnc5c(N)ncnc54)[C@H](O)[C@@H]3O)c2cc1C"],
    ["UDP-glucose", "O=c1ccn([C@@H]2O[C@H](COP(=O)(O)OP(=O)(O)O[C@H]3O[C@H](CO)[C@@H](O)[C@H](O)[C@H]3O)[C@@H](O)[C@H]2O)c(=O)[nH]1"],
    ["sofosbuvir", "CC(C)OC(=O)[C@@H](C)N[P@](=O)(OC[C@@H]1[C@H]([C@@](C)([C@@H](O1)N2C=CC(=O)NC2=O)F)O)OC3=CC=CC=C3"],
  ];
  for (const [name, smiles] of small) {
    const m = chem.parseStructure(smiles);
    assert.equal(toHelm(m), undefined, `${name}: no HELM`);
    assert.equal(toFasta(m), undefined, `${name}: no FASTA`);
    assert.equal(chainText(m, m.atoms.map((_, i) => i)), undefined, `${name}: no field text (the Sequence tool's click)`);
    assert.equal(withSequences(m, "labels"), m, `${name}: Settings > Document > Sequences leaves it as drawn`);
  }
  const atp = chem.parseStructure(small[0][1]), nad = chem.parseStructure(small[2][1]);
  for (const [words, helm, fasta] of [["peptide: AGFW", "PEPTIDE1{A.G.F.W}$$$$V2.0", "AGFW"], ["rna: ACG", "RNA1{R(A)P.R(C)P.R(G)}$$$$V2.0", "ACG"], ["dna: ATGC", "RNA1{[dR](A)P.[dR](T)P.[dR](G)P.[dR](C)}$$$$V2.0", "ATGC"], ["rna: A", "RNA1{R(A)}$$$$V2.0", "A"]])
    for (const as of ["atoms", "labels"] as const) {
      if (words === "rna: A" && as === "atoms") continue;
      const seq = (fieldSeq(words) as { seq: Seq }).seq, built = ((as === "atoms" ? buildAtoms(seq) : buildLabels(seq)) as { mol: Mol }).mol;
      for (const [other, mol] of [["ATP", atp], ["NAD+", nad]] as const) {
        const page = insertMol(built, mol, [40, 0]).mol;
        assert.equal(toHelm(page), helm, `${words} (${as}) and ${other}: Copy As > HELM, the chain alone`);
        assert.equal(toFasta(page), fasta, `${words} (${as}) and ${other}: FASTA, one line`);
      }
    }
});

await check("N44", "A chain opened in the Sequence field that goes while the field is open gives way to a new one, and an alike chain elsewhere is left alone: (A) the second of two AGF opened, then taken out of the history; (B) the first opened, an alike one added and the first deleted. A move of any length keeps the chain", () => {
  const { markChain, chainAgain } = helmMod;
  const agf = () => (buildAtoms((fieldSeq("peptide: AGF") as { seq: Seq }).seq) as { mol: Mol }).mol;
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k);
  // (A) peptide: AGF drawn and moved left; a second AGF drawn and opened with Structure > Sequence > Peptide sequence;
  // the history goes back to before the second (the drawing is the earlier one again): Return places a new chain.
  const first = agf(), left = moveAtoms(first, new Set(range(0, first.atoms.length)), [-12, 0]);
  const two = insertMol(left, agf()).mol, second = range(left.atoms.length, two.atoms.length), openedA = markChain(two, second);
  assert.ok(openedA, "A: the second AGF opens in the field");
  assert.deepEqual(chainAgain(two, openedA.mark), second, "A: while it is there, it is the one");
  assert.equal(chainAgain(left, openedA.mark), undefined, "A: taken out of the history, it is gone: the AGF on the left is not taken for it");
  // (B) the first opened, an alike one added beside it (the first is still the one), then the first deleted: the alike
  // one has its atom numbers but is not it.
  const one = agf(), mine = range(0, one.atoms.length), openedB = markChain(one, mine)!;
  const both = insertMol(one, agf(), [12, 0]).mol;
  assert.deepEqual(chainAgain(both, openedB.mark), mine, "B: an alike one added, the first is still the one");
  const after = erase(both, new Set(), new Set(mine));
  assert.equal(after.atoms.length, one.atoms.length, "B: the alike one has the first one's atom numbers");
  assert.equal(chainAgain(after, openedB.mark), undefined, "B: the first deleted, it is gone: the alike one is not taken for it");
  // Moved far, or coloured: still its own atoms (a move keeps its bonds, a colour its bonds or its atoms).
  const far = moveAtoms(one, new Set(mine), [40, -25]);
  assert.deepEqual(chainAgain(far, openedB.mark), mine, "moved 47 bond lengths: its own atoms");
  const red = { ...one, atoms: one.atoms.map((a) => ({ ...a, colour: "#ff0000" })) };
  assert.deepEqual(chainAgain(red, openedB.mark), mine, "coloured: its own atoms");
  // Drawn again as residue labels (new atoms, centred where it was): found by its sequence.
  const relabelled = withSequences(one, "labels");
  assert.deepEqual(chainAgain(relabelled, openedB.mark), range(0, relabelled.atoms.length), "drawn again as labels: found in its place");
});

// ==================================================================================================================
// ChemDraw 22.2 (S19) and the app in WebKit (U1 to U6, U8 to U12)
// ==================================================================================================================
await check("S19", "ChemDraw 22.2 opens oxytocin and insulin (labels and atoms) and Boc-A-Aib-Nle-G-OMe (labels), saves CDXML, Octet reads it: the same InChI, labels kept as labels", async () => {
  if (!process.env.OCTET_STRESS_CHEMDRAW) return "set OCTET_STRESS_CHEMDRAW=1 to run ChemDraw 22.2 by AppleScript";
  const app = "/Applications/ChemDraw 22.2.0.app", lock = process.env.OCTET_STRESS_CHEMDRAW_LOCK ?? join(fileURLToPath(new URL("../..", import.meta.url)), "chemdraw.lock");
  if (!existsSync(app)) return "no ChemDraw 22.2";
  for (let tries = 0; ; tries++) { try { mkdirSync(lock); break; } catch { if (tries > 45) return "ChemDraw is busy (its lock stayed taken for 15 minutes)"; await new Promise((r) => setTimeout(r, 20000)); } }
  const tell = (body: string) => spawnSync("osascript", ["-e", `tell application id "com.perkinelmer.ChemDraw.22"\n${body}\nend tell`], { encoding: "utf8", timeout: 60000 });
  const dir = mkdtempSync(join(tmpdir(), "octet-cd27-")), done: string[] = [];
  try {
    // And a chain with Octet's ends and non-natural residues as labels (Boc, Aib, Nle, OMe; issue 27).
    const ends = (buildLabels((fieldSeq("peptide: Boc-A[Aib][Nle]G-OMe") as { seq: Seq }).seq) as { mol: Mol }).mol, want: Record<string, string> = { oxytocin: S.oxytocin, insulin: S.insulin, ends: "PEPTIDE1{[Boc].A.[Aib].[Nle].G.[-OMe]}$$$$V2.0" };
    for (const [k, m] of [["oxytocin-atoms", atoms(S.oxytocin)], ["oxytocin-labels", labels(S.oxytocin)], ["insulin-atoms", atoms(S.insulin)], ["insulin-labels", labels(S.insulin)], ["ends-labels", ends]] as const) {
      const name = `stress27-${k}-${process.pid}.cdxml`, src = join(dir, name), out = join(dir, `saved-${k}.cdxml`);
      writeFileSync(src, toCdxml(m, DEFAULT_STYLE));
      execFileSync("open", ["-g", "-a", app, src]);
      let opened = false;
      for (let n = 0; n < 90 && !opened; n++) { opened = tell("get name of every document").stdout.split(", ").map((x) => x.trim()).includes(name); if (!opened) await new Promise((r) => setTimeout(r, 2000)); }
      if (!opened) return `ChemDraw 22.2 did not open ${name} within 3 minutes (a dialog of its own may be up; this check does not touch its windows)`;
      const r = tell(`save document "${name}" in (POSIX file "${out}") as "ChemDraw XML"\nclose document "${name}" saving no`);
      assert.equal(r.status, 0, `AppleScript: ${r.stderr}`);
      const back = fromCdxml(readFileSync(out, "utf8")).mol;
      assert.equal(inchi(back), inchi(m), `${k}: the same compound after ChemDraw`);
      if (k.endsWith("labels")) assert.equal(back.atoms.filter((a) => a.inner).length, m.atoms.filter((a) => a.inner).length, `${k}: labels kept as labels`);
      assert.equal(toHelm(back), want[k.split("-")[0]], `${k}: HELM after ChemDraw`);
      done.push(k);
    }
  } finally { rmSync(lock, { recursive: true, force: true }); rmSync(dir, { recursive: true, force: true }); }
});

// The app in WebKit: uiStress runs in the page (scripts/look/webkit.swift runs the body it is given), so it uses
// nothing from this file. It reads the editor's state from React's own records (the undo history) and drives the
// canvas and the name field with pointer and key events, as scripts/look/sweep.js does.
const ui = process.env.OCTET_STRESS_URL;
await check("U", "The app in WebKit: U1 to U6 and U9 to U12", async () => {
  if (!ui) return "set OCTET_STRESS_URL to the dev server (npx vite --port 1467) to drive the app in WebKit";
  if (process.platform !== "darwin" || spawnSync("which", ["swift"]).status !== 0) return "needs a Mac with Xcode's swift";
  const dir = mkdtempSync(join(tmpdir(), "octet-ui27-")), script = join(dir, "stress.js");
  writeFileSync(script, `return await (${uiStress.toString()})(${JSON.stringify(S.oxytocin)});`);
  const run = spawnSync("swift", [fileURLToPath(new URL("../scripts/look/webkit.swift", import.meta.url)), ui, script], { encoding: "utf8", timeout: 300_000 });
  rmSync(dir, { recursive: true, force: true });
  let out: { cases: { id: string; title: string; ok: boolean; note?: string }[]; errors: string[] };
  try { out = JSON.parse(run.stdout.trim().split("\n").pop()!); } catch { throw new Error(`the WebKit run did not finish: ${run.stdout.slice(-300)}${run.stderr.slice(-300)}`); }
  for (const c of out.cases) results.push({ id: c.id, title: c.title, state: c.ok ? "ok" : "failed", note: c.note });
  assert.deepEqual(out.errors, [], "errors on the page");
});

// U8: the look sweep (scripts/look/sweep.js) in the light and the dark appearance: the field, the chip, Settings >
// Document > Sequences, measured by the app's own watch.
await check("U8", "The look sweep in light and dark: every control matches", async () => {
  if (!ui) return "set OCTET_STRESS_URL to the dev server to run the look sweep";
  if (process.platform !== "darwin" || spawnSync("which", ["swift"]).status !== 0) return "needs a Mac with Xcode's swift";
  const dir = mkdtempSync(join(tmpdir(), "octet-look27-")), runner = fileURLToPath(new URL("../scripts/look/webkit.swift", import.meta.url)), dark = join(dir, "webkit-dark.swift");
  writeFileSync(dark, readFileSync(runner, "utf8").replace("app.setActivationPolicy(.accessory)", "app.setActivationPolicy(.accessory)\napp.appearance = NSAppearance(named: .darkAqua)"));
  const sweep = join(dir, "sweep.js");
  writeFileSync(sweep, readFileSync(new URL("../scripts/look/sweep.js", import.meta.url), "utf8").replace(/return JSON\.stringify\(out\);\s*$/, "out.dark = matchMedia('(prefers-color-scheme: dark)').matches; return JSON.stringify(out);"));
  try {
    for (const [how, swift] of [["light", runner], ["dark", dark]] as const) {
      const run = spawnSync("swift", [swift, ui, sweep], { encoding: "utf8", timeout: 300_000 });
      let r: { reached: string[]; missed: string[]; look: string[]; errors: string[]; dark: boolean };
      try { r = JSON.parse(run.stdout.trim().split("\n").pop()!); } catch { throw new Error(`${how}: the sweep did not finish`); }
      assert.equal(r.dark, how === "dark", `${how}: the page's appearance`);
      assert.deepEqual([...r.look, ...r.errors, ...r.missed.map((m) => `missed ${m}`)], [], `${how}: controls that do not match, places missed, or errors`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Runs in the page. U1: the Sequence tool, HELM typed into the field, Return pressed five times quickly: one structure,
// one undo step. U2: the field's problems ([Zzz]; 115 Glu, too many atoms in full). U3: the Residue labels chip turns
// the document's chains into labels in one undo step and back. U4: dark paper draws the bracket in the light ink. U5:
// the smallest and largest zoom: no error, the bracket drawn. U6: Escape while a sequence builds leaves nothing. U10:
// the worker busy, Return, then the field's preview timer: Return draws. U11: a chain opened in the field, the drawing
// changed before Return (the Residue labels chip, Settings > Document > Sequences, a move) or Edit > Undo in the field
// (it undoes the field's typing, not the drawing): Return draws one structure in its place. U12: Define nickname… for a
// label the settings kept that is refused now: the refusal alone.
async function uiStress(helmText: string) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const until = async <T,>(find: () => T, ms = 10000): Promise<T | null> => { const t = Date.now(); while (Date.now() - t < ms) { const v = find(); if (v) return v; await wait(100); } return null; };
  const out: { cases: { id: string; title: string; ok: boolean; note?: string }[]; errors: string[] } = { cases: [], errors: [] };
  const w = window as unknown as { __errors: string[] };
  const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent!.trim() === text);
  // One keydown, where the focus is (it bubbles to the window's handlers once).
  const key = (init: KeyboardEventInit, on?: Element | null) => (on ?? document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  const editorFiber = () => { const root = document.getElementById("root") as unknown as Record<string, { stateNode: { current: unknown } }>, k = Object.keys(root).find((x) => x.startsWith("__reactContainer"))!, stack: any[] = [root[k].stateNode.current]; while (stack.length) { const f = stack.pop(); if (!f) continue; if (f.type?.name === "Editor") return f; if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); } };
  const hookList = () => { const r: any[] = []; let h = editorFiber()?.memoizedState; while (h) { r.push(h); h = h.next; } return r; };
  const histHook = () => hookList().find((h) => h.memoizedState && Array.isArray(h.memoizedState.stack) && typeof h.memoizedState.at === "number");
  const hist = () => histHook().memoizedState;
  const doc = () => hist().stack[hist().at];
  const parts = (m: any) => { const p = m.atoms.map((_: unknown, i: number) => i), f = (i: number): number => (p[i] === i ? i : (p[i] = f(p[i]))); for (const b of m.bonds) p[f(b.atoms[0])] = f(b.atoms[1]); return new Set(m.atoms.map((_: unknown, i: number) => f(i))).size; };
  const world = () => document.getElementById("world")!;
  const ev = (type: string, [x, y]: number[], extra = {}) => (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, pointerType: "mouse", isPrimary: true, ...extra }));
  const click = async (p: number[]) => { ev("pointermove", p, { buttons: 0 }); ev("pointerdown", p); ev("pointerup", p); (document.elementFromPoint(p[0], p[1]) ?? document.body).dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: p[0], clientY: p[1] })); await wait(300); };
  const result = (id: string, title: string, ok: unknown, note?: string) => out.cases.push({ id, title, ok: !!ok, ...(note ? { note } : {}) });
  const step = async (id: string, title: string, f: () => Promise<void>) => { try { await f(); } catch (e) { result(id, title, false, `the script stopped: ${(e as Error)?.message}`); } };
  const field = () => document.querySelector("input.name-field") as HTMLInputElement | null;
  const type = (text: string) => { const f = field()!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(f, text); f.dispatchEvent(new Event("input", { bubbles: true })); };
  const note = () => (document.querySelector(".name-suggestion") as HTMLElement | null)?.textContent?.trim() ?? "";
  const sequenceTool = () => [...document.querySelectorAll(".tool")].find((t) => /^(Peptide|RNA|DNA)/.test(t.getAttribute("aria-label") ?? "")) as HTMLElement | undefined;
  const palette = async (text: string) => {
    key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true });
    const find = await until(() => document.querySelector(".command-palette input") as HTMLInputElement | null, 3000);
    if (!find) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(find, text);
    find.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(500);
    find.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    await wait(700);
    return true;
  };
  // The field: a click with the Sequence tool, else Structure > Sequence > Peptide… from the command palette.
  const openField = async () => {
    if (field()) return field();
    sequenceTool()?.click();
    await wait(400);
    const r = world().getBoundingClientRect();
    await click([r.left + r.width * 0.4, r.top + r.height * 0.4]);
    if (await until(() => field(), 2500)) return field();
    await palette("Peptide sequence");
    return await until(() => field(), 3000);
  };

  await until(() => document.querySelector(".home, .editor"));
  await wait(1200);
  button("Skip")?.click();
  await wait(900);
  (document.querySelector(".home-tile.new") as HTMLElement | null)?.click();
  await until(() => document.querySelector(".actions .action"));
  [...document.querySelectorAll(".coach button")].find((b) => /skip/i.test(b.textContent!))?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await wait(600);

  await step("U1", "HELM in the field, Return five times quickly", async () => {
    const f = await openField();
    if (!f) return result("U1", "(S23) The Sequence tool opens the field", false, `tool ${!!sequenceTool()}, no field`);
    const at0 = hist().at;
    type(helmText);
    await wait(900);
    const shown = note();
    for (let k = 0; k < 5; k++) { key({ key: "Enter", code: "Enter" }, field() ?? document.activeElement); await wait(15); }
    await until(() => doc().atoms.length > 0 && !field(), 8000);
    await wait(600);
    const m = doc(), steps = hist().at - at0, n = parts(m);
    const route = m.bonds.filter((b: any) => b.route).length;
    key({ key: "z", code: "KeyZ", metaKey: true });
    await wait(500);
    const undone = doc().atoms.length === 0;
    key({ key: "z", code: "KeyZ", metaKey: true, shiftKey: true });
    await wait(500);
    result("U1", "(S1, S23) Oxytocin's HELM typed in the field, Return pressed five times quickly: one oxytocin with its bracket, one undo step", n === 1 && steps === 1 && route === 1 && undone && doc().atoms.length === m.atoms.length && !shown,
      `structures ${n}, steps ${steps}, brackets ${route}, undo empties ${undone}, under the field "${shown}"`);
  });
  await step("U2", "The field's problems", async () => {
    await openField();
    // 115 Glu is too many atoms only as atoms: the Residue labels choice off first (the app may keep it on from before).
    type("peptide: A");
    const labelsChip = await until(() => [...document.querySelectorAll(".name-options button")].find((b) => b.textContent!.trim() === "Residue labels") as HTMLButtonElement | undefined, 2000);
    if (labelsChip?.getAttribute("aria-pressed") === "true") { labelsChip.click(); await wait(300); }
    type("peptide: A[Zzz]C");
    await wait(500);
    const zzz = note();
    type(`peptide: ${"E".repeat(115)}`);
    await wait(1500);
    const big = note();
    key({ key: "Escape", code: "Escape" }, field());
    await wait(300);
    result("U2", "(S11, N10) Under the field: 'Not a monomer: [Zzz]' for A[Zzz]C, and a problem for 115 Glu (too many atoms to draw in full)", zzz === "Not a monomer: [Zzz]" && /1,000/.test(big), `[Zzz]: "${zzz}"; 115 Glu: "${big}"`);
  });
  await step("U3", "The Residue labels chip", async () => {
    const before = doc(), at0 = hist().at;
    await openField();
    const chip = await until(() => [...document.querySelectorAll(".name-options button")].find((b) => b.textContent!.trim() === "Residue labels") as HTMLButtonElement | undefined, 2000);
    const was = chip?.getAttribute("aria-pressed");
    chip?.click();
    await wait(800);
    const after = doc(), labelled = after.atoms.filter((a: any) => a.inner && a.text).length, style = after.style?.sequences, steps = hist().at - at0;
    if (field()) key({ key: "Escape", code: "Escape" }, field());
    await wait(400);
    const atClosed = hist().at;
    key({ key: "z", code: "KeyZ", metaKey: true });
    await wait(600);
    const back = doc() === before || JSON.stringify(doc().atoms) === JSON.stringify(before.atoms);
    const turned = was === "true" ? labelled === 0 && after.atoms.length > before.atoms.length : labelled > 0;
    result("U3", "(S16) The Residue labels chip draws the document's chains again (as labels, or as atoms when it was on), sets its Sequences, in one undo step", !!chip && turned && style === (was === "true" ? "atoms" : "labels") && steps === 1 && back,
      `chip ${!!chip} (was pressed ${was}), labels ${labelled}, style ${style}, steps ${steps}, history ${at0} → ${atClosed} → ${hist().at} after ⌘Z, atoms ${before.atoms.length} → ${after.atoms.length} → ${doc().atoms.length}, undo gives it back ${back}`);
  });
  await step("U4", "Dark paper", async () => {
    const ink = () => { const n = { dark: 0, white: 0 }; for (const el of world().querySelectorAll("path, line, polyline, polygon, text, tspan")) { if (el.closest(".selection-marks, .handle")) continue; const s = getComputedStyle(el), c = s.stroke !== "none" ? s.stroke : s.fill, v = /rgba?\((\d+), (\d+), (\d+)/.exec(c); if (!v) continue; const l = (+v[1] + +v[2] + +v[3]) / 765; if (l < 0.3) n.dark++; if (l > 0.97) n.white++; } return n; };
    const light = ink(), h = histHook();
    h.queue.dispatch({ type: "amend", mol: { ...doc(), style: { ...(doc().style ?? {}), background: "dark" } } });
    await wait(800);
    const dark = ink();
    h.queue.dispatch({ type: "amend", mol: { ...doc(), style: { ...(doc().style ?? {}), background: "white" } } });
    await wait(500);
    result("U4", "(S20) Dark paper: the chain and its bracket draw in the light ink, none in the dark ink", light.dark > 0 && dark.dark === 0 && dark.white >= light.dark, `light ${JSON.stringify(light)}, dark ${JSON.stringify(dark)}; atoms ${doc().atoms.length}, shapes in the world ${world().querySelectorAll("*").length}, ${[...new Set([...world().querySelectorAll("*")].map((e) => e.tagName))].join(" ")}`);
  });
  await step("U5", "Zoom extremes", async () => {
    const r = world().getBoundingClientRect(), c = [r.left + r.width / 2, r.top + r.height / 2], counts: number[] = [];
    for (const dy of [400, -400]) {
      for (let k = 0; k < 40; k++) { (document.elementFromPoint(c[0], c[1]) ?? world()).dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: c[0], clientY: c[1], deltaY: dy, ctrlKey: true })); await wait(25); }
      await wait(500);
      counts.push(world().querySelectorAll("path, polygon").length);
    }
    result("U5", "(S20) Zoomed right out and right in: the chain still draws, no error", counts.every((n) => n > 0) && !w.__errors.length, `shapes ${counts.join(", ")}, errors ${w.__errors.length}`);
  });
  await step("U9", "Ends, a non-natural residue and a modified nucleotide typed; a drawn chain opened in the field and drawn again in place", async () => {
    // New words: Boc-, [Aib], -OMe (issue 27). The structure lands selected.
    await openField();
    type("peptide: Boc-A[Aib]GF-OMe");
    await wait(900);
    const shown = note(), at0 = hist().at, n0 = doc().atoms.length;
    key({ key: "Enter", code: "Enter" }, field());
    await until(() => doc().atoms.length > n0 && !field(), 8000);
    await wait(500);
    const landed = doc().atoms.length - n0, parts0 = parts(doc());
    // Structure > Sequence > Peptide… with the chain selected: the field holds its sequence.
    await palette("Peptide sequence");
    const f = await until(() => field(), 3000), held = f?.value ?? "";
    type("peptide: Boc-A[Aib]GGF-OMe");
    await wait(900);
    const at1 = hist().at, n1 = doc().atoms.length;
    key({ key: "Enter", code: "Enter" }, field());
    await until(() => doc().atoms.length !== n1 && !field(), 8000);
    await wait(500);
    const grew = doc().atoms.length - n1, steps = hist().at - at1, same = parts(doc()) === parts0;
    // A gapmer in DNA's words.
    await openField();
    type("dna: [LA]*[LT]*G*C*[LG]");
    await wait(900);
    const gap = note();
    key({ key: "Escape", code: "Escape" }, field());
    await wait(300);
    result("U9", "(issue 27) Boc-A[Aib]GF-OMe draws; with it selected, Structure > Sequence opens the field with its words; Gly typed in draws it again in place, one step; a gapmer reads", !shown && landed > 0 && hist().at - at0 >= 1 && held === "peptide: Boc-A[Aib]GF-OMe" && grew > 0 && steps === 1 && same && !gap,
      `under the field "${shown}", landed ${landed}, field held "${held}", grew ${grew}, steps ${steps}, structures the same ${same}, gapmer "${gap}"`);
  });
  await step("U10", "Return while the worker is busy, then the preview timer", async () => {
    await openField();
    type("peptide: GAVLIM");
    await wait(900);
    // The worker kept busy for some seconds, as by a slow preview: a long layout in the app's own worker (namepreview.ts
    // at the URL the app loaded it from, so the same copy).
    const url = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\/src\/namepreview\.ts(\?|$)/.test(n)).pop() ?? "/src/namepreview.ts";
    const np = await import(url), at0 = hist().at, n0 = doc().atoms.length;
    const busy = np.fullLayout(Array.from({ length: 80 }, (_, k) => `C${"C1CCC(CC1)".repeat(40 + (k % 20))}C`), true).result.then(() => performance.now());
    type("peptide: GAVLIMF");
    // Return at once, by a message (WebKit slows a covered window's timers to one a second), so the field's preview
    // timer fires after it, while the worker is still busy.
    await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = r; c.port2.postMessage(0); });
    const t0 = performance.now();
    key({ key: "Enter", code: "Enter" }, field());
    const still = (await busy) - t0;
    await until(() => doc().atoms.length > n0 && !field(), 8000);
    const drawn = doc().atoms.length - n0, open = field()?.value;
    if (open !== undefined) key({ key: "Escape", code: "Escape" }, field());
    await wait(300);
    result("U10", "The worker is busy, Return is pressed, then the preview timer fires: Return draws what is in the field, in one undo step", drawn > 0 && open === undefined && hist().at - at0 === 1 && still > 1000,
      `drawn ${drawn} atoms, field left "${open ?? ""}", steps ${hist().at - at0}, the worker was busy for ${Math.round(still)} ms after Return (the timer fires within a second)`);
  });
  await step("U11", "A chain opened in the field, the drawing changed before Return", async () => {
    const notes: string[] = [];
    let ok = true;
    // A drawing with one chain, AGF, opened in the field from Structure > Sequence > Peptide… (it lands selected).
    const opened = async () => {
      histHook().queue.dispatch({ type: "set", mol: { atoms: [], bonds: [], ...(doc().style ? { style: doc().style } : {}) } });
      await wait(400);
      await openField();
      type("peptide: AGF");
      await wait(900);
      key({ key: "Enter", code: "Enter" }, field());
      await until(() => doc().atoms.length > 0 && !field(), 8000);
      await wait(500);
      await palette("Peptide sequence");
      return (await until(() => field(), 3000))?.value === "peptide: AGF";
    };
    const mid = (m: any) => { const xs = m.atoms.map((a: any) => a.location[0]); return (Math.min(...xs) + Math.max(...xs)) / 2; };
    const chip = () => [...document.querySelectorAll(".name-options button")].find((b) => b.textContent!.trim() === "Residue labels") as HTMLButtonElement | undefined;
    // Gly typed in, Return: one structure (the chain drawn again in its place), the field closed. closes: the change may
    // close the field (Settings takes the focus), and then nothing more is drawn.
    const finish = async (how: string, at0: number, steps: number, where?: number, closes = false) => {
      const open = !!field();
      if (open) { type("peptide: AGGF"); await wait(900); key({ key: "Enter", code: "Enter" }, field()); await until(() => !field(), 8000); await wait(600); }
      const n = parts(doc()), d = hist().at - at0, x = mid(doc());
      const good = (open || closes) && n === 1 && d === (open ? steps : steps - 1) && (where === undefined || Math.abs(x - where) < 0.5);
      ok &&= good;
      notes.push(`${how}: field open ${open}, structures ${n}, steps ${d}${where === undefined ? "" : `, centre ${x.toFixed(2)} (was ${where.toFixed(2)})`}`);
    };
    // The Residue labels chip under the field.
    if (await opened()) { const at0 = hist().at, x = mid(doc()); chip()?.click(); await wait(800); await finish("the chip", at0, 2, x); } else { ok = false; notes.push("the chip: the field did not open"); }
    // Settings > Document > Style > Sequences, with the field open.
    if (await opened()) {
      const at0 = hist().at, x = mid(doc());
      document.querySelector(".actions-reopen")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await wait(300);
      (document.querySelector(".actions-settings") as HTMLElement | null)?.click();
      const page = await until(() => [...document.querySelectorAll(".module")].find((m) => m.textContent!.trim().startsWith("Document")) as HTMLElement | undefined, 3000);
      page?.click();
      await wait(600);
      const seg = await until(() => document.querySelector('[role="radiogroup"][aria-label="Sequences"]'), 3000), off = seg && [...seg.querySelectorAll("button")].find((b) => b.getAttribute("aria-checked") !== "true") as HTMLElement | undefined;
      off?.click();
      await wait(800);
      (document.querySelector(".settings-window .actions-close") as HTMLElement | null)?.click();
      await wait(500);
      if (!off) { ok = false; notes.push("Settings: no Sequences row"); } else await finish("Settings > Document > Sequences", at0, 2, x, true);
    } else { ok = false; notes.push("Settings: the field did not open"); }
    // Edit > Undo with the field open, as the menu runs it (Editor.tsx commands.undo): in the field it undoes the
    // field's typing (document.execCommand), never the drawing. A G typed after the codes goes; the drawing and its
    // history stay as they were, the field stays open on the chain, and Return draws one structure in its place.
    if (await opened()) {
      const at0 = hist().at, before = doc(), x = mid(doc());
      field()!.focus();
      field()!.setSelectionRange(field()!.value.length, field()!.value.length);
      document.execCommand("insertText", false, "G");
      await wait(300);
      const typed = field()?.value;
      const commands = hookList().map((h) => h.memoizedState).find((s) => s && typeof s === "object" && typeof s.current?.undo === "function" && typeof s.current?.select_all === "function")?.current;
      commands?.undo();
      await wait(600);
      const back = field()?.value;
      if (typed === "peptide: AGFG" && back === "peptide: AGF" && doc() === before && hist().at === at0) await finish("Edit > Undo in the field", at0, 1, x);
      else { ok = false; notes.push(`Edit > Undo in the field: typed "${typed}", after Undo "${back}", drawing kept ${doc() === before}, steps ${hist().at - at0}`); }
    } else { ok = false; notes.push("Edit > Undo in the field: the field did not open"); }
    // A move of the chain (as a nudge or Object > Flip from the menu would) while the field is open.
    if (await opened()) {
      const at0 = hist().at, x = mid(doc()) + 3;
      histHook().queue.dispatch({ type: "set", mol: { ...doc(), atoms: doc().atoms.map((a: any) => ({ ...a, location: [a.location[0] + 3, a.location[1] - 2, 0] })) } });
      await wait(500);
      await finish("a move", at0, 2, x);
    } else { ok = false; notes.push("a move: the field did not open"); }
    result("U11", "(issue 27) A chain opened in the field, then the Residue labels chip, Settings > Document > Sequences, Edit > Undo in the field (the field's typing goes, the drawing stays) or a move before Return: Return draws one structure in its place, no second one", ok, notes.join("; "));
  });
  // U12: Define nickname… for a label an older Octet kept as a nickname and that is refused now (OMe = OCC, ethoxy):
  // the dialog shows the refusal alone (no "You have the nickname OMe already"), and its button is Define, off.
  await step("U12", "Define nickname for a refused label the settings kept", async () => {
    const settingsHook = () => hookList().find((h) => h.memoizedState && Array.isArray(h.memoizedState.nicknames) && Array.isArray(h.memoizedState.monomers));
    // The menu's commands, as the drawing is now (each render makes them again).
    const commands = () => hookList().map((h) => h.memoizedState).find((x) => x && typeof x === "object" && typeof x.current?.define_nickname === "function")?.current;
    const kept = settingsHook().memoizedState.nicknames;
    settingsHook().queue.dispatch((st: any) => ({ ...st, nicknames: [{ label: "OMe", smiles: "OCC" }] }));
    // Methyl acetate, its methoxy selected.
    const A = (label: string, x: number, y: number) => ({ label, location: [x, y, 0] });
    histHook().queue.dispatch({ type: "set", mol: { atoms: [A("C", 0, 0), A("O", 1, 0), A("C", 2, 0), A("O", 2, 1), A("C", 3, 0)], bonds: [[0, 1, 1], [1, 2, 1], [2, 3, 2], [2, 4, 1]].map(([a, b, t]) => ({ atoms: [a, b], type: t })), ...(doc().style ? { style: doc().style } : {}) } });
    await wait(400);
    (document.activeElement as HTMLElement | null)?.blur();
    commands()?.select_all();
    await wait(300);
    const selected = hookList().find((h) => h.memoizedState instanceof Set && h.memoizedState.size === doc().atoms.length && [...h.memoizedState].every((i) => typeof i === "number"));
    selected?.queue.dispatch(new Set([0, 1]));
    await wait(300);
    commands()?.define_nickname();
    const input = await until(() => document.querySelector('input[aria-label="Nickname"]') as HTMLInputElement | null, 3000);
    if (!input) { settingsHook().queue.dispatch((st: any) => ({ ...st, nicknames: kept })); return result("U12", "Define nickname: the dialog opens", false, `commands ${!!commands()}, selection ${!!selected}`); }
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "OMe");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await wait(400);
    const card = input.closest(".dialog") ?? document.body, notes = [...card.querySelectorAll(".dialog-note")].map((n) => n.textContent!.trim());
    const primary = card.querySelector(".dialog-button.primary") as HTMLButtonElement | null;
    key({ key: "Escape", code: "Escape" }, input);
    await wait(400);
    settingsHook().queue.dispatch((st: any) => ({ ...st, nicknames: kept }));
    await wait(300);
    result("U12", "(issue 27) Define nickname… with a refused label the settings kept (OMe): the refusal alone, the button Define and off", notes.length === 1 && /^OMe is a peptide end in Octet's sequences\.$/.test(notes[0]) && primary?.textContent?.trim() === "Define" && primary.disabled,
      `notes ${JSON.stringify(notes)}, button "${primary?.textContent?.trim()}" ${primary?.disabled ? "off" : "on"}`);
  });
  await step("U6", "Escape while it builds", async () => {
    const before = doc();
    await openField();
    type(helmText.replace("C.Y.I", "C.Y.F"));
    key({ key: "Enter", code: "Enter" }, field());
    key({ key: "Escape", code: "Escape" }, field());
    await wait(1500);
    result("U6", "Escape right after Return: nothing more is drawn later", doc() === before || parts(doc()) === parts(before), `structures before ${parts(before)}, after ${parts(doc())}`);
  });
  out.errors = [...w.__errors];
  return JSON.stringify(out);
}

// --- Report -------------------------------------------------------------------------------------------------------
const failed = results.filter((r) => r.state === "failed"), skipped = results.filter((r) => r.state === "skipped");
for (const r of skipped) console.log(`  skipped ${r.id} ${r.title}: ${r.note}`);
for (const r of failed) console.error(`  FAILED ${r.id} ${r.title}\n         ${r.note}`);
console.log(`seqbridges-stress.check: ${results.length} cases, ${results.length - failed.length - skipped.length} ok, ${skipped.length} skipped, ${failed.length} failed${failed.length ? `: ${failed.map((r) => r.id).join(", ")}` : ""}`);
if (failed.length) process.exit(1);
