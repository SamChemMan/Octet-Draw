// Run: node src/annotatefiles.check.ts. Fails loudly if notes (issues 101 and 102, docs/plans/issue-101-102-notes.md)
// stop coming back on their objects through .oct, CDXML and CDX (N2, N3), stop surviving ChemDraw's way of saving
// them, stop being read as hostile input, or start going into a picture, another app's clipboard, an object window or
// a template (N4).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_CONTENT, NOTE, noteCount, noteOf, withNote, withoutNotes, type Target } from "./annotate.ts";
import { fromCdxml, parseXml, toCdxml } from "./cdxml.ts";
import { cdxToXml, xmlToCdx } from "./cdx.ts";
import { layoutCycles } from "./cycle.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { parse, serialize } from "./file.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import type { Mol } from "./render.ts";

// One of each kind that takes a note: texts (free, conditions), arrows (reaction, line, arc, pen curve, orbital,
// membrane), a catalytic cycle, shapes (box, rounded, oval, highlight, brackets, one bracket, TLC plate, gel, plasmid,
// table, picture), a group, and the drawing; ids in the order .oct gives them.
const drawing: Mol = {
  atoms: [{ label: "C", location: [0, 0, 0] }, { label: "O", location: [1, 0, 0] }, { label: "N", location: [30, 0, 0] }], bonds: [{ atoms: [0, 1], type: 1 }],
  captions: [{ id: 1, text: "Free text", x: 0, y: -2 }, { id: 2, text: "THF", x: 3.5, y: 0.5, on: { arrow: 3, side: "above" } }],
  arrows: [
    { id: 3, kind: "reaction", from: [2, 0], to: [5, 0] },
    { id: 4, kind: "line", from: [2, -4], to: [5, -4] },
    { id: 5, kind: "arc", from: [2, -6], to: [5, -6], bend: 0.2 },
    { id: 6, kind: "curve", from: [2, -8], to: [5, -9], curve: { points: [{ at: [2, -8] }, { at: [3, -7], c1: [2.5, -7], c2: [3.5, -7] }, { at: [5, -9] }] } },
    { id: 7, kind: "orbital", from: [8, -8], to: [9, -7], orbital: { shape: "p", phase: "shaded" } },
    { id: 8, kind: "line", from: [2, -11], to: [6, -11], style: "membrane" },
  ],
  shapes: [
    { id: 10, kind: "box", from: [6, 1], to: [8, -1] },
    { id: 11, kind: "rounded", from: [9, 1], to: [11, -1] },
    { id: 12, kind: "oval", from: [12, 1], to: [14, -1] },
    { id: 13, kind: "highlight", from: [15, 1], to: [17, -1] },
    { id: 14, kind: "brackets", from: [18, 1], to: [20, -1] },
    { id: 15, kind: "parens", from: [21, 1], to: [22, -1], side: "left" },
    { id: 16, kind: "tlc", from: [6, -3], to: [8, -7], tlc: { lanes: 2, spots: [{ lane: 0, rf: 0.5 }] } },
    { id: 17, kind: "gel", from: [9, -3], to: [12, -7], tlc: { lanes: 2, names: ["M", "WT"], range: [10, 1000], spots: [{ lane: 1, rf: 0.5 }] } },
    { id: 18, kind: "plasmid", from: [13, -3], to: [17, -7], plasmid: { bp: 2686, name: "pUC19", regions: [{ start: 1626, end: 2486, name: "AmpR" }], markers: [{ at: 396, name: "EcoRI" }] } },
    { id: 19, kind: "table", from: [18, -3], to: [22, -5], table: { cells: [["Entry", "Yield"], ["1", "85%"]] } },
    { id: 20, kind: "picture", from: [23, -3], to: [25, -5], picture: { PNG: "89504E470D0A1A0A" } },
  ],
  cycles: [{ id: 9, centre: [0, -20], radius: 3, clockwise: true, nodes: [[], [], []], at: [Math.PI / 2, -Math.PI / 6, (7 * Math.PI) / 6] }],
  groups: [{ id: 21, atoms: [0, 1], items: [10, 11] }],
  annotations: [{ keyword: "Title", content: "Route 2" }],
};
// Text that has to survive every form: line breaks, emoji, Arabic, and the characters XML and CDATA care about.
const HARD = "Entry 7, batch 2\nسلام 😀 ]]> <annotation Keyword=\"x\"/> & 'quotes'";
const ids: Target[] = ["drawing", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
const noted = ids.reduce((m, t) => withNote(m, [t], `${t}: ${HARD}`), drawing);
const derived = layoutCycles(noted, 30, 1, () => undefined).arrows;
const each = (m: Mol, why: string, only = ids) => { for (const t of only) assert.equal(noteOf(m, t), `${t}: ${HARD}`, `${why}: the note on ${t}`); };
const notesIn = (xml: string) => [...xml.matchAll(/<annotation\s+Keyword="([^"]*)"\s+Content="([^"]*)"/g)].filter((x) => x[1] === NOTE).length;

// N2: .oct keeps every note; a bad notes list makes the file damaged; a drawing over 10,000 notes keeps 10,000.
{
  const back = parse(serialize(noted));
  each(back, ".oct");
  assert.equal(noteCount(back), noteCount(noted));
  const json = JSON.parse(serialize(noted));
  for (const bad of [{ notes: "x" }, { notes: [{ keyword: "Note", content: "a\tb" }] }, { notes: [{ keyword: "Note", content: "x".repeat(MAX_CONTENT + 1) }] }, { notes: [{ keyword: "k".repeat(201), content: "x" }] }, { notes: Array.from({ length: 1001 }, () => ({ keyword: "Note", content: "x" })) }]) {
    const copy = structuredClone(json);
    Object.assign(copy.arrows[0], bad);
    assert.throws(() => parse(JSON.stringify(copy)), /This drawing is damaged\./, JSON.stringify(bad).slice(0, 60));
  }
  const many = structuredClone(json);
  many.shapes.forEach((x: Record<string, unknown>, k: number) => { if (k < 11) x.notes = Array.from({ length: 1000 }, () => ({ keyword: "Note", content: "x" })); });
  // More than 10,000 (a drawing pasted into twice, saved): it opens with the first 10,000.
  assert.equal(noteCount(parse(JSON.stringify(many))), 10_000, "more than 10,000 notes: the first 10,000");
  // The file's own JSON in .oct and .cdx.
  each(readOct(writeOct(noted, DEFAULT_STYLE, { derived })).mol, ".oct file");
  each(readCdx(writeCdx(noted, DEFAULT_STYLE, { derived })).mol, ".cdx file");
}

// N3: CDXML and CDX: each note is an annotation in its object's element, read back on the object.
const xml = toCdxml(noted, DEFAULT_STYLE, { derived });
{
  // Octet's own file: every note back, ids and all (the CDXML part alone, as when the JSON is damaged).
  const back = fromCdxml(xml);
  each(back.mol, "CDXML");
  assert.deepEqual(back.lost, {});
  each(fromCdxml(cdxToXml(xmlToCdx(parseXml(xml)))).mol, "CDX");
  // An arrow's note is in its arrow, not in its older graphic too; a pair of brackets' in its first bracket.
  const arrowXml = [...xml.matchAll(/<arrow\n[^>]*>((?:(?!<\/arrow>).)*)<\/arrow>/gs)].map((x) => x[1]);
  assert.ok(arrowXml.some((x) => x.includes("3: Entry 7")), "the arrow holds its note");
  assert.ok(![...xml.matchAll(/<graphic\n[^>]*SupersededBy[^>]*>((?:(?!<\/graphic>).)*)<\/graphic>/gs)].some((x) => x[1].includes("<annotation")), "never the older graphic");
  // The page holds the drawing's note and its title; each object its own. One each, no more.
  assert.equal(notesIn(xml), ids.length);
  // A line break is &#10; in the attribute, so any reader keeps it.
  assert.ok(xml.includes("batch 2&#10;"));
}

// N3, as ChemDraw saves Octet's file (17 November 2026, ChemDraw 22.2): Octet's attributes and comment gone, each
// group's annotation also on the page, an arrow's in its older graphic too, line breaks raw. Every note on its object,
// the cycle's on its first arc (now a plain arrow), no doubles.
{
  let chemdraw = xml.replace(/\n Octet="[^"]*"/g, "").replace(/&#10;/g, "\n");
  const groupNote = `<annotation\n Keyword="Note"\n Content="21: ${HARD.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")}"\n/>`;
  chemdraw = chemdraw.replace(/<\/page>/, `${groupNote}</page>`);
  chemdraw = chemdraw.replace(/(<graphic\n[^>]*SupersededBy[^>]*?)\n\/>/, (_, head) => `${head}\n>${groupNote.replace("21:", "3:")}</graphic>`);
  const read = fromCdxml(chemdraw), m = read.mol;
  const texts = (m.captions ?? []).filter((c) => noteOf(m, c.id)).map((c) => noteOf(m, c.id));
  assert.ok(texts.includes(`1: ${HARD}`) && texts.includes(`2: ${HARD}`), "texts");
  const all = [...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.groups ?? [])].map((x) => noteOf(m, x.id)).filter(Boolean);
  for (const t of ids.filter((x) => x !== "drawing")) assert.equal(all.filter((v) => v === `${t}: ${HARD}`).length, 1, `ChemDraw's file: the note on ${t}, once`);
  assert.equal(noteOf(m, "drawing"), `drawing: ${HARD}`, "the drawing's own note stays; the group's copy is left out");
  assert.equal(m.annotations!.filter((a) => a.keyword === NOTE).length, 1);
}

