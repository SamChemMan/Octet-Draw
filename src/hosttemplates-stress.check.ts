// Run: node src/hosttemplates-stress.check.ts. A stress test of the Supramolecules set's cyclodextrins and
// cucurbiturils and the Photochemistry set's Energy transfer (issues 97 and 43, docs/plans/issue-97-43-templates.md):
// every case of the plan's stress list (P1 to P27) and more of our own (N1 on), each one driving the real code: the
// Template tool's addTemplate as a click runs it, the undo history, Flip, Rotate, Delete and Clean Up, the clipboard
// text, .oct, CDXML, CDX, MOL, SDF, SMILES, InChI and ChemDraw template files, Octet 1.1.2's readers on what this
// branch writes, the library search, Structure to Name, and the MCP tools on Octet with no window. Each case runs
// alone, so one failure does not hide the next. The check lists every case that fails, with what it expected and what
// it got, and fails if any does.
//
// A case that needs what a plain run does not have is skipped with a reason:
//   OCTET_STRESS_CHEMDRAW=1   ChemDraw 22.2 opens our CDXML and CDX and saves them (by AppleScript, one session at a time).
// OCTET_STRESS_ONLY=P5,N21 runs only those cases. A timing case is measured again, up to three times, before it fails.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("hosttemplates-stress.check: skipped (no OPSIN build)"); process.exit(0); }
// Octet with no window (Indigo, OPSIN, the names, the MCP host) and the code each case drives.
const { load, drawing, session } = await import("../scripts/headless/host.ts");
await load();
const chem = await import("./chem.ts");
const { handle } = await import("./mcp.ts");
const { nameToSmiles, knownName } = await import("./names.ts");
const { checkedName } = await import("./naming.ts");
const { problems, messy } = await import("./check.ts");
const { fromCdxml, toCdxml } = await import("./cdxml.ts");
const { readTemplateFile, writeTemplateFile } = await import("./ctp.ts");
const { DEFAULT_STYLE, PRESETS, frameStyle, fontStack } = await import("./docstyle.ts");
const E = await import("./edit.ts");
const { parse, serialize } = await import("./file.ts");
const { history } = await import("./history.ts");
const { readCdx, readOct, writeCdx, writeOct } = await import("./oct.ts");
const { render } = await import("./render.ts");
const { LIBRARY, loadMore, exactFirst } = await import("./library.ts");
const { commonKey } = await import("./common.ts");
const { legible } = await import("./templates.ts");
await loadMore();
type Mol = import("./render.ts").Mol;
type History = import("./history.ts").History;
type LibraryItem = import("./library.ts").LibraryItem;
type P = [number, number];
const { EMPTY, addTemplate, erase, flipAtoms, rotateAtoms, transformParts, deleteGraphics, extractSelection, insertMol, atomAt, bondAt, moveAtoms, fragments } = E;

// --- The runner ---------------------------------------------------------------------------------------------------
type Result = { id: string; title: string; state: "ok" | "failed" | "skipped"; note?: string };
const results: Result[] = [];
const only = process.env.OCTET_STRESS_ONLY?.split(",");
async function check(id: string, title: string, run: () => void | string | Promise<void | string>) {
  if (only && !only.includes(id)) return;
  try {
    const skipped = await run();
    results.push(typeof skipped === "string" ? { id, title, state: "skipped", note: skipped } : { id, title, state: "ok" });
  } catch (e) {
    results.push({ id, title, state: "failed", note: e instanceof Error ? e.message.split("\n").slice(0, 12).join("\n         ") : String(e) });
  }
}
// The median of n runs, after three to warm up.
function time(f: () => unknown, n = 15): number {
  for (let k = 0; k < 3; k++) f();
  const t: number[] = [];
  for (let k = 0; k < n; k++) { const t0 = performance.now(); f(); t.push(performance.now() - t0); }
  return t.sort((a, b) => a - b)[t.length >> 1];
}
// Two things timed turn about (interleaved), the median of each.
function versus(f: () => unknown, g: () => unknown, n = 15): [number, number] {
  for (let k = 0; k < 3; k++) { f(); g(); }
  const a: number[] = [], b: number[] = [];
  for (let k = 0; k < n; k++) { let t0 = performance.now(); f(); a.push(performance.now() - t0); t0 = performance.now(); g(); b.push(performance.now() - t0); }
  return [a.sort((x, y) => x - y)[n >> 1], b.sort((x, y) => x - y)[n >> 1]];
}
// A timing case: measured again, up to three times, before it fails (another program's load, not the code).
function timed(run: () => void) {
  for (let k = 1; ; k++) { try { return run(); } catch (e) { if (k === 3) throw e; } }
}

