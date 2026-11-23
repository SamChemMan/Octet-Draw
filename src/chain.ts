// Peptides and oligonucleotides laid out along a straight backbone (issues 27 and 99), as chemists draw them: the
// backbone a level zigzag, a peptide's side chains above and below it by turns, and the sugars and bases of RNA or
// DNA all on one side. Clean Up Structure lays a chain out this way (chem.ts cleanUp), and so does the Sequence tool
// (chem.ts fullMol). Each side chain, sugar and base keeps the shape it had; only where it sits changes.
import type { Mol } from "./render.ts";
import { bondedTo, ringBonds } from "./edit.ts";

type P = [number, number];
// The fewest residues that make a chain: three amino acids (a dipeptide such as aspartame stays a small molecule), or
// two nucleotides.
const LEAST_PEPTIDE = 3, LEAST_NUCLEIC = 2;
const ZIG = Math.sqrt(3) / 2;

// The backbones of a structure's peptide or oligonucleotide chains (frag: its atoms), each in order, and the backbone
// bonds drawn level (by the index of the first atom, across all the backbones in turn): the bond from a nucleotide's
// O3' to its P. bases: each nucleotide's C1' and the N of its base. A peptide has up to two backbones (two chains joined
// by links, as insulin's), the longest first; a ring of residues (a head-to-tail cyclic peptide) is cut before its
// residue with the lowest atom number, or at the bond drawn as a bracket. Undefined when there is no chain long enough.
type Backbone = { paths: number[][]; flat: Set<number>; bases: [number, number][] };
function backbone(m: Mol, frag: number[], at: number[][], order: (i: number, j: number) => number, least = LEAST_PEPTIDE, one = false): Backbone | undefined {
  const el = (i: number) => (m.atoms[i].inner ? "" : m.atoms[i].label);
  // The longest run of units, each followed by exactly one other.
  const longest = <T>(units: T[], next: (u: T) => T[]): T[] => {
    const after = units.map((u) => { const n = next(u); return n.length === 1 ? n[0] : undefined; });
    let best: T[] = [];
    for (const u of units.filter((u) => !after.includes(u))) {
      const run: T[] = [];
      for (let v: T | undefined = u; v !== undefined && !run.includes(v); v = after[units.indexOf(v)]) run.push(v);
      if (run.length > best.length) best = run;
    }
    return best;
  };
  // A peptide: residues N–Cα–C(=O), each C bonded to the next residue's N.
  const residues: number[][] = [];
  for (const c of frag) {
    if (el(c) !== "C" || !at[c].some((o) => el(o) === "O" && order(c, o) === 2 && at[o].length === 1)) continue;
    for (const a of at[c]) if (el(a) === "C" && order(a, c) === 1) for (const n of at[a]) if (el(n) === "N" && order(n, a) === 1) residues.push([n, a, c]);
  }
  if (residues.length >= least) {
    const byN = new Map<number, number[]>();
    residues.forEach((r, k) => byN.set(r[0], [...(byN.get(r[0]) ?? []), k]));
    const next = residues.map(([, , c]) => { const s = at[c].flatMap((n) => (order(c, n) === 1 ? byN.get(n) ?? [] : [])); return s.length === 1 ? s[0] : undefined; });
    const led = new Set(next.filter((s): s is number => s !== undefined));
    const runs: number[][] = [];
    for (let r = 0; r < residues.length; r++) {
      if (led.has(r)) continue;
      const run: number[] = [];
      for (let v: number | undefined = r; v !== undefined && !run.includes(v); v = next[v]) run.push(v);
      runs.push(run);
    }
    // A ring of residues: each led by another. Cut at the bond drawn as a bracket, else before the residue whose N has the
    // lowest atom number.
    const inRun = new Set(runs.flat());
    for (let r = 0; r < residues.length; r++) {
      if (inRun.has(r)) continue;
      const ring: number[] = [];
      let v: number | undefined = r;
      for (; v !== undefined && !ring.includes(v) && ring.length <= residues.length; v = next[v]) ring.push(v);
      ring.forEach((x) => inRun.add(x));
      if (v !== r) continue;
      const routed = ring.findIndex((x) => { const nx = next[x]!, b = m.bonds.find((b) => b.atoms.includes(residues[x][2]) && b.atoms.includes(residues[nx][0])); return !!b?.route; });
      const first = routed >= 0 ? (routed + 1) % ring.length : ring.reduce((best, x, k) => (residues[x][0] < residues[ring[best]][0] ? k : best), 0);
      runs.push([...ring.slice(first), ...ring.slice(0, first)]);
    }
    // The longest two that share no atom.
    const used = new Set<number>(), paths: number[][] = [];
    for (const run of runs.sort((p, q) => q.length - p.length)) {
      const atoms = run.flatMap((x) => residues[x]);
      if (run.length < least || atoms.some((i) => used.has(i)) || new Set(atoms).size !== atoms.length) continue;
      atoms.forEach((i) => used.add(i));
      paths.push(atoms);
      if (paths.length === 2) break;
    }
    // The first chain (by its lowest atom number) stands above. A run shorter than a chain (read for HELM) gives way to
    // a nucleic acid (a guanine has N–C–C(=O) in its ring).
    if (paths.length && (paths[0].length >= 3 * LEAST_PEPTIDE || !nucleic())) return { paths: paths.sort((p, q) => Math.min(...p) - Math.min(...q)), flat: new Set(), bases: [] };
  }
  return nucleic();
  function nucleic(): Backbone | undefined {
  // A nucleic acid: furanoses O4'–C1'(base N)–C2'–C3'(O3')–C4'(C5'–O5'), each O3' bonded through a P to the next O5'.
  const units: { o5: number; c5: number; c4: number; c3: number; o3: number; c1: number; n: number }[] = [];
  const out = (i: number, ring: number[], label: string) => at[i].find((j) => !ring.includes(j) && el(j) === label && order(i, j) === 1);
  for (const o4 of frag) {
    if (el(o4) !== "O" || at[o4].length !== 2) continue;
    for (const [c1, c4] of [at[o4], [...at[o4]].reverse()]) for (const c2 of at[c1]) for (const c3 of at[c2]) {
      const ring = [o4, c1, c2, c3, c4];
      if (new Set(ring).size !== 5 || !ring.slice(1).every((i) => el(i) === "C") || !at[c3].includes(c4) || out(c1, ring, "N") === undefined) continue;
      // C5' and its O5', which bonds to no ring atom (an LNA's 2'-O,4'-C bridge is a CH2 on C4' too).
      let c5: number | undefined, o5: number | undefined;
      for (const c of at[c4]) {
        if (ring.includes(c) || el(c) !== "C" || order(c4, c) !== 1) continue;
        const o = at[c].find((j) => j !== c4 && el(j) === "O" && !at[j].some((x) => ring.includes(x)));
        if (o !== undefined) { c5 = c; o5 = o; break; }
      }
      const o3 = out(c3, ring, "O");
      if (c5 !== undefined && o5 !== undefined && o3 !== undefined) units.push({ o5, c5, c4, c3, o3, c1, n: out(c1, ring, "N")! });
    }
  }
  const link = (o3: number, o5: number) => at[o3].find((p) => el(p) === "P" && at[p].includes(o5));
  const chain = longest(units, (u) => units.filter((v) => link(u.o3, v.o5) !== undefined));
  // One nucleotide is a chain only when it is asked for (one: read where a nucleotide's residue label is, as rA alone),
  // so a nucleotide drawn as atoms (ATP, NAD, CoA) stays a small molecule.
  if (chain.length < (one ? 1 : LEAST_NUCLEIC)) return undefined;
  // A phosphate on either end is backbone too.
  const end = (o: number) => at[o].filter((p) => el(p) === "P").slice(0, 1);
  const path = end(chain[0].o5), flat = new Set<number>();
  chain.forEach((u, k) => {
    if (k) { flat.add(path.length - 1); path.push(link(chain[k - 1].o3, u.o5)!); }
    path.push(u.o5, u.c5, u.c4, u.c3, u.o3);
  });
  path.push(...end(chain[chain.length - 1].o3));
  return { paths: [path], flat, bases: chain.map((u): [number, number] => [u.c1, u.n]) };
  }
}

