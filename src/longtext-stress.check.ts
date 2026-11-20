// Run: node src/longtext-stress.check.ts. Stress cases for the limits of Octet's own readers (docs/plans/long-text.md):
// each limit at, just over and far over, in each kind of text and in each form Octet writes and reads back (.oct JSON
// and its CDXML, CDXML, CDX, the recovery copy, the clipboard's copy), the editor's cuts, old files, and hostile files
// bounded in time and memory. Each case runs on its own, and the check lists every case that fails.
//
// The editor's own code (Editor.tsx, RichBox.tsx) needs the app: here the source is read to check it uses the cuts.
// With OCTET_BASE set to the src folder of release-1.1.3 (without this item), S1 times this version against it on the
// example drawings, in interleaved runs.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";

const { overLimit, parse, serialize } = await import("./file.ts");
const { fromCdxml, parseXml, toCdxml } = await import("./cdxml.ts");
const { cdxToXml, xmlToCdx } = await import("./cdx.ts");
const { carryDepth, deleteChosen, fragments, insertMol, keyBond, placeCentres, settleHydrogens, sprout, wholeGroups } = await import("./edit.ts");
const { keepPlace } = await import("./gridview.ts");
const { followArrows } = await import("./arrowlink.ts");
const { followCharts, followLeaders, followLevels } = await import("./pageplot.ts");
const { settleMeasures } = await import("./measurement.ts");
const { showWarnedHydrogens } = await import("./check.ts");
const { onTop } = await import("./order.ts");
const { FALLBACK, lostNotice, lostText, readCdx, readOct, replaceNote, writeCdx, writeOct } = await import("./oct.ts");
const { DEFAULT_STYLE, MAX_START, readPurposes } = await import("./docstyle.ts");
const { MAX_TEXT, cutRuns, cutText, plainOf, typedIn } = await import("./richtext.ts");
const { cutNotice } = await import("./notice.ts");
const { appendCurvePoint, contractLabel, groupTooBig, keptLabel, MAX_CELL, MAX_CURVE, MAX_LABEL, setLabel, setTableCell, splitCurve } = await import("./edit.ts");
const { MAX_STEPS, addStop } = await import("./cycle.ts");
const { isDataRole, longNames, readChart, retyped, NEW_ENERGY } = await import("./charts.ts");
const { MAX_CONTENT, NOTE } = await import("./annotate.ts");
const { COMMENT, MAX_COMMENT, MAX_VALUE, oneLine } = await import("./experiment.ts");
const { readRisk } = await import("./riskassess.ts");
const { MAX_DATA, MAX_EACH, MAX_SHOWN, MAX_VALUE: MAX_FIELD, SHOWN_OFF, leftOf, readSd, rowsOf, setRows } = await import("./datafields.ts");
const { MAX_ATOMS, MAX_CHARACTERS, stampedWithin, textOf, withinText } = await import("./limits.ts");
const { MAX_ANNOTATIONS } = await import("./annotate.ts");
const { PROPERTIES, withDetails } = await import("./experiment.ts");
const { MAX_GRIDS } = await import("./experiment.ts");
const { MAX_NOTES, noteCount } = await import("./annotate.ts");
const { nicknameProblem } = await import("./labels.ts");
const { readNicknames } = await import("./nicknames.ts");
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
    const lost = readOct(writeOct(m, style)).lost, chars = extra === 1 ? "1 character" : `${(t.length - MAX_TEXT).toLocaleString("en-GB")} characters`;
    assert.equal(lostText(lost), `Octet's own extras and ${chars}`);
    // What Octet says when it opens or adds it, and before Save writes over it (plain STE: no "part", no "could not").
    assert.equal(lostNotice(lost, "opened"), `Octet cannot read its own copy of this drawing. It opened the ChemDraw copy, without Octet's own extras. Octet left out ${chars}.`);
    assert.equal(lostNotice(lost, "added"), `Octet cannot read its own copy of this drawing. It added the ChemDraw copy, without Octet's own extras. Octet left out ${chars}.`);
    assert.equal(replaceNote(lost), `Octet cannot read its own copy of this drawing. Replace removes Octet's own extras from this file. Replace also removes ${chars}, because Octet cannot keep ${extra === 1 ? "it" : "them"}. Save As keeps the original file.`);
  }
  // Only the copy, and nothing of it: the same words, without the rest. A file that lost something else reads as before.
  assert.equal(lostNotice({ [FALLBACK]: 1 }, "added"), "Octet cannot read its own copy of this drawing. It added the ChemDraw copy, without Octet's own extras.");
  assert.equal(replaceNote({ [FALLBACK]: 1 }), "Octet cannot read its own copy of this drawing. Replace removes Octet's own extras from this file. Save As keeps the original file.");
  assert.equal(lostNotice({ annotation: 6 }, "added"), "Octet left out 6 annotations.");
  assert.equal(replaceNote({ "data field": 1 }), "Replace removes 1 data field from this file, because Octet cannot keep it. Save As keeps the original file.");
  assert.equal(lostNotice({}, "opened"), "");
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
  // The chart dialog: a value's own name longer than the chart keeps is found, so the dialog says it was cut.
  assert.ok(longNames({ paths: ["A"], rows: [["TS1", `12 (10) ${"n".repeat(81)}`]] }));
  assert.ok(!longNames({ paths: ["A".repeat(200)], rows: [["S".repeat(200), `12 (10) ${"n".repeat(80)}`]] }));
  // A data field's shown value: a file keeps it shown up to MAX_SHOWN characters, so the editor cuts typing there. One
  // longer opens with its Show off, its value whole (L11).
  const shown = setRows(ETHANOL, [0, 1, 2], [{ name: "Batch", value: prose(MAX_SHOWN), show: true }]), id = shown.data![0].caption!, again = parse(serialize(shown));
  assert.deepEqual([again.data?.[0].caption, leftOf(again)], [id, {}]);
  assert.deepEqual(leftOf(parse(serialize({ ...shown, captions: shown.captions!.map((c) => (c.id === id ? { ...c, text: prose(MAX_SHOWN + 1) } : c)) }))), { [SHOWN_OFF]: 1 });
  // Settings keep an experiment page's text of MAX_START characters for new pages.
  const start = serialize(withTexts(prose(MAX_TEXT))).padEnd(MAX_START, " ");
  assert.equal(readPurposes({ experimentStart: start }).experimentStart, start);
  assert.equal(readPurposes({ experimentStart: `${start} ` }).experimentStart, undefined);
});

