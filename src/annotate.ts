// Notes (issues 101 and 102, docs/plans/issue-101-102-notes.md): ChemDraw's annotations, keyword and content pairs, on
// the drawing (Mol.annotations), on a group (Group.annotations) and on a text, arrow, shape or catalytic cycle (their
// notes). The note the user types has the keyword Note; one from a ChemDraw file may have any keyword. None is drawn,
// and none goes into a picture or onto the clipboard for another app (withoutNotes).
import { CHANGED_BY, FIELDS, PROPERTIES, stamped } from "./experiment.ts";
import { selectedGroups } from "./edit.ts";
import type { Annotation, Mol } from "./render.ts";

// The keyword of the note the user types.
export const NOTE = "Note";
// The limits on annotations, in reading CDXML and Octet's own files, and in typing: 1000 on one object or the drawing,
// a keyword of 200 characters, a content of 10,000; and 10,000 in a whole drawing.
export const MAX_ANNOTATIONS = 1000, MAX_KEYWORD = 200, MAX_CONTENT = 10_000, MAX_NOTES = 10_000;
// Keywords that are not notes: the document's properties (Last changed by too) and an experiment page's details have
// their own places, and GUID and ComponentID are ChemDraw's own data. They are kept and written back, and never listed
// or taken out.
const UNLISTED = new Set<string>([...[...PROPERTIES, ...FIELDS].map(([, name]): string => name), CHANGED_BY, "GUID", "ComponentID"]);
export const isNote = (a: Annotation) => !UNLISTED.has(a.keyword);

// Text as a note keeps it: line breaks as \n (a CR dropped), a tab a space, no other control characters or lone
// surrogates, no empty lines at the start or end, and at most MAX_CONTENT characters (issue 68's rule for values).
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
export function cleanNote(s: string): string {
  const lines = s.slice(0, 4 * MAX_CONTENT).replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(LONE, "").split("\n");
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  const v = lines.slice(a, b).join("\n");
  return v.length > MAX_CONTENT ? v.slice(0, MAX_CONTENT).replace(LONE, "") : v;
}
// A keyword as Octet keeps it: one line, no control characters or lone surrogates, at most MAX_KEYWORD characters.
export const cleanKeyword = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").replace(LONE, "").trim().slice(0, MAX_KEYWORD).replace(LONE, "");

// What a note is on: the drawing, or the id of a text, arrow, shape, cycle or group (they share one set of ids).
export type Target = number | "drawing";
type Holder = { id: number; notes?: Annotation[] };
const items = (m: Mol): Holder[] => [...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? [])];

// The annotations on a target: all of them, notes or not.
export function annotationsOf(m: Mol, t: Target): Annotation[] | undefined {
  if (t === "drawing") return m.annotations;
  const g = m.groups?.find((x) => x.id === t);
  return g ? g.annotations : items(m).find((x) => x.id === t)?.notes;
}
// A target's note with this keyword (the first such): its text, or "" for none.
export const noteOf = (m: Mol, t: Target, keyword = NOTE) => annotationsOf(m, t)?.find((a) => a.keyword === keyword)?.content ?? "";
// Whether a target is in the drawing.
export const hasTarget = (m: Mol, t: Target) => t === "drawing" || !!m.groups?.some((g) => g.id === t) || items(m).some((x) => x.id === t);
// Every annotation in the drawing: on the drawing, its groups and its objects.
// One pass with no lists made: the editor counts them after each edit (file.ts overLimit).
export function noteCount(m: Mol): number {
  let n = m.annotations?.length ?? 0;
  for (const g of m.groups ?? []) n += g.annotations?.length ?? 0;
  for (const list of [m.captions, m.arrows, m.shapes, m.cycles] as (Holder[] | undefined)[]) for (const x of list ?? []) n += x.notes?.length ?? 0;
  return n;
}

