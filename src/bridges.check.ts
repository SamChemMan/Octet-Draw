// Run: node src/bridges.check.ts. Sequences with links (issue 27): HELM read into one model (helm.ts parseHelm), hostile
// HELM refused quickly, every sequence built from its monomers as atoms and as residue labels (seqbuild.ts) as the same
// compound as its SMILES written by hand, laid out along straight backbones with each link a bracket clear of the
// residues between (chain.ts), the bracket a bond like any other (hit, flipped, saved), HELM and FASTA written back in
// Octet's form, and the Bond tool joining two residue labels at their free links.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Mol } from "./render.ts";

const gl = globalThis as Record<string, unknown>;
gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
gl.window = globalThis;
gl.self = { location: { origin: "file://" } };
gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
await chem.ready;
const { parseHelm, helmOf, toHelm, toFasta, readSequence, fieldSeq, linkResidues } = await import("./helm.ts");
const { buildAtoms, buildLabels } = await import("./seqbuild.ts");
const { peptideSmiles } = await import("./peptide.ts");
const { bracketOf, bracketPath } = await import("./render.ts");
const { bondAt, flipAtoms, rotateAtoms, fragments, dragBond, labelHooks } = await import("./edit.ts");
const { serialize, parse } = await import("./file.ts");
const { toCdxml, fromCdxml } = await import("./cdxml.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { problems } = await import("./check.ts");

type Seq = NonNullable<Extract<ReturnType<typeof parseHelm>, { seq: unknown }>>["seq"];
const seqOfHelm = (h: string): Seq => { const p = parseHelm(h); assert.ok(p && "seq" in p, `${h.slice(0, 40)}: reads`); return (p as { seq: Seq }).seq; };
const atoms = (h: string) => { const b = buildAtoms(seqOfHelm(h)); assert.ok("mol" in b, `${h.slice(0, 40)}: built`); return (b as { mol: Mol }).mol; };
const labels = (h: string) => { const b = buildLabels(seqOfHelm(h)); assert.ok("mol" in b, `${h.slice(0, 40)}: built as labels`); return (b as { mol: Mol }).mol; };
const time = (run: () => unknown, n = 5) => { const ts: number[] = []; for (let k = 0; k < n; k++) { const t = performance.now(); run(); ts.push(performance.now() - t); } return ts.sort((p, q) => p - q)[n >> 1]; };

// ——— The stress list (plan section 11) ———
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
  twoNucleic: "RNA1{[dR](A)P.[dR](T)}|RNA2{R(G)P.R(U)}$$$$V2.0",
  ends: "PEPTIDE1{[ac].A.C.[am]}$$$$V2.0",
  // A phosphoserine Octet has no code for, as its own SMILES (in Octet's form: the structure its InChI gives).
  inline: "PEPTIDE1{A.[C(OP(=O)(O)O)[C@](N[*:1])(C(=O)[*:2])[H]].C.G}$$$$V2.0",
};
// The same compounds written by hand as SMILES (stereo too).
const SMILES: Record<string, string> = {
  oxytocin: "N[C@@H](CS1)C(=O)N[C@@H](Cc2ccc(O)cc2)C(=O)N[C@@H]([C@@H](C)CC)C(=O)N[C@@H](CCC(N)=O)C(=O)N[C@@H](CC(N)=O)C(=O)N[C@@H](CS1)C(=O)N3CCC[C@H]3C(=O)N[C@@H](CC(C)C)C(=O)NCC(N)=O",
  vasopressin: "N[C@@H](CS1)C(=O)N[C@@H](Cc2ccc(O)cc2)C(=O)N[C@@H](Cc2ccccc2)C(=O)N[C@@H](CCC(N)=O)C(=O)N[C@@H](CC(N)=O)C(=O)N[C@@H](CS1)C(=O)N3CCC[C@H]3C(=O)N[C@@H](CCCNC(=N)N)C(=O)NCC(N)=O",
  cyclic: "O=C1[C@H](CCCNC(=N)N)NC(=O)[C@H](C(C)C)NC(=O)[C@@H](Cc2ccccc2)NC(=O)[C@H](CC(=O)O)NC(=O)CN1",
  lactam: "C[C@H](N)C(=O)N[C@H]1CCCCNC(=O)CC[C@@H](C(=O)N[C@@H](C)C(=O)O)NC(=O)[C@H](C)NC(=O)[C@H](C)NC(=O)[C@H](C)NC1=O",
  dAmino: "N[C@H](Cc1ccccc1)C(=O)N[C@H](Cc1c[nH]c2ccccc12)C(=O)N[C@@H](CCCCN)C(=O)N[C@@H]([C@@H](C)O)C(=O)O",
  ends: "CC(=O)N[C@@H](C)C(=O)N[C@@H](CS)C(N)=O",
};

