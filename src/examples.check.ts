// Run: node src/examples.check.ts. Octet's example drawings (issue 94, src/examples): each one opens as a drawing made
// by hand would, with no warning, the compounds it names (InChIKeys pinned from SMILES written by hand, so a change in
// Name to Structure cannot change a compound unseen) and its own style; it comes back the same through .oct, CDX and
// CDXML, and takes what a user does to a whole drawing (delete, undo, colour, flip, rotate) as any drawing does. The
// pictures are plain SVG within the size budget, and the list is the one the menu and the AI apps read.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("examples.check: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { parse, serialize } = await import("./file.ts");
const { readCdx, readOct, writeCdx, writeOct } = await import("./oct.ts");
const { fromCdxml, parseXml, toCdxml } = await import("./cdxml.ts");
const { cdxToXml, xmlToCdx } = await import("./cdx.ts");
const { cipOf, expandLabels, parseStructure, toInchiKey, toSdf } = await import("./chem.ts");
const { flipAtoms, fragments, pickAtoms } = await import("./edit.ts");
const { readStyle } = await import("./docstyle.ts");
type Mol = import("./render.ts").Mol;
await load();

const dir = new URL("./examples/", import.meta.url), file = (name: string) => readFileSync(new URL(name, dir), "utf8");
const list: { id: string; name: string; kind: string }[] = JSON.parse(file("examples.json"));

// The list: ids for menu commands and the AI apps (small letters only, so no path is ever made of one), names and kinds,
// each with its drawing and picture, and nothing else in the folder (but hidden files, such as the Finder's .DS_Store).
assert.deepEqual(list.map((x) => x.id), ["oseltamivir", "suzuki", "epoxidation", "hydrolysis", "threonine", "cycle", "ibuprofen", "photooxygenation", "aspirin", "lactams"]);
for (const x of list) assert.ok(/^[a-z]{1,30}$/.test(x.id) && x.name.trim() && x.kind.trim() && !x.name.includes("&"), x.id);
assert.equal(new Set(list.map((x) => x.name.toLowerCase())).size, list.length);
const shipped = readdirSync(dir).filter((f) => !f.startsWith("."));
assert.deepEqual(shipped.sort(), ["examples.json", ...list.flatMap((x) => [`${x.id}.json`, `${x.id}.svg`])].sort());

// Pictures: plain SVG (no script, foreignObject or link, as Home shows them in an img), at most 200 KB each and 800 KB
// for the folder.
let bytes = 0;
for (const name of shipped) bytes += statSync(new URL(name, dir)).size;
assert.ok(bytes <= 800 * 1024, `the examples take ${bytes} bytes`);
for (const x of list) {
  const svg = file(`${x.id}.svg`);
  assert.ok(svg.startsWith("<svg") && !/<script|foreignObject|href=|on[a-z]+=/i.test(svg), `${x.id}'s picture is a plain SVG`);
  assert.ok(svg.length <= 200 * 1024, `${x.id}'s picture is ${svg.length} bytes`);
}

