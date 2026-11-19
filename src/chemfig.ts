// File > More Formats > Export LaTeX (chemfig)… and Copy as LaTeX (chemfig), and an AI app's read with format chemfig
// (issue 59): the structures as code for LaTeX's chemfig package, as the page draws them. Each bond takes its angle and
// length from the page, so any layout comes out as drawn. A regular ring, or an ortho-fused system of them, is in
// chemfig's ring syntax (*6(-=-=-=), **6 with its circle, fused rings nested); any other ring is bond by bond, closed by
// a hook (?[1] on the atom written first, ?[1] again on the other). Labels read as the page reads them, in their own
// bold, italic, underline, scripts and colour; each bond meets the label's own atom. Lone pairs, unpaired electrons,
// circled and partial charges, and charge signs drawn apart from a label go where the page draws them (render()'s
// electrons), with chemfig's \charge, and so do atom numbers, map numbers and R/S labels. An E/Z label is an atom of
// its own by its double bond. Separate structures keep their places: each hangs off the first by a bond chemfig does
// not draw. Reactions (the caller's schemes) are \schemestart rows, a name under a structure is \chemname*, brackets
// round atoms are \polymerdelim, and curved arrows, lines and lone reaction arrows are \chemmove; each of those
// structures is then a \chemfig of its own. Other arrows, text, shapes and objects are not in the code; chemfigNotice
// names them.
//
// Readable code (the default) has an atom on each line and each branch indented; compact code is one line. chemfig
// ignores the spaces and line breaks between bonds and atoms, so both draw the same. In a scheme each piece is a line
// ended by %, so the line break is not a space there.
//
// Much of this is from konokonekonoko's chemfig writer (pull request 127): the ring syntax and its rules, the readable
// lines, the marks, the label styles and characters, the bond styles, the schemes, names, brackets, arrows, numbers
// and stereo labels, and the notice. Here it reads the page's own drawing for which atoms show a label, where each
// mark and map number is and which side a double bond's second line is on.
import { AROMATIC, H_FIRST, HBOND, QUADRUPLE, bendPoint, circledRings, curved, headsOf, hydrogens, inShape, isBracket, orderOf, render, scaleOf, shapeCorners, stereoSpot, sweepOf, turnedWith, type Arrow, type Caption, type Face, type Ink, type Mol, type Style } from "./render.ts";
import { formulaCaption, formulaTextRuns, pieces, units, type Unit } from "./labels.ts";
import { polymerLabel, polymerTags } from "./query.ts";
import { runsOf, type TextRun } from "./richtext.ts";
import { ESCAPES } from "./escapes.ts";

type P = [number, number];
// A label as chemfig's atoms, the one its bonds meet (0-based), and an H stacked above or below it.
type Group = { atoms: string[]; anchor: number; stack?: "above" | "below" };
// The reactions to write as schemes (Editor schemesIn: reaction.ts and interpret.ts), each its row in order (structures
// by their atoms, text by its caption's id, plus signs and arrows by their ids) and each arrow's conditions above and
// below it. From pull request 127.
export type SchemeItem = { atoms: number[] } | { caption: number };
export type Scheme = { row: (SchemeItem | { plus: number } | { arrow: number })[]; above: Map<number, SchemeItem[]>; below: Map<number, SchemeItem[]> };
// Show Stereochemistry's labels (chem.ts stereoLabels, in mol's atom and bond order) and Settings > Drawing >
// Parentheses round R and S. Each is written where the page shows it: on a structure with Show Stereochemistry on.
export type Stereo = { atoms: (string | undefined)[]; bonds: (string | undefined)[]; parens?: boolean };
// compact: the code on one line. trace (for checks): each atom of the code in order, as the drawing's atom number; -1
// for a point a bond chemfig does not draw reaches, and -2 - n for a fused ring's last corner, which lands on atom n.
// blocks (for checks): where each \chemfig starts in trace, in the order they are in the code.
export type ChemfigOptions = { compact?: boolean; trace?: number[]; blocks?: number[]; schemes?: Scheme[]; stereo?: Stereo };

// --- Text as TeX ---

// Greek by TeX's names (escapes.ts), and the capitals TeX has no command for as their Latin letters.
const GREEK = new Map<string, string>();
for (const [name, c] of Object.entries(ESCAPES)) if (/[\u0370-\u03ff]/.test(c) && !GREEK.has(c)) GREEK.set(c, `\\${name}`);
// (ESCAPES names ε and φ twice; Unicode's ε and φ are TeX's \varepsilon and \varphi, as \epsilon is ϵ and \phi ϕ.)
GREEK.set("ε", "\\varepsilon").set("φ", "\\varphi");
for (const [g, l] of Object.entries({ Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Χ: "X", ο: "o", ς: "\\varsigma" })) GREEK.set(g, l);
// Signs chemistry uses, in TeX's maths mode, with no package that chemfig does not load.
const SIGNS: Record<string, string> = {
  "°": "\\circ", "±": "\\pm", "∓": "\\mp", "×": "\\times", "÷": "\\div", "·": "\\cdot", "•": "\\bullet", "−": "-", "–": "\\mbox{--}", "—": "\\mbox{---}",
  "≤": "\\leq", "≥": "\\geq", "≠": "\\neq", "≈": "\\approx", "∼": "\\sim", "≡": "\\equiv", "∝": "\\propto", "∞": "\\infty", "′": "\\prime", "″": "\\prime\\prime",
  "√": "\\surd", "∂": "\\partial", "∇": "\\nabla", "∫": "\\int", "∑": "\\sum", "⋯": "\\cdots", "…": "\\ldots", "ħ": "\\hbar", "Å": "\\mbox{\\AA}", "µ": "\\mu",
  "→": "\\rightarrow", "←": "\\leftarrow", "↔": "\\leftrightarrow", "⇌": "\\rightleftharpoons", "↑": "\\uparrow", "↓": "\\downarrow",
  "‡": "\\ddagger", "†": "\\dagger", "✱": "\\ast", "⊕": "\\oplus", "⊖": "\\ominus", "‘": "\\mbox{`}", "’": "\\prime", "“": "\\mbox{``}", "”": "\\prime\\prime", "\u00a0": "\\mbox{ }",
};
// Accented Latin letters, with TeX's accents (text mode, so in an \mbox), and the letters TeX has a command for.
const ACCENTS: Record<string, string> = { "\u0300": "`", "\u0301": "'", "\u0302": "^", "\u0303": "~", "\u0304": "=", "\u0306": "u", "\u0307": ".", "\u0308": "\"", "\u030a": "r", "\u030b": "H", "\u030c": "v", "\u0327": "c" };
const LETTERS: Record<string, string> = { ß: "\\ss", æ: "\\ae", Æ: "\\AE", œ: "\\oe", Œ: "\\OE", ø: "\\o", Ø: "\\O", ł: "\\l", Ł: "\\L", ı: "\\i" };
// ASCII that TeX or chemfig reads as code, in maths mode.
const SPECIAL: Record<string, string> = { "\\": "\\backslash{}", "{": "\\{", "}": "\\}", "#": "\\#", $: "\\$", "%": "\\%", "&": "\\&", _: "\\_", "~": "\\sim{}", "^": "\\hat{}", " ": "\\mbox{ }", "-": "\\mbox{-}", "'": "\\prime", "\"": "\\prime\\prime" };
const SCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₀₁₂₃₄₅₆₇₈₉₊₋", PLAIN = "0123456789+-";
// Characters maths sets raised: primes (\prime) and the degree sign (\circ). They are raised characters here, so a
// prime or degree sign after a raised part goes in that part, as TeX needs.
const RAISED = new Set(["'", "\"", "′", "″", "’", "”", "°"]);

// Text in TeX's maths mode: specials escaped, Greek and signs as TeX's, accents in an \mbox. Any other character is
// left out and added to left; control characters are left out. (typeset() turns Unicode scripts, primes and the
// degree sign into raised and lowered characters first.)
// script: in a raised or lowered part, where - is a minus (a charge), not a hyphen.
function texOf(s: string, left: Set<string>, script = false): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) continue;
    if (code < 0x7f) { out += script && ch === "-" ? ch : SPECIAL[ch] ?? ch; continue; }
    const mapped = GREEK.get(ch) ?? SIGNS[ch] ?? (LETTERS[ch] && `\\mbox{${LETTERS[ch]}}`);
    if (mapped) { out += mapped; continue; }
    const [base, mark, ...more] = [...ch.normalize("NFD")];
    if (/^[A-Za-z]$/.test(base) && mark && ACCENTS[mark] && !more.length) { out += `\\mbox{\\${ACCENTS[mark]}{${base === "i" ? "\\i" : base}}}`; continue; }
    left.add(ch);
  }
  return out;
}

