// Run: node src/headless.check.ts. Octet with no window (scripts/headless): the AI apps' tools on a drawing in memory,
// with Indigo, Name to Structure and Clean Up Reaction as the window runs them, and the command-line runner. The SI
// scheme of the second MCP test (benzaldehyde → nitrostyrene → 2-phenylethylamine → N-(2-phenylethyl)acetamide) is
// drawn as one reaction of three steps, laid out as the window lays it out (4 November 2026: every caption's box
// within 0.1 bond length of the window's), and comes out as CDXML that Octet reads back as the same scheme.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn, spawnSync } from "node:child_process";
import { promisify } from "node:util";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("headless.check: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing, session } = await import("../scripts/headless/host.ts");
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
const call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Check", "check"))).result;
// The session's brief first (plan 3.1), as the instructions ask: these drawings are for a paper.
assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);

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
  // A reagent table starts under the compound numbers of its reaction, as the window lays it out (gridview.ts captionBox).
  d = drawing("experiment", "Numbers");
  assert.ok(!(await call("draw", { kind: "reaction", start: [{ text: "benzaldehyde", number: "1" }], steps: [{ reagents: ["NaBH4"], products: [{ text: "benzyl alcohol", number: "2" }] }] })).isError);
  const m = d.host.doc(), table = d.host.tables()[0].box, numbers = m.captions!.filter((c) => c.bold && /^[12]$/.test(c.text)).map((c) => d.host.textBox(c.id)!);
  assert.ok(numbers.length === 2 && numbers.every((b) => table[3] <= b[1]), `the table ${table} is under the numbers ${numbers.join(" ")}`);
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
  type Read = { structures: { id: string; number?: string; smiles: string; inchiKey: string; formula: string; box: number[] }[]; reactions: { steps: { above: string[]; below: string[] }[] }[]; arrows: { kind: string; from: number[]; to: number[] }[]; shapes?: { kind: string }[]; cycles?: unknown[]; captions: { text: string; box: number[] }[]; style: string };
  // Each job: its calls, what the drawing must then be, a refusal Octet with no window must give, and whether the job
  // leaves something that does not fit (else every result's check must be clean: an AI app fixes every id it names,
  // so a job that leaves one is not done in these calls).
  type Job = [string, [string, unknown | ((r: any[]) => unknown)][], (e: Read, r: any[]) => boolean, RegExp?, true?];
  const nums = (e: Read) => e.structures.map((s) => s.number ?? "").join(), key = (s: string) => toInchiKey(parseStructure(s));
  // The structures a call made: a draw by lines lists them in compounds ("2 s3 C8H8O2"), a JSON draw in made.
  const made = (x: any): string[] => [...(x.compounds ?? []).map((c: string) => /\bs\d+\b/.exec(c)![0]), ...x.made];
  const sOf = (r: any[], k = 0, n = 0) => made(r[k]).filter((x: string) => x[0] === "s")[n];
  // (Written again from the tool list of plan 19.2: one draw call with lines, and structures for the JSON.)
  const JOBS: Job[] = [
    ["one reaction from names", [["draw", { lines: "benzaldehyde + acetophenone -> chalcone (1), NaOH, EtOH, rt, 88%" }]],
      (e) => e.structures.map((s) => s.formula).join() === "C7H6O,C8H8O,C15H12O" && e.reactions.length === 1 && e.reactions[0].steps[0].above.join() === "NaOH" && e.reactions[0].steps[0].below.join() === "EtOH, rt,88%"],
    ["a 5-step scheme", [["draw", { lines: "benzaldehyde (1) -> [O-][N+](=O)/C=C/c1ccccc1 (2), MeNO2, NH4OAc, AcOH, reflux\n-> 2-phenylethylamine (3), LiAlH4, THF\n-> tert-butyl N-(2-phenylethyl)carbamate (4), Boc2O, Et3N, CH2Cl2\n-> CN(CCc1ccccc1)C(=O)OC(C)(C)C (5), NaH, MeI, DMF\n-> N-methyl-2-phenylethylamine (6), TFA, CH2Cl2" }]],
      (e) => nums(e) === "1,2,3,4,5,6" && e.reactions.length === 1 && e.reactions[0].steps.length === 5],
    ["a grid of 12 numbered structures", [["draw", { lines: "benzene (1) | toluene (2) | phenol (3) | aniline (4)\nanisole (5) | benzoic acid (6) | benzaldehyde (7) | acetophenone (8)\nnitrobenzene (9) | chlorobenzene (10) | pyridine (11) | naphthalene (12)" }]],
      (e) => nums(e) === "1,2,3,4,5,6,7,8,9,10,11,12"],
    // A metal and its ligands as the instructions say ({L}[Pd]{L}): Pd(PPh3)2 is not a name Octet reads.
    ["a catalytic cycle", [["draw", { lines: "# Suzuki coupling\n{PPh3}[Pd]{PPh3} -> Br[Pd]({PPh3})({PPh3})c1ccccc1, +PhBr, OA -> c1ccc(cc1)[Pd]({PPh3})({PPh3})c1ccc(C)cc1, +ArB(OH)2, -B(OH)3, TM -> {PPh3}[Pd]{PPh3}, -Ph-Ar, RE" }]],
      (e) => e.cycles?.length === 1 && e.structures.length === 3],
    ["fix one atom", [["draw", { lines: "Cc1ccccc1 (1)" }], ["change", (r) => ({ operations: [{ op: "edit", ids: [`${sOf(r)}.3`], label: "N" }] })]],
      (e) => e.structures[0].inchiKey === key("Cc1ccccn1")],
    // A row of four on A4 that does not fit one column: set_style's check names what no longer fits.
    ["restyle for a journal and say what did not fit", [["draw", { lines: "caffeine (1) | aspirin (2) | ibuprofen (3) | paracetamol (4)" }], ["advanced", { tool: "set_style", args: { preset: "RSC", page: "ACS1" } }]],
      (e, r) => e.style === "RSC" && r[0].check === "clean" && r[1].check.off_page.includes("s4"), undefined, true],
    ["read and answer a question", [["draw", { lines: "aspirin (1)" }], ["read", {}]], (_, r) => r[1].structures[0].formula === "C9H8O4"],
    ["export a PDF", [["draw", { lines: "caffeine" }], ["advanced", { tool: "export", args: { format: "pdf" } }]], (e) => e.structures.length === 1, /cannot open the Export dialog/],
    ["highlight a group", [["draw", { lines: "Cc1ccc(cc1)[N+](=O)[O-] (1)" }], ["change", (r) => ({ operations: [{ op: "edit", ids: [8, 9, 10].map((k) => `${sOf(r)}.${k}`), highlight: "#ffe066" }] })]],
      () => d.host.doc().atoms.filter((a) => /ffe066/i.test(JSON.stringify(a))).length === 3],
    // As change's arrow says: the product right_of the last one with room for the arrow, the arrow, its text, then
    // clean_reaction.
    ["add a step to an existing scheme", [["draw", { lines: "benzoic acid (1) -> benzoyl chloride (2), SOCl2" }],
      ["change", (r) => ({ operations: [{ op: "draw", lines: "N,N-diethylbenzamide (3)", right_of: sOf(r, 0, 1), gap: 5.4 }, { op: "arrow", kind: "reaction", from: sOf(r, 0, 1), to: "$1.s[0]" }, { op: "text", text: "Et2NH, Et3N", arrow: "$2.a[0]", side: "above" }] })],
      ["advanced", { tool: "run_command", args: { command: "clean_reaction" } }]],
      (e) => e.reactions.length === 1 && e.reactions[0].steps.length === 2 && e.reactions[0].steps[1].above.includes("Et2NH, Et3N")],
    ["renumber", [["draw", { lines: "benzene (1) | toluene (2) | phenol (3)" }],
      ["change", (r) => ({ operations: [0, 1, 2].map((k) => ({ op: "number", structure: sOf(r, 0, k), number: `${k + 2}` })) })]], (e) => nums(e) === "2,3,4"],
    ["delete one structure", [["draw", { lines: "benzene (1) | toluene (2) | phenol (3)" }], ["change", { operations: [{ op: "delete", ids: ["2"] }] }]], (e) => nums(e) === "1,3"],
    // The second branch below all of the first ('$1.made'), and their product with room for the arrows.
    ["a two-branch convergent synthesis", [["change", { operations: [
      { op: "draw", lines: "4-bromobenzoic acid (1) -> methyl 4-bromobenzoate (2), MeOH, H2SO4" },
      { op: "draw", lines: "4-methoxyphenylboronic acid (3) -> COc1ccc(cc1)B1OC(C)(C)C(C)(C)O1 (4), pinacol", below: "$1.made", align: "left" },
      { op: "draw", lines: "methyl 4'-methoxybiphenyl-4-carboxylate (5)", right_of: "$1.s[1]", gap: 7.4 },
      { op: "arrow", kind: "reaction", from: "$1.s[1]", to: "$3.s[0]" }, { op: "arrow", kind: "reaction", from: "$2.s[1]", to: "$3.s[0]" },
      { op: "text", text: "Pd(PPh3)4, K2CO3", arrow: "$4.a[0]", side: "above" }] }]],
      (e) => nums(e) === "1,2,3,4,5" && e.arrows.length === 4 && e.structures[2].box[3] < Math.min(e.structures[0].box[1], e.structures[1].box[1])],
    ["a reagent drawn as a structure over the arrow", [["draw", { lines: "benzylamine (1) -> tert-butyl benzylcarbamate (2), @Boc2O, Et3N, CH2Cl2" }]],
      (e) => { const [a] = e.arrows, s = e.structures[1].box; return e.structures.length === 3 && s[0] >= a.from[0] && s[2] <= a.to[0] && s[1] > a.from[1]; }],
    // A step's label: letters on the arrows and the footnote under the scheme (a route's legend letters).
    ["conditions as letters with a footnote", [["draw", { lines: "benzaldehyde (1) -> [O-][N+](=O)/C=C/c1ccccc1 (2), (a), MeNO2, NH4OAc, AcOH, reflux\n-> 2-phenylethylamine (3), (b), LiAlH4, THF\n-> N-(2-phenylethyl)acetamide (4), (c), Ac2O, Et3N, CH2Cl2" }]],
      (e) => e.captions.find((c) => c.text.startsWith("Reagents"))!.box[3] < Math.min(...e.structures.map((s) => s.box[1])) && e.reactions[0].steps.map((s) => s.above.join()).join() === "a,b,c"],
    ["an equilibrium and a retro arrow", [["draw", { lines: "acetic acid <=> acetate\nibuprofen (1) => isobutylbenzene (2)" }]],
      (e) => e.arrows.map((a) => a.kind).sort().join() === "equilibrium,retro"],
    ["a mechanism step with two curly arrows", [["draw", { lines: "[OH-] | CBr" }],
      ["change", (r) => ({ operations: [{ op: "arrow", kind: "curved", from: `${sOf(r)}.1:pair`, to: `${sOf(r, 0, 1)}.1` }, { op: "arrow", kind: "curved", from: `${sOf(r, 0, 1)}.1-2`, to: `${sOf(r, 0, 1)}.2` }] })]],
      (e) => e.arrows.filter((a) => a.kind === "curved").length === 2],
    ["a compound from an earlier one with a protecting group swapped", [["draw", { lines: "4-(benzyloxy)benzaldehyde (1)\n1[OBn>OTBS] (2)" }]],
      (e) => e.structures[1].inchiKey === key("CC(C)(C)[Si](C)(C)Oc1ccc(C=O)cc1")],
    ["a substrate scope grid with yields as captions", [["draw", { lines: "toluene (3a) 90% | anisole (3b) 85% | chlorobenzene (3c) 80%\nfluorobenzene (3d) 75% | benzonitrile (3e) 70% | methyl benzoate (3f) 65%" }]],
      (e) => e.structures.length === 6 && e.captions.filter((c) => c.text.endsWith("%")).length === 6],
    ["a MOL file given as text", [["draw", { structures: [{ text: MOL, number: "1" }] }]], (e) => e.structures[0].inchiKey === key("CCO")],
    ["a file read back as CDXML", [["draw", { lines: "caffeine (1)" }], ["read", { format: "cdxml" }]], (_, r) => /<CDXML/.test(r[1].text)],
    ["three structures aligned and distributed", [["draw", { lines: "benzene | toluene | phenol" }], ["change", (r) => ({ operations: [{ op: "arrange", ids: made(r[0]), how: "middle" }, { op: "arrange", ids: made(r[0]), how: "across" }] })]],
      (e) => e.structures.length === 3, /cannot line them up now/],
    ["a box round two structures with a title", [["draw", { lines: "benzene | toluene" }], ["change", (r) => ({ operations: [{ op: "shape", kind: "box", around: made(r[0]) }, { op: "text", text: "Aromatic solvents", above: "$1.b[0]" }] })]],
      (e) => e.shapes?.length === 1 && e.captions.some((c) => c.text === "Aromatic solvents")],
    ["a TLC plate", [["change", { operations: [{ op: "shape", kind: "tlc", box: [0, 0, 4, 6] }] }]], (e) => e.shapes?.[0]?.kind === "tlc"],
    ["undo of the last call", [["draw", { lines: "benzene" }], ["draw", { lines: "toluene" }], ["advanced", { tool: "run_command", args: { command: "undo" } }]],
      (e) => e.structures.length === 1 && e.structures[0].inchiKey === key("c1ccccc1")],
  ];
  assert.equal(JOBS.length, 25);
  for (const [job, calls, want, cannot, unfit] of JOBS) {
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
    assert.ok(unfit || r.every((x) => x?.check === undefined || x.check === "clean"), `${job}: ${JSON.stringify(r.map((x) => x?.check))}`);
    assert.ok(want(end, r), `${job}: ${JSON.stringify(end).slice(0, 2000)}`);
  }
}

