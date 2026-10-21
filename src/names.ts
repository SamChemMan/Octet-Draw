// Name to structure, offline: OPSIN compiled to JavaScript (see tools/opsin). It loads in the background
// soon after start-up, so the first conversion is instant; until then nameToSmiles returns undefined.
import { COMMON, commonKey } from "./common.ts";

type Opsin = typeof import("./vendor/opsin/opsin.js");
let opsin: Opsin | undefined;
let names: string[] = []; // whole names OPSIN reads, sorted (see tools/opsin/names.mjs)
let index: Record<string, string> = {}; // names from Octet's own tables by standard InChI (see tools/names/index.mjs)
let loading: Promise<void> | undefined;

export function loadNames(): Promise<void> {
  loading ??= (async () => {
    // The drug names and the index load with the engine, so start-up does not wait for them.
    const [mod, { default: pack }, { default: list }, { default: known }, { DRUGS }] = await Promise.all([import("./vendor/opsin/opsin.js"),
      import("./vendor/opsin/opsin-data.bin?url"), import("./vendor/opsin/names.txt?url"), import("./nameindex.json"), import("./drugs.ts")]);
    const [data, words] = await Promise.all([fetch(pack).then((r) => r.arrayBuffer()), fetch(list).then((r) => r.text())]);
    // The pack: [name length (u16), name (latin1), size (i32), bytes] repeated, ending with a zero length.
    const view = new DataView(data), files = new Map<string, Int8Array>(), latin1 = new TextDecoder("latin1");
    for (let p = 0; ; ) {
      const n = view.getUint16(p); p += 2;
      if (!n) break;
      const name = latin1.decode(new Uint8Array(data, p, n)); p += n;
      const size = view.getInt32(p); p += 4;
      files.set(name, new Int8Array(data, p, size)); p += size;
    }
    (globalThis as { opsinResource?: (name: string) => Int8Array | null }).opsinResource = (name) => files.get(name) ?? null;
    mod.init();
    attachOpsin(mod, words, known, DRUGS);
  })();
  return loading;
}

// OPSIN, once its data is in place, the list of names it reads (one a line) and the index of Octet's own names. The
// checks call this directly.
export function attachOpsin(mod: Opsin, words: string, known: Record<string, string> = {}, drugs: Record<string, string> = {}) {
  index = known;
  for (const [k, v] of Object.entries(drugs)) common.set(commonKey(k), `smiles:${v.startsWith("=") ? drugs[v.slice(1)] : v}`);
  // Long common names (methylene blue, Eosin Y) and drug names join the list for completion; abbreviations match exactly only.
  const own = [...Object.keys(COMMON).filter((k) => k.length >= 7), ...Object.keys(drugs).filter((k) => k.length >= 5)];
  names = [...words.split("\n").filter(Boolean), ...own.map((k) => k.toLowerCase())].sort();
  opsin = mod;
}

// A name from Octet's own tables for a structure, by its standard InChI: for Structure to Name when Octet's namer has
// no name (morphine, DBU, imatinib).
export const knownName = (inchi: string): string | undefined => index[inchi];

// Octet's own names (common.ts, and drugs.ts once the engine loads), by key. Drug names map to SMILES.
const common = new Map(Object.entries(COMMON).map(([k, v]) => [commonKey(k), v.startsWith("=") ? COMMON[v.slice(1)] : v]));
function read(name: string): string | undefined {
  try {
    return opsin!.parseToSmiles(name) ?? undefined;
  } catch {
    return undefined;
  }
}
// OPSIN's structure for a name with each atom's locants (JSON), for the κ checks in complexes.ts.
export function nameToAtoms(name: string): string | undefined {
  if (!opsin || name.length > 1000) return undefined;
  try {
    return opsin.parseToAtoms(name) ?? undefined;
  } catch {
    return undefined;
  }
}

// SMILES for a chemical name, or undefined if Octet cannot read it (or OPSIN has not loaded yet). Reads Octet's own
// names first (THF, K2CO3, drug names), then the name as OPSIN reads it, then the name tidied of catalogue quirks.
// A name that does not read whole can be read in parts: a salt of a name Octet has ("sertraline hydrochloride"), an
// adduct or hydrate ("Et3N·HCl", "CuSO4·5H2O"), or a mixture ("ethanol and water (2:1)").
export function nameToSmiles(name: string): string | undefined {
  const s = name.trim();
  if (!opsin || !s || s.length > 1000) return undefined;
  return one(s) ?? salt(s) ?? parts(s);
}

