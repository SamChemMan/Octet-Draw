// Run: node src/longtext-stress.check.ts. Stress cases for the limits of Octet's own readers (docs/plans/long-text.md):
// each limit at, just over and far over, in each kind of text and in each form Octet writes and reads back (.oct JSON
// and its CDXML, CDXML, CDX, the recovery copy, the clipboard's copy), the editor's cuts, old files, and hostile files
// bounded in time and memory. Each case runs on its own, and the check lists every case that fails.
//
// The editor's own code (Editor.tsx, RichBox.tsx) needs the app: here the source is read to check it uses the cuts.
// With OCTET_BASE set to the src folder of release-1.1.3 (without this item), S1 times this version against it on the
// example drawings, in interleaved runs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

const { overLimit, parse, serialize } = await import("./file.ts");
const { fromCdxml, parseXml, toCdxml } = await import("./cdxml.ts");
const { cdxToXml, xmlToCdx } = await import("./cdx.ts");
const { FALLBACK, lostText, readCdx, readOct, writeCdx, writeOct } = await import("./oct.ts");
const { DEFAULT_STYLE, MAX_START, readPurposes } = await import("./docstyle.ts");
const { MAX_TEXT, cutRuns, cutText, plainOf, typedIn } = await import("./richtext.ts");
const { cutNotice } = await import("./notice.ts");
const { appendCurvePoint, contractLabel, groupTooBig, keptLabel, MAX_CELL, MAX_CURVE, MAX_LABEL, setLabel, setTableCell, splitCurve } = await import("./edit.ts");
const { MAX_STEPS, addStop } = await import("./cycle.ts");
const { isDataRole, readChart, retyped, NEW_ENERGY } = await import("./charts.ts");
const { MAX_CONTENT, NOTE } = await import("./annotate.ts");
const { COMMENT, MAX_COMMENT, MAX_VALUE, oneLine } = await import("./experiment.ts");
const { readRisk } = await import("./riskassess.ts");
const { readGrid } = await import("./stoich.ts");
const { placeCaptions } = await import("./render.ts");
const { widthOf } = await import("./arial.ts");
type Mol = import("./render.ts").Mol;
type Caption = import("./render.ts").Caption;
type TextRun = import("./richtext.ts").TextRun;

const cases: [string, () => unknown][] = [];
const it = (name: string, run: () => unknown) => cases.push([name, run]);
const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const style = DEFAULT_STYLE;
const ms = (f: () => unknown) => { const t0 = performance.now(); f(); return performance.now() - t0; };
// The heap in use after a full collection (MB), for what a read keeps.
setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void, heap = () => { gc(); return process.memoryUsage().heapUsed / 1e6; };

// Text of n UTF-16 units that reads as a procedure: words, numbers, Greek and sub- and superscript digits, a dash and an
// emoji (two units), never ending in a space or half a character.
const WORDS = ["The", "mixture", "was", "stirred", "at", "25", "°C", "for", "2", "h;", "δ", "7.26", "(CDCl₃),", "¹³C", "—", "yield", "93%.", "🧪"];
function prose(n: number): string {
  const parts: string[] = [];
  let len = 0;
  for (let k = 0; len < n + 20; k++) { const w = WORDS[k % WORDS.length]; parts.push(w); len += w.length + 1; }
  const t = cutText(parts.join(" "), n);
  return t.length === n && !/\s$/.test(t) ? t : (t.replace(/\s$/, "") + "xx").slice(0, n).replace(/[\ud800-\udbff]$/, "x").padEnd(n, "x");
}
// Runs of a text: each word in turn plain, italic, subscript and bold, so a text of 20,000 has thousands of runs.
const styledRuns = (t: string): TextRun[] => {
  const out: TextRun[] = [];
  t.split(/(?<= )/).forEach((w, k) => out.push({ text: w, ...([{}, { italic: true }, { script: "sub" }, { bold: true }] as const)[k % 4] }));
  return out;
};
// A drawing: ethanol, an arrow, and the captions given (ids from 1, as a file gives them).
const ETHANOL: Mol = { atoms: [{ label: "C", location: [0, 0, 0] }, { label: "C", location: [0.87, 0.5, 0] }, { label: "O", location: [1.73, 0, 0] }], bonds: [{ atoms: [0, 1], type: 1 }, { atoms: [1, 2], type: 1 }] };
const withTexts = (...texts: (string | Partial<Caption>)[]): Mol => {
  const captions = texts.map((t, k): Caption => ({ id: k + 1, x: 0, y: -2 - 3 * k, ...(typeof t === "string" ? { text: t } : { text: "", ...t }) }) as Caption);
  return { ...ETHANOL, captions, arrows: [{ id: captions.length + 1, kind: "reaction", from: [3, 0], to: [6, 0] }] };
};
// Every form Octet writes a drawing in and reads back: what each gives.
const forms: Record<string, (m: Mol) => ReturnType<typeof readOct>> = {
  json: (m) => ({ mol: parse(serialize({ ...m, style })), lost: {} }),
  oct: (m) => readOct(writeOct(m, style), true),
  cdx: (m) => readCdx(writeCdx(m, style)),
  recovery: (m) => readOct(serialize({ ...m, style })),
  clipboard: (m) => readOct(writeOct(m, style), true),
};
// The forms ChemDraw also reads: the CDXML alone and the CDX alone (Octet's own copy taken out).
const chemdraw: Record<string, (m: Mol) => ReturnType<typeof fromCdxml>> = {
  cdxml: (m) => fromCdxml(toCdxml(m, style)),
  "cdx alone": (m) => fromCdxml(cdxToXml(xmlToCdx(parseXml(toCdxml(m, style))))),
};
const textsOf = (m: Mol) => (m.captions ?? []).map((c) => c.text);
// What a caption's runs give, as text with each run's style.
const look = (c?: Caption) => JSON.stringify((c?.runs ?? [{ text: c?.text ?? "" }]).map((r) => [r.text, r.bold, r.italic, r.script]));

