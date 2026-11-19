// Run: node src/circledcharges.check.ts. Issue 60, part A: the document option Circle new charges, and the charge
// rules every route keeps (plan docs/plans/issue-60-circled-charges.md, J1 to J4, S1 to S5).
// R1: each atom keeps the look it was drawn with. R2: only a charge that starts from 0 takes the document's look, and
// at 0 the look goes too. R5: charges run from -8 to +8 from every route.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_STYLE, forPurpose, purposeStyle, readPurposes, readStyle, sameStyle, type DocStyle } from "./docstyle.ts";
import { addCharge, addSymbol, chargeLook, chargesOf, circleCharges, keyCharge, scaleSizes } from "./edit.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { parse, serialize } from "./file.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import type { Atom, Mol } from "./render.ts";

const atom = (label: string, x = 0, more: Partial<Atom> = {}): Atom => ({ label, location: [x, 0, 0], ...more });
const one = (a: Atom): Mol => ({ atoms: [a], bonds: [] });
const look = (m: Mol, i = 0) => [m.atoms[i].charge, m.atoms[i].circled];
const ON: DocStyle = { ...DEFAULT_STYLE, circled: true };

// J1. Charges stop at ±8 from the keys, the Actions panel and the Symbols tool (F1), and the circle goes at 0 (F2).
{
  let m = one(atom("N"));
  for (let k = 0; k < 10; k++) m = addCharge(m, 0, 1);
  assert.deepEqual(look(m), [8, undefined], "ten presses of + stop at +8");
  assert.equal(addCharge(m, 0, 1), m, "+ at +8 changes nothing, so it makes no undo step");
  let n = one(atom("O"));
  for (let k = 0; k < 12; k++) n = keyCharge(n, 0, "minus");
  assert.deepEqual(look(n), [-8, undefined], "the - key stops at -8");
  let c = one(atom("N"));
  for (let k = 0; k < 10; k++) c = addSymbol(c, 0, "circledPlus");
  assert.deepEqual(look(c), [8, true], "the Symbols tool's Circled positive stops at +8");
  assert.equal(addSymbol(c, 0, "circledPlus"), c, "and then changes nothing");
  assert.deepEqual(look(addSymbol(c, 0, "plus")), [8, undefined], "at +8 Positive charge still takes the circle off (the tool's look wins)");
  // F2: − on a circled +1 leaves no circle behind, so the next plain + is plain (S2).
  const circledOne = keyCharge(one(atom("N")), 0, "circledPlus"), zero = keyCharge(circledOne, 0, "minus");
  assert.deepEqual(look(circledOne), [1, true]);
  assert.deepEqual(look(zero), [undefined, undefined], "at 0 the circle goes too");
  assert.deepEqual(look(keyCharge(zero, 0, "plus")), [1, undefined], "S2: the next + with the option off is plain");
  // Every charge key route saves a file that opens from its JSON (no "damaged" file from +10).
  const back = parse(serialize(m));
  assert.equal(back.atoms[0].charge, 8);
  // S1: + held down on 20 selected atoms stops each at +8, and the drawing saves and opens.
  let many: Mol = { atoms: Array.from({ length: 20 }, (_, i) => atom("N", i)), bonds: [] };
  for (let k = 0; k < 30; k++) many = many.atoms.reduce((x, _, i) => keyCharge(x, i, "plus", true), many);
  assert.ok(many.atoms.every((a) => a.charge === 8 && a.circled), "S1: 20 atoms, + held: all circled +8 with the option on");
  assert.deepEqual(parse(serialize(many)).atoms.map((a) => a.charge), many.atoms.map(() => 8));
}
console.log("circledcharges.check: ±8 and the circle cleared at 0 ok");