function one(s: string): string | undefined {
  const known = common.get(commonKey(s));
  if (known) return known.startsWith("smiles:") ? known.slice(7) : read(known);
  const tidied = tidy(s);
  return read(s) ?? (tidied !== s ? read(tidied) : undefined);
}

// Acid addition salts and hydrates of a name, as the name and the acid (or water) side by side, as PubChem draws them.
const SALTS: Record<string, string> = {
  hydrochloride: "Cl", dihydrochloride: "Cl.Cl", hydrobromide: "Br", hydroiodide: "I", mesylate: "CS(=O)(=O)O",
  besylate: "OS(=O)(=O)c1ccccc1", tosylate: "Cc1ccc(cc1)S(=O)(=O)O", maleate: "OC(=O)/C=C\\C(=O)O", fumarate: "OC(=O)/C=C/C(=O)O",
  citrate: "OC(=O)CC(O)(CC(=O)O)C(=O)O", hydrate: "O", monohydrate: "O", dihydrate: "O.O", trihydrate: "O.O.O",
};
function salt(s: string): string | undefined {
  const m = /^(.+?)\s+([a-z]+)$/i.exec(s), acid = m && SALTS[m[2].toLowerCase()];
  const base = acid ? one(m![1]) : undefined;
  return base && `${base}.${acid}`;
}

// A name made of parts that each read: an adduct or hydrate (·, • or a full stop between parts, with a count before a
// part: "CuSO4·5H2O") or a mixture ("A and B", "A/B", "A + B", "A–B", ChemDraw's "A--B"), with or without a ratio
// ("2:1", "(0.72/0.28)") and "a ... mixture of". A ratio of whole numbers draws each part that many times, as OPSIN
// does for "ethanol water (2:1)"; any other ratio draws each part once.
function parts(s: string): string | undefined {
  const RATIO = /(^|\s)\(?(\d+(?:\.\d+)?(?:\s*[:/]\s*\d+(?:\.\d+)?)+)\)?(?=\s|$)/;
  const ratio = RATIO.exec(s)?.[2].split(/\s*[:/]\s*/).map(Number);
  const bare = s.replace(/^an?\s+/i, "").replace(RATIO, " ").replace(/\bmixture(?:\s+of)?\b/gi, " ").trim();
  const pieces = bare.split(/\s*(?:[·•∙⋅]|\.(?![^[\]]*\])|--|[–—]|\s\+\s|\s&\s|\sand\s|\/)\s*/i);
  if (pieces.length < 2 || pieces.length > 8) return undefined;
  const times = ratio?.length === pieces.length && ratio.every((n) => Number.isInteger(n) && n >= 1 && n <= 12) ? ratio : undefined;
  const out: string[] = [];
  for (const [i, piece] of pieces.entries()) {
    const whole = one(piece), counted = whole ? undefined : /^(\d{1,2})\s*(\D.*)$/.exec(piece), smiles = whole ?? (counted ? one(counted[2]) : undefined);
    if (!smiles) return undefined;
    out.push(...Array<string>((counted ? Math.min(Number(counted[1]), 12) : 1) * (times?.[i] ?? 1)).fill(smiles));
  }
  return out.join(".");
}

