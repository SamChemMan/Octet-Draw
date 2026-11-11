// Run: node src/compound.check.ts. A compound written as changes to an earlier compound (compound.ts and its place in
// the AI apps' tools, mcp.ts; docs/plans/mcp-v2.md section 4; test plan C1 to C4 and C12), with no window
// (scripts/headless) and Indigo as the app runs it. Each change kind on substrates of different kinds: the result's
// InChIKey and CIP labels against a SMILES written by hand. Then what a reply says of a stereocentre, map numbers kept
// and never written, the refusals, each tool that takes a compound, the layout kept, Nicolaou's taxol route in the
// new form, and the time against reading the same compounds from SMILES.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

if (!existsSync(new URL("./vendor/opsin/opsin.js", import.meta.url))) { console.log("compound.check: skipped (no OPSIN build)"); process.exit(0); }
const { load, drawing } = await import("../scripts/headless/host.ts");
const { handle } = await import("./mcp.ts");
const { change, tagged } = await import("./compound.ts");
const { parseStructure, stereoLabels, toInchiKey, expandLabels } = await import("./chem.ts");
const { fragments, pickAtoms } = await import("./edit.ts");
type Mol = import("./render.ts").Mol;
await load();

let d = drawing(), n = 0;
const call = async (name: string, args: unknown) => JSON.parse(await handle(JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }), () => d.host, "1", { client: "Check" })).result;
const said = (r: { content: { text: string }[] }) => r.content[0].text.split("\n")[0];
// (In full: the default read is a summary, with no SMILES or InChIKey. Plan section 10.)
const reading = async () => (await call("read", { detail: "full" })).structuredContent;
// The structure with a compound number, as it is drawn.
const numbered = (number: string): Mol => {
  const m = d.host.doc(), under = m.captions!.find((c) => c.bold && c.text === number)!.under!;
  return pickAtoms(m, fragments(m).find((g) => g.includes(under[0]))!);
};
// A structure's CIP labels (R, S, E, Z), sorted.
const cip = (m: Mol) => { const l = stereoLabels(m); return [...(l?.atoms ?? []), ...(l?.bonds ?? [])].filter(Boolean).sort().join(""); };
const keyOf = (smiles: string) => toInchiKey(parseStructure(smiles));

// ---- Each change kind (C1), with every centre's label (C2) ----

