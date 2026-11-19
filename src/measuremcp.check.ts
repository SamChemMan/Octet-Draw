// Run: node src/measuremcp.check.ts. AI apps and measurements (issue 85): change's text with measure, advanced
// run_command measure, a full read's measure, and edit, move and delete on a measurement's t id, against an editor
// stand-in as mcp.check.ts has one. Bad arguments are refused with a message and change nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { expandLabels, parseStructure, ready, toSmiles, analyseCompound, mapReaction } = await import("./chem.ts");
const { problems } = await import("./check.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { EMPTY } = await import("./edit.ts");
const { handle } = await import("./mcp.ts");
const { findReaction } = await import("./reaction.ts");
const { measureValue, settleMeasures } = await import("./measurement.ts");
type Mol = import("./render.ts").Mol;
type Host = import("./mcp.ts").Host;
type Box = import("./render.ts").Box;
await ready;

let m: Mol = EMPTY, open = 0, picked = { atoms: [] as number[], items: [] as number[] };
const ink = (atoms: number[]): Box | undefined => {
  const ps = atoms.map((i) => m.atoms[i]?.location).filter(Boolean);
  return ps.length ? [Math.min(...ps.map((p) => p[0])) - 0.3, Math.min(...ps.map((p) => p[1])) - 0.3, Math.max(...ps.map((p) => p[0])) + 0.3, Math.max(...ps.map((p) => p[1])) + 0.3] : undefined;
};
const captionBox = (id: number): Box | undefined => { const c = m.captions?.find((x) => x.id === id); return c && !c.on ? [c.x - c.text.length * 0.2, c.y - 0.3, c.x + c.text.length * 0.2, c.y + 0.4] : undefined; };
// set settles measurements as the editor's set does.
const host: Host = {
  doc: () => m, style: () => m.style ?? DEFAULT_STYLE, ready: async () => {},
  structure: (t) => { try { const x = parseStructure(t); return x.atoms.length ? x : undefined; } catch { return undefined; } },
  tidy: (x) => x, named: () => false,
  begin: () => { open++; }, end: () => { open--; },
  set: (x) => { assert.equal(open, 1, "a change outside its undo step"); return (m = settleMeasures(m, x)); }, settle: async () => {},
  cleanReactions: (ids) => ids.size, tidyCycle: () => {}, command: () => false, newWindow: () => undefined,
  act: () => true, map: (r, p) => mapReaction(r, p),
  reaction: (id) => findReaction(m, id, m.arrows ?? [], ink, captionBox), ink, textBox: captionBox, labelBox: () => undefined,
  reagent: () => undefined, fileText: (f: string) => (f === "smiles" ? toSmiles(expandLabels(m)) : undefined), inchi: () => ({}), tables: () => [], sheet: () => undefined,
  problems: () => problems(m), smiles: (x) => toSmiles(expandLabels(x)), formula: (x) => analyseCompound(x)?.formula, name: () => undefined,
  picture: async () => "iVBOR", restyle: (s) => { m = { ...m, style: s }; }, experiment: () => false,
  said: () => {}, working: () => {}, selection: () => picked, select: (atoms, items) => { picked = { atoms, items }; },
  file: (t) => host.structure(t), export: () => true, office: () => false, dialog: () => false, windowless: () => false,
  asking: () => false, dismiss: () => {},
  opens: async () => ({}), window: () => ({ id: "draw-1", name: "Untitled" }), windows: async () => [], target: async () => true, close: async () => "theirs",
} as unknown as Host;
let n = 0;
const send = async (method: string, params?: unknown, session = "s-1") => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }), () => host, "1.2.0", { client: "Test", session, keep: () => {} }));
const call = async (name: string, args: unknown, session?: string) => (await send("tools/call", { name, arguments: args }, session)).result as { content: { text?: string }[]; isError?: boolean };
const text = (r: { content: { text?: string }[] }) => r.content[0].text!;
const read = async () => JSON.parse(text(await call("read", { detail: "full" })));
const measures = () => (m.captions ?? []).filter((c) => c.measure);

// Butane, drawn flat.
const drew = await call("draw", { lines: "CCCC" });
assert.ok(!drew.isError, text(drew));
assert.equal(m.atoms.length, 4);
const s = (await read()).structures[0].id as string;

// text with measure: a dihedral of four atoms in order, measured as drawn: the flat structure is not cleaned up (the
// drawing never changes when it is measured, 19 November 2026).
const flatAtoms = JSON.stringify(m.atoms);
let r = await call("change", { operations: [{ op: "text", measure: [`${s}.1`, `${s}.2`, `${s}.3`, `${s}.4`], colour: "#B42323", bold: true }] });
assert.ok(!r.isError, text(r));
assert.match(text(r), /Added the dihedral t\d+: −?\d+\.\d°\./);
assert.doesNotMatch(text(r), /cleaned up/);
assert.equal(JSON.stringify(m.atoms), flatAtoms, "the atoms as they were");
assert.equal(measures().length, 1);
const t = `t${measures()[0].id}`;
assert.equal(measures()[0].colour, "#B42323");
assert.equal(measures()[0].bold, true);