// What one call draws fits the page and reads back whole (plan R4; the faults of docs/plans/mcp-v2-corpus-faults.md,
// each with its smallest input, drawn and measured as the window does).
{
  // A salt given as one compound is one compound with the salt's InChIKey, by a SMILES with a dot or by one name.
  d = drawing("paper", "Salts");
  const salts: Wrote = await call("draw", { kind: "structures", structures: [{ text: "C[N+](C)(C)C.[Cl-]", number: "1" }, { text: "tetramethylammonium chloride", number: "2" }, { text: "[Na+].[Cl-]", number: "3" }] });
  assert.deepEqual([salts.structuredContent.made.filter((id) => id[0] === "s").length, salts.structuredContent.check], [3, "clean"]);
  const three = (await call("read", { detail: "full" })).structuredContent;
  assert.deepEqual(three.structures.map((s: { number: string; formula: string; inchiKey: string }) => [s.number, s.formula, s.inchiKey]), [["1", "C4H12ClN", "OKIZCWYLBDKLSU-UHFFFAOYSA-M"], ["2", "C4H12ClN", "OKIZCWYLBDKLSU-UHFFFAOYSA-M"], ["3", "ClNa", "FAPWRFPIFSIZLT-UHFFFAOYSA-M"]]);
  assert.deepEqual(three.warnings, []);
  // The salt is one compound after its CDXML is read again (its ions are an integral group in the file).
  const again = drawing("paper", "Salts again");
  again.host.begin("open"); again.host.set(again.host.file((await call("read", { format: "cdxml" })).structuredContent.text)!); again.host.end();
  d = again;
  assert.deepEqual((await call("read", { detail: "full" })).structuredContent.structures.map((s: { number: string; inchiKey: string }) => [s.number, s.inchiKey]), three.structures.map((s: { number: string; inchiKey: string }) => [s.number, s.inchiKey]));
  // A scheme with salts in it wraps to the page and reads as one reaction, each salt one member of it.
  d = drawing("paper", "A scheme with salts");
  const salty = "c1ccccc1c1ccccc1.[Cl-]", scheme: Wrote = await call("draw", { kind: "reaction", start: [{ text: "biphenyl" }], steps: [salty, salty, "biphenyl", "biphenyl", "biphenyl"].map((text, k) => ({ products: [{ text, number: String(k + 1) }] })) });
  assert.equal(scheme.structuredContent.check, "clean");
  const route = (await call("read", {})).structuredContent;
  assert.deepEqual([route.reactions.map((r: { route: string }) => r.route), route.text], [["s1 -> 1 -> 2 -> 3 -> 4 -> 5"], undefined]);
}
{
  // A grid's columns come from the page and from each structure's box as drawn: wide labels do not run into the next
  // structure, and six anthracenes are two rows of three inside the page.
  d = drawing("paper", "Grids");
  const labels: Wrote = await call("draw", { kind: "structures", structures: [{ text: "*c1ccc(*)cc1", labels: ["CO2Et", "NHBoc"] }, { text: "*c1ccc(*)cc1", labels: ["CO2Et", "NHBoc"] }, { text: "*CC", labels: ["CO2Bn"] }, { text: "*CC", labels: ["CO2CH(CF3)2"] }] });
  assert.equal(labels.structuredContent.check, "clean");
  const six: Wrote & { content: { text: string }[] } = await call("draw", { kind: "structures", structures: Array.from({ length: 6 }, () => ({ text: "anthracene" })) });
  assert.match(six.content[0].text, /^Drew 6 structures in 2 rows of 3\. One undo step\./);
  assert.equal(six.structuredContent.check, "clean");
  const { left } = margins(), b = span(six);
  assert.ok(b[0] >= left - 0.11 && b[2] <= -left + 0.11, `inside the margins: ${b}`);
}
{
  // A structure at an arrow has room: the arrow is as long as it, it is clear of the arrow's text on its side, and it
  // reads as the step's. A compound there takes its labels and its number, clear of the text and the arrow.
  d = drawing("paper", "At an arrow");
  const one: Wrote = await call("draw", { kind: "reaction", start: [{ text: "benzene" }], steps: [{ above: ["structure: Hantzsch ester"], products: [{ text: "toluene" }] }] });
  const two: Wrote = await call("draw", { kind: "reaction", start: [{ text: "benzoic acid" }], steps: [{ above: ["(COCl)2"], below: ["then", "structure:S=C1C=CC=CN1O[Na]"], products: [{ text: "benzoyl chloride" }] }] });
  const three: Wrote = await call("draw", { kind: "reaction", start: [{ text: "*CC=C", labels: ["Bn"], number: "2a" }], steps: [{ above: [{ text: "C=CCS(=O)(=O)C*", labels: ["OTBS"], number: "1a" }, "1a (4 equiv.)", "HG-II (5 mol%)", "CH2Cl2, 40 °C"], products: [{ text: "*CCC=C", labels: ["Bn"], number: "4a" }] }] });
  for (const w of [one, two, three]) assert.equal(w.structuredContent.check, "clean", JSON.stringify(w.structuredContent.check));
  const b = one.structuredContent.boxes;
  assert.ok(b.a1[0] <= b.s2[0] && b.a1[2] >= b.s2[2] && b.s3[0] > b.a1[2], `the arrow is as long as the structure over it, and the product is past it: ${JSON.stringify(b)}`);
  const at = (await call("read", {})).structuredContent;
  assert.deepEqual(at.reactions.map((r: { route: string; conditions: Record<string, string> }) => [r.route, Object.values(r.conditions)[0]]), [["s1 -> s3", "s2"], ["s4 -> s6", "(COCl)2; then; s5"], ["2a -> 4a", "1a (4 equiv.); HG-II (5 mol%); CH2Cl2, 40 °C; 1a"]]);
  assert.deepEqual(at.structures.filter((s: { number?: string }) => s.number === "1a").map((s: { formula: string }) => s.formula), ["C10H22O3SSi"]);
}
{
  // One step too wide for the page. A long list of catalysts goes on three lines, so the arrow is short and the
  // reaction fits. A second product that does not fit goes on the next line and is still the reaction's product.
  // Where nothing can break, the reply says what did not fit and what to do.
  d = drawing("paper", "One step");
  const lines: Wrote = await call("draw", { kind: "reaction", start: [{ text: "benzene" }], steps: [{ catalysts: ["1 mol% [Ir(dF(CF3)ppy)2(dtbpy)]PF6", "5 mol% (R)-TRIP or (R)-TCYP", "10 mol% something else quite long here"], products: [{ text: "toluene" }] }] });
  assert.equal(lines.structuredContent.check, "clean");
  const pair: Wrote = await call("draw", { kind: "reaction", start: [{ text: "c1ccccc1NCCCCc1ccccc1", number: "1" }, { text: "COc1ccc(Br)cc1", number: "2" }], steps: [{ reagents: ["NiBr2·glyme"], products: [{ text: "COc1ccc(cc1)C(CCCc1ccccc1)Nc1ccccc1", number: "3a" }, { text: "COc1ccc(cc1)N(CCCCc1ccccc1)c1ccccc1", number: "3b" }] }] });
  assert.equal(pair.structuredContent.check, "clean");
  assert.ok(pair.structuredContent.boxes.s6[3] < pair.structuredContent.boxes.s5[1], "the second product is on the next line");
  const read2 = (await call("read", {})).structuredContent;
  assert.deepEqual([read2.reactions.map((r: { route: string }) => r.route), read2.text], [["s1 -> s2", "1 + 2 -> 3a + 3b"], undefined]);
  d = drawing("paper", "Nothing fits");
  const long: { content: { text: string }[] } = await call("draw", { kind: "reaction", start: [{ text: "CCCCCCCCCCCCCCCCCCCCCCCCO" }], steps: [{ products: [{ text: "CCCCCCCCCCCCCCCCCCCCCCCC=O" }] }] });
  assert.match(long.content[0].text, /^Drew the reaction\. Octet laid it out with Clean Up Reaction\. The scheme is [\d.]+ bond lengths wide \(the page is 41\.3\): give a larger page or landscape \(set_brief\), or a starting material in above\./);
  // On a drawing with no page there is no such advice.
  d = drawing("quick", "No page");
  assert.doesNotMatch((await call("draw", { kind: "reaction", start: [{ text: "CCCCCCCCCCCCCCCCCCCCCCCCO" }], steps: [{ products: [{ text: "CCCCCCCCCCCCCCCCCCCCCCCC=O" }] }] })).content[0].text, /the page is/);
}
{
  // A cycle's side text: clear of the intermediates (its arrow's end goes further out), and on the page (the cycle
  // moves across).
  d = drawing("paper", "Cycles");
  const ni: Wrote = await call("draw", { kind: "cycle", intermediates: [{ text: "*[Ni]Br", labels: ["L"], number: "A" }, { text: "*[Ni](Br)(Br)*", labels: ["L", "R"], number: "B" }, { text: "*[Ni](Br)*", labels: ["L", "R"], number: "C" }, { text: "*[Ni](Br)(*)C(*)N*", labels: ["L", "R", "Alkyl", "Ph"], number: "D" }],
    steps: [{ step: 0, in: "ArBr" }, { step: 1, in: "PC•−", out: "PC + Br−" }, { step: 2, in: "PhNHCH(•)Alkyl" }, { step: 3, out: "PhNHCH(Ar)Alkyl" }] });
  assert.equal(ni.structuredContent.check, "clean", JSON.stringify(ni.structuredContent.check));
  d = drawing("paper", "A long side text");
  const side: Wrote = await call("draw", { kind: "cycle", intermediates: [{ text: "C[CH]C" }, { text: "CC(C)C1C=C(C)c2ccccc2[NH+]1" }, { text: "CC(C)[C]1C=C(C)c2ccccc2N1" }], steps: [{ step: 2, out: "product·H+, PhI, RCO2−, CO2" }] });
  assert.equal(side.structuredContent.check, "clean", JSON.stringify(side.structuredContent.check));
  assert.doesNotMatch(ni.content[0].text + side.content[0].text, /side text|bond lengths wide/);
  // Side text too long for the page: the reply says so, and what to do.
  d = drawing("paper", "A side text too long");
  const long: Wrote & { content: { text: string }[] } = await call("draw", { kind: "cycle", intermediates: [{ text: "benzene" }, { text: "toluene" }, { text: "phenol" }], steps: [{ step: 0, in: Array.from({ length: 12 }, (_, k) => `reagent ${k + 1}`).join(" and ") }] });
  assert.match(long.content[0].text, /\. The cycle is [\d.]+ bond lengths wide \(the page has 35\.4\): give shorter side text, or a larger page or landscape \(set_brief\)\./, long.content[0].text);
}

