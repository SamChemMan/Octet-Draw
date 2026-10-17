// Checks a drawing the way a chemist would at a glance: atoms with too many bonds, and messy geometry.
// Messages follow the brief's style: what is wrong, the rule, then what to do.
import { bondedTo, bondOrders, LARGE, neighbours, pos, type P } from "./edit.ts";
import { HBOND, type Bond, type Mol } from "./render.ts";

const NAMES: Record<string, string> = { C: "Carbon", N: "Nitrogen", O: "Oxygen", S: "Sulfur", P: "Phosphorus", B: "Boron", F: "Fluorine", Cl: "Chlorine", Br: "Bromine", I: "Iodine", H: "Hydrogen", Si: "Silicon" };
// Highest normal valence for a neutral atom (S and P can expand). A charge moves it: N+ and O+ take one more bond.
const MAX: Record<string, number> = { C: 4, Si: 4, N: 3, O: 2, S: 6, P: 5, B: 3, F: 1, Cl: 1, Br: 1, I: 1, H: 1 };

export type Problem = { atom: number; message: string; fix?: { label: string; charge: number } };

export function problems(m: Mol): Problem[] {
  const out: Problem[] = [], orders = bondOrders(m);
  m.atoms.forEach((a, i) => {
    if (a.text || a.ignoreWarnings || !(a.label in MAX)) return;
    const used = orders[i];
    const charge = a.charge ?? 0;
    const allowed = a.label === "C" || a.label === "Si" || a.label === "B" ? MAX[a.label] - Math.abs(charge) + (a.label === "B" && charge < 0 ? 2 : 0) : MAX[a.label] + charge;
    if (used <= allowed) return;
    const bonds = Number.isInteger(used) ? `${used} bonds` : `${used} bond orders`;
    const canCharge = (a.label === "N" || a.label === "O" || a.label === "P" || a.label === "S") && used === allowed + 1;
    out.push({
      atom: i,
      message: `${a.label}${i + 1} has ${bonds}. ${NAMES[a.label] ?? a.label} has a maximum of ${allowed}. ${canCharge ? "Add a positive charge or remove a bond." : "Remove a bond."}`,
      fix: canCharge ? { label: "Add a positive charge", charge: charge + 1 } : undefined,
    });
  });
  // A hydrogen bond goes from an explicit H to an acceptor atom, as ChemDraw's Invalid or ambiguous H-Bond warning asks.
  m.bonds.forEach((b) => {
    if (b.type !== HBOND) return;
    const isH = (i: number) => m.atoms[i].label === "H" && !m.atoms[i].text, [p, q] = b.atoms, h = isH(p) ? p : isH(q) ? q : undefined;
    const other = h === p ? q : p, at = h ?? p;
    if ((h !== undefined && !isH(other) && ACCEPTORS.has(m.atoms[other].label) && !m.atoms[other].text) || m.atoms[at].ignoreWarnings) return;
    out.push({ atom: at, message: `The hydrogen bond at ${m.atoms[at].text ?? m.atoms[at].label}${at + 1} does not join an H atom to an acceptor. Draw it from an H atom to an N, O or F atom.` });
  });
  return out;
}
const ACCEPTORS = new Set(["N", "O", "F", "S", "Se", "P", "Cl", "Br", "I"]);

// Is f true for a pair of points (by index) that may be within `cell` of each other? Each point is put in a grid of
// that size and compared only with the points already in its own cell and the eight cells round it. A cell's key is a
// number (faster than a string); two cells with the same key only add pairs for f to test.
function nearPair(ps: P[], cell: number, f: (i: number, j: number) => boolean): boolean {
  const grid = new Map<number, number[]>(), key = (x: number, y: number) => x * 4194304 + y;
  return ps.some((p, k) => {
    const x = Math.floor(p[0] / cell), y = Math.floor(p[1] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of grid.get(key(x + dx, y + dy)) ?? []) if (f(j, k)) return true;
    const here = grid.get(key(x, y));
    if (here) here.push(k); else grid.set(key(x, y), [k]);
    return false;
  });
}

// Messy geometry: a bond far from the standard length, or two atoms almost on top of each other.
export function messy(m: Mol, ids?: Set<number>): boolean {
  const inside = (i: number) => !ids?.size || ids.has(i);
  const uneven = m.bonds.some((b) => {
    if (!inside(b.atoms[0]) || !inside(b.atoms[1])) return false;
    const [p, q] = [pos(m, b.atoms[0]), pos(m, b.atoms[1])];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return length < 0.75 || length > 1.3;
  });
  if (uneven) return true;
  const atoms = m.atoms.map((_, i) => i).filter(inside), large = m.atoms.length > LARGE;
  const near = large ? bondedTo(m) : undefined;
  const close = (i: number, j: number) => {
    const [p, q]: P[] = [pos(m, i), pos(m, j)];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.35 && !(near ? near[i] : neighbours(m, i)).includes(j);
  };
  // A large drawing compares only atoms in the same or next cells of a grid.
  const crowded = large ? nearPair(atoms.map((i) => pos(m, i)), 0.5, (j, k) => close(atoms[j], atoms[k]))
    : atoms.some((i, k) => atoms.slice(k + 1).some((j) => close(i, j)));
  if (crowded) return true;
  // Two bonds that cross (and share no atom) also need cleaning up.
  const bonds = m.bonds.filter((b) => inside(b.atoms[0]) && inside(b.atoms[1]));
  const cross = (a: P, b: P, c: P, d: P) => {
    const s = (p: P, q: P, r: P) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return s(a, b, c) * s(a, b, d) < 0 && s(c, d, a) * s(c, d, b) < 0;
  };
  const crossing = (b: Bond, c: Bond) =>
    !b.atoms.some((i) => c.atoms.includes(i)) && cross(pos(m, b.atoms[0]), pos(m, b.atoms[1]), pos(m, c.atoms[0]), pos(m, c.atoms[1]));
  // Here every bond is at most 1.3 long, so two bonds that cross have midpoints at most 1.3 apart.
  if (large) return nearPair(bonds.map((b) => { const [p, q] = [pos(m, b.atoms[0]), pos(m, b.atoms[1])]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }), 1.5, (j, k) => crossing(bonds[j], bonds[k]));
  return bonds.some((b, k) => bonds.slice(k + 1).some((c) => crossing(b, c)));
}
