// Run: node src/mcp.check.ts. AI apps (decision 0021): the MCP protocol, the check every tool call goes through, and
// each tool against an editor stand-in built on Octet's own chemistry (Indigo, edit.ts, findReaction, the warnings).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { analyse, expandLabels, mapReaction, parseStructure, ready, toMolfile, toSmiles } = await import("./chem.ts");
const { problems } = await import("./check.ts");
const { DEFAULT_STYLE, pageSize } = await import("./docstyle.ts");
const { EMPTY, fragments } = await import("./edit.ts");
const { findReaction } = await import("./reaction.ts");
const { formulaWeight, parseAmount } = await import("./stoich.ts");
const { handle, MAX_TEXT, resetIds, TOOL_NAMES, TOOL_TABLE } = await import("./mcp.ts");
type Mol = import("./render.ts").Mol;
type Host = import("./mcp.ts").Host;
type Box = import("./render.ts").Box;
await ready;

// The editor's stand-in: a drawing, its undo steps, its selection and what it told the user.
const NAMES: Record<string, string> = { "acetic acid": "CC(=O)O", ethanol: "CCO", "ethyl acetate": "CCOC(C)=O", water: "O", benzene: "c1ccccc1", toluene: "Cc1ccccc1", phenol: "Oc1ccccc1" };
let m: Mol = EMPTY, steps: string[] = [], open = 0, said: string[] = [], picked = { atoms: [] as number[], items: [] as number[] }, experiment = false, commands: string[] = [], shown: Box | undefined;
const ink = (atoms: number[]): Box | undefined => {
  const ps = atoms.map((i) => m.atoms[i]?.location).filter(Boolean);
  return ps.length ? [Math.min(...ps.map((p) => p[0])) - 0.3, Math.min(...ps.map((p) => p[1])) - 0.3, Math.max(...ps.map((p) => p[0])) + 0.3, Math.max(...ps.map((p) => p[1])) + 0.3] : undefined;
};
// (Text kept on an arrow is placed as the renderer draws it, which the stand-in does not do: it has no box here.)
const captionBox = (id: number): Box | undefined => { const c = m.captions?.find((x) => x.id === id); return c && !c.on ? [c.x - c.text.length * 0.2, c.y - 0.3, c.x + c.text.length * 0.2, c.y + 0.4] : undefined; };
const host: Host = {
  doc: () => m, style: () => m.style ?? DEFAULT_STYLE, ready: async () => {},
  structure: (t) => { const s = NAMES[t] ?? t; try { const x = parseStructure(s); return x.atoms.length ? x : undefined; } catch { return undefined; } },
  tidy: (x) => x, named: (t) => t in NAMES,
  begin: (step) => { steps.push(step); open++; }, end: (made) => { open--; shown = made; },
  set: (x) => { assert.equal(open, 1, "a change outside its undo step"); return (m = x); }, settle: async () => {},
  cleanReactions: (ids) => ids.size, tidyCycle: () => {}, command: (id) => { commands.push(id); return id === "undo" || id.startsWith("new_") || id.startsWith("arrange_") || id === "centre_page"; }, newWindow: async () => undefined,
  act: (id) => { commands.push(id); return true; }, map: (r, p) => mapReaction(r, p),
  reaction: (id) => findReaction(m, id, m.arrows ?? [], ink, captionBox), ink, textBox: captionBox, labelBox: (i) => { const a = m.atoms[i]; if (!a || (!a.text && a.label === "C")) return undefined; const w = (a.text ?? a.label).length * 0.3; return [a.location[0] - 0.2, a.location[1] - 0.3, a.location[0] - 0.2 + w, a.location[1] + 0.3]; }, tables: () => [], fileText: (f) => (f === "smiles" ? toSmiles(expandLabels(m)) : undefined), inchi: () => ({}), reagent: (t) => { const w = formulaWeight(t); return w ? { formula: t, weight: w } : undefined; },
  problems: () => problems(m), smiles: (x) => toSmiles(expandLabels(x)), formula: (x) => analyse(x)?.[0]?.formula, name: () => undefined,
  picture: async () => "iVBOR", centre: () => [0, 0], restyle: (s) => { m = { ...m, style: s }; }, experiment: () => experiment,
  said: (t) => said.push(t), working: () => {}, selection: () => picked, select: (atoms, items) => { picked = { atoms, items }; },
  file: (t) => host.structure(t), export: () => true,
  window: () => ({ id: "draw-1", name: "Untitled" }), windows: async () => [], target: async () => true,
};
let n = 0;
const send = async (method: string, params?: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }), () => host, "1.2.0", { client: "Test", session: "s-1" }));
// A value against a tool's outputSchema (the parts of JSON Schema the tools use).
const fits = (s: any, v: any): boolean => !s?.type || (s.type === "object" ? !!v && typeof v === "object" && !Array.isArray(v) && (s.required ?? []).every((k: string) => v[k] !== undefined) && Object.entries(s.properties ?? {}).every(([k, p]) => v[k] === undefined || fits(p, v[k])) : s.type === "array" ? Array.isArray(v) && v.every((x) => fits(s.items, x)) : typeof v === s.type);
// The most characters a reply has when nothing more was asked for (no detail: full, atoms, picture or file): test plan P2.
const MOST = 20_000;
// Every call in these checks: its structuredContent fits the tool's outputSchema (the specification's MUST), and a
// default reply is at most MOST characters.
const call = async (name: string, args: any) => {
  const asked = JSON.stringify(args ?? null), out = (await send("tools/call", { name, arguments: args })).result as { content: { type: string; text?: string; data?: string }[]; isError?: true; structuredContent?: any };
  if (out.structuredContent) assert.ok(fits(TOOL_TABLE.find((t) => t.name === name)!.outputSchema, out.structuredContent), `${name}: structuredContent does not fit its outputSchema: ${JSON.stringify(out.structuredContent).slice(0, 300)}`);
  const size = out.content.reduce((k, c) => k + (c.text?.length ?? 0), 0);
  if (name !== "get_file" && !/"detail":"full"|"atoms":true/i.test(asked)) assert.ok(size <= MOST, `${name}: a default reply of ${size} characters`);
  return out;
};
const text = (r: { content: { text?: string }[] }) => r.content[0].text!;
const fresh = () => { m = EMPTY; steps = []; said = []; picked = { atoms: [], items: [] }; experiment = false; };
// The drawing in full (a read's default is the summary, checked on its own below).
const read = async () => JSON.parse(text(await call("read_drawing", { detail: "full" })));

// The protocol: initialize answers the version asked for (or the newest), with Octet's instructions.
let r = await send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } });
assert.equal(r.result.protocolVersion, "2025-06-18");
assert.equal(r.result.serverInfo.name, "octet-draw");
assert.match(r.result.instructions, /draw_reaction/);
assert.equal((await send("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion, "2025-11-25");
assert.deepEqual((await send("ping")).result, {});
// Every tool is listed, each with a closed object schema and hints.
const tools = (await send("tools/list")).result.tools as { name: string; inputSchema: { type: string; additionalProperties: boolean }; annotations: { readOnlyHint: boolean } }[];
assert.deepEqual(tools.map((t) => t.name), TOOL_NAMES);
for (const t of tools) assert.ok(t.inputSchema.type === "object" && t.inputSchema.additionalProperties === false, t.name);
assert.ok(tools.find((t) => t.name === "read_drawing")!.annotations.readOnlyHint);
// The compound is listed once in each tool that takes compounds ($defs), however many places take one, and takes from
// and changes (compound.ts); every reference in a tool's schema has its definition there. The same for text that can
// be runs (rich, in a figure) and an arrow's end (place): a tool lists the pieces it refers to, and no other.
for (const t of tools as unknown as { name: string; inputSchema: { $defs?: Record<string, { properties: Record<string, unknown> }> } }[]) {
  const json = JSON.stringify(t.inputSchema), all = [...json.matchAll(/"\$ref":"([^"]*)"/g)].map((x) => x[1]), refs = all.filter((x) => x === "#/$defs/compound").length;
  assert.equal(refs, { draw_structures: 1, draw_reaction: 2, draw_cycle: 1 }[t.name] ?? 0, t.name);
  assert.equal(!!t.inputSchema.$defs, all.length > 0, t.name);
  if (refs) assert.ok(["text", "molecule", "labels", "from", "changes", "number", "like"].every((k) => k in t.inputSchema.$defs!.compound.properties), t.name);
  assert.deepEqual(Object.keys(t.inputSchema.$defs ?? {}).map((k) => `#/$defs/${k}`).sort(), [...new Set(all)].sort(), t.name);
  assert.deepEqual([all.filter((x) => x === "#/$defs/rich").length, all.filter((x) => x === "#/$defs/place").length], { draw_figure: [4, 0], add_arrow: [0, 2] }[t.name] ?? [0, 0], t.name);
}
assert.ok(!tools.find((t) => t.name === "draw_reaction")!.annotations.readOnlyHint);
// The tool table (D11): names of 64 characters at most from A-Z a-z 0-9 _ - ., a title, a closed input schema, an
// output schema, all four hints said outright and openWorldHint false; a read-only tool is never destructive.
for (const t of tools as unknown as { name: string; title: string; inputSchema: { additionalProperties: boolean }; outputSchema?: object; annotations: Record<string, boolean> }[]) {
  assert.match(t.name, /^[A-Za-z0-9_.-]{1,64}$/);
  assert.ok(t.title && t.outputSchema, t.name);
  for (const k of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) assert.equal(typeof t.annotations[k], "boolean", `${t.name} ${k}`);
  assert.equal(t.annotations.openWorldHint, false);
  assert.ok(!(t.annotations.readOnlyHint && t.annotations.destructiveHint), t.name);
}
assert.ok(TOOL_TABLE.every((t) => t.hints.readOnly || t.done), "every tool that changes the drawing tells the user");
assert.equal(new Set(TOOL_NAMES).size, TOOL_NAMES.length);
// Bad messages are refused with JSON-RPC's codes.
assert.equal(JSON.parse(await handle("{nope", () => host, "1", { client: "Test" })).error.code, -32700);
assert.equal(JSON.parse(await handle(JSON.stringify({ id: 1, method: "ping" }), () => host, "1", { client: "Test" })).error.code, -32600);
assert.equal((await send("sampling/createMessage")).error.code, -32601);
assert.equal((await send("tools/call", { name: "rm_rf", arguments: {} })).error.code, -32602);

// The check: a call with wrong arguments changes nothing and says what is wrong.
fresh();
const refused: [string, unknown, RegExp][] = [
  ["draw_reaction", { start: [{ text: "ethanol" }] }, /steps is missing/],
  ["draw_reaction", { start: [{ text: "ethanol" }], steps: [{ products: [{ text: "water" }], above: ["x".repeat(MAX_TEXT + 1)] }] }, /steps\[0\]\.above\[0\]: longer than 300/],
  ["draw_reaction", { start: [], steps: [{ products: [{ text: "water" }] }] }, /start: fewer than 1/],
  ["draw_reaction", { start: [{ text: "ethanol", colour: "red" }], steps: [] }, /colour is not an argument/],
  ["draw_structures", { structures: [{ text: 5 }] }, /structures\[0\]\.text: not text/],
  ["draw_structures", { structures: [{ from: 5 }] }, /structures\[0\]\.from: not text/],
  ["draw_reaction", { start: [{ text: "ethanol" }], steps: [{ products: [{ from: "previous", changes: { swap: { OH: "OAc" } } }] }] }, /steps\[0\]\.products\[0\]\.changes: not a list/],
  ["draw_cycle", { intermediates: [{ text: "benzene" }, { from: "previous", changes: ["OAc"] }] }, /intermediates\[1\]\.changes\[0\]: not an object/],
  ["replace_structure", { structure: "s1", changes: Array(21).fill({}) }, /changes: more than 20 items/],
  ["draw_structures", { structures: [{ text: "water" }], columns: 0 }, /columns: not between 1 and 20/],
  ["draw_structures", { structures: [{ text: "water" }], columns: 1.5 }, /columns: not a integer/],
  ["draw_structures", { structures: Array(201).fill({ text: "water" }) }, /more than 200/],
  ["draw_cycle", { intermediates: [{ text: "benzene" }] }, /fewer than 2/],
  ["run_command", { command: "quit" }, /no command quit/],
  ["set_style", { preset: "Comic Sans" }, /not one of/],
  ["read_drawing", [], /not an object/],
  // Through a piece a tool lists once (rich, place), a refusal names the place and the forms as before.
  ["draw_figure", { panels: [{ title: 5, rows: [[{ text: "and" }]] }] }, /panels\[0\]\.title: not text, or runs/],
  ["draw_figure", { panels: [{ rows: [[{ structure: "benzene", caption: [{ bold: true }] }]] }] }, /panels\[0\]\.rows\[0\]\[0\]\.caption: not text, or runs/],
  ["add_arrow", { kind: "reaction", from: 5, to: [0, 0] }, /from: not an id \(s3, t5, s3\.2\) or a point \[x, y\]/],
  // The look-alikes of the lenient readings (test plan R2): each has no meaning, or more than one, and stays refused.
  ["draw_structures", { structures: [{ text: "benzene", number: true }] }, /structures\[0\]\.number: not text/],
  ["draw_structures", { structures: [{ text: "benzene", number: [13] }] }, /structures\[0\]\.number: not text/],
  ["draw_structures", { structures: [{ text: "benzene", number: 1234567890123 }] }, /number: longer than 12/],
  ["draw_structures", { structures: [{ text: "benzene", number: "1 (paclitaxel) x" }] }, /number: longer than 12/],
  ["draw_structures", { structures: [{ text: "benzene", labels: [13] }] }, /labels\[0\]: not text/],
  ["draw_structures", {}, /structures is missing/],
  ["set_number", { structure: 13, number: "1" }, /structure: not text/],
  ["get_file", { format: "molfile" }, /format: not one of cdxml, mol, mol2000, sdf, rxn, smiles, inchi, cdx/],
  ["get_file", { format: "..mol" }, /format: not one of/],
  ["get_file", { format: "m ol" }, /format: not one of/],
  ["get_file", { format: "constructor" }, /format: not one of/],
  ["get_file", { format: 5 }, /format: not text/],
  ["get_file", {}, /format is missing/],
  ["read_drawing", { detail: "long" }, /detail: not one of summary, full/],
  ["new_drawing", { for: "book" }, /for: not one of paper, thesis, slides, poster, experiment, quick/],
  ["new_drawing", { for: null }, /for: not text/],
];
for (const [name, args, why] of refused) {
  const out = await call(name, args);
  assert.ok(out.isError, name);
  assert.match(text(out), why);
}
assert.equal(m, EMPTY);
assert.equal(steps.length, 0);

// draw_reaction: the esterification, one undo step, conditions kept on the arrow, the number bold under its product.
fresh();
let out = await call("draw_reaction", { start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ above: ["H2SO4 (cat.)"], below: ["reflux"], products: [{ text: "ethyl acetate", number: "1" }, { text: "water" }] }] });
assert.ok(!out.isError, text(out));
assert.equal(text(out).split("\n")[0], "Drew the reaction. Octet laid it out with Clean Up Reaction. One undo step.");
assert.equal(steps.length, 1);
assert.equal(open, 0);
assert.deepEqual(said, ["Test drew a reaction."]);
assert.equal(fragments(m).length, 4);
assert.equal(m.arrows?.length, 1);
const arrow = m.arrows![0].id;
assert.deepEqual(m.captions!.filter((c) => c.on?.arrow === arrow).map((c) => [c.text, c.on!.side]), [["H2SO4 (cat.)", "above"], ["reflux", "below"]]);
// Lines above an arrow read top to bottom as given: the last is nearest the arrow (the first caption).
fresh();
await call("draw_reaction", { start: [{ text: "ethanol" }], steps: [{ above: ["top", "middle", "bottom"], below: ["first", "second"], products: [{ text: "water" }] }] });
assert.deepEqual(m.captions!.filter((c) => c.on).map((c) => c.text), ["bottom", "middle", "top", "first", "second"]);
assert.deepEqual((await read()).reactions[0].steps[0].above, ["top", "middle", "bottom"]);
fresh();
await call("draw_reaction", { start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ above: ["H2SO4 (cat.)"], below: ["reflux"], products: [{ text: "ethyl acetate", number: "1" }, { text: "water" }] }] });
const one = m.captions!.find((c) => c.text === "1")!;
assert.ok(one.bold && one.under?.length === 6);
assert.equal(m.captions!.filter((c) => c.text === "+").length, 2);
// read_drawing reads it back: SMILES, formula, number, the reaction's parts and conditions, no warnings.
let d = await read();
assert.deepEqual(d.structures.map((s: { formula: string }) => s.formula), ["C2H4O2", "C2H6O", "C4H8O2", "H2O"]);
assert.equal(d.structures[2].number, "1");
assert.equal(d.reactions.length, 1);
assert.deepEqual(d.reactions[0].steps[0].before, [d.structures[0].id, d.structures[1].id]);
assert.deepEqual(d.reactions[0].steps[0].above, ["H2SO4 (cat.)"]);
assert.deepEqual(d.reactions[0].products, [d.structures[2].id, d.structures[3].id]);
assert.deepEqual(d.text, []);
assert.deepEqual(d.warnings, []);
// A picture comes as a PNG.
out = await call("read_drawing", { picture: true });
assert.deepEqual(out.content.map((c) => c.type), ["text", "image"]);
// A second job goes below the first.
const low = Math.min(...m.atoms.map((a) => a.location[1]));
await call("draw_structures", { structures: [{ text: "benzene" }] });
assert.ok(m.atoms[m.atoms.length - 1].location[1] < low - 2);
assert.equal(steps.length, 2);

