// Fusion nomenclature for ring systems outside the namer's table of retained names (IUPAC 2013, P-25; the 1998
// fused ring recommendations FR-2 to FR-5). Clean room: written from the published rules. Three parts:
//   1. Ring perception: the smallest rings of an ortho- or ortho- and peri-fused system, all walked the same way round.
//   2. Peripheral numbering (FR-5): the system drawn on a hexagonal grid, oriented (FR-5.2: most rings in a horizontal
//      row, then most rings up and to the right), numbered clockwise from the upper right ring (FR-5.3), and the
//      numberings left compared by FR-5.4 (heteroatoms, fusion carbon atoms, fusion heteroatoms).
//   3. Names (P-25.3): a base component, attached components as prefixes (pyrido, furo, benzo), fusion descriptors
//      ([2,3-b]), and benzo names (2H-1,4-benzoxazine).
// Every name is read back by OPSIN before the app shows it; where the rules leave the numbering open, this module
// gives no name rather than a guess.

// ——— 1. Ring perception ———

const key = (a: number, b: number) => (a < b ? a * 65536 + b : b * 65536 + a);

// A ring system with local atom indices 0..n-1: rings walked the same way round (shared bonds run opposite ways),
// the ring across each ring bond (or -1), and the periphery (atom → next atom, in the rings' direction; -1 inside).
export type RingSystem = { n: number; el: string[]; adj: number[][]; rings: number[][]; across: number[][]; next: number[] };

// The smallest set of smallest rings: the shortest ring through each bond, kept while independent (GF(2)).
function smallestRings(n: number, adj: number[][]): number[][] {
  const index = new Map<number, number>();
  let edges = 0;
  for (let a = 0; a < n; a++) for (const b of adj[a]) if (a < b) index.set(key(a, b), edges++);
  const need = edges - n + 1, seen = new Set<bigint>(), found: { atoms: number[]; bits: bigint }[] = [];
  for (const [k] of index) {
    const u = Math.floor(k / 65536), v = k % 65536, prev = Array(n).fill(-1), queue = [u];
    prev[u] = u;
    for (let i = 0; i < queue.length && prev[v] < 0; i++) {
      const x = queue[i];
      for (const y of adj[x]) if (prev[y] < 0 && !(x === u && y === v)) { prev[y] = x; queue.push(y); }
    }
    if (prev[v] < 0) continue;
    const atoms = [v];
    while (atoms[atoms.length - 1] !== u) atoms.push(prev[atoms[atoms.length - 1]]);
    let bits = 0n;
    atoms.forEach((a, i) => (bits |= 1n << BigInt(index.get(key(a, atoms[(i + 1) % atoms.length]))!)));
    if (!seen.has(bits)) { seen.add(bits); found.push({ atoms, bits }); }
  }
  found.sort((x, y) => x.atoms.length - y.atoms.length);
  const basis: bigint[] = [], rings: number[][] = [];
  for (const c of found) {
    let b = c.bits;
    for (const r of basis) if ((b ^ r) < b) b ^= r; // rows kept in falling order, each with its own top bit
    if (!b) continue;
    basis.push(b);
    basis.sort((x, y) => (x > y ? -1 : x < y ? 1 : 0));
    rings.push(c.atoms);
  }
  if (rings.length !== need) throw new Error("ring perception");
  return rings;
}

// The rings of a fused system. Throws for systems that are not ortho- or ortho- and peri-fused (bridged, spiro).
export function ringSystem(el: string[], adj: number[][]): RingSystem {
  const n = el.length;
  if (adj.some((a) => a.length < 2 || a.length > 3)) throw new Error("not ortho-fused");
  const rings = smallestRings(n, adj);
  if (rings.length < 2) throw new Error("not ortho-fused");
  const ringsOf = new Map<number, number[]>();
  rings.forEach((r, i) => r.forEach((a, k) => { const e = key(a, r[(k + 1) % r.length]); ringsOf.set(e, [...(ringsOf.get(e) ?? []), i]); }));
  const pairs = new Set<number>();
  for (const [, rs] of ringsOf) {
    if (rs.length > 2) throw new Error("not ortho-fused");
    if (rs.length === 2) { const p = key(rs[0], rs[1]); if (pairs.has(p)) throw new Error("not ortho-fused"); pairs.add(p); }
  }
  // The same way round: a bond two rings share runs a→b in one and b→a in the other.
  const done = rings.map((_, i) => i === 0), queue = [0];
  while (queue.length) {
    const r = rings[queue.shift()!];
    r.forEach((a, k) => {
      const b = r[(k + 1) % r.length];
      for (const s of ringsOf.get(key(a, b))!) {
        const S = rings[s], forward = S[(S.indexOf(a) + 1) % S.length] === b;
        if (S === r) continue;
        if (!done[s]) { if (forward) S.reverse(); done[s] = true; queue.push(s); } else if (forward) throw new Error("not ortho-fused");
      }
    });
  }
  const across = rings.map((r, i) => r.map((a, k) => ringsOf.get(key(a, r[(k + 1) % r.length]))!.find((s) => s !== i) ?? -1));
  // The periphery: the bonds in one ring only, one cycle through every atom not inside.
  const next = Array(n).fill(-1);
  rings.forEach((r, i) => r.forEach((a, k) => { if (across[i][k] < 0) { if (next[a] >= 0) throw new Error("not ortho-fused"); next[a] = r[(k + 1) % r.length]; } }));
  const start = next.findIndex((x) => x >= 0);
  let len = 0;
  for (let a = start; ; ) { a = next[a]; len++; if (a === start) break; if (a < 0 || len > n) throw new Error("not ortho-fused"); }
  if (len !== next.filter((x) => x >= 0).length) throw new Error("not ortho-fused");
  return { n, el, adj, rings, across, next };
}

// ——— 2. Peripheral numbering (FR-5) ———

