// Run: node src/namepreview.check.ts. Name to Structure's live preview (namepreview.ts). Typing in the name field
// never waits: a keystroke reads a sequence ("peptide: …", "rna: …", "dna: …", or HELM) without OPSIN or Indigo, in
// well under a frame. A sequence is built from its monomers in a worker once typing pauses (seqLayout, issue 27), and
// Return draws the same structure; a structure of over 100 atoms is previewed laid out by Indigo alone in the worker,
// and the newest text wins. Anything smaller previews at once, tidied, as before. Return draws the tidied structure,
// laid out in the same worker so the window never waits: the same structure as the page made before (same InChI), as
// one undo step, cancelled by an edit or Escape.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { browser, loadOpsin, opsinDir } from "../scripts/checkkit.ts";

browser();
const g = globalThis as Record<string, unknown>;
const { fullMol, parseStructure, quickMol, ready, toInchi } = await import("./chem.ts");
const { sandwich } = await import("./edit.ts");
const { fullLayout, isSequence, laterSmiles, PREVIEW_ATOMS, PREVIEW_PAUSE, quickLayout, seqLayout } = await import("./namepreview.ts");
const { fieldSeq } = await import("./helm.ts");
const { peptideSmiles } = await import("./peptide.ts");
const { nucleicText } = await import("./nucleic.ts");
await ready;

const PEPTIDE_60 = `peptide: ${"ACDEFGHIKLMNPQRSTVWY".repeat(3)}`, RNA_30 = `rna: ${"ACGU".repeat(8).slice(0, 30)}`, DNA_30 = `dna: ${"ACGT".repeat(8).slice(0, 30)}`;
const ASPIRIN = "CC(=O)OC1=CC=CC=C1C(=O)O";

// Which text waits. Sequences always (built from their monomers, seqLayout, never read as names); a name or SMILES of
// over PREVIEW_ATOMS atoms (laterSmiles); nothing else.
assert.ok(isSequence(PEPTIDE_60) && isSequence(RNA_30) && isSequence("DNA: AT") && isSequence("PEPTIDE1{A.C}$$$$V2.0") && !isSequence("aspirin"));
for (const text of [PEPTIDE_60, RNA_30, DNA_30, "peptide: GG", "rna: "]) assert.equal(laterSmiles(text, undefined), undefined, `${text}: built, not laid out from SMILES`);
assert.equal(laterSmiles("aspirin", ASPIRIN), undefined, "aspirin previews at once");
assert.equal(laterSmiles(ASPIRIN, undefined), undefined, "so does its SMILES");
const big = "C".repeat(PREVIEW_ATOMS + 1), edge = "C".repeat(PREVIEW_ATOMS);
assert.equal(laterSmiles("some long name", big), big, "a name of over 100 atoms waits");
assert.equal(laterSmiles("some name", edge), undefined, "100 atoms do not");
assert.equal(laterSmiles(big, undefined), big, "nor does long SMILES typed or pasted");
assert.equal(laterSmiles("not a name", undefined), undefined);
assert.ok(PREVIEW_PAUSE > 0 && PREVIEW_PAUSE <= 200, "a short pause");

// A keystroke's work on a sequence: well under a frame (16 ms), however long it is, HELM too.
const HELM_LONG = `PEPTIDE1{${Array.from({ length: 1000 }, (_, k) => "ACDEFGHIKLMNPQRSTVWY"[k % 20]).join(".")}}$$$$V2.0`;
for (const text of [PEPTIDE_60, RNA_30, DNA_30, HELM_LONG]) {
  fieldSeq(text);
  const t = performance.now();
  for (let k = 0; k < 20; k++) fieldSeq(text.slice(0, text.length - (k % 3)));
  const ms = (performance.now() - t) / 20;
  assert.ok(ms < 4, `${text.slice(0, 8)}: ${ms.toFixed(2)} ms a keystroke`);
}

