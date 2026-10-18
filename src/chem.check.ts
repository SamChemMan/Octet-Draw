// Run: node src/chem.check.ts. Fails loudly if a written label can stop the drawing's chemistry or its drawing.
// Every label text (good, bad or random) goes through what the editor works out on each change: label expansion,
// formula and masses, the Properties values, stereo labels, a fragmentation cut, and the structure drawing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const { analyse, expandWithOrigins, fragmentMasses, ready, stereoLabels, structures } = await import("./chem.ts");
const { render } = await import("./render.ts");
type Mol = import("./render.ts").Mol;
await ready;

// A label on its own, and the same label on the end of an ethyl group (CH3–CH2–label).
const alone = (text: string): Mol => ({ atoms: [{ label: "C", text, location: [0, 0, 0] }], bonds: [] });
const onEthyl = (text: string): Mol => ({
  atoms: [{ label: "C", location: [0, 0, 0] }, { label: "C", location: [0.866, 0.5, 0] }, { label: "C", text, location: [1.732, 0, 0] }],
  bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }],
});
const box = Array.from({ length: 40 }, (_, i) => [9.6 * (i / 40), -9.5 * ((i * 7) % 40) / 40] as [number, number]);
const S = { bond: 19.2, line: 0.8, bold: 2.67, spacing: 3.46, hash: 3.33, margin: 2.25, size: 13.33 };
const tryAll = (m: Mol) => {
  expandWithOrigins(m);
  analyse(m);
  structures(m);
  stereoLabels(m);
  fragmentMasses(m, m.bonds.map((_, k) => k));
  render(m, S, () => ({ width: 9.6, ascent: 9.5, outline: box }), S.bond);
};

// Labels that once stopped the editor (H2O2 and HO2C made a SMILES Indigo cannot read), and other awkward ones.
const awkward = ["H2O2", "HO2C", "HOOC", "Et3N", "Me3Si", "Ph3P", "(CH2)3", "Me2N", "C0", "C999", "((((", "))", "()", "(", "2", "+", "–", " ", "OO(", "H", "HH", "D2O", "Xx", "*", "[", "]"];
for (const t of awkward) { tryAll(alone(t)); tryAll(onEthyl(t)); }
// Random labels from the characters labels are made of.
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pieces = ["H", "C", "O", "N", "S", "P", "F", "Cl", "Br", "I", "Si", "B", "Me", "Et", "Ph", "Boc", "TBS", "Ac", "(", ")", "2", "3", "4", "12", "+", "-", "a", "x", " "];
for (let n = 0; n < 400; n++) {
  const t = Array.from({ length: 1 + Math.floor(rand() * 6) }, () => pieces[Math.floor(rand() * pieces.length)]).join("");
  tryAll(alone(t));
  tryAll(onEthyl(t));
}
console.log("chem.check: no label text stops the chemistry or the drawing");

// Labels read right to left count as the group they are: CH3CH2–HO2C is propanoic acid, H2O2 is hydrogen peroxide.
const formula = (m: Mol) => analyse(m)?.[0].formula;
assert.equal(formula(alone("H2O2")), "H2O2");
assert.equal(formula(onEthyl("HO2C")), "C3H6O2");
assert.equal(formula(onEthyl("HOOC")), "C3H6O2");
assert.equal(formula(onEthyl("CO2H")), "C3H6O2");
// A label Indigo cannot read stays one unknown atom.
assert.deepEqual(expandWithOrigins(onEthyl("Xx")).mol.atoms.map((a) => a.label), ["C", "C", "*"]);
console.log("chem.check: labels ok");

// The formula and masses come one entry per structure, in the drawing's order (a lone label and a lone carbon too),
// up to the number asked for. Each structure's values are kept by its content: moving it gives the same values, and
// a change to a label gives new ones.
{
  const drawn: Mol = {
    atoms: [{ label: "P", text: "PF6", charge: -1, location: [0, 0, 0] }, { label: "C", location: [2, 0, 0] }, { label: "C", location: [2.87, 0.5, 0] }, { label: "O", location: [3.73, 0, 0] }, { label: "C", location: [6, 0, 0] }],
    bonds: [{ type: 1, atoms: [1, 2] }, { type: 1, atoms: [2, 3] }],
  };
  assert.deepEqual(analyse(drawn)?.map((a) => a.formula), ["F6P", "C2H6O", "CH4"]);
  assert.deepEqual(analyse(drawn, 2)?.map((a) => a.formula), ["F6P", "C2H6O"]);
  assert.deepEqual(analyse(drawn), analyse(drawn));
  const moved = { ...drawn, atoms: drawn.atoms.map((a) => ({ ...a, location: [a.location[0] + 5, a.location[1] - 3, 0] as [number, number, number] })) };
  assert.deepEqual(analyse(moved), analyse(drawn));
  const relabelled = { ...drawn, atoms: drawn.atoms.map((a, i) => (i === 3 ? { ...a, text: "OMe" } : a)) };
  assert.deepEqual(analyse(relabelled)?.map((a) => a.formula), ["F6P", "C3H8O", "CH4"]);
  assert.equal(structures(drawn)?.[1]?.formula, "C2H6O");
  assert.equal(structures(relabelled)?.[1]?.formula, "C3H8O");
  // A label's group is read once and kept; a change to one expansion does not change the next.
  const first = expandWithOrigins(onEthyl("CO2Me")).mol;
  first.atoms[3].label = "Xx";
  assert.notEqual(expandWithOrigins(onEthyl("CO2Me")).mol.atoms[3].label, "Xx");
  console.log("chem.check: analysis by structure ok");
}

// A label Indigo cannot read, alone, has no entry. A structure Indigo reads as a bad valence (a pyridine N bonded to
// Ru) keeps its formula and weight. Each exact mass is the structure's own monoisotopic mass.
{
  const lone: Mol = { atoms: [{ label: "C", text: "S0", location: [0, 0, 0] }, { label: "C", location: [3, 0, 0] }, { label: "O", location: [3.87, 0.5, 0] }], bonds: [{ type: 1, atoms: [1, 2] }] };
  assert.deepEqual(analyse(lone)?.map((a) => [a.formula, a.exact.toFixed(4)]), [["CH4O", "32.0262"]]);
  const ring = [0, 1, 2, 3, 4, 5].map((k) => ({ label: k ? "C" : "N", location: [Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3), 0] as [number, number, number] }));
  const bound: Mol = { atoms: [...ring, { label: "Ru", location: [2, 0, 0] }], bonds: [...ring.map((_, k) => ({ type: k % 2 ? 1 : 2, atoms: [k, (k + 1) % 6] as [number, number] })), { type: 1, atoms: [0, 6] }] };
  const [a] = analyse(bound) ?? [];
  assert.equal(a?.formula, "C5H5NRu");
  assert.ok(Number.isFinite(a?.weight));
  console.log("chem.check: unreadable structures ok");
}
