// Stoichiometry grids as Octet lays them out (Structure > Analyse Stoichiometry, and every reaction on an experiment
// page): a column under each reactant, each reagent drawn or written above or below an arrow (as ChemDraw's grid takes
// them, as reactants), and each product; text reagents such as H2O or MeOH too, each item of a list such as
// "NaBH4, MeOH" on its own, their molar mass from the formula or the name. The row names on the left, the amounts
// worked out from what was typed (stoich.ts). Hidden rows and columns are left out.
import { isNumber, scaleOf, type Grid, type Mol } from "./render.ts";
import { conditionItems, inert, keyColumns, reagentEquiv, solve, type Field } from "./stoich.ts";
import type { Reaction } from "./reaction.ts";
import type { Part, RoleStep } from "./interpret.ts";

// The grid's rows, as ChemDraw's: what each component is, then amounts. shown: rows that appear only once one of these
// was typed somewhere; product: rows for products (true) or reactants (false) only. Equivalents are a product's
// coefficient too, as ChemDraw's product column has them.
export const GRID_ROWS: { id: string; name: string; field?: Field; product?: boolean; shown?: Field[] }[] = [
  { id: "formula", name: "Formula" }, { id: "mw", name: "MW" }, { id: "limiting", name: "Limiting?", product: false },
  { id: "equiv", name: "Equivalents", field: "equiv" }, { id: "mass", name: "Mass", field: "mass", product: false }, { id: "moles", name: "Moles", field: "moles", product: false },
  { id: "volume", name: "Volume", field: "volume", product: false, shown: ["volume", "density", "molarity"] }, { id: "density", name: "Density", field: "density", product: false, shown: ["density"] },
  { id: "molarity", name: "Molarity", field: "molarity", product: false, shown: ["molarity"] }, { id: "purity", name: "Purity", field: "purity", shown: ["purity"] },
  { id: "expected", name: "Expected mass", product: true }, { id: "expectedMoles", name: "Expected moles", product: true },
  { id: "measured", name: "Measured mass", field: "measured", product: true }, { id: "yield", name: "Yield", product: true },
];

// What laying a grid out needs from the drawing as drawn. reaction: an arrow's reaction; steps: its parts by role
// (interpret.ts); structure: a structure's formula and molar mass; reagent: a reagent's (stoich.ts reagentFormula);
// bottom: a caption's lowest point (drawing units, y up); nameWidth: a text's width at a size in pt (drawing units);
// perPt: drawing units in a point; experiment: the drawing is an experiment page.
export type GridDeps = {
  reaction: (arrow: number) => Reaction | undefined;
  steps: (r: Reaction) => RoleStep[];
  structure: (atoms: number[]) => { formula: string; weight: number } | undefined;
  reagent: (text: string) => { formula: string; weight: number } | undefined;
  bottom: (caption: number) => number | undefined;
  nameWidth: (text: string, sizePt: number, bold?: boolean) => number;
  captionSize: number; perPt: number; experiment: boolean;
};

