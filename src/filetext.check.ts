// Run: node src/filetext.check.ts. Issues 103 and 104 (docs/plans/issue-103-104-old-formats.md, jobs J1 and J3). Fails
// loudly if text Octet reads itself (CIF and mmCIF) does not read the same on every way in: File > Open, a drop, a
// paste, the name field and an AI app's add_file. Or if a reader's own reason for a refusal (a limit, a damaged file)
// does not reach the user while Indigo's words do, if the test costs a paste or the name field time, or if a file
// Octet cannot read (an ISIS sketch, ISIS transportable graphics, a ChemNote or ChemDraw 3.5 file) is not refused
// safely. Every file here is written by the check itself. add_file runs here (the headless host). File > Open, a drop,
// a paste and the name field need the page, so this check reads their lines in Editor.tsx; the plan's acceptance list
// has the dev-server paste.
import "../scripts/headless/browser.ts"; // (chem.ts loads Indigo as a browser does)
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { importStructure, isOwnFormat, parseStructure, ready, toMolfile } from "./chem.ts";
import { isCif, readCif } from "./cif.ts";
import { DamagedFile, failure, reason, refusal } from "./notice.ts";
import { alignFragments, duplicateSelection, EMPTY, flipAtoms, fragments, insertMol, rotateAtoms } from "./edit.ts";
import { readCdx, readOct, writeCdx, writeOct } from "./oct.ts";
import { fromCdxml, toCdxml } from "./cdxml.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import type { Mol } from "./render.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const median = (xs: number[]) => [...xs].sort((p, q) => p - q)[xs.length >> 1];
const time = (f: () => unknown, n = 21) => median(Array.from({ length: n }, () => { const t = performance.now(); f(); return performance.now() - t; }));
// A seeded random number in [0, 1), so a failure comes back the same.
let seed = 103104;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)];
await ready;

// --- The files -------------------------------------------------------------------------------------------------------

// Acetic acid from the PDB's Chemical Component Dictionary (mmCIF): ideal coordinates and its bonds.
const ACY = ["data_ACY", "_chem_comp.id ACY", "loop_", ...["comp_id", "atom_id", "type_symbol", "charge", "pdbx_model_Cartn_x_ideal", "pdbx_model_Cartn_y_ideal", "pdbx_model_Cartn_z_ideal"].map((t) => `_chem_comp_atom.${t}`),
  "ACY C C 0 0.000 0.000 0.000", "ACY O O 0 0.605 1.048 0.000", "ACY OXT O 0 0.605 -1.048 0.000", "ACY CH3 C 0 -1.510 0.000 0.000",
  "loop_", ...["comp_id", "atom_id_1", "atom_id_2", "value_order"].map((t) => `_chem_comp_bond.${t}`), "ACY C O DOUB", "ACY C OXT SING", "ACY C CH3 SING", ""].join("\n");
// Ethanol and chloroform from a crystal structure (CIF): a cubic cell of 10 Å, fractional coordinates, two data blocks.
const cell = (name: string, atoms: [string, number, number, number][]) => [`data_${name}`, "_cell_length_a 10", "_cell_length_b 10", "_cell_length_c 10", "_cell_angle_alpha 90", "_cell_angle_beta 90", "_cell_angle_gamma 90",
  "loop_", "_atom_site_label", "_atom_site_fract_x", "_atom_site_fract_y", "_atom_site_fract_z", ...atoms.map(([l, x, y, z]) => `${l} ${((x + 3) / 10).toFixed(5)} ${((y + 3) / 10).toFixed(5)} ${((z + 3) / 10).toFixed(5)}`), ""].join("\n");
