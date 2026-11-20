// What a drawing holds at most, so that every drawing the editor makes saves and opens again whole
// (docs/plans/long-text.md): the counts Octet's own readers keep, and the text that keeps a drawing within the 64 MB
// Octet saves. The editor refuses an edit that takes a count past its limit (overLimit, in Editor.tsx set), and the
// readers leave out what is past it and count it (withinEach, withinText).
import { capNotes, MAX_ANNOTATIONS, MAX_NOTES } from "./annotate.ts";
import { MAX_DATA, MAX_EACH } from "./datafields.ts";
import { bondsMadeFrom, deleteGraphics } from "./edit.ts";
import { MAX_GRIDS, stamped } from "./experiment.ts";
import { MOST_OWN_MONOMERS, type OwnMonomer } from "./monomers.ts";
import type { Annotation, Caption, DataField, Grid, Group, Mol, Shape } from "./render.ts";

export const MAX_ATOMS = 100_000;
// Texts, arrows, shapes, cycles, ring fills and groups, each. A text's length is MAX_TEXT (richtext.ts).
export const MAX_OBJECTS = 10_000;

// --- Text ---------------------------------------------------------------------------------------------------------------
// The text a drawing holds: what MAX_TEXT and MAX_VALUE let grow, the characters of its texts, notes, data fields,
// table cells and their style runs, risk assessment texts, reagent tables and a sequence's own monomers. Each counts
// as the most bytes it takes in any form Octet writes (.oct, .cdx, CDXML, the recovery copy), in characters of 9 bytes
// (" in a .oct takes 8.7, the most): a style run counts RUN (309 bytes with a size of 19 digits) and its font's name,
// as a text's own font does (4 bytes a character at most), a table cell's character and a shown field's name's 2 (16
// and 11 bytes), a table cell's style run CELL_RUN (370 bytes with every style), and a monomer's code, name and SMILES 2
// a character (a file's may hold a control character, which JSON writes as \u0001: 14 bytes in a .oct) and its record
// MONOMER (120 bytes). A field not shown is written in each structure it is on, so its name and value and its record
// (FIELD, 88 bytes) count once for each. So text takes 45 MB at most: a drawing of text alone saves within 64 MB
// (main.rs MAX_BYTES), with 10,000 texts that have every style, each with a note and a shown data field
// (longtext-stress L19). The rest of a drawing (structures, curves, pictures, spectra, a table's own cells) is not
// counted: Save refuses a drawing larger than 64 MB, as before, and the recovery copy kept last stays
// (docs/plans/long-text.md).
export const MAX_CHARACTERS = 5_000_000;
const RUN = 35, FIELD = 12, CELL_RUN = 42, MONOMER = 14;
// A list's text, kept for the list: an edit that makes no new list costs nothing, and one that does a pass over it.
function part<T>(f: (x: T) => number) {
  const done = new WeakMap<T[], number>();
  return (l?: T[]) => {
    if (!l?.length) return 0;
    let n = done.get(l);
    if (n === undefined) { n = 0; for (const x of l) n += f(x); done.set(l, n); }
    return n;
  };
}
const kept = <K extends object>(cache: WeakMap<K, number>, k: K, f: (k: K) => number) => { let n = cache.get(k); if (n === undefined) cache.set(k, (n = f(k))); return n; };
const noteText = (a: Annotation) => a.keyword.length + a.content.length;
const notesOf = part<Annotation>(noteText);
const runsText = (l: { text: string; font?: string }[]) => l.reduce((n, r) => n + r.text.length + RUN + (r.font?.length ?? 0), 0);
const tables = new WeakMap<NonNullable<Shape["table"]>, number>(), risks = new WeakMap<NonNullable<Group["risk"]>, number>(), grids = new WeakMap<Grid, number>();
const captionText = (c: Caption) => (c.runs ? runsText(c.runs) : c.text.length) + (c.font?.length ?? 0);
const captionsText = part<Caption>((c) => captionText(c) + notesOf(c.notes));
const arrowsText = part<{ notes?: Annotation[] }>((x) => notesOf(x.notes)), cyclesText = part<{ notes?: Annotation[] }>((x) => notesOf(x.notes));
const shapesText = part<Shape>((s) => notesOf(s.notes) + (s.table ? kept(tables, s.table, (t) => t.cells.reduce((n, row, r) => n + row.reduce((k, c, j) => k + 2 * c.length + CELL_RUN * (t.runs?.[r]?.[j]?.length ?? 0), 0), 0)) : 0));
const groupsText = part<Group>((g) => notesOf(g.annotations) + (g.risk?.texts ? kept(risks, g.risk, (r) => Object.values(r.texts!).reduce((n, l) => n + runsText(l), 0)) : 0));
const gridsText = part<Grid>((g) => kept(grids, g, (x) => JSON.stringify(x).length));
// A sequence's own monomers (issue 27): 500 of 2,092 characters (a code of 12, a name of 80, SMILES of 2,000) take up to
// 14 MB in a .oct, so they count.
const monomersText = part<OwnMonomer>((x) => MONOMER + 2 * (x.code.length + (x.name?.length ?? 0) + x.smiles.length));
// A field's text in one structure: its name and value (a shown field's value is its text's), and a record.
const fieldText = (f: DataField) => (f.caption !== undefined ? 2 * f.name.length : f.name.length + (f.value?.length ?? 0) + FIELD);
// At most: a field not shown in as many structures as it has atoms.
const fieldsMost = part<DataField>((f) => fieldText(f) * (f.caption !== undefined ? 1 : f.atoms.length));
// The drawing's text but its fields' (what the drawing's lists hold).
const restOf = (m: Mol) => captionsText(m.captions) + notesOf(m.annotations) + arrowsText(m.arrows) + cyclesText(m.cycles) + shapesText(m.shapes) + groupsText(m.groups) + gridsText(m.grids) + monomersText(m.monomers);
// The drawing's text, in characters of 9 bytes (MAX_CHARACTERS): at most that, and exactly that when it is past
// MAX_CHARACTERS. The fields' text is worked out from their structures only when the most it can be (each field not
// shown in a structure of its own for each atom) takes the drawing past it. was: the drawing before an edit (fieldsOf).
export function textOf(m: Mol, was?: Mol): number {
  const rest = restOf(m), most = fieldsMost(m.data);
  if (!m.data?.length || rest + most <= MAX_CHARACTERS) return rest + most;
  const n = rest + fieldsOf(m, was).text;
  return n <= MAX_CHARACTERS ? n : rest + fieldsOf(m, was, true).text;
}

