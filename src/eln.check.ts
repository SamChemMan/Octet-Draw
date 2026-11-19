// Run: node src/eln.check.ts. Issue 117 (decision 0029, docs/plans/issue-117-117-1-1-3.md). Fails loudly if an RD file
// stops carrying each reagent table's values as data fields, or an SD file each compound's row as data items; if Octet
// does not read its own RD file back to the same table; if a drawing with no table gets fields; if the 80-column rule
// of RD files breaks; or if hostile field text is not held to its limits. The editor's lines are read, and the rest runs
// in the host with no window, which writes the same bytes.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("eln.check: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { importStructure } = await import("./chem.ts");
const { gridTsv } = await import("./gridview.ts");
const { readGrid } = await import("./stoich.ts");
const { elnArchive, MOST_FIELDS, plain, rdData, readFields, RXN, sdData, TABLE_FIELD, withRecord } = await import("./eln.ts");
const { fragments } = await import("./edit.ts");
await load();

// --- Numbers, lines and hostile field text ---------------------------------------------------------------------------

assert.deepEqual([0, 2e-6, 1_500_000, 1 / 3, 106.12412, 1e-12, 86.55574, 100].map(plain), ["0", "0.000002", "1500000", "0.333333", "106.124", "0.000000000001", "86.5557", "100"]);
const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
for (const value of ["x".repeat(500), `${"a".repeat(73)}$$$$ and more`, `${"b".repeat(72)}🧪🧪🧪 ${"c".repeat(100)}`, "$ starts with a dollar", "short", `a ${"$".repeat(200)} b`, "$".repeat(300)]) {
  const lines = rdData([[`${RXN}PRODUCT(1):${"Long name ".repeat(12)}`, value]]);
  assert.ok(lines.every((l) => Array.from(l).length <= 80 || /\${80}/.test(l)), "no line passes column 80");
  assert.ok(lines.every((l) => !l.startsWith("$") || /^\$(DTYPE|DATUM) /.test(l)), "a line goes on never starting with $");
  assert.ok(lines.every((l) => !lone.test(l)), "no character is split in two");
  assert.deepEqual(readFields(lines.join("\n")), [[`${RXN}PRODUCT(1):${"Long name ".repeat(12)}`.trim(), value]], "a field reads back as written");
}
assert.equal(sdData([["Supplier <x>", "Sigma"], ["Lot", "$$$$ 7"]]), "> <Supplier x>\nSigma\n\n> <Lot>\n $$$$ 7\n\n");
// Hostile: 15,000 fields, a value of 250,000 characters, a $DATUM with no $DTYPE, a $DTYPE with no $DATUM, control
// characters, Windows and old Mac line ends. Read in well under a second.
const many = Array.from({ length: 15_000 }, (_, k) => `$DTYPE F${k}\n$DATUM ${k}`).join("\n");
let t = performance.now();
assert.equal(readFields(many).length, MOST_FIELDS);
assert.deepEqual(readFields(`$DTYPE A\n$DATUM ${"v".repeat(250_000)}\n$DTYPE B\n$DATUM b`), [["B", "b"]], "a value over its limit is left out");
assert.deepEqual(readFields(`$DTYPE ${"n".repeat(1001)}\n$DATUM a\n$DTYPE B\n$DATUM b`), [["B", "b"]], "a name over its limit is left out");
assert.deepEqual(readFields("$DATUM lost\n$DTYPE C\n$DTYPE D\n$DATUM d\u0000\u001b!\r\n$DTYPE E\r$DATUM e"), [["D", "d!"], ["E", "e"]]);
assert.ok(performance.now() - t < 1000, "hostile field text reads in under a second");

// --- One reaction on an experiment page ------------------------------------------------------------------------------

let d = drawing("experiment", "ELN"), n = 0;
const call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Check", "check"))).result;
const ok = async (name: string, args: unknown) => { const r = await call(name, args); assert.ok(!r.isError, r.content?.[0]?.text); return r; };
await ok("set_brief", { destination: { kind: "notebook" } });
await ok("draw", { kind: "reaction", start: [{ text: "benzaldehyde", number: "1" }], steps: [{ reagents: ["NaBH4", "MeOH"], below: ["0 °C, 2 h"], products: [{ text: "benzyl alcohol", number: "2" }] }] });
await ok("advanced", { tool: "fill_experiment", args: { details: { title: "Reduction of benzaldehyde", notebook: "SE-12", date: "19 November 2026" }, amounts: [{ of: "benzaldehyde", mass: "500 mg" }, { of: "NaBH4", equiv: "1.5" }, { of: "benzyl alcohol", measured: "441 mg" }], conditions: { atmosphere: "N2" },
  table: { rows: [{ name: "Supplier", values: [{ of: "benzaldehyde", text: "Sigma: 98% (lot 7)" }] }, { name: "Mass [mg]", values: [{ of: "benzaldehyde", text: "own" }] }] } } });
