// For checks only (src/chemfig.check.ts, src/chemfigcopy-stress.check.ts): chemfig code read at TeX's level, as one
// reader for both checks (issue 59, D24). Every atom is set as chemfig sets it (maths mode, \mbox for text), and
// texLint throws where TeX would stop: a double superscript or subscript (x^{a}^{b}, and a prime after a superscript),
// a script with no argument, a text command in maths or a maths command in text, a $ that ends maths, #, & or %, a
// \color outside 0 to 255, a \charge item it cannot read, a command that reads or writes files or defines macros, and
// a line longer than TeX's buffer (200,000 characters in TeX Live). No TeX is installed on Sam's Mac, so this reader
// stands in for a compile there.
//
// chemfig facts used (its source on CTAN, chemfig.tex, read 17 November 2026): a \charge's keys go first in its first
// argument (\charge{[keys]items}{atom}); \. \: \| are the marks there (shortcuts=true); a dot is drawn with
// \draw[<.style>] and its default .style is {fill=black}; a circled ring takes **[start,end,tikz]n(; each branch and
// ring opens a TeX group (\begingroup), and pdfTeX stops at 255 grouping levels.
const TEXT_ONLY = new Set(["'", "`", "^", "\"", "~", "=", ".", "u", "v", "H", "c", "r", "ss", "ae", "AE", "oe", "OE", "o", "O", "l", "L", "i", "AA", "boldmath"]);
const MATH_ONLY = new Set(["alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta", "eta", "theta", "vartheta", "iota", "kappa", "lambda", "mu", "nu", "xi", "pi", "varpi", "rho", "varrho", "sigma", "varsigma", "tau", "upsilon", "phi", "varphi", "chi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi", "Psi", "Omega", "pm", "mp", "times", "div", "cdot", "bullet", "leq", "geq", "neq", "approx", "sim", "equiv", "propto", "infty", "surd", "partial", "nabla", "int", "sum", "cdots", "ldots", "hbar",
  "rightarrow", "leftarrow", "leftrightarrow", "rightleftharpoons", "uparrow", "downarrow", "ddagger", "dagger", "ast", "oplus", "ominus", "circ", "backslash", "hat", "mathrm", "mathbf", "mathit", "scriptstyle", "prime"]);
