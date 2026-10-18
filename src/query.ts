// Query and Markush structures, as ChemDraw 26.1 has them (decision 0006): what a query label means (generic labels,
// element and NOT lists, link nodes, anonymous alternative groups), the indicators ChemDraw draws for atom and bond
// query properties, R-group definitions, and what a polymer bracket encloses and is labelled.
import { ELEMENTS, isGeneric } from "./labels.ts";
import { inShape, isBracket, type Atom, type AtomQuery, type Bond, type BracketUsage, type Mol, type Polymer, type Shape } from "./render.ts";

export { GENERICS, isGeneric } from "./labels.ts";

// Element symbols a list can hold: the elements, and D and T for hydrogen's isotopes.
const symbol = (s: string) => ELEMENTS.has(s) || s === "T";
// A list typed as a label, brackets optional: its items, and NOT (or a minus sign) for a NOT list.
function listOf(text: string): { not: boolean; items: string[] } | undefined {
  const m = /^\[?\s*(NOT\s+|-\s*)?([^[\]]*?)\s*\]?$/.exec(text.trim());
  if (!m || !m[2].includes(",") && !m[1]) return undefined;
  const items = m[2].split(",").map((s) => s.trim());
  return items.every(Boolean) ? { not: !!m[1], items } : undefined;
}
// An element list ([Cl, Br, I]) or NOT list ([NOT Cl, Br]): only element symbols, two or more (one or more for NOT).
export function elementList(text: string): { not: boolean; elements: string[] } | undefined {
  const l = listOf(text);
  return l && l.items.every(symbol) && (l.not || l.items.length > 1) ? { not: l.not, elements: l.items } : undefined;
}
// An anonymous alternative group ([CH3, CH2OH, Ph]): two or more items, not all element symbols, not a NOT list.
export function altGroup(text: string): string[] | undefined {
  const l = listOf(text);
  return l && !l.not && l.items.length > 1 && !l.items.every(symbol) && l.items.every((s) => s.length <= 20 && /^[\w()*'+-]+$/.test(s)) ? l.items : undefined;
}
// A link node ([CH2]3-7, O1-3): one element (with its hydrogens) or a generic label, repeated low to high times in a
// chain; brackets, parentheses or braces round it are optional.
export function linkNode(text: string): { element: string; h: number; generic?: string; low: number; high: number } | undefined {
  const m = /^[[({]?(.+?)[\])}]?(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!m) return undefined;
  const el = /^([A-Z][a-z]?)(H(\d?))?$/.exec(m[1]), low = Number(m[2]), high = Number(m[3]);
  if (!(low >= 1 && high >= low)) return undefined;
  if (el && ELEMENTS.has(el[1])) return { element: el[1], h: el[2] ? Number(el[3] || 1) : 0, low, high };
  return isGeneric(m[1]) ? { element: "C", h: 0, generic: m[1], low, high } : undefined;
}
// What a label means as a query, if anything.
export type QueryLabel = "generic" | "list" | "alt" | "link";
export function queryLabel(text?: string): QueryLabel | undefined {
  if (!text) return undefined;
  return isGeneric(text) ? "generic" : elementList(text) ? "list" : linkNode(text) ? "link" : altGroup(text) ? "alt" : undefined;
}

// The indicator ChemDraw draws beside an atom for its query properties: Substituents (*n free sites, Un up to, Xn
// exactly), H (implicit hydrogens), R (ring bond count), S (unsaturation), C (reaction change), T (reaction stereo),
// L (translation). Abnormal valence and isotopic abundance have none.
export function atomIndicator(q?: AtomQuery): string {
  if (!q) return "";
  const s = q.subst ? `${{ free: "*", upto: "U", exactly: "X" }[q.subst.kind]}${q.subst.n}` : "";
  return s + (q.noH ? "H" : "") + (q.rings ? "R" : "") + (q.unsat ? "S" : "") + (q.change ? "C" : "") + (q.stereo ? "T" : "") + (q.translation ? "L" : "");
}
// The indicators beside a bond: its query type (Any, S/D, S/A, D/A), topology (Rng, Chn, R/C) and reaction centre (Rxn).
export function bondIndicator(b: Pick<Bond, "query" | "topology" | "rxn">): string {
  return [b.query && { any: "Any", sd: "S/D", sa: "S/A", da: "D/A" }[b.query], b.topology && { ring: "Rng", chain: "Chn", either: "R/C" }[b.topology], b.rxn && "Rxn"].filter(Boolean).join(" ");
}
// Whether an atom query has any property set.
export const anyQuery = (q?: AtomQuery) => !!q && Object.keys(q).length > 0;
// A drawing with anything only a query file can hold: query properties, query labels, attachments, R-group
// definitions or polymer brackets.
export function hasQuery(m: Mol): boolean {
  return m.atoms.some((a) => anyQuery(a.query) || !!a.centre || !!queryLabel(a.text)) || m.bonds.some((b) => b.query || b.topology || b.rxn)
    || !!m.shapes?.some((sh) => sh.rgroup || sh.polymer);
}

// The values each query property can take, for checking what a file holds.
export const QUERY_VALUES = {
  subst: ["free", "upto", "exactly"], rings: ["none", "drawn", "simple", "fusion", "spiro"], unsat: ["absent", "present"], stereo: ["inversion", "retention"],
  translation: ["broad", "narrow", "any"], abundance: ["any", "natural", "enriched", "deficient", "nonnatural"],
  query: ["any", "sd", "sa", "da"], topology: ["ring", "chain", "either"], rxn: ["centre", "makebreak", "change", "makechange", "not", "nochange", "unmapped"],
} as const;
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => list.includes(v as T);
// An atom query from a file, with anything unsound left out; undefined when nothing is left.
export function readAtomQuery(v: unknown): AtomQuery | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>, s = o.subst as Record<string, unknown> | undefined, q: AtomQuery = {};
  if (s && oneOf(QUERY_VALUES.subst, s.kind) && Number.isInteger(s.n) && (s.n as number) >= 0 && (s.n as number) <= 15) q.subst = { kind: s.kind, n: s.n as number };
  if (o.noH === true) q.noH = true;
  if (oneOf(QUERY_VALUES.rings, o.rings)) q.rings = o.rings;
  if (oneOf(QUERY_VALUES.unsat, o.unsat)) q.unsat = o.unsat;
  if (o.change === true) q.change = true;
  if (oneOf(QUERY_VALUES.stereo, o.stereo)) q.stereo = o.stereo;
  if (oneOf(QUERY_VALUES.translation, o.translation)) q.translation = o.translation;
  if (oneOf(QUERY_VALUES.abundance, o.abundance)) q.abundance = o.abundance;
  if (o.valence === true) q.valence = true;
  return Object.keys(q).length ? q : undefined;
}
// A bond's query properties from a file, with anything unsound left out.
export function readBondQuery(o: Record<string, unknown>): Pick<Bond, "query" | "topology" | "rxn"> {
  return { ...(oneOf(QUERY_VALUES.query, o.query) ? { query: o.query } : {}), ...(oneOf(QUERY_VALUES.topology, o.topology) ? { topology: o.topology } : {}), ...(oneOf(QUERY_VALUES.rxn, o.rxn) ? { rxn: o.rxn } : {}) };
}
// A bracket's polymer meaning from a file, if it is sound.
export function readPolymer(v: unknown): Polymer | undefined {
  const o = v as Record<string, unknown>;
  if (!o || typeof o !== "object" || !oneOf(USAGE_KINDS, o.usage)) return undefined;
  const p: Polymer = { usage: o.usage };
  if (typeof o.label === "string" && o.label.length <= 20 && !/[\u0000-\u001f<>]/.test(o.label)) p.label = o.label;
  if (Number.isInteger(o.order) && (o.order as number) >= 0 && (o.order as number) <= 999) p.order = o.order as number;
  if (o.pattern === "hh" || o.pattern === "eu") p.pattern = o.pattern;
  if (o.flip === "noflip" || o.flip === "flip") p.flip = o.flip;
  if (typeof o.mw === "number" && Number.isFinite(o.mw) && o.mw > 0 && o.mw < 1e9) p.mw = o.mw;
  return p;
}
// An R-group definition from a file, if it is sound: a name of R and a number (R1 to R99), and its R-Logic.
export function readRgroup(v: unknown): Shape["rgroup"] {
  const o = v as Record<string, unknown>;
  if (!o || typeof o !== "object" || typeof o.name !== "string" || !rNumber(o.name)) return undefined;
  return { name: o.name, ...(typeof o.occur === "string" && /^[\d\s,<>=-]{1,20}$/.test(o.occur) ? { occur: o.occur.trim() } : {}), ...(o.restH === true ? { restH: true as const } : {}),
    ...(typeof o.then === "string" && rNumber(o.then) ? { then: o.then } : {}) };
}

// Bracket usages: ChemDraw's menu name, its CDXML name, its MDL S-group type (and subtype), and the label drawn at the
// bracket's lower right (ChemDraw's: n for an SRU, the repeat count for a multiple group, c and its order for a
// component, none for generic and unspecified).
export const USAGES: Record<BracketUsage, { name: string; cdxml: string; mdl: string; sub?: string; label: string }> = {
  sru: { name: "SRU (n)", cdxml: "SRU", mdl: "SRU", label: "n" },
  param: { name: "Parameterizable (#/#-#/MW)", cdxml: "MultipleGroup", mdl: "SRU", label: "n" },
  mult: { name: "Multiple group (#)", cdxml: "MultipleGroup", mdl: "MUL", label: "2" },
  mon: { name: "Monomer (mon)", cdxml: "Monomer", mdl: "MON", label: "mon" },
  mer: { name: "Mer (mer)", cdxml: "Mer", mdl: "MER", label: "mer" },
  co: { name: "Copolymer (co)", cdxml: "Copolymer", mdl: "COP", label: "co" },
  alt: { name: "Copolymer, alternating (alt)", cdxml: "CopolymerAlternating", mdl: "COP", sub: "ALT", label: "alt" },
  ran: { name: "Copolymer, random (ran)", cdxml: "CopolymerRandom", mdl: "COP", sub: "RAN", label: "ran" },
  blk: { name: "Copolymer, block (blk)", cdxml: "CopolymerBlock", mdl: "COP", sub: "BLO", label: "blk" },
  xl: { name: "Crosslink (xl)", cdxml: "Crosslink", mdl: "CRO", label: "xl" },
  grf: { name: "Graft (grf)", cdxml: "Graft", mdl: "GRA", label: "grf" },
  mod: { name: "Modification (mod)", cdxml: "Modification", mdl: "MOD", label: "mod" },
  c: { name: "Component (c)", cdxml: "Component", mdl: "COM", label: "c" },
  mix: { name: "Mixture, unordered (mix)", cdxml: "MixtureUnordered", mdl: "MIX", label: "mix" },
  f: { name: "Mixture, ordered (f)", cdxml: "MixtureOrdered", mdl: "FOR", label: "f" },
  anyp: { name: "Anypolymer (anyp)", cdxml: "Anypolymer", mdl: "ANY", label: "anyp" },
  gen: { name: "Generic", cdxml: "Generic", mdl: "GEN", label: "" },
};
export const USAGE_KINDS = Object.keys(USAGES) as BracketUsage[];
// The text at a bracket's lower right: an SRU's or parameterizable bracket's label, a multiple group's count, a
// component's c and number, or the usage's own.
export function polymerLabel(p: Polymer): string {
  if (p.usage === "c") return `c${p.order ?? ""}`;
  if (p.usage === "sru" || p.usage === "mult" || p.usage === "param") return p.label ?? USAGES[p.usage].label;
  return USAGES[p.usage].label;
}
// The text at a bracket's upper right: hh or eu for a head-to-head or unknown repeat pattern, flip, and a
// parameterizable bracket's molecular weight.
export const polymerTags = (p: Polymer) => [p.pattern ?? "", p.flip === "flip" ? "flip" : "", p.usage === "param" && p.mw ? `Mw ${p.mw}` : ""].filter(Boolean).join(" ");
// A multiple group's repeat count, or a parameterizable bracket's (its count, the middle of its range, or its Mw over
// the repeat unit's mass): undefined where the count is not a number (n).
export function repeatCount(p: Polymer, unitWeight?: number): number | undefined {
  if (p.usage === "param" && p.mw && unitWeight) return p.mw / unitWeight;
  if (p.usage !== "mult" && p.usage !== "param") return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*$/.exec(p.label ?? (p.usage === "mult" ? "2" : ""));
  return m ? (m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1])) : undefined;
}

