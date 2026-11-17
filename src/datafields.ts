// Data fields on structures (issue 68, docs/plans/issue-68-data-fields.md): a name and a value on a structure, such as
// an internal number, a batch or a melting point. Mol.data is one ordered list. A field belongs to every structure that
// holds one of its atoms, so a structure split in two keeps it on both pieces and two structures joined have both
// lists. Shown, its value is the text of a caption tied under the structure (ChemDraw's attached data); not shown, the
// field holds its value (ChemDraw's annotation on a structure, an SD file's data item). Every rule is here: the
// cleaners and limits, a structure's fields, the dialog's rows, Select Linked Objects, the SD data reader and writer,
// and the forms the files keep.
import { addCaption, deleteGraphics, fragments } from "./edit.ts";
import type { Caption, DataField, Mol } from "./render.ts";

// A name is 1 to 200 characters on one line (the longest property name Octet 1.1.2 keeps). A value is up to 10,000
// characters; one over 2,000 cannot be shown (the longest caption Octet 1.1.2 reads). A structure has up to 1,000
// fields and a drawing up to 10,000.
export const MAX_NAME = 200, MAX_VALUE = 10_000, MAX_SHOWN = 2_000, MAX_EACH = 1_000, MAX_DATA = 10_000;
// A field from a file with no name.
export const NO_NAME = "Data";
// ChemDraw's attached data: a live property of type 23, its Name the field's name.
export const ATTACHED = "23";

// A name as Octet keeps it: one line, no control characters, no < or > (an SD file's header holds the name between
// them). Empty when nothing is left.
export const cleanName = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
// A value as Octet keeps it: line breaks as \n (a CR dropped), a tab a space, no other control characters, no empty
// lines at its start or end. Undefined when it is over the limit: a value is left out whole, never cut.
export function cleanValue(s: string): string | undefined {
  if (s.length > 4 * MAX_VALUE) return undefined;
  const lines = s.replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").split("\n");
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  const v = lines.slice(a, b).join("\n");
  return v.length > MAX_VALUE ? undefined : v;
}

// The ids of the captions that show a field's value.
export const fieldCaptions = (m: Pick<Mol, "data">) => new Set((m.data ?? []).flatMap((f) => (f.caption === undefined ? [] : [f.caption])));
// The field a caption shows, by its place in the list; -1 when it shows none.
export const fieldOfCaption = (m: Pick<Mol, "data">, id: number) => m.data?.findIndex((f) => f.caption === id) ?? -1;
// A field's value: its caption's text when it is shown.
export const valueOf = (m: Pick<Mol, "captions">, f: DataField) => (f.caption === undefined ? f.value ?? "" : m.captions?.find((c) => c.id === f.caption)?.text ?? "");
// The fields of a structure (any of its atoms), by their places in the list, in list order.
export function fieldsOn(m: Pick<Mol, "data">, atoms: Iterable<number>): number[] {
  if (!m.data?.length) return [];
  const s = atoms instanceof Set ? atoms as Set<number> : new Set(atoms);
  return m.data.flatMap((f, k) => (f.atoms.some((i) => s.has(i)) ? [k] : []));
}

// The fields with their atoms renumbered (an atom `at` maps to undefined is gone; `at` never maps two atoms to one)
// and their captions' ids renumbered (one mapped to undefined is gone, and its field shows no longer: it takes the text
// it showed, from text). A field with no atom left goes. Undefined for an empty list.
export function remapData(data: DataField[] | undefined, at: (i: number) => number | undefined, caption?: (id: number) => number | undefined, text?: (id: number) => string | undefined): DataField[] | undefined {
  if (!data?.length) return undefined;
  // Fields made together share their atom list, which is renumbered once (an edit's cost is one pass over the lists).
  const out: DataField[] = [], done = new Map<number[], number[]>();
  for (const f of data) {
    let atoms = done.get(f.atoms);
    if (!atoms) {
      const next: number[] = [];
      let same = true;
      for (const i of f.atoms) { const j = at(i); if (j !== undefined) next.push(j); if (j !== i) same = false; }
      atoms = same ? f.atoms : next;
      done.set(f.atoms, atoms);
    }
    if (!atoms.length) continue;
    if (f.caption === undefined || !caption) { out.push(atoms === f.atoms ? f : { ...f, atoms }); continue; }
    const id = caption(f.caption);
    out.push(id !== undefined ? { name: f.name, atoms, caption: id } : { name: f.name, atoms, value: text?.(f.caption) ?? "" });
  }
  return out.length ? out : undefined;
}
// One row of Attach Data's dialog: a field's name, value and whether it is shown. key: the field's place in the list,
// for a row that was there when the dialog opened.
export type DataRow = { name: string; value: string; show: boolean; key?: number };
export const rowsOf = (m: Mol, atoms: Iterable<number>): DataRow[] => fieldsOn(m, atoms).map((k) => ({ name: m.data![k].name, value: valueOf(m, m.data![k]), show: m.data![k].caption !== undefined, key: k }));

