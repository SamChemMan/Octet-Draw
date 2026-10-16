// Octet's template library, built by tools/library/build.mjs: amino acids, sugars, nucleobases, heterocycles,
// polycyclics and ligands, each drawn at bond length 1 and centred. A template's variant name in the Ring tool's
// list is "lib:" and its name.
import data from "./library.json";
import type { Mol } from "./render";

export type LibraryItem = { kind: string; name: string; category: string; mol: Mol };
type Raw = { name: string; items: { name: string; atoms: (string | number)[][]; bonds: number[][] }[] }[];

export const LIBRARY: { name: string; items: LibraryItem[] }[] = (data as Raw).map((c) => ({
  name: c.name,
  items: c.items.map((t) => ({
    kind: `lib:${t.name}`, name: t.name, category: c.name,
    mol: {
      atoms: t.atoms.map(([label, x, y, charge, radical]) => ({ label: label as string, location: [x as number, y as number, 0] as [number, number, number], ...(charge ? { charge: charge as number } : {}), ...(radical ? { radical: radical as number } : {}) })),
      bonds: t.bonds.map(([a, b, type, stereo]) => ({ atoms: [a, b] as [number, number], type, ...(stereo ? { stereo } : {}) })),
    },
  })),
}));
const byKind = new Map(LIBRARY.flatMap((c) => c.items.map((t) => [t.kind, t] as const)));
export const libraryItem = (kind: string) => byKind.get(kind);