// A name Octet cannot read: nothing is drawn, and the result says which.
fresh();
out = await call("draw_reaction", { start: [{ text: "ethanol" }], steps: [{ products: [{ text: "unobtainium" }] }] });
assert.ok(out.isError);
assert.match(text(out), /cannot read "unobtainium"/);
assert.equal(m.atoms.length, 0);
assert.deepEqual(said, []);

// Control characters are taken out of text.
fresh();
await call("draw_reaction", { start: [{ text: "ethanol" }], steps: [{ above: ["heat\u0007 \u001b[2J"], products: [{ text: "water" }] }] });
assert.equal(m.captions!.find((c) => c.on)!.text, "heat [2J");

// draw_structures: a numbered grid, four across for seven.
fresh();
const seven = ["benzene", "toluene", "phenol", "water", "ethanol", "CCN", "CCCl"].map((t, k) => ({ text: t, number: `S${k + 1}` }));
out = await call("draw_structures", { structures: seven });
assert.match(text(out), /Drew 7 structures in 2 rows of 4/);
const rows = new Set(fragments(m).map((f) => { const ys = f.map((i) => m.atoms[i].location[1]); return Math.round(Math.min(...ys) + Math.max(...ys)); }));
assert.equal(rows.size, 2);
assert.deepEqual(m.captions!.map((c) => c.text), seven.map((s) => s.number));

// draw_cycle: three intermediates on the circle, the centre text, side arrows in and out, step names.
fresh();
out = await call("draw_cycle", { intermediates: [{ text: "benzene" }, { text: "toluene" }, { text: "phenol" }], centre: "Pd(0)", steps: [{ step: 0, in: "PhBr", name: "OA" }, { step: 1, in: "ArB(OH)2", out: "B(OH)3" }, { step: 2, out: "Ph–Ar" }, { step: 7, in: "nothing" }] });
assert.ok(!out.isError, text(out));
const c = m.cycles![0];
assert.equal(c.nodes.length, 3);
assert.ok(c.clockwise);
assert.deepEqual(c.branches!.map((b) => [b.step, !!b.in, !!b.out]), [[0, true, false], [1, true, true], [2, false, true]]);
assert.deepEqual(m.captions!.filter((x) => x.cycle).map((x) => [x.text, x.cycle!.side]), [["Pd(0)", "centre"], ["PhBr", "in"], ["OA", "name"], ["ArB(OH)2", "in"], ["B(OH)3", "out"], ["Ph–Ar", "out"]]);
d = await read();
assert.deepEqual(d.cycles[0].intermediates, d.structures.map((s: { id: string }) => s.id));
assert.equal(d.cycles[0].centre, "Pd(0)");
assert.deepEqual(d.cycles[0].names.map((x: { text: string }) => x.text), ["OA"]);

// replace_structure keeps the place and the number; delete takes structures and text away; select picks them.
fresh();
await call("draw_structures", { structures: [{ text: "benzene", number: "2" }, { text: "water" }] });
d = await read();
out = await call("replace_structure", { structure: d.structures[0].id, text: "toluene" });
assert.ok(!out.isError, text(out));
d = await read();
assert.deepEqual(d.structures.map((s: { formula: string; number?: string }) => [s.formula, s.number]), [["H2O", undefined], ["C7H8", "2"]]);
assert.ok((await call("replace_structure", { structure: "s999", text: "water" })).isError);
out = await call("select", { ids: [d.structures[1].id] });
assert.deepEqual((await read()).selected, [d.structures[1].id]);
assert.ok((await call("select", { ids: ["t4242"] })).isError);
out = await call("delete", { ids: [d.structures[0].id] });
assert.deepEqual((await read()).structures.map((s: { formula: string }) => s.formula), ["C7H8"]);
assert.ok((await call("delete", { ids: ["nothing"] })).isError);

// Deleting a reaction's arrow takes its conditions; deleting a structure takes its number.
fresh();
await call("draw_reaction", { start: [{ text: "ethanol", number: "1" }], steps: [{ above: ["H2SO4"], below: ["heat"], products: [{ text: "water", number: "1" }] }] });
d = await read();
assert.match(d.warnings.map((w: { message: string }) => w.message).join(), /Compound number 1 is on more than one structure/);
await call("delete", { ids: [d.arrows[0].id, d.structures[0].id] });
assert.deepEqual(m.captions!.filter((x) => x.on || x.text === "1").map((x) => x.text), ["1"]);

// A warning reaches the AI app: carbon with five bonds, in the drawing's result and in read_drawing.
fresh();
out = await call("draw_structures", { structures: [{ text: "CC(C)(C)(C)C" }] });
assert.match(out.structuredContent.warnings.join(), /(five|5) bonds/i);
assert.match(text(out), /"warnings":\[".*(five|5) bonds/i);
assert.match((await read()).warnings[0].message, /five bonds|5 bonds/i);

// Deleting a reaction's structures takes the plus sign between them.
fresh();
await call("draw_reaction", { start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ products: [{ text: "water" }] }] });
d = await read();
await call("delete", { ids: [d.structures[0].id, d.structures[1].id] });
assert.ok(!m.captions?.some((c) => c.text === "+"));

// move shifts structures and their numbers; set_number numbers, renumbers and takes a number away.
fresh();
await call("draw_structures", { structures: [{ text: "benzene", number: "1" }, { text: "water" }] });
d = await read();
const x0 = m.atoms[0].location[0];
await call("move", { ids: [d.structures[0].id], dx: 2, dy: -1 });
assert.ok(Math.abs(m.atoms[0].location[0] - x0 - 2) < 1e-9);
await call("set_number", { structure: d.structures[0].id, number: "7" });
await call("set_number", { structure: d.structures[1].id, number: "8" });
assert.deepEqual((await read()).structures.map((s: { number?: string }) => s.number), ["7", "8"]);
await call("set_number", { structure: d.structures[0].id, number: "" });
assert.deepEqual((await read()).structures.map((s: { number?: string }) => s.number), [undefined, "8"]);
assert.equal((await read()).drawing.id, "draw-1");

// Results (D9), with detail: full: structuredContent with the drawing, what was made, changed and deleted, and the
// names given.
fresh();
type Change = { drawing: { id: string }; made: string[]; changed: string[]; deleted: string[]; names?: { given: string; formula?: string }[]; warnings: string[] };
let sc = (await call("draw_structures", { structures: [{ text: "benzene", number: "1" }, { text: "water" }], detail: "full" }) as unknown as { structuredContent: Change }).structuredContent;
assert.equal(sc.drawing.id, "draw-1");
assert.equal(sc.made.filter((x) => x.startsWith("s")).length, 2);
assert.ok(sc.made.some((x) => x.startsWith("t")), "the number is made too");
assert.deepEqual(sc.names!.map((x) => [x.given, x.formula]), [["benzene", "C6H6"], ["water", "H2O"]]);
d = await read();
const [benzene, water] = d.structures.map((s: { id: string }) => s.id);
// A compound number is an id too (T6).
sc = (await call("delete", { ids: ["1"], detail: "full" }) as unknown as { structuredContent: Change }).structuredContent;
assert.ok(sc.deleted.includes(benzene) && !sc.deleted.includes(water), JSON.stringify(sc));
// Ids are never given again (D5): a new structure after a delete gets a new id, and the one left keeps its own.
sc = (await call("draw_structures", { structures: [{ text: "toluene" }] }) as unknown as { structuredContent: Change }).structuredContent;
assert.ok(!sc.made.includes(benzene));
assert.ok((await read()).structures.some((s: { id: string }) => s.id === water));
// read_drawing's own structuredContent is what its text says.
const rd = await call("read_drawing", {}) as unknown as { structuredContent: { structures: unknown[] }; content: { text: string }[] };
assert.deepEqual(rd.structuredContent, JSON.parse(rd.content[0].text));

// A session whose drawing has closed: every tool but list_drawings, use_drawing and new_drawing says so.
const lost = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/call", params: { name, arguments: args } }), () => host, "1", { client: "Test", session: "s-1", lost: "draw-7" })).result;
assert.match((await lost("read_drawing", {})).content[0].text, /draw-7\) is closed\. Call list_drawings/);
assert.ok(!(await lost("list_drawings", {})).isError);

// fill_experiment: refused off an experiment page; on one, the details and the grid's amounts by the grid's keys.
fresh();
assert.ok((await call("fill_experiment", { details: { title: "Ethyl acetate" } })).isError);
experiment = true;
await call("draw_reaction", { start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ above: ["H2SO4"], products: [{ text: "ethyl acetate", number: "1" }] }] });
// No reagent table yet: fill_experiment makes the reaction's.
out = await call("fill_experiment", { details: { title: "Ethyl acetate", solvent: "none" }, amounts: [{ of: "acetic acid", mass: "6.0 g", limiting: true }, { of: "ethanol", equiv: "3" }, { of: "1", measured: "7.9 g" }, { of: "H2SO4", volume: "0.1 mL" }, { of: "argon", mass: "1 g" }] });
assert.ok(!out.isError, text(out));
assert.match(text(out), /"argon" is not in the reaction/);
assert.doesNotMatch(text(out), /"H2SO4" has no column/, "H2SO4 has its column");
assert.match(text(out), /cannot use the volume of H2SO4 without a density/, "a volume with no density is said, as it gives no moles");
const grid = m.grids![0];
assert.deepEqual(grid.typed["r:C2H4O2"], { mass: parseAmount("6.0 g", "mass") });
assert.deepEqual(grid.typed["r:C2H6O"], { equiv: 3 });
assert.deepEqual(grid.typed["p:C4H8O2"], { measured: parseAmount("7.9 g", "measured") });
assert.deepEqual(grid.typed['r:"H2SO4"'], { volume: parseAmount("0.1 mL", "volume") });
assert.equal(grid.limiting, "r:C2H4O2");
assert.deepEqual((await read()).experiment, { title: "Ethyl acetate", solvent: "none" });

// A text reagent Octet reads no formula from has no column in the table: fill_experiment says so and types nothing.
fresh();
experiment = true;
await call("draw_reaction", { start: [{ text: "acetic acid" }], steps: [{ above: ["H2SO4 (conc.)"], products: [{ text: "ethyl acetate" }] }] });
out = await call("fill_experiment", { amounts: [{ of: "H2SO4 (conc.)", volume: "0.1 mL" }] });
assert.match(text(out), /"H2SO4 \(conc\.\)" has no column in the table/);
assert.deepEqual(m.grids![0].typed, {});

// Structured conditions (3b): drawn as text in the usual order, kept as data, read back as fields with formulas.
fresh();
experiment = false;
out = await call("draw_reaction", { start: [{ text: "benzene" }], steps: [{ reagents: ["MeNO2", "NH4OAc"], catalysts: ["CuI (10 mol%)"], solvents: ["AcOH"], temperature: "reflux", time: "4 h", atmosphere: "N2", yield: "78%", below: ["then workup"], products: [{ text: "toluene" }] }] });
assert.ok(!out.isError, text(out));
const onArrow = (side: string) => m.captions!.filter((c) => c.on?.side === side).map((c) => c.text);
assert.deepEqual(onArrow("above"), ["CuI (10 mol%)", "MeNO2, NH4OAc"], "reagents nearest the top, catalysts under them");
assert.deepEqual(onArrow("below"), ["AcOH, reflux, 4 h, N2", "then workup", "78%"]);
let fields = (await read()).reactions[0].steps[0].fields;
assert.deepEqual(fields.reagents.map((x: { text: string; resolved: boolean }) => [x.text, x.resolved]), [["MeNO2", false], ["NH4OAc", false]]);
assert.deepEqual([fields.catalysts[0].text, fields.solvents[0].text, fields.temperature, fields.time, fields.atmosphere, fields.yield], ["CuI (10 mol%)", "AcOH", "reflux", "4 h", "N2", "78%"]);
// Lines in stages over the arrow read back top to bottom; a line edited since it was drawn is read as its text.
fresh();
await call("draw_reaction", { start: [{ text: "benzene" }], steps: [{ reagents: ["Mg"], above: ["1. PhCHO, 0 °C", "2. NH4Cl"], solvents: ["THF"], temperature: "rt", products: [{ text: "toluene" }] }] });
assert.deepEqual((await read()).reactions[0].steps[0].fields.notes, ["1. PhCHO, 0 °C", "2. NH4Cl"]);
const line = m.captions!.find((c) => c.text === "THF, rt")!;
await call("edit", { ids: [`t${line.id}`], text: "Et2O, reflux" });
fields = (await read()).reactions[0].steps[0].fields;
assert.deepEqual([fields.solvents?.[0]?.text, fields.temperature], ["Et2O", "reflux"], "the edited line, not the line as drawn");
// Text a user typed reads as fields too.
fresh();
await call("draw_reaction", { start: [{ text: "benzene" }], steps: [{ above: ["H2SO4, Pd(OAc)2 (5 mol%)"], below: ["THF, -78 °C to rt, overnight", "91%"], products: [{ text: "toluene" }] }] });
fields = (await read()).reactions[0].steps[0].fields;
assert.deepEqual(fields.reagents.map((x: { text: string; formula?: string }) => [x.text, x.formula]), [["H2SO4", "H2SO4"]]);
assert.deepEqual([fields.catalysts[0].text, fields.solvents[0].text, fields.temperature, fields.time, fields.yield], ["Pd(OAc)2 (5 mol%)", "THF", "-78 °C to rt", "overnight", "91%"]);