// Each structure's InChIKey, in the order read lists them, from SMILES written by hand. null: a structure with a
// generic label (L, Ar), which has none.
const IBU = "CC(C)Cc1ccc(cc1)";
const PINNED: Record<string, (string | null)[]> = {
  oseltamivir: ["CCOC(=O)C1=C[C@@H](OC(CC)CC)[C@H](NC(C)=O)[C@@H](N)C1"],
  suzuki: ["COc1ccc(Br)cc1", "OB(O)c1ccccc1", "COc1ccc(-c2ccccc2)cc1"],
  epoxidation: ["O=Cc1ccccc1", "CCOC(=O)CP(=O)(OCC)OCC", "CCOC(=O)/C=C/c1ccccc1", "OC/C=C/c1ccccc1", "OC[C@@H]1O[C@H]1c1ccccc1"],
  hydrolysis: ["[OH-]", "CC(=O)OC", "CC([O-])(O)OC", "CC(=O)O", "C[O-]", "CC(=O)[O-]", "CO"],
  threonine: ["C[C@@H](O)[C@H](N)C(=O)O", "C[C@H](O)[C@@H](N)C(=O)O", "C[C@H](O)[C@H](N)C(=O)O", "C[C@@H](O)[C@@H](N)C(=O)O"],
  cycle: [null, null, null],
  ibuprofen: ["CC(C)Cc1ccccc1", `${IBU}C(C)=O`, `CCOC(=O)C1OC1(C)c1ccc(CC(C)C)cc1`, `${IBU}C(C)C=O`, `${IBU}C(C)/C=N/O`, `${IBU}C(C)C#N`, `${IBU}C(C)C(=O)O`,
    "CC(C)Cc1ccccc1", `${IBU}C(C)=O`, `${IBU}C(C)O`, `${IBU}C(C)C(=O)O`],
  photooxygenation: ["CC1=CC=C(C(C)C)CC1", "CC12CCC(C(C)C)(C=C1)OO2"],
  aspirin: ["OC(=O)c1ccccc1O", "CC(=O)OC(C)=O", "CC(=O)Oc1ccccc1C(=O)O"],
  lactams: [
    "CC1(C)S[C@@H]2[C@H](NC(=O)Cc3ccccc3)C(=O)N2[C@H]1C(=O)O",
    "CC1(C)S[C@@H]2[C@H](NC(=O)[C@H](N)c3ccc(O)cc3)C(=O)N2[C@H]1C(=O)O",
    "CC1=C(N2[C@@H]([C@@H](C2=O)NC(=O)[C@@H](c3ccccc3)N)SC1)C(=O)O",
    "C[C@@H]1[C@@H]2[C@H](C(=O)N2C(=C1S[C@H]3C[C@H](NC3)C(=O)N(C)C)C(=O)O)[C@@H](C)O",
    "C[C@H]1[C@@H](C(=O)N1S(=O)(=O)O)NC(=O)/C(=N\\OC(C)(C)C(=O)O)/c2csc(N)n2",
    "OC/C=C1\\O[C@@H]2CC(=O)N2[C@H]1C(=O)O",
  ],
};
const keyOf = (smiles: string | null) => smiles && toInchiKey(parseStructure(smiles));
// The stereocentres each structure must have, as read gives them (R, S, E and Z in atom order).
const STEREO: Record<string, string[]> = {
  epoxidation: ["", "", "(E)", "(E)", "(S,S)"],
  threonine: ["(S,R)", "(R,S)", "(S,S)", "(R,R)"],
  lactams: ["(S,R,R)", "(R,R,R,S)", "(R,R,R)", "(R,S,S,S,S,R)", "(S,S,Z)", "(Z,R,R)"],
};
// Each one's style: Octet's ACS Document 1996 by the book, on the purpose's page at its scale.
const STYLE: Record<string, { purpose?: string; scale: number; page: string; edges: boolean }> = {
  quick: { scale: 1, page: "A4", edges: false },
  paper: { purpose: "paper", scale: 1, page: "A4", edges: true },
  experiment: { purpose: "experiment", scale: 1, page: "A4", edges: true },
  poster: { purpose: "poster", scale: 3, page: "A0", edges: true },
};
const PURPOSE: Record<string, keyof typeof STYLE> = { oseltamivir: "quick", suzuki: "quick", cycle: "quick", aspirin: "experiment", lactams: "poster" };

// The keys of a drawing's structures, each structure once, in a sorted list (for files read back, whose order differs).
const keys = (m: Mol) => fragments(m).map((g) => { try { return toInchiKey(expandLabels(pickAtoms(m, g))) || null; } catch { return null; } }).sort();
const sorted = (k: (string | null)[]) => [...k].sort();
// A drawing's own colours: on its atoms, bonds, text (and its runs), arrows, shapes, cycles, reagent tables and fills.
const colours = (m: Mol) => [...m.atoms, ...m.bonds, ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.grids ?? []), ...(m.captions ?? []), ...(m.captions ?? []).flatMap((c) => c.runs ?? []), ...(m.fills ?? [])]
  .flatMap((x) => ((x as { colour?: string }).colour ? [(x as { colour: string }).colour] : []));

