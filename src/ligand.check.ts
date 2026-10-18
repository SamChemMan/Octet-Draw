// Run: node src/ligand.check.ts. Fails loudly if ChemDraw's j and Shift+J π ligands, or the multi-centre points they
// are joined through, stop working: drawing, deleting, copying, CDXML and chemistry.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMPTY, addGroupAt, deleteAtoms, extractSelection, fragments, insertMol, moveAtoms, neighbours, placeCentres, pos, sprout } from "./edit.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { parse, serialize } from "./file.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { render, type Ink, type Mol } from "./render.ts";

const iron: Mol = { atoms: [{ label: "Fe", location: [0, 0, 0] }], bonds: [] };
const centres = (m: Mol) => m.atoms.flatMap((a, i) => (a.centre ? [i] : []));

// j on a lone metal: a Cp ring below it, joined through a multi-centre point; the hotspot stays on the metal.
let [m, hot] = addGroupAt(iron, 0, "cpLigand");
assert.equal(hot, 0);
assert.equal(centres(m).length, 1);
const p = centres(m)[0], ring = m.atoms[p].centre!.atoms;
assert.equal(ring.length, 5);
assert.ok(pos(m, p)[1] < 0, "below the metal");
assert.deepEqual(neighbours(m, p), [0], "the metal is bonded to the point");
const ringBonds = m.bonds.filter((b) => ring.includes(b.atoms[0]) && ring.includes(b.atoms[1]));
assert.equal(ringBonds.length, 5);
assert.ok(ringBonds.every((b) => b.type === 4), "delocalised ring bonds");
assert.equal(ringBonds.filter((b) => b.stereo === 1).length, 2, "the front atom between two wedges");
// The wedges are wide at the front atom, the lowest one.
const front = ring.reduce((a, b) => (pos(m, a)[1] < pos(m, b)[1] ? a : b));
assert.ok(ringBonds.filter((b) => b.stereo === 1).every((b) => b.atoms[1] === front));
// The point is the middle of its ring.
const mid = [0, 1].map((k) => ring.reduce((s, i) => s + pos(m, i)[k], 0) / 5);
assert.ok(Math.hypot(mid[0] - pos(m, p)[0], mid[1] - pos(m, p)[1]) < 1e-9);
// j again: a staggered Cp above (a bold front bond); a third time the metal has two bonds and nothing happens.
[m, hot] = addGroupAt(m, 0, "cpLigand");
assert.equal(centres(m).length, 2);
const upper = m.atoms[centres(m)[1]].centre!.atoms;
assert.ok(pos(m, centres(m)[1])[1] > 0, "above the metal");
assert.equal(m.bonds.filter((b) => upper.includes(b.atoms[0]) && upper.includes(b.atoms[1]) && b.display === "bold").length, 1);
assert.equal(addGroupAt(m, 0, "cpLigand")[0], m);
const ferrocene = m;
// Ferrocene is one structure.
assert.equal(fragments(ferrocene).length, 1);
console.log("ligand.check: Cp on a metal ok");

// Shift+J on a chain end: the end atom becomes the point of a phenyl ring; the hotspot moves to the other end.
const ethane = sprout(EMPTY, [0, 0]);
const [arene, next] = addGroupAt(ethane, 1, "phenylLigand");
assert.equal(next, 0);
assert.equal(arene.atoms[1].centre?.atoms.length, 6);
assert.equal(arene.bonds.filter((b) => b.display === "bold").length, 1);
assert.equal(arene.bonds.filter((b) => b.stereo === 1).length, 2);
// Not on an atom with two bonds.
const propane = sprout(ethane, 1);
assert.equal(addGroupAt(propane, 1, "phenylLigand")[0], propane);
console.log("ligand.check: phenyl on a chain end ok");

// Deleting the ring takes the point (and with it the bond to the metal); deleting one ring atom keeps it.
const lower = ferrocene.atoms[centres(ferrocene)[0]].centre!.atoms;
const gone = deleteAtoms(ferrocene, new Set(lower));
assert.equal(centres(gone).length, 1);
assert.equal(gone.atoms.length, ferrocene.atoms.length - 6);
const one = deleteAtoms(ferrocene, new Set([lower[0]]));
assert.equal(one.atoms[centres(one)[0]].centre!.atoms.length, 4);
// Moving a ring moves its point (as the editor keeps it).
const moved = placeCentres(moveAtoms(ferrocene, new Set(lower), [3, 0]));
assert.ok(Math.abs(pos(moved, centres(moved)[0])[0] - 3) < 1e-9);
// Copy and paste keep the point on the copied ring.
const copy = extractSelection(ferrocene, new Set(ferrocene.atoms.map((_, i) => i)), new Set());
const twice = insertMol(ferrocene, copy, [10, 0]).mol;
assert.equal(centres(twice).length, 4);
assert.ok(centres(twice).slice(2).every((i) => twice.atoms[i].centre!.atoms.every((j) => j >= ferrocene.atoms.length)));
console.log("ligand.check: delete, move and copy ok");