// --- L1 to L6: at each limit, every form gives the drawing back ----------------------------------------------------------

it("L1 a text of exactly MAX_TEXT characters (an experiment's procedure) comes back whole in every form", () => {
  const t = prose(MAX_TEXT), m = withTexts(t, "THF");
  assert.equal(t.length, MAX_TEXT);
  for (const [name, read] of Object.entries(forms)) {
    const r = read(m);
    assert.deepEqual(textsOf(r.mol), [t, "THF"], name);
    assert.deepEqual(r.lost, {}, name);
    assert.ok(!r.fallback && !r.foreign, `${name}: Octet's own copy`);
  }
  for (const [name, read] of Object.entries(chemdraw)) { const r = read(m); assert.deepEqual(textsOf(r.mol), [t, "THF"], name); assert.deepEqual(r.lost, {}, name); }
});

it("L2 a styled text of MAX_TEXT characters with thousands of runs comes back with its runs, in the CDX too (60,000 bytes)", () => {
  // Three bytes of UTF-8 for each unit (€): the most a text of MAX_TEXT units takes, so the CDX's 16-bit offsets hold.
  const t = Array.from({ length: MAX_TEXT / 4 }, (_, k) => (k % 3 === 2 ? "€€€ " : "€€€€")).join("").slice(0, MAX_TEXT - 1) + "€";
  const runs = styledRuns(t), m = withTexts({ text: t, runs });
  assert.equal(new TextEncoder().encode(t).length, 3 * MAX_TEXT - 2 * (t.match(/ /g)?.length ?? 0));
  assert.ok(runs.length > 300 && runs.length <= MAX_TEXT, `${runs.length} runs`);
  for (const [name, read] of Object.entries(forms)) { const c = read(m).mol.captions![0]; assert.equal(c.text, t, name); assert.equal(look(c), look(m.captions![0]), name); }
  for (const [name, read] of Object.entries(chemdraw)) { const c = read(m).mol.captions![0]; assert.equal(c.text, t, name); assert.equal(look(c), look(m.captions![0]), `${name}: each run's style at its place`); }
  // One run for every character: the most a text can have.
  const each = withTexts({ text: "ab".repeat(MAX_TEXT / 2), runs: Array.from({ length: MAX_TEXT }, (_, k) => ({ text: "ab"[k % 2], ...(k % 2 ? { italic: true as const } : {}) })) });
  assert.equal(parse(serialize(each)).captions![0].runs!.length, MAX_TEXT);
  assert.equal(readCdx(writeCdx(each, style)).mol.captions![0].runs!.length, MAX_TEXT);
});

it("L3 a note, the document comment and a risk text at their limits come back whole in every form", () => {
  const note = prose(MAX_CONTENT), comment = prose(MAX_COMMENT), risk = prose(MAX_TEXT);
  const m: Mol = { ...withTexts({ text: "Entry 1", notes: [{ keyword: NOTE, content: note }] }, "Waste"), annotations: [{ keyword: COMMENT, content: comment }],
    groups: [{ id: 9, atoms: [], items: [1, 2], risk: { substances: [], ticks: [], texts: { "head:waste": styledRuns(risk) } } }] };
  for (const [name, read] of Object.entries(forms)) {
    const r = read(m).mol;
    assert.equal(r.captions![0].notes?.[0].content, note, `${name}: note`);
    assert.equal(r.annotations?.find((a) => a.keyword === COMMENT)?.content, comment, `${name}: comment`);
    assert.equal(plainOf(r.groups?.[0].risk?.texts?.["head:waste"] ?? []), risk, `${name}: risk text`);
  }
  // Over the limit, a risk text leaves the record out: the editor's text never is (a caption, MAX_TEXT).
  assert.equal(readRisk({ substances: [], ticks: [], texts: { "head:waste": [{ text: prose(MAX_TEXT + 1) }] } }), undefined);
  assert.ok(readRisk({ substances: [], ticks: [], texts: { "head:waste": styledRuns(risk) } }), "a risk text of MAX_TEXT with its runs (was 2,000 and 200 runs)");
});

