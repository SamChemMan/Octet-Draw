// Sequences drawn from their monomers (issue 27): one builder for the Sequence tool's field, pasted HELM, the MCP and
// the document setting for how sequences show. Each monomer (monomers.ts) is read by Indigo once and kept. As atoms,
// the monomers' atoms are joined where their links are ([*:1] of one to [*:2] of the one before it, and each link of
// the sequence) and laid out along a straight backbone (chain.ts); each stereocentre keeps the hand its monomer gives
// it. As residue labels, each monomer is a label that keeps its atoms, bonded to the next by its links (Bond.ports),
// in rows. A 60-residue peptide takes milliseconds, where laying out its SMILES took Indigo about a second.
import type { Atom, Mol } from "./render.ts";
import { fullMol, handsDrawn, indigoLayout, parseStructure, toMolfile, toSmiles } from "./chem.ts";
import { chainLayout } from "./chain.ts";
import { fragments } from "./edit.ts";
import { byLabel, monomer, peptideMonomers, smilesLinks, type PolymerKind } from "./monomers.ts";
import { labelLayout } from "./sequence.ts";
import type { End, Seq, SeqUnit } from "./helm.ts";

type P = [number, number];
// A monomer read: its atoms as Indigo lays them out (each [*:n] an atom of its own), for each link its R atom (r) and
// the atom bonded to it (at), what takes its place when not linked (cap: OH on an acyl carbon or a P, else H), and
// its stereocentres: each one's neighbours and where they lie, with depth for a wedge (1) or hash (-1).
type Prepared = { mol: Mol; r: (number | undefined)[]; at: (number | undefined)[]; cap: ("O" | "H")[]; centres: { c: number; around: number[]; xyz: [number, number, number][] }[] };
const prepared = new Map<string, Prepared | null>();
function prepare(smiles: string): Prepared | undefined {
  const kept = prepared.get(smiles);
  if (kept !== undefined) return kept ?? undefined;
  let out: Prepared | null = null;
  try {
    const links = smilesLinks(smiles), mol = links ? parseStructure(smiles, false) : undefined;
    if (links && mol && mol.atoms.length === links.atoms) {
      const near = mol.atoms.map((): number[] => []);
      for (const b of mol.bonds) { near[b.atoms[0]].push(b.atoms[1]); near[b.atoms[1]].push(b.atoms[0]); }
      const at = links.r.map((d) => (d !== undefined && near[d].length === 1 ? near[d][0] : undefined));
      const acyl = (i: number) => mol.atoms[i].label === "P" || (mol.atoms[i].label === "C" && mol.bonds.some((b) => b.type === 2 && b.atoms.includes(i) && mol.atoms[b.atoms[0] === i ? b.atoms[1] : b.atoms[0]].label === "O"));
      const cap = at.map((i): "O" | "H" => (i !== undefined && acyl(i) ? "O" : "H"));
      const centres: Prepared["centres"] = [];
      // The centres the SMILES gives a hand, each as Indigo's wedges draw it.
      for (const c of new Set(mol.bonds.filter((b) => (b.stereo === 1 || b.stereo === 6) && links.stereo.includes(b.atoms[0])).map((b) => b.atoms[0]))) {
        const bonds = mol.bonds.filter((b) => b.atoms.includes(c));
        if (bonds.length < 3 || bonds.length > 4 || bonds.some((b) => b.type !== 1)) continue;
        const z = (j: number) => { const b = bonds.find((x) => x.atoms[0] === c && x.atoms[1] === j); return b?.stereo === 1 ? 1 : b?.stereo === 6 ? -1 : 0; };
        centres.push({ c, around: near[c], xyz: near[c].map((j): [number, number, number] => [mol.atoms[j].location[0], mol.atoms[j].location[1], z(j)]) });
      }
      // Each link's R atom is bonded once, with a single bond.
      if (links.r.every((d, n) => d === undefined || (at[n] !== undefined && mol.bonds.some((b) => b.type === 1 && b.atoms.includes(d))))) out = { mol, r: links.r, at, cap, centres };
    }
  } catch { out = null; }
  if (prepared.size > 2000) prepared.clear();
  prepared.set(smiles, out);
  return out ?? undefined;
}
// A monomer as the free compound: each link's R atom replaced by its cap (OH or H), for its InChI.
export function cappedSmiles(smiles: string): string | undefined {
  const p = prepare(smiles);
  if (!p) return undefined;
  return smiles.replace(/\(\[\*:([1-3])\]\)|\[\*:([1-3])\]/g, (_, a, b) => { const cap = p.cap[Number(a ?? b)]; return cap === "O" ? (a ? "(O)" : "O") : ""; });
}
// The residues Contract Label and Copy As HELM name besides the natural ones: the D set, each as its capped SMILES
// and its label, worked out once.
let dRefs: [string, string][] | undefined;
export function monomerRefs(): [string, string][] {
  return (dRefs ??= peptideMonomers().filter((x) => x.code.startsWith("d")).flatMap((m): [string, string][] => { const c = cappedSmiles(m.smiles); return c ? [[c, m.label]] : []; }));
}
// The signed volume of four points: a centre's hand from its neighbours in order.
function volume([a, b, d, e]: number[][]): number {
  const [u, v, w] = [b, d, e].map((p) => [p[0] - a[0], p[1] - a[1], p[2] - a[2]]);
  return u[0] * (v[1] * w[2] - v[2] * w[1]) - u[1] * (v[0] * w[2] - v[2] * w[0]) + u[2] * (v[0] * w[1] - v[1] * w[0]);
}

