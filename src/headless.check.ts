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
const { toSmiles } = await import("./chem.ts");
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

const t = performance.now(), drew = await call("draw_reaction", SCHEME);
assert.ok(!drew.isError, drew.content[0].text);
assert.ok(performance.now() - t < 5000, "a scheme draws in seconds");
const read = (await call("read_drawing", { detail: "full" })).structuredContent;
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
assert.ok(!(await call("run_command", { command: "undo" })).isError);
assert.equal(d.host.doc().atoms.length, 0);
assert.ok(!(await call("run_command", { command: "redo" })).isError);
assert.equal(fragments(d.host.doc()).length, 4);

// The CDXML reads back as the same scheme: four structures, three arrows, their conditions, the numbers.
const file = await call("get_file", { format: "cdxml" }), back = fromCdxml(file.structuredContent.text).mol;
assert.deepEqual(fragments(back).map((g) => toSmiles(extractSelection(back, new Set(g), new Set()))).sort(),
  read.structures.map((s: { smiles: string }) => s.smiles).sort());
assert.equal(back.arrows?.length, 3);
assert.deepEqual((back.captions ?? []).filter((c) => c.bold).map((c) => c.text).sort(), ["1", "2", "3", "4"]);
const box2 = (atoms: number[]) => { const ps = atoms.map((i) => back.atoms[i].location); return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))] as [number, number, number, number]; };
assert.deepEqual(findReaction(back, back.arrows![0].id, back.arrows!, box2, () => undefined)?.arrows.length, 3, "one reaction of three steps in the file");

// The same calls on a new drawing give the same ids, reading and CDXML.
d = drawing("paper", "SI scheme");
await call("draw_reaction", SCHEME);
assert.deepEqual((await call("read_drawing", { detail: "full" })).structuredContent, read, "the same reading");
assert.equal((await call("get_file", { format: "cdxml" })).structuredContent.text, file.structuredContent.text, "the same CDXML");

// A name Octet cannot read draws nothing, and says so.
const bad = await call("draw_reaction", { start: [{ text: "benzaldehyde" }], steps: [{ products: [{ text: "flurbleglorp" }] }] });
assert.ok(bad.isError && /flurbleglorp/.test(bad.content[0].text));

// A caption under a compound, much wider than it ("2 (…)" as a number is number 2 with that caption). Clean Up
// Reaction gives the caption room, and the scheme still reads back as one route, with the caption on its compound;
// the CDXML's scheme has both steps whole.
d = drawing("paper", "Caption");
const wide = await call("draw_reaction", { start: [{ text: "benzene", number: "1" }], steps: [{ reagents: ["Br2"], products: [{ text: "bromobenzene", number: "2 (not isolated, used crude in the next step)" }] }, { reagents: ["Mg"], products: [{ text: "CCN", number: "3" }] }] });
assert.equal(wide.structuredContent.check, "clean");
const summed = (await call("read_drawing", {})).structuredContent;
assert.deepEqual(summed.reactions.map((r: { route: string }) => r.route), ["1 -> 2 -> 3"]);
assert.deepEqual([summed.structures[1].number, summed.structures[1].caption, summed.text], ["2", "not isolated, used crude in the next step", undefined]);
const stepsOut: string[] = (await call("get_file", { format: "cdxml" })).structuredContent.text.match(/<step[^>]*>/g) ?? [];
assert.ok(stepsOut.length === 2 && stepsOut.every((x) => /ReactionStepReactants/.test(x) && /ReactionStepProducts/.test(x)), stepsOut.join(" "));

// A grid of structures with captions of two lines, and with a caption wider than its structure: each cell has room
// for the text under its structure, so nothing overlaps.
for (const caption of ["85%, 92% ee\nwhite solid", "a rather long caption here"]) {
  d = drawing("paper", "Grid");
  const grid = await call("draw_structures", { structures: ["benzene", "toluene", "phenol", "aniline", "pyridine", "water"].map((text, k) => ({ text, number: `${k + 1}`, caption })), columns: 3 });
  assert.equal(grid.structuredContent.check, "clean", JSON.stringify(grid.structuredContent.check));
}

