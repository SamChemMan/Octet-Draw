// Run: node src/headless.check.ts. Octet with no window (scripts/headless): the AI apps' tools on a drawing in memory,
// with Indigo, Name to Structure and Clean Up Reaction as the window runs them, and the command-line runner. The SI
// scheme of the second MCP test (benzaldehyde → nitrostyrene → 2-phenylethylamine → N-(2-phenylethyl)acetamide) is
// drawn as one reaction of three steps, laid out as the window lays it out (4 November 2026: every caption's box
// within 0.1 bond length of the window's), and comes out as CDXML that Octet reads back as the same scheme.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("headless.check: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing } = await import("../scripts/headless/host.ts");
const { realFonts } = await import("../scripts/headless/browser.ts");
const { handle } = await import("./mcp.ts");
const { fromCdxml } = await import("./cdxml.ts");
const { findReaction } = await import("./reaction.ts");
const { parseStructure, toInchiKey, toSmiles } = await import("./chem.ts");
const { strict } = await import("../scripts/headless/listed.ts");
const { extractSelection, fragments } = await import("./edit.ts");
const { pageSize } = await import("./docstyle.ts");
await load();

const SCHEME = {
  start: [{ text: "benzaldehyde", number: "1" }],
  steps: [
    { above: ["MeNO2, NH4OAc", "AcOH, reflux, 4 h"], below: ["78%"], products: [{ text: "[O-][N+](=O)/C=C/c1ccccc1", number: "2" }] },
    { above: ["LiAlH4", "THF, 0 °C to reflux"], below: ["85%"], products: [{ text: "2-phenylethylamine", number: "3" }] },
    { above: ["Ac2O, Et3N", "CH2Cl2, rt"], below: ["92%"], products: [{ text: "N-(2-phenylethyl)acetamide", number: "4" }] },
  ],
};
let d = drawing("paper", "SI scheme"), n = 0;
const call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", { client: "Check" })).result;

const t = performance.now(), drew = await call("draw", { kind: "reaction", ...SCHEME });
assert.ok(!drew.isError, drew.content[0].text);
assert.ok(performance.now() - t < 5000, "a scheme draws in seconds");
const read = (await call("read", { detail: "full" })).structuredContent;
assert.deepEqual(read.structures.map((s: { number: string; smiles: string }) => [s.number, s.smiles]), [
  ["1", "C(=O)C1C=CC=CC=1"], ["2", "[O-][N+](/C=C/C1C=CC=CC=1)=O"], ["3", "C1(CCN)C=CC=CC=1"], ["4", "C1(CCNC(=O)C)C=CC=CC=1"],
]);
// No warnings: none on the chemistry, and all of the scheme is on the page.
assert.deepEqual(read.warnings, []);
assert.equal(read.reactions.length, 1, "one reaction");
assert.deepEqual(read.reactions[0].steps.map((s: { before: string[]; above: string[]; below: string[] }) => [s.before, s.above, s.below]), [
  [["s1"], ["MeNO2, NH4OAc", "AcOH, reflux, 4 h"], ["78%"]], [["s2"], ["LiAlH4", "THF, 0 °C to reflux"], ["85%"]], [["s3"], ["Ac2O, Et3N", "CH2Cl2, rt"], ["92%"]],
]);
// Laid out as the window lays it out (A4, ACS Document 1996): the scheme wraps after its first step, and the arrows
// are as long as the window makes them (7.4, 7.8 and 5.6 bond lengths), each a gap from what is before it.
const [a1, a2, a3] = read.arrows.map((a: { from: number[]; to: number[] }) => a.to[0] - a.from[0]);
const box = (id: string) => read.structures.find((s: { id: string }) => s.id === id).box;
assert.ok(box("s3")[3] < box("s1")[1], "the scheme wraps after its first step");
if (realFonts()) {
  for (const [got, want] of [[a1, 7.4], [a2, 7.8], [a3, 5.6]]) assert.ok(Math.abs(got - want) < 0.15, `arrow ${got} long, the window's ${want}`);
  const width = (text: string) => { const b = read.captions.find((c: { text: string }) => c.text === text).box; return b[2] - b[0]; };
  assert.ok(Math.abs(width("THF, 0 °C to reflux") - 5.6) < 0.15 && Math.abs(width("LiAlH4") - 2) < 0.15, "text measured as the window measures it");
}
// One undo step takes all of it away.
assert.ok(!(await call("advanced", { tool: "run_command", args: { command: "undo" } })).isError);
assert.equal(d.host.doc().atoms.length, 0);
assert.ok(!(await call("advanced", { tool: "run_command", args: { command: "redo" } })).isError);
assert.equal(fragments(d.host.doc()).length, 4);

