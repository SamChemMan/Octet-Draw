// The line notation (docs/plans/mcp-v2.md, section 4 and 5.4): what an AI app writes to draw, as a chemist types a
// scheme. What a job costs a model is its thinking and its turns, not Octet's time (mcp-v2-eval-notes.md): it weighs
// where each condition goes and writes nested JSON with the right keys. Here it writes
//   benzoic acid + MeOH -> methyl benzoate (2), H2SO4, reflux, 6 h, 88%
// and Octet sorts the rest, as the conditions of a drawn arrow are read (conditionKind). fromLines gives the arguments
// the drawing code takes: a kind of draw with its arguments, or a batch of them (several schemes, a title, a grid).
// Anything with one meaning is read; anything with two is refused with both named. Nothing here touches the drawing.
import { isElement } from "./labels.ts";
import { NAMED, TO, WITH } from "./named.ts";
import { conditionKind, solvent } from "./stoich.ts";

// What a model reads in the tool list (about 800 characters: the list is 14,000 in all).
export const NOTATION = `One reaction a line, as chemists type it:
4-bromoanisole + PhB(OH)2 (1.5 equiv) -> 4-methoxybiphenyl (3), Pd(PPh3)4 (5 mol%), K2CO3, THF/H2O, 80 °C, 91%
-> 3[OMe>OH] (4), BBr3, 78%
Compound: name, formula or SMILES ({R}: label R), then (number) and caption. 3 is compound 3 again; 3[..] is 3 changed: OBn>OTES, 7:OTBS, 7:H, 7+OH (7: map [C:7]), 5=6, reduce 9; a name changes by labels only: aspirin[OAc>OH]. Conditions in any order, Octet sorts them; ^x forces over, _x under; "x" as written; @x drawn. (a) first labels a step: letters on the arrows, conditions in a note. Arrows -> <=> => <-> -/->. A line starting -> goes on; a chain back to its start is a cycle (+x in, -x out). # title: the scheme under it; the schemes are one route, numbered as one. Grid: CORE{R}: then R=Me (5) 80% lines; | joins a row.`;

type Compound = { text?: string; labels?: string[]; from?: string; changes?: Change[]; number?: string; caption?: string };
type Change = Record<string, unknown>;
type Side = "above" | "below";
type Line = string | Compound;
type Step = { products: Compound[]; label?: string; arrow?: string; reagents?: string[]; catalysts?: string[]; solvents?: string[]; temperature?: string; time?: string; atmosphere?: string; yield?: string; above?: Line[]; below?: Line[] };
type Op = { tool: string; args: Record<string, unknown> };
// A reaction as read: its compounds, and each arrow with what follows its products, read once Octet knows whether the
// chain is a cycle.
type Chain = { start: Compound[]; steps: { arrow: string; products: Compound[]; conditions: string; line: number }[]; heads: string[] };

const MOST = 100_000; // characters: a 50-step route is about 5,000
// Arrows, longest first. Unicode or ASCII, as a model writes them.
const ARROWS: [string, string][] = [["-/->", "nogo"], ["-x->", "nogo"], ["-X->", "nogo"], ["<-->", "resonance"], ["-->", "reaction"], ["<=>", "equilibrium"], ["<->", "resonance"], ["-/>", "nogo"], ["->", "reaction"], ["—>", "reaction"], ["–>", "reaction"], ["=>", "retro"], [">>", "reaction"],
  ["→", "reaction"], ["⟶", "reaction"], ["⇌", "equilibrium"], ["⇄", "equilibrium"], ["⇋", "equilibrium"], ["↔", "resonance"], ["⟷", "resonance"], ["⇒", "retro"], ["⟹", "retro"], ["↛", "nogo"]];
const FIRST = new Set(ARROWS.map(([t]) => t[0])), arrowAt = (s: string, i: number) => (FIRST.has(s[i]) ? ARROWS.find(([t]) => s.startsWith(t, i)) : undefined);
// A separator between items: a semicolon, or a comma before a space (2,6-lutidine and (1S,2R) are one item).
const sepAt = (s: string, i: number) => (s[i] === ";" || (s[i] === "," && (i + 1 === s.length || /\s/.test(s[i + 1]))) ? 1 : 0);

// Each place at bracket depth 0 and outside quotes, where at says a token starts (its length, or 0): the pieces
// between, each with the token before it. Brackets and quotes were checked to close when the line was read.
function cut(s: string, at: (i: number) => number): { text: string; by: string }[] {
  const out: { text: string; by: string }[] = [];
  let depth = 0, quoted = false, from = 0, by = "";
  for (let i = 0; i < s.length; ) {
    const ch = s[i], n = !depth && !quoted ? at(i) : 0;
    if (n) { out.push({ text: s.slice(from, i), by }); by = s.slice(i, i + n); i += n; from = i; continue; }
    if (ch === '"') quoted = !quoted;
    else if (!quoted && "([{".includes(ch)) depth++;
    else if (!quoted && ")]}".includes(ch)) depth = Math.max(0, depth - 1);
    i++;
  }
  out.push({ text: s.slice(from), by });
  return out;
}
// Why a line's brackets or quotes do not close, or undefined.
function unclosed(s: string): string | undefined {
  let depth = 0, quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && "([{".includes(ch)) depth++;
    else if (!quoted && ")]}".includes(ch)) {
      // A numbered operation's a) or 1) closes nothing.
      const op = !depth && ch === ")" ? /(?:\d{1,2}|[a-z]|[ivx]{1,4})$/.exec(s.slice(Math.max(0, i - 4), i)) : null;
      if (op && /^$|[\s,;^_]/.test(s[i - op[0].length - 1] ?? "")) continue;
      if (--depth < 0) return `a ${ch} has no ${{ ")": "(", "]": "[", "}": "{" }[ch]} before it`;
    }
  }
  return quoted ? 'a " has no closing "' : depth ? "a bracket is not closed" : undefined;
}
const unquote = (t: string) => t.slice(1, -1).replace(/\\n/g, "\n");
const quoted = (t: string) => t.length > 1 && t[0] === '"' && t[t.length - 1] === '"';

