// Monomers for sequences (issue 27): each one a structure written as SMILES with its links as HELM writes them, [*:1]
// on the N side (5' side), [*:2] on the C=O side (3' side) and [*:3] on a side chain. What takes a link's place when it
// is not linked (its cap) follows one rule: OH on an acyl carbon or a phosphorus, H anywhere else (the HELM library's
// caps for the natural amino acids, Asp's and Glu's side chains, the phosphate and the nucleosides). The natural amino
// acids, the HELM library's D set ([dA] to [dY], with no dG, dI or dT: "D" does not say whether Ile's and Thr's second
// centre is inverted), the ends [ac] and [am], the nucleosides and the phosphate are built in. The user's own peptide
// monomers (Structure > Define Monomer…) and a document's copies of them come after.
import { CODES, residueSmiles } from "./peptide.ts";
import { PHOSPHATE, unit } from "./nucleic.ts";

export type PolymerKind = "peptide" | "rna" | "dna";
// A monomer: its code (A, dF, ac, rA, P, or the user's), the text of its residue label (Ala, D-Phe, Ac, rA, P, or the
// code), and its structure.
export type Monomer = { code: string; label: string; smiles: string };
// A monomer the user defined: its code, an optional name, and its structure with [*:1], [*:2] and maybe [*:3].
export type OwnMonomer = { code: string; name?: string; smiles: string };
// The monomers a code may name besides Octet's: a document's copies first, then the user's.
export type Own = readonly OwnMonomer[];

// Each amino acid's side chain from its α carbon, with its R3 where HELM has one: Cys S, Lys Nζ, the side chain C=O of
// Asp and Glu (its OH leaves), and the HELM library's second forms: Ser, Thr and Tyr O, Asn and Gln N, His and Trp N–H,
// Arg's last N.
const SIDES: Record<string, string> = {
  A: "C", R: "CCCNC(=N)N[*:3]", N: "CC(N[*:3])=O", D: "CC(=O)[*:3]", C: "CS[*:3]", Q: "CCC(N[*:3])=O", E: "CCC(=O)[*:3]",
  H: "CC1=CN([*:3])C=N1", I: "[C@@H](C)CC", L: "CC(C)C", K: "CCCCN[*:3]", M: "CCSC", F: "CC1=CC=CC=C1", S: "CO[*:3]",
  T: "[C@@H](C)O[*:3]", W: "CC1=CN([*:3])C2=CC=CC=C12", Y: "CC1=CC=C(O[*:3])C=C1", V: "C(C)C",
};
// The D set: the natural codes less G, I and T.
export const D_CODES = [..."ACDEFHKLMNPQRSVWY"];
const amino = (k: string, d: boolean) => {
  if (k === "G") return "[*:1]NCC(=O)[*:2]";
  if (k === "P") return `[*:1]N1CCC[C${d ? "@@" : "@"}H]1C(=O)[*:2]`;
  return `[*:1]N[C${d ? "@" : "@@"}H](${SIDES[k]})C(=O)[*:2]`;
};
const PEPTIDES = new Map<string, Monomer>([
  ...Object.keys(CODES).map((k): [string, Monomer] => [k, { code: k, label: CODES[k], smiles: amino(k, false) }]),
  ...D_CODES.map((k): [string, Monomer] => [`d${k}`, { code: `d${k}`, label: `D-${CODES[k]}`, smiles: amino(k, true) }]),
  ["ac", { code: "ac", label: "Ac", smiles: "CC(=O)[*:2]" }],
  ["am", { code: "am", label: "NH2", smiles: "N[*:1]" }],
]);
const NUCLEIC = new Map<string, Monomer>([
  ...[..."ACGU"].map((b): [string, Monomer] => [`r${b}`, { code: `r${b}`, label: `r${b}`, smiles: `[*:1]${unit(b, false)}[*:2]` }]),
  ...[..."ACGT"].map((b): [string, Monomer] => [`d${b}`, { code: `d${b}`, label: `d${b}`, smiles: `[*:1]${unit(b, true)}[*:2]` }]),
  ["P", { code: "P", label: "P", smiles: `[*:1]${PHOSPHATE}[*:2]` }],
]);
// The monomer a code names in a chain of a kind: Octet's own first, then own (a document's before the user's), so a
// code of Octet's means the same in every drawing.
export function monomer(kind: PolymerKind, code: string, own: Own = []): Monomer | undefined {
  if (kind !== "peptide") {
    const m = NUCLEIC.get(code);
    return m && (code === "P" || (code[0] === "d") === (kind === "dna")) ? m : undefined;
  }
  const m = PEPTIDES.get(code);
  if (m) return m;
  const o = own.find((x) => x.code === code);
  return o ? { code: o.code, label: o.code, smiles: o.smiles } : undefined;
}
// The one-letter code of a monomer's natural analogue, for FASTA: a natural or D amino acid's letter.
export const naturalLetter = (code: string) => (/^[A-Z]$/.test(code) && CODES[code] ? code : /^d[A-Z]$/.test(code) && D_CODES.includes(code[1]) ? code[1] : undefined);
// The monomer whose residue label reads text (Ala, D-Phe, rA, P, or one of own's codes).
export function byLabel(kind: PolymerKind | undefined, text: string, own: Own = []): Monomer | undefined {
  for (const k of kind ? [kind] : (["peptide", "rna", "dna"] as const)) {
    const table = k === "peptide" ? PEPTIDES : NUCLEIC;
    for (const m of table.values()) if (m.label === text && monomer(k, m.code)) return m;
    if (k === "peptide") { const o = own.find((x) => x.code === text); if (o) return monomer(k, o.code, own); }
  }
  return undefined;
}
export const peptideMonomers = () => [...PEPTIDES.values()];
export const nucleicMonomers = () => [...NUCLEIC.values()];
// The SMILES of an amino acid residue as 1.1.2 wrote it (peptide.ts), for the codes it reads.
export { residueSmiles };