// J1: HELM in. Each stress HELM reads; hostile HELM gives a short problem, quickly, quoting at most 40 characters.
for (const [k, h] of Object.entries(S)) assert.ok("seq" in parseHelm(h)!, k);
{
  const s = seqOfHelm(S.insulin);
  assert.equal(s.chains.length, 2);
  assert.deepEqual(s.links.map((l) => l.map((e) => `${e.chain}.${e.unit}.R${e.r}`).join("-")), ["0.5.R3-0.10.R3", "0.6.R3-1.6.R3", "0.19.R3-1.18.R3"]);
  assert.deepEqual(seqOfHelm(S.dAmino).chains[0].units.map((u) => u.code), ["dF", "dW", "K", "T"]);
}
const units = (n: number) => Array.from({ length: n }, () => "A").join(".");
const hostile: [string, RegExp][] = [
  [`PEPTIDE1{${"A.".repeat(10_001)}A}$$$$`, /20,000 characters/],
  [`PEPTIDE1{${units(1001)}}$$$$`, /1,000 monomers/],
  [`PEPTIDE1{A.[${"(".repeat(33)}C${")".repeat(33)}].A}$$$$`, /nested too deep/],
  ["PEPTIDE1{C.A.C}$PEPTIDE1,PEPTIDE1,99999:R3-3:R3$$$", /no unit 99999/],
  ["PEPTIDE1{C.A.C}$PEPTIDE1,PEPTIDE1,1:R9-3:R3$$$", /R1, R2 and R3, not R9/],
  ["PEPTIDE1{C.A.C}$PEPTIDE1,PEPTIDE1,1:R3-1:R3$$$", /to itself/],
  ["PEPTIDE1{C.A.C}$PEPTIDE1,PEPTIDE1,2:R3-3:R3$$$", /\(A\) has no R3/],
  ["PEPTIDE1{C.A.C}$PEPTIDE1,PEPTIDE1,3:R1-1:R3$$$", /two links at R1/],
  ["PEPTIDE1{C.A.C.C}$PEPTIDE1,PEPTIDE1,1:R3-3:R3|PEPTIDE1,PEPTIDE1,1:R3-4:R3$$$", /two links at R3/],
  ["PEPTIDE1{C.A.C}$PEPTIDE7,PEPTIDE1,1:R3-3:R3$$$", /PEPTIDE7 is not defined/],
  ["CHEM1{[PEG2]}$$$$", /CHEM or BLOB/],
  ["PEPTIDE1{A.C$$$$", /does not pair up/],
  ["PEPTIDE1{A.C}}$$$$", /does not pair up/],
  ["PEPTIDE1{A.\u0000C}$$$$", /not text/],
  ["PEPTIDE1{A.<script>alert(1)</script>}$$$$", /does not know the HELM monomer/],
  ["PEPTIDE1{A.[Zzz].C}$$$$V2.0", /Octet does not know the HELM monomer \[Zzz\]\./],
  ["PEPTIDE1{}$$$$V2.0", /PEPTIDE1 has no monomers/],
  ["RNA1{R(A)P.R(C)}|PEPTIDE1{C}$RNA1,PEPTIDE1,1:R3-1:R3$$$", /between peptides only/],
];
for (const [h, want] of hostile) {
  const ms = time(() => parseHelm(h), 3), r = parseHelm(h);
  assert.ok(r && "problem" in r, `${h.slice(0, 30)}: refused`);
  const p = (r as { problem: string }).problem;
  assert.match(p, want, h.slice(0, 40));
  assert.ok(p.length < 140 && !p.includes("A.A.A.A.A.A.A.A.A.A.A.A.A.A.A.A.A.A.A.A.A"), `${p}: short, the input quoted briefly`);
  assert.ok(ms < 20, `${h.slice(0, 30)}: ${ms.toFixed(1)} ms`);
}
assert.equal(parseHelm("$$$$"), undefined, "not HELM");
assert.deepEqual(parseHelm("PEPTIDE1{A.C}$$$$V2.0"), { seq: { chains: [{ kind: "peptide", units: [{ code: "A" }, { code: "C" }] }], links: [] }, notes: [] });
{
  const notes = parseHelm("RNA1{R(A)P.R(C)}|RNA2{R(G)P.R(U)}$RNA1,RNA2,2:pair-5:pair$$$V2.0") as { notes: string[] };
  assert.deepEqual(notes.notes, ["Octet left out the base pairs."]);
  const big = `PEPTIDE1{${units(999)}}$$$$V2.0`, ms = time(() => parseHelm(big));
  assert.ok(ms < 20, `a 999-residue HELM (${big.length} characters) reads in ${ms.toFixed(1)} ms`);
}
// The field's words and HELM, one reader (fieldSeq): D codes in brackets, problems as the field says them.
assert.deepEqual((fieldSeq("peptide: [dF][dW]KT") as { seq: Seq }).seq, seqOfHelm(S.dAmino));
assert.deepEqual(fieldSeq("peptide: A[Zzz]C"), { problem: "Not a monomer: [Zzz]" });
assert.deepEqual(fieldSeq("peptide: AXC"), { problem: "Not an amino acid: X" });
assert.deepEqual(fieldSeq("peptide: A[dF"), { problem: "Type ] after the code." });
assert.deepEqual(fieldSeq("peptide: []"), { problem: "Not a monomer: []" });
assert.equal(fieldSeq("peptide: "), undefined, "no codes yet: no structure and no problem");
assert.deepEqual(readSequence(S.oxytocin), { text: S.oxytocin }, "pasted HELM with links opens as HELM");
assert.deepEqual(readSequence("PEPTIDE1{[dF].A}$$$$V2.0"), { text: "peptide: [dF]A" }, "one chain with no links opens in Octet's words");
assert.deepEqual(readSequence(">one\nW"), { text: "peptide: W" }, "a FASTA of one letter");

