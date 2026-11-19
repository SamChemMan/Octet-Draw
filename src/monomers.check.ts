// Run: node src/monomers.check.ts. Peptide monomers of the user's own (issue 27): Structure > Define Monomer… makes one
// from a drawn structure with R1 and R2 (and maybe R3) labels (seqbuild.ts monomerOf), refuses a structure or a code
// that will not do, and the field, HELM, residue labels and Copy As use it both ways. A drawing keeps a copy of each it
// uses, which its own lookups find first, through .oct, CDXML, CDX and the clipboard, and no file adds to the user's
// own. HELM monomer library files are written and read, hostile ones refused.
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
const { monomerOf, buildAtoms, buildLabels, helmLibrary, monomerRefs } = await import("./seqbuild.ts");
const { codeProblem, withMonomer, readMonomers, readHelmLibrary, monomer, smilesKey, elementKey, MOST_OWN_MONOMERS } = await import("./monomers.ts");
const { fieldSeq, parseHelm, toHelm, toFasta, withSequences, seqBuilt, readSequence, seqOf, importableMonomer } = await import("./helm.ts");
const { residueName } = await import("./sequence.ts");
const { serialize, parse } = await import("./file.ts");
const { toCdxml, fromCdxml } = await import("./cdxml.ts");
const { readOct, writeOct, readCdx, writeCdx } = await import("./oct.ts");
const { insertMol, merge, fragments } = await import("./edit.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");

type Seq = NonNullable<Extract<ReturnType<typeof fieldSeq>, { seq: unknown }>>["seq"];
// A structure drawn with its links labelled: noble gases stand for the R labels until they are made labels.
const drawn = (smiles: string, marks: Record<string, string>): Mol => {
  const m = chem.parseStructure(smiles, false);
  return { ...m, atoms: m.atoms.map((a) => (marks[a.label] ? { ...a, label: "R", text: marks[a.label] } : a)) };
};
const R12 = { Xe: "R1", Kr: "R2" };

// ——— Define ———
// Nε-acetyl-lysine: R1 on the N, R2 on the C=O. Its amide stays an amide in the SMILES kept (no imidic acid).
const kac = monomerOf(drawn("[Xe]N[C@@H](CCCCNC(C)=O)C(=O)[Kr]", R12));
assert.ok("smiles" in kac, JSON.stringify(kac));
const KAC = (kac as { smiles: string }).smiles;
assert.match(KAC, /\[\*:1\]/);
assert.match(KAC, /\[\*:2\]/);
assert.doesNotMatch(KAC, /=N/, "the amide is kept as drawn");
assert.equal(chem.toInchi(KAC.replace("[*:1]", "[H]").replace("[*:2]", "O")), chem.toInchi("N[C@@H](CCCCNC(C)=O)C(=O)O"), "the amino acid, its hand kept");
// A side chain's link (R3), kept.
const r3 = monomerOf(drawn("[Xe]N[C@@H](CCCCCN[Ar])C(=O)[Kr]", { ...R12, Ar: "R3" }));
assert.ok("smiles" in r3 && r3.smiles.includes("[*:3]"), "R3 kept");
// Refused, each with what to change.
assert.deepEqual(monomerOf(drawn("[Xe]NC(C)(C)C(=O)O", { Xe: "R1" })), { problem: "Label the links R1 and R2." });
assert.deepEqual(monomerOf(drawn("[Xe]CC(C)(C)C(=O)[Kr]", R12)), { problem: "Put R1 on the N and R2 on the C=O carbon, one carbon apart." });
assert.deepEqual(monomerOf(drawn("[Xe]NCCC(=O)[Kr]", R12)), { problem: "Put R1 on the N and R2 on the C=O carbon, one carbon apart." }, "a β-amino acid would split the chain when read back");
assert.deepEqual(monomerOf(drawn("C1[Xe]NC1C(=O)[Kr]", R12)), { problem: "R1 joins one atom by a single bond." });
assert.deepEqual(monomerOf(drawn("[Xe]NC([Xe])C(=O)[Kr]", R12)), { problem: "Label one atom R1." });
assert.deepEqual(monomerOf(drawn("[Xe]NCC(=O)[Kr].CCO", R12)), { problem: "Select one structure." });
{
  const m = drawn("[Xe]NC(CC(C)(C)C)C(=O)[Kr]", R12), tBu = m.atoms.findIndex((a, i) => a.label === "C" && m.bonds.filter((b) => b.atoms.includes(i)).length === 4);
  const labelled = { ...m, atoms: m.atoms.map((a, i) => (i === tBu ? { ...a, text: "tBu", inner: { atoms: [], bonds: [] } } : a)) };
  assert.deepEqual(monomerOf(labelled), { problem: "Expand every label but R1, R2 and R3." });
}

