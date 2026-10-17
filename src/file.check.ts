// Run: node src/file.check.ts. Fails loudly if the file format breaks or accepts a bad file.
import assert from "node:assert/strict";
import { addArrow, addCaption, addRing, addShape, EMPTY, setBondSpec, setElement } from "./edit.ts";
import { parse, serialize } from "./file.ts";

// A drawing survives a save and reopen.
const mol = setBondSpec(setElement(addRing(EMPTY, 6, true, { point: [0, 0] }), 0, "N"), 1, { type: 1, display: "wavy" });
const back = parse(serialize(mol));
assert.deepEqual(back.bonds, mol.bonds);
assert.deepEqual(back.atoms.map((a) => a.label), mol.atoms.map((a) => a.label));
for (let i = 0; i < mol.atoms.length; i++) assert.ok(Math.abs(back.atoms[i].location[0] - mol.atoms[i].location[0]) < 1e-4);
console.log("file.check: round trip ok");

// Bad files are refused with a message, never half-loaded.
const bad = [
  "not json",
  JSON.stringify({ format: "other" }),
  JSON.stringify({ format: "octet", version: 99, structure: { atoms: [], bonds: [] } }),
  JSON.stringify({ format: "octet", version: 1, structure: { atoms: [{ label: "C", x: 0, y: 0 }], bonds: [{ atoms: [0, 5], type: 1 }] } }),
  JSON.stringify({ format: "octet", version: 1, structure: { atoms: [{ label: "<script>", x: 0, y: 0 }], bonds: [] } }),
  JSON.stringify({ format: "octet", version: 1, structure: { atoms: [{ label: "C", x: 1e400, y: 0 }], bonds: [] } }),
  JSON.stringify({ format: "octet", version: 1, structure: { atoms: [{ label: "C", x: 0, y: 0 }, { label: "C", x: 1, y: 0 }], bonds: [{ atoms: [0, 1], type: 9 }] } }),
];
for (const text of bad) assert.throws(() => parse(text), /Octet|damaged/);
console.log("file.check: bad files refused");

// Captions survive a save and reopen, and bad ones are refused.
{
  const [withCaption] = addCaption(mol, { text: "1", x: 0, y: -2, bold: true, under: [0, 1, 2] });
  const [both] = addCaption(withCaption, { text: "N-oxide\nstep 2", x: 3, y: 1, align: "left", size: 12 });
  const again = parse(serialize(both));
  assert.deepEqual(again.captions, both.captions);
  const base = { format: "octet", version: 1, structure: { atoms: [{ label: "C", x: 0, y: 0 }], bonds: [] } };
  for (const captions of [[{ text: 5, x: 0, y: 0 }], [{ text: "a", x: 0, y: 0, under: [3] }], [{ text: "a", x: 0, y: 0, size: 900 }], [{ text: "a\u0000", x: 0, y: 0 }], "x"])
    assert.throws(() => parse(JSON.stringify({ ...base, captions })), /damaged/);
  console.log("file.check: captions ok");
}

// Arrows and their conditions survive a save and reopen.
{
  const [withArrow, arrow] = addArrow(mol, { kind: "reaction", from: [3, 0], to: [6, 0] });
  const [curvedToo] = addArrow(withArrow, { kind: "fishhook", from: [0, 0], to: [1, 1], bend: 0.3 });
  const [conditions] = addCaption(curvedToo, { text: "hν, 4CzIPN", x: 0, y: 0, on: { arrow, side: "above" } });
  const again = parse(serialize(conditions));
  assert.deepEqual(again.arrows?.map((a) => [a.kind, a.from, a.to, a.bend]), conditions.arrows?.map((a) => [a.kind, a.from, a.to, a.bend]));
  const cond = again.captions?.find((c) => c.on);
  assert.equal(again.arrows?.find((a) => a.id === cond?.on?.arrow)?.kind, "reaction", "conditions stay on their arrow");
  const base = { format: "octet", version: 1, structure: { atoms: [], bonds: [] } };
  for (const bad of [{ arrows: [{ kind: "teleport", x1: 0, y1: 0, x2: 1, y2: 0 }] }, { arrows: [{ kind: "reaction", x1: 0, y1: 0, x2: "a", y2: 0 }] }, { arrows: [], captions: [{ text: "a", x: 0, y: 0, on: { arrow: 0, side: "above" } }] }])
    assert.throws(() => parse(JSON.stringify({ ...base, ...bad })), /damaged/);
  console.log("file.check: arrows ok");
}