// A label's character with its look: raised or lowered (a mass number, a count, a charge, or set by hand), bold,
// italic, underlined, coloured.
type Look = { bold?: boolean; italic?: boolean; underline?: boolean; colour?: string };
type Char = Look & { c: string; script?: "sub" | "super" };
const chars = (text: string, look: Look, script?: "sub" | "super"): Char[] => [...text].map((c) => ({ c, ...look, ...(script ? { script } : {}) }));
// #rrggbb as xcolor's RGB, or undefined for none or black (the document's ink).
const rgb = (hex?: string) => {
  const m = hex && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m && hex!.toLowerCase() !== "#000000" ? m.slice(1).map((h) => parseInt(h, 16)) : undefined;
};
const tikzColour = (c: number[]) => `{rgb,255:red,${c[0]};green,${c[1]};blue,${c[2]}}`;
const texColour = (c: number[]) => `\\color[RGB]{${c.join(",")}}`;
// A character as typeset() reads it: a Unicode script (₃, ⁺) as its digit or sign raised or lowered, and a prime or
// degree sign raised, unless it is in a script already. So a label typed with them and one set with Text >
// Superscript give the same code.
const scripted = (x: Char): Char => {
  const k = SCRIPTS.indexOf(x.c);
  return k >= 0 ? { ...x, c: PLAIN[k % 12], script: x.script ?? (k < 12 ? "super" : "sub") } : !x.script && RAISED.has(x.c) ? { ...x, script: "super" } : x;
};
// Characters as TeX in chemfig's maths mode, each atom's characters at once (issue 59, D18): raised characters side by
// side in one ^{…} and lowered ones in one _{…}, and each run of one look in maths alphabets, which shrink in a script
// as text commands do not. TeX takes one raised and one lowered part on a base; a third part starts on {}
// (X_{1}^{+}{}_{2}). Bold italic is \boldmath round \mathit, which needs no package. A lone plain count stays bare
// (CH_3).
function typeset(given: Char[], left: Set<string>): string {
  const cs = given.map(scripted);
  const looked = (s: string, l: Look, small: boolean) => {
    let t = l.bold && l.italic ? `\\mbox{\\boldmath$${small ? "\\scriptstyle" : ""}\\mathit{${s}}$}` : l.bold ? `\\mathbf{${s}}` : l.italic ? `\\mathit{${s}}` : s;
    if (l.underline) t = `\\underline{${t}}`;
    const c = rgb(l.colour);
    return c ? `{${texColour(c)}${t}}` : t;
  };
  const same = (x: Look, y: Look) => !!x.bold === !!y.bold && !!x.italic === !!y.italic && !!x.underline === !!y.underline && (x.colour ?? "") === (y.colour ?? "");
  let out = "", sub = false, sup = false; // the base's lowered and raised parts so far
  for (let k = 0; k < cs.length; ) {
    let e = k;
    while (e < cs.length && cs[e].script === cs[k].script) e++;
    let body = "";
    for (let j = k; j < e; ) {
      let f = j;
      while (f < e && same(cs[f], cs[j])) f++;
      const t = texOf(cs.slice(j, f).map((x) => x.c).join(""), left, !!cs[j].script);
      if (t) body += looked(t, cs[j], !!cs[j].script);
      j = f;
    }
    const s = cs[k].script;
    k = e;
    if (!body) continue;
    if (!s) { out += body; sub = sup = false; continue; }
    if (s === "sub" ? sub : sup) { out += "{}"; sub = sup = false; }
    out += s === "sub" && /^[0-9]$/.test(body) ? `_${body}` : `${s === "sub" ? "_" : "^"}{${body}}`;
    if (s === "sub") sub = true; else sup = true;
  }
  return out;
}
// Text chemfig reads as one atom: a capital letter at the start (outside braces) and nothing it reads as a bond, a
// branch, a ring or a hook. Anything else goes in braces, which chemfig does not split.
function atom(s: string): string {
  let plain = s, was = "";
  while (plain !== was) { was = plain; plain = plain.replace(/\{[^{}]*\}/g, ""); }
  return /^[A-Z][a-z0-9_^'.+]*$/.test(plain) ? s : `{${s}}`;
}
// The atoms of a label joined: chemfig starts an atom at a capital, and | starts one anywhere else.
const joined = (atoms: string[]) => atoms.map((a, k) => (k && !/^[A-Z]/.test(a) ? `|${a}` : a)).join("");
// Text in TeX's text mode (a name, a condition, text in a scheme): TeX's specials escaped, and any other character as
// texOf() writes it, as text where it is an \mbox's and else in maths ($\alpha$).
const TEXT_SPECIAL: Record<string, string> = { "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "#": "\\#", $: "\\$", "%": "\\%", "&": "\\&", _: "\\_", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}", "<": "\\textless{}", ">": "\\textgreater{}", "|": "\\textbar{}" };
function textOf(s: string, left: Set<string>): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) continue;
    if (code < 0x7f) { out += TEXT_SPECIAL[ch] ?? ch; continue; }
    const t = texOf(ch, left), m = /^\\mbox\{(.*)\}$/.exec(t);
    out += !t ? "" : m ? (m[1].startsWith("\\") ? `{${m[1]}}` : m[1]) : `$${t}$`;
  }
  // (Maths side by side is one piece: $\alpha\beta$. An escaped \$ stays.)
  return out.replace(/(?<!\\)\$\$/g, "");
}
// A caption as TeX text: a name under a structure, a condition on an arrow or text in a scheme's row. Its lines joined
// by \\, each run in its look (bold, italic, underlined, raised or lowered, coloured) on top of the caption's own. Text
// on an arrow with no runs of its own is a formula (H₂SO₄), as the page draws it. Font and size are the document's.
function nameOf(c: Caption, left: Set<string>): string {
  const piece = (text: string, r: TextRun) => {
    let t = textOf(text, left);
    if (!t) return "";
    if (r.script) t = `\\text${r.script === "super" ? "superscript" : "subscript"}{${t}}`;
    if (r.bold || c.bold) t = `\\textbf{${t}}`;
    if (r.italic || c.italic) t = `\\textit{${t}}`;
    if (r.underline || c.underline) t = `\\underline{${t}}`;
    const colour = rgb(r.colour ?? c.colour);
    return colour ? `\\textcolor[RGB]{${colour.join(",")}}{${t}}` : t;
  };
  const lines = [""], runs: TextRun[] = c.runs?.length ? c.runs : formulaCaption(c) ? formulaTextRuns(c.text) : runsOf(c);
  for (const r of runs) r.text.split("\n").forEach((part, k) => { if (k) lines.push(""); lines[lines.length - 1] += piece(part, r); });
  return lines.join("\\\\");
}
// Text of more than one line stacked: \\ alone does nothing in a scheme or on an arrow.
const stacked = (s: string) => (s.includes("\\\\") ? `\\shortstack{${s}}` : s);
// The arrows \chemmove draws when they are not in a scheme: straight arrows with heads of their own, curved ones and
// lines (not a page spectrum's parts).
const MOVED = new Set(["reaction", "resonance", "curved", "fishhook", "double", "line", "arc"]);
const chemmoved = (a: Pick<Arrow, "kind" | "role">) => MOVED.has(a.kind) && !a.role;
// An arrow of a scheme as chemfig's arrow type; those it has none for are written -> and named in the notice.
const ARROW_TYPES: Partial<Record<string, string>> = { equilibrium: "<=>", resonance: "<->", nogo: "-/>", hash: "-/>" };
// Half of a curved arrow's arc (a circular arc, render.ts) as TikZ's to[bend …, looseness …] from an end to the middle:
// the half sweeps half the arc (psi), its ends leave its chord at psi/2, and TikZ's control points (0.3915 of the chord
// for each looseness) sit where a circle's do.
function arcHalf(bend: number): { bend: number; looseness: number } {
  const psi = (sweepOf(bend) * Math.PI) / 360;
  return { bend: (psi * 90) / Math.PI, looseness: ((4 / 3) * Math.tan(psi / 4)) / (2 * Math.sin(psi / 2) * 0.3915) };
}
// The comment lines the code can start with: what it needs beyond chemfig.
export const TWICE_NOTE = "% Run LaTeX twice to put the brackets and arrows (\\polymerdelim, \\chemmove) in place.";
export const WAVY_ARROW_NOTE = "% Add \\usetikzlibrary{decorations.pathmorphing} to the preamble for the wavy arrows.";
const sign = (charge: number, circled?: boolean) => `${Math.abs(charge) > 1 ? Math.abs(charge) : ""}${circled ? (charge > 0 ? "\\oplus" : "\\ominus") : charge > 0 ? "+" : "-"}`;
const num = (x: number, places: number) => `${+x.toFixed(places)}`;
const degreesOf = (d: P) => (Math.atan2(d[1], d[0]) * 180) / Math.PI, RAD = Math.PI / 180;
// A ring by its atoms, whatever atom it starts at and whichever way round.
const ringKey = (r: number[]) => [...r].sort((x, y) => x - y).join();

// A wavy bond, as TikZ's snake: it needs a TikZ library, which the code's first line asks for.
const WAVY = "decorate,decoration={snake,amplitude=0.6pt,segment length=2.4pt}";
export const WAVY_NOTE = "% Add \\usetikzlibrary{decorations.pathmorphing} to the preamble for the wavy bonds.";
// The deepest a ring system in ring syntax starts (branches and rings round it), and the most rings it nests (NEST, a
// ladder of fused rings, D22): deeper ones are bond by bond, so a row of rings does not nest a level for each. chemfig
// opens a TeX group for each branch and ring, and pdfTeX stops at 255.
const DEEPEST = 8, NEST = 16;