// The CDXML reads back as the same scheme: four structures, three arrows, their conditions, the numbers.
const file = await call("read", { format: "cdxml" }), back = fromCdxml(file.structuredContent.text).mol;
assert.deepEqual(fragments(back).map((g) => toSmiles(extractSelection(back, new Set(g), new Set()))).sort(),
  read.structures.map((s: { smiles: string }) => s.smiles).sort());
assert.equal(back.arrows?.length, 3);
assert.deepEqual((back.captions ?? []).filter((c) => c.bold).map((c) => c.text).sort(), ["1", "2", "3", "4"]);
const box2 = (atoms: number[]) => { const ps = atoms.map((i) => back.atoms[i].location); return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))] as [number, number, number, number]; };
assert.deepEqual(findReaction(back, back.arrows![0].id, back.arrows!, box2, () => undefined)?.arrows.length, 3, "one reaction of three steps in the file");

// The same calls on a new drawing give the same ids, reading and CDXML.
d = drawing("paper", "SI scheme");
await call("draw", { kind: "reaction", ...SCHEME });
assert.deepEqual((await call("read", { detail: "full" })).structuredContent, read, "the same reading");
assert.equal((await call("read", { format: "cdxml" })).structuredContent.text, file.structuredContent.text, "the same CDXML");

// A name Octet cannot read draws nothing, and says so.
const bad = await call("draw", { kind: "reaction", start: [{ text: "benzaldehyde" }], steps: [{ products: [{ text: "flurbleglorp" }] }] });
assert.ok(bad.isError && /flurbleglorp/.test(bad.content[0].text));

// A caption under a compound, much wider than it ("2 (…)" as a number is number 2 with that caption). Clean Up
// Reaction gives the caption room, and the scheme still reads back as one route, with the caption on its compound;
// the CDXML's scheme has both steps whole.
d = drawing("paper", "Caption");
const wide = await call("draw", { kind: "reaction", start: [{ text: "benzene", number: "1" }], steps: [{ reagents: ["Br2"], products: [{ text: "bromobenzene", number: "2 (not isolated, used crude in the next step)" }] }, { reagents: ["Mg"], products: [{ text: "CCN", number: "3" }] }] });
assert.equal(wide.structuredContent.check, "clean");
const summed = (await call("read", {})).structuredContent;
assert.deepEqual(summed.reactions.map((r: { route: string }) => r.route), ["1 -> 2 -> 3"]);
assert.deepEqual([summed.structures[1].number, summed.structures[1].caption, summed.text], ["2", "not isolated, used crude in the next step", undefined]);
const stepsOut: string[] = (await call("read", { format: "cdxml" })).structuredContent.text.match(/<step[^>]*>/g) ?? [];
assert.ok(stepsOut.length === 2 && stepsOut.every((x) => /ReactionStepReactants/.test(x) && /ReactionStepProducts/.test(x)), stepsOut.join(" "));

// A grid of structures with captions of two lines, and with a caption wider than its structure: each cell has room
// for the text under its structure, so nothing overlaps.
for (const caption of ["85%, 92% ee\nwhite solid", "a rather long caption here"]) {
  d = drawing("paper", "Grid");
  const grid = await call("draw", { kind: "structures", structures: ["benzene", "toluene", "phenol", "aniline", "pyridine", "water"].map((text, k) => ({ text, number: `${k + 1}`, caption })), columns: 3 });
  assert.equal(grid.structuredContent.check, "clean", JSON.stringify(grid.structuredContent.check));
}

// Atoms, arrows and shapes by id: a charge, a curved arrow from a lone pair, brackets with a mark.
d = drawing("paper", "Ids");
await call("draw", { kind: "structures", structures: [{ text: "acetone" }] });
for (const [name, args] of [["change", { operations: [{ op: "edit", ids: ["s1.2"], charge: 1 }] }], ["change", { operations: [{ op: "arrow", kind: "curved", from: "s1.4:pair", to: "s1.2-4" }] }], ["change", { operations: [{ op: "shape", kind: "brackets", around: ["s1"], mark: "‡" }] }]] as const)
  assert.ok(!(await call(name, args)).isError, name);
const ids = (await call("read", { atoms: true, detail: "full" })).structuredContent;
assert.equal(ids.structures[0].smiles, "C[C+](C)=O");
assert.deepEqual([ids.arrows.map((a: { kind: string }) => a.kind), ids.shapes.map((s: { kind: string; mark: string }) => [s.kind, s.mark])], [["curved"], [["brackets", "‡"]]]);