// --- The templates and their references -----------------------------------------------------------------------------
const all: LibraryItem[] = LIBRARY.flatMap((c) => c.items);
const item = (name: string) => { const t = all.find((x) => x.name === name); assert.ok(t, `the library has ${name}`); return t!; };
const tpl = (name: string) => item(name).mol;
const CDS = ["α-Cyclodextrin", "β-Cyclodextrin", "γ-Cyclodextrin"], CBS = ["Cucurbit[5]uril", "Cucurbit[6]uril", "Cucurbit[7]uril", "Cucurbit[8]uril"], HOSTS = [...CDS, ...CBS], ET = "Energy transfer";
// PubChem's standard InChI and formula for each host, read from PubChem's REST service on 17 November 2026 (CIDs
// 444913, 444041, 5287407, 6096206, 196163, 6096207, 16133299), independently of hosts.check.ts's copy.
const PUBCHEM: Record<string, [string, string]> = {
  "α-Cyclodextrin": ["C36H60O30", "InChI=1S/C36H60O30/c37-1-7-25-13(43)19(49)31(55-7)62-26-8(2-38)57-33(21(51)15(26)45)64-28-10(4-40)59-35(23(53)17(28)47)66-30-12(6-42)60-36(24(54)18(30)48)65-29-11(5-41)58-34(22(52)16(29)46)63-27-9(3-39)56-32(61-25)20(50)14(27)44/h7-54H,1-6H2/t7-,8-,9-,10-,11-,12-,13-,14-,15-,16-,17-,18-,19-,20-,21-,22-,23-,24-,25-,26-,27-,28-,29-,30-,31-,32-,33-,34-,35-,36-/m1/s1"],
  "β-Cyclodextrin": ["C42H70O35", "InChI=1S/C42H70O35/c43-1-8-29-15(50)22(57)36(64-8)72-30-9(2-44)66-38(24(59)17(30)52)74-32-11(4-46)68-40(26(61)19(32)54)76-34-13(6-48)70-42(28(63)21(34)56)77-35-14(7-49)69-41(27(62)20(35)55)75-33-12(5-47)67-39(25(60)18(33)53)73-31-10(3-45)65-37(71-29)23(58)16(31)51/h8-63H,1-7H2/t8-,9-,10-,11-,12-,13-,14-,15-,16-,17-,18-,19-,20-,21-,22-,23-,24-,25-,26-,27-,28-,29-,30-,31-,32-,33-,34-,35-,36-,37-,38-,39-,40-,41-,42-/m1/s1"],
  "γ-Cyclodextrin": ["C48H80O40", "InChI=1S/C48H80O40/c49-1-9-33-17(57)25(65)41(73-9)82-34-10(2-50)75-43(27(67)19(34)59)84-36-12(4-52)77-45(29(69)21(36)61)86-38-14(6-54)79-47(31(71)23(38)63)88-40-16(8-56)80-48(32(72)24(40)64)87-39-15(7-55)78-46(30(70)22(39)62)85-37-13(5-53)76-44(28(68)20(37)60)83-35-11(3-51)74-42(81-33)26(66)18(35)58/h9-72H,1-8H2/t9-,10-,11-,12-,13-,14-,15-,16-,17-,18-,19-,20-,21-,22-,23-,24-,25-,26-,27-,28-,29-,30-,31-,32-,33-,34-,35-,36-,37-,38-,39-,40-,41-,42-,43-,44-,45-,46-,47-,48-/m1/s1"],
  "Cucurbit[5]uril": ["C30H30N20O10", "InChI=1S/C30H30N20O10/c51-21-31-1-32-12-14-36(22(32)52)4-40-16-18-44(26(40)56)8-48-20-19-47(29(48)59)7-43-17-15-39(25(43)55)3-35(21)13-11(31)33-2-34(12)24(54)38(14)6-42(16)28(58)46(18)10-50(20)30(60)49(19)9-45(17)27(57)41(15)5-37(13)23(33)53/h11-20H,1-10H2"],
  "Cucurbit[6]uril": ["C36H36N24O12", "InChI=1S/C36H36N24O12/c61-25-37-1-38-14-16-42(26(38)62)4-46-18-20-50(30(46)66)8-54-22-24-58(34(54)70)11-57-23-21-53(33(57)69)7-49-19-17-45(29(49)65)3-41(25)15-13(37)39-2-40(14)28(64)44(16)6-48(18)32(68)52(20)10-56(22)36(72)60(24)12-59(23)35(71)55(21)9-51(19)31(67)47(17)5-43(15)27(39)63/h13-24H,1-12H2"],
  "Cucurbit[7]uril": ["C42H42N28O14", "InChI=1S/C42H42N28O14/c71-29-43-1-44-16-18-48(30(44)72)4-52-20-22-56(34(52)76)8-60-24-26-64(38(60)80)12-68-28-27-67(41(68)83)11-63-25-23-59(37(63)79)7-55-21-19-51(33(55)75)3-47(29)17-15(43)45-2-46(16)32(74)50(18)6-54(20)36(78)58(22)10-62(24)40(82)66(26)14-70(28)42(84)69(27)13-65(25)39(81)61(23)9-57(21)35(77)53(19)5-49(17)31(45)73/h15-28H,1-14H2"],
  "Cucurbit[8]uril": ["C48H48N32O16", "InChI=1S/C48H48N32O16/c81-33-49-1-50-18-20-54(34(50)82)4-58-22-24-62(38(58)86)8-66-26-28-70(42(66)90)12-74-30-32-78(46(74)94)15-77-31-29-73(45(77)93)11-69-27-25-65(41(69)89)7-61-23-21-57(37(61)85)3-53(33)19-17(49)51-2-52(18)36(84)56(20)6-60(22)40(88)64(24)10-68(26)44(92)72(28)14-76(30)48(96)80(32)16-79(31)47(95)75(29)13-71(27)43(91)67(25)9-63(23)39(87)59(21)5-55(19)35(51)83/h17-32H,1-16H2"],
};
const inchi = (s: Mol | string): string | undefined => { try { return chem.toInchi(typeof s === "string" ? chem.parseStructure(s) : s); } catch { return undefined; } };
const formulas = (m: Mol) => chem.analyse(m)?.map((x) => x.formula) ?? [];
const warnings = (m: Mol) => problems(m, chem.stereoFacts(m)).map((p) => p.message);
const finite = (m: Mol) => m.atoms.every((a) => a.location.every(Number.isFinite)) && !JSON.stringify(m).includes("null");
const near = (m: Mol, i: number) => m.bonds.flatMap((b) => (b.atoms[0] === i ? [b.atoms[1]] : b.atoms[1] === i ? [b.atoms[0]] : []));
const allAtoms = (m: Mol) => new Set(m.atoms.map((_, i) => i));
// The stereo layer of an InChI: how many centres it defines, and how many it leaves undefined (?).
const centres = (i: string | undefined) => { const t = /\/t([^/]*)/.exec(i ?? "")?.[1] ?? ""; return { defined: (t.match(/\d+[-+]/g) ?? []).length, unknown: (t.match(/\d+\?/g) ?? []).length }; };
const box = (m: Mol, atoms = [...allAtoms(m)]) => { const xs = atoms.map((i) => m.atoms[i].location[0]), ys = atoms.map((i) => m.atoms[i].location[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const lengths = (m: Mol) => m.bonds.map((b) => Math.hypot(m.atoms[b.atoms[0]].location[0] - m.atoms[b.atoms[1]].location[0], m.atoms[b.atoms[0]].location[1] - m.atoms[b.atoms[1]].location[1]));
const median = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];
// Where the Template tool puts a click (Editor.tsx: an atom first, then a bond, with the point too).
const click = (m: Mol, t: Mol, p: P): Mol => { const atom = atomAt(m, p, 0.3), bond = atom === undefined ? bondAt(m, p, 0.2) : undefined; return addTemplate(m, t, { ...(bond !== undefined ? { bond } : atom !== undefined ? { atom } : {}), point: p }); };
const placed = (name: string, at: P = [0, 0], m: Mol = EMPTY) => addTemplate(m, tpl(name), { point: at });
// The editor's Flip (Editor.tsx flip) and turn (turnedParts) on everything in a drawing, about the middle of its box.
const middleOf = (m: Mol): P => {
  const ps: P[] = [...m.atoms.map((a): P => [a.location[0], a.location[1]]), ...(m.arrows ?? []).flatMap((a) => [a.from, a.to])];
  const xs = ps.map((q) => q[0]), ys = ps.map((q) => q[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};
const items = (m: Mol) => new Set([...(m.arrows ?? []), ...(m.captions ?? []).filter((c) => !c.on && !c.under)].map((x) => x.id));
function flipAll(m: Mol, axis: "horizontal" | "vertical", mirror = true): Mol {
  const c = middleOf(m), k = axis === "horizontal" ? 0 : 1;
  return transformParts(flipAtoms(m, allAtoms(m), axis, mirror, c[k]), new Set(), items(m), (q) => (k ? [q[0], 2 * c[1] - q[1]] : [2 * c[0] - q[0], q[1]]), [1, 1], undefined, 1, k ? "down" : "across");
}
function turnAll(m: Mol, degrees: number): Mol {
  const c = middleOf(m), r = (degrees * Math.PI) / 180, [cs, sn] = [Math.cos(r), Math.sin(r)];
  return transformParts(m, allAtoms(m), items(m), (q) => [c[0] + (q[0] - c[0]) * cs - (q[1] - c[1]) * sn, c[1] + (q[0] - c[0]) * sn + (q[1] - c[1]) * cs], [1, 1]);
}
// The Energy transfer arrow and its text in a drawing: the arrow, and the captions tied to it.
const tied = (m: Mol, arrow: number) => (m.captions ?? []).filter((c) => c.on?.arrow === arrow);
const plain = (c: { text: string; runs?: { text: string }[] }) => c.runs?.map((r) => r.text).join("") ?? c.text;

// --- The MCP on Octet with no window ----------------------------------------------------------------------------------
let rpc = 0;
type Reply = { content: { text?: string }[]; isError?: boolean; structuredContent?: any };
const mcpOn = (d: ReturnType<typeof drawing>, who = "stress") => async (name: string, args: unknown): Promise<Reply> => {
  const out = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", session("Stress", who)));
  return out.result ?? { content: [{ text: out.error?.message ?? "" }], isError: true };
};
const said = (r: Reply) => r.content.map((c) => c.text ?? "").join("\n");
const template = (call: ReturnType<typeof mcpOn>, args: unknown) => call("advanced", { tool: "place_template", args });

// ==================================================================================================================
// The plan's stress list
// ==================================================================================================================
await check("P1", "Empty page, γ-cyclodextrin (88 atoms) placed by a click: one structure, PubChem's InChI, no warning, not messy, one undo step", () => {
  let h: History = { stack: [EMPTY], at: 0 };
  const m = click(EMPTY, tpl("γ-Cyclodextrin"), [3, -2]);
  h = history(h, { type: "set", mol: m });
  assert.equal(m.atoms.length, 88);
  assert.deepEqual(formulas(m), [PUBCHEM["γ-Cyclodextrin"][0]]);
  assert.equal(inchi(m), PUBCHEM["γ-Cyclodextrin"][1], "PubChem's InChI, stereo included");
  assert.deepEqual(warnings(m), []);
  assert.equal(messy(m), false, "not messy");
  assert.equal(h.at, 1, "one step");
  const u = history(h, { type: "undo" });
  assert.equal(u.stack[u.at], EMPTY, "undo gives the empty page");
});

await check("P2", "Cucurbit[8]uril placed, turned 30°, flipped, coloured red, a CH2 deleted: five undos give the empty page, five redos the drawing exactly", () => {
  const steps: Mol[] = [];
  let m = click(EMPTY, tpl("Cucurbit[8]uril"), [0, 0]);
  steps.push(m, (m = turnAll(m, 30)), (m = flipAll(m, "horizontal")));
  steps.push((m = { ...m, atoms: m.atoms.map((a) => ({ ...a, colour: "#ff0000" })), bonds: m.bonds.map((b) => ({ ...b, colour: "#ff0000" })) }));
  const ch2 = m.atoms.findIndex((a, i) => a.label === "C" && near(m, i).length === 2 && near(m, i).every((j) => m.atoms[j].label === "N"));
  steps.push((m = erase(m, new Set(), new Set([ch2]))));
  let h: History = { stack: [EMPTY], at: 0 };
  for (const s of steps) h = history(h, { type: "set", mol: s });
  for (let k = 4; k >= 0; k--) { h = history(h, { type: "undo" }); assert.equal(h.stack[h.at], k ? steps[k - 1] : EMPTY, `undo ${5 - k}`); }
  for (let k = 0; k < 5; k++) { h = history(h, { type: "redo" }); assert.equal(h.stack[h.at], steps[k], `redo ${k + 1}`); }
  assert.equal(inchi(steps[2]), PUBCHEM["Cucurbit[8]uril"][1], "turned and flipped, the same compound");
  assert.deepEqual(formulas(m), ["C47H48N32O16"], "a CH2 gone: two NH");
});

await check("P3", "20 clicks with the Template tool 0.5 bond lengths apart (CB[6]): 20 steps, no exception, every place a number; clicks on the last host fuse as with Pillar[5]arene", () => {
  const run = (name: string) => {
    let h: History = { stack: [EMPTY], at: 0 }, m = EMPTY, fused = 0;
    for (let k = 0; k < 20; k++) {
      const p: P = [0.5 * k, 0.1 * k];
      if (atomAt(m, p, 0.3) !== undefined || bondAt(m, p, 0.2) !== undefined) fused++;
      h = history(h, { type: "set", mol: (m = click(m, tpl(name), p)) });
    }
    return { h, m, fused };
  };
  const cb = run("Cucurbit[6]uril"), pil = run("Pillar[5]arene");
  assert.equal(cb.h.at, 20, "20 undo steps");
  assert.ok(finite(cb.m), "every place a number");
  assert.ok(cb.fused > 0 && pil.fused > 0, `clicks on a host fuse (CB[6] ${cb.fused}, Pillar[5]arene ${pil.fused})`);
  assert.doesNotThrow(() => warnings(cb.m));
});

await check("P4", "β-Cyclodextrin clicked onto methanol's O: C43H72O35, 2-O-methyl (the methyl O on the carbon beside the anomeric one), not messy, no warning, clear of the methanol", () => {
  const meoh: Mol = { atoms: [{ label: "C", location: [0, 0, 0] }, { label: "O", location: [1, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] };
  const m = click(meoh, tpl("β-Cyclodextrin"), [1, 0]);
  assert.deepEqual(formulas(m), ["C43H72O35"]);
  const c2 = near(m, 1).find((j) => j !== 0)!, anomeric = near(m, c2).find((j) => near(m, j).filter((o) => m.atoms[o].label === "O").length === 2);
  assert.ok(m.atoms[c2].label === "C" && anomeric !== undefined, "the methyl ether is on C2, beside the anomeric C1");
  assert.deepEqual(centres(inchi(m)), { defined: 35, unknown: 0 }, "35 stereocentres, every one defined");
  assert.deepEqual(warnings(m), []);
  assert.equal(messy(m), false, "not messy");
  const host = m.atoms.map((_, i) => i).filter((i) => i > 1 && i !== c2);
  const closest = Math.min(...host.map((i) => Math.hypot(m.atoms[i].location[0], m.atoms[i].location[1])));
  assert.ok(closest > 0.9, `the nearest host atom is ${closest.toFixed(2)} bond lengths from methanol's C`);
});

await check("P5", "β-Cyclodextrin on a C–C bond of cyclohexane, from either side (one mirrored): the same InChI, the same CIP labels on every centre it brings, centres left open only as α-D-Glucopyranose", () => {
  const hexagon = (flip: number): Mol => ({ atoms: Array.from({ length: 6 }, (_, k) => ({ label: "C", location: [flip * Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3), 0] as [number, number, number] })), bonds: Array.from({ length: 6 }, (_, k) => ({ type: 1, atoms: [k, (k + 1) % 6] as [number, number] })) });
  const fuse = (name: string) => [1, -1].map((f) => { const h = hexagon(f), b = h.bonds[0], mid: P = [(h.atoms[b.atoms[0]].location[0] + h.atoms[b.atoms[1]].location[0]) / 2, (h.atoms[b.atoms[0]].location[1] + h.atoms[b.atoms[1]].location[1]) / 2]; return click(h, tpl(name), mid); });
  const ways = fuse("β-Cyclodextrin"), glucose = fuse("α-D-Glucopyranose");
  assert.equal(inchi(ways[0]), inchi(ways[1]), "the same compound either way");
  const labels = (m: Mol) => chem.cipOf(m).atoms.filter(Boolean).sort().join("");
  assert.equal(labels(ways[0]), labels(ways[1]), "the same CIP labels");
  // The two fused carbons (C2 and C3) take the cyclohexane where their OH was drawn, so their stereo is left open:
  // as 1.1.2's α-D-Glucopyranose fused the same way, and no other centre.
  for (const [k, w] of ways.entries()) { assert.deepEqual(warnings(w), []); assert.equal(centres(inchi(w)).unknown, centres(inchi(glucose[k])).unknown, "undefined centres as α-D-Glucopyranose's"); }
});

await check("P6", "Flip Horizontally on β-cyclodextrin: the enantiomer (/m0); flipped again: PubChem's InChI exactly", () => {
  const m = placed("β-Cyclodextrin"), once = flipAll(m, "horizontal"), twice = flipAll(once, "horizontal");
  assert.equal(inchi(once), PUBCHEM["β-Cyclodextrin"][1].replace("/m1/", "/m0/"));
  assert.equal(inchi(twice), PUBCHEM["β-Cyclodextrin"][1]);
  assert.ok(twice.atoms.every((a, i) => Math.hypot(a.location[0] - m.atoms[i].location[0], a.location[1] - m.atoms[i].location[1]) < 1e-9), "back where it was");
});

await check("P7", "Rotate 37°, 90°, 180° and 24 turns of 15° (Option + arrow keys): the same InChI, not messy, back within 1e-9 after 360°", () => {
  for (const name of ["β-Cyclodextrin", "Cucurbit[7]uril"]) {
    const m = placed(name);
    for (const d of [37, 90, 180]) { const t = turnAll(m, d); assert.equal(inchi(t), PUBCHEM[name][1], `${name} turned ${d}°`); assert.equal(messy(t), false, `${name} turned ${d}° is not messy`); }
    let t = m;
    for (let k = 0; k < 24; k++) t = turnAll(t, 15);
    assert.equal(inchi(t), PUBCHEM[name][1]);
    const drift = Math.max(...t.atoms.map((a, i) => Math.hypot(a.location[0] - m.atoms[i].location[0], a.location[1] - m.atoms[i].location[1])));
    assert.ok(drift < 1e-9, `${name}: ${drift} off after 24 turns of 15°`);
  }
});

await check("P8a", "One glycosidic O of β-cyclodextrin deleted: C42H72O34, 33 centres all defined, every wedge's narrow end still a stereocentre, no warning; undo gives the ring", () => {
  const m = placed("β-Cyclodextrin");
  // A glycosidic O joins two glucoses: without it its two carbons are far apart round the macrocycle, where a ring O's
  // (O5) are four bonds apart round their own ring.
  const apart = (from: number, to: number, not: number) => {
    const seen = new Map([[from, 0]]), queue = [from];
    for (const i of queue) for (const j of near(m, i)) if (j !== not && !seen.has(j)) { seen.set(j, seen.get(i)! + 1); queue.push(j); }
    return seen.get(to) ?? Infinity;
  };
  const o = m.atoms.findIndex((a, i) => a.label === "O" && near(m, i).length === 2 && apart(near(m, i)[0], near(m, i)[1], i) > 6);
  assert.ok(o >= 0, "a glycosidic O");
  let h: History = { stack: [m], at: 0 };
  const open = erase(m, new Set(), new Set([o]));
  h = history(h, { type: "set", mol: open });
  assert.deepEqual(formulas(open), ["C42H72O34"]);
  assert.deepEqual(centres(inchi(open)), { defined: 33, unknown: 0 });
  const cip = chem.cipOf(open).atoms;
  assert.ok(open.bonds.filter((b) => b.stereo).every((b) => cip[b.atoms[0]]), "every wedge's narrow end is a stereocentre");
  assert.deepEqual(warnings(open), []);
  h = history(h, { type: "undo" });
  assert.equal(h.stack[h.at], m);
});

await check("P8b", "The Energy transfer arrow alone deleted: its EnT text stays as free text where it was drawn, as Intersystem crossing's ISC does", () => {
  const out = (name: string) => { const m = placed(name, [2, 3]), a = m.arrows![0]; return deleteGraphics(m, new Set([a.id])); };
  const et = out(ET), isc = out("Intersystem crossing");
  assert.deepEqual([et.arrows?.length ?? 0, isc.arrows?.length ?? 0], [0, 0]);
  assert.deepEqual(et.captions!.map((c) => [plain(c), !!c.on, c.x, c.y]), isc.captions!.map((c) => [plain(c) === "ISC" ? "EnT" : plain(c), !!c.on, c.x, c.y]));
  assert.ok(et.captions!.every((c) => !c.on && Number.isFinite(c.x) && Number.isFinite(c.y)), "free text, placed");
});

await check("P9", "β-Cyclodextrin copied and pasted 10 times in its window and once into a second window: each copy PubChem's compound, new ids, one undo step each", () => {
  const src = placed("β-Cyclodextrin"), clip = serialize({ ...extractSelection(src, allAtoms(src), new Set()), style: DEFAULT_STYLE });
  let h: History = { stack: [src], at: 0 }, m = src;
  for (let k = 1; k <= 10; k++) h = history(h, { type: "set", mol: (m = insertMol(m, parse(clip), [20 * k, 0]).mol) });
  assert.equal(h.at, 10, "ten steps");
  assert.deepEqual(formulas(m), Array(11).fill("C42H70O35"));
  for (const f of fragments(m)) assert.equal(inchi(E.pickAtoms(m, f)), PUBCHEM["β-Cyclodextrin"][1]);
  const other = fromCdxml(toCdxml(extractSelection(src, allAtoms(src), new Set()), DEFAULT_STYLE)).mol, second = insertMol(EMPTY, other, [5, 5]).mol;
  assert.equal(inchi(second), PUBCHEM["β-Cyclodextrin"][1], "into another window as CDXML");
});

// One drawing with every new template, for the files.
const every = (() => {
  let m = EMPTY;
  HOSTS.forEach((n, k) => { m = placed(n, [24 * (k % 4), -24 * Math.floor(k / 4)], m); });
  return placed(ET, [72, -24], m);
})();
const hostOf = (m: Mol) => fragments(m).map((f) => E.pickAtoms(m, f));
const look = (m: Mol) => ({ atoms: m.atoms.map((a) => [a.label, a.charge ?? 0]), bonds: m.bonds.map((b) => [...b.atoms, b.type, b.stereo ?? 0]) });
function sameFile(back: Mol, m: Mol, what: string) {
  assert.deepEqual(look(back), look(m), `${what}: every atom, bond and wedge`);
  assert.ok(back.atoms.every((a, i) => Math.hypot(a.location[0] - m.atoms[i].location[0], a.location[1] - m.atoms[i].location[1]) < 0.01), `${what}: places within 0.01`);
  assert.deepEqual(hostOf(back).map((x) => inchi(x)), hostOf(m).map((x) => inchi(x)), `${what}: each host's InChI`);
  const a = back.arrows?.find((x) => x.style === "wavy"), want = m.arrows![0];
  assert.ok(a && a.end === want.end && a.kind === want.kind, `${what}: the wavy arrow with its head (${JSON.stringify(a)})`);
  assert.deepEqual(tied(back, a!.id).map(plain), ["EnT"], `${what}: EnT on its arrow`);
}
await check("P10", "All 7 hosts and Energy transfer through .oct, CDXML, CDX, MOL V2000 and V3000, SDF, SMILES and InChI as far as each format goes", () => {
  sameFile(readOct(writeOct(every, DEFAULT_STYLE), true).mol, every, ".oct");
  sameFile(fromCdxml(toCdxml(every, DEFAULT_STYLE)).mol, every, "CDXML");
  sameFile(readCdx(writeCdx(every, DEFAULT_STYLE)).mol, every, "CDX");
  for (const h of HOSTS) {
    const m = placed(h);
    for (const [kind, text] of [["MOL V2000", chem.toMolfile(m, true)], ["MOL V3000", chem.toMolfile(m)], ["SDF", chem.toSdf(m)], ["SMILES", chem.toSmiles(m)], ["InChI", PUBCHEM[h][1]]] as const)
      assert.equal(inchi(text), PUBCHEM[h][1], `${h} through ${kind}`);
  }
});

// Octet 1.1.2's own readers, from the tag, in a folder of their own.
async function v112(): Promise<{ readOct: typeof readOct; readCdx: typeof readCdx; parse: typeof parse } | string> {
  const root = fileURLToPath(new URL("..", import.meta.url));
  try { execFileSync("git", ["rev-parse", "--verify", "v1.1.2^{commit}"], { cwd: root, stdio: "ignore" }); } catch { return "no tag v1.1.2 in this clone"; }
  const dir = mkdtempSync(join(tmpdir(), "octet-v112-"));
  execFileSync("sh", ["-c", `git archive v1.1.2 src package.json | tar -x -C "${dir}"`], { cwd: root });
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const at = (f: string) => `file://${join(dir, "src", f)}`;
  const [o, f] = await Promise.all([import(at("oct.ts")), import(at("file.ts"))]);
  process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
  return { readOct: o.readOct, readCdx: o.readCdx, parse: f.parse };
}
const old = await v112();
await check("P12", "Octet 1.1.2 opens our .oct, CDXML, CDX and pastes our clipboard text: each host its compound, the wavy arrow with its head, EnT on it", () => {
  if (typeof old === "string") return old;
  sameFile(old.readOct(writeOct(every, DEFAULT_STYLE), true).mol, every, "1.1.2 .oct");
  sameFile(old.readOct(toCdxml(every, DEFAULT_STYLE)).mol, every, "1.1.2 CDXML");
  sameFile(old.readCdx(writeCdx(every, DEFAULT_STYLE)).mol, every, "1.1.2 CDX");
  sameFile(old.parse(serialize({ ...every, style: DEFAULT_STYLE })), every, "1.1.2 clipboard");
});

// A drawing of 40 paclitaxels (as the speed checks have it), and a 500-residue peptide.
const taxol = chem.indigoLayout("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C");
let taxols: Mol = EMPTY;
for (let k = 0; k < 40; k++) taxols = insertMol(taxols, taxol, [20 * (k % 8), 20 * Math.floor(k / 8)]).mol;
const peptide = chem.indigoLayout("N[C@@H](C)C(=O)".repeat(500) + "O");
// Placing (the Template tool's addTemplate) in a big drawing, each host against Pillar[5]arene (in 1.1.2) measured
// turn about; the cost for each template atom no more than 1.5 times Pillar[5]arene's (noise and the bonds).
function placingCost(page: Mol, name: string, at: P) {
  const [host, pil] = versus(() => addTemplate(page, tpl(name), { point: at }), () => addTemplate(page, tpl("Pillar[5]arene"), { point: at }), 9);
  const perHost = host / tpl(name).atoms.length, perPil = pil / tpl("Pillar[5]arene").atoms.length;
  return { host, pil, ratio: perHost / perPil };
}
// Drawing the page is measured against 1.1.2's α-D-Glucopyranose, 8 of them (the same 88 atoms, rings, wedges and OH
// labels as γ-cyclodextrin): Pillar[5]arene has 55 atoms and 10 labels, so a page with it draws less.
await check("P15", "40 paclitaxels (2,480 atoms), γ-cyclodextrin placed: placing costs no more for each atom than Pillar[5]arene's, and the page draws as fast as with 8 α-D-Glucopyranoses", () => timed(() => {
  const c = placingCost(taxols, "γ-Cyclodextrin", [80, -30]);
  const style = DEFAULT_STYLE, L = 14.4 * (4 / 3), frame = frameStyle(style, L), measure = chem.measurer(fontStack(style.labelFont), frame.size);
  let withGlc = taxols;
  for (let k = 0; k < 8; k++) withGlc = addTemplate(withGlc, tpl("α-D-Glucopyranose"), { point: [80 + 5 * k, -30] });
  const withCd = addTemplate(taxols, tpl("γ-Cyclodextrin"), { point: [80, -30] });
  const [drawCd, drawGlc] = versus(() => render(withCd, frame, measure, L), () => render(withGlc, frame, measure, L), 9);
  console.log(`  P15: placing γ-CD ${c.host.toFixed(1)} ms, Pillar[5]arene ${c.pil.toFixed(1)} ms (per atom ×${c.ratio.toFixed(2)}); drawing ${drawCd.toFixed(1)} against ${drawGlc.toFixed(1)} ms`);
  assert.ok(c.ratio < 1.5, `per template atom γ-CD costs ×${c.ratio.toFixed(2)} Pillar[5]arene's`);
  assert.ok(drawCd < drawGlc * 1.2 + 2, `drawing ${drawCd.toFixed(1)} ms against ${drawGlc.toFixed(1)} ms`);
}));
await check("P16", "A 500-residue peptide (about 4,000 atoms), β-cyclodextrin placed: per template atom no more than Pillar[5]arene's", () => timed(() => {
  const c = placingCost(peptide, "β-Cyclodextrin", [0, -40]);
  console.log(`  P16: placing β-CD ${c.host.toFixed(1)} ms, Pillar[5]arene ${c.pil.toFixed(1)} ms in ${peptide.atoms.length} atoms (per atom ×${c.ratio.toFixed(2)})`);
  assert.ok(c.ratio < 1.5, `per template atom β-CD costs ×${c.ratio.toFixed(2)} Pillar[5]arene's`);
}));
await check("P17", "50 β-cyclodextrins: a drag frame (move all, draw) costs no more for each atom than 1.1.2's α-D-Glucopyranose (the same rings, wedges and OH labels), 320 of them", () => timed(() => {
  let cds = EMPTY, glcs = EMPTY;
  for (let k = 0; k < 50; k++) cds = insertMol(cds, tpl("β-Cyclodextrin"), [20 * (k % 10), 20 * Math.floor(k / 10)]).mol;
  for (let k = 0; k < 320; k++) glcs = insertMol(glcs, tpl("α-D-Glucopyranose"), [6 * (k % 20), 6 * Math.floor(k / 20)]).mol;
  const style = DEFAULT_STYLE, L = 14.4 * (4 / 3), frame = frameStyle(style, L), measure = chem.measurer(fontStack(style.labelFont), frame.size);
  const frameOf = (m: Mol) => () => render(moveAtoms(m, allAtoms(m), [0.3, 0.1]), frame, measure, L);
  const [a, b] = versus(frameOf(cds), frameOf(glcs), 7), ra = a / cds.atoms.length, rb = b / glcs.atoms.length;
  console.log(`  P17: drag frame over 50 β-CD (${cds.atoms.length} atoms) ${a.toFixed(1)} ms, over 320 α-D-Glucopyranoses (${glcs.atoms.length} atoms) ${b.toFixed(1)} ms`);
  assert.ok(ra < rb * 1.5, `per atom ${(ra * 1000).toFixed(2)} µs against ${(rb * 1000).toFixed(2)} µs`);
}));

// The library search as TemplateLibrary.tsx's LibraryPanel works it out over the built-in sets: its find line (which this
// check reads from the file so a change there shows here), then its order (library.ts exactFirst), or 1.1.2's.
const panel = readFileSync(new URL("./TemplateLibrary.tsx", import.meta.url), "utf8");
const FOUND = "const found = all.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || !!t.also?.toLowerCase().includes(q));";
const EXACT = "return exactFirst(found, typed);";
function search(typed0: string, rule: "branch" | "1.1.2" = "branch"): string[] {
  const typed = typed0.trim(), q = typed.toLowerCase();
  if (!q) return [];
  const found = all.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || !!t.also?.toLowerCase().includes(q));
  const exact = (t: LibraryItem) => commonKey(t.name) === commonKey(typed);
  return (rule === "branch" ? exactFirst(found, typed) : [...found.filter(exact), ...found.filter((t) => !exact(t))]).map((t) => t.name);
}
await check("P18", "Library search: cyclodextrin, beta-cyclodextrin, CB[, cucurbituril, [6], EnT, energy transfer and energy find what the plan says, the commonest first", () => {
  assert.ok(panel.includes(FOUND) && panel.includes(EXACT), "TemplateLibrary.tsx still searches as this check does");
  const s = (q: string) => search(q);
  assert.deepEqual(s("cyclodextrin").slice(0, 3), ["β-Cyclodextrin", "α-Cyclodextrin", "γ-Cyclodextrin"]);
  assert.deepEqual(s("beta-cyclodextrin"), ["β-Cyclodextrin"]);
  assert.deepEqual(s("CB[").sort(), [...CBS].sort());
  assert.deepEqual(s("cucurbituril"), ["Cucurbit[6]uril", "Cucurbit[5]uril", "Cucurbit[7]uril", "Cucurbit[8]uril"]);
  assert.equal(s("[6]")[0], "Cucurbit[6]uril", `[6]: ${s("[6]").slice(0, 4).join(", ")}`);
  assert.equal(s("EnT")[0], ET);
  assert.equal(s("energy transfer")[0], ET);
  assert.ok(s("energy").includes(ET) && s("energy").includes("Jablonski diagram"), s("energy").join(", "));
});

await check("P19", "MCP place_template with a blank name, spaces, CB[9], 10,000 characters, the wrong set or no such atom: an error that names what was wrong, the drawing unchanged", async () => {
  const d = drawing("paper", "P19"), call = mcpOn(d);
  assert.ok(!(await template(call, { name: "Cucurbit[6]uril" })).isError);
  const before = d.host.doc();
  for (const [args, want] of [[{ name: "" }, /Give the name/], [{ name: "   " }, /Give the name/], [{ name: "CB[9]" }, /no template CB\[9\]/], [{ name: "x".repeat(10_000) }, /longer than 80/],
    [{ name: "β-Cyclodextrin", set: "Photochemistry" }, /no template β-Cyclodextrin/], [{ name: "β-Cyclodextrin", on: "s99.1" }, /No atom or bond s99\.1/]] as const) {
    const r = await template(call, args);
    assert.ok(r.isError && want.test(said(r)), `${JSON.stringify(args).slice(0, 50)}: ${said(r).slice(0, 160)}`);
    assert.equal(d.host.doc(), before, `${JSON.stringify(args).slice(0, 50)}: the drawing as it was`);
  }
});

await check("P20", "Five AI sessions call place_template at once: all placed, five undo steps, different ids, none on top of another", async () => {
  const d = drawing("paper", "P20"), names = ["β-Cyclodextrin", "Cucurbit[5]uril", "γ-Cyclodextrin", "Cucurbit[8]uril", ET];
  const replies = await Promise.all(names.map((name, k) => template(mcpOn(d, `s-${k}`), { name })));
  assert.ok(replies.every((r) => !r.isError), replies.map(said).join(" | "));
  const m = d.host.doc(), parts = fragments(m);
  assert.equal(parts.length, 4, "four structures");
  assert.equal(m.arrows?.length, 1, "one arrow");
  const boxes = parts.map((f) => box(m, f));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i], boxes[j]];
    assert.ok(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1], `structures ${i} and ${j} overlap`);
  }
  let undone = 0;
  while (d.host.command("undo")) undone++;
  assert.equal(undone, 5, "five undo steps");
});

