// Run: node src/cdxmlcompat.check.ts. CDXML that ChemDraw 22.2 keeps as Octet means it (docs/plans/cdxml-generic-poster.md):
// generic labels, which ChemDraw reads from their text (Ar is argon to it), and pages, which ChemDraw keeps at their own
// size only as a poster. Each case runs on its own and is named; the ones that fail are listed at the end.
//
// ChemDraw's form of a file is made here from what ChemDraw 22.2 wrote in its saves on 19 November 2026 (asChemDraw).
// OCTET_STRESS_CHEMDRAW=1 (a Mac with ChemDraw 22.2): ChemDraw itself opens and saves the files, under the lock
// OCTET_STRESS_CHEMDRAW_LOCK (a folder made, then removed), and Octet reads its saves back.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fromCdxml, parseXml, toCdxml } from "./cdxml.ts";
import { cdxToXml, xmlToCdx } from "./cdx.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import { DEFAULT_STYLE, PAGES, purposeStyle, readStyle, type DocStyle, type PageName } from "./docstyle.ts";
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
// Labels ChemDraw keeps as Unspecified nodes with their text.
const KEPT = ["L", "L'", "L1", "Ln", "E", "Nu", "Hal", "Het", "HetAr", "Aryl", "Alkyl", "EWG", "EDG", "PG", "LG", "DG", "Ar'", "Ar1", "Ar2", "M(0)",
  "OAr", "ArO", "ArCH2", "CH2Ar", "PAr3", "Ar3P", "NHAr", "SO2Ar", "Ak", "Alk", "Z", "Rx"];
const SHEET: [number, number] = [523, 770]; // ChemDraw's A4 sheet here, as it counts a poster's sheets

const unescape = (s: string) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const ROMAN_M = /^M\(?(?:I{1,3}|IV|VI{0,3}|IX|X)\)?$/;
// A file as ChemDraw 22.2 saves it: without Octet's own attributes; each label read again from its text (an element, a
// GenericNickname R for R1, an Unspecified node), a text not interpreted kept as such; a poster with PageOverlap 0 and
// the sheets it prints on.
function asChemDraw(xml: string): string {
  return xml.replace(/\s*Octet="[^"]*"/g, "")
    .replace(/<n\b([^>]*[^/])>(\s*<t\b([^>]*)>([\s\S]*?)<\/t>)/g, (all, attrs: string, t: string, tAttrs: string, runs: string) => {
      const text = unescape([...runs.matchAll(/<s\b[^>]*>([^<]*)<\/s>/g)].map((m) => m[1]).join("")), plain = /InterpretChemically="no"/.test(tAttrs);
      if (!(CD_GENERIC.includes(text) || AS_ELEMENTS.includes(text) || KEPT.includes(text))) return all;
      const a = attrs.replace(/\s*(NodeType|GenericNickname|Element|NumHydrogens)="[^"]*"/g, ""), z = /^ArH?$/.test(text) ? 18 : text === "Y" ? 39 : 0;
      const warning = plain ? "Chemical Interpretation is not possible for this label" : "An atom in this label has an invalid valence.";
      const node = z ? ` Warning="${warning}" Element="${z}" NumHydrogens="${text === "ArH" ? 1 : 0}"`
        : CD_GENERIC.includes(text) ? ` NodeType="GenericNickname" GenericNickname="${R_FORMS.includes(text) ? "R" : text.replace(/'/g, "&apos;")}"`
        : ` NodeType="${ROMAN_M.test(text) && !plain ? "Fragment" : "Unspecified"}"`;
      return `<n${a}${node}>${t}`;
    })
    .replace(/<page\b([^>]*?)DrawingSpace="poster"([^>]*)>/, (all, x: string, y: string) => {
      const w = Number(/Width="([^"]+)"/.exec(all)![1]), h = Number(/Height="([^"]+)"/.exec(all)![1]);
      return `<page${x.replace(/HeightPages="\d+"\s*WidthPages="\d+"/, `PageOverlap="0" HeightPages="${Math.ceil(h / SHEET[1])}" WidthPages="${Math.ceil(w / SHEET[0])}"`)}DrawingSpace="poster"${y}>`;
    });
}

