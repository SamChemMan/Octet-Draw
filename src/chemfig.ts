// LaTeX chemfig code for a drawing's structures (Edit > Copy As > chemfig, and File > Export… as .tex): one
// \chemfig{…} that draws them as the page does. Every bond takes the absolute angle and length it has on the page, so
// any layout comes out as drawn. The structure is written as a tree from its leftmost atom: side chains are branches.
// An isolated regular ring is written in chemfig's ring syntax (*6(-=-=-=), **6 with its aromatic circle); any other
// ring bond by bond, each bond that closes it a hook (?[1] on the first atom, ?[1,{=}] on the second). Separate
// structures hang off the first one by bonds chemfig does not draw, so they keep their places. Lone pairs, unpaired
// electrons, circled and partial charges and atom and map numbers go where the page draws them, with chemfig's \charge.
// Reactions in a row are schemes, brackets \polymerdelim; other arrows, text and shapes are not written.
import { formulaCaption, formulaTextRuns, pieces, units } from "./labels.ts";
import { plainOf, runsOf, type TextRun } from "./richtext.ts";
import { ESCAPES } from "./escapes.ts";
import { chemicalCaption } from "./edit.ts";
import { H_FIRST, HBOND, QUADRUPLE, circledRings, hydrogens, inShape, isBracket, markAngles, markKeys, markKinds, orderOf, shapeCorners, turnedWith, type Bond, type Caption, type Drawing, type Mol } from "./render.ts";
import { polymerLabel, polymerTags } from "./query.ts";
import type { DocStyle } from "./docstyle.ts";

type P = [number, number];
// chemfig's atoms of a label, the one the bonds meet (0-based), and an H stacked above or below it.
type Group = { atoms: string[]; anchor: number; stack?: "above" | "below" };

