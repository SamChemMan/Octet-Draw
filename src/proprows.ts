// The Properties panel's rows (ChemDraw's Analysis and Chemical Properties windows, and the GHS hazards Find hazards
// gets from PubChem), their values for each structure, and the report (ChemDraw's Report…) with each value's method
// and source.
import type { Structure } from "./chem.ts";
import { PICTOGRAMS, type Ghs } from "./ghs.ts";
import type { Graph } from "./naming.ts";
import type { Mol } from "./render.ts";
import { fragments } from "./edit.ts";
import { elementalAnalysis, isotopePattern } from "./mass.ts";
import { massText } from "./query.ts";
import { common, normalise, plainOf, runsOf, styled, type TextRun } from "./richtext.ts";
import { logS, properties as calculate } from "./props.ts";

// What Octet's own calculators (props.ts) give for a structure.
export type Calculated = {
  tpsa: number; henry?: number; pka: { atom: number; kind: string; pka: number; sd: number }[];
  joback?: { tb: number; tm: number; tc: number; pc: number; vc: number; hf: number; gf: number };
  logS?: number; donors?: number; acceptors?: number; rings?: number;
};
// Octet's own calculators' values for a structure, kept with the structure's values they are from (chem.ts keeps those
// by structure), so each structure is worked out once; pKa sites above 13 (alcohols, amides) are left out.
const known = new WeakMap<Structure, Calculated>();
export function calculated(s: Structure, g: Graph): Calculated {
  if (!known.has(s)) { const p = calculate(g); known.set(s, { ...p, pka: p.pka.filter((x) => x.pka < 13), logS: s.logP !== undefined ? logS(s.logP, s.weight, p) : undefined }); }
  return known.get(s)!;
}
// method: how the value is found, and the source, for the report. places: the decimals set for every number (issue
// 77; unset: each row's own, 4 for the exact mass, 1 for the temperatures, critical volume and pKa, 2 for the rest).
// m/z's relative intensities keep 1 place, and the elemental analysis 2 (Indigo gives no more). predicted: a model's estimate of a measured property,
// which the panel, Add to drawing, Copy and the report all mark (rowLabel). g: the structure's hazards from PubChem,
// once found (null: PubChem has none).
export type Row = { key: string; name: string; method: string; predicted?: true; value: (s: Structure, c?: Calculated, places?: number, g?: Ghs | null) => string | undefined };
export const rowLabel = (r: { name: string; predicted?: true }) => (r.predicted ? `${r.name} (predicted)` : r.name);

// A value that rounds to zero shows 0, not −0.
const sign = (x: number, places: number) => { const t = x.toFixed(places); return (Number(t) === 0 ? t.replace("-", "") : t).replace("-", "−"); };
const celsius = (k: number | undefined, places = 1) => (k === undefined ? undefined : `${sign(k - 273.15, places)} °C`);
const unit = (x: number | undefined, places: number, u: string) => (x === undefined || !Number.isFinite(x) ? undefined : `${sign(x, places)} ${u}`);
const JOBACK = "Joback group contributions (Joback and Reid, Chem. Eng. Commun. 1987, 57, 233).";
const HBOND = "Counted as RDKit's NumHBD and NumHBA count them (RDKit 2026.03, Lipinski.cpp).";
const CRIPPEN = "Wildman–Crippen atom contributions (Wildman and Crippen, J. Chem. Inf. Comput. Sci. 1999, 39, 868), calculated by Indigo.";
const GHS = "GHS classification from PubChem (pubchem.ncbi.nlm.nih.gov), found by the structure's standard InChIKey: the first source PubChem shows for the compound.";

