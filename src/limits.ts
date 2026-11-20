// What a drawing holds at most, so that every drawing the editor makes saves and opens again whole
// (docs/plans/long-text.md): the counts Octet's own readers keep, and the size of the largest form Octet writes. The
// editor refuses an edit that takes a count past its limit (overLimit, in Editor.tsx set), and the readers leave out
// what is past it and count it (withinEach, withinSize).
import { capNotes, MAX_ANNOTATIONS, MAX_NOTES } from "./annotate.ts";
import { MAX_DATA, MAX_EACH } from "./datafields.ts";
import { deleteGraphics } from "./edit.ts";
import { MAX_GRIDS } from "./experiment.ts";
import { MOST_OWN_MONOMERS } from "./monomers.ts";
import { membrane, type Annotation, type Arrow, type Atom, type Bond, type Caption, type DataField, type Mol, type Shape } from "./render.ts";

export const MAX_ATOMS = 100_000;
// Texts, arrows, shapes, cycles, ring fills and groups, each. A text's length is MAX_TEXT (richtext.ts).
export const MAX_OBJECTS = 10_000;
// The most bytes a drawing's largest form takes: Octet saves, keeps a recovery copy of and opens files of 64 MB at
// most (main.rs MAX_BYTES), and sizeOf is a little over what the writers make.
export const MAX_SIZE = 63 * 2 ** 20;

