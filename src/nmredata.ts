// NMReDATA (issue 111; the NMReDATA initiative's format, nmredata.org): an SD file whose records carry a structure's
// NMR assignment as data items. Mnova writes and reads it, so an assignment made in Octet goes on in Mnova and comes
// back. Octet writes version 1.1, level 0: each structure's molfile, then NMREDATA_ASSIGNMENT (a label, a shift and
// the molfile's atom numbers, H<n> for atom n's implicit hydrogens) and one NMREDATA_1D_<isotope> peak list for each
// nucleus. A nucleus with a measured spectrum linked to the structure gives its multiplets; the others Octet's
// prediction, marked as predicted in four places (the 1D tag's Predicted= and Spectrum_Location=none, a comment on
// each assignment line, and NMREDATA_ID). Octet reads versions 1.0 to 3.0: each nucleus's signals become a measured
// peak list in the drawing, each signal a multiplet with the file's shift, multiplicity, J and count (measured.ts
// Given), linked to the atoms its label names. Every file is hostile: one pass, limits on everything, a bad part left
// out and counted, never half read.
import { expandWithOrigins, toMolfile, toSmiles } from "./chem.ts";
import { fragments, pickAtoms } from "./edit.ts";
import { solventName } from "./jcamp.ts";
import { analyse, fromJcamp, MAX_GROUPS, type Given, type Measured } from "./measured.ts";
import { graphOf } from "./naming.ts";
import { isNucleus, multiplicity, NUCLEI, NUCLEUS_LIST, predict, type Nucleus } from "./nmr.ts";
import { hydrogens, orderOf, type Mol } from "./render.ts";

// --- Limits (reader) ----------------------------------------------------------------------------------------------

const MOST = 300_000, RECORDS = 100, ITEMS = 256, LINES = 20_000, LINE = 4096, ASSIGNMENTS = 10_000, LABEL_ATOMS = 1000, LABEL = 64, JS = 20, SPECTRA = 16;
const SHIFT_MOST = 10_000, J_MOST = 10_000, UNKNOWN = 777.777;

// Text with NMReDATA in it: a data item named NMREDATA_ (anything else of an SD file is a plain SD file).
export const isNmredata = (text: string) => /^>[^<\n]{0,40}<NMREDATA_/m.test(text.length > MOST + 1 ? text.slice(0, MOST + 1) : text);

// The nucleus an atom's element has, as a peak list names it: H 1H, C 13C and so on; a molfile's isotope wins.
const NATURAL: Record<string, string> = { H: "1H", D: "2H", C: "13C", N: "15N", F: "19F", P: "31P", Si: "29Si", B: "11B", Se: "77Se", Sn: "119Sn", Pt: "195Pt", O: "17O", Li: "7Li", Cd: "113Cd", Hg: "199Hg", Rh: "103Rh", Xe: "129Xe" };
const elementOf = (nucleus: string) => nucleus.replace(/^\d+/, "");

// --- Writing ------------------------------------------------------------------------------------------------------

// A peak list's signal as Octet writes it: its shift (or range of an m), multiplicity, J values (Hz), number of nuclei
// (¹H: hydrogens; ¹³C: hydrogens on the carbon), integral, and the labels of what it is assigned to.
type Signal = { shift: number; range?: [number, number]; name?: string; js: number[]; n?: number; e?: number; label?: string };
type Peaks = { nucleus: string; mhz: number; decoupled?: boolean; predicted: boolean; signals: Signal[] };
type Line = { label: string; shift: number; atoms: string[]; predicted: boolean };
export type WriteOptions = {
  spectra?: Measured[]; // the drawing's measured spectra, whose multiplets the atoms are linked to (Atom.peaks)
  mhz: number; solvent: string; decouple?: Partial<Record<Nucleus, boolean>>; // the Spectrum panel's settings
  version: string; // Octet's, for Predicted=
  predicting: boolean; // the shift tables are loaded
};
export type Written = { text: string; predicted: string[]; unplaced: number };

const fixed = (v: number, d: number) => (Object.is(+v.toFixed(d), -0) ? 0 : v).toFixed(d);
// Only ASCII: subscript digits as digits (CDCl₃ as CDCl3), the rest left out; no backslash or semicolon, which end a
// line and start a comment.
const ascii = (s: string) => s.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080)).replace(/[^\x20-\x7e]|[\\;]/g, "").trim();
// An item: its name and lines, each ended by a backslash, with a line feed after a ", " where a line runs past 200
// characters (version 1.1 readers ignore a bare line feed).
function item(name: string, lines: string[]): string {
  const wrap = (l: string) => {
    const out: string[] = [];
    while (l.length > 190) { const at = l.lastIndexOf(", ", 190); if (at < 20) break; out.push(l.slice(0, at + 2)); l = l.slice(at + 2); }
    return [...out, l].join("\n");
  };
  return `>  <${name}>\n${lines.map((l) => `${wrap(l)}\\`).join("\n")}\n\n`;
}