// The rings chemfig's ring syntax draws as the page has them, each as its atoms anticlockwise. chemfig draws a ring
// as a regular polygon with sides of one bond length, turned so the bond into it points at its middle; a fused ring
// nested in another shares that ring's next side. A system of rings (sharing atoms) qualifies when every ring is
// regular (3 to 8 atoms, sides and corners true to 1%), the rings are joined only by sharing one side (ortho-fused: no
// spiro or bridged joins, no atom in three rings, the joins a tree), its fusion atoms have no other bond, and every
// bond out of the system points straight out from its own ring's middle (within half a degree). Only atoms in a cycle
// are searched (the 2-core), and each search goes at most 8 atoms round, so time grows with the drawing's size.
// at: each atom's place (bond lengths); nb: the bonds drawn round each atom (covalent: not a hydrogen bond).
function syntaxRings(at: (i: number) => P, nb: { to: number; covalent: boolean }[][]): number[][] {
  const cov = nb.map((list) => list.filter((x) => x.covalent).map((x) => x.to));
  const left = cov.map((n) => n.length), core = left.map(() => true), off = left.flatMap((n, i) => (n < 2 ? [i] : []));
  for (const i of off) { if (!core[i]) continue; core[i] = false; for (const j of cov[i]) if (core[j] && --left[j] < 2) off.push(j); }
  // The smallest ring of up to 8 atoms through each bond in the core: a search round it, at most 7 bonds deep.
  const found = new Map<string, number[]>();
  for (let p = 0; p < cov.length; p++) for (const q of cov[p]) {
    if (q < p || !core[p] || !core[q]) continue;
    const back = new Map<number, number>([[p, -1]]), depth = new Map<number, number>([[p, 0]]), queue = [p];
    for (let k = 0; k < queue.length && !back.has(q); k++) {
      const x = queue[k];
      if (depth.get(x)! >= 7) break;
      for (const r of cov[x]) if (core[r] && !back.has(r) && !(x === p && r === q)) { back.set(r, x); depth.set(r, depth.get(x)! + 1); queue.push(r); }
    }
    if (!back.has(q)) continue;
    const ring: number[] = [];
    for (let x = q; x !== -1; x = back.get(x)!) ring.push(x);
    if (ring.length >= 3) found.set(ringKey(ring), ring);
  }
  const all = [...found.values()];
  // A ring on its own: regular, with sides of 1. Its atoms anticlockwise, and its middle.
  const shape = (ring: number[]) => {
    const n = ring.length, c = ring.reduce<P>((s, i) => [s[0] + at(i)[0] / n, s[1] + at(i)[1] / n], [0, 0]), r = 1 / (2 * Math.sin(Math.PI / n));
    const t = (i: number) => Math.atan2(at(i)[1] - c[1], at(i)[0] - c[0]), ccw = [...ring].sort((x, y) => t(x) - t(y));
    const regular = ccw.every((i, k) => {
      const next = ccw[(k + 1) % n], gap = ((t(next) - t(i) + 4 * Math.PI) % (2 * Math.PI)) - (2 * Math.PI) / n;
      return Math.abs(Math.hypot(at(i)[0] - c[0], at(i)[1] - c[1]) - r) < 0.01 && Math.abs(gap) < Math.PI / 360 && cov[i].includes(next);
    });
    return regular ? { ccw, c } : undefined;
  };
  const top = all.map((_, k) => k), find = (k: number): number => { while (top[k] !== k) k = top[k] = top[top[k]]; return k; };
  const owners = new Map<number, number[]>();
  all.forEach((r, k) => { for (const i of r) owners.set(i, [...(owners.get(i) ?? []), k]); });
  for (const ks of owners.values()) for (const k of ks.slice(1)) top[find(k)] = find(ks[0]);
  const systems = new Map<number, number[]>();
  all.forEach((_, k) => systems.set(find(k), [...(systems.get(find(k)) ?? []), k]));
  return [...systems.values()].flatMap((ks) => {
    if (ks.some((k) => all[k].length > 8)) return [];
    const shapes = ks.map((k) => shape(all[k]));
    if (shapes.some((s) => !s)) return [];
    const inSystem = new Set(ks.flatMap((k) => all[k])), fusion = new Set([...inSystem].filter((i) => owners.get(i)!.length > 1));
    if ([...inSystem].some((i) => owners.get(i)!.length > 2)) return [];
    let joins = 0;
    for (let x = 0; x < ks.length; x++) for (let y = x + 1; y < ks.length; y++) {
      const shared = all[ks[x]].filter((i) => all[ks[y]].includes(i));
      if (!shared.length) continue;
      if (shared.length !== 2 || !cov[shared[0]].includes(shared[1])) return [];
      joins++;
    }
    if (joins !== ks.length - 1 || [...fusion].some((i) => nb[i].length !== 3)) return [];
    const radial = ks.every((k, x) => all[k].every((i) => fusion.has(i) || nb[i].filter((j) => !inSystem.has(j.to)).every(({ to: j }) => {
      const c = shapes[x]!.c, out = Math.atan2(at(i)[1] - c[1], at(i)[0] - c[0]), d = Math.atan2(at(j)[1] - at(i)[1], at(j)[0] - at(i)[0]);
      return Math.abs(Math.atan2(Math.sin(d - out), Math.cos(d - out))) < Math.PI / 360;
    })));
    return radial ? shapes.map((s) => s!.ccw) : [];
  });
}

// The code alone (chemfig()); "" when mol has no structure.
export function toChemfig(mol: Mol, s: Style, measure: (text: string, face?: Face) => Ink, o: ChemfigOptions = {}): string {
  return chemfig(mol, s, measure, o).code;
}