it("L8 the editor uses the cuts: the caption box, the label box, a cell, a detail, a chart label, Pen, cycles, counts, Use for new documents", () => {
  const editor = src("./Editor.tsx"), box = src("./RichBox.tsx");
  // The caption and label boxes cut what is typed or pasted at their limits, with the notice (the caption box at the
  // limit of the text it edits: L17).
  assert.match(editor, /max=\{most\}\s+onCut=\{\(\) => setNotice\(cutNotice\(what, most\)\)\}/);
  assert.match(editor, /max=\{MAX_LABEL\}\s+onCut=\{\(\) => setNotice\(cutNotice\("A label", MAX_LABEL\)\)\}/);
  assert.match(box, /const lined = e\.clipboardData\.getData\("text\/plain"\)[^\n]*, text = fit\(/, "a paste is cut to the room left, its tabs spaces");
  assert.match(box, /if \(p\.max !== undefined && plainOf\(now\)\.length > p\.max\) \{\n\s+p\.onCut\?\.\(\);\n\s+const \{ text, at \} = typedIn\(plainOf\(runs\.current\), plainOf\(now\), p\.max\);/, "typing past the limit cuts what went in");
  // Committed text: a chart label 80, a detail MAX_VALUE, a shown data field MAX_SHOWN, any other text MAX_TEXT; tabs
  // spaces.
  assert.match(editor, /return chartLabel \? \[80, "A chart label"\] : was\?\.field && DETAILS\.some\(\(\[k\]\) => k === was\.field\) \? \[MAX_VALUE, "A detail"\]\n\s+: was && fieldOfCaption\(doc, was\.id\) >= 0 \? \[MAX_SHOWN, "A shown value"\] : \[MAX_TEXT, "A text"\];/, "a data field's shown value keeps MAX_SHOWN, as its file does");
  assert.match(editor, /const \[most, what\] = textMost\(was\);/, "commitWriting cuts by the same rule");
  assert.match(editor, /if \(over\) setNotice\(cutNotice\(what, most\)\);\n\s+const typed = over \? cutRuns\(clean, most\) : clean/);
  assert.match(editor, /if \(\/\[<>\]\/\.test\(text\)\) setNotice\("A label cannot hold < or >\. Octet left them out\."\);/);
  assert.equal(editor.match(/e\.target\.value\.replace\(\/\[<>\]\/g, ""\)\.slice\(0, MAX_LABEL\)/g)?.length, 2, "the Element and Label fields");
  // A table cell's box cuts as the caption box does, and makes a tab or line break a space (singleLine, before fit).
  assert.match(editor, /singleLine\n\s+base=\{cellBase\(sh\)\}[^]*?max=\{MAX_CELL\}\n\s+onCut=\{\(\) => setNotice\(cutNotice\("A table cell", MAX_CELL\)\)\}/);
  assert.match(editor, /setNotice\(cutNotice\("A table cell", MAX_VALUE\)\)/, "a reagent table's text cell");
  assert.match(editor, /if \(groupTooBig\(doc, group\)\) return setNotice\("Select a group of 256 atoms or fewer\.", "info"\);/);
  // Define Nickname: no nickname is saved for a group Contract Label refuses.
  assert.match(src("./chem.ts"), /if \(groupTooBig\(m, inGroup\)\) return "Select a group of 256 atoms or fewer\.";/);
  assert.match(editor, /!d\.group\.every\(\(i\) => doc\.atoms\[i\]\) \|\| groupTooBig\(doc, new Set\(d\.group\)\)\) return;\n\s+setDialog\(undefined\);\n\s+setSettings\(\(st\) => \(\{ \.\.\.st, nicknames: withNickname/);
  assert.equal(editor.match(/>= MAX_CURVE\) return setNotice\(`A curve holds up to \$\{MAX_CURVE\.toLocaleString\("en-GB"\)\} points\.`, "info"\)/g)?.length, 2, "Pen and Edit Curve");
  assert.match(editor, /c\.nodes\.length >= MAX_STEPS\) return setNotice\(`A cycle holds up to \$\{MAX_STEPS\} steps\.`, "info"\)/);
  assert.match(editor, /const over = opened \? undefined : overLimit\(risked, doc\);\n\s+refused\.current = !!over;\n\s+if \(over\) \{ setNotice\(over, "info"\); return doc; \}/);
  assert.match(editor, /all\.length <= MAX_START \? all : undefined;\n\s+if \(all && !start\) setNotice\(/);
  // A file opened from its CDXML because its own copy failed says so, keeps its style, and Save asks first.
  assert.match(editor, /const other = read\.foreign && !read\.fallback;/);
  assert.match(editor, /if \(read\.fallback\) setNotice\(lostNotice\(lost, "opened"\), "error"\);/);
  assert.match(editor, /const sayLost = \(lost: Record<string, number>\) => \{ if \(Object\.keys\(lost\)\.length\) setNotice\(lostNotice\(lost, "added"\), Object\.keys\(losses\(lost\)\)\.length \? "error" : "info"\); \};/);
  assert.match(editor, /<p className="dialog-note">\{replaceNote\(dialog\.lost\)\}<\/p>/);
  // Generated keys (a spectrum's multiplets or signals) keep MAX_TEXT, the lines that fit, with the notice.
  assert.equal(editor.match(/kept = fitKey\(runs\);/g)?.length, 2, "the predicted and the measured key");
  assert.match(editor, /setFile\(path \? \{ path, saved: mol, lost: Object\.keys\(lossy\)\.length \? lossy : undefined \}/, "lost (with the copy counted) makes Save ask; a field no longer shown does not");
  // The chart dialog's name cells take 80, as the chart keeps (Cells.tsx limit, by column and row), and a value's own
  // name the chart cuts is said.
  const chartDialog = src("./ChartDialog.tsx");
  assert.match(chartDialog, /limit=\{\(c, r\) => \(c === 0 \|\| r === 0 \? 80 : 200\)\}/, "an energy diagram's paths and states");
  assert.match(chartDialog, /limit=\{\(c\) => \(c === 0 \? 80 : 200\)\}/, "a sensitivity screen's conditions");
  assert.match(chartDialog, /onDone\(data, energyRoles\(table\), longNames\(table\)\)/);
  assert.match(editor, /if \(cut\) setNotice\(cutNotice\("A chart label", 80\)\);/);
  assert.match(src("./Cells.tsx"), /maxLength=\{limit\(c, r\)\}[^]*maxLength=\{limit\(c, r\)\}/);
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

// --- L11 to L18: counts and lengths the editor or a reader could take past another reader's limit ----------------------

// A ChemDraw drawing: ethanol with a shown data field (ChemDraw's attached data, property type 23) of n characters.
const chemdrawShown = (n: number) => {
  const shown = setRows(ETHANOL, [0, 1, 2], [{ name: "Procedure", value: "x", show: true }]), id = shown.data![0].caption!;
  const m = { ...shown, captions: shown.captions!.map((c) => (c.id === id ? { ...c, text: prose(n) } : c)) };
  return { m, xml: toCdxml(m, style).replace(/(<CDXML[^>]*?)\s+Octet="[^"]*"/, "$1") };
};
it("L11 a shown data field of more than MAX_SHOWN characters opens with Show off, its value whole, as Attached data does, and saves and opens again clean", () => {
  const { m, xml } = chemdrawShown(5000), full = prose(5000), value = { name: "Procedure", atoms: [0, 1, 2], value: full };
  assert.ok(!/<CDXML[^>]*Octet=/.test(xml), "ChemDraw's file, no Octet extras");
  // The Attached data dialog: a value over MAX_SHOWN has its Show off, and says nothing (DataDialog.tsx long).
  assert.match(src("./DataDialog.tsx"), /const long = \(r: number\) => cells\[r\]\[1\]\.length > MAX_SHOWN;/);
  assert.deepEqual(setRows(ETHANOL, [0, 1, 2], [{ name: "Procedure", value: full, show: true }]).data, [value], "Save with Show on keeps the value, not shown");
  const own = parse(serialize(m)), old = parse(serialize({ ...ETHANOL, captions: [{ id: 1, x: 0, y: -2, text: full, property: { attrs: { ChemicalPropertyType: "23", Name: "Procedure" }, atoms: [0, 1, 2] } }] } as Mol));
  // Every reader: ChemDraw's CDXML and its CDX, Octet's own fields, and 1.1.2's form (the property on its text).
  for (const [name, r] of [["cdxml", fromCdxml(xml)], ["cdx", fromCdxml(cdxToXml(xmlToCdx(parseXml(xml))))], ["own", { mol: own, lost: leftOf(own) }], ["1.1.2", { mol: old, lost: leftOf(old) }]] as const) {
    assert.deepEqual(r.mol.data, [value], `${name}: the whole value, not shown`);
    assert.deepEqual(r.mol.captions ?? [], [], `${name}: its text is not on the page`);
    assert.deepEqual(r.lost, { [SHOWN_OFF]: 1 }, name);
    // Said when it opens, as information: nothing is lost, so Save does not ask before it replaces the file.
    assert.equal(lostNotice(r.lost, "opened"), "A shown value holds up to 2,000 characters. Octet turned off Show for 1 data field.");
    assert.equal(lostText(r.lost), "");
    assert.equal(replaceNote(r.lost), "Save As keeps the original file.");
    // Saved by Octet, in every form, it opens again the same, with nothing said.
    for (const [form, read] of Object.entries(forms)) { const again = read(r.mol); assert.deepEqual([again.mol.data, again.lost], [[value], {}], `${name}, ${form}`); }
    for (const [form, read] of Object.entries(chemdraw)) { const again = read(r.mol); assert.deepEqual([again.mol.data, again.lost], [[value], {}], `${name}, ${form}`); }
    // Edit attached data…, then Save with nothing changed: the same drawing.
    const rows = rowsOf(r.mol, [0, 1, 2]);
    assert.deepEqual(rows.map((x) => [x.value.length, x.show]), [[5000, false]]);
    assert.equal(setRows(r.mol, [0, 1, 2], rows), r.mol, `${name}: Save in Attached data changes nothing`);
  }
  const notice = src("./Editor.tsx");
  assert.match(notice, /setNotice\(lostNotice\(lost, "added"\), Object\.keys\(losses\(lost\)\)\.length \? "error" : "info"\)/, "only a field no longer shown is information");
  // A value that ends in line breaks: kept as a value is (no empty lines at its end), and the same each time.
  const ended = fromCdxml(chemdrawShown(5000).xml.replace(/(<s[^>]*>)([^<]*)<\/s>/, (_, s, t) => `${s}${t}&#10;&#10;</s>`));
  assert.deepEqual(ended.mol.data, [value]);
  assert.equal(setRows(ended.mol, [0, 1, 2], rowsOf(ended.mol, [0, 1, 2])), ended.mol);
  // A shown value of MAX_SHOWN or fewer that ends in a line break typed on the page stays shown, and opens again and
  // Saves in Attached data with nothing changed the same.
  const typed = setRows(ETHANOL, [0, 1, 2], [{ name: "Batch", value: "OCT-1", show: true }]), sid = typed.data![0].caption!;
  const short = { ...typed, captions: typed.captions!.map((c) => (c.id === sid ? { ...c, text: "OCT-1\n" } : c)) };
  assert.equal(setRows(short, [0, 1, 2], rowsOf(short, [0, 1, 2])), short, "Save with nothing changed");
  const back = parse(serialize(short));
  assert.equal(back.captions!.find((c) => c.id === back.data![0].caption)!.text, "OCT-1\n");
  assert.equal(setRows(back, [0, 1, 2], rowsOf(back, [0, 1, 2])), back);
  // Over MAX_TEXT: the text is cut to MAX_TEXT (counted), and the field keeps it all as its value (L28).
  const huge = fromCdxml(chemdrawShown(MAX_FIELD + 10).xml), v = huge.mol.data?.[0].value ?? "";
  assert.deepEqual([v.length >= MAX_FIELD - 1, huge.mol.captions ?? [], huge.lost], [true, [], { [SHOWN_OFF]: 1, character: MAX_FIELD + 10 - v.length }]);
  // At MAX_SHOWN nothing changes.
  const at = fromCdxml(chemdrawShown(MAX_SHOWN).xml);
  assert.deepEqual(at.lost, {});
  assert.equal(at.mol.captions!.find((c) => c.id === at.mol.data![0].caption)!.text.length, MAX_SHOWN);
});

it("L12 reagent tables: overLimit counts them (MAX_GRIDS), and a CDXML with more opens with MAX_GRIDS, counted, and saves and opens again", () => {
  const arrows = (n: number) => Array.from({ length: n }, (_, k) => ({ id: k + 1, kind: "reaction" as const, from: [0, -3 * k] as [number, number], to: [3, -3 * k] as [number, number] }));
  const tables = (n: number): Mol => ({ atoms: [], bonds: [], arrows: arrows(n), grids: arrows(n).map((a) => ({ arrow: a.id, typed: {}, roles: {} })) });
  assert.equal(overLimit(tables(MAX_GRIDS)), undefined);
  assert.equal(overLimit(tables(MAX_GRIDS + 1)), "A drawing holds up to 100 reagent tables.");
  const r = fromCdxml(toCdxml(tables(MAX_GRIDS + 1), style));
  assert.equal(r.mol.grids?.length, MAX_GRIDS);
  assert.deepEqual(r.lost, { "reagent table": 1 });
  assert.equal(parse(serialize(r.mol)).grids?.length, MAX_GRIDS, "the recovery copy and the .oct read again");
  // Every way of adding a table is an edit, which set refuses past the count (L8): Analyse Stoichiometry and splitting
  // a scheme's table make it through set too.
  const editor = src("./Editor.tsx");
  assert.match(editor, /set\(\{ \.\.\.doc, grids: has \? doc\.grids!\.filter/, "Analyse Stoichiometry");
  assert.match(editor, /return set\(\{ \.\.\.doc, grids: stepGrids\(/, "a table for each step");
});

it("L13 data fields and notes: overLimit counts them (MAX_DATA, MAX_NOTES), so paste, duplicate and a second SD import say so", () => {
  // Fields on 20 structures (one atom each), as a structure holds MAX_EACH.
  const fields = (n: number): Mol => ({ atoms: Array.from({ length: 20 }, (_, k) => ({ label: "C", location: [k, 0, 0] as [number, number, number] })), bonds: [], data: Array.from({ length: n }, (_, k) => ({ name: `F${k}`, atoms: [k % 20], value: "1" })) });
  assert.equal(overLimit(fields(MAX_DATA)), undefined);
  assert.equal(overLimit(fields(MAX_DATA + 1)), "A drawing holds up to 10,000 data fields.");
  // Past MAX_DATA the file leaves the rest out: so the editor never makes more.
  assert.deepEqual(leftOf(parse(serialize(fields(MAX_DATA + 1)))), { "data field": 1 });
  const notes = (n: number): Mol => ({ ...withTexts(...Array.from({ length: Math.ceil(n / 1000) }, (_, k) => ({ text: `t${k}`, notes: Array.from({ length: Math.min(1000, n - 1000 * k) }, (_, j) => ({ keyword: NOTE, content: `${j}` })) }))) });
  assert.equal(noteCount(notes(MAX_NOTES)), MAX_NOTES);
  assert.equal(overLimit(notes(MAX_NOTES)), undefined);
  assert.equal(overLimit(notes(MAX_NOTES + 1)), "A drawing holds up to 10,000 notes.");
  // A file with more (saved before the editor kept the count) opens with MAX_NOTES, and says how many it left out.
  const read = readOct(serialize({ ...notes(MAX_NOTES + 5), style }));
  assert.equal(noteCount(read.mol), MAX_NOTES);
  assert.deepEqual(read.lost, { annotation: 5 });
});

it("L14 a ChemDraw file with more than 10,000 texts, arrows, shapes or groups opens with 10,000 of each, counted, and saves and opens again", () => {
  const n = 10_001, m: Mol = { atoms: [], bonds: [],
    captions: Array.from({ length: n }, (_, k) => ({ id: k + 1, text: `${k}`, x: k % 100, y: -Math.floor(k / 100) })),
    arrows: Array.from({ length: n }, (_, k) => ({ id: n + k + 1, kind: "line" as const, from: [k % 100, -Math.floor(k / 100) - 0.5] as [number, number], to: [k % 100 + 0.5, -Math.floor(k / 100) - 0.5] as [number, number] })),
    shapes: Array.from({ length: n }, (_, k) => ({ id: 2 * n + k + 1, kind: "box" as const, from: [k % 100, -Math.floor(k / 100)] as [number, number], to: [k % 100 + 0.3, -Math.floor(k / 100) - 0.3] as [number, number] })) };
  const xml = toCdxml(m, style).replace(/(<CDXML[^>]*?)\s+Octet="[^"]*"/, "$1");
  let r: ReturnType<typeof fromCdxml> | undefined;
  const t = ms(() => { r = fromCdxml(xml); });
  assert.deepEqual([r!.mol.captions?.length, r!.mol.arrows?.length, r!.mol.shapes?.length], [10_000, 10_000, 10_000]);
  assert.deepEqual(r!.lost, { text: 1, arrow: 1, shape: 1 });
  assert.equal(lostNotice(r!.lost, "opened"), "Octet left out 1 text, 1 arrow and 1 shape.");
  assert.doesNotThrow(() => parse(serialize({ ...r!.mol, style })), "what opens saves and opens again");
  assert.deepEqual(readOct(writeOct(r!.mol, style), true).lost, {});
  assert.ok(t < 15_000, `read in ${t.toFixed(0)} ms`);
  // Groups too: 10,001 groups of two atoms each.
  const pairs: Mol = { atoms: Array.from({ length: 2 * n }, (_, k) => ({ label: "C", location: [k % 200, -Math.floor(k / 200), 0] as [number, number, number] })), bonds: [],
    groups: Array.from({ length: n }, (_, k) => ({ id: k + 1, atoms: [2 * k, 2 * k + 1], items: [] })) };
  const g = fromCdxml(toCdxml(pairs, style).replace(/(<CDXML[^>]*?)\s+Octet="[^"]*"/, "$1"));
  assert.equal(g.mol.groups?.length, 10_000);
  assert.deepEqual(g.lost, { group: 1 });
  assert.equal(parse(serialize(g.mol)).groups?.length, 10_000);
});

it("L15 Define Nickname refuses a nickname with < or > or a hidden character, which no label and no setting keeps", () => {
  for (const label of ["Boc<2>", "a>b", "Me\u0001", "Et\u0085", "Pr\u007f"]) {
    assert.equal(nicknameProblem(label), "A nickname cannot hold < or > or a hidden character.", JSON.stringify(label));
    // Why: a label typed on an atom holds no < or >, and the settings keep no control character.
    assert.ok(keptLabel(label) !== label || !readNicknames([{ label, smiles: "C" }]).length, JSON.stringify(label));
  }
  assert.equal(nicknameProblem("Boc2"), undefined);
});

it("L16 at the most nicknames Octet keeps (and dictionary names and template sets), Define Nickname (Add to Dictionary, New set) refuses a new one before it changes anything", () => {
  const editor = src("./Editor.tsx");
  assert.match(editor, /const there = !!label && !!ownNickname\(label\), full = !there && settings\.nicknames\.length >= MOST_OWN_NICKNAMES;/);
  assert.match(editor, /\?\? \(full \? `Octet keeps up to \$\{MOST_OWN_NICKNAMES\} nicknames\. Remove one in Settings > Dictionary to add another\.` : undefined\)/);
  // keepIt returns on a problem before the label is contracted or the settings change.
  assert.match(editor, /if \(!label \|\| problem \|\| [^\n]*\) return;\n\s+setDialog\(undefined\);\n\s+setSettings\(\(st\) => \(\{ \.\.\.st, nicknames: withNickname/);
  // Add to Dictionary: a full dictionary, or a SMILES longer than it keeps, is said and nothing is saved; an import
  // says how many names it left out; the name history keeps a long SMILES's name alone.
  assert.match(editor, /const full = !there && settings\.dictionary\.length >= MOST_OWN_NAMES;\n\s+const keepIt = \(\) => \{\n\s+if \(!name \|\| full\) return;/);
  assert.match(editor, /if \(smiles\.length > OWN_SMILES_LENGTH\) return setNotice\("This structure is too large for the dictionary\.", "info"\);/);
  assert.match(editor, /Octet left out \$\{left\.toLocaleString\("en-GB"\)\}: your dictionary holds up to/);
  assert.match(editor, /if \(smiles\.length > 2000\) smiles = "";/);
  // New set… (the dialog, and the library's New set) at MOST_SETS: Octet says so, as for a template file, and adds none.
  assert.match(editor, /const askSet = \(then: \(set: string\) => void\) => \(settings\.templateSets\.length >= MOST_SETS \? setNotice\(FULL_SETS, "info"\)/);
  assert.match(editor, /add: \(name: string\) => \{ if \(settings\.templateSets\.length >= MOST_SETS\) \{ setNotice\(FULL_SETS, "info"\); return false; \}/);
  assert.match(src("./templates.ts"), /FULL_SETS = `You have \$\{MOST_SETS\} template sets, the most Octet keeps\. Remove a set first\.`/);
});

it("L17 the caption box holds what the text it edits holds: a shown value MAX_SHOWN, a chart label 80, a detail MAX_VALUE, cut as it goes in", () => {
  const editor = src("./Editor.tsx");
  assert.match(editor, /const \[most, what\] = textMost\(own\);/);
  assert.match(editor, /<RichBox\n\s+key=\{writing\.at[^\n]*\n\s+max=\{most\}\n\s+onCut=\{\(\) => setNotice\(cutNotice\(what, most\)\)\}/);
  // What the box keeps of a paste into a full shown value: the text around it whole, what went in cut.
  const value = prose(MAX_SHOWN - 10), into = typedIn(value, value.slice(0, 100) + prose(500) + value.slice(100), MAX_SHOWN);
  assert.equal(into.text.length, MAX_SHOWN);
  assert.ok(into.text.startsWith(value.slice(0, 100)) && into.text.endsWith(value.slice(100)));
  assert.equal(cutNotice("A shown value", MAX_SHOWN), "A shown value holds up to 2,000 characters. Octet left out the rest.");
});

// A drawing with n notes: texts of 1,000 notes each (the most on one object).
const noted = (n: number): Mol => withTexts(...Array.from({ length: Math.ceil(n / 1000) }, (_, k) => ({ text: `t${k}`, notes: Array.from({ length: Math.min(1000, n - 1000 * k) }, (_, j) => ({ keyword: NOTE, content: `${j}` })) })));
// A ChemDraw file's CDXML of a drawing (Octet's own extras taken out).
const theirs = (m: Mol) => toCdxml(m, style).replace(/(<CDXML[^>]*?)\s+Octet="[^"]*"/, "$1");

it("L18 a structure holds MAX_EACH data fields: a bond that joins two structures and Attach Data's Save past it are refused, paste and duplicate are not, and every reader keeps it, counted", () => {
  const c = (x: number, y = 0) => ({ label: "C", location: [x, y, 0] as [number, number, number] });
  const was: Mol = { atoms: [c(0), c(1), c(5), c(6)], bonds: [{ atoms: [0, 1], type: 1 }, { atoms: [2, 3], type: 1 }],
    data: [...Array.from({ length: 800 }, (_, k) => ({ name: `A${k}`, atoms: [0, 1], value: "1" })), ...Array.from({ length: 800 }, (_, k) => ({ name: `B${k}`, atoms: [2, 3], value: "2" }))] };
  assert.equal(overLimit(was), undefined);
  // A bond drawn between the two structures: 1,600 fields on one.
  const joined: Mol = { ...was, bonds: [...was.bonds, { atoms: [1, 2], type: 1 }] };
  assert.equal(overLimit(joined, was), "A structure holds up to 1,000 data fields.");
  // Paste and duplicate: the copies are structures of their own, each with its 800.
  const copied: Mol = { atoms: [...was.atoms, ...was.atoms.map((a) => c(a.location[0], 5))], bonds: [...was.bonds, ...was.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + 4, b.atoms[1] + 4] as [number, number] }))],
    data: [...was.data!, ...was.data!.map((f) => ({ ...f, atoms: f.atoms.map((i) => i + 4) }))] };
  assert.equal(overLimit(copied, was), undefined);
  // Attach Data's Save keeps every row it is given (none is dropped), so the editor refuses more than MAX_EACH with the
  // notice; the dialog's grid has MAX_EACH rows at most.
  const rows = Array.from({ length: MAX_EACH + 1 }, (_, k) => ({ name: `R${k}`, value: "v", show: k === 0 }));
  const saved = setRows(ETHANOL, [0, 1, 2], rows);
  assert.equal(saved.data!.length, MAX_EACH + 1);
  assert.equal(overLimit(saved, ETHANOL), "A structure holds up to 1,000 data fields.");
  assert.match(src("./DataDialog.tsx"), /const MOST: \[number, number\] = \[MAX_EACH, 3\];/);
  assert.doesNotMatch(src("./datafields.ts"), /\.slice\(0, MAX_EACH\)/, "setRows drops no row");
  // Readers: Octet's own file and its CDXML, ChemDraw's attached data (shown fields), and an SD record.
  const own = readOct(serialize({ ...joined, style }));
  assert.deepEqual([own.mol.data!.length, own.lost], [MAX_EACH, { "data field": 600 }]);
  const cd = fromCdxml(theirs(saved));
  assert.deepEqual([cd.mol.data!.length, cd.lost], [MAX_EACH, { "data field": 1 }]);
  const oct = readOct(writeOct(joined, style), true);
  assert.deepEqual([oct.mol.data!.length, oct.lost], [MAX_EACH, { "data field": 600 }]);
  const record = `x\n  Octet\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\nM  END\n${Array.from({ length: MAX_EACH + 1 }, (_, k) => `> <F${k}>\nv\n\n`).join("")}$$$$\n`;
  const sd = readSd(record);
  assert.deepEqual([sd.records[0].items.length, sd.left], [MAX_EACH, 1]);
});

// A drawing at bond lengths k apart, its coordinates of many digits (as a large drawing's are), and a chain of n atoms.
const spot = (k: number): [number, number, number] => [(k % 300) * 1.2345678 + 1000.123456, -Math.floor(k / 300) * 1.2345678 - 1000.123456, 0];
const chain = (n: number, label = "C", more: (k: number) => object = () => ({})): Mol => ({ atoms: Array.from({ length: n }, (_, k) => ({ label, location: spot(k), ...more(k) })), bonds: Array.from({ length: n - 1 }, (_, k) => ({ atoms: [k, k + 1] as [number, number], type: 1 })) });
// The most bytes Octet writes a drawing in: its .oct, its .cdx, its CDXML and its recovery copy.
const written = (m: Mol) => Math.max(Buffer.byteLength(writeOct(m, style)), writeCdx(m, style).length, Buffer.byteLength(toCdxml(m, style)), Buffer.byteLength(serialize({ ...m, style })));
// Each property of an atom, and of a text, with its costliest value.
const ATOM_PROPS = { charge: -3, radical: 2, isotope: 235, pairs: 3, circled: true, partial: "+", hmark: "dash", attach: "star", bead: true, map: 999, enhanced: "or12", colour: "#123456", shade: 0.55555, font: "Times New Roman", size: 13.5,
  bold: true, italic: true, underline: true, ignoreWarnings: true, cip: true, halo: "#654321", circle: true, number: "12345678", hiddenNumber: "12345678", peaks: [1, 2, 3], align: "above", labelAngle: 123.456, hidden: true,
  angles: { charge: 123.4, partial: 45.6, radical0: 10.5, pair0: 33.3 }, sign: { at: [0.123456, 0.654321], colour: "#123456", size: 1.5 }, bars: true, chemical: false, shown: true, order: 1234,
  query: { subst: { kind: "exactly", n: 3 }, noH: true, rings: "fusion", unsat: "present", change: true, stereo: "retention", translation: "broad", abundance: "nonnatural", valence: true }, scale: 1.2345, ox: 3, implicitHCount: 3 };
const CAPTION_PROPS = { bold: true, italic: true, underline: true, size: 13.5, align: "justify", colour: "#123456", angle: 123.456, font: "Times New Roman", order: 1234, width: 12.3456, lineHeight: 13.5, chemical: false, auto: true };
// A style run with every style.
const allStyles = (text: string, k: number, font = "Times New Roman", size = 13.5) => ({ text, bold: true, italic: true, underline: true, script: k % 2 ? "sub" as const : "super" as const, ...(font ? { font } : {}), size, colour: "#123456" });
// The costliest font name a text or a run takes (64 characters of 3 bytes, Text > Font > Other Font…), and the most
// digits a size takes (19, as a scale gives).
const FONT64 = "€".repeat(64), SIZE19 = 0.30000000000000004;
const TOO_MUCH = "A drawing holds up to 5,000,000 characters of text.";
const texts = (n: number, t: string): Mol => ({ atoms: [], bonds: [], captions: Array.from({ length: n }, (_, k) => ({ id: k + 1, text: t, x: k % 100, y: -Math.floor(k / 100) })) });

it("L19 a drawing holds MAX_CHARACTERS of text, which saves within 64 MB: each kind of text counts at least what it writes, long texts past it are refused, and a reader leaves out what is past it, counted", () => {
  assert.equal(MAX_CHARACTERS, 5_000_000);
  // The fault: 1,400 texts of MAX_TEXT were within every count, and Save and the recovery copy refused the drawing.
  assert.equal(overLimit(texts(1400, prose(MAX_TEXT)), texts(0, "")), TOO_MUCH);
  // Each kind of text counts at least the bytes it adds in every form Octet writes, 9 a character, with the costliest
  // characters (" and €): what n characters add past one.
  const q = (n: number) => '"'.repeat(n), eu = (n: number) => "€".repeat(n);
  const note = (content: string, keyword = NOTE) => [{ keyword, content }];
  const structures = (k: number): Mol => ({ atoms: Array.from({ length: 3 * k }, (_, i) => ({ label: "C", location: spot(i) })), bonds: Array.from({ length: k }, (_, s) => [{ atoms: [3 * s, 3 * s + 1] as [number, number], type: 1 }, { atoms: [3 * s + 1, 3 * s + 2] as [number, number], type: 1 }]).flat() });
  const singles = (k: number): Mol => ({ atoms: Array.from({ length: k }, (_, i) => ({ label: "C", location: spot(i) })), bonds: [] });
  const grid = (key: string): Mol => ({ ...ETHANOL, arrows: [{ id: 3, kind: "reaction", from: [3, 0], to: [6, 0] }], grids: [{ arrow: 3, typed: { [key]: { mass: 1.5 } }, limiting: key, roles: { [key]: "reactant" }, text: { name: { [key]: "n" } } }] });
  const cellRuns = (t: string): TextRun[] => [...t].map((c, k) => ({ text: c, bold: true, italic: true, underline: true, script: k % 2 ? "sub" : "super" }));
  const risk = (texts: TextRun[]): Mol => ({ ...ETHANOL, groups: [{ id: 9, atoms: [], items: [], risk: { substances: [], ticks: [], texts: { "head:waste": texts } } }] });
  const kinds: [string, (n: number) => Mol, number][] = [
    ['a text of "', (n) => withTexts(q(n)), 2000], ["a text of €", (n) => withTexts(eu(n)), 2000],
    ["style runs", (n) => withTexts({ text: "ab".repeat(n), runs: Array.from({ length: 2 * n }, (_, k) => allStyles("ab"[k % 2], k)) }), 200],
    ["style runs with a font of 64 characters and a size of 19 digits", (n) => withTexts({ text: "ab".repeat(n), runs: Array.from({ length: 2 * n }, (_, k) => allStyles("ab"[k % 2], k, FONT64, SIZE19)) }), 200],
    ["style runs with no font and a size of 19 digits", (n) => withTexts({ text: "ab".repeat(n), runs: Array.from({ length: 2 * n }, (_, k) => allStyles("ab"[k % 2], k, "", SIZE19)) }), 200],
    ["a text's own font", (n) => withTexts({ text: "a", font: "€".repeat(n) }), 64],
    ["a note on the drawing", (n) => ({ ...ETHANOL, annotations: note(q(n)) }), 2000], ["a note's keyword", (n) => ({ ...ETHANOL, annotations: note("x", q(n)) }), 200],
    ["a note on a text", (n) => withTexts({ text: "a", notes: note(q(n)) }), 2000],
    ["a note on an arrow", (n) => ({ ...ETHANOL, arrows: [{ id: 1, kind: "reaction", from: [3, 0], to: [6, 0], notes: note(q(n)) }] }), 2000],
    ["a note on a shape", (n) => ({ ...ETHANOL, shapes: [{ id: 1, kind: "box", from: [3, 0], to: [6, 2], notes: note(q(n)) }] }), 2000],
    ["a note on a group", (n) => ({ ...ETHANOL, groups: [{ id: 9, atoms: [0, 1, 2], items: [], annotations: note(eu(n)) }] }), 2000],
    ["a value not shown", (n) => ({ ...ETHANOL, data: [{ name: "F", atoms: [0, 1, 2], value: q(n) }] }), 2000],
    ["a value on three structures", (n) => ({ ...structures(3), data: [{ name: "F", atoms: [0, 3, 6], value: q(n) }] }), 2000],
    ["a field's name on three structures", (n) => ({ ...structures(3), data: [{ name: q(n), atoms: [0, 3, 6], value: "v" }] }), 200],
    ["a field on many structures", (n) => ({ ...singles(2000), data: [{ name: "F", atoms: Array.from({ length: n }, (_, i) => i), value: "" }] }), 2000],
    ["a shown field's name", (n) => setRows(ETHANOL, [0, 1, 2], [{ name: q(n), value: "v", show: true }]), 200],
    ["a table cell", (n) => ({ atoms: [], bonds: [], shapes: [{ id: 1, kind: "table", from: [0, 0], to: [8, -8], table: { cells: [[q(n), "b"], ["c", eu(n)]] } }] }), MAX_CELL],
    // A table cell's and a reagent table's text styles (release-1.1.3): a run for each character, with every style.
    ["a table cell's runs", (n) => ({ atoms: [], bonds: [], shapes: [{ id: 1, kind: "table", from: [0, 0], to: [8, -8], table: { cells: [[q(n), "b"], ["c", eu(n)]], runs: [[cellRuns(q(n)), null], [null, cellRuns(eu(n))]] } }] }), MAX_CELL],
    ["a reagent table's runs", (n) => { const m = grid("r1"); return { ...m, grids: [{ ...m.grids![0], text: { name: { r1: q(n) } }, runs: { name: { r1: cellRuns(q(n)) } } }] }; }, 200],
    ["a risk text", (n) => risk([{ text: eu(n) }]), 2000], ["a risk text's runs", (n) => risk(Array.from({ length: n }, (_, k) => allStyles("ab"[k % 2], k))), 200],
    ["a risk text's runs with a font of 64 characters", (n) => risk(Array.from({ length: n }, (_, k) => allStyles("ab"[k % 2], k, FONT64, SIZE19))), 200],
    ['a reagent table\'s key of "', (n) => grid(`r:"${q(n)}"`), 2000], ["a reagent table's key of €", (n) => grid(`r:"${eu(n)}"`), 2000],
  ];
  const under = kinds.flatMap(([name, make, n]) => {
    const a = make(1), b = make(n), w = written(b) - written(a), t = 9 * (textOf(b) - textOf(a));
    return w > t ? [`${name}: ${w} bytes written, ${t} counted`] : [];
  });
  assert.deepEqual(under, []);
  // A field not shown is written in each structure it is on: every bond deleted from a structure with 400 fields on
  // 2,000 atoms takes the drawing past MAX_CHARACTERS.
  const two = chain(2000), fields: Mol = { ...two, data: Array.from({ length: 400 }, (_, k) => ({ name: `F${k}`, atoms: two.atoms.map((_, i) => i), value: "v" })) };
  assert.equal(overLimit(fields), undefined);
  assert.equal(overLimit({ ...fields, bonds: [] }, fields), TOO_MUCH, "every bond deleted");
  // At MAX_CHARACTERS, with 10,000 texts that have every style, each with a note and each a shown data field (10
  // structures of 1,000 fields), and the rest texts of ", the drawing saves within 64 MB (main.rs MAX_BYTES) in every
  // form. A text more is refused.
  const base: Mol = { ...structures(10), captions: [], data: [] };
  for (let k = 0; k < 9_700; k++) {
    const s = k % 10;
    base.captions!.push({ id: k + 1, text: "a", x: spot(k)[0], y: spot(k)[1], under: [3 * s, 3 * s + 1, 3 * s + 2], notes: note("n"), ...CAPTION_PROPS } as Caption);
    base.data!.push({ name: `Field ${k}`, atoms: [3 * s, 3 * s + 1, 3 * s + 2], caption: k + 1 });
  }
  const room = Math.floor((MAX_CHARACTERS - textOf(base)) / MAX_TEXT), long = q(MAX_TEXT);
  const full: Mol = { ...base, captions: [...base.captions!, ...Array.from({ length: room }, (_, k) => ({ id: 20_000 + k, text: long, x: k, y: 10 }))] };
  assert.equal(overLimit(full), undefined);
  assert.ok(MAX_CHARACTERS - textOf(full) < MAX_TEXT, `${textOf(full)}`);
  assert.equal(overLimit({ ...full, captions: [...full.captions!, { id: 30_000, text: long, x: 0, y: 20 }] }, full), TOO_MUCH);
  const sizes = { oct: Buffer.byteLength(writeOct(full, style)), cdx: writeCdx(full, style).length, cdxml: Buffer.byteLength(toCdxml(full, style)), recovery: Buffer.byteLength(serialize({ ...full, style })) };
  for (const [form, size] of Object.entries(sizes)) assert.ok(size <= 64 * 2 ** 20, `${form}: ${size} bytes`);
  console.log(`longtext-stress: L19 text at MAX_CHARACTERS with 9,700 styled texts, notes and shown fields, MB: ${Object.entries(sizes).map(([k, v]) => `${k} ${(v / 2 ** 20).toFixed(1)}`).join(", ")}`);
  // The independent check's drawing: the 9,700 texts with every property and a font of 64 characters, and texts of
  // one-character runs with every style and that font, to MAX_CHARACTERS (with fonts not counted, a .oct of 68 MB).
  let runs: Mol = { ...base, captions: base.captions!.map((c) => ({ ...c, font: FONT64 })) };
  const one = (n: number, id: number): Caption => ({ id, text: "ab".repeat(n).slice(0, n), x: id % 50, y: 10, runs: Array.from({ length: n }, (_, k) => allStyles("ab"[k % 2], k, FONT64)) });
  const per = textOf({ atoms: [], bonds: [], captions: [one(2, 1)] }) / 2;
  for (let id = 40_000; MAX_CHARACTERS - textOf(runs) >= per; id++) runs = { ...runs, captions: [...runs.captions!, one(Math.min(MAX_TEXT, Math.floor((MAX_CHARACTERS - textOf(runs)) / per)), id)] };
  assert.ok(MAX_CHARACTERS - textOf(runs) < per && overLimit({ ...runs, captions: [...runs.captions!, one(1, 50_000)] }, runs) === TOO_MUCH, `${textOf(runs)}`);
  const oct = Buffer.byteLength(writeOct(runs, style));
  assert.ok(oct <= 64 * 2 ** 20, `.oct of ${oct} bytes`);
  console.log(`longtext-stress: L19 text at MAX_CHARACTERS in runs with a font of 64 characters: .oct ${(oct / 2 ** 20).toFixed(1)} MB`);
  // A ChemDraw file with more: the texts past MAX_CHARACTERS are left out, the last first, and counted.
  const r = fromCdxml(theirs(texts(400, prose(MAX_TEXT))));
  const kept = r.mol.captions!.length;
  assert.ok(kept < 400 && kept >= 240 && textOf(r.mol) <= MAX_CHARACTERS, `${kept}`);
  assert.deepEqual(r.lost, { text: 400 - kept });
  // Notes past it go first (the last first), then texts (H1), then data fields.
  const many = readOct(serialize({ ...withTexts(...Array.from({ length: 10 }, () => ({ text: "a", notes: Array.from({ length: 1000 }, () => ({ keyword: NOTE, content: prose(MAX_CONTENT) })) }))), style }));
  assert.ok(textOf(many.mol) <= MAX_CHARACTERS && (many.lost.annotation ?? 0) > 0 && !many.lost.text && many.mol.captions!.length === 10, JSON.stringify(many.lost));
  const values = readOct(serialize({ ...structures(600), data: Array.from({ length: 600 }, (_, k) => ({ name: `F${k}`, atoms: [3 * k], value: prose(MAX_TEXT) })), style }));
  assert.ok(textOf(values.mol) <= MAX_CHARACTERS && (values.lost["data field"] ?? 0) > 300, JSON.stringify(values.lost));
});

it("L25 the text count counts no structure: 100,000 atoms with every property (a .oct over 64 MB) take a new text, open whole, and Save refuses them as before", () => {
  const heavy: Mol = { ...chain(MAX_ATOMS, "C", () => ATOM_PROPS), annotations: [{ keyword: NOTE, content: "a" }], captions: [{ id: 1, text: "kept", x: 0, y: 9 }], data: [{ name: "F", atoms: [0], value: "v" }] };
  assert.equal(overLimit({ ...heavy, captions: [...heavy.captions!, { id: 2, text: "new", x: 0, y: 12 }] }, heavy), undefined, "a new text");
  assert.equal(overLimit({ ...heavy, bonds: [...heavy.bonds, { atoms: [0, 5], type: 1 }] }, heavy), undefined, "a new bond");
  const lost: Record<string, number> = {};
  assert.equal(withinText(heavy, (what, n) => { lost[what] = n; }), heavy);
  assert.deepEqual(lost, {});
  // Save refuses a drawing larger than 64 MB, and says what to do (L29).
  assert.match(src("../src-tauri/src/main.rs"), /if contents\.len\(\) as u64 > MAX_BYTES \|\| cdx[^\n]*\{\n\s+return Err\("This drawing is larger than 64 MB\. Octet cannot save it\."\.into\(\)\);/);
});

it("L26 the limits add nothing to an edit that shows: on drawings whose data fields need their structures counted, overLimit costs each of the app's edits a small part of the edit and set's pipeline; with OCTET_BASE, each edit is as fast as there", async () => {
  // n atoms in structures (chains) of size atoms, per data fields on each (one list for a structure's fields, as
  // Attach Data makes them, or one a field, as a .oct holds them), with values of value characters, and 200 texts.
  const library = (n: number, size: number, per: number, value: number, own = false): Mol => {
    const data: NonNullable<Mol["data"]> = [];
    for (let s = 0; s < n / size; s++) {
      const list = Array.from({ length: size }, (_, j) => s * size + j);
      for (let f = 0; f < per; f++) data.push({ name: `Field ${f}`, atoms: own ? [...list] : list, value: "x".repeat(value) });
    }
    return { atoms: chain(n, "C", (k) => (k % 3 ? {} : { colour: "#C00000" })).atoms, bonds: Array.from({ length: n }, (_, k) => k).filter((k) => (k + 1) % size).map((k) => ({ atoms: [k, k + 1] as [number, number], type: 1 })),
      captions: Array.from({ length: 200 }, (_, k) => ({ id: k + 1, text: "The mixture was stirred at 25 °C for 2 h.", x: k % 100, y: -Math.floor(k / 100) })), data };
  };
  // An SD library of 1,000 structures (5 fields of 20 characters on each, made in Octet and read from a .oct), 2,000
  // fields on structures of 20 atoms, and 200 procedures of 1,000 characters on 10,000 atoms, each 200 atoms short of
  // MAX_ATOMS (or of 10,000) so that atoms can be added.
  const json = serialize({ ...library(MAX_ATOMS - 200, 100, 5, 20, true), style }), read = parse(json);
  const drawings: Record<string, Mol> = { "an SD library": library(MAX_ATOMS - 200, 100, 5, 20), "an SD library read from a .oct": read, "2,000 fields": library(MAX_ATOMS - 200, 20, 2, 4), "200 procedures": library(9_800, 49, 1, 1000) };
  // A file's fields of the same atoms share their list, as Attach Data makes them.
  assert.ok(read.data!.every((f, k) => f.atoms === read.data![k - (k % 5)].atoms), "the fields of a structure read share its list");
  // Each needs its structures: more than MAX_EACH fields, or fields that counted at an atom a structure could be past
  // MAX_CHARACTERS (the paths the check found taking 1 to 4 ms on 100,000 atoms).
  for (const [name, m] of Object.entries(drawings)) assert.ok(m.data!.length > MAX_EACH || m.data!.reduce((n, f) => n + (f.name.length + (f.value?.length ?? 0) + 12) * f.atoms.length, 0) > MAX_CHARACTERS, name);
  // set's pipeline (Editor.tsx set), without React, and the app's edits, of this version or of the one at OCTET_BASE.
  const env = { captionSize: style.captionSize, bond: style.bond, line: style.line, measure: (t: string) => t.length / 2 };
  type Version = { pipeline: (doc: Mol, mol: Mol) => Mol; edits: Record<string, (m: Mol, k: number) => Mol>; over?: (m: Mol, was: Mol) => unknown };
  const frag: Mol = { atoms: Array.from({ length: 10 }, (_, k) => ({ label: "C", location: [k, 5, 0] as [number, number, number] })), bonds: Array.from({ length: 9 }, (_, k) => ({ atoms: [k, k + 1] as [number, number], type: 1 })) };
  const editsOf = (e: { sprout: typeof sprout; keyBond: typeof keyBond; insertMol: typeof insertMol; deleteChosen: typeof deleteChosen }): Version["edits"] => ({
    "an atom added with its bond": (m, k) => e.sprout(m, 100 + 20 * k),
    "a bond made double": (m, k) => e.keyBond(m, 300 + 7 * k, { type: 2 }),
    "a paste": (m) => e.insertMol(m, frag, [3, 3]).mol,
    "an atom deleted": (m, k) => e.deleteChosen(m, new Set([500 + 397 * k]), new Set()),
    "a text typed": (m, k) => ({ ...m, captions: m.captions!.map((c) => (c.id === 10 + k ? { ...c, text: `${c.text} Then it was filtered.` } : c)) }),
  });
  const now: Version = {
    pipeline: (doc, mol) => {
      const settled = keepPlace(doc, settleHydrogens(followLevels(doc, followCharts(doc, followLeaders(doc, followArrows(doc, mol)), env), env)));
      return onTop(doc, wholeGroups(settleMeasures(doc, placeCentres(carryDepth(doc, showWarnedHydrogens(settled))), undefined, false)), fragments);
    },
    edits: editsOf({ sprout, keyBond, insertMol, deleteChosen }), over: overLimit,
  };
  // The version at OCTET_BASE (release-1.1.3, or 1.1.2, whose set had fewer steps), interleaved with this one.
  const base = process.env.OCTET_BASE, at = (f: string) => new URL(`file://${base?.replace(/\/$/, "")}/${f}`).href;
  let was: Version | undefined;
  if (base) {
    const e = await import(at("edit.ts")), c = await import(at("check.ts")), o = await import(at("order.ts")), p = await import(at("pageplot.ts"));
    // It reads the same file first, as this version did, so its code has met the same kinds of object.
    (await import(at("file.ts"))).parse(json);
    const late = existsSync(new URL(at("arrowlink.ts"))) ? { g: await import(at("gridview.ts")), a: await import(at("arrowlink.ts")), s: await import(at("measurement.ts")) } : undefined;
    was = { edits: editsOf(e), pipeline: late ? (doc, mol) => {
      const settled = late.g.keepPlace(doc, e.settleHydrogens(p.followLevels(doc, p.followCharts(doc, p.followLeaders(doc, late.a.followArrows(doc, mol)), env), env)));
      return o.onTop(doc, e.wholeGroups(late.s.settleMeasures(doc, e.placeCentres(e.carryDepth(doc, c.showWarnedHydrogens(settled))), undefined, false)), e.fragments);
    } : (doc, mol) => o.onTop(doc, e.wholeGroups(e.placeCentres(e.carryDepth(doc, c.showWarnedHydrogens(e.settleHydrogens(p.followLeaders(doc, mol)))))), e.fragments) };
  }
  const med = (xs: number[]) => [...xs].sort((p, q) => p - q)[xs.length >> 1];
  const lines: string[] = [], slow: string[] = [];
  for (const [name, start] of Object.entries(drawings)) {
    overLimit(start);
    for (const edit of Object.keys(now.edits)) {
      // Each round from the drawing as it starts, 3 edits in a row; the first round warms up, after a collection.
      const t = { edit: [] as number[], pipe: [] as number[], over: [] as number[], was: [] as number[] };
      gc();
      for (let r = 0; r < 7; r++) {
        for (const v of r % 2 || !was ? [now, was] : [was, now]) {
          if (!v) continue;
          let doc = start;
          for (let k = 0; k < 3; k++) {
            const t0 = performance.now(), mol = v.edits[edit](doc, k + 3 * r), t1 = performance.now(), out = v.pipeline(doc, mol), t2 = performance.now(), refused = v.over?.(out, doc), t3 = performance.now();
            assert.equal(refused, undefined, `${name}, ${edit}`);
            if (r && v === now) { t.edit.push(t1 - t0); t.pipe.push(t2 - t1); t.over.push(t3 - t2); }
            if (r && v === was) t.was.push(t2 - t0);
            doc = out;
          }
        }
      }
      const [e, p, o] = [med(t.edit), med(t.pipe), med(t.over)], whole = med(t.edit.map((x, k) => x + t.pipe[k] + t.over[k]));
      // overLimit at most a twentieth of the edit and its pipeline, or 0.1 ms (a fifth for an atom deleted, which
      // works the structures out whole, and which itself takes half what it took); with OCTET_BASE, the whole edit no
      // slower than there (but for noise).
      if (o > Math.max(0.1, (e + p) / (edit === "an atom deleted" ? 5 : 20))) slow.push(`${name}, ${edit}: overLimit ${o.toFixed(3)} ms, the edit and set's pipeline ${(e + p).toFixed(2)} ms`);
      if (was && whole > med(t.was) * 1.1 + 0.2) slow.push(`${name}, ${edit}: ${whole.toFixed(2)} ms, at OCTET_BASE ${med(t.was).toFixed(2)} ms`);
      // An atom deleted from 100,000 atoms costs at most 8 times set's pipeline (12 to 13 times in 1.1.2 and
      // release-1.1.3, where deleteChosen looked each atom up in sets and maps, and 1.1.3 each data field's atoms too).
      if (edit === "an atom deleted" && start.atoms.length > 50_000 && e > 8 * p) slow.push(`${name}, ${edit}: ${e.toFixed(2)} ms, set's pipeline ${p.toFixed(2)} ms`);
      lines.push(`${name}, ${edit}: ${e.toFixed(2)} + ${p.toFixed(2)} + overLimit ${o.toFixed(3)}${was ? ` = ${whole.toFixed(2)} (OCTET_BASE ${med(t.was).toFixed(2)})` : ""}`);
    }
  }
  console.log(`longtext-stress: L26 ms (the edit + set's pipeline + overLimit):\n  ${lines.join("\n  ")}`);
  assert.deepEqual(slow, []);
});

it("L28 a data field's value holds MAX_TEXT characters, as a text: not shown, and shown in a ChemDraw file (25,000 and 30,000 characters keep 20,000, Show off), it comes back whole from .oct, CDXML, CDX and the clipboard; a longer value is left out whole, counted", () => {
  assert.equal(MAX_FIELD, MAX_TEXT);
  assert.match(src("./DataDialog.tsx"), /const LIMITS = \[MAX_NAME, MAX_VALUE, 1\];/, "Attached data's value takes MAX_VALUE");
  const value = prose(MAX_TEXT), hidden: Mol = { ...ETHANOL, data: [{ name: "Procedure", atoms: [0, 1, 2], value }] };
  const back = (m: Mol, what: string) => {
    for (const [form, read] of Object.entries(forms)) { const r = read(m); assert.deepEqual([r.mol.data, r.lost], [m.data, {}], `${what}, ${form}`); }
    for (const [form, read] of Object.entries(chemdraw)) { const r = read(m); assert.deepEqual([r.mol.data, r.lost], [m.data, {}], `${what}, ${form}`); }
  };
  back(hidden, "not shown");
  // ChemDraw's shown field of MAX_TEXT and more: its text is cut to MAX_TEXT (counted), and the field keeps it all as its
  // value, Show off.
  for (const n of [MAX_TEXT, 25_000, 30_000]) {
    const r = fromCdxml(chemdrawShown(n).xml), v = r.mol.data?.[0]?.value ?? "";
    assert.ok(v.length >= MAX_TEXT - 1 && v === prose(n).slice(0, v.length), `${n}: a value of ${v.length}`);
    assert.deepEqual([r.mol.data?.[0].caption, r.mol.captions ?? [], r.lost], [undefined, [], { [SHOWN_OFF]: 1, ...(n > v.length ? { character: n - v.length } : {}) }], `${n}`);
    back(r.mol, `shown ${n}`);
  }
  // Longer than MAX_VALUE (a hand-made file, another program's annotation): left out whole and counted.
  const over: Mol = { ...ETHANOL, data: [{ name: "Procedure", atoms: [0, 1, 2], value: prose(MAX_TEXT + 1) }] };
  const json = parse(serialize(over));
  assert.deepEqual([json.data, leftOf(json)], [undefined, { "data field": 1 }]);
  const cd = fromCdxml(theirs(over));
  assert.deepEqual([cd.mol.data, cd.lost], [undefined, { "data field": 1 }]);
});

it("L29 a drawing larger than 64 MB loses no work: Save refuses it and says what to do, and the recovery copy Octet kept last stays", () => {
  const rs = src("../src-tauri/src/recovery.rs"), editor = src("./Editor.tsx");
  // recovery.rs write: a copy over MAX_BYTES is refused before anything is written, so the copy kept last stays.
  const write = rs.slice(rs.indexOf("fn write("), rs.indexOf("fn list("));
  assert.ok(write.indexOf("contents.len() as u64 > MAX_BYTES") >= 0 && write.indexOf("contents.len() as u64 > MAX_BYTES") < write.indexOf("write_atomic"), "the size first");
  assert.match(rs, /fn a_drawing_too_large_keeps_the_last_copy\(\)/, "and its Rust test");
  // The editor clears its copy only when the drawing is clean (saved, or Don't Save): a refused write or Save leaves it.
  assert.equal(editor.match(/keep\("recovery_clear"\)/g)?.length, 2);
  assert.match(editor, /if \(!mainDirty\) \{ if \(keeper\.kept\) \{ keeper\.kept = false; keep\("recovery_clear"\)\.catch\(keepFailed\(\)\); \} return; \}/);
  // Save and Save Copy As say what to do.
  assert.match(editor, /const TOO_LARGE = "This drawing is larger than 64 MB\. Octet cannot save it\. Delete part of it, or copy part of it to a new drawing and save that\.";/);
  assert.equal(editor.match(/setNotice\(saveFailed\(e\)\);/g)?.length, 2, "Save and Save Copy As");
});

it("L30 the JSON reader counts the notes of a group of one thing, which it leaves out, as the CDXML reader does", () => {
  const m: Mol = { ...withTexts("a"), groups: [{ id: 9, atoms: [], items: [1], annotations: [{ keyword: NOTE, content: "x" }, { keyword: NOTE, content: "y" }] }] };
  for (const [name, r] of [["json", readOct(serialize({ ...m, style }))], ["oct", readOct(writeOct(m, style), true)], ["cdxml", fromCdxml(theirs(m))]] as const) {
    assert.deepEqual([r.mol.groups ?? [], r.lost], [[], { annotation: 2 }], name);
  }
});

it("L31 what the editor adds after set stays within the limits: Last changed by on Save, markup, a risk assessment's substances and hazards, live values", () => {
  // Save adds no Last changed by that would take the text past MAX_CHARACTERS.
  const author = withDetails(undefined, { author: "Sam" }, PROPERTIES)!, at: Mol = { ...texts(1, "a"), annotations: author };
  const room = MAX_CHARACTERS - textOf(at), full: Mol = { ...at, captions: [...at.captions!, ...Array.from({ length: Math.floor(room / MAX_TEXT) }, (_, k) => ({ id: 10 + k, text: "x".repeat(MAX_TEXT), x: k, y: 0 }))] };
  const rest = MAX_CHARACTERS - textOf(full), edge: Mol = { ...full, captions: [...full.captions!, { id: 9, text: "y".repeat(rest - 1), x: 0, y: 5 }] };
  assert.equal(textOf(edge), MAX_CHARACTERS - 1);
  assert.equal(stampedWithin(edge, "sam"), edge);
  assert.notEqual(stampedWithin(at, "sam"), at);
  const editor = src("./Editor.tsx");
  assert.match(editor, /const out = \{ \.\.\.m, captions: m\.captions!\.map\(\(x\) => \(x\.id === id \? next : x\)\) \}, over = overLimit\(out, m\);\n\s+if \(over\) return setNotice\(over, "info"\);/, "markup");
  assert.match(editor, /if \(!kept\(\)\) return false;\n\s+if \(!\(expPage && markupCaption\(old\)\)\) marked\(m, w\.id\);/, "no markup on a text set refused");
  assert.match(editor, /if \(!overLimit\(next, m\)\) \{ lastSet\.current = next; dispatch\(\{ type: "amend", mol: next \}\); \}/, "a risk assessment's substances");
  assert.match(editor, /lastSet\.current === now\.current && !overLimit\(next, now\.current\)\) \{ lastSet\.current = next; dispatch\(\{ type: "amend", mol: next \}\); \}\n\s+else if \(next !== now\.current\) set\(next, true\);/, "hazards: set says why");
  assert.match(editor, /if \(next === doc \|\| overLimit\(next, doc\)\) return;/, "live values");
  // The other amends move things (growScheme, growProcedure) or mark atoms (spectrum sessions): no count changes.
  assert.equal(editor.match(/dispatch\(\{ type: "amend"/g)?.length, 7);
});

it("L32 a text or a table cell set refuses stays in its box with what was typed: nothing typed is lost, and set says why", () => {
  const editor = src("./Editor.tsx"), body = (name: string) => { const at = editor.indexOf(`function ${name}(`); return editor.slice(at, editor.indexOf("\n  }\n", at)); };
  // commitWriting: past a limit, the box opens again with the text as typed (cut to what a text holds), the caret at its
  // end, after every set it makes; it says whether it kept the text.
  const commit = body("commitWriting");
  assert.match(commit, /function commitWriting\(\): boolean \{/);
  assert.match(commit, /const kept = \(\) => \{\n\s+if \(!refused\.current\) return true;\n\s+const at = plainOf\(typed\)\.length;\n\s+openWriting\(\{ \.\.\.w, runs: typed, value: plainOf\(typed\), version: \(w\.version \?\? 0\) \+ 1, caret: \[at, at\], pending: undefined \}\);\n\s+return false;/);
  assert.equal(commit.match(/set\((deleteGraphics|updateCaption|labelEnd)\(/g)?.length, 3);
  assert.equal(commit.match(/kept\(\)/g)?.length, 3, "after each of them");
  // What goes on after the text is kept (Tab to the next text, a detail or a side arrow's other end, Name to Structure)
  // does not when it is not; and no box opens over one that is open.
  assert.match(editor, /if \(!commitWriting\(\)\) return;\n\s+if \(!text\) \{ tabRow\.current/, "Tab in a new text");
  assert.match(editor, /if \(commitWriting\(\)\) typeField\(/, "Tab to the next detail");
  assert.match(editor, /if \(!commitWriting\(\)\) return true;\n\s+if \(there\)/, "Tab to a side arrow's other end");
  assert.match(editor, /if \(!commitWriting\(\)\) return;\n\s+if \(!found \|\| !c\) return openNaming\(text\);/, "Name to Structure");
  assert.equal(editor.match(/[^!(\w]commitWriting\(\)(?!:)/g)?.length, 3, "Return, Escape and blur go on with nothing");
  assert.match(editor, /const openWriting = \(w: Writing\) => \{ if \(writingOpen\.current\) return; writingOpen\.current = true; setWriting\(w\); \};/);
  // The RichBox is built again with its runs and takes the focus when its version changes.
  assert.match(src("./RichBox.tsx"), /useLayoutEffect\(\(\) => \{ build\(p\.caret\); box\.current\?\.focus\(\); \}, \[p\.version\]\);/);
  // commitCell: a cell set refuses stays open with its text and has the focus back; it moves on or closes only after.
  const cell = body("commitCell");
  assert.match(cell, /if \(m !== doc\) \{ set\(m, true\); if \(refused\.current\) \{ const at = plainOf\(w\.runs\)\.length; return setCell\(\{ \.\.\.w, version: w\.version \+ 1, caret: \[at, at\], pending: undefined \}\); \} \}\n\s+if \(!to\) \{ cellOpen\.current = false; return setCell\(undefined\); \}/);
  assert.ok(cell.indexOf("cellOf(cur") > cell.indexOf("set(m, true)"), "the next cell opens after the set");
  assert.match(editor, /const openCell = \(sh: Shape, p: P\) => \{\n\s+if \(cellOpen\.current\) return;/);
  assert.match(editor, /if \(sh\.kind === "table" && !cellOpen\.current\) \{ cellOpen\.current = true;/);
});

it("L33 a reader leaves out only what brings a drawing within MAX_CHARACTERS: data fields that make up the excess go before notes and texts that could not, and nothing goes when leaving out every note, text and field would not do", () => {
  // 260 structures, each with a hidden Procedure of MAX_TEXT characters (5.2 million), and 1,000 texts, 200 with a
  // note: 11 fields put it over, and the notes and texts (16,500 characters) could not make that up. Only fields go.
  const many: Mol = { atoms: Array.from({ length: 260 }, (_, i) => ({ label: "C", location: spot(i) })), bonds: [],
    data: Array.from({ length: 260 }, (_, k) => ({ name: "Procedure", atoms: [k], value: prose(MAX_TEXT) })),
    captions: Array.from({ length: 1000 }, (_, k) => ({ id: k + 1, text: `Compound ${k + 1}`, x: k % 100, y: -10 - Math.floor(k / 100), ...(k < 200 ? { notes: [{ keyword: NOTE, content: `Made on day ${k}` }] } : {}) })) };
  for (const [name, read] of [["json", () => readOct(serialize({ ...many, style }))], ["oct", () => readOct(writeOct(many, style), true)], ["cdxml", () => fromCdxml(theirs(many))]] as const) {
    const r = read();
    assert.ok(textOf(r.mol) <= MAX_CHARACTERS, name);
    assert.deepEqual([r.mol.captions?.length, noteCount(r.mol), Object.keys(r.lost)], [1000, 200, ["data field"]], `${name}: ${JSON.stringify(r.lost)}`);
    assert.ok(r.lost["data field"] <= 12, `${name}: ${r.lost["data field"]}`);
  }
  // Past it in table cells, which stay: 3 tables of 100 rows of 20 cells of 500 characters (6 million), 500 texts and a
  // note. Leaving them out would not bring it within, so nothing goes.
  const cells = Array.from({ length: 100 }, () => Array.from({ length: 20 }, () => "x".repeat(MAX_CELL)));
  const tables: Mol = { atoms: [], bonds: [], shapes: [0, 1, 2].map((k) => ({ id: 1000 + k, kind: "table" as const, from: [10 * k, 0] as [number, number], to: [10 * k + 8, -8] as [number, number], table: { cells } })),
    captions: Array.from({ length: 500 }, (_, k) => ({ id: k + 1, text: `Entry ${k}`, x: k % 50, y: 20 + Math.floor(k / 50), ...(k === 0 ? { notes: [{ keyword: NOTE, content: "kept" }] } : {}) })) };
  assert.ok(textOf(tables) > MAX_CHARACTERS);
  const r = readOct(serialize({ ...tables, style }));
  assert.deepEqual([r.mol.captions?.length, noteCount(r.mol), r.lost], [500, 1, {}]);
  // Notes and texts still go first when they make up the excess, the last first (L19, H1).
});

it("L27 a text too long to show takes the notes of a group it was in with it, counted, so Save asks; and a list of annotations past MAX_ANNOTATIONS keeps MAX_ANNOTATIONS", () => {
  // 1.1.2's form: ethanol with a shown value of 3,000 characters (its property on its text), in a group with a note.
  const caption = { id: 1, x: 0, y: -2, text: prose(3000), under: [0, 1, 2], property: { attrs: { ChemicalPropertyType: "23", Name: "Procedure" }, atoms: [0, 1, 2] } };
  const grouped = (more: Partial<Mol>): Mol => ({ ...ETHANOL, captions: [caption], groups: [{ id: 9, atoms: [0, 1, 2], items: [1], annotations: [{ keyword: NOTE, content: "Batch from Sam" }] }], ...more }) as Mol;
  for (const [name, read] of [["json", (m: Mol) => ({ mol: parse(serialize(m)), lost: leftOf(parse(serialize(m))) })], ["oct", (m: Mol) => readOct(writeOct(m, style), true)], ["cdxml", (m: Mol) => fromCdxml(theirs(m))]] as const) {
    const r = read(grouped({}));
    assert.deepEqual([r.mol.groups ?? [], r.lost], [[], { [SHOWN_OFF]: 1, annotation: 1 }], name);
    assert.equal(lostText(r.lost), "1 annotation", `${name}: Save asks`);
  }
  // With another text in the group, its notes and the text's own go, all counted.
  const shared = grouped({ captions: [{ ...caption, notes: [{ keyword: NOTE, content: "own" }] }, { id: 2, x: 0, y: -5, text: "b" }], groups: [{ id: 9, atoms: [], items: [1, 2], annotations: [{ keyword: NOTE, content: "a" }, { keyword: NOTE, content: "b" }] }] });
  for (const r of [readOct(serialize({ ...shared, style })), readOct(writeOct(shared, style), true), fromCdxml(theirs(shared))]) assert.equal(r.lost.annotation, 3);
  // A hand-made .oct with 4,000 annotations on one text, each a document property's (Title): MAX_ANNOTATIONS kept, the
  // rest counted, as its CDXML copy keeps them.
  const titled = withTexts({ text: "a", notes: Array.from({ length: 4 * MAX_ANNOTATIONS }, (_, k) => ({ keyword: "Title", content: `${k}` })) });
  const json = readOct(serialize({ ...titled, style })), cd = fromCdxml(theirs(titled));
  assert.deepEqual([json.mol.captions![0].notes!.length, json.lost], [MAX_ANNOTATIONS, { annotation: 3 * MAX_ANNOTATIONS }]);
  assert.equal(cd.mol.captions![0].notes!.length, MAX_ANNOTATIONS);
});

it("L20 each limit holds on its own: a drawing past one takes edits that add none of it, and the readers and Save keep the comment and Last changed by within the notes", () => {
  // A drawing opened past one count (10,002 notes): an edit that adds a text is made; one that adds a note, or atoms
  // past theirs, is refused.
  const over = noted(MAX_NOTES + 2);
  assert.equal(overLimit(over), "A drawing holds up to 10,000 notes.");
  assert.equal(overLimit({ ...over, captions: [...over.captions!, { id: 99_999, text: "new", x: 0, y: 5 }] }, over), undefined);
  assert.equal(overLimit({ ...over, annotations: [{ keyword: NOTE, content: "one more" }] }, over), "A drawing holds up to 10,000 notes.");
  assert.equal(overLimit({ ...over, atoms: Array.from({ length: 100_001 }, () => ({ label: "C", location: [0, 0, 0] as [number, number, number] })) }, over), "A drawing holds up to 100,000 atoms.");
  // A ChemDraw file with 10,000 notes, a comment and who saved it last: within MAX_NOTES, the rest counted.
  const r = fromCdxml(theirs(noted(MAX_NOTES)).replace("<CDXML", '<CDXML Comment="A comment" ModificationUserName="sam"'));
  assert.equal(noteCount(r.mol), MAX_NOTES);
  assert.deepEqual(r.lost, { comment: 1, annotation: 1 });
  // Save adds Last changed by only within the notes limits, so the file opens whole.
  const author = withDetails(undefined, { author: "Sam" }, PROPERTIES)!, atLimit = { ...noted(MAX_NOTES - 1), annotations: author };
  assert.equal(noteCount(atLimit), MAX_NOTES);
  assert.equal(stampedWithin(atLimit, "sam"), atLimit);
  const room = { ...noted(MAX_NOTES - 2), annotations: author };
  assert.equal(noteCount(stampedWithin(room, "sam")), MAX_NOTES);
  assert.equal(src("./Editor.tsx").match(/stampedWithin\(doc, systemName\)/g)?.length, 2, "Save and Save Copy As");
});

it("L21 the drawing and each object hold MAX_ANNOTATIONS: Document Properties and Save add none past it, and a file with more keeps its properties", () => {
  const full: Mol = { ...ETHANOL, annotations: Array.from({ length: MAX_ANNOTATIONS }, (_, k) => ({ keyword: NOTE, content: `${k}` })) };
  const titled: Mol = { ...full, annotations: withDetails(full.annotations, { title: "Big" }, PROPERTIES) };
  assert.equal(titled.annotations!.length, MAX_ANNOTATIONS + 1);
  assert.equal(overLimit(titled, full), "A drawing or an object holds up to 1,000 notes.");
  const authored: Mol = { ...ETHANOL, annotations: [...full.annotations!.slice(1), ...withDetails(undefined, { author: "Sam" }, PROPERTIES)!] };
  assert.equal(stampedWithin(authored, "sam"), authored);
  assert.equal(stampedWithin({ ...authored, annotations: authored.annotations!.slice(1) }, "sam").annotations!.length, MAX_ANNOTATIONS);
  // A file with more (Octet 1.1.2 could make it; the recovery copy was then damaged and the .oct opened from its CDXML
  // without the Title): its own copy opens, with the Title, and the note left out is counted.
  for (const read of [readOct(serialize({ ...titled, style })), readOct(writeOct(titled, style), true)]) {
    assert.deepEqual([read.mol.annotations!.length, read.mol.annotations!.at(-1), read.lost, read.fallback], [MAX_ANNOTATIONS, { keyword: "Title", content: "Big" }, { annotation: 1 }, undefined]);
  }
});

it("L22 an insert set refuses selects nothing new: every caller that selects what it added asks whether set made the edit", () => {
  const editor = src("./Editor.tsx");
  assert.match(editor, /const landPart = [^\n]*set\(r\.mol, true, undefined, drop\); if \(refused\.current\) return;/);
  // File > Import a structure (place), Image to Structure, the copy-as-reaction keys, Option-drag, the Pen, a frame,
  // an arrow, a shape or table, a measurement, a side arrow, a text, a chart or spectrum added, and Tab's arrow.
  assert.equal(editor.match(/if \(refused\.current\) \{ revealNext\.current = false; return doc; \}/g)?.length, 2, "place");
  assert.match(editor, /set\(r\.mol, true\);\n\s+if \(refused\.current\) return;\n\s+revealNext\.current = true;\n\s+const sh = /, "Image to Structure");
  assert.match(editor, /set\(mol\);\n\s+if \(refused\.current\) return true;\n\s+revealNext\.current = true;\n\s+if \(hot !== undefined\)/, "the copy-as-reaction keys");
  assert.match(editor, /if \(refused\.current && drag\.was\) reselect\(\.\.\.drag\.was\);/, "Option-drag keeps the originals selected");
  assert.match(editor, /\.\.\.\(copies \? \{ was: \[atoms0, picks0\] as \[Set<number>, Set<number>\] \} : \{\}\)/);
  assert.match(editor, /const made = set\(labelEnd\(mol, id\)\);\n\s+if \(!kept\(\)\) return false;/, "a new text");
  assert.match(editor, /if \(r\.made && refused\.current\) return;/, "a measurement");
  assert.match(editor, /set\(m, false, merge\);\n\s+if \(refused\.current\) return;\n\s+labelOpen\.current = true;/, "the > key's new label");
  assert.ok((editor.match(/refused\.current/g)?.length ?? 0) >= 22, "every caller");
});

it("L23 a ChemDraw file with more than 10,000 texts: the notes on the texts left out are counted too", () => {
  const n = 10_001, m: Mol = { atoms: [], bonds: [], captions: Array.from({ length: n }, (_, k) => ({ id: k + 1, text: `${k}`, x: k % 100, y: -Math.floor(k / 100), ...(k === n - 1 ? { notes: [{ keyword: NOTE, content: "a" }, { keyword: NOTE, content: "b" }] } : {}) })) };
  const r = fromCdxml(theirs(m));
  assert.equal(r.mol.captions!.length, 10_000);
  assert.deepEqual(r.lost, { text: 1, annotation: 2 });
});

it("L24 the settings and a reagent table keep what their readers keep: New set at 50 stays on its set, attachment points and typed cells say so", () => {
  const editor = src("./Editor.tsx"), library = src("./TemplateLibrary.tsx");
  // The library's own New set: at MOST_SETS nothing is added and the library does not switch to the name typed.
  assert.match(library, /else if \(!p\.onSets\?\.add\(n\.value\)\) return;\n\s+setCategory\(/);
  assert.match(library, /add: \(name: string\) => boolean;/);
  // A template's attachment point: the settings keep 500, each by a name of up to 300 characters (settings.ts).
  assert.match(src("./settings.ts"), /k\.length <= 300[^]*\.slice\(0, 500\)\)/);
  assert.match(editor, /if \(kind\.length > 300\) return setNotice\("Octet cannot keep the attachment point of a template with so long a name\.", "info"\);/);
  assert.match(editor, /if \(Object\.keys\(settings\.anchors\)\.length >= 500\) return setNotice\("Octet keeps the attachment points of up to 500 templates\.", "info"\);/);
  // A reagent table's texts typed over its cells: 400 (stoich.ts readCells).
  assert.match(src("./stoich.ts"), /function readCells<T>\(x: unknown, read: \(v: unknown\) => T \| undefined, most = 400\)[^]*?n\+\+ < most/);
  assert.match(editor, /typedOver >= 400\) return setNotice\("A reagent table holds up to 400 typed cells\.", "info"\);/);
});

// --- H1 to H6: hostile files at the new limits read fast and in bounded memory -----------------------------------------

it("H1 a .oct JSON of 60 MB (3,000 texts of MAX_TEXT, at the file size limit) reads in time linear in its size, and keeps the texts a drawing holds (MAX_CHARACTERS)", () => {
  // Each text its own (no two the same), so nothing is shared.
  const text = prose(MAX_TEXT - 6), own = (k: number) => `${String(k).padStart(5, "0")} ${text}`;
  const file = (n: number) => JSON.stringify({ format: "octet", version: 1, structure: { atoms: [], bonds: [] }, captions: Array.from({ length: n }, (_, k) => ({ text: own(k), x: k, y: 0 })) });
  const small = file(300), big = file(3000);
  assert.ok(big.length > 60e6 && big.length < 64 * 1024 * 1024, `${big.length}`);
  parse(small);
  const tSmall = Math.min(ms(() => parse(small)), ms(() => parse(small))), heap0 = heap();
  let m: Mol | undefined;
  const tBig = ms(() => { m = parse(big); }), grown = heap() - heap0;
  // As a .oct it would be over 64 MB (a text's character takes up to 9 bytes there): the texts past MAX_CHARACTERS are
  // left out, the last first, and counted, so the drawing that opens saves.
  const kept = m!.captions!.length;
  assert.ok(kept >= 240 && textOf(m!) <= MAX_CHARACTERS, `${kept} texts kept`);
  assert.deepEqual([m!.captions![kept - 1].text.slice(0, 5), leftOf(m!)], [String(kept - 1).padStart(5, "0"), { text: 3000 - kept }]);
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
// The speed cases first, before the other cases have run the same code on other kinds of drawing.
const first = (name: string) => Number(!/^(S1|L26) /.test(name));
for (const [name, run] of [...cases].sort((p, q) => first(p[0]) - first(q[0]))) {
  try { await run(); } catch (e) { failed++; console.error(`FAIL ${name}\n  ${e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n  ") : e}`); }
}
console.log(`longtext-stress: ${cases.length - failed} of ${cases.length} cases pass`);
process.exit(failed ? 1 : 0);