// The quick layout of a large structure's SMILES is the same structure as the tidied one (same InChI), and quicker.
for (const text of [PEPTIDE_60, RNA_30]) {
  const smiles = peptideSmiles(text) ?? (nucleicText(text) as { smiles: string }).smiles;
  let t = performance.now();
  const quick = quickMol(smiles);
  const fast = performance.now() - t;
  t = performance.now();
  const full = parseStructure(smiles);
  const slow = performance.now() - t;
  assert.ok(quick && quick.atoms.length === full.atoms.length, `${text.slice(0, 8)}: every atom`);
  assert.equal(toInchi(quick), toInchi(full), `${text.slice(0, 8)}: the same structure`);
  assert.ok(fast < slow, `${text.slice(0, 8)}: quick ${fast.toFixed(0)} ms, tidied ${slow.toFixed(0)} ms`);
}
assert.equal(quickMol("not smiles ((("), undefined);
// With no worker (as here), quickLayout lays out on the spot.
assert.equal((await quickLayout(ASPIRIN))?.atoms.length, 13);

// The editor: a keystroke never reads a sequence as a name; the preview waits PREVIEW_PAUSE and drops stale answers;
// Return lays out a waiting structure tidied; the field is not marked wrong while its structure is on its way.
const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
assert.match(editor, /const typedSmiles = useMemo\(\(\) => \(naming === undefined \|\| !loaded \|\| isSequence\(naming\.trim\(\)\) \? undefined : nameToSmiles\(naming\)\)/);
assert.match(editor, /const later = useMemo\(\(\) => \(naming === undefined \|\| !loaded \? undefined : laterSmiles\(naming, typedSmiles\)\)/);
assert.match(editor, /setTimeout\(\(\) => void quickLayout\(later\)\.then\(\(mol\) => \{ if \(!gone\) setQuickPreview\(\{ smiles: later, mol \}\); \}\), PREVIEW_PAUSE\)/);
assert.match(editor, /naming === undefined \|\| later \|\| seqText !== undefined \? undefined : structureFromText\(naming, undefined, typedSmiles \?\? null\)/);
assert.match(editor, /const shownNamed = seqText !== undefined \? \(seqKey \? seqPreview\?\.mol : undefined\) : later \? quickPreview\?\.mol : named;/);
assert.match(editor, /setTimeout\(\(\) => void seqLayout\(seqText!, seqLabels, ownMonomers\)\.result\.then/, "a sequence previews from the worker after the pause");
assert.match(editor, /const built = seqLayout\(seqText, seqLabels, ownMonomers\);/, "Return builds the same, kept from the preview");
assert.match(editor, /if \(later\) \{\n\s+if \(placing === naming\) return true;\n\s+placingJob\.current\?\.cancel\(\);/, "Return on a waiting structure asks the worker, once");
assert.match(editor, /const job = fullLayout\(list && list\.join\("\."\) === typedSmiles \? list : \[later\], !!typedSmiles \|\| isSequence\(s\)\);/);
assert.match(editor, /if \(placing === undefined \|\| naming === placing\) return;\n\s+placingJob\.current\?\.cancel\(\);/, "an edit, Escape or closing the field cancels it");
assert.match(editor, /if \(placingJob\.current !== job\) return;[\s\S]{0,900}landName\(withOwnCaption\(s, frag\)\);/, "it lands as one place(), one undo step");
assert.match(editor, /const landName = \(frag: Mol\) => \{ settleFrom\.current = doc\.atoms\.length; place\(frag, doc, namingAt\.current\); setNaming\(undefined\); \};/, "it lands as one place(), one undo step");
assert.match(editor, /aria-busy=\{placing === naming \|\| undefined\}/, "the field shows it is busy");
const css = readFileSync(new URL("editor.css", import.meta.url), "utf8");
const busy = /\.name-field\[aria-busy="true"\] \{([^}]*)\}/.exec(css)?.[1] ?? "";
assert.ok(busy.includes("color: var(--ink-muted)") && !/animation|transition/.test(busy), "quiet and still: a key started it");
assert.match(editor, /aria-invalid=\{!!naming\.trim\(\) && namesLoaded && !named && !later\}/);
assert.match(editor, /function insertSequence\(prefix: string\) \{\n\s+warmLayout\(\);/, "Insert Peptide…, RNA… and DNA… start the worker");
const worker = readFileSync(new URL("layout.worker.ts", import.meta.url), "utf8");
assert.match(worker, /postMessage\(quickMol\(ask\.smiles\)\)/);
assert.match(worker, /postMessage\(ask\.pieces\.map\(\(p\) => fullMol\(p, ask\.ions\)\)\)/);

// Return's structure for a large SMILES: the same as the page made before Return moved to the worker (Editor.tsx
// structureFor: sandwich(parseStructure(smiles))), along a straight backbone (fullMol, chain.ts). A sequence is built
// from its monomers (seqLayout): the same compound (standard InChI) as the SMILES 1.1.2 drew it from, and as OPSIN reads
// the peptide's name.
const RNA_SMILES = (nucleicText(RNA_30) as { smiles: string }).smiles;
const rnaBefore = sandwich(parseStructure(RNA_SMILES)), rnaAfter = (await fullLayout([RNA_SMILES], true).result)![0];
assert.deepEqual(rnaAfter, fullMol(RNA_SMILES), "30-nt RNA: the same drawing");
assert.equal(toInchi(rnaAfter), toInchi(rnaBefore), "30-nt RNA: the same InChI");
const pepAfter = (await seqLayout(PEPTIDE_60, false, []).result) as import("./render.ts").Mol;
assert.equal(pepAfter.atoms.length, quickMol(peptideSmiles(PEPTIDE_60)!)!.atoms.length, "60-residue peptide: every atom");
assert.equal(toInchi(pepAfter), toInchi(peptideSmiles(PEPTIDE_60)!), "60-residue peptide: the same compound as its SMILES");
assert.equal(toInchi((await seqLayout(RNA_30, false, []).result) as import("./render.ts").Mol), toInchi(RNA_SMILES), "30-nt RNA: the same compound");
assert.equal(await seqLayout(PEPTIDE_60, false, []).result, pepAfter, "kept: Return after the preview draws at once");
if (existsSync(new URL("opsin.js", opsinDir))) {
  const { DRUGS } = await import("./drugs.ts");
  const { attachOpsin, nameToSmiles } = await import("./names.ts");
  const opsin = await loadOpsin();
  attachOpsin(opsin, readFileSync(new URL("names.txt", opsinDir), "utf8"), JSON.parse(readFileSync(new URL("./nameindex.json", import.meta.url), "utf8")), DRUGS);
  const pepBefore = sandwich(parseStructure(nameToSmiles(PEPTIDE_60)!));
  assert.equal(toInchi(pepAfter), toInchi(pepBefore), "60-residue peptide: the same InChI as through OPSIN");
  assert.equal(nameToSmiles(RNA_30), RNA_SMILES, "RNA: Return read the same SMILES before");
} else console.log("namepreview: peptide InChI against OPSIN skipped (no OPSIN build)");
// SMILES typed as it is keeps its ions (no sandwich), as structureFromText reads it.
assert.deepEqual(fullMol("C1=CC=C[CH-]1.C1=CC=C[CH-]1.[Fe+2]", false), parseStructure("C1=CC=C[CH-]1.C1=CC=C[CH-]1.[Fe+2]"));
assert.equal((await fullLayout(["not smiles((("], true).result), undefined, "text that does not read: nothing");
// Again: kept, so it draws at once.
assert.equal((await fullLayout([RNA_SMILES], true).result)![0], rnaAfter, "the same text again is kept");

// The worker answers each kind of message (run here in-process).
const posted: unknown[] = [];
g.postMessage = (m: unknown) => posted.push(m);
const workerScope = { onmessage: undefined as undefined | ((e: { data: unknown }) => Promise<void>) };
g.self = workerScope;
await import("./layout.worker.ts");
await workerScope.onmessage!({ data: { smiles: ASPIRIN } });
await workerScope.onmessage!({ data: { pieces: [RNA_SMILES], ions: true } });
await workerScope.onmessage!({ data: { pieces: ["not smiles((("], ions: true } });
await workerScope.onmessage!({ data: { build: "peptide: ACD", labels: true, own: [] } });
await workerScope.onmessage!({ data: { build: "peptide: [Zzz]", labels: false, own: [] } });
assert.equal((posted[0] as { atoms: unknown[] }).atoms.length, 13, "a preview");
assert.deepEqual(posted[1], [rnaAfter], "Return's structure, the same as on the page");
assert.equal(posted[2], undefined);
assert.deepEqual((posted[3] as import("./render.ts").Mol).atoms.map((a) => a.text ?? a.label), ["H", "Ala", "Cys", "Asp", "OH"], "a sequence built as labels");
assert.deepEqual(posted[4], { problem: "Not a monomer: [Zzz]" }, "or why not");
// A worker whose Indigo did not load still answers (undefined), so the queue moves on and the field is not busy for ever.
assert.match(worker, /try \{\n\s+await ready;[\s\S]*\} catch \{ postMessage\(undefined\); \}/);

// The queue, with a stand-in worker: Return's job goes before a waiting preview, a newer preview drops an older one,
// and cancelling a job that has started stops its worker (the next request starts a new one).
type Sent = { ask: { smiles?: string; pieces?: string[] }; w: FakeWorker };
const sent: Sent[] = [];
let made = 0, stopped = 0;
class FakeWorker {
  onmessage?: (e: { data: unknown }) => void;
  onerror?: () => void;
  constructor() { made++; }
  postMessage(ask: Sent["ask"]) { sent.push({ ask, w: this }); }
  terminate() { stopped++; }
}
g.Worker = FakeWorker;
const answer = (data: unknown) => sent.at(-1)!.w.onmessage!({ data });
const p1 = quickLayout("CCO");
assert.equal(sent.length, 1, "a preview starts at once");
const r1 = fullLayout(["CCCC"], true), p2 = quickLayout("CCN"), p3 = quickLayout("CCC");
assert.equal(await p2, undefined, "a newer preview drops the older one waiting");
answer("ethanol");
assert.equal(await p1, "ethanol");
assert.deepEqual(sent.at(-1)!.ask, { pieces: ["CCCC"], ions: true }, "Return's job goes next");
answer(["butane"]);
assert.deepEqual(await r1.result, ["butane"]);
assert.deepEqual(sent.at(-1)!.ask, { smiles: "CCC" }, "then the preview waiting");
answer("propane");
assert.equal(await p3, "propane");
const r2 = fullLayout(["CCCCC"], true);
assert.equal(made, 1);
r2.cancel();
assert.equal(await r2.result, undefined, "cancelled");
assert.equal(stopped, 1, "its worker is stopped");
const r3 = fullLayout(["CCCCCC"], true);
assert.equal(made, 2, "and the next request starts a new one");
const r4 = fullLayout(["CCCCCCC"], true);
r4.cancel();
assert.equal(await r4.result, undefined, "a job not yet started is dropped");
assert.equal(stopped, 1, "without stopping the worker");
answer(["hexane"]);
assert.deepEqual(await r3.result, ["hexane"]);
delete g.Worker;
// On an experiment page the preview's place reads the reagent tables from the last drawing: this drawing's are worked
// out further down, and reading them before then stopped the editor.
const taken = /const schemeTaken = \(m: Mol\): number\[\]\[\] => \[([\s\S]*?)\n  \];/.exec(editor)?.[1] ?? "";
assert.ok(taken && !/gridViews/.test(taken) && /tableSpans\.current/.test(taken), "schemeTaken reads tableSpans, not gridViews");
assert.ok(editor.indexOf("tableSpans.current = gridViews.map(tableSpan)") > editor.indexOf("const gridViews = useMemo("), "tableSpans is kept after gridViews");
console.log("namepreview: ok");
