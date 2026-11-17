// Run: node src/hosts.check.ts. The Supramolecules set's cyclodextrins and cucurbiturils (issue 97, drawn in
// tools/library/hosts.mjs):
// 1. Each is its compound by two references made apart: the build's (the cyclodextrins from OPSIN's α-1,4 chain closed
//    into a ring, the cucurbiturils written atom by atom) and PubChem's standard InChI, copied here by hand with its
//    CID. The formula is exact, and the masses are PubChem's.
// 2. Drawn in the set's style (flat, bond length 1, element labels, no colour of its own), clear (no clash, not messy,
//    labelled atoms apart), the same drawing turned round the middle for each unit, wedges where chemists put them
//    and each glucose as its Haworth projection, the first atom where a click on an atom joins.
// 3. As a structure in the app: placed, on an atom, on a bond, flipped, turned, part deleted, coloured, undone and
//    redone, copied and pasted, through .oct, CDXML, CDX, MOL, SDF, SMILES and InChI, saved as a ChemDraw template
//    file, and the Template button's icon.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { readTemplateFile, writeTemplateFile } from "./ctp.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { addTemplate, EMPTY, erase, flipAtoms, rotateAtoms } from "./edit.ts";
import { parse, serialize } from "./file.ts";
import { history, type History } from "./history.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import type { Mol } from "./render.ts";
import { legible } from "./templates.ts";

const dir = new URL("./vendor/opsin/", import.meta.url);
if (!existsSync(new URL("opsin.js", dir))) { console.log("hosts.check: skipped (no OPSIN build)"); process.exit(0); }
const more: { sets: { name: string; items: { name: string; also?: string; mol: Mol }[] }[] } = JSON.parse(readFileSync(new URL("./library-more.json", import.meta.url), "utf8"));
const supra = more.sets.find((c) => c.name === "Supramolecules")!.items;
const CDS = ["α-Cyclodextrin", "β-Cyclodextrin", "γ-Cyclodextrin"], CBS = ["Cucurbit[5]uril", "Cucurbit[6]uril", "Cucurbit[7]uril", "Cucurbit[8]uril"];
// At the end of the set, after the hosts 1.1.2 had (a template kept in the Ring strip is kept by name).
assert.deepEqual(supra.slice(-7).map((t) => t.name), [...CDS, ...CBS]);
assert.equal(supra[14].name, "[2.2]Paracyclophane");
const mol = (name: string) => supra.find((t) => t.name === name)!.mol;
const also = (name: string) => supra.find((t) => t.name === name)!.also!.split(", ");

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const gl = globalThis as Record<string, unknown>;
gl.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
gl.getComputedStyle = () => ({ getPropertyValue: () => "10" });
gl.window = globalThis;
gl.self = { location: { origin: "file://" } };
gl.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
await chem.ready;
const pack = readFileSync(new URL("opsin-data.bin", dir)), files = new Map<string, Int8Array>();
for (let p = 0; ; ) {
  const n = pack.readUInt16BE(p); p += 2;
  if (!n) break;
  const name = pack.toString("latin1", p, p + n); p += n;
  const size = pack.readInt32BE(p); p += 4;
  files.set(name, new Int8Array(pack.buffer, pack.byteOffset + p, size)); p += size;
}
gl.opsinResource = (name: string) => files.get(name) ?? null;
const opsin = await import(new URL("opsin.js", dir).href);
opsin.init();
const { attachOpsin, nameToSmiles } = await import("./names.ts");
attachOpsin(opsin, readFileSync(new URL("names.txt", dir), "utf8"));
const { problems, messy } = await import("./check.ts");
const { clashes } = await import("../tools/library/clashes.mjs");
const { cucurbiturilGraph, cyclodextrinSmiles, labelGap, nearestLabelled } = await import("../tools/library/hosts.mjs");
const inchi = (s: Mol | string) => { try { return chem.toInchi(typeof s === "string" ? chem.parseStructure(s) : s); } catch { return undefined; } };
const warnings = (m: Mol) => problems(m, chem.stereoFacts(m)).map((p) => p.message);

