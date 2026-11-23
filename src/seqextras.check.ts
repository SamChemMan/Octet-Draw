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
const { fieldSeq, parseHelm, toHelm, toFasta, readSequence, withSequences, seqOf, seqProblem, linkResidues, chainText, inPlaceOf } = await import("./helm.ts");
const { buildAtoms, buildLabels, monomerRefs, MOST_BUILT_ATOMS, TOO_MANY_ATOMS } = await import("./seqbuild.ts");
const { residueName } = await import("./sequence.ts");
const { codeProblem } = await import("./monomers.ts");
const { readOct, writeOct, readCdx, writeCdx } = await import("./oct.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { fragments, insertMol, addCaption } = await import("./edit.ts");
const { unit } = await import("./nucleic.ts");

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
  const text = `peptide: ${word}-AGG-OMe`, atoms = built(text), labels = built(text, true);
  const want = chem.toInchi(acyl.startsWith("C1(") ? "O=C(N[C@@H](C)C(=O)NCC(=O)NCC(=O)OC)OCC1c2ccccc2-c2ccccc12" : `${acyl}N[C@@H](C)C(=O)NCC(=O)NCC(=O)OC`);
  assert.equal(chem.toInchi(atoms), want, `${word}: the compound`);
  assert.equal(chem.toInchi(labels), want, `${word}: as labels`);
  assert.deepEqual(labels.atoms.map((a) => a.text ?? a.label), [label, "Ala", "Gly", "Gly", "OMe"], word);
  const helm = `PEPTIDE1{${code}.A.G.G.[-OMe]}$$$$V2.0`;
  assert.equal(toHelm(atoms), helm, `${word}: HELM`);
  assert.equal(toHelm(labels), helm);
  assert.deepEqual(readSequence(helm), { text: `peptide: ${word === "Z" ? "Cbz" : word}-AGG-OMe` });
  assert.equal(toFasta(atoms), "AGG", "FASTA has the residues only");
}
const C_END: Record<string, [code: string, alcohol: string]> = { NH2: ["[am]", "N"], OMe: ["[-OMe]", "OC"], OtBu: ["[OtBu]", "OC(C)(C)C"], OBn: ["[-OBn]", "OCc1ccccc1"], NHMe: ["[NHMe]", "NC"], NHEt: ["[NHEt]", "NCC"] };
for (const [word, [code, tail]] of Object.entries(C_END)) {
  const text = `peptide: Boc-AGG-${word}`, atoms = built(text), labels = built(text, true);
  const want = chem.toInchi(`CC(C)(C)OC(=O)N[C@@H](C)C(=O)NCC(=O)NCC(=O)${tail}`);
  assert.equal(chem.toInchi(atoms), want, `${word}: the compound`);
  assert.equal(chem.toInchi(labels), want, `${word}: as labels`);
  assert.equal(labels.atoms[labels.atoms.length - 1].text, word);
  assert.equal(toHelm(atoms), `PEPTIDE1{[Boc].A.G.G.${code}}$$$$V2.0`, `${word}: HELM`);
  assert.equal(toHelm(labels), toHelm(atoms));
}
// A dipeptide with an end beyond Ac and NH2 drawn as atoms stays a small molecule (aspartame is Asp-Phe-OMe); as
// residue labels it is a sequence.
assert.equal(toHelm(built("peptide: Boc-AG-OMe")), undefined);
assert.equal(toHelm(built("peptide: Boc-AG-OMe", true)), "PEPTIDE1{[Boc].A.G.[-OMe]}$$$$V2.0");
// In either case, H- and -OH are the usual ends, and an end Octet does not have is refused with the list.
assert.deepEqual(seqOfText("peptide: fmoc-AG-otbu"), seqOfText("peptide: Fmoc-AG-OtBu"));
assert.deepEqual(seqOfText("peptide: H-AG-OH"), seqOfText("peptide: AG"));
const ENDS = "Ends can be H-, Ac-, Boc-, Cbz-, Fmoc-, Bz-, Biotin-, -OH, -NH2, -OMe, -OtBu, -OBn, -NHMe or -NHEt.";
for (const bad of ["peptide: Tos-AG", "peptide: AG-OEt", "peptide: Boc-Fmoc-AG", "peptide: A-G"]) assert.deepEqual(fieldSeq(bad), { problem: ENDS }, bad);
// Biotin has no HELM library code: HELM writes it as its SMILES (D-biotin), which other programs read, and Octet reads
// it back as Biotin.
{
  const atoms = built("peptide: Biotin-GGG"), labels = built("peptide: Biotin-GGG", true);
  assert.equal(chem.toInchiKey(chem.parseStructure("C1[C@H]2[C@@H]([C@@H](S1)CCCCC(=O)O)NC(=O)N2", false)), "YBJHBAHKTGYVGT-ZKWXMUAHSA-N", "D-biotin");
  assert.equal(chem.toInchi(atoms), chem.toInchi("C1[C@H]2[C@@H]([C@@H](S1)CCCCC(=O)NCC(=O)NCC(=O)NCC(=O)O)NC(=O)N2"));
  assert.equal(chem.toInchi(labels), chem.toInchi(atoms));
  const helm = toHelm(atoms)!;
  assert.ok(helm.startsWith("PEPTIDE1{[C1[C@H]2") && helm.endsWith("[*:2])NC(=O)N2].G.G.G}$$$$V2.0"), helm);
  assert.equal(toHelm(labels), helm);
  assert.deepEqual(readSequence(helm), { text: "peptide: Biotin-GGG" });
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
// ——— Modified nucleotides ———
// The HELM library's sugars (2'-O-methyl, 2'-fluoro, 2'-O-methoxyethyl, LNA) with every base and 5-methylcytosine, and the
// phosphorothioate, in RNA and DNA: in the words by label in brackets and * for a phosphorothioate, in HELM, as atoms and
// labels, read back from a drawn chain.
{
  const cases: [words: string, helm: string, fasta: string, labels: string][] = [
    ["dna: [LA]*[LT]*G*C*A*T*[LG]*[L5mC]", "RNA1{[LR](A)[sP].[LR](T)[sP].[dR](G)[sP].[dR](C)[sP].[dR](A)[sP].[dR](T)[sP].[LR](G)[sP].[LR]([5meC])}$$$$V2.0", "ATGCATGC", "LA sP LT sP dG sP dC sP dA sP dT sP LG sP L5mC"],
    ["rna: [mA][mC]*[fU][moeG]p", "RNA1{[mR](A)P.[mR](C)[sP].[fR](U)P.[MOE](G)P}$$$$V2.0", "ACUG", "mA P mC sP fU P moeG P"],
    ["dna: AC[d5mC]G", "RNA1{[dR](A)P.[dR](C)P.[dR]([5meC])P.[dR](G)}$$$$V2.0", "ACCG", "dA P dC P d5mC P dG"],
    ["rna: p[mA]*[mU]", "RNA1{P.[mR](A)[sP].[mR](U)}$$$$V2.0", "AU", "P mA sP mU"],
    ["rna: A[r5mC]G", "RNA1{R(A)P.R([5meC])P.R(G)}$$$$V2.0", "ACG", "rA P r5mC P rG"],
  ];
  for (const [words, helm, fasta, labelText] of cases) {
    const atoms = built(words), labels = built(words, true);
    assert.equal(chem.toInchi(atoms), chem.toInchi(labels), `${words}: as labels, the same compound`);
    assert.equal(labels.atoms.filter((a) => a.text).map((a) => a.text).join(" "), labelText, words);
    assert.equal(toHelm(atoms), helm, `${words}: HELM from atoms`);
    assert.equal(toHelm(labels), helm, `${words}: HELM from labels`);
    assert.deepEqual(readSequence(helm), { text: words }, `${words}: HELM back in words`);
    assert.equal(toFasta(atoms), fasta, `${words}: FASTA, the natural bases`);
    assert.equal(chem.toInchi(withSequences(atoms, "labels")), chem.toInchi(atoms));
    for (const back of [readOct(writeOct(labels, DEFAULT_STYLE), true).mol, readCdx(writeCdx(labels, DEFAULT_STYLE)).mol]) assert.equal(toHelm(back), helm, `${words}: files`);
  }
  // Each sugar's structure, written another way: the nucleosides of adenine as the free compounds.
  const NUCLEOSIDE: Record<string, string> = {
    mA: "CO[C@@H]1[C@H](O)[C@@H](CO)O[C@H]1n1cnc2c(N)ncnc12", fA: "F[C@@H]1[C@H](O)[C@@H](CO)O[C@H]1n1cnc2c(N)ncnc12",
    moeA: "COCCO[C@@H]1[C@H](O)[C@@H](CO)O[C@H]1n1cnc2c(N)ncnc12", LA: "OC[C@@]12CO[C@@H]([C@H](n3cnc4c(N)ncnc34)O1)[C@@H]2O",
  };
  for (const [label, free] of Object.entries(NUCLEOSIDE)) assert.equal(chem.toInchi(built(`rna: [${label}]`)), chem.toInchi(free), `${label}: the nucleoside`);
  // A phosphorothioate is the same compound however its S and O are drawn (P=S or P–SH).
  assert.equal(chem.toInchi(built("rna: A*A")), chem.toInchi(`${unit("A", false)}P(=S)(O)${unit("A", false)}`));
  // Refused: ribose and 2-deoxyribose together, a label of the other kind, * not between two, a code it does not know.
  assert.deepEqual(fieldSeq("RNA1{R(A)P.[dR](T)}$$$$V2.0"), { problem: "Octet reads HELM of RNA or DNA, not both in one chain." });
  assert.deepEqual(fieldSeq("rna: [d5mC]"), { problem: "Not a nucleotide: [d5mC]" });
  assert.deepEqual(fieldSeq("dna: [mX]"), { problem: "Not a nucleotide: [mX]" });
  assert.deepEqual(fieldSeq("dna: [P]"), { problem: "Not a nucleotide: [P]" });
  for (const bad of ["dna: A*", "dna: *A", "dna: A**C"]) assert.deepEqual(fieldSeq(bad), { problem: "Type * between two nucleotides." }, bad);
  for (const bad of ["RNA1{[xR](A)}$$$$V2.0", "RNA1{[mR](X)}$$$$V2.0", "RNA1{R(T)}$$$$V2.0", "RNA1{[sP].[sP]}$$$$V2.0", "RNA1{[mR](A)[sP][sP]}$$$$V2.0"]) assert.ok("problem" in (fieldSeq(bad) ?? {}), bad);
  // A gapmer (LNA, DNA with phosphorothioates) as long as draws in full, and one more says why; as labels it draws.
  let n = 2;
  while (!seqProblem(seqOfText(`dna: ${"[LT]*".repeat(n)}[LT]`), false)) n++;
  assert.ok("mol" in buildAtoms(seqOfText(`dna: ${"[LT]*".repeat(n - 1)}[LT]`)), `${n} LNA T draw`);
  assert.deepEqual(buildAtoms(seqOfText(`dna: ${"[LT]*".repeat(n)}[LT]`)), { problem: TOO_MANY_ATOMS });
  assert.equal(seqProblem(seqOfText(`dna: ${"[LT]*".repeat(n)}[LT]`), true), undefined);
}
// ——— A drawn chain back in the field ———
// A chain clicked with the Sequence tool (or selected, then Structure > Sequence) opens the field with its sequence in
// words, or HELM when words cannot say it; what the field then holds is drawn in its place: a residue put in or taken
// out by typing. Its caption stays with it, its centre and scale stay, and nothing else moves.
{
  const page = insertMol(built("peptide: Ac-[Aib]KAF-NH2", true), chem.indigoLayout("CC(=O)Oc1ccccc1C(=O)O"), [0, 20]).mol;
  const chain = fragments(page).find((g) => g.some((i) => page.atoms[i].text === "Aib"))!, aspirin = fragments(page).find((g) => !g.includes(chain[0]))!;
  const withCaption = addCaption(page, { text: "1", x: 0, y: -3, under: chain })[0];
  assert.equal(chainText(withCaption, chain), "peptide: Ac-[Aib]KAF-NH2", "as labels");
  assert.equal(chainText(withCaption, aspirin), undefined, "aspirin is no chain");
  // Typed: a Gly put in, the Lys taken out.
  const next = built("peptide: Ac-[Aib]GAF-NH2", true), out = inPlaceOf(withCaption, chain, next);
  assert.equal(toHelm(out), "PEPTIDE1{[ac].[Aib].G.A.F.[am]}$$$$V2.0");
  const mid = (m: Mol, atoms: number[]) => [0, 1].map((k) => { const v = atoms.map((i) => m.atoms[i].location[k]); return (Math.min(...v) + Math.max(...v)) / 2; });
  const newChain = fragments(out).find((g) => g.some((i) => out.atoms[i].text === "Aib"))!;
  assert.ok(mid(out, newChain).every((v, k) => Math.abs(v - mid(withCaption, chain)[k]) < 1e-6), "its centre kept");
  assert.deepEqual(out.captions?.[0].under?.slice().sort((p, q) => p - q), newChain.slice().sort((p, q) => p - q), "its caption goes with it");
  const asp = fragments(out).find((g) => !g.includes(newChain[0]))!;
  assert.deepEqual(asp.map((i) => out.atoms[i].location), aspirin.map((i) => page.atoms[i].location), "aspirin stays");
  // As atoms, a chain with links or a modified nucleotide: HELM when words cannot say it, words when they can.
  const ox = (buildAtoms((parseHelm("PEPTIDE1{C.Y.I.Q.N.C.P.L.G.[am]}$PEPTIDE1,PEPTIDE1,1:R3-6:R3$$$V2.0") as { seq: Seq }).seq) as { mol: Mol }).mol;
  assert.equal(chainText(ox, ox.atoms.map((_, i) => i)), "PEPTIDE1{C.Y.I.Q.N.C.P.L.G.[am]}$PEPTIDE1,PEPTIDE1,1:R3-6:R3$$$V2.0");
  const gap = built("dna: [LA]*[LT]*G*C");
  assert.equal(chainText(gap, gap.atoms.map((_, i) => i)), "dna: [LA]*[LT]*G*C");
}
// The editor's wiring: the Sequence tool's click over a chain, and Structure > Sequence with a chain selected.
{
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /if \(tool === "sequence"\) \{\n\s+const on = t\.atom \?\? \(t\.bond !== undefined \? doc\.bonds\[t\.bond\]\.atoms\[0\] : undefined\), chain = [^\n]*\n\s+if \(chain && editSequence\(chain\)\) return;/);
  assert.match(editor, /\[`insert_\$\{k\}`, \(\) => \{ if \(!selection\.size \|\| !editSequence\(selectedStructures\(\)\)\) insertSequence\(`\$\{k\}: `\); \}\]/);
  // Return draws it in place of the chain as it is then: found again when the drawing changed under the field (N42, U11).
  assert.match(editor, /const gone = e && naming !== undefined && isSequence\(naming\.trim\(\)\) \? \(e\.doc === doc \? e\.mark\.atoms : chainAgain\(doc, e\.mark, ownMonomers\)\) : undefined;\n\s+if \(gone\) \{ set\(inPlaceOf\(doc, gone, frag\)\); setNaming\(undefined\); return; \}/);
}
console.log("seqextras: ok");
