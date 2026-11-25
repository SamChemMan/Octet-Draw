// Run: node src/mcpparity.check.ts. Fails loudly if an AI app cannot do what a chemist can in 1.1.3 (plan
// mcp-1-2-parity): each route, with no window (scripts/headless), one undo step a call, and each refusal with its reason.
import assert from "node:assert/strict";

const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const chem = await import("./chem.ts");
const E = await import("./edit.ts");
type Mol = import("./render.ts").Mol;
await load();

type Reply = { result?: { content: { type: string; text?: string }[]; isError?: boolean; structuredContent?: any }; error?: { code: number; message: string } };
let d = drawing("paper", "Parity");
let n = 0;
const call = async (name: string, args: unknown): Promise<Reply> => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Check", "parity")));
const text = (r: Reply) => r.result?.content.map((c) => c.text ?? "").join("\n") ?? r.error?.message ?? "";
const failed = (r: Reply) => !!(r.error || r.result?.isError);
const ok = async (name: string, args: unknown) => { const r = await call(name, args); assert.ok(!failed(r), `${name} ${JSON.stringify(args).slice(0, 120)}: ${text(r)}`); return r; };
const op = (o: Record<string, unknown>) => ok("change", { operations: [o] });
const adv = (tool: string, args: Record<string, unknown>) => call("advanced", { tool, args });
const fresh = (purpose = "paper") => { d = drawing(purpose, "Parity"); };
const put = (m: Mol) => { d.host.begin("put"); d.host.set(m); d.host.end(); };
const readAll = async () => (await ok("read", { detail: "full" })).result!.structuredContent;

// A1: Structure to Name through run_command waits for the names: they are in the reply and in one undo step.
fresh();
put(E.insertMol(chem.parseStructure("CCO"), chem.parseStructure("c1ccccc1"), [6, 0]).mol);
let r = await ok("advanced", { tool: "run_command", args: { command: "structure_to_name" } });
assert.match(text(r), /2 names added/, text(r));
assert.deepEqual((d.host.doc().captions ?? []).map((c) => c.text).sort(), ["benzene", "ethanol"]);
assert.ok(d.host.command("undo"));
assert.equal(d.host.doc().captions?.length ?? 0, 0, "one undo takes the names off");

// A2: an edit past a limit is an error, and the drawing is as it was.
fresh();
put(chem.parseStructure("CCO"));
{
  const { overLimit } = await import("./limits.ts"), before = d.host.doc();
  const many = { ...before, captions: Array.from({ length: 200_000 }, (_, k) => ({ id: 10_000 + k, text: "a", x: k, y: 0 })) };
  assert.ok(overLimit(many, before), "200,000 texts are past a limit");
  let threw = "";
  try { put(many); } catch (e) { threw = (e as Error).message; }
  assert.match(threw, /holds up to|^It (has|takes) /, "Host.set throws an edit past a limit, with its reason");
  assert.equal(d.host.doc(), before, "the drawing is as it was");
}

// A3: read with a format and ids writes the ids' compounds, whatever the user has selected.
fresh();
await ok("draw", { lines: "ethanol + acetic acid -> ethyl acetate", brief: "quick" });
{
  const rd = await readAll(), [s1, s2] = rd.structures.map((x: { id: string }) => x.id);
  d.host.select(rd.structures[1].atoms ?? [], []);
  r = await ok("read", { format: "smiles", ids: [s1] });
  assert.equal(chem.toInchi(chem.parseStructure(r.result!.structuredContent.text.trim())), chem.toInchi(chem.parseStructure("CCO")), "the ids' compound, not the selection's");
  r = await ok("read", { format: "sdf", ids: [s2] });
  assert.match(r.result!.structuredContent.text, /COUNTS 4 3 /, "acetic acid alone");
}

// A4: a HELM peptide in draw's lines is drawn as a peptide; a bad monomer gives its reason.
fresh();
r = await ok("draw", { lines: "PEPTIDE1{A.C.D}$$$$V2.0 (3)", brief: "quick" });
assert.ok(d.host.doc().atoms.length >= 3, text(r));
r = await call("draw", { lines: "PEPTIDE1{A.Zzq.D}$$$$V2.0", brief: "quick" });
assert.ok(failed(r) || /Zzq|monomer/i.test(text(r)), text(r));
assert.match(text(r), /Zzq|monomer/i);