// One grid for each reaction (an experiment page gives each new arrow one), laid out under it.
export function gridViews(m: Mol, d: GridDeps) {
  const seen = new Set<number>();
  return (m.grids ?? []).flatMap((g: Grid) => {
    const r = d.reaction(g.arrow);
    if (!r || seen.has(r.arrows[0])) return [];
    seen.add(r.arrows[0]);
    const steps = d.steps(r);
    if (!steps.length) return [];
    // label: what names it in a table of rows, its compound number or the text it is written as. given: the
    // equivalents its text gives ("K2CO3 (2 eq.)"), shown plain until a value is typed.
    const parts: { product: boolean; what: string; formula: string; mw: number; x: number; low: number; label?: string; given?: number }[] = [];
    // conditions: only text with a molar mass makes a column ("0 °C", "2 h" and "reflux" do not).
    const add = (p: Part, product: boolean, conditions = false) => {
      const x = (p.box[0] + p.box[2]) / 2, low = p.box[1];
      if (p.kind === "structure") { const a = d.structure(p.atoms), n = m.captions?.find((c) => isNumber(c) && c.under?.some((i) => p.atoms.includes(i)))?.text; parts.push({ product, what: a?.formula ?? "?", formula: a?.formula ?? "", mw: a?.weight ?? 0, x, low, label: n }); return; }
      const text = m.captions?.find((c) => c.id === p.id)?.text ?? "", items = conditions ? conditionItems(text) : [text.trim()];
      items.forEach((item, k) => {
        const plain = item.replace(/^\d+\s+(?=\S)/, ""), got = d.reagent(item);
        // The atmosphere's gas (N2, Ar, air) is not a reagent: it has no column.
        if (conditions && (!got || inert(item))) return;
        parts.push({ product, what: `"${item}"`, formula: got?.formula ?? "", mw: got?.weight ?? 0, x: x + k * 0.01, low, label: plain, given: reagentEquiv(item) });
      });
    };
    steps[0].reactants.forEach((p) => add(p, false));
    for (const st of steps) for (const p of [...st.above, ...st.below]) add(p, false, true);
    steps[steps.length - 1].products.forEach((p) => add(p, true));
    if (!parts.length) return [];
    const keyed = keyColumns(parts, g.typed, g.limiting), all = keyed.cols, hidden = g.hidden ?? {};
    const solved = solve(all, keyed.limiting), limiting = keyed.limiting ?? all.find((c) => !c.product)?.key;
    // The grid takes its arrow's scale (decision 0007). Columns stand under what they are, a column's width apart.
    const f = scaleOf(m.arrows?.find((a) => a.id === g.arrow) ?? {}), width = 3.4 * f;
    const cols = all.filter((c) => !hidden.cols?.includes(c.key)).sort((p, q) => p.x - q.x).map((c) => ({ ...c }));
    cols.forEach((c, k) => { if (k && c.x < cols[k - 1].x + width) c.x = cols[k - 1].x + width; });
    if (!cols.length) return [];
    const used = (fd: Field) => cols.some((c) => c.typed[fd] !== undefined), products = cols.some((c) => c.product);
    // As rows, Volume, Density, Molarity and Purity show only when used, on an experiment page too, so the table fits the page.
    const rows = GRID_ROWS.filter((row) => !hidden.rows?.includes(row.id) && (row.product ? products : row.shown && (!d.experiment || g.layout === "rows") ? row.shown.some(used) : true));
    // Below the components and the numbers under them.
    const under = (m.captions ?? []).filter((c) => c.under?.some((i) => r.atoms.includes(i))).map((c) => d.bottom(c.id)).filter((y): y is number => y !== undefined);
    const top = Math.min(...cols.map((c) => c.low), ...under) - 0.9 * f, rh = d.captionSize * d.perPt * 0.9 * 1.6 * f;
    // The row names end a little before the first column; the rules start at the longest name.
    const left = Math.min(...cols.map((c) => c.x)) - width / 2 - 0.3 * f, size = d.captionSize * 0.9 * f;
    const names = Math.max(...rows.map((row) => d.nameWidth(row.name, size)));
    // Every cell: its component and row, its middle, top and width, for picking and typing in it. As rows (Grid.layout),
    // the reagents each take a row and the products a section of their own under them, each section with its title and
    // the names of its columns; the first column names each component by its compound number or its text.
    type Cell = { key: string; row: string; x: number; y: number; w: number; product: boolean };
    type Text = { text: string; x: number; y: number; anchor: "start" | "middle"; bold?: true; formula?: true };
    let cells: Cell[] = [], texts: Text[] | undefined, rules: [number, number, number][] | undefined;
    if (g.layout === "rows") {
      const wide = (t: string, bold = false) => d.nameWidth(t, size, bold);
      // A product's row: what it is, its expected mass, the mass measured and the yield; its equivalents only when typed.
      const ownEquiv = cols.some((c) => c.product && c.typed.equiv !== undefined), fits = (row: (typeof rows)[number], product: boolean) => row.product !== !product && !(product && (row.id === "expectedMoles" || (row.id === "equiv" && !ownEquiv)));
      const sections = ([[false, "Reagents"], [true, "Products"]] as const).map(([product, title]) => ({ product, title, fields: rows.filter((row) => fits(row, product)), comps: cols.filter((c) => c.product === product) })).filter((sec) => sec.comps.length && sec.fields.length);
      const x0 = Math.min(...cols.map((c) => c.x)) - width / 2, nameW = Math.max(...sections.flatMap((sec) => [wide(sec.title, true), ...sec.comps.map((c) => wide(c.label ?? ""))])) + 0.4 * f;
      let y = top;
      texts = []; rules = [];
      for (const sec of sections) {
        let x = x0 + nameW;
        const at = sec.fields.map((row) => { const w = Math.max(width, wide(row.name) + 0.4 * f); x += w; return [x - w / 2, w]; });
        rules.push([x0, x, y]);
        texts.push({ text: sec.title, x: x0, y, anchor: "start", bold: true }, ...sec.fields.map((row, j) => ({ text: row.name, x: at[j][0], y, anchor: "middle" as const })));
        y -= rh;
        rules.push([x0, x, y]);
        for (const c of sec.comps) {
          texts.push({ text: c.label ?? "", x: x0, y, anchor: "start", formula: true });
          cells.push({ key: c.key, row: "name", x: x0 + nameW / 2, y, w: nameW, product: c.product }, ...sec.fields.map((row, j) => ({ key: c.key, row: row.id, x: at[j][0], y, w: at[j][1], product: c.product })));
          y -= rh;
        }
        rules.push([x0, x, y]);
        y -= 0.5 * rh;
      }
    } else cells = rows.flatMap((row, k) => cols.map((c) => ({ key: c.key, row: row.id, x: c.x, y: top - k * rh, w: width, product: c.product })));
    return [{ arrow: g.arrow, all, cols, rows, solved, limiting, top, rh, left, width, start: left - names - 0.2 * f, f, colour: g.colour, hiding: !!(hidden.rows?.length || hidden.cols?.length), cells, texts, rules }];
  });
}
