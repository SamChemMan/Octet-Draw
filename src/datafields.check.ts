// Run: node src/datafields.check.ts. Fails loudly if data fields on structures (issue 68, docs/plans/
// issue-68-data-fields.md) break a rule: the cleaners and limits, a structure's fields, the dialog's rows, edits that
// renumber atoms (split, merge, delete, copy, paste, templates, labels), undo, .oct, CDXML, CDX and SDF round trips,
// hostile files, and the speed of edits on drawings with and without fields.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// chem.ts reads the drawing tokens and loads Indigo's wasm as a browser does; these stand in for the browser.
const g = globalThis as Record<string, unknown>;
g.document = { documentElement: {}, createElement: () => ({ getContext: () => ({}) }) };
g.getComputedStyle = () => ({ getPropertyValue: () => "10" });
g.window = globalThis;
g.self = { location: { origin: "file://" } };
g.fetch = async (u: URL | string) => new Response(readFileSync(new URL(String(u))), { headers: { "content-type": "application/wasm" } });
const chem = await import("./chem.ts");
await chem.ready;
const { fromCdxml, toCdxml, parseXml } = await import("./cdxml.ts");
const { cdxToXml, xmlToCdx } = await import("./cdx.ts");
const { DEFAULT_STYLE } = await import("./docstyle.ts");
const E = await import("./edit.ts");
const { parse, serialize } = await import("./file.ts");
const { readOct, writeOct, lostText } = await import("./oct.ts");
const { history } = await import("./history.ts");
const { nextCompound } = await import("./numbering.ts");
const D = await import("./datafields.ts");
type Mol = import("./render.ts").Mol;
type Atom = import("./render.ts").Atom;

const at = (x: number, y: number, label = "C"): Atom => ({ label, location: [x, y, 0] });
const bond = (a: number, b: number) => ({ type: 1, atoms: [a, b] as [number, number] });
// Propane (0-2) and ethanol (3-5), apart.
const base: Mol = { atoms: [at(0, 0), at(1, 0.5), at(2, 0), at(6, 0), at(7, 0.5), at(8, 0, "O")], bonds: [bond(0, 1), bond(1, 2), bond(3, 4), bond(4, 5)] };
const P = [0, 1, 2], Q = [3, 4, 5];
const values = (m: Mol, atoms: number[]) => D.rowsOf(m, atoms).map((r) => [r.name, r.value, r.show]);
// The structure atom i is in.
const whole = (m: Mol, i: number) => E.fragments(m).find((f) => f.includes(i))!;
const withFields = D.setRows(D.setRows(base, P, [{ name: "ID", value: "OCT-001", show: false }, { name: "mp", value: "123 °C", show: true }, { name: "Note", value: "line 1\nline 2", show: false }]),
  Q, [{ name: "ID", value: "OCT-002", show: false }]);

// Rules 2 to 5: names one line with no < or >; values keep line breaks (CR dropped), a tab is a space, control
// characters go, empty lines at the ends go; over the limit a value is left out whole, never cut.
{
  assert.equal(D.cleanName("  Melting\tpoint <°C>\n "), "Melting point °C");
  assert.equal(D.cleanName("<>"), "");
  assert.equal(D.cleanValue("\r\n\n  a\r\nb\tc\u0000\u001b\n\n  \n"), "  a\nb c");
  assert.equal(D.cleanValue("x".repeat(D.MAX_VALUE)), "x".repeat(D.MAX_VALUE));
  assert.equal(D.cleanValue("x".repeat(D.MAX_VALUE + 1)), undefined);
  // A value with tens of thousands of line breaks and no end is cleaned in one pass (no regex back-tracking).
  let t = performance.now();
  D.cleanValue("\n ".repeat(19_000) + "x");
  assert.ok(performance.now() - t < 50, "a value of many empty lines is cleaned at once");
  // Unicode is kept whole: α, °C, 日本, 🧪 (two UTF-16 units), Arabic.
  assert.equal(D.cleanValue("α °C 日本 🧪 مرحبا"), "α °C 日本 🧪 مرحبا");
  t = 0;
  console.log("datafields.check: cleaners and limits ok");
}