// The Hill formula of a molfile's atoms with their hydrogens: C, H, then the rest A to Z (all A to Z with no C).
function formula(els: string[], hs: number[]): string {
  const n = new Map<string, number>();
  els.forEach((e, i) => { const el = e === "D" || e === "T" ? "H" : e; n.set(el, (n.get(el) ?? 0) + 1); if (hs[i]) n.set("H", (n.get("H") ?? 0) + hs[i]); });
  const order = n.has("C") ? ["C", "H", ...[...n.keys()].filter((e) => e !== "C" && e !== "H").sort()] : [...n.keys()].sort();
  return order.map((e) => `${e}${n.get(e)! > 1 ? n.get(e) : ""}`).join("");
}

// The elements of a molfile's atoms, in its order (V2000 or V3000).
export function molfileAtoms(molfile: string): string[] | undefined {
  const lines = molfile.split("\n"), counts = lines[3] ?? "";
  if (/V3000/.test(counts)) {
    const out: string[] = [];
    let inside = false;
    for (const l of lines) {
      if (/^M {2}V30 BEGIN ATOM/.test(l)) inside = true;
      else if (/^M {2}V30 END ATOM/.test(l)) return out;
      else if (inside) { const f = l.trim().split(/\s+/); if (f[0] !== "M" || f[1] !== "V30" || !f[3]) return undefined; out.push(f[3]); }
    }
    return undefined;
  }
  const n = Number(counts.slice(0, 3));
  if (!Number.isInteger(n) || n < 0 || lines.length < 4 + n) return undefined;
  return lines.slice(4, 4 + n).map((l) => l.slice(31, 34).trim());
}

