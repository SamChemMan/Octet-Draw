// Run: node src/nmredata.check.ts. Fails loudly if NMReDATA (issue 111) export or import goes wrong: a file Octet writes
// that breaks the format's rules (checked by a strict reader here), atom numbers that point at the wrong atoms,
// predicted shifts not marked or not prediction's, measured ones not analysis's, or a hostile file read wrongly or
// slowly. The test files are written here to the format's published rules (nmredata.org); none comes from Mnova.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { browser } from "../scripts/checkkit.ts";

browser();
const chem = await import("./chem.ts");
await chem.ready;
const { readTables, predict } = await import("./nmr.ts");
readTables(gunzipSync(readFileSync(new URL("../data/nmr/shifts.bin.gz", import.meta.url))));
const { isNmredata, molfileAtoms, nmredataDrawing, readNmredata, writeNmredata } = await import("./nmredata.ts");
const { analyse, fromJcamp, fromSpectrumObject, keepIds, measuredText, readMeasured, spectrumObject, writeMeasured } = await import("./measured.ts");
const { insertMol, setLabel } = await import("./edit.ts");
const { graphOf } = await import("./naming.ts");
type Mol = import("./render.ts").Mol;

const opts = { mhz: 400, solvent: "CDCl₃", version: "1.1.3", predicting: true };
const read = (sdf: string) => chem.importStructure(sdf);

// --- A strict reader of what Octet writes: the format's rules, and Octet's own (ASCII, 200 characters a line) --------