// Ring centres on a grid (x in half ring widths, y in rows) for a fusion bond whose outward normal points at an angle.
const STEP: Record<number, [number, number]> = { 0: [2, 0], 60: [1, 1], 90: [0, 1], 120: [-1, 1], 180: [-2, 0], 240: [-1, -1], 270: [0, -1], 300: [1, -1] };
// Ring shapes (FR-5.1): the outward normal of each ring bond, counterclockwise from the bond the ring is entered by,
// relative to that bond. Null marks a bond that is not drawn at a hexagon's angle (a five-membered ring's long bond,
// a seven-membered ring's bent bonds); such a bond is never a fusion bond here. A five-membered ring is a hexagon less
// one atom; a seven-membered ring a hexagon with one atom more; four and eight a square and an octagon.
const SEVEN: (number | null)[][] = [
  [0, 60, 120, 180, null, 270, null], [0, null, 90, 120, 240, 270, null], [0, null, 90, null, 180, 240, 300],
  [0, 60, null, 120, null, 240, 300], [0, 60, 120, null, 240, null, 300],
];
function shapes(size: number, fused: boolean[]): (number | null)[][] {
  let list: (number | null)[][];
  if (size === 6) list = [[0, 60, 120, 180, 240, 300]];
  else if (size === 5) list = [1, 2, 3, 4].map((e) => [0, 1, 2, 3, 4].map((k) => (k < e ? 60 * k : k === e ? null : 60 * (k + 1))));
  else if (size === 7) list = SEVEN;
  else if (size === 4) list = [[0, 90, 180, 270]];
  else if (size === 3) list = [[0, 120, 240]];
  else if (size === 8) list = [[0, 60, 90, 120, 180, 240, 270, 300]];
  else throw new Error("fused ring size");
  list = list.filter((s) => s.every((o, k) => o !== null || !fused[k]));
  // Shapes that put the fusion bonds the same way are one shape.
  const seen = new Set<string>();
  return list.filter((s) => { const t = s.map((o, k) => (fused[k] ? o : "")).join(); return !seen.has(t) && !!seen.add(t); });
}

// Directions between ring centres are kept to the grid: a bond facing between a diagonal and the horizontal (30°) is
// drawn as the diagonal (60°).
const snap = (a: number) => (a % 60 === 30 && a % 180 !== 90 ? (a % 180 < 90 ? a + 30 : a - 30) : a) % 360;

// One drawing of the system: the direction from each ring to the ring across each fusion bond (null for bonds in one
// ring only), and the tree of rings the drawing was built along.
type Drawing = { dir: (number | null)[][]; parent: number[]; via: number[]; order: number[] };

// Every drawing of the system on the grid with no distorted ring (FR-5.1).
function drawings(sys: RingSystem): Drawing[] {
  const { rings, across } = sys, R = rings.length;
  const fusedCount = across.map((a) => a.filter((s) => s >= 0).length), least = Math.min(...fusedCount);
  const root = [...rings.keys()].filter((r) => fusedCount[r] === least).sort((a, b) => Number(rings[b].length === 6) - Number(rings[a].length === 6))[0];
  // The root ring is entered by a bond in no other ring, away from the fusion bonds if it can be.
  const rr = rings[root], free = rr.map((_, k) => across[root][k] < 0);
  const ref = [...rr.keys()].find((k) => free[k] && free[(k + 1) % rr.length] && free[(k + rr.length - 1) % rr.length]) ?? free.indexOf(true);
  // A tree of the rings, depth first; each ring entered by the bond it shares with its parent.
  const parent = Array(R).fill(-1), via = Array(R).fill(-1), entry = Array(R).fill(-1), order = [root];
  entry[root] = ref;
  const visit = (r: number) => {
    rings[r].forEach((_, k) => {
      const s = across[r][k];
      if (s < 0 || order.includes(s)) return;
      const a = rings[r][k], S = rings[s];
      parent[s] = r; via[s] = k; entry[s] = (S.indexOf(a) + S.length - 1) % S.length; order.push(s);
      visit(s);
    });
  };
  visit(root);
  const options = order.map((r) => {
    const n = rings[r].length, e = entry[r];
    return shapes(n, rings[r].map((_, j) => across[r][(e + j) % n] >= 0));
  });
  if (options.some((o) => !o.length)) throw new Error("fused ring shape");
  if (options.reduce((t, o) => t * o.length, 1) > 4096) throw new Error("fused ring shape");
  const out: Drawing[] = [];
  const choice = order.map(() => 0);
  for (;;) {
    const dir: (number | null)[][] = rings.map((r) => r.map(() => null));
    order.forEach((r, i) => {
      const n = rings[r].length, e = entry[r], shape = options[i][choice[i]];
      const f = r === root ? 180 : (dir[parent[r]][via[r]]! + 180) % 360;
      shape.forEach((o, j) => { if (o !== null && across[r][(e + j) % n] >= 0) dir[r][(e + j) % n] = snap((f + o) % 360); });
    });
    // Rings fused outside the tree must agree (no distorted ring).
    const agree = rings.every((r, i) => r.every((a, k) => {
      const s = across[i][k];
      if (s < 0) return true;
      const S = rings[s], ks = (S.indexOf(a) + S.length - 1) % S.length;
      return (dir[i][k]! + 180) % 360 === dir[s][ks];
    }));
    if (agree) out.push({ dir, parent, via, order });
    let i = 0;
    while (i < choice.length && ++choice[i] === options[i].length) choice[i++] = 0;
    if (i === choice.length) break;
  }
  if (!out.length) throw new Error("fused ring shape");
  return out;
}

// Heteroatoms in order of seniority for low locants (FR-5.4 b); higher value is more senior.
const SENIOR = ["Hg", "Tl", "In", "Ga", "Al", "B", "Pb", "Sn", "Ge", "Si", "Bi", "Sb", "As", "P", "N", "Te", "Se", "S", "O", "I", "Br", "Cl", "F"];
const senior = (e: string) => SENIOR.indexOf(e) + 1;

export type Numbering = { path: number[]; labels: string[]; interior: number[] };