// Atoms, arrows and shapes by id: a charge, a curved arrow from a lone pair, brackets with a mark.
d = drawing("paper", "Ids");
await call("draw_structures", { structures: [{ text: "acetone" }] });
for (const [name, args] of [["edit", { ids: ["s1.2"], charge: 1 }], ["add_arrow", { kind: "curved", from: "s1.4:pair", to: "s1.2-4" }], ["add_shape", { kind: "brackets", around: ["s1"], mark: "‡" }]] as const)
  assert.ok(!(await call(name, args)).isError, name);
const ids = (await call("read_drawing", { atoms: true, detail: "full" })).structuredContent;
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
  const { left, top } = margins(), one: Wrote = await call("draw_reaction", route(1)), b1 = span(one);
  assert.ok(fits(one), JSON.stringify(one.structuredContent.check));
  assert.ok(Math.abs(b1[3] - top) < 0.11, `the first scheme starts at the top margin: ${b1[3]}, ${top}`);
  assert.ok(Math.abs(b1[0] - left) < 0.11 || Math.abs(b1[0] + b1[2]) < 0.11, `at the left margin, or in the middle of the page when it is wider than the margins: ${b1}`);
  const two: Wrote = await call("draw_reaction", { ...route(8), detail: "full" }), b2 = span(two);
  assert.ok(fits(two), JSON.stringify(two.structuredContent.check));
  assert.deepEqual(two.structuredContent.changed, [], "the first scheme is as it was");
  assert.ok(Math.abs(b1[1] - 3 - b2[3]) < 0.21, `the second scheme starts 3 bond lengths under the first: ${b2[3]}, ${b1[1]}`);
  const both = (await call("read_drawing", { detail: "full" })).structuredContent;
  assert.deepEqual(both.reactions.map((r: { steps: unknown[] }) => r.steps.length), [6, 6], "two reactions of six steps");
}
{
  // Free text under a structure (a scheme's title) stays free text where it is when the next scheme is drawn: it is
  // not read as conditions on the new scheme's first arrow, and no structure of the new scheme takes it along.
  d = drawing("paper", "A title");
  const short = (n: number) => ({ start: [{ text: "benzaldehyde", number: String(n) }], steps: [{ reagents: ["NaBH4"], solvents: ["MeOH"], products: [{ text: "benzyl alcohol", number: String(n + 1) }] }, { reagents: ["PBr3"], products: [{ text: "benzyl bromide", number: String(n + 2) }] }] });
  const one: Wrote = await call("draw_reaction", short(1)), title = "Scheme 1. Synthesis of benzyl bromide";
  const text: Wrote = await call("add_text", { text: title, below: one.structuredContent.made[0], align: "left", bold: true }), was = text.structuredContent.boxes[text.structuredContent.made[0]];
  const two: Wrote = await call("draw_reaction", { ...short(4), detail: "full" });
  assert.ok(fits(two), JSON.stringify(two.structuredContent.check));
  assert.deepEqual(two.structuredContent.changed, [], "the title and the first scheme are as they were");
  assert.ok(Math.abs(was[1] - 3 - span(two)[3]) < 0.21, "the second scheme starts 3 bond lengths under the title's box");
  const after = (await call("read_drawing", { detail: "full" })).structuredContent;
  assert.deepEqual(after.text.map((x: { text: string }) => x.text), [title], "the title is free text");
  assert.deepEqual(after.captions.find((c: { text: string }) => c.text === title).box, was, "where it was put");
  assert.deepEqual(after.reactions.map((r: { steps: { above: string[]; below: string[] }[] }) => r.steps.map((s) => [s.above, s.below])), Array(2).fill([[["NaBH4"], ["MeOH"]], [["PBr3"], []]]), "each scheme has its own conditions only");
}
{
  // A first line too wide to wrap (two wide starting materials, their arrow and a wide product: wider than Clean Up
  // Reaction's page, narrower than the page) stays whole in the middle of the page, and the later steps wrap under it.
  d = drawing("paper", "A wide first line");
  const ph = (rings: number, a = "", b = "") => `${a}c1ccc(cc1)-${"c1ccc(cc1)-".repeat(rings - 2)}c1ccc(${b})cc1`.replace("()", "");
  const wide: Wrote = await call("draw_reaction", { start: [{ text: ph(3, "Br"), number: "1" }, { text: ph(2, "OB(O)"), number: "2" }], steps: [
    { reagents: ["Pd"], products: [{ text: ph(5), number: "3" }] }, { reagents: ["Br2"], products: [{ text: ph(5, "Br", "Br"), number: "4" }] }, { reagents: ["CuCN"], products: [{ text: ph(5, "N#C", "C#N"), number: "5" }] },
  ] });
  const [s1, , s3, s4] = wide.structuredContent.made.filter((id) => id[0] === "s").map((id) => wide.structuredContent.boxes[id]);
  assert.ok(s3[2] - s1[0] > margins().wrap, `the first line is too wide to wrap: ${s3[2] - s1[0]}`);
  assert.ok(Math.abs(s1[0] + s3[2]) < 0.21, "it is in the middle of the page");
  assert.ok(s4[3] < s3[1], "the steps after it wrap");
  assert.ok(fits(wide), JSON.stringify(wide.structuredContent.check));
  // set_style puts a drawing across the page by the same rule: with the same preset, the scheme stays in the middle.
  const styled: Wrote = await call("set_style", { preset: "ACS Document 1996", detail: "full" });
  assert.ok(!styled.structuredContent.changed.includes("s1") && fits(styled), `set_style moved the scheme: ${JSON.stringify(styled.structuredContent)}`);
  // A reaction of one step wider than the page cannot wrap or fit: it starts at the left margin, so only its end is
  // past the page (in the middle of the page, both ends would be).
  d = drawing("paper", "Wider than the page");
  const over: Wrote = await call("draw_reaction", { start: [{ text: ph(6, "Br") }, { text: ph(6, "OB(O)") }], steps: [{ reagents: ["Pd"], products: [{ text: ph(8) }] }] }), bo = span(over);
  assert.ok(bo[2] - bo[0] > pageSize(d.host.style())[0] * (72 / 25.4 / d.host.style().bond), `wider than the page: ${bo}`);
  assert.ok(Math.abs(bo[0] - margins().left) < 0.11, `it starts at the left margin: ${bo}`);
}
{
  // Free text with no place given, on an empty page: the top left of its box is at the page's margins.
  d = drawing("paper", "Text");
  const { left, top } = margins(), text: Wrote = await call("add_text", { text: "Scheme 1. A title" }), b = span(text);
  assert.ok(Math.abs(b[0] - left) < 0.11 && Math.abs(b[3] - top) < 0.11, `${b}, ${[left, top]}`);
}
{
  // New work starts under a reagent table too. On an experiment page with its Procedure heading and box deleted, the
  // table under the scheme is the lowest thing drawn.
  d = drawing("experiment", "A table");
  const scheme: Wrote = await call("draw_reaction", { start: [{ text: "benzaldehyde" }], steps: [{ reagents: ["NaBH4"], products: [{ text: "benzyl alcohol" }] }] });
  const page = (await call("read_drawing", { detail: "full" })).structuredContent, heading = page.text.find((x: { text: string }) => x.text === "Procedure").id, lowest = page.shapes.reduce((p: { box: number[] }, q: { box: number[] }) => (q.box[1] < p.box[1] ? q : p)).id;
  assert.ok(!(await call("delete", { ids: [heading, lowest] })).isError);
  const table = d.host.tables()[0].box, under: Wrote = await call("draw_structures", { structures: [{ text: "toluene" }] });
  assert.ok(table[1] < scheme.structuredContent.boxes.s1[1] - 1, "the table reaches under the scheme's structures");
  assert.ok(span(under)[3] <= table[1] - 3 && span(under)[3] > table[1] - 4.5, `3 bond lengths under the table (and the grid's 1.25 round a structure): ${span(under)}, ${table}`);
}
{
  // Clean Up Structure on one reactant (run_command clean_up) lays its reaction out again, as in the window. A
  // reactant that then reaches over the plus sign beside it (terphenyl, drawn upright, lies flat when it is cleaned
  // up) keeps that plus sign: Octet adds no second one.
  d = drawing("paper", "Clean up");
  const drawn: Wrote = await call("draw_reaction", { start: [{ text: "c1ccc(cc1)c1ccc(cc1)c1ccccc1", rotate: 90 }, { text: "aniline" }], steps: [{ reagents: ["AcOH"], products: [{ text: "N-benzylideneaniline" }] }], keep_orientation: false });
  const pluses = () => (d.host.doc().captions ?? []).filter((c) => c.text.trim() === "+").length, arrow = Number(drawn.structuredContent.made.find((id) => id[0] === "a")!.slice(1));
  assert.equal(pluses(), 1);
  const cleaned: Wrote = await call("run_command", { command: "clean_up", ids: ["s1"] });
  assert.ok(!cleaned.isError && fits(cleaned), JSON.stringify(cleaned.structuredContent.check));
  assert.equal(pluses(), 1, "one plus sign after the clean-up");
  assert.deepEqual(d.host.reaction(arrow)?.steps.map((s) => s.kind), ["structure", "plus", "structure", "arrow", "structure"]);
}

