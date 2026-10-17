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
// A ligand bonded to a metal has the hydrogens the drawing shows: PPh3 on Pd is P, not PH.
const ph3 = (at: number): Mol["atoms"] => [{ label: "P", location: [at, 1, 0] }, ...[0, 1, 2].flatMap((r) => Array.from({ length: 6 }, (_, k) => ({ label: "C", location: [at + r + Math.cos(k), 2 + Math.sin(k), 0] as [number, number, number] })))];
const pd: Mol = { atoms: [{ label: "Pd", location: [0, 0, 0] }, ...ph3(1), ...ph3(-1)], bonds: [] };
for (const p of [1, 20]) {
  pd.bonds.push({ type: 1, atoms: [0, p] });
  for (let r = 0; r < 3; r++) { const c = p + 1 + 6 * r; pd.bonds.push({ type: 1, atoms: [p, c] }); for (let k = 0; k < 6; k++) pd.bonds.push({ type: k % 2 ? 1 : 2, atoms: [c + k, c + ((k + 1) % 6)] }); }
}
pd.atoms.push({ label: "Cl", location: [0, -1, 0] }, { label: "Cl", location: [0, 1, 0] });
pd.bonds.push({ type: 1, atoms: [0, 39] }, { type: 1, atoms: [0, 40] });
assert.equal(formula(pd), "C36H30Cl2P2Pd");
console.log("chem.check: labels ok");
