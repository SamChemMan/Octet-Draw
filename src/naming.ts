// Structure to name. Octet's namer writes a name from the molecular graph, and the name is only shown if OPSIN
// reads it back as the same structure (same standard InChI, stereochemistry included), so a wrong name never shows.
import { hydrogens, type Mol } from "./render.ts";

// The namer's input: Kekulé bonds and explicit hydrogen counts, with CIP labels (R, S on atoms; E, Z on double
// bonds) where the drawing has stereochemistry.
export type Graph = { atoms: { el: string; charge: number; h: number; cip?: string }[]; bonds: { a: number; b: number; order: 1 | 2 | 3; cip?: string }[] };
export type Cip = { atoms: (string | undefined)[]; bonds: (string | undefined)[] };

// A drawing (labels already expanded into atoms) as the namer's graph. Undefined for what the graph cannot hold:
// text labels, radicals and isotopes.
export function graphOf(m: Mol, cip?: Cip): Graph | undefined {
  if (m.bonds.some((b) => b.type < 1 || b.type > 3) || m.atoms.some((a) => a.text || a.radical || a.isotope)) return undefined;
  const used = m.atoms.map(() => 0);
  for (const b of m.bonds) for (const i of b.atoms) used[i] += b.type;
  return {
    atoms: m.atoms.map((a, i) => ({ el: a.label, charge: a.charge ?? 0, h: a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i]), ...(cip?.atoms[i] ? { cip: cip.atoms[i] } : {}) })),
    bonds: m.bonds.map((b, k) => ({ a: b.atoms[0], b: b.atoms[1], order: b.type as 1 | 2 | 3, ...(cip?.bonds[k] ? { cip: cip.bonds[k] } : {}) })),
  };
}

// The namer, once it is loaded.
let namer: ((g: Graph) => string | undefined) | undefined;
export const setNamer = (n: typeof namer) => { namer = n; };

// A checked name for a structure: the namer's name, if OPSIN's reading of it has the same InChI as the drawing. Else
// a name from Octet's own tables (known), checked the same way.
export function checkedName(drawn: Mol, expanded: Mol, read: (name: string) => string | undefined, inchi: (s: Mol | string) => string | undefined, cip?: (m: Mol) => Cip | undefined, known?: (inchi: string) => string | undefined): string | undefined {
  const want = inchi(drawn);
  if (!want) return undefined;
  const g = namer && graphOf(expanded, cip?.(expanded));
  const reads = (name: string | undefined) => { const smiles = name && read(name); return !!smiles && inchi(smiles) === want; };
  const name = g && namer!(g);
  if (name && reads(name)) return name;
  const other = known?.(want);
  return other && reads(other) ? other : undefined;
}