// J2: built from monomers, as atoms and as labels, the same compound as by hand; Copy As HELM gives it back.
for (const [k, h] of Object.entries(S)) {
  const a = atoms(h), l = labels(h);
  if (SMILES[k]) assert.equal(chem.toInchi(a), chem.toInchi(SMILES[k]), `${k}: the compound`);
  assert.equal(chem.toInchi(l), chem.toInchi(a), `${k}: labels, the same compound`);
  assert.equal(toHelm(a), h, `${k}: HELM from atoms`);
  assert.equal(toHelm(l), h, `${k}: HELM from labels`);
}
assert.equal(toFasta(atoms(S.dAmino)), "FWKT", "D monomers as their natural letters");
assert.equal(toFasta(atoms(S.insulin)), "GIVEQCCTSICSLYQLENYCN\nFVNQHLCGSHLVEALYLVCGERGFFYTPKT");
assert.equal(toFasta(atoms(S.inline)), "AXCG");
{
  const d = chem.toInchi(atoms(S.dAmino))!, l = chem.toInchi(atoms("PEPTIDE1{F.W.K.T}$$$$V2.0"))!;
  assert.ok(d.split("/t")[0] === l.split("/t")[0] && d !== l, "D-Phe and D-Trp: the same atoms, the hands inverted");
}
// HELM from another program (links written the other way round, out of order) comes back in Octet's form.
assert.equal(toHelm(atoms("PEPTIDE1{C.A.C.A.C.A.C.A}$PEPTIDE1,PEPTIDE1,7:R3-1:R3|PEPTIDE1,PEPTIDE1,5:R3-3:R3$$$")), S.nested);
assert.equal(helmOf(seqOfHelm(S.insulin)), S.insulin, "helmOf writes what parseHelm reads");
assert.equal(toHelm(atoms("PEPTIDE1{A.[N([*:1])[C@H](C([*:2])=O)COP(O)(O)=O].C.G}$$$$")), S.inline, "a monomer's SMILES written another way");