for (const x of list) {
  const text = file(`${x.id}.json`), mol = parse(text), style = readStyle(mol.style);
  // The same text in every version of Octet (1.1.3 wrote it, so it is no 1.0.x file to migrate), in its own style.
  assert.equal(JSON.parse(text).app, "1.1.3", `${x.id}: app version`);
  const want = STYLE[PURPOSE[x.id] ?? "paper"];
  assert.ok(mol.style, `${x.id} carries its style`);
  assert.deepEqual([style.preset, style.purpose, style.scale, style.page, style.edges, style.labelFont, style.labelSize * (1 / style.scale)], ["ACS Document 1996", want.purpose, want.scale, want.page, want.edges, "Arial", 10], x.id);
  // No colour of its own, but the poster's β-lactam rings (each one ring fill).
  assert.deepEqual(colours(mol), x.id === "lactams" ? Array(6).fill("#3FA9F5") : [], x.id);
  if (x.id === "lactams") assert.ok(mol.fills!.every((f) => f.atoms.length === 4), "each fill is a β-lactam ring");
  assert.ok(!/chemdraw|perkinelmer|revvity/i.test(text), `${x.id}: all its text is Octet's`);

  // Opened as the window opens it: no warning (Octet's checks and its layout check, as an AI app reads them), the
  // compounds pinned, and their stereocentres.
  const d = drawing("quick", x.name);
  d.host.set(mol);
  let n = 0;
  const call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1.2.0", session("Check", x.id))).result;
  const read = async () => (await call("read", { detail: "full" })).structuredContent;
  const first = await read();
  assert.deepEqual(first.warnings, [], `${x.id} opens with no warning`);
  assert.deepEqual(first.structures.map((s: { inchiKey?: string }) => s.inchiKey ?? null), PINNED[x.id].map(keyOf), x.id);
  if (STEREO[x.id]) assert.deepEqual(first.structures.map((s: { stereo?: string }) => s.stereo ?? ""), STEREO[x.id], x.id);
  const opened = serialize(d.host.doc());

  // Files: a saved .oct and .cdx (with Octet's drawing in them) read back as the same drawing; the CDXML and the plain
  // CDX (as ChemDraw reads them) give the same compounds; SDF has one record a structure.
  const own = (m: Mol) => serialize({ ...m, guides: undefined });
  assert.equal(own(readOct(writeOct(mol, style), true).mol), own(mol), `${x.id}: .oct`);
  assert.equal(own(readCdx(writeCdx(mol, style)).mol), own(mol), `${x.id}: .cdx`);
  const cdxml = toCdxml(mol, style), back = fromCdxml(cdxml).mol, plain = fromCdxml(cdxToXml(xmlToCdx(parseXml(cdxml)))).mol;
  const named = sorted(PINNED[x.id].map(keyOf));
  assert.deepEqual(keys(back), named, `${x.id}: CDXML`);
  assert.deepEqual(keys(plain), named, `${x.id}: CDX`);
  assert.equal((back.arrows ?? []).length, (mol.arrows ?? []).length, `${x.id}: CDXML keeps its arrows`);
  const tied = (m: Mol) => [(m.captions ?? []).map((c) => c.text).sort(), (m.captions ?? []).filter((c) => c.on).length, (m.captions ?? []).filter((c) => c.under).length];
  assert.deepEqual(tied(back), tied(mol), `${x.id}: CDXML keeps its text, conditions and numbers`);
  if (x.id !== "cycle") assert.equal(toSdf(mol).split("$$$$").length - 1, PINNED[x.id].length, `${x.id}: SDF`);

  // Select All, then Delete: every structure and object goes, with what belongs to them (numbers, conditions,
  // reagent tables, ring fills); Undo puts back exactly the drawing.
  const all = [...first.structures.map((s: { id: string }) => s.id), ...first.captions.filter((c: { of?: string; on?: string }) => !c.of).map((c: { id: string }) => c.id), ...first.arrows.map((a: { id: string }) => a.id), ...(first.cycles ?? []).map((c: { id: string }) => c.id)];
  const shapes = (d.host.doc().shapes ?? []).map((s) => `b${s.id}`);
  let out = await call("change", { operations: [{ op: "delete", ids: [...all, ...shapes] }] });
  assert.ok(!out.isError, `${x.id}: ${out.content[0].text}`);
  const left = d.host.doc();
  assert.deepEqual([left.atoms.length, left.captions?.length ?? 0, left.arrows?.length ?? 0, left.cycles?.length ?? 0, left.grids?.length ?? 0, left.fills?.length ?? 0, left.shapes?.length ?? 0], [0, 0, 0, 0, 0, 0, 0], `${x.id}: all deleted`);
  await call("advanced", { tool: "run_command", args: { command: "undo" } });
  assert.equal(serialize(d.host.doc()), opened, `${x.id}: undo puts it back`);

  // Every object takes a colour (atoms, bonds, text, arrows, shapes), and Undo takes it off.
  const texts = first.captions.map((c: { id: string }) => c.id);
  // (edit takes no cycle id: a cycle's arcs are coloured in the window, not yet by an AI app.)
  const editable = [...new Set([...all, ...texts]), ...shapes].filter((id) => !/^c\d+$/.test(id));
  out = await call("change", { operations: [{ op: "edit", ids: editable, colour: "#E5484D" }] });
  assert.ok(!out.isError, `${x.id}: ${out.content[0].text}`);
  const red = d.host.doc(), kinds = { atoms: red.atoms, bonds: red.bonds, text: (red.captions ?? []).filter((c) => !c.cycle), arrows: red.arrows ?? [], shapes: red.shapes ?? [] };
  for (const [kind, items] of Object.entries(kinds)) assert.ok((items as { colour?: string }[]).every((i) => i.colour?.toUpperCase() === "#E5484D"), `${x.id}: every ${kind} is red`);
  await call("advanced", { tool: "run_command", args: { command: "undo" } });
  assert.equal(serialize(d.host.doc()), opened, `${x.id}: undo takes the colour off`);

  // Turned through 180° twice about its middle: the drawing as it was, conditions beside their arrows throughout.
  // Each condition's distance from the middle of its arrow, which a turn keeps.
  const near = (m: Mol) => (m.captions ?? []).flatMap((c) => { const a = c.on && m.arrows?.find((r) => r.id === c.on!.arrow); return a ? [Math.round(Math.hypot(c.x - (a.from[0] + a.to[0]) / 2, c.y - (a.from[1] + a.to[1]) / 2) * 10) / 10] : []; });
  const box = (m: Mol) => { const xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]); return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map((v) => Math.round(v * 100) / 100) : []; };
  for (let k = 0; k < 2; k++) {
    out = await call("change", { operations: [{ op: "edit", ids: editable, rotate: 180 }] });
    assert.ok(!out.isError, `${x.id}: ${out.content[0].text}`);
    const m = d.host.doc();
    assert.deepEqual(near(m), near(mol), `${x.id}: conditions stay beside their arrows`);
  }
  assert.deepEqual(box(d.host.doc()), box(mol), `${x.id}: turned twice through 180°`);
}

