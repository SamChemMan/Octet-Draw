// Run: node src/livenames.check.ts. Fails loudly if a live value (Properties > Add to drawing) stops being able to show
// its values without the names of their properties (issue 77): the setting is the word -names in its rows, which Octet
// 1.1.2 skips, so a file from 1.2 still opens there from its own data. Hidden names stay hidden as the structure
// changes, through .oct, CDXML, CDX and a copy; a predicted value keeps its mark; Hide property names and Show property
// names change the picked values only, at once; and none of it is slower than showing the names.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { addCaption, erase } from "./edit.ts";
import { parse, serialize } from "./file.ts";
import { fromCdxml, parseXml, toCdxml, LIVE_ATTRS, PROPERTY_ATTRS } from "./cdxml.ts";
import { cdxToXml, xmlToCdx } from "./cdx.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import { NO_NAMES, liveValues, nameValues, namesShown, propertyRuns, propertyValues, withNames, type PropertyValues } from "./proprows.ts";
import type { Caption, Mol } from "./render.ts";
import { plainOf } from "./richtext.ts";

// An alkane stands in for Indigo: CnH2n+2 and its weight from the atoms given; logP for the predicted rows.
const alkane = (atoms: number[], places?: number): PropertyValues => {
  const n = atoms.length, weight = 12.011 * n + 1.008 * (2 * n + 2);
  return propertyValues([{ formula: `C${n}H${2 * n + 2}`, weight, exact: weight, composition: "", logP: 0.5 * n }], undefined, places);
};
const C = (x: number, y = 0) => ({ label: "C", location: [x, y, 0] as [number, number, number] });
const ethane: Mol = { atoms: [C(0), C(1), C(5), C(6)], bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [2, 3] }] };
const live = (rows: string, atoms = [0, 1], more: Partial<Caption> = {}): Omit<Caption, "id"> => ({ text: "", x: 0, y: 0, under: atoms, property: { attrs: { rows }, atoms }, ...more });
const textOf = (m: Mol, id: number) => m.captions!.find((c) => c.id === id)!.text;
const rowsOf = (m: Mol, id: number) => m.captions!.find((c) => c.id === id)!.property?.attrs.rows;

// A1. The values alone: the formula with its subscripts, a predicted value marked after it, decimals as set.
{
  assert.equal(plainOf(propertyRuns(alkane([0, 1]), ["formula", "weight", "logp"], undefined, false)), "C2H6\n30.07\n1.00 (predicted)");
  assert.deepEqual(propertyRuns(alkane([0, 1]), ["formula"], 0, false), [{ text: "C" }, { text: "2", script: "sub" }, { text: "H" }, { text: "6", script: "sub" }]);
  assert.equal(plainOf(propertyRuns(alkane([0, 1]), ["formula", "logp"], 0)), "Formula: C2H6\nlogP (predicted): 1.00", "names by default");
  // The word: one at the end, none twice, rows kept in order; any other word that is no row key is skipped.
  assert.equal(withNames("formula weight", false), `formula weight ${NO_NAMES}`);
  assert.equal(withNames(`formula ${NO_NAMES} weight ${NO_NAMES}`, false), `formula weight ${NO_NAMES}`);
  assert.equal(withNames(`formula weight ${NO_NAMES}`, true), "formula weight");
  assert.deepEqual([namesShown("formula weight"), namesShown(`weight ${NO_NAMES}`), namesShown("weight -nam"), namesShown("weight -NAMES")], [true, false, true, true]);
  assert.ok(!/^-/.test(alkane([0]).flat().map((r) => r.key).join(" ").replace(/ /g, "")), "no row key starts with -");
}