// The layout faults of the taxol run (docs/plans/mcp-v2.md, section 17), each as an AI app meets it.
type Wrote = { isError?: true; structuredContent: { made: string[]; changed: string[]; boxes: Record<string, number[]>; check: "clean" | { overlaps?: string[][]; off_page?: string[] } } };
// (changed is in a full result only: a call whose changed is read asks for detail: full.)
// The box of what a call made, and whether Octet's own check finds it clear of everything and on the page.
const span = (w: Wrote) => { const b = w.structuredContent.made.flatMap((id) => (w.structuredContent.boxes[id] ? [w.structuredContent.boxes[id]] : [])); return [Math.min(...b.map((x) => x[0])), Math.min(...b.map((x) => x[1])), Math.max(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))]; };
const fits = (w: Wrote) => { const c = w.structuredContent.check; return c === "clean" || (!c.overlaps && !c.off_page); };
const margins = () => { const s = d.host.style(), [w, h] = pageSize(s), k = 72 / 25.4 / s.bond; return { left: (15 - w / 2) * k, top: (h / 2 - 15) * k, wrap: ((w * 72) / 25.4 - 72) / s.bond }; };
const biphenyl = (group: string) => `c1ccccc1-c1ccc(${group})cc1`, GROUPS = ["Br", "C#N", "C(=O)O", "C(=O)Cl", "C(=O)N", "CN", "CNC(C)=O"];
const route = (n: number) => ({ start: [{ text: biphenyl(GROUPS[0]), number: String(n) }], steps: GROUPS.slice(1).map((group, k) => ({ reagents: [`reagent ${k + 1}`], solvents: ["THF"], temperature: "0 °C", yield: `${90 - k}%`, products: [{ text: biphenyl(group), number: String(n + k + 1) }] })) });
{
  // A long scheme on an empty page starts at the page's top margin, wraps, and all of it is on the page. The next one
  // starts 3 bond lengths under everything drawn (numbers and conditions too), so the two do not overlap and each
  // reads as one reaction of its own six steps.
  d = drawing("paper", "Two schemes");
  const { left, top } = margins(), one: Wrote = await call("draw", { kind: "reaction", ...route(1) }), b1 = span(one);
  assert.ok(fits(one), JSON.stringify(one.structuredContent.check));
  assert.ok(Math.abs(b1[3] - top) < 0.11, `the first scheme starts at the top margin: ${b1[3]}, ${top}`);
  assert.ok(Math.abs(b1[0] - left) < 0.11 || Math.abs(b1[0] + b1[2]) < 0.11, `at the left margin, or in the middle of the page when it is wider than the margins: ${b1}`);
  const two: Wrote = await call("draw", { kind: "reaction", ...route(8), detail: "full" }), b2 = span(two);
  assert.ok(fits(two), JSON.stringify(two.structuredContent.check));
  assert.deepEqual(two.structuredContent.changed, [], "the first scheme is as it was");
  assert.ok(Math.abs(b1[1] - 3 - b2[3]) < 0.21, `the second scheme starts 3 bond lengths under the first: ${b2[3]}, ${b1[1]}`);
  const both = (await call("read", { detail: "full" })).structuredContent;
  assert.deepEqual(both.reactions.map((r: { steps: unknown[] }) => r.steps.length), [6, 6], "two reactions of six steps");
}
{
  // Free text under a structure (a scheme's title) stays free text where it is when the next scheme is drawn: it is
  // not read as conditions on the new scheme's first arrow, and no structure of the new scheme takes it along.
  d = drawing("paper", "A title");
  const short = (n: number) => ({ start: [{ text: "benzaldehyde", number: String(n) }], steps: [{ reagents: ["NaBH4"], solvents: ["MeOH"], products: [{ text: "benzyl alcohol", number: String(n + 1) }] }, { reagents: ["PBr3"], products: [{ text: "benzyl bromide", number: String(n + 2) }] }] });
  const one: Wrote = await call("draw", { kind: "reaction", ...short(1) }), title = "Scheme 1. Synthesis of benzyl bromide";
  const text: Wrote = await call("change", { operations: [{ op: "text", text: title, below: one.structuredContent.made[0], align: "left", bold: true }] }), was = text.structuredContent.boxes[text.structuredContent.made[0]];
  const two: Wrote = await call("draw", { kind: "reaction", ...short(4), detail: "full" });
  assert.ok(fits(two), JSON.stringify(two.structuredContent.check));
  assert.deepEqual(two.structuredContent.changed, [], "the title and the first scheme are as they were");
  assert.ok(Math.abs(was[1] - 3 - span(two)[3]) < 0.21, "the second scheme starts 3 bond lengths under the title's box");
  const after = (await call("read", { detail: "full" })).structuredContent;
  assert.deepEqual(after.text.map((x: { text: string }) => x.text), [title], "the title is free text");
  assert.deepEqual(after.captions.find((c: { text: string }) => c.text === title).box, was, "where it was put");
  assert.deepEqual(after.reactions.map((r: { steps: { above: string[]; below: string[] }[] }) => r.steps.map((s) => [s.above, s.below])), Array(2).fill([[["NaBH4"], ["MeOH"]], [["PBr3"], []]]), "each scheme has its own conditions only");
}
{
  // A first line too wide to wrap (two wide starting materials, their arrow and a wide product: wider than Clean Up
  // Reaction's page, narrower than the page) stays whole in the middle of the page, and the later steps wrap under it.
  d = drawing("paper", "A wide first line");
  const ph = (rings: number, a = "", b = "") => `${a}c1ccc(cc1)-${"c1ccc(cc1)-".repeat(rings - 2)}c1ccc(${b})cc1`.replace("()", "");
  const wide: Wrote = await call("draw", { kind: "reaction", start: [{ text: ph(3, "Br"), number: "1" }, { text: ph(2, "OB(O)"), number: "2" }], steps: [
    { reagents: ["Pd"], products: [{ text: ph(5), number: "3" }] }, { reagents: ["Br2"], products: [{ text: ph(5, "Br", "Br"), number: "4" }] }, { reagents: ["CuCN"], products: [{ text: ph(5, "N#C", "C#N"), number: "5" }] },
  ] });
  const [s1, , s3, s4] = wide.structuredContent.made.filter((id) => id[0] === "s").map((id) => wide.structuredContent.boxes[id]);
  assert.ok(s3[2] - s1[0] > margins().wrap, `the first line is too wide to wrap: ${s3[2] - s1[0]}`);
  assert.ok(Math.abs(s1[0] + s3[2]) < 0.21, "it is in the middle of the page");
  assert.ok(s4[3] < s3[1], "the steps after it wrap");
  assert.ok(fits(wide), JSON.stringify(wide.structuredContent.check));
  // set_style puts a drawing across the page by the same rule: with the same preset, the scheme stays in the middle.
  const styled: Wrote = await call("advanced", { tool: "set_style", args: { preset: "ACS Document 1996", detail: "full" } });
  assert.ok(!styled.structuredContent.changed.includes("s1") && fits(styled), `set_style moved the scheme: ${JSON.stringify(styled.structuredContent)}`);
  // A reaction of one step wider than the page cannot wrap or fit: it starts at the left margin, so only its end is
  // past the page (in the middle of the page, both ends would be).
  d = drawing("paper", "Wider than the page");
  const over: Wrote = await call("draw", { kind: "reaction", start: [{ text: ph(6, "Br") }, { text: ph(6, "OB(O)") }], steps: [{ reagents: ["Pd"], products: [{ text: ph(8) }] }] }), bo = span(over);
  assert.ok(bo[2] - bo[0] > pageSize(d.host.style())[0] * (72 / 25.4 / d.host.style().bond), `wider than the page: ${bo}`);
  assert.ok(Math.abs(bo[0] - margins().left) < 0.11, `it starts at the left margin: ${bo}`);
}
{
  // Free text with no place given, on an empty page: the top left of its box is at the page's margins.
  d = drawing("paper", "Text");
  const { left, top } = margins(), text: Wrote = await call("change", { operations: [{ op: "text", text: "Scheme 1. A title" }] }), b = span(text);
  assert.ok(Math.abs(b[0] - left) < 0.11 && Math.abs(b[3] - top) < 0.11, `${b}, ${[left, top]}`);
}
{
  // New work starts under a reagent table too. On an experiment page with its Procedure heading and box deleted, the
  // table under the scheme is the lowest thing drawn.
  d = drawing("experiment", "A table");
  const scheme: Wrote = await call("draw", { kind: "reaction", start: [{ text: "benzaldehyde" }], steps: [{ reagents: ["NaBH4"], products: [{ text: "benzyl alcohol" }] }] });
  const page = (await call("read", { detail: "full" })).structuredContent, heading = page.text.find((x: { text: string }) => x.text === "Procedure").id, lowest = page.shapes.reduce((p: { box: number[] }, q: { box: number[] }) => (q.box[1] < p.box[1] ? q : p)).id;
  assert.ok(!(await call("change", { operations: [{ op: "delete", ids: [heading, lowest] }] })).isError);
  const table = d.host.tables()[0].box, under: Wrote = await call("draw", { kind: "structures", structures: [{ text: "toluene" }] });
  assert.ok(table[1] < scheme.structuredContent.boxes.s1[1] - 1, "the table reaches under the scheme's structures");
  assert.ok(span(under)[3] <= table[1] - 3 && span(under)[3] > table[1] - 4.5, `3 bond lengths under the table (and the grid's 1.25 round a structure): ${span(under)}, ${table}`);
}
{
  // Clean Up Structure on one reactant (run_command clean_up) lays its reaction out again, as in the window. A
  // reactant that then reaches over the plus sign beside it (terphenyl, drawn upright, lies flat when it is cleaned
  // up) keeps that plus sign: Octet adds no second one.
  d = drawing("paper", "Clean up");
  const drawn: Wrote = await call("draw", { kind: "reaction", start: [{ text: "c1ccc(cc1)c1ccc(cc1)c1ccccc1", rotate: 90 }, { text: "aniline" }], steps: [{ reagents: ["AcOH"], products: [{ text: "N-benzylideneaniline" }] }], keep_orientation: false });
  const pluses = () => (d.host.doc().captions ?? []).filter((c) => c.text.trim() === "+").length, arrow = Number(drawn.structuredContent.made.find((id) => id[0] === "a")!.slice(1));
  assert.equal(pluses(), 1);
  const cleaned: Wrote = await call("advanced", { tool: "run_command", args: { command: "clean_up", ids: ["s1"] } });
  assert.ok(!cleaned.isError && fits(cleaned), JSON.stringify(cleaned.structuredContent.check));
  assert.equal(pluses(), 1, "one plus sign after the clean-up");
  assert.deepEqual(d.host.reaction(arrow)?.steps.map((s) => s.kind), ["structure", "plus", "structure", "arrow", "structure"]);
}

