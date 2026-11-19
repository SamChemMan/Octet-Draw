// The choices under the name field while it holds a sequence ("peptide:", "rna:" or "dna:"): the kind, and each end.
// They read and rewrite the text, so the text stays the one record of what is drawn and the ends typed by hand
// ("Ac-", "-NH2", "p") show as chosen. With nothing chosen the ends are the usual ones: H- and -OH on a peptide, 5'-OH
// and 3'-OH on RNA and DNA. ChemDraw's sequences start with its default termini in the same way.
import type { Mol } from "./render.ts";
import { pickAtoms } from "./edit.ts";
import { CODES, residueSmiles } from "./peptide.ts";
import { PHOSPHATE, unit } from "./nucleic.ts";
import { C_ENDS, D_CODES, elementKey, endOfWord, N_ENDS } from "./monomers.ts";

type P = [number, number];

export type SeqKind = "peptide" | "rna" | "dna";
// start and end: each end's word, "" for the usual one. A peptide's: Ac, Boc, Cbz (or Z), Fmoc, Bz or Biotin before
// (monomers.ts N_ENDS), NH2, OMe, OtBu, OBn, NHMe or NHEt after (C_ENDS); RNA's and DNA's: "p", a phosphate.
export type SeqParts = { kind: SeqKind; codes: string; start: string; end: string };
// The ends the choices under the field give: N-acetyl and C-amide, or a 5'- and 3'-phosphate. The others are typed.
export const SEQ_ENDS: Record<SeqKind, [start: [word: string, name: string], end: [word: string, name: string]]> = {
  peptide: [["Ac", "N-acetyl"], ["NH2", "C-amide"]], rna: [["p", "5′-phosphate"], ["p", "3′-phosphate"]], dna: [["p", "5′-phosphate"], ["p", "3′-phosphate"]],
};
const START = new RegExp(`^(H|${N_ENDS.map((e) => e.word).join("|")}|Z)-`, "i"), FINISH = new RegExp(`-(OH|${C_ENDS.map((e) => e.word).join("|")})\\s*$`, "i");

export function sequenceParts(text: string): SeqParts | undefined {
  const m = /^\s*(peptide|rna|dna)\s*:\s*([\s\S]*)$/i.exec(text);
  if (!m) return undefined;
  const kind = m[1].toLowerCase() as SeqKind;
  if (kind === "peptide") {
    let rest = m[2].trimEnd();
    const a = START.exec(rest), b = FINISH.exec(rest.slice(a ? a[0].length : 0));
    if (a) rest = rest.slice(a[0].length);
    if (b) rest = rest.slice(0, rest.length - b[0].length);
    const start = a && a[1].toLowerCase() !== "h" ? endOfWord(N_ENDS, a[1])!.word : "", end = b && b[1].toLowerCase() !== "oh" ? endOfWord(C_ENDS, b[1])!.word : "";
    return { kind, codes: rest, start, end };
  }
  const n = /^(?:5'-?)?(p-?)?([\s\S]*?)(-?p)?(?:-?3')?\s*$/i.exec(m[2].replace(/[’′]/g, "'"))!;
  return { kind, codes: n[2], start: n[1] ? "p" : "", end: n[3] ? "p" : "" };
}

// The text for the parts, and where the caret goes: after the codes, before the end.
export function sequenceText(s: SeqParts): { text: string; caret: number } {
  const codes = s.codes.trim(), head = `${s.kind}: ${s.start ? (s.kind === "peptide" ? `${s.start}-` : "p") : ""}${codes}`;
  // With no codes yet, a 3' phosphate is "-p", so it is not read as a 5' one.
  const tail = !s.end ? "" : s.kind === "peptide" ? `-${s.end}` : codes ? "p" : "-p";
  return { text: head + tail, caret: head.length };
}