// J3. R2: a charge from 0 takes the document's look; a charge there keeps its own look as it goes up or down.
{
  const n = one(atom("N")), plain = addCharge(n, 0, 1), circled = addCharge(n, 0, 1, true);
  assert.deepEqual(look(circled), [1, true], "with the option on, + on N gives a circled +1");
  assert.deepEqual(look(addCharge(plain, 0, 1, true)), [2, undefined], "with it on, + on a plain +1 gives a plain +2");
  assert.deepEqual(look(addCharge(circled, 0, 1, false)), [2, true], "with it off, + on a circled +1 gives a circled +2");
  assert.deepEqual(look(addCharge(circled, 0, -1, true)), [undefined, undefined], "back to 0: the look goes");
  assert.deepEqual(look(keyCharge(n, 0, "minus", true)), [-1, true], "the - key in the document's look");
  assert.deepEqual(look(keyCharge(n, 0, "plus", false)), [1, undefined], "off: as in 1.1.2");
  // The Symbols tool says its own look and does not read the option (R3): addSymbol takes no option at all.
  assert.deepEqual(look(addSymbol(n, 0, "plus")), [1, undefined]);
  // Atom Properties' Charge field (chargeLook): a new charge in the document's look, one there kept, 0 clears it.
  assert.deepEqual(chargeLook({}, 3, true), { charge: 3, circled: true });
  assert.deepEqual(chargeLook({ charge: 1 }, 3, true), { charge: 3, circled: undefined });
  assert.deepEqual(chargeLook({ charge: 1, circled: true }, 2, false), { charge: 2, circled: true });
  assert.deepEqual(chargeLook({ charge: 2, circled: true }, 0, true), { charge: undefined, circled: undefined, sign: undefined });
}
console.log("circledcharges.check: new charges take the document's look ok");

// J4. Circle the charge: every charged atom picked (and free charge) takes a circle, or all lose it when all have one.
// Only the look changes. An atom with no charge is left alone; nothing charged gives the drawing back.
{
  const m: Mol = { atoms: [atom("N", 0, { charge: 1 }), atom("O", 1, { charge: -2, circled: true }), atom("C", 2)], bonds: [] };
  const on = circleCharges(m, [0, 1, 2], []);
  assert.deepEqual(on.atoms.map((a) => [a.charge, a.circled]), [[1, true], [-2, true], [undefined, undefined]], "a mix: all charges take the circle");
  const off = circleCharges(on, [0, 1, 2], []);
  assert.deepEqual(off.atoms.map((a) => [a.charge, a.circled]), [[1, undefined], [-2, undefined], [undefined, undefined]], "all circled: all lose it");
  assert.equal(circleCharges(m, [2], []), m, "no charge picked: nothing changes");
  assert.deepEqual(chargesOf(m, [0, 1, 2], []), { circled: false });
  assert.deepEqual(chargesOf(on, [0, 1], []), { circled: true });
  assert.equal(chargesOf(m, [2], []), undefined, "nothing to circle: no item in the Actions panel");
  assert.deepEqual(look(keyCharge(m, 0, "circled")), [1, true], "the charge.circled key on one atom");
  assert.equal(keyCharge(m, 2, "circled"), m, "and on an atom with no charge, nothing");
}
console.log("circledcharges.check: Circle the charge ok");

