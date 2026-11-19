// Run: node src/chemfig.check.ts. Fails loudly if the chemfig code (src/chemfig.ts: File > More Formats > Export LaTeX
// (chemfig)… and Copy as LaTeX (chemfig), and an AI app's read) stops drawing the structures as the page does, or
// could stop LaTeX: every drawing here goes through a strict reading of chemfig's syntax (ASCII, braces, a fixed list
// of commands, bonds, rings and hooks as chemfig takes them) and a replay of chemfig's own placing rules (its manual's:
// absolute angles, lengths, rings at the start and after a bond, nested rings), which must put each atom where the
// page has it. With CHEMFIG_TEX=<file> it writes every drawing's code into one LaTeX file; when pdflatex is on the
// PATH it compiles that file too. Every code is also read at TeX's level (scripts/chemfiglint.ts, the reader the stress
// check uses too), which fails where TeX would stop. Sam's corpus is read where it is on this Mac.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { nesting, texLint } from "../scripts/chemfiglint.ts";
import { browser } from "../scripts/checkkit.ts";
import { chemfig, texText, toChemfig, WAVY_NOTE } from "./chemfig.ts";
import { ESCAPES } from "./escapes.ts";
import { render, type Atom, type Bond, type Ink, type Mol } from "./render.ts";

type P = [number, number];
const pt = 4 / 3;
const S = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
// Every glyph is a box about an Arial capital's size, as in render.check.ts.
const box: P[] = [];
for (let i = 0; i <= 10; i++) { const f = i / 10; box.push([9.6 * f, 0], [9.6 * f, -9.5], [0, -9.5 * f], [9.6, -9.5 * f]); }
const ink = (): Ink => ({ width: 9.6, ascent: 9.5, outline: box });
const c30 = Math.cos(Math.PI / 6), s30 = 0.5, RAD = Math.PI / 180;
const A = (label: string, x: number, y: number, more: Partial<Atom> = {}): Atom => ({ label, location: [x, y, 0], ...more });
const B = (a: number, b: number, type = 1, more: Partial<Bond> = {}): Bond => ({ type, atoms: [a, b], ...more });
const compact = (atoms: Atom[], bonds: Bond[]) => { const code = toChemfig({ atoms, bonds }, S, ink, { compact: true }); if (code) texLint(code, code); return code; };
const TEX: string[] = []; // every drawing's code, for CHEMFIG_TEX

// ---- The strict reading of chemfig's syntax, and the replay of its placing rules ----

// The commands the code may hold: chemfig's, the maths and text commands for labels, Greek, signs, accents, escapes.
const SIGN_COMMANDS = ["circ", "pm", "mp", "times", "div", "cdot", "bullet", "leq", "geq", "neq", "approx", "sim", "equiv", "propto", "infty", "surd", "partial", "nabla", "int", "sum", "cdots", "ldots", "hbar", "AA", "mu",
  "rightarrow", "leftarrow", "leftrightarrow", "rightleftharpoons", "uparrow", "downarrow", "ddagger", "dagger", "ast", "oplus", "ominus"];
const ALLOWED = new Set(["chemfig", "charge", "chargeangle", "chemabove", "chembelow", "phantom", "mathrm", "mathbf", "mathit", "underline", "mbox", "boldmath", "color", "scriptstyle", "delta", "varsigma", "prime",
  ...Object.keys(ESCAPES).filter((k) => /[\u0370-\u03ff]/.test(ESCAPES[k])), ...SIGN_COMMANDS, "ss", "ae", "AE", "oe", "OE", "o", "O", "l", "L", "i",
  "`", "'", "^", "~", "=", "u", ".", "\"", "r", "H", "v", "c", ":", "|", "{", "}", "#", "$", "%", "&", "_", "backslash", "hat"]);
const TIKZ = [/^draw=none$/, /^dotted$/, /^dashed$/, /^line width=2pt$/, /^dash pattern=on 0\.4pt off 1\.2pt$/, /^decorate$/, /^decoration=\{snake,amplitude=0\.6pt,segment length=2\.4pt\}$/, /^-stealth$/, /^stealth-$/, /^color=\{rgb,255:red,\d{1,3};green,\d{1,3};blue,\d{1,3}\}$/];
// Split at commas outside braces; at most n pieces (the last takes the rest).
const split = (s: string, n = Infinity) => {
  const out = [""];
  let depth = 0;
  for (const ch of s) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (ch === "," && !depth && out.length < n) out.push("");
    else out[out.length - 1] += ch;
  }
  return out;
};
const tikzOk = (t: string, where: string) => { if (t) for (const k of split(t)) assert.ok(TIKZ.some((r) => r.test(k)), `${where}: TikZ option ${k}`); };
// How many of chemfig's atoms a label's text holds: a new one starts at a capital letter outside braces and commands,
// and at |.
function count(text: string): number {
  if (!text) return 0;
  let n = 1;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (ch === "\\") { k++; if (/[A-Za-z]/.test(text[k])) while (/[A-Za-z]/.test(text[k + 1] ?? "")) k++; continue; }
    if (ch === "{") { let depth = 1; while (depth && ++k < text.length) { if (text[k] === "\\") { k++; continue; } depth += text[k] === "{" ? 1 : text[k] === "}" ? -1 : 0; } continue; }
    if ((ch === "|" || /[A-Z]/.test(ch)) && k && text[k - 1] !== "|") n++;
  }
  return n;
}
// A \charge's first argument: [keys]items, each angle:shift[anchor]=mark. Returns each item's angle and mark.
function charges(arg: string, where: string): { t: number; mark: string }[] {
  let rest = arg;
  if (rest.startsWith("[")) {
    let depth = 0, k = 0;
    for (; k < rest.length; k++) { if (rest[k] === "{") depth++; if (rest[k] === "}") depth--; if (rest[k] === "]" && !depth) break; }
    // A coloured atom's dots filled and drawn in its colour, its bars 0.4 pt in its colour (D19).
    const c = "\\{rgb,255:red,\\d{1,3};green,\\d{1,3};blue,\\d{1,3}\\}", keys = new RegExp(`^lewisautorot=true$|^\\.style=\\{draw=(${c}),fill=\\1\\}$|^\\|style=\\{draw=${c},line width=0\\.4pt\\}$`);
    for (const key of split(rest.slice(1, k))) assert.ok(keys.test(key), `${where}: \\charge key ${key}`);
    rest = rest.slice(k + 1);
  }
  return split(rest).map((item) => {
    const m = /^(-?\d+):(\d+)pt(\[anchor=180\+\\chargeangle\])?=(.+)$/.exec(item);
    assert.ok(m, `${where}: \\charge item ${item}`);
    const t = Number(m[1]);
    assert.ok(t > -180 && t <= 180, `${where}: \\charge angle ${t}`);
    assert.ok(/^\\[.:|]$/.test(m[4]) || /^\$(\\color\[RGB\]\{\d+,\d+,\d+\})?\\scriptstyle [^$]+\$$/.test(m[4]), `${where}: \\charge mark ${m[4]}`);
    return { t, mark: m[4] };
  });
}

