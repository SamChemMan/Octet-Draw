// Run: node src/circledcharge-stress.check.ts. The stress list of issue 60 (docs/plans/issue-60-circled-charges.md,
// S1 to S23): Circle new charges on every route, and the free charge with a number (issue 164's free symbol with
// count) under held keys, many clicks, undo and redo, copy and paste, files from Octet, ChemDraw and an attacker, zoom,
// dark mode, turns, chemistry, speed and AI apps with odd arguments. Each case runs on its own, and the file fails at
// the end with the cases that fail. What only the window does (a click, a key, the canvas) is checked here in the code
// the editor runs for it, or in its source; the page itself was checked in the browser for the report.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The headless host sets up what chem.ts takes from a browser, and is Octet with no window for the AI tools.
const { load, drawing, session } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { toMolfile, toSmiles, expandLabels } = await import("./chem.ts");
const { DEFAULT_STYLE, frameStyle, readStyle } = await import("./docstyle.ts");
const E = await import("./edit.ts");
const { fromCdxml, toCdxml, parseXml } = await import("./cdxml.ts");
const { xmlToCdx, cdxToXml } = await import("./cdx.ts");
const { parse, serialize } = await import("./file.ts");
const { readCdx, readOct, writeCdx, writeOct } = await import("./oct.ts");
const { chargeKind, chargeRing, freeSymbol, inShape, reKind, resizeSymbol, signOf, symbolCharge, symbolInk, symbolNumber, symbolSize, RING } = await import("./render.ts");
const { findReaction, rowOf } = await import("./reaction.ts");
type Mol = import("./render.ts").Mol;
type Shape = import("./render.ts").Shape;
type Box = import("./render.ts").Box;
type Host = import("./mcp.ts").Host;
type P = [number, number];
await load();

const { EMPTY, addShape, updateShape, stepFree, keyCharge, keyCharges, circleCharges, transformParts, deleteChosen, groupSelection, insertMol, extractSelection, duplicateSelection, addArrow } = E;
const S = DEFAULT_STYLE, ON = { ...S, circled: true as const }, SIGN = (0.75 * S.labelSize) / S.bond, TOOL = SIGN;
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;
const nearP = (a: P, b: P, e = 1e-6) => near(a[0], b[0], e) && near(a[1], b[1], e);
const charge = (q: number, circled = false, c: P = [0, 0]): Omit<Shape, "id"> => { const k = chargeKind(q, circled); return freeSymbol(k.symbol, c, SIGN, k.count); };
const frees = (m: Mol) => (m.shapes ?? []).filter((x) => symbolCharge(x) !== undefined);
const look = (x: Shape) => [symbolCharge(x), x.symbol!.startsWith("circled")];
const opensFromJson = (m: Mol, st = S) => !readOct(writeOct(m, st)).foreign;
const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const strip = (x: string) => x.replace(/\sOctet='[^']*'/g, "").replace(/\sOctet="[^"]*"/g, "");

// The AI tools against Octet with no window (each call one undo step, with Undo and Redo). The Actions panel's charge
// items run as the editor's runAction runs them (keyCharges on what is picked), which needs the editor, so here the
// stand-in does that.
let d = drawing("paper", "Stress"), rpc = 0;
const host = (): Host => ({ ...d.host, act: (id: string) => { if (!/^charge\./.test(id)) return d.host.act(id); const p = d.host.selection(); d.host.set(keyCharges(d.host.doc(), p.atoms, p.items, id.slice(7), !!d.host.style().circled)); return true; } });
const call = async (name: string, args: unknown, s = "a") => {
  const r = JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } }), host, "1", session("Stress", s)));
  return { error: !!(r.error || r.result?.isError), text: String(r.result?.content?.[0]?.text ?? r.error?.message ?? "") };
};
const change = (op: Record<string, unknown>, s?: string) => call("change", { operations: [op] }, s);
const run = (command: string, ids?: string[], s?: string) => call("advanced", { tool: "run_command", args: { command, ...(ids ? { ids } : {}) } }, s);
const fine = async (p: Promise<{ error: boolean; text: string }>) => { const r = await p; assert.ok(!r.error, r.text); return r.text; };
const fresh = () => { d = drawing("paper", "Stress"); };
const doc = () => d.host.doc();
const lastId = () => `b${doc().shapes!.at(-1)!.id}`;

