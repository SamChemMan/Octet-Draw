// Names with r and s (pseudoasymmetric centres, P-93.5.1.1.2): (2R,3r,4S)-pentane-1,2,3,4,5-pentaol, (1r,4r)-4-
// methylcyclohexan-1-ol, (4ar,8ar)-decahydronaphthalene, (1R,3r,5S)-8-methyl-8-azabicyclo[3.2.1]octan-3-ol. OPSIN reads
// no r or s. Octet takes them out of the name and has OPSIN read the rest, which sets the constitution and every R, S,
// E and Z. The centres left open (an sp3 carbon with two ligands alike in the constitution, and stereo in them) are
// then tried in each configuration: Octet's own labeller (cip.ts) labels each one, and the ones with the name's r and
// s are kept. They must all be one structure (one standard InChI), or there is no reading.
//
// Which of those is the name's: one whose Octet name is the name itself (Octet's own names, as Structure to Name reads
// them back); otherwise every configuration with the name's r and s must be one structure, whichever atoms the name's
// locants are on, and Octet's name for it must cite them at the same locants. So a name that numbers the structure
// another way still reads, and one that could mean two structures never does.
import { stereoMarks } from "./cip.ts";
import type { Mol } from "./render.ts";

type Cip = { atoms: (string | undefined)[]; bonds: (string | undefined)[] };
export type PseudoApi = {
  // A structure laid out from SMILES (Indigo), its atoms in the SMILES's order. These may throw (Indigo not ready): the
  // reading then throws, and names.ts keeps nothing.
  mol: (smiles: string) => Mol | undefined;
  inchi: (smiles: string) => string | undefined;
  cip: (m: Mol) => Cip;
  // Octet's name for a structure with these labels (the namer only).
  name: (m: Mol, cip: Cip) => string | undefined;
};
// Limits: the name's length, the open centres (2^6 = 64 tries) and the heavy atoms.
export const MOST_PSEUDO_NAME = 300, MOST_OPEN = 6, MOST_PSEUDO_ATOMS = 120;

// A stereodescriptor list in front of what it belongs to: "(2R,3r,4S)-", "(4ar,8ar)-", "(1R)-", "(s)-".
const ITEM = String.raw`(?:\d{1,3}[a-z]?'*)?[RSEZrs]`;
const LIST = new RegExp(String.raw`\((${ITEM}(?:,${ITEM})*)\)-`, "g");
// Whether a name has an r or s in a stereodescriptor list: only those go to the reader.
export function citesPseudo(name: string): boolean {
  if (!/[rs][,)]/.test(name)) return false;
  for (const m of name.matchAll(LIST)) if (m[1].split(",").some((t) => /[rs]$/.test(t))) return true;
  return false;
}

// The name's r and s items in order, the r and s the structure has (each list's letters as often as the multiplying
// prefixes round it say: bis[(1s,4s)-4-methylcyclohexyl] has four s), and the name without its r and s (a list left
// empty goes). Undefined for a name Octet does not read this way: relative or racemic stereo (rel-, rac-, R*), or a
// locant given twice in a list.
const MULTIPLIED: Record<string, number> = { bis: 2, tris: 3, tetrakis: 4, pentakis: 5, hexakis: 6, heptakis: 7, octakis: 8, nonakis: 9, decakis: 10 };
type Parsed = { rs: string[]; letters: string; rest: string };
function parse(name: string): Parsed | undefined {
  if (name.length > MOST_PSEUDO_NAME || /\b(?:rel|rac)-|\*/.test(name)) return undefined;
  // How many times each place in the name counts.
  const times: number[] = [], stack = [1];
  for (let i = 0; i < name.length; i++) {
    const c = name[i];
    if (c === "(" || c === "[" || c === "{") stack.push(stack[stack.length - 1] * (MULTIPLIED[/(bis|tris|tetrakis|pentakis|hexakis|heptakis|octakis|nonakis|decakis)$/.exec(name.slice(0, i))?.[1] ?? ""] ?? 1));
    times.push(stack[stack.length - 1]);
    if ((c === ")" || c === "]" || c === "}") && stack.length > 1) stack.pop();
  }
  const rs: string[] = [], letters: string[] = [];
  let ok = true;
  const rest = name.replace(LIST, (_, list: string, at: number) => {
    const items = list.split(","), locants = items.map((t) => t.slice(0, -1));
    if (locants.some((l, k) => l && locants.indexOf(l) !== k)) ok = false;
    for (const t of items.filter((x) => /[rs]$/.test(x))) { rs.push(t); for (let k = 0; k < times[at]; k++) letters.push(t.slice(-1)); }
    const kept = items.filter((t) => !/[rs]$/.test(t));
    return kept.length ? `(${kept.join(",")})-` : "";
  });
  return ok && rs.length && rest.trim() ? { rs, letters: letters.sort().join(""), rest } : undefined;
}
// A name's descriptor lists, and the name without them, lower case: two names alike in both are one name.
const lists = (name: string) => [...name.matchAll(LIST)].map((m) => m[1]).join(";");
const bare = (name: string) => name.replace(LIST, "").replace(/\s+/g, " ").trim().toLowerCase();
const rsOf = (name: string) => [...name.matchAll(LIST)].flatMap((m) => m[1].split(",").filter((t) => /[rs]$/.test(t)));

