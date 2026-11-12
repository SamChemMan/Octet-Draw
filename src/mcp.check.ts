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
const { analyse, analyseCompound, expandLabels, mapReaction, parseStructure, ready, toMolfile, toSmiles } = await import("./chem.ts");
const { problems } = await import("./check.ts");
const { DEFAULT_STYLE, pageSize } = await import("./docstyle.ts");
const { EMPTY, fragments } = await import("./edit.ts");
const { TRANSFORMATIONS } = await import("./compound.ts");
const { findReaction } = await import("./reaction.ts");
const { formulaWeight, parseAmount } = await import("./stoich.ts");
const { handle, MAX_TEXT, resetIds, TOOL_NAMES, TOOL_TABLE, OP_TABLE } = await import("./mcp.ts");
const { NOTATION } = await import("./notation.ts");
const { strict } = await import("../scripts/headless/listed.ts");
type Mol = import("./render.ts").Mol;
type Host = import("./mcp.ts").Host;
type Box = import("./render.ts").Box;
await ready;

// The editor's stand-in: a drawing, its undo steps, its selection and what it told the user.
const NAMES: Record<string, string> = { "acetic acid": "CC(=O)O", ethanol: "CCO", "ethyl acetate": "CCOC(C)=O", water: "O", benzene: "c1ccccc1", toluene: "Cc1ccccc1", phenol: "Oc1ccccc1" };
let m: Mol = EMPTY, steps: string[] = [], open = 0, said: string[] = [], picked = { atoms: [] as number[], items: [] as number[] }, experiment = false, commands: string[] = [], shown: Box | undefined, windowless = false, readied: (boolean | undefined)[] = [];
// A box to type in or a dialog the last command left open (asking), and how often Escape closed one (dismiss).
let asking = false, dismissed = 0;
// What the window shows of an AI app at work after each Host.working: the text, whether Stop is offered, how far. As
// in Editor, a call that says how far the call is changes only that.
let far: [string | undefined, boolean, string | undefined][] = [];
// The notice the window shows now, with its Stop, to press it.
let notice: { text: string; stop?: () => void } | undefined;
const ink = (atoms: number[]): Box | undefined => {
  const ps = atoms.map((i) => m.atoms[i]?.location).filter(Boolean);
  return ps.length ? [Math.min(...ps.map((p) => p[0])) - 0.3, Math.min(...ps.map((p) => p[1])) - 0.3, Math.max(...ps.map((p) => p[0])) + 0.3, Math.max(...ps.map((p) => p[1])) + 0.3] : undefined;
};
// (Text kept on an arrow is placed as the renderer draws it, which the stand-in does not do: it has no box here. Text
// under a structure is centred under its atoms, as the renderer puts it.)
const captionBox = (id: number): Box | undefined => {
  const c = m.captions?.find((x) => x.id === id), b = c?.under?.length ? ink(c.under) : undefined, [x, y] = b ? [(b[0] + b[2]) / 2, b[1] - 1] : [c?.x ?? 0, c?.y ?? 0];
  return c && !c.on ? [x - c.text.length * 0.2, y - 0.3, x + c.text.length * 0.2, y + 0.4] : undefined;
};
const host: Host = {
  doc: () => m, style: () => m.style ?? DEFAULT_STYLE, ready: async (names) => { readied.push(names); },
  structure: (t) => { const s = NAMES[t] ?? t; try { const x = parseStructure(s); return x.atoms.length ? x : undefined; } catch { return undefined; } },
  tidy: (x) => x, named: (t) => t in NAMES,
  begin: (step) => { steps.push(step); open++; }, end: (made) => { open--; shown = made; },
  set: (x) => { assert.equal(open, 1, "a change outside its undo step"); return (m = x); }, settle: async () => {},
  cleanReactions: (ids) => ids.size, tidyCycle: () => {}, command: (id) => { commands.push(id); return id === "undo" || id.startsWith("new_") || id.startsWith("arrange_") || id === "centre_page"; }, newWindow: () => undefined,
  act: (id) => { commands.push(id); return true; }, map: (r, p) => mapReaction(r, p),
  reaction: (id) => findReaction(m, id, m.arrows ?? [], ink, captionBox), ink, textBox: captionBox, labelBox: (i) => { const a = m.atoms[i]; if (!a || (!a.text && a.label === "C")) return undefined; const w = (a.text ?? a.label).length * 0.3; return [a.location[0] - 0.2, a.location[1] - 0.3, a.location[0] - 0.2 + w, a.location[1] + 0.3]; }, tables: () => [], fileText: (f, _, o) => (f === "smiles" ? toSmiles(expandLabels(m)) : f === "pdf" ? Promise.resolve(JSON.stringify(o)) : undefined), inchi: () => ({}), reagent: (t) => { const w = formulaWeight(t); return w ? { formula: t, weight: w } : undefined; },
  problems: () => problems(m), smiles: (x) => toSmiles(expandLabels(x)), formula: (x) => analyseCompound(x)?.formula, name: () => undefined,
  picture: async () => "iVBOR", centre: () => [0, 0], restyle: (s) => { m = { ...m, style: s }; }, experiment: () => experiment,
  said: (t) => said.push(t), working: (text, stop, at) => { if (!at) notice = text ? { text, stop } : undefined; far.push([notice?.text, !!notice?.stop, at]); }, selection: () => picked, select: (atoms, items) => { picked = { atoms, items }; },
  file: (t) => host.structure(t), export: () => true, dialog: (id) => id === "print" || id === "rotate_dialog", windowless: () => windowless,
  asking: () => asking, dismiss: () => { asking = false; dismissed++; },
  opens: async (t) => (t.startsWith("<bad") ? { failed: "Octet cannot open this file. This ChemDraw file is damaged." } : t.startsWith("<lost") ? { lost: "2 bogus" } : {}),
  window: () => ({ id: "draw-1", name: "Untitled" }), windows: async () => [], target: async () => true,
};
let n = 0;
// Each session's brief (set_brief), as mcp.rs keeps it: a new session has none.
const briefs = new Map<string, string>();
const as = (session: string) => ({ client: "Test", session, brief: briefs.get(session), keep: (b: string) => void briefs.set(session, b) });
const send = async (method: string, params?: unknown, session = "s-1") => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }), () => host, "1.2.0", as(session)));
// A value against a tool's outputSchema (the parts of JSON Schema the tools use).
const fits = (s: any, v: any): boolean => !s?.type || (s.type === "object" ? !!v && typeof v === "object" && !Array.isArray(v) && (s.required ?? []).every((k: string) => v[k] !== undefined) && Object.entries(s.properties ?? {}).every(([k, p]) => v[k] === undefined || fits(p, v[k])) : s.type === "array" ? Array.isArray(v) && v.every((x) => fits(s.items, x)) : typeof v === s.type);
// The most characters a reply has when nothing more was asked for (no detail: full, atoms, picture or file): test plan P2.
const MOST = 20_000;
// The operation a call is, as mcp.ts routes it: a draw's kind, a change's one operation (batch for more), an advanced
// tool, a read or a file, a drawings action.
const opOf = (name: string, a: any): string | undefined => {
  const first = a?.operations?.[0];
  return name === "set_brief" ? "brief" : name === "draw_route" ? "route" : name === "draw" ? a?.kind : name === "change" ? (a?.operations?.length > 1 ? "batch" : first?.op === "draw" ? first.kind : first?.op) : name === "advanced" ? a?.tool : name === "read" ? (a && typeof a === "object" && "format" in a ? "file" : "read") : (a?.action ?? "list");
};
// Every call in these checks: its structuredContent fits the tool's outputSchema (the specification's MUST) and its
// operation's own, which says more; and a default reply is at most MOST characters.
const call = async (name: string, args: any, session?: string) => {
  const asked = JSON.stringify(args ?? null), op = opOf(name, args), out = (await send("tools/call", { name, arguments: args }, session)).result as { content: { type: string; text?: string; data?: string }[]; isError?: true; structuredContent?: any };
  if (out.structuredContent) for (const schema of [TOOL_TABLE.find((t) => t.name === name)?.outputSchema, OP_TABLE.find((t) => t.name === op)?.outputSchema]) assert.ok(fits(schema, out.structuredContent), `${name} ${op}: structuredContent does not fit its outputSchema: ${JSON.stringify(out.structuredContent).slice(0, 300)}`);
  const size = out.content.reduce((k, c) => k + (c.text?.length ?? 0), 0);
  if (op !== "file" && !/"detail":"full"|"atoms":true/i.test(asked)) assert.ok(size <= MOST, `${name} ${op}: a default reply of ${size} characters`);
  return out;
};
const text = (r: { content: { text?: string }[] }) => r.content[0].text!;
const fresh = () => { m = EMPTY; steps = []; said = []; far = []; picked = { atoms: [], items: [] }; experiment = false; };
// The drawing in full (a read's default is the summary, checked on its own below).
const read = async () => JSON.parse(text(await call("read", { detail: "full" })));

// The protocol: initialize answers the version asked for (or the newest), with Octet's instructions.
let r = await send("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } });
assert.equal(r.result.protocolVersion, "2025-06-18");
assert.equal(r.result.serverInfo.name, "octet-draw");
assert.match(r.result.instructions, /make ONE draw call with lines: a reaction, a scheme, every scheme of a route/);
assert.equal((await send("initialize", { protocolVersion: "1999-01-01" })).result.protocolVersion, "2025-11-25");
assert.deepEqual((await send("ping")).result, {});
// Six tools are listed (plan 5.1; set_brief, plan 3.1), each with a closed object schema and hints. draw_route is
// lines of draw now (plan 19.2), and advanced's: it is callable by its name, for scripts, but not listed.
const tools = (await send("tools/list")).result.tools as { name: string; description: string; inputSchema: { type: string; additionalProperties: boolean; properties: Record<string, any> }; annotations: { readOnlyHint: boolean } }[];
assert.deepEqual(tools.map((t) => t.name), ["draw", "change", "read", "drawings", "advanced", "set_brief"]);
assert.deepEqual(tools.map((t) => t.name), TOOL_NAMES);
// Claude Code loads every tool at once (alwaysLoad): one that waits for a tool search costs a turn before its first
// call, which a restyle or a help call paid (plan 19.10).
assert.deepEqual(tools.map((t) => (t as { _meta?: unknown })._meta), Array(6).fill({ "anthropic/alwaysLoad": true }));
for (const t of tools) assert.ok(t.inputSchema.type === "object" && t.inputSchema.additionalProperties === false, t.name);
// A v1 name is no tool (Sam, 11 November 2026: no compatibility layer).
for (const name of ["draw_reaction", "read_drawing", "edit", "batch", "run_command", "structures", "help"]) assert.equal((await send("tools/call", { name, arguments: {} })).error.code, -32602, name);
// The list is read at the start of every chat (test plan P4, A5): under 14,000 characters, about 4,000 tokens. The
// 26 tools of v1 were 59,900.
assert.ok(JSON.stringify(tools).length < 14_000, `tools/list: ${JSON.stringify(tools).length} characters`);
// Real Claude Code runs (plan 19.10): the models tried RDKit in the shell on their own SMILES before they drew. draw says not to.
assert.match(tools.find((t: { name: string }) => t.name === "draw").description, /do not test a name or SMILES with other tools first/);
// The scripting page (docs/scripting.md, plan 18.2) cannot drift: its table of tools is the tools tools/list gives, and
// each file it shows (### name, then its code) is the file in scripts/examples as it is.
{
  const page = readFileSync(new URL("../docs/scripting.md", import.meta.url), "utf8");
  assert.deepEqual([...page.matchAll(/^\| `(\w+)` \|/gm)].map((m) => m[1]), tools.map((t) => t.name), "the scripting page's table of tools");
  // Its rows for change and advanced name each operation and tool those take.
  const ops = { change: tools[1].inputSchema.properties.operations.items.properties.op.enum, advanced: tools[4].inputSchema.properties.tool.enum } as Record<string, string[]>;
  for (const [name, list] of Object.entries(ops)) { const row = page.match(new RegExp(`^\\| \`${name}\` \\|.*$`, "m"))![0]; for (const op of list) assert.ok(row.includes(`\`${op}\``), `the scripting page's ${name} row names ${op}`); }
  const shown = [...page.matchAll(/^### (\S+)\n\n```\w+\n([\s\S]*?)```$/gm)];
  assert.equal(shown.length, 10, "the client and four examples, in Python and JavaScript");
  for (const [, file, code] of shown) assert.equal(code, readFileSync(new URL(`../scripts/examples/${file}`, import.meta.url), "utf8"), `docs/scripting.md shows scripts/examples/${file} as it is`);
}
// draw's JSON compound says what its text takes, and what a change's at names, as the JSON form needs them.
{
  const c = (tools[0].inputSchema as any).$defs.compound.properties;
  assert.ok(c.text.description.includes("CAS number, SMILES, InChI or MOL file") && /map number given in a SMILES, with its hydrogens \(\[C@H:7\]\)/.test(c.changes.description) && c.changes.description.includes("occurrence: 2"));
}
// Each tool's schema stands alone (some AI apps do not look outside it): every reference in it has its definition in
// its own $defs, and it lists no other piece. draw lists the compound once, however many places take one, and a place
// beside (an id or ids) once for its four sides. draw_route's compounds are as draw's, which its description says.
const refsIn = (schema: object) => [...JSON.stringify(schema).matchAll(/"\$ref":"([^"]*)"/g)].map((x) => x[1]);
const alone = (schema: { $defs?: Record<string, unknown> }, at: string) => assert.deepEqual(Object.keys(schema.$defs ?? {}).map((k) => `#/$defs/${k}`).sort(), [...new Set(refsIn(schema))].sort(), at);
for (const t of tools as unknown as { name: string; inputSchema: { $defs?: Record<string, { properties: Record<string, unknown> }> } }[]) {
  alone(t.inputSchema, t.name);
  assert.equal(refsIn(t.inputSchema).length, { draw: 5 }[t.name] ?? 0, t.name);
  // The hints that turn a compound as a picture shows it are listed (plan 19.2: the eval agents called help for them).
  if (t.name === "draw") assert.deepEqual(Object.keys(t.inputSchema.$defs!.compound.properties), ["text", "labels", "from", "changes", "number", "caption", "up", "down", "left", "right", "rotate", "flip"]);
}
// A compound's changes are typed where draw lists them (plan 4.2.1, left for this step).
assert.deepEqual(Object.keys((tools[0].inputSchema as any).$defs.compound.properties.changes.items.properties), ["swap", "occurrence", "at", "set", "add", "remove", "bond", "to"]);
// Nothing the tools list is something Octet refuses: each argument a tool lists is one that an operation of the
// tool takes, of the same type, and each value it lists for one is a value that operation takes.
{
  // The pieces the operations refer to (the whole compound, text that can be runs), as advanced help gives them.
  const pieces: Record<string, any> = {};
  for (const kind of ["structures", "figure"]) Object.assign(pieces, (await call("advanced", { tool: "help", args: { of: kind } })).structuredContent.arguments.$defs);
  const types = (x: any): string => (x?.$ref ? "ref" : x?.type);
  const within = (listed: any, own: any, at: string) => {
    if (own?.$ref && !listed.$ref) own = pieces[own.$ref.slice("#/$defs/".length)];
    // (A piece only the list names, such as draw's place beside, is read from the list's own $defs.)
    if (listed.$ref && !own?.$ref) listed = tools.map((t) => (t.inputSchema as any).$defs?.[listed.$ref.slice("#/$defs/".length)]).find(Boolean);
    if (own.additionalProperties === true) return;
    if (listed.anyOf) return listed.anyOf.forEach((form: any, k: number) => within(form, own, `${at}|${k}`));
    if (own.anyOf) return void assert.ok(own.anyOf.some((form: any) => types(form) === types(listed)), at);
    assert.equal(types(listed), types(own), at);
    if (listed.enum) assert.ok(listed.enum.every((v: string) => own.enum?.includes(v)), at);
    if (listed.items) within(listed.items, own.items, `${at}[]`);
    for (const [k, p] of Object.entries(listed.properties ?? {})) { assert.ok(own.properties[k], `${at}.${k}`); within(p, own.properties[k], `${at}.${k}`); }
  };
  const ops = (names: string[]) => names.map((n) => OP_TABLE.find((t) => t.name === n)!.inputSchema as any), listed = (name: string) => tools.find((t) => t.name === name)!.inputSchema as any;
  // The compound: its changes are typed in the list only (compound.ts checks each one itself).
  within(listed("draw").$defs.compound, { ...pieces.compound, properties: { ...pieces.compound.properties, changes: { type: "array", items: { type: "object", additionalProperties: true } } } }, "compound");
  // Each tool's arguments, but for the one that says which operation (no operation has it).
  // (draw lists its lines and brief, which it reads itself into an operation and set_brief's arguments, and the JSON
  // of structures: the other kinds' JSON is in help, and taken as change's draw.)
  assert.equal(listed("draw").properties.lines.description, NOTATION);
  for (const [name, route, of] of [["draw", "", ["structures", "cycle", "figure"]], ["read", "", ["read", "file"]], ["drawings", "action", ["list", "use", "new"]]] as [string, string, string[]][])
    for (const [k, p] of Object.entries(listed(name).properties) as [string, any][]) {
      if (k === route) { assert.deepEqual(p.enum, of, name); continue; }
      if (name === "draw" && (k === "lines" || k === "brief")) continue;
      const takers = ops(of).filter((x) => x.properties[k]);
      assert.ok(takers.length, `${name}.${k}`);
      // (steps is a reaction's and a cycle's, each with its own keys: every key listed is a key of one of them.)
      if (k !== "steps") for (const x of takers) within(p, x.properties[k], `${name}.${k}`);
      else for (const [key, q] of Object.entries(p.items.properties)) {
        const own = takers.map((x) => x.properties.steps.items.properties[key]).filter(Boolean);
        assert.ok(own.length, `steps.${key}`);
        for (const x of own) within(q, x, `steps.${key}`);
      }
    }
  assert.deepEqual(listed("change").properties.operations.items.properties.op.enum, ["draw", "edit", "replace", "number", "delete", "move", "arrange", "text", "arrow", "shape", "select", "set_style", "place_template", "add_file", "fill_experiment"]);
  assert.deepEqual(listed("advanced").properties.tool.enum, ["run_command", "set_style", "export", "place_template", "add_file", "fill_experiment", "draw_route", "help"]);
  // help of draw_route gives what each scheme and step must have, and keep_orientation (true unless set false).
  const route = (await call("advanced", { tool: "help", args: { of: "draw_route" } })).structuredContent, scheme = route.arguments.properties.schemes.items;
  assert.deepEqual([route.call, scheme.required, scheme.properties.steps.items.required, "keep_orientation" in route.arguments.properties], ["advanced with tool: 'draw_route' and args", ["start", "steps"], ["products"], true]);
}
assert.ok(tools.find((t) => t.name === "read")!.annotations.readOnlyHint && !tools.find((t) => t.name === "draw")!.annotations.readOnlyHint);
// The tool table (D11): names of 64 characters at most from A-Z a-z 0-9 _ - ., a title, a closed input schema, an
// output schema, all four hints said outright and openWorldHint false; a read-only tool is never destructive.
// A description is 2,000 bytes at most: Claude Desktop's bundle lists each tool with its description, and mcp.rs
// (bundle) makes no bundle with a longer one. (Three of the 26 tools of v1 were longer.)
for (const t of tools as unknown as { name: string; title: string; description: string; inputSchema: { additionalProperties: boolean }; outputSchema?: object; annotations: Record<string, boolean> }[]) {
  assert.match(t.name, /^[A-Za-z0-9_.-]{1,64}$/);
  assert.ok(Buffer.byteLength(t.description) <= 2000, `${t.name}: a description of ${Buffer.byteLength(t.description)} bytes`);
  assert.ok(t.title && t.outputSchema, t.name);
  for (const k of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) assert.equal(typeof t.annotations[k], "boolean", `${t.name} ${k}`);
  assert.equal(t.annotations.openWorldHint, false);
  assert.ok(!(t.annotations.readOnlyHint && t.annotations.destructiveHint), t.name);
}
// A tool's hints are its operations': it is read-only or idempotent only when every one is, and destructive when one
// is. Only a read, and the same brief again, change nothing when called again. (replace and edit make a compound's
// changes again.)
const hinted = (k: string) => (tools as unknown as { name: string; annotations: Record<string, boolean> }[]).filter((t) => t.annotations[k]).map((t) => t.name);
assert.deepEqual([hinted("readOnlyHint"), hinted("idempotentHint"), hinted("destructiveHint")], [["read"], ["read", "set_brief"], ["change", "advanced"]]);
assert.ok(["replace", "edit", "batch", "run_command"].every((n) => !OP_TABLE.find((t) => t.name === n)!.hints.idempotent));
assert.ok(OP_TABLE.every((t) => t.hints.readOnly || t.done), "every operation that changes the drawing tells the user");
assert.equal(new Set(TOOL_NAMES).size, TOOL_NAMES.length);
// Bad messages are refused with JSON-RPC's codes.
assert.equal(JSON.parse(await handle("{nope", () => host, "1", { client: "Test" })).error.code, -32700);
assert.equal(JSON.parse(await handle(JSON.stringify({ id: 1, method: "ping" }), () => host, "1", { client: "Test" })).error.code, -32600);
assert.equal((await send("sampling/createMessage")).error.code, -32601);
assert.equal((await send("tools/call", { name: "rm_rf", arguments: {} })).error.code, -32602);

// The brief (plan 3.1, test plan B1, B2, B5, B12). A new session has none: a scheme, a cycle, a figure, a grid, and a
// change whose operations draw any of these (or more than one structure in all) are refused with the three
// questions, word for word, and nothing changes.
fresh();
const QUESTIONS = "Octet needs the brief first. Ask the user these three questions, then call set_brief: 1. Do you have a preferred working style? If so, ask them for a drawing in it. 2. Where is this going, and how big does it need to be? 3. Is there anything to emphasise, or a layout to follow?";
// draw and change take the brief themselves, so their refusal says to give it in the call (the lab's Haiku called
// set_brief after change was refused, though the user had answered in the same message).
const HERE = `Octet needs the brief first. If the user has not answered these three questions, ask them, then call again with their answers as brief: ${QUESTIONS.split(": ").slice(1).join(": ")}`;
{
  const one = (text: string) => ({ op: "draw", kind: "structures", structures: [{ text }] });
  for (const [name, args] of [
    ["draw", { kind: "reaction", start: [{ text: "ethanol" }], steps: [{ products: [{ text: "water" }] }] }],
    ["draw_route", { schemes: [{ start: [{ text: "ethanol" }], steps: [{ products: [{ text: "water" }] }] }] }],
    ["draw", { kind: "cycle", intermediates: [{ text: "benzene" }, { text: "toluene" }] }],
    ["draw", { kind: "figure", panels: [{ rows: [[{ structure: "benzene" }]] }] }],
    ["draw", { kind: "structures", structures: [{ text: "benzene" }, { text: "toluene" }] }],
    ["change", { operations: [{ op: "draw", kind: "reaction", start: [{ text: "ethanol" }], steps: [{ products: [{ text: "water" }] }] }] }],
    ["change", { operations: [one("benzene"), { op: "draw", kind: "cycle", intermediates: [{ text: "benzene" }, { text: "toluene" }] }] }],
    ["change", { operations: [one("benzene"), one("toluene")] }],
  ] as [string, object][]) {
    const o = await call(name, args);
    assert.ok(o.isError, name);
    assert.equal(text(o), name === "draw_route" ? QUESTIONS : HERE, JSON.stringify(args));
  }
  assert.equal(m, EMPTY);
  assert.equal(steps.length, 0);
  // B12: one structure draws at once in the drawing's style, as one from a template or a file does. B2: reading,
  // listing and changing what is there need no brief.
  for (const [name, args] of [
    ["draw", { kind: "structures", structures: [{ text: "benzene", number: "1" }] }],
    ["change", { operations: [one("toluene")] }],
    ["advanced", { tool: "place_template", args: { name: "Round-bottom flask" } }],
    ["advanced", { tool: "add_file", args: { text: "CCO" } }],
    ["change", { operations: [{ op: "number", structure: "1", number: "2" }, { op: "move", ids: ["2"], dx: 1 }, { op: "edit", ids: ["2"], colour: "#B42323" }, { op: "select", ids: [] }] }],
    ["change", { operations: [{ op: "delete", ids: ["2"] }] }],
    ["read", {}], ["read", { format: "smiles" }], ["drawings", { action: "list" }], ["advanced", { tool: "help", args: { of: "reaction" } }],
  ] as [string, object][]) assert.ok(!(await call(name, args)).isError, `${name} ${JSON.stringify(args)}`);
  assert.equal(m.style, undefined, "no call changed the drawing's style");
  assert.equal(steps.length, 6);
  // The server instructions ask the three questions in their first lines, so an AI app asks before its first call.
  assert.ok((await send("initialize", {})).result.instructions.split("\n")[1].includes(`ask the user these three questions unless answered: ${QUESTIONS.split(": ").slice(1).join(": ")} Give the answers as brief in the draw call`));
  // The brief inside the first drawing call (plan 19.2): draw's brief, in a line or as set_brief's object, is set as
  // set_brief sets it, in the same undo step, said in a line before the result, and kept for the session. A brief Octet
  // refuses changes and keeps nothing. With no brief anywhere a scheme is refused with the three questions, as before.
  fresh();
  assert.equal(text(await call("draw", { lines: "ethanol -> water" }, "s-8")), HERE);
  let o = await call("draw", { lines: "ethanol -> water", brief: "JACS, 2 columns, emphasis: the water, as drawn" }, "s-8");
  assert.ok(!o.isError && m.style!.page === "ACS2" && m.style!.preset === "ACS Document 1996", text(o));
  // (In the fewest words that say it is kept, with its style and page: models repeated all of it to the user.)
  assert.match(text(o), /^Brief kept: ACS Document 1996 on ACS2\. Follow its emphasis and layout as you draw\. Drew the reaction\./);
  assert.deepEqual(JSON.parse(briefs.get("s-8")!), { destination: { kind: "paper", journal: "ACS Document 1996", columns: 2 }, style: "destination", emphasis: "the water, as drawn" });
  assert.deepEqual([steps.length, said], [1, ["Test drew a reaction."]]);
  // The session keeps it: its next scheme needs none.
  assert.ok(!(await call("draw", { lines: "ethanol -> water" }, "s-8")).isError);
  // A draw by lines says what it drew and nothing every such call says (Clean Up, one undo step, no page).
  fresh();
  o = await call("draw", { lines: "ethanol -> water", brief: "quick" }, "s-lean");
  assert.match(text(o), /^Brief kept: Quick start \(ACS Document 1996, no page\)\. Drew the reaction\.\n\{/);
  // detail: full gives the sizes too.
  fresh();
  o = await call("draw", { lines: "ethanol -> water", brief: "quick", detail: "full" }, "s-full");
  assert.match(text(o), /^Octet keeps this brief for the session\. The drawing (?:now )?uses ACS Document 1996 with no page \(Quick start\), with 10 pt labels and 14\.4 pt bonds\. Drew the reaction\./);
  for (const [brief, why] of [["Bull. Chem. Soc. Jpn.", /^Octet has no preset for Bull\. Chem\. Soc\. Jpn\. The nearest it has is ACS Document 1996\./], ["emphasis: x", /^Octet changed nothing\. brief: give quick, or where the drawing goes/], [{ destination: { kind: "book" } }, /^Octet changed nothing\. brief\.destination\.kind: not one of/]] as [unknown, RegExp][]) {
    fresh();
    o = await call("draw", { lines: "ethanol -> water", brief }, "s-9");
    assert.ok(o.isError && why.test(text(o)) && m === EMPTY && !briefs.has("s-9"), text(o));
  }
  // The brief in the user's own words as the lab's Haiku gave it (11 November, the user's "No, I have no preferred
  // style. Just a quick look on screen, no page."): a quick look, on screen, no page or nowhere in particular, among
  // filler and the question's own words, is Quick start. A destination it names wins.
  for (const [k, [brief, want]] of ([
    ["Quick start, no page. On screen only, a quick look. Emphasis: none. Layout: a clockwise cycle, species 1 to 4.", { kind: "quick" }],
    ["quick: no preference, a quick look on screen, no page. Emphasis: nothing; layout: none.", { kind: "quick" }],
    ["quick (no preference, on screen, no page); emphasis: none; layout: none", { kind: "quick" }],
    ["Quick start, no page. Where it goes: on screen only. Emphasis: nothing to emphasise. Layout: no preference.", { kind: "quick" }],
    ["quick: no preference, on screen, no page; emphasis: none; layout: none", { kind: "quick" }],
    ["No, I have no preferred style. Just a quick look on screen, no page. Nothing to emphasise.", { kind: "quick" }],
    ["nowhere in particular", { kind: "quick" }],
    ["a quick look for a JACS paper", { kind: "paper", journal: "ACS Document 1996" }],
    ["JACS, on screen", { kind: "paper", journal: "ACS Document 1996" }],
  ] as [string, object][]).entries()) {
    fresh();
    o = await call("draw", { lines: "ethanol -> water", brief }, `s-q${k}`);
    assert.ok(!o.isError, text(o));
    assert.deepEqual(JSON.parse(briefs.get(`s-q${k}`)!).destination, want, brief);
  }
  // set_brief's destination in words is read so too.
  fresh();
  o = await call("set_brief", { destination: "On screen only, a quick look" }, "s-qw");
  assert.ok(!o.isError && JSON.parse(briefs.get("s-qw")!).destination.kind === "quick", text(o));
  // The call's own emphasis wins over one in the words, and words Octet cannot read are refused as destination's.
  fresh();
  o = await call("set_brief", { destination: "JACS. Emphasis: the water", emphasis: "the product" }, "s-qe");
  assert.ok(!o.isError && JSON.parse(briefs.get("s-qe")!).emphasis === "the product", text(o));
  assert.match(text(await call("set_brief", { destination: "no idea" }, "s-qn")), /^Octet changed nothing\. destination: give quick/);
  // change takes brief as draw does (the lab's Haiku drew a cycle with change, and was refused for want of it).
  const cycle = { op: "draw", kind: "cycle", intermediates: [{ text: "OC(=O)[C@@H]1CCCN1" }, { text: "C/C(CCC1(C)C(=O)CCC1=O)=[N+]1\\CCC[C@H]1C([O-])=O" }, { text: "OC(=O)[C@@H]1CCCN1C(=C)CCC1(C)C(=O)CCC1=O" }, { text: "C[C@]12CC/C(=[N+]3/CCC[C@H]3C([O-])=O)C[C@@]1(O)CCC2=O" }], steps: [{ step: 0, in: "triketone", name: "cond" }, { step: 1, name: "tautom" }, { step: 2, name: "aldol" }, { step: 3, out: "ketol", name: "hydrol" }], anticlockwise: false };
  fresh();
  assert.equal(text(await call("change", { operations: [cycle], detail: "summary" }, "s-c")), HERE);
  o = await call("change", { operations: [cycle], detail: "summary", brief: "No, I have no preferred style. Just a quick look on screen, no page. Nothing to emphasise." }, "s-c");
  assert.ok(!o.isError && m.cycles?.length === 1, text(o));
  assert.match(text(o), /^Brief kept: Quick start \(ACS Document 1996, no page\)\. Drew a catalytic cycle of 4 intermediates/);
  assert.deepEqual([steps.length, JSON.parse(briefs.get("s-c")!).destination], [1, { kind: "quick" }]);
  fresh();
  o = await call("change", { operations: [cycle], brief: { destination: { kind: "thesis" } } }, "s-c2");
  assert.ok(!o.isError && JSON.parse(briefs.get("s-c2")!).destination.kind === "thesis", text(o));
  // Plan 3.1, 7.3: an AI app that takes elicitation. Octet asks the user the brief itself, through the AI app's form,
  // and the same call draws with the answers, as it would with them as draw's brief. An AI app without it is told the
  // three questions, word for word, as before.
  {
    const asked: any[] = [];
    let answer: () => Promise<string> = async () => "";
    const ask = async (name: string, args: unknown, session: string) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => host, "1.2.0", { ...as(session), elicit: async (p) => { asked.push(p); return answer(); } })).result;
    const UNANSWERED = `Octet changed nothing. The user closed Octet's questions without answering. Ask them in the chat, then call again with brief: ${QUESTIONS.split(": ").slice(1).join(": ")}`;
    // Accept: the drawing is made in the same call and undo step, with the reply a call with that brief gives, and the
    // session keeps the brief.
    fresh(); resetIds();
    answer = async () => JSON.stringify({ action: "accept", content: { destination: "paper", journal_or_size: "JACS, 2 columns", emphasis: "the water, as drawn" } });
    const o = await ask("draw", { lines: "ethanol -> water" }, "e-1");
    assert.ok(!o.isError, text(o));
    assert.deepEqual(JSON.parse(briefs.get("e-1")!), { destination: { kind: "paper", journal: "ACS Document 1996", columns: 2 }, style: "destination", emphasis: "the water, as drawn" });
    assert.deepEqual([steps.length, said], [1, ["Test drew a reaction."]]);
    assert.ok(far.some(([t, stop, at]) => t === "Test is drawing." && stop && at === "Waiting for your answer in Test"), JSON.stringify(far));
    const given = o.content.map((c: { text?: string }) => c.text);
    fresh(); resetIds();
    assert.deepEqual((await call("draw", { lines: "ethanol -> water", brief: "paper, JACS, 2 columns emphasis: the water, as drawn" }, "e-2")).content.map((c) => c.text), given);
    // The form: one short sentence, and a flat object of primitive fields (MCP 2025-11-25, Elicitation), only the
    // destination required, each destination by a name a chemist reads, as an enum with enumNames: 2025-06-18 has no
    // other titled choice.
    const [form] = asked;
    assert.ok(/^[^.]+\?$/.test(form.message) && form.message.length < 80, form.message);
    assert.deepEqual([Object.keys(form.requestedSchema.properties), form.requestedSchema.required], [["destination", "journal_or_size", "emphasis", "layout"], ["destination"]]);
    assert.ok(Object.values(form.requestedSchema.properties).every((x: any) => x.type === "string" && !x.properties && !x.items));
    const choice = form.requestedSchema.properties.destination;
    assert.deepEqual([choice.enum, choice.enumNames.length, choice.oneOf], [["quick", "paper", "thesis", "slides", "poster", "notebook"], 6, undefined]);
    // The session keeps it: the next scheme asks nothing.
    assert.ok(!(await ask("draw", { lines: "ethanol -> water" }, "e-1")).isError);
    assert.equal(asked.length, 1);
    // Decline: no preference, so Quick start.
    fresh();
    answer = async () => JSON.stringify({ action: "decline" });
    let r = await ask("draw", { lines: "ethanol -> water" }, "e-3");
    assert.match(text(r), /^Brief kept: Quick start \(ACS Document 1996, no page\)\. Drew the reaction\./);
    assert.equal(JSON.parse(briefs.get("e-3")!).destination.kind, "quick");
    // Cancel, no answer in time, or an answer that is not one: nothing changes, nothing is kept, and the AI app is told
    // to ask in the chat.
    for (const a of [async () => JSON.stringify({ action: "cancel" }), () => Promise.reject(new Error("The user did not answer.")), async () => JSON.stringify({ action: "accept", content: { emphasis: "x" } }), async () => JSON.stringify({ action: "accept", content: { destination: "spaceship" } }), async () => "nope"]) {
      fresh();
      answer = a;
      r = await ask("draw", { lines: "ethanol -> water" }, "e-4");
      assert.ok(r.isError && text(r) === UNANSWERED && m === EMPTY && !steps.length && !briefs.has("e-4"), text(r));
      assert.equal(far.at(-1)?.[0], undefined, "the notice ends");
    }
    // Stop in Octet's window ends the wait at once.
    fresh();
    answer = () => new Promise(() => {});
    const waiting = ask("draw", { lines: "ethanol -> water" }, "e-4");
    await new Promise((d) => setTimeout(d, 10));
    notice!.stop!();
    r = await waiting;
    assert.ok(r.isError && /^draw was cancelled/.test(text(r)) && m === EMPTY && !briefs.has("e-4"), text(r));
    // What the user types in one field is not read as another: emphasis that says layout: stays emphasis.
    fresh();
    answer = async () => JSON.stringify({ action: "accept", content: { destination: "paper", emphasis: "the ester layout: vertical" } });
    assert.ok(!(await ask("draw", { lines: "ethanol -> water" }, "e-8")).isError);
    assert.deepEqual(JSON.parse(briefs.get("e-8")!), { destination: { kind: "paper" }, style: "destination", emphasis: "the ester layout: vertical" });
    // While the user fills in the form, other requests to the window go on: they do not wait for the answer.
    fresh();
    let reply = (_: string) => {};
    answer = () => new Promise((r) => { reply = r; });
    const later = ask("draw", { lines: "ethanol -> water" }, "e-10");
    assert.equal(await Promise.race([call("read", {}, "e-11").then(() => "read"), new Promise((d) => setTimeout(() => d("waited"), 3000))]), "read");
    reply(JSON.stringify({ action: "decline" }));
    assert.ok(!(await later).isError && steps.length === 1);
    // A second session's call that draws in the window while the form is open takes the notice over; when it ends,
    // the first session's notice comes back, with its Stop, as it still waits.
    fresh();
    answer = () => new Promise((r) => { reply = r; });
    const held = ask("draw", { lines: "ethanol -> water" }, "e-12");
    await new Promise((d) => setTimeout(d, 10));
    assert.ok(!(await call("draw", { lines: "ethanol -> water", brief: "quick" }, "e-13")).isError);
    assert.deepEqual(far.at(-1), ["Test is drawing.", true, "Waiting for your answer in Test"], JSON.stringify(far.slice(-3)));
    notice!.stop!();
    assert.match(text(await held), /^draw was cancelled/);
    reply("");
    // An AI app without elicitation is asked nothing, and gets the three questions as before.
    const before = asked.length;
    assert.equal(text(await call("draw", { lines: "ethanol -> water" }, "e-5")), HERE);
    assert.equal(asked.length, before);
    // set_brief with the answers missing asks the same form; without elicitation it is refused as before.
    fresh();
    answer = async () => JSON.stringify({ action: "accept", content: { destination: "thesis" } });
    r = await ask("set_brief", {}, "e-6");
    assert.ok(!r.isError && /^Octet keeps this brief for the session\./.test(text(r)) && asked.length === before + 1, text(r));
    assert.equal(JSON.parse(briefs.get("e-6")!).destination.kind, "thesis");
    assert.equal(text(await call("set_brief", {}, "e-7")), "Octet changed nothing. arguments: destination is missing.");
    // A set_brief whose own arguments are wrong is refused before it asks anything.
    assert.equal(text(await ask("set_brief", { style: "destination" }, "e-6")), "Octet changed nothing. style: not an object.");
    assert.equal(asked.length, before + 1);
    // The instructions differ by AI app in their bullet on the questions only: one that takes elicitation (mcp.rs reads
    // its initialize) is told to just call draw.
    const ins = async (elicit: boolean) => (JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "initialize", params: { capabilities: {} } }), () => host, "1.2.0", { ...as("s-1"), ...(elicit ? { elicit: async () => "" } : {}) })).result.instructions as string).split("\n");
    const [plain, form2] = [await ins(false), await ins(true)];
    assert.deepEqual([form2.length, form2.filter((l, k) => l !== plain[k]).length], [plain.length, 1]);
    // (Within the 2,048 characters an AI app keeps, as the others are.)
    assert.ok(form2.join("\n").length <= 2048, `${form2.join("\n").length}`);
    assert.equal(form2[1], "- For a scheme, route, figure, cycle or grid, just call draw: Octet asks the user about style, destination and emphasis itself when it needs to. Give brief only for answers the user has already given in the chat.");
    // The prompts say the same: for an AI app that takes elicitation they only call, and give a brief only for answers
    // the user has given, the prompt's own among them (fill_experiment's notebook, journal_figure's journal), so Octet's
    // form does not ask for them again. Other AI apps get them as before.
    const prompt = async (name: string, elicit: boolean) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "prompts/get", params: { name, arguments: { text: "x", procedure: "x", journal: "JACS" } } }), () => host, "1.2.0", { ...as("s-1"), ...(elicit ? { elicit: async () => "" } : {}) })).result.messages[0].content.text as string;
    const ASKED = "First ask me the three questions in Octet's instructions, unless I have answered them, and give my answers as draw's brief. Then ";
    assert.equal(await prompt("draw_scheme", false), `${ASKED}draw the reactions in this text as one scheme in Octet: one draw call with lines. Give each compound its number from the text. When the check is clean, tell me what Octet drew; else fix the ids it names in one change.\n\nx`);
    for (const name of ["draw_scheme", "redraw_picture", "fill_experiment"]) {
      const [plain, elicited] = [await prompt(name, false), await prompt(name, true)];
      assert.ok(plain.startsWith(ASKED), plain);
      assert.equal(elicited, `Do not ask me Octet's questions: Octet asks me itself when it needs to. Give draw's brief only for answers I have already given. Just ${plain.slice(ASKED.length).replace("(the destination is notebook)", "(give draw's brief notebook: the destination is notebook)")}`);
    }
    assert.ok((await prompt("fill_experiment", false)).includes("procedure (the destination is notebook). If"));
    const [journal, journalAsks] = [await prompt("journal_figure", false), await prompt("journal_figure", true)];
    assert.ok(journal.includes("Ask me whether it goes in one column or two, and the other questions in Octet's instructions, then call set_brief with destination paper and journal JACS. Then read"), journal);
    assert.equal(journalAsks, "Make my open drawing ready as a figure for JACS. Call set_brief with destination paper and journal JACS, and columns 1 or 2 only if I have said which. Then read with picture: true, and fix what Octet warns about with change (move or arrange). When it is ready, call advanced with tool export so I can save it.");
    // As the prompts say, those calls go on with no form: set_brief with the journal and no column, and draw with the
    // brief notebook.
    fresh();
    const forms = asked.length;
    assert.ok(!(await ask("set_brief", { destination: { kind: "paper", journal: "JACS" } }, "e-14")).isError);
    assert.ok(!(await ask("draw", { lines: "ethanol -> water", brief: "notebook" }, "e-15")).isError);
    assert.deepEqual([asked.length, JSON.parse(briefs.get("e-14")!).destination, JSON.parse(briefs.get("e-15")!).destination], [forms, { kind: "paper", journal: "ACS Document 1996" }, { kind: "notebook" }]);
    assert.equal(await prompt("check_drawing", true), await prompt("check_drawing", false));
  }
  // The answers in one line, each part read one way; or set_brief's object.
  for (const [line, brief] of [
    ["quick", { destination: { kind: "quick" }, style: "destination" }], ["No preference.", { destination: { kind: "quick" }, style: "destination" }],
    ["thesis", { destination: { kind: "thesis" }, style: "destination" }], ["A paper, no particular journal; nothing to emphasise", { destination: { kind: "paper" }, style: "destination" }],
    ["paper, Org. Lett., 1 column", { destination: { kind: "paper", journal: "ACS Document 1996", columns: 1 }, style: "destination" }],
    ["Angew. Chem. Int. Ed.", { destination: { kind: "paper", journal: "Wiley (Angewandte)" }, style: "destination" }],
    ["poster, 600 x 900 mm; layout: one row", { destination: { kind: "poster", size_mm: [600, 900] }, style: "destination", layout: "one row" }],
    [{ destination: { kind: "slides" } }, { destination: { kind: "slides" }, style: "destination" }],
    // As the user types them, full stops and all (the lab's own answers), and with the words in any order.
    ["No, I have no preferred style. A paper, no particular journal. Nothing to emphasise.", { destination: { kind: "paper" }, style: "destination" }],
    ["No preferred style.", { destination: { kind: "quick" }, style: "destination" }],
    ["a JACS paper", { destination: { kind: "paper", journal: "ACS Document 1996" }, style: "destination" }],
    ["JACS, 2 columns", { destination: { kind: "paper", journal: "ACS Document 1996", columns: 2 }, style: "destination" }],
    ["paper (JACS), double column", { destination: { kind: "paper", journal: "ACS Document 1996", columns: 2 }, style: "destination" }],
    ["thesis, A4", { destination: { kind: "thesis" }, style: "destination" }], ["slides 16:9", { destination: { kind: "slides" }, style: "destination" }],
    ["a paper on US Letter", { destination: { kind: "paper", size_mm: [215.9, 279.4] }, style: "destination" }],
  ] as [unknown, object][]) {
    fresh();
    briefs.delete("s-10");
    o = await call("draw", { lines: "ethanol (1)\nwater (2)", brief: line }, "s-10");
    assert.ok(!o.isError, text(o));
    assert.deepEqual(JSON.parse(briefs.get("s-10")!), brief, JSON.stringify(line));
  }
}
// The session the rest of this file's calls come in gives its brief here: a paper.
assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);