// ——— Reading a monomer's SMILES ———
// Its atoms in SMILES order (bracket atoms and the organic subset), and for each [*:n] its place among them. Ring
// closures, bonds and branches are not atoms. Linear in the length.
// stereo: the atoms the SMILES gives a hand (@ or @@).
export function smilesLinks(smiles: string): { atoms: number; r: (number | undefined)[]; stereo: number[] } | undefined {
  const r: (number | undefined)[] = [undefined, undefined, undefined, undefined], stereo: number[] = [];
  let atoms = 0;
  for (let k = 0; k < smiles.length; k++) {
    const ch = smiles[k];
    if (ch === "[") {
      const end = smiles.indexOf("]", k);
      if (end < 0) return undefined;
      const m = /^\*:([1-3])$/.exec(smiles.slice(k + 1, end));
      if (m) { if (r[+m[1]] !== undefined) return undefined; r[+m[1]] = atoms; }
      else if (smiles.slice(k + 1, end).startsWith("*")) return undefined;
      if (smiles.slice(k + 1, end).includes("@")) stereo.push(atoms);
      atoms++;
      k = end;
    } else if ((ch === "B" || ch === "C") && (smiles[k + 1] === "r" || smiles[k + 1] === "l")) { atoms++; k++; }
    else if ("BCNOPSFIbcnops*".includes(ch)) { if (ch === "*") return undefined; atoms++; }
  }
  return { atoms, r, stereo };
}