// J1: a structure's fields in order; shown, a field's value is its caption's text, tied under the structure, never
// chemistry; the same rows give the same drawing back; a row with no name is left out.
{
  assert.deepEqual(values(withFields, P), [["ID", "OCT-001", false], ["mp", "123 °C", true], ["Note", "line 1\nline 2", false]]);
  assert.deepEqual(values(withFields, Q), [["ID", "OCT-002", false]]);
  const shown = withFields.data![1], c = withFields.captions!.find((x) => x.id === shown.caption)!;
  assert.deepEqual([c.text, c.under, c.chemical, shown.value], ["123 °C", P, false, undefined], "rule 6: shown, the text is the value");
  assert.equal(D.setRows(withFields, P, D.rowsOf(withFields, P)), withFields, "no change, no new drawing");
  // Hide mp, show Note, empty the ID's name (left out), add a row; one change.
  const rows = D.rowsOf(withFields, P);
  const next = D.setRows(withFields, P, [{ ...rows[0], name: " " }, { ...rows[1], show: false }, { ...rows[2], show: true }, { name: "Batch", value: "B7", show: false }]);
  assert.deepEqual(values(next, P), [["mp", "123 °C", false], ["Note", "line 1\nline 2", true], ["Batch", "B7", false]]);
  assert.ok(!next.captions!.some((x) => x.id === shown.caption), "the hidden field's text is gone");
  assert.deepEqual(values(next, Q), [["ID", "OCT-002", false]], "the other structure's fields stay");
  // S5, S6: two fields of one name both stay; an empty value is a field.
  const dup = D.setRows(base, P, [{ name: "ID", value: "a", show: false }, { name: "ID", value: "", show: false }]);
  assert.deepEqual(values(dup, P), [["ID", "a", false], ["ID", "", false]]);
  // A value too long to show is kept, not shown.
  const long = D.setRows(base, P, [{ name: "Spectrum", value: "y".repeat(D.MAX_SHOWN + 1), show: true }]);
  assert.deepEqual([long.data![0].caption, long.data![0].value?.length], [undefined, D.MAX_SHOWN + 1]);
  // Rule 7: a shown field is never chemistry and never a compound number, bold or not.
  const bold = { ...D.setRows(base, P, [{ name: "n", value: "12", show: true }]) };
  bold.captions = bold.captions!.map((x) => ({ ...x, bold: true }));
  assert.equal(nextCompound(bold), "1");
  assert.equal(E.nextNumber(bold), "1");
  assert.equal(E.withCaptionAtoms(D.setRows(base, P, [{ name: "solvent", value: "MeOH", show: true }]), true).captions.length, 0);
  // Select Linked Objects: the structures and the text.
  assert.deepEqual(D.linked(withFields, shown.caption!), { atoms: P, items: [shown.caption!] });
  assert.equal(D.linked(withFields, 999), undefined);
  console.log("datafields.check: fields, rows, show and hide ok");
}

