// Run: node src/riskassess.check.ts. Fails loudly if an experiment page's risk assessment (riskassess.ts) loses its
// substances, reads hazard codes wrongly, stops ticking or typing, or does not save, open and print as drawn.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addRisk, buildRisk, hCodes, isSignificant, MAX_SUBSTANCES, pathCurves, readRisk, riskGroup, riskLayout, riskPlace, significantCodes, substancesOf, syncRisk, ticked, TICKS, toggleRisk, withCas, withHazards, withSubstances, type Substance } from "./riskassess.ts";
import { MARGIN, slotText, templateOf, type Sheet } from "./experiment.ts";
import { PICTOGRAMS, type Ghs } from "./ghs.ts";
import { gridViews, type GridDeps } from "./gridview.ts";
import { parse, serialize } from "./file.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { DEFAULT_STYLE, pagesOver } from "./docstyle.ts";
import { addCaption, deleteGraphics, updateCaption } from "./edit.ts";
import type { Mol } from "./render.ts";

const sheet: Sheet = { page: [210, 297], bond: 14.4, size: 10, measure: (t, size) => t.length * size * 0.5 };
const k = 72 / 25.4 / sheet.bond, EMPTY: Mol = { atoms: [], bonds: [] };

// The pictograms' path data reads as curves: every point a number, each solid part closed.
for (const [code, p] of Object.entries(PICTOGRAMS)) for (const [kind, d] of p.parts) {
  const cs = pathCurves(d);
  assert.ok(cs.length > 0, code);
  for (const c of cs) {
    assert.ok(c.points.length > 1 || c.closed, `${code} has a curve of one point`);
    assert.ok(c.points.every((q) => [q.at, q.c1, q.c2].every((v) => !v || v.every(Number.isFinite))), `${code} reads as numbers`);
    if (kind === "solid") assert.ok(c.closed, `${code}'s solid parts are closed`);
  }
}
// A circle drawn as two half arcs is one closed curve of four quarter arcs, through its top, bottom and sides.
const circle = pathCurves("M10 0A10 10 0 1 1 -10 0A10 10 0 1 1 10 0Z")[0];
assert.equal(circle.closed, true);
assert.equal(circle.points.length, 4);
assert.deepEqual(circle.points.map((q) => q.at.map((v) => Math.round(v) + 0)), [[10, 0], [0, 10], [-10, 0], [0, -10]]);

// H codes from PubChem's statements, each once, combined codes kept whole.
assert.deepEqual(hCodes(["H225 (100%): Highly Flammable liquid and vapor", "H319: Causes serious eye irritation", "H225: again", "H301+H311+H331: Toxic", "EUH014: Reacts violently with water", "Not classified", "P210"]),
  ["H225", "H319", "H301+H311+H331", "EUH014"]);
assert.deepEqual(hCodes(["H350i: May cause cancer by inhalation", "H360FD: May damage fertility", "H361fd"]), ["H350i", "H360FD", "H361fd"]);
// The significant hazards: categories 1 and 2 carcinogens, mutagens and reproductive toxins, and sensitisers, with
// their letters; H351, H341 and H361 are category 2, so they count. Others, and look-alikes, do not.
for (const c of ["H317", "H334", "H340", "H341", "H350", "H350i", "H351", "H360", "H360F", "H360D", "H360FD", "H360Fd", "H360Df", "H361", "H361f", "H361d", "H361fd", "H362"]) assert.deepEqual(significantCodes([c]), [c], c);
for (const c of ["H225", "H314", "H335", "H336", "H370", "H372", "H3500", "EUH014", "H318"]) assert.deepEqual(significantCodes([c]), [], c);
assert.deepEqual(significantCodes(["H302+H317"]), ["H317"], "a combined code counts by its parts");