// Radicals, lone pairs, circled and partial charges survive a save and reopen; bad values are refused.
{
  const marked = { ...mol, atoms: mol.atoms.map((a, i) => (i === 0 ? { ...a, charge: 1, circled: true, pairs: 1 } : i === 1 ? { ...a, radical: 1, partial: "-" as const } : a)) };
  const again = parse(serialize(marked));
  const { hmark, attach, bead } = parse(serialize({ ...mol, atoms: mol.atoms.map((a, i) => (i === 2 ? { ...a, hmark: "dot" as const, attach: true, bead: true } : a)) })).atoms[2];
  assert.deepEqual({ hmark, attach, bead }, { hmark: "dot", attach: true, bead: true });
  assert.deepEqual(again.atoms.slice(0, 2).map(({ charge, circled, pairs, radical, partial }) => ({ charge, circled, pairs, radical, partial })),
    [{ charge: 1, circled: true, pairs: 1, radical: undefined, partial: undefined }, { charge: undefined, circled: undefined, pairs: undefined, radical: 1, partial: "-" }]);
  assert.equal(parse(serialize({ ...mol, atoms: mol.atoms.map((a, i) => (i === 1 ? { ...a, enhanced: "or1" } : a)) })).atoms[1].enhanced, "or1");
  // Colours on atoms, bonds and arrows survive a save; a bad colour is refused.
  const coloured = parse(serialize({ ...mol, atoms: mol.atoms.map((a, i) => (i === 0 ? { ...a, colour: "#B42323" } : a)), bonds: mol.bonds.map((b, i) => (i === 0 ? { ...b, colour: "#1D49A7" } : b)),
    arrows: [{ id: 50, kind: "orbital" as const, from: [0, 0] as [number, number], to: [0, 1] as [number, number], orbital: { shape: "p" as const, phase: "filled" as const }, colour: "#22775B" }] }));
  assert.deepEqual([coloured.atoms[0].colour, coloured.bonds[0].colour, coloured.arrows?.[0].colour], ["#B42323", "#1D49A7", "#22775B"]);
  // Isotopes and singlet radicals (Atom Properties) save and load.
  const iso = parse(serialize({ ...mol, atoms: mol.atoms.map((a, i) => (i === 0 ? { ...a, isotope: 13, radical: 3 } : a)) })).atoms[0];
  assert.deepEqual([iso.isotope, iso.radical], [13, 3]);
  for (const bad of [{ radical: 4 }, { isotope: 0 }, { isotope: 2.5 }, { pairs: 9 }, { circled: "yes" }, { partial: "x" }, { enhanced: "rac" }, { colour: "red" }])
    assert.throws(() => parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [{ label: "C", x: 0, y: 0, ...bad }], bonds: [] } })), /damaged/);
  console.log("file.check: atom marks ok");
}

// Shapes keep their kind, corners, dashes, colour and order.
{
  const [one] = addShape(mol, { kind: "highlight", from: [0, 0], to: [2, 1] });
  const [two] = addShape(one, { kind: "brackets", from: [-1, -1], to: [3, 2], dashed: true, colour: "#1D49A7" });
  const again = parse(serialize(two));
  assert.deepEqual(again.shapes?.map(({ id: _, ...x }) => x), two.shapes?.map(({ id: _, ...x }) => x));
  assert.throws(() => parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, shapes: [{ kind: "star", x1: 0, y1: 0, x2: 1, y2: 1 }] })), /damaged/);
  console.log("file.check: shapes ok");
}

