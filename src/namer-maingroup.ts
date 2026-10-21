// Octet's IUPAC namer, part 3: heavier main-group elements and their ions (IUPAC 2013, P-6, P-7; IUPAC 2005, IR-6,
// IR-8). Clean room, from the published rules. namer.ts calls these at a few fixed points. Every name is still read
// back by OPSIN before the app shows it.
import type { Namer } from "./namer.ts";

// The stem of a chalcogen's acid names: sulfonate, selenonate, tellurinate.
export const chalcogenStem = (el: string) => ({ S: "sulf", Se: "selen", Te: "tellur" } as Record<string, string>)[el] ?? "sulf";

// The suffix of a selenonate, seleninate, telluronate or tellurinate anion (P-65.3.1, P-72.2.2.2), which namer.ts
// perceives as sulfonate or sulfinate groups on Se or Te: 2-aminoethane-1-selenonate. Undefined for S.
export function chalcogenIonSuffix(n: Namer, kind: string | undefined, sites: { group: number }[]): string | undefined {
  if ((kind !== "sulfonateion" && kind !== "sulfinate") || !sites.length) return undefined;
  const els = new Set(sites.map((s) => n.el[s.group]));
  if (els.has("S")) { if (els.size > 1) throw new Error("mixed chalcogen acids"); return undefined; }
  if (els.size > 1) throw new Error("mixed chalcogen acids");
  return `${chalcogenStem([...els][0])}${kind === "sulfinate" ? "inate" : "onate"}`;
}
