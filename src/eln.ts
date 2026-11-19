// A reaction's reagent table as data fields, for an electronic lab notebook (issue 117, decision 0029). An RD file
// written by Octet has, after each record's rxnfile, the table's values as $DTYPE and $DATUM pairs; an SD file has
// them as data items on each compound in a table. Every quantity has its unit in its name and a plain number as its
// value. The record also carries Octet's own copy of the table, so Octet reads the same table back.
// One module for the editor and for a host with no window, so both write the same bytes.
import { cellText, keptGrid, ROLE_NAMES, type GridView } from "./gridview.ts";
import { CONDITIONS, readGrid, type Solved } from "./stoich.ts";
import { dateKey, detailsOf, FIELDS, oneLine, PROPERTIES } from "./experiment.ts";
import { fragments, nextId } from "./edit.ts";
import { isNumber, type Caption, type Grid, type Mol } from "./render.ts";
import type { Part, RoleStep } from "./interpret.ts";
import type { RxnStep } from "./chem.ts";

export type DataField = [name: string, value: string];
// A record of an RD file: its reaction and its data fields.
export type ElnRecord = { step: RxnStep; fields: DataField[] };

// The prefix of every RD field, as the CTfile specification's own RD file example names them.
export const RXN = "RXN:VARIATION(1):";
export const TABLE_FIELD = "OCTET:Reagent table";
// Hostile RD text: at most 2,000 fields a record; a value of at most 10,000 characters, and Octet's table at most
// 100,000.
export const MOST_FIELDS = 2000, MOST_VALUE = 10_000, MOST_TABLE = 100_000;