// ——— Residue labels ———
// A sequence drawn as residue labels, as ChemDraw draws one: H–Ala–Cys–OH, or rA–P–rC for RNA (dA–P–dC for DNA, with
// P for each phosphate). Each label keeps its residue's atoms as drawn (inner), and each bond says which of them it
// joins (ports): a residue's N on one side and its C=O on the other, a nucleotide's 5'-O and 3'-O, a phosphate's P. So
// the formula, the name and every other analysis read the whole structure, and Expand Label draws a residue out.
// What a residue bonded on two sides is, for Contract Label's suggestion: its InChI with each outside bond capped as
// the free compound has it (OH on a C=O or a phosphate's P, H on an N or O) against each amino acid's, nucleoside's
// and phosphate's. The labels are the ones the Sequence tool draws.
// A link's cap (monomers.ts): OH on an acyl carbon or a P, H anywhere else. more: other residues to try (the D amino
// acids, the user's monomers; seqbuild.ts monomerRefs), each tried only when its residue has as many heavy atoms.
// plain: try the natural residues, nucleosides and phosphate first (false: only more).
export function residueName(m: Mol, group: Set<number>, inchi: (x: Mol | string) => string | undefined, more: readonly { label: string; key: string; smiles: () => string | undefined }[] = [], plain = true): string | undefined {
  const caps = new Map<number, string>();
  const acyl = (i: number) => m.atoms[i].label === "P" || (m.atoms[i].label === "C" && m.bonds.some((b) => b.type === 2 && b.atoms.includes(i) && m.atoms[b.atoms[0] === i ? b.atoms[1] : b.atoms[0]].label === "O"));
  for (const b of m.bonds) {
    if (group.has(b.atoms[0]) === group.has(b.atoms[1])) continue;
    const e = group.has(b.atoms[0]) ? 0 : 1;
    caps.set(b.atoms[1 - e], acyl(b.atoms[e]) ? "O" : "H");
  }
  const keep = [...group, ...caps.keys()].sort((p, q) => p - q);
  const capped = pickAtoms({ ...m, atoms: m.atoms.map((a, i) => (caps.has(i) ? { label: caps.get(i)!, location: a.location } : a)) }, keep);
  // Kept by its atoms and bonds where they are (a chain's labels are mostly the same few residues).
  const o = capped.atoms[0]?.location ?? [0, 0], r = (v: number) => Math.round(v * 1000);
  const key = JSON.stringify([capped.atoms.map((a) => [a.label, a.charge, a.isotope, a.radical, r(a.location[0] - o[0]), r(a.location[1] - o[1])]), capped.bonds.map((b) => [b.atoms, b.type, b.stereo])]);
  const seen = residueInchis.get(inchi) ?? residueInchis.set(inchi, new Map()).get(inchi)!;
  if (seen.size > 2000) seen.clear();
  const want = seen.has(key) ? seen.get(key) : seen.set(key, inchi(capped)).get(key);
  if (!want) return undefined;
  const same = (smiles: string | undefined) => !!smiles && (refs.has(smiles) ? refs : refs.set(smiles, inchi(smiles))).get(smiles) === want;
  const elements = elementKey([...group].map((i) => m.atoms[i]));
  return (plain ? residueTexts().find(([smiles]) => same(smiles))?.[1] : undefined) ?? more.find((x) => x.key === elements && same(x.smiles()))?.label;
}
// Each residue's InChI, read once (Copy As HELM reads every residue of a chain), and each drawn residue's.
const refs = new Map<string, string | undefined>(), residueInchis = new WeakMap<object, Map<string, string | undefined>>();
export function residueTexts(): [smiles: string, text: string][] {
  return [
    ...Object.keys(CODES).map((c): [string, string] => [`${residueSmiles(c)}O`, CODES[c]]),
    ...["A", "C", "G", "U"].map((b): [string, string] => [unit(b, false), `r${b}`]),
    ...["A", "C", "G", "T"].map((b): [string, string] => [unit(b, true), `d${b}`]),
    [`O${PHOSPHATE}O`, "P"],
  ];
}

