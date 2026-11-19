// Run: node src/arrowlink-seq.check.ts. A curved arrow tied to an atom of a chain that is drawn again (helm.ts
// redrawn: Atoms and Residue labels switched, Expand and Contract of residues): the end stays tied when an atom of
// the same element is drawn where its atom was, and lets go where it was when not. Benzene beside it is not redrawn.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Mol } from "./render.ts";

const gl = globalThis as Record<string, unknown>;
gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
gl.window = globalThis;
gl.self = { location: { origin: "file://" } };
gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
await chem.ready;
const { parseHelm, withSequences } = await import("./helm.ts");
const { buildAtoms } = await import("./seqbuild.ts");
const { addArrow, insertMol, pos } = await import("./edit.ts");
const { followArrows, withTies } = await import("./arrowlink.ts");

const chain = (buildAtoms((parseHelm("PEPTIDE1{A.G.S}$$$$V2.0") as { seq: Parameters<typeof buildAtoms>[0] }).seq) as { mol: Mol }).mol;
let page = insertMol(chain, chem.parseStructure("c1ccccc1"), [30, 0]).mol;
const ring = chain.atoms.length, o = chain.atoms.findIndex((a) => a.label === "O");
let id: number;
[page, id] = addArrow(page, withTies({ kind: "curved", from: pos(page, o), to: pos(page, ring), bend: 0.3 }, { atom: o }, { atom: ring }));
const arrowOf = (m: Mol) => m.arrows!.find((a) => a.id === id)!;

// To residue labels: the oxygen is gone into a label, so that end lets go where it was; the benzene end stays tied.
const labels = followArrows(page, withSequences(page, "labels"));
assert.equal(labels.arrows!.length, 1, "the arrow stays");
assert.ok(!arrowOf(labels).fromOn, "its atom drawn into a label: the end lets go");
assert.deepEqual(arrowOf(labels).from, arrowOf(page).from, "and stays where it was");
const c = arrowOf(labels).toOn as { atom: number };
assert.equal(labels.atoms[c.atom].label, "C", "the benzene end is still tied to a carbon of benzene");
assert.ok(Math.hypot(...[0, 1].map((k) => arrowOf(labels).to[k] - pos(labels, c.atom)[k]) as [number, number]) < 1e-9, "and on it");
// And back to atoms: drawn in the same place, the benzene end holds.
const back = followArrows(labels, withSequences(labels, "atoms"));
assert.ok(arrowOf(back).toOn, "back to atoms: the benzene end still tied");
console.log("arrowlink-seq.check: all ok");