// What one call draws fits the page and reads back whole (plan R4; the faults of docs/plans/mcp-v2-corpus-faults.md,
// each with its smallest input, drawn and measured as the window does).
{
  // A salt given as one compound is one compound with the salt's InChIKey, by a SMILES with a dot or by one name.
  d = drawing("paper", "Salts");
  const salts: Wrote = await call("draw_structures", { structures: [{ text: "C[N+](C)(C)C.[Cl-]", number: "1" }, { text: "tetramethylammonium chloride", number: "2" }, { text: "[Na+].[Cl-]", number: "3" }] });
  assert.deepEqual([salts.structuredContent.made.filter((id) => id[0] === "s").length, salts.structuredContent.check], [3, "clean"]);
  const three = (await call("read_drawing", { detail: "full" })).structuredContent;
  assert.deepEqual(three.structures.map((s: { number: string; formula: string; inchiKey: string }) => [s.number, s.formula, s.inchiKey]), [["1", "C4H12ClN", "OKIZCWYLBDKLSU-UHFFFAOYSA-M"], ["2", "C4H12ClN", "OKIZCWYLBDKLSU-UHFFFAOYSA-M"], ["3", "ClNa", "FAPWRFPIFSIZLT-UHFFFAOYSA-M"]]);
  assert.deepEqual(three.warnings, []);
  // The salt is one compound after its CDXML is read again (its ions are an integral group in the file).
  const again = drawing("paper", "Salts again");
  again.host.begin("open"); again.host.set(again.host.file((await call("get_file", { format: "cdxml" })).structuredContent.text)!); again.host.end();
  d = again;
  assert.deepEqual((await call("read_drawing", { detail: "full" })).structuredContent.structures.map((s: { number: string; inchiKey: string }) => [s.number, s.inchiKey]), three.structures.map((s: { number: string; inchiKey: string }) => [s.number, s.inchiKey]));
  // A scheme with salts in it wraps to the page and reads as one reaction, each salt one member of it.
  d = drawing("paper", "A scheme with salts");
  const salty = "c1ccccc1c1ccccc1.[Cl-]", scheme: Wrote = await call("draw_reaction", { start: [{ text: "biphenyl" }], steps: [salty, salty, "biphenyl", "biphenyl", "biphenyl"].map((text, k) => ({ products: [{ text, number: String(k + 1) }] })) });
  assert.equal(scheme.structuredContent.check, "clean");
  const route = (await call("read_drawing", {})).structuredContent;
  assert.deepEqual([route.reactions.map((r: { route: string }) => r.route), route.text], [["s1 -> 1 -> 2 -> 3 -> 4 -> 5"], undefined]);
}
{
  // A grid's columns come from the page and from each structure's box as drawn: wide labels do not run into the next
  // structure, and six anthracenes are two rows of three inside the page.
  d = drawing("paper", "Grids");
  const labels: Wrote = await call("draw_structures", { structures: [{ text: "*c1ccc(*)cc1", labels: ["CO2Et", "NHBoc"] }, { text: "*c1ccc(*)cc1", labels: ["CO2Et", "NHBoc"] }, { text: "*CC", labels: ["CO2Bn"] }, { text: "*CC", labels: ["CO2CH(CF3)2"] }] });
  assert.equal(labels.structuredContent.check, "clean");
  const six: Wrote & { content: { text: string }[] } = await call("draw_structures", { structures: Array.from({ length: 6 }, () => ({ text: "anthracene" })) });
  assert.match(six.content[0].text, /^Drew 6 structures in 2 rows of 3\. One undo step\./);
  assert.equal(six.structuredContent.check, "clean");
  const { left } = margins(), b = span(six);
  assert.ok(b[0] >= left - 0.11 && b[2] <= -left + 0.11, `inside the margins: ${b}`);
}
{
  // A structure at an arrow has room: the arrow is as long as it, it is clear of the arrow's text on its side, and it
  // reads as the step's. A compound there takes its labels and its number, clear of the text and the arrow.
  d = drawing("paper", "At an arrow");
  const one: Wrote = await call("draw_reaction", { start: [{ text: "benzene" }], steps: [{ above: ["structure: Hantzsch ester"], products: [{ text: "toluene" }] }] });
  const two: Wrote = await call("draw_reaction", { start: [{ text: "benzoic acid" }], steps: [{ above: ["(COCl)2"], below: ["then", "structure:S=C1C=CC=CN1O[Na]"], products: [{ text: "benzoyl chloride" }] }] });
  const three: Wrote = await call("draw_reaction", { start: [{ text: "*CC=C", labels: ["Bn"], number: "2a" }], steps: [{ above: [{ text: "C=CCS(=O)(=O)C*", labels: ["OTBS"], number: "1a" }, "1a (4 equiv.)", "HG-II (5 mol%)", "CH2Cl2, 40 °C"], products: [{ text: "*CCC=C", labels: ["Bn"], number: "4a" }] }] });
  for (const w of [one, two, three]) assert.equal(w.structuredContent.check, "clean", JSON.stringify(w.structuredContent.check));
  const b = one.structuredContent.boxes;
  assert.ok(b.a1[0] <= b.s2[0] && b.a1[2] >= b.s2[2] && b.s3[0] > b.a1[2], `the arrow is as long as the structure over it, and the product is past it: ${JSON.stringify(b)}`);
  const at = (await call("read_drawing", {})).structuredContent;
  assert.deepEqual(at.reactions.map((r: { route: string; conditions: Record<string, string> }) => [r.route, Object.values(r.conditions)[0]]), [["s1 -> s3", "s2"], ["s4 -> s6", "(COCl)2; then; s5"], ["2a -> 4a", "1a (4 equiv.); HG-II (5 mol%); CH2Cl2, 40 °C; 1a"]]);
  assert.deepEqual(at.structures.filter((s: { number?: string }) => s.number === "1a").map((s: { formula: string }) => s.formula), ["C10H22O3SSi"]);
}
{
  // One step too wide for the page. A long list of catalysts goes on three lines, so the arrow is short and the
  // reaction fits. A second product that does not fit goes on the next line and is still the reaction's product.
  // Where nothing can break, the reply says what did not fit and what to do.
  d = drawing("paper", "One step");
  const lines: Wrote = await call("draw_reaction", { start: [{ text: "benzene" }], steps: [{ catalysts: ["1 mol% [Ir(dF(CF3)ppy)2(dtbpy)]PF6", "5 mol% (R)-TRIP or (R)-TCYP", "10 mol% something else quite long here"], products: [{ text: "toluene" }] }] });
  assert.equal(lines.structuredContent.check, "clean");
  const pair: Wrote = await call("draw_reaction", { start: [{ text: "c1ccccc1NCCCCc1ccccc1", number: "1" }, { text: "COc1ccc(Br)cc1", number: "2" }], steps: [{ reagents: ["NiBr2·glyme"], products: [{ text: "COc1ccc(cc1)C(CCCc1ccccc1)Nc1ccccc1", number: "3a" }, { text: "COc1ccc(cc1)N(CCCCc1ccccc1)c1ccccc1", number: "3b" }] }] });
  assert.equal(pair.structuredContent.check, "clean");
  assert.ok(pair.structuredContent.boxes.s6[3] < pair.structuredContent.boxes.s5[1], "the second product is on the next line");
  const read2 = (await call("read_drawing", {})).structuredContent;
  assert.deepEqual([read2.reactions.map((r: { route: string }) => r.route), read2.text], [["s1 -> s2", "1 + 2 -> 3a + 3b"], undefined]);
  d = drawing("paper", "Nothing fits");
  const long: { content: { text: string }[] } = await call("draw_reaction", { start: [{ text: "CCCCCCCCCCCCCCCCCCCCCCCCO" }], steps: [{ products: [{ text: "CCCCCCCCCCCCCCCCCCCCCCCC=O" }] }] });
  assert.match(long.content[0].text, /^Drew the reaction\. Octet laid it out with Clean Up Reaction\. The scheme is [\d.]+ bond lengths wide \(the page is 41\.3\): give a larger page or landscape \(set_style\), or a starting material in above\./);
  // On a drawing with no page there is no such advice.
  d = drawing("quick", "No page");
  assert.doesNotMatch((await call("draw_reaction", { start: [{ text: "CCCCCCCCCCCCCCCCCCCCCCCCO" }], steps: [{ products: [{ text: "CCCCCCCCCCCCCCCCCCCCCCCC=O" }] }] })).content[0].text, /the page is/);
}
{
  // A cycle's side text: clear of the intermediates (its arrow's end goes further out), and on the page (the cycle
  // moves across).
  d = drawing("paper", "Cycles");
  const ni: Wrote = await call("draw_cycle", { intermediates: [{ text: "*[Ni]Br", labels: ["L"], number: "A" }, { text: "*[Ni](Br)(Br)*", labels: ["L", "R"], number: "B" }, { text: "*[Ni](Br)*", labels: ["L", "R"], number: "C" }, { text: "*[Ni](Br)(*)C(*)N*", labels: ["L", "R", "Alkyl", "Ph"], number: "D" }],
    steps: [{ step: 0, in: "ArBr" }, { step: 1, in: "PC•−", out: "PC + Br−" }, { step: 2, in: "PhNHCH(•)Alkyl" }, { step: 3, out: "PhNHCH(Ar)Alkyl" }] });
  assert.equal(ni.structuredContent.check, "clean", JSON.stringify(ni.structuredContent.check));
  d = drawing("paper", "A long side text");
  const side: Wrote = await call("draw_cycle", { intermediates: [{ text: "C[CH]C" }, { text: "CC(C)C1C=C(C)c2ccccc2[NH+]1" }, { text: "CC(C)[C]1C=C(C)c2ccccc2N1" }], steps: [{ step: 2, out: "product·H+, PhI, RCO2−, CO2" }] });
  assert.equal(side.structuredContent.check, "clean", JSON.stringify(side.structuredContent.check));
  assert.doesNotMatch(ni.content[0].text + side.content[0].text, /side text|bond lengths wide/);
  // Side text too long for the page: the reply says so, and what to do.
  d = drawing("paper", "A side text too long");
  const long: Wrote & { content: { text: string }[] } = await call("draw_cycle", { intermediates: [{ text: "benzene" }, { text: "toluene" }, { text: "phenol" }], steps: [{ step: 0, in: Array.from({ length: 12 }, (_, k) => `reagent ${k + 1}`).join(" and ") }] });
  assert.match(long.content[0].text, /\. The cycle is [\d.]+ bond lengths wide \(the page has 35\.4\): give shorter side text, or a larger page or landscape \(set_style\)\./, long.content[0].text);
}

