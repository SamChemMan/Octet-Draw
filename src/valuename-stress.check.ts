// Run: node src/valuename-stress.check.ts. Stress cases for live values without the names of their properties (issue
// 77) and the drawing's comment (issue 100), written to break them: every case of the plan's stress list
// (docs/plans/issue-77-100-value-name-comment.md, S1 to S40) and more of our own (N1 on). Each case runs on its own and
// the check lists every case that fails, so one failure does not hide the next. The AI apps' tools run on Octet with no
// window (scripts/headless), with Indigo, Octet's calculators and its dictionary, as the window runs them.
//
// Cases that need the app or another program were tried by hand on 17 November 2026 and their results are in the
// commit that added this file: the app at port 1463 in Chromium (Properties panel, Actions panel, command palette,
// Settings, dark mode), npm run look (WebKit), and ChemDraw 22.2 (CDXML and CDX made here, opened and saved again).
//
// With OCTET_112 set to the src folder of a 1.1.2 tree (v1.1.2, 6395bd5), the cases marked 1.1.2 also run Octet
// 1.1.2's own reader, live update and writer on the files 1.2 writes.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("valuename-stress: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { DEFAULT_STYLE, readStyle } = await import("./docstyle.ts");
const { addCaption, erase, extractSelection, fragments, insertMol } = await import("./edit.ts");
const { parse, serialize } = await import("./file.ts");
const { fromCdxml, parseXml, toCdxml } = await import("./cdxml.ts");
const { cdxToXml, xmlToCdx } = await import("./cdx.ts");
const { lostText, readCdx, readOct, writeCdx, writeOct } = await import("./oct.ts");
const { COMMENT, MAX_COMMENT, PROPERTIES, commentText, detailsOf, oneLine, templateOf, withDetails } = await import("./experiment.ts");
const { NO_NAMES, liveValues, nameValues, namesShown, propertyRuns, propertyValues, withNames, PROPERTY_ROWS } = await import("./proprows.ts");
const { plainOf } = await import("./richtext.ts");
type Mol = import("./render.ts").Mol;
type Caption = import("./render.ts").Caption;
type PropertyValues = import("./proprows.ts").PropertyValues;
await load();

const cases: [string, () => unknown][] = [];
const it = (name: string, run: () => unknown) => cases.push([name, run]);
const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

// A drawing with no window, its tools called as an AI app calls them (one session per name).
let d = drawing("paper", "Stress"), n = 0;
const call = async (name: string, args: unknown, s = "stress") => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Stress", s))).result;
const text = (o: { content: { text: string }[] }) => o.content[0].text;
const fresh = async (...structures: string[]) => {
  d = drawing("paper", "Stress");
  assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);
  if (structures.length) { const o = await call("draw", { kind: "structures", structures: structures.map((t) => ({ text: t })) }); assert.ok(!o.isError, text(o)); }
};
const doc = () => d.host.doc();
const caps = () => doc().captions ?? [];
const live = () => caps().filter((c) => c.property?.attrs.rows);
const byId = (m: Mol, id: number) => m.captions!.find((c) => c.id === id)!;
// The window's live values: Indigo, Octet's calculators and its dictionary, for the drawing given.
const values = (m: Mol, cas = false) => (atoms: number[], places?: number) => d.host.values(m, atoms, places, cas);
const addValues = async (args: Record<string, unknown>) => { const o = await call("advanced", { tool: "add_values", args }); assert.ok(!o.isError, text(o)); return caps().at(-1)!; };
const cmd = (command: string, ids?: string[]) => call("advanced", { tool: "run_command", args: { command, ...(ids ? { ids } : {}) } });
const C = (x: number, y = 0) => ({ label: "C", location: [x, y, 0] as [number, number, number] });
const style = () => readStyle(doc().style ?? DEFAULT_STYLE);
// The comment after each way through Octet's files: CDXML, CDX from the CDXML, .oct, .oct's CDXML alone, Octet's CDX.
const through = (m: Mol) => {
  const cdxml = toCdxml(m, DEFAULT_STYLE), oct = writeOct(m, DEFAULT_STYLE);
  return [fromCdxml(cdxml).mol, fromCdxml(cdxToXml(xmlToCdx(parseXml(cdxml)))).mol, readOct(oct).mol, readOct(oct.replace(/<!--Octet[^]*$/, "")).mol, readCdx(writeCdx(m, DEFAULT_STYLE)).mol]
    .map((x) => detailsOf(x.annotations, PROPERTIES).comment);
};
const withComment = (props: Record<string, string>, more: { keyword: string; content: string }[] = []): Mol => ({ atoms: [C(0)], bonds: [], annotations: withDetails(more, props, PROPERTIES) });
const time = async (f: () => unknown) => { const t = performance.now(); await f(); return performance.now() - t; };
const median = (l: number[]) => [...l].sort((p, q) => p - q)[l.length >> 1];
const old = process.env.OCTET_112 ? new URL(`file://${process.env.OCTET_112.replace(/\/?$/, "/")}`) : undefined;

// ---------------------------------------------------------------------------------------------------------------------
// #77: live values without names.

it("S1 hide the names, then add an atom: the value changes, still without names", async () => {
  await fresh("propane");
  const v = await addValues({ ids: ["s1"], rows: ["formula", "weight"], names: false });
  assert.equal(v.text, "C3H8\n44.10");
  const m = doc(), end = m.atoms.findIndex((a, i) => m.bonds.filter((b) => b.atoms.includes(i)).length === 1);
  const grown: Mol = { ...m, atoms: [...m.atoms, C(m.atoms[end].location[0] + 1, m.atoms[end].location[1] + 1)], bonds: [...m.bonds, { type: 1, atoms: [end, m.atoms.length] }] };
  const after = byId(liveValues(grown, values(grown)), v.id);
  assert.equal(after.text, "C4H10\n58.12");
  assert.ok(!namesShown(after.property!.attrs.rows!));
});

it("S2 add without names, change the structure, Show property names, then Undo three times and Redo three times", async () => {
  await fresh("ethanol");
  const v = await addValues({ ids: ["s1"], rows: ["weight"], names: false });
  const added = doc();
  // The structure as changed by hand (an O made N), then the live update in the same step, as the editor amends it.
  const o = added.atoms.findIndex((a) => a.label === "O"), changed: Mol = { ...added, atoms: added.atoms.map((a, i) => (i === o ? { ...a, label: "N" } : a)) };
  d.host.begin("stress"); d.host.set(liveValues(changed, values(changed))); d.host.end();
  const edited = doc();
  assert.equal(byId(edited, v.id).text, "45.08");
  assert.ok(!(await cmd("caption.names", [`t${v.id}`])).isError);
  const shown = doc();
  assert.equal(byId(shown, v.id).text, "Molecular weight: 45.08");
  const seen: string[] = [];
  for (let k = 0; k < 3; k++) { assert.ok(!(await cmd("undo")).isError); seen.push(byId(doc(), v.id)?.text ?? "(none)"); }
  for (let k = 0; k < 3; k++) { assert.ok(!(await cmd("redo")).isError); seen.push(byId(doc(), v.id)?.text ?? "(none)"); }
  assert.deepEqual(seen.slice(0, 2), ["45.08", "46.07"]);
  assert.deepEqual(seen.slice(-2), ["45.08", "Molecular weight: 45.08"]);
  // The live update after each step finds nothing to change: it adds no step.
  for (const m of [added, edited, shown]) assert.equal(liveValues(m, values(m)), m);
});