// ——— SMILES as OPSIN writes it (Kekulé, no aromatic atoms) ———
type Atom = { el: string; start: number; end: number; bracket: boolean; chiral?: "@" | "@@"; h: number; charge: number; iso: number };
type Smiles = { atoms: Atom[]; bonds: [number, number, number][]; around: number[][]; from: boolean[]; directional: Set<number>; dirBonds: Set<string> };
const ORGANIC = /^(Cl|Br|B|C|N|O|P|S|F|I)/;
const VALENCE: Record<string, number[]> = { B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1], Br: [1], I: [1] };
// The atoms (each with its hydrogens), bonds and, for each atom, its neighbours in the order SMILES reads a
// configuration in (-1 a hydrogen): the atom before it, its hydrogen, its ring closures, then the atoms after it.
// from: whether an atom has one before it. directional: the atoms on a / or \ bond, and those bonds ("a b", a < b).
// Undefined for SMILES this does not cover (aromatic atoms, @TH and the like).
function readSmiles(s: string): Smiles | undefined {
  const atoms: Atom[] = [], bonds: [number, number, number][] = [], around: number[][] = [], from: boolean[] = [], directional = new Set<number>(), dirBonds = new Set<string>();
  const directed = (a: number, b: number) => { directional.add(a); directional.add(b); dirBonds.add(`${Math.min(a, b)} ${Math.max(a, b)}`); };
  const stack: number[] = [], rings = new Map<number, { atom: number; order: number; slot: number }>();
  let prev = -1, order = 0, dir = false;
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === "(") { if (prev < 0) return undefined; stack.push(prev); i++; continue; }
    if (c === ")") { if (!stack.length) return undefined; prev = stack.pop()!; i++; continue; }
    if (c === ".") { prev = -1; i++; continue; }
    if ("-=#/\\".includes(c)) { order = c === "=" ? 2 : c === "#" ? 3 : 1; dir = c === "/" || c === "\\"; i++; continue; }
    if (/[0-9%]/.test(c)) {
      const m = /^(?:%(\d\d)|(\d))/.exec(s.slice(i));
      if (!m || prev < 0) return undefined;
      const n = Number(m[1] ?? m[2]), open = rings.get(n);
      if (open) {
        const o = order || Math.max(open.order, 1);
        if (open.order < 0) directed(prev, open.atom);
        bonds.push([open.atom, prev, o]);
        around[open.atom][open.slot] = prev;
        around[prev].push(open.atom);
        rings.delete(n);
      } else { rings.set(n, { atom: prev, order: dir ? -1 : order, slot: around[prev].length }); around[prev].push(-2); }
      if (dir && open) directed(prev, open.atom);
      order = 0; dir = false; i += m[0].length;
      continue;
    }
    let atom: Atom;
    if (c === "[") {
      const close = s.indexOf("]", i), m = close > 0 ? /^\[(\d*)([A-Z][a-z]?)(@@?)?(H\d?)?([+-]\d?|\+\+|--)?\]$/.exec(s.slice(i, close + 1)) : null;
      if (!m) return undefined;
      const q = m[5] === "++" ? 2 : m[5] === "--" ? -2 : m[5] ? (m[5][0] === "+" ? 1 : -1) * (Number(m[5].slice(1)) || 1) : 0;
      atom = { el: m[2], start: i, end: close + 1, bracket: true, ...(m[3] ? { chiral: m[3] as "@" | "@@" } : {}), h: m[4] ? Number(m[4].slice(1)) || 1 : 0, charge: q, iso: Number(m[1]) || 0 };
    } else {
      const m = ORGANIC.exec(s.slice(i));
      if (!m) return undefined;
      atom = { el: m[1], start: i, end: i + m[1].length, bracket: false, h: -1, charge: 0, iso: 0 };
    }
    const k = atoms.length;
    atoms.push(atom);
    around.push([]);
    from.push(prev >= 0);
    if (prev >= 0) { bonds.push([prev, k, order || 1]); around[prev].push(k); around[k].push(prev); if (dir) directed(prev, k); }
    if (atom.bracket && atom.h === 1) around[k].push(-1);
    prev = k; order = 0; dir = false;
    i = atom.end;
  }
  if (rings.size || stack.length) return undefined;
  // An organic atom's hydrogens: the lowest usual valence its bonds leave room for.
  const used = atoms.map(() => 0);
  for (const [a, b, o] of bonds) { used[a] += o; used[b] += o; }
  for (const [k, a] of atoms.entries()) if (a.h < 0) a.h = Math.max(0, (VALENCE[a.el].find((v) => v >= used[k]) ?? used[k]) - used[k]);
  return { atoms, bonds, around, from, directional, dirBonds };
}

