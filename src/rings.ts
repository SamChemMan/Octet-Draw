// Rings and aromaticity on the Kekulé graph, shared by Octet's property calculators and its NMR prediction.
import type { Graph } from "./naming.ts";

// Each atom's neighbours with the bond's index.
const neighbours = (g: Graph) => {
  const adj: { to: number; k: number }[][] = g.atoms.map(() => []);
  g.bonds.forEach((b, k) => { adj[b.a].push({ to: b.b, k }); adj[b.b].push({ to: b.a, k }); });
  return adj;
};

// The smallest ring through each ring bond (found by the shortest path between its ends without it), each ring once,
// as its atoms in order around it.
export function rings(g: Graph): number[][] {
  const adj = neighbours(g), out = new Map<string, number[]>();
  g.bonds.forEach((b, k) => {
    const back = new Map<number, number>([[b.a, -1]]), queue = [b.a];
    for (let q = 0; q < queue.length && !back.has(b.b); q++) for (const e of adj[queue[q]]) if (e.k !== k && !back.has(e.to)) { back.set(e.to, queue[q]); queue.push(e.to); }
    if (!back.has(b.b)) return;
    const ring: number[] = [];
    for (let v = b.b; v !== -1; v = back.get(v)!) ring.push(v);
    if (ring.length <= 20) out.set([...ring].sort((x, y) => x - y).join(","), ring);
  });
  return [...out.values()];
}

// Aromatic atoms by Hückel's rule (4n + 2 π electrons) on each ring, then on each pair of fused rings, repeated until
// nothing changes, so naphthalene, indole, azulene and purine come out whichever Kekulé form is drawn. Electrons per
// ring atom: 1 for a double bond in the ring (or to an aromatic neighbour in a fused ring), 0 for a double bond out
// to O, N or S (as in 2-pyridone and caffeine) or for a cation with no double bond (tropylium), 2 for a lone pair
// (pyrrole N, furan O, thiophene S, a carbanion). An sp³ atom or an exocyclic C=C ends the ring's chance.
export function aromaticAtoms(g: Graph): boolean[] {
  const adj = neighbours(g), found = rings(g).filter((r) => r.length >= 3 && r.length <= 8), aromatic = g.atoms.map(() => false);
  const ringBond = new Set(found.flatMap((r) => r.map((v, i) => g.bonds.findIndex((b) => (b.a === v && b.b === r[(i + 1) % r.length]) || (b.b === v && b.a === r[(i + 1) % r.length])))));
  const electrons = (v: number, inRing: Set<number>): number | undefined => {
    const a = g.atoms[v], double = adj[v].find((e) => g.bonds[e.k].order === 2);
    if (adj[v].some((e) => g.bonds[e.k].order === 3) || adj[v].filter((e) => g.bonds[e.k].order === 2).length > 1) return undefined;
    if (double) {
      if (inRing.has(double.to)) return 1;
      if (aromatic[double.to] && ringBond.has(double.k)) return 1;
      return ["O", "N", "S"].includes(g.atoms[double.to].el) && ["C", "N", "S", "P"].includes(a.el) ? 0 : undefined;
    }
    if (a.el === "C") return a.charge < 0 ? 2 : a.charge > 0 ? 0 : undefined;
    if (a.el === "B") return 0;
    if (["N", "P"].includes(a.el)) return a.charge === 0 && adj[v].length + a.h === 3 ? 2 : undefined;
    if (["O", "S", "Se", "Te"].includes(a.el)) return a.charge === 0 && adj[v].length + a.h === 2 ? 2 : undefined;
    return undefined;
  };
  const huckel = (atoms: number[]) => {
    const inRing = new Set(atoms);
    let total = 0;
    for (const v of atoms) { const e = electrons(v, inRing); if (e === undefined) return false; total += e; }
    return total % 4 === 2;
  };
  const fused = found.flatMap((r, i) => found.slice(i + 1).filter((s) => s.filter((v) => r.includes(v)).length >= 2).map((s) => [...new Set([...r, ...s])]));
  for (let changed = true; changed;) {
    changed = false;
    for (const r of [...found, ...fused]) {
      if (r.every((v) => aromatic[v]) || !huckel(r)) continue;
      r.forEach((v) => { aromatic[v] = true; });
      changed = true;
    }
  }
  return aromatic;
}