// CDXML: a MultiAttachment node with its Attachments, and the ring's 1.5 bonds with their styles, read back the same.
const xml = toCdxml(ferrocene, DEFAULT_STYLE);
assert.equal((xml.match(/NodeType="MultiAttachment"/g) ?? []).length, 2);
const back = fromCdxml(xml);
assert.equal(back.lost.MultiAttachment, undefined, JSON.stringify(back.lost));
assert.equal(centres(back.mol).length, 2);
assert.deepEqual(back.mol.atoms.map((a) => a.centre?.atoms.length ?? 0).filter(Boolean), [5, 5]);
const style = (x: Mol) => x.bonds.map((b) => `${b.type}${b.stereo ?? ""}${b.display ?? ""}`).sort().join(" ");
assert.equal(style(back.mol), style(ferrocene));
// ChemDraw does not draw a ligand's ellipse itself, so it is written as an oval; reading it back drops it again.
assert.equal((xml.match(/GraphicType="Oval"/g) ?? []).length, 2);
assert.equal(back.mol.shapes?.length ?? 0, 0);
const second = toCdxml(back.mol, back.style);
assert.equal(toCdxml(fromCdxml(second).mol, back.style), second, "saving again changes nothing");
// A closed curve inside a ligand's ring (ChemDraw's own Cp ligands have one) is the ellipse Octet draws.
const curve = xml.replace("</fragment>", `<curve id="9999" Closed="yes" CurvePoints="${(() => {
  const c = /<n\s+id="\d+"\s+p="([\d.]+) ([\d.]+)"[^>]*NodeType="MultiAttachment"/.exec(xml)!, [x, y] = [Number(c[1]), Number(c[2])];
  return [[-5, 0], [0, 2], [5, 0], [0, -2]].flatMap(([dx, dy]) => [x + dx, y + dy, x + dx, y + dy, x + dx, y + dy]).join(" ");
})()}"/></fragment>`);
assert.equal(fromCdxml(curve).mol.arrows?.filter((a) => a.kind === "curve").length ?? 0, 0);
console.log("ligand.check: CDXML ok");

// Octet's own JSON (the clipboard between Octet windows, templates and the copy inside .oct files) keeps the points
// and the ring's delocalised bonds, and refuses a point that stands for itself, a missing atom, one atom or a point.
const json = parse(serialize(ferrocene));
assert.deepEqual(json.atoms.map((a) => a.centre), ferrocene.atoms.map((a) => a.centre));
assert.equal(style(json), style(ferrocene));
const raw = JSON.parse(serialize(ferrocene)), point = centres(ferrocene)[0];
for (const bad of [[point, 2], [2, 999], [2], [2, centres(ferrocene)[1]], "2 3"]) {
  raw.structure.atoms[point].centre = bad;
  assert.throws(() => parse(JSON.stringify(raw)), /damaged/);
}
console.log("ligand.check: Octet JSON ok");

// Drawing: the point has no label, and each ring has an ellipse inside.
const ink = (): Ink => ({ width: 9.6, ascent: 9.5, outline: [[0, 0], [9.6, -9.5]] });
const S = { bond: 19.2, line: 0.8, bold: 2.67, spacing: 0.18 * 19.2, hash: 3.33, margin: 2.25, size: 13.3 };
const drawn = render(ferrocene, S, ink), plain = render({ ...ferrocene, atoms: ferrocene.atoms.map(({ centre: _, ...a }) => a) }, S, ink);
assert.equal(drawn.labels.filter((l) => l.text !== "Fe").length, 0, "no label on the points");
assert.ok(drawn.polygons.length > plain.polygons.length + 100, "two ellipses");
console.log("ligand.check: drawing ok");

// Chemistry: the points are not atoms; ferrocene is one compound, C10H10Fe, as ChemDraw gives it (chem.ts analyse).
const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { analyse, expandLabels, ready } = await import("./chem.ts");
await ready;
assert.equal(expandLabels(ferrocene).atoms.length, ferrocene.atoms.length - 2);
assert.equal(expandLabels(ferrocene).bonds.length, ferrocene.bonds.length - 2);
const formulas = analyse(ferrocene)?.map((a) => a.formula).sort();
assert.deepEqual(formulas, ["C10H10Fe"]);
console.log("ligand.check: chemistry ok");