// arrange runs Octet's Align and Distribute on the ids, then puts the selection back; get_file gives file text.
fresh();
await call("draw_structures", { structures: [{ text: "benzene", number: "1" }, { text: "water", number: "2" }] });
commands = [];
out = await call("arrange", { ids: ["1", "2"], how: "top" });
assert.ok(!out.isError, text(out));
assert.deepEqual(commands, ["arrange_top"]);
assert.deepEqual(picked, { atoms: [], items: [] });
assert.ok((await call("arrange", { ids: ["1"], how: "left" })).isError, "one thing does not line up");
out = await call("get_file", { format: "smiles" });
assert.equal((out as unknown as { structuredContent: { text: string } }).structuredContent.text, text(out));
assert.equal(text(out), "C1C=CC=CC=1.O", "benzene and water, as Octet writes SMILES");
// read_drawing: each structure's source, and InChI where the host gives it.
d = await read();
assert.deepEqual(d.structures.map((s: { source?: { given: string; named: boolean } }) => s.source), [{ given: "benzene", named: true }, { given: "water", named: true }]);

// Same input, same output (3e): the same calls on a new drawing give the same reading, ids included.
const run = async () => { fresh(); resetIds(); await call("draw_reaction", { start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ reagents: ["H2SO4"], temperature: "reflux", products: [{ text: "ethyl acetate", number: "1" }] }] }); return JSON.stringify(await read()); };
assert.equal(await run(), await run());

// edit (3f): each property on every id it fits; what does not fit is said.
fresh();
await call("draw_structures", { structures: [{ text: "CCN", number: "4" }] });
d = (await call("read_drawing", { atoms: true }) as unknown as { structuredContent: { structures: { id: string; atoms: { id: string; label: string }[]; bonds: { id: string; kind: string }[] }[] } }).structuredContent;
const nAtom = d.structures[0].atoms.find((x) => x.label === "N")!, cc = d.structures[0].bonds.find((b) => b.id.endsWith("1-2"))!;
assert.equal(cc.kind, "single");
out = await call("edit", { ids: [nAtom.id], charge: 1, isotope: 15, lone_pairs: 1, colour: "#2F6FED" });
assert.ok(!out.isError, text(out));
const N = m.atoms.find((x) => x.label === "N")!;
assert.deepEqual([N.charge, N.isotope, N.pairs, N.colour], [1, 15, 1, "#2F6FED"]);
await call("edit", { ids: [cc.id], bond: "wedge" });
assert.equal(m.bonds.find((b) => b.stereo === 1)?.type, 1);
out = await call("edit", { ids: [nAtom.id, cc.id], charge: 0, bond: "double" });
assert.match(text(out), /Not changed: .*takes no bond.*takes no charge/);
assert.equal(m.atoms.find((x) => x.label === "N")!.charge, undefined);
assert.ok((await call("edit", { ids: [nAtom.id], colour: "blue" })).isError, "colour is #rrggbb");
assert.ok((await call("edit", { ids: ["s99.1"], charge: 1 })).isError);
// A structure by its number: a colour on all its atoms and bonds; text and arrows take their own properties.
await call("edit", { ids: ["4"], colour: "#12A594" });
assert.ok(m.atoms.every((x) => x.colour === "#12A594") && m.bonds.every((b) => b.colour === "#12A594"));
fresh();
await call("draw_reaction", { start: [{ text: "ethanol" }], steps: [{ reagents: ["PCC"], products: [{ text: "acetic acid" }] }] });
const arrowId = `a${m.arrows![0].id}`, cap = `t${m.captions!.find((c) => c.on)!.id}`;
out = await call("edit", { ids: [arrowId, cap], style: "dashed", end: "left", bold: true });
assert.match(text(out), new RegExp(`${arrowId} takes no bold.*${cap} takes no style, end`));
assert.deepEqual([m.arrows![0].style, m.arrows![0].end, m.captions!.find((c) => c.on)!.bold], ["dashed", "left", true]);

// add_arrow: a curved arrow from a lone pair to a bond; add_shape: brackets round a structure with a mark.
d = (await call("read_drawing", { atoms: true }) as unknown as { structuredContent: { structures: { id: string; atoms: { id: string; label: string }[]; bonds: { id: string }[] }[] } }).structuredContent;
const o = d.structures[0].atoms.find((x) => x.label === "O")!, bondId = d.structures[1].bonds[0].id;
out = await call("add_arrow", { kind: "curved", from: `${o.id}:pair`, to: bondId });
assert.ok(!out.isError, text(out));
const arc = m.arrows!.find((x) => x.kind === "curved")!;
assert.ok(arc.bend === 0.3 && Math.hypot(arc.from[0] - arc.to[0], arc.from[1] - arc.to[1]) > 0.2);
assert.ok((await call("add_arrow", { kind: "fishhook", from: "s99.1", to: bondId })).isError);
out = await call("add_shape", { kind: "brackets", around: [d.structures[1].id], mark: "‡" });
assert.ok(!out.isError, text(out));
assert.deepEqual([m.shapes![0].kind, m.shapes![0].mark], ["brackets", "‡"]);
const sh = (await read()).shapes;
assert.equal(sh[0].kind, "brackets");
await call("edit", { ids: [sh[0].id], kind: "parens", dashed: true });
assert.deepEqual([m.shapes![0].kind, m.shapes![0].dashed], ["parens", true]);
await call("delete", { ids: [sh[0].id] });
// A straight arrow between two structures runs edge to edge, a gap clear of each (no overlap warned).
fresh();
await call("draw_structures", { structures: [{ text: "benzene" }, { text: "toluene" }] });
d = await read();
out = await call("add_arrow", { kind: "reaction", from: d.structures[0].id, to: d.structures[1].id });
assert.ok(!out.isError, text(out));
const ra = m.arrows![0];
assert.ok(ra.from[0] >= d.structures[0].box[2] + 0.4 && ra.to[0] <= d.structures[1].box[0] - 0.4, JSON.stringify([ra, d.structures.map((x: { box: number[] }) => x.box)]));
assert.doesNotMatch(text(out), /overlaps/);
assert.equal(m.shapes!.length, 0);

// set_style: a preset and a page, one undo step.
fresh();
await call("set_style", { preset: "RSC", page: "ACS2" });
assert.equal(m.style!.preset, "RSC");
assert.equal(m.style!.bond, 12.2);
assert.equal(m.style!.page, "ACS2");
assert.equal(steps.length, 1);

// Tool calls run one after another, so two at once cannot interleave their undo steps.
fresh();
await Promise.all([call("draw_structures", { structures: [{ text: "water" }] }), call("draw_structures", { structures: [{ text: "benzene" }] })]);
assert.equal(fragments(m).length, 2);
assert.equal(steps.length, 2);
// A tool that throws still ends its undo step.
host.cleanReactions = () => { throw new Error("broken"); };
out = await call("draw_reaction", { start: [{ text: "ethanol" }], steps: [{ products: [{ text: "water" }] }] });
assert.ok(out.isError);
assert.match(text(out), /draw_reaction did not finish, and the drawing is as it was before the call: broken/);
assert.equal(open, 0);
assert.equal(fragments(m).length, 2, "the half-drawn reaction is taken away");

host.cleanReactions = (ids) => ids.size;

// Progress and cancel (D2): a call with a progress token sends a notification for each step; a call cancelled part
// way leaves the drawing as it was and says so.
{
  fresh();
  const notes: { progress: number; total?: number; message?: string }[] = [];
  const steps3 = [{ products: [{ text: "ethanol" }] }, { products: [{ text: "CC=O" }] }, { products: [{ text: "CC(=O)O" }] }];
  const go = (from: { progress?: (t: string) => void; cancelled?: () => boolean }) => handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "draw_reaction", arguments: { start: [{ text: "C=C" }], steps: steps3 }, _meta: { progressToken: "p1" } } }), () => host, "1.2.0", { client: "Test", session: "s-1", ...from }).then(JSON.parse);
  let res = await go({ progress: (t) => { const x = JSON.parse(t); assert.equal(x.method, "notifications/progress"); assert.equal(x.params.progressToken, "p1"); notes.push(x.params); } });
  assert.ok(!res.result.isError, res.result.content[0].text);
  assert.deepEqual(notes.map((x) => [x.progress, x.total]), [[0, 3], [1, 3], [2, 3]]);
  assert.equal(notes[1].message, "Step 2 of 3");
  // Every product is in the window, the last step's too (6 November 2026: a watched call set the drawing before it
  // placed each step's products, and never after the last).
  assert.equal(fragments(m).length, 4, "the start and all three products drawn");
  const drawn = m, k = steps.length;
  let asked = 0;
  res = await go({ cancelled: () => ++asked > 1 });
  assert.ok(res.result.isError);
  assert.match(res.result.content[0].text, /draw_reaction was cancelled, and the drawing is as it was before the call/);
  assert.deepEqual(m, drawn, "the cancelled call took back what it drew");
  assert.equal(steps.length, k + 1, "in its own undo step");
  assert.match(said.at(-1)!, /Test stopped/);
}

// Prompts (D13): each is listed with its arguments; one asked for gives a user message with the text in it.
r = await send("initialize", {});
assert.deepEqual(Object.keys(r.result.capabilities), ["tools", "resources", "prompts"]);
const prompts = (await send("prompts/list")).result.prompts as { name: string; arguments: { name: string; required?: boolean }[] }[];
assert.deepEqual(prompts.map((p) => p.name), ["draw_scheme", "redraw_picture", "check_drawing", "fill_experiment", "journal_figure"]);
r = await send("prompts/get", { name: "draw_scheme", arguments: { text: "Benzaldehyde (1) was reduced with NaBH4." } });
assert.equal(r.result.messages[0].role, "user");
assert.match(r.result.messages[0].content.text, /draw_reaction[\s\S]*Benzaldehyde \(1\)/);
assert.equal((await send("prompts/get", { name: "nope" })).error.code, -32602);
assert.equal((await send("prompts/get", { name: "draw_scheme", arguments: {} })).error.code, -32602, "a missing argument");
assert.equal((await send("prompts/get", { name: "draw_scheme", arguments: { text: "x".repeat(20_001) } })).error.code, -32602, "too long");
// (The default read has no SMILES, and the chemistry cannot be judged from formulas: the prompt asks for them.)
assert.ok((await send("prompts/get", { name: "check_drawing" })).result.messages[0].content.text.includes("read_drawing with smiles: true"));

// Resources (D12): the drawings, and this drawing as JSON, CDXML and a picture; another drawing is not found.
host.windows = async () => [{ id: "draw-1", name: "Untitled", edited: true }];
const uris = (await send("resources/list")).result.resources.map((x: { uri: string }) => x.uri);
assert.deepEqual(uris, ["octet://drawings", "octet://drawing/draw-1"]);
assert.equal((await send("resources/templates/list")).result.resourceTemplates.length, 3);
r = await send("resources/read", { uri: "octet://drawing/draw-1" });
assert.ok(JSON.parse(r.result.contents[0].text).structures.length > 0);
assert.equal(JSON.parse((await send("resources/read", { uri: "octet://drawings" })).result.contents[0].text)[0].id, "draw-1");
assert.equal((await send("resources/read", { uri: "octet://drawing/draw-1/png" })).result.contents[0].blob, "iVBOR");
assert.equal((await send("resources/read", { uri: "octet://drawing/draw-1/cdxml" })).error.code, -32603, "the stand-in host writes no CDXML");
for (const uri of ["octet://drawing/draw-2", "octet://drawing/draw-1/mol", "file:///etc/passwd", 7]) assert.equal((await send("resources/read", { uri })).error.code, -32002, String(uri));

// Speed (plan section 19). F2: every write result gives the box of what it made; picture: true on a write tool gives a
// picture cropped to what changed; read_drawing reads only the ids given.
{
  fresh();
  const crops: unknown[][] = [];
  const picture = host.picture;
  host.picture = async (...x) => { crops.push(x); return "iVBOR"; };
  const res = (await call("draw_structures", { structures: [{ text: "benzene" }, { text: "toluene" }], picture: true })) as unknown as { structuredContent: Change & { boxes: Record<string, number[]> }; content: { type: string; text?: string }[] };
  const sc = res.structuredContent, d = await read();
  assert.deepEqual(Object.keys(sc.boxes).sort(), [...sc.made].sort());
  // A number is in its structure's box: the result gives no box of its own for it, and lists it as made only in full.
  for (const full of [true, false]) {
    const numbered = (await call("draw_structures", { structures: [{ text: "phenol", number: "4" }], ...(full ? { detail: "full" } : {}) })) as unknown as { structuredContent: Change & { boxes: Record<string, number[]> } };
    assert.ok(numbered.structuredContent.made.some((id) => id.startsWith("t")) === full && Object.keys(numbered.structuredContent.boxes).every((id) => id.startsWith("s")), JSON.stringify(numbered.structuredContent));
  }
  for (const st of d.structures) assert.deepEqual(sc.boxes[st.id], st.box, st.id);
  assert.equal(res.content[1].type, "image");
  const [, crop, longest] = crops[0] as [unknown, number[], number];
  assert.equal(longest, 800);
  assert.ok(crop[0] <= Math.min(...d.structures.map((x: { box: number[] }) => x.box[0])) - 0.9 && crop[2] >= Math.max(...d.structures.map((x: { box: number[] }) => x.box[2])) + 0.9, JSON.stringify(crop));
  assert.doesNotMatch(res.content[0].text!, /"done"/, "the sentence is not repeated in the JSON");
  const one = JSON.parse(text(await call("read_drawing", { ids: [d.structures[1].id] })));
  assert.deepEqual(one.structures.map((x: { id: string }) => x.id), [d.structures[1].id]);
  await call("read_drawing", { ids: [d.structures[0].id], picture: true, picture_size: "large" });
  const [, got, size] = crops.at(-1)! as [unknown, number[], number];
  assert.equal(size, 1568);
  got.forEach((v, i) => assert.ok(Math.abs(v - (d.structures[0].box[i] + (i < 2 ? -1 : 1))) < 0.06, JSON.stringify(got)));
  assert.ok((await call("read_drawing", { ids: ["s99"] })).isError);
  host.picture = picture;
}