// The rows, in ChemDraw's two windows' order: analysis and tPSA (calculated from the structure), then the predicted
// physical properties, then the predicted medicinal chemist's; then the GHS hazards and the suppliers, once found. The
// CAS number (in neither window) goes after the formula.
export const PROPERTY_ROWS: Row[][] = [
  [
    { key: "formula", name: "Formula", method: "Molecular formula of the drawn structure, with its implicit hydrogens (Indigo).", value: (s) => s.formula },
    // Looked up after the panel has drawn (withCas), so it has no value here.
    { key: "cas", name: "CAS number", method: "Looked up by the structure's standard InChIKey in Octet's dictionary (Wikidata and the FDA's UNII list). With Online search on, PubChem gives the numbers the dictionary does not have.", value: () => undefined },
    { key: "exact", name: "Exact mass", method: "Monoisotopic mass: the most abundant isotope of each element (Indigo).", value: (s, _, d) => (Number.isFinite(s.exact) ? massText(s, "exact", d ?? 4) : undefined) },
    { key: "weight", name: "Molecular weight", method: "Average mass from the standard atomic weights (Indigo).", value: (s, _, d) => massText(s, "weight", d ?? 2) },
    { key: "mz", name: "m/z", method: "Isotope pattern from the isotope masses and abundances in NIST Atomic Weights and Isotopic Compositions (Coursey et al., NIST, 2015); the six most intense peaks, relative to the largest.",
      value: (s, _, d) => isotopePattern(s.formula)?.slice(0, 6).map((p) => `${p.mz.toFixed(d ?? 2)} (${p.rel.toFixed(1)}%)`).join(", ") },
    { key: "analysis", name: "Elemental analysis", method: "Mass percentage of each element, from the formula and the standard atomic weights.", value: (s) => elementalAnalysis(s.composition) },
    { key: "tpsa", name: "tPSA", method: "Topological polar surface area from N and O contributions (Ertl, Rohde and Selzer, J. Med. Chem. 2000, 43, 3714).", value: (_, c, d) => unit(c?.tpsa, d ?? 2, "Å²") },    { key: "hbd", name: "H-bond donors", method: `${HBOND} Donors: each N, O or S atom that has a hydrogen, counted once. Lipinski's rule of five counts each N–H and O–H hydrogen instead (acetamide: 1 here, 2 by Lipinski).`, value: (_, c) => c?.donors?.toString() },    { key: "hba", name: "H-bond acceptors", method: `${HBOND} Acceptors: each O and S atom except the OH or SH of an acid, each non-aromatic N with three bonds except an amide or sulfonamide N, and each aromatic N with no hydrogen and two neighbours. Lipinski's rule of five counts every N and O atom instead (acetamide: 1 here, 2 by Lipinski).`, value: (_, c) => c?.acceptors?.toString() },    { key: "rings", name: "Rings", method: "Number of rings in the smallest set of smallest rings: bonds − atoms + separate structures. A cage has fewer rings than faces (cubane: 5).", value: (_, c) => c?.rings?.toString() },
  ],
  [
    { key: "tb", name: "Boiling point", predicted: true, method: JOBACK, value: (_, c, d) => celsius(c?.joback?.tb, d) },
    { key: "tm", name: "Melting point", predicted: true, method: JOBACK, value: (_, c, d) => celsius(c?.joback?.tm, d) },
    { key: "tc", name: "Critical temperature", predicted: true, method: JOBACK, value: (_, c, d) => celsius(c?.joback?.tc, d) },
    { key: "pc", name: "Critical pressure", predicted: true, method: JOBACK, value: (_, c, d) => unit(c?.joback?.pc, d ?? 2, "bar") },
    { key: "vc", name: "Critical volume", predicted: true, method: JOBACK, value: (_, c, d) => unit(c?.joback?.vc, d ?? 1, "cm³/mol") },
    { key: "hf", name: "Heat of formation", predicted: true, method: `${JOBACK} Ideal gas at 298 K.`, value: (_, c, d) => unit(c?.joback?.hf, d ?? 2, "kJ/mol") },
    { key: "gf", name: "Gibbs energy", predicted: true, method: `${JOBACK} Ideal gas at 298 K.`, value: (_, c, d) => unit(c?.joback?.gf, d ?? 2, "kJ/mol") },
    { key: "henry", name: "Henry's law (log)", predicted: true, method: "Henry's law constant, log10.", value: (_, c, d) => (c?.henry === undefined ? undefined : sign(c.henry, d ?? 2)) },
  ],
  [
    { key: "logp", name: "logP", predicted: true, method: CRIPPEN, value: (s, _, d) => (s.logP === undefined ? undefined : sign(s.logP, d ?? 2)) },
    { key: "mr", name: "Molar refractivity", predicted: true, method: CRIPPEN, value: (s, _, d) => unit(s.mr, d ?? 2, "cm³/mol") },
    { key: "logs", name: "logS", predicted: true, method: "Aqueous solubility, log10 of mol/L, by ESOL (Delaney, J. Chem. Inf. Comput. Sci. 2004, 44, 1000), with coefficients refitted for Crippen logP (P. Walters).", value: (_, c, d) => (c?.logS === undefined ? undefined : sign(c.logS, d ?? 2)) },
    { key: "pka", name: "pKa", predicted: true, method: "Typical pKa of each ionisable group (for a base, of its conjugate acid), from the Dimorphite-DL site table (Ropp et al., J. Cheminform. 2019, 11, 14).", value: (_, c, d) => (c?.pka.length ? c.pka.map((p) => `${sign(p.pka, d ?? 1)} (${p.kind})`).join(", ") : undefined) },
  ],
  [
    { key: "ghs", name: "Pictograms", method: GHS, value: (_, __, ___, g) => g?.pictograms.map((p) => `${PICTOGRAMS[p].name} (${p})`).join(", ") || undefined },
    { key: "signal", name: "Signal word", method: GHS, value: (_, __, ___, g) => g?.signal },
    { key: "hazards", name: "Hazard statements", method: GHS, value: (_, __, ___, g) => (g === null ? "No GHS data in PubChem" : g?.hazards.join(", ") || undefined) },
    { key: "precautions", name: "Precautionary statements", method: GHS, value: (_, __, ___, g) => g?.precautions.join(", ") || undefined },
    { key: "ghs-source", name: "Source", method: GHS, value: (_, __, ___, g) => g?.source },
    // Filled in by withSuppliers (suppliers.ts) once Find suppliers has run. It has no Add to drawing box: a supplier
    // list goes out of date, so a drawing never holds one.
    { key: "suppliers", name: "Suppliers", method: "Chemical vendors PubChem lists for the compound (pubchem.ncbi.nlm.nih.gov), found by the structure's standard InChIKey. PubChem gives no prices or pack sizes.", value: () => undefined },
    { key: "cid", name: "PubChem CID", method: "The compound's record in PubChem, found by the structure's standard InChIKey.", value: (_, __, ___, g) => g?.cid.toString() },
  ],
];