// --- Structures ---------------------------------------------------------------------------------------------------------
// Each atom's structure, by its first atom (atoms joined by bonds, or by a ligand's link to its centre, as edit.ts
// fragments finds them), kept for the drawing's bonds and number of atoms (an edit that moves atoms keeps them). Only a
// drawing with more than MAX_EACH data fields, or whose fields' text could take it past MAX_CHARACTERS, needs them.
// Worked out whole, they take one pass over the bonds and atoms (1 to 1.5 ms on 100,000 atoms). An edit that keeps the
// bonds of the drawing before it (was) and adds atoms and bonds (a bond drawn, a paste, a bond's order changed) takes
// was's and joins only what it added. A bond drawn, a paste and a bond tool on a bond say so (edit.ts bondsMadeFrom);
// for another edit, a pass compares the two lists of bonds, reading no bond (0.1 to 0.3 ms on 100,000 atoms). A link
// to a centre is made or changed with the bonds' order changed (edit.ts ligand) or on an atom that had one (a
// template's point), so was's links are compared only where it had them (centred). The structures are kept in a buffer
// that an edit adding atoms fills on (was's part stays as it was): used, how much of it a drawing took last. fields:
// what the data fields on these structures hold (fieldsOf), for each list of fields.
type Buffer = { a: Int32Array; used: number };
type Parts = { n: number; of: Int32Array; buf: Buffer; centred: number[]; fields: WeakMap<DataField[], Fields> };
const parts = new WeakMap<object, Parts>();
const room = (n: number) => new Int32Array(Math.ceil(n * 1.25) + 1024);
// m's structures, and was's (w) when it has them; joins: how many of was's structures went into another (0 when was's
// are as they were), or -1 when they were worked out whole.
function partsOf(m: Mol, was?: Mol): { p: Parts; joins: number; w?: Parts } {
  const n = m.atoms.length, done = parts.get(m.bonds), w0 = was && parts.get(was.bonds), w = w0 && w0.n === was!.atoms.length ? w0 : undefined;
  if (done?.n === n) return { p: done, joins: done.of === w?.of ? 0 : -1, w };
  const n0 = was?.atoms.length ?? 0, b0 = was?.bonds.length ?? 0, nb = m.bonds.length;
  if (w && n >= n0 && nb >= b0 && (madeFrom(m.bonds, was!.bonds) || sameBonds(m.bonds, was!.bonds, b0)) && w.centred.every((i) => sameCentre(m.atoms[i].centre, was!.atoms[i].centre))) {
    if (n === n0 && nb === b0) { parts.set(m.bonds, w); return { p: w, joins: 0, w }; }
    // was's buffer, filled on past was's atoms when no other drawing has filled it on; was's own part changes only
    // when one of its structures goes into another (moved), and then in a copy.
    let buf = w.buf;
    if (buf.used !== n0 || buf.a.length < n) { const a = room(n); a.set(w.of); buf = { a, used: n0 }; }
    const a = buf.a, moved = new Map<number, number>(), up = (i: number) => (i < n0 ? moved.get(i) ?? a[i] : a[i]);
    const root = (i: number) => { for (let j = up(i); j !== i; j = up(i)) i = j; return i; };
    for (let i = n0; i < n; i++) a[i] = i;
    const join = (i: number, j: number) => {
      if (!(i >= 0 && j >= 0 && i < n && j < n)) return;
      i = root(i);
      j = root(j);
      if (i === j) return;
      if (i > j) [i, j] = [j, i];
      if (j < n0) moved.set(j, i);
      else a[j] = i;
    };
    for (let k = b0; k < nb; k++) join(m.bonds[k].atoms[0], m.bonds[k].atoms[1]);
    const centred = w.centred.filter((i) => i < n && m.atoms[i].centre);
    for (let i = n0; i < n; i++) { const c = m.atoms[i].centre; if (c) { centred.push(i); for (const j of c.atoms) join(i, j); } }
    let out = buf;
    if (moved.size) {
      out = { a: new Int32Array(a.length), used: n };
      out.a.set(a.subarray(0, n));
      for (const [j, i] of moved) out.a[j] = i;
      for (let i = 0; i < n; i++) out.a[i] = out.a[out.a[i]];
    } else {
      for (let i = n0; i < n; i++) a[i] = a[a[i]];
      buf.used = n;
    }
    const p: Parts = { n, of: out.a.subarray(0, n), buf: out, centred, fields: new WeakMap() };
    parts.set(m.bonds, p);
    return { p, joins: moved.size, w };
  }
  const a = room(n), centred: number[] = [];
  for (let i = 0; i < n; i++) a[i] = i;
  // A structure goes under its lowest atom, so each atom's is below it, and one pass in order gives every atom's.
  const join = (i: number, j: number) => {
    if (!(i >= 0 && j >= 0 && i < n && j < n)) return;
    while (a[i] !== i) i = a[i] = a[a[i]];
    while (a[j] !== j) j = a[j] = a[a[j]];
    if (i < j) a[j] = i;
    else if (j < i) a[i] = j;
  };
  for (const b of m.bonds) join(b.atoms[0], b.atoms[1]);
  for (let i = 0; i < n; i++) { const c = m.atoms[i].centre; if (c) { centred.push(i); for (const j of c.atoms) join(i, j); } }
  for (let i = 0; i < n; i++) a[i] = a[a[i]];
  const p: Parts = { n, of: a.subarray(0, n), buf: { a, used: n }, centred, fields: new WeakMap() };
  parts.set(m.bonds, p);
  return { p, joins: -1, w };
}
// Whether bonds were made from base by adding bonds or changing one's order or style (edit.ts bondsMadeFrom: a bond
// drawn, a paste, a bond tool on a bond), as the lists made on the way say; whether the first b bonds of p join the
// atoms q's do (the same bonds, as other edits that add keep them, cost a pass that reads none of them); and whether
// two links to a centre are the same.
function madeFrom(bonds: Mol["bonds"] | undefined, base: Mol["bonds"]): boolean {
  for (let k = 0; k < 64 && bonds; k++) { if (bonds === base) return true; bonds = bondsMadeFrom.get(bonds)?.deref(); }
  return false;
}
function sameBonds(p: Mol["bonds"], q: Mol["bonds"], b: number): boolean {
  if (p === q) return true;
  let k = 0;
  while (k < b && p[k] === q[k]) k++;
  for (; k < b; k++) if (p[k] !== q[k] && (p[k].atoms[0] !== q[k].atoms[0] || p[k].atoms[1] !== q[k].atoms[1])) return false;
  return true;
}
const sameCentre = (c?: { atoms: number[] }, d?: { atoms: number[] }) => c === d || (!!c && !!d && c.atoms.length === d.atoms.length && c.atoms.every((j, k) => j === d.atoms[k]));
const structuresOf = (m: Mol) => partsOf(m).p.of;
// The structures a field is on (most are on one, which needs no set).
function onStructures(f: { atoms: number[] }, of: Int32Array): number[] {
  const l = f.atoms, first = of[l[0]];
  for (let k = 1; k < l.length; k++) if (of[l[k]] !== first) return [...new Set(l.map((i) => of[i]))];
  return [first];
}
// The fields' text (fieldText in each structure each is on) and the most fields on one structure, kept with the
// structures for the list of fields. Worked out whole, they take a pass over the fields' atoms (a list the fields share
// once). From was's, after an edit that only adds to was (partsOf) and keeps its fields or adds to them, they are at
// most was's: joined structures hold no more text, and as many fields at most as the structures joined (joins + 1)
// held, with one more for each field added. exact: worked out whole (asked for when the most they can be is past a
// limit).
type Fields = { text: number; most: number; exact: boolean };
function fieldsOf(m: Mol, was?: Mol, exact = false): Fields {
  const data = m.data!, { p, joins, w: wp } = partsOf(m, was), of = p.of, done = p.fields.get(data);
  if (done && (done.exact || !exact)) return done;
  const w = !exact && joins >= 0 && was?.data ? wp?.fields.get(was.data) : undefined;
  let out: Fields;
  if (w && data.length >= was!.data!.length && (data === was!.data || was!.data!.every((f, k) => data[k] === f))) {
    out = { text: w.text, most: w.most * (joins + 1) + data.length - was!.data!.length, exact: w.exact && !joins && data === was!.data };
    for (let k = was!.data!.length; k < data.length; k++) { const f = data[k]; out.text += fieldText(f) * (f.caption !== undefined ? 1 : onStructures(f, of).length); }
  } else {
    const count = new Int32Array(of.length), lists = new Map<number[], number[]>();
    out = { text: 0, most: 0, exact: true };
    for (const f of data) {
      let on = lists.get(f.atoms);
      if (!on) lists.set(f.atoms, (on = onStructures(f, of)));
      out.text += fieldText(f) * (f.caption !== undefined ? 1 : on.length);
      for (const s of on) if (++count[s] > out.most) out.most = count[s];
    }
  }
  p.fields.set(data, out);
  return out;
}
// The most data fields on one structure (a field is on each structure it has an atom in): at most that, and exactly
// that when it is past MAX_EACH.
function mostOnOne(m: Mol, was?: Mol): number {
  if ((m.data?.length ?? 0) <= MAX_EACH) return m.data?.length ?? 0;
  const most = fieldsOf(m, was).most;
  return most <= MAX_EACH ? most : fieldsOf(m, was, true).most;
}

