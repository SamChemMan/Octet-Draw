// Monomers for sequences (issue 27): each one a structure written as SMILES with its links as HELM writes them, [*:1]
// on the N side (5' side), [*:2] on the C=O side (3' side) and [*:3] on a side chain. What takes a link's place when it
// is not linked (its cap) follows one rule: OH on an acyl carbon or a phosphorus, H anywhere else (the HELM library's
// caps for the natural amino acids, Asp's and Glu's side chains, the phosphate and the nucleosides). The natural amino
// acids, the HELM library's D set ([dA] to [dY], with no dG, dI or dT: "D" does not say whether Ile's and Thr's second
// centre is inverted), the ends [ac] and [am], the nucleosides and the phosphate are built in. The user's own peptide
// monomers (Structure > Define Monomer…) and a document's copies of them come after.
import { CODES, residueSmiles } from "./peptide.ts";
import { NUCLEOBASES, nucleoside, PHOSPHATE, SUGARS, THIOPHOSPHATE } from "./nucleic.ts";

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
// Common non-natural α-amino acids, each L, by their IUPAC codes, which the HELM library uses too: its structure
// (an α-amino acid, a side chain's link where the library has one) and its natural analogue's letter for FASTA.
const aa = (side: string) => `[*:1]N[C@@H](${side})C(=O)[*:2]`;
const EXTRA: Record<string, [smiles: string, analogue?: string]> = {
  Abu: [aa("CC")], Aib: ["[*:1]NC(C)(C)C(=O)[*:2]"], Cha: [aa("CC1CCCCC1"), "A"], Cit: [aa("CCCNC(N)=O")], Dab: [aa("CCN[*:3]")],
  Hcy: [aa("CCS[*:3]"), "C"], Hse: [aa("CCO"), "S"], Hyp: ["[*:1]N1C[C@H](O)C[C@H]1C(=O)[*:2]", "P"], Nle: [aa("CCCC"), "L"], Nva: [aa("CCC"), "V"],
  Orn: [aa("CCCN[*:3]"), "K"], Pen: [aa("C(C)(C)S[*:3]"), "V"], Phg: [aa("C1=CC=CC=C1"), "G"], Sar: ["[*:1]N(C)CC(=O)[*:2]", "G"],
};
// A peptide's ends beyond H- and -OH: the word typed in the Sequence field (Boc-, -OMe), the HELM code, the residue
// label and the structure. An N-terminal end has only R2, a C-terminal end only R1. Z is Cbz typed another way. Biotin
// has no HELM library code, so HELM writes it as its SMILES (inline) and other programs read it.
export type PeptideEnd = { word: string; code: string; label: string; smiles: string; inline?: true };
export const N_ENDS: PeptideEnd[] = [
  { word: "Ac", code: "ac", label: "Ac", smiles: "CC(=O)[*:2]" },
  { word: "Boc", code: "Boc", label: "Boc", smiles: "CC(C)(C)OC(=O)[*:2]" },
  { word: "Cbz", code: "Cbz", label: "Cbz", smiles: "O=C([*:2])OCC1=CC=CC=C1" },
  { word: "Fmoc", code: "fmoc", label: "Fmoc", smiles: "O=C([*:2])OCC1C2=CC=CC=C2C2=CC=CC=C12" },
  { word: "Bz", code: "Bz", label: "Bz", smiles: "O=C([*:2])C1=CC=CC=C1" },
  { word: "Biotin", code: "Biotin", label: "Biotin", smiles: "C1[C@H]2[C@@H]([C@@H](S1)CCCCC(=O)[*:2])NC(=O)N2", inline: true },
];
export const C_ENDS: PeptideEnd[] = [
  { word: "NH2", code: "am", label: "NH2", smiles: "N[*:1]" },
  { word: "OMe", code: "-OMe", label: "OMe", smiles: "CO[*:1]" },
  { word: "OtBu", code: "OtBu", label: "OtBu", smiles: "CC(C)(C)O[*:1]" },
  { word: "OBn", code: "-OBn", label: "OBn", smiles: "[*:1]OCC1=CC=CC=C1" },
  { word: "NHMe", code: "NHMe", label: "NHMe", smiles: "CN[*:1]" },
  { word: "NHEt", code: "NHEt", label: "NHEt", smiles: "CCN[*:1]" },
];
// The end a word names (either case; Z for Cbz), or undefined.
export const endOfWord = (ends: PeptideEnd[], word: string) => (word.toLowerCase() === "z" ? ends.find((e) => e.code === "Cbz") : ends.find((e) => e.word.toLowerCase() === word.toLowerCase()));
// Whether a code is a peptide's N-terminal or C-terminal end.
export const isNEnd = (code: string | undefined) => N_ENDS.some((e) => e.code === code);
export const isCEnd = (code: string | undefined) => C_ENDS.some((e) => e.code === code);
export const isEnd = (code: string | undefined) => isNEnd(code) || isCEnd(code);
export const endMonomers = (side: "N" | "C") => (side === "N" ? N_ENDS : C_ENDS);
const PEPTIDES = new Map<string, Monomer>([
  ...Object.keys(CODES).map((k): [string, Monomer] => [k, { code: k, label: CODES[k], smiles: amino(k, false) }]),
  ...D_CODES.map((k): [string, Monomer] => [`d${k}`, { code: `d${k}`, label: `D-${CODES[k]}`, smiles: amino(k, true) }]),
  ...Object.entries(EXTRA).map(([k, [smiles]]): [string, Monomer] => [k, { code: k, label: k, smiles }]),
  ...[...N_ENDS, ...C_ENDS].map((e): [string, Monomer] => [e.code, { code: e.code, label: e.label, smiles: e.smiles }]),
]);
// Octet's own non-natural amino acids (Aib, Nle, …), for the field's [code] and Contract Label.
export const extraCodes = () => Object.keys(EXTRA);
// A nucleotide's code from its sugar and base: rA and dA for the natural ones, else the HELM library's sugar and base
// (mR(A), LR(5meC), dR(5meC)). Ribothymidine and deoxyuridine are not drawn (no code). Its residue label: the sugar's
// letter before the base, as rA and dA (m 2'-O-methyl, f 2'-fluoro, moe 2'-O-methoxyethyl, L LNA), 5mC for
// 5-methylcytosine (mA, LT, d5mC).
export function nucleotideCode(sugar: string, base: string): string | undefined {
  if (!(SUGARS as readonly string[]).includes(sugar) || !(NUCLEOBASES as readonly string[]).includes(base) || (sugar === "R" && base === "T") || (sugar === "dR" && base === "U")) return undefined;
  if ((sugar === "R" || sugar === "dR") && base.length === 1) return `${sugar === "R" ? "r" : "d"}${base}`;
  return `${sugar}(${base})`;
}
export function nucleotideParts(code: string): { sugar: string; base: string } | undefined {
  const n = /^([rd])([ACGTU])$/.exec(code);
  if (n) return { sugar: n[1] === "r" ? "R" : "dR", base: n[2] };
  const m = /^(R|dR|mR|fR|MOE|LR)\((A|C|G|T|U|5meC)\)$/.exec(code);
  return m ? { sugar: m[1], base: m[2] } : undefined;
}
const SUGAR_LABEL: Record<string, string> = { R: "r", dR: "d", mR: "m", fR: "f", MOE: "moe", LR: "L" };
// A nucleotide's base as FASTA writes it: its natural analogue (5-methylcytosine C).
export const baseLetter = (code: string) => { const b = nucleotideParts(code)?.base; return b === "5meC" ? "C" : b; };
const NUCLEIC = new Map<string, Monomer>([
  ...SUGARS.flatMap((sugar) => NUCLEOBASES.flatMap((base): [string, Monomer][] => {
    const code = nucleotideCode(sugar, base);
    return code ? [[code, { code, label: `${SUGAR_LABEL[sugar]}${base === "5meC" ? "5mC" : base}`, smiles: `[*:1]${nucleoside(sugar, base)}[*:2]` }]] : [];
  })),
  ["P", { code: "P", label: "P", smiles: `[*:1]${PHOSPHATE}[*:2]` }],
  ["sP", { code: "sP", label: "sP", smiles: `[*:1]${THIOPHOSPHATE}[*:2]` }],
]);
// Whether a code is a phosphate or a phosphorothioate (a link between nucleotides).
export const isLinker = (code: string | undefined) => code === "P" || code === "sP";
// The modified nucleotides and the phosphorothioate, for reading a drawn chain (the natural ones are sequence.ts's).
export const modifiedNucleic = () => [...NUCLEIC.values()].filter((m) => !/^([rd][ACGTU]|P)$/.test(m.code));
// The monomer a code names in a chain of a kind: Octet's own first, then own (a document's before the user's), so a
// code of Octet's means the same in every drawing.
export function monomer(kind: PolymerKind, code: string, own: Own = []): Monomer | undefined {
  if (kind !== "peptide") {
    // Ribose only in RNA and 2-deoxyribose only in DNA; the modified sugars in either.
    const m = NUCLEIC.get(code), sugar = nucleotideParts(code)?.sugar;
    return m && (isLinker(code) || (sugar !== "R" && sugar !== "dR") || (sugar === "dR") === (kind === "dna")) ? m : undefined;
  }
  const m = PEPTIDES.get(code);
  if (m) return m;
  const o = own.find((x) => x.code === code);
  return o ? { code: o.code, label: o.code, smiles: o.smiles } : undefined;
}
// The one-letter code of a monomer's natural analogue, for FASTA: a natural or D amino acid's letter, or the one the HELM
// library gives a non-natural amino acid (Nle L, Orn K).
export const naturalLetter = (code: string) => (/^[A-Z]$/.test(code) && CODES[code] ? code : /^d[A-Z]$/.test(code) && D_CODES.includes(code[1]) ? code[1] : EXTRA[code]?.[1]);
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
// stereo: the atoms the SMILES gives a hand (@ or @@). bonds: as many as one structure (no ".") of these atoms has, each
// ring closure one more (at most: a closure left open counts half).
export function smilesLinks(smiles: string): { atoms: number; bonds: number; r: (number | undefined)[]; stereo: number[] } | undefined {
  const r: (number | undefined)[] = [undefined, undefined, undefined, undefined], stereo: number[] = [];
  let atoms = 0, closures = 0;
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
    else if (ch === "%") { closures++; k += 2; }
    else if (ch >= "0" && ch <= "9") closures++;
  }
  return { atoms, bonds: Math.max(0, atoms - 1) + Math.ceil(closures / 2), r, stereo };
}