// A scheme whose products are turned to lie as their starting materials (alkyl chains that come out upright) still
// reads as one reaction, so Clean Up Reaction wraps it to the page: the turn left gaps wider than a reaction's between
// them, and the row read as two (1 -> 2 -> 3 -> 4 -> 5 ->, then -> 7) and ran past the page.
{
  d = drawing("paper", "Turned products");
  const chains: Wrote = await call("draw_route", { schemes: [{ start: [{ text: "benzene", number: "1" }], steps: ["Cc1ccccc1", "CCc1ccccc1", "CCCc1ccccc1", "CCCCc1ccccc1", "CCCCCc1ccccc1", "CCCCCCc1ccccc1"].map((text, k) => ({ reagents: ["MeI"], products: [{ text, number: String(k + 2) }] })) }] });
  assert.equal(chains.structuredContent.check, "clean", JSON.stringify(chains.structuredContent.check));
  assert.deepEqual((await call("read", {})).structuredContent.reactions.map((r: { route: string }) => r.route), ["1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7"]);
}
// draw_route (plan 5.4) as the window lays it out.
{
  // Each title is free text over its scheme, at least as far from it as new work is from what is above (3 bond
  // lengths), so no arrow reads it as conditions (test plan L6), and the user's Clean Up Reaction after leaves it where
  // it is, free. The compound that ends scheme 1 starts scheme 2 with its one number and no warning (C9). All of it is
  // on the page, and the check is clean (L2).
  d = drawing("paper", "A route");
  const titles = ["Scheme 1. Benzyl bromide 3", "Scheme 2. The amine 5"];
  const two: Wrote = await call("draw_route", { schemes: [
    { title: titles[0], start: [{ text: "benzaldehyde", number: "1" }], steps: [{ reagents: ["NaBH4"], solvents: ["MeOH"], products: [{ text: "benzyl alcohol", number: "2" }] }, { reagents: ["PBr3"], products: [{ text: "benzyl bromide", number: "3" }] }] },
    { title: titles[1], start: [{ from: "3" }], steps: [{ reagents: ["NaCN"], solvents: ["DMF"], products: [{ changes: [{ swap: { Br: "CN" } }], number: "4" }] }, { reagents: ["LiAlH4"], products: [{ changes: [{ swap: { CN: "CH2NH2" } }], number: "5" }] }] },
  ] });
  assert.equal(two.structuredContent.check, "clean", JSON.stringify(two.structuredContent.check));
  const full = (await call("read", { detail: "full" })).structuredContent;
  assert.deepEqual([full.text.map((t: { text: string }) => t.text), full.warnings, full.structures.map((s: { number: string }) => s.number)], [titles, [], ["1", "2", "3", "3", "4", "5"]]);
  assert.deepEqual(full.reactions.map((x: { steps: { above: string[]; below: string[] }[] }) => x.steps.map((s) => [s.above, s.below])), [[[["NaBH4"], ["MeOH"]], [["PBr3"], []]], [[["NaCN"], ["DMF"]], [["LiAlH4"], []]]]);
  const box = (t: string) => full.captions.find((c: { text: string }) => c.text === t).box as number[], schemes: { box: number[] }[][] = [full.structures.slice(0, 3), full.structures.slice(3)];
  schemes.forEach((ss, k) => {
    const b = box(titles[k]), top = Math.max(...ss.map((s) => s.box[3])), line = full.arrows[2 * k].from[1];
    assert.ok(b[1] - top > 2.9 && b[1] - line > 3, `title ${k + 1} at ${b}: its scheme's top ${top}, its arrows ${line}`);
  });
  assert.ok(box(titles[1])[3] < Math.min(...schemes[0].map((s) => s.box[1])), "scheme 2's title is under scheme 1");
  // L5: compound 3 lies the same way in both schemes, and 4 and 5, its changes, lie as it does: their rings point the
  // same way (within 15 degrees) and are not turned over.
  const m = d.host.doc(), at = (number: string, k = 0) => m.captions!.filter((c) => c.bold && c.text === number)[k].under!.map((i) => m.atoms[i].location);
  const [a, b] = [at("3"), at("3", 1)];
  assert.ok(a.every((p, k) => Math.hypot(p[0] - a[0][0] - (b[k][0] - b[0][0]), p[1] - a[0][1] - (b[k][1] - b[0][1])) < 1e-6), "compound 3 is drawn the same in both schemes");
  const way = (ps: number[][]) => [Math.atan2(ps[4][1] - ps[1][1], ps[4][0] - ps[1][0]), Math.sign((ps[2][0] - ps[1][0]) * (ps[6][1] - ps[1][1]) - (ps[2][1] - ps[1][1]) * (ps[6][0] - ps[1][0]))];
  for (const n of ["4", "5"]) { const [t0, s0] = way(b), [t1, s1] = way(at(n)); assert.ok(Math.abs(Math.atan2(Math.sin(t1 - t0), Math.cos(t1 - t0))) < (15 * Math.PI) / 180 && s1 === s0, `compound ${n} lies as 3 does`); }
  // The user's Clean Up Reaction leaves each title where it was, free.
  assert.ok(!(await call("advanced", { tool: "run_command", args: { command: "clean_reaction" } })).isError);
  const again = (await call("read", { detail: "full" })).structuredContent;
  assert.deepEqual([again.text.map((t: { text: string }) => t.text), titles.map((t) => again.captions.find((c: { text: string }) => c.text === t).box)], [titles, titles.map(box)]);
}
{
  // Clean Up Reaction gives back the finished drawing (plan mcp-v2, 17.3): the reaction laid out and, at once, each
  // product turned to lie as its starting material. A product turned a quarter round lies as it was drawn again.
  d = drawing("paper", "Turn");
  assert.ok(!(await call("draw", { lines: "acetophenone (1) -> 1-phenylethanol (2), NaBH4" })).isError);
  const m = d.host.doc(), p = m.captions!.find((c) => c.bold && c.text === "2")!.under!.filter((i) => m.atoms[i].label !== "H");
  const shape = (x: typeof m) => p.map((i) => [0, 1].map((k) => x.atoms[i].location[k] - x.atoms[p[0]].location[k]));
  const c = [0, 1].map((k) => p.reduce((t, i) => t + m.atoms[i].location[k], 0) / p.length);
  d.host.set({ ...m, atoms: m.atoms.map((a, i) => (p.includes(i) ? { ...a, location: [c[0] - (a.location[1] - c[1]), c[1] + (a.location[0] - c[0]), a.location[2] ?? 0] } : a)) });
  assert.ok(!(await call("advanced", { tool: "run_command", args: { command: "clean_reaction" } })).isError);
  const was = shape(m), now = shape(d.host.doc());
  assert.ok(now.every((v, k) => Math.hypot(v[0] - was[k][0], v[1] - was[k][1]) < 0.05), "the product lies as its starting material again");
}
{
  // L4: each scheme wraps to the page in rows of as many steps as can be, none with its last product alone.
  d = drawing("paper", "Rows");
  const rows: Wrote = await call("draw_route", { schemes: [{ ...route(7), start: [{ text: biphenyl(GROUPS[6]), number: "7" }] }] }), levels: number[] = [];
  for (const id of rows.structuredContent.made.filter((x) => x[0] === "s")) { const b = rows.structuredContent.boxes[id], y = (b[1] + b[3]) / 2; levels.push(levels.find((v) => Math.abs(v - y) < 2) ?? y); }
  const per = [...new Set(levels)].map((y) => levels.filter((v) => v === y).length);
  assert.ok(per.length > 2 && per[per.length - 1] > 1 && Math.max(...per) - Math.min(...per) <= 1, `structures on each row: ${per}`);
  assert.equal(rows.structuredContent.check, "clean");
  // L2 and plan 3.2: a route taller than the page. The reply names the first scheme past its bottom and what to do, and
  // the check names what is off the page; nothing overlaps. On Quick start the same route just draws: no page, no
  // advice, and the check is clean.
  const four = { schemes: [0, 1, 2, 3].map((k) => { const r = route(1 + 6 * k); return { title: `Scheme ${k + 1}. Biphenyls`, start: k ? [{ from: String(1 + 6 * k) }] : r.start, steps: r.steps }; }) };
  d = drawing("paper", "A long route");
  const tall: Wrote & { content: { text: string }[] } = await call("draw_route", four), c = tall.structuredContent.check;
  assert.match(tall.content[0].text, /^Drew 4 schemes of 6, 6, 6 and 6 steps with 25 numbered compounds\. Octet laid out each with Clean Up Reaction\. Scheme \d runs past the bottom of the page: draw the schemes from \d on in a new drawing \(drawings new\), or give a larger page \(set_brief\)\. One undo step\./);
  assert.ok(c !== "clean" && c.off_page?.length && !c.overlaps, JSON.stringify(c));
  d = drawing("quick", "A long route on Quick start");
  assert.ok(!(await call("set_brief", { destination: { kind: "quick" } })).isError);
  const quick: Wrote & { content: { text: string }[] } = await call("draw_route", four);
  assert.match(quick.content[0].text, /^Drew 4 schemes of 6, 6, 6 and 6 steps with 25 numbered compounds\. Octet laid out each with Clean Up Reaction\. One undo step\./);
  assert.equal(quick.structuredContent.check, "clean");
  assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);
}
{
  // legend: letters, as a paper sets it (test plan S8): a, b, c on the arrows, and the conditions in a note under the
  // scheme that no arrow reads as its own.
  d = drawing("paper", "Letters");
  const lettered: Wrote = await call("draw_route", { legend: "letters", schemes: [{ title: "Scheme 1. 2-Phenylethylamine 3", ...SCHEME }] });
  assert.equal(lettered.structuredContent.check, "clean", JSON.stringify(lettered.structuredContent.check));
  const read = (await call("read", { detail: "full" })).structuredContent;
  assert.deepEqual(read.reactions.map((x: { steps: { above: string[]; below: string[] }[] }) => x.steps.map((s) => [s.above, s.below])), [[[["a"], []], [["b"], []], [["c"], []]]]);
  const note = read.captions.find((x: { text: string }) => x.text.startsWith("Reagents"));
  assert.equal(note.text, "Reagents and conditions: (a) MeNO2, NH4OAc, AcOH, reflux, 4 h, 78%; (b) LiAlH4, THF, 0 °C to reflux, 85%; (c) Ac2O, Et3N, CH2Cl2, rt, 92%.");
  assert.ok(note.box[3] < Math.min(...read.structures.map((s: { box: number[] }) => s.box[1])) && read.text.some((x: { text: string }) => x.text === note.text), "the note is free text under the scheme");
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

  // The evals' cost report (scripts/mcp-evals/cost.mjs): one reply of the model logged as two lines counts once, and a
  // copy of it (api-request-blob) adds nothing. A job run twice takes its judge lines in the order its logs start (the
  // later log's file comes first here); a total of what no row has is "-".
  const reply = (at: string, content: object[], id = "m1") => JSON.stringify({ timestamp: at, message: { role: "assistant", id, model: "any", content, usage: { output_tokens: 300, output_tokens_details: { thinking_tokens: 100 } } } });
  const use = (job: string) => [{ type: "tool_use", id: `u${job}`, input: { command: `node call.mjs ${job} change '{}'` } }];
  mkdirSync(join(dir, "logs"));
  writeFileSync(join(dir, "logs", "agent-1.jsonl"), [reply("2026-11-11T10:00:00Z", [{ type: "thinking" }]), reply("2026-11-11T10:00:20Z", use("say-fix")), JSON.stringify({ type: "api-request-blob", message: { role: "assistant", content: use("say-fix") } })].join("\n"));
  writeFileSync(join(dir, "logs", "agent-0.jsonl"), reply("2026-11-11T11:00:00Z", use("say-fix"), "m2"));
  writeFileSync(join(dir, "judged.jsonl"), [{ job: "say-fix", pass: true, calls: 1, refused: 0, sent: 2, read: 40 }, { job: "say-fix", pass: false, calls: 3, refused: 1, sent: 9, read: 90 }].map((j) => JSON.stringify(j)).join("\n"));
  const costOf = (judged: string) => spawnSync(process.execPath, [new URL("../scripts/mcp-evals/cost.mjs", import.meta.url).pathname, join(dir, "logs"), judged], { encoding: "utf8" });
  const cost = costOf(join(dir, "judged.jsonl"));
  assert.match(cost.stdout, /\| say-fix \| yes \| 1 \| 1 \| 0 \| 0 \| 300 \| 100 \| 2 \| 40 \| 20 \|/, cost.stdout + cost.stderr);
  assert.match(cost.stdout, /\| say-fix #2 \| NO \| 1 \| 3 \| 1 \| 0 \| 300 \| 100 \| 9 \| 90 \| 0 \|/, cost.stdout);
  writeFileSync(join(dir, "none.jsonl"), "");
  assert.match(costOf(join(dir, "none.jsonl")).stdout, /\| Total \(2\) \| 0 \| 2 \| 2 \| - \| 0 \| 600 \| 200 \| - \| - \| 20 \|/);

  // The MCP server for evals (scripts/mcp-evals/headless.ts), with the evals' client in a process of its own (here,
  // fetch reaches no network): two AI apps at once, each in a drawing of its own with its own ids and its own brief (b
  // gives one and draws two structures; a, with none, is asked for it); a picture asked for
  // is said to be missing, and only then; a wrong key, a protocol version the app refuses, and a session after DELETE,
  // are refused. A DELETE during a call answers it, on its event stream when it has one, so no call waits for ever.
  const env = { ...process.env, OCTET_MCP_INFO: join(dir, "mcp.json") };
  const server = spawn(process.execPath, [new URL("../scripts/mcp-evals/headless.ts", import.meta.url).pathname], { env, stdio: "ignore" });
  try {
    const client = `import { connect } from ${JSON.stringify(new URL("../scripts/mcp-evals/octet.mjs", import.meta.url).href)};
      const [a, b] = await Promise.all([connect("a"), connect("b")]);
      const briefed = [!!(await b.call("set_brief", { destination: { kind: "paper" } })).isError, !!(await a.call("draw", { kind: "structures", structures: [{ text: "benzene" }, { text: "toluene" }] })).isError];
      await Promise.all([a.call("draw", { kind: "structures", structures: [{ text: "benzene", number: "1" }] }), b.call("draw", { kind: "structures", structures: [{ text: "toluene", number: "1" }, { text: "phenol", number: "2" }] })]);
      const picture = (await a.call("read", { picture: true })).content.map((c) => c.text?.startsWith("No picture") ? "none" : c.type);
      const [da, db] = await Promise.all([a.read(), b.read()]);
      const { port, token } = JSON.parse((await import("node:fs")).readFileSync(process.env.OCTET_MCP_INFO, "utf8")), url = "http://127.0.0.1:" + port + "/mcp";
      const wrong = (await fetch(url, { method: "POST", headers: { authorization: "Bearer " + token.replace(/./, "x"), "content-type": "application/json" }, body: "{}" })).status;
      const ended = (await fetch(url, { method: "DELETE", headers: { authorization: "Bearer " + token, "mcp-session-id": a.session } })).status;
      const small = (await b.call("read", { picture_size: "small" })).content.length;
      const version = (await fetch(url, { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json", "mcp-protocol-version": "1999-01-01" }, body: "{}" })).status;
      const c = await connect("c"), head = { authorization: "Bearer " + token, "content-type": "application/json", "mcp-session-id": c.session };
      const slow = (id, _meta) => fetch(url, { method: "POST", headers: head, signal: AbortSignal.timeout(10_000), body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "draw", arguments: { kind: "structures", structures: [{ text: "2-phenylethylamine" }] }, _meta } }) }).then((r) => r.text(), () => "no answer");
      const calls = Promise.all([slow(1), slow(2, { progressToken: 1 })]);
      await new Promise((r) => setTimeout(r, 20));
      await fetch(url, { method: "DELETE", headers: head });
      const stopped = (await calls).map((t) => /Octet stopped/.test(t) ? (t.startsWith("event:") ? "stream" : "json") : t.slice(0, 80));
      console.log(JSON.stringify({ briefed, a: da.structures.map((s) => [s.id, s.formula]), b: db.structures.map((s) => [s.id, s.formula]), picture, wrong, ended, after: (await a.call("read", {})).isError, small, version, stopped }));`;
    const out = spawnSync(process.execPath, ["--input-type=module", "-e", client], { env, encoding: "utf8", timeout: 60_000 });
    assert.equal(out.status, 0, out.stderr);
    assert.deepEqual(JSON.parse(out.stdout), { briefed: [false, true], a: [["s1", "C6H6"]], b: [["s1", "C7H8"], ["s2", "C6H6O"]], picture: ["text", "none"], wrong: 401, ended: 200, after: true, small: 1, version: 400, stopped: ["json", "stream"] });
  } finally { server.kill(); }
} finally { rmSync(dir, { recursive: true, force: true }); }

// The speed jobs' checks (scripts/mcp-evals/speed.mjs) take each answer the prompt allows: a salt drawn as its cation
// with the tosylate beside it (and not without it), the scope's bridged amines with no stereo (their names give none),
// and the count of stereocentres only where it is said of them.
{
  const { SPEED } = await import(new URL("../scripts/mcp-evals/speed.mjs", import.meta.url).href);
  const key = (s: string) => toInchiKey(parseStructure(s)), loose = (s: string) => key(s).split("-")[0];
  const failed = async (job: string, answer = "") => SPEED.find((j: { id: string }) => j.id === job).check({ d: (await call("read", { detail: "full" })).structuredContent, answer, key, loose }).filter(([ok]: [boolean]) => !ok).map(([, what]: [boolean, string]) => what);
  // Each job's setup runs in a new session, with no brief yet, and none of its calls is refused: a setup that draws a
  // scheme or more than one structure gives its brief first.
  for (const j of SPEED.filter((j: { setup?: unknown }) => j.setup)) {
    d = drawing("paper", j.id);
    for (const [tool, args] of j.setup) assert.ok(!JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }), () => d.host, "1", session("Check", `setup ${j.id}`))).result.isError, `${j.id}: ${tool}`);
  }
  const TS = "Cc1ccc(cc1)S(=O)(=O)[O-]", salt = (tosylate: boolean) => ({ kind: "reaction", start: [{ text: "piribedil" }, { text: "Cc1ccc(cc1)S(=O)(=O)OCCC=C", number: "11a" }], steps: [
    { products: [{ text: "C=CCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1", number: "12a" }, ...(tosylate ? [{ text: TS }] : [])] },
    { reagents: ["9-BBN–H"], products: [{ text: "C1CC2CCCC(C1)B2CCCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1", number: "13a" }, ...(tosylate ? [{ text: TS }] : [])] },
    { reagents: ["SPhos·Pd-G3", "t-BuOK"], yield: "47%", products: [{ text: "c1cnc(nc1)N1CCN(CCCCCc2ccc3OCOc3c2)CC1", number: "14a" }] }] });
  for (const tosylate of [true, false]) {
    d = drawing("paper", "A salt as two structures");
    assert.ok(!(await call("draw", salt(tosylate))).isError);
    assert.deepEqual(await failed("paper-three-step"), tosylate ? [] : ["a tosylate with each salt drawn as its cation"]);
  }
  // The models' own lines for the three-step jobs (round 3b, where 10 of 12 tries lost 11a): Haiku's start line with a
  // + and no arrow (read as one salt 11a), and Opus's and Haiku's 11a among the first step's conditions (drawn as text).
  // Each draws 11a as a starting material in one call, check clean, and meets the judge's checks.
  const H = `piribedil + but-3-en-1-yl tosylate (11a)
-> C=CCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.Cc1ccc(cc1)S(=O)(=O)[O-] (12a)
-> c1cnc(nc1)N1CC[N+](CCCCB2C3CCCC2CCC3)(Cc2ccc3OCOc3c2)CC1.Cc1ccc(cc1)S(=O)(=O)[O-] (13a), 9-BBN–H
-> c1cnc(nc1)N1CCN(CCCCCc2ccc3OCOc3c2)CC1 (14a), SPhos·Pd-G3, t-BuOK, 47%`, O = H.replace(" + but-3-en-1-yl tosylate (11a)", "").replace("[O-] (12a)", "[O-] (12a), Cc1ccc(cc1)S(=O)(=O)OCCC=C (11a)");
  for (const l of [H, O, O.replace("Cc1ccc(cc1)S(=O)(=O)OCCC=C", "but-3-en-1-yl tosylate")]) {
    d = drawing("paper", "Round 3c");
    const r = (await call("draw", { lines: l, brief: "quick" })).structuredContent;
    assert.ok(r.check === "clean" && r.compounds.length === 5 && r.compounds.some((c: string) => /^11a s\d+ C11H14O3S\b/.test(c)), JSON.stringify(r));
    assert.deepEqual(await failed("paper-three-step"), [], l);
  }
  d = drawing("paper", "A scope from names");
  const R = "CCCC(CC(c1ccccc1)c1ccccc1)";
  const scope = { "7a": "N1CCC(CC1)c1ccccc1", "7b": "N1CCC(CC1)C(F)(F)F", "7c": "N1CCN(CC1)C(=O)OC(C)(C)C", "7d": "N1C[C@@H](C)O[C@@H](C)C1", "7e": "N1C[C@H]2C[C@H]2C1", "7f": "N1CC2CC(C1)c1ccccc12", "7g": "N1C2CCC1CC(=O)C2", "7h": "N1CC(OC)C1", "7i": "N(CC)C1CCCCC1", "7j": "N(C)CCOC", "7k": "N(C)C" };
  assert.ok(!(await call("draw", { kind: "structures", structures: [...Object.entries(scope).map(([n, s]) => ({ text: R + s, number: n })), { text: "CC1(C)CCCC(C)(C)N1CC[C@@H]1N(C(=O)OCc2ccccc2)[C@H](C(C)(C)C)OC1=O", number: "7l" }] })).isError);
  assert.deepEqual((await failed("paper-scope")).filter((w: string) => w.startsWith("compound")), []);
  const asked = (answer: string) => SPEED.find((j: { id: string }) => j.id === "say-question").check({ d: { structures: [1, 2] }, answer })[1][0];
  assert.deepEqual(["C31H46O10Si, with 8 stereocentres.", "Stereocentres: eight.", "C31H46O10Si; 9 stereocentres (8 defined).", "C31H46O10Si (MW 8 hundred), 9 stereocentres."].map(asked), [true, true, false, false]);
}

