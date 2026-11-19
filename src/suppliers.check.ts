// Run: node src/suppliers.check.ts. Fails loudly if Find suppliers (issue 114) lets a bad answer through, shows the
// wrong row, asks a key twice, goes on after Stop, gives a notice for each structure, runs with Online search off, or
// loses a way in (the Search menu, the Actions panel, the palette, the Properties panel). No network: the answer
// here is made up in the shape Rust gives (src-tauri/src/pubchem.rs, Suppliers), and Rust's own tests read a made-up
// PubChem answer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Structure } from "./chem.ts";
import { propertyReport, propertyValues } from "./proprows.ts";
import { askEach, offNotice, STOPPED, suppliersOf, suppliersText, wanted, withSuppliers, type Suppliers } from "./suppliers.ts";

// The answer from Rust, checked again: good entries kept, others dropped, a wrong shape refused.
const aspirin: Suppliers = { cid: 2244, suppliers: [{ name: "abcr GmbH", url: "https://abcr.example.com/5" }, { name: "Sigma-Aldrich", url: "https://www.sigmaaldrich.com/p/20" }] };
assert.deepEqual(suppliersOf(aspirin), aspirin);
assert.equal(suppliersOf(null), null, "no compound for the key");
for (const bad of [undefined, 5, "x", [], {}, { cid: "2244", suppliers: [] }, { cid: -1, suppliers: [] }, { cid: 1.5, suppliers: [] }, { cid: 2244, suppliers: {} }, { cid: 2244 }])
  assert.equal(suppliersOf(bad), undefined, JSON.stringify(bad));
const odd = suppliersOf({ cid: 7, suppliers: [null, 5, { name: 3, url: "https://a.example.com" }, { name: "Evil", url: "javascript:alert(1)" }, { name: "Plain", url: "http://a.example.com" },
  { name: "   ", url: "https://a.example.com" }, { name: "<img src=x onerror=alert(1)>", url: "https://b.example.com/" }, { name: "x".repeat(500), url: "https://c.example.com/" }] });
assert.deepEqual(odd?.suppliers.map((s) => s.name.length), [28, 120], "only https links; names kept as text, 120 characters at most");
assert.equal(suppliersOf({ cid: 1, suppliers: Array.from({ length: 2000 }, (_, k) => ({ name: `S${k}`, url: `https://e.example.com/${k}` })) })?.suppliers.length, 1000);

// The row's text.
assert.equal(suppliersText(undefined), undefined, "not asked: no value");
assert.equal(suppliersText("busy"), "Searching PubChem");
assert.equal(suppliersText(null), "No suppliers in PubChem");
assert.equal(suppliersText({ cid: 5, suppliers: [] }), "No suppliers in PubChem");
assert.equal(suppliersText({ cid: 5, suppliers: [aspirin.suppliers[0]] }), "1 supplier");
assert.equal(suppliersText(aspirin), "2 suppliers");

// The panel's rows: no Suppliers row before Find suppliers; after it, the row before PubChem CID, the CID from the
// suppliers lookup where Find hazards gave none, and the report with the row and its method.
const s: Structure = { formula: "C9H8O4", weight: 180.1574, exact: 180.0423, composition: "C 60.00; H 4.48; O 35.53" };
const plain = propertyValues([s, s], undefined, undefined, []);
assert.equal(withSuppliers(plain, []), plain, "nothing looked up: the same values");
assert.equal(withSuppliers(plain, [undefined, undefined]), plain);
const rows = (v: ReturnType<typeof propertyValues>) => Object.fromEntries(v.flat().map((r) => [r.key, r.values]));
const one = withSuppliers(plain, [aspirin, "busy"]);
assert.deepEqual(rows(one).suppliers, ["2 suppliers", "Searching PubChem"]);
assert.deepEqual(rows(one).cid, ["2244", undefined]);
assert.deepEqual(one.flat().slice(-2).map((r) => r.key), ["suppliers", "cid"], "Suppliers, then PubChem CID, last");
const ethanol = { cid: 702, pictograms: ["GHS02"], signal: "Danger", hazards: ["H225"], precautions: [] };
const both = withSuppliers(propertyValues([s, s], undefined, undefined, [ethanol, undefined]), [null, { cid: 9, suppliers: [] }]);
assert.deepEqual(rows(both).cid, ["702", "9"], "a CID from Find hazards stays; the other comes from Find suppliers");
assert.deepEqual(rows(both).suppliers, ["No suppliers in PubChem", "No suppliers in PubChem"]);
assert.deepEqual(rows(both).signal, ["Danger", undefined], "the hazards rows stay");
const report = propertyReport(one).split("\n");
assert.ok(report.includes("Suppliers\t2 suppliers") && report.some((l) => l.startsWith("Suppliers: Chemical vendors PubChem lists")));
// 12 structures, worked out 2000 times (the panel's values on every change): well within a frame each.
const twelve = propertyValues(Array(12).fill(s), undefined, undefined, []), found = Array(12).fill(aspirin);
let t = performance.now();
for (let k = 0; k < 2000; k++) withSuppliers(twelve, found);
t = (performance.now() - t) / 2000;
assert.ok(t < 0.5, `withSuppliers ${t.toFixed(3)} ms`);
t = performance.now();
for (let k = 0; k < 2000; k++) withSuppliers(twelve, []);
assert.ok((performance.now() - t) / 2000 < 0.05, "no lookup: almost nothing");

