// Atom labels beyond a single element: abbreviations (Ph, Boc), condensed formulas (OMe, CO2Et, NHBoc).
// A label is read as units: an element or group, then an optional count (a subscript), or a bracketed part.
// Drawn left to right from the attached atom; when the bond comes from the right, the units are reversed
// (OMe becomes MeO, CO2Et becomes EtO2C), as ChemDraw does in its ACS 1996 output.

import { condensedLabel, condensedRoot } from "./condensed.ts";
import { builtInNickname, NICKNAME_MOST, onNicknamesChange, ownNickname } from "./nicknames.ts";

const SYMBOLS = (
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr " +
  "Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt " +
  "Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og D T"
).split(" "); // D and T: deuterium and tritium, hydrogen's isotopes written as elements
export const ELEMENTS = new Set(SYMBOLS);

// Groups, as SMILES whose first atom is the attachment point. Names a chemist types as one word.
export const GROUPS: Record<string, string> = {
  Me: "C", Et: "CC", Pr: "CCC", iPr: "C(C)C", nPr: "CCC", Bu: "CCCC", nBu: "CCCC", iBu: "CC(C)C", sBu: "C(C)CC", tBu: "C(C)(C)C",
  Oct: "CCCCCCCC", Vinyl: "C=C", Allyl: "CC=C", All: "CC=C",
  Ph: "c1ccccc1", Bn: "Cc1ccccc1", Ac: "C(C)=O", Bz: "C(=O)c1ccccc1", Piv: "C(=O)C(C)(C)C",
  Boc: "C(=O)OC(C)(C)C", Cbz: "C(=O)OCc1ccccc1", Fmoc: "C(=O)OCC1c2ccccc2-c2ccccc21", Alloc: "C(=O)OCC=C", Troc: "C(=O)OCC(Cl)(Cl)Cl",
  Ts: "S(=O)(=O)c1ccc(C)cc1", Ms: "S(C)(=O)=O", Tf: "S(=O)(=O)C(F)(F)F", Ns: "S(=O)(=O)c1ccc([N+](=O)[O-])cc1",
  TMS: "[Si](C)(C)C", TES: "[Si](CC)(CC)CC", TBS: "[Si](C)(C)C(C)(C)C", TBDMS: "[Si](C)(C)C(C)(C)C",
  TIPS: "[Si](C(C)C)(C(C)C)C(C)C", TBDPS: "[Si](c1ccccc1)(c1ccccc1)C(C)(C)C",
  PMB: "Cc1ccc(OC)cc1", PMP: "c1ccc(OC)cc1", MOM: "COC", THP: "C1CCCCO1", Tr: "C(c1ccccc1)(c1ccccc1)c1ccccc1",
  Cp: "C1C=CC=C1", Cy: "C1CCCCC1", Mes: "c1c(C)cc(C)cc1C", Tol: "c1ccc(C)cc1", "9-BBN": "B1C2CCCC1CCC2", BBN: "B1C2CCCC1CCC2",
};
// Every way a group's name is spelt, each with the name above that it is read as: the name itself; a prefix n, i, s
// or t with a hyphen after it (t-Bu, i-Pr); n, with or without a hyphen, before a straight chain (n-Bu, nOct); and a
// name that is a word with a small first letter (allyl).
const SPELT: Record<string, string> = {};
for (const [g, smiles] of Object.entries(GROUPS)) {
  SPELT[g] = g;
  if (/^[nist][A-Z]/.test(g)) SPELT[`${g[0]}-${g.slice(1)}`] = g;
  if (/^C{3,}$/.test(smiles) && /^[A-Z]/.test(g)) SPELT[`n${g}`] = SPELT[`n-${g}`] = g;
  if (/yl$/.test(g)) SPELT[g.toLowerCase()] = g;
}
// Diolates that take both of a boron's bonds, each as the chain that closes a ring on the boron (Bpin, B(pin), pinB).
const DIOLATES: Record<string, string> = { pin: "OC(C)(C)C(C)(C)O" };
// The names a label is split by, longest first, by their first character.
const NAMES: Record<string, string[]> = {};
for (const g of [...Object.keys(SPELT), ...Object.keys(DIOLATES)].sort((a, b) => b.length - a.length)) (NAMES[g[0]] ??= []).push(g);
// The name at the start of rest. A small letter straight after it starts the next name: Me is a name in MeiPr and
// none in Met. One name is looked at ahead, and the text is not copied, so a long word costs no more than its length.
const named = (rest: string): string | undefined => NAMES[rest[0]]?.find((g) => {
  const next = rest[g.length];
  return rest.startsWith(g) && (!(next >= "a" && next <= "z") || !!NAMES[next]?.some((h) => rest.startsWith(h, g.length)));
});

