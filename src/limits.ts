// What a drawing holds at most, so that every drawing the editor makes saves and opens again whole
// (docs/plans/long-text.md): the counts Octet's own readers keep, and the size of the largest form Octet writes. The
// editor refuses an edit that takes a count past its limit (overLimit, in Editor.tsx set), and the readers leave out
// what is past it and count it (withinEach, withinSize).
import { capNotes, MAX_ANNOTATIONS, MAX_NOTES } from "./annotate.ts";
import { MAX_DATA, MAX_EACH } from "./datafields.ts";
import { deleteGraphics } from "./edit.ts";
import { MAX_GRIDS } from "./experiment.ts";
import type { Annotation, Atom, Bond, Caption, Mol } from "./render.ts";

export const MAX_ATOMS = 100_000;
// Texts, arrows, shapes, cycles, ring fills and groups, each. A text's length is MAX_TEXT (richtext.ts).
export const MAX_OBJECTS = 10_000;
// The most bytes a drawing's largest form takes: Octet saves, keeps a recovery copy of and opens files of 64 MB at
// most (main.rs MAX_BYTES), and sizeOf is a little over what the writers make.
export const MAX_SIZE = 63 * 2 ** 20;

// --- Size ---------------------------------------------------------------------------------------------------------------
// The most bytes each thing takes in the largest form Octet writes (the .oct file: its CDXML, and Octet's own copy in
// base64; a .cdx file for a spectrum), measured on the writers with the costliest text (" takes 8.8 bytes a character
// in a .oct, a style run with every style 310 bytes), rounded up. A drawing's size is their sum, worked out from
// lengths and counts without writing it, and each list's part is kept for the list, so an edit costs only what it
// changed.
const BASE = 300_000, UNIT = 9, RUN = 320, ATOM = 400, DECOR = 1_600, LABEL = 300, BOND = 130, CAPTION = 260, ARROW = 650, POINT = 270;
const SHAPE = 360, CELL = 30, CELL_UNIT = 17, PICTURE = 4.7, NOTE = 120, FIELD = 190, MEMBER = 10, GROUP = 170, FILL = 100, CYCLE = 2_000, GRID = 30_000, SPECTRUM = 20_000, SPECTRUM_POINT = 12;
// What a plain atom has (with what is never written, and the label's own text and style, counted apart): an atom with
// anything else (a charge, an isotope, a query, a colour) writes more.
const PLAIN = new Set(["label", "location", "key", "tag", "session", "text", "runs", "font", "size", "bold", "italic", "underline", "inner", "implicitHCount", "order", "scale"]);
const json = (v: unknown) => (v === undefined ? 0 : JSON.stringify(v).length);
const kept = <K extends object>(cache: WeakMap<K, number>, k: K, f: (k: K) => number) => { let n = cache.get(k); if (n === undefined) cache.set(k, (n = f(k))); return n; };
const notesCache = new WeakMap<Annotation[], number>();
const notesSize = (l?: Annotation[]) => (l ? kept(notesCache, l, (l) => l.reduce((n, a) => n + NOTE + UNIT * (a.keyword.length + a.content.length), 0)) : 0);
const textSize = (t: { text?: string; runs?: unknown[] }) => UNIT * (t.text?.length ?? 0) + RUN * (t.runs?.length ?? 0);
function atomSize(a: Atom): number {
  let n = ATOM;
  for (const k in a) if (!PLAIN.has(k)) { n += DECOR; break; }
  if (a.text) n += LABEL + textSize(a);
  if (a.inner) n += ATOM * a.inner.atoms.length + BOND * a.inner.bonds.length;
  return n;
}
// The atoms' part: worked out from the last list's, by the atoms that changed (an edit makes a new list, and most of
// its atoms are the same objects).
let lastAtoms: Atom[] = [], lastAtomsSize = 0;
function atomsSize(l: Atom[]): number {
  let n = lists.atoms.get(l);
  if (n !== undefined) return n;
  const k = Math.min(l.length, lastAtoms.length);
  n = lastAtomsSize;
  for (let i = 0; i < k; i++) if (l[i] !== lastAtoms[i]) n += atomSize(l[i]) - atomSize(lastAtoms[i]);
  for (let i = k; i < l.length; i++) n += atomSize(l[i]);
  for (let i = k; i < lastAtoms.length; i++) n -= atomSize(lastAtoms[i]);
  lists.atoms.set(l, n);
  lastAtoms = l;
  lastAtomsSize = n;
  return n;
}
const captionSize = (c: Caption) => CAPTION + textSize(c) + notesSize(c.notes) + (c.property ? UNIT * json(c.property) : 0);
const lists = { atoms: new WeakMap<Atom[], number>(), captions: new WeakMap<object, number>(), arrows: new WeakMap<object, number>(), shapes: new WeakMap<object, number>(), cycles: new WeakMap<object, number>(), groups: new WeakMap<object, number>(), fills: new WeakMap<object, number>(), grids: new WeakMap<object, number>(), spectra: new WeakMap<object, number>() };
function sum<T>(cache: WeakMap<object, number>, list: T[] | undefined, f: (x: T) => number): number {
  if (!list) return 0;
  let n = cache.get(list);
  if (n === undefined) { n = 0; for (const x of list) n += f(x); cache.set(list, n); }
  return n;
}
const partSize = {
  captions: (m: Mol) => sum(lists.captions, m.captions, captionSize),
  arrows: (m: Mol) => sum(lists.arrows, m.arrows, (a) => ARROW + POINT * (a.curve?.points.length ?? 0) + notesSize(a.notes)),
  shapes: (m: Mol) => sum(lists.shapes, m.shapes, (s) => {
    let n = SHAPE + notesSize(s.notes);
    for (const row of s.table?.cells ?? []) for (const c of row) n += CELL + CELL_UNIT * c.length;
    for (const v of Object.values(s.picture ?? {})) n += PICTURE * (v.length / 2);
    return n + UNIT * (json(s.tlc) + json(s.plasmid) + json(s.shade) + json(s.polymer) + json(s.rgroup));
  }),
  cycles: (m: Mol) => sum(lists.cycles, m.cycles, (c) => { const { notes, ...rest } = c; return CYCLE + UNIT * json(rest) + notesSize(notes); }),
  groups: (m: Mol) => sum(lists.groups, m.groups, (g) => GROUP + MEMBER * (g.atoms.length + g.items.length) + notesSize(g.annotations) + UNIT * (json(g.plot) + json(g.risk))),
  fills: (m: Mol) => sum(lists.fills, m.fills, (f) => FILL + MEMBER * f.atoms.length),
  grids: (m: Mol) => sum(lists.grids, m.grids, (g) => GRID + UNIT * json(g)),
  spectra: (m: Mol) => sum(lists.spectra, m.spectra, (s) => SPECTRUM + SPECTRUM_POINT * s.y.length + UNIT * json(s.groups)),
};
// The structures a field is on (most are on one, which needs no set).
function onStructures(f: { atoms: number[] }, of: Int32Array): number[] {
  const first = of[f.atoms[0]];
  return f.atoms.every((i) => of[i] === first) ? [first] : [...new Set(f.atoms.map((i) => of[i]))];
}
// A field not shown is written in each structure it is on.
const fieldSize = (f: { name: string; atoms: number[]; value?: string; caption?: number }, on: number) => FIELD + MEMBER * f.atoms.length + UNIT * (f.name.length + (f.value?.length ?? 0)) * (f.caption !== undefined ? 1 : on);
// The fields' part and the most fields on one structure, kept for the fields and the structures.
const fieldsCache = new WeakMap<object, { of: Int32Array; size: number; most: number }>();
function fieldCounts(m: Mol): { size: number; most: number } {
  if (!m.data?.length) return { size: 0, most: 0 };
  const of = structuresOf(m), was = fieldsCache.get(m.data);
  if (was?.of === of) return was;
  const n = new Map<number, number>();
  let size = 0, most = 0;
  for (const f of m.data) {
    const on = onStructures(f, of);
    size += fieldSize(f, on.length);
    for (const s of on) { const k = (n.get(s) ?? 0) + 1; n.set(s, k); if (k > most) most = k; }
  }
  const out = { of, size, most };
  fieldsCache.set(m.data, out);
  return out;
}
const dataSize = (m: Mol) => fieldCounts(m).size;
// The most bytes the drawing takes in the largest form Octet writes it in: within MAX_SIZE, it saves (as .oct, CDXML or
// CDX) and its recovery copy is kept.
export function sizeOf(m: Mol): number {
  return BASE + atomsSize(m.atoms) + m.bonds.length * BOND + notesSize(m.annotations) + dataSize(m)
    + Object.values(partSize).reduce((n, f) => n + f(m), 0);
}