// A structure's fields set from the dialog's rows (or the MCP's), as one change. A row with no name is left out. A
// shown row's value is its caption's text: a new one is tied under the structure, in the document's caption style; a
// row no longer shown loses its caption. A field the structure shares with another (it was split) is first copied, so
// the other keeps it as it was. A value too long to show is not shown. The same drawing comes back when nothing changes.
export function setRows(m: Mol, structure: number[], rows: DataRow[]): Mol {
  const s = new Set(structure);
  const clean = rows.flatMap((r) => {
    const name = cleanName(r.name).slice(0, MAX_NAME), value = cleanValue(r.value) ?? cleanValue(r.value.slice(0, MAX_VALUE)) ?? "";
    return name ? [{ ...r, name, value, show: r.show && value.length <= MAX_SHOWN }] : [];
  }).slice(0, MAX_EACH);
  const now = rowsOf(m, s);
  if (clean.length === now.length && clean.every((r, k) => r.key === now[k].key && r.name === now[k].name && r.value === now[k].value && r.show === now[k].show)) return m;
  const data = [...(m.data ?? [])], mine = fieldsOn(m, s), at = mine.length ? mine[0] : data.length;
  const captions = new Map((m.captions ?? []).map((c) => [c.id, c]));
  // Each field of this structure as this structure's own: a field it shares with another structure stays there (with
  // its caption when that is tied under the other structure), and this structure gets a copy.
  const own = new Map<number, DataField>(), kept: DataField[] = [];
  for (const k of mine) {
    const f = data[k], inside = f.atoms.filter((i) => s.has(i)), outside = f.atoms.filter((i) => !s.has(i));
    if (!outside.length) { own.set(k, f); continue; }
    const c = f.caption === undefined ? undefined : captions.get(f.caption), theirs = !!c?.under?.length && !s.has(c.under[0]);
    kept.push(theirs ? { name: f.name, atoms: outside, caption: f.caption } : { name: f.name, atoms: outside, value: valueOf(m, f) });
    own.set(k, theirs ? { name: f.name, atoms: inside, value: valueOf(m, f) } : { ...f, atoms: inside });
  }
  // The rows as fields: one kept updates its field, a new one is a field of the whole structure.
  let out: Mol = m;
  const made: DataField[] = [], atoms = [...s].sort((p, q) => p - q);
  for (const r of clean) {
    const was = r.key === undefined ? undefined : own.get(r.key);
    const base = { name: r.name, atoms: was?.atoms ?? atoms };
    if (!r.show) { made.push({ ...base, value: r.value }); continue; }
    if (was?.caption !== undefined && captions.has(was.caption)) {
      if (captions.get(was.caption)!.text !== r.value) out = { ...out, captions: out.captions!.map((c) => (c.id === was.caption ? withText(c, r.value) : c)) };
      made.push({ ...base, caption: was.caption });
      continue;
    }
    const xs = atoms.map((i) => m.atoms[i].location[0]), ys = atoms.map((i) => m.atoms[i].location[1]);
    const [next, id] = addCaption(out, { text: r.value, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) - 1, under: atoms, chemical: false });
    out = next;
    made.push({ ...base, caption: id });
  }
  // Captions of fields no longer shown, or no longer there, go.
  const gone = new Set([...own.values()].flatMap((f) => (f.caption !== undefined && !made.some((x) => x.caption === f.caption) ? [f.caption] : [])));
  // The structure's fields go where its first one was (others before it keep their places).
  const others = data.filter((_, k) => !own.has(k)), list = [...others.slice(0, at), ...kept, ...made, ...others.slice(at)];
  out = { ...out, data: list.length ? list : undefined };
  return gone.size ? deleteGraphics(out, gone) : out;
}
// A caption with new text, its own runs dropped (they were the old text's).
const withText = (c: Caption, text: string): Caption => { const { runs: _, auto: __, ...rest } = c; return { ...rest, text }; };