// open: the result has a double bond drawn with no E or Z (a SMILES read by Octet is laid out with one), so only the
// atoms and bonds of want are compared, and the result has no stereo.
// The sentence with no word on either compound (it names no compound: a short result says only what Octet read
// another way, and each compound's note).
const QUIET = /^Drew 2 structures in 1 row of 2\. One undo step\.$/;
type Row = { what: string; from: string; labels?: string[]; changes: object[]; want: string; says?: RegExp; open?: true };
const TABLE: Row[] = [
  // Protecting groups on alcohols and polyols.
  { what: "a silyl ether written as a label, taken off", from: "C[C@H](*)CCO", labels: ["OTBS"], changes: [{ swap: { OTBS: "OH" } }], want: "C[C@H](O)CCO" },
  { what: "a silyl ether drawn atom by atom, swapped by its label", from: "OC[C@@H](O)CO[Si](C)(C)C(C)(C)C", changes: [{ swap: { OTBS: "OBn" } }], want: "OC[C@@H](O)COCc1ccccc1" },
  { what: "the second of two hydroxyls", from: "C[C@H](O)C[C@H](O)CC", changes: [{ swap: { OH: "OAc" }, occurrence: 2 }], want: "C[C@H](O)C[C@H](OC(C)=O)CC" },
  { what: "two hydroxyls by their atoms' numbers", from: "C[C@H:2](O)C[C@H:4](O)CC", changes: [{ at: "2", set: "OTBS" }, { at: "4", set: "OBn" }], want: "C[C@H](O[Si](C)(C)C(C)(C)C)C[C@H](OCc1ccccc1)CC" },
  { what: "a sugar's primary hydroxyl", from: "CO[C@H]1O[C@H]([CH2:6]O)[C@@H](O)[C@H](O)[C@H]1O", changes: [{ at: "C6", set: "OTr" }], want: "CO[C@H]1O[C@H](COC(c2ccccc2)(c2ccccc2)c2ccccc2)[C@@H](O)[C@H](O)[C@H]1O" },
  { what: "a label named as the place", from: "*[C@H]1CC[C@@H](*)CC1", labels: ["OTBS", "OBn"], changes: [{ at: "OBn", set: "OH" }], want: "O[C@H]1CC[C@@H](O[Si](C)(C)C(C)(C)C)CC1" },
  { what: "one of an atom's two groups, by swap with at", from: "C[C@H:2](O)[C:1](=O)OC", changes: [{ at: "1", swap: { OMe: "OH" } }], want: "C[C@H](O)C(=O)O" },
  { what: "the hydroxyl on one of two atoms alike, by swap with at", from: "C[C:1](C)(O)C[C:2](C)(O)C", changes: [{ at: "2", swap: { OH: "OAc" } }], want: "CC(C)(O)CC(C)(C)OC(C)=O" },
  // Amines.
  { what: "an amine protected", from: "N[C@@H](Cc1ccccc1)C(=O)OC", changes: [{ swap: { NH2: "NHBoc" } }], want: "CC(C)(C)OC(=O)N[C@@H](Cc1ccccc1)C(=O)OC" },
  { what: "a carbamate off a ring nitrogen", from: "CC(C)(C)OC(=O)[N:1]1CCC[C@H]1C(=O)O", changes: [{ at: "1", remove: true }], want: "N1CCC[C@H]1C(=O)O" },
  { what: "one carbamate for another", from: "O=C(OCc1ccccc1)NCC(=O)O", changes: [{ swap: { Cbz: "Fmoc" } }], want: "O=C(OCC1c2ccccc2-c2ccccc21)NCC(=O)O" },
  { what: "an acyl group added to an amine", from: "[NH2:1]c1ccccc1", changes: [{ at: "1", add: "Ac" }], want: "CC(=O)Nc1ccccc1" },
  { what: "an azide reduced", from: "[N-]=[N+]=NCc1ccccc1", changes: [{ swap: { N3: "NH2" } }], want: "NCc1ccccc1" },
  // Acids.
  { what: "an acid to its methyl ester", from: "C[C@H](c1ccc(CC(C)C)cc1)C(=O)O", changes: [{ swap: { CO2H: "CO2Me" } }], want: "C[C@H](c1ccc(CC(C)C)cc1)C(=O)OC" },
  { what: "an ester hydrolysed", from: "COC(=O)c1ccccc1O", changes: [{ swap: { OMe: "OH" } }], want: "OC(=O)c1ccccc1O" },
  { what: "an ester reduced, by its label", from: "CCOC(=O)[C@@]1(C)CCCC[C@H]1O", changes: [{ swap: { CO2Et: "CH2OH" } }], want: "OC[C@@]1(C)CCCC[C@H]1O" },
  // Oxidation levels, written as set.
  { what: "a ring alcohol to its ketone", from: "CC(C)[C@@H]1CC[C@@H](C)C[C@H:1]1O", changes: [{ at: "1", set: "=O" }], want: "CC(C)[C@@H]1CC[C@@H](C)CC1=O", says: /Atom 1 is no longer a stereocentre/ },
  { what: "a primary alcohol to its aldehyde", from: "O[CH2:1][C@@H](C)CC", changes: [{ at: "1", set: "=O" }], want: "O=C[C@@H](C)CC" },
  { what: "a ketone to its alcohol", from: "C[C@H](Cl)[C:1](=O)CC", changes: [{ at: "1", set: "OH" }], want: "C[C@H](Cl)C(O)CC", says: /Atom 1 is now a stereocentre with no configuration/ },
  { what: "an aldehyde to its acid", from: "O=[CH:1]c1ccccc1", changes: [{ at: "1", add: "OH" }], want: "OC(=O)c1ccccc1" },
  { what: "an alcohol to its bromide", from: "C[C@@H:1](O)c1ccccc1", changes: [{ at: "1", set: "Br" }], want: "C[C@@H](Br)c1ccccc1", says: /Atom 1 keeps its configuration/ },
  { what: "a nitro group reduced", from: "[O-][N+](=O)c1ccc(C)cc1", changes: [{ swap: { NO2: "NH2" } }], want: "Nc1ccc(C)cc1" },
  { what: "a halide on an atom with no other bond", from: "[CH3:1]Br", changes: [{ at: "1", set: "OH" }], want: "CO" },
  { what: "a nitrile reduced", from: "N#Cc1ccccc1", changes: [{ swap: { CN: "CH2NH2" } }], want: "NCc1ccccc1" },
  // Groups added and removed: rings, chains, stereocentres.
  { what: "a group added to an aromatic ring", from: "Cc1cc[cH:4]cc1", changes: [{ at: "4", add: "Br" }], want: "Cc1ccc(Br)cc1" },
  { what: "a group swapped for a hydrogen, with no word on it", from: "Cc1ccc(Br)cc1", changes: [{ swap: { Br: "H" } }], want: "Cc1ccccc1", says: QUIET },
  { what: "a group removed from an aromatic ring", from: "Cc1cc[c:4](Br)cc1", changes: [{ at: "4", remove: true }], want: "Cc1ccccc1" },
  { what: "a group added at a chain's end", from: "CCCC[CH3:1]", changes: [{ at: "1", add: "Br" }], want: "CCCCCBr" },
  { what: "a group removed from a chain", from: "CC(C)[CH:1](O)CC", changes: [{ at: "1", remove: true }], want: "CC(C)CCC" },
  { what: "a group added at a stereocentre", from: "C[C@H:1](CC)c1ccccc1", changes: [{ at: "1", add: "OH" }], want: "C[C@](O)(CC)c1ccccc1", says: /Atom 1 keeps its configuration/ },
  { what: "a group in the place of a hydrogen drawn on a stereocentre", from: "[H][C@:1](C)(CC)c1ccccc1", changes: [{ at: "1", add: "OH" }], want: "O[C@](C)(CC)c1ccccc1" },
  { what: "a group added at a ring stereocentre", from: "CC[C@]1(C)CC[C@H:2](O)CC1=O", changes: [{ at: "2", add: "CH3" }], want: "CC[C@]1(C)CC[C@](C)(O)CC1=O" },
  { what: "a group removed from a stereocentre that stays one", from: "C[C@:7](O)(CC)c1ccccc1", changes: [{ at: "7", remove: true }], want: "C[C@H](CC)c1ccccc1", says: /Atom 7 keeps its configuration: its label is now R \(was S\)/ },
  { what: "a group removed from a stereocentre that goes", from: "C[C@H:7](O)CC", changes: [{ at: "7", remove: true }], want: "CCCC", says: /Atom 7 is no longer a stereocentre/ },
  // Double bonds, with E and Z.
  { what: "an E alkene beside a change", from: "C/C=C/[C@H:1](O)C", changes: [{ at: "1", set: "OAc" }], want: "C/C=C/[C@H](OC(C)=O)C" },
  { what: "a Z alkene away from a change", from: "C/C=C\\CC[CH2:1]O", changes: [{ at: "1", set: "=O" }], want: "C/C=C\\CCC=O" },
  { what: "an alkene hydrogenated", from: "C/[CH:1]=[CH:2]/c1ccccc1", changes: [{ bond: "1-2", to: "single" }], want: "CCCc1ccccc1" },
  { what: "an alkene made at a chain's end", from: "CC(C)[CH2:1][CH3:2]", changes: [{ bond: "1-2", to: "double" }], want: "CC(C)C=C" },
  { what: "an alkyne to an alkene", from: "C[C:1]#[CH:2]", changes: [{ bond: "1-2", to: "double" }], want: "CC=C" },
  { what: "an alkene to an alkyne", from: "c1ccccc1[CH:1]=[CH2:2]", changes: [{ bond: "1-2", to: "triple" }], want: "c1ccccc1C#C" },
  { what: "a ring alkene made, a Z alkene kept", from: "C/C=C\\[C@H]1CC[CH2:1][CH2:2]C1=O", changes: [{ bond: "1-2", to: "double" }], want: "C/C=C\\[C@H]1CCC=CC1=O" },
  { what: "a ketone to an alkene that can be E or Z", from: "C[C:1](=O)CC", changes: [{ at: "1", set: "=CHCH3" }], want: "CC(CC)=CC", open: true, says: /The new double bond from atom 1 to CHCH3 is drawn with no E or Z: to set one, give the compound as text/ },
  { what: "a ketone to an alkene that cannot", from: "C[C:1](=O)C", changes: [{ at: "1", set: "=CHCH3" }], want: "CC(C)=CC", says: QUIET },
  { what: "a ring ketone to an alkene that cannot", from: "C1CCCC[C:1]1=O", changes: [{ at: "1", set: "=CHPh" }], want: "C1CCCCC1=Cc1ccccc1", says: QUIET },
  { what: "an aldehyde to its oxime", from: "CC[CH:1]=O", changes: [{ at: "1", set: "=NOH" }], want: "CCC=NO", open: true, says: /to NOH is drawn with no E or Z/ },
  // Charged compounds and metals.
  { what: "an N-oxide to its amine, with no charge left", from: "C[N+:1](C)(C)[O-]", changes: [{ at: "1", remove: true }], want: "CN(C)C" },
  { what: "a sulfoxide to its sulfide", from: "C[S+:1]([O-])c1ccccc1", changes: [{ at: "1", remove: true }], want: "CSc1ccccc1" },
  { what: "an ammonium ion", from: "C[N+](C)(C)CCO", changes: [{ swap: { OH: "OAc" } }], want: "C[N+](C)(C)CCOC(C)=O" },
  { what: "a pyridinium ion", from: "C[n+]1ccc(cc1)[CH2:1]O", changes: [{ at: "1", set: "=O" }], want: "C[n+]1ccc(cc1)C=O" },
  { what: "one chloride of a palladium complex", from: "Cl[Pd](Cl)([P](c1ccccc1)(c1ccccc1)c1ccccc1)[P](c1ccccc1)(c1ccccc1)c1ccccc1", changes: [{ swap: { Cl: "OAc" }, occurrence: 1 }], want: "CC(=O)O[Pd](Cl)([P](c1ccccc1)(c1ccccc1)c1ccccc1)[P](c1ccccc1)(c1ccccc1)c1ccccc1" },
  { what: "a Grignard reagent's halide", from: "Br[Mg]c1ccccc1", changes: [{ swap: { Br: "Cl" } }], want: "Cl[Mg]c1ccccc1" },
  { what: "a stannane to an iodide", from: "CCCC[Sn](CCCC)(CCCC)c1ccc(C)cc1", changes: [{ swap: { SnBu3: "I" } }], want: "Ic1ccc(C)cc1" },
  { what: "a boronic acid to a bromide", from: "OB(O)c1ccc(C)cc1", changes: [{ swap: { "B(OH)2": "Br" } }], want: "Brc1ccc(C)cc1" },
];
assert.ok(TABLE.length >= 25);
for (const row of TABLE) {
  d = drawing();
  const r = await call("draw", { kind: "structures", structures: [{ text: row.from, ...(row.labels ? { labels: row.labels } : {}), number: "1" }, { from: "1", changes: row.changes, number: "2" }] });
  assert.ok(!r.isError, `${row.what}: ${said(r)}`);
  const got = (await reading()).structures.find((s: { number: string }) => s.number === "2");
  assert.equal(got.inchiKey, row.open ? `${keyOf(row.want).slice(0, 14)}-UHFFFAOYSA-N` : keyOf(row.want), `${row.what}: drew ${got.smiles}, not ${row.want}`);
  assert.equal(cip(numbered("2")), row.open ? "" : cip(parseStructure(row.want)), `${row.what}: the CIP labels of ${row.want}`);
  if (row.says) assert.match(said(r), row.says, row.what);
}