// A chain and the groups off its backbones: their atoms, the backbone atoms they bond to (ends, by place on the
// backbones, which are numbered one after another) and their atoms that do (via). A ring fused onto a backbone
// (proline's, a sugar) has its bond drawn level. A group bonded to two places on the backbones (a disulfide, a lactam,
// a link between two chains) is a link: it is cut at one bond, between two heteroatoms (S–S) or a heteroatom and an acyl
// carbon (the lactam's N–C(=O)), else at its middle, and each half is a group of its own. A bond between two backbone
// atoms that are not neighbours (the bond that closes a cyclic peptide) is a link too. Undefined when there is no
// chain, or a group bonds to the backbones at more than two places.
type Group = { atoms: number[]; ends: number[]; via: number[]; half?: true };
// A link: its cut bond (by index), the bond's atoms, and the places on the backbones each side bonds to.
export type ChainLink = { bond: number; u: number; v: number; ends: [number, number] };
function chainOf(m: Mol, frag: number[], least = LEAST_PEPTIDE, one = false) {
  const at = bondedTo(m), orders = new Map<number, number>(), n = m.atoms.length;
  for (const b of m.bonds) { orders.set(b.atoms[0] * n + b.atoms[1], b.type); orders.set(b.atoms[1] * n + b.atoms[0], b.type); }
  const order = (i: number, j: number) => orders.get(i * n + j) ?? 0;
  const bb = backbone(m, frag, at, order, least, one);
  if (!bb) return undefined;
  const path = bb.paths.flat(), starts = bb.paths.map((_, p) => bb.paths.slice(0, p).reduce((t, q) => t + q.length, 0));
  const pathOf = path.map((_, k) => (starts.length > 1 && k >= starts[1] ? 1 : 0));
  const onPath = new Map(path.map((i, k) => [i, k])), groups: Group[] = [], seen = new Set<number>(), links: ChainLink[] = [];
  const el = (i: number) => (m.atoms[i].inner ? "" : m.atoms[i].label);
  const bondOf = (i: number, j: number) => m.bonds.findIndex((b) => (b.atoms[0] === i && b.atoms[1] === j) || (b.atoms[0] === j && b.atoms[1] === i));
  const peptide = !bb.bases.length;
  // A residue's α carbon: its side chain's place.
  const alpha = (k: number) => peptide && (k - starts[pathOf[k]]) % 3 === 1;
  // Bonds between backbone atoms that are not neighbours.
  for (const b of m.bonds) {
    const [p, q] = b.atoms.map((i) => onPath.get(i));
    if (p === undefined || q === undefined || (pathOf[p] === pathOf[q] && Math.abs(p - q) === 1)) continue;
    links.push({ bond: m.bonds.indexOf(b), u: b.atoms[0], v: b.atoms[1], ends: [p, q] });
  }
  for (const s of frag) {
    if (onPath.has(s) || seen.has(s)) continue;
    const g: Group = { atoms: [s], ends: [], via: [] };
    seen.add(s);
    for (let k = 0; k < g.atoms.length; k++) for (const j of at[g.atoms[k]]) {
      if (onPath.has(j)) { g.ends.push(onPath.get(j)!); g.via.push(g.atoms[k]); } else if (!seen.has(j)) { seen.add(j); g.atoms.push(j); }
    }
    const ends = [...new Set(g.ends)].sort((p, q) => p - q);
    if (ends.length === 1) { groups.push({ ...g, ends }); continue; }
    if (ends.length === 2 && ends[1] === ends[0] + 1 && pathOf[ends[0]] === pathOf[ends[1]]) { bb.flat.add(ends[0]); groups.push({ ...g, ends }); continue; }
    if (ends.length !== 2) return undefined;
    // A link: the atoms from one end to the other through the group, and the best bond among them to cut.
    const [e1, e2] = ends, from = g.via[g.ends.indexOf(e1)], to = g.via[g.ends.indexOf(e2)], inside = new Set(g.atoms), back = new Map<number, number>([[from, -1]]);
    for (const q = [from]; q.length && !back.has(to);) { const i = q.shift()!; for (const j of at[i]) if (inside.has(j) && !back.has(j)) { back.set(j, i); q.push(j); } }
    const line = [to];
    while (back.get(line[0])! >= 0) line.unshift(back.get(line[0])!);
    const atoms = [path[e1], ...line, path[e2]];
    const hetero = (i: number) => el(i) !== "C" && el(i) !== "H" && el(i) !== "";
    const acyl = (i: number) => el(i) === "C" && at[i].some((o) => el(o) === "O" && order(i, o) === 2);
    let best = -1, score = -1;
    for (let j = 0; j + 1 < atoms.length; j++) {
      if ((j === 0 && alpha(e1)) || (j === atoms.length - 2 && alpha(e2))) continue;
      const [p, q] = [atoms[j], atoms[j + 1]];
      const sc = (hetero(p) && hetero(q) ? 3 : (hetero(p) && acyl(q)) || (hetero(q) && acyl(p)) ? 2 : 0) + (order(p, q) === 1 ? 0.5 : 0) - Math.abs(j + 0.5 - (atoms.length - 1) / 2) / atoms.length;
      if (sc > score) { score = sc; best = j; }
    }
    if (best < 0) return undefined;
    const [u, v] = [atoms[best], atoms[best + 1]];
    // The two halves, each a group bonded at one end.
    const endFor = new Map<number, number>();
    for (const start of [u, v]) {
      if (onPath.has(start)) { endFor.set(start, onPath.get(start)!); continue; }
      const half: Group = { atoms: [start], ends: [], via: [] }, mine = new Set([start]);
      for (let k = 0; k < half.atoms.length; k++) for (const j of at[half.atoms[k]]) {
        if ((half.atoms[k] === u && j === v) || (half.atoms[k] === v && j === u)) continue;
        if (onPath.has(j)) { half.ends.push(onPath.get(j)!); half.via.push(half.atoms[k]); } else if (inside.has(j) && !mine.has(j)) { mine.add(j); half.atoms.push(j); }
      }
      half.ends = [...new Set(half.ends)];
      half.half = true;
      if (half.ends.length !== 1) return undefined;
      endFor.set(start, half.ends[0]);
      groups.push(half);
    }
    links.push({ bond: bondOf(u, v), u, v, ends: [endFor.get(u)!, endFor.get(v)!] });
  }
  return { ...bb, path, starts, pathOf, groups, links, at, order, onPath, seen };
}