// The check: a call with wrong arguments changes nothing and says what is wrong.
fresh();
const refused: [string, unknown, RegExp][] = [
  ["draw", { kind: "reaction", start: [{ text: "ethanol" }] }, /steps is missing/],
  ["draw", { kind: "reaction", start: [{ text: "ethanol" }], steps: [{ products: [{ text: "water" }], above: ["x".repeat(MAX_TEXT + 1)] }] }, /steps\[0\]\.above\[0\]: longer than 300/],
  ["draw", { kind: "reaction", start: [], steps: [{ products: [{ text: "water" }] }] }, /start: fewer than 1/],
  ["draw", { kind: "reaction", start: [{ text: "ethanol", colour: "red" }], steps: [] }, /colour is not an argument/],
  ["draw", { kind: "structures", structures: [{ text: 5 }] }, /structures\[0\]\.text: not text/],
  ["draw", { kind: "structures", structures: [{ from: 5 }] }, /structures\[0\]\.from: not text/],
  ["draw", { kind: "reaction", start: [{ text: "ethanol" }], steps: [{ products: [{ from: "previous", changes: { swap: { OH: "OAc" } } }] }] }, /steps\[0\]\.products\[0\]\.changes: not a list/],
  ["draw", { kind: "cycle", intermediates: [{ text: "benzene" }, { from: "previous", changes: ["OAc"] }] }, /intermediates\[1\]\.changes\[0\]: not an object/],
  ["change", { operations: [{ op: "replace", structure: "s1", changes: Array(21).fill({}) }] }, /changes: more than 20 items/],
  ["draw", { kind: "structures", structures: [{ text: "water" }], columns: 0 }, /columns: not between 1 and 20/],
  ["draw", { kind: "structures", structures: [{ text: "water" }], columns: 1.5 }, /columns: not a integer/],
  ["draw", { kind: "structures", structures: Array(201).fill({ text: "water" }) }, /more than 200/],
  ["draw", { kind: "cycle", intermediates: [{ text: "benzene" }] }, /fewer than 2/],
  ["advanced", { tool: "run_command", args: { command: "quit" } }, /no command quit/],
  ["advanced", { tool: "set_style", args: { preset: "Comic Sans" } }, /not one of/],
  ["read", [], /not an object/],
  // Through a piece a tool lists once (rich, place), a refusal names the place and the forms as before.
  ["draw", { kind: "figure", panels: [{ title: 5, rows: [[{ text: "and" }]] }] }, /panels\[0\]\.title: not text, or runs/],
  ["draw", { kind: "figure", panels: [{ rows: [[{ structure: "benzene", caption: [{ bold: true }] }]] }] }, /panels\[0\]\.rows\[0\]\[0\]\.caption: not text, or runs/],
  ["change", { operations: [{ op: "arrow", kind: "reaction", from: 5, to: [0, 0] }] }, /from: not an id \(s3, t5, s3\.2\) or a point \[x, y\]/],
  // The look-alikes of the lenient readings (test plan R2): each has no meaning, or more than one, and stays refused.
  ["draw", { kind: "structures", structures: [{ text: "benzene", number: true }] }, /structures\[0\]\.number: not text/],
  ["draw", { kind: "structures", structures: [{ text: "benzene", number: [13] }] }, /structures\[0\]\.number: not text/],
  ["draw", { kind: "structures", structures: [{ text: "benzene", number: 1234567890123 }] }, /number: longer than 12/],
  ["draw", { kind: "structures", structures: [{ text: "benzene", number: "1 (paclitaxel) x" }] }, /number: longer than 12/],
  ["draw", { kind: "structures", structures: [{ text: "benzene", labels: [13] }] }, /labels\[0\]: not text/],
  ["draw", { kind: "structures" }, /structures is missing/],
  ["change", { operations: [{ op: "number", structure: 13, number: "1" }] }, /structure: not text/],
  ["read", { format: "molfile" }, /format: not one of cdxml, mol, mol2000, sdf, rxn, smiles, inchi, cdx/],
  ["read", { format: "..mol" }, /format: not one of/],
  ["read", { format: "m ol" }, /format: not one of/],
  ["read", { format: "constructor" }, /format: not one of/],
  ["read", { format: 5 }, /format: not text/],
  ["read", { detail: "long" }, /detail: not one of summary, full/],
  ["drawings", { action: "new", for: "book" }, /for: not one of paper, thesis, slides, poster, experiment, quick/],
  ["drawings", { action: "new", for: null }, /for: not text/],
];
for (const [name, args, why] of refused) {
  const out = await call(name, args);
  assert.ok(out.isError, name);
  assert.match(text(out), why);
}
assert.equal(m, EMPTY);
assert.equal(steps.length, 0);

// The five tools (plan 5.1 and 5.2): a call is one operation, by draw's kind, change's op, advanced's tool or
// drawings' action. What is wrong with a call is said where it is in the call, and a refusal by an operation's own
// schema says where all its arguments are (the tools list the ones most calls give).
{
  const no = async (name: string, args: unknown, why: RegExp) => { const o = await call(name, args); assert.ok(o.isError && why.test(text(o)), `${name} ${JSON.stringify(args)}: ${text(o)}`); };
  // (structures alone is the structures kind: draw lists it with lines, plan 19.2.)
  await no("draw", {}, /^Octet changed nothing\. give lines, or structures\.$/);
  await no("draw", { lines: "ethanol -> water", structures: [{ text: "water" }], brief: "quick" }, /^Octet changed nothing\. give lines or structures, not both\.$/);
  await no("draw", { kind: "scheme", start: [{ text: "water" }] }, /^Octet changed nothing\. kind: not one of structures, reaction, cycle, figure\.$/);
  await no("draw", { kind: "structures", start: [{ text: "water" }], structures: [{ text: "water" }] }, /^Octet changed nothing\. arguments: start is not an argument of this tool\. advanced help of structures gives its arguments\.$/);
  await no("draw", { kind: "structures", structures: [{ name: "water" }] }, /^Octet changed nothing\. structures\[0\]: name is not an argument of this tool\. advanced help of structures gives its arguments\.$/);
  await no("change", {}, /^Octet changed nothing\. arguments: operations is missing\.$/);
  await no("change", { operations: [] }, /operations: fewer than 1 items/);
  await no("change", { operations: [{ ids: ["s1"] }] }, /operations\[0\]: op is missing/);
  await no("change", { operations: [{ op: "run_command", command: "undo" }] }, /operations\[0\]\.op: not one of draw, edit, /);
  await no("change", { operations: [{ op: "draw", structures: [{ text: "water" }] }] }, /operations\[0\]: kind is missing/);
  await no("change", { operations: [{ op: "delete", ids: ["s1"] }, { op: "draw", kind: "table" }] }, /operations\[1\]\.kind: not one of structures, reaction, cycle, figure/);
  await no("change", { operations: [{ op: "delete", ids: ["s1"] }], steps: [{}] }, /arguments: steps is not an argument of this tool\.$/);
  await no("change", { operations: [{ op: "move", ids: ["s1"], by: [1, 0] }] }, /^Octet changed nothing\. operations\[0\]: by is not an argument of this tool\. advanced help of move gives its arguments\.$/);
  await no("change", { operations: [{ op: "number", structure: "s1" }] }, /^Octet changed nothing\. operations\[0\]: number is missing\. advanced help of number gives its arguments\.$/);
  await no("advanced", { args: {} }, /arguments: tool is missing/);
  await no("advanced", { tool: "edit", args: {} }, /tool: not one of run_command, set_style, export, place_template, add_file, fill_experiment, draw_route, help\.$/);
  await no("advanced", { tool: "export", args: "pdf" }, /args: not an object/);
  // (A tool's own argument beside tool is taken into args, plan 19.10: one the tool does not take is refused there.)
  await no("advanced", { tool: "export", format: "pdf", colour: "red" }, /^Octet changed nothing\. args: colour is not an argument of this tool\. advanced help of export gives its arguments\.$/);
  // (journal is set_style's preset by another name now, plan 19.10.)
  await no("advanced", { tool: "set_style", args: { font: "Arial" } }, /^Octet changed nothing\. args: font is not an argument of this tool\. advanced help of set_style gives its arguments\.$/);
  await no("drawings", { action: "close" }, /action: not one of list, use, new/);
  await no("drawings", { action: "use" }, /drawing is missing/);
  await no("drawings", { action: "list", drawing: "draw-1" }, /drawing is not an argument of this tool\.$/);
  await no("drawings", [], /arguments: not an object/);
  // A read with a format is the file's text, which takes the ids and nothing else of a read. An argument a tool lists
  // for its other operations is refused as it is, not as "not an argument of this tool".
  await no("read", { format: "mol", smiles: true }, /^Octet changed nothing\. smiles does not go with format\.$/);
  await no("read", { format: "smiles", picture: true }, /^Octet changed nothing\. picture does not go with format\.$/);
  // (help's detail is left out, plan 19.10: five calls of the real runs gave it.)
  await no("advanced", { tool: "help", args: { of: "move" }, picture: true }, /^Octet changed nothing\. picture does not go with help\.$/);
  await no("advanced", { tool: "export", args: { format: "pdf" }, picture: true }, /^Octet changed nothing\. picture does not go with export\.$/);
  assert.equal(m, EMPTY);
  assert.equal(steps.length, 0);
  // The lenient readings (R5) are theirs too: other letters for a kind, a tool or an action, and no action is list.
  let o = await call("draw", { kind: "Structures", structures: [{ text: "benzene", number: "1" }, { text: "water", number: "2" }] });
  assert.ok(!o.isError && o.content[1].text === "Read kind Structures as structures.", text(o));
  o = await call("drawings", {});
  assert.deepEqual([o.structuredContent.using, o.content[1].text], ["draw-1", 'No "action" was given: read as list.']);
  o = await call("advanced", { tool: "EXPORT", args: { format: "PDF" } });
  assert.deepEqual([o.isError, o.content[1].text], [undefined, "Read tool EXPORT as export.\nRead format PDF as pdf."]);
  o = await call("read", { format: "SMILES" });
  assert.deepEqual([Object.keys(o.structuredContent), o.structuredContent.format], [["format", "text", "coerced"], "smiles"]);
  // One operation is run as itself: its result is its own (no list of steps), and a select opens no undo step. More
  // are a batch, one undo step, where a select is a step too.
  const before = steps.length;
  o = await call("change", { operations: [{ op: "select", ids: ["1"] }] });
  assert.ok(text(o).startsWith("Selected 1.") && steps.length === before && picked.atoms.length === 6, text(o));
  o = await call("change", { operations: [{ op: "select", ids: ["2"] }, { op: "edit", ids: ["2"], colour: "#C42B2B" }] });
  assert.ok(/^Did 2 steps as one undo step:\n1\. Selected 2\.\n2\. /.test(text(o)) && steps.length === before + 1 && picked.atoms.length === 1, text(o));
  // picture, picture_size and detail are the call's, on every tool that can change the drawing; an operation's own
  // picture or detail asks for the call's. A picture of what changed is 800 px unless a size is given.
  const longest: (number | undefined)[] = [], picture = host.picture;
  host.picture = async (_m, _crop, most) => { longest.push(most); return "iVBOR"; };
  for (const [name, args] of [
    ["change", { operations: [{ op: "move", ids: ["1"], dx: 1 }], picture: true }],
    ["change", { operations: [{ op: "move", ids: ["1"], dx: 1 }], picture: true, picture_size: "large" }],
    ["change", { operations: [{ op: "move", ids: ["1"], dx: 1, picture: true }, { op: "move", ids: ["2"], dx: 1 }], picture_size: "small" }],
    ["change", { operations: [{ op: "move", ids: ["1"], dx: 1 }, { op: "move", ids: ["2"], dx: 1 }], picture: true }],
    ["draw", { kind: "structures", structures: [{ text: "water" }], picture: true, picture_size: "medium" }],
    ["advanced", { tool: "set_style", args: { page: "A4" }, picture: true }],
    ["read", { picture: true, picture_size: "small" }],
  ] as [string, unknown][]) assert.deepEqual((await call(name, args)).content.map((c) => c.type), ["text", "image"], JSON.stringify(args));
  host.picture = picture;
  assert.deepEqual(longest, [800, 1568, 600, 800, 1000, 800, 600]);
  o = await call("advanced", { tool: "set_style", args: { preset: "RSC" }, detail: "full" });
  assert.ok(!o.isError && Array.isArray(o.structuredContent.changed), text(o));
  o = await call("change", { operations: [{ op: "move", ids: ["1"], dx: 1, detail: "full" }] });
  assert.ok(!o.isError && Array.isArray(o.structuredContent.changed), text(o));
  // Typical calls, written as the tools list them: each fits the listed schema as a strict AI app checks it before it
  // sends a call, and Octet takes each one.
  fresh();
  resetIds();
  for (const [name, args] of [
    ["drawings", { action: "list" }],
    // (draw lists lines and the JSON of structures, plan 19.2: a cycle anticlockwise and a figure's frames are change's
    // draw, whose operations are open.)
    ["draw", { lines: 'acetic acid + ethanol -> ethyl acetate (1), H2SO4 (cat.), reflux, 90%\n<=> 1[OEt>OH] (2) "again", ^H2O' }],
    ["draw", { columns: 2, structures: [{ text: "benzene", number: "3" }, { text: "*c1ccccc1", labels: ["Ar"], number: "4" }, { text: "phenol", number: "5", up: "O" }], below: "1", gap: 2, align: "left" }],
    ["draw", { lines: "# Pd\n{L}[Pd]{L} -> {L}[Pd]({L})(c1ccccc1)Br, +PhBr, OA -> {L}[Pd]{L}, -PhH" }],
    ["change", { operations: [{ op: "draw", kind: "cycle", intermediates: [{ text: "*[Pd]*", labels: ["L", "L"] }, { text: "*[Pd](*)(c1ccccc1)Br", labels: ["L", "L"] }], centre: "Pd", steps: [{ step: 0, name: "OA", in: "PhBr" }, { step: 1, out: "PhH" }], anticlockwise: true }] }],
    ["change", { operations: [{ op: "draw", kind: "figure", panels: [{ title: "A", frame: "line", rows: [[{ structure: "toluene", number: "6", caption: "arene" }, { text: "and" }]] }], width: 20 }], detail: "full" }],
    ["read", { atoms: true, ids: ["3"] }],
    ["change", { operations: [{ op: "edit", ids: ["s3.1", "s3.1-2"], highlight: "#FFD6A5" }, { op: "replace", structure: "5", text: "toluene" }, { op: "number", structure: "s3", number: "3a" }] }],
    ["change", { operations: [{ op: "text", text: "Figure 1", bold: true, below: "4" }, { op: "shape", kind: "box", around: ["3a", "$1.t[0]"] }, { op: "arrow", kind: "line", from: [-10, 0], to: [10, 0] }, { op: "move", ids: ["$3.a[0]"], dy: -1 }, { op: "arrange", ids: ["3a", "4"], how: "top" }, { op: "select", ids: ["4"] }], picture: true, picture_size: "small" }],
    ["change", { operations: [{ op: "delete", ids: ["4"] }], detail: "summary" }],
    ["read", { detail: "full", smiles: true, picture: true, picture_size: "large" }],
    ["read", { format: "smiles", ids: ["3a"] }],
    ["advanced", { tool: "set_style", args: { preset: "Nature", page: "A4", landscape: true } }],
    ["advanced", { tool: "run_command", args: { command: "clean_up", ids: ["3a"] } }],
    ["advanced", { tool: "export", args: { format: "pdf" } }],
    ["advanced", { tool: "help", args: { of: "edit" } }],
    ["drawings", { action: "new", for: "paper" }],
  ] as [string, any][]) {
    const listed = tools.find((t) => t.name === name)!.inputSchema as any;
    assert.equal(strict(listed, args, listed.$defs, name), undefined, JSON.stringify(args));
    const done = await call(name, args);
    assert.ok(!done.isError, `${name} ${JSON.stringify(args)}: ${text(done)}`);
  }
  fresh();
}