// A drawing of labelled atoms, each bonded to a carbon, and the labels it reads back as (text, or the element).
function labelled(labels: string[], more: Partial<Atom> = {}): Mol {
  const atoms: Atom[] = [], bonds: Mol["bonds"] = [];
  labels.forEach((t, k) => {
    const x = (k % 8) * 3 - 10, y = 14 - Math.floor(k / 8) * 2;
    atoms.push({ label: "C", location: [x, y, 0] }, { label: "C", text: t, location: [x + 1, y, 0], ...more });
    bonds.push({ type: 1, atoms: [2 * k, 2 * k + 1] });
  });
  return { atoms, bonds };
}
const elements = (labels: string[]): Mol => ({ atoms: labels.map((l, k) => ({ label: l, location: [k * 2, 0, 0] as [number, number, number] })), bonds: [] });
const shown = (m: Mol) => m.atoms.filter((a) => a.text || a.label !== "C").map((a) => (a.text ? `${a.text}${a.chemical === false ? " (text)" : ""}` : `[${a.label}]`));
// The node that holds a label's text, and its text's attributes.
function nodeOf(xml: string, text: string): { node: string; t: string } {
  const esc = text.replace(/'/g, "&apos;").replace(/[()*]/g, (c) => `\\${c}`);
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
  assert.ok(back.atoms.every((a) => a.label === "C"), "no argon or yttrium");
});

