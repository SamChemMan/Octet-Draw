// Run: node src/notes-stress.check.ts. Stress cases for notes on the drawing and on each object (issues 101 and 102),
// written to break them: every case of the plan's stress list (docs/plans/issue-101-102-notes.md, S1 to S30) and more
// of our own (N1 on) for what release 1.1.3 has besides: free symbols, Jablonski diagrams, the document's comment,
// LibreOffice object windows, Copy As CDXML Text, live values and the reagent table. Each case runs on its own and the
// check lists every case that fails, so one failure does not hide the next. The AI apps' tools run on Octet with no
// window (scripts/headless), as the window runs them.
//
// Cases that need the app, ChemDraw or another system check here what decides them (the data, and the source that
// makes it) and say what was run by hand. With OCTET_112 set to the src folder of a 1.1.2 tree (v1.1.2), the cases
// marked 1.1.2 also run Octet 1.1.2's own readers on the files this version writes. With OCTET_BASE set to the src
// folder of the release without this item, S18 and S19 time this version against it.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("notes-stress: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const chem = await import("./chem.ts");
const { allNotes, capNotes, cleanNote, isNote, MAX_ANNOTATIONS, MAX_CONTENT, MAX_NOTES, NOTE, noteCount, noteOf, noteTargets, withNote, withoutNotes } = await import("./annotate.ts");
const { deleteChosen, deleteGraphics, duplicateSelection, extractSelection, groupSelection, insertMol, transformParts, ungroupSelection } = await import("./edit.ts");
const { history } = await import("./history.ts");
const { parse, serialize } = await import("./file.ts");
const { fromCdxml, parseXml, toCdxml } = await import("./cdxml.ts");
const { cdxToXml, xmlToCdx } = await import("./cdx.ts");
const { readCdx, readOct, writeCdx, writeOct } = await import("./oct.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const { layoutCycles } = await import("./cycle.ts");
const { COMMENT, FIELDS, PROPERTIES, detailsOf, templateOf, withDetails } = await import("./experiment.ts");
const { newTemplate } = await import("./templates.ts");
const { freeSymbol } = await import("./render.ts");
const { nounOf } = await import("./access.ts");
const { liveValues } = await import("./proprows.ts");
const { placePlot, reframe, replot } = await import("./pageplot.ts");
const { NEW_JABLONSKI } = await import("./charts.ts");
const { widthOf } = await import("./arial.ts");
type Mol = import("./render.ts").Mol;
type History = import("./history.ts").History;
type PlotEnv = import("./pageplot.ts").PlotEnv;
type JablonskiChart = import("./charts.ts").JablonskiChart;
await load();

const cases: [string, () => unknown][] = [];
const it = (name: string, run: () => unknown) => cases.push([name, run]);
const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
// A part of a source file: from the first start to the next end after it.
const part = (file: string, start: string, end: string) => { const s = src(file), a = s.indexOf(start); assert.ok(a >= 0, `${file}: ${start}`); const b = s.indexOf(end, a + start.length); assert.ok(b > a, `${file}: ${end}`); return s.slice(a, b); };

// A drawing with one of each kind that takes a note: text 1, conditions 2 on arrow 3, a cycle 4, a box 5, a TLC plate
// 6, free symbols (a plus 7, a radical 8, a δ+ 9, a 2⊕ 10), and group 11 of the text and the box; ethanol. Its ids are
// in the order .oct gives them, so a file read back has the same ones.
const base = (): Mol => ({
  atoms: [{ label: "C", location: [0, 0, 0] }, { label: "C", location: [0.87, 0.5, 0] }, { label: "O", location: [1.73, 0, 0] }], bonds: [{ atoms: [0, 1], type: 1 }, { atoms: [1, 2], type: 1 }],
  captions: [{ id: 1, text: "Entry 7", x: 0, y: -2 }, { id: 2, text: "THF", x: 4.5, y: 0.5, on: { arrow: 3, side: "above" } }],
  arrows: [{ id: 3, kind: "reaction", from: [3, 0], to: [6, 0] }],
  shapes: [
    { id: 5, kind: "box", from: [8, 1], to: [10, -1] },
    { id: 6, kind: "tlc", from: [12, 2], to: [14, -2], tlc: { lanes: 2, spots: [{ lane: 0, rf: 0.5 }] } },
    { id: 7, ...freeSymbol("plus", [16, 0], 0.7) }, { id: 8, ...freeSymbol("radical", [18, 0], 0.7) },
    { id: 9, ...freeSymbol("partialPlus", [20, 0], 0.7) }, { id: 10, ...freeSymbol("circledPlus", [22, 0], 0.7, 2) },
  ],
  cycles: [{ id: 4, centre: [0, -10], radius: 2, clockwise: true, nodes: [[], [], []], at: [Math.PI / 2, -Math.PI / 6, (7 * Math.PI) / 6] }],
  groups: [{ id: 11, atoms: [], items: [1, 5] }],
  annotations: [{ keyword: "Title", content: "Route 2" }],
});
const IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const noteAll = (m: Mol, text = (t: number | "drawing") => `${t}: note`) => [...IDS, "drawing" as const].reduce((x, t) => withNote(x, [t], text(t)), m);
const derivedOf = (m: Mol) => layoutCycles(m, 30, 1, () => undefined).arrows;
const files = (m: Mol): [string, Mol][] => {
  const derived = derivedOf(m), xml = toCdxml(m, DEFAULT_STYLE, { derived });
  return [[".oct JSON", parse(serialize(m))], ["CDXML", fromCdxml(xml).mol], ["CDX", fromCdxml(cdxToXml(xmlToCdx(parseXml(xml)))).mol],
    [".oct file", readOct(writeOct(m, DEFAULT_STYLE, { derived })).mol], [".oct file's CDXML alone", readOct(writeOct(m, DEFAULT_STYLE, { derived }).replace(/<!--Octet[^]*$/, "")).mol],
    [".cdx file", readCdx(writeCdx(m, DEFAULT_STYLE, { derived })).mol]];
};
// Every note's text in a drawing, by object kind and order (ids change when a file is not Octet's own).
const texts = (m: Mol) => [...allNotes(m).map((r) => r.text)].sort();
const HARD = "Entry 7, batch 2\nسلام 😀 ]]> <annotation Keyword=\"x\"/> & 'quotes'";
const old = process.env.OCTET_112 ? new URL(`file://${process.env.OCTET_112.replace(/\/?$/, "/")}`) : undefined;
const baseTree = process.env.OCTET_BASE ? new URL(`file://${process.env.OCTET_BASE.replace(/\/?$/, "/")}`) : undefined;
const time = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t; };
const median = (l: number[]) => [...l].sort((p, q) => p - q)[l.length >> 1];