const CIF = ["# Written for Octet's checks", "", cell("ethanol", [["C1", 0, 0, 0], ["C2", 1.52, 0, 0], ["O1", 2.0, 1.35, 0]]), cell("chloroform", [["C1", 0, 0, 0], ["Cl1", 1.77, 0, 0], ["Cl2", -0.59, 1.67, 0], ["Cl3", -0.59, -0.83, 1.45]])].join("\n");
const DAMAGED = "data_x\nloop_\n_atom_site_label\n_atom_site_cartn_x\n_atom_site_cartn_y\n_atom_site_cartn_z\nC1 0 0 0\nC2 1.5 0\n";
const OVER = ["data_x", "loop_", "_atom_site_label", "_atom_site_type_symbol", "_atom_site_Cartn_x", "_atom_site_Cartn_y", "_atom_site_Cartn_z", ...Array.from({ length: 1001 }, (_, k) => `C${k} C ${(k % 10) * 1.5} ${Math.floor(k / 10) % 10 * 1.5} ${Math.floor(k / 100) * 1.5}`), ""].join("\n");
// 1,000 carbons 0.5 Å apart in a cube (hostile): each is near hundreds, which would make 77,000 bonds by distance.
const DENSE = OVER.replace(/^C(\d+) C (\S+) (\S+) (\S+)$/gm, (_, k, x, y, z) => `C${k} C ${+x / 3} ${+y / 3} ${+z / 3}`).replace(/^C1000 .*\n/m, "");
const MOLFILE = toMolfile(parseStructure("CC(=O)Oc1ccccc1C(=O)O"), true);
// Paclitaxel, as many times as an SD file holds in just under 300,000 characters, the most Octet reads.
const taxol = toMolfile(parseStructure("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C"), true);
let SDF = "";
while (SDF.length + taxol.length + 5 < 300_000) SDF += `${taxol}$$$$\n`;

// --- Which text is Octet's own ---------------------------------------------------------------------------------------

// Every other format Octet reads is not (D4), CIF and mmCIF are, with Windows and old Mac line ends, a BOM and comments.
const OTHERS: Record<string, string> = {
  "MOL V2000": MOLFILE, "MOL V3000": toMolfile(parseStructure("CCO")), SDF, RXN: "$RXN\n\n  Octet\n\n  1  1\n$MOL\n" + MOLFILE + "$MOL\n" + MOLFILE,
  RDF: "$RDFILE 1\n$DATM 2026\n$RFMT\n$RXN\n\n\n\n  0  0\n", CML: '<?xml version="1.0"?>\n<cml><molecule><atomArray><atom id="a1" elementType="C"/></atomArray></molecule></cml>\n',
  SMILES: "CCO", "SMILES list": "CCO\nc1ccccc1\n", InChI: "InChI=1S/C2H6O/c1-2-3/h3H,2H2,1H3", KET: '{"root":{"nodes":[]}}',
  CDXML: '<?xml version="1.0"?>\n<CDXML><page><fragment/></page></CDXML>\n', "JCAMP-DX": "##TITLE=x\n##JCAMP-DX=4.24\n##DATA TYPE=NMR SPECTRUM\n##END=\n",
  "connection table": "2 1\nC 0 0\nO 1 0\n1 2 1\n", names: "aspirin\nbenzaldehyde\n", "CIF in a comment": "# data_x\n_atom_site_fract_x\n",
};
for (const [what, text] of Object.entries(OTHERS)) assert.ok(!isOwnFormat(text), `${what} is not Octet's own`);
for (const text of [ACY, CIF, CIF.replace(/\n/g, "\r\n"), "﻿" + CIF, "\n\n# a comment\n  " + ACY.replace(/\n/g, "\r\n")]) assert.ok(isOwnFormat(text) && isOwnFormat(text.trim()), "CIF and mmCIF are Octet's own");

// --- A reader's reason (D11) -----------------------------------------------------------------------------------------