// The residues of a peptide or oligonucleotide (frag: one structure's atoms, drawn out), for HELM and FASTA: each
// chain's residues in order, each with its atoms (a nucleic acid's phosphates are residues of their own), the groups on
// a peptide's ends (an acetyl on the N, an NH2 or OH on the C=O), and the links: which residue of which chain each end
// is on, and at which of its links (R3 on a side chain, R1 and R2 at a chain's ends). Undefined when it is not one, or
// has a link HELM cannot write (one on a backbone atom in the middle of a chain).
export type ChainEnd = { chain: number; residue: number; r: 1 | 2 | 3 };
export type ChainRead = { nucleic: boolean; chains: { residues: number[][]; start: number[]; end: number[] }[]; links: { a: ChainEnd; b: ChainEnd; bond: number }[] };
// one: whether one nucleotide is a chain (the structure has a nucleotide's residue label).
export function chainRead(m: Mol, frag: number[], one = false): ChainRead | undefined {
  // Read, a peptide of one or two residues is a chain too (it is laid out as a small molecule).
  const c = chainOf(m, frag, 1, one);
  if (!c) return undefined;
  const { path, groups, bases, starts, links } = c, last = (p: number) => (p + 1 < starts.length ? starts[p + 1] : path.length) - 1;
  if (bases.length) {
    if (links.length) return undefined;
    const residues: number[][] = [], own = (ks: number[]) => [...ks.map((k) => path[k]), ...groups.filter((g) => g.ends.every((e) => ks.includes(e))).flatMap((g) => g.atoms)];
    for (let k = 0; k < path.length; k += m.atoms[path[k]].label === "P" ? 1 : 5) residues.push(own(m.atoms[path[k]].label === "P" ? [k] : [k, k + 1, k + 2, k + 3, k + 4]));
    return { nucleic: true, chains: [{ residues, start: [], end: [] }], links: [] };
  }
  const chains: ChainRead["chains"] = [], residueAt = new Map<number, [number, number]>();
  for (let p = 0; p < starts.length; p++) {
    const s0 = starts[p], s1 = last(p), closed = links.some((l) => l.ends.includes(s0) && l.ends.includes(s1) && path.includes(l.u) && path.includes(l.v));
    // A group on the first N or the last C=O carbon that is not part of a link, and not the C=O's O, caps the chain.
    const cap = (k: number) => closed ? [] : groups.filter((g) => !g.half && g.ends.length === 1 && g.ends[0] === k && !(k === s1 && g.atoms.length === 1 && c.order(g.via[0], path[k]) === 2)).flatMap((g) => g.atoms);
    const start = cap(s0), end = cap(s1), capped = new Set([...start, ...end]), residues: number[][] = [];
    for (let r = 0; 3 * r + s0 <= s1; r++) {
      const ks = [s0 + 3 * r, s0 + 3 * r + 1, s0 + 3 * r + 2];
      ks.forEach((k) => residueAt.set(k, [p, r]));
      residues.push([...ks.map((k) => path[k]), ...groups.filter((g) => ks.includes(g.ends[0])).flatMap((g) => g.atoms)].filter((i) => !capped.has(i)));
    }
    chains.push({ residues, start, end });
  }
  const out: ChainRead["links"] = [];
  for (const l of links) {
    const ends = l.ends.map((k): ChainEnd | undefined => {
      const [p, r] = residueAt.get(k)!, off = (k - starts[p]) % 3;
      return off === 1 ? { chain: p, residue: r, r: 3 } : k === starts[p] ? { chain: p, residue: r, r: 1 } : k === last(p) ? { chain: p, residue: r, r: 2 } : undefined;
    });
    if (!ends[0] || !ends[1]) return undefined;
    out.push({ a: ends[0], b: ends[1], bond: l.bond });
  }
  return { nucleic: false, chains, links: out };
}