// The substances from a reaction drawn A + B → C with THF and a catalyst above the arrow: each compound once, with its
// role from the table; a structure by its name and compound number, text as written.
{
  const parts = [{ kind: "structure", atoms: [0], box: [0, -0.5, 1, 0.5] }, { kind: "text", id: 1, box: [1.5, -0.5, 2.5, 0.5] }, { kind: "structure", atoms: [2], box: [5, -0.5, 6, 0.5] }];
  const above = [{ kind: "text", id: 2, box: [3, 1, 4, 2] }, { kind: "text", id: 3, box: [4, 1, 5, 2] }];
  const m = { atoms: [], bonds: [], captions: [{ id: 1, text: "AcCl", x: 0, y: 0 }, { id: 2, text: "THF", x: 0, y: 0 }, { id: 3, text: "Pd(PPh3)4", x: 0, y: 0 }, { id: 7, text: "2", x: 5.5, y: -1, under: [2], bold: true }],
    arrows: [{ id: 9, kind: "reaction", from: [3, 0], to: [4.5, 0] }], grids: [{ arrow: 9, typed: {}, roles: { 'r:"Pd(PPh3)4"': "catalyst" } }] } as unknown as Mol;
  const deps: GridDeps = {
    reaction: () => ({ steps: parts, arrows: [9], atoms: [0, 2], captions: [], carried: [], conditions: new Map() }) as never,
    steps: () => [{ arrow: 9, reactants: parts.slice(0, 2), products: parts.slice(2), above, below: [] }] as never,
    structure: (atoms) => ({ formula: atoms[0] === 0 ? "C2H6O" : "C4H8O2", weight: 46 }), reagent: (t) => ({ AcCl: { formula: "C2H3ClO", weight: 78.5 }, THF: { formula: "C4H8O", weight: 72.1 }, "Pd(PPh3)4": { formula: "C72H60P4Pd", weight: 1155.6 } })[t],
    captionBox: () => undefined, nameWidth: (t) => t.length * 0.2, captionSize: 10, perPt: 0.05, experiment: true,
  };
  const views = gridViews(m, deps);
  const names: Record<number, string> = { 0: "ethanol", 2: "ethyl acetate" }, keys: Record<string, string> = { C2H6O: "LFQSCWFLJHTTHZ-UHFFFAOYSA-N", '"THF"': "WYURNTSHIVDZCO-UHFFFAOYSA-N" };
  const list = substancesOf([...views, ...views], (a) => names[a[0]], (c) => keys[c.atoms ? c.formula : c.what]);
  assert.deepEqual(list.map((x) => [x.name, x.formula, x.role, x.key]), [
    ["ethanol", "C2H6O", "reactant", "LFQSCWFLJHTTHZ-UHFFFAOYSA-N"], ["AcCl", "C2H3ClO", "reactant", '"AcCl"'], ["THF", "C4H8O", "solvent", "WYURNTSHIVDZCO-UHFFFAOYSA-N"],
    ["Pd(PPh3)4", "C72H60P4Pd", "catalyst", '"Pd(PPh3)4"'], ["ethyl acetate (2)", "C4H8O2", "product", "C4H8O2"],
  ], "each compound once, a second table's the same");
  assert.equal(list[0].inchi, "LFQSCWFLJHTTHZ-UHFFFAOYSA-N");
}