const says = (f: () => unknown) => { try { f(); } catch (e) { return e; } assert.fail("refused"); };
console.error = () => {}; // (failure writes each error to the console)
const damaged = says(() => importStructure(DAMAGED)), over = says(() => importStructure(OVER)), tooLong = says(() => importStructure("C".repeat(300_001)));
assert.ok(damaged instanceof DamagedFile);
assert.equal(refusal(damaged), "This CIF file is damaged: a table's last row is short.");
assert.equal(refusal(over), "It has a structure of more than 1,000 atoms.");
assert.equal(refusal(tooLong), "It has more than 300,000 characters.");
// Indigo's own words, and faults, keep the general words.
// The engine's own RangeErrors as V8 and as JavaScriptCore (the Mac app's engine, which ends them with a full stop) word
// them are faults too.
for (const e of [says(() => importStructure("not a structure\nat all\n")), new RangeError("Maximum call stack size exceeded"), new RangeError("Maximum call stack size exceeded."), new RangeError("Array length must be a positive integer of safe magnitude."), new RangeError("Invalid array length"), new Error("This CIF file is damaged: forged."), new TypeError("x is undefined")]) assert.equal(refusal(e), undefined, String(e));
// A damaged file's reason can quote the file: it is never read as a system error, and a long or odd one is not shown.
assert.equal(refusal(new DamagedFile("This CIF file is damaged: the value no such file has no tag.")), "This CIF file is damaged: the value no such file has no tag.");
assert.equal(reason(new Error("no such file")), "The file or folder is not there.");
const quoting = [`data_x\n_atom_site_fract_x 0.1\n_${"t".repeat(300)}\n`, "data_x\n_atom_site_fract_x 0.1\n_atom_site_null\n"].map((t) => says(() => importStructure(t)));
assert.ok(quoting.every((e) => e instanceof DamagedFile));
assert.deepEqual(quoting.map(refusal), [undefined, undefined], "a tag of 300 characters, or one with null in it, is not shown");
// As File > Open (load: failure) and a drop say it.
assert.equal(failure("Octet cannot open this file.", damaged), "Octet cannot open this file. This CIF file is damaged: a table's last row is short.");
assert.equal(failure("Octet cannot open this file.", new Error("Octet cannot read the structures in this file.")), "Octet cannot read the structures in this file.");

// --- Every way in reads it the same (J1) -----------------------------------------------------------------------------