// New places for the atoms of a peptide or oligonucleotide (frag: one structure's atoms), in bond lengths, or undefined
// when it is not one (chainOf). Each backbone atom is a level zigzag's. A ring fused onto the backbone sits on its
// level bond, on the outside. Every other group off the backbone points away from it, a chain in it as a zigzag.
// Links (issue 27): both residues of a link point to its side, a backbone bond between them drawn level where the
// zigzag would put one on the other side. A link in one chain goes above it, one that crosses another below, and the
// bond that closes a cyclic peptide below; each is drawn as a bracket (routes: each such bond's Bond.route) that clears
// every atom between its ends. Two chains joined by links stand one above the other, the first above, their linked
// residues facing each other and the second moved along so their first link is upright; links between them are straight.
export type ChainPlaces = Map<number, P> & { routes?: Map<number, number> };
export function chainLayout(m: Mol, frag: number[]): ChainPlaces | undefined {
  const bb = chainOf(m, frag);
  if (!bb) return undefined;
  const { path, flat, groups, at, order, onPath, seen, starts, pathOf, links } = bb;
  const peptide = !bb.bases.length, two = starts.length === 2;
  if (!peptide && links.length) return undefined;
  const last = (p: number) => (p + 1 < starts.length ? starts[p + 1] : path.length) - 1;
  // A proline ring lies on the side of the residue before it, so that residue's Cα–C bond is level too: the ring then
  // lies on the other side from its side chain.
  if (peptide) for (const k of [...flat]) if (k - 3 >= starts[pathOf[k]] && !flat.has(k - 3)) flat.add(k - 2);
  // Each link's side (1 up, 0 down) and what it asks of its residues: each α carbon it bonds to on that side. A link
  // between the two chains faces the other chain; one in a chain goes on its outer side; in one chain alone, above,
  // unless it crosses a link above (then below); the bond that closes a ring, below.
  const sides = links.map(() => 1), within = (l: ChainLink) => pathOf[l.ends[0]] === pathOf[l.ends[1]];
  const alpha = (k: number) => peptide && (k - starts[pathOf[k]]) % 3 === 1;
  const span = (l: ChainLink) => [Math.min(...l.ends), Math.max(...l.ends)];
  const order2 = links.map((_, k) => k).sort((p, q) => span(links[p])[0] - span(links[q])[0] || span(links[q])[1] - span(links[p])[1]);
  for (const k of order2) {
    const l = links[k], [lo, hi] = span(l);
    if (!within(l)) { sides[k] = -1; continue; }
    if (two) { sides[k] = pathOf[lo] ? 0 : 1; continue; }
    if (!alpha(lo) && !alpha(hi)) { sides[k] = 0; continue; }
    const crossed = order2.slice(0, order2.indexOf(k)).find((j) => { const [a, b] = span(links[j]); return within(links[j]) && ((a < lo && lo < b && b < hi) || (lo < a && a < hi && hi < b)); });
    sides[k] = crossed === undefined ? 1 : 1 - sides[crossed];
  }
  // Each link's ends that are not on a backbone, with the way to the link: up or down.
  const tips = new Map<number, number>();
  links.forEach((l, k) => [l.u, l.v].forEach((i, e) => { if (!onPath.has(i)) tips.set(i, (sides[k] >= 0 ? sides[k] : pathOf[l.ends[e]] ? 1 : 0) ? Math.PI / 2 : -Math.PI / 2); }));
  const wants = new Map<number, number>();
  links.forEach((l, k) => l.ends.forEach((e) => { if (alpha(e) && !wants.has(e)) wants.set(e, sides[k] >= 0 ? sides[k] : pathOf[e] ? 1 : 0); }));
  // The backbone: a peptide's first N low, so its first side chain points up, unless a link asks for its first α carbon
  // the other way; a nucleic acid's sugars all up. Where a link's residue would point the other way from its link, the
  // amide bond before it is drawn level (or, where that is level already, a bond beside it).
  const level: number[] = [], xy: P[] = [];
  for (let p = 0; p < starts.length; p++) {
    const s0 = starts[p], s1 = last(p), asks = [...wants].filter(([k]) => k >= s0 && k <= s1).sort((x, y) => x[0] - y[0]);
    const levels = (first: number) => { const out = [first]; for (let k = s0 + 1; k <= s1; k++) out.push(flat.has(k - 1) ? out[out.length - 1] : 1 - out[out.length - 1]); return out; };
    let first = 0;
    if (asks.length && levels(0)[asks[0][0] - s0] !== asks[0][1]) first = 1;
    let prev = s0;
    for (const [k, want] of asks) {
      if (levels(first)[k - s0] !== want) {
        const b = [k - 2, k - 1, k - 3, k - 4, k - 5].find((j) => j >= prev && j >= s0 && !flat.has(j));
        if (b !== undefined) flat.add(b);
      }
      prev = k;
    }
    const lv = levels(first);
    for (let k = s0; k <= s1; k++) {
      level.push(lv[k - s0]);
      xy.push(k === s0 ? [0, 0] : [xy[k - 1][0] + (flat.has(k - 1) ? 1 : ZIG), 0]);
    }
  }
  const sugar = groups.find((g) => g.ends.length === 2);
  if (bb.bases.length && sugar && !level[sugar.ends[0]]) level.forEach((v, k) => (level[k] = 1 - v));
  level.forEach((v, k) => (xy[k][1] = v / 2));
  let placed = new Map<number, P>();
  // The old drawing, in bond lengths.
  const old = (i: number): P => [m.atoms[i].location[0], m.atoms[i].location[1]];
  const angle = (p: P, q: P) => Math.atan2(q[1] - p[1], q[0] - p[0]);
  const lengths = m.bonds.filter((b) => onPath.has(b.atoms[0]) || seen.has(b.atoms[0])).map((b) => Math.hypot(old(b.atoms[0])[0] - old(b.atoms[1])[0], old(b.atoms[0])[1] - old(b.atoms[1])[1])).sort((p, q) => p - q);
  const unit = lengths[lengths.length >> 1] || 1;
  // A group moved whole: its old point from goes to to, and the rest turns by turn, mirrored first (across the line at
  // the angle mirror through from) when given.
  const move = (atoms: number[], from: P, to: P, turn: number, mirror?: number) => {
    for (const i of atoms) {
      let [dx, dy] = [(old(i)[0] - from[0]) / unit, (old(i)[1] - from[1]) / unit];
      if (mirror !== undefined) [dx, dy] = [dx * Math.cos(2 * mirror) + dy * Math.sin(2 * mirror), dx * Math.sin(2 * mirror) - dy * Math.cos(2 * mirror)];
      placed.set(i, [to[0] + dx * Math.cos(turn) - dy * Math.sin(turn), to[1] + dx * Math.sin(turn) + dy * Math.cos(turn)]);
    }
  };
  const outward = (k: number) => (level[k] ? Math.PI / 2 : -Math.PI / 2);
  const side = (get: (i: number) => P, u: number, v: number, w: number) => { const p = get(u), q = get(v), r = get(w); return Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); };
  const now = (i: number) => placed.get(i)!;
  // A group bonded by one atom (a, to the placed atom from, going out at dir): a chain as a zigzag that goes on from
  // the backbone's, so a side chain's first step is toward the end of the backbone (away from the C=O before it). At a
  // branch the larger part goes on along the zigzag, and a lone C=O oxygen goes to the other side; two parts alike (a
  // threonine's OH and CH3) keep their sides, so Clean Up again changes nothing. A double bond keeps its side (E or Z).
  // A ring, with all beyond it, moves whole, its bond to from on the zigzag. turn: the side of the next step (1
  // anticlockwise), or for a ring, the side its middle lies on, each atom other than carbon counted twice, so each ring
  // of a kind (an indole, a purine, a thymine, near symmetrical as it is) faces the same way every time. A ring whose
  // middle lies on its bond (a phenyl) keeps its side.
  const rings = ringBonds(m), ringed = new Set(m.bonds.flatMap((b, k) => (rings[k] ? b.atoms : [])));
  const grow = (a: number, from: number, dir: number, group: Set<number>, turn: number) => {
    const to: P = [now(from)[0] + Math.cos(dir), now(from)[1] + Math.sin(dir)];
    if (ringed.has(a)) {
      const whole = [a], into = new Set(whole);
      for (let q = 0; q < whole.length; q++) for (const j of at[whole[q]]) if (j !== from && group.has(j) && !into.has(j)) { into.add(j); whole.push(j); }
      const was = angle(old(from), old(a));
      move(whole, old(a), to, dir - was);
      const weight = (j: number) => (m.atoms[j].label === "C" ? 1 : 2), total = whole.reduce((sum, j) => sum + weight(j), 0);
      const mid = [0, 1].map((d) => whole.reduce((sum, j) => sum + weight(j) * now(j)[d], 0) / total);
      if (turn * (Math.cos(dir) * (mid[1] - to[1]) - Math.sin(dir) * (mid[0] - to[0])) < -0.05) move(whole, old(a), to, dir - was, was);
      return;
    }
    placed.set(a, to);
    // A link's end (an S of a disulfide, a lactam's C=O) keeps the way to its link free: what else it bonds to goes into
    // the wider gap between the bond in and that way.
    const tip = tips.get(a), rest = at[a].filter((c) => c !== from && group.has(c));
    if (tip !== undefined && rest.length <= 1) {
      if (!rest.length) return;
      const back = dir + Math.PI, ccw = (((tip - back) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return grow(rest[0], a, ccw > Math.PI ? back + ccw / 2 : tip + (2 * Math.PI - ccw) / 2, group, turn);
    }
    const was = angle(old(from), old(a)), rel = (c: number) => { const t = angle(old(a), old(c)) - was; return Math.atan2(Math.sin(t), Math.cos(t)); };
    let kids = at[a].filter((c) => c !== from && group.has(c)).sort((p, q) => rel(p) - rel(q));
    const size = (c: number) => { const part = [c]; for (let q = 0; q < part.length; q++) for (const j of at[part[q]]) if (j !== a && group.has(j) && !part.includes(j)) part.push(j); return part.length; };
    // An H drawn on a branch (a stereocentre's, as Name to Structure draws Ile's) goes between the bond in and the
    // smaller part, and the two larger parts as at any branch.
    const h = kids.length === 3 ? kids.find((c) => m.atoms[c].label === "H" && at[c].length === 1) : undefined;
    if (h !== undefined) kids = kids.filter((c) => c !== h);
    if (kids.length === 2) {
      const rank = (c: number) => 2 * size(c) + (order(a, c) >= 2 ? 0 : 1);
      kids.sort((p, q) => rank(q) - rank(p) || turn * (rel(q) - rel(p)));
      kids.forEach((c, s) => grow(c, a, dir + (s ? -turn : turn) * (Math.PI / 3), group, s ? turn : -turn));
      if (h !== undefined) { const t = dir - turn * (Math.PI * 2) / 3; placed.set(h, [to[0] + Math.cos(t), to[1] + Math.sin(t)]); }
      return;
    }
    if (kids.length === 1) {
      let t = turn;
      const before = at[from].find((j) => j !== a && placed.has(j)), c = kids[0];
      if (order(from, a) === 2 && before !== undefined) {
        const at60 = (s: number): P => [to[0] + Math.cos(dir + s * (Math.PI / 3)), to[1] + Math.sin(dir + s * (Math.PI / 3))];
        if (side(old, from, a, before) * side(old, from, a, c) !== side((x) => (x === c ? at60(t) : now(x)), from, a, before) * side((x) => (x === c ? at60(t) : now(x)), from, a, c)) t = -t;
      }
      return grow(c, a, dir + t * (Math.PI / 3), group, -t);
    }
    const spread = kids.map((_, s) => (s - (kids.length - 1) / 2) * ((2 * Math.PI) / (kids.length + 1)));
    kids.forEach((c, s) => grow(c, a, dir + spread[s], group, spread[s] ? -Math.sign(spread[s]) : turn));
  };
  // Each chain is laid out on its own, then the second placed under the first.
  const all = new Map<number, P>(), later: [number, number][] = [];
  for (let p = 0; p < starts.length; p++) {
  const s0 = starts[p], s1 = last(p), mine = (k: number) => k >= s0 && k <= s1;
  placed = new Map(path.flatMap((i, k) => (mine(k) ? [[i, xy[k]] as [number, P]] : [])));
  // Rings fused onto the backbone first, so the groups after them keep clear of them.
  for (const [k, i] of path.entries()) {
    if (!mine(k)) continue;
    // A ring fused onto the bond to the next atom: on that bond, mirrored across it if it would lie inside.
    for (const g of groups.filter((g) => g.ends.length === 2 && g.ends[0] === k)) {
      const was = angle(old(i), old(path[k + 1])), turn = angle(xy[k], xy[k + 1]) - was;
      move(g.atoms, old(i), xy[k], turn);
      const high = g.atoms.reduce((sum, a) => sum + placed.get(a)![1], 0) / g.atoms.length > xy[k][1];
      if (high !== !!level[k]) move(g.atoms, old(i), xy[k], turn, was);
      // A sugar's base points straight out from it, so the bases stand side by side.
      for (const [c1, base] of bb.bases.filter(([c1]) => g.atoms.includes(c1))) {
        const atoms = new Set(g.atoms);
        atoms.delete(c1);
        grow(base, c1, angle([(xy[k][0] + xy[k + 1][0]) / 2, xy[k][1]], now(c1)), atoms, -1);
      }
    }
  }
  // How close a group comes to the atoms placed before it.
  const crowding = (atoms: number[]) => {
    const mine = new Set(atoms);
    let sum = 0;
    for (const a of atoms) for (const [j, q] of placed) if (Math.abs(now(a)[0] - q[0]) < 1.2 && !mine.has(j)) sum += Math.max(0, 1.2 - Math.hypot(now(a)[0] - q[0], now(a)[1] - q[1])) ** 2;
    return sum;
  };
  for (const [k, i] of path.entries()) {
    const mineHere = mine(k) ? groups.filter((g) => g.ends.length === 1 && g.ends[0] === k) : [];
    // An H drawn on a backbone atom (an α carbon's, as Name to Structure draws some) takes no slot: it goes last, into
    // the widest gap left.
    const lone = (g: Group) => g.atoms.length === 1 && m.atoms[g.atoms[0]].label === "H", own = mineHere.filter((g) => !lone(g) || mineHere.every(lone));
    for (const g of mineHere.filter((g) => !own.includes(g))) later.push([k, g.atoms[0]]);
    if (!own.length) continue;
    // The directions free at this atom: the widest gap between the bonds placed at it (the backbone's, and a ring's
    // fused onto it, as at an α-methylproline), or at an end, the next step of the zigzag and then straight out.
    const bonds = [k - 1, k + 1].filter((j) => mine(j)).map((j) => angle(xy[k], xy[j]));
    let slots: number[];
    if (bonds.length === 1) {
      slots = own.length <= 2 ? [Math.PI - bonds[0], outward(k)] : own.map((_, s) => bonds[0] + Math.PI + (s - (own.length - 1) / 2) * ((2 * Math.PI) / (own.length + 1)));
      // A double-bonded atom (C=O) goes straight out, and the largest other group on along the zigzag.
      const double = (g: (typeof own)[number]) => (g.via.length === 1 && order(g.via[0], i) >= 2 ? 1 : 0);
      if (own.length <= 2) own.sort((p, q) => double(p) - double(q) || q.atoms.length - p.atoms.length);
    } else {
      const taken = at[i].filter((j) => placed.has(j) && !(onPath.has(j) && Math.abs(onPath.get(j)! - k) > 1)).map((j) => angle(xy[k], now(j))).sort((p, q) => p - q);
      const [from, gap] = taken.map((t, s) => [t, (taken[s + 1] ?? taken[0] + 2 * Math.PI) - t]).reduce((p, q) => (q[1] > p[1] ? q : p));
      slots = own.map((_, s) => from + gap / 2 + (s - (own.length - 1) / 2) * (Math.PI / 3));
    }
    // The zigzag goes on: the next step turns back the other way from this one.
    const into = angle(xy[k > s0 ? k - 1 : s0 + 1], xy[k]);
    own.forEach((g, s) => {
      // A chain whose zigzag would run into a group placed before it (a proline ring) starts the other way.
      const turn = Math.sin(slots[s] - into) > 0 ? -1 : 1, start = (t: number) => { grow(g.via[0], i, slots[s], new Set(g.atoms), t); return crowding(g.atoms); };
      if (g.via.length === 1) return void (start(turn) > start(-turn) || start(turn));
      // Bonded by more than one atom (a spiro ring): moved whole, its middle out.
      const mid: P = [0, 1].map((d) => g.atoms.reduce((sum, a) => sum + old(a)[d], 0) / g.atoms.length) as P;
      move(g.atoms, old(i), xy[k], slots[s] - angle(old(i), mid));
    });
  }
  for (const [k, hy] of later.splice(0)) {
    const i = path[k], taken = at[i].filter((j) => j !== hy && placed.has(j)).map((j) => angle(xy[k], now(j))).sort((x, y) => x - y);
    const [from, gap] = taken.map((t, n) => [t, (taken[n + 1] ?? taken[0] + 2 * Math.PI) - t]).reduce((x, y) => (y[1] > x[1] + 1e-9 ? y : x));
    placed.set(hy, [xy[k][0] + Math.cos(from + gap / 2), xy[k][1] + Math.sin(from + gap / 2)]);
  }
  for (const [i, q] of placed) all.set(i, q);
  if (p === 1) {
    // The second chain under the first: moved along so the first link between them is upright, and down so it clears it.
    const inter = links.filter((_, k) => sides[k] < 0).sort((x, y) => Math.min(...x.ends) - Math.min(...y.ends))[0];
    const [ka, kb] = inter ? [...inter.ends].sort((x, y) => x - y) : [s0, s0];
    const dx = xy[ka][0] - xy[kb][0], low = Math.min(...[...all].filter(([i]) => !placed.has(i)).map(([, q]) => q[1])), high = Math.max(...[...placed.values()].map((q) => q[1]));
    const dy = low - high - 1;
    for (const [i, q] of placed) all.set(i, [q[0] + dx, q[1] + dy]);
    for (let k = s0; k <= s1; k++) xy[k] = [xy[k][0] + dx, xy[k][1] + dy];
  }
  }
  placed = all;
  // Each link in a chain as a bracket on its side: out from each end, clear of every atom between them (and of the
  // brackets inside it) by half a bond length, and along. Only a plain single bond takes one.
  const routes = new Map<number, number>(), tops: P[] = [];
  for (const k of [...links.keys()].sort((x, y) => (span(links[x])[1] - span(links[x])[0]) - (span(links[y])[1] - span(links[y])[0]))) {
    const l = links[k], b = m.bonds[l.bond];
    if (sides[k] < 0 || !b || b.type !== 1 || b.stereo || b.display) continue;
    const p0 = now(b.atoms[0]), q0 = now(b.atoms[1]), d = [q0[0] - p0[0], q0[1] - p0[1]], len = Math.hypot(d[0], d[1]);
    if (len < 1e-6) continue;
    const u: P = [d[0] / len, d[1] / len], nl: P = [-u[1], u[0]], sign = (sides[k] ? nl[1] >= 0 : nl[1] <= 0) ? 1 : -1;
    let h = 0.7;
    for (const r of [...placed.values(), ...tops]) {
      const t = (r[0] - p0[0]) * u[0] + (r[1] - p0[1]) * u[1], off = sign * ((r[0] - p0[0]) * nl[0] + (r[1] - p0[1]) * nl[1]);
      if (t > -0.4 && t < len + 0.4) h = Math.max(h, off + 0.5);
    }
    routes.set(l.bond, Math.round(sign * h * 1000) / 1000);
    for (let f = 0; f <= 4; f++) tops.push([p0[0] + u[0] * len * f / 4 + nl[0] * sign * h, p0[1] + u[1] * len * f / 4 + nl[1] * sign * h]);
  }
  // A double bond keeps its side (E or Z); a layout that would turn one round is not used.
  for (const b of m.bonds) {
    const [u, v] = b.atoms, nu = at[u].find((j) => j !== v), nv = at[v].find((j) => j !== u);
    if (b.type === 2 && placed.has(u) && nu !== undefined && nv !== undefined && side(old, u, v, nu) * side(old, u, v, nv) * side(now, u, v, nu) * side(now, u, v, nv) < 0) return undefined;
  }
  // Nor is one that puts an atom on another (a side chain on the next residue's N, an N-methyl on a phenyl before it),
  // as the drawing would read as another compound.
  const xs = [...placed.values()].sort((p, q) => p[0] - q[0]);
  for (let k = 0; k < xs.length; k++) for (let j = k + 1; j < xs.length && xs[j][0] - xs[k][0] < 0.3; j++) if (Math.hypot(xs[j][0] - xs[k][0], xs[j][1] - xs[k][1]) < 0.3) return undefined;
  const out = placed as ChainPlaces;
  if (links.length) out.routes = routes;
  return out;
}