// Octet clears what its own check would name after a draw (plan 19, round 3): the taxol schemes of say-two-schemes
// (15 and 16 laid out with labels on each other: s3.22 on s3.27, s4.22 on s4.27, s5.22 on s5.30), a structure turned
// by a hint (kept turned), and the Hajos–Parrish cycle whose title met intermediate 2, each check clean in one call.
{
  const T = JSON.parse(readFileSync(new URL("../scripts/mcp-bench/taxol/structures.json", import.meta.url), "utf8"));
  const { bestTurn } = await import("./interpret.ts");
  const lines = async (text: string, page = "paper") => { d = drawing(page, "Round 3"); return (await call("draw", { lines: text, brief: "quick" })).structuredContent; };
  const two = await lines(`# Scheme 1. The C2 alcohol 15\n${T[13]} (13) -> ${T[14]} (14), a) Ac2O, DMAP; b) TPAP, NMO; 95%, 93%\n-> ${T[15]} (15), c) BH3·THF, then H2O2; d) HCl, MeOH; 55%, 80%\n\n# Scheme 2. The TES ether 17\n15 -> ${T[16]} (16), Ac2O, DMAP, CH2Cl2, 95%\n-> ${T[17]} (17), f) H2, Pd(OH)2/C; g) TESCl, pyridine; h) K2CO3, MeOH; 97%, 85%, 95%`);
  assert.equal(two.check, "clean", JSON.stringify(two.check));
  assert.ok(!/clean_up|Clean Up/.test(two.done), two.done);
  // Opus's own SMILES for paper-five-step (round 3b): Clean Up clears s4.27 from s4.30 of the triol 5, and turning s4
  // back by 29 degrees put them on each other again, so s4 lies as Clean Up left it.
  const five = await lines(`CCOC(=O)[C@@]3([C@H](C=C[C@]([C@H]3CO%10)(C%10=O)O)O)C (2) -> OC[C@@]3([C@H](C=C[C@]([C@H]3CO%10)(C%10=O)O[Si](C)(C)C(C)(C)C)O[Si](C)(C)C(C)(C)C)C (3), a) TBSOTf, 2,6-lutidine, 95%; b) LiAlH4, Et2O, 0 °C, 94%
-> CC(C)(C)[Si](c7ccccc7)(c8ccccc8)OC[C@@]3([C@H](C=C[C@]([C@H]3CO%10)(C%10=O)O[Si](C)(C)C(C)(C)C)OCc9ccccc9)C (4), c) CSA, MeOH, 90%; then TBDPSCl, imidazole, DMF, 92%; d) KH, BnBr, n-Bu4NI, 87%
-> CC(C)(C)[Si](c7ccccc7)(c8ccccc8)OC[C@@]3([C@H](C=C[C@]([C@H]3CO)(CO)O)OCc9ccccc9)C (5), LiAlH4, Et2O, 25 °C, 80%
-> CC(C)(C)[Si](c7ccccc7)(c8ccccc8)OC[C@@]3([C@H](C=C[C@]([C@H]3CO)(CO%11)OC%11(C)C)OCc9ccccc9)C (6), Me2C(OMe)2, CSA, CH2Cl2, 82%
-> CC(C)(C)[Si](c7ccccc7)(c8ccccc8)OC[C@@]3([C@H](C=C[C@]([C@H]3C=O)(CO%11)OC%11(C)C)OCc9ccccc9)C (7), TPAP, NMO, MeCN, 95%`);
  assert.equal(five.check, "clean", JSON.stringify(five.check));
  // Haiku's say-cycle line (round 3b), with +triketone before its first arrow: -ketol after 4 leaves at 4→1. Every
  // property read gives a cycle's text can be set: Haiku's own edit of the side text (at and side, words read gives),
  // and a step name's step, by the intermediates' numbers.
  const said = await lines(String.raw`OC(=O)[C@@H]1CCCN1 (1), +triketone -> C/C(CCC1(C)C(=O)CCC1=O)=[N+]1\CCC[C@H]1C([O-])=O (2) -> OC(=O)[C@@H]1CCCN1C(=C)CCC1(C)C(=O)CCC1=O (3) -> C[C@]12CC/C(=[N+]3/CCC[C@H]3C([O-])=O)C[C@@]1(O)CCC2=O (4), -ketol, isomerise -> 1`);
  assert.match(said.done, /in: triketone at 1→2; out: ketol at 4→1\./);
  const sides = async () => { const c = (await call("read", {})).structuredContent.cycles[0]; return [...c.sides, ...c.names].map((x: { id: string; at: string; side?: string }) => `${x.id} ${x.at} ${x.side ?? "name"}`); };
  assert.deepEqual(await sides(), ["t6 1→2 in", "t7 4→1 out", "t8 4→1 name"]);
  const moved3 = await call("change", { operations: [{ op: "edit", ids: ["t7"], at: "3->4" }, { op: "edit", ids: ["t8"], at: "2→3" }] });
  assert.ok(!moved3.isError, moved3.content[0].text);
  assert.deepEqual(await sides(), ["t6 1→2 in", "t7 3→4 out", "t8 2→3 name"]);
  assert.ok(!(await call("change", { operations: [{ op: "edit", ids: ["t7"], at: "4→1", side: "out" }] })).isError);
  assert.deepEqual(await sides(), ["t6 1→2 in", "t7 4→1 out", "t8 2→3 name"]);
  assert.equal(d.host.doc().cycles![0].branches!.length, 2);
  assert.match((await call("change", { operations: [{ op: "edit", ids: ["t6"], side: "out" }] })).structuredContent.check, /clean/);
  assert.deepEqual(await sides(), ["t6 1→2 out", "t7 4→1 out", "t8 2→3 name"]);
  assert.match((await call("change", { operations: [{ op: "edit", ids: ["t6"], at: "5→1" }] })).content[0].text, /t6's cycle has no step 5→1: its steps are 1→2, 2→3, 3→4, 4→1\./);
  assert.match((await call("change", { operations: [{ op: "edit", ids: ["t8"], side: "in" }] })).content[0].text, /t8 is a cycle's step name: it takes no side\./);
  // Side text moved to a step that has that end already joins the text there, as draw writes two at one step (a second
  // side arrow on the first gave an overlap that no tool could fix).
  assert.equal((await call("change", { operations: [{ op: "edit", ids: ["t6"], at: "4→1" }] })).structuredContent.check, "clean");
  assert.deepEqual(await sides(), ["t7 4→1 out", "t8 2→3 name"]);
  assert.deepEqual([d.host.doc().captions!.find((x) => x.id === 7)!.text, d.host.doc().cycles![0].branches!.length], ["ketol, triketone", 1]);
  // With no page (brief quick), a figure wider than A4 says nothing of a page (Haiku told the user it needed a larger
  // page before export).
  d = drawing("paper", "No page");
  const row = (k: number) => Array.from({ length: 6 }, (_, i) => `CCCCCCCCCCCC${"C".repeat(i)}c1ccc(cc1)C(=O)N1CCCCC1 (${k}${"abcdef"[i]}) 5${i}%`).join(" | ");
  const wide = await call("draw", { brief: "quick", lines: `# Products\n${row(7)}\n${row(8)}` });
  assert.match(wide.content[0].text, /figure of 1 panel and 12 structures/);
  assert.doesNotMatch(wide.content[0].text, /page (?:allows|is)|larger page/, wide.content[0].text);
  const turned = async (rotate: number) => { d = drawing("paper", "Turned"); const r = (await call("draw", { kind: "structures", structures: [{ text: T[1], rotate }], brief: "quick" })).structuredContent; return [r.check, d.host.doc().atoms.map((a) => [a.location[0], a.location[1]] as [number, number])] as const; };
  const [flat, a0] = await turned(0), [check, a60] = await turned(60);
  assert.equal(flat, "clean");
  assert.equal(check, "clean", JSON.stringify(check));
  assert.ok(Math.abs((bestTurn(a0, a60).t * 180) / Math.PI - 60) < 5, `turned by ${(bestTurn(a0, a60).t * 180) / Math.PI}`);
  const cycle = await lines("# Hajos–Parrish proline cycle\nOC(=O)[C@@H]1CCCN1 (1) -> CC(=[N+]1CCC[C@H]1C(=O)[O-])CCC1(C)C(=O)CCC1=O (2), +triketone, -H2O -> C=C(CCC1(C)C(=O)CCC1=O)N1CCC[C@H]1C(=O)O (3), tautomerisation -> CC12C(=O)CCC1(O)CC(=[N+]3CCC[C@H]3C(=O)[O-])CC2 (4), intramolecular aldol -> 1, +H2O, -ketol");
  assert.equal(cycle.check, "clean", JSON.stringify(cycle.check));
  // A cycle's centre text cannot be moved: where check finds it on something, the refusal names the call that gives it
  // room (and that call does); where it is clear, the refusal says no more than that.
  const mid = d.host.doc().captions!.find((c) => c.cycle?.side === "centre")!, c5 = `c${mid.cycle!.cycle}`, nudge = async () => (await call("change", { operations: [{ op: "move", ids: [`t${mid.id}`], dx: 1, dy: 0 }] })).content[0].text;
  assert.doesNotMatch(await nudge(), /run_command/);
  const doc = d.host.doc();
  d.host.set({ ...doc, captions: doc.captions!.map((c) => (c.id === mid.id ? { ...c, text: `${c.text}, ${c.text}, ${c.text}` } : c)) });
  assert.match(await nudge(), new RegExp(`run_command clean_up on ${c5}\\.`));
  assert.equal((await call("advanced", { tool: "run_command", args: { command: "clean_up", ids: [c5] } })).structuredContent.check, "clean");
  // Long step names on a cycle of three, with side arrows (each name then goes inside): each is placed clear of the
  // rest, as the window places it.
  d = drawing("paper", "Names");
  const named = (await call("draw", { brief: "quick", lines: "# Suzuki cycle\n[Pd] (1) -> Br[Pd]c1ccccc1 (2), oxidative addition of the aryl bromide, +PhBr -> c1ccc(cc1)[Pd]c1ccccc1 (3), transmetalation with the boronic acid, +ArB(OH)2 -> 1, reductive elimination of the biaryl product, -Ph–Ar" })).structuredContent;
  assert.equal(named.check, "clean", JSON.stringify(named.check));
  // Only a structure the call made is cleared: the user's own, with its labels on each other, only moves (in two steps,
  // a batch, as in one).
  d = drawing("paper", "Moved");
  await call("draw", { kind: "structures", structures: [{ text: "OCCCCO" }], brief: "quick" });
  const own = d.host.doc(), O = own.atoms.findIndex((a, i) => i && a.label === "O");
  d.host.set({ ...own, atoms: own.atoms.map((a, i) => (i === O ? { ...a, location: [own.atoms[0].location[0] + 0.2, own.atoms[0].location[1], 0] } : a)) });
  const was = d.host.doc().atoms.map((a) => a.location), moved = await call("change", { operations: [{ op: "move", ids: ["s1"], dx: 0.5 }, { op: "move", ids: ["s1"], dx: 0.5 }] });
  assert.ok(moved.structuredContent.check.labels_overlap, JSON.stringify(moved.structuredContent));
  assert.ok(d.host.doc().atoms.every((a, i) => Math.abs(a.location[0] - was[i][0] - 1) < 1e-6 && Math.abs(a.location[1] - was[i][1]) < 1e-6), "only moved");
}

// Plan 3.1, 7.3: an AI app that takes elicitation, through the Node host. A scheme with no brief asks the user (the
// answer the host was given), and the same call draws it, in a thesis's style, and the session keeps the brief.
{
  const e = drawing("quick", "Asked"), forms: object[] = [];
  const draw = async () => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "draw", arguments: { lines: "benzaldehyde -> benzyl alcohol" } } }), () => e.host, "1", session("Check", "asked", async (p) => { forms.push(p); return JSON.stringify({ action: "accept", content: { destination: "thesis" } }); }))).result;
  const r = await draw();
  assert.ok(!r.isError && /^Brief kept: /.test(r.content[0].text), r.content[0].text);
  assert.deepEqual([forms.length, e.host.doc().arrows?.length, e.host.style().purpose], [1, 1, "thesis"]);
  assert.ok(!(await draw()).isError && forms.length === 1, "the session keeps the brief");
}