it("L4 a reagent table keyed by a reactant written as text of MAX_TEXT characters, or on two lines, comes back in every form", () => {
  const long = prose(MAX_TEXT), two = "2-bromo-4-(trifluoromethyl)benzaldehyde\n(1.2 g)";
  const keys = [`r:"${long}"`, `r:"${two}"`, `r:"${long}"#2`];
  const grid = { arrow: 3, typed: Object.fromEntries(keys.map((k) => [k, { mass: 1.5 }])), limiting: keys[0], roles: { [keys[1]]: "catalyst" as const }, text: { name: { [keys[0]]: oneLine(long) } } };
  const m: Mol = { ...withTexts(long, two), grids: [grid] };
  for (const [name, read] of Object.entries(forms)) {
    const g = read(m).mol.grids?.[0];
    assert.deepEqual(Object.keys(g?.typed ?? {}), keys, name);
    assert.equal(g?.limiting, keys[0], name);
    assert.equal(g?.roles?.[keys[1]], "catalyst", name);
    assert.equal(g?.text?.name?.[keys[0]], oneLine(long), `${name}: a name cell, one line of MAX_VALUE at most`);
  }
  // Longer than any key the editor makes: the grid is damaged, and so is the file.
  assert.equal(readGrid({ typed: { [`r:${"x".repeat(MAX_TEXT + 9)}`]: { mass: 1 } } }, 1), undefined);
  assert.throws(() => parse(serialize({ ...m, grids: [{ arrow: 3, typed: { [`r:${"x".repeat(MAX_TEXT + 9)}`]: { mass: 1 } } }] })), /damaged/);
});

it("L5 a label of MAX_LABEL characters, a table cell of MAX_CELL and a pen curve of MAX_CURVE points come back in every form", () => {
  const label = "CH2CH2CH2CH2CH2CH2CH2CH2CH2CH2CH2CH2CH3x".slice(0, MAX_LABEL), cell = prose(MAX_CELL);
  const curve = { points: Array.from({ length: MAX_CURVE }, (_, k) => ({ at: [k * 0.01, Math.sin(k / 10)] as [number, number] })) };
  const m: Mol = { ...setLabel(ETHANOL, 0, label), shapes: [{ id: 1, kind: "table", from: [0, 5], to: [8, 3], table: { cells: [[cell, "b"], ["c", "d"]] } }],
    arrows: [{ id: 2, kind: "curve", from: curve.points[0].at, to: curve.points[MAX_CURVE - 1].at, curve }] };
  assert.equal(m.atoms[0].text, label);
  for (const [name, read] of Object.entries(forms)) {
    const r = read(m).mol;
    assert.equal(r.atoms[0].text, label, `${name}: label`);
    assert.equal(r.shapes?.[0].table?.cells[0][0], cell, `${name}: cell`);
    assert.equal(r.arrows?.[0].curve?.points.length, MAX_CURVE, `${name}: curve`);
  }
});

it("L6 a cycle of MAX_STEPS steps, a side arrow's structure of 600 atoms, and 10,000 texts and 100,000 atoms come back", () => {
  const n = 600, atoms = Array.from({ length: n + MAX_STEPS }, (_, k) => ({ label: "C", location: [k % 40, -Math.floor(k / 40), 0] as [number, number, number] }));
  const bonds = Array.from({ length: n - 1 }, (_, k) => ({ atoms: [MAX_STEPS + k, MAX_STEPS + k + 1] as [number, number], type: 1 }));
  const nodes = Array.from({ length: MAX_STEPS }, (_, k) => [k]), at = nodes.map((_, k) => (2 * Math.PI * k) / MAX_STEPS);
  const side = Array.from({ length: n }, (_, k) => MAX_STEPS + k);
  const m: Mol = { atoms, bonds, cycles: [{ id: 1, centre: [0, 0], radius: 30, clockwise: true, nodes, at, branches: [{ id: 1, step: 0, in: { atoms: side } }] }] };
  for (const [name, read] of Object.entries(forms)) {
    const c = read(m).mol.cycles?.[0];
    assert.equal(c?.nodes.length, MAX_STEPS, name);
    assert.equal(c?.branches?.[0].in?.atoms?.length, n, `${name}: the side arrow's structure (was refused over 512)`);
  }
  const many: Mol = { atoms: [], bonds: [], captions: Array.from({ length: 10_000 }, (_, k) => ({ id: k + 1, text: `${k}`, x: k % 100, y: -Math.floor(k / 100) })) };
  assert.equal(parse(serialize(many)).captions!.length, 10_000);
  const big: Mol = { atoms: Array.from({ length: 100_000 }, (_, k) => ({ label: "C", location: [k % 300, -Math.floor(k / 300), 0] as [number, number, number] })), bonds: [] };
  assert.equal(parse(serialize(big)).atoms.length, 100_000);
  assert.equal(overLimit(big), undefined);
  assert.equal(overLimit(many), undefined);
});

// --- L7, L9, L10: a copy Octet cannot read, a file another program changed, old files ------------------------------------

