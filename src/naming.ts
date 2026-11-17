// Structure to name. Octet's namer writes a name from the molecular graph, and the name is only shown if OPSIN
// reads it back as the same structure (same standard InChI, stereochemistry included), so a wrong name never shows.
import { hydrogens, type Mol } from "./render.ts";
import { commonKey } from "./common.ts";

// A checked name with the abbreviation chemists cite after it in an experimental section, "N1,N1-bis(2-aminoethyl)
// ethane-1,2-diamine (TREN)". The name alone where it is the abbreviation (Wilkinson's catalyst) or there is none.
export const withAbbreviation = (name: string, abbreviation?: string) =>
  abbreviation && commonKey(abbreviation) !== commonKey(name) ? `${name} (${abbreviation})` : name;

// The namer's input: Kekulé bonds and explicit hydrogen counts, with CIP labels (R, S on atoms; E, Z on double
// bonds) where the drawing has stereochemistry. iso: an atom's mass number (13 for ¹³C, 2 for a D atom); hx: the
// mass numbers of the isotopic hydrogens counted in h (the namer folds D and T atoms into their neighbours).
export type Graph = { atoms: { el: string; charge: number; h: number; cip?: string; iso?: number; hx?: number[] }[]; bonds: { a: number; b: number; order: 1 | 2 | 3; cip?: string }[] };
export type Cip = { atoms: (string | undefined)[]; bonds: (string | undefined)[] };

// A drawing (labels already expanded into atoms) as the namer's graph. Undefined for what the graph cannot hold:
// text labels and radicals, and isotopes (D, T and mass numbers) unless isotopes is set.
export function graphOf(m: Mol, cip?: Cip, isotopes = false): Graph | undefined {
  const iso = (a: Mol["atoms"][number]) => a.isotope ?? (a.label === "D" ? 2 : a.label === "T" ? 3 : undefined);
  if (m.bonds.some((b) => b.type < 1 || b.type > 3) || m.atoms.some((a) => a.text || a.radical || (!isotopes && iso(a)))) return undefined;
  const used = m.atoms.map(() => 0);
  for (const b of m.bonds) for (const i of b.atoms) used[i] += b.type;
  return {
    atoms: m.atoms.map((a, i) => ({ el: iso(a) && (a.label === "D" || a.label === "T") ? "H" : a.label, charge: a.charge ?? 0,
      h: a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i]), ...(cip?.atoms[i] ? { cip: cip.atoms[i] } : {}), ...(iso(a) ? { iso: iso(a) } : {}) })),
    bonds: m.bonds.map((b, k) => ({ a: b.atoms[0], b: b.atoms[1], order: b.type as 1 | 2 | 3, ...(cip?.bonds[k] ? { cip: cip.bonds[k] } : {}) })),
  };
}

// The namer, once it is loaded.
let namer: ((g: Graph) => string | undefined) | undefined;
export const setNamer = (n: typeof namer) => { namer = n; };
// The namer's name for a structure with these labels, unchecked: for the reader of r and s (pseudo.ts).
export const namerName = (m: Mol, cip: Cip): string | undefined => { const g = namer && graphOf(m, cip, true); return g ? namer!(g) : undefined; };
// Names for coordination compounds (complexes.ts), with κ that OPSIN does not read: checked there in parts instead.
let complexNamer: ((expanded: Mol) => string | undefined) | undefined;
export const setComplexNamer = (n: typeof complexNamer) => { complexNamer = n; };
// Standard InChI with its AuxInfo (chem.ts toInchiAux), for the cages below. Without it, no cage is named that way.
let inchiAux: ((expanded: Mol) => string | undefined) | undefined;
export const setCageCheck = (aux: typeof inchiAux) => { inchiAux = aux; };

