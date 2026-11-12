// Run: node src/notation.check.ts. The line notation (notation.ts): what an AI app writes to draw, read into the
// arguments the drawing code takes, with no window (scripts/headless). The 60 jobs of the paper corpus and the taxol
// route written in it give the same drawing as their JSON (each compound by its number and InChIKey, every text, and
// each arrow's kind with the words and structures over and under it); a table of hard cases gives its arguments or
// its refusal; the description fits its room and its own example draws; and the reader is quick, also on hostile text.
// It prints each job's characters as JSON and as notation.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("notation.check: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { callOf, fromLines, linesOf, NOTATION } = await import("./notation.ts");
await load();

const words = (t: string) => t.split(/[\s,;]+/).filter(Boolean);
// What a drawing shows: each structure by its number and InChIKey; each arrow's kind with the words and structures
// over and under it (line breaks and the order of items aside); and every other text.
// Each drawing is in one session, whose brief (plan 3.1) is given once: these drawings are for a paper.
let d = drawing("paper");
const call = async (n: string, a: unknown, s = "notation") => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: n, arguments: a } }), () => d.host, "1", session("Check", s))).result;
assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);
// s: the session (one with no brief gives it in the call); said: keeps the reply.
async function shown(name: string, args: unknown, s?: string, said?: (r: any) => void) {
  d = drawing("paper");
  const r = await call(name, args, s);
  if (r.isError) return { refused: r.content[0].text };
  said?.(r);
  const full = (await call("read", { detail: "full" }, s)).structuredContent, m = d.host.doc();
  const key = new Map<string, string>(full.structures.map((s: { id: string; inchiKey: string }) => [s.id, s.inchiKey])), kind = new Map((m.arrows ?? []).map((a) => [`a${a.id}`, a.kind]));
  const side = (l: string[] = []) => l.flatMap((x) => (key.has(x) ? [`@${key.get(x)}`] : words(x))).sort().join(" ");
  return {
    structures: full.structures.map((s: { number?: string; inchiKey: string }) => `${s.number ?? ""}=${s.inchiKey}`).sort(),
    arrows: full.reactions.flatMap((x: { steps: { arrow: string; above?: string[]; below?: string[] }[] }) => x.steps.map((s) => `${kind.get(s.arrow)} | ${side(s.above)} | ${side(s.below)}`)).sort(),
    text: (m.captions ?? []).filter((c) => !c.on).map((c) => `${c.cycle ? `${c.cycle.side}:` : ""}${c.text.replace(/\s+/g, " ")}`).sort(),
  };
}

// ---- The description ----

// It goes in the tool list, which is 14,000 characters in all (610 before it said a step's label and a name changed,
// in the room draw_route's listing left).
assert.ok(NOTATION.length <= 820, `${NOTATION.length}`);
// Round 4: the scope's example names an amine whole, and says where it joins: a model given "the products R2N–X from
// these amines" had written every product out as SMILES.
assert.match(NOTATION, /R=morpholine \(5b\)[^]*R= takes a label, SMILES or name \(an amine joins at N\)/);
// The change line shows the plain forms: the class forms (both OH, 2° OTBS) it showed in round 5 made Opus write a
// step in words as changes it could not get right, at more cost than SMILES (plan 19.10). Each of its changes reads.
assert.match(NOTATION, /3\[\.\.\] changes 3: OBn>OTES, 7:OTBS, 7:H, 7\+OH \(7: map \[C:7\]\), 5=6, reduce 9\. /);
{ const line = /3\[\.\.\] changes 3: (.*?)\. R=/.exec(NOTATION)![1]; assert.ok(typeof fromLines({ lines: `3[${line.replace(/ \(7: map \[C:7\]\)/, "").replaceAll(",", ";")}] (4)` }) !== "string", line); }
// Examples, not prose: a few short lines each, one line of marks, and no "Scheme" a model would copy into a title (12
// lines before round 3b wrote the cycle a step a line and added a lone start and a grid).
assert.ok(NOTATION.split("\n").length <= 18 && !/Scheme/.test(NOTATION), NOTATION);
// It teaches by example (models copy examples): each of its drawings reads and draws with no refusal. The route draws
// 3 from 2 + PhB(OH)2 on the first line, and 4 from 3 by its number in a second scheme with its lettered parts kept as
// written; the scope its two compounds, 5b with morpholine joined at its N; the grid its two; the cycle, one step a
// line, its three intermediates as text (Octet cannot read L2Pd(Ar)Br), each with its number, its side text at the
// steps written and L = PPh3 in the middle.
{
  const [route, scope, grid, cycle] = NOTATION.split("\n\n").slice(0, 4).map((x) => x.replace(/^Lines as .*\n/, ""));
  const drawn = async (lines: string) => { const r = fromLines({ lines }); assert.ok(typeof r !== "string", String(r)); const s = await shown(...callOf(r)); assert.ok("structures" in s, JSON.stringify(s)); return s; };
  const s = await drawn(route);
  assert.ok(s.structures.includes("3=RHDYQUZYHZWTCI-UHFFFAOYSA-N") && s.structures.includes("4=RJFYGCJTUUXOOF-UHFFFAOYSA-N"), s.structures.join(" "));
  assert.deepEqual((fromLines({ lines: route }) as { args: { schemes: { steps: { above?: string[] }[] }[] } }).args.schemes[1].steps[0].above, ["(a) BBr3, CH2Cl2, −78 °C, 78%", "(b) Tf2O, pyridine, 90%"]);
  // (A group joined by name is a draw by lines': drawn from lines.)
  assert.deepEqual(((await shown("draw", { lines: scope })) as { structures: string[] }).structures, ["5a=NTPLXRHDUXRPNE-UHFFFAOYSA-N", "5b=AKQWEDMTPCAESO-UHFFFAOYSA-N"]);
  assert.deepEqual((await drawn(grid)).structures.map((x) => x.split("=")[0]), ["6a", "6b"]);
  const c = await drawn(cycle);
  assert.deepEqual(c.structures, []);
  assert.deepEqual(c.text, ["centre:L = PPh3", "in:Ar'B(OH)2", "in:ArBr", "name:OA", "name:RE", "name:TM", "node:L2Pd(Ar)Ar' 3", "node:L2Pd(Ar)Br 2", "node:Pd(0)L2 1", "out:Ar–Ar'", "out:B(OH)2Br"]);
  const m = d.host.doc(), nodes = (m.captions ?? []).filter((x) => x.cycle?.side === "node");
  assert.deepEqual(nodes.map((x) => [x.cycle!.step, x.runs?.at(-1)]), [[0, { text: "1", bold: true }], [1, { text: "2", bold: true }], [2, { text: "3", bold: true }]]);
  assert.ok(m.cycles![0].nodes.every((n) => !n.length));
  // read names each text intermediate by its text's id.
  assert.ok((await call("read", {})).structuredContent.cycles[0].intermediates.every((x: string) => /^t\d+$/.test(x)));
}
// A scope's R= takes a SMILES joined by its first atom and an amine's name joined at its N–H (round 3b: for paper-scope
// models wrote all 12 products out by hand); L stays a label, and an amine with two N–H is refused with its line. A ring
// SMILES is a ring (N1CCOCC1 had read as the label NCCOCC, a chain, and C1CC1 as propyl), and a substituent name that
// OPSIN reads as a compound (cyclopropyl, methyl) or not at all (morpholino) joins where its lithium compound has the
// lithium (each had stayed a * with the name on it). A word Octet cannot join is refused with its line.
{
  const one = (await shown("draw", { lines: "{R}c1ccc(cc1)C(C)=O: R=N1CCC(CC1)c1ccccc1 (8a) | R=4-phenylpiperidine (8b) | R=L (8c)\nR=N1CCOCC1 (8d) | R=morpholino (8e) | R=C1CC1 (8f) | R=cyclopropyl (8g) | R=methyl (8h)" })) as { structures: string[] };
  assert.deepEqual(one.structures, ["8a=CFWNOCYKHOLNLA-UHFFFAOYSA-N", "8b=CFWNOCYKHOLNLA-UHFFFAOYSA-N", "8c=undefined", "8d=AKQWEDMTPCAESO-UHFFFAOYSA-N", "8e=AKQWEDMTPCAESO-UHFFFAOYSA-N", "8f=SWHHCKFQUJBPPQ-UHFFFAOYSA-N", "8g=SWHHCKFQUJBPPQ-UHFFFAOYSA-N", "8h=GNKZMNRKLCTJAY-UHFFFAOYSA-N"]);
  // Round 4: two N–H that are the same (piperazine) join at either. Two that differ, and a word Octet cannot join, leave
  // that compound out with its line and what to give, as a name Octet cannot read does; the rest is drawn.
  let said = "";
  const two = (await shown("draw", { lines: "{R}c1ccc(cc1)C(C)=O: R=OMe (9a)\nR=piperazine (9b) | R=2-methylpiperazine (9c) | R=cyclopropy (9d)" }, undefined, (r) => (said = r.content[0].text))) as { structures: string[] };
  assert.deepEqual(two.structures, ["9a=NTPLXRHDUXRPNE-UHFFFAOYSA-N", "9b=KPXVKKBJROCIJB-UHFFFAOYSA-N"]);
  assert.match(said, /^Drew 2 structures .* Line 2: 2-methylpiperazine has 2 N–H, so Octet cannot tell which joins: give it as a SMILES, its joining atom first\. Line 2: Octet cannot join cyclopropy: give it as a SMILES, its joining atom first\./);
}
// Round 4: paper-scope (scripts/mcp-evals/speed.mjs) as one scope, the shared part once and R= each amine as the user
// named it: both models had written the twelve products out as SMILES. Each is the structure the job's check wants (7f
// with no stereo: its name gives none and its bridge allows one). It takes a name with a second N that has no H
// (1-Boc-piperazine), stereo from a name (cis-2,6-dimethylmorpholine, and "(cis)" after one), acyclic amines, a new row
// and a whole compound among the R= cells.
{
  const scope = JSON.parse(readFileSync(new URL("../scripts/mcp-bench/corpus/trowbridge2018.json", import.meta.url), "utf8")).jobs.find((j: { id: string }) => j.id === "trowbridge2018-fig4a-amines").expect.smiles as Record<string, string>;
  const want = (await shown("draw", { structures: Object.entries(scope).map(([number, text]) => ({ text, number })) })) as { structures: string[] };
  const got = (await shown("draw", { lines: `{R}C(CCC)CC(c1ccccc1)c1ccccc1: R=4-phenylpiperidine (7a) 51% | R=4-(trifluoromethyl)piperidine (7b) 54% | R=1-Boc-piperazine (7c) 38% | R=cis-2,6-dimethylmorpholine (7d) 60% | R=3-azabicyclo[3.1.0]hexane (cis) (7e) 25% | R=2,3,4,5-tetrahydro-1H-1,5-methano-3-benzazepine (7f) 38%
R=nortropinone (7g) 34% | R=3-methoxyazetidine (7h) 81% | R=N-ethylcyclohexylamine (7i) 69% | R=N-(2-methoxyethyl)methylamine (7j) 86% | R=dimethylamine (7k) 88% | benzyl (2S,4S)-2-tert-butyl-5-oxo-4-[2-(2,2,6,6-tetramethylpiperidin-1-yl)ethyl]-1,3-oxazolidine-3-carboxylate (7l) 61% (>20:1 d.r.)` })) as { structures: string[] };
  const loose = (x: string) => (x.startsWith("7f=") ? x.slice(0, 17) : x);
  assert.deepEqual(got.structures.map(loose), want.structures.map(loose));
  // Only (cis) or (trans) goes with the group: other words in brackets before the number are dropped, as before, so
  // R=Me (S) is methyl and X=Cl (racemic) chloro.
  const kept = fromLines({ lines: "{R}c1ccc(cc1)C(C)=O: R=Me (S) (5b) | R=Cl (racemic) (5c) | R=3-azabicyclo[3.1.0]hexane (cis) (5d)" }) as { args: { structures: { labels: string[] }[] } };
  assert.deepEqual(kept.args.structures.map((s) => s.labels[0]), ["Me", "Cl", "3-azabicyclo[3.1.0]hexane (cis)"]);
  // labels take 7f's 47 characters for the scope to join, but a label that stays one is at most 40, as the CDXML reader
  // keeps (it had drawn, and read back cut with "label text" lost).
  const long = (await shown("draw", { structures: [{ text: "*c1ccccc1", labels: ["2,3,4,5-tetrahydro-1H-1,5-methano-3-benzazepinyl"] }] })) as { refused: string };
  assert.match(long.refused, /^Octet drew nothing\. labels\[0\]: longer than 40 characters\.$/);
}