// N3 reading rules: atom and bond annotations, a group of one, too many, too long; an annotation in an annotation.
{
  const page = (inner: string) => `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1">${inner}</page></CDXML>`;
  const note = (c: string, k = "Note") => `<annotation Keyword="${k}" Content="${c}"/>`;
  const frag = `<fragment id="2"><n id="3" p="10 10">${note("atom")}</n><n id="4" p="24 10"/><b id="5" B="3" E="4">${note("bond")}</b></fragment>`;
  const r1 = fromCdxml(page(frag));
  assert.equal(r1.lost.annotation, 2, "an atom's and a bond's notes are counted as left out");
  // A text ChemDraw has read as an atom label takes its note into the label: counted too (ChemDraw 22.2, 17 November).
  const r1b = fromCdxml(page(`<fragment id="2"><n id="3" p="10 10" NodeType="Fragment"><t p="8 14"><s>THF</s>${note("on the text")}</t></n></fragment>`));
  assert.equal(r1b.lost.annotation, 1);
  const r2 = fromCdxml(page(`<group id="6"><t id="7" p="10 10"><s>A</s></t>${note("one")}</group>`));
  assert.equal(r2.lost.annotation, 1, "a group of one goes with its note, counted");
  const r3 = fromCdxml(page(`<t id="7" p="10 10"><s>A</s>${note("x".repeat(MAX_CONTENT + 1))}${note("ok", "k".repeat(201))}${note("ok")}</t>`));
  assert.equal(r3.lost.annotation, 2);
  assert.equal(noteOf(r3.mol, r3.mol.captions![0].id), "ok");
  const r4 = fromCdxml(page(`<t id="7" p="10 10"><s>A</s><annotation Keyword="Note" Content="outer"><annotation Keyword="Note" Content="inner"/></annotation></t>`));
  assert.equal(noteOf(r4.mol, r4.mol.captions![0].id), "outer");
  // ChemDraw's raw line breaks (and a CR LF) are line breaks; a tab is a space; other control characters go.
  const r5 = fromCdxml(page(`<t id="7" p="10 10"><s>A</s><annotation Keyword="Note" Content="one\r\ntwo\tthree\u0007"/></t>`));
  assert.equal(noteOf(r5.mol, r5.mol.captions![0].id), "one\ntwo three");
  // 1000 on one object, 10,000 in the file: the rest are counted. No hang.
  const thousand = Array.from({ length: 1005 }, () => note("n")).join("");
  const r6 = fromCdxml(page(`<t id="7" p="10 10"><s>A</s>${thousand}</t>`));
  assert.equal(r6.mol.captions![0].notes!.length, 1000);
  assert.equal(r6.lost.annotation, 5);
  const texts = Array.from({ length: 11 }, (_, k) => `<t id="${10 + k}" p="${10 + 30 * k} 10"><s>T${k}</s>${Array.from({ length: 1000 }, () => note("n")).join("")}</t>`).join("");
  const t0 = performance.now(), r7 = fromCdxml(page(texts));
  assert.equal(noteCount(r7.mol), 10_000);
  assert.equal(r7.lost.annotation, 1000);
  assert.ok(performance.now() - t0 < 5000, "11,000 annotations read in time");
  // A keyword of 1 MB and a Content of 20 MB: refused, not held.
  const r8 = fromCdxml(page(`<t id="7" p="10 10"><s>A</s>${note("ok", "k".repeat(1 << 20))}${note("c".repeat(20 << 20))}</t>`));
  assert.equal(r8.lost.annotation, 2);
  assert.equal(r8.mol.captions![0].notes, undefined);
}