const results: { id: string; what: string; ok: boolean; why?: string }[] = [];
async function kase(id: string, what: string, f: () => unknown) {
  try { await f(); results.push({ id, what, ok: true }); } catch (e) { results.push({ id, what, ok: false, why: (e as Error).message.split("\n")[0].slice(0, 300) }); }
}

await kase("S1", "+ held over an uncharged N, over 20 selected atoms and over a free charge stops at ±8; the file opens from its JSON", () => {
  let m: Mol = { atoms: [{ label: "N", location: [0, 0, 0] }], bonds: [] };
  for (let k = 0; k < 60; k++) m = keyCharge(m, 0, "plus", true);
  assert.deepEqual([m.atoms[0].charge, m.atoms[0].circled], [8, true]);
  assert.equal(keyCharge(m, 0, "plus", true), m, "at +8 a key makes no new drawing, so no undo step");
  let many: Mol = { atoms: Array.from({ length: 20 }, (_, i) => ({ label: "O", location: [i, 0, 0] as [number, number, number] })), bonds: [] };
  const all = many.atoms.map((_, i) => i);
  for (let k = 0; k < 60; k++) many = keyCharges(many, all, [], "minus");
  assert.ok(many.atoms.every((a) => a.charge === -8 && !a.circled));
  let [f, id] = addShape(m, charge(1, true, [3, 0]));
  for (let k = 0; k < 60; k++) f = keyCharges(f, [], [id], "plus");
  assert.deepEqual(frees(f).map(look), [[8, true]]);
  assert.equal(keyCharges(f, [], [id], "plus"), f, "at +8 nothing changes");
  for (const x of [m, many, f]) assert.ok(opensFromJson(x), "opens from its JSON");
});

await kase("S2", "A circled +1, then −, then + with the option off: a plain +1", () => {
  let m: Mol = { atoms: [{ label: "N", location: [0, 0, 0] }], bonds: [] };
  m = keyCharge(keyCharge(keyCharge(m, 0, "circledPlus"), 0, "minus", false), 0, "plus", false);
  assert.deepEqual([m.atoms[0].charge, m.atoms[0].circled], [1, undefined]);
});

await kase("S3", "100 charged atoms, Circle new charges on and off ten times: no atom changes, one undo step each", async () => {
  fresh();
  const m: Mol = { ...doc(), atoms: Array.from({ length: 100 }, (_, i) => ({ label: "N", location: [i % 10, Math.floor(i / 10), 0] as [number, number, number], charge: (i % 3) - 1 || 2, ...(i % 2 ? { circled: true as const } : {}) })), bonds: [] };
  d.host.begin("x"); d.host.set(m); d.host.end();
  const atoms = JSON.stringify(doc().atoms.map((a) => [a.charge, a.circled]));
  for (let k = 0; k < 10; k++) {
    await fine(call("advanced", { tool: "set_style", args: { circled_charges: k % 2 === 0 } }));
    assert.equal(!!d.host.style().circled, k % 2 === 0);
    assert.equal(JSON.stringify(doc().atoms.map((a) => [a.charge, a.circled])), atoms, "no atom changes");
  }
  for (let k = 0; k < 10; k++) assert.ok(d.host.command("undo"));
  assert.equal(!!d.host.style().circled, false, "ten undo steps back");
  assert.equal(JSON.stringify(doc().atoms.map((a) => [a.charge, a.circled])), atoms);
});

await kase("S4", "The drawing's own option holds where new drawings have the other; a ChemDraw file has it off", () => {
  const m: Mol = { atoms: [{ label: "N", location: [0, 0, 0], charge: 1, circled: true }, { label: "O", location: [1, 0, 0], charge: -1 }], bonds: [{ atoms: [0, 1], type: 1 }] };
  for (const [st, want] of [[ON, true], [S, false]] as const) {
    for (const text of [writeOct(m, st), toCdxml(m, st)]) assert.equal(!!readStyle(readOct(text).mol.style).circled, want);
    assert.equal(!!readCdx(writeCdx(m, st)).mol.style?.circled, want);
  }
  const r = fromCdxml(strip(toCdxml(m, ON)));
  assert.equal(!!readStyle(r.style).circled, false);
  assert.deepEqual(r.mol.atoms.map((a) => [a.charge, !!a.circled]), [[1, true], [-1, false]], "every atom keeps its look");
});