// Added to an experiment page: on the page under it, inside the margins, an integral group with the record. Its
// heading, its substances' rows, a place to type each one's CAS number and exposure route, and its boxes.
const subs: Omit<Substance, "id">[] = [
  { key: "ETOH", name: "ethanol", formula: "C2H6O", role: "reactant" },
  { key: "DCM", name: "dichloromethane", formula: "CH2Cl2", role: "solvent" },
];
const at = riskPlace(sheet, -20);
assert.ok(Math.abs(at[0] - (MARGIN - 105) * k) < 1e-9, "at the left margin");
assert.ok(at[1] < -(297 / 2) * k - MARGIN * k + 1e-9 && at[1] > -(297 / 2) * k - 2 * MARGIN * k, "at the top of page 2");
assert.ok(riskPlace(sheet, -(297 / 2 + 300) * k)[1] < -(297 / 2 + 297) * k, "a drawing that runs onto page 2 puts it on page 3");
let m = addRisk(EMPTY, at, sheet, subs);
const g = riskGroup(m)!;
assert.equal(g.integral, true);
assert.deepEqual(g.risk.substances.map((x) => [x.id, x.name]), [[1, "ethanol"], [2, "dichloromethane"]]);
assert.equal(addRisk(m, at, sheet, subs), m, "one for each page");
const ids = new Set(g.items), all = [...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? [])];
assert.ok(all.every((x) => ids.has(x.id)), "every part is in the group");
const texts = m.captions!.map((c) => c.text);
for (const t of ["Risk assessment", "Substance", "Formula", "CAS number", "Hazards", "Exposure route", "ethanol", "dichloromethane", "Significant chemical hazards", "Safety and risk", "Control measures",
  "Fume cupboard", "Glovebox or isolator", "Waste disposal", "Chlorinated", "Emergency procedures", "Dry powder", "Emergency treatment", "Read and understood", "Signatures", "Co-signatory"]) assert.ok(texts.includes(t), t);
assert.ok(m.captions!.every((c) => c.chemical === false), "no text reads as chemistry (CO₂, THF)");
assert.ok(m.captions!.every((c) => c.field === undefined || /^[a-z][a-z0-9:]{0,39}$/.test(c.field)), "fields the files take");
assert.deepEqual(m.captions!.find((c) => c.text === "CH2Cl2")?.runs?.map((r) => [r.text, r.script]), [["CH", undefined], ["2", "sub"], ["Cl", undefined], ["2", "sub"]], "formulae with subscripts");
const lay = riskLayout(m, sheet)!;
assert.deepEqual(lay.slots.filter((x) => /^risk:(cas|exp)\d/.test(x.field)).map((x) => x.field), ["risk:cas1", "risk:exp1", "risk:cas2", "risk:exp2"]);
assert.deepEqual(new Set(lay.ticks.map((x) => x.key)), new Set(TICKS), "a box for each tick");
const right = (105 - MARGIN) * k;
assert.ok([...lay.slots.map((x) => x.box[2]), ...lay.ticks.map((x) => x.box[2])].every((x) => x <= right + 0.4), "within the right margin");
assert.ok(lay.bottom > at[1] - (297 - 2 * MARGIN) * k, "fits on its page");
// It starts on page 2 when printed: the pages it covers are the experiment's page and the one under it.
assert.deepEqual(pagesOver([-50, -100, 50, -lay.bottom / k], 210, 297).pages, [[0, 0], [0, 1]]);

// A click on a box ticks it (a tick is drawn in it), and again unticks it. The significant-hazards box is Octet's
// answer until the user changes it.
const tickCount = (x: Mol) => (x.arrows ?? []).filter((a) => a.kind === "curve" && a.width === 1.2).length;
assert.equal(tickCount(m), 0);
m = toggleRisk(m, "fume", sheet);
assert.ok(ticked(riskGroup(m)!.risk, "fume"));
assert.equal(tickCount(m), 1);
assert.equal(tickCount(toggleRisk(m, "fume", sheet)), 0);
assert.ok(new Set(riskGroup(m)!.items).size === riskGroup(m)!.items.length, "no part twice");
assert.ok(!(m.captions ?? []).some((c) => !riskGroup(m)!.items.includes(c.id)), "a build leaves nothing behind");