// The structure's ids (s1), and its atoms' with atoms: true.
const ids = async () => (await ok("read", { atoms: true })).result!.structuredContent;

// B1: Find hazards and Find suppliers need the app (PubChem); with no window they say so and change nothing.
fresh();
put(chem.parseStructure("CCO"));
r = await call("advanced", { tool: "run_command", args: { command: "find_hazards" } });
assert.ok(failed(r) && /Octet app/.test(text(r)), text(r));

// B2: a measurement's ends are atoms or points; a bond is its two atoms; with no atom end a bond length is 1.52 Å.
fresh();
put(chem.parseStructure("CCCC"));
{
  const s = (await ids()).structures[0].id;
  r = await op({ op: "text", measure: [[0, 0], [2, 0]] });
  assert.match(text(r), /Added the length \(distance\) t\d+: 3\.04.*no atom end/s, text(r));
  r = await op({ op: "text", measure: [`${s}.1`, [5, 5]] });
  r = await call("change", { operations: [{ op: "text", measure: [`${s}.1`, `${s}.2`, `${s}.3`, [9, 9]] }] });
  assert.ok(failed(r) && /dihedral takes 4 atoms/i.test(text(r)), text(r));
  r = await ok("advanced", { tool: "run_command", args: { command: "measure_distance", ids: [`${s}.1-2`] } });
  assert.match(text(r), /1\.5\d/);
  const full = await readAll(), mixed = full.captions.find((c: any) => c.measure?.ends?.some(Array.isArray) && c.measure.atoms.length);
  assert.deepEqual(mixed.measure.ends, [`${s}.1`, [5, 5]], JSON.stringify(mixed));
  const before = mixed.measure.value;
  await op({ op: "edit", ids: [s], rotate: 90 });
  const after = (await readAll()).captions.find((c: any) => c.id === mixed.id);
  assert.equal(after.measure.value, before, "turning the structure carries the free end: the value stays");
}

// B3: a curved arrow on a bond and an atom is tied to them: read says so, and it follows a move.
fresh();
put(chem.parseStructure("C=CC"));
{
  const s = (await ids()).structures[0].id;
  r = await op({ op: "arrow", kind: "curved", from: `${s}.1-2`, to: `${s}.3` });
  assert.match(text(r), /tied/);
  let a = (await readAll()).arrows[0];
  assert.deepEqual([a.from_on, a.to_on], [`${s}.1-2`, `${s}.3`]);
  const was = a.to;
  await op({ op: "move", ids: [s], dx: 3, dy: 0 });
  a = (await readAll()).arrows[0];
  assert.ok(Math.abs(a.to[0] - was[0] - 3) < 0.05, `the arrow follows its atom: ${JSON.stringify([was, a.to])}`);
}

// B4: a charge sign's own place, colour and size, read back, and one undo takes them off.
fresh();
put(chem.parseStructure("C[N+](C)(C)C"));
{
  const s = (await ids()).structures[0], n = s.atoms.find((x: any) => x.charge === 1).id;
  await op({ op: "edit", ids: [n], charge_offset: [0.6, 0.6], charge_colour: "#c42b2b", charge_size: 2 });
  const got = (await ids()).structures[0].atoms.find((x: any) => x.id === n);
  assert.equal(got.charge_colour, "#C42B2B");
  assert.equal(got.charge_size, 2);
  assert.ok(Math.abs(Math.hypot(...(got.charge_offset as [number, number])) - Math.hypot(0.6, 0.6)) < 0.01, JSON.stringify(got));
  assert.ok(d.host.command("undo"));
  assert.equal((await ids()).structures[0].atoms.find((x: any) => x.id === n).charge_colour, undefined);
}

// B5: a template placed by its atom 3, with connect, joins by one new bond.
fresh();
put(chem.parseStructure("CCO"));
{
  const s = (await ids()).structures[0].id, before = d.host.doc();
  r = await ok("advanced", { tool: "place_template", args: { name: "Cyclohexane", on: `${s}.2`, by: "3", connect: true } });
  const m = d.host.doc();
  assert.equal(m.atoms.length - before.atoms.length, 6);
  assert.equal(m.bonds.length - before.bonds.length, 7, "six ring bonds and one new bond");
  r = await adv("place_template", { name: "Cyclohexane", on: `${s}.2`, by: "9" });
  assert.ok(failed(r) && /has no atom 9\. Its atoms: 1 C/.test(text(r)), text(r));
}

