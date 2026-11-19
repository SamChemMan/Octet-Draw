// Run: node src/seqextras.check.ts. Octet's own monomers beyond the natural and D amino acids (issue 27): common
// non-natural α-amino acids by their IUPAC and HELM codes ([Aib], [Nle], [Orn], …) and a peptide's ends beyond H-, Ac-,
// -OH and -NH2 (Boc-, Fmoc-, Cbz- or Z-, Bz-, Biotin-; -OMe, -OtBu, -OBn, -NHMe, -NHEt). Each goes through the field's
// words, HELM both ways, atoms and residue labels (the same compound), a drawn chain read back, FASTA, the Sequences
// setting, Contract Label and the files, and the field refuses what it does not know.
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
const { fieldSeq, parseHelm, toHelm, toFasta, readSequence, withSequences, seqOf, seqProblem, linkResidues } = await import("./helm.ts");
const { buildAtoms, buildLabels, monomerRefs, MOST_BUILT_ATOMS, TOO_MANY_ATOMS } = await import("./seqbuild.ts");
const { residueName } = await import("./sequence.ts");
const { codeProblem } = await import("./monomers.ts");
const { readOct, writeOct, readCdx, writeCdx } = await import("./oct.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { fragments } = await import("./edit.ts");

type Seq = NonNullable<Extract<ReturnType<typeof fieldSeq>, { seq: unknown }>>["seq"];
const seqOfText = (t: string): Seq => { const r = fieldSeq(t); assert.ok(r && "seq" in r, `${t}: ${JSON.stringify(r)}`); return (r as { seq: Seq }).seq; };
const built = (t: string, labels = false): Mol => { const b = (labels ? buildLabels : buildAtoms)(seqOfText(t)); assert.ok("mol" in b, `${t}: ${JSON.stringify(b)}`); return (b as { mol: Mol }).mol; };

// ——— Non-natural amino acids ———
// Each one L (Aib and Sar have no centre), its structure written another way here: G-X-G as atoms and as residue
// labels is the same compound; HELM gives [X] and reads back; FASTA gives the natural analogue the HELM library gives.
const FREE: Record<string, [smiles: string, fasta: string]> = {
  Abu: ["CC[C@H](N)C(=O)O", "X"], Aib: ["CC(C)(N)C(=O)O", "X"], Cha: ["N[C@@H](CC1CCCCC1)C(=O)O", "A"], Cit: ["NC(=O)NCCC[C@H](N)C(=O)O", "X"],
  Dab: ["NCC[C@H](N)C(=O)O", "X"], Hcy: ["SCC[C@H](N)C(=O)O", "C"], Hse: ["OCC[C@H](N)C(=O)O", "S"], Hyp: ["O[C@@H]1C[C@H](NC1)C(=O)O", "P"],
  Nle: ["CCCC[C@H](N)C(=O)O", "L"], Nva: ["CCC[C@H](N)C(=O)O", "V"], Orn: ["NCCC[C@H](N)C(=O)O", "K"], Pen: ["CC(C)(S)[C@H](N)C(=O)O", "V"],
  Phg: ["N[C@H](C(=O)O)c1ccccc1", "G"], Sar: ["CNCC(=O)O", "G"],
};
for (const [code, [, letter]] of Object.entries(FREE)) {
  const text = `peptide: G[${code}]G`, atoms = built(text), labels = built(text, true);
  assert.equal(chem.toInchi(atoms), chem.toInchi(labels), `${code}: as labels, the same compound`);
  assert.deepEqual(labels.atoms.map((a) => a.text ?? a.label), ["H", "Gly", code, "Gly", "OH"], code);
  const helm = `PEPTIDE1{G.[${code}].G}$$$$V2.0`;
  assert.equal(toHelm(atoms), helm, `${code}: HELM from atoms`);
  assert.equal(toHelm(labels), helm, `${code}: HELM from labels`);
  assert.deepEqual((parseHelm(helm) as { seq: Seq }).seq, seqOfText(text), `${code}: HELM reads back`);
  assert.deepEqual(readSequence(helm), { text }, `${code}: a paste opens the field in words`);
  assert.equal(toFasta(atoms), `G${letter}G`, `${code}: FASTA`);
  // The residue alone, capped as the free amino acid, is the structure written here.
  const units = seqOf(atoms)!.units[0];
  assert.equal(residueName(atoms, new Set(units[1]), chem.toInchi, monomerRefs()), code, `${code}: Contract Label names it`);
  assert.equal(codeProblem(code), `[${code}] is one of Octet's own monomers.`, `${code}: no user's code`);
}
// The free amino acids themselves, as the builder makes each one H-X-OH.
for (const [code, [free]] of Object.entries(FREE)) assert.equal(chem.toInchi(built(`peptide: [${code}]`)), chem.toInchi(free), `${code}: the amino acid`);
// A side chain's link where the HELM library has one: Orn, Dab (N), Hcy, Pen (S). A disulfide between Pen and Hcy.
{
  const helm = "PEPTIDE1{[Pen].A.A.A.[Hcy]}$PEPTIDE1,PEPTIDE1,1:R3-5:R3$$$V2.0", seq = (parseHelm(helm) as { seq: Seq }).seq;
  const atoms = (buildAtoms(seq) as { mol: Mol }).mol, labels = (buildLabels(seq) as { mol: Mol }).mol;
  assert.equal(chem.toInchi(atoms), chem.toInchi(labels));
  assert.ok(atoms.bonds.some((b) => b.atoms.every((i) => atoms.atoms[i].label === "S")), "S–S");
  assert.equal(toHelm(atoms), helm);
  assert.equal(toHelm(labels), helm);
  assert.deepEqual(parseHelm("PEPTIDE1{[Aib].A.A.A.C}$PEPTIDE1,PEPTIDE1,1:R3-5:R3$$$V2.0"), { problem: "Unit 1 of PEPTIDE1 (Aib) has no R3." });
}
// The Sequences setting converts a chain of them both ways; a mixed chain too.
{
  const atoms = built("peptide: Ac-[Aib][Nle]K[Orn][Sar][Hyp]F-NH2"), to = withSequences(atoms, "labels");
  assert.deepEqual(to.atoms.filter((a) => a.text).map((a) => a.text), ["Ac", "Aib", "Nle", "Lys", "Orn", "Sar", "Hyp", "Phe", "NH2"]);
  assert.equal(chem.toInchi(to), chem.toInchi(atoms));
  assert.equal(chem.toInchi(withSequences(to, "atoms")), chem.toInchi(atoms));
}
// The field: [code] for each, a code Octet does not know refused as before.
assert.deepEqual(fieldSeq("peptide: A[Xyz]C"), { problem: "Not a monomer: [Xyz]" });
assert.deepEqual(fieldSeq("peptide: A[aib]C"), { problem: "Not a monomer: [aib]" }, "codes keep their case, as in HELM");
assert.deepEqual(fieldSeq("peptide: A[Boc]C"), { problem: "Not a monomer: [Boc]" }, "an end is typed as an end");

// ——— A peptide's ends ———
// Each end in words and in HELM, as atoms and as labels: the same compound as the SMILES written here; its label, its
// HELM code, read back from a drawn chain.
const N_END: Record<string, [label: string, helm: string, acyl: string]> = {
  Ac: ["Ac", "[ac]", "CC(=O)"], Boc: ["Boc", "[Boc]", "CC(C)(C)OC(=O)"], Cbz: ["Cbz", "[Cbz]", "c1ccccc1COC(=O)"], Z: ["Cbz", "[Cbz]", "c1ccccc1COC(=O)"],
  Fmoc: ["Fmoc", "[fmoc]", "C1(COC(=O))c2ccccc2-c2ccccc12"], Bz: ["Bz", "[Bz]", "c1ccccc1C(=O)"],
};
for (const [word, [label, code, acyl]] of Object.entries(N_END)) {
  const text = `peptide: ${word}-AG-OMe`, atoms = built(text), labels = built(text, true);
  const want = chem.toInchi(acyl.startsWith("C1(") ? "O=C(N[C@@H](C)C(=O)NCC(=O)OC)OCC1c2ccccc2-c2ccccc12" : `${acyl}N[C@@H](C)C(=O)NCC(=O)OC`);
  assert.equal(chem.toInchi(atoms), want, `${word}: the compound`);
  assert.equal(chem.toInchi(labels), want, `${word}: as labels`);
  assert.deepEqual(labels.atoms.map((a) => a.text ?? a.label), [label, "Ala", "Gly", "OMe"], word);
  const helm = `PEPTIDE1{${code}.A.G.[-OMe]}$$$$V2.0`;
  assert.equal(toHelm(atoms), helm, `${word}: HELM`);
  assert.equal(toHelm(labels), helm);
  assert.deepEqual(readSequence(helm), { text: `peptide: ${word === "Z" ? "Cbz" : word}-AG-OMe` });
  assert.equal(toFasta(atoms), "AG", "FASTA has the residues only");
}
const C_END: Record<string, [code: string, alcohol: string]> = { NH2: ["[am]", "N"], OMe: ["[-OMe]", "OC"], OtBu: ["[OtBu]", "OC(C)(C)C"], OBn: ["[-OBn]", "OCc1ccccc1"], NHMe: ["[NHMe]", "NC"], NHEt: ["[NHEt]", "NCC"] };
for (const [word, [code, tail]] of Object.entries(C_END)) {
  const text = `peptide: Boc-AG-${word}`, atoms = built(text), labels = built(text, true);
  const want = chem.toInchi(`CC(C)(C)OC(=O)N[C@@H](C)C(=O)NCC(=O)${tail}`);
  assert.equal(chem.toInchi(atoms), want, `${word}: the compound`);
  assert.equal(chem.toInchi(labels), want, `${word}: as labels`);
  assert.equal(labels.atoms[labels.atoms.length - 1].text, word);
  assert.equal(toHelm(atoms), `PEPTIDE1{[Boc].A.G.${code}}$$$$V2.0`, `${word}: HELM`);
}
// In either case, H- and -OH are the usual ends, and an end Octet does not have is refused with the list.
assert.deepEqual(seqOfText("peptide: fmoc-AG-otbu"), seqOfText("peptide: Fmoc-AG-OtBu"));
assert.deepEqual(seqOfText("peptide: H-AG-OH"), seqOfText("peptide: AG"));
const ENDS = "Ends can be H-, Ac-, Boc-, Cbz-, Fmoc-, Bz-, Biotin-, -OH, -NH2, -OMe, -OtBu, -OBn, -NHMe or -NHEt.";
for (const bad of ["peptide: Tos-AG", "peptide: AG-OEt", "peptide: Boc-Fmoc-AG", "peptide: A-G"]) assert.deepEqual(fieldSeq(bad), { problem: ENDS }, bad);
// Biotin has no HELM library code: HELM writes it as its SMILES (D-biotin), which other programs read, and Octet reads
// it back as Biotin.
{
  const atoms = built("peptide: Biotin-GG"), labels = built("peptide: Biotin-GG", true);
  assert.equal(chem.toInchiKey(chem.parseStructure("C1[C@H]2[C@@H]([C@@H](S1)CCCCC(=O)O)NC(=O)N2", false)), "YBJHBAHKTGYVGT-ZKWXMUAHSA-N", "D-biotin");
  assert.equal(chem.toInchi(atoms), chem.toInchi("C1[C@H]2[C@@H]([C@@H](S1)CCCCC(=O)NCC(=O)NCC(=O)O)NC(=O)N2"));
  assert.equal(chem.toInchi(labels), chem.toInchi(atoms));
  const helm = toHelm(atoms)!;
  assert.ok(helm.startsWith("PEPTIDE1{[C1[C@H]2") && helm.endsWith("[*:2])NC(=O)N2].G.G}$$$$V2.0"), helm);
  assert.equal(toHelm(labels), helm);
  assert.deepEqual(readSequence(helm), { text: "peptide: Biotin-GG" });
}
// An end's label is a label with its atoms: Expand Label, the setting and files keep the compound; 1.1.2-style files
// with Ac and NH2 labels with no atoms read as before.
{
  const labels = built("peptide: Boc-A[Aib]G-NHMe", true), want = chem.toInchi(labels);
  for (const back of [readOct(writeOct(labels, DEFAULT_STYLE), true).mol, readCdx(writeCdx(labels, DEFAULT_STYLE)).mol]) {
    assert.equal(chem.toInchi(back), want);
    assert.equal(toHelm(back), "PEPTIDE1{[Boc].A.[Aib].G.[NHMe]}$$$$V2.0");
  }
  assert.equal(chem.toInchi(withSequences(labels, "atoms")), want);
}
// The Bond tool from an end's label is no link: Boc is a label as any other.
{
  const two = built("peptide: Boc-CAC", true), boc = two.atoms.findIndex((a) => a.text === "Boc"), cys = two.atoms.findIndex((a) => a.text === "Cys");
  assert.equal(linkResidues(two, boc, two.atoms.length - 1), undefined, "Boc bonds as a label does");
  assert.ok(cys >= 0);
}

// ——— Limits ———
// As atoms, up to MOST_BUILT_ATOMS: the field's count agrees with the builder at the largest chain of each that fits
// and at one more.
for (const code of ["Cha", "Aib", "Sar"]) {
  let n = 1;
  while (!seqProblem(seqOfText(`peptide: ${`[${code}]`.repeat(n + 1)}`), false)) n++;
  const fits = buildAtoms(seqOfText(`peptide: ${`[${code}]`.repeat(n)}`)), over = buildAtoms(seqOfText(`peptide: ${`[${code}]`.repeat(n + 1)}`));
  assert.ok("mol" in fits && fits.mol.atoms.length <= MOST_BUILT_ATOMS, `${n} ${code} draw`);
  assert.deepEqual(over, { problem: TOO_MANY_ATOMS }, `${n + 1} ${code} do not`);
  assert.equal(seqProblem(seqOfText(`peptide: ${`[${code}]`.repeat(n + 1)}`), true), undefined, "as labels they do");
}
// A long mixed chain as residue labels builds quickly.
{
  const text = `peptide: Fmoc-${"[Aib][Nle]K[Orn][Hyp]".repeat(100)}-OtBu`, t = performance.now(), m = built(text, true);
  assert.ok(performance.now() - t < 1500, `500 residues as labels: ${Math.round(performance.now() - t)} ms`);
  assert.equal(fragments(m).length, 1);
}
console.log("seqextras: ok");