function strict(text: string): void {
  assert.ok(/^[\x0a\x20-\x7e]*$/.test(text), "only ASCII and line feeds");
  const records = text.split("$$$$\n");
  assert.equal(records.pop(), "", "each record ends with $$$$");
  for (const rec of records) {
    const end = rec.indexOf("M  END\n");
    assert.ok(end > 0, "a molfile first");
    const atoms = molfileAtoms(rec.slice(0, end + 6))!, items = rec.slice(end + 7).split("\n\n");
    assert.equal(items.pop(), "", "each item ends with an empty line");
    const named = new Map<string, string[]>();
    for (const it of items) {
      const [head, ...body] = it.split("\n");
      const name = /^> {2}<(NMREDATA_[A-Z0-9_]+)>$/.exec(head)?.[1];
      assert.ok(name, `an item's head: ${head}`);
      assert.ok(body.length && body.every((l) => l.length <= 200), `${name}: lines of 200 characters or fewer`);
      assert.ok(body[body.length - 1].endsWith("\\"), `${name}: its last line ends with a backslash`);
      // A line feed with no backslash before it is a wrap (only after ", "), which a version 1.1 reader ignores.
      body.slice(0, -1).forEach((l) => assert.ok(l.endsWith("\\") || l.endsWith(", "), `${name}: ${l}`));
      named.set(name!, body.join("").split("\\").slice(0, -1));
    }
    assert.deepEqual(named.get("NMREDATA_VERSION"), ["1.1"]);
    assert.deepEqual(named.get("NMREDATA_LEVEL"), ["0"]);
    const labels = new Map<string, string[]>();
    for (const l of named.get("NMREDATA_ASSIGNMENT") ?? []) {
      const [body, comment] = l.split(" ;"), f = body.split(", ");
      assert.ok(/^[A-Za-z0-9']+$/.test(f[0]) && !labels.has(f[0]), `a unique plain label: ${f[0]}`);
      assert.match(f[1], /^-?\d+\.\d{4}$/, "a shift with four decimals");
      assert.equal(f.length, 3, `one atom a line, as Mnova reads it: ${l}`);
      assert.ok(comment === undefined || comment === "predicted");
      for (const a of f.slice(2)) {
        const m = /^(H?)(\d+)$/.exec(a)!, n = Number(m[2]);
        assert.ok(m && n >= 1 && n <= atoms.length, `atom ${a} in the molfile`);
        assert.ok(!m[1] || atoms[n - 1] !== "H", "H<n> is on a heavy atom");
      }
      labels.set(f[0], f.slice(2));
    }
    for (const [name, lines] of named) {
      if (!name.startsWith("NMREDATA_1D_")) continue;
      assert.match(name, /^NMREDATA_1D_\d{1,3}[A-Z][a-z]?$/);
      const props = lines.filter((l) => /^[A-Za-z_]+=/.test(l)), sigs = lines.filter((l) => !/^[A-Za-z_]+=/.test(l));
      assert.ok(props.some((p) => /^Larmor=\d+\.\d{2}$/.test(p)) && props.includes("Spectrum_Location=none"), `${name}: Larmor= and Spectrum_Location=`);
      for (const s of sigs) {
        const f = s.split(", ");
        assert.match(f[0], /^-?\d+\.\d{4}(-(-?\d+\.\d{4}))?$/, "a shift or range with four decimals");
        const keys = f.slice(1).map((x) => x.split("=")[0]);
        assert.deepEqual(keys, ["S", "J", "N", "L", "E"].filter((k) => keys.includes(k)), "attributes in the format's order");
        const j = f.find((x) => x.startsWith("J="));
        if (j) assert.match(j, /^J=\d+\.\d{2}(,\d+\.\d{2})*$/);
        const label = f.find((x) => x.startsWith("L="))?.slice(2);
        if (label) for (const l of label.split(",")) assert.ok(labels.has(l), `${l} is in the assignment`);
      }
    }
  }
}

// The atoms each label names, by element: a ¹³C label names carbons; a ¹H label hydrogens (an H atom, or H<n> on a
// heavy atom with hydrogens).
function sound(text: string, mol: Mol): void {
  const els = molfileAtoms(text.slice(0, text.indexOf("M  END") + 6))!, ex = chem.expandLabels(mol), g = graphOf(ex)!;
  assert.deepEqual(els, ex.atoms.map((a) => a.label), "the molfile has the expanded atoms in order");
  const assign = /> {2}<NMREDATA_ASSIGNMENT>\n([^]*?)\n\n/.exec(text)![1].split(/\\\n?/).filter(Boolean);
  for (const l of assign) {
    const f = l.split(" ;")[0].split(", "), h = f[0].startsWith("H");
    for (const a of f.slice(2)) {
      const n = Number(a.replace("H", "")) - 1;
      if (!h) assert.equal(els[n], "C", `${f[0]} names a carbon`);
      else assert.ok(a.startsWith("H") ? g.atoms[n].h > 0 : els[n] === "H", `${f[0]} names hydrogens`);
    }
  }
}

// --- Export: predicted ---------------------------------------------------------------------------------------------

const benzoate = chem.parseStructure("CCOC(=O)c1ccccc1");
const w = writeNmredata(benzoate, opts)!;
strict(w.text);
sound(w.text, benzoate);
assert.deepEqual(w.predicted, ["1H", "13C"]);
// Marked three ways: Predicted= and Spectrum_Location=none in the 1D tag, and the ID (no comment on an assignment line).
assert.match(w.text, /> {2}<NMREDATA_1D_1H>\nLarmor=400\.00\\\nSpectrum_Location=none\\\nPredicted=Octet Draw 1\.1\.3 \(HOSE codes, nmrshiftdb2\)\\\n/);
assert.match(w.text, /> {2}<NMREDATA_1D_13C>\nLarmor=100\.58\\\nSpectrum_Location=none\\\nDecoupled=1H\\\nPredicted=/);
assert.ok(w.text.split("\n").filter((l) => /^\w+, \d/.test(l)).every((l) => !l.includes(";")), "no comment on an assignment line: Mnova drops a hydrogen's line that has one");
assert.match(w.text, /Comment=Octet Draw 1\.1\.3 predicted the 1H and 13C shifts/);
assert.match(w.text, /Comment1=Contains information from nmrshiftdb2/);
assert.match(w.text, /> {2}<NMREDATA_FORMULA>\nC9H10O2\\\n/);
assert.match(w.text, /> {2}<NMREDATA_SOLVENT>\nCDCl3\\\n/);
// The predicted values are prediction's, with ¹H counts, multiplicities and J values; ¹³C N= is the carbon's hydrogens.
const h1 = predict(graphOf(chem.expandLabels(benzoate))!, "1H", "CDCl₃")!;
for (const s of h1.signals) assert.ok(w.text.includes(`${s.shift.toFixed(4)}, S=`), `¹H ${s.shift}`);
assert.match(w.text, /\n4\.3\d{3}, S=q, J=7\.\d{2}, N=2, L=H2\\/);
assert.match(w.text, /\n1\d\d\.\d{4}, N=0, L=4\\/);
assert.match(w.text, /, N=3, L=1\\/);
// Without the tables: no prediction, so no peak lists and nothing marked.
const bare = writeNmredata(benzoate, { ...opts, predicting: false })!;
strict(bare.text);
assert.deepEqual(bare.predicted, []);
assert.doesNotMatch(bare.text, /NMREDATA_1D|Predicted/);
// Three structures: three records, each numbered from 1.
const three = writeNmredata(chem.parseStructure("CCO.c1ccccc1.CC(C)=O"), opts)!;
strict(three.text);
assert.equal(three.text.split("$$$$\n").length, 4);
// A label: OMe's atoms are numbered as the molfile has them (after the drawn atoms), its CH3 as H<n>.
const anisole = setLabel(chem.parseStructure("Cc1ccccc1"), 0, "OMe");
const wa = writeNmredata(anisole, opts)!;
strict(wa.text);
sound(wa.text, anisole);
assert.match(wa.text, /\nH8, 3\.\d{4}, H8\\/, "the OMe's CH3 is atom 8, after the ring");
// Explicit hydrogens: the ¹H labels name the H atoms themselves.
const explicitH = chem.parseStructure("[H]OC([H])([H])C([H])([H])[H]");
const we = writeNmredata(explicitH, opts)!;
strict(we.text);
sound(we.text, explicitH);
assert.doesNotMatch(/<NMREDATA_ASSIGNMENT>\n([^]*?)\n\n/.exec(we.text)![1], /, H\d/, "no H<n> where the hydrogens are drawn");
// Cis double bonds give a SMILES with a backslash, which version 1.1 reads as a line's end: no SMILES item then.
const cis = writeNmredata(chem.parseStructure("C/C=C\\C"), opts)!;
strict(cis.text);
assert.doesNotMatch(cis.text, /NMREDATA_SMILES/);
// Nothing to write.
assert.equal(writeNmredata({ atoms: [], bonds: [] }, opts), undefined);

// --- Import: a file as Mnova writes one (implicit hydrogens, labels H5 and 5, E= integrals, CRLF) -----------------

const acetate = chem.parseStructure("CC(=O)OCC"), molfile = chem.toMolfile(acetate, true);
const items = (body: string) => `${molfile}\n${body}$$$$\n`;
const mnova = items(`>  <NMREDATA_VERSION>
1.1\\

>  <NMREDATA_LEVEL>
0\\

>  <NMREDATA_SOLVENT>
CDCl3\\

>  <NMREDATA_ASSIGNMENT>
H5, 4.1200, H5\\
H1, 2.0500, H1\\
H6, 1.2600, H6\\
2, 171.1000, 2 ;the C=O\\
5, 60.4000, 5\\
1, 21.0000, 1\\
6, 14.2000, 6\\

>  <NMREDATA_1D_1H>
Larmor=400.13\\
Spectrum_Location=file:./nmr/1\\
zip_file_Location=sample.zip\\
4.1200, S=q, J=7.14, N=2, L=H5, E=2.01\\
2.0500, S=s, N=3, L=H1, E=3.00\\
1.2600, S=t, J=7.14, N=3, L=H6, E=3.02\\

>  <NMREDATA_1D_13C>
Larmor=100.62\\
Spectrum_Location=file:./nmr/2\\
Decoupled=1H\\
171.1000, L=2\\
60.4000, L=5\\
21.0000, L=1\\
14.2000, L=6\\

>  <NMREDATA_2D_13C_1J_1H>
Larmor=400.13\\
CorType=HSQC\\
5/H5\\
1/H1\\
6/H6\\

`);
assert.ok(isNmredata(mnova) && !isNmredata(molfile) && !isNmredata(`${molfile}\n>  <NAME>\nethyl acetate\n\n$$$$\n`));
// What the drawing gets: two peak lists, each multiplet the file's, each atom linked.
function opened(text: string) {
  const r = nmredataDrawing(text, read, 1, "sample");
  const by = Object.fromEntries(r.spectra.map((m) => [m.nucleus!, m]));
  const links = r.mol.atoms.map((a) => (a.peaks ?? []).map((id) => { const m = r.spectra.find((x) => x.groups.some((g) => g.id === id))!; return `${m.nucleus}:${analyse(m).groups.find((g) => g.id === id)!.shift.toFixed(2)}`; }).sort());
  return { ...r, by, links };
}
const base = opened(mnova);
assert.deepEqual(base.lost, { "2D correlation": 3 });
assert.deepEqual(Object.keys(base.by), ["1H", "13C"]);
assert.equal(measuredText(base.by["1H"], analyse(base.by["1H"])), "¹H NMR (400 MHz, CDCl₃) δ 4.12 (q, J = 7.1 Hz, 2H), 2.05 (s, 3H), 1.26 (t, J = 7.1 Hz, 3H).");
assert.equal(measuredText(base.by["13C"], analyse(base.by["13C"])), "¹³C NMR (101 MHz, CDCl₃) δ 171.1, 60.4, 21.0, 14.2.");
assert.deepEqual(base.links, [["13C:21.00", "1H:2.05"], ["13C:171.10"], [], [], ["13C:60.40", "1H:4.12"], ["13C:14.20", "1H:1.26"]]);
assert.ok(base.spectra.every((m) => m.groups.every((g) => g.given)), "each multiplet keeps the file's values");

// Line ends and their versions: the same spectra and links every time.
const same = (text: string, what: string) => { const r = opened(text); assert.deepEqual(r.links, base.links, what); assert.equal(measuredText(r.by["1H"], analyse(r.by["1H"])), measuredText(base.by["1H"], analyse(base.by["1H"])), what); };
same(mnova.replace(/\n/g, "\r\n"), "CRLF");
same(mnova.replace(/\n/g, "\r"), "CR");
same(`﻿${mnova.replace(/\n(?=4\.12)/, "\r\n")}`, "a BOM and mixed line ends");
same(mnova.replace(/, /g, ",\t").replace(/\\\n/g, "\\  \n"), "tabs and trailing spaces");
same(mnova.replace("1.1\\", "1.0").replace(/\\\n/g, "\n"), "version 1.0, no backslashes");
same(mnova.replace("2.0500, S=s", "2.05\n00, S=s"), "a number split by a bare line feed");
same(mnova.replace(/(<NMREDATA_1D_1H>\n[^]*?\n\n)/, (t) => t.replace(/\\/g, "")), "a 1.1 item with no backslashes");
same(mnova.replace(/, /g, ","), "fields with no space");
same(mnova.replace(/\n\n(?=> {2}<NMREDATA_2D)[^]*?\n\n/, "\n\n"), "no 2D item");

// Octet's own file read back: measured multiplets come back with the same shifts, multiplicities, J and links;
// predicted ones are not read (Octet predicts again).
const linked: Mol = { ...base.mol, spectra: base.spectra };
const again = writeNmredata(linked, { ...opts, spectra: base.spectra })!;
strict(again.text);
sound(again.text, linked);
assert.deepEqual(again.predicted, ["19F", "31P"].filter(() => false), "measured ¹H and ¹³C: nothing predicted for this compound");
assert.match(again.text, /\n4\.1200, S=q, J=7\.14, N=2, L=H5, E=2\.00\\/);
assert.match(again.text, /\n171\.1000, N=0, L=2\\/);
assert.doesNotMatch(again.text, /Predicted=|;predicted/);
const back = opened(again.text);
assert.deepEqual(back.links, base.links);
assert.deepEqual(back.lost, {});
// One measured nucleus, the other predicted: ¹H measured, ¹³C predicted and not read back.
const half = writeNmredata(linked, { ...opts, spectra: [base.by["1H"]] })!;
strict(half.text);
assert.deepEqual(half.predicted, ["13C"]);
const halfBack = opened(half.text);
assert.deepEqual(Object.keys(halfBack.by), ["1H"]);
assert.deepEqual(halfBack.lost, {});
// A ¹H multiplet linked to a carbon with no hydrogens: left out of the export, and counted.
const odd: Mol = { ...linked, atoms: linked.atoms.map((a, i) => (i === 1 ? { ...a, peaks: [...(a.peaks ?? []), base.by["1H"].groups[0].id] } : a)) };
assert.equal(writeNmredata(odd, { ...opts, spectra: base.spectra })!.unplaced, 1);
// A copy into another drawing (insertMol, as Paste) comes without its links, so it exports as predicted.
const copied = insertMol({ atoms: [], bonds: [] }, linked).mol;
assert.ok(copied.atoms.every((a) => !a.peaks));
assert.deepEqual(writeNmredata(copied, opts)!.predicted, ["1H", "13C"]);

// --- Hostile files ---------------------------------------------------------------------------------------------------

const lost = (text: string) => readNmredata(text).lost;
// Empty, and cut short.
assert.throws(() => readNmredata(">  <NMREDATA_VERSION>\n1.1\\\n\n$$$$\n"), /It has no structures/);
assert.throws(() => readNmredata(""), /It has no structures/);
assert.throws(() => readNmredata(mnova.slice(0, molfile.length - 20)), /It has no structures/);
// Cut inside a peak list: the lines before it read; the line it ends in, cut mid-number, left out and named.
const cut = readNmredata(mnova.slice(0, mnova.indexOf("1.2600, S=t") + 3));
assert.equal(cut.records[0].peaks[0].signals.length, 2);
assert.deepEqual(cut.lost, { "cut-off line": 1 });
// A version 1.0 line over 4,096 characters is left out whole and counted: the cut is not read as atom 1 of "12".
const v10 = mnova.replace("1.1\\", "1.0").replace(/\\\n/g, "\n");
const longLine = `X1, 3.0000, ${"2, ".repeat(1361)}12`;
assert.equal(longLine.indexOf("12", 4000), 4095);
const rl = readNmredata(v10.replace("H5, 4.1200, H5\n", `H5, 4.1200, H5\n${longLine}\n`));
assert.ok(!rl.records[0].assigned.has("X1"));
assert.deepEqual(rl.lost, { "long line": 1, "2D correlation": 3 });
assert.deepEqual(opened(v10.replace("H5, 4.1200, H5\n", `H5, 4.1200, H5\n${longLine}\n`)).links, base.links);
// The same in version 1.1, a logical line over 4,096 characters made of short physical lines; and a long line between
// items, skipped and counted.
assert.deepEqual(lost(mnova.replace("H5, 4.1200, H5\\", `H5, 4.1200, H5\\\n${longLine.replace(/, /g, ", \n")}\\`)), { "long line": 1, "2D correlation": 3 });
assert.deepEqual(lost(mnova.replace(">  <NMREDATA_LEVEL>", `${"y".repeat(5000)}\n>  <NMREDATA_LEVEL>`)), { "long line": 1, "2D correlation": 3 });
// A molfile with an over-long line: its record is left out.
assert.throws(() => readNmredata(mnova.replace("\n", `${"z".repeat(5000)}\n`)), /It has no structures/);
// An item past 20,000 lines: the rest counted; the logical line it cuts left out.
assert.equal(lost(mnova.replace("2.0500, S=s", `${"5.0\n".repeat(20_010)}2.0500, S=s`)).line, 4 + 20_010 + 2 - 20_000);
// Atoms out of range: 0, -3, 999 on 6 atoms, H0, H99, 1.5, x.
const outOf = mnova.replace("H5, 4.1200, H5", "H5, 4.1200, H5, 0, -3, 999, H0, H99, 1.5, x");
assert.deepEqual(lost(outOf), { assignment: 7, "2D correlation": 3 });
assert.deepEqual(opened(outOf).links, base.links);
// Odd numbers: left out; negative ranges and either order read; 777.777 an unknown shift (the 1D signal's is used).
const odd2 = mnova.replace("2.0500, S=s", "7.6-, S=s\\\n7.2--\\\nNaN\\\n1e400\\\n0x1F\\\n20000.0\\\n-5.1--4.9\\\n7.6-7.2\\\n2.0500, S=s")
  .replace("H1, 2.0500, H1", "H1, 777.777, H1");
const r2 = readNmredata(odd2);
assert.deepEqual(r2.lost, { signal: 6, "2D correlation": 3 });
assert.deepEqual(r2.records[0].peaks[0].signals.filter((s) => s.range).map((s) => s.range), [[-5.1, -4.9], [7.2, 7.6]]);
assert.equal(r2.records[0].assigned.get("H1")!.shift, undefined);
assert.ok(opened(odd2).links[0].includes("1H:2.05"));
// Labels: quoted with commas, parentheses; an unclosed quote; a label too long; one used twice; one only in a signal;
// an ambiguous one (level 2), left unlinked and counted; deep parentheses read flat.
const labelled = mnova.replace("H5, 4.1200, H5", `<"Ha,Hb">, 4.1200, H5\\\n<"H-C(1)">, 1.2600, H6\\\n<"open, 3.0, 1\\\n${"x".repeat(100)}, 3.0, 1\\\nH1, 9.9, H1`)
  .replace("L=H5,", `L=<"Ha,Hb">,`).replace("L=H6,", "L=(H6, H1),").replace("2.0500, S=s, N=3, L=H1", `2.0500, S=s, N=3, L=${"(".repeat(500)}H1`);
const r3 = opened(labelled);
assert.deepEqual(r3.lost, { assignment: 3, "ambiguous link": 2, "2D correlation": 3 });
assert.ok(r3.links[4].includes("1H:4.12"), "a quoted label with a comma");
// Item and record counts: 10,000 items, the first 256 read; two assignments, the first used; 101 records.
const many = mnova.replace("$$$$\n", `${">  <X>\n1\n\n".repeat(10000)}$$$$\n`);
assert.equal(lost(many)["data item"], 10000 + 7 - 256);
assert.deepEqual(lost(mnova.replace(">  <NMREDATA_1D_1H>", ">  <NMREDATA_ASSIGNMENT>\nH5, 9.9, H5\\\n\n>  <NMREDATA_1D_1H>")), { "data item": 1, "2D correlation": 3 });
assert.equal(readNmredata(mnova.replace(/\n\n(?=> {2}<NMREDATA_2D)[^]*?\n\n/, "\n\n").repeat(101)).records.length, 100);
// Levels 1 and 3: interchangeable assignments named; Equivalent= read as plain labels.
assert.deepEqual(lost(mnova.replace("0\\", "1\\").replace("6, 14.2000, 6\\", "6, 14.2000, 6\\\nInterchangeable=H5, H6\\\nEquivalent=5, 6\\")), { "interchangeable assignment": 1, "2D correlation": 3 });
// Numbered item heads ("> 1 <NMREDATA_…>") are NMReDATA too.
const numbered = mnova.replace(/>  </g, "> 1 <");
assert.ok(isNmredata(numbered));
same(numbered, "numbered heads");
// A pulse sequence on each 1D tag: still read; only an edited one (DEPT, APT) is a second list.
same(mnova.replace("Larmor=400.13\\", "Larmor=400.13\\\nSequence=zg30\\").replace("Decoupled=1H\\", "Decoupled=1H\\\nSequence=zgpg30\\"), "Sequence= on each list");
// A value Octet cannot use is left out alone and counted: the signal and its links stay. "br. s" is br s.
const attrs = readNmredata(mnova.replace("S=q, J=7.14, N=2", `S=br. s, J=${Array(21).fill("7.14").join(",")}, N=2`).replace("N=3, L=H1, E=3.00", "N=3, L=H1, E=50000").replace("S=t,", "S=t!,"));
assert.deepEqual(attrs.lost, { "J value": 21, integral: 1, multiplicity: 1, "2D correlation": 3 });
assert.deepEqual(attrs.records[0].peaks[0].signals.map((x) => [x.name, x.js.length, x.labels]), [["br s", 0, ["H5"]], ["s", 0, ["H1"]], [undefined, 1, ["H6"]]]);
// What Octet has no model for: NMREDATA_J, a DEPT list, a second ¹H list and a selective 1D, all named.
const more = mnova.replace(">  <NMREDATA_2D", `>  <NMREDATA_J>\nH5, H6, 7.14, nb=3\\\n\n>  <NMREDATA_1D_13C#2>\nLarmor=100.62\\\nSequence=DEPT135\\\n60.4000, I=-80\\\n\n>  <NMREDATA_1D_1H_D_1H>\nLarmor=400.13\\\n1.26, I=4\\\n\n>  <NMREDATA_2D`);
assert.deepEqual(lost(more), { "coupling list": 1, "extra peak list": 2, "2D correlation": 3 });
// Many nuclei: 20 isotopes' lists, the first 16 kept.
const isotopes = ["1H", "13C", "15N", "19F", "31P", "29Si", "11B", "77Se", "119Sn", "195Pt", "17O", "7Li", "113Cd", "199Hg", "103Rh", "129Xe", "2H", "6Li", "14N", "33S"];
const r4 = opened(mnova.replace(">  <NMREDATA_2D", `${isotopes.slice(2).map((n) => `>  <NMREDATA_1D_${n}>\nLarmor=50\\\n10.0000\\\n\n`).join("")}>  <NMREDATA_2D`));
assert.equal(r4.spectra.length, 16);
assert.equal(r4.lost["extra peak list"], 4);
// Diastereotopic hydrogens: H5a and H5b on one atom, two multiplets; written back as H5a and H5b.
const dia = mnova.replace("H5, 4.1200, H5", "H5a, 4.1500, H5\\\nH5b, 4.0900, H5").replace("4.1200, S=q, J=7.14, N=2, L=H5, E=2.01", "4.1500, S=dq, J=10.80,7.14, N=1, L=H5a, E=1.00\\\n4.0900, S=dq, J=10.80,7.14, N=1, L=H5b, E=1.00");
const r5 = opened(dia);
assert.deepEqual(r5.links[4], ["13C:60.40", "1H:4.09", "1H:4.15"]);
const w5 = writeNmredata({ ...r5.mol, spectra: r5.spectra }, { ...opts, spectra: r5.spectra })!;
strict(w5.text);
assert.match(w5.text, /\nH5a, 4\.1500, H5\\\nH5b, 4\.0900, H5\\/);
// Explicit hydrogens (the format's own ethanol example): ¹H links on the H atoms.
const ethanol = chem.parseStructure("[H]OC([H])([H])C([H])([H])[H]"), emol = chem.toMolfile(ethanol, true), els = molfileAtoms(emol)!;
const hs = els.flatMap((e, i) => (e === "H" ? [i + 1] : []));
const r6 = opened(`${emol}\n>  <NMREDATA_VERSION>\n1.1\\\n\n>  <NMREDATA_ASSIGNMENT>\na, 2.6100, ${hs[0]}\\\nb, 3.7000, ${hs[1]}, ${hs[2]}\\\n\n>  <NMREDATA_1D_1H>\nLarmor=400\\\n3.7000, S=q, N=2, L=b\\\n2.6100, S=bs, N=1, L=a\\\n\n$$$$\n`);
assert.deepEqual(hs.map((n) => r6.links[n - 1]), [["1H:2.61"], ["1H:3.70"], ["1H:3.70"], [], [], []].slice(0, hs.length));
assert.equal(groupNames(r6.by["1H"]), "q,br s");
function groupNames(m: Parameters<typeof analyse>[0]) { return analyse(m).groups.map((g) => g.name).join(","); }
// An aromatic H at 7.26 in CDCl₃ is the compound's, in the text line.
const at726 = mnova.replace("4.1200, S=q", "7.2600, S=q").replace("H5, 4.1200", "H5, 7.2600");
assert.match(measuredText(opened(at726).by["1H"], analyse(opened(at726).by["1H"])), /δ 7\.26 \(q/);
// Two records: one peak list for each nucleus holds both structures' multiplets.
const two = opened(mnova + mnova);
assert.equal(two.mol.atoms.length, 12);
assert.equal(two.by["1H"].groups.length, 6);
assert.deepEqual(two.links.slice(6), base.links);

// --- The saved forms keep the file's values ---------------------------------------------------------------------------

const h = base.by["1H"], c = base.by["13C"];
const saved = readMeasured(JSON.parse(JSON.stringify(writeMeasured(h))));
assert.deepEqual(saved.groups, h.groups);
assert.throws(() => readMeasured({ ...writeMeasured(h), groups: [{ id: 1, lo: 1, hi: 2, given: { js: Array(21).fill(1) } }] }), /damaged/);
assert.throws(() => readMeasured({ ...writeMeasured(h), groups: [{ id: 1, lo: 1, hi: 2, given: { name: "<script>" } }] }), /damaged/);
for (const m of [h, c]) {
  const o = spectrumObject(m), back2 = fromSpectrumObject(o.attrs, o.text, o.own, 1);
  assert.ok(back2.sticks, "a peak list stays sticks through CDXML and CDX");
  assert.deepEqual(back2.groups.map((g) => g.given), m.groups.map((g) => g.given));
  assert.equal(measuredText(back2, analyse(back2)), measuredText(m, analyse(m)));
}

// A measured ¹H spectrum opened over the imported list keeps the old multiplets' ids (their atoms stay linked), never
// the file's values: its own count, multiplicity and shift.
const lorentz = (x: number) => [[4.12, 1], [2.05, 3], [1.26, 3]].reduce((sum, [p, h]) => sum + (h * 0.00125 ** 2) / ((x - p) ** 2 + 0.00125 ** 2), 0);
const measuredH = fromJcamp({ title: "real", kind: "nmr", nucleus: "1H", mhz: 400.13, solvent: "CDCl₃", xUnit: "ppm", yUnit: "", first: 11, last: -1, y: Float64Array.from({ length: 32768 }, (_, i) => lorentz(11 - (12 * i) / 32767)) }, 900);
const kept = keepIds(measuredH, h, 1000), q412 = h.groups.find((g) => g.given?.shift === 4.12)!;
assert.ok(kept.groups.some((g) => g.id === q412.id), "the 4.12 multiplet keeps its id");
assert.ok(kept.groups.every((g) => !g.given), "no file values on a measured spectrum");
assert.equal(Math.round(analyse(kept).groups.find((g) => g.id === q412.id)!.n), 1, "its own count, not the file's 2");

// --- Speed and size -------------------------------------------------------------------------------------------------

const huge = mnova.replace("2.0500, S=s", `${"5.0000, S=s, N=1\\\n".repeat(Math.floor((300_000 - mnova.length) / 18))}2.0500, S=s`);
let t = performance.now();
const rh = readNmredata(huge);
const readMs = performance.now() - t;
assert.equal(rh.records[0].peaks[0].signals.length, 2000);
assert.ok(readMs < 300, `a 300,000-character file read in ${readMs.toFixed(0)} ms`);
const over = huge + "x".repeat(300_001 - huge.length);
t = performance.now();
assert.throws(() => readNmredata(over), /more than 300,000 characters/);
assert.ok(performance.now() - t < 50);
// Files made to be slow: a 290,000-digit version (one line, and 4,000-digit lines), runs of 4,089 spaces, 4,000-digit
// shifts and J values; an assignment naming atom H1 1,000 times, with 1,000 repeats of its label in each of about 70
// signals. Each read in one pass, under 300 ms.
const slow: [string, string][] = [
  ["version on one line", mnova.replace("1.1\\", `${"1".repeat(290_000)}x\\`)],
  ["version on many lines", mnova.replace("1.1\\", `${"1".repeat(4000)}\n`.repeat(72) + "x\\")],
  ["spaces", mnova.replace("2.0500, S=s", `${`5.0000${" ".repeat(4088)}x\\\n`.repeat(72)}2.0500, S=s`)],
  ["digits", mnova.replace("2.0500, S=s", `${`${"5".repeat(4000)}x\\\n`.repeat(72)}2.0500, S=s`)],
  ["J digits", mnova.replace("2.0500, S=s", `${`5.0, J=${"5".repeat(4000)}x\\\n`.repeat(72)}2.0500, S=s`)],
  ["repeats", mnova.replace("H1, 2.0500, H1", `H1, 2.0500${", H1".repeat(1000)}`).replace("2.0500, S=s, N=3, L=H1", `${`5.0000, L=H1${", H1".repeat(999)}\\\n`.repeat(70)}2.0500, S=s, N=3, L=H1`)],
];
for (const [what, text] of slow) {
  assert.ok(text.length > 280_000 && text.length <= 300_000, `${what}: ${text.length} characters`);
  t = performance.now();
  nmredataDrawing(text, read, 1);
  const ms = performance.now() - t;
  assert.ok(ms < 300, `${what}: read in ${ms.toFixed(0)} ms`);
  assert.deepEqual(opened(text).links.map((l) => [...new Set(l)].filter((x) => x !== "1H:5.00")), base.links, what);
}
assert.deepEqual(readNmredata(slow[5][1]).records[0].assigned.get("H1")!.atoms, [{ n: 1, implicit: true }]);
const taxol = chem.parseStructure("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C");
t = performance.now();
const wt = writeNmredata(taxol, opts)!;
const writeMs = performance.now() - t;
strict(wt.text);
sound(wt.text, taxol);
assert.ok(writeMs < 1000, `paclitaxel written in ${writeMs.toFixed(0)} ms`);

// --- The ways in and out are wired, each with its name -----------------------------------------------------------------

const src = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");
const editor = src("Editor.tsx"), menu = src("../src-tauri/src/main.rs"), exp = src("../src-tauri/src/export.rs");
assert.match(menu, /&item\("copy_nmredata", "NMReDATA", ""\)\?,/);
assert.match(editor, /copy_nmredata: \(\) => void copyNmredata\(\),/);
assert.match(editor, /copy_nmredata: \["Copy as NMReDATA", "", /);
assert.match(src("export.ts"), /\["nmredata", "NMReDATA"\]/);
assert.match(exp, /\("nmredata", "NMReDATA", &\["sdf", "sd"\]\),/);
assert.match(src("mcp.ts"), /"chemfig", "nmredata", "eln", "pdf"/);
// Every way in: File > Import, Open (readFile), a drop, both pastes.
assert.match(editor, /if \(!ct && isNmredata\(picked\[1\]\)\) return void \(await insertNmredata\(picked\[1\], fileName\(picked\[0\]\)\)\);/);
assert.match(editor, /if \(isNmredata\(text\)\) \{\n\s+let r: ReturnType<typeof nmredataDrawing>;/);
assert.match(editor, /for \(const f of files\.filter\(nmr\)\) await insertNmredata\(/);
assert.equal(editor.match(/isNmredata\(text\)\) (return|\{ e\.preventDefault\(\); return) (void )?insertNmredata\(text, "the clipboard"\)/g)?.length, 2);

// Mnova's form (tried in MestReNova 17.0.1 on 19 Nov): an empty NMREDATA_J, a label with two shifts (label, shift, shift,
// atom), and a signal on several labels written L=a,b. None of it is lost or linked wrong.
{
  const molfile = "\n  test\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0\n    1.0000    0.0000    0.0000 C   0  0\n    2.0000    0.0000    0.0000 O   0  0\n  1  2  1  0\n  2  3  1  0\nM  END\n";
  const sdf = `${molfile}>  <NMREDATA_VERSION>\n1.1\\\n\n>  <NMREDATA_ASSIGNMENT>\nH1, 1.2509, H1\\\nH2, 3.6100, 3.7000, H2\\\n\n>  <NMREDATA_J>\n\n>  <NMREDATA_1D_1H>\nLarmor=500.13\\\nSpectrum_Location=file:\\\n3.5800-3.7300, S=m, L=H2, N=2\\\n1.2509, S=t, J=7.00, L=H1,H2, N=5\\\n\n$$$$\n`;
  const r = readNmredata(sdf);
  assert.deepEqual(r.lost, { "second shift": 1 }, "an empty J list is not lost; Mnova's second shift is counted");
  const d = nmredataDrawing(sdf, read, 1, "Mnova");
  assert.deepEqual(d.mol.atoms.map((a) => a.peaks ?? []), [[2], [1, 2], []], "H1 and H2 link as Mnova wrote them, L=H1,H2 to both");
}

console.log(`nmredata.check: read 300,000 characters in ${readMs.toFixed(0)} ms, paclitaxel written in ${writeMs.toFixed(0)} ms ok`);
