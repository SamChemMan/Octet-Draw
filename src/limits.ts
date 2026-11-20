// What a drawing holds at most, so that every drawing the editor makes saves and opens again whole
// (docs/plans/long-text.md): the counts Octet's own readers keep, and the text that keeps a drawing within the 64 MB
// Octet saves. The editor refuses an edit that takes a count past its limit (overLimit, in Editor.tsx set), and the
// readers leave out what is past it and count it (withinEach, withinText).
import { capNotes, MAX_ANNOTATIONS, MAX_NOTES } from "./annotate.ts";
import { MAX_DATA, MAX_EACH } from "./datafields.ts";
import { deleteGraphics } from "./edit.ts";
import { MAX_GRIDS, stamped } from "./experiment.ts";
import type { Annotation, Caption, DataField, Grid, Group, Mol, Shape } from "./render.ts";

export const MAX_ATOMS = 100_000;
// Texts, arrows, shapes, cycles, ring fills and groups, each. A text's length is MAX_TEXT (richtext.ts).
export const MAX_OBJECTS = 10_000;

// --- Text ---------------------------------------------------------------------------------------------------------------
// The text a drawing holds: what MAX_TEXT and MAX_VALUE let grow, the characters of its texts, notes, data fields,
// table cells, risk assessment texts and reagent tables. Each counts as the most bytes it takes in any form Octet
// writes (.oct, .cdx, CDXML, the recovery copy), in characters of 9 bytes (" in a .oct takes 8.7, the most): a style
// run counts RUN (310 bytes), a table cell's character and a shown field's name's 2 (16 and 11 bytes). A field not
// shown is written in each structure it is on, so its name and value and its record (FIELD, 88 bytes) count once for
// each. So text takes 45 MB at most: a drawing of text alone saves within 64 MB (main.rs MAX_BYTES), with 10,000 texts
// that have every style, each with a note and a shown data field (a .oct of 56 MB, longtext-stress L19). The rest of a
// drawing (structures, curves, pictures, spectra, a table's own cells) is not counted: Save refuses a drawing larger
// than 64 MB, as before, and the recovery copy kept last stays (docs/plans/long-text.md).
export const MAX_CHARACTERS = 5_000_000;
const RUN = 35, FIELD = 12;
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
const notesOf = part<Annotation>((a) => a.keyword.length + a.content.length);
const runsText = (l: { text: string }[]) => l.reduce((n, r) => n + r.text.length + RUN, 0);
const tables = new WeakMap<NonNullable<Shape["table"]>, number>(), risks = new WeakMap<NonNullable<Group["risk"]>, number>(), grids = new WeakMap<Grid, number>();
const captionText = (c: Caption) => c.text.length + RUN * (c.runs?.length ?? 0);
const captionsText = part<Caption>((c) => captionText(c) + notesOf(c.notes));
const arrowsText = part<{ notes?: Annotation[] }>((x) => notesOf(x.notes)), cyclesText = part<{ notes?: Annotation[] }>((x) => notesOf(x.notes));
const shapesText = part<Shape>((s) => notesOf(s.notes) + (s.table ? kept(tables, s.table, (t) => 2 * t.cells.reduce((n, row) => n + row.reduce((k, c) => k + c.length, 0), 0)) : 0));
const groupsText = part<Group>((g) => notesOf(g.annotations) + (g.risk?.texts ? kept(risks, g.risk, (r) => Object.values(r.texts!).reduce((n, l) => n + runsText(l), 0)) : 0));
const gridsText = part<Grid>((g) => kept(grids, g, (x) => JSON.stringify(x).length));
// A field's text in one structure: its name and value (a shown field's value is its text's), and a record.
const fieldText = (f: DataField) => (f.caption !== undefined ? 2 * f.name.length : f.name.length + (f.value?.length ?? 0) + FIELD);
// At most: a field not shown in as many structures as it has atoms.
const fieldsMost = part<DataField>((f) => fieldText(f) * (f.caption !== undefined ? 1 : f.atoms.length));
const fieldsCache = new WeakMap<DataField[], { of: Int32Array; n: number }>();
// The fields' text: worked out from their structures only when the most it can be takes the drawing past MAX_CHARACTERS.
function fieldsText(m: Mol, rest: number): number {
  const most = fieldsMost(m.data);
  if (!m.data?.length || rest + most <= MAX_CHARACTERS) return most;
  const of = structuresOf(m), was = fieldsCache.get(m.data!);
  if (was?.of === of) return was.n;
  let n = 0;
  for (const f of m.data!) n += fieldText(f) * (f.caption !== undefined ? 1 : onStructures(f, of).length);
  fieldsCache.set(m.data!, { of, n });
  return n;
}
// The drawing's text, in characters of 9 bytes (MAX_CHARACTERS).
export function textOf(m: Mol): number {
  const rest = captionsText(m.captions) + notesOf(m.annotations) + arrowsText(m.arrows) + cyclesText(m.cycles) + shapesText(m.shapes) + groupsText(m.groups) + gridsText(m.grids);
  return rest + fieldsText(m, rest);
}