// Typed text: a click in a place starts its text there (slotText); kept, it joins the group and stays in its place,
// and a longer text wraps to the place and pushes what is under it down. The Prevention place shows once Fire or
// explosion risk is ticked.
const typed = (x: Mol, field: string, text: string) => {
  const slot = riskLayout(x, sheet)!.slots.find((s) => s.field === field)!, { text: _, ...own } = slotText(x, slot, sheet);
  return syncRisk(x, addCaption(x, { ...own, text })[0], sheet);
};
assert.equal(riskLayout(m, sheet)!.slots.some((s) => s.field === "risk:prevention"), false);
m = toggleRisk(m, "fire", sheet);
assert.ok(riskLayout(m, sheet)!.slots.some((s) => s.field === "risk:prevention"));
const low = riskLayout(m, sheet)!.bottom;
m = typed(m, "risk:exp1", "Skin, eyes");
const exp = m.captions!.find((c) => c.field === "risk:exp1")!;
assert.ok(riskGroup(m)!.items.includes(exp.id), "typed text joins the risk assessment");
assert.equal(riskLayout(m, sheet)!.slots.find((s) => s.field === "risk:exp1")!.caption, exp.id);
m = typed(m, "risk:safety", "Work behind a blast shield. ".repeat(12).trim());
assert.ok(riskLayout(m, sheet)!.bottom < low - 2 * (12 / 14.4), "a long text takes more lines");
const safety = m.captions!.find((c) => c.field === "risk:safety")!;
assert.ok(safety.width! > 0, "it wraps to its place");
// Rich text: a bold run stays, and an edit keeps the text where it is.
m = syncRisk(m, updateCaption(m, safety.id, { text: "Shield", runs: [{ text: "Shield", bold: true }] }), sheet);
assert.deepEqual(m.captions!.find((c) => c.id === safety.id)!.runs, [{ text: "Shield", bold: true }]);
assert.ok(riskLayout(m, sheet)!.bottom > riskLayout(typed(m, "risk:special", "x\ny\nz"), sheet)!.bottom, "lines typed push the rest down");
// Moved as one (the group), the next build stays where it was moved to.
const moved: Mol = { ...m, captions: m.captions!.map((c) => (riskGroup(m)!.items.includes(c.id) ? { ...c, x: c.x + 5 } : c)) };
assert.ok(Math.abs(buildRisk(moved, sheet).captions!.find((c) => c.id === exp.id)!.x - exp.x - 5) < 1e-9);

// Update substances: a compound that stays keeps its number and what was typed for it; one no longer there goes with its
// text; a new one gets the next number.
const updated = withSubstances(m, [subs[0], { key: "ACCL", name: "acetyl chloride", formula: "C2H3ClO", role: "reactant" }], sheet);
assert.deepEqual(riskGroup(updated)!.risk.substances.map((x) => [x.id, x.key]), [[1, "ETOH"], [3, "ACCL"]]);
assert.equal(updated.captions!.find((c) => c.field === "risk:exp1")?.text, "Skin, eyes", "typed cells stay");
assert.equal(updated.captions!.filter((c) => c.field === "risk:exp2").length, 0);

// CAS numbers fill an empty CAS cell only; the user's typing is kept.
m = withCas(m, { ETOH: "64-17-5", DCM: "75-09-2" }, sheet);
assert.equal(m.captions!.find((c) => c.field === "risk:cas1")?.text, "64-17-5");
m = syncRisk(m, updateCaption(m, m.captions!.find((c) => c.field === "risk:cas2")!.id, { text: "75-09-2 (stabilised)" }), sheet);
assert.equal(withCas(m, { DCM: "75-09-2" }, sheet).captions!.find((c) => c.field === "risk:cas2")?.text, "75-09-2 (stabilised)");

// Find hazards: the pictograms (a red diamond and the symbol), the signal word and the codes. A carcinogen makes the
// significant hazards Yes and says which substance; the user can still say No.
const dcm: Ghs = { cid: 6344, pictograms: ["GHS07", "GHS08"], signal: "Warning", hazards: ["H315: Causes skin irritation", "H351: Suspected of causing cancer"], precautions: [] };
m = withHazards(m, { DCM: dcm, ETOH: null }, sheet);
const r = riskGroup(m)!.risk;
assert.deepEqual(r.substances.map((x) => [x.pictograms, x.signal, x.codes, x.found]), [[undefined, undefined, undefined, true], [["GHS07", "GHS08"], "Warning", ["H315", "H351"], true]]);
assert.equal((m.arrows ?? []).filter((a) => a.colour === "#B42323").length, 2, "a diamond for each pictogram");
assert.ok(isSignificant(r));
assert.ok(m.captions!.some((c) => c.text.includes("dichloromethane (H351)")), "names the substance that makes it Yes");
assert.ok(m.captions!.some((c) => c.text === "Not classified"));
m = toggleRisk(m, "significant", sheet);
assert.equal(isSignificant(riskGroup(m)!.risk), false, "the user's answer");