// Twenty-five typical jobs, each written from tools/list and the instructions alone, as an AI app meets them (plan
// 5.5): every call fits the listed schema as a strict AI app checks it, Octet takes it, and the drawing is what the
// job asked for. So the list cannot say what the tools do not take. r is each earlier result; cannot is what only the
// window can do (a dialog, aligning), which Octet with no window answers that it cannot.
{
  const tools = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list" }), () => d.host, "1")).result.tools;
  const MOL = "\n  Octet\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    2.5981    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0\n  2  3  1  0\nM  END\n";
  type Read = { structures: { id: string; number?: string; smiles: string; inchiKey: string; formula: string; box: number[] }[]; reactions: { steps: { above: string[] }[] }[]; arrows: { kind: string }[]; shapes?: { kind: string }[]; cycles?: unknown[]; captions: { text: string; box: number[] }[]; style: string };
  type Job = [string, [string, unknown | ((r: any[]) => unknown)][], (e: Read, r: any[]) => boolean, RegExp?];
  const nums = (e: Read) => e.structures.map((s) => s.number ?? "").join(), key = (s: string) => toInchiKey(parseStructure(s));
  const sOf = (r: any[], k = 0, n = 0) => r[k].made.filter((x: string) => x[0] === "s")[n];
  const JOBS: Job[] = [
    ["one reaction from names", [["draw", { kind: "reaction", start: [{ text: "benzaldehyde" }, { text: "acetophenone" }], steps: [{ reagents: ["NaOH"], solvents: ["EtOH"], temperature: "rt", yield: "88%", products: [{ text: "chalcone", number: "1" }] }] }]],
      (e) => e.structures.length === 3 && e.reactions.length === 1],
    ["a 5-step scheme", [["draw", { kind: "reaction", start: [{ text: "benzaldehyde", number: "1" }], steps: [
      { reagents: ["MeNO2", "NH4OAc"], solvents: ["AcOH"], temperature: "reflux", products: [{ text: "[O-][N+](=O)/C=C/c1ccccc1", number: "2" }] },
      { reagents: ["LiAlH4"], solvents: ["THF"], products: [{ text: "2-phenylethylamine", number: "3" }] },
      { reagents: ["Boc2O", "Et3N"], solvents: ["CH2Cl2"], products: [{ text: "tert-butyl N-(2-phenylethyl)carbamate", number: "4" }] },
      { reagents: ["NaH", "MeI"], solvents: ["DMF"], products: [{ text: "CN(CCc1ccccc1)C(=O)OC(C)(C)C", number: "5" }] },
      { reagents: ["TFA"], solvents: ["CH2Cl2"], products: [{ text: "N-methyl-2-phenylethylamine", number: "6" }] }] }]],
      (e) => nums(e) === "1,2,3,4,5,6" && e.reactions.length === 1 && e.reactions[0].steps.length === 5],
    ["a grid of 12 numbered structures", [["draw", { kind: "structures", columns: 4, structures: ["benzene", "toluene", "phenol", "aniline", "anisole", "benzoic acid", "benzaldehyde", "acetophenone", "nitrobenzene", "chlorobenzene", "pyridine", "naphthalene"].map((text, k) => ({ text, number: `${k + 1}` })) }]],
      (e) => nums(e) === "1,2,3,4,5,6,7,8,9,10,11,12"],
    // A metal and its ligands as draw's description says ('*[Pd]*' and labels): Pd(PPh3)2 is not a name Octet reads.
    ["a catalytic cycle", [["draw", { kind: "cycle", centre: "Suzuki coupling", intermediates: [{ text: "*[Pd]*", labels: ["PPh3", "PPh3"] }, { text: "Br[Pd](*)(*)c1ccccc1", labels: ["PPh3", "PPh3"] }, { text: "c1ccc(cc1)[Pd](*)(*)c1ccc(C)cc1", labels: ["PPh3", "PPh3"] }], steps: [{ step: 0, name: "OA", in: "PhBr" }, { step: 1, name: "TM", in: "ArB(OH)2", out: "B(OH)3" }, { step: 2, name: "RE", out: "Ph-Ar" }] }]],
      (e) => e.cycles?.length === 1 && e.structures.length === 3],
    ["fix one atom", [["draw", { kind: "structures", structures: [{ text: "Cc1ccccc1", number: "1" }] }], ["change", (r) => ({ operations: [{ op: "edit", ids: [`${sOf(r)}.3`], label: "N" }] })]],
      (e) => e.structures[0].inchiKey === key("Cc1ccccn1")],
    ["restyle for a journal and say what did not fit", [["draw", { kind: "reaction", start: [{ text: "benzoic acid" }, { text: "methanol" }], steps: [{ reagents: ["H2SO4 (cat.)"], temperature: "reflux", products: [{ text: "methyl benzoate", number: "1" }] }] }], ["advanced", { tool: "set_style", args: { preset: "RSC" } }]],
      (e, r) => e.style === "RSC" && "check" in r[1]],
    ["read and answer a question", [["draw", { kind: "structures", structures: [{ text: "aspirin", number: "1" }] }], ["read", {}]], (_, r) => r[1].structures[0].formula === "C9H8O4"],
    ["export a PDF", [["draw", { kind: "structures", structures: [{ text: "caffeine" }] }], ["advanced", { tool: "export", args: { format: "pdf" } }]], (e) => e.structures.length === 1, /cannot open the Export dialog/],
    ["highlight a group", [["draw", { kind: "structures", structures: [{ text: "Cc1ccc(cc1)[N+](=O)[O-]", number: "1" }] }], ["change", (r) => ({ operations: [{ op: "edit", ids: [8, 9, 10].map((k) => `${sOf(r)}.${k}`), highlight: "#ffe066" }] })]],
      () => d.host.doc().atoms.filter((a) => /ffe066/i.test(JSON.stringify(a))).length === 3],
    // As change's arrow says: the product right_of the last one with room for the arrow, the arrow, its text, then
    // clean_reaction.
    ["add a step to an existing scheme", [["draw", { kind: "reaction", start: [{ text: "benzoic acid", number: "1" }], steps: [{ reagents: ["SOCl2"], products: [{ text: "benzoyl chloride", number: "2" }] }] }],
      ["change", (r) => ({ operations: [{ op: "draw", kind: "structures", structures: [{ text: "N,N-diethylbenzamide", number: "3" }], right_of: sOf(r, 0, 1), gap: 4 }, { op: "arrow", kind: "reaction", from: sOf(r, 0, 1), to: "$1.s[0]" }, { op: "text", text: "Et2NH, Et3N", arrow: "$2.a[0]", side: "above" }] })],
      ["advanced", { tool: "run_command", args: { command: "clean_reaction" } }]],
      (e) => e.reactions.length === 1 && e.reactions[0].steps.length === 2 && e.reactions[0].steps[1].above.includes("Et2NH, Et3N")],
    ["renumber", [["draw", { kind: "structures", structures: [{ text: "benzene", number: "1" }, { text: "toluene", number: "2" }, { text: "phenol", number: "3" }] }],
      ["change", (r) => ({ operations: [0, 1, 2].map((k) => ({ op: "number", structure: sOf(r, 0, k), number: `${k + 2}` })) })]], (e) => nums(e) === "2,3,4"],
    ["delete one structure", [["draw", { kind: "structures", structures: [{ text: "benzene", number: "1" }, { text: "toluene", number: "2" }, { text: "phenol", number: "3" }] }], ["change", { operations: [{ op: "delete", ids: ["2"] }] }]], (e) => nums(e) === "1,3"],
    // The second branch below all of the first ('$1.made'), and their product with room for the arrows.
    ["a two-branch convergent synthesis", [["change", { operations: [
      { op: "draw", kind: "reaction", start: [{ text: "4-bromobenzoic acid", number: "1" }], steps: [{ reagents: ["MeOH", "H2SO4"], products: [{ text: "methyl 4-bromobenzoate", number: "2" }] }] },
      { op: "draw", kind: "reaction", start: [{ text: "4-methoxyphenylboronic acid", number: "3" }], steps: [{ reagents: ["pinacol"], products: [{ text: "COc1ccc(cc1)B1OC(C)(C)C(C)(C)O1", number: "4" }] }], below: "$1.made", align: "left" },
      { op: "draw", kind: "structures", structures: [{ text: "methyl 4'-methoxybiphenyl-4-carboxylate", number: "5" }], right_of: "$1.s[1]", gap: 4 },
      { op: "arrow", kind: "reaction", from: "$1.s[1]", to: "$3.s[0]" }, { op: "arrow", kind: "reaction", from: "$2.s[1]", to: "$3.s[0]" },
      { op: "text", text: "Pd(PPh3)4, K2CO3", arrow: "$4.a[0]", side: "above" }] }]],
      (e) => nums(e) === "1,2,3,4,5" && e.arrows.length === 4 && e.structures[2].box[3] < Math.min(e.structures[0].box[1], e.structures[1].box[1])],
    ["a reagent drawn as a structure over the arrow", [["draw", { kind: "reaction", start: [{ text: "benzylamine", number: "1" }], steps: [{ above: ["structure: Boc2O"], reagents: ["Et3N"], solvents: ["CH2Cl2"], products: [{ text: "tert-butyl benzylcarbamate", number: "2" }] }] }]],
      (e) => e.structures.length === 3],
    // The footnote below all of the scheme ('$1.made').
    ["conditions as letters with a footnote", [["change", { operations: [
      { op: "draw", kind: "reaction", start: [{ text: "benzaldehyde", number: "1" }], steps: [{ above: ["a"], products: [{ text: "[O-][N+](=O)/C=C/c1ccccc1", number: "2" }] }, { above: ["b"], products: [{ text: "2-phenylethylamine", number: "3" }] }, { above: ["c"], products: [{ text: "N-(2-phenylethyl)acetamide", number: "4" }] }] },
      { op: "text", text: "Reagents and conditions: (a) MeNO2, NH4OAc, AcOH, reflux; (b) LiAlH4, THF; (c) Ac2O, Et3N, CH2Cl2.", below: "$1.made" }] }]],
      (e) => e.captions.find((c) => c.text.startsWith("Reagents"))!.box[3] < Math.min(...e.structures.map((s) => s.box[1]))],
    ["an equilibrium and a retro arrow", [["change", { operations: [
      { op: "draw", kind: "reaction", start: [{ text: "acetic acid" }], steps: [{ arrow: "equilibrium", products: [{ text: "acetate" }] }] },
      { op: "draw", kind: "reaction", start: [{ text: "ibuprofen", number: "1" }], steps: [{ arrow: "retro", products: [{ text: "isobutylbenzene", number: "2" }] }], below: "$1.s[0]" }] }]],
      (e) => e.arrows.map((a) => a.kind).sort().join() === "equilibrium,retro"],
    ["a mechanism step with two curly arrows", [["draw", { kind: "structures", structures: [{ text: "[OH-]" }, { text: "CBr" }] }],
      ["change", (r) => ({ operations: [{ op: "arrow", kind: "curved", from: `${sOf(r)}.1`, to: `${sOf(r, 0, 1)}.1` }, { op: "arrow", kind: "curved", from: `${sOf(r, 0, 1)}.1-2`, to: `${sOf(r, 0, 1)}.2` }] })]],
      (e) => e.arrows.filter((a) => a.kind === "curved").length === 2],
    ["a compound from an earlier one with a protecting group swapped", [["draw", { kind: "structures", structures: [{ text: "4-(benzyloxy)benzaldehyde", number: "1" }, { from: "1", changes: [{ swap: { OBn: "OTBS" } }], number: "2" }] }]],
      (e) => e.structures[1].inchiKey === key("CC(C)(C)[Si](C)(C)Oc1ccc(C=O)cc1")],
    ["a substrate scope grid with yields as captions", [["draw", { kind: "structures", columns: 3, structures: ["toluene", "anisole", "chlorobenzene", "fluorobenzene", "benzonitrile", "methyl benzoate"].map((text, k) => ({ text, number: `3${"abcdef"[k]}`, caption: `${90 - 5 * k}%` })) }]],
      (e) => e.structures.length === 6 && e.captions.filter((c) => c.text.endsWith("%")).length === 6],
    ["a MOL file given as text", [["draw", { kind: "structures", structures: [{ text: MOL, number: "1" }] }]], (e) => e.structures[0].inchiKey === key("CCO")],
    ["a file read back as CDXML", [["draw", { kind: "structures", structures: [{ text: "caffeine", number: "1" }] }], ["read", { format: "cdxml" }]], (_, r) => /<CDXML/.test(r[1].text)],
    ["three structures aligned and distributed", [["draw", { kind: "structures", columns: 3, structures: [{ text: "benzene" }, { text: "toluene" }, { text: "phenol" }] }], ["change", (r) => ({ operations: [{ op: "arrange", ids: r[0].made, how: "middle" }, { op: "arrange", ids: r[0].made, how: "across" }] })]],
      (e) => e.structures.length === 3, /cannot line them up now/],
    ["a box round two structures with a title", [["draw", { kind: "structures", structures: [{ text: "benzene" }, { text: "toluene" }] }], ["change", (r) => ({ operations: [{ op: "shape", kind: "box", around: r[0].made }, { op: "text", text: "Aromatic solvents", above: "$1.b[0]" }] })]],
      (e) => e.shapes?.length === 1 && e.captions.some((c) => c.text === "Aromatic solvents")],
    ["a TLC plate", [["change", { operations: [{ op: "shape", kind: "tlc", box: [0, 0, 4, 6] }] }]], (e) => e.shapes?.[0]?.kind === "tlc"],
    ["undo of the last call", [["draw", { kind: "structures", structures: [{ text: "benzene" }] }], ["draw", { kind: "structures", structures: [{ text: "toluene" }] }], ["advanced", { tool: "run_command", args: { command: "undo" } }]],
      (e) => e.structures.length === 1 && e.structures[0].inchiKey === key("c1ccccc1")],
  ];
  assert.equal(JOBS.length, 25);
  for (const [job, calls, want, cannot] of JOBS) {
    d = drawing("paper", job);
    const r: any[] = [];
    for (const [name, a] of calls) {
      const args = typeof a === "function" ? a(r) : a, listed = tools.find((t: { name: string }) => t.name === name).inputSchema;
      assert.equal(strict(listed, args, listed.$defs, name), undefined, `${job}: ${JSON.stringify(args)}`);
      const done = await call(name, args);
      assert.ok(!done.isError || cannot?.test(done.content[0].text), `${job}: ${done.content[0].text}`);
      r.push(done.structuredContent);
    }
    const end = (await call("read", { detail: "full" })).structuredContent;
    assert.ok(want(end, r), `${job}: ${JSON.stringify(end).slice(0, 2000)}`);
  }
}