it("L7 just over the limit (a 1.1.2 file): the JSON copy is refused, and the .oct and .cdx open from the CDXML, cut, with fallback", () => {
  for (const extra of [1, 9 * MAX_TEXT]) {
    const t = prose(MAX_TEXT + extra), m = withTexts(t, "THF");
    assert.throws(() => parse(serialize(m)), /damaged/);
    for (const r of [readOct(writeOct(m, style), true), readCdx(writeCdx(m, style))]) {
      assert.equal(r.fallback, true);
      assert.equal(r.mol.captions![0].text, cutText(t, MAX_TEXT));
      assert.equal(r.mol.captions![1].text, "THF");
      assert.deepEqual(r.lost, { [FALLBACK]: 1, character: t.length - cutText(t, MAX_TEXT).length });
      // Its style is Octet's own (the editor keeps it, as for Octet's own copy).
      assert.equal(r.mol.style?.bond, style.bond);
    }
    assert.equal(lostText(readOct(writeOct(m, style)).lost), `1 ${FALLBACK} and ${extra === 1 ? "1 character" : `${(t.length - MAX_TEXT).toLocaleString("en-GB")} characters`}`);
  }
  // A label over the limit, from a version that let it be typed: opened from the CDXML, cut and counted.
  const label = readOct(writeOct({ ...ETHANOL, atoms: ETHANOL.atoms.map((a, i) => (i ? a : { ...a, text: "x".repeat(41) })) }, style));
  assert.equal(label.fallback, true);
  assert.equal(label.mol.atoms[0].text, "x".repeat(40));
  assert.deepEqual(label.lost, { [FALLBACK]: 1, "label text": 1 });
});