// An inline peptide monomer is an α-amino acid, as every residue the chain reader finds: R1 (if any) on an N, R2 (if
// any) on a C=O carbon, the two one carbon apart (with only one of them, that carbon has the other's N or C=O). So
// it is read back as one residue, and no R joins another R.
function alpha(p: Prepared): boolean {
  const { mol, at } = p, label = (i: number) => mol.atoms[i].label;
  const near = (i: number) => mol.bonds.flatMap((b) => (b.atoms[0] === i ? [b.atoms[1]] : b.atoms[1] === i ? [b.atoms[0]] : []));
  const acyl = (i: number) => label(i) === "C" && mol.bonds.some((b) => b.type === 2 && b.atoms.includes(i) && label(b.atoms[0] === i ? b.atoms[1] : b.atoms[0]) === "O");
  const n = at[1], c = at[2];
  if (n === undefined && c === undefined) return false;
  if ((n !== undefined && label(n) !== "N") || (c !== undefined && !acyl(c))) return false;
  const alphas = (n !== undefined ? near(n) : near(c!)).filter((i) => label(i) === "C");
  return alphas.some((a) => (c !== undefined ? near(a).includes(c) : true) && (n !== undefined ? near(a).includes(n) : true) && near(a).some((j) => (n !== undefined ? acyl(j) : label(j) === "N")));
}

// What a sequence's units are, and what each link joins.
type Units = { kind: PolymerKind; unit: SeqUnit; smiles: string; label: string; prep: Prepared }[][];
const keyOf = (e: End) => `${e.chain} ${e.unit} ${e.r}`;
function unitsOf(seq: Seq): { units: Units; partner: Map<string, End> } | { problem: string } {
  const units: Units = [];
  for (const c of seq.chains) {
    const row: Units[number] = [];
    for (const u of c.units) {
      const m = u.smiles ? undefined : monomer(c.kind, u.code), smiles = u.smiles ?? m?.smiles;
      const prep = smiles ? prepare(smiles) : undefined;
      if (!smiles || !prep) return { problem: u.smiles ? "Octet cannot read a monomer's SMILES." : `Not a monomer: [${u.code}]` };
      if (u.smiles && c.kind === "peptide" && !alpha(prep)) return { problem: "A peptide's monomer must be an α-amino acid, with R1 on its N and R2 on its C=O carbon." };
      row.push({ kind: c.kind, unit: u, smiles, label: m?.label ?? "", prep });
    }
    units.push(row);
  }
  const partner = new Map<string, End>(), name = (x: Units[number][number]) => x.label || x.unit.code || "a monomer";
  units.forEach((row, c) => row.forEach((_, k) => {
    if (k + 1 >= row.length) return;
    partner.set(`${c} ${k} 2`, { chain: c, unit: k + 1, r: 1 });
    partner.set(`${c} ${k + 1} 1`, { chain: c, unit: k, r: 2 });
  }));
  for (const row of units) for (let k = 0; k + 1 < row.length; k++) if (row[k].prep.r[2] === undefined || row[k + 1].prep.r[1] === undefined) return { problem: `${name(row[k])} cannot be joined to ${name(row[k + 1])}.` };
  for (const [a, b] of seq.links) {
    for (const e of [a, b]) if (partner.has(keyOf(e)) || units[e.chain]?.[e.unit]?.prep.r[e.r] === undefined) return { problem: `${name(units[e.chain][e.unit])} has no free link at R${e.r}.` };
    partner.set(keyOf(a), b);
    partner.set(keyOf(b), a);
  }
  return { units, partner };
}