// A1, stress 1, 9, 11, 12, 13: live without names as the structure changes; a style on all of it stays; a structure
// with no values keeps its text; unknown words are skipped; ChemDraw's own property text is never changed.
{
  let [m, id] = addCaption(ethane, live(`formula weight logp ${NO_NAMES}`, [0, 1], { colour: "#c42b2b", size: 14, angle: 30, font: "Times New Roman", x: 2, y: -3 }));
  m = liveValues(m, alkane);
  assert.equal(textOf(m, id), "C2H6\n30.07\n1.00 (predicted)");
  // Bold on all of it, then a carbon drawn on: still no names, still bold, red, 14 pt, Times, turned 30°, in place.
  m = { ...m, captions: m.captions!.map((c) => (c.id === id ? { ...c, runs: c.runs!.map((r) => ({ ...r, bold: true as const })) } : c)) };
  const grown: Mol = { ...m, atoms: [...m.atoms, C(2)], bonds: [...m.bonds, { type: 1, atoms: [1, 4] }] }, after = liveValues(grown, alkane), c = after.captions!.find((x) => x.id === id)!;
  assert.equal(c.text, "C3H8\n44.10\n1.50 (predicted)");
  assert.deepEqual([c.colour, c.size, c.angle, c.font, c.x, c.y, c.runs!.every((r) => r.bold)], ["#c42b2b", 14, 30, "Times New Roman", 2, -3, true]);
  assert.equal(c.property!.attrs.rows, `formula weight logp ${NO_NAMES}`);
  // A structure Indigo cannot read: the text stays as it was.
  assert.equal(liveValues(grown, () => undefined), grown);
  // Unknown words and a word cut short (a CDXML rows cut at 200 characters) are skipped; a value of no known row keeps
  // its text.
  [m, id] = addCaption(ethane, live(`zz weight -nam ${NO_NAMES} q`, [0, 1]));
  assert.equal(textOf(liveValues(m, alkane), id), "30.07");
  [m, id] = addCaption(ethane, { ...live(NO_NAMES), text: "kept" });
  assert.equal(liveValues(m, alkane), m);
  // rows at the files' limit of 200 characters: the word whole hides the names, the word cut short is skipped.
  const fits = `${"weight ".repeat(27)}${NO_NAMES}`, cut = `${"weight ".repeat(28)}${NO_NAMES}`.slice(0, 200);
  assert.deepEqual([fits.length <= 200, cut.length, cut.endsWith(" -nam")], [true, 200, true]);
  [m, id] = addCaption(ethane, live(fits));
  assert.equal(textOf(liveValues(m, alkane), id), "30.07");
  [m, id] = addCaption(ethane, live(cut));
  assert.equal(textOf(liveValues(m, alkane), id), "Molecular weight: 30.07");
  const theirs: Mol = { ...ethane, captions: [{ id: 9, text: "Ethane", x: 0, y: 0, property: { attrs: { ChemicalPropertyType: "1" }, atoms: [0, 1] } }] };
  assert.equal(liveValues(theirs, alkane), theirs);
  assert.equal(nameValues(theirs, new Set([9])).mol, theirs, "ChemDraw's live text has no names setting");
}

// A2, stress 2, 5, 8, 14: Hide property names and Show property names on what is picked: values with names, values
// without, plain text. Live values only change; each change is its own drawing (one undo step in the editor); the
// live update after it finds nothing to change, so no old text comes back.
{
  let m: Mol = ethane, a: number, b: number, t: number;
  [m, a] = addCaption(m, live("formula weight", [0, 1]));
  [m, b] = addCaption(m, live(`weight ${NO_NAMES}`, [2, 3]));
  [m, t] = addCaption(m, { text: "Plain words", x: 0, y: 4 });
  m = liveValues(m, alkane);
  const picked = new Set([a, b, t]);
  // One shows its names: Hide property names hides both, plain text stays.
  let step = nameValues(m, picked);
  assert.deepEqual([...step.changed], [a]);
  let hidden = liveValues(step.mol, alkane, step.changed);
  assert.deepEqual([textOf(hidden, a), textOf(hidden, b), textOf(hidden, t)], ["C2H6\n30.07", "30.07", "Plain words"]);
  assert.equal(liveValues(hidden, alkane), hidden, "the live update after it changes nothing");
  // None shows them: Show property names shows both.
  step = nameValues(hidden, picked);
  const shown = liveValues(step.mol, alkane, step.changed);
  assert.deepEqual([textOf(shown, a), textOf(shown, b)], ["Formula: C2H6\nMolecular weight: 30.07", "Molecular weight: 30.07"]);
  assert.deepEqual([rowsOf(shown, a), rowsOf(shown, b)], ["formula weight", "weight"]);
  // Nothing to change is the drawing itself: no undo step.
  assert.equal(nameValues(shown, new Set([t])).mol, shown);
  assert.equal(nameValues(shown, picked, true).mol, shown);
  // only: the other values are not worked out (a stale one stays as it is until the live update).
  const stale = { ...shown, captions: shown.captions!.map((c) => (c.id === b ? { ...c, text: "old" } : c)) };
  step = nameValues(stale, new Set([a]), false);
  assert.equal(textOf(liveValues(step.mol, alkane, step.changed), b), "old");
  // Twenty quick presses end as the count says, and each one is its own change.
  let x = hidden;
  for (let k = 0; k < 20; k++) { const s = nameValues(x, picked); assert.ok(s.changed.size > 0); x = liveValues(s.mol, alkane, s.changed); }
  assert.deepEqual([textOf(x, a), textOf(x, b)], [textOf(hidden, a), textOf(hidden, b)]);
  // The structure deleted: its value goes with it, as its number does (proprows.check has part of one deleted).
  assert.equal(erase(hidden, new Set([0, 1]), new Set()).captions!.find((c) => c.id === a), undefined);
}

