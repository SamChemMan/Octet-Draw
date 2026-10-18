// Octet's template library, built by tools/library/build.mjs: amino acids, sugars, nucleobases, heterocycles,
// polycyclics and ligands, each drawn at bond length 1 and centred, and the Lab group of glassware and lamps (pen
// curves and lines in one integral group, tools/library/lab.mjs). A template's variant name in the Ring tool's list is "lib:"
// and its name. also: more words the library search finds it by. icon: the part of a Lab item its 20 px icon draws.
import data from "./library.json";
import type { Arrow, Group, Mol } from "./render";

export type LibraryItem = { kind: string; name: string; category: string; mol: Mol; also?: string; icon?: Mol };
type Raw = { name: string; items: { name: string; also?: string; atoms: (string | number)[][]; bonds: number[][]; arrows?: Arrow[]; groups?: Group[]; icon?: number[] }[] }[];

export const LIBRARY: { name: string; items: LibraryItem[] }[] = (data as Raw).map((c) => ({
  name: c.name,
  items: c.items.map((t) => ({
    kind: `lib:${t.name}`, name: t.name, category: c.name, ...(t.also ? { also: t.also } : {}),
    ...(t.icon && t.arrows ? { icon: { atoms: [], bonds: [], arrows: t.arrows.filter((a) => t.icon!.includes(a.id)) } } : {}),
    mol: {
      atoms: t.atoms.map(([label, x, y, charge, radical]) => ({ label: label as string, location: [x as number, y as number, 0] as [number, number, number], ...(charge ? { charge: charge as number } : {}), ...(radical ? { radical: radical as number } : {}) })),
      bonds: t.bonds.map(([a, b, type, stereo]) => ({ atoms: [a, b] as [number, number], type, ...(stereo ? { stereo } : {}) })),
      ...(t.arrows ? { arrows: t.arrows } : {}), ...(t.groups ? { groups: t.groups } : {}),
    },
  })),
}));
const byKind = new Map(LIBRARY.flatMap((c) => c.items.map((t) => [t.kind, t] as const)));
export const libraryItem = (kind: string) => byKind.get(kind);