// ——— The user's monomers (J10) ———
export const MOST_OWN_MONOMERS = 500, CODE_MOST = 12, OWN_ATOMS = 256, OWN_SMILES = 2000;
// Why a code cannot name a new monomer, or undefined when it can: 1 to 12 letters, digits or _ ("-" is an end in a
// sequence's words), and no code or residue label of Octet's own in any case (Ala, D-Phe, NH2, rA, P), so a label never
// means two things.
export function codeProblem(code: string): string | undefined {
  if (!code) return "Type a code.";
  if (code.length > CODE_MOST || !/^[A-Za-z0-9_]+$/.test(code)) return `A code has 1 to ${CODE_MOST} letters, digits or _.`;
  const low = code.toLowerCase(), taken = (m: Monomer) => m.code.toLowerCase() === low || m.label.toLowerCase() === low;
  if ([...PEPTIDES.values(), ...NUCLEIC.values()].some(taken) || ["h", "oh"].includes(low) || /^d?[a-z]$/.test(low)) return `[${code}] is one of Octet's own monomers.`;
  return undefined;
}
// A user's monomer list with one added or replaced (by code), up to the limit.
export function withMonomer(list: Own, m: OwnMonomer): OwnMonomer[] {
  return [...list.filter((x) => x.code !== m.code), m].slice(-MOST_OWN_MONOMERS);
}
// Whether a monomer's SMILES will not do, by its form only (seqbuild.ts checks it is an α-amino acid when it is used).
function smilesProblem(smiles: string): boolean {
  if (smiles.length > OWN_SMILES || /\s|\./.test(smiles)) return true;
  const links = smilesLinks(smiles);
  return !links || links.atoms > OWN_ATOMS || links.r[1] === undefined || links.r[2] === undefined;
}
// A list of monomers read from a file or settings: each a code and SMILES of the right form, up to the limit. Anything
// else is left out, so no file brings a monomer Octet could not define.
export function readMonomers(x: unknown): OwnMonomer[] {
  if (!Array.isArray(x)) return [];
  const out: OwnMonomer[] = [], seen = new Set<string>();
  for (const m of x.slice(0, MOST_OWN_MONOMERS)) {
    if (!m || typeof m !== "object") continue;
    const { code, name, smiles } = m as Record<string, unknown>;
    if (typeof code !== "string" || typeof smiles !== "string" || codeProblem(code) || seen.has(code) || smilesProblem(smiles)) continue;
    seen.add(code);
    out.push({ code, smiles, ...(typeof name === "string" && name.trim() ? { name: name.trim().slice(0, 80) } : {}) });
  }
  return out;
}
// A residue's elements as one key ("C6N1S1": each element's count but O and H, which a link's cap may add, and H only
// when it is an isotope), from a monomer's SMILES (its R atoms left out) or from drawn atoms (elementKey). Contract Label
// and Copy As HELM try only the monomers whose key is the residue's, so a long list costs no time.
export function smilesKey(smiles: string): string {
  const count = new Map<string, number>(), add = (el: string) => count.set(el, (count.get(el) ?? 0) + 1);
  for (let k = 0; k < smiles.length; k++) {
    const ch = smiles[k];
    if (ch === "[") {
      const end = smiles.indexOf("]", k), inside = smiles.slice(k + 1, end < 0 ? smiles.length : end);
      const m = /^(\d*)(se|as|te|[A-Z][a-z]?|[bcnops*])/.exec(inside);
      if (m && m[2] !== "*" && m[2] !== "o" && m[2] !== "O" && (m[2] !== "H" || m[1])) add(m[2][0].toUpperCase() + m[2].slice(1));
      k = end < 0 ? smiles.length : end;
    } else if ((ch === "B" || ch === "C") && (smiles[k + 1] === "r" || smiles[k + 1] === "l")) { add(ch + smiles[k + 1]); k++; }
    else if ("BCNPSFIbcnps".includes(ch)) add(ch.toUpperCase());
  }
  return [...count].sort((p, q) => (p[0] < q[0] ? -1 : 1)).map(([el, n]) => `${el}${n}`).join("");
}
export function elementKey(atoms: readonly { label: string; isotope?: number }[]): string {
  const count = new Map<string, number>();
  for (const a of atoms) if (a.label !== "O" && (a.label !== "H" || a.isotope)) count.set(a.label, (count.get(a.label) ?? 0) + 1);
  return [...count].sort((p, q) => (p[0] < q[0] ? -1 : 1)).map(([el, n]) => `${el}${n}`).join("");
}

