// Checks a drawing the way a chemist would at a glance: atoms with too many bonds, and messy geometry.
// Messages follow the brief's style: what is wrong, the rule, then what to do.
import { bondOrders, neighbours, pos, type P } from "./edit.ts";
import { HBOND, type Mol } from "./render.ts";

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
  const atoms = m.atoms.map((_, i) => i).filter(inside);
  const crowded = atoms.some((i, k) => atoms.slice(k + 1).some((j) => {
    const [p, q]: P[] = [pos(m, i), pos(m, j)];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.35 && !neighbours(m, i).includes(j);
  }));
  if (crowded) return true;
  // Two bonds that cross (and share no atom) also need cleaning up.
  const bonds = m.bonds.filter((b) => inside(b.atoms[0]) && inside(b.atoms[1]));
  const cross = (a: P, b: P, c: P, d: P) => {
    const s = (p: P, q: P, r: P) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return s(a, b, c) * s(a, b, d) < 0 && s(c, d, a) * s(c, d, b) < 0;
  };
  return bonds.some((b, k) => bonds.slice(k + 1).some((c) =>
    !b.atoms.some((i) => c.atoms.includes(i)) && cross(pos(m, b.atoms[0]), pos(m, b.atoms[1]), pos(m, c.atoms[0]), pos(m, c.atoms[1]))));
}
