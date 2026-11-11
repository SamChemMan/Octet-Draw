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
const { callOf, fromLines, NOTATION } = await import("./notation.ts");
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
// Its own example draws, with no refusal: 3 and 4 by InChIKey, the second from the first.
{
  const r = fromLines({ lines: NOTATION.split("\n").slice(1, 3).join("\n") });
  assert.ok(typeof r !== "string", String(r));
  const s = await shown(...callOf(r));
  assert.ok("structures" in s, JSON.stringify(s));
  assert.ok(s.structures.includes("3=RHDYQUZYHZWTCI-UHFFFAOYSA-N") && s.structures.includes("4=YXVFYQXJAXKLAK-UHFFFAOYSA-N"), s.structures.join(" "));
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
// formula, and the check, in under 1,200 characters (the longest is printed).
{
  let k = 0, most = [0, ""] as [number, string];
  // (The taxol route on a paper page runs past it: its reply then names each of the 20 ids past the page and says
  // what to do, 1,500 characters. On Quick start, a user's default, it has no page.)
  for (const [id, text] of Object.entries(NOTES)) {
    let r: any;
    assert.deepEqual(await shown("draw", { lines: text, brief: id === "taxol-route" ? "quick" : "paper" }, `one-${++k}`, (x) => (r = x)), wanted.get(id), id);
    // (A job the JSON draws nothing of, as Octet cannot read a name, is refused the same.)
    if (!r) continue;
    const said = r.content.map((c: { text: string }) => c.text).join("\n"), sc = r.structuredContent;
    assert.ok(said.length < 1200, `${id}: ${said.length} characters\n${said}`);
    assert.equal(sc.compounds.length, (await call("read", {}, `one-${k}`)).structuredContent.structures.length, `${id}: ${said}`);
    assert.ok(sc.compounds.every((c: string) => /^(?:\S+ )?s\d+ [A-Z]/.test(c)) && sc.check !== undefined && !("boxes" in sc), `${id}: ${said}`);
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
  ["A, B -> C", /reads two ways: starting materials \(write them with \+\), or a compound and its conditions/],
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
];
for (const [text, want] of HARD) {
  const got = fromLines({ lines: text });
  if (want instanceof RegExp) assert.match(String(got), want, text);
  else assert.deepEqual(got, want, text);
}
// The call's other arguments go with the lines; kind is refused when it is not what the lines draw.
assert.deepEqual(fromLines({ lines: "A -> B", below: "s3", picture: true }), { op: "reaction", args: { start: A, steps: [{ products: [B] }], below: "s3", picture: true } });
assert.match(String(fromLines({ lines: "A -> B", kind: "cycle" })), /kind does not go with lines, which draw a reaction/);
assert.deepEqual(fromLines({ lines: "A -> B", kind: "reaction" }), { op: "reaction", args: { start: A, steps: [{ products: [B] }] } });
// Several drawings take what the reply is to have, and nothing that places one drawing.
assert.deepEqual(fromLines({ lines: "# S\nA -> B", picture: true }), { op: "route", args: { schemes: [{ title: "S", start: A, steps: [{ products: [B] }] }], picture: true } });
assert.match(String(fromLines({ lines: "# S\nA -> B", columns: 2 })), /columns goes with one drawing, and these lines make 2: draw them in separate calls, or leave columns out/);

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
] as [string, string, RegExp][]) {
  const t = performance.now(), got = fromLines({ lines: text }), ms = performance.now() - t;
  assert.match(typeof got === "string" ? got : JSON.stringify(got).slice(0, 100), want, what);
  assert.ok(ms < 1000, `${what}: ${Math.round(ms)} ms`);
}