// Each row's values, one per structure, for the rows that have any. places: the decimals set for every number. ghs:
// each structure's hazards, as far as they are found.
export function propertyValues(structures: Structure[], calc?: (s: Structure, g: Graph) => Calculated | undefined, places?: number, ghs: (Ghs | null | undefined)[] = []) {
  const calculated = structures.map((s) => (s.graph && calc ? calc(s, s.graph) : undefined));
  return PROPERTY_ROWS.map((group) => group.map((row) => ({ ...row, values: structures.map((s, k) => row.value(s, calculated[k], places, ghs[k])) })).filter((r) => r.values.some((v) => v !== undefined)));
}
export type PropertyValues = ReturnType<typeof propertyValues>;
// The values with each structure's CAS number in the CAS row, in its place. No row when no structure has a number.
export function withCas(values: PropertyValues, cas: (string | undefined)[]): PropertyValues {
  const count = values.flat()[0]?.values.length ?? 0, numbers = Array.from({ length: count }, (_, k) => cas[k]);
  if (!numbers.some(Boolean)) return values;
  return values.map((g, i) => (i ? g : PROPERTY_ROWS[0].flatMap((r) => (r.key === "cas" ? [{ ...r, values: numbers }] : g.filter((x) => x.key === r.key)))));
}

// The text Add to drawing writes for the rows with these keys: each row's name and value on a line, the formula's
// counts as subscripts. k: one structure's values; unset, every structure's, separated by semicolons as in the panel.
// names false: the values alone (issue 77), a predicted one still marked, after it.
export function propertyRuns(values: PropertyValues, keys: string[], k?: number, names = true): TextRun[] {
  const runs: TextRun[] = [];
  for (const r of values.flat()) {
    const v = !keys.includes(r.key) ? undefined : k === undefined ? r.values.filter((x) => x !== undefined).join("; ") || undefined : r.values[k];
    if (v === undefined) continue;
    if (runs.length) runs.push({ text: "\n" });
    if (names) runs.push({ text: `${rowLabel(r)}: ` });
    if (r.key === "formula") for (const [, letters, digits] of v.matchAll(/(\D*)(\d*)/g)) { if (letters) runs.push({ text: letters }); if (digits) runs.push({ text: digits, script: "sub" }); }
    else runs.push({ text: v });
    if (!names && r.predicted) runs.push({ text: " (predicted)" });
  }
  return runs;
}

