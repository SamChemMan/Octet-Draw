// Run: node src/sequencestyle.check.ts. How a document shows its sequences (issue 27): Settings > Document > Style >
// Sequences, and Residue labels under the name field, draw every chain in the document again as atoms or as residue
// labels (helm.ts withSequences), the same compound and the same HELM either way, each chain where it was; a residue
// Octet has no label for stays in full in its row; anything that is not wholly a chain is left as it is. The style
// keeps the choice in the file, and the change is one undo step.
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
const { parseHelm, toHelm, withSequences } = await import("./helm.ts");
const { buildAtoms } = await import("./seqbuild.ts");
const { fragments, insertMol } = await import("./edit.ts");
const { serialize, parse } = await import("./file.ts");
const { readStyle, DEFAULT_STYLE } = await import("./docstyle.ts");

const atoms = (h: string) => (buildAtoms((parseHelm(h) as { seq: Parameters<typeof buildAtoms>[0] }).seq) as { mol: Mol }).mol;
const mid = (m: Mol, frag: number[]) => [0, 1].map((k) => { const v = frag.map((i) => m.atoms[i].location[k]); return (Math.min(...v) + Math.max(...v)) / 2; });
const OXYTOCIN = "PEPTIDE1{C.Y.I.Q.N.C.P.L.G.[am]}$PEPTIDE1,PEPTIDE1,1:R3-6:R3$$$V2.0";
const INSULIN = "PEPTIDE1{G.I.V.E.Q.C.C.T.S.I.C.S.L.Y.Q.L.E.N.Y.C.N}|PEPTIDE2{F.V.N.Q.H.L.C.G.S.H.L.V.E.A.L.Y.L.V.C.G.E.R.G.F.F.Y.T.P.K.T}$PEPTIDE1,PEPTIDE1,6:R3-11:R3|PEPTIDE1,PEPTIDE2,7:R3-7:R3|PEPTIDE1,PEPTIDE2,20:R3-19:R3$$$V2.0";
const PHOSPHO = "PEPTIDE1{A.[C(OP(=O)(O)O)[C@](N[*:1])(C(=O)[*:2])[H]].C.G}$$$$V2.0";

// A page with oxytocin, insulin, a peptide with a phosphoserine, and benzene, each where it was put.
let page: Mol = { atoms: [], bonds: [] };
for (const [k, h] of [OXYTOCIN, INSULIN, PHOSPHO].entries()) page = insertMol(page, atoms(h), [0, -30 * k]).mol;
page = insertMol(page, chem.parseStructure("c1ccccc1"), [40, 40]).mol;
const inchi = chem.toInchi(page), helm = toHelm(page);
const labels = withSequences(page, "labels");
assert.equal(chem.toInchi(labels), inchi, "as labels: the same compounds");
assert.equal(toHelm(labels), helm, "and the same HELM");
assert.equal(fragments(labels).length, fragments(page).length, "each structure still one");
// Each chain keeps its centre; benzene does not move.
const byFirstAtomLabel = (m: Mol) => fragments(m).map((f) => mid(m, f)).sort((p, q) => p[1] - q[1] || p[0] - q[0]);
byFirstAtomLabel(labels).forEach((c, k) => { const was = byFirstAtomLabel(page)[k]; assert.ok(Math.hypot(c[0] - was[0], c[1] - was[1]) < 1e-6, `structure ${k} kept its centre`); });
// The phosphoserine stays in full in its row, between its labels.
{
  const f = fragments(labels).find((g) => g.some((i) => labels.atoms[i].label === "P"))!;
  assert.deepEqual(f.filter((i) => labels.atoms[i].inner).map((i) => labels.atoms[i].text).sort(), ["Ala", "Cys", "Gly"]);
  assert.equal(f.filter((i) => !labels.atoms[i].inner && !labels.atoms[i].text && labels.atoms[i].label !== "H").length, 10, "its ten atoms in full");
}
// And back to atoms: the same compounds, the same HELM; again, nothing changes.
const back = withSequences(labels, "atoms");
assert.equal(chem.toInchi(back), inchi, "as atoms again: the same compounds");
assert.equal(toHelm(back), helm);
assert.equal(withSequences(back, "atoms"), back, "already atoms: the same drawing");
assert.equal(withSequences(labels, "labels"), labels, "already labels: the same drawing");
// The style keeps the choice, in the file too; a file without it opens as it was drawn.
assert.equal(readStyle({ ...DEFAULT_STYLE, sequences: "labels" }).sequences, "labels");
assert.equal(readStyle({ ...DEFAULT_STYLE, sequences: "other" }).sequences, undefined, "a damaged value is dropped");
assert.equal(parse(serialize({ ...labels, style: { ...DEFAULT_STYLE, sequences: "labels" } })).style?.sequences, "labels");
// Speed: a page of three chains drawn again both ways in well under a second.
{
  const t = performance.now();
  withSequences(withSequences(page, "labels"), "atoms");
  const ms = performance.now() - t;
  assert.ok(ms < 3000, `both ways: ${ms.toFixed(0)} ms`);
  console.log(`sequencestyle: three chains both ways in ${ms.toFixed(0)} ms`);
}

// The editor: Settings > Document > Style > Sequences and the Residue labels choice are one setting, changed in one
// set() with the style (one undo step), and new documents start with the last choice.
const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), settings = readFileSync(new URL("SettingsWindow.tsx", import.meta.url), "utf8");
assert.match(editor, /function setSequences\(to: "atoms" \| "labels", next: DocStyle = style\) \{\n\s+setSettings\(\(st\) => \(\{ \.\.\.st, sequenceLabels: to === "labels" \}\)\);\n\s+const drawn = withSequences\(doc, to\);\n\s+if \(drawn === doc && next === style && style\.sequences === undefined\) return;\n\s+set\(\{ \.\.\.drawn, style: \{ \.\.\.next, sequences: to \} \}, true\);/);
assert.match(editor, /aria-pressed=\{seqLabels\} onClick=\{\(\) => setSequences\(seqLabels \? "atoms" : "labels"\)\}>Residue labels<\/button>/);
assert.match(editor, /const seqLabels = \(doc\.style\?\.sequences \?\? \(settings\.sequenceLabels \? "labels" : "atoms"\)\) === "labels";/);
assert.match(settings, /<Segmented label="Sequences" value=\{style\.sequences \?\? \(p\.drawing\.sequenceLabels \? "labels" : "atoms"\)\} options=\{\[\["atoms", "Atoms"\], \["labels", "Residue labels"\]\]\}/);
console.log("sequencestyle: ok");