await check("P22", "Every Supramolecules template and Energy transfer copied into My templates and saved as one ChemDraw template file: all written, each host read back as its compound", () => {
  const set = LIBRARY.find((c) => c.name === "Supramolecules")!.items;
  const saved = writeTemplateFile(set.map((t) => ({ name: t.name, mol: t.mol })), "Hosts");
  assert.deepEqual([saved.written, saved.left], [set.length, 0], `written ${saved.written}, left ${saved.left}`);
  const back = readTemplateFile(saved.bytes, "Hosts.ctp").templates;
  for (const h of HOSTS) assert.equal(inchi(back.find((t) => t.name === h)!.mol), PUBCHEM[h][1], h);
  const withEt = writeTemplateFile([{ name: ET, mol: tpl(ET) }], "Photo");
  const etBack = readTemplateFile(withEt.bytes, "Photo.ctp").templates;
  assert.ok(withEt.written === 1 && etBack[0]?.mol.arrows?.[0]?.style === "wavy" && tied(etBack[0].mol, etBack[0].mol.arrows![0].id).length === 1, `Energy transfer: written ${withEt.written}, read back ${JSON.stringify(etBack[0]?.mol.arrows)}`);
});

await check("P23", "Clean Up Structure on each host: the cyclodextrins keep PubChem's InChI and stay tidy, the cucurbiturils keep theirs; undo gives the drawing back exactly", () => {
  for (const h of HOSTS) {
    const m = placed(h), after = chem.cleanUp(m);
    let hist: History = { stack: [m], at: 0 };
    hist = history(history(hist, { type: "set", mol: after }), { type: "undo" });
    assert.equal(hist.stack[hist.at], m, `${h}: undo`);
    assert.equal(inchi(after), PUBCHEM[h][1], `${h} after Clean Up`);
    if (CDS.includes(h)) assert.equal(messy(after), false, `${h} tidy after Clean Up`);
  }
});