// One structure as a record: its molfile, then the NMReDATA items. p: the structure alone (its atoms keep their links).
function record(p: Mol, o: WriteOptions, solo: boolean, out: { predicted: Set<string>; unplaced: number }): string {
  const ex = expandWithOrigins(p), big = ex.mol.atoms.length > 999 || ex.mol.bonds.length > 999, molfile = toMolfile(p, !big);
  const atoms = ex.mol.atoms, els = molfileAtoms(molfile);
  // The atom numbers hold only when the molfile has the expanded atoms in their order (Indigo keeps it).
  const sound = !!els && els.length === atoms.length && els.every((e, k) => e === atoms[k].label || (atoms[k].label === "D" || atoms[k].label === "T" ? e === "H" || e === atoms[k].label : false));
  const used = atoms.map(() => 0), near: number[][] = atoms.map(() => []);
  for (const b of ex.mol.bonds) { for (const i of b.atoms) used[i] += orderOf(b.type); near[b.atoms[0]].push(b.atoms[1]); near[b.atoms[1]].push(b.atoms[0]); }
  const isH = (k: number) => ["H", "D", "T"].includes(atoms[k].label);
  const hOf = (k: number) => (isH(k) || atoms[k].text ? 0 : atoms[k].implicitHCount ?? hydrogens(atoms[k].label, atoms[k].charge ?? 0, used[k], atoms[k].radical));
  // An expanded atom's place in the molfile from the drawn atom it came from, its element and its place among those.
  const keyOf = (from: number[], list: Mol["atoms"]) => { const seen = new Map<string, number>(); return list.map((a, k) => { const base = `${from[k]}|${a.label}`, n = seen.get(base) ?? 0; seen.set(base, n + 1); return `${base}|${n}`; }); };
  const place = new Map(keyOf(ex.from, atoms).map((key, k) => [key, k]));
  // The atoms a nucleus's signal names for molfile atom k: ¹H the explicit H atoms on it and H<n> for its implicit
  // ones (or the H atom itself); other nuclei the atom when it is that element.
  const tokens = (k: number, el: string): string[] => {
    if (el !== "H") return atoms[k].label === el ? [String(k + 1)] : [];
    if (isH(k)) return [String(k + 1)];
    return [...near[k].filter(isH).map((j) => String(j + 1)), ...(hOf(k) ? [`H${k + 1}`] : [])];
  };
  const hOn = (k: number) => hOf(k) + near[k].filter(isH).length;
  const peaks: Peaks[] = [], lines: Line[] = [];
  // Labels as Mnova writes them: the atom number, H and the number for hydrogens, a and b after one used twice.
  const pending: { signal: Signal; base: string; atoms: string[]; predicted: boolean }[] = [];
  const assign = (signal: Signal, atomTokens: string[], el: string, predicted: boolean) => {
    if (!atomTokens.length) return;
    const t = atomTokens[0];
    pending.push({ signal, base: el === "H" && !t.startsWith("H") ? `H${t}` : t, atoms: [...new Set(atomTokens)], predicted });
  };
  // Measured: each NMR spectrum with a multiplet linked to this structure's atoms.
  const measured = new Set<string>();
  if (sound) for (const m of o.spectra ?? []) {
    if (m.kind !== "nmr" || !m.nucleus || measured.has(m.nucleus)) continue;
    const el = elementOf(m.nucleus), linked = new Map<number, number[]>();
    p.atoms.forEach((a, i) => a.peaks?.forEach((id) => linked.set(id, [...(linked.get(id) ?? []), i])));
    if (!m.groups.some((g) => linked.has(g.id))) continue;
    measured.add(m.nucleus);
    const a = analyse(m), split = m.nucleus === "1H" || m.nucleus === "19F" || m.nucleus === "31P", traced = m.nucleus === "1H" || m.nucleus === "19F";
    const signals: Signal[] = [];
    for (const g of a.groups) {
      if (g.other) continue;
      const drawn = linked.get(g.id) ?? [];
      if (!drawn.length && !solo) continue;
      // Each linked atom's numbers; one with none of this nucleus (a ¹H multiplet on a C=O) is left out and counted.
      const ks = drawn.flatMap((d) => ex.from.flatMap((f, k) => (f === d ? [k] : []))), per = drawn.map((d) => ks.filter((k) => ex.from[k] === d).flatMap((k) => tokens(k, el)));
      out.unplaced += per.filter((t) => !t.length).length;
      const toks = per.flat();
      if (drawn.length && !toks.length && !solo) continue;
      const range: [number, number] | undefined = g.name === "m" && g.given?.range ? g.given.range : g.name === "m" && g.peaks.length > 1 ? [g.peaks[g.peaks.length - 1].x, g.peaks[0].x] : undefined;
      const heavy = ks.find((k) => atoms[k].label === el);
      const s: Signal = {
        shift: g.shift, ...(range ? { range } : {}), ...(split && g.name ? { name: g.name } : {}), js: split ? g.js : [],
        ...(traced ? { n: Math.max(1, Math.round(g.n)), e: g.n } : m.nucleus === "13C" && heavy !== undefined ? { n: hOn(heavy) } : {}),
      };
      signals.push(s);
      assign(s, toks, el, false);
    }
    peaks.push({ nucleus: m.nucleus, mhz: m.mhz ?? o.mhz * (isNucleus(m.nucleus) ? NUCLEI[m.nucleus].ratio : 1), predicted: false, signals });
  }
  // Predicted: every nucleus Octet predicts that no measured spectrum gave, from the structure as the panel predicts it.
  const eb = expandWithOrigins(p, true), g = sound && o.predicting ? graphOf(eb.mol) : undefined;
  if (g) {
    const bonded = keyOf(eb.from, eb.mol.atoms).map((key) => place.get(key));
    for (const n of NUCLEUS_LIST) {
      if (measured.has(n)) continue;
      const pr = predict(g, n, o.solvent, o.decouple?.[n]);
      if (!pr) continue;
      const el = NUCLEI[n].el, signals: Signal[] = [];
      for (const s of [...pr.signals].sort((x, y) => y.shift - x.shift)) {
        const ks = s.atoms.map((k) => bonded[k]).filter((k): k is number => k !== undefined), toks = ks.flatMap((k) => tokens(k, el));
        const name = NUCLEI[n].trace || s.couplings.length ? multiplicity(s) : undefined;
        const sig: Signal = {
          shift: s.shift, ...(name ? { name } : {}), js: name && name !== "m" && !s.broad ? [...s.couplings].sort((x, y) => y.j - x.j).map((c) => c.j) : [],
          ...(n === "1H" ? { n: s.nuclei } : n === "13C" && ks.length ? { n: hOn(ks[0]) } : {}),
        };
        signals.push(sig);
        assign(sig, toks, el, true);
      }
      out.predicted.add(n);
      peaks.push({ nucleus: n, mhz: o.mhz * NUCLEI[n].ratio, ...(pr.decoupled ? { decoupled: true } : {}), predicted: true, signals });
    }
  }
  // Each label once: a base used twice takes a, b, c and on to z, aa, ab (H1a, H1b for one CH2's two hydrogens).
  const letters = (k: number): string => (k < 26 ? "" : letters(Math.floor(k / 26) - 1)) + String.fromCharCode(97 + (k % 26));
  const count = new Map<string, number>(), seen = new Map<string, number>();
  for (const x of pending) count.set(x.base, (count.get(x.base) ?? 0) + 1);
  for (const x of pending) {
    const k = seen.get(x.base) ?? 0;
    seen.set(x.base, k + 1);
    const label = count.get(x.base)! > 1 ? `${x.base}${letters(k)}` : x.base;
    x.signal.label = label;
    lines.push({ label, shift: x.signal.range ? (x.signal.range[0] + x.signal.range[1]) / 2 : x.signal.shift, atoms: x.atoms, predicted: x.predicted });
  }
  const hs = atoms.map((_, k) => hOf(k)), smiles = (() => { try { const t = toSmiles(p); return /^[\x21-\x7e]+$/.test(t) && !/[\\;]/.test(t) ? t : ""; } catch { return ""; } })();
  const names = [...new Set(peaks.filter((x) => x.predicted).map((x) => x.nucleus))];
  let text = `${molfile}\n`;
  text += item("NMREDATA_VERSION", ["1.1"]) + item("NMREDATA_LEVEL", ["0"]);
  text += item("NMREDATA_ID", names.length
    ? [`Comment=Octet Draw ${ascii(o.version)} predicted the ${names.join(" and ")} shifts (HOSE codes, nmrshiftdb2)`, "Comment1=Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License."]
    : [`Comment=Written by Octet Draw ${ascii(o.version)}`]);
  if (atoms.every((a) => !a.text && a.label !== "*")) text += item("NMREDATA_FORMULA", [formula(atoms.map((a) => a.label), hs)]);
  // A SMILES with a backslash (cis bonds) cannot be written: version 1.1 reads a backslash as a line's end.
  if (smiles) text += item("NMREDATA_SMILES", [smiles]);
  const solvent = ascii(o.solvent);
  if (solvent) text += item("NMREDATA_SOLVENT", [solvent]);
  if (lines.length) text += item("NMREDATA_ASSIGNMENT", lines.map((l) => `${l.label}, ${fixed(l.shift, 4)}, ${l.atoms.join(", ")}${l.predicted ? " ;predicted" : ""}`));
  for (const x of peaks) {
    const props = [`Larmor=${fixed(x.mhz, 2)}`, "Spectrum_Location=none", ...(x.decoupled ? ["Decoupled=1H"] : []), ...(x.predicted ? [`Predicted=Octet Draw ${ascii(o.version)} (HOSE codes, nmrshiftdb2)`] : [])];
    const sigs = x.signals.map((s) => [
      s.range ? `${fixed(s.range[1], 4)}-${fixed(s.range[0], 4)}` : fixed(s.shift, 4), ...(s.name ? [`S=${s.name === "br s" ? "bs" : s.name}`] : []),
      ...(s.js.length ? [`J=${s.js.map((j) => fixed(j, 2)).join(",")}`] : []), ...(s.n !== undefined ? [`N=${s.n}`] : []), ...(s.label ? [`L=${s.label}`] : []), ...(s.e !== undefined ? [`E=${fixed(s.e, 2)}`] : []),
    ].join(", "));
    text += item(`NMREDATA_1D_${x.nucleus}`, [...props, ...sigs]);
  }
  return `${text}$$$$\n`;
}