await test("generics: other stand-ins and bigger labels with Ar are written as before", () => {
  const xml = toCdxml(labelled(KEPT), A4);
  for (const g of KEPT) {
    const { node, t } = nodeOf(xml, g);
    assert.match(node, /NodeType="Unspecified"/, g);
    assert.doesNotMatch(t, /InterpretChemically/, g);
  }
  assert.deepEqual(shown(fromCdxml(xml).mol), KEPT);
  assert.deepEqual(shown(fromCdxml(asChemDraw(xml)).mol), KEPT);
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

await test("generics: Interpret Chemically off on Ar keeps through Octet's own file, and L's as before", () => {
  const xml = toCdxml(labelled(["Ar", "Y", "L"], { chemical: false }), A4);
  assert.equal((xml.match(/InterpretChemically="no"/g) ?? []).length, 3);
  assert.equal((xml.match(/&quot;plain&quot;:1|"plain":1/g) ?? []).length, 2);
  assert.deepEqual(shown(fromCdxml(xml).mol), ["Ar (text)", "Y (text)", "L (text)"]);
  // ChemDraw leaves Octet's mark out: Ar and Y come back as the generic labels.
  assert.deepEqual(shown(fromCdxml(asChemDraw(xml)).mol), ["Ar", "Y", "L (text)"]);
});

await test("generics: a GenericNickname Y from Octet 1.1.3's writer reads as Y, never yttrium", () => {
  const old = toCdxml(labelled(["Y"]), A4).replace(/\s*InterpretChemically="no"/, "");
  assert.match(old, /NodeType="GenericNickname"\s+[^>]*GenericNickname="Y"/);
  assert.deepEqual(shown(fromCdxml(old).mol), ["Y"]);
});

await test("generics: .oct and CDX carry the text not interpreted, and read back", () => {
  const m = labelled([...AS_ELEMENTS, "R1", "L"]), want = [...AS_ELEMENTS, "R1", "L"];
  const oct = writeOct(m, A4);
  assert.deepEqual(shown(readOct(oct).mol), want);
  // Another program changed the file: Octet reads its CDXML.
  assert.deepEqual(shown(readOct(oct.replace('Name="Untitled Document"', 'Name="Changed"')).mol), want);
  const tree = cdxToXml(writeCdx(m, A4)), texts = (x: ReturnType<typeof parseXml>): ReturnType<typeof parseXml>[] => [x, ...x.kids.flatMap(texts)];
  assert.ok(texts(tree).some((k) => k.name === "t" && k.attrs.InterpretChemically === "no" && k.kids.some((s) => s.text === "Ar")), "CDX text not interpreted");
  assert.deepEqual(shown(fromCdxml(tree).mol), want);
  assert.deepEqual(shown(readCdx(writeCdx(m, A4)).mol), want);
});

await test("generics: the catalytic cycle example's Ar labels come back from ChemDraw's form", () => {
  const m = parse(readFileSync(join(root, "src/examples/cycle.json"), "utf8")), xml = toCdxml(m, readStyle(m.style));
  assert.ok((xml.match(/InterpretChemically="no"[^>]*>\s*<s[^>]*>Ar</g) ?? []).length >= 2, "Ar not interpreted");
  const texts = (x: Mol) => x.atoms.map((a) => a.text).filter(Boolean).sort();
  const back = fromCdxml(asChemDraw(xml)).mol;
  assert.deepEqual(texts(back), texts(m));
  assert.ok(!back.atoms.some((a) => a.label === "Ar"), "no argon");
});

// ---- Pages ----

const pageOf = (xml: string) => /<page\b[^>]*>/.exec(xml.replace(/\n/g, " "))![0];
const styleBack = (xml: string) => fromCdxml(xml).style;
const blank: Mol = { atoms: [], bonds: [] };

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
  cases.push(["A3 landscape", readStyle({ ...DEFAULT_STYLE, page: "A3", landscape: true }), undefined], ["Custom 300 x 200", readStyle({ ...DEFAULT_STYLE, page: "Custom", custom: [300, 200] }), undefined]);
  for (const [what, st, purpose] of cases) {
    const xml = toCdxml(labelled(["R"]), st), p = pageOf(xml), box = /BoundingBox="0 0 ([\d.]+) ([\d.]+)"/.exec(p)!;
    assert.match(p, new RegExp(`DrawingSpace="poster"\\s+Width="${box[1]}"\\s+Height="${box[2]}"`), what);
    const s = styleBack(asChemDraw(xml));
    assert.deepEqual([s.page, s.landscape, s.purpose], [st.page, st.landscape, purpose], what);
    if (st.page === "Custom") assert.deepEqual(s.custom, st.custom, what);
    if (purpose === "slides") assert.equal(s.scale, 2);
  }
});

// The writer as it was before this change (release-1.1.3 at 0045cd76), for the files that must not change. Only while
// this change is the one change to cdxml.ts since then: a later change may change these files on purpose.
const BASE = "0045cd76b9c5f1164a9fdbdbebf50b1f9468f0b7", SUBJECT = "Keep generic labels and poster pages through ChemDraw 22.2";
const since = spawnSync("git", ["log", "--format=%s", `${BASE}..HEAD`, "--", "src/cdxml.ts"], { cwd: root, encoding: "utf8" });
const why = since.status !== 0 ? `no commit ${BASE.slice(0, 8)}` : since.stdout.split("\n").some((s) => s && s !== SUBJECT) ? `cdxml.ts has other changes since ${BASE.slice(0, 8)}` : "";
let oldToCdxml: typeof toCdxml | undefined, oldDir: string | undefined;
if (!why) {
  oldDir = mkdtempSync(join(tmpdir(), "octet-cdxml-base-"));
  execFileSync("tar", ["-x", "-C", oldDir], { input: execFileSync("git", ["archive", BASE, "src", "package.json"], { cwd: root, maxBuffer: 1 << 28 }) });
  symlinkSync(join(root, "node_modules"), join(oldDir, "node_modules"));
  oldToCdxml = (await import(join(oldDir, "src/cdxml.ts"))).toCdxml;
}
process.on("exit", () => { if (oldDir) rmSync(oldDir, { recursive: true, force: true }); });