// F3: placement. Each side, with gap and align, the same on every tool that takes it, and move to a point.
{
  fresh();
  // (At a point where rounding a box to 0.1, as a result does, does not move its middle: the comparisons below are of
  // rounded boxes, within 0.05. At the top margin, where it would be drawn with no point, the rounding moves it 0.05.)
  await call("draw_structures", { structures: [{ text: "benzene" }], at: [-10, 5] });
  const [ref] = (await read()).structures, near = (p: number, q: number) => Math.abs(p - q) < 0.05;
  const placedBox = async (args: Record<string, unknown>) => { const r = (await call("draw_structures", { structures: [{ text: "water" }], ...args })) as unknown as { isError?: true; structuredContent: { made: string[]; boxes: Record<string, number[]> } }; assert.ok(!r.isError, JSON.stringify(r)); return r.structuredContent.boxes[r.structuredContent.made[0]]; };
  let b = await placedBox({ right_of: ref.id, gap: 2 });
  assert.ok(near(b[0], ref.box[2] + 2) && near((b[1] + b[3]) / 2, (ref.box[1] + ref.box[3]) / 2), JSON.stringify([b, ref.box]));
  b = await placedBox({ left_of: ref.id, align: "top" });
  assert.ok(near(b[2], ref.box[0] - 1.5) && near(b[3], ref.box[3]), JSON.stringify(b));
  b = await placedBox({ below: ref.id, gap: 1, align: "left" });
  assert.ok(near(b[3], ref.box[1] - 1) && near(b[0], ref.box[0]), JSON.stringify(b));
  b = await placedBox({ above: ref.id, align: "right" });
  assert.ok(near(b[1], ref.box[3] + 1.5) && near(b[2], ref.box[2]), JSON.stringify(b));
  b = await placedBox({ at: [10, 20], anchor: "top_left" });
  assert.ok(near(b[0], 10) && near(b[3], 20), JSON.stringify(b));
  const before = m;
  for (const [args, why] of [[{ right_of: "s99" }, /nothing with the id s99/], [{ right_of: ref.id, below: ref.id }, /not right_of and below/], [{ below: ref.id, align: "top" }, /below or above an object is left, centre or right/]] as const) {
    const out = await call("draw_structures", { structures: [{ text: "water" }], ...args });
    assert.ok(out.isError);
    assert.match(text(out), why);
  }
  assert.equal(m, before, "a bad placement draws nothing");
  // move: to a point, or beside an object; not both a place and dx.
  const t = (await call("add_text", { text: "Note", at: [0, -30], anchor: "top_left" }) as unknown as { structuredContent: { made: string[] } }).structuredContent.made[0];
  let mv = await call("move", { ids: [t], right_of: ref.id, align: "top" });
  assert.ok(!mv.isError, text(mv));
  const tb = (await read()).text.find((x: { id: string }) => x.id === t);
  assert.ok(tb.at[0] > ref.box[2], JSON.stringify(tb));
  assert.ok((await call("move", { ids: [t], dx: 1, to: [0, 0] })).isError);
  assert.ok((await call("move", { ids: [t] })).isError);
  mv = await call("move", { ids: [ref.id], to: [0, 0], detail: "full" });
  const moved = (mv as unknown as { structuredContent: { boxes: Record<string, number[]> } }).structuredContent.boxes[ref.id];
  assert.ok(near((moved[0] + moved[2]) / 2, 0) && near((moved[1] + moved[3]) / 2, 0), JSON.stringify(moved));
}

