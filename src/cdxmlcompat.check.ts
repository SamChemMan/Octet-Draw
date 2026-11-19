// Run: node src/cdxmlcompat.check.ts. CDXML that ChemDraw 22.2 keeps as Octet means it (docs/plans/cdxml-generic-poster.md):
// generic labels, which ChemDraw reads from their text (Ar is argon to it), and pages, which ChemDraw keeps at their own
// size only as a poster. Each case runs on its own and is named; the ones that fail are listed at the end.
//
// ChemDraw's form of a file is made here from what ChemDraw 22.2 wrote in its saves on 19 November 2026 (asChemDraw).
// OCTET_STRESS_CHEMDRAW=1 (a Mac with ChemDraw 22.2): ChemDraw itself opens and saves the files, under the lock
// OCTET_STRESS_CHEMDRAW_LOCK (a folder made, then removed; by default chemdraw.lock beside this tree, as the other
// ChemDraw checks take it), and Octet reads its saves back.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fromCdxml, parseXml, toCdxml } from "./cdxml.ts";
import { cdxToXml, xmlToCdx } from "./cdx.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import { DEFAULT_STYLE, PAGES, pageSize, purposeStyle, readStyle, type DocStyle, type PageName } from "./docstyle.ts";
import { parse } from "./file.ts";
import { GENERICS } from "./labels.ts";
import type { Atom, Mol } from "./render.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const failed: string[] = [];
let ran = 0;
async function test(name: string, run: () => unknown) {
  ran++;
  try { await run(); } catch (e) { failed.push(name); console.error(`FAIL ${name}: ${(e as Error).message.split("\n").slice(0, 6).join(" ")}`); }
}
const skip = (name: string, why: string) => console.log(`cdxmlcompat.check: ${name} skipped (${why})`);

// ---- What ChemDraw 22.2 does with labels (tested 19 November 2026) ----

// Its generic labels (GenericNickname nodes): GENERICS, R with primes or a number (GenericNickname R), and M0.
const R_FORMS = ["R'", "R''", "R1", "R2", "R12", "R99"];
const CD_GENERIC = [...GENERICS.map(([g]) => g), ...R_FORMS, "M0"];
// Labels Octet takes as generic that ChemDraw reads as elements: Ar and ArH argon, Y yttrium, M with a Roman number.
const AS_ELEMENTS = ["Ar", "ArH", "Y", "MI", "MII", "MIII", "MIV", "MV", "MVI", "MVII", "MVIII", "MIX", "MX", "M(I)", "M(IV)", "M(X)"];
// Bigger labels with Ar in them: ChemDraw puts argon atoms in each (Ar12 is twelve), with an invalid valence, or makes
// it a fragment (BuAr), unless its text is not chemistry.
const WITH_AR = ["Ar'", "Ar′", "Ar''", "Ar1", "Ar2", "Ar12", "HetAr", "OAr", "ArO", "ArCH2", "CH2Ar", "PAr3", "Ar3P", "NHAr", "SO2Ar", "ArBr", "ArI", "ArLi",
  "ArB(OH)2", "Ar′B(OH)2", "BuAr", "MeAr", "BArF", "ArX", "Ar(OMe)", "PdAr", "ArSnBu3"];
// Labels ChemDraw keeps as Unspecified nodes with their text: stand-ins, words (Aryl), and an unbalanced M(IV.
const KEPT = ["L", "L'", "L1", "Ln", "E", "Nu", "Hal", "Het", "Aryl", "Alkyl", "EWG", "EDG", "PG", "LG", "DG", "M(0)", "Ak", "Alk", "Z", "Rx", "M(IV", "MIV)", "M(IV)2"];
const SHEET: [number, number] = [523, 770]; // ChemDraw's A4 sheet here, as it counts a poster's sheets

const unescape = (s: string) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const ROMAN_M = /^M(?:I{1,3}|IV|VI{0,3}|IX|X|\((?:I{1,3}|IV|VI{0,3}|IX|X)\))$/, HAS_AR = /Ar(?![a-z])/;
// A file as ChemDraw 22.2 saves it: without Octet's own attributes; each label read again from its text (an element, a
// GenericNickname R for R1, an Unspecified node), a text not interpreted kept as such; the charge kept on an element or
// a generic label and left off an Unspecified node (its sign stays in the text); a poster with PageOverlap 0 and the
// sheets it prints on.
function asChemDraw(xml: string): string {
  return xml.replace(/\s*Octet="[^"]*"/g, "")
    .replace(/<n\b([^>]*[^/])>(\s*<t\b([^>]*)>([\s\S]*?)<\/t>)/g, (all, attrs: string, t: string, tAttrs: string, runs: string) => {
      if (/NodeType="ElementList"/.test(attrs)) return all;
      const ss = [...runs.matchAll(/<s\b([^>]*)>([^<]*)<\/s>/g)], last = ss[ss.length - 1], sign = !!last && /face="64"/.test(last[1]) && /^[2-9]?[+-]$/.test(last[2]);
      const text = unescape(ss.slice(0, sign ? -1 : undefined).map((m) => m[2]).join("")), plain = /InterpretChemically="no"/.test(tAttrs);
      if (!(CD_GENERIC.includes(text) || ROMAN_M.test(text) || HAS_AR.test(text) || KEPT.includes(text) || text === "Y")) return all;
      const z = /^ArH?$/.test(text) ? 18 : text === "Y" ? 39 : 0, generic = !z && CD_GENERIC.includes(text);
      const a = attrs.replace(/\s*(NodeType|GenericNickname|Element|NumHydrogens)="[^"]*"/g, "").replace(z || generic ? /^$/ : /\s*Charge="[^"]*"/, "");
      const warning = plain ? "Chemical Interpretation is not possible for this label" : "An atom in this label has an invalid valence.";
      const node = z ? ` Warning="${warning}" Element="${z}" NumHydrogens="${text === "ArH" ? 1 : 0}"`
        : generic ? ` NodeType="GenericNickname" GenericNickname="${R_FORMS.includes(text) ? "R" : text.replace(/'/g, "&apos;")}"`
        : ` NodeType="${ROMAN_M.test(text) && !plain ? "Fragment" : "Unspecified"}"`;
      return `<n${a}${node}>${t}`;
    })
    .replace(/<page\b([^>]*?)DrawingSpace="poster"([^>]*)>/, (all, x: string, y: string) => {
      const w = Number(/Width="([^"]+)"/.exec(all)![1]), h = Number(/Height="([^"]+)"/.exec(all)![1]);
      return `<page${x.replace(/HeightPages="\d+"\s*WidthPages="\d+"/, `PageOverlap="0" HeightPages="${Math.ceil(h / SHEET[1])}" WidthPages="${Math.ceil(w / SHEET[0])}"`)}DrawingSpace="poster"${y}>`;
    });
}

