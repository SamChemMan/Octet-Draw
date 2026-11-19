// Run: node src/annotatemcp.check.ts. Fails loudly if an AI app stops reaching notes (issues 101 and 102,
// docs/plans/issue-101-102-notes.md, N7) as the Notes panel does: read lists them, change's edit sets, changes and
// takes off a note (one undo step a call), on a group with group, advanced set_style's properties.note is the
// drawing's, run_command has notes and annotate; bad arguments, the limits and an object window are refused.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { analyseCompound, expandLabels, mapReaction, parseStructure, ready, toSmiles } = await import("./chem.ts");
const { problems } = await import("./check.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { findReaction } = await import("./reaction.ts");
const { handle } = await import("./mcp.ts");
const { MAX_ANNOTATIONS, NOTE, noteOf } = await import("./annotate.ts");
type Mol = import("./render.ts").Mol;
type Host = import("./mcp.ts").Host;
await ready;

// A drawing: ethanol (s), text 1, a reaction arrow 2 with a reagent table, a box 3, a cycle 4, and group 5 of the
// text and the box; group 6 of the arrow alone with text 7.
const start = (): Mol => ({
  atoms: [{ label: "C", location: [0, 0, 0] }, { label: "C", location: [0.87, 0.5, 0] }, { label: "O", location: [1.73, 0, 0] }], bonds: [{ atoms: [0, 1], type: 1 }, { atoms: [1, 2], type: 1 }],
  captions: [{ id: 1, text: "Entry 7", x: 0, y: -2 }, { id: 7, text: "Scheme 1", x: 10, y: 4 }],
  arrows: [{ id: 2, kind: "reaction", from: [3, 0], to: [6, 0] }],
  shapes: [{ id: 3, kind: "box", from: [8, 1], to: [10, -1] }],
  cycles: [{ id: 4, centre: [0, -8], radius: 2, clockwise: true, nodes: [[], [], []], at: [Math.PI / 2, -Math.PI / 6, (7 * Math.PI) / 6] }],
  groups: [{ id: 5, atoms: [], items: [1, 3] }, { id: 6, atoms: [], items: [2, 7] }],
  grids: [{ arrow: 2, typed: {} }],
});
let m = start(), steps = 0, open = 0, office = false;
const host: Host = {
  doc: () => m, style: () => DEFAULT_STYLE, ready: async () => {},
  structure: (t) => { try { const x = parseStructure(t); return x.atoms.length ? x : undefined; } catch { return undefined; } },
  tidy: (x) => x, named: () => false,
  begin: () => { steps++; open++; }, end: () => { open--; },
  set: (x) => { assert.equal(open, 1, "a change outside its undo step"); return (m = x); }, settle: async () => {},
  cleanReactions: (ids) => ids.size, tidyCycle: () => {}, command: () => false, newWindow: () => undefined,
  act: () => true, map: (r, p) => mapReaction(r, p),
  reaction: (id) => findReaction(m, id, m.arrows ?? [], () => undefined, () => undefined), ink: () => undefined, textBox: () => undefined, labelBox: () => undefined,
  problems: () => problems(m), smiles: (x) => toSmiles(expandLabels(x)), formula: (x) => analyseCompound(x)?.formula, name: () => undefined,
  picture: async () => "iVBOR", restyle: () => {}, experiment: () => false, sheet: () => ({ page: [200, 280], bond: 1, text: 10 }) as never,
  reagent: () => undefined, fileText: () => undefined, inchi: () => ({}), tables: () => [],
  said: () => {}, working: () => {}, selection: () => ({ atoms: [], items: [] }), select: () => {},
  file: (t) => host.structure(t), export: () => true, office: () => office, dialog: (id) => id === "annotate", windowless: () => false,
  asking: () => false, dismiss: () => {}, opens: async () => ({}),
  window: () => ({ id: "draw-1", name: "Untitled" }), windows: async () => [], target: async () => true, close: async () => "theirs",
};
let n = 0;
const call = async (name: string, args: unknown, session = "s-1") => {
  const out = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => host, "1.2.0", { client: "Test", session, keep: () => {} }));
  return out.result as { content: { text?: string }[]; isError?: true; structuredContent?: Record<string, unknown> };
};
const text = (r: { content: { text?: string }[] }) => r.content[0].text!;
const edit = (args: Record<string, unknown>, session?: string) => call("change", { operations: [{ op: "edit", ...args }] }, session);
const readNotes = async (args: Record<string, unknown> = {}) => (JSON.parse(text(await call("read", args))).notes ?? []) as { on: string; ids?: string[]; keyword?: string; text: string }[];