// The atoms Octet draws in full at most, and the residues (amino acids and nucleotides) as residue labels.
export const MOST_BUILT_ATOMS = 1000, MOST_LABELS = 1000;
// A sequence's residues: its units but a nucleic acid's phosphates and a peptide's Ac and NH2 ends.
export const residueCount = (seq: Seq) => seq.chains.reduce((t, c) => t + c.units.filter((u) => (c.kind === "peptide" ? u.code !== "ac" && u.code !== "am" : u.code !== "P")).length, 0);

// ——— As atoms ———
// The atoms a sequence has drawn in full: each monomer's, less each R atom linked or capped H (an OH cap stays an O).
const countOf = ({ units, partner }: { units: Units; partner: Map<string, End> }) => {
  let count = 0;
  for (const [c, row] of units.entries()) for (const [k, x] of row.entries()) count += x.prep.mol.atoms.length - x.prep.r.filter((d, n) => d !== undefined && (partner.has(`${c} ${k} ${n}`) || x.prep.cap[n] === "H")).length;
  return count;
};
export const TOO_MANY_ATOMS = `Up to ${MOST_BUILT_ATOMS.toLocaleString("en-GB")} atoms. Choose Residue labels.`;
// Whether a sequence has more atoms than Octet draws in full, as buildAtoms counts them, for the field before Return.
// Octet's own monomers are read once each; a monomer's own SMILES is counted from its text, so typing never waits
// for Indigo (each of its R atoms counted as gone).
export function tooManyAtoms(seq: Seq): boolean {
  const linked = new Set(seq.links.flatMap((l) => l.map((e) => keyOf(e))));
  let count = 0;
  seq.chains.forEach((c, k) => c.units.forEach((u, n) => {
    if (u.smiles) { const l = smilesLinks(u.smiles); count += l ? l.atoms - l.r.filter((d) => d !== undefined).length : 0; return; }
    const p = prepare(monomer(c.kind, u.code)?.smiles ?? "");
    const joined = (r: number) => linked.has(`${k} ${n} ${r}`) || (r === 1 && n > 0) || (r === 2 && n < c.units.length - 1);
    if (p) count += p.mol.atoms.length - p.r.filter((d, r) => d !== undefined && (joined(r) || p.cap[r] === "H")).length;
  }));
  return count > MOST_BUILT_ATOMS;
}
// look: what each unit's atoms are drawn with (a colour, a highlight), by chain and unit, when it is drawn again.
type Look = (chain: number, unit: number) => Partial<Atom> | undefined;
export function buildAtoms(seq: Seq, look?: Look): { mol: Mol } | { problem: string } {
  const read = unitsOf(seq);
  if ("problem" in read) return read;
  const { units, partner } = read;
  if (countOf(read) > MOST_BUILT_ATOMS) return { problem: TOO_MANY_ATOMS };
  const atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [], index: Int32Array[][] = [];
  // Each monomer's atoms where Indigo laid it out, the monomers apart; an R atom not linked is its cap (an O, or none).
  units.forEach((row, c) => { index.push([]); row.forEach((x, k) => {
    const map = new Int32Array(x.prep.mol.atoms.length).fill(-1), ox = k * 8, oy = -c * 40;
    x.prep.mol.atoms.forEach((a, i) => {
      const n = x.prep.r.indexOf(i);
      if (n > 0 && (partner.has(`${c} ${k} ${n}`) || x.prep.cap[n] === "H")) return;
      map[i] = atoms.length;
      const { charge, ...rest } = a;
      atoms.push({ ...rest, label: n > 0 ? "O" : a.label, location: [a.location[0] + ox, a.location[1] + oy, 0], ...(charge ? { charge } : {}), ...look?.(c, k) });
    });
    for (const b of x.prep.mol.bonds) if (map[b.atoms[0]] >= 0 && map[b.atoms[1]] >= 0) bonds.push({ type: b.type, atoms: [map[b.atoms[0]], map[b.atoms[1]]] });
    index[c].push(map);
  }); });
  const attach = (e: End) => index[e.chain][e.unit][units[e.chain][e.unit].prep.at[e.r]!];
  const done = new Set<string>();
  for (const [key, e] of partner) {
    const [c, k, n] = key.split(" ").map(Number), mine: End = { chain: c, unit: k, r: n as 1 | 2 | 3 };
    if (done.has(keyOf(e))) continue;
    done.add(key);
    bonds.push({ type: 1, atoms: [attach(mine), attach(e)] });
  }
  // Each stereocentre's hand as its monomer draws it, with its neighbours numbered as they are now: an R atom stands for
  // the atom now bonded in its place, or for an H (last) when it is not linked and caps H.
  const hands = new Map<number, number>();
  units.forEach((row, c) => row.forEach((x, k) => {
    for (const { c: centre, around, xyz } of x.prep.centres) {
      const here = index[c][k][centre];
      if (here < 0) continue;
      const nums = around.map((j) => {
        const n = x.prep.r.indexOf(j);
        if (n <= 0) return index[c][k][j];
        const e = partner.get(`${c} ${k} ${n}`);
        return e ? attach(e) : x.prep.cap[n] === "O" ? index[c][k][j] : Infinity;
      });
      const pts = nums.map((v, n) => [v, ...xyz[n]] as [number, number, number, number]).sort((p, q) => p[0] - q[0]).map((p) => p.slice(1));
      if (pts.length === 3) { const a = x.prep.mol.atoms[centre].location; pts.push([a[0], a[1], 0]); }
      const v = volume(pts);
      if (Math.abs(v) > 1e-6) hands.set(here, Math.sign(v));
    }
  }));
  return { mol: laidOut({ atoms, bonds }, hands) };
}