// The drawing with each target's annotations replaced (an empty list takes them off). The same drawing when nothing
// changes; otherwise only the lists changed are new.
function withLists(m: Mol, lists: Map<Target, Annotation[]>): Mol {
  if (!lists.size) return m;
  const out: Mol = { ...m }, list = (l: Annotation[]) => (l.length ? l : undefined);
  if (lists.has("drawing")) { const l = list(lists.get("drawing")!); if (l) out.annotations = l; else delete out.annotations; }
  const each = <T extends { id: number }>(xs: T[] | undefined, key: "notes" | "annotations") => xs?.map((x) => {
    if (!lists.has(x.id)) return x;
    const l = list(lists.get(x.id)!), { [key]: _, ...rest } = x as T & Record<string, unknown>;
    return (l ? { ...rest, [key]: l } : rest) as unknown as T;
  });
  if (m.groups?.some((g) => lists.has(g.id))) out.groups = each(m.groups, "annotations");
  for (const k of ["captions", "arrows", "shapes", "cycles"] as const) if (m[k]?.some((x) => lists.has(x.id))) (out as Record<string, unknown>)[k] = each(m[k] as Holder[], "notes");
  return out;
}

// The targets' notes with this keyword set to text, cleaned (cleanNote): changed where there is one (the nth with the
// keyword), added after the others where there is none, taken off where text is empty. One change for all of them.
// Targets not in the drawing are left out. The same drawing when nothing changes. Throws with the reason when a target
// would have more than MAX_ANNOTATIONS, or the drawing more than MAX_NOTES.
export function withNote(m: Mol, targets: Iterable<Target>, text: string, keyword = NOTE, nth = 0): Mol {
  const v = cleanNote(text), lists = new Map<Target, Annotation[]>();
  let added = 0;
  for (const t of new Set(targets)) {
    if (!hasTarget(m, t)) continue;
    const had = annotationsOf(m, t) ?? [], at = had.map((a, k) => [a, k] as const).filter(([a]) => a.keyword === keyword)[nth]?.[1];
    if (at === undefined) {
      if (!v || nth > 0) continue;
      if (had.length >= MAX_ANNOTATIONS) throw new Error(`This ${t === "drawing" ? "drawing" : "object"} has ${MAX_ANNOTATIONS} annotations, the most Octet keeps.`);
      lists.set(t, [...had, { keyword, content: v }]);
      added++;
    } else if (!v) lists.set(t, had.filter((_, k) => k !== at));
    else if (had[at].content !== v) lists.set(t, had.map((a, k) => (k === at ? { keyword, content: v } : a)));
  }
  if (added && noteCount(m) + added > MAX_NOTES) throw new Error(`This drawing has ${MAX_NOTES.toLocaleString("en-GB")} notes, the most Octet keeps.`);
  return withLists(m, lists);
}

// The note targets in a selection: each group it holds whole (as one), then each text, arrow, shape or cycle picked
// that is in none of those groups. A TLC spot or lane picked is its plate (the plate is picked). Atoms are no target.
export function noteTargets(m: Mol, atoms: Set<number>, picked: Set<number>): number[] {
  if (!picked.size && !atoms.size) return [];
  const groups = selectedGroups(m, atoms, picked), inGroups = new Set(groups.flatMap((g) => g.items));
  const ids = new Set(items(m).map((x) => x.id));
  return [...groups.map((g) => (g as { id: number }).id), ...[...picked].filter((id) => ids.has(id) && !inGroups.has(id))];
}