// read: no notes, no list.
assert.deepEqual(await readNotes(), []);

// edit: set, change and take off, each call one undo step; the result says what it did.
{
  let r = await edit({ ids: ["a2", "t1"], note: "Needs a reference" });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), /^Put the note on a2, t1\. One undo step\.\n/);
  assert.equal(noteOf(m, 2), "Needs a reference");
  assert.equal(noteOf(m, 1), "Needs a reference");
  const before = steps;
  r = await edit({ ids: ["a2"], note: "From the old batch" });
  assert.equal(noteOf(m, 2), "From the old batch");
  r = await edit({ ids: ["t1"], note: "" });
  assert.match(text(r), /^Took the note off t1\./);
  assert.equal(noteOf(m, 1), "");
  assert.equal(steps - before, 2, "two calls, two undo steps");
  // With other properties in the same call: both done, in one step.
  r = await edit({ ids: ["b3"], note: "Blue box", colour: "#213C99" });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), /^Put the note on b3\. Changed b3: colour\./);
  assert.equal(noteOf(m, 3), "Blue box");
  assert.equal(m.shapes![0].colour, "#213C99");
  // A cycle (c4) takes one too.
  assert.ok(!(await edit({ ids: ["c4"], note: "Pd(0)/Pd(II)" })).isError);
  assert.equal(noteOf(m, 4), "Pd(0)/Pd(II)");
}

// group: the smallest group that holds every id; ids in no group together are refused.
{
  let r = await edit({ ids: ["t1", "b3"], note: "The group's", group: true });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), /^Put the note on the group of t1, b3\./);
  assert.equal(noteOf(m, 5), "The group's");
  assert.equal(noteOf(m, 3), "Blue box", "the members keep their own");
  r = await edit({ ids: ["t1", "a2"], note: "x", group: true });
  assert.ok(r.isError);
  assert.match(text(r), /are in no group together/);
  r = await edit({ ids: ["t1"], group: true });
  assert.ok(r.isError);
  assert.match(text(r), /group goes with note/);
}

// What takes no note: a reagent table (its arrow does), a structure, an atom; an unknown id is refused.
{
  let r = await edit({ ids: ["g2"], note: "x" });
  assert.ok(r.isError);
  assert.match(text(r), /g2 \(a reagent table\) takes no note: its arrow a2 does/);
  const s = (JSON.parse(text(await call("read", {}))).structures as { id: string }[])[0].id;
  r = await edit({ ids: [s, "a2"], note: "Mixed bag" });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), new RegExp(`Not changed: ${s} takes no note`));
  assert.equal(noteOf(m, 2), "Mixed bag");
  r = await edit({ ids: ["t99"], note: "x" });
  assert.ok(r.isError);
  assert.match(text(r), /There is nothing with the id t99/);
}

// Hostile arguments: over 10,000 characters refused; a number is no text; control characters cleaned.
{
  const was = m;
  let r = await edit({ ids: ["a2"], note: "x".repeat(10_001) });
  assert.ok(r.isError);
  assert.match(text(r), /note: longer than 10000 characters/);
  assert.equal(m, was, "nothing changed");
  r = await edit({ ids: ["a2"], note: "x".repeat(10_000) });
  assert.ok(!r.isError);
  assert.equal(noteOf(m, 2).length, 10_000);
  r = await edit({ ids: ["a2"], note: 42 });
  assert.equal(noteOf(m, 2), r.isError ? "x".repeat(10_000) : "42", "a number is refused, or read as its text");
  r = await edit({ ids: ["a2"], note: "one\r\ntwo\tthree\u0000\u0007\ud800" });
  assert.equal(noteOf(m, 2), "one\ntwo three");
}