// Each atom's structure, by a number (atoms joined by bonds, or by a ligand's link to its centre, as edit.ts fragments
// finds them), kept for the drawing's bonds and number of atoms (an edit that moves atoms keeps them).
const structures = new WeakMap<Bond[], { n: number; of: Int32Array }>();
export function structuresOf(m: Mol): Int32Array {
  const was = structures.get(m.bonds);
  if (was?.n === m.atoms.length) return was.of;
  const up = new Int32Array(m.atoms.length).map((_, i) => i);
  const top = (i: number) => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  const join = (i: number, j: number) => { if (i >= 0 && j >= 0 && i < up.length && j < up.length) up[top(i)] = top(j); };
  for (const b of m.bonds) join(b.atoms[0], b.atoms[1]);
  m.atoms.forEach((a, i) => { for (const j of a.centre?.atoms ?? []) join(i, j); });
  const of = up.map((_, i) => top(i));
  structures.set(m.bonds, { n: m.atoms.length, of });
  return of;
}
// The most data fields on one structure (a field is on each structure it has an atom in).
const mostOnOne = (m: Mol) => ((m.data?.length ?? 0) <= MAX_EACH ? m.data?.length ?? 0 : fieldCounts(m).most);

// --- Counts -------------------------------------------------------------------------------------------------------------
// Each limit: what is counted, its limit and what the editor says past it.
type Count = (m: Mol) => number;
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
  [sizeOf, MAX_SIZE, "A drawing holds up to 64 MB."],
];
let table: ReturnType<typeof limits> | undefined;
const counted = new WeakMap<Mol, number[]>();
function countsOf(m: Mol): number[] {
  let n = counted.get(m);
  if (!n) counted.set(m, (n = (table ??= limits()).map(([count]) => count(m))));
  return n;
}
// Why an edit makes a drawing a reader refuses or opens with less (past a count above, or larger than Octet saves),
// as the editor says it; undefined when it does not. was: the drawing before the edit. A count past its limit there
// already (a file from another program) stops only an edit that makes it larger, so each limit holds on its own.
export function overLimit(m: Mol, was?: Mol): string | undefined {
  const now = countsOf(m), before = was && countsOf(was);
  const k = (table ??= limits()).findIndex(([, limit], k) => now[k] > limit && (!before || now[k] > before[k]));
  return k < 0 ? undefined : table[k][2];
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
// The drawing read within MAX_SIZE: when it is larger, the notes past it are left out (the last first), then the texts,
// then the data fields, and each is counted (lose). What else it holds (structures, pictures, curves) stays.
export function withinSize(m: Mol, lose: (what: string, n: number) => void): Mol {
  let over = sizeOf(m) - MAX_SIZE;
  if (over <= 0) return m;
  let out = m;
  // The notes in the order capNotes keeps them: the drawing's, then the groups', then the objects'.
  const all = [m.annotations ?? [], ...(m.groups ?? []).map((g) => g.annotations ?? []), ...[m.captions, m.arrows, m.shapes, m.cycles].flatMap((l) => (l ?? []).map((x) => x.notes ?? []))].flat();
  let keep = all.length;
  while (keep > 0 && over > 0) { const a = all[--keep]; over -= NOTE + UNIT * (a.keyword.length + a.content.length); }
  if (keep < all.length) { out = capNotes(out, keep); lose("annotation", all.length - keep); }
  const caps = out.captions ?? [], gone = new Set<number>();
  for (let k = caps.length - 1; k >= 0 && over > 0; k--) { over -= captionSize(caps[k]); gone.add(caps[k].id); }
  if (gone.size) {
    const fields = out.data?.length ?? 0, notesWere = noteCounts(out)[0];
    out = deleteGraphics(out, gone);
    lose("text", gone.size);
    if (fields > (out.data?.length ?? 0)) lose("data field", fields - (out.data?.length ?? 0));
    if (notesWere > noteCounts(out)[0]) lose("annotation", notesWere - noteCounts(out)[0]);
    over = sizeOf(out) - MAX_SIZE;
  }
  if (over > 0 && out.data?.length) {
    const of = structuresOf(out);
    let k = out.data.length;
    while (k > 0 && over > 0) { const f = out.data[--k]; over -= fieldSize(f, onStructures(f, of).length); }
    lose("data field", out.data.length - k);
    out = { ...out, data: k ? out.data.slice(0, k) : undefined };
  }
  return out;
}