// Codes: 1 to 12 letters, digits or _; none of Octet's codes or residue labels, in any case; no "-" (an end in words).
for (const bad of ["", "A", "dF", "ac", "am", "Ala", "ala", "GLY", "D-Phe", "NH2", "OH", "H", "rA", "dT", "P", "ABCDEFGHIJKLM", "a b", "X]", "Lys-N3", "x"]) assert.ok(codeProblem(bad), `"${bad}" refused`);
for (const good of ["Kac", "pS", "D_Ala2", "Phe4F", "K_Ac"]) assert.equal(codeProblem(good), undefined, good);
assert.equal(codeProblem("Ala"), "[Ala] is one of Octet's own monomers.");
assert.equal(codeProblem("Lys-N3"), "A code has 1 to 12 letters, digits or _.");

// Kept in settings: a code once, replaced by Define again; at most MOST_OWN_MONOMERS, the oldest going.
let own = withMonomer([], { code: "Kac", smiles: KAC, name: "Nε-acetyl-lysine" });
own = withMonomer(own, { code: "Kac", smiles: KAC, name: "Nε-acetyl-lysine" });
assert.equal(own.length, 1, "replaced, not added");
assert.equal(Array.from({ length: 600 }, (_, k) => k).reduce((l, k) => withMonomer(l, { code: `M${k}`, smiles: KAC }), own).length, MOST_OWN_MONOMERS);