// J2: edits keep fields with their atoms.
{
  // S12: a structure split in two keeps every field on both pieces; a change on one piece copies the field first.
  // Butane with the same fields: the bond in the middle deleted leaves two ethanes.
  const butane = D.setRows({ atoms: [at(0, 0), at(1, 0.5), at(2, 0), at(3, 0.5)], bonds: [bond(0, 1), bond(1, 2), bond(2, 3)] }, [0, 1, 2, 3], D.rowsOf(withFields, P).map(({ key: _, ...r }) => r));
  const split = E.deleteBond(butane, 1), left = [0, 1], right = [2, 3];
  assert.deepEqual(values(split, left), values(withFields, P));
  assert.deepEqual(values(split, right), values(withFields, P));
  const changed = D.setRows(split, right, D.rowsOf(split, right).map((r) => ({ ...r, value: r.name === "ID" ? "OCT-001b" : r.value })));
  assert.deepEqual(values(changed, left).map((r) => r[1]), ["OCT-001", "123 °C", "line 1\nline 2"], "the other piece keeps its value");
  assert.deepEqual(values(changed, right).map((r) => r[1]), ["OCT-001b", "123 °C", "line 1\nline 2"]);
  // The shown text is tied under the left piece (its first atom), so it stays the left's; the right piece, shown as
  // the dialog showed it, gets a text of its own.
  assert.deepEqual([values(changed, left).map((r) => r[2]), values(changed, right).map((r) => r[2])], [[false, true, false], [false, true, false]]);
  const textOf = (atoms: number[]) => changed.data![D.fieldsOn(changed, atoms)[1]].caption;
  assert.ok(textOf(left) !== textOf(right) && textOf(left) === butane.data![1].caption);
  // S13: two structures joined by a bond have both lists, the earlier one's first; duplicates stay.
  const joined = E.dragBond(withFields, 2, [6, 0]);
  assert.equal(whole(joined, 0).length, 6);
  assert.deepEqual(values(joined, whole(joined, 0)).map((r) => r[0]), ["ID", "mp", "Note", "ID"]);
  // An atom dropped on another (joinOverlaps) and Join keep both lists too.
  const dropped = E.joinOverlaps(E.moveAtoms(withFields, new Set([3]), [-4, 0]), new Set([3])).mol;
  assert.deepEqual(values(dropped, whole(dropped, 0)).map((r) => r[1]), ["OCT-001", "123 °C", "line 1\nline 2", "OCT-002"]);
  const join = E.joinSelection(withFields, new Set([2, 3]));
  assert.ok(join && values(join, whole(join, 0)).length === 4, "Join");
  // S14: every atom deleted takes the fields; some atoms leave them; the shown text deleted deletes its field.
  const gone = E.deleteAtoms(withFields, new Set(P));
  assert.deepEqual([values(gone, [0, 1, 2]).length, gone.data?.length], [1, 1]);
  assert.deepEqual(values(E.deleteAtoms(withFields, new Set([0])), [0, 1]).length, 3);
  const text = withFields.data![1].caption!, noText = E.deleteGraphics(withFields, new Set([text]));
  assert.deepEqual(values(noText, P).map((r) => r[0]), ["ID", "Note"]);
  // Delete with the structure chosen and its text not: the text stays as plain text, the fields go.
  const chosen = E.deleteChosen(withFields, new Set(P), new Set());
  assert.deepEqual([chosen.data?.length, chosen.captions?.some((x) => x.id === text)], [1, true]);
  // S16: Copy and Paste bring the fields; a copy without the shown text holds the value, not shown.
  const copy = E.extractSelection(withFields, new Set(P), new Set());
  assert.deepEqual(values(copy, P), values(withFields, P), "the text tied under the copied atoms comes too");
  const atomsOnly = E.extractSelection({ ...withFields, captions: withFields.captions!.map((x) => ({ ...x, under: undefined })) }, new Set(P), new Set());
  assert.deepEqual(values(atomsOnly, P), [["ID", "OCT-001", false], ["mp", "123 °C", false], ["Note", "line 1\nline 2", false]]);
  const textOnly = E.extractSelection(withFields, new Set(), new Set([text]));
  assert.equal(textOnly.data, undefined, "the text copied alone is plain text");
  const pasted = E.insertMol(withFields, copy, [0, -5]);
  const newAtoms = [...pasted.atoms];
  assert.deepEqual(values(pasted.mol, newAtoms), values(withFields, P));
  assert.equal(pasted.mol.captions!.find((x) => x.id === pasted.mol.data!.at(-2)!.caption)?.text, "123 °C", "the pasted field shows its own text");
  assert.notEqual(pasted.mol.data!.at(-2)!.caption, text);
  const dupe = E.duplicateSelection(withFields, new Set(P), new Set());
  assert.equal(values(dupe.mol, [...dupe.atoms]).length, 3, "Option-drag");
  // merge (a file opened into a drawing) brings the fields, not shown.
  assert.deepEqual(values(E.merge(base, withFields, [0, 0]), [6, 7, 8]).map((r) => r[2]), [false, false, false]);
  // S30: a template with fields brings them.
  const t = E.normalise(E.extractSelection(withFields, new Set(Q), new Set()));
  const placed = E.addTemplate(E.EMPTY, t, { point: [0, 0] });
  assert.deepEqual(values(placed, [0, 1, 2]), [["ID", "OCT-002", false]]);
  // S21, S31: turns, flips, Contract and Expand Label keep the fields.
  assert.deepEqual(values(E.rotateAtoms(withFields, new Set(P), 90), P), values(withFields, P));
  assert.deepEqual(values(E.flipAtoms(withFields, new Set(P), "horizontal"), P), values(withFields, P));
  const contracted = E.contractLabel(withFields, 4, new Set([4, 5]), "CH2OH");
  assert.deepEqual(values(contracted, [3, 4]), [["ID", "OCT-002", false]]);
  const expanded = E.expandLabel(contracted, 4, { atoms: [at(0, 0), at(1, 0, "O")], bonds: [bond(0, 1)] });
  assert.deepEqual(values(expanded, [3, 4, expanded.atoms.length - 1]), [["ID", "OCT-002", false]]);
  console.log("datafields.check: split, merge, delete, copy, paste, templates and labels keep fields ok");
}