const text = (f: string) => d.host.fileText(f as never) as string;
const data = (rd: string) => rd.split(/^\$RFMT\n/m).slice(1).map((r) => { const k = r.search(/^\$DTYPE/m); return k < 0 ? [] : readFields(r.slice(k)); });
const rdf = text("rdf"), [fields] = data(rdf), field = (name: string) => fields.find(([k]) => k === RXN + name)?.[1];
assert.equal(data(rdf).length, 1, "one record");
assert.deepEqual([field("EXPERIMENT:Title"), field("EXPERIMENT:Notebook"), field("EXPERIMENT:Date")], ["Reduction of benzaldehyde", "SE-12", "2026-11-19"]);
assert.deepEqual([field("REACTANT(1):Role"), field("REACTANT(1):Number"), field("REACTANT(1):Formula"), field("REACTANT(1):MW [g/mol]"), field("REACTANT(1):Limiting"), field("REACTANT(1):Mass [mg]"), field("REACTANT(1):Moles [mmol]")],
  ["Reactant", "1", "C7H6O", "106.124", "Yes", "500", "4.71147"]);
assert.deepEqual([field("REAGENT(1):Name"), field("REAGENT(1):Equivalents"), field("REAGENT(2):Name"), field("REAGENT(2):Role"), field("REAGENT(2):Density [g/mL]")], ["NaBH4", "1.5", "MeOH", "Solvent", "0.791"]);
assert.deepEqual([field("PRODUCT(1):Role"), field("PRODUCT(1):Measured mass [mg]"), field("PRODUCT(1):Yield [%]"), field("PRODUCT(1):Expected mass [mg]")], ["Product", "441", "86.5557", "509.498"]);
assert.deepEqual([field("ABOVE(1)"), field("BELOW(1)"), field("CONDITIONS:Atmosphere")], ["NaBH4, MeOH", "0 °C, 2 h", "N2"]);
assert.equal(field("REACTANT(1):Supplier"), "Sigma: 98% (lot 7)", "a row of the user's own is a field");
assert.equal(fields.filter(([k]) => k === `${RXN}REACTANT(1):Mass [mg]`).length, 1, "a row of the user's own named as a field of Octet's stays in the table only");
assert.ok(JSON.parse(field(TABLE_FIELD)!).typed["r:C7H6O"].mass === 0.5, "Octet's own table");
assert.ok(rdf.split("\n").every((l) => Array.from(l).length <= 80), "every line within 80 columns");
// V2000 has the same fields.
assert.match(text("rdf2000"), /V2000/);
assert.deepEqual(data(text("rdf2000")), data(rdf));

// Octet reads its own record back (Indigo reads the reaction): the arrow's text, the numbers and the same table.
const back = importStructure(rdf), grid = d.host.doc().grids![0];
assert.equal(back.arrows?.length, 1);
assert.deepEqual(back.grids?.map((g) => [g.arrow, g.typed, g.limiting, g.conditions]), [[back.arrows![0].id, grid.typed, "r:C7H6O", { atmosphere: "N2" }]]);
assert.deepEqual(back.captions?.filter((c) => c.on).map((c) => [c.text, c.on!.side]), [["NaBH4, MeOH", "above"], ["0 °C, 2 h", "below"]]);
assert.deepEqual(back.captions?.filter((c) => c.bold).map((c) => [c.text, c.under?.length]), [["1", 8], ["2", 8]]);
// SD: each compound in the table has its row as data items, then the page's details.
const sdf = text("sdf"), records = sdf.split("$$$$\n").slice(0, -1);
const items = (r: string) => [...r.matchAll(/^> <([^>]*)>\n(.*)\n/gm)].map((m) => [m[1], m[2]]);
assert.equal(records.length, 2);
assert.deepEqual(items(records[0]).slice(0, 4), [["Reaction", "1"], ["Role", "Reactant"], ["Number", "1"], ["Formula", "C7H6O"]]);
assert.ok(items(records[1]).some(([k, v]) => k === "Yield [%]" && v === "86.5557"));
assert.ok(items(records[1]).some(([k, v]) => k === "Title" && v === "Reduction of benzaldehyde"), "the page's details");
assert.equal(importStructure(sdf).atoms.length, 16, "the SD file still reads");
assert.match(text("sdf2000"), /V2000[\s\S]*> <Reaction>/);