// N4: no notes in a picture's CDXML, on another app's clipboard, in an object window or a template. withoutNotes is
// what each of those writes from; the CDXML Export writes for a drawing file keeps them.
{
  const bare = toCdxml(withoutNotes(noted), DEFAULT_STYLE, { derived });
  assert.equal(notesIn(bare), 0, "a picture's CDXML: no note");
  assert.ok(bare.includes('Keyword="Title"'), "the title stays (a PDF's document information)");
  assert.ok(!bare.includes("Entry 7"));
  assert.equal(notesIn(xml), ids.length, "a CDXML file: every note");
  // Octet's own clipboard form keeps them (pasted into another Octet window).
  each(parse(serialize(noted)), "Octet's clipboard");
  // The editor makes every picture, clipboard type, object and template from withoutNotes.
  const editor = readFileSync(new URL("./Editor.tsx", import.meta.url), "utf8");
  const part = (start: string, end: string) => { const a = editor.indexOf(start); assert.ok(a >= 0, start); return editor.slice(a, editor.indexOf(end, a)); };
  assert.match(part("const exportRequest = ", "async function exportPart"), /PICTURES\.includes\(f\.format\) \|\| f\.format === "bmp" \? withoutNotes\(all\) : all/, "Export, Quick export, the MCP and --convert");
  const copy = part("const copyOut = ", "const onCut = ");
  assert.match(copy, /bare = withoutNotes\(part\)/);
  assert.ok(!/formatOf\(part,|pictureOf\(part\)/.test(copy), "every other app's type is made from bare");
  assert.match(copy, /octetJson = serialize\(\{ \.\.\.part, style \}\)/, "Octet's own type keeps them");
  assert.match(part("const officeUpdate = ", "const officeClose"), /bare = withoutNotes\(sent\)[\s\S]*pictureOf\(bare\)[\s\S]*formatOf\(bare, "cdxml"\)/, "Update sends none");
  // What the object window keeps for Word, PowerPoint, Excel or LibreOffice while the user draws: the first picture
  // (officePrime) and each change (officeKeep). On the Mac the object is that picture and its CDXML; on Windows the
  // .oct file too. A note pasted into the window goes into none of them.
  assert.match(part("const officePrime = useRef(false);", "const officeKept = "), /bare = withoutNotes\(doc\), svg = pictureOf\(bare\)[\s\S]*formatOf\(bare, "cdxml"\)/, "officePrime");
  assert.match(part("officeKeep.current = () => {", "const officeClosed = "), /bare = withoutNotes\(doc\), oct = mainDirty \? writeOct\(\{ \.\.\.bare, guides \}[\s\S]*pictureOf\(bare\) \?\? BLANK_SVG, cdxml: formatOf\(bare, "cdxml"\)/, "officeKeep");
  for (const sent of editor.match(/invoke\("ole_update", \{[^}]*\}/g) ?? []) assert.doesNotMatch(sent, /\((doc|sent)\b/, "every ole_update sends a drawing with no notes");
  const windowsObject = writeOct(withoutNotes(noted), DEFAULT_STYLE, { derived }), macObject = toCdxml(withoutNotes(noted), DEFAULT_STYLE, { derived });
  for (const object of [windowsObject, macObject]) assert.ok(!object.includes("batch 2"), "an Office object carries no note");
  assert.equal(noteCount(readOct(windowsObject).mol), 1, "only the title");
  // Copy As CDXML Text is text for another app: none either.
  assert.match(part("const copyAs = ", "const [name, write]"), /formatOf\(withoutNotes\(part\), "cdxml"\)/);
  assert.match(editor, /load\(undefined, s\.oct, undefined, undefined, true\)/, "an object opens with none");
  assert.match(part("function addOwnTemplate(", "function removeRingTemplate"), /newTemplate\(name, withoutNotes\(mol\)\)/, "Add to templates");
  assert.equal(editor.match(/serialize\(templateOf\(withoutNotes\(doc\)\)\)/g)?.length, 2, "a purpose template from the drawing");
  // The page and every picture are drawn by render.ts and export.ts, which never read a note; print shows only those
  // pictures (editor.css @media print).
  for (const file of ["render.ts", "export.ts"]) assert.doesNotMatch(readFileSync(new URL(`./${file}`, import.meta.url), "utf8"), /\.notes\b|\.annotations\b/, `${file} draws no note`);
  assert.match(readFileSync(new URL("./editor.css", import.meta.url), "utf8"), /@media print \{\n  body > :not\(\.print-root\) \{\n    display: none !important;/);
}

console.log("annotatefiles: all checks pass");