// Each structure along its straight backbone (chain.ts), its brackets on its links and its wedges set by hand; one the
// chain layout does not place (a dipeptide, three chains joined) laid out as Name to Structure draws its SMILES. The
// structures stand one under another.
function laidOut(m: Mol, hands: Map<number, number>): Mol {
  const parts: Mol[] = [];
  // Atoms keep their order, so each hand (by its neighbours' order) stays as it is.
  for (const frag of fragments(m).map((f) => [...f].sort((p, q) => p - q))) {
    const local = new Map(frag.map((i, k) => [i, k]));
    const part: Mol = { atoms: frag.map((i) => m.atoms[i]), bonds: m.bonds.filter((b) => local.has(b.atoms[0])).map((b) => ({ ...b, atoms: [local.get(b.atoms[0])!, local.get(b.atoms[1])!] as [number, number] })) };
    const own = new Map([...hands].filter(([i]) => local.has(i)).map(([i, h]) => [local.get(i)!, h]));
    const laid = chainLayout(part, part.atoms.map((_, k) => k));
    if (laid) {
      const placed = { ...part, atoms: part.atoms.map((a, k) => ({ ...a, location: [laid.get(k)![0], laid.get(k)![1], 0] as [number, number, number] })), bonds: part.bonds.map((b, k) => (laid.routes?.has(k) ? { ...b, route: laid.routes.get(k) } : b)) };
      parts.push(handsDrawn(placed, own));
      continue;
    }
    // Indigo's layout of the same atoms, the hands set on it, then drawn from its SMILES as Name to Structure draws one.
    try {
      const flat = indigoLayout(toMolfile(part));
      const drawn = handsDrawn({ ...part, atoms: part.atoms.map((a, k) => ({ ...a, location: flat.atoms[k].location })) }, own);
      parts.push(fullMol(toSmiles(drawn), false));
    } catch { parts.push(part); }
  }
  return stacked(parts);
}

