// Run: node src/suppliers.check.ts. Fails loudly if Find suppliers (issue 114) lets a bad answer through, orders or
// searches the Suppliers window wrongly, loses a favourite, asks a key twice, goes on after Stop, gives a notice for
// each structure, runs with Online search off, or loses a way in (the Search menu, the Actions panel, the palette). No
// network: the answer here is made up in the shape Rust gives (src-tauri/src/pubchem.rs, Suppliers), and Rust's own
// tests read a made-up PubChem answer.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROPERTY_ROWS } from "./proprows.ts";
import { askEach, failedNotice, NO_KEY, offNotice, shownSuppliers, SLOW, starred, STOPPED, supplierKey, suppliersOf, UNREACHED_NOTICE, wanted, type Suppliers } from "./suppliers.ts";

// The answer from Rust, checked again: good entries kept, others dropped, a wrong shape refused.
const aspirin: Suppliers = { cid: 2244, suppliers: [{ name: "abcr GmbH", url: "https://abcr.example.com/5", codes: ["AB123"], products: 1 },
  { name: "Sigma-Aldrich", url: "https://www.sigmaaldrich.com/p/20", codes: ["A5376", "01478"], products: 4 }, { name: "TCI", url: "https://www.tcichemicals.com/p", codes: [], products: 1 }] };
assert.deepEqual(suppliersOf(aspirin), aspirin);
assert.equal(suppliersOf(null), null, "no compound for the key");
for (const bad of [undefined, 5, "x", [], {}, { cid: "2244", suppliers: [] }, { cid: -1, suppliers: [] }, { cid: 1.5, suppliers: [] }, { cid: 2244, suppliers: {} }, { cid: 2244 }])
  assert.equal(suppliersOf(bad), undefined, JSON.stringify(bad));
const odd = suppliersOf({ cid: 7, suppliers: [null, 5, { name: 3, url: "https://a.example.com" }, { name: "Evil", url: "javascript:alert(1)" }, { name: "Plain", url: "http://a.example.com" },
  { name: "   ", url: "https://a.example.com" }, { name: "<img src=x onerror=alert(1)>", url: "https://b.example.com/" }, { name: "x".repeat(500), url: "https://c.example.com/" }] });
assert.deepEqual(odd?.suppliers.map((s) => s.name.length), [28, 120], "only https links; names kept as text, 120 characters at most");
assert.deepEqual(odd?.suppliers.map((s) => [s.codes, s.products]), [[[], 1], [[], 1]], "no codes or count from Rust: none, and one product");
const codes = suppliersOf({ cid: 7, suppliers: [{ name: "A", url: "https://a.example.com", codes: ["X1", 5, " ", "y".repeat(80), "Z", "W"], products: -3 }] })?.suppliers[0];
assert.deepEqual(codes?.codes, ["X1", "y".repeat(40), "Z"], "codes kept as text: three at most, 40 characters each");
assert.equal(codes?.products, 1);
assert.equal(suppliersOf({ cid: 1, suppliers: Array.from({ length: 2000 }, (_, k) => ({ name: `S${k}`, url: `https://e.example.com/${k}` })) })?.suppliers.length, 1000);