// A reaction: the esterification, one undo step, conditions kept on the arrow, the number bold under its product.
fresh();
let out = await call("draw", { kind: "reaction", start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ above: ["H2SO4 (cat.)"], below: ["reflux"], products: [{ text: "ethyl acetate", number: "1" }, { text: "water" }] }] });
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
await call("draw", { kind: "reaction", start: [{ text: "ethanol" }], steps: [{ above: ["top", "middle", "bottom"], below: ["first", "second"], products: [{ text: "water" }] }] });
assert.deepEqual(m.captions!.filter((c) => c.on).map((c) => c.text), ["bottom", "middle", "top", "first", "second"]);
assert.deepEqual((await read()).reactions[0].steps[0].above, ["top", "middle", "bottom"]);
fresh();
await call("draw", { kind: "reaction", start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ above: ["H2SO4 (cat.)"], below: ["reflux"], products: [{ text: "ethyl acetate", number: "1" }, { text: "water" }] }] });
const one = m.captions!.find((c) => c.text === "1")!;
assert.ok(one.bold && one.under?.length === 6);
assert.equal(m.captions!.filter((c) => c.text === "+").length, 2);
// read reads it back: SMILES, formula, number, the reaction's parts and conditions, no warnings.
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
out = await call("read", { picture: true });
assert.deepEqual(out.content.map((c) => c.type), ["text", "image"]);
// A second job goes below the first.
const low = Math.min(...m.atoms.map((a) => a.location[1]));
await call("draw", { kind: "structures", structures: [{ text: "benzene" }] });
assert.ok(m.atoms[m.atoms.length - 1].location[1] < low - 2);
assert.equal(steps.length, 2);

// A name Octet cannot read: nothing is drawn, and the result says which.
fresh();
out = await call("draw", { kind: "reaction", start: [{ text: "ethanol" }], steps: [{ products: [{ text: "unobtainium" }] }] });
assert.ok(out.isError);
assert.match(text(out), /cannot read "unobtainium"/);
assert.equal(m.atoms.length, 0);
assert.deepEqual(said, []);

// draw_route (plan 5.4). A route of one scheme with no title is a reaction, and says what draw's reaction says.
fresh();
out = await call("draw_route", { schemes: [{ start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ above: ["H2SO4 (cat.)"], below: ["reflux"], products: [{ text: "ethyl acetate", number: "1" }, { text: "water" }] }] }] });
assert.equal(text(out).split("\n")[0], "Drew the reaction. Octet laid it out with Clean Up Reaction. One undo step.");
assert.deepEqual([steps.length, said, fragments(m).length], [1, ["Test drew a route."], 4]);
// Numbers run across schemes (test plan C9). The compound that ends scheme 1 starts scheme 2 as from it alone: it is
// drawn in both with its one number, and nothing warns. A product with changes and no from is from the compound
// before it. Each title is free text over its scheme (L6): no arrow's, no structure's.
{
  fresh();
  const titles = ["Scheme 1. Phenol 2", "Scheme 2. The acetate 3"];
  out = await call("draw_route", { schemes: [
    { title: titles[0], start: [{ text: "benzene", number: "1" }], steps: [{ reagents: ["O2"], products: [{ text: "phenol", number: "2" }] }] },
    { title: titles[1], start: [{ from: "2" }], steps: [{ reagents: ["Ac2O"], products: [{ changes: [{ swap: { OH: "OAc" } }], number: "3" }] }] },
  ] });
  assert.ok(!out.isError, text(out));
  assert.match(text(out), /^Drew 2 schemes of 1 and 1 steps with 3 numbered compounds\. Octet laid out each with Clean Up Reaction\. One undo step\./);
  assert.deepEqual([steps.length, said], [1, ["Test drew a route."]]);
  d = await read();
  assert.deepEqual(d.structures.map((s: { number: string }) => s.number), ["1", "2", "2", "3"]);
  assert.deepEqual([d.structures[1].inchiKey, d.structures[3].formula], [d.structures[2].inchiKey, "C8H8O2"]);
  // (The stand-in measures text from its middle, so it finds left-aligned titles past the page: headless.check has
  // the window's boxes, and no warning there.)
  assert.deepEqual([d.warnings.filter((w: { message: string }) => !/^The text/.test(w.message)), d.reactions.length, d.text.map((t: { text: string }) => t.text)], [[], 2, titles]);
  const free = m.captions!.filter((c) => titles.includes(c.text));
  assert.ok(free.length === 2 && free.every((c) => !c.on && !c.under), "the titles are free text");
  // "Scheme 1." is bold, as a paper sets it, and the rest is not.
  assert.deepEqual(free[0].runs, [{ text: "Scheme 1.", bold: true }, { text: " Phenol 2" }]);
  // Each title is over all of its own scheme, and under the scheme before.
  const ys = (ids: string[]) => ids.flatMap((id) => d.structures.find((s: { id: string }) => s.id === id).box.filter((_: number, k: number) => k % 2));
  const [s1, s2] = [d.reactions[0], d.reactions[1]].map((x: { steps: { before: string[] }[]; products: string[] }) => [...x.steps[0].before, ...x.products]);
  assert.ok(free[0].y > Math.max(...ys(s1)) && free[1].y > Math.max(...ys(s2)) && free[1].y < Math.min(...ys(s1)), JSON.stringify([free.map((c) => c.y), ys(s1), ys(s2)]));
  // A scheme that starts from previous starts from the last product of the scheme before, by its id when it has no
  // number; a later scheme from anything else is a branch, which the reply says Octet draws as a scheme of its own.
  fresh();
  out = await call("draw_route", { schemes: [
    { start: [{ text: "benzene" }], steps: [{ products: [{ text: "phenol" }] }] },
    { start: [{ from: "previous" }], steps: [{ products: [{ changes: [{ swap: { OH: "OAc" } }] }] }] },
  ] });
  assert.ok(!out.isError && !/branch/.test(text(out)), text(out));
  assert.deepEqual((await read()).structures.map((s: { formula: string }) => s.formula), ["C6H6", "C6H6O", "C6H6O", "C8H8O2"]);
  fresh();
  out = await call("draw_route", { schemes: [
    { start: [{ text: "benzene", number: "1" }], steps: [{ products: [{ text: "phenol", number: "2" }] }] },
    { start: [{ from: "1" }], steps: [{ products: [{ text: "toluene", number: "3" }] }] },
  ] });
  assert.match(text(out), / Octet drew each branch as a scheme of its own, under the one before, with a compound they share drawn again under its number: it does not join branches with arrows\./);
  assert.deepEqual((await read()).structures.map((s: { number: string }) => s.number), ["1", "2", "1", "3"]);
  // A scheme Octet cannot draw leaves nothing of the route: the titles and schemes before it go too.
  fresh();
  out = await call("draw_route", { schemes: [{ title: "Scheme 1", start: [{ text: "benzene" }], steps: [{ products: [{ text: "phenol" }] }] }, { start: [{ text: "ethanol" }], steps: [{ products: [{ text: "unobtainium" }] }] }] });
  assert.ok(out.isError && /Scheme 2: Octet drew nothing\. Octet cannot read "unobtainium"/.test(text(out)), text(out));
  assert.equal(m, EMPTY);
}
// legend: letters puts each step's letters on its arrow, a, b, c in turn after its own label, and its conditions in a
// note under the scheme, as a paper does. A structure at an arrow stays there, and a step with no conditions has no
// letter.
{
  fresh();
  out = await call("draw_route", { legend: "letters", schemes: [{ start: [{ text: "benzene" }], steps: [
    { reagents: ["Br2", "FeBr3"], solvents: ["CH2Cl2"], yield: "90%", products: [{ text: "Brc1ccccc1" }] },
    { label: "b, c", above: ["structure: water", "then H3O+"], reagents: ["Mg"], products: [{ text: "phenol" }] },
    { products: [{ text: "toluene" }] }, { below: ["hν"], products: [{ text: "Cc1ccccc1Cl" }] },
  ] }] });
  assert.ok(!out.isError, text(out));
  const on = (k: number) => m.captions!.filter((c) => c.on?.arrow === m.arrows![k].id).map((c) => c.text);
  assert.deepEqual([0, 1, 2, 3].map(on), [["a"], ["b, c"], [], ["d"]]);
  const note = m.captions!.find((c) => c.text.startsWith("Reagents"))!;
  assert.equal(note.text, "Reagents and conditions: (a) Br2, FeBr3, CH2Cl2, 90%; (b, c) Mg, then H3O+; (d) hν.");
  assert.ok(!note.on && !note.under && note.y < Math.min(...m.atoms.map((a) => a.location[1])), "the note is free text under the scheme");
  d = await read();
  assert.equal(d.structures.length, 6, "water is drawn at its arrow");
  // A label of other letters (roman numerals) is the step's own: the letters go on from where they were.
  fresh();
  out = await call("draw_route", { legend: "letters", schemes: [{ start: [{ text: "benzene" }], steps: [
    { reagents: ["HNO3"], products: [{ text: "O=[N+]([O-])c1ccccc1" }] }, { label: "i", reagents: ["Fe", "HCl"], products: [{ text: "Nc1ccccc1" }] }, { reagents: ["Ac2O"], products: [{ text: "CC(=O)Nc1ccccc1" }] },
  ] }] });
  assert.equal(m.captions?.find((c) => c.text.startsWith("Reagents"))?.text, "Reagents and conditions: (a) HNO3; (i) Fe, HCl; (b) Ac2O.", text(out));
}

// Control characters are taken out of text.
fresh();
await call("draw", { kind: "reaction", start: [{ text: "ethanol" }], steps: [{ above: ["heat\u0007 \u001b[2J"], products: [{ text: "water" }] }] });
assert.equal(m.captions!.find((c) => c.on)!.text, "heat [2J");

// structures: a numbered grid, four across for seven.
fresh();
const seven = ["benzene", "toluene", "phenol", "water", "ethanol", "CCN", "CCCl"].map((t, k) => ({ text: t, number: `S${k + 1}` }));
out = await call("draw", { kind: "structures", structures: seven });
assert.match(text(out), /Drew 7 structures in 2 rows of 4/);
const rows = new Set(fragments(m).map((f) => { const ys = f.map((i) => m.atoms[i].location[1]); return Math.round(Math.min(...ys) + Math.max(...ys)); }));
assert.equal(rows.size, 2);
assert.deepEqual(m.captions!.map((c) => c.text), seven.map((s) => s.number));

// The grid fits the page (R4): its columns come from the page's width inside its margins and each structure's box
// as drawn, in the fewest rows, as even as they can be. Columns that were asked for are kept, and the reply says how
// many fit. Rows past the bottom of the page are said too. On a drawing with no page (Quick start), six are one row.
{
  const dodecanes = (n: number) => Array.from({ length: n }, () => ({ text: "CCCCCCCCCCCC" })), margin = (pageSize(DEFAULT_STYLE)[0] / 2 - 15) * (72 / 25.4 / DEFAULT_STYLE.bond);
  fresh();
  out = await call("draw", { kind: "structures", structures: dodecanes(6) });
  assert.match(text(out), /^Drew 6 structures in 2 rows of 3\. One undo step\./);
  assert.ok(m.atoms.every((a) => a.location[0] >= -margin - 0.31 && a.location[0] <= margin + 0.31), "inside the page's margins");
  assert.equal(out.structuredContent.check, "clean");
  fresh();
  out = await call("draw", { kind: "structures", structures: dodecanes(6), columns: 6 });
  assert.match(text(out), /^Drew 6 structures in 1 row of 6\. A row of 6 is [\d.]+ bond lengths wide \(the page has 35\.4\): give columns: 3, or a larger page \(set_brief\)\. One undo step\./);
  assert.equal(new Set(m.atoms.map((a) => Math.round(a.location[1]))).size, 1, "the columns asked for are kept");
  // A row wider than the page inside its margins, though narrower than the page, lies in the margins: it is said too.
  fresh();
  out = await call("draw", { kind: "structures", structures: Array.from({ length: 3 }, () => ({ text: "C".repeat(14) })), columns: 3 });
  assert.match(text(out), /^Drew 3 structures in 1 row of 3\. A row of 3 is 38\.\d bond lengths wide \(the page has 35\.4\): give columns: 2, or a larger page \(set_brief\)\./);
  fresh();
  out = await call("draw", { kind: "structures", structures: dodecanes(63) });
  assert.match(text(out), /^Drew 63 structures in 21 rows of 3\. \d+ of the 21 rows are past the bottom of the page: draw the structures after the first (\d+) in a new drawing, or give a larger page \(set_brief\)\./);
  const on = Number(/after the first (\d+)/.exec(text(out))![1]), bottom = (-pageSize(DEFAULT_STYLE)[1] / 2) * (72 / 25.4 / DEFAULT_STYLE.bond), low = (g: number[]) => Math.min(...g.map((i) => m.atoms[i].location[1]));
  assert.ok(on % 3 === 0 && low(fragments(m)[on - 1]) > bottom && low(fragments(m)[on]) < bottom, `the first ${on} are on the page, and the next is not`);
  fresh();
  out = await call("draw", { kind: "structures", structures: dodecanes(on + 1) });
  assert.match(text(out), new RegExp(`^Drew ${on + 1} structures in ${on / 3 + 1} rows of 3\\. 1 of the ${on / 3 + 1} rows is past the bottom of the page: draw the structures after the first ${on} in a new drawing`));
  fresh();
  m = { ...EMPTY, style: { ...DEFAULT_STYLE, edges: false } };
  out = await call("draw", { kind: "structures", structures: dodecanes(6) });
  assert.match(text(out), /^Drew 6 structures in 1 row of 6\. One undo step\./);
}

// A salt given as one compound (a SMILES with a dot) is one compound everywhere (17.1, Salts): one id, one row with
// the formula and SMILES of all of it, one number, and no warning. Its ions are in no group, as a salt drawn by hand
// is: Octet reads the ions as one by their charges and by their one number. What takes its id takes all of it: move,
// replace and delete. In a reaction it is one member of its side, and Octet writes no plus sign between its
// ions. Two starting materials put in one group to move together stay two.
fresh();
out = await call("draw", { kind: "structures", structures: [{ text: "C[N+](C)(C)C.[Cl-]", number: "1" }, { text: "ethanol", number: "2" }] });
assert.equal(out.structuredContent.made.length, 2, "two structures made");
d = await read();
assert.deepEqual(d.structures.map((s: { number: string; formula: string; atoms: number }) => [s.number, s.formula, s.atoms]), [["1", "C4H12ClN", 6], ["2", "C2H6O", 3]]);
assert.match(d.structures[0].smiles, /\[N\+\].*\.\[Cl-\]|\[Cl-\]\..*\[N\+\]/);
assert.deepEqual([d.warnings, m.captions!.map((c) => c.text)], [[], ["1", "2"]]);
assert.ok(!m.groups?.length, "no group");
{
  const salt = d.structures[0].id, was = m.atoms.slice(0, 6).map((a) => a.location[0]);
  assert.ok(!(await call("change", { operations: [{ op: "move", ids: [salt], dx: 2, dy: 0 }] })).isError);
  assert.ok(m.atoms.slice(0, 6).every((a, i) => Math.abs(a.location[0] - was[i] - 2) < 1e-9), "both ions move");
  out = await call("change", { operations: [{ op: "replace", structure: salt, text: "[Na+].[Cl-]" }] });
  assert.ok(!out.isError, text(out));
  d = await read();
  assert.deepEqual(d.structures.map((s: { number: string; formula: string }) => [s.number, s.formula]).sort(), [["1", "ClNa"], ["2", "C2H6O"]]);
  assert.ok(!(await call("change", { operations: [{ op: "delete", ids: ["1"] }] })).isError);
  assert.deepEqual([m.atoms.length, m.captions!.map((c) => c.text)], [3, ["2"]], "both ions and the number go");
}
fresh();
await call("draw", { kind: "reaction", start: [{ text: "C[N+](C)(C)C.[Cl-]", number: "1" }, { text: "ethanol" }], steps: [{ products: [{ text: "water" }] }] });
d = await read();
assert.deepEqual([d.structures.length, d.reactions[0].steps[0].before.length, d.reactions[0].products.length, m.captions!.filter((c) => c.text === "+").length], [3, 2, 1, 1]);
m = { ...m, groups: [{ id: 999, atoms: m.atoms.map((_, i) => i).filter((i) => i < 9), items: [], integral: true }] };
d = await read();
assert.deepEqual([d.structures.length, d.reactions[0].steps[0].before.length], [3, 2], "a group of the two starting materials");

// Conditions that are too long for one line go on more (R4): a list as data breaks between its items, each line with
// its own items, and reads back as the list; a line of text breaks after a comma. A short line stays as it was given.
fresh();
await call("draw", { kind: "reaction", start: [{ text: "benzene" }], steps: [{ catalysts: ["10% NiBr2·glyme", "13% (R)-L", "13% PC4"], solvents: ["1,2-dichloroethane", "hexafluoroisopropanol"], temperature: "60 °C", above: ["1. n-BuLi, THF, -78 °C"], below: ["20 mol% propionic acid, 4 Å mol. sieves"], products: [{ text: "toluene" }] }] });
d = await read();
assert.deepEqual(d.reactions[0].steps[0].above, ["10% NiBr2·glyme, 13% (R)-L", "13% PC4", "1. n-BuLi, THF, -78 °C"]);
assert.deepEqual(d.reactions[0].steps[0].below, ["1,2-dichloroethane", "hexafluoroisopropanol", "60 °C", "20 mol% propionic acid,\n4 Å mol. sieves"]);
assert.deepEqual([d.reactions[0].steps[0].fields.catalysts.map((x: { text: string }) => x.text), d.reactions[0].steps[0].fields.solvents.map((x: { text: string }) => x.text), d.reactions[0].steps[0].fields.temperature], [["10% NiBr2·glyme", "13% (R)-L", "13% PC4"], ["1,2-dichloroethane", "hexafluoroisopropanol"], "60 °C"]);
assert.ok(m.captions!.filter((c) => c.on).every((c) => c.text.split("\n").every((l) => l.length <= 30)), "no line is longer than 30 characters");

// A compound at an arrow (17.1, Tool gaps): a line over or under an arrow can be a compound, with its labels and its
// number, as well as text or "structure:" before a name. The arrow is as long as the structure, which lies within
// its ends and reads as the step's. from: "previous" passes over it.
fresh();
out = await call("draw", { kind: "reaction", start: [{ text: "benzene", number: "1" }], steps: [{ above: [{ text: "*CCCCCCCC", labels: ["Bn"], number: 5 }, "heat"], below: ["structure: ethanol"], products: [{ from: "previous", number: "2" }] }] });
assert.ok(!out.isError, text(out));
assert.match(out.content[1].text!, /Read number 5 as text\./);
d = await read();
{
  const by = (number?: string) => d.structures.find((s: { number?: string; formula: string }) => s.number === number || (!number && s.formula === "C2H6O")), over = by("5"), under = by(undefined), a = m.arrows![0];
  assert.deepEqual([d.structures.length, by("2").formula, over.smiles.includes("C1C=CC=CC=1") || /c1ccccc1/.test(over.smiles)], [4, "C6H6", true], "four structures, and the product is the starting material again");
  assert.deepEqual([d.reactions[0].steps[0].before, d.reactions[0].steps[0].above, d.reactions[0].steps[0].below, d.reactions[0].products], [[by("1").id], ["heat", over.id], [under.id], [by("2").id]]);
  assert.ok(a.from[0] <= over.box[0] && a.to[0] >= over.box[2], `the arrow ${a.from[0]} to ${a.to[0]} is as long as the structure over it ${over.box}`);
}

// cycle: three intermediates on the circle, the centre text, side arrows in and out, step names.
fresh();
out = await call("draw", { kind: "cycle", intermediates: [{ text: "benzene" }, { text: "toluene", number: "5" }, { text: "phenol" }], centre: "Pd(0)", steps: [{ step: 0, in: "PhBr", name: "OA" }, { step: 1, in: "ArB(OH)2", out: "B(OH)3" }, { step: 2, out: "Ph–Ar" }, { step: 7, in: "nothing" }] });
assert.ok(!out.isError, text(out));
const c = m.cycles![0];
assert.equal(c.nodes.length, 3);
assert.ok(c.clockwise);
assert.deepEqual(c.branches!.map((b) => [b.step, !!b.in, !!b.out]), [[0, true, false], [1, true, true], [2, false, true]]);
assert.deepEqual(m.captions!.filter((x) => x.cycle).map((x) => [x.text, x.cycle!.side]), [["Pd(0)", "centre"], ["PhBr", "in"], ["OA", "name"], ["ArB(OH)2", "in"], ["B(OH)3", "out"], ["Ph–Ar", "out"]]);
d = await read();
assert.deepEqual(d.cycles[0].intermediates, d.structures.map((s: { id: string }) => s.id));
assert.equal(d.cycles[0].centre, "Pd(0)");
assert.deepEqual(d.cycles[0].names.map((x: { text: string; at: string }) => `${x.text} ${x.at}`), ["OA 1→5"]);
// Each side arrow by the intermediates its step joins, by number or else place from 1, in the reply and in read: "steps
// 0, 3" made Haiku put a side arrow one step early and never know.
assert.match(text(out), /clockwise; in: PhBr at 1→5; in: ArB\(OH\)2, out: B\(OH\)3 at 5→3; out: Ph–Ar at 3→1\./);
assert.deepEqual(d.cycles[0].sides.map((x: { side: string; text: string; at: string }) => `${x.side} ${x.text} ${x.at}`), ["in PhBr 1→5", "in ArB(OH)2 5→3", "out B(OH)3 5→3", "out Ph–Ar 3→1"]);
// A replaced intermediate keeps its place in the cycle, its number and the side texts at its steps (real-r4-opus-1
// paper-cycle, plan 19.10: two replaced in one change fell out of the cycle, which read as [s1, null, s3, null]).
// replace with ids of one structure and no structure is that structure (real-r4-haiku-3 say-fix).
out = await call("change", { operations: [{ op: "replace", structure: d.structures[1].id, text: "COc1ccccc1" }, { op: "replace", ids: [d.structures[2].id], text: "Nc1ccccc1" }] });
assert.ok(!out.isError, text(out));
assert.equal(out.content[1]?.text, "Read ids as structure.");
{
  const e = await read(), formula = (id: string) => e.structures.find((s: { id: string }) => s.id === id)?.formula;
  assert.deepEqual(e.cycles[0].intermediates.map(formula), ["C6H6", "C7H8O", "C6H7N"]);
  assert.deepEqual(e.cycles[0].sides, d.cycles[0].sides);
  assert.equal(m.cycles![0].branches!.length, 3);
}