// The scripting page's examples (docs/scripting.md, plan 18.2) as they are, against Octet with no window on standard
// input and output (scripts/headless/stdio.ts), so an argument of a tool that changes breaks this and not a user's
// script: two schemes made here are renumbered across both, restyled for a journal and checked (with a file that is not
// a drawing, and a drawing whose warning names no atom), and a table of SMILES gives a drawing a row (a row Octet cannot
// read is named, and the rows after it are drawn). The Python examples, where there is a Python, run at the same time
// and give the same lines and the same files.
{
  const tmp = mkdtempSync(join(tmpdir(), "octet-examples-")), at = (...p: string[]) => join(tmp, ...p), csv = at("table.csv");
  const env = { ...process.env, OCTET: new URL("../scripts/headless/stdio.ts", import.meta.url).pathname }, run = promisify(execFile);
  try {
    mkdirSync(at("in"));
    for (const [name, lines] of [["scheme1", "benzaldehyde (7)\n-> [O-][N+](=O)/C=C/c1ccccc1 (3), MeNO2, NH4OAc\n-> 2-phenylethylamine (9), LiAlH4, THF"], ["scheme2", "2-phenylethylamine (9)\n-> N-(2-phenylethyl)acetamide (4), Ac2O, Et3N"]]) {
      d = drawing("paper", name);
      assert.ok(!(await call("draw", { lines })).isError);
      writeFileSync(at("in", `${name}.cdxml`), (await call("read", { format: "cdxml" })).structuredContent.text);
    }
    d = drawing("paper", "five");
    assert.ok(!(await call("draw", { structures: [{ text: "benzene", number: "5" }, { text: "toluene", number: "5" }] })).isError);
    writeFileSync(at("five.cdxml"), (await call("read", { format: "cdxml" })).structuredContent.text);
    writeFileSync(csv, 'number,name,smiles\n1,benzene,c1ccccc1\n2,"2,4-dinitrophenol",Oc1ccc(cc1[N+](=O)[O-])[N+](=O)[O-]\n3,broken,C1CC(\n4,ethanol,CCO\n');
    // Each example in turn, in one language: what it printed, and its exit code.
    const examples = async (exe: string, x: string) => {
      const out: string[] = [], ex = async (name: string, ...args: string[]) => { try { out.push((await run(exe, [new URL(`../scripts/examples/${name}.${x}`, import.meta.url).pathname, ...args], { env })).stdout); } catch (e: any) { out.push(`${e.stdout}${e.stderr}exit ${e.code}`); } };
      await ex("renumber", at(x, "renumbered"), at("in", "scheme1.cdxml"), at("in", "scheme2.cdxml"));
      await ex("restyle", "Angewandte", "1", at("in"), at(x, "restyled"));
      await ex("table", csv, at(x, "table"), "cdxml");
      await ex("check", at("in", "scheme1.cdxml"), at(x, "renumbered", "scheme2.cdxml"), at("five.cdxml"), csv);
      return out;
    };
    const python = spawnSync("python3", ["--version"]).status === 0, [js, py] = await Promise.all([examples(process.execPath, "mjs"), python ? examples("python3", "py") : undefined]);
    assert.deepEqual(js, [
      "scheme1.cdxml: 7 is 1, 3 is 2, 9 is 3\nscheme2.cdxml: 9 is 3, 4 is 4\n", "scheme1.cdxml: Wiley (Angewandte)\nscheme2.cdxml: Wiley (Angewandte)\n", "1.cdxml: benzene\n2.cdxml: 2,4-dinitrophenol\n3: Octet drew nothing. Octet cannot read \"C1CC(\": give a SMILES instead (with * for a generic group such as L or R, and its labels).\n4.cdxml: ethanol\nexit 1",
      "scheme1.cdxml: clean\nscheme2.cdxml: clean\nfive.cdxml: 1 to look at\n  Compound number 5 is on more than one structure.\ntable.csv: Octet cannot read the structures in this file.\n2 to look at.\nexit 1",
    ]);
    const numbers = (file: string) => (fromCdxml(readFileSync(at("mjs", ...file.split("/")), "utf8")).mol.captions ?? []).filter((c: { bold?: boolean }) => c.bold).map((c: { text: string }) => c.text);
    assert.deepEqual([numbers("renumbered/scheme1.cdxml"), numbers("renumbered/scheme2.cdxml"), numbers("table/2.cdxml"), numbers("table/4.cdxml")], [["1", "2", "3"], ["3", "4"], ["2"], ["4"]]);
    assert.ok(/<CDXML[^>]*BondLength="17"/.test(readFileSync(at("mjs", "restyled", "scheme1.cdxml"), "utf8")), "Angewandte's bonds");
    if (py) {
      assert.deepEqual(py, js);
      for (const f of ["renumbered/scheme1.cdxml", "renumbered/scheme2.cdxml", "restyled/scheme1.cdxml", "table/1.cdxml", "table/2.cdxml", "table/4.cdxml"]) assert.equal(readFileSync(at("py", ...f.split("/")), "utf8"), readFileSync(at("mjs", ...f.split("/")), "utf8"), f);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
console.log("headless.check: ok");