// The Symbols tool's click with a charge (Editor.tsx), as the editor runs it: on a free charge it steps it (stepFree,
// the tool's look, nothing at ±8); where nothing is, a new one at an atom's sign's size.
const click = (m: Mol, tool: "plus" | "minus" | "circledPlus" | "circledMinus", at: P): Mol => {
  const on = [...(m.shapes ?? [])].reverse().find((x) => x.kind === "symbol" && inShape(x, at));
  if (on && symbolCharge(on) !== undefined) { const c = stepFree(on, tool === "plus" || tool === "circledPlus" ? 1 : -1, tool.startsWith("circled")); return c ? updateShape(m, on.id, c) : m; }
  return addShape(m, freeSymbol(tool, at, TOOL))[0];
};
await kase("S5", "30 Positive charge clicks at one point; 30 at 30 points; Circled negative on the 8+", () => {
  assert.match(src("Editor.tsx"), /const c = stepFree\(on, free === "plus" \|\| free === "circledPlus" \? 1 : -1, free\.startsWith\("circled"\)\); return c && set\(updateShape\(doc, on\.id, c\)\);/, "the editor's click is the one run here");
  let m: Mol = EMPTY, undo = 0;
  for (let k = 0; k < 30; k++) { const next = click(m, "plus", [1, 1]); if (next !== m) undo++; m = next; }
  assert.deepEqual([frees(m).map(look), undo], [[[8, false]], 8], "one free charge at 8+, eight undo steps");
  assert.ok(nearP(signOf(frees(m)[0]), [1, 1]), "its sign where it was clicked");
  m = click(m, "circledMinus", [1, 1]);
  assert.deepEqual(frees(m).map(look), [[7, true]]);
  let n: Mol = EMPTY;
  for (let k = 0; k < 30; k++) n = click(n, "plus", [k * 1.5, 0]);
  assert.deepEqual(frees(n).map(look), Array(30).fill([1, false]));
});

await kase("S6", "Place, step ×3, circle, colour, size, move, turn, delete; undo ×9 to empty; redo ×9 to the same JSON", async () => {
  fresh();
  const empty = serialize(doc()), states: string[] = [];
  await fine(change({ op: "shape", kind: "symbol", symbol: "plus", at: [4, 0] }));
  states.push(serialize(doc()));
  const id = lastId();
  for (const step of [() => run("charge.plus", [id]), () => run("charge.plus", [id]), () => run("charge.plus", [id]), () => run("charge.circled", [id]),
    () => change({ op: "edit", ids: [id], colour: "#C42B2B" }), () => change({ op: "edit", ids: [id], size: 15 }), () => change({ op: "move", ids: [id], dx: 1, dy: 2 }),
    () => change({ op: "edit", ids: [id], rotate: 30 }), () => change({ op: "delete", ids: [id] })]) { await fine(step()); states.push(serialize(doc())); }
  assert.equal(new Set(states).size, 10, "every step changed the drawing");
  const four = parse(states[4]).shapes![0];
  assert.deepEqual(look(four), [4, true]);
  for (let k = 0; k < 10; k++) assert.ok(d.host.command("undo"), `undo ${k}`);
  assert.equal(serialize(doc()), empty);
  for (let k = 0; k < 10; k++) assert.ok(d.host.command("redo"), `redo ${k}`);
  assert.equal(serialize(doc()), states[9]);
  d.host.command("undo");
  assert.equal(serialize(doc()), states[8], "the same JSON, byte for byte");
});

await kase("S7", "− on a free +1 gives −1, + on a free −1 gives +1; MCP edit charge 0 is refused and changes nothing", async () => {
  let m: Mol = EMPTY, a: number, b: number;
  [m, a] = addShape(m, charge(1));
  [m, b] = addShape(m, charge(-1, true, [2, 0]));
  m = keyCharges(keyCharges(m, [], [a], "minus"), [], [b], "plus");
  assert.deepEqual(frees(m).map(look), [[-1, false], [1, true]]);
  fresh();
  await fine(change({ op: "shape", kind: "symbol", charge: 3, at: [0, 0] }));
  const was = serialize(doc()), r = await change({ op: "edit", ids: [lastId()], charge: 0 });
  assert.ok(r.error && /cannot be 0/.test(r.text) && serialize(doc()) === was, r.text);
});