// The runner: two inputs, a list of tool calls and a draw_reaction argument, drawn by two workers.
const dir = mkdtempSync(join(tmpdir(), "octet-headless-"));
try {
  writeFileSync(join(dir, "calls.json"), JSON.stringify([{ name: "draw_structures", arguments: { structures: [{ text: "aspirin" }, { text: "caffeine" }] } }]));
  writeFileSync(join(dir, "scheme.json"), JSON.stringify(SCHEME));
  const run = spawnSync(process.execPath, [new URL("../scripts/headless/draw.ts", import.meta.url).pathname, "--jobs", "2", join(dir, "calls.json"), join(dir, "scheme.json")], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const scheme = JSON.parse(readFileSync(join(dir, "scheme.drawn.json"), "utf8")).drawing;
  assert.deepEqual(scheme.structures.map((s: { inchiKey: string }) => s.inchiKey), ["HUMNYLRZRPPJDN-UHFFFAOYSA-N", "PIAOLBVUVDXHHL-VOTSOKGWSA-N", "BHHGXPLMPWCGHP-UHFFFAOYSA-N", "MODKMHXGCGKTLE-UHFFFAOYSA-N"]);
  assert.equal(JSON.parse(readFileSync(join(dir, "calls.drawn.json"), "utf8")).drawing.structures.length, 2);
  assert.match(readFileSync(join(dir, "scheme.cdxml"), "utf8"), /<scheme[\s\S]*<step[\s\S]*<step[\s\S]*<step/);
} finally { rmSync(dir, { recursive: true, force: true }); }

console.log("headless.check: ok");