// A4 and Letter, either way round, a drawing on two pages, and the examples on A4: byte for byte as before.
const same: [string, Mol, DocStyle][] = [];
for (const page of ["A4", "Letter"] as PageName[]) for (const landscape of [false, true]) same.push([`${page}${landscape ? " landscape" : ""}`, labelled(["R", "R1", "X", "L", "Hal", "OAr", "M(0)", "Ar'"]), readStyle({ ...DEFAULT_STYLE, page, landscape })]);
const twoPages = labelled(["R", "L"]);
twoPages.atoms.push({ label: "O", location: [0, -60, 0] }, { label: "N", location: [1, -60, 0] });
same.push(["A4 on two pages", twoPages, A4], ["Custom the size of A4", labelled(["R"]), readStyle({ ...DEFAULT_STYLE, page: "Custom", custom: [210, 297] })]);
for (const id of ["oseltamivir", "suzuki", "epoxidation", "hydrolysis", "threonine", "ibuprofen", "photooxygenation", "aspirin"]) {
  const m = parse(readFileSync(join(root, `src/examples/${id}.json`), "utf8"));
  same.push([`example ${id}`, m, readStyle(m.style)]);
}
for (const [what, m, st] of same) await test(`pages: ${what} is written as before, byte for byte`, () => {
  const xml = toCdxml(m, st);
  assert.doesNotMatch(pageOf(xml), /DrawingSpace|Width=|Height=/);
  if (!oldToCdxml) return skip(`byte check of ${what}`, why);
  assert.equal(xml, oldToCdxml(m, st));
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
    if (!oldToCdxml) return skip("byte check of the experiment", why);
    assert.equal(toCdxml(m, st), oldToCdxml(m, st));
  });

  // ---- ChemDraw 22.2 itself (OCTET_STRESS_CHEMDRAW=1) ----
  if (process.env.OCTET_STRESS_CHEMDRAW !== "1") skip("ChemDraw 22.2 round trip", "set OCTET_STRESS_CHEMDRAW=1");
  else if (!existsSync("/Applications/ChemDraw 22.2.0.app")) skip("ChemDraw 22.2 round trip", "no ChemDraw 22.2");
  else await chemdraw(host);
}

