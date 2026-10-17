// Checks a drawing the way a chemist would at a glance: atoms with too many bonds, and messy geometry.
// Messages follow the brief's style: what is wrong, the rule, then what to do.
import { neighbours, pos, type P } from "./edit.ts";
import type { Mol } from "./render.ts";

const NAMES: Record<string, string> = { C: "Carbon", N: "Nitrogen", O: "Oxygen", S: "Sulfur", P: "Phosphorus", B: "Boron", F: "Fluorine", Cl: "Chlorine", Br: "Bromine", I: "Iodine", H: "Hydrogen", Si: "Silicon" };
// Highest normal valence for a neutral atom (S and P can expand). A charge moves it: N+ and O+ take one more bond.
const MAX: Record<string, number> = { C: 4, Si: 4, N: 3, O: 2, S: 6, P: 5, B: 3, F: 1, Cl: 1, Br: 1, I: 1, H: 1 };
const ORDER: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 1.5 };

export type Problem = { atom: number; message: string; fix?: { label: string; charge: number } };

export function problems(m: Mol): Problem[] {
  const out: Problem[] = [];
  m.atoms.forEach((a, i) => {
    if (a.text || a.ignoreWarnings || !(a.label in MAX)) return;
    const used = m.bonds.reduce((n, b) => n + (b.atoms.includes(i) ? ORDER[b.type] ?? 1 : 0), 0);
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
  return out;
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