// --- Counts -------------------------------------------------------------------------------------------------------------
// Each limit: what is counted (at most, and exactly past its limit; was: the drawing before an edit, which only makes
// the count cheaper), its limit and what the editor says past it.
type Count = (m: Mol, was?: Mol) => number;
const noteCache = new WeakMap<Mol, [number, number]>();
// Every annotation in the drawing, and the most on one object (or on the drawing): one pass.
function noteCounts(m: Mol): [number, number] {
  const was = noteCache.get(m);
  if (was) return was;
  let n = m.annotations?.length ?? 0, most = n;
  const add = (l?: Annotation[]) => { const k = l?.length ?? 0; n += k; if (k > most) most = k; };
  for (const g of m.groups ?? []) add(g.annotations);
  for (const list of [m.captions, m.arrows, m.shapes, m.cycles] as ({ notes?: Annotation[] }[] | undefined)[]) for (const x of list ?? []) add(x.notes);
  noteCache.set(m, [n, most]);
  return [n, most];
}
const most = (n: number, what: string) => `A drawing holds up to ${n.toLocaleString("en-GB")} ${what}.`;
const limits = (): [Count, number, string][] => [
  [(m) => m.atoms.length, MAX_ATOMS, most(MAX_ATOMS, "atoms")],
  [(m) => m.bonds.length, 4 * MAX_ATOMS, most(4 * MAX_ATOMS, "bonds")],
  ...([["captions", "texts"], ["arrows", "arrows"], ["shapes", "shapes"], ["cycles", "cycles"], ["fills", "ring fills"], ["groups", "groups"]] as const).map(([k, what]): [Count, number, string] => [(m) => m[k]?.length ?? 0, MAX_OBJECTS, most(MAX_OBJECTS, what)]),
  [(m) => m.grids?.length ?? 0, MAX_GRIDS, most(MAX_GRIDS, "reagent tables")],
  [(m) => m.data?.length ?? 0, MAX_DATA, most(MAX_DATA, "data fields")],
  [mostOnOne, MAX_EACH, `A structure holds up to ${MAX_EACH.toLocaleString("en-GB")} data fields.`],
  [(m) => noteCounts(m)[0], MAX_NOTES, most(MAX_NOTES, "notes")],
  [(m) => noteCounts(m)[1], MAX_ANNOTATIONS, `A drawing or an object holds up to ${MAX_ANNOTATIONS.toLocaleString("en-GB")} notes.`],
  [(m) => m.monomers?.length ?? 0, MOST_OWN_MONOMERS, most(MOST_OWN_MONOMERS, "monomers")],
  [textOf, MAX_CHARACTERS, most(MAX_CHARACTERS, "characters of text")],
];
let table: ReturnType<typeof limits> | undefined;
const counted = new WeakMap<Mol, number[]>();
function countsOf(m: Mol, was?: Mol): number[] {
  let n = counted.get(m);
  if (!n) counted.set(m, (n = (table ??= limits()).map(([count]) => count(m, was))));
  return n;
}
// Why an edit makes a drawing a reader refuses or opens with less (past a count above), as the editor says it;
// undefined when it does not. was: the drawing before the edit. A count past its limit there already (a file from
// another program) stops only an edit that makes it larger, so each limit holds on its own. was's counts are needed
// only then (a count past its limit is exact, and one within it at least was's exact count).
export function overLimit(m: Mol, was?: Mol): string | undefined {
  const now = countsOf(m, was);
  const k = (table ??= limits()).findIndex(([, limit], k) => now[k] > limit && (!was || now[k] > countsOf(was)[k]));
  return k < 0 ? undefined : table[k][2];
}
// The drawing as this user saves it (experiment.ts stamped: Last changed by), when that keeps it within every limit;
// otherwise as it is, so the file opens whole (no name is added).
export function stampedWithin(m: Mol, name: string): Mol {
  const s = stamped(m, name);
  return s === m || !overLimit(s, m) ? s : m;
}

