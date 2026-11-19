// Run: node src/livedecimals.check.ts. Decimals on live values (issue 77, docs/plans/issue-77-77-1-1-3.md): every
// number a Properties row or a live value shows takes the decimals set (each row's own when none is), and a live value
// already in the drawing takes new decimals (caption.places.N, Standard, edit's decimals), kept in its files. The
// stress cases are numbered as the plan lists them. The cases with the AI apps' tools run on Octet with no window
// (scripts/headless), as valuename-stress does.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { placeValues, propertyRuns, propertyValues, type Calculated } from "./proprows.ts";
import type { Structure } from "./chem.ts";
import type { Mol } from "./render.ts";

const cases: [string, () => unknown][] = [];
const it = (name: string, run: () => unknown) => cases.push([name, run]);
const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

// Ethanol's values as Indigo and Octet's calculators give them (rounded here), with a pKa and a negative logP.
const ethanol: Structure = { formula: "C2H6O", weight: 46.069, exact: 46.04186, composition: "C 52.14 H 13.13 O 34.73", logP: -1.2345, mr: 12.6034, graph: {} as Structure["graph"] };
const calc: Calculated = { tpsa: 20.23, henry: -3.5512, pka: [{ atom: 2, kind: "acid", pka: 4.76, sd: 0.5 }], joback: { tb: 351.44, tm: 159.05, tc: 513.92, pc: 61.37, vc: 167.1, hf: -234.95, gf: -167.85 }, logS: 1.1123 };
const NUMBERS = ["exact", "weight", "tpsa", "tb", "tm", "tc", "pc", "vc", "hf", "gf", "henry", "logp", "mr", "logs", "pka"];
const row = (places?: number) => Object.fromEntries(propertyValues([ethanol], () => calc, places).flat().map((r) => [r.key, r.values[0]]));
const places = (v: string) => [...v.matchAll(/[−-]?\d+(?:\.(\d+))?/g)].map((x) => x[1]?.length ?? 0);

it("S2 Standard: each row its own places", () => {
  const v = row();
  assert.deepEqual(Object.fromEntries(NUMBERS.map((k) => [k, v[k]])), {
    exact: "46.0419", weight: "46.07", tpsa: "20.23 Å²", tb: "78.3 °C", tm: "−114.1 °C", tc: "240.8 °C", pc: "61.37 bar", vc: "167.1 cm³/mol",
    hf: "−234.95 kJ/mol", gf: "−167.85 kJ/mol", henry: "−3.55", logp: "−1.23", mr: "12.60 cm³/mol", logs: "1.11", pka: "4.8 (acid)",
  });
});

it("S1, S17 Decimals 3: every number row has 3 places", () => {
  const v = row(3);
  for (const k of NUMBERS) assert.deepEqual(places(v[k]!), [3], `${k}: ${v[k]}`);
});

it("S3, S7 Decimals 0: no decimal point, and a negative value keeps Octet's minus sign", () => {
  const v = row(0);
  for (const k of NUMBERS) assert.ok(!/\d\.\d/.test(v[k]!), `${k}: ${v[k]}`);
  assert.deepEqual([v.weight, v.logp, v.pka, v.hf], ["46", "−1", "5 (acid)", "−235 kJ/mol"]);
});

it("S7 a value that rounds to zero shows 0, not −0, and a negative pKa keeps Octet's minus sign", () => {
  const near: Structure = { ...ethanol, logP: -0.39 };
  const c: Calculated = { ...calc, henry: -0.2, logS: -0.004, pka: [{ atom: 2, kind: "acid", pka: -1.2, sd: 0.5 }], joback: { ...calc.joback!, tb: 273.0, hf: -0.3 } };
  const v = Object.fromEntries(propertyValues([near], () => c, 0).flat().map((r) => [r.key, r.values[0]]));
  assert.deepEqual([v.logp, v.henry, v.logs, v.tb, v.hf, v.pka], ["0", "0", "0", "0 °C", "0 kJ/mol", "−1 (acid)"]);
  assert.equal(Object.fromEntries(propertyValues([near], () => c, 1).flat().map((r) => [r.key, r.values[0]])).logs, "0.0");
  assert.equal(Object.fromEntries(propertyValues([near], () => c).flat().map((r) => [r.key, r.values[0]])).pka, "−1.2 (acid)");
});