const editor = read("Editor.tsx"), host = read("../scripts/headless/host.ts"), stdio = read("../scripts/headless/stdio.ts"), mcp = read("mcp.ts");
const body = (src: string, start: string) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf("\n  };\n", i) > 0 ? src.indexOf("\n  };\n", i) : i + 3000); };
// Paste and the name field (structureFromText): text of several lines that is Octet's own goes to importStructure
// before any name or Indigo, and only text of several lines is tested (typing a name costs nothing more).
const fromText = body(editor, "const structureFromText = ");
// (An old Mac file's text has CR line ends only: it is text of several lines too.)
assert.match(fromText, /const s = text\.trim\(\), lines = \/\[\\r\\n\]\/\.test\(s\);/);
assert.match(fromText, /if \(lines && isOwnFormat\(s\)\) \{ try \{ const m = importStructure\(text\); return m\.atoms\.length \? asOpened\(m, text\) : undefined; \} catch \(err\) \{ return why\(err\); \} \}/);
assert.ok(fromText.indexOf("isOwnFormat") < fromText.indexOf("structureFor(") && fromText.indexOf("isOwnFormat") < fromText.indexOf("parseStructure("));
assert.match(fromText, /const why = \(err: unknown\) => \{ const r = refusal\(err\); if \(r\) refused\?\.\(r\); return undefined; \};/);
assert.ok(!/instanceof RangeError/.test(fromText), "the reason goes through refusal");
// File > Open, Finder, a drop on Home, --convert and drawings new (readFile), a drop on a drawing and Insert… (dropFiles),
// and the clipboard's MOL and SMILES: a reader's reason goes as it is.
assert.match(editor, /try \{ mol = importStructure\(text\); \} catch \(e\) \{ throw refusal\(e\) \? e : new Error\("Octet cannot read the structures in this file\."\); \}/);
assert.match(editor, /\} catch \(e\) \{\n\s+const why = refusal\(e\);\n\s+setNotice\(`Octet cannot read the structures in \$\{f\.name\}\.\$\{why \? ` \$\{why\}` : ""\}`\);/);
assert.match(editor, /try \{ frag = asOpened\(importStructure\(source\), source\); \} catch \(err\) \{ frag = undefined; const why = refusal\(err\); if \(why\) refused\(why\); \}/);
// An AI app's add_file, in the window and with no window: a CIF file before names and SMILES, its refusal thrown.
// A CIF file takes no aromatic step there, as File > Open, a drop and a paste take none; a MOL file takes File > Import's.
assert.match(body(editor, "    file: (text) => {"), /const own = isOwnFormat\(text\);\n\s+if \(own \|\| \/V\[23\]000\|\^\\\$RXN\|\^\\\$RDFILE\/m\.test\(text\)\) \{ try \{ const m = importStructure\(text\); return m\.atoms\.length \? asOpened\(m, text, !own\) : undefined; \} catch \(e\) \{ if \(refusal\(e\)\) throw e; return undefined; \} \}\n\s+return structureFromText\(text\);/);
assert.match(host, /if \(isOwnFormat\(text\)\) \{ const m = importStructure\(text\); return m\.atoms\.length \? m : undefined; \}\n\s+return structure\(text\);/);
assert.match(stdio, /catch \(e\) \{ const why = refusal\(e\); if \(why\) return \{ failed: `Octet cannot open this file\. \$\{why\}` \}; \}/);
assert.match(mcp, /name: "add_file",[^\n]*\n\s+description: "Adds a drawing from a file's text: CDXML, MOL, SDF, RXN, CIF, SMILES or InChI\./);
assert.match(mcp, /text: a file's text \(CDXML, CDX in base64, \.oct, MOL, SDF, RXN, CML, CIF, SMILES or InChI\)/);
// No list of extensions decides how text reads (D6): the page has no .skc, .tgf, .msm, .smd or .chm anywhere.
for (const f of ["Editor.tsx", "chem.ts", "cif.ts", "mcp.ts", "../src-tauri/src/open.rs", "../src-tauri/src/main.rs"]) assert.ok(!/\b(skc|tgf|msm|smd|chm)\b/i.test(read(f).split("#[cfg(test)]")[0].replace(/^\s*\/\/.*$/gm, "")), `${f} decides nothing by an old format's extension`);
assert.match(read("../src-tauri/src/open.rs"), /pub const LOSSY: \[&str; 2\] = \["cif", "mmcif"\];/);
assert.match(read("../src-tauri/src/main.rs"), /add_filter\("CIF and mmCIF", &open::LOSSY\)\.blocking_pick_file\(\)[\s\S]{0,400}open::read\(&path, &name\)\.map\(\|text\| Some\(\(name, text\)\)\)/);

// The structures: File > Open's (readCif, through importStructure) on every way in; as a drop and Insert… put them
// in a drawing (insertMol at a point), selected, one change.
const shape = (m: Mol) => ({ atoms: m.atoms.map((a) => [a.label, a.charge ?? 0, a.isotope ?? 0, a.hiddenNumber]), bonds: m.bonds.map((b) => [b.type, ...b.atoms]) });
for (const text of [ACY, CIF]) {
  const own = readCif(text);
  // Windows and old Mac line ends, tabs, trailing spaces and blank lines.
  for (const variant of [text, text.replace(/\n/g, "\r\n"), text.replace(/\n/g, "\r"), text.replace(/ /g, "\t"), text.replace(/\n/g, "   \n"), `\n\n${text}\n\n`]) {
    assert.ok(isOwnFormat(variant));
    assert.deepEqual(shape(importStructure(variant)), shape(own), "line ends, tabs and spaces read as the file does");
  }
  const dropped = insertMol({ ...EMPTY, atoms: [{ label: "C", location: [0, 0, 0] }], bonds: [] }, own, [5, 5]);
  assert.equal(dropped.mol.atoms.length, own.atoms.length + 1);
  assert.deepEqual([...dropped.atoms].sort((p, q) => p - q), own.atoms.map((_, k) => k + 1), "the file's atoms are the ones selected");
}

// --- An AI app's add_file and drawings new (with no window) ----------------------------------------------------------

if (existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) {
  const { load, drawing, session } = await import("../scripts/headless/host.ts");
  const { handle } = await import("./mcp.ts");
  await load();
  type Reply = { result?: { content: { text: string }[]; isError?: boolean }; error?: { message: string } };
  let n = 0;
  const call = async (d: ReturnType<typeof drawing>, args: unknown, who = "filetext"): Promise<Reply> =>
    JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name: "advanced", arguments: { tool: "add_file", args } } }), () => d.host, "1", session("Check", who)));
  const text = (r: Reply) => r.result?.content[0]?.text ?? r.error?.message ?? "";
  // The schema's refusal of text over 1,000,000 characters (mcp.ts str(1_000_000)).
  const SCHEMA = /text.*(1,?000,?000|too long|at most)/i;
  const failed = (r: Reply) => !!(r.error || r.result?.isError);
  for (const file of [ACY, CIF]) {
    const d = drawing(), r = await call(d, { text: file });
    assert.ok(!failed(r), text(r));
    assert.deepEqual(shape(d.host.doc()), shape(readCif(file)), "add_file adds what File > Open opens");
    assert.ok(d.host.command("undo") && d.host.doc().atoms.length === 0, "one undo step");
    assert.ok(d.host.command("redo") && d.host.doc().atoms.length === readCif(file).atoms.length, "and redo");
  }
  // Refusals: the reader's words, the formats named, the schema's limit. The drawing is as it was each time.
  const d = drawing();
  await call(d, { text: "CCO" });
  const was = JSON.stringify(d.host.doc());
  for (const [args, want] of [
    [{ text: DAMAGED }, /^Octet cannot read this file\. This CIF file is damaged: a table's last row is short\./],
    [{ text: OVER }, /^Octet cannot read this file\. It has a structure of more than 1,000 atoms\./],
    [{ text: "" }, /^Octet cannot read this as a drawing\. Give CDXML, a MOL, SDF, RXN or CIF file, SMILES or InChI\./],
    [{ text: "not a structure\nat all\n" }, /^Octet cannot read this as a drawing\. Give CDXML, a MOL, SDF, RXN or CIF file/],
    [{ text: "C".repeat(1_000_001) }, SCHEMA],
    // A MOL file over the 300,000 characters Octet reads: the limit, as in a window (headless structure() lets it through).
    [{ text: SDF + taxol.repeat(2) }, /^Octet cannot read this file\. It has more than 300,000 characters\./],
  ] as const) {
    const r = await call(d, args);
    assert.ok(failed(r), `refused: ${text(r)}`);
    assert.match(text(r), want);
    assert.equal(JSON.stringify(d.host.doc()), was, "the drawing is as it was");
  }
  // Two AI apps at once, each on its own drawing: each gets its own structures, one undo step each.
  const [a, b] = [drawing(), drawing()];
  const both = await Promise.all([call(a, { text: ACY }, "one"), call(b, { text: CIF }, "two")]);
  assert.ok(both.every((r) => !failed(r)), both.map(text).join(" | "));
  assert.deepEqual([shape(a.host.doc()), shape(b.host.doc())], [shape(readCif(ACY)), shape(readCif(CIF))]);
  assert.ok(a.host.command("undo") && !a.host.doc().atoms.length && b.host.command("undo") && !b.host.doc().atoms.length);
  // Twenty in a row (case 13): twenty additions, each clear of the last, twenty undo steps and twenty redo steps.
  const c = drawing();
  for (let k = 0; k < 20; k++) assert.ok(!failed(await call(c, { text: ACY })));
  const groups = fragments(c.host.doc());
  assert.equal(groups.length, 20);
  const boxes = groups.map((g) => { const xs = g.map((i) => c.host.doc().atoms[i].location[0]), ys = g.map((i) => c.host.doc().atoms[i].location[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
  for (let i = 0; i < 20; i++) for (let j = i + 1; j < 20; j++) assert.ok(boxes[i][2] < boxes[j][0] || boxes[j][2] < boxes[i][0] || boxes[i][3] < boxes[j][1] || boxes[j][3] < boxes[i][1], `additions ${i} and ${j} do not overlap`);
  for (let k = 0; k < 20; k++) assert.ok(c.host.command("undo"));
  assert.equal(c.host.doc().atoms.length, 0);
  for (let k = 0; k < 20; k++) assert.ok(c.host.command("redo"));
  assert.equal(fragments(c.host.doc()).length, 20);
} else console.log("filetext.check: add_file skipped (no OPSIN build)");

// --- What a drawing read from CIF does (cases 17 and 18) -------------------------------------------------------------

// Saved as .oct, CDXML and CDX and opened again: the same atoms, charges, isotopes, numbers and coordinates.
const NITRO = cell("nitro", [["C1", 0, 0, 0], ["N1", 1.47, 0, 0], ["O1", 2.08, 1.06, 0], ["O2", 2.08, -1.06, 0]]), charged = readCif(NITRO);
for (const m of [readCif(ACY), readCif(CIF), charged]) {
  const where = (x: Mol) => x.atoms.map((a) => a.location.map((v) => Math.round(v * 100) / 100));
  for (const [what, back] of [[".oct", readOct(writeOct(m, DEFAULT_STYLE), true).mol], ["CDXML", fromCdxml(toCdxml(m, DEFAULT_STYLE)).mol], ["CDX", readCdx(writeCdx(m, DEFAULT_STYLE)).mol]] as const) {
    assert.deepEqual(shape(back), shape(m), `${what} keeps the atoms and bonds`);
    assert.deepEqual(where(back).map((p) => p.slice(0, 2)), where(m).map((p) => p.slice(0, 2)), `${what} keeps the coordinates`);
  }
}
assert.ok(charged.atoms.some((a) => a.charge === 1) && charged.atoms.some((a) => a.charge === -1), "the nitro group is N+ and O−");
// Turned, flipped, aligned, coloured and duplicated as a drawn structure is; the coordinates stay finite and the
// structure read is left as it was (so Undo puts it back).
const two = readCif(CIF), all = new Set(two.atoms.map((_, k) => k)), kept = JSON.stringify(two);
const finite = (m: Mol) => m.atoms.every((a) => a.location.every(Number.isFinite));
for (const m of [rotateAtoms(two, all, 90), flipAtoms(two, all, "horizontal"), flipAtoms(two, all, "vertical"), alignFragments(two, all, "column"), duplicateSelection(two, all, new Set()).mol, { ...two, atoms: two.atoms.map((a) => ({ ...a, colour: "#c00000" })) }]) assert.ok(finite(m) && m.atoms.length >= two.atoms.length);
assert.equal(JSON.stringify(two), kept);
const red = { ...two, atoms: two.atoms.map((a) => ({ ...a, colour: "#c00000" })) };
assert.ok(fromCdxml(toCdxml(red, DEFAULT_STYLE)).mol.atoms.every((a) => a.colour?.toLowerCase() === "#c00000"), "colour goes through CDXML");

// --- Hostile CIF text, now that a paste and an AI app send it (case 12) ----------------------------------------------

// 5,000 files made from these by cutting, doubling, deleting and swapping lines and making fields huge, negative or
// text: each ends fast, in a drawing that holds together or a refusal with the reader's words. Nothing else.
const lines = (t: string) => t.split("\n");
const mutate = (t: string) => {
  let ls = lines(t);
  for (let k = 1 + Math.floor(random() * 3); k > 0; k--) {
    const i = Math.floor(random() * ls.length), j = Math.floor(random() * ls.length);
    switch (Math.floor(random() * 8)) {
      case 0: return t.slice(0, Math.floor(random() * t.length));
      case 1: ls.splice(i, 0, ls[i]); break;
      case 2: ls.splice(i, 1); break;
      case 3: [ls[i], ls[j]] = [ls[j], ls[i]]; break;
      case 4: { const at = pick([...ls[i].matchAll(/-?\d+(\.\d+)?/g)]); if (at) ls[i] = ls[i].slice(0, at.index) + pick(["1e308", "-1e308", "1e30", "NaN", "?", ".", "9".repeat(40), "-0", "0.5(3)", "1e-320"]) + ls[i].slice(at.index + at[0].length); break; }
      case 5: ls[i] = ls[i].replace(/\S+/, pick(["'", ";", "loop_", "data_", "_atom_site_fract_x", "x".repeat(5000), "Uuo", "D"])); break;
      case 6: ls = ls.concat(ls.slice(i, i + 50)); break;
      default: ls[i] = ls[i].split(" ").reverse().join(" ");
    }
  }
  return ls.join("\n");
};
// A position far out (case 9): damaged, never NaN or a drawing a million bond lengths wide.
for (const far of ["1e308", "-1e308", "1e30", "9".repeat(40), "1000001"]) {
  assert.equal(refusal(says(() => importStructure(ACY.replace("0.605 1.048", `${far} 1.048`)))), "This CIF file is damaged: an atom is more than 1,000,000 Å from the origin.", far);
  assert.equal(refusal(says(() => importStructure(NITRO.replace(/^N1 \S+/m, `N1 ${far}`)))), "This CIF file is damaged: an atom is more than 1,000,000 Å from the origin.", `${far} of a cell`);
}
assert.equal(importStructure(ACY.replace("0.605 1.048", "999999 1.048")).atoms.length, 4);
// Atoms packed close: refused at the file's 20,000 bonds, fast, as one structure and as twenty (case 12).
for (const t of [DENSE, Array.from({ length: 20 }, (_, k) => DENSE.replace("data_x", `data_x${k}`)).join("")]) {
  const t0 = performance.now();
  assert.equal(refusal(says(() => importStructure(t))), "It has more than 20,000 bonds.");
  assert.ok(performance.now() - t0 < 300, `close-packed atoms refused in ${(performance.now() - t0).toFixed(0)} ms`);
}
// 5,000 from small files, each under 100 ms (a few milliseconds, but a pause to collect garbage on a busy machine can
// take tens); 30 from a structure at the 1,000-atom limit (a grid of carbons 1.5 Å apart, which takes 100 to 400 ms to
// read whole) and from close-packed atoms, each under a second.
const outcomes = { drawn: 0, damaged: 0, limit: 0, other: 0 };
const slowest = [0, 0];
for (let k = 0; k < 5030; k++) {
  const big = k >= 5000, t = mutate(big ? pick([OVER, DENSE]) : pick([ACY, CIF, OVER.slice(0, 2000), NITRO]));
  // (Text that is no longer CIF goes to Indigo, as it did before: not this reader's to test.)
  if (!isCif(t)) { outcomes.other++; continue; }
  const t0 = performance.now();
  try {
    const m = importStructure(t);
    assert.ok(m.atoms.length <= 20_000 && m.bonds.length <= 20_000 && finite(m) && m.bonds.every((b) => b.atoms.every((i) => i >= 0 && i < m.atoms.length) && b.atoms[0] !== b.atoms[1]), `a drawing that holds together: ${JSON.stringify(t.slice(0, 200))}`);
    outcomes.drawn++;
  } catch (e) {
    if (e instanceof DamagedFile) outcomes.damaged++;
    else if (refusal(e) && e instanceof RangeError) outcomes.limit++;
    else assert.fail(`${String(e)} on ${JSON.stringify(t.slice(0, 300))}`);
  }
  slowest[+big] = Math.max(slowest[+big], performance.now() - t0);
}
assert.ok(outcomes.drawn > 500 && outcomes.damaged > 100 && outcomes.limit > 5, JSON.stringify(outcomes));
assert.ok(slowest[0] < 100 && slowest[1] < 1000, `the slowest fuzzed files took ${slowest.map((x) => x.toFixed(0)).join(" and ")} ms`);

// --- Files Octet cannot read (J3) -------------------------------------------------------------------------------------

// Rust refuses binary bytes (an ISIS sketch, a ChemDraw 2.x or 3.5 file) whatever their name (cargo test,
// open::tests::old_formats_are_read_by_their_bytes). Text named .tgf or .msm comes to the page as it is: text no
// reader takes is refused with the general words, or over 300,000 characters with that limit, fast, and nothing is
// added. An MDL molfile named .msm reads as a MOL file.
const words = ["ATOM", "BOND", "TEXT", "0.000", "12", "-3", "C", "N", "O", "{", "}", "(", ")", "*", "=", "#", "@", "/", "\\", "ISIS", "SKETCH"];
const junk = (size: number) => { let s = ""; while (s.length < size) s += pick(words) + (random() < 0.15 ? "\n" : " "); return s.slice(0, size); };
for (const [size, want] of [[100_000, undefined], [1_000_000, "It has more than 300,000 characters."]] as const) {
  const t = junk(size), t0 = performance.now(), e = says(() => importStructure(t)), ms = performance.now() - t0;
  assert.equal(refusal(e), want, `${size} characters of text that is no structure`);
  assert.ok(ms < 1000, `refused in ${ms.toFixed(0)} ms`);
}
assert.deepEqual(importStructure(MOLFILE).atoms.map((a) => a.label).join(""), parseStructure("CC(=O)Oc1ccccc1C(=O)O").atoms.map((a) => a.label).join(""), "a ChemNote file that is a molfile reads as one");

// --- Speed (J1) --------------------------------------------------------------------------------------------------------

// The one cost J1 adds to a paste, the name field and add_file is isOwnFormat on text of several lines. On the
// 300,000-character SD file it is a small part of reading it, and text made to be slow for it stays fast.
assert.ok(SDF.length > 290_000 && SDF.length <= 300_000);
const test = time(() => isOwnFormat(SDF), 101), whole = time(() => importStructure(SDF), 5);
assert.ok(test < 1 && test < whole / 100, `isOwnFormat on ${SDF.length} characters: ${test.toFixed(3)} ms (reading them: ${whole.toFixed(0)} ms)`);
const slow = [`${"\n".repeat(150_000)}x`, `${"# comment\n".repeat(30_000)}x`, `${" ".repeat(300_000)}\n`, `data_x\n${"_cell_length_a 10\n".repeat(16_000)}`, `data_x\n${" \t".repeat(150_000)}`, `${"#".repeat(300_000)}\n`];
for (const t of slow) { const ms = time(() => isOwnFormat(t), 11); assert.ok(ms < 20, `isOwnFormat on text made to be slow: ${ms.toFixed(1)} ms`); }
console.log(`filetext.check: all passed (isOwnFormat ${test.toFixed(3)} ms on ${SDF.length.toLocaleString("en-GB")} characters, which read in ${whole.toFixed(0)} ms; fuzz ${JSON.stringify(outcomes)}, slowest ${slowest.map((x) => x.toFixed(0)).join(" and ")} ms).`);