// A part of the drawing as an NMReDATA file: one record for each structure, as SDF export writes them. predicted: the
// nuclei whose shifts are Octet's prediction (in the order they come); unplaced: linked multiplets with no atom of their
// nucleus (a ¹H multiplet linked to a quaternary carbon). Undefined with no structure.
export function writeNmredata(part: Mol, o: WriteOptions): Written | undefined {
  if (!part.atoms.length) return undefined;
  const groups = fragments(part), out = { predicted: new Set<string>(), unplaced: 0 };
  const text = groups.map((g) => record(pickAtoms(part, g), o, groups.length === 1, out)).join("");
  return { text, predicted: NUCLEUS_LIST.filter((n) => out.predicted.has(n)), unplaced: out.unplaced };
}

// --- Reading ------------------------------------------------------------------------------------------------------

// cut: the item ends early (the file ends inside it, or it runs past LINES lines). A physical line over LINE
// characters (or with a NUL, which LONG is) is kept as LONG, so the logical line it belongs to is left out whole.
type Item = { name: string; lines: string[]; cut?: true };
const LONG = "\0";
type Atom = { n: number; implicit: boolean };
type ReadSignal = { shift: number; range?: [number, number]; name?: string; js: number[]; n?: number; e?: number; labels: string[]; ambiguous?: true };
type ReadPeaks = { nucleus: string; mhz?: number; signals: ReadSignal[] };
export type ReadRecord = { molfile: string; count: number; elements: string[]; solvent?: string; assigned: Map<string, { shift?: number; atoms: Atom[] }>; peaks: ReadPeaks[]; own: Set<string> };
export type Read = { records: ReadRecord[]; lost: Record<string, number> };

// A number as a file may write it: digits with one point, a sign; never NaN, 0x1F, 1e400 or an empty string. Each
// pattern can match a string one way only, so a long run of digits that fails is given up in one pass.
const NUM = String.raw`[-+]?(?:\d+(?:\.\d*)?|\.\d+)`;
const NUMBER = new RegExp(`^${NUM}$`);
const number = (s: string) => (NUMBER.test(s) ? Number(s) : NaN);
const RANGE = new RegExp(String.raw`^(${NUM})\s*(?:-\s*(${NUM}))?$`), JV = new RegExp(String.raw`^(${NUM})\s*(?:\([^()]{0,64}\))?$`);
// A line's fields: split at commas outside <"…">, each trimmed and unquoted. One pass, no backtracking.
function fields(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (!quoted && line.startsWith('<"', i)) { quoted = true; cur += '<"'; i++; continue; }
    if (quoted && line.startsWith('">', i)) { quoted = false; cur += '">'; i++; continue; }
    if (!quoted && line[i] === ",") { out.push(cur); cur = ""; continue; }
    cur += line[i];
  }
  out.push(cur);
  return out.map((f) => { const t = f.trim(); return t.startsWith('<"') && t.endsWith('">') && t.length >= 4 ? t.slice(2, -2) : t; });
}
// A line with its comment (from a ; outside <"…">) cut off.
function uncommented(line: string): string {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (!quoted && line.startsWith('<"', i)) quoted = true;
    else if (quoted && line.startsWith('">', i)) quoted = false;
    else if (!quoted && line[i] === ";") return line.slice(0, i);
  }
  return line;
}