// Rule 8, S15: each change is one undo step, and undo and redo give each drawing back.
{
  let h = history({ stack: [base], at: 0 }, { type: "set", mol: base });
  const steps: Mol[] = [base];
  const step = (m: Mol) => { steps.push(m); h = history(h, { type: "set", mol: m }); };
  step(D.setRows(base, P, [{ name: "ID", value: "A", show: false }]));
  step(D.setRows(steps.at(-1)!, P, [{ ...D.rowsOf(steps.at(-1)!, P)[0], show: true }]));
  const shownId = steps.at(-1)!.data![0].caption!;
  step(E.updateCaption(steps.at(-1)!, shownId, { text: "B" }));
  assert.deepEqual(values(steps.at(-1)!, P), [["ID", "B", true]], "typing over the text changes the value");
  step(D.setRows(steps.at(-1)!, P, [{ ...D.rowsOf(steps.at(-1)!, P)[0], show: false }]));
  assert.deepEqual(values(steps.at(-1)!, P), [["ID", "B", false]]);
  for (let k = steps.length - 1; k > 0; k--) { assert.equal(h.stack[h.at], steps[k]); h = history(h, { type: "undo" }); }
  assert.equal(h.stack[h.at], base);
  for (let k = 1; k < steps.length; k++) { h = history(h, { type: "redo" }); assert.equal(h.stack[h.at], steps[k]); }
  console.log("datafields.check: undo and redo ok");
}