// Atoms alike in the constitution (element, charge, isotope, hydrogens and bonds, refined over their neighbours until
// no class splits). A ring bond between two atoms with double bonds counts as neither single nor double, so the two
// Kekulé forms of a benzene ring are alike. Coarse where that is not so, which can only add open centres to try.
function classes(sm: Smiles): number[] {
  const n = sm.atoms.length, adj: [number, number | string][][] = sm.atoms.map(() => []), near: number[][] = sm.atoms.map(() => []);
  for (const [a, b] of sm.bonds) { near[a].push(b); near[b].push(a); }
  const sp2 = sm.atoms.map(() => false);
  for (const [a, b, o] of sm.bonds) if (o === 2) sp2[a] = sp2[b] = true;
  // Whether a and b are joined other than by their own bond.
  const inRing = (a: number, b: number) => {
    const seen = new Set([a]);
    for (const todo = [a]; todo.length; ) {
      const v = todo.pop()!;
      for (const w of near[v]) if (!(v === a && w === b) && !seen.has(w)) { if (w === b) return true; seen.add(w); todo.push(w); }
    }
    return false;
  };
  for (const [a, b, o] of sm.bonds) { const k = o <= 2 && sp2[a] && sp2[b] && inRing(a, b) ? "a" : o; adj[a].push([b, k]); adj[b].push([a, k]); }
  const rank = (keys: string[]) => { const sorted = [...new Set(keys)].sort(); return keys.map((k) => sorted.indexOf(k)); };
  let cls = rank(sm.atoms.map((a, i) => `${a.el} ${a.charge} ${a.iso} ${a.h} ${adj[i].map(([, o]) => o).sort().join("")}`));
  for (let round = 0; round < n; round++) {
    const next = rank(cls.map((c, i) => `${c}|${adj[i].map(([j, o]) => `${o}:${cls[j]}`).sort().join(",")}`));
    if (new Set(next).size === new Set(cls).size) break;
    cls = next;
  }
  return cls;
}