// The records of an SD file: each one's molfile (to M  END) and data items (a > line naming it, its lines to an empty
// line). A record whose molfile has no end is left out.
function split(text: string, lost: Record<string, number>) {
  const out: { molfile: string; items: Item[] }[] = [], lines = text.split("\n");
  let mol: string[] = [], items: Item[] = [], ended = false, bad = false, cur: Item | undefined, extra = 0, dropped = 0, long = 0, past = 0;
  const finish = () => {
    if (ended && !bad && out.length < RECORDS) out.push({ molfile: mol.join("\n"), items });
    else if (ended || bad || mol.some((l) => l.trim())) dropped++;
    mol = []; items = []; ended = false; bad = false; cur = undefined;
  };
  for (const l of lines) {
    if (l.startsWith("$$$$")) { finish(); continue; }
    // An over-long line in a molfile spoils the record; in an item, its logical line (linesOf); elsewhere it is skipped.
    const over = l.length > LINE || l.includes(LONG);
    if (!ended) { if (over) bad = true; else { mol.push(l); if (/^M {2}END\s*$/.test(l)) ended = true; } continue; }
    if (cur) {
      if (!l.trim()) cur = undefined;
      else if (cur.lines.length < LINES) cur.lines.push(over ? LONG : l);
      else { cur.cut = true; past++; }
      continue;
    }
    if (over) { long++; continue; }
    const head = /^>.*?<([^<>]{1,200})>/.exec(l);
    if (!head) continue;
    if (items.length >= ITEMS) { extra++; cur = { name: "", lines: [] }; continue; }
    cur = { name: head[1].trim(), lines: [] };
    items.push(cur);
  }
  if (cur) cur.cut = true;
  if (ended || mol.some((l) => l.trim())) finish();
  if (dropped) lost["structure record"] = dropped;
  if (long) lost["long line"] = long;
  if (past) lost.line = past;
  if (extra) lost["data item"] = (lost["data item"] ?? 0) + extra;
  return out;
}

// An item's lines as the version reads them: from 1.1 on, a line ends at a backslash and a bare line feed is nothing
// (a version 1.1 file with no backslash at all is read line by line); comments cut off; empty lines dropped. In an
// item that ends early, a last line with no backslash is cut off: left out and counted. A line over LINE characters,
// or with an over-long physical line in it, is left out and counted.
function linesOf(it: Item, version: number, lost: Record<string, number>): string[] {
  const joined = it.lines.join("");
  const raw = version > 1 && joined.includes("\\") ? joined.split("\\") : it.lines.map((l) => l.replace(/\\\s*$/, ""));
  if (it.cut && raw.length > 1 && raw[raw.length - 1].trim()) { raw.pop(); lost["cut-off line"] = (lost["cut-off line"] ?? 0) + 1; }
  const out: string[] = [];
  for (const l of raw) {
    if (l.length > LINE || l.includes(LONG)) { lost["long line"] = (lost["long line"] ?? 0) + 1; continue; }
    const t = uncommented(l).trim();
    if (t) out.push(t);
  }
  return out;
}

