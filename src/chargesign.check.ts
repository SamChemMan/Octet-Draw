// Run: node src/chargesign.check.ts. Issue 164: an atom's charge with its own place, colour and size (Atom.sign), as
// ChemDraw's charge symbol linked to its atom. Drawing, edits, files (.oct JSON, CDXML, CDX, a ChemDraw file without
// Octet's data), hostile values, the Editor's wiring and the drawing's speed (plan docs/plans/issue-164-164-1-1-3.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render, SIGN_REACH, type Atom, type Ink, type Mol } from "./render.ts";
import { addSymbol, dropCharge, flipAtoms, keyCharges, markNear, moveSign, rotateAtoms, setSign, setSignKind, signKind } from "./edit.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { parse, serialize } from "./file.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";

type P = [number, number];
const pt = 4 / 3;
const S = { bond: 14.4 * pt, line: 0.6 * pt, bold: 2 * pt, spacing: 0.18 * 14.4 * pt, hash: 2.5 * pt, margin: 1.69 * pt, size: 10 * pt };
const box: P[] = [];
for (let i = 0; i <= 20; i++) { const f = i / 20; box.push([9.6 * f, 0], [9.6 * f, -9.5], [0, -9.5 * f], [9.6, -9.5 * f]); }
const ink = (): Ink => ({ width: 9.6, ascent: 9.5, outline: box });
const L = S.bond, near = (a: number, b: number, e = 0.05) => Math.abs(a - b) <= e;
const mid = (b?: [number, number, number, number]): P => (b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [NaN, NaN]);
// A chain C–C–X with X's charge and look.
const chain = (label: string, more: Partial<Atom>): Mol => ({ atoms: [{ label: "C", location: [0, 0, 0] }, { label: "C", location: [0.866, 0.5, 0] }, { label, location: [1.732, 0, 0], ...more }], bonds: [{ type: 1, atoms: [0, 1] }, { type: 1, atoms: [1, 2] }] });
const target = (at: P, x = 1.732, y = 0): P => [(x + at[0]) * L, -(y + at[1]) * L];

// D1. Drawing: every charge kind goes to its own place, in its own colour and size; the default place is unchanged.
{
  for (const [label, more] of [["C", { charge: 1 }], ["N", { charge: 1 }], ["N", { charge: 2 }], ["C", { charge: -2, circled: true as const }], ["N", { charge: -1, circled: true as const }], ["C", { charge: 1, radical: 1 }], ["O", { charge: -1, radical: 1 }]] as [string, Partial<Atom>][]) {
    const name = `${label} ${JSON.stringify(more)}`, plain = render(chain(label, more), S, ink);
    assert.ok(plain.charges?.[2], `${name}: the charge has a box`);
    assert.deepEqual(render(chain(label, { ...more, sign: {} }), S, ink).polygons, plain.polygons, `${name}: an empty look draws as none`);
    const d = render(chain(label, { ...more, sign: { at: [1, 1], colour: "#cc0000", size: 2 } }), S, ink), c = mid(d.charges?.[2]), t = target([1, 1]);
    assert.ok(near(c[0], t[0], 0.6) && near(c[1], t[1], 0.6), `${name}: the charge's middle is at its place (${c} against ${t})`);
    const wide = (x: typeof d) => x.charges![2]![2] - x.charges![2]![0];
    assert.ok(near(wide(d) / wide(plain), 2, 0.15), `${name}: twice the size (${wide(d) / wide(plain)})`);
    const red = d.labels.filter((l) => l.colour === "#cc0000"), redPolys = d.colours.filter((x) => x === "#cc0000").length;
    assert.ok(red.length + redPolys > 0, `${name}: drawn in its own colour`);
    assert.ok(d.labels.every((l) => l.colour !== "#cc0000" || /^[\d+–−]+$/.test(l.text)), `${name}: only the charge takes it`);
    assert.ok(d.electrons.some((e) => e.atom === 2 && e.key === "charge" && near(e.at[0], t[0], 0.4 * L) && near(e.at[1], t[1], 0.4 * L)), `${name}: a drag starts at its place`);
  }
  // A label's sign at its own place is not part of the label: the label's box is the uncharged label's.
  const n = render(chain("N", {}), S, ink), placed = render(chain("N", { charge: 1, sign: { at: [0, 1.5] } }), S, ink), after = render(chain("N", { charge: 1 }), S, ink);
  assert.deepEqual(placed.label[2], n.label[2], "a placed sign leaves the label's box as it is");
  assert.notDeepEqual(after.label[2], n.label[2], "a sign after the label is in its box");
  // A turned label leaves a placed sign where it is.
  const turned = render(chain("N", { charge: 1, labelAngle: 40, sign: { at: [0, 1.5] } }), S, ink);
  assert.deepEqual(mid(turned.charges?.[2]), mid(placed.charges?.[2]), "a turned label keeps the placed sign still");
  // A scaled atom: the place is in its own bond lengths.
  const big = render(chain("C", { charge: 1, scale: 2, sign: { at: [1, 0] } }), S, ink), cb = mid(big.charges?.[2]);
  assert.ok(near(cb[0], (1.732 + 2) * L, 0.6), "a scaled atom's charge goes out at its scale");
}
console.log("chargesign.check: drawing ok");