// Lines, arcs, dashed arrows and orbitals survive a save and reopen.
{
  let m = mol;
  for (const a of [
    { kind: "line" as const, from: [0, 0] as [number, number], to: [2, 0] as [number, number], style: "wavy" as const },
    { kind: "arc" as const, from: [0, 0] as [number, number], to: [2, 0] as [number, number], bend: 0.5, style: "dashed" as const },
    { kind: "reaction" as const, from: [0, 1] as [number, number], to: [3, 1] as [number, number], style: "dashed" as const },
    { kind: "orbital" as const, from: [0, 0] as [number, number], to: [0, 1] as [number, number], orbital: { shape: "p" as const, phase: "phased" as const } },
  ]) m = addArrow(m, a)[0];
  const again = parse(serialize(m));
  assert.deepEqual(again.arrows?.map(({ id: _, ...a }) => a), m.arrows?.map(({ id: _, ...a }) => a));
  console.log("file.check: lines and orbitals ok");
}

// Shape styles, single brackets with a mark, and a TLC plate's spots survive a save and reopen.
{
  let m = mol;
  for (const sh of [
    { kind: "oval" as const, from: [0, 0] as [number, number], to: [1, 1] as [number, number], fill: "shaded" as const },
    { kind: "box" as const, from: [0, 0] as [number, number], to: [2, 1] as [number, number], shadow: true },
    { kind: "brackets" as const, from: [0, 0] as [number, number], to: [2, 2] as [number, number], side: "left" as const, mark: "‡" },
    { kind: "tlc" as const, from: [0, 0] as [number, number], to: [3, 4] as [number, number], tlc: { lanes: 3, spots: [{ lane: 0, rf: 0.42 }, { lane: 2, rf: 0.7 }], rf: true } },
    { kind: "table" as const, from: [0, 3] as [number, number], to: [6, 0] as [number, number], table: { cells: [["Entry", "Solvent", "Yield (%)"], ["1", "THF", "72"]], grid: true } },
    { kind: "table" as const, from: [0, 3] as [number, number], to: [6, 0] as [number, number], dashed: true,
      table: { cells: [["a", "b"], ["c", "d"]], widths: [2, 3.5], heights: [1, 1.2], lines: ["top" as const, "rows" as const, "cols" as const], align: ["left" as const, "right" as const], weight: 0.8 } },
  ]) m = addShape(m, sh)[0];
  const again = parse(serialize(m));
  assert.deepEqual(again.shapes?.map(({ id: _, ...x }) => x), m.shapes?.map(({ id: _, ...x }) => x));
  assert.throws(() => parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, shapes: [{ kind: "tlc", x1: 0, y1: 0, x2: 1, y2: 1, tlc: { lanes: 2, spots: [{ lane: 5, rf: 0.5 }] } }] })), /damaged/);
  assert.throws(() => parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, shapes: [{ kind: "table", x1: 0, y1: 0, x2: 1, y2: 1, table: { cells: [[1]] } }] })), /damaged/);
  for (const bad of [{ widths: [0] }, { heights: [1e9] }, { lines: ["diagonal"] }, { align: ["middle"] }, { weight: -1 }])
    assert.throws(() => parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, shapes: [{ kind: "table", x1: 0, y1: 0, x2: 1, y2: 1, table: { cells: [["a"]], ...bad } }] })), /damaged/, JSON.stringify(bad));
  assert.throws(() => parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, shapes: [{ kind: "curve", x1: 0, y1: 0, x2: 1, y2: 1, curve: { points: [{ at: [0, 0] }, { at: [1, "x"] }] } }] })), /damaged/);
  // Pen curves are lines with points, heads and a fill; a curve saved as a shape (before they were lines) opens as a line.
  const pen = { id: 90, kind: "curve" as const, from: [0, 0] as [number, number], to: [4, 0] as [number, number], start: "left" as const, end: "full" as const, head: "hollow" as const, style: "doubled" as const, fill: "faded" as const,
    curve: { points: [{ at: [0, 0] as [number, number] }, { at: [2, 2] as [number, number], c1: [1, 2] as [number, number], c2: [3, 2] as [number, number] }, { at: [4, 0] as [number, number] }], closed: true } };
  const back = parse(serialize({ ...mol, arrows: [pen] })).arrows![0];
  assert.deepEqual({ ...back, id: 90 }, pen);
  const legacy = parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, shapes: [{ kind: "box", x1: 0, y1: 0, x2: 1, y2: 1 }, { kind: "curve", x1: 0, y1: 0, x2: 2, y2: 1, dashed: true, curve: { points: [{ at: [0, 0] }, { at: [2, 1] }] } }] }));
  assert.equal(legacy.shapes?.length, 1);
  assert.equal(legacy.arrows?.[0].kind, "curve");
  assert.equal(legacy.arrows?.[0].style, "dashed");
  console.log("file.check: shape styles, TLC, tables and curves ok");
}