// An NMReDATA file read: its records' molfiles, assignments and peak lists. Throws, with the reason to show, when it
// is over the size limit or has no structure. What it leaves out is counted in lost.
export function readNmredata(input: string): Read {
  if (input.length > MOST) throw new RangeError(`It has more than ${MOST.toLocaleString("en-GB")} characters.`);
  const text = input.replace(/^﻿/, "").replace(/\r\n?/g, "\n"), lost: Record<string, number> = {};
  const add = (what: string, n = 1) => { if (n > 0) lost[what] = (lost[what] ?? 0) + n; };
  const records: ReadRecord[] = [];
  for (const r of split(text, lost)) {
    const elements = molfileAtoms(r.molfile);
    if (!elements?.length) { add("structure record"); continue; }
    const count = elements.length, find = (name: string) => r.items.find((x) => x.name === name);
    const v = find("NMREDATA_VERSION"), vText = v?.lines.join("").replace(/\\/g, "").trim() ?? "";
    const version = vText.length <= 16 && NUMBER.test(vText) ? Number(vText) : r.items.some((x) => x.lines.some((l) => /\\\s*$/.test(l))) ? 1.1 : 1;
    const rec: ReadRecord = { molfile: r.molfile, count, elements, assigned: new Map(), peaks: [], own: new Set() };
    const solvent = find("NMREDATA_SOLVENT");
    if (solvent) { const s = linesOf(solvent, version, lost)[0]?.split(/[/ ]/)[0]; const name = s && solventName(s); if (name) rec.solvent = name; }
    let assignments = 0;
    for (const it of r.items) {
      if (!it.name.startsWith("NMREDATA_")) continue;
      const name = it.name.slice(9);
      if (["VERSION", "LEVEL", "ID", "FORMULA", "SMILES", "SOLVENT", "INCHI", "ALATIS", "TEMPERATURE", "PH", "CONCENTRATION", "AUTHOR"].includes(name)) continue;
      const lines = linesOf(it, version, lost);
      if (name === "ASSIGNMENT" || name === "SIGNALS") {
        if (assignments++) { add("data item"); continue; }
        for (const line of lines.slice(0, ASSIGNMENTS)) {
          if (/^Interchangeable\s*=/i.test(line)) { add("interchangeable assignment"); continue; }
          if (/^[A-Za-z][A-Za-z0-9_]*\s*=/.test(line)) continue; // Equivalent= and other properties: the labels stand alone
          const f = fields(line), label = f[0], shift = number(f[1] ?? "");
          if (!label || label.length > LABEL || rec.assigned.has(label) || !Number.isFinite(shift) || Math.abs(shift) > SHIFT_MOST) { add("assignment"); continue; }
          const atoms: Atom[] = [], seen = new Set<string>();
          for (const t of f.slice(2, 2 + LABEL_ATOMS)) {
            const m = /^(H?)(\d{1,7})$/i.exec(t), n = m ? Number(m[2]) : 0;
            if (!m || n < 1 || n > count) { add("assignment"); continue; }
            const key = `${m[1] ? "H" : ""}${n}`;
            if (!seen.has(key)) { seen.add(key); atoms.push({ n, implicit: !!m[1] }); }
          }
          if (f.length > 2 + LABEL_ATOMS) add("assignment", f.length - 2 - LABEL_ATOMS);
          rec.assigned.set(label, { ...(shift !== UNKNOWN ? { shift } : {}), atoms });
        }
        add("assignment", lines.length - ASSIGNMENTS);
        continue;
      }
      if (name === "J") { add("coupling list"); continue; }
      if (name.startsWith("2D_")) { add("2D correlation", lines.filter((l) => !/^[A-Za-z][A-Za-z0-9_]*\s*=/.test(l)).length || 1); continue; }
      const iso = /^1D_(\d{1,3}[A-Z][a-z]?)$/.exec(name)?.[1];
      const props = new Map<string, string>();
      for (const l of lines) { const p = /^([A-Za-z][A-Za-z0-9_]*)\s*=(.*)$/.exec(l); if (p && !props.has(p[1].toLowerCase())) props.set(p[1].toLowerCase(), p[2].trim()); }
      // Octet's own prediction: Octet predicts again, so it is not read as measured.
      if (iso && /^Octet\b/.test(props.get("predicted") ?? "")) { rec.own.add(iso); continue; }
      // An edited spectrum (DEPT, APT) is a second list of a nucleus: Octet keeps one.
      if (!iso || /DEPT|APT/i.test(props.get("sequence") ?? "") || rec.peaks.some((x) => x.nucleus === iso)) { add(name.startsWith("1D_") ? "extra peak list" : "data item"); continue; }
      const larmor = number(props.get("larmor") ?? ""), peaks: ReadPeaks = { nucleus: iso, ...(larmor >= 1 && larmor <= 3000 ? { mhz: larmor } : {}), signals: [] };
      for (const l of lines) {
        if (/^[A-Za-z][A-Za-z0-9_]*\s*=/.test(l)) continue;
        if (peaks.signals.length >= MAX_GROUPS) { add("signal"); continue; }
        const s = signal(l, add);
        if (s) peaks.signals.push(s); else add("signal");
      }
      rec.peaks.push(peaks);
    }
    records.push(rec);
  }
  if (!records.length) throw new RangeError("It has no structures.");
  return { records, lost };
}