// A live value's rows (property.attrs.rows) are row keys, and NO_NAMES when it shows its values without their names
// (issue 77). The setting is a word in rows, as Octet 1.1.2 refuses a drawing with a key it does not know in a live
// value, and skips a word in rows that is no row key: it opens such a drawing from its own data, with the names.
export const NO_NAMES = "-names";
export const namesShown = (rows: string) => !rows.split(" ").includes(NO_NAMES);
export const withNames = (rows: string, on: boolean) => [...rows.split(" ").filter((w) => w && w !== NO_NAMES), ...(on ? [] : [NO_NAMES])].join(" ");
// Hide property names and Show property names: the live values among these captions with their names shown (on) or
// hidden; on unset, hidden while one of them shows its names. changed: the captions whose setting changed, for
// liveValues to work out their text at once.
export function nameValues(m: Mol, ids: Set<number>, on?: boolean): { mol: Mol; changed: Set<number> } {
  const show = on ?? !(m.captions ?? []).some((c) => ids.has(c.id) && c.property?.attrs.rows && namesShown(c.property.attrs.rows));
  return setLive(m, ids, (a) => (namesShown(a.rows) === show ? undefined : { ...a, rows: withNames(a.rows, show) }));
}
// Decimals on live values (issue 77): the live values among these captions with these places (0 to 8), or each row's
// own (undefined, Standard). changed: as nameValues gives it.
export function placeValues(m: Mol, ids: Set<number>, places?: number): { mol: Mol; changed: Set<number> } {
  const want = places === undefined ? undefined : String(places);
  return setLive(m, ids, ({ places: was, ...a }) => (was === want ? undefined : want === undefined ? a : { ...a, places: want }));
}
// The live values among these captions with their setting (property.attrs) changed (to: undefined when it stays), and
// the ones that changed.
function setLive(m: Mol, ids: Set<number>, to: (a: Record<string, string> & { rows: string }) => Record<string, string> | undefined): { mol: Mol; changed: Set<number> } {
  const changed = new Set<number>(), captions = m.captions?.map((c) => {
    const a = c.property?.attrs;
    if (!ids.has(c.id) || !a?.rows) return c;
    const next = to(a as typeof a & { rows: string });
    if (!next) return c;
    changed.add(c.id);
    return { ...c, property: { ...c.property!, attrs: next } };
  });
  return { mol: changed.size ? { ...m, captions } : m, changed };
}

// Live values (Add to drawing): each caption with rows of its own (property.attrs.rows) worked out again for its
// structure as it is now, with its decimals (property.attrs.places, from Add to drawing or Decimals), with or without names
// (NO_NAMES). Its structure is every atom joined to the atoms it is for, so an atom drawn on counts. A style on all of
// its text stays. values: the rows' values for those atoms, undefined when there are none (Indigo loading, or a
// structure it cannot read). only: these captions alone. Returns the drawing itself when nothing changes.
export function liveValues(m: Mol, values: (atoms: number[], places?: number) => PropertyValues | undefined, only?: Set<number>): Mol {
  if (!m.captions?.some((c) => c.property?.attrs.rows && (!only || only.has(c.id)))) return m;
  const of = new Map<number, number[]>();
  for (const g of fragments(m)) for (const i of g) of.set(i, g);
  let changed = false;
  const captions = m.captions.map((c) => {
    const p = c.property, rows = p?.attrs.rows;
    if (!p || !rows || (only && !only.has(c.id))) return c;
    const atoms = [...new Set(p.atoms.flatMap((i) => of.get(i) ?? []))].sort((a, b) => a - b), keys = rows.split(" ");
    const v = atoms.length ? values(atoms, /^[0-8]$/.test(p.attrs.places ?? "") ? Number(p.attrs.places) : undefined) : undefined, built = v ? propertyRuns(v, keys, undefined, !keys.includes(NO_NAMES)) : [];
    if (!built.length) return c;
    const { script: _, ...all } = common(runsOf(c), 0, c.text.length), runs = normalise(built.map((r) => ({ ...all, ...r }))), text = plainOf(runs);
    if (text === c.text && String(atoms) === String([...p.atoms].sort((a, b) => a - b))) return c;
    changed = true;
    const { runs: _r, ...rest } = c;
    return { ...rest, text, ...(styled(runs) ? { runs } : {}), property: { ...p, atoms } };
  });
  return changed ? { ...m, captions } : m;
}

// The report (ChemDraw's Report…): each structure's values, then each value's method and source, as text that also
// pastes into a spreadsheet (a tab between a name and its value).
export function propertyReport(values: PropertyValues, date = new Date()): string {
  const rows = values.flat(), count = Math.max(0, ...rows.map((r) => r.values.length));
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const out = ["Chemical properties", `Calculated by Octet on ${day}. Values marked (predicted) come from a model. They are not measured.`];
  for (let k = 0; k < count; k++) {
    out.push("", count > 1 ? `Structure ${k + 1}` : "Structure");
    for (const r of rows) if (r.values[k] !== undefined) out.push(`${rowLabel(r)}\t${r.values[k]}`);
  }
  out.push("", "Methods");
  for (const r of rows) if (r.method) out.push(`${rowLabel(r)}: ${r.method}`);
  return out.join("\n");
}