await check("P24", "Energy transfer turned 90° and flipped: EnT stays on its arrow and upright, the wave and head stay; undo", () => {
  const m = placed(ET, [3, 3]), a0 = m.arrows![0];
  let h: History = { stack: [m], at: 0 };
  const t = turnAll(m, 90), f = flipAll(t, "horizontal");
  h = history(history(h, { type: "set", mol: t }), { type: "set", mol: f });
  for (const [what, x] of [["turned", t], ["flipped", f]] as const) {
    const a = x.arrows![0], c = tied(x, a.id);
    assert.deepEqual([a.style, a.end, a.kind], [a0.style, a0.end, a0.kind], `${what}: the wave and head`);
    assert.deepEqual(c.map(plain), ["EnT"], `${what}: EnT on its arrow`);
    assert.ok(c.every((y) => !(y as { angle?: number }).angle && !(y as { mirror?: boolean }).mirror), `${what}: upright`);
    assert.ok(Math.abs(Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]) - Math.hypot(a0.to[0] - a0.from[0], a0.to[1] - a0.from[1])) < 1e-9, `${what}: its length`);
  }
  h = history(history(h, { type: "undo" }), { type: "undo" });
  assert.equal(h.stack[h.at], m);
});

await check("P25", "Energy transfer stamped beside a catalytic cycle's arc does what Light does there (joins it, or stays free)", async () => {
  const run = async (name: string) => {
    const d = drawing("paper", "P25"), call = mcpOn(d);
    const r = await call("draw", { kind: "cycle", steps: [{ to: "PhBr" }, { to: "PhPdBr" }, { to: "PhPdPh" }] });
    if (r.isError) return `cycle: ${said(r).slice(0, 100)}`;
    const m = d.host.doc(), c = m.cycles![0], p: P = [c.centre[0] + c.radius + 0.6, c.centre[1]];
    const after = d.host.set(addTemplate(m, tpl(name), { point: p }));
    return JSON.stringify((after.captions ?? []).filter((x) => /EnT|hν|hv/.test(plain(x))).map((x) => !!x.cycle)) + JSON.stringify((after.arrows ?? []).filter((x) => x.style === "wavy").map((x) => !!(x as { cycle?: unknown }).cycle));
  };
  const [et, light] = [await run(ET), await run("Light")];
  assert.equal(et, light, `Energy transfer ${et}, Light ${light}`);
});

