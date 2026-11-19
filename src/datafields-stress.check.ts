// Run: node src/datafields-stress.check.ts. The stress list of issue 68 (docs/plans/issue-68-data-fields.md, S1 to
// S32): data fields on structures through big and hostile files, odd names and values, every edit that renumbers atoms,
// undo, copy and paste, every format in a chain, AI apps with odd arguments and two at once, and speed. Each case runs on
// its own, and the file fails at the end with the cases that fail. What only the window does (the dialog, a notice) is
// checked here in the source the editor runs for it. S18 (ChemDraw 22.2) and S19 (Octet 1.1.2's own readers) need
// those programs, so they are run by hand and recorded in the plan.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const chem = await import("./chem.ts");
const E = await import("./edit.ts");
const D = await import("./datafields.ts");
const { fromCdxml, toCdxml, parseXml } = await import("./cdxml.ts");
const { cdxToXml, xmlToCdx } = await import("./cdx.ts");
const { parse, serialize } = await import("./file.ts");
const { readCdx, readOct, writeCdx, writeOct, lostText } = await import("./oct.ts");
const { history } = await import("./history.ts");
const { nextCompound } = await import("./numbering.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
type Mol = import("./render.ts").Mol;
await load();

const cases: [string, () => unknown][] = [];
const test = (name: string, f: () => unknown) => void cases.push([name, f]);
const S = DEFAULT_STYLE;
// Each structure's fields, in the drawing's structure order: [name, value, shown].
const all = (m: Mol) => E.fragments(m).map((g) => D.rowsOf(m, g).map((r) => [r.name, r.value, r.show]));
const hidden = (m: Mol) => all(m).map((s) => s.map(([n, v]) => [n, v, false]));
const timed = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t; };
const median = (t: number[]) => [...t].sort((x, y) => x - y)[t.length >> 1];
// Whether with (fields) is no more than 15% slower than without (none), plus a little for a sub-millisecond step:
// medians of interleaved runs after a warm-up. A failure is measured again before it counts (the machine is busy).
function slower(without: () => unknown, withFields: () => unknown, runs: number, warm: number, extra: number, what: string) {
  for (let tries = 0; ; tries++) {
    const a: number[] = [], b: number[] = [];
    for (let r = 0; r < runs + warm; r++) { a.push(timed(without)); b.push(timed(withFields)); }
    const ma = median(a.slice(warm)), mb = median(b.slice(warm));
    if (mb <= ma * 1.15 + extra) return;
    if (tries) assert.fail(`${what}: ${mb.toFixed(2)} ms with fields, ${ma.toFixed(2)} ms without`);
  }
}
const ethanol = () => chem.parseStructure("CCO");
// Ethanol (s1) and acetic acid (s2), apart.
const two = () => E.insertMol(ethanol(), chem.parseStructure("CC(=O)O"), [6, 0]).mol;
const atomsOf = (m: Mol, k: number) => E.fragments(m)[k];
const fielded = (m: Mol, k: number, rows: [string, string, boolean?][]) => D.setRows(m, atomsOf(m, k), rows.map(([name, value, show]) => ({ name, value, show: !!show })));
const molfile = chem.toMolfile(ethanol(), true);
const sdOf = (records: string[]) => records.map((items) => `${molfile}\n${items}$$$$\n`).join("");
// Through every file Octet writes fields to: .oct (JSON and CDXML), CDXML, CDX (Octet's and the objects alone), SDF.
const formats: [string, (m: Mol) => Mol][] = [
  ["oct", (m) => parse(serialize(m))],
  ["oct cdxml", (m) => readOct(writeOct(m, S)).mol],
  ["cdxml", (m) => fromCdxml(toCdxml(m, S)).mol],
  ["cdx", (m) => readCdx(writeCdx(m, S)).mol],
  ["cdx objects", (m) => fromCdxml(cdxToXml(xmlToCdx(parseXml(toCdxml(m, S).replace(/\n Octet="[^"]*"/g, ""))))).mol],
];

test("S1 an SD file of 10,000 records is refused at once", () => {
  const big = sdOf(Array.from({ length: 10_000 }, (_, k) => `> <ID>\nC-${k}\n\n`));
  const t = performance.now();
  assert.throws(() => chem.importStructure(big), /more than 300,000 characters/);
  assert.ok(performance.now() - t < 200);
});

test("S2 an SD file just under the limit opens with every field, in about the time of none", () => {
  const items = Array.from({ length: 10 }, (_, k) => `> <F${k}>\nvalue ${k}\n\n`).join(""), n = Math.floor(295_000 / (molfile.length + items.length + 6));
  const withItems = sdOf(Array(n).fill(items)), without = sdOf(Array(n).fill(""));
  assert.ok(withItems.length < 300_000 && n >= 250, `${n} records`);
  const m = chem.importStructure(withItems), got = all(m);
  assert.equal(got.length, n);
  assert.ok(got.every((s) => s.map(([name]) => name).join() === "F0,F1,F2,F3,F4,F5,F6,F7,F8,F9"));
  slower(() => chem.importStructure(without), () => chem.importStructure(withItems), 9, 0, 15, "open");
});

test("S3 line breaks, CRLF, empty lines and tabs", () => {
  const m = fielded(two(), 0, [["Note", "\n\na\r\nb\n\n c\td\r\n\n"], ["Shown", "x\r\n\ny", true]]);
  assert.deepEqual(all(m)[0], [["Note", "a\nb\n\n c d", false], ["Shown", "x\n\ny", true]]);
  for (const [what, f] of formats) assert.deepEqual(all(f(m)), all(m), what);
  for (const v2000 of [true, false]) {
    const sd = chem.toSdf(m, v2000);
    assert.match(sd, /> <Note>\na\nb\n c d\n\n> <Shown>\nx\ny\n\n\$\$\$\$/);
    assert.deepEqual(all(chem.importStructure(sd))[0], [["Note", "a\nb\n c d", false], ["Shown", "x\ny", false]]);
  }
});

test("S4 < and > never stay in a name", () => {
  assert.deepEqual(all(fielded(two(), 0, [["a<b>c", "v"]]))[0], [["abc", "v", false]]);
  assert.deepEqual(all(chem.importStructure(sdOf(["> <a<b>\nv\n\n> 12 <c>d> (x)\nw\n\n"])))[0], [["ab", "v", false], ["c", "w", false]]);
  const cdxml = toCdxml(fielded(two(), 0, [["k", "v"]]), S).replace('Keyword="k"', 'Keyword="x&lt;y&gt;z"').replace(/\n Octet="[^"]*"/g, "");
  assert.deepEqual(all(fromCdxml(cdxml).mol)[0], [["xyz", "v", false]]);
  const m = fielded(two(), 0, [["<>name<>", "v"]]);
  assert.deepEqual(all(chem.importStructure(chem.toSdf(m)))[0], [["name", "v", false]]);
});

test("S5 two fields of one name", () => {
  const m = fielded(two(), 0, [["ID", "a"], ["ID", "b"]]);
  assert.deepEqual(all(m)[0], [["ID", "a", false], ["ID", "b", false]]);
  assert.equal((chem.toSdf(m).match(/> <ID>/g) ?? []).length, 2);
  assert.deepEqual(all(chem.importStructure(chem.toSdf(m)))[0], all(m)[0]);
  const set = D.changeData(m, atomsOf(m, 0), [{ name: "ID", value: "z" }]) as Mol;
  assert.deepEqual(all(set)[0], [["ID", "z", false], ["ID", "b", false]]);
  const gone = D.changeData(m, atomsOf(m, 0), [{ name: "ID", remove: true }]) as Mol;
  assert.deepEqual([all(gone)[0], gone.data], [[], undefined]);
});

test("S6 empty values", () => {
  const m = fielded(two(), 0, [["e", ""], ["f", "  \n "]]);
  assert.deepEqual(all(m)[0], [["e", "", false], ["f", "", false]]);
  assert.match(chem.toSdf(m), /M {2}END\n> <e>\n\n> <f>\n\n\$\$\$\$/);
  assert.deepEqual(all(chem.importStructure(chem.toSdf(m)))[0], all(m)[0]);
  for (const [what, f] of formats) assert.deepEqual(all(f(m)), all(m), what);
});

test("S7 empty names", () => {
  assert.equal(fielded(two(), 0, [["", "v"], ["  ", "w"]]).data, undefined);
  assert.deepEqual(all(chem.importStructure(sdOf(["> <>\nv\n\n"])))[0], [["Data", "v", false]]);
  const cdxml = toCdxml(fielded(two(), 0, [["k", "v"]]), S).replace('Keyword="k"', 'Keyword=""').replace(/\n Octet="[^"]*"/g, "");
  assert.deepEqual(all(fromCdxml(cdxml).mol)[0], [["Data", "v", false]]);
});

test("S8 Unicode in every format", () => {
  const u = "α °C 日本 🧪 مرحبا";
  const m = fielded(two(), 0, [[`名 ${u}`, u], ["shown", u, true]]);
  for (const [what, f] of formats) assert.deepEqual(all(f(m)), all(m), what);
  for (const v2000 of [true, false]) assert.deepEqual(all(chem.importStructure(chem.toSdf(m, v2000))), hidden(m));
  // Over the limit, a value is left out whole, so no character is split.
  assert.equal(D.cleanValue(`${"x".repeat(D.MAX_VALUE - 1)}🧪`), undefined);
  assert.equal(D.cleanValue(`${"x".repeat(D.MAX_VALUE - 2)}🧪`)?.length, D.MAX_VALUE);
});

test("S9 a hostile SD file", () => {
  const huge = sdOf([`> <big>\n${"x".repeat(290_000)}\n\n> <ok>\nfine\n\n`]);
  let t = performance.now(), m = chem.importStructure(huge);
  assert.deepEqual([all(m)[0], D.leftOf(m)], [[["ok", "fine", false]], { "data field": 1 }]);
  assert.ok(performance.now() - t < 1000);
  const tiny = sdOf([Array.from({ length: 20_000 }, (_, k) => `> <${k}>\n${k % 10}\n\n`).join("")]);
  assert.ok(tiny.length < 300_000);
  t = performance.now();
  m = chem.importStructure(tiny);
  assert.deepEqual([all(m)[0].length, D.leftOf(m)], [D.MAX_EACH, { "data field": 19_000 }]);
  assert.ok(performance.now() - t < 1000);
  const odd = `${molfile}\n> 25\nno name\n\n> <ctl>\na\u0000b\u001bc\n\n$$$$   \n\n  none\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n> <E>\n1\n\n> <F>\n2\n\n$$$$\n${molfile}\n> <last>\nz\n\n$$$$`;
  m = chem.importStructure(odd);
  assert.deepEqual([all(m), D.leftOf(m), lostText(D.leftOf(m))], [[[["ctl", "abc", false]], [["last", "z", false]]], { "data field": 3 }, "3 data fields"]);
});

test("S10 a hostile .oct", () => {
  const good = JSON.parse(serialize(fielded(two(), 0, [["ok", "v"]])));
  const open = (data: unknown) => readOct(JSON.stringify({ ...good, data }));
  assert.deepEqual(open({ a: 1 }).mol.data, undefined);
  assert.deepEqual(open({ a: 1 }).lost, { "data field": 1 });
  assert.deepEqual(open([{ name: "a", atoms: [99], value: "v" }, { name: "b", atoms: [0], caption: 5 }, { name: "x".repeat(10_000), atoms: [0], value: "v" }, { name: "c", atoms: [0, 0, 1], value: "w" }]).mol.data, [{ name: "c", atoms: [0, 1], value: "w" }]);
  const t = performance.now(), many = open(Array.from({ length: 100_000 }, (_, k) => ({ name: `f${k}`, atoms: [k % 3], value: "v" })));
  assert.deepEqual([many.mol.data!.length, many.lost], [D.MAX_DATA, { "data field": 90_000 }]);
  assert.ok(performance.now() - t < 1500);
});

test("S11 a hostile CDXML", () => {
  const notes = Array.from({ length: 5000 }, (_, k) => `<annotation Keyword="k${k}" Content="v"/>`).join("");
  const text = `<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="14.40"><page id="1" BoundingBox="0 0 540 720"><fragment id="3"><n id="4" p="100 100"/><n id="5" p="114.4 100"/><b id="6" B="4" E="5"/>${notes}</fragment><chemicalproperty id="9" ChemicalPropertyDisplayID="77" ChemicalPropertyType="23" Name="x" BasisObjects="4"/><chemicalproperty id="10" ChemicalPropertyType="23" Name="y"/></page></CDXML>`;
  const t = performance.now(), r = fromCdxml(text);
  assert.equal(r.mol.data!.length, D.MAX_EACH);
  assert.equal(r.lost["data field"], 4000);
  assert.ok(r.lost["property link"] >= 1);
  assert.ok(performance.now() - t < 1000);
});

test("S12 a structure split in two", () => {
  const butane = chem.parseStructure("CCCC"), m = D.setRows(butane, [0, 1, 2, 3], [{ name: "ID", value: "B-1", show: true }, { name: "lot", value: "7", show: false }]);
  const split = E.deleteBond(m, m.bonds.findIndex((b) => b.atoms.includes(1) && b.atoms.includes(2)));
  assert.equal(E.fragments(split).length, 2);
  assert.deepEqual(all(split).map((s) => s.map(([n, v]) => [n, v])), [[["ID", "B-1"], ["lot", "7"]], [["ID", "B-1"], ["lot", "7"]]]);
  const sd = chem.toSdf(split);
  assert.equal((sd.match(/> <ID>\nB-1\n/g) ?? []).length, 2);
  const one = D.setRows(split, atomsOf(split, 1), D.rowsOf(split, atomsOf(split, 1)).map((r) => (r.name === "lot" ? { ...r, value: "8" } : r)));
  assert.deepEqual(all(one).map((s) => s.find(([n]) => n === "lot")![1]), ["7", "8"]);
  assert.equal(all(one).filter((s) => s.some(([n, , shown]) => n === "ID" && shown)).length, 2, "Show stays on for each piece");
});

test("S13 two structures merged", () => {
  const m = fielded(fielded(two(), 0, [["ID", "first"]]), 1, [["ID", "second"]]);
  const order = [["ID", "first", false], ["ID", "second", false]];
  const bonded = E.dragBond(m, 2, [m.atoms[3].location[0], m.atoms[3].location[1]]);
  assert.deepEqual(all(bonded), [order]);
  assert.deepEqual(all(E.joinSelection(m, new Set([2, 3]))!), [order]);
  const dropped = E.joinOverlaps(E.moveAtoms(m, new Set(atomsOf(m, 1)), [m.atoms[2].location[0] - m.atoms[3].location[0], m.atoms[2].location[1] - m.atoms[3].location[1]]), new Set(atomsOf(m, 1))).mol;
  assert.deepEqual(all(dropped), [order]);
});

test("S14 deleting what a field depends on", () => {
  const m = fielded(two(), 0, [["ID", "A"], ["mp", "5", true]]), text = m.data![1].caption!;
  assert.deepEqual(all(E.deleteAtoms(m, new Set(atomsOf(m, 0)))), [[]]);
  assert.deepEqual(all(E.deleteAtoms(m, new Set([0])))[0], all(m)[0]);
  const noText = E.deleteGraphics(m, new Set([text]));
  assert.deepEqual(all(noText)[0], [["ID", "A", false]]);
  let h = history({ stack: [m], at: 0 }, { type: "set", mol: m });
  h = history(h, { type: "set", mol: noText });
  h = history(h, { type: "undo" });
  assert.equal(h.stack[h.at], m, "Undo brings the text and its field back");
  const cut = E.extractSelection(m, new Set(atomsOf(m, 0)), new Set([text])), left = E.deleteChosen(m, new Set(atomsOf(m, 0)), new Set([text]));
  assert.deepEqual(all(left), [[]]);
  const pasted = E.insertMol(left, parse(serialize(cut)), [0, 0]).mol;
  assert.deepEqual(all(pasted).find((s) => s.length), all(m)[0]);
});

test("S15 the undo chain", () => {
  const base = two(), P = atomsOf(base, 0), steps: Mol[] = [base];
  let h = history({ stack: [base], at: 0 }, { type: "set", mol: base });
  const step = (m: Mol) => { steps.push(m); h = history(h, { type: "set", mol: m }); };
  step(D.setRows(base, P, [{ name: "ID", value: "A", show: false }]));
  step(D.setRows(steps.at(-1)!, P, [{ ...D.rowsOf(steps.at(-1)!, P)[0], show: true }]));
  step(E.updateCaption(steps.at(-1)!, steps.at(-1)!.data![0].caption!, { text: "B" }));
  step(D.setRows(steps.at(-1)!, P, [{ ...D.rowsOf(steps.at(-1)!, P)[0], show: false }]));
  assert.deepEqual(all(steps.at(-1)!)[0], [["ID", "B", false]]);
  for (let k = 4; k > 0; k--) { assert.equal(h.stack[h.at], steps[k]); h = history(h, { type: "undo" }); }
  assert.equal(h.stack[h.at], base);
  for (let k = 1; k <= 4; k++) { h = history(h, { type: "redo" }); assert.equal(h.stack[h.at], steps[k]); }
  // Saving the dialog with nothing changed is no step.
  assert.equal(D.setRows(steps[2], P, D.rowsOf(steps[2], P)), steps[2]);
});

test("S16 copy and paste between drawings", () => {
  const m = fielded(two(), 0, [["ID", "A"], ["mp", "5", true]]), text = m.data![1].caption!;
  const clip = serialize(E.extractSelection(m, new Set(atomsOf(m, 0)), new Set([text])));
  const into = E.insertMol(chem.parseStructure("c1ccccc1"), parse(clip), [10, 10]).mol;
  assert.deepEqual(all(into).find((s) => s.length), all(m)[0]);
  assert.equal(parse(serialize(E.extractSelection(m, new Set(), new Set([text])))).data, undefined, "the text alone is plain text");
  const loose = { ...m, captions: m.captions!.map((c) => ({ ...c, under: undefined })) };
  assert.deepEqual(all(parse(serialize(E.extractSelection(loose, new Set(atomsOf(m, 0)), new Set()))))[0], [["ID", "A", false], ["mp", "5", false]]);
});

test("S17 .oct, CDXML, CDX, .oct, SDF V2000, SDF V3000", () => {
  const m = fielded(fielded(two(), 0, [["ID", "A-1"], ["mp", "78 °C", true]]), 1, [["ID", "A-2"], ["Note", "two\nlines"]]);
  let x = readOct(writeOct(m, S)).mol;
  x = fromCdxml(toCdxml(x, S)).mol;
  x = fromCdxml(cdxToXml(xmlToCdx(parseXml(toCdxml(x, S))))).mol;
  x = parse(serialize(x));
  assert.deepEqual(all(x), all(m), "shown state kept until SDF");
  x = chem.importStructure(chem.toSdf(x, true));
  x = chem.importStructure(chem.toSdf(x, false));
  assert.deepEqual(all(x), hidden(m));
});

test("S20 the dialog and the text take tokens only", () => {
  for (const f of ["DataDialog.tsx", "Cells.tsx"]) assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), "utf8"), /#[0-9a-f]{3,8}\b|rgba?\(|hsl\(/i, f);
  const css = readFileSync(new URL("editor.css", import.meta.url), "utf8");
  for (const rule of [".chart-table .cell-title", ".chart-table .cell-switch", ".unit-field textarea"]) {
    const body = css.slice(css.indexOf(`${rule} {`), css.indexOf("}", css.indexOf(`${rule} {`)));
    assert.ok(body.length > rule.length, rule);
    assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b|rgba?\(/i, rule);
  }
  // A shown field draws as any caption (render.ts has no case of its own for it).
  assert.doesNotMatch(readFileSync(new URL("render.ts", import.meta.url), "utf8"), /m\.data|\.data\?\./);
});

test("S21 turned and flipped structures", () => {
  const m = fielded(two(), 0, [["ID", "A"], ["mp", "5", true]]), P = atomsOf(m, 0);
  for (const t of [E.rotateAtoms(m, new Set(P), 90), E.flipAtoms(m, new Set(P), "horizontal"), E.flipAtoms(m, new Set(P), "vertical")]) {
    assert.deepEqual(all(t), all(m));
    assert.deepEqual(t.captions!.find((c) => c.id === t.data![1].caption)!.under, P);
  }
});

// S22 to S24, S28: AI apps (scripts/headless).
type Reply = { result?: { content: { type: string; text?: string }[]; isError?: boolean; structuredContent?: any }; error?: { code: number; message: string } };
let n = 0;
const caller = (d: ReturnType<typeof drawing>, who: string) => async (name: string, args: unknown): Promise<Reply> =>
  JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session(who, who)));
const said = (r: Reply) => r.result?.content[0]?.text ?? r.error?.message ?? "";
const bad = (r: Reply) => !!(r.error || r.result?.isError);
const ids = async (call: ReturnType<typeof caller>) => ((await call("read", {})).result!.structuredContent.structures as { id: string }[]).map((x) => x.id);

test("S22 100 AI edits in a row, and the dialog changes nothing until Save", async () => {
  const d = drawing("paper", "Fast"), call = caller(d, "fast");
  d.host.set(two());
  const [s1] = await ids(call), start = d.host.doc();
  for (let k = 0; k < 100; k++) assert.ok(!bad(await call("change", { operations: [{ op: "edit", ids: [s1], data: [{ name: "ID", value: `v${k}` }] }] })));
  assert.deepEqual(all(d.host.doc())[0], [["ID", "v99", false]]);
  for (let k = 0; k < 100; k++) assert.ok(d.host.command("undo"));
  assert.equal(d.host.doc(), start);
  const dialog = readFileSync(new URL("DataDialog.tsx", import.meta.url), "utf8");
  assert.match(dialog, /onAction=\{save\}/);
  assert.equal((dialog.match(/onSave\(/g) ?? []).length, 1, "the rows reach the drawing only from Save");
});

test("S23 bad arguments from an AI app", async () => {
  const d = drawing("paper", "Bad"), call = caller(d, "bad");
  d.host.set(E.addArrow(two(), { from: [0, 3], to: [3, 3] } as Parameters<typeof E.addArrow>[1])[0]);
  const [s1] = await ids(call), before = d.host.doc(), arrow = `a${before.arrows![0].id}`;
  for (const [id, data, why] of [
    [arrow, [{ name: "x", value: "y" }], /takes no data|no data/],
    ["t999", [{ name: "x", value: "y" }], /no|There is/i],
    [s1, [{ name: "a<b", value: "y" }], /no < or >/], [s1, [{ name: "", value: "y" }], /1 to 200/], [s1, [{ name: "x".repeat(201), value: "y" }], /200/],
    [s1, [{ name: "x", value: "v".repeat(10_001) }], /10,?000/], [s1, [{ name: "x", value: "v".repeat(2_001), show: true }], /too long to show/],
    [s1, [{ name: "absent", remove: true }], /no data field absent/], [s1, "not a list", /list|array|data/i],
  ] as [string, unknown, RegExp][]) {
    const r = await call("change", { operations: [{ op: "edit", ids: [id], data }] });
    assert.match(said(r), why, `${id} ${JSON.stringify(data).slice(0, 40)}: ${said(r)}`);
    assert.equal(d.host.doc(), before, `${id} ${JSON.stringify(data).slice(0, 40)} changed the drawing`);
  }
});

test("S24 two AI apps on one structure", async () => {
  const d = drawing("paper", "Two"), a = caller(d, "one"), b = caller(d, "two");
  d.host.set(two());
  const [s1, s2] = await ids(a);
  assert.ok(!bad(await a("change", { operations: [{ op: "edit", ids: [s1], data: [{ name: "ID", value: "from one" }] }] })));
  assert.ok(!bad(await b("change", { operations: [{ op: "edit", ids: [s1], data: [{ name: "ID", value: "from two" }] }] })));
  assert.deepEqual(all(d.host.doc())[0], [["ID", "from two", false]]);
  assert.ok(d.host.command("undo"));
  assert.deepEqual(all(d.host.doc())[0], [["ID", "from one", false]], "each call is one undo step");
  assert.ok(!bad(await a("change", { operations: [{ op: "delete", ids: [s2] }] })));
  const r = await b("change", { operations: [{ op: "edit", ids: [s2], data: [{ name: "ID", value: "late" }] }] });
  assert.match(said(r), /nothing|no |not /i);
  assert.ok(!all(d.host.doc()).flat().some(([, v]) => v === "late"));
});

test("S25 40 paclitaxels with 10 fields each", () => {
  const one = chem.indigoLayout("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C");
  let plain: Mol = { atoms: [], bonds: [] };
  for (let k = 0; k < 40; k++) plain = E.insertMol(plain, one, [20 * (k % 8), 20 * Math.floor(k / 8)]).mol;
  let m = plain;
  for (const g of E.fragments(plain)) m = D.setRows(m, g, Array.from({ length: 10 }, (_, k) => ({ name: `F${k}`, value: `value ${k}`, show: false })));
  const k = plain.bonds.findIndex((b) => b.atoms[0] >= 20 * one.atoms.length), drag = new Set(E.fragments(plain)[5]);
  for (const [what, f] of [["delete a bond", (x: Mol) => E.deleteBond(x, k)], ["drag", (x: Mol) => E.joinOverlaps(E.moveAtoms(x, drag, [0.3, 0.2]), drag)]] as [string, (x: Mol) => unknown][]) {
    slower(() => f(plain), () => f(m), 30, 10, 0.5, what);
  }
  const t = performance.now(), sd = chem.toSdf(m);
  assert.ok(performance.now() - t < 1000);
  assert.equal((sd.match(/^> </gm) ?? []).length, 400);
});

test("S26 a 500-residue peptide with 20 fields", () => {
  let peptide: Mol = chem.parseStructure("NCC(=O)O");
  for (let k = 1; k < 500; k++) peptide = E.dragBond(E.insertMol(peptide, chem.parseStructure("NCC(=O)O"), [3 * k, 0]).mol, peptide.atoms.length - 1, [3 * k, 0]);
  const all1 = peptide.atoms.map((_, i) => i);
  const t = performance.now(), m = D.setRows(peptide, all1, Array.from({ length: 20 }, (_, k) => ({ name: `F${k}`, value: `${k}`, show: false })));
  assert.ok(performance.now() - t < 200);
  const r = performance.now(), rows = D.rowsOf(m, E.fragments(m)[0]);
  assert.ok(performance.now() - r < 50, "the dialog's rows at once");
  assert.equal(rows.length, 20);
  const sd = chem.toSdf(m);
  assert.deepEqual([(sd.match(/\$\$\$\$/g) ?? []).length, (sd.match(/^> </gm) ?? []).length], [E.fragments(m).length, 20 * E.fragments(m).length]);
  slower(() => E.deleteAtoms(peptide, new Set([7])), () => E.deleteAtoms(m, new Set([7])), 25, 5, 0.5, "delete an atom");
});

test("S27 a field's text is never chemistry nor a compound number", async () => {
  const base = two(), m = fielded(base, 0, [["a", "MeOH", true], ["b", "NaCl", true], ["c", "C6H6", true], ["d", "12", true]]);
  const bold = { ...m, captions: m.captions!.map((c) => (c.text === "12" ? { ...c, bold: true } : c)) };
  assert.ok(bold.captions!.every((c) => c.chemical === false));
  assert.deepEqual(chem.analyse(bold), chem.analyse(base));
  assert.equal(nextCompound(bold), "1");
  const d = drawing("paper", "Text"), call = caller(d, "text");
  d.host.set(bold);
  const s = (await call("read", {})).result!.structuredContent.structures[0];
  assert.deepEqual([s.number, s.caption, s.formula], [undefined, undefined, "C2H6O"]);
});

test("S28 a structure replaced in place keeps its fields", async () => {
  const d = drawing("paper", "Replace"), call = caller(d, "replace");
  d.host.set(fielded(E.insertMol(ethanol(), chem.parseStructure("c1ccccc1"), [6, 0]).mol, 0, [["ID", "A"], ["mp", "5", true]]));
  const [s1] = await ids(call);
  assert.ok(!bad(await call("change", { operations: [{ op: "edit", ids: [s1], structure: "CCCO" }] })));
  const m = d.host.doc(), g = E.fragments(m).find((x) => x.length === 4)!;
  assert.deepEqual(D.rowsOf(m, g).map((r) => [r.name, r.value, r.show]), [["ID", "A", false], ["mp", "5", true]]);
});

test("S29 a field on a structure in a reaction", async () => {
  const d = drawing("paper", "Reaction"), call = caller(d, "reaction");
  d.host.set(E.addArrow(E.insertMol(ethanol(), chem.parseStructure("CC=O"), [8, 0]).mol, { from: [3, 0], to: [5, 0] } as Parameters<typeof E.addArrow>[1])[0]);
  const [s1] = await ids(call);
  assert.ok(!bad(await call("change", { operations: [{ op: "edit", ids: [s1], data: [{ name: "ID", value: "R-1" }] }] })));
  const before = all(d.host.doc()), was = d.host.doc();
  d.host.command("clean_reaction");
  assert.notEqual(d.host.doc(), was, "Clean up reaction laid it out");
  assert.deepEqual(all(d.host.doc()), before);
  const rxn = (await call("read", { format: "rxn" })).result?.structuredContent?.text as string | undefined;
  assert.ok(!rxn || !/R-1/.test(rxn), "RXN holds no fields");
});

test("S30 a template with fields", () => {
  const m = fielded(two(), 1, [["ID", "T"]]), t = E.normalise(E.extractSelection(m, new Set(atomsOf(m, 1)), new Set()));
  assert.deepEqual(all(E.addTemplate(E.EMPTY, t, { point: [0, 0] })), [[["ID", "T", false]]]);
});

test("S31 Expand and Contract label", () => {
  const m = fielded(two(), 0, [["ID", "A"]]);
  const c = E.contractLabel(m, 1, new Set([1, 2]), "CH2OH");
  assert.deepEqual(all(c)[0], [["ID", "A", false]]);
  const x = E.expandLabel(c, 1, { atoms: [{ label: "C", location: [0, 0, 0] }, { label: "O", location: [1, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] });
  assert.deepEqual(all(x)[0], [["ID", "A", false]]);
});

test("S32 Attach data with no structure selected", () => {
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), handler = editor.slice(editor.indexOf("attach_data: () => {"), editor.indexOf("select_linked: () => {"));
  assert.match(handler, /gs\.length === 1 \? gs\[0\] : undefined/, "one structure, or none");
  assert.match(handler, /if \(!atoms\) return setNotice\("Select a structure first\.", "info"\)/);
  assert.match(editor, /setNotice\("Select attached data first\.", "info"\)/);
});

const failed: string[] = [];
for (const [name, f] of cases) {
  try { await f(); } catch (e) { failed.push(name); console.error(`datafields-stress.check: ${name}: ${(e as Error).message}`); }
}
if (failed.length) {
  console.error(`datafields-stress.check: ${failed.length} of ${cases.length} cases fail`);
  process.exit(1);
}
console.log(`datafields-stress.check: ${cases.length} cases ok`);
