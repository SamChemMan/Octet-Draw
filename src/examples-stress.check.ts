// Run: node src/examples-stress.check.ts. Stress cases for Octet's example drawings (issue 94, src/examples): the plan's
// stress list (docs/plans/issue-94-examples.md, S1 to S28) and more, each case on its own, so one that fails does not
// hide the rest. Every case is named; the ones that fail are listed at the end and the check exits 1.
//
// The cases that need the editor itself run in WebKit (the Mac app's engine, scripts/look/webkit.swift) against a dev
// server, only when it is given: OCTET_STRESS_URL=http://localhost:1468 node src/examples-stress.check.ts. The ChemDraw
// 22.2 round trip reads the files ChemDraw saved, only when their folder is given: OCTET_STRESS_CHEMDRAW=<folder> with
// <id>.cdxml in it (each example's CDXML, opened in ChemDraw 22.2 and saved by it as ChemDraw XML).
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("examples-stress.check: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { parse, serialize } = await import("./file.ts");
const { readCdx, readOct, writeCdx, writeOct } = await import("./oct.ts");
const { fromCdxml, toCdxml } = await import("./cdxml.ts");
const { cipOf, expandLabels, toInchiKey } = await import("./chem.ts");
const { fitSizes, fragments, insertMol, pickAtoms, EMPTY } = await import("./edit.ts");
const { readStyle } = await import("./docstyle.ts");
const { problems } = await import("./check.ts");
const { formulaWeight } = await import("./stoich.ts");
type Mol = import("./render.ts").Mol;
await load();

const root = fileURLToPath(new URL("../", import.meta.url)), dir = new URL("./examples/", import.meta.url);
const text = (id: string) => readFileSync(new URL(`${id}.json`, dir), "utf8");
const list: { id: string; name: string; kind: string }[] = JSON.parse(readFileSync(new URL("examples.json", dir), "utf8"));
const ids = list.map((x) => x.id), nameOf = Object.fromEntries(list.map((x) => [x.id, x.name]));

// One case: it runs on its own, and a failure is kept with its name.
const failed: string[] = [];
let ran = 0;
async function test(name: string, run: () => unknown) {
  ran++;
  try { await run(); } catch (e) { failed.push(name); console.error(`FAIL ${name}: ${(e as Error).message.split("\n").slice(0, 6).join(" ")}`); }
}
const skip = (name: string, why: string) => console.log(`examples-stress.check: ${name} skipped (${why})`);

const keys = (m: Mol) => fragments(m).map((g) => { try { return toInchiKey(expandLabels(pickAtoms(m, g))) || null; } catch { return null; } }).sort();
let rpc = 0;
const caller = (d: ReturnType<typeof drawing>, s: string) => async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1.2.0", session("Stress", s))).result;
const opened = (id: string) => { const d = drawing("quick", nameOf[id]); d.host.set(parse(text(id))); return d; };
const counts = (m: Mol) => Object.fromEntries((["captions", "arrows", "shapes", "cycles", "grids", "fills", "groups"] as const).map((k) => [k, (m[k] as unknown[] | undefined)?.length ?? 0]));

// ---- The compounds are the real ones ----

// Each named compound's InChIKey, as PubChem gives it for the name (17 November 2026): the drawings hold the real
// compounds, stereocentres included, not only what the hand-written SMILES in examples.check.ts say.
const PUBCHEM: Record<string, Record<string, string>> = {
  oseltamivir: { oseltamivir: "VSZGPKBBMSAYNT-RRFJBIMHSA-N" },
  suzuki: { "4-bromoanisole": "QJPJQTDYNZXKQF-UHFFFAOYSA-N", "phenylboronic acid": "HXITXNWTGFUOAU-UHFFFAOYSA-N", "4-methoxybiphenyl": "RHDYQUZYHZWTCI-UHFFFAOYSA-N" },
  epoxidation: { benzaldehyde: "HUMNYLRZRPPJDN-UHFFFAOYSA-N", "triethyl phosphonoacetate": "GGUBFICZYGKNTD-UHFFFAOYSA-N", "ethyl (E)-cinnamate": "KBEBGUQPQBELIU-CMDGGOBGSA-N",
    "(E)-cinnamyl alcohol": "OOCCDEMITAIZTP-QPJJXVBHSA-N", "(2S,3S)-3-phenylglycidol": "PVALSANGMFRTQM-IUCAKERBSA-N" },
  threonine: { "L-threonine": "AYFVYJQAPQTCCC-GBXIJSLDSA-N", "D-threonine": "AYFVYJQAPQTCCC-STHAYSLISA-N", "L-allothreonine": "AYFVYJQAPQTCCC-HRFVKAFMSA-N", "D-allothreonine": "AYFVYJQAPQTCCC-PWNYCUMCSA-N" },
  ibuprofen: { isobutylbenzene: "KXUHSQYYJYAXGZ-UHFFFAOYSA-N", "4'-isobutylacetophenone": "KEAGRYYGYWZVPC-UHFFFAOYSA-N", "2-(4-isobutylphenyl)propanal": "DMZVZANOMJGHKO-UHFFFAOYSA-N",
    "2-(4-isobutylphenyl)propanenitrile": "PKQKHWNHCKNYSW-UHFFFAOYSA-N", "1-(4-isobutylphenyl)ethanol": "VLVILBSSXMZZCB-UHFFFAOYSA-N", ibuprofen: "HEFNNWSXXWATRW-UHFFFAOYSA-N" },
  photooxygenation: { "alpha-terpinene": "YHQGMYUVUMAZJR-UHFFFAOYSA-N", ascaridole: "MGYMHQJELJYRQS-UHFFFAOYSA-N" },
  aspirin: { "salicylic acid": "YGSDEFSMJLZEOE-UHFFFAOYSA-N", "acetic anhydride": "WFDIJRYMOXRFFG-UHFFFAOYSA-N", aspirin: "BSYNRYMUTXBXSQ-UHFFFAOYSA-N" },
  lactams: { benzylpenicillin: "JGSARLDLIJGVTE-MBNYWOFBSA-N", amoxicillin: "LSQZJLSUYDQPKJ-NJBDSQKTSA-N", cefalexin: "ZAIPMKNFIOOWCQ-UEKVPHQBSA-N",
    meropenem: "DMJNNHOOLUXYBV-PQTSNVLCSA-N", aztreonam: "WZPBZJONDBGPKJ-VEHQQRBSSA-N", "clavulanic acid": "HZZVJAQRINQKSD-PBFISZAISA-N" },
};
for (const [id, named] of Object.entries(PUBCHEM)) await test(`compounds: ${id} holds the PubChem compounds`, () => {
  const k = new Set(keys(parse(text(id))));
  for (const [name, key] of Object.entries(named)) assert.ok(k.has(key), `${name} (${key}) is not in ${id}`);
});

// The worked experiment adds up: the procedure's amounts are the ones the molar masses give (2.00 g salicylic acid is
// 14.5 mmol; 5.0 mL acetic anhydride at 1.08 g/mL is 52.9 mmol; 2.08 g aspirin of 2.61 g is 80%).
await test("chemistry: the aspirin procedure's numbers agree", () => {
  const procedure = parse(text("aspirin")).captions!.find((c) => /^Salicylic acid/.test(c.text))!.text;
  const mmol = (g: number, f: string) => Math.round((g / formulaWeight(f)!) * 10000) / 10;
  assert.match(procedure, new RegExp(`Salicylic acid \\(2\\.00 g, ${mmol(2, "C7H6O3")} mmol\\)`));
  assert.match(procedure, new RegExp(`Acetic anhydride \\(5\\.0 mL, ${mmol(5 * 1.08, "C4H6O3")} mmol\\)`));
  assert.match(procedure, new RegExp(`Aspirin \\(2\\.08 g, ${Math.round((2.08 / ((2 / formulaWeight("C7H6O3")!) * formulaWeight("C9H8O4")!)) * 100)}%\\)`));
});

// The mechanism's curved arrows go from a lone pair (an atom with pairs) or a bond to an atom or a bond, within half a
// bond length; the B(Ac)2 steps are the reversible addition and loss, then the deprotonation.
await test("chemistry: each curved arrow of the mechanism starts and ends on electrons", () => {
  const m = parse(text("hydrolysis")), d = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const mid = (k: number) => { const [a, b] = m.bonds[k].atoms.map((i) => m.atoms[i].location); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const curved = m.arrows!.filter((a) => a.kind === "curved");
  assert.equal(curved.length, 6);
  for (const a of curved) {
    const fromPair = m.atoms.some((x) => x.pairs && d(x.location, a.from) <= 0.5), fromBond = m.bonds.some((_, k) => d(mid(k), a.from) <= 0.05);
    const to = m.atoms.some((x) => d(x.location, a.to) <= 0.05) || m.bonds.some((_, k) => d(mid(k), a.to) <= 0.05);
    assert.ok((fromPair || fromBond) && to, `arrow ${a.id}`);
  }
  assert.deepEqual(m.arrows!.filter((a) => a.kind !== "curved").map((a) => a.kind), ["equilibrium", "equilibrium", "reaction"]);
});

// The Jablonski diagram: S0 below T1 below S1; absorption up from S0, fluorescence down from S1's lowest level,
// intersystem crossing from S1 to T1, phosphorescence down from T1 (Kasha's rule).
await test("chemistry: the Jablonski diagram's levels and arrows", () => {
  const m = parse(text("photooxygenation")), y = (t: string) => m.captions!.find((c) => c.text === t)!.y;
  assert.ok(y("S0") < y("T1") && y("T1") < y("S1"));
  const on = (t: string) => m.arrows!.find((a) => m.captions!.some((c) => c.text === t && c.on?.arrow === a.id))!;
  const [abs, fl, isc, ph] = ["hνA", "hνF", "ISC", "hνP"].map(on);
  assert.ok(abs.to[1] > abs.from[1] && fl.to[1] < fl.from[1] && ph.to[1] < ph.from[1], "absorption up, emission down");
  assert.ok(isc.from[1] > isc.to[1] && isc.to[1] > y("S0"), "ISC from S1 down to T1");
  assert.ok(Math.abs(fl.from[1] - isc.from[1]) < 0.01, "fluorescence and ISC from the same (lowest) S1 level");
});

// British English in every text the examples show (BRAND.md).
await test("words: British English in every example", () => {
  for (const id of ids) {
    const words = [...(parse(text(id)).captions ?? []).map((c) => c.text), nameOf[id], list.find((x) => x.id === id)!.kind].join(" ");
    assert.doesNotMatch(words, /\b(color|colored|center|centered|catalyz\w*|analyz\w*|liter|aluminum|vapor|gray)\b/i, id);
  }
});

// ---- What a user does to a whole example ----

// Clean Up Structure and Clean Up Reaction (ChemDraw's), on each example as opened: the same compounds and
// stereocentres, conditions still on their arrows, and no new warning.
for (const id of ids) for (const command of ["clean_up", "clean_reaction"]) await test(`edit: ${command} on ${id} keeps the chemistry`, async () => {
  const d = opened(id), before = d.host.doc(), cip = (m: Mol) => JSON.stringify(cipOf(m).atoms);
  const out = await caller(d, id)("advanced", { tool: "run_command", args: { command } });
  assert.ok(!out.isError, out.content[0].text);
  const after = d.host.doc(), arrows = new Set((after.arrows ?? []).map((a) => a.id));
  assert.deepEqual(keys(after), keys(before));
  assert.equal(cip(after), cip(before));
  assert.ok(problems(after).length <= problems(before).length, JSON.stringify(problems(after).slice(0, 3)));
  assert.ok((after.captions ?? []).every((c) => !c.on || arrows.has(c.on.arrow)));
});

// Copy all of one example and paste it into each other (Editor copyOut: the drawing with its style; onPaste: fitSizes
// then insertMol, 0.8 bond lengths across): everything comes, nothing points at what is not there, ids stay unique, and
// the result saves and opens.
await test("paste: every example into every other", () => {
  for (const a of ids) for (const b of ids) {
    const into = parse(text(b)), clip = parse(serialize(parse(text(a)))), add = clip.style ? fitSizes(clip, readStyle(clip.style), readStyle(into.style)) : clip;
    const m = insertMol(into, add, [0.8, -0.8]).mol, sum = counts(into), more = counts(add), got = counts(m);
    for (const k of Object.keys(sum)) assert.equal(got[k], sum[k] + more[k], `${a} into ${b}: ${k}`);
    const arrows = new Set((m.arrows ?? []).map((x) => x.id)), cycles = new Set((m.cycles ?? []).map((x) => x.id));
    assert.ok((m.captions ?? []).every((c) => (!c.on || arrows.has(c.on.arrow)) && (!c.cycle || cycles.has(c.cycle.cycle)) && (!c.under || c.under.every((i) => m.atoms[i]))), `${a} into ${b}: text points at nothing`);
    assert.ok((m.grids ?? []).every((g) => arrows.has(g.arrow)), `${a} into ${b}: a table with no arrow`);
    const all = [...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.groups ?? [])].map((x) => x.id);
    assert.equal(new Set(all).size, all.length, `${a} into ${b}: an id twice`);
    parse(serialize(m));
  }
});

// A chemist's messy drawing: 34 examples' worth of structures (253 structures, about 4000 atoms) with the poster and the
// experiment page pasted in. The paste and the checks after it stay fast (S12, S14).
await test("paste: the poster and the experiment page into a 253-structure drawing stay fast", () => {
  const add = (m: Mol, x: Mol, at: [number, number]) => insertMol(m, x.style ? fitSizes(x, readStyle(x.style), readStyle(m.style ?? x.style)) : x, at).mol;
  let m: Mol = { ...EMPTY, style: parse(text("epoxidation")).style };
  for (let k = 0; k < 34; k++) m = add(m, parse(text(["ibuprofen", "lactams", "epoxidation"][k % 3])), [(k % 6) * 60, Math.floor(k / 6) * 40]);
  assert.ok(fragments(m).length > 200);
  for (const id of ["lactams", "aspirin"]) {
    const t0 = performance.now(), pasted = add(m, parse(serialize(parse(text(id)))), [0.8, -0.8]), t1 = performance.now();
    problems(pasted);
    const t2 = performance.now();
    assert.ok(t1 - t0 < 100 && t2 - t1 < 1000, `${id}: paste ${Math.round(t1 - t0)} ms, check ${Math.round(t2 - t1)} ms`);
  }
});

// The experiment page: the first small edit (moving the procedure) changes only that; the reagent table's worked yield
// stays; deleting the limiting reagent and undoing goes back to the page as opened.
await test("experiment: the first edit on the aspirin page changes only what it edits", async () => {
  const d = opened("aspirin"), call = caller(d, "exp"), before = d.host.doc();
  const read = (await call("read", { detail: "full" })).structuredContent;
  const procedure = read.captions.find((c: { text: string }) => /^Salicylic acid/.test(c.text));
  let out = await call("change", { operations: [{ op: "move", ids: [procedure.id], dx: 0.1, dy: 0 }] });
  assert.ok(!out.isError, out.content[0].text);
  const after = d.host.doc();
  for (const k of ["grids", "annotations", "fields", "arrows", "shapes", "groups"] as const) assert.deepEqual(after[k], before[k], k);
  assert.equal(after.atoms.length, before.atoms.length);
  assert.ok(Math.abs(d.host.tables()[0].columns.find((c) => c.product)!.worked.yield! - 0.797) < 0.001);
  out = await call("change", { operations: [{ op: "delete", ids: [read.structures[0].id] }] });
  assert.ok(!out.isError, out.content[0].text);
  for (let k = 0; k < 2; k++) await call("advanced", { tool: "run_command", args: { command: "undo" } });
  assert.equal(serialize(d.host.doc()), serialize(before));
});

// ---- Files ----

// CDXML and CDX keep what a chemist would miss: stereocentres, charges, lone pairs, italic and sub- or superscript
// runs (hν, S₀, ¹O₂), every caption's text and the curved arrows.
for (const id of ids) await test(`files: ${id} through CDXML and CDX keeps stereo, charges, lone pairs and styled text`, () => {
  const m = parse(text(id)), st = readStyle(m.style);
  const cip = (q: Mol) => fragments(q).map((g) => cipOf(pickAtoms(q, g)).atoms.filter(Boolean).join("")).sort().join("|");
  const runs = (q: Mol) => (q.captions ?? []).flatMap((c) => c.runs ?? []).filter((r) => r.italic || r.script).map((r) => `${r.text}:${r.italic ? "i" : ""}${r.script ?? ""}`).sort();
  const texts = (q: Mol) => (q.captions ?? []).map((c) => c.text).sort();
  for (const [form, back] of [["CDXML", fromCdxml(toCdxml(m, st)).mol], ["CDX", readCdx(writeCdx(m, st)).mol]] as const) {
    assert.equal(cip(back), cip(m), `${form} stereo`);
    assert.deepEqual(back.atoms.map((a) => a.charge ?? 0).filter(Boolean).sort(), m.atoms.map((a) => a.charge ?? 0).filter(Boolean).sort(), `${form} charges`);
    assert.equal(back.atoms.filter((a) => a.pairs).length, m.atoms.filter((a) => a.pairs).length, `${form} lone pairs`);
    assert.deepEqual(runs(back), runs(m), `${form} styled runs`);
    assert.deepEqual(texts(back), texts(m), `${form} text`);
    assert.equal((back.arrows ?? []).filter((a) => a.kind === "curved").length, (m.arrows ?? []).filter((a) => a.kind === "curved").length, `${form} curved arrows`);
  }
});

// Damaged copies of the examples, as a hostile or truncated file would be: refused with Octet's own message, or read
// and then usable (checks, save, CDXML, an AI app's read) with nothing thrown.
await test("files: damaged copies are refused or read safely", async () => {
  const mut = (id: string, f: (j: any) => void) => { const j = JSON.parse(text(id)); f(j); return JSON.stringify(j); }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cases: [string, string][] = [
    ["truncated", text("aspirin").slice(0, text("aspirin").length >> 1)],
    ["a bond to no atom", mut("hydrolysis", (j) => (j.structure.bonds[0].atoms = [0, 9999]))],
    ["a number under no atom", mut("epoxidation", (j) => (j.captions.find((c: { under?: unknown }) => c.under).under = [9999]))],
    ["conditions on no arrow", mut("epoxidation", (j) => (j.captions.find((c: { on?: { arrow: number } }) => c.on).on.arrow = 9999))],
    ["a table on no arrow", mut("aspirin", (j) => (j.grids[0].arrow = 9999))],
    ["a fill of no atoms", mut("lactams", (j) => (j.fills[0].atoms = [9999, 9998, 9997, 9996]))],
    ["a fill of 100 000 atoms", mut("lactams", (j) => (j.fills[0].atoms = Array.from({ length: 100_000 }, (_, i) => i % 4)))],
    ["a cycle node of no atom", mut("cycle", (j) => (j.cycles[0].nodes[0] = [9999]))],
    ["two arrows with one id", mut("ibuprofen", (j) => (j.arrows[1].id = j.arrows[0].id))],
    ["a 5 MB caption", mut("oseltamivir", (j) => (j.captions[0].text = "Y".repeat(5_000_000)))],
    ["runs 1000 deep", mut("threonine", (j) => { let r: unknown = [{ text: "a" }]; for (let i = 0; i < 1000; i++) r = [{ text: "a", runs: r }]; j.captions[5].runs = r; })],
    ["a page that is no page", mut("lactams", (j) => (j.style.page = "A-1"))],
    ["a bond length of 0", mut("lactams", (j) => (j.style.bond = 0))],
    ["a bond length of 1e9", mut("lactams", (j) => (j.style.bond = 1e9))],
    ["an arrow from null", mut("suzuki", (j) => (j.arrows[0].from = null))],
    ["1e9 lone pairs", mut("hydrolysis", (j) => (j.structure.atoms.find((a: { pairs?: number }) => a.pairs).pairs = 1e9))],
    ["200 000 details", mut("aspirin", (j) => (j.annotations = Array.from({ length: 200_000 }, (_, i) => ({ key: `k${i}`, value: "v" }))))],
    ["__proto__", text("suzuki").replace('"format"', '"__proto__": {"polluted": true}, "format"')],
  ];
  for (const [name, t] of cases) {
    let m: Mol;
    try { m = parse(t); } catch (e) { assert.match((e as Error).message, /^This (file is not an Octet drawing|drawing is damaged|drawing comes from a newer version)/, name); continue; }
    problems(m);
    parse(serialize(m));
    toCdxml(m, readStyle(m.style));
    readOct(writeOct(m, readStyle(m.style)), true);
    const d = drawing("quick", "x");
    d.host.set(m);
    const out = await caller(d, "hostile")("read", { detail: "full" });
    assert.ok(!out.isError, `${name}: ${out.content?.[0]?.text}`);
  }
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
});

// Octet 1.1.2 (tag v1.1.2) opens what this version saves of each example: the .oct (its own drawing inside), the CDXML,
// and the shipped text itself (S17).
await test("files: Octet 1.1.2 reads each example's .oct, CDXML and text", async () => {
  if (spawnSync("git", ["rev-parse", "--verify", "-q", "v1.1.2"], { cwd: root }).status !== 0) return skip("Octet 1.1.2", "no tag v1.1.2");
  const old = mkdtempSync(join(tmpdir(), "octet-112-"));
  execFileSync("tar", ["-x", "-C", old], { input: execFileSync("git", ["archive", "v1.1.2", "src", "package.json"], { cwd: root, maxBuffer: 1 << 28 }) });
  symlinkSync(join(root, "node_modules"), join(old, "node_modules"));
  try {
    const oldOct = await import(join(old, "src/oct.ts")), oldFile = await import(join(old, "src/file.ts"));
    for (const id of ids) {
      const m = parse(text(id)), st = readStyle(m.style), back: Mol = oldOct.readOct(writeOct(m, st), true).mol;
      assert.deepEqual(counts(back), counts(m), `${id}: .oct`);
      assert.deepEqual([back.atoms.length, back.bonds.length, back.atoms.filter((a) => a.pairs).length], [m.atoms.length, m.bonds.length, m.atoms.filter((a) => a.pairs).length], `${id}: .oct atoms`);
      assert.equal(oldOct.readOct(toCdxml(m, st)).mol.atoms.length, m.atoms.length, `${id}: CDXML`);
      oldFile.parse(text(id));
    }
  } finally { rmSync(old, { recursive: true, force: true }); }
});

// ChemDraw 22.2 opens each example's CDXML and saves it; Octet reads ChemDraw's file back with the same compounds and
// the same text (S16). Conditions and labels that are words, not structures, must stay text.
{
  const folder = process.env.OCTET_STRESS_CHEMDRAW;
  if (!folder) skip("ChemDraw 22.2 round trip", "set OCTET_STRESS_CHEMDRAW");
  else for (const id of ids) {
    const file = join(folder, `${id}.cdxml`);
    if (!existsSync(file)) { skip(`ChemDraw 22.2 round trip of ${id}`, "ChemDraw did not save it"); continue; }
    await test(`files: ${id} back from ChemDraw 22.2 has the same compounds and text`, () => {
      const ours = parse(text(id)), back = fromCdxml(readFileSync(file, "utf8")).mol;
      const texts = (m: Mol) => (m.captions ?? []).map((c) => c.text.replace(/\s+/g, " ").trim()).sort();
      assert.deepEqual(texts(ours).filter((t) => !texts(back).includes(t)), [], "text that came back as something else");
      assert.deepEqual(keys(back), keys(ours), "compounds");
    });
  }
}

// ---- The list, the menu and the AI apps ----

// No example's name, read as an id by the AI apps, is another example's id.
await test("list: no name is read as another example", () => {
  for (const x of list) for (const n of [x.name.toLowerCase(), x.name.toLowerCase().replace("β", "beta")]) assert.ok(!ids.includes(n) || n === x.id, `${x.name} reads as ${n}`);
});

// What an AI app may send to drawings new with an example (S18, S19): names in any case, padded or with a dot read as
// the id; anything else refused before a window opens. The purpose given with one is left out with a note.
await test("mcp: drawings new with odd examples", async () => {
  const d = drawing("quick", "x"), call = caller(d, "odd");
  let asked: unknown[] | undefined;
  d.host.newWindow = async (...a: unknown[]) => { asked = a; return "draw-9"; };
  d.host.windows = async () => [];
  const read: [unknown, string][] = [["Aspirin ", "aspirin"], ["ASPIRIN", "aspirin"], ["aspirin\n", "aspirin"], [".aspirin", "aspirin"], ["Suzuki Cycle", "cycle"], ["suzuki coupling", "suzuki"], ["Photo-oxygenation", "photooxygenation"], ["BETA-LACTAM ANTIBIOTICS", "lactams"]];
  for (const [example, id] of read) {
    asked = undefined;
    const out = await call("drawings", { action: "new", example });
    assert.ok(!out.isError && asked?.[3] === id, `${JSON.stringify(example)}: ${out.content[0].text}`);
  }
  for (const example of [null, true, 7, ["aspirin"], { id: "aspirin" }, "aspirin\u0000", "аspirin", "photo oxygenation", "lactam", "constructor", "__proto__", "toString", "../examples/aspirin", "%2e%2e/aspirin", "x".repeat(41), ""]) {
    asked = undefined;
    const out = await call("drawings", { action: "new", example });
    assert.ok(out.isError && asked === undefined, `${JSON.stringify(example).slice(0, 40)} was not refused`);
  }
  for (const action of ["list", "use", "close"]) assert.ok((await call("drawings", { action, example: "aspirin" })).isError, action);
  const out = await call("drawings", { action: "new", example: "aspirin", for: "experiment" });
  assert.ok(!out.isError && out.content[0].text.includes("Octet left out for experiment"), out.content[0].text);
});

// Octet with no window (scripts/headless/stdio.ts, as `Octet Draw --headless --mcp`): two copies of examples, an edit
// in one leaves the other as it was, a closed copy opens again as shipped, twenty opens in a row are quick, and the
// shipped files never change (S20, S21).
await test("mcp: examples through Octet with no window", async () => {
  const hash = () => createHash("sha256").update(ids.map(text).join("")).digest("hex"), was = hash();
  const p = spawn(process.execPath, [join(root, "scripts/headless/stdio.ts"), "--headless", "--mcp"], { cwd: root, stdio: ["pipe", "pipe", "ignore"] });
  const waiting = new Map<number, (m: any) => void>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  createInterface({ input: p.stdout! }).on("line", (l) => { const m = JSON.parse(l); waiting.get(m.id)?.(m.result); waiting.delete(m.id); });
  let n = 0;
  const call = (name: string, args: unknown) => new Promise<any>((done) => { const id = ++n; waiting.set(id, done); p.stdin!.write(`${JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } })}\n`); }); // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    assert.match((await call("drawings", { action: "new", example: "aspirin" })).content[0].text, /^Octet opened a new drawing with a copy of its example Aspirin/);
    assert.equal((await call("read", {})).structuredContent.structures.length, 3);
    await call("drawings", { action: "new", example: "lactams" });
    const lactams = (await call("read", {})).structuredContent.structures.map((s: { id: string }) => s.id);
    assert.ok(!(await call("change", { operations: [{ op: "edit", ids: lactams, colour: "#E5484D" }] })).isError);
    await call("drawings", { action: "use", drawing: "headless-1" });
    assert.deepEqual((await call("read", { detail: "full" })).structuredContent.structures.map((s: { colour?: string }) => s.colour ?? null), [null, null, null]);
    assert.match((await call("drawings", { action: "close", drawing: "headless-2" })).content[0].text, /closed/);
    await call("drawings", { action: "new", example: "lactams" });
    assert.ok((await call("read", { detail: "full" })).structuredContent.structures.every((s: { colour?: string }) => !s.colour));
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) await call("drawings", { action: "new", example: ids[k % ids.length] });
    assert.ok(performance.now() - t0 < 5000, `${Math.round(performance.now() - t0)} ms`);
    assert.equal(hash(), was, "the shipped examples changed");
  } finally { p.kill(); }
});

