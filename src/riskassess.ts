// An experiment page's risk assessment (Sam, 12 November 2026), after the experiment page of his department's lab
// book: the substances used and formed with their hazards, the significant hazards, the safety and risk implications,
// control measures, waste disposal, emergency procedures and treatment, and who signs it. It starts a page of its own
// under the experiment's first page, the same size, so Print and a PDF give it as page 2.
// It is a group of ordinary text, lines, boxes and curves, as a page spectrum is (pageplot.ts), so it saves, prints,
// exports and opens in ChemDraw as drawn. The group is integral, so it moves and deletes as one, and it keeps the record
// (Risk): the substances, the boxes ticked and the significant-hazards answer when the user changed it. Octet draws
// the parts again from the record whenever it changes (buildRisk), at the heading's place. What the user types is text
// of its own (Caption.field "risk:…"), which a click types with any tool but the Eraser, as an experiment's details
// (experiment.ts slotsOf); it keeps its text and style and moves into its place on each build.
import type { Arrow, Caption, CurvePoint, Group, Mol, Shape } from "./render.ts";
import { plainOf, runsOf, wrap, type TextRun } from "./richtext.ts";
import { PICTOGRAMS, type Ghs } from "./ghs.ts";
import { formulaRuns, MARGIN, oneLine, type Sheet, type Slot } from "./experiment.ts";

type P = [number, number];
export type Role = "reactant" | "catalyst" | "solvent" | "product";
// A substance used or formed: its key in the reagent table (gridview.ts: its formula or "text"), a number of its own
// for its typed cells (risk:cas3, risk:exp3), its name, formula and role, and its GHS hazards once found (found: Find
// hazards asked PubChem; codes: its H and EUH statement codes).
export type Substance = { id: number; key: string; name: string; formula: string; role: Role; pictograms?: string[]; signal?: string; codes?: string[]; found?: true };
// ticks: the boxes ticked, by key. significant: the significant-hazards answer the user set (unset: Octet's, from the
// codes).
export type Risk = { substances: Substance[]; ticks: string[]; significant?: boolean };
export const MAX_SUBSTANCES = 40, MAX_CODES = 60;
const ROLES: Role[] = ["reactant", "catalyst", "solvent", "product"];
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

// The boxes, by key, with their names. Each group is a row of them; the significant-hazards box is "significant".
const SAFETY = [["fire", "Fire or explosion risk", "prevention", "Prevention"], ["runaway", "Thermal runaway or gas release", "control", "Control"], ["odour", "Malodorous substances", "containment", "Containment"]] as const;
const CONTROLS = [["fume", "Fume cupboard"], ["powder", "Powder cabinet"], ["glovebox", "Glovebox or isolator"], ["lev", "Local exhaust ventilation"],
  ["coat", "Lab coat"], ["eyes", "Eye protection"], ["gloves", "Gloves"], ["gas", "Gas monitoring"]] as const;
const WASTE = [["chlorinated", "Chlorinated"], ["nonchlorinated", "Non-chlorinated"], ["store", "Waste store"], ["aqueous", "Aqueous (non-hazardous)"]] as const;
const EXTINGUISHERS = [["co2", "CO₂"], ["drypowder", "Dry powder"], ["dmetal", "L2 D-metal"]] as const;
const RESPONSE = [["spill", "Spill kit"], ["evacuate", "Evacuate area"], ["wash", "Wash down area"]] as const;
export const TICKS: string[] = ["significant", "read", ...SAFETY.map(([k]) => k), ...[...CONTROLS, ...WASTE, ...EXTINGUISHERS, ...RESPONSE].map(([k]) => k)];
// The emergency treatment, in Octet's words: what to do for each kind of exposure.
const TREATMENT: [string, string][] = [
  ["Skin, eyes or mouth: ", "flush the area with a large quantity of water. Tell a first aider."],
  ["Breathed in: ", "move to fresh air. Tell a first aider."],
  ["Swallowed: ", "tell a first aider. Get the name of the substance and get medical help immediately."],
  ["Unconscious: ", "tell a first aider immediately and call an ambulance."],
];