await kase("S8", "⌘A over atoms, free charges, a free radical and a box, then +: atoms and free charges step in one step", () => {
  let m: Mol = { atoms: [{ label: "N", location: [0, 0, 0] }, { label: "O", location: [1, 0, 0], charge: 2, circled: true }], bonds: [] };
  [m] = addShape(m, charge(-2, false, [3, 0]));
  [m] = addShape(m, freeSymbol("radical", [5, 0], SIGN));
  [m] = addShape(m, { kind: "box", from: [6, 1], to: [7, 0] });
  const out = keyCharges(m, m.atoms.map((_, i) => i), m.shapes!.map((x) => x.id), "plus", false);
  assert.deepEqual([out.atoms.map((a) => [a.charge, a.circled]), frees(out).map(look)], [[[1, undefined], [3, true]], [[-1, false]]]);
  assert.deepEqual(out.shapes!.slice(1), m.shapes!.slice(1), "the radical and the box stay");
  assert.match(src("Editor.tsx"), /return set\(keyCharges\(doc, \[\.\.\.selection\]\.filter\(\(i\) => i < doc\.atoms\.length\), picked, charge\.slice\(7\), !!style\.circled\), true\);/, "one set: one undo step");
});

await kase("S9", "Copy a numbered, circled, coloured free charge: paste here, in a second drawing, ⌘D, and back from Word's CDXML", () => {
  let m: Mol = { atoms: [{ label: "Fe", location: [0, 0, 0] }], bonds: [] }, id: number;
  [m, id] = addShape(m, { ...charge(3, true, [1, 1]), colour: "#2B6CC4", angle: 20 });
  const copied = extractSelection(m, new Set(), new Set([id])), one = (x: Mol) => { const f = frees(x).at(-1)!; return [look(f), f.colour?.toUpperCase(), f.angle]; };
  const json = serialize(copied), want = [[3, true], "#2B6CC4", 20];
  assert.deepEqual(one(insertMol(m, parse(json), [1, 0]).mol), want, "here");
  assert.deepEqual(one(insertMol(EMPTY, parse(json)).mol), want, "a second drawing");
  assert.deepEqual(one(duplicateSelection(m, new Set(), new Set([id])).mol), want, "⌘D");
  // Word hands the PDF back unchanged, with the CDXML in it: Octet reads the CDXML.
  assert.deepEqual(one(fromCdxml(toCdxml(copied, S)).mol), want, "from Word");
  assert.deepEqual(frees(fromCdxml(strip(toCdxml(copied, S))).mol).map(look), [[3, true]], "from ChemDraw's copy of it");
});

await kase("S10", ".oct, .cdxml and .cdx of ±1 to ±8, plain and circled, coloured, scaled, turned, in a group, 0.5 bond lengths from an atom; MOL and SMILES hold the structure only", () => {
  let m: Mol = { atoms: [{ label: "Fe", location: [0, 0, 0] }, { label: "C", location: [1, 0, 0] }], bonds: [{ atoms: [0, 1], type: 1 }] };
  for (let q = -8; q <= 8; q++) for (const circled of [false, true]) if (q) [m] = addShape(m, { ...charge(q, circled, [q * 1.5, circled ? 3 : 5]), ...(q % 3 ? {} : { colour: "#C42B2B" }), ...(q % 4 ? {} : { angle: 15 }) });
  [m] = addShape(m, { ...charge(2, true, [0.5, 0]) });
  // One at twice the size (Text > Size, Scale), and the last one 0.5 bond lengths from Fe, in the user's group.
  const big = m.shapes!.at(-2)!;
  m = updateShape(m, big.id, resizeSymbol(big, 2 * SIGN));
  [m] = groupSelection(m, new Set([0, 1]), new Set([m.shapes!.at(-1)!.id]))!;
  const wanted = frees(m).map(look);
  const reads: [string, Mol][] = [["oct", readOct(writeOct(m, S)).mol], ["cdx", readCdx(writeCdx(m, S)).mol], ["cdxml", fromCdxml(toCdxml(m, S)).mol], ["cdxml as ChemDraw's", fromCdxml(strip(toCdxml(m, S))).mol], ["cdx as ChemDraw's", fromCdxml(cdxToXml(xmlToCdx(parseXml(strip(toCdxml(m, S)))))).mol]];
  for (const [what, r] of reads) {
    assert.deepEqual(frees(r).map(look), wanted, what);
    assert.equal(r.atoms[0].charge, undefined, `${what}: Fe takes no charge`);
    frees(r).forEach((x, k) => assert.ok(nearP(signOf(x), signOf(frees(m)[k]), 0.02), `${what}: ${k}`));
  }
  assert.equal(fromCdxml(toCdxml(m, S)).mol.groups?.length, 1, "the user's group, no more");
  const plain: Mol = { atoms: m.atoms, bonds: m.bonds };
  assert.equal(toSmiles(expandLabels(m)), toSmiles(expandLabels(plain)));
  assert.equal(toMolfile(expandLabels(m)).replace(/^.*\n/, ""), toMolfile(expandLabels(plain)).replace(/^.*\n/, ""));
});