// add_file on a new experiment page: the table is the same, cell for cell, and so is the record but the page's details.
const before = gridTsv(d.host.tables()[0].view);
d = drawing("experiment", "Back");
await ok("set_brief", { destination: { kind: "notebook" } });
await ok("advanced", { tool: "add_file", args: { text: rdf } });
assert.equal(gridTsv(d.host.tables()[0].view), before, "the same table");
const plainFields = (rd: string) => data(rd)[0].filter(([k]) => !k.includes("EXPERIMENT:")).map(([k, v]) => [k, k.endsWith(TABLE_FIELD) ? readGrid(JSON.parse(v), 0) : v]);
assert.deepEqual(plainFields(text("rdf")), plainFields(rdf), "the same record");

// --- Hidden parts, steps and no table --------------------------------------------------------------------------------

await ok("advanced", { tool: "fill_experiment", args: { table: { hide: { rows: ["Mass"], cells: [{ row: "Moles", of: "benzaldehyde" }] } } } });
const hid = data(text("rdf"))[0];
assert.ok(!hid.some(([k]) => /Mass \[mg\]$|REACTANT\(1\):Moles/.test(k)), "a hidden row or cell writes no field");
assert.deepEqual(importStructure(text("rdf")).grids?.[0].hidden?.rows, ["mass"], "and comes back hidden");
// No table: the record has no fields and the SD file no items.
d.host.set({ ...d.host.doc(), grids: [] });
assert.ok(!/\$DTYPE/.test(text("rdf")) && !/^> </m.test(text("sdf")), "no table, no fields");
// A scheme of two steps: one table for the scheme is a record for each step with no fields, then the table's record
// (its first reactant, its last product); a table for each step is a record for each step. Every structure drawn is
// in the RD file.
d = drawing("experiment", "Scheme");
await ok("set_brief", { destination: { kind: "notebook" } });
await ok("draw", { kind: "reaction", start: [{ text: "benzaldehyde", number: "1" }], steps: [{ reagents: ["NaBH4"], products: [{ text: "benzyl alcohol", number: "2" }] }, { reagents: ["PBr3"], products: [{ text: "benzyl bromide", number: "3" }] }] });
// A structure as its atoms, each with its bond orders.
const kinds = (m: { atoms: { label: string }[]; bonds: { type: number; atoms: number[] }[] }) =>
  fragments(m as never).map((g) => g.map((i) => `${m.atoms[i].label}${m.bonds.filter((b) => b.atoms.includes(i)).map((b) => b.type).sort().join("")}`).sort().join(" "));
const drawn = () => { const all = new Set(kinds(importStructure(text("rdf")))); return kinds(d.host.doc()).filter((k) => !all.has(k)); };
assert.deepEqual(drawn(), [], "every structure drawn is in the RD file");
await ok("advanced", { tool: "fill_experiment", args: { amounts: [{ of: "benzaldehyde", mass: "1 g" }] } });
let scheme = data(text("rdf"));
assert.deepEqual(scheme.map((f) => f.length > 0), [false, false, true], "a record for each step, then one for the scheme's table");
assert.deepEqual([scheme[2].find(([k]) => k === `${RXN}REACTANT(1):Number`)?.[1], scheme[2].find(([k]) => k === `${RXN}PRODUCT(1):Number`)?.[1]], ["1", "3"]);
assert.deepEqual(drawn(), [], "every structure drawn is in the RD file with the scheme's table");
await ok("advanced", { tool: "fill_experiment", args: { steps: true } });
scheme = data(text("rdf"));
assert.equal(scheme.length, 2, "a record for each step's table");
assert.deepEqual(drawn(), [], "every structure drawn is in the RD file with a table for each step");
assert.deepEqual(scheme.map((f) => f.find(([k]) => k === `${RXN}PRODUCT(1):Number`)?.[1]), ["2", "3"]);
// The intermediate's SD record has the fields of the step that makes it.
assert.ok(text("sdf").split("$$$$\n").some((r) => /> <Number>\n2\n/.test(r) && /> <Role>\nProduct\n/.test(r)));

// --- Damaged fields on reading ---------------------------------------------------------------------------------------

const one = importStructure(rdf);
const broken = (json: string) => rdf.replace(/\$DTYPE RXN:VARIATION\(1\):OCTET:Reagent table\n[\s\S]*$/, `$DTYPE ${RXN}${TABLE_FIELD}\n$DATUM ${json}\n`);
for (const json of ["{bad", '{"typed":{"r:C7H6O":{"mass":-5}}}', '{"typed":{"r:C7H6O":{"mass":1e12}}}', "[".repeat(100_000)]) {
  const m = importStructure(broken(json));
  assert.equal(m.arrows?.length, 1, "the reaction is read");
  assert.equal(m.grids, undefined, "a damaged table is left out");
  assert.equal(m.atoms.length, one.atoms.length);
}
// A record with no arrow, or with no fields, is as it was.
const mol = { atoms: [], bonds: [] };
assert.equal(withRecord(mol, [["x", "y"]]), mol);
assert.equal(fragments(importStructure(rdf.replace(/\$DTYPE[\s\S]*$/, ""))).length, 2);