it("S4 Decimals 8 on m/z: 8 places on each m/z, 1 on each intensity", () => {
  const peaks = row(8).mz!.split(", ");
  assert.ok(peaks.length > 1);
  for (const p of peaks) assert.match(p, /^\d+\.\d{8} \(\d+\.\d%\)$/);
});

it("S5, S6 the formula, the elemental analysis and the hazard rows do not change with Decimals", () => {
  for (const d of [0, 5, 8]) {
    const v = row(d);
    assert.equal(v.formula, "C2H6O");
    assert.equal(v.analysis, "C, 52.14; H, 13.13; O, 34.73");
  }
});

it("S1 a live value's text: its rows' numbers with its places", () => {
  const runs = propertyRuns(propertyValues([ethanol], () => calc, 1), ["weight", "logp", "tb"]);
  assert.equal(runs.map((r) => r.text).join(""), "Molecular weight: 46.1\nBoiling point (predicted): 78.3 °C\nlogP (predicted): −1.2");
});

// A drawing with two live values and a plain text, for placeValues alone.
const base: Mol = {
  atoms: [{ label: "C", location: [0, 0, 0] }, { label: "O", location: [1, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1] }],
  captions: [
    { id: 1, text: "46.07", x: 0, y: 1, property: { attrs: { rows: "weight" }, atoms: [0, 1] } },
    { id: 2, text: "46.069", x: 0, y: 2, property: { attrs: { rows: "weight", places: "3" }, atoms: [0, 1] } },
    { id: 3, text: "plain", x: 0, y: 3 },
    // A ChemDraw property text: no rows of Octet's, so no decimals.
    { id: 4, text: "C2H6O", x: 0, y: 4, property: { attrs: { ChemicalPropertyType: "7" }, atoms: [0, 1] } },
  ],
} as Mol;
const attrs = (m: Mol) => m.captions!.map((c) => c.property?.attrs);

it("S8, S9 Decimals on two values and plain text: both values take it, the plain text does not", () => {
  const { mol, changed } = placeValues(base, new Set([1, 2, 3, 4]), 5);
  assert.deepEqual([...changed], [1, 2]);
  assert.deepEqual(attrs(mol), [{ rows: "weight", places: "5" }, { rows: "weight", places: "5" }, undefined, { ChemicalPropertyType: "7" }]);
});

it("S2 Standard removes the attribute; S10, S11 nothing to change gives the drawing itself", () => {
  const { mol, changed } = placeValues(base, new Set([2]), undefined);
  assert.deepEqual([[...changed], mol.captions![1].property!.attrs], [[2], { rows: "weight" }]);
  assert.equal(placeValues(base, new Set([1]), undefined).mol, base);
  assert.equal(placeValues(base, new Set([2]), 3).mol, base);
  assert.equal(placeValues(base, new Set([3, 4]), 2).mol, base);
  assert.equal(placeValues(base, new Set(), 2).mol, base);
});

it("the editor, the Actions panel, the right-click menu and the MCP all reach Decimals", () => {
  const editor = src("Editor.tsx"), render = src("render.ts"), actions = src("Actions.tsx"), mcp = src("mcp.ts"), host = src("../scripts/headless/host.ts");
  assert.match(editor, /what === "places" && \/\^\(\[0-8\]\|standard\)\$\/\.test\(arg\)/);
  assert.match(editor, /placeValues\(doc, picked, arg === "standard" \? undefined : Number\(arg\)\)/);
  assert.match(editor, /places: \/\^\[0-8\]\$\/\.test\(places\) \? places : "standard"/);
  assert.match(render, /\{ label: "Decimals", command: "caption\.places", value: places, options: PLACES \}/);
  assert.match(actions, /case "caption\.places":/);
  assert.match(mcp, /places\\\\\.\(standard\|\[0-8\]\)/);
  assert.match(host, /`caption\.places\.\$\{p\}`/);
});

// ---------------------------------------------------------------------------------------------------------------------
// With the AI apps' tools and no window: Indigo and Octet's calculators, as the window works them out.