type Read = { slots: P[]; deepest: number; hooks: Map<string, number>; rings: number[]; marks: { slot: number; t: number; mark: string }[]; texts: string[] };
// Reads code as chemfig does and fails on anything chemfig would not take; replays where it puts each atom (bond
// lengths, y up, the first atom at 0, 0).
function read(code: string, where: string): Read {
  assert.ok(/^[\t\n\x20-\x7e]*$/.test(code), `${where}: not ASCII`);
  texLint(code, where);
  const lines = code.split("\n");
  let k0 = 0;
  while (lines[k0]?.startsWith("%")) { assert.equal(lines[k0], WAVY_NOTE, `${where}: comment`); k0++; }
  const all = lines.slice(k0).join("\n");
  assert.ok(all.startsWith("\\chemfig{") && all.endsWith("}"), `${where}: one \\chemfig{…} and nothing after it`);
  assert.ok(!/(^|[^\\])#/.test(all), `${where}: # outside \\#`);
  let depth = 0;
  for (let k = 0; k < all.length; k++) {
    if (all[k] === "\\") { k++; continue; }
    depth += all[k] === "{" ? 1 : all[k] === "}" ? -1 : 0;
    assert.ok(depth >= 0 && (depth > 0 || k === all.length - 1 || k < 9), `${where}: braces at ${k}`);
  }
  assert.equal(depth, 0, `${where}: braces balance`);
  for (const m of all.matchAll(/\\([A-Za-z]+|[^A-Za-z])/g)) assert.ok(ALLOWED.has(m[1]), `${where}: command \\${m[1]}`);
  const body = all.slice(9, -1);
  let i = 0;
  const ws = () => { while (i < body.length && /\s/.test(body[i])) i++; };
  const bracket = () => { // at [, the text to the matching ]
    let d = 0, k = i;
    for (; k < body.length; k++) { if (body[k] === "{") d++; if (body[k] === "}") d--; if (body[k] === "]" && !d) break; }
    const t = body.slice(i + 1, k);
    i = k + 1;
    return t;
  };
  const out: Read = { slots: [], deepest: 0, hooks: new Map(), rings: [], marks: [], texts: [] };
  // An atom's text, with its hooks: up to the next bond, branch, ring or space.
  let lastCount = 0;
  const atomText = (): number => {
    let text = "";
    while (i < body.length && !/[\s\-=~<>()*]/.test(body[i])) {
      const ch = body[i];
      if (ch === "?") {
        i++;
        assert.equal(body[i], "[", `${where}: hook without [`);
        const f = split(bracket(), 3), name = f[0];
        assert.ok(/^\d+$/.test(name), `${where}: hook name ${name}`);
        const seen = out.hooks.get(name) ?? 0;
        assert.ok(seen < 2, `${where}: hook ${name} more than twice`);
        if (!seen) assert.equal(f.length, 1, `${where}: the first hook ${name} is plain`);
        else { assert.ok(f.length === 1 || /^(\{(=|~|<|>|<:|>:|<\||>\|)\})?$/.test(f[1] ?? ""), `${where}: hook bond ${f[1]}`); tikzOk(f[2] ?? "", where); }
        out.hooks.set(name, seen + 1);
        continue;
      }
      if (ch === "{") { let d = 0, k = i; for (; k < body.length; k++) { if (body[k] === "\\") { k++; continue; } if (body[k] === "{") d++; if (body[k] === "}" && !--d) break; } text += body.slice(i, k + 1); i = k + 1; continue; }
      if (ch === "\\") { const m = /^\\([A-Za-z]+|.)/.exec(body.slice(i))!; text += m[0]; i += m[0].length; continue; }
      assert.ok(/[A-Za-z0-9^_'.+|]/.test(ch), `${where}: ${ch} in an atom outside braces`);
      text += ch;
      i++;
    }
    // Maths shifts pair up within an atom, and a \charge's marks are read.
    assert.equal((text.replace(/\\\$/g, "").match(/\$/g) ?? []).length % 2, 0, `${where}: $ in ${text}`);
    for (const m of text.matchAll(/\\charge\{/g)) {
      let d = 1, k = m.index! + 8;
      while (d && k < text.length) { k++; if (text[k] === "\\") { k++; continue; } d += text[k] === "{" ? 1 : text[k] === "}" ? -1 : 0; }
      for (const c of charges(text.slice(m.index! + 8, k), where)) out.marks.push({ slot: out.slots.length - 1, ...c });
    }
    out.texts.push(text);
    return count(text);
  };
  // The replay. A frame is a branch or a ring: where it started, and for a ring its size, first side's angle, sides.
  type Ring = { kind: "ring"; n: number; first: number; sides: number; nested: boolean; at: P; last: number; action: string };
  type Branch = { kind: "branch"; at: P; last: number; action: string; count: number };
  const frames: (Ring | Branch)[] = [];
  let pos: P = [0, 0], last = 0, action = "start", start = 0;
  ws();
  if (body[i] === "[") { const t = bracket(); const m = /^:(-?\d+(\.\d+)?)$/.exec(t); assert.ok(m, `${where}: start ${t}`); start = last = Number(m[1]); }
  ws();
  out.slots.push([0, 0]);
  lastCount = atomText();
  const go = (angle: number, length: number) => { pos = [pos[0] + length * Math.cos(angle * RAD), pos[1] + length * Math.sin(angle * RAD)]; last = angle; };
  for (;;) {
    ws();
    if (i >= body.length) break;
    const ch = body[i];
    out.deepest = Math.max(out.deepest, frames.length);
    if (ch === "(") { frames.push({ kind: "branch", at: pos, last, action, count: lastCount }); i++; ws(); assert.ok(/[-=~<>]/.test(body[i]), `${where}: a branch starts with a bond`); continue; }
    if (ch === ")") {
      const f = frames.pop();
      assert.ok(f, `${where}: ) with no (`);
      if (f.kind === "ring") {
        assert.equal(f.sides, f.nested ? f.n - 1 : f.n, `${where}: a ${f.n}-ring with ${f.sides} sides`);
        if (!f.nested) assert.ok(Math.hypot(pos[0] - f.at[0], pos[1] - f.at[1]) < 1e-6, `${where}: ring closes`);
        action = "ring";
      } else action = f.action;
      pos = f.at; last = f.last; lastCount = f.kind === "branch" ? f.count : lastCount;
      i++;
      continue;
    }
    if (ch === "*") {
      // (A circle in a colour: **[0,360,color=…]n(, D20.)
      const m = /^(\*\*?)(\[0,360,color=\{rgb,255:red,\d{1,3};green,\d{1,3};blue,\d{1,3}\}\])?([3-8])\(/.exec(body.slice(i));
      assert.ok(m && (!m[2] || m[1] === "**"), `${where}: ring ${body.slice(i, i + 4)}`);
      i += m[0].length;
      const n = Number(m[3]), top = frames[frames.length - 1];
      const nested = action === "side" && top?.kind === "ring";
      const first = action === "start" ? start - 90 + 360 / n : nested ? last + 360 / (top as Ring).n - 180 + 360 / n : action === "bond" ? last - 90 + 180 / n : NaN;
      assert.ok(!Number.isNaN(first), `${where}: a ring after ${action}`);
      out.rings.push(n);
      frames.push({ kind: "ring", n, first, sides: 0, nested, at: pos, last, action });
      action = "ringstart";
      continue;
    }
    assert.ok(/[-=~<>]/.test(ch), `${where}: ${ch} where a bond goes (at ${i}: ${body.slice(i, i + 20)})`);
    const m = /^(=\^|=_|=|~|-|<:|>:|<\||>\||<|>)/.exec(body.slice(i))!;
    i += m[0].length;
    const fields = body[i] === "[" ? split(bracket(), 5) : [];
    const [angle = "", length = "", from = "", to = "", tikz = ""] = fields;
    tikzOk(tikz, where);
    assert.ok(!from || (/^\d+$/.test(from) && +from >= 1 && +from <= lastCount), `${where}: departure atom ${from} of ${lastCount}`);
    if (lastCount > 1) assert.ok(from, `${where}: a bond leaves a label of ${lastCount} atoms without naming one`);
    const top = frames[frames.length - 1];
    const side = top?.kind === "ring";
    if (side) {
      // A ring's side: no angle or length; the ring places it.
      const r = top as Ring;
      assert.ok(!angle && !length, `${where}: a side with an angle or length`);
      assert.ok(m[0] === "-" || m[0] === "=" || m[0] === "=_" || /^[<>]/.test(m[0]) || m[0] === "~", `${where}: side ${m[0]}`);
      go(r.first + (360 / r.n) * r.sides, 1);
      r.sides++;
      assert.ok(r.sides <= (r.nested ? r.n - 1 : r.n), `${where}: too many sides`);
      action = "side";
      if (!r.nested && r.sides === r.n) { ws(); assert.ok(body[i] === ")" && !to, `${where}: a ring's last side closes it`); continue; }
    } else {
      const a = /^:(-?\d+(\.\d+)?)$/.exec(angle);
      assert.ok(a, `${where}: a bond's absolute angle (${angle})`);
      // (No bond, drawn or not, under a hundredth of a bond length: D21.)
      assert.ok(!length || (/^\d+(\.\d+)?$/.test(length) && +length >= 0.01), `${where}: length ${length}`);
      go(Number(a[1]), length ? Number(length) : 1);
      action = "bond";
    }
    out.slots.push(pos);
    lastCount = atomText();
    assert.ok(!to || (/^\d+$/.test(to) && +to >= 1 && +to <= lastCount), `${where}: arrival atom ${to} of ${lastCount}`);
    if (lastCount > 1) assert.ok(to, `${where}: a bond meets a label of ${lastCount} atoms without naming one`);
  }
  assert.equal(frames.length, 0, `${where}: ( with no )`);
  for (const [name, n] of out.hooks) assert.equal(n, 2, `${where}: hook ${name} once`);
  // Rule 8: branches and rings nest at most log2(atoms) + 24 deep, never over 64 (each is a TeX group).
  assert.ok(out.deepest <= Math.min(64, Math.log2(Math.max(2, out.slots.length)) + 24), `${where}: nests ${out.deepest} deep`);
  assert.equal(nesting(code), out.deepest, `${where}: two readings of the nesting`);
  return out;
}

// The reader fails where TeX stops (D24): a double superscript or subscript, and a prime after a superscript.
for (const bad of ["\\chemfig{Fe^{I}^{I}}", "\\chemfig{CH_2_{3}}", "\\chemfig{-[:0]NH_{3}^{+}^{+}}", "\\chemfig{R^{1}'}"]) {
  assert.throws(() => texLint(bad, bad), /double (superscript|subscript)/);
  assert.throws(() => read(bad, bad), /double (superscript|subscript)/);
}

// The page's place of each atom (bond lengths: the drawing's median bond, as render() takes it).
function places(mol: Mol): P[] {
  const raw = mol.bonds.map((b) => Math.hypot(mol.atoms[b.atoms[0]].location[0] - mol.atoms[b.atoms[1]].location[0], mol.atoms[b.atoms[0]].location[1] - mol.atoms[b.atoms[1]].location[1]));
  const median = [...raw].sort((x, y) => x - y)[Math.floor(raw.length / 2)] || 1;
  return mol.atoms.map((a) => [a.location[0] / median, a.location[1] / median]);
}
// A drawing's code, readable and compact, read strictly and replayed: each atom within 0.02 bond lengths of the page,
// and a fused ring's last corner on its atom. The readable lines, trimmed and joined, are the compact code.
function check(name: string, mol: Mol, tolerance = 0.02) {
  const trace: number[] = [], r = chemfig(mol, S, ink, { trace }), c = chemfig(mol, S, ink, { compact: true });
  if (!r.code) return { ...r, read: undefined, compact: c.code };
  const [lead, rest] = r.code.startsWith("%") ? [r.code.slice(0, r.code.indexOf("\n") + 1), r.code.slice(r.code.indexOf("\n") + 1)] : ["", r.code];
  assert.equal(lead + rest.split("\n").map((l) => l.trim()).join(""), c.code, `${name}: readable and compact differ`);
  assert.equal(r.notice, c.notice);
  for (const code of [r.code, c.code]) read(code, name);
  const got = read(r.code, name), at = places(mol), root = at[trace[0]];
  assert.equal(got.slots.length, trace.length, `${name}: ${got.slots.length} atoms read, ${trace.length} written`);
  assert.deepEqual([...new Set(trace.filter((x) => x >= 0))].sort((x, y) => x - y), mol.atoms.flatMap((a, k) => (a.hidden ? [] : [k])), `${name}: each atom once`);
  assert.equal(trace.filter((x) => x >= 0).length, mol.atoms.filter((a) => !a.hidden).length, `${name}: each atom once`);
  trace.forEach((x, k) => {
    if (x === -1) return;
    const want = at[x >= 0 ? x : -2 - x], p = got.slots[k], off = Math.hypot(p[0] - (want[0] - root[0]), p[1] - (want[1] - root[1]));
    assert.ok(off <= tolerance, `${name}: atom ${x} is ${off.toFixed(3)} bond lengths from the page`);
  });
  TEX.push(`% ${name.replace(/[^\x20-\x7e]/g, "?")}\n${r.code}\n\n${c.code}\n`);
  return { ...r, read: got, compact: c.code, trace };
}

// ---- Bonds, labels and charges, as 1.1.2 wrote them (compact) ----

// Ethanol as a zigzag: skeletal carbons are empty atoms, each bond at its angle, and OH met at its O.
assert.equal(compact([A("C", 0, 0), A("C", c30, s30), A("O", 2 * c30, 0)], [B(0, 1), B(1, 2)]), "\\chemfig{-[:30]-[:-30,,,1]OH}");
assert.equal(compact([A("O", 0, 0), A("C", c30, s30), A("C", 2 * c30, 0)], [B(0, 1), B(1, 2)]), "\\chemfig{HO-[:30,,2]-[:-30]}");
assert.equal(compact([A("C", 0, 0), A("N", 0, 1)], [B(0, 1)]), "\\chemfig{NH_2-[:-90,,1]}");
assert.equal(compact([A("N", 0, 0), A("C", c30, -s30)], [B(0, 1)]), "\\chemfig{H_2N-[:-30,,2]}");
assert.equal(compact([A("C", 0, 0), A("C", 1, 0), A("C", 2, 0), A("C", 2, 1.5)], [B(0, 1), B(1, 2), B(2, 3)]), "\\chemfig{-[:0]-[:0]-[:90,1.5]}");
// A double bond in a chain goes on the page's side; a terminal C=O is centred. Triple and quadruple bonds; wedges
// narrow at Octet's stereocentre.
assert.equal(compact([A("C", 0, 0), A("C", c30, s30), A("C", 2 * c30, 0), A("C", 3 * c30, s30)], [B(0, 1), B(1, 2, 2), B(2, 3)]), "\\chemfig{-[:30]=_[:-30]-[:30]}");
assert.equal(compact([A("C", 0, 0), A("C", c30, s30), A("O", c30, 1 + s30), A("O", 2 * c30, 0)], [B(0, 1), B(1, 2, 2), B(1, 3)]), "\\chemfig{-[:30](=[:90]O)-[:-30,,,1]OH}");
assert.equal(compact([A("C", 0, 0), A("N", 1, 0)], [B(0, 1, 3)]), "\\chemfig{~[:0]N}");
assert.equal(compact([A("Mo", 0, 0), A("Mo", 1, 0)], [B(0, 1, 14)]), "\\chemfig{Mo~[:0]Mo}");
const wedge = (b: Bond) => compact([A("C", 0, 0), A("C", 1, 0)], [b]);
assert.equal(wedge(B(0, 1, 1, { stereo: 1 })), "\\chemfig{<[:0]}");
assert.equal(wedge(B(1, 0, 1, { stereo: 1 })), "\\chemfig{>[:0]}");
assert.equal(wedge(B(0, 1, 1, { stereo: 6 })), "\\chemfig{<:[:0]}");
assert.equal(wedge(B(1, 0, 1, { display: "hollow" })), "\\chemfig{>|[:0]}");
// Bond styles as TikZ options (J6): bold, dashed, hashed, wavy (with the comment line), dative, hydrogen, coloured.
assert.equal(wedge(B(0, 1, 1, { display: "bold" })), "\\chemfig{-[:0,,,,line width=2pt]}");
assert.equal(wedge(B(0, 1, 1, { display: "dashed" })), "\\chemfig{-[:0,,,,dashed]}");
assert.equal(wedge(B(0, 1, 1, { display: "hashed" })), "\\chemfig{-[:0,,,,line width=2pt,dash pattern=on 0.4pt off 1.2pt]}");
assert.equal(wedge(B(0, 1, 1, { display: "wavy" })), `${WAVY_NOTE}\n\\chemfig{-[:0,,,,decorate,decoration={snake,amplitude=0.6pt,segment length=2.4pt}]}`);
assert.equal(wedge(B(0, 1, 1, { display: "dative" })), "\\chemfig{-[:0,,,,-stealth]}");
assert.equal(wedge(B(1, 0, 1, { display: "dative" })), "\\chemfig{-[:0,,,,stealth-]}");
assert.equal(wedge(B(0, 1, 1, { colour: "#ff0000" })), "\\chemfig{-[:0,,,,color={rgb,255:red,255;green,0;blue,0}]}");
assert.equal(wedge(B(0, 1, 1, { colour: "#000000" })), "\\chemfig{-[:0]}", "black writes nothing");
assert.equal(compact([A("O", 0, 0), A("H", 1, 0)], [B(0, 1, 10)]), "\\chemfig{H_2O-[:0,,2,,dotted]H}");
assert.equal(wedge(B(0, 1, 2, { display: "aromatic" })), "\\chemfig{=[:0,,,,dashed]}");
// Charges and isotopes: H2O with its H first, NH4+, 13CH4, a circled charge as a mark, and a skeletal carbocation's +
// where the page draws it.
assert.equal(compact([A("O", 0, 0)], []), "\\chemfig{H_2O}");
assert.equal(compact([A("N", 0, 0, { charge: 1 })], []), "\\chemfig{NH_4^{+}}");
assert.equal(compact([A("C", 0, 0, { isotope: 13 })], []), "\\chemfig{{^{13}C}H_4}");
assert.equal(compact([A("Cl", 0, 0, { charge: -1 })], []), "\\chemfig{Cl^{-}}");
assert.equal(compact([A("O", 0, 0, { charge: -2 })], []), "\\chemfig{O^{2-}}");
assert.match(compact([A("O", 0, 0, { charge: -2, circled: true })], []), /^\\chemfig\{\\charge\{-?\d+:1pt\[anchor=180\+\\chargeangle\]=\$\\scriptstyle 2\\ominus\$\}\{O\}\}$/);
assert.equal(compact([A("C", 0, 0), A("C", c30, s30, { charge: 1 }), A("C", 2 * c30, 0)], [B(0, 1), B(1, 2)]), "\\chemfig{-[:30]\\charge{90:3pt[anchor=180+\\chargeangle]=$\\scriptstyle +$}{}-[:-30]}");
assert.equal(compact([A("C", 0, 0), A("C", c30, s30, { charge: -1, angles: { charge: 200 } }), A("C", 2 * c30, 0)], [B(0, 1), B(1, 2)]), "\\chemfig{-[:30]\\charge{-160:3pt[anchor=180+\\chargeangle]=$\\scriptstyle -$}{}-[:-30]}");
// Written labels: OMe reads MeO from the right and its bond meets the O; CO2Et either way; text chemfig would read as
// code goes in braces; an indole's NH stacks; a hidden H is not written but counts.
assert.equal(compact([A("O", 0, 0, { text: "OMe" }), A("C", 1, 0)], [B(0, 1)]), "\\chemfig{MeO-[:0,,2]}");
assert.equal(compact([A("C", 0, 0), A("C", 1, 0, { text: "CO2Et" })], [B(0, 1)]), "\\chemfig{-[:0,,,1]CO_2Et}");
assert.equal(compact([A("C", 0, 0, { text: "CO2Et" }), A("C", 1, 0)], [B(0, 1)]), "\\chemfig{EtO_2C-[:0,,3]}");
assert.equal(compact([A("C", 0, 0), A("C", 1, 0, { text: "C(CH3)3" })], [B(0, 1)]), "\\chemfig{-[:0,,,1]C|{(CH_3)_3}}");
assert.equal(compact([A("N", 0, 0), A("C", c30, s30), A("C", -c30, s30)], [B(0, 1), B(0, 2)]), "\\chemfig{-[:-30]\\chembelow{N}{H}-[:30]}");
assert.equal(compact([A("C", 0, 0), A("H", 1, 0, { hidden: true })], [B(0, 1)]), "\\chemfig{CH_4}");
// Separate structures keep their places: the second hangs off the first by a bond chemfig does not draw.
assert.equal(compact([A("Na", 0, 0, { charge: 1 }), A("Cl", 2, 0, { charge: -1 })], []), "\\chemfig{Na^{+}(-[:0,2,,,draw=none]Cl^{-})}");
assert.equal(compact([], []), "");
assert.deepEqual(chemfig({ atoms: [A("C", 0, 0, { hidden: true })], bonds: [] }, S, ink), { code: "", notice: "" }, "only hidden atoms: nothing");

// ---- Readable code (J4) ----
{
  const m: Mol = { atoms: [A("C", 0, 0), A("C", c30, s30), A("O", c30, 1 + s30), A("O", 2 * c30, 0)], bonds: [B(0, 1), B(1, 2, 2), B(1, 3)] };
  assert.equal(toChemfig(m, S, ink), "\\chemfig{\n\t-[:30]\n\t(\n\t\t=[:90]O\n\t)\n\t-[:-30,,,1]OH\n}");
  check("acetic acid", m);
}

// ---- Rings (J5) ----
// A pointy-topped hexagon lattice: rings by their middles; atoms shared where they meet; sides single, or as given.
function lattice(centres: P[], n = 6, start = 30): Mol {
  const atoms: Atom[] = [], bonds: Bond[] = [], key = (p: P) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`, index = new Map<string, number>(), have = new Set<string>();
  const R = 1 / (2 * Math.sin(Math.PI / n));
  for (const c of centres) {
    const ids = Array.from({ length: n }, (_, k) => {
      const p: P = [c[0] + R * Math.cos((start + (360 / n) * k) * RAD), c[1] + R * Math.sin((start + (360 / n) * k) * RAD)];
      if (!index.has(key(p))) { index.set(key(p), atoms.length); atoms.push(A("C", p[0], p[1])); }
      return index.get(key(p))!;
    });
    ids.forEach((a, k) => { const b = ids[(k + 1) % n], e = [a, b].sort().join(); if (!have.has(e)) { have.add(e); bonds.push(B(a, b)); } });
  }
  return { atoms, bonds };
}
const h = Math.sqrt(3);
const hex = Array.from({ length: 6 }, (_, k) => A("C", Math.cos(((30 + 60 * k) * Math.PI) / 180), Math.sin(((30 + 60 * k) * Math.PI) / 180)));
const kekule = [0, 1, 2, 3, 4, 5].map((k) => B(k, (k + 1) % 6, k % 2 ? 1 : 2));
{
  const benzene = check("benzene", { atoms: hex, bonds: kekule });
  assert.match(benzene.compact, /^\\chemfig\{\*6\((-=|=-)-=-=-?=?\)\}$/, "benzene in ring syntax");
  assert.equal(benzene.compact.replace(/[^=]/g, "").length, 3, "three double bonds");
  // A circled ring (Toggle Aromatic Display): **6 with single sides.
  const circled = check("circled benzene", { atoms: hex.map((a) => ({ ...a, circle: true })), bonds: kekule });
  assert.equal(circled.compact, "\\chemfig{**6(------)}");
  // A circle in a colour as render() draws it (its first atom's colour), and black or none writes no colour (D20).
  for (const [k, colour] of [[0, "#ff0000"], [3, "#00aa00"], [0, "#000000"]] as const) {
    const m: Mol = { atoms: hex.map((a, j) => ({ ...a, circle: true, ...(j === k ? { colour } : {}) })), bonds: kekule };
    const d = render(m, S, ink), drawn = d.colours.filter((_, j) => d.owners?.[j] === -1), hexc = drawn[0] && drawn[0] !== "#000000" ? drawn[0] : "";
    assert.ok(drawn.length && drawn.every((x) => x === drawn[0]), "the page draws one circle in one colour");
    const rgbOf = (x: string) => [1, 3, 5].map((j) => parseInt(x.slice(j, j + 2), 16)), want = hexc ? `**[0,360,color={rgb,255:red,${rgbOf(hexc)[0]};green,${rgbOf(hexc)[1]};blue,${rgbOf(hexc)[2]}}]6(` : "**6(";
    assert.ok(check(`circle, ${colour} on atom ${k}`, m).compact.startsWith(`\\chemfig{${want}`), `circle, ${colour} on atom ${k}: ${want}`);
  }
  // Pyridine: the N's label in the ring; toluene: the methyl straight out; phenol from its O.
  check("pyridine", { atoms: hex.map((a, k) => (k === 2 ? { ...a, label: "N" } : a)), bonds: kekule });
  const tol = check("toluene", { atoms: [...hex, A("C", 2 * Math.cos(-30 * RAD), 2 * Math.sin(-30 * RAD))], bonds: [...kekule, B(5, 6)] });
  assert.match(tol.compact, /\*6\(/);
  const phenol = check("phenol", { atoms: [A("O", -2 * c30, -1), ...hex.map((a) => ({ ...a }))], bonds: [B(0, 4), ...kekule.map((b) => B(b.atoms[0] + 1, b.atoms[1] + 1, b.type))] });
  assert.match(phenol.compact, /^\\chemfig\{HO-\[:30,,2\]\*6\(/, "a ring after a bond");
  // Fused rings nest (naphthalene, anthracene, phenanthrene); pyrene (an atom in three rings) is bond by bond.
  for (const [name, centres, nested] of [["naphthalene", [[0, 0], [h, 0]], 1], ["anthracene", [[0, 0], [h, 0], [2 * h, 0]], 2], ["phenanthrene", [[0, 0], [h, 0], [1.5 * h, 1.5]], 2], ["triphenylene-like row", [[0, 0], [h, 0], [1.5 * h, 1.5], [2.5 * h, 1.5]], 3]] as [string, P[], number][]) {
    const r = check(name, lattice(centres));
    assert.equal((r.compact.match(/\*6\(/g) ?? []).length, nested + 1, `${name}: ${nested + 1} rings in ring syntax`);
  }
  const pyrene = check("pyrene", lattice([[0, 0], [h, 0], [0.5 * h, 1.5], [1.5 * h, 1.5]]));
  assert.ok(!pyrene.compact.includes("*"), "pyrene bond by bond");
  // Kekulé naphthalene from a lattice: the fused side double, its second line in either ring.
  const naph = lattice([[0, 0], [h, 0]]), shared = naph.bonds.findIndex((b) => b.atoms.every((a) => Math.abs(naph.atoms[a].location[0] - h / 2) < 1e-6));
  check("naphthalene, fused side double", { ...naph, bonds: naph.bonds.map((b, k) => (k === shared ? { ...b, type: 2 } : b)) });
  // Spiro[4.5]decane and norbornane: bond by bond.
  const five = Array.from({ length: 5 }, (_, k) => A("C", -1 / (2 * Math.sin(Math.PI / 5)) + (1 / (2 * Math.sin(Math.PI / 5))) * Math.cos((72 * k) * RAD), (1 / (2 * Math.sin(Math.PI / 5))) * Math.sin(72 * k * RAD)));
  const six = Array.from({ length: 5 }, (_, k) => A("C", 1 + Math.cos((120 - 60 * k) * RAD) * 1, Math.sin((120 - 60 * k) * RAD) * 1));
  const spiro: Mol = { atoms: [...five, ...six], bonds: [...[0, 1, 2, 3, 4].map((k) => B(k, (k + 1) % 5)), B(0, 5), B(5, 6), B(6, 7), B(7, 8), B(8, 9), B(9, 0)] };
  assert.ok(!check("spiro[4.5]decane", spiro).compact.includes("*6"), "spiro: the six-ring bond by bond");
  const norbornane: Mol = { atoms: [A("C", 0, 0), A("C", 1, 0.3), A("C", 2, 0), A("C", 2, -1), A("C", 1, -1.3), A("C", 0, -1), A("C", 1, -0.5)], bonds: [B(0, 1), B(1, 2), B(2, 3), B(3, 4), B(4, 5), B(5, 0), B(0, 6), B(6, 3)] };
  assert.ok(!check("norbornane", norbornane, 0.03).compact.includes("*"));
  // A slanted bond out of a ring, a fusion atom with a bond out, a ring scaled to 150%, a centred double bond in a ring:
  // bond by bond. A ring turned 17° or flipped keeps ring syntax, turned with [:θ].
  const slanted = check("slanted methyl", { atoms: [...hex, A("C", Math.cos(-30 * RAD) + Math.cos(-10 * RAD), Math.sin(-30 * RAD) + Math.sin(-10 * RAD))], bonds: [...kekule, B(5, 6)] });
  assert.ok(!slanted.compact.includes("*"));
  const fusedOut = lattice([[0, 0], [h, 0]]), top = fusedOut.atoms.findIndex((a) => Math.abs(a.location[0] - h / 2) < 1e-6 && a.location[1] > 0);
  fusedOut.atoms.push(A("C", h / 2, 1.5)); fusedOut.bonds.push(B(top, fusedOut.atoms.length - 1));
  assert.ok(!check("fusion atom with a bond out", fusedOut).compact.includes("*"));
  const big = check("benzene at 150%", { atoms: [...hex.map((a) => ({ ...a, location: [a.location[0] * 1.5, a.location[1] * 1.5, 0] as [number, number, number] })), ...Array.from({ length: 9 }, (_, k) => A("C", 5 + k * c30, k % 2 ? s30 : 0))], bonds: [...kekule, ...Array.from({ length: 8 }, (_, k) => B(6 + k, 7 + k))] });
  assert.ok(!big.compact.includes("*") && big.compact.includes(",1.5"), "a scaled ring bond by bond, with its length");
  const centred = check("centred double bond in a ring", { atoms: hex, bonds: kekule.map((b, k) => (k === 0 ? { ...b, position: "centre" as const } : b)) });
  assert.ok(!centred.compact.includes("*"), "a centred double bond: bond by bond");
  const turn = (a: Atom, t: number): Atom => ({ ...a, location: [a.location[0] * Math.cos(t * RAD) - a.location[1] * Math.sin(t * RAD), a.location[0] * Math.sin(t * RAD) + a.location[1] * Math.cos(t * RAD), 0] });
  const turned = check("benzene turned 17°", { atoms: [...hex.map((a) => turn(a, 17)), turn(A("C", 2 * c30, -1), 17)], bonds: [...kekule, B(5, 6)] });
  assert.match(turned.compact, /^\\chemfig\{\[:-?[\d.]+\]\*6\(/, "turned with [:θ]");
  check("benzene flipped", { atoms: hex.map((a) => ({ ...a, location: [-a.location[0], a.location[1], 0] as [number, number, number] })), bonds: kekule });
  // An outside double bond (position set by hand) stays in ring syntax as =_.
  const outside = check("outside double bond", { atoms: hex, bonds: kekule.map((b, k) => (k === 0 ? { ...b, position: "right" as const } : b)) });
  assert.match(outside.compact, /=_/);
  // Other ring sizes: 3 to 8, and a 9-ring bond by bond.
  for (const n of [3, 4, 5, 7, 8, 9]) {
    const r = check(`${n}-ring`, lattice([[0, 0]], n, -90 + 180 / n));
    assert.equal(r.compact.includes(`*${n}(`), n <= 8, `${n}-ring`);
  }
  // Half a benzene ring (a selection of part of it): bond by bond.
  assert.ok(!check("half a ring", { atoms: hex.slice(0, 4), bonds: kekule.slice(0, 3) }).compact.includes("*"));
  // 100 para-phenylenes in a row: the first rings in ring syntax, none starting deeper than 8 levels, valid.
  const row = Array.from({ length: 100 }, (_, k): P => [k * 3, 0]);
  const rings = lattice(row, 6, 0), linkers: Bond[] = [];
  for (let k = 0; k + 1 < row.length; k++) {
    const a = rings.atoms.findIndex((x) => Math.abs(x.location[0] - (row[k][0] + 1)) < 1e-6 && Math.abs(x.location[1]) < 1e-6), b = rings.atoms.findIndex((x) => Math.abs(x.location[0] - (row[k + 1][0] - 1)) < 1e-6 && Math.abs(x.location[1]) < 1e-6);
    linkers.push(B(a, b));
  }
  const chain = check("100 phenylenes", { atoms: rings.atoms, bonds: [...rings.bonds, ...linkers] });
  assert.ok(chain.read!.rings.length >= 4 && chain.read!.rings.length < 100, `phenylenes: ${chain.read!.rings.length} in ring syntax`);
  assert.ok(chain.read!.deepest <= Math.log2(600) + 8 + 1, `phenylenes nest ${chain.read!.deepest} deep`);
  // The same rows, Kekulé and with circles (Toggle Aromatic Display): rings written bond by bond have no circle, and the notice
  // names the aromatic circles; a short row all in ring syntax has nothing to say.
  const circledRow = (n: number): Mol => { const m = lattice(row.slice(0, n), 6, 0); return { atoms: m.atoms.map((a) => ({ ...a, circle: true })), bonds: [...m.bonds.map((b, k) => ({ ...b, type: k % 2 ? 1 : 2 })), ...linkers.slice(0, n - 1)] }; };
  assert.equal(check("100 circled phenylenes", circledRow(100)).notice, "The code does not have the aromatic circles.");
  assert.equal(check("6 circled phenylenes", circledRow(6)).notice, "The code does not have the aromatic circles.");
  assert.equal(check("3 circled phenylenes", circledRow(3)).notice, "");
  // Piperidine as the ring tool draws it, its HN the ring's first atom: the last side takes no arrival atom.
  assert.equal(check("piperidine", { atoms: hex.map((a, k) => (k === 3 ? { ...a, label: "N" } : a)), bonds: kekule.map((b) => B(b.atoms[0], b.atoms[1])) }).compact, "\\chemfig{HN*6(-[,,2]-----)}");
  // Ladders of ortho-fused rings: up to 16 nested in ring syntax; a longer one (a hostile file) bond by bond, so it
  // stays within rule 8 and pdfTeX's 255 grouping levels (D22).
  for (const n of [2, 8, 16, 17, 300]) {
    const ladder = check(`${n}-ring ladder`, lattice(Array.from({ length: n }, (_, k): P => [k * h, 0])));
    assert.equal(ladder.read!.rings.length, n <= 16 ? n : 0, `${n}-ring ladder: ${ladder.read!.rings.length} rings in ring syntax`);
    assert.ok(ladder.read!.deepest <= (n <= 16 ? n : Math.log2(ladder.read!.slots.length) + 1), `${n}-ring ladder nests ${ladder.read!.deepest} deep`);
  }
}

// ---- Marks at the page's angles (J7) ----
{
  const angleOf = (mol: Mol, atom: number) => {
    const d = render(mol, S, ink), a = mol.atoms[atom];
    return d.electrons.filter((e) => e.atom === atom).map((e) => ({ key: e.key, t: (Math.atan2(-(e.at[1] + a.location[1] * d.scale), e.at[0] - a.location[0] * d.scale) * 180) / Math.PI }));
  };
  const close = (x: number, y: number) => Math.abs(((x - y + 540) % 360) - 180) <= 1;
  const cases: [string, Mol, number][] = [
    ["two lone pairs", { atoms: [A("O", 0, 0, { pairs: 2 }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }, 0],
    ["bars", { atoms: [A("O", 0, 0, { pairs: 2, bars: true }), A("C", 1, 0)], bonds: [B(0, 1)] }, 0],
    ["a radical", { atoms: [A("C", 0, 0, { radical: 1 }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }, 0],
    ["a triplet carbene", { atoms: [A("C", 0, 0, { radical: 2 }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }, 0],
    ["a singlet carbene", { atoms: [A("C", 0, 0, { radical: 3 }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }, 0],
    ["a circled charge", { atoms: [A("N", 0, 0, { charge: 1, circled: true }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }, 0],
    ["δ+", { atoms: [A("C", 0, 0, { partial: "+" }), A("Cl", 1, 0, { partial: "-" })], bonds: [B(0, 1)] }, 0],
    ["a pair and a sign moved by hand", { atoms: [A("C", 0, 0, { charge: -1, pairs: 1, angles: { charge: 250, pair0: 100 } }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }, 0],
    ["a radical cation on a label", { atoms: [A("N", 0, 0, { charge: 1, radical: 1 }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }, 0],
    ["a radical cation, skeletal", { atoms: [A("C", 0, 0, { charge: 1, radical: 1 }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }, 0],
    ["a label's sign moved by hand", { atoms: [A("N", 0, 0, { charge: 1, angles: { charge: 200 } }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }, 0],
    ["coloured marks", { atoms: [A("O", 0, 0, { pairs: 2, colour: "#1f77b4", charge: -1, circled: true }), A("C", 1, 0)], bonds: [B(0, 1)] }, 0],
  ];
  for (const [name, mol, atom] of cases) {
    const r = check(name, mol), slot = r.trace!.indexOf(atom), drawn = angleOf(mol, atom);
    const ours = r.read!.marks.filter((x) => x.slot === slot);
    // Each mark the page drew (but a sign written after its label, and a radical ion's sign drawn twice) is in the code
    // at its angle, and nothing else is.
    const want = drawn.filter((e, k) => !(e.key === "charge" && (drawn.findIndex((x) => x.key === "charge") !== k || (!mol.atoms[atom].circled && r.compact.includes("^{")))) && e.key !== "query");
    assert.equal(ours.length, want.length, `${name}: ${ours.length} marks, the page ${want.length}`);
    for (const e of want) assert.ok(ours.some((x) => close(x.t, e.t)), `${name}: the ${e.key ?? "dot"} at ${e.t.toFixed(1)}° (code: ${ours.map((x) => x.t).join(", ")})`);
  }
  // A coloured atom's dots filled in its colour and its bars 0.4 pt in its colour (D19, chemfig's .style={fill=black}
  // and |style={black,line width=0.4pt} with the colour; a dot is drawn with \draw, so its outline too); no keys for
  // black or none.
  const blue = "{rgb,255:red,31;green,119;blue,180}";
  assert.ok(check("coloured marks again", cases[cases.length - 1][1]).compact.includes(`\\charge{[lewisautorot=true,.style={draw=${blue},fill=${blue}},|style={draw=${blue},line width=0.4pt}]`));
  assert.match(check("coloured marks again", cases[cases.length - 1][1]).compact, /\\color\[RGB\]\{31,119,180\}\\scriptstyle \\ominus/);
  assert.ok(check("red radical", { atoms: [A("C", 0, 0, { radical: 1, colour: "#ff0000" }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }).compact.includes("\\charge{[.style={draw={rgb,255:red,255;green,0;blue,0},fill={rgb,255:red,255;green,0;blue,0}},|style="));
  for (const colour of [undefined, "#000000"]) assert.match(check(`two lone pairs, ${colour ?? "no colour"}`, { atoms: [A("O", 0, 0, { pairs: 2, colour }), A("C", 1, 0)], bonds: [B(0, 1)] }).compact, /\\charge\{\[lewisautorot=true\]-?\d+:1pt=\\:,-?\d+:1pt=\\:\}\{O\}/);
}

// ---- Labels: styles, Greek, signs, hostile text (J8) ----
{
  assert.equal(texText("α-Δ±°é").tex, "\\alpha\\mbox{-}\\Delta\\pm^{\\circ}\\mbox{\\'{e}}");
  assert.deepEqual(texText("Αü中😀").left, ["中", "😀"]);
  assert.equal(texText("Α").tex, "A", "capital Alpha as A");
  assert.equal(texText("R'' x°").tex, "R^{\\prime\\prime}\\mbox{ }x^{\\circ}", "primes and the degree sign raised");
  assert.equal(texText("ß").tex, "\\mbox{\\ss}");
  assert.equal(texText("x\u0000\u0007y").tex, "xy", "control characters left out");
  const label = (text: string, more: Partial<Atom> = {}) => check(`label ${JSON.stringify(text).slice(0, 40)}`, { atoms: [A("C", 0, 0), A("C", 1, 0, { text, ...more })], bonds: [B(0, 1)] });
  for (const t of ["\\input{/etc/passwd}", "}{", "%", "#", "$", "&", "~", "^", "_", "!@?*|", "a-b=c~d<e>f(g)h[i]j*k?l!m@n|o,p", "\u0001\u001f\u007f", "\\#\\\\", "x".repeat(10000), "OMe\n", "$$\\def\\x{}$$", "{", "}", "\\", "\\chemfig{C}", "\\csname x\\endcsname", "^^41"]) {
    const r = label(t);
    assert.ok(!/\\(input|def|csname|endcsname|x)\b/.test(r.code), `no command from ${t.slice(0, 20)}`);
  }
  const uni = label("αΔΑ±°éüß中😀");
  assert.equal(uni.notice, "The code does not have the characters 中 and 😀.");
  assert.match(uni.compact, /\\alpha/);
  // Unicode's ε and φ are TeX's \varepsilon and \varphi (\epsilon is ϵ, \phi ϕ).
  assert.deepEqual([texText("ε").tex, texText("φ").tex], ["\\varepsilon", "\\varphi"]);
  // Bold, italic, underline, scripts and colour on a label and its runs; Colour by Element's colour on its label.
  const styled = label("CO2Me", { bold: true, colour: "#00aa00", runs: [{ text: "CO" }, { text: "2", script: "super" }, { text: "Me", italic: true, underline: true }] });
  assert.match(styled.compact, /\\color\[RGB\]\{0,170,0\}/);
  assert.match(styled.compact, /\\mathbf\{C\}/);
  assert.match(styled.compact, /\\underline\{\\mbox\{\\boldmath\$\\mathit\{Me\}\$\}\}/);
  const coloured = check("coloured N", { atoms: [A("N", 0, 0, { colour: "#3050f8" }), A("C", 1, 0)], bonds: [B(0, 1)] });
  assert.match(coloured.compact, /\\color\[RGB\]\{48,80,248\}N/);
  assert.equal(check("black N", { atoms: [A("N", 0, 0, { colour: "#000000" }), A("C", 1, 0)], bonds: [B(0, 1)] }).compact, "\\chemfig{H_2N-[:0,,2]}", "black set by hand writes nothing");
  // A label's oxidation state raised by hand stays with its element; a multi-centre attachment and an attachment
  // point are empty atoms, as the page draws them.
  label("Fe(III)", { runs: [{ text: "Fe" }, { text: "(III)", script: "super" }] });
  // Raised and lowered characters (D18): each chemfig atom's raised ones in one ^{…} and lowered ones in one _{…}, a
  // third part on {} (TeX takes one of each on a base), a prime or degree sign in the raised part, and a charge's
  // sign joined to a raised part. The reader at TeX's level (compact()) passes each.
  const ran = (text: string, runs?: Atom["runs"], more: Partial<Atom> = {}) => compact([A("C", 0, 0), A("C", 1, 0, { text, runs, ...more })], [B(0, 1)]);
  const sup = (text: string) => ({ text, script: "super" as const }), sub = (text: string) => ({ text, script: "sub" as const });
  assert.equal(ran("FeIII", [{ text: "Fe" }, sup("III")]), "\\chemfig{-[:0]Fe^{III}}");
  assert.equal(ran("Fe(III)", [{ text: "Fe" }, sup("(III)")]), "\\chemfig{-[:0]Fe^{(III)}}");
  assert.equal(ran("Fe2+", [{ text: "Fe" }, sup("2+")]), "\\chemfig{-[:0]Fe^{2+}}");
  assert.equal(ran("SO42-", [{ text: "SO" }, sub("4"), sup("2-")]), "\\chemfig{-[:0,,,1]SO_4^{2-}}");
  assert.equal(ran("R1'", [{ text: "R" }, sup("1'")]), "\\chemfig{-[:0]R^{1\\prime}}");
  assert.equal(ran("X1+2", [{ text: "X" }, sub("1"), sup("+"), sub("2")]), "\\chemfig{-[:0]X_1^{+}{}_2}");
  assert.equal(ran("CH2₃", [{ text: "CH" }, sub("2"), { text: "₃" }]), "\\chemfig{-[:0,,,1]CH_{23}}");
  assert.equal(ran("PC•+", [{ text: "PC" }, sup("•+")]), "\\chemfig{-[:0,,,1]PC^{\\bullet+}}");
  assert.equal(ran("NH₃⁺", undefined, { charge: 1 }), "\\chemfig{-[:0,,,1]NH_3^{++}}");
  assert.equal(ran("C°", undefined, { charge: 1 }), "\\chemfig{-[:0]C^{\\circ+}}");
  assert.equal(ran("FeIII", [{ text: "Fe", bold: true }, { ...sup("III"), colour: "#ff0000" }], { colour: "#0000ff" }), "\\chemfig{-[:0]{{\\color[RGB]{0,0,255}\\mathbf{Fe}}^{{\\color[RGB]{255,0,0}III}}}}");
  // A label typed with Unicode scripts or primes gives the code that Text > Superscript and Text > Subscript give.
  for (const [typed, set] of [["Fe³⁺", ran("Fe3+", [{ text: "Fe" }, sup("3+")])], ["SO₄²⁻", ran("SO42-", [{ text: "SO" }, sub("4"), sup("2-")])], ["R¹′", ran("R1'", [{ text: "R" }, sup("1'")])], ["R′", ran("R'", [{ text: "R" }, sup("'")])], ["R'", ran("R'", [{ text: "R" }, sup("'")])], ["CH₃", ran("CH3", [{ text: "CH" }, sub("3")])], ["NH₃⁺", ran("NH3+", [{ text: "NH" }, sub("3"), sup("+")])], ["R₁′", ran("R1'", [{ text: "R" }, sub("1"), sup("'")])]] as const) {
    assert.equal(ran(typed), set, `${typed} typed`);
  }
  const att = check("attachment point", { atoms: [A("C", 0, 0, { attach: true }), A("C", 1, 0), A("C", 1 + c30, s30, { bead: true })], bonds: [B(0, 1), B(1, 2)] });
  assert.equal(att.notice, "The code does not have the attachment points and polymer beads.");
}

// ---- The notice (J9) ----
{
  const ethane = [A("C", 0, 0), A("C", 1, 0)], one = [B(0, 1)];
  const say = (more: Partial<Mol>, bonds = one) => chemfig({ atoms: ethane, bonds, ...more }, S, ink).notice;
  assert.equal(say({}), "", "structures only: nothing more to say");
  assert.equal(say({ arrows: [{ id: 1, kind: "reaction", from: [0, 0], to: [1, 0] }], captions: [{ id: 2, text: "x", x: 0, y: 0 }], shapes: [{ id: 3, kind: "highlight", from: [0, 0], to: [1, 1] }] } as Partial<Mol>), "The code does not have the arrows, text and highlights.");
  assert.equal(say({ cycles: [{}] } as Partial<Mol>), "The code does not have the catalytic cycles.");
  // A charge, radical or lone pair placed on its own with the Symbols tool (#164) is not the atom's: it is named.
  assert.equal(say({ captions: [{ id: 2, text: "x", x: 0, y: 0 }], shapes: [{ id: 3, kind: "symbol", symbol: "plus", from: [1.2, 0.2], to: [1.5, 0.5] }] } as Partial<Mol>), "The code does not have the text and free symbols.");
  assert.equal(say({ shapes: [{ id: 3, kind: "brackets", from: [0, 0], to: [1, 1] }] } as Partial<Mol>), "The code does not have the brackets.");
  assert.equal(say({}, [B(0, 1, 14)]), "The code shows quadruple bonds as triple bonds.");
  assert.equal(say({ captions: [{ id: 2, text: "x", x: 0, y: 0 }] } as Partial<Mol>, [B(0, 1, 14)]), "The code does not have the text. It shows quadruple bonds as triple bonds.");
  assert.equal(say({}, [B(0, 1, 2, { display: "either" })]), "The code shows crossed double bonds as double bonds.");
  assert.equal(say({}, [B(0, 1, 2, { display: "dashed" })]), "The code shows dashed double bonds with both lines dashed.");
  assert.equal(chemfig({ atoms: [A("C", 0, 0, { number: "1", halo: "#ff0000", map: 3 }), A("C", 1, 0)], bonds: one }, S, ink).notice, "The code does not have the highlights, atom numbers and map numbers.");
}

// ---- Odd drawings (S16, S25, S26, S12) ----
{
  // Toggle Hydrogen Display and Hide implicit H: a hidden H and its bond are not written; H counts as the page shows.
  const water = [A("O", 0, 0), A("H", 1, 0, { hidden: true }), A("H", -c30, s30)];
  assert.equal(compact(water, [B(0, 1), B(0, 2)]), "\\chemfig{H-[:-30,,,1]OH}");
  assert.equal(toChemfig({ atoms: [A("N", 0, 0), A("C", 1, 0)], bonds: [B(0, 1)] }, { ...S, hideH: true }, ink, { compact: true }), "\\chemfig{N-[:0]}");
  // Two copies of a structure on one spot: the second hangs off the first by a bond of (almost) no length.
  const two = check("two on one spot", { atoms: [A("C", 0, 0), A("O", 1, 0), A("C", 0, 0), A("O", 1, 0)], bonds: [B(0, 1), B(2, 3)] });
  assert.match(two.compact, /draw=none/);
  // Two bonded atoms on one spot (a ChemDraw file can have them): a bond of a hundredth, not of no length (D21).
  assert.equal(check("bonded on one spot", { atoms: [A("C", 0, 0), A("C", 0, 0), A("C", 1, 0)], bonds: [B(0, 1), B(1, 2)] }).compact, "\\chemfig{-[:0,0.01]-[:0]}");
  // A multi-centre attachment (an η5 ring to Fe) and a variable attachment: drawn as the page draws the atoms.
  const R5 = 1 / (2 * Math.sin(Math.PI / 5)), cp = Array.from({ length: 5 }, (_, k) => A("C", R5 * Math.cos((90 + 72 * k) * RAD), R5 * Math.sin((90 + 72 * k) * RAD)));
  const ferrocene: Mol = { atoms: [...cp, A("C", 0, 0, { centre: { atoms: [0, 1, 2, 3, 4] } }), A("Fe", 0, -1.5)], bonds: [...[0, 1, 2, 3, 4].map((k) => B(k, (k + 1) % 5, k % 2 ? 1 : 2)), B(5, 6)] };
  check("η5 ring on Fe", ferrocene);
  check("variable attachment", { atoms: [...hex, A("C", 0, 0, { centre: { atoms: [0, 1, 2], variable: true } }), A("Cl", 0, -1.5)], bonds: [...kekule, B(6, 7)] });
  // Colour on everything: labels, bonds, marks, a coloured bond in a ring and on a hook.
  const coloured = check("colours", { atoms: [...hex.map((a, k) => ({ ...a, colour: k % 2 ? "#ff0000" : undefined, label: k === 1 ? "N" : "C" })), A("O", 2 * c30, -1, { colour: "#00ff00", pairs: 3, charge: -1 })], bonds: [...kekule.map((b, k) => ({ ...b, colour: k === 2 ? "#0000ff" : undefined })), B(5, 6, 1, { colour: "#123456" })] });
  assert.match(coloured.compact, /color=\{rgb,255:red,18;green,52;blue,86\}/);
  // A red Kekulé ring with a slanted bond out (bond by bond) closes on a single bond, as a black one does: a hook's
  // double bond has no side.
  const red = check("red ring, slanted bond out", { atoms: [...hex, A("C", c30 + Math.cos(10 * RAD), s30 + Math.sin(10 * RAD))], bonds: [...kekule.map((b) => ({ ...b, colour: "#ff0000" })), B(0, 6, 1, { colour: "#ff0000" })] });
  assert.ok(!red.compact.includes("*") && !red.compact.includes("{=}") && /\?\[1,,color=/.test(red.compact), `red ring: ${red.compact}`);
  // A query bond, a bond to itself and a bond to a missing atom are not written; nothing throws.
  check("odd bonds", { atoms: [A("C", 0, 0), A("C", 1, 0)], bonds: [B(0, 1, 5, { query: "any" }), B(0, 0)] });
  // A label of every kind of run, raised and lowered, and an empty label.
  check("runs", { atoms: [A("C", 0, 0), A("C", 1, 0, { text: "R1'", runs: [{ text: "R" }, { text: "1", script: "sub" }, { text: "'", script: "super" }] }), A("C", -1, 0, { text: "" })], bonds: [B(0, 1), B(0, 2)] });
}

// ---- Long and large drawings: no stack overflow, nesting held, time (S3–S6) ----
// (Growth is the fastest of 9 runs and a budget is measured up to 3 times, so one pause on a busy computer does not
// fail it.)
const fastest = (f: () => void) => Math.min(...Array.from({ length: 9 }, () => { const t = performance.now(); f(); return performance.now() - t; }));
const time = (f: () => void, n = 5) => { const ts: number[] = []; for (let k = 0; k < n; k++) { const t = performance.now(); f(); ts.push(performance.now() - t); } return ts.sort((x, y) => x - y)[Math.floor(n / 2)]; };
{
  // A 1,000-atom chain: depth 0, one atom on each line.
  const n = 1000, chain: Mol = { atoms: Array.from({ length: n }, (_, k) => A("C", k * c30, k % 2 ? s30 : 0)), bonds: Array.from({ length: n - 1 }, (_, k) => B(k, k + 1)) };
  const r = check("1,000-atom chain", chain);
  assert.equal(r.read!.deepest, 0);
  assert.equal(r.code.split("\n").length, n + 1);
  // A long chain with a branch on every carbon: branches one deep.
  const m = 3000, comb: Mol = { atoms: Array.from({ length: 2 * m }, (_, k) => A("C", Math.floor(k / 2) * c30, k % 2 ? 1 + (k % 4 === 1 ? s30 : 0) : k % 4 ? 0 : s30)), bonds: Array.from({ length: m }, (_, k) => B(2 * k, 2 * k + 1)).concat(Array.from({ length: m - 1 }, (_, k) => B(2 * k, 2 * k + 2))) };
  assert.equal(read(toChemfig(comb, S, ink), "comb").deepest, 1, "branches one deep");
  // 300 salts in a list: each hangs off the first, one deep.
  const salts: Mol = { atoms: Array.from({ length: 600 }, (_, k) => A(k % 2 ? "Cl" : "Na", (k % 40) * 1.5, -Math.floor(k / 40) * 2, { charge: k % 2 ? -1 : 1 })), bonds: [] };
  assert.equal(check("300 salts", salts).read!.deepest, 1);
  // A 30-membered ring and a cyclic 500-mer: bond by bond with one hook; time grows in line with size.
  const macro = (n: number): Mol => { const R = 1 / (2 * Math.sin(Math.PI / n)); return { atoms: Array.from({ length: n }, (_, k) => A("C", R * Math.cos((2 * Math.PI * k) / n), R * Math.sin((2 * Math.PI * k) / n))), bonds: Array.from({ length: n }, (_, k) => B(k, (k + 1) % n)) }; };
  const m30 = check("30-ring", macro(30));
  assert.equal(m30.read!.hooks.size, 1);
  check("500-ring", macro(500), 0.05);
  const t1 = fastest(() => toChemfig(macro(500), S, ink)), t4 = fastest(() => toChemfig(macro(2000), S, ink));
  assert.ok(t4 < 10 * t1 + 5, `a ring 4 times the size takes ${(t4 / t1).toFixed(1)} times as long`);
  const c1 = fastest(() => toChemfig(chain, S, ink)), chain4: Mol = { atoms: Array.from({ length: 4 * n }, (_, k) => A("C", k * c30, k % 2 ? s30 : 0)), bonds: Array.from({ length: 4 * n - 1 }, (_, k) => B(k, k + 1)) };
  const c4 = fastest(() => toChemfig(chain4, S, ink));
  assert.ok(c4 < 10 * c1 + 5, `a chain 4 times as long takes ${(c4 / c1).toFixed(1)} times as long`);
}
// Real molecules from SMILES (Indigo): 40 paclitaxels, a 500-residue peptide, a steroid, ferrocene. Time: under 300 ms.
browser();
{
  const chem = await import("./chem.ts");
  await chem.ready;
  const taxol = chem.parseStructure("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C");
  const grid: Mol = { atoms: [], bonds: [] };
  for (let k = 0; k < 40; k++) {
    const dx = (k % 8) * 14, dy = -Math.floor(k / 8) * 12, base = grid.atoms.length;
    grid.atoms.push(...taxol.atoms.map((a) => ({ ...a, location: [a.location[0] + dx, a.location[1] + dy, 0] as [number, number, number] })));
    grid.bonds.push(...taxol.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] })));
  }
  const one = check("paclitaxel", taxol, 0.05);
  assert.ok(one.read!.rings.includes(6), "paclitaxel's phenyls in ring syntax");
  check("40 paclitaxels", grid, 0.05);
  let ms = Infinity;
  for (let k = 0; k < 3 && ms >= 300; k++) ms = time(() => chemfig(grid, S, ink));
  console.log(`chemfig: 40 paclitaxels (${grid.atoms.length} atoms) in ${ms.toFixed(0)} ms (median of 5)`);
  assert.ok(ms < 300, `40 paclitaxels took ${ms.toFixed(0)} ms`);
  const { peptideSmiles } = await import("./peptide.ts");
  // (Octet's peptide text takes 60 residues and a SMILES 1,000 atoms at most: five of 100 residues, each two of 50
  // joined, one under another.)
  const fifty = peptideSmiles(`peptide: ${"ACDEFGHIKLMNPQRSTVWY".repeat(3).slice(0, 50)}`)!;
  assert.ok(fifty.endsWith("C(=O)O"));
  const hundred = chem.parseStructure(fifty.slice(0, -1) + fifty), pep: Mol = { atoms: [], bonds: [] };
  const [y0, y1] = [Math.min(...hundred.atoms.map((a) => a.location[1])), Math.max(...hundred.atoms.map((a) => a.location[1]))];
  for (let k = 0; k < 5; k++) {
    const base = pep.atoms.length;
    pep.atoms.push(...hundred.atoms.map((a) => ({ ...a, location: [a.location[0], a.location[1] - k * (y1 - y0 + 3), 0] as [number, number, number] })));
    pep.bonds.push(...hundred.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] })));
  }
  check("500-residue peptide", pep, 0.08);
  let pms = Infinity;
  for (let k = 0; k < 3 && pms >= 300; k++) pms = time(() => chemfig(pep, S, ink), 3);
  console.log(`chemfig: a 500-residue peptide (${pep.atoms.length} atoms) in ${pms.toFixed(0)} ms (median of 3)`);
  assert.ok(pms < 300, `the peptide took ${pms.toFixed(0)} ms`);
  for (const [name, smiles] of [["cholesterol", "C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C"], ["caffeine", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"], ["indole", "c1ccc2[nH]ccc2c1"], ["pyrene", "c1cc2ccc3cccc4ccc(c1)c2c34"], ["coronene", "c1cc2ccc3ccc4ccc5ccc6ccc1c7c2c3c4c5c67"], ["a dendrimer of rings", "c1(-c2cc(-c3ccccc3)cc(-c3ccccc3)c2)cc(-c2cc(-c3ccccc3)cc(-c3ccccc3)c2)cc(-c2cc(-c3ccccc3)cc(-c3ccccc3)c2)c1"], ["ferrocene", "[CH-]1C=CC=C1.[CH-]1C=CC=C1.[Fe+2]"], ["a salt", "[Na+].[O-]C(=O)C"], ["a zwitterion", "[NH3+]CC([O-])=O"]] as const) {
    check(name, chem.parseStructure(smiles), 0.05);
  }
}

// ---- Same code at any zoom and in .oct, CDXML and CDX (S11, S29) ----
{
  const { toCdxml, fromCdxml, parseXml } = await import("./cdxml.ts");
  const { xmlToCdx } = await import("./cdx.ts");
  const { readCdx, readOct, writeOct } = await import("./oct.ts");
  const { DEFAULT_STYLE } = await import("./docstyle.ts");
  const m: Mol = { atoms: [...hex, A("O", 2 * c30, -1, { charge: -1 }), A("N", -2 * c30, 1, { text: "NHBoc" })], bonds: [...kekule, B(5, 6), B(2, 7)] };
  const code = toChemfig(m, S, ink);
  assert.equal(toChemfig(m, { ...S }, ink), code);
  for (const [how, x] of [[".oct", readOct(writeOct(m, DEFAULT_STYLE), true).mol], ["CDXML", fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol], ["CDX", readCdx(xmlToCdx(parseXml(toCdxml(m, DEFAULT_STYLE)))).mol]] as const) {
    check(`round trip ${how}`, x, 0.03);
    assert.equal(toChemfig(x, S, ink).replace(/\[:-?[\d.]+/g, "[:a").replace(/,[\d.]+([,\]])/g, ",l$1"), code.replace(/\[:-?[\d.]+/g, "[:a").replace(/,[\d.]+([,\]])/g, ",l$1"), `the same code after ${how}`);
  }
}

// ---- Sam's corpus: every file reads strictly (S28) ----
{
  const CORPUS = join(homedir(), "octet-research/corpus/sam");
  if (!existsSync(CORPUS)) console.log("chemfig.check: no corpus here, the corpus skipped");
  else {
    const { fromCdxml } = await import("./cdxml.ts");
    let n = 0;
    for (const name of readdirSync(CORPUS).filter((f) => f.endsWith(".cdxml"))) {
      const mol = fromCdxml(readFileSync(join(CORPUS, name), "utf8")).mol, r = chemfig(mol, S, ink), c = chemfig(mol, S, ink, { compact: true });
      if (!r.code) continue;
      read(r.code, name);
      read(c.code, name);
      if ((mol.arrows?.length ?? 0) > 0) assert.match(r.notice, /arrows/, `${name}: the notice names the arrows`);
      TEX.push(`% corpus file ${n + 1}\n${r.code}\n`);
      n++;
    }
    console.log(`chemfig.check: ${n} corpus drawings read`);
  }
}

// ---- The app: the commands, the setting and the writer path (J1, J3, J4) ----
{
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), rust = readFileSync(new URL("../src-tauri/src/export.rs", import.meta.url), "utf8");
  assert.match(editor, /\["more_chemfig", "Export LaTeX \(chemfig\)…", <BracketsCurly size=\{18\} \/>, \(\) => checkFirst\(\(\) => void exportChemfig\(\)\)\],\n\s+\["more_chemfig_copy", "Copy as LaTeX \(chemfig\)", <CodeBlock size=\{18\} \/>, \(\) => copyChemfig\(\)\],/);
  assert.match(editor, /const chemfigOf = \(mol: Mol, compact = settings\.chemfigCompact\) => chemfig\(mol, frame, measure, \{ compact \}\);/);
  assert.equal((editor.match(/chemfig\(mol, frame, measure/g) ?? []).length, 1, "one writer path in the app");
  assert.match(editor, /if \(format === "chemfig"\) return chemfigOf\(mol, o\.compact\)\.code \|\| undefined;/);
  assert.match(rust, /\("tex", "LaTeX \(chemfig\)", &\["tex"\]\)/);
  assert.match(editor, /const \{ code, notice \} = chemfigOf\(selectedPart\(\) \?\? doc\);[\s\S]{0,200}exportAs\(\(\) => \(\{ format: "tex", tex: code \}\)/);
  assert.match(editor, /async function exportAs\([^]*?const path = await exportFile\(\{ name, \.\.\.r \}\);\n\s+if \(path\) saved\(path, text\?\.\(path\)\);/);
  assert.match(rust, /"tex" => e\.tex\.is_some\(\),/);
  assert.match(rust, /"tex" => format!\("\{\}\\n", e\.tex\.as_deref\(\)\.unwrap_or_default\(\)\.trim\(\)\)\.into_bytes\(\),/);
  const settings = readFileSync(new URL("settings.ts", import.meta.url), "utf8"), window = readFileSync(new URL("SettingsWindow.tsx", import.meta.url), "utf8");
  assert.match(settings, /chemfigCompact: saved\.chemfigCompact === true,/);
  assert.match(window, /\.\.\.\(p\.moreFormats \? \[d\("pro", "File menu", "Compact chemfig code", "[^"]*", <Switch on=\{p\.chemfigCompact\} label="Compact chemfig code" onChange=\{p\.onChemfigCompact\} \/>\)\] : \[\]\)/);
  const host = readFileSync(new URL("../scripts/headless/host.ts", import.meta.url), "utf8");
  assert.match(host, /if \(format === "chemfig"\) \{ const d = drawn\(m\); return chemfig\(m, d\.frame, d\.measure, \{ compact: o\?\.compact \}\)\.code \|\| undefined; \}/);
}

// ---- A LaTeX file of everything above; compiled where pdflatex is ----
{
  const tex = `\\documentclass{article}\n\\usepackage{chemfig}\n\\usetikzlibrary{decorations.pathmorphing}\n\\begin{document}\n${TEX.map((t) => `${t}\n\\par\\bigskip\n`).join("\n")}\\end{document}\n`;
  const file = process.env.CHEMFIG_TEX;
  if (file) { writeFileSync(file, tex); console.log(`chemfig.check: ${TEX.length} drawings written to ${file}`); }
  let latex = "";
  try { latex = execFileSync("which", ["pdflatex"], { encoding: "utf8" }).trim(); } catch { latex = ""; }
  if (latex) {
    const dir = join(tmpdir(), `chemfig-check-${process.pid}`), path = join(dir, "all.tex");
    execFileSync("mkdir", ["-p", dir]);
    writeFileSync(path, tex);
    execFileSync(latex, ["-interaction=nonstopmode", "-halt-on-error", "-output-directory", dir, path], { stdio: "pipe", timeout: 600000 });
    console.log("chemfig.check: pdflatex compiled every drawing");
  } else console.log("chemfig.check: no pdflatex here; the code was read strictly instead");
}