// E1. Edits: the drag, its limit and steps, the colour and size, the kind buttons, Delete, turns and flips.
{
  const m = chain("N", { charge: 1, angles: { charge: 30, pair0: 90 } });
  const moved = moveSign(m, 2, [1.732 + 1, 1], false);
  assert.deepEqual(moved.atoms[2].sign?.at, [1, 1]);
  assert.deepEqual(moved.atoms[2].angles, { pair0: 90 }, "the old angle goes, the other marks keep theirs");
  const far = moveSign(m, 2, [1.732 + 30, 40], false).atoms[2].sign!.at!;
  assert.ok(near(Math.hypot(...far), SIGN_REACH, 1e-3) && near(far[1] / far[0], 4 / 3, 1e-3), "no further than the limit, the same way");
  const snapped = moveSign(m, 2, [1.732 + 1, 0.2], true).atoms[2].sign!.at!;
  assert.ok(near((Math.atan2(snapped[1], snapped[0]) * 180) / Math.PI, 15, 0.01), "Fixed Angles: 15° steps");
  const scaled = moveSign(chain("N", { charge: 1, scale: 2 }), 2, [1.732 + 2, 0], false).atoms[2].sign!.at!;
  assert.deepEqual(scaled, [1, 0], "the place is in the atom's own bond lengths");
  let c = setSign(moved, 2, { colour: "#CC0000", size: 2 });
  assert.deepEqual(c.atoms[2].sign, { at: [1, 1], colour: "#cc0000", size: 2 });
  assert.deepEqual(setSign(c, 2, { colour: "#000000" }).atoms[2].sign, { at: [1, 1], size: 2 }, "black clears the colour");
  assert.equal(setSign(chain("N", { charge: 1, colour: "#00ff00" }), 2, { colour: "#00FF00" }).atoms[2].sign, undefined, "the atom's colour is no colour of its own");
  assert.equal(setSign(c, 2, { size: 99 }).atoms[2].sign?.size, 5, "the size stops at 5");
  assert.equal(setSign(c, 2, { size: 0.01 }).atoms[2].sign?.size, 0.2, "and at 0.2");
  assert.deepEqual(setSign(c, 2, { size: 1 }).atoms[2].sign, { at: [1, 1], colour: "#cc0000" }, "1 clears the size");
  assert.equal(setSign(chain("N", {}), 2, { size: 2 }).atoms[2].sign, undefined, "no charge: no look");
  // The kind buttons keep the number and the look.
  const two = chain("C", { charge: 2, sign: { colour: "#cc0000" } });
  assert.equal(signKind(two.atoms[2]), "plus");
  assert.deepEqual([setSignKind(two, 2, "circledMinus").atoms[2].charge, setSignKind(two, 2, "circledMinus").atoms[2].circled], [-2, true]);
  assert.equal(setSignKind(two, 2, "circledMinus").atoms[2].sign?.colour, "#cc0000", "a new kind keeps the colour");
  assert.equal(setSignKind(two, 2, "pair"), two, "not a charge kind: nothing");
  const ion = chain("C", { charge: 1, radical: 1 });
  assert.equal(signKind(ion.atoms[2]), "radicalCation");
  assert.equal(setSignKind(ion, 2, "radicalAnion").atoms[2].charge, -1);
  assert.equal(setSignKind(chain("C", { charge: 2 }), 2, "radicalAnion").atoms[2].charge, 2, "a radical ion kind only on a radical ion");
  // The charge items on the picked charge (Editor: keyCharges on its atom).
  assert.equal(keyCharges(c, [2], [], "plus").atoms[2].charge, 2);
  assert.equal(keyCharges(c, [2], [], "circled").atoms[2].circled, true);
  // Delete: the atom loses the charge and its look; the radical stays.
  const gone = dropCharge(c, 2).atoms[2];
  assert.deepEqual([gone.charge, gone.circled, gone.sign, gone.angles], [undefined, undefined, undefined, { pair0: 90 }]);
  assert.equal(dropCharge(ion, 2).atoms[2].radical, 1);
  // Turned and flipped with the atom.
  const t = rotateAtoms(c, new Set([0, 1, 2]), 90).atoms[2].sign!.at!;
  assert.ok(near(t[0], -1, 1e-3) && near(t[1], 1, 1e-3), `a quarter turn turns the place (${t})`);
  const fh = flipAtoms(c, new Set([0, 1, 2]), "horizontal").atoms[2].sign!.at!, fv = flipAtoms(c, new Set([0, 1, 2]), "vertical").atoms[2].sign!.at!;
  assert.ok(near(fh[0], -1, 1e-3) && near(fh[1], 1, 1e-3), `a horizontal flip (${fh})`);
  assert.ok(near(fv[0], 1, 1e-3) && near(fv[1], -1, 1e-3), `a vertical flip (${fv})`);
  assert.equal(rotateAtoms(c, new Set([0, 1]), 90).atoms[2].sign, c.atoms[2].sign, "an atom not turned keeps it");
  // On a coloured atom, black is a colour of its own; the atom's colour still clears it.
  const green = setSign(chain("N", { charge: 1, colour: "#00ff00" }), 2, { colour: "#000000" });
  assert.equal(green.atoms[2].sign?.colour, "#000000", "a green atom's charge can be black");
  const dg = render(green, S, ink);
  assert.ok(dg.labels.some((l) => l.colour === "#000000" && /^[+]$/.test(l.text)) && !dg.labels.some((l) => l.colour === "#00ff00" && /\+/.test(l.text)), "and draws black");
  assert.equal(setSign(green, 2, { colour: "#00ff00" }).atoms[2].sign, undefined, "the atom's colour clears it");
  // A charge taken to 0 another way loses its look too, so a new charge starts at the usual place.
  assert.equal(keyCharges(chain("N", { charge: 1, sign: { at: [1, 1] } }), [2], [], "minus").atoms[2].sign, undefined, "− to 0");
  assert.equal(addSymbol(chain("C", { charge: 1, radical: 1, sign: { at: [1, 1] } }), 2, "radicalCation").atoms[2].sign, undefined, "the radical cation taken off");
  // A radical moved off its charge is drawn as a dot and a sign: the kind buttons show a plain charge.
  assert.equal(signKind(chain("C", { charge: 1, radical: 1, angles: { radical0: 90 } }).atoms[2]), "plus");
  // A large charge is taken at its edge.
  const bigSign = chain("C", { charge: 1, sign: { at: [1, 0], size: 5 } }), edge: P = [1.732 + 1 + 0.6, 0];
  assert.equal(markNear(render(bigSign, S, ink).electrons, bigSign, edge, L)?.mark, "charge", "a size 5 charge at its edge");
  const usual = chain("C", { charge: 1, sign: { at: [1, 0] } });
  assert.equal(markNear(render(usual, S, ink).electrons, usual, edge, L), undefined, "a usual one not so far out");
}
// E2. A charge dragged to the limit, every degree round: its place is kept by every file and by turns (it is never
// stored past the limit).
{
  const lost: string[] = [];
  for (let d = 0; d < 360; d++) {
    const t = (d * Math.PI) / 180, m = moveSign(chain("C", { charge: 1 }), 2, [1.732 + 10 * Math.cos(t), 10 * Math.sin(t)], false), at = m.atoms[2].sign!.at!;
    if (Math.hypot(...at) > SIGN_REACH) lost.push(`${d}°: stored past the limit`);
    if (!parse(serialize(m)).atoms[2].sign?.at) lost.push(`${d}°: .oct JSON`);
    if (!fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol.atoms[2].sign?.at) lost.push(`${d}°: CDXML`);
    if (!readCdx(writeCdx(m, DEFAULT_STYLE)).mol.atoms[2].sign?.at) lost.push(`${d}°: CDX`);
    if (d % 10 === 0 && !fromCdxml(toCdxml(m, DEFAULT_STYLE).replace(/\sOctet="[^"]*"/g, "")).mol.atoms[2].sign?.at) lost.push(`${d}°: ChemDraw's file`);
    const turned = rotateAtoms(m, new Set([0, 1, 2]), d + 0.37).atoms[2].sign?.at;
    if (!turned || Math.hypot(...turned) > SIGN_REACH || !parse(serialize(rotateAtoms(m, new Set([0, 1, 2]), d + 0.37))).atoms[2].sign?.at) lost.push(`${d}°: turned`);
  }
  assert.deepEqual(lost, [], "a charge at the limit keeps its place");
  // Just past the limit (a coordinate written to fewer places) comes back to it; clearly past is refused.
  const just = parse(serialize(chain("N", { charge: 1, sign: { at: [3.00002, 0.00003] } }))).atoms[2].sign?.at;
  assert.ok(just && Math.hypot(...just) <= SIGN_REACH && near(just[0], 3, 1e-3), `just past the limit (${just})`);
}
console.log("chargesign.check: edits ok");

// F1. Files: .oct JSON, CDXML, CDX and .oct keep it exactly; the charge still counts; old files read as before.
{
  const look = { at: [1, 1] as P, colour: "#cc0000", size: 2 };
  const kinds: Partial<Atom>[] = [{ charge: 1 }, { charge: -2, circled: true }, { charge: 1, radical: 1 }, { charge: -1, circled: true }];
  for (const label of ["C", "N"]) for (const more of kinds) {
    const m = chain(label, { ...more, sign: look }), name = `${label} ${JSON.stringify(more)}`;
    assert.deepEqual(parse(serialize(m)).atoms[2].sign, look, `${name}: .oct JSON`);
    const x = toCdxml(m, DEFAULT_STYLE), back = fromCdxml(x).mol.atoms[2];
    assert.deepEqual([back.charge, back.sign], [more.charge, look], `${name}: CDXML`);
    assert.deepEqual(readCdx(writeCdx(m, DEFAULT_STYLE)).mol.atoms[2].sign, look, `${name}: CDX`);
    assert.deepEqual(readOct(writeOct(m, DEFAULT_STYLE), true).mol.atoms[2].sign, look, `${name}: .oct`);
    // As ChemDraw sees it: a Symbol linked to the node by represent, at the place, in the colour, the size its length.
    const sym = [...x.matchAll(/<graphic\s[^>]*GraphicType="Symbol"[^>]*>(?:(?!<\/graphic>)[\s\S])*<\/graphic>/g)].map((g) => g[0]).find((g) => /attribute="Charge"/.test(g));
    if (label === "N" && Math.abs(more.charge!) === 2 && !more.circled) continue;
    assert.ok(sym, `${name}: a linked charge symbol`);
    // Without Octet's data, as a file ChemDraw saved: the place, colour and size read back from the symbol.
    const cd = fromCdxml(x.replace(/\sOctet="[^"]*"/g, "")).mol.atoms[2];
    assert.equal(cd.charge, more.charge, `${name}: ChemDraw's file keeps the charge`);
    assert.equal(cd.sign?.colour, "#cc0000", `${name}: ChemDraw's file: the colour`);
    assert.ok(near(cd.sign?.size ?? 1, 2, 0.02), `${name}: ChemDraw's file: the size (${cd.sign?.size})`);
    assert.ok(cd.sign?.at && near(cd.sign.at[0], 1, 0.02) && near(cd.sign.at[1], 1, 0.02), `${name}: ChemDraw's file: the place (${cd.sign?.at})`);
  }
  // A label's 2+ stays in the label's text (a symbol holds one charge), in the charge's colour.
  const n2 = toCdxml(chain("N", { charge: 2, sign: { colour: "#cc0000" } }), DEFAULT_STYLE);
  assert.match(n2, /<s\s[^>]*color="(\d+)"[^>]*>2\+<\/s>/, "the 2+ run has its own colour");
  assert.deepEqual(fromCdxml(n2).mol.atoms[2].sign, { colour: "#cc0000" });
  // A label's 2+ at its own place stays in the text too, with no second sign as a symbol.
  const n2at = toCdxml(chain("N", { charge: 2, sign: { at: [0, 1.5], colour: "#cc0000" } }), DEFAULT_STYLE);
  assert.match(n2at, />2\+<\/s>/, "the 2+ is in the label");
  assert.doesNotMatch(n2at, /SymbolType="(Plus|Minus)"/, "and is not a symbol as well");
  // A label's sign in a colour of its own, from a file ChemDraw saved (no Octet data): the colour comes back.
  for (const charge of [1, -1, 2, -2]) {
    const x = toCdxml(chain("N", { charge, sign: { colour: "#cc0000" } }), DEFAULT_STYLE).replace(/\sOctet="[^"]*"/g, ""), back = fromCdxml(x).mol.atoms[2];
    assert.deepEqual([back.charge, back.sign, back.colour], [charge, { colour: "#cc0000" }, undefined], `N ${charge}: the label's sign keeps its colour`);
  }
  const gx = toCdxml(chain("N", { charge: 1, colour: "#00ff00", sign: { colour: "#000000" } }), DEFAULT_STYLE).replace(/\sOctet="[^"]*"/g, ""), gb = fromCdxml(gx).mol.atoms[2];
  assert.deepEqual([gb.colour?.toLowerCase(), gb.sign], ["#00ff00", { colour: "#000000" }], "a green N's black sign");
  // No charge: nothing of the look is written.
  const none = chain("N", { sign: look });
  assert.equal(parse(serialize(none)).atoms[2].sign, undefined);
  assert.doesNotMatch(toCdxml(none, DEFAULT_STYLE), /sign/);
  // A ChemDraw file's charge at its own default distance keeps only its angle, as before; further out keeps its place.
  const plain = toCdxml(chain("C", { charge: 1 }), DEFAULT_STYLE).replace(/\sOctet="[^"]*"/g, "");
  const p0 = fromCdxml(plain).mol.atoms[2];
  assert.equal(p0.sign, undefined, "a sign where ChemDraw puts one: no look of its own");
  assert.ok(p0.angles?.charge !== undefined, "its angle, as in 1.1.2");
  // Old files (1.1.2): no sign anywhere, and they read the same.
  const old = serialize(chain("N", { charge: 1, angles: { charge: 45 } }));
  assert.deepEqual(parse(old).atoms[2], { label: "N", location: [1.732, 0, 0], charge: 1, angles: { charge: 45 } });
}
console.log("chargesign.check: files ok");

// H1. Hostile values: each refused, never clamped from a file; the drawing still opens.
{
  const json = (sign: unknown) => { const o = JSON.parse(serialize(chain("N", { charge: 1 }))); o.structure.atoms[2].sign = sign; return JSON.stringify(o).replace("1e+308", "1e308"); };
  for (const bad of [{ at: [3.5, 0] }, { at: [NaN, 0] }, { at: [1] }, { at: "1,1" }, { size: 0 }, { size: 1e9 }, { size: -1 }, { colour: "red" }, { colour: "#12" }, { colour: "#cc0000\"><x" }, null, 7, "x", []]) {
    const s = json(bad);
    if (!s.includes(`"sign"`)) throw new Error("the stand-in file has no sign");
    assert.equal(parse(s).atoms[2].sign, undefined, `refused: ${JSON.stringify(bad)}`);
  }
  assert.deepEqual(parse(json({ at: [1, 1], size: 9, colour: "#00ff00" })).atoms[2].sign, { at: [1, 1], colour: "#00ff00" }, "the good values stay, the bad one goes");
  const x = toCdxml(chain("N", { charge: 1, sign: { at: [1, 1] } }), DEFAULT_STYLE).replace(/&quot;at&quot;:\[1,1\]/, "&quot;at&quot;:[1e308,1]");
  assert.equal(fromCdxml(x).mol.atoms[2].sign, undefined, "CDXML: a place out of reach is refused");
}
console.log("chargesign.check: hostile values ok");

// U1. The Editor and the Actions panel: the pick, the drag, the colour, size, kind, charge items and Delete.
{
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), actions = readFileSync(new URL("Actions.tsx", import.meta.url), "utf8");
  assert.match(editor, /if \(drag\.key === "charge" && tool === "select" && !pressMods\.current\?\.shift && !pressMods\.current\?\.alt\)/, "a click or drag on a charge picks it");
  assert.match(editor, /moveSign\(drag\.base, drag\.atom, \[drag\.mid\[0\] \+ p\[0\] - drag\.from\[0\], drag\.mid\[1\] \+ p\[1\] - drag\.from\[1\]\], settings\.fixedAngles && !e\.altKey\)/, "the drag keeps the grab point");
  assert.equal(editor.match(/from: p, mid: chargeMid\(mark\.atom\)/g)?.length, 2, "both presses on a mark");
  assert.match(editor, /return \{ kind: "shape", attached: true, count: 1, shape: "symbol", symbol: ownKind,/, "its context");
  for (const c of ["colour.", "caption.size.", "shape.symbol."]) assert.ok(editor.includes(`if (command.startsWith("${c}")`), `${c} on the picked charge`);
  assert.match(editor, /if \(command === "delete"\) \{ setSignPick\(undefined\); return set\(dropCharge\(doc, signPick\)\); \}/);
  assert.match(editor, /if \(signPick !== undefined && !selection\.size && !picked\.size && doc\.atoms\[signPick\]\?\.charge\) \{ setSignPick\(undefined\); return set\(dropCharge\(doc, signPick\)\); \}/, "the Delete key");
  assert.match(editor, /keyCharges\(doc, signPick !== undefined && !ids\.length && !picked\.size \? \[signPick\] : ids,/, "the charge items");
  assert.match(editor, /context\.kind === "shape" && !context\.attached && doc\.shapes\?\.every/, "the colour menu shows its colour");
  assert.match(actions, /if \(context\.attached\) \{/);
}
console.log("chargesign.check: the Editor's wiring ok");

// T1. Speed: a drawing of 600 charged atoms, plain and with their own looks, draws in about the same time.
{
  const many = (sign?: Atom["sign"]): Mol => ({ atoms: Array.from({ length: 600 }, (_, i) => ({ label: i % 3 ? "C" : "N", location: [i % 30, Math.floor(i / 30), 0] as [number, number, number], charge: i % 2 ? 1 : -1, ...(i % 5 ? {} : { circled: true as const }), ...(sign ? { sign } : {}) })), bonds: Array.from({ length: 599 }, (_, i) => ({ type: 1, atoms: [i, i + 1] as [number, number] })).filter((b) => b.atoms[1] % 30) });
  const time = (m: Mol) => { const t0 = performance.now(); for (let k = 0; k < 5; k++) render(m, S, ink); return (performance.now() - t0) / 5; };
  time(many()); time(many({ at: [0.5, 0.5] }));
  const a = Math.min(time(many()), time(many())), b = Math.min(time(many({ at: [0.5, 0.5], colour: "#cc0000", size: 1.5 })), time(many({ at: [0.5, 0.5], colour: "#cc0000", size: 1.5 })));
  console.log(`chargesign.check: 600 charges ${a.toFixed(1)} ms, with their own looks ${b.toFixed(1)} ms`);
  assert.ok(b < a * 1.5 + 5, "own looks draw no slower than half as much again");
}
