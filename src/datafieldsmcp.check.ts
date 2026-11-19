// Run: node src/datafieldsmcp.check.ts. Fails loudly if an AI app cannot set and read a structure's data fields
// (issue 68) with no window (scripts/headless): read lists each structure's fields, change's edit sets them (one undo
// step a call), every bad argument is refused with its reason and changes nothing, a structure replaced keeps its
// fields, Select Linked Objects runs, and SDF from read and from a file's text carries them.
import assert from "node:assert/strict";

const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const chem = await import("./chem.ts");
const E = await import("./edit.ts");
const D = await import("./datafields.ts");
type Mol = import("./render.ts").Mol;
await load();

type Reply = { result?: { content: { type: string; text?: string }[]; isError?: boolean; structuredContent?: any }; error?: { code: number; message: string } };
const d = drawing("paper", "Fields");
let n = 0;
const call = async (name: string, args: unknown): Promise<Reply> => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Check", "fields")));
const text = (r: Reply) => r.result?.content[0]?.text ?? r.error?.message ?? "";
const failed = (r: Reply) => !!(r.error || r.result?.isError);
const edit = (ids: string[], data: unknown) => call("change", { operations: [{ op: "edit", ids, data }] });
const rows = (m: Mol, k: number) => D.rowsOf(m, E.fragments(m)[k]).map((r) => [r.name, r.value, r.show]);

// Ethanol and acetic acid, apart: s1 and s2.
let m = E.insertMol(chem.parseStructure("CCO"), chem.parseStructure("CC(=O)O"), [6, 0]).mol;
d.host.set(m);
const [s1, s2] = (await call("read", {})).result!.structuredContent.structures.map((x: { id: string }) => x.id);

// J8: set fields on one structure; read lists them, shown ones marked; one undo step.
let r = await edit([s1], [{ name: "ID", value: "OCT-7" }, { name: "mp", value: "-114 °C", show: true }, { name: "ID", value: "second" }]);
assert.ok(!failed(r), text(r));
m = d.host.doc();
assert.deepEqual(rows(m, 0), [["ID", "second", false], ["mp", "-114 °C", true]], "a name sets the first field of that name");
let read = (await call("read", {})).result!.structuredContent.structures;
assert.deepEqual(read[0].data, [{ name: "ID", value: "second" }, { name: "mp", value: "-114 °C", shown: true }]);
assert.equal(read[0].caption, undefined, "a field's text is not the structure's caption");
assert.equal(read[1].data, undefined);
assert.ok(d.host.command("undo"));
assert.equal(d.host.doc().data, undefined, "one call, one undo step");
assert.ok(d.host.command("redo"));

// S23: every bad argument is refused with its reason, and nothing changes.
const before = d.host.doc();
for (const [ids, data, why] of [
  [["t999"], [{ name: "x", value: "y" }], /no|There is/i],
  [[s1], [{ name: "a<b", value: "y" }], /no < or >/],
  [[s1], [{ name: "", value: "y" }], /1 to 200 characters/],
  [[s1], [{ name: "x".repeat(201), value: "y" }], /200|long|too/i],
  [[s1], [{ name: "x", value: "v".repeat(10_001) }], /10,000|long|too/i],
  [[s1], [{ name: "x", value: "v".repeat(2_001), show: true }], /too long to show/],
  [[s1], [{ name: "absent", remove: true }], /no data field absent/],
  [[s1], "not a list", /list|array|data/i],
  [[`${s1}.1`], [{ name: "x", value: "y" }], /takes no data/],
] as [string[], unknown, RegExp][]) {
  r = await edit(ids, data);
  assert.match(text(r), why, `${JSON.stringify(data).slice(0, 60)}: ${text(r)}`);
  assert.equal(d.host.doc(), before, `${JSON.stringify(data).slice(0, 60)} changed the drawing`);
}
// The 1,001st field on a structure is refused.
r = await edit([s2], Array.from({ length: 100 }, (_, k) => ({ name: `f${k}`, value: "v" })));
assert.ok(!failed(r), text(r));
for (let k = 1; k < 10; k++) assert.ok(!failed(await edit([s2], Array.from({ length: 100 }, (_, j) => ({ name: `f${k}-${j}`, value: "v" })))));
assert.equal(D.fieldsOn(d.host.doc(), E.fragments(d.host.doc())[1]).length, 1000);
const full = d.host.doc();
assert.match(text(await edit([s2], [{ name: "one more", value: "v" }])), /at most 1,000/);
assert.equal(d.host.doc(), full);
// A summary lists 100 fields of a structure and says how many more; detail full lists them all.
read = (await call("read", {})).result!.structuredContent.structures;
assert.deepEqual([read[1].data.length, read[1].data_more], [100, 900]);
assert.equal((await call("read", { detail: "full" })).result!.structuredContent.structures[1].data.length, 1000);
// remove takes every field of that name off.
r = await edit([s2], Array.from({ length: 100 }, (_, k) => ({ name: `f${k}`, remove: true })));
assert.ok(!failed(r), text(r));

// S22: 100 calls in a row: each one step, and the last value wins.
const steps = d.host.doc();
for (let k = 0; k < 100; k++) await edit([s1], [{ name: "ID", value: `v${k}` }]);
assert.deepEqual(rows(d.host.doc(), 0)[0], ["ID", "v99", false]);
for (let k = 0; k < 100; k++) assert.ok(d.host.command("undo"));
assert.equal(d.host.doc(), steps);

// Select Linked Objects (run_command select_linked) on the field's text: the structure and the text.
const t = d.host.doc().data!.find((f) => f.caption !== undefined)!.caption!;
r = await call("advanced", { tool: "run_command", args: { command: "select_linked", ids: [`t${t}`] } });
assert.ok(!failed(r), text(r));
assert.deepEqual(d.host.selection(), { atoms: E.fragments(d.host.doc())[0], items: [t] });

// SDF from read carries the fields; an SD file's text added to the drawing brings its records' fields.
const sdf = (await call("read", { format: "sdf" })).result!.structuredContent.text as string;
assert.match(sdf, /M {2}END\n> <ID>\nsecond\n\n> <mp>\n-114 °C\n\n\$\$\$\$/);
d.host.set(E.EMPTY);
r = await call("advanced", { tool: "add_file", args: { text: sdf } });
assert.ok(!failed(r), text(r));
assert.deepEqual(rows(d.host.doc(), 0), [["ID", "second", false], ["mp", "-114 °C", false]]);

// S28: a structure replaced in place keeps its fields, a shown one with its text.
d.host.set(D.setRows(chem.parseStructure("CCO"), [0, 1, 2], [{ name: "ID", value: "A", show: false }, { name: "mp", value: "5", show: true }]));
const sid = (await call("read", {})).result!.structuredContent.structures[0].id;
r = await call("change", { operations: [{ op: "edit", ids: [sid], structure: "CCCO" }] });
assert.ok(!failed(r), text(r));
m = d.host.doc();
assert.equal(m.atoms.length, 4);
assert.deepEqual(rows(m, 0), [["ID", "A", false], ["mp", "5", true]]);
assert.deepEqual(m.captions!.find((c) => c.id === m.data![1].caption)!.under, E.fragments(m)[0].sort((p, q) => p - q));
console.log("datafieldsmcp.check: ok");