// ---- Stereo kept at every centre a change does not touch (C2), and said where it does (C3) ----

// A steroid with seven centres: a change at C17's hydroxyl or at C3's ketone leaves each other centre's label, atom
// for atom (no atom moves, so an atom is found again by its place).
{
  const from = tagged(parseStructure("C[C@]12CC[C@H]3[C@@H](CCC4=C[C:3](=O)CC[C@]34C)[C@@H]1CC[C@@H:17]2O"));
  const then = stereoLabels(from)!, place = (a: Mol["atoms"][number]) => a.location.slice(0, 2).map((v) => v.toFixed(3)).join(" ");
  const before = new Map(from.atoms.map((a, i) => [place(a), then.atoms[i]]));
  assert.equal(then.atoms.filter(Boolean).length, 6);
  for (const [changes, touched] of [[[{ at: "17", set: "OAc" }], 1], [[{ at: "17", set: "=O" }], 1], [[{ at: "3", set: "OH" }], 0], [[{ swap: { OH: "OTBS" } }], 1]] as const) {
    const out = change(from, [...changes]);
    assert.ok(typeof out !== "string", String(out));
    const now = stereoLabels(out.mol)!, at17 = out.mol.atoms.findIndex((a) => a.tag === 17);
    out.mol.atoms.forEach((a, i) => { if (i !== at17 && before.get(place(a))) assert.equal(now.atoms[i], before.get(place(a)), `a centre away from ${JSON.stringify(changes)}`); });
    // Each centre a change touched is spoken of, and no other.
    assert.equal(out.notes.filter((t) => /Atom 17 /.test(t)).length, touched, out.notes.join(" "));
    assert.ok(out.notes.every((t) => /^Atom (17|3) /.test(t)), out.notes.join(" "));
  }
  // The new centre at C3 has no configuration, and the reply says how to give one.
  assert.match((change(from, [{ at: "3", set: "OH" }]) as { notes: string[] }).notes.join(" "), /Atom 3 is now a stereocentre with no configuration: to set one, give the compound as text/);
}
// A centre away from a change keeps its wedges, so nothing is said of it, though its label changes with its groups'
// priorities (CH2Br is before CH2OH, and CH2CH3 after it).
{
  d = drawing();
  const r = await call("draw", { kind: "structures", structures: [{ text: "OC[C@H](C)CBr", number: "1" }, { from: "1", changes: [{ swap: { Br: "CH3" } }], number: "2" }] });
  assert.ok(!r.isError && !/stereocentre|configuration/.test(said(r)), said(r));
  assert.notEqual(cip(numbered("2")), cip(numbered("1")));
  assert.equal((await reading()).structures[1].inchiKey, keyOf("OC[C@H](C)CC"));
}
// Every tool's reply says it (C3): edit with changes says what replace says, with the new structure's id.
{
  d = drawing();
  assert.ok(!(await call("draw", { kind: "structures", structures: [{ text: "C[C@H:7](Br)CC", number: "1" }] })).isError);
  assert.match(said(await call("change", { operations: [{ op: "edit", ids: ["s1"], changes: [{ at: "7", set: "=O" }] }] })), /^Changed s1: changes\. Replaced s1 with butan-2-one \[Atom 7 is no longer a stereocentre\.\], now s2, which keeps its number 1\. One undo step\./);
  d = drawing();
  assert.ok(!(await call("draw", { kind: "structures", structures: [{ text: "C[C@H:7](Br)CC", number: "1" }] })).isError);
  assert.match(said(await call("change", { operations: [{ op: "replace", structure: "s1", changes: [{ at: "7", set: "OH" }] }] })), /^Replaced s1 with \(2S\)-butan-2-ol \[Atom 7 keeps its configuration \(S\)\.\], now s2, which keeps its number 1\./);
}
// A new group Octet cannot read is drawn as a label with no structure, as a chemist's own label is, and the reply says
// so: it may be a slip (C12). A generic group (R) is one on purpose, and a group Octet reads needs no word.
{
  d = drawing();
  const r = await call("draw", { kind: "structures", structures: [{ text: "CCO", number: "1" }, { from: "1", changes: [{ swap: { OH: "OTBDSP" } }], number: "2" }, { from: "1", changes: [{ swap: { OH: "R" } }], number: "3" }, { from: "1", changes: [{ swap: { OH: "OTBDPS" } }], number: "4" }] });
  assert.ok(!r.isError, said(r));
  assert.match(said(r), /\(2\) \[Octet cannot read OTBDSP as a group: it is drawn as a label with no structure\.\]/);
  assert.ok(!/\((3|4)\) \[/.test(said(r)), said(r));
}
// A numbered atom written with no hydrogens ([C:7]) is a radical in SMILES: the reply says so. One with its hydrogens,
// or with all its bonds, is as it was meant.
{
  d = drawing();
  const r = await call("draw", { kind: "structures", structures: [{ text: "CC[C:7]O", number: "1" }, { text: "CC[CH2:7]O", number: "2" }, { text: "C[C:7](C)(C)O", number: "3" }] });
  assert.match(said(r), /\(1\) \[As written, atom 7 is a radical: a numbered atom needs its hydrogens \(\[CH2:7\]\)\.\]/);
  assert.ok(!/\((2|3)\) \[/.test(said(r)), said(r));
}
// A group removed from a stereocentre whose only wedge was the group's bond: a hydrogen stays there with the wedge,
// so the centre keeps its configuration. (The same alcohol, redrawn with its wedge on the C-O bond.)
{
  const read = tagged(parseStructure("C[C@:7](O)(CC)C(C)C")), label = stereoLabels(read)!.atoms[1];
  const onOH = [1, 6].map((stereo) => ({ ...read, bonds: read.bonds.map((b) => { const { stereo: _, ...plain } = b; return b.atoms.includes(1) && b.atoms.includes(2) ? { ...plain, atoms: [1, 2] as [number, number], stereo } : plain; }) })).find((x) => stereoLabels(x)?.atoms[1] === label)!;
  assert.equal(toInchiKey(onOH), keyOf("C[C@](O)(CC)C(C)C"));
  const out = change(onOH, [{ at: "7", remove: true }]);
  assert.ok(typeof out !== "string", String(out));
  assert.equal(toInchiKey(out.mol), keyOf("C[C@H](CC)C(C)C"));
  assert.ok(out.mol.atoms.some((a) => a.label === "H") && out.mol.bonds.filter((b) => b.stereo).length === 1, "the hydrogen is drawn, on the wedge");
  assert.match(out.notes.join(" "), /^Atom 7 keeps its configuration/);
}
// A centre that goes loses its wedge, wherever the wedge was. (Butan-2-ol with its wedge on the bond to its methyl.)
{
  const read = tagged(parseStructure("C[C@H:7](O)CC")), label = stereoLabels(read)!.atoms[1];
  const onMethyl = [1, 6].map((stereo) => ({ ...read, bonds: read.bonds.map((b) => { const { stereo: _, ...plain } = b; return b.atoms.includes(1) && b.atoms.includes(0) ? { ...plain, atoms: [1, 0] as [number, number], stereo } : plain; }) })).find((x) => stereoLabels(x)?.atoms[1] === label)!;
  const out = change(onMethyl, [{ at: "7", set: "=O" }]);
  assert.ok(typeof out !== "string" && toInchiKey(out.mol) === keyOf("CC(=O)CC") && out.mol.bonds.every((b) => !b.stereo), "no wedge is left");
}
// An alkyne's atoms are in a line: as an alkene, they stand at 120°.
{
  const out = change(tagged(parseStructure("CC[C:1]#[CH:2]")), [{ bond: "1-2", to: "double" }]) as { mol: Mol };
  const [p, c, q] = [1, 2, 3].map((i) => out.mol.atoms[i].location), angle = (Math.atan2(p[1] - c[1], p[0] - c[0]) - Math.atan2(q[1] - c[1], q[0] - c[0])) * 180 / Math.PI;
  assert.ok(Math.abs(Math.abs(((angle + 540) % 360) - 180) - 120) < 1, `the angle at the alkene is ${angle}`);
  // A mark placed by hand on an atom that turns, turns with it (edit.ts bend, as the bond tool's own turn).
  const marked = tagged(parseStructure("CC[C:1]#[CH:2]"));
  marked.atoms[3] = { ...marked.atoms[3], angles: { charge: 10 } };
  const turned = (change(marked, [{ bond: "1-2", to: "double" }]) as { mol: Mol }).mol.atoms[3];
  assert.ok(Math.hypot(turned.location[0] - out.mol.atoms[3].location[0], turned.location[1] - out.mol.atoms[3].location[1]) < 1e-9 && Math.abs(Math.abs(turned.angles!.charge - 10) - 60) < 1e-6, JSON.stringify(turned));
}
// An azide's label is N3, not atom 3; C7 is atom 7.
{
  const azide = tagged(parseStructure("[N-]=[N+]=N[CH2:7]c1ccccc1"));
  for (const changes of [[{ at: "N3", set: "NH2" }], [{ at: "C7", set: "NH2" }], [{ at: "7", set: "NH2" }]]) {
    const out = change(azide, changes);
    assert.ok(typeof out !== "string" && toInchiKey(expandLabels(out.mol)) === keyOf("NCc1ccccc1"), JSON.stringify(changes));
  }
}

// ---- Map numbers (C4): kept through every change, never drawn, never written to a file ----

{
  const FORMATS = ["cdxml", "mol", "mol2000", "sdf", "smiles", "inchi", "cdx"];
  const files = async (text: string) => {
    d = drawing();
    assert.ok(!(await call("draw", { kind: "structures", structures: [{ text, number: "1" }] })).isError);
    const out: string[] = [];
    for (const format of FORMATS) out.push((await call("read", { format })).structuredContent.text);
    return out;
  };
  const plain = await files("C[C@H](O)CC(=O)OC");
  assert.deepEqual(await files("C[C@H:10](O)[CH2:11][C:12](=O)OC"), plain, "a file is the same with map numbers and without");
  // (The mapped drawing is the one still open.) No atom has a map number to draw: the numbers are tags.
  assert.ok(d.host.doc().atoms.every((a) => a.map === undefined));
  assert.deepEqual(d.host.doc().atoms.flatMap((a) => (a.tag ? [a.tag] : [])), [10, 11, 12]);
  assert.ok((await reading()).structures.every((x: { smiles: string }) => !/:\d/.test(x.smiles)), "a reading's SMILES has no map numbers");
  // A later call names the atoms still, through three compounds, each from the one before.
  const r = await call("draw", { kind: "reaction", start: [{ from: "1", changes: [{ at: "10", set: "OTBS" }], number: "2" }], steps: [{ products: [{ from: "previous", changes: [{ swap: { CO2Me: "CHO" } }], number: "3" }] }, { products: [{ from: "3", changes: [{ at: "10", set: "OH" }, { at: "11", add: "Br" }], number: "4" }] }] });
  assert.ok(!r.isError, said(r));
  const now = await reading(), key = (number: string) => now.structures.find((s: { number: string }) => s.number === number).inchiKey;
  assert.deepEqual([key("2"), key("3"), key("4")], ["C[C@H](O[Si](C)(C)C(C)(C)C)CC(=O)OC", "C[C@H](O[Si](C)(C)C(C)(C)C)CC=O", "C[C@H](O)C(Br)C=O"].map(keyOf));
  for (const format of FORMATS) assert.ok(!/:1[012]\]|\sAtomNumber=/.test((await call("read", { format })).structuredContent.text), `${format} has no map number`);
  // add_file is not a compound: a SMILES it reads keeps its map numbers as a reaction's, drawn as before.
  d = drawing();
  assert.ok(!(await call("advanced", { tool: "add_file", args: { text: "C[CH2:3]O" } })).isError);
  assert.deepEqual(d.host.doc().atoms.map((a) => [a.map, a.tag]), [[undefined, undefined], [3, undefined], [undefined, undefined]]);
}

// ---- Refusals (C12): Octet says what it found, guesses nothing, draws nothing ----

{
  const refuse = async (from: object, changes: unknown, why: RegExp, more: object = {}) => {
    d = drawing();
    const r = await call("draw", { kind: "structures", structures: [{ ...from, number: "1" }, { from: "1", changes, number: "2", ...more }] });
    assert.ok(r.isError, `${JSON.stringify(changes)} is refused`);
    assert.match(said(r), why);
    assert.equal(d.host.doc().atoms.length, 0, "a refused call draws nothing");
  };
  const lactate = { text: "C[C@H:2](O)[C:1](=O)OC" };
  // An atom with more than one group: both are named.
  await refuse(lactate, [{ at: "1", set: "OH" }], /atom 1 carries 2 groups \(=O, OC\): name the one to change with swap/);
  await refuse({ text: "C[C:1](C)(C)c1ccccc1" }, [{ at: "1", remove: true }], /atom 1 carries 4 groups/);
  // An atom with none.
  await refuse({ text: "C[CH2:1]C1CCCCC1" }, [{ at: "1", set: "OH" }], /atom 1 carries 2 groups/);
  await refuse({ text: "C1CC[CH2:1]CC1" }, [{ at: "1", set: "OH" }], /atom 1 carries no group: add puts a new one on it/);
  await refuse({ text: "CC[OH:1]" }, [{ at: "1", remove: true }], /atom 1 carries no group/);
  // The part on an atom that is larger than the part that stays may not be the group the AI app means (the phenyl of
  // anisole on its methyl's carbon, the benzoate on an ethyl's): both sides are named.
  await refuse({ text: "[CH3:1]Oc1ccccc1" }, [{ at: "1", set: "OH" }], /the part on atom 1 \(OC1C=CC=CC=1\) is larger than the part that stays \(C\), so it may not be the group you mean: name the group to change with swap/);
  await refuse({ text: "C[CH2:1]OC(=O)c1ccccc1" }, [{ at: "1", set: "OH" }], /the part on atom 1 \(OC\(C1C=CC=CC=1\)=O\) is larger than the part that stays \(CC\)/);
  await refuse({ text: "C[CH2:1]OC(=O)c1ccccc1" }, [{ at: "1", remove: true }], /is larger than the part that stays \(CC\)/);
  // A label that is there twice, or not there: the places are listed.
  await refuse({ text: "*C1CCC(*)CC1", labels: ["OTBS", "OTBS"] }, [{ swap: { OTBS: "OH" } }], /there are 2 OTBS \(on atom #1, atom #4\): say which with occurrence \(1 to 2/);
  await refuse({ text: "*C1CCC(*)CC1", labels: ["OTBS", "OTBS"] }, [{ swap: { OTBS: "OH" }, occurrence: 3 }], /there are 2 OTBS, so no occurrence 3/);
  await refuse({ text: "*C1CCC(*)CC1", labels: ["OTBS", "OBn"] }, [{ swap: { OTES: "OH" } }], /there is no OTES\. This compound has no atom numbers and the labels OTBS, OBn/);
  await refuse(lactate, [{ at: "OBn", set: "OH" }], /there is no OBn\. This compound has the atom numbers 1, 2/);
  // A map number that is not there, or there twice.
  await refuse(lactate, [{ at: "7", set: "OH" }], /there is no atom numbered 7\. This compound has the atom numbers 1, 2/);
  await refuse({ text: "C[CH2:1][CH2:1]O" }, [{ at: "1", set: "Br" }], /2 atoms have the number 1/);
  await refuse(lactate, [{ at: "N2", set: "OH" }], /atom 2 is C, not N/);
  // A change that breaks valence.
  await refuse({ text: "C[C:1](C)(C)O" }, [{ at: "1", add: "Br" }], /The changes break valence: .*5 bonds/);
  await refuse({ text: "C[C:1](C)(C)O" }, [{ at: "1", set: "=O" }], /The changes break valence/);
  await refuse({ text: "C[C:1](C)=[CH:2]C" }, [{ bond: "1-2", to: "triple" }], /The changes break valence/);
  // A new double bond that could be E or Z, and a bond that is not there.
  await refuse({ text: "C[CH2:1][CH2:2]C" }, [{ bond: "1-2", to: "double" }], /The new double bond between atom 1 and atom 2 can be E or Z, and a change cannot say which: give the compound as text/);
  await refuse({ text: "C[C:1]#[C:2]C" }, [{ bond: "1-2", to: "double" }], /can be E or Z/);
  await refuse({ text: "C[CH2:1]C[CH2:2]O" }, [{ bond: "1-2", to: "double" }], /atom 1 and atom 2 are not bonded\. A change cannot make or break a ring or a chain/);
  // A label on a double bond that Octet reads as on a single bond, with another structure (no C=O).
  await refuse({ text: "CC[CH:1]=O" }, [{ at: "1", set: "=CHCO2Et" }], /Octet cannot read CHCO2Et on a double bond: give the compound as text/);
  await refuse({ text: "CC[CH:1]=O" }, [{ at: "1", set: "=CHCN" }], /Octet cannot read CHCN on a double bond/);
  // A numbered atom with no hydrogens written is a radical, so a group more breaks its valence: the refusal says why.
  await refuse({ text: "C1CC[N:1]CC1" }, [{ at: "1", add: "Ac" }], /The changes break valence: .*A numbered atom needs its hydrogens in the SMILES/);
  // A key that does not go with the change.
  await refuse(lactate, [{ at: "2", set: "Br", occurrence: 2 }], /occurrence goes with a label that is there more than once, not with an atom's number/);
  await refuse(lactate, [{ at: "2", set: "Br", to: "double" }], /changes\[0\]: to does not go with set/);
  await refuse(lactate, [{ bond: "1-2", to: "single", at: "1" }], /at does not go with bond/);
  await refuse(lactate, [{ at: "OMe", swap: { OMe: "OH" } }], /with swap, at is the number of the atom the group is on/);
  await refuse(lactate, [{ at: "2", swap: { OMe: "OH" } }], /there is no OMe on atom 2\. This compound has the atom numbers 1, 2/);
  // A change that is no change Octet knows, and a group that is none.
  await refuse(lactate, [{ at: "2" }], /changes\[0\]: give one of swap, set, add, remove: true, or bond with to/);
  await refuse(lactate, [{ at: "2", set: "OH", remove: true }], /give one of swap/);
  await refuse(lactate, [{ swap: { OH: 5 } }], /5 is not a group/);
  await refuse(lactate, [{ at: "2", set: "O H" }], /O H is not a group/);
  await refuse(lactate, [{ set: "OH" }], /say where with at/);
  await refuse(lactate, [{ swap: { OH: "OAc" }, occurence: 1 }], /occurence is not part of a change \(swap, occurrence, at, set, add, remove, bond, to\)/);
  await refuse({ text: "C[CH:1]=[CH2:2]" }, [{ bond: "1-2", to: "quadruple" }], /give bond as two atom numbers \('5-6'\) and to \(single, double or triple\)/);
  await refuse({ text: "C[CH:1]=[CH2:2]" }, [{ bond: "1", to: "single" }], /give bond as two atom numbers/);
  await refuse(lactate, [{ at: "OH", add: "Br" }], /add takes an atom's number in at/);
  await refuse(lactate, [{ at: "2", set: "OTBS" }, { at: "2", set: "=O" }, { at: "9", remove: true }], /changes\[2\]: there is no atom numbered 9/);
  await refuse({ text: "CO" }, [{ swap: { OH: "H" } }], /the change leaves nothing of the compound/);
  // from that names nothing, or two things; from with text; changes with no from.
  await refuse(lactate, [], /Compound 2: from: there is no compound 8 earlier in this call or in the drawing/, { from: "8" });
  await refuse(lactate, [], /Give a compound as text, as a molecule, or as from with changes: one of them/, { text: "CCO" });
  await refuse(lactate, [{ at: "2", set: "OH" }], /changes: give from too/, { from: undefined });
  // Two compounds of one call with one number. One compound drawn twice with its number is one.
  d = drawing();
  const both = await call("draw", { kind: "structures", structures: [{ text: "CCO", number: "5" }, { text: "CCN", number: "5" }, { from: "5", number: "6" }] });
  assert.ok(both.isError && !d.host.doc().atoms.length);
  assert.match(said(both), /Compound 6: from: 2 compounds of this call have the number 5, and they are not one compound: give each its own number/);
  const twice = await call("draw", { kind: "structures", structures: [{ text: "CC[CH2:1]O", number: "5" }, { from: "5", number: "5" }, { text: "CC[CH2:1]O", number: "5" }, { from: "5", changes: [{ at: "1", set: "=O" }], number: "6" }] });
  assert.ok(!twice.isError, said(twice));
  assert.equal((await reading()).structures.find((s: { number: string }) => s.number === "6").inchiKey, keyOf("CCC=O"));
  // changes with no from in a figure, and a structure to replace with nothing to replace it with.
  d = drawing();
  assert.match(said(await call("draw", { kind: "figure", panels: [{ rows: [[{ structure: "CCO", number: "1" }, { changes: [{ swap: { OH: "OAc" } }] }]] }] })), /Octet drew nothing\. Compound 2: changes: give from too/);
  assert.ok(!(await call("draw", { kind: "structures", structures: [{ text: "CCO", number: "1" }] })).isError);
  assert.match(said(await call("change", { operations: [{ op: "replace", structure: "s1" }] })), /Give each compound text \(a name or SMILES\), a molecule, or from with changes/);
  d = drawing();
  assert.ok(!(await call("draw", { kind: "structures", structures: [{ text: "CCO", number: "5" }, { text: "CCN", number: "5" }] })).isError);
  const two = await call("draw", { kind: "structures", structures: [{ from: "5", number: "6" }] });
  assert.ok(two.isError);
  assert.match(said(two), /from: 2 structures have the number 5 \(s1, s2\): give the id of one/);
  const first = await call("draw", { kind: "structures", structures: [{ from: "previous", number: "6" }] });
  assert.match(said(first), /from: there is no compound before this one in the call that Octet can read/);
  // The compound before could not be read: the one from it is refused too, and not drawn from the one before that.
  const gap = await call("draw", { kind: "structures", structures: [{ text: "CCO" }, { text: "flurbleglorp" }, { from: "previous" }] });
  assert.ok(gap.isError);
  assert.match(said(gap), /flurbleglorp.*from: there is no compound before this one/);
  // An id takes one of the two.
  const one = await call("draw", { kind: "structures", structures: [{ from: "s2", changes: [{ swap: { NH2: "NHAc" } }], number: "6" }] });
  assert.ok(!one.isError, said(one));
  assert.equal((await reading()).structures.find((s: { number: string }) => s.number === "6").inchiKey, keyOf("CCNC(C)=O"));
}

// ---- Every tool that takes a compound ----

{
  // reaction: previous is the compound before, not a structure drawn over the arrow between them.
  d = drawing();
  let r = await call("draw", { kind: "reaction", start: [{ text: "O[CH2:1]c1ccccc1", number: "1" }], steps: [{ above: ["structure: CS(C)=O"], products: [{ from: "previous", changes: [{ at: "1", set: "=O" }], number: "2" }] }, { products: [{ from: "previous", changes: [{ at: "1", add: "OH" }], number: "3" }] }] });
  assert.ok(!r.isError, said(r));
  let now = await reading();
  assert.deepEqual(["1", "2", "3"].map((k) => now.structures.find((s: { number: string }) => s.number === k).inchiKey), ["OCc1ccccc1", "O=Cc1ccccc1", "OC(=O)c1ccccc1"].map(keyOf));
  // replace and edit: changes alone are made on the structure itself, which keeps its number.
  const id = (number: string) => now.structures.find((s: { number: string }) => s.number === number).id;
  r = await call("change", { operations: [{ op: "replace", structure: id("3"), changes: [{ swap: { OH: "OMe" } }] }] });
  assert.ok(!r.isError, said(r));
  now = await reading();
  assert.equal(now.structures.find((s: { number: string }) => s.number === "3").inchiKey, keyOf("COC(=O)c1ccccc1"));
  r = await call("change", { operations: [{ op: "edit", ids: [id("2")], changes: [{ swap: { "=O": "=CH2" } }] }] });
  assert.ok(!r.isError, said(r));
  now = await reading();
  assert.equal(now.structures.find((s: { number: string }) => s.number === "2").inchiKey, keyOf("C=Cc1ccccc1"));
  assert.equal(now.structures.length, 4);
  r = await call("change", { operations: [{ op: "replace", structure: id("1"), from: id("2"), changes: [{ swap: { "=CH2": "=O" } }] }] });
  assert.equal((await reading()).structures.find((s: { number: string }) => s.number === "1").inchiKey, keyOf("O=Cc1ccccc1"));
  assert.match(said(await call("change", { operations: [{ op: "replace", structure: id("3"), changes: [{ swap: { OBn: "OH" } }] }] })), /Octet changed nothing\. Compound 1: changes\[0\]: there is no OBn/);
  assert.match(said(await call("change", { operations: [{ op: "edit", ids: [`t${d.host.doc().captions!.find((c) => c.bold)!.id}`], changes: [{ swap: { OH: "OMe" } }] }] })), /takes no changes/);
  // A salt by its number, from an earlier call: both ions (its number is under each). The new salt is one compound.
  d = drawing();
  assert.ok(!(await call("draw", { kind: "structures", structures: [{ text: "OCC(=O)[O-].[Na+]", number: "1" }] })).isError);
  r = await call("draw", { kind: "structures", structures: [{ from: "1", changes: [{ swap: { OH: "OBn" } }], number: "2" }] });
  assert.ok(!r.isError, said(r));
  assert.deepEqual((await reading()).structures.filter((s: { number: string }) => s.number === "2").map((s: { inchiKey: string }) => s.inchiKey), [keyOf("[Na+].[O-]C(=O)COCc1ccccc1")]);
  // cycle and figure.
  d = drawing();
  r = await call("draw", { kind: "cycle", intermediates: [{ text: "Cl[Pd](Cl)(*)*", labels: ["L", "L"], number: "1" }, { from: "1", changes: [{ swap: { Cl: "Ph" }, occurrence: 1 }], number: "2" }, { from: "previous", changes: [{ swap: { Cl: "OAc" } }], number: "3" }] });
  assert.ok(!r.isError, said(r));
  assert.deepEqual((await reading()).structures.map((s: { formula: string }) => s.formula).sort(), ["C6H5ClPd", "C8H8O2Pd", "Cl2Pd"]);
  d = drawing();
  r = await call("draw", { kind: "figure", panels: [{ rows: [[{ structure: "CC(=O)Oc1ccccc1C(=O)O", number: "1", caption: "aspirin" }, { from: "1", changes: [{ swap: { OAc: "OH" } }], number: "2", caption: "salicylic acid" }]] }] });
  assert.ok(!r.isError, said(r));
  assert.equal((await reading()).structures.find((s: { number: string }) => s.number === "2").inchiKey, keyOf("Oc1ccccc1C(=O)O"));
  // One undo step takes a call's compounds away, those from others too.
  assert.ok(!(await call("advanced", { tool: "run_command", args: { command: "undo" } })).isError);
  assert.equal(d.host.doc().atoms.length, 0);
}

// ---- With the lenient readings and short replies (plan sections 6 and 10) ----
{
  // A compound from another takes a number as a JSON number and "8 (the ketone)" as number 8 with that caption, as any
  // compound does. Its caption is under its number, and the sentence has its note and names no compound.
  d = drawing();
  let r = await call("draw", { kind: "structures", structures: [{ text: "CC[C@H:7](O)C", number: 7 }, { from: "7", changes: [{ at: "7", set: "=O" }], number: "8 (the ketone)" }] });
  assert.equal(said(r), "Drew 2 structures in 1 row of 2. Octet notes: from 7 (8) [Atom 7 is no longer a stereocentre.]. One undo step.");
  assert.deepEqual(r.content[1].text.split("\n"), ["Read number 7 as text.", "Read number 8 (the ketone) as number 8 with the caption the ketone."]);
  const ketone = () => { const m = d.host.doc(), eight = m.captions!.find((c) => c.bold && c.text === "8")!.under!; return m.captions!.filter((c) => c.under?.some((i) => eight.includes(i))).map((c) => [c.text, !!c.bold]); };
  assert.deepEqual(ketone(), [["8", true], ["the ketone", false]]);
  // replace by changes names the new compound and says what its changes did, and keeps the caption.
  r = await call("change", { operations: [{ op: "replace", structure: "8", changes: [{ swap: { "=O": "=CH2" } }] }] });
  assert.match(said(r), /^Replaced 8 with 2-methylbut-1-ene, now s3, which keeps its number 8 and its caption\. One undo step\./);
  assert.deepEqual(ketone(), [["8", true], ["the ketone", false]]);
}

// ---- The layout kept (L5): a compound from another lies as it does, and only the changed part is new ----

{
  d = drawing();
  const r = await call("draw", { kind: "reaction", start: [{ text: "C[C@H]1C[C@@H:3](O)CC(C)(C)[C@H:1]1C(C)=O", number: "1" }], steps: [{ products: [{ from: "1", changes: [{ at: "3", set: "OTBS" }], number: "2" }] }, { products: [{ from: "2", changes: [{ swap: { COMe: "CO2H" } }], number: "3" }] }] });
  assert.ok(!r.isError, said(r));
  const shape = (m: Mol, tags: number[]) => { const [p, q] = tags.map((t) => m.atoms.find((a) => a.tag === t)!.location); return [q[0] - p[0], q[1] - p[1]].map((v) => v.toFixed(2)).join(" "); };
  const ring = (m: Mol) => { const o = m.atoms.find((a) => a.tag === 1)!.location; return m.atoms.filter((a) => a.label === "C" && !a.text).map((a) => [a.location[0] - o[0], a.location[1] - o[1]].map((v) => v.toFixed(2)).join(" ")).sort().join(","); };
  const [one, two, three] = ["1", "2", "3"].map(numbered);
  assert.equal(shape(two, [1, 3]), shape(one, [1, 3]));
  assert.equal(shape(three, [1, 3]), shape(one, [1, 3]));
  // Every carbon of compound 2 is where it was in compound 1, seen from atom 1; compound 3 has lost only its acetyl's.
  assert.equal(ring(two), ring(one), "no carbon moved");
  assert.ok(ring(three).split(",").every((p) => ring(one).split(",").includes(p)));
  // Changes made on a structure itself (edit, replace) leave every other atom where it is: the structure is
  // not put back by its middle, which moves when a group grows.
  const places = () => d.host.doc().atoms.flatMap((a) => (a.tag === 1 || a.tag === 3 ? [[a.key, a.tag, ...a.location.slice(0, 2).map((v) => v.toFixed(3))].join(" ")] : [])).sort();
  const at = (number: string) => places().filter((p) => p.startsWith(`${numbered(number).atoms[0].key} `)).map((p) => p.replace(/^\d+ /, ""));
  const [was1, was3] = [at("1"), at("3")];
  assert.equal(was1.length, 2);
  assert.match(said(await call("change", { operations: [{ op: "edit", ids: ["1"], changes: [{ at: "3", set: "OTBDPS" }] }] })), /^Changed 1: changes\. Replaced 1 with /);
  assert.deepEqual(at("1"), was1);
  assert.ok(!(await call("change", { operations: [{ op: "replace", structure: "3", from: "3", changes: [{ swap: { CO2H: "CO2CH2CH2SiMe3" } }] }] })).isError);
  assert.deepEqual(at("3"), was3);
  // from with no changes is the same compound again, drawn the same way round.
  assert.ok(!(await call("draw", { kind: "structures", structures: [{ from: "2", number: "2b" }] })).isError);
  assert.equal(ring(numbered("2b")), ring(two));
}

// ---- Nicolaou's taxol route in the new form: every compound is the one the paper has ----

const bench = (f: string) => JSON.parse(readFileSync(new URL(`../scripts/mcp-bench/taxol/${f}.json`, import.meta.url), "utf8"));
const route = bench("route"), FULL: Record<string, string> = bench("structures");
{
  d = drawing();
  let chained = 0, all = 0;
  for (const { start, steps } of route.schemes) {
    for (const c of [...start, ...steps.flatMap((s: { products: object[] }) => s.products)]) { all++; if ("from" in c) chained++; }
    const r = await call("draw", { kind: "reaction", start, steps });
    assert.ok(!r.isError, said(r));
  }
  assert.deepEqual([chained, all], [9, 21]);
  const drawn = (await reading()).structures as { number?: string; inchiKey: string }[];
  for (const [number, smiles] of Object.entries(FULL)) {
    if (number === "20") continue; // the β-lactam is a reagent over the last arrow
    const got = drawn.filter((s) => s.number === number);
    assert.ok(got.length >= 1 && got.every((s) => s.inchiKey === keyOf(smiles)), `taxol route: compound ${number}`);
  }
  // 7 and 13 end one scheme and start the next: each is drawn twice, the second from the first.
  assert.deepEqual(["7", "13"].map((k) => drawn.filter((s) => s.number === k).length), [2, 2]);
}

// ---- Time: a compound from another costs no more than the same compound read from SMILES ----

{
  // Each chained compound of the route (as drawn above) made from the compound it is from, and read from its SMILES.
  // Each round has the source a little larger, so no stereo reading is kept from the round before: both ways do all
  // their work each time. The whole of each way, the best of three rounds.
  const h = d.host, chained = route.schemes.flatMap(({ start, steps }: { start: object[]; steps: { products: object[] }[] }) => [...start, ...steps.flatMap((s) => s.products)]).filter((c: { changes?: object[] }) => c.changes) as { from: string; changes: never; number: string }[];
  let fromSmiles = Infinity, fromChanges = Infinity;
  for (let round = 1; round <= 3; round++) {
    const grown = (m: Mol): Mol => ({ ...m, atoms: m.atoms.map((a) => ({ ...a, location: [a.location[0] * (1 + round / 500), a.location[1] * (1 + round / 500), 0] as [number, number, number] })) });
    let a = 0, b = 0;
    for (const c of chained) {
      const source = grown(numbered(c.from)), t0 = performance.now(), out = change(source, c.changes), t1 = performance.now();
      assert.ok(typeof out !== "string" && toInchiKey(expandLabels(out.mol)) === keyOf(FULL[c.number]), `compound ${c.number}`);
      const t2 = performance.now();
      assert.ok(h.structure(FULL[c.number]));
      a += t1 - t0; b += performance.now() - t2;
    }
    fromChanges = Math.min(fromChanges, a); fromSmiles = Math.min(fromSmiles, b);
  }
  assert.ok(fromChanges <= fromSmiles, `from changes ${fromChanges.toFixed(1)} ms, from SMILES ${fromSmiles.toFixed(1)} ms`);
  if (process.argv.includes("--time")) console.log(`compound.check: the route's ${chained.length} compounds with changes: from the compound before ${fromChanges.toFixed(1)} ms, from SMILES ${fromSmiles.toFixed(1)} ms`);
}
console.log("compound.check: ok");