// J2 speed: a 60-mer built and laid out from its monomers, against 1.1.2's path (its SMILES laid out by Indigo and
// straightened), interleaved medians.
{
  const text = `peptide: ${"ACDEFGHIKLMNPQRSTVWY".repeat(3)}`, seq = (fieldSeq(text) as { seq: Seq }).seq, smiles = peptideSmiles(text)!;
  buildAtoms(seq);
  const now: number[] = [], before: number[] = [];
  for (let k = 0; k < 3; k++) { now.push(time(() => buildAtoms(seq), 1)); before.push(time(() => chem.fullMol(smiles), 1)); }
  const a = now.sort((p, q) => p - q)[1], b = before.sort((p, q) => p - q)[1];
  assert.equal(chem.toInchi((buildAtoms(seq) as { mol: Mol }).mol), chem.toInchi(smiles), "60-mer: the same compound");
  assert.ok(a < 100 && a < b, `60-mer: ${a.toFixed(0)} ms, 1.1.2's path ${b.toFixed(0)} ms`);
  console.log(`bridges: a 60-mer built in ${a.toFixed(0)} ms (1.1.2's path: ${b.toFixed(0)} ms)`);
}
// S8: 500 residues as labels in under a second, HELM back unchanged; as atoms, too large.
{
  const h = `PEPTIDE1{${Array.from({ length: 500 }, (_, k) => "ACDEFGHIKLMNPQRSTVWY"[k % 20]).join(".")}}$$$$V2.0`, seq = seqOfHelm(h);
  const ms = time(() => buildLabels(seq), 3), l = (buildLabels(seq) as { mol: Mol }).mol;
  assert.ok(ms < 1000, `500 residues as labels: ${ms.toFixed(0)} ms`);
  assert.equal(toHelm(l), h, "500 residues: HELM back");
  assert.deepEqual(buildAtoms(seq), { problem: "Up to 1,000 atoms. Choose Residue labels." });
  console.log(`bridges: 500 residues as labels in ${ms.toFixed(0)} ms`);
}