// One 1D signal line: the shift or a range, then S=, J=, N=, L=, E= and others (fields with no = go on the one
// before: J=9.30, 4.81 and L=a, b). Undefined when its shift is not sound; a value Octet uses that is not sound is left
// out and counted (add). Each run of spaces before a name= is tried from its start only, so the line is read in one pass.
function signal(line: string, add: (what: string, n?: number) => void): ReadSignal | undefined {
  const f = fields(line.replace(/(\S)\s+(?=[A-Za-z][A-Za-z0-9_]*\s*=)/g, "$1, ")), at = RANGE.exec(f[0]);
  if (!at) return undefined;
  const a = Number(at[1]), b = at[2] === undefined ? a : Number(at[2]);
  if (![a, b].every((x) => Number.isFinite(x) && Math.abs(x) <= SHIFT_MOST)) return undefined;
  const attrs = new Map<string, string[]>();
  let key = "";
  for (const x of f.slice(1)) {
    if (!x) continue;
    const kv = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(x);
    if (kv) { key = kv[1].toUpperCase(); if (!attrs.has(key)) attrs.set(key, [kv[2]]); else key = ""; }
    else if (key) attrs.get(key)!.push(x);
  }
  const out: ReadSignal = { shift: (a + b) / 2, ...(a !== b ? { range: [Math.min(a, b), Math.max(a, b)] as [number, number] } : {}), js: [], labels: [] };
  // S= with its points dropped ("br. s"), one or more words of letters.
  const s = attrs.get("S")?.[0]?.replace(/\./g, "").replace(/ +/g, " ").trim();
  if (s !== undefined) { if (/^[A-Za-z ]{1,12}$/.test(s)) out.name = s === "bs" ? "br s" : s; else add("multiplicity"); }
  const js = attrs.get("J") ?? [];
  for (const j of js) {
    const m = JV.exec(j), v = m ? Number(m[1]) : NaN;
    if (!m || !(Math.abs(v) <= J_MOST) || js.length > JS) { out.js = []; add("J value", js.length); break; }
    out.js.push(Math.abs(v));
  }
  for (const [k, what, put] of [["N", "nucleus count", (v: number) => (out.n = v)], ["E", "integral", (v: number) => (out.e = v)]] as const) {
    const t = attrs.get(k)?.[0];
    if (t === undefined) continue;
    const v = number(t);
    if (!Number.isFinite(v) || v < 0 || v > 10000) add(what); else put(v);
  }
  const labels = new Set<string>();
  for (const l of attrs.get("L") ?? []) {
    if (l.startsWith("(") || (l.endsWith(")") && !/\(.*\)/.test(l))) { out.ambiguous = true; continue; }
    if (!l) continue;
    if (l.length <= LABEL && labels.size < LABEL_ATOMS) labels.add(l); else if (!labels.has(l)) add("assignment");
  }
  out.labels = out.ambiguous ? [] : [...labels];
  return out;
}

// --- Into the drawing ---------------------------------------------------------------------------------------------