// read: the drawing's, each object's and each group's (with what is in it), cut to 200 characters unless the read is
// full or names it; keyword only when it is not Note.
{
  await call("advanced", { tool: "set_style", args: { properties: { note: "For JACS", title: "Route 2" } } });
  assert.equal(noteOf(m, "drawing"), "For JACS");
  await edit({ ids: ["a2"], note: "y".repeat(500) });
  m = { ...m, captions: m.captions!.map((c) => (c.id === 7 ? { ...c, notes: [{ keyword: "Name", content: "From ChemDraw" }] } : c)) };
  let notes = await readNotes();
  assert.deepEqual(notes.find((x) => x.on === "drawing"), { on: "drawing", text: "For JACS" });
  assert.equal(notes.find((x) => x.on === "a2")!.text, `${"y".repeat(200)}…`);
  assert.deepEqual(notes.find((x) => x.on === "group"), { on: "group", ids: ["t1", "b3"], text: "The group's" });
  assert.deepEqual(notes.find((x) => x.on === "t7"), { on: "t7", keyword: "Name", text: "From ChemDraw" });
  assert.ok(!notes.some((x) => x.text === "Route 2"), "the title is no note");
  notes = await readNotes({ detail: "full" });
  assert.equal(notes.find((x) => x.on === "a2")!.text, "y".repeat(500));
  notes = await readNotes({ ids: ["a2"] });
  assert.deepEqual(notes, [{ on: "a2", text: "y".repeat(500) }], "a read that names a2 gives its note whole, and no other");
  // set_style's note '' takes it off; the title stays.
  await call("advanced", { tool: "set_style", args: { properties: { note: "" } } });
  assert.equal(noteOf(m, "drawing"), "");
  assert.ok(m.annotations?.some((a) => a.keyword === "Title"));
}

// Two AI apps in turn on one object: the last stays, each call one undo step, and read gives it.
{
  const before = steps;
  await edit({ ids: ["b3"], note: "first app" }, "s-1");
  await edit({ ids: ["b3"], note: "second app" }, "s-2");
  assert.equal(steps - before, 2);
  // (A read naming b3 also gives the note of the group b3 is in.)
  const read = await readNotes({ ids: ["b3"] });
  assert.equal(read.find((x) => x.on === "b3")!.text, "second app");
  assert.deepEqual(read.find((x) => x.on === "group")?.ids, ["t1", "b3"]);
}

// The limits: 1000 on one object, 10,000 in a drawing; refused with the reason, nothing changed.
{
  m = { ...m, shapes: m.shapes!.map((x) => ({ ...x, notes: [{ keyword: NOTE, content: "second app" }, ...Array.from({ length: MAX_ANNOTATIONS - 1 }, (_, k) => ({ keyword: `K${k}`, content: "n" }))] })) };
  const r = await edit({ ids: ["b3"], note: "one more" });
  assert.ok(!r.isError, "changing its Note is no new note");
  assert.equal(noteOf(m, 3), "one more");
  m = { ...m, shapes: m.shapes!.map((x) => ({ ...x, notes: Array.from({ length: MAX_ANNOTATIONS }, (_, k) => ({ keyword: `K${k}`, content: "n" })) })) };
  const full = m, refused = await edit({ ids: ["b3"], note: "one more" });
  assert.ok(refused.isError);
  assert.match(text(refused), /This object has 1000 annotations, the most Octet keeps\. Octet changed nothing\./);
  assert.equal(m, full);
  // 10,000 in the drawing: ten objects of 1000 each, and a new note anywhere is refused.
  const many = Array.from({ length: 10 }, (_, k) => ({ id: 100 + k, kind: "box" as const, from: [k, 20] as [number, number], to: [k + 1, 21] as [number, number], notes: Array.from({ length: MAX_ANNOTATIONS }, () => ({ keyword: NOTE, content: "n" })) }));
  m = { ...m, shapes: many, arrows: m.arrows!.map((x) => { const { notes: _, ...rest } = x; return rest; }), captions: m.captions!.map((c) => { const { notes: _, ...rest } = c; return rest; }), cycles: m.cycles!.map((c) => { const { notes: _, ...rest } = c; return rest; }), groups: m.groups!.map((x) => ({ id: x.id, atoms: x.atoms, items: x.items })), annotations: undefined };
  const capped = await edit({ ids: ["a2"], note: "the 10,001st" });
  assert.ok(capped.isError);
  assert.match(text(capped), /This drawing has 10,000 notes, the most Octet keeps\./);
}

// run_command: notes and annotate are commands; annotate opens a box for the user to type in.
{
  let r = await call("advanced", { tool: "run_command", args: { command: "annotate" } });
  assert.ok(!r.isError, text(r));
  assert.match(text(r), /Ran annotate\. Octet shows its dialog, or a box to type in: the user finishes it\./);
  r = await call("advanced", { tool: "run_command", args: { command: "notes" } });
  assert.ok(!r.isError, text(r));
}

// An object window keeps no notes: edit and set_style refuse, and change nothing.
{
  office = true;
  const was = m;
  let r = await edit({ ids: ["a2"], note: "x" });
  assert.ok(r.isError);
  assert.match(text(r), /keeps no notes\. Octet changed nothing\./);
  r = await call("advanced", { tool: "set_style", args: { properties: { note: "x" } } });
  assert.ok(r.isError);
  assert.equal(m, was);
  office = false;
}

console.log("annotatemcp: all checks pass");