// The peripheral numbering (FR-5.3, FR-5.4): every numbering the rules allow. All are alike up to symmetry; where the
// rules leave a choice between numberings that are not alike, this throws.
export function numberSystem(sys: RingSystem): Numbering[] {
  const { n, el, adj, rings, across, next } = sys;
  const prev = Array(n).fill(-1);
  next.forEach((b, a) => { if (b >= 0) prev[b] = a; });
  const fusion = (a: number) => adj[a].length === 3;
  const interior = [...Array(n).keys()].filter((a) => next[a] < 0);
  // Interior atoms follow, from the one next to the highest numbered atom along the interior bonds (CAS).
  const inside = (path: number[]) => {
    const out: number[] = [], at = (a: number) => path.indexOf(a);
    const score = (a: number) => 1000 * Math.max(...adj[a].map((b) => out.indexOf(b) + 1)) + Math.max(...adj[a].map(at));
    while (out.length < interior.length) out.push(interior.filter((a) => !out.includes(a)).sort((a, b) => score(b) - score(a))[0]);
    return out;
  };
  type Pick = { pos: [number, number][]; mirror: boolean };
  const picks: { pick: Pick; q: [number, number, number] }[] = [];
  const all = drawings(sys);
  // FR-5.2 a: the longest row of rings fused in one direction; the drawing is turned to make each such row horizontal.
  let longest = 0;
  const turns = all.map(() => new Set<number>());
  all.forEach((d, i) => d.dir.forEach((ds, r) => ds.forEach((a, k) => {
    if (a === null) return;
    let len = 1;
    for (let s = across[r][k]; s >= 0; len++) { const j = d.dir[s].indexOf(a); s = j < 0 ? -1 : across[s][j]; if (len > rings.length) throw new Error("fused ring shape"); }
    if (len > longest) { longest = len; turns.forEach((t) => t.clear()); }
    if (len === longest) turns[i].add(a % 180);
  })));
  let row = 0;
  all.forEach((d, i) => { for (const turn of turns[i]) {
    // The drawing turned so that rows along `turn` run horizontally; centres from the tree.
    const pos: [number, number][] = rings.map(() => [0, 0]);
    for (const r of d.order.slice(1)) {
      const step = STEP[snap((d.dir[d.parent[r]][d.via[r]]! - turn + 360) % 360)];
      pos[r] = [pos[d.parent[r]][0] + step[0], pos[d.parent[r]][1] + step[1]];
    }
    const at = new Set(pos.map((p) => `${p[0]} ${p[1]}`));
    if (at.size !== rings.length) continue; // rings drawn over each other
    // Each longest horizontal row; then FR-5.2 b, c, d for each way of turning the drawing over.
    for (const p of pos) {
      if (at.has(`${p[0] - 2} ${p[1]}`)) continue;
      let len = 1;
      while (at.has(`${p[0] + 2 * len} ${p[1]}`)) len++;
      if (len < row) continue;
      if (len > row) { row = len; picks.length = 0; }
      const cx = p[0] + len - 1, cy = p[1];
      for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        let ur = 0, ll = 0, up = 0;
        for (const [x0, y0] of pos) {
          const x = sx * (x0 - cx), y = sy * (y0 - cy);
          const share = (fx: number, fy: number) => (x === 0 ? 0.5 : x * fx > 0 ? 1 : 0) * (y === 0 ? 0.5 : y * fy > 0 ? 1 : 0);
          ur += share(1, 1); ll += share(-1, -1); up += share(1, 1) + share(-1, 1);
        }
        picks.push({ pick: { pos: pos.map(([x, y]) => [sx * x, sy * y]), mirror: sx * sy < 0 }, q: [-ur, ll, -up] });
      }
    }
  } });
  if (!picks.length) throw new Error("fused ring orientation");
  const best = picks.reduce((m, p) => (cmp(p.q, m) < 0 ? p.q : m), picks[0].q);
  const paths: number[][] = [];
  for (const { pick, q } of picks) {
    if (cmp(q, best)) continue;
    const { pos, mirror } = pick;
    // FR-5.3: the upper right ring (highest row, then furthest right); one with only fusion atoms passes to the next
    // ring clockwise.
    let top = [...rings.keys()].sort((a, b) => pos[b][1] - pos[a][1] || pos[b][0] - pos[a][0])[0];
    const visited = new Set([top]);
    while (rings[top].every(fusion)) {
      const nb = across[top].filter((s) => s >= 0 && !visited.has(s)).sort((a, b) => pos[b][0] - pos[a][0] || pos[b][1] - pos[a][1]);
      if (!nb.length) throw new Error("fused ring numbering");
      top = nb[0];
      visited.add(top);
    }
    // Start clockwise after the bond the ring shares with its upper left neighbour.
    const ks = [...rings[top].keys()].filter((k) => across[top][k] >= 0);
    const k = ks.sort((a, b) => pos[across[top][b]][1] - pos[across[top][a]][1] || pos[across[top][a]][0] - pos[across[top][b]][0])[0];
    const r = rings[top], v = mirror ? r[(k + 1) % r.length] : r[k];
    if (next[v] < 0) throw new Error("fused ring numbering");
    const cw = (a: number) => (mirror ? next[a] : prev[a]);
    const path = [cw(v)];
    while (path[path.length - 1] !== v) path.push(cw(path[path.length - 1]));
    paths.push([...path, ...inside(path)]);
  }
  // FR-5.4: low locants for heteroatoms together, then by seniority, then for fusion carbon atoms, then fusion
  // heteroatoms.
  const numbered = (p: number[]) => p.filter((a) => el[a] !== "C" || !fusion(a));
  const order = (x: number[], y: number[]) => {
    const nx = numbered(x), ny = numbered(y);
    for (let i = 0; i < nx.length; i++) if ((el[nx[i]] !== "C") !== (el[ny[i]] !== "C")) return el[nx[i]] !== "C" ? -1 : 1;
    for (let i = 0; i < nx.length; i++) if (el[nx[i]] !== el[ny[i]]) return senior(el[ny[i]]) - senior(el[nx[i]]);
    for (let i = 0; i < x.length; i++) { const fx = el[x[i]] === "C" && fusion(x[i]), fy = el[y[i]] === "C" && fusion(y[i]); if (fx !== fy) return fx ? -1 : 1; }
    for (let i = 0; i < x.length; i++) if (fusion(x[i]) !== fusion(y[i])) return fusion(x[i]) ? -1 : 1;
    return 0;
  };
  paths.sort(order);
  const chosen = paths.filter((p) => order(p, paths[0]) === 0);
  // FR-5.4 b counts element by element (O first, then S ...): it must pick the same, or there is no name.
  const hetero = (p: number[]) => numbered(p).map((a, i) => (el[a] !== "C" ? i : -1)).filter((i) => i >= 0);
  const byElement = (p: number[]) => SENIOR.slice().reverse().flatMap((e) => numbered(p).map((a, i) => (el[a] === e ? i : -1)).filter((i) => i >= 0).concat([-1]));
  if (paths.some((p) => !cmp(hetero(p), hetero(chosen[0])) && cmp(byElement(p), byElement(chosen[0])) < 0)) throw new Error("fused ring numbering");
  // Numberings the rules cannot tell apart must be alike (a symmetry of the system); else the choice is open.
  const like = (x: number[], y: number[]) => x.every((a, i) => el[a] === el[y[i]] && adj[a].every((b) => adj[y[i]].includes(y[x.indexOf(b)])));
  if (chosen.some((p) => !like(chosen[0], p))) throw new Error("fused ring numbering");
  const seen = new Set<string>();
  return chosen.filter((p) => !seen.has(p.join()) && !!seen.add(p.join())).map((path) => ({ path, labels: labelsOf(path, el, fusion), interior }));
}