// ——— Used ———
// In the field and in HELM, as atoms and as labels, the same compound; HELM back as [Kac]; FASTA has X.
const seq = (fieldSeq("peptide: A[Kac]C", own) as { seq: Seq }).seq;
const atoms = (buildAtoms(seq, undefined, own) as { mol: Mol }).mol, labels = (buildLabels(seq, undefined, own) as { mol: Mol }).mol;
const WANT = chem.toInchi("N[C@@H](C)C(=O)N[C@@H](CCCCNC(C)=O)C(=O)N[C@@H](CS)C(=O)O");
assert.equal(chem.toInchi(atoms), WANT, "A-Kac-C");
assert.equal(chem.toInchi(labels), WANT, "as labels, the same");
assert.deepEqual(labels.atoms.map((a) => a.text ?? a.label), ["H", "Ala", "Kac", "Cys", "OH"]);
assert.deepEqual(atoms.monomers, own, "a sequence built with [Kac] brings a copy of it");
assert.deepEqual(labels.monomers, own);
const HELM = "PEPTIDE1{A.[Kac].C}$$$$V2.0";
assert.equal(toHelm(atoms, undefined, undefined, own), HELM, "HELM from atoms names it by its structure");
assert.equal(toHelm(labels, undefined, undefined, own), HELM, "HELM from labels names it by its kept atoms");
assert.deepEqual((parseHelm(HELM, own) as { seq: unknown }).seq, seq, "and reads back");
assert.equal(toFasta(atoms, undefined, own), "AXC");
assert.deepEqual(readSequence(HELM, false, own), { text: "peptide: A[Kac]C" }, "a paste with one of the user's codes opens in Octet's words");
// The field's one path: the worker's ask with the monomers, the structure Return draws.
assert.equal(chem.toInchi(seqBuilt({ build: "peptide: A[Kac]C", labels: true, own }) as Mol), WANT);
// Without the monomer: its own SMILES, so HELM keeps it when it leaves Octet, and Octet reads that back as the same.
{
  const inline = toHelm(atoms)!;
  assert.ok(inline.startsWith("PEPTIDE1{A.[") && inline.includes("[*:1]") && inline.includes("[*:2]") && inline.endsWith("].C}$$$$V2.0"), inline);
  assert.doesNotMatch(inline, /=N/, "no imidic acid in the HELM");
  const back = buildAtoms((parseHelm(inline) as { seq: Seq }).seq);
  assert.ok("mol" in back && chem.toInchi(back.mol) === WANT, "Octet reads its own HELM back");
}
assert.deepEqual(fieldSeq("peptide: A[Kac]C"), { problem: "Not a monomer: [Kac]" }, "unknown without it");
// A label typed over other atoms is read by its atoms: "Kac" over a plain Lys is Lys.
{
  const plain = (buildLabels((fieldSeq("peptide: AKC") as { seq: Seq }).seq) as { mol: Mol }).mol;
  const lied = { ...plain, atoms: plain.atoms.map((a) => (a.text === "Lys" ? { ...a, text: "Kac" } : a)) };
  assert.equal(toHelm(lied, undefined, undefined, own), "PEPTIDE1{A.K.C}$$$$V2.0");
}
// Contract Label suggests the code for a residue drawn in full.
{
  const units = seqOf(atoms, chem.toInchi, chem.canonicalSmiles, own)!.units[0];
  assert.equal(residueName(atoms, new Set(units[1]), chem.toInchi, monomerRefs(own)), "Kac");
  assert.equal(residueName(atoms, new Set(units[1]), chem.toInchi, monomerRefs()), undefined, "not without it");
}

// ——— A drawing's own copies ———
// Saved and opened on a computer that does not have it: .oct, CDXML and CDX each keep it, and it reads the same.
{
  const doc: Mol = { ...labels, monomers: own };
  const json = parse(serialize(doc));
  assert.deepEqual(json.monomers, own, "Octet's JSON (the clipboard) keeps the drawing's monomers");
  const oct = readOct(writeOct(doc, DEFAULT_STYLE), true).mol;
  assert.deepEqual(oct.monomers, own, ".oct keeps them");
  const cdxml = fromCdxml(toCdxml(doc, DEFAULT_STYLE)).mol;
  assert.deepEqual(cdxml.monomers, own, "CDXML keeps them in Octet's own data");
  const cdx = readCdx(writeCdx(doc, DEFAULT_STYLE)).mol;
  assert.deepEqual(cdx.monomers, own, "and CDX");
  for (const back of [json, oct, cdxml, cdx]) {
    assert.equal(toHelm(back, undefined, undefined, back.monomers), HELM);
    assert.equal(chem.toInchi(withSequences(back, "atoms")), WANT, "drawn out on the other computer");
  }
}
// The clipboard: a paste brings the monomers its part carries; a code the drawing has keeps the drawing's structure.
{
  const other = { code: "Kac", smiles: "[*:1]NC(CC)(CC)C(=O)[*:2]" };
  const into: Mol = { atoms: [], bonds: [], monomers: [other] };
  assert.deepEqual(insertMol(into, { ...labels, monomers: own }).mol.monomers, [other], "the drawing's own first");
  assert.deepEqual(insertMol({ atoms: [], bonds: [] }, { ...labels, monomers: own }).mol.monomers, own, "a paste brings it");
  assert.deepEqual(merge({ atoms: [], bonds: [] }, { ...labels, monomers: own }, [0, 0]).monomers, own, "Return in the name field too");
  assert.equal(monomer("peptide", "Kac", [...own, other])!.smiles, KAC, "looked up in the drawing first");
  assert.equal(monomer("peptide", "Kac", [other, ...own])!.smiles, other.smiles);
  // Pasted into a drawing whose [Kac] is another structure, the labels are read by their atoms: HELM writes the pasted
  // residue as its own SMILES, never as the other [Kac].
  const there = insertMol(into, { ...labels, monomers: own }).mol;
  assert.doesNotMatch(toHelm(there, undefined, undefined, there.monomers)!, /\[Kac\]/);
}
// The Sequences setting converts with the drawing's monomers, and keeps the label.
{
  const out = withSequences({ ...atoms, monomers: own }, "labels");
  assert.deepEqual(out.atoms.filter((a) => a.text).map((a) => a.text), ["Ala", "Kac", "Cys", "OH"]);
  assert.equal(chem.toInchi(out), WANT);
}