// The structures in mol as one \chemfig{…} (code), and what the notice says after "Copied." or "Saved name.tex."
// (notice: what the code leaves out or shows otherwise; "" for none). s and measure: the page's, for render.
export function chemfig(mol: Mol, s: Style, measure: (text: string, face?: Face) => Ink, o: ChemfigOptions = {}): { code: string; notice: string } {
  const atoms = mol.atoms, kept = atoms.map((a) => !a.hidden);
  if (!kept.some(Boolean)) return { code: "", notice: "" };
  const d = render(mol, s, measure), f = d.scale / s.bond, at = (i: number): P => [atoms[i].location[0] * f, atoms[i].location[1] * f];
  const left = new Set<string>(); // characters the code leaves out
  // The bonds drawn round each atom shown: not one to an H that Toggle Hydrogen Display hides.
  const nbrs = atoms.map((): { to: number; k: number; covalent: boolean }[] => []);
  mol.bonds.forEach((b, k) => {
    const [i, j] = b.atoms;
    if (i !== j && kept[i] && kept[j] && atoms[i] && atoms[j]) { nbrs[i].push({ to: j, k, covalent: b.type !== HBOND }); nbrs[j].push({ to: i, k, covalent: b.type !== HBOND }); }
  });
  const deg = (i: number) => nbrs[i].length;
  const toward = (i: number, j: number): P => { const x = at(j)[0] - at(i)[0], y = at(j)[1] - at(i)[1], l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  // The sum of the directions to an atom's neighbours: which way its bonds go.
  const pull = (i: number) => nbrs[i].reduce<P>((p, n) => { const [x, y] = toward(i, n.to); return [p[0] + x, p[1] + y]; }, [0, 0]);
  const centroid = (ids: number[]): P => ids.reduce<P>((m, i) => [m[0] + at(i)[0] / ids.length, m[1] + at(i)[1] / ids.length], [0, 0]);
  // Which atoms show a label, as the page draws them.
  const labelled = atoms.map((a, i) => kept[i] && !!d.label[i] && !a.attach);
  // The marks the page drew round each atom (its electrons), by atom, and each one's way out (degrees, y up).
  const marksOf = atoms.map((): { key?: string; t: number }[] => []);
  for (const e of d.electrons) {
    const a = atoms[e.atom];
    if (!a || !kept[e.atom]) continue;
    const x = e.at[0] - a.location[0] * d.scale, y = -(e.at[1] + a.location[1] * d.scale);
    marksOf[e.atom].push({ key: e.key, t: Math.hypot(x, y) > 1e-6 ? degreesOf([x, y]) : 90 });
  }
  // A label's sign drawn apart from it (moved by hand, or a radical ion's, after its dot): a mark, as the page has it.
  const apart = atoms.map((a, i) => !!a.charge && !a.circled && labelled[i] && marksOf[i].some((m) => m.key === "charge") && (a.angles?.charge !== undefined || marksOf[i].some((m) => m.key === undefined)));

  // A label as chemfig's atoms. It reads away from its bonds, as on the page: H₂N and MeO where the bonds go right.
  function group(i: number): Group {
    const a = atoms[i], charge = a.charge ?? 0, v = pull(i);
    const steep = Math.hypot(...v) > 1e-6 && Math.abs(v[1]) > Math.abs(v[0]) * Math.tan((70 * Math.PI) / 180);
    const rtl = a.align ? a.align === "right" : deg(i) > 0 && !steep && v[0] > 1e-6;
    if (!labelled[i]) return { atoms: [], anchor: 0 };
    // The label's own bold, italic, underline and colour go on all of it, its H, counts and sign.
    const look: Look = { ...(a.bold ? { bold: true } : {}), ...(a.italic ? { italic: true } : {}), ...(a.underline ? { underline: true } : {}), ...(a.colour ? { colour: a.colour } : {}) };
    // A circled charge, or a sign drawn apart, is a mark (marks()); a plain one is written after the label, in the
    // characters of its last chemfig atom, so it joins a raised part there (NH₃⁺ with a charge: NH_3^{++}).
    const sg = charge && !a.circled && !apart[i] ? chars(sign(charge), look, "super") : [];
    if (a.text) {
      // A written label's characters styled as they were typed (its runs), each on top of the label's own look.
      const runs = a.runs && a.runs.map((r) => r.text).join("") === a.text ? a.runs.flatMap((r) => [...r.text].map(() => r)) : undefined;
      // Raised or lowered digits typed as such (R¹³) are one unit.
      const scriptOnly = (u: Unit) => u.kind !== "bracket" && !u.count && /^[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₀₁₂₃₄₅₆₇₈₉₊₋]+$/.test(u.text);
      // (A character that units() splits, an emoji or an accent typed after its letter, is one.)
      const merged = units(a.text).reduce<Unit[]>((list, u) => {
        const last = list[list.length - 1];
        if (last && ((scriptOnly(last) && scriptOnly(u)) || (!last.count && (/[\ud800-\udbff]$/.test(last.text) || /^[\u0300-\u036f\udc00-\udfff]/.test(u.text))))) list[list.length - 1] = { ...last, text: last.text + u.text, count: u.count };
        else list.push(u);
        return list;
      }, []);
      let n = 0;
      const typed = merged.map((u) => {
        const parts = u.kind === "bracket" ? pieces(u) : [u], start = n;
        const cs = parts.flatMap((p) => [...chars(p.text, look), ...chars(p.count ?? "", look, "sub")]).map((x, k): Char => {
          const r = runs?.[start + k];
          return { ...x, ...(r?.bold ? { bold: true } : {}), ...(r?.italic ? { italic: true } : {}), ...(r?.underline ? { underline: true } : {}), ...(r?.script ? { script: r.script } : {}), ...(r?.colour ? { colour: r.colour } : {}) };
        });
        n += cs.length;
        return { cs, shown: !!typeset(cs, left), raised: cs.length > 0 && cs.every((x) => scripted(x).script) };
      });
      // A unit all in a script (the III of Fe with III raised, ₃, a prime) stays with the unit before it, as on the
      // page. Each chemfig atom's characters are typeset at once (D18), so its raised characters are one ^{…}.
      const together: Char[][] = [];
      typed.forEach((t, k) => { if (!t.shown) return; if (t.raised && k && together.length) together[together.length - 1].push(...t.cs); else together.push([...t.cs]); });
      const lists = rtl ? together.reverse() : together;
      if (sg.length) { if (lists.length) lists[lists.length - 1].push(...sg); else lists.push(sg); }
      const out = lists.map((cs) => atom(typeset(cs, left)));
      return { atoms: out, anchor: rtl ? Math.max(0, out.length - 1) : 0 };
    }
    const used = nbrs[i].reduce((m, { k }) => m + orderOf(mol.bonds[k].type), 0);
    const h = s.hideH ? 0 : a.implicitHCount ?? hydrogens(a.label, charge, used, a.radical === 3 ? 2 : a.radical);
    const el = [...chars(a.isotope ? String(a.isotope) : "", look, "super"), ...chars(a.label, look)];
    const hs = h ? [...chars("H", look), ...chars(h > 1 ? String(h) : "", look, "sub")] : [];
    const one = (cs: Char[]) => atom(typeset(cs, left));
    // H goes first read right to left (HO, H2N), and on a lone atom written that way (H2O, HCl). An H the bonds leave no
    // room for beside the atom stacks above or below it (an indole's NH).
    const back = rtl || (!a.align && !deg(i) && !!h && H_FIRST.has(a.label));
    const stack = a.align === "above" || a.align === "below" ? a.align : !a.align && steep && deg(i) > 1 ? (v[1] < 0 ? "above" : "below") : undefined;
    if (hs.length && stack) return { atoms: [`\\chem${stack}{${one(el)}}{${typeset(hs, left)}}${typeset(sg, left)}`], anchor: 0, stack };
    if (!hs.length) return { atoms: [one([...el, ...sg])], anchor: 0 };
    return back ? { atoms: [one(hs), one([...el, ...sg])], anchor: 1 } : { atoms: [one(el), one([...hs, ...sg])], anchor: 0 };
  }
  // An R, S, E or Z as IUPAC sets it: the letter italic, the parentheses (Settings) upright.
  const stereoText = (c: string) => { const x = `\\mathit{${c.replace(/[^A-Za-z]/g, "")}}`; return o.stereo?.parens ? `(${x})` : x; };
  // Lone pairs, unpaired electrons, circled and partial charges, and a sign drawn apart from its label, as chemfig's
  // \charge round the atom its bonds meet, each at the page's angle, in the atom's colour. A skeletal carbon's \charge
  // is the whole atom: chemfig joins the bonds through it. The \charge is never in braces, which would hide it.
  function marks(i: number, g: Group): Group {
    const a = atoms[i], c = rgb(a.colour), paint = c ? texColour(c) : "";
    const empty = !g.atoms.length, items: string[] = [];
    let charged = false, lewis = false;
    const where = (t: number) => { const r = Math.round(t); return r <= -180 ? r + 360 : r; };
    const text = (t: number, x: string, gap = empty ? 3 : 1) => items.push(`${where(t)}:${gap}pt[anchor=180+\\chargeangle]=$${paint}\\scriptstyle ${x}$`);
    const dots = (t: number, x: string) => { items.push(`${where(t)}:${empty ? 3 : 1}pt=${x}`); if (x !== "\\.") lewis = true; };
    for (const m of marksOf[i]) {
      if (m.key === "charge") {
        if (charged || !a.charge) continue;
        charged = true;
        if (a.circled) text(m.t, sign(a.charge, true));
        else if (!labelled[i] || apart[i]) text(m.t, sign(a.charge));
      } else if (m.key === "partial") text(m.t, `\\delta^{${a.partial === "+" ? "+" : "-"}}`);
      else if (m.key === undefined || m.key.startsWith("radical")) dots(m.t, "\\.");
      else if (m.key.startsWith("pair")) dots(m.t, a.bars ? "\\|" : "\\:");
    }
    // The atom's number (Show Atom Number), then its R or S (Show Stereochemistry), each in a gap between its bonds clear
    // of the rest of its label and its marks, as the page puts them (Editor besideAtom); its map number where the page
    // draws it. Upright but for the R or S, which is italic as IUPAC sets it.
    const cip = a.cip ? o.stereo?.atoms[i] : undefined, avoid: number[] = [];
    if (a.number || cip || a.map) {
      avoid.push(...nbrs[i].map((n) => degreesOf(toward(i, n.to))), ...marksOf[i].map((m) => m.t));
      if (g.stack) avoid.push(g.stack === "above" ? 90 : -90);
      else if (g.atoms.length > 1) { if (g.anchor < g.atoms.length - 1) avoid.push(0); if (g.anchor > 0) avoid.push(180); }
      if (labelled[i] && a.charge && !a.circled && !apart[i]) avoid.push(g.anchor > 0 ? 135 : 45);
    }
    for (const x of [a.number && typeset(chars(a.number, {}), left), cip && stereoText(cip)]) {
      if (!x) continue;
      const t = beside(i, avoid);
      avoid.push(t);
      text(t, x, empty ? 9 : 3);
    }
    // A map number level with a label of two atoms or more, past its far end (after the H of OH), goes on that atom.
    let end: { at: number; item: string } | undefined;
    const map = a.map ? d.maps.find((x) => x.atom === i) : undefined;
    if (a.map) {
      const x = map ? map.at[0] - a.location[0] * d.scale : 0, y = map ? -(map.at[1] + a.location[1] * d.scale) : 0;
      const t = Math.hypot(x, y) > 1e-6 ? degreesOf([x, y]) : beside(i, avoid), side = Math.cos(t * RAD) > 0 ? g.atoms.length - 1 : 0;
      if (!empty && g.atoms.length > 1 && !g.stack && Math.abs(Math.cos(t * RAD)) > 0.9 && side !== g.anchor) end = { at: side, item: `${where(t)}:1pt[anchor=180+\\chargeangle]=$${paint}\\scriptstyle ${a.map}$` };
      else text(t, String(a.map), empty ? 3 : 1);
    }
    if (!items.length && !end) return g;
    // A coloured atom's dots and bars in its colour: chemfig's own styles (.style={fill=black}, |style={black,line
    // width=0.4pt}) with the colour for black. A dot is drawn with \draw, so its outline takes the colour too (D19).
    const ink = c && tikzColour(c);
    const keys = [...(lewis ? ["lewisautorot=true"] : []), ...(ink && items.some((x) => /=\\[.:|]$/.test(x)) ? [`.style={draw=${ink},fill=${ink}}`, `|style={draw=${ink},line width=0.4pt}`] : [])];
    const wrap = (content: string, list = items) => (list.length ? `\\charge{${list === items && keys.length ? `[${keys.join(",")}]` : ""}${list.join(",")}}{${content}}` : content);
    if (empty) return { atoms: [wrap("")], anchor: 0 };
    return { ...g, atoms: g.atoms.map((x, k) => (k === g.anchor ? wrap(x) : k === end?.at ? wrap(x, [end.item]) : x)) };
  }
  // Where a number goes beside atom i (degrees, y up), as the page puts an atom number (Editor besideAtom): in the
  // middle of a gap between its bonds, wider gaps first, then those facing away from its ring (or from the atoms two
  // bonds off); the first more than 30° from every direction in avoid.
  function beside(i: number, avoid: number[]): number {
    const up = nbrs[i].map(({ to }) => Math.atan2(at(to)[1] - at(i)[1], at(to)[0] - at(i)[0])).sort((x, y) => x - y);
    const ring = nbrs[i].map(({ to }) => smallestRing(i, to)).find(Boolean);
    const around = ring ?? [...new Set(nbrs[i].flatMap(({ to }) => nbrs[to].map((x) => x.to)))].filter((j) => j !== i), mean = centroid(around);
    const away = around.length ? Math.atan2(at(i)[1] - mean[1], at(i)[0] - mean[0]) : Math.PI / 2;
    const gaps = !up.length ? [{ m: Math.PI / 2, score: 0 }] : up.length === 1 ? [{ m: up[0] + Math.PI, score: 1 }, { m: up[0] + Math.PI / 2, score: 0 }, { m: up[0] - Math.PI / 2, score: 0 }]
      : up.map((t, k) => { const next = k + 1 < up.length ? up[k + 1] : up[0] + 2 * Math.PI, m = (t + next) / 2; return { m, score: next - t + 0.3 * Math.cos(m - away) }; });
    gaps.sort((p, q) => q.score - p.score);
    const clear = (m: number) => avoid.every((t) => Math.abs(Math.atan2(Math.sin(m - t * RAD), Math.cos(m - t * RAD))) > Math.PI / 6);
    const m = (gaps.find((x) => clear(x.m)) ?? gaps[0]).m;
    return degreesOf([Math.cos(m), Math.sin(m)]);
  }
  // The smallest ring of up to 8 atoms through the bond from p to q (a search round it), or none.
  function smallestRing(p: number, q: number): number[] | undefined {
    const back = new Map<number, number>([[p, -1]]), queue = [p];
    for (let k = 0; k < queue.length && !back.has(q) && queue.length < 4096; k++) for (const { to, covalent } of nbrs[queue[k]]) if (covalent && !back.has(to) && !(queue[k] === p && to === q)) { back.set(to, queue[k]); queue.push(to); }
    if (!back.has(q)) return undefined;
    const ring: number[] = [];
    for (let x = q; x !== -1 && ring.length <= 8; x = back.get(x)!) ring.push(x);
    return ring.length <= 8 ? ring : undefined;
  }
  const bare = atoms.map((_, i) => (kept[i] ? group(i) : { atoms: [], anchor: 0 }));
  const groups = atoms.map((_, i) => (kept[i] ? marks(i, bare[i]) : bare[i]));

  // Where a double bond's second line is, looking from atom u along bond k: 1 left, -1 right, 0 centred (y up).
  const leftOf = (k: number, u: number) => { const side = d.sides?.[k] ?? 0; return !side ? 0 : (side < 0) === (mol.bonds[k].atoms[0] === u) ? 1 : -1; };
  // A bond drawn from atom u: its chemfig bond character and the TikZ options chemfig has no character for.
  function look(k: number, u: number): { char: string; tikz: string[] } {
    const b = mol.bonds[k], forward = b.atoms[0] === u, tikz: string[] = [], c = rgb(b.colour);
    if (c) tikz.push(`color=${tikzColour(c)}`);
    // A wedge's narrow end is at atoms[0], Octet's stereocentre; chemfig's < is narrow at the atom it leaves.
    const cram = (x: string) => (forward ? "<" : ">") + x;
    if (b.type === HBOND) return { char: "-", tikz: [...tikz, "dotted"] };
    if (b.type === 2 || (b.type === AROMATIC && !b.stereo)) {
      const side = leftOf(k, u);
      if (b.display === "dashed" || b.display === "aromatic") tikz.push("dashed");
      return { char: side > 0 ? "=^" : side < 0 ? "=_" : "=", tikz };
    }
    if (b.type === 3 || b.type === QUADRUPLE) return { char: "~", tikz };
    if (b.stereo === 1) return { char: cram(""), tikz };
    if (b.stereo === 6) return { char: cram(":"), tikz };
    switch (b.display) {
      case "hollow": return { char: cram("|"), tikz };
      case "bold": return { char: "-", tikz: [...tikz, "line width=2pt"] };
      case "dashed": return { char: "-", tikz: [...tikz, "dashed"] };
      case "hashed": return { char: "-", tikz: [...tikz, "line width=2pt", "dash pattern=on 0.4pt off 1.2pt"] };
      case "wavy": return { char: "-", tikz: [...tikz, WAVY] };
      case "dative": return { char: "-", tikz: [...tikz, forward ? "-stealth" : "stealth-"] };
      default: return { char: "-", tikz };
    }
  }
  // The atom of a label (1-based) a bond leaves or meets, named whenever the label has more than one chemfig atom.
  const letter = (i: number) => (groups[i].atoms.length > 1 ? String(groups[i].anchor + 1) : "");
  const fieldsOf = (fs: string[]) => { while (fs.length && !fs[fs.length - 1]) fs.pop(); return fs.length ? `[${fs.join(",")}]` : ""; };
  // A bond from atom u to atom v (bond k): its character and [angle, length, departure atom, arrival atom, TikZ]. Never
  // shorter than a hundredth, as two bonded atoms on one spot would give chemfig a bond of no direction (D21).
  const bondCode = (u: number, v: number, k: number) => {
    const { char, tikz } = look(k, u), l = Math.hypot(at(v)[0] - at(u)[0], at(v)[1] - at(u)[1]);
    return char + fieldsOf([`:${num(degreesOf([at(v)[0] - at(u)[0], at(v)[1] - at(u)[1]]), 1)}`, Math.abs(l - 1) > 0.02 ? num(Math.max(l, 0.01), 2) : "", letter(u), letter(v), tikz.join(",")]);
  };
  // A bond chemfig does not draw, from atom u to a point p (or to atom v): what places a separate structure.
  const hop = (u: number, p: P, v?: number) => {
    // (Its angle to 3 places when it is long, so a structure far off stays within a fiftieth of a bond of its place;
    // never shorter than a hundredth, so two copies on one spot do not give chemfig a bond of no length.)
    const x = p[0] - at(u)[0], y = p[1] - at(u)[1], l = Math.hypot(x, y);
    return `-${fieldsOf([`:${num(degreesOf([x, y]), l > 20 ? 3 : 2)}`, num(Math.max(l, 0.01), 3), letter(u), v === undefined ? "" : letter(v), "draw=none"])}`;
  };

  // --- Blocks: the \chemfig commands, and what hangs off their atoms ---
  // Each structure (atoms joined by bonds) by number, numbered from the left.
  const comp = atoms.map(() => -1), comps: number[][] = [];
  for (const i of atoms.map((_, k) => k).filter((k) => kept[k]).sort((p, q) => at(p)[0] - at(q)[0] || at(q)[1] - at(p)[1])) {
    if (comp[i] >= 0) continue;
    const list = [i];
    comp[i] = comps.length;
    for (let k = 0; k < list.length; k++) for (const n of nbrs[list[k]]) if (comp[n.to] < 0) { comp[n.to] = comps.length; list.push(n.to); }
    comps.push(list);
  }
  const ok = (i: number) => Number.isInteger(i) && i >= 0 && i < atoms.length && kept[i];
  // Names under structures (captions kept under their atoms: a name, a compound number), each under its structure.
  const names = (mol.captions ?? []).filter((c) => c.under?.some(ok)).sort((p, q) => p.id - q.id);
  // Structures that go together: those under one name, and those of one compound of a scheme (a salt's ions).
  const top = comps.map((_, k) => k), find = (k: number): number => { while (top[k] !== k) k = top[k] = top[top[k]]; return k; };
  const join = (list: number[]) => { const ks = [...new Set(list.filter(ok).map((i) => find(comp[i])))]; for (const k of ks.slice(1)) top[find(k)] = find(ks[0]); };
  const schemes = (o.schemes ?? []).filter((s) => s.row.length);
  const itemsOf = (s: Scheme) => s.row.flatMap((p) => ("arrow" in p ? [...(labelsOf(p.arrow, s)?.flat() ?? [])] : [p]));
  for (const c of names) join(c.under!);
  for (const s of schemes) for (const it of itemsOf(s)) if ("atoms" in it) join(it.atoms);
  // An arrow of a scheme, and its conditions in the order they are in the code. chemfig sets its labels as TikZ sloped
  // nodes: the first on the arrow's left, turned by 180° when the arrow points left (TikZ never sets one upside down).
  // The page puts "above" up for a mostly level arrow and on the left for a steep one (render.ts), so the two swap
  // only where chemfig's first label lands on the page's below side.
  function labelsOf(id: number, s: Scheme): [SchemeItem[], SchemeItem[]] | undefined {
    const a = mol.arrows?.find((x) => x.id === id);
    if (!a) return undefined;
    const up = s.above.get(id) ?? [], down = s.below.get(id) ?? [];
    const dx = a.to[0] - a.from[0], dy = a.to[1] - a.from[1], len = Math.hypot(dx, dy) || 1, flip = dx < -1e-9 ? -1 : 1;
    const first: P = [(-dy / len) * flip, (dx / len) * flip], above: P = Math.abs(dx) >= 0.5 * len ? [0, 1] : [-1, 0];
    return first[0] * above[0] + first[1] * above[1] < 0 ? [down, up] : [up, down];
  }
  // The blocks in the order they are in the code: with no scheme or name, one for every structure (as 1.1.2 wrote);
  // else the schemes' compounds in order, each named structure, then the rest together.
  const blockOf = comps.map(() => -1), blocks: number[][] = []; // blockOf: by structure; blocks: their structures
  const take = (k: number) => { const g = find(k); if (blockOf[g] >= 0) return; blockOf[g] = blocks.length; blocks.push([]); };
  const split = names.length > 0 || schemes.some((s) => itemsOf(s).some((it) => "atoms" in it && it.atoms.some(ok)));
  if (split) {
    for (const s of schemes) for (const it of itemsOf(s)) if ("atoms" in it) { const i = it.atoms.find(ok); if (i !== undefined) take(comp[i]); }
    for (const c of names) take(comp[c.under!.find(ok)!]);
    const rest = comps.map((_, k) => k).filter((k) => blockOf[find(k)] < 0);
    if (rest.length) { blocks.push([]); for (const k of rest) blockOf[find(k)] = blocks.length - 1; }
  } else if (comps.length) { blocks.push([]); blockOf.fill(0); }
  comps.forEach((_, k) => blocks[split ? blockOf[find(k)] : 0].push(k));
  const blockAt = (i: number) => blocks.findIndex((b) => b.includes(comp[i]));
  // Atoms a branch can hang off: not a fusion atom, whose code in ring syntax takes no branch.
  const allRings = syntaxRings(at, nbrs.map((list) => list.map(({ to, covalent }) => ({ to, covalent })))), inRings = new Map<number, number>();
  for (const r of allRings) for (const i of r) inRings.set(i, (inRings.get(i) ?? 0) + 1);
  const host = (i: number) => kept[i] && (inRings.get(i) ?? 0) < 2;
  // What hangs off an atom by a bond chemfig does not draw, each a branch of its own: an E or Z, and an arrow's node.
  const tags: string[][] = atoms.map(() => []);
  const mp = (p: P): P => [p[0] * f, p[1] * f]; // a point of the drawing in bond lengths
  // (Each \chemfig names its nodes with a hash of the drawing, so two drawings in one document do not clash.)
  const hash = [...JSON.stringify(atoms.map((a) => a.location))].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36).slice(0, 4);
  // E and Z (and M and P on an axis) by their bonds, on a structure with Show Stereochemistry on, where the page puts
  // them (render.ts stereoSpot), off an end of the bond.
  o.stereo?.bonds.forEach((c, k) => {
    const b = mol.bonds[k];
    if (!c || !b || !b.atoms.every(ok) || !atoms[b.atoms[0]].cip) return;
    const u = b.atoms.find(host);
    if (u === undefined) return;
    const spot = stereoSpot(mol.bonds, b, (i) => [atoms[i].location[0], atoms[i].location[1]], (scaleOf(atoms[b.atoms[0]]) + scaleOf(atoms[b.atoms[1]])) / 2);
    const colour = rgb(b.colour);
    tags[u].push(hop(u, mp(spot)) + `{${colour ? texColour(colour) : ""}\\scriptstyle ${stereoText(c)}}`);
  });
  // Arrows \chemmove draws (not in a scheme): each end, and a curve's middle, a node (@{name}) off the atom nearest it.
  // A curved arrow is the page's circular arc, in two halves through its middle. Heads are chemfig's (CF), half heads
  // its harpoons; colour and line as the page has them.
  const inRow = new Set(schemes.flatMap((s) => s.row.flatMap((p) => ("arrow" in p ? [p.arrow] : []))));
  const hosts = mol.arrows?.length ? atoms.map((_, i) => i).filter(host) : [];
  const moved = (mol.arrows ?? []).filter((a) => chemmoved(a) && !inRow.has(a.id) && hosts.length);
  const moves = moved.map((a) => {
    const name = `oct${hash}a${a.id}`, node = (q: P, end: string) => {
      const p = mp(q), u = hosts.reduce((b, i) => (Math.hypot(at(i)[0] - p[0], at(i)[1] - p[1]) < Math.hypot(at(b)[0] - p[0], at(b)[1] - p[1]) ? i : b), hosts[0]);
      tags[u].push(hop(u, p) + `@{${name}${end}}`);
      return `(${name}${end})`;
    };
    const s = node(a.from, "s"), e = node(a.to, "e"), bend = (curved(a) || a.point) && a.bend ? a.bend : 0;
    let path = `${s}--${e}`;
    if (bend) { const h = arcHalf(bend), to = `to[bend ${bend > 0 ? "left" : "right"}=${num(h.bend, 2)},looseness=${num(h.looseness, 2)}]`; path = `${s}${to}${node(bendPoint(a), "m")}${to}${e}`; }
    const heads = headsOf(a), tip = (h: string) => (h === "none" ? "" : `{CF${a.head === "hollow" || h !== "full" ? `[${[...(a.head === "hollow" ? ["open"] : []), ...(h === "left" ? ["harpoon"] : h === "right" ? ["harpoon", "swap"] : [])].join(",")}]` : ""}}`);
    const c = rgb(a.colour), opts = [`${tip(heads.start)}-${tip(heads.end)}`, ...(c ? [`color=${tikzColour(c)}`] : []),
      ...(a.width || a.style === "bold" ? [`line width=${num((a.width ?? 0.4) * (a.style === "bold" ? 2 : 1), 2)}pt`] : []),
      ...(a.style === "dashed" ? ["dashed"] : a.style === "doubled" ? ["double"] : a.style === "wavy" ? [WAVY] : [])];
    return `\\draw[${opts.join(",")}]${path};`;
  });
  // Brackets round atoms with chemfig's \polymerdelim, after the code: its two nodes at the middles of the bracket's
  // sides, and empty atoms at its corners so the picture's box holds it, off its block's first atom. Its height, turn,
  // one side only, the usage label at the lower right (n), and the mark and repeat tags at the upper right, as the page
  // draws them. A bracket round no atom is not written.
  const brackets = (mol.shapes ?? []).filter(isBracket).flatMap((sh) => {
    const inside = atoms.flatMap((a, i) => (kept[i] && inShape(sh, [a.location[0], a.location[1]]) ? [i] : []));
    if (!inside.length) return [];
    const x0 = Math.min(sh.from[0], sh.to[0]), x1 = Math.max(sh.from[0], sh.to[0]), y0 = Math.min(sh.from[1], sh.to[1]), y1 = Math.max(sh.from[1], sh.to[1]), ym = (y0 + y1) / 2;
    const name = `oct${hash}b${sh.id}`, half = num(1.5 * (y1 - y0) * f, 2), c = shapeCorners(sh), corners = sh.angle ? [c.from, c.to, c.c1, c.c2] : [c.from, c.to];
    const tagText = [sh.mark ?? "", sh.polymer ? polymerTags(sh.polymer) : ""].filter(Boolean).join(" ");
    const pair = sh.kind === "brackets" ? ["[", "]"] : sh.kind === "parens" ? ["(", ")"] : ["\\{", "\\}"];
    const delims = sh.side === "left" ? `${pair[0]}.` : sh.side === "right" ? `.${pair[1]}` : pair.join("");
    const label = sh.polymer ? typeset(chars(polymerLabel(sh.polymer), {}), left) : "";
    const keys = [`delimiters={${delims}}`, `height=${half}em`, `depth=${half}em`, `indice={${label}}`, ...(sh.angle ? ["h align=false", `rotate=${num(sh.angle, 1)}`] : [])];
    return [{ id: sh.id, block: blockAt(inside[0]), delim: `\\polymerdelim[${keys.join(",")}]{${name}o}{${name}c}`,
      nodes: (u: number) => [hop(u, mp(turnedWith(sh, [x0, ym]))) + `@{${name}o}`, hop(u, mp(turnedWith(sh, [x1, ym]))) + `@{${name}c}`, ...corners.map((q) => hop(u, mp(q))),
        ...(tagText ? [hop(u, mp(turnedWith(sh, sh.side === "left" ? [x0 - 0.3 / f, y1 - 0.1 / f] : [x1 + 0.3 / f, y1 - 0.1 / f]))) + atom(`\\scriptstyle ${typeset(chars(tagText, {}), left)}`)] : [])] }];
  });

  // Rings in ring syntax, and those the page draws with a circle (Toggle Aromatic Display): **6(------), and in a
  // colour as the page draws that circle (its first atom's colour, render()): **[0,360,color=…]6( (D20).
  const circles = new Map(circledRings(mol).map((r) => [ringKey(r), rgb(atoms[r[0]].colour)]));
  const opening = (ring: number[]) => { const key = ringKey(ring); if (!circles.has(key)) return `*${ring.length}(`; const c = circles.get(key); return `**${c ? `[0,360,color=${tikzColour(c)}]` : ""}${ring.length}(`; };
  const off = new Set<string>(); // ring systems written bond by bond, as they would start too deep (DEEPEST)
  let lines: [number, string][] = [], trace: number[] = [], wavy = false, written = new Set<string>(); // written: rings in ring syntax
  let blockLines: [number, string][][] = [], starts: number[] = [], extra = new Map<number, string[]>(); // extra: a block's bracket nodes
  const inBlock = comps.map(() => 0);
  blocks.forEach((b, n) => { for (const k of b) inBlock[k] = n; });
  // (A fifth pass, if one is needed, writes every ring bond by bond, so the nesting stays within rule 8.)
  for (let pass = 0; ; pass++) {
    const rings = pass >= 4 ? [] : allRings.filter((r) => !off.has(ringKey(r)));
    written = new Set();
    const ringsOf = new Map<number, number[][]>();
    for (const r of rings) for (const i of r) ringsOf.set(i, [...(ringsOf.get(i) ?? []), r]);
    const bondOf = (p: number, q: number) => nbrs[p].find((x) => x.to === q)!.k;
    // A side of a ring in ring syntax: its character with no angle or length (the ring sets them). A side of a ring the
    // page draws with a circle is a single line, as on the page; a double bond's second line inside is chemfig's plain
    // = (on the left going round anticlockwise).
    const round = (p: number, q: number) => ringsOf.get(p)!.some((r) => r.includes(q) && circles.has(ringKey(r)));
    // (=_ puts it outside, as chemfig's manual has it.)
    // (A ring's last side takes no arrival atom: chemfig ends it where the ring's first bond left.)
    const sideCode = (p: number, q: number, last = false) => {
      const k = bondOf(p, q), { char, tikz } = look(k, p);
      return (round(p, q) ? "-" : char === "=^" ? "=" : char) + fieldsOf(["", "", letter(p), last ? "" : letter(q), tikz.join(",")]);
    };
    // A side chemfig can draw as the page does: chemfig has no centred double bond in a ring, unless it is circled.
    const sideFits = (p: number, q: number) => { const k = bondOf(p, q), b = mol.bonds[k]; return round(p, q) || !(b.type === 2 || (b.type === AROMATIC && !b.stereo)) || leftOf(k, p) !== 0; };

    // The tree each structure is written as. Bonds chemfig cannot write on a hook as they are (wedges, double bonds)
    // are taken first, then styled and coloured bonds (a hook takes their TikZ options), so a ring closes on a plain
    // bond where it can. A walk with no recursion.
    const seen = atoms.map(() => false), kids: number[][] = atoms.map(() => []), via: number[] = [], done = new Set<number>(), closes: [number, number, number][] = [];
    const rank = (k: number) => { const b = mol.bonds[k]; return b.type === 2 || (b.type === AROMATIC && !b.stereo) || b.stereo || b.display === "hollow" ? 0 : b.type === 1 && !b.display && !b.colour ? 2 : 1; };
    // A ring system in ring syntax is taken whole where the walk first meets it (never at a fusion atom): its first
    // ring's atoms anticlockwise from there (ringAt), each fused ring nested at the atom where it shares that ring's next
    // side (nestedAt: its atoms anticlockwise from there, its last the side's other end), all its sides done. Its atoms'
    // other bonds are walked as usual: their branches go inside the rings' code. All or nothing.
    const ringAt = new Map<number, number[]>(), nestedAt = new Map<number, number[]>(), systemAt = new Map<number, number[]>();
    const turnTo = (r: number[], v: number) => { const k = r.indexOf(v); return [...r.slice(k), ...r.slice(0, k)]; };
    const enter = (v: number, stack: number[]) => {
      const own = ringsOf.get(v);
      if (!own || own.length !== 1) return;
      const placed = new Set<number[]>([own[0]]), nest = new Map<number, number[]>(), todo = [turnTo(own[0], v)], level = [1];
      for (let n = 0; n < todo.length; n++) for (let k = 1; k < todo[n].length - 1; k++) {
        const path = todo[n], next = ringsOf.get(path[k])?.find((r) => !placed.has(r) && r.includes(path[k + 1]));
        if (!next) continue;
        const sub = turnTo(next, path[k]);
        if (sub[sub.length - 1] !== path[k + 1] || level[n] >= NEST) return;
        placed.add(next);
        nest.set(path[k], sub);
        todo.push(sub);
        level.push(level[n] + 1);
      }
      const system = [...new Set(todo.flat())];
      if (system.some((i) => i !== v && seen[i]) || rings.some((r) => r.some((i) => system.includes(i)) && !placed.has(r))) return;
      // Each side written: the first ring's all round, a nested ring's but the one it shares.
      if (!todo.every((r, n) => r.slice(0, n ? -1 : undefined).every((p, j) => sideFits(p, r[(j + 1) % r.length])))) return;
      ringAt.set(v, todo[0]);
      systemAt.set(v, system.filter((i) => i !== v));
      for (const [i, sub] of nest) nestedAt.set(i, sub);
      for (const r of placed) { written.add(ringKey(r)); r.forEach((i, j) => { seen[i] = true; done.add(bondOf(i, r[(j + 1) % r.length])); }); }
      stack.push(...system.filter((i) => i !== v).reverse());
    };
    const walk = (root: number) => {
      const stack = [root];
      seen[root] = true;
      enter(root, stack);
      while (stack.length) {
        const u = stack[stack.length - 1], next = nbrs[u].filter((x) => !done.has(x.k)).sort((x, y) => rank(x.k) - rank(y.k))[0];
        if (!next) { stack.pop(); continue; }
        done.add(next.k);
        if (!seen[next.to]) { seen[next.to] = true; via[next.to] = next.k; kids[u].push(next.to); stack.push(next.to); enter(next.to, stack); continue; }
        closes.push([next.to, u, next.k]);
      }
    };
    // Each structure from its leftmost atom; one that starts in a ring in ring syntax starts at the ring's atom with the
    // one before it straight above (chemfig's own way round, so it needs no turn) where it can.
    const entryOf = (i: number) => {
      const rs = ringsOf.get(i);
      if (!rs) return i;
      const fused = (v: number) => ringsOf.get(v)!.length > 1, system = [...rs];
      for (const r of system) for (const v of r) for (const x of ringsOf.get(v)!) if (!system.includes(x)) system.push(x);
      for (const r of system) {
        const k = r.findIndex((v, j) => { const w = r[(j + r.length - 1) % r.length]; return !fused(v) && Math.abs(at(w)[0] - at(v)[0]) < 0.01 && at(w)[1] > at(v)[1]; });
        if (k >= 0) return r[k];
      }
      return fused(i) ? system.flat().find((v) => !fused(v)) ?? i : i;
    };
    const order = atoms.map((_, i) => i).filter((i) => kept[i]).sort((i, j) => at(i)[0] - at(j)[0] || at(j)[1] - at(i)[1]);
    const roots: number[] = [];
    for (const i of order) if (!seen[i]) { const r = entryOf(i); roots.push(r); walk(r); }
    // The atoms just below an atom in the tree: its children, and a ring system's other atoms at its entry. The largest
    // subtree runs on as the main chain and the rest are branches, so branches nest at most log2(atoms) deep.
    const below = (u: number) => [...kids[u], ...(systemAt.get(u) ?? [])];
    const size = atoms.map(() => 1);
    for (const r of roots) {
      const reached = [r];
      for (let k = 0; k < reached.length; k++) reached.push(...below(reached[k]));
      for (let k = reached.length - 1; k >= 0; k--) for (const c of below(reached[k])) size[reached[k]] += size[c];
    }

    // Hooks: each bond that closes a ring is drawn from the atom written first (?[n]) to the other (?[n,{bond},TikZ]).
    // The order the atoms are written in comes from a first pass.
    const hooks = atoms.map((): string[] => []);
    let deep: number[] = []; // ring systems' entries that start deeper than DEEPEST
    const run = (withHooks: boolean) => {
      trace = [];
      deep = [];
      const text = (i: number) => {
        trace.push(i);
        const g = groups[i], hs = withHooks ? hooks[i].join("") : "";
        if (!g.atoms.length) return hs;
        const out = [...g.atoms];
        out[g.anchor] += hs;
        return joined(out);
      };
      // A fused ring's last corner: an empty atom, or an invisible copy of that atom's label (without its marks), so
      // chemfig stops the side at the label's edge.
      const phantom = (i: number) => { trace.push(-2 - i); return bare[i].atoms.length ? joined(bare[i].atoms.map((x) => `{\\phantom{${x}}}`)) : "{}"; };
      // The turn a ring written first needs: chemfig's own has its last side falling straight onto its first atom.
      const turnFor = (ring: number[]) => {
        const t = degreesOf([at(ring[ring.length - 1])[0] - at(ring[0])[0], at(ring[ring.length - 1])[1] - at(ring[0])[1]]) - 90, x = +num(t <= -180 ? t + 360 : t, 1);
        return x ? `[:${x}]` : "";
      };
      // A structure hanging off atom u by a bond chemfig does not draw. When it starts with a ring, the bond reaches it
      // through a point straight out from the ring's middle, so chemfig turns the ring as the page has it.
      const hang = (u: number, r: number) => {
        const ring = ringAt.get(r);
        if (!ring) return hop(u, at(r), r);
        const c = centroid(ring), out: P = [at(r)[0] - c[0], at(r)[1] - c[1]], l = Math.hypot(...out), p: P = [at(r)[0] + out[0] / l, at(r)[1] + out[1] / l];
        trace.push(-1);
        return `${hop(u, p)}-${fieldsOf([`:${num(degreesOf([-out[0], -out[1]]), 1)}`, "", "", letter(r), "draw=none"])}`;
      };
      const write = (u: number, depth: number, lead: string, others: number[] = []) => {
        for (let x = u, head = lead; ; ) {
          const ring = ringAt.get(x), first = !lead && !depth && x === u && ring ? turnFor(ring) : "";
          // (The lead goes before the atom's text: a hang's empty atom is traced first.)
          const line = first + head + text(x) + (ring ? opening(ring) : "");
          if (ring && depth > DEEPEST) deep.push(x);
          if (line) lines.push([depth, line]);
          const inner = ring ? depth + 1 : depth;
          const branch = (code: () => string, v: number, dd: number) => { lines.push([dd, "("]); write(v, dd + 1, code()); lines.push([dd, ")"]); };
          const bySize = (list: number[]) => [...list].sort((p, q) => size[p] - size[q]);
          const sorted = bySize(kids[x]), main = ring ? undefined : sorted.pop();
          for (const r of others) branch(() => hang(x, r), r, inner);
          for (const v of sorted) branch(() => bondCode(x, v, via[v]), v, inner);
          tagsAt(x, inner);
          if (ring) {
            // The ring's atoms after its first, each with its side and branches, and a ring fused at it nested after it.
            const sides = (r: number[], dd: number, open: boolean) => {
              const end = open ? r.length - 1 : r.length;
              for (let k = 1; k <= end; k++) {
                const p = r[k - 1], q = r[k % r.length];
                const side = sideCode(p, q, k === r.length);
                lines.push([dd, side + (k < end ? text(q) : open ? phantom(q) : "")]);
                if (k === end) break;
                const sub = nestedAt.get(q);
                if (sub) { lines.push([dd, opening(sub)]); sides(sub, dd + 1, true); lines.push([dd, ")"]); }
                for (const v of bySize(kids[q])) branch(() => bondCode(q, v, via[v]), v, dd);
                tagsAt(q, dd);
              }
            };
            sides(ring, inner, false);
            lines.push([depth, ")"]);
            return;
          }
          if (main === undefined) return;
          head = bondCode(x, main, via[main]);
          x = main;
          others = [];
        }
      };
      // What hangs off an atom (tags, and a block's bracket nodes at its first atom): each a branch of one point.
      const tagsAt = (x: number, dd: number) => { for (const list of [tags[x], extra.get(x)]) for (const t of list ?? []) { lines.push([dd, "("]); trace.push(-1); lines.push([dd + 1, t]); lines.push([dd, ")"]); } };
      // Each block from its first structure's first atom, the others hanging off it.
      const rootsOf = blocks.map((): number[] => []);
      for (const r of roots) rootsOf[inBlock[comp[r]]].push(r);
      blockLines = [];
      starts = [];
      rootsOf.forEach((rs, n) => {
        lines = [];
        starts.push(trace.length);
        extra = new Map([[rs[0], brackets.filter((b) => b.block === n).flatMap((b) => b.nodes(rs[0]))]]);
        write(rs[0], 0, "", rs.slice(1));
        blockLines.push(lines);
      });
    };
    run(false);
    // The atom of each closing bond written first carries the plain hook; the bond is drawn from it.
    const place = new Map<number, number>();
    trace.forEach((i, n) => { if (i >= 0 && !place.has(i)) place.set(i, n); });
    const named = closes.map(([p, q, k]) => (place.get(p)! <= place.get(q)! ? [p, q, k] : [q, p, k])).sort((x, y) => place.get(x[0])! - place.get(y[0])! || place.get(x[1])! - place.get(y[1])!);
    // (A hook's bond takes no side: =^ and =_ are written =, which chemfig centres.)
    named.forEach(([p, q, k], n) => {
      const { char: c, tikz } = look(k, p), char = c.startsWith("=") ? "=" : c;
      hooks[p].push(`?[${n + 1}]`);
      hooks[q].push(`?${fieldsOf([String(n + 1), char === "-" ? "" : `{${char}}`, tikz.join(",")])}`);
    });
    run(true);
    // Ring systems that start too deep are written bond by bond, and the code is written again.
    if (!deep.length || pass >= 4) {
      wavy = named.some(([, , k]) => mol.bonds[k].display === "wavy") || blockLines.some((ls) => ls.some(([, t]) => t.includes(WAVY)));
      break;
    }
    for (const v of deep) for (const r of rings) if (r.includes(v) || r.some((i) => systemAt.get(v)?.includes(i))) off.add(ringKey(r));
  }
  if (o.trace) o.trace.push(...trace);
  if (o.blocks) o.blocks.push(...starts);

  // --- The code: the blocks, in schemes, named, or side by side ---
  // A block as \chemfig{…}, compact or readable, and named when its structures have names (\chemname*, which puts each
  // name under its own structure whatever came before it).
  const chemfigOf = (n: number, compact = !!o.compact) => {
    const ls = blockLines[n], code = compact ? `\\chemfig{${ls.map(([, t]) => t).join("")}}` : `\\chemfig{\n${ls.map(([dd, t]) => "\t".repeat(dd + 1) + t).join("\n")}\n}`;
    const own = names.filter((c) => c.under!.some((i) => ok(i) && inBlock[comp[i]] === n)).map((c) => nameOf(c, left)).filter(Boolean);
    return own.length ? `\\chemname*{${code}}{${own.join("\\\\")}}` : code;
  };
  const done = new Set<number>(), ids = new Set<number>(); // done: blocks written; ids: the arrows, plus signs and text written
  const piece = (it: SchemeItem, label: boolean) => {
    if ("caption" in it) { const c = mol.captions?.find((x) => x.id === it.caption); if (!c) return ""; ids.add(c.id); return stacked(nameOf(c, left)); }
    const i = it.atoms.find(ok), n = i === undefined ? -1 : inBlock[comp[i]];
    if (n < 0 || done.has(n)) return "";
    done.add(n);
    return chemfigOf(n, label || undefined);
  };
  // Each reaction as chemfig's scheme: its compounds, \+ for each plus sign and an \arrow for each arrow, at the
  // arrow's angle and as long as the page's arrow (a bond is chemfig's 3em; an \arrow draws from 1em to coeff × 5em
  // less 1em, so 5em × coeff − 2em long, and an arrow of L bonds takes coeff (3L + 2) / 5), with its conditions
  // above and below it (structures compact, and text; more than one of either stacked). A row the page wraps onto more
  // lines is one long row.
  const arrowCode = (id: number, s: Scheme) => {
    const a = mol.arrows?.find((x) => x.id === id), labels = labelsOf(id, s);
    if (!a || !labels) return "";
    ids.add(id);
    const label = (list: SchemeItem[]) => { const ps = list.map((it) => piece(it, true)).filter(Boolean); return ps.length ? `[{${ps.length > 1 ? `\\shortstack{${ps.join("\\\\")}}` : ps[0]}}]` : "[]"; };
    const [above, below] = labels.map(label), d: P = [(a.to[0] - a.from[0]) * f, (a.to[1] - a.from[1]) * f], angle = Math.round(degreesOf(d)), coeff = +((3 * Math.hypot(...d) + 2) / 5).toFixed(1);
    const fields = fieldsOf([String(angle), Math.abs(coeff - 1) > 0.05 ? num(Math.max(coeff, 0.1), 1) : ""]);
    // An unbalanced equilibrium: ratio above 1 has the shorter back arrow, chemfig's <->>; below 1 the shorter forward one.
    const type = a.kind === "equilibrium" && a.ratio !== undefined && a.ratio !== 1 ? (a.ratio > 1 ? "<->>" : "<<->") : ARROW_TYPES[a.kind] ?? "->";
    return `\\arrow{${type}${above !== "[]" || below !== "[]" ? `${above}${below === "[]" ? "" : below}` : ""}}${fields}`;
  };
  const tab = (s: string) => s.split("\n").map((l) => `\t${l}`).join("\n");
  const parts = schemes.flatMap((s) => {
    const ps = s.row.map((p) => ("plus" in p ? (ids.add(p.plus), "\\+") : "arrow" in p ? arrowCode(p.arrow, s) : piece(p, false))).filter(Boolean);
    if (!ps.length) return [];
    return o.compact ? `\\schemestart${ps.join("")}\\schemestop` : `\\schemestart%\n${ps.map(tab).join("%\n")}%\n\\schemestop`;
  });
  // The blocks in no scheme, side by side; schemes and that row each a paragraph.
  const loose = blockLines.map((_, n) => n).filter((n) => !done.has(n)).map((n) => chemfigOf(n));
  if (loose.length) parts.push(loose.join(o.compact ? "\\qquad" : "\n\\qquad\n"));
  // Brackets and arrows after everything, as their nodes may be in more than one \chemfig.
  const after = [...brackets.map((b) => b.delim), ...(moves.length ? [o.compact ? `\\chemmove{${moves.join("")}}` : `\\chemmove{\n${moves.map((m) => `\t${m}`).join("\n")}\n}`] : [])];
  const body = [parts.join(o.compact ? "\\par" : "\n\\par\n"), ...after].join(o.compact ? "" : "\n");
  const notes = [...(wavy ? [WAVY_NOTE] : []), ...(moves.some((m) => m.includes(WAVY)) ? [WAVY_ARROW_NOTE] : []), ...(after.length ? [TWICE_NOTE] : [])];
  for (const b of brackets) ids.add(b.id);
  for (const a of moved) ids.add(a.id);
  for (const c of names) ids.add(c.id);
  return { code: [...notes, body].join("\n"), notice: chemfigNotice(mol, left, written, ids, !!o.stereo) };
}