// ChemDraw's generic labels (Insert Generic Label): A, M, Q, X and R, then the 38 Reaxys classes, each with what it
// stands for. Y, and R with a number (R1 to R99) and primes (R', R''), are generic too. A generic label is a query
// atom: it is never read as atoms (CYC is not C–Y–C).
export const GENERICS: [string, string][] = [
  ["A", "Any atom but H"], ["M", "Metal"], ["Q", "Any atom but C or H"], ["X", "Halogen"], ["R", "Any group"],
  ["AH", "Any atom or H"], ["MH", "Metal or H"], ["QH", "Any atom but C, or H"], ["XH", "Halogen or H"], ["G", "Any group"], ["GH", "Any group or H"],
  ["G*", "Any group, closes rings"], ["GH*", "Any group or H, closes rings"], ["ACY", "Acyclic"], ["ACH", "Acyclic or H"],
  ["ABC", "Carbacyclic"], ["ABH", "Carbacyclic or H"], ["AYL", "Alkynyl"], ["AYH", "Alkynyl or H"], ["ALK", "Alkyl"], ["ALH", "Alkyl or H"],
  ["AEL", "Alkenyl"], ["AEH", "Alkenyl or H"], ["AHC", "Hetero acyclic"], ["AHH", "Hetero acyclic or H"], ["AOX", "Alkoxy"], ["AOH", "Alkoxy or H"],
  ["CYC", "Cyclic"], ["CYH", "Cyclic or H"], ["CBC", "Carbocyclic"], ["CBH", "Carbocyclic or H"], ["ARY", "Aryl"], ["ARH", "Aryl or H"],
  ["CAL", "Cycloalkyl"], ["CAH", "Cycloalkyl or H"], ["CEL", "Cycloalkenyl"], ["CEH", "Cycloalkenyl or H"], ["CHC", "Heterocyclic"], ["CHH", "Heterocyclic or H"],
  ["HAR", "Heteroaryl"], ["HAH", "Heteroaryl or H"], ["CXX", "No carbon"], ["CXH", "No carbon or H"],
];
const GENERIC_NAMES = new Set([...GENERICS.map(([g]) => g), "Y"]);
export const isGeneric = (label: string) => GENERIC_NAMES.has(label) || /^R([1-9]\d?)?'{0,2}$/.test(label);
// A label that stands in for a group or an atom and is read as no atoms: a generic label, or one of the others chemists
// write, which are no query atoms (an aryl, heteroaryl or alkyl group, a ligand, an electrophile, a nucleophile, a
// halogen, and withdrawing, donating, protecting, leaving and directing groups), with a number or primes as R takes
// (Ar1, L'); and the generic metal with its oxidation state as an element takes one, in a bracket or not (M(IV), MIV).
// Ar is never argon in a written label, and it is no phenyl: no one knows what is on the ring.
const OX = "0|I{1,3}|IV|VI{0,3}|IX|X";
const STAND_IN = new RegExp(`^(?:(?:Ar|Het|HetAr|Aryl|Alkyl|L|Ln|E|Nu|Hal|EWG|EDG|PG|LG|DG)(?:[1-9]\\d?)?'{0,2}|M(?:\\((?:${OX})\\)|${OX}))$`);
export const standsIn = (label: string) => isGeneric(label) || STAND_IN.test(label);

// A phenyl written with what is on it and where (4-ClC6H4, p-MeOC6H4, 4-ClPh, 3,5-(CF3)2C6H3), and n- before a
// formula, which says that its chain is straight (n-C8H17).
const RING = /^(\d(?:,\d)*|[omp])-(.+?)-?(?:Ph|C6H([2-4]))$/, STRAIGHT = /^n-C\d/;
// Groups written as formulas that have a name (labelSmiles), and the straight chains that have one.
const WRITTEN: Record<string, string> = { C6H5: "Ph", C6H11: "Cy", "i-C3H7": "iPr", "i-C4H9": "iBu", "s-C4H9": "sBu", "t-C4H9": "tBu" };
const CHAINS: Record<number, string> = { 2: "Et", 3: "Pr", 4: "Bu", 8: "Oct" };

// A bracket is a part in brackets, or a label that is kept whole (4-ClC6H4): pieces draws its counts as subscripts.
export type Unit = { text: string; count?: string; kind: "element" | "group" | "bracket" | "other" };

// Splits a label into units. Groups win over elements where both fit (so "Bu" is butyl, not boron-u). A label is
// split once and kept (units are read on every frame): callers must not change what comes back.
const split = new Map<string, Unit[]>();
export function units(label: string): Unit[] {
  let out = split.get(label);
  if (!out) {
    if (split.size >= 2000) split.clear();
    split.set(label, (out = unitsOf(label)));
  }
  return out;
}
// The next element or group at the start of rest: a group, a two-letter element, or one character.
function token(rest: string): Unit {
  const group = named(rest);
  const two = rest.slice(0, 2), text = group ?? (ELEMENTS.has(two) && /^[A-Z][a-z]$/.test(two) ? two : rest[0]);
  return { text, kind: group ? "group" : ELEMENTS.has(text) && text !== "Ar" ? "element" : "other" };
}
// A word (capitals and the small letters after them) that is not all elements and groups is an abbreviation Octet
// does not know (DMT, SEM, Phth): one unit, so a label read right to left never reverses it letter by letter (ODMT
// reads DMTO, not TMDO). R, X and Ar are read as groups (OR, CH2X, OAr). The word's first element (not H, D or T),
// with an H after it, is a unit of its own when what follows is an abbreviation: three letters or more, a capital and
// a small letter (Nf), or two capitals after the H (NHPG reads PGHN). Else the whole word is one unit (SEM, BOM, PG).
// A stand-in is one unit (Alkyl in CO2Alkyl), and so is one after the word's first atom or stand-in (OPG, HNu, MLn).
// Undefined for a word that reads as elements and groups.
function word(w: string): Unit[] | undefined {
  const ts: Unit[] = [];
  for (let k = 0; k < w.length; ) { const t = token(w.slice(k)); ts.push(t); k += t.text.length; }
  if (!ts.some((t) => t.kind === "other" && !/^(?:R|X|Ar)$/.test(t.text))) return undefined;
  if (standsIn(w)) return [{ text: w, kind: "other" }];
  const lead = ts[0].text, after = w.slice(lead.length);
  if (((ts[0].kind === "element" && !/^[DT]$/.test(lead)) || standsIn(lead)) && standsIn(after)) return [ts[0], { text: after, kind: "other" }];
  const head = ts[0].kind === "element" && !/^[HDT]$/.test(ts[0].text) ? [ts[0], ...(ts[1]?.text === "H" ? [ts[1]] : [])] : [];
  const rest = w.slice(head.reduce((n, t) => n + t.text.length, 0));
  const ok = head.length && (rest.length >= 3 || /^[A-Z][a-z]$/.test(rest) || (head.length === 2 && /^[A-Z]{2}$/.test(rest)));
  return ok ? [...head, { text: rest, kind: "other" }] : [{ text: w, kind: "other" }];
}
function unitsOf(label: string): Unit[] {
  // A generic label (ALK, CYC, Q) or another stand-in (Alkyl, Het) is one unit: it is never read as atoms.
  if (standsIn(label) && !/\d/.test(label)) return [{ text: label, kind: "other" }];
  // So is a phenyl with its positions, and n- before a formula: it is drawn as it is written on either side of its
  // bond (a label drawn from the right has its units reversed).
  if ((label[1] === "-" || label[1] === ",") && (RING.test(label) || STRAIGHT.test(label))) return [{ text: label, kind: "bracket" }];
  const out: Unit[] = [];
  let i = 0;
  const digits = () => { const m = /^\d+/.exec(label.slice(i)); if (m) i += m[0].length; return m?.[0]; };
  while (i < label.length) {
    let rest = label.slice(i);
    if (rest[0] === "(") {
      const close = rest.indexOf(")");
      const inner = close > 0 ? rest.slice(0, close + 1) : rest;
      i += inner.length;
      out.push({ text: inner, count: digits(), kind: "bracket" });
      continue;
    }
    let w = /^[A-Z]/.test(rest) && !/[A-Z]/.test(label[i - 1] ?? "") ? /^[A-Z]+[a-z]*/.exec(rest)![0] : "", unknown = w ? word(w) : undefined;
    // A group that starts with a small letter ends the word before it (OtBu, NHiPr, Oallyl): when the word reads no
    // other way (SnBu3 is tin), and always when the group has its hyphen (Os-Bu is O and s-Bu: osmium has no hyphen).
    for (let k = 1; k < w.length; k++) {
      const g = /[a-z]/.test(w[k]) && named(rest.slice(k));
      if (g && (unknown || g[1] === "-")) { rest = w = w.slice(0, k); unknown = word(w); break; }
    }
    if (unknown) {
      i += w.length;
      out.push(...unknown.slice(0, -1), { ...unknown[unknown.length - 1], count: digits() });
      continue;
    }
    const t = token(rest);
    i += t.text.length;
    out.push({ ...t, count: digits() });
  }
  return out;
}