// A checked name for a structure: the namer's name, if OPSIN's reading of it has the same InChI as the drawing. Else
// a name from Octet's own tables (known), checked the same way. Else a coordination compound's name (complexNamer).
// In a fused macrocycle whose pyrrole-type N atoms all point into the ring (macrocycle), the E and Z of the macrocycle's
// own bonds are the ones its name implies (21H,23H-porphyrin cites none): they are left out of the namer's graph and of
// both InChIs. Drawn any other way, they count as every E and Z does: the name must cite them, as an N-confused
// porphyrin's von Baeyer name does.
// A cage drawn in 3D (lockedAtoms) has its locked bridgeheads' configurations in its InChI, from the atoms' places,
// and a name cites none for them: there they are left out of the comparison.
export function checkedName(drawn: Mol, expanded: Mol, read: (name: string) => string | undefined, inchi: (s: Mol | string) => string | undefined, cip?: (m: Mol) => Cip | undefined, known?: (inchi: string) => string | undefined): string | undefined {
  const raw = inchi(drawn);
  if (!raw) return undefined;
  const ring = macrocycle(expanded), inward = !!ring?.inward, key = (s: string | undefined) => (inward ? withoutRingEZ(s) : s), want = key(raw);
  let labels = cip?.(expanded);
  if (inward && labels) labels = { atoms: labels.atoms, bonds: labels.bonds.map((c, k) => (ring!.bonds.has(k) ? undefined : c)) };
  const g = namer && graphOf(expanded, labels, true);
  // A cage drawn in 3D: worked out once, when a name's InChI differs.
  let cage: Set<string> | undefined | null = stereoLayers(raw)?.t && inchiAux ? null : undefined;
  const caged = (got: string) => { if (cage === null) cage = lockedAtoms(expanded, inchiAux!, labels); return !!cage && !inward && sameCage(raw, got, cage); };
  const reads = (name: string | undefined) => { const smiles = name && read(name), got = smiles && key(inchi(smiles)); return !!got && (got === want || caged(got)); };
  const name = g && namer!(g);
  if (name && reads(name)) return name;
  const other = known?.(raw);
  return other && reads(other) ? other : complexNamer?.(expanded);
}

// ——— Cages drawn in 3D: cubane, adamantane ———
// A cage drawn with depth has its bridgeheads' configurations in its InChI (/t), from the atoms' places, where its name
// cites none: the cage can be made only one way. The name's InChI then leaves them open (? or no /t at all). Such a
// bridgehead is drawn with depth and locked by short bridges: with some other atom, it is joined by three paths that
// share no atom, each through 1 to 3 atoms, or by a bond and two paths each through 1 or 2 atoms (bicyclo[x.y.z] with
// x, y, z from 1 to 3; bicyclo[x.y.0] with x and y 1 or 2). It has no CIP label (a label the name would cite), and the
// bonds of its bridges are drawn 0.6 to 1.6 times the median bond (none stretched, as a flat drawing turned in 3D
// would have). The InChI numbers of such atoms, or undefined.
type Layers = { t?: string; m?: string; b?: string; i?: string };
function stereoLayers(inchi: string | undefined): Layers | undefined {
  if (!inchi || inchi.length > 20000) return undefined;
  const out: Layers = {};
  for (const l of inchi.split("/").slice(2)) { const k = l[0] as keyof Layers; if ("tmbi".includes(k) && out[k] === undefined) out[k] = l.slice(1); }
  return out;
}
const withoutStereo = (inchi: string) => inchi.split("/").filter((l, k) => k < 2 || !/^[tms]/.test(l)).join("/");
const signs = (t: string | undefined) => new Map((t ? t.split(",") : []).map((x) => [x.slice(0, -1), x.slice(-1)]));
export function lockedAtoms(m: Mol, aux: (m: Mol) => string | undefined, labels?: Cip): Set<string> | undefined {
  if (m.atoms.length > 200 || m.atoms.some((a) => a.text)) return undefined;
  const [line, info] = (aux(m) ?? "").split("\n"), layers = stereoLayers(line);
  const order = /\/N:([\d,]+)(?:\/|$)/.exec(info ?? "")?.[1].split(",").map((x) => Number(x) - 1);
  if (!layers?.t || !order || line.split("/")[1]?.includes(".")) return undefined;
  const adj: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) { adj[b.atoms[0]].push(b.atoms[1]); adj[b.atoms[1]].push(b.atoms[0]); }
  const at = (i: number) => m.atoms[i].location, len = (i: number, j: number) => Math.hypot(at(i)[0] - at(j)[0], at(i)[1] - at(j)[1], (at(i)[2] ?? 0) - (at(j)[2] ?? 0));
  const lengths = m.bonds.map((b) => len(b.atoms[0], b.atoms[1])).sort((x, y) => x - y), median = lengths[lengths.length >> 1];
  if (!median) return undefined;
  const fair = (i: number, j: number) => len(i, j) >= 0.6 * median && len(i, j) <= 1.6 * median;
  const out = new Set<string>();
  for (const n of signs(layers.t).keys()) {
    const a = order[Number(n) - 1];
    if (a === undefined || !adj[a] || adj[a].length < 3 || labels?.atoms[a] || !adj[a].some((j) => Math.abs((at(j)[2] ?? 0) - (at(a)[2] ?? 0)) >= 0.2 * median)) continue;
    // Every path from a through at most 3 atoms, by the atom it ends on.
    const ways = new Map<number, number[][]>();
    const walk = (path: number[]) => {
      for (const w of adj[path[path.length - 1]]) {
        if (path.includes(w)) continue;
        ways.set(w, [...(ways.get(w) ?? []), path.slice(1)]);
        if (path.length < 4) walk([...path, w]);
      }
    };
    walk([a]);
    const apart = (ps: number[][]) => ps.every((p, k) => ps.slice(k + 1).every((q) => !p.some((x) => q.includes(x))));
    const fairPath = (b: number, p: number[]) => [a, ...p, b].every((x, k, all) => !k || fair(all[k - 1], x));
    const locked = [...ways].some(([b, ps]) => {
      const inner = ps.filter((p) => p.length >= 1 && fairPath(b, p)), direct = ps.some((p) => p.length === 0) && fair(a, b);
      for (let x = 0; x < inner.length; x++) for (let y = x + 1; y < inner.length; y++) {
        if (!apart([inner[x], inner[y]])) continue;
        if (direct && inner[x].length <= 2 && inner[y].length <= 2) return true;
        for (let z = y + 1; z < inner.length; z++) if (apart([inner[x], inner[y], inner[z]])) return true;
      }
      return false;
    });
    if (locked) out.add(n);
  }
  return out.size ? out : undefined;
}
// Whether two standard InChIs of one constitution (drawn, and a name's) are one structure when the drawing's locked
// bridgeheads (lockedAtoms's InChI numbers) are left open in the name's: every other layer the same, every other /t
// atom the same, and the same /m. With no /m (neither is chiral) a structure is its own mirror image, and InChI may
// give it with every sign turned: so may the name's.
function sameCage(drawn: string, named: string, locked: Set<string>): boolean {
  const d = stereoLayers(drawn), r = stereoLayers(named);
  if (!d?.t || !r || d.i !== undefined || r.i !== undefined || d.m !== r.m || withoutStereo(drawn) !== withoutStereo(named)) return false;
  const ds = signs(d.t), rs = signs(r.t), turn = { "+": "-", "-": "+" } as Record<string, string>;
  return [false, ...(d.m === undefined ? [true] : [])].some((turned) => {
    const sign = (n: string) => { const x = rs.get(n) ?? "?"; return turned ? (turn[x] ?? x) : x; };
    return [...rs.keys()].every((n) => sign(n) === "?" || ds.get(n) === sign(n)) && [...ds].every(([n, x]) => sign(n) === x || (sign(n) === "?" && locked.has(n)));
  });
}