// Where new work starts. On an empty page: at the page's left and top margins (15 mm), so that a scheme has the whole
// page under it; where the page's edges do not show (Quick start), level with the middle of the view. Then under
// everything drawn, from its left edge, measured by boxes: a text's box, not the point it is anchored at.
{
  const k = 72 / 25.4 / DEFAULT_STYLE.bond, [w, h] = pageSize(DEFAULT_STYLE), left = (15 - w / 2) * k, top = (h / 2 - 15) * k;
  const drawn = async (name: string, args: unknown) => { const r = (await call(name, args)) as unknown as { structuredContent: { made: string[]; boxes: Record<string, number[]> } }; return r.structuredContent.boxes[r.structuredContent.made[0]]; };
  fresh();
  let b = await drawn("draw_structures", { structures: [{ text: "benzene" }] });
  assert.ok(Math.abs(b[0] - left) < 0.5 && b[3] <= top && b[3] > top - 1.5, `at the left and top margins: ${b}`);
  fresh();
  m = { ...EMPTY, style: { ...DEFAULT_STYLE, edges: false } };
  b = await drawn("draw_structures", { structures: [{ text: "benzene" }] });
  assert.ok(Math.abs(b[0] - left) < 0.5 && Math.abs((b[1] + b[3]) / 2) < 3, `no page edges: level with the middle of the view: ${b}`);
  fresh();
  const title = await drawn("add_text", { text: "A title that is wider than benzene", text_align: "centre", at: [0, 10] });
  b = await drawn("draw_structures", { structures: [{ text: "benzene" }] });
  assert.ok(Math.abs(b[0] - title[0]) < 0.5 && b[3] <= title[1] - 3, `under the title's box, from its left edge: ${b}, ${title}`);
  // What a call made comes into view when the call ends: the host is given its box. A call that makes nothing gives none.
  assert.deepEqual(shown?.map((v) => Math.round(v * 10) / 10), b, "the box of what was made");
  await call("move", { ids: ["s1"], dx: 1 });
  assert.equal(shown, undefined, "nothing made, nothing to show");
  // (The window cannot run here: the editor's host is checked by its text. It pans the view to that box, as a paste does.)
  assert.match(readFileSync(new URL("./Editor.tsx", import.meta.url), "utf8"), /end: \(made\) => \{[^}]*if \(made\) panTo\(/, "the editor's host brings what a call made into view");
  // Under a shape too (a box drawn round something). Not on an experiment page: its schemes go in its boxes.
  for (experiment of [false, true]) {
    m = EMPTY;
    await call("draw_structures", { structures: [{ text: "benzene" }], at: [0, 0] });
    const frame = await drawn("add_shape", { kind: "box", box: [-3, -9, 3, 3] }), ring = (await read()).structures[0].box;
    b = await drawn("draw_structures", { structures: [{ text: "toluene" }] });
    assert.ok(experiment ? b[3] > frame[1] && b[3] <= ring[1] - 3 : b[3] <= frame[1] - 3 && Math.abs(b[0] - frame[0]) < 0.5, `${experiment ? "in" : "under"} the box: ${b}, ${frame}`);
  }
  // A template and a file's drawing go with their top left there too, measured with their arrows and shapes: the
  // flask (pen lines, no atoms) at the margins of an empty page, and a file's frame round its structure.
  fresh();
  let made = (await call("place_template", { name: "Round-bottom flask" }) as unknown as { structuredContent: { boxes: Record<string, number[]> } }).structuredContent.boxes, all = Object.values(made);
  assert.ok(Math.abs(Math.min(...all.map((x) => x[0])) - left) < 0.11 && Math.abs(Math.max(...all.map((x) => x[3])) - top) < 0.11, `the flask's top left at the margins: ${JSON.stringify(made)}`);
  fresh();
  const file = host.file;
  host.file = () => ({ ...parseStructure("c1ccccc1"), shapes: [{ id: 1, kind: "box", from: [-4, 5], to: [4, -5] }] }) as Mol;
  made = (await call("add_file", { text: "<CDXML/>" }) as unknown as { structuredContent: { boxes: Record<string, number[]> } }).structuredContent.boxes;
  host.file = file;
  const frame = Object.entries(made).find(([id]) => id[0] === "b")![1];
  assert.ok(Math.abs(frame[0] - left) < 0.11 && Math.abs(frame[3] - top) < 0.11, `the file's frame at the margins: ${JSON.stringify(made)}`);
  // set_style moves everything across as a new scheme is placed: inside the margins from either side, and nothing
  // that is inside them already.
  for (const [x, edge] of [[-30, 0], [30, 2], [0, undefined]] as const) {
    fresh();
    const was = await drawn("draw_structures", { structures: [{ text: "benzene" }], at: [x, 0] });
    await call("set_style", { page: "A4" });
    const now = (await read()).structures[0].box;
    assert.ok(edge === undefined ? now[0] === was[0] : Math.abs(now[edge] - (edge ? -left : left)) < 0.11, `set_style from ${x}: ${now}`);
  }
}

// F1: batch. References to what earlier steps made, one undo step, and a failure or a bad step leaves the drawing as
// it was and names the step.
{
  fresh();
  let out = await call("batch", { steps: [
    { tool: "draw_structures", args: { structures: [{ text: "benzene" }, { text: "toluene" }] } },
    { tool: "add_text", args: { text: "Figure 1", below: "$1.s[0]", align: "left" } },
    { tool: "edit", args: { ids: ["$2.t[0]"], bold: true, picture: true } },
    { tool: "add_shape", args: { kind: "box", around: ["$1.s"] } },
  ], detail: "full" });
  assert.ok(!out.isError, text(out));
  assert.equal(steps.length, 1, "one undo step");
  assert.match(text(out), /Did 4 steps as one undo step:\n1\. Drew 2 structures/);
  const sc = (out as unknown as { structuredContent: { steps: { step: number; s?: string[]; t?: string[]; b?: string[] }[]; made: string[] } }).structuredContent;
  assert.equal(sc.steps[0].s!.length, 2);
  assert.equal(m.captions!.find((c) => `t${c.id}` === sc.steps[1].t![0])!.bold, true);
  assert.equal(m.shapes!.length, 1);
  const drawn = m, k = steps.length;
  const refusals: [unknown[], RegExp][] = [
    [[{ tool: "draw_structures", args: { structures: [{ text: "water" }] } }, { tool: "move", args: { ids: ["s99"], dx: 1, dy: 0 } }], /Step 2 \(move\) failed: There is nothing with the id s99/],
    [[{ tool: "draw_structures", args: { structures: [{ text: "water" }] } }, { tool: "edit", args: { ids: ["$1.s[3]"], colour: "#ff0000" } }], /Step 2 \(edit\): \$1\.s\[3\]: step 1 made 1 structures/],
    [[{ tool: "edit", args: { ids: ["$1.s[0]"], colour: "#ff0000" } }], /Step 1 \(edit\) names step 1/],
    [[{ tool: "batch", args: {} }], /steps\[0\]\.tool: not one of/],
    [[{ tool: "draw_structures", args: { structures: [{ text: 5 }] } }], /Step 1 \(draw_structures\): structures\[0\]\.text: not text/],
    // "$1.made" where one id is needed, when step 1 made two top-level objects: no one meaning, so refused as before.
    [[{ tool: "draw_structures", args: { structures: [{ text: "water" }, { text: "benzene" }] } }, { tool: "add_text", args: { text: "x", below: "$1.made" } }], /Step 2 \(add_text\): \$1\.made names 2 objects here: give one, as \$1\.made\[0\]/],
    [[{ tool: "draw_structures", args: { structures: [{ text: "water" }, { text: "benzene" }] } }, { tool: "add_text", args: { text: "x", below: "$1.s" } }], /Step 2 \(add_text\): \$1\.s names 2 objects here/],
    [Array(41).fill({ tool: "delete", args: { ids: ["s1"] } }), /more than 40/],
    [[{ tool: "draw_structures", args: { structures: [{ text: "water" }] } }, { tool: "draw_structures", args: { structures: [{ text: "not a compound at all" }] } }], /Step 2 \(draw_structures\) failed: Octet drew nothing/],
  ];
  for (const [list, why] of refusals) {
    out = await call("batch", { steps: list });
    assert.ok(out.isError, String(why));
    assert.match(text(out), why);
    assert.equal(m, drawn, `nothing left behind: ${why}`);
  }
  assert.ok(steps.length - k <= refusals.length, "each failed batch is at most one undo step");
}

// F6: add_arrow from and to a point; add_shape at a box; same_width; rich text in add_text and edit.
{
  fresh();
  let out = await call("add_arrow", { kind: "line", from: [0, 0], to: [5, 0] });
  assert.ok(!out.isError, text(out));
  assert.deepEqual([m.arrows![0].from, m.arrows![0].to], [[0, 0], [5, 0]]);
  for (const bad of [[1e9, 0], [1], ["a", 0]]) assert.match(text(await call("add_arrow", { kind: "line", from: bad, to: [5, 0] })), /from: not an id .* or a point/);
  out = await call("add_shape", { kind: "rounded", box: [0, 0, 10, 4], fill: "solid", colour: "#EEF2F8" });
  assert.ok(!out.isError, text(out));
  await call("add_shape", { kind: "rounded", box: [0, -10, 6, -6] });
  const [p1, p2] = m.shapes!;
  const line = `a${m.arrows![0].id}`;
  out = await call("arrange", { ids: [`b${p1.id}`, `b${p2.id}`, line], how: "same_width" });
  assert.match(text(out), new RegExp(`Not changed \\(not shapes\\): ${line}`));
  const w = (x: { from: number[]; to: number[] }) => Math.abs(x.to[0] - x.from[0]);
  assert.equal(w(m.shapes![0]), 10);
  assert.equal(w(m.shapes![1]), 10);
  assert.equal(Math.min(m.shapes![1].from[0], m.shapes![1].to[0]), 0, "keeps its left edge");
  assert.ok((await call("add_shape", { kind: "box" })).isError);
  out = await call("add_text", { runs: [{ text: "M = " }, { text: "Ce", colour: "#6B35B8" }, { text: "IV", script: "super" }] });
  assert.ok(!out.isError, text(out));
  const c = m.captions!.at(-1)!;
  assert.equal(c.text, "M = CeIV");
  assert.deepEqual(c.runs!.map((r) => [r.text, r.colour, r.script]), [["M = ", undefined, undefined], ["Ce", "#6B35B8", undefined], ["IV", undefined, "super"]]);
  assert.deepEqual((await read()).text.at(-1).runs.length, 3);
  out = await call("edit", { ids: [`t${c.id}`], runs: [{ text: "M = Tb", bold: true }] });
  assert.equal(m.captions!.at(-1)!.text, "M = Tb");
  assert.ok((await call("edit", { ids: [`t${c.id}`], runs: [{ text: "x", colour: "red" }] })).isError);
}

// F4: a molecule given atom by atom keeps its coordinates and labels; a bad one draws nothing. Labels go on the *s
// of a SMILES in order.
{
  fresh();
  const molecule = { atoms: [{ label: "Ce", x: 0, y: 0 }, { label: "O", x: 1, y: 0.5 }, { label: "O", x: 1, y: -0.5 }, { label: "Si(OtBu)2", x: 1.8, y: 0 }], bonds: [{ from: 0, to: 1 }, { from: 1, to: 3 }, { from: 3, to: 2 }, { from: 2, to: 0, kind: "wedge" }] };
  let out = await call("draw_structures", { structures: [{ molecule, number: "S-1" }] });
  assert.ok(!out.isError, text(out));
  const xs = m.atoms.map((a) => a.location[0]);
  assert.ok(Math.abs(xs[1] - xs[0] - 1) < 1e-9 && Math.abs(xs[3] - xs[0] - 1.8) < 1e-9, "coordinates kept");
  assert.equal(m.atoms[3].text, "Si(OtBu)2");
  assert.equal(m.atoms[0].label, "Ce");
  const before = m;
  for (const [bad, why] of [
    [{ atoms: [{ x: 0, y: 0 }], bonds: [{ from: 0, to: 1 }] }, /bond from 0 to 1 needs two different atoms/],
    [{ atoms: [{ x: 1e9, y: 0 }] }, /not between -1000 and 1000/],
    [{ atoms: Array(501).fill({ x: 0, y: 0 }) }, /more than 500/],
    [{ atoms: [{ x: 0, y: 0 }, { x: 1, y: 0 }], bonds: [{ from: 0, to: 1 }, { from: 1, to: 0 }] }, /have two bonds/],
  ] as const) {
    out = await call("draw_structures", { structures: [{ molecule: bad }] });
    assert.ok(out.isError);
    assert.match(text(out), why);
  }
  assert.equal(m, before);
  fresh();
  out = await call("draw_structures", { structures: [{ text: "*[Pd](*)Br", labels: ["L", "Ar"] }] });
  assert.ok(!out.isError, text(out));
  assert.deepEqual(m.atoms.filter((a) => a.text).map((a) => a.text), ["L", "Ar"]);
  assert.match(text(await call("draw_structures", { structures: [{ text: "*[Pd]*", labels: ["L"] }] })), /has 2 \* but 1 labels/);
}

// F4: draw_figure. Panels, rows, numbers, captions, side text and brackets, as one undo step; the ids by place.
{
  fresh();
  const out = await call("draw_figure", { panels: [
    { title: "A  Siloxides", subtitle: "Mazzanti et al.", frame: "fill", fill: "#EEF2F8", rows: [[{ structure: "benzene", number: "S-1", caption: "M = Ce, Tb" }, { text: "and" }, { structure: "toluene", number: "S-2", brackets: "brackets", mark: "n" }]] },
    { title: [{ text: "B ", bold: true }, { text: "Phenols", colour: "#213C99" }], rows: [[{ structure: "phenol" }]] },
  ], detail: "full" });
  assert.ok(!out.isError, text(out));
  assert.equal(steps.length, 1);
  const fig = (out as unknown as { structuredContent: { figure: { title?: string; frame?: string; rows: { structure?: string; brackets?: string; text?: string }[][] }[] } }).structuredContent.figure;
  assert.equal(fig.length, 2);
  assert.ok(fig[0].frame && !fig[1].frame);
  assert.ok(fig[0].rows[0][2].brackets && fig[0].rows[0][1].text);
  assert.equal(fragments(m).length, 3);
  assert.equal(m.shapes!.length, 2, "a frame and the brackets");
  const d = await read(), s1 = d.structures.find((x: { id: string }) => x.id === fig[0].rows[0][0].structure), s3 = d.structures.find((x: { id: string }) => x.id === fig[1].rows[0][0].structure);
  assert.ok(s3.box[3] < s1.box[1], "panel B is under panel A");
  assert.ok((await call("draw_figure", { panels: [{ rows: [[{ structure: "benzene", text: "x" }]] }] })).isError);
  assert.ok((await call("draw_figure", { panels: [{ rows: [[{ structure: "not a compound at all" }]] }] })).isError);
  assert.ok((await call("draw_figure", { panels: [{ rows: [[{ structure: "benzene" }]] }], element_colours: { Oxygen: "#ff0000" } })).isError);
}

// F5: the instructions name only tools that exist, and the fast way.
{
  const ins = (await send("initialize", {})).result.instructions as string;
  for (const name of ins.match(/\b[a-z]+_[a-z_]+\b/g) ?? []) assert.ok(TOOL_NAMES.includes(name) || ["right_of", "ring_fill"].includes(name), name);
  assert.match(ins, /batch/);
  assert.match(ins, /draw_figure/);
}

// Speed, round 2 (plan section 21). R2: orientation hints turn a SMILES as asked, with no coordinates.
{
  const atomsOf = async () => (await call("read_drawing", { atoms: true })).structuredContent as { structures: { id: string; atoms: { id: string; label?: string; x: number; y: number }[] }[] };
  const angle = (p: { x: number; y: number }, q: { x: number; y: number }) => (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  const only = () => m.atoms.map((a) => a.location);
  // up: the named label points up from the middle (to the nearest 30°); a second hint sets the side.
  fresh();
  let r = await call("draw_structures", { structures: [{ text: "*c1ccc(*)cc1", labels: ["OMe", "Br"], up: "OMe" }] });
  assert.ok(!r.isError, text(r));
  const ome = m.atoms.findIndex((a) => a.text === "OMe"), br = m.atoms.findIndex((a) => a.text === "Br");
  assert.ok(Math.abs(m.atoms[ome].location[0] - m.atoms[br].location[0]) < 0.01 && m.atoms[ome].location[1] > m.atoms[br].location[1], "OMe straight up, Br straight down");
  fresh();
  r = await call("draw_structures", { structures: [{ text: "OC(=O)c1ccccc1C", left: "O", up: "#9" }] });
  assert.ok(!r.isError, text(r));
  const xs = only(), mid = [(Math.min(...xs.map((p) => p[0])) + Math.max(...xs.map((p) => p[0]))) / 2, (Math.min(...xs.map((p) => p[1])) + Math.max(...xs.map((p) => p[1]))) / 2];
  assert.ok(xs[0][0] < mid[0] && xs[9][1] > mid[1], "the OH to the left, the methyl up");
  // rotate is exact; flip keeps each stereocentre (the same InChI as without it).
  fresh();
  await call("draw_structures", { structures: [{ text: "C[C@H](N)C(=O)O" }] });
  const plain = host.smiles(m);
  fresh();
  await call("draw_structures", { structures: [{ text: "C[C@H](N)C(=O)O", flip: "horizontal", rotate: 45 }] });
  assert.equal(host.smiles(m), plain, "a flip keeps the stereocentre");
  // geometry: an octahedral metal's ligands at their places, wedges in front and hashes behind, narrow at the metal.
  fresh();
  r = await call("draw_structures", { structures: [{ text: "[Ce](*)(*)(*)(*)(N#CC)(N#CC)", labels: ["OSiPh3", "OSiPh3", "OSiPh3", "OSiPh3"], geometry: "octahedral" }] });
  assert.ok(!r.isError, text(r));
  const ce = m.atoms.findIndex((a) => a.label === "Ce"), c = m.atoms[ce].location;
  const at = m.bonds.filter((b) => b.atoms[0] === ce).map((b) => ({ angle: Math.round(((Math.atan2(m.atoms[b.atoms[1]].location[1] - c[1], m.atoms[b.atoms[1]].location[0] - c[0]) * 180) / Math.PI + 360) % 360), stereo: b.stereo ?? 0, ligand: b.atoms[1] }));
  assert.deepEqual(at.sort((p, q) => p.ligand - q.ligand).map((x) => [x.angle, x.stereo]), [[90, 0], [270, 0], [150, 6], [210, 1], [30, 6], [330, 1]]);
  // colours by label and by element.
  fresh();
  r = await call("draw_structures", { structures: [{ text: "*c1ccccc1O", labels: ["MIV"], colours: { MIV: "#4E8B4E", O: "#E0352B" } }] });
  assert.ok(!r.isError, text(r));
  assert.equal(m.atoms.find((a) => a.text === "MIV")?.colour, "#4E8B4E");
  assert.equal(m.atoms.find((a) => a.label === "O")?.colour, "#E0352B");
  // Bad hints draw nothing and say why.
  for (const [hint, says] of [
    [{ up: "Xx" }, /no atom Xx/], [{ up: "#99" }, /no atom #99/], [{ up: "O", down: "#1" }, /one line/], [{ up: "O", left: "#1", right: "#2" }, /at most two/],
    [{ geometry: "octahedral" }, /takes 6 bonds/], [{ colours: { O: "red" } }, /#rrggbb/], [{ colours: { Zz: "#000000" } }, /no atom Zz/],
  ] as const) {
    fresh();
    const bad = await call("draw_structures", { structures: [{ text: "OCCC(=O)O", ...hint }] });
    assert.ok(bad.isError && says.test(text(bad)) && !m.atoms.length, `${JSON.stringify(hint)}: ${text(bad)}`);
  }
  fresh();
  const chelate = await call("draw_structures", { structures: [{ text: "[Ce]1(*)(*)OCCO1", labels: ["X", "Y"], geometry: "tetrahedral" }] });
  assert.ok(chelate.isError && /chelate/.test(text(chelate)) && !m.atoms.length, text(chelate));
  // The same hints in draw_reaction and draw_figure.
  fresh();
  r = await call("draw_figure", { panels: [{ rows: [[{ structure: "*c1ccc(*)cc1", labels: ["OMe", "Br"], down: "OMe", number: "1" }]] }] });
  assert.ok(!r.isError, text(r));
  assert.ok(m.atoms.find((a) => a.text === "OMe")!.location[1] < m.atoms.find((a) => a.text === "Br")!.location[1], "OMe down in a figure");
}

// R3: every write result checks the whole drawing's layout: clean, or the ids of what overlaps, runs off the page or
// lies on a bond.
{
  fresh();
  let r = await call("draw_structures", { structures: [{ text: "benzene" }] });
  assert.equal((r as any).structuredContent.check, "clean");
  r = await call("add_text", { text: "On the ring", at: [m.atoms[0].location[0] / 2 + m.atoms[3].location[0] / 2, m.atoms[0].location[1] / 2 + m.atoms[3].location[1] / 2] });
  const check = (r as any).structuredContent.check;
  assert.ok(check.text_on_bonds?.some(([t]: string[]) => /^t\d+$/.test(t)), JSON.stringify(check));
  r = await call("draw_structures", { structures: [{ text: "toluene" }], at: [900, 900] });
  assert.ok((r as any).structuredContent.check.off_page?.length, JSON.stringify((r as any).structuredContent.check));
  assert.match(text(r), /"check":/);
  // Two labels of one structure on each other.
  fresh();
  r = await call("draw_structures", { structures: [{ molecule: { atoms: [{ x: 0, y: 0, label: "N" }, { x: 0.1, y: 0.1, label: "tBu" }, { x: 2, y: 0, label: "O" }], bonds: [{ from: 0, to: 2 }, { from: 1, to: 2 }] } }] });
  assert.ok((r as any).structuredContent.check.labels_overlap?.length, JSON.stringify((r as any).structuredContent.check));
  // A SMILES of generic atoms only reads, with its labels.
  fresh();
  r = await call("draw_structures", { structures: [{ text: "*(*)(*)(*)*", labels: ["M", "L", "L", "L", "L"], geometry: "tetrahedral" }] });
  assert.ok(!r.isError && m.atoms.length === 5, text(r));
}

// A graphical abstract (6 Nov): text made at its size, a picture alone from a file, a page of any size, and a check
// that names text across an inset's edge, text on a divider and labels that nearly meet.
{
  fresh();
  let r = await call("add_text", { text: "Our approach", size: 9, text_align: "centre" });
  assert.ok(!r.isError && m.captions![0].size === 9 && m.captions![0].align === "centre", text(r));
  const file = host.file;
  host.file = () => ({ ...EMPTY, shapes: [{ id: 1, kind: "picture", from: [0, 1], to: [1, 0], picture: { PNG: "89504E47" } }] }) as Mol;
  r = await call("add_file", { text: "<CDXML/>" });
  host.file = file;
  assert.ok(!r.isError && m.shapes?.some((x) => x.kind === "picture"), text(r));
  r = await call("set_style", { page_size: [160, 80] });
  assert.ok(!r.isError && m.style!.page === "Custom" && m.style!.custom[0] === 160 && /160 x 80 mm/.test(text(r)), text(r));
  fresh();
  await call("add_shape", { kind: "rounded", box: [0, 0, 3, 2] });
  r = await call("add_text", { text: "curvature per paddlewheel", at: [3, 1] });
  assert.ok((r as any).structuredContent.check.on_shape_edges?.length, JSON.stringify((r as any).structuredContent.check));
  fresh();
  await call("add_arrow", { kind: "line", from: [0, -5], to: [0, 5] });
  r = await call("add_text", { text: "144 components", at: [-1.05, 0] });
  assert.ok((r as any).structuredContent.check.overlaps?.length, JSON.stringify((r as any).structuredContent.check));
  fresh();
  r = await call("draw_structures", { structures: [{ molecule: { atoms: [{ x: 0, y: 0, label: "O" }, { x: 0.33, y: 0, label: "O" }, { x: 0.16, y: 1, label: "Bi" }], bonds: [{ from: 0, to: 2 }, { from: 1, to: 2 }] } }] });
  assert.ok((r as any).structuredContent.check.labels_overlap?.length, JSON.stringify((r as any).structuredContent.check));
}

// R4: tools/list leaves out the limits Octet checks itself, so it is short; a call past a limit is still refused.
{
  const listed = (await send("tools/list")).result.tools as { name: string; description: string; inputSchema: object }[];
  const json = JSON.stringify(listed.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })));
  // (R7 took it from 35,000 to 50,000: every command and every object property, read once per session.)
  assert.ok(json.length < 52_000, `the tools as an AI app gives them to its model: ${json.length} characters`);
  assert.ok(!/"(maxLength|maxItems|minItems|minimum|maximum)"/.test(json));
  fresh();
  const long = await call("add_text", { text: "x".repeat(2001) });
  assert.ok(long.isError && /2000/.test(text(long)) && !m.captions?.length, text(long));
}

// R5: draw_figure shows the figure as it builds (half the rows, then the rest), with progress, and ends laid out.
{
  fresh();
  const notes: { progress: number; total?: number }[] = [];
  const rows = [[{ structure: "benzene", number: "1" }], [{ structure: "toluene", number: "2" }], [{ structure: "phenol", number: "3" }], [{ text: "end" }]];
  let sets = 0;
  const set = host.set;
  host.set = (x) => { sets++; return set(x); };
  const res = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "draw_figure", arguments: { panels: [{ title: "A", rows }] }, _meta: { progressToken: "f1" } } }), () => host, "1.2.0", { client: "Test", session: "s-1", progress: (t) => notes.push(JSON.parse(t).params) }));
  host.set = set;
  assert.ok(!res.result.isError, res.result.content[0].text);
  assert.deepEqual(notes.map((x) => [x.progress, x.total]), [[2, 5], [4, 5], [5, 5]]);
  assert.equal(sets, 3, "two showings and the layout, no more");
  // Each row's structure is centred in the panel, one under another, as before.
  const xs = fragments(m).map((g) => { const x = g.map((i) => m.atoms[i].location[0]); return (Math.min(...x) + Math.max(...x)) / 2; });
  assert.ok(Math.max(...xs) - Math.min(...xs) < 0.05, xs.join(", "));
}

// From the round 2 evals: a batch step's picture: true gives the batch a picture, and with detail: full (the step's
// is the batch's too) a step's data (a figure's ids, a table) comes back with the step.
{
  fresh();
  const r = await call("batch", { steps: [{ tool: "draw_figure", args: { panels: [{ rows: [[{ structure: "benzene" }]] }], picture: true, detail: "full" } }] });
  assert.ok(!r.isError, text(r));
  assert.ok(r.content.some((c) => c.type === "image"), "the step's picture");
  assert.ok((r as any).structuredContent.steps[0].figure, JSON.stringify((r as any).structuredContent.steps[0]));
}