// A3: Add to drawing writes what the panel's Names says, live ones with the word; the panel's rows, Copy and Copy report
// keep the names. (The editor's own code, read as text.)
{
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), panel = readFileSync(new URL("Properties.tsx", import.meta.url), "utf8");
  assert.match(editor, /names = settings\.propertyNames !== false;[^]*?propertyRuns\(values, chosen, k, names\)[^]*?rows: withNames\(chosen\.join\(" "\), names\)/);
  assert.match(panel, /aria-pressed=\{names\} aria-label="Property names"[^\n]*>Names<\/button>/);
  assert.match(panel, /onCopy\(`\$\{rowLabel\(row\)\}: \$\{text\}`\)/);
  assert.match(panel, /onCopy\(propertyReport\(values\)\)/);
  const settings = readFileSync(new URL("settings.ts", import.meta.url), "utf8");
  assert.match(settings, /propertyNames: saved\.propertyNames === false \? false : undefined/);
}

// A4, stress 4, 6, 7: kept with the value through .oct, CDXML, CDX and a copy; ChemDraw sees the text alone; the word
// is in rows, so the keys Octet 1.1.2 accepts are all there is (a key it does not know makes it read the CDXML copy).
{
  let [m, id] = addCaption(ethane, live(`formula weight ${NO_NAMES}`, [0, 1]));
  m = liveValues({ ...m, captions: m.captions!.map((c) => (c.id === id ? { ...c, property: { ...c.property!, attrs: { ...c.property!.attrs, places: "3" } } } : c)) }, alkane);
  const want = m.captions!.find((c) => c.id === id)!;
  assert.equal(want.text, "C2H6\n30.070");
  assert.ok(Object.keys(want.property!.attrs).every((k) => LIVE_ATTRS.includes(k)) && LIVE_ATTRS.every((k) => !PROPERTY_ATTRS.includes(k)));
  const same = (x: Mol) => { const c = x.captions!.find((y) => y.text === want.text)!; return { text: c.text, property: c.property }; };
  const it = { text: want.text, property: want.property };
  assert.deepEqual(same(parse(serialize(m))), it, ".oct data");
  assert.deepEqual(same(readOct(writeOct(m, DEFAULT_STYLE)).mol), it, ".oct");
  assert.equal(readOct(writeOct(m, DEFAULT_STYLE)).foreign, undefined, "from its own data");
  const xml = toCdxml(m, DEFAULT_STYLE);
  assert.deepEqual(same(fromCdxml(xml).mol), it, "CDXML");
  assert.deepEqual(same(fromCdxml(cdxToXml(xmlToCdx(parseXml(xml)))).mol), it, "CDX");
  assert.deepEqual(same(readCdx(writeCdx(m, DEFAULT_STYLE)).mol), it, "Octet's CDX");
  assert.deepEqual(same(fromCdxml(toCdxml(m, DEFAULT_STYLE, { selection: { atoms: [0, 1], items: [id] } })).mol), it, "a copy with its structure");
  assert.equal(fromCdxml(toCdxml(m, DEFAULT_STYLE, { selection: { atoms: [], items: [id] } })).mol.captions![0].property, undefined, "the value alone is plain text");
  // ChemDraw's view: the text as drawn, with no property object for it.
  assert.ok(!xml.includes("chemicalproperty"));
  assert.match(xml, /<s [^>]*>\n30\.070<\/s><\/t>/);
  // Opened again it is up to date: no change, so the drawing is not marked edited.
  const opened = fromCdxml(xml).mol;
  assert.equal(liveValues(opened, alkane), opened);
}