// Every example as Export writes it, an empty poster and the labels: ChemDraw opens each and saves it as CDXML.
async function chemdraw(h: NonNullable<typeof host>) {
  const work = mkdtempSync(join(tmpdir(), "octet-cdcompat-")), saved = join(work, "saved");
  mkdirSync(saved);
  const list: { id: string; name: string }[] = JSON.parse(readFileSync(join(root, "src/examples/examples.json"), "utf8"));
  const files: { name: string; mol: Mol; style: DocStyle }[] = [];
  for (const x of list) {
    const d = h.drawing("quick", x.name);
    d.host.set(parse(readFileSync(join(root, `src/examples/${x.id}.json`), "utf8")));
    writeFileSync(join(work, `octet-${x.id}.cdxml`), d.host.fileText("cdxml")!);
    files.push({ name: `octet-${x.id}.cdxml`, mol: d.host.doc(), style: readStyle(d.host.doc().style) });
  }
  const poster = h.drawing("poster", "Empty poster");
  writeFileSync(join(work, "octet-emptyposter.cdxml"), poster.host.fileText("cdxml")!);
  files.push({ name: "octet-emptyposter.cdxml", mol: poster.host.doc(), style: purposeStyle("poster") });
  const labels = labelled([...CD_GENERIC, ...AS_ELEMENTS, ...KEPT]);
  writeFileSync(join(work, "octet-labels.cdxml"), toCdxml(labels, A4));
  files.push({ name: "octet-labels.cdxml", mol: labels, style: A4 });

  const lock = process.env.OCTET_STRESS_CHEMDRAW_LOCK ?? join(tmpdir(), "chemdraw.lock"), app = "/Applications/ChemDraw 22.2.0.app";
  const running = () => spawnSync("pgrep", ["-f", `${app}/Contents/MacOS`], { encoding: "utf8" }).stdout.trim() !== "";
  const ask = (script: string, ms = 60_000) => spawnSync("osascript", ["-e", `tell application id "com.perkinelmer.ChemDraw.22" to ${script}`], { encoding: "utf8", timeout: ms }).stdout?.trim() ?? "";
  let locked = false;
  for (let k = 0; k < 90 && !locked; k++) {
    try { mkdirSync(lock); locked = true; } catch {
      // A lock older than 45 minutes with no ChemDraw running is stale.
      try { if (Date.now() - statSync(lock).mtimeMs > 45 * 60_000 && !running()) { rmSync(lock, { recursive: true, force: true }); continue; } } catch { /* gone */ }
      spawnSync("sleep", ["30"]);
    }
  }
  if (!locked) { await test("chemdraw: round trip", () => assert.fail("the ChemDraw lock stayed taken for 45 minutes")); return; }
  const started = !running(), opened: string[] = [];
  try {
    for (const f of files) {
      spawnSync("open", ["-g", "-a", app, join(work, f.name)]);
      let open = false;
      for (let k = 0; k < 30 && !(open = ask("get name of every document").split(", ").includes(f.name)); k++) spawnSync("sleep", ["2"]);
      if (!open) { console.log(`cdxmlcompat.check: ChemDraw did not open ${f.name} in a minute (a dialog of its own may be waiting); the rest did not run`); break; }
      opened.push(f.name);
      ask(`save document "${f.name}" in (POSIX file "${join(saved, f.name)}") as "ChemDraw XML"`, 120_000);
      ask(`close document "${f.name}" saving no`);
    }
  } finally {
    if (started && !ask("get name of every document", 15_000)) ask("quit", 30_000);
    rmSync(lock, { recursive: true, force: true });
  }
  for (const f of files) await test(`chemdraw: ${f.name} back from ChemDraw 22.2 keeps its labels and page`, () => {
    const file = join(saved, f.name);
    assert.ok(existsSync(file), opened.includes(f.name) ? "ChemDraw did not save it" : "ChemDraw did not open it");
    const back = fromCdxml(readFileSync(file, "utf8")), texts = (m: Mol) => m.atoms.map((a) => a.text ?? `[${a.label}]`).filter((t) => !/^\[[CHONSPF]\]$|^\[(Cl|Br|B|I|Na|K|Pd|Li|Mg|Si)\]$/.test(t)).sort();
    console.log(`cdxmlcompat.check: ${f.name}: ChemDraw kept ${back.style.page}${back.style.landscape ? " landscape" : ""}${back.style.purpose ? `, ${back.style.purpose}` : ""}; labels ${JSON.stringify(texts(back.mol)).slice(0, 300)}`);
    for (const t of AS_ELEMENTS) if (texts(f.mol).includes(t)) assert.ok(texts(back.mol).includes(t), `${t} came back as ${texts(back.mol).join(" ")}`);
    assert.ok(!texts(back.mol).includes("[Ar]") && !texts(back.mol).includes("[Y]"), "argon or yttrium");
    if (f.name === "octet-labels.cdxml") assert.deepEqual(texts(back.mol), texts(f.mol));
    if (f.style.page === "A0") assert.deepEqual([back.style.page, back.style.purpose], ["A0", "poster"]);
    else assert.equal(back.style.page, "A4");
  });
  rmSync(work, { recursive: true, force: true });
}

if (failed.length) { console.error(`cdxmlcompat.check: ${failed.length} of ${ran} cases failed:\n  ${failed.join("\n  ")}`); process.exit(1); }
console.log(`cdxmlcompat.check: ${ran} cases pass.`);
process.exit(0);