// --- Structures ---------------------------------------------------------------------------------------------------------
// Each atom's structure, by its first atom (atoms joined by bonds, or by a ligand's link to its centre, as edit.ts
// fragments finds them), kept for the drawing's bonds and number of atoms (an edit that moves atoms keeps them). Only a
// drawing with more than MAX_EACH data fields, or whose fields' text could take it past MAX_CHARACTERS, needs it: one
// pass over the bonds (0.7 ms on 100,000 atoms).
const structures = new WeakMap<object, { n: number; of: Int32Array }>();
function structuresOf(m: Mol): Int32Array {
  const n = m.atoms.length, was = structures.get(m.bonds);
  if (was?.n === n) return was.of;
  const up = new Int32Array(n);
  for (let i = 0; i < n; i++) up[i] = i;
  // A structure goes under its lowest atom, so each atom's is below it, and one pass in order gives every atom's.
  const join = (i: number, j: number) => {
    if (!(i >= 0 && j >= 0 && i < n && j < n)) return;
    while (up[i] !== i) i = up[i] = up[up[i]];
    while (up[j] !== j) j = up[j] = up[up[j]];
    if (i < j) up[j] = i;
    else if (j < i) up[i] = j;
  };
  for (const b of m.bonds) join(b.atoms[0], b.atoms[1]);
  for (let i = 0; i < n; i++) { const c = m.atoms[i].centre; if (c) for (const j of c.atoms) join(i, j); }
  for (let i = 0; i < n; i++) up[i] = up[up[i]];
  structures.set(m.bonds, { n, of: up });
  return up;
}
// The structures a field is on (most are on one, which needs no set).
function onStructures(f: { atoms: number[] }, of: Int32Array): number[] {
  const first = of[f.atoms[0]];
  return f.atoms.every((i) => of[i] === first) ? [first] : [...new Set(f.atoms.map((i) => of[i]))];
}
// The most data fields on one structure (a field is on each structure it has an atom in), kept for the fields and the
// structures.
const mostCache = new WeakMap<DataField[], { of: Int32Array; most: number }>();
function mostOnOne(m: Mol): number {
  if ((m.data?.length ?? 0) <= MAX_EACH) return m.data?.length ?? 0;
  const of = structuresOf(m), was = mostCache.get(m.data!);
  if (was?.of === of) return was.most;
  const count = new Int32Array(of.length);
  let most = 0;
  for (const f of m.data!) for (const s of onStructures(f, of)) if (++count[s] > most) most = count[s];
  mostCache.set(m.data!, { of, most });
  return most;
}

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
  [textOf, MAX_CHARACTERS, most(MAX_CHARACTERS, "characters of text")],
];
let table: ReturnType<typeof limits> | undefined;
const counted = new WeakMap<Mol, number[]>();
function countsOf(m: Mol): number[] {
  let n = counted.get(m);
  if (!n) counted.set(m, (n = (table ??= limits()).map(([count]) => count(m))));
  return n;
}
// Why an edit makes a drawing a reader refuses or opens with less (past a count above), as the editor says it;
// undefined when it does not. was: the drawing before the edit. A count past its limit there already (a file from
// another program) stops only an edit that makes it larger, so each limit holds on its own.
export function overLimit(m: Mol, was?: Mol): string | undefined {
  const now = countsOf(m), before = was && countsOf(was);
  const k = (table ??= limits()).findIndex(([, limit], k) => now[k] > limit && (!before || now[k] > before[k]));
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
// The drawing read with at most MAX_CHARACTERS of text: when it has more, the notes past it are left out (the last
// first), then the texts, then the data fields, and each is counted (lose). Text of other kinds (table cells, risk
// texts, reagent tables) stays: the editor then takes no edit that adds text.
export function withinText(m: Mol, lose: (what: string, n: number) => void): Mol {
  let over = textOf(m) - MAX_CHARACTERS;
  if (over <= 0) return m;
  let out = m;
  // The notes in the order capNotes keeps them: the drawing's, then the groups', then the objects'.
  const all = [m.annotations ?? [], ...(m.groups ?? []).map((g) => g.annotations ?? []), ...[m.captions, m.arrows, m.shapes, m.cycles].flatMap((l) => (l ?? []).map((x) => x.notes ?? []))].flat();
  let keep = all.length;
  while (keep > 0 && over > 0) { const a = all[--keep]; over -= a.keyword.length + a.content.length; }
  if (keep < all.length) { out = capNotes(out, keep); lose("annotation", all.length - keep); }
  const caps = out.captions ?? [], gone = new Set<number>();
  for (let k = caps.length - 1; k >= 0 && over > 0; k--) { over -= captionText(caps[k]); gone.add(caps[k].id); }
  if (gone.size) {
    const fields = out.data?.length ?? 0, notesWere = noteCounts(out)[0];
    out = deleteGraphics(out, gone);
    lose("text", gone.size);
    if (fields > (out.data?.length ?? 0)) lose("data field", fields - (out.data?.length ?? 0));
    if (notesWere > noteCounts(out)[0]) lose("annotation", notesWere - noteCounts(out)[0]);
    over = textOf(out) - MAX_CHARACTERS;
  }
  if (over > 0 && out.data?.length) {
    const of = structuresOf(out);
    let k = out.data.length;
    while (k > 0 && over > 0) { const f = out.data[--k]; over -= fieldText(f) * (f.caption !== undefined ? 1 : onStructures(f, of).length); }
    lose("data field", out.data.length - k);
    out = { ...out, data: k ? out.data.slice(0, k) : undefined };
  }
  return out;
}