// --- Size ---------------------------------------------------------------------------------------------------------------
// The most bytes each thing takes in the largest form Octet writes (the .oct file: its CDXML, and Octet's own copy in
// base64; a .cdx file for a spectrum), measured on the writers with the costliest values (" takes 8.8 bytes a character
// in a .oct, a style run with every style 310 bytes, ids of six digits), rounded up. A drawing's size is their sum,
// worked out from lengths and counts without writing it.
const BASE = 300_000, UNIT = 9, RUN = 320, NOTE = 120;
// An atom (CARBON: a carbon with a bond, whose label is not written), its label's text, a bond (TYPE more when it is
// not single), a text, an arrow, a pen curve's point, a membrane's lipid, a shape, a table cell and its character, a
// picture's byte.
const ATOM = 520, CARBON = 240, LABEL = 300, BOND = 90, TYPE = 50, CAPTION = 300, ARROW = 820, POINT = 270, LIPID = 1_500, SHAPE = 500, CELL = 30, CELL_UNIT = 17, PICTURE = 4.7;
// A data field (SHOWN more when it is shown: its ChemDraw property), and each structure a field not shown is written
// in; an atom in a field's or a group's list (MEMBER), in a text's under list (UNDER), in a ring fill or a property's
// atoms (BASIS); a group, a ring fill, a cycle, a reagent table, a spectrum and its point.
const FIELD = 190, SHOWN = 400, ON = 100, MEMBER = 16, UNDER = 24, BASIS = 30, GROUP = 170, FILL = 150, CYCLE = 2_000, GRID = 30_000, SPECTRUM = 20_000, SPECTRUM_POINT = 12;
// What each property adds to its atom, bond, arrow, text or shape, measured with its costliest value and rounded up (0:
// counted apart, or never written). One not listed (a list, an object) adds OTHER and its JSON at UNIT a character.
const OTHER = 100;
const PROPS: Record<"atom" | "bond" | "arrow" | "caption" | "shape", Record<string, number>> = {
  atom: { key: 0, tag: 0, session: 0, text: 0, runs: 0, inner: 0, charge: 240, radical: 450, isotope: 300, pairs: 440, circled: 40, partial: 280, hmark: 90, attach: 120, bead: 120,
    map: 70, enhanced: 100, colour: 80, shade: 160, font: 130, size: 30, bold: 30, italic: 30, underline: 40, ignoreWarnings: 70, cip: 70, halo: 60, circle: 70, number: 100, hiddenNumber: 100, align: 80,
    labelAngle: 70, hidden: 60, bars: 30, chemical: 70, shown: 230, order: 40, kept: 200, scale: 210, implicitHCount: 40, ox: 20 },
  bond: { stereo: 60, display: 60, position: 40, colour: 60, halo: 60, ignoreWarnings: 70, query: 80, topology: 70, rxn: 80, spacing: 70, line: 180, bold: 180, route: 30, ports: 60 },
  arrow: { from: 0, to: 0, curve: 0, notes: 0, bend: 70, style: 30, colour: 70, start: 130, end: 130, head: 40, fill: 90, point: 70, ratio: 70, shaft: 40, order: 40, width: 80, scale: 150 },
  caption: { x: 0, y: 0, runs: 0, notes: 0, property: 0, facts: 0, under: 80, measure: 1_000, bold: 60, italic: 60, underline: 70, size: 50, align: 40, colour: 70, angle: 70, font: 150,
    order: 40, width: 100, lineHeight: 60, chemical: 70, auto: 60, on: 200, placed: 170 },
  shape: { from: 0, to: 0, table: 0, picture: 0, notes: 0, symbol: 0, mark: 300, dashed: 70, colour: 60, fill: 90, shadow: 60, side: 30, boldLine: 40, order: 40, angle: 80, width: 70,
    radius: 40, font: 150, size: 30, bold: 30, italic: 30, underline: 40, ignoreWarnings: 90, bracketed: 40, scale: 150, count: 50 },
};
const json = (v: unknown) => (v === undefined ? 0 : JSON.stringify(v).length);
// first, second: two properties every one has (a check that costs less than a look-up).
function propsSize(o: object, costs: Record<string, number>, first: string, second: string): number {
  let n = 0;
  for (const k in o) {
    if (k === first || k === second) continue;
    const v = (o as Record<string, unknown>)[k], c = costs[k];
    if (v !== undefined) n += typeof c === "number" ? c : OTHER + UNIT * json(v);
  }
  return n;
}
const kept = <K extends object>(cache: WeakMap<K, number>, k: K, f: (k: K) => number) => { let n = cache.get(k); if (n === undefined) cache.set(k, (n = f(k))); return n; };
const notesCache = new WeakMap<Annotation[], number>(), innerCache = new WeakMap<Mol, number>(), lipids = new WeakMap<Arrow, number>();
const notesSize = (l?: Annotation[]) => (l ? kept(notesCache, l, (l) => l.reduce((n, a) => n + NOTE + UNIT * (a.keyword.length + a.content.length), 0)) : 0);
const textSize = (t: { text?: string; runs?: unknown[] }) => UNIT * (t.text?.length ?? 0) + RUN * (t.runs?.length ?? 0);
const bondSize = (b: Bond) => BOND + propsSize(b, PROPS.bond, "atoms", "type") + (b.type === 1 ? 0 : TYPE);
// An atom; bonded: it has a bond and no carbon labels are shown, so a carbon's label is not written.
function atomSize(a: Atom, bonded: boolean): number {
  let n = (bonded && a.label === "C" ? CARBON : ATOM) + propsSize(a, PROPS.atom, "label", "location");
  if (a.text) n += LABEL + textSize(a);
  if (a.inner) n += kept(innerCache, a.inner, (g) => g.atoms.reduce((k, x) => k + atomSize(x, false), 0) + g.bonds.reduce((k, b) => k + bondSize(b), 0));
  return n;
}
const captionSize = (c: Caption) => CAPTION + textSize(c) + notesSize(c.notes) + propsSize(c, PROPS.caption, "id", "text") + UNDER * (c.under?.length ?? 0)
  + (c.property ? UNIT * json(c.property.attrs) + BASIS * c.property.atoms.length : 0);
const arrowSize = (a: Arrow) => ARROW + propsSize(a, PROPS.arrow, "id", "kind") + POINT * (a.curve?.points.length ?? 0) + notesSize(a.notes)
  + (a.style === "membrane" ? LIPID * kept(lipids, a, (x) => membrane(x, 1).heads.length) : 0);