// J2. The option is the document's: read and written with the style, off by default, through .oct, CDXML and CDX,
// and kept by Use for new documents and a new purpose.
{
  assert.equal(DEFAULT_STYLE.circled, undefined, "ACS 1996 is plain: off for new documents");
  assert.equal(readStyle({ circled: true }).circled, true);
  for (const bad of ["yes", 1, false, null, {}]) assert.equal(readStyle({ circled: bad }).circled, undefined, `circled ${JSON.stringify(bad)} reads as off`);
  assert.equal(sameStyle(ON, DEFAULT_STYLE), false, "the option makes a style differ");
  assert.equal(sameStyle({ ...DEFAULT_STYLE, circled: undefined }, DEFAULT_STYLE), true, "off is off, set or unset");
  assert.equal(forPurpose(ON, purposeStyle("slides")).circled, true, "a new purpose keeps it, as the rest of the drawing's choices");
  assert.equal(readPurposes({ purposeStyles: { paper: ON } }).purposeStyles.paper?.circled, true, "Use for new documents keeps it");
  const m: Mol = { atoms: [atom("N", 0, { charge: 1 }), atom("O", 2, { charge: -1, circled: true })], bonds: [], style: ON };
  assert.equal(parse(serialize(m)).style?.circled, true, ".oct JSON");
  assert.equal(parse(serialize({ ...m, style: DEFAULT_STYLE })).style?.circled, undefined);
  const x = toCdxml(m, ON);
  assert.match(x, /Octet="[^"]*&quot;circled&quot;:1/, "the CDXML root's Octet data says circled");
  assert.equal(fromCdxml(x).style.circled, true, "CDXML");
  assert.equal(fromCdxml(toCdxml(m, DEFAULT_STYLE)).style.circled, undefined);
  const oct = readOct(writeOct(m, ON), true);
  assert.equal(oct.mol.style?.circled, true, ".oct");
  assert.deepEqual(readCdx(writeCdx(m, ON)).mol.style?.circled, true, ".cdx");
  // S4: a drawing keeps its own option, whatever new drawings use: the option lives in the file, not in Settings.
  assert.equal(readOct(writeOct({ ...m, style: DEFAULT_STYLE }, DEFAULT_STYLE), true).mol.style?.circled, undefined);
  // S5: a file ChemDraw saved (no Octet data): the option is off, and every atom keeps its circled or plain look.
  const resaved = fromCdxml(x.replace(/\sOctet="[^"]*"/g, ""));
  assert.equal(resaved.style.circled, undefined, "ChemDraw has no such setting: off");
  assert.deepEqual(resaved.mol.atoms.map((a) => [a.charge, !!a.circled]), [[1, false], [-1, true]], "R1: each atom's look is kept");
  // S3: turning the option on or off changes no atom: Settings changes the style alone (the Editor's onStyle keeps
  // the drawing at the same scale), and each change is one set, so one undo step.
  const hundred: Mol = { atoms: Array.from({ length: 100 }, (_, i) => atom("N", i, { charge: i % 2 ? 1 : -1, ...(i % 3 ? { circled: true as const } : {}) })), bonds: [], style: DEFAULT_STYLE };
  let doc = hundred;
  for (let k = 0; k < 10; k++) { const next = { ...doc.style!, circled: doc.style!.circled ? undefined : (true as const) }; doc = { ...scaleSizes(doc, 1), style: next }; }
  assert.deepEqual(doc.atoms, hundred.atoms, "S3: ten turns of the option change no atom");
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8"), settings = readFileSync(new URL("SettingsWindow.tsx", import.meta.url), "utf8");
  assert.match(settings, /d\("document", "Style", "Circle new charges", "[^"]+", <Switch on=\{!!style\.circled\} label="Circle new charges" onChange=\{\(on\) => change\(\{ circled: on \|\| undefined \}\)\} \/>\)/, "the Settings switch, under Hide implicit hydrogens");
  // (A change of Sequences draws the chains again with the style, in one set too: helm.ts withSequences, issue 27.)
  assert.match(editor, /onStyle=\{\(next\) => \(madeTemplate \? changeTemplate\(madeTemplate\.id, \{ style: next \}\) : next\.sequences && next\.sequences !== \(seqLabels \? "labels" : "atoms"\) \? setSequences\(next\.sequences, next\) : set\(\{ \.\.\.scaleSizes\(doc, next\.scale \/ style\.scale\), style: next \}, true\)\)\}/, "a style change is one set");
}
console.log("circledcharges.check: the document option in files and Settings ok");

// D7: every charge edit on an atom passes the document's option. The Symbols tool does not (R3).
{
  const editor = readFileSync(new URL("Editor.tsx", import.meta.url), "utf8");
  assert.equal(editor.match(/keyCharge\(\w+, \w+, arg, !!style\.circled\)/g)?.length, 2, "the key on an atom and on a selection of atoms");
  // A selection with free charges, and the Actions panel and run_command, step atoms and free charges together.
  assert.equal(editor.match(/keyCharges\(doc, [^;]*, picked, \w+\.slice\(7\), !!style\.circled\)/g)?.length, 2, "the key on a selection with free charges, and the Actions panel and run_command");
  // S21: + over a Nu, E or Rh caption (fix/164) makes it the atom with a charge in the document's look, in one step.
  assert.match(editor, /if \(made\) return set\(keyCharge\(made, doc\.atoms\.length, arg, !!style\.circled\), false, key\);/, "the key on a stand-in caption");
  assert.match(editor, /\.\.\.chargeLook\(x, charge, !!style\.circled\)/, "Atom Properties");
  assert.match(editor, /set\(addSymbol\(doc, t\.atom, symbolKind, pressAlt\.current, settings\.pairBars\)\)/, "the Symbols tool, unchanged");
  assert.doesNotMatch(editor, /addCharge\(doc, i, command === "charge\.plus"/, "the Actions panel's charge items go through the same route as run_command");
}
console.log("circledcharges.check: every route takes the option ok");

// The MCP's routes to the option and the circle (set_style circled_charges, edit charge and circled, read) are in
// freecharge.check.ts, with the free charge's, against one stand-in for the editor.
