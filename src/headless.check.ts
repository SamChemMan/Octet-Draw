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
// No chemical warnings. (The second line starts left of the page, in the window too: mcp.ts starts a scheme half its
// estimated width left of the view's middle.)
assert.deepEqual(read.warnings.filter((w: { message: string }) => !/runs past the page's/.test(w.message)), []);
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

// Atoms, arrows and shapes by id: a charge, a curved arrow from a lone pair, brackets with a mark.
d = drawing("paper", "Ids");
await call("draw_structures", { structures: [{ text: "acetone" }] });
for (const [name, args] of [["edit", { ids: ["s1.2"], charge: 1 }], ["add_arrow", { kind: "curved", from: "s1.4:pair", to: "s1.2-4" }], ["add_shape", { kind: "brackets", around: ["s1"], mark: "‡" }]] as const)
  assert.ok(!(await call(name, args)).isError, name);
const ids = (await call("read_drawing", { atoms: true, detail: "full" })).structuredContent;
assert.equal(ids.structures[0].smiles, "C[C+](C)=O");
assert.deepEqual([ids.arrows.map((a: { kind: string }) => a.kind), ids.shapes.map((s: { kind: string; mark: string }) => [s.kind, s.mark])], [["curved"], [["brackets", "‡"]]]);

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