// ——— 1. The compounds ———
// PubChem (read 17 November 2026): [name, CID, standard InChI, monoisotopic mass, molecular weight].
const PUBCHEM: [string, number, string, number, number][] = [
  ["α-Cyclodextrin", 444913, "InChI=1S/C36H60O30/c37-1-7-25-13(43)19(49)31(55-7)62-26-8(2-38)57-33(21(51)15(26)45)64-28-10(4-40)59-35(23(53)17(28)47)66-30-12(6-42)60-36(24(54)18(30)48)65-29-11(5-41)58-34(22(52)16(29)46)63-27-9(3-39)56-32(61-25)20(50)14(27)44/h7-54H,1-6H2/t7-,8-,9-,10-,11-,12-,13-,14-,15-,16-,17-,18-,19-,20-,21-,22-,23-,24-,25-,26-,27-,28-,29-,30-,31-,32-,33-,34-,35-,36-/m1/s1", 972.31694049, 972.8],
  ["β-Cyclodextrin", 444041, "InChI=1S/C42H70O35/c43-1-8-29-15(50)22(57)36(64-8)72-30-9(2-44)66-38(24(59)17(30)52)74-32-11(4-46)68-40(26(61)19(32)54)76-34-13(6-48)70-42(28(63)21(34)56)77-35-14(7-49)69-41(27(62)20(35)55)75-33-12(5-47)67-39(25(60)18(33)53)73-31-10(3-45)65-37(71-29)23(58)16(31)51/h8-63H,1-7H2/t8-,9-,10-,11-,12-,13-,14-,15-,16-,17-,18-,19-,20-,21-,22-,23-,24-,25-,26-,27-,28-,29-,30-,31-,32-,33-,34-,35-,36-,37-,38-,39-,40-,41-,42-/m1/s1", 1134.3697639, 1135.0],
  ["γ-Cyclodextrin", 5287407, "InChI=1S/C48H80O40/c49-1-9-33-17(57)25(65)41(73-9)82-34-10(2-50)75-43(27(67)19(34)59)84-36-12(4-52)77-45(29(69)21(36)61)86-38-14(6-54)79-47(31(71)23(38)63)88-40-16(8-56)80-48(32(72)24(40)64)87-39-15(7-55)78-46(30(70)22(39)62)85-37-13(5-53)76-44(28(68)20(37)60)83-35-11(3-51)74-42(81-33)26(66)18(35)58/h9-72H,1-8H2/t9-,10-,11-,12-,13-,14-,15-,16-,17-,18-,19-,20-,21-,22-,23-,24-,25-,26-,27-,28-,29-,30-,31-,32-,33-,34-,35-,36-,37-,38-,39-,40-,41-,42-,43-,44-,45-,46-,47-,48-/m1/s1", 1296.4225873, 1297.1],
  ["Cucurbit[5]uril", 6096206, "InChI=1S/C30H30N20O10/c51-21-31-1-32-12-14-36(22(32)52)4-40-16-18-44(26(40)56)8-48-20-19-47(29(48)59)7-43-17-15-39(25(43)55)3-35(21)13-11(31)33-2-34(12)24(54)38(14)6-42(16)28(58)46(18)10-50(20)30(60)49(19)9-45(17)27(57)41(15)5-37(13)23(33)53/h11-20H,1-10H2", 830.24537723, 830.7],
  ["Cucurbit[6]uril", 196163, "InChI=1S/C36H36N24O12/c61-25-37-1-38-14-16-42(26(38)62)4-46-18-20-50(30(46)66)8-54-22-24-58(34(54)70)11-57-23-21-53(33(57)69)7-49-19-17-45(29(49)65)3-41(25)15-13(37)39-2-40(14)28(64)44(16)6-48(18)32(68)52(20)10-56(22)36(72)60(24)12-59(23)35(71)55(21)9-51(19)31(67)47(17)5-43(15)27(39)63/h13-24H,1-12H2", 996.29445268, 996.8],
  ["Cucurbit[7]uril", 6096207, "InChI=1S/C42H42N28O14/c71-29-43-1-44-16-18-48(30(44)72)4-52-20-22-56(34(52)76)8-60-24-26-64(38(60)80)12-68-28-27-67(41(68)83)11-63-25-23-59(37(63)79)7-55-21-19-51(33(55)75)3-47(29)17-15(43)45-2-46(16)32(74)50(18)6-54(20)36(78)58(22)10-62(24)40(82)66(26)14-70(28)42(84)69(27)13-65(25)39(81)61(23)9-57(21)35(77)53(19)5-49(17)31(45)73/h15-28H,1-14H2", 1162.34352813, 1163.0],
  ["Cucurbit[8]uril", 16133299, "InChI=1S/C48H48N32O16/c81-33-49-1-50-18-20-54(34(50)82)4-58-22-24-62(38(58)86)8-66-26-28-70(42(66)90)12-74-30-32-78(46(74)94)15-77-31-29-73(45(77)93)11-69-27-25-65(41(69)89)7-61-23-21-57(37(61)85)3-53(33)19-17(49)51-2-52(18)36(84)56(20)6-60(22)40(88)64(24)10-68(26)44(92)72(28)14-76(30)48(96)80(32)16-79(31)47(95)75(29)13-71(27)43(91)67(25)9-63(23)39(87)59(21)5-55(19)35(51)83/h17-32H,1-16H2", 1328.39260358, 1329.1],
];
const want = new Map(PUBCHEM.map(([name, , i]) => [name, i]));
const units = (name: string) => (CDS.includes(name) ? CDS.indexOf(name) + 6 : CBS.indexOf(name) + 5);
for (const [name, cid, ref, exact, weight] of PUBCHEM) {
  const n = units(name), m = mol(name);
  // The build's reference, made without PubChem, is PubChem's compound.
  const built = CDS.includes(name) ? inchi(cyclodextrinSmiles(n, nameToSmiles)!) : inchi(cucurbiturilGraph(n));
  assert.equal(built, ref, `${name}: the build's reference is PubChem CID ${cid}`);
  assert.equal(inchi(m), ref, `${name} is PubChem CID ${cid}, stereo included`);
  const a = chem.analyse(m)![0];
  assert.equal(a.formula, CDS.includes(name) ? `C${6 * n}H${10 * n}O${5 * n}` : `C${6 * n}H${6 * n}N${4 * n}O${2 * n}`, name);
  assert.ok(Math.abs(a.exact - exact) < 0.001, `${name}: monoisotopic mass ${a.exact}, PubChem ${exact}`);
  assert.ok(Math.abs(a.weight - weight) < 0.06, `${name}: molecular weight ${a.weight}, PubChem ${weight}`);
}
// Found by the words a chemist types; one general word picks the commonest (R7).
for (const [name, words] of [["α-Cyclodextrin", ["alpha-cyclodextrin", "α-CD", "alpha-CD", "cyclomaltohexaose", "cyclohexaamylose"]], ["β-Cyclodextrin", ["cyclodextrin", "beta-cyclodextrin", "β-CD", "beta-CD", "cyclomaltoheptaose", "cycloheptaamylose"]],
  ["γ-Cyclodextrin", ["gamma-cyclodextrin", "γ-CD", "gamma-CD", "cyclomaltooctaose", "cyclooctaamylose"]], ["Cucurbit[5]uril", ["CB[5]", "CB5"]], ["Cucurbit[6]uril", ["cucurbituril", "CB[6]", "CB6"]],
  ["Cucurbit[7]uril", ["CB[7]", "CB7"]], ["Cucurbit[8]uril", ["CB[8]", "CB8"]]] as const)
  assert.deepEqual(also(name), words, name);