function shapeSize(s: Shape): number {
  let n = SHAPE + propsSize(s, PROPS.shape, "id", "kind") + notesSize(s.notes) + UNIT * (s.mark?.length ?? 0);
  if (s.table) { const { cells, ...rest } = s.table; n += UNIT * json(rest); for (const row of cells) for (const c of row) n += CELL + CELL_UNIT * c.length; }
  for (const v of Object.values(s.picture ?? {})) n += PICTURE * (v.length / 2);
  return n;
}

// A list's part: each thing's size, kept for the last list worked out, and worked out for a new list from that one by
// the things that changed (an edit makes a new list, and most of its things are the same objects). When things are put
// in or taken out, the rest are matched from the end, so a deletion costs what it took out. changed: each thing taken
// out (-1) and put in (1).
type Part<T> = { list: T[]; sizes: Float64Array; size: number };
// An empty list of objects: a list literal [] is one of small numbers, and a loop given both kinds reads each slower.
const EMPTY = ([{}] as never[]).slice(0, 0);
const part = <T>(): Part<T> => ({ list: EMPTY, sizes: new Float64Array(0), size: 0 });
function partSize<T>(p: Part<T>, list: T[], size: (x: T, i: number) => number, changed?: (x: T, by: number) => void): number {
  const o = p.list, l = list.length ? list : EMPTY;
  let n = p.size, sizes = p.sizes;
  if (l === o) return n;
  if (l.length === o.length) {
    for (let i = same(l, o, 0, l.length); i < l.length; i = same(l, o, i + 1, l.length)) {
      if (changed) { changed(o[i], -1); changed(l[i], 1); }
      const s = size(l[i], i);
      n += s - sizes[i];
      sizes[i] = s;
    }
  } else {
    const a = same(l, o, 0, Math.min(l.length, o.length)), z = sameEnd(l, o, Math.min(l.length, o.length) - a);
    for (let i = a; i < o.length - z; i++) { changed?.(o[i], -1); n -= sizes[i]; }
    if (sizes.length < l.length) { const s = new Float64Array(Math.max(l.length, 2 * sizes.length)); s.set(sizes.subarray(0, o.length)); sizes = p.sizes = s; }
    sizes.copyWithin(l.length - z, o.length - z, o.length);
    for (let i = a; i < l.length - z; i++) { changed?.(l[i], 1); n += sizes[i] = size(l[i], i); }
  }
  p.list = l;
  p.size = n;
  return n;
}
// The first place from i on (before end) where two lists differ, and how many things two lists end with the same (most
// at most): loops of their own, which stay fast whatever partSize is given.
function same(l: unknown[], o: unknown[], i: number, end: number): number {
  while (i < end && l[i] === o[i]) i++;
  return i;
}
function sameEnd(l: unknown[], o: unknown[], most: number): number {
  let z = 0;
  while (z < most && l[l.length - 1 - z] === o[o.length - 1 - z]) z++;
  return z;
}
// A list's part kept for the list.
function listPart<T>(size: (x: T) => number) {
  const p = part<T>(), done = new WeakMap<T[], number>();
  return (l?: T[]) => { if (!l) return 0; let n = done.get(l); if (n === undefined) done.set(l, (n = partSize(p, l, size))); return n; };
}
// The atoms' and bonds' part, kept for the atoms, the bonds and the carbon labels. A carbon's size depends on whether it
// has a bond, so the bonds go first, counting each atom's bonds (degree), and each atom whose count went from none to
// some, or back, is worked out again.
const atoms = part<Atom>(), bonds = part<Bond>(), done = new WeakMap<Atom[], { bonds: Bond[]; labels: boolean; size: number }>();
let degree = new Int32Array(0), labelled = false;
function structurePart(m: Mol): number {
  const labels = !!(m.style?.terminalLabels || m.style?.carbonLabels), was = done.get(m.atoms);
  if (was?.bonds === m.bonds && was.labels === labels) return was.size;
  if (degree.length < m.atoms.length) { const d = new Int32Array(Math.max(m.atoms.length, 2 * degree.length)); d.set(degree); degree = d; }
  const flipped: number[] = [], count = (i: number, by: number) => { if (i >= 0 && i < degree.length && !(degree[i] += by) !== !(degree[i] - by)) flipped.push(i); };
  const b = partSize(bonds, m.bonds, bondSize, (x, by) => { count(x.atoms[0], by); count(x.atoms[1], by); });
  if (labels !== labelled) { atoms.list = EMPTY; atoms.size = 0; labelled = labels; }
  const size = (a: Atom, i: number) => atomSize(a, !labels && degree[i] > 0);
  let n = partSize(atoms, m.atoms, size);
  for (const i of flipped) if (i < m.atoms.length) { const s = size(m.atoms[i], i); n += s - atoms.sizes[i]; atoms.sizes[i] = s; }
  atoms.size = n;
  done.set(m.atoms, { bonds: m.bonds, labels, size: n + b });
  return n + b;
}
const captionsPart = listPart(captionSize), arrowsPart = listPart(arrowSize), shapesPart = listPart(shapeSize);
const lists = { cycles: new WeakMap<object, number>(), groups: new WeakMap<object, number>(), fills: new WeakMap<object, number>(), grids: new WeakMap<object, number>(), spectra: new WeakMap<object, number>() };
function sum<T>(cache: WeakMap<object, number>, list: T[] | undefined, f: (x: T) => number): number {
  if (!list) return 0;
  let n = cache.get(list);
  if (n === undefined) { n = 0; for (const x of list) n += f(x); cache.set(list, n); }
  return n;
}
const partsSize = (m: Mol) => captionsPart(m.captions) + arrowsPart(m.arrows) + shapesPart(m.shapes)
  + sum(lists.cycles, m.cycles, (c) => { const { notes, ...rest } = c; return CYCLE + UNIT * json(rest) + notesSize(notes); })
  + sum(lists.groups, m.groups, (g) => GROUP + MEMBER * (g.atoms.length + g.items.length) + notesSize(g.annotations) + UNIT * (json(g.plot) + json(g.risk)))
  + sum(lists.fills, m.fills, (f) => FILL + BASIS * f.atoms.length)
  + sum(lists.grids, m.grids, (g) => GRID + UNIT * json(g))
  + sum(lists.spectra, m.spectra, (s) => SPECTRUM + SPECTRUM_POINT * s.y.length + UNIT * json(s.groups));