// Select Linked Objects on a field's text: the structures its field belongs to, and the text.
export function linked(m: Mol, caption: number): { atoms: number[]; items: number[] } | undefined {
  const fs = (m.data ?? []).filter((f) => f.caption === caption);
  if (!fs.length) return undefined;
  const of = new Set(fs.flatMap((f) => f.atoms)), atoms = fragments(m).filter((g) => g.some((i) => of.has(i))).flat().sort((p, q) => p - q);
  return { atoms, items: [caption] };
}

// The fields as the files keep a shown one, for writing: its caption carries ChemDraw's attached-data property (type
// 23, its Name and atoms), which ChemDraw reads and Octet 1.1.2 keeps.
export function withProperties(m: Mol): Mol {
  if (!m.data?.some((f) => f.caption !== undefined)) return m;
  const shown = new Map(m.data.flatMap((f) => (f.caption === undefined ? [] : [[f.caption, f] as const])));
  return { ...m, captions: m.captions?.map((c) => { const f = shown.get(c.id); return f ? { ...c, property: { attrs: { ChemicalPropertyType: ATTACHED, Name: f.name }, atoms: f.atoms } } : c; }) };
}
// As read from a file: a caption with an attached-data property is a shown field (one no field names comes after the
// others), and the property itself is the field's, so the caption loses it. A field's text is never chemistry.
export function fromProperties(m: Mol): Mol {
  const attached = (c: Caption) => c.property?.attrs.ChemicalPropertyType === ATTACHED;
  if (!m.captions?.some(attached)) return m;
  const named = fieldCaptions(m), data = [...(m.data ?? [])];
  const captions = m.captions.map((c) => {
    if (!attached(c)) return c;
    if (!named.has(c.id) && data.length < MAX_DATA) data.push({ name: cleanName(c.property!.attrs.Name ?? "").slice(0, MAX_NAME) || NO_NAME, atoms: [...c.property!.atoms], caption: c.id });
    const { property: _, ...rest } = c;
    return { ...rest, chemical: false as const };
  });
  return { ...m, captions, data: data.length ? data : undefined };
}

// Octet's own file: the fields as written, a shown one naming its caption by its place in the list (as groups do).
export function writeData(m: Mol, captions: Caption[]): ({ name: string; atoms: number[]; value: string } | { name: string; atoms: number[]; caption: number })[] {
  return (m.data ?? []).flatMap((f): ({ name: string; atoms: number[]; value: string } | { name: string; atoms: number[]; caption: number })[] => {
    if (f.caption === undefined) return [{ name: f.name, atoms: f.atoms, value: f.value ?? "" }];
    const k = captions.findIndex((c) => c.id === f.caption);
    return k >= 0 ? [{ name: f.name, atoms: f.atoms, caption: k }] : [];
  });
}
// Octet's own file's fields, read as hostile: an entry that is not sound is left out (and counted), and the drawing
// opens. At most MAX_DATA. captions: the drawing's captions as read, in the file's order.
export function readData(v: unknown, atoms: number, captions: Caption[]): { data?: DataField[]; left: number } {
  if (!Array.isArray(v)) return { left: v === undefined ? 0 : 1 };
  const data: DataField[] = [], taken = new Set<number>();
  let left = Math.max(0, v.length - MAX_DATA);
  for (const x of v.slice(0, MAX_DATA) as Record<string, unknown>[]) {
    const name = typeof x?.name === "string" && x.name.length <= MAX_NAME ? cleanName(x.name) : "", list = x?.atoms;
    const sound = name && Array.isArray(list) && list.length && list.length <= atoms && list.every((i) => Number.isInteger(i) && i >= 0 && i < atoms);
    const value = typeof x?.value === "string" ? cleanValue(x.value) : undefined, at = x?.caption;
    const shown = Number.isInteger(at) && (at as number) >= 0 && (at as number) < captions.length && !taken.has(at as number) && captions[at as number].text.length <= MAX_SHOWN;
    if (!sound || (value === undefined) === !shown) { left++; continue; }
    const ids = [...new Set(list as number[])];
    if (shown) { taken.add(at as number); data.push({ name, atoms: ids, caption: captions[at as number].id }); } else data.push({ name, atoms: ids, value });
  }
  return { ...(data.length ? { data } : {}), left };
}