// A shadow's depth, softness and opacity survive a save; an opacity over 1 is refused.
{
  const box = { id: 7, kind: "box" as const, from: [0, 1] as [number, number], to: [2, 0] as [number, number], shadow: true, shade: { depth: 0.3, blur: 0.2, opacity: 0.6 } };
  assert.deepEqual(parse(serialize({ ...mol, shapes: [box] })).shapes?.[0].shade, box.shade);
  assert.throws(() => parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, shapes: [{ kind: "box", x1: 0, y1: 0, x2: 1, y2: 1, shade: { depth: 0.1, blur: 0, opacity: 3 } }] })), /damaged/);
  console.log("file.check: shadows ok");
}

// Rich captions: runs and a font survive a save; runs that do not spell the caption's text are refused.
{
  const cap = { id: 3, text: "H2O", x: 0, y: 0, font: "Georgia", runs: [{ text: "H" }, { text: "2", script: "sub" as const }, { text: "O", bold: true as const }] };
  const back = parse(serialize({ ...mol, captions: [cap] })).captions![0];
  assert.deepEqual({ font: back.font, runs: back.runs }, { font: cap.font, runs: cap.runs });
  assert.throws(() => parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, captions: [{ text: "H2O", x: 0, y: 0, runs: [{ text: "CO2" }] }] })), /damaged/);
  assert.throws(() => parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, captions: [{ text: "H", x: 0, y: 0, runs: [{ text: "H", onclick: "x" }] }] })), /damaged/);
  console.log("file.check: rich text ok");
}

// Groups survive a save: their atoms, and their other objects by kind and place; a group naming a missing object is refused.
{
  const m = { ...mol, arrows: [{ id: 40, kind: "reaction" as const, from: [0, 0] as [number, number], to: [3, 0] as [number, number] }], captions: [{ id: 41, text: "1", x: 0, y: -2 }],
    groups: [{ id: 50, atoms: [0, 1], items: [40, 41], integral: true as const }] };
  const back = parse(serialize(m));
  const g = back.groups![0];
  assert.deepEqual(g.atoms, [0, 1]);
  assert.deepEqual(g.items.map((id) => back.arrows?.some((a) => a.id === id) ? "arrow" : back.captions?.some((c) => c.id === id) ? "caption" : "?"), ["arrow", "caption"]);
  assert.equal(g.integral, true);
  assert.throws(() => parse(JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, groups: [{ atoms: [], items: [["a", 3]] }] })), /damaged/);
  console.log("file.check: groups ok");
}

// The grid: only the steps Settings offers (1e-20 mm once hung Octet as it drew a line per step), and what the
// window shows, checked like the rest of the file.
{
  const base = { format: "octet", version: 1, structure: { atoms: [], bonds: [] } };
  for (const grid of [1e-20, 0.001, -1, 7, "5"]) assert.equal(parse(JSON.stringify({ ...base, style: { grid } })).style?.grid, "bond", String(grid));
  assert.equal(parse(JSON.stringify({ ...base, style: { grid: 20 } })).style?.grid, 20);
  const guides = { grid: true as const, rulers: true as const, crosshair: [0.5, -1] as [number, number] };
  assert.deepEqual(parse(serialize({ ...mol, guides })).guides, guides);
  assert.deepEqual(parse(serialize({ ...mol, guides: {} })).guides, {});
  assert.equal(parse(serialize(mol)).guides, undefined);
  assert.deepEqual(parse(JSON.stringify({ ...base, guides: { grid: 1, crosshair: [NaN, 0], rulers: "y" } })).guides, {});
  console.log("file.check: grid and guides ok");
}