// J3: the layout. Each backbone on two heights, no atom on another, no bond across another, each bracket clear of every
// atom between its ends, both residues of a link on its side.
const cross = (a: number[], b: number[], c: number[], d: number[]) => { const s = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return s(a, b, c) * s(a, b, d) < -1e-9 && s(c, d, a) * s(c, d, b) < -1e-9; };
for (const k of ["oxytocin", "vasopressin", "lactam", "insulinA", "insulin", "cyclic", "nested", "crossing"] as const) {
  const m = atoms(S[k]), at = (i: number) => m.atoms[i].location;
  for (let i = 0; i < m.atoms.length; i++) for (let j = i + 1; j < m.atoms.length; j++) assert.ok(Math.hypot(at(i)[0] - at(j)[0], at(i)[1] - at(j)[1]) > 0.3, `${k}: atoms ${i} and ${j} apart`);
  const segs = m.bonds.flatMap((b) => { const r = bracketOf(b), p = r ? bracketPath(at(b.atoms[0]), at(b.atoms[1]), r) : [at(b.atoms[0]), at(b.atoms[1])]; return p.slice(1).map((q, n) => ({ b, s: [p[n], q] })); });
  for (let x = 0; x < segs.length; x++) for (let y = x + 1; y < segs.length; y++) {
    if (segs[x].b === segs[y].b || segs[x].b.atoms.some((i) => segs[y].b.atoms.includes(i))) continue;
    assert.ok(!cross(segs[x].s[0], segs[x].s[1], segs[y].s[0], segs[y].s[1]), `${k}: no bond crosses another`);
  }
  const routed = m.bonds.filter((b) => bracketOf(b));
  assert.equal(routed.length, { oxytocin: 1, vasopressin: 1, lactam: 1, insulinA: 1, insulin: 1, cyclic: 1, nested: 2, crossing: 2 }[k], `${k}: brackets`);
  for (const b of routed) {
    const [p, , , q] = bracketPath(at(b.atoms[0]), at(b.atoms[1]), bracketOf(b)), d = [q[0] - p[0], q[1] - p[1]], l = Math.hypot(d[0], d[1]), n = [-d[1] / l, d[0] / l], h = bracketOf(b);
    for (let i = 0; i < m.atoms.length; i++) {
      if (b.atoms.includes(i)) continue;
      const t = ((at(i)[0] - p[0]) * d[0] + (at(i)[1] - p[1]) * d[1]) / l, off = ((at(i)[0] - p[0]) * n[0] + (at(i)[1] - p[1]) * n[1]) * Math.sign(h);
      if (t > 0 && t < l) assert.ok(off < Math.abs(h) - 0.45, `${k}: the bracket clears atom ${i}`);
    }
  }
  assert.equal(chem.toInchi(chem.cleanUp(m)), chem.toInchi(m), `${k}: Clean Up keeps the compound`);
  assert.equal(chem.cleanUp(m).bonds.filter((b) => bracketOf(b)).length, routed.length, `${k}: Clean Up keeps the brackets`);
}
{
  // Insulin: chain A above B, the first link between them upright; A's own link above A.
  const m = atoms(S.insulin), s = m.atoms.flatMap((a, i) => (a.label === "S" ? [i] : [])), at = (i: number) => m.atoms[i].location;
  const between = m.bonds.filter((b) => b.atoms.every((i) => s.includes(i)) && !bracketOf(b)), inA = m.bonds.find((b) => bracketOf(b))!;
  assert.equal(between.length, 2, "two links between the chains");
  assert.ok(between.some((b) => Math.abs(at(b.atoms[0])[0] - at(b.atoms[1])[0]) < 0.6), "the first link upright");
  assert.ok(bracketPath(at(inA.atoms[0]), at(inA.atoms[1]), bracketOf(inA))[1][1] > at(inA.atoms[0])[1], "A6–A11 above");
}

// J4: a bracket is a bond like any other: hit on each of its lines, mirrored by a flip, turned by a rotation, saved in
// Octet's files (straight in CDXML), and the structure check tests its path.
{
  const m = atoms(S.oxytocin), k = m.bonds.findIndex((b) => bracketOf(b)), b = m.bonds[k], path = bracketPath(m.atoms[b.atoms[0]].location, m.atoms[b.atoms[1]].location, b.route!);
  for (let n = 1; n < 4; n++) assert.equal(bondAt(m, [(path[n - 1][0] + path[n][0]) / 2, (path[n - 1][1] + path[n][1]) / 2]), k, `hit on line ${n}`);
  const all = new Set(m.atoms.map((_, i) => i)), flipped = flipAtoms(m, all, "vertical");
  assert.equal(flipped.bonds[k].route, -b.route!, "a flip mirrors it");
  const fp = bracketPath(flipped.atoms[b.atoms[0]].location, flipped.atoms[b.atoms[1]].location, flipped.bonds[k].route!);
  assert.ok(Math.abs(fp[1][1] - (2 * ((Math.min(...m.atoms.map((a) => a.location[1])) + Math.max(...m.atoms.map((a) => a.location[1]))) / 2) - path[1][1])) < 1e-6, "the mirror image");
  const turned = rotateAtoms(m, all, 37), tp = bracketPath(turned.atoms[b.atoms[0]].location, turned.atoms[b.atoms[1]].location, turned.bonds[k].route!);
  assert.ok(Math.abs(Math.hypot(tp[1][0] - tp[0][0], tp[1][1] - tp[0][1]) - Math.abs(b.route!)) < 1e-6, "a turn keeps it");
  assert.equal(parse(serialize(m)).bonds[k].route, b.route, ".oct keeps it");
  assert.equal(chem.toInchi(fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol), chem.toInchi(m), "CDXML: the same compound");
  assert.throws(() => parse(serialize(m).replace(`"route": ${b.route}`, '"route": 1e9')), /damaged/, "a damaged bracket is refused");
  const near = problems(m).filter((w) => /very close to a bond/.test(w.message));
  assert.equal(near.length, 0, "no atom near the bracket");
  assert.ok(bracketOf({ ...b, type: 2 }) === 0 && bracketOf({ ...b, stereo: 1 }) === 0, "only a plain single bond has one");
}