await kase("S11", "ChemDraw 22.2's save of Octet's groups (the digit linked to its symbol) reads back as the same free charges", () => {
  // As ChemDraw 22.2 saved Octet's CDXML on 18 November (the round trip in the report): each free charge's group kept,
  // integral or not, the symbol linked to its digit, Octet's data gone.
  let m: Mol = { atoms: [{ label: "Fe", location: [0, 0, 0] }], bonds: [] };
  for (const [q, c, at] of [[2, true, [0.6, 0.4]], [-3, false, [1.2, -0.3]], [1, true, [0, 1.4]]] as [number, boolean, P][]) [m] = addShape(m, charge(q, c, at));
  const saved = strip(toCdxml(m, S)).replace(/ Integral="yes"/g, "");
  const r = fromCdxml(saved).mol;
  assert.deepEqual([frees(r).map(look), r.atoms[0].charge, r.groups?.length ?? 0], [frees(m).map(look), undefined, 0]);
});

await kase("S12", "A 1.2 file opens in Octet 1.1.2 from its CDXML: each free charge a sign with its number as text (checked against 1.1.2's code for the report)", () => {
  // 1.1.2 refuses the JSON (kind symbol) and reads the CDXML: here, the CDXML has a text and a sign in each group.
  let m: Mol = EMPTY;
  [m] = addShape(m, charge(3, false, [0, 0]));
  assert.throws(() => parse(serialize(m).replace(/"symbol": "plus"/, '"symbol": "dagger"')), /damaged/);
  const x = toCdxml(m, S);
  assert.match(x.replace(/\n/g, " "), /<group [^>]*Integral="yes"[^>]*><t [^>]*><s [^>]*>3<\/s><\/t><graphic [^>]*SymbolType="Plus"/);
});

await kase("S13", "Hostile JSON and CDXML: damaged, or only the exact group shape; sizes fall back; the reader's limits hold", () => {
  const json = JSON.parse(serialize(addShape(EMPTY, charge(2))[0]));
  for (const bad of [0, 1, 9, 2.5, "2"]) assert.throws(() => parse(JSON.stringify({ ...json, shapes: [{ ...json.shapes[0], count: bad }] })), /damaged/, `count ${bad}`);
  assert.throws(() => parse(JSON.stringify({ ...json, shapes: [{ ...json.shapes[0], symbol: "radical" }] })), /damaged/, "count on a radical");
  const page = (b: string) => `<?xml version="1.0"?><CDXML BondLength="14.4" LabelSize="10"><page id="1" BoundingBox="0 0 540 720">${b}</page></CDXML>`;
  const t = (id: number, s: string) => `<t id="${id}" p="290 205"><s font="3" size="7.5">${s}</s></t>`, g = (type = "Plus", link = 7, box = "300 200 292.5 200") => `<graphic id="9" BoundingBox="${box}" GraphicType="Symbol" SymbolType="${type}"><represent attribute="Charge" object="${link}"/></graphic>`;
  for (const body of [`<group>${t(7, "99999999")}${g()}</group>`, `<group>${t(7, "&lt;img src=x onerror=1&gt;2")}${g()}</group>`, `<group><fragment id="2"><n id="3" p="250 200" Element="26"/></fragment>${t(7, "2")}${g()}</group>`]) {
    const r = fromCdxml(page(body)).mol;
    assert.ok(!frees(r).some((x) => x.count), body);
    assert.ok(!(r.captions ?? []).some((c) => /<img/.test(c.text) && c.runs), "text stays text");
  }
  const fe = fromCdxml(page(`<group><fragment id="2"><n id="3" p="250 200" Element="26"/></fragment>${t(7, "2")}${g()}</group>`)).mol;
  assert.deepEqual([fe.atoms.length, fe.atoms[0].charge, fe.groups?.length], [1, undefined, 1], "X12: the structure kept, its group kept");
  for (const box of ["NaN NaN NaN NaN", "1e9 1e9 0 0"]) { const r = fromCdxml(page(`<group>${t(7, "4")}${g("Minus", 7, box)}</group>`)).mol; assert.ok((r.shapes ?? []).every((x) => [...x.from, ...x.to].every(Number.isFinite) && symbolSize(x) < 41), box); }
  assert.throws(() => fromCdxml(page(`${"<group>".repeat(200)}${g()}${"</group>".repeat(200)}`)), "200 nested groups: past the reader's limit");
});