// S31: a read gives each measurement's kind, atoms, value and unit; the value is the one its text shows.
let got = await read();
let entry = got.captions.find((c: { id: string }) => c.id === t);
assert.equal(entry.measure.kind, "dihedral");
assert.deepEqual(entry.measure.atoms, [`${s}.1`, `${s}.2`, `${s}.3`, `${s}.4`]);
assert.equal(entry.measure.unit, "°");
assert.equal(`${entry.measure.value < 0 ? "−" : ""}${Math.abs(entry.measure.value).toFixed(1)}°`, entry.text);
assert.equal(entry.of, s);
// The summary marks it as a measurement among the text.
const summary = JSON.parse(text(await call("read", {})));
assert.ok(JSON.stringify(summary).includes('"measure":"dihedral"'), "the summary says it is a dihedral");

// run_command measure, with ids in order: a distance and an angle. The same one again is the one there (S35).
r = await call("advanced", { tool: "run_command", args: { command: "measure", ids: [`${s}.1`, `${s}.4`] } });
assert.match(text(r), /Added the distance t\d+: \d\.\d\d Å\./);
assert.doesNotMatch(text(r), /cleaned up/, "no clean-up");
r = await call("advanced", { tool: "run_command", args: { command: "measure_angle", ids: [`${s}.1`, `${s}.3`, `${s}.2`] } });
assert.match(text(r), /Added the angle t\d+: 1\d\d\.\d°\./);
assert.equal(measures().find((c) => c.measure!.ends.length === 3)!.measure!.ends[1], 1, "along the bonds: the middle atom is s.2");
r = await call("advanced", { tool: "run_command", args: { command: "measure", ids: [`${s}.4`, `${s}.1`] } });
assert.match(text(r), /already/);
assert.equal(measures().length, 3);
got = await read();
for (const c of got.captions.filter((x: { measure?: unknown }) => x.measure)) {
  const unit = c.measure.unit, v = c.measure.value;
  assert.equal(unit === "Å" ? `${v.toFixed(2)} Å` : `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}°`, c.text, "each value equals its label");
}

