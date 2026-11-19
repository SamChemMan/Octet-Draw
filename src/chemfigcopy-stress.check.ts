// Run: node src/chemfigcopy-stress.check.ts [--ui http://localhost:1462/]. The stress cases ST1 to ST20 of the plan
// (docs/plans/issue-59-chemfig-copy.md) for Copy as LaTeX (chemfig) and the readable chemfig code (issue 59), and ST21
// to ST30 of docs/plans/issue-59-59-1-1-3.md for schemes, names, brackets, arrows, numbers and stereo labels. Each case
// is one risk, made of checks that keep the plan's earlier names (S, X and U) in their descriptions. Checks that only
// repeat src/chemfig.check.ts are left to it. The checks drive the real code: the writer, the file readers and writers,
// the MCP tools on Octet with no window, and with --ui the app itself in WebKit (scripts/look/webkit.swift, in two
// windows of the dev server). Each check runs whatever happens to the others; a case passes when all its checks pass,
// and each failed check is named at the end. CHEMFIG_X14_CDXML=<file> writes X14's drawing as CDXML;
// CHEMFIG_CHEMDRAW_FILE=<file> reads it as ChemDraw 22.2 saved it (opened and saved as CDXML there) and compares its code.
//
// Each case's code is read at TeX's level by scripts/chemfiglint.ts (texLint, the reader chemfig.check.ts uses too):
// it fails where TeX would stop. No TeX is installed here, so nothing is compiled.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import "../scripts/headless/browser.ts";
import { nesting, splitTop, texLint } from "../scripts/chemfiglint.ts";
import { chemfig, toChemfig, TWICE_NOTE, WAVY_ARROW_NOTE, WAVY_NOTE, type ChemfigOptions, type Scheme } from "./chemfig.ts";
import { render, type Atom, type Bond, type Ink, type Mol } from "./render.ts";
import { setLabel } from "./edit.ts";

type P = [number, number];
const UI = process.argv.includes("--ui") ? process.argv[process.argv.indexOf("--ui") + 1] ?? "http://localhost:1462/" : process.env.CHEMFIG_STRESS_UI;

// ---- The cases' runner ----
type Result = { id: string; what: string; ok: boolean; why?: string };
const results: Result[] = [];
async function kase(id: string, what: string, run: () => unknown) {
  try { await run(); results.push({ id, what, ok: true }); }
  catch (e) { results.push({ id, what, ok: false, why: (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 500) }); }
}

// ---- The page as chemfig.check.ts draws it: Arial-sized boxes for glyphs ----
const pt = 4 / 3;
const S = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
const box: P[] = [];
for (let i = 0; i <= 10; i++) { const f = i / 10; box.push([9.6 * f, 0], [9.6 * f, -9.5], [0, -9.5 * f], [9.6, -9.5 * f]); }
const ink = (): Ink => ({ width: 9.6, ascent: 9.5, outline: box });
const c30 = Math.cos(Math.PI / 6), s30 = 0.5, RAD = Math.PI / 180;
const A = (label: string, x: number, y: number, more: Partial<Atom> = {}): Atom => ({ label, location: [x, y, 0], ...more });
const B = (a: number, b: number, type = 1, more: Partial<Bond> = {}): Bond => ({ type, atoms: [a, b], ...more });
const cf = (m: Mol, compact = false) => chemfig(m, S, ink, { compact });
const median = (f: () => void, n = 5) => { const ts: number[] = []; for (let k = 0; k < n; k++) { const t = performance.now(); f(); ts.push(performance.now() - t); } return ts.sort((x, y) => x - y)[Math.floor(n / 2)]; };
// A time budget, measured again (alone, up to three times) before it counts as a failure: the machine is busy.
const within = (ms: number, f: () => void, what: string, n = 5) => { const got: number[] = []; for (let k = 0; k < 3; k++) { got.push(median(f, n)); if (got[k] < ms) return got[k]; } assert.fail(`${what}: ${got.map((x) => x.toFixed(0)).join(", ")} ms, over ${ms} ms each time`); };

// Both layouts of a drawing read at TeX's level, and the readable lines, trimmed and joined, the compact code (rule 4):
// comment lines stay lines, and a scheme's line loses the % that ends it. more: the writer's other options.
function strict(name: string, m: Mol, more: ChemfigOptions = {}) {
  const r = chemfig(m, S, ink, more), c = chemfig(m, S, ink, { ...more, compact: true });
  texLint(r.code, `${name} (readable)`);
  texLint(c.code, `${name} (compact)`);
  const joined = r.code.split("\n").map((l) => (l.startsWith("%") ? `${l}\n` : l.trim().replace(/(?<!\\)%$/, ""))).join("");
  assert.equal(joined, c.code, `${name}: readable and compact differ`);
  assert.equal(r.notice, c.notice, `${name}: two notices`);
  return { code: r.code, compact: c.code, notice: r.notice };
}
const runs = (text: string, rs: Atom["runs"], more: Partial<Atom> = {}): Mol => ({ atoms: [A("C", 0, 0), A("C", 1, 0, { text, runs: rs, ...more })], bonds: [B(0, 1)] });

// ---- Drawings ----
// A hexagon lattice (as chemfig.check.ts builds it): rings by their middles, atoms shared where they meet.
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
const h3 = Math.sqrt(3);
const hex = Array.from({ length: 6 }, (_, k) => A("C", Math.cos((30 + 60 * k) * RAD), Math.sin((30 + 60 * k) * RAD)));
const kekule = [0, 1, 2, 3, 4, 5].map((k) => B(k, (k + 1) % 6, k % 2 ? 1 : 2));
const macro = (n: number): Mol => { const R = 1 / (2 * Math.sin(Math.PI / n)); return { atoms: Array.from({ length: n }, (_, k) => A("C", R * Math.cos((2 * Math.PI * k) / n), R * Math.sin((2 * Math.PI * k) / n))), bonds: Array.from({ length: n }, (_, k) => B(k, (k + 1) % n)) }; };

const chem = await import("./chem.ts");
await chem.ready;
// Structures from SMILES in a grid, each centred on its cell.
function grid(smiles: string[], cols: number, dx: number, dy: number): Mol {
  const out: Mol = { atoms: [], bonds: [] };
  smiles.forEach((s, k) => {
    const m = chem.parseStructure(s), base = out.atoms.length, xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    out.atoms.push(...m.atoms.map((a) => ({ ...a, location: [a.location[0] - cx + (k % cols) * dx, a.location[1] - cy - Math.floor(k / cols) * dy, 0] as [number, number, number] })));
    out.bonds.push(...m.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] })));
  });
  return out;
}
const TAXOL = "CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C";
// A chemist's messy page: 20 kinds of structure (salts, sugars, steroids, aromatics, charges) again and again.
const LIBRARY = ["CC(=O)Oc1ccccc1C(=O)O", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", "C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C", "c1ccc2[nH]ccc2c1", "[Na+].[O-]C(=O)C", "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O",
  "CC(C)Cc1ccc(cc1)[C@@H](C)C(=O)O", "O=C(O)c1ccccc1O", "c1ccc(cc1)-c1ccccc1", "C1CCCCC1", "CCN(CC)CC", "Clc1ccc(cc1)C(c1ccc(Cl)cc1)C(Cl)(Cl)Cl", "FC(F)(F)c1ccccc1", "CC(=O)N[C@@H](Cc1ccccc1)C(=O)O", "N#Cc1ccccc1", "O=[N+]([O-])c1ccccc1",
  "C=CC(=O)OC", "CS(=O)(=O)O", "[NH4+].[Cl-]", "c1ccc2ccccc2c1"];

// ==== The plan's stress list, ST1 to ST20 (each check's earlier name first in its description) ====

await kase("ST1", "S1 an empty drawing, and one of text and arrows only: no code; Copy says so and leaves the clipboard", () => {
  assert.deepEqual(cf({ atoms: [], bonds: [] }), { code: "", notice: "" });
  const only = { atoms: [], bonds: [], captions: [{ id: 1, text: "x", x: 0, y: 0 }], arrows: [{ id: 2, kind: "reaction", from: [0, 0], to: [1, 0] }] } as unknown as Mol;
  assert.equal(cf(only).code, "");
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /function copyChemfig\(\) \{\n\s+const \{ code, notice \} = chemfigOf\(selectedPart\(\) \?\? doc\);\n\s+if \(!code\) return setNotice\("There is no structure to copy\.", "info"\);/);
});

await kase("ST2", "S2 lone atoms: CH4, H2O, Na+, 13C", () => {
  assert.equal(strict("CH4", { atoms: [A("C", 0, 0)], bonds: [] }).compact, "\\chemfig{CH_4}");
  assert.equal(strict("H2O", { atoms: [A("O", 0, 0)], bonds: [] }).compact, "\\chemfig{H_2O}");
  assert.equal(strict("Na+", { atoms: [A("Na", 0, 0, { charge: 1 })], bonds: [] }).compact, "\\chemfig{Na^{+}}");
  assert.match(strict("13C", { atoms: [A("C", 0, 0, { isotope: 13 })], bonds: [] }).compact, /^\\chemfig\{\{\^\{13\}C\}H_4\}$/);
});

const taxols = grid(Array(40).fill(TAXOL), 8, 14, 12);
await kase("ST3", "S4 a chain of 500 residue labels: valid, nesting 0, under 300 ms", () => {
  const names = ["Ala", "Gly", "Ser", "Thr", "Cys", "Val", "Leu", "Ile", "Met", "Pro", "Phe", "Tyr", "Trp", "Asp", "Glu", "Asn", "Gln", "His", "Lys", "Arg"];
  const res: Mol = { atoms: Array.from({ length: 500 }, (_, k) => A("C", k * 2 * c30, k % 2 ? s30 : 0, { text: names[k % 20] })), bonds: Array.from({ length: 499 }, (_, k) => B(k, k + 1)) };
  const r = strict("500 residue labels", res);
  assert.equal(nesting(r.compact), 0);
  within(300, () => cf(res), "500 residue labels", 3);
});

await kase("ST4", "S5 a 1,000-atom chain: depth 0, no stack overflow, valid", () => {
  const n = 1000, chain: Mol = { atoms: Array.from({ length: n }, (_, k) => A("C", k * c30, k % 2 ? s30 : 0)), bonds: Array.from({ length: n - 1 }, (_, k) => B(k, k + 1)) };
  assert.equal(nesting(strict("1,000 chain", chain).compact), 0);
});

await kase("ST2", "S5 300 salts in a list: each one level down, valid", () => {
  const salts: Mol = { atoms: Array.from({ length: 600 }, (_, k) => A(k % 2 ? "Cl" : "Na", (k % 40) * 1.5, -Math.floor(k / 40) * 2, { charge: k % 2 ? -1 : 1 })), bonds: [] };
  assert.equal(nesting(strict("300 salts", salts).compact), 1);
});

await kase("ST4", "S6 a 30-ring and a cyclic 500-mer bond by bond with one hook; 4 times the atoms under 10 times the time", () => {
  assert.equal((strict("30-ring", macro(30)).compact.match(/\?\[1\]/g) ?? []).length, 2);
  strict("500-ring", macro(500));
  const small = macro(1000), large = macro(4000);
  let ratio = Infinity;
  for (let k = 0; k < 3 && ratio >= 10; k++) ratio = median(() => cf(large), 5) / median(() => cf(small), 5);
  assert.ok(ratio < 10, `4 times the atoms took ${ratio.toFixed(1)} times as long`);
});