await kase("S14", "Smallest and largest zoom, the smallest free charge: its number is drawn, its ring round, it can be clicked", () => {
  for (const zoom of [0.1, 8]) {
    const s = frameStyle(S, ((S.bond * 4) / 3) * zoom), k = s.bond, measure = (x: string) => ({ width: 0.556 * s.size * x.length, ascent: 0.716 * s.size, outline: [] as P[] });
    for (const size of [0.05, 1]) {
      const sh: Shape = { id: 1, ...freeSymbol("circledPlus", [0, 0], size, 2) }, n = symbolNumber(sh, k, measure, s.size)!;
      assert.ok(n.text === "2+" && n.size > 0 && Number.isFinite(n.x), `${zoom} ${size}`);
      const ink = symbolInk(sh, k), r = ink.flat().map(([x, y]) => Math.hypot(x, y)), R = RING * size * k;
      assert.ok(ink.length >= 40 && Math.max(...r) <= R * 1.25 + 1e-9 && Math.min(...r) >= R * 0.8 - 1e-9, `round: ${zoom} ${size}`);
      assert.ok(inShape(sh, [0, 0]) && inShape(sh, [0.4 * size, 0]));
    }
  }
  assert.ok(chargeRing([0, 0], 2, 0.5, 0.05).length >= 40);
});

await kase("S15", "Dark mode: the number is ink (or its colour) as the sign is; export draws it as on white paper", () => {
  const ed = src("Editor.tsx"), sign = /<path key=\{`sh\$\{sh\.id\}`\}[^\n]*fill=\{sh\.colour \? textInk\(sh\.colour\) : "var\(--ink\)"\}/, number = /<text key=\{`n\$\{sh\.id\}`\}[^\n]*fill=\{sh\.colour \? textInk\(sh\.colour\) : "var\(--ink\)"\}/;
  assert.match(ed, sign);
  assert.match(ed, number, "the number takes the sign's fill, so dark mode and export treat the two alike");
});

await kase("S16", "A structure and a numbered free charge turned 37° and flipped: they move together; undo puts them back", () => {
  let m: Mol = { atoms: [{ label: "Fe", location: [0, 0, 0] }, { label: "C", location: [1, 0, 0] }], bonds: [{ atoms: [0, 1], type: 1 }] }, id: number;
  [m, id] = addShape(m, charge(3, false, [0.8, 0.5]));
  const r = (37 * Math.PI) / 180, turn = (q: P): P => [q[0] * Math.cos(r) - q[1] * Math.sin(r), q[0] * Math.sin(r) + q[1] * Math.cos(r)];
  const t = transformParts(m, new Set([0, 1]), new Set([id]), turn), x = t.shapes![0];
  assert.ok(near(x.angle!, 37) && nearP(signOf(x), turn([0.8, 0.5]), 1e-6) && x.count === 3);
  const f = transformParts(t, new Set([0, 1]), new Set([id]), (q) => [-q[0], q[1]], [1, 1], undefined, 1, "across").shapes![0];
  assert.ok(f.count === 3 && near(f.angle ?? 0, -37) && f.from[0] < f.to[0], JSON.stringify(f));
  assert.ok(m.shapes![0].angle === undefined, "the drawing before is untouched (undo)");
});