// S29: bad arguments say what to give and change nothing.
const before = m;
for (const [args, says] of [
  [{ op: "text", measure: [`${s}.1`] }, /2 to 4|at least 2|minItems|fewer than 2/i],
  [{ op: "text", measure: [`${s}.1`, `${s}.2`, `${s}.3`, `${s}.4`, `${s}.1`] }, /2 to 4|at most 4|maxItems|more than 4/i],
  [{ op: "text", measure: [s, `${s}.2`] }, /is not an atom/],
  [{ op: "text", measure: ["s99.1", `${s}.2`] }, /is not an atom/],
  [{ op: "text", measure: [`${s}.2`, `${s}.2`] }, /each atom once/],
  [{ op: "text", measure: [t, `${s}.2`] }, /is not an atom/],
  [{ op: "text", measure: [`${s}.1`, `${s}.2`], text: "x" }, /without text/],
] as [unknown, RegExp][]) {
  const out = await call("change", { operations: [args] });
  assert.ok(out.isError, JSON.stringify(args));
  assert.match(text(out), says, `${JSON.stringify(args)}: ${text(out)}`);
  assert.equal(m, before, "nothing changes");
}
for (const [args, says] of [
  [{ command: "measure" }, /takes the atoms' ids/],
  [{ command: "measure_distance", ids: [`${s}.1`, `${s}.2`, `${s}.3`] }, /takes 2 atom ids/],
  [{ command: "measure_dihedral", ids: [`${s}.1`, s] }, /takes 4 atom ids/],
] as [unknown, RegExp][]) {
  const out = await call("advanced", { tool: "run_command", args });
  assert.ok(out.isError, JSON.stringify(args));
  assert.match(text(out), says);
  assert.equal(m, before);
}

// edit, move and delete on a measurement's t id, as on any text.
r = await call("change", { operations: [{ op: "edit", ids: [t], colour: "#1F6FEB", size: 12 }] });
assert.ok(!r.isError, text(r));
assert.equal(measures().find((c) => `t${c.id}` === t)!.colour, "#1F6FEB");
assert.equal(measures().find((c) => `t${c.id}` === t)!.size, 12);
const at0 = measures().find((c) => `t${c.id}` === t)!;
r = await call("change", { operations: [{ op: "move", ids: [t], dx: 1, dy: 0.5 }] });
assert.ok(!r.isError, text(r));
const at1 = measures().find((c) => `t${c.id}` === t)!;
assert.ok(Math.abs(at1.x - at0.x - 1) < 1e-6 && Math.abs(at1.y - at0.y - 0.5) < 1e-6, "moved alone");
assert.ok(at1.measure!.at, "and keeps its place by its atoms");
// Moving the whole structure takes its measurements with it, their values the same.
const v0 = measureValue(m, at1.measure!.ends);
r = await call("change", { operations: [{ op: "move", ids: [s], dx: 3, dy: 0 }] });
const at2 = measures().find((c) => `t${c.id}` === t)!;
assert.ok(Math.abs(at2.x - at1.x - 3) < 1e-6 && Math.abs(at2.y - at1.y) < 1e-6, "follows its structure");
assert.ok(Math.abs(measureValue(m, at2.measure!.ends)! - v0!) < 1e-9);
// S32: new text over a measurement makes it plain text.
const t2 = `t${measures().find((c) => c.measure!.ends.length === 2)!.id}`;
r = await call("change", { operations: [{ op: "edit", ids: [t2], text: "about 3 Å" }] });
assert.ok(!r.isError, text(r));
assert.equal(m.captions!.find((c) => `t${c.id}` === t2)!.measure, undefined, "plain text now");
assert.equal(m.captions!.find((c) => `t${c.id}` === t2)!.text, "about 3 Å");
r = await call("change", { operations: [{ op: "delete", ids: [t, t2] }] });
assert.ok(!r.isError, text(r));
assert.equal(measures().length, 1);

// S30: two AI sessions. A measures; B deletes a measured atom (the measurement goes in the same step); A's edit of the
// old t id is told it is not there.
r = await call("change", { operations: [{ op: "text", measure: [`${s}.1`, `${s}.2`, `${s}.3`, `${s}.4`] }] }, "s-A");
const tA = `t${measures().find((c) => c.measure!.ends.length === 4)!.id}`;
r = await call("change", { operations: [{ op: "delete", ids: [`${s}.4`] }] }, "s-B");
assert.ok(!r.isError, text(r));
assert.ok(!measures().some((c) => `t${c.id}` === tA), "a measurement goes with its atom");
assert.ok(!measures().some((c) => c.measure!.ends.some((i) => i >= m.atoms.length)), "no measurement names an atom that is gone");
r = await call("change", { operations: [{ op: "edit", ids: [tA], colour: "#000000" }] }, "s-A");
assert.ok(r.isError && /nothing with the id|no text|not/i.test(text(r)), text(r));

// Notes (issues 101 and 102): edit's note on a measurement's t id, as on any text. read lists it on that id; new text
// over it makes plain text and keeps the note.
r = await call("change", { operations: [{ op: "text", measure: [`${s}.1`, `${s}.3`] }] });
assert.ok(!r.isError, text(r));
const tN = `t${measures().find((c) => c.measure!.ends.length === 2)!.id}`;
r = await call("change", { operations: [{ op: "edit", ids: [tN], note: "From the X-ray structure" }] });
assert.ok(!r.isError, text(r));
assert.match(text(r), new RegExp(`^Put the note on ${tN}\\.`));
assert.ok(measures().some((c) => `t${c.id}` === tN), "still a measurement");
assert.deepEqual((await read()).notes, [{ on: tN, text: "From the X-ray structure" }]);
r = await call("change", { operations: [{ op: "edit", ids: [tN], text: "about 2.5 Å" }] });
const plainN = m.captions!.find((c) => `t${c.id}` === tN)!;
assert.equal(plainN.measure, undefined, "plain text now");
assert.equal(plainN.notes?.[0].content, "From the X-ray structure", "with its note");

// Free ends (19 November 2026): a read of a drawing with measurements the Measure tool made to empty points works, its
// atom ends as ids and the value its text shows. (Taking free points as arguments is for the 1.2 MCP session.)
{
  const { addMeasure } = await import("./edit.ts");
  const a0 = m.atoms[0].location;
  for (const ends of [[0, [a0[0], a0[1] - 3]], [[5, 5], [8, 5]]] as Parameters<typeof addMeasure>[1][]) { const made = addMeasure(m, ends, "pick"); assert.ok(typeof made !== "string", String(made)); m = made.mol; }
  const free = await read(), [mixed, loose] = measures().slice(-2).map((c) => free.captions.find((x: { id: string }) => x.id === `t${c.id}`));
  assert.deepEqual([mixed.measure.kind, mixed.measure.atoms, mixed.measure.unit], ["distance", [`${s}.1`], "Å"], JSON.stringify(mixed));
  assert.deepEqual([loose.measure.kind, loose.measure.atoms, loose.measure.value], ["distance", [], 4.56], JSON.stringify(loose));
  assert.equal(`${loose.measure.value.toFixed(2)}\u00a0Å`, loose.text);
}
console.log("measuremcp.check: text measure, run_command measure, read, edit, move, delete, notes and bad arguments ok");
