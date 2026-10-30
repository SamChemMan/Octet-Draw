// Name to Structure for the Octet website: the app's own engine (OPSIN, Octet's tables, the dictionary, Indigo and
// the ACS 1996 renderer), built on its own by `npm run build:namedemo` into dist-namedemo for octet-site/n2s.
import { loadNames, nameToSmiles, nameToAtoms, suggestName, looksLikeSmiles, knownName } from "../src/names.ts";
import { casProblem, casValid, inchiKeyOf, peptideName } from "../src/dictionary.ts";
import { condensedSmiles } from "../src/condensed.ts";
import { COMMON, commonKey } from "../src/common.ts";
import { cipOf, expandLabels, measure, parseStructure, ready, smilesWeight, STYLE, toInchi } from "../src/chem.ts";
import { labelTurn, render, type Mol } from "../src/render.ts";
import { sandwich } from "../src/edit.ts";
import { checkedName, setNamer } from "../src/naming.ts";
import { iupacName } from "../src/namer.ts";

setNamer(iupacName);

export type Result = {
  kind: string; // how Octet read the text
  shown: string; // the text read: what was typed, or the name it was corrected to
  corrected: boolean;
  smiles: string;
  svg: string;
  formula?: string;
  weight?: number;
  name?: string; // Octet's own name for the structure, checked
};

let loading: Promise<void> | undefined;
export const load = () => (loading ??= Promise.all([ready, loadNames()]).then(() => undefined));

const commonKeys = new Map(Object.keys(COMMON).map((k) => [commonKey(k), k]));
const SALT = /\s(?:di)?hydro(?:chloride|bromide|iodide)$|\s(?:mesylate|besylate|tosylate|maleate|fumarate|citrate|(?:mono|di|tri)?hydrate)$|[·•∙⋅]\s*\d*\s*H2O$/i;
const MIXTURE = /[·•∙⋅]|\sand\s|\(\d+(?:\.\d+)?\s*[:/]\s*\d/i;

function kindOf(s: string): string {
  if (/^InChI=/.test(s)) return "InChI";
  if (looksLikeSmiles(s)) return "SMILES";
  if (inchiKeyOf(s)) return "InChIKey";
  if (casValid(s)) return "CAS number";
  const common = commonKeys.get(commonKey(s));
  if (common) return /^[a-z][a-z -]{5,}$/i.test(common) && /[a-z]{4}/.test(common) ? "Drug name" : "Abbreviation";
  if (/^[A-Z][a-z]{2}(-[A-Z][a-z]{2}|-D-[A-Z][a-z]{2})+(-OH|-NH2)?$|^(H|Ac)-/.test(s) && peptideName(s)) return "Peptide";
  if (condensedSmiles(s)) return "Condensed formula";
  if (SALT.test(s)) return "Salt or hydrate";
  if (MIXTURE.test(s)) return "Mixture";
  if (nameToAtoms(s)) return /\d|[[\](),]|\w-\w|\s/.test(s) ? "IUPAC name" : "Trivial name";
  return "Common or trade name";
}

// The structure as SVG, in the page's text colour: filled bond outlines and atom labels.
function svgOf(mol: Mol): string {
  const d = render(mol, STYLE, measure);
  const [x0, y0, x1, y1] = d.box, pad = 4;
  const path = d.polygons.map((p) => "M" + p.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z").join("");
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const labels = d.labels.map((l) => {
    const turn = labelTurn(l);
    // Presentation attributes, not a style attribute: the website's CSP allows no inline styles.
    const face = `font-family="${esc(l.font ?? "Arial, Helvetica, sans-serif").replace(/"/g, "'")}" font-size="${l.size}"${l.bold ? ' font-weight="bold"' : ""}${l.italic ? ' font-style="italic"' : ""}`;
    return `<text x="${l.x.toFixed(2)}" y="${l.y.toFixed(2)}"${turn ? ` transform="${turn}"` : ""} ${face}>${esc(l.text)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}" fill="currentColor" role="img"><path d="${path}"/>${labels}</svg>`;
}

const inchiOf = (s: Mol | string) => { try { return toInchi(typeof s === "string" ? parseStructure(s) : s); } catch { return undefined; } };

// The structure for text, or a reason it has none. Text is treated as hostile: it is length-capped here, and every
// reader below has its own limits.
export function lookup(text: string): Result | { problem: string; suggestion?: string } {
  const typed = text.trim().slice(0, 300);
  if (!typed) return { problem: "" };
  let shown = typed, corrected = false;
  let smiles = looksLikeSmiles(typed) ? typed : nameToSmiles(typed);
  if (!smiles) {
    const cas = casProblem(typed);
    if (cas) return { problem: cas };
    const near = suggestName(typed, true);
    if (near) { smiles = nameToSmiles(near); shown = near; corrected = true; }
  }
  if (!smiles) return { problem: "Octet can’t read that one yet." };
  let mol: Mol;
  try { mol = parseStructure(smiles); } catch (e) { return { problem: e instanceof RangeError ? "That structure is too large to draw here." : "Octet can’t draw that one here yet." }; }
  if (!mol.atoms.length) return { problem: "Octet can’t read that one yet." };
  const w = smilesWeight(smiles);
  let name: string | undefined;
  try { name = checkedName(mol, expandLabels(mol), nameToSmiles, inchiOf, cipOf, knownName); } catch { name = undefined; }
  return { kind: corrected ? "Spelling fixed" : kindOf(typed), shown, corrected, smiles, svg: svgOf(sandwich(mol)), formula: w?.formula, weight: w?.weight, name };
}