it("S3 new text typed over a value with hidden names makes it plain text with what was typed", async () => {
  await fresh("benzene");
  const v = await addValues({ ids: ["s1"], rows: ["weight"], names: false });
  assert.ok(!(await call("change", { operations: [{ op: "edit", ids: [`t${v.id}`], text: "MW 78" }] })).isError);
  const c = byId(doc(), v.id);
  assert.deepEqual([c.text, c.property], ["MW 78", undefined]);
  assert.equal(liveValues(doc(), values(doc())), doc(), "plain text stays as typed");
});

it("S4 copy a structure and its value, paste into another drawing: live, names hidden; the value alone is plain text", async () => {
  await fresh("toluene");
  const v = await addValues({ ids: ["s1"], rows: ["formula", "weight"], names: false, decimals: 3 });
  const m = doc(), atoms = new Set(fragments(m)[0]);
  // In one window (Octet's own form, as Copy writes it) and through the clipboard's CDXML.
  const own = parse(serialize({ ...extractSelection(m, atoms, new Set([v.id])), style: DEFAULT_STYLE }));
  const viaXml = fromCdxml(toCdxml(m, DEFAULT_STYLE, { selection: { atoms: [...atoms], items: [v.id] } })).mol;
  for (const copy of [own, viaXml]) {
    const target: Mol = { atoms: [C(-20), C(-19)], bonds: [{ type: 1, atoms: [0, 1] }], annotations: [{ keyword: COMMENT, content: "B" }] };
    const pasted = insertMol(target, copy, [5, 5]).mol, value = pasted.captions!.find((c) => c.property?.attrs.rows)!;
    assert.equal(value.property!.attrs.rows, `formula weight ${NO_NAMES}`);
    assert.deepEqual(value.property!.atoms, [...atoms].sort((p, q) => p - q).map((_, k) => k + 2));
    // Live in the new drawing: a carbon drawn on its structure changes it, still without names.
    const grown: Mol = { ...pasted, atoms: [...pasted.atoms, C(30, 30)], bonds: [...pasted.bonds, { type: 1, atoms: [2, pasted.atoms.length] }] };
    assert.equal(byId(liveValues(grown, values(grown)), value.id).text, "C8H10\n106.168");
    assert.deepEqual(pasted.annotations, [{ keyword: COMMENT, content: "B" }], "the drawing pasted into keeps its comment (S38)");
  }
  const alone = fromCdxml(toCdxml(m, DEFAULT_STYLE, { selection: { atoms: [], items: [v.id] } })).mol.captions![0];
  assert.deepEqual([alone.text, alone.property], [v.text, undefined]);
});

it("S5 delete the structure: its value goes; delete part of it: the value follows what is left", async () => {
  await fresh("butane");
  const v = await addValues({ ids: ["s1"], rows: ["formula"], names: false });
  const m = doc();
  assert.equal(erase(m, new Set(), new Set(fragments(m)[0])).captions?.find((c) => c.id === v.id), undefined);
  const end = m.atoms.findIndex((_, i) => m.bonds.filter((b) => b.atoms.includes(i)).length === 1), cut = erase(m, new Set(), new Set([end]));
  const c = byId(liveValues(cut, values(cut)), v.id);
  assert.deepEqual([c.text, namesShown(c.property!.attrs.rows!)], ["C3H8", false]);
});

it("S6 1.1.2 opens a 1.2 .oct with hidden names from its own data, shows the names and keeps them live; 1.2 hides them again", async () => {
  if (!old) return;
  const R = await import(new URL("oct.ts", old).href), P = await import(new URL("proprows.ts", old).href);
  await fresh("ethane");
  const v = await addValues({ ids: ["s1"], rows: ["formula", "weight", "logp"], names: false });
  const m = { ...doc(), annotations: withDetails(undefined, { title: "T", comment: "Line 1\n\nLine 3 é 日本 😀" }, PROPERTIES) };
  const r = R.readOct(writeOct(m, style()));
  assert.equal(r.foreign, undefined, "1.1.2 reads its own data, not the CDXML copy");
  assert.deepEqual(r.lost, {});
  const stand = (atoms: number[], places?: number) => P.propertyValues([{ formula: "C2H6", weight: 30.069, exact: 30.047, composition: "", logP: 1.32 }], undefined, places);
  const shown = P.liveValues(r.mol, stand), c = shown.captions.find((x: Caption) => x.property?.attrs.rows);
  assert.equal(c.text, "Formula: C2H6\nMolecular weight: 30.07\nlogP (predicted): 1.32");
  const back = readOct(R.writeOct(shown, style()));
  assert.equal(back.foreign, undefined);
  assert.equal(byId(liveValues(back.mol, values(back.mol)), c.id).text.split("\n")[0], "C2H6");
  assert.equal(detailsOf(back.mol.annotations, PROPERTIES).comment, "Line 1\n\nLine 3 é 日本 😀", "the comment survives 1.1.2's save (S33)");
  void v;
});

it("S7 what ChemDraw gets: the value as plain text (no chemical property object), the comment on the root", async () => {
  await fresh("aspirin");
  await addValues({ ids: ["s1"], rows: ["formula", "weight", "logp"], names: false });
  const xml = toCdxml({ ...doc(), annotations: withDetails(undefined, { comment: "a\nb" }, PROPERTIES) }, style());
  assert.ok(!/chemicalproperty/i.test(xml));
  assert.match(xml, /<CDXML[^>]*\sComment="a&#10;b"/);
  assert.match(xml, />C<\/s>.*>9<\/s>/s);
});

it("S8 picked: a value with names, a value without, plain text: Hide hides both, plain text stays; again Shows both", async () => {
  await fresh("ethanol", "benzene");
  const a = await addValues({ ids: ["s1"], rows: ["weight"] }), b = await addValues({ ids: ["s2"], rows: ["weight"], names: false });
  assert.ok(!(await call("change", { operations: [{ op: "text", text: "Plain words" }] })).isError);
  const t = caps().at(-1)!, ids = [a, b, t].map((c) => `t${c.id}`);
  assert.ok(!(await cmd("caption.names", ids)).isError);
  assert.deepEqual([a, b, t].map((c) => byId(doc(), c.id).text), ["46.07", "78.11", "Plain words"]);
  assert.ok(!(await cmd("caption.names", ids)).isError);
  assert.deepEqual([a, b, t].map((c) => byId(doc(), c.id).text), ["Molecular weight: 46.07", "Molecular weight: 78.11", "Plain words"]);
});