// The Command Palette finds each example by its name (plan J6 and its list of entry points). Its commands come from
// MENU_NAMES and the lists in paletteCommands (Editor.tsx), not from the native menu. (Named exactly "Aspirin", a
// palette command would come before "Draw aspirin" for the query "aspirin": its score is 100.)
await test("menu: the Command Palette lists the examples", () => {
  const editor = readFileSync(new URL("./Editor.tsx", import.meta.url), "utf8"), start = editor.indexOf("const MENU_NAMES");
  assert.ok(start > 0);
  assert.match(editor.slice(start, editor.indexOf("const paletteCommands") + 9000), /EXAMPLES|example_/, "no example in MENU_NAMES or paletteCommands");
});

// The File menu lists Open Example between Open… and Open Recent, where ChemDraw has Open Samples, and Edit Picture
// from Word keeps its place by Insert….
await test("menu: File > Open Example comes before Open Recent", () => {
  const rust = readFileSync(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8"), file = rust.slice(rust.indexOf('Submenu::with_items(app, "&File"'));
  const order = ["\"home\"", "\"new\"", "&new_for", "\"open\"", "&open_example", "&open_recent", "\"import\"", "\"insert_file\""].map((s) => file.indexOf(s));
  assert.ok(order.every((at, k) => at > 0 && (k === 0 || at > order[k - 1])), JSON.stringify(order));
  assert.match(rust, /file\.insert\(&item\("edit_word", "Edit Picture from Word", ""\)\?, 8\)/);
});

// ---- The editor, in WebKit ----

const url = process.env.OCTET_STRESS_URL?.replace(/\/$/, "");
if (!url) skip("the editor cases", "set OCTET_STRESS_URL to a running dev server");
else if (process.platform !== "darwin" || spawnSync("which", ["swift"]).status !== 0) skip("the editor cases", "WebKit needs a Mac with swift");
else {
  const swift = readFileSync(new URL("../scripts/look/webkit.swift", import.meta.url), "utf8");
  const work = mkdtempSync(join(tmpdir(), "octet-stress-"));
  // The page's helpers: waits, keys, the dev-only hook (Editor octetGallery: open, picture, name, edited, shown).
  const HELP = `const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await f(); if (v) return v; await wait(30); } return null; };
const key = (init, t = document.activeElement ?? document.body) => t.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
const button = (text) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
const g = () => window.octetGallery, R = {};
const NAMES = ${JSON.stringify(nameOf)}, IDS = Object.keys(NAMES);
const undo = () => key({ key: "z", code: "KeyZ", metaKey: true }, document.body);
const dontSave = async () => { await wait(300); const b = button("Don’t Save"); if (b) { b.click(); await wait(300); } };
const show = async (id) => { await wait(850); g().open(id); await dontSave(); await until(() => g().name() === NAMES[id] && !g().edited() && g().picture(), 10000); await wait(300); };
await until(() => document.querySelector(".home, .editor"));
await wait(1200);
button("Skip")?.click();
await wait(800);
try {`;
  const END = `} catch (e) { R.exception = String(e); }
R.errors = window.__errors;
return JSON.stringify(R);`;
  const page = (path: string, body: string, dark = false) => {
    const js = join(work, `page-${Math.random().toString(36).slice(2)}.js`), host = join(work, dark ? "dark.swift" : "light.swift");
    writeFileSync(js, `${HELP}\n${body}\n${END}`);
    if (!existsSync(host)) writeFileSync(host, dark ? swift.replace("web.navigationDelegate = nav", "web.appearance = NSAppearance(named: .darkAqua)\nweb.navigationDelegate = nav") : swift);
    const run = spawnSync("swift", [host, `${url}${path}`, js], { encoding: "utf8", timeout: 400_000 });
    try { return JSON.parse(run.stdout.trim().split("\n").pop()!); } catch { throw new Error(`WebKit did not finish: ${run.stdout.slice(-300)}${run.stderr.slice(-300)}`); }
  };
  const noErrors = (r: { errors?: string[]; exception?: string }) => { assert.equal(r.exception, undefined); assert.deepEqual((r.errors ?? []).filter((e) => !/Importing a module script failed/.test(e)), []); };

  // Home with no recent drawings: every example as a tile, nothing of theirs fetched but the pictures shown, keys.
  const home = page("/", `
R.fetched = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /examples\\/[a-z]+\\.json\\?.*raw/.test(n));
R.tiles = [...document.querySelectorAll('.home-tile[data-tile^="example:"]')].map((t) => t.getAttribute("aria-label"));
await wait(1500);
R.broken = [...document.querySelectorAll('.home-tile[data-tile^="example:"] img')].filter((i) => !i.complete || !i.naturalWidth).length;
const tile = document.querySelector('.home-tile[data-tile="example:threonine"]');
tile.focus(); key({ key: "Backspace" }); key({ key: "Delete" }); await wait(400);
R.afterDelete = document.querySelectorAll('.home-tile[data-tile^="example:"]').length;
tile.click();
await until(() => g()?.name() === NAMES.threonine);
await wait(600);
R.opened = [g().name(), g().edited()];
const shipped = g().picture();
undo(); await wait(500);
R.undoAtOnce = [g().edited(), g().picture() === shipped];`);
  await test("editor: Home shows every example and fetches no drawing at start (J3, J5)", () => {
    noErrors(home);
    assert.deepEqual(home.fetched, []);
    assert.deepEqual(home.tiles, list.map((x) => `${x.name}, ${x.kind}`));
    assert.equal(home.broken, 0);
    assert.equal(home.afterDelete, list.length);
  });
  await test("editor: a click on a tile opens one unedited copy, named after the example (S1, S5)", () => assert.deepEqual(home.opened, [nameOf.threonine, false]));
  await test("editor: Undo straight after opening leaves the example as opened (S7)", () => assert.deepEqual(home.undoAtOnce, [false, true], "Undo took the drawing back to the blank one before it, marked edited"));

  // Opening, again and again: a double request, a held key, two examples at once, unsaved changes.
  // (The dev server answers each picture's ?url import with a small module that gives its address: that is not the
  // picture. A build makes those addresses part of the main chunk.)
  const opens = page("/?editor", `
R.atStart = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /examples\\/[a-z]+\\.(json\\?.*raw|svg(?!\\?import))/.test(n));
g().open("lactams"); g().open("oseltamivir");
await wait(4000);
R.race = g().name();
await show("cycle");
let was = g().shown();
g().open("threonine"); g().open("threonine");
await wait(1500);
R.double = g().shown() - was;
await show("cycle");
was = g().shown();
for (let k = 0; k < 50; k++) { g().open("hydrolysis"); await wait(50); }
await wait(1500);
R.held = g().shown() - was;
await show("threonine");
const shipped = g().picture();
key({ key: "a", code: "KeyA", metaKey: true }, document.body); await wait(300);
key({ key: "Backspace" }, document.body); await wait(500);
await wait(900); g().open("hydrolysis"); await wait(800);
R.dialog = document.querySelector(".dialog h2, [role=dialog] h2")?.textContent;
button("Cancel")?.click(); await wait(500);
R.cancel = [g().name(), g().edited(), !!g().picture()];
await wait(900); g().open("threonine"); await wait(800);
button("Don’t Save")?.click();
await until(() => !g().edited() && g().picture(), 5000); await wait(400);
R.again = [g().name(), g().edited(), g().picture() === shipped];
R.selectAll = {};
for (const id of IDS) {
  await show(id);
  const before = g().picture();
  key({ key: "a", code: "KeyA", metaKey: true }, document.body); await wait(300);
  key({ key: "Backspace" }, document.body); await wait(500);
  const gone = !g().picture();
  undo(); await wait(500);
  R.selectAll[id] = [gone, g().picture() === before, g().edited()];
}`);
  await test("editor: nothing of the examples loads with a drawing at start", () => { noErrors(opens); assert.deepEqual(opens.atStart, []); });
  await test("editor: two examples asked for at once show the one asked for last", () => assert.equal(opens.race, nameOf.oseltamivir, "the slower first request was shown over the later one"));
  await test("editor: the same example asked for twice at once opens once (S1)", () => assert.equal(opens.double, 1));
  await test("editor: an example asked for every 50 ms for 2.5 s (a held key) opens once (S1)", () => assert.equal(opens.held, 1, `it opened ${opens.held} times`));
  await test("editor: unsaved changes ask first; Cancel keeps them; the example opens again as shipped (S2, S3)", () => {
    assert.equal(opens.dialog, `Save changes to “${nameOf.threonine}”?`);
    assert.deepEqual(opens.cancel, [nameOf.threonine, true, false]);
    assert.deepEqual(opens.again, [nameOf.threonine, false, true]);
  });
  await test("editor: Select All, Delete and Undo on every example (S8)", () => {
    for (const id of ids) assert.deepEqual(opens.selectAll[id], [true, true, false], id);
  });

  // Copy the whole poster and paste it three times into other examples; Undo takes each paste off (S12).
  const clip = page("/?editor", `
await show("lactams");
const dt = new DataTransfer();
document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
await wait(300);
const octet = dt.getData("application/x-octet+json");
R.copied = octet.length;
R.paste = {};
for (const into of ["hydrolysis", "ibuprofen", "aspirin"]) {
  await show(into);
  const before = g().picture(), times = [];
  for (let k = 0; k < 3; k++) {
    const p = new DataTransfer(); p.setData("application/x-octet+json", octet);
    const t0 = performance.now();
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: p, bubbles: true, cancelable: true }));
    await frame(); times.push(performance.now() - t0); await wait(400);
  }
  const more = (g().picture()?.match(/<text/g) ?? []).length - (before.match(/<text/g) ?? []).length;
  for (let k = 0; k < 3; k++) { undo(); await wait(400); }
  R.paste[into] = { more, slowest: Math.max(...times), back: g().picture() === before };
}`);
  await test("editor: copy the poster, paste it into three examples, undo (S12)", () => {
    noErrors(clip);
    assert.ok(clip.copied > 10_000);
    for (const [into, r] of Object.entries(clip.paste as Record<string, { more: number; slowest: number; back: boolean }>)) assert.ok(r.more > 200 && r.slowest < 500 && r.back, `${into}: ${JSON.stringify(r)}`);
  });

  // The Command Palette (⇧⌘A in a browser): each example by its name (J6).
  const palette = page("/?editor", `
const type = (input, text) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); };
R.found = {};
for (const name of Object.values(NAMES)) {
  key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true }, document.body);
  const input = await until(() => document.querySelector(".command-palette input"), 3000);
  type(input, name); await wait(700);
  R.found[name] = [...document.querySelectorAll(".command-list .command-name")].some((n) => n.textContent.includes(name));
  key({ key: "Escape" }, input); await wait(300);
}`);
  await test("editor: the Command Palette finds each example by its name (J6)", () => {
    noErrors(palette);
    assert.deepEqual(Object.entries(palette.found).filter(([, found]) => !found).map(([name]) => name), []);
  });

  // Home with recent drawings (the UI-only preview's ?demo): the Examples button and page, its keys and its menu.
  const gallery = page("/?demo", `
const ex = await until(() => document.querySelector("[data-examples]"));
R.button = ex?.textContent;
ex.click();
await until(() => document.querySelector("[data-section='examples'] .home-tile")); await wait(500);
R.tiles = document.querySelectorAll("[data-section='examples'] .home-tile").length;
R.focus = [document.activeElement?.getAttribute("aria-label")];
key({ key: "ArrowRight" }); await wait(200); R.focus.push(document.activeElement?.getAttribute("aria-label"));
key({ key: "ArrowDown" }); await wait(200); R.focus.push(document.activeElement?.getAttribute("aria-label"));
key({ key: "a", code: "KeyA", metaKey: true }, document.body); await wait(300);
R.chosen = document.querySelectorAll(".home-slot.chosen").length;
key({ key: "Backspace" }, document.body); await wait(300);
R.after = document.querySelectorAll("[data-section='examples'] .home-tile").length;
document.querySelector("[data-tile='example:threonine']").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
await wait(500);
R.menu = [...document.querySelectorAll(".context-menu [role=menuitemradio]")].map((b) => b.textContent.trim());
key({ key: "Escape" }); await wait(500);
key({ key: "Escape" }); await wait(500);
R.back = [!!document.querySelector("[data-section='examples']"), document.activeElement?.textContent?.trim()];
document.querySelector("[data-examples]").click();
await until(() => document.querySelector("[data-section='examples'] .home-tile")); await wait(400);
document.querySelector("[data-tile='example:aspirin']").click();
await until(() => g()?.name() === NAMES.aspirin, 8000);
R.opened = g()?.name();`);
  await test("editor: the Examples page beside Experiments, with Home's keys and menu (J5, S28)", () => {
    noErrors(gallery);
    assert.equal(gallery.button, "Examples");
    assert.equal(gallery.tiles, list.length);
    assert.deepEqual(gallery.focus, ["Oseltamivir, Structure", "Suzuki coupling, Reaction", "Ibuprofen routes, Synthesis"]);
    assert.deepEqual([gallery.chosen, gallery.after], [0, list.length]);
    assert.deepEqual(gallery.menu, ["Open"]);
    assert.deepEqual(gallery.back, [false, "Examples"]);
    assert.equal(gallery.opened, nameOf.aspirin);
  });

  // Dark mode, and the zoom from its least to its most on every example (S13): tiles on white paper, each example on
  // the paper a new drawing gets, no error.
  const dark = page("/", `
R.dark = matchMedia("(prefers-color-scheme: dark)").matches;
R.thumb = getComputedStyle(document.querySelector('.home-tile[data-tile^="example:"] .home-thumb')).backgroundColor;
R.themes = {};
for (const id of IDS) {
  await show(id);
  const canvas = document.querySelector("svg.canvas"), r = canvas.getBoundingClientRect(), at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
  for (let k = 0; k < 120; k++) { canvas.dispatchEvent(new WheelEvent("wheel", { ...at, deltaY: k < 40 ? 100 : -100, ctrlKey: true, bubbles: true, cancelable: true })); if (k % 10 === 9) await frame(); }
  R.themes[id] = canvas.dataset.theme;
}`, true);
  await test("editor: every example in dark mode, zoomed out and in all the way (S13)", () => {
    noErrors(dark);
    assert.equal(dark.dark, true);
    assert.equal(dark.thumb, "rgb(255, 255, 255)");
    for (const id of ids) assert.equal(dark.themes[id], "light", id);
  });
  rmSync(work, { recursive: true, force: true });
}

console.log(`examples-stress.check: ${ran - failed.length} of ${ran} cases pass.`);
if (failed.length) { console.error(`FAILED:\n${failed.map((f) => `  ${f}`).join("\n")}`); process.exit(1); }