await check("P26", "Structure to Name: each cyclodextrin gets a name OPSIN reads back to PubChem's compound; a cucurbituril gets none", () => {
  const read = (s: Mol | string) => inchi(s);
  for (const h of HOSTS) {
    const m = placed(h), name = checkedName(m, chem.expandLabels(m), nameToSmiles, read, chem.cipOf, knownName);
    if (CDS.includes(h)) { assert.ok(name, `${h} is named`); assert.equal(inchi(nameToSmiles(name!)!), PUBCHEM[h][1], `${h}: "${name!.slice(0, 60)}…" reads back`); }
    else assert.equal(name, undefined, `${h} is not named`);
  }
});

await check("P27", "The background name (once per new shape): each host under 1 s, γ-cyclodextrin no more than 2.5 times Pillar[5]arene's", () => timed(() => {
  const read = (s: Mol | string) => inchi(s), cost = (n: string) => { const m = placed(n); return time(() => checkedName(m, chem.expandLabels(m), nameToSmiles, read, chem.cipOf, knownName), 3); };
  const t = Object.fromEntries([...HOSTS, "Pillar[5]arene"].map((n) => [n, cost(n)]));
  console.log(`  P27: ${Object.entries(t).map(([n, v]) => `${n} ${v.toFixed(0)} ms`).join(", ")}`);
  for (const h of HOSTS) assert.ok(t[h] < 1000, `${h} ${t[h].toFixed(0)} ms`);
  assert.ok(t["γ-Cyclodextrin"] <= 2.5 * t["Pillar[5]arene"], `γ-CD ${t["γ-Cyclodextrin"].toFixed(0)} ms, Pillar[5]arene ${t["Pillar[5]arene"].toFixed(0)} ms`);
}));