// A drawing of labelled atoms, each bonded to a carbon on its left (a label's own charge or radical with it), six to a
// row with room between them (ChemDraw links a radical's electron to the nearest label) and all on an A4 page (ChemDraw
// 22.2 did not open 117 labels taller than the page in a minute), and the labels it reads back as (text with its charge
// and radical, or the element).
type Label = string | [string, Partial<Atom>];
function labelled(labels: Label[], more: Partial<Atom> = {}): Mol {
  const atoms: Atom[] = [], bonds: Mol["bonds"] = [];
  labels.forEach((l, k) => {
    const [t, own] = typeof l === "string" ? [l, {}] : l, x = (k % 6) * 5 - 12, y = 14 - Math.floor(k / 6) * 2;
    atoms.push({ label: "C", location: [x, y, 0] }, { label: "C", text: t, location: [x + 1, y, 0], ...more, ...own });
    bonds.push({ type: 1, atoms: [2 * k, 2 * k + 1] });
  });
  return { atoms, bonds };
}
const elements = (labels: string[]): Mol => ({ atoms: labels.map((l, k) => ({ label: l, location: [k * 2, 0, 0] as [number, number, number] })), bonds: [] });
const shown = (m: Mol) => m.atoms.filter((a) => a.text || a.label !== "C").map((a) => `${a.text ?? `[${a.label}]`}${a.charge ? ` ${a.charge > 0 ? "+" : ""}${a.charge}` : ""}${a.radical ? " •" : ""}${a.chemical === false ? " (text)" : ""}`);
const named = (labels: Label[], more: Partial<Atom> = {}) => shown(labelled(labels, more));
// The node that holds a label's text, and its text's attributes.
function nodeOf(xml: string, text: string): { node: string; t: string } {
  const esc = text.replace(/'/g, "&apos;").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`<n\\b([^>]*[^/])>\\s*<t\\b([^>]*)>\\s*<s\\b[^>]*>${esc}</s>`).exec(xml);
  assert.ok(m, `no node for ${text}`);
  return { node: m[1], t: m[2] };
}
const A4 = readStyle(DEFAULT_STYLE);

// ---- Generic labels ----

await test("generics: ChemDraw's generic labels are GenericNickname nodes, and its form reads back as the same labels", () => {
  const ours = CD_GENERIC.filter((g) => g !== "M0"), xml = toCdxml(labelled(ours), A4);
  for (const g of ours) {
    const { node, t } = nodeOf(xml, g);
    assert.match(node, /NodeType="GenericNickname"/, g);
    assert.equal(unescape(/GenericNickname="([^"]*)"/.exec(node)![1]), g);
    assert.doesNotMatch(t, /InterpretChemically/, g);
  }
  assert.deepEqual(shown(fromCdxml(xml).mol), ours);
  // ChemDraw's form: GenericNickname R for R1, M0 a GenericNickname too.
  const theirs = asChemDraw(toCdxml(labelled(CD_GENERIC), A4));
  assert.match(theirs, /GenericNickname="R">\s*<t\b[^>]*>\s*<s[^>]*>R1</);
  assert.deepEqual(shown(fromCdxml(theirs).mol), CD_GENERIC);
});

await test("generics: Ar, ArH, Y and M(IV) are written as text that is not chemistry, and ChemDraw's argon reads back as Ar", () => {
  const xml = toCdxml(labelled(AS_ELEMENTS), A4);
  for (const g of AS_ELEMENTS) {
    const { node, t } = nodeOf(xml, g);
    assert.match(t, /InterpretChemically="no"/, g);
    assert.doesNotMatch(node, /Element=|"plain"/, g);
  }
  // Octet's own file, and ChemDraw's (argon, yttrium, the text not interpreted): the same generic labels, chemistry on.
  assert.deepEqual(shown(fromCdxml(xml).mol), AS_ELEMENTS);
  const theirs = asChemDraw(xml);
  assert.match(theirs, /Element="18"[^>]*>\s*<t\b[^>]*InterpretChemically="no"[^>]*>\s*<s[^>]*>Ar</);
  const back = fromCdxml(theirs).mol;
  assert.deepEqual(shown(back), AS_ELEMENTS);
  assert.ok(!back.atoms.some((a) => a.label === "Ar" || a.label === "Y"), "no argon or yttrium");
});

await test("generics: every bigger label with Ar in it is written as not chemistry, and ChemDraw's form reads back as it was", () => {
  const xml = toCdxml(labelled(WITH_AR), A4);
  for (const g of WITH_AR) {
    const { node, t } = nodeOf(xml, g);
    assert.match(t, /InterpretChemically="no"/, g);
    assert.match(node, /NodeType="Unspecified"/, g);
    assert.doesNotMatch(node, /Element=|plain/, g);
  }
  assert.deepEqual(shown(fromCdxml(xml).mol), WITH_AR);
  const back = fromCdxml(asChemDraw(xml)).mol;
  assert.deepEqual(shown(back), WITH_AR);
  assert.ok(!back.atoms.some((a) => a.label === "Ar"), "no argon");
  // A label of two lines with Ar in it.
  const two = toCdxml(labelled(["Ar\nBr"]), A4);
  assert.match(two, /InterpretChemically="no"/);
  assert.deepEqual(shown(fromCdxml(asChemDraw(two)).mol), ["Ar\nBr"]);
});

await test("generics: other stand-ins, words with Ar, an unbalanced M(IV and Arg are written as before", () => {
  const xml = toCdxml(labelled(KEPT), A4);
  for (const g of KEPT) {
    const { node, t } = nodeOf(xml, g);
    assert.match(node, /NodeType="Unspecified"/, g);
    assert.doesNotMatch(t, /InterpretChemically/, g);
  }
  assert.deepEqual(shown(fromCdxml(xml).mol), KEPT);
  assert.deepEqual(shown(fromCdxml(asChemDraw(xml)).mol), KEPT);
  assert.doesNotMatch(nodeOf(toCdxml(labelled(["Arg"]), A4), "Arg").t, /InterpretChemically/);
});

await test("generics: element lists with argon in them stay element lists", () => {
  const lists = ["[Ar,Kr]", "[NOT Ar]"], xml = toCdxml(labelled(lists), A4);
  for (const g of lists) {
    const { node, t } = nodeOf(xml, g);
    assert.match(node, /NodeType="ElementList"/, g);
    assert.doesNotMatch(t, /InterpretChemically/, g);
  }
  assert.deepEqual(shown(fromCdxml(xml).mol), lists);
  assert.deepEqual(shown(fromCdxml(asChemDraw(xml)).mol), lists);
});

// Each charge and radical Octet writes on such a label: the sign after the text (2+ and 3+ with their count), a radical
// as an Electron symbol, a radical ion as one symbol.
const CHARGED: Label[] = [];
for (const t of ["Ar", "ArH", "Y", "M(IV)", "MIV", "MII", "M(X)", "Ar1", "OAr", "ArB(OH)2"]) {
  for (const charge of [1, -1, 2, -2, 3]) CHARGED.push([t, { charge }]);
  CHARGED.push([t, { radical: 1 }], [t, { radical: 1, charge: 1 }], [t, { radical: 1, charge: -1 }]);
}
await test("generics: charged and radical Ar, Y and M(IV) labels keep their charge and radical through ChemDraw's form", () => {
  const xml = toCdxml(labelled(CHARGED), A4), want = named(CHARGED);
  assert.equal((xml.match(/InterpretChemically="no"/g) ?? []).length, CHARGED.length);
  assert.match(nodeOf(xml, "M(IV)").node, /Charge="1"/);
  assert.match(xml, /<s[^>]*>M\(IV\)<\/s><s[^>]*face="64"[^>]*>2\+<\/s>/);
  assert.deepEqual(shown(fromCdxml(xml).mol), want);
  // ChemDraw keeps the charge on argon and yttrium and leaves it off the Unspecified nodes (M(IV)+, OAr-): the raised
  // sign after the text is the charge then.
  const theirs = asChemDraw(xml);
  assert.doesNotMatch(nodeOf(theirs, "M(IV)").node, /Charge=/);
  const back = fromCdxml(theirs).mol;
  assert.deepEqual(shown(back), want);
  assert.ok(!back.atoms.some((a) => a.label === "Ar" || a.label === "Y"), "no argon or yttrium");
  // A label of two lines with its charge after the first.
  const two = toCdxml(labelled([["Ar\nBr", { charge: 1 }]]), A4);
  assert.deepEqual(shown(fromCdxml(asChemDraw(two)).mol), ["Ar\nBr +1"]);
});

await test("generics: a label ending in 1 with a charge of 1 keeps its 1 (R1+ is R1)", () => {
  const list: Label[] = [["R1", { charge: 1 }], ["L1", { charge: -1 }], ["Ar1", { charge: 1 }], ["R2", { charge: 2 }], ["R1", { charge: 2 }], ["Nu1", { charge: 1 }]];
  assert.deepEqual(shown(fromCdxml(toCdxml(labelled(list), A4)).mol), named(list));
});

await test("generics: a sign typed in a label's text is not a charge", () => {
  const xml = toCdxml(labelled(["ArN2+", "Ar+"]), A4);
  assert.deepEqual(shown(fromCdxml(xml).mol), ["ArN2+", "Ar+"]);
  assert.deepEqual(shown(fromCdxml(asChemDraw(xml)).mol), ["ArN2+", "Ar+"]);
});

await test("generics: real argon, arsenic, mercury, yttrium, radium and tungsten stay elements", () => {
  const real = ["Ar", "As", "Hg", "Y", "Ra", "W"], xml = toCdxml(elements(real), A4);
  assert.doesNotMatch(xml, /InterpretChemically="no"|NodeType=/);
  for (const [l, z] of [["Ar", 18], ["As", 33], ["Hg", 80], ["Y", 39], ["Ra", 88], ["W", 74]] as const) assert.match(xml, new RegExp(`Element="${z}"`), l);
  assert.deepEqual(shown(fromCdxml(xml).mol), real.map((l) => `[${l}]`));
  // ChemDraw's argon with its text interpreted (an Ar ChemDraw drew, bonded) is still argon.
  const theirs = asChemDraw(toCdxml(labelled(["Ar"]), A4)).replace(/\s*InterpretChemically="no"/, "");
  assert.deepEqual(shown(fromCdxml(theirs).mol), ["[Ar]"]);
  // A label ChemDraw holds as not chemistry that is no generic (As) stays not chemistry.
  assert.deepEqual(shown(fromCdxml(toCdxml(labelled(["As", "OY"], { chemical: false }), A4)).mol), ["As (text)", "OY (text)"]);
});

await test("generics: Interpret Chemically off on Ar and OAr keeps through Octet's own file, and L's as before", () => {
  const xml = toCdxml(labelled(["Ar", "Y", "OAr", "L"], { chemical: false }), A4);
  assert.equal((xml.match(/InterpretChemically="no"/g) ?? []).length, 4);
  assert.equal((xml.match(/&quot;plain&quot;:1|"plain":1/g) ?? []).length, 3);
  assert.deepEqual(shown(fromCdxml(xml).mol), ["Ar (text)", "Y (text)", "OAr (text)", "L (text)"]);
  // ChemDraw leaves Octet's mark out: Ar, Y and OAr come back as chemistry.
  assert.deepEqual(shown(fromCdxml(asChemDraw(xml)).mol), ["Ar", "Y", "OAr", "L (text)"]);
});

await test("generics: a GenericNickname Y from Octet 1.1.3's writer reads as Y, never yttrium", () => {
  const old = toCdxml(labelled(["Y"]), A4).replace(/\s*InterpretChemically="no"/, "");
  assert.match(old, /NodeType="GenericNickname"\s+[^>]*GenericNickname="Y"/);
  assert.deepEqual(shown(fromCdxml(old).mol), ["Y"]);
});

await test("generics: .oct and CDX carry the text not interpreted, and read back", () => {
  const list: Label[] = [...AS_ELEMENTS, "OAr", "ArB(OH)2", ["Ar", { charge: -1 }], ["M(IV)", { charge: 2 }], "R1", "L"], m = labelled(list), want = named(list);
  const oct = writeOct(m, A4);
  assert.deepEqual(shown(readOct(oct).mol), want);
  // Another program changed the file: Octet reads its CDXML.
  assert.deepEqual(shown(readOct(oct.replace('Name="Untitled Document"', 'Name="Changed"')).mol), want);
  const tree = cdxToXml(writeCdx(m, A4)), texts = (x: ReturnType<typeof parseXml>): ReturnType<typeof parseXml>[] => [x, ...x.kids.flatMap(texts)];
  assert.ok(texts(tree).some((k) => k.name === "t" && k.attrs.InterpretChemically === "no" && k.kids.some((s) => s.text === "Ar")), "CDX text not interpreted");
  assert.deepEqual(shown(fromCdxml(tree).mol), want);
  assert.deepEqual(shown(readCdx(writeCdx(m, A4)).mol), want);
});

await test("generics: the catalytic cycle example's Ar and Ar′ labels come back from ChemDraw's form", () => {
  const m = parse(readFileSync(join(root, "src/examples/cycle.json"), "utf8")), xml = toCdxml(m, readStyle(m.style));
  assert.ok((xml.match(/InterpretChemically="no"[^>]*>\s*<s[^>]*>Ar/g) ?? []).length >= 3, "Ar and Ar′ not interpreted");
  const texts = (x: Mol) => x.atoms.map((a) => a.text).filter(Boolean).sort();
  const back = fromCdxml(asChemDraw(xml)).mol;
  assert.deepEqual(texts(back), texts(m));
  assert.ok(!back.atoms.some((a) => a.label === "Ar"), "no argon");
});

// ---- Pages ----

const pageOf = (xml: string) => /<page\b[^>]*>/.exec(xml.replace(/\n/g, " "))![0];
const styleBack = (xml: string) => fromCdxml(xml).style;
const blank: Mol = { atoms: [], bonds: [] };
const custom = (w: number, h: number) => readStyle({ ...DEFAULT_STYLE, page: "Custom", custom: [w, h] });
// A page's printable side in pt, as Octet writes it (half an inch of margin each side).
const sides = (st: DocStyle) => pageSize(st).map((mm) => Number(((mm * 72) / 25.4 - 72).toFixed(2)));
// Benzene rings, each centred at [dx, dy] bond lengths from the middle of the page, and a straight bond L long.
const rings = (...at: [number, number][]): Mol => ({
  atoms: at.flatMap(([dx, dy]) => Array.from({ length: 6 }, (_, k) => ({ label: "C", location: [Math.cos((k * Math.PI) / 3) + dx, Math.sin((k * Math.PI) / 3) + dy, 0] as [number, number, number] }))),
  bonds: at.flatMap((_, r) => Array.from({ length: 6 }, (_, k) => ({ type: k % 2 ? 2 : 1, atoms: [6 * r + k, 6 * r + ((k + 1) % 6)] as [number, number] }))),
});
const line = (L: number): Mol => ({ atoms: [{ label: "C", location: [-L / 2, 0, 0] }, { label: "C", location: [L / 2, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] });

await test("pages: an A0 poster is a poster page, and ChemDraw's form reads back as A0 with the Poster purpose", () => {
  const lactams = parse(readFileSync(join(root, "src/examples/lactams.json"), "utf8"));
  for (const [what, m, st] of [["empty", blank, purposeStyle("poster")], ["lactams", lactams, readStyle(lactams.style)]] as const) {
    const xml = toCdxml(m, st);
    assert.match(pageOf(xml), /BoundingBox="0 0 2311.94 3298.39"[^>]*DrawingSpace="poster"\s+Width="2311.94"\s+Height="3298.39"/, what);
    const s = styleBack(asChemDraw(xml));
    assert.deepEqual([s.page, s.landscape, s.purpose, s.scale, s.preset], ["A0", false, "poster", 3, "ACS Document 1996"], what);
    // Octet's own file, as before.
    const own = styleBack(xml);
    assert.deepEqual([own.page, own.purpose, own.scale], ["A0", "poster", 3], what);
  }
});

await test("pages: Slides, A3, Legal, Tabloid, small pages and Custom are posters and keep their size", () => {
  const cases: [string, DocStyle, string | undefined][] = [["slides", purposeStyle("slides"), "slides"]];
  for (const page of ["A3", "A2", "A1", "Legal", "Tabloid", "Half", "ACS1", "ACS2", "Slide43"] as PageName[]) cases.push([page, readStyle({ ...DEFAULT_STYLE, page }), undefined]);
  cases.push(["A3 landscape", readStyle({ ...DEFAULT_STYLE, page: "A3", landscape: true }), undefined], ["Custom 300 x 200", custom(300, 200), undefined]);
  for (const [what, st, purpose] of cases) {
    const xml = toCdxml(labelled(["R"]), st), p = pageOf(xml), box = /BoundingBox="0 0 ([\d.]+) ([\d.]+)"/.exec(p)!;
    assert.match(p, new RegExp(`DrawingSpace="poster"\\s+Width="${box[1]}"\\s+Height="${box[2]}"`), what);
    const s = styleBack(asChemDraw(xml));
    assert.deepEqual([s.page, s.landscape, s.purpose], [st.page, st.landscape, purpose], what);
    if (st.page === "Custom") assert.deepEqual(s.custom, st.custom, what);
    if (purpose === "slides") assert.equal(s.scale, 2);
  }
});

// The files that must not change, written by cdxml.ts from the commit before this item, without and with this item's
// changes to it (its commits, found by their subjects; add a later commit of this item here). So no other change to
// cdxml.ts, before or after the item is merged, is in either writer. Skipped with the reason when the history is not
// here (a shallow clone) or a commit of this item does not apply there.
const ITEM = ["Keep generic labels and poster pages through ChemDraw 22.2", "Keep charged and bigger Ar labels, and write a poster only where ChemDraw opens it"];
let before: typeof toCdxml | undefined, withItem: typeof toCdxml | undefined, oldDir: string | undefined, why = "";
const log = spawnSync("git", ["log", "--no-merges", "--reverse", "--format=%H %s", "--", "src/cdxml.ts"], { cwd: root, encoding: "utf8" });
const commits = log.status === 0 ? log.stdout.split("\n").filter((l) => ITEM.includes(l.slice(41))).map((l) => l.slice(0, 40)) : [];
if (!commits.length) why = log.status === 0 ? "this item's commits are not in this tree" : "no git history";
else {
  oldDir = mkdtempSync(join(tmpdir(), "octet-cdxml-before-"));
  execFileSync("tar", ["-x", "-C", oldDir], { input: execFileSync("git", ["archive", `${commits[0]}^`, "src", "package.json"], { cwd: root, maxBuffer: 1 << 28 }) });
  symlinkSync(join(root, "node_modules"), join(oldDir, "node_modules"));
  copyFileSync(join(oldDir, "src/cdxml.ts"), join(oldDir, "src/cdxml-before.ts"));
  // Oldest first.
  for (const c of commits) {
    const patch = execFileSync("git", ["diff", `${c}^`, c, "--", "src/cdxml.ts"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
    if (spawnSync("git", ["apply", "-"], { cwd: oldDir, input: patch, encoding: "utf8" }).status !== 0) { why = `${c.slice(0, 8)} does not apply to cdxml.ts before this item`; break; }
  }
  if (!why) [before, withItem] = [(await import(join(oldDir, "src/cdxml-before.ts"))).toCdxml, (await import(join(oldDir, "src/cdxml.ts"))).toCdxml];
}
// This item's change leaves the file as it was.
const unchanged = (m: Mol, st: DocStyle, what: string) => assert.equal(withItem!(m, st), before!(m, st), what);
await test("pages: the writer with this item's change is not the one before it (the catalytic cycle's Ar)", () => {
  if (!withItem) return skip("comparison of the writers before and with this item", why);
  const m = parse(readFileSync(join(root, "src/examples/cycle.json"), "utf8")), st = readStyle(m.style);
  assert.match(withItem(m, st), /InterpretChemically="no"/);
  assert.doesNotMatch(before!(m, st), /<t\b[^>]*InterpretChemically="no"/);
});
process.on("exit", () => { if (oldDir) rmSync(oldDir, { recursive: true, force: true }); });

await test("pages: a page ChemDraw 22.2 cannot open as a poster is written as before, byte for byte", () => {
  const two = (st: DocStyle) => { const d = sides(st)[0] / (2 * st.bond) + 2; return rings([-d, 0], [d, 0]); };
  const tall = (st: DocStyle) => { const d = sides(st)[1] / (2 * st.bond) + 2; return rings([0, -d], [0, d]); };
  const [w] = sides(custom(100, 100));
  const cases: [string, Mol, DocStyle][] = [
    // A side of 0 pt or less after the margins: ChemDraw does not open it.
    ["Custom 10 x 10", blank, custom(10, 10)], ["Custom 25 x 25", blank, custom(25, 25)], ["Custom 25.4 x 100", blank, custom(25.4, 100)],
    ["Custom 300 x 10", blank, custom(300, 10)], ["Custom 10 x 300", blank, custom(10, 300)], ["Custom 10 x 10 with a ring", rings([0, 0]), custom(10, 10)],
    // A side under 45 pt: ChemDraw stops as it saves or closes one (40.3 mm and less did).
    ["Custom 25.5 x 25.5", blank, custom(25.5, 25.5)], ["Custom 40 x 40", blank, custom(40, 40)], ["Custom 41.2 x 300", blank, custom(41.2, 300)],
    ["Custom 300 x 41.2", blank, custom(300, 41.2)], ["Custom 40 x 40 with a ring", rings([0, 0]), custom(40, 40)],
    // A drawing bigger than the page: ChemDraw makes the page bigger, which can take minutes.
    ["Custom 30 x 30 with a ring", rings([0, 0]), custom(30, 30)], ["Custom 35 x 35 with a ring", rings([0, 0]), custom(35, 35)],
    ["Custom 300 x 30 with a ring", rings([0, 0]), custom(300, 30)], ["Custom 30 x 300 with a ring", rings([0, 0]), custom(30, 300)],
    ["Custom 100 x 100 with rings wider than it", two(custom(100, 100)), custom(100, 100)], ["Custom 100 x 100 with rings taller than it", tall(custom(100, 100)), custom(100, 100)],
    ["Custom 100 x 100 with rings past its edge, wider than it", rings([10, 0], [30, 0]), custom(100, 100)],
    ["Custom 100 x 100 with a bond 8 pt shorter than it", line((w - 8.5) / A4.bond), custom(100, 100)],
    ["A0 poster with rings wider than it", two(purposeStyle("poster")), purposeStyle("poster")], ["Slides with rings taller than it", tall(purposeStyle("slides")), purposeStyle("slides")],
  ];
  for (const [what, m, st] of cases) {
    const xml = toCdxml(m, st);
    assert.doesNotMatch(pageOf(xml), /DrawingSpace|Width=|Height=/, what);
    if (withItem) unchanged(m, st, what);
  }
  if (!withItem) skip("byte check of pages ChemDraw cannot open as a poster", why);
});

await test("pages: a page whose drawing fits is a poster, wherever the drawing is on it", () => {
  const [w] = sides(custom(100, 100));
  const cases: [string, Mol, DocStyle][] = [
    ["Custom 41.3 x 41.3, empty", blank, custom(41.3, 41.3)], ["Custom 41.3 x 300, empty", blank, custom(41.3, 300)], ["Custom 300 x 41.3, empty", blank, custom(300, 41.3)],
    ["Custom 45 x 45 with a ring", rings([0, 0]), custom(45, 45)],
    ["Custom 100 x 100 with a ring past its right edge", rings([7.3, 0]), custom(100, 100)], ["Custom 100 x 100 with a ring past its top edge", rings([0, 7.3]), custom(100, 100)],
    ["Custom 100 x 100 with a ring off it", rings([-30, 0]), custom(100, 100)], ["Custom 100 x 100 with rings off it", rings([10, 0], [14, 0]), custom(100, 100)],
    ["Custom 100 x 100 with a bond 9 pt shorter than it", line((w - 9.5) / A4.bond), custom(100, 100)],
  ];
  for (const [what, m, st] of cases) {
    const [W, H] = sides(st), p = pageOf(toCdxml(m, st));
    assert.match(p, new RegExp(`DrawingSpace="poster"\\s+Width="${W.toFixed(2)}"\\s+Height="${H.toFixed(2)}"`), what);
  }
});

// A4 and Letter, either way round, a drawing on two pages, and the examples on A4: byte for byte as before.
const same: [string, Mol, DocStyle][] = [];
for (const page of ["A4", "Letter"] as PageName[]) for (const landscape of [false, true]) same.push([`${page}${landscape ? " landscape" : ""}`, labelled(["R", "R1", "X", "L", "Hal", "Nu", "M(0)", "Aryl"]), readStyle({ ...DEFAULT_STYLE, page, landscape })]);
const twoPages = labelled(["R", "L"]);
twoPages.atoms.push({ label: "O", location: [0, -60, 0] }, { label: "N", location: [1, -60, 0] });
same.push(["A4 on two pages", twoPages, A4], ["Custom the size of A4", labelled(["R"]), custom(210, 297)]);
for (const id of ["oseltamivir", "suzuki", "epoxidation", "hydrolysis", "threonine", "ibuprofen", "photooxygenation", "aspirin"]) {
  const m = parse(readFileSync(join(root, `src/examples/${id}.json`), "utf8"));
  same.push([`example ${id}`, m, readStyle(m.style)]);
}
for (const [what, m, st] of same) await test(`pages: ${what} is written as before, byte for byte`, () => {
  const xml = toCdxml(m, st);
  assert.doesNotMatch(pageOf(xml), /DrawingSpace|Width=|Height=/);
  if (!withItem) return skip(`byte check of ${what}`, why);
  unchanged(m, st, what);
});

await test("pages: a page ChemDraw prints on sheets (no DrawingSpace) reads as before, with no purpose", () => {
  const xml = asChemDraw(toCdxml(blank, purposeStyle("poster"))).replace(/\s+(DrawingSpace|Width|Height|PageOverlap)="[^"]*"/g, "");
  const s = styleBack(xml);
  assert.deepEqual([s.page, s.purpose, s.scale], ["A0", undefined, 1]);
});

await test("pages: hostile poster sizes read as a bounded page", () => {
  const xml = asChemDraw(toCdxml(labelled(["R"]), purposeStyle("poster")));
  for (const v of ["1e308", "-5", "0", "NaN", "Infinity", "-Infinity", "abc", "1000000", "", "1e-300"]) {
    const bad = xml.replace(/<page\b[^>]*>/, (p) => p.replace(/BoundingBox="[^"]*"/, `BoundingBox="0 0 ${v} ${v}"`).replace(/Width="[^"]*"/, `Width="${v}"`).replace(/Height="[^"]*"/, `Height="${v}"`));
    const s = styleBack(bad);
    assert.ok(s.page in PAGES || s.page === "Custom", v);
    assert.ok(s.custom.every((x) => Number.isFinite(x) && x >= 10 && x <= 2000), `${v}: ${s.custom}`);
    assert.ok(s.purpose === undefined || s.page === "A0", v);
  }
  // A poster on no page at all, and DrawingSpace with another value.
  assert.equal(styleBack(xml.replace(/<page\b[^>]*>[\s\S]*<\/page>/, "")).purpose, undefined);
  assert.equal(styleBack(xml.replace('DrawingSpace="poster"', 'DrawingSpace="pages"')).purpose, undefined);
});

await test("pages: CDX carries the poster page", () => {
  const tree = cdxToXml(writeCdx(blank, purposeStyle("poster"))), page = tree.kids.find((k) => k.name === "page")!;
  assert.deepEqual([page.attrs.DrawingSpace, page.attrs.Width, page.attrs.Height], ["poster", "2311.94", "3298.39"]);
  const back = fromCdxml(cdxToXml(xmlToCdx(parseXml(asChemDraw(toCdxml(blank, purposeStyle("poster"))))))).style;
  assert.deepEqual([back.page, back.purpose], ["A0", "poster"]);
});

// ---- With Octet's headless host: an AI app's {R}, {L} and {Ar}, and the examples as Export writes them ----

const host = existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url)) ? await import("../scripts/headless/host.ts") : undefined;
if (!host) skip("headless cases", "no OPSIN build");
else {
  await host.load();
  const { handle } = await import("./mcp.ts");
  await test("mcp: {R}, {L} and {Ar} from an AI app go to ChemDraw as generic labels and come back", async () => {
    const d = host.drawing("paper", "Generics");
    const call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", host.session("Check", "generics"))).result;
    assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);
    const out = await call("draw", { lines: "{R}c1ccc({Ar})cc1 (1) | {L}[Pd]({L})(Br){Ar} (2)" });
    assert.ok(!out.isError, out.content[0].text);
    const xml = d.host.fileText("cdxml")!, texts = (m: Mol) => m.atoms.map((a) => a.text).filter(Boolean).sort();
    assert.deepEqual(texts(d.host.doc()), ["Ar", "Ar", "L", "L", "R"]);
    assert.match(nodeOf(xml, "R").node, /NodeType="GenericNickname"/);
    assert.doesNotMatch(nodeOf(xml, "L").t, /InterpretChemically/);
    assert.match(nodeOf(xml, "Ar").t, /InterpretChemically="no"/);
    const back = fromCdxml(asChemDraw(xml)).mol;
    assert.deepEqual(texts(back), texts(d.host.doc()));
    assert.ok(!back.atoms.some((a) => a.label === "Ar" && !a.text), "no argon");
  });
  await test("pages: an experiment with its risk assessment on page 2 is written as before, byte for byte", () => {
    const d = host.drawing("experiment", "Experiment"), m = d.host.doc(), st = readStyle(m.style);
    assert.equal(st.page, "A4");
    const xml = d.host.fileText("cdxml")!;
    assert.doesNotMatch(pageOf(xml), /DrawingSpace/);
    if (!withItem) return skip("byte check of the experiment", why);
    unchanged(m, st, "experiment");
  });

  // ---- ChemDraw 22.2 itself (OCTET_STRESS_CHEMDRAW=1) ----
  if (process.env.OCTET_STRESS_CHEMDRAW !== "1") skip("ChemDraw 22.2 round trip", "set OCTET_STRESS_CHEMDRAW=1");
  else if (!existsSync("/Applications/ChemDraw 22.2.0.app")) skip("ChemDraw 22.2 round trip", "no ChemDraw 22.2");
  else await chemdraw(host);
}

// Every example as Export writes it, an empty poster, the labels, the charged labels and pages that are and are not
// posters: ChemDraw opens each and saves it as CDXML.
async function chemdraw(h: NonNullable<typeof host>) {
  const work = mkdtempSync(join(tmpdir(), "octet-cdcompat-")), saved = join(work, "saved");
  mkdirSync(saved);
  const list: { id: string; name: string }[] = JSON.parse(readFileSync(join(root, "src/examples/examples.json"), "utf8"));
  const files: { name: string; mol: Mol; style: DocStyle; page?: "A4" | "kept" }[] = [];
  for (const x of list) {
    const d = h.drawing("quick", x.name);
    d.host.set(parse(readFileSync(join(root, `src/examples/${x.id}.json`), "utf8")));
    writeFileSync(join(work, `octet-${x.id}.cdxml`), d.host.fileText("cdxml")!);
    files.push({ name: `octet-${x.id}.cdxml`, mol: d.host.doc(), style: readStyle(d.host.doc().style) });
  }
  const poster = h.drawing("poster", "Empty poster");
  writeFileSync(join(work, "octet-emptyposter.cdxml"), poster.host.fileText("cdxml")!);
  files.push({ name: "octet-emptyposter.cdxml", mol: poster.host.doc(), style: purposeStyle("poster") });
  const own = (name: string, mol: Mol, style: DocStyle, page?: "A4" | "kept") => { writeFileSync(join(work, name), toCdxml(mol, style)); files.push({ name, mol, style, page }); };
  own("octet-labels.cdxml", labelled([...CD_GENERIC, ...AS_ELEMENTS, ...WITH_AR, ...KEPT, "Ar\nBr"]), A4);
  own("octet-charged.cdxml", labelled([...CHARGED, ["Ar\nBr", { charge: 1 }]]), A4);
  // Pages ChemDraw cannot open as a poster, written as before (it opens them as A4), and posters that keep their size.
  own("octet-page-10x10.cdxml", rings([0, 0]), custom(10, 10), "A4");
  own("octet-page-30x30.cdxml", rings([0, 0]), custom(30, 30), "A4");
  own("octet-page-100x100-wide.cdxml", rings([10, 0], [30, 0]), custom(100, 100), "A4");
  own("octet-page-25.5x25.5.cdxml", blank, custom(25.5, 25.5), "A4");
  own("octet-page-40x40.cdxml", rings([0, 0]), custom(40, 40), "A4");
  own("octet-page-45x45.cdxml", rings([0, 0]), custom(45, 45), "kept");
  own("octet-page-100x100-edge.cdxml", rings([7.3, 0]), custom(100, 100), "kept");
  // The smallest posters, three in a row (ChemDraw stopped at about the fifth smaller one).
  own("octet-page-41.3x41.3.cdxml", blank, custom(41.3, 41.3), "kept");
  own("octet-page-41.3x300.cdxml", blank, custom(41.3, 300), "kept");
  own("octet-page-300x41.3.cdxml", blank, custom(300, 41.3), "kept");
  // Two examples with labels and text on a page 10 pt bigger than the drawing each way: ChemDraw keeps the page.
  for (const id of ["oseltamivir", "threonine"]) {
    const m = parse(readFileSync(join(root, `src/examples/${id}.json`), "utf8")), [x0, y0, x1, y1] = / BoundingBox="([^"]*)"/.exec(/<CDXML[^>]*/.exec(toCdxml(m, A4))![0])![1].split(" ").map(Number);
    const mm = (side: number) => Math.ceil(((side + 10 + 72) * 25.4) / 72);
    own(`octet-page-fit-${id}.cdxml`, m, custom(mm(x1 - x0), mm(y1 - y0)), "kept");
  }

  const lock = process.env.OCTET_STRESS_CHEMDRAW_LOCK ?? join(fileURLToPath(new URL("../..", import.meta.url)), "chemdraw.lock"), app = "/Applications/ChemDraw 22.2.0.app";
  const pids = () => spawnSync("pgrep", ["-f", `${app}/Contents/MacOS`], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean);
  const ask = (script: string, ms = 60_000) => spawnSync("osascript", ["-e", `tell application id "com.perkinelmer.ChemDraw.22" to ${script}`], { encoding: "utf8", timeout: ms }).stdout?.trim() ?? "";
  const docs = () => ask("get name of every document", 10_000).split(", ").filter(Boolean);
  let locked = false;
  for (let k = 0; k < 90 && !locked; k++) {
    try { mkdirSync(lock); locked = true; } catch {
      // A lock older than 45 minutes with no ChemDraw running is stale.
      try { if (Date.now() - statSync(lock).mtimeMs > 45 * 60_000 && !pids().length) { rmSync(lock, { recursive: true, force: true }); continue; } } catch { /* gone */ }
      spawnSync("sleep", ["30"]);
    }
  }
  if (!locked) { await test("chemdraw: round trip", () => assert.fail("the ChemDraw lock stayed taken for 45 minutes")); return; }
  // ChemDraw was not running when this check took the lock: every ChemDraw that runs until the lock is released is this
  // check's (one AppleScript starts again after one stops). The check stops one that hangs on a file, and quits it at
  // the end when its documents are none or unchanged (the Untitled document it opens with). One that was running is
  // left as it was.
  const started = !pids().length, opened: string[] = [], why = new Map<string, string>();
  const stop = () => { const mine = pids(); for (const p of mine) spawnSync("kill", ["-TERM", p]); spawnSync("sleep", ["5"]); for (const p of mine) if (pids().includes(p)) spawnSync("kill", ["-KILL", p]); };
  try {
    for (const f of files) {
      const t0 = Date.now(), before = pids().join();
      spawnSync("open", ["-g", "-a", app, join(work, f.name), "--args", "-ApplePersistenceIgnoreState", "YES"]);
      let open = false;
      for (let k = 0; k < 30 && !(open = docs().includes(f.name)); k++) spawnSync("sleep", ["2"]);
      if (!open) {
        console.log(`cdxmlcompat.check: ChemDraw did not open ${f.name} in a minute`);
        if (!started) { console.log("cdxmlcompat.check: ChemDraw was not started by this check; the rest did not run"); break; }
        stop();
        continue;
      }
      opened.push(f.name);
      const s = spawnSync("osascript", ["-e", `tell application id "com.perkinelmer.ChemDraw.22" to save document "${f.name}" in (POSIX file "${join(saved, f.name)}") as "ChemDraw XML"`], { encoding: "utf8", timeout: 120_000 });
      if (s.status !== 0) why.set(f.name, `save: ${(s.stderr || String(s.error ?? s.signal)).trim()}`);
      ask(`close document "${f.name}" saving no`);
      const after = pids().join();
      console.log(`cdxmlcompat.check: ChemDraw ${f.name}: ${((Date.now() - t0) / 1000).toFixed(0)} s${before && after !== before ? `, ChemDraw ${before} stopped, now ${after || "none"}` : ""}`);
    }
  } finally {
    const unchanged = () => ask("get modified of every document", 10_000).split(", ").every((m) => m !== "true");
    if (started && pids().length && unchanged()) { ask("quit", 30_000); spawnSync("sleep", ["3"]); if (pids().length) stop(); }
    rmSync(lock, { recursive: true, force: true });
  }
  for (const f of files) await test(`chemdraw: ${f.name} back from ChemDraw 22.2 keeps its labels and page`, () => {
    const file = join(saved, f.name);
    assert.ok(existsSync(file), opened.includes(f.name) ? `ChemDraw did not save it${why.has(f.name) ? ` (${why.get(f.name)})` : ""}` : "ChemDraw did not open it");
    const back = fromCdxml(readFileSync(file, "utf8")), texts = (m: Mol) => shown(m).filter((t) => !/^\[(C|H|O|N|S|P|F|Cl|Br|B|I|Na|K|Pd|Li|Mg|Si)\]/.test(t)).sort();
    console.log(`cdxmlcompat.check: ${f.name}: ChemDraw kept ${back.style.page}${back.style.page === "Custom" ? ` ${back.style.custom.join(" x ")}` : ""}${back.style.landscape ? " landscape" : ""}${back.style.purpose ? `, ${back.style.purpose}` : ""}; labels ${JSON.stringify(texts(back.mol)).slice(0, 300)}`);
    assert.ok(!texts(back.mol).some((t) => /^\[(Ar|Y)\]/.test(t)), "argon or yttrium");
    if (/labels|charged/.test(f.name)) assert.deepEqual(texts(back.mol), texts(f.mol));
    else for (const t of texts(f.mol).filter((t) => HAS_AR.test(t) || /^Y\b/.test(t))) assert.ok(texts(back.mol).includes(t), `${t} came back as ${texts(back.mol).join(" ")}`);
    if (f.page === "kept") assert.deepEqual([back.style.page, ...back.style.custom], ["Custom", ...f.style.custom]);
    else if (f.style.page === "A0") assert.deepEqual([back.style.page, back.style.purpose], ["A0", "poster"]);
    else assert.equal(back.style.page, "A4");
  });
  rmSync(work, { recursive: true, force: true });
}

if (failed.length) { console.error(`cdxmlcompat.check: ${failed.length} of ${ran} cases failed:\n  ${failed.join("\n  ")}`); process.exit(1); }
console.log(`cdxmlcompat.check: ${ran} cases pass.`);
process.exit(0);