it("L8 the editor's cuts: what the editor makes is within each reader's limit, and it says so when it cuts", () => {
  // Text: cutRuns keeps the first n units, never half a character, with each run's style.
  const runs = cutRuns([{ text: "ab" }, { text: "c🧪d", bold: true }], 4);
  assert.deepEqual(runs, [{ text: "ab" }, { text: "c", bold: true }]);
  assert.equal(plainOf(cutRuns(styledRuns(prose(3 * MAX_TEXT)), MAX_TEXT)).length, MAX_TEXT);
  assert.equal(cutNotice("A text", MAX_TEXT), "A text holds up to 20,000 characters. Octet left out the rest.");
  // A box at its limit (typing in the middle, a paste, the Character Map): typedIn cuts what went in, and the text
  // around it stays, never half a character; the caret goes after what went in.
  const atLimit = "x".repeat(MAX_LABEL - 2) + "OH";
  assert.deepEqual(typedIn(atLimit, `${atLimit.slice(0, 5)}Q${atLimit.slice(5)}`, MAX_LABEL), { text: atLimit, at: 5 }, "a key typed in the middle of a full label");
  assert.deepEqual(typedIn("CO2Et", `${"y".repeat(60)}CO2Et`, MAX_LABEL), { text: `${"y".repeat(35)}CO2Et`, at: 35 }, "a paste at the start");
  assert.deepEqual(typedIn("ab", "a🧪🧪b", 4), { text: "a🧪b", at: 3 });
  assert.deepEqual(typedIn("ab", "a🧪🧪b", 5), { text: "a🧪b", at: 3 }, "never half a character");
  assert.deepEqual(typedIn("abc", "aXYZc", 4), { text: "aXYc", at: 3 }, "over a selection");
  const long = prose(MAX_TEXT - 100), pasted = prose(500), into = typedIn(long, long.slice(0, 50) + pasted + long.slice(50), MAX_TEXT);
  assert.equal(into.text.length <= MAX_TEXT && into.text.endsWith(long.slice(50)) && into.text.startsWith(long.slice(0, 50)), true, "a long text keeps its end");
  // Labels: setLabel keeps MAX_LABEL characters and no < or >, whatever the box or a dialog gives it.
  assert.equal(keptLabel("x".repeat(60)), "x".repeat(MAX_LABEL));
  assert.equal(keptLabel("N<Boc>2"), "NBoc2");
  assert.equal(keptLabel("  OMe \n\n  CO2Et\t"), "OMe\nCO2Et");
  assert.equal(keptLabel(`${"y".repeat(39)}\nz`), "y".repeat(39));
  for (const text of ["x".repeat(41), "a<b", `${"CH2".repeat(20)}\tOH`, "\u0001A\u0007"]) {
    const m = setLabel(ETHANOL, 0, text);
    assert.doesNotThrow(() => parse(serialize(m)), JSON.stringify(text));
    assert.ok((m.atoms[0].text ?? "").length <= MAX_LABEL);
  }
  // Contract Label keeps its label to MAX_LABEL too, and refuses a group larger than a file keeps.
  const chain: Mol = { atoms: Array.from({ length: 300 }, (_, k) => ({ label: "C", location: [k, 0, 0] as [number, number, number] })), bonds: Array.from({ length: 299 }, (_, k) => ({ atoms: [k, k + 1] as [number, number], type: 1 })) };
  assert.ok(groupTooBig(chain, new Set(Array.from({ length: 257 }, (_, k) => k + 1))));
  assert.ok(!groupTooBig(chain, new Set(Array.from({ length: 256 }, (_, k) => k + 1))));
  // Any caller (Contract Label, a nickname defined on a group): a larger group is not contracted.
  assert.equal(contractLabel(chain, 1, new Set(Array.from({ length: 257 }, (_, k) => k + 1)), "Pg"), chain);
  const contracted = contractLabel(chain, 1, new Set(Array.from({ length: 256 }, (_, k) => k + 1)), "z".repeat(50));
  assert.equal(contracted.atoms[1].text, "z".repeat(MAX_LABEL));
  assert.equal(parse(serialize(contracted)).atoms[1].inner?.atoms.length, 256);
  // Table cells: a row pasted from a spreadsheet keeps no tab, and a cell keeps MAX_CELL characters.
  const sh = { id: 1, kind: "table" as const, from: [0, 0] as [number, number], to: [4, -2] as [number, number], table: { cells: [["", ""]] } };
  assert.equal(setTableCell(sh, 0, 0, "a\tb\tc").table!.cells[0][0], "a b c");
  assert.equal(setTableCell(sh, 0, 0, prose(2 * MAX_CELL)).table!.cells[0][0].length, MAX_CELL);
  assert.doesNotThrow(() => parse(serialize({ ...ETHANOL, shapes: [{ ...sh, ...setTableCell(sh, 0, 0, `x\t${prose(900)}`) }] })));
  // Curves: neither Edit Curve's split nor its new end point goes past MAX_CURVE.
  const full = { points: Array.from({ length: MAX_CURVE }, (_, k) => ({ at: [k, 0] as [number, number] })) };
  assert.equal(appendCurvePoint(full, [0, 1]), full);
  assert.equal(splitCurve(full, 3, 0.5), full);
  assert.equal(appendCurvePoint({ points: full.points.slice(1) }, [0, 1]).points.length, MAX_CURVE);
  // Cycles: no stop added past MAX_STEPS.
  const nodes = Array.from({ length: MAX_STEPS }, (_, k) => [k]), cyc: Mol = { atoms: nodes.map((_, k) => ({ label: "C", location: [k, 0, 0] as [number, number, number] })), bonds: [],
    cycles: [{ id: 1, centre: [0, 0], radius: 30, clockwise: true, nodes, at: nodes.map((_, k) => (2 * Math.PI * (k + 0.5)) / MAX_STEPS) }] };
  assert.equal(addStop(cyc, 1, 0.01, []), cyc);
  const less = { ...cyc, cycles: [{ ...cyc.cycles![0], nodes: nodes.slice(1), at: cyc.cycles![0].at.slice(1) }] };
  assert.equal(addStop(less, 1, 0.01, []).cycles![0].nodes.length, MAX_STEPS);
  // Counts: overLimit names the first count a drawing is over, as the editor says it.
  assert.equal(overLimit({ atoms: Array.from({ length: 100_001 }, () => ({ label: "C", location: [0, 0, 0] })), bonds: [] }), "A drawing holds up to 100,000 atoms.");
  assert.equal(overLimit({ atoms: [], bonds: [], captions: Array.from({ length: 10_001 }, (_, k) => ({ id: k + 1, text: "a", x: 0, y: 0 })) }), "A drawing holds up to 10,000 texts.");
  assert.equal(overLimit({ atoms: [], bonds: [], fills: Array.from({ length: 10_001 }, () => ({ atoms: [0, 1, 2], colour: "#ff0000" })) }), "A drawing holds up to 10,000 ring fills.");
  // Charts: the roles retyped takes are the ones the editor cuts at 80, and a label of 80 keeps its record.
  const energy = { ...NEW_ENERGY, paths: [{ name: "A", energies: [0, 10, -5] }], frame: [10, 6] as [number, number], origin: [0, 0] as [number, number], scale: 1, text: 1, roles: [] };
  for (const role of ["state:1", "keyname:0", "name:0:1", "value:0:2", "axis-title"]) {
    assert.ok(isDataRole(role), role);
    const got = retyped(energy, role, role.startsWith("value") ? `12 ${"n".repeat(200)}` : "n".repeat(200));
    assert.ok(got && readChart(JSON.parse(JSON.stringify(got.chart))), `${role}: kept`);
  }
  for (const role of ["title", "level:1", "vib:0:2", "key"]) assert.ok(!isDataRole(role), role);
  // Settings keep an experiment page's text of MAX_START characters for new pages.
  const start = serialize(withTexts(prose(MAX_TEXT))).padEnd(MAX_START, " ");
  assert.equal(readPurposes({ experimentStart: start }).experimentStart, start);
  assert.equal(readPurposes({ experimentStart: `${start} ` }).experimentStart, undefined);
});