// A drawing with no window, its tools called as an AI app calls them.
let d = drawing("paper", "Stress"), n = 0;
const call = async (name: string, args: unknown, s = "stress") => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Stress", s))).result as { content: { text: string }[]; isError?: true };
const text = (o: { content: { text: string }[] }) => o.content[0].text;
const put = (m: Mol) => { d = drawing("paper", "Stress"); d.host.begin(); d.host.set(m); d.host.end(); };
const doc = () => d.host.doc();
const edit = (args: Record<string, unknown>, s?: string) => call("change", { operations: [{ op: "edit", ...args }] }, s);

// ---------------------------------------------------------------------------------------------------------------------
// The plan's stress list.

it("S1 a note of only spaces and new lines is no note; clearing one takes it off as one undo step", () => {
  const m = base();
  assert.equal(withNote(m, [3], " \n\t\n  "), m);
  const set = withNote(m, [3], "x"), cleared = withNote(set, [3], "\n  \n");
  assert.equal("notes" in cleared.arrows![0], false);
  let h: History = { stack: [m], at: 0 };
  h = history(h, { type: "set", mol: set });
  h = history(h, { type: "set", mol: cleared });
  assert.equal(h.stack.length, 3);
  h = history(h, { type: "undo" });
  assert.equal(noteOf(h.stack[h.at], 3), "x");
});

it("S2 10,000 characters kept; 1 MB pasted keeps the first 10,000; the field takes 10,000; an AI app's 10,001 is refused", async () => {
  assert.equal(cleanNote("y".repeat(MAX_CONTENT)).length, MAX_CONTENT);
  assert.equal(cleanNote("y".repeat(1 << 20)), "y".repeat(MAX_CONTENT));
  assert.equal(noteOf(withNote(base(), [1], "z".repeat(1 << 20)), 1).length, MAX_CONTENT);
  // The note field is TextField with lines and no max of its own: 10,000.
  assert.match(src("Fields.tsx"), /max = lines \? 10_000 : 200/);
  assert.doesNotMatch(part("Notes.tsx", "<TextField", "/>"), /max=/);
  put(base());
  const o = await edit({ ids: ["t1"], note: "x".repeat(MAX_CONTENT + 1) });
  assert.ok(o.isError, "10,001 characters refused");
  assert.match(text(o), /10,?000/);
  assert.equal(noteOf(doc(), 1), "");
});

it("S3 tabs, CR LF, NUL, a lone surrogate, emoji, Arabic, ]]>, <annotation, quotes and &: cleaned, escaped, the same in every round trip", () => {
  const raw = "a\tb\r\nc\u0000d\ud800e 😀 سلام ]]> <annotation Keyword=\"k\"/> & 'q' \"w\"";
  const m = withNote(base(), [1, 3, 4, 6, 9, 10, 11, "drawing"], raw), clean = noteOf(m, 1);
  assert.equal(clean, "a b\ncde 😀 سلام ]]> <annotation Keyword=\"k\"/> & 'q' \"w\"");
  for (const [how, back] of files(m)) for (const t of [1, 3, 4, 6, 9, 10, 11, "drawing"] as const) assert.equal(noteOf(back, t), clean, `${how}: ${t}`);
  // What Octet 1.1.2 calls damaged in an annotation (a control character other than a line feed) is never written.
  assert.ok(!/[\u0000-\u0009\u000b-\u001f\u007f]/.test(serialize(m)));
});

it("S4 a ChemDraw page with 1000 annotations, then a note typed: not added, with the notice", () => {
  const full: Mol = { ...base(), annotations: Array.from({ length: MAX_ANNOTATIONS }, (_, k) => ({ keyword: `Other ${k}`, content: "x" })) };
  assert.throws(() => withNote(full, ["drawing"], "mine"), { message: "This drawing has 1000 annotations, the most Octet keeps." });
  // The panel shows the reason as a notice and changes nothing (Editor noteActs).
  assert.match(part("Editor.tsx", "noteActs.current = {", "row: (id)"), /catch \(e\) \{ setNotice\(e instanceof Error \? e\.message : String\(e\)\); \}/);
});

it("S5 add a note, change it, delete its object; Undo three times and Redo three times: each state exactly", () => {
  const s0 = base(), s1 = withNote(s0, [9], "first"), s2 = withNote(s1, [9], "second"), s3 = deleteGraphics(s2, new Set([9]));
  let h: History = { stack: [s0], at: 0 };
  for (const m of [s1, s2, s3]) h = history(h, { type: "set", mol: m });
  const seen: string[] = [];
  for (let k = 0; k < 3; k++) { h = history(h, { type: "undo" }); seen.push(noteOf(h.stack[h.at], 9)); }
  for (let k = 0; k < 3; k++) { h = history(h, { type: "redo" }); seen.push(noteOf(h.stack[h.at], 9)); }
  assert.deepEqual(seen, ["second", "first", "", "first", "second", ""]);
  assert.equal(h.stack[h.at], s3);
});