// The centres the name leaves open: sp3 carbons with four ligands (at most one a hydrogen) and no configuration in the
// SMILES, two of whose ligands are alike in the constitution (and the others not), and whose two alike ligands lead to
// stereo: a centre with a configuration, a / or \ bond, or another open centre.
function openCentres(sm: Smiles): number[] {
  const cls = classes(sm), adj: number[][] = sm.atoms.map(() => []);
  for (const [a, b] of sm.bonds) { adj[a].push(b); adj[b].push(a); }
  const single = sm.atoms.map(() => true);
  for (const [a, b, o] of sm.bonds) if (o !== 1) single[a] = single[b] = false;
  const pairOf = (i: number): number[] | undefined => {
    const ids = adj[i].map((j) => cls[j]), alike = adj[i].filter((j, k) => ids.indexOf(cls[j]) !== k || ids.lastIndexOf(cls[j]) !== k);
    return alike.length === 2 ? alike : undefined;
  };
  let open = sm.atoms.flatMap((a, i) => (a.el === "C" && !a.chiral && !a.charge && !a.iso && single[i] && a.h <= 1 && adj[i].length + a.h === 4 && pairOf(i) ? [i] : []));
  const fixed = new Set(sm.atoms.flatMap((a, i) => (a.chiral ? [i] : [])));
  for (let changed = true; changed; ) {
    changed = false;
    const keep = open.filter((i) => pairOf(i)!.some((t) => {
      const seen = new Set([i, t]);
      for (const todo = [t]; todo.length; ) {
        const v = todo.pop()!;
        if (fixed.has(v) || sm.directional.has(v) || (v !== i && open.includes(v))) return true;
        for (const w of adj[v]) if (!seen.has(w)) { seen.add(w); todo.push(w); }
      }
      return false;
    }));
    if (keep.length !== open.length) { open = keep; changed = true; }
  }
  return open;
}

// A configuration as cip.ts keeps one (render.ts Atom.kept): the neighbours in an order whose first three turn
// clockwise seen with the fourth away. SMILES's @: seen from the first neighbour, the others turn anticlockwise; so
// with the first away, clockwise.
const keptOrder = (n: number[], hand: "@" | "@@") => (hand === "@" ? [n[1], n[2], n[3], n[0]] : [n[2], n[1], n[3], n[0]]);
// Each atom's neighbours in SMILES order, a hydrogen (-1) placed as [C@H] places it: after the atom before it.
const withH = (sm: Smiles, i: number) => (sm.atoms[i].bracket || !sm.atoms[i].h ? sm.around[i] : sm.from[i] ? [sm.around[i][0], -1, ...sm.around[i].slice(1)] : [-1, ...sm.around[i]]);

// The structure as the labeller reads it, from SMILES and Indigo's layout of it: every configuration from the SMILES
// (as kept ones), none from wedges, and no E or Z where the SMILES gives none (a crossed double bond). keep sets a
// centre's configuration. Undefined where the layout's atoms or bonds are not the SMILES's.
function labelling(sm: Smiles, laid: Mol | undefined): { base: Mol; keep: (m: Mol, i: number, hand: "@" | "@@") => void } | undefined {
  if (!laid || laid.atoms.length !== sm.atoms.length || laid.atoms.some((a, i) => a.label !== sm.atoms[i].el)) return undefined;
  const key = (a: number, b: number) => `${Math.min(a, b)} ${Math.max(a, b)}`, have = new Set(laid.bonds.map((b) => key(...b.atoms)));
  if (laid.bonds.length !== sm.bonds.length || sm.bonds.some(([a, b]) => !have.has(key(a, b)))) return undefined;
  const side = (a: number, b: number) => laid.bonds.some((x) => x.atoms.includes(a) && !x.atoms.includes(b) && sm.dirBonds.has(key(...x.atoms)));
  const base: Mol = { atoms: laid.atoms.map(({ kept: _, ...a }) => a), bonds: laid.bonds.map(({ stereo: _, ...b }) => (b.type === 2 && !(side(b.atoms[0], b.atoms[1]) && side(b.atoms[1], b.atoms[0])) ? { ...b, display: "either" as const } : b)) };
  const keep = (m: Mol, i: number, hand: "@" | "@@") => { const atoms = keptOrder(withH(sm, i), hand); m.atoms[i] = { ...m.atoms[i], kept: { atoms, marks: stereoMarks(m, i, atoms) } }; };
  sm.atoms.forEach((a, i) => { if (a.chiral) keep(base, i, a.chiral); });
  return { base, keep };
}
// The labels the reader gives a SMILES with its centres set: for the checks, which compare them with the labels of
// the structure drawn from it.
export function smilesLabels(smiles: string, api: PseudoApi): Cip | undefined {
  const sm = readSmiles(smiles), l = sm && labelling(sm, api.mol(smiles));
  return l && api.cip(l.base);
}