// Flip (a mirror) on the threonine stereoisomers: each R becomes S and each S R; a second flip gives them back. Rotate
// 180° (ChemDraw's default flip) keeps them.
{
  const m = parse(file("threonine.json")), atoms = new Set(m.atoms.map((_, i) => i)), cip = (x: Mol) => cipOf(x).atoms.filter(Boolean).join("");
  const mirrored = flipAtoms(m, atoms, "horizontal", true), twice = flipAtoms(mirrored, atoms, "horizontal", true);
  assert.equal(cip(m), "SRRSSSRR");
  assert.equal(cip(mirrored), cip(m).replace(/[RS]/g, (c) => (c === "R" ? "S" : "R")));
  assert.equal(cip(twice), cip(m));
  assert.equal(cip(flipAtoms(m, atoms, "horizontal")), cip(m));
}

// What goes with a structure or an arrow, as in a drawing made by hand: a number with its structure, conditions with
// their arrow, the reagent table with the experiment page's reaction arrow.
{
  const d = drawing("quick", "x"), call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1.2.0", session("Check", "dependants"))).result;
  d.host.set(parse(file("epoxidation.json")));
  const numbers = () => (d.host.doc().captions ?? []).filter((c) => c.under !== undefined).length, conditions = () => (d.host.doc().captions ?? []).filter((c) => c.on).length;
  const [n0, c0] = [numbers(), conditions()], arrow = d.host.doc().arrows!.find((a) => d.host.doc().captions!.some((c) => c.on?.arrow === a.id))!;
  assert.ok(n0 === 5 && c0 > 0);
  assert.ok(!(await call("change", { operations: [{ op: "delete", ids: ["s1"] }] })).isError);
  assert.equal(numbers(), n0 - 1, "the number goes with its structure");
  assert.ok(!(await call("change", { operations: [{ op: "delete", ids: [`a${arrow.id}`] }] })).isError);
  assert.ok(conditions() < c0 && !(d.host.doc().captions ?? []).some((c) => c.on?.arrow === arrow.id), "the conditions go with their arrow");
  d.host.set(parse(file("aspirin.json")));
  const page = d.host.doc(), table = page.grids![0];
  assert.equal(page.grids!.length, 1);
  // The worked example adds up: 2.00 g of salicylic acid (14.5 mmol) gives 2.61 g of aspirin in theory; 2.08 g is 79.7%.
  const product = d.host.tables()[0].columns.find((c) => c.product)!;
  assert.ok(Math.abs(product.worked.yield! - 0.797) < 0.001 && Math.abs(product.worked.expectedMass! - 2.609) < 0.001, JSON.stringify(product.worked));
  assert.ok(!(await call("change", { operations: [{ op: "delete", ids: [`a${table.arrow}`] }] })).isError);
  assert.equal(d.host.doc().grids?.length ?? 0, 0, "the reagent table goes with its reaction arrow");
}

// A damaged example (as a broken or altered file would be) is refused with Octet's own message, never half read.
assert.throws(() => parse(""), /not an Octet drawing/);
assert.throws(() => parse("{"), /not an Octet drawing/);
assert.throws(() => parse(file("hydrolysis.json").replace(/"x": [-\d.]+/, '"x": 1e9')), /damaged/);
assert.throws(() => parse(file("hydrolysis.json").replace('"version": 1', '"version": 99')), /newer version/);

console.log("examples.check: ok");