// ---- The paper corpus and the taxol route, as notation ----

// Each job as a chemist writes it from the paper (scripts/mcp-bench/lines.json, which the benchmark draws too): ^ and _
// where the JSON put a condition on the other side from where Octet puts it, and "..." for a line kept as the JSON had it.
const here = new URL("../scripts/mcp-bench/", import.meta.url), jobs = new Map<string, { tool: string; arguments: unknown }>();
const NOTES: Record<string, string> = JSON.parse(readFileSync(new URL("lines.json", here), "utf8"));
for (const f of readdirSync(new URL("corpus/", here)).filter((x) => x.endsWith(".json"))) for (const j of JSON.parse(readFileSync(new URL(`corpus/${f}`, here), "utf8")).jobs) jobs.set(j.id, j);
// The taxol route (taxol/route.json) as the drawing code draws it: each scheme's title, then the scheme.
const route = JSON.parse(readFileSync(new URL("taxol/route.json", here), "utf8"));
jobs.set("taxol-route", { tool: "change", arguments: { operations: route.schemes.flatMap((s: { title: string; start: unknown; steps: unknown }) => [{ op: "text", text: s.title }, { op: "draw", kind: "reaction", start: s.start, steps: s.steps }]) } });
assert.deepEqual([...jobs.keys()].sort(), Object.keys(NOTES).sort());
let json = 0, lines = 0;
const table: string[] = [], wanted = new Map<string, Awaited<ReturnType<typeof shown>>>();
for (const [id, text] of Object.entries(NOTES)) {
  const j = jobs.get(id)!, r = fromLines({ lines: text });
  assert.ok(typeof r !== "string", `${id}: ${r}`);
  wanted.set(id, await shown(j.tool, j.arguments));
  assert.deepEqual(await shown(...callOf(r)), wanted.get(id), id);
  const a = JSON.stringify(j.arguments).length;
  json += a; lines += text.length;
  table.push(`| ${id} | ${a} | ${text.length} |`);
}
console.log(`| Job | JSON | Notation |\n|---|---|---|\n${table.join("\n")}\n| All ${table.length} | ${json} | ${lines} |`);
// The notation is little more than half the JSON.
assert.ok(lines < 0.6 * json, `${lines} of ${json}`);
// The same jobs with no ^, _ or "..." (a model that leaves the sides to Octet): the jobs whose arrows then have the
// words and structures over and under them that the paper has.
{
  const bare = (t: string) => t.replace(/(^|[\s,;])[\^_](?=\S)/g, "$1").replace(/"/g, "");
  let arrows = 0, same = 0;
  const differ: string[] = [];
  for (const [id, text] of Object.entries(NOTES)) {
    const want = wanted.get(id)!;
    if (!("arrows" in want) || !want.arrows.length || bare(text) === text) { if ("arrows" in want && want.arrows.length) { arrows++; same++; } continue; }
    arrows++;
    const r = fromLines({ lines: bare(text) }), got = typeof r === "string" ? { refused: r } : await shown(...callOf(r));
    if ("arrows" in got && JSON.stringify(got.arrows) === JSON.stringify(want.arrows)) same++;
    else differ.push(`${id}: ${"arrows" in got ? got.arrows.filter((a) => !want.arrows.includes(a)).join(" / ") : got.refused}`);
  }
  console.log(`With no ^, _ or "...": ${same} of ${arrows} jobs with arrows have each side as the paper has.\n${differ.join("\n")}`);
  // 8 before light, sieves and a catalyst's loading went under the arrow (11 November 2026).
  assert.ok(same >= 20, `${same}`);
}

// ---- One draw call a job (plan 19.2) ----

// Each job is one draw call with its lines and the brief, in a session with no brief: drawn as its JSON draws it, and
// answered so the AI app can tell the user at once, with no read: every structure drawn in compounds, each with its
// formula and stereo, and the check, in under 1,300 characters (the longest is printed; 1,200 before each compound
// said its stereo, plan 19.10, which put the taxol route at 1,254).
{
  let k = 0, most = [0, ""] as [number, string];
  // (The taxol route on a paper page runs past it: its reply then names each of the 20 ids past the page and says
  // what to do, 1,500 characters. On Quick start, a user's default, it has no page.)
  for (const [id, text] of Object.entries(NOTES)) {
    let r: any;
    const got = await shown("draw", { lines: text, brief: id === "taxol-route" ? "quick" : "paper" }, `one-${++k}`, (x) => (r = x)), want = wanted.get(id)!;
    // (A job the JSON draws nothing of, as Octet cannot read a name, is refused the same, with the line of each name.)
    if ("refused" in want) { assert.equal(String(got.refused).replace(/ \(line \d+\)/g, "").replace(/ as a structure\.$/, ""), want.refused.replace(/: give a SMILES instead.*$/, ""), id); assert.match(String(got.refused), /" \(line 1\) as a structure\.$/, id); }
    else assert.deepEqual(got, want, id);
    if (!r) continue;
    const said = r.content.map((c: { text: string }) => c.text).join("\n"), sc = r.structuredContent;
    assert.ok(said.length < 1300, `${id}: ${said.length} characters\n${said}`);
    assert.equal(sc.compounds.length, (await call("read", {}, `one-${k}`)).structuredContent.structures.length, `${id}: ${said}`);
    assert.ok(sc.compounds.every((c: string) => /^(?:\S+ )?s\d+ (?:[A-Z]|=s\d+$)/.test(c)) && sc.check !== undefined && !("boxes" in sc), `${id}: ${said}`);
    if (said.length > most[0]) most = [said.length, id];
  }
  console.log(`The longest reply of a job drawn in one call: ${most[0]} characters (${most[1]}).`);
}

// ---- Hard cases: the arguments each must give, or its refusal ----

const R = (start: object[], steps: object[]) => ({ op: "reaction", args: { start, steps } });
const T = (text: string) => ({ text }), B = { text: "B" }, A = [T("A")];
const HARD: [string, object | RegExp][] = [
  // A reactant that is also the solvent: as written, a starting material or a condition. A full stop at the end.
  ["benzoic acid + MeOH -> methyl benzoate (2), H2SO4, reflux, 6 h, 88%.", R([T("benzoic acid"), T("MeOH")], [{ reagents: ["H2SO4"], temperature: "reflux", time: "6 h", yield: "88%", products: [{ text: "methyl benzoate", number: "2" }] }])],
  ["benzoic acid -> methyl benzoate, MeOH, H2SO4 (cat.), reflux", R([T("benzoic acid")], [{ solvents: ["MeOH"], catalysts: ["H2SO4 (cat.)"], temperature: "reflux", products: [T("methyl benzoate")] }])],
  // A comma with no space is part of a name (2,6-lutidine, (1S,2R), N,N-); r.t. is a temperature and keeps its stop.
  ["A -> B, TBSOTf, 2,6-lutidine, CH2Cl2, r.t.", R(A, [{ reagents: ["TBSOTf", "2,6-lutidine"], solvents: ["CH2Cl2"], temperature: "r.t.", products: [B] }])],
  ["(1S,2R)-2-amino-1,2-diphenylethan-1-ol + N,N-dimethylformamide -> X", R([T("(1S,2R)-2-amino-1,2-diphenylethan-1-ol"), T("N,N-dimethylformamide")], [{ products: [T("X")] }])],
  // A + in brackets or at the end of a word is a charge.
  ["Na+ + Cl− -> NaCl", R([T("Na+"), T("Cl−")], [{ products: [T("NaCl")] }])],
  ["C[N+](C)(C)C.[OH-] + CC=O -> Y", R([T("C[N+](C)(C)C.[OH-]"), T("CC=O")], [{ products: [T("Y")] }])],
  // Arrows, Unicode or ASCII, with any spacing; >> as reaction SMILES write it.
  ["A → B", R(A, [{ products: [B] }])],
  ["A⇌B", R(A, [{ arrow: "equilibrium", products: [B] }])],
  ["A => B + C", R(A, [{ arrow: "retro", products: [B, T("C")] }])],
  ["A <-> B", R(A, [{ arrow: "resonance", products: [B] }])],
  ["A -/-> B", R(A, [{ arrow: "nogo", products: [B] }])],
  ["A↛B", R(A, [{ arrow: "nogo", products: [B] }])],
  ["A.B>>C", R([T("A.B")], [{ products: [T("C")] }])],
  ["  A   ->B ,  H2SO4 ;  reflux  ", R(A, [{ reagents: ["H2SO4"], temperature: "reflux", products: [B] }])],
  // A number in either bracket, or bold; a caption after it, or in quotes; an amount in brackets is a caption.
  ["A -> B [3]", R(A, [{ products: [{ text: "B", number: "3" }] }])],
  ["A -> B **3**", R(A, [{ products: [{ text: "B", number: "3" }] }])],
  ['A -> B (3) "crude"', R(A, [{ products: [{ text: "B", number: "3", caption: "crude" }] }])],
  ["A -> B (4g) 85%", R(A, [{ products: [{ text: "B", number: "4g", caption: "85%" }] }])],
  ["A -> B (1, 95%), X (1.2 equiv, 3 mmol)", R(A, [{ reagents: ["X (1.2 equiv, 3 mmol)"], products: [{ text: "B", number: "1", caption: "95%" }] }])],
  ["A + B (1.2 equiv) -> C, Et3N (1.5 equiv), 80 ºC", R([T("A"), { text: "B", caption: "(1.2 equiv)" }], [{ reagents: ["Et3N (1.5 equiv)"], temperature: "80 °C", products: [T("C")] }])],
  // Brackets in a name are not a number.
  ["methyl (S)-lactate + tetrakis(triphenylphosphine)palladium(0) -> X", R([T("methyl (S)-lactate"), T("tetrakis(triphenylphosphine)palladium(0)")], [{ products: [T("X")] }])],
  // then, and numbered operations, with no decision by the model.
  ["A -> B, (COCl)2, DMSO, CH2Cl2, −78 °C; then Et3N, 90%", R(A, [{ reagents: ["(COCl)2"], solvents: ["DMSO", "CH2Cl2"], temperature: "−78 °C", yield: "90%", below: ["then Et3N"], products: [B] }])],
  ["A -> B, 1. n-BuLi, THF, −78 °C 2. DMF, 85%", R(A, [{ yield: "85%", above: ["1. n-BuLi, THF, −78 °C", "2. DMF"], products: [B] }])],
  ["A -> B, (i) NaH, THF (ii) MeI, 80%", R(A, [{ yield: "80%", above: ["(i) NaH, THF", "(ii) MeI"], products: [B] }])],
  ["A -> B, 1. X, 78% 2. Y, 42%", R(A, [{ above: ["1. X, 78%", "2. Y, 42%"], products: [B] }])],
  ["A -> B, a) X b) Y, _\"a) 95%; b) 94%\"", R(A, [{ above: ["a) X", "b) Y"], below: ["a) 95%; b) 94%"], products: [B] }])],
  // A temperature range is not an arrow.
  ["A -> B, n-BuLi, THF, −78 → 25 °C, 3 h", R(A, [{ reagents: ["n-BuLi"], solvents: ["THF"], temperature: "−78 → 25 °C", time: "3 h", products: [B] }])],
  // Marks: ^ over, _ under, "..." as written (arrows and commas in it too), @ a structure.
  ['A -> B, ^THF, _H2SO4, "two steps -> one", @L-proline, _@NFSI (5)', R(A, [{ above: ["THF", "two steps -> one", T("L-proline")], below: ["H2SO4", { text: "NFSI", number: "5" }], products: [B] }])],
  // A line goes on from the last product: with an arrow, or with the product's number. Several steps on one line.
  ["A -> B (2)\n-> C (3), NaBH4", R(A, [{ products: [{ text: "B", number: "2" }] }, { reagents: ["NaBH4"], products: [{ text: "C", number: "3" }] }])],
  ["A -> B (2)\n2 -> C (3), NaBH4", R(A, [{ products: [{ text: "B", number: "2" }] }, { reagents: ["NaBH4"], products: [{ text: "C", number: "3" }] }])],
  ["A -> B (2), X -> C (3), Y", R(A, [{ reagents: ["X"], products: [{ text: "B", number: "2" }] }, { reagents: ["Y"], products: [{ text: "C", number: "3" }] }])],
  // Changes to an earlier compound (compound.ts), and [...] alone for the one before.
  ["2[7:OTBS; 4:OTBS; reduce 9] (3)", { op: "structures", args: { structures: [{ from: "2", changes: [{ at: "7", set: "OTBS" }, { at: "4", set: "OTBS" }, { do: "reduce", at: "9" }], number: "3" }] } }],
  ["7[2:OH; join 2-1 8 (2S); 1:H; 1=14] (9)", { op: "structures", args: { structures: [{ from: "7", changes: [{ at: "2", set: "OH" }, { do: "join", at: "2-1", with: "8", config: { 2: "S" } }, { at: "1", remove: true }, { bond: "1-14", to: "double" }], number: "9" }] } }],
  ["14[hydroborate 5 S, deprotect acetonide, 7:OBn>OTES]", { op: "structures", args: { structures: [{ from: "14", changes: [{ do: "hydroborate", at: "5", config: "S" }, { do: "deprotect", with: "acetonide" }, { swap: { OBn: "OTES" }, at: "7" }] }] } }],
  ["3[2nd OBn>OTES; 7+OH; 5#6; oxidize 7; open epoxide 14; close 9-10 double (1S,2R)] (4)", { op: "structures", args: { structures: [{ from: "3", changes: [{ swap: { OBn: "OTES" }, occurrence: 2 }, { at: "7", add: "OH" }, { bond: "5-6", to: "triple" }, { do: "oxidise", at: "7" }, { do: "open_epoxide", at: "14" }, { do: "close", at: "9-10", to: "double", config: { 1: "S", 2: "R" } }], number: "4" }] } }],
  // Which of a group, as the user says it: a class (2°, sec, tert., s-), both or all, and a kind of place for a named one.
  ["2[both OH>OTBS; CO2Et>CH2OH] (3)", { op: "structures", args: { structures: [{ from: "2", changes: [{ swap: { "both OH": "OTBS" } }, { swap: { CO2Et: "CH2OH" } }], number: "3" }] } }],
  ["3[2° OTBS>OH; sec OTBS>OBn; tert. OTBS>OH; s-OTBS>OH; all OH>OAc; reduce lactone] (4)", { op: "structures", args: { structures: [{ from: "3", changes: [{ swap: { "2° OTBS": "OH" } }, { swap: { "sec OTBS": "OBn" } }, { swap: { "tert. OTBS": "OH" } }, { swap: { "s-OTBS": "OH" } }, { swap: { "all OH": "OAc" } }, { do: "reduce", at: "lactone" }], number: "4" }] } }],
  ["A (1) -> [OMe>OH] (2), BBr3", R([{ text: "A", number: "1" }], [{ reagents: ["BBr3"], products: [{ from: "1", changes: [{ swap: { OMe: "OH" } }], number: "2" }] }])],
  // {R} is a label; a * with none is refused.
  ["{R}c1ccccc1 + {Ar}B(O)O -> {R}c1ccc({Ar})cc1", R([{ text: "*c1ccccc1", labels: ["R"] }, { text: "*B(O)O", labels: ["Ar"] }], [{ products: [{ text: "*c1ccc(*)cc1", labels: ["R", "Ar"] }] }])],
  ["*c1ccccc1{R}", /has a \* with no label: write each as \{R\}/],
  // A chain back to its first compound is a cycle; # before it is its centre.
  ["# L = PPh3\n{L}[Pd]{L} (A) -> {L}[Pd]({L})(Br){Ar} (B), +ArBr, OA -> {L}[Pd]({L})({Ar}){Ar} (C), +ArB(OH)2, -B(OH)2Br, TM -> A, -Ar–Ar, RE", { op: "cycle", args: { intermediates: [{ text: "*[Pd]*", labels: ["L", "L"], number: "A" }, { text: "*[Pd](*)(Br)*", labels: ["L", "L", "Ar"], number: "B" }, { text: "*[Pd](*)(*)*", labels: ["L", "L", "Ar", "Ar"], number: "C" }], centre: "L = PPh3", steps: [{ step: 0, in: "ArBr", name: "OA" }, { step: 1, in: "ArB(OH)2", out: "B(OH)2Br", name: "TM" }, { step: 2, out: "Ar–Ar", name: "RE" }] } }],
  // A scope: the core once, then one line a compound. | puts compounds in one row.
  ["{R}c1ccc(cc1)C(C)=O:\nR=OMe (3a) 91%\nR=F (3b) 85% | R=CF3 (3c)", { op: "structures", args: { structures: [{ text: "*c1ccc(cc1)C(C)=O", labels: ["OMe"], number: "3a", caption: "91%" }, { text: "*c1ccc(cc1)C(C)=O", labels: ["F"], number: "3b", caption: "85%" }, { text: "*c1ccc(cc1)C(C)=O", labels: ["CF3"], number: "3c" }], columns: 2 } }],
  ["core: {R}c1ccc(cc1)C(C)=O\nR = OMe (3a, 91%)", { op: "structures", args: { structures: [{ text: "*c1ccc(cc1)C(C)=O", labels: ["OMe"], number: "3a", caption: "91%" }] } }],
  // A Markdown code fence round the lines is taken off.
  ["```text\nA -> B\n```", R(A, [{ products: [B] }])],
  // A title makes a figure; ## its subtitle; "..." a text item.
  ['# Catalysts\n## Scheme 2\nL-proline (1) | "and" | (S)-proline (2) 51%\\nhomo', { op: "figure", args: { panels: [{ title: "Catalysts", subtitle: "Scheme 2", rows: [[{ structure: "L-proline", number: "1" }, { text: "and" }, { structure: "(S)-proline", number: "2", caption: "51%\nhomo" }]] }] } }],
  // A route (plan 5.4): schemes, each with the titles before it, and an earlier compound by its number.
  ["# Scheme 1. Oxidation\ntoluene -> benzoic acid (1), KMnO4, 70%\n# Scheme 2\n1 -> benzoyl chloride (2), SOCl2", { op: "route", args: { schemes: [{ title: "Scheme 1. Oxidation", start: [T("toluene")], steps: [{ reagents: ["KMnO4"], yield: "70%", products: [{ text: "benzoic acid", number: "1" }] }] }, { title: "Scheme 2", start: [{ from: "1", number: "1" }], steps: [{ reagents: ["SOCl2"], products: [{ text: "benzoyl chloride", number: "2" }] }] }] } }],
  // Two schemes with no title are a route too; a title alone, or a title before a grid, is a batch as before.
  ["A (1) -> B (2)\nC -> D (3)", { op: "route", args: { schemes: [{ start: [{ text: "A", number: "1" }], steps: [{ products: [{ text: "B", number: "2" }] }] }, { start: [T("C")], steps: [{ products: [{ text: "D", number: "3" }] }] }] } }],
  ["# S\nA -> B\nC (1) | D (2)", { op: "batch", args: { steps: [{ tool: "text", args: { text: "S" } }, { tool: "reaction", args: { start: A, steps: [{ products: [B] }] } }, { tool: "structures", args: { structures: [{ text: "C", number: "1" }, { text: "D", number: "2" }], columns: 2 } }] } }],
  // A step's label first: letters on the arrows and the conditions in a note (legend letters), also for one scheme.
  // (a) followed by (b) in one step is numbered operations, as before.
  ["A (1) -> B (2), (a), MeOH, H2SO4\n-> C (3), (b, c) LiOH, THF; then HCl", { op: "route", args: { schemes: [{ start: [{ text: "A", number: "1" }], steps: [{ reagents: ["H2SO4"], solvents: ["MeOH"], label: "a", products: [{ text: "B", number: "2" }] }, { reagents: ["LiOH"], solvents: ["THF"], below: ["then HCl"], label: "b, c", products: [{ text: "C", number: "3" }] }] }], legend: "letters" } }],
  ["A -> B, (ii) NaH", { op: "route", args: { schemes: [{ start: A, steps: [{ reagents: ["NaH"], label: "ii", products: [B] }] }], legend: "letters" } }],
  ["A -> B, (a) NaH (b) MeI", R(A, [{ above: ["(a) NaH", "(b) MeI"], products: [B] }])],
  // A name changed by its labels: Octet's reading of the name, then the changes. A SMILES that ends in a bracket atom
  // is a SMILES.
  ["aspirin[OAc>OH] (5)", { op: "structures", args: { structures: [{ text: "aspirin", changes: [{ swap: { OAc: "OH" } }], number: "5" }] } }],
  ["A -> methyl 4-(benzyloxy)benzoate[OBn>OTBS; protect 7 TBS]", R(A, [{ products: [{ text: "methyl 4-(benzyloxy)benzoate", changes: [{ swap: { OBn: "OTBS" } }, { do: "protect", at: "7", with: "TBS" }] }] }])],
  ["CC[Pd] -> X", R([T("CC[Pd]")], [{ products: [T("X")] }])],
  // Refused, with what to write instead: two readings, nothing to go on from, an open bracket, a dative bond.
  ["-> B", /starts with an arrow, but there is no compound before it/],
  ["A -> B (", /a bracket is not closed/],
  ["A ->", /an arrow has no product after it/],
  ["[NH3]->[Pt]", /reads as a dative bond in a SMILES or as an arrow/],
  ["3[reduce 7 9]", /reduce has two places \(7, 9\)/],
  ["3[foo bar]", /foo is not a transformation\. They are: protect, deprotect/],
  ["3[7=OTBS]", /cannot read the change "7=OTBS"/],
  ["", /nothing to draw/],
  // A SMILES of one bracket atom is a SMILES: a change is only one compound.ts knows.
  ["anisole (1) -> [Pd] (2)", R([{ text: "anisole", number: "1" }], [{ products: [{ text: "[Pd]", number: "2" }] }])],
  ["[Li] + A -> B", R([T("[Li]"), T("A")], [{ products: [B] }])],
  ["A (1) -> [Cu] (2)", R([{ text: "A", number: "1" }], [{ products: [{ text: "[Cu]", number: "2" }] }])],
  ["A -> B, @[Pd]", R(A, [{ above: [T("[Pd]")], products: [B] }])],
  ["PhBr (1)\n[Mg]", { op: "structures", args: { structures: [{ text: "PhBr", number: "1" }, T("[Mg]")] } }],
  // (R) after a name is a number or a configuration; [R] is a number.
  ["2-butanone -> 2-butanol (R), NaBH4", /"2-butanol \(R\)" reads two ways: \(R\) is compound R \(write \[R\]\), or a configuration \(write \(R\)-2-butanol\)/],
  ["A -> B (2S)", /reads two ways: \(2S\) is compound 2S/],
  ["A -> B [R]", R(A, [{ products: [{ text: "B", number: "R" }] }])],
  // A number given earlier that is also a SMILES; **C** is the compound.
  ["X (C) -> Y (D)\nC + O -> CO", /"C" reads two ways: compound C \(write \*\*C\*\*\), or the structure C/],
  ["X (C) -> Y (D)\n**C** + O -> CO", { op: "route", args: { schemes: [{ start: [{ text: "X", number: "C" }], steps: [{ products: [{ text: "Y", number: "D" }] }] }, { start: [{ from: "C", number: "C" }, T("O")], steps: [{ products: [T("CO")] }] }] } }],
  // Back to the first compound with no +x, -x or title: a cycle or a scheme. A yield makes it a scheme.
  ["benzyl alcohol (1) -> 1[OH>OTBS] (2), TBSCl, imidazole, DMF -> 1, TBAF, THF", /the steps come back to 1, so they read two ways: a catalytic cycle \(write \+x for what goes in, -x for what comes out\) or a scheme/],
  ["A (1) -> B (2), X, 90% -> 1, Y, 80%", R([{ text: "A", number: "1" }], [{ reagents: ["X"], yield: "90%", products: [{ text: "B", number: "2" }] }, { reagents: ["Y"], yield: "80%", products: [{ from: "1", number: "1" }] }])],
  // A scope's groups split as conditions do: 2,4-Cl2C6H3 is one group; a space before NAME= starts the next.
  ["{Ar}C(C)=O:\nAr=2,4-Cl2C6H3 (1) 90%", { op: "structures", args: { structures: [{ text: "*C(C)=O", labels: ["2,4-Cl2C6H3"], number: "1", caption: "90%" }] } }],
  ["{R}c1ccc({Ar})cc1:\nR=Me, Ar=3,5-(CF3)2C6H3 (2) | R=Et Ar=Ph (3)", { op: "structures", args: { structures: [{ text: "*c1ccc(*)cc1", labels: ["Me", "3,5-(CF3)2C6H3"], number: "2" }, { text: "*c1ccc(*)cc1", labels: ["Et", "Ph"], number: "3" }], columns: 2 } }],
  // A reagent in its solvent goes over the arrow; a mixture of solvents under it.
  ["A -> B, HCl/dioxane, NaOMe/MeOH, THF/H2O (4:1)", R(A, [{ reagents: ["HCl/dioxane", "NaOMe/MeOH"], solvents: ["THF/H2O (4:1)"], products: [B] }])],
  // A yield or ratio with its word first.
  ["A -> B, yield 88%, E:Z >95:5, d.r. 10:1", R(A, [{ yield: "yield 88%, E:Z >95:5, d.r. 10:1", products: [B] }])],
  // Arrows that autocorrect makes; a reaction SMILES with agents.
  ["A —> B", R(A, [{ products: [B] }])],
  ["A –> B", R(A, [{ products: [B] }])],
  ["CCO>[H+]>CC=O", /reaction SMILES with agents: write CCO -> CC=O, \[H\+\]/],
  // A comma with no space that is not between locants.
  ["A -> B,X", /"B,X": put a space after the comma before X/],
  ["4,4'-dimethoxy-1,1'-biphenyl + N,N-diethyl-2,6-xylidine -> X", R([T("4,4'-dimethoxy-1,1'-biphenyl"), T("N,N-diethyl-2,6-xylidine")], [{ products: [T("X")] }])],
  // Operations that skip a number.
  ["A -> B, 1. X 3. Y", /operation 3 follows 1: number them in order/],
  // Round 2 (plan 5.6): what models write. Starting materials are joined by +, so what follows a comma before the arrow
  // is the step's conditions (said in the reply: below).
  ["A + B, MeOH, 0 °C -> C (1), 95%", R([T("A"), B], [{ solvents: ["MeOH"], temperature: "0 °C", yield: "95%", products: [{ text: "C", number: "1" }] }])],
  ["A, B -> C", R(A, [{ reagents: ["B"], products: [T("C")] }])],
  // A compound alone on a line (under its title), then a line that starts with an arrow: it is the start.
  ["ethyl (S)-lactate (1)\n-> 1[OH>OTBS] (2), TBSCl", R([{ text: "ethyl (S)-lactate", number: "1" }], [{ reagents: ["TBSCl"], products: [{ from: "1", changes: [{ swap: { OH: "OTBS" } }], number: "2" }] }])],
  ["# T\nX (1)\n-> Y (2)", { op: "route", args: { schemes: [{ title: "T", start: [{ text: "X", number: "1" }], steps: [{ products: [{ text: "Y", number: "2" }] }] }] } }],
  ["# Fig\nX (1) | Y (2)\n# Scheme\nZ (3)\n-> W (4)", { op: "batch", args: { steps: [{ tool: "figure", args: { panels: [{ title: "Fig", rows: [[{ structure: "X", number: "1" }, { structure: "Y", number: "2" }]] }] } }, { tool: "text", args: { text: "Scheme" } }, { tool: "reaction", args: { start: [{ text: "Z", number: "3" }], steps: [{ products: [{ text: "W", number: "4" }] }] } }] } }],
  ["A -> B\nX (1)\n-> Y (2)", { op: "route", args: { schemes: [{ start: A, steps: [{ products: [B] }] }, { start: [{ text: "X", number: "1" }], steps: [{ products: [{ text: "Y", number: "2" }] }] }] } }],
  // A cycle on one line with what goes in and out written against its compounds: before an arrow, that arrow's step;
  // at the end of a line, in goes into the step from the compound and out comes from the step to it. Words that are
  // no structure are its text, as written; quoted, with no quotes.
  ["P (1) +triketone -> Q (2) -> S (3) -> 1 -ketol", { op: "cycle", args: { intermediates: [{ text: "P", number: "1" }, { text: "Q", number: "2" }, { text: "S", number: "3" }], steps: [{ step: 0, in: "triketone" }, { step: 2, out: "ketol" }] } }],
  ['P (1) +"triketone" -> Q (2) -> S (3) -ketol -> 1', { op: "cycle", args: { intermediates: [{ text: "P", number: "1" }, { text: "Q", number: "2" }, { text: "S", number: "3" }], steps: [{ step: 0, in: "triketone" }, { step: 2, out: "ketol" }] } }],
  // Among a step's text (OA +X), what goes in or out is the next arrow's when one follows on the line.
  ["P (A) +ArBr -> Q (B), OA +Ar'B(OH)2 -B(OH)2Br -> S (C), TM -Ar–Ar' -> A, RE", { op: "cycle", args: { intermediates: [{ text: "P", number: "A" }, { text: "Q", number: "B" }, { text: "S", number: "C" }], steps: [{ step: 0, in: "ArBr", name: "OA" }, { step: 1, in: "Ar'B(OH)2", out: "B(OH)2Br", name: "TM" }, { step: 2, out: "Ar–Ar'", name: "RE" }] } }],
  // A line with conditions before its first arrow puts each step's before its arrow (round 3b): Haiku's say-cycle line
  // read +triketone as 1→2's and then -ketol, after 4, as 3→4's. Now -ketol goes on the arrow after 4 (4→1). paper-cycle
  // the same way, with water at both.
  ["OC(=O)[C@@H]1CCCN1 (1), +triketone -> C/C(CCC1(C)C(=O)CCC1=O)=[N+]1\\CCC[C@H]1C([O-])=O (2) -> OC(=O)[C@@H]1CCCN1C(=C)CCC1(C)C(=O)CCC1=O (3) -> C[C@]12CC/C(=[N+]3/CCC[C@H]3C([O-])=O)C[C@@]1(O)CCC2=O (4), -ketol -> 1",
    { op: "cycle", args: { intermediates: [{ text: "OC(=O)[C@@H]1CCCN1", number: "1" }, { text: "C/C(CCC1(C)C(=O)CCC1=O)=[N+]1\\CCC[C@H]1C([O-])=O", number: "2" }, { text: "OC(=O)[C@@H]1CCCN1C(=C)CCC1(C)C(=O)CCC1=O", number: "3" }, { text: "C[C@]12CC/C(=[N+]3/CCC[C@H]3C([O-])=O)C[C@@]1(O)CCC2=O", number: "4" }], steps: [{ step: 0, in: "triketone" }, { step: 3, out: "ketol" }] } }],
  ["P (1), +triketone, -H2O -> Q (2) -> S (3) -> U (4), +H2O, -ketol -> 1", { op: "cycle", args: { intermediates: [{ text: "P", number: "1" }, { text: "Q", number: "2" }, { text: "S", number: "3" }, { text: "U", number: "4" }], steps: [{ step: 0, in: "triketone", out: "H2O" }, { step: 3, in: "H2O", out: "ketol" }] } }],
  // So does a scheme's, but a yield stays with the product it follows (90% is B's), and the last product's go on its own.
  ["A (1), H2SO4 -> B (2), 90%, NaOH -> C (3), 85%", R([{ text: "A", number: "1" }], [{ reagents: ["H2SO4"], yield: "90%", products: [{ text: "B", number: "2" }] }, { reagents: ["NaOH"], yield: "85%", products: [{ text: "C", number: "3" }] }])],
  ["A (1), H2SO4 -> B (2), 90% -> C (3), 85%", R([{ text: "A", number: "1" }], [{ reagents: ["H2SO4"], yield: "90%", products: [{ text: "B", number: "2" }] }, { yield: "85%", products: [{ text: "C", number: "3" }] }])],
  // Intermediates that are formulas (text when Octet cannot read them, as the drawing check above shows), labels in
  // braces taken off the side text, and the centre text as a definition before or after it, or in quotes after it.
  ["# Suzuki\n{L}: PPh3\nPd(0)L2 (A) -> L2Pd(Ar)Br (B), +ArBr, OA -> Pd(0)L2 (A), -{Ar}-{Ar'}, RE", { op: "cycle", args: { intermediates: [{ text: "Pd(0)L2", number: "A" }, { text: "L2Pd(Ar)Br", number: "B" }], centre: "Suzuki\nL = PPh3", steps: [{ step: 0, in: "ArBr", name: "OA" }, { step: 1, out: "Ar-Ar'", name: "RE" }] } }],
  ['P (A) -> Q (B), +X\n-> A, -Y\n"L = PPh3"', { op: "cycle", args: { intermediates: [{ text: "P", number: "A" }, { text: "Q", number: "B" }], centre: "L = PPh3", steps: [{ step: 0, in: "X" }, { step: 1, out: "Y" }] } }],
  ["P (A) -> Q (B), +X\n-> A, -Y\nL = PPh3", { op: "cycle", args: { intermediates: [{ text: "P", number: "A" }, { text: "Q", number: "B" }], centre: "L = PPh3", steps: [{ step: 0, in: "X" }, { step: 1, out: "Y" }] } }],
  // Not a cycle: compounds are read as written, as before (A +B is two, trans -stilbene one name). A definition no
  // cycle takes is free text, as a line in quotes is: not a title.
  ["A +B -> C", R([T("A"), B], [{ products: [T("C")] }])],
  ["A -> B -H2O", R(A, [{ products: [T("B -H2O")] }])],
  ["trans -stilbene -> B", R([T("trans -stilbene")], [{ products: [B] }])],
  ["L = PPh3\nA -> B", { op: "batch", args: { steps: [{ tool: "figure", args: { panels: [{ rows: [[T("L = PPh3")]] }] } }, { tool: "reaction", args: { start: A, steps: [{ products: [B] }] } }] } }],
  ["TBS = tert-butyldimethylsilyl\nA (1) -> B (2), TBSCl, 90%", { op: "batch", args: { steps: [{ tool: "figure", args: { panels: [{ rows: [[T("TBS = tert-butyldimethylsilyl")]] }] } }, { tool: "reaction", args: { start: [{ text: "A", number: "1" }], steps: [{ reagents: ["TBSCl"], yield: "90%", products: [{ text: "B", number: "2" }] }] } }] } }],
  // A scheme back to its start with yields stays a scheme: a quoted line or a definition after it is a note, not the
  // centre of a cycle.
  ['A (1) -> B (2), 90%\n-> 1, 80%\n"from ref 3"', { op: "batch", args: { steps: [{ tool: "reaction", args: { start: [{ text: "A", number: "1" }], steps: [{ yield: "90%", products: [{ text: "B", number: "2" }] }, { yield: "80%", products: [{ from: "1", number: "1" }] }] } }, { tool: "figure", args: { panels: [{ rows: [[T("from ref 3")]] }] } }] } }],
  ["A (1) -> B (2), 90%\n-> 1, 80%\nTHF = tetrahydrofuran", { op: "batch", args: { steps: [{ tool: "reaction", args: { start: [{ text: "A", number: "1" }], steps: [{ yield: "90%", products: [{ text: "B", number: "2" }] }, { yield: "80%", products: [{ from: "1", number: "1" }] }] } }, { tool: "figure", args: { panels: [{ rows: [[T("THF = tetrahydrofuran")]] }] } }] } }],
  // A scope as models write it: the core with "then" and its compounds on its line, joined by ; or |, or the core with
  // its group again after it; a number bare or in brackets with its yield.
  ["{R}c1ccc(cc1)C(C)=O: then R=OMe (3a) 91%; R=F (3b) 85% | R = CF3 3c 70%", { op: "structures", args: { structures: [{ text: "*c1ccc(cc1)C(C)=O", labels: ["OMe"], number: "3a", caption: "91%" }, { text: "*c1ccc(cc1)C(C)=O", labels: ["F"], number: "3b", caption: "85%" }, { text: "*c1ccc(cc1)C(C)=O", labels: ["CF3"], number: "3c", caption: "70%" }], columns: 3 } }],
  ["CC(=O)c1ccc({R})cc1 {R}: then\nR=OMe (3a, 91%)\nthen R=F 3b", { op: "structures", args: { structures: [{ text: "CC(=O)c1ccc(*)cc1", labels: ["OMe"], number: "3a", caption: "91%" }, { text: "CC(=O)c1ccc(*)cc1", labels: ["F"], number: "3b" }] } }],
  // A refusal gives the corrected line when Octet can work it out.
  ["A -> B,X, 90%", /: put a space after the comma before X \(a comma with no space is part of a name, as in 2,6-lutidine\)\. Write: A -> B, X, 90%$/],
  ["P (A) -> Q (B), +X, @Y -> A, -Z", /^Line 1: @Y: a cycle's steps take text, not a structure\. Write: P \(A\) -> Q \(B\), \+X, Y -> A, -Z$/],
];
// Lines as a JSON array of lines, in text or as a list (Haiku, plan 19.10), are those lines; one may hold several.
// (Read once where the lines arrive, in draw's and change's routes: src/mcp.check.ts draws them.)
assert.equal(linesOf('["A (1)", "-> B (2), X"]'), "A (1)\n-> B (2), X");
assert.equal(linesOf('[ "A (1)\\n-> B (2), X" ]'), "A (1)\n-> B (2), X");
assert.equal(linesOf(["A (1)", "-> B (2), X"]), "A (1)\n-> B (2), X");
// (A SMILES in square brackets is no JSON, and an empty list or one of other things is no lines: each is as given.)
for (const v of ["[Pd]", "[]", "[1, 2]", [], [1]]) assert.equal(linesOf(v), v);
for (const [text, want] of HARD) {
  const got = fromLines({ lines: text });
  if (want instanceof RegExp) assert.match(String(got), want, text);
  else assert.deepEqual(got, want, text);
}
// What Octet read in a way the model may not have meant is said, a line each, in the reply.
{
  const said: string[] = [];
  fromLines({ lines: "A + B, MeOH, 0 °C -> C\nD -> E" }, (k, l) => said.push(`${k}: ${l}`));
  assert.deepEqual(said, ['before: Line 1: Octet read "MeOH, 0 °C", before the arrow, as the step\'s conditions.']);
  const r = await call("draw", { lines: "cyclohexanone + NaBH4, MeOH, 0 °C -> cyclohexanol (1), 95%" });
  assert.match(r.content.map((c: { text: string }) => c.text).join("\n"), /\nLine 1: Octet read "MeOH, 0 °C", before the arrow, as the step's conditions\.$/);
}
// Lines as the lab's Haiku wrote them (11 November), each refused then: a stray first line of words before a blank line
// or a title is left out, a // line is a comment, and a first line of words before a compound and an arrow is the
// scheme's title. Each is said in the reply. A compound by name in the same places is drawn as before.
{
  const lines = (r: any) => r.content.slice(1).map((c: { text: string }) => c.text).join("\n");
  for (const [k, [text, structures, title, note]] of ([
    ["the ketol\n\n# Bicyclic ketol 2\n2-Methyl-2-(3-oxobutyl)cyclopentane-1,3-dione (1) -> C[C@]12CCC(=O)C[C@@]1(O)CCC2=O (2), L-proline (20 mol%), CHCl3, rt", ["1", "2"], "Bicyclic ketol 2", 'Octet left out line 1, "the ketol": it is not a structure.'],
    ["for the scheme\n\n# Quaternisation to ammonium tosylate 12a\nPiribedil + Cc1ccc(cc1)S(=O)(=O)OCCC=C (11a) -> C=CCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.Cc1ccc(cc1)S(=O)(=O)[O-] (12a)\n\n# Hydroboration to borane 13a\n12a -> C1CC2CCCC(C1)B2CCCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.Cc1ccc(cc1)S(=O)(=O)[O-] (13a), 9-BBN–H", ["", "11a", "12a", "12a", "13a"], "Quaternisation to ammonium tosylate 12a", 'Octet left out line 1, "for the scheme": it is not a structure.'],
    ["// Hajos–Parrish cyclisation\n# Hajos–Parrish ketol 2\nCC(=O)CCC1(C)C(=O)CCC1=O (1) -> (3aS,7aS)-3a-hydroxy-7a-methylhexahydro-1H-indene-1,5(6H)-dione (2), L-proline (20 mol%), CHCl3, rt, 99% ee", ["1", "2"], "Hajos–Parrish ketol 2", "Octet left out line 1, a comment."],
    ["// Piribedil N-alkylation, hydroboration, then benzylic C–N to C–C coupling\n# Piribedil to 14a\nC1OC2=C(O1)C=C(C=C2)CN1CCN(CC1)c1ncccn1 + C=CCCOS(=O)(=O)c1ccc(C)cc1 (11a) -> C=CCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.Cc1ccc(cc1)S(=O)(=O)[O-] (12a)\n-> C1OC2=C(O1)C=C(C=C2)CCCCCN3CCN(CC3)c4ncccn4 (14a), SPhos·Pd-G3, t-BuOK, 47%", ["", "11a", "12a", "14a"], "Piribedil to 14a", "Octet left out line 1, a comment."],
    ["Hajos-Parrish proline cycle\nOC(=O)[C@@H]1CCCN1 (1)\n-> O=C1CCC(=O)C1(C)CC/C(C)=[N+]\\1CCC[C@H]1C(=O)[O-] (2), +triketone, -H2O\n-> C=C(CCC1(C)C(=O)CCC1=O)N1CCC[C@H]1C(=O)O (3), -H+\n-> C[C@]12CCC(\\C[C@@]1(O)CCC2=O)=[N+]/3CCC[C@H]3C(=O)[O-] (4), aldol\n-> 1, -ketol, +H2O (hydrolysis)", ["1", "2", "3", "4"], "centre:Hajos-Parrish proline cycle", "Octet read line 1 as the scheme's title."],
    ["Hajos–Parrish proline cycle\nOC(=O)[C@@H]1CCCN1 (1)\n-> O=C1CCC(=O)C1(C)CC/C(C)=[N+]\\1CCC[C@H]1C(=O)[O-] (2), + triketone, −H2O\n-> C=C(CCC1(C)C(=O)CCC1=O)N1CCC[C@H]1C(=O)O (3), −H+\n-> C[C@]12CCC(\\C[C@@]1(O)CCC2=O)=[N+]/3CCC[C@H]3C(=O)[O-] (4), aldol\n-> 1, − ketol, + H2O (hydrolysis)", ["1", "2", "3", "4"], "centre:Hajos–Parrish proline cycle", "Octet read line 1 as the scheme's title."],
    // (One word is a title too, and a comment between the title and its scheme leaves it so, said in line order.)
    ["Hajos-Parrish\nOC(=O)[C@@H]1CCCN1 (1)\n-> CCO (2)", ["1", "2"], "Hajos-Parrish", "Octet read line 1 as the scheme's title."],
    ["the ketol\n// a note\nCCO (1)\n-> CC=O (2)", ["1", "2"], "the ketol", "Octet read line 1 as the scheme's title.\nOctet left out line 2, a comment."],
    // (Names, which Octet reads: a start on the line before its arrow, a structure before a blank line and a title,
    // and one alone. Two lone lines before an arrow are refused as before.)
    ["methyl benzoate\n-> benzoic acid", ["", ""], undefined, ""],
    ["methyl benzoate\n\n# Acid\nbenzoic acid", ["", ""], "Acid", ""],
    ["methyl benzoate", [""], undefined, ""],
  ] as [string, string[], string | undefined, string][]).entries()) {
    let said = "";
    const s = await shown("draw", { lines: text, brief: "quick" }, `words-${k}`, (r) => { said = lines(r); });
    assert.ok("structures" in s, `${text}: ${JSON.stringify(s)}`);
    assert.deepEqual(s.structures.map((x) => x.split("=")[0]).sort(), structures.sort(), text);
    if (title) assert.ok(s.text.includes(title), `${text}: ${s.text.join(" / ")}`);
    assert.equal(said, note, text);
  }
  assert.match((await call("draw", { lines: "methyl benzoate\nbenzoic acid\n-> benzene", brief: "quick" }, "words-x")).content[0].text, /^Octet changed nothing\. Line 3 starts with an arrow/);
  // A title with nothing under it before a scheme is that scheme's (it was an empty panel, refused with its JSON path).
  const r = fromLines({ lines: "benzene | toluene\n# Next\nanisole -> phenol" }) as { op: string; args: { steps: { tool: string; args: { text?: string } }[] } };
  assert.deepEqual(r.args.steps.map((x) => x.args.text ?? x.tool), ["structures", "Next", "reaction"]);
  // A limit the lines break is said of the line it is on, and what to write, never as the JSON path the lines made.
  const long = "x".repeat(320);
  for (const [text, want] of [
    [`ethanol -> acetaldehyde, ${long}`, `Line 1: "${"x".repeat(40)}…" is longer than 300 characters: make it shorter.`],
    [`ethanol -> acetaldehyde (1)\n\n# T\nbenzene -> phenol, ${long}`, `Line 4: "${"x".repeat(40)}…" is longer than 300 characters: make it shorter.`],
    [`benzene | toluene\n\nethanol -> acetaldehyde, ${long}`, `Line 3: "${"x".repeat(40)}…" is longer than 300 characters: make it shorter.`],
    [Array.from({ length: 201 }, (_, k) => "C".repeat(k + 1)).join(" | "), "The lines make more than 200 structures: draw them in parts."],
  ]) assert.equal((await call("draw", { lines: text, brief: "quick" }, "words-limit")).content[0].text, `Octet changed nothing. ${want}`, text.slice(0, 60));
  // Reading line 1 waits for nothing: a call sent after a draw by lines (by an AI app that takes elicitation, whose
  // calls go in turn) sees what it drew.
  const o = drawing("paper"), go = (name: string, a: unknown) => handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: a } }), () => o.host, "1", session("Order", "order", (async () => ({ action: "decline" })) as any));
  await go("set_brief", { destination: { kind: "quick" } });
  const [, seen] = await Promise.all([go("draw", { lines: "ethanol -> acetaldehyde" }), go("read", {})]);
  assert.equal(JSON.parse(JSON.parse(seen).result.content[0].text).reactions.length, 1, seen);
}
// A name or SMILES Octet cannot read is named as the lines wrote it ({R}), with the line it is on (not one that only
// holds its text, as a caption), and no more: on every path (a reaction, a route, a batch, a change). The JSON form
// still says what to give.
{
  d = drawing("paper");
  const said = async (n: string, a: unknown) => (await call(n, a)).content[0].text as string;
  assert.match(await said("draw", { lines: "{R}C(=O)Nqqzx -> CC" }), /Octet cannot read "\{R\}C\(=O\)Nqqzx" \(line 1\) as a structure\.$/);
  assert.match(await said("draw", { lines: 'CCO -> CC (1) "qqzx"\n# T\n1 -> qqzx' }), /Octet cannot read "qqzx" \(line 3\) as a structure\.$/);
  assert.match(await said("draw", { lines: "CC -> CCO\nqqzx (1) | CO (2)" }), /Octet cannot read "qqzx" \(line 2\) as a structure\./);
  assert.match(await said("change", { operations: [{ op: "draw", lines: "CC -> qqzx" }] }), /Octet cannot read "qqzx" \(line 1\) as a structure\.$/);
  assert.match(await said("draw", { kind: "reaction", start: [{ text: "qqzx" }], steps: [{ products: [{ text: "CC" }] }] }), /Octet cannot read "qqzx": give a SMILES instead/);
}
// A line that starts with what the chain has just made, by its number or its text, goes on from it (Haiku's lines,
// paper-three-step: before, 2 schemes and a second 12a): one scheme of three steps, with the other starting material
// over its arrow as a structure. One Octet cannot read that is not a SMILES (Haiku's first try) is text there, and the
// reply says so; the first starting material, and a SMILES that does not parse, are refused as before.
{
  const P = `# Piribedil to 14a
piribedil + but-3-en-1-yl tosylate (11a) -> C=CCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.Cc1ccc(cc1)S(=O)(=O)[O-] (12a)
12a + B1C2CCCC1CCC2 -> B1(CCCC[N+]2(Cc3ccc4OCOc4c3)CCN(CC2)c2ncccn2)C2CCCC1CCC2.Cc1ccc(cc1)S(=O)(=O)[O-] (13a)
13a -> C1CN(CCCCCc2ccc3OCOc3c2)CCN1c1ncccn1 (14a), SPhos·Pd-G3, t-BuOK, 47%`;
  const r = fromLines({ lines: P }) as { op: string; args: { schemes: { steps: { above?: unknown }[] }[] } };
  assert.deepEqual([r.op, r.args.schemes.length, r.args.schemes[0].steps.map((s) => s.above)], ["route", 1, [undefined, [{ text: "B1C2CCCC1CCC2" }], undefined]]);
  assert.deepEqual((fromLines({ lines: "CCO -> CC=O, PCC\nCC=O + CN -> CC=NC" }) as { args: { steps: { above?: unknown }[] } }).args.steps.map((s) => s.above), [undefined, [{ text: "CN" }]]);
  // A line that gives what was made a new number, or that starts from one of two products, starts a scheme as before
  // (the number kept; the scheme not carried on from a co-product).
  for (const l of ["CC=O -> CCO (3), NaBH4\nCCO (5) + CC(=O)Cl -> CCOC(C)=O (6)", "CC=O -> CCO (3) + CO, NaBH4\nCO -> C=O (4), PCC"]) assert.equal((fromLines({ lines: l }) as { args: { schemes: unknown[] } }).args.schemes.length, 2, l);
  let said = "";
  const s = await shown("draw", { lines: P.replace("B1C2CCCC1CCC2", "9-BBN–H") }, undefined, (x) => (said = x.content[0].text));
  assert.match(said, /^Drew a scheme of 3 steps with 4 numbered compounds\. 9-BBN–H is text over its arrow\./);
  assert.ok("arrows" in s && s.arrows.includes("reaction | 9-BBN–H | ") && s.structures.filter((x) => x.startsWith("12a=")).length === 1, JSON.stringify(s));
  for (const [l, bad] of [["qqzx + CC -> CCO", "qqzx"], ["CC + C1CCCC -> CCO", "C1CCCC"]]) assert.match((await call("draw", { lines: l })).content[0].text, new RegExp(`^Octet drew nothing\\. Octet cannot read "${bad}" \\(line 1\\) as a structure\\.$`), l);
  // Only lines' '+' partners: the JSON forms and an @name (a structure asked for) are refused as before.
  for (const args of [{ kind: "reaction", start: [{ text: "CC" }, { text: "9-BBN–H" }], steps: [{ products: [{ text: "CCO" }] }] }, { kind: "reaction", start: [{ text: "CC" }], steps: [{ above: ["structure: 9-BBN–H"], products: [{ text: "CCO" }] }] }, { lines: "CC -> CCO, @9-BBN–H" }]) assert.match((await call("draw", args)).content[0].text, /^Octet drew nothing\. Octet cannot read "9-BBN–H"/, JSON.stringify(args));
}
// Round 3c: a second starting material is drawn as the models wrote it after round 3b's example (10 of 12 tries lost
// 11a). Haiku's start line with a + and no arrow is two starting materials, each with its own number, as A + B -> C
// has them (it had read as one salt 11a); a lone compound, a grid row, a scope and a salt (one SMILES with a dot, or
// one name) are as before.
{
  const start = (l: string) => (({ args: a }) => a.start ?? a.schemes[0].start)(fromLines({ lines: l }) as { args: { start: Compound[]; schemes: { start: Compound[] }[] } });
  type Compound = { text?: string; number?: string };
  assert.deepEqual(start("piribedil + but-3-en-1-yl tosylate (11a)\n-> C=CCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.Cc1ccc(cc1)S(=O)(=O)[O-] (12a)"), [{ text: "piribedil" }, { text: "but-3-en-1-yl tosylate", number: "11a" }]);
  assert.deepEqual(start("# T\nA (1) + B\n-> C (2)\n-> D"), [{ text: "A", number: "1" }, { text: "B" }]);
  assert.deepEqual(start("4-bromoanisole (2)\n-> 4-methoxybiphenyl (3)"), [{ text: "4-bromoanisole", number: "2" }]);
  for (const l of ["CC[N+](C)(C)C.[Cl-] (5)\n-> CC (6)", "piribedil tosylate (5)\n-> CC (6)"]) assert.equal(start(l).length, 1, l);
  assert.deepEqual(fromLines({ lines: "A + B (1)\nC (2)" }), { op: "structures", args: { structures: [{ text: "A + B", number: "1" }, { text: "C", number: "2" }] } });
  assert.deepEqual(fromLines({ lines: "anisole (6a) 51% | toluene (6b) 54%" }), { op: "structures", args: { structures: [{ text: "anisole", number: "6a", caption: "51%" }, { text: "toluene", number: "6b", caption: "54%" }], columns: 2 } });
  // Opus's 11a among the first step's conditions, by SMILES or name, with its number: a starting material of that step.
  // At a later step it goes over the arrow, as an added reactant does; and a SMILES with no number is drawn there, never
  // its text. Amounts ((1.5 equiv), (5 mol%)), a concentration and a reagent's name stay conditions.
  for (const x of ["Cc1ccc(cc1)S(=O)(=O)OCCC=C", "but-3-en-1-yl tosylate"]) assert.deepEqual(start(`piribedil\n-> C=CCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.Cc1ccc(cc1)S(=O)(=O)[O-] (12a), ${x} (11a)`), [{ text: "piribedil" }, { text: x, number: "11a" }]);
  const r = fromLines({ lines: "CCO -> CC=O (2), PCC\n-> CC=CC(=O)O (3), C=CC(=O)O (9), PhB(OH)2 (1.5 equiv), Pd(PPh3)4 (5 mol%), HCl (4M), C=CCBr, NBS, SOCl2, Boc2O, Cs2CO3, [Zn](SO2CF3)2, c1ccccc1Br" }) as { args: { start: Compound[]; steps: { above?: unknown[]; reagents?: string[]; catalysts?: string[] }[] } };
  assert.deepEqual([r.args.start, r.args.steps[1].above, r.args.steps[1].reagents, r.args.steps[1].catalysts], [[{ text: "CCO" }], [{ text: "C=CC(=O)O", number: "9" }, { text: "C=CCBr" }, { text: "c1ccccc1Br" }], ["PhB(OH)2 (1.5 equiv)", "HCl (4M)", "NBS", "SOCl2", "Boc2O", "Cs2CO3", "[Zn](SO2CF3)2"], ["Pd(PPh3)4 (5 mol%)"]]);
  // Only a reagent with a number no compound has yet: an amount in units (2eq, 16h, 1atm) and a temperature, time or
  // solvent with one stay conditions, and so does one with a number already drawn (Pd2(dba)3 (2) after biphenyl 2).
  const cond = (l: string) => { const { args: a } = fromLines({ lines: l }) as { args: { start: Compound[]; steps: Record<string, unknown>[] } }; return [a.start.length, a.steps[0]]; };
  assert.deepEqual(cond("A (1)\n-> B (2), NaH (2eq), THF, rt (16h)"), [1, { reagents: ["NaH (2eq)"], solvents: ["THF"], temperature: "rt (16h)", products: [{ text: "B", number: "2" }] }]);
  assert.deepEqual(cond("A (1) -> B (2), toluene (0.2M), 110 °C (18h)"), [1, { solvents: ["toluene (0.2M)"], temperature: "110 °C (18h)", products: [{ text: "B", number: "2" }] }]);
  assert.deepEqual(cond("CCO (1) -> CC=O (2), H2 (1atm), Pd/C"), [1, { reagents: ["H2 (1atm)", "Pd/C"], products: [{ text: "CC=O", number: "2" }] }]);
  assert.deepEqual(cond("A (1) -> B (2), CH2Cl2 (16h)"), [1, { solvents: ["CH2Cl2 (16h)"], products: [{ text: "B", number: "2" }] }]);
  assert.deepEqual(cond("bromobenzene (1)\n-> biphenyl (2), PhB(OH)2, Pd2(dba)3 (2), K3PO4"), [1, { reagents: ["PhB(OH)2", "Pd2(dba)3 (2)", "K3PO4"], products: [{ text: "biphenyl", number: "2" }] }]);
}
// Plan 19.10 (real-r4-haiku-3 say-one-step): a list on a line of its own under an arrow's line, with no arrow and no
// compound number, can only be more conditions for that arrow, and the reply says so. With any doubt (a blank line
// before it, a line after it that starts with an arrow, a compound number) it is refused as a list, saying where
// conditions go: it was told to put a space after a comma that had one.
{
  let said = "";
  const one = fromLines({ lines: "2-Methyl-2-(3-oxobutyl)cyclopentane-1,3-dione (1) -> C[C@]12CCC(=O)C[C@@]1(O)CCC2=O (2), 99% ee\nL-proline (20 mol%), CHCl3, rt" }, (_, l) => (said = l));
  assert.deepEqual(one, R([{ text: "2-Methyl-2-(3-oxobutyl)cyclopentane-1,3-dione", number: "1" }], [{ catalysts: ["L-proline (20 mol%)"], solvents: ["CHCl3"], temperature: "rt", yield: "99% ee", products: [{ text: "C[C@]12CCC(=O)C[C@@]1(O)CCC2=O", number: "2" }] }]));
  assert.equal(said, "Line 2: Octet read it as more conditions for the arrow on line 1.");
  for (const l of ["A -> B\n\nX (5 mol%), Y, rt", "A -> B\nX (5 mol%), Y, rt\n-> C", "A -> B (2)\n3, rt"]) assert.match(String(fromLines({ lines: l })), /is a list, not a compound: put conditions after the product on its arrow's line$/, l);
  // (With no arrow line just before it, a list is compounds the model meant: it is told how to write them.)
  for (const l of ["aspirin, caffeine", "benzene | aspirin, caffeine", "A -> B\nC\nX, Y"]) assert.match(String(fromLines({ lines: l })), /"(?:aspirin, caffeine|X, Y)" is a list, not a compound: put each compound between \| or on a line of its own$/, l);
}
// Plan 19.10 (real-r4-haiku-2 say-three-step): a number that is no compound yet, with a SMILES in brackets after it, is
// that compound with that number. One that is a compound of the call already keeps the bracket as its caption.
{
  const P = { "11a": "Cc1ccc(cc1)S(=O)(=O)OCCC=C", "12a": "C=CCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.Cc1ccc(cc1)S(=O)(=O)[O-]", "13a": "C1CC2CCCC(C1)B2CCCC[N+]1(Cc2ccc3OCOc3c2)CCN(CC1)c1ncccn1.Cc1ccc(cc1)S(=O)(=O)[O-]" };
  const got = await shown("draw", { lines: `piribedil + 11a (${P["11a"]}) -> 12a (${P["12a"]})\n12a -> 13a (${P["13a"]}), 9-BBN–H` }) as { structures: string[] };
  const want = await shown("draw", { lines: `piribedil + ${P["11a"]} (11a) -> ${P["12a"]} (12a)\n12a -> ${P["13a"]} (13a), 9-BBN–H` }) as { structures: string[] };
  assert.deepEqual(got.structures, want.structures);
  assert.deepEqual(got.structures.map((x) => x.split("=")[0]), ["11a", "12a", "13a", ""]);
  // A short SMILES in the bracket reads as a compound number (11a (CCO) is 11a renumbered CCO): with no compound 11a,
  // it is compound 11a, and the reply says so.
  let note = "";
  const short = await shown("draw", { lines: "11a (CCO) -> 12a (CC=O)" }, undefined, (r) => (note = r.content[1]?.text)) as { structures: string[] };
  assert.deepEqual(short.structures, (await shown("draw", { lines: "CCO (11a) -> CC=O (12a)" }) as { structures: string[] }).structures);
  assert.equal(note, "Read 11a (CCO) as compound 11a, and 1 more the same way.");
  const kept = await shown("draw", { lines: "CCO (5) -> CC=O (6), PCC\n5 (CCCCCCCCCCCCCCCC) -> CCOC (7), NaH, MeI" }) as { text: string[] };
  assert.ok(kept.text.includes("(CCCCCCCCCCCCCCCC)"), JSON.stringify(kept));
}
// The call's other arguments go with the lines; kind is refused when it is not what the lines draw.
assert.deepEqual(fromLines({ lines: "A -> B", below: "s3", picture: true }), { op: "reaction", args: { start: A, steps: [{ products: [B] }], below: "s3", picture: true } });
assert.match(String(fromLines({ lines: "A -> B", kind: "cycle" })), /kind does not go with lines, which draw a reaction/);
assert.deepEqual(fromLines({ lines: "A -> B", kind: "reaction" }), { op: "reaction", args: { start: A, steps: [{ products: [B] }] } });
// Several drawings take what the reply is to have, and nothing that places one drawing.
assert.deepEqual(fromLines({ lines: "# S\nA -> B", picture: true }), { op: "route", args: { schemes: [{ title: "S", start: A, steps: [{ products: [B] }] }], picture: true } });
// A route (a titled scheme, or one reaction with a step label) is one drawing that Octet places itself.
assert.match(String(fromLines({ lines: "# S\nA -> B", columns: 2 })), /^columns does not go with a route \(lines with a # title, a step label or more than one scheme\): Octet places it below what is drawn\. Leave columns out$/);
assert.match(String(fromLines({ lines: "A -> B, (a) NaOH", at: [0, 0] })), /^at does not go with a route/);
assert.match(String(fromLines({ lines: "A -> B\nC (1)", at: [0, 0] })), /^at goes with one drawing, and these lines make 2: draw them in separate calls, or leave at out$/);

// ---- Speed, and hostile text ----

// The largest job (the taxol route, 20 lines of up to 230 characters) many times: far under a millisecond a line
// (about 0.05 ms with nothing else running).
{
  const text = NOTES["taxol-route"], n = text.split("\n").length, t = performance.now();
  for (let k = 0; k < 200; k++) fromLines({ lines: text });
  const ms = (performance.now() - t) / 200 / n;
  console.log(`Reading the taxol route: ${(ms * 1000).toFixed(1)} µs a line.`);
  assert.ok(ms < 0.25, `${ms} ms a line`);
}
// Each is refused, or read, in under a second (about 0.2 s with nothing else running), with no crash.
for (const [what, text, want] of [
  ["a million characters", "A -> B, ".repeat(125_000), /over 100000/],
  ["deep brackets", `${"(".repeat(49_000)}A${")".repeat(49_000)} -> B`, /./],
  ["unclosed brackets", `A -> ${"(".repeat(99_000)}`, /not closed/],
  ["stray closing brackets", `A -> B, ${"a) ".repeat(30_000)}`, /./],
  ["many arrows", "A -> ".repeat(19_000) + "B", /./],
  ["many ranges", `A -> B, ${"−78 → 25 °C, ".repeat(7_000)}`, /./],
  ["many separators", `A -> B${", ;".repeat(30_000)}`, /./],
  ["many plus signs", `${"A + ".repeat(24_000)}B -> C`, /./],
  ["many numbers", `A -> B ${"(1) ".repeat(24_000)}`, /./],
  ["a lone surrogate", "A -> B\ud800C", /U\+D800/],
  ["a lone low surrogate", "\udc00A -> B", /U\+DC00/],
  ["control characters", "A -> B\u0000\u001b", /U\+0000/],
  ["many lines", "A -> B\n".repeat(14_000), /./],
  ["many asides", `${"A +B -C ".repeat(12_000)}-> D`, /./],
  ["many colons", `{R}C${": R=Me;".repeat(14_000)}`, /./],
  ["many lone lines", "X (1)\n".repeat(14_000) + "-> Y", /./],
] as [string, string, RegExp][]) {
  const t = performance.now(), got = fromLines({ lines: text }), ms = performance.now() - t;
  assert.match(typeof got === "string" ? got : JSON.stringify(got).slice(0, 100), want, what);
  assert.ok(ms < 1000, `${what}: ${Math.round(ms)} ms`);
}