// ——— Fused macrocycles: porphyrin, phthalocyanine, corrole ———
// A ring bond is a macrocycle's own when it is in a ring of 8 or more atoms, in no smaller one, and has an atom in a
// ring of at most 7: the meso C-C and C-N bonds of a porphyrin or phthalocyanine, and corrole's C1-C19. InChI gives
// those E or Z by the drawing, as a ring of 8 or more can hold a trans double bond. (E)- and (Z)-cyclooctene and a
// macrolide's C=C have no atom in a smaller ring, so theirs always count.
type Edge = [number, number];
// Whether u and v are joined other than by their own bond, by a path of at most `most` bonds.
function joined(adj: number[][], u: number, v: number, most: number): boolean {
  const seen = new Set([u]);
  for (let front = [u], d = 1; d <= most && front.length; d++) {
    const next: number[] = [];
    for (const i of front) for (const j of adj[i]) {
      if ((i === u && j === v) || seen.has(j)) continue;
      if (j === v) return true;
      seen.add(j);
      next.push(j);
    }
    front = next;
  }
  return false;
}
// The macrocycle bonds among edges (indices), and the atoms in a ring of at most 7.
function ringBonds(n: number, edges: Edge[]): { bonds: Set<number>; small: Set<number>; adj: number[][] } {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }
  const small = new Set<number>(), bonds = new Set<number>(), inSmall = edges.map(([a, b]) => joined(adj, a, b, 6));
  edges.forEach(([a, b], k) => { if (inSmall[k]) { small.add(a); small.add(b); } });
  edges.forEach(([a, b], k) => { if (!inSmall[k] && (small.has(a) || small.has(b)) && joined(adj, a, b, n)) bonds.add(k); });
  return { bonds, small, adj };
}
// The drawing's macrocycle bonds (by bond index), and whether every ring of at most 7 atoms on them is pyrrole-type
// with its N pointing into the macrocycle. Pyrrole-type: a five-membered ring whose two atoms on macrocycle bonds are
// joined in it through one N atom (N21 between C1 and C4 of 21H,23H-porphyrin). Pointing in: at each macrocycle bond,
// that N lies on the same side of the bond as the macrocycle's next atom beyond the bond's other end (C6 beyond C5 for
// C4-C5; for corrole's C1-C19, N24), as InChI reads the bond's E or Z from the drawing. An N-confused porphyrin (a C atom
// in the N's place) is not pyrrole-type, and a pyrrole drawn turned out does not point in. Undefined with no
// macrocycle bonds.
export function macrocycle(m: Mol): { bonds: Set<number>; inward: boolean } | undefined {
  if (m.atoms.length > 1000) return undefined;
  const edges = m.bonds.map((b) => b.atoms as Edge), { bonds, small, adj } = ringBonds(m.atoms.length, edges);
  if (!bonds.size) return undefined;
  const ends = new Set([...bonds].flatMap((k) => edges[k]));
  // Each end in a small ring: the N of its pyrrole.
  const nOf = new Map<number, number>();
  for (const a of ends) {
    if (!small.has(a)) continue;
    const found: number[] = [];
    for (const x of adj[a]) for (const b of adj[x]) {
      if (b === a || !ends.has(b) || ends.has(x)) continue;
      // The other way round the five-membered ring: a-p-q-b, through atoms on no macrocycle bond.
      if (adj[a].some((p) => p !== x && !ends.has(p) && adj[b].some((q) => q !== x && q !== p && !ends.has(q) && adj[p].includes(q)))) found.push(x);
    }
    if (found.length !== 1 || m.atoms[found[0]].label !== "N") return { bonds, inward: false };
    nOf.set(a, found[0]);
  }
  const at = (i: number) => m.atoms[i].location;
  const side = (a: number, b: number, p: number) => (at(b)[0] - at(a)[0]) * (at(p)[1] - at(a)[1]) - (at(b)[1] - at(a)[1]) * (at(p)[0] - at(a)[0]);
  const inward = [...bonds].every((k) => edges[k].every((e) => {
    if (!nOf.has(e)) return true;
    const o = edges[k][0] === e ? edges[k][1] : edges[k][0], x = nOf.get(e)!;
    const beyond = nOf.get(o) ?? [...bonds].flatMap((j) => (j !== k && edges[j].includes(o) ? edges[j].filter((y) => y !== o) : []));
    if (Array.isArray(beyond) && beyond.length !== 1) return false;
    const w = Array.isArray(beyond) ? beyond[0] : beyond, d = (at(o)[0] - at(e)[0]) ** 2 + (at(o)[1] - at(e)[1]) ** 2;
    const sx = side(e, o, x), sw = side(e, o, w);
    return d > 0 && Math.abs(sx) > 0.01 * d && Math.abs(sw) > 0.01 * d && Math.sign(sx) === Math.sign(sw);
  }));
  return { bonds, inward };
}
// A standard InChI with no E or Z for its macrocycle bonds, found in its own connection table (/c). An InChI of
// several components, or one this cannot read, is given back as it is.
export function withoutRingEZ(inchi: string | undefined): string | undefined {
  if (!inchi || inchi.length > 20000) return inchi;
  const layers = inchi.split("/"), c = layers.find((l, k) => k > 1 && l[0] === "c");
  if (!c || layers[1].includes(".") || /[;*]/.test(c)) return inchi;
  const edges: Edge[] = [], stack: number[] = [];
  let prev: number | undefined, n = 0;
  for (const t of c.slice(1).match(/\d+|[-(),]/g) ?? []) {
    if (t === "(") { if (prev === undefined) return inchi; stack.push(prev); }
    else if (t === ")") { prev = stack.pop(); if (prev === undefined) return inchi; }
    else if (t === ",") { prev = stack[stack.length - 1]; if (prev === undefined) return inchi; }
    else if (t !== "-") { const a = Number(t) - 1; if (prev !== undefined) edges.push([prev, a]); prev = a; n = Math.max(n, a + 1); }
  }
  if (n > 1000) return inchi;
  const { bonds } = ringBonds(n, edges), drop = new Set([...bonds].map((k) => `${Math.max(...edges[k]) + 1}-${Math.min(...edges[k]) + 1}`));
  return layers.flatMap((l, k) => {
    if (k < 2 || l[0] !== "b") return [l];
    const kept = l.slice(1).split(",").filter((x) => !drop.has(x.replace(/[-+?]$/, "")));
    return kept.length ? [`b${kept.join(",")}`] : [];
  }).join("/");
}