// 21.9: atom ids in the order given; atoms and bonds in every tool that takes ids; which way a label reads; the
// number under the caption in a figure.
{
  fresh();
  // C(O)(N)S: Octet walks the bonds from C to S first, but the ids follow the SMILES (C, O, N, S).
  let r = await call("draw_structures", { structures: [{ text: "C(O)(N)S" }] });
  assert.ok(!r.isError, text(r));
  const id = (r as any).structuredContent.made[0] as string, at = (l: string) => m.atoms.findIndex((a) => a.label === l);
  assert.ok(!(await call("edit", { ids: [`${id}.2`], charge: -1 })).isError);
  assert.equal(m.atoms[at("O")].charge, -1, "s.2 is the O, the second atom of the SMILES");
  const was = m.atoms.map((a) => [...a.location]);
  r = await call("move", { ids: [`${id}.4`], dx: 1 });
  assert.ok(!r.isError, text(r));
  assert.ok(m.atoms.every((a, i) => Math.abs(a.location[0] - was[i][0] - (a.label === "S" ? 1 : 0)) < 1e-9), "only the S moves");
  assert.equal(JSON.parse(text(await call("read_drawing", { ids: [`${id}.2`] }))).structures.length, 1, "an atom id reads its structure");
  assert.ok(!(await call("select", { ids: [`${id}.2`] })).isError);
  assert.deepEqual(picked.atoms, [at("O")]);
  r = await call("edit", { ids: [`${id}.3`], align: "right" });
  assert.equal(m.atoms[at("N")].align, "right");
  await call("edit", { ids: [`${id}.3`], align: "auto" });
  assert.equal(m.atoms[at("N")].align, undefined);
  assert.match(text(await call("edit", { ids: [`${id}.3`], align: "justify" })), /takes no align justify/);
  r = await call("add_text", { text: "note" });
  assert.match(text(await call("edit", { ids: [(r as any).structuredContent.made[0]], align: "above" })), /takes no align above/);
  r = await call("delete", { ids: [`${id}.1-4`] });
  assert.ok(!r.isError, text(r));
  assert.equal(m.bonds.length, 2, "the bond alone goes");
  assert.equal(m.atoms.length, 4, "the S stays");
  assert.ok(!(await call("delete", { ids: [`${id}.3`] })).isError);
  assert.equal(at("N"), -1);
  // number_under_caption: the caption is the structure's own, added before its number, so Octet draws it first.
  fresh();
  r = await call("draw_figure", { number_under_caption: true, panels: [{ rows: [[{ structure: "benzene", number: "1", caption: "M = Ce" }, { structure: "toluene", number: "2" }]] }] });
  assert.ok(!r.isError, text(r));
  const cap = m.captions!.find((c) => c.text === "M = Ce")!, num = m.captions!.find((c) => c.text === "1")!;
  assert.ok(cap.under && cap.under.join() === num.under!.join() && cap.id < num.id, JSON.stringify(m.captions));
}