const HOSTILE = ["\\input{/etc/passwd}", "}{", "%", "#", "$", "&", "~", "^", "_", "!@?*|", "a-b=c~d<e>f(g)h[i]j*k?l!m@n|o,p", "\u0001\u001f\u007f", "\\#\\\\", "x".repeat(10000), "OMe\n", "$$\\def\\x{}$$", "{", "}", "\\", "\\chemfig{C}",
  "\\csname x\\endcsname", "^^41", "\\catcode`\\@=11", "\\write18{rm -rf ~}", "\\immediate\\write18{x}", "\\directlua{os.exit()}", "\\let\\x\\relax", "\\expandafter", "%\n\\end{document}", "\\par", "\\\\", "\\$", "\\{", "a\\b", "''", "'''", "^'", "_'"];
await kase("ST5", "S7 hostile labels from a file: every special escaped or braced, no command outside the list, valid", () => {
  for (const t of HOSTILE) strict(`label ${JSON.stringify(t).slice(0, 30)}`, setLabel({ atoms: [A("C", 0, 0), A("C", 1, 0)], bonds: [B(0, 1)] }, 1, t));
  for (const t of HOSTILE) strict(`written label ${JSON.stringify(t).slice(0, 30)}`, { atoms: [A("C", 0, 0), A("C", 1, 0, { text: t })], bonds: [B(0, 1)] });
});

await kase("ST6", "S8 Unicode labels: Greek, signs, accents as TeX; 中 and an emoji left out and named; ASCII", () => {
  const r = strict("Unicode", { atoms: [A("C", 0, 0), A("C", 1, 0, { text: "αΔΑ±°éüß中😀" })], bonds: [B(0, 1)] });
  assert.match(r.compact, /\\alpha/);
  assert.match(r.compact, /\\Delta/);
  assert.equal(r.notice, "The code does not have the characters 中 and 😀.");
  for (const t of ["µ", "Å", "½", "¹³C", "ñ", "ı", "€", "→", "⇌", "…", "‰", "–", "—", "≠", "\u00a0", "x\u0301", "i\u0301", "j\u030c", "Ω", "ϕ", "ϑ", "ς"]) strict(`label ${t}`, { atoms: [A("C", 0, 0), A("C", 1, 0, { text: t })], bonds: [B(0, 1)] });
});