// How a unit is drawn (issue 44): the counts inside a bracket are subscripts as in running text (formulaRuns), so
// N(CH3)2 and C(O)OCH3 draw as ChemDraw draws them from CDXML. A bracket becomes pieces, each with its count; their
// text and counts, in order, are the unit's. Other units are drawn as they are.
export function pieces(u: Unit): Unit[] {
  if (u.kind !== "bracket") return [u];
  const out: Unit[] = [];
  for (const r of formulaRuns(u.text)) {
    const last = out[out.length - 1];
    if (r.sub && last) last.count = r.text;
    else out.push(r.sub ? { text: "", count: r.text, kind: "bracket" } : { text: r.text, kind: "bracket" });
  }
  const last = out[out.length - 1];
  if (u.count && last && !last.count) last.count = u.count;
  else if (u.count) out.push({ text: "", count: u.count, kind: "bracket" });
  return out;
}

// The element a label attaches through: the first element of the first unit (O for OMe, C for CO2Et).
// Undefined for a label that starts with a group (Ph, Boc).
export function anchorElement(label: string): string | undefined {
  const first = units(label)[0];
  return first?.kind === "element" ? first.text : undefined;
}

// A label is a plain element when it is one element symbol and nothing else.
export const isElement = (label: string) => ELEMENTS.has(label);
// An element with its oxidation state written after it, Os(II), Fe(0): the element and the state.
const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"], WRITTEN_OX = new RegExp(`^([A-Z][a-z]?)\\((${OX})\\)$`);
export function writtenOxidation(label: string): { el: string; ox: number } | undefined {
  const x = WRITTEN_OX.exec(label);
  return x && ELEMENTS.has(x[1]) ? { el: x[1], ox: ROMAN.indexOf(x[2]) } : undefined;
}

// A written label as chemistry reads it (issue 44). Characters set in superscript or subscript by hand are drawn
// that way but not read, except a mass number before an element (13CH3), a charge (NH4+) and a count (CH3). A Roman
// numeral in superscript after a lone element is its oxidation state, read as Fe(III). A label all in a script is
// read as it is. runs: the label's runs (their text must join to the label's).
export function chemicalText(text: string | undefined, runs?: { text: string; script?: "sub" | "super" }[]): string | undefined {
  if (!text || !runs?.some((r) => r.script) || runs.map((r) => r.text).join("") !== text) return text;
  let out = "", roman = "";
  runs.forEach((r, k) => {
    const next = runs.slice(k + 1).map((x) => x.text).join("");
    if (!r.script || /^\d+$/.test(r.text) && (r.script === "sub" || /^[A-Z]/.test(next)) || (r.script === "super" && /^(\d*[+\-−]|[+\-−]\d*)$/.test(r.text))) out += r.text;
    else if (r.script === "super" && k === runs.length - 1 && ROMAN.includes(r.text)) roman = r.text;
  });
  if (!out) return text;
  return roman && ELEMENTS.has(out) ? `${out}(${roman})` : out;
}