// An NMReDATA file as a drawing: its structures (read by `read`, the SD file of the records' molfiles), each atom an
// assignment names linked to its multiplet, and one measured peak list for each nucleus, its multiplets numbered from
// `id`. Throws as readNmredata, or when `read` does. lost: what it left out, for the notice.
export function nmredataDrawing(text: string, read: (sdf: string) => Mol, id: number, title = ""): { mol: Mol; spectra: Measured[]; lost: Record<string, number> } {
  const { records, lost } = readNmredata(text), add = (what: string, n = 1) => { if (n > 0) lost[what] = (lost[what] ?? 0) + n; };
  const mol = read(records.map((r) => `${r.molfile}\n$$$$\n`).join(""));
  // Atom numbers hold only when the structures read have every molfile atom in order.
  const total = records.reduce((s, r) => s + r.count, 0), sound = mol.atoms.length === total;
  const links = mol.atoms.map((): number[] => []);
  type Built = { shift: number; range?: [number, number]; given: Given; atoms: number[]; height: number };
  const byNucleus = new Map<string, { mhz?: number; signals: Built[] }>();
  // stamp: the signal an atom was last added to, so each signal's atoms are found once each.
  const stamp = new Int32Array(mol.atoms.length).fill(-1);
  let offset = 0, signalNo = 0;
  for (const r of records) {
    const used = new Set<string>();
    // A signal's atoms: those of each label, each atom once, at most the record's atom count.
    const atomsOf = (labels: string[]) => {
      const out: number[] = [], no = signalNo++;
      for (const label of labels) {
        const a = r.assigned.get(label);
        if (!a) continue;
        used.add(label);
        for (const x of a.atoms) {
          if (out.length >= r.count) break;
          const i = offset + x.n - 1;
          if (stamp[i] !== no) { stamp[i] = no; out.push(i); }
        }
      }
      return out;
    };
    const mine = new Map<string, Built[]>(); // this record's signals, by nucleus
    for (const p of r.peaks) {
      const spec = byNucleus.get(p.nucleus) ?? { signals: [] }, own: Built[] = mine.get(p.nucleus) ?? [];
      mine.set(p.nucleus, own);
      if (!byNucleus.has(p.nucleus)) byNucleus.set(p.nucleus, spec);
      spec.mhz ??= p.mhz;
      for (const s of p.signals) {
        if (s.ambiguous) add("ambiguous link");
        const atoms = sound ? atomsOf(s.labels) : [];
        if (!sound && s.labels.length) add("assignment", s.labels.length);
        const label0 = s.labels.map((l) => r.assigned.get(l)?.shift).find((x) => x !== undefined);
        const height = s.n && s.n > 0 ? s.n : s.e && s.e > 0 ? s.e : 1;
        const b: Built = {
          shift: s.shift, ...(s.range ? { range: s.range } : {}), atoms, height,
          given: { shift: s.range ? s.shift : label0 ?? s.shift, ...(s.name ? { name: s.name } : {}), ...(s.js.length ? { js: s.js } : {}), ...(s.n !== undefined && s.n > 0 ? { n: s.n } : {}), ...(s.range ? { range: s.range } : {}) },
        };
        spec.signals.push(b);
        own.push(b);
      }
    }
    // Assignments no peak list names: by the nucleus their atoms have, to this record's signal at their shift (a stick
    // within 0.0001 ppm, else a range round it), else one of their own. Each found in a step or two: sticks by their
    // shift to 4 places; ranges by their low end, each with the widest range that starts at or below it.
    const index = new Map<string, { at: Map<number, Built>; ranges: Built[]; widest: Built[] }>();
    const indexOf = (nucleus: string) => {
      let ix = index.get(nucleus);
      if (ix) return ix;
      const list = mine.get(nucleus) ?? [], at = new Map<number, Built>(), ranges = list.filter((x) => x.range).sort((x, y) => x.range![0] - y.range![0]), widest: Built[] = [];
      for (const x of list) if (!x.range && !at.has(Math.round(x.shift * 1e4))) at.set(Math.round(x.shift * 1e4), x);
      ranges.forEach((x, k) => widest.push(k && widest[k - 1].range![1] >= x.range![1] ? widest[k - 1] : x));
      index.set(nucleus, (ix = { at, ranges, widest }));
      return ix;
    };
    const near = (ix: ReturnType<typeof indexOf>, shift: number) => {
      const key = Math.round(shift * 1e4);
      for (const k of [key, key - 1, key + 1]) { const x = ix.at.get(k); if (x && Math.abs(x.shift - shift) < 1e-4) return x; }
      let lo = 0, hi = ix.ranges.length - 1, j = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (ix.ranges[mid].range![0] <= shift) { j = mid; lo = mid + 1; } else hi = mid - 1; }
      return j >= 0 && ix.widest[j].range![1] >= shift ? ix.widest[j] : undefined;
    };
    const joined = new Map<Built, Set<number>>(); // a signal's atoms as assignments join it
    for (const [label, a] of r.assigned) {
      if (used.has(label) || !a.atoms.length) continue;
      const first = a.atoms[0], el = first.implicit ? "H" : r.elements[first.n - 1], nucleus = NATURAL[el];
      if (!nucleus || r.own.has(nucleus)) continue;
      if (a.shift === undefined || !sound) { add("assignment"); continue; }
      const spec = byNucleus.get(nucleus) ?? { signals: [] };
      if (!byNucleus.has(nucleus)) byNucleus.set(nucleus, spec);
      const ix = indexOf(nucleus), atoms = a.atoms.map((x) => offset + x.n - 1), into = near(ix, a.shift);
      if (into) { const set = joined.get(into) ?? new Set(into.atoms); joined.set(into, set); for (const i of atoms) set.add(i); }
      else { const b: Built = { shift: a.shift, atoms, height: 1, given: { shift: a.shift } }; spec.signals.push(b); ix.at.set(Math.round(a.shift * 1e4), b); }
    }
    for (const [b, set] of joined) b.atoms = [...set];
    offset += r.count;
  }
  // Each nucleus a peak list: one stick at each signal (as tall as its nuclei), each signal its own multiplet.
  // Given.n is a number of nuclei: a ¹³C list's N= (hydrogens on the carbon) is not one.
  const withoutN = ({ n: _, ...g }: Given): Given => g;
  const spectra: Measured[] = [], solvent = records.find((r) => r.solvent)?.solvent;
  let next = id;
  for (const [nucleus, spec] of byNucleus) {
    if (!spec.signals.length) continue;
    if (spectra.length >= SPECTRA) { add("extra peak list"); continue; }
    add("signal", spec.signals.length - MAX_GROUPS);
    const sigs = spec.signals.slice(0, MAX_GROUPS).sort((a, b) => b.shift - a.shift), traced = nucleus === "1H" || nucleus === "19F";
    const xs = Float64Array.from(sigs, (s) => s.shift), y = Float64Array.from(sigs, (s) => (traced ? s.height : 1));
    const m = fromJcamp({ title, kind: "nmr", nucleus, ...(spec.mhz ? { mhz: spec.mhz } : {}), ...(solvent ? { solvent } : {}), xUnit: "ppm", yUnit: "", first: xs[0], last: xs[xs.length - 1], y, xs, sticks: true }, next);
    // A multiplet's range: the file's, else a little round its stick (wider for ¹³C, whose sticks a CDXML grid moves more).
    const w = nucleus === "1H" ? 0.003 : 0.03;
    const groups = sigs.map((s, k) => ({ id: next + k, lo: s.range ? Math.min(s.range[0], s.shift - w) : s.shift - w, hi: s.range ? Math.max(s.range[1], s.shift + w) : s.shift + w, manual: true as const, given: traced ? { ...s.given, n: s.given.n ?? s.height } : withoutN(s.given) }));
    sigs.forEach((s, k) => { for (const i of s.atoms) if (links[i] && !links[i].includes(next + k)) links[i].push(next + k); });
    spectra.push({ ...m, groups, ...(traced ? { per: 1 } : {}) });
    next += sigs.length;
  }
  return { mol: { ...mol, atoms: mol.atoms.map((a, i) => (links[i].length ? { ...a, peaks: links[i] } : a)) }, spectra, lost };
}