// R7: every object property and every command a chemist has, through edit, add_text, add_arrow, add_shape and
// run_command (6 November 2026: an AI app drew circles for highlights and free text for conditions, as it had no way
// to do what the Actions panel does).
{
  fresh();
  r = await call("draw_structures", { structures: [{ text: "toluene" }, { text: "phenol" }] });
  const made = (r as any).structuredContent.made as string[], [s1, s2] = made;
  // Highlights: an atom's halo (the disc behind its label), a bond's, and a structure's on every atom and bond; none takes them off.
  r = await call("edit", { ids: [`${s1}.1`, `${s1}.2-3`], highlight: "#FFD6A5" });
  assert.ok(!r.isError, text(r));
  assert.equal(m.atoms[0].halo, "#FFD6A5");
  assert.equal(m.bonds.find((b) => b.atoms.includes(1) && b.atoms.includes(2))!.halo, "#FFD6A5");
  r = await call("edit", { ids: [s2], highlight: "#D9E1F2" });
  const g2 = fragments(m)[1];
  assert.ok(g2.every((i) => m.atoms[i].halo === "#D9E1F2"));
  assert.ok(m.bonds.filter((b) => g2.includes(b.atoms[0])).every((b) => b.halo === "#D9E1F2"));
  assert.ok(!(await call("edit", { ids: [s2], highlight: "none" })).isError);
  assert.ok(g2.every((i) => !m.atoms[i].halo));
  assert.match(text(await call("edit", { ids: [s2], highlight: "red" })), /#rrggbb or none/);
  // Ring fill and scale run as the Actions panel does them, on the ids selected.
  commands.length = 0;
  r = await call("edit", { ids: [s1], ring_fill: "#CFE8E4", scale: 120 });
  assert.ok(!r.isError, text(r));
  assert.deepEqual(commands, ["scale.120", "ringfill.#CFE8E4"]);
  // The rest of an atom's, a bond's and a structure's properties.
  r = await call("edit", { ids: [`${s2}.1`], atom_number: "7", hidden: false, bars: true, label_angle: 30, bold: true, size: 12, query: { substituents: "upto", n: 2, rings: "simple" } });
  assert.ok(!r.isError, text(r));
  const a1 = m.atoms[g2[0]];
  assert.equal(a1.number, "7"); assert.equal(a1.bars, true); assert.equal(a1.labelAngle, 30); assert.equal(a1.bold, true); assert.equal(a1.size, 12);
  assert.deepEqual(a1.query, { subst: { kind: "upto", n: 2 }, rings: "simple" });
  r = await call("edit", { ids: [`${s2}.1-2`], position: "left", spacing: 20, topology: "ring", reaction_centre: "change" });
  assert.ok(!r.isError, text(r));
  const b1 = m.bonds.find((b) => b.atoms.includes(g2[0]) && b.atoms.includes(g2[1]))!;
  assert.equal(b1.position, "left"); assert.equal(b1.spacing, 20); assert.equal(b1.topology, "ring"); assert.equal(b1.rxn, "change");
  const wasX = m.atoms[g2[0]].location[0];
  r = await call("edit", { ids: [s2], rotate: 90, perspective: true, stereo_labels: true, atom_numbers: true, aromatic_circles: true });
  assert.ok(!r.isError, text(r));
  assert.notEqual(m.atoms[g2[0]].location[0], wasX);
  assert.ok(g2.every((i) => m.atoms[i].shade), "perspective"); assert.ok(g2.every((i) => m.atoms[i].cip), "stereo labels"); assert.ok(g2.every((i) => m.atoms[i].circle), "aromatic circles");
  assert.deepEqual(g2.map((i) => m.atoms[i].number).sort(), g2.map((_, k) => String(k + 1)).sort(), "atom numbers");
  assert.match(text(await call("edit", { ids: [s2], charge: 1 })), /takes no charge/);
  r = await call("edit", { ids: [s2, `${s1}.1`], ignore_warnings: true });
  assert.ok(!r.isError, text(r));
  assert.ok(g2.every((i) => m.atoms[i].ignoreWarnings) && m.atoms[0].ignoreWarnings, "Display Warnings off");
  // A problem on an atom with Display Warnings off is not a warning (as the window hides it).
  r = await call("edit", { ids: [`${s2}.1`], charge: 3 });
  assert.ok(!JSON.parse(text(await call("read_drawing", {}))).warnings.some((w: { at?: string }) => w.at === `${s2}.1`), "hidden problem not listed");
  // Text: conditions on an arrow (Add conditions above), kept on it; freed again with arrow none.
  fresh();
  r = await call("draw_reaction", { start: [{ text: "toluene" }], steps: [{ products: [{ text: "phenol" }] }] });
  const made2 = ((r as any).structuredContent.made as string[]).filter((x) => x.startsWith("s")), arrow = `a${m.arrows![0].id}`;
  r = await call("add_text", { text: "KOH, 300 °C", arrow, side: "above", italic: true, colour: "#7F7F7F" });
  assert.ok(!r.isError, text(r));
  let c = m.captions!.find((x) => x.text === "KOH, 300 °C")!;
  assert.deepEqual(c.on, { arrow: m.arrows![0].id, side: "above" });
  assert.equal(c.italic, true); assert.equal(c.colour, "#7F7F7F");
  r = await call("edit", { ids: [`t${c.id}`], side: "below", font: "Helvetica", width: 6, line_height: "variable" });
  assert.ok(!r.isError, text(r));
  c = m.captions!.find((x) => x.id === c.id)!;
  assert.equal(c.on!.side, "below"); assert.equal(c.font, "Helvetica"); assert.equal(c.width, 6); assert.equal(c.lineHeight, "variable");
  r = await call("edit", { ids: [`t${c.id}`], arrow: "none" });
  assert.ok(!r.isError, text(r));
  assert.equal(m.captions!.find((x) => x.id === c.id)!.on, undefined);
  r = await call("add_text", { text: "x", arrow: "a999", side: "above" });
  assert.ok(r.isError);
  // Arrows: an orbital, and every property of a block arrow.
  r = await call("add_arrow", { kind: "orbital", from: `${made2[0]}.1`, to: [5, 5], orbital_shape: "p", orbital_phase: "phased", line_width: 1.5 });
  assert.ok(!r.isError, text(r));
  const orb = m.arrows!.find((x) => x.kind === "orbital")!;
  assert.deepEqual(orb.orbital, { shape: "p", phase: "phased" }); assert.equal(orb.width, 1.5);
  r = await call("add_arrow", { kind: "block", from: [0, -8], to: [6, -8], head_size: "medium", shaft: 4, fill: "shaded" });
  assert.ok(!r.isError, text(r));
  const blk = m.arrows!.find((x) => x.kind === "block")!;
  assert.equal(blk.shaft, 4); assert.equal(blk.fill, "shaded"); assert.equal(blk.headSize!.length, 6);
  r = await call("edit", { ids: [`a${blk.id}`], ratio: 2, rotate: 90, head_size: { length: 10, centre: 8, width: 3 } });
  assert.ok(!r.isError, text(r));
  const turned = m.arrows!.find((x) => x.id === blk.id)!;
  assert.equal(turned.ratio, 2); assert.deepEqual(turned.headSize, { length: 10, centre: 8, width: 3 });
  assert.ok(Math.abs(turned.from[0] - turned.to[0]) < 1e-6, "turned upright");
  assert.match(text(await call("add_arrow", { kind: "reaction", from: [0, -12], to: [5, -12], orbital_shape: "p" })), /go on an orbital/);
  // Shapes: a highlight (behind the rest), one round an atom's label alone, a TLC plate, a table, a picture, brackets.
  r = await call("add_shape", { kind: "highlight", around: [made2[0]] });
  assert.ok(!r.isError, text(r));
  assert.equal(m.shapes![0].kind, "highlight");
  r = await call("add_shape", { kind: "oval", around: [`${made2[0]}.1`] });
  assert.ok(!r.isError, text(r));
  const disc = m.shapes!.find((x) => x.kind === "oval")!, l = m.atoms[fragments(m)[0][0]].location;
  assert.ok(Math.abs(disc.to[0] - disc.from[0]) < 2 && Math.abs((disc.from[0] + disc.to[0]) / 2 - l[0]) < 0.1, `round the atom, not the structure: ${JSON.stringify(disc)}`);
  r = await call("add_shape", { kind: "tlc", box: [10, 0, 14, 5], tlc: { lanes: 3, spots: [{ lane: 0, rf: 0.4 }, { lane: 2, rf: 0.7, style: "hollow", tail: 0.3 }], rf: true, ticks: true } });
  assert.ok(!r.isError, text(r));
  const plate = m.shapes!.find((x) => x.kind === "tlc")!;
  assert.equal(plate.tlc!.lanes, 3); assert.equal(plate.tlc!.spots.length, 2); assert.equal(plate.tlc!.spots[1].style, "hollow"); assert.equal(plate.tlc!.rf, true); assert.equal(plate.tlc!.ticks, true);
  r = await call("add_shape", { kind: "table", box: [10, -8, 18, -2], table: { cells: [["Entry", "Yield"], ["1", "90%"]], lines: "grid", align: ["left", "right"] } });
  assert.ok(!r.isError, text(r));
  const table = m.shapes!.find((x) => x.kind === "table")!;
  assert.deepEqual(table.table!.cells, [["Entry", "Yield"], ["1", "90%"]]); assert.deepEqual(table.table!.lines, ["top", "bottom", "left", "right", "header", "rows", "cols"]);
  r = await call("edit", { ids: [`b${table.id}`], bold: true, size: 8, table: { lines: "journal" } });
  assert.ok(!r.isError, text(r));
  assert.equal(m.shapes!.find((x) => x.id === table.id)!.bold, true); assert.deepEqual(m.shapes!.find((x) => x.id === table.id)!.table!.lines, ["top", "header", "bottom"]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");
  r = await call("add_shape", { kind: "picture", box: [20, 0, 24, 3], png });
  assert.ok(!r.isError, text(r));
  assert.equal(m.shapes!.find((x) => x.kind === "picture")!.picture!.PNG, "89504E470D0A1A0A00000000");
  assert.match(text(await call("add_shape", { kind: "picture", box: [20, 0, 24, 3], png: "aGVsbG8=" })), /not a PNG/);
  assert.match(text(await call("add_shape", { kind: "picture", box: [20, 0, 24, 3] })), /needs png/);
  r = await call("add_shape", { kind: "brackets", around: [made2[1]], usage: "sru", bracket_label: "n", bracket_side: "right", line_width: 2, angle: 15 });
  assert.ok(!r.isError, text(r));
  const br = m.shapes!.find((x) => x.kind === "brackets")!;
  assert.deepEqual(br.polymer, { usage: "sru", label: "n" }); assert.equal(br.side, "right"); assert.equal(br.width, 2); assert.equal(br.angle, 15);
  r = await call("edit", { ids: [`b${br.id}`], kind: "oval", radius: 0.5, shade_depth: 0.3, shadow: true, rotate: 10 });
  assert.ok(!r.isError, text(r));
  const ov = m.shapes!.find((x) => x.id === br.id)!;
  assert.equal(ov.kind, "oval"); assert.equal(ov.radius, 0.5); assert.equal(ov.shade!.depth, 0.3); assert.equal(ov.shadow, true); assert.equal(ov.angle, 25);
  assert.match(text(await call("edit", { ids: [`b${ov.id}`], table: { cells: [["x"]] } })), /goes on a table/);
  // read_drawing reports highlights, and every shape with its kind.
  const seen = await call("read_drawing", { atoms: true });
  const sum = JSON.parse(text(seen));
  assert.ok(sum.shapes.some((x: { kind: string }) => x.kind === "tlc") && sum.shapes.some((x: { kind: string }) => x.kind === "picture"));
  // run_command: a menu command, an action with ids (selected first), and one Octet does not have.
  commands.length = 0;
  r = await call("run_command", { command: "halo.#FF0000", ids: [made2[0]] });
  assert.ok(!r.isError, text(r));
  assert.deepEqual([...picked.atoms].sort((p, q) => p - q), [...fragments(m)[0]].sort((p, q) => p - q));
  assert.deepEqual(commands, ["halo.#FF0000"]);
  r = await call("run_command", { command: "bring_front" });
  assert.ok(!r.isError, text(r));
  assert.ok(commands.includes("bring_front"));
  assert.match(text(await call("run_command", { command: "rotate_dialog" })), /dialog/);
  r = await call("run_command", { command: "shape.kind.hexagon" });
  assert.ok(r.isError); assert.match(text(r), /no command/);
  assert.ok((await call("run_command", { command: "halo.#FF0000", ids: ["s99"] })).isError);
  // place_template (8 November 2026): the whole library by name, from the Lab set, and a name the
  // library does not have.
  fresh();
  r = await call("place_template", { name: "Round-bottom flask" });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), /Placed Round-bottom flask from Lab\./);
  assert.ok((m.arrows?.length ?? 0) > 0, "the flask's pen lines are drawn");
  r = await call("place_template", { name: "Unobtainium flask" });
  assert.ok(r.isError); assert.match(text(r), /no template Unobtainium flask/);
  assert.ok((await call("place_template", { name: "ATP", set: "Nowhere" })).isError);
  // A structure over the arrow is the one given there, and the product the product (6 November 2026: they were read
  // products first and drawn structures first, so they swapped).
  fresh();
  r = await call("draw_reaction", { start: [{ text: "toluene" }], steps: [{ above: ["structure: water"], products: [{ text: "phenol", number: "2" }] }] });
  assert.ok(!r.isError, text(r));
  const over = fragments(m).find((g) => g.length === 1)!, prod = fragments(m).find((g) => g.length === 7 && g.some((i) => m.atoms[i].label === "O"))!;
  assert.equal(m.atoms[over[0]].label, "O");
  assert.ok(m.captions!.some((c) => c.text === "2" && c.under!.includes(prod[0])), "the number is under the product");

  // The scheme reads the same way round throughout: each product turned to lie as its starting material (Augmented
  // Clean Up Reaction), unless keep_orientation is false; like turns a structure as one drawn.
  const ringAngle = (g: number[]) => { const [p, q] = m.bonds.find((b) => g.includes(b.atoms[0]) && g.includes(b.atoms[1]) && m.atoms[b.atoms[0]].label === "C" && m.atoms[b.atoms[1]].label === "C")!.atoms.map((i) => m.atoms[i].location); return ((Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI + 360) % 60; };
  fresh();
  r = await call("draw_reaction", { start: [{ text: "Cc1ccccc1", rotate: 17 }], steps: [{ products: [{ text: "Oc1ccccc1" }] }], keep_orientation: false });
  assert.ok(!r.isError, text(r));
  let [ga, gb] = fragments(m);
  assert.ok(Math.abs(ringAngle(ga) - ringAngle(gb)) > 2, "unaligned, as a check of the check");
  fresh();
  r = await call("draw_reaction", { start: [{ text: "Cc1ccccc1", rotate: 17 }], steps: [{ products: [{ text: "Oc1ccccc1" }] }, { products: [{ text: "Oc1ccc(Br)cc1" }] }] });
  assert.ok(!r.isError, text(r));
  [ga, gb] = fragments(m);
  const gc = fragments(m)[2];
  assert.ok(Math.abs(ringAngle(ga) - ringAngle(gb)) < 1, `product as its reactant: ${ringAngle(ga)} vs ${ringAngle(gb)}`);
  assert.ok(Math.abs(ringAngle(ga) - ringAngle(gc)) < 1, `the next step too: ${ringAngle(ga)} vs ${ringAngle(gc)}`);
  fresh();
  r = await call("draw_structures", { structures: [{ text: "Cc1ccccc1", rotate: 17 }] });
  const ref = (r as any).structuredContent.made[0];
  r = await call("draw_structures", { structures: [{ text: "Clc1ccccc1", like: ref }] });
  assert.ok(!r.isError, text(r));
  [ga, gb] = fragments(m);
  assert.ok(Math.abs(ringAngle(ga) - ringAngle(gb)) < 1, `like: ${ringAngle(ga)} vs ${ringAngle(gb)}`);
  assert.match(text(await call("draw_structures", { structures: [{ text: "benzene", like: "s99" }] })), /no structure s99/);
}

// Lenient arguments (R5, plan section 6): a form with one meaning is read as the form the tool takes, and the reply
// says so in a line after the result (and in structuredContent.coerced). The look-alikes are in the refusals above.
{
  type Out = { content: { type: string; text?: string }[]; isError?: true; structuredContent?: { coerced?: string[]; made: string[] } };
  const lenient = async (name: string, args: unknown) => (await call(name, args)) as unknown as Out;
  const notes = (o: Out) => o.content.slice(1).flatMap((c) => (c.type === "text" ? c.text!.split("\n") : []));
  const under = () => m.captions!.filter((c) => c.under).map((c) => [c.text, !!c.bold]);
  // A number for a compound number, or for an atom's number, is its text.
  fresh();
  let o = await lenient("draw_structures", { structures: [{ text: "benzene", number: 13 }, { text: "water", number: 2 }] });
  assert.ok(!o.isError, text(o));
  assert.deepEqual(under(), [["13", true], ["2", true]]);
  assert.deepEqual(notes(o), ["Read number 13 as text, and 1 more the same way."]);
  // Only a whole number from 0 up: 2.5, -3 and 1e21 (which would be drawn as 1e+21) are no compound number.
  for (const number of [2.5, -3, 1e21]) { const no = await lenient("draw_structures", { structures: [{ text: "water", number }] }); assert.ok(no.isError && /structures\[0\]\.number: not text/.test(text(no)), `${number}: ${text(no)}`); }
  assert.equal(under().length, 2);
  assert.deepEqual(o.structuredContent!.coerced, notes(o));
  assert.ok(!text(o).includes("Read number"), "the result's own text is as it was");
  const benzene = o.structuredContent!.made[0];
  o = await lenient("set_number", { structure: "13", number: 14 });
  assert.deepEqual([under()[0], notes(o)], [["14", true], ["Read number 14 as text."]]);
  o = await lenient("edit", { ids: ["14"], number: 15 });
  assert.deepEqual([under()[0], notes(o)], [["15", true], ["Read number 15 as text."]]);
  o = await lenient("edit", { ids: [`${benzene}.1`], atom_number: 1 });
  assert.deepEqual([m.atoms[0].number, notes(o)], ["1", ["Read atom_number 1 as text."]]);
  // A call in the form the tool takes says nothing more.
  assert.equal((await call("set_number", { structure: "15", number: "16" })).content.length, 1);

  // An enum's value in other letters, after a dot, or by another of its names; a read's text stays its JSON.
  // The line quotes the value without the spaces, tabs and line breaks round it: one line a reading.
  for (const format of ["SMILES", ".smiles", " Smiles ", "smi", "\tSMILES\n"]) {
    o = await lenient("get_file", { format });
    assert.equal(text(o), "C1C=CC=CC=1.O", format);
    assert.deepEqual(notes(o), [`Read format ${format.trim()} as smiles.`]);
  }
  for (const [detail, full] of [["short", false], ["brief", false], ["Summary", false], ["FULL", true]] as const) {
    o = await lenient("read_drawing", { detail });
    assert.equal("captions" in JSON.parse(text(o)), full, detail);
    assert.deepEqual(notes(o), [`Read detail ${detail} as ${full ? "full" : "summary"}.`]);
  }
  o = await lenient("read_drawing", { detail: "summary" });
  assert.ok(!o.isError && o.content.length === 1 && !("captions" in JSON.parse(text(o))), "summary is the listed value");
  o = await lenient("export", { format: "JPEG" });
  assert.match(text(o), /JPG chosen/);
  assert.deepEqual(notes(o), ["Read format JPEG as jpg."]);
  o = await lenient("set_style", { preset: "nature" });
  assert.ok(!o.isError, text(o));
  assert.deepEqual([m.style?.preset, notes(o)], ["Nature", ["Read preset nature as Nature."]]);

  // A required argument left out takes its default: new_drawing {} is for quick.
  commands = [];
  o = await lenient("new_drawing", {});
  assert.ok(!o.isError, text(o));
  assert.deepEqual([commands, notes(o)], [["new_quick"], ['No "for" was given: read as quick.']]);
  o = await lenient("new_drawing", { for: ".Paper" });
  assert.deepEqual([commands, notes(o)], [["new_quick", "new_paper"], ["Read for .Paper as paper."]]);

  // "1 (taxol)" as a compound number is number 1 with the caption taxol, under the number. A caption can be given too.
  fresh();
  o = await lenient("draw_reaction", { start: [{ text: "ethanol", number: "2", caption: "from 3" }], steps: [{ products: [{ text: "water", number: "1 (paclitaxel)" }] }] });
  assert.ok(!o.isError, text(o));
  assert.deepEqual(under(), [["2", true], ["from 3", false], ["1", true], ["paclitaxel", false]]);
  assert.deepEqual(notes(o), ["Read number 1 (paclitaxel) as number 1 with the caption paclitaxel."]);
  assert.deepEqual((await read()).structures.map((x: { number: string }) => x.number), ["2", "1"]);
  // The summary has each caption on its structure's row, and not as free text.
  const rows = (await lenient("read_drawing", {})).structuredContent as unknown as { structures: { number: string; caption?: string }[]; text?: unknown };
  assert.deepEqual([rows.structures.map((x) => [x.number, x.caption]), rows.text], [[["2", "from 3"], ["1", "paclitaxel"]], undefined]);
  // replace_structure keeps the text under the structure, the caption too, and says so.
  o = await lenient("replace_structure", { structure: "1", text: "toluene" });
  assert.match(text(o), /^Replaced 1, which keeps its number 1 and its caption\./);
  assert.deepEqual(under(), [["2", true], ["from 3", false], ["1", true], ["paclitaxel", false]]);
  assert.ok(m.captions!.filter((c) => c.text === "1" || c.text === "paclitaxel").every((c) => c.under!.every((i) => m.atoms[i].label === "C") && c.under!.length === 7), "under the new structure");
  // A number with spaces or a line break round it: the line is one line.
  o = await lenient("draw_structures", { structures: [{ text: "water", number: " 6 (wet)\n" }] });
  assert.deepEqual([under().slice(-2), notes(o)], [[["6", true], ["wet", false]], ["Read number 6 (wet) as number 6 with the caption wet."]]);
  // In a figure the caption is the item's own; an item that has one keeps its number as given.
  fresh();
  o = await lenient("draw_figure", { panels: [{ rows: [[{ structure: "benzene", number: "4 (minor)" }, { structure: "water", number: "5 (a)", caption: "given" }]] }] });
  assert.ok(!o.isError, text(o));
  assert.deepEqual(m.captions!.map((c) => c.text).sort(), ["4", "5 (a)", "given", "minor"]);
  assert.deepEqual(notes(o), ["Read number 4 (minor) as number 4 with the caption minor."]);
  // Look-alikes stay one number: no space, two brackets, and set_number, which has no caption to give.
  fresh();
  o = await lenient("draw_structures", { structures: [{ text: "benzene", number: "1(taxol)" }, { text: "water", number: "2 (a) (b)" }] });
  assert.deepEqual([under(), notes(o)], [[["1(taxol)", true], ["2 (a) (b)", true]], []]);
  o = await lenient("set_number", { structure: "1(taxol)", number: "1 (taxol)" });
  assert.deepEqual([under()[0], notes(o)], [["1 (taxol)", true], []]);

  // "$1.made" where one id is needed: the one top-level object step 1 made (its number belongs to it).
  fresh();
  o = await lenient("batch", { steps: [{ tool: "draw_structures", args: { structures: [{ text: "benzene", number: 1 }] } }, { tool: "add_text", args: { text: "β-lactam", below: "$1.made" } }] });
  assert.ok(!o.isError, text(o));
  assert.deepEqual(notes(o), ["Read number 1 as text.", `Read $1.made as ${o.structuredContent!.made[0]}.`]);
  assert.ok(m.captions!.some((c) => c.text === "β-lactam" && !c.under));

  // A MOL file's text as a structure (V3000 and V2000, as get_file writes them, and with Windows line ends) is read
  // as that file. With its spaces made one it is no MOL file, and is refused.
  fresh();
  await call("draw_structures", { structures: [{ text: "benzene", number: "2" }] });
  const v3000 = toMolfile(parseStructure("Cc1ccccc1")), v2000 = toMolfile(parseStructure("Oc1ccccc1"), true);
  assert.ok(/V3000/.test(v3000) && /V2000/.test(v2000) && / {2}/.test(v2000));
  for (const [file, formula] of [[v3000, "C7H8"], [v2000, "C6H6O"], [v3000.replace(/\n/g, "\r\n"), "C7H8"]]) {
    o = await lenient("replace_structure", { structure: "2", text: file });
    assert.ok(!o.isError, text(o));
    assert.deepEqual([(await read()).structures.map((x: { formula: string; number: string }) => [x.formula, x.number]), notes(o)], [[[formula, "2"]], []]);
  }
  o = await lenient("draw_structures", { structures: [{ text: v2000 }] });
  assert.ok(!o.isError, text(o));
  assert.ok(!(await call("draw_structures", { structures: [{ text: " benzene\n" }] })).isError, "a name with a line break after it is a name, not a file");
  o = await lenient("replace_structure", { structure: "2", text: v2000.replace(/ {2,}/g, " ") });
  assert.ok(o.isError && /cannot read/.test(text(o)), text(o));

  // One compound drawn twice with one number (a scheme's product that starts the next scheme) is no warning; two
  // compounds with one number are.
  fresh();
  await call("draw_reaction", { start: [{ text: "ethanol" }], steps: [{ products: [{ text: "benzene", number: "7" }] }] });
  await call("draw_reaction", { start: [{ text: "benzene", number: "7" }], steps: [{ products: [{ text: "toluene", number: "8" }] }] });
  const twice = async () => (await read()).warnings.map((w: { message: string }) => w.message).filter((t: string) => /Compound number/.test(t));
  assert.deepEqual(await twice(), []);
  await call("set_number", { structure: "8", number: "7" });
  assert.deepEqual(await twice(), ["Compound number 7 is on more than one structure."]);

  // The schemas keep each reading to one meaning: no two values of an enum are the same in other letters, another
  // name is in small letters, is no value itself and names a value, and a default is a value of a required argument.
  // tools/list gives none of this: an AI app is told the one form.
  const walk = (s: any, at: string): void => {
    if (!s || typeof s !== "object") return;
    if (Array.isArray(s.enum)) {
      const small = s.enum.map((e: string) => e.toLowerCase());
      assert.equal(new Set(small).size, small.length, at);
      for (const [k, v] of Object.entries(s.also ?? {})) assert.ok(k === k.trim().toLowerCase() && !small.includes(k) && s.enum.includes(v), `${at}: ${k}`);
      if (s.default !== undefined) assert.ok(s.enum.includes(s.default), at);
    }
    if (s.type === "object") for (const [k, p] of Object.entries(s.properties) as [string, any][]) if (p.default !== undefined) assert.ok(s.required.includes(k), `${at}.${k}`);
    for (const [k, v] of Object.entries(s)) walk(v, `${at}.${k}`);
  };
  for (const t of TOOL_TABLE) walk(t.inputSchema, t.name);
  assert.ok(!/"(numeral|also|default)":/.test(JSON.stringify(tools)));
  assert.ok((tools.find((t) => t.name === "new_drawing")!.inputSchema as unknown as { required: string[] }).required.includes("for"));
}

// Short replies (R6, plan section 10). A write result is its sentence, the top-level objects made with their boxes,
// the new chemical warnings and the layout check; a read is a summary. detail: full gives all the data, as before.
{
  const ask = async (name: string, args: unknown) => (await call(name, args)) as { content: { type: string; text?: string }[]; isError?: true; structuredContent: Record<string, any> };
  const ESTER = { start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ reagents: ["H2SO4 (cat.)"], temperature: "reflux", yield: "90%", products: [{ text: "ethyl acetate", number: "1" }, { text: "water" }] }] };
  fresh();
  let o = await ask("draw_reaction", ESTER), sc = o.structuredContent;
  assert.deepEqual(Object.keys(sc), ["done", "made", "boxes", "warnings", "check"]);
  assert.equal(sc.done, "Drew the reaction. Octet laid it out with Clean Up Reaction. One undo step.", "what was done in a few words: no compound's name, no conditions again");
  // made: the four structures, the two plus signs and the arrow. The number and the conditions belong to those.
  const owned = m.captions!.filter((c) => c.under || c.on).map((c) => `t${c.id}`);
  assert.equal(sc.made.map((id: string) => id[0]).join(""), "sssstta");
  assert.ok(owned.length === 4 && !owned.some((id) => sc.made.includes(id)), JSON.stringify([owned, sc.made]));
  assert.deepEqual(Object.keys(sc.boxes), sc.made);
  assert.ok(Object.values(sc.boxes as Record<string, number[]>).flat().every((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9), "boxes to 0.1");
  // The text is the sentence, then the same data once: an AI app reads the text or structuredContent, not both.
  assert.equal(text(o), `${sc.done}\n${JSON.stringify({ ...sc, done: undefined })}`);
  assert.equal(o.content.length, 1);
  assert.ok(text(o).length < 400, `a reaction's reply: ${text(o).length} characters`);
  // The read's summary: each structure's id, number and formula, the route by number (by id with no number) with the
  // arrow's conditions, the check and the warnings. No boxes, SMILES, names or captions.
  const firstIds = sc.made.slice(0, 4), arrowId = sc.made[6];
  o = await ask("read_drawing", {});
  assert.deepEqual(o.structuredContent, {
    drawing: { id: "draw-1", title: "Untitled" }, style: "ACS Document 1996", page: "A4",
    structures: [{ id: firstIds[0], formula: "C2H4O2" }, { id: firstIds[1], formula: "C2H6O" }, { id: firstIds[2], number: "1", formula: "C4H8O2" }, { id: firstIds[3], formula: "H2O" }],
    reactions: [{ route: `${firstIds[0]} + ${firstIds[1]} -> 1 + ${firstIds[3]}`, conditions: { [arrowId]: "H2SO4 (cat.); reflux; 90%" } }],
    check: "clean", warnings: [],
  });
  assert.ok(text(o).length < 450, `a reaction's summary: ${text(o).length} characters`);
  // smiles: true adds each SMILES; ids reads only those; atoms adds the atoms and bonds; a drawing as a resource is the summary.
  o = await ask("read_drawing", { smiles: true, ids: ["1"] });
  assert.deepEqual(o.structuredContent.structures, [{ id: firstIds[2], number: "1", formula: "C4H8O2", smiles: "CCOC(=O)C" }]);
  assert.equal(o.structuredContent.reactions.length, 1);
  o = await ask("read_drawing", { atoms: true, ids: [firstIds[3]] });
  assert.deepEqual(Object.keys(o.structuredContent.structures[0]), ["id", "formula", "atoms", "bonds"]);
  assert.deepEqual(JSON.parse((await send("resources/read", { uri: "octet://drawing/draw-1" })).result.contents[0].text), (await ask("read_drawing", {})).structuredContent);
  // detail: full reads everything, as a read did before.
  const all = await read();
  assert.deepEqual(Object.keys(all.structures[2]), ["id", "smiles", "formula", "source", "number", "atoms", "box"]);
  assert.ok(all.captions.length === 6 && all.pageBox && all.reactions[0].steps[0].fields.reagents && all.arrows.length === 1, JSON.stringify(Object.keys(all)));
  // detail: full on a write: the drawing, every id made (the number and conditions too), changed and deleted, and
  // Octet's reading of each name. Other letters for it are read as it; another word is refused.
  fresh();
  o = await ask("draw_reaction", { ...ESTER, detail: "FULL" });
  sc = o.structuredContent;
  assert.deepEqual(Object.keys(sc), ["drawing", "done", "made", "changed", "deleted", "boxes", "names", "warnings", "check", "coerced"]);
  assert.equal(sc.made.length, 11);
  assert.deepEqual(sc.names.map((x: { given: string }) => x.given), ["acetic acid", "ethanol", "ethyl acetate", "water"]);
  assert.deepEqual(sc.coerced, ["Read detail FULL as full."]);
  o = await ask("delete", { ids: ["1"], detail: "long" });
  assert.ok(o.isError && /detail: not one of summary, full/.test(text(o)), text(o));
  assert.ok((await call("batch", { steps: [{ tool: "delete", args: { ids: ["1"], detail: "long" } }] })).isError);
  // A batch is short too: each step's sentence and the top-level objects made. Its steps' ids come with detail: full.
  o = await ask("batch", { steps: [{ tool: "draw_structures", args: { structures: [{ text: "benzene", number: "9" }] } }, { tool: "add_text", args: { text: "note", below: "$1.s[0]" } }] });
  assert.deepEqual([Object.keys(o.structuredContent), o.structuredContent.made.map((id: string) => id[0])], [["done", "made", "boxes", "warnings", "check"], ["s", "t"]]);
  assert.match(text(o), /^Did 2 steps as one undo step:\n1\. Drew 1 structure in 1 row of 1\.\n2\. /);
  // tools/list gives detail on the read only (23 more copies would be 1,200 characters in every chat): the
  // instructions say it once, and every tool whose result is a change takes it.
  assert.deepEqual(tools.filter((t) => "detail" in (t.inputSchema as unknown as { properties: object }).properties).map((t) => t.name), ["read_drawing"]);
  assert.equal(TOOL_TABLE.filter((t) => "detail" in t.inputSchema.properties).length, 24);
  assert.match((await send("initialize", {})).result.instructions, /detail: 'full' on any write call adds all it changed, with boxes\./);
  assert.ok(!/"unlisted"/.test(JSON.stringify(tools)));
  // What the tools' own text says is as a default result is: a command's changes come with detail: full, and a
  // compound's caption is named where its number is.
  const described = (name: string) => tools.find((t) => t.name === name)!.description;
  assert.ok(/detail: full lists what changed\.$/.test(described("run_command")) && !/The result lists/.test(described("run_command")));
  assert.ok(/caption \(text under the number\)/.test(described("draw_structures")) && /number, caption and the hints/.test(described("draw_reaction")) && /\(id, number, caption, formula\)/.test(described("read_drawing")));
  // A reaction's plus signs are made, with their boxes: each has its own place, so a move of what a call made takes
  // all of the reaction (a plus sign left out of made would stay behind).
  fresh();
  o = await ask("draw_reaction", ESTER);
  const plusAt = () => m.captions!.filter((c) => c.text === "+").map((c) => Math.round(c.y * 10) / 10), level = plusAt();
  assert.ok(!(await ask("move", { ids: o.structuredContent.made, dy: -5 })).isError);
  assert.deepEqual([level.length, plusAt()], [2, level.map((y) => y - 5)]);
  // A batch step that asks for detail: full gets the layout's new warnings only, as a call does: the warnings there
  // were before the batch are not new. (A short result does not work the layout's warnings out at all.)
  fresh();
  await ask("draw_structures", { structures: [{ text: "phenol" }], at: [-900, 900] });
  o = await ask("batch", { steps: [{ tool: "draw_structures", args: { structures: [{ text: "water" }], at: [0, 0], detail: "full" } }] });
  assert.deepEqual([o.structuredContent.warnings, /Octet warns/.test(o.structuredContent.done)], [[], false]);
  o = await ask("batch", { steps: [{ tool: "draw_structures", args: { structures: [{ text: "water" }], at: [900, 900], detail: "full" } }] });
  assert.ok(o.structuredContent.warnings.length === 1 && /runs past the page's right and top edge/.test(o.structuredContent.warnings[0]), JSON.stringify(o.structuredContent.warnings));

  // The sentence names a compound only where Octet read a name as another name (decision 0021, misread names): the
  // name given, the formula and Octet's own name. A SMILES is drawn as given: it has no name in the sentence, and
  // Octet does not work one out for it (naming takes time) until detail: full asks for every name.
  const name = host.name;
  let namings = 0;
  host.name = (x) => { namings++; return { C9H8O4: "2-acetyloxybenzoic acid", C8H10N4O2: "Caffeine", C7H6O3: "2-hydroxybenzoic acid" }[analyse(x)?.[0]?.formula ?? ""] ?? `${"a".repeat(130)}ne`; };
  Object.assign(NAMES, { aspirin: "CC(=O)Oc1ccccc1C(=O)O", caffeine: "Cn1cnc2c1c(=O)n(C)c(=O)n2C", ...Object.fromEntries(Array.from({ length: 14 }, (_, k) => [`alkane ${k}`, "C".repeat(k + 11)])) });
  fresh();
  o = await ask("draw_structures", { structures: [{ text: "aspirin" }, { text: "caffeine" }, { text: "OC(=O)c1ccccc1O" }] });
  assert.equal(o.structuredContent.done, "Drew 3 structures in 1 row of 3. Octet read the names as: aspirin (C9H8O4; Octet's name: 2-acetyloxybenzoic acid). One undo step.");
  assert.equal(namings, 2, "the two names, not the SMILES");
  o = await ask("draw_structures", { structures: [{ text: "OC(=O)c1ccccc1O" }], detail: "full" });
  assert.deepEqual([namings, o.structuredContent.names], [3, [{ given: "OC(=O)c1ccccc1O", octet: "2-hydroxybenzoic acid", formula: "C7H6O3" }]]);
  // A batch joins its steps' sentences: 40 steps of 12 such names are 80,000 characters. The default reply is cut to
  // fit the limit and says so; detail: full gives all of it.
  const many = { steps: Array.from({ length: 40 }, () => ({ tool: "draw_structures", args: { structures: Array.from({ length: 12 }, (_, k) => ({ text: `alkane ${k}` })) } })) };
  o = await ask("batch", many);
  const size = o.content.reduce((k, c) => k + (c.text?.length ?? 0), 0);
  assert.ok(size <= MOST && size > MOST - 100, `a batch of 40 steps: ${size} characters`);
  assert.ok(/^Did 40 steps as one undo step:\n1\. Drew 12 structures in 3 rows of 5\. Octet read the names as: alkane 0 .*… \(cut: detail: full gives all of it\)$/s.test(o.structuredContent.done) && text(o).startsWith(`${o.structuredContent.done}\n{"made":[`), o.structuredContent.done.slice(-200));
  fresh();
  o = await ask("batch", { steps: many.steps.map((st) => ({ ...st, args: { ...st.args, detail: "full" } })) });
  assert.ok(/^40\. Drew 12 structures .*alkane 11 \(C22H46; Octet's name: a{120}…\)\./.test(o.structuredContent.done.split("\n")[40]) && !o.structuredContent.done.includes("(cut:"), "detail: full gives every step");
  // Twelve names at most in a sentence, each of Octet's cut at 120 characters, and how many more there are.
  fresh();
  o = await ask("draw_structures", { structures: Array.from({ length: 14 }, (_, k) => ({ text: `alkane ${k}` })) });
  assert.match(o.structuredContent.done, /^Drew 14 structures in 3 rows of 5\. Octet read the names as: alkane 0 \(C11H24; Octet's name: a{120}…\), .*alkane 11 \(C22H46; Octet's name: a{120}…\), and 2 more \(detail: full gives each\)\. One undo step\.$/);
  host.name = name;

  // A route's arrows by kind; a number that is on two structures, or is an id's form, gives way to the id.
  fresh();
  o = await ask("draw_reaction", { start: [{ text: "benzene", number: "1" }], steps: [{ arrow: "equilibrium", products: [{ text: "toluene", number: "s9" }] }, { arrow: "retro", products: [{ text: "phenol", number: "1" }] }, { arrow: "resonance", products: [{ text: "water", number: "4a" }] }, { arrow: "nogo", products: [{ text: "ethanol" }] }] });
  const [b1, t2, p3, , e5] = o.structuredContent.made;
  sc = (await ask("read_drawing", {})).structuredContent;
  assert.equal(sc.reactions[0].route, `${b1} <=> ${t2} => ${p3} <-> 4a -/-> ${e5}`);
  // An arrow with no conditions is still in conditions, with "": its id is how add_text and edit name it, and a
  // reaction's arrows are listed nowhere else in a summary.
  assert.deepEqual(sc.reactions[0].conditions, Object.fromEntries(o.structuredContent.made.filter((id: string) => id[0] === "a").map((id: string) => [id, ""])));
  assert.equal(Object.keys(sc.reactions[0].conditions).length, 4);
  assert.deepEqual(sc.warnings, [{ message: "Compound number 1 is on more than one structure." }]);

  // A salt's two ions under one number are one compound: the route names both by the number (a number counts once
  // for each time it is drawn, not once for each structure under it).
  fresh();
  await ask("draw_reaction", { start: [{ text: "[Na+].[Cl-]", number: "5" }], steps: [{ products: [{ text: "water", number: "6" }] }] });
  assert.match((await ask("read_drawing", {})).structuredContent.reactions[0].route, /^5 (\+ 5 )?-> 6$/);

  // Warnings: a short reply gives the first ten, each at its atom in a read, and how many more there are. The
  // layout is in the check, by id, and not in the warnings again.
  fresh();
  o = await ask("draw_structures", { structures: [{ text: Array(12).fill("CC(C)(C)(C)C").join(".") }, { text: "toluene" }], at: [900, 900] });
  assert.deepEqual([o.structuredContent.warnings.length, o.structuredContent.more], [10, { warnings: 2 }]);
  assert.ok(o.structuredContent.check.off_page.length && !/page/.test(o.structuredContent.warnings.join()), JSON.stringify(o.structuredContent.check));
  sc = (await ask("read_drawing", {})).structuredContent;
  assert.deepEqual([sc.warnings.length, sc.more, sc.warnings[0].at], [10, { warnings: 2 }, `${o.structuredContent.made[0]}.2`]);
  assert.deepEqual(sc.check, o.structuredContent.check);
  assert.ok(!sc.warnings.some((w: { message: string }) => /page/.test(w.message)));
  // Read by id, the check is of those ids.
  assert.equal((await ask("read_drawing", { ids: ["s999"] })).isError, true);
  const lone = await ask("draw_structures", { structures: [{ text: "water" }], at: [0, 0] });
  assert.equal((await ask("read_drawing", { ids: lone.structuredContent.made })).structuredContent.check, "clean");
  // With detail: full a write's warnings are all of them, the layout's too, and the sentence gives the first ten.
  o = await ask("draw_structures", { structures: [{ text: "phenol" }], at: [-900, 900], detail: "full" });
  assert.match(o.structuredContent.done, /Octet warns: .*runs past the page's left and top edge/);
  assert.ok(o.structuredContent.warnings.some((w: string) => /runs past the page/.test(w)));

  // No default reply is over 20,000 characters, whatever is drawn (every call in this file is held to it too). A
  // result lists 200 objects made at most; a read cuts its longest lists. more says how many each left out.
  fresh();
  o = await ask("add_file", { text: Array(250).fill("C").join(".") });
  assert.deepEqual([o.structuredContent.made.length, Object.keys(o.structuredContent.boxes).length, o.structuredContent.more], [200, 200, { made: 50 }]);
  o = await ask("read_drawing", {});
  assert.equal(o.structuredContent.structures.length, 250);
  m = { ...m, captions: Array.from({ length: 3000 }, (_, k) => ({ id: 5000 + k, text: `A note ${k} `.repeat(40), x: 0, y: -10 - k })) };
  o = await ask("read_drawing", {});
  sc = o.structuredContent;
  assert.ok(text(o).length <= MOST && text(o).length > MOST / 2, `${text(o).length} characters`);
  assert.ok(sc.text.length > 20 && sc.structures.length > 20 && sc.text.length + sc.more.text === 3000 && sc.structures.length + (sc.more.structures ?? 0) === 250, JSON.stringify(sc.more));
  assert.ok(sc.text[0].text.length === 201 && sc.text[0].text.endsWith("…"), "free text in a summary is cut at 200 characters");
  assert.equal(sc.more.rest, "detail: full reads all", "a cut read says how to read the rest");
  assert.ok(text(await ask("read_drawing", { detail: "full" })).length > 10 * MOST, "detail: full reads all of it");
}

console.log("mcp: protocol, argument checks and tools pass.");