// Each atom's structure (atoms joined by bonds, or by a ligand's link to its centre, as edit.ts fragments finds them),
// as a union-find kept for the last drawing's bonds and number of atoms: an edit that only adds bonds and atoms joins
// them in, and any other builds it again. top(i): the first atom of i's structure, which stands for it. version counts
// the changes to the structures of the atoms there were: a new atom joined to a structure is none.
const joined = { bonds: [] as Bond[], n: 0, up: new Int32Array(0), version: 0 };
const top = (i: number) => { const up = joined.up; while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
let from = 0, merged = false;
// The structures of i and j as one, under the first atom of either.
function join(i: number, j: number) {
  if (!(i >= 0 && j >= 0 && i < joined.n && j < joined.n)) return;
  const up = joined.up;
  while (up[i] !== i) i = up[i] = up[up[i]];
  while (up[j] !== j) j = up[j] = up[up[j]];
  if (i === j) return;
  if (i < j) up[j] = i;
  else up[i] = j;
  if (i < from && j < from) merged = true;
}
function structures(m: Mol): number {
  const l = m.bonds, o = joined.bonds, n = m.atoms.length;
  if (l === o && n === joined.n) return joined.version;
  let k = 0;
  if (n >= joined.n && l.length >= o.length) while (k < o.length && l[k] === o[k]) k++;
  const again = k < o.length || n < joined.n;
  from = again ? 0 : joined.n;
  merged = again || !from;
  if (joined.up.length < n) { const up = new Int32Array(Math.max(n, 2 * joined.up.length)); if (!again) up.set(joined.up.subarray(0, from)); joined.up = up; }
  const up = joined.up;
  for (let i = from; i < n; i++) up[i] = i;
  joined.n = n;
  for (let b = again ? 0 : k; b < l.length; b++) join(l[b].atoms[0], l[b].atoms[1]);
  for (let i = from; i < n; i++) { const c = m.atoms[i].centre; if (c) for (const j of c.atoms) join(i, j); }
  joined.bonds = l;
  return merged ? ++joined.version : joined.version;
}
// The structures a field is on (most are on one, which needs no set).
function onStructures(f: { atoms: number[] }): number[] {
  const first = top(f.atoms[0]);
  for (let k = 1; k < f.atoms.length; k++) if (top(f.atoms[k]) !== first) return [...new Set(f.atoms.map(top))];
  return [first];
}
// A field: its atoms, and for one shown, its text's atoms as ChemDraw's property (its text is the caption's); one not
// shown is written in each structure it is on.
const fieldSize = (f: DataField, on: number) => FIELD + MEMBER * f.atoms.length
  + (f.caption !== undefined ? SHOWN + BASIS * f.atoms.length + UNIT * f.name.length : on * (ON + UNIT * (f.name.length + (f.value?.length ?? 0))));
// The fields' part and the most fields on one structure, kept for the fields and the structures.
const fieldsCache = new WeakMap<object, { version: number; size: number; most: number }>();
function fieldCounts(m: Mol): { size: number; most: number } {
  if (!m.data?.length) return { size: 0, most: 0 };
  const version = structures(m), was = fieldsCache.get(m.data);
  if (was?.version === version) return was;
  const n = new Map<number, number>();
  let size = 0, most = 0;
  for (const f of m.data) {
    const on = onStructures(f);
    size += fieldSize(f, on.length);
    for (const s of on) { const k = (n.get(s) ?? 0) + 1; n.set(s, k); if (k > most) most = k; }
  }
  const out = { version, size, most };
  fieldsCache.set(m.data, out);
  return out;
}
const dataSize = (m: Mol) => fieldCounts(m).size;
// The most bytes the drawing takes in the largest form Octet writes it in: within MAX_SIZE, it saves (as .oct, CDXML or
// CDX) and its recovery copy is kept.
export function sizeOf(m: Mol): number {
  return BASE + structurePart(m) + notesSize(m.annotations) + dataSize(m) + partsSize(m);
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
  [(m) => m.monomers?.length ?? 0, MOST_OWN_MONOMERS, most(MOST_OWN_MONOMERS, "monomers")],
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
  structures(m);
  const n = new Map<number, number>();
  const data = m.data!.filter((f) => {
    const on = onStructures(f);
    if (on.some((s) => (n.get(s) ?? 0) >= MAX_EACH)) return false;
    for (const s of on) n.set(s, (n.get(s) ?? 0) + 1);
    return true;
  });
  return { mol: { ...m, data: data.length ? data : undefined }, left: m.data!.length - data.length };
}
// The drawing read within MAX_SIZE: when it is larger, the notes past it are left out (the last first), then the texts,
// then the data fields, and each is counted (lose). What else it holds (structures, pictures, curves) stays, so when that
// alone is larger, nothing is left out: the drawing does not save either way.
export function withinSize(m: Mol, lose: (what: string, n: number) => void): Mol {
  let over = sizeOf(m) - MAX_SIZE;
  if (over <= 0 || sizeOf({ ...capNotes(m, 0), captions: undefined, data: undefined }) > MAX_SIZE) return m;
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
    structures(out);
    let k = out.data.length;
    while (k > 0 && over > 0) { const f = out.data[--k]; over -= fieldSize(f, onStructures(f).length); }
    lose("data field", out.data.length - k);
    out = { ...out, data: k ? out.data.slice(0, k) : undefined };
  }
  return out;
}