// A residue label renamed to another residue of its kind (Ala to Gly, rA to rC): the new residue's atoms, and each bond
// keeps its side. A peptide residue's bonds go to its N and its C=O; a nucleotide's to its 5'-O (beside the ring's CH2)
// and its 3'-O; a phosphate's to its P. Undefined for any other name.
// A D amino acid's label (D-Phe) gives its code: the HELM library's D set, each with one stereocentre, its α carbon.
const dCode = (t: string) => (t.startsWith("D-") ? D_CODES.find((k) => CODES[k] === t.slice(2)) : undefined);
const residueKind = (t: string) => (Object.values(CODES).includes(t) || dCode(t) ? "aa" : /^[rd][ACGUT]$/.test(t) ? "nt" : t === "P" ? "p" : undefined);
function innerOf(t: string, parse: (smiles: string) => Mol): { mol: Mol; in: number; out: number } | undefined {
  const d = dCode(t), code = d ?? Object.keys(CODES).find((k) => CODES[k] === t);
  if (code) {
    const smiles = residueSmiles(code), mol = parse(d ? smiles.replace(/@@?/g, (x) => (x === "@@" ? "@" : "@@")) : smiles);
    return { mol, in: 0, out: mol.atoms.length - 2 };
  }
  if (/^[rd][ACGUT]$/.test(t)) { const mol = parse(unit(t[1], t[0] === "d")); return { mol, in: 0, out: mol.atoms.length - 1 }; }
  if (t === "P") return { mol: parse(PHOSPHATE), in: 0, out: 0 };
  return undefined;
}
// Which side a kept atom bonds on: "in" for a residue's N or a nucleotide's 5'-O (its carbon has no other bond).
function sideOf(inner: Mol, k: number): "in" | "out" {
  const a = inner.atoms[k], near = (j: number) => inner.bonds.filter((b) => b.atoms.includes(j)).map((b) => b.atoms[0] === j ? b.atoms[1] : b.atoms[0]);
  if (a.label === "N") return "in";
  if (a.label === "O") return near(k).some((c) => inner.atoms[c].label === "C" && near(c).length === 2) ? "in" : "out";
  return k === 0 ? "in" : "out";
}
// An amino acid residue's backbone N and C=O carbon among its kept atoms: an N bonded to a carbon bonded to a C=O carbon.
function backboneOf(inner: Mol): [number, number] | undefined {
  const near = (j: number) => inner.bonds.filter((b) => b.atoms.includes(j)).map((b) => (b.atoms[0] === j ? b.atoms[1] : b.atoms[0]));
  const acyl = (j: number) => inner.atoms[j].label === "C" && inner.bonds.some((b) => b.type === 2 && b.atoms.includes(j) && inner.atoms[b.atoms[0] === j ? b.atoms[1] : b.atoms[0]].label === "O");
  for (const [n, x] of inner.atoms.entries()) {
    if (x.label !== "N") continue;
    for (const c of near(n)) { const o = inner.atoms[c].label === "C" ? near(c).find((j) => j !== n && acyl(j)) : undefined; if (o !== undefined) return [n, o]; }
  }
  return undefined;
}
// A residue joined by its side chain (a disulfide's Cys) keeps its name: a new residue would put the link on another
// atom. The problem says so, as ChemDraw refuses to replace a monomer by one with fewer links.
export function relabel(m: Mol, i: number, text: string, parse: (smiles: string) => Mol): Mol | { problem: string } | undefined {
  const a = m.atoms[i], kind = residueKind(text);
  if (!a.inner || !a.text || !kind || kind !== residueKind(a.text)) return undefined;
  if (kind === "aa") {
    const bb = backboneOf(a.inner);
    if (bb && m.bonds.some((b) => b.ports && b.atoms.some((k, e) => k === i && b.ports![e] >= 0 && !bb.includes(b.ports![e])))) return { problem: `${a.text} is joined by its side chain. To give it another name, delete that bond first.` };
  }
  let made: ReturnType<typeof innerOf>;
  try { made = innerOf(text, parse); } catch { return undefined; }
  if (!made) return undefined;
  for (const p of [made.in, made.out]) { const { implicitHCount: _, ...x } = made.mol.atoms[p]; made.mol.atoms[p] = x; }
  const old = a.inner;
  const bonds = m.bonds.map((b) => {
    if (!b.ports || !b.atoms.includes(i)) return b;
    const bb = kind === "aa" ? backboneOf(old) : undefined, side = (p: number) => (bb ? (p === bb[0] ? "in" : "out") : sideOf(old, p));
    const ports = b.atoms.map((k, e) => (k !== i ? b.ports![e] : b.ports![e] < 0 ? -1 : side(b.ports![e]) === "in" ? made!.in : made!.out)) as [number, number];
    return { ...b, ports };
  });
  return { ...m, bonds, atoms: m.atoms.map((x, k) => (k === i ? { ...x, text, inner: made!.mol } : x)) };
}

