// HELM and FASTA, in and out (issue 27). Pasted HELM or FASTA opens the Sequence tool's field with the sequence in
// Octet's own words ("peptide: Ac-ACD-NH2", "dna: GATTACA"), so the kind, the ends and Residue labels can be chosen
// before Return draws it. Edit > Copy As > HELM and FASTA write each peptide, RNA or DNA chain in the selection, drawn
// out or as residue labels. ChemDraw's Copy As FASTA gives the letters alone, with X for a residue it does not know (N
// for a nucleotide), and so does Octet's. HELM writes such a residue as SMILES with its two links ([*:1] to the N side
// or 5' side, [*:2] to the other), as HELM does for a monomer outside its library, so it reads back in other programs.
import type { Atom, Caption, Mol } from "./render.ts";
import { erase, fragments, insertMol, pickAtoms } from "./edit.ts";
import { chainRead, type ChainEnd } from "./chain.ts";
import { canonicalSmiles, expandWithOrigins, toInchi, toSmiles } from "./chem.ts";
import { buildAtoms, buildLabels, endRefs, monomerRefs, MOST_LABELS, r3Port, residueCount, TOO_MANY_ATOMS, tooManyAtoms } from "./seqbuild.ts";
import { residueName, sequenceParts, sequenceText, type SeqKind } from "./sequence.ts";
import { CODES } from "./peptide.ts";
import { byLabel, C_ENDS, endMonomers, endOfWord, isEnd, isNEnd, monomer, N_ENDS, naturalLetter, smilesLinks, type Own, type PolymerKind } from "./monomers.ts";
// What a peptide's ends can be, in the field's words.
const ENDS_PROBLEM = `Ends can be ${[["H", ...N_ENDS.map((e) => e.word)].map((w) => `${w}-`), ["OH", ...C_ENDS.map((e) => e.word)].map((w) => `-${w}`)].flat().join(", ").replace(/, ([^,]*)$/, " or $1")}.`;

// ——— The sequence model (J1) ———
// A sequence as Octet holds it while it reads and draws one: its chains, each a list of monomer codes (monomers.ts), and
// its links, each from one unit's R1, R2 or R3 to another's. A peptide's ends are units of their own ([ac], [am]), as
// HELM counts them. An inline monomer (HELM's [SMILES]) has no code, only its SMILES.
export type SeqUnit = { code: string; smiles?: string };
export type SeqChain = { kind: PolymerKind; units: SeqUnit[] };
export type End = { chain: number; unit: number; r: 1 | 2 | 3 };
export type Seq = { chains: SeqChain[]; links: [End, End][] };

// Limits for HELM and field text, which may be hostile (a file, the clipboard, an AI app): the text, the polymers, the
// units in a chain and in all, the links, the depth of brackets, an inline monomer's SMILES and its atoms, a code.
export const MOST_TEXT = 20_000, MOST_POLYMERS = 50, MOST_UNITS = 1000, MOST_LINKS = 500, MOST_DEPTH = 32, MOST_INLINE = 2000, MOST_INLINE_ATOMS = 256, MOST_CODE = 40;
// Text quoted in a problem: at most 40 characters, with no control characters.
export const quoted = (s: string) => { const t = s.replace(/[\u0000-\u001f\u007f]/g, ""); return t.length > 40 ? `${t.slice(0, 39)}…` : t; };
const unknown = (u: string) => ({ problem: `Octet does not know the HELM monomer ${quoted(u)}.` });

// The text split at each sep outside brackets, parentheses, braces and quotes, or a problem when they do not pair up
// or nest deeper than MOST_DEPTH. One pass, so any length reads in linear time.
function split(s: string, sep: string): string[] | { problem: string } {
  const out = [""], open: string[] = [];
  for (const ch of s) {
    if (open[open.length - 1] === '"') { if (ch === '"') open.pop(); out[out.length - 1] += ch; continue; }
    if (ch === sep && !open.length) { out.push(""); continue; }
    if (ch === "[" || ch === "(" || ch === "{" || ch === '"') { if (open.push(ch) > MOST_DEPTH) return { problem: "This HELM is nested too deep." }; }
    else if (ch === "]" || ch === ")" || ch === "}") { if (open.pop() !== { "]": "[", ")": "(", "}": "{" }[ch]) return { problem: "This HELM has a bracket that does not pair up." }; }
    out[out.length - 1] += ch;
  }
  return open.length ? { problem: "This HELM has a bracket that does not pair up." } : out;
}