it("S6 type in one arrow's note, then pick another arrow: the text goes on the first", () => {
  // The field is made again for other targets (its key), and the field that goes uses what was typed on the targets
  // it was opened for (TextField's last onChange, which names them).
  const notes = src("Notes.tsx"), field = src("Fields.tsx");
  assert.match(notes, /<TextField key=\{f\.targets\.join\(" "\)\}/);
  assert.match(notes, /onChange=\{\(text\) => onNote\(f\.targets, f\.keyword, f\.nth, text\)\}/);
  assert.match(field, /useEffect\(\(\) => \(\) => \{ const l = latest\.current; if \(typed\.current\) \{ l\.onChange\(l\.text\); l\.onTyped\?\.\(false\); \} \}, \[\]\);/);
  const two: Mol = { ...base(), arrows: [...base().arrows!, { id: 20, kind: "reaction", from: [3, -3], to: [6, -3] }] };
  const after = withNote(two, [3], "on the first");
  assert.equal(noteOf(after, 3), "on the first");
  assert.equal(noteOf(after, 20), "");
});

it("S7 the object is deleted (an undo or an AI app) while its note is typed: nothing goes on another object, no error", () => {
  const m = deleteGraphics(base(), new Set([3]));
  assert.equal(withNote(m, [3], "typed"), m);
  // The panel's note works on the drawing as it is then (now.current), not the one the field opened on.
  assert.match(part("Editor.tsx", "noteActs.current = {", "row: (id)"), /withNote\(now\.current, targets, text, keyword, nth\)/);
});