// Rows of residue labels, 2.6 bond lengths apart, so about a bond length shows between labels. A chain with no links:
// rows of 10, the next row back the other way, as 1.1.2 drew them. A chain with links, of up to 40 labels: one row, each
// link a bracket above it (one that crosses another below), the link that closes a ring below. Two chains joined by
// links: one row above the other, moved along so their first link is upright, links between them straight and links in
// each on its outer side. Anything else: each chain in rows of 10, the rows of one chain under the other's, links
// straight. chains: each chain's labels in order (from its N or 5' end); undefined to find them (labelChains).
export const ROW = 10, STEP = 2.6, ROW_GAP = 1.8, ONE_ROW = 40, LINKED_GAP = 3.4;
export const rowAt = (k: number): P => { const row = Math.floor(k / ROW); return [(row % 2 ? ROW - 1 - (k % ROW) : k % ROW) * STEP, -row * ROW_GAP]; };
export function labelLayout(m: Mol, frag: number[], given?: number[][], along?: Set<number>, nodeOf?: Map<number, number>): { at: Map<number, P>; routes: Map<number, number> } | undefined {
  const chains = given ?? labelChains(m, frag);
  if (!chains?.length) return undefined;
  const inside = new Set(frag), on = new Map<number, [number, number]>();
  chains.forEach((ch, c) => ch.forEach((i, k) => on.set(i, [c, k])));
  // A link's ends as places in the rows: an atom of a residue drawn in full is at its residue's place.
  const node = (i: number) => nodeOf?.get(i) ?? i;
  const backbone = (b: Mol["bonds"][number], k: number) => { if (along) return along.has(k); const p = on.get(b.atoms[0]), q = on.get(b.atoms[1]); return !!p && !!q && p[0] === q[0] && Math.abs(p[1] - q[1]) === 1; };
  const links = m.bonds.flatMap((b, k) => (inside.has(b.atoms[0]) && on.has(node(b.atoms[0])) && on.has(node(b.atoms[1])) && node(b.atoms[0]) !== node(b.atoms[1]) && !backbone(b, k) ? [k] : []));
  const ends = (k: number) => m.bonds[k].atoms.map(node);
  const at = new Map<number, P>(), routes = new Map<number, number>();
  const rows = () => { let y = 0; for (const ch of chains) { ch.forEach((i, k) => { const [x, dy] = rowAt(k); at.set(i, [x, y + dy]); }); y += rowAt(ch.length - 1)[1] - 2 * ROW_GAP; } };
  if (!links.length || chains.length > 2 || chains.some((ch) => ch.length > ONE_ROW)) { rows(); return { at, routes }; }
  // One row each; the second under the first, moved along so the first link between them is upright.
  const between = links.filter((k) => on.get(ends(k)[0])![0] !== on.get(ends(k)[1])![0]);
  let shift = 0;
  if (chains.length === 2) {
    if (!between.length) { rows(); return { at, routes }; }
    const first = [...between].sort((p, q) => Math.min(...ends(p).map((i) => on.get(i)![0] ? Infinity : on.get(i)![1])) - Math.min(...ends(q).map((i) => on.get(i)![0] ? Infinity : on.get(i)![1])))[0];
    const [p, q] = ends(first).map((i) => on.get(i)!).sort((x, y) => x[0] - y[0]);
    shift = (p[1] - q[1]) * STEP;
  }
  chains.forEach((ch, c) => ch.forEach((i, k) => at.set(i, [k * STEP + (c ? shift : 0), c ? -LINKED_GAP : 0])));
  // Brackets: each link in one row, inner ones first, above (the second chain's below), one that crosses a link
  // already above goes below; the link that closes a ring (its first label to its last) below. Each stands above the
  // brackets inside it.
  const inRow = links.filter((k) => !between.includes(k)), span = (k: number) => ends(k).map((i) => on.get(i)![1]).sort((x, y) => x - y);
  const up = new Map<number, boolean>();
  for (const k of [...inRow].sort((p, q) => span(p)[0] - span(q)[0] || span(q)[1] - span(p)[1])) {
    const [lo, hi] = span(k), c = on.get(ends(k)[0])![0], ch = chains[c];
    const closing = lo === 0 && hi === ch.length - 1 && ch.length > 2;
    const crossed = [...up].find(([j]) => { const [a, b] = span(j); return on.get(ends(j)[0])![0] === c && ((a < lo && lo < b && b < hi) || (lo < a && a < hi && hi < b)); });
    up.set(k, chains.length === 2 ? c === 0 : closing ? false : crossed ? !crossed[1] : true);
  }
  for (const k of [...inRow].sort((p, q) => (span(p)[1] - span(p)[0]) - (span(q)[1] - span(q)[0]))) {
    const [lo, hi] = span(k), side = up.get(k)!, c = on.get(ends(k)[0])![0];
    const inside2 = inRow.filter((j) => j !== k && up.get(j) === side && on.get(ends(j)[0])![0] === c && span(j)[0] >= lo && span(j)[1] <= hi && routes.has(j));
    const h = Math.max(0.8, ...inside2.map((j) => Math.abs(routes.get(j)!) + 0.5));
    const [a, b] = ends(k), left = at.get(a)![0] <= at.get(b)![0];
    routes.set(k, (side === left ? 1 : -1) * h);
  }
  return { at, routes };
}