// Hazard statement codes from PubChem's statements ("H225 (97%): Highly flammable…", "H301+H311"), each once.
const CODE = /^(?:EUH|H)\d{3}[A-Za-z]{0,2}(?:\+(?:EUH|H)\d{3}[A-Za-z]{0,2})*/;
export const hCodes = (statements: string[]) => [...new Set(statements.map((s) => CODE.exec(s.trim())?.[0]).filter((c) => c !== undefined))].slice(0, MAX_CODES);
// The significant chemical hazards (the lab book's list): a category 1 or 2 carcinogen (H350, H350i; H351), mutagen
// (H340; H341) or reproductive toxin (H360 with F, D, f or d, H362 for breast-fed children; H361), and a respiratory
// (H334) or skin (H317) sensitiser. The book names category 1 codes only; its "Cat 1 or 2" takes in H341, H351 and
// H361 too, so Octet counts them.
const SIGNIFICANT = /^H(?:317|334|34[01]|35[01]|36[012])[A-Za-z]{0,2}$/;
export const significantCodes = (codes: string[] = []) => codes.flatMap((c) => c.split("+")).filter((c) => SIGNIFICANT.test(c));
// The substances that make the answer Yes, each with its codes that do.
export const significantOf = (r: Risk) => r.substances.map((s) => ({ name: s.name, codes: significantCodes(s.codes) })).filter((s) => s.codes.length);
export const isSignificant = (r: Risk) => r.significant ?? significantOf(r).length > 0;
export const ticked = (r: Risk, key: string) => (key === "significant" ? isSignificant(r) : r.ticks.includes(key));

// The record as a file holds it, read as hostile: each value's type checked, lists and texts limited. Undefined when
// it is not one.
export function readRisk(raw: unknown): Risk | undefined {
  const r = raw as { substances?: unknown; ticks?: unknown; significant?: unknown } | null;
  if (!r || typeof r !== "object" || !Array.isArray(r.substances) || r.substances.length > MAX_SUBSTANCES || !Array.isArray(r.ticks) || r.ticks.length > TICKS.length) return undefined;
  if (r.significant !== undefined && typeof r.significant !== "boolean") return undefined;
  const str = (v: unknown, most: number) => (typeof v === "string" && v.length <= most ? v : undefined), ids = new Set<number>(), substances: Substance[] = [];
  for (const x of r.substances as Record<string, unknown>[]) {
    const id = x?.id, key = str(x?.key, 300), name = str(x?.name, 300), formula = str(x?.formula, 200), role = x?.role as Role;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 1 || id > 1e6 || ids.has(id) || key === undefined || name === undefined || formula === undefined || !ROLES.includes(role)) return undefined;
    const pictograms = x.pictograms, codes = x.codes, signal = x.signal === undefined ? undefined : str(x.signal, 20);
    if (pictograms !== undefined && !(Array.isArray(pictograms) && pictograms.length <= 9 && pictograms.every((p) => typeof p === "string" && has(PICTOGRAMS, p)))) return undefined;
    if (codes !== undefined && !(Array.isArray(codes) && codes.length <= MAX_CODES && codes.every((c) => typeof c === "string" && c.length <= 60 && CODE.exec(c)?.[0] === c))) return undefined;
    if ((x.signal !== undefined && signal === undefined) || (x.found !== undefined && x.found !== true)) return undefined;
    ids.add(id);
    substances.push({ id, key, name: oneLine(name), formula: oneLine(formula), role, ...(pictograms ? { pictograms: [...new Set(pictograms as string[])] } : {}), ...(signal ? { signal: oneLine(signal) } : {}), ...(codes ? { codes: codes as string[] } : {}), ...(x.found ? { found: true as const } : {}) });
  }
  if (!r.ticks.every((t) => typeof t === "string" && TICKS.includes(t))) return undefined;
  return { substances, ticks: [...new Set(r.ticks as string[])], ...(r.significant !== undefined ? { significant: r.significant } : {}) };
}

