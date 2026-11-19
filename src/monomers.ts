// Monomers for sequences (issue 27): each one a structure written as SMILES with its links as HELM writes them, [*:1]
// on the N side (5' side), [*:2] on the C=O side (3' side) and [*:3] on a side chain. What takes a link's place when it
// is not linked (its cap) follows one rule: OH on an acyl carbon or a phosphorus, H anywhere else (the HELM library's
// caps for the natural amino acids, Asp's and Glu's side chains, the phosphate and the nucleosides). The natural amino
// acids, the HELM library's D set ([dA] to [dY], with no dG, dI or dT: "D" does not say whether Ile's and Thr's second
// centre is inverted), the ends [ac] and [am], the nucleosides and the phosphate are built in.
import { CODES, residueSmiles } from "./peptide.ts";
import { PHOSPHATE, unit } from "./nucleic.ts";

export type PolymerKind = "peptide" | "rna" | "dna";
// A monomer: its code (A, dF, ac, rA, P), the text of its residue label (Ala, D-Phe, Ac, rA, P), and its structure.
export type Monomer = { code: string; label: string; smiles: string };

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
// The monomer a code names in a chain of a kind.
export function monomer(kind: PolymerKind, code: string): Monomer | undefined {
  if (kind !== "peptide") {
    const m = NUCLEIC.get(code);
    return m && (code === "P" || (code[0] === "d") === (kind === "dna")) ? m : undefined;
  }
  return PEPTIDES.get(code);
}
// The one-letter code of a monomer's natural analogue, for FASTA: a natural or D amino acid's letter.
export const naturalLetter = (code: string) => (/^[A-Z]$/.test(code) && CODES[code] ? code : /^d[A-Z]$/.test(code) && D_CODES.includes(code[1]) ? code[1] : undefined);
// The monomer whose residue label reads text (Ala, D-Phe, rA, P).
export function byLabel(kind: PolymerKind | undefined, text: string): Monomer | undefined {
  for (const k of kind ? [kind] : (["peptide", "rna", "dna"] as const)) {
    const table = k === "peptide" ? PEPTIDES : NUCLEIC;
    for (const m of table.values()) if (m.label === text && monomer(k, m.code)) return m;
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