// ——— The user's monomers (J10) ———
// A monomer's atoms and bonds are at most what a residue label keeps (file.ts innerIn, edit.ts groupTooBig), so a chain
// drawn with its residue labels saves and opens again whole (docs/plans/long-text.md).
export const MOST_OWN_MONOMERS = 500, CODE_MOST = 12, OWN_ATOMS = 256, OWN_BONDS = 512, OWN_SMILES = 2000;
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
// Every reader of the user's monomers asks it, and Define Monomer too (seqbuild.ts monomerOf).
export function smilesProblem(smiles: string): boolean {
  if (smiles.length > OWN_SMILES || /\s|\./.test(smiles)) return true;
  const links = smilesLinks(smiles);
  return !links || links.atoms > OWN_ATOMS || links.bonds > OWN_BONDS || links.r[1] === undefined || links.r[2] === undefined;
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
// The monomers in a HELM monomer library file, or why there are none. usable: whether Octet can use a monomer's SMILES
// (seqbuild.ts usableMonomer: a whole structure of real atoms, an α-amino acid); each one that is not counts as left out.
// It is asked of at most MOST_TRIED monomers, so a hostile file costs little time.
const MOST_TRIED = 2000;
export function readHelmLibrary(text: string, usable: (smiles: string) => boolean = () => true): { monomers: OwnMonomer[]; left: number } | { problem: string } {
  if (text.length > MOST_LIBRARY) return { problem: "Octet reads monomer libraries of up to 4 MB." };
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { problem: "This file is not a HELM monomer library." }; }
  // A list, or an object holding one (some libraries put it under "monomers").
  const list = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { monomers?: unknown }).monomers) ? (data as { monomers: unknown[] }).monomers : undefined;
  if (!list) return { problem: "This file is not a HELM monomer library." };
  // A monomer past the 20,000th is not looked at, and counts as left out.
  const out: OwnMonomer[] = [], seen = new Set<string>();
  let left = Math.max(0, list.length - 20_000), tried = 0;
  for (const x of list.slice(0, 20_000)) {
    const m = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const code = typeof m.symbol === "string" ? m.symbol.trim() : "", raw = typeof m.smiles === "string" ? m.smiles.trim() : "";
    const smiles = raw && (m.polymerType ?? "PEPTIDE") === "PEPTIDE" ? numbered(raw) : undefined;
    if (!smiles || codeProblem(code) || seen.has(code) || smilesProblem(smiles) || out.length >= MOST_OWN_MONOMERS || tried++ >= MOST_TRIED || !usable(smiles)) { left++; continue; }
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