// J3: .oct keeps the fields in order; a shown field's text carries ChemDraw's attached-data property (which Octet 1.1.2
// keeps: a name of 200 characters at most, no control characters, text of 2,000 at most with no tab).
{
  const back = parse(serialize(withFields));
  assert.deepEqual(back.data, withFields.data);
  assert.equal(back.captions!.find((c) => c.id === withFields.data![1].caption)!.property, undefined, "in memory the property is the field's");
  const saved = JSON.parse(serialize(withFields));
  assert.deepEqual(saved.data[1], { name: "mp", atoms: P, caption: 0 });
  assert.deepEqual(saved.captions[0].property, { attrs: { ChemicalPropertyType: "23", Name: "mp" }, atoms: P });
  // A drawing saved by Octet 1.1.2 (no data list, the property kept on the text) has its shown field back.
  delete saved.data;
  assert.deepEqual(values(parse(JSON.stringify(saved)), P), [["mp", "123 °C", true]]);
  // S10: hostile lists. Bad entries are left out and counted, and the drawing opens.
  const file = (data: unknown) => JSON.stringify({ ...JSON.parse(serialize(withFields)), data });
  const bad = [{ name: "ok", atoms: [0], value: "v" }, { name: "", atoms: [0], value: "v" }, { name: "x".repeat(201), atoms: [0], value: "v" }, { name: "a", atoms: [99], value: "v" },
    { name: "a", atoms: [], value: "v" }, { name: "a", atoms: [0], caption: 7 }, { name: "a", atoms: [0], value: 5 }, { name: "a", atoms: [0], value: "v", caption: 0 }, { name: "a", atoms: [0], value: "z".repeat(10_001) }, null, "x"];
  const read = readOct(file(bad));
  // (The shown field's text keeps its attached-data property, so it is a field again.)
  assert.deepEqual([read.mol.data, read.lost], [[{ name: "ok", atoms: [0], value: "v" }, { name: "mp", atoms: P, caption: 1 }], { "data field": bad.length - 1 }]);
  assert.equal(lostText(read.lost), "10 data fields");
  assert.deepEqual(parse(file({ not: "a list" })).data, [{ name: "mp", atoms: P, caption: 1 }]);
  let t = performance.now();
  const many = parse(file(Array.from({ length: 100_000 }, (_, k) => ({ name: `f${k}`, atoms: [k % 6], value: "v" }))));
  assert.equal(many.data!.length, D.MAX_DATA);
  assert.ok(performance.now() - t < 1500, "100,000 entries read in under a second and a half");
  t = 0;
  console.log("datafields.check: .oct round trip, Octet 1.1.2's form and hostile lists ok");
}

// J4: CDXML. A hidden field is an annotation in its fragment, a shown one ChemDraw's attached data (its text, not
// read as chemistry, and a chemicalproperty of type 23). Octet's own order comes back; ChemDraw's file (no Octet data)
// keeps every field. CDX holds the same objects.
{
  const text = toCdxml(withFields, DEFAULT_STYLE);
  assert.equal((text.match(/<annotation\s/g) ?? []).length, 3);
  assert.match(text, /<annotation\s+Keyword="Note"\s+Content="line 1&#10;line 2"/);
  assert.match(text, /<chemicalproperty[^>]*ChemicalPropertyType="23"\s+Name="mp"/);
  assert.match(text, /InterpretChemically="no"/);
  const read = fromCdxml(text);
  assert.deepEqual([read.lost, values(read.mol, P), values(read.mol, Q)], [{}, values(withFields, P), values(withFields, Q)]);
  const chemdraw = text.replace(/\n Octet="[^"]*"/g, "");
  const theirs = fromCdxml(chemdraw);
  assert.deepEqual(new Set(values(theirs.mol, P).map(String)), new Set(values(withFields, P).map(String)));
  // ChemDraw writes a value's line breaks raw inside Content: they stay line breaks.
  const raw = fromCdxml(chemdraw.replace("line 1&#10;line 2", "line 1\nline 2"));
  assert.ok(values(raw.mol, P).some((r) => r[1] === "line 1\nline 2"));
  // CDX: the same objects through the binary form.
  const cdx = fromCdxml(cdxToXml(xmlToCdx(parseXml(text))));
  assert.deepEqual([values(cdx.mol, P), values(cdx.mol, Q)], [values(withFields, P), values(withFields, Q)]);
  // Octet's .oct (CDXML with Octet's drawing inside) keeps them exactly.
  assert.deepEqual(readOct(writeOct(withFields, DEFAULT_STYLE)).mol.data, withFields.data);
  // A selection written alone (Copy as CDXML) brings its fields.
  assert.deepEqual(values(fromCdxml(toCdxml(withFields, DEFAULT_STYLE, { selection: { atoms: Q, items: [] } })).mol, [0, 1, 2]), values(withFields, Q));
  // S11: 5,000 annotations in one fragment: 1,000 kept, the rest counted; no name is "Data"; a type 23 property with
  // no text is counted as before.
  const notes = Array.from({ length: 5000 }, (_, k) => `<annotation Keyword="${k ? `k${k}` : ""}" Content="v"/>`).join("");
  const hostile = `<?xml version="1.0" encoding="UTF-8" ?><CDXML BondLength="14.40"><page id="1" BoundingBox="0 0 540 720"><fragment id="3"><n id="4" p="100 100"/><n id="5" p="114.4 100"/><b id="6" B="4" E="5"/>${notes}</fragment><chemicalproperty id="9" ChemicalPropertyDisplayID="77" ChemicalPropertyType="23" Name="x" BasisObjects="4"/></page></CDXML>`;
  let t = performance.now();
  const h = fromCdxml(hostile);
  assert.deepEqual([h.mol.data!.length, h.mol.data![0].name, h.lost], [D.MAX_EACH, "Data", { "data field": 4000, "property link": 1 }]);
  assert.ok(performance.now() - t < 1000);
  t = 0;
  console.log("datafields.check: CDXML and CDX ok");
}