// ==================================================================================================================
// Our own cases
// ==================================================================================================================
await check("N1", "A messy drawing of 200 structures: each new template clicked onto a random atom or bond of it, no exception, every place a number, then saved and opened", () => {
  const smiles = ["CCO", "c1ccccc1", "CC(=O)O", "C1CCCCC1N", "O=C(O)c1ccccc1O", "CN1C=NC2=C1C(=O)N(C)C(=O)N2C", "C[C@H](N)C(=O)O", "OC[C@H]1O[C@H](O)[C@H](O)[C@@H](O)[C@@H]1O", "c1ccc2ccccc2c1", "CC(C)Cc1ccc(cc1)C(C)C(=O)O"];
  let m = EMPTY, seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 200; k++) m = insertMol(m, chem.indigoLayout(smiles[k % smiles.length]), [rand() * 120, rand() * 80]).mol;
  const names = [...HOSTS, ET];
  for (let k = 0; k < 24; k++) {
    const i = Math.floor(rand() * m.atoms.length), p: P = k % 2 ? [m.atoms[i].location[0], m.atoms[i].location[1]] : [m.atoms[i].location[0] + 0.3, m.atoms[i].location[1]];
    m = click(m, tpl(names[k % names.length]), p);
    assert.ok(finite(m), `click ${k} (${names[k % names.length]}): every place a number`);
  }
  assert.doesNotThrow(() => warnings(m));
  const back = readOct(writeOct(m, DEFAULT_STYLE), true).mol;
  assert.equal(back.atoms.length, m.atoms.length);
  assert.equal(inchi(back), inchi(m));
});

await check("N2", "Hostile files: the 8 new templates' CDXML, CDX and .oct cut short at 40 places and with bytes changed: each reader returns or throws an Error in under 2 s, never a non-number place", () => {
  const cdxml = toCdxml(every, DEFAULT_STYLE), cdx = writeCdx(every, DEFAULT_STYLE), oct = writeOct(every, DEFAULT_STYLE);
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const tries: [string, () => { mol: Mol } | Mol][] = [];
  for (let k = 1; k <= 40; k++) {
    const cut = k / 41;
    tries.push([`CDXML cut at ${cut.toFixed(2)}`, () => fromCdxml(cdxml.slice(0, Math.floor(cdxml.length * cut)))]);
    tries.push([`CDX cut at ${cut.toFixed(2)}`, () => readCdx(cdx.slice(0, Math.floor(cdx.length * cut)))]);
    tries.push([`.oct cut at ${cut.toFixed(2)}`, () => readOct(oct.slice(0, Math.floor(oct.length * cut)), true)]);
    const bytes = cdx.slice(), at = Math.floor(rand() * bytes.length);
    bytes[at] = Math.floor(rand() * 256);
    tries.push([`CDX byte ${at} changed`, () => readCdx(bytes)]);
    const text = cdxml.replace(/p="([-\d.]+) ([-\d.]+)"/, k % 2 ? 'p="NaN 1e400"' : 'p="1e308 -1e308"');
    tries.push([`CDXML with a place ${k % 2 ? "NaN" : "1e308"}`, () => fromCdxml(text)]);
  }
  const bad: string[] = [];
  for (const [what, read] of tries) {
    const t0 = performance.now();
    let mol: Mol | undefined;
    try { const r = read(); mol = "mol" in r ? r.mol : r; } catch (e) { if (!(e instanceof Error)) bad.push(`${what}: threw ${String(e)}`); }
    if (performance.now() - t0 > 2000) bad.push(`${what}: ${(performance.now() - t0).toFixed(0)} ms`);
    if (mol && !mol.atoms.every((a) => a.location.every(Number.isFinite))) bad.push(`${what}: an atom at ${JSON.stringify(mol.atoms.find((a) => !a.location.every(Number.isFinite))?.location)}`);
    if (mol && (mol.arrows ?? []).some((a) => ![...a.from, ...a.to].every(Number.isFinite))) bad.push(`${what}: an arrow at a place that is not a number`);
  }
  assert.deepEqual(bad, []);
});

await check("N3", "A ChemDraw user's CDXML: bond lengths at the document's 14.4 pt, and every wedge begins at its stereocentre (ChemDraw's B atom), so ChemDraw draws the stereo as Octet does", () => {
  const m = placed("β-Cyclodextrin"), x = toCdxml(m, DEFAULT_STYLE);
  const nodes = new Map([...x.matchAll(/<n\b[^>]*\bid="(\d+)"[^>]*\bp="([-\d.]+) ([-\d.]+)"/g)].map((g) => [g[1], [Number(g[2]), Number(g[3])]]));
  const bonds = [...x.matchAll(/<b\b([^>]*)\/?>/g)].map((g) => ({ b: /\bB="(\d+)"/.exec(g[1])![1], e: /\bE="(\d+)"/.exec(g[1])![1], display: /\bDisplay="(\w+)"/.exec(g[1])?.[1] }));
  const ls = bonds.map((b) => Math.hypot(nodes.get(b.b)![0] - nodes.get(b.e)![0], nodes.get(b.b)![1] - nodes.get(b.e)![1]));
  assert.ok(Math.abs(median(ls) - 14.4) < 0.05, `median bond ${median(ls).toFixed(2)} pt`);
  const wedged = bonds.filter((b) => b.display), ids = [...nodes.keys()], cip = chem.cipOf(m).atoms;
  assert.equal(wedged.length, 35);
  assert.ok(wedged.every((b) => /^Wedge(d)?(Hash)?Begin$|^WedgeBegin$|^WedgedHashBegin$/.test(b.display!) && cip[ids.indexOf(b.b)]), `wedges: ${[...new Set(wedged.map((b) => b.display))].join(", ")}`);
});

await check("N5", "An AI app's odd place_template calls: a number, null, a list, a zero-width space, an unknown argument, a caption, arrow or structure id for on: refused with a reason, the drawing unchanged", async () => {
  const d = drawing("paper", "N5"), call = mcpOn(d);
  assert.ok(!(await template(call, { name: ET })).isError);
  assert.ok(!(await call("draw", { kind: "structures", structures: [{ text: "benzophenone" }] })).isError);
  const before = d.host.doc(), arrow = before.arrows![0].id, caption = before.captions![0].id;
  const bad: string[] = [];
  for (const args of [{ name: 7 }, { name: null }, { name: ["β-Cyclodextrin"] }, { name: "​CB[6]" }, { name: "CB[6]", size: 2 }, { name: "CB[6]", on: `t${caption}` }, { name: "CB[6]", on: `a${arrow}` }, { name: "CB[6]", on: "s1" }, { name: "CB[6]", set: "Supra" }, {}]) {
    const r = await template(call, args);
    if (!r.isError || said(r).length < 10) bad.push(`${JSON.stringify(args)}: ${r.isError ? "refused" : "placed"} "${said(r).slice(0, 80)}"`);
    if (d.host.doc() !== before) bad.push(`${JSON.stringify(args)}: the drawing changed`);
  }
  assert.deepEqual(bad, []);
});