// ——— As residue labels ———
// A residue label for each monomer, in rows (labelLayout). A peptide's ends are labels of their own (H, Ac, OH, NH2)
// with no atoms kept; every other cap is kept with its residue's atoms. A bond says which kept atom it joins at each
// labelled end (Bond.ports): a residue's N and C=O for its neighbours, its R3 atom for a link.
export function buildLabels(seq: Seq, look?: Look): { mol: Mol } | { problem: string } {
  const read = unitsOf(seq);
  if ("problem" in read) return read;
  const { units, partner } = read;
  if (residueCount(seq) > MOST_LABELS) return { problem: `Up to ${MOST_LABELS.toLocaleString("en-GB")} residues.` };
  // Residues with no label are drawn in full: as many atoms as a sequence drawn as atoms.
  if (units.flat().reduce((t, x) => t + (x.unit.smiles ? x.prep.mol.atoms.length : 0), 0) > MOST_BUILT_ATOMS) return { problem: `Up to ${MOST_BUILT_ATOMS.toLocaleString("en-GB")} atoms in residues with no label.` };
  // For each unit and each of its links, the atom a bond there joins (its label, or in a residue drawn in full, the atom
  // itself) and the kept atom (port; -1 for an atom drawn in full). rows: each chain's labels in order, ends too (a
  // residue in full by its first atom); along: the bonds along the chains; full: each residue drawn in full.
  const atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [], joinAt: number[][][] = [], port: number[][][] = [], rows: number[][] = [], along = new Set<number>();
  const full: { first: number; atoms: number[]; local: P[]; a: number; b: number }[] = [];
  const add = (a: Mol["atoms"][number]) => atoms.push(a) - 1;
  const bond = (b: Mol["bonds"][number], chain = false) => { if (chain) along.add(bonds.length); bonds.push(b); };
  units.forEach((row, c) => {
    const peptide = row[0].kind === "peptide", joins: number[][] = [], ports: number[][] = [], nodes: number[] = [];
    // A peptide's free N end is H (first, so the labels read H–Ala–…–OH in order), its free C=O end OH.
    const first = row[0], last = row[row.length - 1], free = (k: number, n: number) => !partner.has(`${c} ${k} ${n}`);
    const h = peptide && first.unit.code !== "ac" && first.prep.r[1] !== undefined && free(0, 1) ? add({ label: "H", location: [0, 0, 0], ...look?.(c, 0) }) : undefined;
    row.forEach((x, k) => {
      if (peptide && (x.unit.code === "ac" || x.unit.code === "am") && !x.unit.smiles) {
        const ac = x.unit.code === "ac", i = add({ label: ac ? "C" : "N", location: [0, 0, 0], text: ac ? "Ac" : "NH2", ...look?.(c, k) });
        nodes.push(i); joins.push([i, i, i, i]); ports.push([-1, -1, -1, -1]);
        return;
      }
      // The monomer's atoms, its R atoms left out, a cap kept where it is not a peptide's end label.
      const p = x.prep, map = new Int32Array(p.mol.atoms.length).fill(-1), kept: Mol = { atoms: [], bonds: [] };
      const endCap = (n: number) => peptide && ((n === 1 && k === 0) || (n === 2 && k === row.length - 1));
      p.mol.atoms.forEach((a, i) => {
        const n = p.r.indexOf(i);
        if (n > 0 && (partner.has(`${c} ${k} ${n}`) || p.cap[n] === "H" || endCap(n))) return;
        map[i] = kept.atoms.length;
        const { charge, ...rest } = a;
        kept.atoms.push({ ...rest, label: n > 0 ? "O" : a.label, location: [a.location[0], a.location[1], 0], ...(charge ? { charge } : {}) });
      });
      for (const b of p.mol.bonds) if (map[b.atoms[0]] >= 0 && map[b.atoms[1]] >= 0) kept.bonds.push({ ...b, atoms: [map[b.atoms[0]], map[b.atoms[1]]] });
      const at = p.at.map((i) => (i === undefined || map[i] < 0 ? -1 : map[i]));
      if (x.unit.smiles) {
        // A residue Octet has no label for: drawn in full in its place in the row (placed after the layout).
        const base = atoms.length;
        kept.atoms.forEach((a) => add({ ...a, ...look?.(c, k) }));
        kept.bonds.forEach((b) => bond({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] }));
        const first = at[1] >= 0 ? base + at[1] : base;
        full.push({ first, atoms: kept.atoms.map((_, n) => base + n), local: kept.atoms.map((a): P => [a.location[0], a.location[1]]), a: at[1] >= 0 ? at[1] : 0, b: at[2] >= 0 ? at[2] : at[1] >= 0 ? at[1] : 0 });
        nodes.push(first); joins.push(at.map((n) => (n >= 0 ? base + n : first))); ports.push([-1, -1, -1, -1]);
        return;
      }
      const i = add({ label: x.kind !== "peptide" && x.label === "P" ? "P" : "C", location: [0, 0, 0], text: x.label || x.unit.code, inner: kept, align: "centre", ...look?.(c, k) });
      nodes.push(i); joins.push([i, i, i, i]); ports.push(at);
    });
    joinAt.push(joins);
    port.push(ports);
    for (let k = 0; k + 1 < row.length; k++) bond({ type: 1, atoms: [joins[k][2], joins[k + 1][1]], ports: [ports[k][2], ports[k + 1][1]] }, true);
    const ordered = [...nodes];
    if (h !== undefined) {
      bond({ type: 1, atoms: [h, joins[0][1]], ports: [-1, ports[0][1]] }, true);
      ordered.unshift(h);
    }
    if (peptide && last.unit.code !== "am" && last.prep.r[2] !== undefined && free(row.length - 1, 2)) {
      const oh = add({ label: "O", location: [0, 0, 0], text: "OH", ...look?.(c, row.length - 1) });
      bond({ type: 1, atoms: [joins[row.length - 1][2], oh], ports: [ports[row.length - 1][2], -1] }, true);
      ordered.push(oh);
    }
    rows.push(ordered);
  });
  // The links: a bond from one residue to the other at their R atoms.
  for (const [a, b] of seq.links) bond({ type: 1, atoms: [joinAt[a.chain][a.unit][a.r], joinAt[b.chain][b.unit][b.r]], ports: [port[a.chain][a.unit][a.r], port[b.chain][b.unit][b.r]] });
  // A bond to an atom drawn in full has no port at that end.
  const mol: Mol = { atoms, bonds: bonds.map((b) => (b.ports && b.ports.every((q) => q < 0) ? (({ ports: _, ...rest }) => rest)(b) : b)) }, parts: Mol[] = [];
  // Each structure (chains joined by links) laid out, one under another.
  for (const frag of fragments(mol).map((f) => [...f].sort((p, q) => p - q))) {
    const inside = new Set(frag), mine = rows.filter((r) => inside.has(r[0]));
    const nodeOf = new Map(full.flatMap((f) => f.atoms.map((i): [number, number] => [i, f.first])));
    const laid = labelLayout(mol, frag, mine, along, nodeOf) ?? { at: new Map<number, P>(), routes: new Map<number, number>() };
    // Each residue drawn in full: its first and last backbone atoms along the row where its label would be, its side
    // chain away from the rows (mirrored, wedges and hashes swapped, so it is the same compound), and the rest of its
    // row moved along to make room.
    for (const f of full.filter((x) => inside.has(x.first))) {
      const row = mine.find((r) => r.includes(f.first))!, k = row.indexOf(f.first), here = laid.at.get(f.first) ?? [0, 0];
      const near = laid.at.get(row[k + 1] ?? row[k - 1]) ?? [here[0] + 1, here[1]], dir = Math.sign((k + 1 < row.length ? 1 : -1) * (near[0] - here[0])) || 1;
      const [ax, ay] = f.local[f.a], [bx, by] = f.local[f.b], turn = Math.atan2(by - ay, bx - ax), width = Math.hypot(bx - ax, by - ay);
      const c = Math.cos(-turn), s = Math.sin(-turn), rot = (q: P): P => [(q[0] - ax) * c - (q[1] - ay) * s, (q[0] - ax) * s + (q[1] - ay) * c];
      let pts = f.local.map(rot);
      const others = pts.filter((_, n) => n !== f.a && n !== f.b), up = others.reduce((t, q) => t + q[1], 0) >= 0, upper = here[1] >= Math.max(...[...laid.at.values()].map((q) => q[1])) - 1e-6;
      const flip = mine.length > 1 ? up !== upper : !up;
      if (flip) pts = pts.map((q) => [q[0], -q[1]]);
      const start = here[0] - dir * 0.6;
      f.atoms.forEach((i, n) => laid.at.set(i, [start + dir * pts[n][0], here[1] + pts[n][1]]));
      if (flip) mol.bonds.forEach((b, j) => { if (f.atoms.includes(b.atoms[0]) && f.atoms.includes(b.atoms[1]) && (b.stereo === 1 || b.stereo === 6)) mol.bonds[j] = { ...b, stereo: b.stereo === 1 ? 6 : 1 }; });
      const extra = Math.max(0, width - 1.2);
      for (const i of row.slice(k + 1)) { const q = laid.at.get(i); if (q) laid.at.set(i, [q[0] + dir * extra, q[1]]); }
    }
    const local = new Map(frag.map((i, k) => [i, k])), mineBonds = mol.bonds.filter((b) => inside.has(b.atoms[0]));
    parts.push(place({ atoms: frag.map((i) => mol.atoms[i]), bonds: mineBonds.map((b) => ({ ...b, atoms: [local.get(b.atoms[0])!, local.get(b.atoms[1])!] as [number, number] })) },
      { at: new Map([...laid.at].filter(([i]) => local.has(i)).map(([i, q]) => [local.get(i)!, q])), routes: new Map([...laid.routes].map(([k, r]) => [mineBonds.indexOf(mol.bonds[k]), r])) }));
  }
  return { mol: stacked(parts) };
}
// Structures one under another, each centred on the first's middle.
function stacked(parts: Mol[]): Mol {
  const out: Mol = { atoms: [], bonds: [] };
  let top = 0;
  for (const part of parts) {
    if (!part.atoms.length) continue;
    const xs = part.atoms.map((a) => a.location[0]), ys = part.atoms.map((a) => a.location[1]);
    const dx = -(Math.min(...xs) + Math.max(...xs)) / 2, dy = top - Math.max(...ys), base = out.atoms.length;
    out.atoms.push(...part.atoms.map((a) => ({ ...a, location: [a.location[0] + dx, a.location[1] + dy, 0] as [number, number, number] })));
    out.bonds.push(...part.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] })));
    top += Math.min(...ys) - Math.max(...ys) - 2;
  }
  return out;
}
const place = (m: Mol, laid: { at: Map<number, P>; routes: Map<number, number> }): Mol => ({
  ...m, atoms: m.atoms.map((a, i) => (laid.at.has(i) ? { ...a, location: [laid.at.get(i)![0], laid.at.get(i)![1], 0] as [number, number, number] } : a)),
  bonds: m.bonds.map((b, k) => (laid.routes.has(k) ? { ...b, route: laid.routes.get(k) } : b.route === undefined ? b : (({ route: _, ...rest }) => rest)(b))),
});

// Which kept atom of a residue label (its text and kept atoms) is its R3, for a bond to an atom of another structure:
// the atom its monomer links there, where that link caps H (a Cys's S, a Lys's N), so the atoms kept stay as they are.
// Undefined for a residue with no such R3, or whose kept atoms are not the monomer's.
export function r3Port(text: string, inner: Mol): number | undefined {
  const m = byLabel("peptide", text), p = m && prepare(m.smiles);
  if (!p || p.r[3] === undefined || p.at[3] === undefined || p.cap[3] !== "H") return undefined;
  const kept = p.mol.atoms.map((_, k) => k).filter((k) => !p.r.includes(k));
  if (inner.atoms.length !== kept.length || kept.some((k, n) => inner.atoms[n].label !== p.mol.atoms[k].label)) return undefined;
  return kept.indexOf(p.at[3]);
}