// J5, J6: SDF. Each record has its structure's fields as data items, in order; Octet reads them back, a lone record
// too, and Data S-groups; empty lines and $$$$ lines in a value are left out; an empty value is written.
{
  const m = D.setRows(withFields, Q, [{ name: "ID", value: "OCT-002", show: false }, { name: "empty", value: "", show: false }, { name: "odd", value: "a\n\n$$$$ b\nc", show: false }, { name: "uni", value: "α °C 日本 🧪 مرحبا", show: false }]);
  for (const v2000 of [false, true]) {
    const sd = chem.toSdf(m, v2000);
    assert.match(sd, /M {2}END\n> <ID>\nOCT-001\n\n> <mp>\n123 °C\n\n> <Note>\nline 1\nline 2\n\n\$\$\$\$\n/);
    assert.match(sd, /> <empty>\n\n> <odd>\na\nc\n\n> <uni>\nα °C 日本 🧪 مرحبا\n\n\$\$\$\$\n$/);
    const back = chem.importStructure(sd);
    assert.deepEqual([values(back, [0, 1, 2]), values(back, [3, 4, 5])], [values(m, P).map(([n, v]) => [n, v, false]), values(m, Q).map(([n, v]) => [n, n === "odd" ? "a\nc" : v, false])], `SDF ${v2000 ? "V2000" : "V3000"} reads back`);
    assert.deepEqual(D.leftOf(back), {});
  }
  // A lone record keeps its items (Indigo drops them).
  const one = chem.importStructure(chem.toSdf(D.setRows(base, P, [{ name: "ID", value: "only", show: false }]).atoms.length ? E.pickAtoms(D.setRows(base, P, [{ name: "ID", value: "only", show: false }]), P) : base));
  assert.equal(one.data, undefined, "pickAtoms has no fields");
  const lone = chem.importStructure(chem.toSdf(E.extractSelection(D.setRows(base, P, [{ name: "ID", value: "only", show: false }]), new Set(P), new Set())));
  assert.deepEqual(values(lone, [0, 1, 2]), [["ID", "only", false]]);
  // A record of two molecules (a salt): the fields go on both; a record with no atoms has none to take them.
  const salt = chem.importStructure(`${chem.toMolfile(chem.parseStructure("CC(=O)[O-].[Na+]"), true)}\n> <ID>\nS1\n\n$$$$\n\n  none\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n> <ID>\nE0\n\n$$$$\n${chem.toMolfile(chem.parseStructure("CCO"), true)}\n> <ID>\nB2\n\n$$$$   \n`);
  assert.deepEqual([values(salt, [0]), values(salt, [4]), values(salt, [5]), D.leftOf(salt)], [[["ID", "S1", false]], [["ID", "S1", false]], [["ID", "B2", false]], { "data field": 1 }]);
  // Data S-groups (a molfile's attached data) are fields of their atoms.
  const dat = chem.importStructure("\n  Octet\n\n  3  2  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    1.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\n    2.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0\n  1  2  1  0\n  2  3  1  0\nM  STY  1   1 DAT\nM  SAL   1  3   1   2   3\nM  SDT   1 Batch\nM  SDD   1     0.0000    0.0000    DA    ALL  1       5\nM  SED   1 B-001\nM  END\n");
  assert.deepEqual(dat.data, [{ name: "Batch", atoms: [0, 1, 2], value: "B-001" }]);
  console.log("datafields.check: SDF write and read ok");
}