// --- File > More Formats > Export ELN Archive… -----------------------------------------------------------------------

// One folder named as the drawing, its RO-Crate metadata and the experiment's files; each file listed with its type and
// size in bytes; the details as values. A name that is no folder name is cleaned.
const page = { atoms: [], bonds: [], annotations: [{ keyword: "Title", content: "Reduction" }, { keyword: "Author", content: "S. Ellis" }, { keyword: "Keywords", content: "reduction, borohydride" }, { keyword: "Notebook", content: "SE-12" }] };
const archive = elnArchive("Reduction 1.oct", page, { oct: "<CDXML/>", cdxml: "<CDXML/>", rdf: "$RDFILE 1\nµ\n", sdf: undefined }, new Date("2026-11-19T12:00:00Z"));
assert.deepEqual(archive.map(([p]) => p), ["Reduction 1/ro-crate-metadata.json", "Reduction 1/Reduction 1/Reduction 1.oct", "Reduction 1/Reduction 1/Reduction 1.cdxml", "Reduction 1/Reduction 1/Reduction 1.rdf"]);
const crate = JSON.parse(archive[0][1]), node = (id: string) => crate["@graph"].find((x: { "@id": string }) => x["@id"] === id);
assert.equal(crate["@context"], "https://w3id.org/ro/crate/1.2/context");
assert.deepEqual(node("ro-crate-metadata.json").conformsTo, { "@id": "https://w3id.org/ro/crate/1.2" });
assert.deepEqual(node("./").hasPart, [{ "@id": "./Reduction%201/" }], "an @id is percent-encoded");
const experiment = node("./Reduction%201/");
assert.deepEqual([experiment["@type"], experiment.name, experiment.keywords, experiment.author], ["Dataset", "Reduction", "reduction, borohydride", { "@id": "#author" }]);
assert.equal(experiment.hasPart.length, 3);
assert.deepEqual([node("./Reduction%201/Reduction%201.rdf").encodingFormat, node("./Reduction%201/Reduction%201.rdf").contentSize], ["chemical/x-mdl-rdfile", "13"]);
assert.ok(crate["@graph"].some((x: { propertyID?: string; value?: string }) => x.propertyID === "Notebook" && x.value === "SE-12"));
assert.deepEqual(elnArchive("../a/b:c\u0000", page, { oct: "x" }).map(([p]) => p), ["abc/ro-crate-metadata.json", "abc/abc/abc.oct"]);
assert.equal(elnArchive("...", page, { oct: "x" })[1][0], "Untitled/Untitled/Untitled.oct");
assert.equal(elnArchive('a?*"<>|b. .oct', page, { oct: "x" })[1][0], "ab/ab/ab.oct", "a name Windows cannot extract is cleaned");

// --- The editor writes through the same records ----------------------------------------------------------------------

const editor = readFileSync(new URL("./Editor.tsx", import.meta.url), "utf8"), host = readFileSync(new URL("../scripts/headless/host.ts", import.meta.url), "utf8");
assert.match(editor, /const eln = kind === "sdf" \|\| kind === "rdf" \? elnRecords\(doc, reactions\(\)\.map\(\(x\) => x\.steps\), exporting \? \[\] : gridViews, partAtoms\(part, whole\)\) : undefined;/);
assert.match(editor, /if \(kind === "sdf"\) return toSdf\(part, v2000, eln!\.items\);/);
assert.match(host, /const \{ records, items \} = elnRecords\(m, reactionsOf\(m\), viewsOf\(m\)\)/);
assert.match(editor, /\["more_eln", "Export ELN Archive…", <Notebook size=\{18\} \/>, \(\) => checkFirst\(\(\) => void exportEln\(\)\)\],/);
assert.match(editor, /eln: elnArchive\(name, doc, \{ oct: formatOf\(part, "oct"\), cdxml: formatOf\(part, "cdxml"\), rdf: formatOf\(part, "rdf"\), sdf: formatOf\(part, "sdf"\) \}\)/);
const rust = readFileSync(new URL("../src-tauri/src/export.rs", import.meta.url), "utf8");
assert.match(rust, /\("eln", "ELN Archive \(ELN\)", &\["eln"\]\),/);
assert.match(rust, /"eln" => make_eln\(e\.eln\.as_deref\(\)\.unwrap_or_default\(\)\)\?,/);
console.log("eln.check: RD fields, SD items and read-back ok");