// ——— Hostile lists ———
// Opened files are hostile: each monomer checked as a defined one, up to the limit, the rest left out.
assert.deepEqual(readMonomers([{ code: "A", smiles: KAC }, { code: "ok", smiles: "NCC" }, { code: "big", smiles: "C".repeat(3000) }, { code: "dot", smiles: "[*:1]NCC(=O)[*:2].[Na+]" },
  { code: "Lys-N3", smiles: KAC }, { code: "dup", smiles: KAC }, { code: "dup", smiles: KAC }, "x", null, { code: "Kac", smiles: KAC, name: 5 }]), [{ code: "dup", smiles: KAC }, { code: "Kac", smiles: KAC }]);
assert.deepEqual(readMonomers("not a list"), []);
{
  const many = Array.from({ length: 600 }, (_, k) => ({ code: `M${k}`, smiles: `[*:1]NC(${"C".repeat(1 + (k % 40))})C(=O)[*:2]` })), t = performance.now(), read = readMonomers(many);
  assert.equal(read.length, MOST_OWN_MONOMERS);
  assert.ok(performance.now() - t < 200, "500 monomers read quickly");
  const doc = parse(serialize({ atoms: [], bonds: [], monomers: read }));
  assert.equal(doc.monomers?.length, MOST_OWN_MONOMERS, "a drawing with 500 monomers opens");
  // Copy As HELM of a chain with a residue none of them is tries only the monomers with its elements: quick.
  const t2 = performance.now();
  assert.equal(toHelm(atoms, undefined, undefined, [...read, ...own]), HELM);
  assert.equal(toHelm(atoms, undefined, undefined, read)!.startsWith("PEPTIDE1{A.["), true);
  assert.ok(performance.now() - t2 < 1500, `Copy As HELM with 500 monomers: ${Math.round(performance.now() - t2)} ms`);
}
// Each monomer's residue key, worked out from its SMILES text alone, is the key of its residue drawn.
assert.equal(smilesKey(KAC), elementKey(chem.parseStructure("N[C@@H](CCCCNC(C)=O)C(=O)", false).atoms));
assert.equal(smilesKey("[*:1]N[C@@H]([2H])C(=O)[*:2]"), "C2H1N1");
assert.ok(monomerRefs(own).some((r) => r.label === "Kac") && monomerRefs(own) === monomerRefs(own), "kept for the same list");