// Commands that read or write files, define macros or change TeX's reading: never in the code.
const DANGER = /\\(input|include|def|edef|gdef|xdef|let|csname|endcsname|write|immediate|openout|openin|read|catcode|newcommand|renewcommand|usepackage|special|directlua|ShellEscape|jobname|endinput|expandafter)(?![A-Za-z])/;
const BUF = 200000; // TeX Live's buf_size: the longest line TeX reads
type Tok = { t: string; group?: Tok[] };
function tokens(s: string, where: string): Tok[] {
  const stack: Tok[][] = [[]];
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === "\\") {
      const m = /^\\([A-Za-z]+|[^A-Za-z])/.exec(s.slice(k));
      if (!m) throw new Error(`${where}: \\ at the end`);
      stack[stack.length - 1].push({ t: m[0] });
      k += m[0].length - 1;
      if (/^\\[A-Za-z]+$/.test(m[0])) while (s[k + 1] === " ") k++;
      continue;
    }
    if (ch === "{") { const g: Tok[] = []; stack[stack.length - 1].push({ t: "{", group: g }); stack.push(g); continue; }
    if (ch === "}") { if (stack.length < 2) throw new Error(`${where}: } with no {`); stack.pop(); continue; }
    stack[stack.length - 1].push({ t: ch });
  }
  if (stack.length !== 1) throw new Error(`${where}: { with no }`);
  return stack[0];
}
const flat = (list: Tok[]): string => list.map((x) => (x.group ? `{${flat(x.group)}}` : x.t)).join("");
// Split at sep outside braces.
export function splitTop(s: string, sep: string): string[] {
  const out = [""];
  let d = 0;
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === "\\") { out[out.length - 1] += ch + (s[k + 1] ?? ""); k++; continue; }
    if (ch === "{") d++;
    if (ch === "}") d--;
    if (ch === sep && !d) out.push(""); else out[out.length - 1] += ch;
  }
  return out;
}
// A token list set in maths or text mode, failing where TeX would stop.
function typeset(list: Tok[], math: boolean, where: string): void {
  let sup = false, sub = false, primed = false;
  const nucleus = () => { sup = false; sub = false; primed = false; };
  for (let k = 0; k < list.length; k++) {
    const x = list[k], t = x.t;
    const arg = (n = 1) => { const out: Tok[] = []; for (let j = 0; j < n; j++) { k++; while (list[k]?.t === " ") k++; if (k >= list.length) throw new Error(`${where}: ${t} has no argument`); out.push(list[k]); } return out; };
    const inner = (a: Tok) => (a.group ? a.group : [a]);
    if (t === "$") {
      const end = list.findIndex((y, j) => j > k && y.t === "$");
      if (end < 0) throw new Error(`${where}: $ with no end`);
      if (math) throw new Error(`${where}: $ in maths mode ends it`);
      typeset(list.slice(k + 1, end), true, where);
      k = end;
      continue;
    }
    if (t === "^" || t === "_") {
      if (!math) throw new Error(`${where}: ${t} in text mode`);
      if (t === "^" && sup && !primed) throw new Error(`${where}: double superscript`);
      if (t === "_" && sub) throw new Error(`${where}: double subscript`);
      const [a] = arg();
      if (a.t === "^" || a.t === "_") throw new Error(`${where}: ${t} with no argument`);
      typeset(inner(a), true, where);
      if (t === "^") { sup = true; primed = false; } else sub = true;
      continue;
    }
    if (t === "'" && math) {
      if (sup && !primed) throw new Error(`${where}: a prime after a superscript (double superscript)`);
      sup = true; primed = true;
      continue;
    }
    if (x.group) { typeset(x.group, math, where); nucleus(); continue; }
    if (t.startsWith("\\")) {
      const name = t.slice(1);
      if (math && TEXT_ONLY.has(name)) throw new Error(`${where}: ${t} in maths mode`);
      if (!math && MATH_ONLY.has(name)) throw new Error(`${where}: ${t} in text mode`);
      if (name === "mbox") { const [a] = arg(); typeset(inner(a), false, where); nucleus(); continue; }
      if (["mathrm", "mathbf", "mathit", "underline", "phantom"].includes(name)) { const [a] = arg(); typeset(inner(a), math, where); nucleus(); continue; }
      if (["'", "`", "^", "\"", "~", "=", ".", "u", "v", "H", "c", "r"].includes(name)) { const [a] = arg(); typeset(inner(a), false, where); nucleus(); continue; }
      if (name === "hat") { const [a] = arg(); typeset(inner(a), true, where); nucleus(); continue; }
      if (name === "color") {
        if (list[k + 1]?.t === "[") { const close = list.findIndex((y, j) => j > k && y.t === "]"); const model = list.slice(k + 2, close).map((y) => y.t).join(""); if (model !== "RGB") throw new Error(`${where}: colour model ${model}`); k = close; }
        const [a] = arg(), v = flat(a.group ?? []).split(",").map(Number);
        if (v.length !== 3 || v.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error(`${where}: \\color values ${v}`);
        continue;
      }
      if (name === "chemabove" || name === "chembelow") { const [a, b] = arg(2); typeset(inner(a), math, where); typeset(inner(b), math, where); nucleus(); continue; }
      if (name === "charge") { const [a, b] = arg(2); chargeItems(a.group ?? [], where); typeset(inner(b), math, where); nucleus(); continue; }
      if (name === "scriptstyle") continue;
      nucleus();
      continue;
    }
    if (t === " ") continue;
    if (t === "#") throw new Error(`${where}: # in text`);
    if (t === "%") throw new Error(`${where}: % comments out the rest of the line`);
    if (t === "&") throw new Error(`${where}: & is an alignment tab`);
    nucleus();
  }
}
// \charge's first argument: [keys], then items angle:shift[node options]=content, each content set in text mode.
function chargeItems(list: Tok[], where: string) {
  let rest = flat(list);
  if (rest.startsWith("[")) {
    let d = 0, k = 0;
    for (; k < rest.length; k++) { if (rest[k] === "{") d++; if (rest[k] === "}") d--; if (rest[k] === "]" && !d) break; }
    rest = rest.slice(k + 1);
  }
  for (const item of splitTop(rest, ",")) {
    const m = /^(-?\d+(?:\.\d+)?)(?::([\d.]+pt))?(\[[^\]]*\])?=(.*)$/s.exec(item);
    if (!m) throw new Error(`${where}: \\charge item ${item}`);
    if (/^\\[.:|"]$/.test(m[4])) continue; // a mark (shortcuts=true, chemfig's default)
    typeset(tokens(m[4], where), false, where);
  }
}
// The atom groups of chemfig code: the text between bonds, branches and rings, hooks taken off.
function groupsOf(code: string): string[] {
  const text = code.split("\n").filter((l) => !l.startsWith("%")).join("\n");
  const body = text.slice(text.indexOf("\\chemfig{") + 9, text.lastIndexOf("}"));
  const out: string[] = [];
  let i = 0;
  const skip = () => { let d = 0; for (; i < body.length; i++) { if (body[i] === "{") d++; if (body[i] === "}") d--; if (body[i] === "]" && !d) { i++; return; } } };
  while (i < body.length) {
    const ch = body[i];
    if (/\s/.test(ch) || ch === "(" || ch === ")") { i++; continue; }
    if (ch === "[") { skip(); continue; }
    if (ch === "*") { i++; if (body[i] === "*") i++; if (body[i] === "[") skip(); i++; continue; }
    if (/[-=~<>]/.test(ch)) { i++; if (ch === "=" && /[\^_]/.test(body[i])) i++; if (/[<>]/.test(ch) && /[:|]/.test(body[i])) i++; if (body[i] === "[") skip(); continue; }
    let atom = "";
    while (i < body.length && !/[\s\-=~<>()*]/.test(body[i])) {
      if (body[i] === "?") { i++; skip(); continue; }
      if (body[i] === "{") { let d = 0, k = i; for (; k < body.length; k++) { if (body[k] === "\\") { k++; continue; } if (body[k] === "{") d++; if (body[k] === "}" && !--d) break; } atom += body.slice(i, k + 1); i = k + 1; continue; }
      if (body[i] === "\\") { const m = /^\\([A-Za-z]+|.)/.exec(body.slice(i))!; atom += m[0]; i += m[0].length; continue; }
      atom += body[i++];
    }
    out.push(atom);
  }
  return out;
}
// chemfig's atoms in a group: a new one at a capital outside braces (what comes before the first capital stays with
// it), and at |.
function atomsIn(group: string): string[] {
  const out = [""];
  let d = 0, capital = false;
  for (let k = 0; k < group.length; k++) {
    const ch = group[k];
    if (ch === "\\") { const m = /^\\([A-Za-z]+|.)/.exec(group.slice(k))!; out[out.length - 1] += m[0]; k += m[0].length - 1; continue; }
    if (ch === "{") d++;
    if (ch === "}") d--;
    if (!d && ch === "|") { out.push(""); capital = false; continue; }
    if (!d && /[A-Z]/.test(ch)) { if (capital) out.push(""); capital = true; }
    out[out.length - 1] += ch;
  }
  return out.filter(Boolean);
}
// Throws where TeX would stop on the code (where: the name for the message).
export function texLint(code: string, where: string): void {
  for (const [n, line] of code.split("\n").entries()) if (line.length > BUF) throw new Error(`${where}: line ${n + 1} has ${line.length} characters, more than TeX's buffer (${BUF})`);
  if (!/^[\t\n\x20-\x7e]*$/.test(code)) throw new Error(`${where}: not ASCII`);
  const danger = DANGER.exec(code);
  if (danger) throw new Error(`${where}: ${danger[0]} in the code`);
  for (const group of groupsOf(code)) for (const a of atomsIn(group)) typeset(tokens(a, where), true, `${where} [${a.slice(0, 80)}]`);
}
// How deep branches and rings nest (outside braces): each is a TeX group, and rule 8 holds it to log2(atoms) + 24.
export const nesting = (code: string) => { let d = 0, most = 0, br = 0; const body = code.slice(code.indexOf("\\chemfig{") + 9, code.lastIndexOf("}")); for (let k = 0; k < body.length; k++) { const ch = body[k]; if (ch === "\\") { k++; continue; } if (ch === "{") br++; if (ch === "}") br--; if (!br && ch === "(") most = Math.max(most, ++d); if (!br && ch === ")") d--; } return most; };