// What the code leaves out of mol (left: characters it could not write) and what it shows otherwise, for the notice
// after "Copied." or "Saved name.tex.": "The code does not have the arrows, text and highlights." and the like.
// inSyntax: the rings written in ring syntax (by ringKey), the only ones with their circles. ids: the arrows, plus
// signs, text and brackets in the code (schemes, names, \chemmove, \polymerdelim). stereo: R/S and E/Z labels given.
function chemfigNotice(mol: Mol, left: Set<string>, inSyntax: Set<string>, ids: Set<number>, stereo: boolean): string {
  const shown = new Set(mol.atoms.flatMap((a, i) => (a.hidden ? [] : [i]))), atoms = [...shown].map((i) => mol.atoms[i]);
  const bonds = mol.bonds.filter((b) => b.atoms.every((i) => shown.has(i)));
  const shapes = (mol.shapes ?? []).filter((x) => !ids.has(x.id)), kinds = (k: string) => shapes.some((x) => x.kind === k);
  // Each kind in a fixed order, named once.
  const missing: [boolean, string][] = [
    [!!mol.arrows?.some((a) => !ids.has(a.id)), "arrows"], [!!mol.captions?.some((c) => !ids.has(c.id)), "text"], [kinds("symbol"), "free symbols"], [shapes.some(isBracket), "brackets"],
    [kinds("box") || kinds("rounded") || kinds("oval"), "shapes"], [kinds("picture"), "pictures"], [kinds("table") || !!mol.grids?.length, "tables"],
    [kinds("tlc"), "TLC plates"], [kinds("gel"), "gels"], [kinds("plasmid"), "plasmid maps"], [!!mol.cycles?.length, "catalytic cycles"], [!!mol.spectra?.length, "spectra"],
    [kinds("highlight") || atoms.some((a) => a.halo) || bonds.some((b) => b.halo), "highlights"], [!!mol.fills?.length, "ring fills"],
    [circledRings(mol).some((r) => !inSyntax.has(ringKey(r))), "aromatic circles"], 
    [!stereo && atoms.some((a) => a.cip), "stereo labels"], [atoms.some((a) => a.enhanced), "enhanced stereo marks"], [atoms.some((a) => a.query) || bonds.some((b) => b.query || b.topology || b.rxn), "query properties"],
    [atoms.some((a) => a.attach), "attachment points"], [atoms.some((a) => a.bead), "polymer beads"], [atoms.some((a) => a.hmark), "hydrogen dots and hashes"],
    [atoms.some((a) => a.labelAngle), "turned labels"], [atoms.some((a) => a.shade), "depth shading"],
  ];
  function scheme(kind: string) { return !!mol.arrows?.some((a) => ids.has(a.id) && a.kind === kind); }
  const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0]);
  const out: string[] = [], what = missing.filter(([on]) => on).map(([, name]) => name);
  if (what.length) out.push(`The code does not have the ${list(what)}.`);
  if (left.size) {
    const cs = [...left], named = cs.length > 5 ? [...cs.slice(0, 4), `${cs.length - 4} others`] : cs;
    out.push(`${out.length ? "It" : "The code"} does not have the character${cs.length > 1 ? "s" : ""} ${list(named)}.`);
  }
  const shows: [boolean, string][] = [
    [bonds.some((b) => b.type === QUADRUPLE), "quadruple bonds as triple bonds"], [bonds.some((b) => b.type === 2 && b.display === "either"), "crossed double bonds as double bonds"],
    [bonds.some((b) => b.type === 2 && b.display === "dashed"), "dashed double bonds with both lines dashed"], [bonds.some((b) => b.type === 2 && b.display === "bold"), "bold double bonds as double bonds"],
    // A scheme's arrows chemfig has no arrow for.
    ...(["retro", "dipole", "block"] as const).map((k): [boolean, string] => [scheme(k), `${k === "retro" ? "retrosynthetic" : k} arrows as plain arrows`]),
    [scheme("hash"), "hashed no-go arrows as crossed ones"],
  ];
  const changed = shows.filter(([on]) => on).map(([, x]) => x);
  if (changed.length) out.push(`${out.length ? "It" : "The code"} shows ${list(changed)}.`);
  return out.join(" ");
}

// For checks: what typeset() writes for a run of plain text in maths mode.
export const texText = (s: string) => { const left = new Set<string>(); return { tex: typeset(chars(s, {}), left), left: [...left] }; };
