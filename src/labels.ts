// Atom labels beyond a single element: abbreviations (Ph, Boc), condensed formulas (OMe, CO2Et, NHBoc).
// A label is read as units: an element or group, then an optional count (a subscript), or a bracketed part.
// Drawn left to right from the attached atom; when the bond comes from the right, the units are reversed
// (OMe becomes MeO, CO2Et becomes EtO2C), as ChemDraw does in its ACS 1996 output.

import { condensedLabel } from "./condensed.ts";

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
// The name at the start of rest. A small letter straight after it must start the next name (Me in MeiPr, not in Met).
const named = (rest: string): string | undefined => NAMES[rest[0]]?.find((g) => rest.startsWith(g) && (!/[a-z]/.test(rest[g.length] ?? "") || !!named(rest.slice(g.length))));

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
// (Ar1, L'). Ar is never argon in a written label, and it is no phenyl: no one knows what is on the ring.
export const standsIn = (label: string) => isGeneric(label) || /^(?:Ar|Het|HetAr|Aryl|Alkyl|L|Ln|E|Nu|Hal|EWG|EDG|PG|LG|DG)(?:[1-9]\d?)?'{0,2}$/.test(label);

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
// Undefined for a word that reads as elements and groups.
function word(w: string): Unit[] | undefined {
  const ts: Unit[] = [];
  for (let k = 0; k < w.length; ) { const t = token(w.slice(k)); ts.push(t); k += t.text.length; }
  if (!ts.some((t) => t.kind === "other" && !/^(?:R|X|Ar)$/.test(t.text))) return undefined;
  const head = ts[0].kind === "element" && !/^[HDT]$/.test(ts[0].text) ? [ts[0], ...(ts[1]?.text === "H" ? [ts[1]] : [])] : [];
  const rest = w.slice(head.reduce((n, t) => n + t.text.length, 0));
  const ok = head.length && (rest.length >= 3 || /^[A-Z][a-z]$/.test(rest) || (head.length === 2 && /^[A-Z]{2}$/.test(rest)));
  return ok ? [...head, { text: rest, kind: "other" }] : [{ text: w, kind: "other" }];
}
function unitsOf(label: string): Unit[] {
  // A generic label (ALK, CYC, Q) or another stand-in (Alkyl, Het) is one unit: it is never read as atoms.
  if (standsIn(label) && !/\d/.test(label)) return [{ text: label, kind: "other" }];
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
    // other way (SnBu3 is tin), and always when the group has its hyphen (Os-Bu is O and s-Bu, not osmium).
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
const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
export function writtenOxidation(label: string): { el: string; ox: number } | undefined {
  const x = /^([A-Z][a-z]?)\((0|I{1,3}|IV|VI{0,3}|IX|X)\)$/.exec(label);
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

// Formulas whose bonding a left-to-right reading gets wrong (CN is a nitrile, not an amine). NC is the nitrile
// written from the left, as chemists write it far more often than an isocyanide. BF3K is the salt: a borate and its
// potassium ion.
const FORMULAS: Record<string, string> = {
  CN: "C#N", CHO: "C=O", CO2H: "C(=O)O", COOH: "C(=O)O", CO2: "C(=O)[O-]", NO2: "[N+](=O)[O-]", NO: "N=O",
  N3: "N=[N+]=[N-]", SO3H: "S(=O)(=O)O", SO2: "S(=O)=O", SO2Ph: "S(=O)(=O)c1ccccc1", COMe: "C(C)=O", COPh: "C(=O)c1ccccc1",
  CONH2: "C(N)=O", OCN: "OC#N", SCN: "SC#N", NCO: "N=C=O", NCS: "N=C=S", CHN2: "C=[N+]=[N-]", PO3H2: "P(=O)(O)O", BF3K: "[B-](F)(F)F.[K+]",
};
// A label written from the left (Et3N, MeO, pinB, F3C, D3C) is read from its end: it starts with a group, or with a
// counted halogen or hydrogen isotope, which can bond to no more, and it ends with one heavy atom.
export function fromEnd(us: Unit[]): boolean {
  const first = us[0], last = us[us.length - 1];
  return us.length > 1 && (first.kind === "group" || (!!first.count && /^(?:F|Cl|Br|I|D|T)$/.test(first.text))) && last.kind === "element" && last.text !== "H" && !last.count;
}

// The elements SMILES writes with no bracket.
const ORGANIC = new Set(["B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I"]);
const small = (u: Unit) => u.kind === "group" && u.text[0] >= "a";
// The label as SMILES with its attachment point first, for chemistry (SMILES export, formulas).
// Groups and the formulas above are looked up. Other condensed formulas are read left to right: each heavy
// atom joins the chain, H and counts are left to valence, a repeated element (CF3) and any group or bracket
// hang off the atom before them, and CO2R or COOR becomes an ester. Undefined if Octet cannot read it.
// A label written right to left (HO2C, OHC, MeO, Et3N) is read from its end, as ChemDraw reads a label it shows
// reversed: when its reverse is a formula above, or by fromEnd.
// A phenyl written with what is on it and where (4-ClC6H4, p-MeOC6H4, 4-ClPh, 3,5-(CF3)2C6H3) is that ring. n- before
// a formula says its chain is straight, which is how Octet reads it (n-C8H17).
export function labelSmiles(label: string): string | undefined {
  if (SPELT[label]) return GROUPS[SPELT[label]];
  if (label[1] === "-" || label[1] === ",") {
    const ring = /^(\d(?:,\d)*|[omp])-(.+?)-?(?:Ph|C6H([2-4]))$/.exec(label);
    if (ring) {
      const at = /\d/.test(ring[1]) ? ring[1].split(",").map(Number) : [2 + "omp".indexOf(ring[1])], n = at.length;
      // Two or more of the group: its count comes after it (Me2, (CF3)2).
      const group = n === 1 || ring[2].endsWith(String(n)) ? labelSmiles(n === 1 ? ring[2] : ring[2].slice(0, -1)) : undefined;
      // The ring closes with a number the group does not use for a ring of its own (4-PhC6H4).
      const d = group && [..."3456789"].find((x) => !group.includes(x));
      if (!d || new Set(at).size < n || at.some((p) => p < 2 || p > 6) || (ring[3] && Number(ring[3]) !== 5 - n)) return undefined;
      const on = (p: number) => (at.includes(p) ? `(${group})` : ""), phenyl = `c${d}${[2, 3, 4, 5].map((p) => `c${on(p)}`).join("")}c${d}${on(6)}`;
      return crowded(phenyl) ? undefined : phenyl;
    }
    if (/^n-C\d/.test(label)) label = label.slice(2);
  }
  // An element with its oxidation state, Os(II): the element alone ((II) is not two iodine atoms, and no charge).
  const ox = writtenOxidation(label);
  if (ox) return `[${ox.el}]`;
  if (FORMULAS[label]) return FORMULAS[label];
  let us = units(label);
  // No units, or one that is no element, group or bracket (a stand-in, a word Octet does not know): nothing to read.
  if (!us.length || (us.length === 1 && us[0].kind === "other")) return undefined;
  const back = [...us].reverse();
  const reverse = back.map((u) => u.text + (u.count ?? "")).join("");
  if (FORMULAS[reverse]) return FORMULAS[reverse];
  // Read from its attachment atom as a condensed formula, every valence used (CH2N3 an azide, SO2Me a sulfone, CH2CN a
  // nitrile), when it can be read in one way; else left to right as below. A group that starts with a small letter
  // goes in a bracket by the name it is read as, so that the formula splits as the label does (COtBu, SO2t-Bu).
  const plain = us.some(small) ? us.map((u) => (small(u) ? `(${SPELT[u.text] ?? u.text})` : u.text) + (u.count ?? "")).join("") : label;
  const whole = us[0].kind === "element" && us[0].text !== "H" && us.length > 1 ? condensedLabel(plain) : undefined;
  if (whole && !crowded(whole)) return whole;
  if (fromEnd(us)) us = back;
  let smiles = "";
  const atom = (sym: string) => (ORGANIC.has(sym) ? sym : sym === "D" ? "[2H]" : sym === "T" ? "[3H]" : `[${sym}]`);
  // The first heavy atom or group starts the chain (never a bare branch, which is not SMILES: H2O2 is OO).
  for (const u of us) {
    const n = Number(u.count ?? 1);
    if (!(n >= 1 && n <= 99)) return undefined;
    if (u.kind === "element") {
      if (u.text === "H") continue;
      // Deuterium and tritium bond once, as hydrogen does: they hang off the atom before them, and no chain starts
      // with one (THF is no tritium fluoride).
      const once = u.text === "D" || u.text === "T";
      if (once && !smiles && us.length > 1) return undefined;
      smiles += smiles && (n > 1 || once) ? `(${atom(u.text)})`.repeat(n) : atom(u.text).repeat(n);
    } else {
      // A group, or what a bracket holds, hangs off the atom before it. A diolate (pin, in any case) closes its ring
      // on the boron before it.
      const name = u.kind === "bracket" ? u.text.slice(1, -1) : u.text, g = u.kind === "group" ? GROUPS[SPELT[name]] : u.kind === "bracket" ? labelSmiles(name) : undefined;
      const diol = g ? undefined : DIOLATES[name.toLowerCase()];
      if (g) smiles += smiles ? `(${g})`.repeat(n) : g + `(${g})`.repeat(n - 1);
      else if (diol && smiles === "B" && n === 1) smiles += `1${diol}1`;
      else return undefined;
    }
  }
  if (crowded(smiles)) return undefined;
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