// The substances in a page's reagent tables (gridview.ts gridViews): every compound in them, once each (by its InChIKey,
// else as written), with its name (name: Structure to Name for a structure; else its formula), its compound number, its
// formula, its role, and its InChIKey for the CAS number and hazards (inchi).
type Column = { key: string; what: string; formula: string; product: boolean; role?: "reactant" | "catalyst" | "solvent"; label?: string; atoms?: number[] };
export type Found = Omit<Substance, "id"> & { inchi?: string };
export function substancesOf(tables: { all: Column[] }[], name: (atoms: number[]) => string | undefined, inchi: (c: Column) => string | undefined): Found[] {
  const seen = new Set<string>(), out: Found[] = [];
  for (const c of tables.flatMap((t) => t.all)) {
    const key = inchi(c), id = key ?? c.what;
    if (seen.has(id) || out.length >= MAX_SUBSTANCES) continue;
    seen.add(id);
    const named = c.atoms ? (name(c.atoms) ?? c.formula) : (c.label ?? c.what.replace(/^"|"$/g, ""));
    out.push({ key: id.slice(0, 300), name: oneLine(c.atoms && c.label ? `${named} (${c.label})` : named), formula: oneLine(c.formula), role: c.product ? "product" : (c.role ?? "reactant"), ...(key ? { inchi: key } : {}) });
  }
  return out;
}

// The drawing's risk assessment: the first group with a record.
export const riskGroup = (m: Mol): (Group & { risk: Risk }) | undefined => m.groups?.find((g): g is Group & { risk: Risk } => !!g.risk);
const HEAD = "risk", PART = "riskpart"; // the heading's field, and every other text Octet draws
export const isRiskField = (c: Pick<Caption, "field">) => !!c.field?.startsWith("risk:");
const ids = (m: Mol) => Math.max(0, ...[...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.groups ?? [])].map((x) => x.id)) + 1;