// The window's list: favourites first, then A to Z as Rust gave them; the search matches every word in the name or a
// catalogue number, letter case aside.
const names = (fav: string[], q = "") => shownSuppliers(aspirin.suppliers, fav, q).map((s) => s.name);
assert.deepEqual(names([]), ["abcr GmbH", "Sigma-Aldrich", "TCI"]);
assert.deepEqual(names([supplierKey("TCI")]), ["TCI", "abcr GmbH", "Sigma-Aldrich"], "a favourite goes first");
assert.deepEqual(names([], "sigma"), ["Sigma-Aldrich"]);
assert.deepEqual(names([], "a5376"), ["Sigma-Aldrich"], "by catalogue number");
assert.deepEqual(names([], "abcr gmbh"), ["abcr GmbH"]);
assert.deepEqual(names([], "zzz"), []);
assert.equal(supplierKey(" Sigma - Aldrich "), supplierKey("sigma-aldrich"), "favourites by name, letter case and spaces aside");
assert.deepEqual(starred([], "TCI", true), ["tci"]);
assert.deepEqual(starred(["tci", "abcrgmbh"], "TCI", false), ["abcrgmbh"]);
assert.deepEqual(starred(["tci"], "TCI", true), ["tci"], "starred once");
// No Suppliers row in the Properties panel any more: suppliers have their own window.
assert.ok(!PROPERTY_ROWS.flat().some((r) => r.key === "suppliers"));
// 1000 suppliers searched 200 times (each key typed): well within a frame each.
const many = Array.from({ length: 1000 }, (_, k) => ({ name: `Supplier ${k}`, url: `https://e.example.com/${k}`, codes: [`C${k}`], products: 1 }));
let t = performance.now();
for (let k = 0; k < 200; k++) shownSuppliers(many, ["supplier5"], "supp 9");
t = (performance.now() - t) / 200;
assert.ok(t < 2, `shownSuppliers ${t.toFixed(3)} ms`);

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
assert.match(editor, /search_patents: \["Search Google Patents", "", <SearchGlyph letter="G" \/>\],\n\s+find_suppliers: \["Find suppliers", "", <Storefront size=\{18\} \/>\], find_hazards: \["Find hazards", "", <FirstAidKit size=\{18\} \/>\],/);
assert.match(actions, /const searches = online \? \[[\s\S]*?"find_suppliers", false, true\), it\(<FirstAidKit size=\{18\} \/>, "Find hazards", "find_hazards", false, true\)\] : \[\];/);
assert.match(actions, /find_suppliers: "search", find_hazards: "search"/);
// The Suppliers window: opened by Find suppliers (not the Properties panel), the mark while PubChem answers, links
// through open_link's supplier: path only, favourites in Settings, and closing it stops the lookup.
const win = read("SupplierWindow.tsx");
assert.match(win, /<Dialog title="Suppliers" plain wide/);
assert.match(win, /className="mcp-mol" onAnimationIteration=\{\(\) => setTurn\(turn \+ 1\)\}><MarkParts \/>/);
assert.match(win, /onClick=\{\(\) => onOpen\(s\.url\)\}/);
assert.match(editor, /onOpen=\{\(url\) => void invoke\("open_link", \{ name: `supplier:\$\{url\}` \}\)/);
assert.match(editor, /onVendors=\{\(cid\) => void invoke\("open_link", \{ name: `pubchem-vendors:\$\{cid\}` \}\)/);
assert.match(editor, /favouriteSuppliers: starred\(s\.favouriteSuppliers \?\? \[\], name, on\)/);
assert.match(editor, /if \(!supplierView && busy\.suppliers\) stopLookup\("suppliers"\);/);
assert.match(editor, /if \(kind === "suppliers"\) return busy\.suppliers \? undefined : findSuppliers\(\);/);
assert.doesNotMatch(panel, /onSupplier|Storefront|<Pick/, "the Properties panel has no suppliers");
// One call each; asked only on a press (findSuppliers, through lookUp); Stop asks Rust to end the request.
assert.equal(editor.split('"pubchem_suppliers"').length, 2, "one call");
assert.match(editor, /function findSuppliers\(\) \{\s+if \(!TAURI\) return;\s+const found = structuresIn\(selection\);/);
assert.match(editor, /stopping\.current\[kind\] = invoke\("pubchem_stop", \{ kind \}\)/);
// A Stop just pressed reaches Rust before the next run asks; an old request does not clear the next run's row.
assert.match(editor, /await stopping\.current\[kind\];/);
assert.match(editor, /\.finally\(\(\) => \{ if \(runs\.current\.suppliers === run\) setAskingKey/);
// No structure with a key: a notice, not silence. A slow PubChem: its own notice.
assert.match(editor, /async function lookUp\(kind: Lookup, keys: \(string \| undefined\)\[\]\) \{\s+if \(!keys\.some\(Boolean\)\) return setNotice\(NO_KEY, "info"\);/);
assert.equal(NO_KEY, "PubChem cannot look up this structure.");
assert.equal(failedNotice(SLOW), SLOW);
assert.equal(failedNotice("Octet cannot reach PubChem."), UNREACHED_NOTICE);
assert.match(read("../src-tauri/src/pubchem.rs"), new RegExp(`pub const SLOW: &str = "${SLOW.replace(/\./g, "\\.")}";`), "the same words in Rust");
// The risk assessment's hazards are their own kind: the panel's Stop leaves them, and a stopped one is no failure.
assert.match(editor, /const e = await askHazards\(key, "risk"\);[\s\S]{0,120}else if \(e !== STOPPED\) \{ failed\+\+;/);
assert.match(read("../src-tauri/src/pubchem.rs"), /Stop::new\(window\.label\(\), if by == "risk" \{ "risk" \} else \{ "hazards" \}\)/);
assert.match(editor, /settings\.onlineSearch && ghsKeys\?\.structures\[k\] === s/);
for (const [name, text] of [["Properties.tsx", panel], ["SupplierWindow.tsx", win], ["suppliers.ts", mine], ["Menu.tsx", menu]] as const) assert.doesNotMatch(text, /innerHTML|dangerouslySetInnerHTML|eval\(/, name);
// Pick's field over its own options: only past 12, all groups but the last, which stays below (Open in PubChem). The
// list keeps its height as the field narrows it, and the field takes the focus however the list opened.
assert.match(menu, /const own = p\.find && p\.groups\.slice\(0, -1\)\.flat\(\)\.length > 12 \? p\.groups\.slice\(0, -1\)\.flat\(\) : undefined/);
assert.match(menu, /\[\.\.\.\(found\.length \? \[found\] : \[\]\), p\.groups\[p\.groups\.length - 1\]\]/);
assert.match(menu, /shown = own \? p\.groups : groups/);
assert.match(menu, /<input className="list-find" autoFocus placeholder/);
console.log("suppliers.check: ok");