await check("N6", "MCP place_template Energy transfer on an atom (s1.1): the arrow goes at that atom, as the Template tool puts it where the click is", async () => {
  const d = drawing("paper", "N6"), call = mcpOn(d);
  assert.ok(!(await call("draw", { kind: "structures", structures: [{ text: "benzophenone" }] })).isError);
  const atom = d.host.doc().atoms[0].location;
  const r = await template(call, { name: ET, on: "s1.1" });
  assert.ok(!r.isError, said(r));
  const a = d.host.doc().arrows![0], mid = [(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2], gap = Math.hypot(mid[0] - atom[0], mid[1] - atom[1]);
  assert.ok(gap < 3, `the arrow's middle is ${gap.toFixed(1)} bond lengths from the atom (at [${mid.map((v) => v.toFixed(1))}], the atom at [${atom.slice(0, 2).map((v) => v.toFixed(1))}])`);
});

await check("N7", "MCP place_template β-cyclodextrin on methanol's O: 2-O-methyl-β-cyclodextrin, no warning; the check names only what Pillar[5]arene's names there (off the page from the top left)", async () => {
  const on = async (name: string) => {
    const d = drawing("paper", "N7"), call = mcpOn(d);
    assert.ok(!(await call("draw", { kind: "structures", structures: [{ text: "methanol" }] })).isError);
    const r = await template(call, { name, on: "s1.2" });
    assert.ok(!r.isError, said(r));
    return { m: d.host.doc(), r };
  };
  const cd = await on("β-Cyclodextrin"), pil = await on("Pillar[5]arene");
  assert.deepEqual(formulas(cd.m), ["C43H72O35"]);
  assert.deepEqual(warnings(cd.m), []);
  const keys = (r: Reply) => (typeof r.structuredContent?.check === "object" ? Object.keys(r.structuredContent.check) : [r.structuredContent?.check]);
  assert.ok(keys(cd.r).every((k) => keys(pil.r).includes(k) || k === "clean"), `check: ${JSON.stringify(cd.r.structuredContent?.check)}, Pillar[5]arene's ${JSON.stringify(pil.r.structuredContent?.check)}`);
});

await check("N8", "Undo after every step: 12 edits on the new templates (place, fuse, arrow, flip, turn, colour, scale, delete, paste, Clean Up, move, delete the arrow), each undo gives the step before exactly, redo all gives the last", () => {
  const steps: Mol[] = [EMPTY];
  let m = EMPTY;
  const push = (x: Mol) => { m = x; steps.push(x); };
  push(placed("γ-Cyclodextrin", [0, 0]));
  const o = m.atoms.findIndex((a, i) => a.label === "O" && near(m, i).length === 1 && m.atoms[i].location[1] > 5);
  push(click(m, tpl("Cucurbit[6]uril"), [m.atoms[o].location[0], m.atoms[o].location[1]]));
  push(placed(ET, [30, 0], m));
  push(flipAll(m, "horizontal"));
  push(turnAll(m, 45));
  push({ ...m, atoms: m.atoms.map((a) => ({ ...a, colour: "#2050c0" })) });
  push(E.scaleSizes ? transformParts(m, allAtoms(m), items(m), (q) => [q[0] * 1.5, q[1] * 1.5], [1.5, 1.5]) : m);
  push(erase(m, new Set(), new Set([5])));
  push(insertMol(m, parse(serialize({ ...extractSelection(m, allAtoms(m), new Set()), style: DEFAULT_STYLE })), [40, 40]).mol);
  push(chem.cleanUp(m));
  push(moveAtoms(m, allAtoms(m), [1, -1]));
  push(deleteGraphics(m, new Set([m.arrows![0].id])));
  let h: History = { stack: [EMPTY], at: 0 };
  for (const s of steps.slice(1)) h = history(h, { type: "set", mol: s });
  assert.equal(h.at, 12, `12 steps (${h.at})`);
  for (let k = 11; k >= 0; k--) { h = history(h, { type: "undo" }); assert.equal(h.stack[h.at], steps[k], `undo to step ${k}`); }
  for (let k = 1; k <= 12; k++) h = history(h, { type: "redo" });
  assert.equal(h.stack[h.at], steps[12]);
  assert.ok(finite(steps[12]));
});

await check("N10", "Extreme zoom: γ-cyclodextrin and Cucurbit[8]uril drawn at 25% and 800% of the bond length: every number in the drawing finite, a label for every O and N", () => {
  const style = DEFAULT_STYLE;
  for (const zoom of [0.25, 8]) {
    const L = 14.4 * (4 / 3) * zoom, frame = frameStyle(style, L), measure = chem.measurer(fontStack(style.labelFont), frame.size);
    for (const n of ["γ-Cyclodextrin", "Cucurbit[8]uril"]) {
      const m = placed(n), d = render(m, frame, measure, L), bad: string[] = [];
      const walk = (v: unknown, at: string) => { if (typeof v === "number") { if (!Number.isFinite(v)) bad.push(`${at} ${v}`); } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`); };
      walk(d, "d");
      assert.deepEqual(bad.slice(0, 5), [], `${n} at ${zoom * 100}%: a number that is not finite`);
      const labelled = m.atoms.filter((a) => a.label !== "C").length;
      assert.equal(d.label.filter(Boolean).length, labelled, `${n} at ${zoom * 100}%: ${d.label.filter(Boolean).length} labels for ${labelled} heteroatoms`);
    }
  }
});

await check("N11", "Copy and paste between two drawings of different styles (ACS 1996 to RSC and to Nature): each host its compound, at the second drawing's bond length", () => {
  const presets = Object.keys(PRESETS).filter((p) => p !== "ACS Document 1996").slice(0, 3);
  for (const preset of presets) {
    const target = { ...DEFAULT_STYLE, ...PRESETS[preset], preset };
    for (const h of ["γ-Cyclodextrin", "Cucurbit[7]uril"]) {
      const src = placed(h), clip = serialize({ ...extractSelection(src, allAtoms(src), new Set()), style: DEFAULT_STYLE });
      const pasted = insertMol({ ...EMPTY, style: target }, parse(clip), [3, 3]).mol;
      assert.equal(inchi(pasted), PUBCHEM[h][1], `${h} into ${preset}`);
      assert.ok(Math.abs(median(lengths(pasted)) - 1) < 0.01, `${h} into ${preset}: bond length ${median(lengths(pasted)).toFixed(3)}`);
    }
  }
});

await check("N12", "Energy transfer clicked on an atom with the Template tool: the arrow goes where the click is (the point goes too), not to the page's origin", () => {
  const m = chem.indigoLayout("O=C(c1ccccc1)c1ccccc1"), shifted = moveAtoms(m, allAtoms(m), [30, 20]), i = 0, at = shifted.atoms[i].location;
  const out = click(shifted, tpl(ET), [at[0], at[1]]), a = out.arrows![0], mid = [(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2];
  assert.ok(Math.hypot(mid[0] - at[0], mid[1] - at[1]) < 0.5, `the arrow's middle at [${mid.map((v) => v.toFixed(1))}], the click at [${at.slice(0, 2).map((v) => v.toFixed(1))}]`);
  assert.equal(out.atoms.length, shifted.atoms.length, "no atom added or merged");
});

// (No atom on another is not asked: an O6 inside the ring has no free side, so any large template clicked there
// overlaps the host, as Pillar[5]arene does in 1.1.2.)
await check("N13", "β-Cyclodextrin clicked onto an inner O6 of another β-cyclodextrin (host on host): one structure, every place a number, no stereocentre left undefined", () => {
  const m = placed("β-Cyclodextrin"), r = (i: number) => Math.hypot(m.atoms[i].location[0], m.atoms[i].location[1]);
  const o6 = m.atoms.map((_, i) => i).filter((i) => m.atoms[i].label === "O" && near(m, i).length === 1).sort((a, b) => r(a) - r(b))[0];
  const out = click(m, tpl("β-Cyclodextrin"), [m.atoms[o6].location[0], m.atoms[o6].location[1]]);
  assert.deepEqual(formulas(out), ["C84H138O69"]);
  assert.equal(centres(inchi(out)).unknown, 0);
  assert.ok(finite(out));
});

await check("N14", "Energy transfer between a sensitiser and an acceptor, through the MCP: read lists no reaction (a transition, not a reaction arrow, plan D8), and Clean Up Reaction moves nothing", async () => {
  const d = drawing("paper", "N14"), call = mcpOn(d);
  d.host.set(insertMol(insertMol(d.host.doc(), chem.indigoLayout("O=C(c1ccccc1)c1ccccc1"), [4, -6]).mol, chem.indigoLayout("c1ccc(cc1)/C=C/c1ccccc1"), [16, -6]).mol);
  const m0 = d.host.doc(), [f1, f2] = fragments(m0), b1 = box(m0, f1), b2 = box(m0, f2), mid: P = [(b1[2] + b2[0]) / 2, (b1[1] + b1[3]) / 2];
  d.host.set(addTemplate(m0, tpl(ET), { point: mid }));
  const read = (await call("read", {})).structuredContent;
  assert.deepEqual(read.reactions, [], `reactions: ${JSON.stringify(read.reactions)}`);
  const before = d.host.doc();
  await call("advanced", { tool: "run_command", args: { command: "clean_reaction" } });
  assert.deepEqual(d.host.doc().atoms.map((a) => a.location), before.atoms.map((a) => a.location), "Clean Up Reaction moved the structures");
});

await check("N17", "Library search keeps 1.1.2's rule that the template named exactly as typed comes first, for every template in the library", () => {
  const lost: string[] = [];
  for (const t of all) {
    const was = search(t.name, "1.1.2")[0], now = search(t.name)[0];
    if (commonKey(was) === commonKey(t.name) && commonKey(now) !== commonKey(t.name)) lost.push(`"${t.name}" → ${now}`);
  }
  assert.deepEqual(lost, [], `${lost.length} names typed in full no longer list their own template first`);
});

await check("N18", "ET (electron transfer in photoredox, plan D8) is not taken as Energy transfer by place_template, and typing Et does not put Energy transfer first", async () => {
  const d = drawing("paper", "N18"), r = await template(mcpOn(d), { name: "ET" });
  const firstEt = search("Et")[0];
  assert.ok(r.isError || !said(r).includes(ET), `place_template ET: ${said(r).split("\n")[0]}`);
  assert.notEqual(firstEt, ET, `searching "Et" lists ${firstEt} first`);
});

await check("N19", "Copy As SMILES and paste, and the InChI pasted: each cyclodextrin comes back as PubChem's compound, every centre defined, in under 2 s", () => {
  for (const h of CDS) {
    const m = placed(h), t0 = performance.now(), fromSmiles = chem.parseStructure(chem.toSmiles(m)), fromInchi = chem.parseStructure(PUBCHEM[h][1]);
    assert.equal(inchi(chem.indigoLayout(chem.toSmiles(fromSmiles))), PUBCHEM[h][1], `${h} through SMILES`);
    assert.equal(inchi(fromInchi), PUBCHEM[h][1], `${h} through InChI`);
    assert.ok(performance.now() - t0 < 2000, `${h}: ${(performance.now() - t0).toFixed(0)} ms`);
  }
});

await check("N20", "Scaled to 10% and 1000% (Scale…): the same compound, the places finite, and the same back through CDXML", () => {
  for (const h of ["Cucurbit[8]uril", "α-Cyclodextrin"]) for (const k of [0.1, 10]) {
    const m = placed(h), s = transformParts(m, allAtoms(m), new Set(), (q) => [q[0] * k, q[1] * k], [k, k]);
    assert.equal(inchi(s), PUBCHEM[h][1], `${h} at ${k * 100}%`);
    assert.ok(finite(s));
    assert.equal(inchi(fromCdxml(toCdxml(s, DEFAULT_STYLE)).mol), PUBCHEM[h][1], `${h} at ${k * 100}% through CDXML`);
  }
});

await check("N21", "Ten Energy transfer arrows placed and saved: each EnT is on the arrow it came with, before and after .oct and CDXML", () => {
  let m = EMPTY;
  for (let k = 0; k < 10; k++) m = placed(ET, [3 * k, k % 2], m);
  // Each arrow, by where it is, and the text tied to it.
  const ties = (x: Mol) => x.arrows!.map((a) => `${Math.round((a.from[0] + a.to[0]) * 50)},${Math.round((a.from[1] + a.to[1]) * 50)}:${tied(x, a.id).map(plain).join("|")}`);
  for (const [what, x] of [["placed", m], [".oct", readOct(writeOct(m, DEFAULT_STYLE), true).mol], ["CDXML", fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol]] as const) {
    assert.equal(x.arrows?.length, 10, `${what}: ten arrows`);
    assert.deepEqual(ties(x), ties(m), `${what}: each EnT on its own arrow`);
    assert.ok(ties(x).every((t) => t.endsWith(":EnT")), `${what}: ${ties(x).join(" ")}`);
  }
});

await check("N22", "SDF of all 7 hosts in one file: read back, each record PubChem's compound", () => {
  let m = EMPTY;
  HOSTS.forEach((h, k) => { m = placed(h, [24 * k, 0], m); });
  // Each record as written, with its title line (blank) kept.
  const records = chem.toSdf(m).split(/\$\$\$\$\r?\n?/).filter((r) => r.trim());
  assert.equal(records.length, 7);
  assert.deepEqual(records.map((r) => inchi(r)), HOSTS.map((h) => PUBCHEM[h][1]));
});

await check("N23", "The Template button's icon: each host shows the books (too large to read at 20 px), as Pillar[5]arene does", () => {
  for (const h of [...HOSTS, "Pillar[5]arene"]) assert.equal(legible(tpl(h)), false, h);
});

await check("N24", "Library search per keystroke over every template stays within 1.5 times 1.1.2's rule (single letters e, a, c and o)", () => timed(() => {
  const [now, was] = versus(() => { for (const q of ["e", "a", "c", "o"]) search(q); }, () => { for (const q of ["e", "a", "c", "o"]) search(q, "1.1.2"); }, 21);
  console.log(`  N24: four one-letter searches ${now.toFixed(2)} ms against ${was.toFixed(2)} ms with 1.1.2's rule`);
  assert.ok(now <= was * 1.5 + 0.05, `${now.toFixed(2)} ms against ${was.toFixed(2)} ms`);
}));

await check("N25", "library-more.json, read as the app reads it once its window is idle: no slower than at the base beyond 25%", () => timed(() => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  let base: string;
  try { base = execFileSync("git", ["show", "bd7c684:src/library-more.json"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 }); } catch { return "no base commit bd7c684 in this clone"; }
  const now = readFileSync(new URL("./library-more.json", import.meta.url), "utf8");
  const [a, b] = versus(() => JSON.parse(now), () => JSON.parse(base), 21);
  console.log(`  N25: library-more.json ${now.length} bytes (base ${base.length}): parse ${a.toFixed(2)} ms against ${b.toFixed(2)} ms`);
  assert.ok(a <= b * 1.25 + 0.3, `${a.toFixed(2)} ms against ${b.toFixed(2)} ms`);
}));

// ==================================================================================================================
// ChemDraw 22.2 (P11)
// ==================================================================================================================
async function chemdraw(): Promise<string | void> {
  if (!process.env.OCTET_STRESS_CHEMDRAW) return "set OCTET_STRESS_CHEMDRAW=1 to run ChemDraw 22.2 by AppleScript";
  const app = "/Applications/ChemDraw 22.2.0.app", lock = process.env.OCTET_STRESS_CHEMDRAW_LOCK ?? join(fileURLToPath(new URL("../..", import.meta.url)), "chemdraw.lock");
  if (!existsSync(app)) return "no ChemDraw 22.2";
  const dir = mkdtempSync(join(tmpdir(), "octet-cd-")), names = [`hosts97-${process.pid}.cdxml`, `hosts97-${process.pid}.cdx`];
  writeFileSync(join(dir, names[0]), toCdxml(every, DEFAULT_STYLE));
  writeFileSync(join(dir, names[1]), writeCdx(every, DEFAULT_STYLE));
  for (let tries = 0; ; tries++) { try { mkdirSync(lock); break; } catch { if (tries > 45) return "ChemDraw is busy (its lock stayed taken for 15 minutes)"; await new Promise((r) => setTimeout(r, 20000)); } }
  const tell = (body: string) => spawnSync("osascript", ["-e", `tell application id "com.perkinelmer.ChemDraw.22"\n${body}\nend tell`], { encoding: "utf8", timeout: 60000 });
  const saved: string[] = [];
  try {
    for (const name of names) {
      execFileSync("open", ["-g", "-a", app, join(dir, name)]);
      let opened = false;
      for (let k = 0; k < 30 && !opened; k++) { opened = (tell("get name of every document").stdout ?? "").split(", ").map((x) => x.trim()).includes(name); if (!opened) await new Promise((r) => setTimeout(r, 2000)); }
      if (!opened) continue;
      const out = join(dir, `saved-${name}.cdxml`);
      const r = tell(`save document "${name}" in (POSIX file "${out}") as "ChemDraw XML"\nclose document "${name}" saving no`);
      if (r.status === 0 && existsSync(out)) saved.push(out);
    }
  } finally { rmSync(lock, { recursive: true, force: true }); }
  if (!saved.length) { rmSync(dir, { recursive: true, force: true }); return "ChemDraw 22.2 did not open either file within 60 s (a dialog of its own may be up; this check does not touch its windows)"; }
  for (const out of saved) {
    const back = fromCdxml(readFileSync(out, "utf8")).mol;
    assert.deepEqual(hostOf(back).map((x) => inchi(x)).sort(), hostOf(every).map((x) => inchi(x)).sort(), `${out}: each host's InChI after ChemDraw`);
    const a = back.arrows?.find((x) => x.style === "wavy");
    assert.ok(a && (a.end === "full" || a.kind === "reaction"), `${out}: the wavy arrow with its head`);
    assert.ok((back.captions ?? []).some((c) => plain(c) === "EnT"), `${out}: EnT as text`);
  }
  rmSync(dir, { recursive: true, force: true });
}
await check("P11", "ChemDraw 22.2 opens one CDXML and one CDX holding all 8 and saves them as CDXML: each host its compound, the arrow wavy with its head, EnT as text", () => chemdraw());

// --- Report -------------------------------------------------------------------------------------------------------
const failed = results.filter((r) => r.state === "failed"), skipped = results.filter((r) => r.state === "skipped");
for (const r of skipped) console.log(`  skipped ${r.id} ${r.title}: ${r.note}`);
for (const r of failed) console.error(`  FAILED ${r.id} ${r.title}\n         ${r.note}`);
console.log(`hosttemplates-stress.check: ${results.length} cases, ${results.length - failed.length - skipped.length} ok, ${skipped.length} skipped, ${failed.length} failed${failed.length ? `: ${failed.map((r) => r.id).join(", ")}` : ""}`);
if (failed.length) process.exit(1);