// SD files. A record's data items come after its molfile's M  END: "> <name>", the value's lines, and an empty line.
// Written: every field of the structure, shown or not, in list order. A value's empty lines and lines that start with
// $$$$ are left out (each would end the item or the record). An empty value is its header and the empty line. Each
// structure's items (groups: each structure's atoms) are worked out in one pass over the fields.
export function sdRecordItems(m: Mol, groups: number[][]): string[] {
  const out = groups.map(() => "");
  if (!m.data?.length) return out;
  const of = new Map<number, number>();
  groups.forEach((g, k) => { for (const i of g) of.set(i, k); });
  for (const f of m.data) {
    const lines = valueOf(m, f).split("\n").filter((l) => l.trim() && !l.startsWith("$$$$")), item = `> <${f.name}>\n${lines.map((l) => `${l}\n`).join("")}\n`;
    for (const k of new Set(f.atoms.map((i) => of.get(i)).filter((k) => k !== undefined))) out[k] += item;
  }
  return out;
}
// An SD file's records, each with its atom count (from its counts line, V2000 or V3000) and its data items, read in
// one pass. A header with no <name> is left out; an empty name is NO_NAME. A value over the limit, and items past
// MAX_EACH on a record, are left out. left: how many items were left out.
export type SdRecord = { atoms: number; items: { name: string; value: string }[] };
export function readSd(text: string): { records: SdRecord[]; left: number } {
  const records: SdRecord[] = [];
  let left = 0, rec: SdRecord | undefined, line = 0, ended = false, item: { name?: string; lines: string[]; size: number } | undefined;
  const finish = () => {
    if (!item || !rec) return void (item = undefined);
    const value = item.size > 4 * MAX_VALUE ? undefined : cleanValue(item.lines.join("\n"));
    if (item.name === undefined || value === undefined || rec.items.length >= MAX_EACH) left++;
    else rec.items.push({ name: item.name, value });
    item = undefined;
  };
  for (const raw of text.split(/\r\n|\r|\n/)) {
    if (/^\$\$\$\$/.test(raw)) { finish(); if (rec) records.push(rec); rec = undefined; line = 0; ended = false; continue; }
    if (!rec) rec = { atoms: 0, items: [] };
    line++;
    if (!ended) {
      // The counts line (V2000: the fourth line's first three columns) or V3000's COUNTS.
      if (line === 4 && /V2000/.test(raw)) rec.atoms = Number(raw.slice(0, 3)) || 0;
      const v3 = /^M {2}V30 COUNTS (\d+)/.exec(raw);
      if (v3) rec.atoms = Number(v3[1]);
      if (/^M {2}END/.test(raw)) ended = true;
      continue;
    }
    if (item) {
      if (!raw.trim()) { finish(); continue; }
      item.size += raw.length;
      if (item.size <= 4 * MAX_VALUE) item.lines.push(raw);
      continue;
    }
    if (raw.startsWith(">")) {
      const named = /<([^>]*)>/.exec(raw);
      item = { name: named ? (cleanName(named[1]).slice(0, MAX_NAME + 1) || NO_NAME) : undefined, lines: [], size: 0 };
      if (item.name !== undefined && item.name.length > MAX_NAME) item.name = undefined;
    }
  }
  finish();
  // A last record with no $$$$ (a molfile with data items) counts when it has a molfile.
  if (rec && ended) records.push(rec);
  return { records, left };
}
// The records' items as fields, on a drawing whose structures came from those records in order, each record's atoms
// in a row (Indigo reads each record's molecules in turn; a record with no atoms has none). sizes: the atoms of each
// molecule read, in order. A record whose atoms do not add up to whole molecules leaves its items out (counted).
export function fieldsFromRecords(records: SdRecord[], sizes: number[]): { data?: DataField[]; left: number } {
  const data: DataField[] = [];
  let left = 0, mol = 0, base = 0;
  for (const r of records) {
    if (!r.atoms) { left += r.items.length; continue; }
    let n = 0;
    const start = base;
    while (n < r.atoms && mol < sizes.length) { n += sizes[mol]; base += sizes[mol]; mol++; }
    if (n !== r.atoms) { left += r.items.length; continue; }
    const atoms = Array.from({ length: n }, (_, k) => start + k);
    for (const it of r.items) {
      if (data.length >= MAX_DATA) { left++; continue; }
      data.push({ name: it.name, atoms, value: it.value });
    }
  }
  return { ...(data.length ? { data } : {}), left };
}

