// Octet's own file format: versioned, human-readable JSON. Treat every file as hostile: check it fully on read.
import type { Atom, Bond, Mol } from "./render";

export const FORMAT = "octet";
export const VERSION = 1;
const MAX_ATOMS = 100_000;

export function serialize(mol: Mol): string {
  const atoms = mol.atoms.map((a) => ({ label: a.label, x: round(a.location[0]), y: round(a.location[1]), ...(a.charge ? { charge: a.charge } : {}) }));
  const bonds = mol.bonds.map((b) => ({ atoms: b.atoms, type: b.type, ...(b.stereo ? { stereo: b.stereo } : {}) }));
  return JSON.stringify({ format: FORMAT, version: VERSION, structure: { atoms, bonds } }, null, 1) + "\n";
}
const round = (n: number) => Math.round(n * 1e4) / 1e4;

// Throws an Error with a message for the user if the file is not a drawing this version can read.
export function parse(text: string): Mol {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("This file is not an Octet drawing."); }
  const d = data as { format?: unknown; version?: unknown; structure?: { atoms?: unknown; bonds?: unknown } };
  if (d?.format !== FORMAT) throw new Error("This file is not an Octet drawing.");
  if (typeof d.version !== "number" || d.version > VERSION) throw new Error("This drawing comes from a newer version of Octet. Update Octet to open it.");
  const atoms = d.structure?.atoms, bonds = d.structure?.bonds;
  if (!Array.isArray(atoms) || !Array.isArray(bonds) || atoms.length > MAX_ATOMS || bonds.length > MAX_ATOMS * 4) throw new Error("This drawing is damaged.");
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6;
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  const out: Mol = { atoms: [], bonds: [] };
  for (const a of atoms as Record<string, unknown>[]) {
    if (typeof a?.label !== "string" || !/^[A-Z][a-z]{0,2}$/.test(a.label) || !num(a.x) || !num(a.y) || (a.charge !== undefined && !int(a.charge, -9, 9))) throw new Error("This drawing is damaged.");
    const atom: Atom = { label: a.label, location: [a.x as number, a.y as number, 0] };
    if (a.charge) atom.charge = a.charge as number;
    out.atoms.push(atom);
  }
  for (const b of bonds as Record<string, unknown>[]) {
    const ends = b?.atoms as unknown[];
    if (!Array.isArray(ends) || ends.length !== 2 || !ends.every((i) => int(i, 0, out.atoms.length - 1)) || ends[0] === ends[1] || !int(b.type, 1, 3) || (b.stereo !== undefined && b.stereo !== 1 && b.stereo !== 6)) throw new Error("This drawing is damaged.");
    const bond: Bond = { type: b.type as number, atoms: [ends[0] as number, ends[1] as number] };
    if (b.stereo) bond.stereo = b.stereo as number;
    out.bonds.push(bond);
  }
  return out;
}