it("S9 a value on a structure Indigo cannot read: the setting changes, the text stays, then it is right once it reads", async () => {
  let [m, id] = addCaption({ atoms: [C(0), { label: "R", location: [1, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] }, { text: "Molecular weight: 15.03", x: 0, y: 0, under: [0, 1], property: { attrs: { rows: "weight" }, atoms: [0, 1] } });
  const s = nameValues(m, new Set([id]));
  const after = liveValues(s.mol, () => undefined, s.changed);
  assert.deepEqual([byId(after, id).text, byId(after, id).property!.attrs.rows], ["Molecular weight: 15.03", `weight ${NO_NAMES}`]);
  m = { ...after, atoms: after.atoms.map((a) => (a.label === "R" ? C(1) : a)) };
  assert.equal(byId(liveValues(m, values(m)), id).text, "30.07");
});

it("S10 a value with the CAS row: hidden names keep the number", async () => {
  await fresh("benzene");
  const v = await addValues({ ids: ["s1"], rows: ["cas", "weight"] });
  assert.equal(v.text, "CAS number: 71-43-2\nMolecular weight: 78.11");
  assert.ok(!(await cmd("caption.names", [`t${v.id}`])).isError);
  assert.equal(byId(doc(), v.id).text, "71-43-2\n78.11");
});

it("S11 every predicted row with names hidden is marked (predicted) after its value", async () => {
  await fresh("aspirin");
  const predicted = PROPERTY_ROWS.flat().filter((r) => r.predicted).map((r) => r.key);
  assert.ok(predicted.length >= 12, predicted.join(" "));
  const v = await addValues({ ids: ["s1"], rows: predicted, names: false });
  const lines = v.text.split("\n");
  // (Aspirin has no Henry's law value: the other 11.)
  assert.equal(lines.length, 11, v.text);
  for (const l of lines) assert.match(l, /\(predicted\)$/, l);
});

it("S12 a bold, red, 14 pt value in Times turned 30°: after Hide and Show it is the same, in the same place", async () => {
  await fresh("ethanol");
  const v = await addValues({ ids: ["s1"], rows: ["formula", "weight"] });
  d.host.begin("style"); d.host.set({ ...doc(), captions: caps().map((c) => (c.id === v.id ? { ...c, colour: "#c42b2b", size: 14, angle: 30, font: "Times New Roman", x: 3, y: -4, runs: (c.runs ?? [{ text: c.text }]).map((r) => ({ ...r, bold: true as const })) } : c)) }); d.host.end();
  for (const k of [0, 1]) {
    assert.ok(!(await cmd("caption.names", [`t${v.id}`])).isError);
    const c = byId(doc(), v.id);
    assert.deepEqual([c.colour, c.size, c.angle, c.font, c.x, c.y, c.runs!.every((r) => r.bold)], ["#c42b2b", 14, 30, "Times New Roman", 3, -4, true], `step ${k}`);
  }
});

it("S13 hostile .oct and CDXML rows: 200 characters of -names, unknown words, only -names, a word cut short, 201 characters", async () => {
  const at = (rows: string, text = "kept") => { const [m] = addCaption({ atoms: [C(0), C(1)], bonds: [{ type: 1, atoms: [0, 1] }] }, { text, x: 0, y: 0, under: [0, 1], property: { attrs: { rows }, atoms: [0, 1] } }); return m; };
  const opened = (rows: string) => parse(serialize(at(rows))).captions![0];
  const ethane = (m: Mol) => liveValues(m, values(m)).captions![0].text;
  assert.equal(ethane(at(`weight ${`${NO_NAMES} `.repeat(27)}`.trim())), "30.07");
  assert.equal(ethane(at(`zz weight ✓ ${NO_NAMES} −names`)), "30.07");
  assert.equal(ethane(at(NO_NAMES)), "kept");
  assert.equal(ethane(at("weight -nam")), "Molecular weight: 30.07");
  assert.equal(ethane(at("weight −names")), "Molecular weight: 30.07", "a minus sign is no hyphen");
  assert.equal(opened(`weight ${NO_NAMES}`).property!.attrs.rows, `weight ${NO_NAMES}`);
  assert.throws(() => parse(serialize(at(`weight ${"x".repeat(194)}`))), /damaged/, "201 characters is damaged data (the .oct then opens from its CDXML)");
  assert.throws(() => parse(serialize(at(`weight\t${NO_NAMES}`))), /damaged/);
  // The CDXML copy of a damaged .oct still opens.
  const oct = writeOct(at(`weight ${"x".repeat(194)}`), DEFAULT_STYLE);
  assert.equal(readOct(oct).foreign, true);
});

it("S14 Hide and Show twenty times quickly: each is one step, it ends as the count says, no old text comes back", async () => {
  await fresh("benzene");
  const v = await addValues({ ids: ["s1"], rows: ["formula", "weight"] });
  const texts = new Set<string>();
  for (let k = 0; k < 20; k++) { assert.ok(!(await cmd("caption.names", [`t${v.id}`])).isError); texts.add(byId(doc(), v.id).text); }
  assert.equal(byId(doc(), v.id).text, "Formula: C6H6\nMolecular weight: 78.11");
  assert.equal(texts.size, 2);
  assert.equal(liveValues(doc(), values(doc())), doc());
  for (let k = 0; k < 20; k++) assert.ok(!(await cmd("undo")).isError);
  assert.equal(byId(doc(), v.id).text, "Formula: C6H6\nMolecular weight: 78.11", "twenty undo steps back to the value as added");
});

it("S15 40 paclitaxels: Hide on all 40 at once costs no more than one live update of them (medians, interleaved)", async () => {
  const taxol = "CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C";
  await fresh(...Array(40).fill(taxol));
  await addValues({ ids: Array.from({ length: 40 }, (_, k) => `s${k + 1}`), rows: ["formula", "exact", "weight", "mz", "analysis", "logp", "mr"] });
  const m = doc(), all = new Set(live().map((c) => c.id));
  assert.equal(all.size, 40);
  const nudge = (x: Mol): Mol => ({ ...x, atoms: x.atoms.map((a, i) => (i ? a : { ...a, location: [a.location[0] + 0.001, a.location[1], 0] as [number, number, number] })) });
  const hideT: number[] = [], updateT: number[] = [];
  for (let k = 0; k < 9; k++) {
    hideT.push(await time(() => { const s = nameValues(m, all); liveValues(s.mol, values(s.mol), s.changed); }));
    updateT.push(await time(() => { const x = nudge(m); liveValues(x, values(x)); }));
  }
  console.log(`  S15: Hide on 40 values ${median(hideT).toFixed(1)} ms, one live update of 40 ${median(updateT).toFixed(1)} ms`);
  assert.ok(median(hideT) <= median(updateT) * 1.5 + 2, `${median(hideT)} against ${median(updateT)}`);
});

it("S15b 40 paclitaxels: 1.2's live update is no slower than 1.1.2's (Octet's own work, medians, interleaved)", async () => {
  if (!old) return;
  const P = await import(new URL("proprows.ts", old).href), E = await import(new URL("edit.ts", old).href);
  const N = 40, A = 62, atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [];
  for (let s = 0; s < N; s++) for (let k = 0; k < A; k++) { atoms.push(C(s * 20 + (k % 10), Math.floor(k / 10))); if (k) bonds.push({ type: 1, atoms: [s * A + k - 1, s * A + k] }); }
  const stand = (pv: typeof propertyValues) => () => pv([{ formula: "C47H51NO14", weight: 853.91, exact: 853.33, composition: "C 66.11; H 6.02; N 1.64; O 26.23", logP: 3.2, mr: 214.3 }], undefined, 2);
  let m: Mol = { atoms, bonds }, o: Mol = { atoms, bonds };
  for (let s = 0; s < N; s++) {
    const p = { attrs: { rows: "formula exact weight mz analysis logp mr" }, atoms: Array.from({ length: A }, (_, k) => s * A + k) };
    m = addCaption(m, { text: "", x: 0, y: 0, under: p.atoms, property: p })[0];
    o = E.addCaption(o, { text: "", x: 0, y: 0, under: p.atoms, property: p })[0];
  }
  m = liveValues(m, stand(propertyValues)); o = P.liveValues(o, stand(P.propertyValues));
  const nudge = (x: Mol): Mol => ({ ...x, atoms: x.atoms.map((a, i) => (i ? a : { ...a, location: [a.location[0] + 0.01, a.location[1], 0] as [number, number, number] })) });
  const now: number[] = [], then: number[] = [];
  for (let k = 0; k < 41; k++) { now.push(await time(() => liveValues(nudge(m), stand(propertyValues)))); then.push(await time(() => P.liveValues(nudge(o), stand(P.propertyValues)))); }
  console.log(`  S15b: live update of 40 values ${median(now).toFixed(2)} ms in 1.2, ${median(then).toFixed(2)} ms in 1.1.2`);
  assert.ok(median(now) <= median(then) * 1.2 + 0.5, `${median(now)} against ${median(then)}`);
});

it("S16 a 120-residue peptide (605 atoms) with a value: hiding the names is one update", async () => {
  await fresh(`N${"[C@@H](C)C(=O)N".repeat(120)}CC(=O)O`);
  const v = await addValues({ ids: ["s1"], rows: ["formula", "weight"] });
  let calls = 0;
  const m = doc(), s = nameValues(m, new Set([v.id]));
  const after = liveValues(s.mol, (atoms, places) => { calls++; return d.host.values(s.mol, atoms, places, false); }, s.changed);
  assert.equal(calls, 1);
  assert.equal(byId(after, v.id).text, "C362H605N121O122\n8604.55");
});

it("S17 the shorter value stays centred under its structure", async () => {
  await fresh("aspirin");
  const v = await addValues({ ids: ["s1"], rows: ["formula", "weight", "logp"] });
  const centre = async () => { const r = (await call("read", { detail: "full" })).structuredContent; const s = r.structures[0].box, t = r.captions.find((c: { id: string }) => c.id === `t${v.id}`).box; return [(s[0] + s[2]) / 2, (t[0] + t[2]) / 2, t[3] <= s[1]]; };
  const [s1, t1, below1] = await centre();
  assert.ok(!(await cmd("caption.names", [`t${v.id}`])).isError);
  const [s2, t2, below2] = await centre();
  assert.ok(Math.abs((t1 as number) - (s1 as number)) < 0.1 && Math.abs((t2 as number) - (s2 as number)) < 0.1 && below1 && below2, JSON.stringify([s1, t1, s2, t2]));
});

it("S18 MCP: wrong arguments are refused with a reason and change nothing", async () => {
  await fresh("ethanol");
  const v = await addValues({ ids: ["s1"], rows: ["weight"] });
  assert.ok(!(await call("change", { operations: [{ op: "arrow", kind: "reaction", from: [0, -5], to: [3, -5] }] })).isError);
  const was = doc();
  const no = async (tool: string, args: unknown, why: RegExp) => { const o = await call(tool, args); assert.ok(o.isError && why.test(text(o)), `${JSON.stringify(args)}: ${text(o)}`); assert.equal(doc(), was); };
  await no("change", { operations: [{ op: "edit", ids: [`t${v.id}`], names: "no" }] }, /names: not true or false/);
  await no("change", { operations: [{ op: "edit", ids: [`t${v.id}`], names: null }] }, /names: not true or false/);
  await no("change", { operations: [{ op: "edit", ids: [`t${v.id}`], names: 0 }] }, /names: not true or false/);
  await no("advanced", { tool: "add_values", args: { ids: ["s1"], rows: ["weight", "nope"] } }, /rows\[1\]: not one of/);
  await no("advanced", { tool: "add_values", args: { ids: ["s1"], rows: [NO_NAMES] } }, /rows\[0\]: not one of/);
  await no("advanced", { tool: "add_values", args: { ids: ["s1"], rows: ["weight"], decimals: 9 } }, /decimals: not between 0 and 8/);
  await no("advanced", { tool: "add_values", args: { ids: ["s1"], rows: ["weight"], decimals: 2.5 } }, /decimals: not a/);
  await no("advanced", { tool: "add_values", args: { ids: ["s1"], rows: "weight" } }, /rows: not a list/);
  await no("advanced", { tool: "add_values", args: { ids: Array(201).fill("s1"), rows: ["weight"] } }, /ids: more than 200 items/);
  await no("advanced", { tool: "add_values", args: { ids: ["a1"], rows: ["weight"] } }, /There is no structure a1/);
  await no("advanced", { tool: "add_values", args: { ids: [`t${v.id}`], rows: ["weight"] } }, /There is no structure t/);
  // a1 is no arrow here (the arrow is a2, the value t1): an id with the wrong letter names nothing (decision D10), for
  // every tool that takes ids.
  assert.deepEqual([v.id, was.arrows![0].id], [1, 2]);
  await no("advanced", { tool: "run_command", args: { command: "caption.names", ids: ["a1"] } }, /There is nothing with the id a1\./);
  await no("change", { operations: [{ op: "delete", ids: ["a1"] }] }, /There is nothing with the id a1\./);
  await no("change", { operations: [{ op: "delete", ids: ["b1"] }] }, /There is nothing with the id b1\./);
  await no("change", { operations: [{ op: "delete", ids: ["c1"] }] }, /There is nothing with the id c1\./);
  await no("change", { operations: [{ op: "delete", ids: ["t2"] }] }, /There is nothing with the id t2\./);
  // edit names on what is no live value (the arrow) says so, and changes nothing.
  const o = await call("change", { operations: [{ op: "edit", ids: ["a2"], names: false }] });
  assert.ok(/a2 takes no names/.test(text(o)), text(o));
  assert.equal(doc(), was);
});

it("S19 two AI sessions: one hides t's names while the other edits its structure: the value is right and hidden", async () => {
  await fresh("ethanol");
  const v = await addValues({ ids: ["s1"], rows: ["formula"] });
  assert.ok(!(await call("change", { operations: [{ op: "edit", ids: [`t${v.id}`], names: false }] }, "one")).isError);
  const r = await call("change", { operations: [{ op: "replace", structure: "s1", text: "propanol" }] }, "two");
  assert.ok(!r.isError, text(r));
  const c = live()[0];
  // replace says it keeps the structure's caption: it keeps the text ("C2H6O" under propanol) but not its data, so
  // the old value stays under the new structure and never follows it again.
  assert.ok(c, `after replace the value is dead text: ${JSON.stringify(caps().map((x) => [x.text, x.property]))}`);
  const m = liveValues(doc(), values(doc())), after = byId(m, c.id);
  assert.deepEqual([after.text, namesShown(after.property!.attrs.rows!)], ["C3H8O", false]);
});

it("S20 dark mode and the panel: the Names switch is the panels' toggle (spectrum-button with aria-pressed)", () => {
  const panel = src("Properties.tsx");
  assert.match(panel, /className="spectrum-button" aria-pressed=\{names\} aria-label="Property names"/);
  assert.ok(!/#[0-9a-f]{3,6}/i.test(panel.match(/prop-decimals[^]*?<\/span>/)![0]), "no colour of its own");
});

// ---------------------------------------------------------------------------------------------------------------------
// #100: the comment.

it("S21 empty, spaces or line breaks only: no annotation, no Comment, no Subject", () => {
  for (const c of ["", " ", "\n\n", " \r\n\t ", "\u0007"]) {
    const m = withComment({ comment: c });
    assert.equal(m.annotations, undefined, JSON.stringify(c));
    assert.doesNotMatch(toCdxml(m, DEFAULT_STYLE), /\sComment=/);
    assert.equal(detailsOf(m.annotations, PROPERTIES).comment, undefined, "no Subject in the PDF's information");
  }
});

it("S22 three lines with an empty middle line, through .oct, CDXML and CDX (ChemDraw kept it: see the commit)", () => {
  assert.deepEqual(through(withComment({ comment: "one\n\nthree" })), Array(5).fill("one\n\nthree"));
});

it("S23 a comment pasted from Excel with tabs: spaces, and the .oct opens from its own data (1.1.2 too)", async () => {
  const m = withComment({ comment: "a\tb\tc\n1\t2\t3" });
  assert.deepEqual(through(m), Array(5).fill("a b c\n1 2 3"));
  assert.equal(readOct(writeOct(m, DEFAULT_STYLE)).foreign, undefined);
  if (old) { const R = await import(new URL("oct.ts", old).href); assert.equal(R.readOct(writeOct(m, DEFAULT_STYLE)).foreign, undefined); }
});

it("S24 Windows and old Mac line ends are line feeds", () => {
  assert.deepEqual(through(withComment({ comment: "a\r\nb\rc\n\rd" })), Array(5).fill("a\nb\nc\n\nd"));
});

it("S25 10,000 characters kept; the field takes 10,000; the MCP refuses 10,001", async () => {
  assert.deepEqual(through(withComment({ comment: "x".repeat(MAX_COMMENT) })), Array(5).fill("x".repeat(MAX_COMMENT)));
  assert.match(src("SettingsWindow.tsx"), /k === "comment" \? \{ lines: 4, max: MAX_COMMENT \}/);
  await fresh();
  const o = await call("advanced", { tool: "set_style", args: { properties: { comment: "x".repeat(MAX_COMMENT + 1) } } });
  assert.ok(o.isError && /longer than 10000 characters/.test(text(o)), text(o));
  assert.equal(doc().annotations, undefined);
});

it("S26 an emoji across the 10,000th place and a title of 199 letters and an emoji: no half character anywhere", () => {
  const m = withComment({ title: `${"a".repeat(199)}😀`, comment: `${"x".repeat(MAX_COMMENT - 1)}😀` });
  const info = detailsOf(m.annotations, PROPERTIES);
  assert.equal(info.comment, "x".repeat(MAX_COMMENT - 1));
  assert.equal(info.title, "a".repeat(199));
  assert.ok(!/[\ud800-\udfff]/.test(JSON.stringify(info).replace(/\\u/g, "")) && !/(?:[^\ud800-\udbff]|^)[\udc00-\udfff]|[\ud800-\udbff](?![\udc00-\udfff])/.test(info.comment! + info.title!));
});

it("S27 a lone surrogate from a hostile .oct: dropped from the PDF's information and from every CDXML Octet writes", () => {
  const raw = `{"format":"octet","version":1,"structure":{"atoms":[{"label":"C","x":0,"y":0}],"bonds":[]},"annotations":[{"keyword":"${COMMENT}","content":"a\\ud800b\\ndone"},{"keyword":"Title","content":"T\\udc00"}]}`;
  let m: Mol;
  try { m = parse(raw); } catch { m = { atoms: [C(0)], bonds: [], annotations: [{ keyword: COMMENT, content: "a\ud800b\ndone" }, { keyword: "Title", content: "T\udc00" }] }; }
  const info = detailsOf(m.annotations, PROPERTIES);
  assert.deepEqual(info, { title: "T", comment: "ab\ndone" });
  const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  for (const out of [toCdxml(m, DEFAULT_STYLE), writeOct(m, DEFAULT_STYLE)]) assert.ok(!lone.test(out), "a CDXML with half a character cannot go to the shell (PDF, PNG, clipboard)");
  assert.ok(!lone.test(serialize(m).replace(/\\u[0-9a-f]{4}/gi, "")));
});

it("S28 PDF escaping is in export.rs (cargo test pdf_has_the_drawings_comment): the comment reaches it as written", () => {
  const info = detailsOf(withComment({ comment: "a (b) \\c )(" }).annotations, PROPERTIES);
  assert.deepEqual(info, { comment: "a (b) \\c )(" });
  assert.match(src("../src-tauri/src/export.rs"), /d\.subject\(TextStr\(v\)\)/);
});

it("S29 XML's special characters, ]]>, --, <!--Octet and --> in the comment: escaped, and the .oct still opens from its data", () => {
  const c = `& < > " ' ]]> -- <!--Octet 1 abc--> \\ end`;
  const m = withComment({ comment: c }), xml = toCdxml(m, DEFAULT_STYLE);
  assert.doesNotMatch(xml.match(/<CDXML[^>]*>/)![0].replace(/Comment="[^"]*"/, ""), /<!--/);
  assert.deepEqual(through(m), Array(5).fill(c));
  assert.equal(readOct(writeOct(m, DEFAULT_STYLE)).foreign, undefined);
});

it("S30 a ChemDraw CDXML whose Comment has literal line breaks reads as lines", () => {
  const xml = toCdxml(withComment({ title: "T" }), DEFAULT_STYLE).replace("<CDXML", '<CDXML\n Comment="first\nsecond\r\nthird"');
  assert.equal(detailsOf(fromCdxml(xml).mol.annotations, PROPERTIES).comment, "first\nsecond\nthird");
});

it("S31 a ChemDraw file with a root Comment and an annotation Comment: the root one shows; changing the Title keeps both", () => {
  const xml = toCdxml(withComment({ title: "T" }), DEFAULT_STYLE).replace("<CDXML", '<CDXML Comment="root one"').replace("</page>", '<annotation Keyword="Comment" Content="annotation one"/></page>');
  const m = fromCdxml(xml).mol;
  assert.equal(detailsOf(m.annotations, PROPERTIES).comment, "root one");
  // Settings > Document > Properties > Title changed (the same call the MCP's set_style makes).
  const edited = withDetails(m.annotations, { ...detailsOf(m.annotations, PROPERTIES), title: "New title" }, PROPERTIES);
  const both = (x?: { keyword: string; content: string }[]) => x?.filter((a) => a.keyword === COMMENT || a.keyword === "Comment").map((a) => [a.keyword, a.content]);
  assert.deepEqual(both(edited), [["Comment", "annotation one"], [COMMENT, "root one"]], "ChemDraw's own annotation Comment is lost when any property is changed");
  // Saved again: the comment on the root, the annotation as an annotation.
  const again = toCdxml({ ...m, annotations: edited }, DEFAULT_STYLE);
  assert.match(again, /<CDXML[^>]*\sComment="root one"/);
  assert.match(again, /<annotation\s+Keyword="Comment"\s+Content="annotation one"/);
  assert.deepEqual(both(fromCdxml(again).mol.annotations), [[COMMENT, "root one"], ["Comment", "annotation one"]]);
});

it("S32 a hostile CDXML or CDX with a comment of 1 MB: the file opens, Octet left out 1 comment", () => {
  const base = toCdxml(withComment({ title: "T" }), DEFAULT_STYLE);
  const r = fromCdxml(base.replace("<CDXML", `<CDXML Comment="${"z".repeat(1_000_000)}"`));
  assert.deepEqual([detailsOf(r.mol.annotations, PROPERTIES).comment, lostText(r.lost)], [undefined, "1 comment"]);
  const x = parseXml(base); x.attrs.Comment = "z".repeat(1_000_000);
  const back = fromCdxml(cdxToXml(xmlToCdx(x)));
  assert.deepEqual([detailsOf(back.mol.annotations, PROPERTIES).comment, lostText(back.lost)], [undefined, "1 comment"]);
});

it("S33 1.1.2 opens a 1.2 CDXML: it keeps the title and loses the comment (decision D2), and nothing else", async () => {
  if (!old) return;
  const X = await import(new URL("cdxml.ts", old).href);
  const r = X.fromCdxml(toCdxml(withComment({ title: "T", comment: "a\nb" }), DEFAULT_STYLE));
  assert.deepEqual([r.mol.annotations, r.lost], [[{ keyword: "Title", content: "T" }], {}]);
});

it("S34 edit the comment, Undo, Redo: one step each", async () => {
  await fresh("benzene");
  assert.ok(!(await call("advanced", { tool: "set_style", args: { properties: { comment: "one" } } })).isError);
  assert.ok(!(await call("advanced", { tool: "set_style", args: { properties: { comment: "two\nlines" } } })).isError);
  const seen = [];
  for (const c of ["undo", "undo", "redo", "redo"]) { await cmd(c); seen.push(detailsOf(doc().annotations, PROPERTIES).comment); }
  assert.deepEqual(seen, ["one", undefined, "one", "two\nlines"]);
});

it("S35 the comment field takes a new value from outside unless it has the focus (TextField)", () => {
  assert.match(src("Fields.tsx"), /useEffect\(\(\) => \{ if \(!focused\.current\) setText\(value\); \}, \[value\]\)/);
});

it("S36 two AI sessions: one sets the comment, the other the keywords: both kept", async () => {
  await fresh();
  await call("advanced", { tool: "set_style", args: { properties: { comment: "from one" } } }, "one");
  await call("advanced", { tool: "set_style", args: { properties: { keywords: "from two" } } }, "two");
  assert.deepEqual(detailsOf(doc().annotations, PROPERTIES), { keywords: "from two", comment: "from one" });
});

it("S37 an own template from an experiment page, or from a drawing: no comment", () => {
  const page: Mol = { ...withComment({ title: "T", comment: "secret" }), annotations: [...withComment({ title: "T", comment: "secret" }).annotations!, { keyword: "Notebook", content: "SE-1" }] };
  assert.equal(detailsOf(templateOf(page).annotations, PROPERTIES).comment, undefined);
});

it("S38 copy everything from a drawing with comment A, paste into one with comment B: B keeps B", () => {
  const a = { ...withComment({ comment: "A" }), atoms: [C(0), C(1)], bonds: [{ type: 1, atoms: [0, 1] as [number, number] }] };
  // Copy with nothing selected copies the whole drawing, its annotations too (Octet's own form on the clipboard).
  const clip = parse(serialize({ ...a, style: DEFAULT_STYLE }));
  assert.equal(detailsOf(clip.annotations, PROPERTIES).comment, "A");
  const b = withComment({ comment: "B" });
  assert.equal(detailsOf(insertMol(b, clip, [3, 0]).mol.annotations, PROPERTIES).comment, "B");
  assert.equal(detailsOf(fromCdxml(toCdxml(a, DEFAULT_STYLE)).mol.annotations, PROPERTIES).comment, "A", "(the CDXML on the clipboard carries A, a paste never reads it)");
});

it("S39 an experiment page and its risk assessment as PDF: one information dictionary (export.rs make_pdf_pages)", () => {
  assert.match(src("../src-tauri/src/export.rs"), /assert_eq!\(pdf\.windows\(8\)\.filter\(\|w\| w == b"\/Subject"\)\.count\(\), 1\)/);
});

it("S40 Settings search finds the comment by comment, description, notes, subject and remarks", () => {
  assert.match(src("SettingsWindow.tsx"), /k === "comment" \? " description notes subject remarks" : ""/);
});

// ---------------------------------------------------------------------------------------------------------------------
// Our own.

it("N1 ⌘A then Hide property names: a drawing of structures with their values picks every value (Actions panel)", () => {
  // ⌘A on structures and the values under them is the Structure context (captions under picked atoms count as the
  // structure's in mixOf), so the item must be there too. Tried in the app: one aspirin with a value, ⌘A, the Actions
  // panel is Structure and has no Hide property names; the command palette finds nothing for "property names".
  const editor = src("Editor.tsx"), actions = src("Actions.tsx");
  const structureContext = actions.match(/\| \{ kind: "structure";[^\n]*/)![0];
  assert.match(structureContext, /values\?:/, "the Structure context has no values, so ⌘A on structures and their values offers no Hide property names");
  assert.match(editor, /kind: "structure"[^\n]*valuesPicked\(\)/);
  // The Structure items (the Actions panel, the right-click menu and the palette all take actionItems) give it.
  const structureItems = actions.slice(actions.indexOf('case "structure":'), actions.indexOf('case "atom":'));
  assert.match(structureItems, /context\.values \? \[small\(names\(context\.values\)\)\]/);
});

it("N2 a comment typed in Settings is kept when Settings closes with Escape (or Escape clears the search first)", () => {
  // Tried in the app at port 1463. Chromium (as WebView2 on Windows), real keys: Settings > Document > Comment, type
  // two lines, press Escape: Settings closes and the comment is gone (clicking the X keeps it). WebKit (as on the
  // Mac): search Settings for "comment", type in the field it finds, press Escape: the search clears, the field goes
  // without a blur, and the comment is gone (Escape to close keeps it there). Return cannot leave this field (it makes
  // a new line), so Escape is the natural way out.
  const fields = src("Fields.tsx"), settings = src("SettingsWindow.tsx");
  const commitsOnUnmount = /useEffect\(\(\) => \(\) => \{[^}]*onChange/.test(fields) || /useEffect\(\(\) => \{[^]*?return \(\) => \{[^}]*onChange\(/.test(fields);
  const blursBeforeClose = /activeElement[^;\n]*\.blur\(\)[^\n]*\n?[^\n]*(onClose|setQuery)/.test(settings);
  assert.ok(commitsOnUnmount || blursBeforeClose, "typed text in a TextField is dropped when the field is removed without losing the focus");
});

it("N3 a ChemDraw file's own annotation with the keyword Comment stays an annotation when saved again unchanged", () => {
  const xml = toCdxml(withComment({ title: "T" }), DEFAULT_STYLE).replace("</page>", '<annotation Keyword="Comment" Content="their annotation"/></page>');
  const again = toCdxml(fromCdxml(xml).mol, DEFAULT_STYLE);
  assert.match(again, /Keyword="Comment"/, "opening and saving moves ChemDraw's annotation into the document comment");
});

it("N4 every CDXML Octet writes is XML 1.0: no U+FFFE, U+FFFF or other non-characters from a comment or title", () => {
  const m = addCaption(withComment({ title: "T\ufffe", comment: "a\uffffb\ufdd0c" }, [{ keyword: "Note", content: "n\ufffe" }]), { text: "x\ufffey\uffff", x: 0, y: 0 })[0];
  // The drawing, Settings and the PDF's information have the text the files get.
  assert.deepEqual(detailsOf(m.annotations, PROPERTIES), { title: "T", comment: "ab\ufdd0c" });
  assert.equal(oneLine("a\ufffeb\uffff"), "ab");
  const xml = toCdxml(m, DEFAULT_STYLE);
  assert.ok(!/[\ufffe\uffff]/.test(xml), "U+FFFE and U+FFFF are not XML characters: a conforming reader refuses the file");
  assert.match(xml, /Content="n"/);
  assert.match(xml, />xy<\/s>/);
  assert.equal(fromCdxml(xml).mol.captions![0].text, "xy");
});

it("N5 MCP edit with names and new text on a value: the result does not say names changed and did not fit at once", async () => {
  await fresh("benzene");
  const v = await addValues({ ids: ["s1"], rows: ["weight"] });
  const o = await call("change", { operations: [{ op: "edit", ids: [`t${v.id}`], names: false, text: "MW" }] });
  assert.ok(!(/Changed t\d+: names/.test(text(o)) && /takes no names/.test(text(o))), text(o));
  // It says once that the new text is plain text, which takes no names.
  assert.match(text(o), new RegExp(`^Changed t${v.id}: text\\. Not changed: t${v.id} takes no names: its new text is plain text\\.`));
  assert.deepEqual([byId(doc(), v.id).text, byId(doc(), v.id).property], ["MW", undefined]);
  // names alone on what takes none: nothing is listed as changed.
  const p = await call("change", { operations: [{ op: "edit", ids: [`t${v.id}`], names: true }] });
  assert.match(text(p), new RegExp(`^Octet changed nothing\\. Not changed: t${v.id} takes no names: it is not live values`));
});

it("N6 MCP comment limits: 10,000 emoji are refused cleanly, 5,000 kept whole, null and numbers refused", async () => {
  await fresh();
  let o = await call("advanced", { tool: "set_style", args: { properties: { comment: "😀".repeat(10_000) } } });
  assert.ok(o.isError, text(o));
  o = await call("advanced", { tool: "set_style", args: { properties: { comment: "😀".repeat(5_000) } } });
  assert.equal(detailsOf(doc().annotations, PROPERTIES).comment, "😀".repeat(5_000));
  for (const comment of [null, 5, ["a"], { a: 1 }]) { o = await call("advanced", { tool: "set_style", args: { properties: { comment } } }); assert.ok(o.isError, JSON.stringify(comment)); }
  assert.equal(detailsOf(doc().annotations, PROPERTIES).comment, "😀".repeat(5_000));
});

it("N7 a messy 200-structure drawing: add_values on all 200, select all, Hide: every value hidden in one step", async () => {
  await fresh(...Array.from({ length: 200 }, (_, k) => `${"C".repeat(1 + (k % 12))}c1ccc(${k % 3 ? "O" : ""}C(=O)N)cc1`));
  const t = performance.now();
  await addValues({ ids: Array.from({ length: 200 }, (_, k) => `s${k + 1}`), rows: ["formula", "weight", "logp", "tpsa"] });
  assert.ok(!(await cmd("select_all")).isError);
  assert.ok(!(await cmd("caption.names")).isError);
  const ms = performance.now() - t;
  assert.equal(live().filter((c) => !namesShown(c.property!.attrs.rows!)).length, 200);
  await cmd("undo");
  assert.equal(live().filter((c) => namesShown(c.property!.attrs.rows!)).length, 200, "one undo step shows them all again");
  console.log(`  N7: add_values on 200, select all and Hide in ${ms.toFixed(0)} ms`);
});

it("N8 a value whose structure is split in two by deleting a bond: both parts, names hidden, separated by semicolons", async () => {
  await fresh("butane");
  const v = await addValues({ ids: ["s1"], rows: ["formula"], names: false });
  const m = doc(), mid = m.bonds.findIndex((b) => b.atoms.every((i) => m.bonds.filter((x) => x.atoms.includes(i)).length === 2));
  const split = erase(m, new Set([mid]), new Set());
  assert.equal(byId(liveValues(split, values(split)), v.id).text, "C2H6; C2H6");
});

it("N9 a value untied from its structure (Un-tie keeps its data, drops under) stays live and takes Hide and Show", async () => {
  await fresh("benzene");
  const v = await addValues({ ids: ["s1"], rows: ["weight"] });
  d.host.begin("untie"); d.host.set({ ...doc(), captions: caps().map((c) => { if (c.id !== v.id) return c; const { under: _, ...free } = c; return { ...free, x: 9, y: 9 }; }) }); d.host.end();
  assert.ok(!(await cmd("caption.names", [`t${v.id}`])).isError);
  assert.deepEqual([byId(doc(), v.id).text, byId(doc(), v.id).x], ["78.11", 9]);
});

it("N10 the word in the middle of rows still hides; the next change puts it at the end, once", () => {
  assert.equal(namesShown(`formula ${NO_NAMES} weight`), false);
  assert.equal(plainOf(propertyRuns(propertyValues([{ formula: "C2H6", weight: 30.07, exact: 30.05, composition: "" }]), ["formula", NO_NAMES, "weight"], undefined, false)), "C2H6\n30.07");
  assert.equal(withNames(`formula ${NO_NAMES} weight`, false), `formula weight ${NO_NAMES}`);
  assert.equal(withNames(`formula ${NO_NAMES} weight`, true), "formula weight");
});

it("N11 every row at once with names hidden still fits the files' 200 characters, through .oct, CDXML and CDX", async () => {
  await fresh("aspirin");
  const keys = PROPERTY_ROWS.flat().map((r) => r.key);
  const v = await addValues({ ids: ["s1"], rows: keys, names: false });
  assert.ok(v.property!.attrs.rows!.length <= 200, String(v.property!.attrs.rows!.length));
  const m = doc();
  for (const back of [readOct(writeOct(m, style())), readCdx(writeCdx(m, style())), fromCdxml(toCdxml(m, style()))]) {
    assert.equal(back.mol.captions!.find((c) => c.property?.attrs.rows)?.property!.attrs.rows, v.property!.attrs.rows);
  }
});

it("N12 read gives the setting of each value and a long CJK comment without failing", async () => {
  await fresh("benzene");
  const v = await addValues({ ids: ["s1"], rows: ["weight"], names: false, decimals: 0 });
  await call("advanced", { tool: "set_style", args: { properties: { comment: "日".repeat(MAX_COMMENT), title: "T" } } });
  const r = await call("read", {}), full = await call("read", { detail: "full" });
  assert.ok(!r.isError && !full.isError);
  assert.deepEqual(r.structuredContent.structures[0].values, [{ id: `t${v.id}`, rows: ["weight"], decimals: 0, names: false }]);
  assert.equal(r.structuredContent.properties.comment, `${"日".repeat(1000)}…`);
  assert.equal(full.structuredContent.properties.comment.length, MAX_COMMENT);
});

it("N13 ChemDraw's own live property text (ChemicalPropertyType) is never a live value to the MCP", async () => {
  await fresh("ethanol");
  const m = doc(), g = fragments(m)[0];
  d.host.begin("theirs"); d.host.set(addCaption(m, { text: "Molecular Weight: 46.07", x: 0, y: -3, under: g, property: { attrs: { ChemicalPropertyType: "13" }, atoms: g } })[0]); d.host.end();
  const t = caps().at(-1)!;
  const o = await call("change", { operations: [{ op: "edit", ids: [`t${t.id}`], names: false }] });
  assert.match(text(o), /takes no names/);
  assert.equal(byId(doc(), t.id).text, "Molecular Weight: 46.07");
  assert.equal((await cmd("caption.names", [`t${t.id}`])).isError, true);
});

it("N14 Decimals from 0 to 8 stay through Hide and Show", async () => {
  await fresh("benzene");
  for (const places of [0, 4, 8]) {
    const v = await addValues({ ids: ["s1"], rows: ["weight", "exact"], decimals: places });
    await cmd("caption.names", [`t${v.id}`]);
    const c = byId(doc(), v.id), [w, e] = c.text.split("\n");
    assert.deepEqual([c.property!.attrs.places, (w.split(".")[1] ?? "").length, (e.split(".")[1] ?? "").length], [String(places), places, places], c.text);
  }
});

it("N15 a long comment with every kind of line through .oct and CDX keeps its bytes (U+2028, NEL, NBSP, RTL mark)", () => {
  const c = "a b\u0085c d‏e‮f";
  assert.deepEqual(through(withComment({ comment: c })), Array(5).fill(c));
});

it("N16 oneLine (title, author, keywords) still makes one line of a pasted multi-line title", () => {
  assert.equal(oneLine("Title\r\nsecond line\tend"), "Title second line end");
  assert.equal(commentText("x\u0000y"), "xy");
});

it("N17 a .oct that 1.1.2 saved from a ChemDraw file with an annotation Comment: no comment in Settings, the annotation kept and written back", async () => {
  const chemdraw = toCdxml(withComment({ title: "T" }), DEFAULT_STYLE).replace("</page>", '<annotation Keyword="Comment" Content="their note"/></page>');
  // 1.1.2's reader and writer when OCTET_112 is set; else 1.2's, which write the annotation as 1.1.2 does.
  const X = old ? await import(new URL("cdxml.ts", old).href) : { fromCdxml }, R = old ? await import(new URL("oct.ts", old).href) : { writeOct };
  const r = readOct(R.writeOct(X.fromCdxml(chemdraw).mol, DEFAULT_STYLE));
  assert.equal(r.foreign, undefined);
  assert.deepEqual(detailsOf(r.mol.annotations, PROPERTIES), { title: "T" }, "Settings shows no comment");
  const notes = (x?: { keyword: string; content: string }[]) => x?.filter((a) => /comment/i.test(a.keyword)).map((a) => [a.keyword, a.content]);
  assert.deepEqual(notes(r.mol.annotations), [["Comment", "their note"]]);
  for (const out of [toCdxml(r.mol, DEFAULT_STYLE), writeOct(r.mol, DEFAULT_STYLE)]) {
    assert.match(out, /<annotation\s+Keyword="Comment"\s+Content="their note"/);
    assert.doesNotMatch(out.match(/<CDXML[^>]*>/)![0], /\sComment=/);
  }
  assert.deepEqual(notes(readCdx(writeCdx(r.mol, DEFAULT_STYLE)).mol.annotations), [["Comment", "their note"]]);
  // A comment set in 1.2 then sits beside it, and each goes back where it was.
  const set = withDetails(r.mol.annotations, { ...detailsOf(r.mol.annotations, PROPERTIES), comment: "mine" }, PROPERTIES);
  assert.deepEqual(notes(readOct(writeOct({ ...r.mol, annotations: set }, DEFAULT_STYLE)).mol.annotations), [["Comment", "their note"], [COMMENT, "mine"]]);
  assert.match(toCdxml({ ...r.mol, annotations: set }, DEFAULT_STYLE), /<CDXML[^>]*\sComment="mine"[^]*Keyword="Comment"\s+Content="their note"/);
});

it("N18 replace keeps a bold value live (names hidden, 2 decimals) with the new values at once; ChemDraw's live property becomes plain text", async () => {
  await fresh("ethanol");
  const v = await addValues({ ids: ["s1"], rows: ["formula", "weight"], names: false, decimals: 2 });
  d.host.set(addCaption(doc(), { text: "Molecular Weight: 46.07", x: 0, y: -3, under: v.property!.atoms, property: { attrs: { ChemicalPropertyType: "13" }, atoms: v.property!.atoms } })[0]);
  d.host.set({ ...doc(), captions: caps().map((c) => (c.id === v.id ? { ...c, bold: true } : c)) });
  const theirs = caps().at(-1)!.id;
  const r = await call("change", { operations: [{ op: "replace", structure: "s1", text: "propanol" }] });
  assert.ok(!r.isError, text(r));
  assert.doesNotMatch(text(r), /number/, "a bold value is no compound number");
  const atoms = fragments(doc())[0].sort((p, q) => p - q), value = live();
  assert.equal(value.length, 1);
  // Live on the new atoms, its setting kept, and its text already the new structure's (no live update needed).
  assert.deepEqual([value[0].text, value[0].bold, value[0].property!.atoms, value[0].property!.attrs.places, namesShown(value[0].property!.attrs.rows!)], ["C3H8O\n60.10", true, atoms, "2", false]);
  assert.deepEqual([...value[0].under!].sort((p, q) => p - q), atoms);
  const read = await call("read", {});
  assert.deepEqual(read.structuredContent.structures[0].values, [{ id: `t${value[0].id}`, rows: ["formula", "weight"], decimals: 2, names: false }]);
  // ChemDraw's own live property is plain text now: the text as it was, no property.
  const plain = caps().filter((c) => c.text === "Molecular Weight: 46.07");
  assert.equal(plain.length, 1);
  assert.equal(plain[0].property, undefined);
  assert.ok(!caps().some((c) => c.id === theirs && c.property));
  // The next live update changes nothing.
  assert.equal(liveValues(doc(), values(doc())), doc());
});

// ---------------------------------------------------------------------------------------------------------------------

const failed: string[] = [];
for (const [name, run] of cases) {
  try { await run(); } catch (e) { failed.push(`${name}\n    ${(e as Error).message.split("\n").slice(0, 6).join("\n    ")}`); }
}
if (failed.length) {
  console.error(`valuename-stress: ${failed.length} of ${cases.length} cases fail:\n- ${failed.join("\n- ")}`);
  process.exit(1);
}
console.log(`valuename-stress: ok (${cases.length} cases${old ? ", with Octet 1.1.2" : ""})`);