// replace keeps the place and the number; delete takes structures and text away; select picks them.
fresh();
await call("draw", { kind: "structures", structures: [{ text: "benzene", number: "2" }, { text: "water" }] });
d = await read();
out = await call("change", { operations: [{ op: "replace", structure: d.structures[0].id, text: "toluene" }] });
assert.ok(!out.isError, text(out));
d = await read();
assert.deepEqual(d.structures.map((s: { formula: string; number?: string }) => [s.formula, s.number]), [["H2O", undefined], ["C7H8", "2"]]);
assert.ok((await call("change", { operations: [{ op: "replace", structure: "s999", text: "water" }] })).isError);
out = await call("change", { operations: [{ op: "select", ids: [d.structures[1].id] }] });
assert.deepEqual((await read()).selected, [d.structures[1].id]);
assert.ok((await call("change", { operations: [{ op: "select", ids: ["t4242"] }] })).isError);
out = await call("change", { operations: [{ op: "delete", ids: [d.structures[0].id] }] });
assert.deepEqual((await read()).structures.map((s: { formula: string }) => s.formula), ["C7H8"]);
assert.ok((await call("change", { operations: [{ op: "delete", ids: ["nothing"] }] })).isError);

// Deleting a reaction's arrow takes its conditions; deleting a structure takes its number.
fresh();
await call("draw", { kind: "reaction", start: [{ text: "ethanol", number: "1" }], steps: [{ above: ["H2SO4"], below: ["heat"], products: [{ text: "water", number: "1" }] }] });
d = await read();
assert.match(d.warnings.map((w: { message: string }) => w.message).join(), /Compound number 1 is on more than one structure/);
await call("change", { operations: [{ op: "delete", ids: [d.arrows[0].id, d.structures[0].id] }] });
assert.deepEqual(m.captions!.filter((x) => x.on || x.text === "1").map((x) => x.text), ["1"]);

// A warning reaches the AI app: carbon with five bonds, in the drawing's result and in read.
fresh();
out = await call("draw", { kind: "structures", structures: [{ text: "CC(C)(C)(C)C" }] });
assert.match(out.structuredContent.warnings.join(), /(five|5) bonds/i);
assert.match(text(out), /"warnings":\[".*(five|5) bonds/i);
assert.match((await read()).warnings[0].message, /five bonds|5 bonds/i);

// Deleting a reaction's structures takes the plus sign between them.
fresh();
await call("draw", { kind: "reaction", start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ products: [{ text: "water" }] }] });
d = await read();
await call("change", { operations: [{ op: "delete", ids: [d.structures[0].id, d.structures[1].id] }] });
assert.ok(!m.captions?.some((c) => c.text === "+"));

// move shifts structures and their numbers; number numbers, renumbers and takes a number away.
fresh();
await call("draw", { kind: "structures", structures: [{ text: "benzene", number: "1" }, { text: "water" }] });
d = await read();
const x0 = m.atoms[0].location[0];
await call("change", { operations: [{ op: "move", ids: [d.structures[0].id], dx: 2, dy: -1 }] });
assert.ok(Math.abs(m.atoms[0].location[0] - x0 - 2) < 1e-9);
await call("change", { operations: [{ op: "number", structure: d.structures[0].id, number: "7" }] });
await call("change", { operations: [{ op: "number", structure: d.structures[1].id, number: "8" }] });
assert.deepEqual((await read()).structures.map((s: { number?: string }) => s.number), ["7", "8"]);
await call("change", { operations: [{ op: "number", structure: d.structures[0].id, number: "" }] });
assert.deepEqual((await read()).structures.map((s: { number?: string }) => s.number), [undefined, "8"]);
assert.equal((await read()).drawing.id, "draw-1");

// Results (D9), with detail: full: structuredContent with the drawing, what was made, changed and deleted, and the
// names given.
fresh();
type Change = { drawing: { id: string }; made: string[]; changed: string[]; deleted: string[]; names?: { given: string; formula?: string }[]; warnings: string[] };
let sc = (await call("draw", { kind: "structures", structures: [{ text: "benzene", number: "1" }, { text: "water" }], detail: "full" }) as unknown as { structuredContent: Change }).structuredContent;
assert.equal(sc.drawing.id, "draw-1");
assert.equal(sc.made.filter((x) => x.startsWith("s")).length, 2);
assert.ok(sc.made.some((x) => x.startsWith("t")), "the number is made too");
assert.deepEqual(sc.names!.map((x) => [x.given, x.formula]), [["benzene", "C6H6"], ["water", "H2O"]]);
d = await read();
const [benzene, water] = d.structures.map((s: { id: string }) => s.id);
// A compound number is an id too (T6).
sc = (await call("change", { operations: [{ op: "delete", ids: ["1"], detail: "full" }] }) as unknown as { structuredContent: Change }).structuredContent;
assert.ok(sc.deleted.includes(benzene) && !sc.deleted.includes(water), JSON.stringify(sc));
// Ids are never given again (D5): a new structure after a delete gets a new id, and the one left keeps its own.
sc = (await call("draw", { kind: "structures", structures: [{ text: "toluene" }] }) as unknown as { structuredContent: Change }).structuredContent;
assert.ok(!sc.made.includes(benzene));
assert.ok((await read()).structures.some((s: { id: string }) => s.id === water));
// read's own structuredContent is what its text says.
const rd = await call("read", {}) as unknown as { structuredContent: { structures: unknown[] }; content: { text: string }[] };
assert.deepEqual(rd.structuredContent, JSON.parse(rd.content[0].text));

// A session whose drawing has closed: every tool but drawings list, drawings use and drawings new says so.
const lost = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/call", params: { name, arguments: args } }), () => host, "1", { ...as("s-1"), lost: "draw-7" })).result;
assert.match((await lost("read", {})).content[0].text, /draw-7\) is closed\. Call drawings, then drawings with use\./);
assert.ok(!(await lost("drawings", { action: "list" })).isError);

// Several sessions in one page at once (plan 17.5). The protocol's own requests and drawings are answered while a draw
// runs: they do not wait for it. A read waits its turn and sees the whole draw.
fresh();
{
  const was = { settle: host.settle, newWindow: host.newWindow, windows: host.windows };
  host.settle = () => new Promise((r) => setTimeout(r, 30)); // a page that takes its time to draw
  const order: string[] = [];
  const req = (what: string, method: string, params?: unknown, from: import("./mcp.ts").From = as("s-2")) => handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }), () => host, "1.2.0", from).then((r) => { order.push(what); return JSON.parse(r); });
  const draw = req("draw", "tools/call", { name: "draw", arguments: { kind: "structures", structures: [{ text: "benzene", number: "1" }] } }, as("s-1"));
  const read = req("read", "tools/call", { name: "read", arguments: {} }, { ...as("s-1"), timed: { sent: 1, got: Date.now(), visibility: "hidden", focus: false } });
  // drawings new is answered once the window is made, before its page lists it: mcp.rs holds the next call for the page.
  let asked: unknown[] = [];
  host.newWindow = async (purpose, session) => { asked = [purpose, session]; return "draw-9"; };
  host.windows = async () => [];
  const free = await Promise.all([
    req("initialize", "initialize", { protocolVersion: "2025-11-25" }), req("ping", "ping"), req("tools/list", "tools/list"), req("prompts/list", "prompts/list"), req("resources/list", "resources/list"),
    req("list", "tools/call", { name: "drawings", arguments: { action: "list" } }, { ...as("s-2"), unset: true }), req("new", "tools/call", { name: "drawings", arguments: { action: "new", for: "paper" } }),
    req("timed ping", "ping", undefined, { ...as("s-2"), timed: { sent: 1, got: 2, visibility: "hidden", focus: false } }),
  ]);
  const [drawn, readOut] = await Promise.all([draw, read]);
  assert.deepEqual([order.length, order.slice(-2)], [10, ["draw", "read"]], order.join(", "));
  assert.ok(free.every((r) => !r.error && !r.result.isError), JSON.stringify(free));
  // A session with no drawing yet uses none; drawings new gives the window it made, which is the session's.
  assert.deepEqual(free[5].result.structuredContent, { drawings: [] });
  assert.deepEqual([free[6].result.structuredContent, asked], [{ opened: "draw-9" }, ["paper", "s-2"]]);
  assert.ok(!drawn.result.isError && readOut.result.structuredContent.structures.length === 1, JSON.stringify(readOut.result.structuredContent));
  // The times of a call, only when asked (a dev build with OCTET_MCP_TIMES): the read waited for the draw.
  const t = readOut.result._meta["octet/times"];
  assert.deepEqual([t.sent, t.visibility, t.focus, t.start - t.got === t.wait, t.end - t.start === t.work, t.wait >= 30], [1, "hidden", false, true, true, true], JSON.stringify(t));
  assert.deepEqual(Object.keys(free[7].result._meta["octet/times"]), ["sent", "got", "visibility", "focus", "start", "end", "wait", "work"]);
  assert.ok(!("_meta" in free[1].result) && !("_meta" in drawn.result));
  Object.assign(host, was);
}
// With no windows (headless, the web component), drawings new starts the new drawing in this page, in order: a read
// sent straight after it reads the new drawing. The user is told, and a cancel puts the drawing back.
fresh();
{
  const was = host.command;
  host.command = (id) => { if (id.startsWith("new_")) host.set(EMPTY); return was(id); };
  await call("draw", { kind: "structures", structures: [{ text: "benzene" }] });
  said = [];
  const req = (name: string, args: unknown, from = as("s-1") as import("./mcp.ts").From) => handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => host, "1.2.0", from).then((r) => JSON.parse(r).result);
  const [made, read] = await Promise.all([req("drawings", { action: "new", for: "paper" }), req("read", {})]);
  assert.deepEqual([made.isError, read.structuredContent.structures.length, said], [undefined, 0, ["Test opened a new drawing."]], JSON.stringify(read.structuredContent));
  await call("draw", { kind: "structures", structures: [{ text: "benzene" }] });
  const before = m, stop = await req("drawings", { action: "new", for: "paper" }, { ...as("s-1"), cancelled: () => true });
  assert.deepEqual([stop.isError, m === before, said.at(-1)], [true, true, "Test stopped. The drawing is as it was."], JSON.stringify(stop));
  host.command = was;
}

// fill_experiment: refused off an experiment page; on one, the details and the grid's amounts by the grid's keys.
fresh();
assert.ok((await call("advanced", { tool: "fill_experiment", args: { details: { title: "Ethyl acetate" } } })).isError);
experiment = true;
await call("draw", { kind: "reaction", start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ above: ["H2SO4"], products: [{ text: "ethyl acetate", number: "1" }] }] });
// No reagent table yet: fill_experiment makes the reaction's.
out = await call("advanced", { tool: "fill_experiment", args: { details: { title: "Ethyl acetate", solvent: "none" }, amounts: [{ of: "acetic acid", mass: "6.0 g", limiting: true }, { of: "ethanol", equiv: "3" }, { of: "1", measured: "7.9 g" }, { of: "H2SO4", volume: "0.1 mL" }, { of: "argon", mass: "1 g" }] } });
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
await call("draw", { kind: "reaction", start: [{ text: "acetic acid" }], steps: [{ above: ["H2SO4 (conc.)"], products: [{ text: "ethyl acetate" }] }] });
out = await call("advanced", { tool: "fill_experiment", args: { amounts: [{ of: "H2SO4 (conc.)", volume: "0.1 mL" }] } });
assert.match(text(out), /"H2SO4 \(conc\.\)" has no column in the table/);
assert.deepEqual(m.grids![0].typed, {});

// Structured conditions (3b): drawn as text in the usual order, kept as data, read back as fields with formulas.
fresh();
experiment = false;
out = await call("draw", { kind: "reaction", start: [{ text: "benzene" }], steps: [{ reagents: ["MeNO2", "NH4OAc"], catalysts: ["CuI (10 mol%)"], solvents: ["AcOH"], temperature: "reflux", time: "4 h", atmosphere: "N2", yield: "78%", below: ["then workup"], products: [{ text: "toluene" }] }] });
assert.ok(!out.isError, text(out));
const onArrow = (side: string) => m.captions!.filter((c) => c.on?.side === side).map((c) => c.text);
assert.deepEqual(onArrow("above"), ["CuI (10 mol%)", "MeNO2, NH4OAc"], "reagents nearest the top, catalysts under them");
assert.deepEqual(onArrow("below"), ["AcOH, reflux, 4 h, N2", "then workup", "78%"]);
let fields = (await read()).reactions[0].steps[0].fields;
assert.deepEqual(fields.reagents.map((x: { text: string; resolved: boolean }) => [x.text, x.resolved]), [["MeNO2", false], ["NH4OAc", false]]);
assert.deepEqual([fields.catalysts[0].text, fields.solvents[0].text, fields.temperature, fields.time, fields.atmosphere, fields.yield], ["CuI (10 mol%)", "AcOH", "reflux", "4 h", "N2", "78%"]);
// Lines in stages over the arrow read back top to bottom; a line edited since it was drawn is read as its text.
fresh();
await call("draw", { kind: "reaction", start: [{ text: "benzene" }], steps: [{ reagents: ["Mg"], above: ["1. PhCHO, 0 °C", "2. NH4Cl"], solvents: ["THF"], temperature: "rt", products: [{ text: "toluene" }] }] });
assert.deepEqual((await read()).reactions[0].steps[0].fields.notes, ["1. PhCHO, 0 °C", "2. NH4Cl"]);
const line = m.captions!.find((c) => c.text === "THF, rt")!;
await call("change", { operations: [{ op: "edit", ids: [`t${line.id}`], text: "Et2O, reflux" }] });
fields = (await read()).reactions[0].steps[0].fields;
assert.deepEqual([fields.solvents?.[0]?.text, fields.temperature], ["Et2O", "reflux"], "the edited line, not the line as drawn");
// Text a user typed reads as fields too.
fresh();
await call("draw", { kind: "reaction", start: [{ text: "benzene" }], steps: [{ above: ["H2SO4, Pd(OAc)2 (5 mol%)"], below: ["THF, -78 °C to rt, overnight", "91%"], products: [{ text: "toluene" }] }] });
fields = (await read()).reactions[0].steps[0].fields;
assert.deepEqual(fields.reagents.map((x: { text: string; formula?: string }) => [x.text, x.formula]), [["H2SO4", "H2SO4"]]);
assert.deepEqual([fields.catalysts[0].text, fields.solvents[0].text, fields.temperature, fields.time, fields.yield], ["Pd(OAc)2 (5 mol%)", "THF", "-78 °C to rt", "overnight", "91%"]);

// arrange runs Octet's Align and Distribute on the ids, then puts the selection back; read with format gives file text.
fresh();
await call("draw", { kind: "structures", structures: [{ text: "benzene", number: "1" }, { text: "water", number: "2" }] });
commands = [];
out = await call("change", { operations: [{ op: "arrange", ids: ["1", "2"], how: "top" }] });
assert.ok(!out.isError, text(out));
assert.deepEqual(commands, ["arrange_top"]);
assert.deepEqual(picked, { atoms: [], items: [] });
assert.ok((await call("change", { operations: [{ op: "arrange", ids: ["1"], how: "left" }] })).isError, "one thing does not line up");
readied = [];
out = await call("read", { format: "smiles" });
// A file waits for Indigo alone: a window that has just opened (--convert) loads no names engine for it.
assert.deepEqual(readied, [false]);
assert.equal((out as unknown as { structuredContent: { text: string } }).structuredContent.text, text(out));
assert.equal(text(out), "C1C=CC=CC=1.O", "benzene and water, as Octet writes SMILES");
// Every format Export writes (plan 18.2): a picture is made as Export makes it, with Export's options, which tools/list
// leaves to read's description. A limit Octet checks is still checked.
out = await call("read", { format: "pdf", dpi: 600, transparent: true, width_mm: 89 });
assert.deepEqual((out as any).structuredContent, { format: "pdf", text: JSON.stringify({ dpi: 600, transparent: true, width_mm: 89 }) });
assert.deepEqual(((await call("read", { format: "PDF" })) as any).structuredContent.text, "{}");
assert.match(text(await call("read", { format: "png", dpi: 9999 })), /dpi/);
assert.match(text(await call("read", { format: "tiff" })), /^Octet cannot write this drawing as TIF\.$/);
// A picture of an empty drawing: Export's own words.
{
  const was = m;
  m = EMPTY;
  assert.equal(text(await call("read", { format: "tiff" })), "There is nothing to export.");
  assert.equal(text(await call("read", { format: "rxn" })), "Octet cannot write this drawing as RXN (an RXN file holds one reaction step).");
  m = was;
}
{
  // tools/list lists the formats read had before, for room (14,000 characters); advanced help of file names every one
  // of Export's, and its options.
  const listed = tools.find((t) => t.name === "read")!.inputSchema.properties;
  assert.ok(!("dpi" in listed), JSON.stringify(listed));
  assert.deepEqual(listed.format.enum, ["cdxml", "mol", "mol2000", "sdf", "rxn", "smiles", "inchi", "cdx"]);
  const help = ((await call("advanced", { tool: "help", args: { of: "file" } })) as any).structuredContent;
  assert.equal(help.call, "read with format");
  assert.ok(["oct", "sdf2000", "rdf", "pdf", "png", "svg", "emf", "eps", "tif", "jpg", "gif"].every((f) => help.description.includes(f)) && /dpi.*transparent.*width_mm/.test(help.description), help.description);
}
// With no window (--headless, --convert) a command that opens a dialog or a box to type in is refused, with what to
// use instead, and so is Export. With a window it runs, and the user finishes it.
commands = [];
assert.match(text(await call("advanced", { tool: "run_command", args: { command: "print" } })), /^Ran print\. Octet shows its dialog/);
windowless = true;
for (const command of ["print", "rotate_dialog"]) {
  out = await call("advanced", { tool: "run_command", args: { command } });
  assert.ok(out.isError && text(out) === `Octet with no window has no dialogs. read with a format gives the drawing as a file. Octet did not run ${command}.`, text(out));
}
assert.ok(!(await call("advanced", { tool: "run_command", args: { command: "clean_up" } })).isError);
out = await call("advanced", { tool: "export", args: { format: "pdf" } });
assert.ok(out.isError && text(out) === "Octet with no window has no dialogs. read with a format gives the drawing as a file.", text(out));
assert.deepEqual(commands, ["print", "print", "clean_up", "clean_up"]);
// An action whose name says nothing of it (Add to dictionary…, a caption's box to type in) that opens a dialog or a
// box all the same: with no window, it is closed again (Escape) and refused, and the drawing still answers. With a
// window, the user finishes it.
{
  const act = host.act;
  host.act = (id) => { commands.push(id); asking = id !== "clean_up"; return true; };
  for (const command of ["dictionary.add", "caption.add"]) {
    out = await call("advanced", { tool: "run_command", args: { command } });
    assert.ok(out.isError && text(out) === `Octet with no window has no dialogs. read with a format gives the drawing as a file. Octet did not run ${command}.` && !asking, text(out));
  }
  assert.ok(!(await call("advanced", { tool: "run_command", args: { command: "clean_up" } })).isError);
  windowless = false;
  assert.ok(!(await call("advanced", { tool: "run_command", args: { command: "dictionary.add" } })).isError && asking);
  assert.equal(dismissed, 2);
  [host.act, asking, dismissed] = [act, false, 0];
}
windowless = false;
// drawings new with a file's text (plan 18.2): the file opens in a window of its own, as File > Open opens it. It is
// in advanced help of new, not in tools/list (for room). With no windows (the web component) it cannot open.
{
  const [newWindow, windows] = [host.newWindow, host.windows];
  let asked: unknown[] = [];
  host.newWindow = async (...a) => { asked = a; return "draw-2"; };
  host.windows = async () => [{ id: "draw-2", name: "esters", edited: false }];
  out = await call("drawings", { action: "new", text: "CCO" });
  assert.ok(!out.isError && text(out).startsWith("Octet opened a new drawing of the file: draw-2."), text(out));
  assert.deepEqual(asked, ["quick", "s-1", "CCO"]);
  // A file that does not open opens no window: the reply says why, and this session's calls stay where they were.
  // What File > Open would leave out of it, the reply says.
  asked = [];
  out = await call("drawings", { action: "new", text: "<bad/>" });
  assert.ok(out.isError && text(out) === "Octet cannot open this file. This ChemDraw file is damaged." && !asked.length, text(out));
  out = await call("drawings", { action: "new", text: "<lost/>" });
  assert.ok(!out.isError && text(out) === "Octet opened a new drawing of the file: draw-2. Octet left out 2 bogus. This session's calls go to it now.", text(out));
  [host.newWindow, host.windows] = [newWindow, windows];
  commands = [];
  out = await call("drawings", { action: "new", text: "CCO" });
  assert.ok(out.isError && commands.length === 0, text(out));
  assert.ok(!("text" in tools.find((t) => t.name === "drawings")!.inputSchema.properties));
  assert.match(((await call("advanced", { tool: "help", args: { of: "new" } })) as any).structuredContent.description, /text: a file's text/);
}
// K11: an AI app (or a script) still reads and writes no file: no tool and no operation takes a path.
{
  const keys = (x: unknown): string[] => (!x || typeof x !== "object" ? [] : Object.entries(x).flatMap(([k, v]) => [...(k === "properties" && v && typeof v === "object" ? Object.keys(v) : []), ...keys(v)]));
  const named = [...TOOL_TABLE, ...OP_TABLE].flatMap((t) => keys(t.inputSchema).filter((k) => /path|folder|directory|^dir$|^files?$|^file_?name$/i.test(k)).map((k) => `${t.name}.${k}`));
  assert.deepEqual(named, []);
}
// read: each structure's source, and InChI where the host gives it.
d = await read();
assert.deepEqual(d.structures.map((s: { source?: { given: string; named: boolean } }) => s.source), [{ given: "benzene", named: true }, { given: "water", named: true }]);

// Same input, same output (3e): the same calls on a new drawing give the same reading, ids included.
const run = async () => { fresh(); resetIds(); await call("draw", { kind: "reaction", start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ reagents: ["H2SO4"], temperature: "reflux", products: [{ text: "ethyl acetate", number: "1" }] }] }); return JSON.stringify(await read()); };
assert.equal(await run(), await run());

// edit (3f): each property on every id it fits; what does not fit is said.
fresh();
await call("draw", { kind: "structures", structures: [{ text: "CCN", number: "4" }] });
d = (await call("read", { atoms: true }) as unknown as { structuredContent: { structures: { id: string; atoms: { id: string; label: string }[]; bonds: { id: string; kind: string }[] }[] } }).structuredContent;
const nAtom = d.structures[0].atoms.find((x) => x.label === "N")!, cc = d.structures[0].bonds.find((b) => b.id.endsWith("1-2"))!;
assert.equal(cc.kind, "single");
out = await call("change", { operations: [{ op: "edit", ids: [nAtom.id], charge: 1, isotope: 15, lone_pairs: 1, colour: "#2F6FED" }] });
assert.ok(!out.isError, text(out));
const N = m.atoms.find((x) => x.label === "N")!;
assert.deepEqual([N.charge, N.isotope, N.pairs, N.colour], [1, 15, 1, "#2F6FED"]);
await call("change", { operations: [{ op: "edit", ids: [cc.id], bond: "wedge" }] });
assert.equal(m.bonds.find((b) => b.stereo === 1)?.type, 1);
out = await call("change", { operations: [{ op: "edit", ids: [nAtom.id, cc.id], charge: 0, bond: "double" }] });
assert.match(text(out), /Not changed: .*takes no bond.*takes no charge/);
assert.equal(m.atoms.find((x) => x.label === "N")!.charge, undefined);
assert.ok((await call("change", { operations: [{ op: "edit", ids: [nAtom.id], colour: "blue" }] })).isError, "colour is #rrggbb");
assert.ok((await call("change", { operations: [{ op: "edit", ids: ["s99.1"], charge: 1 }] })).isError);
// A structure by its number: a colour on all its atoms and bonds; text and arrows take their own properties.
await call("change", { operations: [{ op: "edit", ids: ["4"], colour: "#12A594" }] });
assert.ok(m.atoms.every((x) => x.colour === "#12A594") && m.bonds.every((b) => b.colour === "#12A594"));
fresh();
await call("draw", { kind: "reaction", start: [{ text: "ethanol" }], steps: [{ reagents: ["PCC"], products: [{ text: "acetic acid" }] }] });
const arrowId = `a${m.arrows![0].id}`, cap = `t${m.captions!.find((c) => c.on)!.id}`;
out = await call("change", { operations: [{ op: "edit", ids: [arrowId, cap], style: "dashed", end: "left", bold: true }] });
assert.match(text(out), new RegExp(`${arrowId} takes no bold.*${cap} takes no style, end`));
assert.deepEqual([m.arrows![0].style, m.arrows![0].end, m.captions!.find((c) => c.on)!.bold], ["dashed", "left", true]);

// arrow: a curved arrow from a lone pair to a bond; shape: brackets round a structure with a mark.
d = (await call("read", { atoms: true }) as unknown as { structuredContent: { structures: { id: string; atoms: { id: string; label: string }[]; bonds: { id: string }[] }[] } }).structuredContent;
const o = d.structures[0].atoms.find((x) => x.label === "O")!, bondId = d.structures[1].bonds[0].id;
out = await call("change", { operations: [{ op: "arrow", kind: "curved", from: `${o.id}:pair`, to: bondId }] });
assert.ok(!out.isError, text(out));
const arc = m.arrows!.find((x) => x.kind === "curved")!;
assert.ok(arc.bend === 0.3 && Math.hypot(arc.from[0] - arc.to[0], arc.from[1] - arc.to[1]) > 0.2);
assert.ok((await call("change", { operations: [{ op: "arrow", kind: "fishhook", from: "s99.1", to: bondId }] })).isError);
out = await call("change", { operations: [{ op: "shape", kind: "brackets", around: [d.structures[1].id], mark: "‡" }] });
assert.ok(!out.isError, text(out));
assert.deepEqual([m.shapes![0].kind, m.shapes![0].mark], ["brackets", "‡"]);
const sh = (await read()).shapes;
assert.equal(sh[0].kind, "brackets");
await call("change", { operations: [{ op: "edit", ids: [sh[0].id], kind: "parens", dashed: true }] });
assert.deepEqual([m.shapes![0].kind, m.shapes![0].dashed], ["parens", true]);
await call("change", { operations: [{ op: "delete", ids: [sh[0].id] }] });
// A straight arrow between two structures runs edge to edge, a gap clear of each (no overlap warned).
fresh();
await call("draw", { kind: "structures", structures: [{ text: "benzene" }, { text: "toluene" }] });
d = await read();
out = await call("change", { operations: [{ op: "arrow", kind: "reaction", from: d.structures[0].id, to: d.structures[1].id }] });
assert.ok(!out.isError, text(out));
const ra = m.arrows![0];
assert.ok(ra.from[0] >= d.structures[0].box[2] + 0.4 && ra.to[0] <= d.structures[1].box[0] - 0.4, JSON.stringify([ra, d.structures.map((x: { box: number[] }) => x.box)]));
assert.doesNotMatch(text(out), /overlaps/);
assert.equal(m.shapes!.length, 0);
// With no room, the refusal says how far apart they are and how far apart an arrow and its text need them.
fresh();
await call("draw", { kind: "structures", structures: [{ text: "benzene" }] });
const [s1] = (await read()).structures.map((x: { id: string }) => x.id);
await call("draw", { kind: "structures", structures: [{ text: "toluene" }], right_of: s1, gap: 0.5 });
const [, s2] = (await read()).structures.map((x: { id: string }) => x.id);
out = await call("change", { operations: [{ op: "arrow", kind: "reaction", from: s1, to: s2 }] });
assert.ok(out.isError && text(out).endsWith(`There is no room for an arrow between ${s1} and ${s2} (0.5 bond lengths apart): move them apart first, by 1 bond length and 0.4 for each character of the arrow's text (move with right_of and gap).`), text(out));