// ——— HELM monomer library files ———
// Settings > Dictionary > Monomers: Export… writes the user's monomers as a HELM monomer library (JSON: a list of
// monomers, each with its symbol, name, SMILES with [*:1] to [*:3], polymer type PEPTIDE, monomer type Backbone, and a cap
// for each R); Import… reads one. A library's SMILES may also mark its R atoms as [*] or * with ChemAxon's labels after
// it ("C[C@H](N[*])C([*])=O |$;;;_R1;;_R2;$|"). Only peptide backbone monomers that Octet can define come in.
const MOST_LIBRARY = 4_000_000;
// (seqbuild.ts helmLibrary writes one.)
// The monomers in a HELM monomer library file, or why there are none.
export function readHelmLibrary(text: string): { monomers: OwnMonomer[]; left: number } | { problem: string } {
  if (text.length > MOST_LIBRARY) return { problem: "Octet reads monomer libraries of up to 4 MB." };
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { problem: "This file is not a HELM monomer library." }; }
  // A list, or an object holding one (some libraries put it under "monomers").
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { monomers?: unknown }).monomers) ? (data as { monomers: unknown[] }).monomers : undefined;
  if (!list) return { problem: "This file is not a HELM monomer library." };
  const out: OwnMonomer[] = [], seen = new Set<string>();
  let left = 0;
  for (const x of list.slice(0, 20_000)) {
    const m = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const code = typeof m.symbol === "string" ? m.symbol.trim() : "", raw = typeof m.smiles === "string" ? m.smiles.trim() : "";
    const smiles = raw && (m.polymerType ?? "PEPTIDE") === "PEPTIDE" ? numbered(raw) : undefined;
    if (!smiles || codeProblem(code) || seen.has(code) || smilesProblem(smiles) || out.length >= MOST_OWN_MONOMERS) { left++; continue; }
    seen.add(code);
    out.push({ code, smiles, ...(typeof m.name === "string" && m.name.trim() && m.name.trim() !== code ? { name: m.name.trim().slice(0, 80) } : {}) });
  }
  return { monomers: out, left };
}
// A library SMILES with its R atoms as [*:1] to [*:3]: as it is when it has them; else each [*] or * named by its
// ChemAxon label (_R1 to _R3) in the "|$…$|" list after the SMILES, one label for each atom in order. Undefined when an R
// atom has no such label.
function numbered(smiles: string): string | undefined {
  const bar = smiles.indexOf(" |");
  if (bar < 0) return smiles.includes("[*:") ? smiles : undefined;
  const body = smiles.slice(0, bar), labels = /\$([^$]*)\$/.exec(smiles.slice(bar))?.[1].split(";");
  if (!labels || body.includes("[*:") || body.length > OWN_SMILES) return undefined;
  let atom = 0, out = "";
  for (let k = 0; k < body.length; k++) {
    const ch = body[k];
    if (ch === "[") {
      const end = body.indexOf("]", k);
      if (end < 0) return undefined;
      const inside = body.slice(k + 1, end), r = /^_R([1-3])$/.exec(labels[atom] ?? "");
      if (inside === "*") { if (!r) return undefined; out += `[*:${r[1]}]`; } else out += body.slice(k, end + 1);
      atom++; k = end; continue;
    }
    if (ch === "*") { const r = /^_R([1-3])$/.exec(labels[atom] ?? ""); if (!r) return undefined; out += `[*:${r[1]}]`; atom++; continue; }
    if ((ch === "B" || ch === "C") && (body[k + 1] === "r" || body[k + 1] === "l")) { out += ch + body[k + 1]; atom++; k++; continue; }
    if ("BCNOPSFIbcnops".includes(ch)) atom++;
    out += ch;
  }
  return out;
}