// S9: a hostile SD file: a giant value, 20,000 items on one record, a header with no <name>, NUL and ESC in values,
// a record with no atoms, $$$$ with spaces after it. Left out and counted once; read in under a second.
{
  const mol = chem.toMolfile(chem.parseStructure("CCO"), true);
  const rec = (items: string) => `${mol}\n${items}$$$$  \n`;
  const text = rec(`> <big>\n${"x".repeat(250_000)}\n\n> 25\nno name\n\n> <ctl>\na\u0000b\u001bc\n\n`) + rec(Array.from({ length: 1200 }, (_, k) => `> <f${k}>\n${k}\n\n`).join(""));
  const t = performance.now(), m = chem.importStructure(text), took = performance.now() - t;
  assert.deepEqual(values(m, [0]), [["ctl", "abc", false]]);
  assert.equal(values(m, [3]).length, D.MAX_EACH);
  assert.deepEqual(D.leftOf(m), { "data field": 2 + 200 });
  assert.ok(took < 1000, `hostile SD file read in ${took.toFixed(0)} ms`);
  // The reader alone, on 20,000 tiny items in one record, is one pass.
  const r0 = performance.now(), many = D.readSd(rec(Array.from({ length: 20_000 }, (_, k) => `> <f${k}>\n${k}\n\n`).join("")));
  assert.deepEqual([many.records[0].items.length, many.left], [D.MAX_EACH, 19_000]);
  assert.ok(performance.now() - r0 < 300);
  // S1: an SD file of 10,000 records is over the 300,000-character limit and is refused at once.
  const big = Array.from({ length: 10_000 }, (_, k) => rec(`> <ID>\nC-${k}\n\n`)).join("");
  const b0 = performance.now();
  assert.throws(() => chem.importStructure(big), /300,000 characters/);
  assert.ok(performance.now() - b0 < 200);
  console.log(`datafields.check: hostile SD file ok (${took.toFixed(0)} ms)`);
}