// Saved as .oct and as CDXML, it opens the same: the record, the parts and the typed text.
for (const back of [parse(serialize(m)), fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol]) {
  const gb = riskGroup(back)!;
  assert.deepEqual(gb.risk, riskGroup(m)!.risk);
  assert.equal(gb.integral, true);
  assert.equal(gb.items.length, riskGroup(m)!.items.length);
  assert.equal(back.captions!.find((c) => c.field === "risk:safety")?.text, "Shield");
  assert.equal(back.captions!.find((c) => c.field === "risk:exp1")?.text, "Skin, eyes");
}
// Deleted, all of it goes.
const gone = deleteGraphics(m, new Set(riskGroup(m)!.items));
assert.equal(riskGroup(gone), undefined);
assert.equal(gone.captions?.length ?? 0, 0);
// A template made from the page leaves it with the drawing.
assert.equal(templateOf(m).captions?.length ?? 0, 0);
assert.equal(templateOf(m).shapes?.length ?? 0, 0);

// Hostile records are refused or cut down: too many substances, unknown pictograms, ticks or roles, wrong types,
// long texts, codes that are not codes.
const good = riskGroup(m)!.risk;
assert.deepEqual(readRisk(JSON.parse(JSON.stringify(good))), good);
for (const bad of [null, 5, "x", {}, { ...good, substances: "x" }, { ...good, ticks: ["rm -rf"] }, { ...good, significant: "yes" },
  { ...good, substances: Array.from({ length: MAX_SUBSTANCES + 1 }, (_, i) => ({ id: i + 1, key: `${i}`, name: "x", formula: "", role: "reactant" })) },
  { ...good, substances: [{ ...good.substances[0], pictograms: ["GHS10"] }] }, { ...good, substances: [{ ...good.substances[0], pictograms: ["__proto__"] }] },
  { ...good, substances: [{ ...good.substances[0], role: "admin" }] }, { ...good, substances: [{ ...good.substances[0], codes: ["<script>"] }] },
  { ...good, substances: [{ ...good.substances[0], id: 1.5 }] }, { ...good, substances: [good.substances[0], good.substances[0]] },
  { ...good, substances: [{ ...good.substances[0], name: "x".repeat(301) }] }, { ...good, substances: [{ ...good.substances[0], signal: "x".repeat(21) }] }]) assert.equal(readRisk(bad), undefined, JSON.stringify(bad)?.slice(0, 80));
assert.equal(readRisk({ ...good, substances: [{ ...good.substances[0], name: "a\u0000b".padEnd(250, "c") }] })!.substances[0].name.length, 200, "a name is one line of 200 characters at most");
// A damaged record in a file: the group opens as a plain group.
const raw = JSON.parse(serialize(m));
raw.groups[0].risk = { substances: 7 };
assert.equal(riskGroup(parse(JSON.stringify(raw))), undefined);

// The Export dialog has Print… for every drawing, the same printing as File > Print; an experiment page's PDF is its
// pages.
const editor = readFileSync(new URL("./Editor.tsx", import.meta.url), "utf8"), dialog = readFileSync(new URL("./ExportDialog.tsx", import.meta.url), "utf8");
assert.match(dialog, /alt=\{\{ label: "Print…", onClick: \(\) => onPrint\(part\) \}\}/);
assert.match(editor, /onPrint=\{\(part\) => \{ setExportView\(undefined\); void printDrawing\(part === "selection"\); \}\}/);
assert.match(editor, /const sheets = f\.format === "pdf" && part === "all" && expPage \? pagePictures\(mol\) : undefined;/);
assert.match(editor, /pages: sheets\?\.texts/);
console.log("riskassess.check: ok");