// A6: Octet's own work for live values is no slower with names hidden than shown (medians of interleaved runs), on 40
// structures the size of paclitaxel (62 atoms). Hide property names on one takes well under a frame; on all 40 it is
// one live update of those 40. A 500-residue peptide's value is one update per change. Indigo's part is the same either
// way, so a stand-in gives the values.
{
  const N = 40, A = 62, atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [];
  for (let s = 0; s < N; s++) for (let k = 0; k < A; k++) { atoms.push(C(s * 20 + (k % 10), Math.floor(k / 10))); if (k) bonds.push({ type: 1, atoms: [s * A + k - 1, s * A + k] }); }
  const stand = (n: number): PropertyValues => propertyValues([{ formula: "C47H51NO14", weight: 853.91, exact: 853.33, composition: "C 66.11; H 6.02; N 1.64; O 26.23", logP: 3.2, mr: 214.3 }], undefined, n === undefined ? undefined : 2);
  const build = (names: boolean) => {
    let m: Mol = { atoms, bonds };
    for (let s = 0; s < N; s++) m = addCaption(m, live(withNames("formula exact weight mz analysis logp mr", names), Array.from({ length: A }, (_, k) => s * A + k)))[0];
    return liveValues(m, () => stand(2));
  };
  const named = build(true), bare = build(false);
  // What changes per update: one atom moved, so every value is worked out again (and finds the same text).
  const nudge = (m: Mol): Mol => ({ ...m, atoms: m.atoms.map((a, i) => (i ? a : { ...a, location: [a.location[0] + 0.01, a.location[1], 0] })) });
  const time = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t; };
  const median = (l: number[]) => [...l].sort((p, q) => p - q)[l.length >> 1];
  const shownT: number[] = [], hiddenT: number[] = [];
  for (let k = 0; k < 41; k++) {
    shownT.push(time(() => liveValues(nudge(named), () => stand(2))));
    hiddenT.push(time(() => liveValues(nudge(bare), () => stand(2))));
  }
  assert.ok(median(hiddenT) <= median(shownT) * 1.25 + 0.5, `hidden ${median(hiddenT).toFixed(2)} ms, shown ${median(shownT).toFixed(2)} ms`);
  const all = new Set(named.captions!.map((c) => c.id)), one = new Set([named.captions![0].id]);
  const oneT: number[] = [], allT: number[] = [], fullT: number[] = [];
  for (let k = 0; k < 21; k++) {
    oneT.push(time(() => { const s = nameValues(named, one); liveValues(s.mol, () => stand(2), s.changed); }));
    allT.push(time(() => { const s = nameValues(named, all); liveValues(s.mol, () => stand(2), s.changed); }));
    fullT.push(time(() => liveValues(nudge(bare), () => stand(2))));
  }
  assert.ok(median(oneT) < 16, `one value ${median(oneT).toFixed(2)} ms`);
  assert.ok(median(allT) <= median(fullT) * 1.5 + 1, `40 values ${median(allT).toFixed(2)} ms against one live update ${median(fullT).toFixed(2)} ms`);
  // A 500-residue peptide (about 4000 atoms): one change asks for its values once.
  const P = 4000, pAtoms = Array.from({ length: P }, (_, k) => C(k % 100, Math.floor(k / 100))), pBonds = pAtoms.slice(1).map((_, k) => ({ type: 1, atoms: [k, k + 1] as [number, number] }));
  let calls = 0;
  const [pep, pid] = addCaption({ atoms: pAtoms, bonds: pBonds }, live(withNames("formula weight", false), [0, 1]));
  const pAfter = liveValues(pep, (at) => { calls++; return alkane(at); });
  assert.equal(calls, 1);
  assert.equal(textOf(pAfter, pid), `C${P}H${2 * P + 2}\n${(12.011 * P + 1.008 * (2 * P + 2)).toFixed(2)}`);
  calls = 0;
  const s = nameValues(pAfter, new Set([pid]));
  liveValues(s.mol, (at) => { calls++; return alkane(at); }, s.changed);
  assert.equal(calls, 1, "hiding or showing the names is one update");
  console.log(`livenames timing: live update of 40 values ${median(shownT).toFixed(2)} ms with names, ${median(hiddenT).toFixed(2)} ms without; Hide property names on 1 value ${median(oneT).toFixed(2)} ms, on 40 ${median(allT).toFixed(2)} ms`);
}

console.log("livenames: ok");