// The nine GHS pictograms' path data as curves (subpaths), in the pictogram's frame (y down). Only what ghs.ts uses:
// M, L, C, Q, Z and arcs that are half an ellipse (a circle drawn as two halves).
export function pathCurves(d: string): { points: CurvePoint[]; closed: boolean }[] {
  const t = d.match(/[MLCQAZ]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [], out: { points: CurvePoint[]; closed: boolean }[] = [];
  let i = 0, cmd = "", cur: P = [0, 0], path: { points: CurvePoint[]; closed: boolean } | undefined;
  const n = () => Number(t[i++]), p = (): P => [n(), n()], last = () => path!.points[path!.points.length - 1];
  const cubic = (c1: P, c2: P, q: P) => { last().c2 = c1; path!.points.push({ at: q, c1: c2 }); cur = q; };
  while (i < t.length) {
    if (/^[A-Z]$/.test(t[i])) cmd = t[i++];
    if (cmd === "M") { cur = p(); out.push((path = { points: [{ at: cur }], closed: false })); cmd = "L"; continue; }
    if (!path) break;
    if (cmd === "Z") {
      path.closed = true;
      const f = path.points[0], l = last();
      if (path.points.length > 1 && Math.hypot(l.at[0] - f.at[0], l.at[1] - f.at[1]) < 1e-6) { if (l.c1) f.c1 = l.c1; path.points.pop(); }
      cmd = "";
      continue;
    }
    if (cmd === "L") { cur = p(); path.points.push({ at: cur }); }
    else if (cmd === "C") cubic(p(), p(), p());
    else if (cmd === "Q") { const c = p(), q = p(); cubic([cur[0] + (2 / 3) * (c[0] - cur[0]), cur[1] + (2 / 3) * (c[1] - cur[1])], [q[0] + (2 / 3) * (c[0] - q[0]), q[1] + (2 / 3) * (c[1] - q[1])], q); }
    else if (cmd === "A") {
      const rx = n(), ry = n(); n(); n(); const sweep = n(), q = p(), c: P = [(cur[0] + q[0]) / 2, (cur[1] + q[1]) / 2];
      const a0 = Math.atan2((cur[1] - c[1]) / ry, (cur[0] - c[0]) / rx), step = (sweep ? 1 : -1) * (Math.PI / 2), k = (4 / 3) * Math.tan(step / 4);
      const at = (a: number): P => [c[0] + rx * Math.cos(a), c[1] + ry * Math.sin(a)], dir = (a: number): P => [-rx * Math.sin(a), ry * Math.cos(a)];
      for (const a of [a0, a0 + step]) { const b = a + step, pa = at(a), pb = at(b), da = dir(a), db = dir(b); cubic([pa[0] + k * da[0], pa[1] + k * da[1]], [pb[0] - k * db[0], pb[1] - k * db[1]], a === a0 ? pb : q); }
    } else break;
  }
  return out;
}
const GHS_RED = "#B42323"; // brand/tokens.css --error: GHS draws the diamond red, as the Properties panel does

// The layout: every part Octet draws, where each typed text goes (slots), each box a click ticks, and its foot.
export type RiskLayout = { texts: Omit<Caption, "id">[]; arrows: Omit<Arrow, "id">[]; shapes: Omit<Shape, "id">[]; slots: Slot[]; ticks: { key: string; box: [number, number, number, number] }[]; moves: Map<number, { x: number; y: number; width: number }>; bottom: number };
// The parts below the heading (its first line's start, y up, in drawing units), across the page's width between its
// margins. fields: the typed texts by field.
function layout(r: Risk, fields: Map<string, Caption>, [x0, top]: P, s: Sheet): RiskLayout {
  const u = 1 / s.bond, em = s.size * u, lh = 1.25 * em, gap = 0.6 * em, pad = 0.3 * em, k = 72 / 25.4 / s.bond, W = (s.page[0] - 2 * MARGIN) * k, x1 = x0 + W, tb = 0.85 * em;
  const out: RiskLayout = { texts: [], arrows: [], shapes: [], slots: [], ticks: [], moves: new Map(), bottom: top };
  const wide = (t: string, bold = false, size = s.size) => s.measure(t, size, bold) * u;
  const lines = (runs: TextRun[], w: number, size = s.size, bold = false) => wrap(runs, w, (t, st) => wide(t, !!(st.bold ?? bold), st.size ?? size)).runs;
  const text = (runs: TextRun[] | string, x: number, y: number, more: Partial<Caption> = {}) => {
    const rs = typeof runs === "string" ? [{ text: runs }] : runs, plain = plainOf(rs), own = rs.some((x) => x.bold || x.script);
    out.texts.push({ text: plain, x, y, align: "left", chemical: false, field: PART, ...(own ? { runs: rs } : {}), ...more });
    return plain.split("\n").length;
  };
  const rule = (y: number, from = x0, to = x1) => out.arrows.push({ kind: "line", from: [from, y], to: [to, y] });
  // A typed text's place: one line (or as many as its text wraps to) from x across w, its first baseline at y. The
  // height it takes.
  const field = (key: string, x: number, y: number, w: number) => {
    const f = `risk:${key}`, c = fields.get(f), n = c ? plainOf(lines(runsOf(c), w, c.size ?? s.size, !!c.bold)).split("\n").length : 1;
    out.slots.push({ field: f, at: [x, y], box: [x - pad, y - (n - 1) * lh - 0.45 * lh, x + w + pad, y + 0.95 * em], ...(c ? { caption: c.id } : {}), text: { text: "", x, y, align: "left", chemical: false, field: f, width: w } });
    if (c) out.moves.set(c.id, { x, y, width: w });
    return n * lh;
  };
  const labelled = (label: string, key: string, y: number, from = x0, to = x1) => { const x = from + wide(label) + gap; text(label, from, y); return field(key, x, y, to - x); };
  // A box to tick, its bottom on the baseline's descent, and its name after it.
  const tick = (key: string, x: number, y: number, name?: string) => {
    const b: [number, number, number, number] = [x, y - 0.2 * em, x + tb, y - 0.2 * em + tb];
    out.shapes.push({ kind: "box", from: [b[0], b[3]], to: [b[2], b[1]] });
    out.ticks.push({ key, box: b });
    if (ticked(r, key)) {
      const points = [[0.18, 0.5], [0.4, 0.2], [0.85, 0.85]].map(([a, c]): CurvePoint => ({ at: [b[0] + a * tb, b[1] + c * tb] }));
      out.arrows.push({ kind: "curve", width: 1.2, from: points[0].at, to: points[2].at, curve: { points } });
    }
    if (name) text(name, x + tb + 0.5 * gap, y);
  };
  // Boxes in columns, each a share of the width from `from`.
  const row = (items: readonly (readonly [string, string])[], y: number, from = x0, cols = 4) => items.forEach(([key, name], j) => tick(key, from + (j % cols) * ((x1 - from) / cols), y - Math.floor(j / cols) * lh, name));
  const section = (title: string, y: number) => { rule(y); text(title, x0, y - lh, { bold: true }); return y - 2.1 * lh; };

  // The substances: name, formula, CAS number, hazards (pictograms, signal word and codes) and exposure route.
  const cols = [["Substance", 0.25], ["Formula", 0.12], ["CAS number", 0.13], ["Hazards", 0.32], ["Exposure route", 0.18]] as const, at: number[] = [];
  cols.reduce((x, [, f]) => (at.push(x), x + f * W), x0);
  const cw = (j: number) => cols[j][1] * W - gap;
  let y = top - 0.8 * lh;
  cols.forEach(([name], j) => text(name, at[j], y - em, { bold: true }));
  y -= em + 0.6 * em;
  rule(y);
  const PIC = 2.4 * em; // a pictogram's frame
  for (const sub of r.substances) {
    const base = y - em - pad, name = text(lines(formulaRuns([{ text: sub.name }]), cw(0)), at[0], base);
    if (sub.formula) text((sub.formula.match(/\d+|[^\d]+/g) ?? []).map((t) => (/^\d+$/.test(t) ? { text: t, script: "sub" as const } : { text: t })), at[1], base);
    const cas = field(`cas${sub.id}`, at[2], base, cw(2)), exp = field(`exp${sub.id}`, at[4], base, cw(4));
    const pics = sub.pictograms ?? [], across = Math.max(1, Math.floor((cw(3) + 0.05 * PIC) / (1.05 * PIC))), down = Math.ceil(pics.length / across);
    pics.forEach((code, j) => {
      const cx = at[3] + (j % across) * 1.05 * PIC + PIC / 2, cy = y - pad - Math.floor(j / across) * PIC - PIC / 2, f = PIC / 100, to = ([px, py]: P): P => [cx + px * f, cy - py * f];
      const diamond: CurvePoint[] = [{ at: to([0, -46]) }, { at: to([46, 0]) }, { at: to([0, 46]) }, { at: to([-46, 0]) }];
      out.arrows.push({ kind: "curve", colour: GHS_RED, width: 1, from: diamond[0].at, to: diamond[3].at, curve: { points: diamond, closed: true } });
      for (const [kind, d] of PICTOGRAMS[code].parts) for (const c of pathCurves(d)) {
        const points = c.points.map((q) => ({ at: to(q.at), ...(q.c1 ? { c1: to(q.c1) } : {}), ...(q.c2 ? { c2: to(q.c2) } : {}) }));
        out.arrows.push({ kind: "curve", from: points[0].at, to: points[points.length - 1].at, curve: { points, ...(c.closed ? { closed: true } : {}) }, ...(kind === "solid" ? { fill: "solid" as const } : {}) });
      }
    });
    const words = sub.codes?.length ? sub.codes.join(", ") : sub.found ? "Not classified" : "", runs: TextRun[] = [...(sub.signal ? [{ text: sub.signal + (words ? " " : ""), bold: true as const }] : []), ...(words ? [{ text: words }] : [])];
    const said = runs.length ? text(lines(runs, cw(3)), at[3], down ? y - pad - down * PIC - em : base) : 0;
    const h = Math.max(name * lh, cas, exp, down * PIC + said * lh + (down && said ? 0.3 * em : 0), lh) + 2 * pad;
    y -= h;
    rule(y);
  }
  if (!r.substances.length) { y -= lh + 2 * pad; rule(y); }

  // The significant chemical hazards: the answer, the list it is from, and the substances that make it Yes.
  y -= 1.4 * lh;
  text("Significant chemical hazards", x0, y, { bold: true });
  tick("significant", x1 - tb - wide("Yes") - 0.5 * gap, y, "Yes");
  y -= lh;
  y -= lh * text(lines([{ text: "Category 1 or 2 carcinogen, mutagen or reproductive toxin, or respiratory or skin sensitiser (H317, H334, H340, H341, H350, H351, H360, H361, H362)" }], W), x0, y);
  const from = significantOf(r);
  if (from.length) y -= lh * text(lines([{ text: "Found: ", bold: true }, ...from.flatMap((x, k) => [...formulaRuns([{ text: (k ? "; " : "") + x.name }]), { text: ` (${x.codes.join(", ")})` }])], W), x0, y);

  y = section("Safety and risk", y + 0.2 * lh);
  const mid = x0 + 0.45 * W;
  for (const [key, name, more, label] of SAFETY) {
    tick(key, x0, y, name);
    y -= ticked(r, key) || fields.has(`risk:${more}`) ? labelled(label, more, y, mid) : lh;
  }
  y -= labelled("Additional safety implications", "safety", y);

  y = section("Control measures", y + 0.2 * lh);
  row(CONTROLS, y);
  y -= 2 * lh;
  y -= labelled("Glove type", "glovetype", y);
  y -= labelled("Additional controls and special procedures", "controls", y);

  y = section("Waste disposal", y + 0.2 * lh);
  row(WASTE, y);
  y -= lh;
  y -= labelled("Other", "waste", y);

  y = section("Emergency procedures", y + 0.2 * lh);
  const ext = x0 + wide("Fire extinguisher") + 2 * gap;
  text("Fire extinguisher", x0, y);
  row(EXTINGUISHERS, y, ext, 3);
  y -= lh;
  row(RESPONSE, y, ext, 3);
  y -= lh;
  y -= labelled("Other", "emergency", y);
  y -= labelled("Who might be exposed", "exposed", y);

  y = section("Emergency treatment", y + 0.2 * lh);
  for (const [lead, rest] of TREATMENT) y -= lh * text(lines([{ text: lead, bold: true }, { text: rest }], W), x0, y);
  tick("read", x0, y, "Read and understood");
  y -= lh;
  y -= labelled("Special procedures", "special", y);

  y = section("Signatures", y + 0.2 * lh);
  const half = x0 + W / 2;
  for (const [who, key] of [["Assessor", "assessor"], ["Co-signatory", "cosignatory"]] as const) y -= Math.max(labelled(who, key, y, x0, half - gap), labelled("Signature", `${key}sign`, y, half));
  out.bottom = y;
  return out;
}

// The heading and the typed texts of a drawing's risk assessment, by field.
function partsOf(m: Mol, g: Group) {
  const items = new Set(g.items), head = m.captions?.find((c) => items.has(c.id) && c.field === HEAD);
  const fields = new Map((m.captions ?? []).filter((c) => items.has(c.id) && isRiskField(c)).map((c) => [c.field!, c]));
  return { items, head, fields };
}
// Where the risk assessment's text is typed and its boxes are ticked, and how far down it goes. Undefined with none.
export function riskLayout(m: Mol, s: Sheet): RiskLayout | undefined {
  const g = riskGroup(m), parts = g && partsOf(m, g);
  return g && parts?.head ? layout(g.risk, parts.fields, [parts.head.x, parts.head.y], s) : undefined;
}
// The drawing with its risk assessment drawn again from its record: the parts Octet draws are made again, and each
// typed text moves into its place (a typed text whose place has gone, a substance's no longer listed, goes with it).
export function buildRisk(m: Mol, s: Sheet): Mol {
  const g = riskGroup(m), parts = g && partsOf(m, g);
  if (!g || !parts?.head) return m;
  const { items, head, fields } = parts, lay = layout(g.risk, fields, [head.x, head.y], s), kept = new Set([head.id, ...lay.moves.keys()]), gone = (id: number) => items.has(id) && !kept.has(id);
  let next = ids(m);
  const made: number[] = [], id = () => (made.push(next), next++);
  const captions = [...(m.captions ?? []).filter((c) => !gone(c.id)).map((c) => { const to = lay.moves.get(c.id); return to ? { ...c, ...to } : c; }), ...lay.texts.map((c) => ({ ...c, id: id() }))];
  const shapes = [...(m.shapes ?? []).filter((x) => !gone(x.id)), ...lay.shapes.map((x) => ({ ...x, id: id() }))];
  const arrows = [...(m.arrows ?? []).filter((a) => !gone(a.id)), ...lay.arrows.map((a) => ({ ...a, id: id() }))];
  const groups = m.groups!.map((x) => (x === g ? { ...g, items: [...kept, ...made] } : x));
  return { ...m, captions, shapes, arrows, groups };
}
// A new risk assessment for the drawing, with these substances, its heading at `at` (its first line's start). None
// when the drawing has one.
export const TITLE = "Risk assessment";
export function addRisk(m: Mol, at: P, s: Sheet, substances: Omit<Substance, "id">[] = []): Mol {
  if (riskGroup(m)) return m;
  const head = ids(m), risk: Risk = { substances: substances.slice(0, MAX_SUBSTANCES).map((x, k) => ({ ...x, id: k + 1 })), ticks: [] };
  const c: Caption = { id: head, text: TITLE, x: at[0], y: at[1], bold: true, size: Math.round(1.4 * s.size * 100) / 100, align: "left", chemical: false, field: HEAD };
  return buildRisk({ ...m, captions: [...(m.captions ?? []), c], groups: [...(m.groups ?? []), { id: head + 1, atoms: [], items: [head], integral: true, risk }] }, s);
}
// Where a new risk assessment's heading goes: inside the margins at the top left of the first page wholly under what
// is drawn, the pages tiling down from the experiment's page, which is centred on the drawing's middle. bottom: the
// lowest point drawn (drawing units, y up).
export function riskPlace(s: Sheet, bottom: number): P {
  const k = 72 / 25.4 / s.bond, h = s.page[1] * k, first = (s.page[1] / 2) * k, n = Math.min(63, Math.max(1, Math.ceil((first - bottom) / h - 1e-6)));
  return [(MARGIN - s.page[0] / 2) * k, first - n * h - MARGIN * k - (1.4 * s.size) / s.bond];
}
// The drawing with its record changed (Update substances, a box ticked), drawn again.
function withRisk(m: Mol, s: Sheet, change: (r: Risk) => Risk): Mol {
  const g = riskGroup(m);
  return g ? buildRisk({ ...m, groups: m.groups!.map((x) => (x === g ? { ...g, risk: change(g.risk) } : x)) }, s) : m;
}
// A box ticked or unticked. The significant-hazards box keeps the user's answer.
export const toggleRisk = (m: Mol, key: string, s: Sheet) => withRisk(m, s, (r) => (key === "significant" ? { ...r, significant: !isSignificant(r) } : { ...r, ticks: r.ticks.includes(key) ? r.ticks.filter((t) => t !== key) : [...r.ticks, key] }));
// The substances as the reaction has them now (Update substances): each keeps its number and hazards by its key, a new
// one gets a number, and one no longer there goes with what was typed for it.
export const withSubstances = (m: Mol, list: Omit<Substance, "id">[], s: Sheet) => withRisk(m, s, (r) => {
  const had = new Map(r.substances.map((x) => [x.key, x]));
  let next = Math.max(0, ...r.substances.map((x) => x.id)) + 1;
  return { ...r, substances: list.slice(0, MAX_SUBSTANCES).map((x) => { const o = had.get(x.key); return o ? { ...o, name: x.name, formula: x.formula, role: x.role } : { ...x, id: next++ }; }) };
});
// Hazards found (Find hazards), by substance key: null for a compound PubChem has no classification for.
export const withHazards = (m: Mol, found: Record<string, Ghs | null>, s: Sheet) => withRisk(m, s, (r) => ({
  ...r, substances: r.substances.map((x) => {
    if (!has(found, x.key)) return x;
    const g = found[x.key], codes = g ? hCodes(g.hazards) : [], { pictograms: _p, signal: _s, codes: _c, ...rest } = x;
    return { ...rest, found: true as const, ...(g?.pictograms.length ? { pictograms: g.pictograms.filter((p) => has(PICTOGRAMS, p)).slice(0, 9) } : {}), ...(g?.signal ? { signal: oneLine(g.signal).slice(0, 20) } : {}), ...(codes.length ? { codes } : {}) };
  }),
}));
// CAS numbers found, by substance key: each goes in its substance's CAS cell when that cell has no text yet.
export function withCas(m: Mol, found: Record<string, string>, s: Sheet): Mol {
  const g = riskGroup(m), have = g && partsOf(m, g).fields;
  if (!g || !have) return m;
  const add = g.risk.substances.filter((x) => has(found, x.key) && oneLine(found[x.key]) && !have.has(`risk:cas${x.id}`));
  if (!add.length) return m;
  let id = ids(m);
  const made = add.map((x): Caption => ({ id: id++, text: oneLine(found[x.key]), x: 0, y: 0, align: "left", chemical: false, field: `risk:cas${x.id}` }));
  return buildRisk({ ...m, captions: [...(m.captions ?? []), ...made], groups: m.groups!.map((x) => (x === g ? { ...g, items: [...g.items, ...made.map((c) => c.id)] } : x)) }, s);
}
// After an edit: a typed text new on the page joins the risk assessment, and a typed text changed (its words, size or
// font, so the lines it takes) lays it out again. The same drawing when neither happened.
export function syncRisk(before: Mol, after: Mol, s: Sheet): Mol {
  const g = riskGroup(after);
  if (!g) return after;
  // A copy of a risk assessment pasted on the page keeps its own text.
  const items = new Set((after.groups ?? []).flatMap((x) => (x.risk ? x.items : []))), loose = (after.captions ?? []).filter((c) => isRiskField(c) && !items.has(c.id));
  const sig = (m: Mol) => JSON.stringify((m.captions ?? []).filter(isRiskField).map((c) => [c.id, c.field, c.text, c.runs, c.size, c.bold, c.font]));
  if (!loose.length && sig(before) === sig(after)) return after;
  return buildRisk(loose.length ? { ...after, groups: after.groups!.map((x) => (x === g ? { ...g, items: [...g.items, ...loose.map((c) => c.id)] } : x)) } : after, s);
}