// S2, J9: speed. An SD file just under the limit, with 10 fields on each record, opens in about the time of the same
// file with none; edits on 40 paclitaxels with 10 fields each cost what they cost with none (median of interleaved
// runs, within 15%, or 2 ms for the quickest); SDF export of them is under a second.
{
  const median = (t: number[]) => [...t].sort((x, y) => x - y)[t.length >> 1];
  const one = chem.indigoLayout("CC1=C2[C@@]([C@]([C@H]([C@@H]3[C@]4([C@H](OC4)C[C@@H]([C@]3(C(=O)[C@@H]2OC(=O)C)C)O)OC(=O)C)OC(=O)c5ccccc5)(C[C@@H]1OC(=O)[C@H](O)[C@@H](NC(=O)c6ccccc6)c7ccccc7)O)(C)C");
  let plain: Mol = { atoms: [], bonds: [] };
  for (let k = 0; k < 40; k++) plain = E.insertMol(plain, one, [20 * (k % 8), 20 * Math.floor(k / 8)]).mol;
  let fielded = plain;
  for (const g of E.fragments(plain)) fielded = D.setRows(fielded, g, Array.from({ length: 10 }, (_, k) => ({ name: `F${k}`, value: `value ${k}`, show: k < 2 })));
  assert.equal(fielded.data!.length, 400);
  const n = one.atoms.length, bondK = plain.bonds.findIndex((b) => b.atoms[0] >= 20 * n && b.atoms[1] >= 20 * n);
  const work: [string, (m: Mol) => unknown][] = [
    ["delete a bond", (m) => E.deleteBond(m, bondK)],
    ["drag", (m) => E.joinOverlaps(E.moveAtoms(m, new Set(E.fragments(m)[5]), [0.3, 0.2]), new Set(E.fragments(m)[5]))],
    ["delete atoms", (m) => E.deleteAtoms(m, new Set([5, 6, 7]))],
    ["copy and paste", (m) => E.insertMol(m, E.extractSelection(m, new Set(E.fragments(m)[3]), new Set()), [1, 1])],
  ];
  const timed = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t; };
  // The fields' own cost is measured against the same drawing with the same text under its structures (80 captions,
  // as compound numbers would be) and no fields: the text costs what any text under a structure costs.
  const { data: _, ...captioned } = fielded;
  for (const [what, f] of work) {
    const a: number[] = [], b: number[] = [], c: number[] = [];
    for (let r = 0; r < 60; r++) { a.push(timed(() => f(plain))); c.push(timed(() => f(captioned))); b.push(timed(() => f(fielded))); }
    const ma = median(a.slice(10)), mb = median(b.slice(10)), mc = median(c.slice(10));
    assert.ok(mb <= mc * 1.15 + 0.5, `${what}: ${mb.toFixed(2)} ms with fields, ${mc.toFixed(2)} ms with their text and no fields`);
    console.log(`datafields.check: ${what} ${ma.toFixed(2)} ms with no fields, ${mc.toFixed(2)} ms with the text alone, ${mb.toFixed(2)} ms with 400 fields`);
  }
  const t = performance.now(), sd = chem.toSdf(fielded), took = performance.now() - t;
  assert.equal((sd.match(/^> </gm) ?? []).length, 400);
  assert.ok(took < 1000, `SDF export of 40 paclitaxels with fields: ${took.toFixed(0)} ms`);
  // S2: about 250 records of 10 fields each, under 300,000 characters; opens with each record's fields, in about the
  // time of the same file with none.
  const small = chem.toMolfile(chem.parseStructure("CC(=O)Nc1ccc(O)cc1"), true);
  const items = Array.from({ length: 10 }, (_, k) => `> <F${k}>\nv${k}\n\n`).join("");
  const count = Math.floor(290_000 / (small.length + items.length + 6));
  const withItems = Array.from({ length: count }, () => `${small}\n${items}$$$$\n`).join(""), without = Array.from({ length: count }, () => `${small}\n$$$$\n`).join("");
  assert.ok(withItems.length < 300_000 && count > 100);
  const opened = chem.importStructure(withItems);
  assert.equal(opened.data!.length, count * 10);
  assert.deepEqual(values(opened, [0]).map((r) => r[0]), Array.from({ length: 10 }, (_, k) => `F${k}`));
  const a: number[] = [], c: number[] = [];
  for (let r = 0; r < 5; r++) { a.push(timed(() => chem.importStructure(without))); c.push(timed(() => chem.importStructure(withItems))); }
  assert.ok(median(c) <= median(a) * 1.25 + 20, `${count} records open in ${median(c).toFixed(0)} ms with fields, ${median(a).toFixed(0)} ms without`);
  console.log(`datafields.check: SDF export ${took.toFixed(0)} ms; ${count} records open in ${median(c).toFixed(0)} ms with fields, ${median(a).toFixed(0)} ms without`);
}
console.log("datafields.check: ok");