// The lookup: each key once, none found before, one at a time; Stop ends it; the first failure ends it with one
// error; Stop's own error is no failure.
assert.deepEqual(wanted(["A", undefined, "B", "A", "C"], new Set(["C"])), ["A", "B"]);
const asked: string[] = [];
let run = 1;
const answers: Record<string, string | undefined> = { A: undefined, B: "Octet cannot reach PubChem.", C: undefined };
assert.equal(await askEach(["A", "B", "C"], async (k) => { asked.push(k); return answers[k]; }, () => run === 1), "Octet cannot reach PubChem.");
assert.deepEqual(asked, ["A", "B"], "no network: one error, the rest not asked");
asked.length = 0;
assert.equal(await askEach(["A", "B", "C"], async (k) => { asked.push(k); if (k === "A") run++; return k === "A" ? STOPPED : undefined; }, () => run === 1), undefined);
assert.deepEqual(asked, ["A"], "Stop: no more keys, no notice");
asked.length = 0;
run = 1;
let open = 0, most = 0;
await askEach(["A", "C"], async (k) => { asked.push(k); most = Math.max(most, ++open); await new Promise((r) => setTimeout(r, 5)); open--; return undefined; }, () => run === 1);
assert.deepEqual(asked, ["A", "C"]);
assert.equal(most, 1, "one at a time");
assert.equal(offNotice("suppliers"), "To find suppliers, turn on Online search in Settings.");

// Every way in, and the Online search gate on each (decision 0008). The Search menu has both items with no keys.
const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const editor = read("Editor.tsx"), panel = read("Properties.tsx"), actions = read("Actions.tsx"), main = read("../src-tauri/src/main.rs"), menu = read("Menu.tsx"), mine = read("suppliers.ts");
assert.match(main, /&item\("search_patents", "Search Google Patents", ""\)\?,\s+\/\/[^\n]*\n\s+&sep\(\)\?,\s+&item\("find_suppliers", "Find Suppliers", ""\)\?,\s+&item\("find_hazards", "Find Hazards", ""\)\?,\s+\]\)\?;/);
assert.match(main, /pubchem::pubchem_suppliers, pubchem::pubchem_stop, open_link/);
assert.match(main, /n if n\.starts_with\("supplier:"\) => \{\s+search::online\(&app\)\?;\s+app\.state::<pubchem::Links>\(\)\.given/);
assert.match(main, /n if n\.starts_with\("pubchem-vendors:"\) => \{\s+search::online\(&app\)\?;/);
assert.match(main, /pubchem::closed\(&label\);/);
// The commands are there with Online search off too, so a key the user gave them says it is off; the palette and the
// Actions panel offer them only while it is on.
const searchesAt = editor.indexOf("...(settings.onlineSearch ? Object.fromEntries(Object.entries(SEARCHES)");
assert.ok(searchesAt > 0 && editor.indexOf('find_suppliers: () => findFor("suppliers")') > searchesAt && editor.indexOf('find_hazards: () => findFor("hazards")') > searchesAt);
assert.match(editor, /function findFor\(kind: Lookup\) \{\s+if \(!TAURI\)[^\n]*\n\s+if \(!settings\.onlineSearch\) return setNotice\(offNotice\(kind\), "info", \{ label: "Open Settings"/);
assert.match(editor, /search_patents: \["Search Google Patents", "", <SearchGlyph letter="G" \/>\],\n\s+find_suppliers: \["Find suppliers", "", <Storefront size=\{18\} \/>\], find_hazards: \["Find hazards", "", <WarningDiamond size=\{18\} \/>\],/);
assert.match(actions, /const searches = online \? \[[\s\S]*?"find_suppliers", false, true\), it\(<WarningDiamond size=\{18\} \/>, "Find hazards", "find_hazards", false, true\)\] : \[\];/);
assert.match(actions, /find_suppliers: "search", find_hazards: "search"/);
// The Properties panel: both buttons only with Online search on, each Stop while it runs; the Suppliers row with no
// Add to drawing box; each count a Pick with its field; names as text.
assert.match(panel, /\{online && <button className="prop-add" onClick=\{onSuppliers\}[^\n]*busy\.suppliers \? <><Stop size=\{16\} aria-hidden \/> Stop<\/> : <><Storefront size=\{16\} aria-hidden \/> Find suppliers<\/>/);
assert.match(panel, /busy\.hazards \? <><Stop size=\{16\} aria-hidden \/> Stop<\/> : <><WarningDiamond/);
assert.match(panel, /\{row\.key === "suppliers" \? <span aria-hidden \/> : \(/);
assert.match(panel, /<Pick key=\{k\} label=\{v\} value="" className="prop-link" find="Find a supplier"/);
assert.match(editor, /onSupplier=\{\(url\) => void invoke\("open_link", \{ name: `supplier:\$\{url\}` \}\)/);
assert.match(editor, /onVendors=\{\(cid\) => void invoke\("open_link", \{ name: `pubchem-vendors:\$\{cid\}` \}\)/);
// One call each; asked only on a press (findSuppliers, through lookUp); Stop asks Rust to end the request.
assert.equal(editor.split('"pubchem_suppliers"').length, 2, "one call");
assert.match(editor, /function findSuppliers\(\) \{\s+if \(!properties \|\| !TAURI\) return;\s+if \(busy\.suppliers\) return stopLookup\("suppliers"\);/);
assert.match(editor, /void invoke\("pubchem_stop", \{ kind \}\)/);
assert.match(editor, /settings\.onlineSearch && ghsKeys\?\.structures\[k\] === s/);
for (const [name, text] of [["Properties.tsx", panel], ["suppliers.ts", mine], ["Menu.tsx", menu]] as const) assert.doesNotMatch(text, /innerHTML|dangerouslySetInnerHTML|eval\(/, name);
// Pick's field over its own options: only past 12.
assert.match(menu, /const own = p\.find && p\.groups\.reduce\(\(n, g\) => n \+ g\.length, 0\) > 12 \? p\.groups\.flat\(\) : undefined/);
console.log("suppliers.check: ok");