// Every note in the drawing, for the Notes panel and the MCP: the drawing's first, then each object's and group's in
// reading order (top to bottom in rows a bond length deep, then left to right). Keywords that are not notes are left out.
export type NoteRow = { on: Target; keyword: string; text: string };
export function allNotes(m: Mol): NoteRow[] {
  const rows: NoteRow[] = (m.annotations ?? []).filter(isNote).map((a) => ({ on: "drawing", keyword: a.keyword, text: a.content }));
  const placed: { id: number; at: [number, number]; list: Annotation[] }[] = [];
  const add = (id: number, list: Annotation[] | undefined, at: () => [number, number]) => { if (list?.some(isNote)) placed.push({ id, at: at(), list }); };
  for (const c of m.captions ?? []) add(c.id, c.notes, () => [c.x, c.y]);
  for (const a of m.arrows ?? []) add(a.id, a.notes, () => [Math.min(a.from[0], a.to[0]), Math.max(a.from[1], a.to[1])]);
  for (const s of m.shapes ?? []) add(s.id, s.notes, () => [Math.min(s.from[0], s.to[0]), Math.max(s.from[1], s.to[1])]);
  for (const c of m.cycles ?? []) add(c.id, c.notes, () => [c.centre[0] - c.radius, c.centre[1] + c.radius]);
  if (placed.length || m.groups?.some((g) => g.annotations?.some(isNote))) {
    const where = new Map(placed.map((p) => [p.id, p.at]));
    const point = (id: number): [number, number] | undefined => {
      if (where.has(id)) return where.get(id);
      const c = m.captions?.find((x) => x.id === id) ?? m.arrows?.find((x) => x.id === id) ?? m.shapes?.find((x) => x.id === id) ?? m.cycles?.find((x) => x.id === id);
      return !c ? undefined : "text" in c ? [c.x, c.y] : "centre" in c ? c.centre : [Math.min(c.from[0], c.to[0]), Math.max(c.from[1], c.to[1])];
    };
    for (const g of m.groups ?? []) add(g.id, g.annotations, () => {
      const ps = [...g.atoms.flatMap((i) => (m.atoms[i] ? [[m.atoms[i].location[0], m.atoms[i].location[1]] as [number, number]] : [])), ...g.items.flatMap((id) => { const p = point(id); return p ? [p] : []; })];
      return ps.length ? [Math.min(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))] : [0, 0];
    });
  }
  placed.sort((p, q) => Math.floor(-p.at[1]) - Math.floor(-q.at[1]) || p.at[0] - q.at[0] || p.id - q.id);
  for (const p of placed) for (const a of p.list) if (isNote(a)) rows.push({ on: p.id, keyword: a.keyword, text: a.content });
  return rows;
}

// The drawing with at most MAX_NOTES annotations (or most): the drawing's first, then its groups' and its objects' in
// their order; the rest go. A file from before the editor kept the limit must open, and save and open again. The same
// drawing when it is within the limit.
export function capNotes(m: Mol, most = MAX_NOTES): Mol {
  if (noteCount(m) <= most) return m;
  let room = most;
  const lists = new Map<Target, Annotation[]>(), take = (t: Target, l?: Annotation[]) => {
    if (!l?.length) return;
    if (l.length > room) lists.set(t, l.slice(0, room));
    room = Math.max(0, room - l.length);
  };
  take("drawing", m.annotations);
  for (const g of m.groups ?? []) take(g.id, g.annotations);
  for (const x of items(m)) take(x.id, x.notes);
  return withLists(m, lists);
}

// The drawing as this user saves it (experiment.ts stamped), when Last changed by keeps it within MAX_ANNOTATIONS on the
// drawing and MAX_NOTES in all; otherwise as it is, so the file opens whole (no name is added).
export function stampedWithin(m: Mol, name: string): Mol {
  const s = stamped(m, name);
  return s === m || ((s.annotations?.length ?? 0) <= MAX_ANNOTATIONS && noteCount(s) <= MAX_NOTES) ? s : m;
}

// The drawing with no notes, for a picture, another app's clipboard, a template or an object window: every annotation
// whose keyword is a note's goes from the drawing, its groups and its objects. The same drawing when it has none, and
// the same result for the same drawing each time (so what is made from it is made once).
const bare = new WeakMap<Mol, Mol>();
export function withoutNotes(m: Mol): Mol {
  const kept = bare.get(m);
  if (kept) return kept;
  const lists = new Map<Target, Annotation[]>(), strip = (t: Target, l?: Annotation[]) => { if (l?.some(isNote)) lists.set(t, l.filter((a) => !isNote(a))); };
  strip("drawing", m.annotations);
  for (const g of m.groups ?? []) strip(g.id, g.annotations);
  for (const x of items(m)) strip(x.id, x.notes);
  const out = withLists(m, lists);
  bare.set(m, out);
  return out;
}