// The runner: two inputs, a list of tool calls and a reaction argument, drawn by two workers.
const dir = mkdtempSync(join(tmpdir(), "octet-headless-"));
try {
  writeFileSync(join(dir, "calls.json"), JSON.stringify([{ name: "draw", arguments: { kind: "structures", structures: [{ text: "aspirin" }, { text: "caffeine" }] } }]));
  writeFileSync(join(dir, "scheme.json"), JSON.stringify(SCHEME));
  const run = spawnSync(process.execPath, [new URL("../scripts/headless/draw.ts", import.meta.url).pathname, "--jobs", "2", join(dir, "calls.json"), join(dir, "scheme.json")], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const scheme = JSON.parse(readFileSync(join(dir, "scheme.drawn.json"), "utf8")).drawing;
  assert.deepEqual(scheme.structures.map((s: { inchiKey: string }) => s.inchiKey), ["HUMNYLRZRPPJDN-UHFFFAOYSA-N", "PIAOLBVUVDXHHL-VOTSOKGWSA-N", "BHHGXPLMPWCGHP-UHFFFAOYSA-N", "MODKMHXGCGKTLE-UHFFFAOYSA-N"]);
  assert.equal(JSON.parse(readFileSync(join(dir, "calls.drawn.json"), "utf8")).drawing.structures.length, 2);
  assert.match(readFileSync(join(dir, "scheme.cdxml"), "utf8"), /<scheme[\s\S]*<step[\s\S]*<step[\s\S]*<step/);
} finally { rmSync(dir, { recursive: true, force: true }); }

console.log("headless.check: ok");