// What a pair of brackets encloses: the atoms inside the box, and the bonds that cross it (one atom in, one out).
export function enclosed(m: Mol, sh: Shape): { atoms: number[]; crossing: number[] } {
  const inside = new Set<number>();
  m.atoms.forEach((a, i) => { if (inShape(sh, [a.location[0], a.location[1]])) inside.add(i); });
  return { atoms: [...inside], crossing: m.bonds.flatMap((b, k) => (inside.has(b.atoms[0]) !== inside.has(b.atoms[1]) ? [k] : [])) };
}
// The polymer brackets of a drawing that enclose atoms, with what they enclose.
export function polymerBrackets(m: Mol): { sh: Shape; atoms: number[]; crossing: number[] }[] {
  return (m.shapes ?? []).flatMap((sh) => {
    if (!sh.polymer || !isBracket(sh) || sh.side) return [];
    const e = enclosed(m, sh);
    return e.atoms.length ? [{ sh, ...e }] : [];
  });
}
// The R-group definitions: each box with an R-group name and the structures inside it (atoms in a fragment wholly in
// the box), in the box's order.
export function rgroupMembers(m: Mol, frags: number[][]): { sh: Shape; members: number[][] }[] {
  return (m.shapes ?? []).filter((sh) => sh.rgroup).map((sh) => ({ sh, members: frags.filter((f) => f.every((i) => inShape(sh, [m.atoms[i].location[0], m.atoms[i].location[1]]))) }));
}
// The R number of an R label: R1 to R99 (R alone is not numbered).
export const rNumber = (text?: string) => { const m = /^R([1-9]\d?)$/.exec(text ?? ""); return m ? Number(m[1]) : undefined; };
// A multi-centre or variable attachment's place: the centre of its atoms.
export function attachmentCentre(m: Mol, a: Atom): [number, number] | undefined {
  const at = (a.centre?.atoms ?? []).filter((i) => m.atoms[i]);
  if (!at.length) return undefined;
  return [at.reduce((s, i) => s + m.atoms[i].location[0], 0) / at.length, at.reduce((s, i) => s + m.atoms[i].location[1], 0) / at.length];
}
// Every attachment set at the centre of its atoms, so it stays there as its atoms move.
export function placeAttachments(m: Mol): Mol {
  if (!m.atoms.some((a) => a.centre)) return m;
  let changed = false;
  const atoms = m.atoms.map((a) => {
    const c = a.centre && attachmentCentre(m, a);
    if (!c || (Math.abs(c[0] - a.location[0]) < 1e-9 && Math.abs(c[1] - a.location[1]) < 1e-9)) return a;
    changed = true;
    return { ...a, location: [c[0], c[1], a.location[2] ?? 0] as [number, number, number] };
  });
  return changed ? { ...m, atoms } : m;
}
// A mass as Analysis shows it; a polymer's as its end groups plus its repeat unit with its label: 30.07 + (28.05)n.
type Repeated = { weight: number; exact: number; repeat?: { label: string; weight: number; exact: number; ends?: { weight: number; exact: number } } };
export function massText(v: Repeated, key: "weight" | "exact", places: number): string {
  const r = v.repeat;
  if (!r) return v[key].toFixed(places);
  return `${r.ends ? `${r.ends[key].toFixed(places)} + ` : ""}(${r[key].toFixed(places)})${r.label}`;
}