// A number as the fields write it: a point, no thousands separator, no exponent, at most 6 significant figures.
export function plain(x: number): string {
  const r = Number(x.toPrecision(6)), s = String(r);
  if (!/e/i.test(s)) return s;
  return r.toFixed(Math.min(100, Math.max(0, 5 - Math.floor(Math.log10(Math.abs(r)))))).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

// Each amount row's field: the row, its name with its unit, its value from the table's base units, and the factor to
// that unit.
type Col = GridView["all"][number];
const AMOUNTS: [string, string, (s: Solved | undefined, v: GridView) => number | undefined, number][] = [
  ["equiv", "Equivalents", (s) => s?.equiv, 1],
  ["mass", "Mass [mg]", (s) => s?.mass, 1000],
  ["moles", "Moles [mmol]", (s) => s?.moles, 1000],
  ["volume", "Volume [mL]", (s) => s?.volume, 1],
  ["density", "Density [g/mL]", (s) => s?.density, 1],
  ["molarity", "Molarity [mol/L]", (s) => s?.molarity, 1],
  ["conc", "Concentration [mol/L]", (s, v) => s?.conc ?? v.conc, 1],
  ["purity", "Purity [%]", (s) => s?.purity, 100],
  ["expected", "Expected mass [mg]", (s) => s?.expectedMass, 1000],
  ["expectedMoles", "Expected moles [mmol]", (s) => s?.expectedMoles, 1000],
  ["measured", "Measured mass [mg]", (s) => s?.measured, 1000],
  ["yield", "Yield [%]", (s) => s?.yield, 100],
];
const EXPERIMENT: (readonly [string, string])[] = [...FIELDS, ["keywords", "Keywords"]];
// Names a row of the user's own cannot take: it stays in Octet's table only.
const TAKEN = new Set(["Reaction", "Role", "Name", "Number", "Formula", "MW [g/mol]", "Limiting", ...AMOUNTS.map((a) => a[1]), ...EXPERIMENT.map((e) => e[1])]);

// One component's fields, as its column of the table shows it: what it is (Role, Name, Number, Formula, MW, Limiting),
// then each amount the table shows for it, then the rows of the user's own. A hidden row or a blanked cell writes
// nothing; a text typed over an amount leaves the amount the table works with.
function componentFields(v: GridView, c: Col): DataField[] {
  const out: DataField[] = [], put = (name: string, value?: string) => { const t = value && oneLine(value); if (t) out.push([name, t]); };
  put("Role", c.product ? "Product" : ROLE_NAMES[c.role ?? "reactant"]);
  put("Name", c.atoms ? v.text?.name?.[c.key] : c.label);
  put("Number", c.atoms ? c.label : undefined);
  put("Formula", c.formula);
  if (c.mw > 0) put("MW [g/mol]", plain(c.mw));
  if (!c.product && v.limiting === c.key) put("Limiting", "Yes");
  for (const [id, name, value, k] of AMOUNTS) {
    const row = v.rows.find((r) => r.id === id), x = row && !v.gone?.[id]?.includes(c.key) && cellText(v, c, row).text ? value(v.solved[c.key], v) : undefined;
    if (x !== undefined && Number.isFinite(x)) put(name, plain(x * k));
  }
  for (const row of v.rows) if (row.own && !v.gone?.[row.id]?.includes(c.key) && !TAKEN.has(oneLine(row.name))) put(oneLine(row.name), cellText(v, c, row).text);
  return out;
}
// The drawing's details: an experiment page's, and the document's Title, Author and Keywords. A Date that reads as one
// is written 2026-11-19.
export function experimentFields(m: Mol): DataField[] {
  const d: Record<string, string | undefined> = { ...detailsOf(m.annotations, PROPERTIES), ...detailsOf(m.annotations) };
  return EXPERIMENT.flatMap(([k, name]) => (d[k] ? [[name, k === "date" ? dateKey(d[k]!) : d[k]!] as DataField] : []));
}
// Each column's group: REACTANT, AGENT and PRODUCT count the rxnfile's own molecules (drawn before, over or under, and
// after the arrow), so a reader links each value to its molecule; REAGENT counts the text reagents, which have none.
// Counted over every column, hidden ones too, as every drawn structure is in the reaction.
function groups(v: GridView): Map<string, string> {
  const n: Record<string, number> = {}, out = new Map<string, string>();
  for (const c of v.all) { const g = !c.atoms ? "REAGENT" : c.product ? "PRODUCT" : c.side ? "AGENT" : "REACTANT"; out.set(c.key, `${g}(${(n[g] = (n[g] ?? 0) + 1)})`); }
  return out;
}
// The text over and under a table's arrows, each line its own field.
const textLines = (m: Mol, parts: Part[]) => parts.flatMap((p) => (p.kind === "text" ? (m.captions?.find((c) => c.id === p.id)?.text ?? "").split(/\r\n?|\n/).map(oneLine).filter(Boolean) : []));

// The RD fields of one table: the drawing's details, the table's conditions, each shown column's fields, the text over
// and under its arrows, and Octet's table.
function tableFields(m: Mol, v: GridView, steps: RoleStep[]): DataField[] {
  const g = m.grids?.find((x) => x.arrow === v.arrow && x.step) ?? m.grids?.find((x) => x.arrow === v.arrow), named = groups(v);
  const out: DataField[] = experimentFields(m).map(([n, x]) => [`${RXN}EXPERIMENT:${n}`, x]);
  for (const [k, name] of CONDITIONS) { const x = g?.conditions?.[k]; if (x) out.push([`${RXN}CONDITIONS:${name}`, x]); }
  for (const c of v.cols) for (const [n, x] of componentFields(v, c)) out.push([`${RXN}${named.get(c.key)}:${n}`, x]);
  textLines(m, steps.flatMap((s) => s.above)).forEach((t, k) => out.push([`${RXN}ABOVE(${k + 1})`, t]));
  textLines(m, steps.flatMap((s) => s.below)).forEach((t, k) => out.push([`${RXN}BELOW(${k + 1})`, t]));
  if (g) { const { arrow: _, at: __, free: ___, step: ____, ...rest } = keptGrid(g, v); out.push([`${RXN}${TABLE_FIELD}`, JSON.stringify(rest)]); }
  return out;
}

// The records of an RD file and the items of an SD file for a drawing's reactions (reactions: each one's steps, as
// interpret.ts reads them) and tables (gridview.ts, of the same drawing). A table is one record: its reaction is its
// columns' structures, with its fields. A step with no table is a record with no fields, as before. A table of a whole
// scheme of two or more steps comes after a record for each step, with no fields, so that every structure drawn is in
// the file; its own reaction is the scheme's first reactants, every agent and its last products. A step needs a
// reactant and a product structure. at: for a part of the drawing, each atom's index in the part; a step or table with a structure outside the
// part is left out (a table is then its steps, with no fields). items: the SD items of each atom of a compound in a
// table (the product's when it is in two).
export function elnRecords(m: Mol, reactions: RoleStep[][], views: GridView[], at?: Map<number, number>): { records: ElnRecord[]; items: Map<number, DataField[]> } {
  const records: ElnRecord[] = [], items = new Map<number, DataField[]>(), product = new Set<number>(), details = experimentFields(m);
  const map = (list: number[][]) => (at ? (list.every((g) => g.every((i) => at.has(i))) ? list.map((g) => g.map((i) => at.get(i)!)) : undefined) : list);
  const atomsOf = (list: Part[]) => list.flatMap((x) => (x.kind === "structure" ? [x.atoms] : []));
  const record = (v: GridView, steps: RoleStep[]): boolean => {
    const pick = (f: (c: Col) => boolean) => map(v.all.filter((c) => c.atoms && f(c)).map((c) => c.atoms!));
    const reactants = pick((c) => !c.product && !c.side), agents = pick((c) => !c.product && !!c.side), products = pick((c) => c.product);
    if (!reactants?.length || !products?.length || !agents) return false;
    records.push({ step: { reactants, products, agents }, fields: tableFields(m, v, steps) });
    for (const c of v.cols) {
      const atoms = c.atoms && map([c.atoms])?.[0];
      if (!atoms) continue;
      const fields: DataField[] = [["Reaction", String(records.length)], ...componentFields(v, c), ...details];
      for (const i of atoms) if (c.product || (!items.has(i) && !product.has(i))) { items.set(i, fields); if (c.product) product.add(i); }
    }
    return true;
  };
  for (const steps of reactions) {
    const own = views.filter((v) => steps.some((s) => s.arrow === v.arrow));
    const whole = own.length === 1 && !m.grids?.some((g) => g.arrow === own[0].arrow && g.step) ? own[0] : undefined;
    if (whole && steps.length === 1 && record(whole, steps)) continue;
    for (const s of steps) {
      const v = whole ? undefined : own.find((x) => x.arrow === s.arrow);
      if (v && record(v, [s])) continue;
      const step = { reactants: map(atomsOf(s.reactants)), products: map(atomsOf(s.products)), agents: map(atomsOf([...s.above, ...s.below])) };
      if (step.reactants?.length && step.products?.length && step.agents) records.push({ step: step as RxnStep, fields: [] });
    }
    if (whole && steps.length > 1) record(whole, steps);
  }
  return { records, items };
}

// A line of an RD file: one that would pass column 80 goes on at column 1 of the next line (the CTfile
// specification's rule), the break moved earlier so that no line starts with "$" and no character is split in two.
// Only a line of 80 dollar signs or more runs past column 80, to its next other character.
function wrapped(line: string): string[] {
  const chars = Array.from(line), out: string[] = [];
  let from = 0;
  while (chars.length - from > 80) {
    // A line keeps one character at least, and the first its "$DATUM " and one more.
    const least = from ? from + 1 : 8;
    let cut = from + 80;
    while (cut > least && chars[cut] === "$") cut--;
    if (chars[cut] === "$") for (cut = from + 81; cut < chars.length && chars[cut] === "$"; ) cut++;
    if (cut >= chars.length) break;
    out.push(chars.slice(from, cut).join(""));
    from = cut;
  }
  out.push(chars.slice(from).join(""));
  return out;
}
export const rdData = (fields: DataField[]) => fields.flatMap(([n, x]) => [...wrapped(`$DTYPE ${n}`), ...wrapped(`$DATUM ${x}`)]);
// SD data items: "> <name>", the value, an empty line. A name loses any < or >, and a value that starts with "$$$$"
// (the record's end) gets a space in front.
export const sdData = (fields?: DataField[]) => (fields ?? []).map(([n, x]) => `> <${n.replace(/[<>]/g, "")}>\n${x.startsWith("$$$$") ? ` ${x}` : x}\n\n`).join("");

// The fields of one RD record (its text from its first $DTYPE), as hostile input: a line that is not a $ line goes on
// the line before; a $DATUM with no $DTYPE, and a $DTYPE with no $DATUM, are skipped; control characters are taken out;
// past MOST_FIELDS fields, a name past 1000 characters, or a value past its limit, are left out.
export function readFields(text: string): DataField[] {
  const out: DataField[] = [];
  let name: string | undefined, value: string | undefined, into: "name" | "value" | undefined;
  const flush = () => {
    const n = name?.replace(/[\u0000-\u001f\u007f]/g, "").trim(), most = n === RXN + TABLE_FIELD ? MOST_TABLE : MOST_VALUE;
    if (n && n.length <= 1000 && value !== undefined && value.length <= most && out.length < MOST_FIELDS) out.push([n, value.replace(/[\u0000-\u001f\u007f]/g, "")]);
    name = value = into = undefined;
  };
  for (const line of text.split(/\r\n?|\n/)) {
    if (out.length >= MOST_FIELDS) break;
    if (line.startsWith("$DTYPE")) { flush(); name = line.slice(6).replace(/^ /, ""); into = "name"; }
    else if (line.startsWith("$DATUM")) { if (into === "name") { value = line.slice(6).replace(/^ /, ""); into = "value"; } else flush(); }
    else if (line.startsWith("$")) flush();
    else if (into === "name" && name!.length <= 1000) name += line;
    else if (into === "value" && value!.length <= MOST_TABLE) value += line;
  }
  flush();
  return out;
}

// A reaction record read back with Octet's fields: the text over and under its arrow, each compound's number under it,
// and its reagent table (readGrid, as hostile input). The compounds are matched by where they stand: before the arrow,
// over it, after it, each left to right, as Octet writes them. Fields of another program's are left in the file.
export function withRecord(part: Mol, fields: DataField[]): Mol {
  const arrow = part.arrows?.[0];
  if (!arrow || !fields.length) return part;
  const get = (n: string) => fields.find(([k]) => k === RXN + n)?.[1];
  const lines = (side: string) => fields.filter(([k]) => new RegExp(`^${RXN.replace(/[()]/g, "\\$&")}${side}\\(\\d+\\)$`).test(k)).map(([, x]) => oneLine(x)).filter(Boolean).slice(0, 50);
  const x0 = Math.min(arrow.from[0], arrow.to[0]), x1 = Math.max(arrow.from[0], arrow.to[0]), y = (arrow.from[1] + arrow.to[1]) / 2, mid = (x0 + x1) / 2;
  let id = nextId(part);
  const captions: Caption[] = [];
  const above = lines("ABOVE"), below = lines("BELOW");
  above.forEach((text, k) => captions.push({ id: id++, text, x: mid, y: y + 0.3 + 0.85 * (above.length - 1 - k), align: "centre", on: { arrow: arrow.id, side: "above" } }));
  below.forEach((text, k) => captions.push({ id: id++, text, x: mid, y: y - 0.9 - 0.85 * k, align: "centre", on: { arrow: arrow.id, side: "below" } }));
  // Each structure's group and place in it, then its number under it.
  const n: Record<string, number> = {};
  const parts = fragments(part).map((g) => { const xs = g.map((i) => part.atoms[i].location[0]), ys = g.map((i) => part.atoms[i].location[1]); return { g, x: (Math.min(...xs) + Math.max(...xs)) / 2, low: Math.min(...ys) }; })
    .sort((p, q) => p.x - q.x);
  for (const p of parts) {
    const group = p.x < x0 ? "REACTANT" : p.x > x1 ? "PRODUCT" : "AGENT", number = get(`${group}(${(n[group] = (n[group] ?? 0) + 1)}):Number`);
    const c: Caption = { id, text: oneLine(number ?? ""), x: p.x, y: p.low - 0.9, align: "centre", bold: true, under: p.g };
    if (number && isNumber(c)) { captions.push(c); id++; }
  }
  let grid: Grid | undefined;
  const raw = get(TABLE_FIELD);
  try { grid = raw ? readGrid(JSON.parse(raw), arrow.id) : undefined; } catch { grid = undefined; }
  if (grid) { const { at: _, free: __, step: ___, ...rest } = grid; grid = rest; }
  return { ...part, ...(captions.length ? { captions: [...(part.captions ?? []), ...captions] } : {}), ...(grid ? { grids: [...(part.grids ?? []), grid] } : {}) };
}

// File > More Formats > Export ELN Archive…: The ELN Consortium's .eln file, which eLabFTW, RSpace, Kadi4Mat and other
// notebooks import. A zip (src-tauri/src/export.rs make_eln) of one folder, named as the drawing, holding
// ro-crate-metadata.json (RO-Crate 1.2) and one dataset, the experiment, with the drawing's files: the .oct, the CDXML,
// and the RD and SD files with the reagent tables (when the drawing has them). The dataset takes the drawing's Title,
// Author and Keywords, and every detail as a value (variableMeasured). Each file is a path in the zip and its text.
const TYPES: Record<string, string> = { oct: "application/xml", cdxml: "chemical/x-cdxml", rdf: "chemical/x-mdl-rdfile", sdf: "chemical/x-mdl-sdfile" };
export function elnArchive(name: string, m: Mol, files: Partial<Record<"oct" | "cdxml" | "rdf" | "sdf", string>>, now = new Date()): [string, string][] {
  const stem = Array.from(name.replace(/\.oct(et)?$/i, "").replace(/[\u0000-\u001f\u007f/\\:?*"<>|]/g, "").trim()).slice(0, 60).join("").replace(/^\.+|[.\s]+$/g, "").trim() || "Untitled";
  // An @id is a relative URI: each part of the path percent-encoded (a space is %20). The zip's paths stay as written.
  const uri = encodeURIComponent(stem);
  const d: Record<string, string | undefined> = { ...detailsOf(m.annotations, PROPERTIES), ...detailsOf(m.annotations) }, date = now.toISOString();
  const kept = (Object.entries(files) as [string, string | undefined][]).filter((e): e is [string, string] => !!e[1]);
  const parts = kept.map(([ext, text]) => ({ "@id": `./${uri}/${uri}.${ext}`, "@type": "File", name: `${stem}.${ext}`, encodingFormat: TYPES[ext], contentSize: String(new TextEncoder().encode(text).length), dateCreated: date }));
  const values = experimentFields(m).map(([k, v], i) => ({ "@id": `#detail-${i + 1}`, "@type": "PropertyValue", propertyID: k, value: v }));
  const author = d.author ? [{ "@id": "#author", "@type": "Person", name: d.author }] : [];
  const octet = { "@id": "https://octet.software", "@type": "Organization", name: "Octet", url: "https://octet.software" };
  const graph = [
    { "@id": "ro-crate-metadata.json", "@type": "CreativeWork", about: { "@id": "./" }, conformsTo: { "@id": "https://w3id.org/ro/crate/1.2" }, dateCreated: date, sdPublisher: { "@id": octet["@id"] } },
    { "@id": "./", "@type": "Dataset", name: stem, datePublished: date, hasPart: [{ "@id": `./${uri}/` }] },
    { "@id": `./${uri}/`, "@type": "Dataset", name: d.title ?? stem, dateCreated: date, hasPart: parts.map((p) => ({ "@id": p["@id"] })),
      ...(author.length ? { author: { "@id": "#author" } } : {}), ...(d.keywords ? { keywords: d.keywords } : {}), ...(values.length ? { variableMeasured: values.map((v) => ({ "@id": v["@id"] })) } : {}) },
    ...parts, ...values, ...author, octet,
  ];
  const crate = JSON.stringify({ "@context": "https://w3id.org/ro/crate/1.2/context", "@graph": graph }, null, 2);
  return [[`${stem}/ro-crate-metadata.json`, crate], ...kept.map(([ext, text]): [string, string] => [`${stem}/${stem}/${stem}.${ext}`, text])];
}