if (existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) {
  const { load, drawing, session } = await import("../scripts/headless/host.ts");
  const { handle } = await import("./mcp.ts");
  const { DEFAULT_STYLE } = await import("./docstyle.ts");
  const { liveValues } = await import("./proprows.ts");
  const { parse, serialize } = await import("./file.ts");
  const { fromCdxml, parseXml, toCdxml } = await import("./cdxml.ts");
  const { cdxToXml, xmlToCdx } = await import("./cdx.ts");
  const { readOct, writeOct } = await import("./oct.ts");
  await load();
  let d = drawing("paper", "Decimals"), n = 0;
  const call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Decimals", "decimals"))).result;
  const text = (o: { content: { text: string }[] }) => o.content[0].text;
  const fresh = async (structure: string) => {
    d = drawing("paper", "Decimals");
    assert.ok(!(await call("set_brief", { destination: { kind: "paper" } })).isError);
    const o = await call("draw", { kind: "structures", structures: [{ text: structure }] });
    assert.ok(!o.isError, text(o));
  };
  const doc = () => d.host.doc();
  const byId = (m: Mol, id: number) => m.captions!.find((c) => c.id === id)!;
  const values = (m: Mol) => (atoms: number[], p?: number) => d.host.values(m, atoms, p, false);
  const addValues = async (args: Record<string, unknown>) => { const o = await call("advanced", { tool: "add_values", args }); assert.ok(!o.isError, text(o)); return doc().captions!.at(-1)!; };
  const cmd = (command: string, ids?: string[]) => call("advanced", { tool: "run_command", args: { command, ...(ids ? { ids } : {}) } });
  const numbers = (t: string) => t.split("\n").map((l) => places(l.replace(/^[^:]*: /, "").replace(/\(\d+(\.\d+)?%\)/g, "")));

  it("S1, S2, S16 caption.places.3 on a value with weight, logP and the boiling point, Standard, then Undo", async () => {
    await fresh("ethanol");
    const v = await addValues({ ids: ["s1"], rows: ["weight", "logp", "tb"] });
    assert.deepEqual(numbers(v.text), [[2], [1], [2]]);
    assert.ok(!(await cmd("caption.places.3", [`t${v.id}`])).isError);
    let c = byId(doc(), v.id);
    assert.deepEqual([numbers(c.text), c.property!.attrs.places], [[[3], [3], [3]], "3"]);
    assert.equal(liveValues(doc(), values(doc())), doc(), "the live update after it finds nothing to change");
    assert.ok(!(await cmd("caption.places.standard", [`t${v.id}`])).isError);
    c = byId(doc(), v.id);
    assert.deepEqual([c.text, c.property!.attrs.places], [v.text, undefined]);
    assert.ok(!(await cmd("undo")).isError);
    c = byId(doc(), v.id);
    assert.deepEqual([numbers(c.text), c.property!.attrs.places], [[[3], [3], [3]], "3"]);
  });

  it("S11 the same decimals again: nothing to run, no undo step", async () => {
    await fresh("propane");
    const v = await addValues({ ids: ["s1"], rows: ["weight"], decimals: 4 });
    assert.equal(v.text, "Molecular weight: 44.0970");
    const m = doc();
    assert.ok((await cmd("caption.places.4", [`t${v.id}`])).isError);
    assert.equal(doc(), m);
  });

  it("S10 Decimals on text typed over a live value: not changed", async () => {
    await fresh("benzene");
    const v = await addValues({ ids: ["s1"], rows: ["weight"] });
    assert.ok(!(await call("change", { operations: [{ op: "edit", ids: [`t${v.id}`], text: "MW 78" }] })).isError);
    const m = doc();
    assert.ok((await cmd("caption.places.1", [`t${v.id}`])).isError);
    assert.equal(doc(), m);
    const o = await call("change", { operations: [{ op: "edit", ids: [`t${v.id}`], decimals: 1 }] });
    assert.match(text(o), /takes no decimals/);
    assert.equal(byId(doc(), v.id).text, "MW 78");
  });

  it("edit's decimals: the places and the text at once, with names in the same call", async () => {
    await fresh("acetic acid");
    const v = await addValues({ ids: ["s1"], rows: ["exact", "pka"] });
    const o = await call("change", { operations: [{ op: "edit", ids: [`t${v.id}`], decimals: 2, names: false }] });
    assert.ok(!o.isError, text(o));
    assert.match(text(o), /decimals/);
    const c = byId(doc(), v.id);
    assert.equal(c.property!.attrs.places, "2");
    assert.deepEqual(numbers(c.text), [[2], [2]]);
    assert.ok(!c.text.includes("Exact mass"));
  });

  it("S14 a structure edited after Decimals: worked out again with its places", async () => {
    await fresh("ethanol");
    const v = await addValues({ ids: ["s1"], rows: ["weight", "logp"] });
    assert.ok(!(await cmd("caption.places.0", [`t${v.id}`])).isError);
    const m = doc(), o = m.atoms.findIndex((a) => a.label === "O"), changed: Mol = { ...m, atoms: m.atoms.map((a, i) => (i === o ? { ...a, label: "N" } : a)) };
    const c = byId(liveValues(changed, values(changed)), v.id);
    assert.match(c.text, /^Molecular weight: 45\nlogP \(predicted\): −?\d+$/);
  });

  it("S12 places 5 through .oct, CDXML and CDX", async () => {
    await fresh("toluene");
    const v = await addValues({ ids: ["s1"], rows: ["weight", "mr"], decimals: 5 });
    const m = doc(), cdxml = toCdxml(m, DEFAULT_STYLE);
    for (const back of [parse(serialize(m)), readOct(writeOct(m, DEFAULT_STYLE)).mol, fromCdxml(cdxml).mol, fromCdxml(cdxToXml(xmlToCdx(parseXml(cdxml)))).mol]) {
      const c = back.captions!.find((x) => x.property?.attrs.rows)!;
      assert.deepEqual(c.property!.attrs, { rows: "weight mr", places: "5" });
      assert.equal(liveValues(back, values(back)).captions!.find((x) => x.id === c.id)!.text, byId(m, v.id).text);
    }
  });

  it("S13 a file with places 9, -1, 2.5, abc or a tag: opened, and worked out with each row's own places", async () => {
    await fresh("ethane");
    const v = await addValues({ ids: ["s1"], rows: ["weight", "logp", "tb"] });
    for (const bad of ["9", "-1", "2.5", "abc", "<x/>", ""]) {
      const m = doc(), hostile = { ...m, captions: m.captions!.map((c) => (c.id === v.id ? { ...c, text: "old", property: { ...c.property!, attrs: { ...c.property!.attrs, places: bad } } } : c)) };
      for (const back of [parse(serialize(hostile)), fromCdxml(toCdxml(hostile, DEFAULT_STYLE)).mol]) assert.equal(byId(liveValues(back, values(back)), v.id).text, v.text, JSON.stringify(bad));
    }
  });

  it("S21 working the values out is as fast with Decimals set", async () => {
    await fresh("cholesterol");
    const v = await addValues({ ids: ["s1"], rows: ["weight", "logp", "mr", "tpsa", "tb", "tm", "pka", "logs"] });
    const time = (m: Mol) => { const t = performance.now(); for (let k = 0; k < 20; k++) liveValues({ ...m, captions: m.captions!.map((c) => ({ ...c, text: "" })) }, values(m)); return performance.now() - t; };
    const plain = doc(), placed = placeValues(plain, new Set([v.id]), 6).mol;
    const a: number[] = [], b: number[] = [];
    // Turn about, best of 9: a busy machine stops a single run now and then.
    for (let k = 0; k < 9; k++) { a.push(time(plain)); b.push(time(placed)); }
    assert.ok(Math.min(...b) < Math.min(...a) * 1.5 + 5, `Standard ${Math.min(...a).toFixed(1)} ms, Decimals ${Math.min(...b).toFixed(1)} ms`);
  });
} else console.log("livedecimals: the cases with the AI apps' tools skipped (no OPSIN build)");

const failed: string[] = [];
for (const [name, run] of cases) {
  try { await run(); } catch (e) { failed.push(`${name}\n    ${(e as Error).message.split("\n").slice(0, 6).join("\n    ")}`); }
}
if (failed.length) {
  console.error(`livedecimals: ${failed.length} of ${cases.length} cases fail:\n- ${failed.join("\n- ")}`);
  process.exit(1);
}
console.log(`livedecimals: ok (${cases.length} cases)`);