await kase("S17", "Delete the structure beside a free charge; the Eraser on it; Clean Up Reaction with a 2+ by a product's brackets; a 2+ between two structures", () => {
  const at = (x: number) => ({ label: "C", location: [x, 0, 0] as [number, number, number] });
  let m: Mol = { atoms: [at(0), at(1), at(5), at(6)], bonds: [{ atoms: [0, 1], type: 1 }, { atoms: [2, 3], type: 1 }] }, id: number;
  [m, id] = addShape(m, charge(2, false, [1.4, 0.4]));
  const gone = deleteChosen(m, new Set([0, 1]), new Set());
  assert.deepEqual(frees(gone).map(look), [[2, false]], "the charge stays");
  const erased = deleteChosen(m, new Set(), new Set([id]));
  assert.deepEqual([erased.atoms.length, frees(erased).length], [4, 0], "the Eraser takes only it");
  const ink = (mol: Mol) => (atoms: number[]): Box => { const q = atoms.map((i) => mol.atoms[i].location); return [Math.min(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[0])), Math.max(...q.map((p) => p[1]))]; };
  let r: Mol = { atoms: [at(0), at(1), at(5), at(6)], bonds: [{ atoms: [0, 1], type: 1 }, { atoms: [2, 3], type: 1 }] };
  [r] = addShape(r, { kind: "brackets", from: [4.7, 0.5], to: [6.3, -0.5] });
  [r, id] = addShape(r, charge(2, false, [6.55, 0.6]));
  [r] = addArrow(r, { kind: "reaction", from: [2, 0], to: [4, 0] });
  assert.ok(findReaction(r, r.arrows![0].id, r.arrows!, ink(r), () => undefined)!.carried.includes(id), "it moves with the product");
  const [between] = addShape({ atoms: [at(0), at(1), at(4), at(5)], bonds: [{ atoms: [0, 1], type: 1 }, { atoms: [2, 3], type: 1 }] }, charge(2, false, [2.5, 0]));
  assert.notEqual(rowOf(between, undefined, ink(between), () => undefined)?.plus, true, "a 2+ is not a reaction plus");
});

await kase("S18", "500 numbered free charges among 40 rings: ink, numbers and files inside the budgets (chargespeed.check.ts times them against 1.1.2's work)", () => {
  let m: Mol = EMPTY;
  for (let k = 0; k < 500; k++) [m] = addShape(m, { ...charge(((k % 16) - 8) || 8, k % 2 === 0, [(k % 25) * 1.2, -Math.floor(k / 25) * 1.2]) });
  const s = frameStyle(S, (S.bond * 4) / 3), measure = (x: string) => ({ width: 5 * x.length, ascent: 7, outline: [] as P[] });
  const t0 = performance.now();
  for (const x of m.shapes!) { symbolInk(x, s.bond); symbolNumber(x, s.bond, measure, s.size); }
  const t1 = performance.now(), text = toCdxml(m, S), t2 = performance.now(), back = fromCdxml(text).mol, t3 = performance.now();
  assert.equal(frees(back).length, 500);
  assert.ok(t1 - t0 < 400 && t2 - t1 < 4000 && t3 - t2 < 4000, `${(t1 - t0).toFixed(0)} ms, ${(t2 - t1).toFixed(0)} ms, ${(t3 - t2).toFixed(0)} ms`);
});

await kase("S19", "MCP: shape charge 0, 12, two; charge on a radical; circled yes; edit charge on a box and a radical; circled on an uncharged atom; set_style yes; charge.circled with nothing picked", async () => {
  fresh();
  for (const [args, why] of [[{ charge: 0 }, /cannot be 0/], [{ charge: 12 }, /charge/], [{ charge: "two" }, /charge/], [{ circled: "yes" }, /circled/]] as [Record<string, unknown>, RegExp][]) {
    const r = await change({ op: "shape", kind: "symbol", at: [0, 0], ...args });
    assert.ok(r.error && why.test(r.text), r.text);
  }
  assert.equal(doc().shapes, undefined, "nothing half done");
  assert.match(await fine(change({ op: "shape", kind: "symbol", symbol: "radical", charge: 2, at: [0, 0] })), /Not drawn: charge/);
  const radical = lastId();
  await fine(change({ op: "shape", kind: "box", box: [3, 0, 4, 1] }));
  const box = lastId();
  d.host.begin("x"); d.host.set({ ...doc(), atoms: [{ label: "N", location: [6, 0, 0] }] }); d.host.end();
  assert.match(await fine(change({ op: "edit", ids: [box, radical], charge: 2 })), /Not changed: b\d+ takes no charge; b\d+ takes no charge/);
  assert.match(await fine(change({ op: "edit", ids: ["s1.1", box], circled: true })), /s1\.1 has no charge to circle/);
  const st = await call("advanced", { tool: "set_style", args: { circled_charges: "yes" } });
  assert.ok(st.error && /circled_charges/.test(st.text), st.text);
  const c = await run("charge.circled");
  assert.ok(c.error && /did not fit/.test(c.text), c.text);
});