// HELM (HELM 2, and HELM 1 with four $ sections) read into a sequence, with notes for what Octet leaves out (base pairs,
// annotations), or a problem. own: the monomers [code] may name besides Octet's. Undefined for text that is not HELM.
export function parseHelm(helm: string, own: Own = []): { seq: Seq; notes: string[] } | { problem: string } | undefined {
  const s = helm.trim();
  if (!/^(PEPTIDE|RNA|CHEM|BLOB)\d{1,9}\{/.test(s)) return undefined;
  if (s.length > MOST_TEXT) return { problem: `Octet reads HELM of up to ${MOST_TEXT.toLocaleString("en-GB")} characters.` };
  if (/[\u0000-\u0008\u000e-\u001f]/.test(s)) return { problem: "This HELM has characters that are not text." };
  const parts = split(s, "$");
  if ("problem" in parts) return parts;
  if (parts.length > 5) return { problem: "This HELM has too many $ sections." };
  const [polymerText, linkText = "", groups = "", annotations = ""] = parts, notes = new Set<string>();
  const polymers = split(polymerText, "|");
  if ("problem" in polymers) return polymers;
  if (polymers.length > MOST_POLYMERS) return { problem: `Octet reads up to ${MOST_POLYMERS} HELM polymers.` };
  const chains: SeqChain[] = [], ids = new Map<string, number>();
  let total = 0;
  for (const p of polymers) {
    const brace = p.indexOf("{"), close = p.lastIndexOf("}"), id = p.slice(0, brace), head = /^(PEPTIDE|RNA|CHEM|BLOB)([1-9]\d{0,3})$/.exec(id);
    if (brace < 0 || close < brace || !head) return { problem: `Octet does not read the HELM polymer ${quoted(p)}.` };
    if (head[1] === "CHEM" || head[1] === "BLOB") return { problem: "Octet does not draw HELM CHEM or BLOB polymers." };
    if (ids.has(id)) return { problem: `${id} is defined twice in this HELM.` };
    if (p.slice(close + 1).trim()) notes.add("Octet left out the HELM annotations.");
    const units = split(p.slice(brace + 1, close), ".");
    if ("problem" in units) return units;
    if (units.length === 1 && !units[0].trim()) return { problem: `${id} has no monomers.` };
    if (units.length > MOST_UNITS || (total += units.length) > MOST_UNITS) return { problem: `Octet reads up to ${MOST_UNITS.toLocaleString("en-GB")} monomers.` };
    const chain = head[1] === "PEPTIDE" ? peptideUnits(units, own) : nucleicUnits(units);
    if ("problem" in chain) return chain;
    ids.set(id, chains.length);
    chains.push(chain);
  }
  // The links: SOURCE,TARGET,unit:R-unit:R, or a base pair (unit:pair-unit:pair), which Octet leaves out.
  const links: [End, End][] = [];
  const conns = linkText.trim() ? split(linkText, "|") : [];
  if ("problem" in conns) return conns;
  if (conns.length > MOST_LINKS) return { problem: `Octet reads up to ${MOST_LINKS} HELM links.` };
  const used = new Set<string>();
  for (const c of conns) {
    const m = c.length <= 100 ? /^([A-Z]+\d+),([A-Z]+\d+),(\d+):([A-Za-z]+\d*)-(\d+):([A-Za-z]+\d*)$/.exec(c.trim()) : null;
    if (!m) return { problem: `Octet does not read the HELM link ${quoted(c)}.` };
    if (m[4] === "pair" || m[6] === "pair") { notes.add("Octet left out the base pairs."); continue; }
    const ends: End[] = [];
    for (const [poly, num, r] of [[m[1], m[3], m[4]], [m[2], m[5], m[6]]]) {
      const k = ids.get(poly);
      if (k === undefined) return { problem: `${quoted(poly)} is not defined in this HELM.` };
      if (chains[k].kind !== "peptide") return { problem: "Octet draws HELM links between peptides only." };
      const n = Number(num);
      if (num.length > 4 || n < 1 || n > chains[k].units.length) return { problem: `${poly} has no unit ${quoted(num)}.` };
      if (!/^R[1-3]$/.test(r)) return { problem: `Octet reads links at R1, R2 and R3, not ${quoted(r)}.` };
      ends.push({ chain: k, unit: n - 1, r: Number(r[1]) as 1 | 2 | 3 });
    }
    const [a, b] = ends;
    if (a.chain === b.chain && a.unit === b.unit) return { problem: `A link joins unit ${a.unit + 1} of ${m[1]} to itself.` };
    for (const e of ends) {
      const poly = m[e === a ? 1 : 2], u = chains[e.chain].units[e.unit], key = `${e.chain} ${e.unit} ${e.r}`;
      if (!hasLink(u, e.r, own)) return { problem: `Unit ${e.unit + 1} of ${poly} (${quoted(u.code || "SMILES")}) has no R${e.r}.` };
      // R1 and R2 join a unit to the units before and after it; only a chain's ends have them free.
      const inner = (e.r === 1 && e.unit > 0) || (e.r === 2 && e.unit < chains[e.chain].units.length - 1);
      if (inner || used.has(key)) return { problem: `Unit ${e.unit + 1} of ${poly} has two links at R${e.r}.` };
      used.add(key);
    }
    links.push([a, b]);
  }
  if (links.length > MOST_LINKS) return { problem: `Octet reads up to ${MOST_LINKS} HELM links.` };
  if (groups.trim() || (annotations.trim() && annotations.trim() !== "{}")) notes.add("Octet left out the HELM annotations.");
  return { seq: { chains, links }, notes: [...notes] };
}
// Whether a unit has a link at R (its structure has [*:R]).
export function hasLink(u: SeqUnit, r: 1 | 2 | 3, own: Own = [], kind: PolymerKind = "peptide"): boolean {
  const smiles = u.smiles ?? monomer(kind, u.code, own)?.smiles;
  return !!smiles && smiles.includes(`[*:${r}]`);
}
// A peptide's units: a natural code, or a code in brackets ([dF], [ac], [am], one of own's), or a monomer's own SMILES
// in brackets with its links ([*:1] to [*:3]).
function peptideUnits(units: string[], own: Own): SeqChain | { problem: string } {
  const out: SeqUnit[] = [];
  for (const raw of units) {
    const u = raw.trim();
    if (/^[A-Z]$/.test(u)) { if (!monomer("peptide", u)) return unknown(u); out.push({ code: u }); continue; }
    if (!u.startsWith("[") || !u.endsWith("]")) return unknown(u);
    const inner = u.slice(1, -1);
    if (/^[A-Za-z0-9_-]{1,40}$/.test(inner)) { if (!monomer("peptide", inner, own)) return unknown(u); out.push({ code: inner }); continue; }
    const smiles = inlineSmiles(inner);
    if (typeof smiles !== "string") return smiles;
    // An end Octet writes as its SMILES (Biotin) reads back as that end.
    const end = [...N_ENDS, ...C_ENDS].find((e) => e.inline && e.smiles === smiles);
    out.push(end ? { code: end.code } : { code: "", smiles });
  }
  return { kind: "peptide", units: out };
}
// An inline monomer's SMILES, or a problem: up to MOST_INLINE characters and MOST_INLINE_ATOMS atoms, with [*:1] and
// [*:2] (a chain's end may lack one) and maybe [*:3], each once, and no other R atom.
export function inlineSmiles(smiles: string): string | { problem: string } {
  if (smiles.length > MOST_INLINE) return { problem: `Octet reads a HELM monomer's SMILES of up to ${MOST_INLINE.toLocaleString("en-GB")} characters.` };
  const links = smilesLinks(smiles);
  if (!links || !/^[A-Za-z0-9@+\-[\]()=#$:.%*\/\\]+$/.test(smiles) || smiles.includes(".")) return unknown(`[${smiles}]`);
  if (links.atoms > MOST_INLINE_ATOMS) return { problem: `Octet reads a HELM monomer of up to ${MOST_INLINE_ATOMS} atoms.` };
  if (links.r[1] === undefined && links.r[2] === undefined) return unknown(`[${smiles}]`);
  return smiles;
}
// RNA or DNA: an optional 5' phosphate (P), then nucleotides, R(A) or [dR](A) with a phosphate after each but maybe the
// last (R(A)P), as units rA (dA) and P. Ribothymidine R(T) and deoxyuridine [dR](U) are other nucleosides, which the
// Sequence tool does not draw.
function nucleicUnits(units: string[]): SeqChain | { problem: string } {
  const out: SeqUnit[] = [];
  let rna = false, dna = false;
  for (const raw of units) {
    const u = raw.trim(), m = u.length <= 12 ? /^(R|\[dR\])\(([ACGTU])\)(P?)$/.exec(u) : null;
    if (u === "P") { if (out.length && out[out.length - 1].code === "P") return unknown(u); out.push({ code: "P" }); continue; }
    if (!m || m[2] === (m[1] === "R" ? "T" : "U")) return unknown(u);
    if (out.length && out[out.length - 1].code !== "P") return unknown(u);
    if (m[1] === "R") rna = true; else dna = true;
    out.push({ code: `${m[1] === "R" ? "r" : "d"}${m[2]}` });
    if (m[3]) out.push({ code: "P" });
  }
  if (rna && dna) return { problem: "Octet reads HELM of RNA or DNA, not both in one chain." };
  if (!rna && !dna) return { problem: "This HELM RNA has no nucleotides." };
  return { kind: dna ? "dna" : "rna", units: out };
}

// HELM or FASTA as the Sequence tool's text, or why Octet cannot read it (problem). Undefined for any other text. One
// peptide, RNA or DNA chain of Octet's own monomers with no links opens in Octet's words, so its kind and ends can be
// chosen; any other HELM opens as it is, and the field reads it as HELM.
// bare: FASTA with no ">" line is read too (bareFasta), for a paste that nothing else reads.
export function readSequence(pasted: string, bare = false, own: Own = []): { text: string; notes?: string[] } | { problem: string } | undefined {
  const helm = parseHelm(pasted, own);
  if (helm && "problem" in helm) return helm;
  if (helm) {
    const words = seqWords(helm.seq);
    return { text: words ?? pasted.trim(), ...(helm.notes.length ? { notes: helm.notes } : {}) };
  }
  const fasta = fromFasta(pasted) ?? (bare ? bareFasta(pasted) : undefined);
  return fasta ? { text: fasta } : undefined;
}
// A sequence in the Sequence tool's words, when it is one chain with no links and only codes the words write.
export function seqWords(seq: Seq): string | undefined {
  if (seq.chains.length !== 1 || seq.links.length) return undefined;
  const [c] = seq.chains, units = c.units;
  if (c.kind === "peptide") {
    const word = (u: SeqUnit | undefined, side: "N" | "C") => (u && !u.smiles ? endMonomers(side).find((e) => e.code === u.code)?.word : undefined);
    const start = word(units[0], "N") ?? "", end = units.length > 1 ? word(units[units.length - 1], "C") ?? "" : "", body = units.slice(start ? 1 : 0, end ? -1 : undefined);
    if (!body.length || body.some((u) => u.smiles || isEnd(u.code))) return undefined;
    return sequenceText({ kind: "peptide", codes: body.map((u) => (u.code.length === 1 ? u.code : `[${u.code}]`)).join(""), start, end }).text;
  }
  const start = units[0].code === "P" ? "p" : "", end = units.length > 1 && units[units.length - 1].code === "P" ? "p" : "", body = units.filter((u) => u.code !== "P");
  return sequenceText({ kind: c.kind, codes: body.map((u) => u.code[1]).join(""), start, end }).text;
}

// ——— The Sequence tool's field (J8) ———
// What the field holds, read into the model: HELM, typed or pasted ("PEPTIDE1{C.Y.I}$…"), or Octet's own words, a
// peptide's codes ("peptide: Ac-C[dF]IQN-NH2": a capital letter for a natural amino acid, a code in brackets for a D
// amino acid) or RNA and DNA bases ("rna: pACGU"). notes: what HELM left out. A problem says
// why the text is not a sequence; undefined for any other text, or a sequence with no codes yet.
export function fieldSeq(text: string, own: Own = []): { seq: Seq; notes?: string[] } | { problem: string } | undefined {
  const t = text.trim();
  if (t.length > MOST_TEXT) return { problem: `Octet reads up to ${MOST_TEXT.toLocaleString("en-GB")} characters.` };
  const helm = parseHelm(t, own);
  if (helm) return "problem" in helm ? helm : { seq: helm.seq, ...(helm.notes.length ? { notes: helm.notes } : {}) };
  const parts = sequenceParts(t);
  if (!parts) return undefined;
  const body = parts.codes.replace(/\s+/g, "");
  if (parts.kind === "peptide") {
    if (!body) return parts.start || parts.end || /-/.test(t.replace(/^\s*peptide\s*:/i, "")) ? { problem: "Type the amino acids, for example ACDEFG." } : undefined;
    if (body.includes("-")) return { problem: ENDS_PROBLEM };
    const units: SeqUnit[] = parts.start ? [{ code: endOfWord(N_ENDS, parts.start)!.code }] : [], bad = new Set<string>();
    let lower = false;
    for (let k = 0; k < body.length; k++) {
      const ch = body[k];
      if (ch === "[") {
        const end = body.indexOf("]", k);
        if (end < 0) return { problem: "Type ] after the code." };
        const code = body.slice(k + 1, end);
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(code) || isEnd(code) || !monomer("peptide", code, own)) return { problem: `Not a monomer: [${quoted(code)}]` };
        units.push({ code });
        k = end;
      } else if (/[a-z]/.test(ch)) lower = true;
      else if (CODES[ch]) units.push({ code: ch });
      else bad.add(ch === "]" ? "]" : ch);
      if (units.length - (parts.start ? 1 : 0) > MOST_UNITS) return { problem: `Up to ${MOST_UNITS.toLocaleString("en-GB")} residues.` };
    }
    if (lower) return { problem: "Type the amino acids in capitals, for example ACDEFG." };
    if (bad.size) return { problem: `${bad.size === 1 ? "Not an amino acid" : "Not amino acids"}: ${[...bad].map(quoted).join(", ")}` };
    if (parts.end) units.push({ code: endOfWord(C_ENDS, parts.end)!.code });
    return { seq: { chains: [{ kind: "peptide", units }], links: [] } };
  }
  const dna = parts.kind === "dna", example = dna ? "ATGC" : "AACGUU";
  if (!body) return parts.start || parts.end ? { problem: `Type the bases, for example ${example}.` } : undefined;
  const letters = [...body.toUpperCase()].map((ch) => (ch === (dna ? "U" : "T") ? (dna ? "T" : "U") : ch));
  const bad = [...new Set([...body].filter((_, k) => !"ACGTU".includes(letters[k])))];
  if (bad.length) return { problem: `${bad.length === 1 ? "Not a nucleotide" : "Not nucleotides"}: ${bad.map(quoted).join(", ")}` };
  if (letters.length > MOST_UNITS) return { problem: `Up to ${MOST_UNITS.toLocaleString("en-GB")} residues.` };
  const units: SeqUnit[] = parts.start ? [{ code: "P" }] : [];
  letters.forEach((b, k) => { if (k) units.push({ code: "P" }); units.push({ code: `${dna ? "d" : "r"}${b}` }); });
  if (parts.end) units.push({ code: "P" });
  return { seq: { chains: [{ kind: parts.kind, units }], links: [] } };
}
// A sequence for the field: its text, drawn as atoms or as residue labels, with the monomers its codes may name besides
// Octet's (own: the document's, then the user's). Built in the layout worker (namepreview.ts seqLayout): the structure,
// or why not.
export type SeqAsk = { build: string; labels: boolean; own?: Own };
export function seqBuilt(ask: SeqAsk): Mol | { problem: string } | undefined {
  const own = ask.own ?? [], read = fieldSeq(ask.build, own);
  if (!read || "problem" in read) return read;
  const built = ask.labels ? buildLabels(read.seq, undefined, own) : buildAtoms(read.seq, undefined, own);
  return "problem" in built ? built : built.mol;
}
// Whether text is a sequence for the field: Octet's words or HELM.
export const isSeqText = (text: string) => /^\s*(peptide|rna|dna)\s*:/i.test(text) || /^\s*(PEPTIDE|RNA|CHEM|BLOB)\d{1,9}\{/.test(text);
// Why a sequence is too large to draw: in full, its atoms (counted from its monomers, about 120 residues), or as
// residue labels, its residues.
export function seqProblem(seq: Seq, labels: boolean, own: Own = []): string | undefined {
  if (labels) return residueCount(seq) > MOST_LABELS ? `Up to ${MOST_LABELS.toLocaleString("en-GB")} residues.` : undefined;
  return tooManyAtoms(seq, own) ? TOO_MANY_ATOMS : undefined;
}

// A FASTA record (">" and a description, then the sequence over one line or more) as the Sequence tool's text: RNA
// when its letters are all bases and one is U, DNA when they are all bases, else a peptide. The first record only.
function fromFasta(fasta: string): string | undefined {
  const m = /^\s*>[^\r\n]*\r?\n([^>]*)/.exec(fasta), codes = m?.[1].replace(/[\s\d*]/g, "").toUpperCase();
  if (!codes || !/^[A-Z]+$/.test(codes)) return undefined;
  return sequenceText({ kind: fastaKind(codes), codes, start: "", end: "" }).text;
}
const fastaKind = (codes: string): SeqKind => (/^[ACGTUN]+$/.test(codes) ? (codes.includes("U") ? "rna" : "dna") : "peptide");
// A sequence with no ">" line: one line or more of residue letters and nothing else, told apart as a FASTA record is.
// With no header to say it is a sequence, every letter must be one: bases (A, C, G, T or U, in either case), else a
// peptide in capitals, each one of the 20 amino acids. A * at the end (a protein's stop) is left out. At least two
// letters. Undefined for anything else (a word, a damaged SMILES), so such a paste says what it said before.
function bareFasta(text: string): string | undefined {
  const t = text.trim().replace(/\*$/, "");
  if (t.length > MOST_TEXT || !/^[A-Za-z\s]+$/.test(t)) return undefined;
  const typed = t.replace(/\s+/g, ""), codes = typed.toUpperCase();
  if (codes.length < 2) return undefined;
  if (/^[ACGTU]+$/.test(codes)) return sequenceText({ kind: fastaKind(codes), codes, start: "", end: "" }).text;
  if (typed !== codes || [...codes].some((ch) => !CODES[ch])) return undefined;
  return sequenceText({ kind: "peptide", codes, start: "", end: "" }).text;
}

// ——— HELM and FASTA out (J6) ———
// Each peptide, RNA or DNA chain in a drawing, drawn out, as residue labels, or mixed: the labels are expanded with their
// atoms (chem.ts expandWithOrigins) and the chains read from the atoms (chain.ts chainRead). A residue is named by its
// label, else by its InChI against Octet's monomers and the document's (sequence.ts residueName), else written as its
// SMILES with its links. The links: each end's residue and its R.
type Unit = { code?: string; atoms: number[] };
type Chain = { kind: PolymerKind; units: Unit[]; first: number; free: number[] };
type Read = { mol: Mol; from: number[]; chains: Chain[]; links: { a: ChainEnd; b: ChainEnd }[] };
function read(m: Mol, inchi: (x: Mol | string) => string | undefined, own: Own): Read {
  const { mol, from } = expandWithOrigins(m);
  const chains: Chain[] = [], links: Read["links"] = [];
  for (const frag of fragments(mol)) {
    const c = chainRead(mol, frag);
    if (!c) continue;
    const base = chains.length, found: Chain[] = [];
    c.chains.forEach((ch) => {
      // A peptide's ends: Ac and NH2 ([ac], [am]), and the others Octet has (Boc, OMe; monomers.ts N_ENDS, C_ENDS) by their
      // structure. An end Octet does not know (an ester of another alcohol) joins its residue.
      const ac = ch.start.length === 3 && ch.start.map((i) => mol.atoms[i].label).sort().join() === "C,C,O" ? "ac" : undefined, amide = ch.end.length === 1 && mol.atoms[ch.end[0]].label === "N" ? "am" : undefined;
      const free = ch.end.length === 1 && mol.atoms[ch.end[0]].label === "O";
      const start = ac ?? (ch.start.length && !c.nucleic ? endOf(mol, ch.start, "N", inchi) : undefined), end = amide ?? (ch.end.length && !free && !c.nucleic ? endOf(mol, ch.end, "C", inchi) : undefined);
      const residues = ch.residues.map((r) => [...r]);
      if (ch.start.length && !start) residues[0].push(...ch.start);
      if (ch.end.length && !end && !free) residues[residues.length - 1].push(...ch.end);
      const units: Unit[] = residues.map((atoms) => ({ code: codeOf(mol, atoms, c.nucleic, inchi, own), atoms }));
      const kind: PolymerKind = !c.nucleic ? "peptide" : units.some((u) => /^d[ACGT]$/.test(u.code ?? "")) ? "dna" : "rna";
      found.push({ kind, units: [...(start ? [{ code: start, atoms: ch.start }] : []), ...units, ...(end ? [{ code: end, atoms: ch.end }] : [])], first: Math.min(...residues.flat()), free: free ? ch.end : [] });
    });
    // A structure drawn wholly as atoms is a sequence from three residues (two nucleotides), as in Octet 1.1.2, or two
    // residues Octet has codes for (Ac-Ala-Cys-NH2): a free amino acid, N-acetylcysteine, aspartame, enalapril or
    // lidocaine (an N–C–C(=O) too) stays a small molecule. One with a residue label is a sequence whatever its length.
    const units = found.flatMap((ch) => ch.units.filter((u) => (c.nucleic ? u.code !== "P" : !isEnd(u.code))));
    const small = c.nucleic ? units.length < 2 : units.length < 2 || (units.length === 2 && units.some((u) => !u.code));
    if (small && !frag.some((i) => m.atoms[from[i]]?.inner?.atoms.length && m.atoms[from[i]].text)) continue;
    chains.push(...found);
    for (const l of c.links) {
      const shift = (e: ChainEnd): ChainEnd => ({ ...e, chain: e.chain + base, residue: e.residue + (isNEnd(chains[e.chain + base].units[0]?.code) ? 1 : 0) });
      links.push({ a: shift(l.a), b: shift(l.b) });
    }
  }
  return { mol, from, chains, links };
}
// A peptide's end (its atoms off the first N or the last C=O carbon): the code of the end Octet has with its structure.
function endOf(mol: Mol, atoms: number[], side: "N" | "C", inchi: (x: Mol | string) => string | undefined): string | undefined {
  return residueName(mol, new Set(atoms), inchi, endRefs(side), false);
}
// A residue's code: the monomer whose InChI it has. A residue label is read by its kept atoms, so a label typed over
// other atoms (Lys over an acetyl-Lys) is not taken for what it says.
function codeOf(mol: Mol, atoms: number[], nucleic: boolean, inchi: (x: Mol | string) => string | undefined, own: Own): string | undefined {
  const name = residueName(mol, new Set(atoms), inchi, nucleic ? [] : monomerRefs(own));
  return name ? byLabel(nucleic ? undefined : "peptide", name, own)?.code : undefined;
}

// Edit > Copy As > FASTA: each chain's one-letter codes, a line each: a D monomer as its natural letter, X for any other
// peptide monomer Octet does not know a letter for, N for such a nucleotide. Undefined when there is none.
export function toFasta(m: Mol, inchi: (x: Mol | string) => string | undefined = toInchi, own: Own = []): string | undefined {
  const lines = read(m, inchi, own).chains.map((c) => c.units.filter((u) => (c.kind === "peptide" ? !isEnd(u.code) : u.code !== "P")).map((u) => (c.kind !== "peptide" ? /^[rd]([ACGTU])$/.exec(u.code ?? "")?.[1] ?? "N" : naturalLetter(u.code ?? "") ?? "X")).join(""));
  return lines.length ? lines.join("\n") : undefined;
}

// Edit > Copy As > HELM (HELM 2), in Octet's form: each chain a polymer (PEPTIDE1{[ac].C.Y.[dF].[am]},
// RNA1{P.R(A)P.[dR](T)}), in the order of their first atoms; the links after the first $, by their first end, each
// written from its lower end (PEPTIDE1,PEPTIDE1,1:R3-6:R3); a residue Octet does not know as its SMILES with its links
// ([*:1] where the residue before it bonds, [*:2] the next, [*:3] a link). smiles writes it. Undefined when there is no
// chain, or a nucleotide is not one of the ten.
export function toHelm(m: Mol, inchi: (x: Mol | string) => string | undefined = toInchi, smiles: (x: Mol) => string = canonicalSmiles, own: Own = []): string | undefined {
  const s = seqOf(m, inchi, smiles, own);
  return s && helmOf(s.seq);
}
// The sequences in a drawing as one model (J6): each chain's units in the order of their first atoms, a residue Octet
// does not know (or one linked where its monomer has no link) as its SMILES with its links, and the links. drawn: the
// drawing's atoms each chain is made of. Undefined when there is no chain, or a nucleotide is not one of the ten.
export function seqOf(m: Mol, inchi: (x: Mol | string) => string | undefined = toInchi, smiles: (x: Mol) => string = canonicalSmiles, own: Own = []): { seq: Seq; drawn: number[][]; units: number[][][] } | undefined {
  const r = read(m, inchi, own);
  if (!r.chains.length) return undefined;
  const order = r.chains.map((_, k) => k).sort((p, q) => r.chains[p].first - r.chains[q].first);
  // Which link of a residue each outside bond is: the unit's place by atom, then the link's R where it crosses one.
  const where = new Map<number, [number, number]>();
  r.chains.forEach((c, k) => c.units.forEach((u, n) => u.atoms.forEach((i) => where.set(i, [k, n]))));
  const linkR = new Map<string, number>(), linkedAt = new Set<string>();
  for (const l of r.links) {
    linkR.set(`${l.a.chain} ${l.a.residue} ${l.b.chain} ${l.b.residue}`, l.a.r); linkR.set(`${l.b.chain} ${l.b.residue} ${l.a.chain} ${l.a.residue}`, l.b.r);
    linkedAt.add(`${l.a.chain} ${l.a.residue} ${l.a.r}`); linkedAt.add(`${l.b.chain} ${l.b.residue} ${l.b.r}`);
  }
  const chains: SeqChain[] = [];
  for (const k of order) {
    const c = r.chains[k];
    if (c.kind !== "peptide") {
      if (c.units.some((u) => !u.code || !monomer(c.kind, u.code))) return undefined;
      chains.push({ kind: c.kind, units: c.units.map((u) => ({ code: u.code! })) });
      continue;
    }
    chains.push({ kind: "peptide", units: c.units.map((u, n) => {
      const fits = u.code && ([1, 2, 3] as const).every((rr) => !linkedAt.has(`${k} ${n} ${rr}`) || hasLink({ code: u.code! }, rr, own));
      if (fits) return { code: u.code! };
      return { code: "", smiles: linked(r.mol, u.atoms, (j) => {
        const w = where.get(j);
        if (w && w[0] === k && w[1] === n - 1) return 1;
        if ((w && w[0] === k && w[1] === n + 1) || c.free.includes(j)) return 2;
        return w ? linkR.get(`${k} ${n} ${w[0]} ${w[1]}`) ?? 3 : 3;
      }, smiles) };
    }) });
  }
  const links = r.links.map((l): [End, End] => [{ chain: order.indexOf(l.a.chain), unit: l.a.residue, r: l.a.r }, { chain: order.indexOf(l.b.chain), unit: l.b.residue, r: l.b.r }]);
  const drawn = order.map((k) => [...new Set([...r.chains[k].units.flatMap((u) => u.atoms), ...r.chains[k].free].map((i) => r.from[i]))].filter((i) => i !== undefined).sort((p, q) => p - q));
  const units = order.map((k) => r.chains[k].units.map((u, n) => [...new Set([...u.atoms, ...(n === r.chains[k].units.length - 1 ? r.chains[k].free : [])].map((i) => r.from[i]))].filter((i) => i !== undefined)));
  return { seq: { chains, links }, drawn, units };
}
// A sequence as HELM 2 in Octet's form: the chains as polymers in order (PEPTIDE1, PEPTIDE2, RNA1), each link written
// from its lower end and the links sorted by it, the rest empty. parseHelm reads it back as the same model.
export function helmOf(seq: Seq): string | undefined {
  const names: string[] = [], count = { PEPTIDE: 0, RNA: 0 }, polymers: string[] = [];
  for (const c of seq.chains) {
    const helmKind = c.kind === "peptide" ? "PEPTIDE" : "RNA", units: string[] = [];
    names.push(`${helmKind}${++count[helmKind]}`);
    if (c.kind !== "peptide") for (const u of c.units) {
      const n = /^([rd])([ACGTU])$/.exec(u.code);
      if (u.code === "P") { if (units.length && units[units.length - 1] !== "P") units[units.length - 1] += "P"; else units.push("P"); } else if (n) units.push(`${n[1] === "d" ? "[dR]" : "R"}(${n[2]})`); else return undefined;
    }
    else units.push(...c.units.map((u) => {
      // An end with no HELM library code (Biotin) goes as its SMILES, which other programs read.
      const inline = [...N_ENDS, ...C_ENDS].find((e) => e.inline && e.code === u.code && !u.smiles);
      return u.smiles || inline ? `[${u.smiles ?? inline!.smiles}]` : u.code.length === 1 ? u.code : `[${u.code}]`;
    }));
    polymers.push(`${names[names.length - 1]}{${units.join(".")}}`);
  }
  const rank = (e: End) => e.chain * 1e6 + e.unit * 10 + e.r;
  const conns = seq.links.map((l) => [...l].sort((p, q) => rank(p) - rank(q))).sort((p, q) => rank(p[0]) - rank(q[0]) || rank(p[1]) - rank(q[1]))
    .map(([a, b]) => `${names[a.chain]},${names[b.chain]},${a.unit + 1}:R${a.r}-${b.unit + 1}:R${b.r}`);
  return `${polymers.join("|")}$${conns.join("|")}$$$V2.0`;
}
// A residue as SMILES with its links as HELM writes them: [*:1] where the residue before it bonds, [*:2] where the
// next does, [*:3] a link (r: which, by the atom outside). Each link is written as a neon atom marked 1 to 3 first, so
// the SMILES keeps each stereocentre as it is.
function linked(m: Mol, atoms: number[], r: (outside: number) => number, smiles: (x: Mol) => string): string {
  const inside = new Set(atoms), sorted = [...atoms].sort((p, q) => p - q), part = pickAtoms(m, atoms), links: Mol["atoms"] = [], bonds: Mol["bonds"] = [];
  for (const b of m.bonds) {
    const k = b.atoms.findIndex((i) => inside.has(i)), j = b.atoms[1 - k];
    if (k < 0 || inside.has(j)) continue;
    links.push({ label: "Ne", location: m.atoms[j].location, isotope: r(j) });
    bonds.push({ type: 1, atoms: [sorted.indexOf(b.atoms[k]), part.atoms.length + links.length - 1] });
  }
  return smiles({ ...part, atoms: [...part.atoms, ...links], bonds: [...part.bonds, ...bonds] }).replace(/\[([123])Ne\]/g, "[*:$1]");
}

// ——— How the drawing's sequences show (J9) ———
// Every chain in a drawing drawn again as atoms or as residue labels (Settings > Document > Style > Sequences, the
// Residue labels choice under the name field): each structure that is wholly one or more chains is read (seqOf) and
// built again (seqbuild.ts), centred where it was. As residue labels, a residue Octet has no label for stays in full in
// its row. A structure that is anything more than chains (a drug on a peptide) is left as it is, as is one already
// drawn the way asked. What each residue's atoms all share (a colour, a highlight) goes on it as drawn again, and what
// the whole structure shares on all of it.
export function withSequences(m: Mol, to: "atoms" | "labels", own: Own = m.monomers ?? []): Mol {
  const made: { gone: number[]; mol: Mol }[] = [];
  for (const frag of fragments(m).map((f) => [...f].sort((p, q) => p - q))) {
    const residueLabels = frag.filter((i) => m.atoms[i].inner?.atoms.length && m.atoms[i].text).length;
    const ends = frag.filter((i) => !m.atoms[i].inner && ((m.atoms[i].label === "H" && !m.atoms[i].text) || ["OH", "Ac", "NH2"].includes(m.atoms[i].text ?? ""))).length;
    if (to === "atoms" ? !residueLabels : residueLabels + ends === frag.length) continue;
    const part = pickAtoms(m, frag), read = seqOf(part, toInchi, toSmiles, own);
    if (!read || read.drawn.flat().length !== part.atoms.length) continue;
    // Already as asked: every residue with a label drawn as one (a residue in full stays so).
    if (to === "labels" && read.seq.chains.every((c, k) => c.units.every((u, n) => u.smiles || read.units[k][n].every((i) => part.atoms[i].inner || part.atoms[i].text || part.atoms[i].label === "H")))) continue;
    // A peptide's H and OH ends are read with its first and last residues, and do not count.
    const shared = (atoms: number[]) => {
      const out: Partial<Atom> = {}, end = (a: Atom) => !a.inner && ((a.label === "H" && !a.text) || a.text === "OH"), own = atoms.filter((i) => !end(part.atoms[i]));
      for (const k of ["colour", "halo"] as const) { const v = part.atoms[own[0]]?.[k]; if (v && own.every((i) => part.atoms[i][k] === v)) out[k] = v; }
      return out;
    };
    const look = (c: number, k: number) => shared(read.units[c][k]), all = shared(part.atoms.map((_, i) => i));
    const built = to === "labels" ? buildLabels(read.seq, look, own) : buildAtoms(read.seq, look, own);
    if ("problem" in built) continue;
    const mid = (x: Mol) => [0, 1].map((k) => { const v = x.atoms.map((a) => a.location[k]); return (Math.min(...v) + Math.max(...v)) / 2; });
    const [ox, oy] = mid(part), [nx, ny] = mid(built.mol), scale = frag.map((i) => m.atoms[i].scale ?? 1).sort((p, q) => p - q)[frag.length >> 1];
    made.push({ gone: frag, mol: { ...built.mol, atoms: built.mol.atoms.map((a) => ({ ...all, ...a, location: [ox + (a.location[0] - nx) * scale, oy + (a.location[1] - ny) * scale, 0] as [number, number, number], ...(scale !== 1 ? { scale } : {}) })) } });
  }
  return made.length ? redrawn(m, made) : m;
}
// Structures drawn again in place of others: each part's atoms (gone) give way to its new structure (mol). The text
// under a structure (its compound number, its name), the group it is in, a catalytic cycle's step it is on and kept
// ChemDraw data on its atoms go with it to the new atoms: each takes them before the old atoms go.
function redrawn(m: Mol, parts: { gone: number[]; mol: Mol }[]): Mol {
  let out = m;
  for (const { gone, mol } of parts) {
    const old = new Set(gone), fresh = mol.atoms.map((_, k) => out.atoms.length + k);
    const plus = (atoms: number[]) => (atoms.some((i) => old.has(i)) ? [...atoms, ...fresh] : atoms);
    const kept = (x: Caption): Caption => (x.property?.atoms.some((i) => old.has(i)) ? { ...x, property: { ...x.property, atoms: plus(x.property.atoms) } } : x);
    out = insertMol(out, mol).mol;
    out = { ...out, captions: out.captions?.map((c) => kept(c.under?.some((i) => old.has(i)) ? { ...c, under: plus(c.under) } : c)),
      groups: out.groups?.map((g) => ({ ...g, atoms: plus(g.atoms) })), cycles: out.cycles?.map((c) => ({ ...c, nodes: c.nodes.map(plus) })) };
  }
  return erase(out, new Set(), new Set(parts.flatMap((p) => p.gone)));
}

// ——— The Bond tool between residue labels (J7) ———
// A bond drawn from a residue label to another joins them where each has a free link: its side chain's (R3; a Cys's S,
// a Lys's N, an Asp's C=O), else a chain's free end (R1, R2). The chains are read (seqOf), the link added, and the
// labels built again in rows (seqbuild.ts), so a link in one row is a bracket over it. To an atom of another structure,
// a residue joins at an R3 that caps H. A problem says why there is no bond.
export function linkResidues(m: Mol, i: number, j: number, own: Own = m.monomers ?? []): Mol | { problem: string } | undefined {
  // An amino acid's residue label (Cys, D-Phe, one of own's). Any other label (tBu, a nickname, rA) bonds as a label does.
  const isResidue = (k: number) => { const r = m.atoms[k]?.inner?.atoms.length && m.atoms[k].text ? byLabel("peptide", m.atoms[k].text!, own) : undefined; return !!r && !isEnd(r.code); };
  if (!isResidue(i) && !isResidue(j)) return undefined;
  const none = (k: number) => ({ problem: `${m.atoms[k].text} has no free link. Expand the label to bond to its atoms.` });
  if (!isResidue(i) || !isResidue(j)) {
    const r = isResidue(i) ? i : j, other = r === i ? j : i, port = r3Port(m.atoms[r].text!, m.atoms[r].inner!, own);
    // To an atom of another structure only: in its own chain the other atom is an end label or a residue's.
    if (fragments(m).some((f) => f.includes(r) && f.includes(other))) return none(r);
    if (port === undefined || m.bonds.some((b) => b.ports && b.atoms.some((k, e) => k === r && b.ports![e] === port))) return none(r);
    if (m.bonds.some((b) => b.atoms.includes(r) && b.atoms.includes(other))) return undefined;
    return { ...m, bonds: [...m.bonds, { type: 1, atoms: [r, other], ports: [port, -1] }] };
  }
  const frags = fragments(m).filter((f) => f.includes(i) || f.includes(j)), all = [...new Set(frags.flat())].sort((p, q) => p - q);
  const part = pickAtoms(m, all), read = seqOf(part, toInchi, canonicalSmiles, own);
  if (!read || read.drawn.flat().length !== part.atoms.length) return none(i);
  const local = (k: number) => all.indexOf(k), placeOf = (k: number) => { for (const [c, units] of read.units.entries()) { const u = units.findIndex((x) => x.includes(local(k))); if (u >= 0) return { chain: c, unit: u }; } return undefined; };
  const a = placeOf(i), b = placeOf(j);
  if (!a || !b) return none(a ? j : i);
  if (a.chain === b.chain && a.unit === b.unit) return undefined;
  const used = new Set(read.seq.links.flatMap((l) => l.map((e) => `${e.chain} ${e.unit} ${e.r}`)));
  const free = (p: { chain: number; unit: number }): 1 | 2 | 3 | undefined => {
    const units = read.seq.chains[p.chain].units, u = units[p.unit], open = (r: 1 | 2 | 3) => !used.has(`${p.chain} ${p.unit} ${r}`) && hasLink(u, r, own, read.seq.chains[p.chain].kind);
    if (read.seq.chains[p.chain].kind !== "peptide") return undefined;
    if (open(3)) return 3;
    if (p.unit === 0 && open(1)) return 1;
    if (p.unit === units.length - 1 && open(2)) return 2;
    return undefined;
  };
  const ra = free(a), rb = free(b);
  if (!ra) return none(i);
  if (!rb) return none(j);
  // A residue Octet has a label for but the drawing shows in full (expanded by hand) stays in full: built from its
  // SMILES, as a residue with no label is.
  const isLabel = (k: number) => !!(part.atoms[k].inner?.atoms.length && part.atoms[k].text);
  const chains = read.seq.chains.map((c, k) => ({ ...c, units: c.units.map((u, n) => (u.smiles || c.kind !== "peptide" || (u.code === "ac" || u.code === "am") || read.units[k][n].some(isLabel) ? u : { code: "", smiles: monomer("peptide", u.code, own)?.smiles ?? "" })) }));
  const seq: Seq = { chains, links: [...read.seq.links, [{ ...a, r: ra }, { ...b, r: rb }]] };
  const built = buildLabels(seq, undefined, own);
  if ("problem" in built) return built;
  // Each label keeps what the user gave it (colour, highlight, size, font), and each bond between two labels its
  // colour, highlight and line; the chain keeps its scale and its centre.
  const was = read.units.flat().flatMap((atoms) => { const l = atoms.filter(isLabel); return l.length === 1 ? l : []; });
  const now = built.mol.atoms.flatMap((q, k) => (q.inner?.atoms.length && q.text ? [k] : []));
  const fromOld = new Map(now.length === was.length ? now.map((k, n) => [k, was[n]]) : []);
  const scale = part.atoms.map((q) => q.scale ?? 1).sort((p, q) => p - q)[part.atoms.length >> 1];
  const mid = (x: Mol) => [0, 1].map((k) => { const v = x.atoms.map((q) => q.location[k]); return (Math.min(...v) + Math.max(...v)) / 2; });
  const [ox, oy] = mid(part), [nx, ny] = mid(built.mol);
  const atoms = built.mol.atoms.map((q, k) => {
    const location: [number, number, number] = [ox + (q.location[0] - nx) * scale, oy + (q.location[1] - ny) * scale, 0], old = fromOld.get(k);
    return old === undefined ? { ...q, location, ...(scale !== 1 ? { scale } : {}) } : { ...part.atoms[old], location, label: q.label, text: q.text, inner: q.inner, align: q.align };
  });
  const oldOf = new Map([...fromOld].map(([k, o]) => [o, k])), key = (p: number, q: number) => (p < q ? `${p} ${q}` : `${q} ${p}`);
  const kept = new Map(part.bonds.flatMap((x) => (oldOf.has(x.atoms[0]) && oldOf.has(x.atoms[1]) ? [[key(oldOf.get(x.atoms[0])!, oldOf.get(x.atoms[1])!), x] as const] : [])));
  const bonds = built.mol.bonds.map((x) => { const o = kept.get(key(x.atoms[0], x.atoms[1])); return o ? { ...x, ...(o.colour ? { colour: o.colour } : {}), ...(o.halo ? { halo: o.halo } : {}), ...(o.line ? { line: o.line } : {}) } : x; });
  return redrawn(m, [{ gone: all, mol: { ...built.mol, atoms, bonds } }]);
}
