// Search Reaxys and Search PubChem (decision 0008): the commands, and the structure the page gives the app to search.
import { toQueryMolfile, toSmiles } from "./chem.ts";
import type { Mol } from "./render.ts";

// Each search: the site, and whether it looks for the same structure. Search Reaxys looks for substructures, as
// ChemDraw's Search Reaxys does; Search PubChem for the same structure.
export const SEARCHES: Record<string, ["reaxys" | "pubchem", boolean]> = {
  search_reaxys: ["reaxys", false], search_reaxys_exact: ["reaxys", true], search_pubchem: ["pubchem", true], search_pubchem_sub: ["pubchem", false],
};

// A molfile when the structure has generic labels (a query: always a substructure search). Otherwise SMILES,
// without the CXSMILES part after a space, which the sites do not read.
export function searchQuery(part: Mol): { smiles?: string; molfile?: string } {
  const molfile = toQueryMolfile(part);
  return molfile ? { molfile } : { smiles: toSmiles(part).split(/\s/)[0] };
}