await kase("ST8", "S9 fused and odd rings: naphthalene, anthracene, phenanthrene nested; pyrene, spiro, norbornane bond by bond; valid", () => {
  for (const [name, centres, n] of [["naphthalene", [[0, 0], [h3, 0]], 2], ["anthracene", [[0, 0], [h3, 0], [2 * h3, 0]], 3], ["phenanthrene", [[0, 0], [h3, 0], [1.5 * h3, 1.5]], 3]] as [string, P[], number][]) {
    assert.equal((strict(name, lattice(centres)).compact.match(/\*6\(/g) ?? []).length, n, name);
  }
  assert.ok(!strict("pyrene", lattice([[0, 0], [h3, 0], [0.5 * h3, 1.5], [1.5 * h3, 1.5]])).compact.includes("*"));
  const norbornane: Mol = { atoms: [A("C", 0, 0), A("C", 1, 0.3), A("C", 2, 0), A("C", 2, -1), A("C", 1, -1.3), A("C", 0, -1), A("C", 1, -0.5)], bonds: [B(0, 1), B(1, 2), B(2, 3), B(3, 4), B(4, 5), B(5, 0), B(0, 6), B(6, 3)] };
  assert.ok(!strict("norbornane", norbornane).compact.includes("*"));
  for (const [name, smiles] of [["steroid", "C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C"], ["coronene", "c1cc2ccc3ccc4ccc5ccc6ccc1c7c2c3c4c5c67"], ["spiro[4.5]decane", "C1CCC2(C1)CCCCC2"], ["cubane", "C12C3C4C1C5C2C3C45"], ["adamantane", "C1C2CC3CC1CC(C2)C3"], ["[2.2]paracyclophane", "c1cc2ccc1CCc1ccc(cc1)CC2"]]) strict(name, chem.parseStructure(smiles));
});

await kase("ST9", "S10 a structure turned 17°, one flipped, one at 150% among others: valid; the turned ring keeps ring syntax", () => {
  const turn = (a: Atom, t: number): Atom => ({ ...a, location: [a.location[0] * Math.cos(t * RAD) - a.location[1] * Math.sin(t * RAD), a.location[0] * Math.sin(t * RAD) + a.location[1] * Math.cos(t * RAD), 0] });
  assert.match(strict("turned", { atoms: [...hex.map((a) => turn(a, 17)), turn(A("C", 2 * c30, -1), 17)], bonds: [...kekule, B(5, 6)] }).compact, /^\\chemfig\{\[:-?[\d.]+\]\*6\(/);
  strict("flipped", { atoms: hex.map((a) => ({ ...a, location: [-a.location[0], a.location[1], 0] as [number, number, number] })), bonds: kekule });
  assert.ok(strict("150%", { atoms: [...hex.map((a) => ({ ...a, location: [a.location[0] * 1.5, a.location[1] * 1.5, 0] as [number, number, number] })), ...Array.from({ length: 9 }, (_, k) => A("C", 5 + k * c30, k % 2 ? s30 : 0))], bonds: [...kekule, ...Array.from({ length: 8 }, (_, k) => B(6 + k, 7 + k))] }).compact.includes(",1.5"));
});

await kase("ST10", "S11 zoom and dark mode cannot change the code: the writer takes the document's frame and measure only (U6 zooms in WebKit)", async () => {
  const { DEFAULT_STYLE, frameStyle, readStyle } = await import("./docstyle.ts");
  const f = frameStyle(readStyle(DEFAULT_STYLE), chem.STYLE.bond);
  assert.deepEqual(Object.keys(f).filter((k) => /colou?r|dark|paper|theme|zoom/i.test(k)), []);
  const src = readFileSync(new URL("chemfig.ts", import.meta.url), "utf8");
  assert.ok(!/matchMedia|prefers-color-scheme|zoom|darkPaper|systemDark/.test(src.replace(/^\s*\/\/.*$/gm, "")), "the writer reads no theme or zoom");
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /const chemfigOf = \(mol: Mol, compact = settings\.chemfigCompact\) => \{\n\s+const own = mol === doc \|\| mol === selectedPart\(\), labels = own && loaded && mol\.atoms\.some\(\(a\) => a\.cip\) \? stereoLabels\(mol\) : undefined;\n\s+return chemfig\(mol, frame, measure, \{ compact, schemes: own \? schemesIn\(mol\) : undefined, stereo: labels && \{ \.\.\.labels, parens: settings\.stereoParens \} \}\);/);
});

await kase("ST11", "S12 colours on labels, bonds and marks; black writes nothing; Colour by Element as the page has it", () => {
  const r = strict("colours", { atoms: [...hex.map((a, k) => ({ ...a, colour: k % 2 ? "#ff0000" : undefined, label: k === 1 ? "N" : "C" })), A("O", 2 * c30, -1, { colour: "#00ff00", pairs: 3, charge: -1 })], bonds: [...kekule.map((b, k) => ({ ...b, colour: k === 2 ? "#0000ff" : undefined })), B(5, 6, 1, { colour: "#123456" })] });
  assert.match(r.compact, /\\color\[RGB\]\{0,255,0\}/);
  assert.match(r.compact, /color=\{rgb,255:red,18;green,52;blue,86\}/);
  assert.equal(strict("black", { atoms: [A("N", 0, 0, { colour: "#000000" }), A("C", 1, 0)], bonds: [B(0, 1, 1, { colour: "#000000" })] }).compact, "\\chemfig{H_2N-[:0,,2]}");
  // Colour by Element sets each atom's colour (Editor.tsx colourByElement), so the code has it.
  const by: Record<string, string> = { N: "#3050f8", O: "#ff0d0d", S: "#ffff30", Cl: "#1ff01f" };
  const m = chem.parseStructure("O=S(=O)(Cl)c1ccc(N)cc1");
  const coloured = strict("by element", { ...m, atoms: m.atoms.map((a) => (by[a.label] ? { ...a, colour: by[a.label] } : a)) });
  for (const hexc of Object.values(by)) { const [r2, g, b] = [1, 3, 5].map((k) => parseInt(hexc.slice(k, k + 2), 16)); assert.ok(coloured.compact.includes(`\\color[RGB]{${r2},${g},${b}}`), hexc); }
});

const MARKS: [string, Mol][] = [
  ["two lone pairs", { atoms: [A("O", 0, 0, { pairs: 2 }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }],
  ["bars", { atoms: [A("O", 0, 0, { pairs: 2, bars: true }), A("C", 1, 0)], bonds: [B(0, 1)] }],
  ["a radical", { atoms: [A("C", 0, 0, { radical: 1 }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }],
  ["a triplet carbene", { atoms: [A("C", 0, 0, { radical: 2 }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }],
  ["a circled charge", { atoms: [A("N", 0, 0, { charge: 1, circled: true }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }],
  ["δ+ δ−", { atoms: [A("C", 0, 0, { partial: "+" }), A("Cl", 1, 0, { partial: "-" })], bonds: [B(0, 1)] }],
  ["a pair and a sign moved by hand", { atoms: [A("C", 0, 0, { charge: -1, pairs: 1, angles: { charge: 250, pair0: 100 } }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] }],
  ["a skeletal sign moved past ±180", { atoms: [A("C", 0, 0), A("C", c30, s30, { charge: 1, angles: { charge: 540 } }), A("C", 2 * c30, 0)], bonds: [B(0, 1), B(1, 2)] }],
];
await kase("ST12", "S13 marks: pairs, bars, radicals, carbenes, circled and partial charges, marks moved by hand: valid; one \\charge item for each mark the page draws", () => {
  for (const [name, m] of MARKS) {
    const r = strict(name, m), d = render(m, S, ink), items = [...r.compact.matchAll(/\\charge\{(?:\[[^\]]*\])?([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)].flatMap((x) => splitTop(x[1], ","));
    // (A label's sign written after it is not a mark in the code; a radical ion's sign is drawn once.)
    const drawn = d.electrons.filter((e, k) => e.key !== "query" && !(e.key === "charge" && (d.electrons.findIndex((x) => x.atom === e.atom && x.key === "charge") !== k || (!m.atoms[e.atom].circled && r.compact.includes("^{")))));
    assert.equal(items.length, drawn.length, `${name}: ${items.length} \\charge items, the page ${drawn.length} marks`);
  }
});

await kase("ST13", "S15 a ring of wavy bonds closed on a hook: the comment line, valid", () => {
  // A wavy bond that closes a ring (on a hook) still gets the comment line.
  const ring = macro(9);
  assert.ok(strict("wavy ring", { ...ring, bonds: ring.bonds.map((b) => ({ ...b, display: "wavy" as const })) }).code.startsWith(WAVY_NOTE));
});

await kase("ST13", "S16 explicit H atoms from SMILES: valid", () => {
  strict("explicit H", chem.parseStructure("[H]C([H])([H])[H]"));
});

await kase("ST16", "S17 a copy is no edit: copyChemfig and the writer change nothing (U5 undoes and redoes in WebKit)", () => {
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), body = /function copyChemfig\(\) \{([\s\S]*?)\n  \}/.exec(editor)![1];
  assert.ok(!/\bset\(|setDoc|commit\(/.test(body), "copyChemfig sets no drawing");
  const m = chem.parseStructure("CC(=O)Oc1ccccc1C(=O)O"), before = JSON.stringify(m);
  cf(m); cf(m, true);
  assert.equal(JSON.stringify(m), before, "the writer leaves the drawing as it was");
});

await kase("ST20", "S28 Sam's corpus (local): every drawing's code valid at TeX's level", async () => {
  const dir = join(homedir(), "octet-research/corpus/sam");
  if (!existsSync(dir)) { console.log("chemfigcopy-stress: no corpus here; S28 skipped"); return; }
  const { fromCdxml } = await import("./cdxml.ts");
  const bad: string[] = [];
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".cdxml")).sort()) {
    const mol = fromCdxml(readFileSync(join(dir, f), "utf8")).mol;
    if (!cf(mol).code) continue;
    n++;
    try { strict(f, mol); } catch (e) { bad.push(`${f} (${(e as Error).message.replace(/^.*\]: /, "")})`); }
  }
  assert.equal(bad.length, 0, `${bad.length} of ${n} drawings: ${bad.join("; ")}`);
});

await kase("ST20", "S29 .oct, CDXML and CDX round trips give the same code (angles and lengths within their rounding)", async () => {
  const { toCdxml, fromCdxml, parseXml } = await import("./cdxml.ts"), { xmlToCdx } = await import("./cdx.ts"), { readCdx, readOct, writeOct } = await import("./oct.ts"), { DEFAULT_STYLE } = await import("./docstyle.ts");
  const m = grid(["CC(=O)Oc1ccccc1C(=O)O", "[NH3+]CC([O-])=O", "c1ccc2ccccc2c1", "C[C@H](N)C(=O)O"], 2, 9, 8);
  m.atoms.push(A("O", 30, 0, { text: "OMe", pairs: 2 }), A("C", 31, 0), A("N", 34, 0, { colour: "#ff0000", charge: 1, radical: 1 }), A("C", 35, 0));
  m.bonds.push(B(m.atoms.length - 4, m.atoms.length - 3), B(m.atoms.length - 2, m.atoms.length - 1));
  const norm = (c: string) => c.replace(/(-?\d+\.\d+)/g, (x) => String(Math.round(+x)));
  const code = norm(cf(m, true).code);
  for (const [how, x] of [[".oct", readOct(writeOct(m, DEFAULT_STYLE), true).mol], ["CDXML", fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol], ["CDX", readCdx(xmlToCdx(parseXml(toCdxml(m, DEFAULT_STYLE)))).mol]] as const) {
    strict(`round trip ${how}`, x);
    assert.equal(norm(cf(x, true).code), code, `the code after ${how}`);
  }
});

await kase("ST7", "S30 labels with raised and lowered runs (Fe with III raised, Fe2+ and SO4 2- typed raised, R with 1' raised, a label all raised or lowered): valid at TeX's level", () => {
  const cases: [string, Mol][] = [
    ["Fe with III raised", runs("FeIII", [{ text: "Fe" }, { text: "III", script: "super" }])],
    ["Mn with VII raised", runs("MnVII", [{ text: "Mn" }, { text: "VII", script: "super" }])],
    ["Fe with 2+ raised", runs("Fe2+", [{ text: "Fe" }, { text: "2+", script: "super" }])],
    ["SO4 with 2- raised", runs("SO42-", [{ text: "SO" }, { text: "4", script: "sub" }, { text: "2-", script: "super" }])],
    ["BF4 with 4- raised", runs("BF4-", [{ text: "BF" }, { text: "4-", script: "super" }])],
    ["R with 1' raised", runs("R1'", [{ text: "R" }, { text: "1'", script: "super" }])],
    ["PPh3 all raised (Text > Superscript on the label)", runs("PPh3", [{ text: "PPh3", script: "super" }])],
    ["CH2CO2Et all lowered", runs("CH2CO2Et", [{ text: "CH2CO2Et", script: "sub" }])],
    ["PC with •+ raised (a photocatalyst's radical cation)", runs("PC•+", [{ text: "PC" }, { text: "•+", script: "super" }])],
    ["coloured, bold, Fe with III raised", runs("FeIII", [{ text: "Fe", bold: true }, { text: "III", script: "super", colour: "#ff0000" }], { colour: "#0000ff" })],
  ];
  const bad: string[] = [];
  for (const [name, m] of cases) { try { strict(name, m); } catch (e) { bad.push(`${name}: ${cf(m, true).code} (${(e as Error).message.replace(/^.*\]: /, "")})`); } }
  // (The plan's own example, bold and italic CO2Me with 2 raised, is valid.)
  strict("CO2Me", runs("CO2Me", [{ text: "CO" }, { text: "2", script: "super" }, { text: "Me", italic: true, underline: true }], { bold: true, colour: "#00aa00" }));
  assert.equal(bad.length, 0, `${bad.length} of ${cases.length}: ${bad.join("; ")}`);
});

await kase("ST4", "S31 a dendrimer of rings three generations deep: nesting within rule 8, valid", () => {
  const dendrimer = chem.parseStructure("c1(-c2cc(-c3cc(-c4ccccc4)cc(-c4ccccc4)c3)cc(-c3cc(-c4ccccc4)cc(-c4ccccc4)c3)c2)cc(-c2cc(-c3cc(-c4ccccc4)cc(-c4ccccc4)c3)cc(-c3cc(-c4ccccc4)cc(-c4ccccc4)c3)c2)cc(-c2cc(-c3cc(-c4ccccc4)cc(-c4ccccc4)c3)cc(-c3cc(-c4ccccc4)cc(-c4ccccc4)c3)c2)c1");
  const d = strict("dendrimer", dendrimer);
  assert.ok(nesting(d.compact) <= Math.log2(dendrimer.atoms.length) + 8 + 1, `nesting ${nesting(d.compact)}`);
});

await kase("ST7", "X1 a label whose text ends in a superscript (NH₃⁺, Fe³⁺, typed or read from a file) that also has a charge: valid at TeX's level", () => {
  const base: Mol = { atoms: [A("C", 0, 0), A("C", 1, 0)], bonds: [B(0, 1)] };
  const bad: string[] = [];
  for (const t of ["NH₃⁺", "Fe³⁺", "SO₄²⁻", "R''", "C°"]) {
    const m = setLabel(base, 1, t), charged = { ...m, atoms: m.atoms.map((a, k) => (k === 1 ? { ...a, charge: 1 } : a)) };
    try { strict(`${t} with charge +1`, charged); } catch { bad.push(`${t} with charge +1: ${cf(charged, true).code}`); }
  }
  assert.equal(bad.length, 0, bad.join("; "));
});

await kase("ST7", "X2 a lowered run next to a lowered character (CH with 2 lowered then ₃; OsCl3 • H2O with '3 ' lowered, as in Sam's Rovis drawings): valid", () => {
  const bad: string[] = [];
  for (const [name, m] of [["CH 2 lowered then ₃", runs("CH2₃", [{ text: "CH" }, { text: "2", script: "sub" }, { text: "₃" }])], ["OsCl3 • H2O", runs("OsCl3 • H2O", [{ text: "OsCl" }, { text: "3 ", script: "sub" }, { text: "• H" }, { text: "2", script: "sub" }, { text: "O" }])]] as [string, Mol][]) {
    try { strict(name, m); } catch (e) { bad.push(`${name}: ${cf(m, true).code} (${(e as Error).message.replace(/^.*\]: /, "")})`); }
  }
  assert.equal(bad.length, 0, bad.join("; "));
});

await kase("ST14", "X5 two bonded atoms on one spot (a ChemDraw file): no bond of no length, as for two copies on one spot", async () => {
  const { fromCdxml } = await import("./cdxml.ts");
  const mol = fromCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><fragment id="2"><n id="3" p="10 10"/><n id="4" p="10 10"/><n id="6" p="24 10"/><b id="5" B="3" E="4"/><b id="7" B="4" E="6"/></fragment></page></CDXML>`).mol;
  const code = strict("bonded on one spot", mol).compact;
  for (const m of code.matchAll(/[-=~<>][:|]?\[:-?[\d.]+,([\d.]+)/g)) assert.ok(+m[1] > 0, `a bond of length ${m[1]} in ${code}`);
});

await kase("ST3", "X6 a chemist's messy page of 200 structures (and 1,000): valid, under 300 ms (1 s), every line within TeX's buffer", () => {
  const messy = grid(Array.from({ length: 200 }, (_, k) => LIBRARY[k % LIBRARY.length]), 20, 12, 10);
  strict("200 structures", messy);
  within(300, () => cf(messy), "200 structures", 3);
  const huge = grid(Array.from({ length: 1000 }, (_, k) => LIBRARY[k % LIBRARY.length]), 40, 12, 10);
  strict("1,000 structures", huge);
  within(1000, () => cf(huge), "1,000 structures", 3);
});

await kase("ST15", "X7 hostile drawing data (duplicate and self bonds, odd charges, counts, colours, bond types, 1,000 lone pairs, 10,000 lone atoms): no throw, valid", () => {
  const cases: [string, Mol][] = [
    ["duplicate bonds", { atoms: [A("C", 0, 0), A("C", 1, 0), A("C", 2, 0)], bonds: [B(0, 1), B(0, 1), B(1, 0, 2), B(1, 2)] }],
    ["a bond to itself", { atoms: [A("C", 0, 0), A("C", 1, 0)], bonds: [B(0, 1), B(1, 1)] }],
    ["charge 1e9", { atoms: [A("N", 0, 0, { charge: 1e9 })], bonds: [] }],
    ["charge 0.5 and NaN", { atoms: [A("N", 0, 0, { charge: 0.5 }), A("O", 3, 0, { charge: NaN })], bonds: [] }],
    ["isotope -5", { atoms: [A("C", 0, 0, { isotope: -5 })], bonds: [] }],
    ["a million implicit H, and -2", { atoms: [A("C", 0, 0, { implicitHCount: 1e6 }), A("N", 3, 0, { implicitHCount: -2 }), A("C", 4, 0)], bonds: [B(1, 2)] }],
    ["radical 7", { atoms: [A("C", 0, 0, { radical: 7 }), A("C", 1, 0)], bonds: [B(0, 1)] }],
    ["1,000 lone pairs", { atoms: [A("O", 0, 0, { pairs: 1000 }), A("C", 1, 0)], bonds: [B(0, 1)] }],
    ["NaN and Infinity mark angles", { atoms: [A("O", 0, 0, { pairs: 2, charge: -1, circled: true, angles: { pair0: NaN, charge: Infinity } }), A("C", 1, 0)], bonds: [B(0, 1)] }],
    ["colours that are not #rrggbb", { atoms: [A("N", 0, 0, { colour: "red" }), A("O", 2, 0, { colour: "#ff0000}\\input{x}" }), A("C", 1, 0)], bonds: [B(0, 2, 1, { colour: "#fff" }), B(1, 2, 1, { colour: "#ff0000,draw=none" })] }],
    ["bond types 99 and NaN, display \\input, stereo 4", { atoms: [A("C", 0, 0), A("C", 1, 0), A("C", 2, 0), A("C", 3, 0)], bonds: [B(0, 1, 99), B(1, 2, NaN, { display: "\\input" as Bond["display"] }), B(2, 3, 1, { stereo: 4 })] }],
    ["an element label that is code", { atoms: [A("\\input{x}", 0, 0), A("", 1, 0)], bonds: [B(0, 1)] }],
    ["align sideways", { atoms: [A("N", 0, 0, { align: "sideways" as Atom["align"] }), A("C", 1, 0)], bonds: [B(0, 1)] }],
    ["runs that do not join to the text", { atoms: [A("C", 0, 0), A("C", 1, 0, { text: "OMe", runs: [{ text: "XYZ", script: "super" }] })], bonds: [B(0, 1)] }],
    ["a centre on atoms that are not there", { atoms: [A("C", 0, 0, { centre: { atoms: [5, 6, 7] } }), A("Fe", 1, 0)], bonds: [B(0, 1)] }],
  ];
  for (const [name, m] of cases) strict(name, m);
  const lone: Mol = { atoms: Array.from({ length: 10000 }, (_, k) => A("C", k % 100, Math.floor(k / 100))), bonds: [] };
  texLint(cf(lone).code, "10,000 lone atoms");
  within(3000, () => cf(lone), "10,000 lone atoms", 1);
});

await kase("ST18", "X8 a ChemDraw user's habits: no default key for the command (ChemDraw has none)", () => {
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  assert.match(editor, /\["more_chemfig_copy", "Copy as LaTeX \(chemfig\)", <CodeBlock size=\{18\} \/>, \(\) => copyChemfig\(\)\],/, "no key in the More Formats line");
});

await kase("ST7", "X8 labels as ChemDraw users type them (OTBS, NHBoc, Ph3P, Fe(CO)4, ...), on either side: valid", () => {
  const base: Mol = { atoms: [A("C", 0, 0), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] };
  for (const t of ["OTBS", "NHBoc", "CO2tBu", "Ph3P", "Fe(CO)4", "[Cu]", "OTf", "NMe2", "SO2Ph", "CH2OH", "N3", "PPh3+", "OAc", "Bn", "Cbz", "HN", "NH", "TBSO", "Me3Si", "(CH2)3CO2Me", "OCH2O", "CO2-", "NO2", "C6H4", "CF3", "Br"]) {
    strict(`ChemDraw label ${t}`, setLabel(base, 1, t));
    strict(`ChemDraw label ${t} on the left`, setLabel({ ...base, atoms: [A("C", 0, 0), A("C", -1, 0), A("C", c30, s30)] }, 1, t));
  }
});

await kase("ST13", "X8 every chain double bond's second line on the page's side, for neighbours at every 30°", () => {
  // The second line of each chain double bond: drawn (the page's own polygons) and written (=^ left, =_ right, =
  // centred, going from the atom written first) on the same side, for a C=C with neighbours at every 30°.
  for (let a = 30; a < 360; a += 30) for (let b = 0; b < 360; b += 30) {
    if (b === 180) continue;
    const m: Mol = { atoms: [A("C", Math.cos(a * RAD), Math.sin(a * RAD)), A("C", 0, 0), A("C", 1, 0), A("C", 1 + Math.cos(b * RAD), Math.sin(b * RAD))], bonds: [B(0, 1), B(1, 2, 2), B(2, 3)] };
    if (Math.hypot(m.atoms[0].location[0] - m.atoms[3].location[0], m.atoms[0].location[1] - m.atoms[3].location[1]) < 0.5) continue;
    const d = render(m, S, ink), trace: number[] = [], code = chemfig(m, S, ink, { compact: true, trace }).code;
    const lines = d.polygons.filter((_, j) => d.owners?.[j] === 1).map((p) => p.reduce<P>((s2, q) => [s2[0] + q[0] / p.length / d.scale, s2[1] - q[1] / p.length / d.scale], [0, 0]));
    const off = lines.map((c) => c[1]), side = off.length === 2 && Math.min(...off.map(Math.abs)) < 0.05 ? Math.sign(off.reduce((x, y) => (Math.abs(x) > Math.abs(y) ? x : y))) : 0;
    const from1 = trace.indexOf(1) < trace.indexOf(2), want = (from1 ? side : -side) > 0 ? "=^" : (from1 ? side : -side) < 0 ? "=_" : "=";
    assert.equal((/=\^|=_|=/.exec(code) ?? [""])[0], want, `neighbours at ${a}° and ${b}°: ${code}`);
  }
});

await kase("ST20", "X11 Octet 1.1.2 and the new setting: 1.1.2's loader keeps keys it does not know, so Compact chemfig code survives a run of 1.1.2", () => {
  let old = "";
  try { old = execFileSync("git", ["show", "v1.1.2:src/settings.ts"], { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { console.log("chemfigcopy-stress: no v1.1.2 tag here; X11 skipped"); return; }
  assert.match(old, /\.\.\.DEFAULTS, \.\.\.saved,/);
  assert.match(old, /const text = JSON\.stringify\(s\);/);
  assert.match(readFileSync(new URL("settings.ts", import.meta.url), "utf8"), /chemfigCompact: saved\.chemfigCompact === true,/);
});

await kase("ST5", "X13 TeX's line buffer: a 60,000-character label in a ChemDraw file is cut to 40 characters, so no line passes 200,000 characters", async () => {
  const { fromCdxml } = await import("./cdxml.ts");
  const mol = fromCdxml(`<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><fragment id="2"><n id="3" p="0 0"><t><s font="3" size="10" face="96">${"~".repeat(60000)}</s></t></n><n id="4" p="14 0"/><b id="5" B="3" E="4"/></fragment></page></CDXML>`).mol;
  strict("60,000 tildes", mol);
});

// X14's drawing: six structures, a written label with lone pairs, a coloured radical cation. ChemDraw 22.2 opened its
// CDXML and saved it again (17 November 2026): the code was the same but for the angles of the lone pairs and the
// radical's dot, which ChemDraw placed itself (MeO's pairs at ±90° where Octet had ±74°); the page then draws them there.
const X14: Mol = { atoms: [], bonds: [] };
["CC(=O)Oc1ccccc1C(=O)O", "C[C@H](N)C(=O)O", "[NH3+]CC([O-])=O", "c1ccc2ccccc2c1", "C1CC1C#N", "O=C1CCCCC1"].forEach((smiles, k) => {
  const m = chem.parseStructure(smiles), base = X14.atoms.length;
  X14.atoms.push(...m.atoms.map((a) => ({ ...a, location: [a.location[0] + (k % 3) * 8, a.location[1] - Math.floor(k / 3) * 7, 0] as [number, number, number] })));
  X14.bonds.push(...m.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] })));
});
X14.atoms.push(A("O", 20, -14, { text: "OMe", pairs: 2 }), A("C", 21, -14), A("N", 24, -14, { colour: "#ff0000", charge: 1, radical: 1 }), A("C", 25, -14));
X14.bonds.push(B(X14.atoms.length - 4, X14.atoms.length - 3), B(X14.atoms.length - 2, X14.atoms.length - 1));
// CHEMFIG_X14_CDXML=<file> writes this drawing as CDXML, for ChemDraw 22.2 to open and save again.
if (process.env.CHEMFIG_X14_CDXML) { const { toCdxml } = await import("./cdxml.ts"), { DEFAULT_STYLE } = await import("./docstyle.ts"); writeFileSync(process.env.CHEMFIG_X14_CDXML, toCdxml(X14, DEFAULT_STYLE)); }
await kase("ST20", "X14 a drawing saved again by ChemDraw 22.2: the same code but the marks' angles, valid", async () => {
  const file = process.env.CHEMFIG_CHEMDRAW_FILE;
  if (!file) { console.log("chemfigcopy-stress: X14 needs CHEMFIG_CHEMDRAW_FILE (the drawing as ChemDraw 22.2 saved it); skipped"); return; }
  const { fromCdxml } = await import("./cdxml.ts");
  const back = fromCdxml(readFileSync(file, "utf8")).mol, norm = (c: string) => c.replace(/-?\d+(?=:\dpt)/g, "θ").replace(/(-?\d+\.\d+)/g, (x) => String(Math.round(+x)));
  strict("after ChemDraw", back);
  assert.equal(norm(cf(back, true).code), norm(cf(X14, true).code));
});

// ==== The MCP: Octet with no window, as an AI app calls it (S21, S22, S23, X10) ====
if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) console.log("chemfigcopy-stress: no OPSIN build; the MCP cases skipped");
else {
  const { load, drawing, session } = await import("../scripts/headless/host.ts"), { handle } = await import("./mcp.ts");
  await load();
  let d = drawing("paper", "Stress"), n = 0;
  const call = async (name: string, args: unknown, who = "one") => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Stress", who))).result;
  const text = (r: { content?: { text?: string }[]; structuredContent?: { text?: string } }) => r.structuredContent?.text ?? r.content?.[0]?.text ?? "";
  d.host.set({ ...grid(["CC(=O)Oc1ccccc1C(=O)O", "c1ccccc1"], 2, 10, 8), captions: [{ id: 900, text: "a note", x: 0, y: -8 }] } as Mol);
  const ids = ((await call("read", {})).structuredContent?.structures ?? []).map((s: { id: string }) => s.id);

  await kase("ST19", "S21 MCP read chemfig: compact true, false and left out; refusals for odd values; the 40 paclitaxels under 300 ms", async () => {
    const readable = text(await call("read", { format: "chemfig" })), one = text(await call("read", { format: "chemfig", compact: true }));
    assert.match(readable, /^\\chemfig\{\n\t/);
    assert.match(one, /^\\chemfig\{[^\n]*\}$/);
    assert.equal(text(await call("read", { format: "chemfig", compact: false })), readable);
    texLint(readable, "MCP readable");
    for (const bad of ["yes", 1, "true", {}, []]) assert.ok((await call("read", { format: "chemfig", compact: bad })).isError, `compact ${JSON.stringify(bad)} refused`);
    d.host.set(taxols);
    let best = Infinity;
    for (let k = 0; k < 3 && best >= 300; k++) { const t = performance.now(), code = text(await call("read", { format: "chemfig" })); best = Math.min(best, performance.now() - t); texLint(code, "MCP 40 paclitaxels"); }
    assert.ok(best < 300, `read of the 40 paclitaxels took ${best.toFixed(0)} ms at best of three`);
    d = drawing("paper", "Stress");
    d.host.set({ ...grid(["CC(=O)Oc1ccccc1C(=O)O", "c1ccccc1"], 2, 10, 8), captions: [{ id: 900, text: "a note", x: 0, y: -8 }] } as Mol);
  });

  await kase("ST19", "X10 an AI app's odd arguments: format in other cases and names, ids empty, unknown, too many, of text only: plain refusals or the code, never a throw", async () => {
    const all = ((await call("read", {})).structuredContent?.structures ?? []).map((s: { id: string }) => s.id);
    for (const format of ["CHEMFIG", "ChemFig", " chemfig"]) { const r = await call("read", { format }); assert.ok(r.isError || text(r).startsWith("\\chemfig{"), `format ${format}: ${text(r).slice(0, 80)}`); }
    for (const format of ["latex", "tex", "LaTeX"]) { const r = await call("read", { format }); assert.ok(r.isError && /chemfig/.test(text(r)), `format ${format}: the refusal names chemfig (${text(r).slice(0, 160)})`); }
    assert.match(text(await call("read", { format: "chemfig", ids: ["s999"] })), /There is nothing with the id s999/);
    assert.match(text(await call("read", { format: "chemfig", ids: ["t900"] })), /Octet cannot write these as CHEMFIG/);
    const empty = await call("read", { format: "chemfig", ids: [] });
    assert.ok(empty.isError || text(empty).startsWith("\\chemfig{"), `ids []: ${text(empty).slice(0, 80)}`);
    assert.ok((await call("read", { format: "chemfig", ids: Array.from({ length: 501 }, (_, k) => `s${k}`) })).isError, "501 ids refused");
    const twice = await call("read", { format: "chemfig", ids: [all[0], all[0]] });
    assert.equal(text(twice), text(await call("read", { format: "chemfig", ids: [all[0]] })), "an id given twice is read once");
    assert.ok(!(await call("read", { format: "smiles", compact: true })).isError, "compact on another format is ignored");
  });

  await kase("ST19", "S22 two AI sessions: a read gives the drawing as it is at that call; reads change nothing", async () => {
    const before = d.host.doc(), first = text(await call("read", { format: "chemfig" }, "one"));
    assert.equal(d.host.doc(), before, "a read leaves the drawing object as it was");
    const m = d.host.doc();
    d.host.set({ ...m, atoms: [...m.atoms, A("Br", 40, 0)] });
    const second = text(await call("read", { format: "chemfig" }, "two"));
    assert.notEqual(second, first);
    assert.match(second, /Br/);
  });

  await kase("ST1", "S23 a structure deleted after the AI app read its id: read chemfig of that id says so", async () => {
    const m = d.host.doc();
    d.host.set({ ...m, atoms: [], bonds: [] });
    assert.match(text(await call("read", { format: "chemfig", ids: [ids[0]] })), /There is nothing with the id|Octet cannot write/);
    assert.match(text(await call("read", { format: "chemfig" })), /Octet cannot write this drawing as CHEMFIG/);
  });

  await kase("ST7", "X9 MCP read of a label with III raised (as Text > Superscript leaves it): valid at TeX's level", async () => {
    d.host.set({ atoms: [A("C", 0, 0), A("C", 1, 0, { text: "FeIII", runs: [{ text: "Fe" }, { text: "III", script: "super" }] })], bonds: [B(0, 1)] });
    texLint(text(await call("read", { format: "chemfig" })), "MCP Fe with III raised");
  });
}

// ==== Issue 59 reopened (docs/plans/issue-59-59-1-1-3.md): PR 127's schemes, names, brackets, arrows, numbers and
// stereo labels, ST21 to ST30 ====
// A reaction row of n steps: ethane, then an arrow and a propane after it, each arrow with text above and a structure
// below; the scheme the Editor reads from it.
function steps(n: number) {
  const m: Mol = { atoms: [A("C", 0, 0), A("C", 1, 0)], bonds: [B(0, 1)], captions: [], arrows: [] };
  const row: Scheme["row"] = [{ atoms: [0, 1] }], above = new Map<number, ({ caption: number } | { atoms: number[] })[]>(), below = new Map<number, ({ caption: number } | { atoms: number[] })[]>();
  for (let k = 0; k < n; k++) {
    const x = 1.5 + k * 5, id = 1000 + k, at = m.atoms.length;
    m.arrows!.push({ id, kind: k % 2 ? "equilibrium" : "reaction", from: [x, 0], to: [x + 2, 0] });
    m.captions!.push({ id: 5000 + k, text: `step ${k + 1}`, x: x + 1, y: 0.5, on: { arrow: id, side: "above" } });
    m.atoms.push(A("C", x + 0.5, -1), A("O", x + 1.5, -1), A("C", x + 2.5, 0), A("C", x + 2.5 + c30, s30), A("C", x + 2.5 + 2 * c30, 0));
    m.bonds.push(B(at, at + 1), B(at + 2, at + 3), B(at + 3, at + 4));
    row.push({ arrow: id }, { atoms: [at + 2, at + 3, at + 4] });
    above.set(id, [{ caption: 5000 + k }]);
    below.set(id, [{ atoms: [at, at + 1] }]);
  }
  return { m, schemes: [{ row, above, below }] as Scheme[] };
}
await kase("ST21", "J20 a two-step scheme with text above and a structure below: \\schemestart, \\+, \\arrow with both labels, valid in both layouts, nothing named", () => {
  const { m, schemes } = steps(2), r = strict("two steps", m, { schemes });
  assert.match(r.compact, /^\\schemestart\\chemfig\{-\[:0\]\}\\arrow\{->\[\{step 1\}\]\[\{\\chemfig\{-\[:0,,,1\]OH\}\}\]\}\[0,1\.6\]\\chemfig\{-\[:30\]-\[:-30\]\}\\arrow\{<=>\[\{step 2\}\]\[\{\\chemfig\{-\[:0,,,1\]OH\}\}\]\}\[0,1\.6\]\\chemfig\{-\[:30\]-\[:-30\]\}\\schemestop$/);
  assert.equal(r.notice, "");
  assert.ok(r.code.startsWith("\\schemestart%\n\t\\chemfig{\n\t\t-[:0]\n\t}%\n\t\\arrow{") && r.code.endsWith("%\n\\schemestop"), "readable: a piece a line, each ended by %");
});
await kase("ST22", "J21 every straight arrow kind in a scheme; a downward arrow swaps its labels; the kinds chemfig lacks named", () => {
  const m: Mol = { atoms: [A("C", 0, 0), A("C", 1, 0), A("C", 4, 0), A("C", 5, 0)], bonds: [B(0, 1), B(2, 3)], captions: [{ id: 5, text: "a", x: 2.5, y: 0.5 }] };
  const one = (kind: string, from: P = [1.5, 0], to: P = [3.5, 0]) => strict(kind, { ...m, arrows: [{ id: 9, kind: kind as never, from, to }] }, { schemes: [{ row: [{ atoms: [0, 1] }, { arrow: 9 }, { atoms: [2, 3] }], above: new Map([[9, [{ caption: 5 }]]]), below: new Map() }] });
  const kinds: Record<string, string> = { reaction: "->", equilibrium: "<=>", resonance: "<->", nogo: "-/>", hash: "-/>", retro: "->", dipole: "->", block: "->" };
  for (const [k, type] of Object.entries(kinds)) assert.ok(one(k).compact.includes(`\\arrow{${type}[{a}]}`), k);
  assert.equal(one("dipole").notice, "The code shows dipole arrows as plain arrows.");
  assert.ok(one("reaction", [3.5, 0], [1.5, 0]).compact.includes("\\arrow{->[{a}]}[180,1.6]"), "leftward: above stays first (TikZ keeps the label upright, above the arrow)");
  assert.ok(one("reaction", [2.5, 1], [2.5, -1]).compact.includes("\\arrow{->[][{a}]}[-90,1.6]"), "downward: above goes second (chemfig's first label is on the page's right)");
  assert.ok(one("reaction", [2.5, -1], [2.5, 1]).compact.includes("\\arrow{->[{a}]}[90,1.6]"), "upward: above stays first");
});
await kase("ST23", "J22 hostile text in names and conditions (%, #, $, \\input, braces, control characters, 中): escaped or left out and named; valid at TeX's level", () => {
  const evil = "50% #1 $x$ \\input{/etc/passwd} } { ^_~ &\u0007中\nline two";
  const m: Mol = { atoms: [A("C", 0, 0), A("C", 1, 0), A("C", 4, 0), A("C", 5, 0)], bonds: [B(0, 1), B(2, 3)], arrows: [{ id: 9, kind: "reaction", from: [1.5, 0], to: [3.5, 0] }],
    captions: [{ id: 5, text: evil, x: 2.5, y: 0.5, on: { arrow: 9, side: "above" } }, { id: 6, text: evil, x: 0.5, y: -1, under: [0, 1] }] };
  const r = strict("hostile names", m, { schemes: [{ row: [{ atoms: [0, 1] }, { arrow: 9 }, { atoms: [2, 3] }], above: new Map([[9, [{ caption: 5 }]]]), below: new Map() }] });
  assert.ok(!/\\input/.test(r.compact) && !/(^|[^\\])[#%&]/.test(r.compact.replace(/%$/gm, "")), r.compact);
  assert.match(r.compact, /\\shortstack\{/);
  assert.match(r.compact, /\\chemname\*\{\\chemfig\{-\[:0\]\}\}\{50\\% \\#1 \\\$x\\\$ \\textbackslash\{\}input\\\{\/etc\/passwd\\\} \\\} \\\{ \\textasciicircum\{\}\\_\\textasciitilde\{\} \\&\\\\line two\}/);
  assert.equal(r.notice, "The code does not have the character 中.");
});
await kase("ST24", "J23 curved arrows, fishhooks, double-headed arcs and lines with \\chemmove; nodes named once each, in the \\chemfig; two runs asked for", () => {
  const m: Mol = { atoms: [A("O", 0, 0, { charge: -1, pairs: 3 }), A("C", 1, 0), A("O", 2, 0.5)], bonds: [B(0, 1), B(1, 2, 2)],
    arrows: [{ id: 5, kind: "curved", from: [0.2, 0.3], to: [0.7, 0.3], bend: 0.3 }, { id: 6, kind: "fishhook", from: [1, 0.5], to: [2, 1], bend: -0.2 }, { id: 7, kind: "double", from: [0, 1], to: [1, 1], bend: 0.5, style: "bold" },
      { id: 8, kind: "line", from: [0, -1], to: [2, -1], style: "wavy" }, { id: 9, kind: "arc", from: [0, -2], to: [2, -2], bend: 0.1 }, { id: 10, kind: "reaction", from: [3, 0], to: [5, 0], head: "hollow" }] };
  const r = strict("arrows", m);
  assert.deepEqual(r.code.split("\n").filter((l) => l.startsWith("%")), [WAVY_ARROW_NOTE, TWICE_NOTE]);
  const nodes = [...r.compact.matchAll(/@\{(\w+)\}/g)].map((x) => x[1]);
  assert.equal(new Set(nodes).size, nodes.length, "each node once");
  for (const used of r.compact.matchAll(/\((oct\w+)\)/g)) assert.ok(nodes.includes(used[1]), `${used[1]} is placed`);
  assert.match(r.compact, /\\draw\[\{CF\}-\{CF\},line width=0\.8pt\]/);
  assert.match(r.compact, /\\draw\[-\{CF\[open\]\}\]/);
  assert.equal(r.notice, "");
  for (const k of ["orbital", "cut", "curve", "retro", "block"]) assert.match(strict(k, { ...m, arrows: [{ id: 1, kind: k as never, from: [0, 1], to: [2, 1] }] }).notice, /arrows/, k);
  // Two drawings in one document: their nodes differ.
  const other = strict("arrows moved", { ...m, atoms: m.atoms.map((a) => ({ ...a, location: [a.location[0] + 10, a.location[1], 0] as [number, number, number] })) });
  assert.notEqual(/@\{(oct\w{4})/.exec(r.compact)![1], /@\{(oct\w{4})/.exec(other.compact)![1]);
});
await kase("ST25", "J24 brackets: both sides, one side, turned, n, a count, a mark and repeat tags, round two structures; round nothing named", () => {
  const two: Mol = { atoms: [A("C", 0, 0), A("C", 1, 0), A("C", 0, -2), A("C", 1, -2)], bonds: [B(0, 1), B(2, 3)] };
  const shapes = [{ id: 40, kind: "brackets", from: [-0.3, -0.5], to: [1.3, 0.5], polymer: { usage: "sru", pattern: "hh", flip: "flip" }, mark: "+" }, { id: 41, kind: "parens", from: [-0.3, -2.5], to: [1.3, -1.5], side: "right", angle: 15, polymer: { usage: "mult", label: "3" } },
    { id: 42, kind: "braces", from: [-0.5, -3], to: [1.5, 1] }, { id: 43, kind: "brackets", from: [9, 9], to: [10, 10] }];
  const r = strict("brackets", { ...two, shapes } as Mol);
  assert.equal((r.compact.match(/\\polymerdelim\[/g) ?? []).length, 3);
  assert.match(r.compact, /indice=\{n\}\]/);
  assert.match(r.compact, /\{\\scriptstyle \+\\mbox\{ \}hh\\mbox\{ \}flip\}/);
  assert.match(r.compact, /delimiters=\{\.\)\},height=1\.5em,depth=1\.5em,indice=\{3\},h align=false,rotate=15\]/);
  assert.match(r.compact, /delimiters=\{\\\{\\\}\},height=6em,depth=6em,indice=\{\}\]/);
  assert.equal(r.notice, "The code does not have the brackets.");
});
await kase("ST26", "J25 names: a name and a number under one structure, two named structures, a salt with one name, a name over a structure in a scheme", () => {
  const m: Mol = { atoms: [A("C", 0, 0), A("C", 1, 0), A("Na", 3, 0, { charge: 1 }), A("Cl", 4, 0, { charge: -1 }), A("C", 7, 0), A("C", 8, 0)], bonds: [B(0, 1), B(4, 5)],
    captions: [{ id: 1, text: "ethane", x: 0.5, y: -1, under: [0, 1] }, { id: 2, text: "1", bold: true, x: 0.5, y: -1.5, under: [0, 1] }, { id: 3, text: "salt", x: 3.5, y: -1, under: [2, 3] }] };
  const r = strict("names", m);
  assert.equal(r.compact, "\\chemname*{\\chemfig{-[:0]}}{ethane\\\\\\textbf{1}}\\qquad\\chemname*{\\chemfig{Na^{+}(-[:0,1,,,draw=none]Cl^{-})}}{salt}\\qquad\\chemfig{-[:0]}");
  assert.equal(r.notice, "");
  const s = strict("named in a scheme", { ...m, arrows: [{ id: 9, kind: "reaction", from: [1.5, 0], to: [2.5, 0] }] }, { schemes: [{ row: [{ atoms: [0, 1] }, { arrow: 9 }, { atoms: [2, 3] }], above: new Map(), below: new Map() }] });
  assert.match(s.compact, /^\\schemestart\\chemname\*\{\\chemfig\{-\[:0\]\}\}\{ethane\\\\\\textbf\{1\}\}\\arrow\{->\}\[0\]\\chemname\*\{\\chemfig\{Na\^\{\+\}\(-\[:0,1,,,draw=none\]Cl\^\{-\}\)\}\}\{salt\}\\schemestop\\par\\chemfig\{-\[:0\]\}$/);
});
await kase("ST27", "J26 atom numbers in the gaps the page uses, on a chain and a ring; map numbers where the page draws them, on a label and a skeletal carbon", () => {
  const ring = { atoms: hex.map((a, k) => ({ ...a, number: String(k + 1) })), bonds: kekule };
  const r = strict("numbered ring", ring);
  const angles = [...r.compact.matchAll(/\\charge\{(-?\d+):9pt\[anchor=180\+\\chargeangle\]=\$\\scriptstyle (\d)\$\}/g)].map((x) => [+x[2], +x[1]]);
  assert.equal(angles.length, 6);
  for (const [k, t] of angles) { const want = 30 + 60 * (k - 1); assert.ok(Math.abs(((t - want + 540) % 360) - 180) <= 1, `number ${k} at ${t}°, out of the ring at ${want}°`); }
  const maps = strict("map numbers", { atoms: [A("C", 0, 0, { map: 1 }), A("N", c30, s30, { map: 2 }), A("C", 2 * c30, 0, { map: 3 })], bonds: [B(0, 1), B(1, 2)] });
  const d = render({ atoms: [A("C", 0, 0, { map: 1 }), A("N", c30, s30, { map: 2 }), A("C", 2 * c30, 0, { map: 3 })], bonds: [B(0, 1), B(1, 2)] }, S, ink);
  assert.equal(d.maps.length, 3);
  for (const x of d.maps) assert.match(maps.compact, new RegExp(`\\$\\\\scriptstyle ${x.text}\\$`));
  assert.equal(maps.notice, "");
});
await kase("ST28", "J27 R/S with and without parentheses, E/Z on a chain and on a ring's exocyclic double bond, coloured; none without Show Stereochemistry; named when not given", () => {
  const m: Mol = { atoms: [...hex.map((a) => ({ ...a, cip: true as const })), A("C", 2, 0, { cip: true }), A("C", 2 + c30, s30, { cip: true })], bonds: [...hex.map((_, k) => B(k, (k + 1) % 6)), B(0, 6, 2), B(6, 7)] };
  const labels = { atoms: ["R", undefined, "s", undefined, undefined, undefined, undefined, undefined], bonds: [...hex.map(() => undefined), "Z", undefined] };
  const r = strict("stereo", m, { stereo: { ...labels, parens: true } });
  assert.match(r.compact, /\$\\scriptstyle \(\\mathit\{R\}\)\$/);
  assert.match(r.compact, /\$\\scriptstyle \(\\mathit\{s\}\)\$/);
  assert.match(r.compact, /draw=none\]\{\\scriptstyle \(\\mathit\{Z\}\)\}/);
  assert.equal(r.notice, "");
  assert.match(strict("stereo bare", m, { stereo: labels }).compact, /\$\\scriptstyle \\mathit\{R\}\$/);
  assert.doesNotMatch(strict("stereo off", { ...m, atoms: m.atoms.map(({ cip: _, ...a }) => a) }, { stereo: labels }).compact, /mathit/);
  assert.equal(strict("stereo not given", m).notice, "The code does not have the stereo labels.");
  // A label out of the reader's alphabet is cut to its letters.
  assert.match(strict("stereo hostile", m, { stereo: { atoms: ["R}\\input{x", ...labels.atoms.slice(1)], bonds: labels.bonds } }).compact, /\\mathit\{Rinputx\}/);
});
await kase("ST29", "J28 time: a 100-step scheme and 300 named salts within budget; nesting one deep", () => {
  const { m, schemes } = steps(100);
  const ms = within(300, () => chemfig(m, S, ink, { schemes }), "100-step scheme");
  console.log(`chemfigcopy-stress: a 100-step scheme in ${ms.toFixed(0)} ms`);
  const r = strict("100 steps", m, { schemes });
  assert.equal((r.compact.match(/\\arrow\{/g) ?? []).length, 100);
  const salts: Mol = { atoms: Array.from({ length: 600 }, (_, k) => A(k % 2 ? "Cl" : "Na", (k % 40) * 1.5, -Math.floor(k / 40) * 2, { charge: k % 2 ? -1 : 1 })), bonds: [],
    captions: Array.from({ length: 300 }, (_, k) => ({ id: k + 1, text: `${k + 1}`, x: 0, y: 0, under: [2 * k, 2 * k + 1] })) };
  const t = within(300, () => chemfig(salts, S, ink), "300 named salts");
  console.log(`chemfigcopy-stress: 300 named salts in ${t.toFixed(0)} ms`);
  const s = strict("300 named salts", salts);
  assert.equal((s.compact.match(/\\chemname\*/g) ?? []).length, 300);
  for (const b of s.compact.split("\\qquad")) assert.ok(nesting(b) <= 1, "one deep");
});
await kase("ST30", "J29 everything at once in two schemes, with a bracket, a curved arrow, names, numbers and stereo labels: valid in both layouts; the same bytes twice", () => {
  const { m, schemes } = steps(3);
  const all: Mol = { ...m, atoms: m.atoms.map((a, k) => (k < 2 ? { ...a, number: String(k + 1), cip: true } : a)), shapes: [{ id: 40, kind: "brackets", from: [-0.3, -0.5], to: [1.3, 0.5], polymer: { usage: "sru" } }],
    arrows: [...m.arrows!, { id: 50, kind: "curved", from: [0, 0.3], to: [1, 0.3], bend: 0.3 }], captions: [...m.captions!, { id: 60, text: "1", x: 0.5, y: -1, under: [0, 1] }] };
  const opts = { schemes: [...schemes, { row: [{ atoms: [all.atoms.length - 3] }], above: new Map(), below: new Map() }], stereo: { atoms: ["R"], bonds: [] } };
  const a = strict("everything", all, opts), b = strict("everything", all, opts);
  assert.equal(a.code, b.code);
  assert.equal(a.notice, "");
});

// The page script (the body of an async function webkit.swift runs in the dev server's page): windows of the app in
// iframes, each with its clipboard writes caught (execCommand("copy") fires the copy event the app answers, as a click
// would; the Clipboard API is caught), driven by keys, the command palette, the Actions panel and the right-click menu.
const UI_LIB = String.raw`const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (find, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { let v; try { v = find(); } catch { v = null; } if (v) return v; await wait(100); } return null; };
const log = [];
const results = [];
const rec = (label, ok, note = "") => { const k = label.indexOf(" "); results.push({ id: label.slice(0, k), what: label.slice(k + 1), ok: !!ok, ...(ok ? {} : { why: String(note).slice(0, 500) }) }); };
const same = {};
const KEY = "octet.settings";
const setSettings = (more) => { let s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {} s = { ...s, ...more }; localStorage.setItem(KEY, JSON.stringify(s)); return s; };
// A window of the app: an iframe of the dev server, with its clipboard writes caught.
async function openWindow(name) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;left:0;top:0;width:1400px;height:880px;border:0;";
  f.name = name;
  document.body.appendChild(f);
  const loaded = new Promise((r) => f.addEventListener("load", r, { once: true }));
  f.src = "/";
  await loaded;
  const w = f.contentWindow, d = f.contentDocument;
  w.__clip = []; w.__errors = [];
  w.addEventListener("error", (e) => w.__errors.push("uncaught: " + e.message));
  const err = w.console.error; w.console.error = (...a) => { w.__errors.push(a.map(String).join(" ").slice(0, 300)); err.apply(w.console, a); };
  // The browser's copy: execCommand("copy") fires the copy event the page answers, as a click would.
  w.document.execCommand = (cmd) => {
    if (cmd !== "copy") return false;
    const dt = new w.DataTransfer();
    const e = new w.ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true });
    w.dispatchEvent(e);
    const text = dt.getData("text/plain");
    if (text) w.__clip.push(text);
    return e.defaultPrevented;
  };
  try { Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t) => { w.__clip.push(t); }, readText: async () => w.__clip[w.__clip.length - 1] ?? "" }, configurable: true }); } catch (e) { log.push("clipboard stub: " + e.message); }
  await until(() => d.querySelector(".home, .editor"), 30000);
  await wait(800);
  [...d.querySelectorAll("button")].find((b) => b.textContent.trim() === "Skip")?.click();
  await wait(500);
  d.querySelector(".home-tile.new")?.click();
  await until(() => d.querySelector(".editor svg"), 15000);
  await wait(800);
  [...d.querySelectorAll(".coach button")].find((b) => /skip/i.test(b.textContent))?.click();
  await wait(300);
  return { f, w, d };
}
const key = (W, init) => { const e = new W.w.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }); (W.d.activeElement ?? W.d.body).dispatchEvent(e); };
const paste = async (W, text) => { const dt = new W.w.DataTransfer(); dt.setData("text/plain", text); W.w.dispatchEvent(new W.w.ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); await wait(1500); };
const notice = (W) => W.d.querySelector(".notice:not(.leaving) .notice-text")?.textContent ?? "";
// The command palette (⌘⇧A in a browser): type and Return.
async function palette(W, text, pick = text) {
  key(W, { key: "A", code: "KeyA", metaKey: true, shiftKey: true });
  const input = await until(() => W.d.querySelector(".command-palette input"), 3000);
  if (!input) return "no palette";
  const set = Object.getOwnPropertyDescriptor(W.w.HTMLInputElement.prototype, "value").set;
  set.call(input, text); input.dispatchEvent(new W.w.Event("input", { bubbles: true }));
  await wait(700);
  const names = [...W.d.querySelectorAll(".command-palette .command .command-name")].map((n) => n.textContent);
  const k = names.indexOf(pick);
  if (k < 0) { input.dispatchEvent(new W.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); await wait(300); return { found: false, names }; }
  W.d.querySelectorAll(".command-palette .command")[k].click();
  await wait(600);
  return { found: true, names };
}
const lastClip = (W) => W.w.__clip[W.w.__clip.length - 1];
`;
// The WebKit checks (U1 to U16, each under its ST case), as a user does them; then X12's drawings coded in the page.
const UI_CASES = String.raw`{
setSettings({ moreFormats: true, chemfigCompact: false, tutorialDone: true });
const A = await openWindow("A");
// U1: an empty drawing.
{
  A.w.__clip.length = 0;
  const p = await palette(A, "Copy as LaTeX", "Copy as LaTeX (chemfig)");
  await wait(300);
  rec("ST1 U1 (S1) empty drawing: Copy as LaTeX (chemfig) says there is no structure, clipboard untouched", p.found && notice(A) === "There is no structure to copy." && A.w.__clip.length === 0, JSON.stringify({ found: p.found, notice: notice(A), clip: A.w.__clip }));
}
// A structure.
await paste(A, "CC(=O)Oc1ccccc1C(=O)O");
// U2: keyboard only: the palette.
A.w.__clip.length = 0;
await palette(A, "Copy as LaTeX", "Copy as LaTeX (chemfig)");
await wait(300);
const first = lastClip(A);
rec("ST18 U2 keyboard only: palette copies readable code", first && first.startsWith("\\chemfig{\n\t") && notice(A) === "Copied.", JSON.stringify({ first: first?.slice(0, 80), notice: notice(A) }));
// U3: the Actions panel's button (More formats on) and Copy as SLN beside it.
{
  const b = A.d.querySelector('.tray-button[data-command="more_chemfig_copy"]'), sln = A.d.querySelector('.tray-button[data-command="more_sln"]');
  const ordered = [...A.d.querySelectorAll(".tray-button")].map((x) => x.dataset.command);
  A.w.__clip.length = 0;
  b?.click(); await wait(400);
  rec("ST18 U3 Actions panel: Copy as LaTeX (chemfig) and Copy as SLN beside Copy as InChIKey", !!b && !!sln && lastClip(A) === first && ordered.indexOf("more_chemfig_copy") === ordered.indexOf("copy_inchikey") + 1, JSON.stringify({ button: !!b, sln: !!sln, same: lastClip(A) === first, ordered }));
}
// U4: right-click on empty canvas: the drawing's menu has it; choosing it copies.
{
  const svg = A.d.querySelector(".editor svg"), r = svg.getBoundingClientRect();
  svg.dispatchEvent(new A.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 30, clientY: r.bottom - 30, button: 2 }));
  await wait(700);
  const items = [...A.d.querySelectorAll('[role="menu"] button, .menu button')].map((b) => b.textContent.trim()).filter(Boolean);
  const sub = [...A.d.querySelectorAll(".context-menu button")].find((b) => b.textContent.trim() === "Molecule and copy");
  sub?.click();
  await wait(700);
  items.push("|", ...[...A.d.querySelectorAll('[role="menu"] button, .menu button')].map((b) => b.textContent.trim()).filter(Boolean));
  const item = [...A.d.querySelectorAll(".context-menu button")].find((b) => b.textContent.trim() === "Copy as LaTeX (chemfig)");
  A.w.__clip.length = 0;
  item?.click(); await wait(500);
  rec("ST18 U4 right-click menu: Copy as LaTeX (chemfig) copies the drawing", !!item && lastClip(A) === first, JSON.stringify({ item: !!item, items: items.slice(0, 40), clip: lastClip(A)?.slice(0, 40) }));
  key(A, { key: "Escape", code: "Escape" }); await wait(300);
}
// U5: undo and redo: copy, edit, copy, undo, copy (= the first), redo, copy (= the second). No undo step from a copy.
{
  await paste(A, "c1ccccc1");
  key(A, { key: "Escape", code: "Escape" }); await wait(400);
  await palette(A, "Copy as LaTeX", "Copy as LaTeX (chemfig)"); await wait(300);
  const second = lastClip(A);
  key(A, { key: "z", code: "KeyZ", metaKey: true }); await wait(600);
  await palette(A, "Copy as LaTeX", "Copy as LaTeX (chemfig)"); await wait(300);
  const third = lastClip(A);
  key(A, { key: "z", code: "KeyZ", metaKey: true, shiftKey: true }); await wait(600);
  await palette(A, "Copy as LaTeX", "Copy as LaTeX (chemfig)"); await wait(300);
  const fourth = lastClip(A);
  rec("ST16 U5 (S17) undo after copy undoes the edit, not the copy; redo still works", second !== first && third === first && fourth === second, JSON.stringify({ secondDiffers: second !== first, thirdIsFirst: third === first, fourthIsSecond: fourth === second, third: third?.slice(0, 60) }));
}
const two = lastClip(A);
// U6: zoom: in 15 times (about 2,800%) and out 30 times: the same code.
{
  for (let k = 0; k < 15; k++) { key(A, { key: "+", code: "Equal", metaKey: true, shiftKey: true }); await wait(40); }
  await wait(400);
  await palette(A, "Copy as LaTeX", "Copy as LaTeX (chemfig)"); await wait(300);
  const big = lastClip(A);
  for (let k = 0; k < 30; k++) { key(A, { key: "_", code: "Minus", metaKey: true, shiftKey: true }); await wait(40); }
  await wait(400);
  await palette(A, "Copy as LaTeX", "Copy as LaTeX (chemfig)"); await wait(300);
  const small = lastClip(A);
  rec("ST10 U6 (S11) zoomed in and out: the same code", big === two && small === two, JSON.stringify({ big: big === two, small: small === two }));
}
// U7: 50 copies as fast as a held key: no error, one notice, every copy the same.
{
  const b = A.d.querySelector('.tray-button[data-command="more_chemfig_copy"]');
  A.w.__clip.length = 0;
  const heap0 = performance.memory?.usedJSHeapSize;
  const t = performance.now();
  for (let k = 0; k < 50; k++) { b.click(); await wait(20); }
  const ms = performance.now() - t;
  await wait(500);
  const notices = A.d.querySelectorAll(".notice:not(.leaving)").length;
  rec("ST16 U7 (S18) 50 copies in about a second: all the same, one notice, no error", A.w.__clip.length === 50 && A.w.__clip.every((c) => c === two) && notices <= 1 && A.w.__errors.length === 0, JSON.stringify({ n: A.w.__clip.length, same: A.w.__clip.every((c) => c === two), ms: Math.round(ms), notices, errors: A.w.__errors.slice(0, 3) }));
}
// U8: a reaction with an arrow and text: the notice names what the code leaves out.
{
  await paste(A, "CCO>>CC=O");
  await wait(800);
  await palette(A, "Copy as LaTeX", "Copy as LaTeX (chemfig)"); await wait(300);
  rec("ST1 U8 the notice names the arrows", /^Copied\. The code does not have the arrows/.test(notice(A)), notice(A));
}
// U9: a second window; Compact set in Settings in window A; window B copies compact code.
const Bw = await openWindow("B");
{
  await paste(Bw, "CC(=O)Oc1ccccc1C(=O)O");
  // Settings in window A: the Pro page's Compact chemfig code switch.
  await palette(A, "Settings", (await (async () => { key(A, { key: "A", code: "KeyA", metaKey: true, shiftKey: true }); await wait(400); const i = A.d.querySelector(".command-palette input"); Object.getOwnPropertyDescriptor(A.w.HTMLInputElement.prototype, "value").set.call(i, "Settings"); i.dispatchEvent(new A.w.Event("input", { bubbles: true })); await wait(600); const names = [...A.d.querySelectorAll(".command-palette .command .command-name")].map((n) => n.textContent); i.dispatchEvent(new A.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); await wait(300); return names.find((n) => /^Settings/.test(n)) ?? "Settings…"; })()));
  await wait(800);
  const search = await until(() => A.d.querySelector('.settings input[type="search"], .settings-search input, input[aria-label*="Search settings"], input[placeholder*="Search"]'), 3000);
  if (search) { Object.getOwnPropertyDescriptor(A.w.HTMLInputElement.prototype, "value").set.call(search, "compact chemfig"); search.dispatchEvent(new A.w.Event("input", { bubbles: true })); await wait(600); }
  const sw = [...A.d.querySelectorAll('[role="switch"], button[aria-label="Compact chemfig code"], input[aria-label="Compact chemfig code"]')].find((x) => (x.getAttribute("aria-label") ?? "") === "Compact chemfig code");
  sw?.click(); await wait(800);
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY)); } catch {}
  Bw.w.__clip.length = 0;
  await palette(Bw, "Copy as LaTeX", "Copy as LaTeX (chemfig)"); await wait(400);
  const b = lastClip(Bw);
  rec("ST17 U9 (S20) Compact chemfig code set in window A: window B copies one line", !!sw && saved.chemfigCompact === true && b && !b.includes("\n") && b.startsWith("\\chemfig{"), JSON.stringify({ search: !!search, switch: !!sw, saved: saved.chemfigCompact, b: b?.slice(0, 80) }));
  key(A, { key: "Escape", code: "Escape" }); await wait(400); key(A, { key: "Escape", code: "Escape" }); await wait(800);
  log.push("settings still open after two Escapes: " + !!A.d.querySelector(".settings-sidebar"));
}
// U10: paste the copied code onto a page and into nothing: what pasting text that is not a structure does, quickly.
{
  const before = Bw.d.querySelectorAll(".editor svg text").length;
  const t = performance.now();
  await paste(Bw, first);
  const ms = performance.now() - t;
  await wait(1500);
  const after = Bw.d.querySelectorAll(".editor svg text").length;
  rec("ST17 U10 (S19) chemfig code copied in one window and pasted on a page: nothing drawn, a plain notice, no error", after === before && Bw.w.__errors.length === 0, JSON.stringify({ before, after, ms: Math.round(ms), notice: notice(Bw), errors: Bw.w.__errors.slice(0, 3) }));
}
// U11: More formats off (Settings in another window): the command is in no menu, panel or palette, and a copy keeps nothing new.
{
  setSettings({ moreFormats: false });
  await wait(1200);
  const p = await palette(A, "Copy as LaTeX", "Copy as LaTeX (chemfig)");
  const button = A.d.querySelector('.tray-button[data-command="more_chemfig_copy"]');
  const svg = A.d.querySelector(".editor svg"), r = svg.getBoundingClientRect();
  svg.dispatchEvent(new A.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 30, clientY: r.bottom - 30, button: 2 }));
  await wait(600);
  [...A.d.querySelectorAll(".context-menu button")].find((b) => b.textContent.trim() === "Molecule and copy")?.click();
  await wait(700);
  const item = [...A.d.querySelectorAll(".context-menu button")].find((b) => b.textContent.trim() === "Copy as LaTeX (chemfig)");
  const sln = [...A.d.querySelectorAll(".context-menu button")].find((b) => b.textContent.trim() === "Copy as SLN");
  key(A, { key: "Escape", code: "Escape" }); await wait(300); key(A, { key: "Escape", code: "Escape" }); await wait(300);
  rec("ST18 U11 (S27) More formats off: not in the palette, the panel or the right-click menu", typeof p === "object" && !p.found && !button && !item && !sln, JSON.stringify({ palette: p, button: !!button, menu: !!item, sln: !!sln }));
  setSettings({ moreFormats: true, chemfigCompact: false });
  await wait(800);
}
// U12: everything deleted, then Copy: there is no structure to copy.
{
  key(A, { key: "a", code: "KeyA", metaKey: true }); await wait(300);
  key(A, { key: "Backspace", code: "Backspace" }); await wait(800);
  A.w.__clip.length = 0;
  const p12 = await palette(A, "Copy as LaTeX", "Copy as LaTeX (chemfig)"); await wait(500);
  rec("ST1 U12 (S23) everything deleted: There is no structure to copy.", notice(A) === "There is no structure to copy." && A.w.__clip.length === 0, JSON.stringify({ found: p12.found, names: p12.names, notice: notice(A), clip: A.w.__clip.length, active: A.d.activeElement?.className }));
}
rec("ST16 U13 no page errors in either window", A.w.__errors.length === 0 && Bw.w.__errors.length === 0, JSON.stringify([...A.w.__errors, ...Bw.w.__errors].slice(0, 5)));


}
{
setSettings({ moreFormats: true, chemfigCompact: false, tutorialDone: true });
for (const f of document.querySelectorAll("iframe")) f.remove();
const A = await openWindow("A");
const taxol = "CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C";
// U14: 15 paclitaxels (about 1,000 atoms): the time from the command to the notice, five times.
{
  await paste(A, Array(15).fill(taxol).join("."));
  await wait(1500);
  key(A, { key: "Escape", code: "Escape" }); await wait(300);
  const b = A.d.querySelector('.tray-button[data-command="more_chemfig_copy"]');
  const ts = [];
  for (let k = 0; k < 5; k++) { A.w.__clip.length = 0; const t = performance.now(); b.click(); ts.push(performance.now() - t); await wait(300); }
  ts.sort((x, y) => x - y);
  const code = lastClip(A);
  rec("ST3 U14 (S3) 15 paclitaxels: Copy as LaTeX (chemfig) in WebKit, median of 5 under 300 ms", ts[2] < 300 && code && code.length > 1000, JSON.stringify({ ms: ts.map((x) => Math.round(x)), chars: code?.length, atoms: (code?.match(/\n/g) ?? []).length }));
  // U15: that code pasted on the page: how long until the notice, and nothing drawn.
  const before = A.d.querySelectorAll(".editor svg text").length;
  const was = notice(A);
  const t = performance.now();
  const dt = new A.w.DataTransfer(); dt.setData("text/plain", code);
  A.w.dispatchEvent(new A.w.ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  const sync = performance.now() - t;
  await until(() => notice(A) && notice(A) !== was ? true : null, 20000);
  const ms = performance.now() - t;
  const after = A.d.querySelectorAll(".editor svg text").length;
  rec("ST17 U15 (S19) a large chemfig code pasted on the page: answered within 2 s, nothing drawn", ms < 2000 && after === before, JSON.stringify({ ms: Math.round(ms), sync: Math.round(sync), notice: notice(A), before, after }));
}
rec("ST3 U16 no page errors", A.w.__errors.length === 0, JSON.stringify(A.w.__errors.slice(0, 5)));


}
// X12: the same drawings coded in the page, with WebKit's measuring, and where the page draws each mark.
{
  const { chemfig } = await import("/src/chemfig.ts");
  const { render } = await import("/src/render.ts");
  const { measurer, STYLE } = await import("/src/chem.ts");
  const { DEFAULT_STYLE, fontStack, frameStyle, readStyle } = await import("/src/docstyle.ts");
  await document.fonts.ready;
  const style = readStyle(DEFAULT_STYLE), frame = frameStyle(style, STYLE.bond), measure = measurer(fontStack(style.labelFont), frame.size);
  for (const [k, m] of Object.entries(SAME)) same[k] = { code: chemfig(m, frame, measure, { compact: true }).code, marks: MARKS(render(m, frame, measure), m) };
}
return JSON.stringify({ results, same, log });
`;

// ==== The app in WebKit (--ui <dev server>): two windows of the dev server, driven as a user drives them ====
if (!UI) console.log("chemfigcopy-stress: the WebKit checks (U1 to U16, X12) need --ui http://localhost:1462/ and the dev server; skipped");
else if (process.platform !== "darwin" || spawnSync("which", ["swift"]).status !== 0) console.log("chemfigcopy-stress: WebKit needs a Mac with swift; skipped");
else {
  const dir = mkdtempSync(join(tmpdir(), "chemfig-stress-")), page = join(dir, "page.js");
  // X12's drawings, coded here with Octet's no-window measuring (the MCP's), and in the page with WebKit's.
  const SAME: Record<string, Mol> = {
    "NH3+ on a chain": { atoms: [A("C", 0, 0), A("C", c30, s30), A("N", 2 * c30, 0, { charge: 1 })], bonds: [B(0, 1), B(1, 2)] },
    "radical cation N": { atoms: [A("N", 0, 0, { charge: 1, radical: 1 }), A("C", 1, 0), A("C", -c30, s30)], bonds: [B(0, 1), B(0, 2)] },
    "OMe with pairs": { atoms: [A("O", 0, 0, { text: "OMe", pairs: 2 }), A("C", -1, 0)], bonds: [B(0, 1)] },
    "SO3- circled": { atoms: [A("S", 0, 0, { text: "SO3", charge: -1, circled: true }), A("C", -1, 0)], bonds: [B(0, 1)] },
    "Br radical": { atoms: [A("Br", 0, 0, { radical: 1 }), A("C", -1, 0)], bonds: [B(0, 1)] },
    "Cl- with four pairs": { atoms: [A("Cl", 0, 0, { charge: -1, pairs: 4 })], bonds: [] },
  };
  const { measurer } = chem, { DEFAULT_STYLE, fontStack, frameStyle, readStyle } = await import("./docstyle.ts");
  const style = readStyle(DEFAULT_STYLE), frame = frameStyle(style, chem.STYLE.bond), measure = measurer(fontStack(style.labelFont), frame.size);
  // Where the page draws each mark the code writes as a \charge: its atom and its angle (degrees, y up, as chemfig.ts
  // reads render()'s electrons). Not a mark: a label's own sign that is not circled, moved or a radical ion's (the
  // code writes it in the label), and a radical ion's second electron at its dot (the page's handle for a drag).
  const MARKS = (d: { scale: number; label: unknown[]; electrons: { atom: number; at: number[]; key?: string }[] }, m: Mol) => d.electrons.filter((e, k, all) => {
    const a = m.atoms[e.atom], same = all.findIndex((f) => f.atom === e.atom && f.at[0] === e.at[0] && f.at[1] === e.at[1]);
    return same === k && !(e.key === "charge" && d.label[e.atom] && !a.circled && a.angles?.charge === undefined && !all.some((f) => f.atom === e.atom && f.key === undefined));
  }).map((e) => Math.round((Math.atan2(-(e.at[1] + m.atoms[e.atom].location[1] * d.scale), e.at[0] - m.atoms[e.atom].location[0] * d.scale) * 180) / Math.PI)).sort((x, y) => x - y);
  const headless = Object.fromEntries(Object.entries(SAME).map(([k, m]) => [k, { code: chemfig(m, frame, measure, { compact: true }).code, marks: MARKS(render(m, frame, measure), m) }]));
  writeFileSync(page, `${UI_LIB}\nconst SAME = ${JSON.stringify(SAME)};\nconst MARKS = ${MARKS.toString()};\n${UI_CASES}`);
  const run = spawnSync("swift", [new URL("../scripts/look/webkit.swift", import.meta.url).pathname, UI, page], { encoding: "utf8", timeout: 290_000 });
  rmSync(dir, { recursive: true, force: true });
  let got: { results: Result[]; same: Record<string, { code: string; marks: number[] }> } | undefined;
  try { got = JSON.parse(run.stdout.trim().split("\n").pop()!); } catch { /* reported below */ }
  if (!got) await kase("WebKit", "the WebKit run finishes", () => assert.fail(`${run.stdout.slice(-300)}${run.stderr.slice(-300)}`));
  else {
    for (const r of got.results) results.push(r);
    // Rule 1 for Octet with no window (D23): the same bytes, but a mark's angle where that host's own page draws the
    // mark in another place (the two hosts measure text in different ways, and render() places marks round the text).
    await kase("ST19", "X12 one drawing gives the same bytes from Copy in the app (WebKit's measuring) and the MCP with no window, but a mark's angle where each page draws the mark elsewhere (rule 1, J3, J17)", () => {
      const angles = (code: string) => [...code.matchAll(/(-?\d+):\dpt/g)].map((x) => +x[1]).sort((x, y) => x - y);
      const theta = (code: string) => code.replace(/-?\d+(?=:\dpt)/g, "θ");
      for (const k of Object.keys(SAME)) {
        const [h, w] = [headless[k], got!.same[k]];
        for (const [host, x] of [["no window", h], ["WebKit", w]] as const) {
          assert.equal(angles(x.code).length, x.marks.length, `${k}, ${host}: ${x.code} for marks at ${x.marks}`);
          angles(x.code).forEach((t, j) => assert.ok(Math.abs(((t - x.marks[j] + 540) % 360) - 180) <= 1, `${k}, ${host}: the code's mark at ${t}°, the page's at ${x.marks[j]}°`));
        }
        if (h.code === w.code) continue;
        assert.equal(theta(h.code), theta(w.code), `${k}: no window ${h.code}, WebKit ${w.code}`);
        assert.notDeepEqual(h.marks, w.marks, `${k}: the two pages draw the marks in one place, so the writer read one page two ways`);
        console.log(`chemfigcopy-stress: X12 ${k}: the page draws its marks at ${w.marks.join(", ")}° in WebKit and at ${h.marks.join(", ")}° with no window; each code follows its page`);
      }
    });
  }
}

// ---- The end: each case with the checks it ran, and each failed check named (stderr, which npm test shows) ----
const TITLES = ["", "Nothing to code", "Lone atoms and salts", "Big drawings", "Long and deep", "Hostile label text", "Unicode labels", "Raised and lowered runs", "Rings", "Turned, flipped and scaled",
  "Zoom and dark mode", "Colour", "Marks", "Bonds and hidden H", "Atoms on one spot", "Hostile drawing data", "Undo and fast input", "Two windows and pasted code", "More formats on and off", "AI apps", "Round trips and other apps",
  "Schemes", "Arrow kinds", "Hostile names", "Curved arrows", "Brackets", "Names", "Atom and map numbers", "Stereo labels", "Big schemes and names", "Everything at once"];
const failed = results.filter((r) => !r.ok);
let passed = 0, ran = 0;
for (let n = 1; n < TITLES.length; n++) {
  const mine = results.filter((r) => r.id === `ST${n}`);
  if (!mine.length) { console.log(`skip ST${n} ${TITLES[n]}: its checks run in WebKit (--ui)`); continue; }
  ran++;
  if (mine.every((r) => r.ok)) passed++;
  console.log(`${mine.every((r) => r.ok) ? "ok  " : "FAIL"} ST${n} ${TITLES[n]} (${mine.map((r) => r.what.slice(0, r.what.indexOf(" "))).join(", ")})`);
}
for (const r of failed) console.error(`FAIL ${r.id} ${r.what}: ${r.why}`);
console.log(`chemfigcopy-stress: ${passed} of ${ran} cases pass${ran < TITLES.length - 1 ? ` (${TITLES.length - 1 - ran} need --ui)` : ""}`);
if (failed.length) process.exitCode = 1;