it("S8 an AI app changes a note while its field is open and nothing was typed: the AI app's note stays", () => {
  const field = src("Fields.tsx");
  // Leaving the field uses its text only when something was typed; else it shows the value from outside.
  assert.match(field, /onBlur: \(\) => \{ focused\.current = false; if \(typed\.current\) \{ typed\.current = false; onTyped\?\.\(false\); if \(text !== value\) onChange\(text\); \} else if \(text !== value\) setText\(value\); \}/);
  assert.match(field, /onChange: \(e: React\.ChangeEvent<HTMLInputElement \| HTMLTextAreaElement>\) => \{ if \(!typed\.current\) onTyped\?\.\(true\); typed\.current = true;/);
});

it("S9 copy and paste in one window, between two windows, and Cut then Paste: the notes come with the objects", () => {
  const m = noteAll(base()), atoms = new Set([0, 1, 2]), items = new Set(IDS.filter((t) => t !== 11));
  const clip = extractSelection(m, atoms, items);
  for (const t of IDS) assert.equal(noteOf(clip, t), `${t}: note`, `copied: ${t}`);
  // Another window reads Octet's own clipboard form (serialize, then parse).
  const other = parse(serialize(clip));
  const into = insertMol({ atoms: [], bonds: [] }, other, [0, 0]);
  for (const t of IDS) assert.equal(noteOf(into.mol, into.ids.get(t)!), `${t}: note`, `second window: ${t}`);
  const same = insertMol(m, clip, [30, 0]);
  for (const t of IDS) assert.equal(noteOf(same.mol, same.ids.get(t)!), `${t}: note`, `this window: ${t}`);
  const cut = deleteChosen(m, atoms, items), back = insertMol(cut, clip, [0, 0]);
  assert.equal(noteCount(cut), 1 + 1, "Cut leaves the drawing's title and note");
  assert.deepEqual(texts(back.mol), texts(m), "Cut then Paste: every note back");
  // Option-drag.
  const dup = duplicateSelection(m, new Set(), new Set([9, 10]));
  assert.equal(noteOf(dup.mol, dup.ids.get(9)!), "9: note");
  assert.equal(noteOf(dup.mol, dup.ids.get(10)!), "10: note");
});

it("S10 copy into Word (Mac, Windows, Linux), copy back into Octet, Edit Picture from Word: no note anywhere", () => {
  const m = noteAll(base(), () => HARD), bare = withoutNotes(m), derived = derivedOf(m);
  // The picture's CDXML (Mac PDF, Windows EMF, Linux PNG), the clipboard's CDXML and CDX, and Windows' Office object.
  for (const [how, out] of [["CDXML", toCdxml(bare, DEFAULT_STYLE, { derived })], ["Office object (.oct)", writeOct(bare, DEFAULT_STYLE, { derived })], ["CDX", Buffer.from(writeCdx(bare, DEFAULT_STYLE, { derived })).toString("latin1")]] as const)
    assert.ok(!out.includes("batch 2"), `${how} has no note`);
  // Copied back into Octet: its CDXML reads with no note.
  assert.equal(allNotes(fromCdxml(toCdxml(bare, DEFAULT_STYLE, { derived })).mol).length, 0);
  // Every type for another app is made from bare; the object window opens with none and offers no Annotate.
  const copy = part("Editor.tsx", "const copyOut = ", "const onCut = ");
  assert.ok(!/formatOf\(part,|pictureOf\(part\)/.test(copy));
  assert.match(copy, /oct: ask\(object, "oct"\)/, "Windows' Office object from bare (ask)");
  assert.match(src("Editor.tsx"), /load\(undefined, s\.oct, undefined, undefined, true\)/);
  assert.match(src("../src-tauri/src/main.rs"), /if !notes_here \{\n\s*view\.remove\(&notes\)\?;\n\s*object\.remove\(&annotate\)\?;/);
  assert.match(src("Editor.tsx"), /\.\.\.\(office \? \{\} : \{ notes: \[/, "the palette offers neither in an object window");
});

it("S11 paste from ChemDraw (CDXML and CDX) with annotations on a text, an arrow and a group: each comes with its object, the page's do not join", () => {
  const note = (c: string) => `<annotation Keyword="Note" Content="${c}"/>`;
  const xml = `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><group id="2"><t id="3" p="10 10"><s>A</s>${note("text")}</t><t id="4" p="40 10"><s>B</s></t>${note("group")}</group>`
    + `<arrow id="5" Head3D="100 20 0" Tail3D="60 20 0" ArrowheadHead="Full">${note("arrow")}</arrow>${note("page")}${note("group")}</page></CDXML>`;
  for (const [how, read] of [["CDXML", fromCdxml(xml)], ["CDX", fromCdxml(cdxToXml(xmlToCdx(parseXml(xml))))]] as const) {
    const m = read.mol, c = m.captions!.find((x) => x.text === "A")!, a = m.arrows![0], g = m.groups![0];
    assert.deepEqual([noteOf(m, c.id), noteOf(m, a.id), noteOf(m, g.id)], ["text", "arrow", "group"], how);
    assert.equal(noteOf(m, "drawing"), "page", `${how}: ChemDraw's copy of the group's note is left out`);
    const mine = withNote(base(), ["drawing"], "mine"), pasted = insertMol(mine, m, [0, -20]).mol;
    assert.equal(noteOf(pasted, "drawing"), "mine", `${how}: a paste keeps this drawing's own notes (ChemDraw 23.1)`);
    assert.ok(allNotes(pasted).some((r) => r.text === "arrow"));
  }
});

it("S12 .oct, CDXML and CDX: open each, then as ChemDraw 22.2 saves it again: every note on its object, no doubles", () => {
  const m = noteAll(base(), (t) => `${t}: ${HARD}`);
  for (const [how, back] of files(m)) assert.deepEqual(texts(back), texts(m), how);
  // ChemDraw's save (17 November 2026, ChemDraw 22.2): Octet's data and comment gone, the group's annotation also on the
  // page, line breaks raw.
  const xml = toCdxml(m, DEFAULT_STYLE, { derived: derivedOf(m) });
  let theirs = xml.replace(/\n Octet="[^"]*"/g, "").replace(/&#10;/g, "\n");
  theirs = theirs.replace("</page>", `<annotation Keyword="Note" Content="${`11: ${HARD}`.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}"/></page>`);
  for (const r of [fromCdxml(theirs), fromCdxml(cdxToXml(xmlToCdx(parseXml(theirs))))]) {
    const got = texts(r.mol);
    for (const t of [1, 3, 4, 6, 11, "drawing"] as const) assert.equal(got.filter((x) => x === `${t}: ${HARD}`).length, 1, `ChemDraw's save: ${t} once`);
  }
});

it("S13 1.1.2: Octet 1.1.2 opens the .oct, .cdx and .cdxml with a note on every kind, with the drawing's note", async () => {
  const m = noteAll(base()), derived = derivedOf(m);
  if (!old) {
    // Without a 1.1.2 tree: what 1.1.2 reads is written as 1.1.2 checks it (keyword and content pairs, no tab or CR).
    const json = JSON.parse(serialize(m));
    for (const a of [...json.annotations, ...json.groups.flatMap((g: { annotations?: unknown[] }) => g.annotations ?? [])] as { keyword: string; content: string }[]) assert.ok(typeof a.keyword === "string" && !/[\u0000-\u0009\u000b-\u001f]/.test(a.content));
    return;
  }
  const file112 = await import(new URL("file.ts", old).href), oct112 = await import(new URL("oct.ts", old).href), cdxml112 = await import(new URL("cdxml.ts", old).href);
  // Octet's own clipboard form (the JSON alone) from a drawing with no free symbol: 1.1.2 has no free symbols (issue
  // 164), and calls their JSON damaged, notes or not. The files read their CDXML part then.
  const plain = deleteGraphics(m, new Set([7, 8, 9, 10]));
  const read = [file112.parse(serialize(plain)), oct112.readOct(writeOct(m, DEFAULT_STYLE, { derived })).mol, oct112.readCdx(writeCdx(m, DEFAULT_STYLE, { derived })).mol, cdxml112.fromCdxml(toCdxml(m, DEFAULT_STYLE, { derived })).mol] as Mol[];
  for (const r of read) {
    assert.ok(r.annotations?.some((a) => a.keyword === NOTE && a.content === "drawing: note"), "1.1.2 keeps the drawing's note");
    assert.equal(r.atoms.length, 3);
  }
  assert.equal(file112.parse(serialize(plain)).groups[0].annotations[0].content, "11: note", "and the group's");
});

it("S14 a group whose members are deleted until one is left, and Ungroup a group with a note: both go; Undo brings them back", () => {
  const m = withNote(base(), [11], "group note");
  const one = deleteGraphics(m, new Set([5]));
  assert.equal(one.groups?.length ?? 0, 0);
  assert.equal(noteOf(ungroupSelection(m, new Set(), new Set([1, 5])), 11), "");
  let h: History = { stack: [m], at: 0 };
  h = history(h, { type: "set", mol: one });
  h = history(h, { type: "undo" });
  assert.equal(noteOf(h.stack[h.at], 11), "group note");
});

it("S15 turn, flip, scale, align and nudge texts, arrows, shapes, symbols, cycles and groups: the notes do not change", () => {
  const m = noteAll(base()), atoms = new Set([0, 1, 2]), items = new Set<number>(IDS);
  for (const [how, f, size, mirror] of [["nudge", (q: [number, number]) => [q[0] + 0.07, q[1]], undefined, undefined], ["turn", (q: [number, number]) => [-q[1], q[0]], undefined, undefined], ["flip", (q: [number, number]) => [-q[0], q[1]], undefined, "across"], ["scale", (q: [number, number]) => [3 * q[0], 3 * q[1]], [3, 3], undefined]] as const) {
    const out = transformParts(m, atoms, items, f as (q: [number, number]) => [number, number], size as [number, number] | undefined, undefined, 1, mirror as "across" | undefined);
    for (const t of [...IDS, "drawing"] as const) assert.equal(noteOf(out, t), `${t}: note`, `${how}: ${t}`);
  }
});

it("S16 a note on a catalytic cycle through ChemDraw 22.2: the cycle comes back as arcs, the note on the first arc", () => {
  const m = withNote(base(), [4], "the cycle"), xml = toCdxml(m, DEFAULT_STYLE, { derived: derivedOf(m) }).replace(/\n Octet="[^"]*"/g, "");
  const back = fromCdxml(xml).mol;
  assert.equal(back.cycles?.length ?? 0, 0, "no cycle without Octet's data");
  assert.equal((back.arrows ?? []).filter((a) => noteOf(back, a.id) === "the cycle").length, 1, "on one arc");
});

it("S17 a TLC spot picked, then Annotate: the note goes on the plate", () => {
  // Picking a spot or a lane picks its plate (the plate's id is in picked).
  assert.deepEqual(noteTargets(base(), new Set(), new Set([6])), [6]);
  assert.equal(noteOf(withNote(base(), noteTargets(base(), new Set(), new Set([6])), "plate"), 6), "plate");
});

// 40 paclitaxels in a row, a reaction arrow and conditions between each pair: with no notes, and with a note of
// 10,000 characters on every arrow and text.
const taxol = chem.indigoLayout("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C");
const scheme: Mol = { atoms: [], bonds: [], arrows: [], captions: [] };
for (let k = 0; k < 40; k++) {
  const b = scheme.atoms.length;
  scheme.atoms.push(...taxol.atoms.map((a) => ({ ...a, location: [a.location[0] + 30 * k, a.location[1], 0] as [number, number, number] })));
  scheme.bonds.push(...taxol.bonds.map((x) => ({ ...x, atoms: [x.atoms[0] + b, x.atoms[1] + b] as [number, number] })));
  if (k < 39) { scheme.arrows!.push({ id: 2 * k + 1, kind: "reaction", from: [30 * k + 18, 0], to: [30 * k + 26, 0] }); scheme.captions!.push({ id: 2 * k + 2, text: `${k + 1}`, x: 30 * k + 22, y: 0.5, on: { arrow: 2 * k + 1, side: "above" } }); }
}
const big = "n".repeat(MAX_CONTENT - 20);
const noted = withNote(scheme, [...scheme.arrows!, ...scheme.captions!].map((x) => x.id), big);
// The same work in two trees, each run in turn: the median of each (ms).
// Each is run a few times first, then the two take turns at going first; the fastest run of each, which a busy
// machine slows least. No more than 20% and 2 ms slower, in one of three tries: a busy machine can slow one try, and a
// change that costs time slows all three.
const race = (what: string, mine: () => unknown, theirs: () => unknown) => {
  let a = 0, b = 0;
  for (let tries = 0; tries < 3; tries++) {
    for (let k = 0; k < 5; k++) { mine(); theirs(); }
    const p: number[] = [], q: number[] = [];
    for (let k = 0; k < 31; k++) if (k % 2) { p.push(time(mine)); q.push(time(theirs)); } else { q.push(time(theirs)); p.push(time(mine)); }
    [a, b] = [Math.min(...p), Math.min(...q)];
    if (a <= b * 1.2 + 2) return;
  }
  assert.fail(`${what}: ${a.toFixed(1)} ms against ${b.toFixed(1)} ms before`);
};

it("S18 40 paclitaxels with notes on every arrow and text: save, open, copy and export no slower than before, apart from the notes' own text", async () => {
  // The notes' own text: 78 notes of 10,000 characters, about 0.8 MB.
  const text = serialize(noted), plain = serialize(scheme);
  assert.ok(text.length - plain.length < 78 * (MAX_CONTENT + 100));
  // A drawing with no notes takes the same paths: withoutNotes gives it back, and capNotes too.
  assert.equal(withoutNotes(scheme), scheme);
  assert.equal(capNotes(scheme), scheme);
  assert.ok(median(Array.from({ length: 9 }, () => time(() => withoutNotes({ ...scheme })))) < 2, "withoutNotes on 3,000 atoms and no notes");
  // Copy and export: the picture's drawing once per version (withoutNotes keeps its result).
  const bare = withoutNotes(noted);
  assert.equal(withoutNotes(noted), bare);
  assert.ok(median(Array.from({ length: 9 }, () => time(() => allNotes(noted)))) < 5, "the panel's list");
  if (!baseTree) return;
  const before = await import(new URL("file.ts", baseTree).href), cdxBefore = await import(new URL("cdxml.ts", baseTree).href);
  // With no notes, the same files as before.
  assert.equal(serialize(scheme), before.serialize(scheme));
  assert.equal(toCdxml(scheme, DEFAULT_STYLE), cdxBefore.toCdxml(scheme, DEFAULT_STYLE));
  for (const [what, mine, theirs] of [
    ["serialize", () => serialize(scheme), () => before.serialize(scheme)], ["parse", () => parse(plain), () => before.parse(plain)],
    ["toCdxml", () => toCdxml(scheme, DEFAULT_STYLE), () => cdxBefore.toCdxml(scheme, DEFAULT_STYLE)], ["fromCdxml", () => fromCdxml(toCdxml(scheme, DEFAULT_STYLE)), () => cdxBefore.fromCdxml(cdxBefore.toCdxml(scheme, DEFAULT_STYLE))],
  ] as const) race(what, mine, theirs);
});

it("S19 a 500-residue peptide with notes on its text and the drawing: open, save and edit no slower than before", async () => {
  const peptide = chem.indigoLayout("N[C@@H](C)C(=O)".repeat(500) + "O"), m = withNote({ ...peptide, captions: [{ id: 1, text: "Peptide 1", x: 0, y: 5 }] }, [1, "drawing"], "made on 19 November");
  assert.ok(peptide.atoms.length > 2500);
  const plain = serialize(peptide);
  assert.equal(noteOf(parse(serialize(m)), 1), "made on 19 November");
  if (!baseTree) return;
  const before = await import(new URL("file.ts", baseTree).href);
  for (const [what, mine, theirs] of [["serialize", () => serialize(peptide), () => before.serialize(peptide)], ["parse", () => parse(plain), () => before.parse(plain)]] as const) race(what, mine, theirs);
});

it("S20 dark mode, zoom at 10% and 1000%, export at 2400 dpi: the panel takes the theme's tokens, a row brings its object into view, no note in a picture", () => {
  const css = part("editor.css", ".note-panel {", "/* Properties: along the bottom");
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgb\(/, "colours come from the theme's tokens");
  assert.match(part("Editor.tsx", "noteActs.current = {", "const notePanel"), /revealNext\.current = true;/);
  // Every picture format, at any dpi, is made from withoutNotes.
  assert.match(part("Editor.tsx", "const exportRequest = ", "async function exportAs"), /PICTURES\.includes\(f\.format\) \|\| f\.format === "bmp" \? withoutNotes\(all\) : all/);
});

it("S21 Annotate many times fast, the panel toggled fast, a key held in the field: no undo step until the field is left, no text lost", () => {
  // Annotate and Show or Hide Notes change the settings and the focus only; the field uses its text when it is left.
  const cmds = part("Editor.tsx", "notes: () => (officeRef.current", "...Object.fromEntries(NUCLEUS_LIST");
  assert.doesNotMatch(cmds, /\bset\(/);
  assert.doesNotMatch(src("Fields.tsx"), /onInput/);
  // Each Annotate… puts the cursor in the field once (the panel made again does not take it back).
  assert.match(src("Notes.tsx"), /if \(!focus \|\| focus\.n === focused\) return;/);
});

it("S22 AI apps: note as a number, unknown ids, a reagent table id, group with ids from two groups, set_style with control characters", async () => {
  put({ ...base(), groups: [{ id: 11, atoms: [], items: [1, 5] }, { id: 12, atoms: [], items: [3, 6] }], grids: [{ arrow: 3, typed: {} }] });
  assert.ok((await edit({ ids: ["t1"], note: 5 })).isError, "a number is no note");
  assert.match(text(await edit({ ids: ["t99"], note: "x" })), /There is nothing with the id t99/);
  assert.match(text(await edit({ ids: ["g3"], note: "x" })), /g3 \(a reagent table\) takes no note: its arrow a3 does/);
  assert.match(text(await edit({ ids: ["t1", "a3"], note: "x", group: true })), /are in no group together/);
  const o = await call("advanced", { tool: "set_style", args: { properties: { note: "one\u0007\ttwo\r\nthree" } } });
  assert.ok(!o.isError, text(o));
  assert.equal(noteOf(doc(), "drawing"), "one two\nthree");
});

it("S23 two AI apps set notes on one object in turn: the last stays, one undo step each, read gives it", async () => {
  put(base());
  await edit({ ids: ["a3"], note: "from one" }, "one");
  await edit({ ids: ["a3"], note: "from two" }, "two");
  assert.equal(noteOf(doc(), 3), "from two");
  const r = text(await call("read", {}, "one"));
  assert.match(r, /from two/);
  await call("advanced", { tool: "run_command", args: { command: "undo" } }, "one");
  assert.equal(noteOf(doc(), 3), "from one");
});

it("S24 hostile CDXML: 100,000 annotations, one in another, a keyword of 1 MB, a Content of 20 MB: the limits hold, the rest counted, no hang", () => {
  const note = (c: string, k = "Note") => `<annotation Keyword="${k}" Content="${c}"/>`;
  const page = (inner: string) => `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1">${inner}</page></CDXML>`;
  const many = Array.from({ length: 100 }, (_, k) => `<t id="${10 + k}" p="${10 + 30 * k} 10"><s>T</s>${note("n").repeat(1000)}</t>`).join("");
  const t0 = performance.now();
  let r: ReturnType<typeof fromCdxml> | undefined, refused = "";
  try { r = fromCdxml(page(many)); } catch (e) { refused = String(e); }
  assert.ok(performance.now() - t0 < 10_000, "no hang");
  if (r) { assert.equal(noteCount(r.mol), MAX_NOTES); assert.equal(r.lost.annotation, 100_000 - MAX_NOTES); } else assert.match(refused, /too large|damaged|not a ChemDraw/);
  const nested = fromCdxml(page(`<t id="7" p="10 10"><s>A</s><annotation Keyword="Note" Content="outer">${note("inner")}</annotation></t>`)).mol;
  assert.equal(noteOf(nested, nested.captions![0].id), "outer");
  const huge = fromCdxml(page(`<t id="7" p="10 10"><s>A</s>${note("ok", "k".repeat(1 << 20))}${note("c".repeat(20 << 20))}</t>`));
  assert.equal(huge.lost.annotation, 2);
  assert.equal(huge.mol.captions![0].notes, undefined);
});

it("S25 an experiment page with a note; Settings > Document > Properties changed: the details and the note stay apart", () => {
  const page = withNote({ atoms: [], bonds: [], annotations: withDetails(undefined, { notebook: "SE-1" }) }, ["drawing"], "the note");
  const changed = { ...page, annotations: withDetails(page.annotations, { ...detailsOf(page.annotations, PROPERTIES), title: "Route" }, PROPERTIES) };
  assert.equal(noteOf(changed, "drawing"), "the note");
  assert.equal(detailsOf(changed.annotations).notebook, "SE-1");
  assert.ok(!Object.values(detailsOf(changed.annotations)).includes("the note"), "never a detail");
  assert.deepEqual(allNotes(changed).map((r) => r.keyword), [NOTE], "the details are not notes");
  assert.ok(FIELDS.length > 0);
});

it("S26 a ChemDraw clip-art group with GUID and Name annotations: GUID kept and not listed; Name listed under its keyword", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><group id="2"><t id="3" p="10 10"><s>A</s></t><t id="4" p="40 10"><s>B</s></t><annotation Keyword="GUID" Content="0A1B"/><annotation Keyword="Name" Content="Flask"/></group></page></CDXML>`;
  const m = fromCdxml(xml).mol, g = m.groups![0];
  assert.deepEqual(allNotes(m).map((r) => [r.keyword, r.text]), [["Name", "Flask"]]);
  assert.equal(withoutNotes(m).groups![0].annotations!.length, 1, "GUID stays in a picture's data");
  assert.match(toCdxml(m, DEFAULT_STYLE), /Keyword="GUID"/);
  assert.equal(noteOf(m, g.id, "Name"), "Flask");
});

it("S27 Add to templates from objects with notes; place the template: the placed copy has no note", () => {
  const t = newTemplate("Mine", withoutNotes(noteAll(base())));
  assert.equal(allNotes(parse(t.file)).length, 0);
  assert.match(part("Editor.tsx", "function addOwnTemplate(", "return t;"), /newTemplate\(name, withoutNotes\(mol\)\)/);
  assert.equal(src("Editor.tsx").match(/serialize\(templateOf\(withoutNotes\(doc\)\)\)/g)?.length, 2, "a purpose template from the drawing");
  assert.equal(allNotes(templateOf(withoutNotes(noteAll(base())))).length, 0);
});

it("S28 Print with the Notes panel open: the printout has no panel and no note", () => {
  assert.match(src("editor.css"), /@media print \{\n  body > :not\(\.print-root\) \{\n    display: none !important;/);
  assert.ok(!src("Editor.tsx").includes('className="print-root"') || !part("Editor.tsx", 'className="print-root"', "</div>").includes("Notes"));
});

it("S29 ⌘A then Annotate on 500 objects, one note typed: one undo step puts it on all 500; the 10,000-note limit is checked first", () => {
  const m: Mol = { atoms: [], bonds: [], captions: Array.from({ length: 500 }, (_, k) => ({ id: k + 1, text: `${k}`, x: k, y: 0 })) };
  const targets = noteTargets(m, new Set(), new Set(m.captions!.map((c) => c.id)));
  assert.equal(targets.length, 500);
  const out = withNote(m, targets, "batch 7");
  assert.equal(allNotes(out).length, 500);
  const nearly: Mol = { ...m, shapes: Array.from({ length: 10 }, (_, k) => ({ id: 1000 + k, kind: "box" as const, from: [k, 5] as [number, number], to: [k + 1, 6] as [number, number], notes: Array.from({ length: 990 }, () => ({ keyword: NOTE, content: "x" })) })) };
  assert.throws(() => withNote(nearly, targets, "one too many"), /This drawing has 10,000 notes, the most Octet keeps\./);
});

it("S30 structures (N9, waits for issue 68): a structure, atom or bond is no target; an AI app is told so", async () => {
  assert.deepEqual(noteTargets(base(), new Set([0, 1, 2]), new Set()), []);
  put(base());
  const r = await edit({ ids: ["s1"], note: "x" });
  assert.match(text(r), /takes no note: give one on a text, arrow, shape or cycle/);
  assert.equal(allNotes(doc()).length, 0);
});

// ---------------------------------------------------------------------------------------------------------------------
// Our own: what release 1.1.3 has besides.

it("N1 free symbols (a plus, a radical, a δ+, a 2⊕ in its group): each takes a note, keeps it through every file, and a picture has none", () => {
  const m = withNote(base(), [7, 8, 9, 10], HARD);
  for (const id of [7, 8, 9, 10]) assert.deepEqual(noteTargets(m, new Set(), new Set([id])), [id], `${id} is a target`);
  for (const [how, back] of files(m)) {
    const syms = (back.shapes ?? []).filter((s) => s.kind === "symbol");
    assert.equal(syms.length, 4, `${how}: four symbols`);
    assert.ok(syms.every((s) => noteOf(back, s.id) === HARD), `${how}: each with its note`);
  }
  assert.equal(allNotes(withoutNotes(m)).length, 0);
  assert.ok(!toCdxml(withoutNotes(m), DEFAULT_STYLE).includes("batch 2"));
  // The panel names each by its kind.
  assert.ok([7, 8, 9, 10].every((id) => !!nounOf(m, id)));
});

it("N2 a Jablonski diagram: a level's note and the diagram's stay when it is resized and when its data change", () => {
  const env: PlotEnv = { captionSize: 10, bond: 14.4, measure: (t) => widthOf(t, 1), line: 0.6 };
  const chart: JablonskiChart = { ...NEW_JABLONSKI, origin: [2, -3], scale: 1, text: 1, roles: [] };
  const [page] = placePlot({ atoms: [], bonds: [] }, chart, env), g = page.groups![0];
  const level = page.arrows!.find((a) => g.items.includes(a.id) && a.role?.role === "level:1")!, name = page.captions!.find((c) => g.items.includes(c.id) && c.role)!;
  const m = withNote(withNote(page, [level.id, name.id], "measured in MeCN"), [g.id], "Figure 3");
  const after = [reframe(m, g.id, [0, 0, 10, 10], [0, 0, 14, 12], env), replot(m, g.id, { states: chart.states.map((s, k) => (k === 1 ? { ...s, energy: s.energy + 2 } : s)) } as never, env)];
  for (const [k, out] of after.entries()) {
    assert.equal(noteOf(out, g.id), "Figure 3", `${k}: the diagram's note`);
    assert.equal(noteOf(out, level.id), "measured in MeCN", `${k}: the level's note`);
    assert.equal(noteOf(out, name.id), "measured in MeCN", `${k}: the text's note`);
  }
});

it("N3 an object window (Word, PowerPoint, Excel or LibreOffice) sends no notes: Update, the first picture and each change kept for the host", () => {
  const editor = src("Editor.tsx");
  // officeUpdate (Update and close), officePrime (the picture once the drawing is on the canvas) and officeKeep (each
  // change, half a second after it): on the Mac the object is the picture and its CDXML, on Windows the .oct too.
  assert.match(part("Editor.tsx", "const officeUpdate = ", "const officeClose"), /bare = withoutNotes\(sent\)[\s\S]*writeOct\(\{ \.\.\.bare, guides \}[\s\S]*pictureOf\(bare\)[\s\S]*formatOf\(bare, "cdxml"\)/);
  const prime = part("Editor.tsx", "const officePrime = useRef(false);", "const officeKept = ");
  assert.match(prime, /bare = withoutNotes\(doc\), svg = pictureOf\(bare\)[\s\S]*formatOf\(bare, "cdxml"\)/);
  const keep = part("Editor.tsx", "officeKeep.current = () => {", "const officeClosed = ");
  assert.match(keep, /bare = withoutNotes\(doc\), oct = mainDirty \? writeOct\(\{ \.\.\.bare, guides \}/);
  assert.match(keep, /svg: pictureOf\(bare\) \?\? BLANK_SVG, cdxml: formatOf\(bare, "cdxml"\)/);
  // Every ole_update in the editor sends a drawing without notes.
  for (const call of editor.match(/invoke\("ole_update", \{[^}]*\}/g) ?? []) assert.doesNotMatch(call, /\((doc|sent)\b/, call);
  // A note pasted into the window stays out of what the host gets, on both systems.
  const m = noteAll(base(), () => HARD), bare = withoutNotes(m), derived = derivedOf(m);
  const windows = writeOct({ ...bare, guides: undefined }, DEFAULT_STYLE, { derived }), mac = toCdxml(bare, DEFAULT_STYLE, { derived });
  for (const [how, out] of [["Windows (.oct)", windows], ["Mac (picture's CDXML)", mac]] as const) assert.ok(!out.includes("batch 2"), how);
  assert.equal(allNotes(readOct(windows).mol).length, 0);
  assert.equal(noteOf(readOct(windows).mol, "drawing", "Title"), "Route 2", "the title stays");
});

it("N4 the drawing's comment (Settings > Document > Properties, issue 100) is not a note: never listed, kept in a picture's data", () => {
  const m = withNote({ atoms: [], bonds: [], annotations: withDetails(undefined, { comment: "for the PDF" }, PROPERTIES) }, ["drawing"], "mine");
  assert.deepEqual(allNotes(m).map((r) => r.text), ["mine"]);
  assert.equal(detailsOf(withoutNotes(m).annotations, PROPERTIES).comment, "for the PDF", "a PDF's information keeps it");
  assert.ok(!isNote({ keyword: COMMENT, content: "x" }));
});

it("N5 the comment and the note are apart for an AI app too: set_style sets each on its own", async () => {
  put(base());
  await call("advanced", { tool: "set_style", args: { properties: { comment: "C" } } });
  await call("advanced", { tool: "set_style", args: { properties: { note: "N" } } });
  assert.equal(detailsOf(doc().annotations, PROPERTIES).comment, "C");
  assert.equal(noteOf(doc(), "drawing"), "N");
  await call("advanced", { tool: "set_style", args: { properties: { note: "" } } });
  assert.equal(detailsOf(doc().annotations, PROPERTIES).comment, "C");
  assert.equal(noteOf(doc(), "drawing"), "");
});

it("N6 one TextField for the comment and the notes: it grows with its text up to its lines, Escape leaves it, a value from outside shows unless it has the focus", () => {
  const f = src("Fields.tsx");
  assert.match(f, /useEffect\(\(\) => \{ if \(!focused\.current\) setText\(value\); \}, \[value\]\)/);
  assert.match(f, /el\.rows = Math\.max\(1, Math\.min\(lines, Math\.round\(el\.scrollHeight \/ step\)\)\);/);
  assert.match(f, /if \(e\.key === "Escape"\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); e\.currentTarget\.blur\(\); \}/);
  // One rule for the well of several lines (no second copy of the selector).
  assert.equal(src("editor.css").match(/^\.unit-field\.lines textarea \{/gm)?.length, 1);
});

it("N7 Copy As CDXML Text puts no note on the clipboard", () => {
  assert.match(part("Editor.tsx", "const copyAs = ", "const [name, write]"), /formatOf\(withoutNotes\(part\), "cdxml"\)/);
});

it("N8 a live value drawn again keeps its text's note", () => {
  const m: Mol = { ...base(), captions: [{ id: 30, text: "C2H6O", x: 0, y: -3, property: { atoms: [0, 1, 2], attrs: { rows: "formula" } }, notes: [{ keyword: NOTE, content: "checked" }] }] };
  const out = liveValues(m, () => [[{ key: "formula", name: "Formula", values: ["C2H6O2"] }]] as never);
  assert.equal(noteOf(out, 30), "checked");
});

it("N9 the reagent table takes no note: Annotate is not offered on it", () => {
  assert.match(part("Editor.tsx", "const contextOf = ", "const chartContext"), /c\.kind !== "grid"/);
});

it("N10 a group's annotations from two groups that become one: at most 1000, and a file over 10,000 notes opens with the first 10,000", () => {
  const json = JSON.parse(serialize(base()));
  json.shapes.forEach((x: Record<string, unknown>) => { x.notes = Array.from({ length: 1000 }, () => ({ keyword: NOTE, content: "x" })); });
  json.captions.forEach((x: Record<string, unknown>) => { x.notes = Array.from({ length: 1000 }, () => ({ keyword: NOTE, content: "y" })); });
  json.arrows.forEach((x: Record<string, unknown>) => { x.notes = Array.from({ length: 1000 }, () => ({ keyword: NOTE, content: "z" })); });
  json.cycles.forEach((x: Record<string, unknown>) => { x.notes = Array.from({ length: 1000 }, () => ({ keyword: NOTE, content: "w" })); });
  assert.equal(noteCount(parse(JSON.stringify(json))), MAX_NOTES);
});

// The speed cases first, before the other cases have run the same code on other kinds of drawing (which leaves the
// engine's compiled code slower for this tree than for the tree it is timed against).
const speed = (name: string) => Number(!/^S1[89] /.test(name));
it("N11 a ChemDraw file's raw line breaks: a note keeps them, a title (one line in Settings) takes spaces (issue 100's rule)", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><t id="2" p="10 10"><s>A</s><annotation Keyword="Note" Content="one\r\ntwo\nthree"/></t><annotation Keyword="Title" Content="A\nB"/><annotation Keyword="Name" Content="x\ny"/></page></CDXML>`;
  const m = fromCdxml(xml).mol;
  assert.equal(noteOf(m, m.captions![0].id), "one\ntwo\nthree");
  assert.equal(noteOf(m, "drawing", "Title"), "A B");
  assert.equal(noteOf(m, "drawing", "Name"), "x\ny", "a keyword of ChemDraw's that is shown as a note keeps its lines too");
});

// ---------------------------------------------------------------------------------------------------------------------

let failed = 0;
for (const [name, run] of [...cases].sort((p, q) => speed(p[0]) - speed(q[0]))) {
  try { await run(); } catch (e) { failed++; console.error(`FAIL ${name}\n  ${e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n  ") : e}`); }
}
console.log(`notes-stress: ${cases.length - failed} of ${cases.length} cases pass`);
process.exit(failed ? 1 : 0);