// What a reader left out, by the drawing it read: said as "Octet left out 3 data fields." (oct.ts lostText).
const leftOut = new WeakMap<Mol, number>();
export const markLeft = (m: Mol, n: number) => { if (n > 0) leftOut.set(m, n); return m; };
export const leftOf = (m: Mol): Record<string, number> => { const n = leftOut.get(m); return n ? { "data field": n } : {}; };

// An AI app's change to a structure's fields (mcp.ts edit's data), checked whole before anything changes: a name sets
// the first field of that name (a new field when there is none) with its value and whether it is shown; remove takes
// every field of that name off. Gives the drawing, or why nothing changed.
export type DataChange = { name: string; value?: string; show?: boolean; remove?: boolean };
export function changeData(m: Mol, structure: number[], changes: DataChange[]): Mol | string {
  if (changes.length > 100) return "give at most 100 data fields at once";
  let rows = rowsOf(m, structure);
  for (const c of changes) {
    const name = cleanName(c.name);
    if (!name || name !== c.name.trim() || name.length > MAX_NAME) return `a data field's name has 1 to ${MAX_NAME} characters on one line, with no < or >: not ${JSON.stringify(c.name.slice(0, 40))}`;
    if (c.remove) {
      if (!rows.some((r) => r.name === name)) return `it has no data field ${name}`;
      rows = rows.filter((r) => r.name !== name);
      continue;
    }
    const value = c.value === undefined ? undefined : cleanValue(c.value);
    if (c.value !== undefined && value === undefined) return `${name}'s value is over ${MAX_VALUE.toLocaleString("en-GB")} characters`;
    const k = rows.findIndex((r) => r.name === name), was = k >= 0 ? rows[k] : undefined, row = { ...(was ?? { name, value: "", show: false }), ...(value !== undefined ? { value } : {}), ...(c.show !== undefined ? { show: c.show } : {}) };
    if (row.show && row.value.length > MAX_SHOWN) return `${name}'s value is over ${MAX_SHOWN.toLocaleString("en-GB")} characters, too long to show`;
    if (k >= 0) rows = rows.map((r, j) => (j === k ? row : r));
    else if (rows.length >= MAX_EACH) return `a structure has at most ${MAX_EACH.toLocaleString("en-GB")} data fields`;
    else rows = [...rows, row];
  }
  return setRows(m, structure, rows);
}
// A structure's fields as an AI app reads them: name, value, and shown when it is. A summary cuts each value at 200
// characters and lists 100 fields at most.
export function readFields(m: Mol, structure: number[], full: boolean): { data?: { name: string; value: string; shown?: true }[]; data_more?: number } {
  const ks = fieldsOn(m, structure);
  if (!ks.length) return {};
  const list = (full ? ks : ks.slice(0, 100)).map((k) => { const f = m.data![k], v = valueOf(m, f); return { name: f.name, value: full || v.length <= 200 ? v : `${v.slice(0, 199)}…`, ...(f.caption !== undefined ? { shown: true as const } : {}) }; });
  return { data: list, ...(ks.length > list.length ? { data_more: ks.length - list.length } : {}) };
}
// A structure's fields moved to the structure that replaced it (mcp.ts replaceStructure), a shown one with its text
// (captions: each old caption's id, now).
export function movedFields(m: Mol, from: number[], to: number[], captions: Map<number, number>): DataField[] {
  return fieldsOn(m, from).map((k) => { const f = m.data![k], id = f.caption === undefined ? undefined : captions.get(f.caption); return id !== undefined ? { name: f.name, atoms: to, caption: id } : { name: f.name, atoms: to, value: valueOf(m, f) }; });
}