// ---- A compound ----

// A compound number: short, with a digit or a capital (3a, 4g, S-2, HG-II, Ir(III)*, (R)-L), and not an amount
// ((1.2 equiv), (0.5), (5 mol%), (cat.)), which is a caption.
const isNumber = (t: string) => t.length <= 14 && !/[\s,;%]/.test(t) && /[\dA-Z]/.test(t) && !/^\d*\.\d/.test(t);
// An earlier compound by its number, which a SMILES or a name never is: 13, 4a, 4a′.
const REFERENCE = /^\d{1,4}[a-z]{0,3}['′″]*$/;

// A compound as written: name, formula or SMILES ({R} for a label), an earlier one by its number, or one changed
// ([...] after its number, or alone for the one before). Then its number in brackets and a caption.
function compound(s: string, known: Set<string>, previous?: () => string | undefined): Compound | string {
  let t = s.trim(), number: string | undefined, caption: string | undefined;
  if (/"$/.test(t)) { const k = t.lastIndexOf('"', t.length - 2); if (k >= 0) { caption = unquote(t.slice(k)); t = t.slice(0, k).trim(); } }
  // The bracket groups after a space, at depth 0, followed by a space or the end: the last that starts with a number
  // gives it, and the rest of the group and what follows it are the caption ((3a, 91%)); else one in round brackets at
  // the end is the caption, brackets and all.
  const groups: [number, number][] = [];
  let depth = 0, open = -1;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if ("([".includes(ch)) { if (!depth++ && /\s/.test(t[i - 1] ?? "")) open = i; }
    else if (")]".includes(ch) && !--depth && open >= 0) { if (i + 1 === t.length || /\s/.test(t[i + 1])) groups.push([open, i]); open = -1; }
  }
  const bold = /(?:^|\s)\*\*([^*\s]{1,14})\*\*(?=\s|$)/.exec(t);
  const first = ([a, b]: [number, number]) => cut(t.slice(a + 1, b), (i) => sepAt(t.slice(a + 1, b), i)), numbered = [...groups].reverse().find((g) => isNumber(first(g)[0].text.trim()));
  if (numbered) {
    const [n, ...more] = first(numbered);
    number = n.text.trim(); caption = [...more.map((x) => x.text.trim()), t.slice(numbered[1] + 1).replace(/^[\s,;]+/, "").trim(), caption].filter(Boolean).join(", ") || undefined;
    // (R), (S), (E), (Z), (2S) after a name: a compound's number, or its configuration.
    if (t[numbered[0]] === "(" && CONFIG.test(number)) return `"${s.trim().slice(0, 40)}" reads two ways: (${number}) is compound ${number} (write [${number}]), or a configuration (write (${number})-${t.slice(0, numbered[0]).trim().slice(0, 30)})`;
    t = t.slice(0, numbered[0]).trim();
  }
  else if (bold) { number = bold[1]; caption = [t.slice(bold.index + bold[0].length).trim(), caption].filter(Boolean).join(" ") || undefined; t = t.slice(0, bold.index).trim(); }
  else if (groups.length && t[groups[groups.length - 1][0]] === "(" && groups[groups.length - 1][1] === t.length - 1) { const [a] = groups[groups.length - 1]; caption ??= t.slice(a); t = t.slice(0, a).trim(); }
  else { const y = /\s(\d+(?:\.\d+)?\s*%.*)$/.exec(t); if (y && !caption) { caption = y[1]; t = t.slice(0, y.index).trim(); } }
  // **3** alone is compound 3.
  if (!t) return number ? { from: number, number, ...(caption ? { caption } : {}) } : `"${s.trim().slice(0, 40)}" has no name or SMILES`;
  // A comma with no space after it is part of a name, before a locant (2,6-lutidine, N,N-dimethyl, 1,1'-).
  const commas = cut(t, (i) => (t[i] === "," ? 1 : 0)).map((x) => x.text), odd = commas.findIndex((_, k) => k && !/^(?:\d+|\p{L}\d*)[a-z]?['′″]*(?=[,\-([])/u.test(commas.slice(k).join(",")));
  if (odd > 0) return `"${t.slice(0, 40)}": put a space after the comma before ${commas[odd].slice(0, 20)} (a comma with no space is part of a name, as in 2,6-lutidine)`;
  caption &&= caption.replace(/\\n/g, "\n");
  const own = { ...(number ? { number } : {}), ...(caption ? { caption } : {}) };
  // An earlier compound, changed: 3[...], or [...] for the one before. A name or SMILES changed (aspirin[OAc>OH]) is
  // Octet's reading of it with the changes made, when they are changes (CC[Pd] is a SMILES).
  const block = /^(.*?)\s*\[([^[\]]*)\]$/.exec(t), reference = (x: string) => REFERENCE.test(x) || known.has(x);
  let changes: Change[] | undefined;
  if (block && (block[1] === "" || reference(block[1]))) {
    const made = changesOf(block[2]);
    if (typeof made !== "string") {
      const from = block[1] || previous?.();
      if (!from) return `[${block[2].slice(0, 40)}] changes the compound before it, but there is none here with a number: write that compound's number before the [`;
      return { from, changes: made, ...own };
    }
    if (block[1]) return `${block[1]}[${block[2].slice(0, 40)}]: ${made}`;
  } else if (block) { const made = changesOf(block[2]); if (typeof made !== "string") { changes = made; t = block[1]; } }
  // A number given earlier that is also a formula or SMILES (C, CO, PC4).
  if (known.has(t) && !REFERENCE.test(t) && /^(?:[A-Z][a-z]?\d*)+$/.test(t) && t.match(/[A-Z][a-z]?/g)!.every(isElement)) return `"${t}" reads two ways: compound ${t} (write **${t}**), or the structure ${t} (write its name)`;
  if (reference(t)) return { from: t, number: number ?? t, ...(caption ? { caption } : {}) };
  // {R} in a SMILES is a generic group with the label R (a * with labels in the JSON form).
  const labels: string[] = [], text = t.replace(/\{([^{}]*)\}/g, (_, x: string) => (labels.push(x.trim()), "*"));
  if (labels.length && text.split("*").length - 1 !== labels.length) return `"${t.slice(0, 40)}" has a * with no label: write each as {R}`;
  if (labels.some((x) => !x)) return `"${t.slice(0, 40)}" has an empty {}: write the label in it, as {OMe}`;
  return { text, ...(labels.length ? { labels } : {}), ...(changes ? { changes } : {}), ...own };
}

// A compound's changes, as compound.ts takes them: OBn>OTES, 2nd OBn>OTES, 7:OBn>OTES, 7:OTBS, 7:=O, 7:H, 7+OH, 5=6,
// and named ones (reduce 9, protect 4-20 acetonide, join 2-1 8 (2S)). Each may end with a configuration: S, 9S, (1S,2R).
const CONFIG = /^\(?((?:(?:\d+(?:-\d+)?)?[RSEZ],?)+)\)?$/;
function configOf(t: string): unknown {
  const parts = t.replace(/[()]/g, "").split(",").filter(Boolean);
  if (parts.length === 1 && /^[RSEZ]$/.test(parts[0])) return parts[0];
  return Object.fromEntries(parts.map((p) => [p.slice(0, -1), p.slice(-1)]));
}
const ATOM = String.raw`C?\d+`, SWAP_AT = new RegExp(`^(${ATOM})\\s*:\\s*([^\\s>]+)\\s*>\\s*(\\S+)$`), REMOVE = new RegExp(`^(${ATOM})\\s*:\\s*H$`);
const SET = new RegExp(`^(${ATOM})\\s*:\\s*(\\S+)$`), ADD = new RegExp(`^(${ATOM})\\s*\\+\\s*(\\S+)$`), PLACE = new RegExp(`^${ATOM}(?:-${ATOM})?$`);
function changesOf(block: string): Change[] | string {
  const out: Change[] = [];
  for (const { text } of cut(block, (i) => sepAt(block, i))) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    // A configuration at the end of any change.
    let config: unknown;
    if (words.length > 1 && CONFIG.test(words[words.length - 1]) && !/^(?:single|double|triple)$/.test(words[words.length - 1])) config = configOf(words.pop()!);
    const t = words.join(" ").replace(/\s*(?:->|→)\s*/, ">"), c = (x: Change): Change => (config === undefined ? x : { ...x, config });
    let m: RegExpExecArray | null;
    if ((m = SWAP_AT.exec(t))) out.push(c({ swap: { [m[2]]: m[3] }, at: m[1] }));
    else if ((m = /^(?:(\d+)(?:st|nd|rd|th)\s+)?([^\s>:]+)\s*>\s*(\S+)$/.exec(t))) out.push(c({ swap: { [m[2]]: m[3] }, ...(m[1] ? { occurrence: Number(m[1]) } : {}) }));
    else if ((m = REMOVE.exec(t))) out.push(c({ at: m[1], remove: true }));
    else if ((m = SET.exec(t))) out.push(c({ at: m[1], set: m[2] }));
    else if ((m = ADD.exec(t))) out.push(c({ at: m[1], add: m[2] }));
    else if ((m = /^(\d+)\s*([-=#])\s*(\d+)$/.exec(t))) out.push(c({ bond: `${m[1]}-${m[3]}`, to: { "-": "single", "=": "double", "#": "triple" }[m[2]] }));
    else if ((m = /^([a-z][a-z_]*(?: (?:epoxide|carbonate))?)((?:\s+\S+)*)$/i.exec(t))) {
      // A named transformation: British or American spelling, a space or an underscore.
      const name = m[1].toLowerCase().replace(" ", "_").replace(/i[sz]e$/, "ise").replace(/y[sz]e$/, "yse"), x: Change = { do: name };
      // Only a name compound.ts knows: [Pd] alone is a SMILES.
      if (!(NAMED as readonly string[]).includes(name)) return `${name} is not a transformation. They are: ${NAMED.join(", ")}`;
      let role: string | undefined;
      for (const w of m[2].trim().split(/\s+/).filter(Boolean)) {
        if (/^(?:at|with|to)$/.test(w)) { role = w; continue; }
        const as = role ?? (/^(?:single|double|triple)$/.test(w) && TO.includes(name) ? "to" : PLACE.test(w) && x.at === undefined ? "at" : WITH.includes(name) ? "with" : "at");
        if (x[as] !== undefined) return `${name} has two ${as === "at" ? "places" : `values for ${as}`} (${x[as]}, ${w})`;
        x[as] = w; role = undefined;
      }
      out.push(c(x));
    } else return `Octet cannot read the change "${t.slice(0, 40)}": write OBn>OTES, 7:OTBS, 7:H, 7+OH, 5=6 or a named one (reduce 9)`;
  }
  return out.length ? out : "the [] has no change in it";
}

// ---- Conditions ----

// A yield, or what goes with one under the arrow: 88%, 18–73%, 95% e.e., 63% over 2 steps, 47% (64% assay),
// >20:1 d.r., 4:1 anti:syn, and with the word first: yield 88%, E:Z >95:5, d.r. 10:1.
const RATIO = String.raw`d\.?r\.?|e\.?r\.?|r\.?r\.?|[EZ]\s*:\s*[EZ]|anti\s*:\s*syn|syn\s*:\s*anti`, PARTS = String.raw`[>~≈]?\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?`;
const YIELD = new RegExp(String.raw`^(?:(?:yield\s*:?\s*)?[~≈>]?\d+(?:[.,]\d+)?(?:\s*[–-]\s*\d+(?:\.\d+)?)?\s*%(?:\s*(?:yield|ee|e\.e\.|de|d\.e\.|er|e\.r\.|conv\.?|AY|assay|brsm|isolated|over \d+ steps|\([^()]*\)))*|${PARTS}\s*(?:${RATIO})|(?:${RATIO})\s*[=:]?\s*${PARTS}|racemic)$`, "i");
// Each item's place: a reaction's fields, or a free line over or under its arrow.
function kindOf(t: string): ReturnType<typeof conditionKind> | "reagents" | "below" {
  if (YIELD.test(t)) return "yield";
  // As the papers draw them: a catalyst's loading (20 mol% catalyst·TfOH, 5 mol% HG-II catalyst), light (390-nm LEDs,
  // visible light) and molecular sieves go under the arrow, as a line.
  if (/\bcatalyst(?:·\S+)?$|\b(?:LEDs?|light|lamp|irradiation)\b|\bsieves\b|^\d+\s*Å\s*MS$/i.test(t)) return "below";
  const k = conditionKind(t);
  if (k) return k;
  // r.t., a solvent mixture (THF/H2O, 2.5:1 CH2Cl2:H2O, THF–iPrOH (4:1)) and a time range (1–48 h), as their parts
  // are, with acetic acid as a solvent among them (AcOH/MeCN). A reagent in its solvent (HCl/dioxane, TBAF/THF) is a
  // reagent.
  if (/^r\.\s?t\.?$/i.test(t)) return "temperature";
  if (t.replace(/^\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?\s+/, "").replace(/\s*\([^()]*\)$/, "").split(/\s*[/:–]\s*|\s+-\s+/).every((p) => solvent(p) || /^(?:AcOH|HOAc)$/i.test(p))) return "solvents";
  if (/^\d+(?:\.\d+)?\s*[–-]\s*\d+(?:\.\d+)?\s*(?:h|min|d)$/.test(t)) return "time";
  return "reagents";
}
// Numbered operations: 1. 2., 1) 2), (1) (2), a) b), (i) (ii). One starts an item; the next must follow it.
const OP = /^([\^_]?)(\(?)(\d{1,2}|[a-z]|[ivx]{1,4})([.)])\s/;
const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];
const LABEL = /^\(((?:[a-z]|[ivx]{1,4})(?:\s*[,–-]\s*(?:[a-z]|[ivx]{1,4}))*)\)(?:\s*[,;]\s*|\s+|$)/;
const follows = (a: string, b: string) => (/^\d/.test(a) ? Number(b) === Number(a) + 1 : b === String.fromCharCode(a.charCodeAt(0) + 1) || ROMAN[ROMAN.indexOf(a) + 1] === b);

type Item = { text: string; by: string };
// One step's conditions as the reaction kind of draw takes them; or, in a cycle, the step's in, out and name.
function conditions(s: string, known: Set<string>, cycle: boolean): Omit<Step, "products"> | { in?: string; out?: string; name?: string } | string {
  // A step's label first, (a) or (b, c): the scheme gets letters on its arrows and its conditions in a note. A single
  // (a) followed by its next, (b), is the first of numbered operations, as before.
  const lab = cycle ? null : LABEL.exec(s), one = lab && !/[,–-]/.test(lab[1]) ? lab[1] : undefined;
  const label = lab && !(one && [String.fromCharCode(one.charCodeAt(0) + 1), ROMAN[ROMAN.indexOf(one) + 1]].some((n) => n && new RegExp(`(?:^|[\\s,;])\\(?${n}[.)]\\s`).test(s.slice(lab[0].length)))) ? lab[1].replace(/\s+/g, " ") : undefined;
  if (label) s = s.slice(lab![0].length);
  const items = cut(s, (i) => sepAt(s, i)).map((x) => ({ text: x.text.trim(), by: x.by })).filter((x) => x.text);
  // Numbered operations: from the first item that starts with one, each to the next in order, even with no comma
  // before it (1. n-BuLi, THF 2. DMF).
  const ops: Item[][] = [], plain: Item[] = [];
  let lead: string | undefined, skip: string | undefined;
  for (const it of items) {
    const parts = cut(it.text, (i) => {
      const m = (!i || /\s/.test(it.text[i - 1])) && OP.exec(it.text.slice(i, i + 9));
      // A number that skips one (1. X 3. Y) is a mistake, not part of the operation before it.
      if (m && /^\d/.test(lead ?? "") && /^\d+$/.test(m[3]) && Number(m[3]) > Number(lead) + 1) skip ??= `operation ${m[3]} follows ${lead}: number them in order`;
      if (!m || (m[2] && m[4] !== ")") || (lead === undefined ? i > 0 : !follows(lead, m[3]))) return 0;
      lead = m[3];
      return m[0].length;
    });
    for (const [k, p] of parts.entries()) {
      const text = (p.by + p.text).trim(), by = k > 1 || (k && parts[0].text.trim()) ? " " : it.by;
      if (!text) continue;
      if (p.by) ops.push([{ text, by }]); else if (ops.length) ops[ops.length - 1].push({ text, by }); else plain.push({ text, by });
    }
  }
  if (skip) return skip;
  const out: Omit<Step, "products"> & { [k: string]: unknown } = {}, sides: { above: Line[]; below: Line[] } = { above: [], below: [] };
  const cyc: { in: string[]; out: string[]; name: string[] } = { in: [], out: [], name: [] }, yields: string[] = [];
  const add = (k: "reagents" | "catalysts" | "solvents", t: string) => ((out[k] as string[] | undefined) ?? (out[k] = [])).push(t);
  const join = (k: "temperature" | "time" | "atmosphere", t: string) => { out[k] = out[k] ? `${out[k]}, ${t}` : t; };
  // A free line: consecutive ones of one kind on one side share a line, as written.
  let last: { side: Side; kind: string } | undefined;
  const free = (side: Side, kind: string, t: string, by = ",") => {
    const l = sides[side];
    if (last?.side === side && last.kind === kind && typeof l[l.length - 1] === "string") l[l.length - 1] += `${/;/.test(by) ? ";" : ","} ${t}`; else l.push(t);
    last = { side, kind };
  };
  // An item with a mark: ^ over, _ under, "..." as written, @ drawn as a structure. Undefined when it has none.
  const marked = (t: string, by: string): true | string | undefined => {
    const m = /^([\^_])\s*/.exec(t), at = m ? (m[1] === "^" ? "above" : "below") : undefined, x = t.slice(m?.[0].length ?? 0);
    if (quoted(x)) { if (cycle) cyc.name.push(unquote(x)); else free(at ?? "above", "quoted", unquote(x)); last = undefined; return true; }
    if (x[0] === "@") {
      if (cycle) return `${x.slice(0, 40)}: a cycle's steps take text, not a structure`;
      const c = compound(x.slice(1), known);
      if (typeof c === "string") return c;
      sides[at ?? "above"].push(c); last = undefined; return true;
    }
    if (!m) return undefined;
    if (cycle) return `${t.slice(0, 40)}: a cycle's steps take text: +x goes in, -x comes out, the rest is the step's name`;
    free(at!, "forced", x, by); return true;
  };
  // then and what follows it (then Et3N, MeOH) is a line under the arrow, as written, with its yield taken out.
  let then: string[] | undefined;
  const endThen = () => { if (then) { free("below", "then", then.join("")); last = undefined; then = undefined; } };
  for (const { text: t, by } of plain) {
    const m = marked(t, by);
    if (typeof m === "string") return m;
    if (m) continue;
    if (YIELD.test(t) && !cycle) { yields.push(t); continue; }
    if (/^then\b/i.test(t)) { endThen(); then = [t]; continue; }
    if (then) { then.push(`${/;/.test(by) ? ";" : ","} ${t}`); continue; }
    if (cycle) { const p = /^([+]|[-−])\s*(.*)$/.exec(t); if (p) cyc[p[1] === "+" ? "in" : "out"].push(p[2]); else cyc.name.push(t); continue; }
    // A part taken away (− H2O, − e−) goes under the arrow, and one added (+ H+) over it, each as written.
    if (/^[-−](?=\s|\D)/.test(t) && !/^[-−]\s*\d/.test(t)) { free("below", "less", t); continue; }
    if (/^\+/.test(t)) { free("above", "more", t); continue; }
    const k = kindOf(t);
    if (k === "below") { free("below", k, t); continue; }
    last = undefined;
    if (k === "yield") yields.push(t);
    else if (k === "temperature" || k === "time" || k === "atmosphere") join(k, t);
    else add(k!, t);
  }
  endThen();
  // Each numbered operation is a line over the arrow, as written, with its marked items taken out. A yield at the end
  // of the last is the step's yield, unless another operation has its own.
  const own = ops.map((op) => op.some((x, k) => k && YIELD.test(x.text)) || YIELD.test(op[0].text.replace(OP, "")));
  for (const [j, op] of ops.entries()) {
    if (cycle) return `${op[0].text.slice(0, 40)}: a cycle's steps take no numbered operations`;
    const lead = OP.exec(op[0].text)!, side: Side = lead[1] === "_" ? "below" : "above", keep: Item[] = [{ text: op[0].text.slice(lead[1].length), by: "" }];
    for (const x of op.slice(1)) { const m = marked(x.text, x.by); if (typeof m === "string") return m; if (!m) keep.push(x); }
    if (j === ops.length - 1 && !own.slice(0, -1).some(Boolean)) while (keep.length > 1 && YIELD.test(keep[keep.length - 1].text)) yields.unshift(keep.pop()!.text);
    sides[side].push(keep.map((x, k) => (k ? `${x.by.trim() === ";" ? ";" : ","} ${x.text}` : x.text)).join(""));
  }
  if (cycle) return { ...(cyc.in.length ? { in: cyc.in.join(", ") } : {}), ...(cyc.out.length ? { out: cyc.out.join(", ") } : {}), ...(cyc.name.length ? { name: cyc.name.join(", ") } : {}) };
  if (yields.length) out.yield = yields.join(", ");
  return { ...out, ...(sides.above.length ? { above: sides.above } : {}), ...(sides.below.length ? { below: sides.below } : {}), ...(label ? { label } : {}) };
}

// ---- Lines ----

// A temperature range inside conditions (−78 → 25 °C, 0 °C → rt) is not an arrow.
const TEMP = String.raw`(?:[−-]?\d+(?:\.\d+)?\s*(?:°\s*C|°|K)?|rt|r\.t\.|RT|room temperature)`;
const BEFORE = new RegExp(`(?:^|[\\s,;^_])${TEMP}\\s*$`), AFTER = new RegExp(`^\\s*(?:[−-]?\\d+(?:\\.\\d+)?\\s*(?:°\\s*C|°|K)|rt|r\\.t\\.|RT|room temperature|reflux)\\s*(?:$|[,;])`);
// A line of a reaction: its parts between arrows (the first the starting materials, each other its products and then
// conditions), with each arrow's kind.
function arrowsOf(s: string): { parts: string[]; arrows: string[] } | string {
  const arrows: string[] = [];
  let inConditions = false, wrong: string | undefined;
  const parts = cut(s, (i) => {
    if (sepAt(s, i)) { inConditions = true; return 0; }
    const a = arrowAt(s, i);
    if (!a) return 0;
    if (inConditions && BEFORE.test(s.slice(Math.max(0, i - 30), i)) && AFTER.test(s.slice(i + a[0].length, i + a[0].length + 30))) return 0;
    // A dative bond in a SMILES ([NH3]->[Pt]) is not an arrow.
    if (s[i - 1] === "]" && s[i + a[0].length] === "[") wrong ??= `"${s.slice(Math.max(0, i - 10), i + 12)}" reads as a dative bond in a SMILES or as an arrow: write the bond as a single bond, or put spaces round the arrow`;
    arrows.push(a[1]); inConditions = false; return a[0].length;
  }).map((x) => x.text.trim());
  return wrong ?? { parts, arrows };
}

type Cell = Compound | { note: string };
const head = (l: string) => /^(#+)\s*(.*)$/.exec(l)!;

/** The arguments the drawing code takes for text in the line notation (NOTATION): the operation a draw is (a kind,
 * or a batch of several) with its arguments, the rest of the call's arguments beside them; or what is wrong. */
export function fromLines({ lines: text, ...rest }: { lines?: unknown; [k: string]: unknown }): { op: string; args: any } | string {
  if (typeof text !== "string") return "lines is text: one reaction a line";
  if (text.length > MOST) return `The lines are ${text.length} characters, over ${MOST}: draw them in parts`;
  // Characters no model means: control characters, and half a surrogate pair.
  const bad = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.exec(text);
  if (bad) return `The lines have the character U+${bad[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")} at ${bad.index + 1}: take it out`;
  // The lines, each joined to the next when it ends with a comma or semicolon or the next starts with a comma.
  const all: { line: string; at: number }[] = [];
  // A Markdown code fence round them is not part of them.
  for (const [k, raw] of text.replace(/\r\n?/g, "\n").replace(/^\s*```[\w-]*\n|\n```\s*$/g, "\n").split("\n").entries()) {
    const l = raw.replace(/[\t ]/g, " ").replace(/[“”„]/g, '"').replace(/[‘’]/g, "'").replace(/[º˚](?=\s*C\b)/g, "°").replace(/\s+/g, " ").trim(), prev = all[all.length - 1];
    if (!l) continue;
    if (prev && (/[,;]$/.test(prev.line) || l[0] === ",")) prev.line = `${prev.line}${l[0] === "," ? "" : " "}${l}`;
    else all.push({ line: l, at: k + 1 });
  }
  for (const x of all) {
    // A full stop at the end, unless it ends an abbreviation (r.t., e.e., cat.).
    if (/[^.]\.$/.test(x.line) && !/(?:\b\w\.\w\.|\b(?:cat|conc|equiv|eq|aq|sat|anhyd|abs|approx|xs|steps?)\.)$/i.test(x.line)) x.line = x.line.slice(0, -1).trim();
    const no = unclosed(x.line);
    if (no) return `Line ${x.at}: ${no}`;
  }
  const known = new Set<string>(), ops: Op[] = [];
  let heads: string[] = [], chain: Chain | undefined, grid: { heads: string[]; rows: Cell[][] }[] | undefined, core: { text: string; slots: string[]; given: RegExp } | undefined;
  const add = (c: Compound) => { if (c.number) known.add(c.number); };
  // Compounds joined by +. A + in brackets, or at the end of a word with a space after it ([NH4+], Na+ + Cl−), is a
  // charge. [...] alone changes the first of the compounds before (by its number, or previous when it is the only one).
  const compounds = (s: string, prev: Compound[], at: number): Compound[] | string => {
    const out: Compound[] = [];
    for (const { text: t } of cut(s, (i) => (s[i] === "+" && i > 0 && (/\s/.test(s[i - 1]) || !/^(?:\s|$)/.test(s.slice(i + 1))) ? 1 : 0))) {
      const c = compound(t, known, () => prev[0]?.number ?? (prev.length === 1 ? "previous" : undefined));
      if (typeof c === "string") return `Line ${at}: ${c}`;
      out.push(c); add(c);
    }
    return out;
  };
  const flush = (): string | undefined => {
    if (chain) {
      const c = chain, first = c.start[0], end = c.steps[c.steps.length - 1].products;
      chain = undefined;
      // A chain back to its first compound (its number, or its text again) with a title (its centre) or a step with +x
      // or -x is a catalytic cycle: step k runs from intermediate k to k + 1, the last back to the first. With neither,
      // it is a scheme when a step has a yield or a line over or under its arrow, which a cycle's steps do not take.
      const back = c.start.length === 1 && end.length === 1 && c.steps.length > 1 && ((first.number !== undefined && end[0].from === first.number && !end[0].changes) || (first.text !== undefined && end[0].text === first.text && String(end[0].labels) === String(first.labels)));
      if (back && (c.heads.length || c.steps.some((s) => cut(s.conditions, (i) => sepAt(s.conditions, i)).some((x) => /^\s*(?:\+|[-−](?!\s*\d))/.test(x.text))))) {
        if (c.steps.some((s) => s.products.length !== 1)) return `Line ${c.steps[0].line}: a cycle has one intermediate a step`;
        const steps: Record<string, unknown>[] = [];
        for (const [k, s] of c.steps.entries()) {
          const x = conditions(s.conditions, known, true);
          if (typeof x === "string") return `Line ${s.line}: ${x}`;
          if (Object.keys(x).length) steps.push({ step: k, ...x });
        }
        ops.push({ tool: "cycle", args: { intermediates: [first, ...c.steps.slice(0, -1).map((s) => s.products[0])], ...(c.heads.length ? { centre: c.heads.join("\n") } : {}), ...(steps.length ? { steps } : {}) } });
        return;
      }
      ops.push(...c.heads.map((h) => ({ tool: "text", args: { text: h } })));
      const steps: Step[] = [];
      for (const s of c.steps) {
        const x = conditions(s.conditions, known, false);
        if (typeof x === "string") return `Line ${s.line}: ${x}`;
        steps.push({ ...x, ...(s.arrow !== "reaction" ? { arrow: s.arrow } : {}), products: s.products } as Step);
      }
      if (back && !steps.some((s) => s.yield || s.above || s.below)) return `Line ${c.steps[0].line}: the steps come back to ${first.number ?? first.text}, so they read two ways: a catalytic cycle (write +x for what goes in, -x for what comes out) or a scheme (give a step its yield)`;
      ops.push({ tool: "reaction", args: { start: c.start, steps } });
    }
    if (grid) {
      // With a title (# line) or a line of text, a figure of panels, a row a line; else a grid of structures, as many
      // across as the longest line has.
      const g = grid;
      grid = undefined;
      if (g.some((p) => p.heads.length) || g.some((p) => p.rows.flat().some((x) => "note" in x))) ops.push({ tool: "figure", args: { panels: g.map((p) => {
        const title = p.heads.find((h) => head(h)[1] === "#"), subtitle = p.heads.find((h) => head(h)[1] !== "#");
        return { ...(title && head(title)[2] ? { title: head(title)[2] } : {}), ...(subtitle ? { subtitle: head(subtitle)[2] } : {}), rows: p.rows.map((row) => row.map((x) => ("note" in x ? { text: x.note } : (({ text: structure, ...c }: Compound) => (structure === undefined ? c : { structure, ...c }))(x)))) };
      }) } });
      else {
        const rows = g.flatMap((p) => p.rows), columns = Math.max(...rows.map((x) => x.length));
        ops.push({ tool: "structures", args: { structures: rows.flat(), ...(columns > 1 ? { columns } : {}) } });
      }
    }
  };
  for (const { line, at } of all) {
    if (line[0] === "#") {
      // A title: of a panel of the figure being read, else of what comes next (a scheme's title, a cycle's centre).
      const p = grid?.[grid.length - 1];
      if (p && !p.rows.length) p.heads.push(line);
      else if (p && head(line)[1] === "#") grid!.push({ heads: [line], rows: [] });
      else if (p) p.heads.push(line);
      else { const no = flush(); if (no) return no; heads.push(line); }
      continue;
    }
    const split = arrowsOf(line);
    if (typeof split === "string") return `Line ${at}: ${split}`;
    const smiles = !split.arrows.length && /^([^\s>]+)>([^\s>]+)>([^\s>]+)$/.exec(line);
    if (smiles) return `Line ${at}: "${line.slice(0, 40)}" is a reaction SMILES with agents: write ${smiles[1].slice(0, 20)} -> ${smiles[3].slice(0, 20)}, ${smiles[2].slice(0, 20)}`;
    // A scope's core: a SMILES with {R} groups, ending with a colon or after "core:". Lines R=Me (5) 80% are its
    // compounds.
    if (!split.arrows.length && line.includes("{") && (/:$/.test(line) || /^core\b/i.test(line))) {
      const text = line.replace(/^core\b\s*:?\s*|\s*:$/gi, ""), slots = [...text.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].trim());
      core = { text, slots, given: new RegExp(`^(?:${slots.map((x) => x.replace(/\W/g, "\\$&")).join("|")})\\s*=`) };
      continue;
    }
    if (split.arrows.length) {
      const { parts, arrows } = split;
      let reactants: Compound[];
      if (!parts[0]) {
        if (!chain) return `Line ${at} starts with an arrow, but there is no compound before it to go on from: write the starting material first`;
        reactants = chain.steps.length ? chain.steps[chain.steps.length - 1].products : chain.start;
      } else {
        if (cut(parts[0], (i) => sepAt(parts[0], i)).length > 1) return `Line ${at}: "${parts[0].slice(0, 40)}" reads two ways: starting materials (write them with +), or a compound and its conditions (they go after the arrow and its product)`;
        const start = compounds(parts[0], [], at);
        if (typeof start === "string") return start;
        // A line that starts with the last line's products, by their numbers, goes on from them.
        const last = chain && (chain.steps.length ? chain.steps[chain.steps.length - 1].products : chain.start);
        if (last && start.length === last.length && start.every((c, k) => c.from !== undefined && !c.changes && c.from === last[k].number)) reactants = last;
        else {
          const no = flush();
          if (no) return no;
          chain = { start, steps: [], heads: heads.map((h) => head(h)[2]) }; heads = []; reactants = start;
        }
      }
      for (const [k, p] of parts.slice(1).entries()) {
        const first = cut(p, (i) => sepAt(p, i))[0].text;
        if (!first.trim()) return `Line ${at}: an arrow has no product after it`;
        const made = compounds(first, reactants, at);
        if (typeof made === "string") return made;
        chain!.steps.push({ arrow: arrows[k], products: made, conditions: p.slice(first.length).replace(/^[,;]\s*/, ""), line: at });
        reactants = made;
      }
      continue;
    }
    // Compounds, one or more on a line between |.
    if (chain) { const no = flush(); if (no) return no; }
    grid ??= [{ heads, rows: [] }];
    heads = [];
    const row: Cell[] = [], rows = grid[grid.length - 1].rows;
    for (const { text: t0 } of cut(line, (i) => (line[i] === "|" ? 1 : 0))) {
      const t = t0.trim();
      if (!t) continue;
      if (quoted(t)) { row.push({ note: unquote(t) }); continue; }
      let c: Compound | string;
      if (core?.given.test(t)) {
        // A compound of the scope: its groups (R=Me, Ar=Ph), then its number and caption.
        const tail = /\s(?=[([]|\*\*|")|$/.exec(t)!, own = compound(`x${t.slice(tail.index)}`, known), values = new Map<string, string>();
        if (typeof own === "string") return `Line ${at}: ${own}`;
        // The groups split as conditions are (2,4-Cl2C6H3 is one), and at a space before the next NAME=.
        const given = t.slice(0, tail.index).replace(/\s*=\s*/g, "=");
        for (const kv of cut(given, (i) => sepAt(given, i)).flatMap((x) => x.text.split(/\s+(?=[^\s=]+=)/)).map((x) => x.trim()).filter(Boolean)) {
          const m = /^([^=]+)=(.+)$/.exec(kv), k = m?.[1].trim();
          if (!m || !core.slots.includes(k!)) return `Line ${at}: "${kv.slice(0, 40)}" is not a group of the core (${core.slots.join(", ")}): write R=Me`;
          values.set(k!, m[2].trim());
        }
        // A group the line does not give keeps its label (Ph in CC{Ph}).
        c = compound(core.text.replace(/\{([^{}]+)\}/g, (_, k: string) => `{${values.get(k.trim()) ?? k}}`), known);
        if (typeof c !== "string") c = { ...c, ...(own.number ? { number: own.number } : {}), ...(own.caption ? { caption: own.caption } : {}) };
      } else c = compound(t, known, () => (rows.length || row.length ? "previous" : undefined));
      if (typeof c === "string") return `Line ${at}: ${c}`;
      row.push(c); add(c);
    }
    rows.push(row);
  }
  const no = flush();
  if (no) return no;
  ops.push(...heads.map((h) => ({ tool: "text", args: { text: head(h)[2] } })));
  if (!ops.length) return "There is nothing to draw: write one reaction a line (A + B -> C, conditions), or compounds";
  if (rest.kind !== undefined && (ops.length > 1 || rest.kind !== ops[0].tool)) return `kind does not go with lines, which draw ${ops.length > 1 ? "several things" : `a ${ops[0].tool}`}: leave kind out`;
  delete rest.kind;
  // Several drawings take only what the reply is to have; where each goes is for one drawing.
  const one = ops.length > 1 && Object.keys(rest).find((k) => !["picture", "picture_size", "detail"].includes(k));
  if (one) return `${one} goes with one drawing, and these lines make ${ops.length}: draw them in separate calls, or leave ${one} out`;
  // Schemes alone, with a title or more than one, or a step's label, are a route (plan 5.4): one series of numbers,
  // each title over its scheme, wrapped to the page, and with a label, letters on the arrows and the conditions in a
  // note under each scheme.
  const lettered = ops.some((o) => o.tool === "reaction" && (o.args.steps as Step[]).some((st) => st.label));
  if ((lettered || ops.length > 1) && ops.every((o) => o.tool === "text" || o.tool === "reaction") && ops[ops.length - 1].tool === "reaction") {
    const schemes: object[] = [];
    let titles: string[] = [];
    for (const o of ops) if (o.tool === "text") titles.push(o.args.text as string); else { schemes.push({ ...(titles.length ? { title: titles.join(" ") } : {}), ...o.args }); titles = []; }
    return { op: "route", args: { schemes, ...(lettered ? { legend: "letters" } : {}), ...rest } };
  }
  return ops.length === 1 ? { op: ops[0].tool, args: { ...ops[0].args, ...rest } } : { op: "batch", args: { steps: ops, ...rest } };
}

/** fromLines' result as the call that draws it: a kind of draw, a route (draw_route), or a change of several
 * operations (a batch is drawn as change draws one). For the checks and the model test, which call the tools as an AI
 * app does. */
export const callOf = (r: { op: string; args: any }): [string, unknown] => (r.op === "route" ? ["draw_route", r.args] : r.op === "batch" ? ["change", { operations: r.args.steps.map((s: { tool: string; args: object }) => (s.tool === "text" ? { op: "text", ...s.args } : { op: "draw", kind: s.tool, ...s.args })), ...(({ steps: _, ...reply }) => reply)(r.args) }] : ["draw", { kind: r.op, ...r.args }]);