// J5: labels laid out: a linked chain of up to 40 in one row, no label on another; insulin as two rows.
for (const k of ["oxytocin", "insulin", "nested", "crossing", "cyclic"] as const) {
  const m = labels(S[k]), ls = m.atoms.filter((a) => a.text || a.label === "H");
  for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) assert.ok(Math.hypot(ls[i].location[0] - ls[j].location[0], ls[i].location[1] - ls[j].location[1]) > 2, `${k}: labels apart`);
  const ys = new Set(ls.map((a) => Math.round(a.location[1] * 100)));
  assert.equal(ys.size, k === "insulin" ? 2 : 1, `${k}: rows`);
  assert.equal(chem.toInchi(chem.cleanUp(m)), chem.toInchi(m), `${k}: Clean Up keeps the compound`);
}

// J7: the Bond tool from one Cys label to another joins their S atoms, a bracket over the row; Ala to Ala does nothing.
{
  let said = "";
  labelHooks.link = (m, i, j) => { const r = linkResidues(m, i, j); if (r && "problem" in r) { said = r.problem; return m; } return r; };
  const m = labels("PEPTIDE1{C.Y.I.Q.N.C.P.L.G.[am]}$$$$V2.0"), cys = m.atoms.flatMap((a, i) => (a.text === "Cys" ? [i] : []));
  const linked = dragBond(m, cys[0], [m.atoms[cys[1]].location[0], m.atoms[cys[1]].location[1]]);
  assert.equal(chem.toInchi(linked), chem.toInchi(SMILES.oxytocin), "oxytocin");
  assert.equal(toHelm(linked), S.oxytocin);
  assert.ok(linked.bonds.some((b) => bracketOf(b) && b.ports?.every((p) => p >= 0)), "a bracket joining the S atoms");
  const ala = labels("PEPTIDE1{A.A.A.A}$$$$V2.0"), a = ala.atoms.flatMap((x, i) => (x.text === "Ala" ? [i] : []));
  assert.equal(dragBond(ala, a[1], [ala.atoms[a[3]].location[0], ala.atoms[a[3]].location[1]]), ala, "a middle Ala has nothing free: no change");
  assert.equal(said, "Ala has no free link. Expand the label to bond to its atoms.");
  // The two ends of a chain have their free ends: a bond between them closes the ring, head to tail, a bracket below.
  const ring = dragBond(ala, a[0], [ala.atoms[a[3]].location[0], ala.atoms[a[3]].location[1]]);
  assert.equal(toHelm(ring), "PEPTIDE1{A.A.A.A}$PEPTIDE1,PEPTIDE1,1:R1-4:R2$$$V2.0");
  // A Cys to an atom of another structure joins by its S.
  const two: Mol = { ...m, atoms: [...m.atoms, { label: "C", location: [0, 10, 0] }] };
  const methyl = dragBond(two, cys[0], [0, 10]);
  assert.equal(chem.toInchi(methyl).split("/")[1], chem.toInchi("CSC[C@H](N)C(=O)N[C@@H](Cc1ccc(O)cc1)C(=O)N[C@@H]([C@@H](C)CC)C(=O)N[C@@H](CCC(N)=O)C(=O)N[C@@H](CC(N)=O)C(=O)N[C@@H](CS)C(=O)N2CCC[C@H]2C(=O)N[C@@H](CC(C)C)C(=O)NCC(N)=O")!.split("/")[1], "S-methyl");
  labelHooks.link = undefined;
}
assert.equal(fragments(atoms(S.twoNucleic)).length, 2, "two nucleic acid chains, two structures");
console.log("bridges: ok");