it("L8 the editor uses the cuts: the caption box, the label box, a cell, a detail, a chart label, Pen, cycles, counts, Use for new documents", () => {
  const editor = src("./Editor.tsx"), box = src("./RichBox.tsx");
  // The caption and label boxes cut what is typed or pasted at their limits, with the notice.
  assert.match(editor, /max=\{MAX_TEXT\}\s+onCut=\{\(\) => setNotice\(cutNotice\("A text", MAX_TEXT\)\)\}/);
  assert.match(editor, /max=\{MAX_LABEL\}\s+onCut=\{\(\) => setNotice\(cutNotice\("A label", MAX_LABEL\)\)\}/);
  assert.match(box, /const text = fit\(e\.clipboardData\.getData\("text\/plain"\)/, "a paste is cut to the room left, its tabs spaces");
  assert.match(box, /if \(p\.max !== undefined && plainOf\(now\)\.length > p\.max\) \{\n\s+p\.onCut\?\.\(\);\n\s+const \{ text, at \} = typedIn\(plainOf\(runs\.current\), plainOf\(now\), p\.max\);/, "typing past the limit cuts what went in");
  // Committed text: a chart label 80, a detail MAX_VALUE, any other text MAX_TEXT; tabs spaces.
  assert.match(editor, /const \[most, what\] = chartLabel \? \[80, "A chart label"\] : was\?\.field && DETAILS\.some\(\(\[k\]\) => k === was\.field\) \? \[MAX_VALUE, "A detail"\] : \[MAX_TEXT, "A text"\];/);
  assert.match(editor, /if \(over\) setNotice\(cutNotice\(what, most\)\);\n\s+const typed = over \? cutRuns\(clean, most\) : clean/);
  assert.match(editor, /if \(\/\[<>\]\/\.test\(text\)\) setNotice\("A label cannot hold < or >\. Octet left them out\."\);/);
  assert.equal(editor.match(/e\.target\.value\.replace\(\/\[<>\]\/g, ""\)\.slice\(0, MAX_LABEL\)/g)?.length, 2, "the Element and Label fields");
  assert.match(editor, /if \(v\.length <= MAX_CELL\) return setCell\(\{ \.\.\.cell, value: v \}\);\n\s+setNotice\(cutNotice\("A table cell", MAX_CELL\)\);\n\s+const \{ text, at \} = typedIn\(cell\.value, v, MAX_CELL\)/);
  assert.match(editor, /setNotice\(cutNotice\("A table cell", MAX_VALUE\)\)/, "a reagent table's text cell");
  assert.match(editor, /if \(groupTooBig\(doc, group\)\) return setNotice\("Select a group of 256 atoms or fewer\.", "info"\);/);
  assert.equal(editor.match(/>= MAX_CURVE\) return setNotice\(`A curve holds up to \$\{MAX_CURVE\.toLocaleString\("en-GB"\)\} points\.`, "info"\)/g)?.length, 2, "Pen and Edit Curve");
  assert.match(editor, /c\.nodes\.length >= MAX_STEPS\) return setNotice\(`A cycle holds up to \$\{MAX_STEPS\} steps\.`, "info"\)/);
  assert.match(editor, /const over = opened \? undefined : overLimit\(risked\);\n\s+if \(over && !overLimit\(doc\)\) \{ setNotice\(over, "info"\); return doc; \}/);
  assert.match(editor, /all\.length <= MAX_START \? all : undefined;\n\s+if \(all && !start\) setNotice\(/);
  // A file opened from its CDXML because its own copy failed says so, keeps its style, and Save asks first.
  assert.match(editor, /const other = read\.foreign && !read\.fallback;/);
  assert.match(editor, /if \(read\.fallback\) setNotice\(`Octet cannot read its own copy of this drawing\. It opened the ChemDraw copy, without Octet's own extras\.\$\{more\}`, "error"\);/);
  assert.match(editor, /setFile\(path \? \{ path, saved: mol, lost: Object\.keys\(lost\)\.length \? lost : undefined \}/, "lost (with the copy counted) makes Save ask");
  // The chart dialog's name cells take 80, as the chart keeps.
  assert.match(src("./ChartDialog.tsx"), /maxLength=\{isName\(r, c\) \? 80 : 200\}/);
});

it("L9 a file another program changed opens from its CDXML as before: foreign, no fallback, nothing counted for it", () => {
  const file = writeOct(withTexts(prose(MAX_TEXT)), style), changed = readOct(file.replace("<s ", '<s color="3" '));
  assert.equal(changed.foreign, true);
  assert.equal(changed.fallback, undefined);
  assert.ok(!(FALLBACK in changed.lost));
  assert.equal(changed.mol.captions![0].text.length, MAX_TEXT);
  // Saved by ChemDraw since: resaved, as before.
  const resaved = readOct(file.replace(/CreationProgram="[^"]*"/, 'CreationProgram="ChemDraw 22.2.0.3300"').replace("<s ", '<s color="3" '), true);
  assert.equal(resaved.resaved, true);
  assert.equal(resaved.fallback, undefined);
});

it("L10 1.1.2's files: a caption of 2,500 characters now opens whole from Octet's own copy; one of 25,000 from the CDXML, cut and counted", () => {
  // The file as 1.1.2 writes it: the same CDXML and comment, the JSON named by its version.
  const as112 = (m: Mol) => {
    const f = writeOct(m, style), at = f.lastIndexOf("<!--Octet 1 "), [hash, b64] = f.slice(at + 12, -4).split(" ");
    const json = Buffer.from(b64, "base64").toString("utf8").replace(/"app": "[^"]*"/, '"app": "1.1.2"');
    return `${f.slice(0, at)}<!--Octet 1 ${hash} ${Buffer.from(json, "utf8").toString("base64")}-->\n`;
  };
  const t2 = prose(2500), r2 = readOct(as112(withTexts(t2)), true);
  assert.equal(r2.mol.captions![0].text, t2);
  assert.deepEqual(r2.lost, {});
  const t25 = prose(25_000), r25 = readOct(as112(withTexts(t25)), true);
  assert.equal(r25.fallback, true);
  assert.equal(r25.mol.captions![0].text, cutText(t25, MAX_TEXT));
  assert.deepEqual(r25.lost, { [FALLBACK]: 1, character: 25_000 - cutText(t25, MAX_TEXT).length });
  // A 1.1.2 file that opened cut and was saved again (2,000 characters) opens as it was saved.
  const cut2000 = cutText(t2, 2000);
  assert.equal(readOct(as112(withTexts(cut2000)), true).mol.captions![0].text, cut2000);
});

// --- H1 to H6: hostile files at the new limits read fast and in bounded memory -----------------------------------------

it("H1 a .oct JSON of 60 MB (3,000 texts of MAX_TEXT, at the file size limit) reads in time linear in its size", () => {
  // Each text its own (no two the same), so nothing is shared.
  const text = prose(MAX_TEXT - 6), own = (k: number) => `${String(k).padStart(5, "0")} ${text}`;
  const file = (n: number) => JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, captions: Array.from({ length: n }, (_, k) => ({ text: own(k), x: k, y: 0 })) });
  const small = file(300), big = file(3000);
  assert.ok(big.length > 60e6 && big.length < 64 * 1024 * 1024, `${big.length}`);
  parse(small);
  const tSmall = Math.min(ms(() => parse(small)), ms(() => parse(small))), heap0 = heap();
  let m: Mol | undefined;
  const tBig = ms(() => { m = parse(big); }), grown = heap() - heap0;
  assert.equal(m!.captions!.length, 3000);
  assert.ok(tBig < 15_000, `read in ${tBig.toFixed(0)} ms`);
  assert.ok(tBig < 40 * tSmall + 2000, `ten times the size in ${(tBig / tSmall).toFixed(1)} times the time (${tSmall.toFixed(0)} ms, ${tBig.toFixed(0)} ms)`);
  assert.ok(grown < 4 * big.length / 1e6, `heap grew ${grown.toFixed(0)} MB for a ${(big.length / 1e6).toFixed(0)} MB file`);
  console.log(`longtext-stress: H1 6 MB in ${tSmall.toFixed(0)} ms, 60 MB in ${tBig.toFixed(0)} ms, heap +${grown.toFixed(0)} MB`);
});

it("H2 a CDXML with one text of 60 million characters: cut to MAX_TEXT and counted, fast", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" ?><CDXML><page id="1"><t id="2" p="10 10"><s>${"a b ".repeat(15_000_000)}</s></t></page></CDXML>`;
  let r: ReturnType<typeof fromCdxml> | undefined;
  const t = ms(() => { r = fromCdxml(xml); });
  assert.equal(r!.mol.captions![0].text.length, MAX_TEXT);
  assert.deepEqual(r!.lost, { character: 60_000_000 - MAX_TEXT });
  assert.ok(t < 15_000, `read in ${t.toFixed(0)} ms`);
  console.log(`longtext-stress: H2 60 MB CDXML text in ${t.toFixed(0)} ms`);
});