// Formulas whose bonding a left-to-right reading gets wrong (CN is a nitrile, where the reading makes an amine). NC
// is an isocyanide, its bond on N, as every label is read from its attachment atom: the nitrile written from the left
// is the AI apps' reading of NC for a * (mcp.ts read). BF3K is the salt: a borate and its potassium ion.
const FORMULAS: Record<string, string> = {
  CN: "C#N", NC: "[N+]#[C-]", CHO: "C=O", CO2H: "C(=O)O", COOH: "C(=O)O", CO2: "C(=O)[O-]", NO2: "[N+](=O)[O-]", NO: "N=O",
  N3: "N=[N+]=[N-]", SO3H: "S(=O)(=O)O", SO2: "S(=O)=O", SO2Ph: "S(=O)(=O)c1ccccc1", COMe: "C(C)=O", COPh: "C(=O)c1ccccc1",
  CONH2: "C(N)=O", OCN: "OC#N", SCN: "SC#N", NCO: "N=C=O", NCS: "N=C=S", CHN2: "C=[N+]=[N-]", PO3H2: "P(=O)(O)O", BF3K: "[B-](F)(F)F.[K+]",
};
// Atoms that bond once: one written first has the rest of its label after it (H3C, F3C, D3C, DO). Tritium is not among
// them: a label that starts with T is an abbreviation (T3P, TS, THF).
const ONCE = /^(?:H|F|Cl|Br|I|D)$/;
// A label written from the left (Et3N, MeO, pinB, H2N, F3C, DO, t-BuNH, (EtO)2(O)P) is read from its end. It ends with
// one heavy atom, and the hydrogens on that atom may come after it. It starts with a group, with a bracket that holds
// a group or is itself written from the left, or with an atom that bonds once: counted, or with only an atom that
// bonds more than once after it (DO; DCl has no end to read from).
export function fromEnd(us: Unit[]): boolean {
  const n = us.length - (us[us.length - 1]?.text === "H" ? 1 : 0), first = us[0], last = us[n - 1];
  if (n < 2 || last.kind !== "element" || last.text === "H" || last.count) return false;
  if (first.kind === "bracket") { const inner = units(first.text.slice(1, -1)); return inner.length === 1 ? inner[0].kind === "group" : fromEnd(inner); }
  return first.kind === "group" || (ONCE.test(first.text) && (!!first.count || (us.length === 2 && !ONCE.test(last.text))));
}
// Such a label's units from its attachment atom, given them in reverse: that atom, the hydrogens written after it,
// then the rest (t-BuNH as NHt-Bu, BocHN as NHBoc).
const fromAtom = (back: Unit[]) => (back[0].text === "H" ? [back[1], back[0], ...back.slice(2)] : back);
const written = (us: Unit[]) => us.map((u) => u.text + (u.count ?? "")).join("");
// Atoms that take more than one bond, so a label written from the left can end in one and be bonded there.
const MANY = /^(?:C|N|O|S|P|Si|B|Se)$/;
const plainAtom = (u: Unit | undefined) => u?.kind === "element" && MANY.test(u.text) && !u.count;
// A label written from the left, bond on its last atom, that the other readings get wrong: it starts with an atom that
// bonds once (H, F, Cl, Br: HOH2C, ClO2S, Cl3CC(O)) and ends in an atom that takes more, with only hydrogens or a
// bracket after it; or it starts with an atom and ends in a C with its hydrogens written before it, or an N with one
// (NCH2C, IH2C, OHCHN; CH2N is methyleneamino, read as it is); or it starts with a group and ends in a carbonyl written CO after a carbon (EtO2CCO).
function fromLeft(us: Unit[]): boolean {
  if (us.length < 2) return false;
  let end = us.length - 1;
  while (end > 0 && (us[end].text === "H" || us[end].kind === "bracket")) end--;
  const first = us[0], last = us[end], tail = us.slice(end + 1);
  if (/^(?:H|F|Cl|Br)$/.test(first.text) && first.kind === "element" && end > 0 && plainAtom(last) && (tail.every((u) => u.text === "H") || (tail.length === 1 && tail[0].kind === "bracket"))) return true;
  const h = us[end - 1];
  if (end === us.length - 1 && end > 1 && first.kind === "element" && h?.text === "H" && (last.text === "C" || (last.text === "N" && !h.count)) && plainAtom(last)) return true;
  const n = us.length;
  return n >= 4 && us[n - 1].text === "O" && !us[n - 1].count && us[n - 2].text === "C" && !us[n - 2].count && us[n - 3].text === "C" && (us[0].kind === "group" || us[0].kind === "bracket");
}
// The label a label written from the left is read as (CH2OH for HOH2C), when fromLeft says it is one and that reads.
export function turnedLabel(label: string, us = units(label)): string | undefined {
  if (!fromLeft(us)) return undefined;
  for (const toNext of [true, false]) {
    const turned = mirrored(us, toNext);
    if (turned && turned !== label && labelSmiles(turned)) return turned;
  }
  return undefined;
}
// Such a label written from its attachment atom: its atoms in reverse, each with the hydrogens written before it
// (toNext) or after it, and the brackets after it; a carbonyl written CO at its end stays one (C(O)), but after three
// halogens (F3CO is trifluoromethoxy). HOH2C is CH2OH, OHCHN NHCHO, H2NCO C(O)NH2, Cl3CC(O) C(O)CCl3, EtO2CCO COCO2Et.
function mirrored(us: Unit[], toNext: boolean): string | undefined {
  const groups: { head: Unit; more: Unit[] }[] = [];
  let waiting: Unit[] = [];
  for (const u of us) {
    const last = groups[groups.length - 1];
    if (u.kind === "element" && u.text === "H" && (toNext || !last)) waiting.push(u);
    else if (u.kind === "bracket" || (u.kind === "element" && u.text === "H")) { if (!last) return undefined; last.more.push(u); }
    else { groups.push({ head: u, more: waiting }); waiting = []; }
  }
  if (!groups.length) return undefined;
  groups[groups.length - 1].more.push(...waiting);
  // A C written with nothing on it but one H, then an O with nothing on it, is a carbonyl (CO of H2NCO, H3CCONH,
  // EtO2CCO, HCOO), but
  // after three halogens (F3CO is trifluoromethoxy) or in a label that starts with a group and has no C before it
  // (MeO2CO is methoxycarbonyloxy).
  const bare = (g?: { head: Unit; more: Unit[] }, el = "C") => !!g && g.head.kind === "element" && g.head.text === el && !g.head.count
    && (el === "C" ? g.more.every((u) => u.text === "H" && !u.count) && g.more.length <= 1 : !g.more.length);
  const grouped = us[0].kind === "group" || us[0].kind === "bracket";
  for (let k = groups.length - 2; k >= 0; k--) {
    const before = groups[k - 1]?.head;
    if (!bare(groups[k]) || !bare(groups[k + 1], "O") || (before?.kind === "element" && before.count && /^(?:F|Cl|Br|H|D)$/.test(before.text))) continue;
    if (grouped && before?.text !== "C") continue;
    groups[k].more.push({ text: "(O)", kind: "bracket" });
    groups.splice(k + 1, 1);
  }
  return groups.reverse().map((g) => written([g.head, ...g.more])).join("");
}
// Units as text that splits in one way only: a group that starts with a small letter goes in a bracket by the name it
// is read as (S and iPr are no SiPr; the formula reader takes tBu for t-Bu).
const small = (u: Unit) => u.kind === "group" && u.text[0] >= "a";
const plain = (us: Unit[]) => us.map((u) => (small(u) ? `(${SPELT[u.text] ?? u.text})` : u.text) + (u.count ?? "")).join("");
const textOf = (us: Unit[], label: string) => (us.some(small) ? plain(us) : label);
// A label read from its last atom, with an ester written from the left as chemists write it (CH3OOC, EtO2C: O–C(=O)).
const endText = (us: Unit[], label: string) => textOf(us, label).replace(/O[O2]C$/, "OC(O)");
// The hydrogens a label writes on its attachment atom when it is read with its bond on its last atom (HOCH2 2, CH3CO
// 0, as labelSmiles reads them). Undefined for any other label. Kept, as the structure check reads it on every change.
const ends = new Map<string, number | undefined>();
export function endHydrogens(label: string): number | undefined {
  if (ends.has(label)) return ends.get(label);
  const us = units(label), end = us.length > 1 ? condensedRoot(endText(us, label), true) : undefined;
  const h = end && sameGroup(end.smiles, labelSmiles(label)) ? end.h : undefined;
  if (ends.size >= 1000) ends.clear();
  ends.set(label, h);
  return h;
}
// A label written from the left as Octet keeps a label, from its attachment atom (MeO as OMe, pinB as Bpin, O2N as
// NO2, t-BuNH as NHt-Bu), so that it is drawn the right way round on either side of its bond. Any other label, and
// one that would read differently written so (iPrS is no SiPr), comes back as it is.
export function attachmentFirst(label: string): string {
  const us = units(label);
  if (us.length < 2 || FORMULAS[label]) return label;
  const back = [...us].reverse(), turn = fromEnd(us) ? fromAtom(back) : FORMULAS[written(back)] ? back : undefined, text = turn && written(turn);
  // The label read the other way round must be the same group (PhCO is benzoyl, OCPh benzyloxy).
  return text && units(text).every((u, k) => u.text === turn[k].text && u.count === turn[k].count) && sameGroup(labelSmiles(text), labelSmiles(label)) ? text : label;
}
// Two label SMILES that are one group with one attachment atom (C(OCC)=O and C(=O)OCC). Each atom is named by its
// element and, round after round, by its neighbours and bonds; the attachment atom is marked.
// A label SMILES as atoms and, for each, its neighbours with the bond between them ("", "-", "=" or "#").
const graph = (smiles: string) => {
  const atoms: string[] = [], near: [number, string][][] = [], stack: number[] = [], rings = new Map<string, [number, string]>();
  let prev = -1, bond = "";
  const join = (i: number, j: number, o: string) => { near[i].push([j, o]); near[j].push([i, o]); };
  for (const t of smiles.match(/\[[^\]]*\]|Br|Cl|[A-Za-z*]|[=#\-.()]|%\d\d|\d/g) ?? []) {
    if (t === "(") stack.push(prev);
    else if (t === ")") prev = stack.pop() ?? -1;
    else if ("=#-.".includes(t)) bond = t;
    else if (/^%?\d/.test(t)) {
      const open = rings.get(t);
      if (open) { join(prev, open[0], bond || open[1]); rings.delete(t); } else rings.set(t, [prev, bond]);
      bond = "";
    } else {
      const i = atoms.push(t) - 1;
      near.push([]);
      if (prev >= 0 && bond !== ".") join(prev, i, bond);
      prev = i; bond = "";
    }
  }
  return { atoms, near };
};
function sameGroup(a: string | undefined, b: string | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const names = new Map<string, number>(), name = (s: string) => names.get(s) ?? (names.set(s, names.size), names.size - 1);
  const ga = graph(a), gb = graph(b);
  if (ga.atoms.length !== gb.atoms.length) return false;
  const label = (g: ReturnType<typeof graph>) => {
    let ids = g.atoms.map((x, i) => name(x + (i ? "" : "*")));
    for (let r = 0; r < g.atoms.length; r++) ids = ids.map((id, i) => name(`${id}:${g.near[i].map(([j, o]) => o + ids[j]).sort().join(",")}`));
    return ids.sort((x, y) => x - y).join(" ");
  };
  return label(ga) === label(gb);
}
// A label an AI app gives (for a *, on an atom, in a change), as Octet keeps one: from its attachment atom. NC is the
// nitrile written from the left (NC–R), as an AI app copies it from a picture: Octet's own reading of NC, bond on N,
// is an isocyanide.
export const givenLabel = (label: string) => (label === "NC" ? "CN" : attachmentFirst(label));
// A label Octet reads no group in and that stands in for none (R, X, Ar, OR): it is drawn as text, and a reply names
// it, so no reply is silent on a group Octet did not read. A label of more than one word is not chemistry by design.
export const unknownLabel = (label: string) => !/\s/.test(label) && !labelSmiles(label) && !units(label).some((u) => standsIn(u.text));

// The elements SMILES writes with no bracket.
const ORGANIC = new Set(["B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I"]);
// What is on the ring of a label such as 4-ClC6H4: a group that is whole with its one bond, written from either end.
// It is a formula read with every valence used (OMe, MeO, CF3, F3C, and NC, the nitrile), a formula above but SO2,
// which is a link between two bonds, or it ends, away from the ring, in a group or an atom that bonds once (Cl, t-Bu,
// OTBS, pinB). A linker is not read (O, CH2, CO, NH, SO2): 4-OPh says no more than that an O is there.
function onRing(text: string): string | undefined {
  const us = units(text), far = fromEnd(us) ? us[0] : us[us.length - 1];
  if (us.length === 1 && far.kind === "bracket") return far.count ? undefined : far.text[0] === "(" ? onRing(text.slice(1, -1)) : labelSmiles(text);
  const back = [...us].reverse(), formula = FORMULAS[text] ?? FORMULAS[written(back)];
  const closed = !!far && (us.length > 1 || !far.count) && far.text !== "H" && (far.kind === "group" || (far.kind === "element" && ONCE.test(far.text)));
  return (us.length > 1 ? condensedLabel(plain(us)) ?? condensedLabel(plain(back)) : undefined) ?? (formula !== FORMULAS.SO2 ? formula : undefined) ?? (closed ? labelSmiles(text) : undefined);
}
// The label as SMILES with its attachment point first, for chemistry (SMILES export, formulas).
// Groups and the formulas above are looked up. Other condensed formulas are read left to right: each heavy
// atom joins the chain, H and counts are left to valence, a repeated element (CF3) and any group or bracket
// hang off the atom before them, and CO2R or COOR becomes an ester. Undefined if Octet cannot read it.
// A label written right to left (HO2C, OHC, MeO, Et3N) is read from its end, as ChemDraw reads a label it shows
// reversed: when its reverse is a formula above, or by fromEnd (MeO, AcOH: acetic acid, not C(C)=OO), and then as the
// same label from its attachment atom.
// A phenyl written with what is on it and where is that ring, and n- before a formula is the formula (RING, STRAIGHT).
// Kept by the label, as the drawing and its captions read each label on every change.
// A whole label that is a nickname of the user's own is read as it first (Structure > Define Nickname…). Then Octet's
// own reading; then one of Octet's built-in nicknames, as the whole label (nicknames.ts); then the reading with words
// Octet reads no group in taken as the nicknames they spell (NHPbf, CH2ODMTr). A part of a longer label is read
// with Octet's reading alone ((oTol)2P is not read through oTol).
const read = new Map<string, string | undefined>(), worded = new Map<string, string | undefined>();
let inside = 0, words = false;
const kept = (store: Map<string, string | undefined>, label: string, withWords: boolean) => {
  if (store.has(label)) return store.get(label);
  const was = words;
  inside++; words = withWords;
  let smiles: string | undefined;
  try { smiles = inside > 8 ? undefined : readLabel(label); } finally { inside--; words = was; }
  if (store.size >= 1000) store.clear();
  store.set(label, smiles);
  return smiles;
};
export function labelSmiles(label: string): string | undefined {
  const mine = inside ? undefined : ownNickname(label);
  if (mine) return mine.smiles;
  const smiles = kept(read, label, false);
  if (smiles || inside) return smiles;
  return builtInNickname(label)?.smiles ?? kept(worded, label, true);
}
onNicknamesChange(() => { ends.clear(); worded.clear(); });
// Why a label cannot be a nickname of the user's own, or undefined when it can: it is one word of up to 32
// characters, with no < or > and no control character (a label holds none, and the settings keep none: nicknames.ts
// readNicknames), and no element or generic label (typed on an atom, those are never read as a group). A label Octet
// reads already may be one: the user's group comes first, as a name of their own does in Name to Structure.
export function nicknameProblem(label: string): string | undefined {
  if (!label) return "Type a nickname.";
  if (/\s/.test(label) || [...label].length > NICKNAME_MOST) return `A nickname is one word of up to ${NICKNAME_MOST} characters.`;
  if (/[<>\u0000-\u001f\u007f-\u009f]/.test(label)) return "A nickname cannot hold < or > or a hidden character.";
  if (isElement(label) || standsIn(label)) return `${label} is an element or a generic label.`;
  return undefined;
}
function readLabel(label: string): string | undefined {
  if (SPELT[label]) return GROUPS[SPELT[label]];
  if (label[1] === "-" || label[1] === ",") {
    const ring = RING.exec(label);
    if (ring) {
      const at = /\d/.test(ring[1]) ? ring[1].split(",").map(Number) : [2 + "omp".indexOf(ring[1])], n = at.length;
      // Two or more of the group: it is one unit with its count (Me2, (CF3)2). The 2 of NO2 and the 3 of CF3 are no count.
      const us = n > 1 ? units(ring[2]) : [], group = n === 1 ? onRing(ring[2]) : us.length === 1 && us[0].count === String(n) ? onRing(us[0].text) : undefined;
      // The ring closes with a number the group does not use for a ring of its own (4-PhC6H4).
      const d = group && [..."3456789"].find((x) => !group.includes(x));
      if (!d || new Set(at).size < n || at.some((p) => p < 2 || p > 6) || (ring[3] && Number(ring[3]) !== 5 - n)) return undefined;
      const on = (p: number) => (at.includes(p) ? `(${group})` : ""), phenyl = `c${d}${[2, 3, 4, 5].map((p) => `c${on(p)}`).join("")}c${d}${on(6)}`;
      return crowded(phenyl) ? undefined : phenyl;
    }
    if (STRAIGHT.test(label)) label = label.slice(2);
  }
  // Groups written as formulas, read as chemists write them: phenyl, cyclohexyl, a straight chain CnH2n+1 (OC2H5,
  // C2H5O, NHC6H5, N(C2H5)2) and i-, s- and t- before C3H7 or C4H9. Any other carbon counted before its hydrogens
  // (C6H4 with no position, C2H3, C10H7) has more than one structure and is not read. A label can start with the
  // formula written from the left (H5C6, H5C2O).
  // A perfluoro or perchloro chain CnX2n+1 (C2F5, C3F7, F5C2), as a straight chain, and C6F5 and C6Cl5, the
  // pentahalophenyls, written either way round.
  const halo = /^(?:C(\d+)(F|Cl)(\d+)|(F|Cl)(\d+)C(\d+))$/.exec(label);
  if (halo) {
    const n = Number(halo[1] ?? halo[6]), x = halo[2] ?? halo[4], k = Number(halo[3] ?? halo[5]);
    if (n === 6 && k === 5) return `c1c(${x})c(${x})c(${x})c(${x})c1${x}`;
    if (n >= 2 && n <= 20 && k === 2 * n + 1) return `C(${x})(${x})`.repeat(n - 1) + `C(${x})(${x})${x}`;
  }
  const named = label.replace(/^H(\d+)C(\d+)(?![\da-z])/, "C$2H$1").replace(/(?:([inst])-)?C(\d+)H(\d+)(?!\d)/g, (m, p: string | undefined, c: string, h: string, at: number) => {
    const n = Number(c), g = WRITTEN[(p ? `${p}-` : "") + `C${c}H${h}`];
    if (g || (p && p !== "n") || Number(h) !== 2 * n + 1 || n < 2) return g ?? m;
    return CHAINS[n] ?? (at === 0 && label.length > m.length ? "CH3" + "CH2".repeat(n - 1) : "CH2".repeat(n - 1) + "CH3");
  });
  if (/C\d+H/.test(named)) return undefined;
  if (named !== label) return labelSmiles(named);
  // An element with its oxidation state, Os(II): the element alone ((II) is not two iodine atoms, and no charge).
  const ox = writtenOxidation(label);
  if (ox) return `[${ox.el}]`;
  if (FORMULAS[label]) return FORMULAS[label];
  let us = units(label);
  // No units, or one that is no element, group or bracket (a stand-in, a word Octet does not know): nothing to read.
  if (!us.length || (us.length === 1 && us[0].kind === "other")) return undefined;
  const back = [...us].reverse(), reverse = written(back);
  if (FORMULAS[reverse]) return FORMULAS[reverse];
  // A label written from the left whose own reading would put the bond on the wrong atom (HOH2C, ClO2S, NCH2C,
  // EtO2CCO): read as it is written from its attachment atom (CH2OH, SO2Cl, CH2CN, COCO2Et).
  const turned = turnedLabel(label, us);
  if (turned) return labelSmiles(turned);
  const left = fromEnd(us), given = us;
  if (left) us = fromAtom(back);
  // A nitrile written from its N (MeCN, NCMe, NCCH3, PhCN) is a ligand on a dative bond, which a label does not hold:
  // Octet reads no group in it, where read on as below it would be an amine.
  if (us[0].text === "N" && us[1]?.text === "C" && !us[0].count && !us[1].count && ((us.length === 3 && us[2].kind === "group" && !us[2].count) || written(us.slice(2)) === "CH3")) return undefined;
  // Read from its attachment atom as a condensed formula, every valence used (CH2N3 an azide, SO2Me a sulfone, CH2CN a
  // nitrile), when it can be read in one way; else left to right as below. A label written from the left needs it
  // where an O or S comes after its atom (MeO2S, Ph2(O)P, EtOC), but for the ester the reading below gets right (MeO2C).
  const valence = left ? us.some((u, k) => k > 0 && (u.text === "O" || u.text === "S" || u.text === "(O)" || u.text === "(S)")) && !(us[0].text === "C" && us[1].text === "O" && us[1].count === "2")
    : us[0].kind === "element" && us[0].text !== "H" && us.length > 1;
  // A label whose first atom cannot take the bond (CH3CO, HOCH2, (CH3)2N, CF3CO) is written from the left: the bond is
  // on its last atom, every valence used (acetyl, hydroxymethyl, dimethylamino). A label that starts with a group is
  // read so before it is read from its end, as its units in reverse are no formula (PhCO is benzoyl, PhOCO no benzoate).
  // An O written just before an S or P is on that atom (MeOS, H2NO2S: a sulfinyl and a sulfonamide), as in MeO2S. An S
  // or P with an O after it has its own (MeOSO2 is methoxysulfonyl).
  const end = () => (us.length > 1 ? condensedLabel(endText(given, label), true) : undefined);
  const first = valence ? condensedLabel(left ? plain(us) : textOf(us, label)) : undefined;
  const whole = left && !/(?:O\d?|\(O\))[SP](?![a-zO(])/.test(label) ? end() ?? first : first ?? end();
  if (whole && !crowded(whole)) return whole;
  let smiles = "";
  const atom = (sym: string) => (ORGANIC.has(sym) ? sym : sym === "D" ? "[2H]" : sym === "T" ? "[3H]" : `[${sym}]`);
  // The first heavy atom or group starts the chain (never a bare branch, which is not SMILES: H2O2 is OO).
  for (let k = 0; k < us.length; k++) {
    const u = us[k], n = Number(u.count ?? 1);
    if (!(n >= 1 && n <= 99)) return undefined;
    if (u.kind === "element") {
      // A label's hydrogens are left to valence. A label that is only hydrogen is the atom.
      if (u.text === "H" && us.length > 1) continue;
      // Deuterium and tritium bond once, as hydrogen does: each hangs off the atom before it. One is read where it is
      // the whole label, where it is counted (CD3, ND2), and as the one atom after C, N, O, S or a halogen (OD, ID; BT and PT are abbreviations). In a longer word it is
      // a letter of an abbreviation (OTPS, CDI, BHT, THF).
      const once = u.text === "D" || u.text === "T";
      if (once && us.length > 1 && !(smiles && (u.count || (us.length === 2 && us[0].kind === "element" && /^(?:[CNOS]|F|Cl|Br|I)$/.test(us[0].text))))) return undefined;
      smiles += smiles && (n > 1 || once) ? `(${atom(u.text)})`.repeat(n) : atom(u.text).repeat(n);
    } else {
      // A group, a nickname, or what a bracket holds, hangs off the atom before it. A diolate (pin, in any case) closes its ring
      // on the boron written just before it (Bpin, CH2Bpin, OB(pin)).
      // A word or bracket Octet reads no group in (Pbf in NHPbf and N(Pbf)2, DMTr in CH2ODMTr) is the nickname it
      // spells, if there is one.
      const name = u.kind === "bracket" ? u.text.slice(1, -1) : u.text, nick = words && !standsIn(name) ? (ownNickname(name) ?? builtInNickname(name))?.smiles : undefined;
      const g = u.kind === "group" ? GROUPS[SPELT[name]] : u.kind === "bracket" ? labelSmiles(name) ?? nick : u.kind === "other" ? nick : undefined;
      const diol = g ? undefined : DIOLATES[name.toLowerCase()];
      if (g) smiles += smiles ? `(${g})`.repeat(n) : g + `(${g})`.repeat(n - 1);
      else if (diol && n === 1 && us[k - 1]?.text === "B" && !us[k - 1].count) smiles += `1${diol}1`;
      else return undefined;
    }
  }
  if (crowded(smiles)) return undefined;
  // Peroxy acids and peresters written CO3H or CO3R (CO3tBu): C(=O)OO with R on the last O. Undefined when more than
  // one group follows.
  if (smiles.startsWith("C(O)(O)(O)")) {
    let r = smiles.slice(10), depth = 0, end = -1;
    for (let i = 0; i < r.length && end < 0; i++) if ((depth += r[i] === "(" ? 1 : r[i] === ")" ? -1 : 0) === 0) end = i;
    if (r[0] === "(" && end === r.length - 1) r = r.slice(1, -1);
    return r[0] === "(" ? undefined : `C(=O)OO${r}`;
  }
  // Esters and acids written CO2R or COOR: one O double-bonded to the carbon.
  return smiles.replace(/^C\(O\)\(O\)/, "C(=O)O").replace(/^COO/, "C(=O)O") || undefined;
}
// A label Indigo cannot lay out in good time is not read, as the layout can run for minutes and stop the editor:
// more than 120 atoms, an atom with more than eight neighbours (CCl99) or more than four groups with a ring on it
// (CPh5), or a ring atom with more than four neighbours (Ph4, CyPh4Cl). Ph3, BPh4, Pd(PPh3)4, W(CO)6 and PF6 are read.
function crowded(smiles: string): boolean {
  type At = { near: number; rings: number; ring: boolean };
  const bad = (a?: At) => !!a && (a.near > 8 || a.rings > 4 || (a.ring && a.near > 4));
  let atoms = 0, bracket = false;
  // The chain's last atom at each depth, and whether each open branch has a ring in it.
  const chain: (At | undefined)[] = [undefined], ringy: boolean[] = [];
  for (const ch of smiles) {
    const last = chain[chain.length - 1];
    if (bracket) { bracket = ch !== "]"; continue; }
    if (ch === "(") { if (last) last.near++; chain.push(undefined); ringy.push(false); }
    else if (ch === ")") {
      if (!ringy.length || bad(chain.pop())) return true;
      const at = chain[chain.length - 1];
      if (ringy.pop() && at) at.rings++;
      if (bad(at)) return true;
    } else if (/\d/.test(ch)) {
      if (last) { last.near++; last.ring = true; }
      ringy.fill(true);
    } else if (ch === "[" || /[A-Zbcnops]/.test(ch)) {
      // A new atom: bonded to the last one (the first atom, to the drawing).
      if (++atoms > 120) return true;
      if (last) { last.near++; if (bad(last)) return true; }
      chain[chain.length - 1] = { near: 1, rings: 0, ring: false };
      bracket = ch === "[";
    }
  }
  return chain.some(bad);
}

// Chemical formulas in running text: a count straight after an element, a group or a closing bracket is a
// subscript (K2CO3, Pd(PPh3)4, Et3N, CH2Cl2, DMSO-d6). Numbers on their own (72, 1,4-dioxane, 12 h), counts after
// anything else (L1) and method names (B3LYP, SN2) stay as typed. Subscripts print 75% size, 0.212 em down.
const COUNTED = new Set([...SYMBOLS, ...Object.keys(GROUPS), "pin", "dba", "cod", "acac", "d"]);
const NOT_FORMULA = /^(B3LYP|B2PLYP|MP[2-4]|S[NE][12]|E[12]|E1cB)$/;
export type Run = { text: string; sub?: true };
export function formulaRuns(text: string): Run[] {
  const out: Run[] = [];
  const push = (t: string, sub?: true) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && !!last.sub === !!sub) last.text += t;
    else out.push(sub ? { text: t, sub } : { text: t });
  };
  let at = 0;
  for (const m of text.matchAll(/\d+/g)) {
    const before = text.slice(0, m.index), word = /\S*$/.exec(before)![0] + /^\S*/.exec(text.slice(m.index))![0];
    const letters = /[A-Za-z]{1,5}$/.exec(before)?.[0] ?? "";
    // A generic group (L, R, X, Ar) counts within a formula (Pd(0)L2, HNR2, PdX2), not as a word of its own (L1, R2).
    const own = /\S*$/.exec(before)![0], generic = /(?:Ar|L|R|X)$/.exec(own)?.[0];
    const counted = !NOT_FORMULA.test(word) && /[A-Za-z]/.test(word)
      && (/[A-Za-z0-9][)\]]$/.test(before) || Array.from({ length: letters.length }, (_, k) => letters.slice(k)).some((s) => COUNTED.has(s)) || (!!generic && own.length > generic.length));
    if (!counted) continue;
    push(text.slice(at, m.index));
    push(m[0], true);
    at = m.index! + m[0].length;
  }
  push(text.slice(at));
  return out;
}

// Text Octet draws as a formula when it has no runs of its own (issue 31): conditions on an arrow, and a cycle's
// reagents, products, centre label and text intermediates, not its steps' names. The editor draws it, and the CDXML
// writer writes it, with formulaTextRuns, so the file shows what the page shows.
export const formulaCaption = (c: { on?: unknown; cycle?: { side: string } }) => !!c.on || (!!c.cycle && c.cycle.side !== "name");
export const formulaTextRuns = (text: string): { text: string; script?: "sub" }[] => formulaRuns(text).map((r) => (r.sub ? { text: r.text, script: "sub" } : { text: r.text }));