// Text chemfig reads as one atom: one capital letter at the start (outside braces) and nothing it reads as a bond,
// a branch, a ring or a hook. Anything else goes in braces, which chemfig does not split.
function atom(s: string): string {
  let plain = s, was = "";
  while (plain !== was) { was = plain; plain = plain.replace(/\{[^{}]*\}/g, ""); }
  return /^[A-Z][a-z0-9_^'.+]*$/.test(plain) || (!plain && /^\{.*\}$/.test(s)) ? s : `{${s}}`;
}
// The atoms of a group joined: chemfig starts an atom at a capital, and | starts one anywhere else.
const joined = (atoms: string[]) => atoms.map((a, k) => (k && !/^[A-Z]/.test(a) ? `|${a}` : a)).join("");
// Characters beyond ASCII as LaTeX writes them, in maths mode (labels) and text mode (names), with no package that
// chemfig does not load: Greek by the names Octet takes when \delta is typed (escapes.ts), and the signs chemistry
// uses. Accented Latin letters pdfLaTeX sets in text as they are; in maths they go in an \mbox. Anything else is left
// as it is, and the code says so (unset()).
const GREEK = new Map<string, string>();
for (const [name, c] of Object.entries(ESCAPES)) if (/[Ͱ-Ͽ]/.test(c) && !GREEK.has(c)) GREEK.set(c, name);
const SIGNS: Record<string, [math: string, text: string]> = {
  "°": ["^{\\circ}", "\\textdegree{}"], "±": ["\\pm", "$\\pm$"], "∓": ["\\mp", "$\\mp$"], "×": ["\\times", "$\\times$"], "÷": ["\\div", "$\\div$"],
  "·": ["\\cdot", "$\\cdot$"], "•": ["\\bullet", "\\textbullet{}"], "−": ["-", "$-$"], "–": ["-", "--"], "—": ["-", "---"],
  "≤": ["\\leq", "$\\leq$"], "≥": ["\\geq", "$\\geq$"], "≠": ["\\neq", "$\\neq$"], "≈": ["\\approx", "$\\approx$"], "∼": ["\\sim", "$\\sim$"],
  "≡": ["\\equiv", "$\\equiv$"], "∝": ["\\propto", "$\\propto$"], "∞": ["\\infty", "$\\infty$"], "′": ["'", "$'$"], "″": ["''", "$''$"],
  "‰": ["\\mbox{\\textperthousand}", "\\textperthousand{}"], "√": ["\\surd", "$\\surd$"], "∂": ["\\partial", "$\\partial$"], "∇": ["\\nabla", "$\\nabla$"],
  "∫": ["\\int", "$\\int$"], "∑": ["\\sum", "$\\sum$"], "⋯": ["\\cdots", "$\\cdots$"], "…": ["\\ldots", "\\ldots{}"], "ħ": ["\\hbar", "$\\hbar$"],
  "Å": ["\\mbox{\\AA}", "\\AA{}"], "µ": ["\\mu", "$\\mu$"], "→": ["\\rightarrow", "$\\rightarrow$"], "←": ["\\leftarrow", "$\\leftarrow$"],
  "↔": ["\\leftrightarrow", "$\\leftrightarrow$"], "⇌": ["\\rightleftharpoons", "$\\rightleftharpoons$"], "↑": ["\\uparrow", "$\\uparrow$"], "↓": ["\\downarrow", "$\\downarrow$"],
  "‡": ["\\ddagger", "\\ddag{}"], "†": ["\\dagger", "\\dag{}"], "✱": ["\\ast", "$\\ast$"], "⊕": ["\\oplus", "$\\oplus$"], "⊖": ["\\ominus", "$\\ominus$"],
  "‘": ["`", "`"], "’": ["'", "'"], "“": ["``", "``"], "”": ["''", "''"], " ": ["\\,", "~"],
};
// Raised and lowered digits and signs (H₂O, ¹³C): each run as one script, since _{1}_{3} is an error in maths.
const SCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₀₁₂₃₄₅₆₇₈₉₊₋", PLAIN = "0123456789+-";
function unicode(s: string, text: boolean): string {
  const out = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+|[₀₁₂₃₄₅₆₇₈₉₊₋]+/g, (run) => {
    const up = SCRIPTS.indexOf(run[0]) < 12, d = [...run].map((c) => PLAIN[SCRIPTS.indexOf(c) % 12]).join("");
    return text ? `\\text${up ? "super" : "sub"}script{${d}}` : `${up ? "^" : "_"}{${d}}`;
  }).replace(/[^\x00-\x7f]/g, (c) => {
    const greek = GREEK.get(c), sign = SIGNS[c];
    if (greek) return text ? `$\\${greek}$` : `\\${greek}`;
    if (sign) return sign[text ? 1 : 0];
    // An accented Latin letter (é, ü, ß): as it is in text; in maths, set as text.
    return /[À-ÿ]/.test(c) && !text ? `\\mbox{${c}}` : c;
  });
  // Maths side by side in text is one piece: $\beta'$, not $\beta$$'$ (an escaped \$ stays).
  return text ? out.replace(/(?<!\\)\$\$/g, "") : out;
}
// Characters pdfLaTeX cannot set with what chemfig loads, left in the code as they are: anything beyond ASCII but an
// accented Latin letter (which pdfLaTeX sets in text, and which maths puts in an \mbox).
const unset = (code: string) => [...new Set(code.match(/[^\x00-\x7f]/g) ?? [])].filter((c) => !/[À-ÿ]/.test(c));
// Text in TeX's maths mode, with TeX's special characters escaped.
const tex = (s: string) => s.replace(/[\\#$%&~_^{}]/g, (c) => (c === "\\" ? "\\backslash " : c === "~" ? "\\sim " : c === "^" ? "\\hat{}" : `\\${c}`)).replace(/[^\x00-\x7f]+/g, (s) => unicode(s, false));
// A character of a label with its look: raised or lowered (a mass number, a count, a charge, or set by hand), bold,
// italic, underlined.
type Look = { bold?: boolean; italic?: boolean; underline?: boolean };
type Char = Look & { c: string; script?: "sub" | "super" };
const chars = (text: string, look: Look, script?: "sub" | "super"): Char[] => [...text].map((c) => ({ c, ...look, ...(script ? { script } : {}) }));
// Characters as TeX in chemfig's maths mode: each script in one _{…} or ^{…}, and each run of one look in maths
// alphabets, which shrink in a script as text commands do not. Bold italic is \boldmath round \mathit, which needs no
// package (\boldsymbol needs amsmath). A lone plain count stays bare (CH_3).
function typeset(cs: Char[]): string {
  const looked = (s: string, l: Look, small: boolean) => {
    const t = l.bold && l.italic ? `\\mbox{\\boldmath$${small ? "\\scriptstyle" : ""}\\mathit{${s}}$}` : l.bold ? `\\mathbf{${s}}` : l.italic ? `\\mathit{${s}}` : s;
    return l.underline ? `\\underline{${t}}` : t;
  };
  const same = (x: Look, y: Look) => !!x.bold === !!y.bold && !!x.italic === !!y.italic && !!x.underline === !!y.underline;
  let out = "";
  for (let k = 0; k < cs.length; ) {
    let e = k;
    while (e < cs.length && cs[e].script === cs[k].script) e++;
    let body = "";
    for (let j = k; j < e; ) {
      let f = j;
      while (f < e && same(cs[f], cs[j])) f++;
      body += looked(tex(cs.slice(j, f).map((x) => x.c).join("")), cs[j], !!cs[j].script);
      j = f;
    }
    const s = cs[k].script;
    out += !s ? body : s === "sub" && e - k === 1 && body.length === 1 ? `_${body}` : `${s === "sub" ? "_" : "^"}{${body}}`;
    k = e;
  }
  return out;
}
const sign = (charge: number, circled?: boolean) => (circled ? (charge > 0 ? "\\oplus" : "\\ominus") : `${Math.abs(charge) > 1 ? Math.abs(charge) : ""}${charge > 0 ? "+" : "-"}`);
const num = (x: number) => String(+x.toFixed(2));
// A caption as TeX text: a name under a structure (for \chemname), a condition on an arrow, or text in a scheme's row.
// Its lines joined by \\, each
// run in its look (bold, italic, underlined, raised or lowered, coloured) on top of the caption's own, and TeX's
// special characters escaped. Font and size are left to the document.
function nameOf(c: Caption): string {
  const esc = (s: string) => s.replace(/[\\#$%&~_^{}]/g, (x) => (x === "\\" ? "\\textbackslash{}" : x === "~" ? "\\textasciitilde{}" : x === "^" ? "\\textasciicircum{}" : `\\${x}`)).replace(/[^\x00-\x7f]+/g, (s) => unicode(s, true));
  const piece = (text: string, r: TextRun) => {
    let t = esc(text);
    if (r.script) t = `\\text${r.script === "super" ? "superscript" : "subscript"}{${t}}`;
    if (r.bold || c.bold) t = `\\textbf{${t}}`;
    if (r.italic || c.italic) t = `\\textit{${t}}`;
    if (r.underline || c.underline) t = `\\underline{${t}}`;
    const colour = rgb(r.colour ?? c.colour);
    return colour ? `\\textcolor[RGB]{${colour.join(",")}}{${t}}` : t;
  };
  const lines: string[] = [""];
  // Conditions on an arrow with no runs of their own are drawn as formulas (H₂SO₄), as the page draws them.
  const runs: TextRun[] = c.runs?.length ? c.runs : formulaCaption(c) ? formulaTextRuns(c.text) : runsOf(c);
  for (const r of runs) r.text.split("\n").forEach((part, k) => { if (k) lines.push(""); if (part) lines[lines.length - 1] += piece(part, r); });
  return lines.join("\\\\");
}
// #rrggbb as an xcolor colour, or undefined for none or black (the document's ink).
const rgb = (hex?: string) => {
  const m = hex && /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m && hex!.toLowerCase() !== "#000000" ? m.slice(1).map((h) => parseInt(h, 16)) : undefined;
};

// The rings written in chemfig's ring syntax (*6(-=-=-=)), each as its atoms counterclockwise: those chemfig draws as
// the page has them. chemfig draws a ring as a regular polygon with sides a bond long, and turns it so the bond into it
// points at its middle; a fused ring nested in another shares that ring's next side. Which systems qualify is below.
// Hidden atoms and hydrogen bonds do not count. Only atoms in a cycle are searched (the 2-core), so long chains cost
// nothing.
export function syntaxRings(mol: Mol): number[][] {
  const kept = mol.atoms.map((a) => !a.hidden), nb: number[][] = mol.atoms.map(() => []);
  for (const b of mol.bonds) if (b.type !== HBOND && b.atoms[0] !== b.atoms[1] && b.atoms.every((i) => kept[i])) { nb[b.atoms[0]].push(b.atoms[1]); nb[b.atoms[1]].push(b.atoms[0]); }
  const at = (i: number): P => [mol.atoms[i].location[0], mol.atoms[i].location[1]];
  // The 2-core: atoms left after taking off, again and again, those with one neighbour or none.
  const left = nb.map((n) => n.length), core = left.map(() => true), off = left.flatMap((n, i) => (n < 2 ? [i] : []));
  for (const i of off) { if (!core[i]) continue; core[i] = false; for (const j of nb[i]) if (core[j] && --left[j] < 2) off.push(j); }
  // The smallest ring through each bond in the core (a breadth-first search round it), each ring once.
  const found = new Map<string, number[]>();
  for (let p = 0; p < nb.length; p++) for (const q of nb[p]) {
    if (q < p || !core[p] || !core[q]) continue;
    const back = new Map<number, number>([[p, -1]]), queue = [p];
    for (let k = 0; k < queue.length && !back.has(q); k++) for (const r of nb[queue[k]]) if (core[r] && !back.has(r) && !(queue[k] === p && r === q)) { back.set(r, queue[k]); queue.push(r); }
    const ring: number[] = [];
    for (let x = back.has(q) ? q : -1; x !== -1; x = back.get(x)!) ring.push(x);
    if (ring.length) found.set([...ring].sort((x, y) => x - y).join(), ring);
  }
  const all = [...found.values()];
  // A ring on its own: 3 to 8 atoms, regular with sides of 1. Its atoms counterclockwise, and its middle.
  const shape = (ring: number[]) => {
    const n = ring.length;
    if (n < 3 || n > 8) return undefined;
    const c = ring.reduce<P>((s, i) => [s[0] + at(i)[0] / n, s[1] + at(i)[1] / n], [0, 0]), r = 1 / (2 * Math.sin(Math.PI / n));
    const t = (i: number) => Math.atan2(at(i)[1] - c[1], at(i)[0] - c[0]), ccw = [...ring].sort((x, y) => t(x) - t(y));
    const regular = ccw.every((i, k) => {
      const next = ccw[(k + 1) % n], gap = ((t(next) - t(i) + 4 * Math.PI) % (2 * Math.PI)) - (2 * Math.PI) / n;
      return Math.abs(Math.hypot(at(i)[0] - c[0], at(i)[1] - c[1]) - r) < 0.03 && Math.abs(gap) < (2 * Math.PI) / 180 && nb[i].includes(next);
    });
    return regular ? { ccw, c } : undefined;
  };
  // Rings that share atoms are one system (fused, spiro or bridged), found by joining them.
  const top = all.map((_, k) => k), find = (k: number): number => (top[k] === k ? k : (top[k] = find(top[k])));
  const owners = new Map<number, number[]>();
  all.forEach((r, k) => { for (const i of r) owners.set(i, [...(owners.get(i) ?? []), k]); });
  for (const ks of owners.values()) for (const k of ks.slice(1)) top[find(k)] = find(ks[0]);
  const systems = new Map<number, number[]>();
  all.forEach((_, k) => systems.set(find(k), [...(systems.get(find(k)) ?? []), k]));
  // A system goes in ring syntax (fused rings nested, *6(-=*6(...)-=-=)) only when chemfig draws it as the page has it:
  // every ring regular on its own; rings joined only by sharing one side (no spiro or bridged joins), no atom in three
  // rings, and the rings' joins a tree (ortho-fused: naphthalene, phenanthrene; not pyrene); its fusion atoms (in two
  // rings) atoms with no bond out of the system, labelled or not (a nested ring's last side ends on an invisible copy of
  // the label, so chemfig stops it at the label's edge); and every bond out of the system pointing straight out from its
  // own ring's middle (within 3°). Every other system is written bond by bond.
  return [...systems.values()].flatMap((ks) => {
    const shapes = ks.map((k) => shape(all[k]));
    if (shapes.some((s) => !s)) return [];
    const inSystem = new Set(ks.flatMap((k) => all[k])), fusion = new Set([...inSystem].filter((i) => owners.get(i)!.length > 1));
    if ([...inSystem].some((i) => owners.get(i)!.length > 2)) return [];
    let joins = 0;
    for (let x = 0; x < ks.length; x++) for (let y = x + 1; y < ks.length; y++) {
      const shared = all[ks[x]].filter((i) => all[ks[y]].includes(i));
      if (!shared.length) continue;
      if (shared.length !== 2 || !nb[shared[0]].includes(shared[1])) return [];
      joins++;
    }
    if (joins !== ks.length - 1) return [];
    if ([...fusion].some((i) => nb[i].length !== 3 || mol.atoms[i].centre)) return [];
    // Every bond out of the system points straight out from the middle of its atom's ring.
    const radial = ks.every((k, x) => all[k].every((i) => fusion.has(i) || nb[i].filter((j) => !inSystem.has(j)).every((j) => {
      const c = shapes[x]!.c, out = Math.atan2(at(i)[1] - c[1], at(i)[0] - c[0]), d = Math.atan2(at(j)[1] - at(i)[1], at(j)[0] - at(i)[0]);
      return Math.abs(Math.atan2(Math.sin(d - out), Math.cos(d - out))) < (3 * Math.PI) / 180;
    })));
    return radial ? shapes.map((s) => s!.ccw) : [];
  });
}

// options.compact: the code on one line, as chemfig's manual writes it. Without it, an atom a line, indented by branch.
// options.page: the page's drawing of mol (render.ts: its electrons and scale), so each mark goes exactly where the
// page has it, its label's real outline counted. Without it, marks() works their places out from the bonds and labels.
// options.schemes: the reactions in mol as Octet reads them (reaction.ts, interpret.ts), each as its row in order
// (structures by their atoms, text by its caption, plus signs and arrows by their ids) and each arrow's conditions above
// and below it. They are written as chemfig's \schemestart rows.
export type PageMarks = Pick<Drawing, "electrons" | "scale"> & Partial<Pick<Drawing, "maps">>;
export type SchemeItem = { atoms: number[] } | { caption: number };
export type Scheme = { row: (SchemeItem | { plus: number } | { arrow: number })[]; above: Map<number, SchemeItem[]>; below: Map<number, SchemeItem[]> };
export function toChemfig(mol: Mol, style: Partial<Pick<DocStyle, "terminalLabels" | "carbonLabels" | "hideH">> = {}, options: { compact?: boolean; page?: PageMarks; schemes?: Scheme[] } = {}): string {
  const atoms = mol.atoms, kept = atoms.map((a) => !a.hidden);
  const bonds = mol.bonds.filter((b) => b.atoms.every((i) => kept[i]) && b.atoms[0] !== b.atoms[1]);
  if (!kept.some(Boolean)) return "";
  // Rings in ring syntax, and those of them the page draws with a circle (Toggle Aromatic Display): **6(------).
  const ringList = syntaxRings(mol), ringKey = (r: number[]) => [...r].sort((x, y) => x - y).join();
  const circled = new Set(circledRings(mol).map(ringKey));
  const at = (i: number): P => [atoms[i].location[0], atoms[i].location[1]];
  const nbrs: { to: number; bond: Bond }[][] = atoms.map(() => []);
  for (const b of bonds) { nbrs[b.atoms[0]].push({ to: b.atoms[1], bond: b }); nbrs[b.atoms[1]].push({ to: b.atoms[0], bond: b }); }
  const deg = (i: number) => nbrs[i].length;
  // The sum of the directions to an atom's neighbours (y up): which way its bonds go.
  const pull = (i: number): P => nbrs[i].reduce<P>((v, { to }) => { const d = [at(to)[0] - at(i)[0], at(to)[1] - at(i)[1]], l = Math.hypot(d[0], d[1]) || 1; return [v[0] + d[0] / l, v[1] + d[1] / l]; }, [0, 0]);
  // Which atoms show a label, as the page decides (render.ts).
  const labelled = atoms.map((a, i) => (a.centre ? !deg(i) : !a.attach && !a.bead && (a.label !== "C" || !deg(i) || !!a.text || !!a.isotope || !!a.shown || (deg(i) === 1 ? !!style.terminalLabels : !!style.carbonLabels))));

  // A label as chemfig's atoms. It reads away from its bonds, as on the page: H₂N and MeO where the bonds go right.
  function group(i: number): Group {
    const a = atoms[i], charge = a.charge ?? 0, v = pull(i), colour = rgb(a.colour);
    const steep = Math.hypot(v[0], v[1]) > 1e-6 && Math.abs(v[1]) > Math.abs(v[0]) * Math.tan((70 * Math.PI) / 180);
    const rtl = a.align ? a.align === "right" : deg(i) > 0 && !steep && v[0] > 1e-6;
    const tint = (g: Group): Group => (colour ? { ...g, atoms: g.atoms.map((s) => `{\\color[RGB]{${colour.join(",")}}${s}}`) } : g);
    // A skeletal carbon has no label: marks() adds its charge and its other marks.
    if (!labelled[i]) return { atoms: [], anchor: 0 };
    // The label's own bold, italic and underline (the Text menu on the label) go on all of it, its H, counts and sign.
    const look: Look = { ...(a.bold ? { bold: true } : {}), ...(a.italic ? { italic: true } : {}), ...(a.underline ? { underline: true } : {}) };
    // A circled charge is a mark beside the label (marks()); a plain one is written after the label.
    const ch = charge && !a.circled ? typeset(chars(sign(charge), look, "super")) : "";
    if (a.text) {
      // A written label's characters styled as they were typed (its runs): bold, italic, underlined, or raised or
      // lowered by hand, each on top of the label's own look. A count in a script set by hand takes that script.
      const runs = a.runs && plainOf(a.runs) === a.text ? a.runs.flatMap((r) => [...r.text].map(() => r)) : undefined;
      // Raised or lowered digits typed as such (R¹³, which reads as a unit a digit) are one unit, so they are one script.
      const scriptOnly = (u: { text: string; count?: string; kind: string }) => u.kind !== "bracket" && !u.count && /^[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻₀₁₂₃₄₅₆₇₈₉₊₋]+$/.test(u.text);
      const merged = units(a.text).reduce<ReturnType<typeof units>>((list, u) => {
        const last = list[list.length - 1];
        if (last && scriptOnly(last) && scriptOnly(u)) list[list.length - 1] = { ...last, text: last.text + u.text };
        else list.push(u);
        return list;
      }, []);
      let n = 0;
      const typed = merged.map((u) => {
        const parts = u.kind === "bracket" ? pieces(u) : [u], start = n;
        const cs = parts.flatMap((p) => [...chars(p.text, look), ...chars(p.count ?? "", look, "sub")]).map((x, k): Char => {
          const r = runs?.[start + k];
          return { ...x, ...(r?.bold ? { bold: true } : {}), ...(r?.italic ? { italic: true } : {}), ...(r?.underline ? { underline: true } : {}), ...(r?.script ? { script: r.script } : {}) };
        });
        n += cs.length;
        return { text: typeset(cs), raised: scriptOnly(u) || (cs.length > 0 && cs.every((_, k) => runs?.[start + k]?.script)) };
      });
      // A unit all in a script (the III of Fe with III raised, the ¹³ of R¹³) stays with the unit before it, whichever
      // way the label reads, as on the page.
      const joinedUnits: string[] = [];
      typed.forEach((t, k) => { if (t.raised && k) joinedUnits[joinedUnits.length - 1] += t.text; else joinedUnits.push(t.text); });
      const out = (rtl ? joinedUnits.reverse() : joinedUnits).map(atom);
      if (!out.length) return { atoms: [], anchor: 0 };
      out[out.length - 1] = atom(out[out.length - 1] + ch);
      return tint({ atoms: out, anchor: rtl ? out.length - 1 : 0 });
    }
    if (a.centre) return { atoms: ["*"].map(atom), anchor: 0 };
    const used = nbrs[i].reduce((n, { bond }) => n + orderOf(bond.type), 0);
    const h = style.hideH ? 0 : a.implicitHCount ?? hydrogens(a.label, charge, used, a.radical === 3 ? 2 : a.radical);
    const el = atom(typeset([...chars(a.isotope ? String(a.isotope) : "", look, "super"), ...chars(a.label, look)]));
    const hs = h ? typeset([...chars("H", look), ...chars(h > 1 ? String(h) : "", look, "sub")]) : "";
    const back = rtl || (!a.align && !deg(i) && !!h && H_FIRST.has(a.label));
    // An H the bonds leave no room for beside the atom stacks above or below it (indole's NH).
    const stack = h && (a.align === "above" || a.align === "below" ? a.align : !a.align && !back && steep && deg(i) >= 2 ? (v[1] < 0 ? "above" : "below") : undefined);
    if (stack) return tint({ atoms: [atom(`\\chem${stack}{${el}}{${hs}}${ch}`)], anchor: 0, stack });
    if (!hs) return tint({ atoms: [atom(el + ch)], anchor: 0 });
    return tint(back ? { atoms: [atom(hs), atom(el + ch)], anchor: 1 } : { atoms: [el, atom(hs + ch)], anchor: 0 });
  }
  // Lone pairs, unpaired electrons, and circled and partial charges, as chemfig's \charge round the atom its bonds
  // meet, where the page puts them (render.ts markAngles): where they were dragged, else in the widest gaps between
  // the atom's bonds, the rest of its label and its charge sign. Lewis dots and bars turn to face out (chemfig's
  // lewisautorot). A skeletal carbon's \charge, with its charge sign too, is the whole atom: chemfig joins the bonds
  // through it. The \charge is never in braces, which would hide it.
  // Also the atom's number (Show Atom Number) and its reaction map number, as small text beside it.
  const reach: { atom: number; p: P }[] = []; // where each mark reaches (where())
  function marks(i: number, g: Group): Group {
    const a = atoms[i], kinds = markKinds(a), skeletal = !labelled[i] && !!a.charge && !a.circled;
    if (!kinds.length && !skeletal && !a.number && !a.map) return g;
    // Directions in the page's frame (y down, radians), as markAngles takes them.
    const down = (q: P) => Math.atan2(-(q[1] - at(i)[1]), q[0] - at(i)[0]), v = pull(i);
    const taken = nbrs[i].map(({ to }) => down(at(to)));
    if (g.stack) taken.push(g.stack === "above" ? -Math.PI / 2 : Math.PI / 2);
    else if (g.atoms.length > 1) { if (g.anchor < g.atoms.length - 1) taken.push(0); if (g.anchor > 0) taken.push(Math.PI); }
    // A plain charge sign goes up and to the right of a label (to the left of one read backwards), or away from a
    // skeletal carbon's bonds.
    const signAt = skeletal ? Math.atan2(v[1], -v[0]) : labelled[i] && a.charge && !a.circled ? (g.anchor > 0 ? (-3 * Math.PI) / 4 : -Math.PI / 4) : undefined;
    if (signAt !== undefined) taken.push(signAt);
    const keys = markKeys(kinds), guessed = markAngles(kinds, keys, taken, a.angles);
    // Where the page drew a mark (its electrons, px with y down, about the atom at location × scale), when it is given.
    const drawn = (key: string) => {
      const e = options.page?.electrons.find((x) => x.atom === i && x.key === key), k = options.page?.scale ?? 1;
      const d = e && [e.at[0] - a.location[0] * k, e.at[1] + a.location[1] * k];
      // A mark drawn on the atom itself gives no direction: the angle is worked out instead.
      return d && Math.hypot(d[0], d[1]) > 1e-3 ? Math.atan2(d[1], d[0]) : undefined;
    };
    const ts = kinds.map((_, k) => drawn(keys[k]) ?? guessed[k]), sign0 = skeletal ? drawn("charge") ?? signAt : signAt;
    // chemfig's place for a mark: the angle in degrees anticlockwise (y up), from -179 to 180, and how far out. Dots
    // and bars sit a little clear of a label, and further from an empty atom, which has no box. A sign or δ touches
    // the place with its near side (anchor=180+\chargeangle), not its middle, so it stays off the label and bonds.
    // size: how big the mark is (pt): dots small, text a small number's size.
    const where = (t: number, gap: number, size = 7) => {
      const d = ((Math.round((-t * 180) / Math.PI) % 360) + 360) % 360;
      // How far out the mark reaches, roughly (bond lengths, a bond being 3em, about 30pt): past a label, its gap, and
      // its size. chemfig leaves overlaid marks out of the picture's box; chemfig() puts them back in.
      const out = (labelled[i] ? 0.15 : 0) + (gap + size) / 30;
      reach.push({ atom: i, p: [at(i)[0] + Math.cos(t) * out, at(i)[1] - Math.sin(t) * out] });
      return `${d > 180 ? d - 360 : d}:${gap}pt`;
    };
    const dots = (t: number) => where(t, labelled[i] ? 1 : 2, 3), text = (t: number) => `${where(t, labelled[i] ? 0 : 1)}[anchor=180+\\chargeangle]`;
    const c = rgb(a.colour), paint = c ? `\\color[RGB]{${c.join(",")}}` : "", tikz = c ? `{rgb,255:red,${c[0]};green,${c[1]};blue,${c[2]}}` : "";
    const items = kinds.flatMap((kind, k) => {
      if (kind === "radical") return [`${dots(ts[k])}=\\.`];
      if (kind === "pair") return [`${dots(ts[k])}=${a.bars ? "\\|" : "\\:"}`];
      if (kind === "charge") return [`${text(ts[k])}=$${paint}\\scriptstyle ${sign(a.charge!, true)}$`];
      if (kind === "partial") return [`${text(ts[k])}=$${paint}\\scriptstyle\\delta^{${a.partial === "+" ? "+" : "-"}}$`];
      return []; // the query indicator: chemfig has no query properties
    });
    if (skeletal) items.unshift(`${text(sign0!)}=$${paint}\\scriptstyle ${sign(a.charge!)}$`);
    // The numbers stay clear of the bonds, the rest of the label and the marks (y down, as above).
    const avoid = [...taken, ...ts, ...(sign0 === undefined ? [] : [sign0])];
    const number = (t: number, gap: number, n: string) => `${where(t, gap)}[anchor=180+\\chargeangle]=$${paint}\\scriptstyle ${tex(n)}$`;
    if (a.number) {
      const t = beside(i, avoid);
      avoid.push(t);
      items.push(number(t, labelled[i] ? 3 : 9, a.number));
    }
    // A map number where the page drew it (its maps, px with y down) when it is given; else, as the page puts it, after
    // a label that reads one way (OH, H2N), level with the atom, or on the atom's open side.
    // Beside a label, level with it, it follows the label's last letter that way (after the H of OH), so its \charge is
    // on that atom of the label (end).
    let end: { at: number; item: string } | undefined;
    if (a.map) {
      const m = options.page?.maps?.find((x) => x.atom === i), k = options.page?.scale ?? 1;
      const d = m && [m.at[0] - a.location[0] * k, m.at[1] + a.location[1] * k];
      const t = d && Math.hypot(d[0], d[1]) > 1e-3 ? Math.atan2(d[1], d[0]) : labelled[i] && g.atoms.length > 1 && !g.stack ? (g.anchor > 0 ? Math.PI : 0) : beside(i, avoid);
      const level = labelled[i] && g.atoms.length > 1 && !g.stack && Math.abs(Math.cos(t)) > 0.9, side = Math.cos(t) > 0 ? g.atoms.length - 1 : 0;
      // (It reaches a letter further for each letter of the label it follows.)
      if (level && side !== g.anchor) {
        end = { at: side, item: number(t, 1, String(a.map)) };
        reach.push({ atom: i, p: [at(i)[0] + Math.sign(Math.cos(t)) * (0.45 + 0.3 * Math.abs(side - g.anchor)), at(i)[1]] });
      }
      else items.push(number(t, labelled[i] ? 1 : 3, String(a.map)));
    }
    if (!items.length && !end) return g;
    // Dots and bars in the atom's colour.
    const dotStyle = tikz ? `[.style={fill=${tikz}},|style={color=${tikz},line width=0.4pt}]` : "";
    const wrap = (content: string, list = items) => (list.length ? `\\charge{${dotStyle}${list.join(",")}}{${content}}` : content);
    if (!g.atoms.length) return { atoms: [wrap("")], anchor: 0 };
    return { ...g, atoms: g.atoms.map((s, k) => (k === g.anchor ? wrap(s) : k === end?.at ? wrap(s, [end.item]) : s)) };
  }
  // Where a number goes beside an atom, as the page puts an atom number (Editor besideAtom): in the middle of a gap
  // between its bonds, wider gaps first, then those facing away from its ring (or the atoms two bonds off); the first
  // that is clear of avoid (directions taken, y down). Radians, y down.
  function beside(i: number, avoid: number[]): number {
    const up = nbrs[i].map(({ to }) => Math.atan2(at(to)[1] - at(i)[1], at(to)[0] - at(i)[0])).sort((x, y) => x - y);
    const ring = nbrs[i].map(({ to }) => smallestRing(i, to)).find(Boolean);
    const around = ring ?? [...new Set(nbrs[i].flatMap(({ to }) => nbrs[to].map((x) => x.to)))].filter((j) => j !== i);
    const mean = around.reduce<P>((s, j) => [s[0] + at(j)[0] / around.length, s[1] + at(j)[1] / around.length], [0, 0]);
    const away = around.length ? Math.atan2(at(i)[1] - mean[1], at(i)[0] - mean[0]) : Math.PI / 2;
    const gaps = !up.length ? [{ m: Math.PI / 2, score: 0 }] : up.length === 1 ? [{ m: up[0] + Math.PI, score: 1 }, { m: up[0] + Math.PI / 2, score: 0 }, { m: up[0] - Math.PI / 2, score: 0 }]
      : up.map((t, k) => { const next = k + 1 < up.length ? up[k + 1] : up[0] + 2 * Math.PI, m = (t + next) / 2; return { m, score: next - t + 0.3 * Math.cos(m - away) }; });
    gaps.sort((p, q) => q.score - p.score);
    const clear = (m: number) => avoid.every((t) => Math.abs(Math.atan2(Math.sin(-m - t), Math.cos(-m - t))) > Math.PI / 6);
    return -(gaps.find((g) => clear(g.m)) ?? gaps[0]).m;
  }
  // Each atom's label (bare: without its marks) as chemfig's atoms.
  const bare = atoms.map((_, i) => (kept[i] ? group(i) : { atoms: [], anchor: 0 })), groups = atoms.map((_, i) => (kept[i] ? marks(i, bare[i]) : bare[i]));

  // Where a double bond's second line goes, as the page puts it: 1 left of atoms[0] → atoms[1], -1 right, 0 centred.
  function side(b: Bond): number {
    if (b.position) return b.position === "centre" ? 0 : b.position === "left" ? 1 : -1;
    const [p, q] = b.atoms, d: P = [at(q)[0] - at(p)[0], at(q)[1] - at(p)[1]], n: P = [-d[1], d[0]];
    const sd = (j: number) => Math.sign((at(j)[0] - at(p)[0]) * n[0] + (at(j)[1] - at(p)[1]) * n[1]);
    const ring = smallestRing(p, q);
    if (ring) {
      const c = ring.reduce<P>((s, j) => [s[0] + at(j)[0] / ring.length, s[1] + at(j)[1] / ring.length], [0, 0]);
      return Math.sign((c[0] - at(p)[0]) * n[0] + (c[1] - at(p)[1]) * n[1]);
    }
    if (deg(p) === 1 || deg(q) === 1) {
      const inner = deg(p) === 1 ? q : p, outer = inner === p ? q : p;
      return deg(inner) === 2 && !labelled[inner] ? sd(nbrs[inner].find((x) => x.to !== outer)!.to) : 0;
    }
    if (labelled[p] && labelled[q]) return 0;
    const others = [...nbrs[p].filter((x) => x.to !== q), ...nbrs[q].filter((x) => x.to !== p)];
    return Math.sign(others.reduce((s, x) => s + sd(x.to), 0)) || sd(others[0].to);
  }
  // The smallest ring (up to 8 atoms) through a bond, by a breadth-first search round it.
  function smallestRing(p: number, q: number): number[] | undefined {
    const back = new Map<number, number>([[p, -1]]), queue = [p];
    for (let k = 0; k < queue.length && !back.has(q); k++) {
      const x = queue[k];
      for (const { to, bond } of nbrs[x]) if (!back.has(to) && !(x === p && to === q) && bond.type !== HBOND) { back.set(to, x); queue.push(to); }
    }
    if (!back.has(q)) return undefined;
    const ring: number[] = [];
    for (let x = q; x !== -1; x = back.get(x)!) ring.push(x);
    return ring.length <= 8 ? ring : undefined;
  }

  let wavy = false; // a wavy bond needs a TikZ library, which the code says
  // A bond drawn from atom u: its chemfig bond character and the TikZ options that chemfig has no character for.
  function look(b: Bond, u: number): { char: string; tikz: string[] } {
    const forward = b.atoms[0] === u, tikz: string[] = [], c = rgb(b.colour);
    if (c) tikz.push(`color={rgb,255:red,${c[0]};green,${c[1]};blue,${c[2]}}`);
    // A wedge's narrow end is at atoms[0]; chemfig's < is narrow at the atom it leaves, > wide.
    const cram = (s: string) => (forward ? "<" : ">") + s;
    if (b.type === HBOND) return { char: "-", tikz: [...tikz, "dotted"] };
    if (b.type === 2) {
      const s = side(b) * (forward ? 1 : -1);
      if (b.display === "dashed" || b.display === "aromatic") tikz.push("dashed");
      return { char: s > 0 ? "=^" : s < 0 ? "=_" : "=", tikz };
    }
    if (b.type === 3 || b.type === QUADRUPLE) return { char: "~", tikz };
    if (b.stereo === 1) return { char: cram(""), tikz };
    if (b.stereo === 6) return { char: cram(":"), tikz };
    switch (b.display) {
      case "hollow": return { char: cram("|"), tikz };
      case "bold": return { char: "-", tikz: [...tikz, "line width=2pt"] };
      case "dashed": return { char: "-", tikz: [...tikz, "dashed"] };
      case "hashed": return { char: "-", tikz: [...tikz, "line width=2pt", "dash pattern=on 0.4pt off 1.2pt"] };
      case "wavy": wavy = true; return { char: "-", tikz: [...tikz, "decorate", "decoration={snake,amplitude=0.6pt,segment length=2.4pt}"] };
      case "dative": return { char: "-", tikz: [...tikz, forward ? "-stealth" : "stealth-"] };
      default: return { char: "-", tikz };
    }
  }
  const tikzOf = (t: string[]) => (t.length > 1 ? t.join(",") : t[0] ?? "");

  // A bond from u to v: its character and [angle, length, departure atom, arrival atom, TikZ]. chemfig leaves the
  // last atom of a group and meets the first of the next when the bond points right (between -90° and 90°), else the
  // reverse; the atoms are given only where that is not the label's attaching atom.
  // side: a ring's side, which takes no angle or length (the ring sets them). With rings in ring syntax, every other
  // bond gives its angle, 0 too: chemfig's default there is a ring's bisector, or the turn at the start.
  function bondCode(u: number, v: number, char: string, tikz: string, side = false): string {
    const d: P = [at(v)[0] - at(u)[0], at(v)[1] - at(u)[1]], length = Math.hypot(d[0], d[1]), exact = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
    let angle = Math.round(exact);
    if (angle <= -180) angle += 360;
    const right = angle > -90 && angle < 90, gu = groups[u], gv = groups[v];
    // Unless told, chemfig leaves a label from its last atom when the bond points right (between -90° and 90°), else
    // from its first, and meets a label at its first atom when the bond points right, else at its last; but a bond
    // straight up or down meets it at its first, so there the atom it meets is always given. A ring's sides chemfig
    // turns itself, so an upright side can come out a hair either side of ±90°: there both atoms are always given.
    const upright = side ? Math.abs(Math.abs(exact) - 90) < 1 : Math.abs(angle) === 90;
    const from = gu.atoms.length > 1 && ((side && upright) || gu.anchor !== (right ? gu.atoms.length - 1 : 0)) ? String(gu.anchor + 1) : "";
    const to = gv.atoms.length > 1 && (upright || gv.anchor !== (right ? 0 : gv.atoms.length - 1)) ? String(gv.anchor + 1) : "";
    const fields = side ? ["", "", from, to, tikz] : [angle || ringList.length ? `:${angle}` : "", Math.abs(length - 1) > 0.02 ? num(length) : "", from, to, tikz];
    while (fields.length && !fields[fields.length - 1]) fields.pop();
    return char + (fields.length ? `[${fields.join(",")}]` : "");
  }

  // The tree each structure is written as, from its leftmost atom. Bonds chemfig has a character for that it cannot
  // write on a hook as well (wedges, double bonds) are taken first, so a ring is closed by a plain bond where it can be.
  const seen = atoms.map(() => false), children: number[][] = atoms.map(() => []), via: (Bond | undefined)[] = atoms.map(() => undefined);
  const hooks: string[][] = atoms.map(() => []), done = new Set<Bond>();
  const plain = (b: Bond) => b.type === 1 && !b.stereo && !b.display && !b.colour;
  let hookCount = 0;
  // A ring system in ring syntax is taken whole where the walk first meets it (its entry, never a fusion atom): its
  // first ring's atoms counterclockwise from there (ringAt), each fused ring nested at the atom where it shares that
  // ring's next side (nestedAt: its atoms counterclockwise from there, its last the side's other end), all its bonds
  // done. Its atoms' other bonds are walked as usual: their branches go inside the rings' code. All or nothing.
  const ringsOf = new Map<number, number[][]>(), ringAt = new Map<number, number[]>(), nestedAt = new Map<number, number[]>(), systemAt = new Map<number, number[]>();
  for (const r of ringList) for (const i of r) ringsOf.set(i, [...(ringsOf.get(i) ?? []), r]);
  const turnTo = (r: number[], v: number) => { const k = r.indexOf(v); return [...r.slice(k), ...r.slice(0, k)]; };
  const enter = (v: number, stack: number[]) => {
    const own = ringsOf.get(v);
    if (!own || own.length !== 1) return;
    const placed = new Set<number[]>([own[0]]), nest = new Map<number, number[]>(), todo = [turnTo(own[0], v)];
    for (const path of todo) for (let k = 1; k < path.length - 1; k++) {
      const next = ringsOf.get(path[k])?.find((r) => !placed.has(r) && r.includes(path[k + 1]));
      if (!next) continue;
      const sub = turnTo(next, path[k]);
      if (sub[sub.length - 1] !== path[k + 1]) return; // not the shape the rules promise: leave it bond by bond
      placed.add(next);
      nest.set(path[k], sub);
      todo.push(sub);
    }
    const system = [...new Set(todo.flat())];
    if (system.some((i) => i !== v && seen[i]) || ringList.some((r) => r.some((i) => system.includes(i)) && !placed.has(r))) return;
    ringAt.set(v, todo[0]);
    systemAt.set(v, system.filter((i) => i !== v));
    for (const [i, sub] of nest) nestedAt.set(i, sub);
    for (const r of placed) r.forEach((i, j) => { seen[i] = true; done.add(nbrs[i].find((x) => x.to === r[(j + 1) % r.length])!.bond); });
    stack.push(...system.filter((i) => i !== v).reverse());
  };
  function walk(root: number) {
    const stack = [root];
    seen[root] = true;
    enter(root, stack);
    while (stack.length) {
      const u = stack[stack.length - 1], next = nbrs[u].filter((x) => !done.has(x.bond)).sort((x, y) => Number(plain(x.bond)) - Number(plain(y.bond)))[0];
      if (!next) { stack.pop(); continue; }
      done.add(next.bond);
      if (!seen[next.to]) { seen[next.to] = true; via[next.to] = next.bond; children[u].push(next.to); stack.push(next.to); enter(next.to, stack); continue; }
      // A ring closes: next.to is on the path to u, so it is written first. chemfig draws the hook's bond from there.
      const name = String(++hookCount), { char, tikz } = look(next.bond, next.to);
      hooks[next.to].push(`?[${name}]`);
      const t = tikzOf(tikz);
      const fields = [name, char === "-" ? "" : `{${char}}`, t];
      while (!fields[fields.length - 1]) fields.pop();
      hooks[u].push(`?[${fields.join(",")}]`);
    }
  }
  const order = atoms.map((_, i) => i).filter((i) => kept[i]).sort((i, j) => at(i)[0] - at(j)[0] || at(j)[1] - at(i)[1]);
  const roots: number[] = [];
  // A structure whose leftmost atom is in a ring in ring syntax starts at the ring's atom with the one before it
  // straight above (chemfig's own way round, so it needs no turn), where the ring has one that is not a fusion atom;
  // else a fusion atom gives way to the ring's first atom that is not one (a system is never entered at a fusion atom).
  const upright = (i: number) => {
    const rs = ringsOf.get(i);
    if (!rs) return i;
    const fused = (v: number) => ringsOf.get(v)!.length > 1;
    for (const r of rs) {
      const k = r.findIndex((v, j) => { const w = r[(j + r.length - 1) % r.length]; return !fused(v) && Math.abs(at(w)[0] - at(v)[0]) < 0.02 && at(w)[1] > at(v)[1]; });
      if (k >= 0) return r[k];
    }
    if (!fused(i)) return i;
    const system = [...rs];
    for (const r of system) for (const v of r) for (const s of ringsOf.get(v)!) if (!system.includes(s)) system.push(s);
    return system.flat().find((v) => !fused(v)) ?? i;
  };
  for (const i of order) if (!seen[i]) { const r = upright(i); roots.push(r); walk(r); }
  // How long a chain runs on from each atom: the longest child is written last, as the main chain, without brackets.
  // Worked out leaves first, from each tree's atoms in the order the walk reached them, so a long chain needs no deep
  // recursion.
  // The atoms just below an atom in the tree: its children, and a ring system's other atoms at its entry.
  const below = (u: number) => [...children[u], ...(systemAt.get(u) ?? [])];
  const height = atoms.map(() => 0);
  for (const r of roots) {
    const reached = [r];
    for (let k = 0; k < reached.length; k++) reached.push(...below(reached[k]));
    for (let k = reached.length - 1; k >= 0; k--) { const u = reached[k]; height[u] = children[u].reduce((m, c) => Math.max(m, 1 + height[c]), 0); }
  }

  const text = (i: number) => {
    const g = groups[i], hs = hooks[i].join("");
    if (!g.atoms.length) return hs;
    const out = [...g.atoms];
    out[g.anchor] += hs;
    return joined(out);
  };
  const edge = (u: number, v: number) => { const { char, tikz } = look(via[v]!, u); return bondCode(u, v, char, tikzOf(tikz)); };
  // The code as lines, each with its depth in branches: an atom with the bond to it, and each branch's brackets on
  // lines of their own. The chain runs on from atom to atom (a loop, so a long chain needs no deep recursion).
  // others: structures that hang off this atom by bonds chemfig does not draw.
  let lines: [number, string][] = [];
  let decor: string[] = []; // branches the next root written takes first (a bracket's nodes)
  function write(u: number, depth: number, lead: string, others: number[] = []) {
    for (let at = u, head = lead; ; ) {
      const ring = ringAt.get(at);
      // A ring's entry opens its code: chemfig turns it so the bond into it points at its middle (a first atom turns
      // it with [:θ] at the start, so its last side comes down onto it as chemfig's own does). Everything off the entry
      // goes inside as its branches, then each atom of the ring with its bond and branches, then the side back.
      const first = !lead && !depth && at === u && ring ? turnFor(ring) : "";
      const line = first + head + text(at) + (ring ? `${circled.has(ringKey(ring)) ? "**" : "*"}${ring.length}(` : "");
      if (line) lines.push([depth, line]);
      const inner = ring ? depth + 1 : depth;
      for (const d of decor) lines.push([inner, d]);
      decor = [];
      const kids = [...children[at]].sort((x, y) => height[x] - height[y]), last = ring ? undefined : kids.pop();
      const branch = (code: string, v: number, d = inner) => { lines.push([d, "("]); write(v, d + 1, code); lines.push([d, ")"]); };
      for (const r of others) branch(hangCode(at, r), r);
      for (const v of kids) branch(edge(at, v), v);
      // A ring's atoms after its first, each with its side and branches, and a ring fused at it nested after it. A
      // fused ring (open) ends on its parent's next atom, which the parent writes: its last side meets an empty atom, or
      // an invisible copy of that atom's label (without its marks), so chemfig stops the side at the label's edge.
      const sides = (ring: number[], d: number, open: boolean) => {
        const end = open ? ring.length - 1 : ring.length;
        for (let k = 1; k <= end; k++) {
          const p = ring[k - 1], q = ring[k % ring.length];
          lines.push([d, ringBond(p, q) + (k < end ? text(q) : open ? phantom(q) : "")]);
          if (k === end) break;
          const sub = nestedAt.get(q);
          if (sub) { lines.push([d, `${circled.has(ringKey(sub)) ? "**" : "*"}${sub.length}(`]); sides(sub, d + 1, true); lines.push([d, ")"]); }
          for (const v of [...children[q]].sort((x, y) => height[x] - height[y])) branch(edge(q, v), v, d);
        }
      };
      if (ring) {
        sides(ring, inner, false);
        lines.push([depth, ")"]);
        return;
      }
      if (last === undefined) return;
      [head, at, others] = [edge(at, last), last, []];
    }
  }
  const phantom = (i: number) => (bare[i].atoms.length ? joined(bare[i].atoms.map((s) => `{\\phantom{${s}}}`)) : "{}");
  // A ring's side: its bond character and options, and the atoms it leaves and meets in labels, but no angle or length
  // (the ring sets them). A side of a ring drawn with a circle is a single line, as on the page (a fused side too, when
  // either of its rings has one). A double bond with its second line inside is a plain =, as chemfig puts it inside a
  // ring (counterclockwise, inside is on the left).
  function ringBond(p: number, q: number): string {
    const b = nbrs[p].find((x) => x.to === q)!.bond, { char, tikz } = look(b, p);
    const round = ringsOf.get(p)!.some((r) => r.includes(q) && circled.has(ringKey(r)));
    return bondCode(p, q, round ? "-" : char === "=^" ? "=" : char, tikzOf(tikz), true);
  }
  // The turn a ring written first needs: chemfig's own has its last side coming straight down onto its first atom.
  const turnFor = (ring: number[]) => {
    const last = ring[ring.length - 1], t = Math.round((Math.atan2(at(last)[1] - at(ring[0])[1], at(last)[0] - at(ring[0])[0]) * 180) / Math.PI) - 90;
    const d = ((t % 360) + 540) % 360 - 180;
    return d ? `[:${d}]` : "";
  };
  // A structure hanging off another by a bond chemfig does not draw. When it starts with a ring, the bond reaches it
  // through a point straight out from the ring's middle, so chemfig turns the ring as the page has it.
  const hangCode = (u: number, r: number) => {
    const ring = ringAt.get(r);
    if (!ring) return bondCode(u, r, "-", "draw=none");
    const c = ring.reduce<P>((s, i) => [s[0] + at(i)[0] / ring.length, s[1] + at(i)[1] / ring.length], [0, 0]);
    const out: P = [at(r)[0] - c[0], at(r)[1] - c[1]], l = Math.hypot(out[0], out[1]), p: P = [at(r)[0] + out[0] / l, at(r)[1] + out[1] / l];
    const d: P = [p[0] - at(u)[0], p[1] - at(u)[1]], a = Math.round((Math.atan2(d[1], d[0]) * 180) / Math.PI), g = groups[u];
    const right = a > -90 && a < 90, from = g.atoms.length > 1 && g.anchor !== (right ? g.atoms.length - 1 : 0) ? String(g.anchor + 1) : "";
    const inward = Math.round((Math.atan2(-out[1], -out[0]) * 180) / Math.PI), gr = groups[r], rin = inward > -90 && inward < 90;
    const to = gr.atoms.length > 1 && (Math.abs(inward) === 90 || gr.anchor !== (rin ? 0 : gr.atoms.length - 1)) ? String(gr.anchor + 1) : "";
    return `-[:${a},${num(Math.hypot(d[0], d[1]))},${from},,draw=none]-[:${inward},,,${to},draw=none]`;
  };
  // One \chemfig for structures (their roots, left to right): the first written from its root, the others hanging off
  // it. Compact: on one line. Readable: an atom (or bracket) a line, indented by tabs as deep as its branch. chemfig
  // ignores the spaces and line breaks between bonds and atoms, so both draw the same.
  // Brackets round its atoms come with it: their nodes hang off the first root, and \polymerdelim follows (after).
  const chemfig = (rs: number[], compact = !!options.compact) => {
    lines = [];
    const mine = brackets.filter((b) => rs.includes(roots[component[b.inside[0]]]));
    decor = mine.flatMap((b) => b.branches(rs[0]));
    // Marks that reach past the structure (numbers, lone pairs) put empty atoms at the corners of the box they need,
    // as \charge's marks are not in the picture's box, and a cropped figure (the standalone class) would cut them off.
    const ours = (i: number) => component[i] >= 0 && rs.includes(roots[component[i]]);
    const pts = atoms.flatMap((_, i) => (ours(i) ? [at(i)] : [])), out = reach.filter((r) => ours(r.atom)).map((r) => r.p);
    const box = (ps: P[]) => [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[0])), Math.max(...ps.map((p) => p[1]))];
    // (Labels reach about 0.3 bond lengths past their atoms already; a corner is added only on a side marks pass that.)
    if (out.length) {
      const [x0, y0, x1, y1] = box(pts), [u0, v0, u1, v1] = box([...pts, ...out]);
      if (u0 < x0 - 0.3 || v0 < y0 - 0.3) decor.push(toPoint(rs[0], [Math.min(u0, x0), Math.min(v0, y0)], ""));
      if (u1 > x1 + 0.3 || v1 > y1 + 0.3) decor.push(toPoint(rs[0], [Math.max(u1, x1), Math.max(v1, y1)], ""));
    }
    write(rs[0], 0, "", rs.slice(1));
    const code = compact || !lines.length ? `\\chemfig{${lines.map(([, t]) => t).join("")}}` : `\\chemfig{\n${lines.map(([d, t]) => "\t".repeat(d + 1) + t).join("\n")}\n}`;
    return { code, after: mine.map((b) => (compact ? b.delim : `\n${b.delim}`)).join("") };
  };
  // Names under structures (captions kept under their atoms: a name, a compound number), with chemfig's \chemname*,
  // which puts each under its own structure, as the page does, whatever came before. Names under one structure stack in
  // the page's order (by id). A \chemname names a whole \chemfig, so when the names belong to more than one structure,
  // each structure, with the others its names also cover, is a \chemfig of its own, left to right.
  const component = atoms.map(() => -1);
  roots.forEach((r, k) => { for (const stack = [r]; stack.length; ) { const u = stack.pop()!; component[u] = k; stack.push(...below(u)); } });
  // Brackets (brackets, parentheses and braces, and polymer brackets) round atoms, with chemfig's \polymerdelim: its
  // two nodes at the middles of the bracket's sides, placed by bonds chemfig does not draw from the structure's first
  // atom, and empty atoms at its corners so the picture's box holds it (\polymerdelim's lines take no room). Its
  // height, its turn, one side only, the usage label at the lower right (n), and the mark and repeat tags at the upper
  // right, as the page draws them. Node names carry a hash of the drawing, so two drawings in one document do not clash.
  // A bracket round no atom is not written.
  const hash = [...JSON.stringify(atoms.map((a) => a.location))].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36).slice(0, 4);
  const toPoint = (u: number, p: P, content: string) => {
    const d: P = [p[0] - at(u)[0], p[1] - at(u)[1]], g = groups[u];
    let angle = Math.round((Math.atan2(d[1], d[0]) * 180) / Math.PI);
    if (angle <= -180) angle += 360;
    const right = angle > -90 && angle < 90, from = g.atoms.length > 1 && g.anchor !== (right ? g.atoms.length - 1 : 0) ? String(g.anchor + 1) : "";
    return `(-[:${angle},${num(Math.hypot(d[0], d[1]))},${from},,draw=none]${content})`;
  };
  const brackets = (mol.shapes ?? []).filter(isBracket).flatMap((sh) => {
    const inside = atoms.flatMap((_, i) => (kept[i] && component[i] >= 0 && inShape(sh, at(i)) ? [i] : []));
    if (!inside.length) return [];
    const x0 = Math.min(sh.from[0], sh.to[0]), x1 = Math.max(sh.from[0], sh.to[0]), y0 = Math.min(sh.from[1], sh.to[1]), y1 = Math.max(sh.from[1], sh.to[1]), ym = (y0 + y1) / 2;
    const turned = (q: P) => turnedWith(sh, q) as P, half = num(1.5 * (y1 - y0)), name = `oct${hash}${sh.id}`;
    const c = shapeCorners(sh), corners = sh.angle ? [c.from, c.to, c.c1, c.c2] : [c.from, c.to];
    const tags = [sh.mark ?? "", sh.polymer ? polymerTags(sh.polymer) : ""].filter(Boolean).join(" ");
    const pair = sh.kind === "brackets" ? ["[", "]"] : sh.kind === "parens" ? ["(", ")"] : ["\\{", "\\}"];
    const delims = sh.side === "left" ? `${pair[0]}.` : sh.side === "right" ? `.${pair[1]}` : pair.join("");
    const keys = [`delimiters={${delims}}`, `height=${half}em`, `depth=${half}em`, `indice={${sh.polymer ? tex(polymerLabel(sh.polymer)) : ""}}`, ...(sh.angle ? ["h align=false", `rotate=${Math.round(sh.angle)}`] : [])];
    return [{
      inside, delim: `\\polymerdelim[${keys.join(", ")}]{${name}o}{${name}c}`,
      branches: (u: number) => [
        toPoint(u, turned([x0, ym]), `@{${name}o}`), toPoint(u, turned([x1, ym]), `@{${name}c}`), ...corners.map((q) => toPoint(u, q, "")),
        ...(tags ? [toPoint(u, turned(sh.side === "left" ? [x0 - 0.3, y1 - 0.1] : [x1 + 0.3, y1 - 0.1]), atom(`\\scriptstyle ${tex(tags)}`))] : []),
      ],
    }];
  });
  const named = (mol.captions ?? []).filter((c) => c.under?.some((i) => component[i] >= 0)).sort((p, q) => p.id - q.id);
  const parent = roots.map((_, k) => k), find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (const c of named) {
    const ks = [...new Set(c.under!.filter((i) => component[i] >= 0).map((i) => find(component[i])))];
    for (const k of ks.slice(1)) parent[find(k)] = find(ks[0]);
  }
  // A structure of a reaction (in its row, or a condition) is a compound of its own, with the other pieces it is drawn
  // as (a salt's ions).
  const schemes = options.schemes ?? [], items = schemes.flatMap((s) => [...s.row, ...[...s.above.values(), ...s.below.values()].flat()]);
  const groupOf = (list: number[]) => { const i = list.find((j) => component[j] >= 0); return i === undefined ? undefined : find(component[i]); };
  for (const it of items) if ("atoms" in it) {
    const ks = [...new Set(it.atoms.filter((i) => component[i] >= 0).map((i) => find(component[i])))];
    for (const k of ks.slice(1)) parent[find(k)] = find(ks[0]);
  }
  const separate = named.length > 0 || items.length > 0;
  const sets = separate ? [...new Set(roots.map((_, k) => find(k)))].map((g) => roots.filter((_, k) => find(k) === g)) : [roots];
  const setOf = (g: number) => sets.find((rs) => find(roots.indexOf(rs[0])) === g)!;
  // A structure (its roots) as a compound, named when it has names. A label on an arrow is compact, inside [ ].
  const compound = (rs: number[], compact?: boolean) => {
    const names = named.filter((c) => c.under!.some((i) => component[i] >= 0 && find(component[i]) === find(roots.indexOf(rs[0])))).map(nameOf);
    const { code, after } = chemfig(rs, compact);
    return (names.length ? `\\chemname*{${code}}{${names.join("\\\\")}}` : code) + after;
  };
  // Text on more than one line stacks (\\ alone does nothing in a compound or a label).
  const stack = (s: string) => (s.includes("\\\\") ? `\\shortstack{${s}}` : s);
  const used = new Set<number>();
  const piece = (it: SchemeItem, label: boolean) => {
    if ("caption" in it) { const c = mol.captions?.find((x) => x.id === it.caption); return c ? stack(nameOf(c)) : ""; }
    const g = groupOf(it.atoms);
    if (g === undefined) return "";
    used.add(g);
    return compound(setOf(g), label || undefined);
  };
  // Reactions as chemfig's schemes: the row's compounds, \+ for each plus sign, and an \arrow for each arrow with its
  // conditions above and below it (structures and text, stacked), at the arrow's angle, and as long as the page's arrow
  // (a bond is chemfig's 3em, an arrow 5em at 1), so the conditions fit as they do on the page. chemfig writes one row:
  // a row the page wraps onto more lines is one long row.
  const ARROWS: Partial<Record<string, string>> = { equilibrium: "<=>", resonance: "<->", nogo: "-/>", hash: "-/>" };
  const arrowCode = (id: number) => {
    const a = mol.arrows?.find((x) => x.id === id), s = schemes.find((x) => x.row.some((p) => "arrow" in p && p.arrow === id))!;
    if (!a) return "";
    const label = (list: SchemeItem[] = []) => { const ps = list.map((it) => piece(it, true)).filter(Boolean); return ps.length ? `{${ps.length > 1 ? stack(ps.join("\\\\")) : ps[0]}}` : ""; };
    const above = label(s.above.get(id)), below = label(s.below.get(id));
    const d = [a.to[0] - a.from[0], a.to[1] - a.from[1]], angle = Math.round((Math.atan2(d[1], d[0]) * 180) / Math.PI), coeff = +(0.6 * Math.hypot(d[0], d[1])).toFixed(1);
    const fields = [angle ? String(angle) : "", Math.abs(coeff - 1) > 0.05 ? num(coeff) : ""];
    while (fields.length && !fields[fields.length - 1]) fields.pop();
    return `\\arrow{${ARROWS[a.kind] ?? "->"}${above || below ? `[${above}][${below}]` : ""}}${fields.length ? `[${fields.join(",")}]` : ""}`;
  };
  const tab = (s: string) => s.split("\n").map((l) => `\t${l}`).join("\n");
  const blocks = schemes.map((s) => {
    const ps = s.row.map((p) => ("plus" in p ? "\\+" : "arrow" in p ? arrowCode(p.arrow) : piece(p, false))).filter(Boolean);
    // Readable: a piece a line, each line ended by % (in a scheme a line break is a space, which would move things).
    return options.compact ? `\\schemestart ${ps.join("")}\\schemestop` : `\\schemestart%\n${ps.map(tab).join("%\n")}%\n\\schemestop`;
  });
  // The structures in no reaction, as before: named ones each a \chemfig of their own, the others together.
  const hasName = (rs: number[]) => named.some((c) => c.under!.some((i) => component[i] >= 0 && find(component[i]) === find(roots.indexOf(rs[0]))));
  const rest = sets.filter((rs) => !used.has(find(roots.indexOf(rs[0])))), unnamed = rest.filter((rs) => !hasName(rs)).flat();
  const loose = !schemes.length ? sets.map((rs) => compound(rs)) : [...rest.filter(hasName).map((rs) => compound(rs)), ...(unnamed.length ? [compound(unnamed)] : [])];
  const code = [...blocks, loose.filter(Boolean).join(options.compact ? "\\qquad" : "\n\\qquad\n")].filter(Boolean).join("\n\n");
  // What the code needs beyond chemfig, as comments before it.
  const left = unset(code), notes = [
    ...(wavy ? ["% Wavy bonds need \\usetikzlibrary{decorations.pathmorphing} in the preamble."] : []),
    ...(brackets.length ? ["% Brackets (\\polymerdelim) need two LaTeX runs to be in place."] : []),
    ...(left.length ? [`% pdfLaTeX cannot set ${left.join(" ")}: replace ${left.length > 1 ? "them" : "it"}, or compile with LuaLaTeX or XeLaTeX and a font that has ${left.length > 1 ? "them" : "it"}.`] : []),
  ];
  return [...notes, code].join("\n");
}

// What the user is told after Copy As or Export (head: "Copied", "Saved name.tex"): the parts of mol that the code
// leaves out, as this export cannot write them yet, and the parts it writes differently. Undefined when the code shows
// all of it. interpret: the document's Interpret Chemically (a caption read as chemistry is in the code, as a label).
// schemes: the reactions written as schemes (toChemfig's), whose arrows, plus signs and text are in the code.
export function chemfigNotice(head: string, mol: Mol, interpret: boolean, schemes: Scheme[] = []): string | undefined {
  const atoms = mol.atoms.filter((a) => !a.hidden), kept = new Set(mol.atoms.flatMap((a, i) => (a.hidden ? [] : [i])));
  const bonds = mol.bonds.filter((b) => b.atoms.every((i) => kept.has(i)));
  const left = new Map<string, number>(), changed = new Map<string, number>();
  const add = (to: Map<string, number>, what: string, n = 1) => { if (n) to.set(what, (to.get(what) ?? 0) + n); };
  // Each kind as [one, many]. Some go without a number: text, and marks shown for a whole structure (with whether the
  // name is plural).
  const KINDS: Record<string, [string, string]> = {
    curved: ["curved arrow", "curved arrows"], arrow: ["arrow", "arrows"], line: ["line", "lines"], orbital: ["orbital", "orbitals"], cut: ["fragmentation line", "fragmentation lines"],
    bracket: ["bracket", "brackets"], shape: ["shape", "shapes"], tlc: ["TLC plate", "TLC plates"], table: ["table", "tables"], picture: ["picture", "pictures"],
    cycle: ["catalytic cycle", "catalytic cycles"], spectrum: ["spectrum", "spectra"], fill: ["ring fill", "ring fills"], highlight: ["highlight", "highlights"],
    query: ["query property", "query properties"], attach: ["attachment point", "attachment points"],
    bead: ["polymer bead", "polymer beads"], enhanced: ["enhanced stereo mark", "enhanced stereo marks"], hmark: ["hydrogen dot or hash", "hydrogen dots and hashes"], turned: ["turned label", "turned labels"],
    quadruple: ["quadruple bond", "quadruple bonds"], either: ["crossed double bond", "crossed double bonds"], dashed: ["dashed double bond", "dashed double bonds"], bold: ["bold double bond", "bold double bonds"],
    retro: ["retrosynthetic arrow", "retrosynthetic arrows"], hash: ["hashed no-reaction arrow", "hashed no-reaction arrows"], dipole: ["dipole arrow", "dipole arrows"], block: ["block arrow", "block arrows"],
  };
  const COUNTLESS: Record<string, [string, boolean]> = { text: ["text", false], cip: ["R/S and E/Z labels", true], shade: ["depth shading", false], circle: ["aromatic circles", true] };
  // A scheme's arrows are in the code; those chemfig has no arrow for are written as the nearest it has.
  const items = schemes.flatMap((s) => [...s.row, ...[...s.above.values(), ...s.below.values()].flat()]);
  const written = new Set(items.flatMap((p) => ("arrow" in p ? [p.arrow] : "plus" in p ? [p.plus] : "caption" in p ? [p.caption] : [])));
  for (const a of mol.arrows ?? []) {
    if (written.has(a.id)) { if (a.kind in KINDS) add(changed, a.kind); continue; }
    add(left, a.kind === "curved" || a.kind === "fishhook" || a.kind === "double" ? "curved" : a.kind === "line" || a.kind === "arc" || a.kind === "curve" ? "line" : a.kind === "orbital" ? "orbital" : a.kind === "cut" ? "cut" : "arrow");
  }
  // Text that is not in the code: not a name under a structure, a label read as chemistry, or a part of a scheme.
  if ((mol.captions ?? []).some((c) => !written.has(c.id) && !c.under?.some((i) => kept.has(i)) && !chemicalCaption(c, interpret))) add(left, "text");
  // Brackets round atoms are in the code (\polymerdelim); a bracket round nothing is not.
  for (const s of mol.shapes ?? []) {
    if (isBracket(s) && mol.atoms.some((a, i) => kept.has(i) && inShape(s, [a.location[0], a.location[1]]))) continue;
    add(left, isBracket(s) ? "bracket" : s.kind === "tlc" || s.kind === "table" || s.kind === "picture" ? s.kind : s.kind === "highlight" ? "highlight" : "shape");
  }
  add(left, "cycle", mol.cycles?.length ?? 0);
  add(left, "spectrum", mol.spectra?.length ?? 0);
  add(left, "fill", mol.fills?.length ?? 0);
  for (const a of atoms) {
    if (a.halo) add(left, "highlight");
    if (a.query) add(left, "query");
    if (a.attach) add(left, "attach");
    if (a.bead) add(left, "bead");
    if (a.enhanced) add(left, "enhanced");
    if (a.hmark) add(left, "hmark");
    if (a.labelAngle) add(left, "turned");
  }
  // Marks shown for a whole structure: no count.
  if (atoms.some((a) => a.cip)) add(left, "cip");
  if (atoms.some((a) => a.shade)) add(left, "shade");
  // A circle is drawn for a ring in ring syntax (**6), fused or not; one in a ring drawn bond by bond is not.
  const inSyntax = new Set(syntaxRings(mol).map((r) => [...r].sort((x, y) => x - y).join()));
  if (circledRings(mol).some((r) => !inSyntax.has([...r].sort((x, y) => x - y).join()))) add(left, "circle");
  for (const b of bonds) {
    if (b.halo) add(left, "highlight");
    if (b.type === QUADRUPLE) add(changed, "quadruple");
    else if (b.type === 2 && b.display === "either") add(changed, "either");
    else if (b.type === 2 && (b.display === "dashed" || b.display === "aromatic")) add(changed, "dashed");
    else if (b.type === 2 && b.display === "bold") add(changed, "bold");
  }
  const list = (m: Map<string, number>) => {
    const items = [...m].map(([k, n]) => COUNTLESS[k]?.[0] ?? `${n} ${KINDS[k][n === 1 ? 0 : 1]}`);
    return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0];
  };
  // One thing (it, looks), or more (them, look).
  const one = (m: Map<string, number>) => m.size === 1 && [...m].every(([k, n]) => (COUNTLESS[k] ? !COUNTLESS[k][1] : n === 1));
  if (!left.size && !changed.size) return undefined;
  // The limit is Octet's export, not chemfig's.
  const without = left.size ? `${head} without ${list(left)}: Octet cannot export ${one(left) ? "it" : "them"} to chemfig yet.` : `${head}.`;
  return changed.size ? `${without} Octet exports ${list(changed)} to chemfig differently.` : without;
}