// SMILES for a name with r or s, or undefined. read: OPSIN.
export function pseudoSmiles(name: string, read: (name: string) => string | undefined, api: PseudoApi): string | undefined {
  const p = parse(name.trim());
  if (!p) return undefined;
  const smiles = read(p.rest);
  if (!smiles || smiles.length > 4 * MOST_PSEUDO_NAME) return undefined;
  const sm = readSmiles(smiles);
  if (!sm || sm.atoms.length > MOST_PSEUDO_ATOMS || sm.atoms.some((a, i) => a.chiral && sm.around[i].length !== 4)) return undefined;
  const open = openCentres(sm);
  if (!open.length || open.length > MOST_OPEN) return undefined;
  const l = labelling(sm, api.mol(smiles));
  if (!l) return undefined;
  const { base, keep } = l;
  // Each configuration as SMILES, and one of each stereoisomer (by standard InChI): two configurations with one InChI
  // are one structure, with the same labels and name. Labelling (cip.ts) costs more than InChI in a cage.
  const want = p.letters, isomers = new Map<string, ("@" | "@@")[]>();
  const smilesOf = (hands: ("@" | "@@")[]) => open.map((i, k) => [i, k]).sort((x, y) => y[0] - x[0]).reduce((s, [i, k]) => {
    const a = sm.atoms[i];
    return `${s.slice(0, a.start)}[${a.el}${hands[k]}${a.h ? "H" : ""}]${s.slice(a.end)}`;
  }, smiles);
  // With no configuration in the SMILES, a configuration's mirror image is every open centre turned: the same structure
  // when its InChI has no /m, else the other enantiomer (/m0 and /m1 swapped). So half the configurations are enough.
  const mirrored = !sm.atoms.some((a) => a.chiral), turn = (h: "@" | "@@") => (h === "@" ? "@@" : "@");
  for (let bits = 0; bits < 1 << open.length; bits += mirrored ? 2 : 1) {
    const hands = open.map((_, k) => ((bits >> k) & 1 ? "@@" : "@") as "@" | "@@"), inchi = api.inchi(smilesOf(hands));
    if (!inchi) return undefined;
    if (!isomers.has(inchi)) isomers.set(inchi, hands);
    const m = mirrored ? /\/m([01])(?=\/|$)/.exec(inchi) : null;
    if (m) { const other = inchi.replace(/\/m[01](?=\/|$)/, `/m${1 - Number(m[1])}`); if (!isomers.has(other)) isomers.set(other, hands.map(turn)); }
  }
  // The stereoisomers with the name's r and s, and Octet's name for each.
  const found: { hands: ("@" | "@@")[]; name: string }[] = [];
  for (const hands of isomers.values()) {
    const mol: Mol = { ...base, atoms: [...base.atoms] };
    open.forEach((i, k) => keep(mol, i, hands[k]));
    const cip = api.cip(mol);
    if (cip.atoms.filter((x) => x === "r" || x === "s").sort().join("") === want) found.push({ hands, name: api.name(mol, cip) ?? "" });
  }
  // The name is Octet's own name for one of them; or there is one, and Octet's name for it cites the name's r and s at
  // the same locants.
  const own = found.filter((t) => t.name && bare(t.name) === bare(name) && lists(t.name) === lists(name));
  if (own.length) return own.length === 1 ? smilesOf(own[0].hands) : undefined;
  return found.length === 1 && rsOf(found[0].name).join(",") === p.rs.join(",") ? smilesOf(found[0].hands) : undefined;
}
// The reader as names.ts takes it (setPseudoReader).
export const pseudoReader = (api: PseudoApi) => (name: string, read: (name: string) => string | undefined) => pseudoSmiles(name, read, api);