// set_style: a preset and a page, one undo step.
fresh();
await call("advanced", { tool: "set_style", args: { preset: "RSC", page: "ACS2" } });
assert.equal(m.style!.preset, "RSC");
assert.equal(m.style!.bond, 12.2);
assert.equal(m.style!.page, "ACS2");
assert.equal(steps.length, 1);

// Tool calls run one after another, so two at once cannot interleave their undo steps.
fresh();
await Promise.all([call("draw", { kind: "structures", structures: [{ text: "water" }] }), call("draw", { kind: "structures", structures: [{ text: "benzene" }] })]);
assert.equal(fragments(m).length, 2);
assert.equal(steps.length, 2);
// A tool that throws still ends its undo step.
host.cleanReactions = () => { throw new Error("broken"); };
out = await call("draw", { kind: "reaction", start: [{ text: "ethanol" }], steps: [{ products: [{ text: "water" }] }] });
assert.ok(out.isError);
assert.match(text(out), /^draw did not finish, and the drawing is as it was before the call: broken/);
assert.equal(open, 0);
assert.equal(fragments(m).length, 2, "the half-drawn reaction is taken away");

host.cleanReactions = (ids) => ids.size;

// Progress and cancel (D2): a call with a progress token sends a notification for each step; a call cancelled part
// way leaves the drawing as it was and says so.
{
  fresh();
  const notes: { progress: number; total?: number; message?: string }[] = [];
  const steps3 = [{ products: [{ text: "ethanol" }] }, { products: [{ text: "CC=O" }] }, { products: [{ text: "CC(=O)O" }] }];
  const go = (from: { progress?: (t: string) => void; cancelled?: () => boolean }) => handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "draw", arguments: { kind: "reaction", start: [{ text: "C=C" }], steps: steps3 }, _meta: { progressToken: "p1" } } }), () => host, "1.2.0", { ...as("s-1"), ...from }).then(JSON.parse);
  let res = await go({ progress: (t) => { const x = JSON.parse(t); assert.equal(x.method, "notifications/progress"); assert.equal(x.params.progressToken, "p1"); notes.push(x.params); } });
  assert.ok(!res.result.isError, res.result.content[0].text);
  assert.deepEqual(notes.map((x) => [x.progress, x.total]), [[0, 3], [1, 3], [2, 3]]);
  assert.equal(notes[1].message, "Step 2 of 3");
  // The window is told too, for the user (McpMagic's pill): the call once with Stop, then how far it is each time, in
  // the tool's words (no new call, still with Stop).
  assert.deepEqual(far, [["Test is drawing.", true, undefined], ["Test is drawing.", true, "Step 1 of 3"], ["Test is drawing.", true, "Step 2 of 3"], ["Test is drawing.", true, "Step 3 of 3"]]);
  // A call that only reads shows nothing.
  far = [];
  await call("read", {});
  assert.deepEqual(far, []);
  // Every product is in the window, the last step's too (6 November 2026: a watched call set the drawing before it
  // placed each step's products, and never after the last).
  assert.equal(fragments(m).length, 4, "the start and all three products drawn");
  const drawn = m, k = steps.length;
  let asked = 0;
  res = await go({ cancelled: () => ++asked > 1 });
  assert.ok(res.result.isError);
  assert.match(res.result.content[0].text, /^draw was cancelled, and the drawing is as it was before the call/);
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
assert.match(r.result.messages[0].content.text, /one draw call with lines[\s\S]*Benzaldehyde \(1\)/);
// (The prompts draw with lines, as the instructions say, plan 19.2.)
assert.match((await send("prompts/get", { name: "redraw_picture", arguments: {} })).result.messages[0].content.text, /with one draw call with lines\./);
assert.match(text(await call("advanced", { tool: "help", args: { of: "arrow" } })), /For a reaction, use draw's lines\./);
assert.equal((await send("prompts/get", { name: "nope" })).error.code, -32602);
assert.equal((await send("prompts/get", { name: "draw_scheme", arguments: {} })).error.code, -32602, "a missing argument");
assert.equal((await send("prompts/get", { name: "draw_scheme", arguments: { text: "x".repeat(20_001) } })).error.code, -32602, "too long");
// (The default read has no SMILES, and the chemistry cannot be judged from formulas: the prompt asks for them.)
assert.ok((await send("prompts/get", { name: "check_drawing" })).result.messages[0].content.text.includes("Call read with smiles: true"));

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
// picture cropped to what changed; read reads only the ids given.
{
  fresh();
  const crops: unknown[][] = [];
  const picture = host.picture;
  host.picture = async (...x) => { crops.push(x); return "iVBOR"; };
  const res = (await call("draw", { kind: "structures", structures: [{ text: "benzene" }, { text: "toluene" }], picture: true })) as unknown as { structuredContent: Change & { boxes: Record<string, number[]> }; content: { type: string; text?: string }[] };
  const sc = res.structuredContent, d = await read();
  assert.deepEqual(Object.keys(sc.boxes).sort(), [...sc.made].sort());
  // A number is in its structure's box: the result gives no box of its own for it, and lists it as made only in full.
  for (const full of [true, false]) {
    const numbered = (await call("draw", { kind: "structures", structures: [{ text: "phenol", number: "4" }], ...(full ? { detail: "full" } : {}) })) as unknown as { structuredContent: Change & { boxes: Record<string, number[]> } };
    assert.ok(numbered.structuredContent.made.some((id) => id.startsWith("t")) === full && Object.keys(numbered.structuredContent.boxes).every((id) => id.startsWith("s")), JSON.stringify(numbered.structuredContent));
  }
  for (const st of d.structures) assert.deepEqual(sc.boxes[st.id], st.box, st.id);
  assert.equal(res.content[1].type, "image");
  const [, crop, longest] = crops[0] as [unknown, number[], number];
  assert.equal(longest, 800);
  assert.ok(crop[0] <= Math.min(...d.structures.map((x: { box: number[] }) => x.box[0])) - 0.9 && crop[2] >= Math.max(...d.structures.map((x: { box: number[] }) => x.box[2])) + 0.9, JSON.stringify(crop));
  assert.doesNotMatch(res.content[0].text!, /"done"/, "the sentence is not repeated in the JSON");
  const one = JSON.parse(text(await call("read", { ids: [d.structures[1].id] })));
  assert.deepEqual(one.structures.map((x: { id: string }) => x.id), [d.structures[1].id]);
  await call("read", { ids: [d.structures[0].id], picture: true, picture_size: "large" });
  const [, got, size] = crops.at(-1)! as [unknown, number[], number];
  assert.equal(size, 1568);
  got.forEach((v, i) => assert.ok(Math.abs(v - (d.structures[0].box[i] + (i < 2 ? -1 : 1))) < 0.06, JSON.stringify(got)));
  assert.ok((await call("read", { ids: ["s99"] })).isError);
  host.picture = picture;
}

// F3: placement. Each side, with gap and align, the same on every tool that takes it, and move to a point.
{
  fresh();
  // (At a point where rounding a box to 0.1, as a result does, does not move its middle: the comparisons below are of
  // rounded boxes, within 0.05. At the top margin, where it would be drawn with no point, the rounding moves it 0.05.)
  await call("draw", { kind: "structures", structures: [{ text: "benzene" }], at: [-10, 5] });
  const [ref] = (await read()).structures, near = (p: number, q: number) => Math.abs(p - q) < 0.05;
  const placedBox = async (args: Record<string, unknown>) => { const r = (await call("draw", { kind: "structures", structures: [{ text: "water" }], ...args })) as unknown as { isError?: true; structuredContent: { made: string[]; boxes: Record<string, number[]> } }; assert.ok(!r.isError, JSON.stringify(r)); return r.structuredContent.boxes[r.structuredContent.made[0]]; };
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
  // Beside several ids (as draw lists it, the same as every operation): beside the box round them.
  const two = { below: [ref.id, (await read()).structures[1].id] }, drawTool = tools.find((x) => x.name === "draw")!.inputSchema as any;
  assert.equal(strict(drawTool, { structures: [{ text: "water" }], ...two }, drawTool.$defs, "draw"), undefined);
  b = await placedBox(two);
  assert.ok(b[3] < Math.min(...(await read()).structures.slice(0, 2).map((x: { box: number[] }) => x.box[1])), JSON.stringify(b));
  // Below or above, it stays on the page across: centred under a structure near the left margin, a wide one would
  // reach past it.
  const left = (15 - pageSize(DEFAULT_STYLE)[0] / 2) * (72 / 25.4 / DEFAULT_STYLE.bond);
  b = await placedBox({ below: ref.id, structures: [{ text: "C".repeat(30) }] });
  assert.ok(b[0] >= left - 0.05 && b[0] < ref.box[0], JSON.stringify([b, left, ref.box]));
  const before = m;
  for (const [args, why] of [[{ right_of: "s99" }, /nothing with the id s99/], [{ right_of: [ref.id, "s99"] }, /nothing with the id s99 to go right of/], [{ right_of: ref.id, below: ref.id }, /not right_of and below/], [{ below: ref.id, align: "top" }, /below or above an object is left, centre or right/]] as const) {
    const out = await call("draw", { kind: "structures", structures: [{ text: "water" }], ...args });
    assert.ok(out.isError);
    assert.match(text(out), why);
  }
  assert.equal(m, before, "a bad placement draws nothing");
  // move: to a point, or beside an object; not both a place and dx.
  const t = (await call("change", { operations: [{ op: "text", text: "Note", at: [0, -30], anchor: "top_left" }] }) as unknown as { structuredContent: { made: string[] } }).structuredContent.made[0];
  let mv = await call("change", { operations: [{ op: "move", ids: [t], right_of: ref.id, align: "top" }] });
  assert.ok(!mv.isError, text(mv));
  const tb = (await read()).text.find((x: { id: string }) => x.id === t);
  assert.ok(tb.at[0] > ref.box[2], JSON.stringify(tb));
  assert.ok((await call("change", { operations: [{ op: "move", ids: [t], dx: 1, to: [0, 0] }] })).isError);
  assert.ok((await call("change", { operations: [{ op: "move", ids: [t] }] })).isError);
  mv = await call("change", { operations: [{ op: "move", ids: [ref.id], to: [0, 0], detail: "full" }] });
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
  let b = await drawn("draw", { kind: "structures", structures: [{ text: "benzene" }] });
  assert.ok(Math.abs(b[0] - left) < 0.5 && b[3] <= top && b[3] > top - 1.5, `at the left and top margins: ${b}`);
  fresh();
  m = { ...EMPTY, style: { ...DEFAULT_STYLE, edges: false } };
  b = await drawn("draw", { kind: "structures", structures: [{ text: "benzene" }] });
  assert.ok(Math.abs(b[0] - left) < 0.5 && Math.abs((b[1] + b[3]) / 2) < 3, `no page edges: level with the middle of the view: ${b}`);
  fresh();
  const title = await drawn("change", { operations: [{ op: "text", text: "A title that is wider than benzene", text_align: "centre", at: [0, 10] }] });
  b = await drawn("draw", { kind: "structures", structures: [{ text: "benzene" }] });
  assert.ok(Math.abs(b[0] - title[0]) < 0.5 && b[3] <= title[1] - 3, `under the title's box, from its left edge: ${b}, ${title}`);
  // What a call made comes into view when the call ends: the host is given its box. A call that makes nothing gives none.
  assert.deepEqual(shown?.map((v) => Math.round(v * 10) / 10), b, "the box of what was made");
  await call("change", { operations: [{ op: "move", ids: ["s1"], dx: 1 }] });
  assert.equal(shown, undefined, "nothing made, nothing to show");
  // (The window cannot run here: the editor's host is checked by its text. It pans the view to that box, as a paste does.)
  assert.match(readFileSync(new URL("./Editor.tsx", import.meta.url), "utf8"), /end: \(made\) => \{[^}]*if \(made\) panTo\(/, "the editor's host brings what a call made into view");
  // Under a shape too (a box drawn round something). Not on an experiment page: its schemes go in its boxes.
  for (experiment of [false, true]) {
    m = EMPTY;
    await call("draw", { kind: "structures", structures: [{ text: "benzene" }], at: [0, 0] });
    const frame = await drawn("change", { operations: [{ op: "shape", kind: "box", box: [-3, -9, 3, 3] }] }), ring = (await read()).structures[0].box;
    b = await drawn("draw", { kind: "structures", structures: [{ text: "toluene" }] });
    assert.ok(experiment ? b[3] > frame[1] && b[3] <= ring[1] - 3 : b[3] <= frame[1] - 3 && Math.abs(b[0] - frame[0]) < 0.5, `${experiment ? "in" : "under"} the box: ${b}, ${frame}`);
  }
  // A template and a file's drawing go with their top left there too, measured with their arrows and shapes: the
  // flask (pen lines, no atoms) at the margins of an empty page, and a file's frame round its structure.
  fresh();
  let made = (await call("advanced", { tool: "place_template", args: { name: "Round-bottom flask" } }) as unknown as { structuredContent: { boxes: Record<string, number[]> } }).structuredContent.boxes, all = Object.values(made);
  assert.ok(Math.abs(Math.min(...all.map((x) => x[0])) - left) < 0.11 && Math.abs(Math.max(...all.map((x) => x[3])) - top) < 0.11, `the flask's top left at the margins: ${JSON.stringify(made)}`);
  fresh();
  const file = host.file;
  host.file = () => ({ ...parseStructure("c1ccccc1"), shapes: [{ id: 1, kind: "box", from: [-4, 5], to: [4, -5] }] }) as Mol;
  made = (await call("advanced", { tool: "add_file", args: { text: "<CDXML/>" } }) as unknown as { structuredContent: { boxes: Record<string, number[]> } }).structuredContent.boxes;
  host.file = file;
  const frame = Object.entries(made).find(([id]) => id[0] === "b")![1];
  assert.ok(Math.abs(frame[0] - left) < 0.11 && Math.abs(frame[3] - top) < 0.11, `the file's frame at the margins: ${JSON.stringify(made)}`);
  // set_style moves everything across as a new scheme is placed: inside the margins from either side, and nothing
  // that is inside them already.
  for (const [x, edge] of [[-30, 0], [30, 2], [0, undefined]] as const) {
    fresh();
    const was = await drawn("draw", { kind: "structures", structures: [{ text: "benzene" }], at: [x, 0] });
    await call("advanced", { tool: "set_style", args: { page: "A4" } });
    const now = (await read()).structures[0].box;
    assert.ok(edge === undefined ? now[0] === was[0] : Math.abs(now[edge] - (edge ? -left : left)) < 0.11, `set_style from ${x}: ${now}`);
  }
}

// F1: batch. References to what earlier steps made, one undo step, and a failure or a bad step leaves the drawing as
// it was and names the step.
{
  fresh();
  let out = await call("change", { operations: [
    { op: "draw", kind: "structures", structures: [{ text: "benzene" }, { text: "toluene" }] },
    { op: "text", text: "Figure 1", below: "$1.s[0]", align: "left" },
    { op: "edit", ids: ["$2.t[0]"], bold: true, picture: true },
    { op: "shape", kind: "box", around: ["$1.s"] },
  ], detail: "full" });
  assert.ok(!out.isError, text(out));
  assert.equal(steps.length, 1, "one undo step");
  assert.match(text(out), /Did 4 steps as one undo step:\n1\. Drew 2 structures/);
  // The window's pill shows how far the call is without the tool's name, which is for the AI app.
  assert.deepEqual(far.map((x) => x[2]), [undefined, "Step 1 of 4", "Step 2 of 4", "Step 3 of 4", "Step 4 of 4"]);
  const sc = (out as unknown as { structuredContent: { steps: { step: number; s?: string[]; t?: string[]; b?: string[] }[]; made: string[] } }).structuredContent;
  assert.equal(sc.steps[0].s!.length, 2);
  assert.equal(m.captions!.find((c) => `t${c.id}` === sc.steps[1].t![0])!.bold, true);
  assert.equal(m.shapes!.length, 1);
  const drawn = m, k = steps.length;
  const refusals: [unknown[], RegExp][] = [
    [[{ op: "draw", kind: "structures", structures: [{ text: "water" }] }, { op: "move", ids: ["s99"], dx: 1, dy: 0 }], /Step 2 \(move\) failed: There is nothing with the id s99/],
    [[{ op: "draw", kind: "structures", structures: [{ text: "water" }] }, { op: "edit", ids: ["$1.s[3]"], colour: "#ff0000" }], /Step 2 \(edit\): \$1\.s\[3\]: step 1 made 1 structures/],
    [[{ op: "edit", ids: ["$1.s[0]"], colour: "#ff0000" }, { op: "delete", ids: ["s1"] }], /Step 1 \(edit\) names step 1/],
    [[{ op: "batch" }, { op: "delete", ids: ["s1"] }], /operations\[0\]\.op: not one of draw, edit, replace, number, delete, move, arrange, text, arrow, shape, select, set_style, place_template, add_file, fill_experiment/],
    [[{ op: "draw", kind: "structures", structures: [{ text: 5 }] }], /^Octet changed nothing\. operations\[0\]\.structures\[0\]\.text: not text\. advanced help of structures gives its arguments\.$/],
    // "$1.made" where one id is needed, when step 1 made two top-level objects: no one meaning, so refused as before.
    // (A place beside them is beside the box round both: headless.check's jobs.)
    [[{ op: "draw", kind: "structures", structures: [{ text: "water" }, { text: "benzene" }] }, { op: "number", structure: "$1.made", number: "3" }], /Step 2 \(number\): \$1\.made names 2 objects here: give one, as \$1\.made\[0\]/],
    [[{ op: "draw", kind: "structures", structures: [{ text: "water" }, { text: "benzene" }] }, { op: "number", structure: "$1.s", number: "3" }], /Step 2 \(number\): \$1\.s names 2 objects here/],
    [Array(41).fill({ op: "delete", ids: ["s1"] }), /more than 40/],
    [[{ op: "draw", kind: "structures", structures: [{ text: "water" }] }, { op: "draw", kind: "structures", structures: [{ text: "not a compound at all" }] }], /Step 2 \(structures\) failed: Octet drew nothing/],
  ];
  for (const [list, why] of refusals) {
    out = await call("change", { operations: list });
    assert.ok(out.isError, String(why));
    assert.match(text(out), why);
    assert.equal(m, drawn, `nothing left behind: ${why}`);
  }
  assert.ok(steps.length - k <= refusals.length, "each failed batch is at most one undo step");
}

// F6: arrow from and to a point; shape at a box; same_width; rich text in text and edit.
{
  fresh();
  let out = await call("change", { operations: [{ op: "arrow", kind: "line", from: [0, 0], to: [5, 0] }] });
  assert.ok(!out.isError, text(out));
  assert.deepEqual([m.arrows![0].from, m.arrows![0].to], [[0, 0], [5, 0]]);
  for (const bad of [[1e9, 0], [1], ["a", 0]]) assert.match(text(await call("change", { operations: [{ op: "arrow", kind: "line", from: bad, to: [5, 0] }] })), /from: not an id .* or a point/);
  out = await call("change", { operations: [{ op: "shape", kind: "rounded", box: [0, 0, 10, 4], fill: "solid", colour: "#EEF2F8" }] });
  assert.ok(!out.isError, text(out));
  await call("change", { operations: [{ op: "shape", kind: "rounded", box: [0, -10, 6, -6] }] });
  const [p1, p2] = m.shapes!;
  const line = `a${m.arrows![0].id}`;
  out = await call("change", { operations: [{ op: "arrange", ids: [`b${p1.id}`, `b${p2.id}`, line], how: "same_width" }] });
  assert.match(text(out), new RegExp(`Not changed \\(not shapes\\): ${line}`));
  const w = (x: { from: number[]; to: number[] }) => Math.abs(x.to[0] - x.from[0]);
  assert.equal(w(m.shapes![0]), 10);
  assert.equal(w(m.shapes![1]), 10);
  assert.equal(Math.min(m.shapes![1].from[0], m.shapes![1].to[0]), 0, "keeps its left edge");
  assert.ok((await call("change", { operations: [{ op: "shape", kind: "box" }] })).isError);
  out = await call("change", { operations: [{ op: "text", runs: [{ text: "M = " }, { text: "Ce", colour: "#6B35B8" }, { text: "IV", script: "super" }] }] });
  assert.ok(!out.isError, text(out));
  const c = m.captions!.at(-1)!;
  assert.equal(c.text, "M = CeIV");
  assert.deepEqual(c.runs!.map((r) => [r.text, r.colour, r.script]), [["M = ", undefined, undefined], ["Ce", "#6B35B8", undefined], ["IV", undefined, "super"]]);
  assert.deepEqual((await read()).text.at(-1).runs.length, 3);
  out = await call("change", { operations: [{ op: "edit", ids: [`t${c.id}`], runs: [{ text: "M = Tb", bold: true }] }] });
  assert.equal(m.captions!.at(-1)!.text, "M = Tb");
  assert.ok((await call("change", { operations: [{ op: "edit", ids: [`t${c.id}`], runs: [{ text: "x", colour: "red" }] }] })).isError);
}

// F4: a molecule given atom by atom keeps its coordinates and labels; a bad one draws nothing. Labels go on the *s
// of a SMILES in order.
{
  fresh();
  const molecule = { atoms: [{ label: "Ce", x: 0, y: 0 }, { label: "O", x: 1, y: 0.5 }, { label: "O", x: 1, y: -0.5 }, { label: "Si(OtBu)2", x: 1.8, y: 0 }], bonds: [{ from: 0, to: 1 }, { from: 1, to: 3 }, { from: 3, to: 2 }, { from: 2, to: 0, kind: "wedge" }] };
  let out = await call("draw", { kind: "structures", structures: [{ molecule, number: "S-1" }] });
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
    out = await call("draw", { kind: "structures", structures: [{ molecule: bad }] });
    assert.ok(out.isError);
    assert.match(text(out), why);
  }
  assert.equal(m, before);
  fresh();
  out = await call("draw", { kind: "structures", structures: [{ text: "*[Pd](*)Br", labels: ["L", "Ar"] }] });
  assert.ok(!out.isError, text(out));
  assert.deepEqual(m.atoms.filter((a) => a.text).map((a) => a.text), ["L", "Ar"]);
  assert.match(text(await call("draw", { kind: "structures", structures: [{ text: "*[Pd]*", labels: ["L"] }] })), /has 2 \* but 1 labels/);
}

// F4: figure. Panels, rows, numbers, captions, side text and brackets, as one undo step; the ids by place.
{
  fresh();
  const out = await call("draw", { kind: "figure", panels: [
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
  assert.ok((await call("draw", { kind: "figure", panels: [{ rows: [[{ structure: "benzene", text: "x" }]] }] })).isError);
  assert.ok((await call("draw", { kind: "figure", panels: [{ rows: [[{ structure: "not a compound at all" }]] }] })).isError);
  assert.ok((await call("draw", { kind: "figure", panels: [{ rows: [[{ structure: "benzene" }]] }], element_colours: { Oxygen: "#ff0000" } })).isError);
}

// F5: the instructions name only tools that exist, and the fast way.
{
  const ins = (await send("initialize", {})).result.instructions as string;
  for (const name of ins.match(/\b[a-z]+_[a-z_]+\b/g) ?? []) assert.ok(["right_of", "ring_fill", ...TOOL_NAMES, ...tools[4].inputSchema.properties.tool.enum].includes(name), name);
  // (Rewritten for speed, plan 19.2: one draw call with lines, then the answer.)
  assert.match(ins, /When it names ids, fix those in one change call\./);
  assert.match(ins, /ONE draw call with lines: .* a grid or scope, or a catalytic cycle/);
  // What misled AI apps in the evals (mcp-v2-eval-notes.md): reagent or reactant and which side (Octet sorts them),
  // where amounts go, what the ids are, and when to look at a picture.
  assert.match(ins, /Do not sort conditions: list them after the product in any order/);
  assert.match(ins, /An amount goes in brackets after its compound or reagent .*\. An experiment page's reagent table takes amounts through advanced fill_experiment\./);
  assert.match(ins, /Ids: s structures, t text, a arrows, b shapes, c cycles, g5 a5's reagent table; a number and conditions move with what they belong to\./);
  // A clean check is a sentence or two to the user, with only what differs from what they asked: models answered with
  // 150 to 300 tokens that repeated every compound, the most of a plain job's time.
  assert.match(ins, /When check is "clean", tell the user it is drawn in a sentence or two, only what differs from their request; no read or picture unless asked how it looks\./);
  // What the compounds list says, a name in it a rule (Octet read the compound as another), and the =id of a repeat.
  assert.match(ins, /^Octet Draw is .* These tools draw in the user's open drawing and read it\.\n[^]*The reply lists each compound as Octet read it \(number, id, formula or =id if drawn again; a name only if read as another\)/);
  // Round 3b: given every compound's SMILES, Haiku tried to write them as changes ("write each compound once ... a
  // later one is a change to it" read as a rule), could not, and said sorry to the user. The SMILES given come first.
  // Round 5 told the model to write a step the user says as a change (3[2° OTBS>OH]); in the real Claude Code runs Opus
  // then did, was refused in two runs of three, and spent more than SMILES had (plan 19.10). The words of before stay.
  assert.match(ins, /Write each compound as the name or SMILES you have \(copy the user's\); only with neither, as a change to an earlier one \(3\[OBn>OTES\]\), which keeps stereocentres\./);
  // (A group is highlighted with highlight too: a shape is a frame or panel.)
  assert.match(ins, /To highlight an atom, bond, group or structure, use change's edit with highlight/);
  // (Only what is asked takes colour: the line kept that when it was cut to fit 2,048 characters.)
  assert.match(ins, / Colour only what is asked\./);
  // Claude Code before 2.1.296 cut a server's instructions at 2,048 characters: at 2,157 it lost the help line.
  assert.ok(ins.length <= 2048, `${ins.length}`);
  // No text an AI app is given names a v1 tool that is gone: the instructions, the tools, the prompts, and what
  // advanced help gives for each kind, operation and tool.
  const gone = /\b(read_drawing|draw_structures|draw_reaction|draw_cycle|draw_figure|replace_structure|add_text|new_drawing|list_drawings|use_drawing|set_number|get_file|add_arrow|add_shape)\b/;
  const prompted = await Promise.all(["draw_scheme", "redraw_picture", "check_drawing", "fill_experiment", "journal_figure"].map(async (name) => JSON.stringify((await send("prompts/get", { name, arguments: { text: "x", procedure: "x", journal: "x" } })).result)));
  for (const t of [ins, JSON.stringify(tools), ...prompted, ...OP_TABLE.map((o) => o.description ?? "")]) assert.ok(!gone.test(t), gone.exec(t)?.[0]);
  // Help is of each kind, operation and advanced tool, by the name a call gives it, and says how to call it.
  for (const [of, how] of [["reaction", "change, as an operation with op: 'draw' and kind: 'reaction'"], ["structures", "draw with structures"], ["edit", "change, as an operation with op: 'edit'"], ["export", "advanced with tool: 'export' and args"]]) {
    const h = (await call("advanced", { tool: "help", args: { of } })).structuredContent;
    assert.deepEqual([h.of, h.call, h.description], [of, how, OP_TABLE.find((o) => o.name === of)!.description]);
    assert.ok(h.description.length > 100 && h.arguments.type === "object" && h.arguments.additionalProperties === false && !("picture" in h.arguments.properties) && !("detail" in h.arguments.properties), of);
  }
  for (const name of ["structures", "reaction", "cycle", "figure", ...tools[1].inputSchema.properties.operations.items.properties.op.enum.filter((o: string) => o !== "draw"), ...tools[4].inputSchema.properties.tool.enum.filter((o: string) => o !== "help")]) assert.ok(!(await call("advanced", { tool: "help", args: { of: name } })).isError, name);
  // With no name, or one Octet does not have, it says what it is of. batch and help are no names to ask of.
  assert.match(text(await call("advanced", { tool: "help" })), /^Give of: a kind of draw \(structures, reaction, cycle, figure\), an operation of change \(edit, /);
  for (const name of ["batch", "help", "read_drawing"]) { const h = await call("advanced", { tool: "help", args: { of: name } }); assert.ok(h.isError && /^Octet has nothing named /.test(text(h)), name); }
  // The named transformations a compound's change takes as do (compound.ts) are in help: draw's list of changes names
  // do in one example and says where the rest are.
  {
    const h = await call("advanced", { tool: "help", args: { of: "transformations" } });
    assert.deepEqual([h.isError, h.structuredContent.of, h.structuredContent.description], [undefined, "transformations", TRANSFORMATIONS]);
    assert.match(text(await call("advanced", { tool: "help" })), /, a tool of advanced \(run_command, .*, draw_route\), set_brief, file \(read with format\), new \(drawings new\) or transformations \(a compound's changes with do\)\.$/);
    assert.match((tools[0].inputSchema as any).$defs.compound.properties.changes.description, /\{do: 'reduce', at: '7', config: 'R'\}, a named transformation \(advanced help of transformations lists them\)/);
  }
  // A reaction's help says what its lines over and under an arrow take and how they read back; draw_route says it in a
  // word.
  assert.match(OP_TABLE.find((o) => o.name === "reaction")!.description, /or a compound drawn at the arrow .*a list over 30 characters goes on more lines between its items, and a free line after a comma or semicolon\. read gives the compounds at an arrow after its text lines\./);
  assert.match(OP_TABLE.find((o) => o.name === "route")!.description!, /above and below add one free line or compound each/);
  // The pieces a tool lists once are whole in help: the compound with its hints and molecule (once in structures and
  // a cycle; four times in a reaction: its starting materials, each step's products, and a line over or under an
  // arrow, which is text or a compound drawn there), text that can be runs (four places in a figure), an arrow's end (two).
  for (const [of, want] of Object.entries({ structures: [1, 0, 0], reaction: [4, 0, 0], cycle: [1, 0, 0], figure: [0, 4, 0], arrow: [0, 0, 2], edit: [0, 0, 0] })) {
    const schema = (await call("advanced", { tool: "help", args: { of } })).structuredContent.arguments, all = refsIn(schema);
    alone(schema, of);
    assert.deepEqual(["compound", "rich", "place"].map((k) => all.filter((x) => x === `#/$defs/${k}`).length), want, of);
    if (want[0]) assert.ok(["text", "molecule", "labels", "from", "changes", "number", "like"].every((k) => k in schema.$defs.compound.properties), of);
  }
}

// Speed, round 2 (plan section 21). R2: orientation hints turn a SMILES as asked, with no coordinates.
{
  const atomsOf = async () => (await call("read", { atoms: true })).structuredContent as { structures: { id: string; atoms: { id: string; label?: string; x: number; y: number }[] }[] };
  const angle = (p: { x: number; y: number }, q: { x: number; y: number }) => (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  const only = () => m.atoms.map((a) => a.location);
  // up: the named label points up from the middle (to the nearest 30°); a second hint sets the side.
  fresh();
  let r = await call("draw", { kind: "structures", structures: [{ text: "*c1ccc(*)cc1", labels: ["OMe", "Br"], up: "OMe" }] });
  assert.ok(!r.isError, text(r));
  const ome = m.atoms.findIndex((a) => a.text === "OMe"), br = m.atoms.findIndex((a) => a.text === "Br");
  assert.ok(Math.abs(m.atoms[ome].location[0] - m.atoms[br].location[0]) < 0.01 && m.atoms[ome].location[1] > m.atoms[br].location[1], "OMe straight up, Br straight down");
  fresh();
  r = await call("draw", { kind: "structures", structures: [{ text: "OC(=O)c1ccccc1C", left: "O", up: "#9" }] });
  assert.ok(!r.isError, text(r));
  const xs = only(), mid = [(Math.min(...xs.map((p) => p[0])) + Math.max(...xs.map((p) => p[0]))) / 2, (Math.min(...xs.map((p) => p[1])) + Math.max(...xs.map((p) => p[1]))) / 2];
  assert.ok(xs[0][0] < mid[0] && xs[9][1] > mid[1], "the OH to the left, the methyl up");
  // rotate is exact; flip keeps each stereocentre (the same InChI as without it).
  fresh();
  await call("draw", { kind: "structures", structures: [{ text: "C[C@H](N)C(=O)O" }] });
  const plain = host.smiles(m);
  fresh();
  await call("draw", { kind: "structures", structures: [{ text: "C[C@H](N)C(=O)O", flip: "horizontal", rotate: 45 }] });
  assert.equal(host.smiles(m), plain, "a flip keeps the stereocentre");
  // geometry: an octahedral metal's ligands at their places, wedges in front and hashes behind, narrow at the metal.
  fresh();
  r = await call("draw", { kind: "structures", structures: [{ text: "[Ce](*)(*)(*)(*)(N#CC)(N#CC)", labels: ["OSiPh3", "OSiPh3", "OSiPh3", "OSiPh3"], geometry: "octahedral" }] });
  assert.ok(!r.isError, text(r));
  const ce = m.atoms.findIndex((a) => a.label === "Ce"), c = m.atoms[ce].location;
  const at = m.bonds.filter((b) => b.atoms[0] === ce).map((b) => ({ angle: Math.round(((Math.atan2(m.atoms[b.atoms[1]].location[1] - c[1], m.atoms[b.atoms[1]].location[0] - c[0]) * 180) / Math.PI + 360) % 360), stereo: b.stereo ?? 0, ligand: b.atoms[1] }));
  assert.deepEqual(at.sort((p, q) => p.ligand - q.ligand).map((x) => [x.angle, x.stereo]), [[90, 0], [270, 0], [150, 6], [210, 1], [30, 6], [330, 1]]);
  // colours by label and by element.
  fresh();
  r = await call("draw", { kind: "structures", structures: [{ text: "*c1ccccc1O", labels: ["MIV"], colours: { MIV: "#4E8B4E", O: "#E0352B" } }] });
  assert.ok(!r.isError, text(r));
  assert.equal(m.atoms.find((a) => a.text === "MIV")?.colour, "#4E8B4E");
  assert.equal(m.atoms.find((a) => a.label === "O")?.colour, "#E0352B");
  // Bad hints draw nothing and say why.
  for (const [hint, says] of [
    [{ up: "Xx" }, /no atom Xx/], [{ up: "#99" }, /no atom #99/], [{ up: "O", down: "#1" }, /one line/], [{ up: "O", left: "#1", right: "#2" }, /at most two/],
    [{ geometry: "octahedral" }, /takes 6 bonds/], [{ colours: { O: "red" } }, /#rrggbb/], [{ colours: { Zz: "#000000" } }, /no atom Zz/],
  ] as const) {
    fresh();
    const bad = await call("draw", { kind: "structures", structures: [{ text: "OCCC(=O)O", ...hint }] });
    assert.ok(bad.isError && says.test(text(bad)) && !m.atoms.length, `${JSON.stringify(hint)}: ${text(bad)}`);
  }
  fresh();
  const chelate = await call("draw", { kind: "structures", structures: [{ text: "[Ce]1(*)(*)OCCO1", labels: ["X", "Y"], geometry: "tetrahedral" }] });
  assert.ok(chelate.isError && /chelate/.test(text(chelate)) && !m.atoms.length, text(chelate));
  // The same hints in reaction and figure.
  fresh();
  r = await call("draw", { kind: "figure", panels: [{ rows: [[{ structure: "*c1ccc(*)cc1", labels: ["OMe", "Br"], down: "OMe", number: "1" }]] }] });
  assert.ok(!r.isError, text(r));
  assert.ok(m.atoms.find((a) => a.text === "OMe")!.location[1] < m.atoms.find((a) => a.text === "Br")!.location[1], "OMe down in a figure");
}

// R3: every write result checks the whole drawing's layout: clean, or the ids of what overlaps, runs off the page or
// lies on a bond.
{
  fresh();
  let r = await call("draw", { kind: "structures", structures: [{ text: "benzene" }] });
  assert.equal((r as any).structuredContent.check, "clean");
  r = await call("change", { operations: [{ op: "text", text: "On the ring", at: [m.atoms[0].location[0] / 2 + m.atoms[3].location[0] / 2, m.atoms[0].location[1] / 2 + m.atoms[3].location[1] / 2] }] });
  const check = (r as any).structuredContent.check;
  assert.ok(check.text_on_bonds?.some(([t]: string[]) => /^t\d+$/.test(t)), JSON.stringify(check));
  r = await call("draw", { kind: "structures", structures: [{ text: "toluene" }], at: [900, 900] });
  assert.ok((r as any).structuredContent.check.off_page?.length, JSON.stringify((r as any).structuredContent.check));
  assert.match(text(r), /"check":/);
  // Two labels of one structure on each other.
  fresh();
  r = await call("draw", { kind: "structures", structures: [{ molecule: { atoms: [{ x: 0, y: 0, label: "N" }, { x: 0.1, y: 0.1, label: "tBu" }, { x: 2, y: 0, label: "O" }], bonds: [{ from: 0, to: 2 }, { from: 1, to: 2 }] } }] });
  assert.ok((r as any).structuredContent.check.labels_overlap?.length, JSON.stringify((r as any).structuredContent.check));
  // A SMILES of generic atoms only reads, with its labels.
  fresh();
  r = await call("draw", { kind: "structures", structures: [{ text: "*(*)(*)(*)*", labels: ["M", "L", "L", "L", "L"], geometry: "tetrahedral" }] });
  assert.ok(!r.isError && m.atoms.length === 5, text(r));
}

// A graphical abstract (6 Nov): text made at its size, a picture alone from a file, a page of any size, and a check
// that names text across an inset's edge, text on a divider and labels that nearly meet.
{
  fresh();
  let r = await call("change", { operations: [{ op: "text", text: "Our approach", size: 9, text_align: "centre" }] });
  assert.ok(!r.isError && m.captions![0].size === 9 && m.captions![0].align === "centre", text(r));
  const file = host.file;
  host.file = () => ({ ...EMPTY, shapes: [{ id: 1, kind: "picture", from: [0, 1], to: [1, 0], picture: { PNG: "89504E47" } }] }) as Mol;
  r = await call("advanced", { tool: "add_file", args: { text: "<CDXML/>" } });
  host.file = file;
  assert.ok(!r.isError && m.shapes?.some((x) => x.kind === "picture"), text(r));
  r = await call("advanced", { tool: "set_style", args: { page_size: [160, 80] } });
  assert.ok(!r.isError && m.style!.page === "Custom" && m.style!.custom[0] === 160 && /160 x 80 mm/.test(text(r)), text(r));
  fresh();
  await call("change", { operations: [{ op: "shape", kind: "rounded", box: [0, 0, 3, 2] }] });
  r = await call("change", { operations: [{ op: "text", text: "curvature per paddlewheel", at: [3, 1] }] });
  assert.ok((r as any).structuredContent.check.on_shape_edges?.length, JSON.stringify((r as any).structuredContent.check));
  fresh();
  await call("change", { operations: [{ op: "arrow", kind: "line", from: [0, -5], to: [0, 5] }] });
  r = await call("change", { operations: [{ op: "text", text: "144 components", at: [-1.05, 0] }] });
  assert.ok((r as any).structuredContent.check.overlaps?.length, JSON.stringify((r as any).structuredContent.check));
  fresh();
  r = await call("draw", { kind: "structures", structures: [{ molecule: { atoms: [{ x: 0, y: 0, label: "O" }, { x: 0.33, y: 0, label: "O" }, { x: 0.16, y: 1, label: "Bi" }], bonds: [{ from: 0, to: 2 }, { from: 1, to: 2 }] } }] });
  assert.ok((r as any).structuredContent.check.labels_overlap?.length, JSON.stringify((r as any).structuredContent.check));
}

// R4: tools/list leaves out the limits Octet checks itself, so it is short; a call past a limit is still refused.
{
  const listed = (await send("tools/list")).result.tools as { name: string; description: string; inputSchema: object }[];
  const json = JSON.stringify(listed.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema })));
  // (R7 took it from 35,000 to 50,000: every command and every object property. With the five tools of plan 5.1 it
  // is under 14,000, and the whole of tools/list is too: what R7 added is in advanced help.)
  assert.ok(json.length < 14_000, `the tools as an AI app gives them to its model: ${json.length} characters`);
  assert.ok(!/"(maxLength|maxItems|minItems|minimum|maximum)"/.test(json));
  // Help gives a schema the same way, and none of what is only Octet's.
  assert.ok(!/"(maxLength|maxItems|minItems|minimum|maximum|numeral|also|default|unlisted)"/.test(JSON.stringify((await call("advanced", { tool: "help", args: { of: "edit" } })).structuredContent.arguments)));
  fresh();
  const long = await call("change", { operations: [{ op: "text", text: "x".repeat(2001) }] });
  assert.ok(long.isError && /2000/.test(text(long)) && !m.captions?.length, text(long));
}

// R5: figure shows the figure as it builds (half the rows, then the rest), with progress, and ends laid out.
{
  fresh();
  const notes: { progress: number; total?: number }[] = [];
  const rows = [[{ structure: "benzene", number: "1" }], [{ structure: "toluene", number: "2" }], [{ structure: "phenol", number: "3" }], [{ text: "end" }]];
  let sets = 0;
  const set = host.set;
  host.set = (x) => { sets++; return set(x); };
  const res = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "draw", arguments: { kind: "figure", panels: [{ title: "A", rows }] }, _meta: { progressToken: "f1" } } }), () => host, "1.2.0", { ...as("s-1"), progress: (t) => notes.push(JSON.parse(t).params) }));
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
  let r = await call("change", { operations: [{ op: "draw", kind: "figure", panels: [{ rows: [[{ structure: "benzene" }]] }], picture: true, detail: "full" }, { op: "select", ids: [] }] });
  assert.ok(!r.isError, text(r));
  assert.ok(r.content.some((c) => c.type === "image"), "the step's picture");
  assert.ok((r as any).structuredContent.steps[0].figure, JSON.stringify((r as any).structuredContent.steps[0]));
  // One operation is run as itself: its result is its own call's (a figure's ids at the top, no list of steps).
  fresh();
  r = await call("change", { operations: [{ op: "draw", kind: "figure", panels: [{ rows: [[{ structure: "benzene" }]] }] }], picture: true, detail: "full" });
  assert.ok(!r.isError && r.content.some((c) => c.type === "image") && (r as any).structuredContent.figure && !(r as any).structuredContent.steps, text(r));
  assert.match(text(r), /^Drew a figure of 1 panel and 1 structure/);
}

// 21.9: atom ids in the order given; atoms and bonds in every tool that takes ids; which way a label reads; the
// number under the caption in a figure.
{
  fresh();
  // C(O)(N)S: Octet walks the bonds from C to S first, but the ids follow the SMILES (C, O, N, S).
  let r = await call("draw", { kind: "structures", structures: [{ text: "C(O)(N)S" }] });
  assert.ok(!r.isError, text(r));
  const id = (r as any).structuredContent.made[0] as string, at = (l: string) => m.atoms.findIndex((a) => a.label === l);
  assert.ok(!(await call("change", { operations: [{ op: "edit", ids: [`${id}.2`], charge: -1 }] })).isError);
  assert.equal(m.atoms[at("O")].charge, -1, "s.2 is the O, the second atom of the SMILES");
  const was = m.atoms.map((a) => [...a.location]);
  r = await call("change", { operations: [{ op: "move", ids: [`${id}.4`], dx: 1 }] });
  assert.ok(!r.isError, text(r));
  assert.ok(m.atoms.every((a, i) => Math.abs(a.location[0] - was[i][0] - (a.label === "S" ? 1 : 0)) < 1e-9), "only the S moves");
  assert.equal(JSON.parse(text(await call("read", { ids: [`${id}.2`] }))).structures.length, 1, "an atom id reads its structure");
  assert.ok(!(await call("change", { operations: [{ op: "select", ids: [`${id}.2`] }] })).isError);
  assert.deepEqual(picked.atoms, [at("O")]);
  r = await call("change", { operations: [{ op: "edit", ids: [`${id}.3`], align: "right" }] });
  assert.equal(m.atoms[at("N")].align, "right");
  await call("change", { operations: [{ op: "edit", ids: [`${id}.3`], align: "auto" }] });
  assert.equal(m.atoms[at("N")].align, undefined);
  assert.match(text(await call("change", { operations: [{ op: "edit", ids: [`${id}.3`], align: "justify" }] })), /takes no align justify/);
  r = await call("change", { operations: [{ op: "text", text: "note" }] });
  assert.match(text(await call("change", { operations: [{ op: "edit", ids: [(r as any).structuredContent.made[0]], align: "above" }] })), /takes no align above/);
  r = await call("change", { operations: [{ op: "delete", ids: [`${id}.1-4`] }] });
  assert.ok(!r.isError, text(r));
  assert.equal(m.bonds.length, 2, "the bond alone goes");
  assert.equal(m.atoms.length, 4, "the S stays");
  assert.ok(!(await call("change", { operations: [{ op: "delete", ids: [`${id}.3`] }] })).isError);
  assert.equal(at("N"), -1);
  // number_under_caption: the caption is the structure's own, added before its number, so Octet draws it first.
  fresh();
  r = await call("draw", { kind: "figure", number_under_caption: true, panels: [{ rows: [[{ structure: "benzene", number: "1", caption: "M = Ce" }, { structure: "toluene", number: "2" }]] }] });
  assert.ok(!r.isError, text(r));
  const cap = m.captions!.find((c) => c.text === "M = Ce")!, num = m.captions!.find((c) => c.text === "1")!;
  assert.ok(cap.under && cap.under.join() === num.under!.join() && cap.id < num.id, JSON.stringify(m.captions));
}

// R7: every object property and every command a chemist has, through edit, text, arrow, shape and
// run_command (6 November 2026: an AI app drew circles for highlights and free text for conditions, as it had no way
// to do what the Actions panel does).
{
  fresh();
  r = await call("draw", { kind: "structures", structures: [{ text: "toluene" }, { text: "phenol" }] });
  const made = (r as any).structuredContent.made as string[], [s1, s2] = made;
  // Highlights: an atom's halo (the disc behind its label), a bond's, and a structure's on every atom and bond; none takes them off.
  r = await call("change", { operations: [{ op: "edit", ids: [`${s1}.1`, `${s1}.2-3`], highlight: "#FFD6A5" }] });
  assert.ok(!r.isError, text(r));
  assert.equal(m.atoms[0].halo, "#FFD6A5");
  assert.equal(m.bonds.find((b) => b.atoms.includes(1) && b.atoms.includes(2))!.halo, "#FFD6A5");
  r = await call("change", { operations: [{ op: "edit", ids: [s2], highlight: "#D9E1F2" }] });
  const g2 = fragments(m)[1];
  assert.ok(g2.every((i) => m.atoms[i].halo === "#D9E1F2"));
  assert.ok(m.bonds.filter((b) => g2.includes(b.atoms[0])).every((b) => b.halo === "#D9E1F2"));
  assert.ok(!(await call("change", { operations: [{ op: "edit", ids: [s2], highlight: "none" }] })).isError);
  assert.ok(g2.every((i) => !m.atoms[i].halo));
  assert.match(text(await call("change", { operations: [{ op: "edit", ids: [s2], highlight: "red" }] })), /#rrggbb or none/);
  // Ring fill and scale run as the Actions panel does them, on the ids selected.
  commands.length = 0;
  r = await call("change", { operations: [{ op: "edit", ids: [s1], ring_fill: "#CFE8E4", scale: 120 }] });
  assert.ok(!r.isError, text(r));
  assert.deepEqual(commands, ["scale.120", "ringfill.#CFE8E4"]);
  // The rest of an atom's, a bond's and a structure's properties.
  r = await call("change", { operations: [{ op: "edit", ids: [`${s2}.1`], atom_number: "7", hidden: false, bars: true, label_angle: 30, bold: true, size: 12, query: { substituents: "upto", n: 2, rings: "simple" } }] });
  assert.ok(!r.isError, text(r));
  const a1 = m.atoms[g2[0]];
  assert.equal(a1.number, "7"); assert.equal(a1.bars, true); assert.equal(a1.labelAngle, 30); assert.equal(a1.bold, true); assert.equal(a1.size, 12);
  assert.deepEqual(a1.query, { subst: { kind: "upto", n: 2 }, rings: "simple" });
  r = await call("change", { operations: [{ op: "edit", ids: [`${s2}.1-2`], position: "left", spacing: 20, topology: "ring", reaction_centre: "change" }] });
  assert.ok(!r.isError, text(r));
  const b1 = m.bonds.find((b) => b.atoms.includes(g2[0]) && b.atoms.includes(g2[1]))!;
  assert.equal(b1.position, "left"); assert.equal(b1.spacing, 20); assert.equal(b1.topology, "ring"); assert.equal(b1.rxn, "change");
  const wasX = m.atoms[g2[0]].location[0];
  r = await call("change", { operations: [{ op: "edit", ids: [s2], rotate: 90, perspective: true, stereo_labels: true, atom_numbers: true, aromatic_circles: true }] });
  assert.ok(!r.isError, text(r));
  assert.notEqual(m.atoms[g2[0]].location[0], wasX);
  assert.ok(g2.every((i) => m.atoms[i].shade), "perspective"); assert.ok(g2.every((i) => m.atoms[i].cip), "stereo labels"); assert.ok(g2.every((i) => m.atoms[i].circle), "aromatic circles");
  assert.deepEqual(g2.map((i) => m.atoms[i].number).sort(), g2.map((_, k) => String(k + 1)).sort(), "atom numbers");
  assert.match(text(await call("change", { operations: [{ op: "edit", ids: [s2], charge: 1 }] })), /takes no charge/);
  r = await call("change", { operations: [{ op: "edit", ids: [s2, `${s1}.1`], ignore_warnings: true }] });
  assert.ok(!r.isError, text(r));
  assert.ok(g2.every((i) => m.atoms[i].ignoreWarnings) && m.atoms[0].ignoreWarnings, "Display Warnings off");
  // A problem on an atom with Display Warnings off is not a warning (as the window hides it).
  r = await call("change", { operations: [{ op: "edit", ids: [`${s2}.1`], charge: 3 }] });
  assert.ok(!JSON.parse(text(await call("read", {}))).warnings.some((w: { at?: string }) => w.at === `${s2}.1`), "hidden problem not listed");
  // Text: conditions on an arrow (Add conditions above), kept on it; freed again with arrow none.
  fresh();
  r = await call("draw", { kind: "reaction", start: [{ text: "toluene" }], steps: [{ products: [{ text: "phenol" }] }] });
  const made2 = ((r as any).structuredContent.made as string[]).filter((x) => x.startsWith("s")), arrow = `a${m.arrows![0].id}`;
  r = await call("change", { operations: [{ op: "text", text: "KOH, 300 °C", arrow, side: "above", italic: true, colour: "#7F7F7F" }] });
  assert.ok(!r.isError, text(r));
  let c = m.captions!.find((x) => x.text === "KOH, 300 °C")!;
  assert.deepEqual(c.on, { arrow: m.arrows![0].id, side: "above" });
  assert.equal(c.italic, true); assert.equal(c.colour, "#7F7F7F");
  r = await call("change", { operations: [{ op: "edit", ids: [`t${c.id}`], side: "below", font: "Helvetica", width: 6, line_height: "variable" }] });
  assert.ok(!r.isError, text(r));
  c = m.captions!.find((x) => x.id === c.id)!;
  assert.equal(c.on!.side, "below"); assert.equal(c.font, "Helvetica"); assert.equal(c.width, 6); assert.equal(c.lineHeight, "variable");
  r = await call("change", { operations: [{ op: "edit", ids: [`t${c.id}`], arrow: "none" }] });
  assert.ok(!r.isError, text(r));
  assert.equal(m.captions!.find((x) => x.id === c.id)!.on, undefined);
  r = await call("change", { operations: [{ op: "text", text: "x", arrow: "a999", side: "above" }] });
  assert.ok(r.isError);
  // Arrows: an orbital, and every property of a block arrow.
  r = await call("change", { operations: [{ op: "arrow", kind: "orbital", from: `${made2[0]}.1`, to: [5, 5], orbital_shape: "p", orbital_phase: "phased", line_width: 1.5 }] });
  assert.ok(!r.isError, text(r));
  const orb = m.arrows!.find((x) => x.kind === "orbital")!;
  assert.deepEqual(orb.orbital, { shape: "p", phase: "phased" }); assert.equal(orb.width, 1.5);
  r = await call("change", { operations: [{ op: "arrow", kind: "block", from: [0, -8], to: [6, -8], head_size: "medium", shaft: 4, fill: "shaded" }] });
  assert.ok(!r.isError, text(r));
  const blk = m.arrows!.find((x) => x.kind === "block")!;
  assert.equal(blk.shaft, 4); assert.equal(blk.fill, "shaded"); assert.equal(blk.headSize!.length, 6);
  r = await call("change", { operations: [{ op: "edit", ids: [`a${blk.id}`], ratio: 2, rotate: 90, head_size: { length: 10, centre: 8, width: 3 } }] });
  assert.ok(!r.isError, text(r));
  const turned = m.arrows!.find((x) => x.id === blk.id)!;
  assert.equal(turned.ratio, 2); assert.deepEqual(turned.headSize, { length: 10, centre: 8, width: 3 });
  assert.ok(Math.abs(turned.from[0] - turned.to[0]) < 1e-6, "turned upright");
  assert.match(text(await call("change", { operations: [{ op: "arrow", kind: "reaction", from: [0, -12], to: [5, -12], orbital_shape: "p" }] })), /go on an orbital/);
  // Shapes: a highlight (behind the rest), one round an atom's label alone, a TLC plate, a table, a picture, brackets.
  r = await call("change", { operations: [{ op: "shape", kind: "highlight", around: [made2[0]] }] });
  assert.ok(!r.isError, text(r));
  assert.equal(m.shapes![0].kind, "highlight");
  r = await call("change", { operations: [{ op: "shape", kind: "oval", around: [`${made2[0]}.1`] }] });
  assert.ok(!r.isError, text(r));
  const disc = m.shapes!.find((x) => x.kind === "oval")!, l = m.atoms[fragments(m)[0][0]].location;
  assert.ok(Math.abs(disc.to[0] - disc.from[0]) < 2 && Math.abs((disc.from[0] + disc.to[0]) / 2 - l[0]) < 0.1, `round the atom, not the structure: ${JSON.stringify(disc)}`);
  r = await call("change", { operations: [{ op: "shape", kind: "tlc", box: [10, 0, 14, 5], tlc: { lanes: 3, spots: [{ lane: 0, rf: 0.4 }, { lane: 2, rf: 0.7, style: "hollow", tail: 0.3 }], rf: true, ticks: true } }] });
  assert.ok(!r.isError, text(r));
  const plate = m.shapes!.find((x) => x.kind === "tlc")!;
  assert.equal(plate.tlc!.lanes, 3); assert.equal(plate.tlc!.spots.length, 2); assert.equal(plate.tlc!.spots[1].style, "hollow"); assert.equal(plate.tlc!.rf, true); assert.equal(plate.tlc!.ticks, true);
  r = await call("change", { operations: [{ op: "shape", kind: "table", box: [10, -8, 18, -2], table: { cells: [["Entry", "Yield"], ["1", "90%"]], lines: "grid", align: ["left", "right"] } }] });
  assert.ok(!r.isError, text(r));
  const table = m.shapes!.find((x) => x.kind === "table")!;
  assert.deepEqual(table.table!.cells, [["Entry", "Yield"], ["1", "90%"]]); assert.deepEqual(table.table!.lines, ["top", "bottom", "left", "right", "header", "rows", "cols"]);
  r = await call("change", { operations: [{ op: "edit", ids: [`b${table.id}`], bold: true, size: 8, table: { lines: "journal" } }] });
  assert.ok(!r.isError, text(r));
  assert.equal(m.shapes!.find((x) => x.id === table.id)!.bold, true); assert.deepEqual(m.shapes!.find((x) => x.id === table.id)!.table!.lines, ["top", "header", "bottom"]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");
  r = await call("change", { operations: [{ op: "shape", kind: "picture", box: [20, 0, 24, 3], png }] });
  assert.ok(!r.isError, text(r));
  assert.equal(m.shapes!.find((x) => x.kind === "picture")!.picture!.PNG, "89504E470D0A1A0A00000000");
  assert.match(text(await call("change", { operations: [{ op: "shape", kind: "picture", box: [20, 0, 24, 3], png: "aGVsbG8=" }] })), /not a PNG/);
  assert.match(text(await call("change", { operations: [{ op: "shape", kind: "picture", box: [20, 0, 24, 3] }] })), /needs png/);
  r = await call("change", { operations: [{ op: "shape", kind: "brackets", around: [made2[1]], usage: "sru", bracket_label: "n", bracket_side: "right", line_width: 2, angle: 15 }] });
  assert.ok(!r.isError, text(r));
  const br = m.shapes!.find((x) => x.kind === "brackets")!;
  assert.deepEqual(br.polymer, { usage: "sru", label: "n" }); assert.equal(br.side, "right"); assert.equal(br.width, 2); assert.equal(br.angle, 15);
  r = await call("change", { operations: [{ op: "edit", ids: [`b${br.id}`], kind: "oval", radius: 0.5, shade_depth: 0.3, shadow: true, rotate: 10 }] });
  assert.ok(!r.isError, text(r));
  const ov = m.shapes!.find((x) => x.id === br.id)!;
  assert.equal(ov.kind, "oval"); assert.equal(ov.radius, 0.5); assert.equal(ov.shade!.depth, 0.3); assert.equal(ov.shadow, true); assert.equal(ov.angle, 25);
  assert.match(text(await call("change", { operations: [{ op: "edit", ids: [`b${ov.id}`], table: { cells: [["x"]] } }] })), /goes on a table/);
  // read reports highlights, and every shape with its kind.
  const seen = await call("read", { atoms: true });
  const sum = JSON.parse(text(seen));
  assert.ok(sum.shapes.some((x: { kind: string }) => x.kind === "tlc") && sum.shapes.some((x: { kind: string }) => x.kind === "picture"));
  // run_command: a menu command, an action with ids (selected first), and one Octet does not have.
  commands.length = 0;
  r = await call("advanced", { tool: "run_command", args: { command: "halo.#FF0000", ids: [made2[0]] } });
  assert.ok(!r.isError, text(r));
  assert.deepEqual([...picked.atoms].sort((p, q) => p - q), [...fragments(m)[0]].sort((p, q) => p - q));
  assert.deepEqual(commands, ["halo.#FF0000"]);
  r = await call("advanced", { tool: "run_command", args: { command: "bring_front" } });
  assert.ok(!r.isError, text(r));
  assert.ok(commands.includes("bring_front"));
  assert.match(text(await call("advanced", { tool: "run_command", args: { command: "rotate_dialog" } })), /dialog/);
  r = await call("advanced", { tool: "run_command", args: { command: "shape.kind.hexagon" } });
  assert.ok(r.isError); assert.match(text(r), /no command/);
  assert.ok((await call("advanced", { tool: "run_command", args: { command: "halo.#FF0000", ids: ["s99"] } })).isError);
  // place_template (8 November 2026): the whole library by name, from the Lab set, and a name the
  // library does not have.
  fresh();
  r = await call("advanced", { tool: "place_template", args: { name: "Round-bottom flask" } });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), /Placed Round-bottom flask from Lab\./);
  assert.ok((m.arrows?.length ?? 0) > 0, "the flask's pen lines are drawn");
  r = await call("advanced", { tool: "place_template", args: { name: "Unobtainium flask" } });
  assert.ok(r.isError); assert.match(text(r), /no template Unobtainium flask/);
  assert.ok((await call("advanced", { tool: "place_template", args: { name: "ATP", set: "Nowhere" } })).isError);
  // A structure over the arrow is the one given there, and the product the product (6 November 2026: they were read
  // products first and drawn structures first, so they swapped).
  fresh();
  r = await call("draw", { kind: "reaction", start: [{ text: "toluene" }], steps: [{ above: ["structure: water"], products: [{ text: "phenol", number: "2" }] }] });
  assert.ok(!r.isError, text(r));
  const over = fragments(m).find((g) => g.length === 1)!, prod = fragments(m).find((g) => g.length === 7 && g.some((i) => m.atoms[i].label === "O"))!;
  assert.equal(m.atoms[over[0]].label, "O");
  assert.ok(m.captions!.some((c) => c.text === "2" && c.under!.includes(prod[0])), "the number is under the product");

  // The scheme reads the same way round throughout: each product turned to lie as its starting material (Augmented
  // Clean Up Reaction), unless keep_orientation is false; like turns a structure as one drawn.
  const ringAngle = (g: number[]) => { const [p, q] = m.bonds.find((b) => g.includes(b.atoms[0]) && g.includes(b.atoms[1]) && m.atoms[b.atoms[0]].label === "C" && m.atoms[b.atoms[1]].label === "C")!.atoms.map((i) => m.atoms[i].location); return ((Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI + 360) % 60; };
  fresh();
  r = await call("draw", { kind: "reaction", start: [{ text: "Cc1ccccc1", rotate: 17 }], steps: [{ products: [{ text: "Oc1ccccc1" }] }], keep_orientation: false });
  assert.ok(!r.isError, text(r));
  let [ga, gb] = fragments(m);
  assert.ok(Math.abs(ringAngle(ga) - ringAngle(gb)) > 2, "unaligned, as a check of the check");
  fresh();
  r = await call("draw", { kind: "reaction", start: [{ text: "Cc1ccccc1", rotate: 17 }], steps: [{ products: [{ text: "Oc1ccccc1" }] }, { products: [{ text: "Oc1ccc(Br)cc1" }] }] });
  assert.ok(!r.isError, text(r));
  [ga, gb] = fragments(m);
  const gc = fragments(m)[2];
  assert.ok(Math.abs(ringAngle(ga) - ringAngle(gb)) < 1, `product as its reactant: ${ringAngle(ga)} vs ${ringAngle(gb)}`);
  assert.ok(Math.abs(ringAngle(ga) - ringAngle(gc)) < 1, `the next step too: ${ringAngle(ga)} vs ${ringAngle(gc)}`);
  fresh();
  r = await call("draw", { kind: "structures", structures: [{ text: "Cc1ccccc1", rotate: 17 }] });
  const ref = (r as any).structuredContent.made[0];
  r = await call("draw", { kind: "structures", structures: [{ text: "Clc1ccccc1", like: ref }] });
  assert.ok(!r.isError, text(r));
  [ga, gb] = fragments(m);
  assert.ok(Math.abs(ringAngle(ga) - ringAngle(gb)) < 1, `like: ${ringAngle(ga)} vs ${ringAngle(gb)}`);
  assert.match(text(await call("draw", { kind: "structures", structures: [{ text: "benzene", like: "s99" }] })), /no structure s99/);
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
  let o = await lenient("draw", { kind: "structures", structures: [{ text: "benzene", number: 13 }, { text: "water", number: 2 }] });
  assert.ok(!o.isError, text(o));
  assert.deepEqual(under(), [["13", true], ["2", true]]);
  assert.deepEqual(notes(o), ["Read number 13 as text, and 1 more the same way."]);
  // Only a whole number from 0 up: 2.5, -3 and 1e21 (which would be drawn as 1e+21) are no compound number.
  for (const number of [2.5, -3, 1e21]) { const no = await lenient("draw", { kind: "structures", structures: [{ text: "water", number }] }); assert.ok(no.isError && /structures\[0\]\.number: not text/.test(text(no)), `${number}: ${text(no)}`); }
  assert.equal(under().length, 2);
  assert.deepEqual(o.structuredContent!.coerced, notes(o));
  assert.ok(!text(o).includes("Read number"), "the result's own text is as it was");
  const benzene = o.structuredContent!.made[0];
  o = await lenient("change", { operations: [{ op: "number", structure: "13", number: 14 }] });
  assert.deepEqual([under()[0], notes(o)], [["14", true], ["Read number 14 as text."]]);
  o = await lenient("change", { operations: [{ op: "edit", ids: ["14"], number: 15 }] });
  assert.deepEqual([under()[0], notes(o)], [["15", true], ["Read number 15 as text."]]);
  o = await lenient("change", { operations: [{ op: "edit", ids: [`${benzene}.1`], atom_number: 1 }] });
  assert.deepEqual([m.atoms[0].number, notes(o)], ["1", ["Read atom_number 1 as text."]]);
  // A call in the form the tool takes says nothing more.
  assert.equal((await call("change", { operations: [{ op: "number", structure: "15", number: "16" }] })).content.length, 1);

  // An enum's value in other letters, after a dot, or by another of its names; a read's text stays its JSON.
  // The line quotes the value without the spaces, tabs and line breaks round it: one line a reading.
  for (const format of ["SMILES", ".smiles", " Smiles ", "smi", "\tSMILES\n"]) {
    o = await lenient("read", { format });
    assert.equal(text(o), "C1C=CC=CC=1.O", format);
    assert.deepEqual(notes(o), [`Read format ${format.trim()} as smiles.`]);
  }
  for (const [detail, full] of [["short", false], ["brief", false], ["Summary", false], ["FULL", true]] as const) {
    o = await lenient("read", { detail });
    assert.equal("captions" in JSON.parse(text(o)), full, detail);
    assert.deepEqual(notes(o), [`Read detail ${detail} as ${full ? "full" : "summary"}.`]);
  }
  o = await lenient("read", { detail: "summary" });
  assert.ok(!o.isError && o.content.length === 1 && !("captions" in JSON.parse(text(o))), "summary is the listed value");
  o = await lenient("advanced", { tool: "export", args: { format: "JPEG" } });
  assert.match(text(o), /JPG chosen/);
  assert.deepEqual(notes(o), ["Read format JPEG as jpg."]);
  o = await lenient("advanced", { tool: "set_style", args: { preset: "nature" } });
  assert.ok(!o.isError, text(o));
  assert.deepEqual([m.style?.preset, notes(o)], ["Nature", ["Read preset nature as Nature."]]);

  // A required argument left out takes its default: drawings new {} is for quick.
  commands = [];
  o = await lenient("drawings", { action: "new" });
  assert.ok(!o.isError, text(o));
  assert.deepEqual([commands, notes(o)], [["new_quick"], ['No "for" was given: read as quick.']]);
  o = await lenient("drawings", { action: "new", for: ".Paper" });
  assert.deepEqual([commands, notes(o)], [["new_quick", "new_paper"], ["Read for .Paper as paper."]]);

  // "1 (taxol)" as a compound number is number 1 with the caption taxol, under the number. A caption can be given too.
  fresh();
  o = await lenient("draw", { kind: "reaction", start: [{ text: "ethanol", number: "2", caption: "from 3" }], steps: [{ products: [{ text: "water", number: "1 (paclitaxel)" }] }] });
  assert.ok(!o.isError, text(o));
  assert.deepEqual(under(), [["2", true], ["from 3", false], ["1", true], ["paclitaxel", false]]);
  assert.deepEqual(notes(o), ["Read number 1 (paclitaxel) as number 1 with the caption paclitaxel."]);
  assert.deepEqual((await read()).structures.map((x: { number: string }) => x.number), ["2", "1"]);
  // The summary has each caption on its structure's row, and not as free text.
  const rows = (await lenient("read", {})).structuredContent as unknown as { structures: { number: string; caption?: string }[]; text?: unknown };
  assert.deepEqual([rows.structures.map((x) => [x.number, x.caption]), rows.text], [[["2", "from 3"], ["1", "paclitaxel"]], undefined]);
  // replace keeps the text under the structure, the caption too, and says so.
  o = await lenient("change", { operations: [{ op: "replace", structure: "1", text: "toluene" }] });
  assert.match(text(o), /^Replaced 1, which keeps its number 1 and its caption\./);
  assert.deepEqual(under(), [["2", true], ["from 3", false], ["1", true], ["paclitaxel", false]]);
  assert.ok(m.captions!.filter((c) => c.text === "1" || c.text === "paclitaxel").every((c) => c.under!.every((i) => m.atoms[i].label === "C") && c.under!.length === 7), "under the new structure");
  // A number with spaces or a line break round it: the line is one line.
  o = await lenient("draw", { kind: "structures", structures: [{ text: "water", number: " 6 (wet)\n" }] });
  assert.deepEqual([under().slice(-2), notes(o)], [[["6", true], ["wet", false]], ["Read number 6 (wet) as number 6 with the caption wet."]]);
  // In a figure the caption is the item's own; an item that has one keeps its number as given.
  fresh();
  o = await lenient("draw", { kind: "figure", panels: [{ rows: [[{ structure: "benzene", number: "4 (minor)" }, { structure: "water", number: "5 (a)", caption: "given" }]] }] });
  assert.ok(!o.isError, text(o));
  assert.deepEqual(m.captions!.map((c) => c.text).sort(), ["4", "5 (a)", "given", "minor"]);
  assert.deepEqual(notes(o), ["Read number 4 (minor) as number 4 with the caption minor."]);
  // Look-alikes stay one number: no space, two brackets, and number, which has no caption to give.
  fresh();
  o = await lenient("draw", { kind: "structures", structures: [{ text: "benzene", number: "1(taxol)" }, { text: "water", number: "2 (a) (b)" }] });
  assert.deepEqual([under(), notes(o)], [[["1(taxol)", true], ["2 (a) (b)", true]], []]);
  o = await lenient("change", { operations: [{ op: "number", structure: "1(taxol)", number: "1 (taxol)" }] });
  assert.deepEqual([under()[0], notes(o)], [["1 (taxol)", true], []]);

  // "$1.made" where one id is needed: the one top-level object step 1 made (its number belongs to it).
  fresh();
  o = await lenient("change", { operations: [{ op: "draw", kind: "structures", structures: [{ text: "benzene", number: 1 }] }, { op: "text", text: "β-lactam", below: "$1.made" }] });
  assert.ok(!o.isError, text(o));
  assert.deepEqual(notes(o), ["Read number 1 as text.", `Read $1.made as ${o.structuredContent!.made[0]}.`]);
  assert.ok(m.captions!.some((c) => c.text === "β-lactam" && !c.under));

  // A MOL file's text as a structure (V3000 and V2000, as read with format writes them, and with Windows line ends) is read
  // as that file. With its spaces made one it is no MOL file, and is refused.
  fresh();
  await call("draw", { kind: "structures", structures: [{ text: "benzene", number: "2" }] });
  const v3000 = toMolfile(parseStructure("Cc1ccccc1")), v2000 = toMolfile(parseStructure("Oc1ccccc1"), true);
  assert.ok(/V3000/.test(v3000) && /V2000/.test(v2000) && / {2}/.test(v2000));
  for (const [file, formula] of [[v3000, "C7H8"], [v2000, "C6H6O"], [v3000.replace(/\n/g, "\r\n"), "C7H8"]]) {
    o = await lenient("change", { operations: [{ op: "replace", structure: "2", text: file }] });
    assert.ok(!o.isError, text(o));
    assert.deepEqual([(await read()).structures.map((x: { formula: string; number: string }) => [x.formula, x.number]), notes(o)], [[[formula, "2"]], []]);
  }
  o = await lenient("draw", { kind: "structures", structures: [{ text: v2000 }] });
  assert.ok(!o.isError, text(o));
  assert.ok(!(await call("draw", { kind: "structures", structures: [{ text: " benzene\n" }] })).isError, "a name with a line break after it is a name, not a file");
  o = await lenient("change", { operations: [{ op: "replace", structure: "2", text: v2000.replace(/ {2,}/g, " ") }] });
  assert.ok(o.isError && /cannot read/.test(text(o)), text(o));

  // One compound drawn twice with one number (a scheme's product that starts the next scheme) is no warning; two
  // compounds with one number are.
  fresh();
  await call("draw", { kind: "reaction", start: [{ text: "ethanol" }], steps: [{ products: [{ text: "benzene", number: "7" }] }] });
  await call("draw", { kind: "reaction", start: [{ text: "benzene", number: "7" }], steps: [{ products: [{ text: "toluene", number: "8" }] }] });
  const twice = async () => (await read()).warnings.map((w: { message: string }) => w.message).filter((t: string) => /Compound number/.test(t));
  assert.deepEqual(await twice(), []);
  await call("change", { operations: [{ op: "number", structure: "8", number: "7" }] });
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
  for (const t of [...TOOL_TABLE.map((x) => ({ name: x.name, inputSchema: x.takes })), ...OP_TABLE]) walk(t.inputSchema, t.name);
  assert.ok(!/"(numeral|also|default)":/.test(JSON.stringify(tools)));
  // What a call must give is listed as required: which drawings action it is. A new drawing's purpose is required of
  // the operation, which is how a call without it is read as quick, and said so.
  assert.deepEqual((tools.find((t) => t.name === "drawings")!.inputSchema as unknown as { required: string[] }).required, ["action"]);
  assert.ok(OP_TABLE.find((t) => t.name === "new")!.inputSchema.required!.includes("for"));
}

// Short replies (R6, plan section 10). A write result is its sentence, the top-level objects made with their boxes,
// the new chemical warnings and the layout check; a read is a summary. detail: full gives all the data, as before.
{
  const ask = async (name: string, args: unknown) => (await call(name, args)) as { content: { type: string; text?: string }[]; isError?: true; structuredContent: Record<string, any> };
  const ESTER = { start: [{ text: "acetic acid" }, { text: "ethanol" }], steps: [{ reagents: ["H2SO4 (cat.)"], temperature: "reflux", yield: "90%", products: [{ text: "ethyl acetate", number: "1" }, { text: "water" }] }] };
  fresh();
  let o = await ask("draw", { kind: "reaction", ...ESTER }), sc = o.structuredContent;
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
  o = await ask("read", {});
  assert.deepEqual(o.structuredContent, {
    drawing: { id: "draw-1", title: "Untitled" }, style: "ACS Document 1996", page: "A4",
    structures: [{ id: firstIds[0], formula: "C2H4O2" }, { id: firstIds[1], formula: "C2H6O" }, { id: firstIds[2], number: "1", formula: "C4H8O2" }, { id: firstIds[3], formula: "H2O" }],
    reactions: [{ route: `${firstIds[0]} + ${firstIds[1]} -> 1 + ${firstIds[3]}`, conditions: { [arrowId]: "H2SO4 (cat.); reflux; 90%" } }],
    check: "clean", warnings: [],
  });
  assert.ok(text(o).length < 450, `a reaction's summary: ${text(o).length} characters`);
  // smiles: true adds each SMILES; ids reads only those; atoms adds the atoms and bonds; a drawing as a resource is the summary.
  o = await ask("read", { smiles: true, ids: ["1"] });
  assert.deepEqual(o.structuredContent.structures, [{ id: firstIds[2], number: "1", formula: "C4H8O2", smiles: "CCOC(=O)C" }]);
  assert.equal(o.structuredContent.reactions.length, 1);
  o = await ask("read", { atoms: true, ids: [firstIds[3]] });
  assert.deepEqual(Object.keys(o.structuredContent.structures[0]), ["id", "formula", "atoms", "bonds"]);
  assert.deepEqual(JSON.parse((await send("resources/read", { uri: "octet://drawing/draw-1" })).result.contents[0].text), (await ask("read", {})).structuredContent);
  // detail: full reads everything, as a read did before.
  const all = await read();
  assert.deepEqual(Object.keys(all.structures[2]), ["id", "smiles", "formula", "source", "number", "atoms", "box"]);
  assert.ok(all.captions.length === 6 && all.pageBox && all.reactions[0].steps[0].fields.reagents && all.arrows.length === 1, JSON.stringify(Object.keys(all)));
  // detail: full on a write: the drawing, every id made (the number and conditions too), changed and deleted, and
  // Octet's reading of each name. Other letters for it are read as it; another word is refused.
  fresh();
  o = await ask("draw", { kind: "reaction", ...ESTER, detail: "FULL" });
  sc = o.structuredContent;
  assert.deepEqual(Object.keys(sc), ["drawing", "done", "made", "changed", "deleted", "boxes", "names", "warnings", "check", "coerced"]);
  assert.equal(sc.made.length, 11);
  assert.deepEqual(sc.names.map((x: { given: string }) => x.given), ["acetic acid", "ethanol", "ethyl acetate", "water"]);
  assert.deepEqual(sc.coerced, ["Read detail FULL as full."]);
  o = await ask("change", { operations: [{ op: "delete", ids: ["1"], detail: "long" }] });
  assert.ok(o.isError && /detail: not one of summary, full/.test(text(o)), text(o));
  assert.ok((await call("change", { operations: [{ op: "delete", ids: ["1"], detail: "long" }] })).isError);
  // A batch is short too: each step's sentence and the top-level objects made. Its steps' ids come with detail: full.
  o = await ask("change", { operations: [{ op: "draw", kind: "structures", structures: [{ text: "benzene", number: "9" }] }, { op: "text", text: "note", below: "$1.s[0]" }] });
  assert.deepEqual([Object.keys(o.structuredContent), o.structuredContent.made.map((id: string) => id[0])], [["done", "made", "boxes", "warnings", "check"], ["s", "t"]]);
  assert.match(text(o), /^Did 2 steps as one undo step:\n1\. Drew 1 structure in 1 row of 1\.\n2\. /);
  // tools/list gives detail on every tool that takes it, and picture with it (plan sections 10 and 16: detail was
  // left unlisted on the write tools until they were merged). Every operation whose result is a change takes it.
  for (const k of ["detail", "picture", "picture_size"]) assert.deepEqual(tools.filter((t) => k in t.inputSchema.properties).map((t) => t.name), ["draw", "change", "read", "advanced"], k);
  assert.deepEqual(tools[0].inputSchema.properties.detail, { type: "string", enum: ["summary", "full"] });
  // (Not drawings new and use: they report no change, as they run outside the page's queue, plan 17.5.)
  assert.equal(OP_TABLE.filter((t) => "detail" in t.inputSchema.properties).length, 23);
  assert.match((await send("initialize", {})).result.instructions, /detail: 'full' on any write call adds all it changed, with boxes\./);
  assert.ok(!/"unlisted"/.test(JSON.stringify(tools)));
  // What the tools' own text says is as a default result is: a command's changes come with detail: full, and a
  // compound's caption is named where its number is.
  const described = (name: string) => OP_TABLE.find((t) => t.name === name)!.description!;
  assert.ok(/detail: full lists what changed\.$/.test(described("run_command")) && !/The result lists/.test(described("run_command")));
  assert.ok(/caption \(text under the number\)/.test(described("structures")) && /number, caption and the hints/.test(described("reaction")));
  assert.ok(/caption under the number/.test(JSON.stringify(tools[0].inputSchema)) && /\(id, number, caption, formula\)/.test(tools[2].description));
  // A reaction's plus signs are made, with their boxes: each has its own place, so a move of what a call made takes
  // all of the reaction (a plus sign left out of made would stay behind).
  fresh();
  o = await ask("draw", { kind: "reaction", ...ESTER });
  const plusAt = () => m.captions!.filter((c) => c.text === "+").map((c) => Math.round(c.y * 10) / 10), level = plusAt();
  assert.ok(!(await ask("change", { operations: [{ op: "move", ids: o.structuredContent.made, dy: -5 }] })).isError);
  assert.deepEqual([level.length, plusAt()], [2, level.map((y) => y - 5)]);
  // A batch step that asks for detail: full gets the layout's new warnings only, as a call does: the warnings there
  // were before the batch are not new. (A short result does not work the layout's warnings out at all.)
  fresh();
  await ask("draw", { kind: "structures", structures: [{ text: "phenol" }], at: [-900, 900] });
  o = await ask("change", { operations: [{ op: "draw", kind: "structures", structures: [{ text: "water" }], at: [0, 0], detail: "full" }] });
  assert.deepEqual([o.structuredContent.warnings, /Octet warns/.test(o.structuredContent.done)], [[], false]);
  o = await ask("change", { operations: [{ op: "draw", kind: "structures", structures: [{ text: "water" }], at: [900, 900], detail: "full" }] });
  assert.ok(o.structuredContent.warnings.length === 1 && /runs past the page's right and top edge/.test(o.structuredContent.warnings[0]), JSON.stringify(o.structuredContent.warnings));

  // The sentence names a compound only where Octet read a name as another name (decision 0021, misread names): the
  // name given, the formula and Octet's own name. A SMILES is drawn as given: it has no name in the sentence, and
  // Octet does not work one out for it (naming takes time) until detail: full asks for every name.
  const name = host.name;
  let namings = 0;
  host.name = (x) => { namings++; return { C9H8O4: "2-acetyloxybenzoic acid", C8H10N4O2: "Caffeine", C7H6O3: "2-hydroxybenzoic acid" }[analyse(x)?.[0]?.formula ?? ""] ?? `${"a".repeat(130)}ne`; };
  Object.assign(NAMES, { aspirin: "CC(=O)Oc1ccccc1C(=O)O", caffeine: "Cn1cnc2c1c(=O)n(C)c(=O)n2C", ...Object.fromEntries(Array.from({ length: 14 }, (_, k) => [`alkane ${k}`, "C".repeat(k + 11)])) });
  // (On a drawing with no page, as Quick start: a grid of long alkanes keeps its columns by count there. On a page
  // it has the columns that fit, and says which rows are past the page.)
  const noPage = () => { fresh(); m = { ...EMPTY, style: { ...DEFAULT_STYLE, edges: false } }; };
  noPage();
  o = await ask("draw", { kind: "structures", structures: [{ text: "aspirin" }, { text: "caffeine" }, { text: "OC(=O)c1ccccc1O" }] });
  assert.equal(o.structuredContent.done, "Drew 3 structures in 1 row of 3. Octet read the names as: aspirin (C9H8O4; Octet's name: 2-acetyloxybenzoic acid). One undo step.");
  assert.equal(namings, 2, "the two names, not the SMILES");
  o = await ask("draw", { kind: "structures", structures: [{ text: "OC(=O)c1ccccc1O" }], detail: "full" });
  assert.deepEqual([namings, o.structuredContent.names], [3, [{ given: "OC(=O)c1ccccc1O", octet: "2-hydroxybenzoic acid", formula: "C7H6O3" }]]);
  // A batch joins its steps' sentences: 40 steps of 12 such names are 80,000 characters. The default reply is cut to
  // fit the limit and says so; detail: full gives all of it.
  const many = { operations: Array.from({ length: 40 }, () => ({ op: "draw", kind: "structures", structures: Array.from({ length: 12 }, (_, k) => ({ text: `alkane ${k}` })) })) };
  o = await ask("change", many);
  const size = o.content.reduce((k, c) => k + (c.text?.length ?? 0), 0);
  assert.ok(size <= MOST && size > MOST - 100, `a batch of 40 steps: ${size} characters`);
  assert.ok(/^Did 40 steps as one undo step:\n1\. Drew 12 structures in 3 rows of 5\. Octet read the names as: alkane 0 .*… \(cut: detail: full gives all of it\)$/s.test(o.structuredContent.done) && text(o).startsWith(`${o.structuredContent.done}\n{"made":[`), o.structuredContent.done.slice(-200));
  noPage();
  o = await ask("change", { operations: many.operations.map((st) => ({ ...st, detail: "full" })) });
  assert.ok(/^40\. Drew 12 structures .*alkane 11 \(C22H46; Octet's name: a{120}…\)\./.test(o.structuredContent.done.split("\n")[40]) && !o.structuredContent.done.includes("(cut:"), "detail: full gives every step");
  // Twelve names at most in a sentence, each of Octet's cut at 120 characters, and how many more there are.
  noPage();
  o = await ask("draw", { kind: "structures", structures: Array.from({ length: 14 }, (_, k) => ({ text: `alkane ${k}` })) });
  assert.match(o.structuredContent.done, /^Drew 14 structures in 3 rows of 5\. Octet read the names as: alkane 0 \(C11H24; Octet's name: a{120}…\), .*alkane 11 \(C22H46; Octet's name: a{120}…\), and 2 more \(detail: full gives each\)\. One undo step\.$/);
  host.name = name;

  // A route's arrows by kind; a number that is on two structures, or is an id's form, gives way to the id.
  fresh();
  o = await ask("draw", { kind: "reaction", start: [{ text: "benzene", number: "1" }], steps: [{ arrow: "equilibrium", products: [{ text: "toluene", number: "s9" }] }, { arrow: "retro", products: [{ text: "phenol", number: "1" }] }, { arrow: "resonance", products: [{ text: "water", number: "4a" }] }, { arrow: "nogo", products: [{ text: "ethanol" }] }] });
  const [b1, t2, p3, , e5] = o.structuredContent.made;
  sc = (await ask("read", {})).structuredContent;
  assert.equal(sc.reactions[0].route, `${b1} <=> ${t2} => ${p3} <-> 4a -/-> ${e5}`);
  // An arrow with no conditions is still in conditions, with "": its id is how text and edit name it, and a
  // reaction's arrows are listed nowhere else in a summary.
  assert.deepEqual(sc.reactions[0].conditions, Object.fromEntries(o.structuredContent.made.filter((id: string) => id[0] === "a").map((id: string) => [id, ""])));
  assert.equal(Object.keys(sc.reactions[0].conditions).length, 4);
  assert.deepEqual(sc.warnings, [{ message: "Compound number 1 is on more than one structure." }]);

  // A salt's two ions under one number are one compound: the route names both by the number (a number counts once
  // for each time it is drawn, not once for each structure under it).
  fresh();
  await ask("draw", { kind: "reaction", start: [{ text: "[Na+].[Cl-]", number: "5" }], steps: [{ products: [{ text: "water", number: "6" }] }] });
  assert.match((await ask("read", {})).structuredContent.reactions[0].route, /^5 (\+ 5 )?-> 6$/);

  // Warnings: a short reply gives the first ten, each at its atom in a read, and how many more there are. The
  // layout is in the check, by id, and not in the warnings again.
  fresh();
  o = await ask("draw", { kind: "structures", structures: [{ text: Array(12).fill("CC(C)(C)(C)C").join(".") }, { text: "toluene" }], at: [900, 900] });
  assert.deepEqual([o.structuredContent.warnings.length, o.structuredContent.more], [10, { warnings: 2 }]);
  assert.ok(o.structuredContent.check.off_page.length && !/page/.test(o.structuredContent.warnings.join()), JSON.stringify(o.structuredContent.check));
  sc = (await ask("read", {})).structuredContent;
  assert.deepEqual([sc.warnings.length, sc.more, sc.warnings[0].at], [10, { warnings: 2 }, `${o.structuredContent.made[0]}.2`]);
  assert.deepEqual(sc.check, o.structuredContent.check);
  assert.ok(!sc.warnings.some((w: { message: string }) => /page/.test(w.message)));
  // Read by id, the check is of those ids.
  assert.equal((await ask("read", { ids: ["s999"] })).isError, true);
  const lone = await ask("draw", { kind: "structures", structures: [{ text: "water" }], at: [0, 0] });
  assert.equal((await ask("read", { ids: lone.structuredContent.made })).structuredContent.check, "clean");
  // With detail: full a write's warnings are all of them, the layout's too, and the sentence gives the first ten.
  o = await ask("draw", { kind: "structures", structures: [{ text: "phenol" }], at: [-900, 900], detail: "full" });
  assert.match(o.structuredContent.done, /Octet warns: .*runs past the page's left and top edge/);
  assert.ok(o.structuredContent.warnings.some((w: string) => /runs past the page/.test(w)));

  // No default reply is over 20,000 characters, whatever is drawn (every call in this file is held to it too). A
  // result lists 200 objects made at most; a read cuts its longest lists. more says how many each left out.
  fresh();
  o = await ask("advanced", { tool: "add_file", args: { text: Array(250).fill("C").join(".") } });
  assert.deepEqual([o.structuredContent.made.length, Object.keys(o.structuredContent.boxes).length, o.structuredContent.more], [200, 200, { made: 50 }]);
  o = await ask("read", {});
  assert.equal(o.structuredContent.structures.length, 250);
  m = { ...m, captions: Array.from({ length: 3000 }, (_, k) => ({ id: 5000 + k, text: `A note ${k} `.repeat(40), x: 0, y: -10 - k })) };
  o = await ask("read", {});
  sc = o.structuredContent;
  assert.ok(text(o).length <= MOST && text(o).length > MOST / 2, `${text(o).length} characters`);
  assert.ok(sc.text.length > 20 && sc.structures.length > 20 && sc.text.length + sc.more.text === 3000 && sc.structures.length + (sc.more.structures ?? 0) === 250, JSON.stringify(sc.more));
  assert.ok(sc.text[0].text.length === 201 && sc.text[0].text.endsWith("…"), "free text in a summary is cut at 200 characters");
  assert.equal(sc.more.rest, "detail: full reads all", "a cut read says how to read the rest");
  assert.ok(text(await ask("read", { detail: "full" })).length > 10 * MOST, "detail: full reads all of it");
}

// The brief kept for each session (test plan B3 to B6, B8, B9, D1, D7 to D9).
{
  const { toCdxml } = await import("./cdxml.ts");
  const { readOct, writeOct } = await import("./oct.ts");
  const { PRESETS, readStyle } = await import("./docstyle.ts");
  const brief = async (args: object, session: string) => { const o = await call("set_brief", args, session); return { o, said: text(o), sc: o.structuredContent }; };
  const reaction = { kind: "reaction", start: [{ text: "ethanol" }], steps: [{ products: [{ text: "water" }] }] };
  // B3, D1: no preference is Quick start: ACS Document 1996 with no page, no journal, and no advice on fit.
  fresh();
  let b = await brief({ destination: { kind: "quick" } }, "s-2");
  assert.ok(!b.o.isError && m.style!.preset === "ACS Document 1996" && !m.style!.edges && !m.style!.purpose, b.said);
  assert.deepEqual(b.sc.brief, { destination: { kind: "quick" }, style: "destination" });
  assert.match(b.said, /^Octet keeps this brief for the session\. The drawing now uses ACS Document 1996 with no page \(Quick start\), with 10 pt labels and 14\.4 pt bonds\. With no page, nothing runs off it\. One undo step\.\n\{/);
  assert.equal(steps.length, 1);
  assert.deepEqual(said, ["Test set the brief."]);
  // B4, B5: the brief is the session's own. Another session has none, and a new one starts with none.
  assert.ok(!(await call("draw", reaction, "s-2")).isError);
  assert.equal(text(await call("draw", reaction, "s-3")), HERE);
  assert.equal(JSON.parse(briefs.get("s-2")!).destination.kind, "quick");
  assert.ok(!briefs.has("s-3"));
  // B9: on Quick start a row wider than any page draws with no advice.
  let o = await call("draw", { kind: "structures", structures: Array.from({ length: 6 }, () => ({ text: "CCCCCCCCCCCCCC" })), columns: 6 }, "s-2");
  assert.ok(!/page/.test(text(o)), text(o));
  // No preference on a drawing that already has work in it keeps its own style and page, and says so (plan 3.3,
  // decided 11 November 2026: before, Quick start replaced them). Quick start is for an empty drawing.
  fresh();
  assert.ok(!(await call("draw", { structures: [{ text: "benzene" }] }, "s-11")).isError);
  const own = m.style;
  b = await brief({ destination: { kind: "quick" } }, "s-11");
  assert.match(b.said, /^Octet keeps this brief for the session\. The drawing has work in it, so it keeps its own style and page\. The drawing uses ACS Document 1996 on A4, with 10 pt labels and 14\.4 pt bonds\. Inside its margins the page is [\d.]+ by [\d.]+ bond lengths\.\n\{/);
  assert.deepEqual([m.style, b.sc.brief], [own, { destination: { kind: "quick" }, style: "from_drawing" }]);
  // B6: a new brief mid-session restyles in one undo step, and says what changed. A journal and a column give its
  // preset's own sizes on its column's page (D2, D3).
  fresh();
  b = await brief({ destination: { kind: "paper", journal: "nature", columns: 2 }, emphasis: "the new C-C bond" }, "s-2");
  const s = m.style!;
  assert.deepEqual([s.preset, s.page, s.custom, s.edges, s.purpose, s.labelSize, s.bond], ["Nature", "Custom", [183, 240], true, "paper", PRESETS.Nature.labelSize, PRESETS.Nature.bond]);
  assert.match(b.said, /^Octet changed the brief's destination, emphasis\. The drawing now uses Nature on a 183 x 240 mm page, with 6 pt labels and 10\.8 pt bonds\. Inside its margins the page is [\d.]+ by [\d.]+ bond lengths\. Follow its emphasis and layout as you draw\. One undo step\./);
  assert.deepEqual(b.sc.brief, { destination: { kind: "paper", journal: "Nature", columns: 2 }, style: "destination", emphasis: "the new C-C bond" });
  assert.equal(steps.length, 1);
  // The same brief again changes nothing (no undo step); ACS's column is its own named page.
  b = await brief({ destination: { kind: "paper", journal: "Nature", columns: 2 }, emphasis: "the new C-C bond" }, "s-2");
  assert.match(b.said, /^The brief is as it was\. The drawing uses Nature/);
  assert.equal(m.style, s);
  await brief({ destination: { kind: "paper", journal: "JACS".replace("JACS", "ACS"), columns: 1 } }, "s-2");
  assert.deepEqual([m.style!.page, m.style!.preset], ["ACS1", "ACS Document 1996"]);
  // B6, B9: what is drawn is restyled with it, and the advice names what no longer fits, with the choices.
  fresh();
  await brief({ destination: { kind: "paper" } }, "s-2");
  o = await call("draw", { kind: "structures", structures: Array.from({ length: 4 }, () => ({ text: "CCCCCCCC" })), columns: 4 }, "s-2");
  assert.ok(!/page/.test(text(o)), `a row that fits gets no advice: ${text(o)}`);
  b = await brief({ destination: { kind: "paper", size_mm: [60, 120] } }, "s-2");
  assert.deepEqual([m.style!.page, m.style!.custom, m.style!.preset], ["Custom", [60, 120], "ACS Document 1996"]);
  assert.match(b.said, /Inside its margins the page is 5\.9 by 17\.7 bond lengths\. (s\d+, )+s\d+ run past the page now: give more rows, split it into schemes, give two columns or a larger page \(set_brief\)\./);
  // D8: a size in mm that a draw does not fit says so, with what to do.
  o = await call("draw", { kind: "structures", structures: Array.from({ length: 3 }, () => ({ text: "CCCCCCCC" })), columns: 3 }, "s-2");
  assert.match(text(o), /A row of 3 is [\d.]+ bond lengths wide \(the page has 5\.9\): give columns: 1, or a larger page \(set_brief\)\./);
  // D9: a journal or page Octet has no preset for is said, with the nearest it has, and nothing changes. A journal that
  // uses a preset's style under its own name is that preset (plan 3.3, decided 11 November 2026: before, these were
  // asked about too), and the reply names it.
  const was = m;
  for (const [journal, preset] of [["Org. Lett.", "ACS Document 1996"], ["JACS", "ACS Document 1996"], ["J. Org. Chem.", "ACS Document 1996"], ["ACS Catal.", "ACS Document 1996"], ["Nature Chemistry", "Nature"], ["Nat. Commun.", "Nature"], ["Chem. Commun.", "RSC"], ["Chem. Sci.", "RSC"], ["Org. Biomol. Chem.", "RSC"], ["Angew. Chem.", "Wiley (Angewandte)"], ["Chem. Eur. J.", "Wiley (Angewandte)"]]) {
    m = was;
    o = await call("set_brief", { destination: { kind: "paper", journal } }, "s-5");
    assert.ok(!o.isError && o.structuredContent.brief.destination.journal === preset && m.style!.preset === preset && text(o).includes(`now uses ${preset} on`), `${journal}: ${text(o)}`);
  }
  m = was;
  for (const [journal, nearest] of [["Bull. Chem. Soc. Jpn.", "ACS Document 1996"], ["Tetrahedron Lett.", "ACS Document 1996"], ["Natl. Sci. Rev.", "Nature"], ["New", "ACS Document 1996"]]) {
    o = await call("set_brief", { destination: { kind: "paper", journal } }, "s-2");
    assert.ok(o.isError && text(o).includes(`Octet has no preset for ${journal.replace(/\.$/, "")}. The nearest it has is ${nearest}. Ask the user whether to use it (journal: '${nearest}')`), text(o));
    assert.equal(m, was);
  }
  assert.equal(text(await call("set_brief", { destination: { kind: "paper", journal: " " } }, "s-2")), "journal is empty. Give the journal's name, or leave journal out.");
  // A journal named in a preset's brackets is that preset, and the reply names it.
  for (const [journal, preset] of [["Angewandte", "Wiley (Angewandte)"], ["Synthesis", "Thieme (Synthesis, Synlett)"], ["synlett", "Thieme (Synthesis, Synlett)"]]) {
    m = was;
    o = await call("set_brief", { destination: { kind: "paper", journal } }, "s-5");
    assert.ok(!o.isError && o.structuredContent.brief.destination.journal === preset && m.style!.preset === preset && text(o).includes(`now uses ${preset} on`), text(o));
  }
  m = was;
  assert.match(text(await call("set_brief", { destination: { kind: "paper", journal: "Wiley", columns: 2 } }, "s-2")), / Octet has no 2-column page for Wiley \(Angewandte\): give size_mm\./);
  assert.match(text(await call("set_brief", { destination: { kind: "poster" } }, "s-2")), /^Octet changed the brief's destination\. The drawing now uses ACS Document 1996 on A0, with 30 pt labels/);
  assert.match(text(await call("set_brief", { destination: { kind: "notebook" } }, "s-2")), / For an experiment page with a reagent table, call drawings with action new, for experiment\./);
  assert.ok((await call("set_brief", { destination: { kind: "book" } }, "s-2")).isError);
  // Each short name the destination lists is a preset.
  for (const name of (tools.find((t) => t.name === "set_brief")!.inputSchema.properties.destination.description as string).slice("2. journal: ".length).split("; ")[0].split(", ")) {
    m = was;
    const r = await call("set_brief", { destination: { kind: "paper", journal: name } }, "s-5");
    assert.ok(!r.isError && Object.keys(PRESETS).includes(r.structuredContent.brief.destination.journal) && r.structuredContent.brief.destination.journal.startsWith(name), name);
  }
  // D7, B8: a style from a file is every value of its document style (bond length, line widths, bold width, margin,
  // hash spacing, bond spacing, fonts, sizes), on the destination's page; from a CDXML or a .oct, for this session
  // only (nothing is stored but the brief). A file with no style, a damaged one and one that is not a drawing are
  // refused with the reason, and nothing changes.
  const mine = readStyle({ bond: 17, line: 0.75, bold: 2.6, margin: 2, hash: 2.6, spacing: 15, labelFont: "Helvetica", labelSize: 12, captionFont: "Helvetica", captionSize: 9, page: "Letter" });
  for (const file of [toCdxml(EMPTY, mine), writeOct(EMPTY, mine)]) {
    fresh();
    b = await brief({ style: { from_file: file }, destination: { kind: "thesis" } }, "s-6");
    const own = readOct(file).mol.style!;
    for (const k of ["bond", "line", "bold", "margin", "hash", "spacing", "labelFont", "labelSize", "captionFont", "captionSize"] as const) assert.equal(m.style![k], own[k], k), assert.equal(m.style![k], mine[k], k);
    assert.deepEqual([m.style!.page, m.style!.purpose, b.sc.brief.style], ["A4", "thesis", "from_file"]);
  }
  assert.ok(!JSON.stringify([...briefs.values()]).includes("CDXML"), "the file is not kept");
  // With a journal too, the file's style is used and the reply says so; the journal gives its column's page.
  fresh();
  b = await brief({ style: { from_file: toCdxml(EMPTY, mine) }, destination: { kind: "paper", journal: "RSC", columns: 1 } }, "s-6");
  assert.ok(m.style!.bond === 17 && m.style!.custom[0] === 83 && b.said.includes(" The style is the user's own, in place of RSC's."), b.said);
  // Quick start has no page, so a page size with it is refused, and nothing changes.
  fresh();
  for (const destination of [{ kind: "quick", size_mm: [100, 100] }, { kind: "quick", columns: 2 }]) {
    o = await call("set_brief", { destination }, "s-7");
    assert.ok(o.isError && text(o).startsWith("Quick start has no page, so columns and size_mm do not go with it."), text(o));
  }
  fresh();
  for (const [file, why] of [
    ['<?xml version="1.0"?><CDXML><page id="1"/></CDXML>', /^from_file has no document style\. Ask the user for a drawing in their style, or give style none\.$/],
    ['<CDXML BondLength="14" <<<', /^Octet cannot read from_file: This ChemDraw file is damaged\. Ask the user/],
    ["CCO", /^from_file is not the text of a CDXML or \.oct file\./],
  ] as [string, RegExp][]) { o = await call("set_brief", { style: { from_file: file }, destination: { kind: "paper" } }, "s-7"); assert.ok(o.isError && why.test(text(o)), text(o)); }
  assert.ok(m === EMPTY && !briefs.has("s-7"));
  // This drawing's own style, on the destination's page; another drawing's is refused with how to give it.
  m = { ...EMPTY, style: mine };
  b = await brief({ style: { from_drawing: "draw-1" }, destination: { kind: "paper" } }, "s-7");
  assert.deepEqual([m.style!.bond, m.style!.labelFont, m.style!.page, b.sc.brief.style], [17, "Helvetica", "A4", "from_drawing"]);
  assert.match(text(await call("set_brief", { style: { from_drawing: "draw-9" }, destination: { kind: "paper" } }, "s-7")), /^Octet reads the style of this session's drawing \(draw-1\) only\./);
  // This drawing as the user says it (the lab's Haiku gave 'current', 11 November).
  for (const [k, d] of ["current", "this", "this drawing", "open", "the current drawing"].entries()) {
    m = { ...EMPTY, style: mine };
    b = await brief({ destination: { kind: "paper", journal: "Angewandte Chemie" }, style: { from_drawing: d } }, `s-7${k}`);
    assert.ok(!b.o.isError && m.style!.bond === 17 && b.sc.brief.style === "from_drawing", b.said);
  }
}

// What a model sees and sends, for speed (plan 19.2). A draw by lines answers so the AI app can tell the user at once:
// each structure it made (its number, its id, its formula), the other ids it made and the check, with no boxes and no
// plus signs. Lines of one drawing are change's draw too. A name or SMILES with changes and no from is that compound
// changed; the hints that turn a compound turn one already drawn, on replace.
{
  fresh();
  let o = await call("draw", { lines: "OC(=O)c1ccccc1 (1) + CO -> COC(=O)c1ccccc1 (2), H2SO4, reflux, 88%" });
  const sc = o.structuredContent;
  assert.deepEqual(Object.keys(sc ?? {}), ["done", "compounds", "made", "warnings", "check"], text(o));
  assert.ok(sc.compounds.length === 3 && sc.compounds.every((c: string) => /^(?:[12] )?s\d+ C/.test(c)) && sc.made.every((id: string) => id[0] === "a"), JSON.stringify(sc));
  assert.ok(!text(o).includes("boxes"));
  // A later scheme that starts from a compound of one before draws it again, as each scheme shows its own start: the
  // list marks the repeat, with no formula (Haiku took the two 15s for a fault and told the user so).
  fresh();
  o = await call("draw", { lines: "# One\nc1ccccc1 -> O=[N+]([O-])c1ccccc1 (15), HNO3, 90%\n# Two\n15 -> Nc1ccccc1 (16), H2, Pd/C, 95%" });
  assert.ok(!o.isError, text(o));
  assert.match(o.structuredContent.compounds.join("|"), /^s\d+ C6H6\|15 (s\d+) C6H5NO2\|15 s\d+ =\1\|16 s\d+ C6H7N$/, text(o));
  fresh();
  o = await call("change", { operations: [{ op: "draw", lines: "CCO (3)" }, { op: "text", text: "ethanol", below: "$1.s[0]" }] });
  assert.ok(!o.isError && (await read()).structures[0].number === "3", text(o));
  assert.match(text(await call("change", { operations: [{ op: "draw", lines: "# A\nC -> CC" }] })), /^Octet changed nothing\. operations\[0\]: these lines make several drawings: draw them with draw, then change them\.$/);
  fresh();
  o = await call("draw", { structures: [{ text: "CC(=O)Oc1ccccc1C(O)=O", changes: [{ swap: { OAc: "OH" } }], number: "4" }] });
  assert.ok(!o.isError, text(o));
  assert.equal((await read()).structures[0].inchiKey, host.inchi(host.structure("Oc1ccccc1C(O)=O")!).key);
  const at = () => m.atoms.map((x) => x.location.map((v) => Math.round(v * 10) / 10).join()).join(" "), was = at();
  o = await call("change", { operations: [{ op: "replace", structure: "4", rotate: 90 }] });
  assert.ok(!o.isError && at() !== was && (await read()).structures[0].number === "4", text(o));
  // A replace that only turns a structure names none in a summary: the compound is the same (Opus read 3,133 characters
  // for one flip of three taxol intermediates). Steps one after another say it once; detail: full names each.
  assert.match(text(o), /^Turned 4 \(now s\d+\)\. One undo step\.\n\{/);
  await call("draw", { structures: [{ text: "caffeine", number: "5" }] });
  o = await call("change", { operations: [{ op: "replace", structure: "4", flip: "horizontal" }, { op: "replace", structure: "5", flip: "horizontal" }, { op: "number", structure: "5", number: "6" }] });
  assert.match(text(o), /^Did 3 steps as one undo step:\n1–2\. Turned 4, 5 \(now s\d+, s\d+\)\.\n3\. /);
  o = await call("change", { operations: [{ op: "replace", structure: "4", flip: "vertical" }], detail: "full" });
  assert.match(text(o), /^Replaced 4 with [^,]+, now s\d+/);
}

// Plan 19.10: what the real Claude Code runs on 6da8b80 showed.
{
  // Haiku wrote draw's lines as a JSON array of lines in the text (about 12 calls in three runs), and was told line 1
  // was longer than 300 characters. A list of lines, or text that reads as one, is those lines, and the reply is the
  // reply to them.
  const lines = ["OC(=O)c1ccccc1 (1) + CO", "-> COC(=O)c1ccccc1 (2), H2SO4, reflux, 88%"], drawn = async (a: object) => { fresh(); resetIds(); return (await call("draw", a)).content.map((c: { text: string }) => c.text); };
  const plain = await drawn({ lines: lines.join("\n") });
  assert.deepEqual(await drawn({ lines: JSON.stringify(lines) }), plain);
  assert.deepEqual(await drawn({ lines }), plain);
  assert.deepEqual(await drawn({ lines: JSON.stringify([lines.join("\n")]) }), plain);
  // draw {operations: '[]', lines} was told "The lines make operations is not an argument of this tool". An empty
  // argument a tool does not take is left out and said; one with something in it is refused as the call's.
  assert.deepEqual(await drawn({ operations: "[]", lines: lines.join("\n") }), [...plain, "Left out operations, which is empty."]);
  assert.deepEqual(await drawn({ operations: [{ op: "delete" }], lines: lines.join("\n") }), ["Octet changed nothing. arguments: operations is not an argument of this tool."]);
}

// advanced as the models called it (haiku-1 say-restyle: 11 refused calls in one job), each reading said in the notes.
{
  const help = async (a: object) => { const o = await call("advanced", a); assert.ok(!o.isError, `${JSON.stringify(a)}: ${text(o)}`); return [JSON.parse(text(o)).of, ...o.content.slice(1).map((c: { text: string }) => c.text)]; };
  assert.deepEqual(await help({ tool: "help", args: { of: "cycle" }, detail: "full" }), ["cycle", "Left out detail: help has none."]);
  assert.deepEqual(await help({ command: "help set_style" }), ["set_style", "Read command as help of set_style."]);
  assert.deepEqual(await help({ tool: "help", command: "set_style" }), ["set_style", "Read command as help of set_style."]);
  assert.deepEqual(await help({ tool: "help", brief: "set_style" }), ["set_style", "Read brief as help of set_style."]);
  assert.deepEqual(await help({ tool: "help", of: "set_style" }), ["set_style"]);
  // grid, scope, lines, scheme, route and notation are what draw's lines write: help of each is the notation.
  for (const x of ["grid", "scope", "lines", "scheme", "route", "notation"]) assert.equal(JSON.parse(text(await call("advanced", { tool: "help", args: { of: x } }))).description, NOTATION, x);
  // set_style's preset as the user names it, under style, name, value, preset or journal, beside tool or in change.
  const styled = async (name: string, a: object) => { fresh(); const o = await call(name, a); assert.ok(!o.isError && host.style().preset === "Wiley (Angewandte)", `${JSON.stringify(a)}: ${text(o)}`); return o.content.slice(1).map((c: { text: string }) => c.text).join(" "); };
  assert.equal(await styled("advanced", { tool: "set_style", style: "Angewandte Chemie" }), "Read style as an argument of set_style in args.\nRead style as preset.\nRead preset Angewandte Chemie as Wiley (Angewandte).");
  for (const k of ["name", "value", "preset", "journal"]) await styled("advanced", { tool: "set_style", [k]: "Angewandte Chemie" });
  assert.equal(await styled("change", { operations: [{ op: "set_style", style: "Angewandte Chemie" }] }), "Read style as preset.\nRead preset Angewandte Chemie as Wiley (Angewandte).");
  // set_brief through advanced is set_brief.
  const o = await call("advanced", { tool: "set_brief", destination: "a paper in Angewandte Chemie" }, "s-adv");
  assert.ok(!o.isError && JSON.parse(briefs.get("s-adv")!).destination.journal === "Wiley (Angewandte)", text(o));
  fresh();
}

console.log("mcp: protocol, argument checks and tools pass.");