// ——— HELM monomer library files ———
{
  const lib = helmLibrary(own), data = JSON.parse(lib);
  assert.equal(data[0].symbol, "Kac");
  assert.equal(data[0].polymerType, "PEPTIDE");
  assert.deepEqual(data[0].rgroups.map((r: { label: string; capGroupName: string }) => `${r.label} ${r.capGroupName}`), ["R1 H", "R2 OH"]);
  assert.deepEqual(readHelmLibrary(lib), { monomers: own, left: 0 }, "Octet reads its own library back");
  // An Asp-like R3 on a C=O caps OH.
  const asp = monomerOf(drawn("[Xe]N[C@@H](CC(=O)[Ar])C(=O)[Kr]", { ...R12, Ar: "R3" })) as { smiles: string };
  assert.deepEqual(JSON.parse(helmLibrary([{ code: "Asx", smiles: asp.smiles }]))[0].rgroups.map((r: { capGroupName: string }) => r.capGroupName), ["H", "OH", "OH"]);
}
// A library as other programs write it: R atoms as [*] with ChemAxon's labels; other polymer types and codes Octet's own
// monomers have are left out and counted.
{
  const lib = JSON.stringify([
    { symbol: "Aib2", name: "alpha-aminoisobutyric acid", polymerType: "PEPTIDE", smiles: "CC(C)(N[*])C([*])=O |$;;;;_R1;;_R2;$|" },
    { symbol: "Nme", polymerType: "PEPTIDE", smiles: "C[C@H](N(C)[*:1])C([*:2])=O" },
    { symbol: "A", polymerType: "PEPTIDE", smiles: "C[C@H](N[*:1])C([*:2])=O" },
    { symbol: "mR", polymerType: "RNA", smiles: "CO[C@@H]1[C@H]([*:2])[C@@H](CO[*:1])O[C@H]1[*:3]" },
    { symbol: "Bad", polymerType: "PEPTIDE", smiles: "CC(C)(N[*])C([*])=O |$;;;;_R7;;_R2;$|" },
    { symbol: "Bad2", polymerType: "PEPTIDE", smiles: "CC(N)C(=O)O" },
  ]);
  const read = readHelmLibrary(lib);
  assert.ok("monomers" in read);
  assert.deepEqual(read.monomers.map((m) => [m.code, m.smiles]), [["Aib2", "CC(C)(N[*:1])C([*:2])=O"], ["Nme", "C[C@H](N(C)[*:1])C([*:2])=O"]]);
  assert.equal(read.left, 4);
  assert.equal(read.monomers[0].name, "alpha-aminoisobutyric acid");
  // Read into a sequence, each is the amino acid it says.
  const s2 = (fieldSeq("peptide: G[Aib2][Nme]G", read.monomers) as { seq: Seq }).seq, m2 = buildAtoms(s2, undefined, read.monomers);
  assert.ok("mol" in m2 && chem.toInchi(m2.mol) === chem.toInchi("NCC(=O)NC(C)(C)C(=O)N(C)[C@@H](C)C(=O)NCC(=O)O"), "G-Aib-NMeAla-G");
  // Wrapped in an object, as some libraries are.
  assert.equal((readHelmLibrary(JSON.stringify({ monomers: JSON.parse(lib) })) as { monomers: unknown[] }).monomers.length, 2);
}
// Import… keeps only monomers Octet can use (helm.ts importableMonomer): an α-amino acid whose SMILES reads whole and that
// Octet names back. A β-amino acid, brackets that do not pair, an atom no element ([Xx]) and links with no residue are
// left out and counted.
{
  const lib = JSON.stringify([
    { symbol: "Abu2", polymerType: "PEPTIDE", smiles: "[*:1]N[C@@H](CC)C(=O)[*:2]" },
    { symbol: "Bal", polymerType: "PEPTIDE", smiles: "[*:1]NCCC(=O)[*:2]" },
    { symbol: "Open", polymerType: "PEPTIDE", smiles: "[*:1]N[C@@H](CC(=O)[*:2]" },
    { symbol: "Shut", polymerType: "PEPTIDE", smiles: "[*:1]N[C@@H](C)C(=O)[*:2])" },
    { symbol: "Xx1", polymerType: "PEPTIDE", smiles: "[*:1]N[C@@H]([Xx])C(=O)[*:2]" },
    { symbol: "Rr", polymerType: "PEPTIDE", smiles: "[*:1][*:2]" },
  ]);
  const read = readHelmLibrary(lib, importableMonomer);
  assert.deepEqual(read, { monomers: [{ code: "Abu2", smiles: "[*:1]N[C@@H](CC)C(=O)[*:2]" }], left: 5 });
  assert.ok(["Bal", "Open", "Shut", "Xx1", "Rr"].every((c) => !importableMonomer(JSON.parse(lib).find((x: { symbol: string }) => x.symbol === c).smiles)));
  assert.ok(importableMonomer(KAC) && own.every((m) => importableMonomer(m.smiles)), "a monomer Define Monomer makes is one Import keeps");
  // An α-amino acid that Octet does not name back is left out too: drawn in a chain, Copy As HELM writes no such
  // monomer (a side chain read as a residue of its own gives no HELM; a charge its SMILES does not balance and a ring
  // with no Kekulé form come back as SMILES).
  for (const [why, smiles] of [["a side chain with an amino acid of its own", "[*:1]N[C@@H](CC(N)C(=O)O)C(=O)[*:2]"], ["an N+ with too few H", "[*:1][NH+]([C@@H](C)C(=O)[*:2])C"], ["a ring with no Kekulé form", "[*:1]N[C@@H](Cc1cccc1)C(=O)[*:2]"]]) {
    const one = [{ code: "Zx", smiles }], m = (buildAtoms((fieldSeq("peptide: A[Zx]G", one) as { seq: Seq }).seq, undefined, one) as { mol: Mol }).mol;
    assert.ok(!(toHelm(m, undefined, undefined, one) ?? "").includes("[Zx]"), `${why}: not named back`);
    assert.ok(!importableMonomer(smiles), `${why}: left out`);
  }
  // Charged side chains that balance, N-methyl and Octet's own (Abu) name back and come in.
  for (const smiles of ["[*:1]N[C@@H](CCCC[NH3+])C(=O)[*:2]", "[*:1]N[C@@H](CC(=O)[O-])C(=O)[*:2]", "[*:1]N(C)[C@@H](C)C(=O)[*:2]", "[*:1]N[C@@H](Cc1c[nH]c2ccccc12)C(=O)[*:2]"]) assert.ok(importableMonomer(smiles), smiles);
  // A hostile library of 20,000 that no α-amino acid is in: each asked of at most 600, quickly.
  const t = performance.now(), bad = readHelmLibrary(JSON.stringify(Array.from({ length: 20_000 }, (_, k) => ({ symbol: `B${k}`, smiles: `[*:1]NCC${"C".repeat(k % 40)}C(=O)[*:2]` }))), importableMonomer);
  assert.deepEqual(bad, { monomers: [], left: 20_000 });
  assert.ok(performance.now() - t < 1500, `${Math.round(performance.now() - t)} ms`);
  // And one of 20,000 different α-amino acids that each read but none names back (the slowest kind: each one is drawn
  // and read): at most 600 are asked (about 1.5 s here), the rest left out.
  const side = (k: number) => `C${"C".repeat(k % 40)}${["O", "N", "S", "F", "Cl"][Math.floor(k / 40) % 5]}${"C".repeat(Math.floor(k / 200) % 10)}`;
  const t2 = performance.now(), worse = readHelmLibrary(JSON.stringify(Array.from({ length: 20_000 }, (_, k) => ({ symbol: `C${k}`, smiles: `[*:1][NH+]([C@@H](${side(k % 2000)})C(=O)[*:2])C` }))), importableMonomer);
  assert.deepEqual(worse, { monomers: [], left: 20_000 });
  assert.ok(performance.now() - t2 < 3000, `${Math.round(performance.now() - t2)} ms`);
  assert.match(readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), /const read = readHelmLibrary\(picked\[1\], importableMonomer\);/, "Import… asks it");
  // A library that takes a second or more shows it is being read: the Import… button reads Importing…, painted before
  // the work starts, and both Import… buttons (Names and Monomers) are off until it is read. The same for the names.
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), settingsWindow = readFileSync(new URL("SettingsWindow.tsx", import.meta.url), "utf8");
  for (const [what, invoke, read] of [["monomers", "import_monomers", "readHelmLibrary"], ["names", "import_structure", "readOwnNamesFile"]]) {
    const body = editor.slice(editor.indexOf(`invoke<[string, string] | null>("${invoke}")`));
    assert.ok(/^[^]*?setImporting\("\w+"\);\s*await Promise\.all\(\[ready, afterPaint\(\)\]\);/.test(body.slice(0, body.indexOf(read))), `${what}: Importing… is painted before the file is read`);
    assert.match(body.slice(0, body.indexOf("\n  }\n")), /finally \{ setImporting\(undefined\); \}/, `${what}: and goes when it is read, or fails`);
    assert.match(settingsWindow, new RegExp(`disabled=\\{!!p\\.importing\\} aria-busy=\\{p\\.importing === "${what}" \\|\\| undefined\\}>\\{p\\.importing === "${what}" \\? "Importing…" : "Import…"\\}`), `${what}: the button reads Importing… and is off`);
  }
  assert.match(editor, /importing=\{importing\}/, "the Settings window is told");
}
assert.deepEqual(readHelmLibrary("{"), { problem: "This file is not a HELM monomer library." });
assert.deepEqual(readHelmLibrary("[]"), { monomers: [], left: 0 });
assert.deepEqual(readHelmLibrary("x".repeat(4_000_001)), { problem: "Octet reads monomer libraries of up to 4 MB." });
{
  const t = performance.now(), big = JSON.stringify(Array.from({ length: 20_000 }, (_, k) => ({ symbol: `Q${k}`, polymerType: "PEPTIDE", smiles: "C[C@H](N[*:1])C([*:2])=O" })));
  const read = readHelmLibrary(big);
  assert.ok("monomers" in read && read.monomers.length === MOST_OWN_MONOMERS && read.left === 20_000 - MOST_OWN_MONOMERS);
  assert.ok(performance.now() - t < 500, "a large library reads quickly");
}