// A residue label's kept atom's part in its chain: 1 for the atom the chain comes in at (a peptide's N, a nucleotide's
// 5'-O), 2 for the one it goes on from (a peptide's C=O, a nucleotide's 3'-O), 3 for a side chain's (a link), or 0
// where either could be (a phosphate's P).
export function portRole(inner: Mol, k: number): 0 | 1 | 2 | 3 {
  const near = (j: number) => inner.bonds.flatMap((b) => (b.atoms[0] === j ? [b.atoms[1]] : b.atoms[1] === j ? [b.atoms[0]] : []));
  const el = (j: number) => inner.atoms[j]?.label, acyl = (j: number) => el(j) === "C" && inner.bonds.some((b) => b.type === 2 && b.atoms.includes(j) && el(b.atoms[0] === j ? b.atoms[1] : b.atoms[0]) === "O");
  const a = el(k);
  if (a === "P") return 0;
  if (a === "N" && near(k).some((c) => el(c) === "C" && !acyl(c) && near(c).some(acyl))) return 1;
  if (acyl(k) && near(k).some((c) => el(c) === "C" && near(c).some((n) => el(n) === "N" && n !== k))) return 2;
  if (a === "O") {
    const c = near(k).find((j) => el(j) === "C");
    if (c !== undefined && near(c).length === 2 && near(c).some((j) => j !== k && el(j) === "C" && near(j).some((o) => el(o) === "O" && near(o).length === 2))) return 1;
    if (c !== undefined && near(c).some((j) => el(j) === "C") && near(c).filter((j) => el(j) === "C").length === 2 && !acyl(c)) return 2;
  }
  return 3;
}
// The chains of residue labels in a structure (frag), each in order from its N or 5' end, or undefined when it is not
// one: every atom a label, each bond between two of them along a chain (a residue's C=O to the next one's N, an end
// label) or a link. A ring of residues is cut at its bracket, else before its label with the lowest number.
export function labelChains(m: Mol, frag: number[]): number[][] | undefined {
  if (frag.length < 2) return undefined;
  const isEnd = (i: number) => !m.atoms[i].inner && ((m.atoms[i].label === "H" && !m.atoms[i].text) || ["OH", "Ac", "NH2"].includes(m.atoms[i].text ?? ""));
  if (frag.some((i) => !isEnd(i) && !(m.atoms[i].text && m.atoms[i].inner?.atoms.length))) return undefined;
  const inside = new Set(frag), next = new Map<number, number>(), prev = new Map<number, number>(), bonds: number[] = [];
  const role = (i: number, port: number | undefined): number => (isEnd(i) ? -1 : port === undefined || port < 0 ? 3 : portRole(m.atoms[i].inner!, port));
  for (const [k, b] of m.bonds.entries()) {
    if (!inside.has(b.atoms[0])) continue;
    bonds.push(k);
    const [p, q] = b.atoms, rp = role(p, b.ports?.[0]), rq = role(q, b.ports?.[1]);
    // Along the chain: from a C=O side (2, or an end label or a P) to an N side (1, or an end label or a P).
    const out = (r: number) => r === 2 || r === 0 || r === -1, into = (r: number) => r === 1 || r === 0 || r === -1;
    const [from, to] = out(rp) && into(rq) && !(rp === -1 && rq === -1) && !(rp === 0 && rq === 0) ? (rq === -1 && rp !== -1 && isEnd(q) && ["H", "Ac"].includes(m.atoms[q].text ?? "H") ? [q, p] : [p, q]) : out(rq) && into(rp) ? [q, p] : [undefined, undefined];
    if (from === undefined || to === undefined || next.has(from) || prev.has(to)) continue;
    next.set(from, to);
    prev.set(to, from);
  }
  const chains: number[][] = [], seen = new Set<number>();
  for (const i of frag) {
    if (prev.has(i) || seen.has(i)) continue;
    const ch: number[] = [];
    for (let v: number | undefined = i; v !== undefined && !seen.has(v); v = next.get(v)) { seen.add(v); ch.push(v); }
    chains.push(ch);
  }
  // Rings: cut at the bracketed bond, else before the lowest label.
  for (const i of frag) {
    if (seen.has(i)) continue;
    const ring: number[] = [];
    for (let v: number | undefined = i; v !== undefined && !seen.has(v); v = next.get(v)) { seen.add(v); ring.push(v); }
    const routed = ring.findIndex((x) => m.bonds.some((b) => b.route && b.atoms.includes(x) && b.atoms.includes(next.get(x)!)));
    const first = routed >= 0 ? (routed + 1) % ring.length : ring.indexOf(Math.min(...ring));
    chains.push([...ring.slice(first), ...ring.slice(0, first)]);
  }
  // A chain of one label is a residue linked to another chain (or a branch): only chains of two or more are rows.
  return chains.every((ch) => ch.length >= 1) && chains.some((ch) => ch.length >= 2) ? chains : undefined;
}