console.log("hosts: 3 cyclodextrins and 4 cucurbiturils are their PubChem compounds (InChI, formula, masses), as the build's references are ok");

// ——— 2. The drawings ———
const P = (m: Mol, i: number) => m.atoms[i].location;
const length = (m: Mol, b: Mol["bonds"][number]) => Math.hypot(P(m, b.atoms[0])[0] - P(m, b.atoms[1])[0], P(m, b.atoms[0])[1] - P(m, b.atoms[1])[1]);
const near = (m: Mol, i: number) => m.bonds.flatMap((b) => (b.atoms[0] === i ? [b.atoms[1]] : b.atoms[1] === i ? [b.atoms[0]] : []));
// The rings of six (each glucose) and of five (each urea), as lists of atoms in order round.
function rings(m: Mol, size: number): number[][] {
  const out: number[][] = [], seen = new Set<string>();
  const walk = (path: number[]) => {
    if (path.length === size) { if (near(m, path.at(-1)!).includes(path[0])) { const key = [...path].sort((a, b) => a - b).join(" "); if (!seen.has(key)) { seen.add(key); out.push(path); } } return; }
    for (const j of near(m, path.at(-1)!)) if (!path.includes(j) && j > path[0]) walk([...path, j]);
  };
  m.atoms.forEach((_, i) => walk([i]));
  return out;
}
// The narrowest label gap and the nearest labelled atoms the drawings keep (R4; CB[5] cannot keep one bond length, as
// the plan's D5 says: its five inner C=O meet in the middle).
const SPACE: Record<string, [number, number]> = {
  "α-Cyclodextrin": [1, 0.3], "β-Cyclodextrin": [1, 0.45], "γ-Cyclodextrin": [1, 0.45],
  "Cucurbit[5]uril": [0.7, 0.09], "Cucurbit[6]uril": [1, 0.6], "Cucurbit[7]uril": [1, 0.6], "Cucurbit[8]uril": [1, 0.8],
};
for (const name of [...CDS, ...CBS]) {
  const m = mol(name), n = units(name), ls = m.bonds.map((b) => length(m, b)).sort((a, b) => a - b);
  // The set's style (R3): flat, bond length 1 (the median), centred, every atom an element with no text, nothing of its own look.
  assert.ok(m.atoms.every((a) => !a.location[2] && !a.text && !a.shown && !a.colour && !a.size && !a.font), `${name}: flat, element labels`);
  assert.ok(m.bonds.every((b) => !b.colour && !b.width && !b.display), `${name}: plain bonds`);
  assert.ok(Math.abs(ls[Math.floor(ls.length / 2)] - 1) < 0.005, `${name}: bond length 1`);
  const xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]);
  assert.ok(Math.abs(Math.min(...xs) + Math.max(...xs)) < 0.01 && Math.abs(Math.min(...ys) + Math.max(...ys)) < 0.01, `${name}: centred`);
  // Clear (R4): no clash as Octet draws it, not messy (so Clean Up is not offered), labelled atoms apart.
  assert.deepEqual(clashes(m), [], name);
  assert.equal(messy(m), false, `${name} is not messy`);
  assert.ok(ls[0] >= 0.75 && ls.at(-1)! <= 1.3, `${name}: bonds ${ls[0]} to ${ls.at(-1)}`);
  assert.ok(nearestLabelled(m) >= SPACE[name][0], `${name}: labelled atoms ${nearestLabelled(m)} apart`);
  assert.ok(labelGap(m) >= SPACE[name][1], `${name}: labels ${labelGap(m)} apart`);
  // The same drawing for every unit, turned by 360°/n about the middle (R5), bonds and wedges with it.
  const c = [xs.reduce((s, v) => s + v, 0) / xs.length, ys.reduce((s, v) => s + v, 0) / ys.length], t = (2 * Math.PI) / n;
  const turned = m.atoms.map((a) => { const dx = a.location[0] - c[0], dy = a.location[1] - c[1]; return [c[0] + dx * Math.cos(t) - dy * Math.sin(t), c[1] + dx * Math.sin(t) + dy * Math.cos(t)]; });
  const to = turned.map((q, i) => m.atoms.findIndex((a) => a.label === m.atoms[i].label && Math.hypot(a.location[0] - q[0], a.location[1] - q[1]) < 0.01));
  assert.ok(to.every((j) => j >= 0) && new Set(to).size === to.length, `${name}: each unit is the last turned by 360°/${n}`);
  const bonds = new Set(m.bonds.map((b) => `${b.atoms[0]} ${b.atoms[1]} ${b.type} ${b.stereo ?? 0}`));
  assert.ok(m.bonds.every((b) => bonds.has(`${to[b.atoms[0]]} ${to[b.atoms[1]]} ${b.type} ${b.stereo ?? 0}`)), `${name}: and its bonds and wedges`);
  // No warning as placed.
  assert.deepEqual(warnings(m), [], name);
  // The Template button shows the books (too large to read at toolbar size).
  assert.equal(legible(m), false, name);
}
// The cyclodextrins: wedges only on bonds out of a ring, the narrow end at a stereocentre and the wide end at none (R6);
// each glucose read as its Haworth projection seen from above (D2): O5, C1 to C5 clockwise, C1–O hashed (α), C2–OH
// hashed, C3–OH wedged, C4–O hashed and C5–C6 wedged. The first atom is the top ring's O2 (D7).
for (const name of CDS) {
  const m = mol(name), n = units(name), cip = chem.cipOf(m).atoms, glucoses = rings(m, 6);
  assert.equal(glucoses.length, n, `${name}: ${n} glucose rings`);
  const inRing = new Set(glucoses.flatMap((r) => r.map((i, k) => [i, r[(k + 1) % 6]].sort((a, b) => a - b).join(" "))));
  const wedged = m.bonds.filter((b) => b.stereo === 1 || b.stereo === 6);
  assert.equal(wedged.length, 5 * n, name);
  for (const b of wedged) {
    assert.ok(!inRing.has([...b.atoms].sort((a, z) => a - z).join(" ")), `${name}: no wedge in a ring`);
    assert.ok(cip[b.atoms[0]] && !cip[b.atoms[1]], `${name}: narrow end at a stereocentre, wide end at none`);
  }
  const stereo = (a: number, z: number) => m.bonds.find((b) => b.atoms[0] === a && b.atoms[1] === z)?.stereo;
  for (const ring of glucoses) {
    const o5 = ring.find((i) => m.atoms[i].label === "O")!, k = ring.indexOf(o5), [x, y] = [ring[(k + 1) % 6], ring[(k + 5) % 6]];
    const outO = (i: number) => near(m, i).find((j) => !ring.includes(j) && m.atoms[j].label === "O");
    const c1 = outO(x) !== undefined ? x : y, round = c1 === x ? [0, 1, 2, 3, 4, 5].map((s) => ring[(k + s) % 6]) : [0, 5, 4, 3, 2, 1].map((s) => ring[(k + s) % 6]);
    const [, C1, C2, C3, C4, C5] = round, c6 = near(m, C5).find((j) => !ring.includes(j))!;
    const area = round.reduce((s, i, j) => { const p = P(m, i), q = P(m, round[(j + 1) % 6]); return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    assert.ok(area < 0, `${name}: O5, C1 to C5 clockwise`);
    assert.deepEqual([stereo(C1, outO(C1)!), stereo(C2, outO(C2)!), stereo(C3, outO(C3)!), stereo(C4, outO(C4)!), stereo(C5, c6)], [6, 6, 1, 6, 1], `${name}: Haworth`);
  }
  const first = 0, c2 = near(m, first)[0];
  assert.ok(m.atoms[first].label === "O" && near(m, first).length === 1 && P(m, first)[1] > 0, `${name}: the first atom is the top ring's O2`);
  assert.ok(near(m, c2).some((j) => near(m, j).some((o) => m.atoms[o].label === "O" && rings(m, 6).some((r) => r.includes(o)) && rings(m, 6).some((r) => r.includes(j)))), `${name}: on C2, beside C1`);
}
// The cucurbiturils: no wedges (D6), urea ring angles within 25° of a regular pentagon's, every CH2 bridge bent (150°
// at most, to the places' rounding), the inner rim drawn smaller, and a methine carbon first (D7).
for (const name of CBS) {
  const m = mol(name), n = units(name), five = rings(m, 5);
  assert.ok(m.bonds.every((b) => !b.stereo), `${name}: no wedges`);
  assert.equal(five.length, 2 * n, `${name}: ${2 * n} urea rings`);
  const angle = (i: number, a: number, b: number) => { const u = [P(m, a)[0] - P(m, i)[0], P(m, a)[1] - P(m, i)[1]], v = [P(m, b)[0] - P(m, i)[0], P(m, b)[1] - P(m, i)[1]]; return (Math.acos((u[0] * v[0] + u[1] * v[1]) / Math.hypot(u[0], u[1]) / Math.hypot(v[0], v[1])) * 180) / Math.PI; };
  for (const r of five) r.forEach((i, k) => assert.ok(Math.abs(angle(i, r[(k + 4) % 5], r[(k + 1) % 5]) - 108) <= 25, `${name}: ring angle`));
  const bridges = m.atoms.flatMap((a, i) => (a.label === "C" && near(m, i).length === 2 && near(m, i).every((j) => m.atoms[j].label === "N") ? [i] : []));
  assert.equal(bridges.length, 2 * n, `${name}: ${2 * n} CH2 bridges`);
  for (const c of bridges) { const [a, b] = near(m, c); assert.ok(angle(c, a, b) <= 150.1, `${name}: bridge at ${angle(c, a, b)}°`); }
  const radius = (i: number) => Math.hypot(...P(m, i).slice(0, 2));
  const carbonyl = m.atoms.flatMap((a, i) => (a.label === "O" ? [i] : [])).map(radius).sort((a, b) => a - b);
  assert.ok(carbonyl[n - 1] < carbonyl[n] - 2, `${name}: two rims of C=O`);
  const ns = (rim: number[]) => rim.flatMap((o) => near(m, near(m, o)[0]).filter((j) => m.atoms[j].label === "N"));
  const os = m.atoms.flatMap((a, i) => (a.label === "O" ? [i] : [])).sort((a, b) => radius(a) - radius(b)), inner = ns(os.slice(0, n)), outer = ns(os.slice(n));
  const ring = (list: number[]) => list.map((i) => length(m, m.bonds.find((b) => b.atoms.includes(i) && near(m, i).includes(b.atoms[0] === i ? b.atoms[1] : b.atoms[0]) && m.atoms[b.atoms[0] === i ? b.atoms[1] : b.atoms[0]].label === "C" && near(m, b.atoms[0] === i ? b.atoms[1] : b.atoms[0]).length === 3)!));
  assert.ok(Math.max(...ring(inner)) < Math.min(...ring(outer)), `${name}: the inner rim smaller`);
  assert.ok(m.atoms[0].label === "C" && near(m, 0).length === 3 && near(m, 0).filter((j) => m.atoms[j].label === "N").length === 2, `${name}: a methine carbon first`);
}
console.log("hosts: drawn flat in the set's style, clear, one unit turned round, wedges as the Haworth projection's, no wedges on a cucurbituril ok");

// ——— 3. In the app ———
const ref = (name: string) => want.get(name)!;
const one = (m: Mol) => chem.analyse(m)?.map((x) => x.formula);
// Placed on an empty page (stress 1): one structure, its InChI, no warning, not messy, one undo step.
{
  let h: History = { stack: [EMPTY], at: 0 };
  const placed = addTemplate(EMPTY, mol("γ-Cyclodextrin"), { point: [3, -2] });
  h = history(h, { type: "set", mol: placed });
  assert.deepEqual([one(placed), inchi(placed), warnings(placed), messy(placed)], [["C48H80O40"], ref("γ-Cyclodextrin"), [], false]);
  assert.equal(history(h, { type: "undo" }).stack[history(h, { type: "undo" }).at], EMPTY, "one undo step");
}
// On an atom (stress 4, D7): on methanol's O, β-cyclodextrin joins through C2: 2-O-methyl-β-cyclodextrin, clear of the
// methanol. A cucurbituril on ethane's carbon joins at a methine carbon: methylcucurbit[6]uril.
{
  const meoh: Mol = { atoms: [{ label: "C", location: [0, 0, 0] }, { label: "O", location: [1, 0, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] };
  const on = addTemplate(meoh, mol("β-Cyclodextrin"), { atom: 1 });
  const methylated = cyclodextrinSmiles(7, nameToSmiles)!.replace("[C@H]1([C@H](O)", "[C@H]1([C@H](OC)");
  assert.deepEqual([one(on), inchi(on), warnings(on), messy(on)], [["C43H72O35"], inchi(methylated), [], false]);
  const ethane: Mol = { atoms: [{ label: "C", location: [0, 0, 0] }, { label: "C", location: [0.866, 0.5, 0] }], bonds: [{ type: 1, atoms: [0, 1] }] };
  for (const name of CBS) {
    const cb = addTemplate(ethane, mol(name), { atom: 1 }), n = units(name);
    assert.deepEqual([one(cb), warnings(cb), messy(cb)], [[`C${6 * n + 1}H${6 * n + 2}N${4 * n}O${2 * n}`], [], false], name);
  }
}
// On a bond, either way round (stress 5): Octet mirrors the template off the crowded side and swaps its wedges, so the
// compound is the same both ways.
{
  const hexagon = (flip: number): Mol => ({ atoms: Array.from({ length: 6 }, (_, k) => ({ label: "C", location: [flip * Math.cos((k * Math.PI) / 3), Math.sin((k * Math.PI) / 3), 0] as [number, number, number] })), bonds: Array.from({ length: 6 }, (_, k) => ({ type: 1, atoms: [k, (k + 1) % 6] as [number, number] })) });
  const ways = [1, -1].map((f) => addTemplate(hexagon(f), mol("β-Cyclodextrin"), { bond: 0 }));
  const wedges = (m: Mol) => m.bonds.filter((b) => b.stereo === 1).length;
  assert.notEqual(wedges(ways[0]), wedges(ways[1]), "one way is mirrored, its wedges swapped");
  assert.equal(inchi(ways[0]), inchi(ways[1]), "the same compound either way");
  for (const w of ways) assert.deepEqual(warnings(w), []);
}
// Flipped (stress 6): Flip mirrors (the enantiomer, /m0), and again gives it back; Rotate 180° in 3D keeps it.
// Turned (stress 7): the same compound, still not messy.
for (const name of ["β-Cyclodextrin", "Cucurbit[7]uril"]) {
  const m = mol(name), all = new Set(m.atoms.map((_, i) => i)), isCd = CDS.includes(name);
  const mirrored = flipAtoms(m, all, "horizontal", true);
  assert.equal(inchi(mirrored), isCd ? ref(name).replace("/m1/", "/m0/") : ref(name), `${name} flipped`);
  assert.equal(inchi(flipAtoms(mirrored, all, "horizontal", true)), ref(name), `${name} flipped twice`);
  assert.equal(inchi(flipAtoms(m, all, "vertical")), ref(name), `${name} turned over in 3D`);
  for (const d of [37, 90, 180]) { const t = rotateAtoms(m, all, d); assert.deepEqual([inchi(t), messy(t)], [ref(name), false], `${name} turned ${d}°`); }
}
// Part deleted (stress 8a): one glycosidic O of β-cyclodextrin goes: one open chain C42H72O34, no wedge left without a
// stereocentre at its narrow end, and undo gives the ring back.
{
  const m = mol("β-Cyclodextrin"), glycosidic = m.atoms.findIndex((a, i) => a.label === "O" && near(m, i).length === 2 && !rings(m, 6).some((r) => r.includes(i)));
  let h: History = { stack: [m], at: 0 };
  const open = erase(m, new Set(), new Set([glycosidic]));
  h = history(h, { type: "set", mol: open });
  assert.deepEqual([one(open), warnings(open)], [["C42H72O34"], []]);
  const cip = chem.cipOf(open).atoms;
  assert.ok(open.bonds.filter((b) => b.stereo).every((b) => cip[b.atoms[0]]), "every wedge's narrow end still a stereocentre");
  assert.equal(inchi(h.stack[history(h, { type: "undo" }).at]), ref("β-Cyclodextrin"));
}
// An undo chain (stress 2): Cucurbit[8]uril placed, turned 30°, flipped, coloured red, one CH2 deleted; five undos give
// the empty page and five redos the drawing as it was, every atom, bond and colour.
{
  const steps: Mol[] = [];
  let m = addTemplate(EMPTY, mol("Cucurbit[8]uril"), { point: [0, 0] });
  const all = () => new Set(m.atoms.map((_, i) => i));
  steps.push(m);
  steps.push((m = rotateAtoms(m, all(), 30)));
  steps.push((m = flipAtoms(m, all(), "horizontal", true)));
  steps.push((m = { ...m, atoms: m.atoms.map((a) => ({ ...a, colour: "#ff0000" })), bonds: m.bonds.map((b) => ({ ...b, colour: "#ff0000" })) }));
  const ch2 = m.atoms.findIndex((a, i) => a.label === "C" && near(m, i).length === 2);
  steps.push((m = erase(m, new Set(), new Set([ch2]))));
  let h: History = { stack: [EMPTY], at: 0 };
  for (const s of steps) h = history(h, { type: "set", mol: s });
  for (let k = 0; k < 5; k++) h = history(h, { type: "undo" });
  assert.equal(h.stack[h.at], EMPTY);
  for (let k = 0; k < 5; k++) h = history(h, { type: "redo" });
  assert.deepEqual(h.stack[h.at], m);
  assert.deepEqual(one(m), ["C47H48N32O16"], "a CH2 bridge gone, its two N now NH");
}
// Many fast clicks (stress 3): 20 cucurbiturils placed 0.5 bond lengths apart, one step each, every place a number.
{
  let h: History = { stack: [EMPTY], at: 0 }, m = EMPTY;
  for (let k = 0; k < 20; k++) h = history(h, { type: "set", mol: (m = addTemplate(m, mol("Cucurbit[6]uril"), { point: [0.5 * k, 0.25 * k] })) });
  assert.equal(h.at, 20);
  assert.ok(m.atoms.every((a) => a.location.every(Number.isFinite)));
}
// Copied and pasted (stress 9), ten times in one window and into another: Octet's clipboard text and CDXML give each
// copy its compound back.
{
  let page = EMPTY;
  for (let k = 0; k < 10; k++) page = addTemplate(page, parse(serialize(mol("β-Cyclodextrin"))), { point: [20 * k, 0] });
  assert.deepEqual(chem.analyse(page)!.map((x) => x.formula), Array(10).fill("C42H70O35"));
  const other = fromCdxml(toCdxml(page, DEFAULT_STYLE)).mol;
  assert.equal(inchi(other), inchi(page), "into another window as CDXML");
}
// Every file format (stress 10): .oct, CDXML and CDX keep places and wedges; MOL (V2000 and V3000), SDF, SMILES and
// InChI keep the compound.
const look = (m: Mol) => ({ atoms: m.atoms.map((a) => [a.label, (a.colour ?? "").toLowerCase()]), bonds: m.bonds.map((b) => [...b.atoms, b.type, b.stereo ?? 0, (b.colour ?? "").toLowerCase()]) });
const same = (back: Mol, m: Mol, what: string) => {
  assert.deepEqual(look(back), look(m), what);
  assert.ok(back.atoms.every((a, i) => Math.hypot(a.location[0] - m.atoms[i].location[0], a.location[1] - m.atoms[i].location[1]) < 0.01), `${what}: places within 0.01`);
};
for (const name of [...CDS, ...CBS]) {
  const m = addTemplate(EMPTY, mol(name), { point: [0, 0] });
  for (const [kind, back] of [["CDXML", fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol], ["CDX", readCdx(writeCdx(m, DEFAULT_STYLE)).mol], [".oct", readOct(writeOct(m, DEFAULT_STYLE)).mol]] as const) {
    same(back, m, `${name} through ${kind}`);
    assert.equal(inchi(back), ref(name), `${name} through ${kind}`);
  }
  for (const [kind, text] of [["MOL V2000", chem.toMolfile(m, true)], ["MOL V3000", chem.toMolfile(m)], ["SDF", chem.toSdf(m)], ["SMILES", chem.toSmiles(m)], ["InChI", ref(name)]])
    assert.equal(inchi(text), ref(name), `${name} through ${kind}`);
}
// Its colour (consistency: every object takes a colour) comes back from .oct and CDXML.
{
  const m = addTemplate(EMPTY, mol("β-Cyclodextrin"), { point: [0, 0] }), red = { ...m, atoms: m.atoms.map((a) => ({ ...a, colour: "#cc0000" })), bonds: m.bonds.map((b) => ({ ...b, colour: "#cc0000" })) };
  same(readOct(writeOct(red, DEFAULT_STYLE)).mol, red, "coloured, through .oct");
  same(fromCdxml(toCdxml(red, DEFAULT_STYLE)).mol, red, "coloured, through CDXML");
}
// Copied into My templates and saved as a ChemDraw template file (stress 22): both written and read back whole.
{
  const saved = writeTemplateFile([{ name: "γ-Cyclodextrin", mol: mol("γ-Cyclodextrin") }, { name: "Cucurbit[8]uril", mol: mol("Cucurbit[8]uril") }], "Hosts");
  assert.deepEqual([saved.written, saved.left], [2, 0]);
  const back = readTemplateFile(saved.bytes, "Hosts.ctp").templates;
  assert.deepEqual(back.map((t) => [t.name, inchi(t.mol)]), [["γ-Cyclodextrin", ref("γ-Cyclodextrin")], ["Cucurbit[8]uril", ref("Cucurbit[8]uril")]]);
}
// Clean Up (stress 23): the cyclodextrins keep their stereo and stay tidy; the cucurbiturils keep their compound (their
// Clean Up is crowded, templates.check.ts lists them).
for (const name of [...CDS, ...CBS]) assert.equal(inchi(chem.cleanUp(mol(name))), ref(name), `${name} after Clean Up`);
console.log("hosts: placed, on an atom and a bond, flipped, turned, part deleted, undone, pasted, through every format and a template file ok");