// ——— The dialog, the menu item, the right-click item, the Settings list and the files ———
const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), main = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
const actions = readFileSync(new URL("Actions.tsx", import.meta.url), "utf8"), settings = readFileSync(new URL("SettingsWindow.tsx", import.meta.url), "utf8");
const exporter = readFileSync(new URL("../src-tauri/src/export.rs", import.meta.url), "utf8");
assert.match(main, /item\("define_monomer", "Define Monomer…", ""\)/);
assert.match(main, /async fn import_monomers\(/);
assert.match(exporter, /\("json", "HELM Monomer Library", &\["json"\]\)/);
assert.match(editor, /define_monomer: \(\) => defineMonomer\(\),/);
assert.match(actions, /"Define monomer…", "define_monomer"/);
assert.match(editor, /<Dialog title="Define monomer" action=\{there \? "Replace" : "Define"\}/);
// A code the open drawing has its own copy of (Mol.monomers) is said in the dialog too: in this drawing it comes first.
assert.match(editor, /const drawn = code && !problem \? doc\.monomers\?\.find\(\(x\) => x\.code === code && x\.smiles !== dialog\.smiles\) : undefined;/);
assert.match(editor, /\{drawn && <p className="dialog-note">This drawing has its own monomer \[\{code\}\]\. In this drawing, \[\{code\}\] keeps that structure\.<\/p>\}/);
// Define nickname… is offered wherever Define monomer… is (a selection with atoms, a structure, an atom, a bond).
assert.equal((actions.match(/\bdict, nickname, monomer\b/g) ?? []).length, 4);
assert.equal((actions.match(/\bmonomer\b(?=[,\]])/g) ?? []).length, 4, "and nowhere else");
// The command palette names the Structure > Sequence items as the menu does.
assert.match(editor, /insert_peptide: \["Peptide sequence…"/);
assert.match(editor, /insert_rna: \["RNA sequence…"/);
assert.match(editor, /insert_dna: \["DNA sequence…"/);
assert.doesNotMatch(editor, /Insert (peptide|RNA|DNA)…/i);
assert.match(settings, /d\("dictionary", "Monomers", "Your monomers"/);
assert.ok(fragments(labels).length === 1);
console.log("monomers: ok");
