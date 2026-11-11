// Run: node src/stoich.check.ts. Fails loudly if the stoichiometry sums break.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coefficient, conditionItems, inert, keyColumns, readGrid, formatAmount, formulaWeight, parseAmount, reagentEquiv, reagentFormula, solve } from "./stoich.ts";
import { gridViews, type GridDeps } from "./gridview.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { parse, serialize } from "./file.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import type { Mol } from "./render.ts";

const near = (a: number | undefined, b: number, what: string) => assert.ok(a !== undefined && Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), `${what}: ${a} for ${b}`);
// Benzaldehyde (106.12) 1.06 g is 10 mmol and limiting; NaBH4 (37.83) at 1.5 eq is 15 mmol, 567 mg; benzyl alcohol
// (108.14) expected 10 mmol, 1.081 g; 0.973 g measured is a 90% yield.
const s = solve([
  { key: "a", mw: 106.12, product: false, typed: { mass: 1.0612 } },
  { key: "b", mw: 37.83, product: false, typed: { equiv: 1.5 } },
  { key: "p", mw: 108.14, product: true, typed: { measured: 0.97326 } },
]);
near(s.a.moles, 0.01, "limiting moles");
near(s.b.moles, 0.015, "NaBH4 moles");
near(s.b.mass, 0.015 * 37.83, "NaBH4 mass");
near(s.p.expectedMass, 1.0814, "expected mass");
near(s.p.yield, 0.9, "yield");
// A liquid by volume and density; purity counts.
const l = solve([{ key: "x", mw: 100, product: false, typed: { volume: 2, density: 0.8, purity: 0.5 } }]);
near(l.x.moles, 0.008, "moles from volume, density and purity");
// A solution by volume and molarity.
near(solve([{ key: "y", mw: 50, product: false, typed: { volume: 5, molarity: 2 } }]).y.moles, 0.01, "moles from molarity");
// Typing units, and showing them.
near(parseAmount("250 mg", "mass"), 0.25, "mg");
near(parseAmount("250", "mass"), 250, "a bare mass is g (issue 134)");
near(parseAmount("5", "measured"), 5, "a bare measured mass is g");
near(parseAmount("250", "mass", "mg"), 0.25, "or mg, as Settings say");
for (const unit of ["g", "mg"] as const) {
  near(parseAmount("250 mg", "mass", unit), 0.25, "a typed unit wins");
  near(parseAmount("0.25 g", "mass", unit), 0.25, "a typed unit wins");
  near(parseAmount("2 kg", "mass", unit), 2000, "a typed unit wins");
  near(parseAmount("5", "moles", unit), 0.005, "moles stay in mmol");
}
assert.match(readFileSync(new URL("settings.ts", import.meta.url), "utf8"), /aromaticOnOpen: "", massUnit: "g",/, "grams is the default");
near(parseAmount("1.2", "equiv"), 1.2, "eq");
near(parseAmount("98%", "purity"), 0.98, "%");
assert.equal(parseAmount("lots", "mass"), undefined);
assert.equal(parseAmount("5 mL", "mass"), undefined, "a volume is not a mass");
assert.equal(parseAmount("1e999", "mass"), undefined, "an amount too large to be a number");
assert.equal(formatAmount(0.25, "mass"), "250 mg");
assert.equal(formatAmount(0.0125, "moles"), "12.5 mmol");
assert.equal(formatAmount(0.9, "yield"), "90.0%");
// Formulas written as text.
near(formulaWeight("H2O"), 18.015, "water");
near(formulaWeight("NaBH₄"), 22.99 + 10.81 + 4 * 1.008, "subscript digits");
near(formulaWeight("Ca(OH)2"), 40.078 + 2 * (15.999 + 1.008), "brackets");
// Each part after a dot has its own number (issue 2): CuSO4·5H2O·NH3 is CuSO4 + 5 H2O + NH3.
const cuso4 = 63.546 + 32.06 + 4 * 15.999, water = 2 * 1.008 + 15.999, ammonia = 14.007 + 3 * 1.008;
near(formulaWeight("CuSO4·5H2O"), cuso4 + 5 * water, "a hydrate");
near(formulaWeight("CuSO4.5H2O"), cuso4 + 5 * water, "a hydrate with a full stop");
near(formulaWeight("CuSO4·5H2O·NH3"), cuso4 + 5 * water + ammonia, "two dots");
near(formulaWeight("CuSO4·5H2O"), 63.546 + 32.06 + 4 * 15.999 + 5 * 18.015, "hydrate");
assert.equal(formulaWeight("THF"), undefined, "an abbreviation is not a formula");
// A product's equivalents are its coefficient: two moles of product for each mole of the limiting reactant.
{
  const two = solve([{ key: "r", mw: 100, product: false, typed: { moles: 0.01 } }, { key: "p", mw: 50, product: true, typed: { equiv: 2, measured: 0.5 } }]);
  near(two.p.expectedMoles, 0.02, "two equivalents of product");
  near(two.p.expectedMass, 1, "their mass");
  near(two.p.yield, 0.5, "the yield against them");
}
// Columns keyed by compound (CH-22): typed values stay with their compound when a structure is added in front, follow
// by order a compound that was redrawn, and come from a grid saved with "r0", "p0" keys.
{
  const col = (product: boolean, what: string) => ({ product, what });
  const first = keyColumns([col(false, "C7H6O"), col(false, '"NaBH4"'), col(true, "C7H8O")], { "r:C7H6O": { mass: 1 }, 'r:"NaBH4"': { equiv: 1.5 } }, "r:C7H6O");
  assert.deepEqual(first.cols.map((c) => c.key), ["r:C7H6O", 'r:"NaBH4"', "p:C7H8O"]);
  const added = keyColumns([col(false, "C2H6"), col(false, "C7H6O"), col(false, '"NaBH4"'), col(true, "C7H8O")], { "r:C7H6O": { mass: 1 }, 'r:"NaBH4"': { equiv: 1.5 } }, "r:C7H6O");
  assert.deepEqual(added.cols.map((c) => c.typed), [{}, { mass: 1 }, { equiv: 1.5 }, {}], "a structure added in front takes nothing");
  assert.equal(added.limiting, "r:C7H6O");
  const redrawn = keyColumns([col(false, "C8H8O"), col(false, '"NaBH4"'), col(true, "C8H10O")], { "r:C7H6O": { mass: 1 }, 'r:"NaBH4"': { equiv: 1.5 }, "p:C7H8O": { measured: 0.9 } }, "r:C7H6O");
  assert.deepEqual(redrawn.cols.map((c) => c.typed), [{ mass: 1 }, { equiv: 1.5 }, { measured: 0.9 }], "a redrawn compound keeps its values by order");
  assert.equal(redrawn.limiting, "r:C8H8O");
  const old = keyColumns([col(false, "C7H6O"), col(false, "BH4Na"), col(true, "C7H8O")], { r0: { mass: 1 }, r1: { equiv: 1.5 }, p0: { measured: 0.9 } }, "r1");
  assert.deepEqual(old.cols.map((c) => c.typed), [{ mass: 1 }, { equiv: 1.5 }, { measured: 0.9 }], "a grid from before keys named compounds");
  assert.equal(old.limiting, "r:BH4Na");
  const twins = keyColumns([col(false, "C7H6O"), col(false, "C7H6O")], {});
  assert.deepEqual(twins.cols.map((c) => c.key), ["r:C7H6O", "r:C7H6O#2"]);
  // A saved grid read as a hostile file is.
  assert.ok(readGrid({ typed: { "r:C7H6O": { mass: 1 } }, limiting: "r:C7H6O", hidden: { rows: ["mw", "bogus"], cols: ["p:C7H8O"] }, colour: "#213C99" }, 3));
  assert.deepEqual(readGrid({ typed: {}, hidden: { rows: ["mw", "bogus"] } }, 3)?.hidden, { rows: ["mw"] });
  assert.equal(readGrid({ typed: { "r:x": { mass: -1 } } }, 3), undefined, "a negative amount");
  assert.equal(readGrid({ typed: { "x\ny": { mass: 1 } } }, 3), undefined, "a key with a line break");
  assert.equal(readGrid({ typed: {}, limiting: "p:C7H8O" }, 3), undefined, "a product cannot be limiting");
  // A table of rows (issue 34) is kept; any other layout reads as the columns ChemDraw's grid has.
  assert.equal(readGrid({ typed: {}, layout: "rows" }, 3)?.layout, "rows");
  for (const other of ["columns", "ROWS", 1, {}]) assert.equal(readGrid({ typed: {}, layout: other }, 3)?.layout, undefined, String(other));
  assert.ok(!("layout" in readGrid({ typed: {} }, 3)!));
}
// The layout goes through Octet's own file and through CDXML (Octet's data on the arrow), with what was typed.
{
  const m: Mol = { atoms: [], bonds: [], arrows: [{ id: 4, kind: "reaction", from: [0, 0], to: [3, 0] }], grids: [{ arrow: 4, typed: { "r:C7H6O": { mass: 1.06 } }, layout: "rows" }] };
  const opened = parse(serialize(m));
  assert.deepEqual(opened.grids, [{ arrow: opened.arrows![0].id, typed: { "r:C7H6O": { mass: 1.06 } }, layout: "rows" }]);
  const back = fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol;
  assert.deepEqual(back.grids, [{ arrow: back.arrows![0].id, typed: { "r:C7H6O": { mass: 1.06 } }, layout: "rows" }]);
  assert.equal(fromCdxml(toCdxml({ ...m, grids: [{ arrow: 4, typed: {} }] }, DEFAULT_STYLE)).mol.grids?.[0].layout, undefined, "columns stay the default");
}
// The editor lays out a table of rows from the same sums (solve) as the columns, with the reagents and the products in
// sections of their own, and Hide row hides what shows as a row.
{
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  // The layout itself is gridview.ts, which the editor and a host with no window share.
  const grid = readFileSync(new URL("gridview.ts", import.meta.url), "utf8");
  assert.match(grid, /if \(g\.layout === "rows"\) \{/);
  assert.match(grid, /\[\[false, "Reagents"\], \[true, "Products"\]\]/);
  assert.match(editor, /gridViewsOf\(m, \{/);
  assert.match(editor, /if \(what === "layout"\) return changeGrid\(arrow, \(g\) => \(\{ layout: g\.layout \? undefined : "rows" \}\)\);/);
  assert.match(editor, /hideKey = what === \(rowsLayout \? "hide\.row" : "hide\.col"\)/);
  assert.match(readFileSync(new URL("Actions.tsx", import.meta.url), "utf8"), /context\.rows \? "Show as columns" : "Show as rows", "grid\.layout"/);
}
// A line of conditions splits at commas outside brackets; the atmosphere's gas is not a reagent.
assert.deepEqual(conditionItems("toluene/EtOH/H2O (4:1:1, 30 mL), 80 °C; 12 h"), ["toluene/EtOH/H2O (4:1:1, 30 mL)", "80 °C", "12 h"]);
for (const gas of ["N2", "Ar", "argon", "air", "under N2"]) assert.ok(inert(gas), gas);
for (const reagent of ["H2", "O2", "CO", "NH3"]) assert.ok(!inert(reagent), reagent);
// Issue 131: the equivalents a reagent's text gives fill in its Equivalents (plain) until a value is typed.
for (const [text, want] of [["K2CO3 (2 eq.)", 2], ["K2CO3 (2 equiv)", 2], ["1.5 equiv NaBH4", 1.5], ["Pd(PPh3)4 (5 mol%)", 0.05], ["cat. H2SO4", undefined], ["1 M NaOH", undefined], ["K2CO3", undefined]] as const) assert.equal(reagentEquiv(text), want, text);
{
  const r = (key: string, typed: object, given?: number) => ({ key, mw: 100, product: false, typed, given });
  near(solve([r("a", { moles: 0.01 }), r("k", {}, 2)]).k.moles, 0.02, "K2CO3 (2 eq.)");
  near(solve([r("a", { moles: 0.01 }), r("k", {}, 2)]).k.equiv, 2, "its equivalents shown");
  assert.equal(solve([r("a", {}), r("k", {}, 2)]).k.equiv, 2, "shown before any amount is typed");
  near(solve([r("a", { moles: 0.01 }), r("k", { equiv: 3 }, 2)]).k.moles, 0.03, "a value typed wins");
  near(solve([r("a", {}), r("k", { mass: 2 }, 2)]).a.moles, 0.01, "a reagent's amount over its equivalents sets the scale");
}
// Issue 132: a charge at the end of a formula (+, -, −, 2+, raised) is read as a charge, its mass the formula's, and
// the formula shows it raised; proton, hydroxide, hydronium, hydride and water read as their formulas.
{
  const none = () => undefined, read = (t: string) => reagentFormula(t, none, none, none);
  for (const [text, formula, mass] of [["H+", "H⁺", 1.008], ["H⁺", "H⁺", 1.008], ["OH-", "OH⁻", 17.007], ["OH−", "OH⁻", 17.007], ["OH⁻", "OH⁻", 17.007], ["HO-", "HO⁻", 17.007],
    ["H3O+", "H3O⁺", 19.023], ["NH4+", "NH4⁺", 18.039], ["Na+", "Na⁺", 22.99], ["Cl⁻", "Cl⁻", 35.45], ["Cu2+", "Cu²⁺", 63.546], ["Fe³⁺", "Fe³⁺", 55.845], ["SO42−", "SO4²⁻", 96.056],
    ["SO4 2-", "SO4²⁻", 96.056], ["SO4²⁻", "SO4²⁻", 96.056], ["proton", "H⁺", 1.008], ["Proton", "H⁺", 1.008], ["hydroxide", "OH⁻", 17.007], ["hydronium", "H3O⁺", 19.023],
    ["hydride", "H⁻", 1.008], ["water", "H2O", 18.015]] as const) {
    assert.equal(read(text)?.formula, formula, text);
    near(read(text)?.weight, mass, text);
  }
  for (const text of ["+", "2+", "-", "e-"]) assert.equal(read(text), undefined, text);
  assert.equal(read("K2CO3")?.formula, "K2CO3", "a formula with no charge is as written");
  assert.equal(read("SO4^2-")?.formula, "SO4²⁻");
  // Text in a file is hostile: "constructor" is a word like any other, and long text reads in time linear in its length.
  for (const text of ["constructor", "__proto__"]) assert.equal(reagentFormula(text, (t) => t.trim() && undefined, none, none), undefined, text);
  const t0 = performance.now();
  for (const text of [`a${" ".repeat(1998)}x+`, `a${"1".repeat(1998)}x+`, "1".repeat(2000)]) { read(text); reagentEquiv(text); }
  assert.ok(performance.now() - t0 < 150, `long text read in ${performance.now() - t0} ms`);
}
// Issue 133: a coefficient in the scheme sets equivalents, relative to the limiting reactant's coefficient, products
// too; a number on its own before a structure has no column; a value typed wins; over the arrow "2 HCl" is 2 eq.
{
  assert.deepEqual(coefficient("2 HCl"), ["HCl", 2]);
  assert.deepEqual(coefficient("0.5 H2"), ["H2", 0.5]);
  assert.deepEqual(coefficient("2"), ["", 2]);
  for (const t of ["1,4-dioxane", "2a", "H2"]) assert.deepEqual(coefficient(t), [t, undefined], t);
  // A row: text and structures (atoms 0, 1, 2...), plus signs and one arrow (id 9); each structure is "S" and its atom.
  type Item = string | number | "+" | "→";
  const grid = (row: Item[], typed: object, limiting?: string, above: string[] = [], carried?: { atom: number; box: number[] }) => {
    const captions: { id: number; text: string; x: number; y: number }[] = [];
    let x = 0;
    const steps = row.map((it) => {
      const box = [x, -0.5, x + 1, 0.5]; x += 1.5;
      if (it === "→") return { kind: "arrow", id: 9, box };
      if (it === "+") return { kind: "plus", id: 100 + x, box };
      if (typeof it === "number") return { kind: "structure", atoms: [it], box, ...(carried?.atom === it ? { carry: { captions: [50], atoms: [], arrows: [], shapes: [], ends: [], boxes: [] } } : {}) };
      captions.push({ id: captions.length + 1, text: it, x: 0, y: 0 });
      return { kind: "text", id: captions.length, box };
    });
    const conditions = above.map((text, k) => { captions.push({ id: 200 + k, text, x: 0, y: 0 }); return { kind: "text", id: 200 + k, box: [5, 1, 6, 2] }; });
    if (carried) captions.push({ id: 50, text: "2", x: 0, y: 0 });
    const at = steps.findIndex((s) => s.kind === "arrow"), parts = (l: typeof steps) => l.filter((s) => s.kind === "structure" || s.kind === "text");
    const m = { atoms: [], bonds: [], captions, arrows: [{ id: 9, kind: "reaction", from: [0, 0], to: [1, 0] }], grids: [{ arrow: 9, typed, limiting }] } as unknown as Mol;
    const deps: GridDeps = {
      reaction: () => ({ steps, arrows: [9], atoms: [], captions: [], carried: [], conditions: new Map() }) as never,
      steps: (r) => [{ arrow: 9, reactants: parts(r.steps.slice(0, at)), products: parts(r.steps.slice(at + 1)), above: conditions, below: [] }] as never,
      structure: (atoms) => ({ formula: `S${atoms[0]}`, weight: 100 }), reagent: (t) => (/HCl|H2/.test(t) ? { formula: "X", weight: 36 } : undefined),
      captionBox: (id) => (id === 50 && carried ? carried.box : undefined) as never, nameWidth: () => 1, captionSize: 10, perPt: 0.05, experiment: false,
    };
    const v = gridViews(m, deps)[0];
    return { keys: v.all.map((c) => c.key), rows: v.rows.map((row) => row.id), at: (key: string) => v.solved[key] };
  };
  // 2 A + B → C, B limiting at 10 mmol: 20 mmol of A at 2 eq., 10 mmol of C. The 2 has no column.
  const bLim = grid(["2", 0, "+", 1, "→", 2], { "r:S1": { moles: 0.01 } }, "r:S1");
  assert.deepEqual(bLim.keys, ["r:S0", "r:S1", "p:S2"]);
  near(bLim.at("r:S0").moles, 0.02, "two of A");
  near(bLim.at("r:S0").equiv, 2, "A at 2 eq.");
  near(bLim.at("p:S2").expectedMoles, 0.01, "one of C");
  // A limiting at 20 mmol: B is 0.5 eq. (10 mmol), C 0.5 eq. (10 mmol).
  const aLim = grid(["2", 0, "+", 1, "→", 2], { "r:S0": { moles: 0.02 } }, "r:S0");
  near(aLim.at("r:S0").equiv, 1, "the limiting reactant is 1 eq.");
  near(aLim.at("r:S1").moles, 0.01, "half as much B");
  near(aLim.at("p:S2").expectedMoles, 0.01, "half as much C");
  // A → 2 B: twice the moles of product.
  near(grid([0, "→", "2", 1], { "r:S0": { moles: 0.01 } }).at("p:S1").expectedMoles, 0.02, "A → 2 B");
  // A value typed wins: A typed at 3 eq.
  near(grid(["2", 0, "+", 1, "→", 2], { "r:S1": { moles: 0.01 }, "r:S0": { equiv: 3 } }, "r:S1").at("r:S0").moles, 0.03, "typed equivalents win");
  // Written in the reagent's text: 2 HCl and 0.5 H2 in the row.
  const text = grid([0, "+", "2 HCl", "+", "0.5 H2", "→", 1], { "r:S0": { moles: 0.01 } });
  near(text.at('r:"2 HCl"').moles, 0.02, "2 HCl");
  near(text.at('r:"0.5 H2"').moles, 0.005, "0.5 H2");
  // Over the arrow, 2 HCl is 2 eq. of the limiting reactant, whatever its coefficient; a reagent there without one is 1 eq.
  const side = grid(["2", 0, "→", 1], { "r:S0": { moles: 0.02 } }, undefined, ["2 HCl", "H2"]);
  near(side.at('r:"2 HCl"').moles, 0.04, "2 HCl over the arrow");
  near(side.at('r:"H2"').moles, 0.02, "H2 over the arrow");
  // A number a structure carries on its left (typed close to it) is its coefficient too.
  near(grid([0, "+", 1, "→", 2], { "r:S1": { moles: 0.01 } }, "r:S1", [], { atom: 0, box: [-0.4, -0.2, -0.1, 0.2] }).at("r:S0").moles, 0.02, "a carried 2");
  // A number with a plus sign after it is not a coefficient; with none written, nothing changes.
  assert.ok(grid(["2", "+", 0, "→", 1], {}).keys.includes('r:"2"'), "2 + A");
  assert.equal(grid([0, "+", 1, "→", 2], { "r:S0": { moles: 0.01 } }).at("r:S1").equiv, 1);
  assert.equal(grid([0, "+", 1, "→", 2], {}).at("r:S1").equiv, undefined, "no equivalents shown where none are given");
  // Issue 135: Volume and Density always show for reactants, Molarity and Purity once used; a density typed gives the
  // volume to measure out (B at 2 eq. of 10 mmol, MW 100, 0.8 g/mL: 2 g, 2.5 mL).
  assert.deepEqual(grid([0, "→", 1], {}).rows.filter((id) => ["volume", "density", "molarity", "purity"].includes(id)), ["volume", "density"]);
  assert.ok(grid([0, "→", 1], { "r:S0": { molarity: 1 } }).rows.includes("molarity"));
  const liquid = grid([0, "+", 1, "→", 2], { "r:S0": { moles: 0.01 }, "r:S1": { equiv: 2, density: 0.8 } });
  near(liquid.at("r:S1").mass, 2, "its mass");
  near(liquid.at("r:S1").volume, 2.5, "its volume");
}
// Issue 134: a grid keeps each amount in base units, so a file from Octet 1.1.1 opens with the same amounts whatever
// Settings say: 250 mg of ethanol, K2CO3 at 2 eq., 300 mg of ethyl acetate measured.
{
  const old = '{"format":"octet","version":1,"app":"1.1.1","structure":{"atoms":[],"bonds":[]},"arrows":[{"kind":"reaction","x1":0,"y1":0,"x2":3,"y2":0}],"grids":[{"arrow":0,"typed":{"r:C2H6O":{"mass":0.25},"r:\\"K2CO3\\"":{"equiv":2},"p:C4H8O2":{"measured":0.3}},"limiting":"r:C2H6O"}]}';
  const g = parse(old).grids![0];
  assert.deepEqual(g.typed, { "r:C2H6O": { mass: 0.25 }, 'r:"K2CO3"': { equiv: 2 }, "p:C4H8O2": { measured: 0.3 } });
  assert.equal(formatAmount(g.typed["r:C2H6O"].mass, "mass"), "250 mg");
}
// Issue 136: a product's Expected mass typed is the mass wanted, kept as its mass. With no reactant amount it sets the
// scale: 5 g of C (MW 50) is 0.1 mol, so 0.1 mol of A (10 g) and B at 2 eq. (0.8 g/mL: 2 g, 2.5 mL); by A → 2 C,
// 0.05 mol of A. A reactant's amount wins. Octet 1.1.1 reads the grid (a mass on any column) and leaves the target out.
{
  const a = { key: "r:A", mw: 100, product: false, typed: {} }, b = { key: "r:B", mw: 10, product: false, typed: { equiv: 2, density: 0.8 } }, c = { key: "p:C", mw: 50, product: true, typed: { mass: 5 } };
  const s = solve([a, b, c]);
  near(s["r:A"].moles, 0.1, "the limiting reactant's moles");
  near(s["r:A"].mass, 10, "its mass");
  near(s["r:B"].mass, 2, "B's mass");
  near(s["r:B"].volume, 2.5, "B's volume");
  near(s["p:C"].expectedMass, 5, "the mass wanted");
  near(solve([a, { ...c, typed: { mass: 5, equiv: 2 } }])["r:A"].moles, 0.05, "A → 2 C");
  near(solve([{ ...a, coef: 1 }, { ...c, coef: 2 }])["r:A"].moles, 0.05, "A → 2 C, written in the scheme");
  near(solve([{ ...a, typed: { mass: 1 } }, c])["p:C"].expectedMass, 0.5, "a reactant's amount wins");
  const m: Mol = { atoms: [], bonds: [], arrows: [{ id: 4, kind: "reaction", from: [0, 0], to: [3, 0] }], grids: [{ arrow: 4, typed: { "p:C": { mass: 5 } } }] };
  assert.deepEqual(parse(serialize(m)).grids![0].typed, { "p:C": { mass: 5 } }, "kept in Octet's file");
  assert.deepEqual(fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol.grids![0].typed, { "p:C": { mass: 5 } }, "and in CDXML");
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /if \(row\.id === "expected"\) return \{ text: formatAmount\(s\?\.expectedMass, "mass"\), typed: c\.typed\.mass !== undefined \};/, "shown bold when typed");
  assert.match(editor, /\(gc\.row !== "expected" \|\| gc\.product\)/, "a product's Expected mass can be typed in");
  // One value sets the scale: a mass wanted clears the reactants' amounts and every other product's mass wanted.
  assert.match(editor, /filter\(\(\[fd\]\) => \(k\[0\] === "p" \? fd !== "mass" : !target \|\| !amount\(fd\)\)\)/, "one value sets the scale");
}
console.log("stoich.check: ok");