// Locants: numbers for peripheral atoms and every heteroatom, a letter after the last number for fusion carbon atoms.
function labelsOf(path: number[], el: string[], fusion: (a: number) => boolean): string[] {
  let num = 0, letter = 0;
  return path.map((a) => (el[a] !== "C" || !fusion(a) ? ((letter = 0), String(++num)) : `${num}${String.fromCharCode(97 + letter++)}`));
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// ——— 3. Names (P-25.3) ———

// A small SMILES reader for the ring skeletons below (atoms, ring closures, branches; bond orders are ignored).
function skeleton(smiles: string): { el: string[]; adj: number[][] } {
  const el: string[] = [], adj: number[][] = [], open = new Map<string, number>(), stack: number[] = [];
  let prev = -1;
  for (const c of smiles) {
    if (c === "(") stack.push(prev);
    else if (c === ")") prev = stack.pop()!;
    else if (/[0-9]/.test(c)) {
      const o = open.get(c);
      if (o === undefined) open.set(c, prev); else { adj[o].push(prev); adj[prev].push(o); open.delete(c); }
    } else if (/[A-Za-z]/.test(c)) {
      const a = el.push(c.toUpperCase()) - 1;
      adj.push([]);
      if (prev >= 0) { adj[a].push(prev); adj[prev].push(a); }
      prev = a;
    }
  }
  return { el, adj };
}

// Retained polycyclic components (P-25.1.1, P-25.2.1) with their prefix forms (P-25.3.2.2). A skeleton given as SMILES is
// numbered by the rules above; one given as bonds by locant keeps its retained numbering. Benzo names (1-benzofuran,
// 1,3-benzoxazole) are not here: they are formed from their rings (FR-3.5).
const ANTHRACENE = "1-2 2-3 3-4 4-4a 4a-10 10-10a 10a-5 5-6 6-7 7-8 8-8a 8a-9 9-9a 9a-1 4a-9a 8a-10a";
const RETAINED: [string, string, string, string?][] = [
  ["naphthalene", "naphtho", "C1=CC=CC2=CC=CC=C12"], ["quinoline", "quino", "N1=CC=CC2=CC=CC=C12"], ["isoquinoline", "isoquino", "C1=NC=CC2=CC=CC=C12"],
  ["quinazoline", "quinazolino", "N1=CN=CC2=CC=CC=C12"], ["quinoxaline", "quinoxalino", "N1=CC=NC2=CC=CC=C12"], ["cinnoline", "cinnolino", "N1=NC=CC2=CC=CC=C12"],
  ["phthalazine", "phthalazino", "C1=NN=CC2=CC=CC=C12"], ["1,5-naphthyridine", "[1,5]naphthyridino", "N1=CC=CC2=NC=CC=C12"],
  ["1,6-naphthyridine", "[1,6]naphthyridino", "N1=CC=CC2=CN=CC=C12"], ["1,7-naphthyridine", "[1,7]naphthyridino", "N1=CC=CC2=CC=NC=C12"],
  ["1,8-naphthyridine", "[1,8]naphthyridino", "N1=CC=CC2=CC=CN=C12"], ["2,6-naphthyridine", "[2,6]naphthyridino", "C1=NC=CC2=CN=CC=C12"],
  ["2,7-naphthyridine", "[2,7]naphthyridino", "C1=NC=CC2=CC=NC=C12"], ["pteridine", "pteridino", "N1=CN=CC2=NC=CN=C12"],
  ["quinolizine", "quinolizino", "C1=CCN2C=CC=CC2=C1"], ["indene", "indeno", "C1=CC2=CC=CC=C2C1"], ["indole", "indolo", "N1C=CC2=CC=CC=C12"],
  ["isoindole", "isoindolo", "C1NC=C2C=CC=CC12"], ["indazole", "indazolo", "N1N=CC2=CC=CC=C12"], ["indolizine", "indolizino", "C1=CN2C=CC=CC2=C1"],
  ["pyrrolizine", "pyrrolizino", "C1C=CN2C=CC=C12"], ["azulene", "azuleno", "C1=CC=C2C=CC=CC=C12"], ["pentalene", "pentaleno", "C1=CC=C2C=CC=C12"],
  ["heptalene", "heptaleno", "C1=CC=CC=C2C=CC=CC=C12"], ["biphenylene", "biphenyleno", "C1=CC=CC=2C3=CC=CC=C3C12"],
  ["as-indacene", "as-indaceno", "C1=CC=C2C=CC3=CC=CC3=C12"], ["s-indacene", "s-indaceno", "C1=CC=C2C=C3C=CC=C3C=C12"],
  ["acenaphthylene", "acenaphtho", "C1=CC2=CC=CC3=CC=CC1=C23"], ["fluorene", "fluoreno", "C1=CC=CC=2C3=CC=CC=C3CC12"],
  ["phenalene", "phenaleno", "C1C=CC2=CC=CC3=CC=CC1=C23"], ["perimidine", "perimido", "N1C=NC2=CC=CC3=CC=CC1=C23"],
  ["phenanthridine", "phenanthridino", "C1=CC=CC2=NC=C3C=CC=CC3=C12"], ["1,10-phenanthroline", "[1,10]phenanthrolino", "N1=CC=CC2=CC=C3C=CC=NC3=C12"],
  ["1,7-phenanthroline", "[1,7]phenanthrolino", "N1=CC=CC2=CC=C3N=CC=CC3=C12"], ["4,7-phenanthroline", "[4,7]phenanthrolino", "C1=CC=NC2=CC=C3N=CC=CC3=C12"],
  ["phenazine", "phenazino", "C1=CC=CC2=NC3=CC=CC=C3N=C12"], ["phenoxazine", "phenoxazino", "C1=CC=CC=2OC3=CC=CC=C3NC12"],
  ["phenothiazine", "phenothiazino", "C1=CC=CC=2SC3=CC=CC=C3NC12"], ["phenoxathiine", "phenoxathiino", "C1=CC=CC=2OC3=CC=CC=C3SC12"],
  ["thianthrene", "thianthreno", "C1=CC=CC=2SC3=CC=CC=C3SC12"], ["fluoranthene", "fluorantheno", "C1=CC=C2C=CC=C3C4=CC=CC=C4C1=C23"],
  ["acephenanthrylene", "acephenanthryleno", "C1=CC=C2C=CC3=CC4=CC=CC=C4C1=C23"], ["aceanthrylene", "aceanthryleno", "C1=CC2=CC=CC3=CC4=CC=CC=C4C1=C23"],
  ["triphenylene", "triphenyleno", "C1=CC=CC=2C3=CC=CC=C3C3=CC=CC=C3C12"], ["pyrene", "pyreno", "C1=CC=C2C=CC3=CC=CC4=CC=C1C2=C34"],
  ["chrysene", "chryseno", "C1=CC=CC=2C3=CC=C4C=CC=CC4=C3C=CC12"], ["tetracene", "tetraceno", "C1=CC=CC2=CC3=CC4=CC=CC=C4C=C3C=C12"],
  ["tetraphene", "tetrapheno", "C1=CC=CC2=CC=C3C=C4C=CC=CC4=CC3=C12"], ["picene", "piceno", "C1=CC=CC2=CC=C3C4=CC=C5C=CC=CC5=C4C=CC3=C21"],
  ["perylene", "peryleno", "C1=CC=C2C=CC=C3C4=CC=CC5=CC=CC(C1=C23)=C45"], ["pentaphene", "pentapheno", "C1=CC=CC2=CC3=CC=C4C=C5C=CC=CC5=CC4=C3C=C12"],
  ["pentacene", "pentaceno", "C1=CC=CC2=CC3=CC4=CC5=CC=CC=C5C=C4C=C3C=C12"], ["hexaphene", "hexapheno", "C1=CC=CC2=CC3=CC=C4C=C5C=C6C=CC=CC6=CC5=CC4=C3C=C12"],
  ["hexacene", "hexaceno", "C1=CC=CC2=CC3=CC4=CC5=CC6=CC=CC=C6C=C5C=C4C=C3C=C12"], ["rubicene", "rubiceno", "C1=CC=C2C3=CC=CC=C3C=3C4=CC=CC=5C6=CC=CC=C6C(=C1C23)C45"],
  ["coronene", "coroneno", "C1=CC2=CC=C3C=CC4=CC=C5C=CC6=CC=C1C1=C6C5=C4C3=C21"], ["trinaphthylene", "trinaphthyleno", "C1=CC=CC2=CC=3C4=CC5=CC=CC=C5C=C4C4=CC5=CC=CC=C5C=C4C3C=C12"],
  ["heptaphene", "heptapheno", "C1=CC=CC2=CC3=CC4=CC=C5C=C6C=C7C=CC=CC7=CC6=CC5=C4C=C3C=C12"], ["heptacene", "heptaceno", "C1=CC=CC2=CC3=CC4=CC5=CC6=CC7=CC=CC=C7C=C6C=C5C=C4C=C3C=C12"],
  ["pyranthrene", "pyranthreno", "C1=CC=CC=2C3=CC4=CC=C5C=C6C=CC=CC6=C6C=C7C=CC(=CC12)C3=C7C4=C56"],
  ["ovalene", "ovaleno", "C1=CC2=CC=C3C=CC4=CC5=CC=C6C=CC7=CC=C8C=C1C1=C2C3=C4C4=C5C6=C7C8=C14"],
  // Retained numbering (exceptions to FR-5.3).
  ["anthracene", "anthra", ANTHRACENE, ""], ["acridine", "acridino", ANTHRACENE, "N10"], ["xanthene", "xantheno", ANTHRACENE, "O10"],
  ["thioxanthene", "thioxantheno", ANTHRACENE, "S10"],
  ["phenanthrene", "phenanthro", "1-2 2-3 3-4 4-4a 4a-4b 4b-5 5-6 6-7 7-8 8-8a 8a-9 9-10 10-10a 10a-1 4a-10a 4b-8a", ""],
  ["carbazole", "carbazolo", "1-2 2-3 3-4 4-4a 4a-4b 4b-5 5-6 6-7 7-8 8-8a 8a-9 9-9a 9a-1 4a-9a 4b-8a", "N9"],
  ["purine", "purino", "1-2 2-3 3-4 4-5 5-6 6-1 5-7 7-8 8-9 9-4", "N1 N3 N7 N9"],
  // Steroid numbering, as OPSIN reads the name (CAS; FR-5.3 notes the difference).
  ["cyclopenta[a]phenanthrene", "", "1-2 2-3 3-4 4-5 5-6 6-7 7-8 8-14 14-15 15-16 16-17 17-13 13-12 12-11 11-9 9-10 10-1 5-10 8-9 13-14", ""],
];

// A component as matched: its atoms in its own locant order (one array for each numbering), its locants, its periphery
// (indices, from locant 1 towards 2), and its seniority (FR-2.3; lower is more senior).
type Template = { name: string; prefix: string; el: string[]; adj: number[][]; labels: string[]; peri: number[]; rings: number; sizes: number[] };
type Comp = { name: string; prefix: string; rings: number[]; nums: number[][]; labels: string[]; peri: number[]; key: number[]; carbo: boolean };

const locOrder = (a: string, b: string) => parseInt(a) - parseInt(b) || (a < b ? -1 : a > b ? 1 : 0);
const locValue = (l: string) => parseInt(l) + (/[a-z]$/.test(l) ? (l.charCodeAt(l.length - 1) - 96) / 100 : 0);
let templates: Template[] | undefined;
function retained(): Template[] {
  if (templates) return templates;
  templates = RETAINED.map(([name, prefix, s, hetero]) => {
    let el: string[], adj: number[][], labels: string[], peri: number[];
    if (hetero === undefined) {
      // Numbered by FR-5: atoms put in locant order.
      const g = skeleton(s), num = numberSystem(ringSystem(g.el, g.adj))[0], at = new Map(num.path.map((a, i) => [a, i]));
      el = num.path.map((a) => g.el[a]);
      adj = num.path.map((a) => g.adj[a].map((b) => at.get(b)!));
      labels = num.labels;
      peri = num.path.slice(0, num.path.length - num.interior.length).map((_, i) => i);
    } else {
      const pairs = s.split(" ").map((b) => b.split("-"));
      labels = [...new Set(pairs.flat())].sort(locOrder);
      el = labels.map(() => "C");
      for (const h of hetero.split(" ").filter(Boolean)) el[labels.indexOf(h.slice(1))] = h[0];
      adj = labels.map(() => []);
      for (const [a, b] of pairs) { adj[labels.indexOf(a)].push(labels.indexOf(b)); adj[labels.indexOf(b)].push(labels.indexOf(a)); }
      const sys = ringSystem(el, adj);
      // The periphery from 1 towards 2.
      const step = sys.next[1] === 0 ? (a: number) => sys.next.indexOf(a) : (a: number) => sys.next[a];
      peri = [0];
      while (peri.length < sys.next.filter((x) => x >= 0).length) peri.push(step(peri[peri.length - 1]));
    }
    const sys = ringSystem(el, adj);
    return { name, prefix, el, adj, labels, peri, rings: sys.rings.length, sizes: sys.rings.map((r) => r.length).sort((a, b) => b - a) };
  });
  return templates;
}

// Hantzsch-Widman names (P-22.2.2) and the retained names of monocycles used in fusion names (P-25.3.2.2).
const HW_ORDER = ["O", "S", "Se", "Te", "N", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Hg"];
const HW_PREFIX: Record<string, string> = { O: "oxa", S: "thia", Se: "selena", Te: "tellura", N: "aza" };
const MULT = ["", "", "di", "tri", "tetra", "penta"];
const MONO: Record<string, [string, string]> = {
  "6:": ["benzene", "benzo"], "6:N1": ["pyridine", "pyrido"], "6:N1,N2": ["pyridazine", "pyridazino"], "6:N1,N3": ["pyrimidine", "pyrimido"],
  "6:N1,N4": ["pyrazine", "pyrazino"], "6:O1": ["pyran", "pyrano"], "6:S1": ["thiopyran", "thiopyrano"], "5:N1": ["pyrrole", "pyrrolo"],
  "5:N1,N2": ["pyrazole", "pyrazolo"], "5:N1,N3": ["imidazole", "imidazo"], "5:O1": ["furan", "furo"], "5:S1": ["thiophene", "thieno"],
  "5:": ["", "cyclopenta"], "4:": ["", "cyclobuta"], "3:": ["", "cyclopropa"], "7:": ["[7]annulene", "cyclohepta"], "8:": ["[8]annulene", "cycloocta"],
};

// A ring as a component: its name, prefix, stem and the numberings its heteroatoms allow (low locants together, then
// O, S, N).
function monocycle(els: string[]): { name: string; prefix: string; stem: string; nums: number[][] } | undefined {
  const n = els.length;
  let nums: number[][] = [];
  for (let s = 0; s < n; s++) for (const d of [1, -1]) nums.push(els.map((_, k) => (s + d * k + 2 * n) % n));
  const lowest = (f: (num: number[]) => number[]) => {
    let best: number[] | undefined;
    for (const num of nums) { const l = f(num); if (!best || cmp(l, best) < 0) best = l; }
    nums = nums.filter((num) => !cmp(f(num), best!));
  };
  lowest((num) => num.map((a, k) => (els[a] !== "C" ? k + 1 : 0)).filter(Boolean));
  for (const e of HW_ORDER) lowest((num) => num.map((a, k) => (els[a] === e ? k + 1 : 0)).filter(Boolean));
  const hetero = nums[0].flatMap((a, k): [string, number][] => (els[a] !== "C" ? [[els[a], k + 1]] : []))
    .sort((x, y) => HW_ORDER.indexOf(x[0]) - HW_ORDER.indexOf(y[0]) || x[1] - y[1]);
  if (hetero.some(([e]) => !HW_PREFIX[e])) return undefined;
  const known = MONO[`${n}:${hetero.map(([e, k]) => e + k).join(",")}`];
  if (known) return { name: known[0], prefix: known[1], stem: known[0], nums };
  const stems = ["", "", "", hetero.some(([e]) => e === "N") ? "irine" : "irene", "ete", "ole", "ine", "epine", "ocine", "onine", "ecine"];
  if (!hetero.length || !stems[n]) return undefined;
  const locs = hetero.length > 1 ? `[${hetero.map(([, k]) => k).join(",")}]` : "";
  const stem = (HW_ORDER.filter((e) => hetero.some(([x]) => x === e)).map((e) => MULT[hetero.filter(([x]) => x === e).length] + HW_PREFIX[e]).join("") + stems[n]).replace(/a(?=[aeiou])/g, "");
  return { name: locs + stem, prefix: locs + stem.replace(/e$/, "o"), stem, nums };
}

// Seniority of a component (FR-2.3): nitrogen, then the first heteroatom in F, Cl, Br, I, O, S ... order; more rings;
// larger rings; more heteroatoms; more kinds; more of each in order; lower heteroatom locants; lower locants in order;
// lower fusion carbon locants.
const FR23A = ["F", "Cl", "Br", "I", "O", "S", "Se", "Te", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Hg"];
const FR23F = ["F", "Cl", "Br", "I", "O", "S", "Se", "Te", "N", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Hg"];
function seniority(el: string[], labels: string[], sizes: number[], fusion: boolean[]): number[] {
  const hetero = el.map((e, i) => (e !== "C" ? i : -1)).filter((i) => i >= 0), has = (e: string) => hetero.some((i) => el[i] === e);
  const first = has("N") ? 0 : FR23A.findIndex(has) + 1 || 99;
  const locs = (f: (i: number) => boolean) => el.map((_, i) => i).filter(f).map((i) => locValue(labels[i])).sort((a, b) => a - b);
  return [first, -sizes.length, ...sizes.map((s) => -s), -hetero.length, -new Set(hetero.map((i) => el[i])).size, ...FR23F.map((e) => -hetero.filter((i) => el[i] === e).length),
    ...locs((i) => el[i] !== "C"), ...FR23F.flatMap((e) => locs((i) => el[i] === e)), ...locs((i) => el[i] === "C" && fusion[i])];
}

// Every map of a template onto atoms that keeps elements and bonds (bounded).
function isomorphisms(tel: string[], tadj: number[][], atoms: number[], el: (a: number) => string, nb: (a: number) => number[]): number[][] {
  const order = [0];
  for (let k = 0; k < order.length; k++) for (const j of tadj[order[k]]) if (!order.includes(j)) order.push(j);
  const out: number[][] = [], map: number[] = tel.map(() => -1), used = new Set<number>();
  let steps = 0;
  const place = (k: number) => {
    if (++steps > 50000) throw new Error("ring match");
    if (k === order.length) { out.push([...map]); return; }
    const p = order[k], placed = tadj[p].filter((q) => map[q] >= 0);
    for (const a of placed.length ? nb(map[placed[0]]) : atoms) {
      if (used.has(a) || el(a) !== tel[p] || nb(a).length !== tadj[p].length || !placed.every((q) => nb(map[q]).includes(a))) continue;
      map[p] = a; used.add(a);
      place(k + 1);
      map[p] = -1; used.delete(a);
    }
  };
  place(0);
  return out;
}

// The components found in a system: each ring, every retained polycycle, and benzo units (a benzene ring with a
// heteromonocycle of five or more members, FR-3.5), numbered as a fused bicycle.
function components(sys: RingSystem) {
  const { rings, across, el, adj } = sys;
  const monos = rings.map((r, i): Comp | undefined => {
    const m = monocycle(r.map((a) => el[a]));
    if (!m) return undefined;
    const nums = m.nums.map((num) => num.map((k) => r[k])), labels = r.map((_, k) => String(k + 1));
    return { name: m.name, prefix: m.prefix, rings: [i], nums, labels, peri: labels.map((_, k) => k), carbo: !r.some((a) => el[a] !== "C"),
      key: seniority(nums[0].map((a) => el[a]), labels, [r.length], labels.map(() => false)) };
  });
  // Retained polycycles on connected sets of rings with the same atoms and bonds.
  const polys: Comp[] = [], sets = new Map<string, number[]>();
  const grow = (set: number[]) => {
    const k = [...set].sort((a, b) => a - b).join();
    if (sets.has(k) || set.length > 10) return;
    sets.set(k, set);
    for (const r of set) for (const s of across[r]) if (s >= 0 && !set.includes(s)) grow([...set, s]);
  };
  rings.forEach((_, r) => grow([r]));
  for (const set of sets.values()) {
    if (set.length < 2) continue;
    const atoms = [...new Set(set.flatMap((r) => rings[r]))], inSet = new Set(atoms);
    const bonds = new Set(set.flatMap((r) => rings[r].map((a, k) => key(a, rings[r][(k + 1) % rings[r].length]))));
    const nb = (a: number) => adj[a].filter((b) => inSet.has(b) && bonds.has(key(a, b)));
    for (const t of retained()) {
      if (t.rings !== set.length || t.el.length !== atoms.length) continue;
      const nums = isomorphisms(t.el, t.adj, atoms, (a) => el[a], nb);
      if (nums.length && t.prefix) polys.push({ name: t.name, prefix: t.prefix, rings: set, nums, labels: t.labels, peri: t.peri, carbo: false, key: seniority(t.el, t.labels, t.sizes, t.adj.map((x) => x.length === 3)) });
    }
  }
  const unit = (set: number[]): Comp | undefined => {
    if (set.length !== 2 || polys.some((p) => p.rings.length === 2 && set.every((r) => p.rings.includes(r)))) return undefined;
    const [b, h] = monos[set[0]]?.name === "benzene" ? set : [set[1], set[0]];
    const ring = rings[h], m = monocycle(ring.map((a) => el[a]));
    if (monos[b]?.name !== "benzene" || !m || !ring.some((a) => el[a] !== "C") || ring.length < 5 || !across[b].includes(h)) return undefined;
    const atoms = [...new Set([...rings[b], ...ring])], at = new Map(atoms.map((a, i) => [a, i]));
    const local = ringSystem(atoms.map((a) => el[a]), atoms.map((a) => adj[a].filter((x) => at.has(x)).map((x) => at.get(x)!)));
    const num = numberSystem(local), nums = num.map((x) => x.path.map((i) => atoms[i])), labels = num[0].labels;
    const hetero = nums[0].flatMap((a, i): [string, string][] => (el[a] !== "C" ? [[el[a], labels[i]]] : []))
      .sort((x, y) => HW_ORDER.indexOf(x[0]) - HW_ORDER.indexOf(y[0]) || locOrder(x[1], y[1]));
    const locs = m.name === "imidazole" ? "" : `[${hetero.map((x) => x[1]).join(",")}]`;
    const benz = /^[aeiou]/.test(m.stem) ? "benz" : "benzo";
    return { name: locs + benz + m.stem, prefix: locs + benz + m.prefix.replace(/^\[[^\]]*\]/, ""), rings: set, nums, labels, peri: labels.map((_, i) => i), carbo: false,
      key: seniority(nums[0].map((a) => el[a]), labels, [ring.length, 6].sort((x, y) => y - x), nums[0].map((a) => local.adj[at.get(a)!].length === 3)) };
  };
  return { monos, polys, unit };
}

// The fusion name of a system (P-25.3.1.3): the senior component as the base, the other rings as first-order attached
// components (ortho- or peri-fused to the base), each with its fusion descriptor. `num` is the system's own numbering,
// for benzo names (P-25.2.2.4).
export function fusionName(sys: RingSystem, num: Numbering): string {
  const { rings, across, el } = sys;
  const { monos, polys, unit } = components(sys);
  // A benzo name for benzene with one heteromonocycle: 2H-1,4-benzoxazine.
  if (rings.length === 2) {
    const u = unit([0, 1]);
    if (u) {
      const hetero = num.path.flatMap((a, i): [string, string][] => (el[a] !== "C" ? [[el[a], num.labels[i]]] : []))
        .sort((x, y) => HW_ORDER.indexOf(x[0]) - HW_ORDER.indexOf(y[0]) || locOrder(x[1], y[1]));
      const stem = u.name.replace(/^\[[^\]]*\]/, "");
      return stem === "benzimidazole" ? stem : `${hetero.map((x) => x[1]).join(",")}-${stem}`;
    }
  }
  const all = [...monos.filter((c): c is Comp => !!c), ...polys];
  if (!all.length) throw new Error("fused ring component");
  const senior = all.reduce((m, c) => (cmp(c.key, m.key) < 0 ? c : m));
  const bases = all.filter((c) => !cmp(c.key, senior.key));
  if (new Set(bases.map((c) => c.name)).size > 1 || !senior.name) throw new Error("fused ring base component");
  let best: { key: number[]; name: string } | undefined;
  for (const b0 of bases) {
    let base = b0;
    // The other rings, in groups fused to each other; each group one component fused to the base.
    const rest = rings.map((_, r) => r).filter((r) => !base.rings.includes(r)), groups: number[][] = [];
    for (const r of rest) {
      if (groups.some((g) => g.includes(r))) continue;
      const g = [r];
      for (let i = 0; i < g.length; i++) for (const s of across[g[i]]) if (s >= 0 && rest.includes(s) && !g.includes(s)) g.push(s);
      groups.push(g);
    }
    let attached: Comp[] = [];
    const touches = (r: number) => across[r].some((s) => base.rings.includes(s));
    let beyond: Comp | undefined; // a ring fused to a benzo ring that is fused to the base (second order)
    for (const g of groups) {
      let c = g.length === 1 ? monos[g[0]] : polys.find((p) => p.rings.length === g.length && g.every((r) => p.rings.includes(r)));
      // Benzene and a heteromonocycle: a benzo unit fused to the base by its heteroring ([1]benzofuro[3,2-b]pyridine),
      // or a benzo ring between the base and the heteroring (furo[3,2-g][1]benzopyran).
      if (!c && g.length === 2) {
        const b = g.find((r) => monos[r]?.name === "benzene"), h = g.find((r) => r !== b)!;
        if (b !== undefined && touches(h)) c = unit(g);
        else if (b !== undefined && touches(b) && !beyond && monos[h]) { beyond = monos[h]; c = monos[b]; }
      }
      if (!c || !g.some(touches)) { attached = []; break; }
      attached.push(c);
    }
    if (!attached.length) continue;
    // FR-3.5: a benzo ring on a heteromonocyclic base joins it, unless benzo is multiplied (dibenzofuran).
    const benzos = attached.filter((c) => c.name === "benzene");
    if (base.rings.length === 1 && !base.carbo && benzos.length === 1) {
      const u = unit([base.rings[0], benzos[0].rings[0]]);
      if (u) { base = u; attached = attached.filter((c) => c !== benzos[0]); }
    }
    if (beyond) { if (base.rings.length !== 2) continue; attached.push(beyond); }
    // A more senior attached component becomes the base (pyrido[1,2-a]benzimidazole).
    if (attached.some((c) => cmp(c.key, base.key) < 0)) {
      if (attached.length !== 1) continue;
      [base, attached] = [attached[0], [base]];
    }
    if (!base.name) continue;
    const named = describe(sys, base, attached);
    if (named && (!best || cmp(named.key, best.key) < 0)) best = named;
  }
  if (!best) throw new Error("fused ring components");
  return best.name;
}

// The fusion descriptors (FR-4.3 to FR-4.6) and the name: attached prefixes in alphabetical order, then the base.
// Letters as low as possible (as a set, then in order of citation), then the attached locants (as a set, then in order).
function describe(sys: RingSystem, base: Comp, attached: Comp[]): { key: number[]; name: string } | undefined {
  const { rings, across } = sys;
  const letter = (i: number) => String.fromCharCode(97 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : "");
  const contacts = attached.map((c) => c.rings.flatMap((r) => rings[r].flatMap((a, k): [number, number][] => (base.rings.includes(across[r][k]) ? [[a, rings[r][(k + 1) % rings[r].length]]] : []))));
  let best: { key: number[]; name: string } | undefined;
  for (const m of base.nums) {
    const P = base.peri.length, at = base.peri.map((i) => m[i]);
    // The base sides each attached component is fused to: consecutive sides along the periphery, the shared atoms in
    // the direction of the letters.
    const descs: { sides: number[]; atoms: number[] }[] = [];
    for (const bonds of contacts) {
      const sides = bonds.map(([a, b]) => at.findIndex((x, i) => (x === a && at[(i + 1) % P] === b) || (x === b && at[(i + 1) % P] === a)));
      if (sides.some((s) => s < 0)) return undefined;
      const start = sides.find((s) => !sides.includes((s + P - 1) % P));
      if (start === undefined) return undefined;
      const run = sides.map((_, i) => (start + i) % P);
      if (run.some((s) => !sides.includes(s))) return undefined;
      descs.push({ sides: run, atoms: [...run.map((s) => at[s]), at[(run[run.length - 1] + 1) % P]] });
    }
    // Each attached component's locants, its numbering as low as possible; fusion carbon atoms between the ends are
    // left out (FR-4.6.2). Hydrocarbon monocycles (benzo, cyclopenta) cite letters only.
    const parts: { prefix: string; letters: string; sides: number[]; locs: string[]; key: number[] }[] = [];
    for (const [j, c] of attached.entries()) {
      const d = descs[j], letters = d.sides.map(letter).join("");
      let locs: string[] = [], best1: number[] = [];
      if (!c.carbo) {
        for (const cm of c.nums) {
          const idx = d.atoms.map((a) => cm.indexOf(a));
          if (idx.some((i) => i < 0)) return undefined;
          const l = idx.filter((i, k) => k === 0 || k === idx.length - 1 || !/[a-z]$/.test(c.labels[i])).map((i) => c.labels[i]);
          const v = l.map(locValue), k = [...[...v].sort((a, b) => a - b), ...v];
          if (!best1.length || cmp(k, best1) < 0) { locs = l; best1 = k; }
        }
      }
      parts.push({ prefix: c.prefix, letters, sides: d.sides, locs, key: best1 });
    }
    // Citation order: alphabetical by prefix (FR-3.6), identical prefixes together, lower letters first.
    const alpha = (t: string) => t.replace(/^\[[^\]]*\]/, "").replace(/^(as|s)-/, "");
    parts.sort((x, y) => alpha(x.prefix).localeCompare(alpha(y.prefix)) || x.prefix.localeCompare(y.prefix) || cmp(x.sides, y.sides));
    const key = [...parts.flatMap((p) => p.sides).sort((a, b) => a - b), -1, ...parts.flatMap((p) => p.sides), -1, ...parts.flatMap((p) => p.key)];
    if (best && cmp(key, best.key) >= 0) continue;
    // A carbocyclic monocyclic base with one attached component needs no letters (5H-benzo[7]annulene).
    const bare = base.carbo && base.rings.length === 1 && attached.length === 1;
    let text = "";
    for (let i = 0; i < parts.length; ) {
      const group = parts.filter((p) => p.prefix === parts[i].prefix);
      const list = group.map((p, k) => (p.locs.length ? `${p.locs.map((l) => l + "'".repeat(k)).join(",")}-${p.letters}` : p.letters)).join(group.some((p) => p.locs.length) ? ":" : ",");
      const mult = group.length > 1 ? (/^(\[|di|tri)/.test(group[0].prefix) ? ["", "", "bis", "tris", "tetrakis"][group.length] : MULT[group.length]) : "";
      const prefix = /s$/.test(mult) ? `${mult}(${group[0].prefix})` : mult + group[0].prefix;
      text += bare ? prefix : `${prefix}[${list}]`;
      i += group.length;
    }
    best = { key, name: text + base.name };
  }
  return best;
}

// The parent name and numberings of a fused system outside the namer's table, for atoms of a molecule: the name, its
// locants in order, and each numbering (the molecule's atoms in locant order). `uncited` holds indices whose locants
// the rules leave open (interior atoms), which a name must not cite.
export function fusedParent(atoms: number[], el: (a: number) => string, ring: (a: number) => number[]): { name: string; labels: string[]; nums: number[][]; uncited: number[] } {
  const at = new Map(atoms.map((a, i) => [a, i]));
  const lel = atoms.map(el), ladj = atoms.map((a) => ring(a).map((b) => at.get(b)!));
  const sys = ringSystem(lel, ladj);
  // Fusion names need two rings of five or more members (P-25.0); else von Baeyer names.
  if (sys.rings.filter((r) => r.length >= 5).length < 2) throw new Error("small fused rings");
  const inner = (labels: string[], n: number) => (n > 1 ? labels.map((_, i) => i).slice(labels.length - n) : []);
  // A retained name for the whole system keeps its own numbering.
  for (const t of retained()) {
    if (t.el.length !== atoms.length || t.rings !== sys.rings.length) continue;
    const nums = isomorphisms(t.el, t.adj, lel.map((_, i) => i), (i) => lel[i], (i) => ladj[i]);
    if (nums.length) return { name: t.name, labels: t.labels, nums: nums.map((n) => n.map((i) => atoms[i])), uncited: inner(t.labels, t.labels.length - t.peri.length) };
  }
  const num = numberSystem(sys);
  return { name: fusionName(sys, num[0]), labels: num[0].labels, nums: num.map((n) => n.path.map((i) => atoms[i])), uncited: inner(num[0].labels, num[0].interior.length) };
}