it("H3 10,001 texts, arrows, shapes or groups and 100,001 atoms are refused fast", () => {
  const base = { format: "octet", version: 1, structure: { atoms: [], bonds: [] } };
  for (const [k, item] of [["captions", { text: "a", x: 0, y: 0 }], ["arrows", { kind: "line", x1: 0, y1: 0, x2: 1, y2: 0 }], ["shapes", { kind: "box", x1: 0, y1: 0, x2: 1, y2: 1 }], ["groups", { atoms: [], items: [] }]] as const) {
    const json = JSON.stringify({ ...base, [k]: Array.from({ length: 10_001 }, () => item) });
    assert.ok(ms(() => assert.throws(() => parse(json), /damaged/)) < 2000, k);
  }
  const atoms = JSON.stringify({ ...base, structure: { atoms: Array.from({ length: 100_001 }, () => ({ label: "C", x: 0, y: 0 })), bonds: [] } });
  assert.ok(ms(() => assert.throws(() => parse(atoms), /damaged/)) < 2000);
});

it("H4 JSON nested 100,000 deep and CDXML nested 10,000 deep are refused fast, with Octet's own words", () => {
  const deep = `{"format":"octet","version":1,"structure":{"atoms":[],"bonds":[]},"captions":[{"text":"a","x":0,"y":0,"runs":${"[".repeat(100_000)}${"]".repeat(100_000)}}]}`;
  const t = ms(() => assert.throws(() => parse(deep), (e: Error) => /^This (drawing is damaged|file is not an Octet drawing)\.$/.test(e.message)));
  assert.ok(t < 2000, `${t.toFixed(0)} ms`);
  const xml = `<?xml version="1.0" ?><CDXML><page id="1">${"<group>".repeat(10_000)}${"</group>".repeat(10_000)}</page></CDXML>`;
  assert.ok(ms(() => assert.throws(() => fromCdxml(xml), (e: Error) => !(e instanceof RangeError))) < 2000);
});