// --- Readers ------------------------------------------------------------------------------------------------------------
// The fields read with at most MAX_EACH on one structure: one that would take a structure past it is left out (a
// shown one's text stays as plain text). left: how many.
export function withinEach(m: Mol): { mol: Mol; left: number } {
  if (mostOnOne(m) <= MAX_EACH) return { mol: m, left: 0 };
  const of = structuresOf(m), n = new Map<number, number>();
  const data = m.data!.filter((f) => {
    const on = onStructures(f, of);
    if (on.some((s) => (n.get(s) ?? 0) >= MAX_EACH)) return false;
    for (const s of on) n.set(s, (n.get(s) ?? 0) + 1);
    return true;
  });
  return { mol: { ...m, data: data.length ? data : undefined }, left: m.data!.length - data.length };
}
// The drawing read with at most MAX_CHARACTERS of text: when it has more, notes are left out (the last first), then
// texts, then data fields, each counted (lose), and only what brings it within: when leaving out every note and text
// would not be enough, data fields go (the last first) until it is within, and the notes and texts stay; when leaving
// out every note would not, texts go and the notes stay. A shown field's text that goes leaves its value
// (datafields.ts remapData), so what is still past the limit then goes as texts, then fields. Text of other kinds
// (table cells, risk texts, reagent tables, monomers) stays: when leaving out every note, text and field would not
// bring the drawing within, nothing is left out, and the editor takes no edit that adds text.
export function withinText(m: Mol, lose: (what: string, n: number) => void): Mol {
  const over = (x: Mol) => textOf(x) - MAX_CHARACTERS;
  if (over(m) <= 0) return m;
  // The notes in the order capNotes keeps them: the drawing's, then the groups', then the objects'.
  const notes = (x: Mol) => [x.annotations ?? [], ...(x.groups ?? []).map((g) => g.annotations ?? []), ...[x.captions, x.arrows, x.shapes, x.cycles].flatMap((l) => (l ?? []).map((y) => y.notes ?? []))].flat();
  const sum = <T>(l: T[] | undefined, f: (y: T) => number) => (l ?? []).reduce((n, y) => n + f(y), 0);
  const fieldCost = (x: Mol) => { const of = structuresOf(x); return (f: DataField) => fieldText(f) * (f.caption !== undefined ? 1 : onStructures(f, of).length); };
  const notesText = (x: Mol) => sum(notes(x), noteText), textsText = (x: Mol) => sum(x.captions, captionText);
  if (over(m) > notesText(m) + textsText(m) + (m.data?.length ? sum(m.data, fieldCost(m)) : 0)) return m;
  // Each kind left out from its end until n characters have gone.
  const dropNotes = (x: Mol, n: number) => {
    const all = notes(x);
    let keep = all.length;
    while (keep > 0 && n > 0) n -= noteText(all[--keep]);
    if (keep === all.length) return x;
    lose("annotation", all.length - keep);
    return capNotes(x, keep);
  };
  const dropTexts = (x: Mol, n: number) => {
    const caps = x.captions ?? [], gone = new Set<number>();
    for (let k = caps.length - 1; k >= 0 && n > 0; k--) { n -= captionText(caps[k]); gone.add(caps[k].id); }
    if (!gone.size) return x;
    const fields = x.data?.length ?? 0, notesWere = noteCounts(x)[0], y = deleteGraphics(x, gone);
    lose("text", gone.size);
    if (fields > (y.data?.length ?? 0)) lose("data field", fields - (y.data?.length ?? 0));
    if (notesWere > noteCounts(y)[0]) lose("annotation", notesWere - noteCounts(y)[0]);
    return y;
  };
  const dropFields = (x: Mol, n: number) => {
    if (!x.data?.length || n <= 0) return x;
    const cost = fieldCost(x);
    let k = x.data.length;
    while (k > 0 && n > 0) n -= cost(x.data[--k]);
    lose("data field", x.data.length - k);
    return { ...x, data: k ? x.data.slice(0, k) : undefined };
  };
  let out = over(m) > notesText(m) + textsText(m) ? dropFields(m, over(m)) : m;
  if (over(out) > notesText(out)) out = dropTexts(out, over(out));
  out = dropNotes(out, over(out));
  out = dropTexts(out, over(out));
  return dropFields(out, over(out));
}