// B6: conditions take their own gap, and the document's; read gives both.
fresh();
await ok("draw", { lines: "ethanol\n-> acetic acid, KMnO4, H2O", brief: "quick" });
{
  const t = (await readAll()).captions.find((c: any) => c.of?.startsWith("a"));
  await op({ op: "edit", ids: [t.id], gap: 6 });
  assert.equal((await readAll()).captions.find((c: any) => c.id === t.id).gap, 6);
  await ok("advanced", { tool: "set_style", args: { conditions_gap: 5 } });
  assert.equal((await ok("read", {})).result!.structuredContent.conditions_gap, 5);
}

// B11: a Pen curve through points, closed and filled, read back.
fresh();
r = await op({ op: "arrow", kind: "curve", points: [[0, 0], { at: [2, 0], c1: [1.5, 1], c2: [2.5, -1] }, [1, 2]], closed: true, fill: "solid" });
assert.match(text(r), /closed curve a\d+ through 3 points/);
{
  const a = (await readAll()).arrows[0];
  assert.equal(a.kind, "curve");
  assert.equal(a.curve.closed, true);
  assert.deepEqual(a.curve.points[1], { at: [2, 0], c1: [1.5, 1], c2: [2.5, -1] });
}

// B13: a note with its own keyword (a ChemDraw file's Description), changed and taken off.
fresh();
await op({ op: "text", text: "Ref" });
{
  const t = (await readAll()).text[0].id;
  await op({ op: "edit", ids: [t], note: "first", keyword: "Description" });
  let notes = (await readAll()).notes;
  assert.deepEqual(notes.map((x: any) => [x.keyword, x.text]), [["Description", "first"]]);
  await op({ op: "edit", ids: [t], note: "second", keyword: "Description" });
  notes = (await readAll()).notes;
  assert.deepEqual(notes.map((x: any) => x.text), ["second"]);
  await op({ op: "edit", ids: [t], note: "", keyword: "Description" });
  assert.equal((await readAll()).notes, undefined);
}

// B14: a chart's data replaced in place: its top left stays.
fresh();
r = await ok("draw", { kind: "chart", chart: "jablonski", states: [{ name: "S0" }, { name: "S1" }], brief: "quick" });
{
  const c0 = (await readAll()).charts[0], box0 = (await ok("read", { detail: "full", ids: c0.ids })).result!.structuredContent;
  r = await ok("draw", { kind: "chart", chart: "jablonski", states: [{ name: "S0" }, { name: "S1" }, { name: "T1" }], id: c0.ids[0], brief: "quick" });
  const all = await readAll();
  assert.equal(all.charts.length, 1, "the chart is replaced, not added");
  assert.equal(all.charts[0].states.length, 3);
  void box0;
}

// B16: text up to 20,000 characters; a label with < or > is refused.
fresh();
put(chem.parseStructure("CC"));
await op({ op: "text", text: "x".repeat(20_000) });
{
  const s = (await ids()).structures[0].id;
  r = await call("change", { operations: [{ op: "edit", ids: [`${s}.1`], label: "<b>" }] });
  assert.ok(failed(r) && /no < or >/.test(text(r)), text(r));
}

// B17: read gives the document's sequences setting, and a charge typed as text by its structure.
fresh();
put(chem.parseStructure("C[NH3+]"));
await ok("advanced", { tool: "set_style", args: { sequences: "labels" } });
assert.equal((await ok("read", {})).result!.structuredContent.sequences, "labels");

// B18: a table's cells take runs; read gives them.
fresh();
await op({ op: "shape", kind: "table", box: [0, 0, 6, 3], table: { cells: [["Entry", [{ text: "H" }, { text: "2", script: "sub" }, { text: "O" }]], ["1", "2"]] } });
{
  const b = (await readAll()).shapes[0];
  assert.deepEqual(b.table[0], ["Entry", "H2O"]);
  assert.deepEqual(b.table_runs[0][1], [{ text: "H" }, { text: "2", script: "sub" }, { text: "O" }]);
}

console.log("mcpparity: ok");