it("H5 a reagent table of 60 columns keyed by texts of MAX_TEXT characters, with 400 cells, reads fast", () => {
  const keys = Array.from({ length: 60 }, (_, k) => `r:"${k}${prose(MAX_TEXT - 2)}"`);
  const raw = { typed: Object.fromEntries(keys.map((k) => [k, { mass: 1, moles: 2, equiv: 1 }])), roles: Object.fromEntries(keys.map((k) => [k, "reactant"])),
    text: Object.fromEntries(["name", "formula", "mw", "mass", "moles", "equiv", "volume"].map((row) => [row, Object.fromEntries(keys.map((k) => [k, "x".repeat(300)]))])) };
  let g: ReturnType<typeof readGrid>;
  const t = ms(() => { g = readGrid(JSON.parse(JSON.stringify(raw)), 1); });
  assert.equal(Object.keys(g!.typed).length, 60);
  assert.equal(Object.values(g!.text ?? {}).reduce((n, r) => n + Object.keys(r).length, 0), 400, "at most 400 cells");
  assert.ok(t < 1000, `${t.toFixed(0)} ms`);
});

it("H6 one text of MAX_TEXT characters with hundreds of runs, wrapped to a width, is laid out fast", () => {
  const t = prose(MAX_TEXT), c: Caption = { id: 1, text: t, runs: styledRuns(t).slice(0, 400).concat([{ text: t.slice(styledRuns(t).slice(0, 400).map((r) => r.text).join("").length) }]), x: 0, y: 0, width: 30 };
  assert.equal(plainOf(c.runs!), t);
  const size = 10, width = (s: string) => widthOf(s, size);
  let placed: ReturnType<typeof placeCaptions> = [];
  const time = ms(() => { placed = placeCaptions({ ...ETHANOL, captions: [c] }, { ink: [], scale: 14.4 }, width, [], 1, size, new Map(), (s) => width(s)); });
  assert.ok(placed[0].lines.length > 100, `${placed[0].lines.length} lines`);
  assert.ok(time < 1500, `laid out in ${time.toFixed(0)} ms`);
  const plain = ms(() => placeCaptions({ ...ETHANOL, captions: [{ ...c, runs: undefined }] }, { ink: [], scale: 14.4 }, width, [], 1, size, new Map(), (s) => width(s)));
  assert.ok(plain < 1500, `plain text laid out in ${plain.toFixed(0)} ms`);
  console.log(`longtext-stress: H6 ${placed[0].lines.length} lines laid out in ${time.toFixed(0)} ms (plain text: ${plain.toFixed(0)} ms)`);
});

// --- S1: speed on normal files against release-1.1.3 -------------------------------------------------------------------

it("S1 the example drawings read and write as fast as release-1.1.3 (interleaved runs; OCTET_BASE)", async () => {
  const base = process.env.OCTET_BASE;
  if (!base) return console.log("longtext-stress: S1 skipped (set OCTET_BASE to release-1.1.3's src folder)");
  const at = (f: string) => new URL(`file://${base.replace(/\/$/, "")}/${f}`).href;
  const was = { file: await import(at("file.ts")), oct: await import(at("oct.ts")), cdxml: await import(at("cdxml.ts")), style: (await import(at("docstyle.ts"))).DEFAULT_STYLE };
  const dir = new URL("./examples/", import.meta.url), ids = (JSON.parse(readFileSync(new URL("examples.json", dir), "utf8")) as { id: string }[]).map((x) => x.id);
  const texts = ids.map((id) => readFileSync(new URL(`${id}.json`, dir), "utf8"));
  const run = (f: typeof was.file, o: typeof was.oct, x: typeof was.cdxml, s: typeof style) => () => {
    for (const t of texts) { const m = f.parse(t), file = o.writeOct(m, s); o.readOct(file, true); x.fromCdxml(x.toCdxml(m, s)); o.readCdx(o.writeCdx(m, s)); f.serialize(m); }
  };
  const before = run(was.file, was.oct, was.cdxml, was.style), now = run({ parse, serialize } as typeof was.file, { readOct, writeOct, readCdx, writeCdx } as typeof was.oct, { fromCdxml, toCdxml } as typeof was.cdxml, style);
  for (let k = 0; k < 3; k++) { before(); now(); }
  const a: number[] = [], b: number[] = [];
  for (let k = 0; k < 15; k++) if (k % 2) { b.push(ms(now)); a.push(ms(before)); } else { a.push(ms(before)); b.push(ms(now)); }
  const med = (xs: number[]) => [...xs].sort((p, q) => p - q)[xs.length >> 1];
  console.log(`longtext-stress: S1 examples read and written: release-1.1.3 ${med(a).toFixed(1)} ms, this ${med(b).toFixed(1)} ms (medians of 15)`);
  assert.ok(med(b) <= med(a) * 1.1 + 2, `${med(b).toFixed(1)} ms against ${med(a).toFixed(1)} ms`);
});

// ---------------------------------------------------------------------------------------------------------------------

let failed = 0;
// The speed case first, before the other cases have run the same code on other kinds of drawing.
for (const [name, run] of [...cases].sort((p, q) => Number(!p[0].startsWith("S1")) - Number(!q[0].startsWith("S1")))) {
  try { await run(); } catch (e) { failed++; console.error(`FAIL ${name}\n  ${e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n  ") : e}`); }
}
console.log(`longtext-stress: ${cases.length - failed} of ${cases.length} cases pass`);
process.exit(failed ? 1 : 0);