// Text that is SMILES (or InChI) by its look: SMILES atoms in brackets or from the organic subset, bonds, branches and
// ring numbers, in one word (a CXSMILES |...| part may follow). A title may follow the SMILES, as in a SMILES file
// ("c1ccccc1 benzene"), when the SMILES has a ring number, a bracket, a branch or a bond: a word alone ("CCO
// ethanol", "NBS reagent") could be a name. It has an atom: Indigo reads "5" or "2:1" as an unknown atom. Indigo also
// reads words such as "aspirin" or "spiro" (as query atoms), so text that fails this is never read as SMILES. An
// aromatic atom (lower case) is in a ring, so SMILES with one has a ring number: "Boc", "Bn", "Cs" and "Co" are not SMILES.
const SMILES = /^(?:Cl|Br|[BCNOPSFI]|[bcnops]|\[[^\][]{1,40}\]|%\d\d|[-=#$:/\\.()0-9*~>])+$/;
const smiles = (s: string) => {
  const bare = s.replace(/\[[^\]]*\]/g, "");
  return SMILES.test(s) && /[A-Za-z]/.test(s) && (!/[bcnops]/.test(bare) || /\d/.test(bare));
};
export function looksLikeSmiles(text: string): boolean {
  const t = text.trim().replace(/\s+\|[^|]*\|$/, ""), first = t.split(/\s/)[0];
  return /^InChI=1S?\//.test(t) || smiles(t) || (first !== t && smiles(first) && /[\d()[\]=#/\\]/.test(first));
}

// Catalogue and supplier quirks: brackets round a plain multiplied group ("10,15,20-(triphenyl)porphyrin"),
// "meso-tetra…porphyrin" for the 5,10,15,20 positions, and stray spaces or a full stop.
function tidy(s: string): string {
  return s
    .replace(/(\d[\d,']*-)\(([a-z]{4,})\)(?=[a-z])/gi, (all, locants: string, inner: string) => (/^[ivx]+$/i.test(inner) ? all : locants + inner))
    .replace(/\bmeso-(tetra(?:kis)?)(?=.*porphyrin)/i, "5,10,15,20-$1")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "");
}

// A name close to what was typed, for when it is not a name OPSIN reads: the rest of a common name being
// typed ("phenylal" to phenylalanine), a common name spelt with up to a few mistakes ("phenylanaline"), or
// any name one keystroke away ("2-methlypropan-1-ol"). Every suggestion is one OPSIN reads.
// thorough: also try every name one keystroke away (30 to 90 ms), not just the list of common names.
export function suggestName(typed: string, thorough = true): string | undefined {
  const s = typed.trim(), lower = s.toLowerCase();
  if (!opsin || s.length < 3 || s.length > 80 || nameToSmiles(s)) return undefined;
  // The rest of a common name: the shortest one that starts with what was typed.
  let lo = 0, hi = names.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (names[mid] < lower) lo = mid + 1; else hi = mid; }
  let completion: string | undefined;
  for (let i = lo; i < names.length && names[i].startsWith(lower); i++) if (!completion || names[i].length < completion.length) completion = names[i];
  if (completion && lower.length >= 4) return completion;
  // A common name with a few mistakes: one for short names, up to three for long ones.
  const limit = lower.length <= 5 ? 1 : lower.length <= 12 ? 2 : 3;
  let best: string | undefined, bestDistance = limit + 1;
  for (const name of names) {
    if (Math.abs(name.length - lower.length) >= bestDistance) continue;
    const d = distance(lower, name, bestDistance);
    if (d < bestDistance) [best, bestDistance] = [name, d];
  }
  // A common name within two mistakes beats an uncommon name one keystroke away ("phenylanaline" is
  // phenylalanine, not phenylaniline).
  if (best && bestDistance <= 2) return best;
  if (!thorough) return undefined;
  // Any name one keystroke away. Swapped letters are the most common slip, then a wrong, missing or extra letter.
  return oneAway(s) ?? best;
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
function oneAway(s: string): string | undefined {
  const tries: string[] = [];
  for (let i = 0; i + 1 < s.length; i++) tries.push(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
  for (let i = 0; i < s.length; i++) for (const c of LETTERS) if (c !== s[i]) tries.push(s.slice(0, i) + c + s.slice(i + 1));
  for (let i = 0; i < s.length; i++) tries.push(s.slice(0, i) + s.slice(i + 1));
  for (let i = 0; i <= s.length; i++) for (const c of LETTERS) tries.push(s.slice(0, i) + c + s.slice(i));
  return tries.find((t) => nameToSmiles(t));
}

// Edit distance with swaps of neighbouring letters (optimal string alignment). Stops early past max.
function distance(a: string, b: string, max: number): number {
  let prev2: number[] = [], prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let least = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      least = Math.min(least, d);
    }
    if (least >= max) return max;
    [prev2, prev] = [prev, row];
  }
  return prev[b.length];
}