await kase("S20", "Two AI sessions: one steps b5, one colours it; then one deletes it and the other edits it", async () => {
  fresh();
  await fine(change({ op: "shape", kind: "symbol", charge: 2, at: [0, 0] }, "a"));
  const id = lastId();
  await fine(run("charge.plus", [id], "a"));
  await fine(change({ op: "edit", ids: [id], colour: "#2B6CC4" }, "b"));
  assert.deepEqual([look(frees(doc())[0]), frees(doc())[0].colour], [[3, false], "#2B6CC4"]);
  assert.ok(d.host.command("undo") && frees(doc())[0].colour === undefined && look(frees(doc())[0]).join() === "3,false", "one undo step each");
  d.host.command("redo");
  await fine(change({ op: "delete", ids: [id] }, "a"));
  const r = await change({ op: "edit", ids: [id], charge: 4 }, "b");
  assert.ok(r.error && /nothing with the id/.test(r.text), r.text);
});

await kase("S21", "+ over a Nu caption with the option on: a Nu atom with a circled +1, one undo step", () => {
  const m: Mol = { atoms: [{ label: "C", location: [0, 0, 0], text: "Nu" }], bonds: [] };
  const out = keyCharge(m, 0, "plus", true);
  assert.deepEqual([out.atoms[0].text, out.atoms[0].charge, out.atoms[0].circled], ["Nu", 1, true]);
  assert.match(src("Editor.tsx"), /if \(made\) return set\(keyCharge\(made, doc\.atoms\.length, arg, !!style\.circled\), false, key\);/, "made and charged in one set");
});

await kase("S22", "A free charge dragged over an atom, then + with the pointer on the atom: the atom takes the charge", () => {
  const ed = src("Editor.tsx");
  assert.match(ed, /const hitBelow = \(p: P\): Hover => \{\s*const t = hitAt\(p\);\s*if \(t\.atom !== undefined\) return t;/, "an atom is hit before a shape on it");
  assert.match(ed, /t\.atom !== undefined \? "atom" : t\.bond !== undefined \? "bond" : keyCaption\(\) \? "caption" : keyFree\(\) \? "caption" : "none"/);
  let m: Mol = { atoms: [{ label: "N", location: [0, 0, 0] }], bonds: [] };
  [m] = addShape(m, charge(1, false, [0, 0]));
  const out = keyCharge(m, 0, "plus", false);
  assert.deepEqual([out.atoms[0].charge, frees(out).map(look)], [1, [[1, false]]]);
});

await kase("S23", "MCP read with no detail on a drawing with a 3− free charge gives charge −3", async () => {
  fresh();
  await fine(change({ op: "shape", kind: "symbol", charge: -3, circled: true, at: [0, 0] }));
  const r = await call("read", {});
  assert.ok(!r.error && /"charge":-3/.test(r.text), r.text.slice(0, 600));
});

// Circle the charge on a mixed pick keeps the numbers and the places (D8), and reKind keeps the turn (D2): for every
// row above that changes a look.
await kase("D8", "Circle the charge on atoms and free charges together, on and off", () => {
  let m: Mol = { atoms: [{ label: "N", location: [0, 0, 0], charge: 2 }], bonds: [] };
  [m] = addShape(m, { ...charge(-4, false, [2, 0]), angle: 25 });
  const ids = m.shapes!.map((x) => x.id), on = circleCharges(m, [0], ids), off = circleCharges(on, [0], ids);
  assert.deepEqual([on.atoms[0].circled, frees(on).map(look), off.atoms[0].circled, frees(off).map(look)], [true, [[-4, true]], undefined, [[-4, false]]]);
  assert.ok(nearP(signOf(frees(off)[0]), signOf(frees(m)[0])) && frees(off)[0].angle === 25);
  assert.deepEqual(reKind(frees(m)[0], "circledMinus", 4).count, 4);
});

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.id} ${r.what}${r.why ? `\n       ${r.why}` : ""}`);
assert.equal(failed.length, 0, `circledcharge-stress.check: ${failed.length} of ${results.length} cases fail: ${failed.map((r) => r.id).join(", ")}`);
console.log(`circledcharge-stress.check: ${results.length} cases ok`);
